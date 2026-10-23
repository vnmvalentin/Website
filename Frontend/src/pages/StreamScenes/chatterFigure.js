// chatterFigure.js — die Chatter-Figur der 3D-Stream-Szenen (Party-Saal und Kino).
//
// Ein schlanker Roboter: Metallkörper mit Gelenkkugeln, Leuchtlinien in der Chatfarbe und eine
// glänzende Murmel als Kopf, auf der vorn das Twitch-Profilbild sitzt (bis es geladen ist, der
// Anfangsbuchstabe). Keine Gesichter, keine Hüte.
//
// Eine Figur ist EIN SkinnedMesh mit drei Materialgruppen (Metall, Leuchten, Kopf): alle Teile sind
// starr an je einen Knochen gebunden — wenige Zeichenaufrufe auch bei vielen Chattern, echte Gelenke.
//
// Bewegung = Pose: ein flaches Objekt aus Winkeln und Versätzen (POSE_KEYS). Tanzschritte,
// Gehen und Sitzen schreiben eine Pose, `blendPose` überblendet zwei Posen weich, `applyPose`
// setzt sie auf die Knochen. Die Beine laufen über eine Zwei-Knochen-IK: die Pose gibt nur
// vor, wo die Füße stehen — beim In-die-Knie-Gehen bleiben sie dadurch auf dem Boden.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ── Maße (Meter, Füße auf y = 0, Blick nach +z) ─────────────────────────────
const HIP_Y = 0.95;
const THIGH = 0.44;
const SHIN = 0.43;
const HIP_W = 0.11;
const ANKLE_Y = HIP_Y - 0.02 - THIGH - SHIN;   // 0.06
const SHOULDER_Y = 1.5;
const SHOULDER_W = 0.24;
const UPPER_ARM = 0.3;
const NECK_Y = 1.6;
const HEAD_C = 1.86;
const HEAD_R = 0.22;
/** Hüfthöhe im Kinosessel. */
const SIT_HIP_Y = 0.58;
/** Oberkante des Kopfs (stehend / sitzend) — für Namensschilder und freie Sicht im Kino. */
export const HEAD_TOP = HEAD_C + HEAD_R;
export const SEATED_HEAD_TOP = HEAD_TOP - (HIP_Y - SIT_HIP_Y);

// Knochen: [Name, Eltern-Index, Position in der Ruhepose (Weltkoordinaten der Figur)]
const BONES = [
  ['root', -1, [0, 0, 0]],
  ['hips', 0, [0, HIP_Y, 0]],
  ['spine', 1, [0, HIP_Y + 0.02, 0]],
  ['head', 2, [0, NECK_Y, 0]],
  ['shoulderL', 2, [-SHOULDER_W, SHOULDER_Y, 0]],
  ['elbowL', 4, [-SHOULDER_W, SHOULDER_Y - UPPER_ARM, 0]],
  ['shoulderR', 2, [SHOULDER_W, SHOULDER_Y, 0]],
  ['elbowR', 6, [SHOULDER_W, SHOULDER_Y - UPPER_ARM, 0]],
  ['thighL', 1, [-HIP_W, HIP_Y - 0.02, 0]],
  ['kneeL', 8, [-HIP_W, HIP_Y - 0.02 - THIGH, 0]],
  ['footL', 9, [-HIP_W, ANKLE_Y, 0]],
  ['thighR', 1, [HIP_W, HIP_Y - 0.02, 0]],
  ['kneeR', 11, [HIP_W, HIP_Y - 0.02 - THIGH, 0]],
  ['footR', 12, [HIP_W, ANKLE_Y, 0]],
];
const B = Object.fromEntries(BONES.map(([n], i) => [n, i]));

// Farbtöne des Metalls (Vertex-Farben), Leuchten und Kopf sind eigene Materialien
const TONE = { shell: 0, joint: 1, dark: 2, red: 3, popcorn: 4 };
const TONE_COLORS = {
  [TONE.shell]: new THREE.Color('#2a2d34'),
  [TONE.joint]: new THREE.Color('#9aa1ad'),
  [TONE.dark]: new THREE.Color('#121318'),
  [TONE.red]: new THREE.Color('#d8282b'),
  [TONE.popcorn]: new THREE.Color('#fff2c4'),
};

/** Teil-Geometrie: an `bone` gebunden, Farbton `tone` (nur Metall). */
function part(geo, bone, tone = TONE.shell) {
  const g = geo;
  const n = g.attributes.position.count;
  const skinIndex = new Uint16Array(n * 4);
  const skinWeight = new Float32Array(n * 4);
  const color = new Float32Array(n * 3);
  const c = TONE_COLORS[tone];
  for (let i = 0; i < n; i++) {
    skinIndex[i * 4] = bone;
    skinWeight[i * 4] = 1;
    color[i * 3] = c.r; color[i * 3 + 1] = c.g; color[i * 3 + 2] = c.b;
  }
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
  g.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  for (const key of Object.keys(g.attributes)) {
    if (!['position', 'normal', 'uv', 'skinIndex', 'skinWeight', 'color'].includes(key)) g.deleteAttribute(key);
  }
  return g;
}

