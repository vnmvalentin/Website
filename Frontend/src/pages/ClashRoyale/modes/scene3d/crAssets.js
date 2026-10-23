// Clash-Royale-Ersatz für createAssets (kit.js): gleiche Schnittstelle (pbr, model, sky, ready,
// dispose), aber alles gemalt und im Code erzeugt — keine Downloads, keine Ladezeit. So laufen
// Pyramide und Karussell im CR-Look, ohne dass sich ihr Aufbau ändern muss.
//   • pbr(material, id, rx, ry): legt statt des Fotos eine gemalte Textur passender Art an
//   • model(id, höhe): liefert sofort ein klobiges, gemaltes Objekt mit Kontur (Fuß auf y=0)
//   • sky(scene): gemalter Himmel + neutrale Umgebung für Metallglanz
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { neutralEnvironment, rng } from './kit';
import { checkerGrassTexture, chunkyStoneTexture, plankTexture, addOutline, bushGeometry, crSkyMaterial } from './crStyle';

const SAND = ['#e8bd74', '#ddb067', '#f0c886'];
const SAND_LIGHT = ['#f2d29a', '#ebc88d', '#f7dcab'];
const GREY = ['#b8b4ab', '#a9a59c', '#c6c2b8'];

/** Glatter, gemalter Block (eine große, abgerundete Platte je Wiederholung) — für Karten- und Säulensteine. */
function smoothBlockTexture(palette) {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const rand = rng(13);
  ctx.fillStyle = '#5a4026';
  ctx.fillRect(0, 0, S, S);
  ctx.beginPath();
  ctx.roundRect(5, 5, S - 10, S - 10, 26);
  ctx.fillStyle = palette[0];
  ctx.fill();
  const g = ctx.createLinearGradient(0, 0, 0, S);
  g.addColorStop(0, 'rgba(255,255,230,0.30)');
  g.addColorStop(0.3, 'rgba(255,255,230,0)');
  g.addColorStop(1, 'rgba(70,40,10,0.28)');
  ctx.fillStyle = g;
  ctx.fill();
  for (let i = 0; i < 70; i++) {
    ctx.fillStyle = rand() < 0.5 ? 'rgba(255,240,200,0.18)' : 'rgba(90,55,20,0.16)';
    ctx.beginPath();
    ctx.arc(10 + rand() * (S - 20), 10 + rand() * (S - 20), 2 + rand() * 7, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(43,28,16,0.85)';
  ctx.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 16;
  return t;
}

/**
 * Ruhiger Sandstein: große Quader (cols × rows je Wiederholung, Reihen versetzt), weiche helle
 * Fugen statt dicker dunkler Konturen, wenig Kontrast — die klobige Steintextur wirkte auf großen
 * Flächen (Pyramide) unruhig und flimmerte.
 */
function calmBlockTexture(palette, cols = 2, rows = 2) {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const rand = rng(29);
  const bw = S / cols, bh = S / rows;
  ctx.fillStyle = '#c99a5a';
  ctx.fillRect(0, 0, S, S);
  for (let r = 0; r < rows; r++) {
    const shift = (r % 2) * bw / 2;
    for (let k = -1; k <= cols; k++) {
      const x = k * bw + shift, y = r * bh;
      ctx.fillStyle = palette[Math.floor(rand() * palette.length)];
      ctx.beginPath();
      ctx.roundRect(x + 4, y + 4, bw - 8, bh - 8, 14);
      ctx.fill();
      // sanfter Schein oben, leicht dunkler unten
      const g = ctx.createLinearGradient(0, y, 0, y + bh);
      g.addColorStop(0, 'rgba(255,250,225,0.16)');
      g.addColorStop(0.4, 'rgba(255,250,225,0)');
      g.addColorStop(1, 'rgba(120,75,25,0.12)');
      ctx.fillStyle = g;
      ctx.fill();
      // wenige, weiche Flecken
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = rand() < 0.5 ? 'rgba(255,240,205,0.08)' : 'rgba(140,90,40,0.07)';
        ctx.beginPath();
        ctx.ellipse(x + 20 + rand() * (bw - 40), y + 20 + rand() * (bh - 40), 18 + rand() * 30, 10 + rand() * 18, rand() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 16;
  return t;
}

// Welche gemalte Textur ersetzt welches Foto (IDs aus public/media/cr3d)
const TEXTURE_FOR = {
  sandstone_blocks_05: () => calmBlockTexture(SAND, 3, 3),
  sandstone_blocks_08: () => calmBlockTexture(SAND_LIGHT, 2, 2),
  sandstone_blocks_04: () => smoothBlockTexture(SAND_LIGHT),
  floor_tiles_04: () => calmBlockTexture(['#e9cfa0', '#e2c693', '#eed6aa'], 2, 2),
  cobblestone_floor_08: () => chunkyStoneTexture(1, 1, GREY),
  wood_table_001: () => plankTexture(),
  wood_planks: () => plankTexture(),
  weathered_planks: () => plankTexture(1, 1, ['#b98a5e', '#a87b50', '#c4966a']),
  herringbone_parquet: () => plankTexture(),
  leafy_grass: () => checkerGrassTexture(),
};
// Wie groß eine Wiederholung der gemalten Textur im Vergleich zum Foto sein soll
const SCALE_FOR = { sandstone_blocks_05: 1.4, sandstone_blocks_08: 1.0, floor_tiles_04: 0.9, cobblestone_floor_08: 1.2, leafy_grass: 0.8 };
// Die Steintextur ist doppelt so breit wie hoch → in v doppelt so oft wiederholen, sonst sind die Steine hochkant
const ASPECT_FOR = { cobblestone_floor_08: 2 };

function lathe(points, segs = 28) {
  return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segs);
}

export function createCrAssets(renderer) {
  const owned = [];
  const own = (x) => { owned.push(x); return x; };
  const base = new Map();
  const baseTex = (id) => {
    if (!base.has(id)) base.set(id, TEXTURE_FOR[id] ? own(TEXTURE_FOR[id]()) : null);
    return base.get(id);
  };
  const std = (o) => own(new THREE.MeshStandardMaterial({ roughness: 0.8, ...o }));
  const goldMat = std({ color: 0xf2b632, roughness: 0.32, metalness: 0.75 });
  const clayMat = std({ color: 0xc8693a, roughness: 0.85 });
  const creamMat = std({ color: 0xf4e6c8, roughness: 0.8 });
  const darkMat = std({ color: 0x2f3b45, roughness: 0.6, metalness: 0.3 });
  const trunkMat = std({ color: 0x8a5a32 });
  const leafMat = std({ vertexColors: true, roughness: 0.85 });
  const rockMat = std({ vertexColors: true, roughness: 0.9 });
  const plankMat = std({ map: own(plankTexture()) });
  const glowMat = own(new THREE.MeshStandardMaterial({ color: 0xffe2a0, emissive: 0xffd07a, emissiveIntensity: 2.6 }));

  const mesh = (geo, mat, outline = 0.025) => {
    const m = new THREE.Mesh(own(geo), mat);
    m.castShadow = true;
    m.receiveShadow = true;
    if (outline) addOutline(m, outline);
    return m;
  };
  // Klobiger Fels: verzerrter Ikosaeder, oben hell, unten dunkel
  const rockGeo = (seed) => {
    const g = new THREE.IcosahedronGeometry(0.5, 1);
    const p = g.attributes.position, rand = rng(seed);
    const col = new Float32Array(p.count * 3);
    const lo = new THREE.Color('#8f8676'), hi = new THREE.Color('#d8cdb8'), cv = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const k = 0.85 + rand() * 0.3;
      p.setXYZ(i, p.getX(i) * k * 1.25, p.getY(i) * k * 0.8, p.getZ(i) * k);
      cv.copy(lo).lerp(hi, Math.min(1, Math.max(0, p.getY(i) / 0.4 + 0.5)));
      col[i * 3] = cv.r; col[i * 3 + 1] = cv.g; col[i * 3 + 2] = cv.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    g.translate(0, 0.35, 0);
    return g;
  };
  // Baum im Arena-Stil: Stamm + runde Krone (Kontur), Wüstenvariante heller/gelblicher
  const tree = (desert) => {
    const g = new THREE.Group();
    const trunk = mesh(new THREE.CylinderGeometry(0.12, 0.2, 1.3, 10).translate(0, 0.65, 0), trunkMat, 0.025);
    const crownGeo = desert ? bushGeometry(31, 5, '#b9d45a', '#6f8f2c') : bushGeometry(21, 7, '#9ad857', '#3a7f28');
    const crown = mesh(crownGeo, leafMat, 0.03);
    crown.position.y = 1.0;
    crown.scale.setScalar(1.25);
    g.add(trunk, crown);
    return { g, h: 2.6 };
  };
  const BUILD = {
    brass_pot_01: () => {
      const g = new THREE.Group();
      g.add(mesh(lathe([[0, 0], [0.3, 0], [0.32, 0.05], [0.22, 0.18], [0.3, 0.32], [0.5, 0.5], [0.52, 0.58], [0.44, 0.6], [0, 0.58]]), goldMat));
      return { g, h: 0.6 };
    },
    brass_vase_01: () => {
      const g = new THREE.Group();
      g.add(mesh(lathe([[0, 0], [0.22, 0], [0.24, 0.05], [0.36, 0.35], [0.38, 0.55], [0.2, 0.8], [0.15, 0.95], [0.22, 1.02], [0.2, 1.05], [0, 1.0]]), clayMat));
      const band = mesh(new THREE.TorusGeometry(0.37, 0.035, 8, 32).rotateX(Math.PI / 2).translate(0, 0.5, 0), goldMat, 0);
      g.add(band);
      return { g, h: 1.05 };
    },
    brass_vase_03: () => {
      const g = new THREE.Group();
      g.add(mesh(lathe([[0, 0], [0.25, 0], [0.27, 0.04], [0.33, 0.3], [0.26, 0.6], [0.3, 0.75], [0, 0.73]]), creamMat));
      g.add(mesh(new THREE.TorusGeometry(0.31, 0.03, 8, 32).rotateX(Math.PI / 2).translate(0, 0.32, 0), goldMat, 0));
      return { g, h: 0.75 };
    },
    quiver_tree_02: () => tree(true),
    island_tree_01: () => tree(false),
    island_tree_02: () => tree(false),
    namaqualand_boulder_02: () => {
      const g = new THREE.Group();
      g.add(mesh(rockGeo(3), rockMat, 0.03));
      const b = mesh(rockGeo(8), rockMat, 0.03);
      b.position.set(0.5, -0.1, 0.25);
      b.scale.setScalar(0.6);
      g.add(b);
      return { g, h: 0.75 };
    },
    street_lamp_01: () => {
      const g = new THREE.Group();
      g.add(mesh(new THREE.CylinderGeometry(0.06, 0.1, 2.8, 10).translate(0, 1.4, 0), darkMat, 0.02));
      g.add(mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.2, 10).translate(0, 0.1, 0), darkMat, 0.02));
      const lamp = mesh(new RoundedBoxGeometry(0.34, 0.42, 0.34, 2, 0.04).translate(0, 3.0, 0), glowMat, 0.025);
      const roof = mesh(new THREE.ConeGeometry(0.3, 0.24, 4).rotateY(Math.PI / 4).translate(0, 3.33, 0), darkMat, 0.02);
      g.add(lamp, roof);
      return { g, h: 3.45 };
    },
    potted_plant_02: () => {
      const g = new THREE.Group();
      g.add(mesh(lathe([[0, 0], [0.2, 0], [0.26, 0.32], [0.3, 0.36], [0, 0.36]]), clayMat));
      const b = mesh(bushGeometry(5, 4, '#8fd04f', '#3f8a2a'), leafMat, 0.025);
      b.scale.setScalar(0.45);
      b.position.y = 0.25;
      g.add(b);
      return { g, h: 0.85 };
    },
    wooden_crate_01: () => {
      const g = new THREE.Group();
      g.add(mesh(new RoundedBoxGeometry(0.8, 0.6, 0.6, 2, 0.04).translate(0, 0.3, 0), plankMat));
      return { g, h: 0.6 };
    },
    wooden_picnic_table: () => {
      const g = new THREE.Group();
      g.add(mesh(new RoundedBoxGeometry(1.8, 0.1, 0.8, 2, 0.03).translate(0, 0.75, 0), plankMat));
      [-0.6, 0.6].forEach((z) => g.add(mesh(new RoundedBoxGeometry(1.8, 0.08, 0.28, 2, 0.03).translate(0, 0.45, z), plankMat)));
      [-0.7, 0.7].forEach((x) => g.add(mesh(new RoundedBoxGeometry(0.1, 0.75, 1.3, 2, 0.03).translate(x, 0.37, 0), plankMat)));
      return { g, h: 0.8 };
    },
  };

  return {
    ready: () => Promise.resolve(true),
    pending: 0,
    pbr(material, id, rx = 1, ry = rx, { noMap = false } = {}) {
      const t = baseTex(id);
      if (t && !noMap) {
        const k = SCALE_FOR[id] || 1;
        const c = own(t.clone());
        c.repeat.set(rx * k, ry * k * (ASPECT_FOR[id] || 1));
        c.needsUpdate = true;
        material.map = c;
      }
      material.roughness = 0.85;
      material.metalness = 0;
      material.needsUpdate = true;
      return material;
    },
    model(id, height, { tweak } = {}) {
      const holder = new THREE.Group();
      const make = BUILD[id] || (() => {
        const g = new THREE.Group();
        g.add(mesh(bushGeometry(9), leafMat, 0.03));
        return { g, h: 1.4 };
      });
      const { g, h } = make();
      g.scale.setScalar(height / h);
      if (tweak) g.traverse((m) => { if (m.isMesh && m.material?.isMeshStandardMaterial) tweak(m.material, m); });
      holder.add(g);
      holder.userData.loaded = true;
      return holder;
    },
    sky(scene, _id, opts = {}) {
      const sky = new THREE.Mesh(own(new THREE.SphereGeometry(500, 32, 16)), own(crSkyMaterial(opts)));
      sky.frustumCulled = false;
      sky.renderOrder = -10;
      scene.add(sky);
      const env = neutralEnvironment(renderer);
      owned.push(env);
      scene.environment = env.texture;
      scene.environmentIntensity = 0.35;
    },
    dispose() { owned.forEach((o) => o.dispose?.()); },
  };
}
