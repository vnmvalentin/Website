// Die verfügbaren Profilbilder.
//
// Bewusst eine eigene Datei ohne Komponenten: Vite/React-Fast-Refresh kann ein Modul
// nur dann zuverlässig ersetzen, wenn es ausschließlich Komponenten exportiert. Stünde
// diese Tabelle in PlayerAvatar.jsx, würde beim Bearbeiten der Datei im Dev-Server
// jedes Mal der komplette Seitenzustand verworfen (Lobby, Verbindung, laufendes Spiel).

// Alle Bilder aus src/assets/avatars/ automatisch einlesen (wird beim Build aufgelöst)
const _avatarGlob = import.meta.glob(
  '/src/assets/avatars/*.{png,jpg,jpeg,gif,webp,PNG,JPG,JPEG,GIF,WEBP}',
  { eager: true }
);

/** Map: "held.png" → "/assets/held-abc123.png" (gehashter Build-Pfad) */
export const AVATAR_URL_MAP = Object.fromEntries(
  Object.entries(_avatarGlob).map(([p, m]) => [p.split('/').pop(), m.default])
);

export const AVATAR_IDS = Object.keys(AVATAR_URL_MAP).sort();

export const avatarUrl = (id) => (id ? AVATAR_URL_MAP[id] ?? null : null);
