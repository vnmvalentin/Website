// scene/worlds.js — die vier Welten (Vulkan, Ozean, Dschungel, Kosmos).
//
// Seit 16.11.2026 sitzt man immer mitten in EINER Welt: Boden rundherum bis in den Dunst, wenige ruhige Dinge in der
// Ferne. Vorher hingen die vier Welten als Wände einer Trommel um den Tisch — links und rechts sah man die anderen
// Welten, und jede war voller Deko (Rückmeldung des Nutzers: lenkt vom Spiel ab; die Welten sollen simpler sein).
// tableScene zeigt nur die aktuelle Welt und schaltet beim Wechsel sofort um.
//
// Jede Welt zeigt ihre „Ladung" (0–1): Lava steigt, Wasser steigt, Ranken wachsen, das Schwarze Loch wächst.
// Koordinaten einer Welt: y = 0 ist der Boden, der Tisch schwebt FLOOR darüber (tableScene setzt die Welten auf −FLOOR).
import * as THREE from 'three';

/** Runder Punkt als Textur für alle Partikel (Funken, Sterne, Konfetti) — sonst wären es Quadrate. */
let dot = null;
export function dotTexture() {
  if (!dot) {
    const cv = document.createElement('canvas');
    cv.width = 32;
    cv.height = 32;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(16, 16, 14, 0, Math.PI * 2);
    ctx.fill();
    dot = new THREE.CanvasTexture(cv);
  }
  return dot;
}

/** Weicher Fleck (Rauch, Gischt). */
let soft = null;
function softTexture() {
  if (!soft) {
    const cv = document.createElement('canvas');
    cv.width = 64;
    cv.height = 64;
    const ctx = cv.getContext('2d');
    const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.45)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    soft = new THREE.CanvasTexture(cv);
  }
  return soft;
}
function puff(color, size, opacity) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTexture(), color, transparent: true, opacity, depthWrite: false }));
  s.scale.setScalar(size);
  return s;
}

