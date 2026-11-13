// garden/core/angeln.js
// Angeln am Dorfteich (06.11.2026): Auswerfen, Anbiss, Fisch mit den Rhythmus-Ringen einholen.
// 11.11.: Der Drill (Balken halten) ist durch Rhythmus-Ringe ersetzt — um den Schwimmer ziehen
// sich Ringe zusammen, gedrückt wird, wenn der Ring ihn berührt. Wie viele Ringe, wie schnell
// und ob Pfeiltasten gefragt sind, steht in RINGE und geht mit der Antwort an den Browser.
// Die Phase heißt im Spielstand weiter "drill" (laufende Würfe überstehen das Update).
// Spiegel im Browser: Frontend ui/fenster/AngelFenster.jsx (Anzeige + Drill) und
// ui/fische.js (Namen/Bilder/Bedingungen) — gerechnet und gewürfelt wird NUR hier.
//
// Ablauf
//   werfen(state, {koeder})  → braucht eine Angel (Werkzeugladen). Ein Köder wird sofort
//                              verbraucht. state.angeln = { id, biss, bis } — der Browser
//                              erfährt nur, wann es beißt (bissIn).
//   ziehen(state, id)        → Anbiss (der Browser meldet ihn selbst, sobald es beißt). Zu
//                              früh/zu spät: Fisch weg. Im Fenster: der Fisch wird gewürfelt
//                              und hängt am Haken (phase "drill"); der Browser bekommt
//                              Seltenheit und die Ringe (RINGE), nicht die Art.
//   einholen(state, id, ok)  → Ergebnis der Ringe. Wer schneller „gewonnen" meldet, als die
//                              Ringe überhaupt dauern können, fängt nichts.
//   verkaufen / fuettern     → wie gehabt.
//
// Welche Fische beißen, hängt von Tageszeit, Jahreszeit (core/tageszeit.js saisonStand)
// und Wetter (core/wetterVerlauf.js wetterJetzt) ab — und vom Köder.
//
// Gehört allein dem Server: state.angeln, state.fische, state.fischbuch, state.tierFutter
// (der Speicher-PUT übernimmt sie aus dem alten Stand, siehe routes/gardenGameRoutes.js).

const crypto = require("crypto");
const { SEED_CATALOGUE } = require("./catalogue");
const { gibXp } = require("./skills");
const { findePet, petId, sattBisVon } = require("./pets");
const { werkzeugVon } = require("./werkzeug");

/**
 * Die Fische. `wert` × FISCH_WERT_FAKTOR × Stundenertrag deines Ackers ist der Preis
 * (so wächst der Fang mit dem Spielfortschritt mit), `mindest` die Untergrenze in Gold. `zeit`: wann er
 * beißt („tag", „nacht" oder „immer"); `saison`: nur in dieser Jahreszeit; `wetter`: nur
 * bei diesem Wetter. `chance` = Gewicht beim Würfeln. Muss zu ui/fische.js passen.
 */
