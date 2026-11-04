// hooks/useSpeichern.js
// Speichern des Spielstands: verzögert (debouncedSave), beim Verlassen der Seite (keepalive) und
// sofort (flushFarmStateToServer, mit Konfliktbehandlung über stateVersion).
// Ausgelagert aus GameContainer.jsx, Code unverändert.
import { useCallback, useEffect } from "react";
import { TAB_ID, GERAET_ID, ACKERRASTER_MARKE } from "../engine/gameConstants";

export default function useSpeichern({
    saveTimeoutRef, flushFarmStateToServerRef, isInitialLoadDoneRef, nurZuschauenRef, farmStateRef,
    stateVersionRef, inventory, plotPlants, plotExpansions, plotUnlockedCells, eggInventory,
    petInventory, petPlacements, decoInventory, decoPlacements, toolInventory, inventoryMaxSlots,
    incubator, gebaeudeVersatz, logbuch, ladenBestand, shopRotation, toolShopStock,
    toolShopRotation, eggShopStock, eggShopRotation, playerAppearance, tutorialCompleted,
    ackerRasterMigriert, apiCall, uebernimmVomServer, setNurZuschauen, gold, harvestedItems,
}) {
    const debouncedSave = useCallback(() => {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => {
            flushFarmStateToServerRef.current?.();
        }, 500);
    }, []);

    /**
     * Beim Verlassen NICHT abbrechen, sondern rausschicken.
     *
     * Hier stand `useEffect(() => () => clearTimeout(saveTimeoutRef.current), [])`:
     * der Aufräumer hat den ausstehenden Speichervorgang VERWORFEN. Da
     * `debouncedSave` (500 ms) der einzige Weg ist, auf dem Pflanzen, Steinabbau,
     * Gießen, Umtopfen, Deko, Tiere und Käufe zum Server kommen — und der
     * Autosave erst nach 5 Sekunden Ruhe greift —, war alles seit dem letzten PUT
     * weg, sobald man die Seite wechselte oder neu lud. Bei Käufen besonders
     * bitter: `payServer` hatte das Gold schon abgebucht, die Ware lag nur lokal.
     *
     * `keepalive` ist entscheidend: ein gewöhnliches fetch() wird beim Entladen
     * der Seite abgebrochen.
     */
    useEffect(() => {
        const raus = () => {
            if (!isInitialLoadDoneRef.current || nurZuschauenRef.current) return;
            clearTimeout(saveTimeoutRef.current);
            const stand = farmStateRef.current || {};
            // gold und harvestedItems gehören dem Server und stehen bewusst nicht
            // im Payload (siehe compactFarmState).
            const { gold: _g, harvestedItems: _h, ...rest } = stand;
            const payload = { ...rest, tabId: TAB_ID, stateVersion: stateVersionRef.current };
            try {
                fetch("/api/garden/farm-state", {
                    method: "PUT",
                    credentials: "include",
                    keepalive: true,
                    headers: { "Content-Type": "application/json", "X-VF-Geraet": GERAET_ID },
                    body: JSON.stringify({ state: payload }),
                }).catch(() => { /* Seite ist schon weg */ });
            } catch { /* egal */ }
        };
        const beiSichtwechsel = () => { if (document.visibilityState === "hidden") raus(); };
        window.addEventListener("pagehide", raus);
        document.addEventListener("visibilitychange", beiSichtwechsel);
        return () => {
            window.removeEventListener("pagehide", raus);
            document.removeEventListener("visibilitychange", beiSichtwechsel);
            raus();   // auch beim Seitenwechsel innerhalb der App
        };
    }, []);

    /**
     * @param {object} [ueberschreibung] Felder, die NICHT aus dem React-State kommen
     *   sollen. Noetig, wenn direkt vor dem Speichern etwas gesetzt wurde: `setState`
     *   wirkt erst beim naechsten Rendern, der Payload hier liest aber die Werte des
     *   letzten. Ohne diesen Weg speichert der Ruecksprung in handleHarvest den Acker
     *   OHNE die gerade wiederhergestellte Pflanze.
     */
    const flushFarmStateToServer = useCallback(async (ueberschreibung, versuch = 0) => {
        // Vor dem ersten Laden stehen in den States nur die Startwerte — leere
        // Listen. Ein PUT damit loescht auf dem Server Deko, Tiere und Eier.
        // Der Autosave-Effekt prueft das laengst; debouncedSave() lief bisher
        // ungeprueft durch und war damit das Schlupfloch.
        if (!isInitialLoadDoneRef.current) return;
        // Ein zurückgetretener Tab schreibt nicht mehr. Sonst überschriebe er beim
        // nächsten Autosave genau den Stand, vor dem er gerade zurückgetreten ist.
        if (nurZuschauenRef.current) return;
        const payload = {
            tabId: TAB_ID,
            inventory, plotPlants, plotExpansions, plotUnlockedCells,
            eggInventory, petInventory, petPlacements, decoInventory, decoPlacements,
            toolInventory, inventoryMaxSlots, incubator, gebaeudeVersatz, logbuch,
            shopStock: ladenBestand,
            shopStockVersion: shopRotation?.generatedAt,
            toolShopStock: toolShopStock,
            toolShopStockVersion: toolShopRotation?.generatedAt,
            eggShopStock: eggShopStock,
            eggShopStockVersion: eggShopRotation?.generatedAt,
            // Fehlte hier, stand aber im 5-Sekunden-Autosave: ohne das Feld setzt
            // compactFarmState das Aussehen auf den Standard-Farmer zurück, und jedes
            // debouncedSave (Pflanzen, Kaufen, …) zog die Kleidung mit.
            appearance: playerAppearance,
            tutorialCompleted,
            [ACKERRASTER_MARKE]: ackerRasterMigriert,
            // Gegen verspätete Speicherstände: der Server verwirft diesen PUT, wenn
            // seit dem Laden eine Aktion dazwischenkam (siehe erhoeheVersion).
            stateVersion: stateVersionRef.current,
            ...(ueberschreibung || {}),
        };
        try {
            await apiCall("/farm-state", { method: "PUT", body: JSON.stringify({ state: payload }) });
        } catch (err) {
            // Kein Status heisst: keine Antwort erhalten. Der Server hat diesen
            // Stand vielleicht trotzdem übernommen — blind nachreichen würde dann
            // mit einem veralteten Zähler gegen einen bereits gespeicherten Stand
            // laufen. Der nächste reguläre Speichervorgang klärt das von selbst.
            if (err?.status === undefined) return;
            if (err?.status !== 409) return; // nicht angemeldet / offline — der Socket versucht es weiter

            // 409 heisst: der Server ist weiter als diese Nutzlast. In aller Regel,
            // weil eine EIGENE Aktion fertig wurde, während der PUT unterwegs war —
            // beim Kauf von zehn Töpfen passiert das fast bei jedem einzelnen.
            //
            // NICHT nachladen. Der React-Stand ist in diesem Fall die vollständigere
            // Fassung: er kennt die eben gekauften Sachen, der Server nicht (Rucksack
            // und Werkzeug gehören dem Browser). Ein Nachladen warf genau die Käufe
            // weg, die gerade dazugekommen waren, und der nächste Speicherversuch lief
            // in denselben Konflikt — daher die Schleife aus 409 und „Lade Spielstand".
            //
            // Richtig ist: Zähler übernehmen und mit FRISCH gebauter Nutzlast erneut
            // schicken. Der kurze Aufschub gibt React Zeit, den letzten Kauf zu
            // übernehmen, damit die neue Nutzlast ihn auch enthält.
            // Hat der SERVER selbst etwas geändert (Umstellung beim Neustart,
            // Admin-Eingriff)? Dann ist sein Stand der bessere und dieser hier muss
            // weichen — nachreichen würde die Änderung überschreiben. Das ist der
            // einzige Fall, in dem Nachladen richtig ist.
            const meinStand = stateVersionRef.current;
            const serverAenderung = Number(err.data?.serverAenderungAb) || 0;
            if (typeof err.data?.stateVersion === "number") {
                stateVersionRef.current = err.data.stateVersion;
            }
            if (serverAenderung > meinStand) {
                console.log(`[Garden] Server hat den Stand selbst geändert (ab ${serverAenderung}) — wird geholt.`);
                await uebernimmVomServer(null);
                return;
            }
            // Ein ANDERER Tab hat zuletzt geschrieben. Nachreichen hiesse: dessen
            // Rucksack durch den eigenen, älteren ersetzen — genau der Weg, auf dem
            // Samen verschwinden. Dieser Tab tritt deshalb zurück, holt den echten
            // Stand und schaut nur noch zu, bis der Spieler ihn übernimmt.
            const andererTab = err.data?.letzterTab;
            if (andererTab && andererTab !== TAB_ID) {
                console.warn(`[Garden] Anderer Tab hat zuletzt gespeichert (${andererTab}) — dieser tritt zurück.`);
                nurZuschauenRef.current = true;
                setNurZuschauen(true);
                await uebernimmVomServer(null);
                return;
            }
            if (versuch < 3) {
                await new Promise((r) => setTimeout(r, 120));
                await flushFarmStateToServerRef.current?.(ueberschreibung, versuch + 1);
                return;
            }
            // Auch danach wird NICHT nachgeladen. Ein Nachladen ersetzt alles, was dem
            // Browser gehört, durch den letzten gespeicherten Stand — bei zwölf frisch
            // gekauften Pfirsichen also: neun weg, Gold trotzdem abgebucht, und der
            // Ladenbestand wieder aufgefüllt (der wird ebenfalls mitgespeichert).
            // Der nächste Speicherversuch läuft ohnehin gleich wieder los und hat dann
            // den richtigen Zähler; damit klärt sich das von selbst, ohne Verlust.
            // Der einzige Fall, in dem der Serverstand wirklich der bessere ist, ist
            // ein Eingriff von aussen — und der schickt sein eigenes Signal
            // (garden:admin_update), das weiterhin nachlädt.
            console.warn("[Garden] Speichern kollidiert wiederholt — nächster Versuch folgt.");
        }
    }, [apiCall, uebernimmVomServer, gold, inventory, plotPlants, plotExpansions, plotUnlockedCells, harvestedItems, eggInventory, petInventory, petPlacements, decoInventory, decoPlacements, toolInventory, inventoryMaxSlots, incubator, gebaeudeVersatz, logbuch, ladenBestand, shopRotation?.generatedAt, toolShopStock, toolShopRotation?.generatedAt, eggShopStock, eggShopRotation?.generatedAt, playerAppearance, tutorialCompleted, ackerRasterMigriert]);

    return { debouncedSave, flushFarmStateToServer };
}
