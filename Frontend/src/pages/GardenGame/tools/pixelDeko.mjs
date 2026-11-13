#!/usr/bin/env node
// tools/pixelDeko.mjs — Deko und Böden für den Deko-Shop, Bildpunkt für Bildpunkt im Code
// gezeichnet (06.11.), im selben Stil wie das Haus von innen (ui/HausInnen.jsx).
//
// AUFRUF
//   node src/pages/GardenGame/tools/pixelDeko.mjs                → Vorschau nach garden-art-vorschau/code_deko/
//   node src/pages/GardenGame/tools/pixelDeko.mjs --bogen <png>  → zusätzlich Vergleichsbogen alt | neu
//   node src/pages/GardenGame/tools/pixelDeko.mjs --uebernehmen [id,id,…]
//        → nach public/garden-assets/deco/… (altes Bild vorher nach garden-art-vorschau/_backup/)
//
// Raster wie bei den ComfyUI-Pixelbildern (farmArtUebernehmen.js, PIXEL_JE_KACHEL): 48 Bildpunkte
// je Kachel, zweifach mit „nearest“ vergrößert. Böden: 32×32 nahtlos, achtfach (256 px).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const hier = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(hier, "../../../..");
const VORSCHAU = path.join(FRONTEND, "garden-art-vorschau", "code_deko");
const BACKUP = path.join(FRONTEND, "garden-art-vorschau", "_backup");
const ASSETS = path.join(FRONTEND, "public", "garden-assets", "deco");

// ── Kleine Rasterfläche ────────────────────────────────────────────────────────
function hex(c) {
    const n = parseInt(c.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hash(x, y, s = 0) {
    let h = (x * 374761393 + y * 668265263 + s * 982451653) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

class Bild {
    constructor(w, h, nahtlos = false) {
        this.w = w;
        this.h = h;
        this.nahtlos = nahtlos;
        this.d = new Uint8ClampedArray(w * h * 4);
    }
    px(x, y, c) {
        x = Math.round(x);
        y = Math.round(y);
        if (this.nahtlos) { x = ((x % this.w) + this.w) % this.w; y = ((y % this.h) + this.h) % this.h; }
        if (x < 0 || y < 0 || x >= this.w || y >= this.h || !c) return;
        const [r, g, b] = hex(c);
        const i = (y * this.w + x) * 4;
        this.d[i] = r; this.d[i + 1] = g; this.d[i + 2] = b; this.d[i + 3] = 255;
    }
    hat(x, y) {
        if (x < 0 || y < 0 || x >= this.w || y >= this.h) return false;
        return this.d[(y * this.w + x) * 4 + 3] > 0;
    }
    rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c); }
    linie(x0, y0, x1, y1, c) {
        const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
        for (let i = 0; i <= n; i++) this.px(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, c);
    }
    /** Gefüllte Ellipse, oben links heller, unten rechts dunkler (drei Töne). */
    kugel(cx, cy, rx, ry, [hell, mittel, dunkel], seed = 0, krumm = 0.12) {
        for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
            const dx = (x - cx) / rx, dy = (y - cy) / ry;
            const d = dx * dx + dy * dy + (hash(x, y, seed) - 0.5) * krumm;
            if (d > 1) continue;
            const licht = -dx * 0.6 - dy * 0.8 + (hash(y, x, seed + 1) - 0.5) * 0.5;
            this.px(x, y, licht > 0.45 ? hell : licht < -0.35 ? dunkel : mittel);
        }
    }
    /** Dunkler Rand um alles Gezeichnete — der klassische Sprite-Umriss. */
    umriss(c) {
        const neu = [];
        for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
            if (this.hat(x, y)) continue;
            if (this.hat(x - 1, y) || this.hat(x + 1, y) || this.hat(x, y - 1) || this.hat(x, y + 1)) neu.push([x, y]);
        }
        for (const [x, y] of neu) this.px(x, y, c);
    }
}

// ── Bausteine ──────────────────────────────────────────────────────────────────
const UMRISS = "#2b1d12";
const LAUB = ["#7fc25a", "#4f9a3c", "#2f6b2c"];
const LAUB_DUNKEL = ["#5f9a43", "#3f7a35", "#24502a"];

function stiel(b, x, y0, y1, c = "#3f7a35") { for (let y = y0; y <= y1; y++) b.px(x, y, c); }
function blatt(b, x, y, links) {
    b.px(x, y, "#4f9a3c");
    b.px(x + (links ? -1 : 1), y, "#4f9a3c");
    b.px(x + (links ? -2 : 2), y - 1, "#7fc25a");
}
/** Gänseblümchen-Kopf: Kreuz aus Blütenblättern + Mitte. */
function margerite(b, x, y, blatt = "#ffffff", schatten = "#d9d4c8", mitte = "#f2c14e") {
    b.px(x, y - 1, blatt); b.px(x, y + 1, schatten); b.px(x - 1, y, blatt); b.px(x + 1, y, schatten);
    b.px(x - 1, y - 1, blatt); b.px(x + 1, y + 1, schatten);
    b.px(x, y, mitte);
}
/** Größerer Blütenkopf: 3×3 Mitte + Blütenring. */
function sonnenblume(b, x, y) {
    for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) {
        const d = Math.abs(i) + Math.abs(j);
        if (d > 3) continue;
        b.px(x + i, y + j, d <= 1 ? (i + j < 0 ? "#8a5a2a" : "#5a3a1a") : (i + j < 0 ? "#ffd84a" : "#e8a92a"));
    }
}
function tulpe(b, x, y, [hell, mittel, dunkel]) {
    b.px(x - 1, y - 1, hell); b.px(x + 1, y - 1, mittel);
    b.rect(x - 1, y, 3, 2, mittel);
    b.px(x - 1, y, hell); b.px(x + 1, y + 1, dunkel); b.px(x, y + 1, dunkel);
}
function kleineBluete(b, x, y, c, s) { b.px(x, y, c); b.px(x + 1, y, s); b.px(x, y + 1, s); b.px(x - 1, y, c); b.px(x, y - 1, c); }

// ── Natur-Deko (48 Bildpunkte je Kachel) ───────────────────────────────────────
function holzKasten(b, x0, y0, w, h, farben = ["#c08a54", "#9c6a3c", "#6e4426"]) {
    const [hell, mittel, dunkel] = farben;
    b.rect(x0, y0, w, h, mittel);
    b.rect(x0, y0, w, 2, hell);
    for (let y = y0 + 4; y < y0 + h; y += 4) b.rect(x0, y, w, 1, dunkel);
    for (let x = x0 + 5; x < x0 + w - 2; x += 9 + Math.floor(hash(x, y0) * 4)) b.px(x, y0 + 2 + Math.floor(hash(y0, x) * (h - 3)), dunkel);
    b.rect(x0, y0 + h - 1, w, 1, dunkel);
}

/** Runde Blüte (Radius 2 ≈ 5×5) mit farbiger Mitte. */
function bluete(b, x, y, farben, mitte = "#f2c14e", r = 2) {
    b.kugel(x, y, r + 0.45, r + 0.45, farben, x * 7 + y, 0.08);
    b.px(x, y, mitte);
    if (r >= 3) { b.px(x + 1, y, mitte); b.px(x, y + 1, mitte); b.px(x + 1, y + 1, "#b8862a"); }
}
/** Dichtes Blattwerk: mehrere Laubkugeln nebeneinander. */
function blattBusch(b, x0, x1, y, hoehe, seed, laub = LAUB) {
    for (let x = x0; x <= x1; x += 5) {
        const ry = hoehe * (0.7 + hash(x, seed) * 0.4);
        b.kugel(x + hash(seed, x) * 2, y - ry * 0.4, 4.5, ry, laub, seed + x, 0.25);
    }
}
function erdeOben(b, x0, y0, w) {
    b.rect(x0, y0, w, 3, "#5a3a22");
    for (let x = x0; x < x0 + w; x++) if (hash(x, y0) < 0.3) b.px(x, y0 + 1, "#7a5030");
}
const BLUETEN = {
    rot: ["#ff8a7a", "#e8403a", "#a82424"],
    gelb: ["#fff08a", "#f2c84a", "#c8902a"],
    blau: ["#a8c8ff", "#6a8ee8", "#3f5ab0"],
    weiss: ["#ffffff", "#e8e4da", "#b8b2a6"],
    rosa: ["#ffc4dc", "#f28ab4", "#c45a86"],
    lila: ["#d8b4ff", "#a87ae8", "#7048b0"],
    orange: ["#ffc48a", "#f2903a", "#c0602a"],
};

