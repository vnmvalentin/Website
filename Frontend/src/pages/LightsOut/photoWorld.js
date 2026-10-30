// photoWorld.js — Fotolook für Lights Out: Tannen-Kronen aus gerenderten Scans und Requisiten
// (Poly-Haven-Modelle) in Sackgassen. Alles lädt nachträglich: bis dahin bleiben die gemalten
// Texturen bzw. leeren Plätze — schlägt ein Download fehl, sieht man einfach die alte Welt.
//
// Tannen: die Poly-Haven-Fichte "fir_tree_01" hat roh 478 MB Geometrie (Nadelkarten). Vereinfacht
// verlor sie fast alle Nadeln, deshalb liegen ihre drei Varianten als Bilder vor (Vorder- und
// Seitenansicht nebeneinander, 1024×1024, aus dem vollen Scan gerendert): public/media/cr3d/impostor.
import * as THREE from 'three';
import { MEDIA } from '../ClashRoyale/modes/scene3d/kit';

/**
 * Maße der Tannenbilder in Metern (Bildbreite/-höhe, Abstand Bildunterkante → Boden) und Kronenansatz
 * als Anteil der Bildhöhe: darunter ist nur Stamm — den zeigt der 3D-Stamm, die Ebene beginnt erst dort
 * (große, fast leere Alpha-Flächen auf Augenhöhe kosteten sonst viel Füllarbeit).
 */
export const FIRS = [
  { file: 'fir_0', w: 9.65, h: 19.3, base: 0.19, crown: 0.3 },
  { file: 'fir_1', w: 7.17, h: 14.34, base: 0.14, crown: 0.28 },
  { file: 'fir_2', w: 7.41, h: 14.81, base: 0.15, crown: 0.38 },
];

/** Zwei senkrechte Ebenen über Kreuz; Ebene 1 zeigt die linke Bildhälfte (vorn), Ebene 2 die rechte (Seite). */
export function firCrownGeometry(info, scale) {
  const w = info.w * scale;
  const h = info.h * scale * (1 - info.crown);
  const y0 = (info.h * info.crown - info.base) * scale;
  const parts = [0, 1].map((k) => {
    const p = new THREE.PlaneGeometry(w, h);
    const uv = p.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.5 + k * 0.5, info.crown + uv.getY(i) * (1 - info.crown));
    p.translate(0, y0 + h / 2, 0);
    p.rotateY(k * Math.PI / 2);
    return p;
  });
  const g = new THREE.BufferGeometry();
  const pos = [];
  const nor = [];
  const uvs = [];
  const idx = [];
  let off = 0;
  for (const p of parts) {
    pos.push(...p.attributes.position.array);
    nor.push(...p.attributes.normal.array);
    uvs.push(...p.attributes.uv.array);
    idx.push(...Array.from(p.index.array, (i) => i + off));
    off += p.attributes.position.count;
    p.dispose();
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  return g;
}

/** Tannenbild laden und auf das Material legen (bis dahin bleibt die gemalte Krone). */
export function loadFirTexture(material, info, keep) {
  new THREE.TextureLoader().load(`${MEDIA}/impostor/${info.file}.webp`, (t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    keep(t);
    material.map = t;
    material.needsUpdate = true;
  }, undefined, () => { /* Ersatz: gemalte Krone bleibt */ });
}

// ── Requisiten an Wänden ───────────────────────────────────────────────────
// h: Zielhöhe (m), tint: Farbe abdunkeln/umfärben (multipliziert).
// Die längere Grundseite liegt an der Wand. Tiefe in Sackgassen höchstens 0,9 m,
// in geraden Gängen 0,6 m — so bleibt die Mitte der Kachel frei (dort laufen Spieler und Monster).
const PROPS = {
  halls: [
    { id: 'old_bed_frame', h: 0.85 },
    { id: 'wheelchair_01', h: 0.95 },
    { id: 'drawer_cabinet', h: 1.15 },
    { id: 'tool_cart', h: 0.9 },
    { id: 'wheelchair_01', h: 0.95 },
    { id: 'metal_trash_can', h: 0.75 },
    { id: 'old_bed_frame', h: 0.85 },
    { id: 'metal_stool_01', h: 0.55 },
    { id: 'medical_box', h: 0.35 },
  ],
  cellar: [
    { id: 'barrel_03', h: 0.95, tint: 0x5a5e52 },
    { id: 'wooden_crate_02', h: 0.7 },
    { id: 'worn_metal_rack', h: 1.9 },
    { id: 'barrel_03', h: 0.95, tint: 0x6a4a38 },
    { id: 'wooden_bucket_01', h: 0.4 },
    { id: 'wooden_crate_02', h: 0.9 },
  ],
};

