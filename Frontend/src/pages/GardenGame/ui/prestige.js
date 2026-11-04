// ui/prestige.js — „Neue Saat" im Browser: nur Anzeige. Regeln und Zahlen kommen
// vom Server (Backend/garden/core/prestige.js, GET /prestige). Die Kosmetik-Stufen
// stehen hier noch einmal, weil der Renderer sie für JEDEN Spieler braucht, nicht
// nur für den eigenen — die Liste muss zu KOSMETIK im Backend passen.

export const STERNE_MAX = 5;

export const KOSMETIK_AB = {
    abzeichen: 1,   // Stern im Namensschild
    goldname: 2,    // goldene Schrift im Namensschild
    spur: 3,        // Sternenspur beim Laufen
    goldfunken: 4,  // goldene Funken beim Ernten (nur der eigene Spieler sieht sie)
    titel: 5,       // Titel „Sternengärtner" über dem Namen
};

export const TITEL = "Sternengärtner";

export function hatKosmetik(sterne, id) {
    return (Number(sterne) || 0) >= (KOSMETIK_AB[id] ?? Infinity);
}

/** „★★★☆☆" für Listen. */
export function sterneText(sterne, max = STERNE_MAX) {
    const n = Math.max(0, Math.min(max, Math.floor(Number(sterne) || 0)));
    return "★".repeat(n) + "☆".repeat(max - n);
}
