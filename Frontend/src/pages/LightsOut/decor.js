// decor.js — Ausstattung von Anstalt und Keller (alles Fotomaterial bzw. Poly-Haven-Scans, CC0):
//
//  • Räume: die offenen 3×3-Hallen des Labyrinths werden möbliert. Anstalt = Behandlungsraum (Linoleum,
//    Behandlungsstuhl in der Mitte, Instrumentenwagen, Hocker, Betten, Schränke, Rollstühle, Infusionsständer),
//    Keller = Lagerraum (Kistenstapel, Fässer, Regale, Eimer). Die Möbel in der Raummitte sperren diese Kachel
//    für die Monster (maze.blocked), damit sie nicht hindurchlaufen.
//  • Flackerlampen: Leuchtstoffröhren hängen an Kabeln von der Decke (Anstalt), Käfiglampen im Keller. Manche
//    sind tot, die anderen flackern nach eigenem Muster. Echtes Licht geben nur die nächsten paar (fester
//    Vorrat an Punktlichtern — jedes Licht kostet in jedem Shader, deshalb nicht eines je Lampe). Kommt ein
//    Monster vorbei, spielen die Lampen in seiner Nähe verrückt.
//  • Rohre an der Kellerdecke, als durchgehende Stränge entlang der Wände.
import * as THREE from 'three';
import { instancedChunks } from '../ClashRoyale/modes/scene3d/kit';

const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/**
 * Lädt ein Modell, skaliert es in einen Kasten (Breite entlang der Wand, Tiefe in den Raum, Höhe), stellt es
 * auf (x, z) und meldet seine Grundfläche als Hindernis. back = Richtung zur Wand (Rückseite), sonst frei drehbar.
 */
function placeModel(ctx, { id, h, x, z, back = null, rotY = 0, maxW = 2, maxD = 0.9, collide = true, tint = null, flip = false }) {
  const { scene, assets, addProp } = ctx;
  const holder = assets.model(id, h, tint ? { tweak: (m) => m.color.multiply(new THREE.Color(tint)) } : {});
  const g = new THREE.Group();
  g.userData.prop = id;
  g.add(holder);
  scene.add(g);
  const place = () => {
    const box = new THREE.Box3().setFromObject(holder);
    const size = box.getSize(new THREE.Vector3());
    let rot = rotY;
    let wide = size.x;
    let deep = size.z;
    if (back) {
      // längere Seite parallel zur Wand
      const along = back[0] !== 0 ? 'z' : 'x';
      rot = 0;
      if ((along === 'z') === (size.x > size.z)) { rot = Math.PI / 2; wide = size.z; deep = size.x; }
      if (flip) rot += Math.PI;
    } else if (Math.abs(Math.sin(rot)) > 0.7) { wide = size.z; deep = size.x; }
    const k = Math.min(1, maxD / deep, maxW / wide);
    g.scale.setScalar(k);
    g.rotation.y = rot;
    let cx = x;
    let cz = z;
    if (back) {
      cx += back[0] * (-(deep * k) / 2);
      cz += back[1] * (-(deep * k) / 2);
    }
    g.position.set(cx, 0, cz);
    if (collide) {
      const alongX = back ? back[0] === 0 : Math.abs(Math.cos(rot)) > 0.7;
      const hx = (alongX ? wide : deep) * k / 2;
      const hz = (alongX ? deep : wide) * k / 2;
      addProp(cx, cz, hx, hz);
    }
  };
  if (holder.userData.loaded) place(); else holder.addEventListener('loaded', place);
  return g;
}

