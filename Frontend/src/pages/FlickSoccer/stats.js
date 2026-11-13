// stats.js — Zähler für Freischaltungen, Erfolge und die Spielstil-Statistik, nur in diesem Browser gespeichert.
// recordMatch() zählt eine beendete Partie und meldet, was dadurch neu freigeschaltet wurde.
//
// Gespeichert werden einfache Zähler plus drei Tabellen (Aufstellungen, Feld-Siege, Tour-Sterne). loadStats() liefert
// zusätzlich die daraus abgeleiteten Zähler (formationsPlayed, fieldsWon, tourStars, tourWins, achievements), auf die
// Freischaltungen verweisen dürfen.
import { SKINS, SKIN_IDS, FIELD_IDS, FORMATION_IDS, isCustomFormation, isUnlocked } from './engine/index.js';
import { ACHIEVEMENTS, CATALOGS, achievementDone, itemUnlocked } from './progress.js';
import { TOUR_STAGES, starsFor, tourStage } from './tour.js';
import { TRICKS } from './trickData.js';

const KEY = 'flickSoccer.stats';
const COUNTERS = [
  'played', 'wins', 'goals', 'winsEasy', 'winsMedium', 'winsHard', 'winsProfi', 'onlineWins', 'cleanSheets',
  'chaosWins', 'bankGoals', 'kickoffGoals', 'posts', 'maxGoals', 'customWins', 'cardsPlayed',
  'shots', 'powerSum', 'ballHits', // Spielstil: eigene Schüsse, Summe der Schusskraft (0…1), Schüsse mit Ballkontakt
];

const int = (v) => Math.max(0, Math.floor(Number(v) || 0));

function readRaw() {
  let raw = {};
  try {
    raw = JSON.parse(localStorage.getItem(KEY) || '{}') || {};
  } catch {
    raw = {};
  }
  const out = {};
  for (const f of COUNTERS) out[f] = f === 'powerSum' ? Math.max(0, Number(raw[f]) || 0) : int(raw[f]);
  // Aufstellungen: { id: { p: gespielt, w: gewonnen } } — nur bekannte IDs
  out.formations = {};
  for (const id of FORMATION_IDS) {
    const e = raw.formations?.[id];
    if (e) out.formations[id] = { p: int(e.p), w: int(e.w) };
  }
  // Siege je Feld
  out.fieldWins = {};
  for (const id of FIELD_IDS) if (raw.fieldWins?.[id]) out.fieldWins[id] = int(raw.fieldWins[id]);
  // Trickschüsse: beste Sternzahl je Aufgabe (1…3)
  out.trick = {};
  for (const t of TRICKS) {
    const n = Math.min(3, int(raw.trick?.[t.id]));
    if (n > 0) out.trick[t.id] = n;
  }
  // Tour: beste Sternzahl je Gegner (1…3)
  out.tour = {};
  for (const s of TOUR_STAGES) {
    const n = Math.min(3, int(raw.tour?.[s.id]));
    if (n > 0) out.tour[s.id] = n;
  }
  return out;
}

function derive(s) {
  const d = { ...s };
  d.formationsPlayed = Object.values(s.formations).filter((e) => e.p > 0).length;
  d.fieldsWon = Object.values(s.fieldWins).filter((n) => n > 0).length;
  d.tourStars = Object.values(s.tour).reduce((a, n) => a + n, 0);
  d.tourWins = Object.keys(s.tour).length;
  d.trickDone = Object.keys(s.trick).length;
  d.trickStars = Object.values(s.trick).reduce((a, n) => a + n, 0);
  d.trickFirstTry = Object.values(s.trick).filter((n) => n === 3).length;
  d.achievements = 0; // erst zählen, dann eintragen: ein Erfolg darf nicht von der Erfolgszahl abhängen
  d.achievements = ACHIEVEMENTS.filter((a) => achievementDone(a, d)).length;
  return d;
}

/** Statistik inklusive abgeleiteter Zähler. */
export function loadStats() {
  return derive(readRaw());
}

function save(raw) {
  try {
    const { formations, fieldWins, tour, trick } = raw;
    const flat = {};
    for (const f of COUNTERS) flat[f] = raw[f];
    localStorage.setItem(KEY, JSON.stringify({ ...flat, formations, fieldWins, tour, trick }));
  } catch {
    /* ohne Speicher keine Freischaltungen — das Spiel läuft trotzdem */
  }
}

/** Alles, was mit diesen Zählern frei ist: [{ kind, id, name }] */
function unlockedSet(stats) {
  const out = [];
  for (const id of SKIN_IDS) if (isUnlocked(id, stats)) out.push({ kind: 'skin', id, name: SKINS[id].name });
  for (const [kind, catalog] of Object.entries(CATALOGS)) {
    for (const [id, item] of Object.entries(catalog)) if (itemUnlocked(catalog, id, stats)) out.push({ kind, id, name: item.name });
  }
  for (const a of ACHIEVEMENTS) if (achievementDone(a, stats)) out.push({ kind: 'achievement', id: a.id, name: a.name });
  return out;
}

