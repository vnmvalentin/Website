// avatarDesigns.js — eigene Kleidung für den Figurbaukasten (Twitch-Hoodie & Co.).
//
// Ein Design nimmt ein Paket-Teil als Schnitt (z. B. das T-Shirt von Casual_Male), färbt den Stoff
// um und hängt flache Low-Poly-Zusätze starr an Knochen: Kapuze, Kordeln, Bauchtasche, Logo.
// Das passt zum Paket — dort ist auch alles einfarbig ohne Texturen.
// Lange Ärmel: die Arm-Haut des Schnitts (Ober-/Unterarm, nicht die Hand) bekommt die Stofffarbe.
import * as THREE from 'three';

/**
 * slot: Bereich, base: Paket-Figur als Schnitt, color: Stoff, sleeves: lange Ärmel,
 * extras: Zusätze (hood, strings, pocket, fur, front, belt), logo: Form aus LOGOS + logoColor (+ logoGlow)
 */
export const DESIGNS = {
  twitchHoodie: { slot: 'body', label: 'Twitch-Hoodie', base: 'Casual_Male', color: '#9146ff', sleeves: true, extras: ['hood', 'strings', 'pocket'], logo: 'twitch', logoColor: '#ffffff' },
  hoodieBlack: { slot: 'body', label: 'Hoodie schwarz', base: 'Casual_Male', color: '#1d1d24', sleeves: true, extras: ['hood', 'strings', 'pocket'], logo: 'twitch', logoColor: '#9146ff' },
  hoodieGrey: { slot: 'body', label: 'Hoodie grau', base: 'Casual_Male', color: '#8d9099', sleeves: true, extras: ['hood', 'strings', 'pocket'] },
  twitchTee: { slot: 'body', label: 'Twitch-Shirt', base: 'Casual_Male', color: '#9146ff', logo: 'twitch', logoColor: '#ffffff' },
  raveTee: { slot: 'body', label: 'Rave-Shirt', base: 'Casual_Male', color: '#121216', logo: 'twitch', logoColor: '#39ff88', logoGlow: true },
  hoodieRed: { slot: 'body', label: 'Hoodie rot', base: 'Casual_Male', color: '#c22a2a', sleeves: true, extras: ['hood', 'strings', 'pocket'] },
  hoodiePink: { slot: 'body', label: 'Hoodie pink', base: 'Casual_Male', color: '#ff5fa8', sleeves: true, extras: ['hood', 'strings', 'pocket'], logo: 'heart', logoColor: '#ffffff' },
  hoodieBolt: { slot: 'body', label: 'Hoodie Blitz', base: 'Casual_Male', color: '#15151b', sleeves: true, extras: ['hood', 'strings', 'pocket'], logo: 'bolt', logoColor: '#e6ff3a', logoGlow: true },
  starTee: { slot: 'body', label: 'Sternen-Shirt', base: 'Casual_Male', color: '#1f3b8f', logo: 'star', logoColor: '#ffd23f' },
  heartTee: { slot: 'body', label: 'Herz-Shirt', base: 'Casual_Male', color: '#f0efe9', logo: 'heart', logoColor: '#e0263a' },
  boltTee: { slot: 'body', label: 'Blitz-Shirt', base: 'Casual_Male', color: '#121216', logo: 'bolt', logoColor: '#3ad1ff', logoGlow: true },
  xmasSweater: { slot: 'body', label: 'Weihnachtspulli rot', base: 'Casual_Male', color: '#b3202a', sleeves: true, extras: ['fur'], logo: 'snow', logoColor: '#ffffff' },
  xmasSweaterGreen: { slot: 'body', label: 'Weihnachtspulli grün', base: 'Casual_Male', color: '#1e6b3a', sleeves: true, extras: ['fur'], logo: 'tree', logoColor: '#ffd23f' },
  santaCoat: { slot: 'body', label: 'Weihnachtsmann-Mantel', base: 'Casual_Male', color: '#c3202b', sleeves: true, extras: ['fur', 'front', 'belt'] },
  joggerBlack: { slot: 'legs', label: 'Jogginghose schwarz', base: 'Suit_Male', color: '#1d1d24' },
  joggerGrey: { slot: 'legs', label: 'Jogginghose grau', base: 'Suit_Male', color: '#8d9099' },
  joggerPurple: { slot: 'legs', label: 'Jogginghose lila', base: 'Suit_Male', color: '#5b2fb0' },
  joggerRed: { slot: 'legs', label: 'Weihnachtshose rot', base: 'Suit_Male', color: '#c3202b' },
  joggerGreen: { slot: 'legs', label: 'Hose grün', base: 'Suit_Male', color: '#1e6b3a' },
  joggerWhite: { slot: 'legs', label: 'Hose weiß', base: 'Suit_Male', color: '#ecebe6' },
  jeansBlue: { slot: 'legs', label: 'Jeans blau', base: 'Suit_Male', color: '#34508a' },
  shortsBlack: { slot: 'legs', label: 'Shorts schwarz', base: 'Casual_Male', color: '#1d1d24' },
  shortsPurple: { slot: 'legs', label: 'Shorts lila', base: 'Casual_Male', color: '#7a3fe0' },
};

