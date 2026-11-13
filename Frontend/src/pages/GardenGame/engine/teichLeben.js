// engine/teichLeben.js
// Leben auf den Teichen (10.11.): je Wetter etwas anderes auf dem Wasser, springende
// Fische, der Teichling (taucht selten im Dorfteich auf) und die Angel-Szene — der
// Schwimmer liegt jetzt im echten Teich statt in einem eigenen Fenster.
//
// Alles rechnet sich aus der Uhr und der Weltposition: kein Zustand, und alle in der
// Welt sehen dasselbe zur selben Zeit (der Teichling erscheint für jeden gleichzeitig).
//
// `karte.flach(x, y)` stellt die Zeichenfläche auf einen Punkt AUF dem Wasser ein,
// `karte.aufrecht(x, y)` auf etwas, das dort aus dem Wasser ragt. Beide geben false
// zurück, wenn der Punkt nicht zu sehen ist. Draufsicht: beide tun nichts (die Kamera
// steht schon), 2,5D: Projektion durch engine/welt3d.js.
import { TILE_SIZE, BODEN, weltHash } from "./MapConfig";
import { unitAusText } from "./Tageszeit";

const T = TILE_SIZE;
const U = 4; // ein Zeichenpunkt der Welt (wie WELT_PIXEL im Renderer)
const HELL = "184, 226, 240";

const raste = (v) => Math.round(v / U) * U;

/** Punkt im Teich aus zwei Zufallszahlen; null, wenn dort kein Wasser ist (Steg, Ufer). */
function teichPunkt(layout, t, u1, u2, bis = 0.8) {
    const w = u1 * Math.PI * 2;
    const r = Math.sqrt(u2) * bis;
    const x = raste(t.cx * T + Math.cos(w) * t.rx * T * r);
    const y = raste(t.cy * T + Math.sin(w) * t.ry * T * r);
    if (layout.bodenAn(Math.floor(x / T), Math.floor(y / T)) !== BODEN.WASSER) return null;
    return { x, y };
}

/** Eckiger Ring auf dem Wasser, Radius r (Weltpixel), halb so hoch wie breit. */
function ring(ctx, x, y, r, alpha) {
    if (alpha <= 0.02) return;
    ctx.fillStyle = `rgba(${HELL}, ${alpha.toFixed(3)})`;
    const rr = raste(r);
    const h = raste(r * 0.5);
    const b = Math.max(U, raste(rr * 1.1));
    ctx.fillRect(x - b / 2, y - h, b, U);
    ctx.fillRect(x - b / 2, y + h, b, U);
    ctx.fillRect(x - rr, y - h + U, U, Math.max(U, 2 * h - U));
    ctx.fillRect(x + rr - U, y - h + U, U, Math.max(U, 2 * h - U));
}

// ─── Wetter auf dem Wasser ───────────────────────────────────────────────────

/** Regen und Gewitter: Tropfenringe, bei Gewitter mehr und größer. */
function regenRinge(ctx, layout, karte, now, staerke, gewitter) {
    const DAUER = gewitter ? 620 : 800;
    layout.teiche.forEach((t, ti) => {
        const anzahl = Math.round((ti === 0 ? 20 : 6) * staerke * (gewitter ? 1.5 : 1));
        for (let i = 0; i < anzahl; i++) {
            const lauf = now + weltHash(ti, i, 401) * DAUER;
            const runde = Math.floor(lauf / DAUER);
            const u = (lauf % DAUER) / DAUER;
            const p = teichPunkt(layout, t, weltHash(i + ti * 50, runde, 402), weltHash(i + ti * 50, runde, 403), 0.92);
            if (!p || !karte.flach(p.x, p.y)) continue;
            ring(ctx, p.x, p.y, U + u * (gewitter ? 18 : 12), (1 - u) * 0.75);
            if (u < 0.25) {
                ctx.fillStyle = `rgba(${HELL}, 0.9)`;
                ctx.fillRect(p.x - U / 2, p.y - U - raste((0.25 - u) * 24), U, U);
            }
        }
    });
}

