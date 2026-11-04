// world/ranglisten.js — Bestenlisten über alle Farmen (Fahrplan Phase 6, „Sammeln").
//
// Vier Listen, je Top 10:
//   gold        Sterne aus „Neue Saat", dann Gold (wie die alte /leaderboard)
//   logbuch     vollständige Logbuch-Seiten, dann eingetragene Sorten
//   wettbewerb  Siege im Wochenwettbewerb (Platz 1 = 3, Platz 2 = 2, Platz 3 = 1 Punkt)
//   saison      geschaffte Saisonziele (core/saisonziele.js)
// Alles aus dem Serverstand — der Browser kann nichts davon selbst eintragen.
const { sterneVon } = require("../core/prestige");

const TOP = 10;

function name(st) { return st?.twitchLogin || "Unbekannt"; }

function logbuchWert(st) {
    const seiten = Object.values(st?.logbuchBelohnungen || {}).filter(Boolean).length;
    const sorten = Object.keys(st?.logbuch || {}).length;
    return { seiten, sorten };
}

function siegPunkte(st) {
    const siege = Array.isArray(st?.wettbewerbSiege) ? st.wettbewerbSiege : [];
    const punkte = siege.reduce((s, x) => s + (x?.platz === 1 ? 3 : x?.platz === 2 ? 2 : x?.platz === 3 ? 1 : 0), 0);
    return { punkte, ersterPlatz: siege.filter((x) => x?.platz === 1).length };
}

function saisonWert(st) {
    return Array.isArray(st?.saisonziele?.abgeschlossen) ? st.saisonziele.abgeschlossen.length : 0;
}

function ranglisten(farmStates) {
    const alle = Array.from(farmStates.values()).filter((s) => s && s.twitchLogin);
    const top = (liste) => liste.slice(0, TOP);

    const gold = top(alle
        .filter((s) => (s.gold || 0) > 0 || sterneVon(s) > 0)
        .sort((a, b) => sterneVon(b) - sterneVon(a) || (b.gold || 0) - (a.gold || 0))
        .map((s) => ({ name: name(s), gold: s.gold || 0, sterne: sterneVon(s) })));

    const logbuch = top(alle
        .map((s) => ({ s, w: logbuchWert(s) }))
        .filter((x) => x.w.sorten > 0)
        .sort((a, b) => b.w.seiten - a.w.seiten || b.w.sorten - a.w.sorten)
        .map(({ s, w }) => ({ name: name(s), sterne: sterneVon(s), seiten: w.seiten, sorten: w.sorten })));

    const wettbewerb = top(alle
        .map((s) => ({ s, w: siegPunkte(s) }))
        .filter((x) => x.w.punkte > 0)
        .sort((a, b) => b.w.punkte - a.w.punkte || b.w.ersterPlatz - a.w.ersterPlatz)
        .map(({ s, w }) => ({ name: name(s), sterne: sterneVon(s), punkte: w.punkte, ersterPlatz: w.ersterPlatz })));

    const saison = top(alle
        .map((s) => ({ s, w: saisonWert(s) }))
        .filter((x) => x.w > 0)
        .sort((a, b) => b.w - a.w)
        .map(({ s, w }) => ({ name: name(s), sterne: sterneVon(s), anzahl: w })));

    return { gold, logbuch, wettbewerb, saison };
}

module.exports = { ranglisten, siegPunkte, logbuchWert };
