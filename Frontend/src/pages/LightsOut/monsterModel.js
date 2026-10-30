// monsterModel.js — die drei Monster als echte 3D-Figuren (statt Pappaufsteller).
//
// Grundlage ist das Mannequin aus den Stream-Szenen (Quaternius, CC0, public/media/stream3d/dancer.glb)
// mit seinen Motion-Capture-Clips idle / walk / jog. Daraus wird je Monster eine eigene Gestalt:
//   • Körper ausgezehrt: jede Ecke des Netzes rückt (nach Knochen gewichtet) näher an ihren Knochen
//   • Glieder länger: Knochen werden skaliert (Arme bis zu den Knien, lange Beine, langer Hals)
//   • Haltung: nach jedem Bild werden Wirbelsäule/Hals/Kopf zusätzlich gebeugt (gebückt, Kopf schief)
//   • eigener Kopf: Maske (Jäger), Tierschädel mit Geweih (Beobachter), augenloser Kopf mit
//     senkrechtem Maul (Lauscher), Jutesack mit Strick (Gärtner, dazu eine Laterne in der rechten Hand)
//     — der Mannequin-Kopf wird dafür stark verkleinert.
//
// Lädt die Datei nicht, bleibt das Spiel bei den gemalten Billboards (game.js).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { sackTexture } from './textures';

const URL = '/media/stream3d/dancer.glb';
/** Gehtempo des Clips „walk“ bei timeScale 1 und Maßstab 1 (wie mocapFigure.WALK_MPS). */
const WALK_MPS = 1.05;
/** Lauftempo des Clips „jog“ bei timeScale 1 und Maßstab 1 (geschätzt aus der Schrittweite). */
const JOG_MPS = 2.4;

// ── Gestalt je Monster ─────────────────────────────────────────────────────
// thin: Dicke je Körperteil (1 = Mannequin). bones: zusätzliche Länge je Knochen (wirkt auf alles darunter).
// bend: Beugung je Knochen in Bogenmaß um die eigene x-Achse (+ = nach vorn), roll = Kopf schief.
const KINDS = {
  // Anstalt: hager, gebückt, lange Arme mit Krallenhänden, blasse Maske
  hunter: {
    height: 2.55,
    thin: { torso: 0.68, arm: 0.5, leg: 0.6, neck: 0.55, hand: 0.75, finger: 0.55, foot: 0.8 },
    bones: { upper_arm: 1.22, forearm: 1.12, hand: 1.08, neck: 1.25 },
    bend: { 'spine.002': 0.22, 'spine.003': 0.2, neck: 0.25, head: -0.45 },
    skin: '#1c1816',
    run: true,
  },
  // Wald: sehr groß und dünn, Arme bis zu den Knien, Tierschädel mit Geweih, steht wie eine Statue
  watcher: {
    height: 2.75,
    thin: { torso: 0.55, arm: 0.42, leg: 0.48, neck: 0.45, hand: 0.6, finger: 0.45, foot: 0.7 },
    bones: { upper_arm: 1.3, forearm: 1.3, hand: 1.3, thigh: 1.12, shin: 1.12, neck: 1.35 },
    bend: { 'spine.003': 0.12, neck: 0.15, head: -0.1 },
    roll: 0.28,
    skin: '#0c0a08',
  },
  // Keller: breit, tief gebückt (fast auf allen vieren), kein Gesicht, nur ein senkrechtes Maul
  listener: {
    height: 2.05,
    thin: { torso: 1.08, arm: 0.72, leg: 0.8, neck: 0.85, hand: 0.9, finger: 0.65, foot: 0.9 },
    bones: { upper_arm: 1.35, forearm: 1.25, hand: 1.2 },
    bend: { 'spine.001': 0.45, 'spine.002': 0.45, 'spine.003': 0.35, neck: -0.35, head: -0.55, upper_arm: -1.0 },
    // (Arme nach vorn drehen — sonst hingen sie am gebeugten Rumpf entlang nach hinten)
    skin: '#4f4a42',
  },
  // Garten: hager, nach vorn gebeugt, Kopf schnüffelnd gesenkt, Sack über dem Kopf, Laterne in der Hand
  tracker: {
    height: 2.4,
    thin: { torso: 0.72, arm: 0.52, leg: 0.6, neck: 0.6, hand: 0.8, finger: 0.6, foot: 0.85 },
    bones: { upper_arm: 1.16, forearm: 1.16, hand: 1.1, neck: 1.15 },
    bend: { 'spine.002': 0.2, 'spine.003': 0.16, neck: 0.38, head: -0.12 },
    roll: -0.16,
    skin: '#2b241c',
    run: true,
    lantern: true,
  },
  // Mitspieler (Koop): das Mannequin wie es ist, nur in Spielerfarbe — eigener Kopf bleibt
  human: {
    height: 1.78,
    thin: {},
    bones: {},
    bend: {},
    skin: '#3a4048',
    run: true,
    keepHead: true,
  },
};

