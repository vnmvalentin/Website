// decor.js — Ausstattung von Anstalt und Keller (alles Fotomaterial bzw. Poly-Haven-Scans, CC0):
//
//  • Anstalt: dünne Wände und Türen der Station (buildWardWalls) und die Einrichtung ihrer Zimmer (furnishWard) —
//    Schlafsaal, Krankenzimmer, Behandlung, Schwesternzimmer, Arztzimmer, Tagesraum, Wäschekammer, Einzelzimmer,
//    jedes mit Schild über der Tür.
//  • Keller: die offenen 3×3-Hallen des Irrgartens werden Lagerräume (furnishRooms: Kistenstapel, Fässer, Regale).
//    Große Möbel sperren ihre Kachel für die Monster (maze.blocked), damit sie nicht hindurchlaufen.
//  • Flackerlampen: Leuchtstoffröhren hängen an Kabeln von der Decke (Anstalt), Käfiglampen im Keller. Manche
//    sind tot, die anderen flackern nach eigenem Muster. Echtes Licht geben nur die nächsten paar (fester
//    Vorrat an Punktlichtern — jedes Licht kostet in jedem Shader, deshalb nicht eines je Lampe). Kommt ein
//    Monster vorbei, spielen die Lampen in seiner Nähe verrückt.
//  • Rohre an der Kellerdecke, als durchgehende Stränge entlang der Wände.
import * as THREE from 'three';
import { instancedChunks } from '../ClashRoyale/modes/scene3d/kit';
import { edgeKey } from './maze';

const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** Gemischte Kopie (Fisher–Yates mit dem Spiel-Zufall): in jedem Browser dieselbe Reihenfolge, wichtig für Koop. */
function shuffled(list, rng) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Lädt ein Modell, skaliert es in einen Kasten (Breite entlang der Wand, Tiefe in den Raum, Höhe), stellt es
 * auf (x, z) und meldet seine Grundfläche als Hindernis. back = Richtung zur Wand (Rückseite), sonst frei drehbar.
 *   perp: lange Seite quer zur Wand (Betten stehen mit dem Kopfende an der Wand)
 *   face: Vorderseite des Modells (+z) zeigt von der Wand weg in den Raum (Schreibtisch, Schrank)
 *   gap:  Abstand zur Wand in Metern
 */
