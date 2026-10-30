// planetWorld.js — Bausteine des BRB-Planeten (planetScene.js): Maße, Lage auf der Kugel, Grundstücke.
//
// Der Planet ist eine Kugel (Radius R) mit der Straße auf dem Äquator um die x-Achse. Der Streamer
// steht oben (Welt 0,0,0) und läuft Richtung −z; die Kugel dreht sich unter ihm. Lage auf der
// Oberfläche: Bahnwinkel a (vorwärts entlang der Straße) und seitlicher Abstand lat (m, + = rechts).
//
// Grundstücke liegen links und rechts der Straße in festen Plätzen („Slots“). Jedes Grundstück ist
// lokal flach gebaut: +x zeigt zur Straße, z entlang der Straße. Die Kugelwölbung zieht jedes Teil um
// (Abstand²)/(2R) nach unten, damit Zaun und Laterne nicht über dem Boden schweben.
//
// Fast alles wird je Grundstück zu wenigen Meshes zusammengefasst (Farben stecken in den Ecken),
// sonst wären es bei 50 Grundstücken weit über tausend Zeichenaufrufe.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { canvasTexture, rng, fitText, FONT, spacing } from './sceneKit';

export const R = 40;
export const ROAD_HALF = 2.6;
export const WALK_OUT = 4.0;               // Gehweg reicht bis hier
export const WALK_H = 0.14;                // Gehweg-Höhe über dem Rasen
export const SLOTS_PER_SIDE = 25;
export const SLOT_ANGLE = (Math.PI * 2) / SLOTS_PER_SIDE;
export const PLOT_HALF = 4.5;
export const PLOT_LAT = WALK_OUT + 0.35 + PLOT_HALF;
/** Platz der Figur am Gartentor (Grundstück-lokal). */
export const GATE_X = PLOT_HALF - 0.75;

const X = new THREE.Vector3(1, 0, 0);
const Z = new THREE.Vector3(0, 0, 1);
const _q = new THREE.Quaternion();

/** Objekt auf die Oberfläche setzen (Planet-Koordinaten, Kugelmitte im Ursprung). */
export function surfacePose(obj, a, lat, h = 0) {
  const b = lat / R;
  obj.position.set(Math.sin(b), Math.cos(b) * Math.cos(a), -Math.cos(b) * Math.sin(a)).multiplyScalar(R + h);
  obj.quaternion.setFromAxisAngle(X, -a).multiply(_q.setFromAxisAngle(Z, -b));
}

