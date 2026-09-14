// garden/world/ereignisse.js
// Wetter und Party von aussen setzen — die Übersteuerung über der Uhr.
//
// ── WARUM ES EINE ZWEITE EBENE BRAUCHT ───────────────────────────────────────
// Tageszeit, Nacht und Party rechnet core/tageszeit.js aus der Uhr; das Wetter
// hängt an der Ladenrotation. Beides ist deshalb bei allen gleich, ohne dass
// irgendjemand etwas verteilen müsste — genau das war die Absicht.
//
// Ein Admin-Knopf passt da nicht hinein: „jetzt Party" lässt sich aus keiner Uhr
// ablesen. Statt die Uhr aufzuweichen, liegt die Ausnahme daneben. Die Uhr bleibt
// die Regel, hier steht nur, was gerade zusätzlich gilt.
//
// Bewusst NUR im Arbeitsspeicher: eine erzwungene Party ist ein Moment, kein
// Zustand. Nach einem Neustart gilt wieder die Uhr, und das ist richtig so.

const { partyStand, partyStaerke, istParty } = require("../core/tageszeit");
const { wuerfleSonderform } = require("../core/tageszeit");

/** Wetterlagen, die sich setzen lassen — Spiegel von WEATHER_BY_ROLL im GameContainer. */
const WETTERLAGEN = [
    { typ: "sun", name: "Sonne" },
    { typ: "rain", name: "Regen" },
    { typ: "snow", name: "Schnee" },
    { typ: "thunder", name: "Donner" },
    { typ: "moonlight", name: "Mondschein" },
];
const WETTER_TYPEN = new Set(WETTERLAGEN.map((w) => w.typ));

/** Obergrenzen, damit ein Fehlklick nicht die halbe Nacht blockiert. */
const MAX_MINUTEN = 120;
const STANDARD_WETTER_MINUTEN = 15;
const STANDARD_PARTY_MINUTEN = 5;

let wetter = null;   // { typ, bis }
let party = null;    // { bis }

/** Was gerade zusätzlich gilt. Abgelaufenes wird dabei aufgeräumt. */
function stand(now = Date.now()) {
    if (wetter && wetter.bis <= now) wetter = null;
    if (party && party.bis <= now) party = null;
    return {
        wetterTyp: wetter?.typ || null,
        wetterBis: wetter?.bis || null,
        partyBis: party?.bis || null,
    };
}

function minuten(roh, standard) {
    const n = Number(roh);
    if (!Number.isFinite(n) || n <= 0) return standard;
    return Math.min(MAX_MINUTEN, n);
}

function setzeWetter(typ, dauerMinuten, now = Date.now()) {
    const t = String(typ || "");
    if (!WETTER_TYPEN.has(t)) return { ok: false, error: "Diese Wetterlage gibt es nicht." };
    wetter = { typ: t, bis: now + minuten(dauerMinuten, STANDARD_WETTER_MINUTEN) * 60000 };
    return { ok: true, ...stand(now) };
}

function starteParty(dauerMinuten, now = Date.now()) {
    party = { bis: now + minuten(dauerMinuten, STANDARD_PARTY_MINUTEN) * 60000 };
    return { ok: true, ...stand(now) };
}

function beendeAlles(now = Date.now()) {
    wetter = null;
    party = null;
    return { ok: true, ...stand(now) };
}

/** Läuft gerade eine Party — aus der Uhr ODER von Hand gestartet? */
function istPartyAktiv(now = Date.now()) {
    return Boolean(stand(now).partyBis) || istParty(now);
}

/**
 * Stärke der Party, 0 bis 1 — mit derselben Ein- und Ausblende wie die
 * Uhr-Variante. Genommen wird die stärkere von beiden: eine erzwungene Party
 * mitten in einer echten soll sie nicht abschwächen.
 */
function partyStaerkeJetzt(now = Date.now()) {
    const s = stand(now);
    const ausUhr = partyStaerke(now);
    if (!s.partyBis) return ausUhr;
    const BLENDE = 6000;
    const rest = s.partyBis - now;
    return Math.max(ausUhr, Math.max(0, Math.min(1, rest / BLENDE)));
}

/**
 * Sonderform einer neu entstehenden Frucht — mit der Party von HIER, nicht nur
 * der aus der Uhr. Jede serverseitige Würfelstelle geht darüber, sonst wirkt eine
 * gestartete Party nur optisch.
 *
 * `seed` reicht nur durch — siehe wuerfleSonderform in core/tageszeit.js.
 */
function sonderform(now = Date.now(), seed = null) {
    return wuerfleSonderform(now, istPartyAktiv(now), seed);
}

/** Wann die laufende Party endet (Uhr oder erzwungen) — für die Anzeige. */
function partyEnde(now = Date.now()) {
    const s = stand(now);
    const ausUhr = partyStand(now);
    const enden = [s.partyBis, ausUhr.aktiv ? ausUhr.ende : null].filter(Boolean);
    return enden.length ? Math.max(...enden) : null;
}

