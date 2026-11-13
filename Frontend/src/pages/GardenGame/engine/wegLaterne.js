// engine/wegLaterne.js
// Laternen am Wegrand (06.11.): kleine Pixel-Laterne, per Code gezeichnet wie das Haus
// von innen (ui/HausInnen.jsx). Zwei Fassungen — aus (tagsüber) und an (nachts) — je
// einmal auf eine kleine Fläche gemalt und danach nur noch hochskaliert kopiert.
// Wo sie stehen, legt MapConfig.setzeWegLaternen fest; gezeichnet wird in Renderer._drawWegLaternen.

/** Bildpunkte der Laterne; gezeichnet mit LATERNE_PUNKT Weltpixeln je Bildpunkt (gröber als die
 * 48 je Kachel der Bilder — in Bildgröße wirkte sie wie ein Zahnstocher). */
const BREITE = 12;
const HOEHE = 30;
export const LATERNE_PUNKT = 2;
export const LATERNE_W = BREITE * LATERNE_PUNKT;
export const LATERNE_H = HOEHE * LATERNE_PUNKT;

/** Lichtschein nachts — gleiches Format wie die Leuchten im Deko-Katalog (ui/deko.js). */
export const LATERNE_LICHT = { radius: 170, farbe: [253, 224, 140], hoehe: 46, flackern: 0.04 };

const cache = {};

export function laternenBild(an) {
    const key = an ? "an" : "aus";
    if (cache[key]) return cache[key];
    if (typeof document === "undefined") return null;
    const c = document.createElement("canvas");
    c.width = BREITE;
    c.height = HOEHE;
    const g = c.getContext("2d");
    const p = (farbe, x, y, w = 1, h = 1) => { g.fillStyle = farbe; g.fillRect(x, y, w, h); };

    // Sockel
    p("#2b1d12", 2, 26, 8, 4);
    p("#7d7a72", 3, 26, 6, 3);
    p("#a29e94", 3, 26, 6, 1);
    // Mast
    p("#2b1d12", 4, 12, 4, 15);
    p("#4b5259", 5, 12, 2, 14);
    p("#6b737c", 5, 12, 1, 14);
    // Laternenkopf: Dach, Glas mit Sprossen, Boden
    p("#2b1d12", 5, 0, 2, 1);
    p("#2b1d12", 2, 1, 8, 3);
    p("#3b3b44", 3, 2, 6, 1);
    p("#2b1d12", 2, 4, 8, 8);
    const glas = an ? "#fff0a0" : "#8f9aa4";
    const glasHell = an ? "#ffffff" : "#b4bec6";
    const glasRand = an ? "#f2c14e" : "#6f7a84";
    p(glas, 3, 5, 6, 6);
    p(glasRand, 3, 10, 6, 1);
    p(glasHell, 4, 6, 1, 3);
    if (an) p("#ffffff", 5, 7, 2, 2);
    p("#3b3b44", 3, 4, 6, 1);
    p("#3b3b44", 3, 11, 6, 1);
    cache[key] = c;
    return c;
}
