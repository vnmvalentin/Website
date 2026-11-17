// utils/tagesaufgaben.js — ANDOCKSTELLE „Heute“ der persönlichen Startseite (Ausbauplan persoenliche-startseite):
// Jedes Spiel mit einer täglichen Runde kann hier eine Kachel eintragen. Die Startseite zeigt sie angemeldeten
// Besuchern in dieser Reihenfolge; eine Kachel, deren laden() null liefert oder wirft, fehlt einfach.
//
//   {
//     id: "kurz-kebab",
//     pfad: "/ziel-der-kachel",
//     laden: async ({ lang, storage, fetchImpl }) => ({
//       titel: "Tagesrunde",                 // in der Sprache `lang` (de | en)
//       zeile: "3/5 · 240 Punkte · Serie 4", // Stand in einer Zeile
//       fortschritt: { wert: 3, max: 5 },     // optional: kleiner Balken
//       fertig: false,                        // heute erledigt?
//     }) | null,
//   }
//
// laden() läuft im Browser beim Öffnen der Startseite. Bitte billig halten: keine großen Importe (sonst dynamisch
// laden), höchstens eine kleine Server-Abfrage. Nur lesen — Spielstände werden hier nie verändert.
import { defineMessages } from "../i18n/core.js";
import { syncDaily, doneCount, totalOf, streakOf, MAX_TOTAL, DAILY_GAMES } from "../pages/ClashRoyale/clash/dailyRound.js";

export const AUFGABEN_TEXTE = defineMessages({
  de: {
    crTitel: "CR-Tagesrunde",
    crNeu: "5 Ratespiele, bis zu 500 Punkte",
    crSerieHalten: (n) => `Heute noch offen · Serie ${n} halten`,
    crTeil: (n, max, punkte) => `${n}/${max} gespielt · ${punkte} Punkte`,
    crFertig: (punkte, max) => `Fertig · ${punkte} von ${max} Punkten`,
    serie: (n) => `Serie ${n}`,
    srTitel: "Seed Runners Tagesrennen",
    srNeu: "Jeden Tag eine neue Strecke für alle",
    srOffen: (n) => (n ? `Heute noch nicht gelaufen · ${n} im Ziel` : "Heute noch nicht gelaufen"),
    srPlatz: (platz) => `Heute auf Platz ${platz}`,
  },
  en: {
    crTitel: "CR daily round",
    crNeu: "5 guessing games, up to 500 points",
    crSerieHalten: (n) => `Still open today · keep your ${n}-day streak`,
    crTeil: (n, max, punkte) => `${n}/${max} played · ${punkte} points`,
    crFertig: (punkte, max) => `Done · ${punkte} of ${max} points`,
    serie: (n) => `${n}-day streak`,
    srTitel: "Seed Runners daily race",
    srNeu: "A new track for everyone every day",
    srOffen: (n) => (n ? `Not run yet today · ${n} finished` : "Not run yet today"),
    srPlatz: (platz) => `Rank ${platz} today`,
  },
});

/** CR-Tagesrunde (/clash/heute): Stand aus dem Browser, keine Server-Abfrage (Anschluss tagesrunde-startseite, Spur B) */
export async function ladeCrTagesrunde({ lang = "de", storage = globalThis.localStorage } = {}) {
  const t = AUFGABEN_TEXTE.dict(lang);
  const { day, scores, days } = syncDaily({ storage });
  const n = doneCount(scores);
  const max = DAILY_GAMES.length;
  const punkte = totalOf(scores);
  const serie = streakOf(days, day).current;
  let zeile;
  if (n === 0) zeile = serie > 0 ? t.crSerieHalten(serie) : t.crNeu;
  else if (n < max) zeile = `${t.crTeil(n, max, punkte)}${serie > 0 ? ` · ${t.serie(serie)}` : ""}`;
  else zeile = `${t.crFertig(punkte, MAX_TOTAL)}${serie > 0 ? ` · ${t.serie(serie)}` : ""}`;
  return { titel: t.crTitel, zeile, fortschritt: { wert: n, max }, fertig: n >= max };
}

/**
 * Seed-Runners-Tagesrennen (/seed-runners/daily): eigener Platz von heute. Wer Seed Runners noch nie geöffnet hat,
 * bekommt keine Abfrage (und keine neue Spieler-Kennung im Browser).
 */
export async function ladeSrTagesrennen({ lang = "de", storage = globalThis.localStorage, fetchImpl = globalThis.fetch } = {}) {
  const t = AUFGABEN_TEXTE.dict(lang);
  let gespielt = false;
  try { gespielt = Boolean(storage.getItem("seedrunners_player")); } catch { /* ohne Speicher wie neu */ }
  if (!gespielt) return { titel: t.srTitel, zeile: t.srNeu, fortschritt: null, fertig: false };
  const { getDailyKey } = await import("../pages/SeedRunners/room/identity.js");
  const key = await getDailyKey();
  const r = await fetchImpl("/api/seed-runners/daily", { headers: key ? { "X-Player-Key": key } : {} });
  if (!r.ok) return null;
  const d = await r.json();
  // Die Rangliste kommt höchstens mit 50 Einträgen
  const n = Array.isArray(d?.today) ? (d.today.length >= 50 ? "50+" : d.today.length) : 0;
  const platz = d?.me?.rank;
  if (platz) return { titel: t.srTitel, zeile: t.srPlatz(platz), fortschritt: null, fertig: true };
  return { titel: t.srTitel, zeile: t.srOffen(n), fortschritt: null, fertig: false };
}

export const TAGESAUFGABEN = [
  { id: "cr-tagesrunde", pfad: "/clash/heute", laden: ladeCrTagesrunde },
  { id: "sr-tagesrennen", pfad: "/seed-runners/daily", laden: ladeSrTagesrennen },
];

/** Alle Kacheln laden; Fehler einer Kachel kosten nur sie. @returns {Promise<Array<{ id, pfad, titel, zeile, fortschritt, fertig }>>} */
export async function ladeTagesaufgaben(opt = {}, liste = TAGESAUFGABEN) {
  const ergebnisse = await Promise.all(liste.map(async (a) => {
    try {
      const r = await a.laden(opt);
      return r ? { id: a.id, pfad: a.pfad, ...r } : null;
    } catch {
      return null;
    }
  }));
  return ergebnisse.filter(Boolean);
}