const ZEICHNER = {
    // Blumenkasten: Holzkasten, oben Erde, bunte Blüten über dichtem Laub
    flower1() {
        const b = new Bild(48, 48);
        const koepfe = [[10, 18, "rot"], [17, 13, "gelb"], [24, 17, "blau"], [31, 12, "weiss"], [38, 17, "rot"], [14, 24, "blau"], [28, 23, "gelb"], [35, 25, "weiss"], [21, 25, "rot"]];
        for (const [x, y] of koepfe) stiel(b, x, y + 2, 31);
        blattBusch(b, 7, 41, 33, 6, 11);
        for (const [x, y, f] of koepfe) bluete(b, x, y, BLUETEN[f], f === "blau" ? "#fff3c4" : "#f2c14e");
        erdeOben(b, 5, 32, 38);
        holzKasten(b, 5, 34, 38, 12);
        b.umriss(UMRISS);
        return b;
    },
    // Blumenkiste: Lattenkiste mit Sonnenblumen
    flower2() {
        const b = new Bild(48, 48);
        const koepfe = [[12, 11], [24, 7], [36, 12], [18, 19], [31, 19]];
        for (const [x, y] of koepfe) stiel(b, x, y + 3, 32, "#3f7a35");
        for (const [x, y] of koepfe) { b.kugel(x - 3, y + 9, 3, 2, LAUB, x, 0.2); b.kugel(x + 3, y + 12, 3, 2, LAUB, y, 0.2); }
        blattBusch(b, 8, 40, 32, 4, 21);
        for (const [x, y] of koepfe) {
            for (let a = 0; a < 12; a++) {
                const w = (a / 12) * Math.PI * 2;
                b.px(x + Math.cos(w) * 4, y + Math.sin(w) * 4, a % 2 ? "#e8a92a" : "#ffd84a");
                b.px(x + Math.cos(w) * 3, y + Math.sin(w) * 3, "#ffd84a");
            }
            b.kugel(x, y, 2.3, 2.3, ["#a8743f", "#6e4426", "#4a2f1c"], x, 0.05);
        }
        erdeOben(b, 6, 31, 36);
        b.rect(6, 33, 36, 13, "#b9874e");
        for (let x = 6; x < 42; x += 6) { b.rect(x, 33, 1, 13, "#7a5030"); b.rect(x + 1, 33, 1, 13, "#d29e62"); }
        b.rect(6, 33, 36, 1, "#d29e62");
        b.rect(6, 39, 36, 1, "#7a5030");
        b.rect(6, 45, 36, 1, "#6e4426");
        b.umriss(UMRISS);
        return b;
    },
    // Blumentrog: Steintrog mit Tulpen
    flower3() {
        const b = new Bild(48, 48);
        const farben = [["#ff8fa8", "#e8506e", "#a8304a"], ["#ffd76a", "#f2b43a", "#b87a1a"], ["#ffffff", "#f0d6e6", "#c49ab4"], ["#d8b4ff", "#a87ae8", "#7048b0"]];
        const koepfe = [[9, 19], [15, 14], [21, 18], [27, 13], [33, 17], [39, 15], [18, 24], [30, 23], [36, 24], [12, 25], [24, 25]];
        koepfe.forEach(([x, y]) => stiel(b, x, y + 3, 32));
        for (let x = 7; x < 42; x += 4) { b.linie(x, 32, x - 2, 24 + hash(x, 2) * 4, "#4f9a3c"); b.linie(x + 1, 32, x + 3, 25 + hash(2, x) * 4, "#7fc25a"); }
        koepfe.forEach(([x, y], i) => grosseTulpe(b, x, y, farben[i % 4]));
        erdeOben(b, 4, 31, 40);
        b.rect(4, 33, 40, 13, "#9aa0a6");
        b.rect(4, 33, 40, 1, "#c3c8cc");
        for (let i = 0; i < 30; i++) b.px(5 + Math.floor(hash(i, 7) * 38), 35 + Math.floor(hash(7, i) * 9), hash(i, i) > 0.5 ? "#7d848b" : "#b0b6bb");
        b.rect(4, 45, 40, 1, "#5d636a");
        b.umriss(UMRISS);
        return b;
    },
    // Wildblumen I–IV: lockerer Strauß ohne Kasten
    // 06.11.: je Strauß eine klare Hauptfarbe, damit sich die vier deutlich unterscheiden
    blumen_wiese: () => wildblumen(1, ["rosa", "rosa", "weiss"]),
    blumen_wiese2: () => wildblumen(2, ["blau", "blau", "weiss", "gelb"]),
    blumen_wiese3: () => wildblumen(3, ["rot", "rot", "gelb"]),
    blumen_wiese4: () => wildblumen(4, ["lila", "lila", "rosa", "weiss"]),
    // Tulpenbeet: Erdbeet mit Reihen roter und gelber Tulpen
    tulpenbett() {
        const b = new Bild(48, 48);
        b.kugel(24, 39, 22, 7, ["#8a5a32", "#6e4426", "#4a2f1c"], 5, 0.05);
        for (let i = 0; i < 40; i++) b.px(4 + Math.floor(hash(i, 3) * 40), 34 + Math.floor(hash(3, i) * 9), "#a87443");
        const farben = [["#ff6a6a", "#e03a3a", "#a02020"], ["#ffe066", "#f2b43a", "#b87a1a"]];
        let n = 0;
        for (const [reihe, y] of [[0, 21], [1, 27], [2, 33]]) {
            for (let x = 8 + (reihe % 2) * 4; x < 42; x += 8) {
                stiel(b, x, y + 3, y + 8);
                b.linie(x, y + 8, x - 3, y + 4, "#4f9a3c");
                b.linie(x, y + 8, x + 3, y + 5, "#7fc25a");
                grosseTulpe(b, x, y, farben[(n + reihe) % 2]);
                n++;
            }
        }
        b.umriss(UMRISS);
        return b;
    },
    // Topfpflanze: Terrakottatopf mit großen Blättern
    plant() {
        const b = new Bild(48, 48);
        const blaetter = [[24, 8, 4, 7], [16, 13, 5, 4], [32, 13, 5, 4], [12, 21, 5, 4], [36, 21, 5, 4], [20, 18, 4, 5], [28, 18, 4, 5], [24, 24, 6, 4]];
        stiel(b, 24, 14, 32, "#3f7a35");
        blaetter.forEach(([x, y, rx, ry], i) => {
            b.linie(24, 30, x, y + ry, "#3f7a35");
            b.kugel(x, y, rx, ry, LAUB, 20 + i, 0.2);
            b.linie(x - rx + 2, y + 1, x + rx - 2, y - 1, "#2f6b2c");
        });
        b.rect(14, 31, 20, 3, "#c8643a");
        b.rect(14, 31, 20, 1, "#e08a5a");
        for (let y = 34; y < 46; y++) {
            const e = Math.floor((y - 34) / 4);
            b.rect(16 + e, y, 16 - 2 * e, 1, "#a8543a");
            b.px(17 + e, y, "#c8643a");
            b.px(30 - e, y, "#7a3a24");
        }
        b.rect(17, 39, 14, 1, "#e0b24a");
        b.umriss(UMRISS);
        return b;
    },
    // Hecke 2×1: breite, gerade geschnittene Hecke mit welliger Oberkante
    hecke() {
        const b = new Bild(96, 36);
        for (let x = 4; x < 92; x += 6) b.kugel(x + 3, 12 + hash(x, 1) * 2, 6, 6, LAUB, x, 0.25);
        b.rect(2, 13, 92, 18, LAUB[1]);
        for (let y = 13; y < 31; y++) for (let x = 2; x < 94; x++) {
            const r = hash(x, y, 9);
            if (r < 0.14) b.px(x, y, LAUB[0]);
            else if (r > 0.82 || y > 26) b.px(x, y, LAUB[2]);
        }
        for (let i = 0; i < 6; i++) bluete(b, 10 + i * 15 + Math.floor(hash(i, 8) * 6), 14 + Math.floor(hash(8, i) * 10), BLUETEN.weiss, "#f2c14e", 1);
        b.rect(2, 31, 92, 3, "#4a2f1c");
        b.umriss(UMRISS);
        return b;
    },
    // Kleine Hecke 1×1: runder Busch
    hecke_klein() {
        const b = new Bild(48, 44);
        b.kugel(17, 26, 13, 12, LAUB_DUNKEL, 31, 0.25);
        b.kugel(31, 26, 13, 12, LAUB_DUNKEL, 32, 0.25);
        b.kugel(24, 18, 15, 13, LAUB, 33, 0.25);
        for (let i = 0; i < 18; i++) {
            const x = 10 + Math.floor(hash(i, 4) * 28), y = 10 + Math.floor(hash(4, i) * 24);
            b.px(x, y, "#9ad66e");
        }
        b.rect(16, 38, 16, 3, "#4a2f1c");
        b.umriss(UMRISS);
        return b;
    },
    // Kirschblütenbaum 1×2: kräftiger Stamm, große rosa Krone
    cherry_blossom() {
        const b = new Bild(48, 96);
        const stamm = ["#8a5a3a", "#6e4426", "#4a2f1c"];
        for (let y = 52; y < 92; y++) {
            const w = y > 84 ? 10 : 7;
            const x0 = Math.round(24 - w / 2 + Math.sin(y / 9));
            b.rect(x0, y, w, 1, stamm[1]);
            b.px(x0, y, stamm[0]); b.px(x0 + 1, y, stamm[0]);
            b.px(x0 + w - 1, y, stamm[2]);
        }
        b.linie(22, 62, 10, 46, stamm[1]); b.linie(23, 62, 11, 46, stamm[1]);
        b.linie(26, 58, 38, 44, stamm[1]); b.linie(26, 59, 39, 44, stamm[1]);
        const rosa = ["#ffe0ec", "#f7a8c8", "#d8709a"];
        for (const [x, y, rx, ry] of [[12, 34, 11, 11], [36, 32, 11, 11], [24, 20, 15, 14], [24, 40, 16, 11], [10, 48, 7, 6], [38, 48, 7, 6], [17, 10, 8, 7], [32, 11, 8, 7]]) b.kugel(x, y, rx, ry, rosa, x * y, 0.3);
        for (let i = 0; i < 40; i++) b.px(3 + Math.floor(hash(i, 5) * 42), 4 + Math.floor(hash(5, i) * 50), hash(i, 9) > 0.5 ? "#ffffff" : "#c45a86");
        b.kugel(24, 93, 9, 2, LAUB, 3, 0.1);
        b.umriss(UMRISS);
        for (const [x, y] of [[6, 66], [41, 70], [9, 80], [38, 86]]) { b.px(x, y, "#f7a8c8"); b.px(x + 1, y, "#d8709a"); }
        return b;
    },
};

