// hooks/useSamenKauf.js
// Samenkauf: Warteschlange für schnelle Klicks, Reservierung im Rucksack, Kauf einzeln und "Alle",
// neu entdeckte Kreuzungen übernehmen. Ausgelagert aus GameContainer.jsx, Code unverändert.
import { useCallback } from "react";
import { TILE_SIZE } from "../engine/MapConfig";
import { formatGold } from "../ui/gardenTokens";

export default function useSamenKauf({
    flushSave, farmStateRef, setInventory, playSound, engineRef, notify, kaufLaeuftRef,
    kaufEinreihen, handleBuySeedRef, goldRef, offeneSamenkaeufeRef, ladenBestandRef,
    setLadenBestand, letzterKaufAtRef, apiCall, naechstenKaufStarten, setGold, setSelectedSeed,
    handleBuySeedAllRef,
}) {
    // ── Buy seed from shop ────────────────────────────────────────────────────
    /**
     * Einen Bestand SOFORT um eins verringern — synchron, noch bevor der Server
     * gefragt wird. Gibt zurück, ob überhaupt etwas da war.
     */
    const reserviere = useCallback((ref, setzer, schluessel) => {
        const frei = ref.current?.[schluessel] ?? 0;
        if (frei <= 0) return false;
        ref.current = { ...ref.current, [schluessel]: frei - 1 };
        setzer(ref.current);
        return true;
    }, []);

    /** Reservierung zurücknehmen, wenn der Kauf doch nicht zustande kam. */
    const gibZurueck = useCallback((ref, setzer, schluessel) => {
        ref.current = { ...ref.current, [schluessel]: (ref.current?.[schluessel] ?? 0) + 1 };
        setzer(ref.current);
    }, []);

    /**
     * Gekaufte Ware SOFORT sichern, nicht über den 500-ms-Sammelspeicher.
     *
     * `payServer` bucht das Gold serverseitig ab; die Ware liegt danach bis zum
     * nächsten Speichervorgang NUR im Browser. Alles, was in diesem Fenster den
     * Zustand vom Server neu lädt — ein Ernte-Rücksprung nach Netzfehler, der
     * Versionsabgleich beim Verbinden, ein Admin-Eingriff — verwirft sie, während
     * das Gold weg bleibt. Genau so ist ein bezahltes legendäres Ei verschwunden.
     *
     * Die Überschreibung ist nötig, weil `setState` erst beim nächsten Rendern
     * wirkt: ohne sie schickte der Speichervorgang den Stand VOR dem Kauf.
     */
    const kaufSichern = useCallback(async (feld, naechsterWert) => {
        try {
            await flushSave({ [feld]: naechsterWert });
        } catch {
            // Auch wenn es hier klemmt, ist der Kauf im Browser-Zustand — der
            // reguläre Speicherweg holt ihn beim nächsten Versuch nach.
        }
    }, [flushSave]);

    /**
     * Kreuzungs-Samen aus einer Ernte in den Rucksack legen (core/kreuzung.js). Der
     * Server würfelt und vergibt die Kennung, der Rucksack gehört dem Browser —
     * derselbe Weg wie beim Samenkauf, inklusive sofortigem Sichern.
     * Ein voller Rucksack nimmt den Samen trotzdem: eine seltene Kreuzung einfach
     * verfallen zu lassen, wäre ärgerlicher als ein Platz über der Grenze.
     */
    const kreuzungenAufnehmen = useCallback((liste, weltPos = null) => {
        const neu = (Array.isArray(liste) ? liste : []).filter((s) => s?.seedId && s?.instanceId);
        if (neu.length === 0) return;
        const naechstesInventar = [...(farmStateRef.current.inventory || []), ...neu];
        setInventory(naechstesInventar);
        kaufSichern("inventory", naechstesInventar);
        playSound("cash", 0.6);
        const renderer = engineRef.current?.renderer;
        if (renderer && weltPos) {
            const x = weltPos.x + TILE_SIZE / 2;
            const y = weltPos.y + TILE_SIZE / 2;
            renderer.spawnFunken(x, y, "Rainbow");
            renderer.spawnFeedback(x, y - 48, `Kreuzung: ${neu[0].name}!`, { color: "#86efac", durationMs: 2200 });
        }
        for (const s of neu) notify(`Kreuzung gelungen! Du hast einen Samen für ${s.name} bekommen.`);
    }, [kaufSichern, notify, playSound]);

    const handleBuySeed = useCallback(async (seed) => {
        if (kaufLaeuftRef.current) { kaufEinreihen(() => handleBuySeedRef.current?.(seed)); return; }
        if (goldRef.current < seed.shopPrice) { notify(`Dafür fehlen dir ${formatGold(seed.shopPrice - goldRef.current)} Gold.`, "error"); return; }
        // Belegung aus dem Ref, ABER mit den Käufen, die in dieser Klickfolge schon
        // durch sind. Der Ref wird erst beim nächsten Rendern nachgezogen; ohne den
        // Zuschlag rutschte genau ein Samen über die Rucksackgrenze.
        const { inventory: inv0, harvestedItems: hi0, inventoryMaxSlots: maxSlots } = farmStateRef.current;
        const belegt = (inv0?.length || 0) + (hi0?.length || 0) + offeneSamenkaeufeRef.current;
        if (belegt >= (maxSlots || 50)) {
            notify("Rucksack voll — kauf ein Upgrade im Tool-Shop.", "error");
            return;
        }
        // Vorbelegen, damit schnelle Klickfolgen nicht über den Vorrat hinauslaufen.
        // Die Wahrheit steht danach trotzdem in der Serverantwort — dieser Zähler
        // ist nur die Anzeige zwischen Klick und Antwort.
        if (!reserviere(ladenBestandRef, setLadenBestand, seed.seedId)) return;
        // Ab hier ist jede Poll-Antwort, die schon unterwegs war, veraltet.
        letzterKaufAtRef.current = Date.now();
        offeneSamenkaeufeRef.current += 1;
        kaufLaeuftRef.current = true;
        let antwort;
        try {
            /**
             * Bestand, Preis und Gold rechnet der SERVER (Aktion `buySeed`).
             *
             * Vorher lief hier `payServer(seed.shopPrice)` — eine reine Abbuchung
             * über den vom Browser genannten Betrag, während der Vorrat nur ein
             * lokaler Zähler war. Beides war damit vom Client bestimmbar.
             */
            antwort = await apiCall("/action", {
                method: "POST",
                body: JSON.stringify({ action: "buySeed", seedId: seed.seedId }),
            });
        } catch (err) {
            gibZurueck(ladenBestandRef, setLadenBestand, seed.seedId);
            offeneSamenkaeufeRef.current = Math.max(0, offeneSamenkaeufeRef.current - 1);
            // Bei „ausverkauft" schickt der Server den echten Reststand mit — sonst
            // stünde die Anzeige weiter auf einem Stück, das es nicht mehr gibt.
            if (typeof err?.data?.stock === "number") {
                setLadenBestand((prev) => ({ ...prev, [seed.seedId]: Math.max(0, err.data.stock) }));
            }
            notify(err?.message || "Kauf fehlgeschlagen.", "error");
            return;
        } finally {
            kaufLaeuftRef.current = false;
            naechstenKaufStarten();
        }
        if (typeof antwort?.gold === "number") setGold(antwort.gold);
        if (typeof antwort?.stock === "number") {
            // Der Server hat gerade gerechnet — diese Zahl gilt. Der Zeitstempel
            // wandert mit, damit auch eine Antwort, die WÄHREND des Kaufs unterwegs
            // war, nicht mehr dazwischenfunkt.
            letzterKaufAtRef.current = Date.now();
            setLadenBestand((prev) => ({ ...prev, [seed.seedId]: Math.max(0, antwort.stock) }));
        }
        const boughtSeed = { ...seed, ...(antwort?.samen || {}) };
        const naechstesInventar = [...(farmStateRef.current.inventory || []), boughtSeed];
        setInventory(naechstesInventar);
        setSelectedSeed(prev => prev || boughtSeed);
        await kaufSichern("inventory", naechstesInventar);
    }, [notify, apiCall, reserviere, gibZurueck, kaufEinreihen, naechstenKaufStarten, kaufSichern]);

    /**
     * Buy-All (v2, Punkt 12): EIN Request statt denselben Samen im Sekundentakt
     * einzeln wegzuklicken — siehe kaufeSamenAlle in gardenGameRoutes.js. Prüft
     * Rucksackplatz vorab genauso wie handleBuySeed, kappt die gewünschte Menge
     * aber serverseitig ohnehin auf Gold und Vorrat, ein zu hoher Wunsch hier ist
     * also nie mehr als eine verschwendete Anfrage, nie ein falscher Kauf.
     */
    const handleBuySeedAll = useCallback(async (seed) => {
        if (kaufLaeuftRef.current) { kaufEinreihen(() => handleBuySeedAllRef.current?.(seed)); return; }
        const { inventory: inv0, harvestedItems: hi0, inventoryMaxSlots: maxSlots } = farmStateRef.current;
        const freiePlaetze = (maxSlots || 50) - (inv0?.length || 0) - (hi0?.length || 0) - offeneSamenkaeufeRef.current;
        if (freiePlaetze <= 0) {
            notify("Rucksack voll — kauf ein Upgrade im Tool-Shop.", "error");
            return;
        }
        letzterKaufAtRef.current = Date.now();
        kaufLaeuftRef.current = true;
        let antwort;
        try {
            antwort = await apiCall("/action", {
                method: "POST",
                body: JSON.stringify({ action: "buySeedAll", seedId: seed.seedId }),
            });
        } catch (err) {
            notify(err?.message || "Kauf fehlgeschlagen.", "error");
            return;
        } finally {
            kaufLaeuftRef.current = false;
            naechstenKaufStarten();
        }
        if (typeof antwort?.gold === "number") setGold(antwort.gold);
        if (typeof antwort?.stock === "number") {
            letzterKaufAtRef.current = Date.now();
            setLadenBestand((prev) => ({ ...prev, [seed.seedId]: Math.max(0, antwort.stock) }));
        }
        const gekauft = Array.isArray(antwort?.samenListe) ? antwort.samenListe : [];
        if (!gekauft.length) return;
        // Wie beim Rucksackplatz-Vorabcheck: mehr als frei ist, käme vom Server nie
        // zurück (der prüft dasselbe Limit selbst), das slice() ist nur eine zweite
        // Absicherung, kein erwarteter Fall.
        const passendGekauft = gekauft.slice(0, Math.max(0, freiePlaetze));
        const naechstesInventar = [
            ...(farmStateRef.current.inventory || []),
            ...passendGekauft.map((s) => ({ ...seed, ...s })),
        ];
        setInventory(naechstesInventar);
        setSelectedSeed(prev => prev || naechstesInventar[naechstesInventar.length - passendGekauft.length]);
        notify(`${passendGekauft.length}× ${seed.name} gekauft.`);
        await kaufSichern("inventory", naechstesInventar);
    }, [notify, apiCall, kaufEinreihen, naechstenKaufStarten, kaufSichern]);

    return { reserviere, gibZurueck, kaufSichern, kreuzungenAufnehmen, handleBuySeed, handleBuySeedAll };
}
