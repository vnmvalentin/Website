// forestWorld.js — die sichtbare Welt der Wald-Ebene: Bäume mit Kronen, Büsche, Zaun mit Tor, Wald
// jenseits des Zauns (nur Kulisse, verschwindet im Nebel), Schotterweg mit Auto, Waldhütte, Feuerstelle,
// Sterne. Spiellogik (Kollision, Sicht) bleibt in game.js — hier entstehen nur Meshes und Lichter.
//
// Fotolook (assets = createAssets aus scene3d/kit.js): Boden, Weg, Rinde, Bretter als Poly-Haven-
// Fotomaterial, Kronen aus gerenderten Tannen-Scans (photoWorld.js), Wurzelteller und Stümpfe an
// den Stämmen, Feuerstelle und Laterne als Scan-Modelle, Totholz in der Kulisse. Bis alles geladen
// ist (oder falls etwas fehlt), bleiben die gemalten Texturen.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { scatter } from '../ClashRoyale/modes/scene3d/kit';
import {
  barkTexture, forestFloorTexture, sidingTexture, doorTexture, pineCrownTexture,
  bushTexture, roadTexture, roofTexture,
} from './textures';
import { FIRS, firCrownGeometry, loadFirTexture } from './photoWorld';

/** Mehrere senkrechte Ebenen über Kreuz — von jeder Seite sieht die Krone gleich voll aus. */
function crossedPlanes(w, h, count, y0) {
  const parts = [];
  for (let i = 0; i < count; i++) {
    const p = new THREE.PlaneGeometry(w, h);
    p.translate(0, y0 + h / 2, 0);
    p.rotateY((i * Math.PI) / count);
    parts.push(p);
  }
  const g = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return g;
}

/**
 * @param {{ scene: THREE.Scene, keep: (x:any)=>any, rng: ()=>number, maze: any, S: number, wallH: number,
 *           gate: number[], hut: any, fire: number[]|null, bushes: number[][], trunks: Map<number, any> }} p
 */
