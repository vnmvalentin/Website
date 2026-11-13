// Ego-Volleyball — Übungsgegner.
//
// Spielt mit denselben Eingaben wie ein Mensch (laufen, Blick, Klick) und mit menschlichen
// Schwächen: Er entscheidet nur alle 200–330 ms neu, verschätzt sich beim Landepunkt,
// zielt ungenau, klickt mit etwas Verzögerung und haut ab und zu daneben. Ein perfekter
// Bot spielt endlos und taugt weder zum Üben noch als Maßstab für die Feldgröße — gemessen
// wird immer mit diesem hier (Bot gegen Bot: im Median 8 Berührungen und 12 s je Ballwechsel).
import {
  COURTS, teamOf, startPos, startYaw, predictLanding, inReach, netTop, ATTACK_ZONE,
  BALL_RADIUS, BALL_GRAVITATION, NET_RADIUS, HIT_SPEED, BLOBBY_HALF_H,
} from "./sim";

const HIT_LIFT = 0.16;   // wie in sim.js: kleiner Auftrieb auf jeden Schlag

// Menschliche Schwächen (in Frames zu 13,3 ms bzw. Feldeinheiten und Bogenmaß)
const THINK_MIN = 15;          // neu entscheiden alle 200–330 ms
const THINK_SPAN = 10;
const LAND_ERR_BASE = 25;      // Schätzfehler beim Landepunkt …
const LAND_ERR_PER_FRAME = 0.4;  // … wächst mit der restlichen Flugzeit
const ARM_MIN = 3;             // 40–130 ms vom Erkennen bis zum Klick
const ARM_SPAN = 7;
const AIM_YAW_ERR = 0.16;
const AIM_PITCH_ERR = 0.1;
const WHIFF = 0.08;            // so oft kommt der Klick zu spät

export function createBot(slot) {
  return {
    slot, think: 0, go: false, tx: 0, tz: 0, aimX: 0, aimZ: 0,
    yaw: startYaw(slot), pitch: 0.3, hc: 0, hk: 1, dc: 0, jump: 0, wait: 0, arm: -1,
  };
}

// Fliegt ein Schlag mit diesem Winkel übers Netz? Kurze Flugbahn bis zur Netzebene.
function clearsNet(ball, yaw, theta, speed, top) {
  let x = ball.x, y = ball.y;
  const vx = Math.cos(yaw) * Math.cos(theta) * speed;
  let vy = Math.sin(theta) * speed;
  if (Math.abs(vx) < 0.5) return false;
  const start = Math.sign(x) || -1;
  for (let i = 0; i < 400; i++) {
    vy -= BALL_GRAVITATION;
    x += vx; y += vy;
    if (y < BALL_RADIUS) return false;
    if (Math.sign(x) !== start) return y > top + BALL_RADIUS + NET_RADIUS + 12;
  }
  return false;
}

// Abschusswinkel, mit dem der Ball in waagrechter Entfernung D landet (flache Lösung
// zuerst, sonst die hohe; ohne Lösung 45°)
function launchAngle(ball, yaw, D, speed, top) {
  const g = BALL_GRAVITATION;
  const yT = -(ball.y - BALL_RADIUS);
  const v2 = speed * speed;
  const disc = v2 * v2 - g * (g * D * D + 2 * yT * v2);
  if (disc < 0) return Math.PI / 4;
  const root = Math.sqrt(disc);
  const low = Math.atan((v2 - root) / (g * D));
  if (clearsNet(ball, yaw, low, speed, top)) return low;
  return Math.atan((v2 + root) / (g * D));
}

