// ui/table/scene/puppet.js — bewegt die Gestalt gegenüber (Rebuild „Am Tisch“, Phase 3).
//
// Die Gestalt führt die Züge des Gegenübers mit den Händen aus: Karte vom Stapel nehmen, Karte legen, opfern,
// stempeln, mit der Faust zuschlagen. Dazu die sechs Gesten (klopfen, nicken, Kopf schütteln, zeigen, Hände heben,
// verbeugen), der Blick, der dem Geschehen folgt, kleine Unruhe beim Nachdenken, Fingertrommeln bei knapper Zeit
// und das Zusammensacken, wenn die Verbindung weg ist.
//
// Jede Hand hat einen Zustand (Ort, Drehung, Krümmung der Finger) und eine Liste von Schritten. Ein neuer Auftrag
// ersetzt die Liste und beginnt dort, wo die Hand gerade ist — so reißt nichts ab, wenn Ereignisse dicht aufeinander
// folgen. Ist die Liste leer, kehrt die Hand von selbst an ihren Platz zurück.
// Alle Orte, die von außen kommen, sind Weltkoordinaten des Tischs (x rechts, y hoch, z zum Spieler).
import { poseHand } from "./figure.js";

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const ease = (x) => {
  const t = clamp(x, 0, 1);
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
};
const KEYS = ["x", "y", "z", "yaw", "pitch", "roll", "curl", "point"];
/** Wohin die Gestalt schaut, wenn nichts Besonderes geschieht. */
const LOOK_BOARD = { x: 0, y: 4, z: -4 };
const LOOK_PLAYER = { x: 0, y: 62, z: 96 };

/**
 * @param {ReturnType<typeof import("./figure.js").makeFigure>} figure
 * @param {{ onKnock?: (at: { x: number, z: number }) => void }} [opt]
 */
