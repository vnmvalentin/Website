// monsterModel.js — die Monster als 3D-Figuren.
//
// Skelett und Bewegung kommen vom Mannequin der Stream-Szenen (Quaternius, CC0,
// public/media/stream3d/dancer.glb, Clips idle / walk / jog). Der Körper selbst nicht mehr: die Gliederpuppe
// sah aus wie eine Gliederpuppe. Jedes Monster bekommt einen eigenen, durchgehend geformten Körper mit
// ausgearbeitetem Kopf (monsterBody.js) — ausgezehrt, mit Rippen, Wirbeln, langen Fingern und Krallen:
//   • Jäger (Schwester Agnes): wächsernes Gesicht mit leeren Augenhöhlen und aufgerissenem Kiefer, strähniges
//     Haar, Häubchen, fleckiger Kittel, Unterarme dunkel verkrustet
//   • Beobachter (der Förster): nur ein schwarzer Schatten mit Tierschädel und Geweih
//   • Lauscher (Patient 12): breit und gebückt, nasse graue Haut, Binde über den Augen, das Maul voller Zähne
//   • Gärtner (Wilhelm): Sack über dem Kopf mit zwei Löchern, Schlapphut, Mantel, Laterne in der Hand
// Dazu kommen: längere Glieder (Knochen werden skaliert), Haltung (nach jedem Bild werden Wirbelsäule, Hals
// und Kopf zusätzlich gebeugt) und Zucken.
//
// Mitspieler im Koop (kind 'human') bleiben das Mannequin in Platzfarbe.
// Lädt die Datei nicht, bleibt das Spiel bei den gemalten Billboards (game.js).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { organicBody } from './monsterBody';

const URL = '/media/stream3d/dancer.glb';
/** Gehtempo des Clips „walk“ bei timeScale 1 und Maßstab 1 (wie mocapFigure.WALK_MPS). */
const WALK_MPS = 1.05;
/** Lauftempo des Clips „jog“ bei timeScale 1 und Maßstab 1 (geschätzt aus der Schrittweite). */
const JOG_MPS = 2.4;

// ── Gestalt je Monster ─────────────────────────────────────────────────────
// bones: zusätzliche Länge je Knochen (wirkt auf alles darunter). bend: Beugung je Knochen in Bogenmaß um die
// Querachse (+ = nach vorn), roll = Kopf schief. Der Körperbau selbst steht in monsterBody.js (SHAPES).
const LONG_FINGERS = { f_index01: 1.3, f_middle01: 1.3, f_ring01: 1.3, f_pinky01: 1.3, thumb01: 1.15 };
const KINDS = {
  // Anstalt: hager, gebückt, lange Arme mit Krallenhänden
  hunter: {
    height: 2.55,
    bones: { upper_arm: 1.22, forearm: 1.12, hand: 1.08, neck: 1.25, ...LONG_FINGERS },
    bend: { 'spine.002': 0.22, 'spine.003': 0.2, neck: 0.25, head: -0.45 },
    run: true,
    twitch: true,
    gown: { color: 0x9a958a },
  },
  // Wald: sehr groß und dünn, Arme bis zu den Knien, Tierschädel mit Geweih, steht wie eine Statue
  watcher: {
    height: 2.75,
    bones: { upper_arm: 1.3, forearm: 1.3, hand: 1.3, thigh: 1.12, shin: 1.12, neck: 1.35 },
    bend: { 'spine.003': 0.12, neck: 0.15, head: -0.1 },
    roll: 0.28,
    // Nur ein Schatten: schwarz und unbeleuchtet (auch im Lichtkegel), zwei matte Augenpunkte. Man erkennt ihn
    // am Umriss vor dem Nachthimmel — nicht an Einzelheiten.
    shadow: true,
  },
  // Keller: breit, tief gebückt (fast auf allen vieren), keine Augen, nur das Maul
  listener: {
    height: 2.05,
    bones: { upper_arm: 1.35, forearm: 1.25, hand: 1.2, ...LONG_FINGERS },
    bend: { 'spine.001': 0.45, 'spine.002': 0.45, 'spine.003': 0.35, neck: -0.35, head: -0.55, upper_arm: -1.0 },
    // (Arme nach vorn drehen — sonst hingen sie am gebeugten Rumpf entlang nach hinten)
    wet: true,
    twitch: true,
  },
  // Garten: hager, nach vorn gebeugt, Kopf schnüffelnd gesenkt, Sack über dem Kopf, Laterne in der Hand
  tracker: {
    height: 2.4,
    bones: { upper_arm: 1.16, forearm: 1.16, hand: 1.1, neck: 1.15 },
    bend: { 'spine.002': 0.2, 'spine.003': 0.16, neck: 0.38, head: -0.12 },
    roll: -0.16,
    run: true,
    lantern: true,
    gown: { color: 0x3a3229, long: true },
  },
  // Kein Monster: ein toter Patient, der zusammengesunken sitzt (Anstalt, im Rollstuhl — events.js). Wird einmal
  // in Pose gebracht und bewegt sich dann nicht mehr.
  corpse: {
    height: 1.74,
    bones: {},
    bend: { thigh: -1.45, shin: 1.5, 'spine.001': 0.12, 'spine.003': 0.32, neck: 0.5, head: 0.3 },
    roll: 0.42,
  },
  // Mitspieler (Koop): das Mannequin wie es ist, nur in Spielerfarbe
  human: {
    height: 1.78,
    bones: {},
    bend: {},
    skin: '#3a4048',
    run: true,
    mannequin: true,
  },
};