/** Infusionsständer aus Rohr, Fuß mit Rollen, Haken und halb leerem Beutel (gebaut, kein Scan nötig). */
function ivStand(ctx, x, z) {
  const { scene, keep, assets } = ctx;
  const g = new THREE.Group();
  const metal = assets.pbr(keep(new THREE.MeshStandardMaterial({ color: 0x9a9890, roughness: 0.4, metalness: 0.85 })), 'rusty_metal_02', 0.3, 2);
  const pole = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.012, 0.014, 1.95, 8)), metal);
  pole.position.y = 1.0;
  g.add(pole);
  const legGeo = keep(new THREE.BoxGeometry(0.3, 0.02, 0.025));
  legGeo.translate(0.15, 0, 0);
  const wheelGeo = keep(new THREE.SphereGeometry(0.022, 8, 6));
  const dark = keep(new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.7 }));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const leg = new THREE.Mesh(legGeo, metal);
    leg.position.y = 0.05;
    leg.rotation.y = a;
    const w = new THREE.Mesh(wheelGeo, dark);
    w.position.set(Math.cos(a) * 0.29, 0.022, -Math.sin(a) * 0.29);
    g.add(leg, w);
  }
  const hook = new THREE.Mesh(keep(new THREE.TorusGeometry(0.06, 0.006, 6, 16, Math.PI)), metal);
  hook.position.y = 1.97;
  g.add(hook);
  const bag = new THREE.Mesh(keep(new THREE.SphereGeometry(0.07, 12, 10)),
    keep(new THREE.MeshStandardMaterial({ color: 0xd8d2a8, roughness: 0.25, transparent: true, opacity: 0.75 })));
  bag.scale.set(0.8, 1.4, 0.35);
  bag.position.set(0.06, 1.8, 0);
  const line = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.003, 0.003, 0.9, 4)), bag.material);
  line.position.set(0.07, 1.27, 0.02);
  line.rotation.z = 0.08;
  g.add(bag, line);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.position.set(x, 0, z);
  g.rotation.y = ctx.rng() * Math.PI * 2;
  g.userData.prop = 'iv_stand';
  scene.add(g);
  ctx.addProp(x, z, 0.18, 0.18);
}

/**
 * Möbliert die 3×3-Räume. avoid: Kachel-Indizes, auf denen schon etwas liegt (Sicherungen, Spinde, Start …).
 * @param {{ scene:THREE.Scene, assets:any, keep:Function, maze:any, isOpen:Function, S:number, addProp:Function,
 *           rng:()=>number, kind:'halls'|'cellar', avoid:Set<number> }} ctx
 * @returns {{ lamps: number[][] }} Raummitten (für eine Hängelampe über dem Raum)
 */
export function furnishRooms(ctx) {
  const { scene, assets, keep, maze, isOpen, S, rng, kind, avoid } = ctx;
  const size = maze.size;
  const lamps = [];
  const floorMat = kind === 'halls'
    ? assets.pbr(keep(new THREE.MeshStandardMaterial({ color: 0x8a7a66, roughness: 0.6 })), 'old_linoleum_flooring_01', 3, 3, { normalScale: 0.6 })
    : null;
  if (floorMat) floorMat.color.setRGB(0.62, 0.58, 0.52); // Foto ist hell und warm — gealtert abdunkeln
  for (const [cx, cz] of maze.rooms || []) {
    const idx = (x, z) => z * size + x;
    // Raum muss wirklich 3×3 offen sein (könnte am Rand angeschnitten sein)
    let full = true;
    for (let z = cz - 1; z <= cz + 1; z++) for (let x = cx - 1; x <= cx + 1; x++) if (!isOpen(maze, x, z)) full = false;
    if (!full) continue;
    const wx = cx * S;
    const wz = cz * S;
    if (floorMat) {
      const floor = new THREE.Mesh(keep(new THREE.PlaneGeometry(S * 3 - 0.05, S * 3 - 0.05)), floorMat);
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(wx, 0.004, wz);
      floor.receiveShadow = true;
      scene.add(floor);
    }
    // Mitte: Behandlungsstuhl mit Wagen und Hocker bzw. Kistenstapel
    if (!avoid.has(idx(cx, cz))) {
      const rot = Math.floor(rng() * 4) * (Math.PI / 2);
      const fx = -Math.sin(rot);
      const fz = -Math.cos(rot);
      if (kind === 'halls') {
        placeModel(ctx, { id: 'BarberShopChair_01', h: 1.15, x: wx, z: wz, rotY: rot, maxW: 0.9, maxD: 1.3 });
        // Instrumentenwagen seitlich, Hocker davor (Arzt-Seite)
        placeModel(ctx, { id: 'tool_cart', h: 0.9, x: wx + fz * 0.85, z: wz - fx * 0.85, rotY: rot + Math.PI / 2, maxW: 0.7, maxD: 0.45 });
        placeModel(ctx, { id: 'metal_stool_01', h: 0.55, x: wx - fz * 0.75 + fx * 0.3, z: wz + fx * 0.75 + fz * 0.3, rotY: rng() * 6, maxW: 0.4, maxD: 0.4 });
      } else {
        placeModel(ctx, { id: 'wooden_crate_02', h: 0.8, x: wx - 0.25, z: wz, rotY: rng() * 0.4, maxW: 0.9, maxD: 0.9 });
        placeModel(ctx, { id: 'wooden_crate_02', h: 0.6, x: wx + 0.55, z: wz + 0.35, rotY: 0.6 + rng() * 0.4, maxW: 0.65, maxD: 0.65 });
        placeModel(ctx, { id: 'barrel_03', h: 0.95, x: wx + 0.2, z: wz - 0.7, rotY: rng() * 6, maxW: 0.6, maxD: 0.6, tint: 0x6a5a4c });
      }
      maze.blocked.add(idx(cx, cz));
    }
    lamps.push([cx, cz]);
    // Ränder: an den Außenwänden des Raums entlang
    const wallPieces = kind === 'halls'
      ? [
        { id: 'old_bed_frame', h: 0.85, d: 0.95 },
        { id: 'drawer_cabinet', h: 1.15, d: 0.5 },
        { id: 'wheelchair_01', h: 0.95, d: 0.7 },
        { iv: true },
        { id: 'medical_box', h: 0.35, d: 0.4 },
        { id: 'metal_trash_can', h: 0.75, d: 0.45 },
        { id: 'old_bed_frame', h: 0.85, d: 0.95 },
      ]
      : [
        { id: 'worn_metal_rack', h: 1.9, d: 0.55 },
        { id: 'barrel_03', h: 0.95, d: 0.6, tint: 0x5a5e52 },
        { id: 'wooden_bucket_01', h: 0.4, d: 0.4 },
        { id: 'wooden_crate_01', h: 0.6, d: 0.6 },
        { id: 'worn_metal_rack', h: 1.9, d: 0.55 },
      ];
    let n = Math.floor(rng() * wallPieces.length);
    for (let z = cz - 1; z <= cz + 1; z++) {
      for (let x = cx - 1; x <= cx + 1; x++) {
        if (x === cx && z === cz) continue;
        if (avoid.has(idx(x, z)) || rng() < 0.3) continue;
        // eine echte Wand des Raums neben dieser Kachel (nicht der Durchgang nach draußen)
        const walls = DIRS4.filter(([dx, dz]) => {
          const ox = x + dx;
          const oz = z + dz;
          const inside = Math.abs(ox - cx) <= 1 && Math.abs(oz - cz) <= 1;
          return !inside && !isOpen(maze, ox, oz);
        });
        if (!walls.length) continue;
        const back = walls[Math.floor(rng() * walls.length)];
        const spec = wallPieces[n++ % wallPieces.length];
        const px = x * S + back[0] * (S / 2 - 0.04);
        const pz = z * S + back[1] * (S / 2 - 0.04);
        if (spec.iv) {
          ivStand(ctx, x * S + back[0] * (S / 2 - 0.35), z * S + back[1] * (S / 2 - 0.35));
          continue;
        }
        placeModel(ctx, { id: spec.id, h: spec.h, x: px, z: pz, back, maxW: S - 0.3, maxD: spec.d, tint: spec.tint, flip: rng() < 0.5 });
      }
    }
  }
  return { lamps };
}

