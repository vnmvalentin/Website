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
                const rx = tile * 0.6 * groesse;
                ctx.fillStyle = "rgba(244, 249, 255, 0.55)";
                ctx.beginPath();
                ctx.ellipse(x, y, rx, rx * 0.4, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
                ctx.beginPath();
                ctx.ellipse(x - rx * 0.12, y - rx * 0.16, rx * 0.55, rx * 0.22, 0, 0, Math.PI * 2);
                ctx.fill();
            } else if (saison === "sommer") {
                // Sonnenverbrannte Stellen im Rasen, dazu ein, zwei gelbe Blumen.
                ctx.fillStyle = "rgba(214, 186, 100, 0.38)";
                ctx.beginPath();
                ctx.ellipse(x, y, tile * 0.5 * groesse, tile * 0.22 * groesse, 0, 0, Math.PI * 2);
                ctx.fill();
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

function zeichneBlatt(ctx, x, y, laenge, winkel, farbe, alpha, rippe = true) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(winkel);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = farbe;
    ctx.beginPath();
    ctx.ellipse(0, 0, laenge, laenge * 0.48, 0, 0, Math.PI * 2);
    ctx.fill();
    if (!rippe) { ctx.restore(); return; }
    // Mittelrippe, damit es als Blatt liest und nicht als Fleck.
    ctx.strokeStyle = "rgba(60, 25, 5, 0.45)";
    ctx.lineWidth = Math.max(0.6, laenge * 0.12);
    ctx.beginPath();
    ctx.moveTo(-laenge * 0.85, 0);
    ctx.lineTo(laenge * 0.85, 0);
    ctx.stroke();
    ctx.restore();
}

function zeichneBlume(ctx, x, y, r, farbe) {
    ctx.fillStyle = farbe;
    for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.8, r * 0.75, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.fillStyle = "#facc15";
    ctx.beginPath();
    ctx.arc(x, y, r * 0.6, 0, Math.PI * 2);
    ctx.fill();
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
            ctx.beginPath();
            ctx.arc(x, y, 1.6 + (i % 3) * 0.5, 0, Math.PI * 2);
            ctx.fill();
            continue;
        }
        const tempo = saison === "winter" ? 0.35 + (i % 7) * 0.05 : 0.45 + (i % 5) * 0.08;
        const pendel = Math.sin(frame * 0.012 + seed) * (saison === "winter" ? 10 : 26);
        const yRaw = frame * tempo + i * 47 - py;
        const xRaw = i * 71 + frame * (saison === "winter" ? 0.12 : 0.35) + pendel - px;
        y = ((yRaw % h) + h) % h - 30;
        x = ((xRaw % w) + w) % w - 30;

        if (saison === "winter") {
            ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
            ctx.beginPath();
            ctx.arc(x, y, 1.4 + (i % 3) * 0.6, 0, Math.PI * 2);
            ctx.fill();
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
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(245, 255, 190, ${(0.95 * hell).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(x, y, 1.8, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}
