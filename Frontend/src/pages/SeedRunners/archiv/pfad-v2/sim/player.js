// Spielerbewegung von Seed Runners — ein Schritt pro Tick (120 Hz), rein aus Zustand + Eingabe.
//
// Zustandsmaschine: normal | dash | grapple. Gesprungen wird immer über tryJump(), damit
// Boden-, Wand- und Luftsprung (und ihre Dash-Varianten) an genau EINER Stelle entschieden
// werden.
//
// Schwerkraft: `p.gd` ist +1 (normal) oder -1 (kopfüber in einer Gravitationszone). Alles, was
// "oben/unten" meint, ist relativ dazu gerechnet: `vy * gd > 0` heißt "fällt", `-jumpSpeed * gd`
// ist der Absprung. Zielrichtungen für Dash und Grapple bleiben bewusst bildschirmfest.
//
// Determinismus: nur + − × ÷ und Math.abs/min/max/sign/floor/ceil/round/sqrt. Kein Math.sin/cos/pow
// (Ergebnisse sind zwischen Engines nicht garantiert identisch), kein Date, kein Math.random.
// Reihenfolge der Auswertung ist Teil des Verhaltens — nicht umsortieren, ohne die Tests zu lesen.

import { TICK_DT, TICK_HZ, TILE, PLAYER_W, PLAYER_H, DIAG } from './config.js';
import { INPUT } from './inputBits.js';
import { KIND } from './glyphs.js';
import { rectHitsSolid, lineOfSight } from './tilemap.js';
import { hitsSolid, oneWayLanding, findSupport, wallKind } from './collide.js';

const ticks = (seconds) => Math.max(0, Math.round(seconds * TICK_HZ));

// Nach einem Aufwärts-Dash bleibt weniger Tempo übrig (sonst schießt man über jede Kante hinaus).
const DASH_UP_END_MULT = 0.75;
// Wie weit "hinter" der Zielrichtung ein Anker noch greifbar ist (Kosinus des Winkels).
const GRAPPLE_MIN_AIM_DOT = -0.2;
// Kleine Schritte pro Bewegungsabschnitt: schneller als eine Kachel darf nie in EINEM Schritt
// zurückgelegt werden, sonst kann der Spieler durch dünne Wände tunneln.
const MAX_STEP = 6;
// So lange ignoriert man Einweg-Plattformen nach dem Herunterspringen
const DROP_THROUGH_TIME = 0.18;

export function createPlayer(spawn, cfg) {
  return {
    x: spawn.x, y: spawn.y, prevX: spawn.x, prevY: spawn.y,
    vx: 0, vy: 0, facing: 1,
    gd: 1,

    // Zustand für Rendering/Sound, beeinflusst die Sim nicht selbst
    onGround: false, wallDir: 0, wallKind: KIND.AIR, sliding: false, clinging: false,

    // Was trägt uns? (siehe collide.js findSupport)
    supKind: KIND.AIR, supVx: 0, supOwner: null, supOneWay: false,
    lastGroundVx: 0,

    coyote: 0, wallCoyote: 0, wallCoyoteDir: 0, jumpBuffer: 0,
    wallLock: 0, wallLockDir: 0,
    jumping: false, jumpHold: 0,
    dropTimer: 0, portalCd: 0,

    airJumps: cfg.airJumps,
    // Der Dash gehört nicht mehr zur Grundausstattung: Er kommt nur aus Kristallen (elements/crystal.js) und ist
    // damit eine Ressource, die ein Level verteilt — auch nach jedem Respawn beginnt man ohne.
    dashCharges: 0, dashTimer: 0, dashCooldown: 0, dashGrace: 0, dashBuffer: 0,
    dashDirX: 0, dashDirY: 0,

    grapple: null, grappleCooldown: 0,

    prevInput: 0,
  };
}

function approach(value, target, delta) {
  return value < target ? Math.min(value + delta, target) : Math.max(value - delta, target);
}

