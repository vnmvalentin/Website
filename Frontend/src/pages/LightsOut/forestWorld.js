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
import { scatter, instancedChunks } from '../ClashRoyale/modes/scene3d/kit';
import {
  barkTexture, forestFloorTexture, sidingTexture, doorTexture, pineCrownTexture,
  bushTexture, roadTexture, roofTexture,
} from './textures';
import { FIRS, firCrownGeometry, loadFirTexture } from './photoWorld';
import { makeRng } from './maze';
import { makeCrowbar } from './items';

/** Feldgröße für das Aufteilen der Instanzen (Meter). */
const CHUNK = 30;
/**
 * Kleinkram (Wurzeln, Stümpfe, Totholz) nur bis zu dieser Entfernung zeichnen (Meter, Feldrand → Kamera).
 * Dahinter verschluckt ihn Nebel und Dunkelheit — gezeichnet kostete er trotzdem den Großteil der Dreiecke.
 */
const DETAIL = { roots: { chunk: 12, range: 24 }, debris: { chunk: 20, range: 34 } };
/** Abstand der Sterne von der Kamera — knapp innerhalb der Sichtweite (game.js: camera.far im Wald). */
export const STAR_R = 62;

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
 *           gate: number[], hut: any, fire: number[]|null, bushes: number[][], trunks: Map<number, any>,
 *           addProp?: Function, addWall?: Function, path?: number[][], grave?: number[]|null, well?: number[]|null,
 *           intro?: boolean }} p
 *   addProp(cx, cz, hx, hz) = Hindernis für den Spieler, addWall = Hindernis + Sichtsperre (Hüttenwände)
 */