export function createPuppet(figure, opt = {}) {
  const origin = figure.group.position;
  const hands = figure.arms.map((arm, i) => {
    const rest = { x: arm.rest.x, y: 0, z: arm.rest.z, yaw: arm.rest.yaw, pitch: 0, roll: 0, curl: 0, point: 0 };
    return { i, arm, obj: arm.hand, rest, cur: { ...rest }, steps: [], step: null, lift: [0, 0, 0, 0], idleSince: 0 };
  });
  const mood = { turn: /** @type {"me" | "opp" | null} */ (null), hurry: false, away: false };
  let look = /** @type {{ x: number, y: number, z: number, until: number } | null} */ (null);
  let now = 0;
  let nodAt = -9;
  let shakeAt = -9;
  let bowAt = -9;
  let tiltAt = -9;
  let nextFidget = 4;
  let lean = figure.torso.rotation.x;
  const head = { yaw: 0, pitch: 0, roll: 0 };

  /** Auftrag für eine Hand: ersetzt, was sie gerade tut. */
  const run = (h, steps) => {
    h.steps = steps;
    h.step = null;
  };

  /** Lage der Hand (lokal), damit ihre Fingerspitzen über dem Punkt P (Welt) liegen. */
  const aim = (h, P, back = 7) => {
    const sx = origin.x + h.arm.shoulder.x;
    const sz = origin.z + 8;
    const yaw = clamp(Math.atan2(P.x - sx, P.z - sz), -0.95, 0.95);
    return { x: P.x - Math.sin(yaw) * back - origin.x, z: P.z - Math.cos(yaw) * back - origin.z, yaw };
  };
  const handFor = (x) => hands[x < 0 ? 0 : 1];

  /**
   * Karte tragen: hingreifen, hinübertragen, loslassen. Die Szene hängt die Karte zwischen `grab` und `drop`
   * (Sekunden ab jetzt) an den Griff der Hand (grip).
   * @param {{ x: number, y?: number, z: number }} from @param {{ x: number, y?: number, z: number }} to
   * @param {{ reach?: number, move?: number, hand?: number }} [o]
   */
  function carry(from, to, o = {}) {
    const h = o.hand !== undefined ? hands[o.hand] : handFor(to.x);
    const reach = o.reach ?? 0.12;
    const move = o.move ?? 0.24;
    const a = aim(h, from);
    const b = aim(h, to);
    run(h, [
      { to: { ...a, y: (from.y || 0) + 0.8, curl: 0.18, pitch: 0, roll: 0, point: 0 }, dur: reach, arc: 2 },
      { to: { ...b, y: (to.y || 0) + 2.4, curl: 0.22 }, dur: move, arc: 3.5 },
      { to: { ...b, y: (to.y || 0) + 1.6, curl: 0 }, dur: 0.08 },
    ]);
    return { hand: h.i, grab: reach, drop: reach + move };
  }

  /** Kurz antippen (Opfer, Beutel). */
  function tap(P, o = {}) {
    const h = o.hand !== undefined ? hands[o.hand] : handFor(P.x);
    const a = aim(h, P, 9);
    run(h, [
      { to: { ...a, y: 4, curl: 0.1, pitch: 0.1, roll: 0, point: 0 }, dur: 0.1, arc: 1.5 },
      { to: { ...a, y: 1.1, pitch: 0.16 }, dur: 0.05 },
      { to: { ...a, y: 3, pitch: 0 }, dur: 0.1 },
    ]);
    return h.i;
  }

  /** Mit der Faust zuschlagen (Hammer des Gegenübers). Einschlag nach 0,2 s. */
  function slam(P) {
    const h = handFor(P.x);
    const a = aim(h, P, 3);
    run(h, [
      { to: { ...a, y: 11, curl: 1, pitch: -0.45, roll: 0, point: 0 }, dur: 0.15, arc: 2 },
      { to: { ...a, y: 1.4, pitch: 0.12 }, dur: 0.05 },
      { to: { ...a, y: 1.4 }, dur: 0.14 },
    ]);
    return h.i;
  }

  /** Stempel greifen und ins Wachs drücken. @returns {number} Sekunden bis zum Abdruck */
  function stamp(P) {
    const h = handFor(P.x);
    const a = aim(h, P, 5);
    run(h, [
      { to: { ...a, y: 5.5, curl: 0.55, pitch: 0.1, roll: 0, point: 0 }, dur: 0.14, arc: 1.5 },
      { to: { ...a, y: 3.2 }, dur: 0.06 },
      { to: { ...a, y: 5 }, dur: 0.12 },
    ]);
    return 0.2;
  }

  /** Mit dem Zeigefinger auf einen Ort zeigen (auch weit weg, auf der Seite des Spielers). */
  function pointAt(P, hold = 1.0) {
    const h = handFor(P.x);
    const sx = origin.x + h.arm.shoulder.x;
    const sz = origin.z + 8;
    const yaw = clamp(Math.atan2(P.x - sx, P.z - sz), -0.95, 0.95);
    const dist = Math.hypot(P.x - sx, P.z - sz);
    const out = clamp(dist - 14, 26, 52);
    const to = { x: sx + Math.sin(yaw) * out - origin.x, z: sz + Math.cos(yaw) * out - origin.z, yaw, y: 8, pitch: 0.2, roll: 0, curl: 1, point: 1 };
    run(h, [{ to, dur: 0.24, arc: 2 }, { to, dur: hold }]);
    lookAt(P, hold + 0.4);
    return h.i;
  }

  /** Zweimal mit den Knöcheln auf den Tisch klopfen. */
  function knock() {
    const h = hands[1];
    const b = { x: h.rest.x - 4, z: h.rest.z + 4, yaw: h.rest.yaw, roll: 0, point: 0, curl: 1 };
    const hit = () => opt.onKnock?.({ x: origin.x + b.x, z: origin.z + b.z + 6 });
    run(h, [
      { to: { ...b, y: 5, pitch: -0.2 }, dur: 0.14 },
      { to: { ...b, y: 1.0, pitch: 0.2 }, dur: 0.06, onDone: hit },
      { to: { ...b, y: 3.6, pitch: -0.1 }, dur: 0.1 },
      { to: { ...b, y: 1.0, pitch: 0.2 }, dur: 0.06, onDone: hit },
      { to: { ...b, y: 2.4, pitch: 0 }, dur: 0.12 },
    ]);
  }

  /** Beide Hände heben, Handflächen nach vorn. */
  function raise() {
    for (const h of hands) {
      const to = { x: h.rest.x * 0.72, y: 19, z: h.rest.z - 9, yaw: h.rest.yaw * 0.4, pitch: -1.2, roll: 0, curl: 0, point: 0 };
      run(h, [{ to, dur: 0.3, arc: 1 }, { to, dur: 0.75 }]);
    }
  }

  /** @param {{ x: number, y?: number, z: number }} P @param {number} [hold] */
  function lookAt(P, hold = 1.2) {
    look = { x: P.x, y: P.y ?? 2, z: P.z, until: now + hold };
  }

  /**
   * Eine der sechs Gesten. @param {string} id @param {{ x: number, y?: number, z: number } | null} [target]
   */
  function gesture(id, target = null) {
    if (mood.away) return;
    if (id === "klopfen") knock();
    else if (id === "nicken") nodAt = now;
    else if (id === "kopfschuetteln") shakeAt = now;
    else if (id === "zeigen" && target) pointAt(target);
    else if (id === "haende") raise();
    else if (id === "verbeugen") bowAt = now;
    if (id !== "zeigen") look = { ...LOOK_PLAYER, until: now + 1.6 };
  }

  /** Griff einer Hand in Weltkoordinaten — dort liegt eine getragene Karte. @returns {number} Drehung der Hand */
  function grip(i, out) {
    const c = hands[i].cur;
    out.set(origin.x + c.x + Math.sin(c.yaw) * 7, Math.max(0.2, c.y - 0.5), origin.z + c.z + Math.cos(c.yaw) * 7);
    return c.yaw;
  }

  /** Kleine Unruhe beim Nachdenken: eine Hand fährt über die eigenen Karten, oder der Kopf legt sich schief. */
  function fidget() {
    const pick = Math.random();
    if (pick < 0.45) {
      const h = hands[Math.random() < 0.5 ? 0 : 1];
      const P = { x: (Math.random() - 0.5) * 12, z: origin.z + 27 };
      const a = aim(h, P, 8);
      run(h, [
        { to: { ...a, y: 3, curl: 0.12, pitch: 0, roll: 0, point: 0 }, dur: 0.45, arc: 2 },
        { to: { ...a, y: 1.8, curl: 0.2 }, dur: 0.25 },
        { to: { ...a, y: 2.6, curl: 0.1 }, dur: 0.5 },
      ]);
      look = { x: P.x, y: 1, z: P.z, until: now + 1.5 };
    } else tiltAt = now;
  }

  /**
   * @param {number} dt @param {number} t Szenen-Sekunden @param {boolean} reduced
   * @returns {boolean} hat sich eine Hand bewegt (dann müssen die Schatten neu gezeichnet werden)
   */
  function update(dt, t, reduced) {
    now = t;
    let moved = false;
    for (const h of hands) {
      const c = h.cur;
      if (!h.step && h.steps.length) {
        const s = h.steps.shift();
        h.step = { ...s, from: { ...c }, t0: t };
      }
      const home = mood.away
        ? { ...h.rest, x: h.rest.x * 0.9, z: h.rest.z - 5, curl: 0.4, roll: h.arm.side * 0.22 }
        : h.rest;
      if (!h.step && KEYS.some((k) => Math.abs(c[k] - home[k]) > 0.002)) {
        h.step = { to: home, dur: mood.away ? 0.9 : 0.3, from: { ...c }, t0: t, arc: 0 };
      }
      if (h.step) {
        const s = h.step;
        const k = reduced ? 1 : clamp((t - s.t0) / Math.max(0.001, s.dur), 0, 1);
        const e = ease(k);
        for (const key of KEYS) {
          if (s.to[key] !== undefined) c[key] = s.from[key] + (s.to[key] - s.from[key]) * e;
        }
        if (s.arc) c.y += Math.sin(Math.PI * k) * s.arc;
        if (k >= 1) {
          h.step = null;
          s.onDone?.();
        }
        h.idleSince = t;
        moved = true;
      }
      // Fingertrommeln, wenn die Zeit knapp wird
      const drum = mood.hurry && !mood.away && !h.step && h.i === 1 && !reduced;
      for (let f = 0; f < 4; f++) {
        const want = drum ? Math.max(0, Math.sin(t * 13 - f * 0.85)) ** 2 : 0;
        if (Math.abs(want - h.lift[f]) > 0.001) moved = true;
        h.lift[f] = want;
      }
      h.obj.group.position.set(c.x, c.y, c.z);
      h.obj.group.rotation.set(c.pitch, c.yaw, c.roll);
      const curls = [0, 1, 2, 3].map((f) => (f === h.obj.index ? c.curl * (1 - c.point) : c.curl));
      poseHand(h.obj, curls, h.lift);
    }

    // Nachdenken: gelegentlich eine kleine Bewegung, solange das Gegenüber am Zug ist und nichts geschieht
    if (mood.turn === "opp" && !mood.away && !reduced) {
      if (t > nextFidget && hands.every((h) => !h.step && !h.steps.length && t - h.idleSince > 2.2)) {
        fidget();
        nextFidget = t + 3.5 + Math.random() * 4;
      }
    } else nextFidget = t + 2.5;

    // Oberkörper: lehnt sich vor, je weiter eine Hand greift; verbeugt sich; sackt zusammen, wenn die Verbindung weg ist
    let reach = 0;
    for (const h of hands) reach = Math.max(reach, clamp((h.cur.z - h.rest.z) / 45, 0, 1));
    let leanGoal = mood.away ? 0.56 : 0.2 + reach * 0.2;
    const bo = t - bowAt;
    if (bo >= 0 && bo < 1.2) leanGoal += 0.34 * Math.sin(Math.PI * bo / 1.2);
    if (!reduced && !mood.away) leanGoal += Math.sin(t * 1.1) * 0.006;       // atmen
    lean += (leanGoal - lean) * (reduced ? 1 : Math.min(1, dt * 6));
    figure.torso.rotation.x = lean;

    // Kopf: schaut dem Geschehen nach, nickt, schüttelt sich
    const target = look && t < look.until ? look : mood.turn === "opp" ? LOOK_BOARD : LOOK_PLAYER;
    const hx = origin.x;
    const hy = origin.y + 36;
    const hz = origin.z + 10;
    let yawGoal = clamp(Math.atan2(target.x - hx, target.z - hz), -0.7, 0.7);
    let pitchGoal = clamp(Math.atan2(hy - (target.y ?? 0), Math.hypot(target.x - hx, target.z - hz)) - lean, -0.45, 0.42);
    let rollGoal = 0;
    if (mood.away) { yawGoal = 0.12; pitchGoal = 0.62; rollGoal = 0.16; }
    if (bo >= 0 && bo < 1.2) pitchGoal += 0.3 * Math.sin(Math.PI * bo / 1.2);
    const ti = t - tiltAt;
    if (ti >= 0 && ti < 1.6) rollGoal += 0.13 * Math.sin(Math.PI * ti / 1.6);
    const follow = reduced ? 1 : Math.min(1, dt * 7);
    head.yaw += (yawGoal - head.yaw) * follow;
    head.pitch += (pitchGoal - head.pitch) * follow;
    head.roll += (rollGoal - head.roll) * follow;
    let yaw = head.yaw;
    let pitch = head.pitch;
    const no = t - nodAt;
    if (no >= 0 && no < 0.9 && !reduced) pitch += 0.3 * Math.sin(no / 0.9 * Math.PI * 4) ** 2 * (1 - no / 0.9 * 0.4);
    const shk = t - shakeAt;
    if (shk >= 0 && shk < 1.0 && !reduced) yaw += 0.36 * Math.sin(shk / 1.0 * Math.PI * 5) * (1 - shk / 1.0);
    figure.head.rotation.set(pitch, yaw, head.roll);
    figure.fitArms();
    return moved;
  }

  return {
    update, carry, tap, slam, stamp, pointAt, lookAt, gesture, grip,
    /** @param {Partial<typeof mood>} m */
    setMood(m) { Object.assign(mood, m); },
    get busy() { return hands.some((h) => h.step || h.steps.length); },
  };
}
