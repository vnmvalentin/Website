// Ego-Volleyball — Spielrechnung für Blobby aus der Ich-Sicht auf einem echten Feld.
// (Ordner und Einstellungswert heißen weiter "beach": Das Feld hat "Beach 3D" ersetzt, und
// der Server kennt den Wert aus gespeicherten Räumen.)
//
// Läuft NICHT auf dem Server, sondern im Browser des Hosts (beach/hostWorker.js). Der
// Server verwaltet nur Raum, Plätze und Punktestand und vermittelt die Verbindung.
//
// Koordinaten: x entlang des Feldes (Netz bei x = 0, Team 1 auf x < 0, Team 2 auf x > 0),
// z quer dazu, y nach oben (Sand bei y = 0). Einheiten wie im klassischen Blobby
// (Pixel des Originals), damit die Sprunghöhe gleich bleibt.
//
// Blick: yaw = Drehung um die Hochachse (0 schaut nach +x, wächst nach rechts = +z),
// pitch = nach oben positiv. Vorwärts ist (cos yaw · cos pitch, sin pitch, sin yaw · cos pitch).
//
// Die Regel, die das Spiel trägt: DER BALL FLIEGT DORTHIN, WO MAN HINSCHAUT.
//   · Schlag (Linksklick): hart in Blickrichtung, im Sprung härter (Schmettern).
//   · Zuspiel (Rechtsklick): hoch und ein Stück nach vorn — für sich selbst oder den Partner.
//   · Ohne Klick passiert nichts: Der Ball fliegt durch den Körper hindurch. Gespielt wird
//     nur mit Schlägen — so entscheidet immer der Blick, nie ein zufälliger Treffpunkt.
//   · Ein Schlag im Sprung VOR der Angriffslinie ist ein Schmetterball: schneller und mit
//     Vorwärtsdrall — der Ball taucht hinter dem Netz ab, statt bis an die Rückwand zu fliegen.
// Ein Klick öffnet ein kurzes Zeitfenster (SWING_FRAMES) mit großer Reichweite: Man muss
// nicht auf den Frame genau treffen, und ein Klick, der beim Host etwas später ankommt,
// zählt trotzdem.
//
// Der Ball fällt langsam (BALL_GRAVITATION) — in der Ich-Sicht braucht man die Zeit, um ihn
// zu finden und hinzulaufen. Die Blob-Form ist dieselbe wie im 2D-Spiel (konvexe Hülle aus
// zwei Kugeln); weil sie drehsymmetrisch um die Hochachse ist, reduziert sich jede
// Abstandsfrage auf das 2D-Problem "Abstand von der Achse / Höhe".

export const TICK_HZ = 75;
export const TICK_MS = 1000 / TICK_HZ;

export const BLOBBY_HALF_H = 44.5;
export const UPPER_SPHERE = 19;
export const UPPER_RADIUS = 25;
export const LOWER_SPHERE = 13;
export const LOWER_RADIUS = 33;
export const BALL_RADIUS = 38;           // Original 31,5 — größer ist leichter zu treffen und besser zu sehen
// Reichweite eines Schlags über die Körperhülle hinaus (Arme, die man nicht sieht)
const REACH_PAD = 92;
export const NET_RADIUS = 14;
export const NET_TOP = 216;          // wie im Original: 500 - 284

const BLOB_SPEED = 7.2;              // flotter als im Original (4,5): das Feld ist viel größer
const JUMP_ACCELERATION = 17;        // höher als im Original (15,1): Man soll über das Netz schauen können
const JUMP_BUFFER = 0.44;
const GRAVITATION = 0.88;
export const BALL_GRAVITATION = 0.16; // Original 0,287 — der Ball schwebt deutlich länger
const NET_DAMPING = 0.85;
const WALL_DAMPING = 0.85;

// Hechtsprung: kurzer Schub in Laufrichtung (ohne Laufrichtung: in Blickrichtung)
const DASH_SPEED = 19;
const DASH_FRAMES = 11;
export const DASH_COOLDOWN = 68;
// Schlagfenster nach einem Klick und Pause bis zum nächsten
const SWING_FRAMES = 12;
const SWING_COOLDOWN = 22;
// Ein Klick kurz vor Ende der Pause wird gemerkt und danach ausgeführt
const SWING_QUEUE = 10;