/** Paket-Figur hinter einer Auswahl (Design → Schnitt, sonst die Figur selbst). */
export const baseChar = (id) => DESIGNS[id]?.base || id;

const ARM_SKIN_BONE = /^(UpperArm|LowerArm)/;
/** Gehört dieses Dreieck (Haut) zum langen Ärmel? */
export const isSleeveBone = (bone) => ARM_SKIN_BONE.test(bone || '');

const shade = (hex, k) => new THREE.Color(hex).multiplyScalar(k);

/** Stoff-Material eines Designs (eins je Design, wird je Figur ohnehin geklont). */
const fabricCache = new Map();
export function designFabric(id) {
  if (!fabricCache.has(id)) {
    const d = DESIGNS[id];
    const m = new THREE.MeshStandardMaterial({ color: d.color, roughness: 0.85, metalness: 0 });
    m.name = `Design_${id}`;
    fabricCache.set(id, m);
  }
  return fabricCache.get(id);
}

// ── Twitch-Logo (einfarbiges „Glitch“: Sprechblase mit zwei Augen-Schlitzen) ─
function glitchShape() {
  const s = new THREE.Shape();
  const P = [[0, 0.9], [0.09, 1], [1, 1], [1, 0.4], [0.74, 0.14], [0.53, 0.14], [0.36, -0.03], [0.36, 0.14], [0, 0.14]];
  s.moveTo(P[0][0], P[0][1]);
  for (const [x, y] of P.slice(1)) s.lineTo(x, y);
  s.closePath();
  for (const x0 of [0.44, 0.68]) {
    const h = new THREE.Path();
    h.moveTo(x0, 0.44); h.lineTo(x0 + 0.09, 0.44); h.lineTo(x0 + 0.09, 0.76); h.lineTo(x0, 0.76); h.closePath();
    s.holes.push(h);
  }
  return s;
}

const poly = (pts) => {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (const [x, y] of pts.slice(1)) s.lineTo(x, y);
  s.closePath();
  return s;
};

/** Aufdrucke: Formen im Einheitsquadrat (0 … 1), einzeln oder als Liste (überlappende Teile). */
const LOGOS = {
  twitch: glitchShape,
  star() {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2, r = i % 2 ? 0.21 : 0.5;
      pts.push([0.5 + Math.sin(a) * r, 0.5 + Math.cos(a) * r]);
    }
    return poly(pts);
  },
  heart() {
    const s = new THREE.Shape();
    s.moveTo(0.5, 0.08);
    s.bezierCurveTo(0.5, 0.08, -0.05, 0.45, 0.08, 0.75);
    s.bezierCurveTo(0.16, 0.98, 0.44, 0.95, 0.5, 0.72);
    s.bezierCurveTo(0.56, 0.95, 0.84, 0.98, 0.92, 0.75);
    s.bezierCurveTo(1.05, 0.45, 0.5, 0.08, 0.5, 0.08);
    return s;
  },
  bolt: () => poly([[0.6, 1], [0.2, 0.45], [0.45, 0.45], [0.35, 0], [0.8, 0.6], [0.55, 0.6]]),
  /** Schneeflocke: drei gekreuzte Balken mit Querstrichen an den Enden. */
  snow() {
    const out = [];
    const bar = (cx, cy, len, w, rot) => {
      const cr = Math.cos(rot), sr = Math.sin(rot);
      return poly([[-len, -w], [len, -w], [len, w], [-len, w]].map(([x, y]) => [0.5 + cx + x * cr - y * sr, 0.5 + cy + x * sr + y * cr]));
    };
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI;
      out.push(bar(0, 0, 0.5, 0.045, a));
      for (const e of [-1, 1]) out.push(bar(e * Math.cos(a) * 0.34, e * Math.sin(a) * 0.34, 0.11, 0.035, a + Math.PI / 2));
    }
    return out;
  },
  tree: () => poly([[0.5, 1], [0.25, 0.68], [0.4, 0.68], [0.15, 0.38], [0.35, 0.38], [0.08, 0.1], [0.42, 0.1], [0.42, 0], [0.58, 0], [0.58, 0.1], [0.92, 0.1], [0.65, 0.38], [0.85, 0.38], [0.6, 0.68], [0.75, 0.68]]),
};

