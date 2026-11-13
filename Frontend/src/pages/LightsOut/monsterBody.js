// monsterBody.js — organische Körper für die Monster, statt der Gliederpuppe.
//
// Die Gliederpuppe (dancer.glb) liefert nur noch Skelett und Bewegung. Der Körper selbst wird hier neu
// geformt: aus Kugeln, Kapseln und Ellipsoiden entlang der Knochen entsteht ein Abstandsfeld, in dem die Teile
// weich ineinander übergehen (keine sichtbaren Nähte, keine Gelenkringe). Rippen, Wirbel, Schlüsselbeine und
// Knöchel stehen heraus, Augenhöhlen, Mund und eingefallene Wangen werden herausgeschnitten. Aus dem Feld
// wird ein Netz gezogen („Surface Nets“), jede Ecke bekommt ihre Knochengewichte von den Teilen, in deren
// Nähe sie liegt, und eine Farbe (fleckige Haut, dunkel in Vertiefungen).
//
// Drei Auflösungen: Rumpf und Glieder grob (14 mm), Hände fein (6 mm — sonst gäbe es keine Finger),
// Kopf fein (6 mm — er füllt das Bild, wenn es einen packt). Zusammen rund 40.000 Dreiecke je Figur.
import * as THREE from 'three';

// ── Abstandsfeld ───────────────────────────────────────────────────────────
const smin = (a, b, k) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};

/** Teile: s = Kugel, c = Kapsel (Radius r0 → r1), e = Ellipsoid, b = Ellipsoid-Band zwischen zwei Höhen. */
const sphere = (c, r, o = {}) => ({ t: 's', c, r, ...o });
const capsule = (a, b, r0, r1 = r0, o = {}) => ({ t: 'c', a, b, r0, r1, ...o });
const ellipsoid = (c, r, o = {}) => ({ t: 'e', c, r, ...o });
const band = (c, r, y0, y1, o = {}) => ({ t: 'b', c, r, y0, y1, ...o });

function dist(p, x, y, z) {
  if (p.t === 's') return Math.hypot(x - p.c[0], y - p.c[1], z - p.c[2]) - p.r;
  if (p.t === 'c') {
    const ax = p.a[0]; const ay = p.a[1]; const az = p.a[2];
    const bx = p.b[0] - ax; const by = p.b[1] - ay; const bz = p.b[2] - az;
    const len2 = bx * bx + by * by + bz * bz;
    let t = len2 > 1e-10 ? ((x - ax) * bx + (y - ay) * by + (z - az) * bz) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.hypot(x - ax - bx * t, y - ay - by * t, z - az - bz * t) - (p.r0 + (p.r1 - p.r0) * t);
  }
  // Ellipsoid (Näherung nach Quilez): genau genug zum Verschmelzen
  const dx = (x - p.c[0]) / p.r[0];
  const dy = (y - p.c[1]) / p.r[1];
  const dz = (z - p.c[2]) / p.r[2];
  const k0 = Math.hypot(dx, dy, dz);
  const k1 = Math.hypot(dx / p.r[0], dy / p.r[1], dz / p.r[2]);
  const d = k1 > 1e-6 ? (k0 * (k0 - 1)) / k1 : -Math.min(p.r[0], p.r[1], p.r[2]);
  if (p.t === 'b') return Math.max(d, p.y0 - y, y - p.y1);
  return d;
}

function bounds(p) {
  if (p.t === 's') return [p.c.map((v) => v - p.r), p.c.map((v) => v + p.r)];
  if (p.t === 'c') {
    const r = Math.max(p.r0, p.r1);
    return [p.a.map((v, i) => Math.min(v, p.b[i]) - r), p.a.map((v, i) => Math.max(v, p.b[i]) + r)];
  }
  return [p.c.map((v, i) => v - p.r[i]), p.c.map((v, i) => v + p.r[i])];
}

/**
 * Füllt ein Gitter mit dem Abstandsfeld aller Teile. Jedes Teil wird nur in seiner Umgebung eingetragen.
 * @returns {{ f: Float32Array, nx:number, ny:number, nz:number, min:number[], cell:number }}
 */