const FISCHE = [
    { id: "stichling",   rarity: "COMMON",    chance: 30, wert: 0.4, mindest: 2,      cm: [4, 9],    zeit: "immer" },
    { id: "rotauge",     rarity: "COMMON",    chance: 24, wert: 0.5, mindest: 2,      cm: [10, 30],  zeit: "immer" },
    { id: "barsch",      rarity: "UNCOMMON",  chance: 16, wert: 1,   mindest: 8,     cm: [12, 45],  zeit: "tag" },
    { id: "schleie",     rarity: "UNCOMMON",  chance: 12, wert: 1.1, mindest: 10,     cm: [20, 60],  zeit: "immer" },
    { id: "forelle",     rarity: "RARE",      chance: 8,  wert: 2.5, mindest: 50,    cm: [25, 70],  zeit: "tag" },
    { id: "aal",         rarity: "RARE",      chance: 7,  wert: 3,   mindest: 60,    cm: [40, 120], zeit: "nacht" },
    { id: "karpfen",     rarity: "EPIC",      chance: 4,  wert: 6,   mindest: 300,   cm: [40, 100], zeit: "immer" },
    { id: "wels",        rarity: "EPIC",      chance: 2.5,wert: 8,   mindest: 500,   cm: [80, 220], zeit: "nacht" },
    { id: "goldfisch",   rarity: "LEGENDARY", chance: 1,  wert: 30,  mindest: 2400,  cm: [8, 20],   zeit: "tag" },
    { id: "mondkoi",     rarity: "LEGENDARY", chance: 0.8,wert: 35,  mindest: 3000,  cm: [40, 90],  zeit: "nacht" },
    { id: "teichdrache", rarity: "MYTHIC",    chance: 0.2,wert: 150,  mindest: 16000, cm: [150, 400],zeit: "immer" },
    // Jahreszeiten
    { id: "maifisch",    rarity: "UNCOMMON",  chance: 10, wert: 1.2, mindest: 12,     cm: [25, 60],  zeit: "immer", saison: "fruehling" },
    { id: "kirschkoi",   rarity: "LEGENDARY", chance: 0.8,wert: 34,  mindest: 2800,  cm: [30, 70],  zeit: "tag",   saison: "fruehling" },
    { id: "sonnenbarsch",rarity: "UNCOMMON",  chance: 10, wert: 1.1, mindest: 10,     cm: [8, 25],   zeit: "tag",   saison: "sommer" },
    { id: "hecht",       rarity: "EPIC",      chance: 3,  wert: 7,   mindest: 400,   cm: [50, 140], zeit: "tag",   saison: "sommer" },
    { id: "zander",      rarity: "RARE",      chance: 7,  wert: 2.8, mindest: 56,    cm: [40, 100], zeit: "immer", saison: "herbst" },
    { id: "laternenfisch",rarity: "LEGENDARY",chance: 0.8,wert: 36,  mindest: 3200,  cm: [15, 40],  zeit: "nacht", saison: "herbst" },
    { id: "quappe",      rarity: "RARE",      chance: 7,  wert: 3,   mindest: 60,    cm: [30, 80],  zeit: "nacht", saison: "winter" },
    { id: "eisfisch",    rarity: "LEGENDARY", chance: 0.7,wert: 38,  mindest: 3400,  cm: [20, 50],  zeit: "immer", saison: "winter" },
    // Wetter
    { id: "regenbogenforelle", rarity: "RARE", chance: 9, wert: 3.2, mindest: 70,    cm: [25, 70],  zeit: "immer", wetter: "rain" },
    { id: "frostgruendling",   rarity: "RARE", chance: 9, wert: 3,   mindest: 64,    cm: [8, 18],   zeit: "immer", wetter: "snow" },
    { id: "blitzaal",    rarity: "EPIC",      chance: 4,  wert: 9,   mindest: 600,   cm: [60, 160], zeit: "immer", wetter: "thunder" },
    { id: "mondbarbe",   rarity: "EPIC",      chance: 4,  wert: 9,   mindest: 600,   cm: [30, 80],  zeit: "immer", wetter: "moonlight" },
    // Kein Fisch — kommt trotzdem an den Haken. Für Futter taugt er nicht.
    { id: "stiefel",     rarity: "COMMON",    chance: 6,  wert: 0.05,mindest: 1,       cm: [28, 32],  zeit: "immer", kram: true },
];
const NACH_ID = new Map(FISCHE.map((f) => [f.id, f]));

/**
 * Köder (Werkzeugladen, werden beim Auswerfen verbraucht). Ohne Köder kein Wurf
 * (06.11., Wunsch: „nur angeln wenn man Köder hat, Würmer das schlechteste“).
 * `feld` ist der Zähler im Werkzeugkasten (core/werkzeug.js), `bissFaktor` verkürzt
 * die Wartezeit, `gewicht` verschiebt die Chancen je Seltenheit. Der Wurm ist die
 * Grundstufe (keine Verschiebung). Muss zu ui/fische.js KOEDER passen.
 */
const KOEDER = {
    wurm:   { feld: "koederWurm",   bissFaktor: 1,    gewicht: { COMMON: 1, UNCOMMON: 1, RARE: 1, EPIC: 1, LEGENDARY: 1, MYTHIC: 1, kram: 1 } },
    teig:   { feld: "koederTeig",   bissFaktor: 0.8,  gewicht: { COMMON: 0.8, UNCOMMON: 1.3, RARE: 1.9, EPIC: 1.8, LEGENDARY: 1.2, MYTHIC: 1.2, kram: 0.4 } },
    leucht: { feld: "koederLeucht", bissFaktor: 0.65, gewicht: { COMMON: 0.6, UNCOMMON: 0.9, RARE: 1.2, EPIC: 2, LEGENDARY: 2.4, MYTHIC: 2.6, kram: 0.15 } },
};

