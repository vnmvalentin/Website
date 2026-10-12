// seedRunners/dateKey.js — Kalendertag für Tagesrennen und Tagesrangliste.
//
// Zeitzone Europe/Berlin (nicht UTC, nicht Server-Ortszeit): Seite und Zielgruppe sind deutschsprachig, "um 0 Uhr
// zurücksetzen" meint also deutsche Mitternacht. Ein einziges "heute" für alle Spieler bleibt gewahrt (kein Wechsel pro
// Spieler-Zeitzone). Intl.DateTimeFormat statt manueller Offset-Rechnung, damit die Sommerzeit automatisch mitläuft.
// (Lag früher in dle/core/dailySeed.js; die Daily Games sind seit Okt. 2026 entfernt.)
function todayDateKey() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

module.exports = { todayDateKey };
