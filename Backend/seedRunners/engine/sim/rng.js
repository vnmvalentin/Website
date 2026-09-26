// Seeded Zufall für die Level-Erzeugung: sfc32, gespeist aus einem String-Hash.
//
// In der Level-Generierung und im Gameplay darf NIE Math.random stehen: Alle Spieler einer
// Runde erzeugen das Level lokal aus demselben Seed und müssen exakt dieselbe Welt bekommen.
// Alles hier ist Ganzzahl-Arithmetik (Math.imul, Verschiebungen) und damit auf jeder Engine
// bitgleich.

// xmur3: macht aus einem beliebigen Text vier gut durchmischte 32-Bit-Zahlen
function seedFromString(text) {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  const state = [];
  for (let k = 0; k < 4; k++) {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    state.push(h >>> 0);
  }
  return state;
}

// sfc32 (Small Fast Counting): 128 Bit Zustand, gute Statistik, nur Ganzzahlen
function sfc32(a, b, c, d) {
  return () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return t >>> 0;
  };
}

/**
 * @param {string|number} seed  beliebiger Seed; Zahlen und Texte werden gleich behandelt
 * @param {string} [label]      Teilstrom: "layout", "chunk:7" … Jeder Teilstrom ist von den
 *                              anderen unabhängig — ändert man später, wie viele Zufallszahlen
 *                              ein Chunk verbraucht, verschiebt das nicht alle folgenden Chunks.
 */
export function createRng(seed, label = '') {
  const [a, b, c, d] = seedFromString(`${seed}|${label}`);
  const next32 = sfc32(a, b, c, d);
  // Einlaufen: die ersten Werte von sfc32 sind bei ähnlichen Seeds noch stark korreliert
  for (let i = 0; i < 12; i++) next32();

  const rng = {
    /** Gleichverteilt in [0, 1) */
    next: () => next32() / 4294967296,
    /** Ganzzahl in [0, n) */
    int: (n) => Math.floor((next32() / 4294967296) * n),
    /** Ganzzahl in [min, max] (beide inklusive) */
    intRange: (min, max) => min + Math.floor((next32() / 4294967296) * (max - min + 1)),
    /** Kommazahl in [min, max) */
    range: (min, max) => min + (next32() / 4294967296) * (max - min),
    chance: (p) => next32() / 4294967296 < p,
    pick: (list) => list[Math.floor((next32() / 4294967296) * list.length)],
    /** Gewichtete Auswahl: weights[i] >= 0, nicht alle 0 */
    weighted(list, weights) {
      let total = 0;
      for (const w of weights) total += w;
      let r = (next32() / 4294967296) * total;
      for (let i = 0; i < list.length; i++) {
        r -= weights[i];
        if (r < 0) return list[i];
      }
      return list[list.length - 1];
    },
    fork: (sub) => createRng(seed, `${label}/${sub}`),
  };
  return rng;
}

/** 32-Bit-FNV-1a über einen Text — für Level-Hashes und aus Text abgeleitete Seeds. */
export function hashText(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