function placeModel(ctx, { id, h, x, z, back = null, rotY = 0, maxW = 2, maxD = 0.9, collide = true, tint = null, flip = false, perp = false, face = false, gap = 0 }) {
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
    if (back && face) {
      rot = Math.atan2(-back[0], -back[1]);
    } else if (back) {
      // Ausdehnung entlang der Wand und in den Raum hinein, wenn das Modell ungedreht steht
      const alongX = back[0] === 0;
      wide = alongX ? size.x : size.z;
      deep = alongX ? size.z : size.x;
      rot = 0;
      if ((wide < deep) !== perp) { rot = Math.PI / 2; [wide, deep] = [deep, wide]; }
      if (flip) rot += Math.PI;
    } else if (Math.abs(Math.sin(rot)) > 0.7) { wide = size.z; deep = size.x; }
    const k = Math.min(1, maxD / deep, maxW / wide);
    g.scale.setScalar(k);
    g.rotation.y = rot;
    let cx = x;
    let cz = z;
    if (back) {
      cx -= back[0] * ((deep * k) / 2 + gap);
      cz -= back[1] * ((deep * k) / 2 + gap);
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
 * Möbliert die offenen 3×3-Lagerräume des Kellers: Kistenstapel in der Mitte (sperrt die Kachel für das
 * Monster, maze.blocked), Regale, Fässer und Eimer an den Wänden.
 * avoid: Kachel-Indizes, auf denen schon etwas liegt (Ventile, Start …).
 *
 * @param {{ scene:THREE.Scene, assets:any, keep:Function, maze:any, isOpen:Function, S:number, addProp:Function,
 *           rng:()=>number, avoid:Set<number> }} ctx
 * @returns {{ lamps: number[][] }} Kacheln, über denen eine Hängelampe brennt (eine je Raum)
 */
export function furnishRooms(ctx) {
  const { maze, isOpen, S, rng, avoid } = ctx;
  const size = maze.size;
  const lamps = [];
  const idx = (x, z) => z * size + x;
  for (const [cx, cz] of maze.rooms || []) {
    // Raum muss wirklich 3×3 offen sein (könnte am Rand angeschnitten sein)
    let full = true;
    for (let z = cz - 1; z <= cz + 1; z++) for (let x = cx - 1; x <= cx + 1; x++) if (!isOpen(maze, x, z)) full = false;
    if (!full) continue;
    const wx = cx * S;
    const wz = cz * S;
    if (!avoid.has(idx(cx, cz))) {
      placeModel(ctx, { id: 'wooden_crate_02', h: 0.8, x: wx - 0.25, z: wz, rotY: rng() * 0.4, maxW: 0.9, maxD: 0.9 });
      placeModel(ctx, { id: 'wooden_crate_02', h: 0.6, x: wx + 0.55, z: wz + 0.35, rotY: 0.6 + rng() * 0.4, maxW: 0.65, maxD: 0.65 });
      placeModel(ctx, { id: 'barrel_03', h: 0.95, x: wx + 0.2, z: wz - 0.7, rotY: rng() * 6, maxW: 0.6, maxD: 0.6, tint: 0x6a5a4c });
      maze.blocked.add(idx(cx, cz));
    }
    lamps.push([cx, cz]);
    const pieces = [
      { id: 'worn_metal_rack', h: 1.9, d: 0.55 },
      { id: 'barrel_03', h: 0.95, d: 0.6, tint: 0x5a5e52 },
      { id: 'wooden_bucket_01', h: 0.4, d: 0.4 },
      { id: 'wooden_crate_01', h: 0.6, d: 0.6 },
      { id: 'worn_metal_rack', h: 1.9, d: 0.55 },
    ];
    let n = Math.floor(rng() * pieces.length);
    for (let z = cz - 1; z <= cz + 1; z++) {
      for (let x = cx - 1; x <= cx + 1; x++) {
        if (x === cx && z === cz) continue;
        // nach außen zeigende Wände dieser Randkachel
        const walls = DIRS4.filter((d) => {
          const ox = x + d[0];
          const oz = z + d[1];
          return !(Math.abs(ox - cx) <= 1 && Math.abs(oz - cz) <= 1) && !isOpen(maze, ox, oz);
        });
        if (avoid.has(idx(x, z)) || rng() < 0.3 || !walls.length) continue;
        const back = walls[Math.floor(rng() * walls.length)];
        const spec = pieces[n++ % pieces.length];
        placeModel(ctx, {
          id: spec.id, h: spec.h, x: x * S + back[0] * (S / 2 - 0.04), z: z * S + back[1] * (S / 2 - 0.04), back,
          maxW: S - 0.3, maxD: spec.d, tint: spec.tint, flip: rng() < 0.5,
        });
      }
    }
  }
  return { lamps };
}

// ── Anstalt: Wände, Türen, Zimmer ─────────────────────────────────────────

/** Türöffnung in den dünnen Wänden: Breite und Höhe in Metern */
const DOOR_W = 1.1;
const DOOR_H = 2.1;

/** Quader, dessen große Flächen die Wandtextur im selben Maßstab zeigen wie eine ganze Wandkachel (S breit, wallH hoch). */
function slabGeometry(len, h, thick, S, wallH, y0) {
  const g = new THREE.BoxGeometry(len, h, thick);
  const uv = g.attributes.uv;
  // Flächen 4 und 5 (±z) sind die Wandseiten: je vier Ecken ab Index 16
  for (let i = 16; i < 24; i++) uv.setXY(i, uv.getX(i) * (len / S), (y0 + uv.getY(i) * h) / wallH);
  g.translate(0, y0 + h / 2, 0);
  return g;
}

/**
 * Baut die dünnen Wände der Station (maze.edges) und die Türen (maze.doorEdges): je Tür zwei Wandstücke neben
 * der Öffnung, ein Sturz darüber, ein Rahmen, ein Türblatt (steht offen ins Zimmer) und außen ein Schild.
 * Wände und Wandstücke sind Hindernis und Sichtsperre (addWall), das offene Türblatt nur Hindernis (addProp).
 *
 * @param {{ scene:THREE.Scene, keep:Function, maze:any, S:number, wallH:number, thick:number, wallMat:THREE.Material,
 *           addWall:Function, addProp:Function, rng:()=>number, signTexture:(t:string)=>THREE.Texture,
 *           doorTexture:(t:string)=>THREE.Texture }} p
 * @returns {{ meshes: THREE.InstancedMesh[], leaves: {mesh:THREE.Mesh, x:number, z:number, open:number, closed:number}[] }}
 *   meshes zum Aufräumen (dispose); leaves = die Türblätter mit ihrer Drehung offen/zu
 */
export function buildWardWalls({ scene, keep, maze, S, wallH, thick, wallMat, addWall, addProp, rng, signTexture, doorTexture }) {
  const size = maze.size;
  const n2 = size * size;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);
  const sideLen = (S - DOOR_W) / 2 + thick / 2;
  const lists = { full: [], side: [], lintel: [], post: [], head: [] };
  const push = (list, x, y, z, rotY) => list.push(m4.compose(v.set(x, y, z), q.setFromAxisAngle(up, rotY), one).clone());
  /** Mitte und Lage einer Kachelgrenze: along = Richtung, in der die Wand verläuft */
  const edgeInfo = (key) => {
    const ia = Math.floor(key / n2);
    const ib = key % n2;
    const ax = ia % size;
    const az = (ia - ax) / size;
    const bx = ib % size;
    const bz = (ib - bx) / size;
    // Wand quer zur Verbindung der beiden Kacheln
    const alongZ = ax !== bx;
    return { mx: ((ax + bx) / 2) * S, mz: ((az + bz) / 2) * S, alongZ, rotY: alongZ ? Math.PI / 2 : 0 };
  };
  for (const key of maze.edges) {
    const e = edgeInfo(key);
    push(lists.full, e.mx, 0, e.mz, e.rotY);
    // (etwas länger als die Kachel, damit an den Zimmerecken keine Kerbe bleibt)
    if (e.alongZ) addWall(e.mx, e.mz, thick / 2, S / 2); else addWall(e.mx, e.mz, S / 2, thick / 2);
  }

  const frameMat = keep(new THREE.MeshStandardMaterial({ color: 0x343a34, roughness: 0.7 }));
  const leafTex = keep(doorTexture(''));
  const leafMat = keep(new THREE.MeshStandardMaterial({ map: leafTex, color: 0x9aa39a, roughness: 0.75 }));
  const leafGeo = keep(new THREE.BoxGeometry(DOOR_W - 0.1, DOOR_H - 0.04, 0.045));
  leafGeo.translate((DOOR_W - 0.1) / 2, (DOOR_H - 0.04) / 2 + 0.01, 0);
  const signGeo = keep(new THREE.PlaneGeometry(1.0, 0.25));
  const signMats = new Map();
  const signMat = (text) => {
    if (!signMats.has(text)) signMats.set(text, keep(new THREE.MeshStandardMaterial({ map: keep(signTexture(text)), roughness: 0.6 })));
    return signMats.get(text);
  };
  const rooms = maze.ward.rooms;
  const leaves = [];
  for (const [key, d] of maze.doorEdges) {
    const e = edgeInfo(key);
    // t = Einheitsvektor entlang der Wand, n = von der Tür ins Zimmer (Kachel a liegt im Zimmer)
    const tx = e.alongZ ? 0 : 1;
    const tz = e.alongZ ? 1 : 0;
    const nx = Math.sign(d.a[0] - d.b[0]);
    const nz = Math.sign(d.a[1] - d.b[1]);
    for (const s of [-1, 1]) {
      const off = s * (DOOR_W / 2 + sideLen / 2);
      const cx = e.mx + tx * off;
      const cz = e.mz + tz * off;
      push(lists.side, cx, 0, cz, e.rotY);
      if (e.alongZ) addWall(cx, cz, thick / 2, sideLen / 2); else addWall(cx, cz, sideLen / 2, thick / 2);
      push(lists.post, e.mx + tx * s * (DOOR_W / 2), 0, e.mz + tz * s * (DOOR_W / 2), e.rotY);
    }
    push(lists.lintel, e.mx, 0, e.mz, e.rotY);
    push(lists.head, e.mx, 0, e.mz, e.rotY);
    // Schild über der Tür, vom Flur aus zu lesen (bei Verbindungstüren zwischen Zimmern: keins)
    if (d.other === 0) {
      const sign = new THREE.Mesh(signGeo, signMat(rooms[d.room - 1].sign));
      sign.position.set(e.mx - nx * (thick / 2 + 0.006), DOOR_H + 0.3, e.mz - nz * (thick / 2 + 0.006));
      sign.rotation.y = Math.atan2(-nx, -nz);
      scene.add(sign);
    }
    // Türblatt: steht rechtwinklig offen ins Zimmer, an einem der beiden Pfosten angeschlagen. Manche fehlen.
    if (rng() < 0.82) {
      const s = rng() < 0.5 ? -1 : 1;
      const hx = e.mx + tx * s * (DOOR_W / 2 - 0.05) + nx * (thick / 2);
      const hz = e.mz + tz * s * (DOOR_W / 2 - 0.05) + nz * (thick / 2);
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      leaf.position.set(hx, 0, hz);
      // lokale +x (vom Scharnier weg) zeigt ins Zimmer, leicht verdreht
      leaf.rotation.y = Math.atan2(-nz, nx) + (rng() - 0.5) * 0.16;
      leaf.castShadow = true;
      leaf.receiveShadow = true;
      scene.add(leaf);
      // (für events.js: die Tür kann zuschlagen — zu = Blatt liegt in der Wand, zum anderen Pfosten hin)
      leaves.push({ mesh: leaf, x: hx, z: hz, open: leaf.rotation.y, closed: Math.atan2(s * tz, -s * tx) });
      const len = DOOR_W - 0.1;
      addProp(hx + nx * (len / 2), hz + nz * (len / 2), Math.abs(nx) * (len / 2) + 0.04, Math.abs(nz) * (len / 2) + 0.04);
    }
  }
  const parts = [
    [keep(slabGeometry(S + thick, wallH, thick, S, wallH, 0)), wallMat, lists.full],
    [keep(slabGeometry(sideLen, wallH, thick, S, wallH, 0)), wallMat, lists.side],
    [keep(slabGeometry(DOOR_W, wallH - DOOR_H, thick, S, wallH, DOOR_H)), wallMat, lists.lintel],
    [keep(new THREE.BoxGeometry(0.09, DOOR_H, thick + 0.07).translate(0, DOOR_H / 2, 0)), frameMat, lists.post],
    [keep(new THREE.BoxGeometry(DOOR_W + 0.09, 0.09, thick + 0.07).translate(0, DOOR_H + 0.045, 0)), frameMat, lists.head],
  ];
  const meshes = [];
  for (const [geo, mat, list] of parts) {
    if (!list.length) continue;
    for (const mesh of instancedChunks(geo, mat, list, 24)) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      meshes.push(mesh);
    }
  }
  return { meshes, leaves };
}