const sphere = (r, x, y, z, ws = 14, hs = 10) => new THREE.SphereGeometry(r, ws, hs).translate(x, y, z);
/** Sich verjüngendes Glied zwischen zwei Höhen (oben dicker). */
const limb = (rTop, rBot, yTop, yBot, x, z = 0) => new THREE.CylinderGeometry(rTop, rBot, yTop - yBot, 12).translate(x, (yTop + yBot) / 2, z);
/** Leuchtring (liegt waagrecht um ein Glied). */
const ring = (r, tube, x, y, z = 0) => new THREE.TorusGeometry(r, tube, 6, 24).rotateX(Math.PI / 2).translate(x, y, z);
const lathe = (pts, segs = 20) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), segs);

function metalParts(popcorn) {
  const P = [];
  // Becken und Rumpf: schmale Taille, breite Brust, vorn/hinten abgeflacht
  P.push(part(lathe([[0, 0.84], [0.13, 0.85], [0.16, 0.9], [0.155, 0.98], [0, 0.99]]).scale(1, 1, 0.8), B.hips, TONE.dark));
  P.push(part(lathe([
    [0, 0.99], [0.12, 1.0], [0.135, 1.08], [0.125, 1.14], [0.17, 1.28], [0.21, 1.4], [0.225, 1.48], [0.19, 1.56], [0.08, 1.6], [0, 1.6],
  ]).scale(1, 1, 0.72), B.spine));
  // Rückenplatte, Hals
  P.push(part(new THREE.BoxGeometry(0.22, 0.26, 0.06).translate(0, 1.36, -0.15), B.spine, TONE.dark));
  P.push(part(limb(0.045, 0.055, 1.7, 1.57, 0), B.head, TONE.joint));
  // Arme: Schulterkugel, Oberarm, Ellbogen, Unterarm, Hand
  for (const [side, sh, el] of [[-1, B.shoulderL, B.elbowL], [1, B.shoulderR, B.elbowR]]) {
    const x = side * SHOULDER_W;
    P.push(part(sphere(0.07, x, SHOULDER_Y, 0), sh, TONE.joint));
    P.push(part(limb(0.056, 0.045, SHOULDER_Y - 0.05, SHOULDER_Y - UPPER_ARM + 0.03, x), sh));
    P.push(part(sphere(0.048, x, SHOULDER_Y - UPPER_ARM, 0), el, TONE.joint));
    P.push(part(limb(0.045, 0.036, SHOULDER_Y - UPPER_ARM - 0.03, SHOULDER_Y - UPPER_ARM - 0.25, x), el));
    P.push(part(new THREE.BoxGeometry(0.055, 0.1, 0.075).translate(x, SHOULDER_Y - UPPER_ARM - 0.31, 0.005), el, TONE.dark));
  }
  // Beine: Hüftkugel, Oberschenkel, Knie, Schienbein, Fuß
  for (const [side, th, kn, ft] of [[-1, B.thighL, B.kneeL, B.footL], [1, B.thighR, B.kneeR, B.footR]]) {
    const x = side * HIP_W;
    const kneeY = HIP_Y - 0.02 - THIGH;
    P.push(part(sphere(0.075, x, HIP_Y - 0.02, 0), th, TONE.joint));
    P.push(part(limb(0.075, 0.058, HIP_Y - 0.06, kneeY + 0.04, x), th));
    P.push(part(sphere(0.058, x, kneeY, 0), kn, TONE.joint));
    P.push(part(limb(0.056, 0.042, kneeY - 0.04, ANKLE_Y + 0.04, x), kn));
    P.push(part(new THREE.BoxGeometry(0.1, 0.065, 0.24).translate(x, 0.035, 0.05), ft, TONE.dark));
  }
  if (popcorn) {
    const hy = SHOULDER_Y - UPPER_ARM - 0.31;
    P.push(part(new THREE.CylinderGeometry(0.09, 0.07, 0.18, 10).translate(SHOULDER_W + 0.02, hy + 0.1, 0.09), B.elbowR, TONE.red));
    P.push(part(sphere(0.085, SHOULDER_W + 0.02, hy + 0.2, 0.09, 10, 6), B.elbowR, TONE.popcorn));
  }
  return P;
}