/** Streifen auf der Kugel zwischen zwei seitlichen Abständen (Straße, Gehweg). u läuft entlang der Straße. */
export function bandGeometry(lat0, lat1, h, { segs = 400, across = 4, tileLen = 8 } = {}) {
  const pos = [], nor = [], uv = [], idx = [];
  const tiles = Math.max(1, Math.round((Math.PI * 2 * R) / tileLen));
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    for (let j = 0; j <= across; j++) {
      const lat = lat0 + ((lat1 - lat0) * j) / across;
      const b = lat / R;
      const n = [Math.sin(b), Math.cos(b) * Math.cos(a), -Math.cos(b) * Math.sin(a)];
      pos.push(n[0] * (R + h), n[1] * (R + h), n[2] * (R + h));
      nor.push(...n);
      uv.push((i / segs) * tiles, j / across);
    }
  }
  const row = across + 1;
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < across; j++) {
      const p = i * row + j;
      idx.push(p, p + 1, p + row, p + 1, p + row + 1, p + row);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Senkrechte Kante (Bordstein) bei seitlichem Abstand lat, von Höhe h0 bis h1. Zeigt nach `face` (±1). */
export function curbGeometry(lat, h0, h1, face, segs = 400) {
  const pos = [], nor = [], idx = [];
  const b = lat / R;
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    const n = [Math.sin(b), Math.cos(b) * Math.cos(a), -Math.cos(b) * Math.sin(a)];
    // Normale seitlich: Ableitung nach b, zeigt Richtung face
    const s = [Math.cos(b) * face, -Math.sin(b) * Math.cos(a) * face, Math.sin(b) * Math.sin(a) * face];
    for (const h of [h0, h1]) { pos.push(n[0] * (R + h), n[1] * (R + h), n[2] * (R + h)); nor.push(...s); }
  }
  for (let i = 0; i < segs; i++) {
    const p = i * 2;
    if (face > 0) idx.push(p, p + 2, p + 1, p + 1, p + 2, p + 3);
    else idx.push(p, p + 1, p + 2, p + 1, p + 3, p + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

// ── Farbiger Bausatz: viele Teile → ein Mesh ───────────────────────────────
const _m = new THREE.Matrix4();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
  cyl6: new THREE.CylinderGeometry(0.5, 0.5, 1, 6),
  cone: new THREE.ConeGeometry(0.5, 1, 7),
  ball: new THREE.IcosahedronGeometry(0.5, 0),
  ball1: new THREE.IcosahedronGeometry(0.5, 1),
};

export class Paint {
  constructor() { this.parts = []; }
  /**
   * Teil hinzufügen. geo: Schlüssel aus GEO oder eigene Geometrie; Maße über s (Skalierung).
   * sink: um die Kugelwölbung absenken (Standard an).
   */
  add(geo, color, x, y, z, s = [1, 1, 1], r = [0, 0, 0], sink = true) {
    const src = typeof geo === 'string' ? GEO[geo] : geo;
    const g = (src.index ? src.toNonIndexed() : src.clone());
    g.deleteAttribute('uv');
    const yy = sink ? y - (x * x + z * z) / (2 * R) : y;
    _m.compose(_p.set(x, yy, z), _q.setFromEuler(_e.set(r[0], r[1], r[2])), _s.set(s[0], s[1], s[2]));
    g.applyMatrix4(_m);
    _c.set(color);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.parts.push(g);
    return this;
  }
  get empty() { return this.parts.length === 0; }
  mesh(material, { cast = true, receive = true } = {}) {
    if (!this.parts.length) return null;
    const g = mergeGeometries(this.parts, false);
    for (const p of this.parts) p.dispose();
    this.parts = [];
    const m = new THREE.Mesh(g, material);
    m.castShadow = cast;
    m.receiveShadow = receive;
    return m;
  }
}

/** Gemeinsames Material für alle farbigen Teile (Low-Poly, passend zu den Comic-Figuren). */
export function paintMaterial() {
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0, flatShading: true });
}

// ── Farben ──────────────────────────────────────────────────────────────────
const WALLS = ['#efe3cc', '#d6e4ea', '#f2d3bb', '#cfe0c4', '#ecc9c4', '#dcd3ea', '#f3e7b4', '#e4d9cf', '#c9dcdc'];
const ROOFS = ['#a5503d', '#4f5f72', '#6e4c3b', '#3f5446', '#7d3c4c', '#5b4a6b', '#8a6a3a'];
const DOORS = ['#6b3f2a', '#2f4a63', '#7a2f2f', '#2f5a3f', '#4a3a5a', '#c58a2c'];
const TRIM = '#f6f2ea';
const STONE = '#a7a29a';
const WOOD = '#8a6544';
const LEAF = ['#5e9a46', '#4f8a3c', '#6aa84e', '#78b05a', '#4a7f3a'];
const PINE = ['#2f5b3c', '#2a5236', '#36653f'];
const FLOWER = ['#ff6a8a', '#ffd34d', '#ffffff', '#c58bff', '#ff8f4d', '#ff4d5e'];

/** Laubbaum: Stamm + drei Kronen-Kugeln. */
export function roundTree(p, x, z, k, r) {
  p.add('cyl6', '#6e4d34', x, 0.8 * k, z, [0.3 * k, 1.6 * k, 0.3 * k]);
  const leaf = LEAF[Math.floor(r() * LEAF.length)];
  const leaf2 = LEAF[Math.floor(r() * LEAF.length)];
  p.add('ball', leaf, x, 2.3 * k, z, [2.1 * k, 1.8 * k, 2.1 * k], [r(), r(), r()]);
  p.add('ball', leaf2, x + 0.45 * k, 2.85 * k, z - 0.2 * k, [1.5 * k, 1.3 * k, 1.5 * k], [r(), r(), r()]);
  p.add('ball', leaf, x - 0.35 * k, 3.15 * k, z + 0.25 * k, [1.2 * k, 1.1 * k, 1.2 * k], [r(), r(), r()]);
}