/** Körperteil eines Knochens (für die Dicke). */
function partOf(name) {
  if (/head/.test(name)) return 'head';
  if (/neck/.test(name)) return 'neck';
  if (/upper_arm|forearm/.test(name)) return 'arm';
  if (/f_|thumb/.test(name)) return 'finger';
  if (/hand/.test(name)) return 'hand';
  if (/thigh|shin/.test(name)) return 'leg';
  if (/foot|toe/.test(name)) return 'foot';
  return 'torso';
}
/**
 * Kurzname ohne Präfix/Seite und ohne Punkte. three entfernt beim Laden die Punkte aus Knochennamen
 * (PropertyBinding.sanitizeNodeName): „DEF-spine.001“ heißt dann „DEF-spine001“, „DEF-upper_arm.L“ →
 * „DEF-upper_armL“. Beide Schreibweisen ergeben hier „spine001“ bzw. „upper_arm“.
 */
const shortName = (name) => name.replace(/^DEF-?/, '').replace(/\./g, '').replace(/(?<=[a-z0-9_])[LR]$/, '');
/** Schlüssel aus KINDS (mit Punkten geschrieben) in dieselbe Form bringen. */
const key = (name) => name.replace(/\./g, '');

let kitPromise = null;
/** Lädt das Mannequin einmal. Liefert null bei Fehlern (dann bleiben die Billboards). */
export function loadMonsterKit() {
  if (!kitPromise) {
    kitPromise = new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), 20000);
      new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(URL, (gltf) => {
        clearTimeout(timer);
        const clips = new Map();
        for (const name of ['idle', 'walk', 'jog']) {
          const c = gltf.animations.find((a) => a.name === name);
          if (!c) continue;
          // Skalierungsspuren raus: die Knochenlängen setzt dieses Modul selbst
          const clip = c.clone();
          clip.tracks = clip.tracks.filter((t) => !t.name.endsWith('.scale'));
          clips.set(name, clip);
        }
        resolve({ scene: gltf.scene, clips });
      }, undefined, (err) => {
        clearTimeout(timer);
        console.warn('[lights-out] Monster-Modell nicht geladen, bleibe bei Billboards', err);
        resolve(null);
      });
    });
  }
  return kitPromise;
}

// ── Körper ausdünnen ───────────────────────────────────────────────────────
/**
 * Neue Geometrie, in der jede Ecke näher an ihre Knochen rückt (gewichtet nach Skin-Gewichten).
 * k je Knochen wird durch die Knochenskalierung geteilt, damit verlängerte Glieder nicht dicker werden.
 */
