// halloweenDecor.js — Halloween-Ausstattung für den Party-Saal (Stream Starting, Thema „halloween“).
//
// Modelle: KayKit „Halloween Bits“ (Kay Lousberg, CC0), zu einer Datei zusammengefasst:
// public/media/stream3d/halloween/halloween.glb (jedes Modell ist ein Wurzelknoten „HW_<name>“).
// Alle Modelle teilen einen Farbatlas (8×4 Felder). Zwei Felder leuchten: das Innere der
// Kürbisgesichter (Feld 1,0) und das Laternenglas (Feld 2,3) — dafür gibt es eine Leucht-Maske im
// selben Raster, die im Takt einer Kerze flackert. Kerzen bekommen echte Flammen (Sprites an den
// Dochtspitzen, Feld 7,1).
//
// Dazu selbst gebaut: Spinnennetze (Canvas-Texturen), Spinnen, die sich an Fäden von den Traversen
// abseilen, und Fledermäuse, die unter der Decke kreisen.
//
// Wird erst geladen, wenn das Thema zum ersten Mal eingeschaltet wird (partyScene.setTheme).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { canvasTexture, rng } from './sceneKit';

const URL = '/media/stream3d/halloween/halloween.glb';
const ATLAS = { cols: 8, rows: 4 };
/** Felder, die leuchten [Spalte, Zeile, Farbe]. */
const GLOW_CELLS = [[1, 0, '#ffa63a'], [2, 3, '#ffd27a']];
const WICK = { u0: 7 / 8, u1: 1, v0: 1 / 4, v1: 2 / 4 };

/**
 * Plätze im Saal (Koordinaten von partyScene.js: Bühne z < −7 auf 1,2 m Höhe, Tanzfläche x ±8,
 * Seitenwände x ±13, Rückwand z −11, DJ-Pult-Oberkante 2,35 m bei z −8,6).
 * [Modell, x, y, z, Höhe, Drehung, Aufhängung ('bottom' = steht auf y, 'origin' = Ursprung auf y)]
 */
