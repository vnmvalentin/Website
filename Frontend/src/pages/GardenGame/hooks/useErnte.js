// hooks/useErnte.js
// Ernte: Klick aufs Feld (säen/ernten), Einzelernte, Mehrfachernte und Shift-Ziehen (gesammelt
// und verzögert an den Server). Ausgelagert aus GameContainer.jsx, Code unverändert.
import { useEffect, useCallback, useRef } from "react";
import { getGaertnerWurzelwerk, getGaertnerStufe } from "../engine/PetSystem";
import { wachstumBeschleunigen, ERNTE_WARTESCHLANGE_MAX } from "../engine/gameConstants";
import { createPlantInstance, isPlantReady } from "../engine/PlantSystem";
import { getDirtCellWorldPos, TILE_SIZE } from "../engine/MapConfig";
import { formatGold } from "../ui/gardenTokens";

export default function useErnte({
    handleBuySeedAllRef, handleBuySeedAll, handleBuySeedRef, handleBuySeed, selectedSeed,
    inventory, plotPlants, petPlacements, mySlotRef, skillWirkung, partyLaeuftJetzt, setPlotPlants,
    playSound, layout, engineRef, setInventory, setSelectedSeed, debouncedSave, notify,
    ernteLaeuftRef, ernteWarteschlangeRef, apiCall, kreuzungenAufnehmen, isDragHarvestingRef,
    applyEconomy, hydratePlantVisuals, letzteErnteRef, uebernimmVomServer, farmStateRef, flushSave,
    handleHarvestRef, dragErnteFlushTimerRef, dragErnteSammlungRef, spieleErnteTon,
}) {
    useEffect(() => { handleBuySeedAllRef.current = handleBuySeedAll; }, [handleBuySeedAll]);

    // Ueber ein Ref, damit ein eingereihter Klick sich selbst nachreichen kann.
    useEffect(() => { handleBuySeedRef.current = handleBuySeed; }, [handleBuySeed]);

    // ── Plant seed in cell ────────────────────────────────────────────────────
    const handleCellClick = useCallback(async (cellX, cellY) => {
        const seedToPlant = selectedSeed || inventory[0];
        if (!seedToPlant) return;
        const key = `${cellX}_${cellY}`;
        // Bewusst ohne Hinweis: beim schnellen Pflanzen trifft man oft zweimal
        // dieselbe Zelle, und eine Fehlermeldung dafuer stoert mehr als sie hilft.
        if (plotPlants[key]) return;

        // „Grüner Daumen" plus „Wurzelwerk" des Gärtners — dieselbe Rechnung wie
        // serverseitig in wachstumsBonus() (garden/core/economy.js), damit eine von
        // Hand gesetzte Pflanze nicht anders wächst als eine nachgewachsene.
        const wurzelwerk = getGaertnerWurzelwerk(
            getGaertnerStufe(petPlacements, mySlotRef.current), skillWirkung("zuechter"));
        const plant = wachstumBeschleunigen(
            createPlantInstance(seedToPlant, cellX, cellY, partyLaeuftJetzt()),
            Math.min(0.8, skillWirkung("gruener_daumen") + wurzelwerk),
            Date.now(),
        );
        setPlotPlants(prev => ({ ...prev, [key]: plant }));
        playSound("plant", 0.5);
        // v2 (Feedback 28.08.): Pflanz-Wurf — das Tütchen fällt sichtbar auf die
        // Zelle, statt dass die Pflanze kommentarlos erscheint (siehe spawnSaatWurf).
        const pflanzMySlot = layout.current.slots[mySlotRef.current] || layout.current.slots[0];
        const pflanzWeltPos = pflanzMySlot ? getDirtCellWorldPos(pflanzMySlot, cellX, cellY) : null;
        if (pflanzWeltPos) {
            engineRef.current?.renderer?.spawnSaatWurf(
                pflanzWeltPos.x + TILE_SIZE / 2, pflanzWeltPos.y + TILE_SIZE / 2,
                seedToPlant.seedImage || seedToPlant.image, seedToPlant.emoji,
            );
        }
        setInventory(inv => {
            const nextInv = inv.filter(s => s.instanceId !== seedToPlant.instanceId);
            const nextSelected = nextInv.find(s => s.seedId === seedToPlant.seedId) || nextInv[0] || null;
            setSelectedSeed(nextSelected);
            return nextInv;
        });
        debouncedSave();
    }, [selectedSeed, inventory, plotPlants, notify, debouncedSave, skillWirkung, petPlacements]);

    // ── Harvest plant ─────────────────────────────────────────────────────────
    // Wert, Groesse, Sonderform und Wetterbonus rechnet weiterhin ausschliesslich
    // der Server. Die OPTIK laeuft aber voraus: die Zelle wird sofort geleert,
    // statt erst nach der Antwort. Vorher lag zwischen Klick und Reaktion eine
    // ganze Netzrunde — das war der Grund, warum sich das Einsammeln zaeh anfuehlte.
    // Lehnt der Server ab, steht die Pflanze wieder da.
    const handleHarvest = useCallback(async (key, plant) => {
        if (!isPlantReady(plant)) return;
        // Eine Zelle darf nur EINE Ernte gleichzeitig unterwegs haben — sonst schickt
        // ein zweiter Klick eine Anfrage los, die der Server ablehnt.
        //
        // Klicks während dieser Zeit wurden aber bisher WEGGEWORFEN. Eine Ernte
        // kostet eine Netzrunde; auf einer Verbindung mit 250 ms kam so nur jeder
        // zweite Klick an, bei schlechterer Leitung noch weniger. An einer Staude mit
        // acht reifen Früchten fühlte sich das an, als wäre die Maus gedrosselt.
        // Jetzt werden sie angestellt und der Reihe nach abgearbeitet.
        if (ernteLaeuftRef.current.has(key)) {
            const offen = ernteWarteschlangeRef.current.get(key) || 0;
            if (offen < ERNTE_WARTESCHLANGE_MAX) ernteWarteschlangeRef.current.set(key, offen + 1);
            return;
        }
        ernteLaeuftRef.current.add(key);
        // Derselbe Ketten-Ton wie beim Shift-Ziehen: schnell hintereinander geklickt steigt er.
        spieleErnteTon();
        const vorherigerStand = plant;
        setPlotPlants((prev) => {
            const p = prev[key];
            if (!p) return prev;
            const next = { ...prev };
            if (p.singleUse !== false) {
                delete next[key];
                return next;
            }
            // Dauertraeger: die am laengsten reife Frucht optisch zuruecksetzen —
            // dieselbe Auswahl wie auf dem Server, damit nichts springt.
            const slots = Array.isArray(p.fruitSlots) ? p.fruitSlots : [];
            const jetzt = Date.now();
            let idx = -1; let aeltester = Infinity;
            for (let i = 0; i < slots.length; i++) {
                const ra = Number(slots[i]?.readyAt ?? Infinity);
                if (ra <= jetzt && ra < aeltester) { aeltester = ra; idx = i; }
            }
            if (idx === -1) return prev;
            const neueSlots = slots.slice();
            neueSlots[idx] = {
                ...neueSlots[idx],
                // ×1,2 statt ×1 (Bug gefunden 01.09.: "beim Anklicken auf Multipflanzen,
                // die bereits standen, 400 Bad Request"). Der Server würfelt den
                // nachgewachsenen Fruchtstand bewusst OHNE Seed (neuerFruchtstand in
                // core/economy.js, ×0,8 bis ×1,2 vom Zyklus — absichtlich nicht
                // vorhersagbar, siehe Kommentar dort). Diese Vorschau hier riet bisher
                // glatt ×1 — lag der Server-Wurf darüber (rund die Hälfte der Fälle),
                // zeigte die Staude sich hier schon reif, während der Server beim
                // Klick noch "Noch nicht reif."/"Keine reife Frucht." ablehnte. Bei
                // einem 3-Stunden-Strauch (Blaubeere, Erdbeere) blieb das bis zu 36
                // Minuten lang so UND wurde bei jedem Klick sofort zurückgerollt (siehe
                // "veraltet" unten) — die Staude wirkte dauerhaft blockiert. ×1,2 ist die
                // obere Grenze des Server-Wurfs: die Vorschau darf jetzt spät liegen,
                // nie mehr zu früh.
                readyAt: jetzt + Math.round((Number(p.fruitCycleMs) || 60000) * 1.2),
                statusEffects: [], statusEffect: null, statusEffectUntil: null, specialType: null,
            };
            next[key] = { ...p, fruitSlots: neueSlots };
            return next;
        });
        const ernte = () => apiCall("/action", {
            method: "POST",
            body: JSON.stringify({ action: "harvest", key }),
        });
        // Weltposition der Zelle für die Rückmeldungsschicht (siehe unten) — einmal
        // pro Ernte reicht, die Zelle bewegt sich während der Anfrage nicht.
        const [ernteZellX, ernteZellY] = key.split("_").map(Number);
        const ernteMySlot = layout.current.slots[mySlotRef.current] || layout.current.slots[0];
        const ernteWeltPos = ernteMySlot ? getDirtCellWorldPos(ernteMySlot, ernteZellX, ernteZellY) : null;

        /**
         * Gold-Text, Doppelernte-Hinweis und Nachwuchs-Meldung an der Zelle — die
         * gemeinsame Rückmeldungsschicht aus engine/Renderer.js (spawnFeedback).
         */
        const zeigeErnteFeedback = (data, nachwuchs) => {
            if (data?.kreuzung) kreuzungenAufnehmen([data.kreuzung], ernteWeltPos);
            const renderer = engineRef.current?.renderer;
            if (!renderer || !ernteWeltPos) return;
            const x = ernteWeltPos.x + TILE_SIZE / 2;
            const y = ernteWeltPos.y + TILE_SIZE / 2;
            // Beim Shift-Klick-Ziehen über ein volles Feld (viele Dauerträger mit
            // vielen Fruchtständen) läuft diese Funktion dutzendfach in Sekunden —
            // Feedback: "dann kommt ja alles voller Zahlen". Die Flug-Animation
            // (ein eigenes Bild pro Ernte, das aufsteigt) fällt während des Ziehens
            // weiterhin weg — reiner Text ist billig zu zeichnen, ein Dutzend
            // fliegender Bilder gleichzeitig nicht.
            //
            // Die XP-Zahl blieb dabei erst versehentlich mit weg (Feedback 30.08.:
            // "XP zeigen sich nicht beim Schnellernten") — das war nie Absicht, nur
            // dieselbe Bedingung wie beim Flug-Bild wiederverwendet. Text kostet
            // beim Zeichnen so gut wie nichts, die Gold-Zahl blieb ja auch die
            // ganze Zeit sichtbar — jetzt läuft die XP-Zahl genauso mit.
            const kompakt = isDragHarvestingRef.current;
            if (data?.item) {
                const special = data.item.specialData?.name;
                const farbe = special === "Rainbow" ? "#f472b6" : special === "Golden" ? "#fde047" : "#fef08a";
                // Keine Emoji-Icons mehr (siehe Feedback: "sieht billig/nach KI aus") —
                // Farbe und Text unterscheiden Gold/Golden/Rainbow schon eindeutig.
                renderer.spawnFeedback(x, y, `+${formatGold(data.item.sellValue)}`, { color: farbe });
                // Golden/Rainbow bekommen einen eigenen kurzen Moment: Funken + Klang.
                if (special === "Golden" || special === "Rainbow") {
                    renderer.spawnFunken(x, y, special);
                    playSound("cash", special === "Rainbow" ? 0.55 : 0.35);
                }
                // XP direkt darunter, in derselben Ernte-Rückmeldung — vorher stand die
                // Erfahrung nirgends am Ort des Geschehens, nur im Fähigkeitsbaum-Fenster.
                const xp = Number(data?.erfahrung?.xp) || 0;
                if (xp > 0) {
                    renderer.spawnFeedback(x, y + 16, `+${xp} XP`, { color: "#a78bfa", durationMs: 950 });
                }
                if (kompakt) return;
                // v2 (Punkt 13, "Erntesamen-Flug"): das Stück fliegt sichtbar weg,
                // statt kommentarlos im Rucksack aufzutauchen — siehe spawnItemFlug.
                // Bild/Emoji kommen von der LOKALEN Pflanze, nicht aus `data.item`:
                // der Server liefert nur Werte (siehe baueItem in economy.js), keine
                // Bildpfade — die stehen ausschliesslich im Katalog, den nur der
                // Client kennt.
                renderer.spawnItemFlug(x, y, plant.harvestImage || plant.fruitImage || plant.image || plant.growthImage, plant.emoji);
            }
            if (data?.zweites) {
                // Eigene Farbe und leicht versetzt, damit klar ist: DAS ist der Bonus aus
                // „Reiche Ernte"/Erntehelfer, nicht dieselbe Ernte doppelt angezeigt.
                renderer.spawnFeedback(x, y - 18, `2× +${formatGold(data.zweites.sellValue)}`, { color: "#c4b5fd" });
            }
            if (nachwuchs) {
                renderer.spawnFeedback(x, y - 32, "Nachwuchs!", { color: "#86efac", durationMs: 1300 });
            }
        };

        /**
         * Antwort übernehmen, OHNE den eigenen Acker zu verwerfen.
         *
         * Vorher ersetzte die Antwort die ganze Pflanze durch die Server-Fassung. Der
         * Acker gehört aber dem Browser und erreicht den Server nur alle fünf Sekunden:
         * jeder Fruchtstand, der seit dem letzten Speichern reif geworden war, ging
         * dabei verloren. An einer Staude mit acht reifen Früchten kam deshalb genau
         * EINE durch — danach hielt der Browser die Pflanze für leer und man wartete
         * auf das Nachwachsen. Genau das fühlte sich wie eine gedrosselte Maus an.
         *
         * Jetzt wird nur der eine nachgewachsene Fruchtstand übernommen (den würfelt
         * weiterhin der Server), der Rest bleibt beim Browser.
         */
        // Gibt die Pflanze zurück, wie sie danach dasteht — die angestellte nächste
        // Ernte rechnet damit weiter, statt auf das nächste Rendern zu warten.
        const uebernehmen = (data) => {
            applyEconomy(data, []);          // Gold und Lager ja, Pflanzen nein
            zeigeErnteFeedback(data, plant.singleUse !== false && !!data?.singleUseNachwuchs);
            const nach = data?.nachgewachsen;
            if (!Number.isInteger(nach?.index) || !nach?.slot) {
                if (plant.singleUse !== false) {
                    // Gärtner-Nachwuchs bei einer Einmalernte: der Server hat die Zelle
                    // NEU bepflanzt, statt sie leer zu lassen — die optimistische Leerung
                    // von eben war also zu früh. Ohne das hier stünde die Zelle im Browser
                    // für immer leer, obwohl der Server längst eine wachsende Pflanze führt
                    // (nächster Klick auf die vermeintlich reife Zelle: "Noch nicht reif",
                    // siehe singleUseNachwuchs in garden/core/economy.js).
                    if (data?.singleUseNachwuchs) {
                        const hydriert = hydratePlantVisuals(data.singleUseNachwuchs);
                        setPlotPlants((prev) => ({ ...prev, [key]: hydriert }));
                        return hydriert;
                    }
                    return null;
                }
                // Kein Fruchtstand gemeldet (alter Server) — dann wie früher.
                const vomServer = data?.plotPlants?.[key];
                if (!vomServer) return null;
                const hydriert = hydratePlantVisuals(vomServer);
                setPlotPlants((prev) => ({ ...prev, [key]: hydriert }));
                return hydriert;
            }
            // Vom Stand VOR dem Klick ausgehen: die optimistische Vorschau hat
            // vielleicht einen anderen Stand vorgezogen als der Server genommen hat.
            const basisSlots = Array.isArray(vorherigerStand?.fruitSlots) ? vorherigerStand.fruitSlots : null;
            if (!basisSlots || nach.index >= basisSlots.length) return null;
            const neueSlots = basisSlots.slice();
            neueSlots[nach.index] = nach.slot;
            const danach = { ...vorherigerStand, fruitSlots: neueSlots };
            setPlotPlants((prev) => (prev[key] ? { ...prev, [key]: danach } : prev));
            return danach;
        };
        /** Wie die Pflanze nach dieser Ernte dasteht — Grundlage für den nächsten Klick. */
        let danach = null;
        try {
            danach = uebernehmen(await ernte());
            letzteErnteRef.current.set(key, Date.now());
        } catch (err) {
            const m = err?.message || "Ernte fehlgeschlagen.";
            // ── Antwort nie angekommen ────────────────────────────────────────
            // Ohne HTTP-Status ist die Anfrage nicht beantwortet worden (Netz weg,
            // Proxy-Timeout). Ob der Server geerntet hat, wissen wir NICHT — und
            // ein Rollback wäre hier fatal: die Pflanze stünde wieder auf dem
            // Acker, das Gold dafür wäre schon gutgeschrieben, und der nächste
            // Speichervorgang würde sie über den 409-Nachreichweg beim Server
            // festschreiben. Genau daraus liess sich Gold aus dem Nichts machen.
            // Also nichts zurückrollen, sondern den echten Stand holen.
            if (err?.status === undefined) {
                ernteWarteschlangeRef.current.delete(key);
                await uebernimmVomServer(null);
                return;   // finally räumt ernteLaeuftRef auf
            }
            // Zu schnell geklickt: bei einem Dauerträger mit acht Fruchtständen
            // gehen leicht mehr Klicks raus, als reife Früchte da sind. Der Server
            // sagt dann zu Recht nein — das ist kein Fehler, den man melden muss.
            const geradeGeerntet = Date.now() - (letzteErnteRef.current.get(key) || 0) < 5000;
            // Der Acker gehoert weiterhin dem Browser und wandert nur mit dem
            // Speichervorgang zum Server. Wer giesst und sofort erntet — oder eine
            // Staude abpflueckt, die gerade erst Fruechte angesetzt hat — fragt
            // gegen einen aelteren Stand. Also: Zelle zurueck, Stand hochschieben,
            // ein zweiter Versuch. Bleibt es dabei, war es ein echtes Nein.
            // WICHTIG: nach einer gerade gelungenen Ernte NICHT wiederholen. Der
            // Rücksprung würde den alten Fruchtstand zurückschreiben und der zweite
            // Versuch dieselbe Frucht ein zweites Mal auszahlen.
            const veraltet = !geradeGeerntet && (
                m.includes("Noch nicht reif")
                || m.includes("Keine reife Frucht")
                || m.includes("wächst nichts"));
            if (veraltet) {
                const wiederhergestellt = { ...(farmStateRef.current.plotPlants || {}), [key]: vorherigerStand };
                setPlotPlants(wiederhergestellt);
                try {
                    // Die Pflanze ausdruecklich mitgeben: setPlotPlants wirkt erst
                    // beim naechsten Rendern, der Payload wuerde sie sonst vermissen.
                    await flushSave({ plotPlants: wiederhergestellt });
                    // Hier ist der Server frisch beliefert — trotzdem derselbe Weg,
                    // damit nur der nachgewachsene Fruchtstand übernommen wird.
                    danach = uebernehmen(await ernte());
                    letzteErnteRef.current.set(key, Date.now());
                    return;   // finally raeumt ernteLaeuftRef auf
                } catch {
                    // Zweiter Versuch auch nein: kein bloßes Überklicken (das ist
                    // oben schon durch geradeGeerntet abgefangen), sondern ein
                    // ECHTER, anhaltender Unterschied zwischen dem, was der Browser
                    // zeigt, und dem, was der Server hat (Feedback 01.09.: "Bohne
                    // bleibt voll angezeigt, Klick sagt trotzdem Keine reife
                    // Frucht" — bisher nur durch Neuladen behebbar). Bisher stand
                    // hier nur ein Kommentar und der Code lief unten in den
                    // Rückfall, der GENAU DIESE veraltete Ansicht (vorherigerStand)
                    // wieder hinschrieb — die Pflanze blieb also absichtlich falsch
                    // reif stehen. Jetzt: ganzen Spielstand vom Server nachziehen,
                    // dasselbe, was bisher nur ein manuelles Neuladen behoben hat.
                    ernteWarteschlangeRef.current.delete(key);
                    await uebernimmVomServer(null);
                    return;   // finally raeumt ernteLaeuftRef auf
                }
            }
            // Nur zurückstellen, wenn die Pflanze wirklich noch da ist. Bei
            // "geradeGeerntet" stammt das Nein von einem KONKURRIERENDEN Vorgang, der
            // dieselbe Zelle eben erst erfolgreich geerntet hat — Schnellzug
            // (handleHarvestMany) und der nachlaufende Browser-Klick nach mouseup
            // treffen leicht dieselbe Zelle doppelt (der Shift-Zustand im click-Event
            // kann schon "false" sein, wenn Shift knapp vor/mit der Maustaste
            // losgelassen wird — die Sperre in onCanvasClick greift dann nicht). Die
            // Pflanze ist auf dem Server in diesem Fall bereits weg; stellte man sie
            // hier trotzdem zurück, schickte der nächste Speichervorgang sie als "neu
            // gepflanzt" an den Server (verplausibilisierePflanzen kennt den Schlüssel
            // nicht mehr, findet auch die instanceId nicht mehr und würfelt frische
            // Zeiten) — ein kostenloser Nachschub, ohne Samen zu bezahlen und ohne
            // Rucksackplatz. GEFUNDEN 14.09. ("gieße, dann kann ich ganz oft
            // einsammeln, Saat kommt wieder, bekomme random Frucht").
            if (!geradeGeerntet) {
                setPlotPlants((prev) => ({ ...prev, [key]: vorherigerStand }));
            }
            // Ein Nein gilt für die ganze Warteschlange: sonst hämmert jeder
            // angestellte Klick auf dieselbe Absage.
            ernteWarteschlangeRef.current.delete(key);
            if (m.includes("Rucksack")) notify("Rucksack voll — verkauf erst Ernte oder kauf ein Upgrade.", "error");
            else if (geradeGeerntet) { /* Überklick nach erfolgreicher Ernte — still bleiben */ }
            else if (!m.includes("wächst nichts")) notify(m, "error");
        } finally {
            ernteLaeuftRef.current.delete(key);
            // Angestellte Klicks abarbeiten, solange wirklich noch etwas reif ist.
            const offen = ernteWarteschlangeRef.current.get(key) || 0;
            if (offen > 0) {
                if (danach && isPlantReady(danach)) {
                    ernteWarteschlangeRef.current.set(key, offen - 1);
                    handleHarvestRef.current?.(key, danach);
                } else {
                    ernteWarteschlangeRef.current.delete(key);
                }
            }
        }
    }, [apiCall, applyEconomy, notify, playSound, flushSave, uebernimmVomServer, kreuzungenAufnehmen, spieleErnteTon]);

    // Ueber ein Ref, damit die Warteschlange sich selbst aufrufen kann.
    useEffect(() => { handleHarvestRef.current = handleHarvest; }, [handleHarvest]);

    /**
     * Sammel-Ernte für das Schnellziehen (Shift + Maustaste über den Acker) —
     * EIN Aufruf für den GANZEN Zug, egal wie viele Zellen dabei berührt wurden.
     *
     * Feedback 30.08. (erste Runde: "Shift-Ziehen erntet mit viel Lag") gab
     * zunächst harvestAll — ein Aufruf je ZELLE statt je Frucht. Das reichte für
     * eine einzelne vollbehangene Staude, aber ein Zug über ein volles FELD
     * berührt viele Zellen: jede Antwort löste weiterhin ihren eigenen
     * Rendervorgang aus, und trafen dabei auch noch Tier-/Skill-Ereignisse ein
     * (Feedback 30.08., zweite Runde), summierte sich das spürbar zu Ruckeln.
     * `ernteBeiZug` sammelt die berührten Zellen jetzt nur noch (siehe
     * dragErnteSammlungRef) und diese Funktion schickt sie GESAMMELT — genau
     * EIN Request, EINE Antwort, EIN Rendervorgang, unabhängig von der Anzahl
     * Zellen (harvestMany, siehe harvestManyCells in core/economy.js).
     *
     * Bewusst ein eigener, einfacherer Weg statt eine Erweiterung von
     * handleHarvest: dessen Warteschlange (ernteLaeuftRef) dient dem
     * EINZELKLICK — rasch mehrfach dieselbe Zelle antippen.
     *
     * @param {Array<[string, object]>} eintraege [key, Pflanzen-Schnappschuss][]
     */
    const handleHarvestMany = useCallback(async (eintraege) => {
        if (!eintraege || eintraege.length === 0) return;
        // Kein Ton hier: beim Shift-Ziehen klingt jede Zelle schon beim Berühren
        // (ernteBeiZug in useSpielflaecheMaus.js), als steigende Kette.
        const vorherKarte = new Map(eintraege);
        const keys = eintraege.map(([key]) => key);

        try {
            const data = await apiCall("/action", {
                method: "POST",
                body: JSON.stringify({ action: "harvestMany", keys }),
            });
            applyEconomy(data, []);          // Gold und Lager ja, Pflanzen nein (siehe unten)

            const ernten = data?.ernten && typeof data.ernten === "object" ? data.ernten : {};
            // Kreuzungen (core/kreuzung.js) — mit der Lage der ersten Zelle, die eine brachte.
            {
                const slotFuerKreuzung = layout.current.slots[mySlotRef.current] || layout.current.slots[0];
                for (const [zelle, ergebnis] of Object.entries(ernten)) {
                    if (!ergebnis?.ok || !Array.isArray(ergebnis.kreuzungen) || ergebnis.kreuzungen.length === 0) continue;
                    const [kx, ky] = zelle.split("_").map(Number);
                    kreuzungenAufnehmen(ergebnis.kreuzungen, slotFuerKreuzung ? getDirtCellWorldPos(slotFuerKreuzung, kx, ky) : null);
                }
            }
            const mySlot = layout.current.slots[mySlotRef.current] || layout.current.slots[0];
            const renderer = engineRef.current?.renderer;
            let irgendRucksackVoll = false;
            // Jede Zelle in `ernten` kam aus `eintraege`, weil ernteBeiZug sie schon
            // LOKAL für reif hielt (isPlantReady dort, vor dem Sammeln). Lehnt der
            // Server so eine Zelle trotzdem ab, ist das kein normales "zu schnell
            // gezogen" — das filtert der Zug selbst schon raus, bevor überhaupt
            // etwas losgeschickt wird — sondern ein echter Unterschied zwischen dem,
            // was der Browser zeigt, und dem, was der Server hat (Feedback 01.09.:
            // dieselbe Meldung wie bei handleHarvest, siehe dort für den vollen
            // Kommentar — "Bohne bleibt voll, obwohl geerntet").
            let echterMismatch = false;
            for (const ergebnis of Object.values(ernten)) {
                if (!ergebnis?.ok && ergebnis?.error && !ergebnis.error.includes("Rucksack")) echterMismatch = true;
            }

            setPlotPlants((prev) => {
                let next = prev;
                let kopiert = false;
                for (const [key, ergebnis] of Object.entries(ernten)) {
                    if (!ergebnis?.ok) continue;   // diese eine Zelle war zu schnell dran — die anderen zaehlen trotzdem
                    const vorherigerStand = vorherKarte.get(key);
                    if (!vorherigerStand) continue;
                    letzteErnteRef.current.set(key, Date.now());
                    if (ergebnis.rucksackVoll) irgendRucksackVoll = true;

                    // Rückmeldung an GENAU DIESER Zelle, nicht eine Sammel-Zahl
                    // irgendwo auf dem Bildschirm — bei einem vollen Zug soll man
                    // trotz des gebündelten Requests sehen, WAS wo passiert ist.
                    if (renderer && mySlot) {
                        const [cellX, cellY] = key.split("_").map(Number);
                        const weltPos = getDirtCellWorldPos(mySlot, cellX, cellY);
                        const x = weltPos.x + TILE_SIZE / 2;
                        const y = weltPos.y + TILE_SIZE / 2;
                        const items = Array.isArray(ergebnis.items) ? ergebnis.items : [];
                        if (items.length > 0) {
                            const goldSumme = items.reduce((summe, it) => summe + (Number(it?.sellValue) || 0), 0);
                            renderer.spawnFeedback(x, y, `+${formatGold(goldSumme)}`, { color: "#fef08a" });
                            const xp = Number(ergebnis.erfahrung?.xp) || 0;
                            if (xp > 0) renderer.spawnFeedback(x, y + 16, `+${xp} XP`, { color: "#a78bfa", durationMs: 950 });
                            const besonders = items.find((it) => it?.specialData?.name);
                            if (besonders) {
                                const special = besonders.specialData.name;
                                const farbe = special === "Rainbow" ? "#f472b6" : "#fde047";
                                renderer.spawnFeedback(x, y - 18, special === "Rainbow" ? "🌈 Rainbow!" : "✨ Golden!",
                                    { color: farbe, durationMs: 1300 });
                                if (special === "Golden" || special === "Rainbow") renderer.spawnFunken(x, y, special);
                            }
                            const bonusAnzahl = Number(ergebnis.bonusAnzahl) || 0;
                            if (bonusAnzahl > 0) {
                                renderer.spawnFeedback(x, y - 34, bonusAnzahl > 1 ? `${bonusAnzahl}× Bonus!` : "Bonus!",
                                    { color: "#c4b5fd", durationMs: 1300 });
                            }
                            if (ergebnis.singleUseNachwuchs) {
                                renderer.spawnFeedback(x, y - 50, "Nachwuchs!", { color: "#86efac", durationMs: 1300 });
                            }
                        }
                    }

                    // Nur die tatsächlich abgeernteten Fruchtstände übernehmen —
                    // derselbe Grund wie bei handleHarvest (uebernehmen): der Acker
                    // gehört dem Browser, der Server erreicht ihn nur alle paar
                    // Sekunden. Vom Stand VOR dem Zug ausgehen, nicht vom aktuellen
                    // React-State: der kann durch andere, seither abgeschlossene
                    // Ernten schon weiter sein.
                    const aenderungen = Array.isArray(ergebnis.aenderungen) ? ergebnis.aenderungen : [];
                    if (!kopiert) { next = { ...next }; kopiert = true; }
                    if (aenderungen.length > 0) {
                        const basisSlots = Array.isArray(vorherigerStand?.fruitSlots) ? vorherigerStand.fruitSlots.slice() : null;
                        if (basisSlots && next[key]) {
                            for (const { index, slot } of aenderungen) {
                                if (Number.isInteger(index) && index < basisSlots.length) basisSlots[index] = slot;
                            }
                            next[key] = { ...vorherigerStand, fruitSlots: basisSlots };
                        }
                    } else if (ergebnis.singleUseNachwuchs) {
                        // Gärtner-Nachwuchs bei einer Einmalernte: die Zelle bleibt bepflanzt.
                        next[key] = hydratePlantVisuals(ergebnis.singleUseNachwuchs);
                    } else if (vorherigerStand?.singleUse !== false) {
                        // Einmalernte ohne Nachwuchs: leer, wie der Zug es schon zeigte.
                        delete next[key];
                    }
                }
                return next;
            });

            if (irgendRucksackVoll) notify("Rucksack voll — der Rest hängt noch an der Pflanze.", "error");
            // Statt die falsch reif aussehende(n) Zelle(n) einfach so stehen zu
            // lassen (das war bisher der Fall — nur ein manuelles Neuladen half),
            // den ganzen Spielstand vom Server nachziehen.
            if (echterMismatch) await uebernimmVomServer(null);
        } catch (err) {
            const m = err?.message || "Ernte fehlgeschlagen.";
            // Dieselbe Grosszügigkeit wie bei handleHarvest: "zu schnell gezogen"
            // (nichts mehr reif, Zelle inzwischen leer) ist beim Schnellziehen der
            // Normalfall, kein Fehler, den man melden muss. Lehnt der Server aber
            // den GANZEN Zug ab (kein einziger Treffer, siehe harvestManyCells),
            // obwohl ernteBeiZug jede gesammelte Zelle vorher für reif hielt, ist
            // das derselbe echte Mismatch wie oben — auch hier nachziehen.
            if (m.includes("Rucksack")) notify("Rucksack voll — verkauf erst Ernte oder kauf ein Upgrade.", "error");
            else if (!m.includes("Noch nicht reif") && !m.includes("Keine reife Frucht") && !m.includes("wächst nichts")) {
                notify(m, "error");
            } else {
                await uebernimmVomServer(null);
            }
        }
    }, [apiCall, applyEconomy, notify, playSound, hydratePlantVisuals, uebernimmVomServer, kreuzungenAufnehmen]);

    /**
     * Sammlung leeren und abschicken — der einzige Ort, der `handleHarvestMany`
     * tatsächlich aufruft. Sowohl vom Debounce-Timer (siehe planeDragErnteFlush)
     * als auch direkt beim Loslassen der Maustaste (siehe stopShovelHold/
     * onCanvasMove) aufgerufen, deshalb hier gebündelt statt an jeder Stelle
     * dasselbe Leeren+Aufrufen zu wiederholen.
     */
    const flushDragErnte = useCallback(() => {
        if (dragErnteFlushTimerRef.current) {
            clearTimeout(dragErnteFlushTimerRef.current);
            dragErnteFlushTimerRef.current = null;
        }
        const sammlung = dragErnteSammlungRef.current;
        if (sammlung.size === 0) return;
        const eintraege = Array.from(sammlung.entries());
        sammlung.clear();
        handleHarvestMany(eintraege);
    }, [handleHarvestMany]);

    /**
     * Nach jeder neu gesammelten Zelle aufgerufen (siehe ernteBeiZug): stößt
     * einen kurzen Debounce an, statt bei JEDER Zelle sofort abzuschicken —
     * genau das war ja das ursprüngliche Problem (ein Request je Zelle). Ein
     * zügiger Zug über viele Zellen sammelt sich so zu wenigen, teils sogar
     * einem einzigen Request; bleibt die Maus kurz stehen oder endet der Zug,
     * geht die Sammlung trotzdem zeitnah raus (120ms), fühlt sich also nicht
     * verzögert an.
     */
    const DRAG_ERNTE_FLUSH_MS = 120;
    const planeDragErnteFlush = useCallback(() => {
        if (dragErnteFlushTimerRef.current) clearTimeout(dragErnteFlushTimerRef.current);
        dragErnteFlushTimerRef.current = setTimeout(flushDragErnte, DRAG_ERNTE_FLUSH_MS);
    }, [flushDragErnte]);

    /**
     * Käfer oder Unkraut wegklicken (Backend core/stoerer.js). Sofort weg mit Ton und
     * Funken; die Gold-Zahl kommt mit der Serverantwort. Ist er dort schon weg
     * (abgelaufen, zweiter Klick), passiert still nichts — das ist kein Fehler.
     */
    const stoererLaeuftRef = useRef(new Set());
    const fangeStoerer = useCallback(async (eintrag) => {
        const id = eintrag?.id;
        if (!id || stoererLaeuftRef.current.has(id)) return;
        stoererLaeuftRef.current.add(id);
        const engine = engineRef.current;
        engine.stoerer = (engine.stoerer || []).filter((s) => s.id !== id);
        playSound("buy", 0.3);
        const slot = layout.current.slots[mySlotRef.current] || layout.current.slots[0];
        const [cx, cy] = String(eintrag.key).split("_").map(Number);
        const pos = slot && Number.isFinite(cx) && Number.isFinite(cy) ? getDirtCellWorldPos(slot, cx, cy) : null;
        const x = pos ? pos.x + TILE_SIZE / 2 : 0;
        const y = pos ? pos.y + TILE_SIZE / 2 : 0;
        if (pos) engine.renderer?.spawnFunken(x, y, "Ernte");
        try {
            const data = await apiCall("/action", {
                method: "POST",
                body: JSON.stringify({ action: "stoererFangen", id }),
            });
            applyEconomy(data, []);
            if (pos && data?.gefangen?.gold) {
                engine.renderer?.spawnFeedback(x, y - 10, `+${formatGold(data.gefangen.gold)}`, { color: "#fef08a" });
            }
        } catch {
            // schon weg — nichts zu tun
        } finally {
            stoererLaeuftRef.current.delete(id);
        }
    }, [apiCall, applyEconomy, playSound, engineRef, layout, mySlotRef]);

    return { handleCellClick, handleHarvest, flushDragErnte, planeDragErnteFlush, fangeStoerer };
}