/** Schnee: Eisschollen treiben langsam auf dem Wasser. */
function eisSchollen(ctx, layout, karte, now, staerke) {
    const zeit = now / 1000;
    layout.teiche.forEach((t, ti) => {
        const anzahl = ti === 0 ? 11 : 4;
        for (let i = 0; i < anzahl; i++) {
            const p = teichPunkt(layout, t, weltHash(ti, i, 411), weltHash(ti, i, 412), 0.78);
            if (!p) continue;
            const x = p.x + raste(Math.sin(zeit * 0.12 + i * 1.7) * 14);
            const y = p.y + raste(Math.cos(zeit * 0.09 + i) * 6);
            if (!karte.flach(x, y)) continue;
            const b = (5 + Math.floor(weltHash(ti, i, 413) * 6)) * U;
            const h = (2 + Math.floor(weltHash(ti, i, 414) * 2)) * U;
            const a = Math.min(1, staerke * 1.4);
            ctx.fillStyle = `rgba(120, 160, 190, ${(0.55 * a).toFixed(3)})`;
            ctx.fillRect(x - b / 2, y - h / 2 + U, b, h);
            ctx.fillStyle = `rgba(232, 244, 252, ${(0.95 * a).toFixed(3)})`;
            ctx.fillRect(x - b / 2 + U, y - h / 2, b - 2 * U, h);
            ctx.fillRect(x - b / 2, y - h / 2 + U, b, h - U);
            ctx.fillStyle = `rgba(255, 255, 255, ${a.toFixed(3)})`;
            ctx.fillRect(x - b / 2 + 2 * U, y - h / 2 + U, Math.max(U, b / 3), U);
        }
    });
}

/** Nacht und Mondlicht: der Mond spiegelt sich als flirrende Bahn im Dorfteich. */
function mondBahn(ctx, layout, karte, now, staerke) {
    const t = layout.teiche[0];
    const x0 = raste((t.cx - t.rx * 0.45) * T);
    const y0 = raste((t.cy - t.ry * 0.55) * T);
    const takt = Math.floor(now / 260);
    for (let i = 0; i < 12; i++) {
        const y = y0 + i * 3 * U;
        const breite = (2 + Math.floor(weltHash(i, takt, 421) * (3 + i * 0.5))) * U;
        const x = x0 + raste((weltHash(i, takt, 422) - 0.5) * (8 + i * 3));
        if (layout.bodenAn(Math.floor(x / T), Math.floor(y / T)) !== BODEN.WASSER) continue;
        if (!karte.flach(x, y)) continue;
        ctx.fillStyle = `rgba(255, 246, 200, ${(staerke * (0.75 - i * 0.045)).toFixed(3)})`;
        ctx.fillRect(x - breite / 2, y, breite, U);
    }
    // Mondscheibe am oberen Ende der Bahn
    if (karte.flach(x0, y0 - 3 * U)) {
        ctx.fillStyle = `rgba(255, 250, 220, ${(staerke * 0.8).toFixed(3)})`;
        ctx.fillRect(x0 - 2 * U, y0 - 5 * U, 4 * U, 3 * U);
        ctx.fillRect(x0 - 3 * U, y0 - 4 * U, 6 * U, U);
    }
}

/** Sonne: einzelne Lichtpunkte blitzen auf dem Wasser. */
function glitzern(ctx, layout, karte, now) {
    const takt = Math.floor(now / 420);
    layout.teiche.forEach((t, ti) => {
        const anzahl = ti === 0 ? 10 : 3;
        for (let i = 0; i < anzahl; i++) {
            const p = teichPunkt(layout, t, weltHash(i + ti * 30, takt, 431), weltHash(i + ti * 30, takt, 432), 0.85);
            if (!p || !karte.flach(p.x, p.y)) continue;
            ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
            ctx.fillRect(p.x - U, p.y, 3 * U, U);
            ctx.fillRect(p.x, p.y - U, U, 3 * U);
        }
    });
}

