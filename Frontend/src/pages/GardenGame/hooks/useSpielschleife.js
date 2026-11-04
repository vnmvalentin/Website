// hooks/useSpielschleife.js
// Spielschleife: Renderer und Tastatur anlegen, Figur bewegen (Kachel-Sprünge, Kollision),
// nächstes Ziel für die E-Taste bestimmen, Bewegung an die Lobby melden, jedes Bild zeichnen.
// Ausgelagert aus GameContainer.jsx, Code unverändert.
import { useEffect } from "react";
import InputHandler from "../engine/InputHandler";
import Renderer from "../engine/Renderer";
import {
    TARGET_FPS, COLLISION_RADIUS_BY_AREA_TYPE, FRUEHES_ABBIEGEN_AB, INTERACT_DIST,
    berechneGebaeudePositionen, FREMDE_GEBAEUDE, AREA_IMAGES, MAILBOX_INTERACT_DIST,
} from "../engine/gameConstants";
import { TILE_SIZE, MAP_CONFIG, getMailboxHitArea } from "../engine/MapConfig";
import { SHED_RESKIN_BILD } from "../ui/reskins";
import { ensurePerennialFruitingState } from "../engine/PlantSystem";
import { dunkelheit as tagesDunkelheit, saisonStand } from "../engine/Tageszeit";