/**
 * Was in welchem Zimmer steht. Jede Art hat ein Hauptstück (main) und Möbel für die übrigen Wandplätze (fill:
 * id, h = Höhe, d = Tiefe an der Wand, face = Vorderseite zum Raum; iv = Infusionsständer), chance = Anteil der
 * Wandplätze, die besetzt werden.
 */
const CABINET = { id: 'drawer_cabinet', h: 1.15, d: 0.5, face: true };
const TRASH = { id: 'metal_trash_can', h: 0.75, d: 0.45 };
const BOX = { id: 'medical_box', h: 0.35, d: 0.4 };
const PLANT = { id: 'potted_plant_02', h: 0.9, d: 0.5 };
const RACK = { id: 'worn_metal_rack', h: 1.9, d: 0.55 };
const WARD_FILL = {
  dorm: { fill: [CABINET, TRASH], chance: 0.5 },
  patient: { fill: [CABINET, TRASH, { id: 'metal_stool_01', h: 0.55, d: 0.4 }, { iv: true }], chance: 0.45 },
  treatment: { fill: [CABINET, BOX, TRASH, BOX], chance: 0.7 },
  office: { fill: [CABINET, CABINET, PLANT, TRASH], chance: 0.8 },
  doctor: { fill: [CABINET, PLANT, { id: 'painted_wooden_bench', h: 0.85, d: 0.6, face: true }, CABINET], chance: 0.7 },
  dayroom: { fill: [{ id: 'painted_wooden_bench', h: 0.85, d: 0.6, face: true }, PLANT, CABINET], chance: 0.5 },
  storage: { fill: [RACK, { id: 'wooden_crate_01', h: 0.6, d: 0.6 }, RACK, { id: 'wooden_bucket_01', h: 0.4, d: 0.4 }, { id: 'barrel_03', h: 0.95, d: 0.6, tint: 0x5a5e52 }], chance: 0.9 },
  isolation: { fill: [], chance: 0 },
};