function grosseTulpe(b, x, y, [hell, mittel, dunkel]) {
    // Kelch 4 breit, oben drei Spitzen
    b.px(x - 1, y - 1, hell); b.px(x + 1, y - 1, mittel); b.px(x + 2, y - 1, mittel);
    b.rect(x - 1, y, 4, 3, mittel);
    b.px(x - 1, y, hell); b.px(x, y, hell); b.px(x - 1, y + 1, hell);
    b.px(x + 2, y + 1, dunkel); b.px(x + 2, y + 2, dunkel); b.px(x + 1, y + 2, dunkel);
}

function wildblumen(seed, farben) {
    const b = new Bild(48, 48);
    const koepfe = [];
    for (let i = 0; i < 11; i++) {
        const x = 9 + Math.floor(hash(i, seed) * 30);
        const y = 8 + Math.floor(hash(seed, i) * 20);
        koepfe.push([x, y, farben[i % farben.length]]);
    }
    for (const [x, y] of koepfe) b.linie(x, y + 2, 24 + (x - 24) * 0.5, 36, "#3f7a35");
    // Blattwerk unten, nach oben lockerer
    for (let i = 0; i < 9; i++) {
        const x = 10 + i * 3.5;
        b.kugel(x, 38 - hash(i, seed) * 5, 4, 5, LAUB, seed * 10 + i, 0.3);
    }
    for (let i = 0; i < 7; i++) {
        const x = 12 + Math.floor(hash(i, seed + 5) * 24);
        b.linie(x, 34, x + (i % 2 ? 3 : -3), 22 + hash(i, seed + 6) * 6, i % 2 ? "#4f9a3c" : "#7fc25a");
    }
    koepfe.forEach(([x, y, f], i) => bluete(b, x, y, BLUETEN[f], f === "gelb" || f === "orange" ? "#8a5a2a" : "#f2c14e", i % 4 === 0 ? 2 : 1.6));
    for (let i = 0; i < 6; i++) bluete(b, 11 + Math.floor(hash(i, seed + 9) * 26), 30 + Math.floor(hash(seed + 9, i) * 8), BLUETEN[farben[i % farben.length]], "#f2c14e", 1);
    b.umriss(UMRISS);
    return b;
}

