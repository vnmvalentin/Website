// raveMoves.js — Rave-/Hardstyle-Tänze für die Comic-Figuren, errechnet statt aufgenommen.
//
// Für harte, schnelle Musik (Hardtechno, Hardstyle, 140–160 BPM) gibt es keine freie
// Motion-Capture. Diese Tänze werden deshalb beim Laden aus Posen gebaut: Jede Bewegung ist eine
// Funktion „Schlag → Pose“ (Hüfte, Rumpf, Kopf, Hand- und Fußziele), Arme und Beine folgen per
// Zwei-Knochen-IK. Die Längsdrehung jedes Glieds ist fest vorgegeben — dadurch verdreht sich
// die Haut nie (vgl. legTwistFix.js).
//
// Die Clips sind auf Schläge geeicht (`clip.userData.beats`) und werden in der Szene direkt an
// den Takt gekoppelt: gesprungen wird auf der Kick, nicht irgendwann.
//
// Koordinaten: Skelett von clips.glb in Weltmaß (Figur ≈ 3,2 hoch), Blick nach +z, links = +x.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

/** Abtastung je Schlag (linear interpoliert reicht bei dieser Dichte). */
const SAMPLES_PER_BEAT = 16;
/** Nenn-Tempo der Clips (nur für die Clip-Dauer; abgespielt wird taktgekoppelt). */
const NOMINAL_BPM = 150;
const GROUND = 0.022;          // Höhe des Fußknochens, wenn die Sohle auf dem Boden steht

