// ui/HausInnen.jsx
// Das eigene Haus von innen (06.11.): Wer das Haus auf seinem Grundstück betritt, steht in
// einem kleinen Raum. Kiste, Vitrine, Mülleimer und Inkubator stehen dort als Möbel und
// öffnen dieselben Fenster wie vorher die Schuppen-Auswahl. Hinaus geht es durch die Tür
// unten, mit Esc oder über den Knopf.
//
// Der Raum ist eine eigene kleine Szene über der Welt, keine Stelle auf der Weltkarte;
// die Spielschleife der Welt pausiert so lange (engine.imHaus, siehe useSpielschleife).
// Seit 11.11. meldet der Raum den eigenen Standort an die Lobby (sendeRaum → garden:raum)
// und zeichnet alle Mitspieler, die im selben Raum stehen (andereRef, Feld `raum`). Draußen
// sind sie so lange nicht zu sehen. `gast` = Haus eines Nachbarn: nur die Vitrine öffnet sich.
//
// Gezeichnet wird alles per Code auf einer kleinen Fläche (W×H Bildpunkte) und dann mit
// harten Kanten hochskaliert — so passt der Raum zum Pixel-Boden der Welt (pixelBoden.js).
// Hier läuft man frei in alle Richtungen, nicht von Kachel zu Kachel.
//
// 11.11.: Derselbe Raum dient auch als Gold-Shop von innen (art="goldshop", siehe RAEUME):
// andere Möbel, anderer Look, sonst gleich.
import { zeichneHut, hutBild, HUT_IDS } from "../engine/huete";
import { zeichneFigur } from "../engine/figurAnim";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { versionedAsset } from "../engine/assetVersion";
import { itemImageSrc } from "./itemTints";
import { NebenKnopf } from "./gardenUi";

import { W, H, WAND_UNTEN, TUER, leinwand, malerFuer, zeichneRaum } from "./hausRaum";
const TEMPO = 64; // Bildpunkte je Sekunde
const FIGUR_HOEHE = 26;
const REICHWEITE = 26;
const STANDARD_SKIN = "/garden-assets/wardrobe/farmer/normal.png";

// ── Möbel: je eine eigene kleine Fläche, damit die Figur davor UND dahinter laufen kann ──
function sprite(w, h, malen) {
    const c = leinwand(w, h);
    malen(malerFuer(c.getContext("2d")), c.getContext("2d"));
    return c;
}