function thinGeometry(mesh, cfg, effScale) {
  const geo = mesh.geometry.clone();
  const bones = mesh.skeleton.bones;
  const bindPos = bones.map((_, i) => new THREE.Vector3().setFromMatrixPosition(mesh.skeleton.boneInverses[i].clone().invert()));
  // Knochenachse: vom Knochen zu seinem Kind (Wirbelsäule bevorzugt, sonst erstes Kind im Skelett)
  const tip = bones.map((b, i) => {
    const kids = b.children.filter((c) => c.isBone && bones.includes(c));
    const kid = kids.find((c) => /spine|neck|head/.test(c.name)) || (kids.length === 1 ? kids[0] : null)
      || (/hand/.test(b.name) ? kids.find((c) => /f_middle\.?01/.test(c.name)) : null);
    return kid ? bindPos[bones.indexOf(kid)] : bindPos[i];
  });
  const kOf = bones.map((b, i) => {
    const part = partOf(b.name);
    // Mannequin-Kopf stark verkleinern — er verschwindet im eigenen Kopf. NICHT auf 0: dann entstehen
    // Dreiecke ohne Fläche, deren Normale NaN ergibt — der Bloom macht daraus ein komplett schwarzes Bild.
    if (part === 'head') return cfg.keepHead ? 1 : 0.3;
    return (cfg.thin[part] ?? 1) / effScale[i];
  });

  const pos = geo.attributes.position;
  const si = geo.attributes.skinIndex;
  const sw = geo.attributes.skinWeight;
  const bind = mesh.bindMatrix;
  const bindInv = mesh.bindMatrixInverse;
  const v = new THREE.Vector3();
  const out = new THREE.Vector3();
  const q = new THREE.Vector3();
  const seg = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  for (let n = 0; n < pos.count; n++) {
    v.fromBufferAttribute(pos, n).applyMatrix4(bind);
    out.set(0, 0, 0);
    let wSum = 0;
    for (let c = 0; c < 4; c++) {
      const w = sw.getComponent(n, c);
      if (w <= 0) continue;
      const b = si.getComponent(n, c);
      const a = bindPos[b];
      seg.subVectors(tip[b], a);
      const len2 = seg.lengthSq();
      const t = len2 > 1e-8 ? THREE.MathUtils.clamp(tmp.subVectors(v, a).dot(seg) / len2, 0, 1) : 0;
      q.copy(a).addScaledVector(seg, t);
      tmp.subVectors(v, q).multiplyScalar(kOf[b]).add(q);
      out.addScaledVector(tmp, w);
      wSum += w;
    }
    if (wSum > 0) out.multiplyScalar(1 / wSum); else out.copy(v);
    out.applyMatrix4(bindInv);
    pos.setXYZ(n, out.x, out.y, out.z);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  // Sicherheitsnetz: Normale der Länge 0 (entartete Dreiecke) würden im Shader NaN ergeben
  const nrm = geo.attributes.normal;
  for (let n = 0; n < nrm.count; n++) {
    const len = Math.hypot(nrm.getX(n), nrm.getY(n), nrm.getZ(n));
    if (!(len > 1e-6)) nrm.setXYZ(n, 0, 1, 0);
  }
  geo.computeBoundingSphere();
  return geo;
}

// ── Köpfe ──────────────────────────────────────────────────────────────────
// Alle Maße in Mannequin-Einheiten (Meter bei Maßstab 1), Blick nach +z, oben +y, Mitte = Kopfmitte.

/** Zylinder von a nach b (Radius r0 → r1). */
function limb(a, b, r0, r1, seg = 6) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const g = new THREE.CylinderGeometry(r1, r0, dir.length(), seg, 1);
  g.translate(0, dir.length() / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
  g.translate(a.x, a.y, a.z);
  return g;
}

/** Leuchtende Pupille (hell genug für den Bloom-Schwellwert 1,5 der Nachbearbeitung). */
function eyeMaterial(strength) {
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff });
  m.color.multiplyScalar(strength);
  return m;
}