/**
 * Maße des Schnitts aus der Ruhelage (Weltmaß der Datei): Brust vorn, Bauch vorn, Rücken, Hals.
 * @param {{ meshes: { region: string[], pos: Float32Array, n: number }[] }} info  aus avatarSeams.charInfo
 */
export function measure(info) {
  // Strahl entlang z durch (0, y): Schnittpunkte mit den Dreiecken des Oberteils (das Netz ist so
  // grob, dass nahe der Mitte oft kein Eckpunkt liegt — deshalb nicht über Eckpunkte messen)
  const hits = (y, x0 = 0) => {
    const zs = [];
    for (const mi of info.meshes) {
      for (let t = 0; t < mi.n; t++) {
        if (mi.region[t] !== 'body') continue;
        const o = t * 9;
        const ax = mi.pos[o], ay = mi.pos[o + 1], az = mi.pos[o + 2];
        const bx = mi.pos[o + 3], by = mi.pos[o + 4], bz = mi.pos[o + 5];
        const cx = mi.pos[o + 6], cy = mi.pos[o + 7], cz = mi.pos[o + 8];
        // Punkt (0, y) in der xy-Projektion des Dreiecks (baryzentrisch)
        const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
        if (Math.abs(det) < 1e-9) continue;
        const u = ((by - cy) * (x0 - cx) + (cx - bx) * (y - cy)) / det;
        const v = ((cy - ay) * (x0 - cx) + (ax - cx) * (y - cy)) / det;
        if (u < 0 || v < 0 || u + v > 1) continue;
        zs.push(u * az + v * bz + (1 - u - v) * cz);
      }
    }
    return zs;
  };
  const front = (y, x = 0) => Math.max(...hits(y, x));
  /** Vorderste Stelle über eine Fläche (Logo flach davor, ohne in der Wölbung zu versinken). */
  const frontArea = (y, half) => { let z = -Infinity; for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) z = Math.max(z, front(y + j * half / 2, i * half / 2)); return z; };
  const back = (y) => Math.min(...hits(y));
  /**
   * Umfang in Höhe y: je Winkel der Abstand der Stoff-Fläche von der Körperachse (Strahl nach außen).
   * Arme zählen nicht. null, wo der Strahl nichts trifft.
   */
  const ring = (y, n = 24) => {
    const zc = info.axis?.Abdomen?.z ?? 0.03;
    const r = new Array(n).fill(null);
    const o = new THREE.Vector3(0, y, zc), hit = new THREE.Vector3();
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const ray = new THREE.Ray();
    for (let k = 0; k < n; k++) {
      const ang = (k / n) * Math.PI * 2;
      ray.set(o, new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang)));
      let best = Infinity;
      for (const mi of info.meshes) {
        for (let t = 0; t < mi.n; t++) {
          if (mi.region[t] !== 'body' || /^(Shoulder|UpperArm|LowerArm|Fist)/.test(mi.bone[t])) continue;
          const q = t * 9;
          if (Math.min(mi.pos[q + 1], mi.pos[q + 4], mi.pos[q + 7]) > y || Math.max(mi.pos[q + 1], mi.pos[q + 4], mi.pos[q + 7]) < y) continue;
          a.set(mi.pos[q], mi.pos[q + 1], mi.pos[q + 2]);
          b.set(mi.pos[q + 3], mi.pos[q + 4], mi.pos[q + 5]);
          c.set(mi.pos[q + 6], mi.pos[q + 7], mi.pos[q + 8]);
          if (ray.intersectTriangle(a, b, c, false, hit)) best = Math.min(best, hit.distanceTo(o));
        }
      }
      if (Number.isFinite(best)) r[k] = best;
    }
    return { r, zc };
  };
  return { chestZ: front(1.6), bellyZ: front(1.27), collarZ: front(1.9), backZ: back(1.8), front, frontArea, ring };
}

