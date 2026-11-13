// garden/core/wetterVerlauf.js
// Welches Wetter war wann — damit der Server gemeldete Wetter-Effekte prüfen kann.
//
// WARUM
// Wetter-Effekte (Nass ×1,25, Gefroren ×1,5, Geladen ×2, Mondlicht ×3) entstehen im
// Browser im Minutentakt und kommen mit dem Speichern an den Server. Bis November
// 2026 prüfte der Server nur, OB ein Effektname gültig ist — nicht, ob es dieses
// Wetter überhaupt gab. Ein Browser konnte jeder Pflanze alle vier anheften:
// ×11,25 auf jeden Verkauf.
//
// Das Wetter selbst ist aber kein Geheimnis: es folgt aus dem Schlüssel der
// Samenladen-Rotation (rollWeatherFromRotation im Browser) oder aus einer
// Admin-Übersteuerung. Beides merkt sich der Server hier für zwei Stunden; ein
// NEUER Effekt an einer Pflanze wird nur angenommen, wenn das passende Wetter
// seit dem letzten Speichern irgendwann lief.

/** Spiegel von WEATHER_BY_ROLL in Frontend engine/gameConstants.jsx. */
const WETTER_NACH_WURF = [
    { max: 0.7, typ: "sun" },
    { max: 0.775, typ: "rain" },
    { max: 0.85, typ: "snow" },
    { max: 0.925, typ: "thunder" },
    { max: 1, typ: "moonlight" },
];

/** Wetter → Effekt an der Pflanze. Spiegel der Zuordnung im GameContainer. */
const EFFEKT_FUER_WETTER = { rain: "wet", snow: "frozen", thunder: "charged", moonlight: "moonlit" };

/** Haltbarkeit eines Effekts an reifer Ware. Spiegel von EFFEKT_HALTBAR_MS (PlantSystem.js). */
const EFFEKT_HALTBAR_MS = 4 * 60 * 1000;

const VERLAUF_MS = 2 * 60 * 60 * 1000;

/**
 * Spiegel von hashToUnit im Browser — NICHT unitAusText aus core/tageszeit.js,
 * das mischt zusätzlich und käme auf ein anderes Wetter.
 */
function hashToUnit(seed) {
    const s = String(seed || "0");
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return (h >>> 0) / 4294967295;
}

function wetterAusRotation(rotationKey) {
    const u = hashToUnit(`weather:${rotationKey}`);
    return (WETTER_NACH_WURF.find((w) => u <= w.max) || WETTER_NACH_WURF[0]).typ;
}

// Abschnitte: { typ, ab, bis } — bis === null heisst „läuft noch".
const abschnitte = [];

function aufraeumen(now) {
    while (abschnitte.length && abschnitte[0].bis !== null && abschnitte[0].bis < now - VERLAUF_MS) abschnitte.shift();
}

/** Eine neue Laden-Rotation hat begonnen. */
function merkeRotation(rotationKey, now = Date.now()) {
    for (const a of abschnitte) if (a.bis === null && a.quelle === "rotation") a.bis = now;
    abschnitte.push({ typ: wetterAusRotation(rotationKey), ab: now, bis: null, quelle: "rotation" });
    aufraeumen(now);
}

/** Eine Admin-Übersteuerung läuft (wird im Sekundentakt gemeldet). */
function merkeUebersteuerung(typ, bis, now = Date.now()) {
    if (!typ || !EFFEKT_FUER_WETTER[typ]) return;
    const letzte = abschnitte.filter((a) => a.quelle === "admin").pop();
    if (letzte && letzte.typ === typ && letzte.bis >= now - 2000) { letzte.bis = Math.max(letzte.bis, Number(bis) || now); return; }
    abschnitte.push({ typ, ab: now, bis: Math.max(now, Number(bis) || now), quelle: "admin" });
    aufraeumen(now);
}