// ── Böden: 32×32 nahtlos ───────────────────────────────────────────────────────
function boden(malen) {
    const b = new Bild(32, 32, true);
    malen(b);
    return b;
}
/** Weiches, nahtloses Rauschen über 32 px (Gitter `schritt`, Werte 0…1). */
function rauschen(x, y, schritt, seed) {
    const n = 32 / schritt;
    const gx = x / schritt, gy = y / schritt;
    const x0 = Math.floor(gx), y0 = Math.floor(gy);
    const fx = gx - x0, fy = gy - y0;
    const w = (i, j) => hash(((x0 + i) % n + n) % n, ((y0 + j) % n + n) % n, seed);
    const s = (t) => t * t * (3 - 2 * t);
    const a = w(0, 0) + (w(1, 0) - w(0, 0)) * s(fx);
    const c = w(0, 1) + (w(1, 1) - w(0, 1)) * s(fx);
    return a + (c - a) * s(fy);
}
const BOEDEN = {
    gras: () => boden((b) => {
        for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
            const n = rauschen(x, y, 8, 1) + (hash(x, y, 1) - 0.5) * 0.35;
            b.px(x, y, n < 0.32 ? "#4f9a3c" : n > 0.72 ? "#7fc25a" : "#5faa45");
        }
        for (let i = 0; i < 30; i++) {
            const x = Math.floor(hash(i, 2) * 32), y = Math.floor(hash(2, i) * 32);
            b.px(x, y, "#3f8a35"); b.px(x, y - 1, "#3f8a35"); b.px(x + 1, y - 2, "#8fd062");
        }
    }),
    path1: () => boden((b) => {
        for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
            const n = rauschen(x, y, 8, 3) + (hash(x, y, 3) - 0.5) * 0.3;
            b.px(x, y, n < 0.3 ? "#8f6a42" : n > 0.72 ? "#c9a06c" : "#b08656");
        }
        for (let i = 0; i < 12; i++) {
            const x = Math.floor(hash(i, 4) * 32), y = Math.floor(hash(4, i) * 32);
            b.px(x, y, "#e0cfaa"); b.px(x + 1, y, "#c8b48e"); b.px(x, y + 1, "#7a5a38"); b.px(x + 1, y + 1, "#7a5a38");
        }
        for (let i = 0; i < 5; i++) {
            const x = Math.floor(hash(i, 5) * 32), y = Math.floor(hash(5, i) * 32);
            b.px(x, y, "#4f9a3c"); b.px(x + 1, y - 1, "#7fc25a"); b.px(x - 1, y - 1, "#5faa45");
        }
    }),
    gravel: () => boden((b) => {
        for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) b.px(x, y, hash(x, y, 6) < 0.5 ? "#77736c" : "#6a6660");
        // Kiesel zufällig verteilt, 1–2 Punkte groß, oben links Licht, unten rechts Schatten
        for (let i = 0; i < 170; i++) {
            const x = Math.floor(hash(i, 61) * 32), y = Math.floor(hash(61, i) * 32);
            const ton = ["#b8b4aa", "#a29e94", "#c9c2b0", "#948f85", "#b4a894"][i % 5];
            if (hash(i, 62) < 0.45) { b.px(x, y, ton); b.px(x + 1, y + 1, "#55524c"); continue; }
            b.px(x, y, "#d6d0c4"); b.px(x + 1, y, ton); b.px(x, y + 1, ton); b.px(x + 1, y + 1, ton);
            b.px(x + 2, y + 1, "#55524c"); b.px(x + 1, y + 2, "#55524c");
        }
    }),
    brick: () => boden((b) => {
        for (let y = 0; y < 32; y++) {
            const reihe = Math.floor(y / 8);
            const versatz = reihe % 2 ? 8 : 0;
            for (let x = 0; x < 32; x++) {
                const fx = (x + versatz) % 16, fy = y % 8;
                if (fy === 7 || fx === 15) { b.px(x, y, "#8c7d6c"); continue; }
                const stein = Math.floor((x + versatz) / 16) + reihe * 3;
                const basis = ["#b5523a", "#a8483a", "#bf6044"][stein % 3];
                b.px(x, y, fy === 0 ? "#cf7458" : fy === 6 || fx === 14 ? "#8a3a2a" : hash(x, y, 7) < 0.1 ? "#9a4232" : basis);
            }
        }
    }),
    smallstone: () => boden((b) => {
        b.rect(0, 0, 32, 32, "#5d5a55");
        for (let r = 0; r < 4; r++) for (let s = 0; s < 4; s++) {
            const cx = s * 8 + (r % 2 ? 4 : 0) + 3.5, cy = r * 8 + 3.5;
            const farben = [["#c3beb4", "#a29e94", "#7a766f"], ["#b4aea2", "#948f85", "#6f6b64"], ["#cbc5b8", "#aaa498", "#827d74"], ["#c8b8a2", "#a8967e", "#7d6c58"]][(r * 4 + s + r) % 4];
            b.kugel(cx, cy, 3.5, 3.3, farben, r * 10 + s, 0.2);
        }
    }),
    plank: () => boden((b) => {
        for (let y = 0; y < 32; y++) {
            const brett = Math.floor(y / 8), fy = y % 8;
            for (let x = 0; x < 32; x++) {
                const fuge = (x + brett * 11) % 32 === 0;
                let c = ["#a46f3f", "#b07a45", "#9c683a", "#ad7642"][brett];
                if (fy === 0) c = "#c99258";
                else if (fy === 7 || fuge) c = "#6e4426";
                else if (hash(x, y, 8) < 0.12 || (fy === 3 && hash(x, brett, 8) < 0.5)) c = "#956236";
                b.px(x, y, c);
            }
            if (fy === 3) for (const nx of [(brett * 11 + 2) % 32, (brett * 11 + 29) % 32]) b.px(nx, y, "#4a2f1c");
        }
    }),
    // 06.11.: eine Platte je Kachel — vier kleine Platten sahen aus, als lege man 2×2 Felder
    moss: () => boden((b) => {
        for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
            const moos = rauschen(x, y, 8, 11) + (hash(x, y, 12) - 0.5) * 0.3 > 0.55;
            if (x === 31 || y === 31) { b.px(x, y, moos ? "#3f7a35" : "#55524c"); continue; }
            const r = hash(x, y, 12);
            if (moos) b.px(x, y, r < 0.2 ? "#9ad66e" : r > 0.8 ? "#4f8a3c" : "#6fa84a");
            else b.px(x, y, y === 0 || x === 0 ? "#b8b4aa" : y === 30 || x === 30 ? "#86827a" : r < 0.15 ? "#8a867c" : "#9e9a90");
        }
    }),
    stone: () => boden((b) => {
        for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
            if (x === 31 || y === 31) { b.px(x, y, "#6f6c66"); continue; }
            const n = rauschen(x, y, 4, 13);
            b.px(x, y, y === 0 || x === 0 ? "#d6d0c4" : y === 30 || x === 30 ? "#8f8a80" : n < 0.25 ? "#a29c90" : hash(x, y, 13) < 0.06 ? "#8f8a80" : "#b8b2a6");
        }
        // feine Risse
        b.linie(5, 4, 10, 9, "#8f8a80"); b.linie(10, 9, 11, 14, "#8f8a80");
        b.linie(20, 19, 26, 23, "#8f8a80");
    }),
};