function rasterize(prims, min, max, cell, post) {
  const nx = Math.ceil((max[0] - min[0]) / cell) + 1;
  const ny = Math.ceil((max[1] - min[1]) / cell) + 1;
  const nz = Math.ceil((max[2] - min[2]) / cell) + 1;
  const f = new Float32Array(nx * ny * nz).fill(0.08);
  // erst alles Aufbauende, dann alles Herausgeschnittene
  for (const pass of [false, true]) {
    for (const p of prims) {
      if (!!p.sub !== pass) continue;
      const k = p.k ?? 0.03;
      const [lo, hi] = bounds(p);
      const pad = k + cell * 2;
      const i0 = Math.max(0, Math.floor((lo[0] - pad - min[0]) / cell));
      const i1 = Math.min(nx - 1, Math.ceil((hi[0] + pad - min[0]) / cell));
      const j0 = Math.max(0, Math.floor((lo[1] - pad - min[1]) / cell));
      const j1 = Math.min(ny - 1, Math.ceil((hi[1] + pad - min[1]) / cell));
      const k0 = Math.max(0, Math.floor((lo[2] - pad - min[2]) / cell));
      const k1 = Math.min(nz - 1, Math.ceil((hi[2] + pad - min[2]) / cell));
      for (let kk = k0; kk <= k1; kk++) {
        const z = min[2] + kk * cell;
        for (let j = j0; j <= j1; j++) {
          const y = min[1] + j * cell;
          let at = (kk * ny + j) * nx + i0;
          for (let i = i0; i <= i1; i++, at++) {
            const d = dist(p, min[0] + i * cell, y, z);
            f[at] = pass ? -smin(-f[at], d, k) : smin(f[at], d, k);
          }
        }
      }
    }
  }
  if (post) {
    for (let kk = 0; kk < nz; kk++) {
      for (let j = 0; j < ny; j++) {
        let at = (kk * ny + j) * nx;
        for (let i = 0; i < nx; i++, at++) {
          if (Math.abs(f[at]) < 0.03) f[at] += post(min[0] + i * cell, min[1] + j * cell, min[2] + kk * cell);
        }
      }
    }
  }
  return { f, nx, ny, nz, min, cell };
}

/** Feldwert an beliebiger Stelle (dreifach linear zwischen den Gitterpunkten). */
function sampleField(g, x, y, z) {
  const fx = Math.min(g.nx - 1.001, Math.max(0, (x - g.min[0]) / g.cell));
  const fy = Math.min(g.ny - 1.001, Math.max(0, (y - g.min[1]) / g.cell));
  const fz = Math.min(g.nz - 1.001, Math.max(0, (z - g.min[2]) / g.cell));
  const i = Math.floor(fx); const j = Math.floor(fy); const k = Math.floor(fz);
  const u = fx - i; const v = fy - j; const w = fz - k;
  const { f, nx, ny } = g;
  const a = (k * ny + j) * nx + i;
  const b = a + nx * ny;
  const lerp = (p, q, t) => p + (q - p) * t;
  return lerp(
    lerp(lerp(f[a], f[a + 1], u), lerp(f[a + nx], f[a + nx + 1], u), v),
    lerp(lerp(f[b], f[b + 1], u), lerp(f[b + nx], f[b + nx + 1], u), v),
    w,
  );
}

/**
 * Netz aus dem Feld (Surface Nets): eine Ecke je Gitterzelle, durch die die Oberfläche läuft, ein Viereck
 * je Gitterkante mit Vorzeichenwechsel. clip(x, y, z) begrenzt, welche Zellen Ecken bekommen.
 */
function surfaceNets(g, clip) {
  const { f, nx, ny, nz, min, cell } = g;
  const vid = new Int32Array(nx * ny * nz).fill(-1);
  const pos = [];
  const CORNERS = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const val = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) {
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const base = (k * ny + j) * nx + i;
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          const v = f[base + CORNERS[c][0] + CORNERS[c][1] * nx + CORNERS[c][2] * nx * ny];
          val[c] = v;
          if (v < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0; let sy = 0; let sz = 0; let n = 0;
        for (const [a, b] of EDGES) {
          if ((val[a] < 0) === (val[b] < 0)) continue;
          const t = val[a] / (val[a] - val[b]);
          sx += CORNERS[a][0] + (CORNERS[b][0] - CORNERS[a][0]) * t;
          sy += CORNERS[a][1] + (CORNERS[b][1] - CORNERS[a][1]) * t;
          sz += CORNERS[a][2] + (CORNERS[b][2] - CORNERS[a][2]) * t;
          n++;
        }
        const x = min[0] + (i + sx / n) * cell;
        const y = min[1] + (j + sy / n) * cell;
        const z = min[2] + (k + sz / n) * cell;
        if (clip && !clip(x, y, z)) continue;
        vid[base] = pos.length / 3;
        pos.push(x, y, z);
      }
    }
  }
  const idx = [];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d);
  };
  const sx = 1; const sy = nx; const sz = nx * ny;
  for (let k = 1; k < nz - 1; k++) {
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const at = (k * ny + j) * nx + i;
        const inside = f[at] < 0;
        // Kante in x: umgeben von den vier Zellen (j-1/j, k-1/k)
        if (inside !== (f[at + sx] < 0)) quad(vid[at - sy - sz], vid[at - sz], vid[at], vid[at - sy], inside);
        if (inside !== (f[at + sy] < 0)) quad(vid[at - sx - sz], vid[at - sx], vid[at], vid[at - sz], inside);
        if (inside !== (f[at + sz] < 0)) quad(vid[at - sx - sy], vid[at - sy], vid[at], vid[at - sx], inside);
      }
    }
  }
  return { pos, idx };
}

// ── Mensch aus Teilen ──────────────────────────────────────────────────────

/**
 * Teile eines ausgezehrten Körpers entlang des Skeletts. P(name) = Lage eines Knochens in der Ruhepose,
 * o = Gestalt: chest/belly/limb = Dicke von Brustkorb, Bauch, Gliedern; spine = Größe der Wirbel;
 * claw = Länge der Krallen (m); hump = Buckel; foot = Größe der Füße.
 */
