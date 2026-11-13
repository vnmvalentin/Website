// tools/figurAugen.mjs
// Sucht in jedem Figurenbild (public/garden-assets/wardrobe) die beiden Augen und schreibt
// sie nach engine/figurAugen.js — damit die Figuren blinzeln können (engine/figurAnim.js).
//
//   node src/pages/GardenGame/tools/figurAugen.mjs            schreibt engine/figurAugen.js
//   node src/pages/GardenGame/tools/figurAugen.mjs --bogen <datei.png>
//        malt zusätzlich einen Prüfbogen: jede Figur 4-fach vergrößert, links offen,
//        rechts mit geschlossenen Augen. Nach jeder neuen Figur ansehen!
//
// Gesucht wird ein Paar dunkler Flecken auf gleicher Höhe im Gesicht. Figuren, bei denen
// das nicht klappt (schwarzes Fell, Augenklappe), stehen unten in VON_HAND.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(HIER, "../../../..");
const ORDNER = path.join(FRONTEND, "public/garden-assets/wardrobe");
const ZIEL = path.join(HIER, "../engine/figurAugen.js");

/**
 * Augen, die die Suche nicht findet — [x, y, breite, hoehe] im Bild, je Auge.
 * `null` heißt: diese Figur blinzelt nicht.
 */
const VON_HAND = {
    // wird nach dem ersten Lauf anhand des Prüfbogens gefüllt
};

function dateien() {
    const liste = [];
    for (const f of fs.readdirSync(ORDNER)) {
        if (f.endsWith(".png")) liste.push(f);
    }
    for (const f of fs.readdirSync(path.join(ORDNER, "farmer"))) {
        if (f.endsWith(".png")) liste.push(`farmer/${f}`);
    }
    return liste.sort();
}

function sucheAugenBei(d, w, h, schwelle) {
    const an = (x, y) => d[(y * w + x) * 4 + 3] > 200;
    let bx0 = w, by0 = h, bx1 = 0, by1 = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (!an(x, y)) continue;
        if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y;
    }
    const H = by1 - by0 + 1;
    const W = bx1 - bx0 + 1;
    const y0 = Math.round(by0 + H * 0.2), y1 = Math.round(by0 + H * 0.48);
    const dunkel = (x, y) => {
        if (!an(x, y)) return false;
        const o = (y * w + x) * 4;
        return Math.max(d[o], d[o + 1], d[o + 2]) < schwelle;
    };
    // Zusammenhängende dunkle Flecken
    const marke = new Int32Array(w * h).fill(-1);
    const flecken = [];
    for (let y = y0; y <= y1; y++) for (let x = bx0; x <= bx1; x++) {
        if (marke[y * w + x] !== -1 || !dunkel(x, y)) continue;
        const f = { x0: x, y0: y, x1: x, y1: y, n: 0, rand: false };
        const stapel = [[x, y]];
        marke[y * w + x] = flecken.length;
        while (stapel.length) {
            const [px, py] = stapel.pop();
            f.n++;
            if (px < f.x0) f.x0 = px; if (px > f.x1) f.x1 = px; if (py < f.y0) f.y0 = py; if (py > f.y1) f.y1 = py;
            for (const [nx, ny] of [[px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]]) {
                if (nx < bx0 || nx > bx1 || ny < y0 || ny > y1) { if (ny < y0 || ny > y1) f.rand = f.rand || dunkel(nx, Math.max(0, Math.min(h - 1, ny))); continue; }
                if (marke[ny * w + nx] !== -1 || !dunkel(nx, ny)) continue;
                marke[ny * w + nx] = flecken.length;
                stapel.push([nx, ny]);
            }
        }
        flecken.push(f);
    }
    const passt = flecken.filter((f) => {
        const fw = f.x1 - f.x0 + 1, fh = f.y1 - f.y0 + 1;
        return !f.rand && fw >= W * 0.05 && fw <= W * 0.2 && fh >= H * 0.035 && fh <= H * 0.13 && f.n >= fw * fh * 0.45;
    });
    let best = null;
    const mitte = (bx0 + bx1) / 2;
    for (let i = 0; i < passt.length; i++) for (let j = i + 1; j < passt.length; j++) {
        const a = passt[i].x0 < passt[j].x0 ? passt[i] : passt[j];
        const b = a === passt[i] ? passt[j] : passt[i];
        const ay = (a.y0 + a.y1) / 2, by = (b.y0 + b.y1) / 2;
        const ax = (a.x0 + a.x1) / 2, bxm = (b.x0 + b.x1) / 2;
        if (Math.abs(ay - by) > H * 0.03) continue;
        const abstand = bxm - ax;
        if (abstand < W * 0.16 || abstand > W * 0.5) continue;
        if (Math.abs((ax + bxm) / 2 - mitte) > W * 0.16) continue;
        if (Math.min(a.n, b.n) / Math.max(a.n, b.n) < 0.45) continue;
        const wert = a.n + b.n;
        if (!best || wert > best.wert) best = { wert, a, b };
    }
    if (!best) return null;
    return [best.a, best.b].map((f) => [f.x0, f.y0, f.x1 - f.x0 + 1, f.y1 - f.y0 + 1]);
}