// ── Ausgabe ────────────────────────────────────────────────────────────────────
// ── Neue Stücke (06.11.) — Ordner steht dabei, die Katalogeinträge in ui/deko.js + Backend ──
const NEUE = {
    // Gänseblümchen: niedriges Polster mit vielen kleinen weißen Blüten
    gaensebluemchen: { ordner: "nature", zeichne() {
        const b = new Bild(48, 48);
        for (let i = 0; i < 10; i++) b.kugel(9 + i * 3.3, 38 - hash(i, 41) * 4, 4, 4, LAUB, 40 + i, 0.3);
        for (let i = 0; i < 14; i++) {
            const x = 9 + Math.floor(hash(i, 42) * 30), y = 26 + Math.floor(hash(42, i) * 12);
            b.linie(x, y + 1, x, y + 4, "#3f7a35");
            bluete(b, x, y, BLUETEN.weiss, "#f2c14e", 1.4);
        }
        b.umriss(UMRISS);
        return b;
    } },
    // Mohn: rote Blüten mit dunkler Mitte, ein paar Knospen
    mohn: { ordner: "nature", zeichne() {
        const b = new Bild(48, 48);
        const koepfe = [[12, 14], [22, 9], [32, 13], [38, 21], [17, 22], [28, 21]];
        for (const [x, y] of koepfe) b.linie(x, y + 2, 24 + (x - 24) * 0.4, 42, "#4f9a3c");
        for (let i = 0; i < 8; i++) b.kugel(11 + i * 3.7, 40 - hash(i, 43) * 3, 3.5, 4, LAUB, 50 + i, 0.3);
        for (const [x, y] of koepfe) {
            b.kugel(x, y, 3.3, 2.8, ["#ff7a6a", "#e8302a", "#a41a1a"], x + y, 0.1);
            b.px(x, y, "#2b1d12"); b.px(x + 1, y, "#2b1d12");
        }
        for (const [x, y] of [[8, 26], [36, 30]]) { b.linie(x, y + 1, x + 2, 40, "#4f9a3c"); b.kugel(x, y, 1.5, 2, LAUB, x, 0.05); }
        b.umriss(UMRISS);
        return b;
    } },
    // Lavendel: graugrüner Busch, aus dem dicke lila Ähren ragen
    lavendel: { ordner: "nature", zeichne() {
        const b = new Bild(48, 48);
        const aehren = [[10, 17], [14, 11], [18, 15], [22, 8], [26, 13], [30, 10], [34, 16], [38, 20]];
        for (const [x, oben] of aehren) {
            b.px(x, oben - 1, "#d8b4ff");
            for (let y = oben; y < oben + 12; y++) {
                const c = (y + x) % 3 === 0 ? "#d8b4ff" : (y + x) % 3 === 1 ? "#a87ae8" : "#7048b0";
                b.px(x, y, c); b.px(x + 1, y, y % 2 ? "#7048b0" : "#a87ae8");
            }
        }
        for (let i = 0; i < 8; i++) b.kugel(10 + i * 4, 35 - hash(i, 47) * 2, 5, 7, ["#a8c89a", "#7a9a6a", "#4f6a44"], 60 + i, 0.3);
        b.umriss(UMRISS);
        return b;
    } },
    // Große Sonnenblume, einzeln, 1×2: großer Kopf, kräftiger Stiel, breite Blätter
    sonnenblume: { ordner: "nature", zeichne() {
        const b = new Bild(48, 96);
        for (let y = 30; y < 92; y++) {
            const x = 22 + Math.round(Math.sin(y / 16));
            b.px(x, y, "#4f9a3c"); b.px(x + 1, y, "#3f7a35"); b.px(x + 2, y, "#2f6b2c");
        }
        for (const [x, y] of [[13, 50], [33, 58], [12, 70], [34, 80]]) {
            b.kugel(x, y, 9, 4.5, LAUB, x + y, 0.15);
            b.linie(x - 6, y, x + 6, y - 1, "#2f6b2c");
        }
        for (let y = 2; y < 43; y++) for (let x = 3; x < 46; x++) {
            const dx = x - 24, dy = y - 22;
            const r = Math.hypot(dx, dy);
            const w = Math.atan2(dy, dx);
            const zacke = 16 + Math.cos(w * 14) * 2.2;
            if (r < 10 || r > zacke) continue;
            const seg = Math.floor(((w + Math.PI) / (Math.PI * 2)) * 14) % 2;
            b.px(x, y, r > zacke - 1.2 ? "#e8a92a" : seg ? "#f2c84a" : "#ffe066");
        }
        b.kugel(24, 22, 11, 11, ["#a8743f", "#6e4426", "#4a2f1c"], 7, 0.04);
        for (let i = 0; i < 26; i++) b.px(16 + Math.floor(hash(i, 45) * 16), 14 + Math.floor(hash(45, i) * 16), i % 2 ? "#2b1d12" : "#8a5a2a");
        b.kugel(24, 93, 10, 2, LAUB, 4, 0.1);
        b.umriss(UMRISS);
        return b;
    } },
    // Pilze: zwei Fliegenpilze und ein brauner Steinpilz im Moos
    pilze: { ordner: "nature", zeichne() {
        const b = new Bild(48, 48);
        b.kugel(24, 41, 18, 4, LAUB, 70, 0.2);
        const pilz = (x, fuss, hoehe, breit, hut) => {
            b.rect(x - 2, fuss - hoehe, 4, hoehe, "#f0ead8");
            b.px(x + 1, fuss - hoehe + 1, "#c8c0a8");
            b.rect(x + 1, fuss - hoehe, 1, hoehe, "#d8d0b8");
            b.kugel(x, fuss - hoehe, breit, breit * 0.65, hut, x * fuss, 0.05);
            b.rect(x - breit, fuss - hoehe, breit * 2 + 1, 1, hut[2]);
        };
        pilz(17, 40, 11, 8, ["#ff7a6a", "#e8302a", "#a41a1a"]);
        pilz(31, 41, 7, 6, ["#ff7a6a", "#e8302a", "#a41a1a"]);
        pilz(38, 41, 5, 4, ["#c8925a", "#9a6a3a", "#6e4426"]);
        for (const [x, y] of [[13, 25], [19, 24], [16, 28], [22, 27], [29, 31], [33, 32]]) b.px(x, y, "#ffffff");
        b.umriss(UMRISS);
        return b;
    } },
    // Kürbis mit Ranke und Blatt
    kuerbis: { ordner: "nature", zeichne() {
        const b = new Bild(48, 48);
        b.kugel(34, 30, 7, 5, LAUB, 80, 0.2);
        b.linie(30, 28, 22, 26, "#3f7a35");
        for (const [x, rx] of [[15, 7], [33, 7], [24, 9]]) b.kugel(x, 34, rx, 9, ["#ffb45a", "#f2862a", "#b8561a"], x, 0.05);
        for (const x of [19, 29]) b.linie(x, 27, x, 42, "#c86a24");
        b.rect(22, 21, 4, 5, "#6e4426");
        b.px(23, 21, "#8a5a32");
        b.linie(26, 22, 30, 19, "#4f9a3c");
        b.umriss(UMRISS);
        return b;
    } },
    // Steinhaufen mit etwas Moos
    steine: { ordner: "objects", zeichne() {
        const b = new Bild(48, 40);
        const grau = (s) => [["#d6d0c4", "#a8a298", "#6f6c66"], ["#c8c2b4", "#9a948a", "#64615b"], ["#bcc4c8", "#8f989d", "#5d656a"]][s % 3];
        for (const [x, y, rx, ry, s] of [[14, 30, 10, 7, 0], [32, 31, 11, 6, 1], [23, 21, 9, 7, 2], [38, 22, 5, 4, 0], [8, 22, 4, 3, 1]]) b.kugel(x, y, rx, ry, grau(s), x * y, 0.15);
        for (let i = 0; i < 16; i++) b.px(10 + Math.floor(hash(i, 46) * 28), 16 + Math.floor(hash(46, i) * 10), i % 2 ? "#7fc25a" : "#4f9a3c");
        b.umriss(UMRISS);
        return b;
    } },
    // Bienenkorb aus Stroh auf einem Holzklotz, zwei Bienen
    bienenkorb: { ordner: "objects", zeichne() {
        const b = new Bild(48, 48);
        b.rect(12, 38, 24, 7, "#8a5a32");
        b.rect(12, 38, 24, 1, "#b07a45");
        b.rect(12, 44, 24, 1, "#4a2f1c");
        for (let y = 10; y < 38; y++) {
            const t = (y - 10) / 28;
            const halb = Math.round(5 + Math.sin(t * Math.PI * 0.62) * 10);
            const ring = Math.floor((y - 10) / 4) % 2;
            b.rect(24 - halb, y, halb * 2, 1, ring ? "#d9a84a" : "#e8c060");
            if ((y - 10) % 4 === 3) b.rect(24 - halb, y, halb * 2, 1, "#a87a2a");
            b.px(24 - halb, y, "#f2d68a");
            b.px(23 + halb, y, "#a87a2a");
        }
        b.kugel(24, 33, 3, 2.5, ["#4a2f1c", "#2b1d12", "#1a120c"], 3, 0.02);
        for (const [x, y] of [[38, 14], [9, 20]]) {
            b.px(x, y, "#f2c14e"); b.px(x + 1, y, "#2b1d12"); b.px(x + 2, y, "#f2c14e");
            b.px(x + 1, y - 1, "#e6f6fa"); b.px(x, y - 1, "#e6f6fa");
        }
        b.umriss(UMRISS);
        return b;
    } },
};