function humanoid(P, o) {
  const prims = [];
  const add = (p, bone, soft = 0.022) => { prims.push({ ...p, bone, soft }); };
  const L = o.limb;
  const hips = P('hips');
  const s1 = P('spine001');
  const s2 = P('spine002');
  const s3 = P('spine003');
  const neck = P('neck');
  const head = P('head');
  // Becken mit herausstehenden Beckenknochen
  add(ellipsoid([0, hips[1] + 0.03, -0.045], [0.138 * o.belly, 0.085, 0.09]), 'hips', 0.04);
  // Bauch: eingefallen, schmaler als Becken und Brustkorb
  add(capsule([0, s1[1] - 0.04, -0.045], [0, s2[1] + 0.02, -0.035], 0.082 * o.belly, 0.088 * o.belly, { k: 0.05 }), 'spine001', 0.04);
  // Brustkorb in zwei Teilen (bewegt sich mit zwei Wirbeln)
  add(ellipsoid([0, s2[1] + 0.085, -0.03], [0.142 * o.chest, 0.115, 0.1 * o.chest], { k: 0.04 }), 'spine002', 0.04);
  add(ellipsoid([0, s3[1] + 0.07, -0.032], [0.158 * o.chest, 0.11, 0.098 * o.chest], { k: 0.04 }), 'spine003', 0.04);
  if (o.hump) add(ellipsoid([0.02, s3[1] + 0.09, -0.11], [0.12, 0.1, 0.075], { k: 0.05 }), 'spine003', 0.04);
  // Wirbel: eine Reihe Höcker den Rücken hinunter
  if (o.spine) {
    for (let y = s1[1] - 0.02; y < neck[1] - 0.01; y += 0.043) {
      const t = (y - s1[1]) / (neck[1] - s1[1]);
      const back = -0.045 - (0.058 + 0.05 * Math.sin(Math.max(0, t) * Math.PI)) * (t > 0.3 ? o.chest : 1) - (o.hump && t > 0.6 ? 0.05 : 0);
      add(sphere([0, y, back], o.spine, { k: 0.012 }), y < s2[1] ? 'spine001' : y < s3[1] ? 'spine002' : 'spine003');
    }
  }
  // Hals
  add(capsule([0, neck[1] - 0.03, neck[2] - 0.004], [0, head[1] + 0.035, head[2] + 0.004], 0.04 * L, 0.036 * L, { k: 0.035 }), 'neck', 0.03);
  for (const s of [1, -1]) {
    const side = s > 0 ? 'L' : 'R';
    const m = (v) => [v[0] * s, v[1], v[2]];
    const sh = P('shoulderL');
    const ua = P('upper_armL');
    const fa = P('forearmL');
    const ha = P('handL');
    // Schlüsselbein und Schulterblatt zeichnen sich ab
    add(capsule(m([0.02, sh[1] - 0.004, 0.05 * o.chest]), m([ua[0] - 0.02, ua[1] + 0.012, ua[2] + 0.02]), 0.015, 0.017, { k: 0.02 }), `shoulder${side}`);
    add(ellipsoid(m([0.085, s3[1] + 0.06, -0.03 - 0.085 * o.chest]), [0.055, 0.075, 0.026], { k: 0.03 }), 'spine003', 0.04);
    add(sphere(m(ua), 0.046 * L, { k: 0.04 }), `upper_arm${side}`, 0.03);
    // Arm: dünn, Ellbogen und Handgelenk als Knoten
    add(capsule(m([ua[0] + 0.01, ua[1], ua[2]]), m(fa), 0.034 * L, 0.025 * L), `upper_arm${side}`);
    add(sphere(m([fa[0], fa[1], fa[2] - 0.006]), 0.031 * L, { k: 0.02 }), `forearm${side}`);
    add(capsule(m(fa), m(ha), 0.029 * L, 0.02 * L), `forearm${side}`);
    add(sphere(m([ha[0], ha[1], ha[2] - 0.012]), 0.021 * L, { k: 0.015 }), `hand${side}`, 0.015);
    // Handteller
    add(ellipsoid(m([ha[0] + 0.062, ha[1] - 0.002, ha[2] - 0.004]), [0.066, 0.015, 0.046], { k: 0.015 }), `hand${side}`, 0.015);
    // Finger: drei Glieder, Knöchel, lange Kralle
    for (const fn of ['index', 'middle', 'ring', 'pinky', 'thumb']) {
      const names = fn === 'thumb' ? ['thumb01', 'thumb02', 'thumb03'] : [`f_${fn}01`, `f_${fn}02`, `f_${fn}03`];
      const pts = names.map((n) => P(`${n}L`));
      const d = [pts[2][0] - pts[1][0], pts[2][1] - pts[1][1], pts[2][2] - pts[1][2]];
      const len = Math.hypot(...d) || 1;
      const tip = pts[2].map((v, i) => v + (d[i] / len) * (len * 0.9 + 0.012));
      const claw = tip.map((v, i) => v + (d[i] / len) * o.claw + (i === 1 ? -o.claw * 0.35 : 0));
      const r = fn === 'thumb' ? 0.0105 : fn === 'pinky' ? 0.0082 : 0.0092;
      const chain = [...pts, tip];
      for (let i = 0; i < 3; i++) {
        add(capsule(m(chain[i]), m(chain[i + 1]), r * (1 - i * 0.1), r * (0.9 - i * 0.1), { k: 0.006 }), `${names[i]}${side}`, 0.008);
        add(sphere(m(chain[i]), r * 1.22, { k: 0.005 }), `${names[i]}${side}`, 0.008);
      }
      if (o.claw > 0) add(capsule(m(tip), m(claw), r * 0.72, 0.0025, { k: 0.004 }), `${names[2]}${side}`, 0.008);
    }
    // Bein: Oberschenkel, Knie, Schienbein, Knöchel
    const th = P('thighL');
    const shn = P('shinL');
    const ft = P('footL');
    const toe = P('toeL');
    add(sphere(m([th[0] + 0.03, th[1] + 0.055, -0.01]), 0.044, { k: 0.03 }), 'hips', 0.03);
    add(capsule(m([th[0], th[1] - 0.01, th[2]]), m(shn), 0.056 * L, 0.04 * L, { k: 0.04 }), `thigh${side}`, 0.03);
    add(sphere(m([shn[0], shn[1], shn[2] + 0.012]), 0.045 * L, { k: 0.02 }), `shin${side}`);
    add(capsule(m(shn), m(ft), 0.037 * L, 0.026 * L), `shin${side}`);
    add(sphere(m([ft[0] + 0.022, ft[1] + 0.005, ft[2]]), 0.024, { k: 0.012 }), `foot${side}`, 0.015);
    // Fuß: Ferse, Spann, Zehen
    const F = o.foot ?? 1;
    add(sphere(m([ft[0], toe[1] + 0.012, ft[2] - 0.022]), 0.034 * F, { k: 0.025 }), `foot${side}`, 0.02);
    add(capsule(m([ft[0], ft[1] - 0.03, ft[2] + 0.01]), m([toe[0], toe[1] + 0.012, toe[2]]), 0.034 * F, 0.027 * F, { k: 0.025 }), `foot${side}`, 0.02);
    add(capsule(m([toe[0], toe[1] + 0.008, toe[2]]), m([toe[0], toe[1] + 0.003, toe[2] + 0.075 * F]), 0.027 * F, 0.019 * F, { k: 0.02 }), `toe${side}`, 0.02);
  }
  return prims;
}

