#!/usr/bin/env node
// tools/bodenEntfernen.mjs — gemalten Boden (Gras, Erde) unten aus Bildern entfernen (06.11.).
// ComfyUI malt Häusern, Ranken und Briefkästen oft einen kleinen Rasen- oder Erdfleck unter,
// der auf dem eigenen Boden im Spiel doppelt aussieht.
//
// Weg: Pixel in Boden-Farbe im unteren Teil des Bilds, die zusammenhängend vom unteren Rand
// aus erreichbar sind, werden durchsichtig. Was höher sitzt oder anders gefärbt ist
// (Steinsockel, Tür, Pfosten), bleibt.
//
// 07.11. (Nutzer: „unten komisch rauseditiert“): die erste Fassung hielt jedes Braun und
// Orange für Erde — Kürbisse wurden unten flach, Zwergensockel und Räder ausgefranst. Jetzt
// sagt jedes Bild, WAS weg darf (gras / erde / beides); „Erde“ heißt nur noch gedeckter,
// heller Sand- oder Erdton (kein sattes Orange, kein dunkles Holz), und einzelne
// Restpixel am unteren Rand werden mit aufgeräumt.
//
// AUFRUF
//   node src/pages/GardenGame/tools/bodenEntfernen.mjs            → Vorher/Nachher-Bogen nach garden-art-vorschau/ohne_boden/
//   node src/pages/GardenGame/tools/bodenEntfernen.mjs --uebernehmen [datei,datei]
//   … --aus-sicherung   → statt des aktuellen Bilds die jüngste Sicherung aus _backup/ als Quelle
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const hier = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(hier, "../../../..");
const ASSETS = path.join(FRONTEND, "public", "garden-assets");
const VORSCHAU = path.join(FRONTEND, "garden-art-vorschau", "ohne_boden");
const BACKUP = path.join(FRONTEND, "garden-art-vorschau", "_backup");

/**
 * Bild → [Anteil der Höhe von unten, in dem Boden stehen darf; was weg darf].
 * gras = nur Grün (Motiv hat Holz/Erdtöne unten), erde = nur Sand/Erde (Motiv ist unten grün),
 * beides = Rasen und Erdfleck. Drittes Feld true = Boden darf überall im Band ansetzen (Häuser:
 * Grasflecken links/rechts erreichen den unteren Rand nicht, der Sandweg liegt dazwischen).
 */
// 07.11.: Häuser (shed + shed_variants) und die Ackerpflanzen (ananas, aprikosenpflaume,
// zitrone, guave, tomoffel, loewenzahn, minze, kuebi) stehen wieder im Original — jede
// Fassung fraß dort Teile des Motivs (Kräuter, Türen, Kürbisboden). Nicht wieder aufnehmen.
const BILDER = {
    "world/mailbox.png": [0.14, "beides"],
    ...Object.fromEntries(fs.readdirSync(path.join(ASSETS, "world/mailbox_variants")).map((f) => [`world/mailbox_variants/${f}`, [0.14, "beides"]])),
    "structure/reddish.png": [0.2, "erde"],
    "structure/vines.png": [0.14, "beides"],
    "structure/groundvines.png": [0.25, "erde"],
    // Runde 2 (06.11., Nutzer: „bei jedem Bild“) — nur Bilder mit echtem Rasen-/Erdfleck
    "structure/tree.png": [0.12, "beides"],
    "deco/objects/gnome1.png": [0.12, "gras"], "deco/objects/gnome2.png": [0.12, "gras"],
    "deco/objects/vogelscheuche.png": [0.12, "beides"], "deco/objects/bogen.png": [0.1, "beides"],
    "world/gold_shop.png": [0.12, "gras"], "world/market.png": [0.12, "gras"], "world/erntefest.png": [0.12, "beides"], "world/pet_market.png": [0.12, "gras"],
    "world/seed_shop.png": [0.12, "gras"],
};

