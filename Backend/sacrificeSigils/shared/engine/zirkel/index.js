// engine/zirkel/index.js — Register der Zirkel (Deck-Welten). Ein Zirkel ist ein reines Datenpaket; die Engine holt
// Ressourcen, Sigils, Nebendecks und Pfadknoten von hier statt sie fest einzubauen. Siehe docs/sacrifice-and-sigils/ZIRKEL.md.
import { MOOR } from "./moor.js";

/**
 * @typedef {{ id: string, name: string, resources: Array<{ id: string, kind: string, gain?: number, max?: number }>,
 *   tribes: any[], cards: Record<string, any>, collectible: any[], sigils: Record<string, any>,
 *   sideDeckTypes: Record<string, string>, pathNodeTypes: Array<[string, number]>, events: string[], theme: any }} Zirkel
 */

/** @type {Record<string, Zirkel>} */
export const ZIRKEL = { moor: MOOR };
export const DEFAULT_ZIRKEL = "moor";
/** Lobby: „gemischt“ (jeder seinen eigenen Zirkel) kommt, sobald es mehr als einen gibt. */
export const MIXED_ZIRKEL_AVAILABLE = false;

/** @param {string|undefined|null} id @returns {Zirkel} */
export function getZirkel(id) {
  return (id && ZIRKEL[id]) || ZIRKEL[DEFAULT_ZIRKEL];
}

/** @param {any} match */
export function zirkelOf(match) {
  return getZirkel(match?.settings?.zirkel);
}

/** Ressource eines Zirkels. @param {Zirkel} z @param {string} id */
export function resourceOf(z, id) {
  return z.resources.find((r) => r.id === id) || null;
}