/** Wie schwer der Fisch ist (0 … 1) — nur noch als Kennzahl für den Browser. */
const SCHWIERIGKEIT = { COMMON: 0.15, UNCOMMON: 0.3, RARE: 0.48, EPIC: 0.64, LEGENDARY: 0.8, MYTHIC: 0.95 };
/**
 * Rhythmus-Ringe je Seltenheit (11.11.): `anzahl` Treffer hintereinander, jeder Ring braucht
 * `dauerMs` bis zum Schwimmer, `fensterMs` darf man davor oder danach liegen. Ab `pfeile`
 * verlangt jeder Ring eine eigene Taste (Leertaste oder eine Pfeiltaste). `fehler` = so viele
 * Ringe darf man verpassen. Der Browser spielt genau das, was hier steht (ui/fenster/AngelFenster.jsx).
 */
const RINGE = {
    kram:      { anzahl: 1, dauerMs: 1200, fensterMs: 170, pfeile: false, fehler: 0 },
    COMMON:    { anzahl: 1, dauerMs: 1150, fensterMs: 160, pfeile: false, fehler: 0 },
    UNCOMMON:  { anzahl: 2, dauerMs: 1050, fensterMs: 150, pfeile: false, fehler: 0 },
    RARE:      { anzahl: 3, dauerMs: 950,  fensterMs: 140, pfeile: true,  fehler: 1 },
    EPIC:      { anzahl: 4, dauerMs: 850,  fensterMs: 130, pfeile: true,  fehler: 1 },
    LEGENDARY: { anzahl: 5, dauerMs: 750,  fensterMs: 120, pfeile: true,  fehler: 1 },
    MYTHIC:    { anzahl: 5, dauerMs: 650,  fensterMs: 110, pfeile: true,  fehler: 0 },
};
/** Die Profi-Angel macht das Zeitfenster größer (vorher: größerer Fangbalken im Drill). */
const PROFI_FENSTER_FAKTOR = 1.35;
/**
 * Kürzeste mögliche Dauer: alle Ringe ohne Pause, jeder so früh wie erlaubt getroffen —
 * wer schneller „geschafft" meldet, hat nicht gespielt. Mit Luft für Uhren und Netz.
 */
function ringeMinMs(r) {
    return Math.floor(r.anzahl * (r.dauerMs - r.fensterMs * PROFI_FENSTER_FAKTOR) * 0.8);
}
/** Für alte Aufrufer und Tests: die kürzeste Dauer überhaupt (ein gewöhnlicher Fisch). */
const DRILL_MIN_MS = ringeMinMs(RINGE.COMMON);
const DRILL_MAX_MS = 90 * 1000;

/**
 * Der Teichling (11.11.) — SPIEGEL von teichlingStand in Frontend engine/teichLeben.js.
 * Er taucht für alle zur selben Zeit auf (aus der Uhr gerechnet). Solange er zu sehen ist,
 * beißen seltene Fische öfter (TEICHLING_GLUECK) und kaum noch Kram.
 */
const TEICHLING_FENSTER_MS = 6 * 60 * 1000;
const TEICHLING_DAUER_MS = 34000;
const TEICHLING_CHANCE = { sun: 0.2, rain: 0.35, thunder: 0.8, moonlight: 0.55, snow: 0 };
const TEICHLING_GLUECK = { COMMON: 0.7, UNCOMMON: 1, RARE: 1.6, EPIC: 2.2, LEGENDARY: 3, MYTHIC: 4, kram: 0.2 };
function teichlingAktiv(now = Date.now(), wetter = null) {
    const { unitAusText } = require("./tageszeit");
    const nr = Math.floor(now / TEICHLING_FENSTER_MS);
    const w = wetter || wetterJetzt(now);
    const chance = TEICHLING_CHANCE[w] ?? TEICHLING_CHANCE.sun;
    if (unitAusText(`teichling:${nr}`) >= chance) return false;
    const start = nr * TEICHLING_FENSTER_MS + unitAusText(`teichlingstart:${nr}`) * (TEICHLING_FENSTER_MS - TEICHLING_DAUER_MS);
    return now >= start && now < start + TEICHLING_DAUER_MS;
}

