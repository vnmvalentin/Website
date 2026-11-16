// ui/table/scene/figure.js — der Zeichner gegenüber: Kapuze, Maske, zwei Hände auf dem Tisch.
//
// Bewusst schlicht und fast schwarz: man soll eine Gestalt ahnen, nicht eine Figur mustern. Lesbar sind nur die
// Maske und die Hände — beides fängt das Kerzenlicht. Ursprung = Tischhöhe unter der Gestalt, +z zeigt zum Spieler.
//
// Seit Phase 3 ist die Gestalt beweglich: Hände sind eigene Gruppen mit Fingergelenken, die Ärmel werden jedes Bild
// von der Schulter zum Handgelenk gespannt (fitArms), Kopf und Oberkörper lassen sich neigen. Bewegt wird sie von
// scene/puppet.js. Die Maske ist austauschbar (setMask, Liste in ../masks.js).
import * as THREE from "three";
import { cleanFigureMask } from "../masks.js";

const lathe = (pts, segs = 28) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), segs);
const UP = new THREE.Vector3(0, 1, 0);
/** Abstand der Schultern von der Körpermitte. */
const SHOULDER_X = 13;

export function figureMaterials() {
  return {
    cloth: new THREE.MeshStandardMaterial({ color: 0x2a211a, roughness: 1 }),
    clothRim: new THREE.MeshStandardMaterial({ color: 0x43352a, roughness: 0.95, side: THREE.DoubleSide }),
    void: new THREE.MeshBasicMaterial({ color: 0x030201 }),
    mask: new THREE.MeshStandardMaterial({ color: 0xd9ccae, roughness: 0.7 }),
    skin: new THREE.MeshStandardMaterial({ color: 0xc2ab8c, roughness: 0.78 }),
    ink: new THREE.MeshStandardMaterial({ color: 0x14100c, roughness: 0.6 }),
    wax: new THREE.MeshStandardMaterial({ color: 0x8e1b1b, roughness: 0.35 }),
    bark: new THREE.MeshStandardMaterial({ color: 0x8a6646, roughness: 1 }),
    horn: new THREE.MeshStandardMaterial({ color: 0xb7a583, roughness: 0.8 }),
    ember: new THREE.MeshBasicMaterial({ color: 0xff8a3a }),
    iron: new THREE.MeshStandardMaterial({ color: 0x5a544c, roughness: 0.5, metalness: 0.45 }),
    pearl: new THREE.MeshStandardMaterial({ color: 0xe8ddc8, roughness: 0.35, metalness: 0.1 }),
    scale: new THREE.MeshStandardMaterial({ color: 0x55603f, roughness: 0.6 }),
  };
}

/** Glied zwischen zwei Punkten (Kapsel). */
function limb(a, b, r, mat) {
  const from = new THREE.Vector3(...a);
  const to = new THREE.Vector3(...b);
  const len = from.distanceTo(to);
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10), mat);
  mesh.position.copy(from).add(to).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(UP, to.clone().sub(from).normalize());
  return mesh;
}

/** Kugel, zu einem Oval gestaucht. */
function blob(mat, sx, sy, sz, x, y, z, segs = 20) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, segs, Math.max(8, Math.round(segs * 0.7))), mat);
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  return m;
}

/**
 * Hand, aufgelegt, Finger zeigen nach +z. Etwa so groß wie eine Karte (10 breit, 17 lang) — lange, knochige
 * Finger mit Knöchel und tintenschwarzen Kuppen. `side` = −1 (linke Bildseite) oder +1; der Daumen zeigt zur Tischmitte.
 *
 * Jeder Finger hat zwei Gelenke (Wurzel, Knöchel): `curl` 0 = gestreckt aufgelegt, 1 = zur Faust gekrümmt,
 * `lift` hebt den Finger an (Trommeln).
 * @returns {{ group: THREE.Group, fingers: Array<{ root: THREE.Group, joint: THREE.Group }>, thumb: THREE.Group,
 *   index: number, side: number }}
 */