/** Ab und zu springt ein Fisch: Bogen aus dem Wasser, Ring beim Ab- und Eintauchen. */
function fischSprung(ctx, layout, karte, now, haeufig) {
    const RUNDE = 5200;
    const DAUER = 900;
    layout.teiche.forEach((t, ti) => {
        const lauf = now + ti * 1700;
        const runde = Math.floor(lauf / RUNDE);
        if (weltHash(ti, runde, 441) > (haeufig ? 0.85 : 0.45)) return;
        const u = (lauf % RUNDE) / DAUER;
        if (u > 1.5) return;
        const p = teichPunkt(layout, t, weltHash(ti, runde, 442), weltHash(ti, runde, 443), 0.6);
        if (!p) return;
        const s = weltHash(ti, runde, 444) < 0.5 ? 1 : -1;
        const weit = 11 * U;
        if (u <= 1) {
            const x = p.x + raste(s * weit * (u - 0.5));
            const y = p.y - raste(Math.sin(u * Math.PI) * 9 * U);
            if (karte.flach(x, y)) {
                // Fisch kippt im Bogen: erst Kopf hoch, dann Kopf runter
                const kipp = u < 0.5 ? -U : U;
                ctx.fillStyle = "#8fb3c4";
                ctx.fillRect(x - 3 * U, y - U, 6 * U, 2 * U);
                ctx.fillStyle = "#dfeef4";
                ctx.fillRect(x - 2 * U, y, 4 * U, U);
                ctx.fillStyle = "#5f8496";
                ctx.fillRect(x - s * 4 * U - (s > 0 ? U : 0), y - 2 * U - kipp, U, 4 * U);
                ctx.fillRect(x + s * 2 * U, y - U + kipp, 2 * U, U);
                ctx.fillStyle = "#1f2f3a";
                ctx.fillRect(x + s * 2 * U - (s > 0 ? 0 : U), y - U, U, U);
            }
        }
        // Ringe: beim Absprung und beim Eintauchen
        const start = p.x - raste(s * weit * 0.5);
        const ende = p.x + raste(s * weit * 0.5);
        if (u < 0.7 && karte.flach(start, p.y)) ring(ctx, start, p.y, U * 2 + u * 22, (0.7 - u) * 1.1);
        if (u > 0.9 && karte.flach(ende, p.y)) ring(ctx, ende, p.y, U * 2 + (u - 0.9) * 34, (1.5 - u) * 1.3);
    });
}

// ─── Der Teichling ───────────────────────────────────────────────────────────

const TEICHLING_FENSTER = 6 * 60 * 1000;
const TEICHLING_DAUER = 34000;
/** Wie oft er sich je Fenster (6 Minuten) zeigt — bei Gewitter und Mondlicht viel öfter. */
const TEICHLING_CHANCE = { sun: 0.2, rain: 0.35, thunder: 0.8, moonlight: 0.55, snow: 0 };
let erzwungenAb = 0;

/** Nur für Prüfstände: den Teichling jetzt auftauchen lassen. */
export function zeigeTeichling(now = Date.now()) {
    erzwungenAb = now;
}

/** Zeigt sich der Teichling gerade? Gibt die Sekunden seit dem Auftauchen zurück oder null. */
export function teichlingStand(now, wetter) {
    if (erzwungenAb && now - erzwungenAb < TEICHLING_DAUER) return { t: (now - erzwungenAb) / 1000, saat: 7 };
    const nr = Math.floor(now / TEICHLING_FENSTER);
    const chance = TEICHLING_CHANCE[wetter] ?? TEICHLING_CHANCE.sun;
    if (unitAusText(`teichling:${nr}`) >= chance) return null;
    const start = nr * TEICHLING_FENSTER + unitAusText(`teichlingstart:${nr}`) * (TEICHLING_FENSTER - TEICHLING_DAUER);
    const t = now - start;
    if (t < 0 || t >= TEICHLING_DAUER) return null;
    return { t: t / 1000, saat: nr % 97 };
}

/** Weltpixel je Zeichenpunkt des Teichlings — gröber als das Wasser, damit man ihn auch von Weitem sieht. */
const TEICHLING_PUNKT = 6;
let teichlingFlaeche = null;
const TL = { umriss: "#14302c", koerper: "#2f6f62", licht: "#4fa08a", bauch: "#cfe3b4", zacke: "#e0b24a", auge: "#ffd84a" };

