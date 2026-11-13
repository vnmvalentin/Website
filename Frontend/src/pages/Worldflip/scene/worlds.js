// scene/worlds.js — die Welten-Trommel: eine Röhre mit quadratischem Querschnitt, jede der vier Wände ist eine Welt
// (Vulkan, Ozean, Dschungel, Kosmos). Der Tisch schwebt ein Stück über der Wand, die gerade unten liegt; dreht sich die
// Trommel, wird eine andere Wand zum Boden unter dem Tisch.
//
// Jede Welt lebt (fließende Lava, Rauch und Flammen; Wellen, springende Fische, Leuchtturm, Möwen; Wasserfall,
// Leuchtpilze, Papageien; Nebel, Polarlichter, Ringplanet, Ufo) und zeigt ihre „Ladung" (0–1): Lava steigt, Wasser
// steigt, Ranken wachsen, das Schwarze Loch wächst.
//
// Koordinaten einer Wand (lokal): x quer (−R…R), y nach oben zur Röhrenmitte, z entlang der Röhre.
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

/** Weicher Fleck (Rauch, Nebel, Gischt). */
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
  // Krustenschollen: unregelmäßige dunkle Vielecke
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

// Fallendes Wasser: helle Streifen auf Blau
function fallTexture(rand) {
  const cv = document.createElement('canvas');
  cv.width = 64;
  cv.height = 128;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#4fb4e8';
  ctx.fillRect(0, 0, 64, 128);
  for (let i = 0; i < 40; i += 1) {
    ctx.fillStyle = i % 2 ? '#e8f8ff' : '#9ad8f5';
    ctx.fillRect(rand() * 64, rand() * 128, 2 + rand() * 4, 14 + rand() * 40);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export const R = 10; // halbe Röhrenbreite
/** Abstand Wand–Tischplatte: der Tisch schwebt ein Stück über der Welt, die gerade unten liegt (unter ihm eine Lichtung). */
export const FLOOR = 4.5;
const PLATEAU = 0.5;
// Frei von Felsen, Bäumen und Hügeln: rund um den Tisch und der Streifen zwischen Tisch und Kamera
const inClearing = (x, z) => Math.hypot(x, z) < 7.2 || (z > -2 && Math.abs(x) < 6.8);
const Z0 = -46;
const Z1 = 20;

function rng(seed) {
  let x = seed | 0;
  return () => {
    x = (x + 0x6d2b79f5) | 0;
    let t = Math.imul(x ^ (x >>> 15), x | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// So hoch darf etwas an der Stelle z sein: nahe am Tisch und an der Kamera flach, weiter hinten hoch
const maxHeight = (z) => (z > -8 ? 3.2 : 7);

function ground(color, amp, rand) {
  const geo = new THREE.PlaneGeometry(2 * R, Z1 - Z0, 20, 60);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, (Z0 + Z1) / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const edge = Math.abs(x) > R - 0.1; // Kanten bleiben unten, damit die Wände aneinander schließen
    pos.setY(i, edge ? 0 : inClearing(x, pos.getZ(i)) ? PLATEAU : rand() * amp);
  }
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true }));
  mesh.receiveShadow = true;
  return mesh;
}

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

const flat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true, ...extra });
/** Selbstleuchtend. boost > 1 hebt die Farbe über Weiß hinaus (HDR): nur solche Flächen glühen im Leucht-Durchgang der Szene. */
export function glow(color, extra = {}, boost = 1) {
  const m = new THREE.MeshBasicMaterial({ color, ...extra });
  m.color.multiplyScalar(boost);
  m.toneMapped = false;
  return m;
}

function spot(rand, margin = 1) {
  for (let i = 0; i < 40; i += 1) {
    const p = { x: (rand() * 2 - 1) * (R - margin), z: Z0 + 2 + rand() * (Z1 - Z0 - 4) };
    if (!inClearing(p.x, p.z)) return p;
  }
  return { x: R - margin, z: Z0 + 4 };
}

// Flamme aus drei ineinanderliegenden Kegeln (rot außen, gelb innen)
function makeFlame(size = 1) {
  const g = new THREE.Group();
  [['#ff4a14', 1, 1.7, 1.5], ['#ff9a2e', 0.68, 1.25, 2], ['#ffe27a', 0.4, 0.8, 2.8]].forEach(([color, r, h, boost]) => {
    const geo = new THREE.ConeGeometry(0.32 * r * size, h * size, 7);
    geo.translate(0, (h * size) / 2, 0);
    g.add(new THREE.Mesh(geo, glow(color, { transparent: true, opacity: 0.92 }, boost)));
  });
  return g;
}

// Vogel: Rumpf und zwei Flügel, die um die Schulter schlagen
function makeBird(body, wing, size = 1) {
  const g = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.16 * size, 8, 6), flat(body));
  torso.scale.set(1, 0.7, 1.9);
  g.add(torso);
  const wings = [-1, 1].map((side) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, -0.16 * size, 0, 0, 0.2 * size, side * 0.75 * size, 0, 0.02 * size]), 3));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: wing, side: THREE.DoubleSide }));
    g.add(m);
    return m;
  });
  g.userData.flap = (t) => {
    const a = Math.sin(t) * 0.75;
    wings[0].rotation.z = a;
    wings[1].rotation.z = -a;
  };
  return g;
}