// ── Köpfe ──────────────────────────────────────────────────────────────────
// Maße relativ zur Kopfmitte (x rechts/links, y oben, z nach vorn — Blick nach +z).

const pair = (fn) => [fn(1), fn(-1)];

/** Ausgemergeltes Gesicht: tiefe Augenhöhlen, eingefallene Wangen, der Unterkiefer hängt aufgerissen herab. */
function faceAgnes() {
  return [
    ellipsoid([0, 0.03, -0.012], [0.078, 0.092, 0.096]),
    ellipsoid([0, -0.045, 0.02], [0.058, 0.075, 0.062], { k: 0.03 }),
    ...pair((s) => sphere([s * 0.05, -0.012, 0.048], 0.022, { k: 0.02 })),
    capsule([-0.045, 0.026, 0.066], [0.045, 0.026, 0.066], 0.013, 0.013, { k: 0.012 }),
    capsule([0, 0.02, 0.082], [0, -0.016, 0.096], 0.009, 0.0115, { k: 0.01 }),
    ellipsoid([0, -0.128, 0.026], [0.037, 0.044, 0.04], { k: 0.03 }),
    ...pair((s) => sphere([s * 0.031, 0.006, 0.08], 0.0215, { sub: true, k: 0.012 })),
    ellipsoid([0, -0.088, 0.072], [0.025, 0.05, 0.045], { sub: true, k: 0.012 }),
    ...pair((s) => sphere([s * 0.068, -0.052, 0.042], 0.026, { sub: true, k: 0.02 })),
    ...pair((s) => sphere([s * 0.09, 0.022, 0.022], 0.022, { sub: true, k: 0.02 })),
  ];
}

/** Patient 12: glatter Schädel ohne Augen, eine Binde darüber, das Maul breit aufgerissen bis unter die Ohren. */
function facePatient() {
  return [
    ellipsoid([0, 0.022, 0], [0.085, 0.09, 0.104]),
    ellipsoid([0, -0.052, 0.034], [0.068, 0.072, 0.07], { k: 0.03 }),
    band([0, 0.022, 0], [0.09, 0.095, 0.109], 0.002, 0.048, { k: 0.006 }),
    ...pair((s) => ellipsoid([s * 0.088, 0, -0.012], [0.011, 0.03, 0.02], { k: 0.012 })),
    capsule([0, -0.002, 0.098], [0, -0.022, 0.104], 0.012, 0.014, { k: 0.012 }),
    ellipsoid([0, -0.074, 0.076], [0.054, 0.03, 0.05], { sub: true, k: 0.012 }),
    ...pair((s) => sphere([s * 0.062, -0.068, 0.05], 0.02, { sub: true, k: 0.012 })),
    ...pair((s) => sphere([s * 0.092, 0.035, 0.03], 0.02, { sub: true, k: 0.02 })),
  ];
}

