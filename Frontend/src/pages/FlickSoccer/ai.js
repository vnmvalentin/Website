// ai.js — Computergegner. Erzeugt Schuss-Kandidaten (Ball aufs Tor spielen, Ball wegschlagen, ein paar Zufallsschüsse),
// rechnet jeden mit der echten Engine durch und nimmt den besten. Die Schwierigkeit steuert, wie viele Kandidaten er
// prüft und wie stark er beim Ausführen „verzieht".

import { PIECE, BALL, TEAM_SIZE, getField, simulateShot } from './engine/index.js';

export const AI_LEVELS = Object.freeze({
  easy: { label: 'Leicht', aimNoise: 0.16, powerNoise: 0.25, randomShots: 1, targets: 1 },
  medium: { label: 'Mittel', aimNoise: 0.06, powerNoise: 0.12, randomShots: 2, targets: 3 },
  hard: { label: 'Schwer', aimNoise: 0.012, powerNoise: 0.04, randomShots: 4, targets: 5 },
});

const unit = (x, y) => {
  const l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
};

/** Bewertet einen Ruhezustand aus Sicht von `team` (höher = besser). */
function evaluate(result, team, before) {
  const FIELD = getField(before.field);
  if (result.goal === team) return 100000;
  if (result.goal === 1 - team) return -100000;
  const { ball, pieces } = result.state;
  const dir = team === 0 ? 1 : -1;
  // Fortschritt: wie weit der Ball Richtung gegnerisches Tor steht (0 … 1)
  const progress = team === 0 ? ball.x / FIELD.W : 1 - ball.x / FIELD.W;
  let score = progress * 120;
  // Gefahr am eigenen Tor: Ball nah am eigenen Tormund
  const ownGoalX = team === 0 ? 0 : FIELD.W;
  const dOwn = Math.hypot(ball.x - ownGoalX, ball.y - FIELD.H / 2);
  if (dOwn < 330) score -= (330 - dOwn) * 0.5;
  // Torwart: irgendeine eigene Scheibe sollte den Tormund decken
  const guard = pieces.some((p, i) => (i < TEAM_SIZE) === (team === 0) &&
    Math.abs(p.x - ownGoalX) < 120 && Math.abs(p.y - FIELD.H / 2) < 110);
  if (!guard) score -= 40;
  // Ball gar nicht berührt → schwacher Zug
  if (Math.hypot(ball.x - before.ball.x, ball.y - before.ball.y) < 1) score -= 35;
  // Gegner hat danach freie Bahn? Grob: wie nah steht die nächste gegnerische Scheibe HINTER dem Ball (aus seiner Sicht)
  let threat = 0;
  pieces.forEach((p, i) => {
    if ((i < TEAM_SIZE) === (team === 0)) return;
    const behind = (p.x - ball.x) * dir > 0; // Gegner steht zwischen Ball und unserem Gegnertor → kann zurückspielen
    const d = Math.hypot(p.x - ball.x, p.y - ball.y);
    if (behind && d < 260) threat = Math.max(threat, (260 - d) / 260);
  });
  score -= threat * 30 * (1 - progress);
  return score;
}

function candidates(state, team, level) {
  const FIELD = getField(state.field);
  const gw = FIELD.GOAL_W;
  const out = [];
  const base = team === 0 ? 0 : TEAM_SIZE;
  const { ball } = state;
  const goalX = team === 0 ? FIELD.W + FIELD.GOAL_D * 0.5 : -FIELD.GOAL_D * 0.5;
  const ys = [0, -0.3, 0.3, -0.15, 0.15].map((k) => FIELD.H / 2 + k * gw).slice(0, level.targets);
  for (let k = 0; k < TEAM_SIZE; k++) {
    const piece = base + k;
    const p = state.pieces[piece];
    // Ball Richtung Tor: Treffpunkt hinter dem Ball anvisieren
    for (const ty of ys) {
      const [ux, uy] = unit(goalX - ball.x, ty - ball.y);
      const cx = ball.x - ux * (PIECE.R + BALL.R);
      const cy = ball.y - uy * (PIECE.R + BALL.R);
      const [dx, dy] = unit(cx - p.x, cy - p.y);
      for (const power of [0.6, 0.85, 1]) out.push({ piece, sx: dx * power, sy: dy * power });
    }
    // Ball direkt anspielen (Befreiungsschlag)
    const [bx, by] = unit(ball.x - p.x, ball.y - p.y);
    out.push({ piece, sx: bx, sy: by });
    out.push({ piece, sx: bx * 0.55, sy: by * 0.55 });
    // ein paar Zufallsschüsse, damit er nicht immer gleich spielt
    for (let r = 0; r < level.randomShots; r++) {
      const a = Math.random() * Math.PI * 2;
      const pw = 0.4 + Math.random() * 0.6;
      out.push({ piece, sx: Math.cos(a) * pw, sy: Math.sin(a) * pw });
    }
  }
  return out;
}

/** Bester Schuss für `team` im Ruhezustand `state`. */
export function chooseShot(state, team, levelId = 'medium', mods = null) {
  const level = AI_LEVELS[levelId] || AI_LEVELS.medium;
  let best = null;
  let bestScore = -Infinity;
  for (const c of candidates(state, team, level)) {
    const s = evaluate(simulateShot(state, c, mods), team, state) + Math.random() * 6;
    if (s > bestScore) {
      bestScore = s;
      best = c;
    }
  }
  if (!best) return null;
  // Ungenauigkeit beim Ausführen
  const ang = Math.atan2(best.sy, best.sx) + (Math.random() * 2 - 1) * level.aimNoise;
  const pw = Math.min(1, Math.max(0.15, Math.hypot(best.sx, best.sy) * (1 + (Math.random() * 2 - 1) * level.powerNoise)));
  return { piece: best.piece, sx: Math.cos(ang) * pw, sy: Math.sin(ang) * pw };
}