/** Maske des Jägers: blasses, gesprungenes Porzellan mit Augen- und Mundloch (planar von vorn). */
function maskTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 160;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 70, 10, 64, 80, 90);
  g.addColorStop(0, '#d9d3c4');
  g.addColorStop(1, '#8f897c');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 160);
  // Risse
  x.strokeStyle = 'rgba(40,34,30,0.75)';
  x.lineWidth = 1.2;
  for (const [sx, sy, pts] of [[30, 10, [[38, 40], [33, 58], [42, 80]]], [96, 120, [[88, 104], [94, 92]]], [70, 6, [[74, 28], [68, 44]]]]) {
    x.beginPath();
    x.moveTo(sx, sy);
    for (const [px, py] of pts) x.lineTo(px, py);
    x.stroke();
  }
  // Augenlöcher (schräg, traurig) und runder Mund
  x.fillStyle = '#050403';
  for (const s of [-1, 1]) {
    x.beginPath();
    x.ellipse(64 + s * 22, 66, 17, 12, s * 0.35, 0, Math.PI * 2);
    x.fill();
  }
  x.beginPath();
  x.ellipse(64, 116, 12, 15, 0, 0, Math.PI * 2);
  x.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildHunterHead(skinMat, disposables) {
  const g = new THREE.Group();
  // Schädel unter der Maske: dunkel, zum Hinterkopf hin lang
  const skull = new THREE.SphereGeometry(0.105, 20, 14).scale(0.95, 1.12, 1.08);
  g.add(new THREE.Mesh(skull, skinMat));
  // Maske: vordere Hälfte eines flachen Ellipsoids, Textur planar von vorn
  const maskGeo = new THREE.SphereGeometry(0.1, 24, 16, 0, Math.PI).scale(0.92, 1.22, 0.62);
  const p = maskGeo.attributes.position;
  const uv = maskGeo.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 0.184 + 0.5, p.getY(i) / 0.244 + 0.5);
  maskGeo.translate(0, -0.005, 0.045);
  const maskTex = maskTexture();
  const maskMat = new THREE.MeshStandardMaterial({ map: maskTex, color: 0x6f6a62, roughness: 0.55, metalness: 0 });
  disposables.push(maskGeo, maskTex, maskMat, skull);
  g.add(new THREE.Mesh(maskGeo, maskMat));
  // winzige Lichtpunkte tief in den Augenlöchern
  const eyeGeo = new THREE.SphereGeometry(0.0055, 8, 6);
  const eyeMat = eyeMaterial(3);
  disposables.push(eyeGeo, eyeMat);
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(eyeGeo, eyeMat);
    e.position.set(s * 0.032, 0.016, 0.107);
    g.add(e);
  }
  return g;
}

