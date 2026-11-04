// gambleLayout.js — Lage, Größe und Sichtbarkeit der Teile des Gamble-Overlays.
// Overlay (/overlay/gamble) und Steuerpult (/stream-szenen, Reiter „Gamble“) teilen sich das.

/** Bühne wie in OBS; x/y sind die obere linke Ecke eines Teils darauf. Gleich wie im Backend (sceneStore.js). */
export const GAMBLE_STAGE_W = 1920;
export const GAMBLE_STAGE_H = 1080;
export const GAMBLE_LAYOUT_DEFAULT = {
  demo: false,
  rocket: { enabled: true, x: 1548, y: 32, scale: 1 },
  marbles: { enabled: true, x: 32, y: 32, scale: 1 },
  pot: { enabled: true, x: 750, y: 876, scale: 1 },
};

/** Gespeicherte Einstellungen mit Standardwerten auffüllen (fehlt etwas, gilt der Standard). */
export function mergeGambleLayout(g) {
  const src = g && typeof g === "object" ? g : {};
  const out = { demo: !!src.demo };
  for (const k of ["rocket", "marbles", "pot"]) out[k] = { ...GAMBLE_LAYOUT_DEFAULT[k], ...(src[k] || {}) };
  return out;
}

/** Standbild für die Vorschau im Steuerpult: von jedem Teil ein typischer Zustand. */
export function gamblePreviewState(now) {
  return {
    rocket: {
      phase: "open",
      startsAt: now + 12000,
      growth: 0.1,
      receivedAt: now,
      bets: [
        { user: "Mira", bet: 100, target: 1.5 },
        { user: "Toastbrot", bet: 250, target: 2.5 },
        { user: "BlitzBirne", bet: 50, target: 5 },
        { user: "Kaktusmilch", bet: 500, target: 1.2 },
      ],
    },
    marbles: demoMarbleEvent(10, now + 16000),
    potWinner: { user: "Kaktusmilch", amount: 1840, entrants: 23 },
  };
}

/** Murmelbahn-Preise wie in StreamerBot/GambleCore.cs (nur für Demo und Vorschau). */
function demoPrizes(n) {
  const p1 = Math.min(2000, 100 + 25 * n);
  return [p1, n >= 8 ? Math.round(p1 * 0.5) : 0, n >= 15 ? Math.round(p1 * 0.25) : 0].filter((p) => p > 0);
}

/** Murmel-Ereignis wie aus Streamer.bot, mit n Fahrern. */
export function demoMarbleEvent(n, closesAt) {
  return {
    phase: "open",
    closesAt,
    riders: n,
    participation: 20,
    prizes: demoPrizes(n),
    next: n < 8 ? { place: 2, missing: 8 - n } : n < 15 ? { place: 3, missing: 15 - n } : null,
  };
}
