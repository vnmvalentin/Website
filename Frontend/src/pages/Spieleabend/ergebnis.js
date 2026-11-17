// ergebnis.js — Spieleabend: Werte fürs Ergebnisbild (utils/ergebnisbild.js), nur für Gewinner.
// Namen der anderen kommen nicht aufs Bild — nur wie viele am Tisch saßen.

/**
 * @param {object} p
 * @param {string} p.spielId       vierGewinnt | maedn | zeichnen
 * @param {string} p.spielName     Anzeigename des Spiels
 * @param {number} p.menschen      Menschen am Tisch (mit einem selbst)
 * @param {number} p.bots          Bots am Tisch
 * @param {string} [p.farbe]       eigene Farbe (4 gewinnt, Mensch ärgere dich nicht)
 * @param {object} [p.zeichnen]    Zeichen-Hochstapler: { hochstapler: bool (man war es selbst), erwischt, richtig, wort }
 */
export function spieleabendErgebnis({ spielId, spielName, menschen = 1, bots = 0, farbe = "", zeichnen = null }) {
  const werte = [{ name: "Am Tisch", wert: `${menschen + bots} Spieler` }];
  if (bots > 0) werte.push({ name: "Davon Bots", wert: String(bots) });

  let gross = "Gewonnen";
  let unter = farbe ? `mit ${farbe}` : "";
  let text = `Spieleabend: ${spielName} gewonnen${bots > 0 && menschen === 1 ? " (gegen Bots)" : ""}.`;
  if (spielId === "vierGewinnt") unter = `Vier in einer Reihe${farbe ? ` · ${farbe}` : ""}`;
  if (spielId === "maedn") unter = `Zuerst alle Figuren im Haus${farbe ? ` · ${farbe}` : ""}`;
  if (spielId === "zeichnen" && zeichnen) {
    if (zeichnen.wort) werte.push({ name: "Das Wort", wert: String(zeichnen.wort) });
    if (zeichnen.hochstapler && !zeichnen.erwischt) {
      gross = "Reingelegt";
      unter = "Als Hochstapler nicht erwischt";
    } else if (zeichnen.hochstapler) {
      gross = "Gerettet";
      unter = "Erwischt, aber das Wort erraten";
    } else {
      gross = "Erwischt";
      unter = "Den Hochstapler entlarvt";
    }
    text = `Spieleabend · Zeichen-Hochstapler: ${unter}.`;
  }

  return {
    spiel: "spieleabend",
    kicker: [spielName, bots > 0 && menschen === 1 ? "gegen Bots" : `${menschen} am Tisch`].join(" · "),
    gross,
    unter,
    werte,
    aufruf: "Ein Zimmer, ein Tisch. Kommst du?",
    text,
  };
}
