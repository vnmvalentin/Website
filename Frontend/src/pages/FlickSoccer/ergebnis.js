// ergebnis.js — Flick Soccer: Werte fürs Ergebnisbild (utils/ergebnisbild.js) nach dem Abpfiff.
// Geteilt wird ein eigener Sieg (gegen den Computer, online, Tour, Turnier) oder eine Partie zu zweit an einem Gerät.

const KICKER = {
  tour: (p) => `Tour${p.cup ? ` · ${p.cup}` : ""}`,
  ki: () => "Gegen den Computer",
  lokal: () => "Zu zweit an einem Gerät",
  online: () => "Online-Partie",
  turnier: () => "Turnier",
};

/**
 * @param {object} p
 * @param {[number, number]} p.score
 * @param {0|1|null} p.team      eigenes Team (null = zu zweit an einem Gerät, dann zählt der Sieger)
 * @param {0|1|null} p.winner
 * @param {"tour"|"ki"|"lokal"|"online"|"turnier"} p.modus
 * @param {string} [p.gegner]    Name des Tour-Gegners oder Stufe des Computers
 * @param {string} [p.cup]       Tour-Pokal
 * @param {number} [p.sterne]    Tour-Sterne 0–3
 * @param {number} [p.gegentore] ohne Vorsprung eines Endgegners
 * @param {boolean} [p.aufgabe]  der Gegner hat aufgegeben
 */
export function flickErgebnis({ score, team, winner, modus, gegner = "", cup = "", sterne = 0, gegentore = null, aufgabe = false }) {
  const s = Array.isArray(score) ? score.map((n) => Number(n) || 0) : [0, 0];
  const zuZweit = team === null || team === undefined;
  const ich = zuZweit ? 0 : team;
  const tore = s[ich];
  const gegen = s[1 - ich];
  const gt = Number.isFinite(gegentore) ? gegentore : gegen;
  const sieger = winner === 0 ? "Rot" : winner === 1 ? "Blau" : null;

  let unter;
  if (zuZweit) unter = sieger ? `${sieger} gewinnt` : "Unentschieden";
  else if (modus === "tour") unter = gegner ? `Sieg gegen ${gegner}` : "Sieg in der Tour";
  else if (modus === "ki") unter = `Sieg gegen den Computer${gegner ? ` (${gegner})` : ""}`;
  else if (modus === "turnier") unter = "Turnierspiel gewonnen";
  else unter = aufgabe ? "Sieg, der Gegner hat aufgegeben" : "Online gewonnen";

  let marke = null;
  if (!zuZweit && modus === "tour" && sterne >= 3) marke = "Drei Sterne";
  else if (!zuZweit && gt === 0 && !aufgabe) marke = "Zu null";

  const werte = zuZweit
    ? [{ name: "Tore Rot", wert: String(s[0]) }, { name: "Tore Blau", wert: String(s[1]) }]
    : [{ name: "Tore", wert: String(tore) }, { name: "Gegentore", wert: String(gt) }];
  if (!zuZweit && modus === "tour") werte.push({ name: "Sterne", wert: `${Math.max(0, Math.min(3, sterne))} / 3` });

  const gross = zuZweit ? `${s[0]} : ${s[1]}` : `${tore} : ${gegen}`;
  return {
    spiel: "flick-soccer",
    kicker: (KICKER[modus] || KICKER.online)({ cup }),
    marke,
    gross,
    unter,
    werte,
    aufruf: zuZweit ? "Zieh, ziel, schieß. Wer spielt mit?" : "Traust du dich gegen mich?",
    text: `Flick Soccer: ${gross} · ${unter}.`,
  };
}
