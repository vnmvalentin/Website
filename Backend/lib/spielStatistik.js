// lib/spielStatistik.js — Andockstelle der Spiele für den Admin-Reiter „Spiele“. Zwei Zahlen kann ein Spiel melden:
//
//   meldeSpielAn("worldflip", () => ({ raeume: rooms.size, spieler: anzahlVerbunden }));   // einmal beim Laden
//   zaehlePartie("worldflip");                                                             // bei jedem Partiestart
//
// Live-Zahlen (offene Räume, Spieler darin) werden erst beim Abruf im Admin geholt; Partien landen als Tagessumme in
// der Besucherstatistik (analytics/analyticsStore.js, Tabelle match_day). Die IDs sind die aus analytics/spiele.js,
// unbekannte IDs werden dort verworfen. Spiele ohne Anmeldung erscheinen im Admin trotzdem, nur mit „–“.
//
// Absichtlich ohne eigene Datenbank: den Speicher für Partien verbindet Backend/index.js beim Start
// (verbindePartienSpeicher). In Tests eines Spiels ist er nicht verbunden — zaehlePartie zählt dann nichts und
// schreibt vor allem nie in die echte Statistik.

const quellen = new Map();
let partienSpeicher = null;
let letzterFehler = 0;

const zahl = (x) => {
  const n = Number(x);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
};

/** Live-Zahlen eines Spiels anmelden. `liefere()` gibt { raeume, spieler } zurück (rooms/players geht auch). */
function meldeSpielAn(id, liefere) {
  if (typeof liefere !== "function") throw new Error(`meldeSpielAn(${id}): Lieferfunktion fehlt`);
  quellen.set(String(id), liefere);
}

/** { [id]: { raeume, spieler } | null } für alle angemeldeten Spiele; null = Lieferfunktion warf */
function liveZahlen() {
  const out = {};
  for (const [id, liefere] of quellen) {
    try {
      const r = liefere() || {};
      out[id] = { raeume: zahl(r.raeume ?? r.rooms), spieler: zahl(r.spieler ?? r.players) };
    } catch {
      out[id] = null;
    }
  }
  return out;
}

/** Eine begonnene Partie zählen. Liefert true, wenn sie gezählt wurde. Wirft nie — ein Spiel soll daran nie hängen. */
function zaehlePartie(id) {
  if (!partienSpeicher) return false;
  try {
    return partienSpeicher(String(id)) !== false;
  } catch (e) {
    // höchstens eine Zeile pro Minute, falls der Speicher dauerhaft klemmt
    if (Date.now() - letzterFehler > 60_000) {
      letzterFehler = Date.now();
      console.error("[spielStatistik] Partie nicht gezählt:", e.message);
    }
    return false;
  }
}

/** Nur für Backend/index.js (und Tests): wohin zaehlePartie schreibt. null trennt wieder. */
function verbindePartienSpeicher(fn) {
  partienSpeicher = typeof fn === "function" ? fn : null;
}

module.exports = { meldeSpielAn, liveZahlen, zaehlePartie, verbindePartienSpeicher };
