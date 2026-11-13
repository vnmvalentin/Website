// engine/match.js — Spielregeln: wer ist am Zug, Tore, Anstoß, Sieg. Reine Funktionen auf einem serialisierbaren
// Match-Objekt; dieselben Regeln laufen lokal (KI, zu zweit) und auf dem Server (online).
//
// Ablauf wie im Original: Ein Zug = ein Schuss mit einer eigenen Scheibe, danach ist das andere Team dran. Nach einem
// Tor stellen sich beide Teams neu auf, das Team, das das Tor kassiert hat, hat Anstoß. Wer zuerst `goalsToWin` Tore
// hat, gewinnt.
//
// Chaos-Modus (settings.chaos): Jedes Team hält drei Karten (powerups.js) und darf pro Zug eine davon mit dem Schuss
// ausspielen (shot.power). match.chaos = { seed, hands: [Hand Team 0, Hand Team 1], drawn: [gezogen 0, gezogen 1],
// bonus, turns, always } — bonus ist der zweite Schuss nach einem Doppelschuss, bei dem keine Karte erlaubt ist;
// turns zählt die Züge (daraus ergibt sich das Ereignis des Zugs, events.js), always = Ereignisse ohne Pause.
//
// Sonderregeln (match.rule, nur in der Tour gegen den Computer): 'dauerchaos' (jeder Zug hat ein Ereignis), 'schwer'
// (die Scheiben von Team 1 sind schwerer), 'tempo' (Team 1 schießt schneller). match.handicap = Tore, mit denen
// Team 1 das Spiel beginnt.

import { RULES, TEAM_SIZE } from './constants.js';
import { formationSpots, isFormation, DEFAULT_FORMATION } from './formations.js';
import { DEFAULT_FIELD, getField, isField } from './fields.js';
import { dealHand, replaceCard } from './powerups.js';
import { eventForTurn, upcomingEvent } from './events.js';
import { simulateShot } from './physics.js';

export function kickoffState(formations, fieldId = DEFAULT_FIELD) {
  const field = getField(fieldId);
  return {
    field: field.id,
    pieces: [...formationSpots(formations[0], 0, field), ...formationSpots(formations[1], 1, field)],
    ball: { x: field.W / 2, y: field.H / 2 },
  };
}

export function normalizeSettings(settings = {}) {
  const goals = Number(settings.goalsToWin);
  const turn = Number(settings.turnSeconds);
  return {
    goalsToWin: RULES.GOALS_TO_WIN.includes(goals) ? goals : RULES.DEFAULT_GOALS,
    turnSeconds: RULES.TURN_SECONDS.includes(turn) ? turn : RULES.DEFAULT_TURN_SECONDS,
    replay: settings.replay === true, // Torwiederholung, standardmäßig aus
    field: isField(settings.field) ? settings.field : DEFAULT_FIELD,
    chaos: settings.chaos === true, // Karten, standardmäßig aus
  };
}

export const MATCH_RULES = Object.freeze(['dauerchaos', 'schwer', 'tempo']);

/**
 * seed: Zufall für Kartenstapel und Ereignisse des Chaos-Modus (online vom Server, sonst gewürfelt).
 * rule: Sonderregel (MATCH_RULES) oder leer · handicap: Tore Vorsprung für Team 1 (0…2)
 */
export function createMatch({ settings, formations, startingTeam = 0, seed, rule = null, handicap = 0 } = {}) {
  const f = [0, 1].map((t) => (isFormation(formations?.[t]) ? formations[t] : DEFAULT_FORMATION));
  const s = normalizeSettings(settings);
  let chaos = null;
  if (s.chaos) {
    const sd = Number.isFinite(seed) ? seed >>> 0 : Math.floor(Math.random() * 0x7fffffff);
    const deals = [dealHand(sd, 0), dealHand(sd, 1)];
    chaos = {
      seed: sd, hands: deals.map((d) => d.hand), drawn: deals.map((d) => d.drawn), bonus: false,
      turns: 0, always: rule === 'dauerchaos',
    };
  }
  const lead = Math.max(0, Math.min(2, Math.floor(Number(handicap) || 0)));
  return {
    settings: s,
    formations: f,
    score: [0, Math.min(lead, s.goalsToWin - 1)],
    handicap: Math.min(lead, s.goalsToWin - 1),
    rule: MATCH_RULES.includes(rule) ? rule : null,
    turn: startingTeam === 1 ? 1 : 0,
    state: kickoffState(f, s.field),
    winner: null,
    shotCount: 0,
    chaos,
  };
}

/** Karten, die `team` gerade auf der Hand hält (ohne Chaos: leer). */
export function chaosHand(match, team) {
  return match?.chaos?.hands?.[team === 1 ? 1 : 0] || [];
}

/** Darf `team` in diesem Zug eine Karte spielen? Nicht beim Bonus-Schuss nach einem Doppelschuss. */
export function canPlayCard(match, team) {
  return !!match?.chaos && match.winner === null && match.turn === team && !match.chaos.bonus;
}

