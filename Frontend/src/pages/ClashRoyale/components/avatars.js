// Die verfügbaren Profilbilder.
//
// Bewusst eine eigene Datei ohne Komponenten: Vite/React-Fast-Refresh kann ein Modul
// nur dann zuverlässig ersetzen, wenn es ausschließlich Komponenten exportiert. Stünde
// diese Tabelle in PlayerAvatar.jsx, würde beim Bearbeiten der Datei im Dev-Server
// jedes Mal der komplette Seitenzustand verworfen (Lobby, Verbindung, laufendes Spiel).

// Alle Bilder aus src/assets/avatars/ automatisch einlesen (wird beim Build aufgelöst).
// Seit Sept. 2026 nur noch WebP: die Avatare sind auf 256×256 zugeschnittene Figuren-
// Illustrationen (Kopf/Oberkörper, transparent). Die frühere Emote-Sammlung und die
// unbearbeiteten 4K-PNGs werden dadurch nicht mehr mitgebaut, selbst wenn sie noch im
// Ordner liegen sollten — ein eager-Glob über *.png hätte jedes einzelne ins Bundle gezogen.
const _avatarGlob = import.meta.glob('/src/assets/avatars/*.webp', { eager: true });

/** Map: "Knight_Evolution.webp" → "/assets/Knight_Evolution-abc123.webp" (gehashter Build-Pfad) */
export const AVATAR_URL_MAP = Object.fromEntries(
  Object.entries(_avatarGlob).map(([p, m]) => [p.split('/').pop(), m.default])
);

export const AVATAR_IDS = Object.keys(AVATAR_URL_MAP).sort();

/** Gibt es diesen Avatar (noch)? Gespeicherte Profile und Sitzungen können alte IDs tragen. */
export const isKnownAvatar = (id) => !!id && Object.prototype.hasOwnProperty.call(AVATAR_URL_MAP, id);

/** Ersatz für eine unbekannte/veraltete ID — immer derselbe, damit er nicht bei jedem Rendern wechselt. */
export const DEFAULT_AVATAR_ID = AVATAR_IDS[0] || '';

/**
 * Bild-URL zu einer Avatar-ID. Eine veraltete ID (z.B. ein inzwischen entferntes Emote,
 * das noch in einer Sitzung oder einem Profil steht) bekommt den Standard-Avatar statt
 * eines leeren Kreises; nur "gar keine ID" bleibt null.
 */
export const avatarUrl = (id) => {
  if (!id) return null;
  return AVATAR_URL_MAP[id] ?? AVATAR_URL_MAP[DEFAULT_AVATAR_ID] ?? null;
};
