// Uhrenabgleich mit dem Server für den gemeinsamen Start.
//
// Der Server nennt den Startzeitpunkt in SEINER Zeit (Date.now des Servers). Jeder Client muss
// daraus seinen eigenen Zeitpunkt machen, ohne dass seine Uhr richtig gehen muss. Dazu fragt er
// mehrmals nach der Serverzeit ("ping") und schätzt den Versatz:
//
//   Anfrage geht bei t0 raus, Antwort kommt bei t1 an, der Server hat serverNow gesagt.
//   Die Antwort entstand etwa in der Mitte: Versatz = serverNow − (t0 + t1) / 2.
//
// Der Fehler dieser Schätzung ist höchstens die halbe Umlaufzeit (rtt / 2) — und zwar bei den
// Messungen mit der KLEINSTEN Umlaufzeit am kleinsten, weil dort Hin- und Rückweg am ehesten
// gleich lang waren. Deshalb zählt nur die beste der letzten Messungen, nicht der Mittelwert.
//
// Danach ist Start in lokaler Zeit = Startzeit des Servers − Versatz.
//
// Kein DOM-Zugriff, damit die Tests es direkt in Node laufen lassen können.

const KEEP = 10;

export function createClockSync() {
  let samples = [];

  return {
    /** t0/t1: Date.now() des Clients beim Senden/Empfangen, serverNow: Antwort des Servers */
    addSample(t0, t1, serverNow) {
      const rtt = t1 - t0;
      if (!(rtt >= 0) || !Number.isFinite(serverNow)) return;
      samples.push({ rtt, offset: serverNow - (t0 + t1) / 2 });
      if (samples.length > KEEP) samples = samples.slice(-KEEP);
    },

    /** Bester Versatz (Server − Client) in ms; null, solange nichts gemessen wurde */
    get offset() {
      if (samples.length === 0) return null;
      return samples.reduce((best, s) => (s.rtt < best.rtt ? s : best)).offset;
    },

    /** Umlaufzeit der besten Messung — ein Maß für die Unsicherheit (± rtt/2) */
    get rtt() {
      if (samples.length === 0) return null;
      return Math.min(...samples.map((s) => s.rtt));
    },

    get count() {
      return samples.length;
    },

    /** Serverzeit → lokale Zeit (Date.now-Skala). Ohne Messung unverändert (Uhren als gleich annehmen). */
    toLocal(serverMs) {
      const off = this.offset;
      return off === null ? serverMs : serverMs - off;
    },
  };
}
