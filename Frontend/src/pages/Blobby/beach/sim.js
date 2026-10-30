// Beach 3D — Spielrechnung für Blobby auf einem echten Feld.
//
// Läuft NICHT auf dem Server, sondern im Browser des Hosts (beach/hostWorker.js). Der
// Server verwaltet nur Raum, Plätze und Punktestand und vermittelt die Verbindung.
//
// Koordinaten: x entlang des Feldes (Netz bei x = 0, Team 1 auf x < 0, Team 2 auf x > 0),
// z quer dazu, y nach oben (Sand bei y = 0). Einheiten wie im klassischen Blobby
// (Pixel des Originals), damit die Sprunghöhe gleich bleibt.
//
// Das Herzstück ist dieselbe Blob-Form wie im 2D-Spiel: konvexe Hülle aus zwei Kugeln.
// Weil der Blob drehsymmetrisch um die Hochachse ist, reduziert sich jede Abstandsfrage
// auf das bekannte 2D-Problem in der Ebene "Abstand von der Achse / Höhe".
//
// Bewusst LEICHTER als das Original (Wunsch: "einfacher, Ball leichter"):
//   · Der Ball fällt langsamer (BALL_GRAVITATION) — mehr Zeit zum Hinlaufen in 2D-Fläche.
//   · Zielhilfe: Ein Treffer wird ein Stück Richtung gegnerisches Feld gelenkt und geht
//     nie steil in den Sand. In 3D trifft man den Ball selten genau mittig; ohne Hilfe
//     flöge er bei jedem leicht versetzten Treffer seitlich ins Aus.

export const TICK_HZ = 75;
export const TICK_MS = 1000 / TICK_HZ;

export const BLOBBY_HALF_H = 44.5;
export const UPPER_SPHERE = 19;
export const UPPER_RADIUS = 25;
export const LOWER_SPHERE = 13;
export const LOWER_RADIUS = 33;
export const BALL_RADIUS = 38;           // Original 31,5 — größer ist leichter zu treffen und besser zu sehen
// Unsichtbarer Zuschlag nur für Ball gegen Blob: In 3D schätzt man die Tiefe schlecht, ein
// knapp danebengehender Schlag soll trotzdem zählen. Gemessen mit Reaktionszeit-Bot:
// Ball 38 + Zuschlag 16 gibt ~60 % mehr Treffer als vorher (31,5 ohne Zuschlag).
const BLOB_HIT_PAD = 16;
export const NET_RADIUS = 14;
export const NET_TOP = 216;          // wie im Original: 500 - 284

const BLOB_SPEED = 6.2;              // flotter als 4,5: das Feld ist deutlich größer
const JUMP_ACCELERATION = 15.1;
const JUMP_BUFFER = 0.44;
const GRAVITATION = 0.88;
export const BALL_GRAVITATION = 0.16; // Original 0,287 — der Ball schwebt deutlich länger
const NET_DAMPING = 0.85;
const WALL_DAMPING = 0.85;

const BALL_HIT_BASE = 5.5;
const BLOB_MOMENTUM_TRANSFER = 0.75;
const BALL_INCOMING_TRANSFER = 0.2;
const BALL_MIN_HIT_VELOCITY = 5;
const BALL_MAX_HIT_VELOCITY = 16;
// Zielhilfe: so stark wird die waagrechte Flugrichtung zum gegnerischen Feld gezogen
const AIM_ASSIST = 0.45;
const AIM_ASSIST_BACKWARD = 0.7;     // fliegt er nach hinten, deutlich stärker
const MIN_UP = 0.3;                  // senkrechter Anteil der Abflugrichtung mindestens

const SERVE_FRAMES = Math.round(1.2 * TICK_HZ);
const POINT_FRAMES = Math.round(1.1 * TICK_HZ);
const SERVE_BALL_HEIGHT = 280;
const SERVE_BALL_OFFSET = 26;
const TOUCH_RECOUNT_FRAMES = 10;
export const SCORE_TO_WIN = 15;
const WIN_BY = 2;

