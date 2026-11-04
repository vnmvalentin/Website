// ui/zuchtbuch.js — Zuchtbuch (Fahrplan Phase 5, Nutzerentscheidung 04.11.2026):
// Kreuzungs-Rezepte erspielen statt sie sofort zu zeigen.
//
//   * Entdeckt ist eine Kreuzung ab der ersten gelungenen Kreuzung (Server-Feld
//     `zuchtbuch`, siehe Backend core/economy.js harvestCell) — oder wenn sie schon
//     im Logbuch steht bzw. ihr Samen im Rucksack liegt: wer sie vor dem Zuchtbuch
//     gefunden hat, behält sein Wissen. Dann steht das volle Rezept da.
//   * Unentdeckt zeigt das Logbuch je Elternteil nur einen Hinweis (Seltenheit und
//     Wuchsform). Den NAMEN eines Elternteils deckt auf, wer diese Sorte
//     ELTERN_AUFDECKEN_AB-mal geerntet hat. Alte Logbuch-Einträge ohne Zähler zählen
//     als aufgedeckt (die Ernten stammen aus der Zeit vor dem Zähler).
//
// Reine Anzeige: die Rezepte selbst stehen im Katalog (Feld `eltern`), gekreuzt wird
// auf dem Server (core/kreuzung.js) — unabhängig davon, ob man das Rezept kennt.
import { SEED_CATALOGUE, ARCHETYPE_LABELS, getPlantArchetypeKey } from "../engine/PlantSystem";

export const ELTERN_AUFDECKEN_AB = 25;
const NACH_ID = new Map(SEED_CATALOGUE.map((s) => [s.id, s]));
const SELTENHEIT_NAME = {
    COMMON: "Common", UNCOMMON: "Uncommon", RARE: "Rare", EPIC: "Epic", LEGENDARY: "Legendary", MYTHIC: "Mythic",
};

/** Ist diese Kreuzung schon entdeckt? */
export function istEntdeckt(art, { zuchtbuch, logbuch, inventory }) {
    if (!art?.kreuzung) return true;
    if (zuchtbuch?.[art.id]) return true;
    if (logbuch?.[art.id]) return true;
    return Array.isArray(inventory) && inventory.some((s) => s?.seedId === art.id);
}

/**
 * Stand je Elternteil einer (unentdeckten) Kreuzung.
 * @returns {{id:string, name:string|null, hinweis:string, geerntet:number, aufgedeckt:boolean}[]}
 */
export function elternStand(art, logbuch) {
    return (Array.isArray(art?.eltern) ? art.eltern : []).map((id) => {
        const sorte = NACH_ID.get(id);
        const eintrag = logbuch?.[id];
        const geerntet = Number(eintrag?.anzahl) || 0;
        const aufgedeckt = Boolean(eintrag) && (eintrag.anzahl === undefined || geerntet >= ELTERN_AUFDECKEN_AB);
        const wuchs = ARCHETYPE_LABELS[getPlantArchetypeKey(id)] || (sorte?.singleUse === false ? "Dauerträger" : "Einmalernte");
        return {
            id,
            name: aufgedeckt ? (sorte?.name || id) : null,
            hinweis: `eine ${SELTENHEIT_NAME[sorte?.rarity] || "unbekannte"}-Sorte · ${wuchs}`,
            geerntet,
            aufgedeckt,
        };
    });
}