function teichling(ctx, layout, karte, stand, now) {
    const t0 = layout.teiche[0];
    const { t, saat } = stand;
    const zeit = now / 1000;
    // Bahn: gemächlich durch die Nordhälfte des Teichs — der Steg liegt im Süden
    const bahn = t * 0.11 + saat;
    const x = raste(t0.cx * T + Math.sin(bahn) * t0.rx * T * 0.45);
    const y = raste((t0.cy - t0.ry * 0.3) * T + Math.cos(bahn * 1.7) * t0.ry * T * 0.1);
    const s = Math.cos(bahn) >= 0 ? 1 : -1;
    // Wie weit er aus dem Wasser ragt: 0 = untergetaucht, 1 = ganz oben
    const hoch = Math.max(0, Math.min(1, t < 4 ? 0 : t < 6.5 ? (t - 4) / 2.5 : t < 27 ? 1 : 1 - (t - 27) / 3.5));

    // Blasen vor dem Auftauchen und nach dem Abtauchen
    if ((t < 5 || t > 29) && karte.flach(x, y)) {
        for (let i = 0; i < 7; i++) {
            const u = ((zeit * 0.9 + i * 0.37) % 1);
            const bx = x + raste((weltHash(i, 1, 451) - 0.5) * 60);
            const by = y + raste((weltHash(i, 2, 452) - 0.5) * 22);
            ring(ctx, bx, by, U + u * 6, (1 - u) * 0.8);
        }
        ctx.fillStyle = "rgba(14, 34, 50, 0.3)";
        ctx.fillRect(x - 12 * U, y - 2 * U, 24 * U, 4 * U);
    }
    if (hoch <= 0) return;
    // Ringe um den Hals
    if (karte.flach(x, y)) {
        const u = (zeit * 0.7) % 1;
        ring(ctx, x, y, 5 * U + u * 26, (1 - u) * 0.7);
        ring(ctx, x - s * 22 * TEICHLING_PUNKT, y, 4 * U + ((u + 0.5) % 1) * 18, (1 - ((u + 0.5) % 1)) * 0.5);
    }
    if (!karte.aufrecht(x, y)) return;

    // Der Teichling wird auf eine kleine eigene Fläche gemalt (ein Zeichenpunkt = ein
    // Bildpunkt) und dann hart vergrößert in die Welt gesetzt — Reihe für Reihe direkt in
    // die Welt gemalt gäbe es bei krummem Zoom Fugen zwischen den Reihen. Die Unterkante
    // der Fläche ist die Wasserlinie: was darunter läge, ist einfach abgeschnitten.
    const BW = 120, BH = 34, MITTE = 62;
    if (!teichlingFlaeche) {
        teichlingFlaeche = document.createElement("canvas");
        teichlingFlaeche.width = BW;
        teichlingFlaeche.height = BH;
    }
    const g = teichlingFlaeche.getContext("2d");
    g.clearRect(0, 0, BW, BH);
    // `r` rechnet ab der Wasserlinie (y nach oben negativ) und spiegelt mit der Blickrichtung
    const r = (farbe, ux, uy, uw, uh) => {
        const w = Math.max(1, Math.round(uw));
        const l = Math.round(ux);
        g.fillStyle = farbe;
        g.fillRect(MITTE + (s > 0 ? l : -(l + w)), BH + Math.round(uy), w, Math.max(1, Math.round(uh)));
    };

    // Buckel hinter dem Kopf: tauchen nacheinander auf und ab
    for (let i = 0; i < 3; i++) {
        const welle = Math.sin(zeit * 1.8 - i * 1.3);
        const hh = Math.round((1.5 + 2.2 * (welle * 0.5 + 0.5)) * hoch);
        if (hh < 1) continue;
        const bx = -(13 + i * 11);
        const breite = 10 - i * 2;
        for (let j = 0; j < hh; j++) {
            const w = Math.max(2, Math.round(breite * Math.sqrt(1 - (j / (hh + 0.5)) ** 2) / 2) * 2);
            r(TL.umriss, bx - w / 2 - 1, -j - 1, w + 2, 1);
            r(j === hh - 1 ? TL.licht : TL.koerper, bx - w / 2, -j - 1, w, 1);
        }
        r(TL.umriss, bx - 2, -hh - 1, 4, 1);
        r(TL.zacke, bx - 1, -hh - 2, 2, 1);
    }
    // Schwanzspitze
    const flosse = Math.sin(zeit * 1.8 - 4.2);
    if (flosse > 0.2 && hoch > 0.6) {
        r(TL.umriss, -49, -4, 4, 4); r(TL.koerper, -48, -3, 2, 3); r(TL.zacke, -50, -5, 2, 2);
    }

    // Hals und Kopf: sinken beim Ab- und Auftauchen unter die Wasserlinie
    const HALS = 13;
    const tief = Math.round((1 - hoch) * (HALS + 9));
    const wiegen = (j) => Math.round((j / HALS) ** 2 * 4 + Math.sin(zeit * 1.4 + j * 0.25) * 0.8);
    for (let j = 0; j < HALS; j++) {
        const ux = wiegen(j);
        const uy = -j - 1 + tief;
        const dick = j < 4 ? 6 : 4;
        r(TL.umriss, ux - dick / 2 - 1, uy, dick + 2, 1);
        r(TL.koerper, ux - dick / 2, uy, dick, 1);
        r(TL.licht, ux - dick / 2, uy, 1, 1);
        r(TL.bauch, ux + dick / 2 - 2, uy, 2, 1);
        if (j % 3 === 1) r(TL.zacke, ux - dick / 2 - 2, uy, 1, 1);
    }
    const kx = wiegen(HALS);
    const ky = -HALS - 5 + tief;
    // Kopf: Schädel, Schnauze nach vorn, Kamm hinten
    r(TL.umriss, kx - 4, ky - 1, 9, 7);
    r(TL.umriss, kx + 4, ky + 1, 5, 5);
    r(TL.koerper, kx - 3, ky, 7, 5);
    r(TL.koerper, kx + 4, ky + 2, 4, 3);
    r(TL.licht, kx - 3, ky, 7, 1);
    r(TL.bauch, kx + 1, ky + 4, 6, 1);
    r(TL.zacke, kx - 5, ky - 2, 2, 2); r(TL.zacke, kx - 2, ky - 3, 2, 2);
    r(TL.umriss, kx + 7, ky + 2, 1, 1); // Nasenloch
    // Auge: blinzelt ab und zu
    const zu = (zeit + saat) % 3.7 < 0.16;
    if (zu) r(TL.umriss, kx + 1, ky + 2, 2, 1);
    else { r(TL.auge, kx + 1, ky + 1, 2, 2); r(TL.umriss, kx + 2, ky + 1, 1, 2); }
    // Gischt an der Wasserlinie
    const gischt = Math.floor(zeit * 5) % 2;
    r("#b8e2f0", -6 + gischt, -1, 4, 1);
    r("#b8e2f0", 2 - gischt, -1, 4, 1);

    const glatt = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(teichlingFlaeche, x - MITTE * TEICHLING_PUNKT, y - BH * TEICHLING_PUNKT, BW * TEICHLING_PUNKT, BH * TEICHLING_PUNKT);
    ctx.imageSmoothingEnabled = glatt;
}

