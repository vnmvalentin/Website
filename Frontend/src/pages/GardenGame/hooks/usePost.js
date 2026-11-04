// hooks/usePost.js
// Post: Briefe abholen und verschicken (Gold, Samen, Ernte, Tiere als Anhang).
// Gerechnet wird auf dem Server (Backend/garden/world/mail.js). Ausgelagert aus GameContainer.jsx, Code unverändert.
import { useCallback } from "react";
import { hydrateSeeds, hydratePets } from "../engine/gameConstants";
import { hydrateHarvestedItems } from "../engine/PlantSystem";

export default function usePost({
    setMailBusy, apiCall, setMailboxState, setGold, setGoldGesamt, setInventory, setHarvestedItems,
    setPetInventory, notify, playSound, farmStateRef, flushSave, setSelectedSeed,
    setSelectedPetToPlace,
}) {
    const handleClaimMail = useCallback(async (mailId) => {
        setMailBusy(true);
        try {
            const data = await apiCall("/mail/claim", { method: "POST", body: JSON.stringify({ id: mailId }) });
            setMailboxState(Array.isArray(data?.mailbox) ? data.mailbox : []);
            if (typeof data?.gold === "number") setGold(data.gold);
            if (typeof data?.goldGesamt === "number") setGoldGesamt(data.goldGesamt);
            if (Array.isArray(data?.inventory)) setInventory(hydrateSeeds(data.inventory));
            if (Array.isArray(data?.harvestedItems)) setHarvestedItems(hydrateHarvestedItems(data.harvestedItems));
            if (Array.isArray(data?.petInventory)) setPetInventory(hydratePets(data.petInventory));
            // Eine Sendung kann mehrere Anhänge tragen — gleiche Namen werden für
            // die Meldung zu „Karotte × 3" zusammengefasst.
            const parts = [];
            if (data?.credited?.gold) parts.push(`${data.credited.gold.toLocaleString("de-DE")} Gold`);
            const namen = [
                ...(data?.credited?.seeds ?? []).map((s) => s?.name),
                ...(data?.credited?.items ?? []).map((i) => i?.name),
                ...(data?.credited?.pets ?? []).map((p) => p?.customName || p?.name),
            ].filter(Boolean);
            const gezaehlt = new Map();
            for (const name of namen) gezaehlt.set(name, (gezaehlt.get(name) || 0) + 1);
            for (const [name, anzahl] of gezaehlt) parts.push(anzahl > 1 ? `${name} × ${anzahl}` : name);
            notify(parts.length ? `Abgeholt: ${parts.join(", ")}.` : "Sendung abgeholt.");
            playSound("cash", 0.5);
        } catch (err) {
            notify(err?.message || "Abholen fehlgeschlagen.", "error");
        } finally {
            setMailBusy(false);
        }
    }, [apiCall, notify, playSound]);

    const handleSendMail = useCallback(async (payload, onDone) => {
        setMailBusy(true);
        const gesendeteSamen = new Set(payload.seedInstanceIds || []);
        const gesendeteTiere = new Set(payload.petIds || []);
        const gesendeteErnte = new Set(payload.itemIds || []);
        // Fuer den Ruecksprung, falls der Server ablehnt
        const { inventory: vorherSamen, petInventory: vorherTiere, harvestedItems: vorherErnte } = farmStateRef.current;
        try {
            // Erst den eigenen Stand hochschieben: der Server entscheidet gleich
            // anhand SEINER Kopie, ob der Samen ueberhaupt existiert. Ein Tier, das
            // gerade erst geschluepft ist, steht dort sonst noch gar nicht.
            await flushSave();

            // Jetzt sofort aus dem Rucksack nehmen. Vorher lag zwischen Klick und
            // Verschwinden eine ganze Netzrunde, und ein verschenkter Samen blieb
            // solange auswaehlbar — man konnte ihn in der Zwischenzeit einpflanzen.
            if (gesendeteSamen.size) {
                setInventory((prev) => prev.filter((s) => !gesendeteSamen.has(String(s?.instanceId))));
                setSelectedSeed((prev) => (prev && gesendeteSamen.has(String(prev.instanceId)) ? null : prev));
            }
            if (gesendeteTiere.size) {
                setPetInventory((prev) => prev.filter((p) => !gesendeteTiere.has(String(p?.id || p?.instanceId))));
                setSelectedPetToPlace((prev) => (prev && gesendeteTiere.has(String(prev.id || prev.instanceId)) ? null : prev));
            }
            if (gesendeteErnte.size) {
                setHarvestedItems((prev) => prev.filter((i) => !gesendeteErnte.has(String(i?.id))));
            }

            const data = await apiCall("/mail/send", { method: "POST", body: JSON.stringify(payload) });
            // Server hat abgebucht — lokalen Stand übernehmen, sonst schreibt der
            // nächste Auto-Save das alte Gold zurück.
            if (typeof data?.gold === "number") setGold(data.gold);
            if (Array.isArray(data?.inventory)) setInventory(hydrateSeeds(data.inventory));
            // Ernte und Tiere ebenfalls uebernehmen — sonst traegt der naechste
            // Speichervorgang das Verschenkte wieder ein.
            if (Array.isArray(data?.harvestedItems)) setHarvestedItems(hydrateHarvestedItems(data.harvestedItems));
            if (Array.isArray(data?.petInventory)) setPetInventory(hydratePets(data.petInventory));
            const anhaenge = gesendeteSamen.size + gesendeteErnte.size + gesendeteTiere.size;
            notify(anhaenge > 1
                ? `Sendung mit ${anhaenge} Gegenständen an ${payload.toLogin} unterwegs.`
                : `Sendung an ${payload.toLogin} unterwegs.`);
            onDone?.();
        } catch (err) {
            // Nichts ist rausgegangen (der Server prueft alles, bevor er abbucht) —
            // also den Rucksack wieder herstellen.
            setInventory(vorherSamen);
            setPetInventory(vorherTiere);
            setHarvestedItems(vorherErnte);
            notify(err?.message || "Senden fehlgeschlagen.", "error");
        } finally {
            setMailBusy(false);
        }
    }, [apiCall, notify, flushSave]);

    return { handleClaimMail, handleSendMail };
}