function clampSpeed(p, max) {
  const s2 = p.vx * p.vx + p.vy * p.vy;
  if (s2 > max * max) {
    const k = max / Math.sqrt(s2);
    p.vx *= k;
    p.vy *= k;
  }
}

// ── Bewegung mit Kollision ──────────────────────────────────────────────────

const overlaps = (x, y, w, h, s) => x < s.x + s.w && x + w > s.x && y < s.y + s.h && y + h > s.y;

// Neue x-Position, wenn die Bewegung nach `nx` blockiert wäre (auf die Kante eingerastet),
// sonst null. Kacheln rasten auf die Kachelkante ein, bewegliche Blöcke auf ihre eigene.
function blockedX(world, p, nx, step) {
  let edge = null;
  if (rectHitsSolid(world.map, nx, p.y, PLAYER_W, PLAYER_H)) {
    edge = step > 0
      ? (Math.ceil((nx + PLAYER_W) / TILE) - 1) * TILE - PLAYER_W
      : (Math.floor(nx / TILE) + 1) * TILE;
  }
  const list = world.solids;
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    if (s.oneWay || !overlaps(nx, p.y, PLAYER_W, PLAYER_H, s)) continue;
    const e = step > 0 ? s.x - PLAYER_W : s.x + s.w;
    edge = edge === null ? e : (step > 0 ? Math.min(edge, e) : Math.max(edge, e));
  }
  if (edge === null) return null;
  // Steckt man schon im Block (er ist in einen hineingefahren), nicht rückwärts geschoben werden
  return step > 0 ? Math.max(edge, p.x) : Math.min(edge, p.x);
}

// Liefert true, wenn ein Block im Weg war. Der Aufrufer nullt das Tempo.
function moveX(world, p, dx) {
  while (dx !== 0) {
    const step = Math.abs(dx) > MAX_STEP ? Math.sign(dx) * MAX_STEP : dx;
    dx -= step;
    const nx = p.x + step;
    const edge = blockedX(world, p, nx, step);
    if (edge === null) {
      p.x = nx;
      continue;
    }
    p.x = edge;
    return true;
  }
  return false;
}

// 0 = frei, 1 = in +y-Richtung angestoßen, -1 = in -y-Richtung angestoßen.
// Stößt der Kopf (also die Seite gegen die Schwerkraft) nur mit einer Ecke an (bis `corner` px),
// wird seitlich an der Kante vorbei geschoben statt geblockt — ohne das fühlt sich jeder Sprung
// an einer Kante wie ein Fehler an.
function moveY(world, p, dy, corner, gd) {
  const map = world.map;
  while (dy !== 0) {
    const step = Math.abs(dy) > MAX_STEP ? Math.sign(dy) * MAX_STEP : dy;
    dy -= step;
    const ny = p.y + step;

    let edge = null;
    if (rectHitsSolid(map, p.x, ny, PLAYER_W, PLAYER_H)) {
      edge = step > 0
        ? (Math.ceil((ny + PLAYER_H) / TILE) - 1) * TILE - PLAYER_H
        : (Math.floor(ny / TILE) + 1) * TILE;
    }
    const list = world.solids;
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (s.oneWay || !overlaps(p.x, ny, PLAYER_W, PLAYER_H, s)) continue;
      const e = step > 0 ? s.y - PLAYER_H : s.y + s.h;
      edge = edge === null ? e : (step > 0 ? Math.min(edge, e) : Math.max(edge, e));
    }

    // Einweg-Plattformen: nur beim Fallen nach unten, nur bei normaler Schwerkraft
    if (edge === null && step > 0 && gd > 0 && !(p.dropTimer > 0)) {
      const top = oneWayLanding(world, p.x, PLAYER_W, p.y + PLAYER_H, ny + PLAYER_H);
      if (top !== null) edge = top - PLAYER_H;
    }

    if (edge === null) {
      p.y = ny;
      continue;
    }

    if (step * gd < 0 && corner > 0) {
      let nudged = false;
      for (let n = 1; n <= corner && !nudged; n++) {
        for (const dir of [1, -1]) {
          if (!hitsSolid(world, p.x + dir * n, ny, PLAYER_W, PLAYER_H)) {
            p.x += dir * n;
            p.y = ny;
            nudged = true;
            break;
          }
        }
      }
      if (nudged) continue;
    }
    // Steckt man schon im Block, nicht rückwärts geschoben werden
    p.y = step > 0 ? Math.max(edge, p.y) : Math.min(edge, p.y);
    return step > 0 ? 1 : -1;
  }
  return 0;
}

