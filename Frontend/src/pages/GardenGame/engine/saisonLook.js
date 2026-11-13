// engine/saisonLook.js
// Wie die Jahreszeit aussieht — Bodenspuren, Farbton, Partikel in der Luft.
//
// Welche Saison läuft, entscheidet engine/Tageszeit.js (aus der Uhr, Spiegel des
// Servers). Der Renderer reicht hier nur Leinwand, Sicht und Saison-Id herein.
//
// Drei Schichten, jede mit eigenem Platz im Bild:
//   Boden  Weltraum, nach dem Untergrund und vor Pflanzen (wie Pfützen/Schneehaufen)
//          — liegt still an seiner Stelle, wenn man läuft.
//   Ton    Bildschirm, über der Welt und UNTER dem Nachtschleier — nachts wird der
//          Herbst also mit dunkler, statt über der Dunkelheit zu leuchten.
//   Luft   Bildschirm, fallendes Laub/Blüten/Flocken, ebenfalls unter dem Schleier.
//
// Positionen kommen aus einem Rasterhash bzw. aus der Bildnummer, nie aus
// Math.random: dasselbe Blatt liegt in jedem Bild an derselben Stelle.

const LAUB = ["#c2410c", "#ea580c", "#b45309", "#a16207", "#9a3412", "#dc2626"];
const BLUETEN = ["#f9a8d4", "#fbcfe8", "#fdf2f8", "#f472b6"];
const SOMMERBLUMEN = ["#facc15", "#fde047", "#fb923c"];

/** Farbton je Saison — weich über alles gelegt (soft-light), flach statt Glanz. */
const TON = {
    fruehling: "rgba(190, 255, 170, 0.26)",
    sommer: "rgba(255, 196, 70, 0.40)",
    herbst: "rgba(255, 118, 30, 0.40)",
    winter: "rgba(170, 205, 255, 0.42)",
};
/** Zusätzlicher deckender Hauch — Winter bekommt Raureif, Sommer flimmernde Wärme. */
const HAUCH = {
    sommer: "rgba(255, 236, 170, 0.06)",
    winter: "rgba(236, 245, 255, 0.17)",
};

function rasterHash(gx, gy, salz) {
    let h = Math.imul(gx | 0, 374761393) ^ Math.imul(gy | 0, 668265263) ^ Math.imul(salz | 0, 2246822507);
    h ^= h >>> 13; h = Math.imul(h, 1274126177); h ^= h >>> 16;
    return h >>> 0;
}

/**
 * Bodenspuren der Saison im Rechteck [loX..hiX]×[loY..hiY] (Weltkoordinaten).
 * `bounds` begrenzt zusätzlich auf ein Grundstück — sonst deckt dessen Rasen die
 * Spuren zu (dieselbe Lage wie bei _drawWeatherGround).
 */
