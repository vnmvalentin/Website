// hooks/useAblage.js
// Ablage: Gegenstände zwischen Rucksack, Kiste und Vitrine verschieben (über den Server).
// Ausgelagert aus GameContainer.jsx, Code unverändert.
import { useCallback } from "react";
import { hydrateHarvestedItems } from "../engine/PlantSystem";
import { hydrateSeeds, hydratePets } from "../engine/gameConstants";

export default function useAblage({
    setAblageBusy, flushSave, apiCall, setHarvestedItems, setChestItems, setVitrineItems,
    setInventory, setEggInventory, setDecoInventory, setPetInventory, notify,
}) {
    /**
     * Ernte zwischen Rucksack und Ablage (Kiste/Vitrine) schieben. Beide Seiten
     * gehören dem Server — hier wird nur seine Antwort übernommen.
     */
    /**
     * Ein- und Auslagern, einzeln oder alles auf einmal.
     *
     * Seit die Kiste auch Samen, Eier, Deko und Tiere nimmt, verschiebt der Server
     * Listen, die dem BROWSER gehören. Deshalb wird vorher ausstehender Speicherstand
     * rausgeschickt: ein noch wartender PUT mit dem alten Rucksack würde sonst
     * gerade Eingelagertes wieder danebenlegen — das Stück läge dann doppelt da.
     */
    const handleAblage = useCallback(async (art, itemId, richtung) => {
        setAblageBusy(true);
        try {
            await flushSave();
            const alles = itemId === null || itemId === undefined;
            const data = await apiCall("/action", {
                method: "POST",
                body: JSON.stringify({
                    action: richtung === "ein"
                        ? (alles ? "ablageAllesEin" : "ablageEin")
                        : (alles ? "ablageAllesAus" : "ablageAus"),
                    ablage: art,
                    ...(alles ? {} : { itemId }),
                }),
            });
            if (Array.isArray(data?.harvestedItems)) setHarvestedItems(hydrateHarvestedItems(data.harvestedItems));
            if (Array.isArray(data?.chestItems)) setChestItems(hydrateHarvestedItems(data.chestItems));
            if (Array.isArray(data?.vitrineItems)) setVitrineItems(hydrateHarvestedItems(data.vitrineItems));
            if (Array.isArray(data?.inventory)) setInventory(hydrateSeeds(data.inventory));
            if (Array.isArray(data?.eggInventory)) setEggInventory(data.eggInventory);
            if (Array.isArray(data?.decoInventory)) setDecoInventory(data.decoInventory);
            if (Array.isArray(data?.petInventory)) setPetInventory(hydratePets(data.petInventory));
            if (alles && Number.isFinite(data?.bewegt)) {
                const rest = data.liegengeblieben
                    ? ` ${data.liegengeblieben} blieben liegen (Rucksack voll).`
                    : data.rest ? " Der Rest passte nicht mehr hinein." : "";
                notify(`${data.bewegt} ${data.bewegt === 1 ? "Sache" : "Sachen"} ${richtung === "ein" ? "eingelagert" : "herausgeholt"}.${rest}`);
            }
        } catch (err) {
            notify(err?.message || "Hat nicht geklappt.", "error");
        } finally {
            setAblageBusy(false);
        }
    }, [apiCall, notify, flushSave]);

    return { handleAblage };
}
