// ui/auftragPasst.js
// Passt ein Rucksack-Stück zu einem Händler-Auftrag? Gleiche Regel wie erfuellt() in
// Backend core/auftraege.js — nur für Anzeigen (Auftragszettel, Marken über den Ständen).

export function passtZumAuftrag(item, auftrag) {
    if (!item || !auftrag || item.seedId !== auftrag.seedId) return false;
    if (auftrag.merkmal === "gross") return (Number(item.size) || 0) >= 35;
    if (auftrag.merkmal === "golden") {
        const name = String(item.specialData?.name || "").toLowerCase();
        return name === "golden" || name === "rainbow";
    }
    if (auftrag.merkmal === "wetter") {
        return (Array.isArray(item.statusEffects) && item.statusEffects.length > 0) || Boolean(item.statusEffect);
    }
    return true;
}

/**
 * Was man an den Ständen gerade erledigen kann (06.11., Marken über Händler, Brett und
 * Erntefest): Anzahl je Stand-Art, nur Einträge > 0.
 */
export function standMarken(questDaten, rucksack) {
    const marken = {};
    const items = Array.isArray(rucksack) ? rucksack : [];
    const plaetze = questDaten?.auftraege?.plaetze || [];
    const lieferbar = plaetze.filter((a) => a && items.filter((it) => passtZumAuftrag(it, a)).length >= (Number(a.anzahl) || 1)).length;
    if (lieferbar > 0) marken.haendler = lieferbar;
    const quests = [...(questDaten?.taeglich || []), ...(questDaten?.woechentlich || [])];
    const abholbar = quests.filter((q) => q?.erreicht && !q?.abgeholt).length;
    if (abholbar > 0) marken.questBoard = abholbar;
    if (questDaten?.erntefest?.abholbar?.stufe) marken.erntefest = 1;
    return marken;
}