/** Mehrere Dunkel-Schwellen: berührt das Auge einen dunklen Umriss, trennt erst eine strengere beide. */
function sucheAugen(d, w, h) {
    for (const schwelle of [100, 80, 62, 46, 130]) {
        const augen = sucheAugenBei(d, w, h, schwelle);
        if (augen) return augen;
    }
    return null;
}

/** Fellfarbe rund ums Auge: häufigste nicht dunkle Farbe im Rahmen um das Auge. */
function lidFarbe(d, w, h, auge) {
    const [ex, ey, ew, eh] = auge;
    const zaehler = new Map();
    for (let y = ey - 2; y < ey + eh + 2; y++) for (let x = ex - 2; x < ex + ew + 2; x++) {
        if (x >= ex && x < ex + ew && y >= ey && y < ey + eh) continue;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const o = (y * w + x) * 4;
        if (d[o + 3] < 200) continue;
        const key = `${d[o] >> 3},${d[o + 1] >> 3},${d[o + 2] >> 3}`;
        const e = zaehler.get(key) || { n: 0, r: 0, g: 0, b: 0 };
        e.n++; e.r += d[o]; e.g += d[o + 1]; e.b += d[o + 2];
        zaehler.set(key, e);
    }
    let best = null;
    for (const e of zaehler.values()) if (!best || e.n > best.n) best = e;
    if (!best) return [120, 90, 60];
    return [Math.round(best.r / best.n), Math.round(best.g / best.n), Math.round(best.b / best.n)];
}

const hex = ([r, g, b]) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;

const ergebnis = {};
const bogenTeile = [];
const bogenIdx = process.argv.indexOf("--bogen");
const bogenZiel = bogenIdx > 0 ? process.argv[bogenIdx + 1] : null;

for (const datei of dateien()) {
    const bild = sharp(path.join(ORDNER, datei)).ensureAlpha();
    const { data, info } = await bild.raw().toBuffer({ resolveWithObject: true });
    let augen = datei in VON_HAND ? VON_HAND[datei] : sucheAugen(data, info.width, info.height);
    let eintrag = null;
    if (augen) {
        const lid = lidFarbe(data, info.width, info.height, augen[0]);
        // Lidstrich: das Fell, deutlich abgedunkelt
        const strich = lid.map((v) => Math.round(v * 0.38));
        eintrag = { w: info.width, h: info.height, augen, lid: hex(lid), strich: hex(strich) };
        ergebnis[`/garden-assets/wardrobe/${datei}`] = eintrag;
    }
    console.log(datei.padEnd(24), augen ? JSON.stringify(augen) : "— keine Augen gefunden");
    if (bogenZiel) {
        const zu = Buffer.from(data);
        if (eintrag) {
            const [lr, lg, lb] = [1, 3, 5].map((i) => parseInt(eintrag.lid.slice(i, i + 2), 16));
            const [sr, sg, sb] = [1, 3, 5].map((i) => parseInt(eintrag.strich.slice(i, i + 2), 16));
            for (const [ex, ey, ew, eh] of eintrag.augen) {
                const strichY = ey + Math.round(eh * 0.6);
                for (let y = ey; y < ey + eh; y++) for (let x = ex; x < ex + ew; x++) {
                    const o = (y * info.width + x) * 4;
                    const s = y === strichY;
                    zu[o] = s ? sr : lr; zu[o + 1] = s ? sg : lg; zu[o + 2] = s ? sb : lb; zu[o + 3] = 255;
                }
            }
        }
        const gross = (buf) => sharp(buf, { raw: { width: info.width, height: info.height, channels: 4 } })
            .resize(info.width * 3, info.height * 3, { kernel: "nearest" }).png().toBuffer();
        bogenTeile.push({ offen: await gross(data), zu: await gross(zu), w: info.width * 3, h: info.height * 3 });
    }
}

const kopf = `// engine/figurAugen.js
// ERZEUGT von tools/figurAugen.mjs — nicht von Hand ändern, sondern das Werkzeug neu laufen
// lassen (nach jeder neuen oder geänderten Figur). Je Figurenbild: Bildgröße, die beiden
// Augen als [x, y, breite, hoehe] in Bildpunkten, Fellfarbe fürs Lid und Farbe des Lidstrichs.
// Figuren ohne Eintrag blinzeln nicht.
`;
fs.writeFileSync(ZIEL, `${kopf}export const FIGUR_AUGEN = ${JSON.stringify(ergebnis, null, 4)};\n`);
console.log(`\n${Object.keys(ergebnis).length} Figuren → ${path.relative(FRONTEND, ZIEL)}`);

if (bogenZiel) {
    const spalten = 6;
    const zw = Math.max(...bogenTeile.map((t) => t.w)) * 2 + 16;
    const zh = Math.max(...bogenTeile.map((t) => t.h)) + 12;
    const teile = [];
    bogenTeile.forEach((t, i) => {
        const x = (i % spalten) * zw, y = Math.floor(i / spalten) * zh;
        teile.push({ input: t.offen, left: x + 4, top: y + 6 }, { input: t.zu, left: x + 8 + t.w, top: y + 6 });
    });
    await sharp({ create: { width: spalten * zw, height: Math.ceil(bogenTeile.length / spalten) * zh, channels: 4, background: { r: 120, g: 160, b: 90, alpha: 1 } } })
        .composite(teile).png().toFile(bogenZiel);
    console.log(`Prüfbogen → ${bogenZiel}`);
}
