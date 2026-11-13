// ui/fische.js
// Fische vom Dorfteich (06.11.) — Namen, Texte und Pixelbilder für den Browser.
// Spiegel von Backend/garden/core/angeln.js FISCHE (gewürfelt und bezahlt wird dort);
// wer dort eine Art ergänzt, ergänzt sie HIER ebenfalls.

export const FISCH_INFO = {
    // form (07.11. erweitert): schwanz/ruecken/kopf geben jeder Art eine eigene Silhouette,
    // die übrigen Schlüssel sind Muster und Kleinigkeiten — siehe zeichneFisch unten.
    stichling:   { name: "Stichling",   rarity: "COMMON",    zeit: "immer", form: { lang: 12, hoch: 5, farben: ["#b8c8a0", "#8a9a70", "#5a6a48"], schwanz: "gerade", ruecken: "stachel", kehle: "#d8482a" } },
    rotauge:     { name: "Rotauge",     rarity: "COMMON",    zeit: "immer", form: { lang: 15, hoch: 7, farben: ["#e0e8f0", "#a8b8c8", "#6a7a8a"], schwanz: "gabel", ruecken: "klein", auge: "#e8403a", flosse: "#e8603a" } },
    barsch:      { name: "Barsch",      rarity: "UNCOMMON",  zeit: "tag",   form: { lang: 16, hoch: 8, farben: ["#c8d870", "#8aa040", "#4a6a28"], schwanz: "kerbe", ruecken: "doppelt", streifen: "#3a4a20", flosse: "#e8603a" } },
    schleie:     { name: "Schleie",     rarity: "UNCOMMON",  zeit: "immer", form: { lang: 17, hoch: 7, farben: ["#a8b85a", "#6a8a3a", "#3a5a22"], schwanz: "rund", ruecken: "rund", auge: "#e8403a", bart: "kurz", flosse: "#4a6a2a" } },
    forelle:     { name: "Forelle",     rarity: "RARE",      zeit: "tag",   form: { lang: 18, hoch: 6, farben: ["#e8d8c8", "#a8a898", "#6a7a6a"], schwanz: "kerbe", ruecken: "klein", fett: true, punkte: "#c83a5a", band: "#e88aa8" } },
    aal:         { name: "Aal",         rarity: "RARE",      zeit: "nacht", form: { lang: 22, hoch: 4, farben: ["#7a7a5a", "#4a4a32", "#2a2a1a"], aal: true, schwanz: "saum", ruecken: "keine" } },
    karpfen:     { name: "Karpfen",     rarity: "EPIC",      zeit: "immer", form: { lang: 18, hoch: 9, farben: ["#f0c870", "#c89040", "#8a5a20"], schwanz: "gabel", ruecken: "lang", schuppen: "#a87028", bart: "vier", flosse: "#b8783a" } },
    wels:        { name: "Wels",        rarity: "EPIC",      zeit: "nacht", form: { lang: 22, hoch: 7, farben: ["#6a7a8a", "#4a5a6a", "#2a3440"], schwanz: "rund", ruecken: "klein", kopf: "breit", bart: "lang", flecken: "#3a4652" } },
    goldfisch:   { name: "Goldfisch",   rarity: "LEGENDARY", zeit: "tag",   form: { lang: 12, hoch: 8, farben: ["#ffd84a", "#f29a2a", "#c8601a"], schwanz: "doppel", ruecken: "segel", kopf: "tief", flosse: "#ffb84a" } },
    mondkoi:     { name: "Mondkoi",     rarity: "LEGENDARY", zeit: "nacht", form: { lang: 18, hoch: 8, farben: ["#ffffff", "#e8e4f4", "#a8a0c8"], schwanz: "faecher", ruecken: "lang", flecken: "#e8403a", leuchten: "#d8c8ff", bart: "kurz" } },
    teichdrache: { name: "Teichdrache", rarity: "MYTHIC",    zeit: "immer", form: { lang: 22, hoch: 7, farben: ["#7fe0c8", "#2fa890", "#1a6858"], drache: true, schwanz: "flamme", ruecken: "keine", bart: "lang", schuppen: "#5fc8b0" } },
    // Jahreszeiten (06.11.)
    maifisch:     { name: "Maifisch",     rarity: "UNCOMMON",  zeit: "immer", saison: "fruehling", form: { lang: 16, hoch: 7, farben: ["#e8f0f4", "#b8c8d8", "#7a8aa0"], schwanz: "mond", ruecken: "klein", punktreihe: "#3a4a5a" } },
    kirschkoi:    { name: "Kirschblüten-Koi", rarity: "LEGENDARY", zeit: "tag", saison: "fruehling", form: { lang: 18, hoch: 8, farben: ["#fff4f8", "#f8c8dc", "#e88aaa"], schwanz: "schleier", ruecken: "segel", flecken: "#e85a8a", flosse: "#f8b0cc" } },
    sonnenbarsch: { name: "Sonnenbarsch", rarity: "UNCOMMON",  zeit: "tag",   saison: "sommer", form: { lang: 12, hoch: 9, farben: ["#ffe27a", "#f2a83a", "#5a8a6a"], schwanz: "gerade", ruecken: "doppelt", kopf: "tief", wellen: "#3a8ac8", ohrfleck: "#e8403a", flosse: "#f2803a" } },
    hecht:        { name: "Hecht",        rarity: "EPIC",      zeit: "tag",   saison: "sommer", form: { lang: 22, hoch: 5, farben: ["#d8e0a0", "#7a9a4a", "#3a5a2a"], schwanz: "gabel", ruecken: "hinten", kopf: "schnabel", punkte: "#e8e8b0", zaehne: true } },
    zander:       { name: "Zander",       rarity: "RARE",      zeit: "immer", saison: "herbst", form: { lang: 19, hoch: 6, farben: ["#d8d8c8", "#8a9a88", "#4a5a4a"], schwanz: "sichel", ruecken: "stachel", streifen: "#3a4a3a", auge: "#e8f0e0", kopf: "spitz" } },
    laternenfisch:{ name: "Laternenfisch",rarity: "LEGENDARY", zeit: "nacht", saison: "herbst", form: { lang: 14, hoch: 8, farben: ["#5a4a7a", "#3a2a5a", "#1a1430"], schwanz: "rund", ruecken: "keine", kopf: "tief", laterne: "#ffd84a", zaehne: true, grossesAuge: true } },
    quappe:       { name: "Quappe",       rarity: "RARE",      zeit: "nacht", saison: "winter", form: { lang: 20, hoch: 5, farben: ["#a89a6a", "#6a5a3a", "#3a3020"], schwanz: "spitz", ruecken: "lang", marmor: "#2a2418", bart: "kinn", kopf: "breit" } },
    eisfisch:     { name: "Eisfisch",     rarity: "LEGENDARY", zeit: "immer", saison: "winter", form: { lang: 16, hoch: 7, farben: ["#f4fcff", "#bfe6f6", "#6ab0d8"], schwanz: "mond", ruecken: "segel", band: "#ffffff", leuchten: "#dff6ff", flosse: "#9ad4ee", kopf: "spitz" } },
    // Wetter (06.11.)
    regenbogenforelle: { name: "Regenbogenforelle", rarity: "RARE", zeit: "immer", wetter: "rain", form: { lang: 18, hoch: 6, farben: ["#f0e8f0", "#a8b8a8", "#6a7a6a"], schwanz: "faecher", ruecken: "rund", fett: true, band: "#e86a9a", punkte: "#4a5a4a" } },
    frostgruendling:   { name: "Frostgründling", rarity: "RARE", zeit: "immer", wetter: "snow", form: { lang: 12, hoch: 5, farben: ["#f4f8ff", "#c8d8f0", "#8aa0c8"], schwanz: "gabel", ruecken: "segel", punktreihe: "#6a80a8", bart: "kurz", leuchten: "#ffffff" } },
    blitzaal:     { name: "Blitzaal",     rarity: "EPIC",      zeit: "immer", wetter: "thunder", form: { lang: 22, hoch: 4, farben: ["#fff4a0", "#e8c83a", "#7a6a1a"], aal: true, schwanz: "spitz", ruecken: "keine", blitz: "#ffffff" } },
    mondbarbe:    { name: "Mondbarbe",    rarity: "EPIC",      zeit: "immer", wetter: "moonlight", form: { lang: 17, hoch: 7, farben: ["#e8e8ff", "#a8a8e0", "#5a5aa8"], schwanz: "sichel", ruecken: "segel", bart: "vier", leuchten: "#c8c8ff", schuppen: "#c8c8f4" } },
    stiefel:     { name: "Alter Stiefel", rarity: "COMMON",  zeit: "immer", kram: true },
};

