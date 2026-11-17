// zier.js — Accessoires für den eigenen Blob (Laden, Spur D, Anschluss kosmetik-artikel). Rein, ohne React und Netz.
//
// Ein Accessoire ist eine kleine Zahl (Index in ZIER). Der Server reicht sie nur weiter (Backend/blobby/socket.js:
// cleanZier); gezeichnet wird in render.js (2D), render3d.js (3D-Ansicht) und beach/renderBeach.js (Ego 3D), die 3D-Teile
// baut zier3d.js. Neue Einträge immer hinten anhängen — gespeicherte Wahl und Server zählen nach Index.
import { ladenBesitzSofort } from "../../utils/spielstand.js";

export const ZIER = Object.freeze([
  { name: "Ohne" },
  { name: "Sonnenbrille", laden: "bv-zier-sonnenbrille" },
  { name: "Strohhut", laden: "bv-zier-strohhut" },
]);
export const ZIER_SCHLUESSEL = "blobby_zier";
/** Gleiche Grenze wie der Server (cleanZier) */
export const ZIER_MAX = 15;

/** Zahl prüfen (fremde Spieler: was der Server schickt) — unbekannt = ohne */
export const sauberZier = (z) => (Number.isInteger(z) && z >= 0 && z < ZIER.length ? z : 0);

/** Darf man dieses Accessoire selbst tragen? besitz: Set gekaufter Laden-Artikel */
export const zierErlaubt = (z, besitz) => {
  const e = ZIER[z];
  if (!e) return false;
  return !e.laden || !!besitz?.has?.(e.laden);
};

/** Das eigene Accessoire: gemerkt im Browser, nur solange gekauft (sonst ohne) */
export function eigeneZier(speicher = globalThis.localStorage, besitz = ladenBesitzSofort("blobby", speicher)) {
  let z = 0;
  try {
    z = Number(speicher.getItem(ZIER_SCHLUESSEL));
  } catch {
    z = 0;
  }
  const s = sauberZier(z);
  return zierErlaubt(s, besitz) ? s : 0;
}

export function merkeZier(z, speicher = globalThis.localStorage) {
  try {
    speicher.setItem(ZIER_SCHLUESSEL, String(sauberZier(z)));
  } catch { /* privates Fenster */ }
}

/** Hut auf dem Kopf? (Name darüber muss dann etwas höher stehen) */
export const zierIstHut = (z) => z === 2;
