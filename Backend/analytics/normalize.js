// normalize.js — macht aus dem, was der Browser meldet, zählbare und unbedenkliche Werte.
//
// Wichtigster Punkt: Adressen mit Codes oder Schlüsseln (Lobby-Codes, Bingo-Beitrittslinks,
// Steuer-Links der Win Challenge) dürfen nie im Klartext in der Statistik landen. Deshalb wird
// jede Adresse auf ihre Route gekürzt — alles hinter dem bekannten Teil wird zu "/*".

// Routen, die tiefer als eine Ebene gehen (Stand: Frontend/src/App.jsx). Einstufige Routen
// müssen hier NICHT stehen: eine unbekannte Adresse behält ihr erstes Segment, eine neue
// Seite /neues-spiel taucht also ohne Pflege dieser Liste richtig auf.
const KNOWN_PATHS = [
  '/seed-runners/daily', '/seed-runners/verlauf', '/seed-runners/sandbox', '/seed-runners/editor',
  '/seed-runners/levels', '/seed-runners/levels/creator', '/seed-runners/raum',
  '/sacrifice-and-sigils/raum', '/sacrifice-and-sigils/uebung', '/sacrifice-and-sigils/kartenbuch',
  '/sacrifice-and-sigils/anleitung', '/sacrifice-and-sigils/tutorial', '/sacrifice-and-sigils/moorwanderung',
  '/clash-royale/turnier', '/clash-royale/turnier/neu', '/clash-royale/win-tracker',
  '/flick-soccer/spiel',
  '/discord-bot/privacy', '/discord-bot/terms',
  '/tutorial/ytm-bot',
];
const KNOWN = new Map(KNOWN_PATHS.map((p) => [p.toLowerCase(), p]));

// Wird nicht gezählt: OBS-Overlays (laden bei jedem Szenenwechsel neu und sind keine Besuche),
// Steuer-Links, Login-Rücksprung und der Admin-Bereich. Dasselbe Overlay-Muster wie in index.html.
const EXCLUDED = /(^\/winchallengeoverlay\/)|(\/overlay\/)|(^\/winchallengecontrol(\/|$))|(^\/admin(\/|$))|(^\/auth(\/|$))/i;

const SEGMENT_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/i;

/** @returns {string|null} gekürzte Route, oder null, wenn die Adresse nicht gezählt wird */
function normalizePath(raw) {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.length > 300) return null;
  const clean = raw.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  if (EXCLUDED.test(`${clean}/`)) return null;
  if (clean === '/') return '/';

  const segments = clean.split('/').filter(Boolean);
  // Längsten bekannten Anfang suchen; was danach kommt, ist ein Code oder eine ID.
  for (let n = segments.length; n >= 2; n--) {
    const known = KNOWN.get(`/${segments.slice(0, n).join('/')}`.toLowerCase());
    if (known) return n === segments.length ? known : `${known}/*`;
  }
  if (!SEGMENT_RE.test(segments[0])) return '(unbekannt)';
  return segments.length === 1 ? `/${segments[0]}` : `/${segments[0]}/*`;
}

const OWN_HOSTS = new Set(['vnmvalentin.de', 'www.vnmvalentin.de', 'localhost', '127.0.0.1']);
const TAG_RE = /^[a-z0-9][a-z0-9._-]{0,39}$/i;

/**
 * Herkunft eines Besuchs. Ein Kampagnen-Kürzel aus dem Link (?utm_source= / ?ref=) geht vor,
 * sonst zählt der Hostname der verweisenden Seite — nie deren ganze Adresse.
 * @returns {string|null} null bei Navigation innerhalb der eigenen Seite
 */
function normalizeSource(referrer, tag) {
  if (typeof tag === 'string' && TAG_RE.test(tag)) return `Link: ${tag.toLowerCase()}`;
  if (typeof referrer !== 'string' || !referrer) return '(direkt)';
  try {
    const host = new URL(referrer).hostname.toLowerCase().replace(/^www\./, '');
    if (!host || host.length > 80) return '(direkt)';
    return OWN_HOSTS.has(host) ? null : host;
  } catch {
    return '(direkt)';
  }
}

/** Browsersprache auf zwei Buchstaben gekürzt ("de-AT" → "de"). */
function normalizeLang(raw) {
  const m = typeof raw === 'string' ? /^([a-z]{2})(-|$)/i.exec(raw.trim()) : null;
  return m ? m[1].toLowerCase() : null;
}

const BOT_RE = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|prerender|puppeteer|playwright|preview|monitor|uptime|curl|wget|python|axios|node-fetch|go-http|obs\//i;
const isBot = (userAgent) => !userAgent || BOT_RE.test(userAgent);
const isMobile = (userAgent) => /mobi|android|iphone|ipad|ipod/i.test(userAgent || '');

module.exports = { normalizePath, normalizeSource, normalizeLang, isBot, isMobile };