const PLACES = [
  // Bühnenkante: Kürbisse zwischen Flammendüsen und CO2
  ['pumpkin_orange_jackolantern', -2.0, 1.2, -7.35, 0.55, 0.15],
  ['pumpkin_yellow_jackolantern', 2.0, 1.2, -7.35, 0.55, -0.2],
  ['pumpkin_orange_small', 2.45, 1.2, -7.5, 0.26, 0.8],
  ['pumpkin_orange_jackolantern', -4.6, 1.2, -7.35, 0.5, -0.1],
  ['pumpkin_yellow_small', -4.15, 1.2, -7.55, 0.24, 0.4],
  ['pumpkin_yellow_jackolantern', 4.6, 1.2, -7.35, 0.5, 0.25],
  ['candle_triple', -7.0, 1.2, -7.45, 0.42, 0.3],
  ['candle_triple', 7.0, 1.2, -7.45, 0.42, -0.5],
  ['pumpkin_orange_jackolantern', -9.6, 1.2, -7.35, 0.62, 0.3],
  ['pumpkin_orange', -9.05, 1.2, -7.55, 0.36, 0],
  ['pumpkin_orange_jackolantern', 9.6, 1.2, -7.35, 0.62, -0.3],
  ['pumpkin_yellow', 9.05, 1.2, -7.55, 0.36, 1],
  ['skull', 5.4, 1.2, -7.45, 0.24, -0.5],
  ['bone_A', -5.3, 1.25, -7.5, 0.09, 0.9],
  ['ribcage', -10.4, 1.2, -7.65, 0.42, 0.6],
  // DJ-Pult: Totenkopf-Kerze und abgebrannte Kerze auf den Ecken
  ['skull_candle', 1.42, 2.35, -8.95, 0.32, -0.3],
  ['candle_melted', -1.45, 2.35, -8.95, 0.24, 0],
  // Hinten auf der Bühne
  ['tree_dead_large_decorated', 9.5, 1.2, -10.0, 4.2, -0.6],
  ['shrine_candles', 8.1, 1.2, -10.35, 1.25, 0],
  ['tree_dead_medium', -10.3, 1.2, -9.7, 3.6, 0.9],
  ['grave_A', -8.3, 1.2, -10.2, 1.3, 0.2],
  ['candle_thin', -7.75, 1.2, -9.6, 0.4, 0],
  // Tanzflächen-Rand vor den Boxen
  ['pumpkin_orange_jackolantern', -9.1, 0, -4.1, 0.72, 0.5],
  ['pumpkin_orange', -9.75, 0, -3.55, 0.5, 0],
  ['pumpkin_yellow_small', -8.75, 0, -3.5, 0.3, 0],
  ['pumpkin_yellow_jackolantern', 9.1, 0, -4.1, 0.72, -0.5],
  ['pumpkin_orange_small', 8.7, 0, -3.5, 0.32, 0],
  ['pumpkin_yellow', 9.75, 0, -3.5, 0.48, 0],
  ['candle_thin', -8.6, 0, 2.6, 0.5, 0],
  ['pumpkin_orange_jackolantern', -9.0, 0, 3.1, 0.6, 0.6],
  ['pumpkin_orange_jackolantern', 9.0, 0, 3.1, 0.6, -0.6],
  ['candle_melted', 8.55, 0, 2.55, 0.3, 0],
  // Friedhofsecke an den Seitenwänden
  ['gravestone', 12.15, 0, 0.4, 1.15, -Math.PI / 2],
  ['gravemarker_A', 12.2, 0, 2.2, 0.95, -Math.PI / 2 + 0.2],
  ['plaque_candles', 11.6, 0, 3.6, 0.5, 0],
  ['grave_A', -12.0, 0, 0.9, 1.25, Math.PI / 2],
  ['gravemarker_B', -12.2, 0, 3.0, 0.95, Math.PI / 2 - 0.15],
  ['lantern_standing', -11.7, 0, 4.4, 0.7, 0],
  // Eingang: Pfosten mit Totenkopf und Laterne
  ['post_skull', -12.35, 0, 6.05, 4.0, Math.PI / 2, 'origin'],
  ['post_lantern', -12.35, 0, 8.95, 4.0, Math.PI / 2, 'origin'],
  // Laternen an der vorderen Traverse
  ['lantern_hanging', -5.4, 8.45, 3.5, 1.2, 0, 'origin'],
  ['lantern_hanging', 5.4, 8.45, 3.5, 1.2, 0.6, 'origin'],
  ['lantern_hanging', -10.3, 8.45, 3.5, 1.0, 0.3, 'origin'],
  ['lantern_hanging', 10.3, 8.45, 3.5, 1.0, 0.9, 'origin'],
];