// Fließende Lava: dunkelrote Glut mit weichen hellen Adern und dunklen Krustenschollen. Alles wird auch um die
// Kachelgröße versetzt gemalt, damit die Textur ohne Naht kachelt.
function lavaTexture(rand) {
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = S;
  cv.height = S;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#c2380e';
  ctx.fillRect(0, 0, S, S);
  const wrapped = (x, y, draw) => {
    for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) draw(x + dx, y + dy);
  };
  const blob = (color, r) => wrapped(rand() * S, rand() * S, (x, y) => {
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, color);
    grad.addColorStop(1, 'rgba(255,120,20,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  });
  for (let i = 0; i < 12; i += 1) blob('rgba(255,138,30,0.95)', 40 + rand() * 40);
  for (let i = 0; i < 7; i += 1) blob('rgba(255,226,120,0.95)', 16 + rand() * 22);
  for (let i = 0; i < 9; i += 1) {
    const r = 14 + rand() * 20;
    const pts = [];
    for (let k = 0; k < 7; k += 1) pts.push([Math.cos((k / 7) * Math.PI * 2) * r * (0.6 + rand() * 0.6), Math.sin((k / 7) * Math.PI * 2) * r * (0.6 + rand() * 0.6)]);
    wrapped(rand() * S, rand() * S, (x, y) => {
      ctx.fillStyle = 'rgba(64,18,8,0.88)';
      ctx.beginPath();
      pts.forEach(([px, py], k) => (k ? ctx.lineTo(x + px, y + py) : ctx.moveTo(x + px, y + py)));
      ctx.closePath();
      ctx.fill();
    });
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Abstand Boden–Tischplatte: Der Tisch schwebt ein Stück über der Welt (unter ihm ein Fels). */
export const FLOOR = 4.5;
const SIZE = 160; // Kantenlänge des Bodens: reicht bis weit in den Dunst (scene.fog)

function rng(seed) {
  let x = seed | 0;
  return () => {
    x = (x + 0x6d2b79f5) | 0;
    let t = Math.imul(x ^ (x >>> 15), x | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const flat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true, ...extra });
/** Selbstleuchtend. boost > 1 hebt die Farbe über Weiß hinaus (HDR): nur solche Flächen glühen im Leucht-Durchgang der Szene. */
export function glow(color, extra = {}, boost = 1) {
  const m = new THREE.MeshBasicMaterial({ color, ...extra });
  m.color.multiplyScalar(boost);
  m.toneMapped = false;
  return m;
}

/** Bodenhöhe: um den Tisch eben, nach außen sanfte Hügel. Dieselbe Funktion setzt Dinge auf den Boden. */
function terrain(amp, seed) {
  return (x, z) => {
    const k = Math.min(1, Math.max(0, (Math.hypot(x, z) - 10) / 16));
    const n = Math.sin(x * 0.23 + seed) * Math.cos(z * 0.19 - seed * 1.7) + 0.5 * Math.sin(x * 0.51 - z * 0.43 + seed * 3.1);
    return amp * k * (0.75 + 0.5 * n);
  };
}

function ground(color, height, low) {
  const seg = low ? 40 : 72;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i += 1) pos.setY(i, height(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true }));
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Platz für ein Ding im Blickfeld: hinter und neben dem Tisch (die Kamera schaut von +z zur Mitte), nie unter dem
 * Tisch und den Plätzen (Abstand near). Weiter weg wird das Feld breiter, so wie das Bild.
 */
function spot(rand, near = 11, far = 48) {
  for (let i = 0; i < 60; i += 1) {
    const z = 3 - rand() * (far + 3);
    const x = (rand() * 2 - 1) * ((9.4 - z) * 0.95 + 2);
    const r = Math.hypot(x, z);
    if (r >= near && r <= far + 8) return { x, z, r };
  }
  return { x: 0, z: -far, r: far };
}
// So hoch darf etwas sein: nahe am Tisch bleibt es unter der Tischplatte, weiter hinten darf es aufragen
const maxHeight = (r) => (r < 18 ? FLOOR - 1.2 : 8);

function scatter(parent, geo, mat, count, place, colors) {
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const d = new THREE.Object3D();
  const c = new THREE.Color();
  for (let i = 0; i < count; i += 1) {
    d.position.set(0, 0, 0);
    d.rotation.set(0, 0, 0);
    d.scale.set(1, 1, 1);
    place(d, i);
    d.updateMatrix();
    mesh.setMatrixAt(i, d.matrix);
    if (colors) mesh.setColorAt(i, c.set(colors[i % colors.length]));
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  parent.add(mesh);
  return mesh;
}

// Aufsteigende oder schwebende Pünktchen (Funken, Glühwürmchen, Sterne) im Blickfeld
function motes(rand, count, color, size, boost, top) {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const p = spot(rand, 6, 34);
    pos.set([p.x, rand() * top, p.z], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color, size, map: dotTexture(), alphaTest: 0.3, transparent: true, depthWrite: false });
  mat.color.multiplyScalar(boost);
  mat.toneMapped = false;
  return { points: new THREE.Points(geo, mat), geo, mat, base: pos.slice() };
}

// ── Vulkan ───────────────────────────────────────────────────────────────────────────────────────
// Dunkles Gestein mit Glutadern, ein paar Kegel mit glühendem Krater, aufsteigende Funken. Ladung: der Lavasee steigt.
function buildVulkan(low) {
  const g = new THREE.Group();
  const rand = rng(11);
  const h = terrain(1.4, 1.3);
  g.add(ground('#3a2b28', h, low));

  scatter(g, new THREE.DodecahedronGeometry(0.6, 0), flat('#2b2020'), low ? 20 : 40, (d) => {
    const p = spot(rand);
    const s = 0.5 + rand() * 1.3;
    d.position.set(p.x, h(p.x, p.z) + s * 0.25, p.z);
    d.rotation.set(rand() * 3, rand() * 3, rand() * 3);
    d.scale.set(s, s * (0.6 + rand() * 0.5), s);
  });

  const lava = lavaTexture(rand);
  lava.repeat.set(0.6, 1.6);
  const lavaMat = new THREE.MeshBasicMaterial({ map: lava });
  lavaMat.color.setScalar(1.6);
  lavaMat.toneMapped = false;
  // Glutadern im Boden
  const crack = new THREE.PlaneGeometry(1, 1);
  crack.rotateX(-Math.PI / 2);
  scatter(g, crack, lavaMat, low ? 10 : 18, (d) => {
    const p = spot(rand, 7, 30);
    d.position.set(p.x, h(p.x, p.z) + 0.04, p.z);
    d.rotation.y = rand() * Math.PI;
    d.scale.set(0.3 + rand() * 0.3, 1, 2.5 + rand() * 4);
  });

  // Vulkankegel mit glühendem Krater, weit draußen
  const cone = new THREE.CylinderGeometry(0.32, 1, 1, 7, 1);
  cone.translate(0, 0.5, 0);
  const cones = [];
  for (let i = 0; i < 6; i += 1) {
    const p = spot(rand, 20, 46);
    const height = Math.min(maxHeight(p.r), 3.5 + rand() * 5);
    cones.push({ ...p, y: h(p.x, p.z) - 0.3, h: height, r: height * (0.6 + rand() * 0.2) });
  }
  scatter(g, cone, flat('#4a2f29'), cones.length, (d, i) => {
    d.position.set(cones[i].x, cones[i].y, cones[i].z);
    d.scale.set(cones[i].r, cones[i].h, cones[i].r);
  });
  scatter(g, new THREE.CylinderGeometry(0.3, 0.3, 0.06, 7), glow('#ffb02e', {}, 3.2), cones.length, (d, i) => {
    d.position.set(cones[i].x, cones[i].y + cones[i].h + 0.02, cones[i].z);
    d.scale.set(cones[i].r, 1, cones[i].r);
  });
  // eine ruhige Rauchfahne über dem größten Kegel
  const big = cones.reduce((a, c) => (c.h > a.h ? c : a), cones[0]);
  const smoke = [];
  for (let i = 0; i < (low ? 3 : 6); i += 1) {
    const s = puff('#3b3336', 3, 0.45);
    s.userData.off = i / 6;
    smoke.push(s);
    g.add(s);
  }

  const embers = motes(rand, low ? 40 : 110, '#ffc45e', 0.18, 2.4, 9);
  embers.mat.opacity = 0.5;
  g.add(embers.points);
  const speed = Array.from({ length: embers.base.length / 3 }, () => 0.5 + rand() * 1.4);

  // Ladung: der Lavasee steigt (wenig Ladung: nur in den Senken)
  const lakeTex = lava.clone();
  lakeTex.repeat.set(10, 10);
  const lakeMat = new THREE.MeshBasicMaterial({ map: lakeTex, transparent: true, opacity: 0.95 });
  lakeMat.color.setScalar(1.1);
  lakeMat.toneMapped = false;
  const lake = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), lakeMat);
  lake.rotation.x = -Math.PI / 2;
  g.add(lake);

  return {
    group: g,
    update(t, dt, level) {
      lava.offset.y -= dt * 0.035;
      lava.offset.x += dt * 0.008;
      lakeTex.offset.y -= dt * 0.03;
      lakeTex.offset.x += dt * 0.01;
      for (const s of smoke) {
        const u = (t * 0.06 + s.userData.off) % 1;
        s.position.set(big.x + Math.sin(u * 5 + s.userData.off * 20) * 1.2 + u * 2.5, big.y + big.h + 0.5 + u * 8, big.z);
        s.scale.setScalar(2.2 + u * 6);
        s.material.opacity = Math.sin(u * Math.PI) * 0.5;
      }
      lake.visible = level > 0.02;
      // beim Ausbruch schießt level kurz auf 1,22 (tableScene erupt) — auch dann bleibt die Lava unter der Tischplatte
      lake.position.y = -0.3 + level * (FLOOR - 0.75) + Math.sin(t * 1.3) * 0.05;
      embers.mat.opacity = 0.35 + Math.min(1, level) * 0.55;
      const a = embers.geo.attributes.position;
      const boost = 1 + level * 2.5;
      for (let i = 0; i < speed.length; i += 1) {
        let y = a.getY(i) + speed[i] * dt * boost;
        if (y > 9.5) y = 0;
        a.setY(i, y);
      }
      a.needsUpdate = true;
    },
  };
}

// ── Ozean ────────────────────────────────────────────────────────────────────────────────────────
// Weites Meer mit sanften Wellen, ein paar Inseln mit Palmen, ein Leuchtturm. Ladung: das Wasser steigt.
function buildOzean(low) {
  const g = new THREE.Group();
  const rand = rng(23);
  const h = terrain(1.2, 2.1);
  g.add(ground('#d9c48c', h, low));

  // Inseln mit Palmen
  const islands = [];
  for (let i = 0; i < 6; i += 1) islands.push({ ...spot(rand, 15, 44), s: 1.8 + rand() * 1.8 });
  scatter(g, new THREE.SphereGeometry(1, 9, 6), flat('#e3cf97'), islands.length, (d, i) => {
    d.position.set(islands[i].x, 0.4, islands[i].z);
    d.scale.set(islands[i].s, 1.4, islands[i].s);
  });
  const trunk = new THREE.CylinderGeometry(0.09, 0.15, 1, 5);
  trunk.translate(0, 0.5, 0);
  const palms = islands.map((is) => ({ ...is, h: Math.min(maxHeight(is.r) - 1.8, 1.8 + rand() * 1.6), lean: (rand() - 0.5) * 0.4 }));
  scatter(g, trunk, flat('#8a6a43'), palms.length, (d, i) => {
    d.position.set(palms[i].x, 1.6, palms[i].z);
    d.rotation.z = palms[i].lean;
    d.scale.set(1, palms[i].h, 1);
  });
  const leaf = new THREE.ConeGeometry(0.22, 1.5, 4);
  leaf.translate(0, 0.75, 0);
  scatter(g, leaf, flat('#3f9d4e'), palms.length * 5, (d, i) => {
    const p = palms[Math.floor(i / 5)];
    const a = ((i % 5) / 5) * Math.PI * 2;
    d.position.set(p.x - Math.sin(p.lean) * p.h, 1.6 + Math.cos(p.lean) * p.h, p.z);
    d.rotation.set(Math.cos(a) * 1.25, 0, Math.sin(a) * 1.25);
  });

  // Leuchtturm auf einem Felsen, der Lichtkegel kreist langsam
  const tower = new THREE.Group();
  tower.position.set(-11, 0, -32);
  tower.add(new THREE.Mesh(new THREE.DodecahedronGeometry(2.2, 0), flat('#6f7780')).translateY(0.8));
  tower.add(new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.85, 5, 10), flat('#f4eedf')).translateY(4.8));
  for (const y of [3.6, 5.6]) tower.add(new THREE.Mesh(new THREE.CylinderGeometry(0.72 - (y - 3.6) * 0.06, 0.78 - (y - 3.6) * 0.06, 0.8, 10), flat('#d8343f')).translateY(y));
  tower.add(new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), glow('#fff3b0', {}, 3)).translateY(7.7));
  tower.add(new THREE.Mesh(new THREE.ConeGeometry(0.7, 0.7, 10), flat('#d8343f')).translateY(8.45));
  const beamGeo = new THREE.ConeGeometry(2.2, 16, 12, 1, true);
  beamGeo.translate(0, -8, 0);
  beamGeo.rotateZ(-Math.PI / 2);
  const beam = new THREE.Mesh(beamGeo, glow('#fff3b0', { transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }, 1.4));
  beam.position.y = 7.7;
  tower.add(beam);
  g.add(tower);

  // Meer (steigt mit der Ladung)
  const seg = low ? 24 : 44;
  const waterGeo = new THREE.PlaneGeometry(SIZE, SIZE, seg, seg);
  waterGeo.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(waterGeo, new THREE.MeshStandardMaterial({ color: '#2a8be0', roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.86, flatShading: true }));
  g.add(water);
  const base = waterGeo.attributes.position.array.slice();
  let frame = 0;

  return {
    group: g,
    update(t, dt, level) {
      water.position.y = 0.45 + level * (FLOOR - 1.35);
      const amp = 0.08 + level * 0.12;
      const pos = waterGeo.attributes.position;
      for (let i = 0; i < pos.count; i += 1) {
        const x = base[i * 3];
        const z = base[i * 3 + 2];
        pos.setY(i, Math.sin(x * 0.45 + t * 1.1) * amp + Math.sin(z * 0.35 - t * 0.8 + x * 0.15) * amp);
      }
      pos.needsUpdate = true;
      frame += 1;
      if (!low || frame % 3 === 0) waterGeo.computeVertexNormals();
      beam.rotation.y = t * 0.45;
    },
  };
}

