// avatarWear.js — selbst gebaute Hüte und Accessoires für den Figurbaukasten.
//
// Die Hüte des Figuren-Pakets sind Teil ihrer Figur (avatarParts.js schneidet sie heraus). Hier kommen
// eigene dazu: Weihnachtsmütze, Beanie, Cap, Krone … Sie werden aus einfachen Formen gebaut (wie das
// Paket: einfarbig, ohne Texturen), auf den gewählten Kopf eingemessen (avatarSeams.headFit) und starr
// an den Kopfknochen gehängt. Haare werden wie bei den Paket-Hüten unter die Unterseite gedrückt;
// Mützen und Caps (cover) nehmen zusätzlich alle Haare über dem Rand unter den Hut, Bügel
// (Kopfhörer, Geweih) liegen über den Haaren.
//
// Accessoires sind ein eigener Bereich („extra“): Brille, Schal, Leuchtstäbe, Flügel, Rucksack.
//
// Alle Maße in Weltmaß der Figur-Dateien (Figur ≈ 3,2 hoch, Blick nach +z, links = +x).
// Materialnamen mit „Gold“ werden in peopleFigure.js metallisch; leuchtende Farben über emissive.
import * as THREE from 'three';

const mat = (color, o = {}) => {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o });
  if (o.name) m.name = o.name;
  return m;
};
const glow = (color, k = 1.6) => mat(color, { emissive: color, emissiveIntensity: k, roughness: 0.5 });

/** Halbkugel (Kuppel nach oben). */
const dome = (r, seg = 16) => new THREE.SphereGeometry(r, seg, 10, 0, Math.PI * 2, 0, Math.PI / 2);

/** Gruppe mit allen Materialien (peopleFigure räumt sie je Figur ab). */
function finish(g, mats) {
  g.userData.materials = mats;
  return g;
}

/**
 * Gebogener Kegel aus einem Stück (Zipfelmütze): Ringe entlang einer Linie, die sich nach oben immer
 * stärker zur Seite (+x) neigt; der Radius nimmt bis zur Spitze ab. Unten offen.
 * @returns {{ geometry: THREE.BufferGeometry, tip: THREE.Vector3 }}
 */
function bentCone({ r0, r1, len, bend, rings = 12, radial = 16 }) {
  const pos = [], idx = [];
  const p = new THREE.Vector3();
  let tip = new THREE.Vector3();
  for (let i = 0; i <= rings; i++) {
    const u = i / rings;
    const th = bend * u * u;                       // unten senkrecht, oben geneigt
    if (i > 0) {
      const thMid = bend * ((i - 0.5) / rings) ** 2;
      p.x += Math.sin(thMid) * len / rings;
      p.y += Math.cos(thMid) * len / rings;
    }
    const r = r0 + (r1 - r0) * Math.pow(u, 0.85);
    for (let k = 0; k < radial; k++) {
      const a = (k / radial) * Math.PI * 2;
      // Ring senkrecht zur Laufrichtung (sin th, cos th, 0)
      const cx = Math.cos(a) * r;
      pos.push(p.x + cx * Math.cos(th), p.y - cx * Math.sin(th), Math.sin(a) * r);
    }
    if (i > 0) {
      const a0 = (i - 1) * radial, b0 = i * radial;
      for (let k = 0; k < radial; k++) {
        const k1 = (k + 1) % radial;
        idx.push(a0 + k, a0 + k1, b0 + k, a0 + k1, b0 + k1, b0 + k);
      }
    }
    tip = p.clone();
  }
  // Spitze schließen
  const apex = pos.length / 3;
  pos.push(tip.x, tip.y, tip.z);
  const last = rings * radial;
  for (let k = 0; k < radial; k++) idx.push(last + k, last + (k + 1) % radial, apex);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setIndex(idx);
  geometry.computeVertexNormals();
  return { geometry, tip };
}

/** Zipfelmütze: gebogener Kegel + Rand + Bommel an der Spitze. */
function floppyHat(g, { fabric, brim, tip, len = 0.78, bend = 1.9, brimR = 0.085 }) {
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.43, brimR, 8, 22), brim);
  band.rotation.x = Math.PI / 2;
  const cone = bentCone({ r0: 0.43, r1: 0.06, len, bend });
  const body = new THREE.Mesh(cone.geometry, fabric);
  fabric.side = THREE.DoubleSide;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), tip);
  ball.position.copy(cone.tip);
  ball.userData.noField = true;
  g.add(band, body, ball);
}