/** Tanne mit Schnee auf jeder Stufe (Winter). */
export function snowPine(p, x, z, k, r) {
  p.add('cyl6', '#5a3f2c', x, 0.4 * k, z, [0.28 * k, 0.8 * k, 0.28 * k]);
  const g = PINE[Math.floor(r() * PINE.length)];
  const tiers = [[2.4, 1.5, 1.2], [1.9, 1.3, 2.0], [1.3, 1.1, 2.7]];
  for (const [w, h, y] of tiers) {
    const rot = [0, r() * 3, 0];
    p.add('cone', g, x, y * k, z, [w * k, h * k, w * k], rot);
    p.add('cone', '#f4f8ff', x, (y + h * 0.28) * k, z, [w * 0.62 * k, h * 0.48 * k, w * 0.62 * k], rot);
  }
}

/** Schneemann mit Karottennase und Hut. */
function snowman(p, x, z, tc) {
  p.add('ball1', '#f7fbff', x, 0.42, z, [0.85, 0.8, 0.85]);
  p.add('ball1', '#f7fbff', x, 1.0, z, [0.62, 0.6, 0.62]);
  p.add('ball1', '#f7fbff', x, 1.45, z, [0.44, 0.44, 0.44]);
  p.add('cone', '#ff8a2a', x + 0.16, 1.46, z + 0.1 * tc, [0.07, 0.3, 0.07], [0, 0, -Math.PI / 2]);
  p.add('cyl', '#1d1d22', x, 1.72, z, [0.36, 0.06, 0.36]);
  p.add('cyl', '#1d1d22', x, 1.85, z, [0.24, 0.26, 0.24]);
  p.add('box', '#c8303a', x, 1.24, z, [0.5, 0.08, 0.5]);
}

// ── Schilder ────────────────────────────────────────────────────────────────
/** Namensschild eines Grundstücks: helles Brett, Farbstreifen in Chatfarbe. */
export function nameSignTexture(name, color) {
  return canvasTexture(512, 160, (ctx, w, h) => {
    ctx.fillStyle = '#f4ecdc';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = color || '#9b9b9b';
    ctx.fillRect(0, 0, 22, h);
    ctx.strokeStyle = '#5b4632';
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, w - 8, h - 8);
    ctx.fillStyle = '#2a211a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let size = 74;
    ctx.font = `800 ${size}px ${FONT}`;
    while (size > 34 && ctx.measureText(name).width > w - 80) { size -= 4; ctx.font = `800 ${size}px ${FONT}`; }
    ctx.fillText(fitText(ctx, name, w - 70), w / 2 + 10, h / 2 + 4);
  });
}

/** „FREI“-Schild für leere Grundstücke (eine Textur für alle). */
export function freeSignTexture() {
  return canvasTexture(512, 160, (ctx, w, h) => {
    ctx.fillStyle = '#2f6b3f';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#f4ecdc';
    ctx.lineWidth = 6;
    ctx.strokeRect(10, 10, w - 20, h - 20);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 70px ${FONT}`;
    spacing(ctx, 6);
    ctx.fillText('FREI', w / 2, 62);
    spacing(ctx, 0);
    ctx.font = `700 32px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText('Schreib im Chat!', w / 2, 118);
  });
}

// ── Grundstück ──────────────────────────────────────────────────────────────
/**
 * Inhalt eines Grundstücks bauen (Grundstück-lokal: +x zur Straße, z entlang der Straße).
 * tc: +1, wenn lokal +z zur Kamera zeigt (linke Seite), sonst −1 (Schilder drehen sich zur Kamera).
 * Liefert Meshes je Gruppe: base (immer), day, winter (je Thema sichtbar), glass (Fenster) und
 * Plätze für Halloween-Modelle, Lichterketten und das Schild.
 */