// Bewegt den Spieler von außen (Plattform nimmt ihn mit, Portal schiebt ihn …) — mit Kollision,
// aber ohne sein Tempo anzutasten.
export function movePlayerX(world, dx) {
  return moveX(world, world.player, dx);
}

export function movePlayerY(world, dy) {
  return moveY(world, world.player, dy, 0, world.player.gd);
}

// Bewegt den Körper um sein aktuelles Tempo und wertet die Kollision aus.
function moveBody(c) {
  const { world, p, cfg } = c;
  const gd = p.gd;

  // Förderband: schiebt den Stehenden mit, ohne sein eigenes Tempo zu verändern
  if (p.onGround && (p.supKind === KIND.CONVEYOR_R || p.supKind === KIND.CONVEYOR_L)) {
    moveX(world, p, p.supVx * TICK_DT);
  }

  if (moveX(world, p, p.vx * TICK_DT)) p.vx = 0;
  const impactVy = p.vy;
  const hit = moveY(world, p, p.vy * TICK_DT, cfg.cornerCorrection, gd);
  if (hit !== 0) {
    if (hit === -gd) p.jumping = false;
    p.vy = 0;
    // p.onGround ist hier noch der Kontakt VOR der Bewegung: Wer schon stand, landet nicht —
    // die Schwerkraft drückt ihn jeden Tick in den Boden, das ist kein Aufprall.
    if (hit === gd && !p.onGround) world.emit('land', { impact: impactVy });
  }
}

// ── Sprung ──────────────────────────────────────────────────────────────────

// Einziger Ort, an dem gesprungen wird. `allowAir` ist im Dash aus: mitten im Dash gibt es
// keinen Luftsprung, nur Boden- und Wandsprung (die Tech-Varianten).
function tryJump(c, allowAir) {
  const { world, p, cfg } = c;
  if (p.jumpBuffer <= 0) return false;
  const gd = p.gd;

  // Tech-Fenster: im Dash oder kurz danach, und der Dash hatte eine horizontale Komponente.
  const tech = p.dashDirX !== 0 && (p.dashTimer > 0 || p.dashGrace > 0);

  if (p.coyote > 0) {
    // Nach unten gedrückt auf einer Einweg-Plattform: nicht springen, sondern durchfallen
    if (p.supOneWay && c.inputY > 0 && gd > 0) {
      p.dropTimer = ticks(DROP_THROUGH_TIME);
      p.coyote = 0;
      p.jumpBuffer = 0;
      p.onGround = false;
      return false;
    }
    p.vy = -cfg.jumpSpeed * gd * (tech ? cfg.dashJumpHeightMult : 1);
    if (tech) p.vx = Math.sign(p.dashDirX) * Math.max(Math.abs(p.vx), cfg.dashJumpSpeedX);
    // Wer von einer Plattform oder einem Förderband abspringt, nimmt dessen Tempo mit
    p.vx += p.lastGroundVx;
    p.coyote = 0;
    endJumpStart(p);
    world.emit('jump', { tech });
    return true;
  }

  if (p.wallCoyote > 0) {
    const away = -p.wallCoyoteDir;
    p.vx = away * (tech ? cfg.wallJumpDashSpeedX : cfg.wallJumpSpeedX);
    p.vy = -cfg.wallJumpSpeedY * gd;
    p.facing = away;
    // Sperre gegen die Wand, von der man sich gerade abgestoßen hat: Man kann sich nicht
    // sofort wieder hineinsteuern und die Wand hochklettern — das braucht Timing.
    p.wallLock = ticks(cfg.wallJumpLockTime);
    p.wallLockDir = p.wallCoyoteDir;
    p.wallCoyote = 0;
    p.coyote = 0;
    endJumpStart(p);
    world.emit('wallJump', { dir: away, tech });
    return true;
  }

  if (allowAir && p.airJumps > 0) {
    p.airJumps--;
    p.vy = -cfg.doubleJumpSpeed * gd;
    endJumpStart(p);
    world.emit('doubleJump', {});
    return true;
  }
  return false;
}

