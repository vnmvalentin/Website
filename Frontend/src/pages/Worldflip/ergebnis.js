// ergebnis.js — Worldflip: Werte fürs Ergebnisbild (utils/ergebnisbild.js), nur für Gewinner.
// Namen der Mitspieler kommen nicht aufs Bild — nur Zahlen.

/**
 * @param {object} p
 * @param {number} p.zuege        view.turnNo
 * @param {Array<number|null>} p.karten  view.counts (Karten je Platz, null = verdeckt)
 * @param {number} p.platz        eigener Platz
 * @param {Array<{bot?: boolean}>} p.spieler  table.players
 * @param {number[]|null} [p.teams]  Team je Platz (2 gegen 2) oder null
 * @param {string} [p.teamName]   Name des Siegerteams
 */
export function worldflipErgebnis({ zuege, karten, platz, spieler, teams = null, teamName = "" }) {
  const n = Array.isArray(spieler) ? spieler.length : 0;
  const nurBots = n > 1 && spieler.every((s, i) => i === platz || s?.bot);
  const andere = (karten || []).filter((k, i) => i !== platz && (!teams || teams[i] !== teams[platz]) && Number.isFinite(k));
  const rest = andere.reduce((a, k) => a + k, 0);
  const knapp = andere.length ? Math.min(...andere) : null;
  const zugText = `${zuege} ${zuege === 1 ? "Zug" : "Züge"}`;

  const werte = [
    { name: "Züge am Tisch", wert: String(zuege) },
    { name: teams ? "Karten beim anderen Team" : "Karten bei den anderen", wert: String(rest) },
  ];
  if (knapp !== null) werte.push({ name: "Knappster Gegner", wert: `${knapp} ${knapp === 1 ? "Karte" : "Karten"}` });
  werte.push({ name: "Am Tisch", wert: `${n} Spieler` });

  return {
    spiel: "worldflip",
    kicker: [teams ? "2 gegen 2" : `Runde zu ${n}`, nurBots ? "gegen Bots" : "online"].join(" · "),
    marke: teams && teamName ? teamName : null,
    gross: "Gewonnen",
    unter: teams ? `Unser Team war zuerst leer · ${zugText}` : `Zuerst alle Karten los · ${zugText}`,
    werte,
    aufruf: "Vier Welten, ein Tisch. Spielst du mit?",
    text: teams
      ? `Worldflip: Sieg im 2 gegen 2 nach ${zugText}.`
      : `Worldflip: Runde zu ${n} gewonnen nach ${zugText}${nurBots ? " (gegen Bots)" : ""}.`,
  };
}