/** Jutesack über dem Kopf: beulig, unten weit; zwei Löcher für die Augen. (Obenauf sitzt der Hut.) */
function faceSack() {
  return [
    ellipsoid([0, 0.02, 0], [0.104, 0.124, 0.11]),
    ellipsoid([0, -0.11, 0], [0.092, 0.05, 0.092], { k: 0.04 }),
    sphere([0.06, 0.085, 0.035], 0.045, { k: 0.04 }),
    sphere([-0.07, 0.03, -0.03], 0.05, { k: 0.04 }),
    sphere([-0.03, -0.04, 0.075], 0.04, { k: 0.04 }),
    sphere([0.05, -0.06, 0.05], 0.042, { k: 0.04 }),
    ...pair((s) => sphere([s * 0.037, 0.03, 0.102], 0.024, { sub: true, k: 0.006 })),
  ];
}

/** Tierschädel: Hirnschale, lange Schnauze nach vorn unten, leere Augenhöhlen. */
function faceSkull() {
  return [
    ellipsoid([0, 0.02, -0.01], [0.08, 0.07, 0.09]),
    capsule([0, 0, 0.04], [0, -0.06, 0.23], 0.058, 0.024, { k: 0.03 }),
    capsule([0, 0.035, 0.05], [0, -0.03, 0.22], 0.022, 0.012, { k: 0.015 }),
    ...pair((s) => sphere([s * 0.05, 0.025, 0.066], 0.022, { sub: true, k: 0.01 })),
  ];
}

// ── Farben ─────────────────────────────────────────────────────────────────

/** Ruhiges 3D-Rauschen 0…1 (Flecken auf der Haut). */
function noise3(x, y, z) {
  const h = (i, j, k) => {
    let n = (i * 374761393 + j * 668265263 + k * 1274126177) | 0;
    n = (n ^ (n >>> 13)) * 1274126177;
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  };
  const i = Math.floor(x); const j = Math.floor(y); const k = Math.floor(z);
  const u = x - i; const v = y - j; const w = z - k;
  const s = (t) => t * t * (3 - 2 * t);
  const lerp = (a, b, t) => a + (b - a) * t;
  const su = s(u); const sv = s(v); const sw = s(w);
  return lerp(
    lerp(lerp(h(i, j, k), h(i + 1, j, k), su), lerp(h(i, j + 1, k), h(i + 1, j + 1, k), su), sv),
    lerp(lerp(h(i, j, k + 1), h(i + 1, j, k + 1), su), lerp(h(i, j + 1, k + 1), h(i + 1, j + 1, k + 1), su), sv),
    sw,
  );
}
const col = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ── Gestalten ──────────────────────────────────────────────────────────────
/**
 * Je Monster: o = Körperbau (humanoid), face = Kopf, headBox = Ausschnitt um den Kopf (relativ zur Kopfmitte),
 * tint(x, y, z, h) = Farbe einer Ecke; (x, y, z) in der Ruhepose, h = dieselbe Stelle relativ zur Kopfmitte.
 */
