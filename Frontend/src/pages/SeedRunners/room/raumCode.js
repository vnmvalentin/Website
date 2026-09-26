// raumCode.js — Streamer-Schutz für Lobby-Codes. Wer seinen Bildschirm überträgt, soll den Code nicht aus Versehen zeigen:
//   · In der Adressleiste steht nach dem Beitreten /seed-runners/raum statt /seed-runners/<CODE>. Der Code liegt im
//     Sitzungsspeicher dieses Tabs — Neuladen bleibt im Raum, ein anderer Tab bekommt ihn nicht.
//   · Auf der Seite ist der Code verdeckt, bis man ihn aufdeckt; ob er offen steht, merkt sich der Browser (für alle, die
//     nicht streamen und ihn ständig sehen wollen).
// Der Einladungslink zum Kopieren enthält natürlich den echten Code.
const RAUM_KEY = 'seedrunners_raum';
const ZEIGEN_KEY = 'seedrunners_code_zeigen';
export const RAUM_PFAD = '/seed-runners/raum';

export function merkeRaum(code) {
  try { sessionStorage.setItem(RAUM_KEY, code); } catch { /* gesperrt: dann eben nur bis zum Neuladen */ }
}

export function gemerkterRaum() {
  try { return sessionStorage.getItem(RAUM_KEY) || ''; } catch { return ''; }
}

export function vergissRaum() {
  try { sessionStorage.removeItem(RAUM_KEY); } catch { /* egal */ }
}

/**
 * Den Code aus der Adressleiste nehmen, ohne die Seite neu aufzubauen. Der Verlaufs-Zustand des Routers bleibt erhalten
 * (history.state wird mitgegeben), damit Zurück/Vor weiter funktionieren; ein Neuladen landet auf der Route „raum“.
 */
export function versteckeAdresse() {
  if (typeof window === 'undefined' || window.location.pathname === RAUM_PFAD) return;
  window.history.replaceState(window.history.state, '', RAUM_PFAD + window.location.search);
}

export function codeSichtbar() {
  try { return localStorage.getItem(ZEIGEN_KEY) === '1'; } catch { return false; }
}

export function setzeCodeSichtbar(on) {
  try { localStorage.setItem(ZEIGEN_KEY, on ? '1' : '0'); } catch { /* egal */ }
}

/** Anzeige eines Codes oder Links: offen oder als Punkte */
export const verdeckt = (text, offen) => (offen ? text : '•'.repeat(Math.max(5, Math.min(text.length, 8))));
