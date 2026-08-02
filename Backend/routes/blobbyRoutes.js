// backend/routes/blobbyRoutes.js
// Blobby Volley online: Blobs, ein Pfeiler in der Mitte, ein Ball. Spieler treten per
// Link-Code bei (gleicher Ablauf wie Connect4), die Physik läuft server-autoritativ mit
// 75 Hz und wird als Schnappschuss verteilt.
//
// Die Konstanten und die Reihenfolge der Rechenschritte sind aus Blobby Volley 2
// übernommen (GameConstants.h / PhysicWorld::step) — deshalb fühlt sich das Spiel genau
// wie das Original an: fester Sprungimpuls mit "Halten = höher", und ein Ballabpraller
// mit FESTER Geschwindigkeit in Richtung Blob-Mittelpunkt → Blob-Mitte weg. Die
// Blobgeschwindigkeit geht bewusst NICHT in den Abpraller ein; gesteuert wird über die
// Stelle, an der man den Ball trifft.
//
// Erweiterungen gegenüber dem Original (alle über die Raumeinstellungen steuerbar):
//   · 2v2 auf breiterem Feld
//   · Blobs dürfen über den Pfeiler auf die andere Seite und stoßen sich gegenseitig an
//   · Berührungslimit abschaltbar
//   · Powerups, die über dem Pfeiler schweben

// ── Weltmaße (Originalkoordinaten, y zeigt nach unten) ──────────────────────
const WORLD_H = 600;
const GROUND_Y = 500;              // Sandoberkante — hier endet der Ballwechsel
const FIELD_W = { "1v1": 800, "2v2": 1200 };

// ── Blob ────────────────────────────────────────────────────────────────────
const BLOBBY_HEIGHT = 89;
const BLOBBY_HALF_H = BLOBBY_HEIGHT / 2;
const BLOBBY_UPPER_SPHERE = 19;    // Abstand Mittelpunkt → obere Kugel
const BLOBBY_UPPER_RADIUS = 25;
const BLOBBY_LOWER_SPHERE = 13;    // Abstand Mittelpunkt → untere Kugel
const BLOBBY_LOWER_RADIUS = 33;

// ── Ball ────────────────────────────────────────────────────────────────────
const BALL_RADIUS = 31.5;
const STANDARD_BALL_HEIGHT = 269 + BALL_RADIUS;

// ── Pfeiler / Netz ──────────────────────────────────────────────────────────
// Etwas breiter als im Original (dort 7): erst dadurch ist die Kante ein Absatz, auf
// dem ein Blob wirklich stehen bleibt, statt sofort herunterzurutschen.
const NET_RADIUS = 14;
const NET_BASE_TOP = 284;          // y der Pfeilerkante ohne Powerup
const NET_DAMPING = 0.85;          // Kante schluckt etwas Tempo

// ── Bewegung ────────────────────────────────────────────────────────────────
const BLOBBY_SPEED = 4.5;
const BLOBBY_JUMP_ACCELERATION = 15.1;
const BLOBBY_JUMP_BUFFER = 0.44;   // solange Sprung gehalten wird und es aufwärts geht
const GRAVITATION = 0.88;
const BALL_GRAVITATION = 0.287;
const BALL_COLLISION_VELOCITY = 13.125;

// ── Powerups ────────────────────────────────────────────────────────────────
// Reihenfolge ist Protokoll: im Schnappschuss geht nur der Index raus.
const POWERUP_TYPES = ["speed", "grow", "shrink", "netHigh", "netLow"];
const POWERUP_RADIUS = 21;
const POWERUP_ABOVE_NET = 124;     // Schwebehöhe über der Pfeilerkante
const POWERUP_SPEED_FACTOR = 1.65;
const POWERUP_GROW_SCALE = 1.4;
const POWERUP_SHRINK_SCALE = 0.65;
const POWERUP_NET_SHIFT = 68;      // um so viel wandert die Kante hoch bzw. runter

// ── Regeln & Takt ───────────────────────────────────────────────────────────
const TICK_HZ = 75;                // Originaltakt von Blobby Volley
const TICK_MS = 1000 / TICK_HZ;
const SNAPSHOT_EVERY = 2;          // jeder 2. Frame geht raus → ~37,5 Hz
const SCORE_TO_WIN = 15;
const WIN_BY = 2;
const SERVE_FRAMES = Math.round(1.2 * TICK_HZ);   // Ball hängt vor dem Aufschlag
const POINT_FRAMES = Math.round(1.1 * TICK_HZ);   // Pause nach einem Punkt
const EFFECT_FRAMES = Math.round(10 * TICK_HZ);   // Wirkdauer eines Powerups
const POWERUP_SPAWN_FRAMES = Math.round(10 * TICK_HZ);
const POWERUP_LIFETIME = Math.round(18 * TICK_HZ);

// ── Raumverwaltung ──────────────────────────────────────────────────────────
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // ohne I/O/0/1
const RECONNECT_GRACE_MS = 2 * 60 * 1000;
const STALE_SWEEP_MS = 5 * 60 * 1000;
const STALE_AFTER_MS = 30 * 60 * 1000;

const games = new Map();       // code -> game
const socketIndex = new Map(); // socket.id -> { code, role, slot }

function generateCode() {
  let code;
  do {
    code = Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");
  } while (games.has(code));
  return code;
}

// Ungerade Plätze spielen links, gerade rechts — wer als Zweiter kommt, landet also
// automatisch im anderen Team.
const teamOf = (slot) => (slot % 2 === 1 ? 1 : 2);
const otherTeam = (team) => (team === 1 ? 2 : 1);

function defaultSettings() {
  return { mode: "1v1", crossNet: true, maxTouches: 0, powerups: false };
}

function sanitizeSettings(raw = {}, prev = defaultSettings()) {
  const mode = raw.mode === "2v2" || raw.mode === "1v1" ? raw.mode : prev.mode;
  return {
    mode,
    crossNet: typeof raw.crossNet === "boolean" ? raw.crossNet : prev.crossNet,
    maxTouches: Number(raw.maxTouches) === 3 ? 3 : 0,   // 0 = unbegrenzt
    powerups: typeof raw.powerups === "boolean" ? raw.powerups : prev.powerups,
  };
}

