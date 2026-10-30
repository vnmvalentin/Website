// gardenWorld.js — die sichtbare Welt der Garten-Ebene: ein Labyrinth aus moosigen Steinmauern unter freiem
// Nachthimmel. In der Mitte ein Platz mit Brunnen und Obelisk, auf dessen Spitze ein rotes Licht brennt (ohne
// Nebel — man sieht es über die Mauern hinweg, wenn der Blick frei ist). In Sackgassen stehen Statuen in Ketten:
// vier davon stehen auf drehbaren runden Sockeln (das Rätsel), die übrigen sind festgemauerte Attrappen.
// Ausgang ist ein schmiedeeisernes Tor in der Außenmauer.
//
// Alles Fotomaterial bzw. Poly-Haven-Scans (CC0): mossy_stone_wall, old_stone_wall, grass_path_2,
// mossy_cobblestone, gothic_statue, large_iron_gate, painted_wooden_bench. Spiellogik bleibt in game.js.
import * as THREE from 'three';
import { instancedChunks } from '../ClashRoyale/modes/scene3d/kit';

const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
/** Blickrichtung je Stufe (0..3) als Kachelrichtung: Norden (-z), Osten (+x), Süden (+z), Westen (-x). */
export const FACING = [[0, -1], [1, 0], [0, 1], [-1, 0]];
/** Drehung der Statue (rotation.y) für Stufe f — das Modell schaut ohne Drehung nach +z (Süden). */
const yawOfFacing = (f) => Math.atan2(FACING[f][0], FACING[f][1]);
export const BEACON_H = 11;
const GATE_H = 2.7;
const STAR_R = 60;

/**
 * @param {{ scene:THREE.Scene, keep:Function, rng:()=>number, maze:any, isOpen:Function, S:number, wallH:number,
 *           assets:any, addProp:Function, door:number[], exitCell:number[], center:number[],
 *           puzzle:number[][], decoys:number[][], benches:{cell:number[],back:number[]}[] }} p
 */