function endJumpStart(p) {
  p.jumpBuffer = 0;
  p.jumping = true;
  p.jumpHold = 0;
  // Ein Sprung beendet den Dash
  p.dashTimer = 0;
  p.dashGrace = 0;
}

// ── Grapple ─────────────────────────────────────────────────────────────────

// Welcher Anker würde jetzt gegriffen? Die Zielrichtung (Pfeiltasten) gewinnt gegen Nähe; ohne
// Richtung zielt man schräg nach oben in Blickrichtung. Rein lesend — das Rendering nutzt
// dieselbe Funktion, um den Anker vorab zu markieren.
export function findGrappleTarget(world, aimX, aimY) {
  const { map, cfg } = world;
  const p = world.player;
  const cx = p.x + PLAYER_W / 2;
  const cy = p.y + PLAYER_H / 2;
  let ax = aimX;
  let ay = aimY;
  if (ax === 0 && ay === 0) {
    ax = p.facing * 0.5;
    ay = -1 * p.gd;
  }
  const aimLen = Math.sqrt(ax * ax + ay * ay);
  const range2 = cfg.grappleRange * cfg.grappleRange;

  let best = null;
  let bestScore = -Infinity;
  for (let i = 0; i < map.anchors.length; i++) {
    const a = map.anchors[i];
    const dx = a.x - cx;
    const dy = a.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 > range2 || d2 < 1) continue;
    const d = Math.sqrt(d2);
    const dot = (dx * ax + dy * ay) / (d * aimLen);
    if (dot < GRAPPLE_MIN_AIM_DOT) continue;
    if (!lineOfSight(map, cx, cy, a.x, a.y)) continue;
    const score = dot * 2 - d / cfg.grappleRange;
    if (score > bestScore) {
      bestScore = score;
      best = { index: i, x: a.x, y: a.y, dist: d };
    }
  }
  return best;
}

function attachGrapple(c, target) {
  const { world, p, cfg } = c;
  p.grapple = {
    ax: target.x,
    ay: target.y,
    len: Math.max(cfg.grappleMinLength, target.dist),
    held: 0,
  };
  p.jumping = false;
  world.emit('grappleAttach', { x: target.x, y: target.y });
}

function releaseGrapple(c, boost) {
  const { world, p, cfg } = c;
  const g = p.grapple;
  // Boost nur, wenn wirklich geschwungen wurde — sonst ließe sich durch Ankleben und sofortiges
  // Loslassen am selben Anker beliebig Tempo pumpen.
  const boosted = boost && g.held >= ticks(cfg.grappleBoostMinHold);
  if (boosted) {
    p.vx *= cfg.grappleReleaseBoost;
    p.vy *= cfg.grappleReleaseBoost;
    clampSpeed(p, cfg.grappleMaxSpeed);
  }
  p.grapple = null;
  p.grappleCooldown = ticks(cfg.grappleCooldown);
  p.jumping = false;
  if (cfg.grappleRefundsAirJump >= 0.5) p.airJumps = Math.max(p.airJumps, cfg.airJumps);
  world.emit('grappleRelease', { boosted });
}