const slotsFor = (settings) => (settings.mode === "2v2" ? [1, 2, 3, 4] : [1, 2]);

// Startplätze: im 1v1 je ein Viertel neben dem Pfeiler, im 2v2 einer vorn, einer hinten
function slotStartX(slot, settings) {
  const netX = FIELD_W[settings.mode] / 2;
  const frac = settings.mode === "2v2" ? (slot <= 2 ? 0.36 : 0.8) : 0.5;
  const dist = netX * frac;
  return teamOf(slot) === 1 ? netX - dist : netX + dist;
}

// ── Effekte & abgeleitete Werte ─────────────────────────────────────────────

const hasEffect = (w, type, pred) =>
  w.effects.some((e) => POWERUP_TYPES[e.t] === type && pred(e));

function netTopY(w) {
  let top = NET_BASE_TOP;
  if (hasEffect(w, "netHigh", () => true)) top -= POWERUP_NET_SHIFT;
  if (hasEffect(w, "netLow", () => true)) top += POWERUP_NET_SHIFT;
  return top;
}

function blobScale(w, slot) {
  const team = teamOf(slot);
  let s = 1;
  if (hasEffect(w, "grow", (e) => e.team === team)) s *= POWERUP_GROW_SCALE;
  if (hasEffect(w, "shrink", (e) => e.team !== team)) s *= POWERUP_SHRINK_SCALE;
  return s;
}

const blobSpeedFactor = (w, slot) =>
  hasEffect(w, "speed", (e) => e.team === teamOf(slot)) ? POWERUP_SPEED_FACTOR : 1;

function applyEffect(w, typeIndex, team) {
  const existing = w.effects.find((e) => e.t === typeIndex && e.team === team);
  if (existing) { existing.left = EFFECT_FRAMES; return; }
  // Netzhöhe kennt nur eine Richtung gleichzeitig
  const type = POWERUP_TYPES[typeIndex];
  if (type === "netHigh" || type === "netLow") {
    w.effects = w.effects.filter((e) => {
      const t = POWERUP_TYPES[e.t];
      return t !== "netHigh" && t !== "netLow";
    });
  }
  w.effects.push({ t: typeIndex, team, left: EFFECT_FRAMES });
}

const groundPlaneFor = (scale) => GROUND_Y - BLOBBY_HALF_H * scale;

// Während Aufschlag und Punktpause zählt keine Taste — die Schwerkraft läuft weiter, ein
// Blob in der Luft landet also noch, danach steht alles still bis zum Anpfiff.
const FROZEN_INPUT = { left: false, right: false, jump: false };

// Jede Eingabe trägt eine laufende Nummer und den Frame, ab dem der Server sie rechnet.
// Beides geht im Schnappschuss zurück an den Client: nur damit kann er seine eigene
// Vorhersage an der richtigen Stelle mit dem Serverstand vergleichen.
const blankInput = (frame) => ({ left: false, right: false, jump: false, seq: 0, since: frame });

// ── Welt ────────────────────────────────────────────────────────────────────

function newWorld(settings, serveTeam = 1) {
  const width = FIELD_W[settings.mode];
  const w = {
    width,
    netX: width / 2,
    frame: 0,
    lastSnapFrame: 0,
    phase: "serve",          // serve | rally | point
    phaseFrames: SERVE_FRAMES,
    serveTeam,
    ball: { x: 0, y: STANDARD_BALL_HEIGHT, vx: 0, vy: 0 },
    ballPrev: { x: 0, y: STANDARD_BALL_HEIGHT },
    blobs: {},
    inputs: {},
    touching: {},            // Ball lag im letzten Frame an diesem Blob an
    touches: 0,              // Berührungen des Teams, das zuletzt drangewesen ist
    lastHit: 0,              // Platz der letzten Berührung
    lastTeam: 0,
    score: { 1: 0, 2: 0 },
    lastScorer: 0,
    pointReason: "",         // ground | touches
    effects: [],
    powerup: null,           // { t, x, y, life }
    nextPowerupIn: POWERUP_SPAWN_FRAMES,
  };
  for (const slot of [1, 2, 3, 4]) {
    w.blobs[slot] = { x: slotStartX(slot, settings), y: groundPlaneFor(1), vy: 0, grounded: true, jumpWasDown: false };
    w.inputs[slot] = blankInput(0);
    w.touching[slot] = false;
  }
  w.ball.x = slotStartX(serveTeam === 1 ? 1 : 2, settings);
  return w;
}

// Blobs zurück auf ihre Startplätze, Ball hängt über dem Aufschläger
function resetForServe(w, settings, serveTeam) {
  w.phase = "serve";
  w.phaseFrames = SERVE_FRAMES;
  w.serveTeam = serveTeam;
  w.ball = { x: slotStartX(serveTeam === 1 ? 1 : 2, settings), y: STANDARD_BALL_HEIGHT, vx: 0, vy: 0 };
  for (const slot of [1, 2, 3, 4]) {
    const scale = blobScale(w, slot);
    w.blobs[slot] = { x: slotStartX(slot, settings), y: groundPlaneFor(scale), vy: 0, grounded: true, jumpWasDown: false };
    w.touching[slot] = false;
  }
  w.touches = 0;
  w.lastHit = 0;
  w.lastTeam = 0;
}

function hasWon(w, team) {
  const s = w.score[team], o = w.score[otherTeam(team)];
  return s >= SCORE_TO_WIN && s - o >= WIN_BY;
}

// ── Physik ──────────────────────────────────────────────────────────────────