/** Das Wetter, das gerade läuft (06.11., fürs Angeln) — Admin vor Rotation, sonst Sonne. */
function wetterJetzt(now = Date.now()) {
    for (let i = abschnitte.length - 1; i >= 0; i--) {
        const x = abschnitte[i];
        if (x.quelle === "admin" && x.ab <= now && x.bis >= now) return x.typ;
    }
    for (let i = abschnitte.length - 1; i >= 0; i--) {
        const x = abschnitte[i];
        if (x.quelle === "rotation" && x.ab <= now && (x.bis === null || x.bis >= now)) return x.typ;
    }
    return "sun";
}

/** Alle Effekte, deren Wetter irgendwann in [von, bis] lief. */
function erlaubteEffekte(von, bis = Date.now()) {
    const out = new Set();
    for (const a of abschnitte) {
        const ende = a.bis === null ? Infinity : a.bis;
        if (a.ab <= bis && ende >= von && EFFEKT_FUER_WETTER[a.typ]) out.add(EFFEKT_FUER_WETTER[a.typ]);
    }
    return out;
}

/**
 * Effekte eines Trägers (Pflanze oder Fruchtstand) nach dem Speichern.
 * Behalten wird, was der Server schon kannte; neu dazu nur, was `erlaubt` enthält.
 * Weglassen darf der Browser immer (Effekt abgelaufen). Die Uhr darf höchstens
 * eine Haltbarkeit in die Zukunft reichen — sonst liefe ein Effekt nie ab.
 */
function pruefeEffekte(vorher, sauber, erlaubt, now = Date.now(), reif = false) {
    const alt = new Set(Array.isArray(vorher?.statusEffects) ? vorher.statusEffects : []);
    if (vorher?.statusEffect) alt.add(vorher.statusEffect);
    const liste = sauber.statusEffects.filter((e) => alt.has(e) || erlaubt.has(e));
    if (liste.length === 0) return { statusEffects: [], statusEffect: null, statusEffectUntil: null };
    const einzeln = sauber.statusEffect && liste.includes(sauber.statusEffect) ? sauber.statusEffect : liste[liste.length - 1];
    // Die Uhr läuft nur an reifer Ware (wie im Browser, wetterEffektSchritt).
    if (!reif) return { statusEffects: liste, statusEffect: einzeln, statusEffectUntil: null };
    // Neu stellen darf der Browser sie nur, wenn gerade ein Effekt dazukam; sonst
    // gilt die Server-Uhr. Ohne Uhr an reifer Ware startet der Server sie selbst —
    // sonst liesse sich ein Effekt durch Weglassen der Uhr für immer halten.
    const decke = now + EFFEKT_HALTBAR_MS + 60 * 1000;
    const altBis = Number(vorher?.statusEffectUntil) || 0;
    const neuBis = Number(sauber.statusEffectUntil) || 0;
    const neuerEffekt = liste.some((e) => !alt.has(e));
    let bis;
    if (neuerEffekt) bis = Math.min(neuBis || now + EFFEKT_HALTBAR_MS, decke);
    else if (altBis > 0) bis = neuBis > 0 ? Math.min(neuBis, altBis) : altBis;
    else bis = Math.min(neuBis || now + EFFEKT_HALTBAR_MS, decke);
    return { statusEffects: liste, statusEffect: einzeln, statusEffectUntil: bis };
}

/**
 * Effekte, die beim Ernten tatsächlich zählen: an reifer Ware mit abgelaufener Uhr
 * keine mehr. Bisher räumte das nur der Browser ab — schickte er die Uhr nicht
 * mit, blieben die Effekte für immer.
 */
function gueltigeEffekte(traeger, now = Date.now()) {
    const bis = Number(traeger?.statusEffectUntil || 0);
    return bis > 0 && bis <= now ? [] : null;
}

module.exports = {
    EFFEKT_FUER_WETTER, EFFEKT_HALTBAR_MS, VERLAUF_MS,
    wetterAusRotation, wetterJetzt, merkeRotation, merkeUebersteuerung, erlaubteEffekte, pruefeEffekte, gueltigeEffekte,
    _abschnitte: abschnitte,
};
