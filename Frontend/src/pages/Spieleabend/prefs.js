// prefs.js — gemerkte Einstellungen des Spieleabends (nur dieser Browser): Name, eigener Blob, Online-Token.
//
// Der Blob ist derselbe wie in Worldflip (Skin aus Worldflip/skins.js). Wer dort schon einen gestaltet hat, sitzt
// beim ersten Besuch mit genau diesem Blob am Tisch; danach merkt sich der Spieleabend seinen eigenen Stand.
import { eigenerSkin, randomSkin } from "../Worldflip/skins.js";
import { ladenBesitzSofort } from "../../utils/spielstand.js";

const KEY = "spieleabend.prefs";
const TOKEN_KEY = "spieleabend.token";
const WORLDFLIP_KEY = "worldflip.prefs";

const lies = (key) => {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
};

export function cleanName(n) {
  return String(n || "").replace(/\s+/g, " ").trim().slice(0, 20);
}

/** { name, skin } — beim ersten Mal aus Worldflip übernommen, sonst ein zufälliger Blob mit Namen „Gast 12“. */
export function loadPrefs() {
  const eigen = lies(KEY);
  if (eigen && typeof eigen === "object") {
    return { name: cleanName(eigen.name) || zufallsName(), skin: eigenerSkin(eigen.skin, ladenBesitzSofort("worldflip")) };
  }
  const wf = lies(WORLDFLIP_KEY);
  const prefs = {
    name: cleanName(wf?.name) || zufallsName(),
    skin: wf?.skin ? eigenerSkin(wf.skin, ladenBesitzSofort("worldflip")) : randomSkin(),
  };
  savePrefs(prefs);
  return prefs;
}

function zufallsName() {
  return `Gast ${10 + Math.floor(Math.random() * 90)}`;
}

export function savePrefs(prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ name: cleanName(prefs.name), skin: prefs.skin }));
  } catch {
    /* ohne Speicher eben nicht gemerkt */
  }
}

const MAUS_KEY = "spieleabend.maus";
/** Mausgeschwindigkeit beim Umschauen (1 = normal, 0.25 – 3). */
export function ladeMausTempo() {
  try {
    const v = Number(localStorage.getItem(MAUS_KEY));
    return Number.isFinite(v) && v >= 0.25 && v <= 3 ? v : 1;
  } catch {
    return 1;
  }
}
export function speichereMausTempo(v) {
  try {
    localStorage.setItem(MAUS_KEY, String(v));
  } catch {
    /* nicht gemerkt */
  }
}

/** Zufälliger Schlüssel, der im Zimmer die eigene Figur wiedererkennt (Neuladen, Verbindungsabbruch). */
export function getToken() {
  try {
    let t = localStorage.getItem(TOKEN_KEY);
    if (!t || !/^[A-Za-z0-9_-]{8,64}$/.test(t)) {
      t = Array.from(crypto.getRandomValues(new Uint8Array(18)), (b) => "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_"[b % 64]).join("");
      localStorage.setItem(TOKEN_KEY, t);
    }
    return t;
  } catch {
    return `t${Math.random().toString(36).slice(2, 14)}${Date.now().toString(36)}`;
  }
}