/**
 * Stellt Requisiten an Wände (Plätze aus propSpots).
 * @param {{ scene: THREE.Scene, assets: any, kind: 'halls'|'cellar', spots: { cell: number[], back: number[], maxDepth: number }[],
 *           S: number, addProp: (cx:number, cz:number, hx:number, hz:number)=>void, rng: ()=>number }} p
 */
export function placeRoomProps({ scene, assets, kind, spots, S, addProp, rng }) {
  const list = PROPS[kind];
  if (!list) return;
  spots.forEach(({ cell, back, maxDepth }, i) => {
    const spec = list[i % list.length];
    const tint = spec.tint ? new THREE.Color(spec.tint) : null;
    const holder = assets.model(spec.id, spec.h, tint ? { tweak: (m) => m.color.multiply(tint) } : {});
    const g = new THREE.Group();
    g.userData.prop = spec.id;
    g.add(holder);
    scene.add(g);
    const place = () => {
      const box = new THREE.Box3().setFromObject(holder);
      const size = box.getSize(new THREE.Vector3());
      // längere Seite parallel zur Wand; zu tiefe Modelle verkleinern
      const along = back[0] !== 0 ? 'z' : 'x';
      let rot = 0;
      let wide = size.x;
      let deep = size.z;
      if ((along === 'z') === (size.x > size.z)) { rot = Math.PI / 2; wide = size.z; deep = size.x; }
      const k = Math.min(1, maxDepth / deep, (S - 0.3) / wide);
      g.scale.setScalar(k);
      g.rotation.y = rot + (rng() < 0.5 ? 0 : Math.PI);
      const cx = cell[0] * S + back[0] * (S / 2 - (deep * k) / 2 - 0.04);
      const cz = cell[1] * S + back[1] * (S / 2 - (deep * k) / 2 - 0.04);
      g.position.set(cx, 0, cz);
      const hx = (along === 'z' ? deep : wide) * k / 2;
      const hz = (along === 'z' ? wide : deep) * k / 2;
      addProp(cx, cz, hx, hz);
    };
    if (holder.userData.loaded) place(); else holder.addEventListener('loaded', place);
  });
}

/**
 * Plätze für Requisiten: Sackgassen (an der Rückwand) und gerade Gänge (an einer Seitenwand),
 * außerhalb der Sperrliste, mindestens 3 Kacheln voneinander entfernt, zufällig gemischt.
 * @returns {{ cell: number[], back: number[], maxDepth: number }[]}
 */
export function propSpots(maze, isOpen, dirs, avoid, rng, max) {
  const cand = [];
  for (let z = 1; z < maze.size - 1; z++) {
    for (let x = 1; x < maze.size - 1; x++) {
      if (!isOpen(maze, x, z) || avoid.has(z * maze.size + x)) continue;
      const open = dirs.filter(([dx, dz]) => isOpen(maze, x + dx, z + dz));
      if (open.length === 1) {
        cand.push({ cell: [x, z], back: [-open[0][0], -open[0][1]], maxDepth: 0.9 });
      } else if (open.length === 2 && open[0][0] === -open[1][0] && open[0][1] === -open[1][1]) {
        const walls = dirs.filter(([dx, dz]) => !isOpen(maze, x + dx, z + dz));
        cand.push({ cell: [x, z], back: walls[Math.floor(rng() * walls.length)], maxDepth: 0.6 });
      }
    }
  }
  for (let i = cand.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cand[i], cand[j]] = [cand[j], cand[i]];
  }
  // Sackgassen zuerst, dann Gänge; Abstand halten
  cand.sort((a, b) => b.maxDepth - a.maxDepth);
  const out = [];
  for (const c of cand) {
    if (out.length >= max) break;
    if (out.some((o) => Math.abs(o.cell[0] - c.cell[0]) + Math.abs(o.cell[1] - c.cell[1]) < 3)) continue;
    out.push(c);
  }
  return out;
}