// Ein Blob-Frame. Reihenfolge wie im Original: Sprung, Sprungpuffer, Horizontaltempo,
// Schwerkraft, Integration, Boden. Der Blob kollidiert NICHT mit dem Ball — nur der
// Ball prallt ab.
function stepBlob(b, inp, scale, speedFactor) {
  const plane = groundPlaneFor(scale);
  const onSand = b.y >= plane - 0.001;
  const onGround = b.grounded || onSand;
  // Im Sand federt man wie im Original weiter, solange die Taste gehalten wird. Auf einem
  // Absatz — Pfeilerkante oder fremder Kopf — braucht es dagegen einen neuen Tastendruck:
  // sonst landet man dort und wird sofort ein zweites Mal katapultiert, diesmal aus 216 px
  // Höhe, und fliegt weit über das Feld hinaus.
  const freshPress = inp.jump && !b.jumpWasDown;
  const mayJump = inp.jump && onGround && (onSand || freshPress);
  b.jumpWasDown = inp.jump;
  b.grounded = false;
  if (mayJump) b.vy = -BLOBBY_JUMP_ACCELERATION;
  if (inp.jump && b.vy < 0) b.vy -= BLOBBY_JUMP_BUFFER;
  const vx = ((inp.right ? 1 : 0) - (inp.left ? 1 : 0)) * BLOBBY_SPEED * speedFactor;
  b.vy += GRAVITATION;
  b.x += vx;
  b.y += b.vy;
  if (b.y > plane) { b.y = plane; b.vy = 0; b.grounded = true; }
}

// Seitenwände des Spielfelds
function clampToField(b, scale, width) {
  const r = BLOBBY_LOWER_RADIUS * scale;
  if (b.x < r) b.x = r;
  if (b.x > width - r) b.x = width - r;
}

// Getrennte Hälften: das Netz ist für den Blob undurchlässig
function clampToHalf(b, slot, scale, w) {
  const r = BLOBBY_LOWER_RADIUS * scale;
  if (teamOf(slot) === 1) {
    const maxX = w.netX - NET_RADIUS - r;
    if (b.x > maxX) b.x = maxX;
  } else {
    const minX = w.netX + NET_RADIUS + r;
    if (b.x < minX) b.x = minX;
  }
}

// Offene Hälften: der Pfeiler ist ein solider Klotz, auf dem man landen kann. Aufgelöst
// wird entlang der Achse mit der kleineren Überlappung — steht der Blob oben drauf, ist
// das die senkrechte, und er bleibt stehen.
function blobNetCollision(b, scale, w) {
  const halfW = BLOBBY_LOWER_RADIUS * scale;
  const halfH = BLOBBY_HALF_H * scale;
  const netTop = netTopY(w);
  const left = w.netX - NET_RADIUS;
  const right = w.netX + NET_RADIUS;

  if (b.x + halfW <= left || b.x - halfW >= right) return;
  if (b.y + halfH <= netTop) return;

  const pushLeft = (b.x + halfW) - left;
  const pushRight = right - (b.x - halfW);
  const pushUp = (b.y + halfH) - netTop;
  const pushX = pushLeft < pushRight ? -pushLeft : pushRight;

  if (pushUp <= Math.abs(pushX)) {
    b.y -= pushUp;
    // Nur wer fällt, landet. Ein aufsteigender Blob, der die Kante streift, darf NICHT
    // als stehend gelten — sonst greift die gehaltene Sprungtaste sofort wieder und man
    // bekommt mitten im Sprung einen zweiten vollen Impuls.
    if (b.vy >= 0) { b.vy = 0; b.grounded = true; }
  } else {
    b.x += pushX;
  }
}

// Blob gegen Blob: als Kasten gerechnet, damit man sauber auf dem Kopf des anderen
// stehen kann statt abzurutschen.
function blobBlobCollision(a, sa, b, sb) {
  const halfW = BLOBBY_LOWER_RADIUS * sa + BLOBBY_LOWER_RADIUS * sb;
  const halfH = BLOBBY_HALF_H * sa + BLOBBY_HALF_H * sb;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const ox = halfW - Math.abs(dx);
  const oy = halfH - Math.abs(dy);
  if (ox <= 0 || oy <= 0) return;

  if (oy < ox) {
    const upper = dy < 0 ? b : a;
    upper.y -= oy;
    if (upper.vy >= 0) { upper.vy = 0; upper.grounded = true; }
  } else {
    const push = ox / 2;
    if (dx < 0) { b.x -= push; a.x += push; }
    else { b.x += push; a.x -= push; }
  }
}

// Zählt eine Berührung und beendet den Ballwechsel beim Überschreiten des Limits
function registerTouch(game, slot) {
  const w = game.world;
  const team = teamOf(slot);
  if (w.lastTeam !== team) { w.lastTeam = team; w.touches = 0; }
  w.lastHit = slot;
  w.touches += 1;
  const limit = game.settings.maxTouches;
  if (limit > 0 && w.touches > limit) endRally(game, otherTeam(team), "touches");
}

function endRally(game, scorer, reason) {
  const w = game.world;
  if (w.phase !== "rally") return;
  w.score[scorer] += 1;
  w.lastScorer = scorer;
  w.pointReason = reason;
  w.phase = "point";
  w.phaseFrames = POINT_FRAMES;
  if (hasWon(w, scorer)) game.pendingFinish = scorer;
}

// ── Der Blob als EIN Körper ─────────────────────────────────────────────────
// Kollidiert wird nicht gegen zwei Kreise, sondern gegen ihre konvexe Hülle — einen
// abgerundeten Kegel aus zwei Kappen und zwei Tangenten.
//
// Warum: Die beiden Kreise überschneiden sich, und an ihren Schnittpunkten (±23 px auf
// Taillenhöhe) hat die Vereinigung eine EINSPRINGENDE Kante. Löst man dort gegen den Kopf
// auf, landet der Ball zwangsläufig in der unteren Kugel — und umgekehrt. Er rutscht dann
// sichtbar durch den Kopf, egal wie sauber die einzelne Kugel gerechnet ist. Eine konvexe
// Form hat diese Kante nicht: jeder Punkt außerhalb hat genau eine nächste Stelle.
function blobShape(b, scale) {
  return {
    ax: b.x, ay: b.y - BLOBBY_UPPER_SPHERE * scale, ar: BLOBBY_UPPER_RADIUS * scale,
    bx: b.x, by: b.y + BLOBBY_LOWER_SPHERE * scale, br: BLOBBY_LOWER_RADIUS * scale,
  };
}

