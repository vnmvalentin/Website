// hooks/useWerkzeuge.js
// Werkzeuge: kaufen (einzeln/alle), Steinfelder abbauen, gießen, Pflanze mit dem Topf umsetzen.
// Ausgelagert aus GameContainer.jsx, Code unverändert.
import { useCallback, useEffect } from "react";
import { normalizePlotUnlockedCells, MAX_PLOT_EXPANSIONS, BASE_DIRT_COLS, giesskanneMinuten, GIESSKANNE_MAX_ANTEIL } from "../engine/gameConstants";
import { isPlantReady } from "../engine/PlantSystem";
import { formatDuration as formatDurationShared } from "../ui/gardenTokens";

export default function useWerkzeuge({
    kaufLaeuftRef, kaufEinreihen, handleBuyToolRef, reserviere, toolShopStockRef, setToolShopStock,
    letzterToolKaufAtRef, apiCall, goldRef, setGold, setzeWerkzeug, gibZurueck, notify,
    naechstenKaufStarten, playSound, handleBuyToolAllRef, apiCallRef, notifyRef, setzeWerkzeugRef,
    toolInventory, plotUnlockedCells, verbraucheWerkzeug, engineRef, setPlotUnlockedCells,
    setPlotExpansions, debouncedSave, plotPlants, skillStufe, setPlotPlants, flushSave,
    movingPlantSource, setMovingPlantSource,
}) {
    /**
     * Werkzeug kaufen — Preis, Vorrat und Gutschrift liegen ALLE beim Server
     * (garden/core/werkzeug.js).
     *
     * Vorher lief das in zwei Schritten: erst Gold abbuchen (`payServer`), dann den
     * Werkzeugkasten im Browser fortschreiben und speichern. Zwischen beiden lag eine
     * Lücke, und jeder Weg, der den Browserstand verwirft — Nachladen nach Konflikt,
     * Migration beim Deploy, zweiter Tab — liess das Gold verschwinden, ohne dass das
     * Werkzeug ankam. Genau das war „zehn Gießkannen gekauft, sechs bekommen".
     *
     * Jetzt ist es EIN Aufruf: der Server bucht ab und trägt ein, oder er tut beides
     * nicht. Der Ladenbestand hier ist nur noch Anzeige; verbindlich zählt der Server.
     */
    const handleBuyTool = useCallback(async (tool) => {
        if (kaufLaeuftRef.current) { kaufEinreihen(() => handleBuyToolRef.current?.(tool)); return; }
        const hatBestand = tool.type === "single";
        if (hatBestand && !reserviere(toolShopStockRef, setToolShopStock, tool.id)) return;
        // Ab hier ist jede Poll-Antwort, die schon unterwegs war, veraltet — siehe
        // den werkzeugladen-Abgleich im /global-shop-Poll oben.
        if (hatBestand) letzterToolKaufAtRef.current = Date.now();

        kaufLaeuftRef.current = true;
        try {
            const daten = await apiCall("/action", {
                method: "POST",
                body: JSON.stringify({ action: "buyTool", toolId: tool.id }),
            });
            if (typeof daten?.gold === "number") { goldRef.current = daten.gold; setGold(daten.gold); }
            if (daten?.toolInventory) setzeWerkzeug(daten.toolInventory);
            if (hatBestand && typeof daten?.stock === "number") {
                // Der Server hat gerade gerechnet — diese Zahl gilt, nicht die
                // optimistische Reservierung von oben.
                letzterToolKaufAtRef.current = Date.now();
                setToolShopStock((prev) => ({ ...prev, [tool.id]: Math.max(0, daten.stock) }));
            }
            // v2, Punkt 12: Kassen-Sound beim Werkzeugkauf raus — mit Buy-All (kauft
            // oft mehrere auf einen Klick) wären das sonst mehrere Sounds übereinander.
        } catch (err) {
            if (hatBestand) {
                gibZurueck(toolShopStockRef, setToolShopStock, tool.id);
                // Bei „ausverkauft" (oder wenn der Kauf trotz einer Verbindungs-
                // störung beim Server durchging und nur die Antwort verlorenging)
                // den echten Reststand übernehmen, statt blind die Reservierung
                // zurückzugeben — sonst zeigt der Laden mehr an, als noch da ist.
                // Dieselbe Absicherung wie beim Samenkauf (handleBuySeed).
                if (typeof err?.data?.stock === "number") {
                    letzterToolKaufAtRef.current = Date.now();
                    setToolShopStock((prev) => ({ ...prev, [tool.id]: Math.max(0, err.data.stock) }));
                }
            }
            notify(err?.message || "Kauf fehlgeschlagen.", "error");
        } finally {
            kaufLaeuftRef.current = false;
            naechstenKaufStarten();
        }
        // Kein `kaufSichern` mehr: der Server hat den Kauf bereits festgeschrieben.
        // Ein Speichervorgang von hier könnte ihn nur noch überschreiben.
    }, [apiCall, notify, playSound, reserviere, gibZurueck, kaufEinreihen, naechstenKaufStarten, setzeWerkzeug]);

    /**
     * Buy-All (v2, Punkt 12) fürs Werkzeug — siehe kaufeWerkzeugAlle in
     * werkzeug.js. Läuft dieselbe Reservierung/Rückgabe wie handleBuyTool,
     * nur für einen einzigen Request statt einer Klickserie.
     */
    const handleBuyToolAll = useCallback(async (tool) => {
        if (kaufLaeuftRef.current) { kaufEinreihen(() => handleBuyToolAllRef.current?.(tool)); return; }
        const hatBestand = tool.type === "single";
        if (hatBestand && !reserviere(toolShopStockRef, setToolShopStock, tool.id)) return;
        if (hatBestand) letzterToolKaufAtRef.current = Date.now();

        kaufLaeuftRef.current = true;
        try {
            const daten = await apiCall("/action", {
                method: "POST",
                body: JSON.stringify({ action: "buyToolAll", toolId: tool.id }),
            });
            if (typeof daten?.gold === "number") { goldRef.current = daten.gold; setGold(daten.gold); }
            if (daten?.toolInventory) setzeWerkzeug(daten.toolInventory);
            if (hatBestand && typeof daten?.stock === "number") {
                letzterToolKaufAtRef.current = Date.now();
                setToolShopStock((prev) => ({ ...prev, [tool.id]: Math.max(0, daten.stock) }));
            }
            const anzahl = Number(daten?.anzahl) || 0;
            if (anzahl > 0) notify(`${anzahl}× ${tool.name} gekauft.`);
        } catch (err) {
            if (hatBestand) {
                gibZurueck(toolShopStockRef, setToolShopStock, tool.id);
                if (typeof err?.data?.stock === "number") {
                    letzterToolKaufAtRef.current = Date.now();
                    setToolShopStock((prev) => ({ ...prev, [tool.id]: Math.max(0, err.data.stock) }));
                }
            }
            notify(err?.message || "Kauf fehlgeschlagen.", "error");
        } finally {
            kaufLaeuftRef.current = false;
            naechstenKaufStarten();
        }
    }, [apiCall, notify, reserviere, gibZurueck, kaufEinreihen, naechstenKaufStarten, setzeWerkzeug]);

    useEffect(() => { handleBuyToolRef.current = handleBuyTool; }, [handleBuyTool]);
    useEffect(() => { handleBuyToolAllRef.current = handleBuyToolAll; }, [handleBuyToolAll]);
    useEffect(() => { apiCallRef.current = apiCall; }, [apiCall]);
    useEffect(() => { notifyRef.current = notify; }, [notify]);
    useEffect(() => { setzeWerkzeugRef.current = setzeWerkzeug; }, [setzeWerkzeug]);

    const handleMineRock = useCallback(async (rockCell) => {
        if (!rockCell || !Number.isInteger(rockCell.cellX) || !Number.isInteger(rockCell.cellY)) return;
        const key = `${rockCell.cellX}_${rockCell.cellY}`;
        if ((toolInventory.pickaxeUses || 0) <= 0) {
            notify("Du brauchst eine Spitzhacke.", "error");
            return;
        }
        if (plotUnlockedCells.includes(key)) {
            notify("Dieses Feld ist bereits freigelegt.", "error");
            return;
        }
        // „Bergmann" war früher eine Save-Chance und wurde HIER gewürfelt. Auf einer
        // Exponentialkurve (Spitzhackenpreis) hat das nicht 30 % der Kosten
        // gestrichen, sondern 90 %: weniger Käufe heisst auch ein kleinerer
        // Exponent. Der Skill gibt jetzt feste Zusatzladungen beim KAUF
        // (siehe handleBuyTool), der Abbau verbraucht wieder schlicht eine.
        // Erst die Ladung abbuchen — beim SERVER. Klappt das nicht, wird auch kein
        // Stein freigelegt: sonst hätte man ein Feld gewonnen, ohne dafür zu zahlen.
        if (!(await verbraucheWerkzeug("pickaxeUses"))) return;
        // v2 (Punkt 13): Spitzhacken-Schwung — siehe spawnToolSchwung in
        // engine/Renderer.js. Rein optisch, deshalb hier und nicht vor der
        // Server-Prüfung: ein abgelehnter Abbau soll nicht so aussehen, als hätte
        // er geklappt.
        engineRef.current?.renderer?.spawnToolSchwung("pickaxe");
        setPlotUnlockedCells(prev => {
            const next = normalizePlotUnlockedCells([...prev, key]);
            setPlotExpansions(Math.min(MAX_PLOT_EXPANSIONS, Math.ceil(next.length / BASE_DIRT_COLS)));
            return next;
        });
        const uebrig = Math.max(0, (toolInventory.pickaxeUses || 0) - 1);
        notify(`Stein abgebaut. Noch ${uebrig} Spitzhacken-Nutzungen übrig.`);
        debouncedSave();
    }, [notify, plotUnlockedCells, toolInventory.pickaxeUses, debouncedSave, verbraucheWerkzeug]);

    const handleWaterPlant = useCallback(async (cellX, cellY) => {
        const key = `${cellX}_${cellY}`;
        const plant = plotPlants[key];
        if (!plant) return;
        // ACHTUNG: hier stand `isPlantReady(plant)`. Für einen Dauerträger heisst
        // das „mindestens EINE Frucht ist reif" — ein Baum mit einer reifen und
        // sechs wachsenden Früchten liess sich damit nicht mehr giessen, obwohl
        // genau dafür die Kanne da ist. Gesperrt wird jetzt erst, wenn die Rechnung
        // unten ergibt, dass es nichts zu verkürzen gibt.
        if ((toolInventory.wateringCans || 0) <= 0) {
            notify("Keine Gießkanne mehr verfügbar.", "error");
            return;
        }
        const now = Date.now();
        /**
         * FESTE Minuten, wie bei Magic Garden (dort 5 min für 5.000 Gold).
         *
         * Ein Prozentsatz der Restzeit war der Fehlversuch dazwischen: Prozente
         * stapeln sich MULTIPLIKATIV. Bei 50 % je Guss lassen zehn Kannen aus einer
         * Lieferung noch 0,1 % übrig — für 50.000 Gold wäre damit eine 20-Tage-
         * Mondblume sofort fertig gewesen.
         *
         * Feste Minuten regulieren sich dagegen selbst: sie lohnen sich nur, wenn
         * die Pflanze mehr als 1.000 Gold je Minute abwirft (Kannenpreis geteilt
         * durch gesparte Minuten). Auf einem Löwenzahn ist die Kanne Verschwendung,
         * auf einem Kürbis lohnt sie sich, und eine Mondblume bräuchte tausende.
         */
        const minuten = giesskanneMinuten(skillStufe("giesskanne"));
        const gespartMs = minuten * 60000;

        /**
         * Die neue Pflanze AUSSERHALB des State-Updaters bauen.
         *
         * Vorher wurde `wirklichGespart` im Updater gesetzt und direkt danach für
         * die Meldung gelesen. React ruft den Updater aber erst beim nächsten
         * Rendern auf — die Meldung sah also immer 0 und behauptete deshalb JEDES
         * Mal „ist jetzt fertig", auch bei einer Ananas mit fünf Tagen Restzeit.
         */
        const berechne = (p) => {
            const np = { ...p };
            let gespart = 0;
            if (np.singleUse) {
                // Untergrenze ist die volle Wachstumszeit, also faktisch keine —
                // man darf bis zur Reife wässern. Sie steht nur da, damit ein
                // manipulierter Browser nicht bei jedem Speichern erneut abzieht.
                const basis = Number(np.growthMsBasis) || Number(np.growthMs) || 0;
                const untergrenze = Math.round(basis * (1 - GIESSKANNE_MAX_ANTEIL));
                const neu = Math.max(untergrenze, (Number(np.growthMs) || 0) - gespartMs);
                gespart = (Number(np.growthMs) || 0) - neu;
                np.growthMs = neu;
            } else if (np.stage === "structure") {
                const rest = Math.max(0, (Number(np.structureReadyAt) || now) - now);
                gespart = Math.min(gespartMs, rest);
                np.structureReadyAt = Math.max(now, (Number(np.structureReadyAt) || now) - gespart);
            } else {
                // Wie bei Magic Garden: ein Guss wirkt auf ALLE Fruchtstände.
                // `gegossenMs` zählt mit, wie viel dieser Stand schon bekommen hat —
                // der Server deckelt daran (siehe gegosseneReifezeit). Ohne den
                // Zähler liesse sich mit jedem Speichern erneut abziehen.
                const zyklus = Number(np.fruitCycleMs) || 60000;
                const maxAbzug = Math.round(zyklus * GIESSKANNE_MAX_ANTEIL);
                np.fruitSlots = (np.fruitSlots || []).map((s) => {
                    const ra = Number(s?.readyAt ?? 0);
                    if (ra <= now) return s;
                    const bisher = Math.max(0, Math.min(maxAbzug, Number(s?.gegossenMs) || 0));
                    const neu = Math.min(maxAbzug, bisher + gespartMs);
                    const abzug = neu - bisher;
                    if (abzug > gespart) gespart = abzug;
                    return { ...s, readyAt: Math.max(now, ra - abzug), gegossenMs: neu };
                });
            }
            return { np, gespart };
        };

        const { np, gespart } = berechne(plant);

        /**
         * ERST rechnen, DANN bezahlen.
         *
         * Der Verbrauch stand vorher ganz oben, noch vor dieser Rechnung. Ergab sie
         * dann null gesparte Zeit, war die Kanne trotzdem weg — die Meldung „da war
         * nichts mehr zu gießen" kostete also 5.000 Gold.
         */
        if (gespart <= 0) {
            notify(isPlantReady(plant, now)
                ? "Pflanze ist bereits ausgewachsen."
                : "Hier ist gerade nichts zu gießen.", "error");
            return;
        }
        // Kanne serverseitig abbuchen. Erst wenn das durch ist, wirkt der Guss —
        // andernfalls liesse sich mit einem zurückgedrehten Browserstand endlos gießen.
        if (!(await verbraucheWerkzeug("wateringCans"))) return;
        // v2 (Punkt 13): Gießkannen-Schwung — siehe spawnToolSchwung in
        // engine/Renderer.js.
        engineRef.current?.renderer?.spawnToolSchwung("watering");
        setPlotPlants((prev) => (prev[key] ? { ...prev, [key]: np } : prev));

        // Wirklich fertig ist sie nur, wenn danach nichts mehr aussteht.
        const fertig = np.singleUse
            ? (Number(np.plantedAt) || now) + (Number(np.growthMs) || 0) <= now
            : isPlantReady(np);
        if (fertig) {
            notify("Pflanze gewässert — sie ist jetzt fertig.");
        } else {
            // Restzeit für JEDE Bauart nennen, nicht nur für Einzelpflanzen.
            // Bei Dauerträgern zählt der nächste Fruchtstand, der noch aussteht.
            let rest = 0;
            if (np.singleUse) {
                rest = Math.max(0, (Number(np.plantedAt) || now) + (Number(np.growthMs) || 0) - now);
            } else if (np.stage === "structure") {
                rest = Math.max(0, (Number(np.structureReadyAt) || now) - now);
            } else {
                const offen = (np.fruitSlots || [])
                    .map((s) => Math.max(0, (Number(s?.readyAt) || 0) - now))
                    .filter((ms) => ms > 0);
                rest = offen.length > 0 ? Math.min(...offen) : 0;
            }
            notify(`Pflanze gewässert: -${Math.max(1, Math.round(gespart / 60000))} Minuten`
                + (rest > 0 ? ` · noch ${formatDurationShared(rest)}` : ""));
        }
        // SOFORT statt debouncedSave (Bug gefunden 01.09.: "2 ripe angezeigt,
        // Ernte trotzdem 400 Keine reife Frucht"). Die Verkürzung wirkt erst,
        // wenn der Server sie über den PUT gesehen hat (core/economy.js kappt und
        // übernimmt die gegossene Zeit nur dort, siehe gegosseneReifezeit in
        // gardenGameRoutes.js) — debouncedSave wartet 500 ms auf Ruhe, und "gießen,
        // dann sofort pflücken" ist genau die Reihenfolge, die diese 500 ms
        // regelmäßig unterbietet: die Ernte kam beim Server an, bevor er vom Guss
        // wusste, und lehnte die (dort noch nicht reife) Frucht ab.
        //
        // BUG gefunden 14.09. ("gegossen und geerntet — Saat kam wieder"): genau
        // dieses "SOFORT" schickte trotzdem den ALTEN, ungegossenen Stand. Ohne
        // explizite Übergabe liest flushSave() die Nutzlast über
        // flushFarmStateToServerRef — der zeigt erst NACH dem naechsten Rendern
        // auf eine Fassung mit dem `np` von eben (setPlotPlants wirkt asynchron,
        // siehe Kommentar bei der Ernte-Wiederherstellung weiter oben). Zwischen
        // dem setPlotPlants oben und diesem await liegt kein einziges await —
        // der PUT ging also praktisch IMMER mit der Zeit von VOR dem Guss raus.
        // Der Server sah die Verkürzung nie, lehnte die folgende Ernte mit „Noch
        // nicht reif." ab, und deren Fehlerpfad stellt die Pflanze sichtbar
        // zurück auf den Acker — genau das sah aus wie „Saat kam wieder". Fix:
        // denselben expliziten Übergabe-Weg wie bei der Ernte-Wiederherstellung
        // nehmen, statt auf den naechsten Render zu warten.
        await flushSave({ plotPlants: { ...plotPlants, [key]: np } });
    }, [plotPlants, toolInventory.wateringCans, notify, flushSave, skillStufe, verbraucheWerkzeug]);

    const handleMovePlantWithPot = useCallback(async (targetX, targetY) => {
        if ((toolInventory.plantPots || 0) <= 0) {
            notify("Kein Plant Pot verfügbar.", "error");
            return;
        }
        const targetKey = `${targetX}_${targetY}`;
        if (!movingPlantSource) {
            const sourcePlant = plotPlants[targetKey];
            if (!sourcePlant) {
                notify("Wähle zuerst eine Pflanze als Quelle.", "error");
                return;
            }
            setMovingPlantSource(targetKey);
            notify("Quelle gewählt. Jetzt auf Zielfeld klicken.");
            return;
        }
        if (movingPlantSource === targetKey) return;
        if (plotPlants[targetKey]) {
            notify("Zielfeld ist bereits belegt.", "error");
            return;
        }
        // Topf serverseitig abbuchen, BEVOR die Pflanze umzieht (11.11.: vorher zog sie
        // schon vor der Antwort um und blieb bei einem Fehler am falschen Platz stehen).
        const quelle = movingPlantSource;
        if (!(await verbraucheWerkzeug("plantPots"))) return;
        setPlotPlants(prev => {
            const src = prev[quelle];
            if (!src || prev[targetKey]) return prev;
            const next = { ...prev };
            delete next[quelle];
            next[targetKey] = { ...src, cellX: targetX, cellY: targetY };
            return next;
        });
        setMovingPlantSource(null);
        notify("Pflanze erfolgreich umgesetzt.");
        // Ohne das lief die Aenderung erst mit dem 5-Sekunden-Autosave zum Server —
        // und erst DANN sahen die anderen den umgesetzten Acker. Alle uebrigen
        // Acker-Aktionen speichern seit jeher sofort; hier fehlte es schlicht.
        debouncedSave();
    }, [toolInventory.plantPots, movingPlantSource, plotPlants, notify, debouncedSave, verbraucheWerkzeug]);

    return { handleBuyTool, handleBuyToolAll, handleMineRock, handleWaterPlant, handleMovePlantWithPot };
}