// ── Kiste und Vitrine (06.11.) — Bilder für den Werkzeug-Shop, wie die Möbel im Haus ──
const MOEBEL = {
    kiste: { ziel: "../tools/kiste.png", zeichne() {
        const b = new Bild(44, 34);
        // Deckel (leicht gewölbt) und Korpus
        b.rect(2, 4, 40, 10, "#b07a45");
        b.rect(4, 2, 36, 2, "#b07a45");
        b.rect(4, 2, 36, 1, "#d29e62");
        b.rect(2, 4, 40, 1, "#c99258");
        b.rect(2, 13, 40, 2, "#6e4426");
        b.rect(2, 15, 40, 17, "#9c6a3c");
        for (const y of [20, 26]) b.rect(2, y, 40, 1, "#7a4d2a");
        for (let i = 0; i < 14; i++) b.px(4 + Math.floor(hash(i, 81) * 36), 16 + Math.floor(hash(81, i) * 15), "#8a5a32");
        // Metallbänder und Ecken
        for (const x of [7, 33]) { b.rect(x, 2, 4, 30, "#5d5d66"); b.rect(x, 2, 1, 30, "#9a9aa4"); b.px(x + 2, 8, "#3b3b44"); b.px(x + 2, 24, "#3b3b44"); }
        // Schloss
        b.rect(19, 9, 6, 9, "#8a6a20");
        b.rect(19, 9, 6, 8, "#e0b24a");
        b.rect(19, 9, 6, 1, "#f2d36b");
        b.rect(21, 12, 2, 3, "#3b2516");
        b.umriss(UMRISS);
        return b;
    } },
    vitrine: { ziel: "../tools/vitrine.png", zeichne() {
        const b = new Bild(34, 48);
        b.rect(1, 0, 32, 5, "#8a5a32");
        b.rect(2, 0, 30, 1, "#b07a45");
        b.rect(0, 4, 34, 2, "#6e4426");
        b.rect(1, 6, 32, 38, "#6e4426");
        b.rect(3, 7, 28, 35, "#bfdfe6");
        // Regalbretter mit Ausstellungsstücken
        const stuecke = [
            [7, 14, ["#ff8a7a", "#e8403a", "#a82424"]], [17, 14, ["#fff08a", "#f2c84a", "#c8902a"]], [26, 14, ["#a8c8ff", "#6a8ee8", "#3f5ab0"]],
            [8, 25, ["#9ad66e", "#5faa45", "#3f7a35"]], [20, 25, ["#d8b4ff", "#a87ae8", "#7048b0"]],
            [7, 36, ["#ffc48a", "#f2903a", "#c0602a"]], [16, 36, ["#ffc4dc", "#f28ab4", "#c45a86"]], [26, 36, ["#fff3c4", "#e0b24a", "#a87414"]],
        ];
        for (const y of [17, 28, 39]) { b.rect(3, y, 28, 2, "#8a5a32"); b.rect(3, y, 28, 1, "#a8743f"); }
        for (const [x, y, farben] of stuecke) b.kugel(x, y, 2.6, 2.6, farben, x * y, 0.05);
        b.px(26, 11, "#ffffff"); b.px(17, 11, "#ffffff");
        // Glanz auf dem Glas und Mittelsprosse
        for (let i = 0; i < 7; i++) { b.px(5 + i, 13 - i, "#e8f6f9"); b.px(5 + i, 35 - i, "#e8f6f9"); }
        b.rect(16, 7, 2, 35, "#6e4426");
        b.rect(14, 22, 1, 4, "#e0b24a");
        b.rect(19, 22, 1, 4, "#e0b24a");
        b.rect(2, 44, 4, 4, "#4a2f1c");
        b.rect(28, 44, 4, 4, "#4a2f1c");
        b.umriss(UMRISS);
        return b;
    } },
};

// ── HUD-Symbole (06.11.) — statt brauner Knöpfe nur noch das Bild ──
const SYMBOLE = {
    // Editor: Hammer und Pinsel über Kreuz
    editor: { ziel: "../icons/hud/editor_pixel.png", zeichne() {
        const b = new Bild(34, 34);
        // Pinselstiel (von links unten nach rechts oben)
        for (let t = 0; t < 20; t++) { b.rect(5 + t, 28 - t, 3, 3, t < 13 ? "#c8925a" : "#9a9aa4"); b.px(5 + t, 28 - t, t < 13 ? "#e0b07a" : "#c8ccd4"); }
        // Pinselkopf mit Farbe
        b.rect(24, 3, 6, 6, "#e8403a");
        b.rect(25, 2, 4, 2, "#ff8a7a");
        b.px(29, 8, "#a82424");
        // Hammerstiel (von rechts unten nach links oben)
        for (let t = 0; t < 19; t++) { b.rect(27 - t, 28 - t, 3, 3, "#8a5a32"); b.px(27 - t, 28 - t, "#b07a45"); }
        // Hammerkopf quer
        b.rect(3, 5, 14, 6, "#6b737c");
        b.rect(3, 5, 14, 2, "#aab2ba");
        b.rect(3, 10, 14, 1, "#4b5259");
        b.rect(1, 6, 3, 4, "#4b5259");
        b.umriss(UMRISS);
        return b;
    } },
};

