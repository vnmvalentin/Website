// engine/Tageszeit.js
// Tag, Nacht und das Party-Event — SPIEGEL von Backend/garden/core/tageszeit.js.
//
// NICHT VON HAND ÄNDERN. Der Abschnitt zwischen den SPIEGEL-Marken wird erzeugt:
//
//     cd Backend && npm run garden:spiegel
//
// Geändert wird in Backend/garden/core/tageszeit.js. Dort steht auch, warum Tag,
// Nacht und Party aus der Uhr gerechnet werden statt aus einer Servermeldung.
//
// Der Browser braucht dieselben Zahlen, weil er den Nachtschleier und die
// Discolaser zeichnet; der Server braucht sie, weil die Party die Rainbow-Chance
// erhöht (wuerfleSonderform).

// ─── SPIEGEL-ANFANG ─────────────────────────────────────────────────────────
/**
 * Länge eines vollen Tages in echter Zeit. 24 Minuten heißt: eine Minute ist eine
 * Spielstunde, und die Uhrzeit im HUD lässt sich direkt ablesen.
 *
 * Bewusst NICHT an die Ladenrotation (5 min) gekoppelt: Wetter und Laden wechseln
 * im selben Takt, und wenn die Nacht das auch täte, fiele jede Nacht mit denselben
 * Ereignissen zusammen.
 */
const TAG_MS = 24 * 60 * 1000;
const STUNDE_MS = TAG_MS / 24;

/** Nacht von 20 bis 6 Uhr — zehn Spielstunden, also zehn echte Minuten. */
const NACHT_BEGINN = 20;
const NACHT_ENDE = 6;

/** Wie dunkel es mitten in der Nacht höchstens wird (0 = taghell, 1 = schwarz). */
const NACHT_MAX = 0.62;
/** Dämmerung: zwischen diesen Stunden wird die Dunkelheit hoch- und runtergefahren. */
const ABEND_VON = 19;
const ABEND_BIS = 22;
const MORGEN_VON = 4;
const MORGEN_BIS = 7;

/** Verschiebung, die eine ganze Nacht in EINEN Tagesindex holt (Nacht läuft über 0 Uhr). */
const NACHT_VERSATZ_MS = (24 - NACHT_BEGINN) * STUNDE_MS;

// ─── Party ───────────────────────────────────────────────────────────────────
/** Wie oft eine Nacht überhaupt eine Party hat. */
const PARTY_CHANCE = 0.35;
/** Dauer in Spielstunden — drei Stunden sind drei echte Minuten. */
const PARTY_DAUER_STUNDEN = 3;
/** Frühester und spätester Beginn, gezählt ab Einbruch der Nacht (20 Uhr). */
const PARTY_START_FRUEH = 0.5;
const PARTY_START_SPAET = 5;
/**
 * Faktor auf die Rainbow-Chance während der Party. Golden bleibt unverändert —
 * sonst verschiebt die Party die ganze Veredelungskurve und nicht nur ihr Highlight.
 *
 * War 4 — auf einer vollen Party-Nacht wirkte das zusammen mit der Veredelung
 * (siehe VEREDELUNG_ZIEL in world/ereignisse.js) deutlich zu dicht.
 */
const PARTY_RAINBOW_FAKTOR = 2;

/** Grundchancen einer frisch entstehenden Frucht. */
const RAINBOW_CHANCE = 0.01;
const GOLDEN_CHANCE = 0.04;

/**
 * Gleichverteilte Zahl 0..1 aus einem Text.
 *
 * FNV-1a allein reicht hier NICHT: die Eingaben sind fortlaufende Nummern
 * ("party:1", "party:2", …), und dabei bleiben benachbarte Ergebnisse benachbart.
 * Gemessen kam bei 35 % Sollchance eine Trefferquote von 54 % heraus. Der
 * Nachschlag unten (derselbe Mixer wie in Renderer._swayPhase) verteilt die Bits,
 * danach stimmt die Quote.
 */