/**
 * Richtet die Zimmer der Station ein (maze.ward.rooms). Man erkennt jedes am Schild über der Tür und an dem, was
 * darin steht: Schlafsaal = Bettenreihen an den langen Wänden, Krankenzimmer = ein, zwei Betten, Behandlung = der
 * Stuhl unter der Lampe, Schwesternzimmer und Arztzimmer = Schreibtisch, Tagesraum = Tisch und Rollstühle mit dem
 * Gesicht zur Wand, Wäschekammer = Regale, Einzelzimmer = ein Bettgestell mitten im leeren Raum.
 * Türkacheln bleiben frei; Kacheln mit großen Möbeln sind für das Monster gesperrt (maze.blocked).
 *
 * @param {{ scene:THREE.Scene, assets:any, keep:Function, maze:any, isOpen:Function, S:number, addProp:Function,
 *           rng:()=>number, avoid:Set<number>, thick:number }} ctx
 * @returns {{ lamps: number[][] }} Kacheln, über denen eine Hängelampe brennt (Behandlung, Schlafsaal, Tagesraum,
 *   Schwesternzimmer)
 */
export function furnishWard(ctx) {
  const { scene, assets, keep, maze, isOpen, S, rng, avoid } = ctx;
  const size = maze.size;
  const idx = (x, z) => z * size + x;
  const lamps = [];
  const { rooms, doorTiles } = maze.ward;
  const floorMat = assets.pbr(keep(new THREE.MeshStandardMaterial({ color: 0x8a7a66, roughness: 0.6 })), 'old_linoleum_flooring_01', 1, 1, { normalScale: 0.6 });
  floorMat.color.setRGB(0.62, 0.58, 0.52); // Foto ist hell und warm — gealtert abdunkeln
  const block = (x, z) => maze.blocked.add(idx(x, z));

  for (const r of rooms) {
    const w = r.x1 - r.x0 + 1;
    const d = r.z1 - r.z0 + 1;
    const firstChild = scene.children.length;
    // Linoleum im Zimmer (auf den Fluren liegen Fliesen); eine Kachel = eine Wiederholung des Fotos
    const floorGeo = keep(new THREE.PlaneGeometry(w * S - 0.02, d * S - 0.02));
    const uv = floorGeo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w, uv.getY(i) * d);
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(((r.x0 + r.x1) / 2) * S, 0.004, ((r.z0 + r.z1) / 2) * S);
    floor.receiveShadow = true;
    scene.add(floor);

    const usable = (x, z) => !avoid.has(idx(x, z)) && !doorTiles.has(idx(x, z));
    /** Wandplätze: Kachel am Zimmerrand + Richtung zur Wand. gap = Abstand zur Kachelgrenze (dünne Wand ragt herein). */
    const slots = [];
    for (let z = r.z0; z <= r.z1; z++) {
      for (let x = r.x0; x <= r.x1; x++) {
        if (!usable(x, z)) continue;
        for (const back of DIRS4) {
          const ox = x + back[0];
          const oz = z + back[1];
          if (ox >= r.x0 && ox <= r.x1 && oz >= r.z0 && oz <= r.z1) continue;
          const thin = isOpen(maze, ox, oz);
          if (thin && !maze.edges.has(edgeKey(maze, x, z, ox, oz))) continue; // Tür
          slots.push({ x, z, back, gap: thin ? ctx.thick / 2 + 0.04 : 0.04, along: back[0] === 0 ? [1, 0] : [0, 1] });
        }
      }
    }
    const used = new Set();
    const freeSlots = () => slots.filter((s) => !used.has(idx(s.x, s.z)));
    const at = (s, inset = 0) => [s.x * S + s.back[0] * (S / 2 - s.gap - inset), s.z * S + s.back[1] * (S / 2 - s.gap - inset)];
    /** Möbel an einen Wandplatz stellen. */
    const put = (s, spec, extra = {}) => {
      used.add(idx(s.x, s.z));
      if (spec.iv) { const [px, pz] = at(s, 0.3); ivStand(ctx, px, pz); return; }
      const [px, pz] = at(s);
      placeModel(ctx, { id: spec.id, h: spec.h, x: px, z: pz, back: s.back, maxW: S - 0.3, maxD: spec.d, face: !!spec.face, tint: spec.tint, flip: rng() < 0.5, ...extra });
    };
    /** Bett mit dem Kopfende an der Wand. */
    const bed = (s, n) => {
      put(s, { id: 'old_bed_frame', h: 0.85 }, { perp: true, maxW: 1.05, maxD: 2.0, flip: n % 2 === 0, face: false });
      block(s.x, s.z);
      // neben jedem dritten Bett ein Infusionsständer bzw. ein Kasten
      const side = (n % 2 === 0 ? 1 : -1) * 0.82;
      const [px, pz] = at(s, 0.3);
      if (n % 3 === 0) ivStand(ctx, px + s.along[0] * side, pz + s.along[1] * side);
      else if (n % 3 === 1) placeModel(ctx, { id: 'medical_box', h: 0.35, x: px + s.along[0] * side, z: pz + s.along[1] * side, rotY: rng() * 0.5, maxW: 0.45, maxD: 0.45 });
    };
    /** Ein Wandplatz, dessen Wand nicht die Türwand ist — möglichst mitten an der Wand. */
    const backWall = () => {
      const list = freeSlots();
      const score = (s) => {
        const midX = Math.abs(s.x - (r.x0 + r.x1) / 2);
        const midZ = Math.abs(s.z - (r.z0 + r.z1) / 2);
        return (s.back[0] === 0 ? midX : midZ) + rng() * 0.5;
      };
      return list.sort((p, q) => score(p) - score(q))[0] || null;
    };
    let lampCell = [Math.floor((r.x0 + r.x1) / 2), Math.floor((r.z0 + r.z1) / 2)];

    if (r.type === 'dorm') {
      // Bettenreihen an den beiden langen Wänden
      const longX = w >= d;
      let n = 0;
      for (const s of slots) {
        if ((s.back[0] === 0) !== longX || used.has(idx(s.x, s.z))) continue;
        bed(s, n++);
      }
    } else if (r.type === 'patient') {
      const beds = w * d >= 6 ? 2 : 1;
      let n = 0;
      for (const s of shuffled(freeSlots(), rng)) {
        if (n >= beds) break;
        if (used.has(idx(s.x, s.z))) continue;
        bed(s, n++);
      }
      // ein Rollstuhl, der zur Wand schaut
      const s = freeSlots()[0];
      if (s && rng() < 0.6) {
        used.add(idx(s.x, s.z));
        placeModel(ctx, { id: 'wheelchair_01', h: 0.95, x: s.x * S + s.back[0] * 0.35, z: s.z * S + s.back[1] * 0.35, rotY: Math.atan2(-s.back[0], -s.back[1]), maxW: 0.75, maxD: 0.95 });
      }
    } else if (r.type === 'treatment') {
      // Behandlungsstuhl vor der Rückwand, Blick in den Raum; die Lampe hängt über ihm
      const s = backWall();
      if (s) {
        used.add(idx(s.x, s.z));
        block(s.x, s.z);
        lampCell = [s.x, s.z];
        const px = s.x * S + s.back[0] * 0.25;
        const pz = s.z * S + s.back[1] * 0.25;
        placeModel(ctx, { id: 'BarberShopChair_01', h: 1.15, x: px, z: pz, rotY: Math.atan2(s.back[0], s.back[1]), maxW: 0.9, maxD: 1.3 });
        placeModel(ctx, { id: 'tool_cart', h: 0.9, x: px + s.along[0] * 0.95, z: pz + s.along[1] * 0.95, rotY: s.back[0] === 0 ? Math.PI / 2 : 0, maxW: 0.7, maxD: 0.45 });
        placeModel(ctx, { id: 'metal_stool_01', h: 0.55, x: px - s.along[0] * 0.85 - s.back[0] * 0.5, z: pz - s.along[1] * 0.85 - s.back[1] * 0.5, rotY: rng() * 6, maxW: 0.4, maxD: 0.4 });
        ivStand(ctx, px - s.along[0] * 0.75 + s.back[0] * 0.55, pz - s.along[1] * 0.75 + s.back[1] * 0.55);
      }
    } else if (r.type === 'office' || r.type === 'doctor') {
      // Schreibtisch an der Wand, Stuhl davor
      const s = backWall();
      if (s) {
        used.add(idx(s.x, s.z));
        block(s.x, s.z);
        const [px, pz] = at(s);
        placeModel(ctx, { id: 'ClassicConsole_01', h: 0.82, x: px, z: pz, back: s.back, face: true, maxW: 1.7, maxD: 0.6 });
        placeModel(ctx, { id: 'dining_chair_02', h: 0.95, x: s.x * S + s.back[0] * 0.05, z: s.z * S + s.back[1] * 0.05, rotY: Math.atan2(s.back[0], s.back[1]) + (rng() - 0.5) * 0.5, maxW: 0.55, maxD: 0.55 });
      }
    } else if (r.type === 'dayroom') {
      // Tische auf Kacheln mitten im Raum, Rollstühle in einer Reihe mit dem Gesicht zur Wand
      const inner = [];
      for (let z = r.z0 + 1; z < r.z1; z++) for (let x = r.x0 + 1; x < r.x1; x++) if (usable(x, z)) inner.push([x, z]);
      const tables = [];
      for (const c of shuffled(inner, rng)) {
        if (tables.length >= 2) break;
        if (tables.some((t) => Math.abs(t[0] - c[0]) + Math.abs(t[1] - c[1]) < 2)) continue;
        tables.push(c);
        placeModel(ctx, { id: 'wooden_picnic_table', h: 0.78, x: c[0] * S, z: c[1] * S, rotY: rng() < 0.5 ? 0 : Math.PI / 2, maxW: 1.9, maxD: 1.6 });
        block(c[0], c[1]);
      }
      if (tables[0]) lampCell = tables[0];
      const s0 = backWall();
      if (s0) {
        const rowSlots = freeSlots().filter((s) => s.back[0] === s0.back[0] && s.back[1] === s0.back[1]).slice(0, 4);
        for (const s of rowSlots) {
          used.add(idx(s.x, s.z));
          placeModel(ctx, { id: 'wheelchair_01', h: 0.95, x: s.x * S + s.back[0] * 0.35, z: s.z * S + s.back[1] * 0.35, rotY: Math.atan2(-s.back[0], -s.back[1]), maxW: 0.75, maxD: 0.95 });
        }
      }
    } else if (r.type === 'isolation') {
      // ein einzelnes Bettgestell, schief mitten im Raum
      const c = lampCell;
      if (usable(c[0], c[1])) {
        placeModel(ctx, { id: 'old_bed_frame', h: 0.85, x: c[0] * S + (rng() - 0.5) * 0.5, z: c[1] * S + (rng() - 0.5) * 0.5, rotY: rng() * Math.PI, maxW: 2.0, maxD: 2.0 });
        block(c[0], c[1]);
      }
    }
    // übrige Wandplätze
    const spec = WARD_FILL[r.type] || WARD_FILL.patient;
    let n = Math.floor(rng() * Math.max(1, spec.fill.length));
    for (const s of slots) {
      if (!spec.fill.length || used.has(idx(s.x, s.z)) || rng() > spec.chance) continue;
      put(s, spec.fill[n++ % spec.fill.length]);
    }
    // Licht brennt nur noch in wenigen Zimmern — die übrigen sind dunkel
    if (['treatment', 'dorm', 'dayroom', 'office'].includes(r.type)) lamps.push(lampCell);
    // Möbel merken sich ihr Zimmer: game.js zeichnet sie nur, wenn man hineinsehen kann
    for (let i = firstChild; i < scene.children.length; i++) {
      if (scene.children[i].userData.prop) scene.children[i].userData.room = r.id;
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
  let darkUntil = 0;

  return {
    lights,
    lamps,
    /** Stromausfall: bis zur Spielzeit t brennt keine Lampe. */
    blackout(t) { darkUntil = Math.max(darkUntil, t); },
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
        if (t < darkUntil) on = false;
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
