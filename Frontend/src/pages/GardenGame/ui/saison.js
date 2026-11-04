// ui/saison.js
// Anzeige der Jahreszeit — Farben und Restzeit. Welche Saison gerade läuft und
// welche Sorten dazugehören, steht in engine/Tageszeit.js (Spiegel des Servers);
// hier liegt nur, wie es aussieht.

/** Textfarbe des Saisonnamens im HUD — flach, eine Farbe je Saison. */
export const SAISON_TEXTFARBE = {
    fruehling: "text-pink-300",
    sommer: "text-yellow-300",
    herbst: "text-orange-300",
    winter: "text-sky-200",
};

/** Restzeit grob: „5 T", „7 Std", „40 Min" — sekundengenau braucht es hier nicht. */
export function formatSaisonRest(ms) {
    const rest = Math.max(0, Number(ms) || 0);
    const tage = Math.floor(rest / 86400000);
    if (tage >= 1) return `${tage} T`;
    const stunden = Math.floor(rest / 3600000);
    if (stunden >= 1) return `${stunden} Std`;
    return `${Math.max(1, Math.ceil(rest / 60000))} Min`;
}
