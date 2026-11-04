// garden/world/wettbewerb.js
// Wochenwettbewerb „Rekord-Ernte der Woche" (Fahrplan Phase 5, Nutzerentscheidung
// 04.11.2026): jede Woche eine Sorte — wer das größte Stück davon erntet, gewinnt.
//
// WOCHE: Montag 0:00 UTC bis Montag 0:00 UTC. Die Sorte ergibt sich allein aus der
// Wochennummer (nichts zu speichern, nach Neustart gleich) und kommt nur aus Common
// bis Rare ohne Kreuzungen — die hat jeder im Laden, auch Gelegenheitsspieler.
//
// GEWERTET: die Größe (1–50) des größten Stücks dieser Sorte. Die Größe ist Glück,
// darum hat jeder eine faire Chance. Gleichstand: wer früher geerntet hat.
//
// SPEICHER: wie beim Erntefest steht der Rekord im Spielstand jedes Spielers
// (`state.wettbewerb[woche]`), die Rangliste ergibt sich aus allen Spielständen im
// Speicher (farmStates). Rekorde bleiben AUFBEWAHREN_WOCHEN, damit auch wer erst nach
// einer Pause zurückkommt, richtig abgerechnet wird.
//
// PREIS: Platz 1–3 nach Wochenende, beim nächsten Laden der Farm gutgeschrieben —
// Gold (Grundbetrag wie Erntefest-Bronze, mit dem Level gewachsen) und ein Eintrag in
// `state.wettbewerbSiege` (Abzeichen im Profil).

const { SEED_CATALOGUE } = require("../core/catalogue");
const { belohnungsLevel } = require("../core/skills");
const { gutschreiben } = require("../core/economy");
const { groesseVon } = require("../core/groesse");

const WOCHE_MS = 7 * 24 * 60 * 60 * 1000;
const EPOCHE = Date.UTC(2026, 0, 5); // ein Montag
const AUFBEWAHREN_WOCHEN = 8;
const PREIS_BASIS = 20_000;
const PREIS_FAKTOR = { 1: 5, 2: 3, 3: 2 };
const KANDIDATEN = SEED_CATALOGUE
    .filter((s) => !s.kreuzung && ["COMMON", "UNCOMMON", "RARE"].includes(s.rarity))
    .map((s) => s.id)
    .sort();

function wocheVon(now = Date.now()) {
    const index = Math.floor((now - EPOCHE) / WOCHE_MS);
    return { index, beginn: EPOCHE + index * WOCHE_MS, ende: EPOCHE + (index + 1) * WOCHE_MS };
}

// Einmal fest gemischte Reihenfolge (fester Startwert): jede Sorte kommt erst wieder
// dran, wenn alle anderen an der Reihe waren — ein reiner Hash je Woche wiederholte
// dieselbe Sorte teils schon nach zwei Wochen.
const REIHENFOLGE = (() => {
    const liste = KANDIDATEN.slice();
    let a = 0x5eed2026;
    const zufall = () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), a | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (let i = liste.length - 1; i > 0; i--) {
        const j = Math.floor(zufall() * (i + 1));
        [liste[i], liste[j]] = [liste[j], liste[i]];
    }
    return liste;
})();

/** Sorte einer Woche. */
function sorteVon(index) {
    const n = REIHENFOLGE.length;
    return REIHENFOLGE[((index % n) + n) % n];
}

/** Nach einer Ernte: neuen persönlichen Rekord merken. Gibt den Rekord zurück, wenn neu. */
function melde(state, items, now = Date.now()) {
    const { index } = wocheVon(now);
    const sorte = sorteVon(index);
    let neu = null;
    for (const item of Array.isArray(items) ? items : []) {
        if (item?.seedId !== sorte) continue;
        const groesse = groesseVon(item);
        const buch = state.wettbewerb && typeof state.wettbewerb === "object" ? state.wettbewerb : {};
        const alt = buch[index];
        if (alt && alt.groesse >= groesse) continue;
        state.wettbewerb = { ...buch, [index]: { groesse, at: now } };
        neu = { groesse, sorte };
    }
    // Alte Wochen wegräumen (nur abgerechnete und älter als die Aufbewahrung).
    if (state.wettbewerb) {
        for (const k of Object.keys(state.wettbewerb)) {
            if (Number(k) < index - AUFBEWAHREN_WOCHEN) delete state.wettbewerb[k];
        }
    }
    return neu;
}