/** `power`, wenn `team` diese Karte jetzt spielen darf — sonst null. */
export function usablePower(match, team, power) {
  return canPlayCard(match, team) && chaosHand(match, team).includes(power) ? power : null;
}

/** Ereignis, das im laufenden Zug gilt (Chaos-Modus), oder null. */
export function currentEvent(match) {
  if (!match?.chaos || match.winner !== null) return null;
  return eventForTurn(match.chaos.seed, match.chaos.turns || 0, !!match.chaos.always);
}

/** Das nächste Ereignis, das noch nicht läuft: { id, inTurns } oder null. */
export function nextEvent(match) {
  if (!match?.chaos || match.winner !== null) return null;
  return upcomingEvent(match.chaos.seed, match.chaos.turns || 0, !!match.chaos.always);
}

/**
 * Alles, was die Physik über diesen Zug wissen muss: gespielte Karte, Ereignis, Sonderregel. Liefert null, wenn nichts
 * davon gilt. Browser und Server bauen es mit dieser einen Funktion, damit beide denselben Schuss rechnen.
 */
export function shotMods(match, team, power = null) {
  const event = currentEvent(match);
  const rule = match?.rule || null;
  if (!power && !event && !rule) return null;
  return { power: power || null, team, event, salt: match?.chaos?.turns || 0, rule };
}

/** Scheiben-Index → Team; die ersten TEAM_SIZE gehören Team 0. */
export function pieceTeam(index) {
  return index < TEAM_SIZE ? 0 : 1;
}

/**
 * Prüft und normalisiert einen Schuss von `team`. Liefert null, wenn er nicht erlaubt ist. shot.power (Karte) wird
 * übernommen, wenn sie auf der Hand liegt und gespielt werden darf — sonst gilt der Schuss ohne Karte.
 */
export function sanitizeShot(match, team, shot) {
  if (!match || match.winner !== null || match.turn !== team || !shot) return null;
  const piece = Number(shot.piece);
  let sx = Number(shot.sx);
  let sy = Number(shot.sy);
  if (!Number.isInteger(piece) || piece < 0 || piece >= TEAM_SIZE * 2) return null;
  if (pieceTeam(piece) !== team) return null;
  if (!Number.isFinite(sx) || !Number.isFinite(sy)) return null;
  const len = Math.sqrt(sx * sx + sy * sy);
  if (len === 0) return null;
  if (len > 1) {
    sx /= len;
    sy /= len;
  }
  return { piece, sx, sy, power: usablePower(match, team, shot.power) };
}

/**
 * Wendet das Ergebnis einer Simulation an (Tor, Zugwechsel, Sieg). Gibt ein neues Match zurück.
 * power: die Karte, mit der dieser Schuss gespielt wurde, oder null.
 */
export function applyResult(match, result, power = null) {
  const next = { ...match, score: [...match.score], shotCount: match.shotCount + 1 };
  let again = false;
  if (match.chaos) {
    const chaos = {
      ...match.chaos, hands: match.chaos.hands.map((h) => [...h]), drawn: [...match.chaos.drawn], bonus: false,
      turns: (match.chaos.turns || 0) + 1,
    };
    if (power) {
      const t = match.turn;
      const r = replaceCard(chaos.seed, t, chaos.hands[t], chaos.drawn[t], power);
      chaos.hands[t] = r.hand;
      chaos.drawn[t] = r.drawn;
    }
    again = power === 'doppel';
    next.chaos = chaos;
  }
  if (result.goal === 0 || result.goal === 1) {
    next.score[result.goal] += 1;
    if (next.score[result.goal] >= match.settings.goalsToWin) {
      next.winner = result.goal;
      next.state = result.state;
      return next;
    }
    next.state = kickoffState(match.formations, match.settings.field);
    next.turn = 1 - result.goal; // wer kassiert hat, stößt an
    return next;
  }
  next.state = result.state;
  if (again) next.chaos.bonus = true; // Doppelschuss: dasselbe Team nochmal, ohne Karte
  else next.turn = 1 - match.turn;
  return next;
}

/** Schuss ausführen: prüfen, simulieren, Regeln anwenden. Liefert { shot, power, mods, result, match } oder null. */
export function playShot(match, team, rawShot) {
  const clean = sanitizeShot(match, team, rawShot);
  if (!clean) return null;
  const { power, ...shot } = clean;
  const mods = shotMods(match, team, power);
  const result = simulateShot(match.state, shot, mods);
  return { shot, power, mods, result, match: applyResult(match, result, power) };
}

/** Zugzeit abgelaufen: das andere Team ist dran, nichts bewegt sich. Die Karten bleiben auf der Hand. */
export function passTurn(match) {
  if (match.winner !== null) return match;
  const next = { ...match, turn: 1 - match.turn };
  if (match.chaos) next.chaos = { ...match.chaos, bonus: false, turns: (match.chaos.turns || 0) + 1 };
  return next;
}

/** Andere Aufstellung — wirkt ab dem nächsten Anstoß (bei einem neuen Match sofort). */
export function withFormations(match, formations) {
  const f = [0, 1].map((t) => (isFormation(formations?.[t]) ? formations[t] : match.formations[t]));
  return { ...match, formations: f };
}