/** Köder aus dem Werkzeugladen — Spiegel von KOEDER in Backend core/angeln.js. */
export const KOEDER = [
    { id: "wurm",   name: "Wurm",       feld: "koederWurm",   text: "Einfacher Köder" },
    { id: "teig",   name: "Teigkugel",  feld: "koederTeig",   text: "Seltene Fische öfter, beißt schneller" },
    { id: "leucht", name: "Leuchtköder",feld: "koederLeucht", text: "Epische und legendäre Fische öfter, beißt am schnellsten" },
];

export const SAISON_NAME = { fruehling: "im Frühling", sommer: "im Sommer", herbst: "im Herbst", winter: "im Winter" };
export const WETTER_NAME = { rain: "bei Regen", snow: "bei Schnee", thunder: "bei Gewitter", moonlight: "bei Mondlicht", sun: "bei Sonne" };

/** Wann diese Art beißt, als kurzer Satz fürs Fischbuch. */
export function bedingungText(id) {
    const i = FISCH_INFO[id];
    if (!i) return "";
    const teile = [];
    if (i.wetter) teile.push(WETTER_NAME[i.wetter]);
    if (i.saison) teile.push(SAISON_NAME[i.saison]);
    if (i.zeit === "tag") teile.push("tagsüber");
    if (i.zeit === "nacht") teile.push("nachts");
    return teile.length ? `beißt ${teile.join(", ")}` : "beißt immer";
}

