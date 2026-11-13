// engine/pixelBoden.js — Bodenkacheln im Pixel-Look, im Code gezeichnet (05.11.).
//
// Ersetzt die gemalten Bilder aus garden-assets/structure/ (gras1/2, hohes_gras1/2,
// kiesweg1/2, acker, stein, wood). Gründe: nahtlos ohne Gitter (KI-Kacheln hatten
// Rahmen und Vignette), dasselbe Raster wie Wasser und Ufer (WELT_PIXEL = 4 Weltpixel
// je Punkt), keine Ladezeit, und die Farben folgen der Jahreszeit.
//
// Jede Kachel ist periodisch: Rauschen und Streumuster rechnen mit Koordinaten modulo
// der Kachelbreite, deshalb passt der rechte Rand an den linken. Ausgabe 256 × 256 wie
// die alten Bilder, damit der Renderer sie genauso skaliert (Kies: ein Bild über
// 2 × 2 Kacheln, alles andere eins je Kachel).

const AUSGABE = 256;

/** Punkte je Kachelbild: 64 Weltpixel / 4 = 16; Kies liegt über zwei Kacheln → 32. */
const PUNKTE = { grass: 16, tallGrass: 16, path: 32, field: 16, rock: 16, wood: 16 };

/** Rasen je Jahreszeit: Grundtöne (dunkel → hell), Halme, Streu (Blüten, Laub, Schnee). */
const GRAS = {
    fruehling: { toene: ["#4f9a37", "#5aa83e", "#66b546", "#76c351"], halmDunkel: "#3c7f2a", halmHell: "#92d465", streu: ["#f9a8d4", "#fde68a", "#ffffff"], streuAnteil: 0.018 },
    sommer: { toene: ["#4b8f33", "#56a03a", "#61ac41", "#70b94b"], halmDunkel: "#3a7428", halmHell: "#88c95c", streu: ["#fde047", "#ffffff"], streuAnteil: 0.008 },
    herbst: { toene: ["#6c8a33", "#7a9839", "#88a440", "#98ad48"], halmDunkel: "#56702a", halmHell: "#b2b85a", streu: ["#c2410c", "#d97706", "#b45309"], streuAnteil: 0.03 },
    winter: { toene: ["#6f8d6c", "#7b9978", "#87a484", "#98b394"], halmDunkel: "#5a7558", halmHell: "#b4c7b0", streu: ["#eef4fb", "#dce8f5"], streuAnteil: 0.05 },
};
/** Waldboden: dunkler, dichter, längere Halme. */
const WALD = {
    fruehling: { toene: ["#2f6a2a", "#377532", "#3f8038", "#4a8c40"], halmDunkel: "#24541f", halmHell: "#6fae52" },
    sommer: { toene: ["#2c6227", "#336d2d", "#3b7834", "#45843c"], halmDunkel: "#214c1c", halmHell: "#65a24a" },
    herbst: { toene: ["#4c6526", "#57702b", "#627b31", "#6f8636"], halmDunkel: "#3b501d", halmHell: "#9a9e48" },
    winter: { toene: ["#4f6a4d", "#587455", "#627e5e", "#6e8a69"], halmDunkel: "#3e573c", halmHell: "#9cb398" },
};
const KIES = { toene: ["#b3a079", "#bead85", "#c8b890", "#d2c39c"], stein: ["#8f8676", "#a39a88", "#b7ae9b", "#cfc7b4"], schatten: "#7d725e" };
const ACKER = { toene: ["#4f2e15", "#5a3519", "#653d1e", "#714523"], furche: "#3f2410", kamm: "#7d4f29" };
const STEIN = { toene: ["#6f6e6a", "#7b7a75", "#878680", "#94938c"], fuge: "#55544f", licht: "#a8a7a0" };
const HOLZ = { toene: ["#8e6237", "#9b6c3d", "#a87744"], fuge: "#5b3a1c", maser: "#7e5530", nagel: "#3b2a1a" };
/** Raureif/Schnee-Tupfer im Winter auf Kies, Acker und Stein. */
const FROST = ["#e8eef5", "#d6e1ec"];

function hash(x, y, salz) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(salz | 0, 1274126177);
    h ^= h >>> 13; h = Math.imul(h, 1274126177); h ^= h >>> 16;
    return (h >>> 0) / 4294967295;
}

