// hooks/useSpielflaecheMaus.js
// Maus auf der Spielfläche: Pflanzen, Ernten (auch Shift-Ziehen), Gießen, Abbauen, Deko/Tiere setzen,
// Gebäude verschieben, Zoom per Mausrad, Hover. Ein großer Effekt, ausgelagert aus GameContainer.jsx, Code unverändert.
import { useEffect } from "react";
import { MAP_CONFIG, TILE_SIZE, kachelIstAcker, getMailboxHitArea, getHoveredRock, getHoveredCell, getDirtCellWorldPos } from "../engine/MapConfig";
import { istBoden } from "../ui/deko";
import {
    SCHUPPEN_KACHELN, GEBAEUDE_NAMEN, PET_SLOTS, getPetEmoji, buildPetPreviewImage,
    COLLISION_RADIUS_BY_AREA_TYPE, MAX_PLOT_EXPANSIONS, ZOOM_SCHRITT, ZOOM_MIN, ZOOM_MAX,
} from "../engine/gameConstants";
import { isPlantReady } from "../engine/PlantSystem";

export default function useSpielflaecheMaus({
    showLobbyScreen, canvasRef, hoverStore, shovelHoldTimerRef, shovelHoldProgressRef,
    setShovelHoldState, bodenMalenRef, engineRef, zoomRef, selectedDecoToPlaceRef, editorAktivRef,
    notify, layout, mySlotRef, decoGespiegeltRef, decoRotiertRef, decoPlacementsRef,
    decoInventoryRef, setDecoPlacements, setDecoInventory, setSelectedDecoToPlace,
    isDragHarvestingRef, klickGehoertZuBodenMalenRef, selectedTool, istGartenAdminRef,
    remotePlayersRef, sendShotgun, verschiebtGebaeude, decoPlacements, setGebaeudeVersatz,
    setVerschiebtGebaeude, debouncedSave, selectedSeed, selectedDecoToPlace, selectedPetToPlace,
    setMailboxMode, setMailboxRecipient, plotsRef, setMailboxOpen, petPlacements, setPetInventory,
    setPetPlacements, setSelectedPetToPlace, setShedOpen, plotPlants, handleMineRock,
    handleWaterPlant, handleMovePlantWithPot, handleHarvest, handleCellClick,
    dragHarvestedCellsRef, dragErnteSammlungRef, planeDragErnteFlush, selectedSeedRef,
    flushDragErnte, fremdHoverSlot, shovelHoldStartedAtRef, setPlotPlants, setZoomAnzeige,
    toolInventory, spieleErnteTon, fangeStoerer,
}) {
    // Planting click handler on canvas
    useEffect(() => {
        if (showLobbyScreen) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const onMouseLeave = () => {
            hoverStore.clear();
            if (shovelHoldTimerRef.current) clearTimeout(shovelHoldTimerRef.current);
            if (shovelHoldProgressRef.current) clearInterval(shovelHoldProgressRef.current);
            setShovelHoldState({ active: false, progress: 0 });
            // Sonst malt der Zug weiter, sobald die Maus zurückkommt — auch wenn die
            // Taste längst los ist.
            bodenMalenRef.current = null;
        };
        // Muss die Umkehrung der Kamera im Renderer sein:
        //   translate(mitte) · scale(zoom) · translate(-spieler)
        // Ohne das /zoom greift bei Zoom ≠ 1 jeder Klick und jedes Hover daneben.
        const toWorld = (clientX, clientY) => {
            const rect = canvas.getBoundingClientRect();
            const screenX = clientX - rect.left;
            const screenY = clientY - rect.top;
            const player = engineRef.current.player;
            return {
                worldX: player.x + (screenX - canvas.width / 2) / zoomRef.current,
                worldY: player.y + (screenY - canvas.height / 2) / zoomRef.current,
            };
        };

        /**
         * Ein Stück Deko auf die Kachel unter (worldX, worldY) setzen.
         *
         * Ausgelagert, weil es zwei Wege hierher gibt: den einzelnen Klick und das
         * Ziehen bei Bodenbelägen (ein Hof sind schnell zwanzig Kacheln, und jede
         * einzeln anzuklicken wäre Fleißarbeit).
         *
         * Gelesen wird BEWUSST aus Refs statt aus dem React-State: beim Ziehen
         * folgen die Aufrufe schneller aufeinander, als React neu rendert — mit dem
         * State aus der Schließung sähe jede Kachel den Stand von vor dem Zug und
         * pflasterte immer wieder über dieselbe Stelle.
         *
         * `still` unterdrückt die Meldung — beim Ziehen wäre sie Dauerfeuer.
         */
        const platziereDeko = (worldX, worldY, { still = false } = {}) => {
            const gewaehlt = selectedDecoToPlaceRef.current;
            if (!gewaehlt) return false;
            if (!editorAktivRef.current) {
                if (!still) notify("Deko stellst du im Editor auf.", "error");
                return false;
            }
            const slot = layout.current.slots[mySlotRef.current] || layout.current.slots[0];
            const drawY = slot.isTopRow ? slot.anchorY - MAP_CONFIG.territoryHeight : slot.anchorY;
            // Spiegeln lässt den Fußabdruck unangetastet — die Maße kommen also
            // immer unverändert aus dem Katalog. Beide Flags sind auf ihre jeweilige
            // Deko-Art beschränkt (siehe [R]-Handler oben) — sonst könnte ein Belag,
            // der nach einem gespiegelten Nicht-Belag ausgewählt wird, dessen alten
            // Spiegel-Zustand erben, obwohl [R] für ihn nur noch dreht.
            const gespiegelt = !istBoden(gewaehlt) && Boolean(decoGespiegeltRef.current);
            // Drehen gilt nur für Bodenbeläge — die sind immer 1×1, eine 90°-Drehung
            // ändert also nie den Fußabdruck.
            const gedreht = istBoden(gewaehlt) && Boolean(decoRotiertRef.current);
            const dw = gewaehlt.width || 1;
            const dh = gewaehlt.height || 1;

            // Die angeklickte Kachel ist IMMER die Ankerkachel unten links; von dort
            // wächst das Objekt nach rechts und nach oben. Vorher gab es einen
            // Rückfall auf „nach unten wachsen", wenn es nach oben nicht passte —
            // damit landete derselbe Klick mal so und mal so.
            const tileX = Math.floor((worldX - slot.x) / TILE_SIZE);
            const tileY = Math.floor((worldY - drawY) / TILE_SIZE);

            const maxTilesX = Math.round(MAP_CONFIG.territoryWidth / TILE_SIZE);
            const maxTilesY = Math.round(MAP_CONFIG.territoryHeight / TILE_SIZE);
            // Geprüft wird in KACHELN, nicht mehr in Pixeln — seit dirtOffsetX ganzzahlig
            // ist, fallen Acker- und Dekoraster zusammen. Der alte Pixelvergleich lief mit
            // <= gegen die Ackerkante und sperrte dadurch links wie rechts je eine
            // Grasspalte zu viel. Die Holzwege IM Acker gelten jetzt als Wiese: pflanzen
            // kann man dort ohnehin nicht, schmücken soll man dürfen.
            const liegtAufAcker = (cx, cy) => kachelIstAcker(slot, cx, cy);

            // Ein Belag liegt UNTER allem: er darf über den Acker gehen und stört
            // keine Bank, die schon dort steht. Geprüft wird bei ihm nur, ob die
            // Kachel überhaupt zum Grundstück gehört.
            const istBelag = istBoden(gewaehlt);

            const occupiedKeys = [];
            let ausserhalb = false;
            let ankerAufAcker = false;
            for (let dx = 0; dx < dw; dx++) {
                for (let dy = 0; dy < dh; dy++) {
                    const cx = tileX + dx;
                    const cy = tileY - dy;
                    if (cx < 0 || cx >= maxTilesX || cy < 0 || cy >= maxTilesY) ausserhalb = true;
                    occupiedKeys.push(`${cx}_${cy}`);
                    // Nur die ANKERREIHE muss freie Wiese sein — darauf steht das
                    // Objekt. Was darüber liegt, darf über den Acker ragen; sonst
                    // bekäme man auf dem einreihigen Wiesenstreifen unter dem Acker
                    // überhaupt keine Laterne unter, weil sie zwangsläufig in ihn
                    // hineinreicht.
                    if (!istBelag && dy === 0 && liegtAufAcker(cx, cy)) ankerAufAcker = true;
                }
            }

            if (ausserhalb || ankerAufAcker) {
                if (!still) {
                    notify(ausserhalb
                        ? "Kein Platz — das Objekt ragt über dein Grundstück hinaus."
                        : "Kein Platz — die untere Kachel liegt auf dem Acker.", "error");
                }
                return false;
            }

            // Belag verdrängt Belag, Deko verdrängt nichts. Die beiden Ebenen prüfen
            // also nur gegen ihresgleichen: sonst könnte man weder eine Bank auf den
            // Steinweg stellen noch den Weg unter der Bank weiterziehen.
            //
            // Verglichen wird nur die ANKERREIHE (dy === 0) — genau wie bei der
            // Acker-Prüfung oben. Sonst blockiert der nach oben überstehende Teil
            // hoher Deko (z. B. eine Laterne) das Setzen, sobald irgendetwas anderes
            // über der Ankerkachel steht, obwohl die Ankerkachel selbst frei ist. In
            // `occupiedKeys` liegt dx außen/dy innen (siehe Schleife oben), die
            // Ankerreihe sitzt also bei jedem Index, der glatt durch die Höhe teilbar
            // ist — das gilt genauso für schon vorhandene Platzierungen.
            const ankerreihe = (keys, hoehe) => keys.filter((_, i) => i % hoehe === 0);
            const eigeneAnkerreihe = ankerreihe(occupiedKeys, dh);
            const vorhanden = decoPlacementsRef.current;
            const kollision = vorhanden.filter((d) => {
                if (d.slotIndex !== mySlotRef.current || istBoden(d) !== istBelag) return false;
                const dKeys = d.occupiedKeys || [d.gridKey];
                const dAnkerreihe = ankerreihe(dKeys, d.height || 1);
                return dAnkerreihe.some((k) => eigeneAnkerreihe.includes(k));
            });

            if (kollision.length > 0 && !istBelag) {
                if (!still) notify("Hier steht bereits etwas.", "error");
                return false;
            }
            // Derselbe Belag liegt schon genau dort: nichts tun, statt ein Stück aus
            // dem Vorrat zu verbrauchen. Beim Ziehen über eine bereits gepflasterte
            // Fläche passiert das ständig.
            if (istBelag && kollision.length === 1
                && kollision[0].decoId === gewaehlt.id
                && (kollision[0].occupiedKeys || []).length === occupiedKeys.length) {
                return false;
            }
            // Ein anderer Belag lag dort: er wird überpflastert und wandert zurück
            // in den Rucksack — weggeworfen wird nichts.
            const verdraengt = istBelag ? kollision : [];

            // Mitte der Ankerkachel unten links — der Renderer zeichnet ab hier
            // nach rechts und nach oben.
            const gx = slot.x + tileX * TILE_SIZE + TILE_SIZE / 2;
            const gy = drawY + tileY * TILE_SIZE + TILE_SIZE / 2;

            const placed = {
                id: `placed_${gewaehlt.instanceId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                decoId: gewaehlt.id,
                name: gewaehlt.name,
                emoji: gewaehlt.emoji,
                image: gewaehlt.image,
                rarity: gewaehlt.rarity || "COMMON",
                width: dw,
                height: dh,
                mirrored: gespiegelt,
                rotation: gedreht ? 90 : 0,
                slotIndex: mySlotRef.current,
                x: gx,
                y: gy,
                occupiedKeys,
            };

            const verdraengteIds = new Set(verdraengt.map((d) => d.id));
            const naechstePlatzierungen = [...vorhanden.filter((d) => !verdraengteIds.has(d.id)), placed];

            const zielInstanz = gewaehlt.instanceId || gewaehlt.id;
            const naechsterVorrat = decoInventoryRef.current.filter(
                (d) => (d.instanceId || d.id) !== zielInstanz);
            // Überpflasterte Beläge kommen zurück in den Rucksack, damit Umgestalten
            // nichts kostet.
            for (const alt of verdraengt) {
                naechsterVorrat.push({
                    ...alt,
                    id: alt.decoId || alt.id,
                    instanceId: `deco_ersetzt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                    _type: "deco",
                });
            }
            // Noch ein Stück DERSELBEN Sorte? Dann in der Hand behalten, damit man
            // mehrere hintereinander setzen kann.
            //
            // Vorher stand hier `d.decoId === selectedDecoToPlace.decoId` als zweite
            // Bedingung. Bei Vorratsstücken ist `decoId` auf BEIDEN Seiten undefined —
            // der Vergleich war damit immer wahr und griff das erstbeste Stück
            // irgendeiner Sorte. Wer eine Laterne setzte, hatte danach unbemerkt einen
            // Gartenzwerg in der Hand und stellte ihn mit dem nächsten Klick ab.
            const sorte = gewaehlt.id || gewaehlt.decoId;
            const naechsteWahl = sorte
                ? naechsterVorrat.find((d) => (d.id || d.decoId) === sorte) || null
                : null;

            // Refs SOFORT nachziehen, State danach: die nächste gemalte Kachel liest
            // wieder aus den Refs und muss diese hier schon kennen.
            decoPlacementsRef.current = naechstePlatzierungen;
            decoInventoryRef.current = naechsterVorrat;
            selectedDecoToPlaceRef.current = naechsteWahl;
            setDecoPlacements(naechstePlatzierungen);
            setDecoInventory(naechsterVorrat);
            setSelectedDecoToPlace(naechsteWahl);
            if (!still) notify(`${gewaehlt.name} platziert.`);
            return true;
        };

        const onCanvasClick = (e) => {
            const { worldX, worldY } = toWorld(e.clientX, e.clientY);

            // Mit Shift gehört der Klick zur Schnellernte — die hat beim Drücken
            // schon zugegriffen. Ohne diese Sperre ginge für die letzte Kachel eine
            // zweite Anfrage raus, die der Server nur noch ablehnen kann.
            //
            // OHNE e.shiftKey hier zu verlangen (Bug gefunden 14.09., derselbe Fund
            // wie "gieße, dann kann ich ganz oft einsammeln, Saat kommt wieder"):
            // wer Shift knapp vor oder gleichzeitig mit der Maustaste loslässt, dessen
            // click-Event traegt shiftKey schon als false — genau der Fall, fuer den
            // diese Sperre gedacht ist, griff dann NIE. `isDragHarvestingRef` allein
            // reicht als Signal: es wird nur waehrend eines echten Schnellzugs gesetzt
            // (onCanvasMouseDown, mit Shift geprueft) und erst nach dem Klick wieder
            // zurückgesetzt (stopShovelHold, siehe Kommentar dort) — ob DIESES eine
            // click-Event selbst noch Shift meldet, ist dafuer irrelevant.
            if (isDragHarvestingRef.current) return;

            // Bodenbelag wurde schon bei mousedown gelegt (siehe dort) — dieser
            // Klick ist nur der automatische Nachlauf des Browsers und wird hier
            // konsumiert, BEVOR irgendeine Prüfung `selectedDecoToPlace` (State,
            // kann zu diesem Zeitpunkt noch den Stand von VOR dem mousedown tragen)
            // anfasst. Ohne das fiel der Nachlaufklick, sobald genau diese Kachel
            // den Vorrat auf 0 brachte, weiter unten in den "Deko aufheben"-Zweig
            // durch und hob die gerade gelegte Kachel sofort wieder auf.
            if (klickGehoertZuBodenMalenRef.current) {
                klickGehoertZuBodenMalenRef.current = false;
                return;
            }

            // ── Shotgun ──────────────────────────────────────────────────────
            // Ganz vorne, noch vor der Grundstücksprüfung: geschossen wird auf
            // Mitspieler, nicht auf Kacheln — auch von einem Fleck aus, auf dem
            // sonst nichts zu tun wäre. Getroffen wird der NÄCHSTE Geist im
            // Trefferfeld; ob der Schuss zählt, entscheidet der Server.
            if (selectedTool === "shotgun") {
                if (!istGartenAdminRef.current) return;
                let ziel = null;
                let besteEntfernung = Infinity;
                for (const remote of remotePlayersRef.current.values()) {
                    const dx = worldX - remote.x;
                    // Der Geist wird 80 px hoch über seinem Fusspunkt gezeichnet
                    // (siehe drawPlayer im Renderer) — das Trefferfeld sitzt also
                    // deutlich ÜBER remote.y, nicht darum herum.
                    const dy = worldY - (remote.y - 22);
                    if (Math.abs(dx) > 34 || Math.abs(dy) > 42) continue;
                    const entfernung = dx * dx + dy * dy;
                    if (entfernung < besteEntfernung) {
                        besteEntfernung = entfernung;
                        ziel = remote;
                    }
                }
                if (!ziel) {
                    notify("Daneben — klick direkt auf einen Mitspieler.", "error");
                    return;
                }
                sendShotgun(ziel.twitchId);
                return;
            }

            // Ohne eigenes Grundstück (Welt war voll) ist man nur Zuschauer: nichts
            // pflanzen, ernten oder platzieren — sonst würde die eigene Farm auf dem
            // Acker eines anderen erscheinen.
            if (mySlotRef.current < 0) {
                notify("Du hast in dieser Welt kein Grundstück.", "error");
                return;
            }

            // Schuppen umstellen: derselbe Ablauf wie bei Deko — Modus an, einmal
            // auf die Wiese klicken, fertig. Der Klick setzt die OBERE LINKE Ecke
            // des Fußabdrucks (SCHUPPEN_KACHELN Kacheln im Quadrat) — ALLE Kacheln müssen frei
            // vom Acker und von Deko sein, nicht nur die angeklickte.
            if (verschiebtGebaeude) {
                const slot = layout.current.slots[mySlotRef.current] || layout.current.slots[0];
                const drawY = slot.isTopRow ? slot.anchorY - MAP_CONFIG.territoryHeight : slot.anchorY;
                const tx = Math.floor((worldX - slot.x) / TILE_SIZE);
                const ty = Math.floor((worldY - drawY) / TILE_SIZE);
                const maxTilesX = Math.round(MAP_CONFIG.territoryWidth / TILE_SIZE);
                const maxTilesY = Math.round(MAP_CONFIG.territoryHeight / TILE_SIZE);
                if (tx < 0 || ty < 0 || tx + SCHUPPEN_KACHELN > maxTilesX || ty + SCHUPPEN_KACHELN > maxTilesY) {
                    notify("Der Schuppen passt dort nicht mehr aufs Grundstück.", "error");
                    return;
                }
                const footprint = [];
                for (let dx = 0; dx < SCHUPPEN_KACHELN; dx++) {
                    for (let dy = 0; dy < SCHUPPEN_KACHELN; dy++) {
                        footprint.push([tx + dx, ty + dy]);
                    }
                }
                if (footprint.some(([fx, fy]) => kachelIstAcker(slot, fx, fy))) {
                    notify("Nicht auf dem Acker abstellen.", "error");
                    return;
                }
                const footprintKeys = new Set(footprint.map(([fx, fy]) => `${fx}_${fy}`));
                const belegt = decoPlacements.some((d) =>
                    d.slotIndex === mySlotRef.current &&
                    (d.occupiedKeys || [d.gridKey]).some((k) => footprintKeys.has(k)));
                if (belegt) {
                    notify("Dort steht schon Deko.", "error");
                    return;
                }
                const was = verschiebtGebaeude;
                setGebaeudeVersatz((prev) => ({ ...prev, [was]: { tx, ty } }));
                setVerschiebtGebaeude(null);
                notify(`${GEBAEUDE_NAMEN[was] || "Gebäude"} umgestellt.`);
                debouncedSave();
                return;
            }

            // Briefkasten anklicken: der eigene öffnet den Posteingang, ein fremder
            // direkt das Sendeformular mit vorbelegtem Empfänger.
            if (!selectedTool && !selectedSeed && !selectedDecoToPlace && !selectedPetToPlace) {
                for (const slot of layout.current.slots) {
                    const box = getMailboxHitArea(slot);
                    if (Math.hypot(worldX - box.x, worldY - box.y) > box.radius) continue;
                    const isOwn = slot.id - 1 === mySlotRef.current;
                    if (isOwn) {
                        setMailboxMode("inbox");
                        setMailboxRecipient("");
                    } else {
                        // Der Besitzer eines FREMDEN Grundstücks steht nur in der
                        // Momentaufnahme des Servers — auf `l.slots` wird ausschliesslich
                        // das eigene Schild beschriftet. Hier wurde `slot.owner` gelesen,
                        // das für Nachbarn immer null ist: ein Klick auf deren Briefkasten
                        // meldete deshalb IMMER „Grundstück ist frei". Über die E-Taste
                        // ging es, weil die Spielschleife schon aus plotsRef liest.
                        const besitzer = plotsRef.current.get(slot.id - 1)?.owner || null;
                        if (!besitzer) {
                            notify("Dieses Grundstück ist frei — kein Briefkasten in Betrieb.", "error");
                            return;
                        }
                        setMailboxMode("send");
                        setMailboxRecipient(besitzer);
                    }
                    setMailboxOpen(true);
                    return;
                }
            }

            if (selectedDecoToPlace) {
                platziereDeko(worldX, worldY);
                return;
            }
            if (selectedPetToPlace) {
                const slot = layout.current.slots[mySlotRef.current] || layout.current.slots[0];
                const drawY = slot.isTopRow ? slot.anchorY - MAP_CONFIG.territoryHeight : slot.anchorY;
                const insideOwnPlot = worldX >= slot.x && worldX <= slot.x + MAP_CONFIG.territoryWidth
                    && worldY >= drawY && worldY <= drawY + MAP_CONFIG.territoryHeight;
                if (!insideOwnPlot) {
                    notify("Tier bitte innerhalb deiner Grundstücksgrenzen platzieren.", "error");
                    return;
                }

                // Drei Plätze, einer je Fähigkeit.
                const myPetsCount = petPlacements.filter(p => p.slotIndex === mySlotRef.current).length;
                if (myPetsCount >= PET_SLOTS) {
                    notify(`Alle ${PET_SLOTS} Tier-Plätze sind belegt — pack erst eins ein.`, "error");
                    return;
                }

                const petId = selectedPetToPlace.id || selectedPetToPlace.instanceId || `${selectedPetToPlace.name}_${Date.now()}`;
                setPetInventory((prev) => prev.filter((pet) => (pet.id || pet.instanceId) !== (selectedPetToPlace.id || selectedPetToPlace.instanceId)));
                setPetPlacements((prev) => ([
                    ...prev,
                    {
                        // Dieselbe Kennung wie im Rucksack: der Server erkennt das Tier
                        // beim Speichern daran wieder (gleicheTiereAb im Backend).
                        id: petId,
                        slotIndex: mySlotRef.current,
                        name: selectedPetToPlace.name,
                        customName: selectedPetToPlace.customName || null,
                        specialType: selectedPetToPlace.specialType || null,
                        rarity: selectedPetToPlace.rarity || "COMMON",
                        emoji: selectedPetToPlace.emoji || getPetEmoji(selectedPetToPlace.name),
                        image: selectedPetToPlace.image || buildPetPreviewImage(selectedPetToPlace.name),
                        ability: selectedPetToPlace.ability, // 3. ANPASSUNG: Ability übernehmen
                        x: worldX,
                        y: worldY,
                        vx: 0,
                        vy: 0,
                        changeDirAt: 0,
                    },
                ]));
                setSelectedPetToPlace(null);
                notify(`${selectedPetToPlace.name} platziert.`);
                return;
            }
            if (!selectedTool || selectedTool === "shovel") {

                // Tiere werden hier BEWUSST nicht mehr angeklickt.
                // Die Game-Loop bewegt `engine.petPlacements` (eine Kopie); der React-State
                // behält die Startkoordinaten. Ein Klicktest dagegen traf deshalb dauerhaft
                // die Stelle, an der das Tier ursprünglich abgesetzt wurde — quer über die
                // Farm verteilt, und z. B. beim Klick auf den Pool. Das Detailfenster geht
                // jetzt ausschließlich über die Tierliste oben rechts auf.

                // Deko einpacken — NUR im Einrichtungs-Modus.
                //
                // Vorher genügte irgendein Linksklick in die Nähe: beim Laufen, beim
                // Ernten, beim Anklicken des Briefkastens. Wer sein Grundstück
                // eingerichtet hatte, räumte es beim Spielen versehentlich wieder ab.
                //
                // Was OBEN liegt, kommt zuerst: seit es Bodenbeläge gibt, steht auf
                // derselben Kachel oft beides. Ohne diese Reihenfolge hätte ein Klick
                // auf die Bank je nach Reihenfolge in der Liste die Steinplatte
                // darunter aufgehoben und die Bank stehen lassen.
                const trifft = (d) => {
                    if (d.slotIndex !== mySlotRef.current) return false;
                    const radius = 60 * Math.max(d.width || 1, d.height || 1) * 0.7;
                    return Math.hypot(worldX - d.x, worldY - d.y) < radius;
                };
                let decoIdx = -1;
                if (editorAktivRef.current) {
                    decoIdx = decoPlacements.findIndex((d) => !istBoden(d) && trifft(d));
                    if (decoIdx === -1) decoIdx = decoPlacements.findIndex((d) => istBoden(d) && trifft(d));
                }

                if (decoIdx !== -1) {
                    const deco = decoPlacements[decoIdx];
                    setDecoPlacements(prev => prev.filter((_, i) => i !== decoIdx));
                    setDecoInventory(prev => [...prev, {
                        ...deco,
                        id: deco.decoId || deco.id,
                        instanceId: `deco_pickup_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                        _type: "deco",
                    }]);
                    notify(`${deco.name || "Deko"} aufgehoben.`);
                    return;
                }
            }

            // Schuppen direkt anklicken (Feedback 30.08.: "im Editor den Schuppen
            // anklickbar machen") — bisher ging das nur über die E-Taste in der
            // Nähe, ein Klick direkt auf das Gebäude tat nichts. Gilt in UND
            // außerhalb des Editors, konsistent damit, dass Deko sich im Editor
            // ebenfalls per Klick greifen lässt statt nur über die E-Taste.
            const eigenerSchuppen = engineRef.current?.areas?.shed;
            if (eigenerSchuppen && eigenerSchuppen.aktiv !== false) {
                const distSchuppen = Math.hypot(worldX - eigenerSchuppen.x, worldY - eigenerSchuppen.y);
                if (distSchuppen < COLLISION_RADIUS_BY_AREA_TYPE.shed) {
                    setShedOpen(true);
                    return;
                }
            }

            const mySlot = layout.current.slots[mySlotRef.current] || layout.current.slots[0];
            const hoveredRock = getHoveredRock(mySlot, worldX, worldY, MAX_PLOT_EXPANSIONS);
            const hovered = getHoveredCell(mySlot, worldX, worldY, plotPlants);
            if (selectedTool === "pickaxe") {
                if (hoveredRock) {
                    handleMineRock(hoveredRock);
                } else {
                    notify("Mit Spitzhacke nur auf Stein-Felder klicken.", "error");
                }
                return;
            }
            if (!hovered) {
                hoverStore.clear();
                return;
            }
            // Käfer/Unkraut zuerst: wer auf einen Käfer klickt, will ihn fangen — nicht
            // die Pflanze darunter ernten oder gießen (Backend core/stoerer.js).
            const stoererHier = stoererAuf(`${hovered.cellX}_${hovered.cellY}`);
            if (stoererHier) {
                fangeStoerer(stoererHier);
                return;
            }
            if (selectedTool === "watering") {
                handleWaterPlant(hovered.cellX, hovered.cellY);
                return;
            }
            if (selectedTool === "pot") {
                handleMovePlantWithPot(hovered.cellX, hovered.cellY);
                return;
            }
            if (selectedTool === "shovel") {
                    notify("Klicke direkt auf ein Tier oder Deko zum Aufheben.");
                    return;
            }

            const key = `${hovered.cellX}_${hovered.cellY}`;
            const hoveredPlant = plotPlants[key];
            if (hoveredPlant && isPlantReady(hoveredPlant)) {
                handleHarvest(key, hoveredPlant);
                return;
            }
            handleCellClick(hovered.cellX, hovered.cellY);
        };

        /**
         * Eine Zelle im Schnellzug abernten ODER bepflanzen — je nachdem, was dort
         * steht und was in der Hand ist. Dieselbe Regel wie beim Einzelklick (siehe
         * onCanvasClick weiter unten: reif → ernten, sonst → mit ausgewähltem
         * Samen pflanzen), nur übers ganze Feld gezogen statt Kachel für Kachel
         * angeklickt (Feedback 30.08.: "Shift+Halten soll auch pflanzen, wenn man
         * Samen hält").
         *
         * Der Acker kommt aus `engineRef` statt aus dem React-State: `handleHarvest`
         * und `handleCellClick` sind asynchron bzw. laufen über setState, und bei
         * einem zügigen Zug liegen mehrere Aktionen zwischen zwei Bildaufbauten. Die
         * Schließung hier zeigte dann noch den Stand von vor dem Zug.
         * `dragHarvestedCellsRef` verhindert zusätzlich, dass dieselbe Kachel
         * zweimal losgeschickt wird — ob geerntet oder bepflanzt, EINE Aktion je
         * Kachel und Zug reicht.
         */
        /** Lebender Käfer/Unkraut auf dieser Zelle des eigenen Ackers, sonst null. */
        const stoererAuf = (key) => {
            const jetzt = Date.now();
            return (engineRef.current.stoerer || []).find((s) => s.key === key && Number(s.bis) > jetzt) || null;
        };

        const ernteBeiZug = (worldX, worldY) => {
            const mySlot = layout.current.slots[mySlotRef.current] || layout.current.slots[0];
            const acker = engineRef.current.plotPlants || plotPlants;
            const treffer = getHoveredCell(mySlot, worldX, worldY, acker);
            if (!treffer) return;
            const key = `${treffer.cellX}_${treffer.cellY}`;
            // Der Zug nimmt Käfer und Unkraut gleich mit (fangeStoerer sperrt Doppelte).
            const stoererHier = stoererAuf(key);
            if (stoererHier) fangeStoerer(stoererHier);
            if (dragHarvestedCellsRef.current.has(key)) return;
            const pflanze = acker[key];
            if (pflanze && isPlantReady(pflanze)) {
                dragHarvestedCellsRef.current.add(key);
                // Sofort-Rückmeldung (04.11.): Ton, kleiner Funkenstoß und die Frucht, die
                // aufsteigt — schon beim BERÜHREN, nicht erst mit der Serverantwort.
                // Vorher geschah beim Drüberziehen sichtbar nichts, bis das gesammelte
                // Bündel (120 ms) beim Server war; das fühlte sich zäh an. Gold und XP
                // erscheinen weiterhin erst mit der Antwort (handleHarvestMany).
                spieleErnteTon();
                const renderer = engineRef.current?.renderer;
                if (renderer) {
                    const pos = getDirtCellWorldPos(mySlot, treffer.cellX, treffer.cellY);
                    const mx = pos.x + TILE_SIZE / 2;
                    const my = pos.y + TILE_SIZE / 2;
                    renderer.spawnFunken(mx, my, "Ernte");
                    renderer.spawnItemFlug(mx, my, pflanze.harvestImage || pflanze.fruitImage || pflanze.growthImage, pflanze.emoji);
                }
                // Nur SAMMELN, nicht sofort abschicken (siehe handleHarvestMany):
                // ein Zug über ein volles Feld berührt oft dutzende Zellen, ein
                // Request je Zelle bedeutete ebenso viele Rendervorgänge kurz
                // hintereinander — spürbar als Lag, besonders wenn dabei auch noch
                // ein Tier- oder Skill-Ereignis eintraf (Feedback 30.08., zweite
                // Runde). planeDragErnteFlush sammelt kurz (120ms) und schickt dann
                // ALLE seither berührten Zellen in einem einzigen Aufruf.
                dragErnteSammlungRef.current.set(key, pflanze);
                planeDragErnteFlush();
                return;
            }
            // Leere Zelle plus ein Samen in der Hand: pflanzen statt ernten.
            if (!pflanze && selectedSeedRef.current) {
                dragHarvestedCellsRef.current.add(key);
                handleCellClick(treffer.cellX, treffer.cellY);
            }
        };

        const onCanvasMove = (e) => {
            const rect = canvas.getBoundingClientRect();
            const clientXLocal = e.clientX - rect.left;
            const clientYLocal = e.clientY - rect.top;
            const { worldX, worldY } = toWorld(e.clientX, e.clientY);

            // Boden malen, solange die Taste hängt. Still, sonst käme pro Kachel eine
            // Meldung. Ist der Vorrat leer, setzt platziereDeko die Auswahl auf null
            // und der Zug läuft von selbst aus.
            if (bodenMalenRef.current) {
                if (!selectedDecoToPlaceRef.current) bodenMalenRef.current = null;
                else platziereDeko(worldX, worldY, { still: true });
                return;
            }

            // Schnellernte, solange die linke Taste hängt. `e.buttons` fragt den
            // TATSÄCHLICHEN Zustand ab: wird die Taste ausserhalb der Leinwand oder
            // über einem Fenster losgelassen, kommt kein mouseup an, und der Zug
            // lief sonst weiter, sobald die Maus zurückkam.
            if (isDragHarvestingRef.current) {
                if (!(e.buttons & 1)) {
                    isDragHarvestingRef.current = false;
                    dragHarvestedCellsRef.current = new Set();
                    flushDragErnte();
                } else {
                    ernteBeiZug(worldX, worldY);
                    // Während des Zugs keine Pflanzen-Karte: sie sprang von Zelle zu
                    // Zelle mit und verdeckte genau den Acker, über den man gerade zieht.
                    hoverStore.clear();
                    return;
                }
            }

            // Erst der eigene Acker (der häufige Fall), dann die fremden. Fremde
            // Pflanzen sind nur zum Ansehen — geerntet wird nichts, aber Größe,
            // Wert und Restzeit stehen genauso in der Karte.
            const meinIndex = mySlotRef.current;
            const mySlot = layout.current.slots[meinIndex] || layout.current.slots[0];
            const eigene = getHoveredCell(mySlot, worldX, worldY, plotPlants);
            if (eigene) {
                const zelle = `${eigene.cellX}_${eigene.cellY}`;
                // Schreibt in den externen Store; meldet nur bei Zellwechsel.
                if (plotPlants[zelle]) hoverStore.set({ key: `${meinIndex}:${zelle}`, x: clientXLocal, y: clientYLocal });
                else hoverStore.clear();
                return;
            }

            for (const [slotIndex, snapshot] of plotsRef.current) {
                if (slotIndex === meinIndex) continue;
                const slot = layout.current.slots[slotIndex];
                if (!slot || !snapshot?.plants) continue;
                // Die Freischaltungen des ANDEREN, sonst treffen dessen Erweiterungs-
                // reihen ins Leere. `slot` selbst wird dabei nicht verändert.
                fremdHoverSlot.x = slot.x;
                fremdHoverSlot.anchorY = slot.anchorY;
                fremdHoverSlot.isTopRow = slot.isTopRow;
                fremdHoverSlot.unlockedCells = snapshot.plotUnlockedCells || [];
                const treffer = getHoveredCell(fremdHoverSlot, worldX, worldY, snapshot.plants);
                if (!treffer) continue;
                const zelle = `${treffer.cellX}_${treffer.cellY}`;
                if (snapshot.plants[zelle]) {
                    hoverStore.set({ key: `${slotIndex}:${zelle}`, x: clientXLocal, y: clientYLocal });
                    return;
                }
            }
            hoverStore.clear();
        };

        const onCanvasMouseDown = (e) => {
            // Bodenbeläge malt man: Taste halten und ziehen. Der erste Klick liegt
            // schon hier, damit auch ein kurzer Klick ohne Bewegung eine Kachel legt
            // — `click` kommt danach und findet die Kachel bereits belegt.
            if (istBoden(selectedDecoToPlaceRef.current) && editorAktivRef.current) {
                const { worldX, worldY } = toWorld(e.clientX, e.clientY);
                bodenMalenRef.current = true;
                klickGehoertZuBodenMalenRef.current = true;
                platziereDeko(worldX, worldY);
                return;
            }
            if (selectedTool === "shovel") {
                const { worldX, worldY } = toWorld(e.clientX, e.clientY);
                const mySlot = layout.current.slots[mySlotRef.current] || layout.current.slots[0];
                const hovered = getHoveredCell(mySlot, worldX, worldY, plotPlants);
                if (!hovered) return;
                const key = `${hovered.cellX}_${hovered.cellY}`;
                if (!plotPlants[key]) return;
                if (shovelHoldTimerRef.current) clearTimeout(shovelHoldTimerRef.current);
                if (shovelHoldProgressRef.current) clearInterval(shovelHoldProgressRef.current);
                shovelHoldStartedAtRef.current = Date.now();
                setShovelHoldState({ active: true, progress: 0 });
                shovelHoldProgressRef.current = setInterval(() => {
                    const progress = Math.min(1, (Date.now() - shovelHoldStartedAtRef.current) / 900);
                    setShovelHoldState({ active: true, progress });
                }, 33);
                shovelHoldTimerRef.current = setTimeout(async () => {
                    setPlotPlants(prev => {
                        const next = { ...prev };
                        delete next[key];
                        return next;
                    });
                    notify("Pflanze entfernt.");
                    if (shovelHoldProgressRef.current) clearInterval(shovelHoldProgressRef.current);
                    setShovelHoldState({ active: false, progress: 0 });
                }, 900);
                return;
            }
            // ── Schnellzug: Shift halten und ziehen — erntet ODER pflanzt ────
            //
            // Vorher lief das ohne Shift und startete NUR, wenn schon die erste
            // Zelle unter dem Zeiger reif war. Beides war falsch: wer auf eine leere
            // Kachel oder eine unreife Pflanze drückte und dann über ein volles Feld
            // zog, erntete gar nichts — und wer nur die Ansicht verschieben wollte,
            // erntete versehentlich eine halbe Reihe ab.
            //
            // Jetzt ist Shift der Schalter: gedrückt wird geerntet ODER bepflanzt,
            // was der Zeiger berührt (siehe ernteBeiZug), egal womit der Zug
            // angefangen hat. Ein ausgewählter Samen blockiert den Zug nicht mehr
            // (Feedback 30.08.) — er ist jetzt der Grund, WARUM leere Zellen
            // bepflanzt statt übersprungen werden. Ohne Shift bleibt es beim
            // einzelnen Klick.
            if (e.shiftKey && !selectedTool && !selectedPetToPlace && !selectedDecoToPlace) {
                const { worldX, worldY } = toWorld(e.clientX, e.clientY);
                isDragHarvestingRef.current = true;
                dragHarvestedCellsRef.current = new Set();
                ernteBeiZug(worldX, worldY);
            }
        };

        const stopShovelHold = () => {
            if (shovelHoldTimerRef.current) clearTimeout(shovelHoldTimerRef.current);
            if (shovelHoldProgressRef.current) clearInterval(shovelHoldProgressRef.current);
            setShovelHoldState({ active: false, progress: 0 });
            // GEFUNDEN (Feedback 01.09.: "shift + leftclick... Ton, aber nichts
            // geerntet, weil beim ersten Shift+Klick schon alles weg war"):
            // Der Browser feuert nach JEDEM mouseup auf der Leinwand automatisch
            // ein click — auch nach einem reinen Shift-Klick ohne Zug. Die Sperre
            // in onCanvasClick ("Mit Shift gehört der Klick zur Schnellernte")
            // prüft isDragHarvestingRef, aber die Zeile hier setzte das Flag schon
            // VOR diesem click zurück, die Sperre griff also nie. Ergebnis: der
            // click las die noch nicht aktualisierten plotPlants (harvestMany
            // läuft ja noch), hielt die Staude für reif und schickte per
            // handleHarvest eine ZWEITE, unabhängige Ernte-Anfrage für dieselbe
            // Zelle los — mit ihrem EIGENEN, ebenso veralteten Vorher-Stand. Kam
            // deren Antwort NACH der von handleHarvestMany zurück, überschrieb sie
            // einen bereits geleerten Fruchtstand wieder mit dem alten (scheinbar
            // reifen) Stand — sichtbar reife Frucht, die der Server längst nicht
            // mehr hat. Der Ton kam vom zweiten, überflüssigen handleHarvest-Aufruf
            // (der spielt ihn optimistisch VOR der Server-Antwort).
            //
            // Fix: das Flag bleibt bis nach dem click-Event stehen (setTimeout 0
            // schiebt den Reset einen Tick weiter) — dieselbe Reihenfolge wie
            // mousedown → mouseup → click, nur dass die Sperre jetzt tatsächlich
            // noch etwas zum Sperren vorfindet.
            setTimeout(() => { isDragHarvestingRef.current = false; }, 0);
            dragHarvestedCellsRef.current = new Set();
            flushDragErnte();
            // Ein Malzug endet mit der Maustaste — auch wenn sie ausserhalb der
            // Leinwand losgelassen wird (mouseleave ruft dasselbe auf).
            bodenMalenRef.current = null;
        };

        // Mausrad zoomt. passive:false, sonst scrollt die Seite darunter mit.
        const onWheel = (e) => {
            e.preventDefault();
            const richtung = e.deltaY > 0 ? 1 / ZOOM_SCHRITT : ZOOM_SCHRITT;
            const neu = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoomRef.current * richtung));
            if (neu === zoomRef.current) return;
            zoomRef.current = neu;
            setZoomAnzeige(neu);
            // Die Hover-Karte hing sonst an der alten Zelle: der Weltpunkt unter der
            // Maus ist nach dem Zoomen ein anderer.
            hoverStore.clear();
        };

        canvas.addEventListener("click", onCanvasClick);
        canvas.addEventListener("mousemove", onCanvasMove);
        canvas.addEventListener("mouseleave", onMouseLeave);
        canvas.addEventListener("mousedown", onCanvasMouseDown);
        canvas.addEventListener("mouseup", stopShovelHold);
        canvas.addEventListener("wheel", onWheel, { passive: false });
        return () => {
            canvas.removeEventListener("click", onCanvasClick);
            canvas.removeEventListener("mousemove", onCanvasMove);
            canvas.removeEventListener("mouseleave", onMouseLeave);
            canvas.removeEventListener("mousedown", onCanvasMouseDown);
            canvas.removeEventListener("mouseup", stopShovelHold);
            canvas.removeEventListener("wheel", onWheel);
            // KEIN stopShovelHold() mehr.
            //
            // Dieser Effekt hängt an `plotPlants` — die erste geerntete Pflanze
            // setzt ihn also selbst neu auf, und der Aufräumer beendete dabei das
            // Ziehen, das gerade lief. Ergebnis: Drag-Harvest erwischte genau EINE
            // Pflanze, danach musste man wieder einzeln klicken. Dasselbe brach
            // das Schaufel-Halten ab, sobald irgendwo eine Frucht nachwuchs.
            // Losgelassen wird über mouseup/mouseleave (beide werden hier gleich
            // wieder registriert), beim echten Unmount über den Effekt weiter oben.
        };
        // petPlacements und toolInventory fehlten hier: die Platzgrenze rechnete mit
        // dem Stand vom letzten Rendern dieses Effekts.
    }, [showLobbyScreen, handleCellClick, handleHarvest, planeDragErnteFlush, flushDragErnte, handleMineRock, handleMovePlantWithPot, handleWaterPlant, notify, plotPlants, selectedTool, selectedPetToPlace, selectedDecoToPlace, decoPlacements, petPlacements, toolInventory, hoverStore, verschiebtGebaeude, debouncedSave, plotsRef, remotePlayersRef, sendShotgun, spieleErnteTon, fangeStoerer]);
}
