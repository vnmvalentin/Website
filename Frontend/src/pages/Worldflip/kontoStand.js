// kontoStand.js — Worldflip am Konto (utils/spielKonto.js): Runden und Siege je Spieler, gezählt am Rundenende
// (components/EndPanel.jsx). Rein, ohne React und Netz (node --test).
import { zaehlerStatistik } from "../../utils/spielstand.js";

export const WF_STATISTIK = zaehlerStatistik({
  spiel: "worldflip",
  schluessel: "worldflip.stats",
  felder: ["runden", "siege", "teamSiege", "menschenSiege"],
});

/**
 * Eine beendete Runde zählen (nur wer mitgespielt hat).
 * @param {{ partie: string, gewonnen: boolean, team: boolean, menschen: boolean }} p
 *   partie    eindeutig je Runde (Raum + Rundennummer), damit nichts doppelt zählt
 *   team      2 gegen 2 · menschen: mindestens ein anderer Mensch am Tisch
 */
export function zaehleWorldflipRunde({ partie, gewonnen, team = false, menschen = false }, speicher) {
  return WF_STATISTIK.zaehle(partie, {
    runden: 1,
    siege: gewonnen ? 1 : 0,
    teamSiege: gewonnen && team ? 1 : 0,
    menschenSiege: gewonnen && menschen ? 1 : 0,
  }, {}, speicher);
}

export const WORLDFLIP_KONTO = {
  lies: () => WF_STATISTIK.lies(),
  schreib: (stand) => WF_STATISTIK.schreib(stand),
  xp: (stand) => {
    const s = WF_STATISTIK.normalisiere(stand);
    return s.runden * 10 + s.siege * 5;
  },
  zusammenfuehren: WF_STATISTIK.zusammenfuehren,
  erfolge: (stand) => {
    const s = WF_STATISTIK.normalisiere(stand);
    return [
      s.siege >= 1 && "erster-sieg",
      s.menschenSiege >= 1 && "voller-tisch",
      s.teamSiege >= 1 && "teamgeist",
      s.siege >= 10 && "weltenwender",
    ].filter(Boolean);
  },
  bestwerte: (stand) => ({ siege: WF_STATISTIK.normalisiere(stand).siege }),
};
