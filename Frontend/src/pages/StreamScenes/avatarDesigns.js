// avatarDesigns.js — eigene Kleidung für den Figurbaukasten (Twitch-Hoodie & Co.).
//
// Ein Design nimmt ein Paket-Teil als Schnitt (z. B. das T-Shirt von Casual_Male), färbt den Stoff
// um und hängt flache Low-Poly-Zusätze starr an Knochen: Kapuze, Kordeln, Bauchtasche, Logo.
// Das passt zum Paket — dort ist auch alles einfarbig ohne Texturen.
// Lange Ärmel: die Arm-Haut des Schnitts (Ober-/Unterarm, nicht die Hand) bekommt die Stofffarbe.
import * as THREE from 'three';

/**
 * slot: Bereich, base: Paket-Figur als Schnitt, color: Stoff, sleeves: lange Ärmel,
 * extras: Zusätze (hood, strings, pocket), logo: 'twitch' + logoColor
 */
export const DESIGNS = {
  twitchHoodie: { slot: 'body', label: 'Twitch-Hoodie', base: 'Casual_Male', color: '#9146ff', sleeves: true, extras: ['hood', 'strings', 'pocket'], logo: 'twitch', logoColor: '#ffffff' },
  hoodieBlack: { slot: 'body', label: 'Hoodie schwarz', base: 'Casual_Male', color: '#1d1d24', sleeves: true, extras: ['hood', 'strings', 'pocket'], logo: 'twitch', logoColor: '#9146ff' },
  hoodieGrey: { slot: 'body', label: 'Hoodie grau', base: 'Casual_Male', color: '#8d9099', sleeves: true, extras: ['hood', 'strings', 'pocket'] },
  twitchTee: { slot: 'body', label: 'Twitch-Shirt', base: 'Casual_Male', color: '#9146ff', logo: 'twitch', logoColor: '#ffffff' },
  raveTee: { slot: 'body', label: 'Rave-Shirt', base: 'Casual_Male', color: '#121216', logo: 'twitch', logoColor: '#39ff88' },
  joggerBlack: { slot: 'legs', label: 'Jogginghose schwarz', base: 'Suit_Male', color: '#1d1d24' },
  joggerGrey: { slot: 'legs', label: 'Jogginghose grau', base: 'Suit_Male', color: '#8d9099' },
  joggerPurple: { slot: 'legs', label: 'Jogginghose lila', base: 'Suit_Male', color: '#5b2fb0' },
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

/**
 * Maße des Schnitts aus der Ruhelage (Weltmaß der Datei): Brust vorn, Bauch vorn, Rücken, Hals.
 * @param {{ meshes: { region: string[], pos: Float32Array, n: number }[] }} info  aus avatarSeams.charInfo
 */
function measure(info) {
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
  return { chestZ: front(1.6), bellyZ: front(1.27), collarZ: front(1.9), backZ: back(1.8), front, frontArea };
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
  if (d.logo === 'twitch' && Number.isFinite(M.chestZ)) {
    const col = new THREE.MeshStandardMaterial({ color: d.logoColor, roughness: 0.6, emissive: d.logoColor === '#39ff88' ? d.logoColor : '#000000', emissiveIntensity: d.logoColor === '#39ff88' ? 0.5 : 0 });
    mats.push(col);
    const geo = new THREE.ExtrudeGeometry(glitchShape(), { depth: 0.05, bevelEnabled: false });
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