const MOEBEL_FORM = {
    vitrine: { x: 14, y: 10, w: 30, h: 40, tiefe: 8, sprite: () => sprite(30, 40, (p) => {
        p("#4a2f1c", 0, 3, 30, 35);
        p("#8a5a32", 0, 0, 30, 4);
        p("#b07a45", 1, 0, 28, 1);
        p("#6e4426", 1, 4, 28, 33);
        p("#bfdfe6", 3, 6, 24, 29);
        for (const y of [13, 24, 35]) { p("#8a5a32", 3, y, 24, 2); p("#a8743f", 3, y, 24, 1); }
        for (let i = 0; i < 5; i++) { p("#e8f6f9", 5 + i, 11 - i, 1, 1); p("#e8f6f9", 5 + i, 22 - i, 1, 1); }
        p("#6e4426", 14, 6, 2, 29);
        p("#e0b24a", 13, 19, 1, 3);
        p("#e0b24a", 16, 19, 1, 3);
        p("#4a2f1c", 2, 37, 3, 3);
        p("#4a2f1c", 25, 37, 3, 3);
    }) },
    // Kleiderschrank (06.11.): öffnet die Umkleide (ui/Umkleide.jsx)
    schrank: { x: 50, y: 8, w: 24, h: 42, tiefe: 8, sprite: () => sprite(24, 42, (p) => {
        p("#3b2516", 0, 0, 24, 40);
        p("#8a5a32", 1, 0, 22, 4);
        p("#b07a45", 1, 0, 22, 1);
        p("#6e4426", 1, 4, 22, 1);
        // zwei Türen mit Rahmen
        for (const x0 of [2, 12]) {
            p("#9c6a3c", x0, 5, 10, 33);
            p("#b07a45", x0, 5, 10, 1);
            p("#7a4d2a", x0 + 1, 8, 8, 12);
            p("#7a4d2a", x0 + 1, 23, 8, 12);
            p("#a8743f", x0 + 2, 9, 6, 10);
            p("#a8743f", x0 + 2, 24, 6, 10);
        }
        // Spiegel in der linken Tür
        p("#bfdfe6", 4, 10, 4, 8);
        p("#e8f6f9", 5, 11, 1, 3);
        p("#3b2516", 11, 5, 2, 33);
        p("#e0b24a", 10, 21, 1, 3);
        p("#e0b24a", 13, 21, 1, 3);
        p("#4a2f1c", 1, 38, 22, 2);
        p("#3b2516", 2, 40, 3, 2);
        p("#3b2516", 19, 40, 3, 2);
    }) },
    kiste: { x: 142, y: 34, w: 28, h: 20, tiefe: 8, sprite: () => sprite(28, 20, (p) => {
        p("#3b2516", 0, 0, 28, 20);
        p("#b07a45", 1, 1, 26, 6);
        p("#c9915a", 1, 1, 26, 1);
        p("#6e4426", 1, 7, 26, 1);
        p("#9c6a3c", 1, 8, 26, 11);
        p("#7a4d2a", 1, 12, 26, 1);
        p("#7a4d2a", 1, 16, 26, 1);
        for (const x of [5, 21]) { p("#5d5d66", x, 1, 2, 18); p("#8a8a94", x, 1, 1, 18); }
        p("#8a6a20", 12, 5, 4, 6);
        p("#e0b24a", 12, 5, 4, 5);
        p("#3b2516", 13, 7, 2, 2);
    }) },
    muell: { x: 178, y: 36, w: 14, h: 19, tiefe: 6, sprite: () => sprite(14, 19, (p) => {
        p("#2e3338", 5, 0, 4, 2);
        p("#4b5259", 6, 0, 2, 1);
        p("#2e3338", 0, 2, 14, 3);
        p("#6b737c", 1, 2, 12, 2);
        p("#8a939c", 1, 2, 12, 1);
        for (let y = 5; y < 19; y++) {
            const einzug = y > 12 ? 2 : 1;
            p("#2e3338", einzug, y, 14 - 2 * einzug, 1);
            p("#8a939c", einzug + 1, y, 12 - 2 * einzug, 1);
        }
        for (let x = 4; x < 11; x += 3) p("#737b84", x, 6, 1, 11);
        p("#aab2ba", 2, 6, 1, 7);
        p("#2e3338", 2, 18, 10, 1);
    }) },
    brut: { x: 10, y: 82, w: 22, h: 26, tiefe: 10, sprite: () => sprite(22, 26, (p) => {
        // Glaskuppel mit Ei
        for (let y = 2; y < 17; y++) for (let x = 2; x < 20; x++) {
            const d = ((x - 10.5) / 8.5) ** 2 + ((y - 16) / 14) ** 2;
            if (d <= 1) p(d > 0.82 ? "#5d5d66" : "#cfe9ef", x, y, 1, 1);
        }
        for (let y = 6; y < 16; y++) for (let x = 6; x < 16; x++) {
            const d = ((x - 10.5) / 4) ** 2 + ((y - 11) / 5) ** 2;
            if (d <= 1) p(d > 0.7 ? "#d9c7a0" : "#f2e6c8", x, y, 1, 1);
        }
        p("#c9a874", 9, 9, 1, 1);
        p("#c9a874", 12, 12, 1, 1);
        p("#c9a874", 10, 14, 1, 1);
        p("#e8f6f9", 5, 8, 1, 3);
        p("#f2c14e", 4, 15, 14, 1);
        // Holzsockel mit Wärmelampe
        p("#4a2f1c", 0, 16, 22, 10);
        p("#8a5a32", 1, 17, 20, 8);
        p("#a8743f", 1, 17, 20, 1);
        p("#6e4426", 3, 19, 10, 4);
        p("#e8b04a", 16, 19, 3, 3);
        p("#f6d68a", 16, 19, 1, 1);
    }) },
    bett: { x: 160, y: 82, w: 34, h: 26, tiefe: 18, sprite: () => sprite(34, 26, (p) => {
        p("#4a2f1c", 0, 0, 34, 9);
        p("#6e4426", 1, 1, 32, 7);
        p("#8a5a32", 2, 2, 30, 1);
        p("#3b2516", 0, 8, 34, 16);
        p("#f0ead8", 3, 9, 28, 5);
        p("#d8d0b8", 3, 13, 28, 1);
        p("#4a78b5", 1, 14, 32, 9);
        p("#3b6296", 1, 14, 32, 1);
        for (let y = 16; y < 23; y += 3) for (let x = 3 + ((y / 3) % 2) * 3; x < 32; x += 6) p("#5a88c4", x, y, 3, 1);
        p("#2e4b75", 1, 22, 32, 1);
        p("#4a2f1c", 0, 23, 3, 3);
        p("#4a2f1c", 31, 23, 3, 3);
    }) },
    pflanze: { x: 124, y: 30, w: 12, h: 20, tiefe: 4, sprite: () => sprite(12, 20, (p) => {
        const blaetter = [[5, 0], [3, 2], [7, 2], [1, 4], [5, 4], [9, 4], [2, 7], [6, 7], [8, 9], [3, 10]];
        for (const [x, y] of blaetter) { p("#3f7a35", x, y, 3, 3); p("#5f9a43", x, y, 2, 1); }
        p("#3f7a35", 5, 8, 2, 5);
        p("#7a3a24", 2, 13, 8, 7);
        p("#a8543a", 2, 13, 8, 2);
        p("#5a2a1a", 3, 19, 6, 1);
    }) },
};