// ── Vulkan ───────────────────────────────────────────────────────────────────────────────────────
function buildVulkan(low) {
  const g = new THREE.Group();
  const rand = rng(11);
  g.add(ground('#40302c', 1.5, rand));

  scatter(g, new THREE.DodecahedronGeometry(0.6, 0), flat('#2b2020'), low ? 30 : 70, (d) => {
    const p = spot(rand);
    const s = 0.5 + rand() * 1.4;
    d.position.set(p.x, s * 0.3 + 0.4, p.z);
    d.rotation.set(rand() * 3, rand() * 3, rand() * 3);
    d.scale.set(s, s * (0.6 + rand() * 0.6), s);
  });
  // Obsidian-Nadeln
  const needle = new THREE.OctahedronGeometry(0.4, 0);
  needle.translate(0, 0.38, 0);
  scatter(g, needle, new THREE.MeshStandardMaterial({ color: '#171320', roughness: 0.2, metalness: 0.5, flatShading: true }), low ? 16 : 40, (d) => {
    const p = spot(rand);
    d.position.set(p.x, 0.5, p.z);
    d.rotation.set((rand() - 0.5) * 0.5, rand() * 3, (rand() - 0.5) * 0.5);
    d.scale.set(0.7 + rand(), Math.min(maxHeight(p.z), 1.5 + rand() * 4), 0.7 + rand());
  });

  // Lava: eine fließende Textur für Adern, Krater, Lavafall und See
  const lava = lavaTexture(rand);
  lava.repeat.set(0.6, 1.6);
  const lavaMat = new THREE.MeshBasicMaterial({ map: lava });
  lavaMat.color.setScalar(1.6);
  lavaMat.toneMapped = false;

  const crack = new THREE.PlaneGeometry(1, 1);
  crack.rotateX(-Math.PI / 2);
  scatter(g, crack, lavaMat, 26, (d) => {
    const p = spot(rand, 1.5);
    d.position.set(p.x, 1.56, p.z);
    d.rotation.y = rand() * Math.PI;
    d.scale.set(0.3 + rand() * 0.4, 1, 2.5 + rand() * 4.5);
  });

  // Vulkankegel mit glühendem Krater
  const cone = new THREE.CylinderGeometry(0.32, 1, 1, 7, 1);
  cone.translate(0, 0.5, 0);
  const cones = [];
  for (let i = 0; i < 9; i += 1) {
    const p = spot(rand, 2.5);
    const h = Math.min(maxHeight(p.z), 2.2 + rand() * 5);
    cones.push({ ...p, h, r: h * (0.55 + rand() * 0.2) });
  }
  scatter(g, cone, flat('#4a2f29'), cones.length, (d, i) => {
    d.position.set(cones[i].x, 0, cones[i].z);
    d.scale.set(cones[i].r, cones[i].h, cones[i].r);
  });
  const lid = new THREE.CylinderGeometry(0.3, 0.3, 0.06, 7);
  scatter(g, lid, glow('#ffb02e', {}, 3.2), cones.length, (d, i) => {
    d.position.set(cones[i].x, cones[i].h + 0.02, cones[i].z);
    d.scale.set(cones[i].r, 1, cones[i].r);
  });

  // Der große Vulkan am Ende der Welt: Lavafall die Flanke hinunter, Rauchsäule aus dem Krater
  const big = new THREE.Group();
  big.position.set(2.5, 0, -34);
  big.add(new THREE.Mesh(new THREE.CylinderGeometry(1.3, 6.8, 11, 9, 1), flat('#3a2622')).translateY(5.5));
  big.add(new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.1, 9), glow('#ffb02e', {}, 3.4)).translateY(11.02));
  const fallTex = lava.clone();
  fallTex.repeat.set(0.5, 3);
  const fallMat = new THREE.MeshBasicMaterial({ map: fallTex });
  fallMat.color.setScalar(2.1);
  fallMat.toneMapped = false;
  const fall = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 12.2), fallMat);
  fall.position.set(0, 5.6, 4.15);
  fall.rotation.x = -0.465; // liegt auf der Flanke
  big.add(fall);
  g.add(big);
  const smoke = [];
  for (let i = 0; i < (low ? 5 : 11); i += 1) {
    const s = puff('#3b3336', 3, 0.5);
    s.userData.off = i / 11;
    smoke.push(s);
    g.add(s);
  }

  // Flammen, die aus dem Boden schlagen
  const flames = [];
  for (let i = 0; i < (low ? 4 : 9); i += 1) {
    const f = makeFlame(1 + rand() * 0.6);
    const p = spot(rand, 1.5);
    f.position.set(p.x, 0.9, p.z);
    f.userData.off = rand() * 10;
    flames.push(f);
    g.add(f);
  }

  // Funken
  const n = low ? 60 : 190;
  const emberPos = new Float32Array(n * 3);
  const speed = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const p = spot(rand);
    emberPos.set([p.x, rand() * 9, p.z], i * 3);
    speed[i] = 0.5 + rand() * 1.6;
  }
  const emberGeo = new THREE.BufferGeometry();
  emberGeo.setAttribute('position', new THREE.BufferAttribute(emberPos, 3));
  const emberMat = new THREE.PointsMaterial({ color: '#ffc45e', size: 0.2, map: dotTexture(), alphaTest: 0.3, transparent: true, opacity: 0.5, depthWrite: false });
  emberMat.color.multiplyScalar(2.4);
  emberMat.toneMapped = false;
  g.add(new THREE.Points(emberGeo, emberMat));

  // Lavabrocken springen aus den Kratern
  const blobGeo = new THREE.IcosahedronGeometry(0.22, 0);
  const blobs = cones.slice(0, low ? 3 : 8).map((c, i) => {
    const m = new THREE.Mesh(blobGeo, glow('#ffb02e', {}, 2.4));
    m.userData = { c, off: i * 0.83, dx: (rand() - 0.5) * 3.4, dz: (rand() - 0.5) * 3.4 };
    g.add(m);
    return m;
  });

  // Ladung: Lavasee steigt
  const lakeTex = lava.clone(); // feiner gekachelt als die Adern: der See ist groß
  lakeTex.repeat.set(2.5, 8);
  const lakeMat = new THREE.MeshBasicMaterial({ map: lakeTex, transparent: true, opacity: 0.95 });
  lakeMat.color.setScalar(1.1);
  lakeMat.toneMapped = false;
  const lake = new THREE.Mesh(new THREE.PlaneGeometry(2 * R, Z1 - Z0), lakeMat);
  lake.rotation.x = -Math.PI / 2;
  lake.position.z = (Z0 + Z1) / 2;
  g.add(lake);

  return {
    group: g,
    update(t, dt, level) {
      lava.offset.y -= dt * 0.035;
      lakeTex.offset.y -= dt * 0.06;
      lakeTex.offset.x += dt * 0.02;
      lava.offset.x += dt * 0.008;
      fallTex.offset.y += dt * 0.42;
      for (const s of smoke) {
        const u = (t * 0.07 + s.userData.off) % 1;
        s.position.set(2.5 + Math.sin(u * 5 + s.userData.off * 20) * 1.6 + u * 3, 11.5 + u * 10, -34);
        s.scale.setScalar(2.4 + u * 7);
        s.material.opacity = Math.sin(u * Math.PI) * 0.55;
      }
      for (const f of flames) {
        const o = f.userData.off;
        // lodern, ab und zu eine Stichflamme; mit der Ladung höher
        const burst = Math.max(0, Math.sin(t * 0.7 + o)) ** 8 * 1.6;
        f.scale.set(1 + Math.sin(t * 11 + o) * 0.1, 0.75 + Math.sin(t * 9 + o * 3) * 0.16 + burst + level * 1.1, 1 + Math.cos(t * 10 + o) * 0.1);
      }
      for (const b of blobs) {
        const u = (t * 0.55 + b.userData.off) % 2.2;
        b.visible = u < 1;
        const { c, dx, dz } = b.userData;
        b.position.set(c.x + dx * u, c.h + Math.sin(u * Math.PI) * (1.6 + level * 2.5), c.z + dz * u);
      }
      lake.visible = level > 0.02;
      lake.position.y = -0.3 + level * (FLOOR - 0.6) + Math.sin(t * 1.3) * 0.06; // wenig Ladung: nur in den Senken
      emberMat.opacity = 0.35 + Math.min(1, level) * 0.6;
      emberMat.size = 0.18 + level * 0.14;
      const a = emberGeo.attributes.position;
      const boost = 1 + level * 3;
      for (let i = 0; i < n; i += 1) {
        let y = a.getY(i) + speed[i] * dt * boost;
        if (y > 9.5) y = 0;
        a.setY(i, y);
      }
      a.needsUpdate = true;
    },
  };
}

