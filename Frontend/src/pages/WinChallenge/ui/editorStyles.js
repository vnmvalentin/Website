// ui/editorStyles.js — Klassen und Farben, die Editor (WinChallenge.jsx), Moderator-Ansicht
// (WinChallengeControl.jsx) und ihre Bausteine (editorKit.jsx, TimerPanel.jsx) teilen.
// Eigene Datei ohne Komponenten, damit Fast Refresh in den Komponentendateien greift.
//
// Aussehen: getrennte Tonflächen auf dunklem Grund statt einer Fläche mit Trennlinien.
// Innerhalb einer Fläche trennt nur Abstand. Eingaben sind gefüllt statt umrandet.

// Die Hauptflächen tragen einen violetten Rand (flach, kein Leuchten): mit dem grauen
// Haarstrich davor wirkte die Seite einfarbig. Bewusst `border` und nicht `ring`: ein Ring
// ist ein Schatten AUSSERHALB des Kastens, und die Seitenleiste des Editors ist ein
// Scrollbereich — der schnitt ihn links, rechts und oben ab.
const PANEL_BASE = "bg-[#13131b] rounded-md border transition-colors";
export const PANEL = `${PANEL_BASE} border-violet-500/40`;
/**
 * Fläche des Editors: die, in der gerade gearbeitet wird, trägt den kräftigen Rand, die
 * übrigen einen gedämpften. Eigene Funktion statt angehängter Klasse, weil zwei
 * border-Farben in einem className sich nicht verlässlich überschreiben.
 * @param {boolean} active
 */
export const panelTone = (active) => `${PANEL_BASE} ${active ? "border-violet-400" : "border-violet-500/25"}`;
// Gold steht für alles, was mit Gewinnen zu tun hat (aktiver Bereich, Fortschritt).
// Violett bleibt die Farbe der Aktionen.
export const GOLD = "#f5c542";
export const LABEL = "text-[11px] font-semibold text-violet-300/75 uppercase tracking-wider";
export const INPUT =
  "w-full bg-white/[0.06] hover:bg-white/[0.09] focus:bg-white/[0.09] rounded-sm px-3 py-2 text-sm text-white placeholder-white/25 outline-none ring-1 ring-transparent focus:ring-violet-500 transition-colors";
export const BTN_PRIMARY = "bg-violet-600 hover:bg-violet-500 text-white font-bold rounded-sm transition-colors";
export const BTN_QUIET = "bg-white/[0.06] hover:bg-white/[0.12] text-white/70 hover:text-white rounded-sm transition-colors";