/** Was sich öffnen lässt — die übrigen Möbel stehen nur da. */
const ZIELE = [
    { id: "vitrine", label: "Vitrine" },
    { id: "kiste", label: "Kiste" },
    { id: "muell", label: "Mülleimer" },
    { id: "brut", label: "Inkubator" },
    { id: "schrank", label: "Umkleide" },
];

// ── Gold-Shop von innen (11.11.): je Abteilung ein Regal, das den Gold-Shop auf dem
// passenden Reiter öffnet (id = Kategorie in ui/GoldShopModal.jsx). Die Theke steht nur da.
const GOLD_MOEBEL = {
    shed: { x: 12, y: 22, w: 34, h: 30, tiefe: 8, sprite: () => sprite(34, 30, (p) => {
        // Drei Modellhäuser auf einem Tisch
        const haus = (x, dach, wand) => {
            p("#3b2516", x, 3, 10, 13);
            p(wand, x + 1, 8, 8, 8);
            p(dach, x, 4, 10, 4);
            p(dach, x + 2, 2, 6, 2);
            p("#3b2516", x + 4, 12, 2, 4);
            p("#bfdfe6", x + 2, 10, 2, 2);
        };
        haus(1, "#c8402e", "#b07a45");
        haus(12, "#7a6ab8", "#cdbde8");
        haus(23, "#e0b24a", "#8d8a82");
        p("#3b2516", 0, 16, 34, 14);
        p("#b07a45", 1, 16, 32, 4);
        p("#c9915a", 1, 16, 32, 1);
        p("#8a5a32", 1, 20, 32, 9);
        p("#6e4426", 1, 24, 32, 1);
        p("#3b2516", 5, 20, 1, 9);
        p("#3b2516", 28, 20, 1, 9);
    }) },
    tapete: { x: 52, y: 14, w: 24, h: 38, tiefe: 8, sprite: () => sprite(24, 38, (p) => {
        // Regal voller Tapetenrollen
        const farben = [["#a8443a", "#c75a4e"], ["#5a7a3a", "#7a9a52"], ["#4a78b5", "#6a98d5"], ["#e0b24a", "#f6d68a"],
            ["#7a6ab8", "#9a8ad8"], ["#2a6a6a", "#3a8a84"], ["#d8762a", "#f29a4a"], ["#c8407a", "#e86a9a"]];
        p("#3b2516", 0, 0, 24, 38);
        p("#8a5a32", 1, 1, 22, 36);
        p("#b07a45", 1, 1, 22, 1);
        for (let r = 0; r < 3; r++) {
            const y = 3 + r * 11;
            p("#4a2f1c", 2, y, 20, 9);
            for (let s = 0; s < 4; s++) {
                const [farbe, hell] = farben[(r * 3 + s) % farben.length];
                const x = 3 + s * 5;
                p(farbe, x, y + 2, 4, 7);
                p(hell, x, y + 2, 4, 1);
                p("#3b2516", x + 1, y + 4, 2, 2);
            }
            p("#b07a45", 1, y + 9, 22, 2);
            p("#c9915a", 1, y + 9, 22, 1);
        }
        p("#3b2516", 1, 36, 3, 2);
        p("#3b2516", 20, 36, 3, 2);
    }) },
    nameplate: { x: 126, y: 16, w: 30, h: 36, tiefe: 6, sprite: () => sprite(30, 36, (p) => {
        // Tafel mit bunten Namensschildern
        p("#3b2516", 0, 0, 30, 28);
        p("#9c6a3c", 1, 1, 28, 26);
        p("#b07a45", 1, 1, 28, 1);
        const schilder = [["#1e293b", "#94a3b8", "#e2e8f0"], ["#7d2a24", "#e0b24a", "#f6d68a"], ["#1e4a2a", "#5f9a43", "#dcebc8"], ["#3a2a5a", "#a87ae8", "#e8dcff"]];
        schilder.forEach(([flaeche, rand, schrift], i) => {
            const y = 3 + i * 6;
            p(rand, 4, y, 22, 5);
            p(flaeche, 5, y + 1, 20, 3);
            p(schrift, 8, y + 2, 9 + (i % 2) * 4, 1);
        });
        for (const x of [4, 23]) { p("#3b2516", x, 28, 3, 8); p("#6e4426", x + 1, 28, 1, 7); }
    }) },
    mailbox: { x: 162, y: 22, w: 28, h: 30, tiefe: 6, sprite: () => sprite(28, 30, (p) => {
        // Zwei Briefkästen auf Pfosten
        const kasten = (x, farbe, hell) => {
            p("#3b2516", x + 4, 13, 4, 17);
            p("#8a5a32", x + 5, 13, 2, 16);
            p("#3b2516", x, 2, 12, 11);
            p(farbe, x + 1, 3, 10, 9);
            p(hell, x + 1, 3, 10, 2);
            p("#3b2516", x + 3, 7, 6, 1);
            p("#3b2516", x + 9, 0, 3, 5);
            p("#e8403a", x + 10, 1, 1, 3);
        };
        kasten(1, "#4a78b5", "#6a98d5");
        kasten(15, "#e0b24a", "#f6d68a");
    }) },
    hut: { x: 14, y: 78, w: 22, h: 32, tiefe: 6, sprite: () => sprite(22, 32, (p, g) => {
        // Hutständer mit drei Hüten aus dem Sortiment
        p("#3b2516", 9, 6, 4, 24);
        p("#8a5a32", 10, 6, 2, 23);
        p("#3b2516", 2, 12, 18, 2);
        p("#3b2516", 4, 21, 14, 2);
        p("#3b2516", 3, 29, 16, 3);
        p("#6e4426", 4, 29, 14, 2);
        g.imageSmoothingEnabled = false;
        [[4, 0], [-1, 4], [9, 13]].forEach(([x, y], i) => {
            const bild = hutBild(HUT_IDS[i % Math.max(1, HUT_IDS.length)]);
            if (bild) g.drawImage(bild, x, y, 13, 10);
        });
    }) },
    tierhut: { x: 158, y: 86, w: 30, h: 24, tiefe: 8, sprite: () => sprite(30, 24, (p, g) => {
        // Niedriges Regal mit kleinen Hüten für die Tiere, vorn ein Pfotenabdruck
        p("#3b2516", 0, 8, 30, 16);
        p("#9c6a3c", 1, 9, 28, 14);
        p("#b07a45", 1, 9, 28, 2);
        p("#7a4d2a", 1, 16, 28, 1);
        p("#3b2516", 13, 18, 4, 3);
        for (const [x, y] of [[12, 15], [14, 14], [16, 14], [18, 15]]) p("#3b2516", x, y, 1, 2);
        g.imageSmoothingEnabled = false;
        [[2, 0], [17, 0]].forEach(([x, y], i) => {
            const bild = hutBild(HUT_IDS[(i + 3) % Math.max(1, HUT_IDS.length)]);
            if (bild) g.drawImage(bild, x, y, 11, 9);
        });
    }) },
    theke: { x: 82, y: 50, w: 36, h: 20, tiefe: 10, sprite: () => sprite(36, 20, (p) => {
        p("#3b2516", 0, 4, 36, 16);
        p("#b07a45", 1, 4, 34, 4);
        p("#c9915a", 1, 4, 34, 1);
        p("#8a5a32", 1, 8, 34, 11);
        p("#6e4426", 1, 13, 34, 1);
        // Münzstapel und Kasse
        p("#8a6a20", 4, 0, 6, 4);
        p("#e0b24a", 4, 0, 6, 3);
        p("#f6d68a", 5, 0, 4, 1);
        p("#8a6a20", 11, 2, 5, 2);
        p("#e0b24a", 11, 2, 5, 1);
        p("#2e3338", 22, 0, 10, 4);
        p("#8a939c", 23, 1, 8, 1);
        p("#5fd0a8", 24, 2, 3, 1);
        // Münze vorn an der Theke
        p("#8a6a20", 15, 10, 6, 7);
        p("#8a6a20", 14, 11, 8, 5);
        p("#e0b24a", 15, 11, 6, 5);
        p("#f6d68a", 16, 11, 3, 1);
        p("#8a6a20", 17, 13, 2, 2);
    }) },
};