// ── Ozean ────────────────────────────────────────────────────────────────────────────────────────
// Fisch mit Schwanzflosse, Rückenflosse und Augen; schaut nach +x
function makeFish(color, belly, size = 1) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), flat(color));
  body.scale.set(1.9, 0.85, 0.6);
  g.add(body);
  const under = new THREE.Mesh(new THREE.SphereGeometry(0.27, 10, 6), flat(belly));
  under.scale.set(1.7, 0.6, 0.55);
  under.position.y = -0.07;
  g.add(under);
  const tail = new THREE.Group();
  for (const up of [1, -1]) {
    const lobe = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.42, 4), flat(color));
    lobe.scale.z = 0.25;
    lobe.position.set(-0.2, up * 0.13, 0);
    lobe.rotation.z = Math.PI / 2 + up * 0.75;
    tail.add(lobe);
  }
  tail.position.x = -0.5;
  g.add(tail);
  const fin = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.3, 4), flat(color));
  fin.scale.z = 0.2;
  fin.position.set(-0.02, 0.3, 0);
  fin.rotation.z = -0.5;
  g.add(fin);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 5), new THREE.MeshBasicMaterial({ color: '#14121a' }));
    eye.position.set(0.36, 0.07, side * 0.13);
    g.add(eye);
  }
  g.scale.setScalar(size);
  g.rotation.order = 'YZX';
  g.userData.tail = tail;
  return g;
}

