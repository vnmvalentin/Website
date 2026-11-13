// ui/hausRaum.js
// Der Innenraum des Hauses als Pixelbild (06.11.): Dielen, Rückwand, Fenster, Teppich, Tür.
// Je Haus-Skin bzw. Tapete aus dem Gold-Shop ein eigener Look (THEMEN). Genutzt vom Haus
// (ui/HausInnen.jsx) und von der Vorschau im Gold-Shop (ui/GoldShopModal.jsx).

export const W = 200;
export const H = 124;
export const WAND_UNTEN = 46; // ab hier Fußboden
export const TUER = { x0: 88, x1: 112 };

export function leinwand(w, h) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
}

export function hash(x, y) {
    let h = (x * 374761393 + y * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export function malerFuer(ctx) {
    return (farbe, x, y, w = 1, h = 1) => {
        ctx.fillStyle = farbe;
        ctx.fillRect(x, y, w, h);
    };
}

// ── Raum: Dielen, Rückwand mit Fenster und Bild, Teppich, Fußmatte an der Tür ──
// Je Haus-Skin aus dem Gold-Shop (ui/reskins.js) ein eigener Innenraum (06.11.):
// gleiche Aufteilung, andere Farben, anderer Boden, anderer Blick aus dem Fenster
// und ein eigener Wandschmuck. Ohne Skin gilt STANDARD.
const STANDARD = {
    boden: "holz", diele: ["#a46f3f", "#ad7845"], dieleLicht: "#c08a54", fuge: "#6e4426", maser: "#956236",
    wand: "streifen", balken: ["#4a2f1c", "#6e4426"], tapete: "#d9c49b", streifen: "#cbb183", tupfen: "#b98f5e",
    leiste: "#b07a45", vertaefelung: "#8a5a32", bretter: "#6e4426", vertLicht: "#9a683b", sockel: "#4a2f1c",
    rahmen: "#6e4426", blick: "tag", vorhang: ["#a8443a", "#8a332b", "#c75a4e"], fensterbank: "#b07a45",
    teppich: ["#7d2a24", "#a83a32", "#e0b24a", "#c9573f", "#e8d7a8"],
    seite: ["#5a3a22", "#7a5030"], vorne: "#3b2516", matte: ["#6f6235", "#8a7a44"], wandbild: "landschaft",
};
const THEMEN = {
    celestial: {
        boden: "fliesen", diele: ["#b8a8d8", "#c4b6e0"], dieleLicht: "#d8ccf0", fuge: "#6e5a94", maser: "#a898c8",
        balken: ["#4a3a6a", "#6a5a8a"], tapete: "#cdbde8", streifen: "#bba8dc", tupfen: "#fff6c4",
        leiste: "#c8c0d8", vertaefelung: "#8a7aa8", bretter: "#6e5e8e", vertLicht: "#a898c0", sockel: "#4a3a6a",
        rahmen: "#8a8aa8", blick: "nacht", vorhang: ["#5a4a9a", "#463a80", "#7a6ab8"], fensterbank: "#c8c0d8",
        teppich: ["#1e2a5a", "#2a3a7a", "#e0d07a", "#3a4a9a", "#fff6c4"], seite: ["#4a3a6a", "#6a5a8a"], vorne: "#2e2448", matte: ["#463a80", "#6a5ab0"], wandbild: "mond",
    },
    forge: {
        boden: "stein", diele: ["#7d7a72", "#8d8a82"], dieleLicht: "#a29e94", fuge: "#4b4842", maser: "#6f6c66",
        wand: "ziegel", balken: ["#2b1d12", "#4a2f1c"], tapete: "#8d8a82", streifen: "#6f6c66", tupfen: "#a29e94",
        leiste: "#6e4426", vertaefelung: "#4a2f1c", bretter: "#2b1d12", vertLicht: "#5a3a22", sockel: "#2b1d12",
        rahmen: "#3b3b44", blick: "tag", vorhang: ["#7a4a2a", "#5a3a22", "#9a6a3a"], fensterbank: "#6f6c66",
        teppich: ["#4a1a14", "#6a2a1e", "#c8902a", "#8a3a24", "#d8b47a"], seite: ["#3b3b44", "#55555e"], vorne: "#1e1e24", wandbild: "esse",
    },
    herbs: {
        diele: ["#7a5030", "#84583a"], dieleLicht: "#9a6a42", fuge: "#4a2f1c", maser: "#6e4426",
        balken: ["#3b2516", "#5a3a22"], tapete: "#b8c89a", streifen: "#a8b88a", tupfen: "#a87ae8",
        leiste: "#7a5030", vertaefelung: "#5a3a22", bretter: "#3b2516", vertLicht: "#6e4426", sockel: "#2b1d12",
        rahmen: "#4a2f1c", blick: "tag", vorhang: ["#5a7a3a", "#466a2e", "#7a9a52"], fensterbank: "#7a5030",
        teppich: ["#3a2a4a", "#6a4a8a", "#c8b46a", "#8a6aa8", "#e8dcc0"], seite: ["#3b2516", "#5a3a22"], vorne: "#2b1d12", wandbild: "kraeuter",
    },
    observatory: {
        balken: ["#2a4a48", "#3a6a66"], tapete: "#7ab0a8", streifen: "#6aa098", tupfen: "#e0c46a",
        leiste: "#c8a04a", vertaefelung: "#4a6a5a", bretter: "#2a4a48", vertLicht: "#5a8070", sockel: "#1e3634",
        rahmen: "#8a6a2a", blick: "nacht", vorhang: ["#2a6a6a", "#1e5454", "#3a8a84"], fensterbank: "#c8a04a",
        teppich: ["#143434", "#1e5454", "#e0c46a", "#2a6a6a", "#f2e6b4"], seite: ["#2a4a48", "#3a6a66"], vorne: "#142826", matte: ["#1e5454", "#2a6a6a"], wandbild: "sternkarte",
    },
    orbital: {
        boden: "metall", diele: ["#9aa4ad", "#a4aeb7"], dieleLicht: "#c3cad0", fuge: "#5d656a", maser: "#8a949d",
        wand: "paneele", balken: ["#5d656a", "#7d858c"], tapete: "#dfe4e8", streifen: "#b8c0c8", tupfen: "#9aa4ad",
        leiste: "#c3cad0", vertaefelung: "#8a949d", bretter: "#5d656a", vertLicht: "#a4aeb7", sockel: "#3b4248",
        rahmen: "#5d656a", blick: "erde", vorhang: ["#8a949d", "#6f7880", "#a4aeb7"], fensterbank: "#c3cad0",
        teppich: ["#1e3a6a", "#2a5aa0", "#9ad0f0", "#3a6ab0", "#e6f6fa"], seite: ["#5d656a", "#7d858c"], vorne: "#2e3338", matte: ["#4b5259", "#6b737c"], wandbild: "pult",
    },
    seedsman: {
        diele: ["#b07a45", "#bc8650"], dieleLicht: "#d29e62",
        wand: "bretter", tapete: "#c08a54", streifen: "#a87443", tupfen: "#8a5a32",
        rahmen: "#6e4426", vorhang: ["#d8762a", "#b85e1e", "#f29a4a"],
        teppich: ["#1e4a2a", "#2e6a3a", "#e0b24a", "#3f8a4a", "#e8d7a8"], wandbild: "schubladen",
    },
    // Kein Haus-Look, sondern der Gold-Shop von innen (ui/HausInnen.jsx, art="goldshop")
    goldladen: {
        balken: ["#4a2f1c", "#8a6a20"], tapete: "#5a2a3a", streifen: "#6a3446", tupfen: "#e0b24a",
        leiste: "#e0b24a", rahmen: "#8a6a20", vorhang: ["#e0b24a", "#b88a2a", "#f6d68a"], fensterbank: "#e0b24a",
        teppich: ["#8a6a20", "#e0b24a", "#7d2a24", "#f6d68a", "#fff3c4"], matte: ["#8a6a20", "#e0b24a"], wandbild: "nichts",
    },
    void_weaver: {
        diele: ["#3a3040", "#443a4a"], dieleLicht: "#5a4e62", fuge: "#1e1a26", maser: "#332a3a",
        balken: ["#1e1a26", "#e8e4da"], tapete: "#2e2838", streifen: "#3a3248", tupfen: "#a87ae8",
        leiste: "#e8e4da", vertaefelung: "#1e1a26", bretter: "#2e2838", vertLicht: "#3a3248", sockel: "#e8e4da",
        rahmen: "#e8e4da", blick: "portal", vorhang: ["#2a1a3a", "#1e1228", "#3a2a4e"], fensterbank: "#e8e4da",
        teppich: ["#120c18", "#1e1428", "#a87ae8", "#3a2a5a", "#d8b4ff"], seite: ["#1e1a26", "#2e2838"], vorne: "#0e0a12", matte: ["#2e2838", "#3a3248"], wandbild: "auge",
    },
};

export function zeichneRaum(thema, nacht = false) {
    const T = { ...STANDARD, ...(THEMEN[thema] || {}) };
    const c = leinwand(W, H);
    const p = malerFuer(c.getContext("2d"));

    // Boden
    if (T.boden === "holz") {
        for (let y = WAND_UNTEN, reihe = 0; y < H; y += 6, reihe++) {
            p(T.diele[reihe % 2], 0, y, W, 6);
            p(T.dieleLicht, 0, y, W, 1);
            p(T.fuge, 0, y + 5, W, 1);
            for (let x = (reihe * 17) % 29; x < W; x += 29 + Math.floor(hash(x, reihe) * 14)) p(T.fuge, x, y, 1, 5);
            for (let x = 0; x < W; x += 3) if (hash(x, y) < 0.16) p(T.maser, x, y + 2 + (hash(y, x) < 0.5 ? 0 : 1), 2, 1);
        }
    } else {
        // Fliesen, Steinplatten oder Metallplatten: Raster mit Lichtkante und Fuge
        const gr = T.boden === "stein" ? 12 : 10;
        for (let y = WAND_UNTEN, r = 0; y < H; y += gr, r++) {
            const versatz = T.boden === "stein" && r % 2 ? gr / 2 : 0;
            for (let x = -versatz, s = 0; x < W; x += gr, s++) {
                p(T.diele[(r + s) % 2], x, y, gr, gr);
                p(T.dieleLicht, x, y, gr, 1);
                p(T.dieleLicht, x, y, 1, gr);
                p(T.fuge, x + gr - 1, y, 1, gr);
                p(T.fuge, x, y + gr - 1, gr, 1);
                if (T.boden === "metall") { p(T.fuge, x + 2, y + 2, 1, 1); p(T.fuge, x + gr - 3, y + gr - 3, 1, 1); }
                else for (let i = 0; i < 3; i++) if (hash(x + i, y) < 0.5) p(T.maser, x + 2 + Math.floor(hash(i, x) * (gr - 4)), y + 2 + Math.floor(hash(y, i) * (gr - 4)), 1, 1);
            }
        }
    }

    // Rückwand
    p(T.balken[0], 0, 0, W, 5);
    p(T.balken[1], 0, 4, W, 1);
    p(T.tapete, 0, 5, W, 29);
    if (T.wand === "streifen") {
        for (let x = 0; x < W; x += 8) p(T.streifen, x, 5, 2, 29);
        for (let x = 4; x < W; x += 8) for (let y = 9; y < 33; y += 7) p(T.tupfen, x + ((y / 7) % 2 ? 1 : 0), y, 1, 1);
    } else if (T.wand === "ziegel") {
        for (let y = 5, r = 0; y < 34; y += 5, r++) {
            p(T.streifen, 0, y + 4, W, 1);
            for (let x = r % 2 ? 0 : 6; x < W; x += 12) p(T.streifen, x, y, 1, 5);
            for (let x = 0; x < W; x += 4) if (hash(x, y) < 0.2) p(T.tupfen, x, y + 1, 2, 1);
        }
    } else if (T.wand === "paneele") {
        for (let x = 0; x < W; x += 20) { p(T.streifen, x, 5, 1, 29); p(T.tupfen, x + 2, 7, 1, 1); p(T.tupfen, x + 17, 7, 1, 1); p(T.tupfen, x + 2, 31, 1, 1); p(T.tupfen, x + 17, 31, 1, 1); }
        p(T.streifen, 0, 19, W, 1);
    } else if (T.wand === "bretter") {
        for (let x = 0; x < W; x += 7) { p(T.streifen, x, 5, 1, 29); if (hash(x, 3) < 0.6) p(T.tupfen, x + 3, 8 + Math.floor(hash(3, x) * 20), 1, 2); }
    }
    p(T.leiste, 0, 34, W, 1);
    p(T.bretter, 0, 35, W, 1);
    p(T.vertaefelung, 0, 36, W, 8);
    for (let x = 5; x < W; x += 10) p(T.bretter, x, 36, 1, 8);
    for (let x = 0; x < W; x += 10) p(T.vertLicht, x + 1, 37, 3, 1);
    p(T.sockel, 0, 44, W, 2);
    p("rgba(0,0,0,0.18)", 0, 46, W, 3);

    // Fenster mit Vorhängen und Blick nach draußen
    p(T.balken[0], 78, 7, 44, 1);
    p(T.rahmen, 86, 9, 28, 22);
    const blick = {
        tag: () => { p("#9fd3e6", 88, 11, 24, 18); p("#b9e2ee", 88, 20, 24, 9); p("#7fb35a", 88, 26, 24, 3); for (let i = 0; i < 6; i++) p("#e6f6fa", 90 + i, 17 - i, 1, 1); },
        nacht: () => {
            p("#1e2450", 88, 11, 24, 18); p("#2a3470", 88, 22, 24, 7); p("#2e4a3a", 88, 27, 24, 2);
            for (let i = 0; i < 9; i++) p(i % 3 ? "#fff6c4" : "#ffffff", 89 + Math.floor(hash(i, 21) * 22), 12 + Math.floor(hash(21, i) * 12), 1, 1);
            p("#fff6c4", 106, 13, 3, 3); p("#1e2450", 107, 13, 2, 2);
        },
        erde: () => {
            p("#0c1020", 88, 11, 24, 18);
            for (let i = 0; i < 8; i++) p("#e6f6fa", 89 + Math.floor(hash(i, 22) * 22), 12 + Math.floor(hash(22, i) * 16), 1, 1);
            for (let y = 14; y < 27; y++) for (let x = 93; x < 107; x++) {
                const d = Math.hypot(x - 99.5, y - 20.5);
                if (d < 6.5) p(d > 5.6 ? "#9ad0f0" : hash(x, y, 2) < 0.35 ? "#5fa84a" : "#3a6ab0", x, y, 1, 1);
            }
        },
        portal: () => {
            p("#1a0e28", 88, 11, 24, 18);
            for (let y = 11; y < 29; y++) for (let x = 88; x < 112; x++) {
                const w = Math.atan2(y - 20, x - 100) + Math.hypot(x - 100, y - 20) * 0.45;
                if (Math.sin(w * 3) > 0.55) p(Math.hypot(x - 100, y - 20) < 5 ? "#d8b4ff" : "#7048b0", x, y, 1, 1);
            }
        },
    };
    // Nachts zeigt jedes Fenster den Nachthimmel — Skins mit eigenem Blick (Erde, Portal) behalten ihn
    (blick[nacht && T.blick === "tag" ? "nacht" : T.blick] || blick.tag)();
    p(T.rahmen, 99, 11, 2, 18);
    p(T.rahmen, 88, 19, 24, 1);
    p(T.fensterbank, 84, 30, 32, 2);
    p(T.bretter, 84, 32, 32, 1);
    for (const x0 of [80, 114]) {
        p(T.vorhang[0], x0, 8, 6, 23);
        for (let x = x0 + 1; x < x0 + 6; x += 2) p(T.vorhang[1], x, 8, 1, 23);
        p(T.vorhang[2], x0, 8, 6, 1);
    }

    // Wandschmuck rechts vom Fenster
    const schmuck = {
        nichts: () => {},
        landschaft: () => {
            p("#8a6a20", 133, 12, 18, 14); p("#e0b24a", 134, 13, 16, 12); p("#9fd3e6", 136, 15, 12, 5);
            p("#7fb35a", 136, 20, 12, 3); p("#5f9a43", 139, 19, 5, 1); p("#f2d36b", 145, 16, 2, 2);
        },
        mond: () => {
            p("#c8c0d8", 133, 12, 18, 14); p("#1e2450", 134, 13, 16, 12);
            for (let y = 15; y < 24; y++) for (let x = 137; x < 147; x++) {
                if (Math.hypot(x - 141.5, y - 19.5) < 4.2 && Math.hypot(x - 143.5, y - 18.5) > 3.4) p("#fff6c4", x, y, 1, 1);
            }
            p("#ffffff", 147, 15, 1, 1); p("#ffffff", 136, 23, 1, 1);
        },
        esse: () => {
            p("#3b3b44", 130, 10, 24, 22); p("#55555e", 131, 11, 22, 1);
            p("#1e1e24", 134, 16, 16, 14);
            for (let y = 18; y < 30; y++) for (let x = 135; x < 149; x++) {
                const r = hash(x, y, 5);
                p(y > 25 ? (r < 0.5 ? "#f2862a" : "#ffd84a") : r < 0.25 ? "#c8501a" : y > 21 && r < 0.6 ? "#f2862a" : "#1e1e24", x, y, 1, 1);
            }
            p("#6f6c66", 132, 30, 20, 2);
        },
        kraeuter: () => {
            p("#6e4426", 128, 9, 26, 1);
            for (const [x, farbe, lang] of [[131, "#5f9a43", 12], [136, "#a87ae8", 10], [141, "#7fb35a", 14], [146, "#d8b4ff", 9], [151, "#5f9a43", 11]]) {
                p("#c8a46a", x, 10, 1, 2);
                for (let y = 12; y < 12 + lang; y++) { p(farbe, x - 1 + (y % 2), y, 2, 1); if (y % 3 === 0) p("#3f7a35", x + 1, y, 1, 1); }
            }
        },
        sternkarte: () => {
            p("#8a6a2a", 132, 10, 20, 20); p("#143434", 133, 11, 18, 18);
            for (const r of [8, 5]) for (let a = 0; a < 40; a++) p("#e0c46a", 142 + Math.cos(a / 40 * Math.PI * 2) * r, 20 + Math.sin(a / 40 * Math.PI * 2) * r, 1, 1);
            for (const [x, y] of [[138, 15], [146, 18], [140, 24], [145, 23], [142, 20]]) p("#fff6c4", x, y, 1, 1);
        },
        pult: () => {
            p("#3b4248", 130, 12, 24, 16); p("#5d656a", 131, 13, 22, 1);
            p("#0c1020", 132, 15, 20, 7);
            for (let x = 133; x < 151; x += 2) p(hash(x, 9) < 0.5 ? "#5fd0a8" : "#2a7a5a", x, 18 + Math.round(Math.sin(x / 2) * 2), 1, 1);
            for (const [x, farbe] of [[133, "#e8403a"], [137, "#f2c14e"], [141, "#5fd0a8"], [145, "#9ad0f0"], [149, "#e8403a"]]) p(farbe, x, 24, 2, 2);
        },
        schubladen: () => {
            p("#6e4426", 128, 9, 28, 24);
            for (let r = 0; r < 4; r++) for (let s = 0; s < 4; s++) {
                const x = 129 + s * 7, y = 10 + r * 6;
                p("#b07a45", x, y, 6, 5); p("#c99258", x, y, 6, 1); p("#e0b24a", x + 2, y + 2, 2, 1);
                p(["#e8403a", "#f2c14e", "#5f9a43", "#a87ae8"][(r + s) % 4], x + 1, y + 1, 1, 1);
            }
        },
        auge: () => {
            p("#e8e4da", 133, 12, 18, 14); p("#1e1a26", 134, 13, 16, 12);
            for (let y = 15; y < 24; y++) for (let x = 135; x < 149; x++) {
                const d = ((x - 142) / 6) ** 2 + ((y - 19.5) / 3.6) ** 2;
                if (d < 1) p(Math.hypot(x - 142, y - 19.5) < 2.2 ? "#1e1228" : Math.hypot(x - 142, y - 19.5) < 3.4 ? "#a87ae8" : "#d8d0e8", x, y, 1, 1);
            }
            p("#ffffff", 141, 18, 1, 1);
        },
    };
    (schmuck[T.wandbild] || schmuck.landschaft)();

    // Teppich
    const [tRand, tFlaeche, tBorte, tMuster, tFransen] = T.teppich;
    p(tRand, 70, 72, 60, 26);
    p(tFlaeche, 71, 73, 58, 24);
    p(tBorte, 74, 76, 52, 1);
    p(tBorte, 74, 93, 52, 1);
    p(tBorte, 74, 76, 1, 18);
    p(tBorte, 125, 76, 1, 18);
    for (let y = 78; y < 92; y++) for (let x = 77; x < 123; x++) {
        const d = Math.abs(x - 100) / 22 + Math.abs(y - 85) / 7;
        if (d < 1 && d > 0.6) p(tMuster, x, y, 1, 1);
        else if (d <= 0.35) p(tBorte, x, y, 1, 1);
    }
    for (let x = 71; x < 129; x += 2) { p(tFransen, x, 71, 1, 1); p(tFransen, x, 98, 1, 1); }

    // Seitenwände und Vorderkante mit Türöffnung
    p(T.seite[0], 0, 0, 5, H);
    p(T.seite[1], 5, 0, 1, H);
    p(T.seite[0], W - 5, 0, 5, H);
    p(T.seite[1], W - 6, 0, 1, H);
    p(T.vorne, 0, H - 4, TUER.x0, 4);
    p(T.vorne, TUER.x1, H - 4, W - TUER.x1, 4);
    p(T.seite[0], 0, H - 5, TUER.x0, 1);
    p(T.seite[0], TUER.x1, H - 5, W - TUER.x1, 1);
    p(T.matte[0], TUER.x0 + 1, H - 10, TUER.x1 - TUER.x0 - 2, 9);
    for (let x = TUER.x0 + 2; x < TUER.x1 - 2; x += 2) p(T.matte[1], x, H - 9, 1, 7);
    return c;
}


const vorschauCache = new Map();
/** Kleines Vorschaubild eines Zimmers (dreifach), z. B. für den Gold-Shop. */
export function raumVorschau(thema) {
    if (vorschauCache.has(thema)) return vorschauCache.get(thema);
    if (typeof document === "undefined") return null;
    const raum = zeichneRaum(thema);
    const c = leinwand(W * 2, H * 2);
    const g = c.getContext("2d");
    g.imageSmoothingEnabled = false;
    g.drawImage(raum, 0, 0, W * 2, H * 2);
    const url = c.toDataURL("image/png");
    vorschauCache.set(thema, url);
    return url;
}