// ── Dschungel ────────────────────────────────────────────────────────────────────────────────────
// Bäume weiter draußen, ein paar Farne und Leuchtpilze, Glühwürmchen. Ladung: Ranken wachsen im Ring um den Tisch.
function buildDschungel(low) {
  const g = new THREE.Group();
  const rand = rng(37);
  const h = terrain(1.1, 3.7);
  g.add(ground('#2f6f36', h, low));
  const greens = ['#2f9e44', '#37b24d', '#2b8a3e', '#51cf66', '#40a653'];

  const count = low ? 18 : 34;
  const trees = [];
  for (let i = 0; i < count; i += 1) {
    const p = spot(rand, 15, 48);
    trees.push({ ...p, y: h(p.x, p.z), h: Math.min(maxHeight(p.r) - 0.6, 1.6 + rand() * 4), s: 0.9 + rand() * 0.8 });
  }
  const trunk = new THREE.CylinderGeometry(0.13, 0.22, 1, 5);
  trunk.translate(0, 0.5, 0);
  scatter(g, trunk, flat('#6b4a2e'), count, (d, i) => {
    d.position.set(trees[i].x, trees[i].y, trees[i].z);
    d.scale.set(trees[i].s, trees[i].h, trees[i].s);
  });
  scatter(g, new THREE.IcosahedronGeometry(1, 0), flat('#ffffff'), count, (d, i) => {
    const tr = trees[i];
    const s = tr.s * 1.25;
    d.position.set(tr.x, tr.y + tr.h + 0.3, tr.z);
    d.rotation.set(rand() * 3, rand() * 3, rand() * 3);
    d.scale.set(s, s * 0.85, s);
  }, greens);

  // Farne: je fünf Wedel, die nach außen fallen
  const frond = new THREE.ConeGeometry(0.2, 1.5, 4);
  frond.translate(0, 0.75, 0);
  frond.scale(1, 1, 0.3);
  const ferns = [];
  for (let i = 0; i < (low ? 7 : 14); i += 1) {
    const p = spot(rand, 10, 30);
    ferns.push({ ...p, y: h(p.x, p.z), s: 0.7 + rand() * 0.8 });
  }
  scatter(g, frond, flat('#ffffff'), ferns.length * 5, (d, i) => {
    const f = ferns[Math.floor(i / 5)];
    d.rotation.order = 'YXZ';
    d.position.set(f.x, f.y, f.z);
    d.rotation.set(0.95, ((i % 5) / 5) * Math.PI * 2, 0);
    d.scale.setScalar(f.s);
  }, greens);

  // Leuchtpilze
  const shrooms = [];
  for (let i = 0; i < (low ? 4 : 8); i += 1) {
    const p = spot(rand, 12, 30);
    shrooms.push({ ...p, y: h(p.x, p.z), s: 0.6 + rand() * 1 });
  }
  const stem = new THREE.CylinderGeometry(0.1, 0.14, 1, 6);
  stem.translate(0, 0.5, 0);
  scatter(g, stem, flat('#e8e2d0'), shrooms.length, (d, i) => {
    d.position.set(shrooms[i].x, shrooms[i].y, shrooms[i].z);
    d.scale.setScalar(shrooms[i].s);
  });
  const capMat = glow('#ffffff', {}, 1.6);
  scatter(g, new THREE.SphereGeometry(0.5, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), capMat, shrooms.length, (d, i) => {
    d.position.set(shrooms[i].x, shrooms[i].y + shrooms[i].s * 0.95, shrooms[i].z);
    d.scale.set(shrooms[i].s, shrooms[i].s * 0.7, shrooms[i].s);
  }, ['#5df2e0', '#ff8ae0', '#b7ff6a', '#7ab8ff']);

  // Ladung: Ranken wachsen in einem Ring weit um den Tisch nach oben (vorn bleibt der Blick frei)
  const vines = new THREE.Group();
  const vineMat = flat('#2f9e44');
  const leafGeo = new THREE.IcosahedronGeometry(0.34, 0);
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2 + 0.3;
    const bx = Math.sin(a) * 8.2;
    const bz = Math.cos(a) * 8.2 - 0.5;
    if (bz > 2.5) continue;
    const pts = [];
    for (let k = 0; k <= 6; k += 1) {
      const u = k / 6;
      const pull = 1 - u * 0.16;
      pts.push(new THREE.Vector3(bx * pull + Math.sin(u * 7 + i) * 0.5, u * (FLOOR + 1.2), bz * pull + Math.cos(u * 6 + i * 2) * 0.5));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    vines.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 18, 0.16, 5), vineMat));
    for (let k = 1; k <= 5; k += 1) {
      const leafMesh = new THREE.Mesh(leafGeo, k === 5 ? glow('#ff7ab8', {}, 1.6) : flat(greens[(i + k) % greens.length]));
      leafMesh.position.copy(curve.getPoint(k / 5.2));
      leafMesh.position.x += 0.25;
      leafMesh.scale.set(1.3, 0.5, 1);
      leafMesh.rotation.set(k, i, k * 2);
      vines.add(leafMesh);
    }
  }
  g.add(vines);

  const flies = motes(rand, low ? 12 : 34, '#eaff7a', 0.17, 2.6, 5);
  for (let i = 0; i < flies.base.length / 3; i += 1) flies.base[i * 3 + 1] += 0.8;
  g.add(flies.points);

  return {
    group: g,
    update(t, dt, level) {
      capMat.color.setScalar(1.4 + Math.sin(t * 1.6) * 0.25);
      const fa = flies.geo.attributes.position;
      const b = flies.base;
      for (let i = 0; i < b.length / 3; i += 1) {
        fa.setXYZ(i, b[i * 3] + Math.sin(t * 0.6 + i) * 0.6, b[i * 3 + 1] + Math.sin(t * 0.9 + i * 2.3) * 0.4, b[i * 3 + 2] + Math.cos(t * 0.5 + i * 1.7) * 0.6);
      }
      fa.needsUpdate = true;
      vines.visible = level > 0.02;
      vines.scale.y = Math.max(0.001, level);
      vines.rotation.y = Math.sin(t * 0.6) * 0.04;
    },
  };
}

