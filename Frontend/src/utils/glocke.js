// utils/glocke.js — kleine Helfer der Glocke (components/Glocke.jsx), ohne React (Tests: node --test).

const LIVE_KEY = "vnm_glocke_live_v1";

/** Ist dieser Stream (startedAt) in der Glocke schon gesehen? */
export function liveGesehen(startedAt, storage = globalThis.localStorage) {
  if (!startedAt) return true;
  try { return storage.getItem(LIVE_KEY) === startedAt; } catch { return false; }
}

export function merkeLive(startedAt, storage = globalThis.localStorage) {
  if (!startedAt) return;
  try { storage.setItem(LIVE_KEY, startedAt); } catch { /* privates Fenster */ }
}

/** Zähler an der Glocke: ungelesene Nachrichten + neue Updates + ein ungesehener Stream */
export function zaehleNeues({ ungelesen = 0, neueUpdates = 0, liveNeu = false } = {}) {
  return Math.max(0, Number(ungelesen) || 0) + Math.max(0, Number(neueUpdates) || 0) + (liveNeu ? 1 : 0);
}

/** „vor 5 Min.“ / „5 min ago“ — bis eine Minute „gerade eben“, ab 7 Tagen das Datum */
export function vorZeit(ms, { jetzt = Date.now(), lang = "de", gerade = "gerade eben" } = {}) {
  const diff = Math.max(0, jetzt - ms);
  const locale = lang === "en" ? "en-US" : "de-DE";
  if (diff < 60_000) return gerade;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "short" });
  if (diff < 3600_000) return rtf.format(-Math.floor(diff / 60_000), "minute");
  if (diff < 86400_000) return rtf.format(-Math.floor(diff / 3600_000), "hour");
  if (diff < 7 * 86400_000) return rtf.format(-Math.floor(diff / 86400_000), "day");
  return new Date(ms).toLocaleDateString(locale, { day: "numeric", month: "short" });
}

/** Ziel eines Eintrags: eigene Pfade und https; „/?glocke=1“ heißt nur „Glocke öffnen“ und braucht keinen Link */
export function eintragZiel(url) {
  if (typeof url !== "string" || !url) return null;
  if (/^\/\?glocke=/.test(url)) return null;
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  return /^https:\/\/\S+$/.test(url) ? url : null;
}