const BISS_MIN_MS = 2500;
const BISS_MAX_MS = 9000;
/** So lange hängt der Fisch am Haken. Großzügig, weil die Netzrunde mitzählt. */
const FENSTER_MS = 1400;
const NETZ_SPIELRAUM_MS = 500;
const EIMER_MAX = 60;
/** So lange hält ein gewöhnlicher Fisch ein Tier satt; seltenere länger (SATT_FAKTOR). */
const SATT_MS = 3 * 60 * 60 * 1000;
/** Weiter im Voraus lässt sich nicht füttern. */
const SATT_MAX_MS = 24 * 60 * 60 * 1000;
/** Futterwert je Seltenheit: so viel länger hält ein besserer Fisch satt. */
const SATT_FAKTOR = { COMMON: 1, UNCOMMON: 1.25, RARE: 1.5, EPIC: 2, LEGENDARY: 3, MYTHIC: 4 };

const KATALOG = new Map(SEED_CATALOGUE.map((s) => [s.id, s]));

/**
 * Wirtschafts-Scan 06.11.: vorher war der Fischwert ein Vielfaches EINER Ernte — bei
 * ~350 Würfen je Stunde brachte Angeln mit Würmern ab Tag 7 grob das Hundertfache des
 * Ackers. Jetzt hängt er am STUNDENertrag des ganzen Ackers: mit Würmern ≈ 15 % davon
 * je Stunde Angeln, mit Leuchtködern ≈ ein Drittel (Rechnung: Scratch fischOekonomie.js).
 */
const FISCH_WERT_FAKTOR = 0.00025;

/** Gold je Stunde, das diese Pflanze im Mittel abwirft (Katalogwerte). */
function stundenErtrag(pflanze) {
    const p = KATALOG.get(pflanze?.seedId);
    if (!p) return 0;
    if (pflanze.singleUse === false) {
        const frucht = ((Number(p.fruitSellMin) || 0) + (Number(p.fruitSellMax) || 0)) / 2;
        const zyklusH = Math.max(1 / 60, (Number(p.fruitCycleSec) || 3600) / 3600);
        return (frucht * Math.max(1, Number(p.maxFruits) || 1)) / zyklusH;
    }
    const ernte = ((Number(p.sellMin) || 0) + (Number(p.sellMax) || 0)) / 2;
    const wachsH = Math.max(1 / 60, ((Number(p.growMinSec) || 600) + (Number(p.growMaxSec) || 600)) / 2 / 3600);
    return ernte / wachsH;
}

/** Was der ganze Acker je Stunde abwirft — Grundlage für den Fischwert. */
function ackerWert(state) {
    return Object.values(state.plotPlants || {}).reduce((s, p) => s + stundenErtrag(p), 0) * FISCH_WERT_FAKTOR;
}

// Dieselbe Spieluhr wie überall (core/tageszeit.js, Spiegel von engine/Tageszeit.js)
const istNachtJetzt = (now) => require("./tageszeit").istNacht(now);
const saisonJetzt = (now) => require("./tageszeit").saisonStand(now).id;
const wetterJetzt = (now) => require("./wetterVerlauf").wetterJetzt(now);

/** Beißt dieser Fisch unter diesen Bedingungen? */
function beisst(f, { nacht, saison, wetter }) {
    if (f.zeit !== "immer" && (f.zeit === "nacht") !== nacht) return false;
    if (f.saison && f.saison !== saison) return false;
    if (f.wetter && f.wetter !== wetter) return false;
    return true;
}

function wuerfleFisch(now, koederId = null, bedingungen = null, glueck = null) {
    const b = bedingungen || { nacht: istNachtJetzt(now), saison: saisonJetzt(now), wetter: wetterJetzt(now) };
    const k = KOEDER[koederId];
    const passend = FISCHE.filter((f) => beisst(f, b));
    const art = (f) => (f.kram ? "kram" : f.rarity);
    // `glueck`: zusätzliche Gewichte je Seltenheit (Teichling), kommt auf den Köder obendrauf
    const gewicht = (f) => f.chance * (k ? (k.gewicht[art(f)] || 1) : 1) * (glueck ? (glueck[art(f)] ?? 1) : 1);
    const summe = passend.reduce((s, f) => s + gewicht(f), 0);
    let r = Math.random() * summe;
    for (const f of passend) { r -= gewicht(f); if (r <= 0) return f; }
    return passend[0];
}

