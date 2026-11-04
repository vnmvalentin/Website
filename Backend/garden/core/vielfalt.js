// garden/core/vielfalt.js
// Vielfalt-Bonus: je mehr verschiedene Sorten auf dem Acker stehen, desto mehr
// bringt jede Ernte. Spiegel im Browser: Frontend ui/vielfalt.js (Anzeige).
//
// WARUM (Fahrplan Phase 2, Nutzerentscheidung 03.11.2026)
// Der Simulator zeigte: nach zwei Wochen bringen Legendary-Stauden 70–90 % des
// Goldes, Rare und Epic nur noch 1–4 %. Ein Acker voller derselben drei Stauden
// war die beste Strategie, und der Laden zeigte für Fortgeschrittene nur noch
// „Müll". Jetzt zählt die Vielfalt auf dem Acker:
//
//   Punkte = Summe über alle Seltenheiten von min(3, verschiedene Sorten dieser Seltenheit)
//   Faktor = 1 + 0,02 · Punkte · (1 + Sortenkenner)
//
//   leerer Acker / Anfänger → ×1,00 (reiner Bonus, niemand wird bestraft)
//   nur 3 Legendary-Sorten  → 3 Punkte  → ×1,06
//   je 3 aus Common–Legendary + Mondblume → 16 Punkte → ×1,32
//
// Erste Fassung war 0,85 + 0,025·Punkte (Malus unter 6 Punkten) — verworfen, weil
// dann jeder neue Spieler mit −15 % angefangen hätte.
//
// Je Seltenheit zählen höchstens drei Sorten — sonst ließe sich der Bonus allein
// mit Legendary-Sorten voll ausreizen, und Rare/Epic blieben wieder außen vor.
// Gewertet wird beim ERNTEN, mit allem, was in dem Moment auf dem Acker steht
// (die geerntete Pflanze zählt noch mit). Das Stück trägt den Faktor dauerhaft
// (Feld `vielfalt`), wie den Saison-Aufschlag.

const { SEED_CATALOGUE } = require("./catalogue");

const JE_SELTENHEIT_MAX = 3;
const GRUND = 1;
const JE_PUNKT = 0.02;
const SELTENHEIT = new Map(SEED_CATALOGUE.map((s) => [s.id, s.rarity]));

/** Vielfalt-Punkte eines Ackers. */
function punkte(plotPlants) {
    const jeStufe = new Map();
    for (const p of Object.values(plotPlants || {})) {
        const r = p?.seedId && SELTENHEIT.get(p.seedId);
        if (!r) continue;
        if (!jeStufe.has(r)) jeStufe.set(r, new Set());
        jeStufe.get(r).add(p.seedId);
    }
    let summe = 0;
    for (const sorten of jeStufe.values()) summe += Math.min(JE_SELTENHEIT_MAX, sorten.size);
    return summe;
}

/** Faktor auf den Erlös. `kenner` = Wirkung der Fähigkeit „Sortenkenner" (0..). */
function faktor(plotPlants, kenner = 0) {
    const f = GRUND + JE_PUNKT * punkte(plotPlants) * (1 + Math.max(0, Number(kenner) || 0));
    return Math.round(f * 1000) / 1000;
}

/** Gespeicherten Faktor eines Erntestücks lesen — gedeckelt, fehlt er: 1. */
function vonStueck(item) {
    const f = Number(item?.vielfalt);
    return Number.isFinite(f) && f > 0 ? Math.max(0.5, Math.min(2, f)) : 1;
}

module.exports = { punkte, faktor, vonStueck, JE_SELTENHEIT_MAX, GRUND, JE_PUNKT };