function buildOzean(low) {
  const g = new THREE.Group();
  const rand = rng(23);
  g.add(ground('#d9c48c', 0.5, rand));

  // Inseln mit Palmen
  const islands = [];
  for (let i = 0; i < 9; i += 1) {
    const p = spot(rand, 3);
    islands.push({ ...p, s: 1.6 + rand() * 1.8 });
  }
  scatter(g, new THREE.SphereGeometry(1, 9, 6), flat('#e3cf97'), islands.length, (d, i) => {
    d.position.set(islands[i].x, 0.2, islands[i].z);
    d.scale.set(islands[i].s, 1.25, islands[i].s);
  });
  const trunk = new THREE.CylinderGeometry(0.09, 0.15, 1, 5);
  trunk.translate(0, 0.5, 0);
  const palms = islands.map((is) => ({ ...is, h: Math.min(maxHeight(is.z) - 0.6, 1.6 + rand() * 1.8), lean: (rand() - 0.5) * 0.4 }));
  scatter(g, trunk, flat('#8a6a43'), palms.length, (d, i) => {
    d.position.set(palms[i].x, 1.3, palms[i].z);
    d.rotation.z = palms[i].lean;
    d.scale.set(1, palms[i].h, 1);
  });
  const leaf = new THREE.ConeGeometry(0.22, 1.5, 4);
  leaf.translate(0, 0.75, 0);
  scatter(g, leaf, flat('#3f9d4e'), palms.length * 5, (d, i) => {
    const p = palms[Math.floor(i / 5)];
    const a = ((i % 5) / 5) * Math.PI * 2;
    d.position.set(p.x - Math.sin(p.lean) * p.h, 1.3 + Math.cos(p.lean) * p.h, p.z);
    d.rotation.set(Math.cos(a) * 1.25, 0, Math.sin(a) * 1.25);
  });
  scatter(g, new THREE.DodecahedronGeometry(0.5, 0), flat('#7d8790'), low ? 16 : 36, (d) => {
    const p = spot(rand);
    d.position.set(p.x, 0.4, p.z);
    d.rotation.set(rand() * 3, rand() * 3, rand() * 3);
    d.scale.setScalar(0.5 + rand() * 1.2);
  });

  // Leuchtturm auf einem Felsen, der Lichtkegel kreist
  const tower = new THREE.Group();
  tower.position.set(-5.5, 0, -30);
  tower.add(new THREE.Mesh(new THREE.DodecahedronGeometry(2.2, 0), flat('#6f7780')).translateY(0.6));
  tower.add(new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.85, 5, 10), flat('#f4eedf')).translateY(4.6));
  for (const y of [3.4, 5.4]) tower.add(new THREE.Mesh(new THREE.CylinderGeometry(0.72 - (y - 3.4) * 0.06, 0.78 - (y - 3.4) * 0.06, 0.8, 10), flat('#d8343f')).translateY(y));
  tower.add(new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), glow('#fff3b0', {}, 3)).translateY(7.5));
  tower.add(new THREE.Mesh(new THREE.ConeGeometry(0.7, 0.7, 10), flat('#d8343f')).translateY(8.25));
  const beamGeo = new THREE.ConeGeometry(2.2, 16, 12, 1, true);
  beamGeo.translate(0, -8, 0);
  beamGeo.rotateZ(-Math.PI / 2); // Spitze an der Lampe, Kegel nach +x
  const beam = new THREE.Mesh(beamGeo, glow('#fff3b0', { transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }, 1.4));
  beam.position.y = 7.5;
  tower.add(beam);
  g.add(tower);

  // Möwen kreisen
  const gulls = [];
  for (let i = 0; i < (low ? 3 : 6); i += 1) {
    const b = makeBird('#f4f4f4', '#dfe6ee', 1.3);
    b.userData.orbit = { cx: (rand() - 0.5) * 8, cz: -14 - rand() * 18, r: 3 + rand() * 4, y: 5 + rand() * 3, speed: 0.35 + rand() * 0.3, off: rand() * 6 };
    gulls.push(b);
    g.add(b);
  }

  // Meer (steigt mit der Ladung): Wellen, Boote, Bojen, Fische
  const sea = new THREE.Group();
  const waterGeo = new THREE.PlaneGeometry(2 * R, Z1 - Z0, low ? 12 : 22, low ? 30 : 52);
  waterGeo.rotateX(-Math.PI / 2);
  waterGeo.translate(0, 0, (Z0 + Z1) / 2);
  const water = new THREE.Mesh(waterGeo, new THREE.MeshStandardMaterial({ color: '#2a8be0', roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.84, flatShading: true }));
  sea.add(water);

  const boats = [];
  const hullGeo = new THREE.CylinderGeometry(0.34, 0.2, 1.5, 4, 1);
  hullGeo.rotateX(Math.PI / 2);
  hullGeo.scale(1, 0.5, 1);
  const sailGeo = new THREE.BufferGeometry();
  sailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0.25, -0.55, 0, 0.25, 0.6, 0, 1.6, -0.05]), 3));
  sailGeo.computeVertexNormals();
  const sailColors = ['#fff3d6', '#ff8a5c', '#ffffff', '#ffd23f', '#fff3d6'];
  for (let i = 0; i < 5; i += 1) {
    const b = new THREE.Group();
    b.add(new THREE.Mesh(hullGeo, flat('#7a4a2b')));
    b.add(new THREE.Mesh(sailGeo, new THREE.MeshBasicMaterial({ color: sailColors[i], side: THREE.DoubleSide })));
    b.add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 4), flat('#5a3a22')).translateY(0.8));
    const p = spot(rand, 2.5);
    b.position.set(p.x, 0.12, Math.min(p.z, -9 - i * 2));
    b.rotation.y = rand() * Math.PI * 2;
    b.userData.phase = rand() * 6;
    boats.push(b);
    sea.add(b);
  }
  // Bojen
  for (let i = 0; i < 4; i += 1) {
    const b = new THREE.Group();
    b.add(new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), flat('#e7453c')));
    b.add(new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.12, 10), flat('#f4eedf')));
    b.add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 5), flat('#3a3f4a')).translateY(0.5));
    b.add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), glow('#ffe27a', {}, 2.6)).translateY(0.88));
    const p = spot(rand, 2);
    b.position.set(p.x, 0.05, p.z);
    b.userData.phase = rand() * 6;
    boats.push(b);
    sea.add(b);
  }

  // Fische springen in Bögen aus dem Wasser, zwei Delfine ziehen größere Bögen; wo sie ein- und austauchen: Ringe
  const fishColors = [['#ff9a3d', '#ffe0b0'], ['#ffd23f', '#fff3c4'], ['#ff6f91', '#ffd3df'], ['#57d6c9', '#d6fff8']];
  const fish = [];
  const count = low ? 4 : 8;
  for (let i = 0; i < count + 2; i += 1) {
    const dolphin = i >= count;
    const [color, belly] = dolphin ? ['#6f8fb5', '#dfe8f2'] : fishColors[i % fishColors.length];
    const f = makeFish(color, belly, dolphin ? 2.4 : 0.8 + rand() * 0.5);
    const p = spot(rand, 2.5);
    f.userData = { ...f.userData, x: p.x, z: Math.min(p.z, dolphin ? -12 : -5), dir: rand() * Math.PI * 2, off: rand() * 6, span: dolphin ? 5 : 2 + rand(), h: dolphin ? 2.4 : 1.2 + rand() * 0.6, period: dolphin ? 5.5 : 2.6 + rand() * 2, wet: true };
    fish.push(f);
    sea.add(f);
  }
  const ringGeo = new THREE.TorusGeometry(1, 0.05, 5, 24);
  ringGeo.rotateX(Math.PI / 2);
  const rings = [];
  for (let i = 0; i < 12; i += 1) {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#e8f8ff', transparent: true, opacity: 0, depthWrite: false }));
    m.userData.age = 9;
    rings.push(m);
    sea.add(m);
  }
  let nextRing = 0;
  const ripple = (x, z, size) => {
    const m = rings[nextRing];
    nextRing = (nextRing + 1) % rings.length;
    m.position.set(x, 0.08, z);
    m.userData.age = 0;
    m.userData.size = size;
  };
  g.add(sea);

  const base = waterGeo.attributes.position.array.slice();
  let frame = 0;

  return {
    group: g,
    update(t, dt, level) {
      sea.position.y = 0.32 + level * (FLOOR - 1.35);
      // Wellen: mit der Ladung höher
      const amp = 0.09 + level * 0.16;
      const pos = waterGeo.attributes.position;
      for (let i = 0; i < pos.count; i += 1) {
        const x = base[i * 3];
        const z = base[i * 3 + 2];
        pos.setY(i, Math.sin(x * 0.7 + t * 1.5) * amp + Math.sin(z * 0.5 - t * 1.1 + x * 0.2) * amp);
      }
      pos.needsUpdate = true;
      frame += 1;
      if (!low || frame % 3 === 0) waterGeo.computeVertexNormals();

      for (const b of boats) {
        b.rotation.z = Math.sin(t * 1.4 + b.userData.phase) * 0.12;
        b.position.y = 0.1 + Math.sin(t * 1.5 + b.userData.phase) * amp;
      }
      for (const f of fish) {
        const u = f.userData;
        const k = ((t + u.off) % u.period) / (u.period * 0.42); // 0–1: in der Luft, danach unter Wasser
        const air = k < 1;
        if (air !== !u.wet) {
          // ein- oder ausgetaucht: Ring auf dem Wasser
          const at = air ? 0 : u.span;
          ripple(u.x + Math.cos(u.dir) * at, u.z - Math.sin(u.dir) * at, u.span > 4 ? 2.2 : 1);
          u.wet = !air;
        }
        f.visible = air;
        if (!air) continue;
        f.position.set(u.x + Math.cos(u.dir) * k * u.span, Math.sin(k * Math.PI) * u.h - 0.15, u.z - Math.sin(u.dir) * k * u.span);
        f.rotation.y = u.dir;
        f.rotation.z = Math.cos(k * Math.PI) * 1.05;
        u.tail.rotation.y = Math.sin(t * 22 + u.off) * 0.5;
      }
      for (const m of rings) {
        m.userData.age += dt;
        const a = m.userData.age / 1.1;
        m.visible = a < 1;
        if (!m.visible) continue;
        m.scale.setScalar((0.2 + a) * m.userData.size);
        m.material.opacity = (1 - a) * 0.8;
      }
      beam.rotation.y = t * 0.7;
      for (const b of gulls) {
        const o = b.userData.orbit;
        const a = t * o.speed + o.off;
        b.position.set(o.cx + Math.cos(a) * o.r, o.y + Math.sin(a * 2) * 0.4, o.cz + Math.sin(a) * o.r);
        b.rotation.y = -a;
        b.userData.flap(t * 7 + o.off);
      }
    },
  };
}