export function makeHand(m, side) {
  const hand = new THREE.Group();
  // Handrücken: flach, zum Handgelenk schmaler
  hand.add(blob(m.skin, 4.6, 1.5, 5.2, 0, 1.7, 0, 22));
  hand.add(blob(m.skin, 3.4, 1.4, 3.2, 0, 1.7, -3.6, 18));
  hand.add(limb([0, 1.9, -5], [0, 3.4, -10.5], 2.3, m.skin));    // Handgelenk, verschwindet im Ärmel
  // Vier Finger: Grundglied steigt zum Knöchel, Endglied fällt zur Tischplatte. Der Zeigefinger liegt neben dem
  // Daumen (zur Tischmitte), der kleine Finger außen.
  const xs = [-3.3, -1.1, 1.1, 3.3];
  const lens = side > 0 ? [0.9, 1, 0.98, 0.84] : [0.84, 0.98, 1, 0.9];
  const fingers = xs.map((x, i) => {
    const L = lens[i];
    const root = new THREE.Group();
    root.position.set(x, 1.9, 4.2);
    root.rotation.y = x * 0.055;                  // leicht gespreizt
    root.add(limb([0, 0, 0], [0, 0.6, 5.5 * L], 0.92, m.skin));
    const joint = new THREE.Group();
    joint.position.set(0, 0.6, 5.5 * L);
    joint.add(limb([0, 0, 0], [0, -1.75, 4.9 * L], 0.78, m.skin));
    const pad = new THREE.Mesh(new THREE.SphereGeometry(0.86, 12, 10), m.ink);
    pad.position.set(0, -1.75, 4.9 * L);
    joint.add(pad);
    root.add(joint);
    hand.add(root);
    return { root, joint };
  });
  // Daumen: seitlich abgespreizt
  const thumb = new THREE.Group();
  thumb.position.set(-side * 3.6, 1.7, -1.2);
  thumb.add(limb([0, 0, 0], [-side * 3.0, 0.2, 2.8], 1.15, m.skin), limb([-side * 3.0, 0.2, 2.8], [-side * 4.0, -0.8, 6.4], 0.95, m.skin));
  const tpad = new THREE.Mesh(new THREE.SphereGeometry(1.02, 12, 10), m.ink);
  tpad.position.set(-side * 4.0, -0.8, 6.4);
  thumb.add(tpad);
  hand.add(thumb);
  hand.rotation.order = "YXZ";
  return { group: hand, fingers, thumb, index: side > 0 ? 0 : 3, side };
}

/**
 * Finger einer Hand stellen. @param {ReturnType<typeof makeHand>} hand
 * @param {number[]} curl je Finger 0–1 @param {number[]} [lift] je Finger 0–1 (angehoben)
 */
export function poseHand(hand, curl, lift) {
  hand.fingers.forEach((f, i) => {
    const c = curl[i] || 0;
    const l = lift ? lift[i] || 0 : 0;
    f.root.rotation.x = c * 0.85 - l * 0.3;
    f.joint.rotation.x = c * 1.5;
  });
  const avg = (curl[0] + curl[1] + curl[2] + curl[3]) / 4;
  hand.thumb.rotation.y = hand.side * avg * 0.55;
}

// ── Masken ──────────────────────────────────────────────────────────────────
// Alle sitzen vor dem schwarzen Kern der Kapuze (z ≈ 7,6) und sind rund 9 breit und 12 hoch.

/** Schmale, schräg gestellte Augen. */
function slitEyes(g, m, y = 0.9, w = 1.25, h = 0.5, tilt = -0.22, z = 8.75) {
  for (const sx of [-1, 1]) {
    const eye = blob(m.void, w, h, 0.5, sx * 1.9, y, z, 16);
    eye.rotation.z = sx * tilt;
    g.add(eye);
  }
}

