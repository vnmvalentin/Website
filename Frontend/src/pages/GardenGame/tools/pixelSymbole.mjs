#!/usr/bin/env node
// tools/pixelSymbole.mjs — alle Symbole der Farm im Pixel-Look, im Code gezeichnet (06.11.).
// Überschreibt die Bilder unter public/garden-assets/icons/… unter ihrem bisherigen Namen,
// damit gameIcons.jsx und alle Stellen im Spiel unverändert bleiben.
//
// AUFRUF
//   node src/pages/GardenGame/tools/pixelSymbole.mjs                → Vorschau garden-art-vorschau/code_symbole/ + Bogen
//   node src/pages/GardenGame/tools/pixelSymbole.mjs --uebernehmen  → ins Spiel (alte Bilder nach _backup/)
//
// Raster 20×20 (Ausgabe vierfach), dunkler Umriss außen — wie die übrigen Code-Bilder
// (pixelDeko.mjs). Farben aus derselben Palette.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const hier = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(hier, "../../../..");
const ICONS = path.join(FRONTEND, "public", "garden-assets", "icons");
const VORSCHAU = path.join(FRONTEND, "garden-art-vorschau", "code_symbole");
const BACKUP = path.join(FRONTEND, "garden-art-vorschau", "_backup");
const N = 20, SKALA = 4;

const hex = (c) => { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
class Bild {
    constructor(w = N, h = N) { this.w = w; this.h = h; this.d = new Uint8ClampedArray(w * h * 4); }
    px(x, y, c) {
        x = Math.round(x); y = Math.round(y);
        if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
        const i = (y * this.w + x) * 4;
        if (c === null) { this.d[i + 3] = 0; return; }
        const [r, g, b] = hex(c); this.d[i] = r; this.d[i + 1] = g; this.d[i + 2] = b; this.d[i + 3] = 255;
    }
    hat(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h && this.d[(y * this.w + x) * 4 + 3] > 0; }
    rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c); }
    kreis(cx, cy, r, c) { for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) this.px(x, y, c); }
    ring(cx, cy, r, dicke, c) { for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) { const d = Math.hypot(x - cx, y - cy); if (d <= r && d > r - dicke) this.px(x, y, c); } }
    linie(x0, y0, x1, y1, c, dicke = 1) {
        const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
        for (let i = 0; i <= n; i++) { const x = x0 + ((x1 - x0) * i) / n, y = y0 + ((y1 - y0) * i) / n; this.rect(Math.round(x - (dicke - 1) / 2), Math.round(y - (dicke - 1) / 2), dicke, dicke, c); }
    }
    poly(punkte, c) {
        const ys = punkte.map((p) => p[1]);
        for (let y = Math.floor(Math.min(...ys)); y <= Math.max(...ys); y++) for (let x = 0; x < this.w; x++) {
            let innen = false;
            for (let i = 0, j = punkte.length - 1; i < punkte.length; j = i++) {
                const [xi, yi] = punkte[i], [xj, yj] = punkte[j];
                if ((yi > y + 0.5) !== (yj > y + 0.5) && x + 0.5 < ((xj - xi) * (y + 0.5 - yi)) / (yj - yi) + xi) innen = !innen;
            }
            if (innen) this.px(x, y, c);
        }
    }
    umriss(c = "#2b1d12") {
        const neu = [];
        for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
            if (this.hat(x, y)) continue;
            if (this.hat(x - 1, y) || this.hat(x + 1, y) || this.hat(x, y - 1) || this.hat(x, y + 1)) neu.push([x, y]);
        }
        for (const [x, y] of neu) this.px(x, y, c);
        return this;
    }
}