/** Weiches, periodisches Rauschen (Gitter `g` Punkte, Breite `n` muss durch g teilbar sein). */
function rauschen(x, y, n, g, salz) {
    const z = n / g;
    const gx = x / g, gy = y / g;
    const x0 = Math.floor(gx), y0 = Math.floor(gy);
    const fx = gx - x0, fy = gy - y0;
    const w = (a, b) => hash(((a % z) + z) % z, ((b % z) + z) % z, salz);
    const s = (t) => t * t * (3 - 2 * t);
    const a = w(x0, y0) + (w(x0 + 1, y0) - w(x0, y0)) * s(fx);
    const b = w(x0, y0 + 1) + (w(x0 + 1, y0 + 1) - w(x0, y0 + 1)) * s(fx);
    return a + (b - a) * s(fy);
}

/** Punktraster anlegen: feld[y][x] = Farbe. */
function raster(n, fuellen) {
    const feld = [];
    for (let y = 0; y < n; y++) {
        const zeile = [];
        for (let x = 0; x < n; x++) zeile.push(fuellen(x, y));
        feld.push(zeile);
    }
    const setze = (x, y, farbe) => { feld[((y % n) + n) % n][((x % n) + n) % n] = farbe; };
    return { feld, setze };
}

function grasRaster(n, v, pal, wald, salz) {
    const { feld, setze } = raster(n, (x, y) => {
        const r = rauschen(x, y, n, 4, salz + v) * 0.75 + hash(x, y, salz + 7 + v) * 0.25;
        return pal.toene[Math.min(pal.toene.length - 1, Math.floor(r * pal.toene.length))];
    });
    // Halmbüschel: ein heller Punkt, darunter links/rechts dunkle — liest sich als „ʌ“
    const buescheln = wald ? 10 : 6;
    for (let i = 0; i < buescheln; i++) {
        const x = Math.floor(hash(i, v, salz + 11) * n), y = Math.floor(hash(i, v, salz + 12) * n);
        const hoch = wald ? 2 + Math.floor(hash(i, v, salz + 13) * 2) : 1;
        for (let k = 0; k < hoch; k++) setze(x, y + k, k === 0 ? pal.halmHell : pal.halmDunkel);
        setze(x - 1, y + hoch, pal.halmDunkel);
        setze(x + 1, y + hoch, pal.halmDunkel);
    }
    return feld;
}

function malen(n, feld) {
    const klein = document.createElement("canvas");
    klein.width = n; klein.height = n;
    const kctx = klein.getContext("2d");
    const bild = kctx.createImageData(n, n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const f = feld[y][x];
        const i = (y * n + x) * 4;
        bild.data[i] = parseInt(f.slice(1, 3), 16);
        bild.data[i + 1] = parseInt(f.slice(3, 5), 16);
        bild.data[i + 2] = parseInt(f.slice(5, 7), 16);
        bild.data[i + 3] = 255;
    }
    kctx.putImageData(bild, 0, 0);
    const gross = document.createElement("canvas");
    gross.width = AUSGABE; gross.height = AUSGABE;
    const gctx = gross.getContext("2d");
    gctx.imageSmoothingEnabled = false;
    gctx.drawImage(klein, 0, 0, AUSGABE, AUSGABE);
    klein.width = 0; klein.height = 0;
    return gross;
}