// ── Dschungel ────────────────────────────────────────────────────────────────────────────────────
function buildDschungel(low) {
  const g = new THREE.Group();
  const rand = rng(37);
  g.add(ground('#2f6f36', 0.6, rand));
  const greens = ['#2f9e44', '#37b24d', '#2b8a3e', '#51cf66', '#40a653'];

  const count = low ? 34 : 80;
  const trees = [];
  for (let i = 0; i < count; i += 1) {
    const p = spot(rand, 1.2);
    trees.push({ ...p, h: Math.min(maxHeight(p.z) - 1, 1.4 + rand() * 4.2), s: 0.8 + rand() * 0.8 });
  }
  const trunk = new THREE.CylinderGeometry(0.13, 0.22, 1, 5);
  trunk.translate(0, 0.5, 0);
  scatter(g, trunk, flat('#6b4a2e'), count, (d, i) => {
    d.position.set(trees[i].x, 0, trees[i].z);
    d.scale.set(trees[i].s, trees[i].h, trees[i].s);
  });
  scatter(g, new THREE.IcosahedronGeometry(1, 0), flat('#ffffff'), count * 2, (d, i) => {
    const tr = trees[i >> 1];
    const top = i & 1;
    const s = tr.s * (top ? 0.75 : 1.1);
    d.position.set(tr.x + (top ? (rand() - 0.5) * 0.5 : 0), tr.h + (top ? 0.9 * tr.s : 0.1), tr.z + (top ? (rand() - 0.5) * 0.5 : 0));
    d.rotation.set(rand() * 3, rand() * 3, rand() * 3);
    d.scale.set(s, s * 0.85, s);
  }, greens);

  // Farne: je fünf Wedel, die nach außen fallen
  const frond = new THREE.ConeGeometry(0.2, 1.5, 4);
  frond.translate(0, 0.75, 0);
  frond.scale(1, 1, 0.3);
  const ferns = [];
  for (let i = 0; i < (low ? 20 : 50); i += 1) ferns.push({ ...spot(rand), s: 0.6 + rand() * 0.8 });
  scatter(g, frond, flat('#ffffff'), ferns.length * 5, (d, i) => {
    const f = ferns[Math.floor(i / 5)];
    d.rotation.order = 'YXZ';
    d.position.set(f.x, 0.45, f.z);
    d.rotation.set(0.95, ((i % 5) / 5) * Math.PI * 2, 0);
    d.scale.setScalar(f.s);
  }, greens);

  // Leuchtpilze
  const shrooms = [];
  for (let i = 0; i < (low ? 8 : 20); i += 1) shrooms.push({ ...spot(rand), s: 0.5 + rand() * 1.1 });
  const stem = new THREE.CylinderGeometry(0.1, 0.14, 1, 6);
  stem.translate(0, 0.5, 0);
  scatter(g, stem, flat('#e8e2d0'), shrooms.length, (d, i) => {
    d.position.set(shrooms[i].x, 0.4, shrooms[i].z);
    d.scale.setScalar(shrooms[i].s);
  });
  const capGeo = new THREE.SphereGeometry(0.5, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  const capMat = glow('#ffffff', {}, 1.7);
  scatter(g, capGeo, capMat, shrooms.length, (d, i) => {
    d.position.set(shrooms[i].x, 0.4 + shrooms[i].s * 0.95, shrooms[i].z);
    d.scale.set(shrooms[i].s, shrooms[i].s * 0.7, shrooms[i].s);
  }, ['#5df2e0', '#ff8ae0', '#b7ff6a', '#7ab8ff']);

  // Blüten
  scatter(g, new THREE.IcosahedronGeometry(0.14, 0), flat('#ffffff'), low ? 30 : 90, (d) => {
    const p = spot(rand);
    d.position.set(p.x, 0.75 + rand() * 0.3, p.z);
  }, ['#ff7ab8', '#ffd23f', '#ffffff', '#ff8a5c']);

  // Stufentempel mit leuchtendem Zeichen und zwei Fackeln
  const stone = flat('#9c987a');
  for (let i = 0; i < 5; i += 1) {
    const w = 6.4 - i * 1.25;
    g.add(new THREE.Mesh(new THREE.BoxGeometry(w, 1.1, w), stone).translateX(1.5).translateY(0.75 + i * 1.1).translateZ(-24));
  }
  const glyph = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.45, 6), glow('#b7ff6a', { side: THREE.DoubleSide }, 2.4));
  glyph.position.set(1.5, 5.2, -23.2);
  g.add(glyph);
  const torches = [-1.6, 1.6].map((x) => {
    const f = makeFlame(0.8);
    f.position.set(1.5 + x, 1.85, -20.75);
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.1, 6), flat('#5a3a22')).translateX(1.5 + x).translateY(1.3).translateZ(-20.75));
    g.add(f);
    return f;
  });

  // Wasserfall von einer Felswand, unten Gischt
  const cliff = new THREE.Group();
  cliff.position.set(-6.4, 0, -31);
  cliff.add(new THREE.Mesh(new THREE.BoxGeometry(6.5, 9, 3), flat('#5d6b4a')).translateY(4.5));
  cliff.add(new THREE.Mesh(new THREE.BoxGeometry(7, 0.8, 3.4), flat('#3a8f47')).translateY(9.2));
  const fallTex = fallTexture(rand);
  fallTex.repeat.set(1, 2);
  const fallMat = new THREE.MeshBasicMaterial({ map: fallTex, transparent: true, opacity: 0.92 });
  fallMat.color.setScalar(1.25);
  fallMat.toneMapped = false;
  cliff.add(new THREE.Mesh(new THREE.PlaneGeometry(2.2, 9), fallMat).translateY(4.6).translateZ(1.56));
  cliff.add(new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 0.1, 14), flat('#3aa6d8', { roughness: 0.2 })).translateY(0.6).translateZ(2.6));
  const mist = [];
  for (let i = 0; i < 5; i += 1) {
    const s = puff('#e8f8ff', 2.4, 0.4);
    s.userData.off = i / 5;
    mist.push(s);
    cliff.add(s);
  }
  g.add(cliff);

  // Papageien fliegen quer durch den Wald
  const parrots = [];
  const plumage = [['#e7453c', '#ffd23f'], ['#2f6fd6', '#ffd23f'], ['#37b24d', '#e7453c'], ['#ff8a3d', '#2f6fd6']];
  for (let i = 0; i < (low ? 2 : 4); i += 1) {
    const b = makeBird(plumage[i][0], plumage[i][1], 1.2);
    b.userData.fly = { y: 4.5 + rand() * 2.5, z: -10 - rand() * 22, speed: 2.2 + rand() * 1.5, off: rand() * 20, dir: i % 2 ? 1 : -1 };
    parrots.push(b);
    g.add(b);
  }

  // Ladung: Ranken wachsen in einem Ring weit um den Tisch nach oben (vorn bleibt der Blick frei)
  const vines = new THREE.Group();
  const vineMat = flat('#2f9e44');
  const leafGeo = new THREE.IcosahedronGeometry(0.34, 0);
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2 + 0.3;
    const bx = Math.sin(a) * 7.6;
    const bz = Math.cos(a) * 7.6 - 0.5;
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

  // Glühwürmchen
  const flyCount = low ? 16 : 50;
  const flyBase = new Float32Array(flyCount * 3);
  for (let i = 0; i < flyCount; i += 1) {
    const p = spot(rand, 1);
    flyBase.set([p.x, 0.8 + rand() * Math.min(5, maxHeight(p.z) + 1), p.z], i * 3);
  }
  const flyGeo = new THREE.BufferGeometry();
  flyGeo.setAttribute('position', new THREE.BufferAttribute(flyBase.slice(), 3));
  const flyMat = new THREE.PointsMaterial({ color: '#eaff7a', size: 0.17, map: dotTexture(), alphaTest: 0.3, transparent: true, depthWrite: false });
  flyMat.color.multiplyScalar(2.6);
  flyMat.toneMapped = false;
  g.add(new THREE.Points(flyGeo, flyMat));

  return {
    group: g,
    update(t, dt, level) {
      fallTex.offset.y += dt * 0.9;
      for (const s of mist) {
        const u = (t * 0.3 + s.userData.off) % 1;
        s.position.set(Math.sin(s.userData.off * 30) * 1.4, 0.8 + u * 1.6, 2.4 + u * 0.8);
        s.scale.setScalar(1.6 + u * 2.4);
        s.material.opacity = Math.sin(u * Math.PI) * 0.42;
      }
      torches.forEach((f, i) => f.scale.set(1, 0.85 + Math.sin(t * 10 + i * 2) * 0.15, 1));
      glyph.rotation.z = t * 0.6;
      capMat.color.setScalar(1.45 + Math.sin(t * 1.6) * 0.3);
      for (const b of parrots) {
        const f = b.userData.fly;
        const x = (((t * f.speed + f.off) % 26) - 13) * f.dir;
        b.position.set(x, f.y + Math.sin(t * 1.3 + f.off) * 0.4, f.z);
        b.rotation.y = f.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        b.userData.flap(t * 11 + f.off);
      }
      const fa = flyGeo.attributes.position;
      for (let i = 0; i < flyCount; i += 1) {
        fa.setXYZ(i, flyBase[i * 3] + Math.sin(t * 0.7 + i) * 0.6, flyBase[i * 3 + 1] + Math.sin(t * 1.1 + i * 2.3) * 0.4, flyBase[i * 3 + 2] + Math.cos(t * 0.6 + i * 1.7) * 0.6);
      }
      fa.needsUpdate = true;
      vines.visible = level > 0.02;
      vines.scale.y = Math.max(0.001, level);
      vines.rotation.y = Math.sin(t * 0.6) * 0.04;
    },
  };
}

