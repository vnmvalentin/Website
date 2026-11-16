// dailyRound.js — die Tagesrunde aller CR-Ratespiele (/clash/heute, HeutePage.jsx; Ausbauplan „cr-heute“).
//
// Die fünf Spiele haben schon je eine Tagesrunde (Datum-Seed, gleich für alle) und merken ihren Stand im Browser
// ({ daily: … } unter ihrem Schlüssel). Dieses Modul liest diese Stände — die Spiele selbst wissen von der Tagesrunde
// nur, dass sie nach jedem Speichern syncDaily() aufrufen —, rechnet jedes Ergebnis auf 0–100 Punkte um und führt einen
// eigenen Verlauf (crq_daily_v1). Daraus kommen Gesamtpunkte (bis 500), Serie und das Ergebnis zum Teilen.
// Das erste Ergebnis eines Tages bleibt stehen (ein späteres Neuspielen ändert es nicht) — wie die Bestenliste am Server.
//
// Rein und ohne JSON-Importe (in Node testbar); Speicher und Datum lassen sich hereinreichen.

/** Wie viele Hinweise/Versuche die Spiele haben — muss zu den Spielen passen (CardGuesser HINTS, ImageGuess MAX_TRIES). */
const GUESS_HINTS = 6;
const IMAGE_TRIES = 12;

const pct = (v) => Math.max(0, Math.min(100, Math.round(v)));

/** Kartenraten: richtig mit 1 Hinweis = 100, mit allen 6 = 17, falsch = 0. */
export function scoreGuess(g) {
  if (!g?.over) return null;
  return g.won ? pct((100 * (GUESS_HINTS - Math.max(1, g.shown || 1) + 1)) / GUESS_HINTS) : 0;
}
/** Karten-Wordle (ohne Niederlage): im ersten Versuch 100, je weiterem 10 weniger, mindestens 10. */
export function scoreWordle(g) {
  if (!g?.won) return null;
  const n = Array.isArray(g.guesses) ? g.guesses.length : 1;
  return Math.max(10, 100 - (Math.max(1, n) - 1) * 10);
}
/** Zoom-/Pixel-Raten: jeder verbrauchte Versuch (falscher Tipp oder Überspringen) kostet ein Zwölftel, nicht erkannt = 0. */
export function scoreImage(g) {
  if (!g?.over) return null;
  const used = (Array.isArray(g.wrong) ? g.wrong.length : 0) + (g.skips || 0);
  return g.won ? pct((100 * (IMAGE_TRIES - used)) / IMAGE_TRIES) : 0;
}
/** Farb-Raten: Schnitt der fünf Farbtreffer in Prozent. */
export function scoreColor(g) {
  if (!g?.over || !Array.isArray(g.results) || !g.results.length) return null;
  return pct(g.results.reduce((s, r) => s + (Number(r?.score) || 0), 0) / g.results.length);
}

/** Die Spiele der Tagesrunde in der Reihenfolge der Kette (NextGame.jsx). title/img lösen die Bauteile auf. */
export const DAILY_GAMES = [
  { key: 'wordle', store: 'crq_wordle_v1', path: '/clash/wordle', title: 'wordleTitle', score: scoreWordle },
  { key: 'kartenraten', store: 'crq_guess_v3', path: '/clash/kartenraten', title: 'guessTitle', score: scoreGuess },
  { key: 'zoom', store: 'crq_zoom_v1', path: '/clash/zoom', title: 'zoomTitle', score: scoreImage },
  { key: 'pixel', store: 'crq_pixel_v1', path: '/clash/pixel', title: 'pixelTitle', score: scoreImage },
  { key: 'farbe', store: 'crq_color_v1', path: '/clash/farbe', title: 'colorTitle', score: scoreColor },
];
export const MAX_TOTAL = DAILY_GAMES.length * 100;
const KEYS = DAILY_GAMES.map((g) => g.key);

