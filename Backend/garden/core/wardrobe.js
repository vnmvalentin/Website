// garden/core/wardrobe.js
// Welche Skins es gibt und ab welchem Level sie offen sind.
//
// WARUM DAS IM BACKEND LIEGT
// Das Aussehen ist rein kosmetisch, aber es wird an ALLE Mitspieler verteilt
// (garden:appearance in world/lobby.js). Ohne serverseitige Prüfung könnte ein
// manipulierter Browser jeden Geist tragen, den er noch gar nicht freigeschaltet
// hat — und für die anderen sähe es echt aus. Die Prüfung ist billig, also wird
// sie gemacht.
//
// MUSS ZU Frontend/src/pages/GardenGame/ui/wardrobe.js PASSEN. Wer hier etwas
// ändert, ändert es dort ebenfalls — sonst zeigt die Umkleide etwas an, das der
// Server ablehnt.

const BASIS = "/garden-assets/wardrobe";

/**
 * Wem der Admin-Geist gehört. Aus der Umgebung, damit dieselbe Zahl nicht in
 * jeder Datei einzeln steht; der Rückfall ist die Streamer-ID, mit der die
 * Instanz ohnehin läuft.
 */
const ADMIN_TWITCH_ID = String(process.env.STREAMER_TWITCH_ID || "160224748");

function istAdminId(twitchId) {
    return Boolean(twitchId) && String(twitchId) === ADMIN_TWITCH_ID;
}

/**
 * Fellfarben der Katze. Alle frei — es ist dieselbe Figur, nur anders gefärbt/
 * gemustert, und eine Farbwahl hinter eine Levelhürde zu stellen wäre gängelnd.
 *
 * Feedback 30.08.: Lieferung von zwölf fertigen Katzen-Bildern (statt der
 * bisherigen CSS-eingefärbten Farmer-Figur) — jede Farbe/Musterung ist jetzt
 * ein eigenes Bild unter wardrobe/farmer/, kein `farbe`-Hex-Wert mehr nötig.
 * "normal" (die Standard-Katze im Farmer-Look) ersetzt das alte "farmer" als
 * STANDARD_SKIN.
 */
const FARMER_FARBEN = [
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
 * Kostüme der Katze. Freischaltung über das Level aus dem Fähigkeitsbaum —
 * dasselbe Level, dieselbe Erfahrung. Die Stufen sind so gelegt, dass bis kurz
 * vor MAX_LEVEL (50, siehe core/skills.js) immer wieder etwas dazukommt und
 * der Weg zum Höchstlevel ein sichtbares Ziel hat.
 *
 * Ersetzt die früheren "Geister" (Fantasy-Geister-Themen) UND die alten,
 * levelfreien "Outfits" (Zauberer/König/Ente) — Feedback 30.08.: die neue
 * Lieferung sind zehn durchgängig als Katze gezeichnete Kostüme, keine
 * Geister mehr. Eine Sonderform ohne Level ("Outfits", ab:1) gibt es bewusst
 * nicht mehr — jedes Kostüm hier ist ein echtes Ziel.
 */
const KOSTUEME = [
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

const FARMER_PFAD = (id) => `${BASIS}/farmer/${id}.png`;
const SKIN_PFAD = (id) => `${BASIS}/${id}.png`;

/** Alle Skins mit Pfad und Mindestlevel — eine flache Liste für die Prüfung. */
const ALLE_SKINS = [
    ...FARMER_FARBEN.map((f) => ({ ...f, skin: FARMER_PFAD(f.id), ab: 1, gruppe: "farbe" })),
    ...KOSTUEME.map((k) => ({ ...k, skin: SKIN_PFAD(k.id), gruppe: "kostuem" })),
];

const NACH_PFAD = new Map(ALLE_SKINS.map((s) => [s.skin, s]));

const STANDARD_SKIN = FARMER_PFAD("normal");

/**
 * Alte/retirierte Pfade auf einen gültigen Skin ziehen.
 *
 * Der Hauptskin lag bis v3.6 direkt unter wardrobe/farmer.png, dann bis
 * Feedback 30.08. unter wardrobe/farmer/farmer.png (Farmer-Ghost) — jeder
 * gespeicherte Spielstand kann noch auf einen dieser alten Orte zeigen.
 * Genauso jeder andere inzwischen gestrichene Skin (alte Farben, alte
 * Geister, die alten Outfits/Person-Skins): der generische NACH_PFAD-Check
 * unten fängt JEDEN unbekannten Pfad ab und fällt auf STANDARD_SKIN zurück —
 * ohne ihn liefe die Figur bei Bestandsspielern mit so einem Pfad ins Leere
 * (404, siehe _drawImageOrEmojiContain im Frontend: zeigt dann nur noch das
 * 🌱-Notbild, gemeldet 30.08.).
 */
function normalisiereSkin(pfad) {
    if (typeof pfad !== "string" || !pfad) return STANDARD_SKIN;
    if (pfad === `${BASIS}/farmer.png`) return STANDARD_SKIN;
    if (!NACH_PFAD.has(pfad)) return STANDARD_SKIN;
    return pfad;
}

/**
 * Darf dieser Spieler diesen Skin tragen? Unbekannte Pfade (auch retirierte —
 * altes Outfit, alter Geist, alte personengebundene Skin) gelten als nein und
 * fallen beim Aufrufer (world/lobby.js) auf STANDARD_SKIN zurück.
 *
 * `twitchId` wird durchgereicht, auch wenn aktuell kein Eintrag mehr
 * `nurTwitchId` setzt (die alten PERSONEN_SKINS sind Feedback 30.08. entfallen)
 * — die Prüfung bleibt bewusst stehen, falls ein künftiger Skin wieder an
 * einer Person hängen soll.
 */
function istFreigeschaltet(pfad, level, twitchId = null) {
    const eintrag = NACH_PFAD.get(normalisiereSkin(pfad));
    if (!eintrag) return false;
    if (eintrag.nurTwitchId && String(twitchId || "") !== eintrag.nurTwitchId) return false;
    return (Number(level) || 1) >= eintrag.ab;
}

module.exports = {
    BASIS, FARMER_FARBEN, KOSTUEME, ALLE_SKINS,
    STANDARD_SKIN, normalisiereSkin, istFreigeschaltet,
    ADMIN_TWITCH_ID, istAdminId,
};