/** Rangliste einer Woche über alle Spielstände: [{userId, name, groesse, at}]. */
function rangliste(farmStates, index) {
    const liste = [];
    for (const [userId, st] of farmStates) {
        const r = st?.wettbewerb?.[index];
        if (!r || !(Number(r.groesse) > 0)) continue;
        liste.push({ userId: String(userId), name: st.twitchLogin || "Unbekannt", groesse: Number(r.groesse), at: Number(r.at) || 0 });
    }
    liste.sort((a, b) => b.groesse - a.groesse || a.at - b.at);
    return liste;
}

function preisFuer(state, platz) {
    const faktor = PREIS_FAKTOR[platz];
    if (!faktor) return 0;
    const level = belohnungsLevel(state?.xp);
    return Math.round(PREIS_BASIS * faktor * Math.pow(10, (level - 1) / 10));
}

/**
 * Vergangene Wochen dieses Spielers abrechnen (Platz 1–3 → Gold + Abzeichen).
 * Jede Woche höchstens einmal (`state.wettbewerbAbgerechnet` = letzte abgerechnete).
 * @returns {{woche:number, sorte:string, platz:number, gold:number}[]} neue Gewinne
 */
function abrechnen(farmStates, state, userId, now = Date.now()) {
    const { index } = wocheVon(now);
    const buch = state?.wettbewerb && typeof state.wettbewerb === "object" ? state.wettbewerb : {};
    const bis = Number.isInteger(state?.wettbewerbAbgerechnet) ? state.wettbewerbAbgerechnet : -Infinity;
    const gewinne = [];
    const wochen = Object.keys(buch).map(Number).filter((w) => w < index && w > bis).sort((a, b) => a - b);
    for (const w of wochen) {
        const platz = rangliste(farmStates, w).findIndex((e) => e.userId === String(userId)) + 1;
        if (platz >= 1 && platz <= 3) {
            const gold = preisFuer(state, platz);
            gutschreiben(state, gold);
            const sieg = { woche: w, sorte: sorteVon(w), platz, groesse: buch[w].groesse, gold };
            state.wettbewerbSiege = [...(Array.isArray(state.wettbewerbSiege) ? state.wettbewerbSiege : []), sieg];
            gewinne.push(sieg);
        }
    }
    if (index - 1 > bis) state.wettbewerbAbgerechnet = index - 1;
    return gewinne;
}

/** Alles für die Anzeige im Missionsbrett. */
function uebersicht(farmStates, state, userId, now = Date.now()) {
    const woche = wocheVon(now);
    const liste = rangliste(farmStates, woche.index);
    const meinPlatz = liste.findIndex((e) => e.userId === String(userId)) + 1;
    const vorher = rangliste(farmStates, woche.index - 1).slice(0, 3);
    return {
        woche: woche.index,
        sorte: sorteVon(woche.index),
        ende: woche.ende,
        rangliste: liste.slice(0, 10).map(({ name, groesse }) => ({ name, groesse })),
        teilnehmer: liste.length,
        meinPlatz: meinPlatz || null,
        meinRekord: state?.wettbewerb?.[woche.index]?.groesse || null,
        preise: [1, 2, 3].map((p) => ({ platz: p, gold: preisFuer(state, p) })),
        letzteWoche: { sorte: sorteVon(woche.index - 1), sieger: vorher.map(({ name, groesse }) => ({ name, groesse })) },
        siege: Array.isArray(state?.wettbewerbSiege) ? state.wettbewerbSiege : [],
    };
}

module.exports = { wocheVon, sorteVon, melde, rangliste, abrechnen, uebersicht, preisFuer, KANDIDATEN, WOCHE_MS };