export function buildGarden(p) {
  const { scene, keep, rng, maze, isOpen, S, wallH, assets, addProp, door, exitCell, center, puzzle, decoys, benches } = p;
  const size = maze.size;
  const world = (t) => t * S;
  const instanced = [];
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();

  // ── Boden ───────────────────────────────────────────────────────────────
  const margin = 8;
  const span = (size + margin * 2) * S;
  const mid = world(size / 2) - S / 2;
  const floor = new THREE.Mesh(keep(new THREE.PlaneGeometry(span, span)),
    assets.pbr(keep(new THREE.MeshStandardMaterial({ color: 0x4a4636, roughness: 1 })), 'grass_path_2', span / 3, span / 3));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(mid, 0, mid);
  floor.receiveShadow = true;
  scene.add(floor);

  // ── Mauern ──────────────────────────────────────────────────────────────
  // Zwei Steinsorten, Höhe leicht verschieden; manche Stücke sind eingestürzt (niedriger) — dort sieht
  // man über die Mauer hinweg (das rote Licht in der Mitte, aber auch die Laterne des Gärtners).
  const isDoor = (x, z) => x === door[0] && z === door[1];
  const touchesOpen = (x, z) => DIRS4.some(([dx, dz]) => isOpen(maze, x + dx, z + dz));
  const wallGeo = keep(new THREE.BoxGeometry(S, 1, S));
  wallGeo.translate(0, 0.5, 0);
  const capGeo = keep(new THREE.BoxGeometry(S + 0.14, 0.16, S + 0.14));
  capGeo.translate(0, 0.08, 0);
  const mossy = assets.pbr(keep(new THREE.MeshStandardMaterial({ color: 0x8c8c80, roughness: 1 })), 'mossy_stone_wall', 1, 1.3, { normalScale: 1.3 });
  const plain = assets.pbr(keep(new THREE.MeshStandardMaterial({ color: 0x7a786e, roughness: 1 })), 'old_stone_wall', 1, 1.3, { normalScale: 1.2 });
  const capMat = assets.pbr(keep(new THREE.MeshStandardMaterial({ color: 0x6e6c64, roughness: 1 })), 'old_stone_wall', 1, 0.1);
  const lists = { mossy: [], plain: [], cap: [] };
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      if (isOpen(maze, x, z) || isDoor(x, z) || !touchesOpen(x, z)) continue;
      const crumbled = x > 0 && z > 0 && x < size - 1 && z < size - 1 && rng() < 0.07;
      const h = crumbled ? 1.5 + rng() * 0.6 : wallH + (rng() - 0.5) * 0.35;
      (rng() < 0.62 ? lists.mossy : lists.plain).push(m4.compose(v.set(world(x), 0, world(z)), q.identity(), sc.set(1, h, 1)).clone());
      lists.cap.push(m4.compose(v.set(world(x), h, world(z)), q.identity(), sc.set(1, 1, 1)).clone());
    }
  }
  for (const [geo, mat, list] of [[wallGeo, mossy, lists.mossy], [wallGeo, plain, lists.plain], [capGeo, capMat, lists.cap]]) {
    for (const mesh of instancedChunks(geo, mat, list, 24)) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      instanced.push(mesh);
    }
  }

  // ── Platz in der Mitte: Pflaster, Brunnen, Obelisk mit rotem Licht ──────
  const cx = world(center[0]);
  const cz = world(center[1]);
  const plaza = new THREE.Mesh(keep(new THREE.PlaneGeometry(S * 3, S * 3)),
    assets.pbr(keep(new THREE.MeshStandardMaterial({ color: 0x77736a, roughness: 1 })), 'mossy_cobblestone', 3, 3));
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(cx, 0.006, cz);
  plaza.receiveShadow = true;
  scene.add(plaza);
  const stone = assets.pbr(keep(new THREE.MeshStandardMaterial({ color: 0x8a867c, roughness: 1 })), 'old_stone_wall', 2, 0.5);
  // Brunnenbecken als Drehkörper (Profil: Boden, Außenwand, Rand, Innenwand)
  const basinGeo = keep(new THREE.LatheGeometry([
    new THREE.Vector2(0, 0.1), new THREE.Vector2(1.18, 0.1), new THREE.Vector2(1.3, 0), new THREE.Vector2(1.38, 0.02),
    new THREE.Vector2(1.38, 0.55), new THREE.Vector2(1.46, 0.6), new THREE.Vector2(1.46, 0.68), new THREE.Vector2(1.22, 0.68),
    new THREE.Vector2(1.2, 0.3), new THREE.Vector2(0, 0.3),
  ], 32));
  const basin = new THREE.Mesh(basinGeo, stone);
  basin.position.set(cx, 0, cz);
  basin.castShadow = true;
  basin.receiveShadow = true;
  scene.add(basin);
  const water = new THREE.Mesh(keep(new THREE.CircleGeometry(1.2, 32)),
    keep(new THREE.MeshStandardMaterial({ color: 0x050807, roughness: 0.06, metalness: 0.4 })));
  water.rotation.x = -Math.PI / 2;
  water.position.set(cx, 0.48, cz);
  scene.add(water);
  // Obelisk: vierkantig, verjüngt, mit Spitze
  const obeliskGeo = keep(new THREE.CylinderGeometry(0.2, 0.42, BEACON_H - 1, 4, 1));
  obeliskGeo.rotateY(Math.PI / 4);
  const obelisk = new THREE.Mesh(obeliskGeo, stone);
  obelisk.position.set(cx, (BEACON_H - 1) / 2 + 0.3, cz);
  obelisk.castShadow = true;
  scene.add(obelisk);
  const tipGeo = keep(new THREE.ConeGeometry(0.28, 0.6, 4));
  tipGeo.rotateY(Math.PI / 4);
  const tip = new THREE.Mesh(tipGeo, stone);
  tip.position.set(cx, BEACON_H + 0.55, cz);
  scene.add(tip);
  // Rotes Licht: ohne Nebel (aus jeder Entfernung sichtbar), über der Bloom-Schwelle; dazu ein schwacher
  // Lichtschaft in den Himmel, der auch hinter Mauern noch verrät, wo die Mitte ist
  const beaconMat = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2a14).multiplyScalar(3), fog: false }));
  const beacon = new THREE.Mesh(keep(new THREE.SphereGeometry(0.2, 14, 10)), beaconMat);
  beacon.position.set(cx, BEACON_H - 0.1, cz);
  scene.add(beacon);
  const shaftMat = keep(new THREE.MeshBasicMaterial({
    color: 0xff3018, transparent: true, opacity: 0.09, fog: false, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }));
  const shaft = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.5, 0.08, 40, 12, 1, true)), shaftMat);
  shaft.position.set(cx, BEACON_H + 20, cz);
  scene.add(shaft);
  const glow = new THREE.PointLight(0xff3a20, 2.2, 9, 1.6);
  glow.position.set(cx, 2.4, cz);
  scene.add(glow);
  addProp(cx, cz, 1.35, 1.35);

  // ── Statuen ─────────────────────────────────────────────────────────────
  const statues = [];
  const pedestalRound = keep(new THREE.CylinderGeometry(0.46, 0.5, 0.36, 24));
  pedestalRound.translate(0, 0.18, 0);
  const groove = keep(new THREE.TorusGeometry(0.47, 0.018, 6, 32));
  groove.rotateX(Math.PI / 2);
  const grooveMat = keep(new THREE.MeshStandardMaterial({ color: 0x0c0c0a, roughness: 0.9 }));
  const pedestalSquare = keep(new THREE.BoxGeometry(0.9, 0.42, 0.9));
  pedestalSquare.translate(0, 0.21, 0);
  const statueModel = assets.model('gothic_statue', 1.85, {
    tweak: (m) => { m.color.multiplyScalar(0.8); },
  });
  const cloneStatue = () => {
    const g = new THREE.Group();
    const fill = () => {
      for (const c of statueModel.children) {
        const cl = c.clone(true);
        cl.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.userData.sharedGeometry = true; } });
        g.add(cl);
      }
    };
    if (statueModel.userData.loaded) fill(); else statueModel.addEventListener('loaded', fill);
    return g;
  };
  const placeStatue = (cell, turnable, f) => {
    const back = DIRS4.find(([dx, dz]) => !isOpen(maze, cell[0] + dx, cell[1] + dz)
      && isOpen(maze, cell[0] - dx, cell[1] - dz)) || [0, -1];
    const x = world(cell[0]) + back[0] * (S / 2 - 0.62);
    const z = world(cell[1]) + back[1] * (S / 2 - 0.62);
    const base = new THREE.Mesh(turnable ? pedestalRound : pedestalSquare, stone);
    base.position.set(x, 0, z);
    base.castShadow = true;
    base.receiveShadow = true;
    scene.add(base);
    if (turnable) {
      const ring = new THREE.Mesh(groove, grooveMat);
      ring.position.set(x, 0.3, z);
      scene.add(ring);
    }
    const turn = new THREE.Group();
    turn.position.set(x, turnable ? 0.36 : 0.42, z);
    turn.rotation.y = yawOfFacing(f);
    turn.add(cloneStatue());
    scene.add(turn);
    addProp(x, z, 0.5, 0.5);
    return { cell, x, z, turn, facing: f, turnable };
  };
  for (const s of puzzle) statues.push(placeStatue(s.cell, true, s.facing));
  for (const c of decoys) {
    // Attrappen schauen aus der Sackgasse heraus (wie die echten, wenn sie richtig stehen könnten)
    const out = DIRS4.findIndex(([dx, dz]) => isOpen(maze, c[0] + dx, c[1] + dz));
    const f = FACING.findIndex(([dx, dz]) => dx === DIRS4[Math.max(0, out)][0] && dz === DIRS4[Math.max(0, out)][1]);
    statues.push(placeStatue(c, false, f < 0 ? 0 : f));
  }

  // ── Tor in der Außenmauer ──────────────────────────────────────────────
  const doorDir = [door[0] - exitCell[0], door[1] - exitCell[1]];
  const gateX = world(door[0]) - doorDir[0] * (S / 2 - 0.15);
  const gateZ = world(door[1]) - doorDir[1] * (S / 2 - 0.15);
  // Torpfosten links und rechts
  const side = [doorDir[1], doorDir[0]];
  const postGeo = keep(new THREE.BoxGeometry(0.42, wallH + 0.5, 0.42));
  postGeo.translate(0, (wallH + 0.5) / 2, 0);
  for (const k of [-1, 1]) {
    const post = new THREE.Mesh(postGeo, plain);
    post.position.set(gateX + side[0] * k * (S / 2 + 0.05), 0, gateZ + side[1] * k * (S / 2 + 0.05));
    post.castShadow = true;
    scene.add(post);
  }
  // Zwei Flügel um ihre Angeln; das Modell enthält einen Flügel, der zweite ist gespiegelt
  const leaves = [];
  const gateModel = assets.model('large_iron_gate', 2.9, { castShadow: true });
  const wallYaw = Math.atan2(side[0], side[1]); // lokale +z entlang der Mauer
  for (const k of [-1, 1]) {
    const hinge = new THREE.Group();
    hinge.position.set(gateX + side[0] * k * (S / 2 - 0.05), 0, gateZ + side[1] * k * (S / 2 - 0.05));
    scene.add(hinge);
    const leaf = new THREE.Group();
    hinge.add(leaf);
    leaves.push({ hinge, k, base: 0 });
    const fill = () => {
      const src = gateModel.children[0];
      if (!src) return;
      const cl = src.clone(true);
      const box = new THREE.Box3().setFromObject(cl);
      const sz = box.getSize(new THREE.Vector3());
      // breitere waagerechte Achse = Flügelbreite, auf halbe Durchgangsbreite bringen
      const alongX = sz.x >= sz.z;
      const w = alongX ? sz.x : sz.z;
      // Breite und Höhe getrennt: der Flügel im Scan ist fast quadratisch, das Tor soll mannshoch sein
      const kw = (S / 2 - 0.08) / w;
      const kh = GATE_H / sz.y;
      const holder = new THREE.Group();
      holder.add(cl);
      cl.position.set(-(box.min.x + sz.x / 2), -box.min.y, -(box.min.z + sz.z / 2));
      holder.rotation.y = alongX ? Math.PI / 2 : 0; // Breite entlang lokaler z-Achse
      const outer = new THREE.Group();
      outer.add(holder);
      // zweiter Flügel gespiegelt (z = Richtung entlang der Mauer); Mitte des Flügels zwischen Angel und Tormitte
      outer.scale.set(kw, kh, kw * k);
      outer.position.z = -k * (S / 4 - 0.025);
      cl.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.material.side = THREE.DoubleSide; } });
      leaf.add(outer);
    };
    if (gateModel.userData.loaded) fill(); else gateModel.addEventListener('loaded', fill);
    hinge.rotation.y = wallYaw;
  }
  // Dahinter: freies Feld im Mondlicht
  let gateOpen = 0;
  let gateTarget = 0;

  // ── Bänke ───────────────────────────────────────────────────────────────
  for (const b of benches) {
    const g = assets.model('painted_wooden_bench', 0.85, { tweak: (m) => m.color.multiply(new THREE.Color(0x4a4440)) });
    const holder = new THREE.Group();
    holder.add(g);
    scene.add(holder);
    const place = () => {
      const box = new THREE.Box3().setFromObject(g);
      const sz = box.getSize(new THREE.Vector3());
      const along = b.back[0] !== 0 ? 'z' : 'x';
      let rot = 0;
      let deep = sz.z;
      let wide = sz.x;
      if ((along === 'z') === (sz.x > sz.z)) { rot = Math.PI / 2; deep = sz.x; wide = sz.z; }
      const k = Math.min(1, 0.55 / deep, (S - 0.4) / wide);
      holder.scale.setScalar(k);
      holder.rotation.y = rot + (rng() < 0.5 ? 0 : Math.PI);
      const x = world(b.cell[0]) + b.back[0] * (S / 2 - (deep * k) / 2 - 0.05);
      const z = world(b.cell[1]) + b.back[1] * (S / 2 - (deep * k) / 2 - 0.05);
      holder.position.set(x, 0, z);
      const hx = (along === 'z' ? deep : wide) * k / 2;
      const hz = (along === 'z' ? wide : deep) * k / 2;
      addProp(x, z, hx, hz);
    };
    if (g.userData.loaded) place(); else g.addEventListener('loaded', place);
  }

  // ── Mond und Sterne ─────────────────────────────────────────────────────
  const moon = new THREE.DirectionalLight(0x7f94c8, 0.75);
  moon.position.set(mid - 40, 60, mid + 25);
  moon.target.position.set(mid, 0, mid);
  scene.add(moon, moon.target);
  const moonDisc = new THREE.Mesh(keep(new THREE.CircleGeometry(2.2, 32)),
    keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(0xdfe6ff).multiplyScalar(1.6), fog: false })));
  scene.add(moonDisc);
  const moonDir = new THREE.Vector3(-40, 60, 25).normalize();
  const starCount = 600;
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const a = rng() * Math.PI * 2;
    const e = 0.2 + rng() * 1.3;
    starPos[i * 3] = Math.cos(a) * Math.cos(e) * STAR_R;
    starPos[i * 3 + 1] = Math.sin(e) * STAR_R;
    starPos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * STAR_R;
  }
  const starGeo = keep(new THREE.BufferGeometry());
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(starGeo, keep(new THREE.PointsMaterial({ color: 0xa4aecc, size: 1.4, sizeAttenuation: false, fog: false })));
  stars.frustumCulled = false;
  scene.add(stars);

  return {
    instanced,
    statues,
    beacon: { x: cx, z: cz },
    gate: { x: gateX, z: gateZ },
    /** Statue um eine Stufe im Uhrzeigersinn weiterdrehen (Animation in tick) */
    turnStatue(s) {
      s.facing = (s.facing + 1) % 4;
      s.target = yawOfFacing(s.facing);
    },
    openGate() { gateTarget = 1; },
    tick(t, dt, cam) {
      stars.position.set(cam.position.x, 0, cam.position.z);
      moonDisc.position.copy(cam.position).addScaledVector(moonDir, STAR_R - 2);
      moonDisc.lookAt(cam.position);
      beaconMat.color.setRGB(1, 0.16, 0.08).multiplyScalar(2.6 + Math.sin(t * 2.1) * 0.5);
      glow.intensity = 2 + Math.sin(t * 2.1) * 0.4;
      for (const s of statues) {
        if (s.target === undefined) continue;
        let d = s.target - s.turn.rotation.y;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        const step = Math.sign(d) * Math.min(Math.abs(d), dt * 1.8);
        s.turn.rotation.y += step;
        if (Math.abs(d) < 1e-3) { s.turn.rotation.y = s.target; s.target = undefined; }
      }
      if (gateOpen < gateTarget) {
        gateOpen = Math.min(1, gateOpen + dt * 0.45);
        const e = 1 - (1 - gateOpen) ** 2;
        // nach außen aufschwingen (vom Spieler weg)
        for (const l of leaves) l.hinge.rotation.y = wallYaw + l.k * e * 1.75 * (doorDir[0] + doorDir[1] > 0 ? -1 : 1);
      }
    },
  };
}
