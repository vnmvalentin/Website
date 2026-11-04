// hooks/useServerAktionen.js
// Server-Aktionen: Speichern anstoßen, Gold-Zahlungen, Logbuch, Missionen, Aufträge,
// Erntefest und Gold-Shop-Reskins. Ausgelagert aus GameContainer.jsx, Code unverändert.
import { useCallback } from "react";
import { SEED_CATALOGUE, hydrateHarvestedItems } from "../engine/PlantSystem";
import { formatGold } from "../ui/gardenTokens";
import { formatGroesse } from "../ui/groesse";
import { KATALOG_NACH_ID } from "../engine/gameConstants";

export default function useServerAktionen({
    saveTimeoutRef, flushFarmStateToServerRef, apiCall, goldRef, setGold, setLogbuch, notify,
    playSound, setGoldGesamt, setSkillStand, setHarvestedItems, setPlotPlants,
    normalizePlotPlantsMap, hydratePlantVisuals, ladeQuests, setQuestDaten, ladeGoldShop, setErnteRausch, setStoerer, setZuchtbuch,
}) {
    /** Sofort speichern statt in 500 ms — noetig, bevor der Server ueber etwas
     *  entscheiden soll, das bisher nur im Browser steht (z. B. ein Tier). */
    const flushSave = useCallback(async (ueberschreibung) => {
        clearTimeout(saveTimeoutRef.current);
        await flushFarmStateToServerRef.current?.(ueberschreibung);
    }, []);

    /** Kasse: erst der Server bucht ab, dann bekommt der Spieler die Ware.
     *  Gold gehoert ab v3.0 dem Server — eine nur lokale Abbuchung waere beim
     *  naechsten Laden wieder da (und die Ware trotzdem im Rucksack). */
    const payServer = useCallback(async (betrag) => {
        const data = await apiCall("/action", {
            method: "POST",
            body: JSON.stringify({ action: "spend", amount: Math.round(Number(betrag) || 0) }),
        });
        if (typeof data?.gold === "number") {
            // SOFORT ins Ref, nicht erst beim nächsten Rendern. Die Warteschlange
            // startet den nächsten Kauf über setTimeout(0) — der läuft mitunter
            // schon, bevor React den neuen Goldstand übernommen hat. Prüfte der
            // nächste Kauf gegen den React-Wert, sähe er das Gold von VOR dieser
            // Zahlung, liesse einen Kauf durch, den man sich nicht mehr leisten
            // kann, und der Server müsste ihn ablehnen. Für den Spieler sah das so
            // aus, als spränge der Ladenbestand grundlos zurück.
            goldRef.current = data.gold;
            setGold(data.gold);
        }
        return data;
    }, [apiCall]);

    /**
     * Antwort der Wirtschafts-Route uebernehmen — der Server ist die Wahrheit.
     *
     * `zellen` nennt die tatsaechlich veraenderten Felder. Ohne diese Angabe wurde
     * bei JEDER Ernte die komplette Pflanzenkarte ersetzt: 35 neue Objekte, alle
     * Pflanzen-Caches im Renderer entwertet, ein grosser React-Commit mitten in der
     * Bewegung. Genau das machte das Einsammeln zaeh. Ein leeres Array heisst
     * "Pflanzen nicht anfassen" (z. B. beim Verkaufen).
     */
    /**
     * Übernimmt den Logbuch-Eintrag, den der SERVER bei „harvest" mitschickt.
     *
     * UMGEBAUT (v2, Punkt 11): stand vorher komplett im Browser — „reines
     * Nachschlagewerk ohne Spielwert". Seit „Seite komplett" Gold auszahlt
     * (logbuchAktualisieren in core/economy.js), stimmt dieser Satz nicht mehr:
     * ein selbst eingetragenes fertiges Logbuch hätte sich sonst bei der
     * nächsten Ernte irgendeiner Art ausgezahlt. Der Browser übernimmt jetzt nur
     * noch, was hier ankommt, statt es aus dem geernteten Stück nachzurechnen.
     */
    const logbuchUebernehmen = useCallback((serverLogbuch) => {
        if (!serverLogbuch || typeof serverLogbuch !== "object") return;
        setLogbuch((prev) => ({ ...prev, ...serverLogbuch }));
    }, []);

    /** „Seite komplett": Meldung samt Gold-Betrag, evtl. plus Logbuch-Gesamtbonus. */
    const logbuchBelohnungMelden = useCallback((belohnungen) => {
        if (!Array.isArray(belohnungen)) return;
        for (const b of belohnungen) {
            if (!b?.seedId) continue;
            const art = SEED_CATALOGUE.find((s) => s.id === b.seedId);
            notify(
                b.komplett
                    ? `Logbuch komplett! ${art?.name || b.seedId} fertig — +${formatGold(b.belohnung)} Gold (inklusive Gesamtbonus).`
                    : `${art?.name || b.seedId} im Logbuch komplett — +${formatGold(b.belohnung)} Gold.`,
            );
            playSound("cash", 0.6);
        }
    }, [notify, playSound]);

    const applyEconomy = useCallback((data, zellen) => {
        if (typeof data?.gold === "number") setGold(data.gold);
        if (typeof data?.goldGesamt === "number") setGoldGesamt(data.goldGesamt);
        // Bug (Feedback 29.08.: "bei Schnellernten kommt kein XP"): der Server
        // schickt skillStand bei JEDER Aktion mit (siehe gardenGameRoutes.js,
        // Kommentar dort), applyEconomy hat ihn nur nie gelesen. Level/XP-Leiste
        // im HUD blieben deshalb nach JEDER Ernte stehen, wo sie vor der Ernte
        // waren — bei einzelnen Klicks fiel das kaum auf, beim Shift-Ziehen über
        // ein volles Feld (viele Ernten ohne Zwischenstopp) wirkte es wie "gar
        // kein XP". Die schwebende "+X XP"-Rückmeldung war die ganze Zeit korrekt.
        if (data?.skillStand) setSkillStand(data.skillStand);
        if (data?.ernteRausch) setErnteRausch(data.ernteRausch);
        if (Array.isArray(data?.stoerer)) setStoerer(data.stoerer);
        if (data?.zuchtbuch && typeof data.zuchtbuch === "object") setZuchtbuch(data.zuchtbuch);
        // Neuer persönlicher Rekord im Wochenwettbewerb (Backend world/wettbewerb.js).
        if (data?.wettbewerbRekord?.groesse) {
            notify(`Neuer Wochenrekord: ${KATALOG_NACH_ID.get(data.wettbewerbRekord.sorte)?.name || data.wettbewerbRekord.sorte} mit Größe ${formatGroesse(data.wettbewerbRekord.groesse)}!`);
        }
        // Alle Saisonziele geschafft (Backend core/saisonziele.js).
        if (data?.saisonAbschluss) {
            notify(data.saisonAbschluss.neu
                ? `Saisonziele ${data.saisonAbschluss.name} geschafft! Neues Namensschild freigeschaltet — ausrüsten im Gold-Shop.`
                : `Saisonziele ${data.saisonAbschluss.name} geschafft!`, "success");
            if (data.saisonAbschluss.jahreskreis) notify("Alle vier Jahreszeiten gesammelt — Namensschild „Jahreskreis“ freigeschaltet!", "success");
        }
        if (data?.logbuch) logbuchUebernehmen(data.logbuch);
        if (data?.logbuchBelohnungen?.length) logbuchBelohnungMelden(data.logbuchBelohnungen);
        if (Array.isArray(data?.harvestedItems)) setHarvestedItems(hydrateHarvestedItems(data.harvestedItems));
        if (!data?.plotPlants || typeof data.plotPlants !== "object") return;
        if (!zellen) {
            setPlotPlants(normalizePlotPlantsMap(data.plotPlants));
            return;
        }
        if (zellen.length === 0) return;
        setPlotPlants((prev) => {
            const next = { ...prev };
            for (const key of zellen) {
                const vomServer = data.plotPlants[key];
                if (vomServer) next[key] = hydratePlantVisuals(vomServer);
                else delete next[key];
            }
            return next;
        });
    }, [normalizePlotPlantsMap, hydratePlantVisuals, logbuchUebernehmen, logbuchBelohnungMelden]);

    /**
     * Missionsbelohnung abholen — steht erst hier (statt direkt bei ladeQuests
     * weiter oben), weil sie applyEconomy aus dem Dependency-Array braucht und
     * die erst ab dieser Zeile im Render existiert (siehe Kommentar dort).
     */
    const questAbholen = useCallback(async (questId) => {
        try {
            const data = await apiCall("/action", {
                method: "POST",
                body: JSON.stringify({ action: "questAbholen", questId }),
            });
            applyEconomy(data, []);
            playSound("cash", 0.6);
            notify(`${data?.name || "Mission"} abgeschlossen: +${formatGold(data?.belohnungGold || 0)} Gold, +${data?.belohnungXp || 0} XP`);
            ladeQuests();
        } catch (err) {
            notify(err?.message || "Ging nicht.", "error");
        }
    }, [apiCall, applyEconomy, notify, playSound, ladeQuests]);

    /**
     * Händler-Aufträge liefern/ablehnen. Rucksack, Gold und Level kommen wie bei
     * jeder Aktion in der Antwort mit (applyEconomy); die neuen Plätze als
     * `auftraege` — so springt das Brett sofort auf den neuen Stand.
     */
    const auftragAktion = useCallback(async (action, auftragId) => {
        try {
            const data = await apiCall("/action", {
                method: "POST",
                body: JSON.stringify({ action, auftragId }),
            });
            applyEconomy(data, []);
            if (data?.auftraege) setQuestDaten((prev) => ({ ...prev, auftraege: data.auftraege }));
            if (action === "auftragLiefern") {
                playSound("cash", 0.6);
                notify(`Auftrag erledigt: ${data?.anzahl || ""}× ${data?.name || ""} → +${formatGold(data?.belohnungGold || 0)} Gold, +${data?.belohnungXp || 0} XP`);
            }
        } catch (err) {
            notify(err?.message || "Ging nicht.", "error");
        }
    }, [apiCall, applyEconomy, notify, playSound]);
    const auftragLiefern = useCallback((id) => auftragAktion("auftragLiefern", id), [auftragAktion]);
    const erntefestAbholen = useCallback(async () => {
        try {
            const data = await apiCall("/action", {
                method: "POST",
                body: JSON.stringify({ action: "erntefestAbholen" }),
            });
            applyEconomy(data, []);
            if (data?.erntefest) setQuestDaten((prev) => ({ ...prev, erntefest: data.erntefest }));
            playSound("cash", 0.7);
            notify(`Erntefest-Belohnung (${data?.stufe || ""}): +${formatGold(data?.belohnungGold || 0)} Gold, +${data?.belohnungXp || 0} XP`);
        } catch (err) {
            notify(err?.message || "Ging nicht.", "error");
        }
    }, [apiCall, applyEconomy, notify, playSound]);
    const auftragAblehnen = useCallback((id) => auftragAktion("auftragAblehnen", id), [auftragAktion]);

    /**
     * Gold-Shop: kaufen und ausrüsten — aus demselben Grund wie questAbholen
     * erst hier (applyEconomy im Dependency-Array).
     */
    const reskinKaufen = useCallback(async (kategorie, id) => {
        try {
            const data = await apiCall("/action", {
                method: "POST",
                body: JSON.stringify({ action: "reskinKaufen", kategorie, id }),
            });
            applyEconomy(data, []);
            playSound("cash", 0.6);
            notify("Gekauft und ausgerüstet.");
            await ladeGoldShop();
        } catch (err) {
            notify(err?.message || "Ging nicht.", "error");
        }
    }, [apiCall, applyEconomy, notify, playSound, ladeGoldShop]);

    const reskinAusruesten = useCallback(async (kategorie, id) => {
        try {
            const data = await apiCall("/action", {
                method: "POST",
                body: JSON.stringify({ action: "reskinAusruesten", kategorie, id }),
            });
            applyEconomy(data, []);
            await ladeGoldShop();
        } catch (err) {
            notify(err?.message || "Ging nicht.", "error");
        }
    }, [apiCall, applyEconomy, notify, ladeGoldShop]);

    return { flushSave, payServer, applyEconomy, questAbholen, auftragLiefern, erntefestAbholen, auftragAblehnen, reskinKaufen, reskinAusruesten };
}