// ── Weitere HUD-Symbole (06.11.): oben links/rechts, Jahreszeiten, Rucksack zu/auf ──
function kreis(b, cx, cy, r, farbe) {
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) b.px(x, y, farbe);
    }
}
function katzenkopf(b, cx, cy, fell, dunkel) {
    kreis(b, cx, cy, 6, fell);
    for (const s of [-1, 1]) { b.rect(cx + s * 4 - (s < 0 ? 2 : 0), cy - 9, 3, 4, fell); b.px(cx + s * 4 + (s < 0 ? 0 : 1) - (s < 0 ? 1 : 0), cy - 8, "#f2a8b8"); }
    b.rect(cx - 3, cy - 1, 2, 2, "#2b1d12"); b.rect(cx + 2, cy - 1, 2, 2, "#2b1d12");
    b.px(cx, cy + 2, "#f2a8b8");
    b.px(cx - 5, cy + 3, dunkel); b.px(cx + 5, cy + 3, dunkel);
}
function rucksack(b, offen) {
    const KOERPER = ["#9aa65e", "#6f7a3e", "#4a5228"];
    // Tragegriff
    b.rect(16, 2, 10, 2, "#7a4a2a"); b.rect(15, 3, 2, 4, "#7a4a2a"); b.rect(25, 3, 2, 4, "#7a4a2a");
    // Körper
    b.rect(6, 10, 30, 32, KOERPER[1]);
    b.rect(6, 10, 3, 32, KOERPER[0]);
    b.rect(33, 10, 3, 32, KOERPER[2]);
    b.rect(6, 40, 30, 2, KOERPER[2]);
    // Fronttasche
    b.rect(11, 27, 20, 12, KOERPER[2]);
    b.rect(12, 28, 18, 10, "#5a6432");
    b.rect(12, 28, 18, 2, "#7a8646");
    for (let x = 13; x < 30; x += 2) b.px(x, 37, "#a8b06a");
    // Seitentaschen
    b.rect(2, 22, 4, 14, KOERPER[2]); b.rect(36, 22, 4, 14, KOERPER[2]);
    if (offen) {
        // Öffnung: dunkles Inneres mit Sachen, die herausschauen
        b.rect(7, 10, 28, 6, "#2b2f18");
        b.rect(11, 5, 5, 7, "#f3e3c3"); b.rect(12, 6, 3, 3, "#e8403a");         // Samentüte
        b.rect(19, 4, 2, 8, "#3f7a35"); b.rect(17, 3, 2, 3, "#5faa45"); b.rect(21, 2, 2, 3, "#7fc25a"); // Karottengrün
        b.rect(18, 10, 4, 3, "#f2862a");
        b.rect(25, 6, 6, 6, "#ffd84a"); b.rect(26, 7, 2, 2, "#fff3a0");        // Münze
        // Klappe nach hinten geschlagen
        b.rect(7, 0, 28, 4, KOERPER[0]); b.rect(7, 3, 28, 2, KOERPER[2]);
        for (const x of [13, 27]) b.rect(x, 0, 3, 5, "#7a4a2a");
    } else {
        // Klappe mit zwei Riemen und Schnallen
        b.rect(6, 8, 30, 12, KOERPER[0]);
        b.rect(6, 18, 30, 3, KOERPER[2]);
        for (let x = 8; x < 34; x += 2) b.px(x, 10, "#c8d08a");
        for (const x of [12, 27]) {
            b.rect(x, 8, 3, 22, "#7a4a2a"); b.rect(x, 8, 1, 22, "#9a6a3a");
            b.rect(x - 1, 22, 5, 4, "#e0b24a"); b.rect(x, 23, 3, 2, "#7a5a1a");
        }
    }
    b.umriss(UMRISS);
}
SYMBOLE.zahnrad = { ziel: "../icons/hud/zahnrad_pixel.png", zeichne() {
    const b = new Bild(34, 34);
    for (let i = 0; i < 8; i++) {
        const w = (i / 8) * Math.PI * 2;
        b.rect(Math.round(17 + Math.cos(w) * 12) - 3, Math.round(17 + Math.sin(w) * 12) - 3, 6, 6, "#8a939c");
    }
    kreis(b, 17, 17, 11, "#8a939c");
    kreis(b, 17, 17, 9, "#aab2ba");
    for (let i = 0; i < 6; i++) b.px(10 + i, 12 - Math.floor(i / 2), "#d0d6dc");
    kreis(b, 17, 17, 4, "#5d636c");
    kreis(b, 17, 17, 2.2, "#2e3338");
    b.umriss(UMRISS);
    return b;
} };
SYMBOLE.online = { ziel: "../icons/hud/online_pixel.png", zeichne() {
    const b = new Bild(38, 30);
    katzenkopf(b, 12, 17, "#c8925a", "#8a5a2a");
    katzenkopf(b, 25, 15, "#f2862a", "#b8561a");
    b.umriss(UMRISS);
    return b;
} };
SYMBOLE.tiere = { ziel: "../icons/hud/tiere_pixel.png", zeichne() {
    const b = new Bild(34, 34);
    // Pfote: großer Ballen + vier Zehen
    kreis(b, 17, 22, 8, "#c8925a");
    b.rect(10, 22, 15, 6, "#c8925a");
    for (const [x, y] of [[7, 13], [13, 8], [21, 8], [27, 13]]) kreis(b, x, y, 3.8, "#c8925a");
    kreis(b, 17, 22, 5, "#f2a8b8");
    for (const [x, y] of [[7, 13], [13, 8], [21, 8], [27, 13]]) kreis(b, x, y, 2, "#f2a8b8");
    b.umriss(UMRISS);
    return b;
} };
SYMBOLE.chat = { ziel: "../icons/hud/chat_pixel.png", zeichne() {
    const b = new Bild(36, 32);
    b.rect(3, 3, 30, 20, "#fff3c4");
    b.rect(3, 3, 30, 2, "#ffffff");
    b.rect(3, 21, 30, 2, "#e0cfa0");
    b.rect(8, 23, 6, 3, "#fff3c4"); b.rect(8, 26, 3, 3, "#fff3c4"); b.rect(6, 28, 3, 2, "#fff3c4");
    for (const x of [11, 17, 23]) b.rect(x, 11, 3, 3, "#6e4426");
    b.umriss(UMRISS);
    return b;
} };
SYMBOLE.admin = { ziel: "../icons/hud/admin_pixel.png", zeichne() {
    const b = new Bild(34, 34);
    for (let t = 0; t < 18; t++) b.rect(7 + t, 25 - t, 4, 4, t < 16 ? "#8a939c" : "#aab2ba");
    for (let t = 0; t < 18; t++) b.px(8 + t, 25 - t, "#c8ccd4");
    kreis(b, 25, 8, 6, "#8a939c");
    // Maulöffnung herausschneiden
    for (let y = 0; y < 8; y++) for (let x = 23; x < 28; x++) b.d[(y * b.w + x) * 4 + 3] = 0;
    kreis(b, 25, 8, 2.5, "#2e3338");
    kreis(b, 8, 26, 4, "#e0b24a");
    b.umriss(UMRISS);
    return b;
} };
SYMBOLE.fruehling = { ziel: "../icons/hud/saison_fruehling.png", zeichne() {
    const b = new Bild(30, 30);
    for (let i = 0; i < 5; i++) { const w = (i / 5) * Math.PI * 2 - Math.PI / 2; kreis(b, 15 + Math.cos(w) * 7, 15 + Math.sin(w) * 7, 5.2, "#f7a8c8"); kreis(b, 15 + Math.cos(w) * 7.5, 15 + Math.sin(w) * 7.5 - 1, 2.5, "#ffd6e6"); }
    kreis(b, 15, 15, 3.5, "#f2c14e"); b.px(14, 14, "#fff3a0");
    b.umriss(UMRISS);
    return b;
} };
SYMBOLE.sommer = { ziel: "../icons/hud/saison_sommer.png", zeichne() {
    const b = new Bild(30, 30);
    for (let i = 0; i < 8; i++) { const w = (i / 8) * Math.PI * 2; b.rect(Math.round(15 + Math.cos(w) * 11) - 1, Math.round(15 + Math.sin(w) * 11) - 1, 3, 3, "#f2a03a"); }
    kreis(b, 15, 15, 7.5, "#ffd84a");
    kreis(b, 13, 13, 3, "#fff3a0");
    b.umriss(UMRISS);
    return b;
} };
SYMBOLE.herbst = { ziel: "../icons/hud/saison_herbst.png", zeichne() {
    const b = new Bild(30, 30);
    // Ahornblatt: drei Spitzen + Stiel
    for (let y = 4; y < 24; y++) for (let x = 3; x < 27; x++) {
        const dx = x - 15, dy = y - 15;
        const w = Math.atan2(dy, dx), r = Math.hypot(dx, dy);
        const rand = 8 + 3 * Math.abs(Math.sin(w * 2.5)) + (dy < 0 ? 1 : -1);
        if (r < rand && dy < 7) b.px(x, y, r < rand - 3 ? "#e8762a" : "#c8501a");
    }
    for (let y = 8; y < 28; y++) b.px(15, y, "#8a3a14");
    b.linie(15, 18, 9, 12, "#a84a1a"); b.linie(15, 18, 21, 12, "#a84a1a");
    b.umriss(UMRISS);
    return b;
} };
SYMBOLE.winter = { ziel: "../icons/hud/saison_winter.png", zeichne() {
    // 11.11.: neu gezeichnet — die alte Flocke aus dünnen Linien mit vielen Querstrichen
    // las sich wie ein Spinnennetz. Jetzt: vier dicke Arme, kurze Schrägen, je zwei Zacken.
    const b = new Bild(30, 30);
    const HELL = "#ffffff", MITTE = "#cdeaf6", DUNKEL = "#8fc6e0";
    // Kreuz: senkrecht und waagrecht, drei Punkte dick
    b.rect(14, 3, 3, 25, MITTE); b.rect(3, 14, 25, 3, MITTE);
    b.rect(15, 3, 1, 25, HELL); b.rect(3, 15, 25, 1, HELL);
    // Zacken an den vier Armen: ein Winkel nach außen
    for (const [x, y, dx, dy] of [[15, 6, 0, -1], [15, 24, 0, 1], [6, 15, -1, 0], [24, 15, 1, 0]]) {
        for (let t = 1; t <= 3; t++) {
            if (dx === 0) { b.rect(x - t - 1, y + dy * t, 2, 2, DUNKEL); b.rect(x + t, y + dy * t, 2, 2, DUNKEL); }
            else { b.rect(x + dx * t, y - t - 1, 2, 2, DUNKEL); b.rect(x + dx * t, y + t, 2, 2, DUNKEL); }
        }
    }
    // Kurze Schrägen zwischen den Armen
    for (let t = 3; t <= 7; t++) for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) b.rect(15 + sx * t - 1, 15 + sy * t - 1, 2, 2, MITTE);
    // Kern
    b.rect(13, 13, 5, 5, HELL);
    b.umriss("#2f5a7a");
    return b;
} };
SYMBOLE.rucksack_zu = { ziel: "../tools/rucksack_zu.png", zeichne() { const b = new Bild(42, 44); rucksack(b, false); return b; } };
SYMBOLE.rucksack_auf = { ziel: "../tools/rucksack_auf.png", zeichne() { const b = new Bild(42, 44); rucksack(b, true); return b; } };