export function buildForest(p) {
  const { scene, keep, rng, maze, S, wallH, gate, hut, fire, bushes, trunks, assets, addProp, addWall, path, grave, well } = p;
  /** Mit Anfahrt (Intro): der Weg wird nach Osten verlängert, damit man eine Weile fahren kann */
  const withDrive = !!p.intro;
  const size = maze.size;
  const world = (t) => t * S;
  const instanced = [];
  /** [Gruppe aus scatter, Reichweite] — deren Felder blendet tick() nach Entfernung aus */
  const details = [];
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  // Weg vor dem Zaun (Süden), Auto parkt am Tor
  const roadZ = world(size - 1) + S * 2.6;
  const roadW = 6;

  // Fahrt und Unfall (Intro). Der Wagen kommt von Osten den Weg entlang (Fahrtrichtung -x). Kurz vor dem Tor
  // steht etwas auf dem Weg; der Wagen bricht nach rechts aus und prallt zwischen Weg und Zaun gegen einen Baum.
  // crashPath = Lage [x, z, Drehung] je 1/120 s ab dem Herumreißen des Lenkrads. Das Wrack bleibt dort stehen —
  // auch wenn man ohne Intro startet.
  const DRIVE = { speed: 7, swerveX: world(gate[0]) + 12.5, dur: 1.4, turn: -0.8, length: 300 };
  const crashPath = [];
  {
    let x = DRIVE.swerveX;
    let z = roadZ;
    const n = Math.round(DRIVE.dur * 120);
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const th = DRIVE.turn * (1 - (1 - u) * (1 - u));
      crashPath.push([x, z, th]);
      const v = DRIVE.speed * (1 - 0.3 * u);
      x -= (Math.cos(th) * v) / 120;
      z += (Math.sin(th) * v) / 120;
    }
  }
  const crashEnd = crashPath[crashPath.length - 1];
  /** Der Baum, an dem der Wagen hängen bleibt: gut zwei Meter vor der Wagenmitte */
  const crashTree = { x: crashEnd[0] - Math.cos(crashEnd[2]) * 2.2, z: crashEnd[1] + Math.sin(crashEnd[2]) * 2.2 };

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
  if (withDrive) {
    // Verlängerung nach Osten: derselbe Waldboden und Schotter, im selben Maßstab (UV anteilig zur großen Fläche)
    const len = DRIVE.length;
    const edge = floor.position.x + floorSpan / 2;
    const strip = (w, d, material, y) => {
      const geo = keep(new THREE.PlaneGeometry(w, d));
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / floorSpan), uv.getY(i) * (d / (material === road.material ? roadW : floorSpan)));
      const m = new THREE.Mesh(geo, material);
      m.rotation.x = -Math.PI / 2;
      m.position.set(edge + w / 2, y, roadZ);
      m.receiveShadow = true;
      scene.add(m);
    };
    strip(len, 44, floor.material, 0);
    strip(len, roadW, road.material, 0.01);
  }

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
  // Eigener Zufall für alles, was nur zur Anfahrt gehört: die Welt innerhalb des Zauns bleibt mit und ohne
  // Anfahrt dieselbe (gleicher Seed → gleiche Karte).
  const far = makeRng(90210);
  const rnd = (t) => (t.far ? far : rng);
  if (withDrive) {
    // Kulissenwald beiderseits des verlängerten Wegs
    const x0 = size + margin;
    for (let x = x0; x < x0 + Math.ceil(DRIVE.length / S); x++) {
      for (let z = size - 5; z < size + 9; z++) {
        const wz = world(z);
        if (Math.abs(wz - roadZ) < roadW / 2 + 1.5 || far() > 0.32) continue;
        trees.push({ x: world(x) + (far() - 0.5) * 1.6, z: wz + (far() - 0.5) * 1.6, r: 0.28 + far() * 0.25, kind: Math.floor(far() * FIRS.length), far: true });
      }
    }
  }
  trees.push({ x: crashTree.x, z: crashTree.z, r: 0.46, kind: 0 });
  const barkTex = keep(barkTexture());
  barkTex.repeat.set(1, 3);
  // Stamm verjüngt sich nach oben (die Fichtenbilder haben schlanke Stämme)
  const trunkGeo = keep(new THREE.CylinderGeometry(0.32, 1, wallH, 10));
  trunkGeo.translate(0, wallH / 2, 0);
  const trunkMat = assets.pbr(keep(new THREE.MeshStandardMaterial({ map: barkTex, roughness: 0.95 })), 'pine_bark', 2, 7);
  // In Felder aufgeteilt (instancedChunks): was nicht im Bild bzw. im Lichtkegel ist, wird nicht gezeichnet
  const trunkMats = trees.map((t) => {
    const r = rnd(t);
    t.h = 0.85 + r() * 0.35;
    return m4.compose(v.set(t.x, 0, t.z), q.setFromAxisAngle(up, r() * Math.PI * 2), sc.set(t.r, t.h, t.r)).clone();
  });
  for (const mesh of instancedChunks(trunkGeo, trunkMat, trunkMats, CHUNK)) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    instanced.push(mesh);
  }

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
    const mats = list.map((t) => {
      const r = rnd(t);
      const s = 0.85 + r() * 0.35;
      return m4.compose(v.set(t.x, 0, t.z), q.setFromAxisAngle(up, r() * Math.PI), sc.set(s, s * (0.9 + t.h * 0.15), s)).clone();
    });
    for (const mesh of instancedChunks(set.geo, set.mat, mats, CHUNK)) {
      scene.add(mesh);
      instanced.push(mesh);
    }
  }

  // ── Wurzelteller, Stümpfe, Totholz (Scan-Modelle) ───────────────────────
  // Wurzeln nur an Stämmen innerhalb des Zauns (liegen flach, man läuft darüber), Stümpfe und
  // liegende Stämme nur draußen — drinnen würden sie Gänge zustellen.
  {
    const inner = [...trunks.values()];
    const roots = inner.filter(() => rng() < 0.45).map((t) => ({ x: t.x, y: 0, z: t.z, s: 0.55 + rng() * 0.3, ry: rng() * Math.PI * 2 }));
    if (roots.length) details.push([scene.add(scatter(assets.model('pine_roots', 0.35, { castShadow: false }), roots, { chunk: DETAIL.roots.chunk })).children.at(-1), DETAIL.roots.range]);
    const outside = trees.filter((t) => !t.inner && !t.far);
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
    const debris = [
      scatter(assets.model('tree_stump_01', 0.55), stumps.filter((_, i) => i % 2 === 0), { chunk: DETAIL.debris.chunk }),
      scatter(assets.model('tree_stump_02', 0.6), stumps.filter((_, i) => i % 2 === 1), { chunk: DETAIL.debris.chunk }),
      scatter(assets.model('dead_tree_trunk', 0.45), logs.filter((_, i) => i % 2 === 0), { chunk: DETAIL.debris.chunk }),
      scatter(assets.model('dead_tree_trunk_02', 0.5), logs.filter((_, i) => i % 2 === 1), { chunk: DETAIL.debris.chunk }),
    ];
    for (const g of debris) { scene.add(g); details.push([g, DETAIL.debris.range]); }
  }

  // ── Büsche und Farne (nur Kulisse) ──────────────────────────────────────
  if (bushes.length) {
    const bushGeo = keep(crossedPlanes(1.8, 0.9, 2, 0));
    const bushMat = keep(new THREE.MeshLambertMaterial({ map: keep(bushTexture()), alphaTest: 0.4, side: THREE.DoubleSide }));
    const mats = bushes.map(([x, z]) => {
      const s = 0.7 + rng() * 0.9;
      return m4.compose(v.set(world(x) + (rng() - 0.5) * 1.6, 0, world(z) + (rng() - 0.5) * 1.6), q.setFromAxisAngle(up, rng() * Math.PI), sc.set(s, s, s)).clone();
    });
    for (const mesh of instancedChunks(bushGeo, bushMat, mats, CHUNK)) {
      scene.add(mesh);
      instanced.push(mesh);
    }
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
  // Innenraum für die Anfahrt: Armaturenbrett, Lenkrad und das Handy in seiner Halterung. Von außen verdeckt
  // die Kabine alles (ihre Flächen sind nur von außen sichtbar), von innen sieht man es im Intro.
  const phone = (() => {
    const trim = keep(new THREE.MeshStandardMaterial({ color: 0x131518, roughness: 0.85 }));
    const leather = keep(new THREE.MeshStandardMaterial({ color: 0x1d1f23, roughness: 0.6 }));
    const part = (geo, material, x, y, z) => {
      const m = new THREE.Mesh(keep(geo), material);
      m.position.set(x, y, z);
      car.add(m);
      return m;
    };
    part(new THREE.BoxGeometry(0.38, 0.32, 1.68), trim, -0.74, 1.06, 0);          // Armaturenbrett
    part(new THREE.BoxGeometry(0.24, 0.09, 0.46), trim, -0.69, 1.255, 0.42);       // Hutze über den Instrumenten
    part(new THREE.BoxGeometry(1.75, 0.04, 1.7), trim, 0.42, 1.665, 0);            // Dachhimmel (vorn kurz: freier Blick nach oben)
    part(new THREE.BoxGeometry(1.5, 0.34, 0.06), trim, -0.1, 1.05, 0.87);          // Türbrüstung links
    part(new THREE.BoxGeometry(0.03, 0.065, 0.22), leather, -0.6, 1.59, 0.02);     // Innenspiegel
    for (const s of [-1, 1]) {
      // A-Säulen: schräg vom Armaturenbrett zum Dach
      const pillar = part(new THREE.BoxGeometry(0.075, 0.66, 0.075), trim, -0.71, 1.43, s * 0.83);
      pillar.rotation.z = -0.62;
    }
    // Kombiinstrument: zwei schwach leuchtende Rundinstrumente hinter dem Lenkrad
    const dialCv = document.createElement('canvas');
    dialCv.width = 256;
    dialCv.height = 80;
    {
      const d = dialCv.getContext('2d');
      d.fillStyle = '#050607';
      d.fillRect(0, 0, 256, 80);
      for (const [cx, hand] of [[70, -2.2], [186, -0.4]]) {
        d.strokeStyle = '#7ad0a0';
        d.lineWidth = 3;
        d.beginPath();
        d.arc(cx, 44, 30, Math.PI * 0.85, Math.PI * 2.15);
        d.stroke();
        for (let i = 0; i <= 8; i++) {
          const a = Math.PI * (0.85 + (i / 8) * 1.3);
          d.beginPath();
          d.moveTo(cx + Math.cos(a) * 24, 44 + Math.sin(a) * 24);
          d.lineTo(cx + Math.cos(a) * 30, 44 + Math.sin(a) * 30);
          d.stroke();
        }
        d.strokeStyle = '#ff7a3c';
        d.beginPath();
        d.moveTo(cx, 44);
        d.lineTo(cx + Math.cos(hand) * 24, 44 + Math.sin(hand) * 24);
        d.stroke();
      }
    }
    const dialTex = keep(new THREE.CanvasTexture(dialCv));
    dialTex.colorSpace = THREE.SRGBColorSpace;
    const dials = part(new THREE.PlaneGeometry(0.34, 0.105), keep(new THREE.MeshBasicMaterial({ map: dialTex, color: 0x9a9a9a })), -0.552, 1.215, 0.42);
    dials.rotation.set(0, Math.PI / 2, 0);
    dials.rotateX(-0.25);
    // Lenkrad: Kranz, drei Speichen, Nabe — dreht sich beim Lenken um seine Achse (spin)
    const wheel = new THREE.Group();
    wheel.position.set(-0.5, 1.14, 0.42);
    wheel.rotation.set(0, Math.PI / 2, 0);
    wheel.rotateX(-0.42);
    const spin = new THREE.Group();
    wheel.add(spin);
    spin.add(new THREE.Mesh(keep(new THREE.TorusGeometry(0.185, 0.017, 10, 36)), leather));
    const spokeGeo = keep(new THREE.BoxGeometry(0.17, 0.03, 0.014));
    for (const a of [0, Math.PI, -Math.PI / 2]) {
      const sp = new THREE.Mesh(spokeGeo, leather);
      sp.position.set(Math.cos(a) * 0.1, Math.sin(a) * 0.1, -0.012);
      sp.rotation.z = a;
      spin.add(sp);
    }
    const hub = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 16)), leather);
    hub.rotation.x = Math.PI / 2;
    hub.position.z = -0.012;
    spin.add(hub);
    const column = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.028, 0.032, 0.26, 8)), trim);
    column.rotation.x = Math.PI / 2;
    column.position.z = -0.15;
    wheel.add(column);
    car.add(wheel);
    // Handy: steht hochkant in einer Halterung rechts vom Lenkrad, dem Fahrer zugedreht
    const holder = new THREE.Group();
    holder.position.set(-0.78, 1.275, 0.14);
    holder.rotation.y = Math.PI / 2 - 0.5;      // Bildschirm (+z der Gruppe) zum Fahrersitz
    holder.rotateX(-0.2);
    const caseMesh = new THREE.Mesh(keep(new THREE.BoxGeometry(0.076, 0.156, 0.01)), trim);
    const cv = document.createElement('canvas');
    cv.width = 144;
    cv.height = 304;
    const ctx2 = cv.getContext('2d');
    const tex = keep(new THREE.CanvasTexture(cv));
    tex.colorSpace = THREE.SRGBColorSpace;
    const screenMat = keep(new THREE.MeshBasicMaterial({ map: tex }));
    const screen = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.068, 0.144)), screenMat);
    screen.position.z = 0.0056;
    const arm = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.008, 0.008, 0.1, 6)), trim);
    arm.position.set(0, -0.11, -0.02);
    holder.add(caseMesh, screen, arm);
    // Ein Licht für den Innenraum: schwach grünlich von den Instrumenten, hell und bläulich, wenn das Handy leuchtet
    const glow = new THREE.PointLight(0x9fc4ff, 0, 1.7, 1.5);
    glow.position.set(-0.6, 1.34, 0.26);
    car.add(holder, glow);
    let state = '';
    let shown = '';
    /** Bildschirm neu malen. state: off | ring | talk | lost; secs = Gesprächsdauer. */
    const draw = (next, secs = 0) => {
      const label = next === 'talk' ? `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}` : '';
      if (next === state && label === shown) return;
      state = next;
      shown = label;
      ctx2.fillStyle = next === 'off' ? '#000' : '#0a1018';
      ctx2.fillRect(0, 0, 144, 304);
      if (next !== 'off') {
        ctx2.textAlign = 'center';
        ctx2.textBaseline = 'middle';
        ctx2.fillStyle = '#8fa2b8';
        ctx2.font = '600 15px system-ui, sans-serif';
        ctx2.fillText(next === 'ring' ? 'Eingehender Anruf' : next === 'talk' ? label : 'Verbindung getrennt', 72, 56);
        ctx2.fillStyle = '#eef3f8';
        ctx2.font = '700 34px system-ui, sans-serif';
        ctx2.fillText('Jonas', 72, 104);
        // Kreis mit Anfangsbuchstabe
        ctx2.fillStyle = '#2a3a4c';
        ctx2.beginPath();
        ctx2.arc(72, 176, 34, 0, Math.PI * 2);
        ctx2.fill();
        ctx2.fillStyle = '#c9d6e4';
        ctx2.font = '700 34px system-ui, sans-serif';
        ctx2.fillText('J', 72, 178);
        if (next === 'lost') {
          ctx2.fillStyle = '#d8584c';
          ctx2.font = '600 15px system-ui, sans-serif';
          ctx2.fillText('Kein Netz', 72, 262);
        } else {
          const dots = next === 'ring' ? [[40, '#d8473a'], [104, '#3fb65c']] : [[72, '#d8473a']];
          for (const [bx, col] of dots) {
            ctx2.fillStyle = col;
            ctx2.beginPath();
            ctx2.arc(bx, 262, 19, 0, Math.PI * 2);
            ctx2.fill();
          }
        }
      }
      tex.needsUpdate = true;
    };
    draw('off');
    return { draw, glow, steer(a) { spin.rotation.z = a; } };
  })();
  /**
   * Wagen auf seiner Bahn: s = Sekunden bezogen auf das Herumreißen des Lenkrads (davor negativ: geradeaus auf
   * dem Weg, mit festem Tempo). Liefert die Lage [x, z, Drehung].
   */
  const driveCar = (s) => {
    let pose;
    if (s <= 0) pose = [DRIVE.swerveX - s * DRIVE.speed, roadZ, 0];
    else {
      const f = Math.min(crashPath.length - 1, s * 120);
      const i = Math.floor(f);
      const a = crashPath[i];
      const b = crashPath[Math.min(crashPath.length - 1, i + 1)];
      const k = f - i;
      pose = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
    }
    car.position.set(pose[0], 0, pose[1]);
    car.rotation.set(0, pose[2], 0);
    lampMat.color.set(0xfff2d6);
    // Lenkrad: reißt beim Ausweichen herum
    phone.steer(s > 0 ? -2.4 * Math.sin(Math.min(1, s / (DRIVE.dur * 0.8)) * Math.PI * 0.6) : Math.sin(s * 1.3) * 0.04);
    return pose;
  };
  /** Das Wrack: hängt schief am Baum, Scheinwerfer dunkel. */
  const wreckCar = () => {
    car.position.set(crashEnd[0], 0, crashEnd[1]);
    car.rotation.set(0.02, crashEnd[2], 0.05);
    lampMat.color.set(0x1a1814);
    phone.steer(-1.1);
  };
  wreckCar();
  scene.add(car);

  // ── Waldhütte des Försters (begehbar) mit Laterne ───────────────────────
  // Vier Wände mit Türöffnung nach Süden, Dielenboden, Decke. Drinnen: Tisch (darauf liegt der Hausschlüssel),
  // Stuhl, Bett, Schrank. Die Wände sind Hindernisse und Sichtsperren (addWall) — die Kacheln selbst sind frei.
  const hutX = world(hut.x) + S;
  const hutZ = world(hut.z) + S / 2;
  const hutW = hut.w * S - 0.3;
  const hutD = hut.d * S - 0.3;
  const hutH = 2.7;
  const wallT = 0.3;
  const doorW = 1.15;
  const siding = sidingTexture(false);
  keep(siding.map);
  const hutMat = assets.pbr(keep(new THREE.MeshStandardMaterial({ map: siding.map, color: 0xb09a80, roughness: 0.9 })), 'wood_plank_wall', 2, 1, { noMap: true });
  const hutWall = (cx, cz, w, d, h = hutH, y = 0, solid = true) => {
    const m = new THREE.Mesh(keep(new THREE.BoxGeometry(w, h, d)), hutMat);
    m.position.set(cx, y + h / 2, cz);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    if (solid) addWall?.(cx, cz, w / 2, d / 2);
  };
  const southZ = hutZ + hutD / 2 - wallT / 2;
  const sideW = (hutW - doorW) / 2;
  hutWall(hutX, hutZ - hutD / 2 + wallT / 2, hutW, wallT);
  hutWall(hutX - hutW / 2 + wallT / 2, hutZ, wallT, hutD);
  hutWall(hutX + hutW / 2 - wallT / 2, hutZ, wallT, hutD);
  hutWall(hutX - doorW / 2 - sideW / 2, southZ, sideW, wallT);
  hutWall(hutX + doorW / 2 + sideW / 2, southZ, sideW, wallT);
  hutWall(hutX, southZ, doorW, wallT, hutH - 2.1, 2.1, false);
  hutWall(hutX, hutZ, hutW, hutD, 0.08, hutH, false);
  const plankMat = assets.pbr(keep(new THREE.MeshStandardMaterial({ color: 0x6a5a48, roughness: 0.9 })), 'wood_planks', 3, 2);
  const hutFloor = new THREE.Mesh(keep(new THREE.PlaneGeometry(hutW - 0.1, hutD - 0.1)), plankMat);
  hutFloor.rotation.x = -Math.PI / 2;
  hutFloor.position.set(hutX, 0.02, hutZ);
  hutFloor.receiveShadow = true;
  scene.add(hutFloor);
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
  // Tür steht offen, nach innen aufgeschwungen (Angel links)
  const doorGeo = keep(new THREE.BoxGeometry(doorW - 0.1, 2.05, 0.06));
  doorGeo.translate((doorW - 0.1) / 2, 1.025, 0);
  const hutDoor = new THREE.Mesh(doorGeo, keep(new THREE.MeshStandardMaterial({ map: keep(doorTexture('')), roughness: 0.8 })));
  hutDoor.position.set(hutX - doorW / 2 + 0.05, 0, southZ);
  hutDoor.rotation.y = 1.75;
  hutDoor.castShadow = true;
  scene.add(hutDoor);
  // Die Hütte ist vernagelt: Tür zu, drei Bretter quer davor. Aufhebeln kann man sie nur mit dem Brecheisen, das
  // im Brunnen hängt — gibt es auf dieser Karte keinen Brunnen, bleibt die Tür offen wie früher.
  const boarded = !!well;
  const planks = [];
  if (boarded) {
    hutDoor.rotation.y = 0;
    const plankGeo = keep(new THREE.BoxGeometry(doorW + 0.55, 0.15, 0.035));
    for (const [y, tilt] of [[0.55, 0.11], [1.15, -0.08], [1.72, 0.06]]) {
      const plank = new THREE.Mesh(plankGeo, woodMat);
      plank.position.set(hutX, y, southZ + wallT / 2 + 0.03);
      plank.rotation.z = tilt;
      plank.castShadow = true;
      scene.add(plank);
      planks.push(plank);
    }
  }

  // Einrichtung. Modelle melden ihre Grundfläche als Hindernis, sobald sie geladen sind.
  const solidModel = (id, h, x, z, rotY = 0) => {
    const holder = assets.model(id, h);
    holder.position.set(x, 0.02, z);
    holder.rotation.y = rotY;
    scene.add(holder);
    const done = () => {
      const box = new THREE.Box3().setFromObject(holder);
      addProp?.((box.min.x + box.max.x) / 2, (box.min.z + box.max.z) / 2, (box.max.x - box.min.x) / 2, (box.max.z - box.min.z) / 2);
    };
    if (holder.userData.loaded) done(); else holder.addEventListener('loaded', done);
    return holder;
  };
  const tableX = hutX + 2.0;
  const tableZ = hutZ - 1.25;
  {
    const top = new THREE.Mesh(keep(new THREE.BoxGeometry(1.25, 0.06, 0.7)), plankMat);
    top.position.set(tableX, 0.78, tableZ);
    top.castShadow = true;
    top.receiveShadow = true;
    scene.add(top);
    const legGeo = keep(new THREE.BoxGeometry(0.07, 0.76, 0.07));
    for (const [lx, lz] of [[-0.55, -0.28], [0.55, -0.28], [-0.55, 0.28], [0.55, 0.28]]) {
      const leg = new THREE.Mesh(legGeo, plankMat);
      leg.position.set(tableX + lx, 0.39, tableZ + lz);
      scene.add(leg);
    }
    addProp?.(tableX, tableZ, 0.62, 0.35);
  }
  solidModel('dining_chair_02', 0.95, tableX - 0.2, tableZ + 0.75, Math.PI + 0.3);
  solidModel('old_bed_frame', 0.75, hutX - 2.2, hutZ - 1.2, 0);
  solidModel('drawer_cabinet', 1.15, hutX - 0.2, hutZ - hutD / 2 + wallT + 0.3, 0);
  solidModel('wooden_bucket_01', 0.38, hutX + 2.9, hutZ + 1.5, 0.6);
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
    const charMat = keep(new THREE.MeshStandardMaterial({ color: 0x141110, roughness: 1, emissive: 0x6a1400, emissiveIntensity: 0.9 }));
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
    // Glut ohne eigenes Licht: jedes Punktlicht kostet in JEDEM Pixel des Waldes — die glimmenden Scheite
    // (Leuchtfarbe, pulsiert in tick) reichen für die Stimmung
    ember = charMat;
  }

  // ── Trampelpfade ────────────────────────────────────────────────────────
  // Überlappende Kiesflecken auf den Pfadkacheln (maze.js: path) — vom Tor zum Haus, zur Hütte, zum Lager.
  if (path?.length) {
    const patchGeo = keep(new THREE.CircleGeometry(1.6, 14));
    patchGeo.rotateX(-Math.PI / 2);
    const patchMat = assets.pbr(keep(new THREE.MeshStandardMaterial({ map: keep(roadTexture()), roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 })), 'leaf_scattered_gravel', 1, 1);
    // Heller als das Foto: im Mondlicht blieb der Kies sonst schwarz und las sich als Loch statt als Weg
    patchMat.color.setRGB(1.7, 1.62, 1.5);
    const mats = path.map(([x, z], i) => {
      const s = 0.85 + rng() * 0.35;
      return m4.compose(v.set(world(x) + (rng() - 0.5) * 0.7, 0.012 + (i % 7) * 0.0006, world(z) + (rng() - 0.5) * 0.7), q.setFromAxisAngle(up, rng() * Math.PI * 2), sc.set(s, 1, s)).clone();
    });
    for (const mesh of instancedChunks(patchGeo, patchMat, mats, CHUNK)) {
      mesh.receiveShadow = true;
      scene.add(mesh);
      instanced.push(mesh);
    }
  }

  // ── Jonas' Lager an der Feuerstelle ─────────────────────────────────────
  let campNote = null;
  let packSpot = null;
  if (fire) {
    const fx = world(fire[0]);
    const fz = world(fire[1]);
    const tx = fx + 0.3;
    const tz = fz - 2.3;
    const canvasMat = keep(new THREE.MeshStandardMaterial({ color: 0x4a5644, roughness: 1, side: THREE.DoubleSide }));
    // Firstzelt: zwei schräge Bahnen, hinten zu, vorn offen
    const half = 0.8;
    const high = 1.15;
    const len = 2.1;
    const sheetGeo = keep(new THREE.PlaneGeometry(len, Math.hypot(half, high)));
    for (const s of [-1, 1]) {
      const sheet = new THREE.Mesh(sheetGeo, canvasMat);
      sheet.position.set(tx, high / 2, tz + (s * half) / 2);
      sheet.rotation.x = -s * (Math.PI / 2 - Math.atan2(high, half));
      sheet.castShadow = true;
      scene.add(sheet);
    }
    const backShape = new THREE.Shape();
    backShape.moveTo(-half, 0);
    backShape.lineTo(half, 0);
    backShape.lineTo(0, high);
    backShape.closePath();
    const back = new THREE.Mesh(keep(new THREE.ShapeGeometry(backShape)), canvasMat);
    back.position.set(tx - len / 2, 0, tz);
    back.rotation.y = Math.PI / 2;
    scene.add(back);
    addProp?.(tx, tz, len / 2, half * 0.8);
    // Rucksack und Schlafsack davor
    const pack = new THREE.Mesh(keep(new THREE.BoxGeometry(0.34, 0.46, 0.24)), keep(new THREE.MeshStandardMaterial({ color: 0x5a1f1a, roughness: 0.9 })));
    pack.position.set(fx - 1.25, 0.23, fz - 1.05);
    pack.rotation.set(0.1, 0.7, -0.15);
    pack.castShadow = true;
    scene.add(pack);
    const bag = new THREE.Mesh(keep(new THREE.CapsuleGeometry(0.2, 1.3, 4, 10)), keep(new THREE.MeshStandardMaterial({ color: 0x2c3a4a, roughness: 1 })));
    bag.rotation.z = Math.PI / 2;
    bag.scale.set(1, 1, 1.6);
    bag.position.set(tx + 0.1, 0.14, tz);
    scene.add(bag);
    campNote = { x: fx - 0.85, z: fz - 1.2 };
    packSpot = { x: pack.position.x, y: 0.25, z: pack.position.z, mesh: pack };
  }

  // ── Gräberfeld ──────────────────────────────────────────────────────────
  const woodDark = assets.pbr(keep(new THREE.MeshStandardMaterial({ color: 0x6a5c4c, roughness: 1 })), 'weathered_planks', 0.4, 1);
  const earthMat = keep(new THREE.MeshStandardMaterial({ color: 0x2c251d, roughness: 1 }));
  if (grave) {
    const gx = world(grave[0]);
    const gz = world(grave[1]);
    const upGeo = keep(new THREE.BoxGeometry(0.1, 1.15, 0.07));
    upGeo.translate(0, 0.575, 0);
    const crossGeo = keep(new THREE.BoxGeometry(0.62, 0.1, 0.07));
    const moundGeo = keep(new THREE.SphereGeometry(0.55, 12, 8));
    let n = 0;
    for (const dz of [-1.5, 1.2]) {
      for (const dx of [-2.2, -0.7, 0.8, 2.3]) {
        n++;
        const x = gx + dx + (rng() - 0.5) * 0.3;
        const z = gz + dz + (rng() - 0.5) * 0.3;
        if (n === 6) {
          // ein Grab ist offen: schwarzes Loch, Erdhaufen daneben, kein Kreuz
          const hole = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.85, 1.9)), keep(new THREE.MeshBasicMaterial({ color: 0x000000, polygonOffset: true, polygonOffsetFactor: -2 })));
          hole.rotation.x = -Math.PI / 2;
          hole.position.set(x, 0.015, z + 0.9);
          scene.add(hole);
          const pile = new THREE.Mesh(moundGeo, earthMat);
          pile.scale.set(1.1, 0.6, 1.5);
          pile.position.set(x + 0.95, 0, z + 0.9);
          scene.add(pile);
          continue;
        }
        const g = new THREE.Group();
        const bar = new THREE.Mesh(crossGeo, woodDark);
        bar.position.y = 0.82;
        g.add(new THREE.Mesh(upGeo, woodDark), bar);
        g.position.set(x, 0, z);
        g.rotation.set((rng() - 0.5) * 0.25, (rng() - 0.5) * 0.5, (rng() - 0.5) * 0.3);
        g.traverse((o) => { o.castShadow = true; });
        scene.add(g);
        const mound = new THREE.Mesh(moundGeo, earthMat);
        mound.scale.set(0.8, 0.28, 1.6);
        mound.position.set(x, 0, z + 0.95);
        mound.receiveShadow = true;
        scene.add(mound);
      }
    }
  }

  // ── Alter Brunnen ───────────────────────────────────────────────────────
  let wellPos = null;
  let crowbar = null;
  if (well) {
    const wx = world(well[0]);
    const wz = world(well[1]);
    wellPos = { x: wx, z: wz };
    const stone = assets.pbr(keep(new THREE.MeshStandardMaterial({ color: 0x8a8a84, roughness: 1, side: THREE.DoubleSide })), 'mossy_stone_wall', 3, 0.6);
    const ring = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.85, 0.9, 0.8, 16, 1, true)), stone);
    ring.position.set(wx, 0.4, wz);
    ring.castShadow = true;
    scene.add(ring);
    const rim = new THREE.Mesh(keep(new THREE.RingGeometry(0.62, 0.9, 16)), stone);
    rim.rotation.x = -Math.PI / 2;
    rim.position.set(wx, 0.8, wz);
    scene.add(rim);
    const inner = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.62, 0.62, 0.8, 16, 1, true)), stone);
    inner.position.set(wx, 0.4, wz);
    scene.add(inner);
    const dark = new THREE.Mesh(keep(new THREE.CircleGeometry(0.62, 16)), keep(new THREE.MeshBasicMaterial({ color: 0x000000 })));
    dark.rotation.x = -Math.PI / 2;
    dark.position.set(wx, 0.12, wz);
    scene.add(dark);
    const postGeo2 = keep(new THREE.BoxGeometry(0.11, 2.1, 0.11));
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(postGeo2, woodDark);
      post.position.set(wx + s * 0.95, 1.05, wz);
      post.castShadow = true;
      scene.add(post);
    }
    const beam = new THREE.Mesh(keep(new THREE.BoxGeometry(2.1, 0.1, 0.1)), woodDark);
    beam.position.set(wx, 2.05, wz);
    scene.add(beam);
    const rope = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.012, 0.012, 1.1, 5)), keep(new THREE.MeshStandardMaterial({ color: 0x5a4a30, roughness: 1 })));
    rope.position.set(wx + 0.1, 1.5, wz);
    scene.add(rope);
    const bucket = assets.model('wooden_bucket_01', 0.34, { castShadow: false });
    bucket.position.set(wx + 0.1, 0.62, wz);
    scene.add(bucket);
    addProp?.(wx, wz, 0.9, 0.9);
    // Im Eimer liegt das Brecheisen — der Eimer hängt tief im Schacht, man muss das Seil hochziehen.
    // lift(0…1) zieht Eimer, Eisen und Seil nach oben.
    const bar = makeCrowbar(keep);
    bar.rotation.z = 0.24;
    scene.add(bar);
    const lift = (k) => {
      const y = -0.55 + k * 1.17;
      bucket.position.y = y;
      bar.position.set(wx + 0.07, y + 0.05, wz);
      const len = 2.05 - (y + 0.3);
      rope.scale.y = len / 1.1;
      rope.position.y = 2.05 - len / 2;
    };
    lift(0);
    crowbar = { x: wx, z: wz, mesh: bar, lift };
  }

  // ── Puppen in den Bäumen ────────────────────────────────────────────────
  // An ein paar Stämmen entlang der Pfade hängen Sackpuppen an Stricken und pendeln im Wind.
  const dolls = [];
  if (path?.length) {
    const sack = keep(new THREE.MeshStandardMaterial({ color: 0x6a5c44, roughness: 1 }));
    const bodyGeo = keep(new THREE.BoxGeometry(0.26, 0.5, 0.14));
    const headGeo = keep(new THREE.SphereGeometry(0.12, 10, 8));
    const armGeo = keep(new THREE.CylinderGeometry(0.02, 0.02, 0.72, 5));
    armGeo.rotateZ(Math.PI / 2);
    const ropeGeo = keep(new THREE.CylinderGeometry(0.008, 0.008, 1.9, 4));
    ropeGeo.translate(0, -0.95, 0);
    const seen = new Set();
    for (let i = 5; i < path.length && dolls.length < 6; i += 4 + Math.floor(rng() * 4)) {
      const [px, pz] = path[i];
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const k = (pz + dz) * size + px + dx;
        const t = trunks.get(k);
        if (!t || seen.has(k)) continue;
        seen.add(k);
        const g = new THREE.Group();
        // zwischen Stamm und Pfad, Aufhängung hoch oben im Dunkel der Krone
        g.position.set(t.x - dx * (t.r + 0.55), 4.5, t.z - dz * (t.r + 0.55));
        g.rotation.y = rng() * Math.PI * 2;
        const body = new THREE.Mesh(bodyGeo, sack);
        body.position.y = -2.3;
        const head = new THREE.Mesh(headGeo, sack);
        head.position.y = -1.95;
        const arm = new THREE.Mesh(armGeo, woodDark);
        arm.position.y = -2.15;
        g.add(new THREE.Mesh(ropeGeo, woodDark), body, head, arm);
        g.traverse((o) => { o.castShadow = true; });
        scene.add(g);
        dolls.push({ g, phase: rng() * 6, speed: 0.6 + rng() * 0.5 });
        break;
      }
    }
  }

  // ── Sterne zwischen den Kronen ──────────────────────────────────────────
  const starCount = 500;
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const a = rng() * Math.PI * 2;
    const e = 0.25 + rng() * 1.2;
    starPos[i * 3] = Math.cos(a) * Math.cos(e) * STAR_R;
    starPos[i * 3 + 1] = Math.sin(e) * STAR_R;
    starPos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * STAR_R;
  }
  const starGeo = keep(new THREE.BufferGeometry());
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(starGeo, keep(new THREE.PointsMaterial({ color: 0x9aa4c0, size: 1.4, sizeAttenuation: false, fog: false })));
  // Sie hängen an der Kamera (tick) — so liegen sie immer innerhalb der Sichtweite
  stars.frustumCulled = false;
  scene.add(stars);

  return {
    instanced,
    car,
    headlights,
    /** Handy im Auto (Intro): draw(state, secs) malt den Bildschirm, glow ist das Licht im Innenraum. */
    phone,
    /** Anfahrt: driveCar(s) setzt den Wagen auf seine Bahn, wreckCar() stellt das Wrack an den Baum. */
    driveCar,
    wreckCar,
    drive: DRIVE,
    roadZ,
    gateLeaf: leaf,
    gateX,
    gateZ: hi,
    /**
     * Stellen für Dinge, die game.js hinlegt: Schlüssel und Dienstbuch auf dem Tisch, Akku am Bett, Zettel im Lager
     * und am Tor. y = Höhe der Fläche, auf der das Ding liegt (Tischplatte 0,81 m, Hüttenboden 0,02 m).
     */
    spots: {
      key: { x: tableX - 0.25, y: 0.812, z: tableZ },
      hutNote: { x: tableX + 0.3, y: 0.815, z: tableZ + 0.05 },
      hutBattery: { x: hutX - 1.2, y: 0.022, z: hutZ + 0.9 },
      campNote,
      /** Jonas' Rucksack am Lager (das Modell steht schon da — game.js macht es ansehbar) */
      pack: packSpot,
      gateNote: { x: gateX - 1.1, y: 0.03, z: hi - 1.6 },
    },
    /**
     * Vernagelte Hütte: planks = die drei Bretter, door = Türblatt, (x, z) = Mitte der Türöffnung außen,
     * half = halbe Türbreite. boarded = false: Tür steht offen (Karte ohne Brunnen).
     */
    hut: { boarded, planks, door: hutDoor, x: hutX, z: southZ + wallT / 2, half: doorW / 2 },
    /** Brecheisen im Brunnen: lift(0…1) zieht es am Seil herauf, mesh ausblenden, wenn man es hat. null ohne Brunnen. */
    crowbar,
    hutBox: { minX: hutX - hutW / 2, maxX: hutX + hutW / 2, minZ: hutZ - hutD / 2, maxZ: hutZ + hutD / 2 },
    well: wellPos,
    /** Flackern der Lichter in der Kulisse, jedes Bild; die Sterne wandern mit der Kamera mit. */
    tick(t, cam) {
      if (cam) {
        stars.position.set(cam.position.x, 0, cam.position.z);
        const cx = cam.position.x;
        const cz = cam.position.z;
        for (const [group, range] of details) {
          for (const im of group.children) {
            const bs = im.boundingSphere;
            if (bs) im.visible = Math.hypot(bs.center.x - cx, bs.center.z - cz) - bs.radius < range;
          }
        }
      }
      for (const d of dolls) {
        d.g.rotation.z = Math.sin(t * d.speed + d.phase) * 0.07;
        d.g.rotation.x = Math.sin(t * d.speed * 0.7 + d.phase * 2) * 0.04;
      }
      lanternLight.intensity = 2.2 * (0.85 + Math.sin(t * 13) * 0.05 + Math.sin(t * 7.3) * 0.08);
      if (ember) ember.emissiveIntensity = 0.9 + Math.sin(t * 3.1) * 0.3 + Math.sin(t * 11.7) * 0.15;
    },
  };
}