// ── Kosmos ───────────────────────────────────────────────────────────────────────────────────────
function buildKosmos(low) {
  const g = new THREE.Group();
  const rand = rng(53);
  g.add(ground('#2c2558', 0.9, rand));

  const crystal = new THREE.OctahedronGeometry(0.5, 0);
  crystal.translate(0, 0.42, 0);
  const cc = ['#c77dff', '#9d4edd', '#ff7ad9', '#7b5cff', '#56cfe1'];
  const crystalMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3, flatShading: true, emissive: '#6d35d6', emissiveIntensity: 1.7 });
  scatter(g, crystal, crystalMat, low ? 34 : 80, (d) => {
    const p = spot(rand);
    d.position.set(p.x, 0.2, p.z);
    d.rotation.set((rand() - 0.5) * 0.5, rand() * 3, (rand() - 0.5) * 0.5);
    d.scale.set(0.6 + rand() * 0.9, Math.min(maxHeight(p.z), 1 + rand() * 5.5), 0.6 + rand() * 0.9);
  }, cc);

  const crater = new THREE.RingGeometry(0.6, 1, 10);
  crater.rotateX(-Math.PI / 2);
  scatter(g, crater, glow('#1b1740'), 14, (d) => {
    const p = spot(rand, 2);
    d.position.set(p.x, 0.95, p.z);
    d.scale.setScalar(0.8 + rand() * 1.6);
  });

  // Sterne
  const n = low ? 120 : 420;
  const starPos = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 1) {
    const p = spot(rand, 0.2);
    starPos.set([p.x, 0.8 + rand() * 9, p.z], i * 3);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({ color: '#f3ecff', size: 0.13, map: dotTexture(), alphaTest: 0.3, transparent: true, opacity: 0.9, depthWrite: false });
  starMat.color.multiplyScalar(1.8);
  starMat.toneMapped = false;
  g.add(new THREE.Points(starGeo, starMat));

  // Nebelschwaden in der Ferne
  const nebula = [];
  ['#9b62f2', '#ff7ad9', '#56cfe1', '#7b5cff', '#ff9a6a', '#9b62f2', '#56cfe1'].slice(0, low ? 4 : 7).forEach((color, i) => {
    const s = puff(color, 13 + rand() * 9, 0.26);
    s.position.set((rand() - 0.5) * 16, 6 + rand() * 5, -18 - rand() * 24);
    s.userData = { x: s.position.x, off: i * 1.3 };
    nebula.push(s);
    g.add(s);
  });

  // Polarlichter: wehende Bänder
  const auroras = [];
  [['#5df2c0', -20, 9.5], ['#7ab8ff', -27, 10.5], ['#ff8ae0', -34, 9]].slice(0, low ? 1 : 3).forEach(([color, z, y], i) => {
    const geo = new THREE.PlaneGeometry(17, 2.2, 34, 1);
    const m = new THREE.Mesh(geo, glow(color, { transparent: true, opacity: 0.34, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }, 1.5));
    m.position.set(0, y, z);
    m.userData = { base: geo.attributes.position.array.slice(), off: i * 2.1 };
    auroras.push(m);
    g.add(m);
  });

  // Ringplanet mit zwei Monden und einem Gürtel aus Brocken
  const planet = new THREE.Group();
  planet.position.set(-5, 8.6, -25);
  planet.add(new THREE.Mesh(new THREE.SphereGeometry(2.6, 16, 12), flat('#f2a65a')));
  planet.add(new THREE.Mesh(new THREE.SphereGeometry(2.62, 16, 4, 0, Math.PI * 2, 1.2, 0.3), flat('#d9803a')));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(4, 0.22, 4, 36), glow('#ffe0b0', {}, 1.5));
  ring.rotation.x = 1.25;
  planet.add(ring);
  const moons = [['#cfd6e6', 5.6, 0.5, 0.9], ['#ff9a8a', 7.2, 0.34, -0.6]].map(([color, r, size, speed]) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(size, 10, 8), flat(color));
    m.userData = { r, speed };
    planet.add(m);
    return m;
  });
  const belt = new THREE.Group();
  scatter(belt, new THREE.DodecahedronGeometry(0.2, 0), flat('#8c7fb8'), low ? 20 : 46, (d, i) => {
    const a = (i / 46) * Math.PI * 2;
    const r = 8.6 + rand() * 1.4;
    d.position.set(Math.cos(a) * r, (rand() - 0.5) * 0.6, Math.sin(a) * r);
    d.rotation.set(rand() * 3, rand() * 3, rand() * 3);
    d.scale.setScalar(0.5 + rand() * 1.4);
  });
  belt.rotation.x = 0.35;
  planet.add(belt);
  g.add(planet);

  // schwebende Brocken
  const rocks = [];
  const rockGeo = new THREE.DodecahedronGeometry(0.5, 0);
  for (let i = 0; i < 9; i += 1) {
    const m = new THREE.Mesh(rockGeo, flat('#5d5296'));
    const p = spot(rand, 2);
    m.position.set(p.x, Math.min(maxHeight(p.z), 2 + rand() * 4), p.z);
    m.scale.setScalar(0.5 + rand() * 1.1);
    m.userData.spin = (rand() - 0.5) * 1.2;
    m.userData.y = m.position.y;
    rocks.push(m);
    g.add(m);
  }

  // Ufo dreht seine Runden und leuchtet nach unten
  const ufo = new THREE.Group();
  ufo.add(new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 8), new THREE.MeshStandardMaterial({ color: '#aab4c8', roughness: 0.3, metalness: 0.7 })).rotateX(0));
  ufo.children[0].scale.y = 0.28;
  ufo.add(new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), glow('#7af0ff', { transparent: true, opacity: 0.85 }, 1.6)).translateY(0.1));
  for (let i = 0; i < 6; i += 1) {
    ufo.add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), glow(i % 2 ? '#ff7ad9' : '#ffe27a', {}, 2.8)).translateX(Math.cos(i) * 0.78).translateZ(Math.sin(i) * 0.78).translateY(-0.06));
  }
  const tractor = new THREE.ConeGeometry(1.1, 3.4, 12, 1, true);
  tractor.translate(0, -1.7, 0);
  ufo.add(new THREE.Mesh(tractor, glow('#7af0ff', { transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false }, 1.4)));
  g.add(ufo);

  // Kometen ziehen durch
  const comets = [];
  for (let i = 0; i < (low ? 1 : 3); i += 1) {
    const c = new THREE.Group();
    c.add(new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), glow('#ffffff', {}, 3.5)));
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.13, 2.6, 6), glow('#9fd0ff', { transparent: true, opacity: 0.7 }, 2));
    tail.rotation.x = -Math.PI / 2;
    tail.position.z = -1.4;
    c.add(tail);
    c.userData = { x: (i % 2 ? 1 : -1) * (5.5 + rand() * 3), y: 6.5 + rand() * 2, off: rand() * 60, speed: 9 + rand() * 6 };
    comets.push(c);
    g.add(c);
  }

  // Ladung: Schwarzes Loch mit zwei Scheiben und einem Strudel aus Funken
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
  hole.position.set(0, 3.4, -2.4);
  g.add(hole);

  return {
    group: g,
    hole,
    update(t, dt, level, focus) {
      crystalMat.emissiveIntensity = 1.5 + Math.sin(t * 1.4) * 0.5;
      starMat.opacity = 0.75 + Math.sin(t * 2) * 0.15;
      for (const s of nebula) {
        s.position.x = s.userData.x + Math.sin(t * 0.08 + s.userData.off) * 2;
        s.material.opacity = 0.2 + Math.sin(t * 0.3 + s.userData.off) * 0.07;
      }
      for (const m of auroras) {
        const pos = m.geometry.attributes.position;
        const { base, off } = m.userData;
        for (let i = 0; i < pos.count; i += 1) {
          const x = base[i * 3];
          pos.setY(i, base[i * 3 + 1] + Math.sin(x * 0.5 + t * 0.8 + off) * 0.7);
          pos.setZ(i, Math.sin(x * 0.35 - t * 0.5 + off) * 1.4);
        }
        pos.needsUpdate = true;
      }
      planet.rotation.y = t * 0.08;
      belt.rotation.y = t * 0.12;
      for (const m of moons) m.position.set(Math.cos(t * m.userData.speed) * m.userData.r, Math.sin(t * m.userData.speed * 0.7) * 1.2, Math.sin(t * m.userData.speed) * m.userData.r);
      for (const m of rocks) {
        m.rotation.x += m.userData.spin * dt;
        m.rotation.y += m.userData.spin * 0.7 * dt;
        m.position.y = m.userData.y + Math.sin(t * 0.7 + m.userData.y) * 0.25;
      }
      ufo.position.set(Math.sin(t * 0.22) * 7.5, 7 + Math.sin(t * 0.9) * 0.5, -17 + Math.sin(t * 0.44) * 6);
      ufo.rotation.y = t * 1.5;
      ufo.rotation.z = Math.sin(t * 0.9) * 0.12;
      for (const c of comets) {
        const span = Z1 - Z0 + 30;
        c.position.set(c.userData.x, c.userData.y, Z0 - 10 + ((t * c.userData.speed + c.userData.off) % span));
      }
      hole.visible = level > 0.02;
      // ist der Kosmos die aktuelle Welt, schwebt das Loch über dem Tisch — sonst bleibt es näher an seiner Wand
      hole.position.y = 3.4 + (FLOOR - 0.2) * focus;
      hole.scale.setScalar(Math.max(0.001, level * 1.05));
      disc.rotation.z = t * 1.4;
      disc2.rotation.z = -t * 0.9;
      swirl.rotation.y = -t * 1.8;
    },
  };
}

const BUILDERS = [buildVulkan, buildOzean, buildDschungel, buildKosmos];

/**
 * Baut die Trommel. drum.rotation.z = −Welt·90° bringt die Welt nach unten.
 * wall.update(t, dt, level, focus): level = gezeigte Ladung 0–1 (bei 1 steht sie an der Tischplatte),
 * focus = 0–1 ob diese Welt gerade die aktuelle ist.
 * @returns {{ drum: THREE.Group, walls: {group: THREE.Group, update: Function, hole?: THREE.Object3D}[] }}
 */
export function buildDrum(low) {
  const drum = new THREE.Group();
  const walls = BUILDERS.map((build, i) => {
    const wall = build(low);
    const holder = new THREE.Group();
    holder.rotation.z = (i * Math.PI) / 2;
    wall.group.position.y = -R;
    holder.add(wall.group);
    drum.add(holder);
    return wall;
  });
  return { drum, walls };
}