export function botInput(w, m, rnd = Math.random) {
  const b = w.blobs[m.slot];
  const ball = w.ball;
  const court = COURTS[w.mode];
  const team = teamOf(m.slot);
  const side = team === 1 ? -1 : 1;
  const noise = (a) => (rnd() * 2 - 1) * a;

  m.think -= 1;
  if (m.think <= 0) {
    m.think = THINK_MIN + Math.floor(rnd() * THINK_SPAN);
    const waiting = w.hover > 0 || w.phase !== "rally";
    const land = waiting ? { x: ball.x, z: ball.z } : predictLanding(ball, w.mode, netTop(w));
    let mine = !!land && land.x * side > 0;
    if (mine && w.mode === "2v2") {
      const mate = w.blobs[m.slot <= 2 ? m.slot + 2 : m.slot - 2];
      const own = Math.hypot(land.x - b.x, land.z - b.z);
      const other = Math.hypot(land.x - mate.x, land.z - mate.z);
      // Gleich weit weg: der vordere Platz geht (sonst laufen beide oder keiner)
      if (other < own - 30 || (Math.abs(other - own) <= 30 && m.slot > 2)) mine = false;
    }
    m.go = mine;
    if (mine) {
      // Je länger der Ball noch fliegt, desto schlechter schätzt man, wo er herunterkommt
      const err = waiting ? 12 : LAND_ERR_BASE + (land.frames || 0) * LAND_ERR_PER_FRAME;
      m.tx = land.x + side * (20 + rnd() * 22) + noise(err);
      m.tz = land.z + noise(err);
    } else {
      const home = startPos(m.slot, w.mode);
      m.tx = home.x;
      m.tz = home.z;
    }
    m.aimX = -side * court.L * (0.3 + rnd() * 0.5);
    m.aimZ = noise(court.W * 0.7);
  }

  let dx = m.tx - b.x;
  let dz = m.tz - b.z;
  const dist = Math.hypot(dx, dz);
  if (dist > 10) { dx /= dist; dz /= dist; } else { dx = 0; dz = 0; }
  if (m.go && dist > 280 && b.dashCool <= 0 && rnd() < 0.04) m.dc += 1;

  const flat = Math.hypot(ball.x - b.x, ball.z - b.z);
  const above = ball.y - b.y;
  if (m.go && w.hover <= 0 && flat < 95 && ball.vy < 0 && above > 170 && above < 300 && rnd() < 0.2) m.jump = 16;
  if (m.jump > 0) m.jump -= 1;

  // Solange er nicht schlägt, schaut er ins gegnerische Feld (das sieht man seiner Figur an)
  const aimYaw = Math.atan2(m.aimZ - ball.z, m.aimX - ball.x);
  if (m.wait > 0) m.wait -= 1;
  const ready = w.phase === "rally" && m.wait <= 0 && inReach(ball, b) && (w.hover > 0 || ball.vy < 3);
  if (!ready) {
    m.arm = -1;
    m.yaw = aimYaw;
    m.pitch = 0.3;
  } else if (m.arm < 0) {
    m.arm = ARM_MIN + Math.floor(rnd() * ARM_SPAN);
  } else if (m.arm > 0) {
    m.arm -= 1;
  } else if (rnd() < WHIFF) {
    m.arm = -1;
    m.wait = 22;
  } else {
    m.arm = -1;
    m.wait = 34;
    m.yaw = aimYaw + noise(AIM_YAW_ERR);
    const deep = Math.abs(ball.x) > court.L * 0.6;
    const mayTouchAgain = w.maxTouches === 0 || w.lastTeam !== team || w.touches < w.maxTouches - 1;
    if (deep && mayTouchAgain && rnd() < 0.45) {
      m.hk = 2;
    } else {
      m.hk = 1;
      const air = b.y > BLOBBY_HALF_H * b.s + 30 && Math.abs(b.x) < court.L * ATTACK_ZONE;
      if (air) {
        // Schmetterball: Der Drall bringt ihn ins Feld. Am Netz reicht fast geradeaus, von
        // der Angriffslinie aus oder bei tiefem Ball muss er höher zielen, um drüberzukommen.
        const low = ball.y < netTop(w) + 90;
        m.pitch = 0.05 + 0.6 * (Math.abs(b.x) / court.L) + (low ? 0.15 : 0) + noise(AIM_PITCH_ERR);
      } else {
        const D = Math.max(120, Math.hypot(m.aimX - ball.x, m.aimZ - ball.z));
        const theta = launchAngle(ball, m.yaw, D, HIT_SPEED, netTop(w));
        // Der Schlag bekommt in sim.js einen kleinen Auftrieb — den zieht der Bot beim Zielen ab
        m.pitch = theta - HIT_LIFT * Math.cos(theta) + noise(AIM_PITCH_ERR);
      }
    }
    m.hc += 1;
  }

  return { dx, dz, jump: m.jump > 0, yaw: m.yaw, pitch: m.pitch, hc: m.hc, hk: m.hk, dc: m.dc };
}