const MASK_BUILDERS = {
  /** Flaches, helles Oval, zwei schmale Augen, ein roter Wachsstrich von der Stirn bis zum Kinn. */
  wachs(g, m) {
    g.add(blob(m.mask, 4.5, 6.3, 1.5, 0, -0.6, 7.6, 28));
    slitEyes(g, m);
    const streak = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 9.4, 3, 8), m.wax);
    streak.position.set(0, -1.0, 9.12);
    streak.scale.set(1, 1, 0.5);
    g.add(streak);
    g.add(blob(m.wax, 0.42, 0.42, 0.42, 0, -6.3, 8.7, 10));
  },
  /** Rabe: runde Augen, langer Schnabel nach vorn unten, Unterschnabel in Tinte. */
  rabe(g, m) {
    g.add(blob(m.mask, 4.3, 5.0, 1.5, 0, 0.9, 7.6, 28));
    for (const sx of [-1, 1]) g.add(blob(m.void, 1.05, 1.05, 0.5, sx * 2.0, 1.7, 8.75, 16));
    const beak = new THREE.Mesh(new THREE.ConeGeometry(2.1, 10, 16), m.mask);
    beak.rotation.x = Math.PI / 2 + 0.6;
    beak.scale.set(0.8, 1, 0.62);
    beak.position.set(0, -2.9, 10.6);
    g.add(beak);
    const lower = new THREE.Mesh(new THREE.ConeGeometry(1.5, 8, 14), m.ink);
    lower.rotation.x = Math.PI / 2 + 0.72;
    lower.scale.set(0.8, 1, 0.5);
    lower.position.set(0, -3.9, 9.8);
    g.add(lower);
    g.add(blob(m.wax, 0.34, 0.34, 0.3, 0, 4.3, 8.72, 10));
  },
  /** Geweih: schmale Augen, zwei kurze Stangen mit je einer Sprosse, ein Wachsband unter den Augen. */
  geweih(g, m) {
    g.add(blob(m.mask, 4.4, 6.2, 1.5, 0, -0.6, 7.6, 28));
    slitEyes(g, m, 0.8, 1.3, 0.42, 0.18);
    for (const sx of [-1, 1]) {
      g.add(limb([sx * 2.2, 4.4, 8.3], [sx * 5.0, 8.6, 9.4], 0.52, m.horn));
      g.add(limb([sx * 5.0, 8.6, 9.4], [sx * 4.5, 11.2, 9.9], 0.38, m.horn));
      g.add(limb([sx * 3.6, 6.5, 8.85], [sx * 6.3, 7.4, 10.0], 0.36, m.horn));
    }
    const band = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 5.4, 3, 8), m.wax);
    band.rotation.z = Math.PI / 2;
    band.scale.set(1, 1, 0.5);
    band.position.set(0, -1.9, 9.02);
    g.add(band);
  },
  /** Halbmond: eine helle Sichel (die dunkle Scheibe verdeckt die andere Hälfte), ein einziges Auge mit Wachsträne. */
  mond(g, m) {
    g.add(blob(m.mask, 5.3, 5.3, 1.4, -0.2, -0.2, 7.6, 30));
    g.add(blob(m.void, 4.6, 4.9, 1.45, 2.5, 0.4, 7.72, 30));
    const eye = blob(m.void, 1.15, 0.5, 0.5, -2.9, 0.4, 8.5, 16);
    eye.rotation.z = 0.2;
    g.add(eye);
    const tear = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 1.9, 3, 8), m.wax);
    tear.position.set(-2.9, -1.4, 8.6);
    tear.scale.set(1, 1, 0.5);
    g.add(tear);
    g.add(blob(m.wax, 0.34, 0.34, 0.3, -2.9, -2.7, 8.5, 10));
  },
  /** Rinde: langes, dunkles Holz mit Längsfurchen; in den Augenschlitzen glimmt es. */
  rinde(g, m) {
    g.add(blob(m.bark, 4.0, 6.8, 1.7, 0, -0.8, 7.6, 28));
    for (const [x, y0, y1] of [[-2.7, -3.2, 2.6], [-1.3, -5.4, -0.4], [0, 2.4, 5.0], [0.2, -6.2, -1.6], [1.5, -4.6, 0.2], [2.8, -2.6, 3.0]]) {
      const z = 7.6 + 1.7 * Math.sqrt(Math.max(0, 1 - (x / 4) ** 2 - (((y0 + y1) / 2 + 0.8) / 6.8) ** 2)) - 0.08;
      g.add(limb([x, y0, z], [x, y1, z], 0.13, m.ink));
    }
    for (const sx of [-1, 1]) {
      const slit = blob(m.void, 1.3, 0.34, 0.5, sx * 1.8, 1.2, 8.86, 16);
      slit.rotation.z = -sx * 0.12;
      g.add(slit);
      g.add(blob(m.ember, 0.3, 0.16, 0.16, sx * 1.8, 1.2, 9.3, 8));
    }
  },
  /** Dreiauge: blanker Knochen, zwei runde Augen und ein drittes auf der Stirn in einem Wachsring. */
  drei(g, m) {
    g.add(blob(m.horn, 4.6, 5.7, 1.4, 0, -0.4, 7.6, 28));
    for (const [x, y] of [[-2.0, 0.1], [2.0, 0.1], [0, 3.0]]) g.add(blob(m.void, 0.95, 0.95, 0.5, x, y, 8.62 - Math.abs(y) * 0.03, 16));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.15, 8, 28), m.wax);
    ring.position.set(0, 3.0, 8.82);
    ring.scale.set(1, 1, 0.5);
    g.add(ring);
  },

  // ── Nur Gestalten der Moorwanderung (nicht wählbar, ../masks.js: NPC_MASK_IDS) ──
  /** Kiemen (Fische, Robben): blasses Oval, runde flache Augen, je drei Kiemenbögen, ein Flossenkamm. */
  kiemen(g, m) {
    g.add(blob(m.mask, 4.6, 6.0, 1.45, 0, -0.5, 7.6, 28));
    for (const sx of [-1, 1]) {
      g.add(blob(m.void, 1.25, 1.25, 0.5, sx * 2.1, 1.0, 8.7, 18));
      g.add(blob(m.pearl, 0.4, 0.4, 0.3, sx * 2.1, 1.0, 9.05, 10));
      for (let i = 0; i < 3; i++) {
        const arc = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.2, 6, 14, Math.PI * 0.75), m.wax);
        arc.position.set(sx * (1.5 + i * 0.6), -2.7, 8.85 - i * 0.12);
        // Bogen 0…135°: rechts zu „)“ gedreht, links zu „(“
        arc.rotation.set(0, sx * 0.5, sx > 0 ? -Math.PI * 0.375 : Math.PI * 0.625);
        g.add(arc);
      }
    }
    for (let i = 0; i < 5; i++) g.add(limb([0, 4.4 + i * 0.1, 8.4 - i * 0.9], [0, 7.6 - i * 0.35, 7.9 - i * 0.9], 0.18, m.wax));
  },
  /** Muschel (Schalentiere): fächerförmige, perlmuttene Schale mit Rippen, zwei schmale Augen am Schloss. */
  muschel(g, m) {
    // Fächer nach oben: Schloss unten am Kinn, Rippen strahlen zur Stirn (Zylinderausschnitt, um x gekippt)
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 1.2, 28, 1, false, -Math.PI * 0.28, Math.PI * 0.56), m.pearl);
    shell.rotation.x = -Math.PI / 2;
    shell.position.set(0, -5.6, 8.0);
    g.add(shell);
    for (let i = -3; i <= 3; i++) {
      const a = i * 0.24;
      g.add(limb([0, -5.4, 8.72], [Math.sin(a) * 7.6, -5.4 + Math.cos(a) * 7.6, 8.72], 0.16, m.horn));
    }
    g.add(blob(m.horn, 1.7, 1.1, 0.8, 0, -5.6, 8.8, 14));
    slitEyes(g, m, 0.0, 0.9, 0.36, 0.1, 9.0);
  },
  /** Eisen (Gebautes, Wracks): dunkle Eisenmaske mit Sehschlitz, Nieten und einem Rostfleck aus Wachs. */
  eisen(g, m) {
    g.add(blob(m.iron, 4.3, 6.1, 1.5, 0, -0.6, 7.6, 24));
    const visor = blob(m.void, 3.4, 0.34, 0.5, 0, 1.0, 8.95, 16);
    g.add(visor);
    g.add(limb([0, 4.6, 8.85], [0, -6.0, 8.85], 0.22, m.iron));
    for (const [x, y] of [[-3.0, 3.2], [3.0, 3.2], [-3.2, -1.8], [3.2, -1.8], [-1.8, -5.0], [1.8, -5.0]]) {
      g.add(blob(m.horn, 0.32, 0.32, 0.25, x, y, 8.62 + (Math.abs(y) < 3 ? 0.25 : 0), 8));
    }
    g.add(blob(m.wax, 0.9, 0.6, 0.2, 2.0, -3.4, 8.82, 10));
  },
  /** Schuppe (Schlangen): schmales, langes Gesicht, Schuppenreihen, senkrechte Pupillen in Wachs. */
  schuppe(g, m) {
    g.add(blob(m.scale, 3.6, 6.6, 1.5, 0, -0.8, 7.6, 26));
    for (const sx of [-1, 1]) {
      g.add(blob(m.wax, 0.95, 0.75, 0.45, sx * 1.6, 1.4, 8.75, 14));
      g.add(blob(m.void, 0.16, 0.62, 0.4, sx * 1.6, 1.4, 9.08, 8));
    }
    for (let r = 0; r < 5; r++) {
      for (let c = -2; c <= 2; c++) {
        if ((r + c) % 2) continue;
        const y = -1.4 - r * 1.1;
        const x = c * 0.9;
        const z = 7.6 + 1.5 * Math.sqrt(Math.max(0, 1 - (x / 3.6) ** 2 - ((y + 0.8) / 6.6) ** 2)) - 0.05;
        g.add(blob(m.horn, 0.42, 0.3, 0.12, x, y, z, 8));
      }
    }
  },
};


