// core/saisonziele.js — vier Ziele je Jahreszeit (Fahrplan Phase 6).
//
// Jede Jahreszeit dauert eine echte Woche (core/tageszeit.js, saisonStand). In
// dieser Woche gelten vier Ziele; wer alle vier schafft, bekommt das Namensschild
// der Jahreszeit (core/reskins.js, Einträge mit `saison`, nicht käuflich).
// Wer es schon hat, bekommt beim erneuten Abschluss nur den Eintrag in
// `abgeschlossen` (zählt für Sammelziele/Profil).
//
// Gezählt wird nur, was der Server selbst sieht (wie core/quests.js): Ernte,
// Störer-Fang, Verkauf. Fortschritt gilt nur für die laufende Saisonwoche.
const { saisonStand, istSaisonSorte } = require("./tageszeit");
const { groesseVon } = require("./groesse");

const TYP = {
    SAISON_ERNTE: "saisonErnte",   // Saisonsorten ernten
    STOERER: "stoerer",            // Käfer/Unkraut fangen
    NACHFRAGE: "nachfrage",        // gefragte Sorten verkaufen (Stückzahl)
    RIESE: "riese",                // Frucht ab Größe 95 ernten
    SONDERFORM: "sonderform",      // Golden oder Rainbow ernten
    RAUSCH: "rausch",              // mit vollem Ernte-Rausch ernten
};

const RIESE_AB = 95;

/** Ziele je Saison — für 1 h Spielzeit am Tag in einer Woche gut schaffbar. */
const ZIELE = {
    fruehling: [
        { typ: TYP.SAISON_ERNTE, ziel: 250, text: "Ernte 250 Frühlingssorten" },
        { typ: TYP.STOERER, ziel: 20, text: "Fang 20 Käfer oder Unkräuter" },
        { typ: TYP.SONDERFORM, ziel: 5, text: "Ernte 5 goldene oder Rainbow-Früchte" },
        { typ: TYP.RAUSCH, ziel: 50, text: "Ernte 50 Früchte mit vollem Ernte-Rausch" },
    ],
    sommer: [
        { typ: TYP.SAISON_ERNTE, ziel: 250, text: "Ernte 250 Sommersorten" },
        { typ: TYP.NACHFRAGE, ziel: 60, text: "Verkauf 60 gefragte Früchte" },
        { typ: TYP.RIESE, ziel: 3, text: `Ernte 3 Früchte ab Größe ${RIESE_AB}` },
        { typ: TYP.RAUSCH, ziel: 50, text: "Ernte 50 Früchte mit vollem Ernte-Rausch" },
    ],
    herbst: [
        { typ: TYP.SAISON_ERNTE, ziel: 300, text: "Ernte 300 Herbstsorten" },
        { typ: TYP.STOERER, ziel: 25, text: "Fang 25 Käfer oder Unkräuter" },
        { typ: TYP.NACHFRAGE, ziel: 40, text: "Verkauf 40 gefragte Früchte" },
        { typ: TYP.SONDERFORM, ziel: 8, text: "Ernte 8 goldene oder Rainbow-Früchte" },
    ],
    winter: [
        { typ: TYP.SAISON_ERNTE, ziel: 200, text: "Ernte 200 Wintersorten" },
        { typ: TYP.RIESE, ziel: 5, text: `Ernte 5 Früchte ab Größe ${RIESE_AB}` },
        { typ: TYP.SONDERFORM, ziel: 6, text: "Ernte 6 goldene oder Rainbow-Früchte" },
        { typ: TYP.STOERER, ziel: 15, text: "Fang 15 Käfer oder Unkräuter" },
    ],
};

/** Belohnung je Saison: Namensschild-Id in core/reskins.js (Kategorie nameplate). */
const BELOHNUNG = { fruehling: "kirschbluete", sommer: "sonnenglut", herbst: "laubgold", winter: "raureif" };
/** Alle vier gesammelt → dieses Schild obendrauf. */
const JAHRESKREIS = "jahreskreis";