/**
 * Kurzname ohne Präfix/Seite und ohne Punkte. three entfernt beim Laden die Punkte aus Knochennamen
 * (PropertyBinding.sanitizeNodeName): „DEF-spine.001“ heißt dann „DEF-spine001“, „DEF-upper_arm.L“ →
 * „DEF-upper_armL“. Beide Schreibweisen ergeben hier „spine001“ bzw. „upper_arm“.
 */
const shortName = (name) => name.replace(/^DEF-?/, '').replace(/\./g, '').replace(/(?<=[a-z0-9_])[LR]$/, '');
/** Wie shortName, aber mit Seite („upper_armL“) — so kennt monsterBody.js die Knochen. */
const sidedName = (bone) => bone.name.replace(/^DEF-?/, '').replace(/\./g, '');
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

// ── Teile am Kopf ──────────────────────────────────────────────────────────
// Alle Maße in Mannequin-Einheiten (Meter bei Maßstab 1), Blick nach +z, oben +y, Mitte = Kopfmitte —
// dieselben Maße wie die Köpfe in monsterBody.js.

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
  m.userData.eye = strength;   // setEyes() regelt die Helligkeit darüber
  return m;
}

/** Zwei Lichtpunkte tief in den Augenhöhlen. */
function addEyes(g, disposables, x, y, z, strength, r = 0.0055) {
  const geo = new THREE.SphereGeometry(r, 8, 6);
  const mat = eyeMaterial(strength);
  disposables.push(geo, mat);
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(geo, mat);
    e.position.set(s * x, y, z);
    g.add(e);
  }
}

/**
 * Zahnreihen entlang eines Bogens: ungleich lange, schief stehende Zähne, manche fehlen.
 * rows = [{ y, dir (+1 nach oben, -1 nach unten), n, halfWidth, zMid, zEdge, len }]
 */
function buildTeeth(disposables, rows) {
  const parts = [];
  let seed = 17;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (const row of rows) {
    for (let i = 0; i < row.n; i++) {
      if (rnd() < 0.16) continue;    // Lücke
      const u = row.n === 1 ? 0 : (i / (row.n - 1)) * 2 - 1;
      const len = row.len * (0.6 + rnd() * 0.7);
      const t = new THREE.CylinderGeometry(0.0012, 0.0034 + rnd() * 0.0012, len, 5);
      t.translate(0, len / 2, 0);
      if (row.dir < 0) t.rotateX(Math.PI);
      t.rotateZ((rnd() - 0.5) * 0.5);
      t.rotateX((rnd() - 0.5) * 0.4);
      t.translate(u * row.halfWidth, row.y, row.zEdge + (row.zMid - row.zEdge) * Math.sqrt(Math.max(0, 1 - u * u)));
      parts.push(t.toNonIndexed());
      t.dispose();
    }
  }
  const geo = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  const mat = new THREE.MeshStandardMaterial({ color: '#b3a482', roughness: 0.45 });
  disposables.push(geo, mat);
  return new THREE.Mesh(geo, mat);
}