// ── Powerups (wie im klassischen Modus, Reihenfolge = Index im Schnappschuss) ──
export const POWERUP_TYPES = ["speed", "grow", "shrink", "netHigh", "netLow"];
const POWERUP_Y = 280;               // so hoch, dass man springen muss
const POWERUP_GRAB = 40;
const POWERUP_SPEED_FACTOR = 1.6;
const POWERUP_GROW_SCALE = 1.4;
const POWERUP_SHRINK_SCALE = 0.65;
const POWERUP_NET_SHIFT = 68;
const EFFECT_FRAMES = Math.round(10 * TICK_HZ);
const POWERUP_SPAWN_FRAMES = Math.round(10 * TICK_HZ);
const POWERUP_LIFETIME = Math.round(18 * TICK_HZ);

// Halbe Länge (Grundlinie bis Netz) und halbe Breite
export const COURTS = {
  "1v1": { L: 700, W: 460 },
  "2v2": { L: 840, W: 580 },
};

export const teamOf = (slot) => (slot % 2 === 1 ? 1 : 2);
const otherTeam = (t) => (t === 1 ? 2 : 1);
export const slotsFor = (mode) => (mode === "2v2" ? [1, 2, 3, 4] : [1, 2]);
const groundPlane = (s = 1) => BLOBBY_HALF_H * s;

export function startPos(slot, mode) {
  const { L, W } = COURTS[mode] || COURTS["1v1"];
  const side = teamOf(slot) === 1 ? -1 : 1;
  if (mode !== "2v2") return { x: side * L * 0.45, z: 0 };
  const lane = slot <= 2 ? -1 : 1;
  return { x: side * L * 0.42, z: lane * side * W * 0.42 };
}

// ── Effekte ─────────────────────────────────────────────────────────────────
const hasEffect = (w, type, pred) => w.effects.some((e) => POWERUP_TYPES[e.t] === type && pred(e));

export function netTop(w) {
  let top = NET_TOP;
  if (hasEffect(w, "netHigh", () => true)) top += POWERUP_NET_SHIFT;
  if (hasEffect(w, "netLow", () => true)) top -= POWERUP_NET_SHIFT;
  return top;
}

function blobScale(w, slot) {
  const team = teamOf(slot);
  let s = 1;
  if (hasEffect(w, "grow", (e) => e.team === team)) s *= POWERUP_GROW_SCALE;
  if (hasEffect(w, "shrink", (e) => e.team !== team)) s *= POWERUP_SHRINK_SCALE;
  return s;
}

const speedFactor = (w, slot) => (hasEffect(w, "speed", (e) => e.team === teamOf(slot)) ? POWERUP_SPEED_FACTOR : 1);

function applyEffect(w, t, team) {
  const existing = w.effects.find((e) => e.t === t && e.team === team);
  if (existing) { existing.left = EFFECT_FRAMES; return; }
  const type = POWERUP_TYPES[t];
  if (type === "netHigh" || type === "netLow") {
    w.effects = w.effects.filter((e) => !["netHigh", "netLow"].includes(POWERUP_TYPES[e.t]));
  }
  w.effects.push({ t, team, left: EFFECT_FRAMES });
}

// ── Welt ────────────────────────────────────────────────────────────────────
function serveBall(w) {
  const server = w.serveTeam === 1 ? 1 : 2;
  const p = startPos(server, w.mode);
  const towardNet = w.serveTeam === 1 ? 1 : -1;
  return { x: p.x + towardNet * SERVE_BALL_OFFSET, y: SERVE_BALL_HEIGHT, z: p.z, vx: 0, vy: 0, vz: 0 };
}

export function createWorld(mode, serveTeam = 1, maxTouches = 0, powerups = false) {
  const w = {
    mode: mode === "2v2" ? "2v2" : "1v1",
    maxTouches: maxTouches === 3 ? 3 : 0,
    powerups: !!powerups,
    frame: 0,
    phase: "serve",
    phaseFrames: SERVE_FRAMES,
    serveTeam,
    ball: null,
    ballPrev: { x: 0, y: 0, z: 0 },
    blobs: {},
    touching: {},
    lastTouchFrame: {},
    touches: 0,
    lastHit: 0,
    lastTeam: 0,
    score: { 1: 0, 2: 0 },
    lastScorer: 0,
    pointReason: "",
    winner: 0,
    effects: [],
    powerup: null,            // { t, x, y, z, life }
    held: {},                 // Platz → eingesammelter Typ
    nextPowerupIn: POWERUP_SPAWN_FRAMES,
  };
  resetForServe(w, serveTeam);
  return w;
}

