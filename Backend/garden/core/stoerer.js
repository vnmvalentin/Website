// garden/core/stoerer.js
// Schädlinge und Unkraut (Fahrplan Phase 5, 04.11.2026): kleine Störenfriede, die man
// wegklickt. Spiegel im Browser: Frontend engine/Renderer.js (Zeichnen) und
// hooks/useSpielflaecheMaus.js (Treffer) — gerechnet wird nur hier.
//
// Regeln (Grundsatz Phase 5: wer mitspielt, hat mehr davon — Abwesenheit wird NICHT
// bestraft):
//   * Sie erscheinen nur beim ERNTEN, also nur, wenn jemand da ist und spielt —
//     mit STOERER_CHANCE je Ernte-Aktion, höchstens STOERER_MAX gleichzeitig.
//   * Käfer sitzen auf einer eigenen Pflanze, Unkraut wächst auf einem freien
//     Ackerfeld. Nach LEBEN_MS sind sie wieder weg — ohne Schaden.
//   * Wegklicken bringt Gold: ein Käfer die Hälfte einer mittleren Ernte seiner
//     Pflanze, Unkraut ein Viertel einer mittleren Ernte vom Acker. Und es zählt als
//     Aktivität für den Ernte-Rausch (core/rausch.js).
//
// state.stoerer gehört allein dem Server (der Speicher-PUT übernimmt es aus dem alten
// Stand), der Browser nennt beim Fangen nur die id.

const { SEED_CATALOGUE } = require("./catalogue");
const rausch = require("./rausch");

const LEBEN_MS = 25 * 1000;
const STOERER_MAX = 3;
const STOERER_CHANCE = 0.18;
const ANTEIL_KAEFER = 0.6;          // sonst Unkraut
const LOHN_KAEFER = 0.5;            // × mittlere Ernte der befallenen Pflanze
const LOHN_UNKRAUT = 0.25;          // × mittlere Ernte über den Acker
// Grundacker: Spalten 0–14 ohne den Holzweg in Spalte 7, Reihen 0–6
// (Frontend engine/MapConfig.js: baseDirtWidth/Height, WEG_SPALTE).
const ACKER_SPALTEN = 15;
const ACKER_REIHEN = 7;
const WEG_SPALTE = 7;

const KATALOG = new Map(SEED_CATALOGUE.map((s) => [s.id, s]));

/** Mittlerer Verkaufswert einer Ernte dieser Pflanze (ohne Aufschläge). */
function mittlereErnte(pflanze) {
    const p = KATALOG.get(pflanze?.seedId);
    if (!p) return 0;
    return pflanze.singleUse === false
        ? ((Number(p.fruitSellMin) || 0) + (Number(p.fruitSellMax) || 0)) / 2
        : ((Number(p.sellMin) || 0) + (Number(p.sellMax) || 0)) / 2;
}

/** Noch lebende Störenfriede (abgelaufene fallen beim Lesen weg). */
function aktive(state, now = Date.now()) {
    const liste = Array.isArray(state?.stoerer) ? state.stoerer : [];
    return liste.filter((s) => s && typeof s.id === "string" && Number(s.bis) > now);
}

function freieAckerfelder(state, belegt) {
    const pflanzen = state.plotPlants || {};
    const frei = [];
    for (let x = 0; x < ACKER_SPALTEN; x++) {
        if (x === WEG_SPALTE) continue;
        for (let y = 0; y < ACKER_REIHEN; y++) {
            const key = `${x}_${y}`;
            if (!pflanzen[key] && !belegt.has(key)) frei.push(key);
        }
    }
    return frei;
}

/**
 * Nach einer gelungenen Ernte aufrufen: setzt mit etwas Glück einen neuen Störenfried.
 * @returns {object|null} der neue Eintrag
 */
function vielleichtErscheinen(state, now = Date.now(), zufall = Math.random) {
    const liste = aktive(state, now);
    state.stoerer = liste;
    if (liste.length >= STOERER_MAX || zufall() >= STOERER_CHANCE) return null;
    const belegt = new Set(liste.map((s) => s.key));
    const pflanzenKeys = Object.keys(state.plotPlants || {}).filter((k) => !belegt.has(k));
    let art = zufall() < ANTEIL_KAEFER ? "kaefer" : "unkraut";
    let kandidaten = art === "kaefer" ? pflanzenKeys : freieAckerfelder(state, belegt);
    if (kandidaten.length === 0) {
        art = art === "kaefer" ? "unkraut" : "kaefer";
        kandidaten = art === "kaefer" ? pflanzenKeys : freieAckerfelder(state, belegt);
    }
    if (kandidaten.length === 0) return null;
    const eintrag = {
        id: `st_${now.toString(36)}_${Math.floor(zufall() * 1e9).toString(36)}`,
        art,
        key: kandidaten[Math.floor(zufall() * kandidaten.length)],
        bis: now + LEBEN_MS,
    };
    state.stoerer = [...liste, eintrag];
    return eintrag;
}

/**
 * Einen Störenfried wegklicken. Gibt { ok, gold, art, key } oder { ok:false, error }.
 * `gutschreiben` kommt aus core/economy.js (Gold + Lebenszeit-Gold an einer Stelle).
 */
function fangen(state, id, gutschreiben, now = Date.now()) {
    const liste = aktive(state, now);
    const treffer = liste.find((s) => s.id === String(id || ""));
    state.stoerer = liste.filter((s) => s !== treffer);
    if (!treffer) return { ok: false, status: 409, error: "Schon weg." };
    const pflanzen = Object.values(state.plotPlants || {});
    let basis;
    if (treffer.art === "kaefer") {
        basis = mittlereErnte(state.plotPlants?.[treffer.key]) * LOHN_KAEFER;
    } else {
        const werte = pflanzen.map(mittlereErnte).filter((w) => w > 0);
        basis = werte.length ? (werte.reduce((a, b) => a + b, 0) / werte.length) * LOHN_UNKRAUT : 0;
    }
    const gold = Math.max(1, Math.floor(basis));
    gutschreiben(state, gold);
    rausch.ernten(state, now);
    return { ok: true, gold, art: treffer.art, key: treffer.key };
}

module.exports = { aktive, vielleichtErscheinen, fangen, LEBEN_MS, STOERER_MAX, STOERER_CHANCE };