// ── Bausteine ──────────────────────────────────────────────────────────────────
const F = {
    gold: ["#fff3a0", "#ffd84a", "#e0a82a", "#a87414"], holz: ["#d29e62", "#b07a45", "#8a5a32", "#6e4426"],
    gruen: ["#9ad66e", "#5faa45", "#3f7a35"], rot: ["#ff8a7a", "#e8403a", "#a82424"], blau: ["#a8c8ff", "#5a82d8", "#2f5a9a"],
    grau: ["#d0d6dc", "#aab2ba", "#6b737c", "#4b5259"], creme: ["#fffaf0", "#f3e3c3", "#c9b48a"], lila: ["#d8b4ff", "#9a68d8", "#6a40a8"],
    wolke: ["#ffffff", "#e8eef2", "#b8c4cc"], eis: ["#e8f6f9", "#bfe6f2", "#7ec8e8"],
};
const muenze = (b, cx, cy, r) => { b.kreis(cx, cy, r, F.gold[2]); b.kreis(cx - 0.5, cy - 0.5, r - 1, F.gold[1]); b.rect(Math.round(cx) - 1, Math.round(cy - r + 3), 2, Math.round(r * 2 - 5), F.gold[3]); b.px(cx - r / 2, cy - r / 2, F.gold[0]); };
const wolke = (b, y = 0) => { b.kreis(7, 9 + y, 4, F.wolke[1]); b.kreis(12, 7 + y, 5, F.wolke[0]); b.kreis(15, 10 + y, 3.5, F.wolke[1]); b.rect(4, 10 + y, 13, 3, F.wolke[1]); b.rect(4, 12 + y, 13, 1, F.wolke[2]); };
const pfeilRechts = (b, x0, y, x1, c) => { b.linie(x0, y, x1 - 1, y, c, 3); b.poly([[x1 - 4, y - 5], [x1 + 2, y], [x1 - 4, y + 5]], c); };
const haus = (b, dach, wand) => { b.poly([[2, 9], [10, 2], [18, 9]], dach[1]); b.linie(2, 9, 10, 2, dach[2]); b.linie(10, 2, 18, 9, dach[2]); b.rect(4, 9, 12, 9, wand[1]); b.rect(4, 9, 12, 1, wand[2]); b.rect(8, 12, 4, 6, F.holz[3]); b.px(11, 15, F.gold[1]); };
const stand = (b, markise) => { for (let x = 2; x < 18; x++) b.rect(x, 3, 1, 4, Math.floor((x - 2) / 3) % 2 ? markise : "#fffaf0"); for (let x = 2; x < 18; x += 3) b.px(x + 1, 7, markise); b.rect(3, 7, 2, 11, F.holz[2]); b.rect(15, 7, 2, 11, F.holz[2]); b.rect(3, 12, 14, 5, F.holz[1]); b.rect(3, 12, 14, 1, F.holz[0]); };

