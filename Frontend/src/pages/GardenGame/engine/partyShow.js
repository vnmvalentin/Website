// engine/partyShow.js
// Mehr Party (10.11.): ein gemeinsamer Takt, nach dem Figuren und Tiere tanzen, eine
// Discokugel über dem Dorfteich mit wandernden Lichtflecken auf dem Platz, und Feuerwerk.
// Alles rechnet sich aus der Uhr — kein Zustand, nichts läuft nach dem Ende weiter, und
// alle in der Welt sehen dieselbe Kugel im selben Takt.
import { TILE_SIZE, weltHash } from "./MapConfig";

const T = TILE_SIZE;
const U = 4; // ein Zeichenpunkt der Welt (wie WELT_PIXEL im Renderer)
/** Weltpixel je Punkt der Discokugel — gröber, damit sie über dem Teich nicht verloren wirkt. */
const KP = 6;
/** Schläge je Minute — passt zu den Party-Titeln, die alle um 128 liegen. */
const BPM = 128;
const SCHLAG_MS = 60000 / BPM;
const FARBEN = [[255, 77, 125], [77, 210, 255], [180, 107, 255], [92, 255, 157], [255, 210, 77]];

/** Wo im Takt wir sind: `phase` 0..1 innerhalb des Schlags, `schlag` fortlaufende Nummer. */
export function partyTakt(now) {
    const s = now / SCHLAG_MS;
    const schlag = Math.floor(s);
    return { phase: s - schlag, schlag };
}

/**
 * Tanzschritt für Figuren: Laufphase für engine/figurAnim.js (ein Fuß je Schlag) und
 * Neigung, die alle zwei Schläge die Seite wechselt.
 */
export function tanzSchritt(now, saat = 0) {
    const { phase, schlag } = partyTakt(now + saat * SCHLAG_MS * 2);
    const seite = schlag % 2 === 0 ? 1 : -1;
    const stoss = Math.sin(Math.min(1, phase * 1.6) * Math.PI);
    return { schritt: stoss * seite * (Math.PI / 2), neigung: seite * 0.09 * stoss, huepf: stoss };
}

/**
 * Feuerwerk über dem Bild: alle 1,3 s steigt eine Rakete und platzt in eckige Funken.
 * Bildschirmfest wie die Laser — man sieht es überall in der Welt.
 */
export function zeichneFeuerwerk(ctx, canvas, now, staerke, detail) {
    if (!(staerke > 0.3)) return;
    const DAUER = 1700;
    const ABSTAND = 1300;
    const funken = Math.max(8, Math.round(20 * detail));
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const nr = Math.floor(now / ABSTAND);
    for (let k = nr - 1; k <= nr; k++) {
        const t = (now - k * ABSTAND) / DAUER;
        if (t < 0 || t >= 1) continue;
        const [r, g, b] = FARBEN[Math.floor(weltHash(k, 3, 301) * FARBEN.length)];
        const x = Math.round(canvas.width * (0.1 + weltHash(k, 1, 302) * 0.8));
        const y = Math.round(canvas.height * (0.14 + weltHash(k, 2, 303) * 0.3));
        if (t < 0.22) {
            // Aufstieg: kurzer Schweif aus drei Punkten
            const hoch = 1 - t / 0.22;
            for (let i = 0; i < 3; i++) {
                ctx.fillStyle = `rgba(255, 240, 200, ${(0.8 - i * 0.25) * staerke})`;
                ctx.fillRect(x - 2, Math.round(y + hoch * 220 + i * 12), 4, 8);
            }
            continue;
        }
        const u = (t - 0.22) / 0.78;
        const weite = (1 - Math.pow(1 - u, 3)) * (90 + weltHash(k, 4, 304) * 70);
        const fall = u * u * 46;
        const alpha = Math.max(0, 1 - u * u) * staerke;
        for (let i = 0; i < funken; i++) {
            const w = (i / funken) * Math.PI * 2 + weltHash(k, i, 305) * 0.3;
            const lang = weite * (0.55 + weltHash(k, i, 306) * 0.45);
            // Funkeln: jeder zweite Funke setzt abwechselnd aus
            if (u > 0.5 && ((Math.floor(now / 90) + i) & 1)) continue;
            const px = Math.round((x + Math.cos(w) * lang) / 4) * 4;
            const py = Math.round((y + Math.sin(w) * lang + fall) / 4) * 4;
            ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
            ctx.fillRect(px, py, 4, 4);
            if (u < 0.35) {
                ctx.fillStyle = `rgba(255,255,255,${alpha * 0.8})`;
                ctx.fillRect(px, py, 2, 2);
            }
        }
    }
    ctx.restore();
}

