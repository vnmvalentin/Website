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
};

/** Namen der Tänze (inkl. Spiegelung) — für die Tanzlisten der Szene. */
export const RAVE_MOVES = Object.keys(MOVES).flatMap((n) => [n, `${n}_m`]);

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
  for (const [name, move] of Object.entries(MOVES)) {
    for (const mirrored of [false, true]) {
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
