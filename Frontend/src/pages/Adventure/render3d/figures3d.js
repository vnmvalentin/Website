// render3d/figures3d.js — lädt die Figuren der 3D-Ansicht: fertig gerechnete Standbilder aus public/media/av3d
// (KayKit-Figuren von Kay Lousberg, CC0 — erzeugt von tools/bakeFigures.mjs, Dateiformat steht dort).
//
// Jede Figur besteht aus acht Schritten einer Gangart und der stehenden Figur, je ein starrer Körper. Starre Körper
// lassen sich zu Hunderten in einem Aufruf zeichnen (Instanzen); jede Figur im Bild gehört in jedem Moment zu genau
// einem Animationsbild, und der Zeichner sortiert sie pro Bild in den passenden Topf (scene3d.js).
//
// Körperhöhe 1, Füße bei y = 0, Blick nach +z. Farben stecken als Punktfarben im Körper (keine Texturen).

import * as THREE from "three";

const BASE = "/media/av3d";
const cache = new Map();

// Liefert { name, walk: [Körper je Schritt], idle: Körper, tris, duration (Sekunden für einen Durchlauf der Schritte) }
// Name mit Zusatz „~grau“ (z. B. "drache~grau"): dieselbe Datei, Farben entfärbt — dann lässt sich die Figur mit `tint`
// in jede Farbe tönen (die Färbung multipliziert nur: ein oranger Drache wird sonst nie eisblau).
export function loadFigure(name) {
  if (!cache.has(name)) cache.set(name, build(name));
  return cache.get(name);
}

const linear = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };

async function build(name) {
  const [file, variant] = name.split("~");
  const res = await fetch(`${BASE}/${file}.bin`);
  if (!res.ok) throw new Error(`Figur ${name} fehlt (${res.status})`);
  const buf = await res.arrayBuffer();
  const view = new DataView(buf);
  if (String.fromCharCode(...new Uint8Array(buf, 0, 4)) !== "AVF1") throw new Error(`Figur ${name}: unbekanntes Format`);
  const metaLen = view.getUint32(4, true);
  const meta = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, metaLen)));
  const { verts, tris, box, walkFrames } = meta;
  let p = 8 + metaLen;

  // Farben und Dreiecke sind für alle Bilder gleich
  const frames = walkFrames + 1;
  const colorAt = p + frames * verts * 6, indexAt = colorAt + Math.ceil((verts * 3) / 4) * 4;
  const srgb = new Uint8Array(buf, colorAt, verts * 3);
  const color = new Float32Array(verts * 3);
  for (let i = 0; i < color.length; i++) color[i] = linear(srgb[i]);
  if (variant === "grau") {
    for (let i = 0; i < color.length; i += 3) {
      const l = 0.2126 * color[i] + 0.7152 * color[i + 1] + 0.0722 * color[i + 2];
      color[i] = color[i + 1] = color[i + 2] = l;
    }
  }
  const colorAttr = new THREE.BufferAttribute(color, 3);
  const indexAttr = new THREE.BufferAttribute(new Uint16Array(buf, indexAt, tris * 3), 1);

  // Ecken am selben Ort (sie unterscheiden sich nur in der Farbe) bekommen eine gemeinsame Normale. Sonst reißt die
  // Kontur an jeder Farbgrenze auf — sie bläst den Körper entlang der Normalen auf.
  const idleQ = new Uint16Array(buf, p + walkFrames * verts * 6, verts * 3);
  const group = new Uint32Array(verts);
  const spots = new Map();
  for (let i = 0; i < verts; i++) {
    const key = idleQ[i * 3] * 4294967296 + idleQ[i * 3 + 1] * 65536 + idleQ[i * 3 + 2];
    let id = spots.get(key);
    if (id === undefined) { id = spots.size; spots.set(key, id); }
    group[i] = id;
  }
  const sum = new Float32Array(spots.size * 3);

  const size = [box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]];
  const geos = [];
  for (let f = 0; f < frames; f++) {
    const q = new Uint16Array(buf, p, verts * 3);
    const pos = new Float32Array(verts * 3);
    for (let i = 0; i < pos.length; i++) pos[i] = box.min[i % 3] + (q[i] / 32767) * size[i % 3];
    p += verts * 6;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", colorAttr);
    g.setIndex(indexAttr);
    g.computeVertexNormals();
    const n = g.attributes.normal.array;
    sum.fill(0);
    for (let i = 0; i < verts; i++) for (let a = 0; a < 3; a++) sum[group[i] * 3 + a] += n[i * 3 + a];
    for (let i = 0; i < verts; i++) {
      const o = group[i] * 3, len = Math.hypot(sum[o], sum[o + 1], sum[o + 2]) || 1;
      n[i * 3] = sum[o] / len; n[i * 3 + 1] = sum[o + 1] / len; n[i * 3 + 2] = sum[o + 2] / len;
    }
    g.computeBoundingSphere();
    geos.push(g);
  }
  return { name, walk: geos.slice(0, walkFrames), idle: geos[walkFrames], tris, duration: meta.duration };
}