function resetForServe(w, serveTeam) {
  w.phase = "serve";
  w.phaseFrames = SERVE_FRAMES;
  w.serveTeam = serveTeam;
  w.ball = serveBall(w);
  for (const slot of [1, 2, 3, 4]) {
    const p = startPos(slot, w.mode);
    const s = blobScale(w, slot);
    w.blobs[slot] = {
      x: p.x, z: p.z, y: groundPlane(s), vx: 0, vy: 0, vz: 0, s,
      grounded: true, jumpWasDown: false,
    };
    w.touching[slot] = false;
  }
  w.touches = 0;
  w.lastHit = 0;
  w.lastTeam = 0;
  w.lastTouchFrame = {};
}

// ── Blobs ───────────────────────────────────────────────────────────────────
const FROZEN = { dx: 0, dz: 0, jump: false };

function stepBlob(b, inp, speed) {
  const plane = groundPlane(b.s);
  const onSand = b.y <= plane + 0.001;
  const onGround = b.grounded || onSand;
  const freshPress = inp.jump && !b.jumpWasDown;
  const mayJump = inp.jump && onGround && (onSand || freshPress);
  b.jumpWasDown = !!inp.jump;
  b.grounded = false;
  if (mayJump) b.vy = JUMP_ACCELERATION;
  if (inp.jump && b.vy > 0) b.vy += JUMP_BUFFER;

  let dx = Math.sign(inp.dx || 0);
  let dz = Math.sign(inp.dz || 0);
  const len = Math.hypot(dx, dz);
  if (len > 0) { dx /= len; dz /= len; }
  b.vx = dx * BLOB_SPEED * speed;
  b.vz = dz * BLOB_SPEED * speed;
  b.vy -= GRAVITATION;
  b.x += b.vx;
  b.z += b.vz;
  b.y += b.vy;
  if (b.y < plane) { b.y = plane; b.vy = 0; b.grounded = true; }
}

function clampBlob(b, slot, court) {
  const r = LOWER_RADIUS * b.s;
  if (teamOf(slot) === 1) b.x = Math.max(-court.L + r, Math.min(-NET_RADIUS - r, b.x));
  else b.x = Math.max(NET_RADIUS + r, Math.min(court.L - r, b.x));
  b.z = Math.max(-court.W + r, Math.min(court.W - r, b.z));
}

function blobBlob(a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dz);
  const ox = LOWER_RADIUS * (a.s + b.s) - d;
  const oy = BLOBBY_HALF_H * (a.s + b.s) - Math.abs(dy);
  if (ox <= 0 || oy <= 0) return;
  if (oy < ox) {
    const upper = dy > 0 ? b : a;
    upper.y += oy;
    if (upper.vy <= 0) { upper.vy = 0; upper.grounded = true; }
  } else {
    const nx = d > 1e-6 ? dx / d : 1;
    const nz = d > 1e-6 ? dz / d : 0;
    const push = ox / 2;
    a.x -= nx * push; a.z -= nz * push;
    b.x += nx * push; b.z += nz * push;
  }
}

