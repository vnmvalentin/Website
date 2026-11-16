// utils/kontoAbgleich.js — wie ein Spielstand im Browser und einer am Konto zusammenkommen (ohne Netz und ohne React,
// damit es sich in node --test prüfen lässt). Benutzt von utils/kontoSpeicher.js.

const gleich = (a, b) => {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
};

/** Standard beim Zusammenführen: der Stand mit mehr Erfahrungspunkten gewinnt, bei Gleichstand der vom Konto. */
export function mehrXpGewinnt(konto, browser, xp) {
  return Number(xp(browser)) > Number(xp(konto)) ? browser : konto;
}

/**
 * @param {object} p
 * @param {{ daten: any, xp: number, version: number } | null} p.server  Stand am Konto (null = noch keiner)
 * @param {any} p.lokal                    Stand im Browser (null/undefined = keiner)
 * @param {(stand: any) => number} p.xp
 * @param {(konto: any, browser: any) => any} [p.zusammenfuehren]
 * @returns {{ aktion: "nichts" | "hochladen" | "uebernehmen" | "beides", stand?: any }}
 *   hochladen    der Browser-Stand geht ans Konto (erster Login mit vorhandenem Browser-Stand)
 *   uebernehmen  der Konto-Stand kommt in den Browser
 *   beides       zusammengeführter Stand in den Browser und ans Konto
 */
export function entscheideAbgleich({ server, lokal, xp, zusammenfuehren }) {
  const hatLokal = lokal !== null && lokal !== undefined;
  if (!server) return hatLokal ? { aktion: "hochladen", stand: lokal } : { aktion: "nichts" };
  if (!hatLokal) return { aktion: "uebernehmen", stand: server.daten };
  if (gleich(server.daten, lokal)) return { aktion: "nichts" };
  const zusammen = zusammenfuehren
    ? zusammenfuehren(server.daten, lokal)
    : mehrXpGewinnt(server.daten, lokal, xp);
  if (gleich(zusammen, server.daten)) return { aktion: "uebernehmen", stand: zusammen };
  if (gleich(zusammen, lokal)) return { aktion: "hochladen", stand: zusammen };
  return { aktion: "beides", stand: zusammen };
}

/** Erfahrungspunkte sicher lesen: ganze Zahl ≥ 0, sonst 0 */
export function sichereXp(xp, stand) {
  try {
    const n = Math.floor(Number(xp(stand)));
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}
