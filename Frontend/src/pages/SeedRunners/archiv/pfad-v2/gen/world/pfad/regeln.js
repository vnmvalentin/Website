// Zwei Regeln, die ein Weg erfüllen muss, damit er sich wie EIN Weg anfühlt (Rückmeldung 25.09.2026):
//
//   keine Abkürzung   Eine neue Plattform darf von keiner FRÜHEREN Plattform (außer der, von der man gerade kommt)
//                     erreichbar sein — sonst springt man quer über die Karte („ich konnte am Anfang über die Map
//                     klettern und fast direkt zum Ziel").
//   Notwendigkeit     Eine Mechanik (Feder, Ring, Anker, Portal) muss gebraucht werden: Schafft ein schlichter Sprung,
//                     Doppelsprung oder Fall dasselbe Ziel, ist sie nutzlos („die Grappler sind alle komplett nutzlos,
//                     da man die Sprünge auch ohne schafft").

import { TILE } from '../../../sim/config.js';
import { ausschnittWelt, spieleZug, standKachel } from './probe.js';
import { zugEingabe, zugFertig } from './zuege.js';

/** Schwerkraft beim Fallen (config.js: gravity 900 × fallGravityMult 1,45) */
const FALL_G = 1305;

/**
 * Könnte man — GROSSZÜGIG geschätzt — von Plattform `q` aus Plattform `z` erreichen? Absichtlich eher zu großzügig:
 * Lieber eine Plattform zu viel verworfen als eine Abkürzung übersehen.
 * @param {{x0,x1,row, feder?: boolean}} q
 * @param {{x0,x1,row}} z
 */
export function erreichbar(q, z, reach) {
  const hoch = q.row - z.row;                                // > 0: z liegt höher
  const maxHoch = reach.height.double + 1 + (q.feder ? 8 : 0);
  if (hoch > maxHoch) return false;
  const luecke = Math.max(0, Math.max(q.x0, z.x0) - Math.min(q.x1, z.x1) - 1);
  const fall = Math.max(0, -hoch);
  // Wer tiefer landet, ist länger in der Luft und kommt weiter
  const extra = fall > 0 ? (reach.runSpeed * Math.sqrt((2 * fall * TILE) / FALL_G)) / TILE : 0;
  return luecke <= reach.gap.double + 1 + extra + (q.feder ? 4 : 0);
}

/**
 * Schlichte Züge, mit denen die Notwendigkeitsprüfung es ohne Mechanik versucht. `gruendlich`: deutlich mehr Haltezeiten,
 * Absprungpunkte und Doppelsprung-Zeitpunkte — für Ringe, die sonst oft „nötig“ schienen, aber mit einem gut getimten
 * Doppelsprung genauso gingen (Rückmeldung 26.09.2026).
 */
function schlichteZuege(dir, gruendlich = false) {
  const out = [];
  if (gruendlich) {
    for (const halte of [16, 24, 30, 36]) for (const kanteVersatz of [-24, -14, -4]) out.push({ art: 'sprung', dir, halte, kanteVersatz });
    for (const halte of [20, 30, 36]) for (const doppelNach of [12, 18, 24, 30, 38]) for (const kanteVersatz of [-18, -4]) out.push({ art: 'doppel', dir, halte, kanteVersatz, doppelNach });
    for (const doppelNach of [null, 6, 12, 18, 24, 30]) out.push({ art: 'fall', dir, ...(doppelNach != null ? { doppelNach } : {}) });
    return out;
  }
  for (const halte of [10, 20, 30]) for (const kanteVersatz of [-22, -8]) out.push({ art: 'sprung', dir, halte, kanteVersatz });
  for (const halte of [20, 30]) for (const doppelNach of [14, 24, 34]) out.push({ art: 'doppel', dir, halte, kanteVersatz: -15, doppelNach });
  for (const doppelNach of [null, 12, 24]) out.push({ art: 'fall', dir, ...(doppelNach != null ? { doppelNach } : {}) });
  return out;
}

/**
 * Schafft ein schlichter Zug (ohne die Elemente in `ohne`) dasselbe Ziel? Dann ist die Mechanik unnötig.
 * @param {object[]} entities  alle Elemente; die in `ohne` werden für die Prüfung weggelassen
 * @param {{x,y}|{x,y}[]|null} anker   Ankerkachel(n), die für die Prüfung entfernt werden
 */
export function ohneMechanikErreichbar({ grid, entities, ohne, anker, cls, von, plat, ziel, gruendlich = false, reach = null }) {
  // Vorprüfung: Sagt schon die großzügige Schätzung „unerreichbar“, kommt auch kein schlichter Sprung hin — die bis zu ~96
  // Sim-Proben sparen (gemessen: 28 % der Bauzeit steckten hier)
  if (reach && !erreichbar(plat, ziel, reach)) return false;
  const ents = entities.filter((e) => !ohne.includes(e));
  // (Flappy-Seil: mehrere Anker)
  const anker2 = Array.isArray(anker) ? anker : anker ? [anker] : [];
  const altAnker = anker2.map((a) => grid[a.y][a.x]);
  for (const a of anker2) grid[a.y][a.x] = '.';
  try {
    // Liegt das Ziel außerhalb des Ausschnitts, kommt ein Sprung ohnehin nicht hin
    if (Math.abs(ziel.x0 - von.x) > 38 && Math.abs(ziel.x1 - von.x) > 38) return false;
    if (Math.abs(ziel.row - von.y) > 28) return false;
    for (const dir of [-1, 1]) {
      const kanteX = dir > 0 ? (plat.x1 + 1) * TILE : plat.x0 * TILE;
      for (const zug of schlichteZuege(dir, gruendlich)) {
        const aus = ausschnittWelt(grid, ents, von, cls, { x: Math.round((von.x + ziel.x0) / 2), y: Math.round((von.y + ziel.row) / 2) });
        const r = spieleZug(aus, zugEingabe(zug, kanteX - aus.x0 * TILE), zugFertig, 600);
        if (r.tot) continue;
        const ende = r.spur[r.spur.length - 1];
        const st = standKachel(ende);
        if (ende.boden && st.y === ziel.row - 1 && st.x >= ziel.x0 && st.x <= ziel.x1) return true;
      }
    }
    return false;
  } finally {
    anker2.forEach((a, k) => { grid[a.y][a.x] = altAnker[k]; });
  }
}