// ── Profil-Symbole (06.11.): Fähigkeiten und Logbuch ──
SYMBOLE.faehigkeiten = { ziel: "../icons/hud/faehigkeiten_pixel.png", zeichne() {
    const b = new Bild(36, 36);
    // Topf
    b.rect(10, 26, 16, 4, "#c8643a"); b.rect(10, 26, 16, 1, "#e08a5a");
    for (let y = 30; y < 35; y++) { const e = y - 30; b.rect(12 + e / 2, y, 12 - e, 1, "#a8543a"); }
    // Setzling mit drei Blättern
    b.rect(17, 12, 2, 14, "#3f7a35");
    b.kugel(12, 17, 5, 3, ["#9ad66e", "#5faa45", "#3f7a35"], 3, 0.1);
    b.kugel(24, 14, 5, 3, ["#9ad66e", "#5faa45", "#3f7a35"], 4, 0.1);
    b.kugel(18, 9, 3.5, 4, ["#9ad66e", "#5faa45", "#3f7a35"], 5, 0.1);
    // Stern oben rechts
    const stern = [[29, 2], [28, 4], [29, 4], [30, 4], [26, 5], [27, 5], [28, 5], [29, 5], [30, 5], [31, 5], [32, 5], [28, 6], [29, 6], [30, 6], [27, 7], [28, 7], [30, 7], [31, 7]];
    for (const [x, y] of stern) b.px(x, y, "#ffd84a");
    b.px(29, 5, "#fff3a0");
    b.umriss(UMRISS);
    return b;
} };
SYMBOLE.logbuch = { ziel: "../icons/hud/logbuch_pixel.png", zeichne() {
    const b = new Bild(36, 36);
    // Seiten (rechts sichtbar) und Ledereinband
    b.rect(8, 5, 22, 27, "#f3e3c3");
    for (let y = 7; y < 31; y += 2) b.px(29, y, "#c9b48a");
    b.rect(5, 3, 22, 28, "#8a4a2a");
    b.rect(5, 3, 3, 28, "#6a3420");
    b.rect(8, 3, 19, 1, "#a8603a");
    // Prägung: Blatt im Rahmen
    b.rect(11, 9, 12, 12, "#e0b24a");
    b.rect(12, 10, 10, 10, "#8a4a2a");
    b.kugel(17, 15, 3, 4, ["#9ad66e", "#5faa45", "#3f7a35"], 6, 0.05);
    b.px(17, 19, "#3f7a35"); b.px(17, 20, "#3f7a35");
    // Lesezeichen
    b.rect(21, 28, 3, 6, "#c8403a");
    b.umriss(UMRISS);
    return b;
} };

const EINTRAEGE = [
    ...Object.entries(SYMBOLE).map(([id, n]) => ({ id: `symbol_${id}`, ziel: n.ziel, zeichne: n.zeichne, art: "deko" })),
    ...Object.entries(MOEBEL).map(([id, n]) => ({ id: `moebel_${id}`, ziel: n.ziel, zeichne: n.zeichne, art: "deko" })),
    ...Object.entries(NEUE).map(([id, n]) => ({ id, ziel: `${n.ordner}/${id}.png`, zeichne: n.zeichne, art: "deko" })),
    ...Object.keys(ZEICHNER).map((id) => ({ id, ziel: `nature/${id}.png`, zeichne: ZEICHNER[id], art: "deko" })),
    ...Object.keys(BOEDEN).map((id) => ({ id: `boden_${id}`, ziel: `texture/${id}.jpg`, zeichne: BOEDEN[id], art: "boden" })),
];

async function alsDatei(e) {
    const b = e.zeichne();
    let roh = sharp(Buffer.from(b.d.buffer), { raw: { width: b.w, height: b.h, channels: 4 } });
    if (e.art === "boden") {
        return roh.resize(b.w * 8, b.h * 8, { kernel: "nearest" }).flatten({ background: "#000000" })
            .jpeg({ quality: 100, chromaSubsampling: "4:4:4" }).toBuffer();
    }
    // Rand weg wie bei den ComfyUI-Bildern, dann doppelt vergrößert
    const { data, info } = await roh.trim({ threshold: 0 }).raw().toBuffer({ resolveWithObject: true });
    return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
        .resize(info.width * 2, info.height * 2, { kernel: "nearest" }).png({ palette: true, colours: 64 }).toBuffer();
}

async function bogen(datei, liste) {
    const Z = 160, RAND = 12, KOPF = 20;
    const spalten = 4;
    const zeilen = Math.ceil(liste.length / spalten);
    const zw = Z * 2 + RAND * 3, zh = Z + KOPF + RAND;
    const teile = [];
    for (const [i, e] of liste.entries()) {
        const x0 = (i % spalten) * zw, y0 = Math.floor(i / spalten) * zh;
        const alt = path.join(ASSETS, e.ziel);
        const neu = path.join(VORSCHAU, path.basename(e.ziel));
        for (const [j, quelle] of [[0, alt], [1, neu]]) {
            if (!fs.existsSync(quelle)) continue;
            const bild = await sharp(quelle).resize(Z, Z, { fit: "contain", kernel: "nearest", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
            teile.push({ input: bild, left: x0 + RAND + j * (Z + RAND), top: y0 + KOPF });
        }
        const text = `<svg width="${zw}" height="${KOPF}"><text x="${RAND}" y="15" font-family="sans-serif" font-size="13" fill="#333">${e.id} — alt | neu</text></svg>`;
        teile.push({ input: Buffer.from(text), left: x0, top: y0 });
    }
    await sharp({ create: { width: zw * spalten, height: zh * zeilen, channels: 4, background: "#9ccf6a" } })
        .composite(teile).png().toFile(datei);
    console.log(`Bogen → ${datei}`);
}

const args = process.argv.slice(2);
const uebernehmen = args.includes("--uebernehmen");
const nurIds = uebernehmen && args[args.indexOf("--uebernehmen") + 1] && !args[args.indexOf("--uebernehmen") + 1].startsWith("--")
    ? new Set(args[args.indexOf("--uebernehmen") + 1].split(",")) : null;
const bogenDatei = args.includes("--bogen") ? args[args.indexOf("--bogen") + 1] : null;

fs.mkdirSync(VORSCHAU, { recursive: true });
const liste = EINTRAEGE.filter((e) => !nurIds || nurIds.has(e.id));
for (const e of liste) {
    const buf = await alsDatei(e);
    fs.writeFileSync(path.join(VORSCHAU, path.basename(e.ziel)), buf);
    if (uebernehmen) {
        const ziel = path.join(ASSETS, e.ziel);
        if (fs.existsSync(ziel)) {
            fs.mkdirSync(BACKUP, { recursive: true });
            fs.copyFileSync(ziel, path.join(BACKUP, `${Date.now()}_deco__${e.ziel.replaceAll("/", "__")}`));
        }
        fs.writeFileSync(ziel, buf);
        console.log(`  → deco/${e.ziel} (${Math.round(buf.length / 1024)} KB)`);
    }
}
console.log(`${liste.length} Bilder gezeichnet → ${VORSCHAU}`);
if (bogenDatei) await bogen(bogenDatei, liste);
