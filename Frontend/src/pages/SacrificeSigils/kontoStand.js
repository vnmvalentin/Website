// kontoStand.js — Sacrifice & Sigils am Konto (utils/spielKonto.js): Duelle und Moorwanderungen je Spieler, gezählt am
// Ende eines Matches (ui/GameScreen.jsx) bzw. eines Runs (ui/run/RunGame.jsx). Rein, ohne React und Netz (node --test).
// Tutorial (Seed TUTORIAL…) und Hotseat (zwei an einem Gerät) zählen nicht.
import { zaehlerStatistik } from "../../utils/spielstand.js";

export const SS_STATISTIK = zaehlerStatistik({
  spiel: "sacrifice-and-sigils",
  schluessel: "ss_stats_v1",
  felder: ["duelle", "duellSiege", "moorwanderungen", "moorSiege", "moorPodest"],
});

const zaehltNicht = (seed, modus) => modus === "hotseat" || /^TUTORIAL/i.test(String(seed || ""));

/** Ein beendetes Duell (1 gegen 1) zählen. @param {{ seed: string, modus: string, gewonnen: boolean }} p */
export function zaehleDuell({ seed, modus, gewonnen }, speicher) {
  if (!seed || zaehltNicht(seed, modus)) return false;
  return SS_STATISTIK.zaehle(`duell:${seed}`, { duelle: 1, duellSiege: gewonnen ? 1 : 0 }, {}, speicher);
}

/** Eine beendete Moorwanderung zählen. @param {{ seed: string, platz: number|null }} p */
export function zaehleMoorwanderung({ seed, platz }, speicher) {
  if (!seed || zaehltNicht(seed)) return false;
  const p = Number(platz) || 0;
  return SS_STATISTIK.zaehle(`moor:${seed}`, { moorwanderungen: 1, moorSiege: p === 1 ? 1 : 0, moorPodest: p >= 1 && p <= 3 ? 1 : 0 }, {}, speicher);
}

export const SS_KONTO = {
  lies: () => SS_STATISTIK.lies(),
  schreib: (stand) => SS_STATISTIK.schreib(stand),
  xp: (stand) => {
    const s = SS_STATISTIK.normalisiere(stand);
    return s.duelle * 10 + s.duellSiege * 5 + s.moorwanderungen * 20 + s.moorSiege * 10;
  },
  zusammenfuehren: SS_STATISTIK.zusammenfuehren,
  erfolge: (stand) => {
    const s = SS_STATISTIK.normalisiere(stand);
    return [
      s.duellSiege >= 1 && "erster-duellsieg",
      s.duellSiege >= 10 && "siegelmeister",
      s.moorPodest >= 1 && "podest",
      s.moorSiege >= 1 && "durchs-moor",
    ].filter(Boolean);
  },
  bestwerte: (stand) => {
    const s = SS_STATISTIK.normalisiere(stand);
    return { "duell-siege": s.duellSiege, "moor-siege": s.moorSiege };
  },
};
