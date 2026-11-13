// engine/hausTuer.js
// Wo an einem begehbaren Gebäude die Tür sitzt (11.11.): Haus (alle Looks aus dem Gold-Shop)
// und Gold-Shop. Damit kann die Figur wirklich hineinlaufen — die Tür schwingt auf, die
// Figur geht durch den Rahmen, erst dann wechselt das Bild in den Innenraum.
//
// Die Maße sind in Bildpunkten des jeweiligen Bilds ausgemessen: Türblatt links/rechts
// (x0, x1), oben/unten (y0, y1) und `r` = Rundung des Türbogens oben (0 = eckig).
// Kommt ein neuer Haus-Look dazu, braucht er hier einen Eintrag — ohne gilt STANDARD im
// Verhältnis zur Bildgröße, das passt dann nur ungefähr.
import { SHED_RESKIN_BILD } from "../ui/reskins";

const STANDARD = { b: 256, h: 248, x0: 111, x1: 154, y0: 144, y1: 209, r: 0 };
const JE_BILD = {
    "/garden-assets/world/shed.png": STANDARD,
    // Der Gold-Shop ist dasselbe Haus mit goldenem Dach (tools/goldShopBild.mjs)
    "/garden-assets/world/gold_shop.png": STANDARD,
    [SHED_RESKIN_BILD.celestial]: { b: 360, h: 384, x0: 131, x1: 222, y0: 210, y1: 368, r: 45 },
    [SHED_RESKIN_BILD.forge]: { b: 384, h: 360, x0: 162, x1: 223, y0: 190, y1: 316, r: 30 },
    [SHED_RESKIN_BILD.herbs]: { b: 384, h: 366, x0: 160, x1: 223, y0: 209, y1: 346, r: 0 },
    [SHED_RESKIN_BILD.observatory]: { b: 384, h: 381, x0: 149, x1: 245, y0: 204, y1: 352, r: 48 },
    [SHED_RESKIN_BILD.orbital]: { b: 384, h: 372, x0: 150, x1: 233, y0: 222, y1: 321, r: 41 },
    [SHED_RESKIN_BILD.seedsman]: { b: 384, h: 381, x0: 161, x1: 233, y0: 226, y1: 365, r: 36 },
    [SHED_RESKIN_BILD.void_weaver]: { b: 381, h: 384, x0: 148, x1: 236, y0: 188, y1: 345, r: 10 },
};

/** Türmaße eines Bilds in dessen eigenen Bildpunkten. */
export function tuerMass(bildPfad) {
    return JE_BILD[bildPfad] || STANDARD;
}

/**
 * Tür eines Gebäudes in Weltpixeln. Braucht `area._bild` — das trägt der Renderer beim
 * Zeichnen ein (wo das Bild wirklich liegt); solange es fehlt, gibt es keine Tür.
 * @returns {{ x0, y0, x1, y1, r, mitteX, fuss, massstab } | null} `fuss` = Unterkante des Bilds
 */
export function tuerLage(area, out) {
    const b = area?._bild;
    if (!b || !(b.w > 0)) return null;
    const m = tuerMass(area.image);
    const s = b.w / m.b;
    const t = out || {};
    t.x0 = b.x + m.x0 * s;
    t.x1 = b.x + m.x1 * s;
    t.y0 = b.y + m.y0 * s;
    t.y1 = b.y + m.y1 * s;
    t.r = m.r * s;
    t.mitteX = (t.x0 + t.x1) / 2;
    t.fuss = b.y + b.h;
    t.massstab = s;
    return t;
}

/** Türform als Pfad: Rechteck mit rundem Bogen oben. `unten` verlängert sie nach unten. */
export function tuerPfad(ctx, t, unten = 0) {
    const r = Math.min(t.r, (t.x1 - t.x0) / 2);
    ctx.beginPath();
    ctx.moveTo(t.x0, t.y1 + unten);
    ctx.lineTo(t.x0, t.y0 + r);
    if (r > 0) {
        ctx.arcTo(t.x0, t.y0, t.x0 + r, t.y0, r);
        ctx.lineTo(t.x1 - r, t.y0);
        ctx.arcTo(t.x1, t.y0, t.x1, t.y0 + r, r);
    } else {
        ctx.lineTo(t.x0, t.y0);
        ctx.lineTo(t.x1, t.y0);
    }
    ctx.lineTo(t.x1, t.y1 + unten);
    ctx.closePath();
}