const LEVEL_FIELD = { easy: 'winsEasy', medium: 'winsMedium', hard: 'winsHard', profi: 'winsProfi' };

/**
 * Eine beendete Partie zählen.
 *   mode: 'ai' | 'hotseat' | 'online'; myTeam: eigenes Team; level: KI-Stufe; field, chaos: Einstellungen der Partie
 *   formation: eigene Aufstellung · tourId: Gegner der Tour (tour.js) oder leer · handicap: Tore, die der Gegner als
 *   Vorsprung hatte (zählen bei den Sternen nicht als Gegentor)
 *   play: was die eigenen Schüsse ergeben haben —
 *         { shots, powerSum, ballHits, posts, bankGoals, kickoffGoals, cards } (alles Zähler dieser Partie)
 * Zu zweit an einem Gerät zählt nur als gespielte Partie — Siege gegen sich selbst schalten nichts frei.
 * Rückgabe: [{ kind, id, name }] — was dadurch neu freigeschaltet wurde (Designs, Bälle, Rasen, Jubel, Erfolge).
 */
export function recordMatch({ mode, myTeam = 0, score, winner, goalsToWin, level, field, chaos, formation, tourId = null, handicap = 0, play = {} }) {
  const raw = readRaw();
  const before = unlockedSet(derive(raw));
  raw.played += 1;
  if (mode !== 'hotseat') {
    const mine = score[myTeam] || 0;
    const won = winner === myTeam;
    raw.goals += mine;
    if (mine > raw.maxGoals) raw.maxGoals = mine;
    for (const f of ['shots', 'ballHits', 'posts', 'bankGoals', 'kickoffGoals']) raw[f] += int(play[f]);
    raw.powerSum += Math.max(0, Number(play.powerSum) || 0);
    raw.cardsPlayed += int(play.cards);
    if (FORMATION_IDS.includes(formation)) {
      const e = raw.formations[formation] || { p: 0, w: 0 };
      raw.formations[formation] = { p: e.p + 1, w: e.w + (won ? 1 : 0) };
    }
    if (won) {
      raw.wins += 1;
      if (mode === 'ai' && LEVEL_FIELD[level]) raw[LEVEL_FIELD[level]] += 1;
      if (mode === 'online') raw.onlineWins += 1;
      if (chaos) raw.chaosWins += 1;
      if (isCustomFormation(formation)) raw.customWins += 1;
      // Tour: die beste Sternzahl je Gegner bleibt stehen
      if (mode === 'ai' && tourStage(tourId)) {
        raw.tour[tourId] = Math.max(raw.tour[tourId] || 0, starsFor(true, (score[1 - myTeam] || 0) - handicap));
      }
      if (FIELD_IDS.includes(field)) raw.fieldWins[field] = (raw.fieldWins[field] || 0) + 1;
      // Zu null zählt nur ein ausgespielter Sieg — ein Aufgabe-Sieg beim Stand von 1:0 ist keiner
      if (mine >= goalsToWin && goalsToWin >= 2 && (score[1 - myTeam] || 0) === 0) raw.cleanSheets += 1;
    }
  }
  save(raw);
  const had = new Set(before.map((u) => `${u.kind}:${u.id}`));
  return unlockedSet(derive(raw)).filter((u) => !had.has(`${u.kind}:${u.id}`));
}

/** Sterne für einen gelösten Trickschuss: 3 beim ersten Versuch, 2 bis zum dritten, sonst 1. */
export function trickStarsFor(tries) {
  if (tries <= 1) return 3;
  return tries <= 3 ? 2 : 1;
}

/**
 * Gelösten Trickschuss zählen (die beste Sternzahl bleibt stehen). tries: Versuche bis zum Treffer.
 * Rückgabe: [{ kind, id, name }] — was dadurch neu freigeschaltet wurde.
 */
export function recordTrick(id, tries) {
  if (!TRICKS.some((t) => t.id === id)) return [];
  const raw = readRaw();
  const before = unlockedSet(derive(raw));
  raw.trick[id] = Math.max(raw.trick[id] || 0, trickStarsFor(tries));
  save(raw);
  const had = new Set(before.map((u) => `${u.kind}:${u.id}`));
  return unlockedSet(derive(raw)).filter((u) => !had.has(`${u.kind}:${u.id}`));
}

/** Spielstil aus der Statistik, für die Anzeige im Profil. */
export function playStyle(stats) {
  const fav = Object.entries(stats.formations).sort((a, b) => b[1].p - a[1].p)[0];
  return {
    avgPower: stats.shots ? Math.round((stats.powerSum / stats.shots) * 100) : null, // % der vollen Kraft
    hitRate: stats.shots ? Math.round((stats.ballHits / stats.shots) * 100) : null, // % der Schüsse mit Ballkontakt
    goalsPerMatch: stats.played ? Math.round((stats.goals / stats.played) * 10) / 10 : null,
    winRate: stats.played ? Math.round((stats.wins / stats.played) * 100) : null,
    favorite: fav && fav[1].p > 0 ? { id: fav[0], played: fav[1].p, winRate: Math.round((fav[1].w / fav[1].p) * 100) } : null,
  };
}
