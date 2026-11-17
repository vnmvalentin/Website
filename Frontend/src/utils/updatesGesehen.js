// utils/updatesGesehen.js — welche Version der Updates (/updates, utils/newData.js) jemand zuletzt gesehen hat. Nur im
// Browser. Die persönliche Startseite zeigt damit „Neu seit deinem letzten Besuch“; die Updates-Seite und „Ausblenden“
// setzen den Merker auf die neueste Version.

const KEY = "vnm_updates_gesehen_v1";

export function liesGesehen(storage = globalThis.localStorage) {
  try {
    const v = storage.getItem(KEY);
    return typeof v === "string" && v ? v : null;
  } catch {
    return null;
  }
}

export function merkeGesehen(version, storage = globalThis.localStorage) {
  if (typeof version !== "string" || !version) return;
  try { storage.setItem(KEY, version); } catch { /* privates Fenster: dann eben jedes Mal */ }
}

/**
 * Updates seit dem letzten gesehenen. `liste` ist neueste zuerst (wie NEWS_UPDATES), Kennung ist `version`.
 * Ohne Merker (erster Besuch mit dieser Funktion) oder mit unbekanntem Merker wird er auf die neueste Version gesetzt
 * und nichts gezeigt — sonst stünde beim ersten Mal die ganze Geschichte als „neu“ da.
 * @returns {Array} die neueren Einträge, neueste zuerst
 */
export function neueUpdates(liste, storage = globalThis.localStorage) {
  if (!Array.isArray(liste) || !liste.length) return [];
  const neueste = liste[0]?.version;
  const gesehen = liesGesehen(storage);
  const i = gesehen ? liste.findIndex((u) => u?.version === gesehen) : -1;
  if (i < 0) {
    merkeGesehen(neueste, storage);
    return [];
  }
  return liste.slice(0, i);
}

/** „v6.25: Clash Royale Stats, Win Tracker“ → { nummer: "v6.25", titel: "Clash Royale Stats, Win Tracker" } */
export function teileVersion(version) {
  const m = /^\s*(v[\d.]+)\s*:?\s*(.*)$/i.exec(String(version || ""));
  return m ? { nummer: m[1], titel: m[2] || m[1] } : { nummer: "", titel: String(version || "") };
}
