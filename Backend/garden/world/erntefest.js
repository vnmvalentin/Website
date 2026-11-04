// garden/world/erntefest.js
// Das Erntefest: jedes Wochenende sammeln ALLE Spieler gemeinsam Punkte.
//
// Wann es läuft, steht in core/tageszeit.js (erntefestZeitraum, aus der Uhr).
// Hier liegt, was zählt und was es bringt.
//
// PUNKTE = die Erfahrung, die eine Ernte laut Katalog bringt (xpTabelle), bei
// Saisonware doppelt. Damit zählt Aufwand und nicht Masse: ein Löwenzahn alle acht
// Sekunden ist 1 Punkt, ein Holunder (zwei Stunden) gut 90, eine Drachenfrucht
// (vierzehn Tage) mehrere hundert. Ohne diese Gewichtung gewönne, wer am
// schnellsten Löwenzahn abräumt.
//
// GEMEINSAMES ZIEL: richtet sich nach der Zahl der Spieler, die in den zwei Wochen
// vor dem Fest gespielt haben. Es wird beim ersten Abruf eines Fests festgehalten
// (nur im Arbeitsspeicher — nach einem Neustart neu gerechnet, das weicht kaum ab).
//
// SUMME: Punkte stehen im Spielstand jedes Spielers (`state.erntefest`), und
// `farmStates` hält alle Spielstände im Speicher. Die Gesamtsumme ist also einfach
// die Summe darüber — kein zweiter Zähler, der davon abweichen könnte. Gerechnet
// wird höchstens alle paar Sekunden.
//
// ABHOLEN: nach Festende, bis das übernächste beginnt. Ein noch nicht abgeholtes
// Fest wandert beim ersten Punkt des nächsten nach `state.erntefestOffen`.

const { erntefestZeitraum } = require("../core/tageszeit");
const { xpTabelle, belohnungsLevel, gibFesteXp, wirkung } = require("../core/skills");
const { gutschreiben } = require("../core/economy");

const ZIEL_MIN = 100_000;
const ZIEL_JE_SPIELER = 4_000;
const AKTIV_FENSTER_MS = 14 * 24 * 60 * 60 * 1000;
const SAISON_FAKTOR = 2;

/** Persönliche Stufen: ab so vielen eigenen Punkten — und was sie wert sind. */
const STUFEN = [
    { id: "gold", name: "Gold", ab: 10_000, faktor: 8, xp: 1500 },
    { id: "silber", name: "Silber", ab: 2_000, faktor: 3, xp: 600 },
    { id: "bronze", name: "Bronze", ab: 200, faktor: 1, xp: 200 },
];
/** Goldbelohnung der Bronze-Stufe auf Level 1; ×10 je zehn Level wie bei Missionen. */
const BELOHNUNG_BASIS = 20_000;
/** Wird das gemeinsame Ziel verfehlt, gibt es diesen Anteil. */
const TROSTPREIS = 0.3;
const SUMME_CACHE_MS = 5_000;

let xpCache = null;
function punkteFuer(item) {
    if (!xpCache) xpCache = xpTabelle();
    const basis = Number(xpCache[item?.seedId]) || 1;
    return basis * (item?.saison === true ? SAISON_FAKTOR : 1);
}

function stufeFuer(punkte) {
    return STUFEN.find((s) => punkte >= s.ab) || null;
}

function schoeneZahl(n) {
    if (n < 100) return Math.max(1, Math.round(n));
    const stellen = Math.pow(10, Math.floor(Math.log10(n)) - 1);
    return Math.round(n / stellen) * stellen;
}

/**
 * Fabrik, weil das Modul `farmStates` braucht (Summe, aktive Spieler) — die Route
 * reicht die Map herein, wie bei ereignisse.starteVeredelung.
 */
