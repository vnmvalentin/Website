// avatarSeams.js — saubere Übergänge im Figurbaukasten.
//
// Jede Paket-Figur ist EINE Hülle: Kleidung ist nur eine Farbzone, darunter liegt kein Körper.
// Kopf, Oberkörper und Beine werden an der Naht ihrer eigenen Figur abgeschnitten — und die liegt
// je Figur anders (Hosenbund 1,09 bis 1,39). Passen zwei Teile nicht aufeinander, bleibt ein offener
// Ring, durch den man hindurchsieht.
//
// Lösung: je Kombination die Nähte vermessen (nach Winkel um die Körperachse). Wo das obere Teil
// höher endet als das untere beginnt, wird die Lücke mit der Original-Oberfläche der OBEREN Figur
// gefüllt (schließt dort also nahtlos an) — eingefärbt wie das untere Kleidungsstück an seinem Rand.
// Das Füllstück reicht etwas in das untere Teil hinein und verliert dort Tiefenkonflikte
// (polygonOffset), damit nichts flackert.
//
// Hüte: Die Haare des gewählten Kopfs werden unter die Hutunterseite gedrückt (statt durch Krempe
// und Krone zu stechen).
import * as THREE from 'three';

const BINS = 32;
/** Wie weit das Füllstück in das untere Teil hineinragt (Weltmaß der Datei, Figur ≈ 3,2 hoch). */
const OVERLAP = 0.05;
const ARM_BONE = /^(Shoulder|UpperArm|LowerArm|Fist)/;
const isSkin = (name) => /^skin/i.test(name || '');
const isHair = (name) => /hair|eyebrow|beard|mustache/i.test(name || '');

/** Naht-Arten: welche Bereiche sich treffen und in welchem Höhenband gesucht wird. */
const SEAMS = {
  // Oberteil (oben) trifft Beine (unten)
  waist: { upper: 'body', lower: 'legs', yMin: 0.8, yMax: 1.6, maxR: 0.55, axisBone: 'Abdomen' },
  // Kopf (oben) trifft Oberteil (unten)
  neck: { upper: 'head', lower: 'body', yMin: 1.8, yMax: 2.25, maxR: 0.3, axisBone: 'Neck' },
};

// ── Dreiecks-Daten je Figur (einmal je Datei) ──────────────────────────────
const infoCache = new Map();

/**
 * @param {string} charName
 * @param {THREE.Object3D} src  Szene der Figur in Ruhelage
 * @param {Map} sets  Ergebnis von classifyCharacter
 */
export function charInfo(charName, src, sets) {
  if (infoCache.has(charName)) return infoCache.get(charName);
  src.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  const key = (p) => `${Math.round(p.x * 400)},${Math.round(p.y * 400)},${Math.round(p.z * 400)}`;
  const edgeCount = new Map();
  const meshes = [];
  for (const [m, regionSets] of sets) {
    const idx = m.geometry.index;
    const n = idx.count / 3;
    const region = new Array(n);
    for (const [r, tris] of Object.entries(regionSets)) for (const t of tris) region[t] = r === 'feet' || r === 'sole' ? 'legs' : r;
    const pos = new Float32Array(n * 9);
    const keys = new Array(n * 3);
    const bone = new Array(n);
    const si = m.geometry.attributes.skinIndex, sw = m.geometry.attributes.skinWeight;
    const bones = m.skeleton.bones;
    const acc = new Map();
    for (let t = 0; t < n; t++) {
      acc.clear();
      for (let j = 0; j < 3; j++) {
        const vi = idx.getX(t * 3 + j);
        m.getVertexPosition(vi, v);
        m.localToWorld(v);
        pos.set([v.x, v.y, v.z], t * 9 + j * 3);
        keys[t * 3 + j] = key(v);
        for (let k = 0; k < 4; k++) {
          const w = sw.getComponent(vi, k);
          if (w > 0) { const bn = bones[si.getComponent(vi, k)]?.name; acc.set(bn, (acc.get(bn) || 0) + w); }
        }
      }
      let best = '', bw = -1;
      for (const [bn, w] of acc) if (w > bw) { bw = w; best = bn; }
      bone[t] = best;
      for (let j = 0; j < 3; j++) {
        const a = keys[t * 3 + j], b = keys[t * 3 + (j + 1) % 3];
        const e = a < b ? `${a}|${b}` : `${b}|${a}`;
        edgeCount.set(e, (edgeCount.get(e) || 0) + 1);
      }
    }
    meshes.push({ m, matName: [].concat(m.material)[0]?.name || '', region, pos, keys, bone, n });
  }
  const axis = {};
  src.traverse((o) => { if (o.isBone) axis[o.name] = o.getWorldPosition(new THREE.Vector3()); });
  const info = { meshes, edgeCount, axis };
  infoCache.set(charName, info);
  return info;
}