// ── Ball gegen Blob ─────────────────────────────────────────────────────────
// Abstand eines Punktes (r = Abstand zur Hochachse, y = Höhe) zur aufgeblasenen Hülle.
// Dieselbe Rechnung wie blobDistance in Backend/routes/blobbyRoutes.js, nur mit y nach oben.
function hullDistance2D(r, y, cy, s, pad) {
  const ax = 0, ay = cy + UPPER_SPHERE * s, R1 = UPPER_RADIUS * s + pad;
  const bx = 0, by = cy - LOWER_SPHERE * s, R2 = LOWER_RADIUS * s + pad;
  let ux = bx - ax, uy = by - ay;
  const L = Math.hypot(ux, uy) || 1e-6;
  ux /= L; uy /= L;
  const sinA = (R2 - R1) / L;
  const cosA = Math.sqrt(Math.max(0, 1 - sinA * sinA));
  const rx = r - ax, ry = y - ay;
  const along = rx * ux + ry * uy;
  const side = rx * -uy + ry * ux;
  const reach = Math.abs(side) * sinA + along * cosA;
  if (reach <= 0) {
    const d = Math.hypot(rx, ry) || 1e-6;
    return { d: d - R1, nr: rx / d, ny: ry / d };
  }
  if (reach >= L * cosA) {
    const qx = r - bx, qy = y - by;
    const d = Math.hypot(qx, qy) || 1e-6;
    return { d: d - R2, nr: qx / d, ny: qy / d };
  }
  const sg = side < 0 ? -1 : 1;
  const ex = -uy * sg, ey = ux * sg;
  return {
    d: Math.abs(side) * cosA - along * sinA - R1,
    nr: ex * cosA - ux * sinA,
    ny: ey * cosA - uy * sinA,
  };
}

function hullDistance(px, py, pz, b, pad) {
  const hx = px - b.x;
  const hz = pz - b.z;
  let r = Math.hypot(hx, hz);
  let ux = 1, uz = 0;
  if (r > 1e-6) { ux = hx / r; uz = hz / r; } else r = 0;
  const q = hullDistance2D(r, py, b.y, b.s, pad);
  return { d: q.d, nx: q.nr * ux, ny: q.ny, nz: q.nr * uz };
}

function sweep(p0, v, b, pad) {
  let probe = hullDistance(p0.x, p0.y, p0.z, b, pad);
  if (probe.d <= 0) return { t: 0, ...probe };
  const len = Math.hypot(v.x, v.y, v.z);
  if (len < 1e-9) return null;
  let t = 0;
  for (let i = 0; i < 32; i++) {
    t += probe.d / len;
    if (t > 1) return null;
    probe = hullDistance(p0.x + v.x * t, p0.y + v.y * t, p0.z + v.z * t, b, pad);
    if (probe.d <= 0.02) return { t, ...probe };
  }
  return null;
}

// Zielhilfe: waagrechten Anteil der Abflugrichtung zur Mitte des gegnerischen Feldes
// ziehen, Stärke wie in den Konstanten oben. Senkrecht bleibt es beim Treffpunkt — wer
// den Ball oben trifft, spielt hoch, wer ihn seitlich trifft, spielt flach.
function aimAssist(n, ball, slot, court) {
  const oppSide = teamOf(slot) === 1 ? 1 : -1;
  let tx = oppSide * court.L * 0.5 - ball.x;
  let tz = -ball.z * 0.6;
  const tl = Math.hypot(tx, tz) || 1;
  tx /= tl; tz /= tl;
  let ny = Math.max(MIN_UP, n.ny);
  let hx = n.nx, hz = n.nz;
  let hl = Math.hypot(hx, hz);
  // Senkrecht nach oben getroffen: trotzdem ein wenig nach vorn, sonst steht der Ball
  if (hl < 0.15) { hx = tx; hz = tz; hl = 0.15; }
  hx /= hl; hz /= hl;
  const k = hx * tx + hz * tz < 0 ? AIM_ASSIST_BACKWARD : AIM_ASSIST;
  let ax = hx * (1 - k) + tx * k;
  let az = hz * (1 - k) + tz * k;
  const al = Math.hypot(ax, az) || 1;
  ax /= al; az /= al;
  const horiz = Math.sqrt(Math.max(0, 1 - ny * ny));
  // Gesamtlänge 1: waagrecht so viel, wie nach dem Anheben noch übrig ist
  const out = { nx: ax * horiz, ny, nz: az * horiz };
  const len = Math.hypot(out.nx, out.ny, out.nz) || 1;
  return { nx: out.nx / len, ny: out.ny / len, nz: out.nz / len };
}