function werfen(state, opts = {}, now = Date.now()) {
    // Alte Aufrufe: werfen(state, now)
    if (typeof opts === "number") { now = opts; opts = {}; }
    const w = werkzeugVon(state);
    if (!w.hasAngel) return { ok: false, status: 403, error: "Du brauchst eine Angel — die gibt es im Werkzeugladen." };
    const koederId = opts?.koeder && KOEDER[opts.koeder] ? opts.koeder : null;
    if (!koederId) return { ok: false, status: 400, error: "Ohne Köder beißt nichts — Würmer gibt es im Werkzeugladen." };
    const feld = KOEDER[koederId].feld;
    if (w[feld] <= 0) return { ok: false, status: 409, error: "Von diesem Köder hast du keinen mehr." };
    w[feld] -= 1;
    state.toolInventory = w;
    const id = crypto.randomBytes(6).toString("hex");
    const faktor = KOEDER[koederId].bissFaktor;
    const bissIn = Math.round((BISS_MIN_MS + Math.floor(Math.random() * (BISS_MAX_MS - BISS_MIN_MS))) * faktor);
    state.angeln = { id, phase: "wartet", biss: now + bissIn, bis: now + bissIn + FENSTER_MS, koeder: koederId };
    return { ok: true, wurfId: id, bissIn, fensterMs: FENSTER_MS, koeder: koederId, toolInventory: w };
}

/** Anhieb: zu früh/zu spät ist der Fisch weg, sonst hängt er am Haken (Drill). */
function ziehen(state, id, now = Date.now()) {
    const a = state.angeln;
    if (!a || a.id !== String(id || "") || a.phase === "drill") {
        state.angeln = null;
        return { ok: false, status: 409, error: "Die Leine ist nicht ausgeworfen." };
    }
    state.angeln = null;
    if (now < a.biss - 150) return { ok: true, fang: null, grund: "zufrueh" };
    if (now > a.bis + NETZ_SPIELRAUM_MS) return { ok: true, fang: null, grund: "zuspaet" };
    if (!Array.isArray(state.fische)) state.fische = [];
    if (state.fische.length >= EIMER_MAX) return { ok: true, fang: null, grund: "eimervoll" };
    const teichling = teichlingAktiv(now);
    const fisch = wuerfleFisch(now, a.koeder, null, teichling ? TEICHLING_GLUECK : null);
    const schwierigkeit = fisch.kram ? 0.05 : SCHWIERIGKEIT[fisch.rarity] || 0.2;
    const profi = Boolean(werkzeugVon(state).hasProfiAngel);
    const basis = RINGE[fisch.kram ? "kram" : fisch.rarity] || RINGE.COMMON;
    const ringe = { ...basis, fensterMs: Math.round(basis.fensterMs * (profi ? PROFI_FENSTER_FAKTOR : 1)) };
    state.angeln = { id: a.id, phase: "drill", fischId: fisch.id, start: now, koeder: a.koeder || null };
    return {
        ok: true, fang: null, drill: true,
        rarity: fisch.kram ? "kram" : fisch.rarity, schwierigkeit, ringe, teichling,
        // Zufallszahl für die Tastenfolge und die Pausen im Browser
        muster: crypto.randomBytes(4).readUInt32LE(0),
    };
}

/** Ende des Drills: geschafft → Fisch in den Eimer, sonst ist er entwischt. */
function einholen(state, id, geschafft, now = Date.now()) {
    const a = state.angeln;
    state.angeln = null;
    if (!a || a.phase !== "drill" || a.id !== String(id || "")) return { ok: false, status: 409, error: "Gerade hängt nichts am Haken." };
    if (!geschafft) return { ok: true, fang: null, grund: "entwischt" };
    const dauer = now - Number(a.start || 0);
    const fisch = NACH_ID.get(a.fischId);
    if (!fisch) return { ok: true, fang: null, grund: "entwischt" };
    const minMs = ringeMinMs(RINGE[fisch.kram ? "kram" : fisch.rarity] || RINGE.COMMON);
    if (dauer < minMs || dauer > DRILL_MAX_MS) return { ok: true, fang: null, grund: "entwischt" };
    if (!Array.isArray(state.fische)) state.fische = [];
    if (state.fische.length >= EIMER_MAX) return { ok: true, fang: null, grund: "eimervoll" };
    const anteil = Math.pow(Math.random(), 1.6);
    const cm = Math.round((fisch.cm[0] + (fisch.cm[1] - fisch.cm[0]) * anteil) * 10) / 10;
    // Größere Exemplare bringen bis zu 50 % mehr
    const wert = Math.max(fisch.mindest, Math.floor(ackerWert(state) * fisch.wert * (1 + anteil * 0.5)));
    const stueck = { instanceId: crypto.randomBytes(8).toString("hex"), fischId: fisch.id, rarity: fisch.rarity, cm, wert, gefangen: now };
    state.fische.push(stueck);
    // Fischbuch: Anzahl und größtes Exemplar je Art
    if (!state.fischbuch || typeof state.fischbuch !== "object") state.fischbuch = {};
    const e = state.fischbuch[fisch.id] || { anzahl: 0, maxCm: 0 };
    state.fischbuch[fisch.id] = { anzahl: e.anzahl + 1, maxCm: Math.max(e.maxCm, cm) };
    const xp = fisch.kram ? { xp: 0, aufgestiegen: false } : gibXp(state, fisch.rarity);
    return { ok: true, fang: stueck, xp: xp.xp, aufgestiegen: xp.aufgestiegen, neu: e.anzahl === 0 };
}

