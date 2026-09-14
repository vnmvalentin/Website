// garden/core/quests.js
// Tägliche und wöchentliche Missionen — Gold- und XP-Belohnungen für Ziele, die
// der Server selbst beobachten kann.
//
// WARUM NUR SERVER-BEOBACHTBARE ZIELE
// Pflanzen und Gießen auf dem EIGENEN Feld sind Browserbesitz (siehe README):
// der Server sieht den Acker nur alle paar Sekunden im PUT, nie als einzelnes
// Ereignis. Eine Mission "Pflanze 5 Samen" ließe der Client sich also frei selbst
// bestätigen. Die Katalog-Typen unten zählen deshalb ausschließlich das, was
// ohnehin durch eine servergerechnete Aktion läuft: Ernte, Verkauf, Gießkannen-
// Verbrauch, Samenkauf — dieselbe Grenze wie beim Feld-Manager (Ernten als
// Helfer ist deshalb ebenfalls entfallen, siehe world/rechte.js-Geschichte).
//
// WARUM DIE AUSWAHL SELBST NICHT IM SPIELSTAND STEHT
// Welche drei/zwei Missionen gerade laufen, ergibt sich rein rechnerisch aus der
// echten Uhrzeit (unitAusText, derselbe Baustein wie bei der Party in
// core/tageszeit.js) — genau wie die Ladenrotation. Nichts davon muss gespeichert
// oder migriert werden; nur FORTSCHRITT und ABGEHOLT gehören dem Spielstand.

const { unitAusText } = require("./tageszeit");

// Echte Zeit, nicht die 24-Minuten-Spieluhr aus core/tageszeit.js — eine Mission
// soll einen echten Tag bzw. eine echte Woche laufen, unabhängig vom Tag/Nacht-
// Zyklus im Spiel.
const TAG_MS = 24 * 60 * 60 * 1000;
const WOCHE_MS = 7 * TAG_MS;
// Fixer Referenzpunkt: Donnerstag, 1.1.1970 war Tag 0 — ohne Bedeutung außer als
// gemeinsamer Nullpunkt, an dem jede Wochenzählung überall gleich herauskommt.
function tagIndex(now) { return Math.floor(now / TAG_MS); }
function wocheIndex(now) { return Math.floor(now / WOCHE_MS); }

const TYP = {
    ERNTE_ANZAHL: "ernteAnzahl",
    ERNTE_GOLD: "ernteGold",
    VERKAUF_GOLD: "verkaufGold",
    GIESSEN_ANZAHL: "giessenAnzahl",
    SAMEN_KAUF: "samenKauf",
};

/**
 * Tages-Katalog. Absichtlich klein gehalten (Ziele, die auch bei einer kurzen
 * Sitzung erreichbar sind) — die Belohnungen sind bewusst spürbar, aber weit
 * unter dem, was eine gute Ernte ohnehin bringt, damit Missionen ein Bonus
 * bleiben und keine Pflichtroutine werden.
 */
const TAEGLICHE_KATALOG = [
    { id: "t_ernte10", typ: TYP.ERNTE_ANZAHL, ziel: 10, name: "Fleißige Hände", beschreibung: "Ernte 10 Früchte.", gold: 5_000, xp: 50 },
    { id: "t_ernte30", typ: TYP.ERNTE_ANZAHL, ziel: 30, name: "Vollernte", beschreibung: "Ernte 30 Früchte.", gold: 15_000, xp: 120 },
    { id: "t_ernte_gold", typ: TYP.ERNTE_GOLD, ziel: 25_000, name: "Wertvolle Ausbeute", beschreibung: "Ernte Früchte im Wert von 25.000 Gold.", gold: 6_000, xp: 55 },
    { id: "t_verkauf50k", typ: TYP.VERKAUF_GOLD, ziel: 50_000, name: "Marktschreier", beschreibung: "Verkaufe Ernte im Wert von 50.000 Gold.", gold: 8_000, xp: 60 },
    { id: "t_giessen5", typ: TYP.GIESSEN_ANZAHL, ziel: 5, name: "Grüner Daumen", beschreibung: "Gieße 5 Pflanzen.", gold: 4_000, xp: 40 },
    { id: "t_kauf5", typ: TYP.SAMEN_KAUF, ziel: 5, name: "Einkaufstour", beschreibung: "Kaufe 5 Samen im Laden.", gold: 4_000, xp: 40 },
];