function stepGrapple(c) {
  const { world, p, cfg, inputX, inputY } = c;
  const gd = p.gd;
  const g = p.grapple;
  g.held++;

  // Schwung pumpen und Seil ein-/ausholen (oben = kürzer, unten = länger)
  if (!p.onGround && inputX !== 0) p.vx += inputX * cfg.grappleSwingAccel * TICK_DT;
  if (inputY !== 0) {
    g.len = Math.min(cfg.grappleRange, Math.max(cfg.grappleMinLength, g.len + inputY * cfg.grappleReelSpeed * TICK_DT));
  }
  p.vy += cfg.gravity * cfg.grappleGravityMult * gd * TICK_DT;
  if (p.vy * gd > cfg.terminalSpeed) p.vy = cfg.terminalSpeed * gd;
  clampSpeed(p, cfg.grappleMaxSpeed);
  moveBody(c);

  // Seil als Nebenbedingung: Wer weiter weg ist als die Seillänge, wird auf den Kreis zurück
  // geschoben (mit Kollision), und der Anteil des Tempos, der vom Anker weg zeigt, entfällt.
  // Übrig bleibt die Bewegung entlang des Bogens — das ist das Pendel.
  const cx = p.x + PLAYER_W / 2;
  const cy = p.y + PLAYER_H / 2;
  const dx = cx - g.ax;
  const dy = cy - g.ay;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d > g.len && d > 0) {
    const nx = dx / d;
    const ny = dy / d;
    const over = d - g.len;
    moveX(world, p, -nx * over);
    moveY(world, p, -ny * over, 0, gd);
    const radial = p.vx * nx + p.vy * ny;
    if (radial > 0) {
      p.vx -= radial * nx;
      p.vy -= radial * ny;
    }
  }
  if (Math.abs(p.vx) > 10) p.facing = Math.sign(p.vx);
}

// ── Dash ────────────────────────────────────────────────────────────────────

function startDash(c) {
  const { world, p, cfg, inputX, inputY } = c;
  let dx = inputX;
  let dy = inputY;
  if (dx === 0 && dy === 0) dx = p.facing;
  if (dx !== 0 && dy !== 0) {
    dx *= DIAG;
    dy *= DIAG;
  }
  p.dashDirX = dx;
  p.dashDirY = dy;
  p.dashTimer = Math.max(1, ticks(cfg.dashDuration));
  p.dashCharges--;
  p.dashCooldown = ticks(cfg.dashCooldownTime);
  p.jumping = false;
  p.dashGrace = 0;
  if (dx !== 0) p.facing = Math.sign(dx);
  world.emit('dash', { dx, dy });
}

function stepDash(c) {
  const { p, cfg } = c;
  p.dashTimer--;

  // Sprung im Dash: Boden-/Wandsprung mit Tempo-Erhalt. Der Sprung setzt Tempo und beendet
  // den Dash selbst; in diesem Tick wird nur noch bewegt.
  if (tryJump(c, false)) {
    moveBody(c);
    return;
  }

  p.vx = p.dashDirX * cfg.dashSpeed;
  p.vy = p.dashDirY * cfg.dashSpeed;
  moveBody(c);

  if (p.dashTimer <= 0) {
    p.vx = p.dashDirX * cfg.dashEndSpeed;
    p.vy = p.dashDirY * cfg.dashEndSpeed * (p.dashDirY * p.gd < 0 ? DASH_UP_END_MULT : 1);
    p.dashGrace = ticks(cfg.dashTechWindow);
  }
}

// ── Normalbewegung ──────────────────────────────────────────────────────────

