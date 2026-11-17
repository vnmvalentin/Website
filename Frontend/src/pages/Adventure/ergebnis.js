// ergebnis.js — adVentures: Werte fürs Ergebnisbild (utils/ergebnisbild.js) nach einem Lauf.
// Rein und ohne Datenimporte: Kit- und Schwierigkeitsname reicht der EndScreen herein.

const zahl = (n) => Math.round(Number(n) || 0).toLocaleString("de-DE");

function dauer(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
}

/**
 * @param {object} result       Ergebnis aus dem Lauf (wie im EndScreen)
 * @param {object} namen        { kit: "Mönch", schwierigkeit: "Albtraum" }
 */
export function adventureErgebnis(result, namen = {}) {
  const s = result?.server || null;
  const stats = result?.stats || {};
  const kills = Number(stats.kills) || 0;
  const tiefe = result?.loop > 0 ? (Number(result.stagesCleared) || 0) + 1 : null;
  const schwierigkeit = `${namen.schwierigkeit || ""}${result?.ascension ? `+${result.ascension}` : ""}`;
  const ausgang = result?.won ? "Sieg" : result?.dead ? "Gefallen" : "Lauf beendet";

  let marke = null;
  if (s?.isRecord) marke = "Neuer Rekord";
  else if (s?.isDepthRecord) marke = `Neue Bestmarke: Tiefe ${s.depth}`;
  else if (result?.won) marke = "Sieg";

  const werte = [
    { name: "Zeit", wert: dauer(result?.time) },
    tiefe ? { name: "Tiefe", wert: String(tiefe) } : { name: "Welten", wert: String(Number(result?.stagesCleared) || 0) },
    { name: "Bosse", wert: String(Number(stats.bossesKilled) || 0) },
    s?.score !== undefined ? { name: "Punkte", wert: zahl(s.score) } : { name: "Stufe", wert: String(Number(result?.level) || 1) },
  ];

  return {
    spiel: "adventures",
    kicker: [result?.mode === "daily" ? "Tageslauf" : null, namen.kit, schwierigkeit || null].filter(Boolean).join(" · "),
    marke,
    gross: zahl(kills),
    unter: result?.won ? "Gegner besiegt · Sieg" : result?.dead ? "Gegner besiegt, dann gefallen" : "Gegner besiegt",
    werte,
    aufruf: "Wie weit kommst du?",
    text: `adVentures: ${ausgang}${namen.kit ? ` mit ${namen.kit}` : ""}${schwierigkeit ? ` (${schwierigkeit})` : ""} · ${zahl(kills)} Gegner in ${dauer(result?.time)}${tiefe ? ` · Tiefe ${tiefe}` : ""}.`,
  };
}