// Vorzeichenbehafteter Abstand eines Punktes zur um `pad` aufgeblasenen Hülle, dazu die
// nach außen zeigende Normale. Außerhalb ist der Wert der exakte Euklidische Abstand —
// darauf beruht die Kegelverfolgung unten.
function blobDistance(px, py, s, pad) {
  const R1 = s.ar + pad;
  const R2 = s.br + pad;
  let ux = s.bx - s.ax;
  let uy = s.by - s.ay;
  const L = Math.hypot(ux, uy) || 1e-6;
  ux /= L; uy /= L;
  const sinA = (R2 - R1) / L;
  const cosA = Math.sqrt(Math.max(0, 1 - sinA * sinA));

  const rx = px - s.ax;
  const ry = py - s.ay;
  const along = rx * ux + ry * uy;
  const side = rx * -uy + ry * ux;
  const reach = Math.abs(side) * sinA + along * cosA;

  if (reach <= 0) {                       // obere Kappe
    const d = Math.hypot(rx, ry) || 1e-6;
    return { d: d - R1, nx: rx / d, ny: ry / d };
  }
  if (reach >= L * cosA) {                // untere Kappe
    const qx = px - s.bx, qy = py - s.by;
    const d = Math.hypot(qx, qy) || 1e-6;
    return { d: d - R2, nx: qx / d, ny: qy / d };
  }
  const sg = side < 0 ? -1 : 1;           // Flanke
  const ex = -uy * sg, ey = ux * sg;
  return {
    d: Math.abs(side) * cosA - along * sinA - R1,
    nx: ex * cosA - ux * sinA,
    ny: ey * cosA - uy * sinA,
  };
}

// Erste Berührung der Ballstrecke mit der Hülle. Kegelverfolgung: Der Abstand ist exakt,
// also darf man immer genau so weit vorrücken, ohne die Oberfläche zu überspringen. Das
// erwischt auch den schnellsten Ball, der sonst in einem Frame durch den Blob hindurchspringt.
function sweepBlob(px, py, vx, vy, s, pad) {
  let probe = blobDistance(px, py, s, pad);
  if (probe.d <= 0) return { t: 0, d: probe.d, nx: probe.nx, ny: probe.ny };
  const len = Math.hypot(vx, vy);
  if (len < 1e-9) return null;
  let t = 0;
  for (let i = 0; i < 32; i++) {
    t += probe.d / len;
    if (t > 1) return null;
    probe = blobDistance(px + vx * t, py + vy * t, s, pad);
    if (probe.d <= 0.02) return { t, d: probe.d, nx: probe.nx, ny: probe.ny };
  }
  return null;   // streift die Hülle bestenfalls — nächster Frame fängt es auf
}

// Ball gegen einen Blob. Der Stoß gilt nur beim EINTRITT, sonst würde der Ball am Blob
// kleben und jeden Frame neu beschleunigt. Liegt er trotzdem in der Hülle, wird er in
// jedem Fall herausgeschoben — sichtbar drinstecken darf er nie.
function ballBlobCollision(game, slot) {
  const w = game.world;
  const ball = w.ball;
  const shape = blobShape(w.blobs[slot], blobScale(w, slot));
  const p0 = w.ballPrev;

  const hit = sweepBlob(p0.x, p0.y, ball.x - p0.x, ball.y - p0.y, shape, BALL_RADIUS);
  const here = blobDistance(ball.x, ball.y, shape, BALL_RADIUS);
  // Die Sperre greift nur, solange der Ball auch wirklich noch anliegt. Wäre sie an das
  // Merkmal allein gebunden, könnte ein schneller Ball im Sperrframe durchfliegen.
  const blocked = w.touching[slot] && here.d <= 0.01;

  if (hit && !blocked) {
    // Berührpunkt auf dem Flugweg, nicht die (schon durchflogene) Endposition
    const cx = p0.x + (ball.x - p0.x) * hit.t - hit.d * hit.nx;
    const cy = p0.y + (ball.y - p0.y) * hit.t - hit.d * hit.ny;
    ball.x = cx;
    ball.y = cy;
    // Der Restweg beginnt an der Oberfläche — sonst prüft der nächste Blob im 2v2 noch
    // gegen die alte, längst verlassene Strecke.
    p0.x = cx;
    p0.y = cy;
    ball.vx = hit.nx * BALL_COLLISION_VELOCITY;
    ball.vy = hit.ny * BALL_COLLISION_VELOCITY;
    ball.x += ball.vx;
    ball.y += ball.vy;
    registerTouch(game, slot);
    // Nach dem Stoß liegt der Ball weit draußen — die Sperre ist damit sofort wieder frei
    // und ein echter zweiter Treffer (der Blob läuft nach) kommt ohne Verzögerung an.
    w.touching[slot] = false;
    return;
  }

  if (here.d < 0) {                       // getragen statt gestoßen
    ball.x -= here.d * here.nx;
    ball.y -= here.d * here.ny;
    w.touching[slot] = true;
    return;
  }
  // Anliegen heißt anliegen, nicht "hat mal gestreift": sonst bliebe die Sperre gesetzt,
  // während der Ball längst frei ist, und der nächste Treffer würde verschluckt.
  w.touching[slot] = here.d <= 0.01;
}