const angleBin = (x, z, zc) => {
  const a = Math.atan2(x, z - zc);
  return ((Math.floor(((a + Math.PI) / (2 * Math.PI)) * BINS) % BINS) + BINS) % BINS;
};

/** Leere Fächer aus den Nachbarn füllen (ringförmig). */
function fillBins(arr) {
  if (arr.every((x) => x == null)) return null;
  const out = arr.slice();
  for (let i = 0; i < BINS; i++) {
    if (out[i] != null) continue;
    let a = null, b = null, da = 0, db = 0;
    for (let k = 1; k < BINS && a == null; k++) { a = arr[(i - k + BINS) % BINS]; da = k; }
    for (let k = 1; k < BINS && b == null; k++) { b = arr[(i + k) % BINS]; db = k; }
    out[i] = (a * db + b * da) / (da + db);
  }
  return out;
}

/**
 * Schnittkante eines Bereichs: Kanten, die im Teil einmal, in der ganzen Figur zweimal vorkommen
 * (offene Säume der Figur selbst — Mantelsaum, Krempe — zählen nicht).
 * @returns {{ low: number[], high: number[], mats: Map<string, number> }} je Winkel-Fach tiefster/höchster Punkt
 */
function cutRing(info, region, spec, zc) {
  const low = new Array(BINS).fill(null), high = new Array(BINS).fill(null);
  const mats = new Map();
  for (const mi of info.meshes) {
    if (isHair(mi.matName)) continue;
    for (let t = 0; t < mi.n; t++) {
      if (mi.region[t] !== region) continue;
      for (let j = 0; j < 3; j++) {
        const a = mi.keys[t * 3 + j], b = mi.keys[t * 3 + (j + 1) % 3];
        if (info.edgeCount.get(a < b ? `${a}|${b}` : `${b}|${a}`) !== 2) continue;
        // Kante gehört nur dann zur Naht, wenn das Nachbardreieck in einem anderen Bereich liegt —
        // Kanten innerhalb des Bereichs kommen im Teil selbst zweimal vor (unten gezählt)
        if (!isCutEdge(info, region, a, b)) continue;
        for (const jj of [j, (j + 1) % 3]) {
          const o = t * 9 + jj * 3;
          const x = mi.pos[o], y = mi.pos[o + 1], z = mi.pos[o + 2];
          if (y < spec.yMin || y > spec.yMax || Math.hypot(x, z - zc) > spec.maxR) continue;
          const bi = angleBin(x, z, zc);
          low[bi] = low[bi] == null ? y : Math.min(low[bi], y);
          high[bi] = high[bi] == null ? y : Math.max(high[bi], y);
          mats.set(mi.matName, (mats.get(mi.matName) || 0) + 1);
        }
      }
    }
  }
  return { low: fillBins(low), high: fillBins(high), mats };
}