export function buildForest(p) {
  const { scene, keep, rng, maze, S, wallH, gate, hut, fire, bushes, trunks, assets } = p;
  const size = maze.size;
  const world = (t) => t * S;
  const instanced = [];
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  // Weg vor dem Zaun (Süden), Auto parkt am Tor
  const roadZ = world(size - 1) + S * 2.6;
  const roadW = 6;

  // ── Boden (weit über den Zaun hinaus) ───────────────────────────────────
  const margin = 11;
  const floorSpan = (size + margin * 2) * S;
  const floorTex = keep(forestFloorTexture());
  floorTex.repeat.set((size + margin * 2) / 2, (size + margin * 2) / 2);
  const floor = new THREE.Mesh(keep(new THREE.PlaneGeometry(floorSpan, floorSpan)),
    assets.pbr(keep(new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.95 })), 'forest_leaves_02', floorSpan / 3.2, floorSpan / 3.2));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(world(size / 2) - S / 2, 0, world(size / 2) - S / 2);
  floor.receiveShadow = true;
  scene.add(floor);

  const roadTex = keep(roadTexture());
  roadTex.repeat.set(30, 1);
  const road = new THREE.Mesh(keep(new THREE.PlaneGeometry(floorSpan, roadW)),
    assets.pbr(keep(new THREE.MeshStandardMaterial({ map: roadTex, roughness: 1 })), 'leaf_scattered_gravel', floorSpan / 3, roadW / 3));
  road.rotation.x = -Math.PI / 2;
  road.position.set(floor.position.x, 0.01, roadZ);
  road.receiveShadow = true;
  scene.add(road);

  // ── Bäume: innen (mit Kollision, aus trunks) + Kulisse draußen ──────────
  const trees = [];
  for (const t of trunks.values()) trees.push({ ...t, inner: true, kind: Math.floor(rng() * FIRS.length) });
  for (let z = -margin; z < size + margin; z++) {
    for (let x = -margin; x < size + margin; x++) {
      if (x >= 0 && z >= 0 && x < size && z < size) continue;
      const wz = world(z);
      if (Math.abs(wz - roadZ) < roadW / 2 + 1.5) continue; // Weg frei lassen
      if (rng() > 0.3) continue;
      trees.push({
        x: world(x) + (rng() - 0.5) * 1.6, z: wz + (rng() - 0.5) * 1.6, r: 0.28 + rng() * 0.25,
        kind: Math.floor(rng() * FIRS.length),
      });
    }
  }
  const barkTex = keep(barkTexture());
  barkTex.repeat.set(1, 3);
  // Stamm verjüngt sich nach oben (die Fichtenbilder haben schlanke Stämme)
  const trunkGeo = keep(new THREE.CylinderGeometry(0.32, 1, wallH, 10));
  trunkGeo.translate(0, wallH / 2, 0);
  const trunkMat = assets.pbr(keep(new THREE.MeshStandardMaterial({ map: barkTex, roughness: 0.95 })), 'pine_bark', 2, 7);
  const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, trees.length);
  trees.forEach((t, i) => {
    t.h = 0.85 + rng() * 0.35;
    m4.compose(v.set(t.x, 0, t.z), q.setFromAxisAngle(up, rng() * Math.PI * 2), sc.set(t.r, t.h, t.r));
    trunkMesh.setMatrixAt(i, m4);
  });
  trunkMesh.castShadow = true;
  trunkMesh.receiveShadow = true;
  scene.add(trunkMesh);
  instanced.push(trunkMesh);

  // Kronen: Bilder der drei Fichten-Scans (bis sie geladen sind, die gemalte Fichtenkrone)
  const placeholder = keep(pineCrownTexture());
  const crownSets = FIRS.map((info, kind) => {
    const mat = keep(new THREE.MeshLambertMaterial({ map: placeholder, alphaTest: 0.45, side: THREE.DoubleSide }));
    loadFirTexture(mat, info, keep);
    // größte Fichte ~13,5 m, die kleineren etwas weniger geschrumpft (sonst wirkt der Wald zu niedrig)
    return { kind, geo: keep(firCrownGeometry(info, 0.7 * (info.h / FIRS[0].h) ** -0.4)), mat };
  });
  for (const set of crownSets) {
    const list = trees.filter((t) => t.kind === set.kind);
    const mesh = new THREE.InstancedMesh(set.geo, set.mat, Math.max(1, list.length));
    list.forEach((t, i) => {
      const s = 0.85 + rng() * 0.35;
      m4.compose(v.set(t.x, 0, t.z), q.setFromAxisAngle(up, rng() * Math.PI), sc.set(s, s * (0.9 + t.h * 0.15), s));
      mesh.setMatrixAt(i, m4);
    });
    mesh.count = list.length;
    // Instanzen über die ganze Karte — nicht als Ganzes wegschneiden
    mesh.frustumCulled = false;
    scene.add(mesh);
    instanced.push(mesh);
  }

  // ── Wurzelteller, Stümpfe, Totholz (Scan-Modelle) ───────────────────────
  // Wurzeln nur an Stämmen innerhalb des Zauns (liegen flach, man läuft darüber), Stümpfe und
  // liegende Stämme nur draußen — drinnen würden sie Gänge zustellen.
  {
    const inner = [...trunks.values()];
    const roots = inner.filter(() => rng() < 0.45).map((t) => ({ x: t.x, y: 0, z: t.z, s: 0.55 + rng() * 0.3, ry: rng() * Math.PI * 2 }));
    if (roots.length) scene.add(scatter(assets.model('pine_roots', 0.35, { castShadow: false }), roots));
    const outside = trees.filter((t) => !t.inner);
    const stumps = [];
    const logs = [];
    for (let i = 0; i < 70; i++) {
      const a = outside[Math.floor(rng() * outside.length)];
      if (!a) break;
      const ang = rng() * Math.PI * 2;
      const pos = { x: a.x + Math.cos(ang) * 1.3, y: 0, z: a.z + Math.sin(ang) * 1.3, ry: rng() * Math.PI * 2, s: 0.8 + rng() * 0.5 };
      if (Math.abs(pos.z - roadZ) < roadW / 2 + 1) continue;
      (i % 3 === 0 ? logs : stumps).push(pos);
    }
    scene.add(scatter(assets.model('tree_stump_01', 0.55), stumps.filter((_, i) => i % 2 === 0)));
    scene.add(scatter(assets.model('tree_stump_02', 0.6), stumps.filter((_, i) => i % 2 === 1)));
    scene.add(scatter(assets.model('dead_tree_trunk', 0.45), logs.filter((_, i) => i % 2 === 0)));
    scene.add(scatter(assets.model('dead_tree_trunk_02', 0.5), logs.filter((_, i) => i % 2 === 1)));
  }

  // ── Büsche und Farne (nur Kulisse) ──────────────────────────────────────
  if (bushes.length) {
    const bushMesh = new THREE.InstancedMesh(keep(crossedPlanes(1.8, 0.9, 2, 0)),
      keep(new THREE.MeshLambertMaterial({ map: keep(bushTexture()), alphaTest: 0.4, side: THREE.DoubleSide })), bushes.length);
    bushes.forEach(([x, z], i) => {
      const s = 0.7 + rng() * 0.9;
      m4.compose(v.set(world(x) + (rng() - 0.5) * 1.6, 0, world(z) + (rng() - 0.5) * 1.6), q.setFromAxisAngle(up, rng() * Math.PI), sc.set(s, s, s));
      bushMesh.setMatrixAt(i, m4);
    });
    bushMesh.frustumCulled = false;
    scene.add(bushMesh);
    instanced.push(bushMesh);
  }

  // ── Zaun am inneren Rand der Randkacheln, mit Tor unten ─────────────────
  const woodMat = assets.pbr(keep(new THREE.MeshStandardMaterial({ color: 0x8a7a68, roughness: 0.95 })), 'raw_plank_wall', 1, 1);
  const lo = world(0) + S / 2;
  const hi = world(size - 1) - S / 2;
  const posts = [];
  const rails = [];
  const gateX = world(gate[0]);
  const addLine = (x1, z1, x2, z2, skip) => {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const n = Math.round(len / 2.4);
    for (let i = 0; i <= n; i++) {
      const x = x1 + ((x2 - x1) * i) / n;
      const z = z1 + ((z2 - z1) * i) / n;
      if (skip && skip(x, z)) continue;
      posts.push([x, z]);
      if (i < n) {
        const nx = x1 + ((x2 - x1) * (i + 1)) / n;
        const nz = z1 + ((z2 - z1) * (i + 1)) / n;
        if (!(skip && (skip(nx, nz) || skip((x + nx) / 2, (z + nz) / 2)))) rails.push([x, z, nx, nz]);
      }
    }
  };
  const inGate = (x, z) => Math.abs(z - hi) < 0.01 && Math.abs(x - gateX) < S * 0.6;
  addLine(lo, lo, hi, lo);
  addLine(lo, hi, hi, hi, inGate);
  addLine(lo, lo, lo, hi);
  addLine(hi, lo, hi, hi);
  const postGeo = keep(new THREE.BoxGeometry(0.14, 1.5, 0.14));
  postGeo.translate(0, 0.75, 0);
  const postMesh = new THREE.InstancedMesh(postGeo, woodMat, posts.length);
  posts.forEach(([x, z], i) => postMesh.setMatrixAt(i, m4.makeTranslation(x, 0, z)));
  const railGeo = keep(new THREE.BoxGeometry(1, 0.1, 0.06));
  const railMesh = new THREE.InstancedMesh(railGeo, woodMat, rails.length * 2);
  rails.forEach(([x1, z1, x2, z2], i) => {
    const len = Math.hypot(x2 - x1, z2 - z1);
    q.setFromAxisAngle(up, -Math.atan2(z2 - z1, x2 - x1));
    for (const [k, y] of [[0, 0.55], [1, 1.15]]) {
      m4.compose(v.set((x1 + x2) / 2, y, (z1 + z2) / 2), q, sc.set(len, 1, 1));
      railMesh.setMatrixAt(i * 2 + k, m4);
    }
  });
  for (const m of [postMesh, railMesh]) {
    m.castShadow = true;
    m.receiveShadow = true;
    m.frustumCulled = false;
    scene.add(m);
    instanced.push(m);
  }
  // Tor: zwei dickere Pfosten und ein geschlossener Torflügel
  const gateGroup = new THREE.Group();
  const gp = keep(new THREE.BoxGeometry(0.2, 1.8, 0.2));
  gp.translate(0, 0.9, 0);
  for (const dx of [-S * 0.6, S * 0.6]) {
    const m = new THREE.Mesh(gp, woodMat);
    m.position.set(gateX + dx, 0, hi);
    gateGroup.add(m);
  }
  const leaf = new THREE.Group();
  for (const y of [0.4, 0.9, 1.35]) {
    const r = new THREE.Mesh(keep(new THREE.BoxGeometry(S * 1.2, 0.1, 0.06)), woodMat);
    r.position.set(0, y, 0);
    leaf.add(r);
  }
  for (const x of [-0.5, 0, 0.5]) {
    const r = new THREE.Mesh(keep(new THREE.BoxGeometry(0.08, 1.2, 0.06)), woodMat);
    r.position.set(x * S, 0.85, 0.01);
    leaf.add(r);
  }
  leaf.position.set(gateX, 0, hi);
  gateGroup.add(leaf);
  gateGroup.traverse((o) => { o.castShadow = true; });
  scene.add(gateGroup);

  // ── Auto am Tor ─────────────────────────────────────────────────────────
  const car = new THREE.Group();
  // Matter, dunkler Lack: glänzender spiegelte im Mondlicht und füllte im Intro das halbe Bild mit Blau
  const paint = keep(new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.7, metalness: 0.2 }));
  const glass = keep(new THREE.MeshStandardMaterial({ color: 0x0a0c0e, roughness: 0.1, metalness: 0.9 }));
  const body = new THREE.Mesh(keep(new THREE.BoxGeometry(4.0, 0.62, 1.85)), paint);
  body.position.set(0.15, 0.64, 0);
  const cabin = new THREE.Mesh(keep(new THREE.BoxGeometry(2.2, 0.62, 1.7)), glass);
  cabin.position.set(0.25, 1.36, 0);
  const wheelGeo = keep(new THREE.CylinderGeometry(0.36, 0.36, 0.26, 16));
  wheelGeo.rotateX(Math.PI / 2);
  const tire = keep(new THREE.MeshStandardMaterial({ color: 0x0b0b0b, roughness: 0.9 }));
  car.add(body, cabin);
  for (const [x, z] of [[-1.35, 0.85], [1.35, 0.85], [-1.35, -0.85], [1.35, -0.85]]) {
    const w = new THREE.Mesh(wheelGeo, tire);
    w.position.set(x, 0.36, z);
    car.add(w);
  }
  // Scheinwerfer zeigen in -x (Fahrtrichtung)
  const lampMat = keep(new THREE.MeshBasicMaterial({ color: 0xfff2d6 }));
  const tailMat = keep(new THREE.MeshBasicMaterial({ color: 0x8a0d0d }));
  const lampGeo = keep(new THREE.PlaneGeometry(0.32, 0.16));
  const headlights = [];
  for (const z of [-0.6, 0.6]) {
    const lamp = new THREE.Mesh(lampGeo, lampMat);
    lamp.position.set(-1.86, 0.72, z);
    lamp.rotation.y = -Math.PI / 2;
    const tail = new THREE.Mesh(lampGeo, tailMat);
    tail.position.set(2.16, 0.8, z);
    tail.rotation.y = Math.PI / 2;
    const spot = new THREE.SpotLight(0xfff0d0, 60, 45, 0.42, 0.5, 1.2);
    spot.position.set(-1.9, 0.75, z);
    spot.target.position.set(-14, 0, z * 1.4);
    car.add(lamp, tail, spot, spot.target);
    headlights.push(spot);
  }
  car.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  const parkX = gateX + 4.5;
  car.position.set(parkX, 0, roadZ);
  scene.add(car);

  // ── Waldhütte mit Laterne ───────────────────────────────────────────────
  const hutX = world(hut.x) + S;
  const hutZ = world(hut.z) + S / 2;
  const hutW = hut.w * S - 0.3;
  const hutD = hut.d * S - 0.3;
  const hutH = 2.7;
  const siding = sidingTexture(true);
  keep(siding.map); keep(siding.glow);
  const hutMat = assets.pbr(keep(new THREE.MeshStandardMaterial({ map: siding.map, color: 0xb09a80, emissiveMap: siding.glow, emissive: 0xffffff, emissiveIntensity: 0.18, roughness: 0.9 })), 'wood_plank_wall', 2, 1, { noMap: true });
  const hutBody = new THREE.Mesh(keep(new THREE.BoxGeometry(hutW, hutH, hutD)), hutMat);
  hutBody.position.set(hutX, hutH / 2, hutZ);
  hutBody.castShadow = true;
  hutBody.receiveShadow = true;
  scene.add(hutBody);
  const roofTex = keep(roofTexture());
  roofTex.repeat.set(3, 2);
  const roofMat = keep(new THREE.MeshStandardMaterial({ map: roofTex, roughness: 0.95 }));
  const slope = Math.hypot(hutD / 2 + 0.4, 1.3);
  for (const s of [-1, 1]) {
    const r = new THREE.Mesh(keep(new THREE.BoxGeometry(hutW + 0.8, 0.12, slope)), roofMat);
    r.position.set(hutX, hutH + 0.65, hutZ + (s * (hutD / 2 + 0.4)) / 2);
    r.rotation.x = s * Math.atan2(1.3, hutD / 2 + 0.4);
    r.castShadow = true;
    scene.add(r);
  }
  // Giebel als Dreiecke
  const gableShape = new THREE.Shape();
  gableShape.moveTo(-hutD / 2, 0);
  gableShape.lineTo(hutD / 2, 0);
  gableShape.lineTo(0, 1.3);
  gableShape.closePath();
  const gableGeo = keep(new THREE.ShapeGeometry(gableShape));
  for (const s of [-1, 1]) {
    const g = new THREE.Mesh(gableGeo, keep(new THREE.MeshStandardMaterial({ color: 0x3a3028, side: THREE.DoubleSide })));
    g.position.set(hutX + (s * hutW) / 2, hutH, hutZ);
    g.rotation.y = Math.PI / 2;
    scene.add(g);
  }
  const hutDoor = new THREE.Mesh(keep(new THREE.BoxGeometry(0.9, 2, 0.06)),
    keep(new THREE.MeshStandardMaterial({ map: keep(doorTexture('')), roughness: 0.8 })));
  hutDoor.position.set(hutX, 1, hutZ + hutD / 2 + 0.03);
  scene.add(hutDoor);
  // Laterne: Scan-Modell an der Wand, darin ein kleines glühendes Licht
  const lantern = new THREE.Group();
  lantern.position.set(hutX + 0.75, 1.92, hutZ + hutD / 2 + 0.17);
  lantern.add(assets.model('wooden_lantern_01', 0.38, { castShadow: false }));
  const glowCore = new THREE.Mesh(keep(new THREE.SphereGeometry(0.045, 10, 8)), keep(new THREE.MeshBasicMaterial({ color: 0xffb060 })));
  glowCore.position.y = 0.16;
  lantern.add(glowCore);
  scene.add(lantern);
  const lanternLight = new THREE.PointLight(0xffa040, 2.2, 12, 1.6);
  lanternLight.position.copy(lantern.position).add(new THREE.Vector3(0, 0.18, 0.3));
  scene.add(lanternLight);

  // ── Alte Feuerstelle ────────────────────────────────────────────────────
  let ember = null;
  if (fire) {
    const fx = world(fire[0]);
    const fz = world(fire[1]);
    // Steinring als Scan (ein Ring aus Feldsteinen mit Asche)
    const pit = assets.model('stone_fire_pit', 0.32);
    pit.position.set(fx, 0, fz);
    pit.rotation.y = rng() * Math.PI * 2;
    scene.add(pit);
    const logGeo = keep(new THREE.CylinderGeometry(0.07, 0.08, 0.9, 8));
    logGeo.rotateZ(Math.PI / 2);
    const charMat = keep(new THREE.MeshStandardMaterial({ color: 0x141110, roughness: 1, emissive: 0x2a0800, emissiveIntensity: 0.4 }));
    for (let i = 0; i < 3; i++) {
      const l = new THREE.Mesh(logGeo, charMat);
      l.position.set(fx, 0.08, fz);
      l.rotation.y = (i / 3) * Math.PI;
      scene.add(l);
    }
    // Baumstämme zum Sitzen
    const seatGeo = keep(new THREE.CylinderGeometry(0.22, 0.25, 1.8, 10));
    seatGeo.rotateZ(Math.PI / 2);
    const seatMat = trunkMat;
    for (const a of [0.4, 2.6]) {
      const s = new THREE.Mesh(seatGeo, seatMat);
      s.position.set(fx + Math.cos(a) * 1.6, 0.22, fz + Math.sin(a) * 1.6);
      s.rotation.y = -a + Math.PI / 2;
      s.castShadow = true;
      scene.add(s);
    }
    ember = new THREE.PointLight(0xff4010, 0.5, 4, 2);
    ember.position.set(fx, 0.3, fz);
    scene.add(ember);
  }

  // ── Sterne zwischen den Kronen ──────────────────────────────────────────
  const starCount = 500;
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const a = rng() * Math.PI * 2;
    const e = 0.25 + rng() * 1.2;
    starPos[i * 3] = world(size / 2) + Math.cos(a) * Math.cos(e) * 140;
    starPos[i * 3 + 1] = Math.sin(e) * 140;
    starPos[i * 3 + 2] = world(size / 2) + Math.sin(a) * Math.cos(e) * 140;
  }
  const starGeo = keep(new THREE.BufferGeometry());
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(starGeo, keep(new THREE.PointsMaterial({ color: 0x9aa4c0, size: 1.4, sizeAttenuation: false, fog: false })));
  scene.add(stars);

  return {
    instanced,
    car,
    headlights,
    parkX,
    roadZ,
    gateLeaf: leaf,
    gateX,
    gateZ: hi,
    /** Flackern der Lichter in der Kulisse, jedes Bild. */
    tick(t) {
      lanternLight.intensity = 2.2 * (0.85 + Math.sin(t * 13) * 0.05 + Math.sin(t * 7.3) * 0.08);
      if (ember) ember.intensity = 0.45 + Math.sin(t * 3.1) * 0.12 + Math.sin(t * 11.7) * 0.06;
    },
  };
}
