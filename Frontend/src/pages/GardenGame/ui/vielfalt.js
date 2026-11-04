// Vielfalt-Bonus — Spiegel von Backend garden/core/vielfalt.js, nur für die Anzeige.
// Gerechnet und ausgezahlt wird auf dem Server beim Ernten; ändert sich dort eine
// Zahl, muss sie hier mitziehen.
import { KATALOG_NACH_ID } from "../engine/gameConstants";

export const VIELFALT_JE_SELTENHEIT_MAX = 3;
const GRUND = 1;
const JE_PUNKT = 0.02;
export const VIELFALT_STUFEN = ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY", "MYTHIC"];

/** Je Seltenheit: welche Sorten stehen gerade auf dem Acker? */
export function vielfaltStand(plotPlants, kenner = 0) {
    const jeStufe = Object.fromEntries(VIELFALT_STUFEN.map((r) => [r, new Set()]));
    for (const p of Object.values(plotPlants || {})) {
        const r = p?.seedId && KATALOG_NACH_ID.get(p.seedId)?.rarity;
        if (r && jeStufe[r]) jeStufe[r].add(p.seedId);
    }
    let punkte = 0;
    const zeilen = VIELFALT_STUFEN.map((r) => {
        const zaehlt = Math.min(VIELFALT_JE_SELTENHEIT_MAX, jeStufe[r].size);
        punkte += zaehlt;
        // Erreichbar: höchstens 3, aber nie mehr, als es Sorten dieser Seltenheit gibt.
        const max = Math.min(VIELFALT_JE_SELTENHEIT_MAX, [...KATALOG_NACH_ID.values()].filter((k) => k.rarity === r).length);
        return { rarity: r, sorten: jeStufe[r].size, zaehlt, max };
    });
    const faktor = Math.round((GRUND + JE_PUNKT * punkte * (1 + Math.max(0, Number(kenner) || 0))) * 1000) / 1000;
    return { punkte, faktor, zeilen };
}