export function buildPlot({ seed, tc, owned, paintMat, glassMat, lamp = true }) {
  const r = rng(seed);
  const base = new Paint();
  const day = new Paint();
  const winter = new Paint();
  const glass = new Paint();
  const out = { meshes: {}, hw: [], lights: [], sign: null, door: null };

  // Laterne am Gehweg (an der Grenze zum Nachbarn), Arm über die Straße
  const lx = PLOT_LAT - 3.7;
  const lz = -PLOT_HALF;
  if (lamp) {
    base.add('cyl', '#2b3431', lx, 2.1 + WALK_H, lz, [0.16, 4.2, 0.16]);
    base.add('cyl', '#2b3431', lx, 0.2 + WALK_H, lz, [0.3, 0.4, 0.3]);
    base.add('box', '#2b3431', lx + 0.45, 4.2 + WALK_H, lz, [0.95, 0.07, 0.07]);
    base.add('box', '#2b3431', lx + 0.85, 4.12 + WALK_H, lz, [0.5, 0.16, 0.36]);
    out.lamp = new THREE.Vector3(lx + 0.85, 4.0 + WALK_H - (lx * lx + lz * lz) / (2 * R), lz);
  }

  // Hecken an den Seiten (nach hinten, nicht bis zum Gehweg)
  for (const sz of [-1, 1]) {
    base.add('box', '#4c7d3d', -1.2, 0.35, sz * (PLOT_HALF - 0.3), [6.4, 0.75, 0.5]);
  }

  if (owned) {
    // ── Haus ──
    const W = 4.2 + r() * 1.1;        // entlang der Straße
    const D = 3.5 + r() * 0.7;        // Tiefe
    const H = 2.45 + r() * 0.45;
    const rh = 1.3 + r() * 0.5;       // Dachhöhe
    const cx = -1.3;
    const front = cx + D / 2;
    const wall = WALLS[Math.floor(r() * WALLS.length)];
    const roof = ROOFS[Math.floor(r() * ROOFS.length)];
    const door = DOORS[Math.floor(r() * DOORS.length)];
    base.add('box', wall, cx, (H + 0.5) / 2 - 0.5, 0, [D, H + 0.5, W]);
    base.add('box', '#8d877e', cx, 0.12, 0, [D + 0.12, 0.34, W + 0.12]);
    // Giebel (Dreiecke an beiden Enden)
    const tri = new THREE.Shape();
    tri.moveTo(-D / 2, 0); tri.lineTo(D / 2, 0); tri.lineTo(0, rh); tri.closePath();
    const gable = new THREE.ExtrudeGeometry(tri, { depth: W, bevelEnabled: false });
    gable.translate(0, 0, -W / 2);
    base.add(gable, wall, cx, H, 0);
    gable.dispose();
    // Dachflächen mit Überstand
    const over = 0.35;
    const run = D / 2 + over;
    const drop = rh * (over / (D / 2));
    const L = Math.hypot(run, rh + drop);
    const ang = Math.atan2(rh + drop, run);
    for (const s of [1, -1]) {
      const mx = cx + (s * run) / 2;
      const my = H + rh - (rh + drop) / 2 + 0.08;
      base.add('box', roof, mx, my, 0, [L, 0.16, W + 0.6], [0, 0, -s * ang]);
      // Schnee auf dem Dach (Winter)
      winter.add('box', '#f6f9ff', mx + s * Math.sin(ang) * 0.13, my + Math.cos(ang) * 0.13, 0, [L * 0.98, 0.13, W + 0.64], [0, 0, -s * ang]);
    }
    base.add('box', roof, cx, H + rh + 0.08, 0, [0.22, 0.14, W + 0.62]);   // First
    // Schornstein
    const chz = (r() < 0.5 ? -1 : 1) * W * 0.25;
    base.add('box', '#8c4a3c', cx - D / 4, H + rh * 0.75, chz, [0.5, 1.5, 0.5]);
    base.add('box', '#5d3029', cx - D / 4, H + rh * 0.75 + 0.78, chz, [0.6, 0.1, 0.6]);
    winter.add('box', '#f6f9ff', cx - D / 4, H + rh * 0.75 + 0.87, chz, [0.58, 0.1, 0.58]);
    out.chimney = new THREE.Vector3(cx - D / 4, H + rh * 0.75 + 0.9 - (cx * cx) / (2 * R), chz);
    // Tür, Stufe, Vordach
    base.add('box', TRIM, front + 0.02, 1.0, 0, [0.06, 2.12, 1.18]);
    base.add('box', door, front + 0.05, 0.98, 0, [0.06, 1.96, 0.96]);
    base.add('box', '#d9b44a', front + 0.1, 0.98, 0.3, [0.05, 0.08, 0.08]);
    base.add('box', STONE, front + 0.35, 0.06, 0, [0.7, 0.2, 1.5]);
    base.add('box', roof, front + 0.38, 2.28, 0, [0.8, 0.08, 1.6]);
    out.door = new THREE.Vector3(front + 0.4, 0, 0);
    // Fenster: vorn zwei, an den Giebelseiten je eins
    const win = (x, y, z, alongZ) => {
      const sx = alongZ ? 0.06 : 1.18, sz = alongZ ? 1.18 : 0.06;
      base.add('box', TRIM, x, y, z, [sx, 1.14, sz]);
      const gx = alongZ ? 0.05 : 0.96, gz = alongZ ? 0.96 : 0.05;
      const dx = alongZ ? 0.03 : 0, dz = alongZ ? 0 : (z > 0 ? 0.03 : -0.03);
      glass.add('box', '#ffffff', x + dx, y, z + dz, [gx, 0.94, gz]);
      base.add('box', TRIM, x + dx * 1.6, y, z + dz * 1.6, alongZ ? [0.03, 0.94, 0.07] : [0.07, 0.94, 0.03]);
      base.add('box', TRIM, x + dx * 1.6, y, z + dz * 1.6, alongZ ? [0.03, 0.07, 0.94] : [0.94, 0.07, 0.03]);
    };
    for (const s of [-1, 1]) win(front + 0.01, 1.5, s * (W / 2 - 0.85), true);
    for (const s of [-1, 1]) win(cx, 1.5, s * (W / 2 + 0.01), false);
    // Lichterkette an der Traufe vorn (Winter): Plätze sammeln
    for (let z = -W / 2 - 0.2; z <= W / 2 + 0.21; z += 0.42) {
      const x = front + over - 0.05;
      out.lights.push(new THREE.Vector3(x, H - 0.12 - (x * x + z * z) / (2 * R), z));
    }
    // Plattenweg von der Tür zum Tor
    for (let x = front + 0.95; x < GATE_X + 0.4; x += 0.62) base.add('cyl', '#b8b2a6', x, 0.02, (r() - 0.5) * 0.12, [0.62, 0.05, 0.62]);
    // Blumenbeete vor dem Haus (Sommer)
    for (const s of [-1, 1]) {
      const bz = s * (0.6 + (W / 2 - 0.6) / 2);
      const bl = W / 2 - 0.9;
      day.add('box', '#5a3f2c', front + 0.5, 0.06, bz, [0.6, 0.14, bl]);
      for (let i = 0; i < 6; i++) {
        day.add('ball', FLOWER[Math.floor(r() * FLOWER.length)], front + 0.35 + r() * 0.3, 0.22, bz + (r() - 0.5) * bl * 0.9, [0.16, 0.16, 0.16]);
      }
    }
    // Garten: Baum hinten, Busch
    const tz = (r() < 0.5 ? -1 : 1) * (W / 2 + 0.9);
    roundTree(day, -3.3, tz, 0.8 + r() * 0.25, r);
    snowPine(winter, -3.3, tz, 0.85 + r() * 0.2, r);
    day.add('ball', LEAF[1], front + 0.2, 0.35, -tz * 0.62, [0.9, 0.7, 0.9]);
    if (r() < 0.6) snowman(winter, 2.2, -tc * 2.6, tc);
    // Halloween: Kürbisse am Tor, Grabstein im Garten
    // vor dem Zaun (dahinter verdecken ihn die Latten) und auf den Torpfosten
    out.hw.push(['pumpkin_orange_jackolantern', PLOT_HALF + 0.25, tc * 1.3, 0.6, Math.PI / 2 - tc * 0.4]);
    out.hw.push(['pumpkin_yellow_small', PLOT_HALF + 0.3, tc * 1.9, 0.3, 0.6]);
    out.hw.push(['pumpkin_yellow_jackolantern', PLOT_HALF - 0.2, -0.78, 0.36, Math.PI / 2, 1.1]);
    out.hw.push(['pumpkin_orange_jackolantern', PLOT_HALF - 0.2, 0.78, 0.36, Math.PI / 2, 1.1]);
    if (r() < 0.5) out.hw.push(['gravestone', 1.6, -tc * 3.0, 0.9, Math.PI / 2]);
    out.hw.push(['tree_dead_medium', -3.3, tz, 3.4, r() * 3]);
  } else {
    // ── leeres Grundstück: Bäume, Büsche, Bank ──
    const n = 2 + Math.floor(r() * 2);
    for (let i = 0; i < n; i++) {
      const x = -3.2 + r() * 4.2, z = (r() - 0.5) * 6.4;
      const k = 0.75 + r() * 0.45;
      roundTree(day, x, z, k, r);
      snowPine(winter, x, z, k * 1.05, r);
      out.hw.push([r() < 0.5 ? 'tree_dead_medium' : 'tree_dead_large_decorated', x, z, 3.2 + r() * 1.4, r() * 3]);
    }
    for (let i = 0; i < 3; i++) day.add('ball', LEAF[Math.floor(r() * LEAF.length)], -1 + r() * 4, 0.3, (r() - 0.5) * 7, [0.8, 0.6, 0.8], [r(), r(), r()]);
    if (r() < 0.5) {
      // Gartenbank zur Straße
      base.add('box', WOOD, 1.6, 0.45, -tc * 2.2, [0.45, 0.06, 1.5]);
      base.add('box', WOOD, 1.38, 0.72, -tc * 2.2, [0.06, 0.45, 1.5]);
      for (const s of [-1, 1]) base.add('box', '#3a3a3a', 1.6, 0.22, -tc * 2.2 + s * 0.6, [0.4, 0.44, 0.06]);
    } else if (r() < 0.6) snowman(winter, 1.4, -tc * 2.2, tc);
    out.hw.push(['grave_A', 0.4, -tc * 1.5, 1.1, Math.PI / 2]);
    out.hw.push(['pumpkin_orange_jackolantern', PLOT_HALF + 0.25, tc * 1.6, 0.5, Math.PI / 2]);
    if (r() < 0.6) out.hw.push(['pumpkin_orange', 2.6, tc * 2.2, 0.4, r() * 3]);
  }

  // Gartenzaun vorn mit Tor-Lücke
  const fx = PLOT_HALF - 0.2;
  for (let z = -PLOT_HALF + 0.15; z <= PLOT_HALF - 0.1; z += 0.32) {
    if (Math.abs(z) < 0.72) continue;
    base.add('box', TRIM, fx, 0.42, z, [0.06, 0.84, 0.11]);
  }
  for (const s of [-1, 1]) {
    const zc = s * (0.72 + (PLOT_HALF - 0.72) / 2);
    const len = PLOT_HALF - 0.72;
    base.add('box', TRIM, fx - 0.05, 0.6, zc, [0.04, 0.07, len]);
    base.add('box', TRIM, fx - 0.05, 0.28, zc, [0.04, 0.07, len]);
    base.add('box', TRIM, fx, 0.55, s * 0.78, [0.14, 1.1, 0.14]);
  }

  // Schild neben dem Tor, zur Kamera gedreht
  const sz = -tc * 2.4;
  const sx = GATE_X - 0.4;
  for (const s of [-1, 1]) base.add('box', WOOD, sx + s * 0.55, 0.7, sz, [0.08, 1.4, 0.08]);
  base.add('box', '#6d5038', sx, 1.2, sz - tc * 0.02, [1.42, 0.48, 0.04]);
  out.sign = { x: sx, y: 1.2 - (sx * sx + sz * sz) / (2 * R), z: sz + tc * 0.006, yaw: tc > 0 ? 0 : Math.PI };

  out.meshes.base = base.mesh(paintMat);
  out.meshes.day = day.mesh(paintMat);
  out.meshes.winter = winter.mesh(paintMat);
  out.meshes.glass = glass.mesh(glassMat, { cast: false });
  return out;
}