/** Bügel über den Kopf (von Ohr zu Ohr). */
function headband(radius, height, tube, material) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 6, 20, Math.PI), material);
  m.scale.y = height / radius;
  m.userData.noField = true;
  return m;
}

/**
 * Eigene Hüte. sit: Höhe des Hutrands unter dem Scheitel (größer = sitzt tiefer und ist entsprechend
 * weiter). press: Haare unter den Hut drücken. cover: bedeckt den ganzen Oberkopf — auch Haare, die
 * neben dem Hut über den Rand stehen, kommen darunter. fixed: feste Größe statt Kopfbreite.
 * onHair: sitzt auf der Frisur (Partyhut, Krone).
 * build(g, fit) baut um den Ursprung = Mitte des Hutrands und liefert die Materialien.
 * fit: Kopfmaße (avatarSeams.headFit) + y (Hutrand) + sx/sz (Streckung der Gruppe).
 */
export const HATS = {
  santaHat: {
    label: 'Weihnachtsmütze', press: true, cover: true, sit: 0.22,
    build(g) {
      const m = [mat('#c3202b'), mat('#f6f4ee', { roughness: 0.95 })];
      floppyHat(g, { fabric: m[0], brim: m[1], tip: m[1] });
      return m;
    },
  },
  elfHat: {
    label: 'Wichtelmütze', press: true, cover: true, sit: 0.22,
    build(g) {
      const m = [mat('#1f7a3d'), mat('#c3202b'), mat('#f2c230', { name: 'Gold', roughness: 0.4 })];
      floppyHat(g, { fabric: m[0], brim: m[1], tip: m[2], len: 0.95, bend: 0.75, brimR: 0.055 });
      return m;
    },
  },
  beanieBlack: { label: 'Beanie schwarz', press: true, cover: true, sit: 0.3, build: (g) => beanie(g, '#1d1d24', '#2b2b35') },
  beanieRed: { label: 'Beanie rot', press: true, cover: true, sit: 0.3, build: (g) => beanie(g, '#b3202a', '#f2f0ea', true) },
  beaniePurple: { label: 'Beanie lila', press: true, cover: true, sit: 0.3, build: (g) => beanie(g, '#7a3fe0', '#5b2fb0', true) },
  capPurple: { label: 'Cap lila', press: true, cover: true, sit: 0.28, build: (g) => cap(g, '#9146ff', '#6a2fd0') },
  capBlack: { label: 'Cap schwarz', press: true, cover: true, sit: 0.28, build: (g) => cap(g, '#17171c', '#2a2a33') },
  capRed: { label: 'Cap rot', press: true, cover: true, sit: 0.28, build: (g) => cap(g, '#c3262e', '#f2f2ee') },
  partyHat: {
    label: 'Partyhut', press: true, sit: 0.07, fixed: true, onHair: true,
    build(g) {
      const m = [mat('#ff3fa4'), mat('#ffd23f'), mat('#3ad1ff')];
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.62, 16), m[0]);
      cone.position.y = 0.31;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.032, 6, 18), m[1]);
      ring.rotation.x = Math.PI / 2;
      const mid = new THREE.Mesh(new THREE.TorusGeometry(0.137, 0.026, 6, 14), m[2]);
      mid.rotation.x = Math.PI / 2;
      mid.position.y = 0.28;
      const top = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), m[1]);
      top.position.y = 0.63;
      g.add(cone, ring, mid, top);
      return m;
    },
  },
  crown: {
    label: 'Krone', press: true, sit: 0.11, onHair: true,
    build(g) {
      const m = [mat('#f2c230', { name: 'Gold', roughness: 0.3 }), glow('#e0263a', 0.6), glow('#3a7bff', 0.6)];
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.29, 0.13, 20, 1, true), m[0]);
      ring.material.side = THREE.DoubleSide;
      ring.position.y = 0.065;
      g.add(ring);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.15, 4), m[0]);
        spike.position.set(Math.sin(a) * 0.3, 0.2, Math.cos(a) * 0.3);
        spike.rotation.y = a + Math.PI / 4;
        const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.035), m[1 + (i % 2)]);
        gem.position.set(Math.sin(a + Math.PI / 8) * 0.305, 0.07, Math.cos(a + Math.PI / 8) * 0.305);
        g.add(spike, gem);
      }
      return m;
    },
  },
  antlers: {
    label: 'Rentier-Geweih', press: false, sit: 0.22,
    build(g, fit) {
      const m = [mat('#7a4a25'), mat('#3a2616'), glow('#ff2a2a', 1.4)];
      // Bügel und Geweih liegen über den Haaren
      const lift = Math.max(0, fit.hairTop - fit.top);
      const wide = Math.max(0.43, (fit.hairRx + 0.03) / fit.sx);
      g.add(headband(wide, 0.25 + lift, 0.028, m[1]));
      for (const s of [-1, 1]) {
        const root = new THREE.Group();
        root.position.set(s * 0.2, 0.2 + lift * 0.9, 0);
        root.rotation.z = -s * 0.3;
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 0.42, 6), m[0]);
        stem.position.y = 0.21;
        root.add(stem);
        for (const [y, rz, len] of [[0.16, 0.9, 0.2], [0.3, -0.8, 0.17], [0.4, 0.7, 0.13]]) {
          const twig = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.026, len, 5), m[0]);
          twig.position.set(-s * Math.sin(rz) * len / 2, y + Math.cos(rz) * len / 2, 0);
          twig.rotation.z = s * rz;
          root.add(twig);
        }
        const ear = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), m[0]);
        ear.scale.set(1.4, 0.7, 0.5);
        ear.position.set(s * (wide - 0.07), 0.1 + lift * 0.5, 0);
        ear.rotation.z = s * 0.5;
        g.add(root, ear);
      }
      // rote Nase vor dem Gesicht (nur wenn die Augen gefunden wurden)
      if (fit.eye) {
        const nose = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), m[2]);
        nose.position.set(0, fit.eye.y - 0.12 - fit.y, (fit.eye.z + 0.07 - fit.cz) / fit.sz);
        nose.userData.noField = true;
        g.add(nose);
      }
      return m;
    },
  },
  headphones: {
    label: 'Kopfhörer', press: false, sit: 0.5, fixed: true,
    build(g, fit) {
      const m = [mat('#17171c', { roughness: 0.5 }), mat('#2c2c36'), glow('#9146ff', 1.2)];
      // Bügel über den Haaren, Muscheln außen auf den Haaren (nie darunter)
      const half = Math.max(fit.rx * 1.05, fit.hairRx + 0.03);
      const top = Math.max(0.5, fit.hairTop - fit.y + 0.045);
      g.add(headband(half, top, 0.04, m[0]));
      for (const s of [-1, 1]) {
        const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.11, 18), m[1]);
        cup.rotation.z = Math.PI / 2;
        cup.position.set(s * half, 0, 0);
        const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.05, 18), m[0]);
        pad.rotation.z = Math.PI / 2;
        pad.position.set(s * (half - 0.07), 0, 0);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.018, 6, 20), m[2]);
        ring.rotation.y = Math.PI / 2;
        ring.position.set(s * (half + 0.058), 0, 0);
        for (const o of [cup, pad, ring]) o.userData.noField = true;
        g.add(cup, pad, ring);
      }
      return m;
    },
  },
  halo: {
    label: 'Heiligenschein', press: false, sit: -0.2, fixed: true,
    build(g, fit) {
      const m = [glow('#ffe27a', 2.2)];
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.03, 8, 28), m[0]);
      ring.rotation.x = Math.PI / 2;
      // über hohen Frisuren entsprechend höher
      ring.position.y = Math.max(0, fit.hairTop - fit.top - 0.06);
      ring.userData.noField = true;
      g.add(ring);
      return m;
    },
  },
};