function stepNormal(c) {
  const { p, cfg, inputX, inputY, jumpHeld } = c;
  const gd = p.gd;
  const grounded = p.onGround;
  const max = cfg.runMaxSpeed;
  const onIce = grounded && p.supKind === KIND.ICE;

  // Horizontal. Nach einem Wandsprung ist die Richtung zur Wand hin kurz gesperrt.
  let moveDir = inputX;
  if (p.wallLock > 0 && moveDir === p.wallLockDir) moveDir = 0;

  if (moveDir !== 0) {
    p.facing = moveDir;
    if (Math.abs(p.vx) > max && Math.sign(p.vx) === moveDir) {
      // Schneller als erlaubt und in Laufrichtung: Überschuss abbauen statt hart zu kappen —
      // so trägt ein Dash-Jump sein Tempo über die Lücke.
      p.vx = approach(p.vx, moveDir * max, cfg.overSpeedDrag * TICK_DT);
    } else {
      let accel = grounded ? cfg.groundAccel : cfg.airAccel;
      if (p.vx !== 0 && Math.sign(p.vx) !== moveDir) accel *= cfg.turnAccelMult;
      if (onIce) accel *= cfg.iceAccelMult;
      p.vx = approach(p.vx, moveDir * max, accel * TICK_DT);
    }
  } else if (Math.abs(p.vx) > max) {
    p.vx = approach(p.vx, Math.sign(p.vx) * max, cfg.overSpeedDrag * TICK_DT);
  } else {
    let decel = grounded ? cfg.groundDecel : cfg.airDecel;
    if (onIce) decel *= cfg.iceDecelMult;
    p.vx = approach(p.vx, 0, decel * TICK_DT);
  }

  tryJump(c, true);

  // Variable Sprunghöhe: Loslassen kappt den Aufstieg — aber erst nach der Mindest-Haltezeit,
  // damit auch ein Antippen einen brauchbaren Hüpfer ergibt.
  if (p.jumping) {
    p.jumpHold++;
    if (p.vy * gd >= 0) {
      p.jumping = false;
    } else if (!jumpHeld && p.jumpHold >= ticks(cfg.jumpMinHoldTime)) {
      p.vy *= cfg.jumpCutFactor;
      p.jumping = false;
    }
  }

  // Schwerkraft: im Scheitel leichter (Sprung "hängt" kurz), beim Fallen schwerer.
  let g = cfg.gravity;
  if (jumpHeld && !grounded && Math.abs(p.vy) < cfg.apexThreshold) g *= cfg.apexGravityMult;
  else if (p.vy * gd > 0) g *= cfg.fallGravityMult;
  p.vy += g * gd * TICK_DT;
  if (p.vy * gd > cfg.terminalSpeed) p.vy = cfg.terminalSpeed * gd;

  // An der Wand: Rutschen (nur, wenn man sich zur Wand hin lehnt und fällt) — oder Kleben an
  // einer klebrigen Wand: dort hält man sich und klettert mit Hoch/Runter.
  // An EIS findet die Hand keinen Halt: kein Bremsen, kein Wandsprung (siehe stepPlayer).
  const leaning = !grounded && p.wallDir !== 0 && inputX === p.wallDir;
  if (leaning && p.wallKind === KIND.STICKY) {
    p.clinging = true;
    p.vy = inputY * cfg.stickyClimbSpeed;
  } else if (leaning && p.wallKind !== KIND.ICE && p.vy * gd > 0) {
    p.sliding = true;
    if (p.vy * gd > cfg.wallSlideSpeed) p.vy = cfg.wallSlideSpeed * gd;
  }

  moveBody(c);
}

// ── Ein Tick ────────────────────────────────────────────────────────────────