/**
 * Nur die Maske (für Vorschaubilder). @param {ReturnType<typeof figureMaterials>} m @param {string} id
 */
export function buildMask(m, id) {
  const g = new THREE.Group();
  MASK_BUILDERS[cleanFigureMask(id)](g, m);
  return g;
}

/**
 * Schmuck der Bosse über der Maske: eine Dornenkrone aus Knochen; in Phase 2 zieht sich ein glimmender Sprung
 * durch die Maske (`cracked`). @param {ReturnType<typeof figureMaterials>} m @param {{ crown?: boolean, cracked?: boolean }} d
 */
function buildDecor(m, d) {
  const g = new THREE.Group();
  if (d.crown) {
    // Dornenkranz über der Stirn, vorn um die Maske gelegt — über dem Kopf läge er außerhalb des Bildes
    const R = 5;
    const Y = 4.4;
    const CZ = 4.5;
    const bandGeo = new THREE.TorusGeometry(R, 0.42, 8, 26, Math.PI);
    bandGeo.rotateX(Math.PI / 2);                 // Bogen (cos a, 0, sin a): vorn herum
    const band = new THREE.Mesh(bandGeo, m.ink);
    band.position.set(0, Y, CZ);
    g.add(band);
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * (0.14 + (i / 6) * 0.72);
      const len = i % 2 ? 2.2 : 3.4;
      const thorn = new THREE.Mesh(new THREE.ConeGeometry(0.5, len, 8), m.horn);
      thorn.position.set(Math.cos(a) * R, Y + len / 2 - 0.2, CZ + Math.sin(a) * R);
      thorn.rotation.set(Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.55);
      g.add(thorn);
    }
    g.add(blob(m.wax, 0.45, 0.75, 0.35, 2.2, Y - 0.9, CZ + 4.6, 10));
  }
  if (d.cracked) {
    const pts = [[0.4, 6.4], [-0.7, 3.4], [0.9, 0.6], [-0.5, -2.4], [0.6, -5.0], [-0.2, -6.8]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[i + 1];
      g.add(limb([x0, y0, 9.35], [x1, y1, 9.35], 0.2, m.ember));
      g.add(limb([x0, y0, 9.2], [x1, y1, 9.2], 0.42, m.void));
    }
  }
  return g;
}