// ── Wolkenschrift ───────────────────────────────────────────────────────────
/**
 * Punkte, die einen Text als Wolken nachbilden. lines: Zeilen, width: Breite in Metern.
 * Liefert [{x, y, r}] um (0,0) zentriert (y nach oben).
 */
export function cloudTextPoints(lines, width, { step = 1.15, seed = 3 } = {}) {
  const c = document.createElement('canvas');
  const fontPx = 160;
  const lineH = fontPx * 1.05;
  c.width = 2400;
  c.height = Math.ceil(lineH * lines.length + 40);
  const ctx = c.getContext('2d');
  ctx.font = `800 ${fontPx}px ${FONT}`;
  spacing(ctx, 30);
  const wMax = Math.max(...lines.map((l) => ctx.measureText(l).width));
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((l, i) => ctx.fillText(l, c.width / 2, 20 + lineH * (i + 0.5)));
  const img = ctx.getImageData(0, 0, c.width, c.height).data;
  const k = width / wMax;                   // Meter je Pixel
  const px = Math.max(2, Math.round(step / k));
  const r = rng(seed);
  const pts = [];
  for (let y = 0; y < c.height; y += px) {
    for (let x = 0; x < c.width; x += px) {
      if (img[(y * c.width + x) * 4 + 3] < 140) continue;
      pts.push({
        x: (x - c.width / 2) * k + (r() - 0.5) * step * 0.5,
        y: (c.height / 2 - y) * k + (r() - 0.5) * step * 0.5,
        r: step * (0.55 + r() * 0.3),
      });
    }
  }
  return pts;
}