// ── Kosmos ───────────────────────────────────────────────────────────────────────────────────────
// Violetter Grund mit leuchtenden Kristallen, Sterne, ein paar schwebende Brocken. Ladung: das Schwarze Loch über dem
// Tisch wächst (dorthin verschwinden auch Karten, siehe tableScene erupt).
function buildKosmos(low) {
  const g = new THREE.Group();
  const rand = rng(53);
  const h = terrain(1.2, 5.3);
  g.add(ground('#2c2558', h, low));

  const crystal = new THREE.OctahedronGeometry(0.5, 0);
  crystal.translate(0, 0.42, 0);
  const crystalMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3, flatShading: true, emissive: '#6d35d6', emissiveIntensity: 1.5 });
  scatter(g, crystal, crystalMat, low ? 20 : 40, (d) => {
    const p = spot(rand, 11, 46);
    d.position.set(p.x, h(p.x, p.z) - 0.2, p.z);
    d.rotation.set((rand() - 0.5) * 0.5, rand() * 3, (rand() - 0.5) * 0.5);
    d.scale.set(0.6 + rand() * 0.8, Math.min(maxHeight(p.r), 1 + rand() * 4.5), 0.6 + rand() * 0.8);
  }, ['#c77dff', '#9d4edd', '#ff7ad9', '#7b5cff', '#56cfe1']);

  const stars = motes(rand, low ? 90 : 240, '#f3ecff', 0.13, 1.8, 10);
  for (let i = 0; i < stars.base.length / 3; i += 1) stars.geo.attributes.position.setY(i, 1 + rand() * 9);
  stars.mat.opacity = 0.9;
  g.add(stars.points);

  // schwebende Brocken
  const rocks = [];
  const rockGeo = new THREE.DodecahedronGeometry(0.5, 0);
  for (let i = 0; i < (low ? 3 : 6); i += 1) {
    const m = new THREE.Mesh(rockGeo, flat('#5d5296'));
    const p = spot(rand, 12, 34);
    m.position.set(p.x, Math.min(maxHeight(p.r), 2 + rand() * 3.5), p.z);
    m.scale.setScalar(0.6 + rand() * 1);
    m.userData.spin = (rand() - 0.5) * 0.8;
    m.userData.y = m.position.y;
    rocks.push(m);
    g.add(m);
  }

  // Ladung: Schwarzes Loch mit zwei Scheiben und einem Strudel aus Funken, schwebt über dem Tisch
  const hole = new THREE.Group();
  hole.add(new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), glow('#000000')));
  const disc = new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.2, 6, 36), glow('#d0a8ff', {}, 2.8));
  disc.rotation.x = 1.2;
  hole.add(disc);
  const disc2 = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.07, 4, 36), glow('#ff9ee0', {}, 2.8));
  disc2.rotation.x = 1.45;
  disc2.rotation.y = 0.5;
  hole.add(disc2);
  const swirlCount = low ? 50 : 140;
  const swirlPos = new Float32Array(swirlCount * 3);
  for (let i = 0; i < swirlCount; i += 1) {
    const r = 1.3 + (i / swirlCount) * 2.4;
    const a = i * 0.42;
    swirlPos.set([Math.cos(a) * r, (rand() - 0.5) * 0.25, Math.sin(a) * r], i * 3);
  }
  const swirlGeo = new THREE.BufferGeometry();
  swirlGeo.setAttribute('position', new THREE.BufferAttribute(swirlPos, 3));
  const swirlMat = new THREE.PointsMaterial({ color: '#e8d4ff', size: 0.1, map: dotTexture(), alphaTest: 0.3, transparent: true, depthWrite: false });
  swirlMat.color.multiplyScalar(2.4);
  swirlMat.toneMapped = false;
  const swirl = new THREE.Points(swirlGeo, swirlMat);
  swirl.rotation.x = 0.35;
  hole.add(swirl);
  hole.position.set(0, FLOOR + 3.2, -2.4);
  g.add(hole);

  return {
    group: g,
    hole,
    update(t, dt, level) {
      crystalMat.emissiveIntensity = 1.4 + Math.sin(t * 1.2) * 0.35;
      stars.mat.opacity = 0.75 + Math.sin(t * 2) * 0.15;
      for (const m of rocks) {
        m.rotation.x += m.userData.spin * dt;
        m.rotation.y += m.userData.spin * 0.7 * dt;
        m.position.y = m.userData.y + Math.sin(t * 0.6 + m.userData.y) * 0.25;
      }
      hole.visible = level > 0.02;
      hole.scale.setScalar(Math.max(0.001, level * 1.05));
      disc.rotation.z = t * 1.4;
      disc2.rotation.z = -t * 0.9;
      swirl.rotation.y = -t * 1.8;
    },
  };
}

const BUILDERS = [buildVulkan, buildOzean, buildDschungel, buildKosmos];

/**
 * Baut alle vier Welten (je eine Gruppe, Boden bei y = 0). Sichtbar ist immer nur die aktuelle (tableScene showWorld).
 * world.update(t, dt, level): level = gezeigte Ladung 0–1 (bei 1 steht sie an der Tischplatte).
 * @returns {{ root: THREE.Group, worlds: {group: THREE.Group, update: Function, hole?: THREE.Object3D}[] }}
 */
export function buildWorlds(low) {
  const root = new THREE.Group();
  const worlds = BUILDERS.map((build) => {
    const w = build(low);
    w.group.visible = false;
    root.add(w.group);
    return w;
  });
  return { root, worlds };
}