// ── Alle Symbole: Ziel relativ zu icons/ → Zeichner ────────────────────────────
const S = {
    "hud/gold": (b) => muenze(b, 10, 10, 8),
    "hud/gold_lifetime": (b) => { for (const [y, x] of [[15, 6], [12, 7], [9, 6]]) { b.rect(x - 4, y, 12, 4, F.gold[2]); b.rect(x - 4, y, 12, 1, F.gold[1]); } muenze(b, 14, 6, 4.5); },
    "hud/level": (b) => { b.poly([[10, 1], [12.5, 7], [19, 7.5], [14, 11.5], [15.5, 18], [10, 14.5], [4.5, 18], [6, 11.5], [1, 7.5], [7.5, 7]], F.lila[1]); b.poly([[10, 4], [11.5, 8], [15, 8.5], [12, 11], [12.5, 14], [10, 12.5]], F.lila[0]); },
    "hud/locked": (b) => { b.ring(10, 7, 5, 2, F.grau[2]); b.rect(3, 9, 14, 10, F.gold[2]); b.rect(3, 9, 14, 2, F.gold[1]); b.rect(9, 12, 2, 4, F.holz[3]); },
    "hud/check": (b) => { b.linie(3, 10, 8, 15, F.gruen[1], 3); b.linie(8, 15, 17, 4, F.gruen[1], 3); b.linie(4, 9, 8, 13, F.gruen[0]); },
    "hud/close": (b) => { b.linie(4, 4, 16, 16, F.rot[1], 3); b.linie(16, 4, 4, 16, F.rot[1], 3); },
    "hud/palette": (b) => { b.kreis(10, 10, 8.5, F.holz[0]); b.kreis(13, 13, 2.5, null); for (const [x, y, c] of [[6, 7, F.rot[1]], [10, 5, F.gold[1]], [14, 7, F.blau[1]], [6, 12, F.gruen[1]]]) b.kreis(x, y, 1.6, c); },
    "hud/star": (b) => { b.poly([[10, 1], [12.5, 7], [19, 7.5], [14, 11.5], [15.5, 18], [10, 14.5], [4.5, 18], [6, 11.5], [1, 7.5], [7.5, 7]], F.gold[1]); b.poly([[10, 4], [11.5, 8], [15, 8.5], [12, 11], [12.5, 14], [10, 12.5]], F.gold[0]); },
    "hud/mailbox": (b) => { b.rect(3, 5, 13, 8, F.rot[1]); b.kreis(9, 5, 6, F.rot[1]); b.rect(3, 4, 13, 2, F.rot[0]); b.rect(9, 13, 2, 6, F.holz[2]); b.rect(15, 2, 2, 7, F.holz[3]); b.rect(17, 2, 3, 3, F.gold[1]); b.rect(5, 8, 7, 2, F.rot[2]); },
    "hud/send": (b) => { b.poly([[1, 9], [19, 2], [12, 18], [9, 11]], F.creme[1]); b.poly([[9, 11], [19, 2], [12, 18]], F.creme[2]); },
    "hud/move_one": (b) => pfeilRechts(b, 2, 10, 15, F.gruen[1]),
    "hud/move_all": (b) => { pfeilRechts(b, 1, 6, 13, F.gruen[1]); pfeilRechts(b, 4, 14, 16, F.gruen[2]); },
    "hud/reposition": (b) => { b.linie(10, 3, 10, 17, F.blau[1], 2); b.linie(3, 10, 17, 10, F.blau[1], 2); for (const [x, y, p] of [[10, 1, [[7, 4], [10, 0], [13, 4]]], [10, 19, [[7, 16], [10, 19], [13, 16]]], [1, 10, [[4, 7], [0, 10], [4, 13]]], [19, 10, [[16, 7], [19, 10], [16, 13]]]]) { void x; void y; b.poly(p, F.blau[1]); } },
    "hud/ruler": (b) => { b.poly([[1, 14], [14, 1], [19, 6], [6, 19]], F.gold[1]); for (let i = 0; i < 6; i++) b.linie(4 + i * 2, 13 - i * 2, 6 + i * 2, 15 - i * 2, F.gold[3]); },
    "hud/search": (b) => { b.ring(8, 8, 6, 2, F.grau[2]); b.kreis(8, 8, 4, F.eis[1]); b.px(6, 6, "#ffffff"); b.linie(12, 12, 18, 18, F.holz[2], 3); },
    "hud/back": (b) => { b.poly([[1, 10], [8, 3], [8, 7], [17, 7], [17, 13], [8, 13], [8, 17]], F.blau[1]); b.rect(8, 7, 9, 2, F.blau[0]); },
    "hud/invite": (b) => { b.rect(1, 5, 14, 11, F.creme[1]); b.linie(1, 5, 8, 11, F.creme[2]); b.linie(15, 5, 8, 11, F.creme[2]); b.kreis(15, 14, 4.5, F.gruen[1]); b.rect(14, 11, 2, 7, "#ffffff"); b.rect(12, 13, 6, 2, "#ffffff"); },
    "hud/trusted": (b) => { b.poly([[10, 1], [18, 4], [16, 13], [10, 19], [4, 13], [2, 4]], F.blau[1]); b.linie(6, 10, 9, 13, "#ffffff", 2); b.linie(9, 13, 14, 6, "#ffffff", 2); },
    "hud/revoke": (b) => { b.poly([[10, 1], [18, 4], [16, 13], [10, 19], [4, 13], [2, 4]], F.rot[1]); b.linie(6, 6, 14, 14, "#ffffff", 2); b.linie(14, 6, 6, 14, "#ffffff", 2); },
    "hud/remove": (b) => muelltonne(b),
    "hud/muell_pixel": (b) => muelltonne(b),
    "hud/inventory": (b) => { b.rect(4, 6, 12, 13, "#6f7a3e"); b.rect(4, 6, 12, 5, "#9aa65e"); b.rect(7, 2, 6, 2, F.holz[2]); b.rect(6, 3, 2, 3, F.holz[2]); b.rect(12, 3, 2, 3, F.holz[2]); b.rect(6, 13, 8, 5, "#5a6432"); b.rect(9, 9, 2, 3, F.gold[1]); },
    "hud/farm": (b) => { b.poly([[1, 10], [10, 2], [19, 10]], F.rot[2]); b.rect(3, 10, 14, 9, F.rot[1]); b.rect(7, 12, 6, 7, "#fffaf0"); b.linie(7, 12, 13, 19, F.rot[1]); b.linie(13, 12, 7, 19, F.rot[1]); b.rect(9, 6, 2, 2, "#fffaf0"); },
    "hud/sell_area": (b) => { stand(b, F.rot[1]); muenze(b, 10, 14, 3.5); },
    "hud/shop_area": (b) => { stand(b, F.gruen[1]); b.kreis(7, 14, 1.8, F.rot[1]); b.kreis(10, 14, 1.8, F.gold[1]); b.kreis(13, 14, 1.8, F.lila[1]); },
    "hud/players": (b) => { b.kreis(7, 11, 5, "#c8925a"); b.kreis(13, 10, 5, "#f2862a"); b.rect(3, 4, 2, 3, "#c8925a"); b.rect(9, 4, 2, 3, "#c8925a"); b.rect(10, 3, 2, 3, "#f2862a"); b.rect(15, 3, 2, 3, "#f2862a"); b.rect(11, 9, 1, 1, "#2b1d12"); b.rect(15, 9, 1, 1, "#2b1d12"); b.rect(5, 10, 1, 1, "#2b1d12"); b.rect(8, 10, 1, 1, "#2b1d12"); },
    "hud/chat": (b) => { b.rect(1, 2, 18, 12, F.creme[0]); b.rect(1, 12, 18, 2, F.creme[2]); b.poly([[4, 14], [8, 14], [3, 19]], F.creme[0]); for (const x of [5, 9, 13]) b.rect(x, 7, 2, 2, F.holz[3]); },
    "hud/settings": (b) => { for (let i = 0; i < 8; i++) { const w = (i / 8) * Math.PI * 2; b.rect(Math.round(10 + Math.cos(w) * 7.5) - 2, Math.round(10 + Math.sin(w) * 7.5) - 2, 4, 4, F.grau[2]); } b.kreis(10, 10, 6.5, F.grau[2]); b.kreis(10, 10, 5, F.grau[1]); b.kreis(10, 10, 2.5, F.grau[3]); },
    "hud/changelog": (b) => { b.rect(3, 3, 14, 15, F.creme[1]); b.rect(2, 2, 16, 3, F.creme[2]); b.rect(2, 16, 16, 3, F.creme[2]); for (const y of [7, 10, 13]) b.rect(5, y, 10, 1, F.holz[2]); b.rect(5, 7, 2, 1, F.rot[1]); },
    "hud/world_code": (b) => { b.ring(6, 10, 5, 3, F.gold[1]); b.rect(10, 9, 9, 3, F.gold[1]); b.rect(14, 12, 2, 3, F.gold[1]); b.rect(17, 12, 2, 4, F.gold[1]); b.kreis(6, 10, 1.5, null); },
    "hud/party": (b) => { b.poly([[2, 18], [7, 5], [15, 13]], F.lila[1]); b.linie(4, 13, 10, 16, F.gold[1]); b.linie(6, 9, 13, 13, F.gold[1]); for (const [x, y, c] of [[13, 3, F.rot[1]], [17, 6, F.gold[1]], [15, 9, F.blau[1]], [10, 2, F.gruen[1]]]) b.rect(x, y, 2, 2, c); },
    "hud/chevron": (b) => { b.linie(3, 7, 10, 14, F.creme[1], 3); b.linie(10, 14, 17, 7, F.creme[1], 3); },
    "hud/editor": (b) => { b.linie(4, 17, 16, 5, F.holz[1], 2); b.rect(2, 3, 9, 4, F.grau[2]); b.rect(2, 3, 9, 1, F.grau[1]); b.linie(16, 17, 6, 7, "#c8925a", 2); b.rect(14, 2, 4, 4, F.rot[1]); },
    "hud/wardrobe": (b) => { b.poly([[1, 6], [6, 2], [8, 4], [12, 4], [14, 2], [19, 6], [16, 9], [15, 8], [15, 18], [5, 18], [5, 8], [4, 9]], F.blau[1]); b.rect(5, 12, 10, 1, F.blau[2]); },
    "hud/logbuch": (b) => { b.rect(4, 2, 13, 17, F.creme[1]); b.rect(2, 1, 13, 17, "#8a4a2a"); b.rect(2, 1, 2, 17, "#6a3420"); b.rect(6, 5, 7, 7, F.gold[1]); b.rect(7, 6, 5, 5, "#8a4a2a"); b.kreis(9.5, 8.5, 1.6, F.gruen[1]); b.rect(11, 16, 2, 4, F.rot[1]); },
    "hud/kiste": (b) => { b.rect(1, 6, 18, 12, F.holz[1]); b.rect(1, 3, 18, 5, F.holz[0]); b.rect(1, 8, 18, 1, F.holz[3]); b.rect(4, 3, 2, 15, F.grau[2]); b.rect(14, 3, 2, 15, F.grau[2]); b.rect(8, 6, 4, 5, F.gold[1]); b.rect(9, 8, 2, 2, F.holz[3]); },
    "hud/vitrine": (b) => { b.rect(3, 1, 14, 18, F.holz[3]); b.rect(5, 3, 10, 14, F.eis[1]); b.rect(5, 8, 10, 1, F.holz[2]); b.rect(5, 13, 10, 1, F.holz[2]); b.kreis(8, 6, 1.6, F.rot[1]); b.kreis(12, 11, 1.6, F.gold[1]); b.kreis(9, 15, 1.4, F.gruen[1]); b.rect(9, 3, 2, 14, F.holz[3]); },
    "hud/gold_shop": (b) => { stand(b, F.gold[1]); muenze(b, 10, 14, 3.5); },
    "hud/tools": (b) => { b.linie(3, 17, 14, 6, F.holz[1], 2); b.rect(11, 2, 7, 4, F.grau[2]); b.linie(16, 17, 5, 6, F.grau[2], 2); b.ring(4, 5, 3, 2, F.grau[2]); },
    "hud/shed": (b) => haus(b, F.rot, F.holz),
    "hud/nameplate": (b) => { b.rect(1, 6, 18, 9, F.creme[1]); b.rect(1, 6, 18, 2, F.creme[0]); b.rect(1, 13, 18, 2, F.creme[2]); for (const x of [4, 8, 12]) b.rect(x, 10, 3, 2, F.holz[2]); b.rect(9, 2, 2, 4, F.holz[2]); },
    "weather/sun": (b) => { for (let i = 0; i < 8; i++) { const w = (i / 8) * Math.PI * 2; b.rect(Math.round(10 + Math.cos(w) * 8) - 1, Math.round(10 + Math.sin(w) * 8) - 1, 2, 2, "#f2a03a"); } b.kreis(10, 10, 5, F.gold[1]); b.kreis(9, 9, 2, F.gold[0]); },
    "weather/rain": (b) => { wolke(b, -2); for (const x of [6, 10, 14]) b.linie(x, 14, x - 1, 18, F.blau[1], 2); },
    "weather/snow": (b) => { wolke(b, -2); for (const x of [6, 10, 14]) { b.rect(x - 1, 16, 3, 1, "#ffffff"); b.rect(x, 15, 1, 3, "#ffffff"); } },
    "weather/thunder": (b) => { wolke(b, -2); b.poly([[11, 12], [7, 17], [10, 17], [8, 20], [14, 14], [11, 14]], F.gold[1]); },
    "weather/moonlight": (b) => { b.kreis(10, 10, 8, F.gold[0]); b.kreis(14, 7, 7, null); b.px(16, 14, "#ffffff"); b.px(17, 4, "#ffffff"); },
    "tabs/seed": (b) => { b.kreis(10, 11, 6, "#c8925a"); b.kreis(9, 10, 3, "#e0b07a"); b.linie(10, 5, 13, 2, F.gruen[1], 2); },
    "tabs/plant": (b) => { b.rect(9, 8, 2, 10, F.gruen[2]); b.kreis(6, 9, 4, F.gruen[1]); b.kreis(14, 7, 4, F.gruen[1]); b.kreis(5, 8, 1.5, F.gruen[0]); b.rect(5, 17, 10, 2, F.holz[2]); },
    "tabs/egg": (b) => { for (let y = 2; y < 19; y++) for (let x = 3; x < 17; x++) { const dy = (y - 11) / (y < 11 ? 9 : 7.5); if (((x - 10) / 6.5) ** 2 + dy * dy <= 1) b.px(x, y, F.creme[1]); } b.rect(7, 6, 2, 4, F.creme[0]); b.px(12, 14, F.creme[2]); b.px(8, 15, F.creme[2]); },
    "tabs/pet": (b) => { b.kreis(10, 13, 5, "#c8925a"); for (const [x, y] of [[4, 8], [8, 4], [12, 4], [16, 8]]) b.kreis(x, y, 2.3, "#c8925a"); b.kreis(10, 13, 3, "#f2a8b8"); },
    "tabs/deco": (b) => { for (let i = 0; i < 5; i++) { const w = (i / 5) * Math.PI * 2 - Math.PI / 2; b.kreis(10 + Math.cos(w) * 5, 8 + Math.sin(w) * 5, 3.2, "#f7a8c8"); } b.kreis(10, 8, 2.2, F.gold[1]); b.rect(9, 12, 2, 7, F.gruen[2]); b.kreis(13, 15, 2, F.gruen[1]); },
    "tabs/tool": (b) => { b.linie(15, 3, 7, 11, F.holz[1], 2); b.poly([[3, 10], [8, 9], [11, 12], [9, 17], [4, 17]], F.grau[2]); b.rect(14, 1, 4, 3, F.holz[2]); },
    "tabs/all": (b) => { for (const [x, y, c] of [[2, 2, F.rot[1]], [11, 2, F.gold[1]], [2, 11, F.gruen[1]], [11, 11, F.blau[1]]]) b.rect(x, y, 7, 7, c); },
    "status/wet": (b) => { b.kreis(10, 12, 6, F.blau[1]); b.poly([[10, 1], [15, 10], [5, 10]], F.blau[1]); b.rect(7, 10, 2, 3, F.blau[0]); },
    "status/frozen": (b) => { b.rect(3, 3, 14, 14, F.eis[1]); b.rect(3, 3, 14, 3, F.eis[0]); b.rect(14, 3, 3, 14, F.eis[2]); b.linie(6, 9, 10, 13, "#ffffff"); },
    "status/charged": (b) => { b.poly([[12, 1], [4, 11], [9, 11], [7, 19], [16, 8], [11, 8]], F.gold[1]); b.linie(11, 2, 6, 9, F.gold[0]); },
    "status/moonlit": (b) => { b.kreis(9, 11, 7, F.lila[0]); b.kreis(13, 8, 6, null); b.rect(15, 2, 2, 2, "#ffffff"); b.rect(17, 12, 1, 1, "#ffffff"); },
    "special/golden": (b) => { b.poly([[10, 1], [12.5, 7], [19, 7.5], [14, 11.5], [15.5, 18], [10, 14.5], [4.5, 18], [6, 11.5], [1, 7.5], [7.5, 7]], F.gold[1]); b.px(8, 6, F.gold[0]); b.px(9, 5, F.gold[0]); },
    "special/rainbow": (b) => { const farben = [F.rot[1], "#f2862a", F.gold[1], F.gruen[1], F.blau[1], F.lila[1]]; farben.forEach((c, i) => b.ring(10, 16, 9 - i * 1.3, 1.4, c)); b.rect(0, 16, 20, 4, null); },
    "skills/learn": (b) => { b.rect(8, 3, 4, 14, F.gruen[1]); b.rect(3, 8, 14, 4, F.gruen[1]); b.rect(8, 3, 4, 1, F.gruen[0]); },
    "skills/reset": (b) => { b.ring(10, 10, 7, 3, F.blau[1]); b.rect(11, 2, 8, 6, null); b.poly([[10, 0], [16, 4], [10, 8]], F.blau[1]); },
    "skills/bergmann": (b) => { b.linie(4, 17, 13, 6, F.holz[1], 2); b.poly([[3, 6], [10, 2], [17, 3], [18, 7], [13, 5], [7, 7]], F.grau[2]); b.px(15, 4, F.grau[1]); },
    "skills/regenmacher": (b) => { b.rect(4, 8, 10, 9, F.blau[1]); b.rect(4, 8, 10, 2, F.blau[0]); b.ring(5, 11, 4, 2, F.blau[2]); b.rect(1, 9, 3, 8, null); b.linie(14, 10, 18, 5, F.blau[1], 2); for (const y of [12, 15]) b.px(18, y, F.blau[0]); },
    "skills/gruener_daumen": (b) => { b.rect(6, 9, 9, 9, "#e8b88a"); b.rect(6, 2, 4, 9, "#e8b88a"); b.rect(6, 2, 4, 2, F.gruen[1]); b.kreis(14, 5, 3, F.gruen[1]); b.rect(10, 10, 5, 1, "#c8925a"); b.rect(10, 13, 5, 1, "#c8925a"); },
    "skills/haendler": (b) => { b.kreis(10, 12, 7, F.holz[0]); b.rect(7, 2, 6, 4, F.holz[0]); b.rect(6, 5, 8, 2, F.holz[3]); muenze(b, 10, 12, 3.5); },
    "skills/lagerist": (b) => { for (const [x, y] of [[1, 11], [10, 11], [5.5, 3]]) { b.rect(x, y, 9, 8, F.holz[1]); b.rect(x, y, 9, 1, F.holz[0]); b.rect(x, y + 4, 9, 1, F.holz[3]); b.rect(x + 4, y, 1, 8, F.holz[3]); } },
    "skills/wetterfuehlig": (b) => { b.kreis(14, 6, 4, F.gold[1]); for (const [x, y] of [[14, 0], [19, 6], [8, 3]]) b.px(x, y, "#f2a03a"); wolke(b, 3); },
    "skills/ertrag": (b) => { for (const x of [6, 10, 14]) { b.linie(x, 18, x, 7, F.gold[3]); for (let y = 3; y < 10; y += 2) { b.px(x - 1, y, F.gold[1]); b.px(x + 1, y + 1, F.gold[2]); b.px(x, y, F.gold[1]); } } b.rect(5, 13, 10, 2, F.holz[2]); },
    "skills/zuechter": (b) => { b.kreis(7, 12, 5, F.creme[1]); b.kreis(7, 8, 3.5, F.creme[1]); b.poly([[12, 6], [15, 3], [18, 6], [15, 10]], F.rot[1]); b.kreis(13.5, 5, 2, F.rot[1]); b.kreis(16.5, 5, 2, F.rot[1]); },
    "skills/glueckspilz": (b) => { b.kreis(10, 9, 8, F.rot[1]); b.rect(1, 9, 18, 10, null); b.rect(7, 9, 6, 9, F.creme[0]); for (const [x, y] of [[6, 5], [12, 4], [14, 7]]) b.rect(x, y, 2, 2, "#ffffff"); },
    "skills/sortenkenner": (b) => { b.kreis(6, 14, 4, F.rot[1]); b.kreis(14, 14, 4, F.gold[1]); b.kreis(10, 7, 4, F.lila[1]); b.px(9, 2, F.gruen[1]); b.px(5, 9, F.gruen[1]); b.px(14, 9, F.gruen[1]); },
    "skills/auftragsprofi": (b) => { b.rect(3, 3, 14, 16, F.holz[1]); b.rect(5, 5, 10, 12, F.creme[0]); b.rect(7, 1, 6, 4, F.grau[2]); b.linie(6, 9, 8, 11, F.gruen[1], 2); b.linie(8, 11, 13, 6, F.gruen[1], 2); b.rect(6, 14, 8, 1, F.holz[2]); },
    "skills/festkomitee": (b) => { b.kreis(10, 12, 7, "#f2862a"); b.rect(9, 3, 2, 4, F.gruen[2]); for (const x of [6, 14]) b.rect(x, 7, 1, 11, "#c86a24"); b.kreis(8, 9, 1.5, "#ffc48a"); },
    "pets/goldfinder": (b) => { muenze(b, 8, 12, 5.5); b.ring(14, 7, 4, 2, F.grau[2]); b.linie(17, 10, 19, 13, F.holz[2], 2); },
    "pets/gaertner": (b) => { b.rect(9, 7, 2, 12, F.gruen[2]); b.kreis(5, 9, 4, F.gruen[1]); b.kreis(15, 7, 4, F.gruen[1]); b.kreis(10, 4, 3, F.gruen[0]); },
    "pets/erntehelfer": (b) => { b.rect(2, 10, 16, 8, F.holz[1]); b.ring(10, 10, 7, 2, F.holz[2]); b.rect(2, 10, 16, 2, F.holz[0]); b.rect(1, 11, 18, 8, null); b.rect(2, 10, 16, 8, F.holz[1]); b.kreis(7, 9, 2.5, F.rot[1]); b.kreis(12, 8, 2.5, "#f2862a"); b.rect(2, 13, 16, 1, F.holz[3]); },
    "pets/forscher": (b) => { b.ring(8, 8, 6, 2, F.holz[2]); b.kreis(8, 8, 4, F.eis[1]); b.px(6, 6, "#ffffff"); b.linie(12, 12, 18, 18, F.holz[3], 3); },
    "pets/kaufmann": (b) => { b.kreis(10, 12, 7, "#7a8646"); b.rect(7, 2, 6, 4, "#7a8646"); b.rect(6, 5, 8, 2, F.holz[3]); b.rect(9, 9, 2, 7, F.gold[1]); b.rect(7, 10, 6, 1, F.gold[1]); b.rect(7, 14, 6, 1, F.gold[1]); },
    "hud/angel_pixel": (b) => { b.linie(2, 18, 15, 2, F.holz[1], 2); b.px(15, 2, F.holz[3]); b.linie(16, 2, 17, 12, "#e8eef2"); b.rect(16, 12, 3, 3, F.rot[1]); b.rect(16, 14, 3, 1, "#ffffff"); b.rect(3, 15, 3, 3, F.grau[2]); },
    "hud/fisch_pixel": (b) => { b.kreis(9, 10, 6, F.blau[1]); b.kreis(8, 8, 3, F.blau[0]); b.poly([[14, 10], [19, 5], [19, 15]], F.blau[2]); b.rect(5, 8, 2, 2, "#2b1d12"); },
    // Laden: Angeln (06.11.)
    "laden/profiangel": (b) => { b.linie(2, 18, 15, 2, "#3b3f46", 2); b.linie(3, 17, 6, 13, F.gold[2], 2); b.px(15, 2, F.gold[1]); b.linie(16, 2, 17, 12, "#e8eef2"); b.rect(15, 12, 4, 3, F.gold[1]); b.rect(15, 14, 4, 1, F.gold[3]); b.kreis(5, 15, 2.5, F.grau[1]); b.px(5, 15, F.grau[3]); },
    "laden/wurm": (b) => { b.rect(2, 13, 16, 5, F.holz[3]); b.rect(3, 12, 14, 2, F.holz[2]); b.linie(5, 11, 9, 7, "#e88a8a", 2); b.linie(9, 7, 13, 9, "#e88a8a", 2); b.linie(13, 9, 15, 6, "#e88a8a", 2); b.px(15, 5, "#c85a5a"); b.linie(7, 12, 10, 10, "#d87070", 2); },
    "laden/teig": (b) => { b.kreis(7, 12, 4, "#f2dca0"); b.kreis(13, 12, 4, "#e8c880"); b.kreis(10, 7, 4, "#f6e4b0"); b.px(8, 6, "#ffffff"); b.px(5, 11, "#ffffff"); b.px(14, 13, "#c8a050"); },
    "laden/leucht": (b) => { b.kreis(10, 11, 6, F.lila[1]); b.kreis(10, 11, 4, F.lila[0]); b.kreis(9, 10, 2, "#ffffff"); b.linie(10, 2, 10, 5, F.grau[1]); b.rect(9, 1, 3, 1, F.grau[2]); for (const [x, y] of [[3, 4], [17, 5], [16, 17], [3, 17]]) b.px(x, y, F.gold[1]); },
    "hud/lupe_pixel": (b) => { b.linie(12, 12, 17, 17, F.holz[2], 3); b.linie(13, 13, 17, 17, F.holz[1], 1); b.kreis(8, 8, 6, F.grau[2]); b.kreis(8, 8, 4, "#bfe3f2"); b.rect(5, 5, 2, 2, "#ffffff"); b.px(7, 5, "#ffffff"); },
    "pets/empty_slot": (b) => { for (let i = 1; i < 19; i += 3) { b.rect(i, 1, 2, 1, F.creme[2]); b.rect(i, 18, 2, 1, F.creme[2]); b.rect(1, i, 1, 2, F.creme[2]); b.rect(18, i, 1, 2, F.creme[2]); } b.rect(9, 6, 2, 8, F.creme[2]); b.rect(6, 9, 8, 2, F.creme[2]); },
};
function muelltonne(b) {
    b.rect(3, 3, 14, 3, F.grau[3]); b.rect(3, 3, 14, 1, F.grau[1]); b.rect(8, 1, 4, 2, F.grau[3]);
    for (let y = 6; y < 19; y++) { const e = y > 14 ? 1 : 0; b.rect(4 + e, y, 12 - 2 * e, 1, F.grau[2]); }
    for (const x of [7, 10, 13]) b.rect(x, 7, 1, 10, F.grau[3]);
    b.rect(5, 7, 1, 8, F.grau[1]);
}

