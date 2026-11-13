// engine/figurAnim.js
// Bewegung für die Spielfiguren (10.11.). Jede Figur ist EIN Bild von vorn — Laufbilder gibt
// es nicht. Damit sie trotzdem läuft statt zu wackeln, wird das Bild zerlegt:
//   · Beine: der untere Streifen, in der Lücke zwischen den Füßen geteilt. Beim Laufen hebt
//     sich abwechselnd die linke und die rechte Hälfte.
//   · Körper: alles darüber, wippt im Schritt und „atmet“ im Stand um einen Bildpunkt.
//   · Augen: aus engine/figurAugen.js (tools/figurAugen.mjs) — alle paar Sekunden ein Lid.
// Wo geteilt wird, misst `masse` einmal je Bild aus dessen Bildpunkten.
import { FIGUR_AUGEN } from "./figurAugen";

const MASSE = new WeakMap();
/** Wie viele Bildzeilen der Beinstreifen unter den Körper reicht (deckt die Fuge beim Wippen). */
const UEBERLAPP = 5;

/** Umriss, Beinhöhe und Teilung zwischen den Füßen — einmal je Bild. */
function masse(img) {
    const gemerkt = MASSE.get(img);
    if (gemerkt) return gemerkt;
    const w = Math.max(1, img.naturalWidth || img.width);
    const h = Math.max(1, img.naturalHeight || img.height);
    const m = { w, h, beinY: Math.round(h * 0.86), teilX: Math.round(w / 2) };
    try {
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        const g = c.getContext("2d", { willReadFrequently: true });
        g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, w, h).data;
        const an = (x, y) => d[(y * w + x) * 4 + 3] > 120;
        let x0 = w, x1 = 0, y0 = h, y1 = 0;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            if (!an(x, y)) continue;
            if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
        if (x1 > x0 && y1 > y0) {
            const H = y1 - y0 + 1;
            m.beinY = y1 - Math.round(H * 0.13);
            // Lücke zwischen den Füßen: die leerste Spalte nahe der Mitte der untersten Zeilen
            const fussAb = y1 - Math.max(2, Math.round(H * 0.055));
            const mitte = (x0 + x1) / 2;
            const weite = (x1 - x0) * 0.22;
            let best = Infinity;
            for (let x = Math.round(mitte - weite); x <= Math.round(mitte + weite); x++) {
                let n = 0;
                for (let y = fussAb; y <= y1; y++) if (an(x, y)) n++;
                const wert = n * 10 + Math.abs(x - mitte) * 0.2;
                if (wert < best) { best = wert; m.teilX = x; }
            }
        }
    } catch { /* Bild nicht lesbar: bei den Schätzwerten bleiben */ }
    MASSE.set(img, m);
    return m;
}

/** Blinzelt die Figur gerade? Alle paar Sekunden kurz, manchmal doppelt. `saat` 0..1 je Figur. */
function blinzelt(zeit, saat) {
    const t = (zeit + saat * 11) % (3.4 + saat * 1.8);
    return t < 0.13 || (saat > 0.5 && t > 0.3 && t < 0.42);
}

/**
 * Zeichnet eine Figur stehend auf (0, fussY) mittig — gleiche Lage und Größe wie zuvor das
 * ganze Bild in einem `box`-Quadrat um (0, mitteY).
 *
 * @param {object} o
 * @param {number} o.mitteY  Mitte des Bildes in Zeichenkoordinaten
 * @param {number} o.box     Kantenlänge des Quadrats, in das das Bild eingepasst wird
 * @param {number} o.schritt Laufphase (Bogenmaß) oder null im Stand
 * @param {number} o.zeit    Sekunden, für Atmen und Blinzeln
 * @param {number} o.saat    0..1 je Figur, damit nicht alle im Gleichtakt blinzeln
 * @param {string} o.src     Bildpfad ohne Versionsanhang (Schlüssel der Augen-Tabelle)
 * @param {number} o.hub     wie hoch ein Fuß beim Schritt kommt (Zeichenpunkte)
 * @returns {number} Versatz des Körpers nach oben (negativ) — für den Hut
 */
export function zeichneFigur(ctx, img, o) {
    const m = masse(img);
    const sc = Math.min(o.box / m.w, o.box / m.h);
    const dw = m.w * sc;
    const dh = m.h * sc;
    const links = -dw / 2;
    const oben = o.mitteY - dh / 2;

    // Wippen und Atmen sind für die Figur in der Welt (80er-Kasten) bemessen — im Haus ist sie größer
    const mass = o.box / 80;
    let hebL = 0, hebR = 0, wipp = 0;
    if (o.schritt !== null && o.schritt !== undefined) {
        const s = Math.sin(o.schritt);
        const hub = o.hub || 5;
        hebL = Math.round(Math.max(0, s) * hub);
        hebR = Math.round(Math.max(0, -s) * hub);
        wipp = -Math.round(Math.abs(s) * 2.5 * mass);
    } else {
        // Atmen: der Körper hebt sich für einen Moment um einen Punkt
        wipp = Math.sin(o.zeit * 2.1 + o.saat * 6) > 0.35 ? -Math.max(1, Math.round(mass)) : 0;
    }

    const beinAb = Math.max(0, m.beinY - UEBERLAPP);
    const beinH = m.h - beinAb;
    const teil = Math.max(1, Math.min(m.w - 1, m.teilX));
    // Beine zuerst, der Körper deckt ihre Oberkante
    ctx.drawImage(img, 0, beinAb, teil, beinH, links, oben + beinAb * sc - hebL, teil * sc, beinH * sc);
    ctx.drawImage(img, teil, beinAb, m.w - teil, beinH, links + teil * sc, oben + beinAb * sc - hebR, (m.w - teil) * sc, beinH * sc);
    ctx.drawImage(img, 0, 0, m.w, m.beinY, links, oben + wipp, dw, m.beinY * sc);

    const augen = FIGUR_AUGEN[o.src];
    if (augen && blinzelt(o.zeit, o.saat)) {
        const k = dw / augen.w;
        for (const [ex, ey, ew, eh] of augen.augen) {
            ctx.fillStyle = augen.lid;
            ctx.fillRect(links + ex * k, oben + wipp + ey * k, ew * k, eh * k);
            ctx.fillStyle = augen.strich;
            ctx.fillRect(links + ex * k, oben + wipp + (ey + eh * 0.6) * k, ew * k, Math.max(1, k * 1.4));
        }
    }
    return wipp;
}