/** Beißt diese Art gerade? (nur Anzeige — gewürfelt wird auf dem Server) */
export function beisstJetzt(id, { nacht, saison, wetter }) {
    const i = FISCH_INFO[id];
    if (!i) return false;
    if (i.zeit !== "immer" && (i.zeit === "nacht") !== nacht) return false;
    if (i.saison && i.saison !== saison) return false;
    if (i.wetter && i.wetter !== wetter) return false;
    return true;
}

const RANG = { COMMON: 0, UNCOMMON: 1, RARE: 2, EPIC: 3, LEGENDARY: 4, MYTHIC: 5 };
/** Nach Seltenheit sortiert (Fischbuch), der Stiefel ganz ans Ende. */
export const FISCH_IDS = Object.keys(FISCH_INFO).sort((a, b) => {
    const A = FISCH_INFO[a], B = FISCH_INFO[b];
    if (Boolean(A.kram) !== Boolean(B.kram)) return A.kram ? 1 : -1;
    return (RANG[A.rarity] ?? 0) - (RANG[B.rarity] ?? 0);
});
export const ZEIT_TEXT = { tag: "beißt am Tag", nacht: "beißt nachts", immer: "beißt immer" };
export const fischName = (id) => FISCH_INFO[id]?.name || id;

const UMRISS = "#2b1d12";
// 07.11.: größere Fläche (vorher 26 × 16), damit Schwanz, Flossen und Kopf je Art
// eigene Formen bekommen — vorher hatten fast alle denselben Dreiecksschwanz.
const B = 36, Hh = 20;
const cache = new Map();

/** Spalten links vom Körper, die der Schwanz je Form braucht. */
const SCHWANZ_LAENGE = { gabel: 5, kerbe: 4, gerade: 3, rund: 4, faecher: 6, schleier: 9, doppel: 7, saum: 2, flamme: 8, mond: 5, sichel: 6, spitz: 4 };