function buchVon(state, now) {
    const s = saisonStand(now);
    const roh = state.saisonziele && typeof state.saisonziele === "object" ? state.saisonziele : {};
    const abgeschlossen = Array.isArray(roh.abgeschlossen) ? roh.abgeschlossen : [];
    if (roh.beginn !== s.beginn) {
        state.saisonziele = { beginn: s.beginn, saison: s.id, fortschritt: {}, fertig: false, abgeschlossen };
    }
    return { buch: state.saisonziele, saison: s };
}

function istFertig(buch, saisonId) {
    return (ZIELE[saisonId] || []).every((z) => (Number(buch.fortschritt[z.typ]) || 0) >= z.ziel);
}

/**
 * Fortschritt zählen. Gibt `{ abgeschlossen: { saison, belohnung, neu } }` zurück,
 * wenn genau damit die Saison fertig wurde, sonst null.
 */
function melde(state, typ, anzahl, now = Date.now()) {
    const n = Math.floor(Number(anzahl) || 0);
    if (n <= 0) return null;
    const { buch, saison } = buchVon(state, now);
    if (!(ZIELE[saison.id] || []).some((z) => z.typ === typ)) return null;
    buch.fortschritt = { ...buch.fortschritt, [typ]: (Number(buch.fortschritt[typ]) || 0) + n };
    if (buch.fertig || !istFertig(buch, saison.id)) return null;

    buch.fertig = true;
    buch.abgeschlossen = [...buch.abgeschlossen, { saison: saison.id, beginn: saison.beginn }].slice(-200);
    const belohnung = BELOHNUNG[saison.id];
    const { schalteFrei } = require("./reskins");
    const neu = schalteFrei(state, "nameplate", belohnung);
    // Sammelziel: alle vier Jahreszeiten-Schilder → „Jahreskreis".
    const besitz = state.reskins?.gekauft?.nameplate || [];
    const jahreskreis = Object.values(BELOHNUNG).every((id) => besitz.includes(id))
        && schalteFrei(state, "nameplate", JAHRESKREIS);
    return { saison: saison.id, name: saison.name, belohnung, neu, ...(jahreskreis ? { jahreskreis: true } : {}) };
}

/** Alle Ziele einer Ernte auf einmal zählen. */
function meldeErnte(state, stuecke, now = Date.now()) {
    let saisonErnte = 0, riese = 0, sonderform = 0, rausch = 0;
    for (const it of Array.isArray(stuecke) ? stuecke : []) {
        if (!it) continue;
        if (istSaisonSorte(it.seedId, now)) saisonErnte++;
        if (groesseVon(it) >= RIESE_AB) riese++;
        const sf = it.specialData?.name;
        if (sf === "Golden" || sf === "Rainbow") sonderform++;
        if (Number(it.rausch) >= 1.149) rausch++;
    }
    return melde(state, TYP.SAISON_ERNTE, saisonErnte, now)
        || melde(state, TYP.RIESE, riese, now)
        || melde(state, TYP.SONDERFORM, sonderform, now)
        || melde(state, TYP.RAUSCH, rausch, now);
}

/** Für die Anzeige im Missionsbrett. */
function uebersicht(state, now = Date.now()) {
    const { buch, saison } = buchVon(state, now);
    const reskins = state.reskins?.gekauft?.nameplate || [];
    return {
        saison: saison.id,
        name: saison.name,
        ende: saison.beginn + 7 * 24 * 60 * 60 * 1000,
        fertig: buch.fertig === true,
        ziele: (ZIELE[saison.id] || []).map((z) => ({ ...z, stand: Math.min(z.ziel, Number(buch.fortschritt[z.typ]) || 0) })),
        belohnung: BELOHNUNG[saison.id],
        sammlung: [
            ...Object.entries(BELOHNUNG).map(([s, id]) => ({ saison: s, id, frei: reskins.includes(id) })),
            { saison: "alle", id: JAHRESKREIS, frei: reskins.includes(JAHRESKREIS) },
        ],
        abgeschlossen: buch.abgeschlossen.length,
    };
}

module.exports = { TYP, ZIELE, BELOHNUNG, JAHRESKREIS, RIESE_AB, melde, meldeErnte, uebersicht };
