// deckOverlayOptions.js — Seitenwechsel-Einstellungen der Deck-Overlays.
//
// Die Einstellungen stehen im Overlay-Link selbst (?rotate=<Sekunden>&perPage=<Decks>):
// Beide Overlays (pro Account und pro Lobby) bekommen sie so ohne Backend-Änderung, und
// zwei Browserquellen in OBS können unterschiedlich eingestellt sein. Nachteil: nach einer
// Änderung muss der Link in OBS neu eingefügt werden — darauf weist die Einstellung hin.

export const ROTATE_SECONDS_OPTIONS = [5, 8, 10, 15, 20, 30];
export const PER_PAGE_OPTIONS = [1, 2, 3, 4, 6];

export const DEFAULT_ROTATION = { enabled: false, seconds: 10, perPage: 2 };

const clampInt = (raw, min, max) => {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
};

/** Liest die Einstellungen aus einem Query-String. Ungültige Werte → Standard bzw. aus. */
export function readRotation(search) {
  const params = new URLSearchParams(search || "");
  const seconds = clampInt(params.get("rotate"), 3, 120);
  const perPage = clampInt(params.get("perPage"), 1, 8);
  if (!seconds) return { ...DEFAULT_ROTATION };
  return { enabled: true, seconds, perPage: perPage || DEFAULT_ROTATION.perPage };
}

/** Hängt die Einstellungen an den Overlay-Link (ohne Parameter, wenn der Schalter aus ist). */
export function buildDeckOverlayUrl(baseUrl, rotation) {
  if (!baseUrl) return "";
  if (!rotation?.enabled) return baseUrl;
  const params = new URLSearchParams({
    rotate: String(rotation.seconds),
    perPage: String(rotation.perPage),
  });
  return `${baseUrl}?${params.toString()}`;
}

// Letzte Wahl merken, damit man sie nicht vor jedem Kopieren neu setzen muss —
// reine Bequemlichkeit, deshalb jeder Zugriff in try/catch (privates Fenster o. ä.).
const STORAGE_KEY = "cr.deckOverlay.rotation";

export function loadStoredRotation() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!raw || typeof raw !== "object") return { ...DEFAULT_ROTATION };
    return {
      enabled: !!raw.enabled,
      seconds: ROTATE_SECONDS_OPTIONS.includes(raw.seconds) ? raw.seconds : DEFAULT_ROTATION.seconds,
      perPage: PER_PAGE_OPTIONS.includes(raw.perPage) ? raw.perPage : DEFAULT_ROTATION.perPage,
    };
  } catch {
    return { ...DEFAULT_ROTATION };
  }
}

export function storeRotation(rotation) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rotation));
  } catch { /* nicht speicherbar — Einstellung gilt dann nur bis zum Neuladen */ }
}