function glowParts() {
  const P = [];
  P.push(part(ring(0.128, 0.012, 0, 1.04).scale(1, 1, 0.78), B.spine));                  // Taille
  P.push(part(new THREE.TorusGeometry(0.05, 0.012, 6, 20).translate(0, 1.38, 0.155), B.spine)); // Brustkern
  P.push(part(new THREE.CircleGeometry(0.03, 16).translate(0, 1.38, 0.158), B.spine));
  P.push(part(ring(0.062, 0.01, 0, 1.6), B.head));                                          // Halsring
  for (const [side, el, kn, ft] of [[-1, B.elbowL, B.kneeL, B.footL], [1, B.elbowR, B.kneeR, B.footR]]) {
    P.push(part(ring(0.042, 0.009, side * SHOULDER_W, SHOULDER_Y - UPPER_ARM - 0.22), el));  // Handgelenk
    P.push(part(ring(0.064, 0.01, side * HIP_W, HIP_Y - 0.02 - THIGH), kn));                 // Knie
    P.push(part(new THREE.BoxGeometry(0.08, 0.012, 0.02).translate(side * HIP_W, 0.05, 0.172), ft)); // Fußspitze
  }
  return P;
}

/** Murmelkopf: Kugel, deren Vorderseite die Textur flach von vorn aufgeprojiziert bekommt (wie bei der Murmelbahn). */
function headPart() {
  const geo = new THREE.SphereGeometry(HEAD_R, 32, 24);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, 0.5 + pos.getX(i) / (2 * HEAD_R), 0.5 + pos.getY(i) / (2 * HEAD_R));
  geo.translate(0, HEAD_C, 0);
  return part(geo, B.head);
}

const templates = new Map();
function template(popcorn) {
  const key = popcorn ? 'p' : '-';
  let geo = templates.get(key);
  if (!geo) {
    geo = mergeGeometries([
      mergeGeometries(metalParts(popcorn), false),
      mergeGeometries(glowParts(), false),
      headPart(),
    ], true);
    templates.set(key, geo);
  }
  return geo;
}

