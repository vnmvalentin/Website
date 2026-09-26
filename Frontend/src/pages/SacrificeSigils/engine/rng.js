// engine/rng.js — deterministischer Zufall für Sacrifice & Sigils.
//
// mulberry32 mit einem 32-Bit-Zustand. Der Zustand lebt IM Spielzustand (`holder.rng`), damit
// „gleicher State + gleiche Aktion ⇒ gleiches Ergebnis“ ohne Nebenkanal gilt. Kein Math.random, kein Date.

/**
 * FNV-1a über beliebige Teile (Zahlen/Strings) → uint32. Dient zum Ableiten von Teil-Seeds
 * (z. B. Seed + Pfadnummer + Ebene), damit unabhängige Zufallsquellen sich nicht gegenseitig verschieben.
 * @param {...(string|number)} parts
 * @returns {number}
 */
export function hashParts(...parts) {
  let h = 0x811c9dc5;
  const text = parts.map(String).join("|");
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  // Nachmischen (murmur3-Finalizer), damit ähnliche Eingaben weit auseinanderliegen
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Nächste Zufallszahl in [0, 1). Verändert `holder.rng`.
 * @param {{ rng: number }} holder
 * @returns {number}
 */
export function rand(holder) {
  let t = (holder.rng = (holder.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * Ganzzahl in [0, n).
 * @param {{ rng: number }} holder
 * @param {number} n
 */
export function randInt(holder, n) {
  if (n <= 0) return 0;
  return Math.floor(rand(holder) * n);
}

/**
 * Fisher-Yates, mischt `arr` an Ort und Stelle und gibt es zurück.
 * @template T
 * @param {{ rng: number }} holder
 * @param {T[]} arr
 * @returns {T[]}
 */
export function shuffle(holder, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(holder, i + 1);
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

/**
 * Ein Element nach Gewichten wählen.
 * @template T
 * @param {{ rng: number }} holder
 * @param {Array<[T, number]>} weighted
 * @returns {T}
 */
export function pickWeighted(holder, weighted) {
  const total = weighted.reduce((s, [, w]) => s + Math.max(0, w), 0);
  let r = rand(holder) * total;
  for (const [item, w] of weighted) {
    r -= Math.max(0, w);
    if (r < 0) return item;
  }
  return weighted[weighted.length - 1][0];
}

/**
 * Eigenständige Zufallsquelle aus Teilen (für seed-bestimmte, von der Spielreihenfolge unabhängige Würfe).
 * @param {...(string|number)} parts
 * @returns {{ rng: number }}
 */
export function streamFrom(...parts) {
  return { rng: hashParts(...parts) };
}

/**
 * Seed-Text normalisieren: Leerzeichen weg, Großbuchstaben, max. 24 Zeichen.
 * @param {string} seed
 */
export function normalizeSeed(seed) {
  return String(seed ?? "").trim().toUpperCase().replace(/\s+/g, "").slice(0, 24);
}