/** Kanten-Zählung je Bereich (einmal je Figur und Bereich). */
const regionEdgeCache = new WeakMap();
function isCutEdge(info, region, a, b) {
  let per = regionEdgeCache.get(info);
  if (!per) { per = new Map(); regionEdgeCache.set(info, per); }
  if (!per.has(region)) {
    const cnt = new Map();
    for (const mi of info.meshes) {
      for (let t = 0; t < mi.n; t++) {
        if (mi.region[t] !== region) continue;
        for (let j = 0; j < 3; j++) {
          const p = mi.keys[t * 3 + j], q = mi.keys[t * 3 + (j + 1) % 3];
          const e = p < q ? `${p}|${q}` : `${q}|${p}`;
          cnt.set(e, (cnt.get(e) || 0) + 1);
        }
      }
    }
    per.set(region, cnt);
  }
  return per.get(region).get(a < b ? `${a}|${b}` : `${b}|${a}`) === 1;
}

const seamCache = new Map();

/**
 * Füllstücke für eine Naht zwischen zwei verschiedenen Figuren.
 * @returns {{ mesh: THREE.SkinnedMesh, tris: number[], material: string }[] & { trim: Map<THREE.SkinnedMesh, Set<number>> }}
 *   je Quell-Mesh der OBEREN Figur die Dreiecke des Füllstücks und welches Material des UNTEREN
 *   Teils sie tragen sollen (Name; Haut bleibt Haut der oberen Figur → material = null).
 *   trim: Dreiecke des unteren Teils, die komplett über dem Saum liegen und wegfallen.
 */
export function seamFill(kind, upperName, upperSrc, upperSets, lowerName, lowerSrc, lowerSets) {
  const spec = SEAMS[kind];
  if (!spec || upperName === lowerName) return [];
  const key = `${kind}|${upperName}|${lowerName}`;
  if (seamCache.has(key)) return seamCache.get(key);
  const U = charInfo(upperName, upperSrc, upperSets);
  const L = charInfo(lowerName, lowerSrc, lowerSets);
  const zc = U.axis[spec.axisBone]?.z ?? 0.03;
  const uRing = cutRing(U, spec.upper, spec, zc);
  const lRing = cutRing(L, spec.lower, spec, zc);
  const out = [];
  /** Dreiecke des UNTEREN Teils, die wegfallen (Mesh → Set der Dreiecksnummern). */
  out.trim = new Map();
  if (uRing.high && lRing.low) {
    // Material des unteren Teils an seinem Rand (meiste Nahtpunkte, Haut nur wenn nichts anderes)
    let lowerMat = null, best = -1;
    for (const [name, c] of lRing.mats) if (!isSkin(name) && c > best) { best = c; lowerMat = name; }
    // Fächer mit Lücke: obere Kante (höchster Punkt) liegt über dem Rand des unteren Teils
    const need = new Array(BINS);
    const from = new Array(BINS), to = new Array(BINS);
    let any = false;
    for (let i = 0; i < BINS; i++) {
      // Nachbarn mitnehmen: Zickzack-Kanten liegen nicht sauber in einem Fach
      const top = Math.max(uRing.high[i], uRing.high[(i + 1) % BINS], uRing.high[(i + BINS - 1) % BINS]);
      const bottom = Math.min(lRing.low[i], lRing.low[(i + 1) % BINS], lRing.low[(i + BINS - 1) % BINS]);
      need[i] = top > bottom - 0.01;
      from[i] = bottom - OVERLAP;
      to[i] = top + 0.002;
      any = any || need[i];
    }
    if (any) {
      for (const mi of U.meshes) {
        if (isHair(mi.matName)) continue;
        const tris = [];
        for (let t = 0; t < mi.n; t++) {
          const r = mi.region[t];
          if (r === spec.upper || r === 'hat') continue;
          if (kind === 'waist' && ARM_BONE.test(mi.bone[t])) continue;
          let cx = 0, cz = 0, ymin = Infinity, ymax = -Infinity, rmax = 0;
          for (let j = 0; j < 3; j++) {
            const o = t * 9 + j * 3;
            cx += mi.pos[o] / 3; cz += mi.pos[o + 2] / 3;
            ymin = Math.min(ymin, mi.pos[o + 1]); ymax = Math.max(ymax, mi.pos[o + 1]);
            rmax = Math.max(rmax, Math.hypot(mi.pos[o], mi.pos[o + 2] - zc));
          }
          if (rmax > spec.maxR) continue;
          const bi = angleBin(cx, cz, zc);
          if (!need[bi]) continue;
          if (ymax < from[bi] || ymin > to[bi]) continue;
          tris.push(t);
        }
        if (tris.length) out.push({ mesh: mi.m, tris, material: isSkin(mi.matName) ? null : lowerMat });
      }
    }
    // Gegenfall Hüfte: das untere Teil reicht höher als der Saum des oberen (Anzughose mit
    // Sakko-Zipfeln) — was komplett über dem Saum liegt, steckt sonst als Zacken durch das Oberteil.
    // Das Oberteil ist dort geschlossen, also einfach weglassen.
    if (kind === 'waist') {
      for (const mi of L.meshes) {
        const drop = new Set();
        for (let t = 0; t < mi.n; t++) {
          if (mi.region[t] !== spec.lower) continue;
          let cx = 0, cz = 0, ymin = Infinity, rmax = 0;
          for (let j = 0; j < 3; j++) {
            const o = t * 9 + j * 3;
            cx += mi.pos[o] / 3; cz += mi.pos[o + 2] / 3;
            ymin = Math.min(ymin, mi.pos[o + 1]);
            rmax = Math.max(rmax, Math.hypot(mi.pos[o], mi.pos[o + 2] - zc));
          }
          if (rmax > spec.maxR || ymin > spec.yMax) continue;
          const bi = angleBin(cx, cz, zc);
          const hem = Math.max(uRing.high[bi], uRing.high[(bi + 1) % BINS], uRing.high[(bi + BINS - 1) % BINS]);
          if (ymin > hem + 0.02) drop.add(t);
        }
        if (drop.size) out.trim.set(mi.m, drop);
      }
    }
  }
  seamCache.set(key, out);
  return out;
}