/**
 * Aufdruck an den Stoff „kleben“: jeder Punkt übernimmt die Knochengewichte des nächsten Punkts auf
 * der Stoff-Fläche (baryzentrisch gemischt) und wird in den Puffer-Raum des Schnitts umgerechnet
 * (die Dateien sind quantisiert, das Skinning skaliert — Rückweg über die Skinning-Matrix).
 * Starr am Knochen würde ihn der Stoff beim Tanzen verschlucken (Bauch und Brust verformen sich).
 * @param {THREE.Mesh} object  in Ruhelage-Weltmaß der Datei
 * @returns {{ mesh: THREE.SkinnedMesh, geometry: THREE.BufferGeometry }|null}  mesh: Quell-Mesh, dessen Bindung gilt
 */
export function bakeToSurface(object, info) {
  // Kandidaten: Stoff-Ecken des Oberteils (ein Mesh — die Bindung muss für alle Punkte gleich sein)
  let best = null;
  for (const mi of info.meshes) {
    if (/^(skin|face)/i.test(mi.matName)) continue;
    const count = mi.region.filter((r) => r === 'body').length;
    if (!best || count > best.count) best = { mi, count };
  }
  if (!best) return null;
  const { mi } = best;
  const m = mi.m;
  const idx = m.geometry.index;
  const si = m.geometry.attributes.skinIndex, sw = m.geometry.attributes.skinWeight;
  const tris = [];
  for (let t = 0; t < mi.n; t++) {
    if (mi.region[t] !== 'body') continue;
    const o = t * 9;
    tris.push({
      tri: new THREE.Triangle(
        new THREE.Vector3(mi.pos[o], mi.pos[o + 1], mi.pos[o + 2]),
        new THREE.Vector3(mi.pos[o + 3], mi.pos[o + 4], mi.pos[o + 5]),
        new THREE.Vector3(mi.pos[o + 6], mi.pos[o + 7], mi.pos[o + 8]),
      ),
      vi: [idx.getX(t * 3), idx.getX(t * 3 + 1), idx.getX(t * 3 + 2)],
    });
  }
  object.updateMatrixWorld(true);
  const g0 = object.geometry.clone().applyMatrix4(object.matrixWorld);
  const geo = g0.index ? g0.toNonIndexed() : g0;
  geo.clearGroups();
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const skinIndex = new Uint16Array(pos.count * 4), skinWeight = new Float32Array(pos.count * 4);
  const p = new THREE.Vector3(), n = new THREE.Vector3(), q = new THREE.Vector3(), bary = new THREE.Vector3();
  const M = new THREE.Matrix4(), sum = new THREE.Matrix4(), bm = new THREE.Matrix4();
  const A = new THREE.Matrix3();
  const bones = m.skeleton.bones, inverses = m.skeleton.boneInverses;
  m.updateMatrixWorld(true);
  const bindInv = m.bindMatrixInverse;
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    // nächster Punkt auf der Stoff-Fläche; Gewichte baryzentrisch gemischt (wie der Stoff selbst)
    let best = null, d = Infinity;
    for (const c of tris) {
      c.tri.closestPointToPoint(p, q);
      const dd = q.distanceToSquared(p);
      if (dd < d) { d = dd; best = c; }
    }
    best.tri.closestPointToPoint(p, q);
    best.tri.getBarycoord(q, bary);
    const acc = new Map();
    best.vi.forEach((vi, j) => {
      const b = bary.getComponent(j);
      for (let k = 0; k < 4; k++) {
        const w = sw.getComponent(vi, k) * b;
        if (w > 0) { const bi = si.getComponent(vi, k); acc.set(bi, (acc.get(bi) || 0) + w); }
      }
    });
    const top = [...acc].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const total = top.reduce((s, [, w]) => s + w, 0) || 1;
    // Abbildung Puffer → Welt mit diesen Gewichten (Ruhelage): Welt · bindInv · Σ w·Knochen · bind
    sum.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    top.forEach(([bi, w], k) => {
      skinIndex[i * 4 + k] = bi;
      skinWeight[i * 4 + k] = w / total;
      bm.multiplyMatrices(bones[bi].matrixWorld, inverses[bi]);
      for (let e = 0; e < 16; e++) sum.elements[e] += bm.elements[e] * (w / total);
    });
    M.copy(m.matrixWorld).multiply(bindInv).multiply(sum).multiply(m.bindMatrix);
    // Normalen: Welt → Puffer mit Aᵀ (Inverse-Transponierte von A⁻¹)
    if (nor) { n.fromBufferAttribute(nor, i).applyMatrix3(A.setFromMatrix4(M).transpose()).normalize(); nor.setXYZ(i, n.x, n.y, n.z); }
    p.applyMatrix4(M.invert());
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
  return { mesh: m, geometry: geo };
}