/** Halbe Körperhöhe an Stelle u (0 = Schwanzstiel, 1 = Maul) als Anteil von hoch/2. */
function profil(u, kopf, aal) {
    if (aal) return u < 0.1 ? 0.5 + u * 5 : u > 0.9 ? 1 - (u - 0.9) * 4 : 1;
    const gipfel = kopf === "tief" ? 0.5 : kopf === "schnabel" ? 0.45 : 0.6;
    const stiel = kopf === "tief" ? 0.28 : 0.35;
    if (u < gipfel) return stiel + (1 - stiel) * Math.sin((Math.PI / 2) * (u / gipfel));
    const v = (u - gipfel) / (1 - gipfel);
    if (kopf === "schnabel") return Math.max(0.25, 1 - v * 0.8);
    if (kopf === "breit") return Math.max(0.6, Math.cos((Math.PI / 2) * v * 0.8));
    if (kopf === "spitz") return Math.max(0.3, 1 - v * v * 0.75);
    return Math.max(0.35, Math.pow(Math.cos((Math.PI / 2) * v * 0.92), 0.55));
}

/**
 * Schwanz je Form: für jede Spalte k (0 = am Körper) die gefüllten Zeilenbereiche
 * relativ zur Mitte, als [von, bis] (negativ = oben). `b` = halbe Höhe des Stiels.
 */
function schwanzSpalte(form, k, L, b) {
    const r = Math.round;
    switch (form) {
        case "gabel": { const top = b + r(k * 0.9); const lu = r((k - 1) * 0.7); return k < 2 ? [[-top, top]] : [[-top, -lu], [lu, top]]; }
        case "kerbe": { const top = b + r(k * 0.6); return k === L - 1 ? [[-top, -1], [1, top]] : [[-top, top]]; }
        case "gerade": { const top = b + r(k * 0.7); return [[-top, top]]; }
        case "rund": { const top = b + r(2 * Math.sin(Math.PI * (k + 1) / (L + 1)) + k * 0.3); return [[-top, top]]; }
        case "faecher": { const top = b + r(k * 0.85); return [[-top, top]]; }
        case "mond": { const top = b + r(k * 1.1); return k < 2 ? [[-top, top]] : [[-top, -top + 2], [top - 2, top]]; }
        case "sichel": { // Gabel mit langem oberem und kurzem unterem Lappen
            const o = b + r(k * 1.0), u = b + r(k * 0.45), lu = r((k - 1) * 0.6);
            return k < 2 ? [[-o, u]] : [[-o, -lu], [lu, u]];
        }
        case "spitz": { const top = Math.max(0, b - r(k * 0.5)); return [[-top, top]]; }
        case "saum": { const top = Math.max(0, b - k); return [[-top, top]]; }
        case "schleier": { // weiter, wehender Schleier, hinten leicht geteilt
            const w = r(Math.sin(k * 0.7) * 1.2);
            const halb = b + r(k * 0.45), lu = k >= 4 ? r((k - 3) * 0.6) : 0;
            return lu > 0 ? [[w - halb, w - lu], [w + lu, w + halb]] : [[w - halb, w + halb]];
        }
        case "flamme": { // eine züngelnde Flamme, wird nach hinten schmal
            const w = r(Math.sin(k * 0.9) * 1.6);
            const halb = Math.max(0, b + 1 - r(k * 0.35));
            return [[w - halb, w + halb]];
        }
        case "doppel": {
            const o = -2 - r(k * 0.4), dick = 1 + r(k * 0.3);
            return [[o - dick, o + dick], [-o - dick, -o + dick]];
        }
        default: return [[-b, b]];
    }
}

