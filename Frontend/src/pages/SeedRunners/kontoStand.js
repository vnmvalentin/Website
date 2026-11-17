// kontoStand.js — Seed Runners am Konto (utils/spielKonto.js): Rennen, Siege und gelaufene Tagesrennen je Spieler.
// Gezählt in room/Results.jsx (Mehrspieler-Runde, je Runde einmal) und SeedRunnersDaily.jsx (Tagesrennen, je Tag einmal,
// sobald der Server eine Zeit angenommen hat). Rein, ohne React und Netz (node --test).
import { zaehlerStatistik } from '../../utils/spielstand.js';

export const SR_STATISTIK = zaehlerStatistik({
  spiel: 'seed-runners',
  schluessel: 'seedrunners_stats',
  felder: ['rennen', 'siege', 'tagesrennen'],
});

/** Eine Mehrspieler-Runde zählen. id = Verlaufs-ID der Runde (rundenVerlauf.js), platz null = nicht im Ziel */
export function zaehleRennen({ id, platz, teilnehmer }, speicher) {
  if (!id) return false;
  return SR_STATISTIK.zaehle(`runde:${id}`, { rennen: 1, siege: platz === 1 && teilnehmer >= 2 ? 1 : 0 }, {}, speicher);
}

/** Ein Tagesrennen zählen (je Tag einmal, egal wie oft man es läuft) */
export function zaehleTagesrennen(dateKey, speicher) {
  if (!dateKey) return false;
  return SR_STATISTIK.zaehle(`tag:${dateKey}`, { tagesrennen: 1 }, {}, speicher);
}

export const SEED_RUNNERS_KONTO = {
  lies: () => SR_STATISTIK.lies(),
  schreib: (stand) => SR_STATISTIK.schreib(stand),
  xp: (stand) => {
    const s = SR_STATISTIK.normalisiere(stand);
    return s.rennen * 10 + s.siege * 5 + s.tagesrennen * 10;
  },
  zusammenfuehren: SR_STATISTIK.zusammenfuehren,
  erfolge: (stand) => {
    const s = SR_STATISTIK.normalisiere(stand);
    return [
      s.rennen >= 1 && 'erstes-rennen',
      s.siege >= 1 && 'rennsieg',
      s.siege >= 10 && 'zehn-siege',
      s.tagesrennen >= 1 && 'tagesrennen',
      s.tagesrennen >= 7 && 'tagesform',
    ].filter(Boolean);
  },
  bestwerte: (stand) => {
    const s = SR_STATISTIK.normalisiere(stand);
    return { rennsiege: s.siege, tagesrennen: s.tagesrennen };
  },
};
