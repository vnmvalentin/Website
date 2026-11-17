// ui/table/touch.js — Bedienung per Finger (Handy, Tablet; Phase 7): kein Mauszeiger, kein Rechtsklick, keine Leertaste.
// Am Tisch gilt dann: antippen = anklicken, lange drücken = Rechtsklick; das zuletzt Angetippte zeigt seine Erklärung
// (scene/tableRoom.js, touchTip). Die Hilfetexte im Pausenmenü nennen die passenden Handgriffe.

/** Wird hauptsächlich mit dem Finger bedient? (grober Zeiger, auch Tablets mit Stift) */
export const isTouch = () => typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches;

/**
 * Hilfetext im Pausenmenü: Maus/Tastatur oder Finger.
 * @param {React.ReactNode} mouse
 * @param {React.ReactNode} finger
 */
export const helpFor = (mouse, finger) => (isTouch() ? finger : mouse);