// ── Ausgabe ────────────────────────────────────────────────────────────────────
const RAND_OHNE = new Set(["pets/empty_slot"]); // gestrichelter Platzhalter ohne Umriss
async function png(b) {
    return sharp(Buffer.from(b.d.buffer), { raw: { width: b.w, height: b.h, channels: 4 } })
        .resize(b.w * SKALA, b.h * SKALA, { kernel: "nearest" }).png({ palette: true, colours: 32 }).toBuffer();
}
const uebernehmen = process.argv.includes("--uebernehmen");
fs.mkdirSync(VORSCHAU, { recursive: true });
const teile = [];
let n = 0;
for (const [ziel, zeichne] of Object.entries(S)) {
    const b = new Bild(N + 2, N + 2);
    // ein Bildpunkt Rand für den Umriss
    const innen = new Bild(N, N);
    zeichne(innen);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const i = (y * N + x) * 4;
        if (innen.d[i + 3]) { const j = ((y + 1) * b.w + x + 1) * 4; b.d.set(innen.d.subarray(i, i + 4), j); }
    }
    if (!RAND_OHNE.has(ziel)) b.umriss();
    const buf = await png(b);
    const datei = path.join(VORSCHAU, ziel.replace("/", "__") + ".png");
    fs.writeFileSync(datei, buf);
    if (uebernehmen) {
        const zielDatei = path.join(ICONS, ziel + ".png");
        if (fs.existsSync(zielDatei)) {
            fs.mkdirSync(BACKUP, { recursive: true });
            fs.copyFileSync(zielDatei, path.join(BACKUP, `${Date.now()}_icons__${ziel.replace("/", "__")}.png`));
        }
        fs.mkdirSync(path.dirname(zielDatei), { recursive: true });
        fs.writeFileSync(zielDatei, buf);
    }
    teile.push({ input: buf, left: (n % 13) * 100 + 4, top: Math.floor(n / 13) * 110 + 4 });
    teile.push({ input: Buffer.from(`<svg width="100" height="16"><text x="2" y="12" font-size="10" font-family="Arial">${ziel.split("/")[1].slice(0, 14)}</text></svg>`), left: (n % 13) * 100, top: Math.floor(n / 13) * 110 + 92 });
    n++;
}
const bogen = path.join(VORSCHAU, "_bogen.png");
await sharp({ create: { width: 1300, height: Math.ceil(n / 13) * 110, channels: 4, background: "#9cbf74" } }).composite(teile).png().toFile(bogen);
console.log(`${n} Symbole${uebernehmen ? " übernommen" : ""} → ${bogen}`);
