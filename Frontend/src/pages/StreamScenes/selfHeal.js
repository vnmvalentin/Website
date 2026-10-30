// selfHeal.js — die 3D-Szenen laden sich selbst neu, statt schwarz stehen zu bleiben.
//
// In OBS läuft eine Browserquelle oft tagelang. Fällt dort etwas aus (Grafikkontext verloren,
// Nachladen eines Code-Teils schlägt fehl, Szene wird nie fertig), sah man bisher nur Schwarz,
// bis man die Quelle von Hand neu lud. Jetzt lädt die Seite sich selbst neu — höchstens dreimal
// in zehn Minuten, damit ein dauerhafter Fehler keine Endlosschleife auslöst.
const KEY = 'streamSceneReloads';
const WINDOW_MS = 10 * 60 * 1000;
const MAX_RELOADS = 3;

/** Neu laden (mit frischer Adresse). false = Grenze erreicht, die Seite bleibt, wie sie ist. */
export function reloadOverlay(reason) {
  let list = [];
  try { list = JSON.parse(sessionStorage.getItem(KEY) || '[]').filter((t) => Date.now() - t < WINDOW_MS); } catch { list = []; }
  if (list.length >= MAX_RELOADS) {
    console.error(`[stream3d] ${reason} — schon ${list.length}× neu geladen, gebe auf`);
    return false;
  }
  list.push(Date.now());
  try { sessionStorage.setItem(KEY, JSON.stringify(list)); } catch { /* ohne Speicher: trotzdem neu laden */ }
  console.warn(`[stream3d] ${reason} — lade neu`);
  const url = new URL(window.location.href);
  url.searchParams.set('r', Date.now().toString(36));
  window.location.replace(url.toString());
  return true;
}
