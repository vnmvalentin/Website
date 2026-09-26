// Feste Bausteine, die jeder Level braucht: Start, Checkpoint (zugleich Verschnaufpause) und Ziel.
// Sie werden nicht gewürfelt, sondern vom Generator an festen Stellen eingesetzt.
import { chunk } from '../builder.js';

export const SPECIAL = [
  chunk('start', { w: 16, h: 18, entry: 13, exit: 13, difficulty: 1, special: 'start' }, (b) => {
    b.ground(0, 16);
    b.put(3, 12, 'S');
  }),

  chunk('checkpoint', { w: 12, h: 18, entry: 13, exit: 13, difficulty: 1, special: 'checkpoint' }, (b) => {
    b.ground(0, 12);
    b.put(6, 12, 'C');
  }),

  chunk('finish', { w: 18, h: 18, entry: 13, exit: 13, difficulty: 1, special: 'finish' }, (b) => {
    b.ground(0, 18);
    // Ziel-Tor: zwei Spalten, drei Zeilen hoch
    b.rect(13, 10, 2, 3, 'E');
  }),
];