function endRally(w, scorer, reason) {
  if (w.phase !== "rally") return;
  w.score[scorer] += 1;
  w.lastScorer = scorer;
  w.pointReason = reason;
  w.phase = "point";
  w.phaseFrames = POINT_FRAMES;
  const s = w.score[scorer], o = w.score[otherTeam(scorer)];
  if (s >= SCORE_TO_WIN && s - o >= WIN_BY) w.winner = scorer;
}

function registerTouch(w, slot) {
  const team = teamOf(slot);
  const last = w.lastTouchFrame[slot];
  const rebound = last !== undefined && w.frame - last < TOUCH_RECOUNT_FRAMES;
  w.lastTouchFrame[slot] = w.frame;
  w.lastHit = slot;
  if (rebound && w.lastTeam === team) return;
  if (w.lastTeam !== team) { w.lastTeam = team; w.touches = 0; }
  w.touches += 1;
  if (w.maxTouches > 0 && w.touches > w.maxTouches) endRally(w, otherTeam(team), "touches");
}

function ballBlob(w, slot, court) {
  const ball = w.ball;
  const blob = w.blobs[slot];
  const p0 = w.ballPrev;
  const v = { x: ball.x - p0.x, y: ball.y - p0.y, z: ball.z - p0.z };
  const hit = sweep(p0, v, blob, BALL_RADIUS + BLOB_HIT_PAD);
  const here = hullDistance(ball.x, ball.y, ball.z, blob, BALL_RADIUS + BLOB_HIT_PAD);
  const start = hullDistance(p0.x, p0.y, p0.z, blob, BALL_RADIUS + BLOB_HIT_PAD);
  const blocked = w.touching[slot] && (start.d <= 0.01 || here.d <= 0.01);

  if (hit && !blocked) {
    const cx = p0.x + v.x * hit.t - hit.d * hit.nx;
    const cy = p0.y + v.y * hit.t - hit.d * hit.ny;
    const cz = p0.z + v.z * hit.t - hit.d * hit.nz;
    ball.x = cx; ball.y = cy; ball.z = cz;
    p0.x = cx; p0.y = cy; p0.z = cz;
    const blobClosing = Math.max(0, blob.vx * hit.nx + blob.vy * hit.ny + blob.vz * hit.nz);
    const ballClosing = Math.max(0, -(ball.vx * hit.nx + ball.vy * hit.ny + ball.vz * hit.nz));
    const speed = Math.max(BALL_MIN_HIT_VELOCITY, Math.min(BALL_MAX_HIT_VELOCITY,
      BALL_HIT_BASE + blobClosing * BLOB_MOMENTUM_TRANSFER + ballClosing * BALL_INCOMING_TRANSFER));
    const dir = aimAssist(hit, ball, slot, court);
    ball.vx = dir.nx * speed;
    ball.vy = dir.ny * speed;
    ball.vz = dir.nz * speed;
    ball.x += ball.vx; ball.y += ball.vy; ball.z += ball.vz;
    registerTouch(w, slot);
    w.touching[slot] = true;
    return;
  }
  if (here.d < 0) {
    ball.x -= here.d * here.nx;
    ball.y -= here.d * here.ny;
    ball.z -= here.d * here.nz;
    w.touching[slot] = true;
    return;
  }
  w.touching[slot] = start.d <= 0.01 || here.d <= 0.01;
}

// Netz: eine Wand bei x = 0 über die ganze Breite, oben eine runde Kante
function ballNet(ball, top) {
  const dx = ball.x;
  const dy = ball.y - top;
  const d = Math.hypot(dx, dy);
  if (d < BALL_RADIUS + NET_RADIUS) {
    const nx = d < 1e-6 ? 0 : dx / d;
    const ny = d < 1e-6 ? 1 : dy / d;
    const dot = ball.vx * nx + ball.vy * ny;
    if (dot < 0) {
      ball.vx = (ball.vx - 2 * dot * nx) * NET_DAMPING;
      ball.vy = (ball.vy - 2 * dot * ny) * NET_DAMPING;
      ball.vz *= NET_DAMPING;
    }
    ball.x = nx * (BALL_RADIUS + NET_RADIUS);
    ball.y = top + ny * (BALL_RADIUS + NET_RADIUS);
    return;
  }
  if (ball.y < top) {
    if (ball.x < 0 && ball.x + BALL_RADIUS > -NET_RADIUS) {
      ball.x = -NET_RADIUS - BALL_RADIUS;
      if (ball.vx > 0) ball.vx = -ball.vx * NET_DAMPING;
    } else if (ball.x >= 0 && ball.x - BALL_RADIUS < NET_RADIUS) {
      ball.x = NET_RADIUS + BALL_RADIUS;
      if (ball.vx < 0) ball.vx = -ball.vx * NET_DAMPING;
    }
  }
}