function buildWatcherHead(skinMat, disposables) {
  const g = new THREE.Group();
  const bone = new THREE.MeshStandardMaterial({ color: '#cfc4ad', roughness: 0.72 });
  const dark = new THREE.MeshBasicMaterial({ color: '#020202' });
  // Hirnschale + lange Schnauze nach vorn unten
  const parts = [
    new THREE.SphereGeometry(0.085, 18, 12).scale(1, 0.85, 1.05).translate(0, 0.02, -0.01),
    limb(new THREE.Vector3(0, 0.0, 0.04), new THREE.Vector3(0, -0.06, 0.23), 0.06, 0.024, 10),
    // Nasenbein
    limb(new THREE.Vector3(0, 0.035, 0.05), new THREE.Vector3(0, -0.03, 0.22), 0.022, 0.012, 6),
  ];
  // Geweih: Hauptstange schräg nach oben außen, drei Enden
  const antler = [];
  for (const s of [-1, 1]) {
    const pts = [
      new THREE.Vector3(s * 0.05, 0.07, -0.01),
      new THREE.Vector3(s * 0.13, 0.17, -0.03),
      new THREE.Vector3(s * 0.2, 0.3, -0.06),
      new THREE.Vector3(s * 0.25, 0.45, -0.05),
      new THREE.Vector3(s * 0.27, 0.58, -0.02),
    ];
    for (let i = 0; i < pts.length - 1; i++) antler.push(limb(pts[i], pts[i + 1], 0.018 - i * 0.0035, 0.015 - i * 0.0035, 6));
    for (const [from, to] of [[1, [s * 0.08, 0.27, 0.07]], [2, [s * 0.12, 0.42, 0.04]], [3, [s * 0.36, 0.56, 0.0]], [2, [s * 0.33, 0.36, -0.12]]]) {
      antler.push(limb(pts[from], new THREE.Vector3(...to), 0.011, 0.004, 5));
    }
  }
  const skullGeo = mergeGeometries(parts.map((p) => p.toNonIndexed()));
  const antlerGeo = mergeGeometries(antler.map((p) => p.toNonIndexed()));
  const antlerMat = new THREE.MeshStandardMaterial({ color: '#4a3d2e', roughness: 0.85 });
  for (const p of [...parts, ...antler]) p.dispose();
  disposables.push(bone, dark, skullGeo, antlerGeo, antlerMat);
  g.add(new THREE.Mesh(skullGeo, bone), new THREE.Mesh(antlerGeo, antlerMat));
  // leere Augenhöhlen mit je einem Lichtpunkt
  const socketGeo = new THREE.SphereGeometry(0.024, 10, 8);
  const eyeGeo = new THREE.SphereGeometry(0.006, 8, 6);
  const eyeMat = eyeMaterial(4);
  disposables.push(socketGeo, eyeGeo, eyeMat);
  for (const s of [-1, 1]) {
    const so = new THREE.Mesh(socketGeo, dark);
    so.position.set(s * 0.048, 0.025, 0.06);
    const e = new THREE.Mesh(eyeGeo, eyeMat);
    e.position.set(s * 0.05, 0.025, 0.078);
    g.add(so, e);
  }
  return g;
}

function buildListenerHead(skinMat, disposables) {
  const g = new THREE.Group();
  // glatter, augenloser Kopf, nach vorn lang gezogen
  const headGeo = new THREE.SphereGeometry(0.115, 22, 16).scale(0.95, 0.88, 1.18);
  // senkrechtes Maul: dunkler Spalt mit Zähnen an beiden Rändern
  const mouthMat = new THREE.MeshBasicMaterial({ color: '#0a0303' });
  const mouthGeo = new THREE.SphereGeometry(0.06, 14, 10).scale(0.32, 1.25, 0.25);
  const teeth = [];
  for (let i = 0; i < 7; i++) {
    const y = -0.055 + i * 0.018;
    for (const s of [-1, 1]) {
      const t = new THREE.ConeGeometry(0.006, 0.022, 5);
      t.rotateZ(s * Math.PI / 2);                     // Spitze zur Mitte
      t.translate(s * 0.014, y, 0);
      teeth.push(t.toNonIndexed());
      t.dispose();
    }
  }
  const teethGeo = mergeGeometries(teeth);
  for (const t of teeth) t.dispose();
  const teethMat = new THREE.MeshStandardMaterial({ color: '#cbbfa6', roughness: 0.4 });
  disposables.push(headGeo, mouthMat, mouthGeo, teethGeo, teethMat);
  g.add(new THREE.Mesh(headGeo, skinMat));
  const mouth = new THREE.Group();
  mouth.position.set(0, -0.015, 0.128);
  mouth.add(new THREE.Mesh(mouthGeo, mouthMat), new THREE.Mesh(teethGeo, teethMat));
  g.add(mouth);
  g.userData.mouth = mouth;
  return g;
}