// ── Flackerlampen ─────────────────────────────────────────────────────────

/**
 * @param {{ scene:THREE.Scene, assets:any, keep:Function, rng:()=>number, S:number, wallH:number, kind:'halls'|'cellar',
 *           cells:number[][], roomCells:number[][], pool:number, audio:any }} p
 * @returns {{ update:(t:number, dt:number, cam:THREE.Vector3, monster:{x:number,z:number}|null)=>void, lights:THREE.Light[] }}
 */
export function createFlickerLamps({ scene, assets, keep, rng, S, wallH, kind, cells, roomCells, pool, audio }) {
  const lamps = [];
  const cableMat = keep(new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.8 }));
  const deadMat = keep(new THREE.MeshStandardMaterial({ color: 0x8a8c88, roughness: 0.35, emissive: 0x050505 }));
  const tubeGeo = keep(new THREE.CylinderGeometry(0.016, 0.016, 1.3, 8));
  tubeGeo.rotateZ(Math.PI / 2);
  const bulbGeo = keep(new THREE.SphereGeometry(0.05, 10, 8));
  const tubeColor = new THREE.Color(0xe4eeff);
  const bulbColor = new THREE.Color(0xffc27a);

  const addLamp = (cx, cz, { room = false } = {}) => {
    const x = cx * S + (room ? 0 : (rng() - 0.5) * 0.4);
    const z = cz * S + (room ? 0 : (rng() - 0.5) * 0.4);
    const alive = room || rng() < 0.55;
    const g = new THREE.Group();
    g.userData.prop = 'lamp'; // wird wie die Möbel nach Entfernung ausgeblendet (game.js)
    g.position.set(x, 0, z);
    g.rotation.y = rng() < 0.5 ? 0 : Math.PI / 2;
    scene.add(g);
    const mat = alive ? keep(new THREE.MeshBasicMaterial({ color: (kind === 'halls' && !room ? tubeColor : bulbColor).clone() })) : deadMat;
    let lightY;
    if (kind === 'halls' && !room) {
      // Leuchtstoffröhre an zwei Kabeln; manche hängen schief, weil ein Kabel gerissen ist
      const drop = 0.4 + rng() * 0.25;
      const broken = rng() < 0.22;
      const hang = new THREE.Group();
      hang.position.y = wallH - drop;
      if (broken) { hang.rotation.z = 0.32 + rng() * 0.2; hang.position.y -= 0.18; }
      g.add(hang);
      // Die Datei ist ein Set aus sieben Leuchten (_a … _g) — je Lampe eine davon
      const part = ['_a', '_b', '_c', '_d', '_e', '_g'][Math.floor(rng() * 6)];
      const fixture = assets.model('mounted_fluorescent_lights', 0.07, { castShadow: true, part });
      hang.add(fixture);
      for (const s of broken ? [-1] : [-1, 1]) {
        const len = broken ? drop + 0.38 : drop;
        const cable = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.006, 0.006, len, 4)), cableMat);
        cable.position.set(s * 0.45, 0.12 + len / 2, 0);
        hang.add(cable);
      }
      for (const dz of [-0.07, 0.07]) {
        const tube = new THREE.Mesh(tubeGeo, mat);
        tube.position.set(0, -0.012, dz);
        hang.add(tube);
      }
      lightY = wallH - drop - 0.25;
    } else {
      // Käfiglampe (Keller) bzw. Industrielampe über dem Behandlungsstuhl (Anstalt)
      const id = room && kind === 'halls' ? 'hanging_industrial_lamp' : 'caged_hanging_light';
      const h = room && kind === 'halls' ? 0.9 : 0.5;
      const holder = assets.model(id, h, { castShadow: false });
      holder.position.y = wallH - h - 0.01;
      g.add(holder);
      const bulb = new THREE.Mesh(bulbGeo, mat);
      bulb.position.y = wallH - h + (room && kind === 'halls' ? 0.08 : 0.12);
      g.add(bulb);
      lightY = bulb.position.y - 0.15;
    }
    lamps.push({
      x, z, y: lightY, alive, mat, base: (kind === 'halls' && !room ? tubeColor : bulbColor).clone(),
      warm: !(kind === 'halls' && !room),
      // Muster: 'steady' (meist an, ab und zu ein Aussetzer), 'sputter' (meist aus, stottert an)
      mode: room ? 'steady' : rng() < 0.65 ? 'steady' : 'sputter',
      level: 1, burstUntil: 0, nextBurst: rng() * 12, offUntil: 0, flipAt: 0, on: true, buzzAt: 0,
    });
  };
  for (const c of roomCells) addLamp(c[0], c[1], { room: true });
  for (const c of cells) addLamp(c[0], c[1]);

  // Fester Vorrat an Punktlichtern ohne Schatten — wandert zu den nächsten lebenden Lampen
  const lights = [];
  for (let i = 0; i < pool; i++) {
    const l = new THREE.PointLight(0xdfe8ff, 0, 8, 1.7);
    l.castShadow = false;
    scene.add(l);
    lights.push(l);
  }
  let assignAt = 0;
  let near = [];

  return {
    lights,
    lamps,
    /** Strom ist wieder da: alle lebenden Lampen brennen ruhig (die toten bleiben tot). */
    powerOn() {
      for (const L of lamps) {
        if (!L.alive) continue;
        L.mode = 'steady';
        L.offUntil = 0;
        L.nextBurst = Infinity;
        L.burstUntil = 0;
      }
    },
    update(t, dt, cam, monster) {
      for (const L of lamps) {
        if (!L.alive) continue;
        const scared = monster && Math.hypot(monster.x - L.x, monster.z - L.z) < 6;
        if (scared && t > L.burstUntil) L.burstUntil = t + 0.4;
        if (t > L.nextBurst && t > L.burstUntil) {
          if (L.mode === 'steady') {
            L.burstUntil = t + 0.15 + rng() * 1.2;
            L.nextBurst = t + 4 + rng() * 14;
            if (rng() < 0.18) L.offUntil = L.burstUntil + 1 + rng() * 3;
          } else {
            L.burstUntil = t + 0.4 + rng() * 1.6;
            L.nextBurst = t + 1.5 + rng() * 5;
          }
        }
        let on;
        if (t < L.burstUntil) {
          if (t > L.flipAt) {
            L.flipAt = t + 0.02 + rng() * 0.09;
            L.on = rng() < (L.mode === 'sputter' ? 0.45 : 0.6);
          }
          on = L.on;
        } else if (t < L.offUntil) on = false;
        else on = L.mode === 'steady';
        const prev = L.level;
        L.level += ((on ? 1 : 0) - L.level) * Math.min(1, dt * (on ? 40 : 25));
        // Knistern beim Umschalten, nur in Hörweite und gedrosselt
        if (audio && Math.abs(L.level - prev) > 0.5 && t > L.buzzAt && Math.hypot(cam.x - L.x, cam.z - L.z) < 11) {
          L.buzzAt = t + 0.12;
          audio.fluoro?.(L.x, L.y + 0.2, L.z);
        }
        // Glühen über der Bloom-Schwelle (1,5), wenn an
        L.mat.color.copy(L.base).multiplyScalar(0.08 + L.level * (L.warm ? 2.2 : 2.6));
      }
      // Lichter alle 0,3 s den nächsten lebenden Lampen zuteilen (Abstand zur Kamera)
      if (t > assignAt) {
        assignAt = t + 0.3;
        near = lamps.filter((L) => L.alive && Math.hypot(cam.x - L.x, cam.z - L.z) < 18)
          .sort((a, b) => Math.hypot(cam.x - a.x, cam.z - a.z) - Math.hypot(cam.x - b.x, cam.z - b.z))
          .slice(0, lights.length);
      }
      lights.forEach((l, i) => {
        const L = near[i];
        if (!L) { l.intensity = 0; return; }
        l.position.set(L.x, L.y, L.z);
        l.color.copy(L.warm ? bulbColor : tubeColor);
        l.intensity = L.level * (L.warm ? 2.6 : 4.6);
      });
    },
  };
}