function beanie(g, color, fold, pompom = false) {
  const m = [mat(color, { roughness: 0.95 }), mat(fold, { roughness: 0.95 })];
  const top = new THREE.Mesh(dome(0.44), m[0]);
  top.scale.y = 0.84;
  top.position.y = 0.05;
  // Umschlag: Wulst, der unten etwas über die Mütze greift
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.075, 8, 22), m[1]);
  band.rotation.x = Math.PI / 2;
  band.scale.z = 1.25;
  band.position.y = 0.05;
  g.add(top, band);
  if (pompom) {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), m[1]);
    ball.position.y = 0.45;
    g.add(ball);
  }
  return m;
}

function cap(g, color, visorColor) {
  const m = [mat(color), mat(visorColor)];
  const top = new THREE.Mesh(dome(0.44), m[0]);
  top.scale.y = 0.78;
  // Rand: schmaler Wulst rundum, damit die Kuppel sauber auf dem Kopf abschließt
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.435, 0.03, 6, 22), m[0]);
  rim.rotation.x = Math.PI / 2;
  // Schirm: halbe Scheibe nach vorn (+z), an der Kuppel angesetzt und leicht nach unten geneigt
  const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.035, 20, 1, false, -Math.PI / 2, Math.PI), m[1]);
  visor.scale.z = 1.05;
  visor.position.set(0, 0.0, 0.33);
  visor.rotation.x = 0.2;
  visor.userData.noField = true;
  const button = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), m[1]);
  button.position.y = 0.34;
  g.add(top, rim, visor, button);
  return m;
}