/**
 * Alles, was auf den Teichen passiert. Wird direkt nach dem Boden gezeichnet.
 * @param {object} o  { now, wetter, intensitaet 0..1, nacht 0..1, einfach (Sparmodus) }
 */
export function zeichneTeichLeben(ctx, layout, karte, o) {
    if (!layout?.teiche?.length || !layout.bodenAn || o.einfach) return;
    const { now, wetter } = o;
    const staerke = Math.max(0, Math.min(1, Number(o.intensitaet) || 0));
    const nacht = Math.max(0, Math.min(1, (Number(o.nacht) || 0) / 0.7));
    if (wetter === "snow" && staerke > 0.05) {
        eisSchollen(ctx, layout, karte, now, staerke);
    } else {
        if ((wetter === "rain" || wetter === "thunder") && staerke > 0.05) {
            regenRinge(ctx, layout, karte, now, staerke, wetter === "thunder");
        } else if (wetter === "moonlight" || nacht > 0.35) {
            mondBahn(ctx, layout, karte, now, wetter === "moonlight" ? 1 : nacht * 0.8);
        } else if (nacht < 0.15) {
            glitzern(ctx, layout, karte, now);
        }
        fischSprung(ctx, layout, karte, now, wetter === "rain" || wetter === "thunder");
        const stand = teichlingStand(now, wetter);
        if (stand) teichling(ctx, layout, karte, stand, now);
    }
}

// ─── Angeln im Teich ─────────────────────────────────────────────────────────

/** Wo der Schwimmer landet: zufällig im Wasser vor dem Stegkopf (Weltpixel). */
export function angelWurfZiel(layout) {
    const t = layout?.teiche?.[0];
    if (!t) return null;
    for (let i = 0; i < 12; i++) {
        const x = raste((t.cx + (Math.random() - 0.5) * 7) * T);
        const y = raste((t.cy - 0.6 - Math.random() * 1.8) * T);
        if (layout.bodenAn(Math.floor(x / T), Math.floor(y / T)) === BODEN.WASSER) return { x, y };
    }
    return { x: raste(t.cx * T), y: raste((t.cy - 1.5) * T) };
}

/** Punkt der aktuellen Zeichenfläche in Gerätepunkten, samt Maßstab. */
function geraet(ctx, x, y) {
    const m = ctx.getTransform();
    return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f, s: Math.abs(m.a) || 1, k: Math.abs(m.d / (m.a || 1)) || 1 };
}

