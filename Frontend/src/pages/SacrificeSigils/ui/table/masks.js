// ui/table/masks.js — die Masken der Zeichner und ihre sechs Gesten (Rebuild „Am Tisch“, Phase 3).
//
// Bewusst ohne three.js: diese Liste brauchen auch die Einstellungen, die Lobby und der Abgleich mit dem Server
// (Backend/sacrificeSigils/roomManager.js kennt dieselben Kennungen — dort MASK_IDS und GESTURES).
// Die Masken sind reine Optik; gebaut werden sie in scene/figure.js.

/** @type {Array<{ id: string, name: string, desc: string }>} */
export const MASKS = [
  { id: "wachs", name: "Wachsstrich", desc: "Helles Oval, ein roter Strich von der Stirn bis zum Kinn." },
  { id: "rabe", name: "Rabe", desc: "Runde Augen und ein langer Schnabel." },
  { id: "geweih", name: "Geweih", desc: "Schmale Augen unter zwei kurzen Stangen." },
  { id: "mond", name: "Halbmond", desc: "Eine Sichel mit einem einzigen Auge." },
  { id: "rinde", name: "Rinde", desc: "Dunkles Holz, in den Schlitzen glimmt es." },
  { id: "drei", name: "Dreiauge", desc: "Blanker Knochen mit einem dritten Auge auf der Stirn." },
];
export const MASK_IDS = MASKS.map((m) => m.id);
export const DEFAULT_MASK = "wachs";

/** @param {any} id */
export const cleanMask = (id) => (MASK_IDS.includes(id) ? id : DEFAULT_MASK);

/**
 * Masken, die nur Gestalten der Moorwanderung tragen (nicht wählbar, der Server kennt sie nicht): für Silhouetten,
 * zu denen keine der sechs passt — Fische und Robben, Schalentiere, Gebautes, Schlangen (ui/run/npcMask.js).
 */
export const NPC_MASK_IDS = ["kiemen", "muschel", "eisen", "schuppe"];
/** Maske für die Gestalt am Tisch: die der Zeichner oder eine der Moorwanderung. @param {any} id */
export const cleanFigureMask = (id) => (NPC_MASK_IDS.includes(id) ? id : cleanMask(id));

/** Maske aus einem beliebigen Text ableiten (KI-Gegner, Hotseat) — auf Wunsch eine andere als `not`. */
export function maskFromText(text, not = null) {
  let h = 2166136261;
  for (const ch of String(text)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const pool = MASK_IDS.filter((id) => id !== not);
  return pool[h % pool.length];
}

/**
 * Die sechs Gesten — statt eines Chats (nichts, was moderiert werden müsste). `key` = Taste im Gestenrad,
 * `does` = Satzteil für die Zeile bei „Animationen reduzieren“ („Anna nickt.“).
 * @type {Array<{ id: string, name: string, key: string, does: string }>}
 */
export const GESTURES = [
  { id: "klopfen", name: "Klopfen", key: "1", does: "klopft auf den Tisch" },
  { id: "nicken", name: "Nicken", key: "2", does: "nickt" },
  { id: "kopfschuetteln", name: "Kopf schütteln", key: "3", does: "schüttelt den Kopf" },
  { id: "zeigen", name: "Auf eine Karte zeigen", key: "4", does: "zeigt auf eine Karte" },
  { id: "haende", name: "Hände heben", key: "5", does: "hebt die Hände" },
  { id: "verbeugen", name: "Verbeugen", key: "6", does: "verbeugt sich" },
];
export const GESTURE_IDS = GESTURES.map((g) => g.id);
