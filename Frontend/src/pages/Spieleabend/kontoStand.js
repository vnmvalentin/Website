// kontoStand.js — Spieleabend am Konto (utils/spielKonto.js): Partien und Siege je Spiel, gezählt am Ende einer Partie
// am Tisch (Zimmer.jsx). Rein, ohne React und Netz (node --test). Wer nur zuschaut, zählt nicht.
import { zaehlerStatistik } from "../../utils/spielstand.js";

export const SA_STATISTIK = zaehlerStatistik({
  spiel: "spieleabend",
  schluessel: "spieleabend.stats",
  felder: ["partien", "siege", "vierGewinnt", "maedn", "hochstapler", "entlarvt"],
});

/**
 * Eine beendete Partie zählen.
 * @param {{ partie: string, spiel: string, gewonnen: boolean, warHochstapler?: boolean }} p
 *   partie  eindeutig je Partie (Raum + Partienummer) · spiel: vierGewinnt | maedn | zeichnen
 */
export function zaehleSpieleabendPartie({ partie, spiel, gewonnen, warHochstapler = false }, speicher) {
  return SA_STATISTIK.zaehle(partie, {
    partien: 1,
    siege: gewonnen ? 1 : 0,
    vierGewinnt: gewonnen && spiel === "vierGewinnt" ? 1 : 0,
    maedn: gewonnen && spiel === "maedn" ? 1 : 0,
    hochstapler: gewonnen && spiel === "zeichnen" && warHochstapler ? 1 : 0,
    entlarvt: gewonnen && spiel === "zeichnen" && !warHochstapler ? 1 : 0,
  }, {}, speicher);
}

export const SPIELEABEND_KONTO = {
  lies: () => SA_STATISTIK.lies(),
  schreib: (stand) => SA_STATISTIK.schreib(stand),
  xp: (stand) => {
    const s = SA_STATISTIK.normalisiere(stand);
    return s.partien * 10 + s.siege * 5;
  },
  zusammenfuehren: SA_STATISTIK.zusammenfuehren,
  erfolge: (stand) => {
    const s = SA_STATISTIK.normalisiere(stand);
    return [
      s.vierGewinnt >= 1 && "vier-in-reihe",
      s.maedn >= 1 && "alle-im-haus",
      s.hochstapler >= 1 && "hochstapler",
      s.entlarvt >= 1 && "spuernase",
    ].filter(Boolean);
  },
  bestwerte: (stand) => ({ siege: SA_STATISTIK.normalisiere(stand).siege }),
};