function istBodenFarbe(r, g, b, art) {
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max - min < 18) return false;                           // grau/weiß/schwarz: Stein, Umriss
    const gruen = g >= r - 6 && g > b + 8;                        // Gras, Moos
    // Sand/Erde: gedeckt und nicht zu dunkel — sattes Orange (Kürbis) und dunkles Holz bleiben
    const erde = r > g && g > b && r - b > 30 && max > 105 && min < 230 && (max - min) / max < 0.45;
    if (art === "gras") return gruen;
    if (art === "erde") return erde;
    return gruen || erde;
}
/** Dunkler Umriss direkt am Boden zählt mit, sonst bliebe ein schwarzer Strich stehen. */
const istDunkel = (r, g, b) => Math.max(r, g, b) < 70;

async function ohneBoden(datei, anteil, art, ueberall = false) {
    const { data, info } = await sharp(datei).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width: w, height: h } = info;
    const a = (x, y) => data[(y * w + x) * 4 + 3];
    // Unterkante des Motivs finden (unterste Zeile mit sichtbaren Pixeln)
    let unten = h - 1;
    while (unten > 0 && ![...Array(w).keys()].some((x) => a(x, unten) > 30)) unten--;
    let oben = 0;
    while (oben < h && ![...Array(w).keys()].some((x) => a(x, oben) > 30)) oben++;
    const grenze = Math.round(unten - (unten - oben) * anteil);
    const weg = new Uint8Array(w * h);
    const stapel = [];
    const passt = (x, y) => {
        if (x < 0 || y < grenze || x >= w || y > unten) return false;
        const i = (y * w + x) * 4;
        if (data[i + 3] <= 30 || weg[y * w + x]) return false;
        return istBodenFarbe(data[i], data[i + 1], data[i + 2], art);
    };
    // Start: Boden-Farbe in den untersten Zeilen des Motivs
    for (let y = unten; y > (ueberall ? grenze - 1 : unten - 6) && y >= grenze; y--) for (let x = 0; x < w; x++) if (passt(x, y)) { weg[y * w + x] = 1; stapel.push([x, y]); }
    while (stapel.length) {
        const [x, y] = stapel.pop();
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx, ny = y + dy;
            if (passt(nx, ny)) { weg[ny * w + nx] = 1; stapel.push([nx, ny]); }
        }
    }
    // Dunkle Umrisspixel, die nur noch am entfernten Boden hingen (unter/neben ihm), mitnehmen
    const sichtbar = (x, y) => x >= 0 && y >= 0 && x < w && y < h && a(x, y) > 30 && !weg[y * w + x];
    for (let y = grenze; y <= unten; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (weg[y * w + x] || data[i + 3] <= 30 || !istDunkel(data[i], data[i + 1], data[i + 2])) continue;
        const nachbarWeg = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => weg[(y + dy) * w + x + dx]);
        if (nachbarWeg && !sichtbar(x, y - 1)) weg[y * w + x] = 2;
    }
    let n = 0;
    for (let i = 0; i < w * h; i++) if (weg[i]) { data[i * 4 + 3] = 0; n++; }

    // Aufräumen im unteren Band: kleine Inseln (Restpixel) und abstehende Einzelpixel
    const offen = (x, y) => x >= 0 && y >= 0 && x < w && y < h && data[(y * w + x) * 4 + 3] > 30;
    const gesehen = new Uint8Array(w * h);
    let gesamt = 0;
    for (let i = 0; i < w * h; i++) if (data[i * 4 + 3] > 30) gesamt++;
    const klein = Math.max(24, gesamt * 0.002);
    for (let y = grenze; y <= unten; y++) for (let x = 0; x < w; x++) {
        if (!offen(x, y) || gesehen[y * w + x]) continue;
        const insel = [[x, y]]; gesehen[y * w + x] = 1;
        let ganzUnten = true;
        for (let k = 0; k < insel.length && insel.length <= klein; k++) {
            const [ix, iy] = insel[k];
            if (iy < grenze) ganzUnten = false;
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                const nx = ix + dx, ny = iy + dy;
                if (offen(nx, ny) && !gesehen[ny * w + nx]) { gesehen[ny * w + nx] = 1; insel.push([nx, ny]); }
            }
        }
        if (ganzUnten && insel.length <= klein) for (const [ix, iy] of insel) { data[(iy * w + ix) * 4 + 3] = 0; n++; }
    }
    for (let runde = 0; runde < 2; runde++) {
        for (let y = grenze; y <= unten; y++) for (let x = 0; x < w; x++) {
            if (!offen(x, y)) continue;
            const frei = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => !offen(x + dx, y + dy)).length;
            if (frei >= 3) { data[(y * w + x) * 4 + 3] = 0; n++; }
        }
    }
    const buf = await sharp(data, { raw: { width: w, height: h, channels: 4 } }).png({ palette: true, colours: 64 }).toBuffer();
    return { buf, n };
}