const PI = Math.PI;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const ease = (x) => { const t = clamp01(x); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
/** Tiefpunkt auf dem Schlag, weich zurück (Federn in den Knien). */
const bounce = (f, k) => -k * (0.5 + 0.5 * Math.cos(2 * PI * f));
/** Flugbahn eines Sprungs, Landung auf dem Schlag. */
const air = (f) => 4 * f * (1 - f);
/** Schneller Ausschlag direkt nach dem Schlag. */
const snap = (f) => Math.exp(-f * 6);
/** Stoß nach oben mit Spitze kurz nach dem Schlag, dann zurück. */
const thrust = (f) => (f < 0.14 ? ease(f / 0.14) : 1 - ease((f - 0.14) / 0.86));

/** Fußziel: Seite s (+1 links, −1 rechts). */
const foot = (s, x, lift = 0, z = 0, yaw = 0, toe = 0) => ({ pos: [s * x, GROUND + lift, z], yaw: s * yaw, toe });
/** Handziel relativ zum Schultergelenk, im Rumpf-Rahmen. pole: wohin der Ellbogen zeigt. */
const hand = (s, x, y, z, pole = [1, -0.3, -0.6]) => ({ pos: [s * x, y, z], pole: [s * pole[0], pole[1], pole[2]] });

/**
 * Tänze: beats = Länge der Schleife in Schlägen, pose(b) mit b ∈ [0, beats).
 * Jede Pose: hip [x,y,z] (Verschiebung), hipRot/spine/head [Nicken, Drehen, Neigen],
 * armL/armR (hand), legL/legR (foot). Gespiegelte Fassungen entstehen automatisch („…_m“).
 */
const MOVES = {
  /** Faust in die Luft auf jeden Schlag, die andere Hand am Bauch, Knie federn. */
  fistpump: {
    beats: 4,
    pose(b) {
      const f = b % 1;
      const up = thrust(f);
      return {
        hip: [0, -0.05 + bounce(f, 0.07), 0],
        hipRot: [0, 0.1 * Math.sin(PI * b / 2), 0],
        spine: [0.1 + 0.08 * snap(f), 0, -0.04 * up],
        head: [-0.08 + 0.22 * snap(f), 0, 0],
        armR: hand(-1, lerp(0.08, 0.42, up), lerp(0.05, 0.8, up), lerp(0.32, 0.2, up), [1, -0.6, -0.2]),
        armL: hand(1, -0.12, -0.42, 0.3, [1, 0, -0.5]),
        legL: foot(1, 0.3, 0, 0.03, 0.25),
        legR: foot(-1, 0.3, 0, -0.03, 0.25),
      };
    },
  },
  /** Hände hoch und springen — Landung auf jeder Kick. */
  handsup: {
    beats: 2,
    pose(b) {
      const f = b % 1;
      const h = air(f);
      const wave = Math.sin(PI * b);
      return {
        hip: [0, 0.2 * h - 0.08 * snap(f * 1.5), 0],
        spine: [-0.06, 0, 0.05 * wave],
        head: [-0.2 + 0.12 * snap(f), 0, 0.05 * wave],
        armL: hand(1, 0.54 + 0.06 * wave, 0.7 + 0.05 * h, 0.14, [1, -0.2, -0.3]),
        armR: hand(-1, 0.54 - 0.06 * wave, 0.7 + 0.05 * h, 0.14, [1, -0.2, -0.3]),
        legL: foot(1, 0.22, 0.17 * h, 0, 0.15, 0.4 * h),
        legR: foot(-1, 0.22, 0.17 * h, 0, 0.15, 0.4 * h),
      };
    },
  },
  /** Jumpstyle: jeder Schlag ein Hüpfer, ein Bein tritt im Wechsel nach vorn und hinten. */
  jumpstyle: {
    beats: 4,
    pose(b) {
      const i = Math.floor(b) % 4;
      const f = b % 1;
      const h = air(f) * 0.6;
      const kick = Math.sin(PI * f);
      const side = i < 2 ? -1 : 1;                 // erst rechts, dann links
      const fwd = i % 2 === 0;
      const kickFoot = fwd
        ? foot(side, 0.16, 0.08 + 0.42 * kick + 0.1 * h, 0.12 + 0.62 * kick, 0.1, -0.6 * kick)
        : foot(side, 0.16, 0.08 + 0.34 * kick + 0.1 * h, -0.08 - 0.52 * kick, 0.1, 0.7 * kick);
      const standFoot = foot(-side, 0.18, 0.1 * h, 0, 0.15);
      // Arme gegengleich zum Tritt: Bein vorn → gleichseitiger Arm hinten
      const swing = (fwd ? 1 : -1) * kick;
      const armOf = (s) => {
        const a = s === side ? -swing : swing;
        return hand(s, 0.08, lerp(-0.45, -0.1, Math.abs(a)), 0.22 + 0.3 * a, [1, -0.6, -0.4]);
      };
      return {
        hip: [0, 0.14 * h - 0.06 * snap(f * 1.5), -0.04 * swing],
        spine: [fwd ? -0.12 * kick : 0.18 * kick, 0.12 * side * kick, 0],
        head: [0.12 * snap(f), 0, 0],
        armL: armOf(1),
        armR: armOf(-1),
        legL: side === 1 ? kickFoot : standFoot,
        legR: side === -1 ? kickFoot : standFoot,
      };
    },
  },
  /** Running Man (Shuffle): ein Knie hoch, der Standfuß gleitet nach hinten. */
  shuffle: {
    beats: 2,
    pose(b) {
      const f = b % 1;
      const leg = (s) => {
        const ph = (b + (s === 1 ? 0 : 1)) % 2;
        if (ph < 1) return foot(s, 0.17, 0, lerp(0.2, -0.28, ph), 0.08);
        const u = ph - 1;
        return foot(s, 0.17, 0.4 * Math.sin(PI * u), lerp(-0.28, 0.2, ease(u)), 0.08, -0.35 * Math.sin(PI * u));
      };
      const arm = (s) => {
        const w = Math.sin(PI * (b + (s === 1 ? 1 : 0)));   // gegengleich zum Bein
        return hand(s, 0.1, -0.3 + 0.22 * Math.max(0, w), 0.22 + 0.18 * w, [1, -0.5, -0.5]);
      };
      return {
        hip: [0, -0.06 + bounce(f, 0.06), 0],
        hipRot: [0, 0.08 * Math.sin(PI * b), 0],
        spine: [0.1, -0.08 * Math.sin(PI * b), 0],
        head: [0.05 + 0.1 * snap(f), 0, 0],
        armL: arm(1),
        armR: arm(-1),
        legL: leg(1),
        legR: leg(-1),
      };
    },
  },
  /** Headbang: breiter Stand, Oberkörper schlägt auf die Kick nach vorn. */
  headbang: {
    beats: 2,
    pose(b) {
      const f = b % 1;
      const hit = snap(f);
      return {
        hip: [0, -0.13 + bounce(f, 0.05), -0.04],
        spine: [0.22 + 0.32 * hit, 0, 0],
        head: [-0.15 + 0.6 * hit, 0, 0.06 * Math.sin(PI * b)],
        armL: hand(1, 0.05, -0.62, 0.32 + 0.1 * hit, [1, -0.2, -0.6]),
        armR: hand(-1, 0.44, 0.78, 0.14, [1, -0.4, -0.3]),       // Pommesgabel oben (seitlich — der Kopf ist groß)
        legL: foot(1, 0.36, 0, 0.04, 0.3),
        legR: foot(-1, 0.36, 0, -0.04, 0.3),
      };
    },
  },
  /** Hakken (Gabber): Stampfen im Wechsel, Knie hoch vorn, Fäuste stoßen nach unten. */
  hakken: {
    beats: 2,
    pose(b) {
      const f = b % 1;
      const i = Math.floor(b) % 2;
      const lifted = i === 0 ? 1 : -1;
      const lift = Math.sin(PI * f);
      const leg = (s) => (s === lifted
        ? foot(s, 0.17, 0.3 * lift, 0.16 * lift, 0.05, -0.3 * lift)
        : foot(s, 0.19, 0, -0.02, 0.15 + 0.25 * Math.sin(PI * b)));
      const arm = (s) => (s === lifted
        ? hand(s, 0.12, lerp(-0.05, -0.38, snap(f)), 0.42, [1, -0.4, -0.6])
        : hand(s, 0.1, -0.18, 0.2, [1, -0.4, -0.6]));
      return {
        hip: [0, -0.08 + bounce(f, 0.06), 0],
        hipRot: [0, 0.12 * lifted * lift, 0],
        spine: [0.2 + 0.1 * snap(f), -0.1 * lifted * lift, 0],
        head: [0.05 + 0.15 * snap(f), 0, 0],
        armL: arm(1),
        armR: arm(-1),
        legL: leg(1),
        legR: leg(-1),
      };
    },
  },
  /** Laser: beide Arme gestreckt, schwenken über vier Schläge von Seite zu Seite. */
  laser: {
    beats: 4,
    pose(b) {
      const f = b % 1;
      const th = Math.sin(PI * b / 2) * 1.05;
      const dir = [Math.sin(th), 0.5 + 0.15 * Math.cos(PI * b), Math.cos(th) * 0.75];
      const len = Math.hypot(...dir);
      const reach = 0.9 / len;
      return {
        hip: [0, -0.04 + bounce(f, 0.06), 0],
        hipRot: [0, 0.25 * th, 0],
        spine: [0.04, 0.2 * th, -0.08 * th],
        head: [-0.05 + 0.1 * snap(f), 0.3 * th, 0],
        armL: hand(1, dir[0] * reach, dir[1] * reach, dir[2] * reach, [1, -1, -0.2]),
        armR: hand(-1, -dir[0] * reach, dir[1] * reach, dir[2] * reach, [1, -1, -0.2]),
        legL: foot(1, 0.27, 0, 0, 0.2),
        legR: foot(-1, 0.27, 0, 0, 0.2),
      };
    },
  },
  /** Klatschen vor dem Gesicht (über den großen Kopf reichen die Arme nicht), auf jeden Schlag ein Hüpfer. */
  clapjump: {
    beats: 2,
    pose(b) {
      const f = b % 1;
      const h = air(f) * 0.7;
      const open = ease(Math.min(1, f * 2.2)) * (1 - ease((f - 0.6) / 0.4));
      return {
        hip: [0, 0.14 * h - 0.06 * snap(f * 1.5), 0],
        spine: [-0.08, 0, 0],
        head: [-0.25 + 0.1 * snap(f), 0, 0],
        armL: hand(1, lerp(-0.27, 0.16, open), lerp(0.52, 0.42, open), lerp(0.58, 0.45, open), [1, -0.3, -0.4]),
        armR: hand(-1, lerp(-0.27, 0.16, open), lerp(0.52, 0.42, open), lerp(0.58, 0.45, open), [1, -0.3, -0.4]),
        legL: foot(1, 0.2, 0.12 * h, 0, 0.15),
        legR: foot(-1, 0.2, 0.12 * h, 0, 0.15),
      };
    },
  },
  /** Seitkick im Wechsel, Arme gehen zur Gegenseite. */
  sidekick: {
    beats: 2,
    pose(b) {
      const f = b % 1;
      const i = Math.floor(b) % 2;
      const kicker = i === 0 ? 1 : -1;
      const k = Math.sin(PI * f);
      const leg = (s) => (s === kicker
        ? foot(s, lerp(0.2, 0.72, k), 0.36 * k, 0.05, 0.1, 0)
        : foot(s, 0.2, 0, 0, 0.2));
      const arm = (s) => (s === kicker
        ? hand(s, 0.05, lerp(-0.35, -0.15, k), 0.3, [1, -0.5, -0.5])
        : hand(s, lerp(0.1, 0.55, k), lerp(-0.3, 0.25, k), 0.18, [0.3, -1, -0.3]));
      return {
        hip: [-0.06 * kicker * k, -0.06 + bounce(f, 0.05), 0],
        spine: [0.06, 0, -0.18 * kicker * k],
        head: [0.08 * snap(f), 0, 0.1 * kicker * k],
        armL: arm(1),
        armR: arm(-1),
        legL: leg(1),
        legR: leg(-1),
      };
    },
  },
  /** Floss: beide Arme schwingen gemeinsam von Seite zu Seite (einer vor, einer hinter dem Körper), Hüfte gegenläufig. */
  floss: {
    beats: 4,
    pose(b) {
      const f = b % 1;
      const side = Math.floor(b) % 2 === 0 ? 1 : -1;
      const sw = side * (2 * ease(Math.min(1, f * 2.2)) - 1);   // schnell rüber, dann kurz halten
      const c = Math.cos(PI * b / 2);                           // welcher Arm vorn vorbeigeht
      const armOf = (s) => ({ pos: [sw * 0.45 - s * 0.28, -0.52, 0.1 + 0.2 * s * c], pole: [s, -0.3, -0.6] });
      return {
        hip: [-0.07 * sw, -0.04 + bounce(f, 0.04), 0],
        hipRot: [0, -0.1 * sw, 0],
        spine: [0.04, 0.12 * sw, 0],
        head: [0, -0.1 * sw, 0],
        armL: armOf(1),
        armR: armOf(-1),
        legL: foot(1, 0.24, 0, 0, 0.15),
        legR: foot(-1, 0.24, 0, 0, 0.15),
      };
    },
  },
  /** Twist: Knie gebeugt, Hüfte und Füße drehen, der Oberkörper dreht dagegen. */
  twist: {
    beats: 2,
    pose(b) {
      const f = b % 1;
      const w = Math.sin(PI * b);
      const arm = (s) => hand(s, 0.16, -0.22, 0.3 + 0.16 * s * w, [1, -0.5, -0.6]);
      return {
        hip: [0, -0.12 + bounce(f, 0.03), 0],
        hipRot: [0, 0.38 * w, 0],
        spine: [0.1, -0.6 * w, 0],
        head: [0, 0.2 * w, 0],
        armL: arm(1),
        armR: arm(-1),
        // beide Füße drehen in dieselbe Richtung (foot() spiegelt die Drehung je Seite)
        legL: foot(1, 0.2, 0, 0.05 * w, 0.15 + 0.45 * w),
        legR: foot(-1, 0.2, 0, -0.05 * w, 0.15 - 0.45 * w),
      };
    },
  },
  /** Disco: zwei Schläge schräg nach oben zeigen, zwei Schläge quer nach unten; andere Hand in der Hüfte. */
  pointer: {
    beats: 4,
    pose(b) {
      const f = b % 1;
      const u = b < 2 ? ease(b / 0.5) : 1 - ease((b - 2) / 0.5);
      const top = hand(-1, 0.55, 0.68 + 0.05 * thrust(f), 0.1, [1, -0.6, -0.3]);
      const low = hand(-1, -0.42, -0.45, 0.32, [1, -0.3, -0.6]);
      return {
        hip: [0.07 * (2 * u - 1), -0.04 + bounce(f, 0.05), 0],
        hipRot: [0, 0.1 * (2 * u - 1), 0],
        spine: [0.02, -0.12 * (2 * u - 1), 0],
        head: [lerp(0.1, -0.15, u), -0.3 * (2 * u - 1), 0],
        armR: { pos: low.pos.map((v, i) => lerp(v, top.pos[i], u)), pole: low.pole.map((v, i) => lerp(v, top.pole[i], u)) },
        armL: hand(1, 0.36, -0.3, -0.02, [1, 0.2, -0.8]),
        legL: foot(1, 0.26, 0, 0.02, 0.2),
        legR: foot(-1, 0.26, 0, -0.02, 0.2),
      };
    },
  },
  /** Arme oben (V) und gemeinsam von Seite zu Seite schwenken — wie vor einer Festivalbühne. */
  wavearms: {
    beats: 4,
    pose(b) {
      const f = b % 1;
      const sw = Math.sin(PI * b / 2);
      return {
        hip: [-0.05 * sw, -0.03 + bounce(f, 0.04), 0],
        spine: [-0.04, 0, -0.12 * sw],
        head: [-0.12, 0, -0.06 * sw],
        armL: hand(1, 0.5 + 0.2 * sw, 0.72 - 0.06 * Math.abs(sw), 0.1, [1, -0.3, -0.3]),
        armR: hand(-1, 0.5 - 0.2 * sw, 0.72 - 0.06 * Math.abs(sw), 0.1, [1, -0.3, -0.3]),
        legL: foot(1, 0.26, 0, 0, 0.15),
        legR: foot(-1, 0.26, 0, 0, 0.15),
      };
    },
  },
  /** Kasatschok: tief in der Hocke, die Beine treten im Wechsel nach vorn, Arme vor der Brust verschränkt. */
  kazotsky: {
    beats: 2,
    pose(b) {
      const f = b % 1;
      const kicker = Math.floor(b) % 2 === 0 ? 1 : -1;
      const k = Math.sin(PI * f);
      const leg = (s) => (s === kicker
        ? foot(s, 0.16, 0.06 + 0.1 * k, 0.12 + 0.5 * k, 0, -0.5 * k)
        : foot(s, 0.2, 0, -0.06, 0.3));
      return {
        hip: [0, -0.34 + 0.08 * k, -0.1],
        spine: [-0.08, 0, 0],
        head: [-0.05 + 0.1 * snap(f), 0, 0],
        armL: hand(1, -0.14, -0.08, 0.34, [1, -0.2, -0.3]),
        armR: hand(-1, -0.14, -0.14, 0.38, [1, -0.2, -0.3]),
        legL: leg(1),
        legR: leg(-1),
      };
    },
  },
  /** Seitschritt: Schritt zur Seite, Fuß heranziehen und klatschen — zwei Schläge hin, zwei zurück. */
  twostep: {
    beats: 4,
    pose(b) {
      const f = b % 1;
      const i = Math.floor(b) % 4;
      const e = ease(f);
      const lift = 0.14 * Math.sin(PI * f);
      // Fußlagen (Welt-x) je Schlag: links raus, rechts ran, rechts raus, links ran
      const xL = i === 0 ? lerp(0.06, 0.34, e) : i === 3 ? lerp(0.34, 0.06, e) : 0.34;
      const xR = i === 1 ? lerp(-0.34, -0.06, e) : i === 2 ? lerp(-0.06, -0.34, e) : -0.34;
      const cx = (xL + xR) / 2;
      const clap = i % 2 === 1 ? Math.sin(PI * f) ** 2 : 0;
      const arm = (s) => {
        const rest = hand(s, 0.12, -0.4, 0.2, [1, -0.4, -0.6]);
        const meet = hand(s, -0.26, 0.05, 0.5, [1, -0.3, -0.4]);
        return { pos: rest.pos.map((v, j) => lerp(v, meet.pos[j], clap)), pole: rest.pole.map((v, j) => lerp(v, meet.pole[j], clap)) };
      };
      return {
        hip: [cx, -0.05 + bounce(f, 0.04), 0],
        spine: [0.04, 0, 0],
        head: [0.03 + 0.1 * snap(f), 0, 0],
        armL: arm(1),
        armR: arm(-1),
        legL: { pos: [xL, GROUND + ((i === 0 || i === 3) ? lift : 0), 0], yaw: 0.15, toe: 0 },
        legR: { pos: [xR, GROUND + ((i === 1 || i === 2) ? lift : 0), 0], yaw: -0.15, toe: 0 },
      };
    },
  },
  /** Ruhiges Wiegen für leise Stellen: Gewicht von Bein zu Bein, Arme locker, Kopf nickt. */
  sway: {
    beats: 4,
    pose(b) {
      const f = b % 1;
      const sw = Math.sin(PI * b / 2);
      return {
        hip: [0.09 * sw, -0.04 + bounce(f, 0.025), 0],
        hipRot: [0, 0.06 * sw, 0],
        spine: [0.03, 0, 0.06 * sw],
        head: [0.04 + 0.08 * snap(f), 0, -0.05 * sw],
        armL: hand(1, 0.14, -0.5 + 0.05 * sw, 0.14 + 0.06 * sw, [1, -0.3, -0.7]),
        armR: hand(-1, 0.14, -0.5 - 0.05 * sw, 0.14 - 0.06 * sw, [1, -0.3, -0.7]),
        legL: foot(1, 0.24, 0, 0, 0.15),
        legR: foot(-1, 0.24, 0, 0, 0.15),
      };
    },
  },
  /** Roboter: auf jeden Schlag rastet eine neue eckige Armhaltung ein, dazwischen steht die Figur starr. */
  robot: {
    beats: 4,
    pose(b) {
      const f = b % 1;
      const i = Math.floor(b) % 4;
      const k = ease(Math.min(1, f / 0.22));
      const P = [
        { l: hand(1, 0.45, 0.2, 0.15, [1, -1, -0.2]), r: hand(-1, 0.3, -0.35, 0.3, [1, -0.3, -0.8]), yaw: 0.25 },
        { l: hand(1, 0.3, -0.35, 0.3, [1, -0.3, -0.8]), r: hand(-1, 0.45, 0.2, 0.15, [1, -1, -0.2]), yaw: -0.25 },
        { l: hand(1, 0.15, 0, 0.6, [1, -0.6, -0.3]), r: hand(-1, 0.15, 0, 0.6, [1, -0.6, -0.3]), yaw: 0 },
        { l: hand(1, 0.75, 0, 0.05, [0.2, -1, -0.3]), r: hand(-1, 0.2, -0.1, 0.5, [1, -0.6, -0.3]), yaw: 0.15 },
      ];
      const a = P[(i + 3) % 4], c = P[i];
      const mix = (x, y) => ({ pos: x.pos.map((v, j) => lerp(v, y.pos[j], k)), pole: x.pole.map((v, j) => lerp(v, y.pole[j], k)) });
      const yaw = lerp(a.yaw, c.yaw, k);
      return {
        hip: [0, -0.05 - 0.03 * snap(f * 2), 0],
        spine: [0.02, yaw, 0],
        head: [0, -yaw * 1.6, 0],
        armL: mix(a.l, c.l),
        armR: mix(a.r, c.r),
        legL: foot(1, 0.26, 0, 0, 0.1),
        legR: foot(-1, 0.26, 0, 0, 0.1),
      };
    },
  },
  /** Beide Hände zeigen nach vorn oben und stoßen im Wechsel im Takt — breiter Stand, tiefes Federn. */
  gunfingers: {
    beats: 2,
    pose(b) {
      const f = b % 1;
      const i = Math.floor(b) % 2;
      const p = (s) => thrust(f) * ((s === 1) === (i === 0) ? 1 : 0.35);
      // Hände auf Brusthöhe und seitlich versetzt — höher verdecken die Fäuste das Gesicht (großer Kopf)
      const arm = (s) => hand(s, 0.32, 0.0 + 0.2 * p(s), 0.58 + 0.1 * p(s), [1, -0.8, -0.2]);
      return {
        hip: [0, -0.07 + bounce(f, 0.07), 0],
        hipRot: [0, 0.1 * (i ? -1 : 1) * snap(f), 0],
        spine: [0.12 + 0.06 * snap(f), 0, 0],
        head: [0.05 + 0.18 * snap(f), 0, 0],
        armL: arm(1),
        armR: arm(-1),
        legL: foot(1, 0.32, 0, 0.04, 0.25),
        legR: foot(-1, 0.32, 0, -0.04, 0.25),
      };
    },
  },
  /** Hardstyle-Stampfer: ein Fuß geht hoch und knallt auf die Kick, beide Fäuste schlagen mit nach unten. */
  stomp: {
    beats: 2,
    pose(b) {
      const f = b % 1;
      const next = Math.floor(b) % 2 === 0 ? -1 : 1;           // dieser Fuß stampft auf den nächsten Schlag
      const l = f > 0.35 ? Math.sin(PI * (f - 0.35) / 0.65) : 0;
      const leg = (s) => (s === next ? foot(s, 0.34, 0.3 * l, 0.06 * l, 0.3) : foot(s, 0.34, 0, 0, 0.3));
      const arm = (s) => hand(s, 0.14, lerp(-0.5, 0, l), lerp(0.3, 0.36, l), [1, -0.5, -0.5]);
      return {
        hip: [-0.05 * next * l, -0.12 - 0.07 * snap(f) + 0.06 * l, 0],
        spine: [0.16 + 0.14 * snap(f), 0.1 * next * l, 0],
        head: [0.05 + 0.25 * snap(f), 0, 0],
        armL: arm(1),
        armR: arm(-1),
        legL: leg(1),
        legR: leg(-1),
      };
    },
  },
  /** Drei Schläge federn, auf den vierten ein Sprung mit ganzer Drehung. */
  spin: {
    beats: 4,
    pose(b) {
      const f = b % 1;
      const turning = b >= 3;
      const ang = turning ? 2 * PI * ease(f) : 0;
      const h = turning ? air(f) : 0;
      const tuck = turning ? Math.sin(PI * f) : 0;
      // kurz in die Knie, bevor es hochgeht
      const crouch = b >= 2.5 && b < 3 ? ease((b - 2.5) / 0.5) : turning ? 1 - ease(Math.min(1, f * 4)) : 0;
      const co = Math.cos(ang), si = Math.sin(ang);
      const leg = (s) => ({ pos: [s * 0.22 * co, GROUND + 0.16 * h, -s * 0.22 * si], yaw: ang + s * 0.15, toe: 0.3 * h });
      const arm = (s) => {
        const pump = hand(s, 0.12, -0.3 + 0.12 * thrust(f), 0.25, [1, -0.5, -0.5]);
        const close = hand(s, -0.05, -0.05, 0.3, [1, -0.4, -0.4]);
        return { pos: pump.pos.map((v, j) => lerp(v, close.pos[j], tuck)), pole: pump.pole.map((v, j) => lerp(v, close.pole[j], tuck)) };
      };
      return {
        hip: [0, -0.05 + (turning ? 0 : bounce(f, 0.06)) + 0.22 * h - 0.1 * crouch, 0],
        hipRot: [0, ang, 0],
        spine: [0.06, 0, 0],
        head: [0.04 + (turning ? 0 : 0.12 * snap(f)), 0, 0],
        armL: arm(1),
        armR: arm(-1),
        legL: leg(1),
        legR: leg(-1),
      };
    },
  },
};

/** Ruhige Tänze für leise Stellen in der Musik (Breakdown). */
const CALM = ['sway', 'twostep', 'wavearms'];
/** Nur für leise Stellen — in den normalen Tanzlisten wäre das zu müde. */
const CALM_ONLY = new Set(['sway']);

/** Namen der Tänze (inkl. Spiegelung) — für die Tanzlisten der Szene. */
export const RAVE_MOVES = Object.keys(MOVES).filter((n) => !CALM_ONLY.has(n)).flatMap((n) => [n, `${n}_m`]);
export const RAVE_CALM = CALM.flatMap((n) => [n, `${n}_m`]);

/**
 * Hände auf dem Mischpult, relativ zum Schultergelenk (Rumpf-Rahmen). Der Rumpf ist dabei nach
 * vorn geneigt (DJ_LEAN). Passt zum Pult in partyProps.js, wenn die Figur so steht wie in partyDj.js.
 */
const DJ_HAND = { x: 0.1, y: -0.62, z: 0.52 };
const DJ_LEAN = 0.3;

/** Einzelbewegungen außerhalb der Tanzlisten: DJ-Pult und Polonaise (Starting), Winken + Kopfkratzen (BRB-Planet). */
const DJ_MOVES = {
  /**
   * Polonaise: Hände nach vorn auf die Schultern des Vordermanns, Schritt auf jeden Schlag, auf den
   * vierten geht ein Bein zur Seite raus. Vorwärts bewegt die Szene die Figur (partyDancers.js).
   */
  conga: {
    beats: 4,
    pose(b) {
      const f = b % 1;
      const i = Math.floor(b) % 4;
      const side = i % 2 === 0 ? 1 : -1;
      const lift = Math.sin(PI * f);
      const out = i === 3;
      const leg = (s) => (s !== side ? foot(s, 0.18, 0, 0, 0.1)
        : out ? foot(s, lerp(0.2, 0.62, lift), 0.24 * lift, 0.04, 0.1)
          : foot(s, 0.18, 0.16 * lift, 0.1 * lift, 0.05, -0.2 * lift));
      const arm = (s) => hand(s, 0.03, 0.1 + 0.03 * Math.sin(PI * b), 0.74, [1, -0.7, -0.2]);
      return {
        hip: [out ? -0.07 * side * lift : 0.03 * side * lift, -0.04 + bounce(f, 0.05), 0],
        hipRot: [0, 0.06 * side * lift, 0],
        spine: [0.06, 0, out ? 0.1 * side * lift : 0],
        head: [0.03 + 0.1 * snap(f), 0.12 * Math.sin(PI * b / 2), 0],
        armL: arm(1),
        armR: arm(-1),
        legL: leg(1),
        legR: leg(-1),
      };
    },
  },
  /**
   * 16 Schläge: Hände am Pult mit kleinen Dreh-/Schiebebewegungen, Kopfnicken auf jeden Schlag,
   * Knie federn leicht. Im letzten Takt geht eine Hand hoch (Faust im Takt) und wieder zurück.
   */
  djdesk: {
    beats: 16,
    pose(b) {
      const f = b % 1;
      const dip = bounce(f, 0.035);
      // Faust hoch: Schlag 12 → 16 rauf, halten, runter
      const up = b >= 12 ? Math.sin(PI * clamp01((b - 12) / 4)) : 0;
      const raise = ease(Math.min(1, up * 1.6));
      const onDesk = (s, ph) => {
        const a = PI * b / 2 + ph;
        // Hand bleibt auf Pulthöhe, auch wenn die Knie federn (dip wieder abziehen)
        return hand(s, DJ_HAND.x + 0.035 * Math.sin(a), DJ_HAND.y - dip + 0.025 * Math.max(0, Math.sin(2 * a)), DJ_HAND.z + 0.03 * Math.cos(a), [1, -0.5, -0.7]);
      };
      const armL = onDesk(1, 0);
      let armR = onDesk(-1, PI * 0.7);
      if (raise > 0) {
        const pump = 0.08 * thrust(f) * raise;
        // seitlich neben den Kopf (vor dem Gesicht verdeckte die Faust das Gesicht — der Kopf ist groß)
        const top = hand(-1, 0.55, 0.55 + pump, 0.1, [1, -0.6, -0.3]);
        armR = {
          pos: armR.pos.map((v, i) => lerp(v, top.pos[i], raise)),
          pole: armR.pole.map((v, i) => lerp(v, top.pole[i], raise)),
        };
      }
      return {
        hip: [0.02 * Math.sin(PI * b / 4), -0.05 + dip, -0.03],
        hipRot: [0, 0.05 * Math.sin(PI * b / 4), 0],
        spine: [DJ_LEAN + 0.03 * snap(f) - 0.12 * raise, 0.05 * Math.sin(PI * b / 8), 0],
        head: [0.02 + 0.16 * snap(f), 0.14 * Math.sin(PI * b / 8), 0],
        armL,
        armR,
        legL: foot(1, 0.24, 0, 0, 0.15),
        legR: foot(-1, 0.24, 0, 0, 0.15),
      };
    },
  },
  /**
   * BRB-Planet: Winken am Gartenzaun. 4 Schläge: rechte Hand seitlich neben dem Kopf, schwingt
   * zweimal je Schlag hin und her; linke Hand locker an der Seite, leichtes Wippen.
   */
  wave: {
    beats: 4,
    pose(b) {
      const f = b % 1;
      const sw = Math.sin(2 * PI * b);
      return {
        hip: [0, -0.03 + bounce(f, 0.02), 0],
        hipRot: [0, 0.04 * Math.sin(PI * b / 2), 0],
        spine: [0.02, 0.05 * sw, -0.05],
        head: [0, 0.08 * Math.sin(PI * b / 2), 0.06],
        armR: hand(-1, 0.5 + 0.14 * sw, 0.5 - 0.05 * Math.abs(sw), 0.12, [1, -0.6, -0.2]),
        armL: hand(1, 0.16, -0.62, 0.06, [0, 0, -1]),
        legL: foot(1, 0.24, 0, 0, 0.12),
        legR: foot(-1, 0.24, 0, 0, 0.12),
      };
    },
  },
  /**
   * BRB-Planet, Modus „Störung“: ratlos am Kopf kratzen, linke Hand in der Hüfte, Kopf schief.
   * 8 Schläge: die ersten vier kratzen, dann kurz in die Ferne schauen.
   */
  scratch: {
    beats: 8,
    pose(b) {
      const f = b % 1;
      // Hand am Kopf: Schlag 0–0,6 hoch, bis 4 kratzen, 4–4,8 runter in die Hüfte; Rest schauen
      const up = b < 4 ? ease(b / 0.6) : 1 - ease((b - 4) / 0.8);
      const look = b >= 4 ? Math.sin(PI * (b - 4) / 4) : 0;
      const rub = 0.04 * Math.sin(4 * PI * b) * up;
      const hipHand = hand(-1, 0.36, -0.3, -0.02, [1, 0.2, -0.8]);
      const headHand = hand(-1, 0.34 + rub, 0.6, 0.02, [1, -0.3, -0.4]);
      return {
        hip: [0.03, -0.03 + bounce(f, 0.01), 0],
        hipRot: [0, -0.06, 0],
        spine: [0.04, -0.06, 0.04],
        head: [lerp(-0.04, 0.1, up), lerp(0.35 * look, -0.1, up), lerp(0.05, 0.2, up)],
        armR: {
          pos: hipHand.pos.map((v, i) => lerp(v, headHand.pos[i], up)),
          pole: hipHand.pole.map((v, i) => lerp(v, headHand.pole[i], up)),
        },
        armL: hand(1, 0.36, -0.3, -0.02, [1, 0.2, -0.8]),
        legL: foot(1, 0.26, 0, 0.02, 0.18),
        legR: foot(-1, 0.22, 0, -0.03, 0.1),
      };
    },
  },
};

/** Pose spiegeln: links ↔ rechts, x und Drehen/Neigen umkehren. */
function mirror(p) {
  const mx = (v) => [-v[0], v[1], v[2]];
  const mr = (r) => (r ? [r[0], -r[1], -r[2]] : r);
  const mh = (a) => ({ pos: mx(a.pos), pole: mx(a.pole) });
  const mf = (l) => ({ pos: mx(l.pos), yaw: -l.yaw, toe: l.toe });
  return {
    hip: mx(p.hip), hipRot: mr(p.hipRot), spine: mr(p.spine), head: mr(p.head),
    armL: mh(p.armR), armR: mh(p.armL), legL: mf(p.legR), legR: mf(p.legL),
  };
}

// ── IK-Helfer ───────────────────────────────────────────────────────────────
const _m = new THREE.Matrix4();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
/** Senkrechter Anteil von v zu d (normiert); fällt auf fallback zurück, wenn v ∥ d. */
function ortho(v, d, fallback) {
  const o = v.clone().addScaledVector(d, -v.dot(d));
  if (o.lengthSq() < 1e-8) return ortho(fallback, d, new THREE.Vector3(1, 0, 0));
  return o.normalize();
}
/** Drehung, die das Paar (d0, n0) auf (d1, n1) bringt (beide orthonormal). */
function frameRotation(d0, n0, d1, n1) {
  const b0 = new THREE.Quaternion().setFromRotationMatrix(_m.makeBasis(d0, n0, d0.clone().cross(n0)));
  const b1 = new THREE.Quaternion().setFromRotationMatrix(_m.makeBasis(d1, n1, d1.clone().cross(n1)));
  return b1.multiply(b0.invert());
}
const qEuler = (r) => new THREE.Quaternion().setFromEuler(_e.set(r?.[0] || 0, r?.[1] || 0, r?.[2] || 0, 'YXZ'));

/**
 * Alle Rave-Clips für das Skelett von clips.glb bauen.
 * @param {THREE.Object3D} restScene
 * @returns {Map<string, THREE.AnimationClip>}
 */
export function buildRaveClips(restScene) {
  const rig = SkeletonUtils.clone(restScene);
  const bone = {};
  rig.traverse((o) => { if (o.isBone) bone[o.name] = o; });
  const NEED = ['Body', 'Hips', 'Abdomen', 'Torso', 'Neck', 'Head', 'ShoulderL', 'ShoulderR',
    'UpperArmL', 'LowerArmL', 'FistL', 'UpperArmR', 'LowerArmR', 'FistR',
    'UpperLegL', 'LowerLegL', 'FootL', 'UpperLegR', 'LowerLegR', 'FootR'];
  if (!NEED.every((n) => bone[n])) return new Map();

  rig.updateMatrixWorld(true);
  const wp = (o) => o.getWorldPosition(new THREE.Vector3());
  const wq = (o) => o.getWorldQuaternion(new THREE.Quaternion());
  const restL = {}, restW = {}, restP = {};
  for (const n of NEED) { restL[n] = bone[n].quaternion.clone(); restP[n] = bone[n].position.clone(); restW[n] = wq(bone[n]); }
  const bodyRestW = wp(bone.Body);

  // Kettenmaße und Ruhe-Rahmen je Glied
  const chain = (a, b, c, poleRest) => {
    const pa = wp(bone[a]), pb = wp(bone[b]), pc = wp(bone[c]);
    const d0a = pb.clone().sub(pa).normalize();
    const d0b = pc.clone().sub(pb).normalize();
    return {
      a: bone[a], b: bone[b], c: bone[c],
      l1: pa.distanceTo(pb), l2: pb.distanceTo(pc),
      d0a, n0a: ortho(poleRest.clone(), d0a, new THREE.Vector3(0, 0, 1)),
      d0b, n0b: ortho(poleRest.clone(), d0b, new THREE.Vector3(0, 0, 1)),
    };
  };
  const BACK = new THREE.Vector3(0, 0, -1);
  const FWD = new THREE.Vector3(0, 0, 1);
  const arms = { L: chain('UpperArmL', 'LowerArmL', 'FistL', BACK), R: chain('UpperArmR', 'LowerArmR', 'FistR', BACK) };
  const legs = { L: chain('UpperLegL', 'LowerLegL', 'FootL', FWD), R: chain('UpperLegR', 'LowerLegR', 'FootR', FWD) };

  /** Weltdrehung → lokale Drehung des Knochens. */
  const setWorldQ = (b, q) => { b.quaternion.copy(wq(b.parent).invert().multiply(q)); b.updateMatrixWorld(true); };

  /** Zwei-Knochen-IK: Wurzel bleibt, Ende zu target, Mittelgelenk Richtung pole. Gibt die Drehung des unteren Glieds zurück. */
  const solve = (ch, target, pole) => {
    const root = wp(ch.a);
    const to = target.clone().sub(root);
    const dist = THREE.MathUtils.clamp(to.length(), Math.abs(ch.l1 - ch.l2) + 1e-3, (ch.l1 + ch.l2) * 0.999);
    const dir = to.normalize();
    const pdir = ortho(pole.clone(), dir, FWD);
    const a = (ch.l1 * ch.l1 - ch.l2 * ch.l2 + dist * dist) / (2 * dist);
    const h = Math.sqrt(Math.max(0, ch.l1 * ch.l1 - a * a));
    const mid = root.clone().addScaledVector(dir, a).addScaledVector(pdir, h);
    const end = root.clone().addScaledVector(dir, dist);
    const d1a = mid.clone().sub(root).normalize();
    const ra = frameRotation(ch.d0a, ch.n0a, d1a, ortho(pdir, d1a, FWD));
    setWorldQ(ch.a, ra.clone().multiply(restW[ch.a.name]));
    const d1b = end.clone().sub(mid).normalize();
    const rb = frameRotation(ch.d0b, ch.n0b, d1b, ortho(pdir, d1b, FWD));
    setWorldQ(ch.b, rb.clone().multiply(restW[ch.b.name]));
    return { rb, end };
  };

  const applyPose = (p) => {
    for (const n of NEED) { bone[n].quaternion.copy(restL[n]); bone[n].position.copy(restP[n]); }
    rig.updateMatrixWorld(true);
    // Hüfte
    const hipW = bodyRestW.clone().add(V(p.hip));
    bone.Body.position.copy(bone.Body.parent.worldToLocal(hipW));
    setWorldQ(bone.Body, qEuler(p.hipRot).multiply(restW.Body));
    // Rumpf und Kopf: je zur Hälfte auf zwei Knochen
    const half = (r) => (r ? [r[0] / 2, r[1] / 2, r[2] / 2] : null);
    bone.Abdomen.quaternion.copy(restL.Abdomen).multiply(qEuler(half(p.spine)));
    bone.Torso.quaternion.copy(restL.Torso).multiply(qEuler(half(p.spine)));
    bone.Neck.quaternion.copy(restL.Neck).multiply(qEuler(half(p.head)));
    bone.Head.quaternion.copy(restL.Head).multiply(qEuler(half(p.head)));
    rig.updateMatrixWorld(true);
    // Arme im Rahmen des Oberkörpers
    const torsoD = wq(bone.Torso).multiply(restW.Torso.clone().invert());
    for (const s of ['L', 'R']) {
      const a = p[`arm${s}`];
      const ch = arms[s];
      const target = wp(ch.a).add(V(a.pos).applyQuaternion(torsoD));
      const { rb } = solve(ch, target, V(a.pole).normalize().applyQuaternion(torsoD));
      setWorldQ(ch.c, rb.clone().multiply(restW[ch.c.name]));
    }
    // Beine: Fußziel in Weltlage, Knie zeigt in Fußrichtung
    for (const s of ['L', 'R']) {
      const l = p[`leg${s}`];
      const ch = legs[s];
      const yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), l.yaw || 0);
      const knee = FWD.clone().applyQuaternion(yawQ).add(new THREE.Vector3((s === 'L' ? 1 : -1) * 0.15, 0, 0));
      solve(ch, V(l.pos), knee);
      const footQ = yawQ.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), l.toe || 0));
      ch.c.position.copy(ch.c.parent.worldToLocal(V(l.pos)));
      setWorldQ(ch.c, footQ.multiply(restW[ch.c.name]));
    }
  };

  const ROT = NEED;
  const POS = ['Body', 'FootL', 'FootR'];
  const out = new Map();
  const all = [...Object.entries(MOVES).map(([n, m]) => [n, m, true]), ...Object.entries(DJ_MOVES).map(([n, m]) => [n, m, false])];
  for (const [name, move, withMirror] of all) {
    for (const mirrored of withMirror ? [false, true] : [false]) {
      const n = move.beats * SAMPLES_PER_BEAT + 1;
      const times = new Float32Array(n);
      const q = Object.fromEntries(ROT.map((b) => [b, new Float32Array(n * 4)]));
      const pos = Object.fromEntries(POS.map((b) => [b, new Float32Array(n * 3)]));
      const beatS = 60 / NOMINAL_BPM;
      for (let i = 0; i < n; i++) {
        const b = (i / SAMPLES_PER_BEAT) % move.beats;   // letztes Bild = erstes (nahtlose Schleife)
        times[i] = (i / SAMPLES_PER_BEAT) * beatS;
        const pose = move.pose(b);
        applyPose(mirrored ? mirror(pose) : pose);
        for (const bn of ROT) {
          bone[bn].quaternion.toArray(q[bn], i * 4);
          if (i > 0) {
            const a = q[bn], o = i * 4, pr = o - 4;
            if (a[o] * a[pr] + a[o + 1] * a[pr + 1] + a[o + 2] * a[pr + 2] + a[o + 3] * a[pr + 3] < 0) {
              a[o] = -a[o]; a[o + 1] = -a[o + 1]; a[o + 2] = -a[o + 2]; a[o + 3] = -a[o + 3];
            }
          }
        }
        for (const bn of POS) bone[bn].position.toArray(pos[bn], i * 3);
      }
      const tracks = [
        ...ROT.map((bn) => new THREE.QuaternionKeyframeTrack(`${bn}.quaternion`, times, q[bn])),
        ...POS.map((bn) => new THREE.VectorKeyframeTrack(`${bn}.position`, times, pos[bn])),
      ];
      const clipName = mirrored ? `${name}_m` : name;
      const clip = new THREE.AnimationClip(clipName, move.beats * beatS, tracks);
      clip.userData = { beats: move.beats, rave: true };
      out.set(clipName, clip);
    }
  }
  return out;
}