const RING_FARBE = { gut: "#6fd46a", perfekt: "#ffd84a", daneben: "#e8403a" };
const RING_TEXT = { gut: "Gut!", perfekt: "Perfekt!", daneben: "Daneben" };
/**
 * Tasten-Zeichen 7×7 für die Ringe (ein Zeichen = ein Punkt): Buchstaben rund um WASD,
 * „leer“ = Leertaste als Balken. Kennungen wie RING_TASTEN in ui/fenster/AngelFenster.jsx.
 */
const TASTEN_BILD = {
    q: ["..###..", ".#...#.", ".#...#.", ".#...#.", ".#.#.#.", ".#..#..", "..##.#."],
    w: [".#...#.", ".#...#.", ".#...#.", ".#.#.#.", ".#.#.#.", ".##.##.", ".#...#."],
    e: [".#####.", ".#.....", ".#.....", ".####..", ".#.....", ".#.....", ".#####."],
    a: ["..###..", ".#...#.", ".#...#.", ".#####.", ".#...#.", ".#...#.", ".#...#."],
    s: ["..####.", ".#.....", ".#.....", "..###..", ".....#.", ".....#.", ".####.."],
    d: [".####..", ".#...#.", ".#...#.", ".#...#.", ".#...#.", ".#...#.", ".####.."],
    f: [".#####.", ".#.....", ".#.....", ".####..", ".#.....", ".#.....", ".#....."],
    leer: [".......", ".......", "#.....#", "#.....#", "#######", ".......", "......."],
};

/** Ellipsen-Umriss aus Quadraten: Mitte (x, y), Radius r, senkrecht mit k gestaucht, Punktgröße p. */
function ringUmriss(ctx, x, y, r, k, p, farbe) {
    const n = Math.max(12, Math.min(80, Math.round((2 * Math.PI * r) / (p * 1.15))));
    ctx.fillStyle = farbe;
    const g = Math.ceil(p);
    for (let i = 0; i < n; i++) {
        const w = (i / n) * Math.PI * 2;
        ctx.fillRect(Math.round(x + Math.cos(w) * r - p / 2), Math.round(y + Math.sin(w) * r * 0.5 * k - p / 2), g, g);
    }
}

/**
 * Angel, Schnur und Schwimmer — und die Rhythmus-Ringe.
 * `szene`: { zustand, ziel {x, y}, wurfAb, bissUm, ring, ergebnisse, anzahl, blitz } aus
 * ui/fenster/AngelFenster.jsx. Der Renderer trägt `szene.schwimmer` ein (Lage im Bild) —
 * von dort fliegt der gefangene Fisch in die Bildmitte.
 * Gezeichnet wird in Gerätepunkten — Angel (steht) und Schwimmer (liegt) haben in der
 * 2,5D-Ansicht verschiedene Zeichenflächen, die Schnur verbindet beide.
 */