// ── Rohre an der Kellerdecke ──────────────────────────────────────────────

/**
 * Durchgehende Rohrstränge: an der Nordwand jeder Kachel, deren Reihe z % 4 === 1 ist, und an der Westwand jeder
 * Kachel, deren Spalte x % 4 === 3 ist. Benachbarte Kacheln treffen dieselbe Entscheidung — so entstehen lange
 * Stränge entlang der Gänge statt einzelner Stücke.
 */
export function placePipes({ scene, assets, keep, maze, isOpen, S, wallH }) {
  const size = maze.size;
  const mats = { big: [], small: [], bracket: [] };
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const alongX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
  const alongZ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  for (let z = 1; z < size - 1; z++) {
    for (let x = 1; x < size - 1; x++) {
      if (!isOpen(maze, x, z)) continue;
      const runs = [];
      if (z % 4 === 1 && !isOpen(maze, x, z - 1)) runs.push({ dir: 'x', off: [0, -1] });
      if (x % 4 === 3 && !isOpen(maze, x - 1, z)) runs.push({ dir: 'z', off: [-1, 0] });
      for (const r of runs) {
        const wx = x * S + r.off[0] * (S / 2 - 0.13);
        const wz = z * S + r.off[1] * (S / 2 - 0.13);
        q.copy(r.dir === 'x' ? alongX : alongZ);
        mats.big.push(m4.compose(v.set(wx, wallH - 0.2, wz), q, one).clone());
        mats.small.push(m4.compose(v.set(wx - r.off[0] * 0.13, wallH - 0.32, wz - r.off[1] * 0.13), q, one).clone());
        mats.bracket.push(m4.compose(v.set(wx - r.off[0] * 0.04, wallH - 0.2, wz - r.off[1] * 0.04), r.dir === 'x' ? new THREE.Quaternion() : new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2), one).clone());
      }
    }
  }
  const metal = assets.pbr(keep(new THREE.MeshStandardMaterial({ color: 0x77706a, roughness: 0.6, metalness: 0.75 })), 'rusty_metal_02', 1, 2);
  const parts = [
    [keep(new THREE.CylinderGeometry(0.07, 0.07, S + 0.01, 10)), mats.big],
    [keep(new THREE.CylinderGeometry(0.035, 0.035, S + 0.01, 8)), mats.small],
    [keep(new THREE.BoxGeometry(0.05, 0.3, 0.26)), mats.bracket],
  ];
  const meshes = [];
  for (const [geo, list] of parts) {
    if (!list.length) continue;
    for (const mesh of instancedChunks(geo, metal, list, 24)) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      meshes.push(mesh);
    }
  }
  return meshes;
}