/** Heutiger Tag in Berlin als „JJJJ-MM-TT“ (wie quizData.berlinDay — dort hängt aber ein JSON-Import dran). */
export function todayBerlin(d = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(d);
}
/** Der Kalendertag davor („JJJJ-MM-TT“). */
export function prevDay(day) {
  const [y, m, d] = String(day).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

const HISTORY = 'crq_daily_v1';
const KEEP_DAYS = 400;

function read(storage, key, fallback) {
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Liest die Tagesstände der fünf Spiele und trägt fertige Ergebnisse von heute in den Verlauf ein (nur, was dort noch
 * fehlt). Ruft jedes Spiel nach dem Speichern auf; die Tagesrunden-Seite beim Öffnen.
 * @returns {{ day: string, scores: Record<string, number>, days: Record<string, Record<string, number>> }}
 */
export function syncDaily({ storage = globalThis.localStorage, day = todayBerlin() } = {}) {
  const hist = read(storage, HISTORY, null);
  const days = hist && typeof hist.days === 'object' && hist.days ? hist.days : {};
  const today = { ...(days[day] || {}) };
  let changed = false;
  for (const g of DAILY_GAMES) {
    if (typeof today[g.key] === 'number') continue;
    const saved = read(storage, g.store, null)?.daily;
    if (!saved || saved.day !== day) continue;
    const score = g.score(saved);
    if (typeof score === 'number') { today[g.key] = score; changed = true; }
  }
  if (changed) {
    days[day] = today;
    const keep = Object.keys(days).sort().slice(-KEEP_DAYS);
    const trimmed = Object.fromEntries(keep.map((d) => [d, days[d]]));
    try { storage.setItem(HISTORY, JSON.stringify({ v: 1, days: trimmed })); } catch { /* privater Modus: nur für jetzt */ }
    return { day, scores: today, days: trimmed };
  }
  return { day, scores: today, days };
}

/** Alle fünf an diesem Tag gespielt? */
export const complete = (scores) => KEYS.every((k) => typeof scores?.[k] === 'number');
export const totalOf = (scores) => KEYS.reduce((s, k) => s + (typeof scores?.[k] === 'number' ? scores[k] : 0), 0);
export const doneCount = (scores) => KEYS.filter((k) => typeof scores?.[k] === 'number').length;

/**
 * Serie: Tage in Folge mit kompletter Runde. Ist heute noch nicht komplett, zählt die Serie bis gestern weiter
 * (sie reißt erst, wenn ein ganzer Tag fehlt). best = längste Serie im Verlauf.
 */
export function streakOf(days, today) {
  const isFull = (d) => complete(days?.[d]);
  let cur = 0;
  let d = isFull(today) ? today : prevDay(today);
  while (isFull(d)) { cur += 1; d = prevDay(d); }
  let best = 0;
  let run = 0;
  let last = null;
  for (const day of Object.keys(days || {}).sort()) {
    if (!isFull(day)) { run = 0; last = day; continue; }
    run = last && prevDay(day) === last && isFull(last) ? run + 1 : 1;
    best = Math.max(best, run);
    last = day;
  }
  return { current: cur, best: Math.max(best, cur) };
}

/** Farbe eines Ergebnisses fürs Teilen: grün ab 67, gelb ab 34, sonst rot; nicht gespielt weiß. */
export const markOf = (score) => (typeof score !== 'number' ? '⬜' : score >= 67 ? '🟩' : score >= 34 ? '🟨' : '🟥');

/**
 * Text zum Teilen (Discord, WhatsApp …).
 * @param {{ day: string, scores: object, streak: number, labels: Record<string, string>, heading: string, totalLabel: string, streakLabel: (n: number) => string, url: string, dateText: string }} o
 */
export function shareText({ scores, streak, labels, heading, totalLabel, streakLabel, url, dateText }) {
  const lines = [`${heading} ${dateText}`];
  for (const g of DAILY_GAMES) {
    const s = scores?.[g.key];
    lines.push(`${markOf(s)} ${labels[g.key] || g.key}${typeof s === 'number' ? ` ${s}` : ''}`);
  }
  lines.push(`${totalLabel} ${totalOf(scores)}/${MAX_TOTAL}${streak > 1 ? ` · ${streakLabel(streak)}` : ''}`);
  lines.push(url);
  return lines.join('\n');
}