export function zeichneAngelSzene(ctx, karte, szene, spieler, now) {
    if (!szene?.ziel) return;
    const { zustand, ziel } = szene;
    const s = ziel.x >= spieler.x ? 1 : -1;
    ctx.save();
    if (!karte.aufrecht(spieler.x, spieler.y + 20)) { ctx.restore(); return; }
    const hand = geraet(ctx, spieler.x + s * 16, spieler.y - 2);
    const spitze = geraet(ctx, spieler.x + s * 34, spieler.y - 66);
    const u = Math.max(1, hand.s * 4);

    let liegt = null;
    const imWasser = zustand === "wartet" || zustand === "zieht" || zustand === "ringe" || zustand === "holt";
    let flug = 1;
    if (imWasser) {
        flug = Math.max(0, Math.min(1, (now - (szene.wurfAb || 0)) / 480));
        if (karte.flach(ziel.x, ziel.y)) liegt = geraet(ctx, ziel.x, ziel.y);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;

    // Angel: im Kampf mit dem Fisch biegt sie sich zum Schwimmer
    const kampf = zustand === "zieht" || zustand === "ringe" || zustand === "holt";
    const bieg = kampf ? 0.22 : 0;
    const sx = spitze.x + (liegt ? (liegt.x - spitze.x) * bieg * 0.3 : 0);
    const sy = spitze.y + (liegt ? Math.abs(liegt.y - spitze.y) * bieg * 0.25 : 0);
    ctx.lineCap = "butt";
    ctx.strokeStyle = "#3b2516";
    ctx.lineWidth = u * 1.6;
    ctx.beginPath(); ctx.moveTo(hand.x, hand.y); ctx.lineTo(sx, sy); ctx.stroke();
    ctx.strokeStyle = "#b07a45";
    ctx.lineWidth = u * 0.8;
    ctx.beginPath(); ctx.moveTo(hand.x, hand.y); ctx.lineTo(sx, sy); ctx.stroke();
    ctx.fillStyle = "#3b2516";
    ctx.fillRect(Math.round(hand.x - u), Math.round(hand.y - u), Math.round(u * 2), Math.round(u * 2));

    if (!liegt) { ctx.restore(); return; }
    // Schwimmer: fliegt im Bogen hinaus, liegt dann auf dem Wasser und wippt
    const p = liegt.s * U;
    let bx = sx + (liegt.x - sx) * flug;
    let by = sy + (liegt.y - sy) * flug - Math.sin(flug * Math.PI) * 90 * liegt.s;
    const zeit = now / 1000;
    const blitz = szene.blitz && now - szene.blitz.um < 520 ? szene.blitz : null;
    if (flug >= 1) {
        // Ruhig wippen; beim Anbiss zucken; nach einem Treffer kurz abtauchen
        const wipp = zustand === "zieht" ? (Math.floor(zeit * 9) % 2 ? 3 : 1)
            : blitz && now - blitz.um < 140 ? 3
                : kampf ? 1 : (Math.floor(zeit * 1.6) % 2);
        by += wipp * p * 0.5;
    }
    bx = Math.round(bx); by = Math.round(by);
    if (flug >= 1) szene.schwimmer = { x: bx, y: by };

    // Schnur: hängt durch, im Kampf straff
    const straff = kampf || flug < 1;
    ctx.strokeStyle = "rgba(240, 244, 248, 0.9)";
    ctx.lineWidth = Math.max(1, liegt.s);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo((sx + bx) / 2, (sy + by) / 2 + (straff ? 0 : 46 * liegt.s), bx, by - 2 * p);
    ctx.stroke();

    if (flug >= 1) {
        // Ringe auf dem Wasser: einer beim Aufkommen, laufend beim Anbiss
        const seit = (now - (szene.wurfAb || 0) - 480) / 700;
        const wellen = [];
        if (seit >= 0 && seit < 1) wellen.push(seit);
        if (zustand === "zieht") { wellen.push((zeit * 2.2) % 1); wellen.push((zeit * 2.2 + 0.5) % 1); }
        for (const q of wellen) ringUmriss(ctx, bx, by, (2 + q * 9) * p, liegt.k, p, `rgba(${HELL}, ${((1 - q) * 0.85).toFixed(3)})`);
        // Fischschatten schwimmt kurz vor dem Anbiss heran
        const bisBiss = (szene.bissUm || 0) - now;
        if (zustand === "wartet" && bisBiss > 0 && bisBiss < 1500) {
            const fern = bisBiss / 1500;
            const fx = Math.round(bx + (70 * fern + 6) * liegt.s);
            const fy = Math.round(by + (26 * fern + 4) * liegt.s * liegt.k);
            ctx.fillStyle = "rgba(20, 44, 62, 0.45)";
            ctx.fillRect(fx - 3 * p, fy - p, 6 * p, 2 * p);
            ctx.fillRect(fx - 2 * p, fy - 2 * p, 4 * p, 4 * p);
            ctx.fillRect(fx + 3 * p, fy - 2 * p, 2 * p, 4 * p);
        }
    }

    // ── Rhythmus-Ringe ──
    // Der feste Zielring liegt um den Schwimmer; der laufende Ring zieht sich von außen
    // zusammen und wird grün, solange ein Druck zählt.
    const ZIEL_R = 9 * p;
    const ring = zustand === "ringe" ? szene.ring : null;
    if (zustand === "ringe") {
        ringUmriss(ctx, bx, by, ZIEL_R, liegt.k, p, blitz ? RING_FARBE[blitz.art] : "rgba(255, 243, 196, 0.95)");
    }
    if (ring && now >= ring.ab) {
        const lauf = (now - ring.ab) / ring.dauerMs;
        const r = Math.max(2 * p, ZIEL_R + (1 - lauf) * 38 * p);
        const zaehlt = Math.abs(now - (ring.ab + ring.dauerMs)) <= ring.fensterMs;
        ringUmriss(ctx, bx, by, r, liegt.k, p * 1.5, zaehlt ? "#6fd46a" : "#ffffff");
    }

    // Der Schwimmer selbst: rot-weiß mit dunklem Rand
    ctx.fillStyle = "#2b1d12";
    ctx.fillRect(bx - 2 * p, by - 4 * p, 4 * p, 5 * p);
    ctx.fillStyle = "#e8403a";
    ctx.fillRect(bx - p, by - 3 * p, 2 * p, 2 * p);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(bx - p, by - p, 2 * p, p);
    ctx.fillStyle = "#2b1d12";
    ctx.fillRect(Math.round(bx - p / 2), by - 6 * p, Math.ceil(p), 2 * p);

    const q = Math.max(2, Math.round(liegt.s * 3));
    if (zustand === "zieht") {
        // Ausrufezeichen über dem Schwimmer, springt im Takt
        const ay = by - 9 * p - (Math.floor(zeit * 8) % 2) * q - 12 * q;
        ctx.fillStyle = "#2b1d12";
        ctx.fillRect(bx - 4 * q, ay - q, 8 * q, 12 * q);
        ctx.fillStyle = "#ffe066";
        ctx.fillRect(bx - 3 * q, ay, 6 * q, 10 * q);
        ctx.fillStyle = "#2b1d12";
        ctx.fillRect(bx - q, ay + q, 2 * q, 5 * q);
        ctx.fillRect(bx - q, ay + 7 * q, 2 * q, 2 * q);
    }
    if (zustand === "ringe") {
        const oben = by - ZIEL_R * 0.5 * liegt.k - 16 * q;
        // Welche Taste: Schild über dem Schwimmer
        if (ring) {
            const bild = TASTEN_BILD[ring.taste] || TASTEN_BILD.leer;
            const wartet = now < ring.ab;
            ctx.globalAlpha = wartet ? 0.55 : 1;
            ctx.fillStyle = "#2b1d12";
            ctx.fillRect(bx - 6 * q, oben - 6 * q, 12 * q, 12 * q);
            ctx.fillStyle = "#fff3c4";
            ctx.fillRect(bx - 5 * q, oben - 5 * q, 10 * q, 10 * q);
            ctx.fillStyle = "#e8d7a8";
            ctx.fillRect(bx - 5 * q, oben + 4 * q, 10 * q, q);
            ctx.fillStyle = "#2b1d12";
            for (let j = 0; j < 7; j++) for (let i = 0; i < 7; i++) {
                if (bild[j][i] === "#") ctx.fillRect(bx + (i - 3.5) * q, oben + (j - 3.5) * q, q, q);
            }
            ctx.globalAlpha = 1;
        }
        // Zählpunkte: getroffen, perfekt, daneben, offen
        const n = Math.max(1, szene.anzahl || 1);
        if (n > 1) {
            const breite = n * 3 * q - q;
            for (let i = 0; i < n; i++) {
                const art = szene.ergebnisse?.[i];
                const x = Math.round(bx - breite / 2 + i * 3 * q);
                ctx.fillStyle = "#2b1d12";
                ctx.fillRect(x - q / 2, oben - 10 * q - q / 2, 3 * q, 3 * q);
                ctx.fillStyle = art ? RING_FARBE[art] : "#8a6a4a";
                ctx.fillRect(x, oben - 10 * q, 2 * q, 2 * q);
            }
        }
    }
    // „Perfekt!“ / „Gut!“ / „Daneben“ steigt kurz auf
    if (blitz && (zustand === "ringe" || zustand === "holt")) {
        const t = (now - blitz.um) / 520;
        ctx.globalAlpha = Math.min(1, (1 - t) * 2);
        ctx.font = `bold ${Math.round(6 * q)}px 'Pixelify Sans', Nunito, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const ty = by + ZIEL_R * 0.5 * liegt.k + 9 * q - t * 3 * q;
        ctx.fillStyle = "#2b1d12";
        ctx.fillText(RING_TEXT[blitz.art] || "", bx + q / 2, ty + q / 2);
        ctx.fillStyle = RING_FARBE[blitz.art] || "#ffffff";
        ctx.fillText(RING_TEXT[blitz.art] || "", bx, ty);
        ctx.globalAlpha = 1;
    }
    ctx.restore();
}