/** Jüngste Sicherung eines Bilds in _backup/ (Dateiname <Zeitstempel>_<pfad mit __>). */
function juengsteSicherung(rel) {
    const key = "_" + rel.replaceAll("/", "__");
    const treffer = fs.existsSync(BACKUP) ? fs.readdirSync(BACKUP).filter((f) => f.endsWith(key)).sort() : [];
    return treffer.length ? path.join(BACKUP, treffer.at(-1)) : null;
}

const uebernehmen = process.argv.includes("--uebernehmen");
const ausSicherung = process.argv.includes("--aus-sicherung");
const nurArg = process.argv[process.argv.indexOf("--uebernehmen") + 1];
const nur = uebernehmen && nurArg && !nurArg.startsWith("--") ? new Set(nurArg.split(",")) : null;
fs.mkdirSync(VORSCHAU, { recursive: true });
const teile = [];
let i = 0;
for (const [rel, [anteil, art, ueberall]] of Object.entries(BILDER)) {
    if (nur && !nur.has(rel)) continue;
    const datei = path.join(ASSETS, rel);
    if (!fs.existsSync(datei)) continue;
    const quelle = ausSicherung ? juengsteSicherung(rel) : datei;
    if (!quelle) { console.log(`  ! ${rel}: keine Sicherung`); continue; }
    const quellBuf = fs.readFileSync(quelle);
    const { buf, n } = await ohneBoden(quellBuf, anteil, art, ueberall);
    fs.writeFileSync(path.join(VORSCHAU, rel.replaceAll("/", "__")), buf);
    if (uebernehmen) {
        fs.mkdirSync(BACKUP, { recursive: true });
        // Bei --aus-sicherung bleibt die Sicherung die jüngste: das ersetzte Bild ist ja schon bearbeitet.
        if (!ausSicherung) fs.copyFileSync(datei, path.join(BACKUP, `${Date.now()}_${rel.replaceAll("/", "__")}`));
        fs.writeFileSync(datei, buf);
        console.log(`  → ${rel} (${n} Bodenpixel entfernt)`);
    }
    for (const [j, bild] of [[0, quellBuf], [1, buf]]) {
        teile.push({ input: await sharp(bild).resize(150, 150, { fit: "contain", kernel: "nearest", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer(), left: (i % 4) * 330 + 5 + j * 160, top: Math.floor(i / 4) * 175 + 5 });
    }
    teile.push({ input: Buffer.from(`<svg width="330" height="16"><text x="4" y="12" font-size="11" font-family="Arial">${rel.split("/").pop()} — vorher | nachher (${n})</text></svg>`), left: (i % 4) * 330, top: Math.floor(i / 4) * 175 + 157 });
    i++;
}
const bogen = path.join(VORSCHAU, "_bogen.png");
await sharp({ create: { width: 1320, height: Math.ceil(i / 4) * 175, channels: 4, background: "#7fb35a" } }).composite(teile).png().toFile(bogen);
console.log(`${i} Bilder → ${bogen}`);