export function zeichneSaisonBoden(ctx, saison, sicht, tile, wetterTyp) {
    if (!saison) return;
    // Bei echtem Schneewetter liegen schon Schneehaufen — keine zweite Schicht.
    if (saison === "winter" && wetterTyp === "snow") return;
    const stride = tile * 2;
    const { loX, hiX, loY, hiY, maxX, maxY } = sicht;
    const startX = Math.floor(loX / stride) * stride;
    const startY = Math.floor(loY / stride) * stride;
    const dichte = { herbst: 0.85, winter: 0.5, fruehling: 0.5, sommer: 0.45 }[saison] || 0.3;
    const salz = sicht.salz | 0;

    ctx.save();
    for (let gy = startY; gy < hiY; gy += stride) {
        if (gy < 0 || gy > maxY) continue;
        for (let gx = startX; gx < hiX; gx += stride) {
            if (gx < 0 || gx > maxX) continue;
            const h = rasterHash(gx / stride, gy / stride, 7 + salz);
            if (h / 4294967295 > dichte) continue;
            const x = gx + ((h >>> 3) & 0xff) / 255 * stride * 0.9;
            const y = gy + ((h >>> 11) & 0xff) / 255 * stride * 0.9;
            if (x < loX || x > hiX || y < loY || y > hiY) continue;
            const groesse = 0.6 + (((h >>> 19) & 0xff) / 255) * 0.7;

            if (saison === "herbst") {
                // Drei bis fünf Blätter je Fleck, jedes gedreht — ein Laubhäufchen.
                const n = 3 + (h % 3);
                for (let i = 0; i < n; i++) {
                    const hh = rasterHash(gx + i * 31, gy - i * 17, 11 + salz);
                    const bx = x + (((hh >>> 2) & 0x3f) - 32) * 0.5;
                    const by = y + (((hh >>> 9) & 0x3f) - 32) * 0.3;
                    const winkel = ((hh >>> 16) & 0xff) / 255 * Math.PI * 2;
                    zeichneBlatt(ctx, bx, by, tile * 0.17 * groesse, winkel, LAUB[hh % LAUB.length], 0.95);
                }
            } else if (saison === "winter") {
                zeichneHaufen(ctx, x, y, tile * 0.6 * groesse, "rgba(244, 249, 255, 0.6)", "rgba(255, 255, 255, 0.6)");
            } else if (saison === "sommer") {
                // Sonnenverbrannte Stellen im Rasen, dazu ein, zwei gelbe Blumen.
                zeichneHaufen(ctx, x, y, tile * 0.5 * groesse, "rgba(214, 186, 100, 0.38)", null);
                const n = 1 + (h & 1);
                for (let i = 0; i < n; i++) {
                    const hh = rasterHash(gx - i * 13, gy + i * 29, 5 + salz);
                    const bx = x + (((hh >>> 2) & 0x3f) - 32) * 0.6;
                    const by = y + (((hh >>> 9) & 0x3f) - 32) * 0.3;
                    zeichneBlume(ctx, bx, by, tile * 0.08 * groesse, SOMMERBLUMEN[hh % SOMMERBLUMEN.length]);
                }
            } else {
                // Frühling: Blütentupfer, vier bis fünf Blumen je Fleck.
                const farben = BLUETEN;
                const n = 4 + (h & 1);
                for (let i = 0; i < n; i++) {
                    const hh = rasterHash(gx - i * 13, gy + i * 29, 5 + salz);
                    const bx = x + (((hh >>> 2) & 0x3f) - 32) * 0.3;
                    const by = y + (((hh >>> 9) & 0x3f) - 32) * 0.18;
                    zeichneBlume(ctx, bx, by, tile * 0.07 * groesse, farben[hh % farben.length]);
                }
            }
        }
    }
    ctx.restore();
}

/** Raster der Bodenspuren und Flocken: alles rastet auf ganze Stücke dieser Größe ein. */
const PX = 4;
const raste = (v) => Math.round(v / PX) * PX;

/**
 * Flacher Haufen aus drei eckigen Lagen (Schnee, verbrannter Rasen) statt einer Ellipse —
 * passt zum Pixel-Boden. `rx` = halbe Breite, `kuppe` = Farbe der hellen Oberseite oder null.
 */
function zeichneHaufen(ctx, x, y, rx, farbe, kuppe) {
    const cx = raste(x);
    const cy = raste(y);
    const b = Math.max(PX * 2, raste(rx));
    const h = Math.max(PX, raste(rx * 0.4));
    ctx.fillStyle = farbe;
    ctx.fillRect(cx - b, cy - PX, b * 2, h);
    ctx.fillRect(cx - b + PX * 2, cy - PX - h / 2, b * 2 - PX * 4, h / 2);
    ctx.fillRect(cx - b + PX, cy - PX + h, b * 2 - PX * 2, PX);
    if (kuppe) {
        ctx.fillStyle = kuppe;
        ctx.fillRect(cx - b + PX * 3, cy - PX - h / 2, Math.max(PX, b - PX * 2), PX);
    }
}