/** Spinnennetz als Textur: full = rundes Netz, sonst Viertelnetz aus der linken oberen Ecke. */
function webTexture(full, seed) {
  const size = 512;
  return canvasTexture(size, size, (ctx) => {
    const r = rng(seed);
    ctx.clearRect(0, 0, size, size);
    ctx.strokeStyle = 'rgba(235,238,255,0.85)';
    ctx.lineCap = 'round';
    const cx = full ? size / 2 : 4, cy = full ? size / 2 : 4;
    const R = full ? size / 2 - 8 : size - 16;
    const n = full ? 13 : 8;
    const a0 = full ? 0 : 0.04, a1 = full ? Math.PI * 2 : Math.PI / 2 - 0.04;
    const spokes = [];
    for (let i = 0; i < n; i++) {
      const t = full ? i / n : i / (n - 1);
      spokes.push(a0 + (a1 - a0) * t + (r() - 0.5) * (full ? 0.18 : 0.1));
    }
    ctx.lineWidth = 2.2;
    for (const a of spokes) {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * R * (0.92 + r() * 0.08), cy + Math.sin(a) * R * (0.92 + r() * 0.08));
      ctx.stroke();
    }
    // Fangspirale: zwischen zwei Speichen je ein durchhängender Bogen
    ctx.lineWidth = 1.5;
    const step = full ? 15 : 26;
    for (let rad = full ? 18 : 40; rad < R * 0.95; rad += step * (0.85 + r() * 0.3)) {
      for (let i = 0; i < spokes.length - (full ? 0 : 1); i++) {
        if (r() < 0.06) continue;                       // gerissene Fäden
        const aA = spokes[i], aB = spokes[(i + 1) % spokes.length] + (full && i === spokes.length - 1 ? Math.PI * 2 : 0);
        const ax = cx + Math.cos(aA) * rad, ay = cy + Math.sin(aA) * rad;
        const bx = cx + Math.cos(aB) * rad, by = cy + Math.sin(aB) * rad;
        const am = (aA + aB) / 2;
        const sag = rad * 0.86;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.quadraticCurveTo(cx + Math.cos(am) * sag, cy + Math.sin(am) * sag, bx, by);
        ctx.stroke();
      }
    }
  }).tex;
}

/** Spinne: Körper + acht zweigliedrige Beine (Beine für das Zappeln zurückgegeben). */
function buildSpider(mat, eyeMat) {
  const g = new THREE.Group();
  const abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), mat);
  abdomen.scale.set(1, 0.85, 1.2);
  abdomen.position.set(0, 0.02, -0.16);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), mat);
  head.position.set(0, 0, 0.06);
  g.add(abdomen, head);
  for (const x of [-0.035, 0.035]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), eyeMat);
    eye.position.set(x, 0.035, 0.14);
    g.add(eye);
  }
  const legs = [];
  const upperGeo = new THREE.CylinderGeometry(0.012, 0.016, 0.24, 6).translate(0, 0.12, 0);
  const lowerGeo = new THREE.CylinderGeometry(0.006, 0.011, 0.3, 6).translate(0, 0.15, 0);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const hip = new THREE.Group();
      hip.position.set(side * 0.06, 0, 0.08 - i * 0.05);
      hip.rotation.y = side * (-0.7 + i * 0.45) + (side < 0 ? Math.PI : 0);
      const upper = new THREE.Mesh(upperGeo, mat);
      upper.rotation.z = -0.9;          // schräg nach oben/außen
      const knee = new THREE.Group();
      knee.position.y = 0.24;
      upper.add(knee);
      const lower = new THREE.Mesh(lowerGeo, mat);
      lower.rotation.z = -1.9;          // Unterschenkel knickt steil nach unten und außen
      knee.add(lower);
      hip.add(upper);
      g.add(hip);
      legs.push({ upper, phase: i * 1.3 + (side > 0 ? 0.7 : 0) });
    }
  }
  return { group: g, legs };
}

/** Fledermaus: Rumpf + zwei Flügel (Bogenkante), Flügel drehen um die Schulter. */
function buildBat(mat) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), mat);
  body.scale.set(0.8, 0.7, 1.5);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), mat);
  head.position.z = 0.09;
  g.add(body, head);
  for (const x of [-0.022, 0.022]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.05, 4), mat);
    ear.position.set(x, 0.04, 0.1);
    g.add(ear);
  }
  // Flügelumriss (x nach außen, z nach vorn), Hinterkante mit drei Bögen
  const s = new THREE.Shape();
  s.moveTo(0, 0.05);
  s.quadraticCurveTo(0.2, 0.13, 0.46, 0.06);
  s.quadraticCurveTo(0.4, -0.02, 0.37, -0.1);
  s.quadraticCurveTo(0.31, -0.03, 0.24, -0.09);
  s.quadraticCurveTo(0.17, -0.02, 0.1, -0.08);
  s.quadraticCurveTo(0.06, -0.02, 0, -0.06);
  s.lineTo(0, 0.05);
  const wingGeo = new THREE.ShapeGeometry(s, 6).rotateX(Math.PI / 2);
  const wings = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.x = side * 0.035;
    const w = new THREE.Mesh(wingGeo, mat);
    w.scale.x = side;
    pivot.add(w);
    g.add(pivot);
    wings.push({ pivot, side });
  }
  return { group: g, wings };
}