/**
 * Kapuze ohne Maske: der Mantel ist vorn offen (Drehkörper mit Lücke um +z), innen sitzt ein schwarzer Kern.
 * Auch für die Vorschaubilder der Masken (scene/maskThumbs.js).
 * @param {ReturnType<typeof figureMaterials>} m
 */
export function makeHood(m) {
  const head = new THREE.Group();
  const OPEN = 0.8;
  const cowl = new THREE.Mesh(
    new THREE.LatheGeometry([[13.5, -10.5], [11.6, -4], [10.2, 2], [8.2, 7], [4.6, 10], [0, 10.8]].map(([r, y]) => new THREE.Vector2(r, y)), 32, OPEN, Math.PI * 2 - OPEN * 2),
    m.clothRim,
  );
  cowl.scale.set(1, 1, 1.08);
  head.add(cowl);
  const dark = blob(m.void, 8.6, 10, 7.2, 0, -1, 0, 20);
  head.add(dark);
  return { head, dark };
}

/**
 * @param {ReturnType<typeof figureMaterials>} m
 * @param {{ handX?: number, handZ?: number, mask?: string }} [opt]  Lage der Hände (Handwurzel) relativ zur Gestalt
 */
export function makeFigure(m, opt = {}) {
  const handX = opt.handX ?? 34;
  const handZ = opt.handZ ?? 30;
  const group = new THREE.Group();

  // Oberkörper und Kopf lehnen sich leicht über den Tisch
  const torso = new THREE.Group();
  torso.rotation.x = 0.2;
  group.add(torso);
  // Schmal gehalten (Rückmeldung 14.11.2026: der Körper wirkte „ein bisschen dick“): eine hagere Gestalt mit
  // abfallenden Schultern statt eines breiten Kegels. Die Schultern (SHOULDER_X) sitzen am Rand des Mantels.
  const cloak = new THREE.Mesh(lathe([[17, -46], [16.5, -12], [15.5, 4], [14.5, 14], [12.5, 22], [9, 28], [5.5, 31], [0, 31.5]], 36), m.cloth);
  cloak.scale.set(1.08, 1, 0.7);
  torso.add(cloak);

  const { head, dark } = makeHood(m);
  head.position.set(0, 37, 3);
  head.rotation.order = "YXZ";
  torso.add(head);

  const shade = (o) => o.traverse((x) => { if (x.isMesh) { x.castShadow = true; x.receiveShadow = true; } });
  let maskId = "";
  /** @type {THREE.Group | null} */
  let maskGroup = null;
  /** Schmuck der Bosse (Dornenkrone, Sprung in der Maske) — sitzt wie die Maske am Kopf. */
  let decorKey = "";
  /** @type {THREE.Group | null} */
  let decorGroup = null;
  /** @param {{ crown?: boolean, cracked?: boolean } | null} d */
  const setDecor = (d) => {
    const k = `${!!d?.crown}|${!!d?.cracked}`;
    if (k === decorKey) return;
    decorKey = k;
    if (decorGroup) {
      head.remove(decorGroup);
      decorGroup.traverse((o) => o.geometry?.dispose());
      decorGroup = null;
    }
    if (!d?.crown && !d?.cracked) return;
    decorGroup = buildDecor(m, d);
    shade(decorGroup);
    head.add(decorGroup);
  };
  const setMask = (id) => {
    const next = cleanFigureMask(id);
    if (next === maskId) return;
    maskId = next;
    if (maskGroup) {
      head.remove(maskGroup);
      maskGroup.traverse((o) => o.geometry?.dispose());
    }
    maskGroup = buildMask(m, next);
    shade(maskGroup);
    head.add(maskGroup);
  };

  // Arme: weite Ärmel von der Schulter (sitzt am Oberkörper, neigt sich mit) bis über das Handgelenk
  const arms = [-1, 1].map((side) => {
    const hand = makeHand(m, side);
    hand.group.position.set(side * handX, 0, handZ);
    hand.group.rotation.y = -side * 0.3;
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(3.3, 5.6, 1, 18, 1, true), m.clothRim);
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(5.4, 0.9, 8, 26), m.clothRim);
    // Schulterkugel: schließt den Ärmel oben ab (sonst sähe man bei angewinkeltem Arm in ein offenes Rohr)
    const ball = new THREE.Mesh(new THREE.SphereGeometry(3.9, 16, 12), m.clothRim);
    group.add(hand.group, sleeve, cuff, ball);
    return { side, hand, sleeve, cuff, ball, shoulder: new THREE.Vector3(side * SHOULDER_X, 22, 4), rest: { x: side * handX, y: 0, z: handZ, yaw: -side * 0.3 } };
  });
  const sh = new THREE.Vector3();
  const cuffAt = new THREE.Vector3();
  const dir = new THREE.Vector3();
  /** Ärmel neu spannen — nach jeder Bewegung von Hand oder Oberkörper. */
  const fitArms = () => {
    for (const a of arms) {
      sh.copy(a.shoulder).applyEuler(torso.rotation);
      cuffAt.set(0, 3.6, -9.5).applyQuaternion(a.hand.group.quaternion).add(a.hand.group.position);
      const len = Math.max(1, sh.distanceTo(cuffAt));
      dir.copy(sh).sub(cuffAt).normalize();
      a.sleeve.position.copy(sh).add(cuffAt).multiplyScalar(0.5);
      a.sleeve.quaternion.setFromUnitVectors(UP, dir);
      a.sleeve.scale.set(1, len, 1);
      a.ball.position.copy(sh);
      a.cuff.position.copy(cuffAt);
      a.cuff.quaternion.copy(a.sleeve.quaternion);
      a.cuff.rotateX(Math.PI / 2);
    }
  };

  shade(group);
  dark.castShadow = false;
  setMask(opt.mask);
  fitArms();
  return {
    group, torso, head, arms, hands: arms.map((a) => a.hand.group), fitArms, setMask, setDecor,
    get mask() { return maskId; },
    get decor() { return decorKey; },
  };
}