// Schlag und Zuspiel
export const HIT_SPEED = 12.5;
export const SPIKE_SPEED = 17;     // Schlag im Sprung
const HIT_RUN_BONUS = 0.35;          // Anlauf in Schlagrichtung zählt mit …
const HIT_RUN_MAX = 2.5;             // … bis zu diesem Zuschlag
const HIT_LIFT = 0.16;               // kleiner Auftrieb, damit "geradeaus" nicht sofort im Sand landet
const SPIKE_AIR = 30;                // so hoch über dem Stand gilt ein Schlag als Sprungschlag
// Schmetterball: Der Ball fällt mit Drall schneller, bis ihn wieder jemand spielt. Ohne
// Drall fliegt er bei der geringen Ballschwerkraft fast geradeaus an die Rückwand — man
// müsste steil nach unten zielen. Eine zusätzliche Neigung nach unten hat sich NICHT
// bewährt (gemessen: fast alle Schmetterbälle im Netz), der Drall allein genügt.
export const SPIN_GRAVITY = 2.6;
// Geschmettert wird nur vorn, zwischen Netz und Angriffslinie (Anteil der halben Feldlänge).
// Von weiter hinten käme ein Ball mit Drall nicht mehr übers Netz.
export const ATTACK_ZONE = 0.4;
export const SET_SPEED = 11.5;
const SET_FORWARD = 0.3;

const SERVE_FRAMES = Math.round(0.8 * TICK_HZ);
const POINT_FRAMES = Math.round(1.1 * TICK_HZ);
// Aufschlag: Der Ball schwebt vor dem Aufschläger, bis ihn jemand berührt — spätestens
// nach dieser Zeit fällt er von selbst (lang genug, um vorher noch das Menü zu schließen).
const SERVE_HOVER_FRAMES = Math.round(12 * TICK_HZ);
const SERVE_BALL_HEIGHT = 140;       // aus dem Stand zu schlagen, im Sprung zu schmettern
const SERVE_BALL_OFFSET = 110;       // weit genug vorn, dass er nicht das halbe Bild verdeckt
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
  "1v1": { L: 880, W: 540 },
  "2v2": { L: 1040, W: 700 },
};

export const teamOf = (slot) => (slot % 2 === 1 ? 1 : 2);
const otherTeam = (t) => (t === 1 ? 2 : 1);
export const slotsFor = (mode) => (mode === "2v2" ? [1, 2, 3, 4] : [1, 2]);
const groundPlane = (s = 1) => BLOBBY_HALF_H * s;
/** Blick beim Start: übers Netz */
export const startYaw = (slot) => (teamOf(slot) === 1 ? 0 : Math.PI);

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
    blobs: {},
    lastTouchFrame: {},
    touches: 0,
    lastHit: 0,
    lastTeam: 0,
    hover: 0,                 // > 0: Ball schwebt noch (Aufschlag)
    ev: [0, 0, 0],            // letzte Ballberührung: [laufende Nummer, Art, Platz] — für Ton und Wackler
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
  w.hover = SERVE_HOVER_FRAMES;
  for (const slot of [1, 2, 3, 4]) {
    const p = startPos(slot, w.mode);
    const s = blobScale(w, slot);
    const old = w.blobs[slot];
    w.blobs[slot] = {
      x: p.x, z: p.z, y: groundPlane(s), vx: 0, vy: 0, vz: 0, s,
      grounded: true, jumpWasDown: false,
      // Blick bleibt über den Punkt hinweg erhalten — sonst springt bei anderen kurz die Figur
      yaw: old ? old.yaw : startYaw(slot), pitch: old ? old.pitch : 0,
      // Zähler der Klicks: Der Client zählt hoch, gerechnet wird beim Wechsel. So geht auf
      // der verlustbehafteten Leitung kein Klick verloren (der Stand wird wiederholt).
      hitSeen: old ? old.hitSeen : undefined, dashSeen: old ? old.dashSeen : undefined,
      swing: 0, swingLeft: 0, swingCool: 0, swingDone: false, queued: 0, queuedLeft: 0,
      dashLeft: 0, dashCool: 0, dashX: 0, dashZ: 0,
    };
  }
  w.touches = 0;
  w.lastHit = 0;
  w.lastTeam = 0;
  w.lastTouchFrame = {};
}

