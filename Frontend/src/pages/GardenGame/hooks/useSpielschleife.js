// hooks/useSpielschleife.js
// Spielschleife: Renderer und Tastatur anlegen, Figur bewegen (Kachel-Sprünge, Kollision),
// nächstes Ziel für die E-Taste bestimmen, Bewegung an die Lobby melden, jedes Bild zeichnen.
// Ausgelagert aus GameContainer.jsx, Code unverändert.
import { useEffect } from "react";
import InputHandler from "../engine/InputHandler";
import Renderer from "../engine/Renderer";
import {
    TARGET_FPS, COLLISION_RADIUS_BY_AREA_TYPE, INTERACT_DIST,
    berechneGebaeudePositionen, FREMDE_GEBAEUDE, AREA_IMAGES, MAILBOX_INTERACT_DIST,
} from "../engine/gameConstants";
import { TILE_SIZE, MAP_CONFIG, getMailboxHitArea } from "../engine/MapConfig";
import { SHED_RESKIN_BILD } from "../ui/reskins";
import { istBoden } from "../ui/deko";
import { tuerLage } from "../engine/hausTuer";

/** Gebäude, in die man hineinläuft: Schlüssel für engine.onEintritt → Eintrag in engine.areas. */
const BEGEHBAR = [
    { key: "haus", area: "shed" },
    { key: "goldshop", area: "goldShop" },
];
const HINEIN_MS = 420; // Weg durch den Türrahmen
// Wo die Figur vor der Tür steht (Weltpixel unter der Bildunterkante) — außerhalb der Sperrzone
// des Gebäudes, sonst käme man nach dem Hinausgehen hinter die Fassade. Gleicher Wert in
// Renderer._maleTuer (dort starten die Füße 20 tiefer, die Figur steht 20 über ihren Füßen).
const VOR_DER_TUER = 20;
const HERAUS_MS = 300;
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
        // Editor-Kamera (05.11.): zeigt das ganze eigene Grundstück, ohne Figur.
        const editorKamera = { x: 0, y: 0, zoom: 1 };
        const dekoVorschau = { deco: {}, x: 0, y: 0 }; // Deko in der Hand am Mauszeiger (Editor)
        // Hineinlaufen in Haus/Gold-Shop: wiederverwendete Hüllen (siehe „INS HAUS“ unten)
        const tuerBuf = {};
        const tuerFigur = { weg: 0, alpha: 1, phase: 0, rechts: true };
        const tuerZustand = { area: null, offen: 0, figur: null };
        const slotsBuf = [];
        const mySlotBuf = {};
        const foreignSlotBufs = {}; // slotIndex -> wiederverwendete Hülle für fremde Äcker
        const remoteBuf = [];       // wiederverwendete Liste der Mitspieler
        const fremdeTiere = [];     // Tiere von fremden Grundstücken (aus den Snapshots)
        const tierhutJeSlot = {};   // slotIndex -> Tierhut aus dem Gold-Shop (engine/huete.js)
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
            // Im Haus (ui/HausInnen.jsx) zeichnet der Raum selbst und deckt die Welt ab.
            if (engine.imHaus) {
                animFrame = requestAnimationFrame(gameLoop);
                return;
            }

            // ── FREIES LAUFEN (06.11.) ───────────────────────────────────────
            // Ersetzt das Kachel-Hüpfen: Die Figur läuft stufenlos in alle acht
            // Richtungen, so wie im Haus (ui/HausInnen.jsx). Gesperrt wird pro Achse
            // getrennt, damit man an Wasser, Wald und Gebäuden entlanggleitet statt
            // hängen zu bleiben. `player.tileX/tileY` ist nur noch die Kachel unter
            // den Füßen (für Teleports und Tests) — alles andere liest x/y.
            const nurVorderkante = Boolean(engine.welt3d?.aktiv);
            const gebaeudeSperrt = (x, y, vonX, vonY) => {
                for (const area of Object.values(engine.areas || {})) {
                    if (area?.aktiv === false) continue;
                    const minDist = COLLISION_RADIUS_BY_AREA_TYPE[area?.type];
                    if (!minDist) continue;
                    if (nurVorderkante) {
                        // 3D: nur die vordere Kante sperrt, dahinter macht der Renderer
                        // das Gebäude halb durchsichtig (Renderer.draw3dStehend, durchsicht).
                        const fussY = Number.isFinite(area.fussY) ? area.fussY
                            : area.y + (area.type === "questBoard" ? TILE_SIZE : 105);
                        const halb = area.type === "shed" ? 120 : area.type === "questBoard" ? 56 : 130;
                        const drin = (px, py) => Math.abs(px - area.x) < halb && py > fussY - 56 && py < fussY + 20;
                        if (drin(x, y) && !drin(vonX, vonY)) return true;
                        continue;
                    }
                    // Wer schon im Radius steht (Teleport, Gebäude umgestellt), darf
                    // sich herausbewegen — gesperrt ist nur der Schritt weiter hinein.
                    const d = Math.hypot(x - area.x, y - area.y);
                    if (d < minDist && d < Math.hypot(vonX - area.x, vonY - area.y)) return true;
                }
                return false;
            };
            const FUSS = 14; // halbe Fußbreite: nicht mit einer Schulter im Teich stehen
            const begehbarBei = (x, y) => {
                if (!l.begehbar) return true;
                for (const ox of [-FUSS, 0, FUSS]) {
                    if (!l.begehbar(Math.floor((x + ox) / TILE_SIZE), Math.floor(y / TILE_SIZE))) return false;
                }
                return true;
            };
            const darfNach = (x, y, vonX, vonY) => {
                const margin = 20;
                if (x < margin || x > l.worldWidth - margin || y < margin || y > l.worldHeight - margin) return false;
                // Steht man schon auf Gesperrtem (alter Spielstand, Teleport), darf man herauslaufen.
                if (!begehbarBei(x, y) && begehbarBei(vonX, vonY)) return false;
                return !gebaeudeSperrt(x, y, vonX, vonY);
            };

            const k = input.keys;
            let richtX = (k.has("d") || k.has("arrowright") ? 1 : 0) - (k.has("a") || k.has("arrowleft") ? 1 : 0);
            let richtY = (k.has("s") || k.has("arrowdown") ? 1 : 0) - (k.has("w") || k.has("arrowup") ? 1 : 0);
            // Editor (11.11.): die Lauftasten verschieben die Ansicht, die Figur bleibt stehen
            const schiebX = richtX;
            const schiebY = richtY;
            if (editorAktivRef.current) { richtX = 0; richtY = 0; }
            // Beim Angeln (ui/fenster/AngelFenster.jsx) bleibt die Figur stehen und schaut zum Schwimmer
            const angelSzene = engine.angelSzene || null;
            if (angelSzene) {
                richtX = 0;
                richtY = 0;
                if (angelSzene.ziel) player.facingRight = angelSzene.ziel.x >= player.x;
            }

            // ── INS HAUS / IN DEN GOLD-SHOP LAUFEN (11.11.) ──────────────────
            // Kein Sprung mehr ins Innenbild: Die Figur läuft zur Tür, die Tür schwingt
            // auf, sie geht durch den Rahmen (zeichnet Renderer._maleTuer), erst dann
            // zeigt sich der Raum. Ausgelöst mit E (engine.eintrittWunsch aus
            // activateInteractable) oder indem man einfach gegen die Tür läuft.
            // Hinaus dasselbe rückwärts (engine.austrittWunsch aus onVerlassen).
            let tuerOffen = 0;
            let tuerFigurWeg = -1; // ≥ 0: die Figur ist im Türrahmen statt in der Welt
            let tuerArea = null;
            let ablaufLauf = false;
            if (engine.austrittWunsch) {
                engine.austrittWunsch = false;
                const lage = tuerLage(engine.drin?.area, tuerBuf);
                if (lage) {
                    player.x = lage.mitteX;
                    player.y = lage.fuss + VOR_DER_TUER;
                    engine.austritt = { area: engine.drin.area, start: now };
                    engine.eintrittSperreBis = now + 900;
                }
                engine.drin = null;
            }
            if (!engine.eintritt && !engine.austritt && !editorAktivRef.current && !angelSzene) {
                // Gegen die Tür laufen: nach oben drücken, mittig davor, nah genug
                if (!engine.eintrittWunsch && richtY < 0 && now > (engine.eintrittSperreBis || 0)) {
                    for (const ziel of BEGEHBAR) {
                        const area = engine.areas?.[ziel.area];
                        if (!area || area.aktiv === false) continue;
                        const lage = tuerLage(area, tuerBuf);
                        if (!lage) continue;
                        const fuss = player.y + 20 - lage.fuss;
                        if (Math.abs(player.x - lage.mitteX) < 44 && fuss > -12 && fuss < 72) {
                            engine.eintrittWunsch = ziel.key;
                            engine.tuerTon?.();
                            break;
                        }
                    }
                    // Häuser der Nachbarn (Liste aus dem vorigen Bild, siehe fremdeGebaeude unten)
                    if (!engine.eintrittWunsch) {
                        for (const haus of fremdeGebaeude) {
                            const lage = tuerLage(haus, tuerBuf);
                            if (!lage) continue;
                            const fuss = player.y + 20 - lage.fuss;
                            if (Math.abs(player.x - lage.mitteX) < 44 && fuss > -12 && fuss < 72) {
                                engine.eintrittWunsch = `fremd:${haus.slotIndex}`;
                                engine.tuerTon?.();
                                break;
                            }
                        }
                    }
                }
                const wunsch = engine.eintrittWunsch;
                if (wunsch) {
                    const ziel = BEGEHBAR.find((z) => z.key === wunsch);
                    // „fremd:<Grundstück>“ = Haus eines Nachbarn, solange er in der Welt ist
                    const fremdSlot = !ziel && wunsch.startsWith("fremd:") ? Number(wunsch.slice(6)) : -1;
                    const area = ziel ? engine.areas?.[ziel.area]
                        : (fremdSlot >= 0 && plotsRef.current.get(fremdSlot) ? fremdeGebaeudeBufs[`${fremdSlot}_haus`] : null) || null;
                    const lage = tuerLage(area, tuerBuf);
                    if (lage) {
                        const strecke = Math.hypot(lage.mitteX - player.x, lage.fuss + VOR_DER_TUER - player.y);
                        engine.eintritt = {
                            ziel: wunsch, area, start: now, vonX: player.x, vonY: player.y,
                            zuX: lage.mitteX, zuY: lage.fuss + VOR_DER_TUER,
                            laufMs: Math.max(120, Math.min(520, (strecke / MAP_CONFIG.laufTempo) * 1000)),
                        };
                    } else if (area) {
                        // Gebäude noch nie gezeichnet (keine Türlage bekannt): direkt hinein
                        engine.imHaus = true;
                        engine.drin = { area };
                        engine.onEintritt?.(wunsch);
                    }
                }
            }
            engine.eintrittWunsch = null;
            const ein = engine.eintritt;
            if (ein) {
                const t = now - ein.start;
                richtX = 0;
                richtY = 0;
                tuerArea = ein.area;
                tuerOffen = Math.min(1, t / 240);
                if (t < ein.laufMs) {
                    const u = t / ein.laufMs;
                    player.x = ein.vonX + (ein.zuX - ein.vonX) * u;
                    player.y = ein.vonY + (ein.zuY - ein.vonY) * u;
                    if (Math.abs(ein.zuX - ein.vonX) > 6) player.facingRight = ein.zuX > ein.vonX;
                    ablaufLauf = true;
                } else {
                    player.x = ein.zuX;
                    player.y = ein.zuY;
                    tuerFigurWeg = Math.min(1, (t - ein.laufMs) / HINEIN_MS);
                    if (t >= ein.laufMs + HINEIN_MS) {
                        engine.eintritt = null;
                        engine.drin = { area: ein.area };
                        // Sofort anhalten — der React-Zustand folgt erst ein, zwei Bilder später
                        engine.imHaus = true;
                        engine.onEintritt?.(ein.ziel);
                    }
                }
            }
            const aus = engine.austritt;
            if (aus) {
                const t = now - aus.start;
                tuerArea = aus.area;
                if (t < HERAUS_MS) {
                    richtX = 0;
                    richtY = 0;
                    tuerOffen = 1;
                    tuerFigurWeg = 1 - t / HERAUS_MS;
                } else {
                    tuerOffen = 1 - (t - HERAUS_MS) / 260;
                    if (tuerOffen <= 0) { engine.austritt = null; tuerArea = null; }
                }
            }

            const laenge = Math.hypot(richtX, richtY);
            let isMoving = false;
            if (laenge > 0) {
                richtX /= laenge;
                richtY /= laenge;
                // Bei wenigen Bildern pro Sekunde wird ein Schritt groß — in Teilschritten
                // von höchstens 16 px, damit man nie über einen schmalen Bach „springt“.
                const strecke = MAP_CONFIG.laufTempo * (Math.min(frameMs, 100) / 1000);
                const teile = Math.max(1, Math.ceil(strecke / 16));
                const schritt = strecke / teile;
                const startX = player.x;
                const startY = player.y;
                for (let i = 0; i < teile; i++) {
                    const vonX = player.x;
                    const vonY = player.y;
                    const nx = player.x + richtX * schritt;
                    if (richtX && darfNach(nx, player.y, vonX, vonY)) player.x = nx;
                    const ny = player.y + richtY * schritt;
                    if (richtY && darfNach(player.x, ny, player.x, vonY)) player.y = ny;
                }
                isMoving = player.x !== startX || player.y !== startY;
                if (richtX > 0.1) player.facingRight = true;
                else if (richtX < -0.1) player.facingRight = false;
            }
            if (ablaufLauf) isMoving = true;
            player.tileX = Math.floor(player.x / TILE_SIZE);
            player.tileY = Math.floor(player.y / TILE_SIZE);
            player.hopping = false;
            // Kleiner Wipper beim Laufen, rein optisch (Renderer liest player.hopBob)
            if (isMoving) {
                player.laufPhase = (player.laufPhase || 0) + frameMs / 1000 * MAP_CONFIG.laufSchrittePS * Math.PI;
                player.hopBob = Math.abs(Math.sin(player.laufPhase)) * MAP_CONFIG.hopBobPx * 0.6;
            } else {
                player.laufPhase = 0;
                player.hopBob = Math.max(0, (player.hopBob || 0) - frameMs * 0.03);
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

            // Häuser der anderen: einmal pro Bild aus den Momentaufnahmen aufbauen.
            // Man kann sie betreten (11.11.) — drinnen ist nur die Vitrine zum Ansehen da.
            fremdeGebaeude.length = 0;
            for (const [slotIndex, snapshot] of plotsRef.current) {
                if (slotIndex === mySlotRef.current || !snapshot) continue;
                const fremdSlot = l.slots[slotIndex];
                if (!fremdSlot) continue;
                const stellen = berechneGebaeudePositionen(fremdSlot, snapshot.gebaeudeVersatz);
                const besitzer = snapshot.owner || "unbekannt";
                for (const art of FREMDE_GEBAEUDE) {
                    const stelle = stellen.shed;
                    const bufKey = `${slotIndex}_${art.key}`;
                    const eintrag = fremdeGebaeudeBufs[bufKey] || (fremdeGebaeudeBufs[bufKey] = {
                        // `type` steuert die Bedienung, `art` das Aussehen — siehe bauart() im Renderer.
                        type: art.type, art: "shed",
                        label: "", image: AREA_IMAGES.shed, owner: null, slotIndex,
                    });
                    eintrag.x = stelle.x;
                    eintrag.y = stelle.y;
                    eintrag.fussY = stelle.fussY;
                    eintrag.owner = snapshot.owner || null;
                    eintrag.wirt = snapshot.ownerTwitchId || null;
                    eintrag.label = `${art.name} von ${besitzer}`;
                    // Reskin des Besitzers (core/reskins.js) — kommt mit der
                    // Momentaufnahme, dieselbe Quelle wie snapshot.reskins.mailbox
                    // beim eigenen Briefkasten-Zweig weiter unten.
                    eintrag.image = SHED_RESKIN_BILD[snapshot.reskins?.shed] || AREA_IMAGES.shed;
                    fremdeGebaeude.push(eintrag);
                    if (!art.anlaufbar) continue;
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
                // Fremde Häuser tragen ihr Grundstück im Schlüssel — sonst bliebe beim Wechsel
                // von einem Nachbarhaus zum nächsten das alte Ziel stehen.
                : (nearestArea ? (nearestArea.type === "fremdesHaus" ? `fh${nearestArea.slotIndex}` : nearestArea.type) : null);
            if (nearestKey !== lastInteractableTypeRef.current) {
                lastInteractableTypeRef.current = nearestKey;
                if (nearestMailboxSlot) {
                    const isOwn = nearestMailboxSlot.id - 1 === mySlotRef.current;
                    const box = getMailboxHitArea(nearestMailboxSlot);
                    activeTargetRef.current = {
                        type: "mailbox",
                        // Position nur für den Pfeil über dem Ziel (Renderer._zielSpitze)
                        x: box.x, y: box.y, fussY: box.y + 6,
                        isOwn,
                        owner: nearestMailboxOwner,
                        label: isOwn ? "Deinen Briefkasten" : `Briefkasten von ${nearestMailboxOwner}`,
                    };
                } else {
                    activeTargetRef.current = nearestArea;
                }
                setCurrentInteractable(activeTargetRef.current);
            }
            if (activeTargetRef.current && !tuerArea && (input.wasJustPressed("e") || input.wasJustPressed(" "))) {
                activateInteractable(activeTargetRef.current);
            }

            // Ein Tier wandert auf SEINEM Grundstück — egal, wem das gehört.
            // Auch fremde Tiere laufen dadurch herum statt wie angeklebt dazustehen.
            // Jeder Client würfelt das für sich; abgeglichen wird nichts, das würde
            // nur Datenverkehr kosten und sieht niemand.
            const tiefeNacht = tagesDunkelheit(Date.now()) > 0.5 && !(partyStaerkeJetzt(Date.now()) > 0.35);
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
                    // 10.11.: Nachts schlafen die Tiere; tagsüber bleiben sie zwischen zwei
                    // Wegen öfter stehen und fressen (pet.tut liest Renderer._drawPetItem).
                    if (tiefeNacht) {
                        if (pet.tut !== "schlaeft") { pet.tut = "schlaeft"; pet.vx = 0; pet.vy = 0; pet.changeDirAt = 0; }
                        // Auch im Schlaf auf dem Grundstück bleiben (Tier ohne gültigen Platz)
                        pet.x = Math.max(minX, Math.min(maxX, pet.x));
                        pet.y = Math.max(minY, Math.min(maxY, pet.y));
                        continue;
                    }
                    if (!Number.isFinite(pet.vx) || !Number.isFinite(pet.vy) || now >= (pet.changeDirAt || 0)) {
                        const wurf = Math.random();
                        if (wurf < 0.45 && pet.tut !== "steht" && pet.tut !== "frisst") {
                            pet.vx = 0;
                            pet.vy = 0;
                            pet.tut = wurf < 0.27 ? "frisst" : "steht";
                            pet.changeDirAt = now + 1800 + Math.random() * 3200;
                        } else {
                            const angle = Math.random() * Math.PI * 2;
                            const speed = 0.55 + Math.random() * 0.9;
                            pet.vx = Math.cos(angle) * speed;
                            pet.vy = Math.sin(angle) * speed;
                            pet.tut = null;
                            pet.changeDirAt = now + 1400 + Math.random() * 2200;
                            if (pet.vx > 0) pet.facingRight = true;
                            else if (pet.vx < 0) pet.facingRight = false;
                        }
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
                        tierhutJeSlot[i] = snapshot.reskins?.tierhut || null;
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
                // Wer in einem Haus oder im Gold-Shop steht, ist draußen nicht zu sehen
                if (remote.raum) { remote.x = remote.tx; remote.y = remote.ty; continue; }
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
            drawState.playerHut = meineReskinsRef.current.hut || null;
            drawState.tierHut = meineReskinsRef.current.tierhut || null;
            tierhutJeSlot[mySlotRef.current] = drawState.tierHut;
            drawState.tierhutJeSlot = tierhutJeSlot;
            drawState.remotePlayers = remotes;
            drawState.eigeneSterne = eigeneSterneRef?.current || 0;
            // Raster nur über dem EIGENEN Grundstück; slot.id ist der Index + 1.
            drawState.editorSlotId = editorAktivRef.current ? mySlotRef.current + 1 : null;
            // Schädlinge/Unkraut (Backend core/stoerer.js) — nur auf dem eigenen Acker.
            drawState.stoerer = engine.stoerer;
            drawState.stoererSlot = slotsBuf[mySlotRef.current] || null;
            // Was ein Druck auf E gerade öffnen würde — bekommt einen Ring am Boden.
            drawState.aktivesZiel = angelSzene || tuerArea ? null : (activeTargetRef.current || null);
            // Tür, die gerade auf- oder zugeht, und die Figur im Rahmen (Renderer._maleTuer)
            drawState.tuer = null;
            drawState.spielerVersteckt = false;
            if (tuerArea) {
                tuerZustand.area = tuerArea;
                tuerZustand.offen = tuerOffen;
                tuerZustand.figur = null;
                if (tuerFigurWeg >= 0) {
                    tuerFigur.weg = tuerFigurWeg;
                    tuerFigur.alpha = 1 - 0.75 * tuerFigurWeg * tuerFigurWeg;
                    tuerFigur.phase = (now / 1000) * MAP_CONFIG.laufSchrittePS * Math.PI;
                    tuerFigur.rechts = player.facingRight !== false;
                    tuerZustand.figur = tuerFigur;
                    drawState.spielerVersteckt = true;
                }
                drawState.tuer = tuerZustand;
            }
            // Pfeile neben der Figur zu Ständen, an denen etwas abzuholen ist (Renderer._drawWegweiser)
            drawState.wegweiser = !angelSzene && !tuerArea;
            drawState.standMarken = engine.standMarken || null;
            drawState.angeln = angelSzene;

            // Editor (05.11.): Kamera fest über dem eigenen Grundstück, so gezoomt, dass es
            // zwischen Kopfzeile und Editor-Leiste ganz zu sehen ist — ohne Figuren, immer
            // in der Draufsicht. toWorld (useSpielflaecheMaus) rechnet mit derselben Kamera.
            const editorSlot = editorAktivRef.current ? slotsBuf[mySlotRef.current] : null;
            engine.editorKamera = null;
            drawState.ohneSpieler = false;
            drawState.dekoVorschau = null;
            if (!editorSlot) engine.editorSicht = null;
            if (editorSlot) {
                const { territoryWidth: tw, territoryHeight: th } = MAP_CONFIG;
                const oben = editorSlot.isTopRow ? editorSlot.anchorY - th : editorSlot.anchorY;
                const KOPF = 100, LEISTE = 230; // Platz für Kopfzeile und Editor-Leiste
                // `passt`: so gezoomt ist das ganze Grundstück zu sehen. 11.11.: der Editor
                // startet näher dran (Kacheln gut zu treffen); die Lauftasten verschieben die
                // Ansicht, das Mausrad zoomt (useSpielflaecheMaus) — bis zurück auf `passt`.
                const passt = Math.max(0.3, Math.min(1.6, Math.min((canvas.width - 80) / tw, (canvas.height - KOPF - LEISTE) / th)));
                let sicht = engine.editorSicht;
                if (!sicht) {
                    sicht = engine.editorSicht = { zoom: Math.max(passt, Math.min(1.1, passt * 1.8)), dx: 0, dy: 0, min: passt, max: 1.8 };
                }
                sicht.min = passt;
                sicht.zoom = Math.max(sicht.min, Math.min(sicht.max, sicht.zoom));
                const tempo = (900 / sicht.zoom) * (Math.min(frameMs, 100) / 1000);
                sicht.dx = Math.max(-tw / 2, Math.min(tw / 2, sicht.dx + schiebX * tempo));
                sicht.dy = Math.max(-th / 2, Math.min(th / 2, sicht.dy + schiebY * tempo));
                // Ganz herausgezoomt liegt das Grundstück wieder mittig
                const frei = Math.min(1, (sicht.zoom - sicht.min) / Math.max(0.01, sicht.min * 0.25));
                editorKamera.zoom = sicht.zoom;
                editorKamera.x = editorSlot.x + tw / 2 + sicht.dx * frei;
                editorKamera.y = oben + th / 2 + (LEISTE - KOPF) / 2 / editorKamera.zoom + sicht.dy * frei;
                engine.editorKamera = editorKamera;
                drawState.zoom = editorKamera.zoom;
                drawState.ohneSpieler = true;
                drawState.remotePlayers = null;
                drawState.aktivesZiel = null;
                drawState.wegweiser = false;
                drawState.tuer = null;
                drawState.spielerVersteckt = false;
                // Deko in der Hand am Mauszeiger, eingerastet auf die Kachel (wie platziereDeko
                // in useSpielflaecheMaus: Ankerkachel unten links, wächst nach rechts und oben)
                const zeiger = engine.editorZeiger;
                const hand = engine.dekoHandRefs;
                const gewaehlt = hand?.deko.current || null;
                if (zeiger && gewaehlt) {
                    const kx = Math.floor((zeiger.x - editorSlot.x) / TILE_SIZE);
                    const ky = Math.floor((zeiger.y - oben) / TILE_SIZE);
                    if (kx >= 0 && ky >= 0 && kx < Math.round(tw / TILE_SIZE) && ky < Math.round(th / TILE_SIZE)) {
                        const boden = istBoden(gewaehlt);
                        const d = dekoVorschau.deco;
                        d.decoId = gewaehlt.id;
                        d.image = gewaehlt.image;
                        d.emoji = gewaehlt.emoji;
                        d.width = gewaehlt.width || 1;
                        d.height = gewaehlt.height || 1;
                        d.mirrored = !boden && Boolean(hand.gespiegelt.current);
                        d.rotation = boden && hand.rotiert.current ? 90 : 0;
                        dekoVorschau.x = editorSlot.x + kx * TILE_SIZE + TILE_SIZE / 2;
                        dekoVorschau.y = oben + ky * TILE_SIZE + TILE_SIZE / 2;
                        drawState.dekoVorschau = dekoVorschau;
                    }
                }
                renderer.draw(drawState, editorKamera);
                animFrame = requestAnimationFrame(gameLoop);
                return;
            }

            // 3D-Ansicht (engine/welt3d.js): malt statt der Draufsicht, holt sich
            // Boden und Figur aber beim 2D-Renderer ab.
            const welt3d = engine.welt3d;
            if (welt3d?.aktiv) {
                welt3d.zeichne(drawState, player, renderer);
                // Alles Stehende malt der 2D-Renderer obenauf (durchsichtige Leinwand)
                renderer.draw3dStehend(drawState, player, welt3d);
            } else {
                renderer.draw(drawState, player);
            }

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