function ballNetCollision(w) {
  const ball = w.ball;
  const netTop = netTopY(w);
  const dx = ball.x - w.netX;
  const dy = ball.y - netTop;
  const d = Math.hypot(dx, dy);

  // Pfeilerkante (Kugel obendrauf) — hier entscheiden sich die Glücksbälle
  if (d < BALL_RADIUS + NET_RADIUS) {
    const nx = d < 1e-6 ? 0 : dx / d;
    const ny = d < 1e-6 ? -1 : dy / d;
    const dot = ball.vx * nx + ball.vy * ny;
    if (dot < 0) {
      ball.vx = (ball.vx - 2 * dot * nx) * NET_DAMPING;
      ball.vy = (ball.vy - 2 * dot * ny) * NET_DAMPING;
    }
    ball.x = w.netX + nx * (BALL_RADIUS + NET_RADIUS);
    ball.y = netTop + ny * (BALL_RADIUS + NET_RADIUS);
    return;
  }

  // Pfeilerkörper darunter — senkrechte Wand
  if (ball.y > netTop) {
    if (ball.x < w.netX && ball.x + BALL_RADIUS > w.netX - NET_RADIUS) {
      ball.x = w.netX - NET_RADIUS - BALL_RADIUS;
      if (ball.vx > 0) ball.vx = -ball.vx;
    } else if (ball.x >= w.netX && ball.x - BALL_RADIUS < w.netX + NET_RADIUS) {
      ball.x = w.netX + NET_RADIUS + BALL_RADIUS;
      if (ball.vx < 0) ball.vx = -ball.vx;
    }
  }
}

// ── Powerups ────────────────────────────────────────────────────────────────

function spawnPowerup(w) {
  const t = Math.floor(Math.random() * POWERUP_TYPES.length);
  w.powerup = { t, x: w.netX, y: netTopY(w) - POWERUP_ABOVE_NET, life: POWERUP_LIFETIME };
}

function collectPowerup(w, team) {
  applyEffect(w, w.powerup.t, team);
  w.powerup = null;
  w.nextPowerupIn = POWERUP_SPAWN_FRAMES;
}

// Eingesammelt wird vom Ball (dem Team der letzten Berührung) oder direkt von einem Blob,
// der hochspringt. Beides fühlt sich richtig an: zielen ODER klettern.
function stepPowerups(game, slots) {
  const w = game.world;

  for (let i = w.effects.length - 1; i >= 0; i--) {
    w.effects[i].left -= 1;
    if (w.effects[i].left <= 0) w.effects.splice(i, 1);
  }

  if (!game.settings.powerups) {
    w.powerup = null;
    return;
  }

  // Der Timer läuft auch in Aufschlag und Punktpause weiter: Ballwechsel sind oft kürzer
  // als das Intervall, sonst käme nie eines.
  if (!w.powerup) {
    w.nextPowerupIn -= 1;
    if (w.nextPowerupIn <= 0) spawnPowerup(w);
    return;
  }

  const p = w.powerup;
  p.y = netTopY(w) - POWERUP_ABOVE_NET;
  p.life -= 1;
  if (p.life <= 0) {
    w.powerup = null;
    w.nextPowerupIn = POWERUP_SPAWN_FRAMES;
    return;
  }

  if (w.phase === "rally" && w.lastHit) {
    const ball = w.ball;
    if (Math.hypot(ball.x - p.x, ball.y - p.y) < BALL_RADIUS + POWERUP_RADIUS) {
      collectPowerup(w, teamOf(w.lastHit));
      return;
    }
  }

  for (const slot of slots) {
    const b = w.blobs[slot];
    const scale = blobScale(w, slot);
    const nearestX = Math.max(b.x - BLOBBY_LOWER_RADIUS * scale, Math.min(p.x, b.x + BLOBBY_LOWER_RADIUS * scale));
    const nearestY = Math.max(b.y - BLOBBY_HALF_H * scale, Math.min(p.y, b.y + BLOBBY_HALF_H * scale));
    if (Math.hypot(p.x - nearestX, p.y - nearestY) < POWERUP_RADIUS) {
      collectPowerup(w, teamOf(slot));
      return;
    }
  }
}

// ── Ein Weltschritt ─────────────────────────────────────────────────────────

function stepWorld(game) {
  const w = game.world;
  const settings = game.settings;
  const slots = slotsFor(settings);
  w.frame += 1;

  stepPowerups(game, slots);

  // Vor dem Aufschlag und in der Punktpause sind die Blobs festgenagelt — alle starten
  // vom selben Platz, niemand kann sich einen Vorlauf verschaffen.
  const listening = w.phase === "rally";
  const scales = {};
  for (const slot of slots) {
    scales[slot] = blobScale(w, slot);
    stepBlob(w.blobs[slot], listening ? w.inputs[slot] : FROZEN_INPUT, scales[slot], blobSpeedFactor(w, slot));
    clampToField(w.blobs[slot], scales[slot], w.width);
    if (settings.crossNet) blobNetCollision(w.blobs[slot], scales[slot], w);
    else clampToHalf(w.blobs[slot], slot, scales[slot], w);
  }
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      blobBlobCollision(w.blobs[slots[i]], scales[slots[i]], w.blobs[slots[j]], scales[slots[j]]);
    }
  }
  for (const slot of slots) {
    const b = w.blobs[slot];
    clampToField(b, scales[slot], w.width);
    const plane = groundPlaneFor(scales[slot]);
    if (b.y > plane) { b.y = plane; b.vy = 0; b.grounded = true; }
  }

  if (w.phase !== "rally") {
    w.phaseFrames -= 1;
    if (w.phaseFrames <= 0) {
      if (w.phase === "serve") {
        w.phase = "rally";           // ab jetzt fällt der Ball
      } else {
        resetForServe(w, settings, w.lastScorer || w.serveTeam);
      }
    }
    // Im Aufschlag hängt der Ball, in der Punktpause bleibt er liegen
    return;
  }

  const ball = w.ball;
  w.ballPrev.x = ball.x;   // Startpunkt der Flugstrecke für die Blob-Kollision
  w.ballPrev.y = ball.y;
  ball.vy += BALL_GRAVITATION;
  ball.x += ball.vx;
  ball.y += ball.vy;

  for (const slot of slots) ballBlobCollision(game, slot);
  if (w.phase !== "rally") return;   // Berührungslimit hat den Ballwechsel beendet
  ballNetCollision(w);

  // Seitenwände
  if (ball.x - BALL_RADIUS < 0 && ball.vx < 0) {
    ball.vx = -ball.vx;
    ball.x = BALL_RADIUS;
  } else if (ball.x + BALL_RADIUS > w.width && ball.vx > 0) {
    ball.vx = -ball.vx;
    ball.x = w.width - BALL_RADIUS;
  }

  // Boden → Punkt für die andere Seite
  if (ball.y + BALL_RADIUS >= GROUND_Y) {
    ball.y = GROUND_Y - BALL_RADIUS;
    ball.vx = 0;
    ball.vy = 0;
    endRally(game, ball.x < w.netX ? 2 : 1, "ground");
  }
}