function unitAusText(text) {
    const s = String(text);
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    h ^= h >>> 15;
    h = Math.imul(h, 2246822507);
    h ^= h >>> 13;
    h = Math.imul(h, 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

/** Stunde im Spieltag als Kommazahl, 0 bis 24. */
function spielStunde(now) {
    return ((now % TAG_MS) + TAG_MS) % TAG_MS / STUNDE_MS;
}

function zwischen(wert, von, bis) {
    if (bis <= von) return 0;
    return Math.max(0, Math.min(1, (wert - von) / (bis - von)));
}

/**
 * Wie dunkel es gerade ist, 0 bis 1. Die Dämmerung läuft weich über drei Stunden —
 * ein harter Umschlag um Punkt 20 Uhr sähe aus wie ein Schalter, nicht wie ein Abend.
 */
function dunkelheit(now) {
    const h = spielStunde(now);
    let anteil;
    if (h >= ABEND_BIS || h < MORGEN_VON) anteil = 1;              // tiefe Nacht
    else if (h >= ABEND_VON) anteil = zwischen(h, ABEND_VON, ABEND_BIS);
    else if (h < MORGEN_BIS) anteil = 1 - zwischen(h, MORGEN_VON, MORGEN_BIS);
    else anteil = 0;
    return anteil * NACHT_MAX;
}

/** Ist gerade Nacht (nach der Uhr, nicht nach der Helligkeit)? */
function istNacht(now) {
    const h = spielStunde(now);
    return h >= NACHT_BEGINN || h < NACHT_ENDE;
}

/** Laufende Nummer der Nacht — jede Nacht bekommt genau eine, auch über 0 Uhr hinweg. */
function nachtIndex(now) {
    return Math.floor((now + NACHT_VERSATZ_MS) / TAG_MS);
}

/**
 * Die Party dieser Nacht. Gibt es keine, ist `aktiv` false und `beginn` null.
 *
 * Alles hängt allein an `nachtIndex`: dieselbe Nacht ergibt überall dieselbe Party,
 * ohne dass irgendjemand etwas verteilen müsste.
 */
function partyStand(now) {
    const index = nachtIndex(now);
    if (unitAusText(`party:${index}`) >= PARTY_CHANCE) {
        return { aktiv: false, index, beginn: null, ende: null, verbleibendMs: 0 };
    }
    const spanne = PARTY_START_SPAET - PARTY_START_FRUEH;
    const startStunde = PARTY_START_FRUEH + unitAusText(`partystart:${index}`) * spanne;
    // Nachtanfang in echter Zeit: der Index zählt ab dem verschobenen Nullpunkt.
    const nachtBeginnMs = index * TAG_MS - NACHT_VERSATZ_MS;
    const beginn = nachtBeginnMs + startStunde * STUNDE_MS;
    const ende = beginn + PARTY_DAUER_STUNDEN * STUNDE_MS;
    return {
        aktiv: now >= beginn && now < ende,
        index, beginn, ende,
        verbleibendMs: Math.max(0, ende - now),
    };
}

/** Kurzform für alles, was nur wissen will, ob gerade Party ist. */
function istParty(now) {
    return partyStand(now).aktiv;
}

/** Wie lange die Anlage hoch- und wieder runterfährt. */
const PARTY_BLENDE_MS = 6000;

/**
 * Stärke der Party, 0 bis 1 — mit Ein- und Ausblende.
 *
 * Ohne Blende ginge das Licht schlagartig an und aus, was nach einem Fehler aussieht
 * statt nach einem Ereignis. Die Kurve steckt HIER und nicht im Renderer, damit sie
 * sich aus der Uhr ergibt: jeder Zuschauer sieht dieselbe Helligkeit, egal wann er
 * dazugekommen ist.
 */
function partyStaerke(now) {
    const p = partyStand(now);
    if (!p.aktiv) return 0;
    const rand = Math.min(now - p.beginn, p.ende - now);
    return Math.max(0, Math.min(1, rand / PARTY_BLENDE_MS));
}

/**
 * Sonderform einer neu entstehenden Frucht oder Pflanze.
 *
 * EINE Stelle für alle: vorher stand dieselbe Zeile viermal im Server (zwei in
 * routes/gardenGameRoutes.js, zwei in core/economy.js) und noch einmal im Browser.
 * Die Party konnte damit gar nicht flächendeckend wirken.
 *
 * @param {boolean|null} partyAktiv `null` = aus der Uhr ablesen. Ausdrücklich
 *   übergeben wird es, wenn eine Party von aussen läuft: der Admin kann eine
 *   starten (garden/world/ereignisse.js), und die steht nicht in der Uhr.
 * @param {string|null} seed Macht den Wurf reproduzierbar statt per `Math.random()`
 *   geraten — NUR für den ERSTEN Fruchtstand eines Dauerträgers (siehe
 *   neuerFruchtstand in core/economy.js). Der Browser würfelt dieselbe Stelle
 *   lokal mit, damit die Vorschau nicht etwas anderes zeigt als der Server —
 *   ohne denselben Seed kommen zwei ECHTE Zufallszahlen heraus, die sich fast
 *   nie decken: der Browser zeigt eine goldene Frucht, geerntet wird eine
 *   gewöhnliche (gemeldet 30.08.2026, dieselbe Ursache wie beim Reifezeit-Bug
 *   vom 21.08. — dort war nur die Reifezeit geseedet, die Sonderform nicht).
 */
function wuerfleSonderform(now = Date.now(), partyAktiv = null, seed = null) {
    const party = partyAktiv === null ? istParty(now) : Boolean(partyAktiv);
    const rainbow = RAINBOW_CHANCE * (party ? PARTY_RAINBOW_FAKTOR : 1);
    const r = seed != null ? unitAusText(seed) : Math.random();
    if (r < rainbow) return "Rainbow";
    if (r < rainbow + GOLDEN_CHANCE) return "Golden";
    return null;
}

/**
 * Welcher Party-Titel in dieser Nacht läuft, als Index in eine Liste.
 *
 * Hängt wie alles andere allein am `nachtIndex`: alle in derselben Welt hören
 * damit dasselbe Lied. Ein Zufall im Browser würde bei acht Spielern acht
 * verschiedene Titel ergeben — bei einem Ereignis, das ausdrücklich gemeinsam
 * stattfindet, wäre das der falsche Zufall.
 *
 * Die Dateinamen stehen bewusst NICHT hier: Bildpfade und Tonspuren gehören zum
 * Browser, dieses Modul kennt nur Zahlen.
 */
function partyTitelIndex(now, anzahl) {
    const n = Math.max(1, Math.floor(Number(anzahl) || 1));
    return Math.min(n - 1, Math.floor(unitAusText(`partytitel:${nachtIndex(now)}`) * n));
}

/** Uhrzeit als "21:40" — für die Anzeige im HUD. */
function uhrzeit(now) {
    const h = spielStunde(now);
    const stunden = Math.floor(h);
    const minuten = Math.floor((h - stunden) * 60);
    return `${String(stunden).padStart(2, "0")}:${String(minuten).padStart(2, "0")}`;
}
// ─── SPIEGEL-ENDE ───────────────────────────────────────────────────────────

export {
    TAG_MS, STUNDE_MS, NACHT_BEGINN, NACHT_ENDE, NACHT_MAX,
    PARTY_CHANCE, PARTY_DAUER_STUNDEN, PARTY_RAINBOW_FAKTOR,
    RAINBOW_CHANCE, GOLDEN_CHANCE,
    spielStunde, dunkelheit, istNacht, nachtIndex, partyStand, istParty, partyStaerke,
    partyTitelIndex, wuerfleSonderform, uhrzeit,
    // Nicht nur fürs Party-Datum: derselbe gleichverteilte 0..1-Hash aus einem Text
    // ist auch das Werkzeug gegen "Server und Browser würfeln unabhängig voneinander
    // dasselbe Ereignis aus" — siehe engine/PlantSystem.js (erster Fruchtstand eines
    // Dauerträgers, dieselbe Fruchtreife muss auf beiden Seiten herauskommen).
    unitAusText,
};