function ballWalls(ball, court) {
  if (ball.x - BALL_RADIUS < -court.L && ball.vx < 0) { ball.x = -court.L + BALL_RADIUS; ball.vx = -ball.vx * WALL_DAMPING; }
  if (ball.x + BALL_RADIUS > court.L && ball.vx > 0) { ball.x = court.L - BALL_RADIUS; ball.vx = -ball.vx * WALL_DAMPING; }
  if (ball.z - BALL_RADIUS < -court.W && ball.vz < 0) { ball.z = -court.W + BALL_RADIUS; ball.vz = -ball.vz * WALL_DAMPING; }
  if (ball.z + BALL_RADIUS > court.W && ball.vz > 0) { ball.z = court.W - BALL_RADIUS; ball.vz = -ball.vz * WALL_DAMPING; }
}

// ── Powerups ────────────────────────────────────────────────────────────────
function stepPowerups(w, slots, court) {
  for (let i = w.effects.length - 1; i >= 0; i--) {
    w.effects[i].left -= 1;
    if (w.effects[i].left <= 0) w.effects.splice(i, 1);
  }
  if (!w.powerups) { w.powerup = null; return; }
  if (!w.powerup) {
    w.nextPowerupIn -= 1;
    if (w.nextPowerupIn <= 0) {
      w.powerup = {
        t: Math.floor(Math.random() * POWERUP_TYPES.length),
        x: 0, y: POWERUP_Y, z: (Math.random() * 2 - 1) * court.W * 0.6,
        life: POWERUP_LIFETIME,
      };
    }
    return;
  }
  const p = w.powerup;
  p.life -= 1;
  if (p.life <= 0) { w.powerup = null; w.nextPowerupIn = POWERUP_SPAWN_FRAMES; return; }
  // Eingesammelt wird nur mit dem eigenen Blob (hochspringen), nicht mit dem Ball
  for (const slot of slots) {
    if (w.held[slot] !== undefined) continue;   // Slot voll: erst einsetzen
    const b = w.blobs[slot];
    const r = Math.hypot(p.x - b.x, p.z - b.z);
    const dy = Math.max(0, Math.abs(p.y - b.y) - BLOBBY_HALF_H * b.s);
    if (Math.hypot(Math.max(0, r - LOWER_RADIUS * b.s), dy) < POWERUP_GRAB) {
      w.held[slot] = p.t;
      w.powerup = null;
      w.nextPowerupIn = POWERUP_SPAWN_FRAMES;
      return;
    }
  }
}

/** Eingesammeltes Powerup zünden. In der Punktpause gesperrt (die Wirkung liefe leer). */
export function zuendePowerup(w, slot) {
  const t = w.held[slot];
  if (t === undefined || w.phase === "point" || w.winner) return false;
  delete w.held[slot];
  applyEffect(w, t, teamOf(slot));
  return true;
}

/**
 * Ein Frame. `inputs[slot] = { dx, dz, jump }` in Weltrichtungen (die Umrechnung aus
 * WASD und Blickrichtung macht der Client). `paused` hält alles an (jemand ist getrennt).
 */