// ─── Party-Veredelung ────────────────────────────────────────────────────────
/**
 * Wie wahrscheinlich es ist, dass eine SCHON STEHENDE Pflanze während einer ganzen
 * Party noch Rainbow wird.
 *
 * Ohne das trifft die Party nur, was man während der drei Minuten NEU setzt — auf
 * einem eingerichteten Feld also fast nichts. Mit 2 % über die volle Party werden
 * auf einem vollen 225-Felder-Acker rund vier bis fünf Pflanzen veredelt: spürbar,
 * aber nicht die Hauptquelle. Die bleibt die verdoppelte Chance beim Pflanzen.
 *
 * War 5 % — zusammen mit der Veredelung JEDER Party, die während der Anwesenheit
 * lief (siehe starteVeredelung), summierte sich das über einen langen Abend spürbar
 * zu viel auf.
 */
const VEREDELUNG_ZIEL = 0.03;
/** Wie oft nachgesehen wird, solange eine Party läuft. */
const VEREDELUNG_TAKT_MS = 30000;

/**
 * Chance JE TAKT, damit über die Restdauer der Party insgesamt VEREDELUNG_ZIEL
 * herauskommt — egal, ob die Party drei Minuten oder zwanzig läuft.
 */
function taktChance(restMs) {
    const takte = Math.max(1, Math.round(restMs / VEREDELUNG_TAKT_MS));
    return 1 - Math.pow(1 - VEREDELUNG_ZIEL, 1 / takte);
}

/**
 * Einen Spielstand durchgehen und veredeln. Rührt nur an, was noch KEINE Sonderform
 * hat — eine goldene Frucht wird nicht überschrieben, eine Rainbow erst recht nicht.
 *
 * @returns {object|null} { "3_4": "Rainbow", … } oder null, wenn nichts passiert ist
 */
function veredeleStand(state, chance) {
    const plants = state?.plotPlants;
    if (!plants || typeof plants !== "object") return null;
    const geaendert = {};
    for (const [key, pflanze] of Object.entries(plants)) {
        if (!pflanze) continue;
        if (pflanze.singleUse !== false) {
            if (pflanze.specialType) continue;
            if (Math.random() >= chance) continue;
            pflanze.specialType = "Rainbow";
            geaendert[key] = "Rainbow";
            continue;
        }
        // Dauerträger: jeder Fruchtstand einzeln, sonst gingen Bäume leer aus.
        const slots = Array.isArray(pflanze.fruitSlots) ? pflanze.fruitSlots : [];
        const treffer = [];
        for (let i = 0; i < slots.length; i++) {
            if (!slots[i] || slots[i].specialType) continue;
            if (Math.random() >= chance) continue;
            slots[i].specialType = "Rainbow";
            treffer.push(i);
        }
        if (treffer.length) geaendert[key] = treffer;
    }
    return Object.keys(geaendert).length ? geaendert : null;
}

/**
 * Startet die Schleife. Läuft dauerhaft, tut aber nur etwas, während eine Party
 * läuft — ein eigener Timer je Party wäre mehr Buchhaltung als Ersparnis.
 *
 * `farmStates` hält ALLE Äcker im Speicher, auch die von Leuten, die gerade nicht
 * spielen (siehe initGardenFarmsStore). Ohne die `istOnline`-Prüfung veredelt diese
 * Schleife also auch Äcker, an denen niemand sitzt — nach ein paar Party-Nächten im
 * Hintergrund war dann der ganze Acker Regenbogen, ohne dass der Besitzer auch nur
 * einmal online war. Die Party soll ein Erlebnis für Anwesende sein, kein Zufall,
 * der auf einen wartet.
 *
 * @param {Map} farmStates
 * @param {(twitchId: string, zellen: object) => void} melde  schickt dem Besitzer,
 *        was veredelt wurde. Ohne diese Meldung sähe er es erst beim nächsten Laden.
 * @param {(twitchId: string) => boolean} istOnline  steht dieser Spieler gerade in
 *        einer Welt? (siehe world/lobby.js)
 * @param {(twitchId: string) => boolean} istAktiv  v2, Punkt 8: kam von diesem
 *        Spieler kürzlich eine ECHTE Eingabe (siehe istAktivGenug in
 *        world/lobby.js)? Verbunden reicht seit dem AFK-Kick nicht mehr — sonst
 *        veredelt ein Bot, der nur die Verbindung offen hält, munter weiter.
 */
function starteVeredelung(farmStates, { melde, scheduleFarmsSave, istOnline, istAktiv } = {}) {
    const uhr = setInterval(() => {
        const now = Date.now();
        const ende = partyEnde(now);
        if (!ende || ende <= now) return;
        const chance = taktChance(ende - now);
        let staende = 0;
        let stuecke = 0;
        for (const [twitchId, state] of farmStates) {
            if (istOnline && !istOnline(twitchId)) continue;
            if (istAktiv && !istAktiv(twitchId)) continue;
            const geaendert = veredeleStand(state, chance);
            if (!geaendert) continue;
            staende++;
            stuecke += Object.keys(geaendert).length;
            melde?.(String(twitchId), geaendert);
        }
        if (staende > 0) {
            console.log(`[Garden] Party-Veredelung: ${stuecke} Stellen bei ${staende} Spielern.`);
            scheduleFarmsSave?.(farmStates);
        }
    }, VEREDELUNG_TAKT_MS);
    if (typeof uhr.unref === "function") uhr.unref();
    return uhr;
}

module.exports = {
    WETTERLAGEN, MAX_MINUTEN, VEREDELUNG_ZIEL,
    stand, setzeWetter, starteParty, beendeAlles,
    istPartyAktiv, partyStaerkeJetzt, sonderform, partyEnde,
    starteVeredelung, veredeleStand, taktChance,
};