function buildTrackerHead(skinMat, disposables) {
  const g = new THREE.Group();
  // Sack: Kugel, oben zum Zipfel gerafft, unten weiter als der Kopf
  const sackGeo = new THREE.SphereGeometry(0.13, 24, 18);
  const p = sackGeo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const k = y > 0.05 ? 1 - (y - 0.05) * 2.6 : 1 + Math.max(0, -y - 0.06) * 0.8;
    p.setXYZ(i, p.getX(i) * k * (1 + Math.sin(i * 1.7) * 0.03), y * 1.08, p.getZ(i) * k * 1.05);
  }
  sackGeo.computeVertexNormals();
  // UV-Mitte (u = 0.5) liegt bei der Kugel auf -z — Gesicht nach vorn (+z) drehen
  sackGeo.rotateY(Math.PI);
  const tex = sackTexture();
  const sackMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, color: 0x8a7a62 });
  // Zipfel und Strick
  const tuft = new THREE.ConeGeometry(0.03, 0.09, 8);
  tuft.translate(0, 0.17, 0);
  const rope = new THREE.TorusGeometry(0.085, 0.012, 6, 20);
  rope.rotateX(Math.PI / 2);
  rope.translate(0, -0.1, 0);
  const ropeMat = new THREE.MeshStandardMaterial({ color: 0x5a4a30, roughness: 1 });
  disposables.push(sackGeo, tex, sackMat, tuft, rope, ropeMat);
  g.add(new THREE.Mesh(sackGeo, sackMat), new THREE.Mesh(tuft, sackMat), new THREE.Mesh(rope, ropeMat));
  return g;
}

/** Laterne für die Hand des Gärtners: Rahmen, glühendes Glas (über der Bloom-Schwelle), Bügel. */
function buildLantern(disposables) {
  const g = new THREE.Group();
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x1c1a16, roughness: 0.55, metalness: 0.7 });
  const glassMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffa850).multiplyScalar(2.4) });
  const top = new THREE.CylinderGeometry(0.03, 0.065, 0.05, 8);
  top.translate(0, 0.1, 0);
  const bottom = new THREE.CylinderGeometry(0.065, 0.065, 0.025, 8);
  bottom.translate(0, -0.085, 0);
  const glass = new THREE.CylinderGeometry(0.05, 0.05, 0.15, 8);
  const handle = new THREE.TorusGeometry(0.04, 0.005, 5, 14, Math.PI);
  handle.translate(0, 0.13, 0);
  disposables.push(frameMat, glassMat, top, bottom, glass, handle);
  g.add(new THREE.Mesh(top, frameMat), new THREE.Mesh(bottom, frameMat), new THREE.Mesh(glass, glassMat), new THREE.Mesh(handle, frameMat));
  return g;
}

const HEADS = { hunter: buildHunterHead, watcher: buildWatcherHead, listener: buildListenerHead, tracker: buildTrackerHead };

// ── Figur ──────────────────────────────────────────────────────────────────
const _q = new THREE.Quaternion();
const _x = new THREE.Vector3(1, 0, 0);
const _z = new THREE.Vector3(0, 0, 1);

/**
 * Ein Monster bauen (kit aus loadMonsterKit). Die Gruppe steht mit den Füßen auf y = 0 und schaut nach +z.
 * update(dt, { speed, frozen, listening }) wählt den Clip passend zum Tempo.
 */