const SHAPES = {
  // Schwester Agnes: hager, wächserne Haut, Hände und Unterarme dunkel verkrustet
  hunter: {
    o: { chest: 0.9, belly: 0.82, limb: 0.86, spine: 0.016, claw: 0.05 },
    face: faceAgnes,
    headBox: [[-0.12, -0.19, -0.13], [0.12, 0.14, 0.13]],
    ribs: 0.006,
    tint: (x, y, z, h) => {
      const skin = mix(col('#9c9788'), col('#5b5247'), sstep(0.35, 0.75, noise3(x * 14, y * 14, z * 14)));
      let c = mix(skin, col('#3a3a40'), 0.35 * sstep(0.5, 0.8, noise3(x * 31 + 7, y * 31, z * 31)));
      // verkrustetes Dunkelrot von den Fingerspitzen bis zum Ellbogen
      const arm = sstep(0.5, 0.86, Math.abs(x) + (noise3(x * 40, y * 40, z * 40) - 0.5) * 0.12);
      c = mix(c, col('#2a0d0a'), arm * 0.92);
      // um Augen und Mund dunkel, im Mund fast schwarz
      const eye = Math.min(Math.hypot(h[0] - 0.031, h[1] - 0.006, h[2] - 0.075), Math.hypot(h[0] + 0.031, h[1] - 0.006, h[2] - 0.075));
      c = mix(c, col('#120a0c'), 1 - sstep(0.016, 0.036, eye));
      const mouth = Math.hypot((h[0]) / 0.03, (h[1] + 0.088) / 0.055, (h[2] - 0.07) / 0.05);
      c = mix(c, col('#1a0605'), 1 - sstep(0.8, 1.35, mouth));
      return c;
    },
  },
  // Patient 12: breiter, gebückt, grau und nass; Binde über den Augen, durchgeblutet
  listener: {
    o: { chest: 1.18, belly: 1.05, limb: 1.12, spine: 0.026, claw: 0.03, hump: true },
    face: facePatient,
    headBox: [[-0.12, -0.15, -0.13], [0.12, 0.14, 0.14]],
    ribs: 0.008,
    tint: (x, y, z, h) => {
      let c = mix(col('#7b756a'), col('#3d3833'), sstep(0.3, 0.75, noise3(x * 11, y * 11, z * 11)));
      c = mix(c, col('#4a2f33'), 0.4 * sstep(0.55, 0.85, noise3(x * 27 + 3, y * 27, z * 27)));
      const inHead = Math.abs(h[0]) < 0.13 && h[1] > -0.2 && h[1] < 0.16;
      if (inHead) {
        // Binde: schmutziges Tuch, wo die Augen wären, ist es dunkel durchgeschlagen
        const wrap = sstep(-0.002, 0.004, h[1]) * (1 - sstep(0.044, 0.05, h[1]));
        let cloth = mix(col('#a59b84'), col('#6a5c48'), sstep(0.4, 0.8, noise3(h[0] * 60, h[1] * 90, h[2] * 60)));
        const seep = Math.min(Math.hypot(h[0] - 0.032, h[1] - 0.024, h[2] - 0.095), Math.hypot(h[0] + 0.032, h[1] - 0.024, h[2] - 0.095));
        cloth = mix(cloth, col('#24080a'), 1 - sstep(0.012, 0.034, seep));
        c = mix(c, cloth, wrap);
        const mouth = Math.hypot(h[0] / 0.058, (h[1] + 0.074) / 0.034, (h[2] - 0.072) / 0.055);
        c = mix(c, col('#210505'), 1 - sstep(0.8, 1.3, mouth));
      }
      return c;
    },
  },
  // Wilhelm, der Gärtner: der Körper steckt im Mantel, der Kopf im Sack
  tracker: {
    o: { chest: 1.0, belly: 0.9, limb: 0.96, spine: 0.014, claw: 0.02 },
    face: faceSack,
    headBox: [[-0.15, -0.18, -0.15], [0.15, 0.23, 0.15]],
    ribs: 0.004,
    tint: (x, y, z, h) => {
      let c = mix(col('#4a3f33'), col('#211b15'), sstep(0.3, 0.75, noise3(x * 13, y * 13, z * 13)));
      // Erde an Händen und Unterarmen
      c = mix(c, col('#17120c'), 0.8 * sstep(0.55, 0.85, Math.abs(x)));
      const inHead = Math.abs(h[0]) < 0.16 && h[1] > -0.17 && h[1] < 0.25;
      if (inHead) {
        let sack = mix(col('#6a5a40'), col('#35291a'), sstep(0.35, 0.8, noise3(h[0] * 45, h[1] * 45, h[2] * 45)));
        // Flecken: unten feucht-dunkel, um die Augenlöcher schwarz
        sack = mix(sack, col('#241a10'), 0.75 * sstep(-0.02, -0.12, h[1] + (noise3(h[0] * 30, 0, h[2] * 30) - 0.5) * 0.06));
        const eye = Math.min(Math.hypot(h[0] - 0.037, h[1] - 0.03, h[2] - 0.098), Math.hypot(h[0] + 0.037, h[1] - 0.03, h[2] - 0.098));
        sack = mix(sack, col('#040302'), 1 - sstep(0.02, 0.036, eye));
        // zugenähter Mund: dunkle Naht mit Querstichen
        if (h[2] > 0.06 && Math.abs(h[0]) < 0.05) {
          const seam = 1 - sstep(0.003, 0.007, Math.abs(h[1] + 0.035 + h[0] * h[0] * 4));
          const stitch = (1 - sstep(0.002, 0.005, Math.abs(((h[0] + 0.5) % 0.016) - 0.008))) * (1 - sstep(0.012, 0.016, Math.abs(h[1] + 0.035)));
          sack = mix(sack, col('#0c0806'), Math.max(seam, stitch * 0.9));
        }
        c = sack;
      }
      return c;
    },
  },
  // Ein toter Patient (sitzt in der Anstalt plötzlich im Rollstuhl hinter einem — events.js): ausgezehrt, bläulich
  // blass, im fleckigen Anstaltshemd, der Mund steht offen
  corpse: {
    o: { chest: 0.92, belly: 0.8, limb: 0.85, spine: 0.014, claw: 0 },
    face: faceAgnes,
    headBox: [[-0.12, -0.19, -0.13], [0.12, 0.14, 0.13]],
    ribs: 0.005,
    tint: (x, y, z, h) => {
      let c = mix(col('#8e9396'), col('#565c62'), sstep(0.35, 0.75, noise3(x * 13, y * 13, z * 13)));
      c = mix(c, col('#3b3440'), 0.4 * sstep(0.5, 0.82, noise3(x * 29 + 5, y * 29, z * 29)));
      // Hemd: Rumpf und Oberarme
      if (y > -0.06 && y < 0.6 && Math.abs(x) < 0.34) {
        let cloth = mix(col('#8c8876'), col('#5b5648'), sstep(0.4, 0.8, noise3(x * 40, y * 60, z * 40)));
        cloth = mix(cloth, col('#2c1512'), 0.7 * sstep(0.62, 0.85, noise3(x * 9 + 2, y * 9, z * 9 + 4)));
        c = cloth;
      }
      const eye = Math.min(Math.hypot(h[0] - 0.031, h[1] - 0.006, h[2] - 0.075), Math.hypot(h[0] + 0.031, h[1] - 0.006, h[2] - 0.075));
      c = mix(c, col('#0c0a0e'), 1 - sstep(0.016, 0.036, eye));
      const mouth = Math.hypot(h[0] / 0.03, (h[1] + 0.088) / 0.055, (h[2] - 0.07) / 0.05);
      c = mix(c, col('#120606'), 1 - sstep(0.8, 1.35, mouth));
      return c;
    },
  },
  // Der Förster: nur ein Schatten (die Farbe wird nicht benutzt)
  watcher: {
    o: { chest: 0.8, belly: 0.72, limb: 0.74, spine: 0.012, claw: 0.06, foot: 0.85 },
    face: faceSkull,
    headBox: [[-0.11, -0.13, -0.13], [0.11, 0.12, 0.28]],
    ribs: 0,
    tint: () => [0, 0, 0],
  },
};