/** Murmel-Textur: Chatfarbe als Ring, innen das Profilbild bzw. der Anfangsbuchstabe. */
export function headTexture(name, color) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const paint = (img) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.36, 0, Math.PI * 2);
    ctx.clip();
    if (img) {
      ctx.drawImage(img, size * 0.14, size * 0.14, size * 0.72, size * 0.72);
    } else {
      ctx.fillStyle = '#16171c';
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = color;
      ctx.font = `800 ${Math.round(size * 0.4)}px Inter, Roboto, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText((name || '?').slice(0, 1).toUpperCase(), size / 2, size / 2 + size * 0.03);
    }
    ctx.restore();
    tex.needsUpdate = true;
  };
  paint(null);
  return { tex, paint };
}

/** Chatfarbe für das Leuchten: kräftig und hell genug, auch wenn jemand Schwarz eingestellt hat. */
export function glowColor(hex) {
  const c = new THREE.Color();
  try { c.set(hex || '#9147ff'); } catch { c.set('#9147ff'); }
  const hsl = {};
  c.getHSL(hsl);
  return c.setHSL(hsl.h, Math.max(0.6, hsl.s), Math.min(0.68, Math.max(0.5, hsl.l)));
}

/**
 * Eine Figur bauen.
 * @param {{ name?: string, color?: string, popcorn?: boolean, scale?: number, envMap?: THREE.Texture|null }} opts
 */
export function buildFigure({ name = '', color, popcorn = false, scale = 1, envMap = null } = {}) {
  const geo = template(popcorn);
  const glow = glowColor(color);
  const head = headTexture(name, '#' + glow.getHexString());
  const metal = new THREE.MeshStandardMaterial({
    vertexColors: true, metalness: envMap ? 0.8 : 0.35, roughness: 0.32, envMap, envMapIntensity: 0.9,
  });
  const light = new THREE.MeshBasicMaterial({ color: glow.clone(), toneMapped: false });
  const headMat = new THREE.MeshStandardMaterial({
    map: head.tex, roughness: 0.12, metalness: 0.05, envMap, envMapIntensity: 1.3,
  });
  const mesh = new THREE.SkinnedMesh(geo, [metal, light, headMat]);
  const bones = BONES.map(([n]) => { const b = new THREE.Bone(); b.name = n; return b; });
  BONES.forEach(([, parent, pos], i) => {
    const p = new THREE.Vector3(...pos);
    if (parent >= 0) p.sub(new THREE.Vector3(...BONES[parent][2]));
    bones[i].position.copy(p);
    if (parent >= 0) bones[parent].add(bones[i]);
  });
  mesh.add(bones[0]);
  mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones));
  mesh.frustumCulled = false;     // Ruhepose-Kugel passt nicht zu Sprüngen, Saltos und Drehungen
  for (const n of ['thighL', 'thighR']) bones[B[n]].rotation.order = 'ZXY';
  for (const n of ['footL', 'footR']) bones[B[n]].rotation.order = 'XZY';

  const group = new THREE.Group();
  group.scale.setScalar(scale);
  group.add(mesh);
  return {
    group, mesh, bones,
    materials: [metal, light, headMat],
    glow,
    hatTop: HEAD_TOP,
    /** Profilbild auf die Murmel (null = Buchstabe bleibt). */
    setAvatar(img) { if (img) head.paint(img); },
    /** Leuchtlinien pulsieren lassen (1 = normal). */
    setGlow(k) { light.color.copy(glow).multiplyScalar(k); },
    /** Deckkraft (Einblenden). */
    setOpacity(o) {
      for (const m of [metal, light, headMat]) {
        const t = o < 1;
        if (m.transparent !== t) { m.transparent = t; m.needsUpdate = true; }
        m.opacity = o;
      }
    },
    dispose() { metal.dispose(); light.dispose(); headMat.dispose(); head.tex.dispose(); },
  };
}

// ── Posen ───────────────────────────────────────────────────────────────────
export const POSE_KEYS = [
  'hipX', 'hipY', 'hipZ', 'hipYaw', 'hipRoll',
  'spinePitch', 'spineYaw', 'spineRoll',
  'headPitch', 'headYaw', 'headRoll',
  'lUp', 'lFwd', 'lTwist', 'lElbow', 'rUp', 'rFwd', 'rTwist', 'rElbow',
  'lfx', 'lfy', 'lfz', 'rfx', 'rfy', 'rfz',
  'spin', 'jump', 'flip',
];

export function neutralPose(out = {}) {
  for (const k of POSE_KEYS) out[k] = 0;
  out.lUp = out.rUp = 0.1;
  out.lElbow = out.rElbow = 0.2;
  return out;
}

/** Winkel auf dem kürzesten Weg überblenden. */
function blendAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/** out = a + (b - a) * t (Drehung `spin` und Salto `flip` auf dem kürzesten Weg). */
export function blendPose(a, b, t, out) {
  for (const k of POSE_KEYS) out[k] = a[k] + (b[k] - a[k]) * t;
  out.spin = blendAngle(a.spin, b.spin, t);
  out.flip = blendAngle(a.flip, b.flip, t);
  return out;
}

const _m = new THREE.Matrix4();
const _one = new THREE.Vector3(1, 1, 1);
const _t = new THREE.Vector3();

/** Zwei-Knochen-IK: Oberschenkel, Knie, Fuß so drehen, dass der Knöchel auf `target` (Figur-Koordinaten) steht. */
function solveLeg(bones, hips, thighI, target) {
  const thigh = bones[thighI];
  const knee = bones[thighI + 1];
  const foot = bones[thighI + 2];
  // Ziel in Hüft-Koordinaten, relativ zum Hüftgelenk
  _m.compose(hips.position, hips.quaternion, _one).invert();
  _t.copy(target).applyMatrix4(_m).sub(thigh.position);
  const roll = Math.atan2(_t.x, -_t.y);
  const cr = Math.cos(-roll), sr = Math.sin(-roll);
  const dy = _t.x * sr + _t.y * cr;          // Ziel ohne Seitenneigung
  const dz = _t.z;
  const dist = Math.min(THIGH + SHIN - 0.002, Math.max(0.12, Math.hypot(dy, dz)));
  const phi = Math.atan2(dz, -dy);
  const a1 = Math.acos(Math.min(1, Math.max(-1, (THIGH * THIGH + dist * dist - SHIN * SHIN) / (2 * THIGH * dist))));
  const a2 = Math.acos(Math.min(1, Math.max(-1, (SHIN * SHIN + dist * dist - THIGH * THIGH) / (2 * SHIN * dist))));
  const k = a1 + a2;
  thigh.rotation.set(-(phi + a1), 0, roll);
  knee.rotation.set(k, 0, 0);
  foot.rotation.set(phi + a1 - k, 0, -roll);
}

const _footL = new THREE.Vector3();
const _footR = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _pivot = new THREE.Vector3();
/** Drehpunkt für Saltos: etwa die Körpermitte. */
const FLIP_PIVOT = new THREE.Vector3(0, 1.05, 0);

/** Pose auf die Knochen einer Figur setzen. `yaw` = Blickrichtung der ganzen Figur. */
export function applyPose(fig, p, yaw = 0) {
  const b = fig.bones;
  const hips = b[B.hips];
  hips.position.set(p.hipX, HIP_Y + p.hipY, p.hipZ);
  hips.rotation.set(0, p.hipYaw, p.hipRoll);
  hips.quaternion.setFromEuler(hips.rotation);
  b[B.spine].rotation.set(p.spinePitch, p.spineYaw - p.hipYaw * 0.4, p.spineRoll);
  b[B.head].rotation.set(p.headPitch, p.headYaw, p.headRoll);
  b[B.shoulderL].rotation.set(-p.lFwd, p.lTwist, -p.lUp);
  b[B.elbowL].rotation.set(-p.lElbow, 0, 0);
  b[B.shoulderR].rotation.set(-p.rFwd, -p.rTwist, p.rUp);
  b[B.elbowR].rotation.set(-p.rElbow, 0, 0);
  solveLeg(b, hips, B.thighL, _footL.set(-HIP_W - 0.01 + p.lfx, ANKLE_Y + p.lfy, 0.02 + p.lfz));
  solveLeg(b, hips, B.thighR, _footR.set(HIP_W + 0.01 + p.rfx, ANKLE_Y + p.rfy, 0.02 + p.rfz));
  // Ganze Figur: Blickrichtung + Drehung, Salto um die Körpermitte, Sprunghöhe
  _e.set(p.flip, yaw + p.spin, 0, 'YXZ');
  fig.mesh.quaternion.copy(_q.setFromEuler(_e));
  _pivot.copy(FLIP_PIVOT).applyQuaternion(_q);
  fig.mesh.position.set(FLIP_PIVOT.x - _pivot.x, p.jump + FLIP_PIVOT.y - _pivot.y, FLIP_PIVOT.z - _pivot.z);
}

// ── Tanzschritte ────────────────────────────────────────────────────────────
// Jede Funktion bekommt den Takt `b` (1 = ein Schlag) und schreibt in die neutrale Pose `o`.
const PI = Math.PI;
const S = Math.sin;
const C = Math.cos;
const dip = (b) => 0.5 + 0.5 * C(b * PI * 2);                    // 1 genau auf dem Schlag
const ease = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
const frac = (x) => ((x % 1) + 1) % 1;

const MOVE_FNS = {
  /** Wippen in den Knien, Arme angewinkelt im Takt. */
  groove(o, b) {
    const d = dip(b), s = S(b * PI);
    o.hipY = -0.06 - 0.1 * d;
    o.hipYaw = 0.2 * s;
    o.spinePitch = 0.12 + 0.08 * d;
    o.headPitch = 0.2 * d - 0.05;
    o.lUp = o.rUp = 0.35;
    o.lFwd = 0.6 + 0.35 * d; o.rFwd = 0.6 + 0.35 * d;
    o.lElbow = o.rElbow = 1.6;
    o.lfx = -0.04; o.rfx = 0.04;
  },
  /** Schritt nach links, Schritt nach rechts. */
  twostep(o, b) {
    const side = S(b * PI), lift = C(b * PI), d = dip(b);
    o.hipX = 0.13 * side;
    o.hipRoll = -0.1 * side;
    o.hipY = -0.06 - 0.06 * d;
    o.lfx = -0.05 + 0.13 * side; o.rfx = 0.05 + 0.13 * side;
    o.lfy = 0.09 * Math.max(0, -lift); o.rfy = 0.09 * Math.max(0, lift);
    o.lFwd = 0.5 - 0.6 * side; o.rFwd = 0.5 + 0.6 * side;
    o.lElbow = o.rElbow = 1.4;
    o.lUp = o.rUp = 0.3;
    o.headRoll = 0.12 * side;
    o.spineRoll = 0.07 * side;
  },
  /** Hüpfen mit beiden Armen oben. */
  jump(o, b) {
    const ph = frac(b);
    const air = ph < 0.55 ? S((ph / 0.55) * PI) : 0;
    const squat = ph >= 0.55 ? S(((ph - 0.55) / 0.45) * PI) : 0;
    o.jump = 0.32 * air;
    o.hipY = -0.18 * squat;
    o.lUp = o.rUp = 2.75 + 0.25 * air;
    o.lFwd = o.rFwd = 0.15;
    o.lElbow = o.rElbow = 0.2 + 0.4 * squat;
    o.lfy = o.rfy = 0.08 * air;
    o.headPitch = -0.25 * air;
  },
  /** Drehung über vier Schläge, Arme weit. */
  spin(o, b) {
    o.spin = frac(b / 4) * PI * 2;
    const d = dip(b);
    o.hipY = -0.04 - 0.07 * d;
    o.lUp = o.rUp = 1.45 + 0.15 * d;
    o.lElbow = o.rElbow = 0.15;
    o.headRoll = 0.15;
    o.headPitch = -0.1;
  },
  /** Hände in die Luft, Oberkörper schwingt. */
  wave(o, b) {
    const sw = S(b * PI / 2), d = dip(b);
    o.lUp = 2.6 + 0.3 * sw; o.rUp = 2.6 - 0.3 * sw;
    o.lElbow = o.rElbow = 0.3;
    o.spineRoll = 0.2 * sw;
    o.hipX = -0.08 * sw;
    o.hipY = -0.05 - 0.07 * d;
    o.headRoll = 0.16 * sw;
    o.headPitch = -0.14;
  },
  /** Roboter: abgehackte Posen auf jeden halben Schlag. */
  robot(o, b) {
    const frames = [
      { lUp: 1.5, lElbow: 1.57, rUp: 0.15, rElbow: 0.1, headYaw: 0.6, spineYaw: 0.3, hipY: -0.05 },
      { lUp: 0.15, lElbow: 0.1, rUp: 1.5, rElbow: 1.57, headYaw: -0.6, spineYaw: -0.3, hipY: -0.05 },
      { lFwd: 1.57, lElbow: 0.05, rFwd: 1.57, rElbow: 0.05, headYaw: 0, headPitch: 0.2, hipY: -0.15 },
      { lUp: 1.5, lElbow: 1.4, rUp: 1.5, rElbow: 1.4, headYaw: 0, hipY: -0.2, spinePitch: 0.15 },
    ];
    const step = Math.floor(b * 2);
    const a = frames[((step - 1) % 4 + 4) % 4];
    const c = frames[(step % 4 + 4) % 4];
    const t = ease(frac(b * 2) / 0.2);
    for (const k of new Set([...Object.keys(a), ...Object.keys(c)])) {
      const base = k === 'lUp' || k === 'rUp' ? 0.1 : 0;
      o[k] = (a[k] ?? base) + ((c[k] ?? base) - (a[k] ?? base)) * t;
    }
  },
  /** Disco: rechter Arm zeigt schräg nach oben, dann quer nach unten; linke Hand an der Hüfte. */
  disco(o, b) {
    const up = Math.floor(b) % 2 === 0;
    const t = ease(frac(b) / 0.3);
    const from = up ? { u: 0.2, f: 1.0 } : { u: 2.5, f: 0.35 };
    const to = up ? { u: 2.5, f: 0.35 } : { u: 0.2, f: 1.0 };
    o.rUp = from.u + (to.u - from.u) * t;
    o.rFwd = from.f + (to.f - from.f) * t;
    o.rElbow = 0.05;
    o.rTwist = 0.3;
    o.lUp = 0.75; o.lFwd = -0.25; o.lElbow = 1.9;
    const k = up ? t : 1 - t;
    o.hipX = 0.08 * (2 * k - 1); o.hipRoll = -0.12 * (2 * k - 1);
    o.headYaw = 0.4 * k;
    o.headPitch = -0.18 * k;
    o.rfx = 0.1 * k;
    o.hipY = -0.07;
  },
  /** Running Man: ein Fuß nach vorn mit Knie hoch, der andere gleitet zurück. */
  runningman(o, b) {
    const ph = b * PI;
    o.lfz = 0.24 * S(ph); o.rfz = -0.24 * S(ph);
    o.lfy = 0.22 * Math.max(0, C(ph)); o.rfy = 0.22 * Math.max(0, -C(ph));
    o.hipY = -0.1 - 0.07 * dip(b);
    o.lFwd = -0.7 * S(ph); o.rFwd = 0.7 * S(ph);
    o.lElbow = o.rElbow = 1.6;
    o.lUp = o.rUp = 0.2;
    o.spinePitch = 0.1;
  },
  /** Headbangen mit Pommesgabel. */
  headbang(o, b) {
    const hb = dip(b);
    o.spinePitch = 0.1 + 0.3 * hb;
    o.headPitch = 0.5 * hb - 0.15;
    o.rUp = 2.55; o.rFwd = 0.3; o.rElbow = 0.25 + 0.4 * hb;
    o.lFwd = 0.7; o.lElbow = 1.7; o.lUp = 0.3;
    o.hipY = -0.12 - 0.1 * hb;
    o.lfx = -0.1; o.rfx = 0.1;
  },
  /** Über dem Kopf klatschen, dabei hüpfen. */
  clap(o, b) {
    const c = Math.pow(dip(b), 3);
    o.lUp = o.rUp = 2.3 + 0.55 * c;
    o.lFwd = o.rFwd = 0.25;
    o.lElbow = o.rElbow = 0.8 - 0.45 * c;
    o.jump = 0.1 * S(frac(b) * PI);
    o.hipY = -0.06 - 0.08 * dip(b);
    o.headPitch = -0.2;
  },
  /** Shuffle: Fersen und Spitzen rein und raus, Arme schwingen tief. */
  shuffle(o, b) {
    const s = S(b * PI * 2);
    o.hipX = 0.1 * S(b * PI / 2);
    o.lfx = -0.05 + 0.1 * s; o.rfx = 0.05 - 0.1 * s;
    o.lfy = 0.09 * Math.max(0, s); o.rfy = 0.09 * Math.max(0, -s);
    o.lfz = 0.06 * C(b * PI * 2); o.rfz = -0.06 * C(b * PI * 2);
    o.lFwd = 0.6 * s; o.rFwd = -0.6 * s;
    o.lElbow = o.rElbow = 0.9;
    o.lUp = o.rUp = 0.3;
    o.hipY = -0.09 - 0.05 * dip(b);
    o.spinePitch = 0.14;
  },
  /** Body-Roll: Welle von der Hüfte über die Brust in den Kopf, Arme oben. */
  bodyroll(o, b) {
    const ph = b * PI;
    o.hipZ = -0.08 * S(ph + 1.2);
    o.spinePitch = 0.28 * S(ph);
    o.headPitch = 0.35 * S(ph - 1.2);
    o.hipY = -0.08 - 0.08 * (0.5 + 0.5 * S(ph + 2));
    o.lUp = 2.3 + 0.2 * S(ph); o.rUp = 2.3 + 0.2 * S(ph);
    o.lElbow = o.rElbow = 0.9 + 0.3 * S(ph - 1);
    o.lFwd = o.rFwd = 0.3;
  },
  /** Backflip: ausholen, Salto rückwärts, landen, einen Schlag grooven (vier Schläge). */
  backflip(o, b) {
    const b4 = frac(b / 4) * 4;
    if (b4 < 1) {
      const k = ease(b4);
      o.hipY = -0.3 * k;
      o.spinePitch = 0.35 * k;
      o.lFwd = o.rFwd = -0.9 * k; o.lUp = o.rUp = 0.2;
    } else if (b4 < 2.3) {
      const t = (b4 - 1) / 1.3;
      const tuck = S(t * PI);
      o.jump = 1.25 * S(t * PI);
      o.flip = -PI * 2 * ease(t);
      o.hipY = -0.12 * tuck;
      o.lfy = o.rfy = 0.42 * tuck; o.lfz = o.rfz = 0.22 * tuck;
      o.lFwd = o.rFwd = 2.6 * (1 - t) + 1.2 * tuck; o.lUp = o.rUp = 0.3;
      o.lElbow = o.rElbow = 1.2 * tuck;
    } else if (b4 < 3) {
      const k = 1 - ease((b4 - 2.3) / 0.7);
      o.hipY = -0.32 * k;
      o.spinePitch = 0.3 * k;
      o.lUp = o.rUp = 1.5 + 0.6 * (1 - k); o.lElbow = o.rElbow = 0.2;
    } else {
      MOVE_FNS.groove(o, b);
    }
  },
  /** Jumpstyle-Kicks: abwechselnd ein Bein hoch nach vorn, Standbein hüpft, Gegenarm schlägt. */
  kick(o, b) {
    const ph = frac(b);
    const left = Math.floor(b) % 2 === 0;
    const k = S(ph * PI);
    if (left) { o.lfz = 0.55 * k; o.lfy = 0.5 * k; o.rFwd = 1.3 * k; o.rElbow = 0.3; o.lFwd = -0.4 * k; }
    else { o.rfz = 0.55 * k; o.rfy = 0.5 * k; o.lFwd = 1.3 * k; o.lElbow = 0.3; o.rFwd = -0.4 * k; }
    o.jump = 0.12 * k;
    o.spinePitch = -0.18 * k;
    o.hipY = -0.08 * (1 - k);
    o.lUp = o.rUp = 0.35;
  },
  /** Helikopter: tief in der Hocke, Arme gestreckt, zwei Umdrehungen pro vier Schläge. */
  helicopter(o, b) {
    o.spin = frac(b / 2) * PI * 2;
    o.hipY = -0.34 + 0.05 * dip(b);
    o.spinePitch = 0.3;
    o.lUp = o.rUp = 1.55;
    o.lElbow = o.rElbow = 0.05;
    o.lfx = -0.14; o.rfx = 0.14;
    o.headPitch = -0.3;
  },

  // ── Schritte mit Ortswechsel (die Figur bewegt sich dabei über die Tanzfläche, siehe TRAVEL) ──
  /** Stolzieren: ein Schritt pro Schlag, Arme pumpen, Kopf nickt. */
  strut(o, b) {
    const ph = b * PI;
    o.lfz = 0.2 * S(ph); o.rfz = -0.2 * S(ph);
    o.lfy = 0.11 * Math.max(0, C(ph)); o.rfy = 0.11 * Math.max(0, -C(ph));
    o.hipY = -0.05 + 0.04 * Math.abs(C(ph));
    o.hipYaw = 0.18 * S(ph);
    o.lFwd = -0.7 * S(ph); o.rFwd = 0.7 * S(ph);
    o.lElbow = o.rElbow = 1.3;
    o.lUp = o.rUp = 0.25;
    o.headPitch = 0.18 * dip(b) - 0.08;
    o.spinePitch = -0.05;
  },
  /** Moonwalk: abwechselnd ein Fuß flach nach hinten gleitend, der andere auf der Spitze. */
  moonwalk(o, b) {
    const ph = frac(b);
    const left = Math.floor(b) % 2 === 0;
    const slide = 0.16 - 0.32 * ph;           // gleitender Fuß von vorn nach hinten
    const toe = 0.07 * S(ph * PI);
    if (left) { o.lfz = slide; o.rfz = -slide * 0.4; o.rfy = toe + 0.03; }
    else { o.rfz = slide; o.lfz = -slide * 0.4; o.lfy = toe + 0.03; }
    o.hipY = -0.05;
    o.spinePitch = -0.06;
    o.lFwd = 0.25 * S(b * PI); o.rFwd = -0.25 * S(b * PI);
    o.lElbow = o.rElbow = 0.6;
    o.headPitch = -0.1;
    o.lUp = o.rUp = 0.2;
  },
  /** Seitlich shuffeln. */
  sidestep(o, b) {
    MOVE_FNS.shuffle(o, b);
    o.hipX = 0;
    o.lUp = o.rUp = 0.5 + 0.3 * dip(b);
  },
  /** Drehend über die Fläche. */
  spinmove(o, b) {
    MOVE_FNS.spin(o, b * 2);
    o.lfy = 0.06 * Math.max(0, S(b * PI * 2)); o.rfy = 0.06 * Math.max(0, -S(b * PI * 2));
  },
};

/** Tanzschritte am Platz. */
export const MOVES = ['groove', 'twostep', 'jump', 'spin', 'wave', 'robot', 'disco', 'runningman', 'headbang', 'clap', 'shuffle', 'bodyroll', 'kick'];
/** Für die Ausraster-Stimmung: nur Schritte mit viel Energie (Backflip und Helikopter gibt es nur hier). */
export const HYPE_MOVES = ['jump', 'backflip', 'kick', 'headbang', 'helicopter', 'clap', 'backflip', 'runningman'];
/**
 * Schritte mit Ortswechsel: Tempo (m/s) und Blickrichtung relativ zur Laufrichtung
 * ('along' = in Laufrichtung, 'back' = rückwärts wie beim Moonwalk, 'camera' = zum Publikum).
 */
export const TRAVEL = {
  strut: { speed: 0.82, face: 'along' },
  moonwalk: { speed: 0.55, face: 'back' },
  sidestep: { speed: 0.6, face: 'camera' },
  spinmove: { speed: 0.6, face: 'camera' },
};

export function dancePose(move, b, out) {
  neutralPose(out);
  (MOVE_FNS[move] || MOVE_FNS.groove)(out, b);
  return out;
}

/** Gehen: `phase` wächst mit der zurückgelegten Strecke. */
export function walkPose(phase, out) {
  neutralPose(out);
  const s = S(phase), c = C(phase);
  out.lfz = 0.22 * s; out.rfz = -0.22 * s;
  out.lfy = 0.1 * Math.max(0, c); out.rfy = 0.1 * Math.max(0, -c);
  out.lFwd = -0.45 * s; out.rFwd = 0.45 * s;
  out.lElbow = out.rElbow = 0.4;
  out.hipY = -0.04 + 0.03 * Math.abs(c);
  out.hipYaw = 0.1 * s;
  out.spinePitch = 0.05;
  return out;
}

/**
 * Sitzen (Kinosessel): Hüfte auf dem Polster, Unterarme auf den Lehnen. `t` in Sekunden,
 * `state` merkt sich je Figur, wohin sie gerade schaut und ob sie Popcorn isst.
 */
export function sitPose(t, state, out) {
  neutralPose(out);
  out.hipY = SIT_HIP_Y - HIP_Y;
  out.hipZ = -0.1;
  out.spinePitch = -0.14 + 0.012 * S(t * 1.6 + state.seed);
  out.lfz = out.rfz = 0.36;
  out.lfx = -0.03; out.rfx = 0.03;
  out.lUp = 0.16; out.rUp = 0.16;
  out.lFwd = 0.35; out.rFwd = 0.35;
  out.lElbow = 1.25; out.rElbow = 1.25;
  // ab und zu umschauen
  if (t > state.nextLook) {
    state.lookFrom = state.look;
    state.lookTo = (Math.random() - 0.5) * (Math.random() < 0.3 ? 1.1 : 0.4);
    state.lookAt = t;
    state.nextLook = t + 3 + Math.random() * 7;
  }
  state.look = state.lookFrom + (state.lookTo - state.lookFrom) * ease((t - state.lookAt) / 0.8);
  out.headYaw = state.look;
  out.headPitch = -0.08;
  // Popcorn: Hand zum Kopf
  if (state.popcorn) {
    if (t > state.nextBite) { state.biteAt = t; state.nextBite = t + 5 + Math.random() * 8; }
    const k = Math.max(0, S(Math.min(1, (t - state.biteAt) / 1.4) * PI));
    out.rFwd = 0.35 + 0.8 * k;
    out.rElbow = 1.25 + 1.0 * k;
    out.headPitch = -0.08 + 0.12 * k;
  }
  return out;
}

/** Zustand für sitPose je Figur. */
export function figureState(seed = 0, popcorn = false) {
  return { seed, popcorn, look: 0, lookFrom: 0, lookTo: 0, lookAt: -10, nextLook: Math.random() * 4, biteAt: -10, nextBite: 2 + Math.random() * 8 };
}