// ── Zustand für die Clients ─────────────────────────────────────────────────

// Lobby-Zustand: ändert sich selten, geht nur bei echten Ereignissen raus
function sanitize(game) {
  const players = {};
  for (const slot of [1, 2, 3, 4]) {
    const p = game.players[slot];
    players[slot] = p ? { name: p.name, connected: p.connected } : null;
  }
  return {
    code: game.code,
    status: game.status,
    settings: { ...game.settings },
    slots: slotsFor(game.settings),
    hostSlot: game.hostSlot,
    players,
    score: { ...game.world.score },
    winner: game.winner,
    rematch: { ...game.rematch },
    spectatorCount: game.spectators.size,
    scoreToWin: SCORE_TO_WIN,
  };
}

const round2 = (n) => Math.round(n * 100) / 100;
const inputMask = (i) => (i.left ? 1 : 0) | (i.right ? 2 : 0) | (i.jump ? 4 : 0);

// Physik-Schnappschuss: bewusst kurze Feldnamen, das geht ~37× pro Sekunde raus.
// vx/vy des Balls kommen mit, damit der Client die wenigen Frames Netzlaufzeit
// ballistisch vorausrechnen kann statt hinterherzuhängen. Maßstab und Tempofaktor der
// Blobs stehen mit im Paket — dann muss der Client die Powerup-Wirkung nicht nachrechnen.
function snapshot(game) {
  const w = game.world;
  const slots = slotsFor(game.settings);
  const pl = {};
  const im = {};
  for (const slot of slots) {
    const b = w.blobs[slot];
    // x, y, vy, Maßstab, Tempofaktor, steht-auf-etwas, Nummer der gerechneten Eingabe,
    // und seit wie vielen Frames sie gilt. Die letzten beiden Felder sind der Anker für
    // die Vorhersage: Der Client weiß damit, welcher seiner eigenen Frames diesem
    // Serverstand entspricht, und kann den echten Fehler bestimmen statt zu raten.
    pl[slot] = [
      round2(b.x), round2(b.y), round2(b.vy),
      round2(blobScale(w, slot)), blobSpeedFactor(w, slot), b.grounded ? 1 : 0,
      w.inputs[slot].seq, w.frame - w.inputs[slot].since,
    ];
    im[slot] = inputMask(w.inputs[slot]);
  }
  return {
    f: w.frame,
    ph: w.phase,
    pf: w.phaseFrames,   // Restframes der Aufschlag-/Punktpause (für den Countdown)
    pr: w.pointReason,
    b: [round2(w.ball.x), round2(w.ball.y), round2(w.ball.vx), round2(w.ball.vy)],
    pl,
    im,
    nt: netTopY(w),
    sc: [w.score[1], w.score[2]],
    tc: w.touches,
    lh: w.lastHit,
    ef: w.effects.map((e) => [e.t, e.team, e.left]),
    pu: w.powerup ? [round2(w.powerup.x), round2(w.powerup.y), w.powerup.t] : null,
  };
}

function broadcast(io, game) {
  game.updatedAt = Date.now();
  io.to(game.code).emit("bv:state", sanitize(game));
}

function broadcastOrCleanup(io, game) {
  const anyPlayer = [1, 2, 3, 4].some((s) => game.players[s]);
  if (!anyPlayer && game.spectators.size === 0) {
    games.delete(game.code);
    stopLoopIfIdle();
    return;
  }
  broadcast(io, game);
}

// ── Globale Physikschleife ──────────────────────────────────────────────────
// Ein Timer für alle Räume statt einer pro Partie. Die Schleife holt verpasste Frames
// nach (setInterval ist unter Last ungenau), damit die Simulation nicht langsamer wird.

let loopHandle = null;
let loopIo = null;
let lastLoopAt = 0;
let loopCarry = 0;   // Rest-Millisekunden, die noch keinen ganzen Frame ergeben haben

const isLive = (game) =>
  game.status === "playing" && slotsFor(game.settings).every((s) => game.players[s]?.connected);

function ensureLoop(io) {
  loopIo = io;
  if (loopHandle) return;
  lastLoopAt = Date.now();
  loopCarry = 0;
  // Kürzer als ein Frame takten: der Rest-Zähler bestimmt, wie viele Frames wirklich
  // fällig sind, und feineres Wecken hält die Schnappschüsse gleichmäßig.
  loopHandle = setInterval(runLoop, 5);
}

function stopLoopIfIdle() {
  if (!loopHandle) return;
  for (const game of games.values()) if (isLive(game)) return;
  clearInterval(loopHandle);
  loopHandle = null;
}

function runLoop() {
  const now = Date.now();
  // Angesammelte Zeit in ganze Frames umrechnen und den Rest aufheben. Runden wäre hier
  // falsch: Windows weckt Timer nur alle ~15,6 ms, und round(15,6/13,33) = 1 ließe die
  // Simulation mit 64 statt 75 Hz laufen — das Spiel liefe in Zeitlupe, und jede
  // Client-Vorhersage würde dem Server unaufhaltsam davonrennen.
  loopCarry = Math.min(loopCarry + (now - lastLoopAt), 8 * TICK_MS);
  lastLoopAt = now;
  const steps = Math.floor(loopCarry / TICK_MS);
  loopCarry -= steps * TICK_MS;

  for (const game of steps > 0 ? games.values() : []) {
    if (!isLive(game)) continue;
    for (let i = 0; i < steps; i++) {
      stepWorld(game);
      if (game.pendingFinish) break;
    }

    if (game.pendingFinish) {
      game.status = "finished";
      game.winner = game.pendingFinish;
      game.pendingFinish = 0;
      game.updatedAt = now;
      loopIo.to(game.code).emit("bv:tick", snapshot(game));
      broadcast(loopIo, game);
      continue;
    }

    // Nicht "frame % N": holt die Schleife mehrere Frames auf einmal nach, würde ein
    // Vielfaches sonst übersprungen und der Schnappschuss ausfallen
    if (game.world.frame - game.world.lastSnapFrame >= SNAPSHOT_EVERY) {
      game.world.lastSnapFrame = game.world.frame;
      loopIo.to(game.code).emit("bv:tick", snapshot(game));
    }
    // Punktestand wandert im Tick mit; die Lobby-Karten aktualisiert ein eigener
    // Broadcast, sobald sich der Stand wirklich ändert
    if (game.world.score[1] !== game.lastSentScore[1] || game.world.score[2] !== game.lastSentScore[2]) {
      game.lastSentScore = { ...game.world.score };
      broadcast(loopIo, game);
    }
    game.updatedAt = now;
  }
  stopLoopIfIdle();
}