const cache = new Map();

/**
 * Baut die Geometrie eines Monsterkörpers zum Skelett eines Netzes der Gliederpuppe.
 * @param {string} kind
 * @param {THREE.SkinnedMesh} mesh   liefert Skelett und Ruhepose (boneInverses)
 * @param {(bone: THREE.Bone) => string} shortName  Knochenname ohne „DEF-“ und ohne Punkte (mit Seite L/R)
 * @param {number[]} effScale  wirksame Knochenskalierung je Knochen (Glieder werden zur Laufzeit verlängert)
 * @returns {{ geometry: THREE.BufferGeometry, headCenter: THREE.Vector3 } | null}
 */
export function organicBody(kind, mesh, shortName, effScale) {
  const shape = SHAPES[kind];
  if (!shape) return null;
  if (cache.has(kind)) return cache.get(kind);
  const bones = mesh.skeleton.bones;
  const bindPos = bones.map((_, i) => new THREE.Vector3().setFromMatrixPosition(mesh.skeleton.boneInverses[i].clone().invert()));
  const index = new Map(bones.map((b, i) => [shortName(b), i]));
  const P = (name) => {
    const i = index.get(name);
    if (i === undefined) throw new Error(`Knochen fehlt: ${name}`);
    return bindPos[i].toArray();
  };
  const headBone = index.get('head');
  const hb = bindPos[headBone];
  // Ende jedes Knochens = Anfang seines Kindknochens (Wirbelsäule bevorzugt, bei der Hand der Mittelfinger)
  const tipOf = bones.map((b) => {
    const kids = b.children.filter((c) => c.isBone && index.has(shortName(c)));
    const kid = kids.find((c) => /spine|neck|head/.test(c.name)) || (kids.length === 1 ? kids[0] : null)
      || kids.find((c) => /f_middle01/.test(c.name)) || null;
    return kid ? bindPos[index.get(shortName(kid))] : null;
  });
  // Kopfmitte: wie die aufgesetzten Teile in monsterModel.js (Kopfknochen + 10 cm)
  const HC = [hb.x, hb.y + 0.1, hb.z + 0.01];
  const prims = humanoid(P, shape.o);
  for (const p of shape.face()) {
    const moved = { ...p, bone: 'head', soft: 0.03 };
    for (const key of ['a', 'b', 'c']) if (moved[key]) moved[key] = moved[key].map((v, i) => v + HC[i]);
    if (moved.t === 'b') { moved.y0 += HC[1]; moved.y1 += HC[1]; }
    prims.push(moved);
  }
  for (const p of prims) {
    p.boneIndex = index.get(p.bone);
    if (p.boneIndex === undefined) throw new Error(`Knochen fehlt: ${p.bone}`);
  }

  // Rippen: Rillen quer über den Brustkorb, zum Brustbein hin auslaufend
  const s2y = P('spine002')[1];
  const s3y = P('spine003')[1];
  const ribs = shape.ribs
    ? (x, y, z) => {
      if (y < s2y - 0.01 || y > s3y + 0.13 || z < -0.2) return 0;
      const side = sstep(0.025, 0.07, Math.abs(x)) * sstep(s2y - 0.01, s2y + 0.03, y) * (1 - sstep(s3y + 0.08, s3y + 0.13, y));
      return -shape.ribs * Math.cos(((y - Math.abs(x) * 0.35) / 0.034) * Math.PI * 2) * side;
    }
    : null;

  const cut = HC[1] - 0.173;          // darüber: feines Kopfgitter (knapp unter dem Kinn)
  const wrist = P('handL')[0] - 0.012;  // dahinter: feine Handgitter
  const regions = [
    { min: [-wrist - 0.05, -0.97, -0.31], max: [wrist + 0.05, cut + 0.03, 0.2], cell: 0.014, post: ribs,
      clip: (x, y) => Math.abs(x) < wrist + 0.006 && y < cut + 0.004 },
    ...[1, -1].map((s) => ({
      min: [s > 0 ? wrist - 0.02 : -1.1, 0.4, -0.21], max: [s > 0 ? 1.1 : -wrist + 0.02, 0.62, 0.04], cell: 0.006,
      clip: (x) => x * s >= wrist,
    })),
    { min: shape.headBox[0].map((v, i) => v + HC[i]), max: shape.headBox[1].map((v, i) => v + HC[i]), cell: 0.006,
      clip: (x, y) => y >= cut },
  ];
  regions[3].min[1] = Math.min(regions[3].min[1], cut - 0.02);

  const positions = [];
  const normals = [];
  const colors = [];
  const skinIndex = [];
  const skinWeight = [];
  const indices = [];
  const w = new Float32Array(bones.length);
  for (const r of regions) {
    const g = rasterize(prims, r.min, r.max, r.cell, r.post);
    const net = surfaceNets(g, r.clip);
    const off = positions.length / 3;
    const e = r.cell;
    for (let i = 0; i < net.pos.length; i += 3) {
      const x = net.pos[i];
      const y = net.pos[i + 1];
      const z = net.pos[i + 2];
      // Normale = Gefälle des Feldes
      let nx = sampleField(g, x + e, y, z) - sampleField(g, x - e, y, z);
      let ny = sampleField(g, x, y + e, z) - sampleField(g, x, y - e, z);
      let nz = sampleField(g, x, y, z + e) - sampleField(g, x, y, z - e);
      const nl = Math.hypot(nx, ny, nz);
      if (nl > 1e-9) { nx /= nl; ny /= nl; nz /= nl; } else { nx = 0; ny = 1; nz = 0; }
      // Vertiefungen dunkler: wie frei ist der Raum ein Stück vor der Oberfläche?
      const reach = Math.max(0.012, e * 2.5);
      const ao = Math.min(1, Math.max(0, sampleField(g, x + nx * reach, y + ny * reach, z + nz * reach) / reach));
      const c = shape.tint(x, y, z, [x - HC[0], y - HC[1], z - HC[2]]);
      const shade = 0.3 + 0.7 * ao * ao;
      // Gewichte: jedes Teil zieht nach Nähe an der Ecke; je Knochen zählt das nächste Teil
      w.fill(0);
      for (const p of prims) {
        if (p.sub) continue;
        const d = dist(p, x, y, z);
        if (d > p.soft * 6) continue;
        const v = Math.exp(-Math.max(0, d) / p.soft);
        if (v > w[p.boneIndex]) w[p.boneIndex] = v;
      }
      const top = [];
      for (let b = 0; b < w.length; b++) if (w[b] > 0) top.push([w[b], b]);
      top.sort((p, q) => q[0] - p[0]);
      top.length = Math.min(top.length, 4);
      if (!top.length) top.push([1, headBone]);
      const sum = top.reduce((s, t) => s + t[0], 0);
      // Dicke ausgleichen: die Knochen werden zur Laufzeit skaliert (längere Glieder) — die Ecke rückt um
      // denselben Faktor an ihren Knochen heran, damit das Glied länger wird, aber nicht dicker
      let px = 0; let py = 0; let pz = 0;
      for (const [wt, b] of top) {
        const k = 1 / effScale[b];
        const a = bindPos[b];
        let qx = a.x; let qy = a.y; let qz = a.z;
        if (b !== headBone) {
          // nächster Punkt auf der Knochenachse
          const t2 = tipOf[b];
          if (t2) {
            const sx = t2.x - a.x; const sy = t2.y - a.y; const sz = t2.z - a.z;
            const l2 = sx * sx + sy * sy + sz * sz;
            const t = l2 > 1e-9 ? Math.min(1, Math.max(0, ((x - a.x) * sx + (y - a.y) * sy + (z - a.z) * sz) / l2)) : 0;
            qx += sx * t; qy += sy * t; qz += sz * t;
          }
        }
        px += (qx + (x - qx) * k) * (wt / sum);
        py += (qy + (y - qy) * k) * (wt / sum);
        pz += (qz + (z - qz) * k) * (wt / sum);
      }
      positions.push(px, py, pz);
      normals.push(nx, ny, nz);
      colors.push(c[0] * shade, c[1] * shade, c[2] * shade);
      for (let n = 0; n < 4; n++) {
        skinIndex.push(top[n] ? top[n][1] : 0);
        skinWeight.push(top[n] ? top[n][0] / sum : 0);
      }
    }
    // Dreiecke nach außen drehen (Flächennormale mit dem Gefälle vergleichen)
    for (let i = 0; i < net.idx.length; i += 3) {
      const a = net.idx[i] * 3; const b = net.idx[i + 1] * 3; const c = net.idx[i + 2] * 3;
      const p = net.pos;
      const ux = p[b] - p[a]; const uy = p[b + 1] - p[a + 1]; const uz = p[b + 2] - p[a + 2];
      const vx = p[c] - p[a]; const vy = p[c + 1] - p[a + 1]; const vz = p[c + 2] - p[a + 2];
      const fx = uy * vz - uz * vy; const fy = uz * vx - ux * vz; const fz = ux * vy - uy * vx;
      const na = (off + net.idx[i]) * 3;
      const outward = fx * normals[na] + fy * normals[na + 1] + fz * normals[na + 2] >= 0;
      if (outward) indices.push(off + net.idx[i], off + net.idx[i + 1], off + net.idx[i + 2]);
      else indices.push(off + net.idx[i], off + net.idx[i + 2], off + net.idx[i + 1]);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  const out = { geometry, headCenter: new THREE.Vector3(...HC) };
  cache.set(kind, out);
  return out;
}