export default function useSpielschleife({
    showLobbyScreen, canvasRef, engineRef, layout, plotsRef, mySlotRef, localPlayerNameRef,
    lastInteractableTypeRef, activeTargetRef, setCurrentInteractable, activateInteractable,
    selectedToolRef, movingPlantSourceRef, plotExpansionsRef, plotUnlockedCellsRef,
    meineReskinsRef, remotePlayersRef, sendMove, heldItemRef, readyEggsCountRef, zoomRef,
    weatherStateRef, partyStaerkeJetzt, renderProfileRef, appearanceRef, playerBadgeRef,
    editorAktivRef, eigeneSterneRef,
}) {
    // ── Main game loop ─────────────────────────────────────────────────────────
    useEffect(() => {
        if (showLobbyScreen) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        const onResize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
        window.addEventListener("resize", onResize);

        const engine = engineRef.current;
        if (engine.input && typeof engine.input.destroy === "function") {
            engine.input.destroy();
        }
        engine.input = new InputHandler();
        engine.renderer = new Renderer(canvas);
        

        let animFrame;
        let lastFrameTs = performance.now();
        const frameDuration = 1000 / TARGET_FPS;

        // Wiederverwendete Hüllen für den Render-Aufruf. Sie werden pro Frame nur neu
        // BEFÜLLT, nie neu erzeugt — vorher entstanden hier bei 60 FPS vier frische
        // Objekte pro Frame (Pflanzen-Klon, Slot, Layout, Payload), was den Garbage
        // Collector regelmäßig zu Sammelläufen zwang: genau die Mikro-Ruckler.
        // Unbedenklich, weil der Renderer nichts davon über den Frame hinaus festhält
        // (sein Slot-Cache vergleicht über einen wertbasierten cacheKey, nicht über
        // Objektidentität) und `layout.current` dabei unangetastet bleibt.
        const drawState = {};
        const layoutBuf = {};
        const slotsBuf = [];
        const mySlotBuf = {};
        const foreignSlotBufs = {}; // slotIndex -> wiederverwendete Hülle für fremde Äcker
        const remoteBuf = [];       // wiederverwendete Liste der Mitspieler
        const fremdeTiere = [];     // Tiere von fremden Grundstücken (aus den Snapshots)
        const fremdeDeko = [];      // Deko von fremden Grundstücken
        // Gebäude der anderen — alle sichtbar, aber nur die Vitrine ist anlaufbar
        // (siehe FREMDE_GEBAEUDE). Der Puffer verhindert eine Neuanlage pro Bild.
        const fremdeGebaeude = [];
        const fremdeGebaeudeBufs = {}; // `${slotIndex}_${art}` -> wiederverwendeter Eintrag
        const alleTiere = [];       // eigene + fremde, so bekommt der Renderer sie
        const alleDeko = [];

        const gameLoop = () => {
            const l = layout.current;
            const now = performance.now();
            if (now - lastFrameTs < frameDuration) {
                animFrame = requestAnimationFrame(gameLoop);
                return;
            }
            const frameMs = Math.max(1, now - lastFrameTs);
            const deltaFactor = Math.min(2.5, frameMs / (1000 / 60));
            lastFrameTs = now;

            const { input, renderer, player } = engine;
            input.update(); // flush key events

            // ── TILE-SPRUNG-BEWEGUNG ─────────────────────────────────────────
            // Ersetzt die vorherige kontinuierliche vx/vy-Bewegung: ein Tastendruck
            // ist jetzt EIN Sprung zur Nachbarkachel (TILE_SIZE), kein Dauerlauf.
            // `player.tileX/tileY` ist die logische, SOFORTIGE Kachel (Kollision
            // prüft dagegen); `player.x/y` bleibt die gerenderte Position und
            // tweent weich zur neuen Kachelmitte — Kamera, Nähe-Prüfung
            // (INTERACT_DIST weiter unten) und sendMove lesen unverändert nur x/y
            // und merken vom Sprung selbst nichts.
            // Prüft + startet (falls möglich) einen Sprung in Richtung dx/dy ab der
            // AKTUELLEN gerenderten Position. Eigene Funktion, weil sie jetzt an
            // zwei Stellen gebraucht wird: normaler Sprungstart UND frühes Abbiegen
            // (siehe unten) — beide teilen dieselbe Grenz-/Kollisionsprüfung.
            const versucheSprung = (dx, dy) => {
                const targetTileX = (player.tileX ?? 0) + dx;
                const targetTileY = (player.tileY ?? 0) + dy;
                const targetX = targetTileX * TILE_SIZE + TILE_SIZE / 2;
                const targetY = targetTileY * TILE_SIZE + TILE_SIZE / 2;

                const margin = 20;
                const inBounds = targetX >= margin && targetX <= l.worldWidth - margin
                    && targetY >= margin && targetY <= l.worldHeight - margin;
                if (!inBounds) return;

                // Dieselben Ausschlussradien wie vorher beim weichen Wegdrücken —
                // nur wird jetzt der SPRUNG verweigert, statt die Position im
                // Nachhinein zurückzuschieben: auf der Zielkachel darf kein
                // Ladenstand/Gebäude "im Weg stehen".
                for (const area of Object.values(engine.areas || {})) {
                    if (area?.aktiv === false) continue;
                    const minDist = COLLISION_RADIUS_BY_AREA_TYPE[area?.type];
                    if (!minDist) continue;
                    if (Math.hypot(targetX - area.x, targetY - area.y) < minDist) return;
                }

                if (dx > 0) player.facingRight = true;
                else if (dx < 0) player.facingRight = false;

                player.tileX = targetTileX;
                player.tileY = targetTileY;
                player.hopFromX = player.x;
                player.hopFromY = player.y;
                player.hopToX = targetX;
                player.hopToY = targetY;
                player.hopStart = now;
                player.hopping = true;
                player.hopDx = dx;
                player.hopDy = dy;
            };

            if (!player.hopping) {
                const hop = input.consumeHop(MAP_CONFIG.hopRepeatMs);
                if (hop) versucheSprung(hop.dx, hop.dy);
            } else if (now - player.hopStart >= MAP_CONFIG.hopMs * FRUEHES_ABBIEGEN_AB) {
                // Frühes Abbiegen (Feedback 28.08.: Richtungswechsel sollen sich
                // "flüssiger" anfühlen) — ab einem Teil der Sprungstrecke darf eine
                // FRISCH gedrückte, ANDERE Richtung den laufenden Sprung sofort
                // ablösen, statt bis zur Kachelmitte zu warten. peekFreshDirection
                // fasst dabei bewusst nicht dieselbe Wiederhol-Uhr an wie consumeHop
                // (siehe dort) — ein bloß gehaltener Zweitschlüssel bleibt also ruhig.
                const richtung = input.peekFreshDirection();
                if (richtung && (richtung.dx !== player.hopDx || richtung.dy !== player.hopDy)) {
                    versucheSprung(richtung.dx, richtung.dy);
                }
            }

            let isMoving = false;
            if (player.hopping) {
                const t = Math.min(1, (now - player.hopStart) / MAP_CONFIG.hopMs);
                const eased = 1 - (1 - t) * (1 - t); // ease-out: schneller Start, sanftes Einbremsen
                player.x = player.hopFromX + (player.hopToX - player.hopFromX) * eased;
                player.y = player.hopFromY + (player.hopToY - player.hopFromY) * eased;
                // Kleiner Hüpfer nach oben während des Sprungs, rein optisch (Renderer
                // liest player.hopBob als zusätzlichen Y-Versatz beim Zeichnen).
                player.hopBob = Math.sin(t * Math.PI) * MAP_CONFIG.hopBobPx;
                isMoving = true;
                if (t >= 1) {
                    player.hopping = false;
                    player.x = player.hopToX;
                    player.y = player.hopToY;
                    player.hopBob = 0;
                }
            }
            player.isMoving = isMoving;

            // ── INTERACTION PROXIMITY + E/SPACE ─────────────────────────────
            // Kein Objekt-Spread pro Frame mehr: nur die Referenz auf das nächste Areal
            // merken. setState läuft ausschließlich, wenn sich der Typ tatsächlich ändert —
            // vorher wurde bei 60+ FPS jeden Frame ein Updater in React geschoben.
            let nearestArea = null;
            let nearestDist = Infinity;
            for (const area of Object.values(engine.areas)) {
                if (area?.aktiv === false) continue;
                const dist = Math.hypot(player.x - area.x, player.y - area.y);
                if (dist < INTERACT_DIST && dist < nearestDist) {
                    nearestArea = area;
                    nearestDist = dist;
                }
            }

            // Schuppen der anderen: einmal pro Bild aus den Momentaufnahmen aufbauen.
            // Anlaufbar ist nur, wenn er eine Vitrine enthält — was in Mülleimer und
            // Kiste liegt, geht niemanden außer dem Besitzer etwas an.
            fremdeGebaeude.length = 0;
            for (const [slotIndex, snapshot] of plotsRef.current) {
                if (slotIndex === mySlotRef.current || !snapshot) continue;
                const fremdSlot = l.slots[slotIndex];
                if (!fremdSlot) continue;
                const stellen = berechneGebaeudePositionen(fremdSlot, snapshot.gebaeudeVersatz);
                const besitzer = snapshot.owner || "unbekannt";
                for (const art of FREMDE_GEBAEUDE) {
                    // Der Schuppen erscheint nur, wenn wenigstens die Vitrine gekauft ist —
                    // sonst stünde bei jedem Neuling ein Gebäude ohne jeden Inhalt herum.
                    if (art.key === "vitrine" && !snapshot.vitrine) continue;
                    const stelle = stellen.shed;
                    const bufKey = `${slotIndex}_${art.key}`;
                    const eintrag = fremdeGebaeudeBufs[bufKey] || (fremdeGebaeudeBufs[bufKey] = {
                        // `type` steuert die Bedienung, `art` das Aussehen — siehe bauart() im Renderer.
                        type: art.type, art: "shed",
                        label: "", image: AREA_IMAGES.shed, owner: null, items: [],
                    });
                    eintrag.x = stelle.x;
                    eintrag.y = stelle.y;
                    eintrag.fussY = stelle.fussY;
                    eintrag.owner = snapshot.owner || null;
                    eintrag.label = `${art.name} von ${besitzer}`;
                    // Reskin des Besitzers (core/reskins.js) — kommt mit der
                    // Momentaufnahme, dieselbe Quelle wie snapshot.reskins.mailbox
                    // beim eigenen Briefkasten-Zweig weiter unten.
                    eintrag.image = SHED_RESKIN_BILD[snapshot.reskins?.shed] || AREA_IMAGES.shed;
                    fremdeGebaeude.push(eintrag);
                    if (!art.anlaufbar) continue;
                    eintrag.items = snapshot.vitrine.items || [];
                    const dist = Math.hypot(player.x - eintrag.x, player.y - eintrag.y);
                    if (dist < INTERACT_DIST && dist < nearestDist) {
                        nearestArea = eintrag;
                        nearestDist = dist;
                    }
                }
            }

            // Briefkästen sind keine "areas" — sie hängen an den Grundstücken.
            // Sie konkurrieren um dieselbe "Öffnen"-Anzeige wie die Gebäude.
            let nearestMailboxSlot = null;
            let nearestMailboxOwner = null;
            for (let i = 0; i < l.slots.length; i++) {
                const slot = l.slots[i];
                // Der Besitzer steht bei FREMDEN Grundstücken nur in der Server-Momentaufnahme,
                // nicht auf l.slots — dort wird nur das eigene Schild beschriftet.
                const owner = i === mySlotRef.current
                    ? (slot.owner || localPlayerNameRef.current)
                    : (plotsRef.current.get(i)?.owner || null);
                if (!owner) continue; // freies Grundstück = kein Kasten in Betrieb
                const box = getMailboxHitArea(slot);
                const dist = Math.hypot(player.x - box.x, player.y - box.y);
                if (dist >= MAILBOX_INTERACT_DIST || dist >= nearestDist) continue;
                nearestMailboxSlot = slot;
                nearestMailboxOwner = owner;
                nearestDist = dist;
                nearestArea = null;
            }

            // Schlüssel statt Typ, damit auch der Wechsel zwischen zwei Briefkästen greift.
            const nearestKey = nearestMailboxSlot
                ? `mb${nearestMailboxSlot.id}`
                : (nearestArea?.type || null);
            if (nearestKey !== lastInteractableTypeRef.current) {
                lastInteractableTypeRef.current = nearestKey;
                if (nearestMailboxSlot) {
                    const isOwn = nearestMailboxSlot.id - 1 === mySlotRef.current;
                    activeTargetRef.current = {
                        type: "mailbox",
                        isOwn,
                        owner: nearestMailboxOwner,
                        label: isOwn ? "Deinen Briefkasten" : `Briefkasten von ${nearestMailboxOwner}`,
                    };
                } else {
                    activeTargetRef.current = nearestArea;
                }
                setCurrentInteractable(activeTargetRef.current);
            }
            if (activeTargetRef.current && (input.wasJustPressed("e") || input.wasJustPressed(" "))) {
                activateInteractable(activeTargetRef.current);
            }

            // Ein Tier wandert auf SEINEM Grundstück — egal, wem das gehört.
            // Auch fremde Tiere laufen dadurch herum statt wie angeklebt dazustehen.
            // Jeder Client würfelt das für sich; abgeglichen wird nichts, das würde
            // nur Datenverkehr kosten und sieht niemand.
            const bewegeTiere = (liste, slotIndex) => {
                const slot = l.slots[slotIndex];
                if (!slot || !Array.isArray(liste) || liste.length === 0) return;
                const drawY = slot.isTopRow ? slot.anchorY - MAP_CONFIG.territoryHeight : slot.anchorY;
                const minX = slot.x + 30;
                const maxX = slot.x + MAP_CONFIG.territoryWidth - 30;
                const minY = drawY + 30;
                const maxY = drawY + MAP_CONFIG.territoryHeight - 30;
                for (const pet of liste) {
                    if (!pet || pet.slotIndex !== slotIndex) continue;
                    if (!Number.isFinite(pet.x) || !Number.isFinite(pet.y)) {
                        pet.x = (minX + maxX) / 2;
                        pet.y = (minY + maxY) / 2;
                    }
                    if (!Number.isFinite(pet.vx) || !Number.isFinite(pet.vy) || now >= (pet.changeDirAt || 0)) {
                        const angle = Math.random() * Math.PI * 2;
                        const speed = 0.55 + Math.random() * 0.9;
                        pet.vx = Math.cos(angle) * speed;
                        pet.vy = Math.sin(angle) * speed;
                        pet.changeDirAt = now + 1400 + Math.random() * 2200;
                        if (pet.vx > 0) pet.facingRight = true;
                        else if (pet.vx < 0) pet.facingRight = false;
                    }
                    pet.x += pet.vx * deltaFactor;
                    pet.y += pet.vy * deltaFactor;
                    if (pet.x < minX || pet.x > maxX) {
                        pet.vx *= -1;
                        pet.x = Math.max(minX, Math.min(maxX, pet.x));
                        pet.facingRight = pet.vx > 0;
                    }
                    if (pet.y < minY || pet.y > maxY) {
                        pet.vy *= -1;
                        pet.y = Math.max(minY, Math.min(maxY, pet.y));
                    }
                }
            };

            bewegeTiere(engine.petPlacements, mySlotRef.current);
            for (const [slotIndex, snapshot] of plotsRef.current) {
                if (slotIndex === mySlotRef.current) continue;
                bewegeTiere(snapshot?.petPlacements, slotIndex);
            }

            // Stauden: Struktur→Wachstum nur hier (nicht im Renderer) mutieren
            const wallNow = Date.now();
            if (engine.plotPlants) {
                for (const p of Object.values(engine.plotPlants)) {
                    if (p && !p.singleUse) ensurePerennialFruitingState(p, wallNow);
                }
            }

            // ── RENDER ───────────────────────────────────────────────────────
            // Inject live plant data into slots
            const myPlotSlotIndex = mySlotRef.current;

            // 1. ANPASSUNG: Pflanze während dem Umtopfen vom Feld ausblenden.
            // Der Klon ist NUR dafür nötig — und nur, solange wirklich umgetopft wird.
            // Im Normalfall (kein Umtopfen) reicht die Referenz auf engine.plotPlants,
            // und es fällt keine einzige Kopie an.
            const hiddenPlantKey = selectedToolRef.current === "pot" ? movingPlantSourceRef.current : null;
            let visiblePlants = engine.plotPlants;
            if (hiddenPlantKey && visiblePlants && hiddenPlantKey in visiblePlants) {
                visiblePlants = { ...engine.plotPlants };
                delete visiblePlants[hiddenPlantKey];
            }

            // Fremde Slots gehen unverändert per Referenz durch, nur der eigene bekommt
            // die Live-Daten übergestülpt — in eine wiederverwendete Hülle statt in ein
            // neues Objekt. `l.slots` selbst wird dabei nicht verändert.
            slotsBuf.length = l.slots.length;
            // Wiederverwendete Puffer: pro Bild wird nur die Laenge zurueckgesetzt,
            // damit im Spielbetrieb keine neuen Arrays anfallen.
            fremdeTiere.length = 0;
            fremdeDeko.length = 0;
            for (let i = 0; i < l.slots.length; i++) {
                const slot = l.slots[i];
                if (i !== myPlotSlotIndex) {
                    // Fremdes Grundstück: Momentaufnahme vom Server überstülpen, falls
                    // dort gerade jemand farmt. Ohne Snapshot bleibt der Slot leer/„zu verkaufen".
                    const snapshot = plotsRef.current.get(i);
                    if (snapshot) {
                        const buf = foreignSlotBufs[i] || (foreignSlotBufs[i] = {});
                        Object.assign(buf, slot);
                        buf.plants = snapshot.plants;
                        buf.unlockedCells = snapshot.plotUnlockedCells;
                        buf.owner = snapshot.owner;
                        buf.hasMail = snapshot.hasMail;
                        buf.mailboxReskin = snapshot.reskins?.mailbox || null;
                        // Farm-Schild bekommt denselben Skin wie die Nametag über dem
                        // Kopf (Feedback 01.09.) — siehe _drawSign in Renderer.js.
                        buf.nameplateReskin = snapshot.reskins?.nameplate || null;
                        slotsBuf[i] = buf;
                        // Tiere und Deko der anderen einsammeln — der Renderer bekommt
                        // sie als eine Liste und sortiert sie ueber `slotIndex` selbst
                        // auf die Grundstuecke.
                        if (Array.isArray(snapshot.petPlacements)) {
                            for (const pet of snapshot.petPlacements) if (pet) fremdeTiere.push(pet);
                        }
                        if (Array.isArray(snapshot.decoPlacements)) {
                            for (const deko of snapshot.decoPlacements) if (deko) fremdeDeko.push(deko);
                        }
                    } else {
                        slotsBuf[i] = slot;
                    }
                    continue;
                }
                Object.assign(mySlotBuf, slot);
                mySlotBuf.plants = visiblePlants;
                mySlotBuf.currentExpansions = plotExpansionsRef.current;
                mySlotBuf.unlockedCells = plotUnlockedCellsRef.current;
                // Eigener Briefkasten-Reskin — Nachbarn lesen ihren aus der
                // Momentaufnahme (siehe foreign-Zweig oben), hier ist es der
                // eigene, lokal ausgerüstete Stand.
                mySlotBuf.mailboxReskin = meineReskinsRef.current.mailbox;
                // Eigenes Farm-Schild — derselbe ausgerüstete Nameplate-Reskin wie
                // die Nametag über dem Kopf (Feedback 01.09.: "synchronisieren").
                mySlotBuf.nameplateReskin = meineReskinsRef.current.nameplate;
                slotsBuf[i] = mySlotBuf;
                // Eigener Schuppen-Reskin — JEDEN Frame statt einmalig in
                // ladeGoldShop, sonst überschreiben die Positions-Effekte
                // (a.shed.image = AREA_IMAGES.shed) die Zuweisung wieder.
                if (engine.areas?.shed) {
                    engine.areas.shed.image = SHED_RESKIN_BILD[meineReskinsRef.current.shed] || AREA_IMAGES.shed;
                }
            }

            // ── MITSPIELER ───────────────────────────────────────────────────
            // Der Server tickt mit 15 Hz; ohne Nachziehen würden fremde Avatare springen.
            const remotes = remoteBuf;
            remotes.length = 0;
            for (const remote of remotePlayersRef.current.values()) {
                remote.x += (remote.tx - remote.x) * Math.min(1, 0.22 * deltaFactor);
                remote.y += (remote.ty - remote.y) * Math.min(1, 0.22 * deltaFactor);
                remotes.push(remote);
            }
            sendMove(player.x, player.y, player.facingRight !== false, isMoving);

            Object.assign(layoutBuf, l);
            layoutBuf.slots = slotsBuf;

            // 1. & 2. ANPASSUNG: Welches Item wird gerade in der Hand gehalten?
            let activeHeldItem = heldItemRef.current;
            if (selectedToolRef.current === "pot" && movingPlantSourceRef.current) {
                // Wenn wir umtopfen, lege die echte Pflanze vom Acker als aktives Item in die Hand
                const p = engine.plotPlants[movingPlantSourceRef.current];
                if (p) activeHeldItem = p;
            }

            // Felder überschreiben statt ein neues Payload-Objekt zu bauen.
            drawState.areas = engine.areas;
            drawState.fremdeGebaeude = fremdeGebaeude;
            drawState.readyEggsCount = readyEggsCountRef.current;
            drawState.layout = layoutBuf;
            drawState.zoom = zoomRef.current;
            drawState.selectedTool = selectedToolRef.current;
            drawState.heldItem = activeHeldItem; // Hier übergeben wir das frisch berechnete Item
            drawState.weather = weatherStateRef.current;
            // Tageszeit und Party kommen aus der Uhr, nicht aus React-State: sie
            // ändern sich stetig, und ein State-Update je Bild würde die ganze
            // 8000-Zeilen-Komponente sechzigmal pro Sekunde neu rendern.
            drawState.nacht = tagesDunkelheit(Date.now());
            drawState.party = partyStaerkeJetzt(Date.now());
            drawState.saison = saisonStand(Date.now()).id;
            drawState.renderProfile = renderProfileRef.current;
            // Eigene und fremde Tiere/Deko in einer Liste: der Renderer sortiert sie
            // ueber `slotIndex` auf die Grundstuecke und in die Tiefensortierung ein.
            alleTiere.length = 0;
            if (Array.isArray(engine.petPlacements)) {
                for (const pet of engine.petPlacements) if (pet) alleTiere.push(pet);
            }
            for (const pet of fremdeTiere) alleTiere.push(pet);
            alleDeko.length = 0;
            if (Array.isArray(engine.decoPlacements)) {
                for (const deko of engine.decoPlacements) if (deko) alleDeko.push(deko);
            }
            for (const deko of fremdeDeko) alleDeko.push(deko);
            drawState.petPlacements = alleTiere;
            drawState.decoPlacements = alleDeko;
            drawState.localPlayerName = localPlayerNameRef.current;
            drawState.playerAppearance = appearanceRef.current;
            drawState.playerBadge = playerBadgeRef.current;
            drawState.playerNameplate = meineReskinsRef.current.nameplate;
            drawState.remotePlayers = remotes;
            drawState.eigeneSterne = eigeneSterneRef?.current || 0;
            // Raster nur über dem EIGENEN Grundstück; slot.id ist der Index + 1.
            drawState.editorSlotId = editorAktivRef.current ? mySlotRef.current + 1 : null;
            // Schädlinge/Unkraut (Backend core/stoerer.js) — nur auf dem eigenen Acker.
            drawState.stoerer = engine.stoerer;
            drawState.stoererSlot = slotsBuf[mySlotRef.current] || null;

            renderer.draw(drawState, player);

            animFrame = requestAnimationFrame(gameLoop);
        };

        gameLoop();
        return () => {
            cancelAnimationFrame(animFrame);
            window.removeEventListener("resize", onResize);
            try {
                engineRef.current?.input?.destroy?.();
                // Der Renderer wurde bisher NICHT abgeräumt: seine Bild- und
                // Canvas-Caches (je Grundstück bis zu 400 Offscreen-Flächen) blieben
                // liegen, bis der Browser irgendwann aufräumt — bei mehrfachem
                // Betreten der Welt stapelten sich komplette Instanzen.
                engineRef.current?.renderer?.destroy?.();
            } catch { /* */ }
            engineRef.current.renderer = null;
            engineRef.current.input = null;
        };
    }, [showLobbyScreen, activateInteractable]);
}