const ERZEUGER = {
    grass(n, v, saison) {
        const pal = GRAS[saison] || GRAS.sommer;
        const feld = grasRaster(n, v, pal, false, 100);
        // Streu: Blüten im Frühling, Laub im Herbst, Schnee im Winter
        for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
            if (hash(x, y, 140 + v) < pal.streuAnteil) feld[y][x] = pal.streu[Math.floor(hash(x, y, 141 + v) * pal.streu.length)];
        }
        return feld;
    },
    tallGrass(n, v, saison) {
        const pal = WALD[saison] || WALD.sommer;
        const feld = grasRaster(n, v, pal, true, 200);
        if (saison === "winter" || saison === "herbst") {
            const streu = saison === "winter" ? FROST : GRAS.herbst.streu;
            for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
                if (hash(x, y, 240 + v) < (saison === "winter" ? 0.04 : 0.025)) feld[y][x] = streu[Math.floor(hash(x, y, 241) * streu.length)];
            }
        }
        return feld;
    },
    path(n, v, saison) {
        const { feld, setze } = raster(n, (x, y) => {
            const r = rauschen(x, y, n, 8, 300 + v) * 0.6 + hash(x, y, 301 + v) * 0.4;
            return KIES.toene[Math.min(3, Math.floor(r * 4))];
        });
        // Kiesel: 1–2 Punkte groß, heller oben links, Schatten unten rechts
        const anzahl = Math.round(n * n * 0.055);
        for (let i = 0; i < anzahl; i++) {
            const x = Math.floor(hash(i, v, 310) * n), y = Math.floor(hash(i, v, 311) * n);
            const farbe = KIES.stein[Math.floor(hash(i, v, 312) * KIES.stein.length)];
            const gross = hash(i, v, 313) < 0.35;
            setze(x, y, farbe);
            if (gross) { setze(x + 1, y, farbe); setze(x, y + 1, farbe); setze(x + 1, y + 1, KIES.schatten); setze(x + 2, y + 1, KIES.schatten); setze(x + 1, y + 2, KIES.schatten); }
            else setze(x + 1, y + 1, KIES.schatten);
        }
        if (saison === "winter") for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
            if (hash(x, y, 340 + v) < 0.05) feld[y][x] = FROST[Math.floor(hash(x, y, 341) * 2)];
        }
        return feld;
    },
    field(n, v, saison) {
        // Furchen quer: alle 4 Punkte eine dunkle Rinne, darüber ein heller Kamm
        const { feld, setze } = raster(n, (x, y) => {
            if (y % 4 === 3) return ACKER.furche;
            if (y % 4 === 0) return ACKER.kamm;
            const r = rauschen(x, y, n, 4, 400 + v) * 0.5 + hash(x, y, 401 + v) * 0.5;
            return ACKER.toene[Math.min(3, Math.floor(r * 4))];
        });
        // Erdklumpen
        for (let i = 0; i < 7; i++) {
            const x = Math.floor(hash(i, v, 410) * n), y = Math.floor(hash(i, v, 411) * n);
            if (y % 4 === 3) continue;
            setze(x, y, ACKER.kamm);
            setze(x + 1, y, ACKER.furche);
        }
        if (saison === "winter") for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
            if ((y % 4 === 0 && hash(x, y, 440 + v) < 0.07) || hash(x, y, 441 + v) < 0.01) feld[y][x] = FROST[Math.floor(hash(x, y, 442) * 2)];
        }
        return feld;
    },
    rock(n, v, saison) {
        // Unregelmäßige Steinplatten: Zellen um Streupunkte (periodisch), Fugen an den Grenzen
        const punkte = [];
        for (let i = 0; i < 7; i++) punkte.push([hash(i, v, 500) * n, hash(i, v, 501) * n, STEIN.toene[Math.floor(hash(i, v, 502) * 4)]]);
        const naechster = (x, y) => {
            let best = Infinity, zweit = Infinity, farbe = STEIN.toene[0];
            for (const [px, py, f] of punkte) for (let ox = -n; ox <= n; ox += n) for (let oy = -n; oy <= n; oy += n) {
                const d = (x + 0.5 - px - ox) ** 2 + (y + 0.5 - py - oy) ** 2;
                if (d < best) { zweit = best; best = d; farbe = f; } else if (d < zweit) zweit = d;
            }
            return { farbe, rand: Math.sqrt(zweit) - Math.sqrt(best) < 1.1 };
        };
        const { feld } = raster(n, (x, y) => {
            const z = naechster(x, y);
            if (z.rand) return STEIN.fuge;
            return hash(x, y, 510 + v) < 0.06 ? STEIN.licht : z.farbe;
        });
        if (saison === "winter") for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
            if (feld[y][x] !== STEIN.fuge && hash(x, y, 540) < 0.06) feld[y][x] = FROST[Math.floor(hash(x, y, 541) * 2)];
        }
        return feld;
    },
    wood(n) {
        // Vier Bretter quer, je eigener Ton, Maserstriche, Nägel an den Enden
        const { feld, setze } = raster(n, (x, y) => {
            if (y % 4 === 3) return HOLZ.fuge;
            const brett = Math.floor(y / 4);
            const ton = HOLZ.toene[Math.floor(hash(brett, 0, 600) * HOLZ.toene.length)];
            return hash(x, y, 601) < 0.12 ? HOLZ.maser : ton;
        });
        for (let b = 0; b < n / 4; b++) {
            const stoss = Math.floor(hash(b, 0, 610) * n);
            for (let y = b * 4; y < b * 4 + 3; y++) setze(stoss, y, HOLZ.fuge);
            setze(stoss + 1, b * 4 + 1, HOLZ.nagel);
            setze(stoss - 1, b * 4 + 1, HOLZ.nagel);
        }
        return feld;
    },
};

