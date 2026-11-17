// ergebnis.js — Sacrifice & Sigils: Werte fürs Ergebnisbild (utils/ergebnisbild.js) nach einem gewonnenen Duell und
// nach der Moorwanderung (Podestplatz). Namen der Gegner kommen nicht aufs Bild.

/**
 * Duell (1 gegen 1).
 * @param {object} p
 * @param {[number, number]} p.siege   view.wins
 * @param {0|1} p.ich                  eigener Platz (Sieger)
 * @param {{direct?: number, kills?: number, played?: number}} p.stats  eigene Zahlen
 * @param {string} [p.zirkel]          Name des Zirkels
 * @param {string} [p.staerkste]       Name der stärksten Karte
 * @param {boolean} [p.aufgabe]        der Gegner hat aufgegeben
 */
export function duellErgebnis({ siege, ich, stats = {}, zirkel = "", staerkste = "", aufgabe = false }) {
  const meine = Number(siege?.[ich]) || 0;
  const seine = Number(siege?.[1 - ich]) || 0;
  const werte = [
    { name: "Schaden auf die Waage", wert: String(Number(stats.direct) || 0) },
    { name: "Gegner besiegt", wert: String(Number(stats.kills) || 0) },
    { name: "Karten gespielt", wert: String(Number(stats.played) || 0) },
  ];
  if (staerkste) werte.push({ name: "Stärkste Karte", wert: staerkste });
  return {
    spiel: "sacrifice-and-sigils",
    kicker: ["Duell", zirkel || null].filter(Boolean).join(" · "),
    marke: aufgabe ? "Gegner hat aufgegeben" : null,
    gross: `${meine} : ${seine}`,
    unter: "Duell gewonnen",
    werte,
    aufruf: "Ein Opfer, ein Siegel. Setzt du dich an den Tisch?",
    text: `Sacrifice & Sigils: Duell ${meine} : ${seine} gewonnen${zirkel ? ` (${zirkel})` : ""}.`,
  };
}

/**
 * Moorwanderung (Run-Modus, 2–6 Spieler).
 * @param {object} p
 * @param {number} p.platz       eigener Platz
 * @param {number} p.spieler     Zahl der Spieler
 * @param {number} p.siegel      verbliebene Lebenssiegel
 * @param {number} p.siegelMax
 * @param {{duelsWon?: number, duelsLost?: number, npcWins?: number, fuses?: number}} [p.stats]
 * @param {string} [p.zirkel]
 */
export function moorErgebnis({ platz, spieler, siegel, siegelMax, stats = {}, zirkel = "" }) {
  const werte = [
    { name: "Duelle", wert: `${Number(stats.duelsWon) || 0} : ${Number(stats.duelsLost) || 0}` },
    { name: "Lebenssiegel übrig", wert: `${Number(siegel) || 0} / ${Number(siegelMax) || 0}` },
    { name: "Gegner im Moor besiegt", wert: String(Number(stats.npcWins) || 0) },
    { name: "Verschmelzungen", wert: String(Number(stats.fuses) || 0) },
  ];
  return {
    spiel: "sacrifice-and-sigils",
    pfad: "/sacrifice-and-sigils/moorwanderung",
    kicker: ["Die Moorwanderung", zirkel || null].filter(Boolean).join(" · "),
    marke: platz === 1 ? "Sieger der Moorwanderung" : null,
    gross: `Platz ${platz}`,
    unter: `von ${spieler} Wanderern`,
    werte,
    aufruf: "Wer kommt mit ins Moor?",
    text: `Sacrifice & Sigils: Platz ${platz} von ${spieler} in der Moorwanderung.`,
  };
}