/** Strähniges, schwarzes Haar: lange, spitz zulaufende Strähnen rund um den Kopf, einige hängen ins Gesicht. */
function buildHair(disposables) {
  const strands = [];
  let seed = 5;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const strand = (a, len, width, r) => {
    const g = new THREE.PlaneGeometry(width, len, 1, 5);
    const q = g.attributes.position;
    for (let n = 0; n < q.count; n++) {
      const k = 0.5 - q.getY(n) / len;                       // 0 oben … 1 Spitze
      q.setX(n, q.getX(n) * (1 - k * 0.85) + Math.sin(k * 5 + a * 3) * 0.006);
      // liegt oben am Schädel an und fällt dann gerade herab
      q.setZ(n, r * (1 + k * 0.12) - 0.105);
    }
    g.translate(0, -len / 2 + 0.085, 0.105);
    g.rotateY(a);
    strands.push(g.toNonIndexed());
    g.dispose();
  };
  // Hinterkopf und Seiten: dicht. 0 = vorn (+z).
  for (let i = 0; i < 26; i++) strand(0.75 + (i / 25) * (Math.PI * 2 - 1.5) + (rnd() - 0.5) * 0.1, 0.3 + rnd() * 0.3, 0.03 + rnd() * 0.025, 0.094);
  // ins Gesicht: wenige dünne Strähnen, eine über einem Auge
  for (const a of [-0.42, -0.2, 0.28, 0.5]) strand(a + (rnd() - 0.5) * 0.08, 0.2 + rnd() * 0.16, 0.012 + rnd() * 0.01, 0.097);
  const geo = mergeGeometries(strands);
  for (const g of strands) g.dispose();
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0x070606, roughness: 0.75, side: THREE.DoubleSide });
  disposables.push(geo, mat);
  return new THREE.Mesh(geo, mat);
}

/** Schwesternhäubchen: vergilbt und fleckig, sitzt schief am Hinterkopf. */
function buildCap(disposables) {
  const geo = new THREE.BoxGeometry(0.13, 0.055, 0.075, 2, 1, 1);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    // oben schmaler, vorn hochgeklappt
    if (p.getY(i) > 0) p.setXYZ(i, p.getX(i) * 0.78, p.getY(i) + (p.getZ(i) > 0 ? 0.012 : 0), p.getZ(i) * 0.8);
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0x8f8a78, roughness: 0.9 });
  disposables.push(geo, mat);
  const cap = new THREE.Mesh(geo, mat);
  cap.position.set(0.006, 0.118, -0.012);
  cap.rotation.set(-0.3, 0, 0.09);
  return cap;
}

/** Schlapphut des Gärtners: breite, wellige Krempe, eingedrückte Krone. */
function buildHat(disposables) {
  const pts = [[0, 0.1], [0.06, 0.098], [0.098, 0.085], [0.108, 0.03], [0.112, 0.0], [0.14, -0.004], [0.172, -0.02], [0.176, -0.025]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  // (Naht des Drehkörpers verschweißen — sonst zeigt sich dort nach dem Verformen eine Kante im Licht)
  const lathe = new THREE.LatheGeometry(pts, 26);
  lathe.deleteAttribute('normal');
  lathe.deleteAttribute('uv');
  const geo = mergeVertices(lathe, 1e-4);
  lathe.dispose();
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const r = Math.hypot(p.getX(i), p.getZ(i));
    const a = Math.atan2(p.getZ(i), p.getX(i));
    // Krempe hängt ungleichmäßig, vorn tiefer; die Krone ist auf einer Seite eingedrückt
    const brim = Math.max(0, r - 0.115) / 0.06;
    const dent = r < 0.1 ? Math.max(0, Math.cos(a - 0.9)) * 0.022 * (p.getY(i) > 0.05 ? 1 : 0) : 0;
    // (hinten hängt die Krempe, vorn steht sie etwas hoch — die Augenlöcher bleiben frei)
    p.setY(i, p.getY(i) - brim * (0.012 + 0.014 * Math.sin(a * 3 + 0.7) - 0.02 * Math.sin(a)) - dent);
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0x15110d, roughness: 0.95, side: THREE.DoubleSide });
  disposables.push(geo, mat);
  const hat = new THREE.Mesh(geo, mat);
  // sitzt im Nacken, leicht schief
  hat.position.set(0, 0.098, -0.02);
  hat.rotation.set(-0.2, 0, -0.07);
  return hat;
}