export function stepPlayer(world, input) {
  const { cfg } = world;
  const p = world.player;
  const pressed = (bit) => (input & bit) !== 0 && (p.prevInput & bit) === 0;
  const held = (bit) => (input & bit) !== 0;
  const gd = p.gd;

  p.prevX = p.x;
  p.prevY = p.y;

  const c = {
    world, p, cfg, map: world.map,
    inputX: (held(INPUT.RIGHT) ? 1 : 0) - (held(INPUT.LEFT) ? 1 : 0),
    inputY: (held(INPUT.DOWN) ? 1 : 0) - (held(INPUT.UP) ? 1 : 0),
    jumpHeld: held(INPUT.JUMP),
  };

  // Timer
  if (p.coyote > 0) p.coyote--;
  if (p.wallCoyote > 0) p.wallCoyote--;
  if (p.wallLock > 0) p.wallLock--;
  if (p.dashCooldown > 0) p.dashCooldown--;
  if (p.dashGrace > 0) p.dashGrace--;
  if (p.grappleCooldown > 0) p.grappleCooldown--;
  if (p.dropTimer > 0) p.dropTimer--;
  if (p.portalCd > 0) p.portalCd--;
  if (pressed(INPUT.JUMP)) p.jumpBuffer = Math.max(1, ticks(cfg.jumpBufferTime));
  else if (p.jumpBuffer > 0) p.jumpBuffer--;
  // Dash-Puffer: Ein Dash, der einen Moment zu früh gedrückt wird (Abklingzeit läuft noch, der
  // Kristall ist gerade erst eingesammelt), geht nicht verloren, sondern startet, sobald er darf.
  if (pressed(INPUT.DASH)) p.dashBuffer = Math.max(1, ticks(cfg.dashBufferTime));
  else if (p.dashBuffer > 0) p.dashBuffer--;

  // Kontakt
  p.sliding = false;
  p.clinging = false;
  p.onGround = findSupport(world, p, PLAYER_W, PLAYER_H, gd);
  const kindL = wallKind(world, p, PLAYER_W, PLAYER_H, -1);
  const kindR = wallKind(world, p, PLAYER_W, PLAYER_H, 1);
  p.wallDir = 0;
  p.wallKind = KIND.AIR;
  if (kindL !== KIND.AIR && kindR !== KIND.AIR) {
    p.wallDir = c.inputX !== 0 ? c.inputX : p.facing;
    p.wallKind = p.wallDir < 0 ? kindL : kindR;
  } else if (kindL !== KIND.AIR) {
    p.wallDir = -1;
    p.wallKind = kindL;
  } else if (kindR !== KIND.AIR) {
    p.wallDir = 1;
    p.wallKind = kindR;
  }

  if (p.onGround) {
    p.coyote = Math.max(1, ticks(cfg.coyoteTime));
    p.airJumps = cfg.airJumps;
    p.lastGroundVx = p.supVx;
  } else if (p.wallDir !== 0 && p.wallKind !== KIND.ICE) {
    // Eiswände geben nichts her: kein Wandsprung, kein neuer Luftsprung. Sie begrenzen einen Schacht,
    // ohne ihn kletterbar zu machen — genau dafür gibt es sie (Rückmeldung vom 23.09.2026).
    p.wallCoyote = Math.max(1, ticks(cfg.wallCoyoteTime));
    p.wallCoyoteDir = p.wallDir;
    p.airJumps = cfg.airJumps;
  }

  // Seil loslassen: Taste hoch, Sprungtaste (zählt als Loslassen, nicht als Sprung) oder Sicht weg
  if (p.grapple) {
    const cx = p.x + PLAYER_W / 2;
    const cy = p.y + PLAYER_H / 2;
    const lost = !lineOfSight(world.map, cx, cy, p.grapple.ax, p.grapple.ay);
    const byJump = pressed(INPUT.JUMP);
    if (!held(INPUT.GRAPPLE) || byJump || lost) {
      if (byJump) p.jumpBuffer = 0;
      releaseGrapple(c, !lost);
    }
  }

  // Dash (bricht ein Seil ab)
  if (p.dashBuffer > 0 && p.dashCharges > 0 && p.dashCooldown <= 0 && p.dashTimer <= 0) {
    p.dashBuffer = 0;
    if (p.grapple) releaseGrapple(c, true);
    startDash(c);
  } else if (pressed(INPUT.GRAPPLE) && !p.grapple && p.grappleCooldown <= 0 && p.dashTimer <= 0) {
    const target = findGrappleTarget(world, c.inputX, c.inputY);
    if (target) attachGrapple(c, target);
  }

  if (p.dashTimer > 0) stepDash(c);
  else if (p.grapple) stepGrapple(c);
  else stepNormal(c);

  // Kontakt NACH der Bewegung, damit Rendering und Sound den aktuellen Stand sehen
  p.onGround = findSupport(world, p, PLAYER_W, PLAYER_H, p.gd);
  p.prevInput = input;
}