// ── Haare unter dem Hut ────────────────────────────────────────────────────
const CELL = 0.025;
const hatFieldCache = new Map();

/**
 * Höhenfeld der Hut-Unterseite (Ruhelage, Weltmaß der Datei, schon um dy verschoben):
 * je xz-Zelle die tiefste Hut-Höhe.
 */
function hatField(hatName, hatSrc, hatSets, dy) {
  const key = `${hatName}|${dy.toFixed(4)}`;
  if (hatFieldCache.has(key)) return hatFieldCache.get(key);
  hatSrc.updateMatrixWorld(true);
  const field = new Map();
  /** Oberseite je Zelle (für die Prüfung „Kopf sticht nicht durch die Krone“). */
  field.hi = new Map();
  const put = (x, y, z) => {
    const k = `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
    const cur = field.get(k);
    if (cur == null || y < cur) field.set(k, y);
    const top = field.hi.get(k);
    if (top == null || y > top) field.hi.set(k, y);
  };
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), p = new THREE.Vector3();
  for (const [m, sets] of hatSets) {
    const idx = m.geometry.index;
    for (const t of sets.hat) {
      m.getVertexPosition(idx.getX(t * 3), a); m.localToWorld(a);
      m.getVertexPosition(idx.getX(t * 3 + 1), b); m.localToWorld(b);
      m.getVertexPosition(idx.getX(t * 3 + 2), c); m.localToWorld(c);
      const len = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a));
      const n = Math.max(1, Math.ceil(len / (CELL * 0.5)));
      for (let i = 0; i <= n; i++) {
        for (let j = 0; j <= n - i; j++) {
          const u = i / n, w = j / n;
          p.copy(a).multiplyScalar(1 - u - w).addScaledVector(b, u).addScaledVector(c, w);
          put(p.x, p.y + dy, p.z);
        }
      }
    }
  }
  hatFieldCache.set(key, field);
  return field;
}

/** Tiefste Hut-Höhe über (x, z) — Nachbarzellen mitgenommen, damit steile Hutwände dicht sind. */
function hatBottomAt(field, x, z) {
  const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
  let best = null;
  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) {
      const y = field.get(`${cx + i},${cz + j}`);
      if (y != null && (best == null || y < best)) best = y;
    }
  }
  return best;
}

/** Geschlossene Helme: Haare ganz ausblenden (sonst stechen sie durch Visier und Seiten). */
const HIDES_HAIR = new Set(['Knight_Golden_Male']);
export const hatHidesHair = (hatName) => HIDES_HAIR.has(hatName);
export const isHairMaterial = (mat) => isHair([].concat(mat)[0]?.name);

const headFieldCache = new Map();
/** Höhenfeld des Kopfs ohne Haare: je xz-Zelle die höchste Stelle. */
function headField(headName, headSrc, headSets, hair = false) {
  const cacheKey = hair ? `${headName}|hair` : headName;
  if (headFieldCache.has(cacheKey)) return headFieldCache.get(cacheKey);
  headSrc.updateMatrixWorld(true);
  const field = new Map();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), p = new THREE.Vector3();
  for (const [m, sets] of headSets) {
    if (isHair([].concat(m.material)[0]?.name) !== hair) continue;
    const idx = m.geometry.index;
    for (const t of sets.head) {
      m.getVertexPosition(idx.getX(t * 3), a); m.localToWorld(a);
      m.getVertexPosition(idx.getX(t * 3 + 1), b); m.localToWorld(b);
      m.getVertexPosition(idx.getX(t * 3 + 2), c); m.localToWorld(c);
      const len = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a));
      const n = Math.max(1, Math.ceil(len / (CELL * 0.5)));
      for (let i = 0; i <= n; i++) {
        for (let j = 0; j <= n - i; j++) {
          const u = i / n, w = j / n;
          p.copy(a).multiplyScalar(1 - u - w).addScaledVector(b, u).addScaledVector(c, w);
          const k = `${Math.floor(p.x / CELL)},${Math.floor(p.z / CELL)}`;
          const cur = field.get(k);
          if (cur == null || p.y > cur) field.set(k, p.y);
        }
      }
    }
  }
  headFieldCache.set(cacheKey, field);
  return field;
}

/** Kleinster Abstand Hut-Unterseite ↔ Kopf (negativ: Hut sitzt etwas im Kopf, wie gebaut). */
function hatGap(hatF, headF) {
  let gap = Infinity;
  for (const [k, top] of headF) {
    const bottom = hatF.get(k);
    if (bottom != null) gap = Math.min(gap, bottom - top);
  }
  return Number.isFinite(gap) ? gap : null;
}

/**
 * Höhenversatz eines Huts auf einem fremden Kopf: so weit senken/heben, dass er genauso aufliegt
 * wie auf dem Kopf seiner eigenen Figur (Masken wie Mops/Kuh sind kleiner → Hut sinkt tiefer).
 */
export function hatOffset(hatName, hatSrc, hatSets, headName, headSrc, headSets) {
  if (hatName === headName || HIDES_HAIR.has(hatName)) return 0;
  const hatF = hatField(hatName, hatSrc, hatSets, 0);
  const ownF = headField(hatName, hatSrc, hatSets);
  const targetF = headField(headName, headSrc, headSets);
  const own = hatGap(hatF, ownF);
  const target = hatGap(hatF, targetF);
  if (own == null || target == null) return 0;
  let dy = own - target;
  // Nicht durch die Krone stoßen: wo der Hut auf seiner eigenen Figur ÜBER dem Kopf liegt, muss
  // auch der neue Kopf darunter bleiben (sonst ragt z. B. die Mopsmaske oben aus dem Wikingerhelm)
  for (const [k, top] of ownF) {
    const hi = hatF.hi.get(k);
    const t = targetF.get(k);
    if (hi == null || t == null || hi < top + 0.01) continue;
    dy = Math.max(dy, t - hi + 0.04);
  }
  return Math.max(-0.8, Math.min(0.3, dy));
}

/** Abstand der Haare zur Hut-Unterseite. */
const HAIR_GAP = 0.02;
const hairGeoCache = new Map();

/**
 * Haar-Geometrie mit eigenen Positionen: alles, was in den Hut ragen würde, wird bis knapp unter die
 * Hut-Unterseite gedrückt. Liefert null, wenn das Mesh kein Haar ist.
 * @param {THREE.SkinnedMesh} m  Haar-Mesh der Kopf-Figur
 * @param {THREE.BufferAttribute} index  Index des Teils
 */
export function hairUnderHat(key, m, index, hatName, hatSrc, hatSets, dy) {
  if (!isHairMaterial(m.material)) return null;
  return hairUnderField(`${key}|${hatName}|${dy.toFixed(4)}`, m, index, hatField(hatName, hatSrc, hatSets, dy));
}

/**
 * Höhenfeld der Unterseite eines selbst gebauten Huts (avatarWear.js): alle Meshes des Objekts in
 * ihrer Lage (Ruhelage, Weltmaß der Datei) abtasten.
 */
export function fieldFromObject(object) {
  object.updateMatrixWorld(true);
  const field = new Map();
  field.hi = new Map();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), p = new THREE.Vector3();
  object.traverse((o) => {
    if (!o.isMesh || o.userData.noField) return;
    const pos = o.geometry.attributes.position, idx = o.geometry.index;
    const n = (idx ? idx.count : pos.count) / 3;
    const at = (i, out) => out.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(o.matrixWorld);
    for (let t = 0; t < n; t++) {
      at(t * 3, a); at(t * 3 + 1, b); at(t * 3 + 2, c);
      const len = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a));
      const steps = Math.max(1, Math.ceil(len / (CELL * 0.5)));
      for (let i = 0; i <= steps; i++) {
        for (let j = 0; j <= steps - i; j++) {
          const u = i / steps, w = j / steps;
          p.copy(a).multiplyScalar(1 - u - w).addScaledVector(b, u).addScaledVector(c, w);
          const k = `${Math.floor(p.x / CELL)},${Math.floor(p.z / CELL)}`;
          const cur = field.get(k);
          if (cur == null || p.y < cur) field.set(k, p.y);
        }
      }
    }
  });
  return field;
}

/**
 * Maße eines Kopfs (ohne Haare) für selbst gebaute Hüte und Brillen, Ruhelage in Weltmaß der Datei:
 * Scheitelhöhe, Querschnitt `drop` unter dem Scheitel (Mitte + Halbachsen), Augen (Material „Face“).
 */
const fitCache = new Map();
export function headFit(headName, headSrc, headSets, drop = 0.22) {
  const key = `${headName}|${drop}`;
  if (fitCache.has(key)) return fitCache.get(key);
  const field = headField(headName, headSrc, headSets);
  let top = -Infinity;
  for (const y of field.values()) top = Math.max(top, y);
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [k, y] of field) {
    if (y < top - drop) continue;
    const [i, j] = k.split(',').map(Number);
    x0 = Math.min(x0, i * CELL); x1 = Math.max(x1, (i + 1) * CELL);
    z0 = Math.min(z0, j * CELL); z1 = Math.max(z1, (j + 1) * CELL);
  }
  let fit = null;
  if (Number.isFinite(top) && Number.isFinite(x0)) {
    fit = { top, y: top - drop, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, rx: (x1 - x0) / 2, rz: (z1 - z0) / 2, eye: null };
    // Augen: Dreiecke des Materials „Face“ im Kopfbereich
    const info = charInfo(headName, headSrc, headSets);
    let n = 0, ey = 0, ez = -Infinity, ex = 0;
    for (const mi of info.meshes) {
      if (!/^face/i.test(mi.matName)) continue;
      for (let t = 0; t < mi.n; t++) {
        if (mi.region[t] !== 'head') continue;
        for (let j = 0; j < 3; j++) {
          const o = t * 9 + j * 3;
          ey += mi.pos[o + 1]; n++;
          ez = Math.max(ez, mi.pos[o + 2]);
          ex = Math.max(ex, Math.abs(mi.pos[o]));
        }
      }
    }
    if (n) fit.eye = { y: ey / n, z: ez, x: ex };
    // Haare: höchste Stelle und größte Breite in dieser Höhe oder darüber (für Bügel, die über den Haaren liegen)
    fit.hairTop = top;
    fit.hairRx = 0;
    for (const [k, y] of headField(headName, headSrc, headSets, true)) {
      const [i] = k.split(',').map(Number);
      fit.hairTop = Math.max(fit.hairTop, y);
      if (y >= top - drop) fit.hairRx = Math.max(fit.hairRx, Math.abs((i + 0.5) * CELL - fit.cx));
    }
  }
  fitCache.set(key, fit);
  return fit;
}

/** Haare unter ein Höhenfeld drücken (siehe hairUnderHat). Liefert null, wenn das Mesh kein Haar ist. */
export function hairUnderField(cacheKey, m, index, field) {
  if (!isHairMaterial(m.material)) return null;
  if (hairGeoCache.has(cacheKey)) return hairGeoCache.get(cacheKey);
  const src = m.geometry;
  const n = src.attributes.position.count;
  const posArr = new Float32Array(n * 3);
  const raw = new THREE.Vector3(), w = new THREE.Vector3(), t = new THREE.Vector3();
  const A = new THREE.Matrix3();
  // Gemessen wird wie überall in geskinnter Ruhelage (Weltmaß der Datei). Die Positionen im Puffer
  // sind quantisiert und gehen noch durch das Skinning — Rückweg über die (je Vertex affine)
  // Abbildung Puffer → Welt: Spalten aus Einheitsschritten, dann invertieren.
  const toWorld = (i, r, out) => m.localToWorld(m.applyBoneTransform(i, out.copy(r)));
  for (let i = 0; i < n; i++) {
    raw.fromBufferAttribute(src.attributes.position, i);
    toWorld(i, raw, w);
    // floor: Hüte, die den ganzen Oberkopf bedecken — auch Haare neben dem Hut bleiben unter dem Hutrand
    let bottom = hatBottomAt(field, w.x, w.z);
    if (field.floor != null && (bottom == null || bottom > field.floor)) bottom = field.floor;
    if (bottom != null && w.y > bottom - HAIR_GAP) {
      const cols = [0, 1, 2].map((k) => {
        const e = raw.clone().setComponent(k, raw.getComponent(k) + 1);
        return toWorld(i, e, t).clone().sub(w);
      });
      A.set(cols[0].x, cols[1].x, cols[2].x, cols[0].y, cols[1].y, cols[2].y, cols[0].z, cols[1].z, cols[2].z);
      // rim: Haare, die über den Hutrand hinausstehen, zusätzlich unter den Hut ziehen (sonst bleibt ein flacher Haarkranz)
      let dx = 0, dz = 0;
      const rim = field.rim;
      if (rim) {
        const ex = (w.x - rim.cx) / rim.rx, ez = (w.z - rim.cz) / rim.rz;
        const q = Math.hypot(ex, ez);
        if (q > 0.94) { dx = (w.x - rim.cx) * (0.94 / q - 1); dz = (w.z - rim.cz) * (0.94 / q - 1); }
      }
      const d = new THREE.Vector3(dx, bottom - HAIR_GAP - w.y, dz).applyMatrix3(A.invert());
      raw.add(d);
    }
    posArr.set([raw.x, raw.y, raw.z], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(src.attributes)) if (name !== 'position') geo.setAttribute(name, attr);
  geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  geo.setIndex(index);
  hairGeoCache.set(cacheKey, geo);
  return geo;
}