/** Geweih des Beobachters: Hauptstange schräg nach oben außen, vier Enden je Seite. */
function buildAntlers(disposables, mat) {
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
  const geo = mergeGeometries(antler.map((p) => p.toNonIndexed()));
  for (const p of antler) p.dispose();
  disposables.push(geo);
  return new THREE.Mesh(geo, mat);
}

/** Was außer dem geformten Kopf noch am Kopfknochen hängt. */
const EXTRAS = {
  hunter(g, disposables) {
    addEyes(g, disposables, 0.031, 0.006, 0.066, 3);
    g.add(buildTeeth(disposables, [
      { y: -0.046, dir: -1, n: 7, halfWidth: 0.02, zMid: 0.1, zEdge: 0.088, len: 0.013 },
      { y: -0.136, dir: 1, n: 6, halfWidth: 0.018, zMid: 0.062, zEdge: 0.052, len: 0.011 },
    ]));
    g.add(buildHair(disposables), buildCap(disposables));
  },
  watcher(g, disposables, skinMat) {
    g.add(buildAntlers(disposables, skinMat));
    // matte Punkte, die man erst aus der Nähe bemerkt (kein Leuchten über der Bloom-Schwelle)
    addEyes(g, disposables, 0.05, 0.025, 0.078, 0.55, 0.006);
  },
  listener(g, disposables) {
    g.add(buildTeeth(disposables, [
      { y: -0.052, dir: -1, n: 13, halfWidth: 0.046, zMid: 0.118, zEdge: 0.07, len: 0.024 },
      { y: -0.099, dir: 1, n: 12, halfWidth: 0.044, zMid: 0.114, zEdge: 0.068, len: 0.02 },
    ]));
  },
  corpse(g, disposables) {
    g.add(buildTeeth(disposables, [
      { y: -0.046, dir: -1, n: 7, halfWidth: 0.02, zMid: 0.1, zEdge: 0.088, len: 0.011 },
      { y: -0.136, dir: 1, n: 6, halfWidth: 0.018, zMid: 0.062, zEdge: 0.052, len: 0.01 },
    ]));
  },
  tracker(g, disposables) {
    // Strick um den Hals des Sacks, Hut obenauf, ein schwacher Schimmer tief in den Augenlöchern
    const rope = new THREE.TorusGeometry(0.083, 0.011, 6, 22);
    rope.rotateX(Math.PI / 2);
    rope.translate(0, -0.098, 0);
    const ropeMat = new THREE.MeshStandardMaterial({ color: 0x5a4a30, roughness: 1 });
    disposables.push(rope, ropeMat);
    g.add(new THREE.Mesh(rope, ropeMat), buildHat(disposables));
    addEyes(g, disposables, 0.037, 0.03, 0.086, 0.9, 0.004);
  },
};