function verkaufen(state, ids, gutschreiben) {
    const liste = Array.isArray(state.fische) ? state.fische : [];
    const alle = ids === "alle";
    const gesucht = new Set(Array.isArray(ids) ? ids.map(String) : []);
    const weg = liste.filter((f) => alle || gesucht.has(f.instanceId));
    if (weg.length === 0) return { ok: false, status: 409, error: "Kein Fisch zum Verkaufen." };
    state.fische = liste.filter((f) => !weg.includes(f));
    const gold = weg.reduce((s, f) => s + (Number(f.wert) || 0), 0);
    gutschreiben(state, gold);
    return { ok: true, verkauft: weg.length, gold };
}

function fuettern(state, id, fischId, now = Date.now()) {
    const treffer = findePet(state, id);
    if (!treffer) return { ok: false, status: 404, error: "Dieses Tier gibt es nicht." };
    const liste = Array.isArray(state.fische) ? state.fische : [];
    const fisch = liste.find((f) => f.instanceId === String(fischId || ""));
    if (!fisch) return { ok: false, status: 409, error: "Dieser Fisch ist nicht mehr im Eimer." };
    if (NACH_ID.get(fisch.fischId)?.kram) return { ok: false, status: 400, error: "Einen Stiefel frisst kein Tier." };
    state.fische = liste.filter((f) => f !== fisch);
    if (!state.tierFutter || typeof state.tierFutter !== "object") state.tierFutter = {};
    const key = petId(treffer.pet);
    // Satt ab jetzt bzw. verlängert — höchstens SATT_MAX_MS im Voraus
    const ab = Math.max(now, Number(state.tierFutter[key]) || 0);
    if (ab >= now + SATT_MAX_MS - 60 * 1000) return { ok: false, status: 409, error: "Das Tier ist schon pappsatt." };
    const dauer = SATT_MS * (SATT_FAKTOR[fisch.rarity] || 1);
    state.tierFutter[key] = Math.min(now + SATT_MAX_MS, ab + dauer);
    return { ok: true, sattBis: state.tierFutter[key], petId: key };
}

/**
 * Für die Antwort an den Browser: Sättigung JEDES eigenen Tiers (0 = verhungert).
 * Tiere ohne Eintrag bekommen dabei ihr Startfutter (core/pets.js sattBisVon).
 */
function tierFutterAnzeige(state, now = Date.now()) {
    const raus = {};
    for (const p of [...(state?.petPlacements || []), ...(state?.petInventory || [])]) {
        const key = petId(p);
        if (key) raus[key] = sattBisVon(state, p, now);
    }
    return raus;
}

/** Was gerade am Teich gilt — für die Anzeige im Fenster. */
function teichLage(now = Date.now()) {
    return { nacht: istNachtJetzt(now), saison: saisonJetzt(now), wetter: wetterJetzt(now) };
}

module.exports = {
    FISCHE, KOEDER, SCHWIERIGKEIT, werfen, ziehen, einholen, verkaufen, fuettern, tierFutterAnzeige, teichLage,
    wuerfleFisch, beisst, ackerWert, stundenErtrag, FISCH_WERT_FAKTOR, FENSTER_MS, EIMER_MAX, SATT_MS, SATT_MAX_MS, DRILL_MIN_MS, istNachtJetzt,
    RINGE, ringeMinMs, PROFI_FENSTER_FAKTOR, teichlingAktiv, TEICHLING_GLUECK, TEICHLING_FENSTER_MS, TEICHLING_DAUER_MS, TEICHLING_CHANCE,
};