const cache = new Map();

/**
 * Bodenkachel als Leinwand (256 × 256). `datei` ist der alte Bildname aus TERRAIN_FILES —
 * daraus kommt die Variante (gras1 → 0, gras2 → 1), damit die Verteilung bleibt.
 * @param {string} art grass | tallGrass | path | field | rock | wood
 * @param {string} [datei]
 * @param {string|null} [saison] fruehling | sommer | herbst | winter
 * @returns {HTMLCanvasElement|null}
 */
/**
 * Grundstückszaun (07.11.) — ersetzt das gemalte structure/fence_v.png. Ein Streifen
 * für eine Kachelhöhe, von oben gesehen: zwei Pfosten mit hellem Kopf, dazwischen ein
 * Längsbalken, rechts ein Schlagschatten. Gleiches Raster wie der Boden (4 Weltpixel
 * je Punkt), im Winter liegt Schnee auf den Pfosten.
 * @param {string|null} saison
 * @returns {HTMLCanvasElement|null} 24 × 64 (Weltpixel)
 */
export function pixelZaun(saison) {
    if (typeof document === "undefined") return null;
    const s = GRAS[saison] ? saison : "sommer";
    const key = `zaun:${s}`;
    let leinwand = cache.get(key);
    if (leinwand) return leinwand;
    const P = 4; // Weltpixel je Punkt
    const B = 6, H = 16; // Punkte
    leinwand = document.createElement("canvas");
    leinwand.width = B * P; leinwand.height = H * P;
    const ctx = leinwand.getContext("2d");
    const punkt = (x, y, f) => { ctx.fillStyle = f; ctx.fillRect(x * P, y * P, P, P); };
    const kopf = s === "winter" ? FROST[0] : "#c08a50";
    const kopfRand = s === "winter" ? FROST[1] : HOLZ.toene[2];
    // Längsbalken über die ganze Höhe (Spalten 2–3), damit Kacheln nahtlos anschließen
    for (let y = 0; y < H; y++) {
        punkt(2, y, HOLZ.toene[1]);
        punkt(3, y, HOLZ.maser);
        punkt(4, y, "rgba(0,0,0,0.22)");
    }
    // Pfosten bei 1 und 9: 4 × 5, oben Kopf, unten Fuß im Schatten
    for (const y0 of [1, 9]) {
        for (let y = 0; y < 5; y++) for (let x = 1; x <= 4; x++) {
            const rand = x === 1 || x === 4 || y === 0 || y === 4;
            punkt(x, y0 + y, rand ? HOLZ.fuge : (y === 1 ? kopf : y === 2 ? kopfRand : HOLZ.toene[0]));
        }
        for (let y = 1; y <= 5; y++) punkt(5, y0 + y, "rgba(0,0,0,0.25)");
    }
    cache.set(key, leinwand);
    return leinwand;
}

export function pixelBodenKachel(art, datei, saison) {
    const erzeuger = ERZEUGER[art];
    if (!erzeuger || typeof document === "undefined") return null;
    const v = Math.max(0, (Number(String(datei || "").match(/(\d+)\.\w+$/)?.[1]) || 1) - 1);
    const s = GRAS[saison] ? saison : "sommer";
    const key = `${art}:${v}:${s}`;
    let leinwand = cache.get(key);
    if (!leinwand) {
        const n = PUNKTE[art];
        leinwand = malen(n, erzeuger(n, v, s));
        cache.set(key, leinwand);
    }
    return leinwand;
}
