// engine/huete.js
// Hüte für Figur und Tiere (06.11.), Bildpunkt für Bildpunkt im Code gezeichnet wie der
// Rest der Pixel-Deko. Gekauft und ausgerüstet werden sie im Gold-Shop (Backend
// core/reskins.js, Kategorien „hut" und „tierhut"); hier steht nur das Aussehen.
//
// hutBild(id) liefert eine kleine Fläche (BREITE × HOEHE Bildpunkte), die der Renderer
// mit harten Kanten hochskaliert; hutVorschau(id) dieselbe als Bildadresse für Fenster.

export const HUT_BREITE = 24;
export const HUT_HOEHE = 18;
const UMRISS = "#2b1d12";

function maler(g) {
    return (c, x, y, w = 1, h = 1) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
}

/** Jeder Hut sitzt mit seiner Unterkante auf Bildpunktreihe HUT_HOEHE - 1. */
const HUETE = {
    muetze(p) {
        p("#c8403a", 5, 7, 14, 8); p("#e8604a", 6, 7, 6, 2); p("#a8302a", 5, 13, 14, 2);
        p("#f3e3c3", 4, 14, 16, 3); for (let x = 5; x < 20; x += 2) p("#c9b48a", x, 15, 1, 2);
        p("#f3e3c3", 10, 3, 4, 4); p("#ffffff", 10, 3, 2, 2);
    },
    blumenkranz(p) {
        p("#3f7a35", 2, 13, 20, 3); p("#5faa45", 2, 13, 20, 1);
        const blueten = [[3, 11, "#ff8fa8"], [7, 10, "#ffe066"], [11, 9, "#ffffff"], [15, 10, "#a8c8ff"], [19, 11, "#ff8fa8"]];
        for (const [x, y, c] of blueten) { p(c, x, y, 3, 3); p("#f2c14e", x + 1, y + 1, 1, 1); }
    },
    kochmuetze(p) {
        p("#ffffff", 4, 2, 16, 9); p("#e8eef2", 4, 8, 16, 3); p("#ffffff", 3, 4, 3, 5); p("#ffffff", 18, 4, 3, 5);
        p("#e8eef2", 7, 11, 10, 6); p("#ffffff", 7, 11, 10, 1); p("#c8ccd4", 7, 16, 10, 1);
    },
    partyhut(p) {
        for (let y = 2; y < 17; y++) { const w = Math.round((y - 1) * 0.55); p(y % 4 < 2 ? "#5a82d8" : "#ffe066", 12 - w, y, w * 2 + 1, 1); }
        p("#ff8fa8", 10, 0, 4, 3); p("#e8403a", 2, 16, 21, 1);
    },
    piratenhut(p) {
        p("#2b2b33", 1, 9, 22, 6); p("#3b3b44", 4, 5, 16, 5); p("#3b3b44", 1, 7, 4, 3); p("#3b3b44", 19, 7, 4, 3);
        p("#e0b24a", 1, 14, 22, 1); p("#ffffff", 10, 8, 4, 3); p("#2b2b33", 11, 9, 1, 1); p("#2b2b33", 13, 9, 1, 1);
    },
    zylinder(p) {
        p("#2b2b33", 6, 1, 12, 13); p("#3b3b44", 7, 1, 3, 12); p("#c8403a", 6, 10, 12, 2);
        p("#2b2b33", 2, 14, 20, 3); p("#3b3b44", 2, 14, 20, 1);
    },
    zauberhut(p) {
        for (let y = 1; y < 14; y++) { const w = Math.round(y * 0.6); p("#6a40a8", 9 + Math.round(y * 0.2) - w, y, w * 2 + 1, 1); }
        p("#9a68d8", 9, 3, 2, 6); p("#ffe066", 12, 6, 2, 2); p("#ffe066", 8, 10, 1, 1); p("#ffe066", 15, 11, 1, 1);
        p("#5a3a8a", 1, 14, 22, 3); p("#7a5ab0", 1, 14, 22, 1);
    },
    krone(p) {
        p("#e0a82a", 3, 8, 18, 8); p("#ffd84a", 3, 8, 18, 2);
        for (const x of [3, 9, 15, 20]) p("#ffd84a", x, 4, 2, 5);
        p("#ffd84a", 11, 2, 2, 7);
        p("#e8403a", 6, 11, 3, 3); p("#5a82d8", 11, 11, 3, 3); p("#5faa45", 16, 11, 3, 3);
        p("#a87414", 3, 15, 18, 1);
    },
    schleife(p) {
        p("#e8508a", 4, 9, 7, 6); p("#e8508a", 13, 9, 7, 6); p("#ff8fb8", 5, 10, 3, 2); p("#ff8fb8", 14, 10, 3, 2);
        p("#c83a6a", 10, 10, 4, 4); p("#c83a6a", 8, 14, 3, 3); p("#c83a6a", 13, 14, 3, 3);
    },
};
export const HUT_IDS = Object.keys(HUETE);

