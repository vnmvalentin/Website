// ui/wardrobe.js
// Skin-Katalog der Umkleide — Spiegel von Backend/garden/core/wardrobe.js.
//
// Wer hier etwas ändert, ändert es DORT ebenfalls: der Server prüft beim Verteilen
// des Aussehens, ob der Skin zum Level passt (garden:appearance in world/lobby.js).
// Laufen die Listen auseinander, zeigt die Umkleide etwas an, das der Server
// stillschweigend ablehnt.

const BASIS = "/garden-assets/wardrobe";

/**
 * Fellfarben der Katze. Alle frei — es ist dieselbe Figur, nur anders gefärbt/
 * gemustert, und eine Farbwahl hinter eine Levelhürde zu stellen wäre gängelnd.
 *
 * Feedback 30.08.: Lieferung von zwölf fertigen Katzen-Bildern (statt der
 * bisherigen CSS-eingefärbten Farmer-Figur) — jede Farbe/Musterung ist jetzt
 * ein eigenes Bild unter wardrobe/farmer/, kein `farbe`-Hex-Wert mehr nötig
 * (siehe Farbknopf in WardrobeModal.jsx, der jetzt ein Bild statt einer Fläche
 * zeigt). "normal" (die Standard-Katze im Farmer-Look) ersetzt das alte
 * "farmer" als STANDARD_SKIN.
 */
export const FARMER_FARBEN = [
    { id: "normal",    name: "Klassisch" },
    { id: "white",     name: "Weiß" },
    { id: "black",     name: "Schwarz" },
    { id: "grey",      name: "Grau" },
    { id: "brown",     name: "Braun" },
    { id: "brownmix",  name: "Schildpatt" },
    { id: "mixed",     name: "Scheckig" },
    { id: "orange",    name: "Orange" },
    { id: "pink",      name: "Pink" },
    { id: "blue",      name: "Blau" },
    { id: "purple",    name: "Violett" },
    { id: "cyan",      name: "Türkis" },
];

/**
 * Kostüme der Katze. Freigeschaltet über das Level aus dem Fähigkeitsbaum —
 * dasselbe Level, dieselbe Erfahrung. Die Stufen sind so gelegt, dass bis kurz
 * vor MAX_LEVEL (50, siehe Backend core/skills.js) immer wieder etwas
 * dazukommt und der Weg zum Höchstlevel ein sichtbares Ziel hat.
 *
 * Ersetzt die früheren "Geister" (Fantasy-Geister-Themen) UND die alten,
 * levelfreien "Outfits" (Zauberer/König/Ente) — Feedback 30.08.: die neue
 * Lieferung sind zehn durchgängig als Katze gezeichnete Kostüme, keine
 * Geister mehr. Eine Sonderform ohne Level gibt es bewusst nicht mehr — jedes
 * Kostüm hier ist ein echtes Ziel.
 */
export const KOSTUEME = [
    { id: "explorer",   name: "Entdecker", ab: 5 },
    { id: "cowboy",     name: "Cowboy",    ab: 9 },
    { id: "painter",    name: "Maler",     ab: 13 },
    { id: "detective",  name: "Detektiv",  ab: 17 },
    { id: "musician",   name: "Musiker",   ab: 22 },
    { id: "pirate",     name: "Pirat",     ab: 27 },
    { id: "knight",     name: "Ritter",    ab: 32 },
    { id: "ninja",      name: "Ninja",     ab: 37 },
    { id: "wizard",     name: "Zauberer",  ab: 42 },
    { id: "astronaut",  name: "Astronaut", ab: 48 },
];

export const farmerPfad = (id) => `${BASIS}/farmer/${id}.png`;
export const skinPfad = (id) => `${BASIS}/${id}.png`;

export const STANDARD_SKIN = farmerPfad("normal");

/** Flache Liste für Vorladen und Nachschlagen. */
export const ALLE_SKINS = [
    ...FARMER_FARBEN.map((f) => ({ ...f, skin: farmerPfad(f.id), ab: 1, gruppe: "farbe" })),
    ...KOSTUEME.map((k) => ({ ...k, skin: skinPfad(k.id), gruppe: "kostuem" })),
];

const NACH_PFAD = new Map(ALLE_SKINS.map((s) => [s.skin, s]));

/**
 * Alte/retirierte Pfade auf einen gültigen Skin ziehen.
 *
 * Der Hauptskin lag bis v3.6 direkt unter wardrobe/farmer.png, dann bis
 * Feedback 30.08. unter wardrobe/farmer/farmer.png (Farmer-Ghost) — jeder
 * gespeicherte Spielstand und jeder localStorage-Eintrag kann noch auf einen
 * dieser alten Orte zeigen. Genauso jeder andere inzwischen gestrichene Skin
 * (alte Farben wie farmer/red.png, alte Geister, die alten Outfits/Person-
 * Skins): ohne den generischen NACH_PFAD-Check unten bliebe der Pfad einfach
 * stehen, das Bild liefert einen 404 und _drawImageOrEmojiContain zeigt an
 * seiner Stelle nur noch das 🌱-Notbild (gemeldet 30.08.). Mit dem Check fällt
 * JEDER unbekannte Pfad sauber auf STANDARD_SKIN zurück — die Figur bleibt
 * sichtbar, nur eben in der Standard-Farbe.
 */
export function normalisiereSkin(pfad) {
    if (typeof pfad !== "string" || !pfad) return STANDARD_SKIN;
    if (pfad === `${BASIS}/farmer.png`) return STANDARD_SKIN;
    if (!NACH_PFAD.has(pfad)) return STANDARD_SKIN;
    return pfad;
}

/** Eintrag zu einem Pfad, oder null. */
export function skinInfo(pfad) {
    return NACH_PFAD.get(normalisiereSkin(pfad)) || null;
}

/** Darf dieses Level diesen Skin tragen? */
export function istFreigeschaltet(pfad, level, twitchId = null) {
    const eintrag = skinInfo(pfad);
    if (!eintrag) return false;
    if (eintrag.nurTwitchId && String(twitchId || "") !== eintrag.nurTwitchId) return false;
    return (Number(level) || 1) >= eintrag.ab;
}

/** Das nächste Kostüm, das noch aussteht — für den Hinweis in der Umkleide. */
export function naechstesKostuem(level) {
    const l = Number(level) || 1;
    return KOSTUEME.find((k) => k.ab > l) || null;
}