/**
 * Hut für einen vermessenen Kopf bauen (Ruhelage, Weltmaß der Datei).
 * @param {string} id
 * @param {(drop: number) => object|null} fitAt  Kopfmaße in der Höhe `drop` unter dem Scheitel (avatarSeams.headFit)
 * @returns {{ object: THREE.Group, press: boolean, rim: object|null }|null}
 *   rim: Hutrand (Höhe + Ellipse) bei Hüten, die den Oberkopf ganz bedecken
 */
export function buildHat(id, fitAt) {
  const spec = HATS[id];
  if (!spec) return null;
  const drop = Math.max(0.05, spec.sit);
  const base = fitAt(drop);
  if (!base) return null;
  // erwartete Halbachse eines Normalkopfs in dieser Höhe (Kugel mit Radius 0,5)
  const expect = Math.sqrt(Math.max(0.01, 0.25 - (0.5 - Math.min(0.5, drop)) ** 2));
  const g = new THREE.Group();
  const fit = { ...base, y: base.top - spec.sit, sx: 1, sz: 1 };
  // onHair: kleine Hüte sitzen auf der Frisur statt darin zu versinken
  if (spec.onHair) fit.y += Math.max(0, base.hairTop - base.top) * 0.7;
  if (!spec.fixed) {
    // etwas Luft, damit der Rand nicht im Kopf steckt; nie kleiner als 75 % (Masken) oder größer als 135 %
    const clamp = (v) => Math.min(1.35, Math.max(0.75, v));
    fit.sx = clamp((base.rx / expect) * 1.05);
    fit.sz = clamp((base.rz / expect) * 1.05);
  }
  const built = spec.build(g, fit);
  g.scale.set(fit.sx, 1, fit.sz);
  g.position.set(base.cx, fit.y, base.cz);
  finish(g, built);
  const rim = spec.cover ? { y: fit.y, cx: base.cx, cz: base.cz, rx: 0.43 * fit.sx, rz: 0.43 * fit.sz } : null;
  return { object: g, press: spec.press, rim };
}

// ── Accessoires ────────────────────────────────────────────────────────────
/**
 * build(ctx) liefert [{ bone, object }] — object in Ruhelage (Weltmaß der Datei).
 * ctx: { head: Kopfmaße|null, axis: Knochenlagen des Oberteils, backZ: Rücken auf Schulterhöhe, neckZ }
 */
export const EXTRAS = {
  sunglasses: { label: 'Sonnenbrille', build: (c) => glasses(c, '#101014', '#101014', false) },
  shutterShades: { label: 'Neon-Brille', build: (c) => glasses(c, '#ff3fd2', '#ff3fd2', true) },
  scarfRed: { label: 'Schal rot', build: (c) => scarf(c, '#c3202b', '#f6f4ee') },
  scarfPurple: { label: 'Schal lila', build: (c) => scarf(c, '#7a3fe0', '#1d1d24') },
  glowsticks: {
    label: 'Leuchtstäbe',
    build(c) {
      const out = [];
      const fwd = new THREE.Vector3(0, 0, 1);
      for (const [s, col] of [['L', '#39ff88'], ['R', '#ff3fd2']]) {
        const fist = c.axis[`Fist${s}`], elbow = c.axis[`LowerArm${s}`];
        if (!fist || !elbow) continue;
        const arm = fist.clone().sub(elbow).normalize();
        // quer zum Unterarm (bei ausgestreckten Armen senkrecht)
        let dir = arm.clone().cross(fwd);
        if (dir.lengthSq() < 1e-4) dir.set(0, 1, 0);
        dir.normalize();
        if (dir.y < 0) dir.negate();
        // die Fäuste sind dicke Klötze: der Stab geht quer durch die Hand und ragt beidseitig weit heraus
        const m = [glow(col, 1.1)];
        const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.95, 8), m[0]);
        stick.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        stick.position.copy(fist).addScaledVector(arm, 0.1).addScaledVector(dir, 0.12);
        const g = new THREE.Group();
        g.add(stick);
        out.push({ bone: `Fist${s}`, object: finish(g, m) });
      }
      return out;
    },
  },
  angelWings: {
    label: 'Engelsflügel',
    build(c) {
      if (!Number.isFinite(c.backZ)) return [];
      const m = [mat('#f7f5ef', { roughness: 0.9, side: THREE.DoubleSide })];
      const s = new THREE.Shape();
      s.moveTo(0, 0);
      s.quadraticCurveTo(0.25, 0.42, 0.72, 0.5);
      s.quadraticCurveTo(0.66, 0.3, 0.6, 0.2);
      s.quadraticCurveTo(0.56, 0.06, 0.48, -0.06);
      s.quadraticCurveTo(0.4, -0.22, 0.3, -0.3);
      s.quadraticCurveTo(0.18, -0.42, 0.04, -0.4);
      s.closePath();
      const geo = new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: false });
      const g = new THREE.Group();
      for (const side of [-1, 1]) {
        const w = new THREE.Mesh(geo, m[0]);
        w.scale.x = side;
        w.position.set(side * 0.06, 1.78, c.backZ - 0.05);
        w.rotation.y = side * 0.45;
        g.add(w);
      }
      return [{ bone: 'Torso', object: finish(g, m) }];
    },
  },
  backpack: {
    label: 'Rucksack',
    build(c) {
      if (!Number.isFinite(c.backZ)) return [];
      const m = [mat('#7a3fe0'), mat('#4a2590'), mat('#e9e7f2')];
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.5, 0.2, 2, 2, 2), m[0]);
      body.position.set(0, 1.6, c.backZ - 0.09);
      const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.06), m[1]);
      pocket.position.set(0, 1.5, c.backZ - 0.2);
      const zip = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.02, 0.21), m[2]);
      zip.position.set(0, 1.78, c.backZ - 0.09);
      g.add(body, pocket, zip);
      return [{ bone: 'Torso', object: finish(g, m) }];
    },
  },
};