/** Fleckiger Stoff (Kittel bzw. Mantel) mit dunklen Rändern am Saum. */
function gownTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#8f8a7c';
  x.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 260; i++) {
    const v = 90 + Math.floor(Math.random() * 60);
    x.fillStyle = 'rgba(' + v + ',' + (v - 4) + ',' + (v - 14) + ',0.25)';
    x.fillRect(Math.random() * 128, Math.random() * 256, 1, 4 + Math.random() * 14);
  }
  // Flecken: oben am Kragen und großflächig am Saum
  for (const [px, py, r, col] of [[40, 60, 34, 'rgba(60,10,8,0.75)'], [84, 96, 22, 'rgba(50,8,6,0.6)'], [64, 240, 70, 'rgba(18,14,10,0.85)'], [20, 200, 36, 'rgba(30,22,14,0.6)'], [104, 180, 30, 'rgba(46,10,8,0.5)']]) {
    const g = x.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, col);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.fillRect(px - r, py - r, r * 2, r * 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Kittel bzw. Mantel: offener, nach unten weiter werdender Schlauch von der Brust abwärts, Saum ausgefranst.
 * Maße in Mannequin-Einheiten; wird an den Hüftknochen gehängt und geht mit dem Körper mit.
 */
function buildGown(disposables, { color, long = false }) {
  const top = 1.36;
  const bottom = long ? 0.28 : 0.5;
  const geo = new THREE.CylinderGeometry(0.16, long ? 0.31 : 0.27, top - bottom, 20, 7, true);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const k = 0.5 - y / (top - bottom);           // 0 oben … 1 am Saum
    const a = Math.atan2(p.getZ(i), p.getX(i));
    const fold = 1 + Math.sin(a * 7) * 0.05 * k;  // Falten werden nach unten tiefer
    // Saum unregelmäßig lang; vorn/hinten flacher als breit (ein Körper ist kein Kreis)
    p.setXYZ(i, p.getX(i) * fold, y - (k > 0.95 ? Math.abs(Math.sin(a * 5 + 1.3)) * 0.1 : 0), p.getZ(i) * fold * 0.72);
  }
  geo.computeVertexNormals();
  geo.translate(0, (top + bottom) / 2, 0);
  const tex = gownTexture();
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, side: THREE.DoubleSide, color });
  disposables.push(geo, tex, mat);
  return new THREE.Mesh(geo, mat);
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

  // Das Mannequin besteht aus zwei Netzen (Körper + Gelenkringe) mit demselben Skelett
  const meshes = [];
  const bones = new Map();
  model.traverse((o) => {
    if (o.isBone) bones.set(o.name, o);
    if (o.isSkinnedMesh) meshes.push(o);
  });
  if (!meshes.length) return null;

  // Wirksame Skalierung je Knochen (Produkt entlang der Kette): Glieder werden länger, aber nicht dicker
  const boneLen = Object.fromEntries(Object.entries(cfg.bones).map(([k, v]) => [key(k), v]));
  const own = (b) => boneLen[shortName(b.name)] ?? 1;
  const chainScale = (b) => {
    let s = 1;
    for (let p = b; p && p.isBone; p = p.parent) s *= own(p);
    return s;
  };

  let skinMat;
  if (cfg.mannequin) {
    skinMat = new THREE.MeshStandardMaterial({ color: color || cfg.skin, roughness: 0.62, metalness: 0.05 });
    for (const mesh of meshes) {
      mesh.material = skinMat;
      mesh.castShadow = true;
      mesh.frustumCulled = false;
    }
  } else {
    // Eigener Körper statt der Puppe: neues Netz am selben Skelett, die Puppe selbst fliegt raus
    skinMat = cfg.shadow
      ? new THREE.MeshBasicMaterial({ color: 0x020203, transparent: true })
      : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: cfg.wet ? 0.3 : 0.66, metalness: 0 });
    const src = meshes[0];
    let made;
    try {
      made = organicBody(kind, src, sidedName, src.skeleton.bones.map(chainScale));
    } catch (err) {
      console.warn('[lights-out] Monsterkörper nicht gebaut, bleibe bei Billboards', err);
      return null;
    }
    if (!made) return null;
    const skin = new THREE.SkinnedMesh(made.geometry, skinMat);
    skin.castShadow = !cfg.shadow;      // ein Schatten wirft keinen (der verriete ihn im Lichtkegel)
    skin.frustumCulled = false;         // die Ruhe-Kugel passt nicht zu den verlängerten Gliedern
    skin.position.copy(src.position);
    skin.quaternion.copy(src.quaternion);
    skin.scale.copy(src.scale);
    src.parent.add(skin);
    skin.bind(src.skeleton, src.bindMatrix);
    for (const mesh of meshes) mesh.removeFromParent();
  }
  disposables.push(skinMat);

  // Teile am Kopf (Augen, Zähne, Haar, Hut, Geweih) an den Kopfknochen hängen — in der Ruhepose, damit sie sitzen
  const headBone = [...bones.values()].find((b) => /DEF-?head/.test(b.name));
  const neckBone = [...bones.values()].find((b) => /DEF-?neck/.test(b.name));
  model.updateMatrixWorld(true);
  const head = new THREE.Group();
  EXTRAS[kind]?.(head, disposables, skinMat);
  if (headBone) {
    const hp = new THREE.Vector3().setFromMatrixPosition(headBone.matrixWorld);
    head.position.copy(hp).add(new THREE.Vector3(0, 0.1, 0.01));
    model.add(head);
    headBone.attach(head);
    // Die Halskette wird länger skaliert — der Kopf soll trotzdem normal groß bleiben und an derselben Stelle
    // sitzen wie der geformte Kopf (dessen Ecken gleichen die Skalierung ebenfalls aus)
    const s = chainScale(headBone);
    head.scale.multiplyScalar(1 / s);
    head.position.multiplyScalar(1 / s);
  }
  head.traverse((o) => { if (o.isMesh) { o.castShadow = !cfg.shadow; o.frustumCulled = false; } });

  // Kittel bzw. Mantel an die Hüfte (unterster Wirbel) — in der Ruhepose ausgerichtet, danach geht er mit
  if (cfg.gown) {
    const hip = [...bones.values()].find((b) => shortName(b.name) === 'spine') || [...bones.values()].find((b) => /hips|spine/.test(b.name));
    if (hip) {
      const gown = buildGown(disposables, cfg.gown);
      gown.castShadow = true;
      gown.frustumCulled = false;
      model.add(gown);
      hip.attach(gown);
    }
  }

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
      lantern.scale.multiplyScalar(1 / chainScale(handBone));
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
  // Angriffspose (lunge): die Oberarme schwingen nach vorn auf einen zu — zusätzlich zur Grundhaltung
  const armList = [];
  for (const b of bones.values()) {
    if (shortName(b.name) === 'upper_arm') armList.push([b, localAxis(b, _x), -1.35 - ((cfg.bend || {}).upper_arm || 0)]);
  }
  const eyeMats = [];
  const fadeMats = new Set(cfg.shadow ? [skinMat] : []);
  head.traverse((o) => {
    if (!o.material?.userData?.eye) return;
    eyeMats.push(o.material);
    if (cfg.shadow) { o.material.transparent = true; fadeMats.add(o.material); }
  });
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
  let twitchAt = 2 + Math.random() * 4;
  let twitchDir = 1;
  return {
    group,
    lantern,
    get scale() { return scale; },
    /** Weltposition des Kopfes (für die Nahaufnahme, wenn es einen packt). */
    headWorld(target) { return head.getWorldPosition(target); },
    /** Helligkeit der Augen (1 = normal). */
    setEyes(k) { for (const m of eyeMats) m.color.setScalar(m.userData.eye * k); },
    /** Deckkraft des Schattens (nur der Beobachter löst sich auf). */
    setFade(a) { for (const m of fadeMats) m.opacity = a; },
    /**
     * @param {number} dt
     * @param {{ speed?: number, frozen?: boolean, listening?: boolean }} s
     *   speed: m/s auf dem Boden · frozen: mitten in der Bewegung erstarren (Beobachter im Blick)
     *   listening: stehen bleiben und horchen (Lauscher)
     */
    update(dt, { speed = 0, frozen = false, listening = false, lunge = 0 } = {}) {
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
      if (lunge > 0) {
        for (const [b, axis, angle] of armList) b.quaternion.premultiply(_q.setFromAxisAngle(axis, angle * lunge));
      }
      if (headBone) {
        let roll = cfg.roll || 0;
        // Zucken: alle paar Sekunden reißt es den Kopf kurz zur Seite; beim Zupacken zittert er durchgehend
        if (cfg.twitch) {
          const left = twitchAt - t;
          if (left < 0) {
            twitchAt = t + 1.5 + Math.random() * 4.5;
            twitchDir = Math.random() < 0.5 ? -1 : 1;
          } else if (left < 0.16) roll += twitchDir * 0.5 * Math.sin((1 - left / 0.16) * Math.PI);
        }
        if (lunge > 0) roll += Math.sin(t * 47) * 0.12 * lunge;
        // Lauscher horcht: Kopf pendelt langsam zur Seite
        if (listening) roll += Math.sin(t * (kind === 'tracker' ? 3.1 : 1.3)) * (kind === 'tracker' ? 0.22 : 0.35);
        if (roll) headBone.quaternion.premultiply(_q.setFromAxisAngle(rollAxis, roll));
      }
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