const GOLD_ZIELE = [
    { id: "shed", label: "Haus-Looks" },
    { id: "tapete", label: "Tapeten" },
    { id: "hut", label: "Hüte" },
    { id: "tierhut", label: "Tierhüte" },
    { id: "mailbox", label: "Briefkästen" },
    { id: "nameplate", label: "Namensschilder" },
];

/** Die begehbaren Räume: Möbel, was sich öffnen lässt, Beschriftung. */
const RAEUME = {
    haus: {
        moebel: MOEBEL_FORM, ziele: ZIELE, titel: "Dein Haus",
        hinweis: "Laufen mit WASD oder per Klick · Möbel mit E oder Klick öffnen · durch die Tür hinaus",
    },
    goldshop: {
        moebel: GOLD_MOEBEL, ziele: GOLD_ZIELE, titel: "Gold-Shop", thema: "goldladen",
        hinweis: "Laufen mit WASD oder per Klick · Regale mit E oder Klick ansehen · durch die Tür hinaus",
    },
};

function mitUmriss(c, farbe) {
    const u = leinwand(c.width + 2, c.height + 2);
    const g = u.getContext("2d");
    for (const [dx, dy] of [[0, 1], [2, 1], [1, 0], [1, 2]]) g.drawImage(c, dx, dy);
    g.globalCompositeOperation = "source-in";
    g.fillStyle = farbe;
    g.fillRect(0, 0, u.width, u.height);
    return u;
}

function zielPunkt(f) {
    return { x: f.x + f.w / 2, y: f.y + f.h + 5 };
}

/** Pfad der Figur: alte Standardpfade gibt es nicht mehr (siehe Renderer.drawPlayer). */
function skinPfad(skin) {
    const alt = !skin || skin === "/garden-assets/wardrobe/farmer.png" || skin === "/garden-assets/wardrobe/farmer/farmer.png";
    return alt ? STANDARD_SKIN : skin;
}

