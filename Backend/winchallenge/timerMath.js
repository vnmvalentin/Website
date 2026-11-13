// Timer-Rechnung der Win Challenge — hoch- oder runterzählend.
//
// Gespeichert wird immer die verstrichene Zeit (elapsedMs bzw. startedAt beim
// Laufen). Beim Runterzählen ist die Anzeige durationMs − verstrichen. So bleiben
// Start/Pause unverändert, und "Reset" führt beim Countdown zurück auf die
// eingestellte Startzeit. Gleiche Rechnung im Frontend: overlayUtils.js
// (timerDisplayMs & Co.) — Änderungen an beiden Stellen nachziehen.

const MAX_TIMER_MS = 999 * 3600 * 1000;
const DEFAULT_COUNTDOWN_MS = 3600 * 1000;

function isCountdown(t) {
  return t?.mode === "down";
}

function durationOf(t) {
  const d = Number(t?.durationMs);
  return Number.isFinite(d) && d > 0 ? Math.min(d, MAX_TIMER_MS) : DEFAULT_COUNTDOWN_MS;
}

/** Verstrichene Zeit jetzt. Beim Countdown nie über die Startzeit hinaus (bei 0 bleibt er stehen). */
function elapsedNow(t, now = Date.now()) {
  const raw = t?.running ? now - (Number(t.startedAt) || now) : Number(t?.elapsedMs) || 0;
  return isCountdown(t) ? Math.min(raw, durationOf(t)) : raw;
}

/** Was das Overlay zeigt. */
function displayMs(t, now = Date.now()) {
  const e = elapsedNow(t, now);
  return Math.max(0, isCountdown(t) ? durationOf(t) - e : e);
}

function withElapsed(t, elapsed, now = Date.now()) {
  const next = { ...t, elapsedMs: elapsed };
  if (next.running) next.startedAt = now - elapsed;
  return next;
}

/** Angezeigte Zeit direkt setzen (Editor-Eingabe, !settimer, Mod-Seite). */
function setDisplay(t, ms, now = Date.now()) {
  const v = Math.max(0, Math.min(Number(ms) || 0, MAX_TIMER_MS));
  // Beim Countdown darf die verstrichene Zeit negativ werden, wenn mehr Zeit
  // gesetzt wird als die Startzeit hergibt — die Anzeige stimmt trotzdem.
  return withElapsed(t, isCountdown(t) ? durationOf(t) - v : v, now);
}

/** ± auf die angezeigte Zeit: beim Countdown heißt "+" also mehr Restzeit. */
function adjustDisplay(t, deltaMs, now = Date.now()) {
  return setDisplay(t, displayMs(t, now) + deltaMs, now);
}

function start(t, now = Date.now()) {
  if (t.running) return t;
  // Abgelaufener Countdown: Start beginnt wieder von vorn
  const base = isCountdown(t) && displayMs(t, now) <= 0 ? 0 : elapsedNow(t, now);
  return { ...t, running: true, startedAt: now - base, elapsedMs: base };
}

function pause(t, now = Date.now()) {
  if (!t.running) return t;
  return { ...t, running: false, startedAt: 0, elapsedMs: elapsedNow(t, now) };
}

function reset(t) {
  return { ...t, running: false, startedAt: 0, elapsedMs: 0 };
}

/**
 * Richtung wechseln. Zum Countdown: beginnt bei der Startzeit. Zurück zur
 * Stoppuhr: zeigt die bisher verstrichene Zeit. (Gleich wie setTimerMode im Editor.)
 */
function setMode(t, mode, now = Date.now()) {
  const target = mode === "down" ? "down" : "up";
  if ((isCountdown(t) ? "down" : "up") === target) return t;
  if (target === "down") {
    return { ...t, mode: target, elapsedMs: 0, ...(t.running ? { startedAt: now } : {}) };
  }
  return setDisplay({ ...t, mode: target }, elapsedNow(t, now), now);
}

/** Startzeit des Countdowns. Die Restzeit verschiebt sich um die Änderung. */
function setDuration(t, ms) {
  const v = Math.round(Number(ms));
  if (!Number.isFinite(v) || v <= 0) return null;
  return { ...t, durationMs: Math.min(v, MAX_TIMER_MS) };
}

/** Gespeicherte Felder säubern (mode/durationMs kommen auch vom Editor). */
function normalizeTimerFields(t) {
  const next = { ...t };
  next.mode = next.mode === "down" ? "down" : "up";
  next.durationMs = durationOf(next);
  return next;
}

module.exports = {
  MAX_TIMER_MS,
  DEFAULT_COUNTDOWN_MS,
  isCountdown,
  elapsedNow,
  displayMs,
  setDisplay,
  adjustDisplay,
  start,
  pause,
  reset,
  setMode,
  setDuration,
  normalizeTimerFields,
};