// ── Partien ─────────────────────────────────────────────────────────────────

function newGame(code, settings) {
  return {
    code,
    settings,
    world: newWorld(settings, 1),
    status: "waiting",       // waiting | playing | finished
    winner: 0,
    hostSlot: 1,
    players: { 1: null, 2: null, 3: null, 4: null },
    spectators: new Map(),
    rematch: { 1: false, 2: false, 3: false, 4: false },
    pendingFinish: 0,
    lastSentScore: { 1: 0, 2: 0 },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function startIfReady(game, io) {
  if (game.status !== "waiting") return;
  if (!slotsFor(game.settings).every((s) => game.players[s])) return;
  game.status = "playing";
  resetForServe(game.world, game.settings, game.world.serveTeam);
  ensureLoop(io);
}

function resetForRematch(game, io) {
  game.world = newWorld(game.settings, game.winner || 1);
  game.winner = 0;
  game.rematch = { 1: false, 2: false, 3: false, 4: false };
  game.pendingFinish = 0;
  game.lastSentScore = { 1: 0, 2: 0 };
  game.status = slotsFor(game.settings).every((s) => game.players[s]) ? "playing" : "waiting";
  if (game.status === "playing") ensureLoop(io);
}

// Zurück in den Wartezustand: alles außer Sitzplätzen und Einstellungen auf Anfang
function resetToLobby(game) {
  game.world = newWorld(game.settings, 1);
  game.status = "waiting";
  game.winner = 0;
  game.rematch = { 1: false, 2: false, 3: false, 4: false };
  game.pendingFinish = 0;
  game.lastSentScore = { 1: 0, 2: 0 };
}

// Ein Sitzplatz wird frei — die Partie geht zurück in den Wartezustand, damit über
// denselben Link jemand neu einsteigen kann
function freeSlot(game, slot) {
  clearDisconnectTimer(game.players[slot]);
  game.players[slot] = null;
  if (game.hostSlot === slot) {
    game.hostSlot = [1, 2, 3, 4].find((s) => game.players[s]) || 1;
  }
  resetToLobby(game);
}

function clearDisconnectTimer(player) {
  if (player?.disconnectTimer) {
    clearTimeout(player.disconnectTimer);
    player.disconnectTimer = null;
  }
}

// Platz → Zuschauer (z. B. wenn der Host von 2v2 auf 1v1 wechselt)
function demoteToSpectator(game, slot, io) {
  const p = game.players[slot];
  if (!p) return;
  clearDisconnectTimer(p);
  game.players[slot] = null;
  // Nur wer noch dran hängt, wird Zuschauer — sonst bliebe eine Karteileiche in der Liste
  if (p.socketId && p.connected) {
    game.spectators.set(p.socketId, p.name);
    socketIndex.set(p.socketId, { code: game.code, role: "spectator", slot: null });
    io.to(p.socketId).emit("bv:slot", { slot: null, spectator: true });
  }
}

function registerBlobbySocket(socket, io) {
  socket.on("bv:create", (payload = {}, ack) => {
    const name = String(payload.name || "").trim().slice(0, 24) || "Spieler";
    const settings = sanitizeSettings(payload.settings);
    const code = generateCode();
    const game = newGame(code, settings);
    game.players[1] = { name, connected: true, socketId: socket.id, disconnectTimer: null };
    games.set(code, game);
    socket.join(code);
    socketIndex.set(socket.id, { code, role: "player", slot: 1 });
    if (typeof ack === "function") ack({ ok: true, code, slot: 1 });
    broadcast(io, game);
  });

  socket.on("bv:join", (payload = {}, ack) => {
    const code = String(payload.code || "").trim().toUpperCase();
    const name = String(payload.name || "").trim().slice(0, 24) || "Spieler";
    const game = games.get(code);
    if (!game) {
      if (typeof ack === "function") ack({ ok: false, error: "Spiel nicht gefunden." });
      return;
    }

    game.spectators.delete(socket.id);
    const seats = slotsFor(game.settings);

    // Reconnect: derselbe Name hält den Sitzplatz für die Gnadenfrist
    for (const slot of seats) {
      const p = game.players[slot];
      if (p && !p.connected && p.name === name) {
        clearDisconnectTimer(p);
        p.connected = true;
        p.socketId = socket.id;
        socket.join(code);
        socketIndex.set(socket.id, { code, role: "player", slot });
        game.world.inputs[slot] = blankInput(game.world.frame);
        if (typeof ack === "function") ack({ ok: true, code, slot });
        if (game.status === "playing") ensureLoop(io);
        broadcast(io, game);
        return;
      }
    }

    const slot = seats.find((s) => !game.players[s]);

    if (slot) {
      game.players[slot] = { name, connected: true, socketId: socket.id, disconnectTimer: null };
      socket.join(code);
      socketIndex.set(socket.id, { code, role: "player", slot });
      startIfReady(game, io);
      if (typeof ack === "function") ack({ ok: true, code, slot });
      broadcast(io, game);
      return;
    }

    game.spectators.set(socket.id, name);
    socket.join(code);
    socketIndex.set(socket.id, { code, role: "spectator", slot: null });
    if (typeof ack === "function") ack({ ok: true, code, slot: null, spectator: true });
    broadcast(io, game);
  });

  // Nur der Host, nur solange noch niemand spielt
  socket.on("bv:settings", (payload = {}) => {
    const entry = socketIndex.get(socket.id);
    if (!entry || entry.role !== "player") return;
    const game = games.get(entry.code);
    if (!game || game.status === "playing" || entry.slot !== game.hostSlot) return;

    game.settings = sanitizeSettings(payload, game.settings);
    // Beim Wechsel auf 1v1 verlieren die hinteren Plätze ihren Sitz
    for (const slot of [3, 4]) {
      if (!slotsFor(game.settings).includes(slot)) demoteToSpectator(game, slot, io);
    }
    resetToLobby(game);
    startIfReady(game, io);
    broadcast(io, game);
  });

  // Seitenwechsel in der Lobby: auf einen freien Platz des anderen Teams
  socket.on("bv:swap", () => {
    const entry = socketIndex.get(socket.id);
    if (!entry || entry.role !== "player") return;
    const game = games.get(entry.code);
    if (!game || game.status === "playing") return;
    const target = slotsFor(game.settings).find(
      (s) => !game.players[s] && teamOf(s) !== teamOf(entry.slot)
    );
    if (!target) return;
    game.players[target] = game.players[entry.slot];
    game.players[entry.slot] = null;
    if (game.hostSlot === entry.slot) game.hostSlot = target;
    socketIndex.set(socket.id, { code: entry.code, role: "player", slot: target });
    game.world.inputs[entry.slot] = blankInput(game.world.frame);
    socket.emit("bv:slot", { slot: target, spectator: false });
    resetToLobby(game);
    startIfReady(game, io);
    broadcast(io, game);
  });

  // Der Client schickt nur bei Änderungen — gehaltene Tasten kosten kein Netz
  socket.on("bv:input", (payload = {}) => {
    const entry = socketIndex.get(socket.id);
    if (!entry || entry.role !== "player") return;
    const game = games.get(entry.code);
    if (!game) return;
    const prev = game.world.inputs[entry.slot];
    const seq = Number(payload.seq) || 0;
    if (seq && prev && seq < prev.seq) return;   // überholtes Paket
    game.world.inputs[entry.slot] = {
      left: !!payload.left,
      right: !!payload.right,
      jump: !!payload.jump,
      seq,
      since: game.world.frame,
    };
  });

  // Laufzeitmessung für die Vorausberechnung im Client
  socket.on("bv:ping", (payload = {}, ack) => {
    if (typeof ack === "function") ack({ c: payload.c, t: Date.now() });
  });

  socket.on("bv:rematch", () => {
    const entry = socketIndex.get(socket.id);
    if (!entry || entry.role !== "player") return;
    const game = games.get(entry.code);
    if (!game || game.status !== "finished") return;
    game.rematch[entry.slot] = true;
    if (slotsFor(game.settings).every((s) => game.rematch[s])) resetForRematch(game, io);
    broadcast(io, game);
  });

  socket.on("bv:leave", () => handleLeave(socket, io, { immediate: true }));
  socket.on("disconnect", () => handleLeave(socket, io, { immediate: false }));
}

function handleLeave(socket, io, { immediate }) {
  const entry = socketIndex.get(socket.id);
  if (!entry) return;
  socketIndex.delete(socket.id);
  if (immediate) socket.leave(entry.code);

  const game = games.get(entry.code);
  if (!game) return;

  if (entry.role === "spectator") {
    game.spectators.delete(socket.id);
    broadcastOrCleanup(io, game);
    return;
  }

  const player = game.players[entry.slot];
  if (!player || player.socketId !== socket.id) return; // Sitzplatz wurde schon übernommen

  if (immediate) {
    freeSlot(game, entry.slot);
    io.to(game.code).emit("bv:playerLeft", { name: player.name });
    broadcastOrCleanup(io, game);
    stopLoopIfIdle();
    return;
  }

  // Verbindung weg: Simulation pausiert (isLive prüft "connected"), Sitzplatz bleibt reserviert
  player.connected = false;
  game.world.inputs[entry.slot] = blankInput(game.world.frame);
  broadcast(io, game);
  stopLoopIfIdle();
  player.disconnectTimer = setTimeout(() => {
    const g = games.get(entry.code);
    if (!g) return;
    const p = g.players[entry.slot];
    if (!p || p.connected || p.socketId !== socket.id) return;
    freeSlot(g, entry.slot);
    io.to(g.code).emit("bv:playerLeft", { name: p.name });
    broadcastOrCleanup(io, g);
  }, RECONNECT_GRACE_MS);
}

setInterval(() => {
  const now = Date.now();
  for (const [code, game] of games) {
    const hasSomeone =
      [1, 2, 3, 4].some((s) => game.players[s]?.connected) || game.spectators.size > 0;
    if (!hasSomeone && now - game.updatedAt > STALE_AFTER_MS) {
      for (const s of [1, 2, 3, 4]) clearDisconnectTimer(game.players[s]);
      games.delete(code);
    }
  }
  stopLoopIfIdle();
}, STALE_SWEEP_MS);

module.exports = {
  registerBlobbySocket,
  // für Tests / den Client-Renderer: dieselben Maße, damit nichts auseinanderläuft
  BLOBBY_CONSTANTS: {
    WORLD_H, GROUND_Y, FIELD_W,
    BLOBBY_HEIGHT, BLOBBY_UPPER_SPHERE, BLOBBY_UPPER_RADIUS, BLOBBY_LOWER_SPHERE, BLOBBY_LOWER_RADIUS,
    BALL_RADIUS, NET_RADIUS, NET_BASE_TOP,
    BLOBBY_SPEED, BLOBBY_JUMP_ACCELERATION, BLOBBY_JUMP_BUFFER, GRAVITATION, TICK_HZ,
    SCORE_TO_WIN, POWERUP_TYPES, POWERUP_RADIUS,
  },
};