export function buildMonsterModel(kit, kind, { color } = {}) {
  const cfg = KINDS[kind] || KINDS.hunter;
  const disposables = [];
  const group = new THREE.Group();
  const model = SkeletonUtils.clone(kit.scene);
  group.add(model);

  const skinMat = new THREE.MeshStandardMaterial({ color: color || cfg.skin, roughness: 0.62, metalness: 0.05 });
  disposables.push(skinMat);

  // Das Mannequin besteht aus zwei Netzen (Körper + Gelenkringe) mit demselben Skelett — beide umbauen
  const meshes = [];
  const bones = new Map();
  model.traverse((o) => {
    if (o.isBone) bones.set(o.name, o);
    if (o.isSkinnedMesh) meshes.push(o);
  });
  if (!meshes.length) return null;

  // Wirksame Skalierung je Knochen (Produkt entlang der Kette), für die Dicken-Ausgleichsrechnung
  const boneLen = Object.fromEntries(Object.entries(cfg.bones).map(([k, v]) => [key(k), v]));
  const own = (b) => boneLen[shortName(b.name)] ?? 1;
  for (const mesh of meshes) {
    const effScale = mesh.skeleton.bones.map((b) => {
      let s = 1;
      for (let p = b; p && p.isBone; p = p.parent) s *= own(p);
      return s;
    });
    const geo = thinGeometry(mesh, cfg, effScale);
    disposables.push(geo);
    mesh.geometry = geo;
    mesh.material = skinMat;            // Körper und Gelenkringe bekommen dieselbe Haut
    mesh.castShadow = true;
    mesh.frustumCulled = false;         // die Ruhe-Kugel passt nicht zu den verlängerten Gliedern
  }

  // Kopf an den Kopfknochen hängen (in der Ruhepose, damit er richtig sitzt)
  const headBone = [...bones.values()].find((b) => /DEF-?head/.test(b.name));
  const neckBone = [...bones.values()].find((b) => /DEF-?neck/.test(b.name));
  model.updateMatrixWorld(true);
  const head = HEADS[kind] ? HEADS[kind](skinMat, disposables) : new THREE.Group();
  if (headBone) {
    const hp = new THREE.Vector3().setFromMatrixPosition(headBone.matrixWorld);
    head.position.copy(hp).add(new THREE.Vector3(0, 0.1, 0.01));
    model.add(head);
    headBone.attach(head);
    // die Halskette wird länger skaliert — der Kopf soll trotzdem normal groß bleiben
    let s = 1;
    for (let p = headBone; p && p.isBone; p = p.parent) s *= own(p);
    head.scale.multiplyScalar(1 / s);
  }
  head.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });

  // Laterne in der rechten Hand (Gärtner); game.js setzt ein Punktlicht an ihre Weltposition
  let lantern = null;
  if (cfg.lantern) {
    const handBone = [...bones.values()].find((b) => /DEF-?hand\.?R$/.test(b.name));
    if (handBone) {
      lantern = buildLantern(disposables);
      const hp = new THREE.Vector3().setFromMatrixPosition(handBone.matrixWorld);
      lantern.position.copy(hp).add(new THREE.Vector3(0, -0.2, 0.02));
      model.add(lantern);
      handBone.attach(lantern);
      let s = 1;
      for (let q = handBone; q && q.isBone; q = q.parent) s *= own(q);
      lantern.scale.multiplyScalar(1 / s);
      lantern.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    }
  }

  // Knochen verlängern
  for (const b of bones.values()) {
    const s = own(b);
    if (s !== 1) b.scale.setScalar(s);
  }

  // Größe: Kopfoberkante auf cfg.height bringen (in Ruhepose gemessen)
  model.updateMatrixWorld(true);
  const topY = headBone ? new THREE.Vector3().setFromMatrixPosition(headBone.matrixWorld).y + 0.2 : 1.8;
  const scale = cfg.height / topY;
  model.scale.setScalar(scale);

  // Beugung: nach jedem Mixer-Schritt auf die Clip-Drehung draufrechnen. Die Achsen der Knochen zeigen
  // im Rig irgendwohin — deshalb „links-rechts“ (Modell-x) und „vorn“ (Modell-z) aus der Ruhepose in
  // die lokale Achse jedes Knochens umrechnen.
  model.updateMatrixWorld(true);
  const _wq = new THREE.Quaternion();
  const localAxis = (b, axis) => {
    b.parent.getWorldQuaternion(_wq);
    model.getWorldQuaternion(_q);
    // Achse im Modellraum → Weltraum → Elternraum des Knochens. Gedreht wird im Elternraum (premultiply):
    // so schwingt z. B. ein Arm nach vorn, egal wie ihn der Clip gerade hält (im eigenen Raum wäre die
    // Seitenachse in der T-Pose die Längsachse des Arms — er würde sich nur verdrehen).
    const w = axis.clone().applyQuaternion(_q);
    return w.applyQuaternion(_wq.invert()).normalize();
  };
  const bendList = [];
  for (const [name, angle] of Object.entries(cfg.bend || {})) {
    // gleiche Namen links und rechts (Arme, Beine) — alle Treffer beugen
    for (const b of bones.values()) if (shortName(b.name) === key(name)) bendList.push([b, localAxis(b, _x), angle]);
  }
  const rollAxis = headBone ? localAxis(headBone, _z) : _z;
  const neckRollAxis = neckBone ? localAxis(neckBone, _z) : _z;

  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  for (const [name, clip] of kit.clips) actions[name] = mixer.clipAction(clip);
  let current = null;
  const play = (name, fade = 0.35) => {
    const a = actions[name];
    if (!a || a === current) return a;
    a.reset().setEffectiveWeight(1).fadeIn(current ? fade : 0).play();
    if (current) current.fadeOut(fade);
    current = a;
    return a;
  };
  play('idle');
  // Jede Figur fängt woanders im Clip an
  if (current) current.time = Math.random() * current.getClip().duration;

  let t = Math.random() * 10;
  let posed = false;
  return {
    group,
    lantern,
    get scale() { return scale; },
    /**
     * @param {number} dt
     * @param {{ speed?: number, frozen?: boolean, listening?: boolean }} s
     *   speed: m/s auf dem Boden · frozen: mitten in der Bewegung erstarren (Beobachter im Blick)
     *   listening: stehen bleiben und horchen (Lauscher)
     */
    update(dt, { speed = 0, frozen = false, listening = false } = {}) {
      // Statue: Pose bleibt genau so stehen. Wichtig: dann auch keine Beugung draufrechnen — ohne
      // Mixer-Schritt würde sie sich Bild für Bild aufsummieren (Kopf dreht sich weg).
      if ((frozen || dt <= 0) && posed) return;
      posed = true;
      t += dt;
      {
        const walkMps = WALK_MPS * scale;
        const jogMps = JOG_MPS * scale;
        if (speed < 0.08) {
          play('idle', 0.5);
          if (current) current.timeScale = kind === 'watcher' ? 0.35 : 0.8;
        } else if (cfg.run && speed > walkMps * 1.9 && actions.jog) {
          play('jog', 0.25).timeScale = THREE.MathUtils.clamp(speed / jogMps, 0.6, 1.6);
        } else {
          play('walk', 0.3).timeScale = THREE.MathUtils.clamp(speed / walkMps, 0.35, 1.9);
        }
        mixer.update(dt);
      }
      for (const [b, axis, angle] of bendList) b.quaternion.premultiply(_q.setFromAxisAngle(axis, angle));
      if (headBone) {
        let roll = cfg.roll || 0;
        // Lauscher horcht: Kopf pendelt langsam zur Seite
        if (listening) roll += Math.sin(t * (kind === 'tracker' ? 3.1 : 1.3)) * (kind === 'tracker' ? 0.22 : 0.35);
        if (roll) headBone.quaternion.premultiply(_q.setFromAxisAngle(rollAxis, roll));
      }
      // Maul des Lauschers öffnet und schließt sich
      const mouth = head.userData.mouth;
      if (mouth) mouth.scale.x = 1 + 0.6 * Math.max(0, Math.sin(t * (listening ? 5 : 2.2)));
      if (neckBone && kind === 'watcher') {
        // kaum merkliches Zucken im Hals
        neckBone.quaternion.premultiply(_q.setFromAxisAngle(neckRollAxis, Math.sin(t * 0.7) * 0.04));
      }
    },
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(model);
      for (const d of disposables) d.dispose?.();
    },
  };
}