function erstelleErntefest(farmStates) {
    const ziele = new Map();          // festId → Ziel
    let summeCache = { festId: null, zeit: 0, summe: 0, teilnehmer: 0 };

    function eintragFuer(state, festId) {
        if (state?.erntefest?.festId === festId) return state.erntefest;
        if (state?.erntefestOffen?.festId === festId) return state.erntefestOffen;
        return null;
    }

    function zielFuer(festId, beginn) {
        if (ziele.has(festId)) return ziele.get(festId);
        let aktive = 0;
        for (const s of farmStates.values()) {
            const t = Number(s?.updatedAt) || 0;
            if (t >= beginn - AKTIV_FENSTER_MS) aktive++;
        }
        const ziel = schoeneZahl(Math.max(ZIEL_MIN, aktive * ZIEL_JE_SPIELER));
        ziele.set(festId, ziel);
        return ziel;
    }

    function summeFuer(festId, now = Date.now()) {
        if (summeCache.festId === festId && now - summeCache.zeit < SUMME_CACHE_MS) return summeCache;
        let summe = 0; let teilnehmer = 0;
        for (const s of farmStates.values()) {
            const e = eintragFuer(s, festId);
            if (e && e.punkte > 0) { summe += e.punkte; teilnehmer++; }
        }
        summeCache = { festId, zeit: now, summe, teilnehmer };
        return summeCache;
    }

    /**
     * Ernte melden. Läuft nur während des Fests. Ein noch offenes älteres Fest
     * wird vorher nach `erntefestOffen` gerettet, damit es abholbar bleibt.
     */
    function melde(state, items, now = Date.now()) {
        const z = erntefestZeitraum(now);
        if (!z.aktiv || !Array.isArray(items) || items.length === 0) return 0;
        const e = state.erntefest;
        if (!e || e.festId !== z.festId) {
            if (e && e.punkte > 0 && !e.abgeholt) state.erntefestOffen = e;
            state.erntefest = { festId: z.festId, punkte: 0, abgeholt: false };
        }
        let dazu = 0;
        for (const it of items) dazu += punkteFuer(it);
        state.erntefest.punkte = Math.round(state.erntefest.punkte + dazu);
        // Die eigene Summe ändert sich sofort — der Zwischenspeicher darf nicht
        // den alten Wert zeigen, sonst springt die Leiste nach dem Ernten zurück.
        if (summeCache.festId === z.festId) summeCache.summe += dazu;
        return dazu;
    }

    function belohnungFuer(state, eintrag, now = Date.now()) {
        const stufe = stufeFuer(eintrag.punkte);
        if (!stufe) return null;
        const z = erntefestZeitraum(now);
        const beginn = eintrag.festId === z.festId ? z.beginn
            : z.beginn - (z.festId - eintrag.festId) * 7 * 24 * 60 * 60 * 1000;
        const geschafft = summeFuer(eintrag.festId, now).summe >= zielFuer(eintrag.festId, beginn);
        const level = belohnungsLevel(state?.xp); // über 50 gedämpft (core/skills.js)
        // Fähigkeit „Festkomitee" (Tier 5) legt auf die Belohnung drauf.
        const voll = BELOHNUNG_BASIS * stufe.faktor * Math.pow(10, (level - 1) / 10) * (1 + wirkung(state, "festkomitee"));
        return {
            stufe: stufe.id, stufeName: stufe.name, geschafft,
            gold: schoeneZahl(voll * (geschafft ? 1 : TROSTPREIS)),
            xp: Math.round(stufe.xp * (geschafft ? 1 : TROSTPREIS)),
        };
    }

    /** Welches Fest gerade abholbar ist — das gerade beendete oder ein geretteter Rest. */
    function abholbar(state, now = Date.now()) {
        const z = erntefestZeitraum(now);
        const kandidaten = [state?.erntefestOffen, state?.erntefest].filter(Boolean);
        return kandidaten.find((e) => !e.abgeholt && e.punkte > 0
            && (e.festId < z.festId || (e.festId === z.festId && z.vorbei))) || null;
    }

    function uebersicht(state, now = Date.now()) {
        const z = erntefestZeitraum(now);
        const eigenes = eintragFuer(state, z.festId);
        const punkte = eigenes?.punkte || 0;
        const { summe, teilnehmer } = summeFuer(z.festId, now);
        const offen = abholbar(state, now);
        return {
            festId: z.festId, aktiv: z.aktiv, vorbei: z.vorbei,
            beginn: z.beginn, ende: z.ende, naechsterBeginn: z.naechsterBeginn,
            ziel: zielFuer(z.festId, z.beginn),
            summe: Math.round(summe), teilnehmer,
            punkte, stufe: stufeFuer(punkte)?.id || null,
            stufen: STUFEN.map(({ id, name, ab }) => ({ id, name, ab })).reverse(),
            saisonFaktor: SAISON_FAKTOR,
            trostProzent: Math.round(TROSTPREIS * 100),
            abholbar: offen ? { festId: offen.festId, punkte: offen.punkte, ...belohnungFuer(state, offen, now) } : null,
        };
    }

    function abholen(state, now = Date.now()) {
        const offen = abholbar(state, now);
        if (!offen) return { ok: false, status: 400, error: "Gerade gibt es keine Festbelohnung abzuholen." };
        const b = belohnungFuer(state, offen, now);
        if (!b) return { ok: false, status: 400, error: `Für eine Belohnung brauchst du mindestens ${STUFEN[STUFEN.length - 1].ab} Punkte.` };
        offen.abgeholt = true;
        gutschreiben(state, b.gold);
        gibFesteXp(state, b.xp);
        if (state.erntefestOffen === offen) state.erntefestOffen = null;
        return { ok: true, belohnungGold: b.gold, belohnungXp: b.xp, stufe: b.stufeName, geschafft: b.geschafft, erntefest: uebersicht(state, now) };
    }

    return { melde, uebersicht, abholen };
}

module.exports = { erstelleErntefest, punkteFuer, STUFEN, ZIEL_MIN, ZIEL_JE_SPIELER, TROSTPREIS };