export default function HausInnen({
    art = "haus", skin, thema, hut = null, nacht = false, hatKiste, hatVitrine, vitrineItems, eierFertig, pausiert, onOeffnen, onVerlassen, onUmstellen,
    gast = false, besitzer = "", wirt = null, andereRef = null, sendeRaum = null,
}) {
    const satz = useMemo(() => {
        const basis = RAEUME[art] || RAEUME.haus;
        if (!gast) return basis;
        return {
            ...basis,
            ziele: [{ id: "vitrine", label: "Vitrine ansehen" }],
            titel: `Haus von ${besitzer}`,
            hinweis: "Laufen mit WASD oder per Klick · Vitrine mit E oder Klick ansehen · durch die Tür hinaus",
        };
    }, [art, gast, besitzer]);
    const raumArt = RAEUME[art] ? art : "haus";
    const canvasRef = useRef(null);
    const zustand = useRef({
        x: (TUER.x0 + TUER.x1) / 2, y: H - 14, rechts: true, laeuft: false, schritt: 0,
        tasten: new Set(), klickZiel: null, oeffneBeiAnkunft: null,
    });
    const [ziel, setZiel] = useState(null);
    const [ansicht, setAnsicht] = useState({ s: 4, ox: 0, oy: 0 });
    const zielRef = useRef(null);
    const pausiertRef = useRef(pausiert);
    const hutRef = useRef(hut);
    hutRef.current = hut;
    const propsRef = useRef({});
    propsRef.current = { hatKiste, hatVitrine, onOeffnen, onVerlassen, raumArt, wirt, andereRef, sendeRaum };
    // Figuren der Mitspieler im Raum: ein Bild je Skin, geladen beim ersten Auftritt
    const fremdBilder = useRef(new Map());

    const offen = useCallback((id) => {
        if (id === "kiste" && !propsRef.current.hatKiste) return false;
        if (id === "vitrine" && !propsRef.current.hatVitrine) return false;
        return true;
    }, []);

    const oeffne = useCallback((id) => {
        if (!id || !offen(id)) return;
        zustand.current.tasten.clear();
        propsRef.current.onOeffnen?.(id);
    }, [offen]);

    useEffect(() => {
        pausiertRef.current = pausiert;
        if (pausiert) {
            zustand.current.tasten.clear();
            zustand.current.klickZiel = null;
            zustand.current.oeffneBeiAnkunft = null;
        }
    }, [pausiert]);

    // Bilder der ersten sechs Vitrinen-Stücke, damit man von außen sieht, was drinsteht
    const vitrineBilder = useRef([]);
    useEffect(() => {
        vitrineBilder.current = (Array.isArray(vitrineItems) ? vitrineItems : []).slice(0, 6).map((item) => {
            const src = itemImageSrc(item);
            if (!src) return null;
            const img = new Image();
            img.src = versionedAsset(src);
            return img;
        });
    }, [vitrineItems]);

    const skinBild = useRef(null);
    useEffect(() => {
        const img = new Image();
        img.src = versionedAsset(skinPfad(skin));
        // Pfad ohne Versionsanhang: Schlüssel der Augen-Tabelle (engine/figurAugen.js)
        img.dataset.pfad = skinPfad(skin);
        skinBild.current = img;
    }, [skin]);

    // Tastatur: WASD/Pfeile laufen, E/Leertaste öffnet, Esc geht hinaus
    useEffect(() => {
        const schreibt = (e) => {
            const tag = (e.target?.tagName || "").toLowerCase();
            return tag === "input" || tag === "textarea" || tag === "select" || e.target?.isContentEditable;
        };
        const runter = (e) => {
            if (schreibt(e) || pausiertRef.current) return;
            const k = e.key.toLowerCase();
            if (k === "escape") { e.preventDefault(); propsRef.current.onVerlassen?.(); return; }
            if ((k === "e" || k === " ") && !e.repeat) {
                e.preventDefault();
                if (zielRef.current) oeffne(zielRef.current);
                return;
            }
            if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) {
                e.preventDefault();
                zustand.current.tasten.add(k);
                zustand.current.klickZiel = null;
                zustand.current.oeffneBeiAnkunft = null;
            }
        };
        const hoch = (e) => zustand.current.tasten.delete(e.key.toLowerCase());
        const weg = () => zustand.current.tasten.clear();
        window.addEventListener("keydown", runter);
        window.addEventListener("keyup", hoch);
        window.addEventListener("blur", weg);
        // Rechtsklick lässt alle Tasten los (sonst läuft die Figur endlos weiter)
        window.addEventListener("contextmenu", weg);
        return () => {
            window.removeEventListener("keydown", runter);
            window.removeEventListener("keyup", hoch);
            window.removeEventListener("blur", weg);
            window.removeEventListener("contextmenu", weg);
        };
    }, [oeffne]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return undefined;
        const ctx = canvas.getContext("2d");
        const raum = zeichneRaum(satz.thema || thema, nacht);
        const moebel = Object.entries(satz.moebel).map(([id, f]) => {
            const bild = f.sprite();
            return { id, ...f, bild, umriss: mitUmriss(bild, "#fff3c4") };
        });
        const kollision = moebel.map((m) => ({ x0: m.x - 3, x1: m.x + m.w + 3, y0: m.y + m.h - m.tiefe - 2, y1: m.y + m.h + 2 }));
        const blockiert = (x, y) => {
            const inTuer = x > TUER.x0 + 3 && x < TUER.x1 - 3;
            if (x < 9 || x > W - 9 || y < WAND_UNTEN + 6) return true;
            if (y > H - 7 && !inTuer) return true;
            return kollision.some((k) => x > k.x0 && x < k.x1 && y > k.y0 && y < k.y1);
        };

        let ansichtJetzt = { s: 4, ox: 0, oy: 0 };
        const passeAn = () => {
            const rect = canvas.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;
            canvas.width = Math.max(1, Math.round(rect.width * dpr));
            canvas.height = Math.max(1, Math.round(rect.height * dpr));
            let s = Math.min(rect.width / W, (rect.height - 40) / H);
            if (s >= 2) s = Math.floor(s);
            ansichtJetzt = { s, ox: Math.round((rect.width - W * s) / 2), oy: Math.round((rect.height - H * s) / 2 + 12), dpr };
            setAnsicht(ansichtJetzt);
        };
        passeAn();
        window.addEventListener("resize", passeAn);

        const klick = (e) => {
            if (pausiertRef.current) return;
            const rect = canvas.getBoundingClientRect();
            const { s, ox, oy } = ansichtJetzt;
            const lx = (e.clientX - rect.left - ox) / s;
            const ly = (e.clientY - rect.top - oy) / s;
            const z = zustand.current;
            z.tasten.clear();
            const getroffen = moebel.find((m) => satz.ziele.some((t) => t.id === m.id) && lx >= m.x && lx <= m.x + m.w && ly >= m.y && ly <= m.y + m.h);
            if (getroffen) {
                const pkt = zielPunkt(getroffen);
                if (Math.hypot(pkt.x - z.x, pkt.y - z.y) <= REICHWEITE) { oeffne(getroffen.id); return; }
                z.klickZiel = pkt;
                z.oeffneBeiAnkunft = getroffen.id;
                return;
            }
            z.klickZiel = { x: lx, y: Math.min(ly, H + 4) };
            z.oeffneBeiAnkunft = null;
        };
        canvas.addEventListener("pointerdown", klick);

        const mitbewohner = []; // wiederverwendet: Mitspieler in diesem Raum
        let rahmen;
        let zuletzt = performance.now();
        const schleife = (jetzt) => {
            const dt = Math.min(0.05, (jetzt - zuletzt) / 1000);
            zuletzt = jetzt;
            const z = zustand.current;

            // Bewegung: Tasten oder Klickziel, frei in alle Richtungen
            let dx = 0;
            let dy = 0;
            if (!pausiertRef.current) {
                const t = z.tasten;
                dx = (t.has("d") || t.has("arrowright") ? 1 : 0) - (t.has("a") || t.has("arrowleft") ? 1 : 0);
                dy = (t.has("s") || t.has("arrowdown") ? 1 : 0) - (t.has("w") || t.has("arrowup") ? 1 : 0);
                if (!dx && !dy && z.klickZiel) {
                    const ex = z.klickZiel.x - z.x;
                    const ey = z.klickZiel.y - z.y;
                    const d = Math.hypot(ex, ey);
                    if (d < 1.5) {
                        z.klickZiel = null;
                        if (z.oeffneBeiAnkunft) { const id = z.oeffneBeiAnkunft; z.oeffneBeiAnkunft = null; oeffne(id); }
                    } else { dx = ex / d; dy = ey / d; }
                }
            }
            const laenge = Math.hypot(dx, dy);
            z.laeuft = laenge > 0;
            if (z.laeuft) {
                const schritt = (TEMPO * dt) / laenge;
                const nx = z.x + dx * schritt;
                const ny = z.y + dy * schritt;
                let bewegt = false;
                if (!blockiert(nx, z.y)) { z.x = nx; bewegt = true; }
                if (!blockiert(z.x, ny)) { z.y = ny; bewegt = true; }
                // Hängt das Klickziel an einem Möbel fest, aufgeben statt ewig dagegenzulaufen
                if (!bewegt && z.klickZiel) {
                    const id = z.oeffneBeiAnkunft;
                    z.klickZiel = null;
                    z.oeffneBeiAnkunft = null;
                    if (id) {
                        const m = moebel.find((mm) => mm.id === id);
                        const pkt = zielPunkt(m);
                        if (Math.hypot(pkt.x - z.x, pkt.y - z.y) <= REICHWEITE + 10) oeffne(id);
                    }
                }
                if (dx > 0.1) z.rechts = true;
                else if (dx < -0.1) z.rechts = false;
                z.schritt += dt * 10;
                if (z.y > H - 3) { propsRef.current.onVerlassen?.(); return; }
            }

            // Nächstes Möbel in Reichweite
            let naechstes = null;
            let best = REICHWEITE;
            for (const t of satz.ziele) {
                const m = moebel.find((mm) => mm.id === t.id);
                const pkt = zielPunkt(m);
                const d = Math.hypot(pkt.x - z.x, pkt.y - z.y);
                if (d <= best) { best = d; naechstes = t.id; }
            }
            if (naechstes !== zielRef.current) { zielRef.current = naechstes; setZiel(naechstes); }

            // Eigenen Standort melden und einsammeln, wer sonst noch in diesem Raum steht
            const pr = propsRef.current;
            pr.sendeRaum?.(pr.raumArt, pr.wirt, z.x, z.y, z.rechts, z.laeuft);
            mitbewohner.length = 0;
            const alle = pr.andereRef?.current;
            if (alle) {
                const wirtId = pr.raumArt === "haus" ? String(pr.wirt || "") : "";
                for (const r of alle.values()) {
                    const ra = r.raum;
                    if (!ra || ra.art !== pr.raumArt || String(ra.wirt || "") !== wirtId) continue;
                    // Nachziehen wie draußen: der Server tickt mit 15 Hz
                    if (!Number.isFinite(r.rx) || !Number.isFinite(r.ry)) { r.rx = ra.x; r.ry = ra.y; }
                    const zug = Math.min(1, dt * 13);
                    r.rx += (ra.x - r.rx) * zug;
                    r.ry += (ra.y - r.ry) * zug;
                    mitbewohner.push(r);
                }
            }

            // Zeichnen
            const { s, ox, oy, dpr = 1 } = ansichtJetzt;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.imageSmoothingEnabled = false;
            ctx.fillStyle = "#140d08";
            ctx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr);
            ctx.drawImage(raum, ox, oy, W * s, H * s);

            ctx.fillStyle = "rgba(0,0,0,0.25)";
            for (const f of [z, ...mitbewohner]) {
                const fx = f === z ? z.x : f.rx;
                const fy = f === z ? z.y : f.ry;
                ctx.beginPath();
                ctx.ellipse(ox + fx * s, oy + fy * s, 6 * s, 2 * s, 0, 0, Math.PI * 2);
                ctx.fill();
            }

            const hh = FIGUR_HOEHE * s;
            const maleFigur = (img, x, y, rechts, laeuft, schritt, hutId, saat) => {
                if (!img?.complete || !img.naturalWidth) return;
                const ww = (img.naturalWidth / img.naturalHeight) * hh;
                ctx.save();
                ctx.translate(ox + x * s, oy + y * s);
                if (!rechts) ctx.scale(-1, 1);
                if (laeuft) ctx.rotate(0.07 + Math.sin(schritt) * 0.03);
                // Schritte, Atmen und Blinzeln wie draußen (engine/figurAnim.js)
                const wipp = zeichneFigur(ctx, img, {
                    mitteY: -hh / 2, box: Math.max(ww, hh), src: img.dataset.pfad, zeit: jetzt / 1000, saat,
                    schritt: laeuft ? schritt : null, hub: hh * 0.06,
                });
                // Hut aus dem Gold-Shop, gleiche Lage wie draußen (Renderer.drawPlayer)
                if (hutId) zeichneHut(ctx, hutId, 0, -hh * 0.8 + wipp, hh * 0.55);
                ctx.restore();
            };

            const reihe = moebel.map((m) => ({ fuss: m.y + m.h, m }));
            reihe.push({ fuss: z.y, figur: true });
            for (const r of mitbewohner) reihe.push({ fuss: r.ry, fremd: r });
            reihe.sort((a, b) => a.fuss - b.fuss);
            for (const r of reihe) {
                if (r.figur) {
                    maleFigur(skinBild.current, z.x, z.y, z.rechts, z.laeuft, z.schritt, hutRef.current, 0.3);
                    continue;
                }
                if (r.fremd) {
                    const f = r.fremd;
                    const pfad = skinPfad(f.appearance?.skin);
                    let img = fremdBilder.current.get(pfad);
                    if (!img) {
                        img = new Image();
                        img.src = versionedAsset(pfad);
                        img.dataset.pfad = pfad;
                        fremdBilder.current.set(pfad, img);
                    }
                    maleFigur(img, f.rx, f.ry, f.raum.rechts !== false, Boolean(f.raum.laeuft), jetzt / 100, f.hut || null, 0.7);
                    continue;
                }
                const { m } = r;
                const gesperrt = !offen(m.id);
                if (m.id === zielRef.current && !gesperrt) ctx.drawImage(m.umriss, ox + (m.x - 1) * s, oy + (m.y - 1) * s, m.umriss.width * s, m.umriss.height * s);
                ctx.globalAlpha = gesperrt ? 0.45 : 1;
                ctx.drawImage(m.bild, ox + m.x * s, oy + m.y * s, m.w * s, m.h * s);
                if (m.id === "vitrine" && !gesperrt) {
                    vitrineBilder.current.forEach((img, i) => {
                        if (!img?.complete || !img.naturalWidth) return;
                        const regalY = [13, 24, 35][Math.floor(i / 2)];
                        const groesse = 9;
                        const x = m.x + (i % 2 ? 18 : 4) + 1;
                        ctx.drawImage(img, ox + x * s, oy + (m.y + regalY - groesse) * s, groesse * s, groesse * s);
                    });
                }
                ctx.globalAlpha = 1;
            }

            // Namen der Mitspieler über ihren Köpfen — über allen Möbeln, damit man sie immer liest
            if (mitbewohner.length) {
                const schrift = Math.max(11, Math.round(3.2 * s));
                ctx.font = `bold ${schrift}px 'Pixelify Sans', Nunito, sans-serif`;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                for (const f of mitbewohner) {
                    const name = String(f.name || "Farmer");
                    const breite = Math.ceil(ctx.measureText(name).width) + 10;
                    const nx = Math.round(ox + f.rx * s);
                    const ny = Math.round(oy + (f.ry - FIGUR_HOEHE - (f.hut ? 9 : 4)) * s);
                    ctx.fillStyle = "rgba(42, 26, 16, 0.85)";
                    ctx.fillRect(nx - breite / 2, ny - schrift / 2 - 3, breite, schrift + 6);
                    ctx.fillStyle = "#f3e3c3";
                    ctx.fillText(name, nx, ny + 1);
                }
                ctx.textAlign = "left";
                ctx.textBaseline = "alphabetic";
            }

            // Kleiner Pfeil über dem Möbel, das sich gerade öffnen lässt
            if (zielRef.current && offen(zielRef.current)) {
                const m = moebel.find((mm) => mm.id === zielRef.current);
                const wipp = Math.round(Math.sin(jetzt / 220) * 1);
                const ax = Math.round(m.x + m.w / 2);
                const ay = m.y - 6 + wipp;
                ctx.fillStyle = "#3b2516";
                ctx.fillRect(ox + (ax - 4) * s, oy + (ay - 1) * s, 8 * s, 1 * s);
                for (let i = 0; i < 4; i++) {
                    ctx.fillStyle = "#3b2516";
                    ctx.fillRect(ox + (ax - 4 + i) * s, oy + (ay + i) * s, (8 - 2 * i) * s, s);
                    ctx.fillStyle = "#fff3c4";
                    if (8 - 2 * i - 2 > 0) ctx.fillRect(ox + (ax - 3 + i) * s, oy + (ay + i) * s, (6 - 2 * i) * s, s);
                }
            }
            rahmen = requestAnimationFrame(schleife);
        };
        rahmen = requestAnimationFrame(schleife);
        return () => {
            cancelAnimationFrame(rahmen);
            window.removeEventListener("resize", passeAn);
            canvas.removeEventListener("pointerdown", klick);
        };
    }, [offen, oeffne, thema, nacht, satz]);

    const zielInfo = ziel ? satz.ziele.find((t) => t.id === ziel) : null;
    const zielForm = ziel ? satz.moebel[ziel] : null;
    const gesperrt = ziel ? !offen(ziel) : false;

    return (
        <div className="absolute inset-0 z-[45] bg-[#140d08]" data-haus-innen="">
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ imageRendering: "pixelated" }} />
            <div className="absolute left-1/2 top-4 flex -translate-x-1/2 flex-wrap items-center justify-center gap-2">
                <span className="rounded-md border border-[#6e4426] bg-[#2a1a10]/90 px-3 py-2 text-sm font-bold text-[#f3e3c3]">{satz.titel}</span>
                <NebenKnopf onClick={() => onVerlassen?.()}>Hinaus (Esc)</NebenKnopf>
                {onUmstellen && <NebenKnopf onClick={() => onUmstellen()}>Haus umstellen</NebenKnopf>}
            </div>
            {zielInfo && zielForm && !pausiert && (
                <div
                    className="pointer-events-none absolute -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-[#3b2516] bg-[#fff3c4] px-2 py-1 text-xs font-bold text-[#3b2516]"
                    style={{
                        left: ansicht.ox + (zielForm.x + zielForm.w / 2) * ansicht.s,
                        top: ansicht.oy + (zielForm.y - 9) * ansicht.s,
                    }}
                >
                    {gesperrt ? (gast ? "Keine Vitrine aufgestellt" : `${zielInfo.label}: noch nicht gekauft`) : `E · ${zielInfo.label}`}
                    {zielInfo.id === "brut" && eierFertig > 0 && !gesperrt && (
                        <span className="ml-1 text-violet-700">{eierFertig === 1 ? "· 1 Ei fertig" : `· ${eierFertig} Eier fertig`}</span>
                    )}
                </div>
            )}
            <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-[#c9b48a]">
                {satz.hinweis}
            </div>
        </div>
    );
}
