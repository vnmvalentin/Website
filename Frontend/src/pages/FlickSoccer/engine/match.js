// engine/match.js — Spielregeln: wer ist am Zug, Tore, Anstoß, Sieg. Reine Funktionen auf einem serialisierbaren
// Match-Objekt; dieselben Regeln laufen lokal (KI, zu zweit) und auf dem Server (online).
//
// Ablauf wie im Original: Ein Zug = ein Schuss mit einer eigenen Scheibe, danach ist das andere Team dran. Nach einem
// Tor stellen sich beide Teams neu auf, das Team, das das Tor kassiert hat, hat Anstoß. Wer zuerst `goalsToWin` Tore
// hat, gewinnt.
//
// Chaos-Modus (settings.chaos): Jeder Zug bringt dem Team am Zug ein Power-up (powerups.js). match.chaos zählt, wie
// viele Power-up-Züge jedes Team schon hatte — daraus ergibt sich das nächste aus der Folge dieses Teams.

import { RULES, TEAM_SIZE } from './constants.js';
import { formationSpots, isFormation, DEFAULT_FORMATION } from './formations.js';
import { DEFAULT_FIELD, getField, isField } from './fields.js';
import { powerupAt } from './powerups.js';
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
    chaos: settings.chaos === true, // Power-ups, standardmäßig aus
  };
}

/** seed: Zufall für die Power-up-Folge des Chaos-Modus (online vom Server, sonst gewürfelt). */
export function createMatch({ settings, formations, startingTeam = 0, seed } = {}) {
  const f = [0, 1].map((t) => (isFormation(formations?.[t]) ? formations[t] : DEFAULT_FORMATION));
  const s = normalizeSettings(settings);
  return {
    settings: s,
    formations: f,
    score: [0, 0],
    turn: startingTeam === 1 ? 1 : 0,
    state: kickoffState(f, s.field),
    winner: null,
    shotCount: 0,
    chaos: s.chaos
      ? { seed: Number.isFinite(seed) ? seed >>> 0 : Math.floor(Math.random() * 0x7fffffff), used: [0, 0], bonus: false }
      : null,
  };
}

/** Power-up des Teams, das gerade am Zug ist — oder null (kein Chaos, Spiel vorbei, Bonus-Schuss ohne Power-up). */
export function currentPowerup(match) {
  if (!match?.chaos || match.winner !== null || match.chaos.bonus) return null;
  return powerupAt(match.chaos.seed, match.chaos.used[match.turn], match.turn);
}

/** Power-up, das `team` in seinem nächsten regulären Zug bekommt (für die Anzeige beim Gegner). */
export function upcomingPowerup(match, team) {
  if (!match?.chaos || match.winner !== null) return null;
  return powerupAt(match.chaos.seed, match.chaos.used[team], team);
}

/** Scheiben-Index → Team; die ersten TEAM_SIZE gehören Team 0. */
export function pieceTeam(index) {
  return index < TEAM_SIZE ? 0 : 1;
}

/** Prüft und normalisiert einen Schuss von `team`. Liefert null, wenn er nicht erlaubt ist. */
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
  return { piece, sx, sy };
}

/**
 * Wendet das Ergebnis einer Simulation an (Tor, Zugwechsel, Sieg). Gibt ein neues Match zurück.
 * power: das Power-up, mit dem dieser Schuss gespielt wurde (currentPowerup VOR dem Schuss) oder null.
 */
export function applyResult(match, result, power = null) {
  const next = { ...match, score: [...match.score], shotCount: match.shotCount + 1 };
  let again = false;
  if (match.chaos) {
    const used = [...match.chaos.used];
    if (!match.chaos.bonus) used[match.turn] += 1; // ein Bonus-Schuss verbraucht kein Power-up
    again = power === 'doppel';
    next.chaos = { ...match.chaos, used, bonus: false };
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
  if (again) next.chaos.bonus = true; // Doppelschuss: dasselbe Team nochmal, ohne Power-up
  else next.turn = 1 - match.turn;
  return next;
}

/** Schuss ausführen: prüfen, simulieren, Regeln anwenden. Liefert { shot, power, result, match } oder null. */
export function playShot(match, team, rawShot) {
  const shot = sanitizeShot(match, team, rawShot);
  if (!shot) return null;
  const power = currentPowerup(match);
  const result = simulateShot(match.state, shot, power ? { power, team } : null);
  return { shot, power, result, match: applyResult(match, result, power) };
}

/** Zugzeit abgelaufen: das andere Team ist dran, nichts bewegt sich. Ein ungenutztes Power-up verfällt. */
export function passTurn(match) {
  if (match.winner !== null) return match;
  const next = { ...match, turn: 1 - match.turn };
  if (match.chaos) {
    const used = [...match.chaos.used];
    if (!match.chaos.bonus) used[match.turn] += 1;
    next.chaos = { ...match.chaos, used, bonus: false };
  }
  return next;
}

/** Andere Aufstellung — wirkt ab dem nächsten Anstoß (bei einem neuen Match sofort). */
export function withFormations(match, formations) {
  const f = [0, 1].map((t) => (isFormation(formations?.[t]) ? formations[t] : match.formations[t]));
  return { ...match, formations: f };
}
