// ergebnis.js — Blobby Volley: Werte fürs Ergebnisbild (utils/ergebnisbild.js), nur für die Gewinner einer Partie.
import { PARTY_LABELS, normalizeSettings } from "./settings.js";

/**
 * @param {object} p
 * @param {{1: number, 2: number}} p.score
 * @param {1|2} p.team            eigenes Team (= Siegerteam)
 * @param {object} p.settings     Raumeinstellungen
 * @param {number} [p.koenigSerie]  König des Strandes: Siege in Folge (0 = kein König-Modus)
 */
export function blobbyErgebnis({ score, team, settings, koenigSerie = 0 }) {
  const s = normalizeSettings(settings);
  const ich = Number(score?.[team]) || 0;
  const gegen = Number(score?.[team === 1 ? 2 : 1]) || 0;
  const modus = s.mode === "2v2" ? "2 gegen 2" : "1 gegen 1";
  const feld = s.field === "beach" ? "Ego 3D" : "Klassisch";

  let marke = null;
  if (s.koenig && koenigSerie > 1) marke = `${koenigSerie}× König in Folge`;
  else if (s.koenig && koenigSerie === 1) marke = "König des Strandes";
  else if (gegen === 0) marke = "Zu null";

  const werte = [
    { name: "Punkte", wert: String(ich) },
    { name: "Gegenpunkte", wert: String(gegen) },
    { name: "Feld", wert: feld },
  ];
  if (s.party.length) werte.push({ name: "Partyregeln", wert: s.party.map((r) => PARTY_LABELS[r]).join(", ") });
  else if (s.powerups) werte.push({ name: "Powerups", wert: "an" });

  return {
    spiel: "blobby",
    kicker: [s.koenig ? "König des Strandes" : null, modus].filter(Boolean).join(" · "),
    marke,
    gross: `${ich} : ${gegen}`,
    unter: s.mode === "2v2" ? "Gewonnen, zu zweit" : "Gewonnen",
    werte,
    aufruf: "Ein Link, ein Ball. Wer will Revanche?",
    text: `Blobby Volley: ${ich} : ${gegen} gewonnen (${modus}${s.koenig && koenigSerie > 1 ? `, ${koenigSerie}× König in Folge` : ""}).`,
  };
}
