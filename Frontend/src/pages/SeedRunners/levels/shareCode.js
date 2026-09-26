// Share-Codes veröffentlichter Level ("SR-7K2-QX9") — Spiegel der Regeln in Backend/seedRunners/shareCode.js, soweit der Browser sie
// braucht: eine eingetippte Suche als Code erkennen und Adressen bauen. Vergeben werden Codes nur vom Server.
const CODE_RE = /^SR-[A-HJKMNP-Z2-9]{3}-[A-HJKMNP-Z2-9]{3}$/;

export const isCode = (s) => typeof s === 'string' && CODE_RE.test(s);

/** "sr 7k2 qx9", "7K2QX9", "SR-7K2-QX9" → "SR-7K2-QX9"; null, wenn es keiner sein kann */
export function normalizeCode(input) {
  if (typeof input !== 'string') return null;
  let s = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.startsWith('SR') && s.length === 8) s = s.slice(2);
  if (s.length !== 6) return null;
  const code = `SR-${s.slice(0, 3)}-${s.slice(3)}`;
  return isCode(code) ? code : null;
}

/**
 * Ist die Eingabe ein VOLLSTÄNDIGER Code mit "SR"-Präfix ("SR-7K2-QX9", "sr 7k2 qx9")? Nur dann springt die Suche direkt zum Level.
 * Ein bloßes "7K2QX9" — oder ein Suchwort, das zufällig aus erlaubten Buchstaben besteht ("Zunder") — geht als Suche an den Server,
 * der auch Codes findet; sonst landete jemand, der nach einem Wort sucht, auf einer Seite "Level gibt es nicht".
 */
export function isFullCodeInput(input) {
  if (typeof input !== 'string') return false;
  const s = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return s.length === 8 && s.startsWith('SR') && normalizeCode(input) !== null;
}

export const levelPath = (code) => `/seed-runners/levels/${code}`;
export const creatorPath = (id) => `/seed-runners/levels/creator/${encodeURIComponent(id)}`;
export const levelUrl = (code) => `${window.location.origin}${levelPath(code)}`;