/** Wochen-Katalog. Zehnfach höhere Ziele, entsprechend größere Belohnung. */
const WOECHENTLICHE_KATALOG = [
    { id: "w_ernte200", typ: TYP.ERNTE_ANZAHL, ziel: 200, name: "Erntewoche", beschreibung: "Ernte 200 Früchte diese Woche.", gold: 80_000, xp: 600 },
    { id: "w_verkauf1m", typ: TYP.VERKAUF_GOLD, ziel: 1_000_000, name: "Großhändler", beschreibung: "Verkaufe Ernte im Wert von 1 Mio. Gold diese Woche.", gold: 100_000, xp: 700 },
    { id: "w_giessen40", typ: TYP.GIESSEN_ANZAHL, ziel: 40, name: "Dauerregner", beschreibung: "Gieße 40 Pflanzen diese Woche.", gold: 60_000, xp: 500 },
    { id: "w_kauf25", typ: TYP.SAMEN_KAUF, ziel: 25, name: "Großeinkauf", beschreibung: "Kaufe 25 Samen im Laden diese Woche.", gold: 50_000, xp: 450 },
];

const TAEGLICHE_SLOTS = 3;
const WOECHENTLICHE_SLOTS = 2;

/**
 * `anzahl` Einträge deterministisch aus `katalog` ziehen, ohne Wiederholung
 * innerhalb EINER Ziehung — derselbe Grund, warum eine Samenrotation nicht
 * zweimal dieselbe Sorte zeigt: sonst liefe eine Mission effektiv doppelt so
 * schnell wie die andere.
 */
function waehleOhneWiederholung(katalog, anzahl, samenText) {
    const rest = katalog.map((_, i) => i);
    const gewaehlt = [];
    for (let i = 0; i < anzahl && rest.length > 0; i++) {
        const r = unitAusText(`${samenText}:${i}`);
        const idx = Math.min(rest.length - 1, Math.floor(r * rest.length));
        gewaehlt.push(rest.splice(idx, 1)[0]);
    }
    return gewaehlt.map((i) => katalog[i]);
}

function aktuelleTaeglicheMissionen(now) {
    return waehleOhneWiederholung(
        TAEGLICHE_KATALOG, Math.min(TAEGLICHE_SLOTS, TAEGLICHE_KATALOG.length),
        `quest_tag:${tagIndex(now)}`,
    );
}
function aktuelleWoechentlicheMissionen(now) {
    return waehleOhneWiederholung(
        WOECHENTLICHE_KATALOG, Math.min(WOECHENTLICHE_SLOTS, WOECHENTLICHE_KATALOG.length),
        `quest_woche:${wocheIndex(now)}`,
    );
}

/**
 * Spielstand auf den aktuellen Zeitraum bringen — verwirft veralteten Fortschritt
 * und veraltete Abholungen, lässt den jeweils ANDEREN Zeitraum unangetastet
 * (ein neuer Tag darf die laufende Wochenmission nicht zurücksetzen und umgekehrt).
 * Lazy wie bringeDauertraegerAufStand: läuft bei jeder Berührung neu, statt eine
 * eigene Migration/einen eigenen Tick zu brauchen.
 */
function bringeQuestsAufStand(state, now = Date.now()) {
    if (!state.quests || typeof state.quests !== "object") {
        state.quests = { tagIndex: -1, wocheIndex: -1, fortschritt: {}, abgeholt: [] };
    }
    const q = state.quests;
    if (!q.fortschritt || typeof q.fortschritt !== "object") q.fortschritt = {};
    if (!Array.isArray(q.abgeholt)) q.abgeholt = [];

    const heute = tagIndex(now);
    const dieseWoche = wocheIndex(now);
    if (q.tagIndex !== heute) {
        const woechentlicheIds = new Set(WOECHENTLICHE_KATALOG.map((m) => m.id));
        for (const id of Object.keys(q.fortschritt)) if (!woechentlicheIds.has(id)) delete q.fortschritt[id];
        q.abgeholt = q.abgeholt.filter((id) => woechentlicheIds.has(id));
        q.tagIndex = heute;
    }
    if (q.wocheIndex !== dieseWoche) {
        const taeglicheIds = new Set(TAEGLICHE_KATALOG.map((m) => m.id));
        for (const id of Object.keys(q.fortschritt)) if (!taeglicheIds.has(id)) delete q.fortschritt[id];
        q.abgeholt = q.abgeholt.filter((id) => taeglicheIds.has(id));
        q.wocheIndex = dieseWoche;
    }
    return q;
}