/**
 * Zusätze eines Designs bauen. Jeder Eintrag: { bone, object, skin } — object steht in
 * Ruhelage-Weltmaß der Datei und wird beim Einhängen auf den Knochen umgerechnet (skin: mit dem
 * Stoff verformt, siehe bakeToSurface).
 */
export function buildDesignExtras(id, info) {
  const d = DESIGNS[id];
  if (!d) return [];
  const out = [];
  const M = measure(info);
  const fabric = new THREE.MeshStandardMaterial({ color: d.color, roughness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: shade(d.color, 0.72), roughness: 0.9 });
  const mats = [fabric, dark];
  // skin: Aufdruck, der sich mit dem Stoff verformt (bakeToSurface) — sonst starr am Knochen
  const add = (bone, mesh, skin = false) => { mesh.userData.materials = mats; out.push({ bone, object: mesh, skin }); };

  const extras = d.extras || [];
  if (extras.includes('hood') && Number.isFinite(M.backZ)) {
    // Kapuze liegt unten: wulstiger Kragen hinten um den Hals + flacher Beutel auf dem Rücken
    const g = new THREE.Group();
    // Bogen erst in der xy-Ebene drehen, dann flach legen → Bogenmitte liegt hinten (−z, nachgemessen)
    const collarGeo = new THREE.TorusGeometry(0.22, 0.075, 6, 14, Math.PI * 1.25);
    collarGeo.rotateZ(Math.PI * 0.875);
    collarGeo.rotateX(Math.PI / 2);
    const collar = new THREE.Mesh(collarGeo, fabric);
    collar.scale.set(1.15, 1, 1);
    collar.position.set(0, 1.93, (info.axis?.Neck?.z ?? 0.03) - 0.02);
    const bag = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), dark);
    bag.scale.set(1.25, 1, 0.38);
    bag.position.set(0, 1.78, M.backZ - 0.02);
    g.add(collar, bag);
    add('Torso', g);
  }
  if (extras.includes('strings') && Number.isFinite(M.chestZ)) {
    const white = new THREE.MeshStandardMaterial({ color: '#f2f2f2', roughness: 0.7 });
    mats.push(white);
    const g = new THREE.Group();
    for (const x of [-0.07, 0.07]) {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.2, 5), white);
      s.position.set(x, 1.8, M.chestZ + 0.005);
      const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.016, 0.04, 6), white);
      tip.position.set(x, 1.69, M.chestZ + 0.008);
      g.add(s, tip);
    }
    add('Torso', g);
  }
  if (extras.includes('pocket') && Number.isFinite(M.bellyZ)) {
    // Bauchtasche: flache Trapez-Platte, steckt hinten im Bauch (keine Lücke an der Wölbung)
    const s = new THREE.Shape();
    s.moveTo(-0.24, 0); s.lineTo(0.24, 0); s.lineTo(0.17, 0.2); s.lineTo(-0.17, 0.2); s.closePath();
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: false });
    geo.translate(0, 0, -0.055);
    const p = new THREE.Mesh(geo, dark);
    p.position.set(0, 1.17, M.bellyZ);
    add('Abdomen', p, true);
  }
  if (extras.includes('fur') && Number.isFinite(M.backZ)) {
    // Kragen: weißer Wulst rund um den Hals
    const white = new THREE.MeshStandardMaterial({ color: '#f6f4ee', roughness: 0.95 });
    mats.push(white);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.07, 6, 16), white);
    collar.rotation.x = Math.PI / 2;
    collar.scale.set(1.15, 1, 1);
    collar.position.set(0, 1.93, (info.axis?.Neck?.z ?? 0.03) - 0.01);
    add('Torso', collar);
  }
  if (extras.includes('front') && Number.isFinite(M.chestZ)) {
    // Pelzstreifen vorn herunter: folgt der Wölbung von Brust und Bauch
    const white = new THREE.MeshStandardMaterial({ color: '#f6f4ee', roughness: 0.95, side: THREE.DoubleSide });
    mats.push(white);
    const y0 = 1.2, y1 = 1.86, w = 0.07, n = 8;
    const pos = [], idx = [];
    for (let i = 0; i <= n; i++) {
      const y = y0 + (y1 - y0) * (i / n);
      const z = Math.max(M.front(y, -w), M.front(y, 0), M.front(y, w));
      if (!Number.isFinite(z)) continue;
      const k = pos.length / 3;
      pos.push(-w, y, z + 0.014, w, y, z + 0.014);
      if (k >= 2) idx.push(k - 2, k - 1, k, k - 1, k + 1, k);
    }
    if (idx.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      add('Torso', new THREE.Mesh(geo, white), true);
    }
  }
  if (extras.includes('belt')) {
    // Gürtel: Band um den Bauch (Umfang ausgemessen) mit goldener Schnalle, verformt sich mit dem Stoff
    const y = 1.24, h = 0.09;
    const { r, zc } = M.ring(y);
    if (r.every((x) => x != null)) {
      const black = new THREE.MeshStandardMaterial({ color: '#15151a', roughness: 0.6, side: THREE.DoubleSide });
      const gold = new THREE.MeshStandardMaterial({ color: '#f2c230', roughness: 0.4 });
      gold.name = 'Gold';
      mats.push(black, gold);
      const n = r.length;
      const pos = [], idx = [];
      for (let k = 0; k <= n; k++) {
        const a = (k / n) * Math.PI * 2, rad = r[k % n] + 0.016;
        const x = Math.sin(a) * rad, z = zc + Math.cos(a) * rad;
        pos.push(x, y - h / 2, z, x, y + h / 2, z);
        if (k < n) { const q = k * 2; idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      add('Abdomen', new THREE.Mesh(geo, black), true);
      const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.12, 0.03), gold);
      buckle.position.set(0, y, zc + r[0] + 0.03);
      add('Abdomen', buckle, true);
    }
  }
  const logoShape = d.logo && LOGOS[d.logo];
  if (logoShape && Number.isFinite(M.chestZ)) {
    const col = new THREE.MeshStandardMaterial({ color: d.logoColor, roughness: 0.6, emissive: d.logoGlow ? d.logoColor : '#000000', emissiveIntensity: d.logoGlow ? 0.5 : 0 });
    mats.push(col);
    const geo = new THREE.ExtrudeGeometry(logoShape(), { depth: 0.05, bevelEnabled: false });
    const size = extras.includes('strings') ? 0.14 : 0.17;
    geo.translate(-0.5, -0.5, -0.044);
    geo.scale(size, size, 1);
    const logo = new THREE.Mesh(geo, col);
    // mit Kordeln etwas tiefer und kleiner, damit sie sich nicht überlagern
    const ly = extras.includes('strings') ? 1.52 : 1.6;
    logo.position.set(0, ly, M.frontArea(ly, size * 0.5) + 0.012);
    add('Torso', logo, true);
  }
  return out;
}
