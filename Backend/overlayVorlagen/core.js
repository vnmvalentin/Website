// core.js — Regeln der Community-Vorlagen (Overlay-Galerie, Ausbauplan „vorlagen-teilen“), ohne Datenbank.
//
// Eine Vorlage ist nur ein LOOK: Farben, Ecken, Deckkraft, Schriftgrößen — nie Inhalte (Challenges, Accounts, Texte)
// und nie Größe/Platz im Stream des anderen. Angenommen werden deshalb nur die Felder unten, nur als einfache Werte.
// Genau geprüft (Wertebereiche) wird beim Übernehmen von den Werkzeugen selbst (normalizeStyle der Win Challenge,
// mergeTheme der Twitch-Overlays, die Normalisierer des Win Trackers) — hier geht es darum, dass nichts Fremdes,
// Großes oder Ausführbares gespeichert wird.

const TOOLS = ["winChallenge", "twitch", "winTracker"];

const STYLE_KEYS = {
  // Design der Win Challenge (DEFAULT_STYLE in winchallengeRoutes.js, ohne Breite des Laufbands und Layout-Gedächtnis)
  winChallenge: [
    "boxBg", "headerBg", "itemBg", "textColor", "titleColor", "accent", "opacity", "headerOpacity", "itemOpacity",
    "timerOpacity", "counterOpacity", "borderRadius", "boxWidth", "titleAlign", "titleFontSize", "itemFontSize",
    "timerFontSize", "layout", "counterStyle", "headerProgress",
  ],
  // Gemeinsames Design der Twitch-Overlays (THEME_DEFAULTS in streamToolConfig.js)
  twitch: ["style", "accent", "opacity", "glass", "radius", "font"],
  // Look des Win Trackers (Teil von PUT /api/cr-wintracker/settings — ohne Inhalte, Sprache, Chat, Größe)
  winTracker: [
    "overlayTheme", "royalePanel", "royalePattern", "squareCorners", "bgColor", "bgOpacity", "bgGradient", "bgColor2",
    "borderColor", "last5Style",
  ],
};

const MAX_TITLE = 40;
const MIN_TITLE = 3;
/** So viele öffentliche Vorlagen darf ein Konto je Werkzeug haben. */
const MAX_PER_TOOL = 10;
/** Mindestabstand zwischen zwei Veröffentlichungen eines Kontos. */
const PUBLISH_GAP_MS = 30 * 1000;
/** Ab so vielen Meldungen verschiedener Konten wird eine Vorlage bis zur Prüfung ausgeblendet. */
const HIDE_AFTER_REPORTS = 3;

const COLOR_RE = /^#[0-9a-f]{3,8}$/i;
const WORD_RE = /^[a-z0-9-]{1,20}$/i;

/**
 * Nur erlaubte Felder, nur einfache Werte: Farbe (#hex), Wort (Aufzählung), Zahl, ja/nein; "" (= automatisch) auch.
 * @returns {object|null} null, wenn nichts Brauchbares übrig bleibt
 */
function sanitizeStyle(tool, style) {
  const keys = STYLE_KEYS[tool];
  if (!keys || !style || typeof style !== "object" || Array.isArray(style)) return null;
  const out = {};
  for (const k of keys) {
    const v = style[k];
    if (typeof v === "boolean") out[k] = v;
    else if (typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 10000) out[k] = v;
    else if (typeof v === "string" && (v === "" || COLOR_RE.test(v) || WORD_RE.test(v))) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

// Steuer- und unsichtbare Zeichen (Nullbreite, Zeilen-/Absatztrenner, Richtungswechsel) — aus Zeichencodes gebaut,
// weil ein U+2028 im Quelltext einer Regex-Schreibweise die Zeile beendet
const INVISIBLE = new RegExp(`[${String.fromCharCode(0)}-${String.fromCharCode(0x1f)}${String.fromCharCode(0x7f)}${String.fromCharCode(0x200b)}-${String.fromCharCode(0x200f)}${String.fromCharCode(0x2028)}-${String.fromCharCode(0x202e)}]+`, "g");

/** Name der Vorlage: Steuerzeichen raus, Leerraum zusammengezogen, 3–40 Zeichen, keine Links. null = ungültig. */
function cleanTitle(title) {
  const t = String(title ?? "")
    .replace(INVISIBLE, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (t.length < MIN_TITLE || t.length > MAX_TITLE) return null;
  if (/https?:|www\.|\.(com|de|net|tv|gg)\b/i.test(t)) return null;
  return t;
}

/** Was die Galerie von einer Vorlage zu sehen bekommt. own/admin bestimmen, ob Löschen/Status mitkommen. */
function publicView(row, { userId = "", admin = false } = {}) {
  let style = {};
  try { style = JSON.parse(row.style) || {}; } catch { style = {}; }
  const own = !!userId && String(row.owner_id) === String(userId);
  return {
    id: row.id,
    tool: row.tool,
    title: row.title,
    by: row.owner_name || "",
    style,
    uses: Number(row.uses) || 0,
    createdAt: Number(row.created_at) || 0,
    own,
    ...(own || admin ? { status: row.status, reports: Number(row.reports) || 0 } : {}),
  };
}

module.exports = {
  TOOLS, STYLE_KEYS, MAX_TITLE, MIN_TITLE, MAX_PER_TOOL, PUBLISH_GAP_MS, HIDE_AFTER_REPORTS,
  sanitizeStyle, cleanTitle, publicView,
};