/**
 * Fortschritt für einen Ereignistyp gutschreiben. Von den Aktionen aufgerufen,
 * die dieses Ereignis ohnehin schon serverseitig auswerten (siehe
 * routes/gardenGameRoutes.js) — nie vom Client direkt meldbar.
 */
function melde(state, typ, menge, now = Date.now()) {
    const n = Number(menge) || 0;
    if (n <= 0) return;
    const q = bringeQuestsAufStand(state, now);
    const aktiv = [...aktuelleTaeglicheMissionen(now), ...aktuelleWoechentlicheMissionen(now)];
    for (const m of aktiv) {
        if (m.typ !== typ) continue;
        q.fortschritt[m.id] = Math.min(m.ziel, (Number(q.fortschritt[m.id]) || 0) + n);
    }
}

/** Ansicht für die Anzeige — Katalogeintrag samt Fortschritt und Status. */
function questUebersicht(state, now = Date.now()) {
    const q = bringeQuestsAufStand(state, now);
    const baueZeile = (m) => {
        const fortschritt = Number(q.fortschritt[m.id]) || 0;
        return {
            ...m,
            fortschritt,
            erreicht: fortschritt >= m.ziel,
            abgeholt: q.abgeholt.includes(m.id),
        };
    };
    return {
        taeglich: aktuelleTaeglicheMissionen(now).map(baueZeile),
        woechentlich: aktuelleWoechentlicheMissionen(now).map(baueZeile),
        naechsteTaeglicheAb: (tagIndex(now) + 1) * TAG_MS,
        naechsteWoechentlicheAb: (wocheIndex(now) + 1) * WOCHE_MS,
    };
}

/**
 * Belohnung einer geschafften Mission abholen. Gold/XP kommen von hier nur als
 * ZAHL zurück — Gutschrift (gutschreiben aus economy.js, gibFesteXp aus
 * skills.js) übernimmt der Aufrufer, damit core/quests.js nicht von core/economy.js
 * abhängen muss (economy.js hängt umgekehrt schon von core/skills.js ab).
 *
 * ABSICHTLICH `belohnungGold`/`belohnungXp` statt `gold`/`xp`: die Antwort der
 * Aktions-Route mischt dieses Ergebnis per `...ergebnis` in eine Hülle, die
 * bereits ein eigenes `gold` führt (den KONTOSTAND nach der Gutschrift, siehe
 * gardenGameRoutes.js). Mit dem Namen `gold` hier hätte die Belohnungshöhe den
 * Kontostand in der Antwort überschrieben — der Kontostand selbst wäre dabei
 * unangetastet geblieben, nur die ANZEIGE beim Abholen hätte den falschen,
 * viel zu niedrigen Wert gezeigt (gefunden beim ersten Testlauf, 4000 s
 * "Kontostand" statt der tatsächlichen 4450).
 */
function questAbholen(state, questId, now = Date.now()) {
    const q = bringeQuestsAufStand(state, now);
    const alle = [...TAEGLICHE_KATALOG, ...WOECHENTLICHE_KATALOG];
    const m = alle.find((x) => x.id === String(questId || ""));
    if (!m) return { ok: false, status: 400, error: "Diese Mission gibt es nicht." };
    const aktiv = [...aktuelleTaeglicheMissionen(now), ...aktuelleWoechentlicheMissionen(now)];
    if (!aktiv.some((x) => x.id === m.id)) return { ok: false, status: 400, error: "Diese Mission läuft gerade nicht." };
    if (q.abgeholt.includes(m.id)) return { ok: false, status: 400, error: "Belohnung schon abgeholt." };
    if ((Number(q.fortschritt[m.id]) || 0) < m.ziel) return { ok: false, status: 400, error: "Noch nicht geschafft." };
    q.abgeholt.push(m.id);
    return { ok: true, belohnungGold: m.gold, belohnungXp: m.xp, name: m.name };
}

module.exports = {
    TYP, melde, questUebersicht, questAbholen, bringeQuestsAufStand,
};