/**
 * Discokugel über dem Dorfteich und ihre Lichtflecken auf dem Platz.
 *
 * `karte.flach(x, y)` stellt die Zeichenfläche auf einen Punkt am Boden ein,
 * `karte.aufrecht(x, y)` auf etwas, das dort steht; beide geben false zurück, wenn der
 * Punkt nicht zu sehen ist (Draufsicht: beide tun nichts und sagen true).
 */
export function zeichnePartyWelt(ctx, layout, karte, now, staerke) {
    const teich = layout?.teiche?.[0];
    if (!teich || !(staerke > 0.05)) return;
    const cx = teich.cx * T;
    const cy = teich.cy * T;
    const { phase, schlag } = partyTakt(now);
    const puls = 1 - phase;
    const zeit = now / 1000;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    // Lichtflecken: kreisen in verschiedenen Abständen um den Teich
    const FLECKEN = 14;
    for (let i = 0; i < FLECKEN; i++) {
        const abstand = 3 + weltHash(i, 1, 311) * 15;
        const tempo = (0.25 + weltHash(i, 2, 312) * 0.35) * (i % 2 ? 1 : -1);
        const w = zeit * tempo + weltHash(i, 3, 313) * Math.PI * 2;
        const x = Math.round((cx + Math.cos(w) * abstand * T) / U) * U;
        const y = Math.round((cy + Math.sin(w) * abstand * T * 0.6) / U) * U;
        if (!karte.flach(x, y)) continue;
        const [r, g, b] = FARBEN[(i + schlag) % FARBEN.length];
        const a = (0.16 + 0.12 * puls) * staerke;
        const rad = T * (0.55 + weltHash(i, 4, 314) * 0.35);
        ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
        ctx.fillRect(x - rad, y - rad * 0.28, rad * 2, rad * 0.56);
        ctx.fillRect(x - rad * 0.7, y - rad * 0.48, rad * 1.4, rad * 0.96);
    }
    ctx.restore();

    // Die Kugel selbst: schwebt über der Teichmitte, Facetten wandern, einzelne blitzen im Takt
    if (!karte.aufrecht(cx, cy)) return;
    ctx.save();
    ctx.globalAlpha = Math.min(1, staerke * 1.5);
    const R = 9; // Radius in Kugelpunkten
    const schweb = Math.round(Math.sin(zeit * 1.3) * 2) * KP;
    const kx = cx;
    const ky = cy - 4.2 * T + schweb;
    // Schatten auf dem Wasser
    ctx.fillStyle = "rgba(10, 20, 40, 0.28)";
    ctx.fillRect(kx - 7 * KP, cy - KP, 14 * KP, 3 * KP);
    ctx.fillRect(kx - 5 * KP, cy - 2 * KP, 10 * KP, 5 * KP);
    const dreh = Math.floor(zeit * 5);
    for (let j = -R; j < R; j++) {
        const halb = Math.round(Math.sqrt(R * R - (j + 0.5) * (j + 0.5)));
        for (let i = -halb; i < halb; i++) {
            const rand = i === -halb || i === halb - 1 || j === -R || j === R - 1;
            // Facetten: 2×2-Punkte-Kacheln, die Reihe für Reihe versetzt wandern
            const fi = Math.floor((i + dreh + (Math.floor(j / 2) & 1)) / 2);
            const fj = Math.floor(j / 2);
            const wurf = weltHash(fi, fj, 321);
            let farbe;
            if (rand) farbe = "#4b5563";
            else if (wurf < 0.12 * (0.4 + puls)) {
                const [r, g, b] = FARBEN[Math.abs(fi + fj + schlag) % FARBEN.length];
                farbe = `rgb(${r},${g},${b})`;
            } else if (wurf > 0.82) farbe = "#ffffff";
            else farbe = (i + j < -3) ? "#e5e7eb" : (i + j > 5 ? "#9ca3af" : "#cbd5e1");
            ctx.fillStyle = farbe;
            ctx.fillRect(kx + i * KP, ky + j * KP, KP + 0.5, KP + 0.5);
        }
    }
    // Funkeln rund um die Kugel, im Takt
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 6; i++) {
        if (weltHash(i, schlag, 322) > 0.55) continue;
        const w = weltHash(i, schlag, 323) * Math.PI * 2;
        const d = (R + 3 + phase * 6) * KP;
        const sx = Math.round((kx + Math.cos(w) * d) / U) * U;
        const sy = Math.round((ky + Math.sin(w) * d) / U) * U;
        ctx.fillStyle = `rgba(255,255,255,${0.9 * puls * staerke})`;
        ctx.fillRect(sx - U, sy, 3 * U, U);
        ctx.fillRect(sx, sy - U, U, 3 * U);
    }
    ctx.restore();
}