function glasses(c, frame, lens, shutter) {
  const eye = c.head?.eye;
  if (!eye) return [];
  const m = shutter ? [glow(frame, 1.8)] : [mat(frame, { roughness: 0.25, metalness: 0.3 })];
  const g = new THREE.Group();
  const half = Math.max(0.14, Math.min(0.26, eye.x * 0.75));
  const z = eye.z + 0.035;
  if (shutter) {
    // Rahmen + Querstreben über beide Augen
    for (let i = 0; i < 4; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(half * 4.1, 0.022, 0.03), m[0]);
      bar.position.set(c.head.cx, eye.y - 0.085 + i * 0.057, z);
      g.add(bar);
    }
    for (const x of [-1, 0, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(x ? 0.03 : 0.05, 0.2, 0.03), m[0]);
      post.position.set(c.head.cx + x * half * 2.03, eye.y, z);
      g.add(post);
    }
  } else {
    for (const s of [-1, 1]) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(half * 1.7, 0.17, 0.03), m[0]);
      l.position.set(c.head.cx + s * half * 1.05, eye.y, z);
      g.add(l);
    }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(half * 0.5, 0.035, 0.03), m[0]);
    bridge.position.set(c.head.cx, eye.y + 0.04, z);
    g.add(bridge);
  }
  // Bügel nach hinten
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.025, 0.4), m[0]);
    arm.position.set(c.head.cx + s * half * 2.02, eye.y + 0.04, z - 0.2);
    g.add(arm);
  }
  return [{ bone: 'Head', object: finish(g, m), ref: 'head' }];
}

function scarf(c, color, stripe) {
  const m = [mat(color, { roughness: 0.95 }), mat(stripe, { roughness: 0.95 })];
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.085, 8, 18), m[0]);
  ring.rotation.x = Math.PI / 2;
  ring.scale.set(1.12, 1, 1);          // rotation.x legt den Ring flach: x bleibt Breite
  ring.position.set(0, 1.95, c.neckZ);
  const end = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.36, 0.05), m[0]);
  end.position.set(0.11, 1.74, c.neckZ + 0.24);
  end.rotation.z = -0.12;
  const tip = new THREE.Mesh(new THREE.BoxGeometry(0.135, 0.06, 0.055), m[1]);
  tip.position.set(0.133, 1.585, c.neckZ + 0.24);
  tip.rotation.z = -0.12;
  g.add(ring, end, tip);
  return [{ bone: 'Torso', object: finish(g, m) }];
}

/** Auswahl für den Figurbaukasten. */
export const hatParts = () => Object.entries(HATS).map(([id, h]) => ({ id, label: h.label }));
export const extraParts = () => [{ id: 'none', label: 'Nichts' }, ...Object.entries(EXTRAS).map(([id, e]) => ({ id, label: e.label }))];