// ── Blobs ───────────────────────────────────────────────────────────────────
const clampNum = (v, lo, hi) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : 0);

function stepBlob(b, inp, speed, frozen) {
  // Blick gilt immer, auch in der Punktpause
  if (inp) {
    if (Number.isFinite(inp.yaw)) b.yaw = clampNum(inp.yaw, -1e4, 1e4);
    if (Number.isFinite(inp.pitch)) b.pitch = clampNum(inp.pitch, -1.5, 1.5);
  }
  if (b.swingCool > 0) b.swingCool -= 1;
  if (b.swingLeft > 0) b.swingLeft -= 1;
  if (b.queuedLeft > 0) b.queuedLeft -= 1;
  if (b.dashCool > 0) b.dashCool -= 1;

  const live = !!inp && !frozen;
  let dx = live ? clampNum(inp.dx, -1, 1) : 0;
  let dz = live ? clampNum(inp.dz, -1, 1) : 0;
  const len = Math.hypot(dx, dz);
  if (len > 1) { dx /= len; dz /= len; }
  const jump = live && !!inp.jump;

  if (inp) {
    const hc = inp.hc | 0;
    if (b.hitSeen !== undefined && hc !== b.hitSeen && live) {
      b.queued = inp.hk === 2 ? 2 : 1;
      b.queuedLeft = SWING_QUEUE;
    }
    b.hitSeen = hc;
    if (b.queuedLeft > 0 && live && b.swingCool <= 0) {
      b.swing = b.queued;
      b.swingLeft = SWING_FRAMES;
      b.swingCool = SWING_COOLDOWN;
      b.swingDone = false;
      b.queuedLeft = 0;
    }
    const dc = inp.dc | 0;
    if (b.dashSeen !== undefined && dc !== b.dashSeen && live && b.dashCool <= 0) {
      b.dashLeft = DASH_FRAMES;
      b.dashCool = DASH_COOLDOWN;
      if (len > 0.1) { b.dashX = dx / len; b.dashZ = dz / len; }
      else { b.dashX = Math.cos(b.yaw); b.dashZ = Math.sin(b.yaw); }
    }
    b.dashSeen = dc;
  }

  const plane = groundPlane(b.s);
  const onSand = b.y <= plane + 0.001;
  const onGround = b.grounded || onSand;
  const freshPress = jump && !b.jumpWasDown;
  const mayJump = jump && onGround && (onSand || freshPress);
  b.jumpWasDown = jump;
  b.grounded = false;
  if (mayJump) b.vy = JUMP_ACCELERATION;
  if (jump && b.vy > 0) b.vy += JUMP_BUFFER;

  if (b.dashLeft > 0 && !frozen) {
    b.dashLeft -= 1;
    b.vx = b.dashX * DASH_SPEED;
    b.vz = b.dashZ * DASH_SPEED;
  } else {
    b.dashLeft = 0;
    b.vx = dx * BLOB_SPEED * speed;
    b.vz = dz * BLOB_SPEED * speed;
  }
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

const lookDir = (b) => {
  const c = Math.cos(b.pitch);
  return { x: Math.cos(b.yaw) * c, y: Math.sin(b.pitch), z: Math.sin(b.yaw) * c };
};

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

// Art: 1 Schlag, 2 Zuspiel, 3 Schmetterschlag
function touched(w, slot, kind) {
  w.hover = 0;
  w.ev = [w.ev[0] + 1, kind, slot];
  registerTouch(w, slot);
}

/** Steht der Ball in Schlagreichweite dieses Blobs? (auch für Bot und Anzeige) */
export function inReach(ball, blob) {
  return hullDistance(ball.x, ball.y, ball.z, blob, BALL_RADIUS + REACH_PAD).d <= 0;
}

// Schlag oder Zuspiel im offenen Zeitfenster. true = Ball wurde gespielt.
function swingHit(w, slot) {
  const blob = w.blobs[slot];
  if (blob.swingLeft <= 0 || blob.swingDone) return false;
  const ball = w.ball;
  if (!inReach(ball, blob)) return false;
  blob.swingDone = true;
  ball.spin = false;
  let kind = blob.swing;
  if (kind === 2) {
    const fx = Math.cos(blob.yaw) * SET_FORWARD;
    const fz = Math.sin(blob.yaw) * SET_FORWARD;
    const l = Math.hypot(fx, 1, fz);
    ball.vx = (fx / l) * SET_SPEED;
    ball.vy = (1 / l) * SET_SPEED;
    ball.vz = (fz / l) * SET_SPEED;
  } else {
    const f = lookDir(blob);
    const air = blob.y > groundPlane(blob.s) + SPIKE_AIR
      && Math.abs(blob.x) < COURTS[w.mode].L * ATTACK_ZONE;
    const run = Math.max(0, Math.min(HIT_RUN_MAX, (blob.vx * f.x + blob.vz * f.z) * HIT_RUN_BONUS));
    const speed = (air ? SPIKE_SPEED : HIT_SPEED) + run;
    let dy = f.y + HIT_LIFT;
    if (air) {
      kind = 3;
      ball.spin = true;
      dy = f.y;
    }
    const l = Math.hypot(f.x, dy, f.z) || 1;
    ball.vx = (f.x / l) * speed;
    ball.vy = (dy / l) * speed;
    ball.vz = (f.z / l) * speed;
  }
  touched(w, slot, kind);
  return true;
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
 * Ein Frame. `inputs[slot] = { dx, dz, jump, yaw, pitch, hc, hk, dc }`: dx/dz in
 * Weltrichtungen (die Umrechnung aus WASD und Blick macht der Client), hc = Klickzähler
 * mit hk = Art (1 Schlag, 2 Zuspiel), dc = Zähler für den Hechtsprung.
 * `paused` hält alles an (jemand ist getrennt).
 */
export function stepWorld(w, inputs, paused = false) {
  if (paused || w.winner) return;
  const court = COURTS[w.mode];
  const slots = slotsFor(w.mode);
  w.frame += 1;

  stepPowerups(w, slots, court);

  // In der Punktpause steht man; beim Aufschlag darf man sich schon bewegen
  const frozen = w.phase === "point";
  for (const slot of slots) {
    const b = w.blobs[slot];
    b.s = blobScale(w, slot);
    stepBlob(b, inputs[slot], speedFactor(w, slot), frozen);
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
  if (w.hover > 0) {
    w.hover -= 1;
  } else {
    ball.vy -= BALL_GRAVITATION * (ball.spin ? SPIN_GRAVITY : 1);
    ball.x += ball.vx; ball.y += ball.vy; ball.z += ball.vz;
  }

  for (const slot of slots) swingHit(w, slot);
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
    // x, y, z, steht, Maßstab, eingesammeltes Powerup (-1 = leer), Blick (yaw, pitch),
    // laufender Schlag (0 = keiner), Frames bis zum nächsten Hechtsprung
    pl[slot] = [
      r1(b.x), r1(b.y), r1(b.z), b.grounded ? 1 : 0, r2(b.s), w.held[slot] ?? -1,
      r2(b.yaw), r2(b.pitch), b.swingLeft > 0 ? b.swing : 0, b.dashCool,
    ];
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
    hv: w.hover > 0 ? 1 : 0,
    ev: w.ev,
    wn: w.winner,
    nt: netTop(w),
    pu: p ? [r1(p.x), r1(p.y), r1(p.z), p.t] : null,
    ef: w.effects.map((e) => [e.t, e.team, e.left]),
  };
}

/**
 * Wo landet der Ball, wenn ihn niemand mehr berührt? Reine Flugbahn mit Bande und
 * Netzwand — für den Übungs-Bot. Gibt null zurück, wenn der Ball liegt oder schwebt.
 */
export function predictLanding(ballIn, mode, top = NET_TOP) {
  const court = COURTS[mode] || COURTS["1v1"];
  const ball = { ...ballIn };
  if (Math.abs(ball.vx) + Math.abs(ball.vy) + Math.abs(ball.vz) < 0.01) return null;
  const g = BALL_GRAVITATION * (ball.spin ? SPIN_GRAVITY : 1);
  for (let i = 0; i < 900; i++) {
    ball.vy -= g;
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