export function stepWorld(w, inputs, paused = false) {
  if (paused || w.winner) return;
  const court = COURTS[w.mode];
  const slots = slotsFor(w.mode);
  w.frame += 1;

  stepPowerups(w, slots, court);

  const listening = w.phase === "rally";
  for (const slot of slots) {
    const b = w.blobs[slot];
    b.s = blobScale(w, slot);
    stepBlob(b, listening ? (inputs[slot] || FROZEN) : FROZEN, speedFactor(w, slot));
    clampBlob(b, slot, court);
  }
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) blobBlob(w.blobs[slots[i]], w.blobs[slots[j]]);
  }
  for (const slot of slots) {
    const b = w.blobs[slot];
    clampBlob(b, slot, court);
    if (b.y < groundPlane(b.s)) { b.y = groundPlane(b.s); b.vy = 0; b.grounded = true; }
  }

  if (w.phase !== "rally") {
    w.phaseFrames -= 1;
    if (w.phaseFrames <= 0) {
      if (w.phase === "serve") w.phase = "rally";
      else resetForServe(w, w.lastScorer || w.serveTeam);
    }
    return;
  }

  const ball = w.ball;
  w.ballPrev.x = ball.x; w.ballPrev.y = ball.y; w.ballPrev.z = ball.z;
  ball.vy -= BALL_GRAVITATION;
  ball.x += ball.vx; ball.y += ball.vy; ball.z += ball.vz;

  for (const slot of slots) ballBlob(w, slot, court);
  if (w.phase !== "rally") return;
  ballNet(ball, netTop(w));
  ballWalls(ball, court);

  if (ball.y - BALL_RADIUS <= 0) {
    ball.y = BALL_RADIUS;
    ball.vx = 0; ball.vy = 0; ball.vz = 0;
    endRally(w, ball.x < 0 ? 2 : 1, "ground");
  }
}

// ── Schnappschuss ───────────────────────────────────────────────────────────
const r1 = (n) => Math.round(n * 10) / 10;
const r2 = (n) => Math.round(n * 100) / 100;

export function encodeSnapshot(w) {
  const pl = {};
  for (const slot of slotsFor(w.mode)) {
    const b = w.blobs[slot];
    // x, y, z, steht, Maßstab, eingesammeltes Powerup (-1 = leer)
    pl[slot] = [r1(b.x), r1(b.y), r1(b.z), b.grounded ? 1 : 0, r2(b.s), w.held[slot] ?? -1];
  }
  const ball = w.ball;
  const p = w.powerup;
  return {
    f: w.frame,
    ph: w.phase,
    pf: w.phaseFrames,
    pr: w.pointReason,
    b: [r1(ball.x), r1(ball.y), r1(ball.z), r2(ball.vx), r2(ball.vy), r2(ball.vz)],
    pl,
    sc: [w.score[1], w.score[2]],
    tc: w.touches,
    lh: w.lastHit,
    wn: w.winner,
    nt: netTop(w),
    pu: p ? [r1(p.x), r1(p.y), r1(p.z), p.t] : null,
    ef: w.effects.map((e) => [e.t, e.team, e.left]),
  };
}

/**
 * Wo landet der Ball, wenn ihn niemand mehr berührt? Reine Flugbahn mit Bande und
 * Netzwand — für den Landepunkt-Ring. Gibt null zurück, wenn er schon liegt.
 */
export function predictLanding(ballIn, mode, top = NET_TOP) {
  const court = COURTS[mode] || COURTS["1v1"];
  const ball = { ...ballIn };
  if (Math.abs(ball.vx) + Math.abs(ball.vy) + Math.abs(ball.vz) < 0.01) return null;
  for (let i = 0; i < 600; i++) {
    ball.vy -= BALL_GRAVITATION;
    ball.x += ball.vx; ball.y += ball.vy; ball.z += ball.vz;
    if (ball.y < top && Math.abs(ball.x) < BALL_RADIUS + NET_RADIUS) {
      ball.x = ball.x < 0 ? -NET_RADIUS - BALL_RADIUS : NET_RADIUS + BALL_RADIUS;
      ball.vx = -ball.vx * NET_DAMPING;
    }
    ballWalls(ball, court);
    if (ball.y - BALL_RADIUS <= 0) return { x: ball.x, z: ball.z, frames: i + 1 };
  }
  return null;
}
