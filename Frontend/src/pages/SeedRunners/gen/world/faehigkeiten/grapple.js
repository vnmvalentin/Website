// Fähigkeit „grapple": Anker als Brücken zwischen Standflächen, die sonst zu weit auseinander liegen.
//
// Kein Schwung wird hier wirklich simuliert — das ist Absicht. Der Graph sagt nur "von einer
// Standfläche in Ankernähe kommt man zu jeder anderen Standfläche in Ankernähe desselben Ankers",
// mit Kosten nach Entfernung. Das ist eine GROBE Näherung (echte Schwünge tragen weiter, wenn man
// im Bogen Schwung aufbaut, und weniger weit gegen den Ausgangsschwung) — sie unterschätzt eher, als
// dass sie überschätzt: Ein zu strenger Graph verwirft eine Welt höchstens zu oft, ein zu lockerer
// liefert unspielbare. Die endgültige Aussage "ein Mensch schafft das" holt ohnehin erst der echte
// Solver an einzelnen Stellen (siehe PLANUNG_WELTTYPEN.md, Signature-Momente).
//
// Reichweite kommt aus sim/config.js TUNING (grappleRange) — derselbe Wert, den die Sim benutzt,
// nicht neu geschätzt. grappleRange ändert sich nicht zwischen den Tempo-Klassen (nur Schwung-
// Beschleunigung und Höchsttempo tun das), ist also für jeden Lauf derselben Welt gültig.

import { TILE, TUNING } from '../../../sim/config.js';
import { columnStands } from '../../v2/reachability.js';

/** Reichweite in Kacheln (TUNING.grappleRange ist in Pixeln) */
export const ANKER_REICHWEITE = TUNING.grappleRange / TILE;

// Kein Math.hypot: sim/ und gen/ dürfen nur + − × ÷ und abs/min/max/sign/floor/ceil/round/sqrt
// benutzen (Quelltext-Wache, sim/__tests__/rng-trig.test.js) — verschiedene Engines dürfen bei
// Math.hypot in den letzten Bits auseinanderlaufen, bei sqrt(x*x+y*y) nicht.
const abstand = (dx, dy) => Math.sqrt(dx * dx + dy * dy);

/**
 * Baut die `brueckenVon`-Funktion für `floodReachable`.
 *
 * Vorab wird für jeden Anker die Liste seiner erreichbaren Standflächen einmal berechnet (Fels-
 * raster + virtuelle Stände durchsuchen, nur in einer Box um den Anker — der Rest der Karte
 * interessiert diesen Anker nicht). Das macht `brueckenVon` selbst eine reine Tabellensuche.
 *
 * @param {{x: number, y: number}[]} anker  Ankerpositionen in Tile-Koordinaten
 * @param {string[]} rows
 * @param {Set<string>} [virtualStands]  weitere Standflächen (Mover, Federn), siehe reachability.js
 * @returns {(x: number, y: number) => {x: number, y: number, cost: number}[]}
 */
export function baueGrappleBruecken(anker, rows, virtualStands) {
  if (!anker.length) return () => [];

  const box = Math.ceil(ANKER_REICHWEITE) + 1;
  const listeJeAnker = anker.map((a) => {
    const kandidaten = [];
    for (let x = Math.max(0, a.x - box); x <= Math.min(rows[0].length - 1, a.x + box); x++) {
      for (const y of columnStands(rows, x, virtualStands)) {
        const d = abstand(x - a.x, y - a.y);
        if (d <= ANKER_REICHWEITE) kandidaten.push({ x, y, d });
      }
    }
    return { ...a, kandidaten };
  });

  // Für jede Standfläche: welche Anker sind in Reichweite? Vorberechnet, damit `brueckenVon`
  // beim eigentlichen Fluten nicht bei jedem Knoten alle Anker absuchen muss.
  const key = (x, y) => `${x},${y}`;
  const ankerJeStand = new Map();
  for (const a of listeJeAnker) {
    for (const k of a.kandidaten) {
      if (k.d > ANKER_REICHWEITE) continue;
      const kk = key(k.x, k.y);
      let liste = ankerJeStand.get(kk);
      if (!liste) { liste = []; ankerJeStand.set(kk, liste); }
      liste.push(a);
    }
  }

  return (x, y) => {
    const von = ankerJeStand.get(key(x, y));
    if (!von) return [];
    const out = [];
    for (const a of von) {
      for (const k of a.kandidaten) {
        if (k.x === x && k.y === y) continue;
        // Kosten grob nach Gesamtstrecke über den Anker — ein Schwung über zwei kurze Beine ist
        // billiger als einer über zwei lange, auch wenn beide GEOMETRISCH erreichbar sind.
        const d = abstand(x - a.x, y - a.y) + k.d;
        out.push({ x: k.x, y: k.y, cost: Math.max(1, Math.round(d)) });
      }
    }
    return out;
  };
}