function zeichneFisch(g, info) {
    const p = (c, x, y, w = 1, h = 1) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
    if (info.kram) {
        p("#6e4426", 9, 4, 8, 10); p("#8a5a32", 10, 4, 3, 9); p("#6e4426", 9, 13, 17, 4); p("#8a5a32", 10, 13, 15, 2);
        p("#3b2516", 9, 16, 17, 1); p("#c9b48a", 11, 6, 4, 1); p("#c9b48a", 11, 8, 4, 1); p("#c9b48a", 11, 10, 4, 1);
        p("#3a6ab0", 22, 12, 2, 1); p("#3a6ab0", 24, 11, 1, 1);
        return;
    }
    const f = info.form;
    const [hell, mittel, dunkel] = f.farben;
    const flosse = f.flosse || mittel;
    const aal = Boolean(f.aal || f.drache);
    const L = SCHWANZ_LAENGE[f.schwanz] ?? 4;
    const x0 = Math.round((B - f.lang - L) / 2) + L;
    const cy = Math.round(Hh / 2);
    const hx = x0 + f.lang - 1; // Maul
    const oben = [], unten = [];
    const halbAn = (i) => Math.max(0.6, (f.hoch / 2) * profil(i / (f.lang - 1), f.kopf, aal));
    const welle = (i) => (aal ? Math.round(Math.sin((i / (f.lang - 1)) * Math.PI * 2.2) * 1.2) : 0);
    const imKoerper = (i, y) => y >= oben[i] && y <= unten[i];

    // Schwanz zuerst — der Körper darf seinen Ansatz überdecken
    const b = Math.max(1, Math.round(halbAn(0)));
    for (let k = 0; k < L; k++) {
        const x = x0 - 1 - k;
        const yv = cy + welle(0);
        for (const [von, bis] of schwanzSpalte(f.schwanz, k, L, b)) {
            for (let dy = von; dy <= bis; dy++) {
                let c = flosse;
                if (f.schwanz === "faecher" && k >= 2) c = (dy & 1) ? dunkel : flosse;
                else if (f.schwanz === "flamme") c = k < 3 ? flosse : k < 6 ? "#f2803a" : "#ffd84a";
                else if ((f.schwanz === "schleier" || f.schwanz === "doppel") && k >= L - 3) c = hell;
                else if (f.schwanz === "gerade" && k === L - 1) c = dunkel;
                p(c, x, yv + dy);
            }
        }
    }

    // Bauch- und Afterflosse (unter dem Körper, vor dem Körper gemalt)
    for (let i = 0; i < f.lang; i++) {
        const halb = halbAn(i);
        oben[i] = Math.round(cy - halb) + welle(i);
        unten[i] = Math.round(cy + halb) + welle(i);
    }
    if (!aal) {
        const bi = Math.round(f.lang * 0.52), ai = Math.round(f.lang * 0.25);
        p(flosse, x0 + bi, unten[bi] + 1, 2, 1); p(flosse, x0 + bi, unten[bi] + 2);
        p(flosse, x0 + ai, unten[ai] + 1, 2, 1);
    }
    if (f.schwanz === "saum") {
        for (let i = 0; i < Math.round(f.lang * 0.55); i++) { p(flosse, x0 + i, oben[i] - 1); p(flosse, x0 + i, unten[i] + 1); }
    }

    // Körper: Rücken dunkel, Flanke mittel, Bauch hell, darüber eine Glanzzeile
    for (let i = 0; i < f.lang; i++) {
        const u = i / (f.lang - 1);
        const halb = halbAn(i);
        const x = x0 + i;
        const rueckenBis = cy - halb * 0.45 + welle(i);
        const bauchAb = cy + halb * 0.25 + welle(i);
        for (let y = oben[i]; y <= unten[i]; y++) {
            p(y <= rueckenBis ? dunkel : y >= bauchAb ? hell : mittel, x, y);
        }
        if (f.hoch >= 7 && u > 0.3 && u < 0.8) p(hell, x, Math.floor(rueckenBis) + 1);
        // Muster
        if (f.streifen && i % 3 === 1 && u > 0.2 && u < 0.8) for (let y = oben[i] + 1; y <= Math.round(cy + halb * 0.3); y++) p(f.streifen, x, y);
        if (f.punkte && u > 0.12 && u < 0.85) for (let y = oben[i] + 1; y < cy + 1; y++) if ((i * 7 + y * 13) % 9 === 0) p(f.punkte, x, y);
        if (f.marmor && u < 0.9) for (let y = oben[i]; y <= cy; y++) if ((i * 5 + y * 3) % 7 < 2) p(f.marmor, x, y);
        if (f.punktreihe && u > 0.45 && u < 0.78 && i % 2 === 0) p(f.punktreihe, x, cy - 1 + welle(i));
        if (f.band && u > 0.12 && u < 0.88) p(f.band, x, cy + welle(i));
        if (f.schuppen && u > 0.15 && u < 0.85) for (let y = oben[i] + 1; y < unten[i]; y++) if ((i + y * 2) % 4 === 0) p(f.schuppen, x, y);
        if (f.kehle && u > 0.68) for (let y = cy + 1; y <= unten[i]; y++) p(f.kehle, x, y);
        if (f.wellen && u > 0.15 && u < 0.8) { p(f.wellen, x, cy - 1 + Math.round(Math.sin(i * 1.2))); p(f.wellen, x, cy + 2 + Math.round(Math.sin(i * 1.2 + 1))); }
        if (f.blitz && u > 0.08 && u < 0.92) p(f.blitz, x, cy + [-1, 0, 1, 0][i % 4] + welle(i));
    }
    if (f.flecken) {
        for (const [uu, dy] of [[0.28, -1], [0.5, 0], [0.55, -2], [0.75, -1]]) {
            const i = Math.round(uu * (f.lang - 1));
            for (const [ax, ay] of [[0, 0], [1, 0], [0, 1], [1, 1]]) if (imKoerper(i + ax, cy + dy + ay)) p(f.flecken, x0 + i + ax, cy + dy + ay);
        }
    }

    // Rückenflosse
    const rf = (uVon, uBis, hoehe) => {
        const von = Math.round(uVon * (f.lang - 1)), bis = Math.round(uBis * (f.lang - 1));
        for (let i = von; i <= bis; i++) {
            const h = hoehe(i - von, bis - von);
            for (let k = 1; k <= h; k++) p(k === h ? dunkel : flosse, x0 + i, oben[i] - k);
        }
    };
    switch (f.ruecken) {
        case "klein": rf(0.45, 0.6, (j, n) => (j < n ? 2 : 1)); break;
        case "stachel": rf(0.38, 0.75, (j) => (j % 2 === 0 ? 2 : 1)); break;
        case "doppelt": rf(0.56, 0.76, (j) => (j % 2 === 0 ? 3 : 2)); rf(0.25, 0.45, (j, n) => (j === 0 || j === n ? 1 : 2)); break;
        case "lang": rf(0.2, 0.72, (j, n) => (j === n ? 2 : 1)); break;
        case "segel": rf(0.35, 0.65, (j, n) => Math.max(1, Math.round(4 * (1 - Math.abs(j - n / 2) / (n / 2 + 1))))); break;
        case "rund": rf(0.35, 0.6, (j, n) => (j === 0 || j === n ? 1 : 2)); break;
        case "hinten": rf(0.12, 0.3, (j, n) => (j === n ? 1 : 2)); break;
        default: break;
    }
    if (f.fett) p(dunkel, x0 + Math.round(f.lang * 0.18), oben[Math.round(f.lang * 0.18)] - 1);
    if (f.drache) {
        for (let i = 3; i < f.lang - 4; i += 2) p(i % 4 === 1 ? "#ffd84a" : "#f2803a", x0 + i, oben[i] - 1, 1, i % 4 === 1 ? 2 : 1);
        p("#ffd84a", hx - 2, oben[f.lang - 3] - 2, 1, 2); p("#ffd84a", hx - 4, oben[f.lang - 5] - 2, 1, 2);
    }

    // Kopf: Brustflosse, Kiemendeckel, Auge, Maul
    const kopfHalb = halbAn(f.lang - 3);
    if (!aal && f.hoch >= 5) {
        const kx = hx - Math.max(4, Math.round(f.hoch * 0.6)) - (f.kopf === "schnabel" ? 3 : 0);
        for (let y = Math.round(cy - kopfHalb * 0.55); y <= Math.round(cy + kopfHalb * 0.6); y++) p(dunkel, kx + (y < cy - 1 ? 1 : 0), y);
        p(flosse, kx - 1, cy + 1); p(flosse, kx - 2, cy + 2);
    }
    const ex = hx - Math.max(2, Math.round(f.hoch * 0.3)) - (f.kopf === "schnabel" ? 3 : 0);
    const ey = cy - Math.max(1, Math.round(f.hoch * 0.15)) + welle(f.lang - 3);
    const pupille = f.auge || UMRISS;
    if (f.grossesAuge || f.hoch >= 8) { p("#ffffff", ex - 1, ey - 1, 2, 2); p(pupille, ex, ey, 1, 1); p(pupille, ex - 1, ey, 1, 1); p("#ffffff", ex - 1, ey - 1); }
    else { p("#ffffff", ex - 1, ey); p(pupille, ex, ey); }
    const my = cy + 1 + welle(f.lang - 1);
    if (f.zaehne) { p(UMRISS, hx - 3, my, 4, 1); p("#ffffff", hx - 1, my - 1); p("#ffffff", hx - 3, my - 1); }
    else if (!aal) p(dunkel, hx - 1, my);
    switch (f.bart) {
        case "kurz": p(dunkel, hx - 1, my + 1, 1, 2); break;
        case "lang": p(dunkel, hx - 1, my + 1); p(dunkel, hx - 2, my + 2); p(dunkel, hx - 3, my + 3, 2, 1); p(dunkel, hx, my + 1); p(dunkel, hx + 1, my + 2, 1, 2); break;
        case "vier": p(dunkel, hx, my + 1, 1, 2); p(dunkel, hx - 2, my + 1, 1, 2); break;
        case "kinn": p(dunkel, hx - 2, unten[f.lang - 3] + 1, 1, 2); break;
        default: break;
    }
    if (f.laterne) { // Leuchtangel über dem Kopf, bleibt innerhalb der Fläche
        const o = Math.max(2, oben[f.lang - 3] - 2);
        p(dunkel, hx - 2, o, 1, 2); p(dunkel, hx - 1, o - 1, 2, 1); p(f.laterne, hx + 1, o - 1, 2, 2);
    }
    if (f.leuchten) for (const [uu, dy] of [[0.3, -1], [0.62, 1], [0.8, -2]]) {
        const i = Math.round(uu * (f.lang - 1));
        if (imKoerper(i, cy + dy)) p(f.leuchten, x0 + i, cy + dy);
    }
}


/** Pixelbild eines Fischs als Bildadresse (vierfach, mit Umriss). */
export function fischBild(id) {
    if (cache.has(id)) return cache.get(id);
    const info = FISCH_INFO[id];
    if (!info || typeof document === "undefined") return null;
    const roh = document.createElement("canvas");
    roh.width = B; roh.height = Hh;
    zeichneFisch(roh.getContext("2d"), info);
    const c = document.createElement("canvas");
    c.width = (B + 2) * 4; c.height = (Hh + 2) * 4;
    const g = c.getContext("2d");
    g.imageSmoothingEnabled = false;
    const m = document.createElement("canvas");
    m.width = B + 2; m.height = Hh + 2;
    const mg = m.getContext("2d");
    for (const [dx, dy] of [[0, 1], [2, 1], [1, 0], [1, 2]]) mg.drawImage(roh, dx, dy);
    mg.globalCompositeOperation = "source-in";
    mg.fillStyle = UMRISS;
    mg.fillRect(0, 0, m.width, m.height);
    mg.globalCompositeOperation = "source-over";
    mg.drawImage(roh, 1, 1);
    g.drawImage(m, 0, 0, c.width, c.height);
    const url = c.toDataURL("image/png");
    cache.set(id, url);
    return url;
}