/**
 * Blatt oder Blütenblatt aus Rechtecken. Statt frei zu drehen, kippt es durch vier Lagen
 * (quer, schräg, hoch, schräg) — das liest sich als Taumeln und bleibt eckig.
 */
function zeichneBlatt(ctx, x, y, laenge, winkel, farbe, alpha, rippe = true) {
    const p = Math.max(2, Math.round(laenge / 3));
    const lage = ((Math.floor(winkel / (Math.PI / 4)) % 4) + 4) % 4;
    const cx = Math.round(x);
    const cy = Math.round(y);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = farbe;
    if (lage === 0) {
        ctx.fillRect(cx - p * 2, cy - p / 2, p * 4, p);
        ctx.fillRect(cx - p, cy - p * 1.5, p * 2, p * 3);
    } else if (lage === 2) {
        ctx.fillRect(cx - p / 2, cy - p * 2, p, p * 4);
        ctx.fillRect(cx - p * 1.5, cy - p, p * 3, p * 2);
    } else {
        const s = lage === 1 ? 1 : -1;
        ctx.fillRect(cx - p * 1.5 * s - (s < 0 ? p * 2 : 0), cy - p * 1.5, p * 2, p * 2);
        ctx.fillRect(cx - p, cy - p, p * 2, p * 2);
        ctx.fillRect(cx + p * 0.5 * s - (s < 0 ? p : 0), cy + p * 0.5, p, p);
    }
    if (rippe) {
        // Dunkler Punkt in der Mitte, damit es als Blatt liest und nicht als Fleck
        ctx.fillStyle = "rgba(60, 25, 5, 0.45)";
        ctx.fillRect(cx - p / 2, cy - p / 2, p, p);
    }
    ctx.globalAlpha = 1;
}

/** Blume aus fünf Quadraten: vier Blütenblätter und eine gelbe Mitte. */
function zeichneBlume(ctx, x, y, r, farbe) {
    const p = Math.max(2, Math.round(r));
    const cx = Math.round(x);
    const cy = Math.round(y);
    ctx.fillStyle = farbe;
    ctx.fillRect(cx - p * 1.5, cy - p / 2, p * 3, p);
    ctx.fillRect(cx - p / 2, cy - p * 1.5, p, p * 3);
    ctx.fillStyle = "#facc15";
    ctx.fillRect(cx - p / 2, cy - p / 2, p, p);
}