/**
 * @param {THREE.Scene} scene
 * @param {{ flameTex: THREE.Texture, envMap?: THREE.Texture|null }} opts
 * @returns {{ ready: Promise<void>, setVisible(on: boolean): void, update(t: number, dt: number, beat: number, kick: number): void, dispose(): void }}
 */
export function createHalloweenDecor(scene, { flameTex }) {
  const root = new THREE.Group();
  root.name = 'halloween';
  root.visible = false;
  scene.add(root);
  const disposables = [];
  const keep = (x) => { disposables.push(x); return x; };

  // ── Leucht-Maske im Raster des Atlas (flipY aus: glTF-Koordinaten, v = 0 oben) ──
  const mask = canvasTexture(ATLAS.cols * 8, ATLAS.rows * 8, (ctx) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, ATLAS.cols * 8, ATLAS.rows * 8);
    for (const [c, r, col] of GLOW_CELLS) { ctx.fillStyle = col; ctx.fillRect(c * 8, r * 8, 8, 8); }
  });
  mask.tex.flipY = false;
  mask.tex.magFilter = THREE.NearestFilter;
  mask.tex.minFilter = THREE.NearestFilter;
  mask.tex.generateMipmaps = false;
  mask.tex.colorSpace = THREE.SRGBColorSpace;
  mask.tex.needsUpdate = true;
  keep(mask.tex);
  let kitMat = null;

  // ── Kerzenflammen (Sprites) ──
  const flames = [];
  const flameMat = keep(new THREE.SpriteMaterial({ map: flameTex, color: '#ffb347', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));

  // ── Modelle laden und verteilen ──
  const ready = new Promise((resolve) => {
    new GLTFLoader().load(URL, (gltf) => {
      const src = gltf.scene;
      // gemeinsames Material: Farbatlas + flackernde Leucht-Maske
      src.traverse((o) => {
        if (!o.isMesh) return;
        if (!kitMat) {
          const m0 = o.material;
          kitMat = keep(new THREE.MeshStandardMaterial({
            map: m0.map, roughness: 0.65, metalness: 0,
            emissive: new THREE.Color('#ffffff'), emissiveMap: mask.tex, emissiveIntensity: 2,
          }));
          if (m0.map) { m0.map.colorSpace = THREE.SRGBColorSpace; keep(m0.map); }
        }
        o.material = kitMat;
        keep(o.geometry);
      });
      src.updateMatrixWorld(true);
      const box = new THREE.Box3();
      const v = new THREE.Vector3();
      const uv = new THREE.Vector2();
      for (const [name, x, y, z, h, rot, fit = 'bottom'] of PLACES) {
        const proto = src.getObjectByName(`HW_${name}`);
        if (!proto) { console.warn('[halloween] Modell fehlt:', name); continue; }
        box.setFromObject(proto);
        const k = h / Math.max(1e-3, box.max.y - box.min.y);
        const obj = proto.clone(true);
        obj.scale.setScalar(k);
        obj.rotation.y = rot;
        obj.position.set(x, fit === 'bottom' ? y - box.min.y * k : y, z);
        root.add(obj);
        // Dochte suchen: Ecken im Docht-Feld, nach Lage gebündelt → je Kerze eine Flamme
        if (/candle/.test(name)) {
          obj.updateMatrixWorld(true);
          const tips = [];
          obj.traverse((o) => {
            if (!o.isMesh) return;
            const pos = o.geometry.attributes.position, tc = o.geometry.attributes.uv;
            if (!tc) return;
            for (let i = 0; i < pos.count; i++) {
              uv.fromBufferAttribute(tc, i);
              if (uv.x < WICK.u0 || uv.x > WICK.u1 || uv.y < WICK.v0 || uv.y > WICK.v1) continue;
              v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
              const near = tips.find((p) => Math.hypot(p.x - v.x, p.z - v.z) < 0.03 * k / 0.3);
              if (!near) tips.push(v.clone());
              else if (v.y > near.y) near.copy(v);
            }
          });
          for (const p of tips) {
            const s = new THREE.Sprite(flameMat);
            const size = Math.max(0.05, 0.16 * k);
            s.position.copy(p).add(new THREE.Vector3(0, size * 0.35, 0));
            s.scale.set(size * 0.5, size, 1);
            root.add(s);
            flames.push({ s, size, base: s.position.y, ph: Math.random() * 10 });
          }
        }
      }
      resolve();
    }, undefined, (err) => { console.warn('[halloween] Modelle nicht geladen', err); resolve(); });
  });

  // ── Spinnennetze ──
  const webMat = (full, seed) => keep(new THREE.MeshBasicMaterial({
    map: keep(webTexture(full, seed)), color: '#c9cede', transparent: true, depthWrite: false, side: THREE.DoubleSide,
  }));
  const webGeo = keep(new THREE.PlaneGeometry(1, 1));
  const web = (full, seed, size, x, y, z, rotY = 0, mirror = false) => {
    const m = new THREE.Mesh(webGeo, webMat(full, seed));
    m.scale.set(mirror ? -size : size, size, 1);
    m.position.set(x, y, z);
    m.rotation.y = rotY;
    root.add(m);
  };
  // Viertelnetze in den oberen Ecken der Rückwand (Textur-Ecke oben links = Raumecke)
  web(false, 11, 3.6, -13 + 1.8, 10 - 1.8, -10.83);
  web(false, 12, 3.6, 13 - 1.8, 10 - 1.8, -10.83, 0, true);
  // … an den Traversentürmen unter dem Querträger
  web(false, 13, 1.9, -9.78 + 0.95, 8.38 - 0.95, -7.76);
  web(false, 14, 1.9, 9.78 - 0.95, 8.38 - 0.95, -7.76, 0, true);
  // runde Netze quer über den hinteren Raumecken und an den Seitenwänden
  web(true, 15, 3.0, -11.95, 5.6, -9.95, Math.PI / 4);
  web(true, 16, 2.6, 11.95, 4.9, -9.95, -Math.PI / 4);
  web(true, 17, 2.4, 12.84, 5.2, 1.6, -Math.PI / 2);
  web(true, 18, 2.0, -12.84, 5.6, -1.2, Math.PI / 2);
  // Viertelnetz in der oberen Ecke des Eingangs
  web(false, 19, 1.1, -12.9, 2.62 - 0.55, 8.62 - 0.55, Math.PI / 2, true);

  // ── Spinnen an Fäden ──
  const spiderMat = keep(new THREE.MeshStandardMaterial({ color: '#16111a', roughness: 0.45, metalness: 0.1 }));
  const eyeMat = keep(new THREE.MeshBasicMaterial({ color: '#ff2a3a' }));
  const threadMat = keep(new THREE.LineBasicMaterial({ color: '#d8dce8', transparent: true, opacity: 0.55 }));
  const spiders = [[-6.2, -8], [3.1, -8], [-4.1, 3.5], [1.4, 3.5], [7.2, 3.5]].map(([x, z], i) => {
    const sp = buildSpider(spiderMat, eyeMat);
    sp.group.position.set(x, 6, z);
    sp.group.rotation.y = i * 1.7;
    root.add(sp.group);
    const geo = keep(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, 8.4, z), new THREE.Vector3(x, 6, z)]));
    const line = new THREE.Line(geo, threadMat);
    line.frustumCulled = false;
    root.add(line);
    return { ...sp, geo, x, z, ph: i * 2.1, speed: 0.22 + (i % 3) * 0.07 };
  });
  for (const sp of spiders) sp.group.traverse((o) => { if (o.geometry) keep(o.geometry); });

  // ── Fledermäuse ──
  // leichter violetter Eigenschein, damit die Silhouette vor der dunklen Decke nicht verschwindet
  const batMat = keep(new THREE.MeshStandardMaterial({ color: '#1d1622', emissive: '#1a0d26', roughness: 0.7, side: THREE.DoubleSide }));
  const R = rng(31);
  const bats = Array.from({ length: 9 }, (_, i) => {
    const b = buildBat(batMat);
    b.group.scale.setScalar(1.3 + R() * 0.5);
    root.add(b.group);
    b.group.traverse((o) => { if (o.geometry) keep(o.geometry); });
    return {
      ...b,
      cx: (R() - 0.5) * 4, cz: -2 + (R() - 0.5) * 4, cy: 6.4 + R() * 2,
      rx: 7 + R() * 4, rz: 4 + R() * 3,
      speed: (0.32 + R() * 0.25) * (i % 3 === 0 ? -1 : 1),
      ph: R() * Math.PI * 2, flap: 11 + R() * 5,
    };
  });
  const prev = new THREE.Vector3();

  let visible = false;
  return {
    ready,
    setVisible(on) { visible = !!on; root.visible = visible; },
    update(t, dt, beat, kick) {
      if (!visible) return;
      // Kerzenlicht: unruhiges Flackern, im Bass etwas heller
      const flick = 0.8 + 0.12 * Math.sin(t * 9.3) + 0.08 * Math.sin(t * 23.7 + 1.3) + 0.15 * kick;
      if (kitMat) kitMat.emissiveIntensity = 1.6 * flick;
      for (const f of flames) {
        const k = 0.85 + 0.15 * Math.sin(t * 17 + f.ph) + 0.08 * Math.sin(t * 41 + f.ph * 2);
        f.s.scale.set(f.size * 0.5 * (0.9 + 0.1 * Math.sin(t * 13 + f.ph)), f.size * k, 1);
        f.s.position.y = f.base + f.size * (k - 1) * 0.3;
      }
      // Spinnen seilen sich ab und klettern wieder hoch
      for (const sp of spiders) {
        const drop = 1.6 + 1.6 * (0.5 - 0.5 * Math.cos(t * sp.speed + sp.ph));
        const y = 8.4 - drop;
        sp.group.position.y = y;
        sp.group.rotation.y += dt * 0.25 * Math.sin(t * 0.3 + sp.ph);
        const arr = sp.geo.attributes.position.array;
        arr[4] = y + 0.12;
        sp.geo.attributes.position.needsUpdate = true;
        for (const l of sp.legs) l.upper.rotation.x = 0.18 * Math.sin(t * 7 + l.phase);
      }
      // Fledermäuse: Schleifen unter der Decke, Flügelschlag
      for (const b of bats) {
        const a = b.ph + t * b.speed;
        const px = b.cx + Math.cos(a) * b.rx, pz = b.cz + Math.sin(a) * b.rz;
        const py = b.cy + 0.6 * Math.sin(a * 2 + b.ph) + 0.15 * Math.sin(t * 3 + b.ph);
        prev.copy(b.group.position);
        b.group.position.set(px, py, pz);
        const dx = px - prev.x, dz = pz - prev.z;
        if (dx * dx + dz * dz > 1e-8) b.group.rotation.y = Math.atan2(dx, dz);
        b.group.rotation.z = -0.35 * Math.sign(b.speed);      // in die Kurve legen
        const w = Math.sin(t * b.flap + b.ph);
        for (const wg of b.wings) wg.pivot.rotation.z = wg.side * (0.15 + 0.85 * w);
      }
    },
    dispose() {
      scene.remove(root);
      for (const d of disposables) d.dispose?.();
    },
  };
}