const cache = new Map();

/** Fläche des Huts mit Umriss — oder null, wenn es den Hut nicht gibt. */
export function hutBild(id) {
    if (!id || !HUETE[id]) return null;
    if (cache.has(id)) return cache.get(id);
    if (typeof document === "undefined") return null;
    const roh = document.createElement("canvas");
    roh.width = HUT_BREITE; roh.height = HUT_HOEHE;
    const g = roh.getContext("2d");
    HUETE[id](maler(g));
    // Umriss: alles Sichtbare in UMRISS, eine Reihe versetzt dahinter, dann das Bild darüber
    const c = document.createElement("canvas");
    c.width = HUT_BREITE + 2; c.height = HUT_HOEHE + 2;
    const k = c.getContext("2d");
    const maske = document.createElement("canvas");
    maske.width = c.width; maske.height = c.height;
    const m = maske.getContext("2d");
    for (const [dx, dy] of [[0, 1], [2, 1], [1, 0], [1, 2]]) m.drawImage(roh, dx, dy);
    m.globalCompositeOperation = "source-in";
    m.fillStyle = UMRISS;
    m.fillRect(0, 0, maske.width, maske.height);
    k.drawImage(maske, 0, 0);
    k.drawImage(roh, 1, 1);
    cache.set(id, c);
    return c;
}

const vorschauCache = new Map();
/** Bildadresse für Fenster (Gold-Shop), vierfach vergrößert. */
export function hutVorschau(id) {
    if (vorschauCache.has(id)) return vorschauCache.get(id);
    const b = hutBild(id);
    if (!b) return null;
    const c = document.createElement("canvas");
    c.width = b.width * 4; c.height = b.height * 4;
    const g = c.getContext("2d");
    g.imageSmoothingEnabled = false;
    g.drawImage(b, 0, 0, c.width, c.height);
    const url = c.toDataURL("image/png");
    vorschauCache.set(id, url);
    return url;
}

/**
 * Hut auf einen Kopf zeichnen: (x, yKopf) = Mitte der Oberkante des Kopfs in den
 * aktuellen Koordinaten, `breite` = gewünschte Hutbreite.
 */
export function zeichneHut(ctx, id, x, yKopf, breite) {
    const b = hutBild(id);
    if (!b) return;
    const h = breite * (b.height / b.width);
    const glatt = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(b, Math.round(x - breite / 2), Math.round(yKopf - h * 0.82), Math.round(breite), Math.round(h));
    ctx.imageSmoothingEnabled = glatt;
}

const hoeheCache = new Map();
/**
 * Wie weit ein Hut über den Kopf der Spielfigur hinausragt (Zeichenpunkte der Welt, Hut
 * 44 breit wie in Renderer.drawPlayer) — so viel rückt das Namensschild nach oben, damit
 * es den Hut nicht verdeckt. Gemessen an der obersten bemalten Reihe des Huts.
 */
export function hutHoehe(id) {
    if (hoeheCache.has(id)) return hoeheCache.get(id);
    const b = hutBild(id);
    if (!b) return 0;
    let leer = 0;
    try {
        const d = b.getContext("2d").getImageData(0, 0, b.width, b.height).data;
        zeilen: for (; leer < b.height; leer++) {
            for (let x = 0; x < b.width; x++) if (d[(leer * b.width + x) * 4 + 3] > 0) break zeilen;
        }
    } catch { leer = 0; }
    const masstab = 44 / b.width;
    const h = b.height * masstab;
    // Hut-Oberkante liegt bei Kopf (−44) − 0,82·h + leere Reihen; das Schild sitzt sonst bei −57
    const ueber = Math.max(0, Math.round(44 + h * 0.82 - leer * masstab - 57 + 3));
    hoeheCache.set(id, ueber);
    return ueber;
}