/** Farbton der Saison über das ganze Bild. */
export function zeichneSaisonTon(ctx, canvas, saison) {
    const farbe = TON[saison];
    if (!farbe) return;
    ctx.save();
    ctx.globalCompositeOperation = "soft-light";
    ctx.fillStyle = farbe;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (HAUCH[saison]) {
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = HAUCH[saison];
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.restore();
}

/**
 * Was in der Luft liegt: Herbst Laub, Frühling Blüten, Winter Flocken, Sommer
 * schwebende Pollen. Die Spielerposition verschiebt alles mit (wie beim Regen),
 * damit es an der Welt hängt und nicht am Bildschirm klebt.
 */
export function zeichneSaisonLuft(ctx, canvas, saison, frame, player, particleScale, wetterTyp) {
    if (!saison) return;
    if (saison === "winter" && wetterTyp === "snow") return;
    const basis = { herbst: 22, fruehling: 18, winter: 45, sommer: 16 }[saison] || 0;
    const anzahl = Math.max(4, Math.round(basis * particleScale));
    const px = player ? player.x : 0;
    const py = player ? player.y : 0;
    const w = canvas.width + 60;
    const h = canvas.height + 60;

    ctx.save();
    for (let i = 0; i < anzahl; i++) {
        const seed = i * 97.13;
        let x; let y;
        if (saison === "sommer") {
            // Pollen steigen langsam und pendeln.
            const yRaw = -frame * (0.12 + (i % 5) * 0.03) + i * 61 - py;
            const xRaw = i * 83 + Math.sin(frame * 0.01 + seed) * 18 - px;
            y = ((yRaw % h) + h) % h - 30;
            x = ((xRaw % w) + w) % w - 30;
            const puls = 0.35 + 0.35 * Math.sin(frame * 0.05 + seed);
            ctx.fillStyle = `rgba(255, 236, 150, ${puls.toFixed(3)})`;
            const pg = 2 + (i % 3);
            ctx.fillRect(Math.round(x), Math.round(y), pg, pg);
            continue;
        }
        const tempo = saison === "winter" ? 0.35 + (i % 7) * 0.05 : 0.45 + (i % 5) * 0.08;
        const pendel = Math.sin(frame * 0.012 + seed) * (saison === "winter" ? 10 : 26);
        const yRaw = frame * tempo + i * 47 - py;
        const xRaw = i * 71 + frame * (saison === "winter" ? 0.12 : 0.35) + pendel - px;
        y = ((yRaw % h) + h) % h - 30;
        x = ((xRaw % w) + w) % w - 30;

        if (saison === "winter") {
            ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
            const fg = 2 + (i % 3);
            ctx.fillRect(Math.round(x), Math.round(y), fg, fg);
        } else {
            const winkel = frame * 0.03 * ((i % 2) ? 1 : -1) + seed;
            const farbe = saison === "herbst" ? LAUB[i % LAUB.length] : BLUETEN[i % BLUETEN.length];
            zeichneBlatt(ctx, x, y, saison === "herbst" ? 6 : 4, winkel, farbe, 0.9, saison === "herbst");
        }
    }
    ctx.restore();
}

/**
 * Glühwürmchen in der Nacht — nicht im Winter. Gezeichnet NACH dem Nachtschleier:
 * sie sind selbst Licht (dieselbe Regel wie bei Blitzen und Partylasern). Kein
 * Weichzeichner, nur ein heller Punkt mit blassem Hof, der langsam an- und ausgeht.
 *
 * @param {number} nacht Dunkelheit 0..1 (engine/Tageszeit.js) — darunter keine
 */
export function zeichneGluehwuermchen(ctx, canvas, saison, frame, player, nacht, particleScale) {
    if (saison === "winter" || nacht < 0.2) return;
    const sichtbar = Math.min(1, (nacht - 0.2) / 0.3);
    const basis = saison === "sommer" ? 26 : 14;
    const anzahl = Math.max(3, Math.round(basis * particleScale));
    const px = player ? player.x : 0;
    const py = player ? player.y : 0;
    const w = canvas.width + 80;
    const h = canvas.height + 80;
    ctx.save();
    for (let i = 0; i < anzahl; i++) {
        const seed = i * 53.7;
        // Langsame, eigene Bahn je Tier — Lissajous statt Fallen.
        const xRaw = i * 137 + Math.sin(frame * 0.006 + seed) * 60 + Math.sin(frame * 0.017 + seed * 2) * 14 - px * 0.9;
        const yRaw = i * 89 + Math.cos(frame * 0.005 + seed) * 40 + Math.sin(frame * 0.013 + seed) * 10 - py * 0.9;
        const x = ((xRaw % w) + w) % w - 40;
        const y = ((yRaw % h) + h) % h - 40;
        // An/aus im eigenen Takt; gut die Hälfte der Zeit dunkel.
        const takt = Math.sin(frame * 0.04 + seed * 3);
        const hell = Math.max(0, takt) * sichtbar;
        if (hell < 0.05) continue;
        ctx.fillStyle = `rgba(214, 255, 120, ${(0.16 * hell).toFixed(3)})`;
        const gx = Math.round(x);
        const gy = Math.round(y);
        ctx.fillRect(gx - 6, gy - 2, 12, 4);
        ctx.fillRect(gx - 2, gy - 6, 4, 12);
        ctx.fillStyle = `rgba(245, 255, 190, ${(0.95 * hell).toFixed(3)})`;
        ctx.fillRect(gx - 2, gy - 2, 4, 4);
    }
    ctx.restore();
}
