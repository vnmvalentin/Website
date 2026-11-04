// hooks/useVerkauf.js
// Verkaufen: Ernte am Markt, Tiere am Tiermarkt bzw. aus der Detailansicht; Tiere einpacken/umbenennen.
// Ausgelagert aus GameContainer.jsx, Code unverändert.
import { useCallback, useEffect } from "react";
import { formatGold } from "../ui/gardenTokens";
import { muenzFlug } from "../ui/muenzFlug";

export default function useVerkauf({
    harvestedItems, apiCall, applyEconomy, playSound, engineRef, notify, sellAllRef,
    selectedPetToPlace, flushSave, setPetInventory, setSelectedPetToPlace, setGold, setGoldGesamt,
    debouncedSave, sellPetRef, inspectedPet, setPetPlacements, setInspectedPet,
}) {
    // Verkauf ebenfalls serverseitig: die Summe entsteht aus den beim Server
    // gespeicherten Ernte-Eigenschaften, nicht aus einem vom Client gemeldeten Wert.
    const handleSellAllHarvested = useCallback(async () => {
        if (harvestedItems.length === 0) return;
        try {
            const data = await apiCall("/action", {
                method: "POST",
                body: JSON.stringify({ action: "sellAll" }),
            });
            // Verkaufen ruehrt keine Pflanze an — leeres Array heisst "nicht anfassen".
            applyEconomy(data, []);
            playSound("cash", 0.6);
            const verdient = Number(data?.verdient || 0);
            // Feedback 30.08.: "nicht oben die kleine graue Bubble, sondern eine
            // animierte Cartoon-Blase auf dem Markt mit dem gemachten Geld" — der
            // Spieler steht beim Verkaufen immer am Markt (sellAllRef läuft nur aus
            // activateInteractable/der Marktstand-Ansicht, beide setzen Nähe voraus),
            // die Sprechblase kann also direkt über dem Marktstand erscheinen statt
            // als Kopfzeilen-Meldung.
            const marktBereich = engineRef.current?.areas?.market;
            const renderer = engineRef.current?.renderer;
            if (renderer && marktBereich) {
                renderer.spawnVerkaufsBlase(marktBereich.x, marktBereich.y - 80, `+${formatGold(verdient)}`);
                // Anteil der gefragten Sorten (Backend core/nachfrage.js) eigens zeigen.
                const extra = Number(data?.nachfrageBonus) || 0;
                if (extra > 0) {
                    renderer.spawnFeedback(marktBereich.x, marktBereich.y - 150, `davon +${formatGold(extra)} gefragt`, { color: "#86efac", durationMs: 2200 });
                }
                // Münzen fliegen vom Spieler (Bildmitte — die Kamera folgt ihm) zum
                // Goldzähler. Mehr Ware, mehr Münzen, gedeckelt in muenzFlug.
                const flaeche = renderer.canvas?.getBoundingClientRect?.();
                if (flaeche) {
                    muenzFlug(
                        { x: flaeche.left + flaeche.width / 2, y: flaeche.top + flaeche.height / 2 - 30 },
                        4 + Math.log10(Math.max(10, verdient)),
                    );
                }
            } else {
                notify("Alles verkauft: +" + verdient.toLocaleString("de-DE") + " Gold");
            }
        } catch (err) {
            notify(err?.message || "Verkauf fehlgeschlagen.", "error");
        }
    }, [harvestedItems.length, apiCall, applyEconomy, notify, playSound]);

    useEffect(() => {
        sellAllRef.current = handleSellAllHarvested;
    }, [handleSellAllHarvested]);

    // Verkaufspreis zahlt der Server aus seiner eigenen Tabelle — vorher muss der
    // Spielstand raus, sonst kennt er ein frisch geschluepftes Tier noch nicht.
    const handleSellSelectedPet = useCallback(async () => {
        if (!selectedPetToPlace) {
            notify("Kein Tier in der Hand. Wähle zuerst ein Tier aus dem Rucksack.", "error");
            return;
        }
        const name = selectedPetToPlace.name || "Tier";
        const petId = selectedPetToPlace.id || selectedPetToPlace.instanceId;
        try {
            await flushSave();
            const data = await apiCall("/action", {
                method: "POST",
                body: JSON.stringify({ action: "sellPet", petId }),
            });
            setPetInventory(prev => prev.filter(p => (p.id || p.instanceId) !== petId));
            setSelectedPetToPlace(null);
            if (typeof data?.gold === "number") setGold(data.gold);
            if (typeof data?.goldGesamt === "number") setGoldGesamt(data.goldGesamt);
            playSound("cash", 0.6);
            notify(`${name} verkauft: +${Number(data?.verdient || 0).toLocaleString('de-DE')} Gold`);
            debouncedSave();
        } catch (err) {
            notify(err?.message || "Verkauf fehlgeschlagen.", "error");
        }
    }, [selectedPetToPlace, notify, playSound, apiCall, flushSave, debouncedSave]);

    useEffect(() => {
        sellPetRef.current = handleSellSelectedPet;
    }, [handleSellSelectedPet]);

    // ── Tier-Detailfenster (Klick auf ein platziertes Tier) ───────────────────
    const handleStowInspectedPet = useCallback(() => {
        if (!inspectedPet) return;
        const petId = inspectedPet.id;
        setPetPlacements(prev => prev.filter(p => p.id !== petId));
        // Kennung bleibt dieselbe — sonst fände der Server das Tier nicht wieder.
        setPetInventory(prev => [...prev, {
            ...inspectedPet,
            instanceId: petId,
            _type: "pet",
        }]);
        notify(`${inspectedPet.name || "Tier"} eingepackt.`);
        setInspectedPet(null);
        debouncedSave();
    }, [inspectedPet, notify, debouncedSave]);

    const handleRenamePet = useCallback((pet, newName) => {
        if (!pet) return;
        const clean = String(newName || "").replace(/\s+/g, " ").trim().slice(0, 24);
        const customName = clean || null; // leeres Feld = zurück zum Artnamen
        setPetPlacements(prev => prev.map(p => (p.id === pet.id ? { ...p, customName } : p)));
        setInspectedPet(prev => (prev && prev.id === pet.id ? { ...prev, customName } : prev));
        notify(customName ? `Heißt jetzt „${customName}".` : "Name zurückgesetzt.");
        debouncedSave();
    }, [notify, debouncedSave]);

    const handleSellInspectedPet = useCallback(async () => {
        if (!inspectedPet) return;
        const petId = inspectedPet.id;
        const name = inspectedPet.name || "Tier";
        try {
            await flushSave();
            const data = await apiCall("/action", {
                method: "POST",
                body: JSON.stringify({ action: "sellPet", petId }),
            });
            setPetPlacements(prev => prev.filter(p => p.id !== petId));
            if (typeof data?.gold === "number") setGold(data.gold);
            if (typeof data?.goldGesamt === "number") setGoldGesamt(data.goldGesamt);
            playSound("cash", 0.6);
            notify(`${name} verkauft: +${Number(data?.verdient || 0).toLocaleString('de-DE')} Gold`);
            setInspectedPet(null);
            debouncedSave();
        } catch (err) {
            notify(err?.message || "Verkauf fehlgeschlagen.", "error");
        }
    }, [inspectedPet, notify, playSound, debouncedSave, apiCall, flushSave]);

    return { handleSellAllHarvested, handleStowInspectedPet, handleRenamePet, handleSellInspectedPet };
}
