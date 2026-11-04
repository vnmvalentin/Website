// hooks/useEierDekoBrutkasten.js
// Eier und Deko kaufen, Brutkasten: Plätze freischalten, Ei hineinlegen, geschlüpftes Tier abholen.
// Ausgelagert aus GameContainer.jsx, Code unverändert.
import { useCallback, useEffect } from "react";
import { hydratePets, INCUBATOR_UNLOCK_COSTS } from "../engine/gameConstants";
import { formatGold } from "../ui/gardenTokens";
import { alsVorratsstueck } from "../ui/deko";

export default function useEierDekoBrutkasten({
    goldRef, setGold, setGoldGesamt, setEggInventory, setPetInventory, setIncubator, kaufLaeuftRef,
    kaufEinreihen, handleBuyEggRef, notify, reserviere, eggShopStockRef, setEggShopStock, apiCall,
    gibZurueck, naechstenKaufStarten, handleBuyDecoRef, payServer, farmStateRef, setDecoInventory,
    selectedDecoToPlace, setSelectedDecoToPlace, setSelectedSeed, setSelectedTool,
    setSelectedCarryItem, setSelectedPetToPlace, kaufSichern, unlockIncubatorSlotRef, incubator,
    eggInventory, setIncubatorTargetSlot,
}) {
    /**
     * Eier, Brutkasten und frisch geschlüpfte Tiere gehören dem Server (Backend
     * garden/core/brutkasten.js). Nach jeder dieser Aktionen wird seine Antwort
     * übernommen statt selbst etwas auszurechnen.
     */
    const uebernimmBrut = useCallback((data) => {
        if (!data) return;
        if (typeof data.gold === "number") { goldRef.current = data.gold; setGold(data.gold); }
        if (typeof data.goldGesamt === "number") setGoldGesamt(data.goldGesamt);
        if (Array.isArray(data.eggInventory)) setEggInventory(data.eggInventory);
        if (Array.isArray(data.petInventory)) setPetInventory(hydratePets(data.petInventory));
        if (data.incubator && typeof data.incubator === "object") setIncubator(data.incubator);
    }, []);

    const handleBuyEgg = useCallback(async (egg) => {
        if (kaufLaeuftRef.current) { kaufEinreihen(() => handleBuyEggRef.current?.(egg)); return; }
        if (goldRef.current < egg.price) { notify(`Dafür fehlen dir ${formatGold(egg.price - goldRef.current)} Gold.`, "error"); return; }
        if (!reserviere(eggShopStockRef, setEggShopStock, egg.id)) return;
        kaufLaeuftRef.current = true;
        try {
            const data = await apiCall("/action", {
                method: "POST",
                body: JSON.stringify({ action: "buyEgg", eggId: egg.id }),
            });
            uebernimmBrut(data);
            if (typeof data?.stock === "number") setEggShopStock((prev) => ({ ...prev, [egg.id]: Math.max(0, data.stock) }));
        } catch (err) {
            gibZurueck(eggShopStockRef, setEggShopStock, egg.id);
            if (typeof err?.data?.stock === "number") setEggShopStock((prev) => ({ ...prev, [egg.id]: Math.max(0, err.data.stock) }));
            notify(err?.message || "Kauf fehlgeschlagen.", "error");
        } finally {
            kaufLaeuftRef.current = false;
            naechstenKaufStarten();
        }
    }, [notify, apiCall, uebernimmBrut, reserviere, gibZurueck, kaufEinreihen, naechstenKaufStarten]);

    useEffect(() => { handleBuyEggRef.current = handleBuyEgg; }, [handleBuyEgg]);

    /**
     * `anzahl` gibt es wegen der Bodenbeläge: einen Hof pflastert man mit zwanzig
     * Kacheln, und zwanzig Einzelkäufe wären zwanzig Netzrunden. Bezahlt wird in
     * EINEM Betrag, damit auch nur eine Prüfung über den Server geht.
     */
    const handleBuyDeco = useCallback(async (deco, anzahl = 1) => {
        if (!deco) return;
        const stueck = Math.max(1, Math.min(50, Math.floor(Number(anzahl) || 1)));
        const preis = deco.price * stueck;
        if (kaufLaeuftRef.current) { kaufEinreihen(() => handleBuyDecoRef.current?.(deco, stueck)); return; }
        if (goldRef.current < preis) {
            notify("Nicht genug Gold.", "error");
            return;
        }
        const vorlage = alsVorratsstueck(deco);
        const instanzen = Array.from({ length: stueck }, () => ({
            ...vorlage,
            instanceId: `deco_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            _type: "deco",
        }));
        kaufLaeuftRef.current = true;
        try {
            await payServer(preis);
        } catch (err) {
            notify(err?.message || "Kauf fehlgeschlagen.", "error");
            return;
        } finally {
            kaufLaeuftRef.current = false;
            naechstenKaufStarten();
        }
        const naechsteDeko = [...(farmStateRef.current.decoInventory || []), ...instanzen];
        setDecoInventory(naechsteDeko);
        if (!selectedDecoToPlace) setSelectedDecoToPlace(instanzen[0]);
        setSelectedSeed(null);
        setSelectedTool(null);
        setSelectedCarryItem(null);
        setSelectedPetToPlace(null);
        if (stueck > 1) notify(`${stueck}× ${deco.name} gekauft.`);
        await kaufSichern("decoInventory", naechsteDeko);
    }, [notify, selectedDecoToPlace, payServer, kaufEinreihen, naechstenKaufStarten, kaufSichern]);

    useEffect(() => { handleBuyDecoRef.current = handleBuyDeco; }, [handleBuyDeco]);

    const unlockIncubatorSlot = useCallback(async () => {
        if (kaufLaeuftRef.current) { kaufEinreihen(() => unlockIncubatorSlotRef.current?.()); return; }
        const nextSlot = incubator.unlockedSlots; // 0-indexed: current = unlockedSlots-1, next = unlockedSlots
        if (nextSlot >= 5) return;
        const cost = INCUBATOR_UNLOCK_COSTS[nextSlot - 1];
        // goldRef statt gold: der React-Wert hinkt einem gerade abgeschlossenen
        // Kauf hinterher. Die Prüfung lief damit gegen den Stand von DAVOR — mal
        // ging ein Kauf durch, den der Server ablehnen musste (für den Spieler
        // passierte scheinbar nichts), mal wurde einer blockiert, den man sich
        // längst leisten konnte.
        if (goldRef.current < cost) { notify(`Dafür brauchst du ${cost.toLocaleString('de-DE')} Gold.`, "error"); return; }
        kaufLaeuftRef.current = true;
        try {
            const data = await apiCall("/action", {
                method: "POST",
                body: JSON.stringify({ action: "brutplatzFreischalten" }),
            });
            uebernimmBrut(data);
            notify(`Inkubator-Slot ${nextSlot + 1} freigeschaltet!`);
        } catch (err) {
            notify(err?.message || "Freischalten fehlgeschlagen.", "error");
        } finally {
            kaufLaeuftRef.current = false;
            naechstenKaufStarten();
        }
    }, [incubator, notify, apiCall, uebernimmBrut, kaufEinreihen, naechstenKaufStarten]);

    useEffect(() => { unlockIncubatorSlotRef.current = unlockIncubatorSlot; }, [unlockIncubatorSlot]);

    // Einlegen und Abholen rechnet der Server (Brutzeit nach Seltenheit, Schlüpf-
    // Ergebnis) — vorher würfelte das der Browser und speicherte es selbst.
    const placeEggInIncubator = useCallback(async (slotIndex, eggInstanceId) => {
        if (!eggInventory.length || slotIndex >= incubator.unlockedSlots) return;
        if (incubator.slots[slotIndex]) return;
        const chosen = eggInventory.find(e => e.instanceId === eggInstanceId) || eggInventory[0];
        if (!chosen) return;
        setIncubatorTargetSlot(null);
        try {
            const data = await apiCall("/action", {
                method: "POST",
                body: JSON.stringify({ action: "eiEinlegen", platz: slotIndex, eiKennung: chosen.instanceId }),
            });
            uebernimmBrut(data);
        } catch (err) {
            notify(err?.message || "Das Ei ließ sich nicht einlegen.", "error");
        }
    }, [eggInventory, incubator, apiCall, uebernimmBrut, notify]);

    const collectHatchedEgg = useCallback(async (slotIndex) => {
        const slot = incubator.slots[slotIndex];
        if (!slot || Date.now() < slot.hatchAt) return;
        try {
            const data = await apiCall("/action", {
                method: "POST",
                body: JSON.stringify({ action: "eiAbholen", platz: slotIndex }),
            });
            uebernimmBrut(data);
        } catch (err) {
            notify(err?.message || "Das Tier ließ sich nicht abholen.", "error");
        }
    }, [incubator, apiCall, uebernimmBrut, notify]);

    return { handleBuyEgg, handleBuyDeco, unlockIncubatorSlot, placeEggInIncubator, collectHatchedEgg };
}
