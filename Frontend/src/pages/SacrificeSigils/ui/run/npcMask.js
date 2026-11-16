// ui/run/npcMask.js — welche Maske trägt ein NPC der Moorwanderung am Tisch? (Rebuild „Am Tisch“, Phase 6)
//
// Die Gestalt gegenüber gibt es mit den sechs Masken der Zeichner und vier eigenen der Moorwanderung
// (table/masks.js: NPC_MASK_IDS). NPCs bekommen die, die zu ihrer Silhouette passt: Vogel → Rabe, Gehörn/Vierbeiner →
// Geweih, Wurzel/Pilz/Koralle → Rinde, Falter/Insekt → Halbmond, Gebein → Dreiauge, Kerze → Wachsstrich,
// Fisch/Robbe → Kiemen, Muschel → Muschel, Gebautes → Eisen, Schlange → Schuppe; alle übrigen eine feste aus ihrem
// Namen. Bosse ohne Zuordnung tragen das Dreiauge; dazu tragen alle Bosse eine Dornenkrone (npcDecor), in Phase 2
// mit einem glimmenden Sprung in der Maske.
import { maskFromText } from "../table/masks.js";

const BY_SILHOUETTE = {
  bird: "rabe", horned: "geweih", quadruped: "geweih", root: "rinde", fungus: "rinde", coral: "rinde",
  moth: "mond", insect: "mond", skeleton: "drei", candle: "wachs",
  fish: "kiemen", seal: "kiemen", shell: "muschel", construct: "eisen", serpent: "schuppe",
};

/** @param {{ id: string, silhouette?: string } | null} npc @param {boolean} [boss] */
export function npcMask(npc, boss = false) {
  if (!npc) return undefined;
  return BY_SILHOUETTE[npc.silhouette || ""] || (boss ? "drei" : maskFromText(npc.id));
}

/**
 * Schmuck über der Maske: Bosse tragen eine Dornenkrone; ab Phase 2 zieht sich ein Sprung durch die Maske.
 * @param {boolean} boss @param {number} [phase]
 */
export function npcDecor(boss, phase = 1) {
  return { crown: !!boss, cracked: !!boss && phase > 1 };
}
