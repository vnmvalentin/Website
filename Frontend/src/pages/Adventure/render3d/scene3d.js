// render3d/scene3d.js — zeichnet den Spielzustand in 3D (three.js). Liest nur aus dem Spiel, wie render/renderer.js,
// und hat dieselbe kleine Schnittstelle (resize, draw, screenToWorld) — die Simulation in engine/ weiß nichts davon.
//
// Stand November 2026 (Umbau zum Mass Slayer, Phase 4): läuft in der Look-Probe (Probe3d.jsx) und als umschaltbare
// Vorschau im echten Spiel (render/runner.js). Gezeichnet werden Boden, Hindernisse, Kisten/Schreine, Teleporter,
// Spieler, Gegner, Geschosse, Telegraphen, Flächen, Mauern, Beute, Waffen-Effekte und Kill-Splitter. Schrift und flache
// Anzeigen (Schadenszahlen, Lebensleisten, Minikarte, Zeiger) malt der 2D-Zeichner auf eine Ebene darüber
// (Renderer.drawOverlay) und fragt dafür project(). Noch nicht: fallende Meteore/Granaten als Körper, Blase/Schild
// am Helden, Bodenhügel abgetauchter Gegner.
//
// Gegner sind Instanzen: je Figur und Animationsbild ein Topf (InstancedMesh), in den jedes Bild alle Gegner einsortiert
// werden, die gerade dieses Animationsbild zeigen (figures3d.js). Die Kontur ist derselbe Körper noch einmal, schwarz,
// von innen gezeichnet und leicht aufgeblasen.
//
// Figuren: KayKit „Skeletons“ und „Adventurers“ von Kay Lousberg (CC0), siehe public/media/av3d/README.md.

import * as THREE from "three";
import { loadFigure } from "./figures3d.js";
import { CAST, BOSS_CAST, DEFAULT_BOSS, HEROES, HERO_SKINS, EXTRAS, KNECHT, castOf, PET_FIG, KIT_PETS, PROPS } from "./cast.js";
import { makeFloorTile, FLOORS } from "../render/flat/world.js";
import { RARITY, ITEMS } from "../data/items.js";
import { ELITE_AFFIXES } from "../data/enemies.js";
import { enemyPoolFor } from "../data/biomes.js";
import { TELEPORTER_RADIUS } from "../engine/stage.js";
import { GEAR_REACH, GEAR_W } from "../engine/worldMechanics.js";

export const S = 0.02; // Welt-Pixel → Meter
const OUTLINE = 0.016; // Konturstärke, Anteil der Körperhöhe


const INTERACT_LOOK = {
  chest: ["#8a5a2a", 0.55], bigChest: ["#3f8f4a", 0.8], equipChest: ["#c9782a", 0.65],
  luckShrine: ["#5ec8ff", 1.6], combatShrine: ["#d9473a", 1.6], healShrine: ["#7be06b", 1.6], fateShrine: ["#c49aff", 1.6],
  sacrificeAltar: ["#b0263a", 1.0], curseShrine: ["#7a3ad0", 1.6], diceShrine: ["#f5cf4a", 1.6],
};

// Drehung um die Hochachse + Größe + Ort direkt in die Instanz-Matrix schreiben (spart das Zerlegen über Quaternionen)
function setInstance(arr, i, x, y, z, yaw, sx, sy = sx, sz = sx) {
  const c = Math.cos(yaw), s = Math.sin(yaw), o = i * 16;
  arr[o] = c * sx; arr[o + 1] = 0; arr[o + 2] = -s * sx; arr[o + 3] = 0;
  arr[o + 4] = 0; arr[o + 5] = sy; arr[o + 6] = 0; arr[o + 7] = 0;
  arr[o + 8] = s * sz; arr[o + 9] = 0; arr[o + 10] = c * sz; arr[o + 11] = 0;
  arr[o + 12] = x; arr[o + 13] = y; arr[o + 14] = z; arr[o + 15] = 1;
}

function instanced(geo, mat, cap, withColor = false) {
  const m = new THREE.InstancedMesh(geo, mat, cap);
  m.count = 0;
  m.frustumCulled = false;
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  if (withColor) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
  return m;
}

// Nur den benutzten Teil der Instanzdaten zur Grafikkarte schicken
function commit(mesh, n) {
  mesh.count = n;
  mesh.visible = n > 0;
  if (!n) return;
  const m = mesh.instanceMatrix;
  m.clearUpdateRanges(); m.addUpdateRange(0, n * 16); m.needsUpdate = true;
  const c = mesh.instanceColor;
  if (c) { c.clearUpdateRanges(); c.addUpdateRange(0, n * 3); c.needsUpdate = true; }
}

export function toonRamp() {
  const data = new Uint8Array([70, 70, 70, 255, 150, 150, 150, 255, 255, 255, 255, 255]);
  const tex = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

export function outlineMaterial() {
  const mat = new THREE.MeshBasicMaterial({ color: 0x08070b, side: THREE.BackSide });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `vec3 transformed = position + normalize(normal) * ${OUTLINE.toFixed(4)};`);
  };
  return mat;
}

// Wie ein Gegner abgeht, je Todesart (siehe dieAt): n = Splitter, cone = Streuung um die Trefferrichtung (ohne: rundum),
// speed/up = Tempo seitwärts/aufwärts, gravity = Fall (negativ: steigt), body = was der Körper tut
const DEATH_LOOK = {
  hit: { n: 5, cone: 1.5, speed: [2, 5], up: [3, 6], gravity: 16, life: 0.6, size: 0.07, body: "fly" },
  blast: { n: 8, cone: 1.2, speed: [4, 8], up: [4, 8], gravity: 16, life: 0.7, size: 0.075, body: "fly" },
  burn: { n: 6, speed: [0.3, 1.2], up: [1.5, 3], gravity: -1.5, life: 0.8, size: 0.045, colors: ["#ff9a3c", "#ffd84a", "#3a2a26"], body: "char", splat: "#2a2020" },
  poison: { n: 6, speed: [0.3, 1.2], up: [1, 2.4], gravity: 2.5, life: 0.8, size: 0.06, colors: ["#8be04e", "#b7f06b"], body: "sink", splat: "#6aa83e" },
  shatter: { n: 12, speed: [2, 4.5], up: [2, 4.5], gravity: 16, life: 0.55, size: 0.055, colors: ["#bfe8ff", "#ffffff", "#7fd6ff"], splat: "#bfe8ff" },
  shock: { n: 8, speed: [5, 9], up: [1, 3], gravity: 6, life: 0.28, size: 0.04, colors: ["#fff3a0", "#ffffff"] },
};
const SPLAT_LIFE = 22;

const _c = new THREE.Color();
const _ray = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _hit = new THREE.Vector3();
const GROUND = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const HAZARD_CAP = 400;

// Geschosse: Form und Farbe je Art (Gestalt aus engine: look, kind, sprite). orb = leuchtende Kugel, rod = Stab in
// Flugrichtung, flat = flache, sich drehende Scheibe, cube = Würfel, gem = Kristall. size = Größe relativ zum Trefferradius.
const SHOT_LOOK = {
  dagger: ["rod", "#dcdce6", 2.6], boomerang: ["flat", "#a87443", 1.3], rocket: ["rod", "#d9473a", 2.2],
  proj_arrow: ["rod", "#c8a070", 3.2], proj_shuriken: ["flat", "#c9c3d1", 1.4], proj_laser: ["rod", "#5ee0ff", 3.4],
  proj_block: ["cube", "#a87443", 1.3], proj_fireball: ["orb", "#ff8a3c", 1.25], proj_poisonball: ["orb", "#8be04e", 1.1],
  proj_soul: ["orb", "#9fe8c8", 1.1], proj_chi: ["flat", "#ffe9a0", 1.2], proj_flask: ["orb", "#c49aff", 1.1],
  proj_grenade: ["orb", "#4a5240", 1.1], proj_iceball: ["gem", "#bfe9ff", 1.3], proj_sand: ["rod", "#d8b070", 2.4],
  proj_spike: ["rod", "#d8b070", 2.4], proj_web: ["orb", "#efe6d2", 1.1], electric_ball: ["orb", "#ffe14d", 1.1],
  proj_curse: ["orb", "#f5cf4a", 1.1], proj_basic: ["orb", "#ffe9a0", 1],
};
const shotLook = (b, enemy) => SHOT_LOOK[b.look] || (b.kind === "rocket" && SHOT_LOOK.rocket) || SHOT_LOOK[b.sprite] || (enemy ? ["orb", "#ff5a4a", 1] : SHOT_LOOK.proj_basic);

// Hindernisse der neuen Welten (ab Zyklus 2): aus denselben Grundkörpern wie die übrigen (Säule, Kegel, Fels).
// put(Topf, Zähler, Hindernis, Höhe, Breite, Farbe, Höhe über dem Boden)
const NEW_OBSTACLES = {
  // Friedhof
  grave: (put, s, o, r) => put(s.pillars, "pillars", o, r * 1.7, r * 0.7, "#7d808a"),
  crypt: (put, s, o, r) => { put(s.pillars, "pillars", o, r * 2.2, r * 1.0, "#5f626c"); put(s.cones, "cones", o, r * 2.9, r * 0.75, "#3e4048"); },
  deadtree: (put, s, o, r) => put(s.pillars, "pillars", o, r * 2.6, r * 0.25, "#4a3a2c"),
  // Pilzwald: Fliegenpilz (Stiel + flacher roter Hut), Sporenpilz (violette Knolle), Baumstumpf
  bigshroom: (put, s, o, r) => { put(s.pillars, "pillars", o, r * 1.9, r * 0.3, "#efe6d2"); put(s.cones, "cones", o, r * 0.9, r * 1.25, "#d9473a", r * 1.5); },
  sporeshroom: (put, s, o, r) => put(s.rocks, "rocks", o, r * 1.5, r * 1.0, "#a07bc8"),
  stump: (put, s, o, r) => put(s.pillars, "pillars", o, r * 0.9, r * 0.85, "#6b4a2b"),
  // Sumpf: Schilf (dünner Kegel), Trauerweide (Stamm + Krone), Steine fallen unter „rock“
  reeds: (put, s, o, r) => put(s.cones, "cones", o, r * 2.4, r * 0.45, "#6f7a3a"),
  willow: (put, s, o, r) => { put(s.pillars, "pillars", o, r * 1.8, r * 0.3, "#4a3e2c"); put(s.rocks, "rocks", o, r * 1.2, r * 1.25, "#4f6a3a", r * 1.4); },
  // Uhrwerkturm: Zahnrad (flach, Messing — die Klinge zeichnet drawMechanics), Kessel mit Ventil, Rohre
  gear: (put, s, o, r) => put(s.pillars, "pillars", o, r * 0.35, r * 1.15, "#b08a3a"),
  boiler: (put, s, o, r) => { put(s.pillars, "pillars", o, r * 2.4, r * 0.85, "#8a5a3a"); put(s.cones, "cones", o, r * 0.5, r * 0.6, "#9aa3ad", r * 2.4); },
  pipes: (put, s, o, r) => put(s.pillars, "pillars", o, r * 2.6, r * 0.45, "#7a828e"),
};

export default class Scene3d {
  constructor(canvas, { kitId = "default", quality = "hoch", skin = "" } = {}) {
    this.skin = skin;
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.5, 120);
    this.target = new THREE.Vector3();
    this.w = 1; this.h = 1;
    this.animT = 0;
    this.stageKey = null;
    this.buckets = new Map();
    this.loading = new Set();
    this.chunks = []; // Splitter
    this.corpses = []; // Körper, die nach dem Tod noch kurz zu sehen sind (fliegen weg, verkohlen, versinken)
    this.splats = []; // Spuren am Boden
    this.deathSeq = 0; // bis hierher sind die Tode aus g.fx.deaths schon gezeichnet
    this.stats = { ms: 0, fps: 0, calls: 0, tris: 0, figures: 0 };
    this.quality = quality;
    this.shakeOn = true; // der Runner setzt das aus den Einstellungen
    this.ramp = toonRamp();
    this.figureMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: this.ramp });
    this.outlineMat = outlineMaterial();

    // Licht: kühles Grundlicht, warmes Hauptlicht, Fackelschein am Spieler
    this.scene.add(new THREE.HemisphereLight(0xcfd8ff, 0x241a30, 0.85));
    const sun = new THREE.DirectionalLight(0xfff1dc, 1.25);
    sun.position.set(5, 10, 3);
    this.scene.add(sun);
    this.torch = new THREE.PointLight(0xffc98a, 9, 18, 1.6);
    this.scene.add(this.torch);

    const unlit = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
    const flat = (geo) => geo.rotateX(-Math.PI / 2);
    const toon = (extra = {}) => new THREE.MeshToonMaterial({ gradientMap: this.ramp, ...extra });

    // Schatten als dunkle Scheiben (billig, passt zum Comic-Look)
    this.shadows = instanced(flat(new THREE.CircleGeometry(1, 14)), unlit(0x000000, 0.34), 1800);
    this.shadows.renderOrder = 1;
    this.hazards = instanced(flat(new THREE.CircleGeometry(1, 40)), unlit(0xffffff, 0.2), HAZARD_CAP, true);
    this.hazards.renderOrder = 2;
    this.lines = instanced(flat(new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0)), unlit(0xff4a3a, 0.22), 120);
    this.lines.renderOrder = 2;
    this.chunkMesh = instanced(new THREE.BoxGeometry(1, 1, 1), toon(), 900, true);
    // Geschosse nach Form (SHOT_LOOK): Farbe je Instanz, Spieler und Gegner gemeinsam
    this.shotOrb = instanced(new THREE.SphereGeometry(1, 10, 8), unlit(0xffffff), 900, true);
    this.shotRod = instanced(new THREE.BoxGeometry(1, 1, 1), toon(), 500, true);
    this.shotFlat = instanced(new THREE.OctahedronGeometry(1), toon(), 300, true);
    this.shotCube = instanced(new THREE.BoxGeometry(1, 1, 1), toon(), 200, true);
    this.shotGem = instanced(new THREE.OctahedronGeometry(1), unlit(0xffffff), 200, true);
    // Edelstein über den Schreinen
    this.shrineGems = instanced(new THREE.OctahedronGeometry(1), unlit(0xffffff), 24, true);
    this.coins = instanced(new THREE.CylinderGeometry(1, 1, 0.35, 10), toon({ color: 0xf5cf4a }), 600);
    this.gems = instanced(new THREE.OctahedronGeometry(1), toon(), 80, true);
    this.crystals = instanced(new THREE.OctahedronGeometry(1), unlit(0xffffff), 400, true); // Erfahrung
    this.splatMesh = instanced(flat(new THREE.CircleGeometry(1, 9)), unlit(0xffffff, 0.3), 300, true);
    this.scene.add(this.crystals, this.splatMesh);
    this.boxes = instanced(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), toon(), 80, true);
    this.rocks = instanced(new THREE.IcosahedronGeometry(1, 0).translate(0, 0.45, 0), toon(), 400, true);
    this.pillars = instanced(new THREE.CylinderGeometry(0.8, 1, 1, 10).translate(0, 0.5, 0), toon(), 400, true);
    this.cones = instanced(new THREE.ConeGeometry(1, 1, 9).translate(0, 0.5, 0), toon(), 400, true);
    // Mauern (Steinbrecher), Kugeln (Eier der Spinnenkönigin, kreisende Waffen), Funken, Ringe, Blitze, Hiebe
    this.walls = instanced(new THREE.BoxGeometry(1, 1, 1).translate(0.5, 0.5, 0), toon({ color: 0x8a7d6c }), 40);
    this.orbs = instanced(new THREE.SphereGeometry(1, 10, 8), unlit(0xffffff), 120, true);
    this.sparks = instanced(new THREE.BoxGeometry(1, 1, 1), unlit(0xffffff), 400, true);
    this.rings = instanced(flat(new THREE.RingGeometry(0.9, 1, 48)), unlit(0xffffff, 0.8), 80, true);
    this.rings.renderOrder = 2;
    this.beams = instanced(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), unlit(0xfff3a0, 0.85), 60);
    this.slashes = instanced(flat(new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0)), unlit(0xffffff, 0.45), 24);
    // Giftpfützen (Sumpf): liegen fest am Boden, gebaut mit den Hindernissen. Klingen der Zahnradfallen (Uhrwerkturm):
    // drehen sich jedes Bild (drawMechanics)
    this.pools = instanced(flat(new THREE.CircleGeometry(1, 36)), unlit(0xffffff), 80, true);
    this.pools.renderOrder = 1;
    this.blades = instanced(new THREE.BoxGeometry(1, 1, 1).translate(0.5, 0.5, 0), toon({ color: 0xc9d2dc }), 60);
    this.scene.add(this.pools, this.blades);
    this.scene.add(this.shadows, this.hazards, this.lines, this.chunkMesh, this.shotOrb, this.shotRod, this.shotFlat, this.shotCube, this.shotGem, this.shrineGems, this.coins, this.gems, this.boxes, this.rocks, this.pillars, this.cones,
      this.walls, this.orbs, this.sparks, this.rings, this.beams, this.slashes);

    // Teleporter: Ring am Boden, Lichtsäule, großer Ladekreis
    this.tele = new THREE.Group();
    this.teleRing = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.16, 8, 28).rotateX(Math.PI / 2), toon({ color: 0xf0a33c }));
    this.teleBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 9, 16, 1, true).translate(0, 4.5, 0), unlit(0xf0a33c, 0.16));
    this.teleZone = new THREE.Mesh(flat(new THREE.RingGeometry(TELEPORTER_RADIUS * S - 0.12, TELEPORTER_RADIUS * S, 96)), unlit(0xd9473a, 0.55));
    this.teleZone.position.y = 0.02;
    this.tele.add(this.teleRing, this.teleBeam, this.teleZone);
    this.scene.add(this.tele);

    this.player = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: this.ramp }));
    this.playerOutline = new THREE.Mesh(new THREE.BufferGeometry(), this.outlineMat);
    this.player.visible = this.playerOutline.visible = false;
    // Heller Ring unter dem Helden: in der Menge sofort zu finden
    this.heroRing = new THREE.Mesh(flat(new THREE.RingGeometry(0.5, 0.62, 40)), unlit(0x9fe8ff, 0.9));
    this.heroRing.renderOrder = 3;
    this.scene.add(this.player, this.playerOutline, this.heroRing);

    // Requisiten (cast.js PROPS): je eine Instanzen-Gruppe mit Kontur. Bis sie geladen sind, zeichnet drawObjects die alten
    // Kästen — ein fehlendes Modell bricht also nichts.
    this.props = new Map();
    for (const [key, def] of Object.entries(PROPS)) {
      loadFigure(def.fig).then((fig) => {
        if (this.disposed) return;
        const cap = key === "crystal" || key === "crystal2" ? 160 : 40;
        const m = instanced(fig.idle, this.figureMat, cap, true);
        const hull = new THREE.InstancedMesh(fig.idle, this.outlineMat, cap);
        hull.instanceMatrix = m.instanceMatrix;
        hull.count = 0; hull.frustumCulled = false; hull.visible = false;
        this.scene.add(m, hull);
        this.props.set(key, { m, hull, cap, n: 0, h: def.h });
        this.obstacleCount = -1; // Kristalle der Höhle neu legen
      }).catch((err) => console.warn("[adVentures 3D] Requisite nicht geladen:", def.fig, err));
    }

    this.setQuality(quality);
    this.ready = this.loadCast(kitId);
  }

  // Eine Requisite hinstellen (false, solange ihr Modell noch lädt)
  putProp(key, x, y, yaw, scale, color, dim = 1) {
    const p = this.props.get(key);
    if (!p || p.n >= p.cap) return false;
    setInstance(p.m.instanceMatrix.array, p.n, x * S, 0, y * S, yaw, p.h * scale);
    (color ? _c.set(color) : _c.setRGB(1, 1, 1)).multiplyScalar(dim).toArray(p.m.instanceColor.array, p.n * 3);
    p.n++;
    return true;
  }

  commitProp(key) {
    const p = this.props.get(key);
    if (!p) return;
    commit(p.m, p.n);
    p.hull.count = p.n;
    p.hull.visible = p.n > 0 && this.outlines;
  }

  // Heldenfigur laden; die Gegner kommen je Welt dazu (loadWorldCast)
  async loadCast(kitId) {
    this.hero = HEROES[kitId] || HEROES.default;
    const heroFig = await loadFigure(this.hero.fig);
    if (this.disposed) return;
    this.heroFig = heroFig;
    this.player.visible = true;
    this.setQuality(this.quality);
  }

  // Figuren einer Welt laden und ihre Töpfe anlegen: was im Gegner-Vorrat der Welt steht, ihre Bosse und was
  // beschworen werden kann. Jede Figur ist eine kleine Datei; wer noch nicht geladen ist, wird solange nicht gezeichnet.
  loadWorldCast(g) {
    const casts = [...enemyPoolFor(g.biome, g.loop).map(([id]) => CAST[id] || KNECHT), ...(g.biome.waves || []).map(([id]) => CAST[id] || KNECHT), ...EXTRAS.map((id) => CAST[id]),
      ...g.biome.bosses.map((id) => BOSS_CAST[id] || DEFAULT_BOSS),
      ...(KIT_PETS[g.kit?.id] || []).map((pet) => ({ fig: PET_FIG[pet], cap: 8 }))];
    const wanted = new Map(); // Datei → größter Bedarf unter allen Gegnern, die sie nutzen
    for (const c of casts) wanted.set(c.fig, Math.max(wanted.get(c.fig) || 0, c.cap || 20));
    const jobs = [];
    for (const [name, cap] of wanted) {
      const have = this.buckets.get(name);
      if (have && have.cap >= cap) continue;
      if (this.loading.has(name)) continue;
      this.loading.add(name);
      jobs.push(loadFigure(name).then((fig) => {
        this.loading.delete(name);
        if (this.disposed) return;
        if (have) this.scene.remove(...have.meshes, ...have.hulls);
        const geos = [...fig.walk, fig.idle];
        const meshes = geos.map((geo) => instanced(geo, this.figureMat, cap, true));
        const hulls = geos.map((geo, i) => {
          const m = new THREE.InstancedMesh(geo, this.outlineMat, cap);
          m.instanceMatrix = meshes[i].instanceMatrix; // dieselben Orte wie der Körper
          m.count = 0; m.frustumCulled = false; m.visible = false;
          return m;
        });
        this.scene.add(...meshes, ...hulls);
        // fps: so schnell, dass die acht Schritte in der Zeit der Original-Animation durchlaufen
        this.buckets.set(name, { meshes, hulls, n: new Int32Array(geos.length), cap, steps: fig.walk.length, fps: fig.walk.length / fig.duration });
      }).catch((err) => { this.loading.delete(name); console.warn("[adVentures 3D] Figur nicht geladen:", name, err); }));
    }
    this.worldReady = Promise.all(jobs);
    return this.worldReady;
  }

  // "hoch": volle Auflösung (bis 2×), Konturen, alle Splitter
  // "handy" (seit 16.11.2026, Touch-Geräte; ui/settings.js quality3d): Schärfe höchstens 1,25× — Handys haben oft 3× —,
  //   keine Konturen (halbiert die Dreiecke), halb so viele Splitter und Körper; Licht und Fackel bleiben
  // "spar": Grafik nur per Software — 60 % Auflösung, keine Konturen, keine Fackel
  setQuality(q) {
    this.quality = q;
    this.outlines = q === "hoch";
    this.lite = q !== "hoch";
    const dpr = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(q === "spar" ? 0.6 : q === "handy" ? Math.min(1.25, dpr) : Math.min(2, dpr));
    this.renderer.setSize(this.w, this.h, false);
    for (const b of this.buckets.values()) for (const h of b.hulls) h.visible = this.outlines;
    for (const p of this.props?.values() || []) p.hull.visible = this.outlines && p.n > 0;
    this.playerOutline.visible = this.outlines && !!this.heroFig;
    this.torch.visible = q !== "spar";
  }

  resize(w, h) {
    this.w = Math.max(1, w); this.h = Math.max(1, h);
    this.renderer.setSize(this.w, this.h, false);
    this.camera.aspect = this.w / this.h;
    // Hochformat (Handy): Bei festem Blickwinkel sähe man nach links und rechts kaum etwas. Die Kamera rückt deshalb
    // weiter weg, bis rund die Hälfte der Breite am Rechner zu sehen ist (1,0 ab Seitenverhältnis 1,2, höchstens 2,2).
    // Der Nebel rückt mit, sonst läge der Held im Trüben.
    const a = this.w / this.h;
    this.camScale = a < 1.2 ? Math.min(2.2, Math.pow(1.2 / a, 0.75)) : 1;
    this.camera.far = 120 * this.camScale;
    this.camera.updateProjectionMatrix();
    this.applyFog();
  }

  applyFog() {
    if (!this.scene.fog) return;
    const k = this.fogK || 1; // Sumpf: dichter Nebel (data/biomes.js fog)
    this.scene.fog.near = 30 * k * (this.camScale || 1);
    this.scene.fog.far = 70 * (k < 1 ? 0.62 : 1) * (this.camScale || 1);
  }

  // Bildschirmpunkt → Punkt am Boden, in Spielkoordinaten
  screenToWorld(sx, sy) {
    _ndc.set((sx / this.w) * 2 - 1, -(sy / this.h) * 2 + 1);
    _ray.setFromCamera(_ndc, this.camera);
    if (!_ray.ray.intersectPlane(GROUND, _hit)) return { x: this.target.x / S, y: this.target.z / S };
    return { x: _hit.x / S, y: _hit.z / S };
  }

  // Punkt im Spiel (x, y in Welt-Pixeln, height in Welt-Pixeln über dem Boden) → Bildschirmpunkt.
  // behind = liegt hinter der Kamera (dann sind x und y nicht zu gebrauchen)
  project(x, y, height = 0) {
    _hit.set(x * S, height * S, y * S).project(this.camera);
    return { x: (_hit.x * 0.5 + 0.5) * this.w, y: (-_hit.y * 0.5 + 0.5) * this.h, behind: _hit.z > 1 };
  }

  // ── Welt (nur beim Weltwechsel oder wenn ein Boss Felsen hinlegt) ─────────
  buildStage(g) {
    const id = g.biome.id;
    const bg = new THREE.Color(FLOORS[id]?.outside || "#0d0c10");
    this.scene.background = bg;
    this.scene.fog = new THREE.Fog(bg, 30, 70);
    this.fogK = g.biome.fog ? 0.6 : 1;
    this.applyFog();
    if (this.ground) { this.scene.remove(this.ground); this.ground.geometry.dispose(); this.ground.material.map.dispose(); this.ground.material.dispose(); }
    const tex = new THREE.CanvasTexture(makeFloorTile(id));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(g.world.w / 480, g.world.h / 480);
    tex.anisotropy = 4;
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(g.world.w * S, g.world.h * S).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: tex }));
    this.ground.position.set((g.world.w * S) / 2, 0, (g.world.h * S) / 2);
    this.scene.add(this.ground);
    this.deathSeq = g.fx.deathSeq;
    this.corpses.length = 0;
    this.splats.length = 0;
  }

  buildObstacles(g) {
    const n = { rocks: 0, pillars: 0, cones: 0 };
    for (const key of ["crystal", "crystal2"]) { const p = this.props.get(key); if (p) p.n = 0; }
    const put = (mesh, key, o, h, w, color, lift = 0) => {
      if (n[key] >= mesh.instanceMatrix.count) return;
      setInstance(mesh.instanceMatrix.array, n[key], o.x * S, lift, o.y * S, (o.x * 0.013 + o.y * 0.007) % 6.28, w, h, w);
      _c.set(color).toArray(mesh.instanceColor.array, n[key] * 3);
      n[key]++;
    };
    for (const o of g.obstacles) {
      const r = o.r * S, k = o.sprite || "";
      if (NEW_OBSTACLES[k]) NEW_OBSTACLES[k](put, this, o, r);
      // Kristallhöhle: echte Kristalle statt Felsbrocken (fallen auf Felsen zurück, solange sie laden)
      else if ((k === "stone1" || k === "stone2") && this.putProp(k === "stone1" ? "crystal" : "crystal2", o.x, o.y, (o.x * 0.013 + o.y * 0.007) % 6.28, r * 2.4 / PROPS.crystal.h, k === "stone1" ? null : "#c49aff")) { /* gesetzt */ }
      else if (/pillar/.test(k)) put(this.pillars, "pillars", o, r * 3.4, r * 0.9, "#8a8298");
      else if (/tree/.test(k)) { put(this.pillars, "pillars", o, r * 1.2, r * 0.35, "#5e3c24"); put(this.cones, "cones", o, r * 2.8, r * 1.05, "#2f5a35"); }
      else if (/cactus/.test(k)) put(this.pillars, "pillars", o, r * 3, r * 0.7, "#4f9a4a");
      else if (/ice/.test(k)) put(this.cones, "cones", o, r * 2.6, r, "#a8e4ff");
      else if (/vulkan/.test(k)) put(this.cones, "cones", o, r * 1.8, r * 1.1, "#4a2a26");
      else put(this.rocks, "rocks", o, r * 1.25, r * 1.05, /stone/.test(k) ? "#4a6272" : "#6b6478");
    }
    commit(this.rocks, n.rocks); commit(this.pillars, n.pillars); commit(this.cones, n.cones);
    this.commitProp("crystal"); this.commitProp("crystal2");
    this.obstacleCount = g.obstacles.length;
    // Giftpfützen: dunkler Rand, darüber die Brühe
    let np = 0;
    const pa = this.pools.instanceMatrix.array, pc = this.pools.instanceColor.array;
    for (const o of g.pools || []) {
      if (np + 2 > 80) break;
      setInstance(pa, np, o.x * S, 0.008, o.y * S, 0, o.r * S, 1, o.r * S * 0.92); _c.set("#2a3020").toArray(pc, np * 3); np++;
      setInstance(pa, np, o.x * S, 0.01, o.y * S, 0, (o.r - 8) * S, 1, (o.r * 0.92 - 8) * S); _c.set("#5a7a2e").toArray(pc, np * 3); np++;
    }
    commit(this.pools, np);
    this.gears = g.obstacles.filter((o) => o.sprite === "gear");
  }

  // ── Ein Bild ──────────────────────────────────────────────────────────────
  draw(g, dt) {
    const t0 = performance.now();
    this.animT += dt;
    this.frameDt = dt;
    const key = `${g.stageIndex}|${g.loop}|${g.seed}`;
    if (key !== this.stageKey) { this.stageKey = key; this.buildStage(g); this.loadWorldCast(g); this.obstacleCount = -1; }
    if (this.obstacleCount !== g.obstacles.length) this.buildObstacles(g);

    const p = g.player;
    const px = p.x * S, pz = p.y * S;
    // Kamera: schräg von oben, folgt weich
    const k = this.camReady ? 1 - Math.exp(-dt * 10) : 1;
    this.camReady = true;
    this.target.x += (px - this.target.x) * k; this.target.z += (pz - this.target.z) * k;
    // Bildschirmwackeln (abschaltbar in den Einstellungen): die Kamera zittert, das Ziel bleibt
    const shake = this.shakeOn ? g.fx.shake * S * 0.5 : 0;
    const jx = shake ? (Math.random() - 0.5) * shake : 0, jz = shake ? (Math.random() - 0.5) * shake : 0;
    const cs = this.camScale || 1;
    this.camera.position.set(this.target.x + jx, 17 * cs, this.target.z + 12.5 * cs + jz);
    this.camera.lookAt(this.target.x + jx, 0.6, this.target.z + jz);
    this.torch.position.set(px, 2.4, pz);

    this.drawPlayer(g);
    this.drawEnemies(g);
    this.drawChunks(dt);
    this.drawShots(g);
    this.drawGround(g);
    this.drawLoot(g);
    this.drawObjects(g);
    this.drawExtras(g);
    this.drawMechanics();

    this.renderer.render(this.scene, this.camera);
    const info = this.renderer.info.render;
    const ms = performance.now() - t0;
    this.stats.ms += (ms - this.stats.ms) * 0.05;
    this.stats.calls = info.calls; this.stats.tris = info.triangles;
  }

  drawPlayer(g) {
    const p = g.player, fig = this.heroFig;
    if (!fig) return;
    const body = p.moving ? fig.walk[Math.floor((this.animT * fig.walk.length) / fig.duration) % fig.walk.length] : fig.idle;
    this.player.geometry = body;
    this.playerOutline.geometry = body;
    const lift = p.dash?.leap ? Math.sin((p.dash.t / p.dash.dur) * Math.PI) * 1.8 : 0;
    const blink = p.buffs.invuln > 0 && !p.buffs.bubble && Math.floor(this.animT * 16) % 2 === 0;
    for (const m of [this.player, this.playerOutline]) {
      m.position.set(p.x * S, lift, p.y * S);
      m.rotation.y = Math.atan2(Math.cos(p.aim), Math.sin(p.aim));
      m.scale.setScalar(1.25);
    }
    this.heroRing.position.set(p.x * S, 0.02, p.y * S);
    this.heroRing.visible = p.alive;
    this.player.visible = p.alive && !blink;
    this.playerOutline.visible = this.player.visible && this.outlines;
    const tint = HERO_SKINS[this.skin] || this.hero.tint || [1, 1, 1];
    if (p.hurtFlash > 0) this.player.material.color.setRGB(2.5, 0.5, 0.4);
    else if (p.status.freezeT > 0) this.player.material.color.setRGB(0.6, 1.1, 2.2);
    else this.player.material.color.setRGB(tint[0], tint[1], tint[2]);
  }

  drawEnemies(g) {
    const p = g.player;
    for (const b of this.buckets.values()) b.n.fill(0);
    const sh = this.shadows.instanceMatrix.array;
    let nShadow = 0, figures = 0;
    this.readDeaths(g);
    if (p.alive && nShadow < 1800) setInstance(sh, nShadow++, p.x * S, 0.012, p.y * S, 0, 0.42, 1, 0.3);

    for (const e of g.enemies) {
      if (e.dead || e.hidden || e.isEgg) continue;
      const cast = castOf(e);
      const b = this.buckets.get(cast.fig);
      if (!b) continue;
      // stehende Figur liegt im letzten Topf (hinter den Schritten); jeder Gegner läuft leicht versetzt
      const frame = e.moving || e.isBoss || cast.lift ? Math.floor(this.animT * b.fps + e.uid * 2.37) % b.steps : b.steps;
      const slot = b.n[frame];
      if (slot >= b.cap) continue;
      b.n[frame]++;
      figures++;
      const mesh = b.meshes[frame];
      const x = e.x * S, z = e.y * S;
      const grow = Math.min(1, 0.25 + (e.spawnT / 0.25) * 0.75); // wächst beim Auftauchen aus dem Boden
      const h = e.r * 2.7 * S * cast.k * grow;
      // schaut dorthin, wohin er will: zum Spieler, beim Ansturm in die Bahn
      const yaw = e.state === "charge" || e.state === "aim" || e.state === "roll" ? Math.atan2(Math.cos(e.aimAngle), Math.sin(e.aimAngle)) : Math.atan2(p.x - e.x, p.y - e.y);
      // Flieger schweben und wippen leicht
      const hover = cast.lift ? (cast.lift + Math.sin(this.animT * 3 + e.uid) * 0.06) * h : 0;
      setInstance(mesh.instanceMatrix.array, slot, x, (e.jumpH || 0) * S + hover, z, yaw, h);
      const col = mesh.instanceColor.array, o = slot * 3;
      let r = 1, gr = 1, bl = 1;
      if (cast.tint) { r = cast.tint[0]; gr = cast.tint[1]; bl = cast.tint[2]; }
      if (e.elite) { _c.set(ELITE_AFFIXES[e.elite]?.color || "#ffd84a"); r = r * 0.5 + _c.r * 2.2; gr = gr * 0.5 + _c.g * 2.2; bl = bl * 0.5 + _c.b * 2.2; }
      if (e.freezeT > 0) { r *= 0.7; gr *= 1.3; bl *= 2.4; }
      else if (e.burnT > 0) { r *= 1.7; gr *= 0.9; bl *= 0.55; }
      if (e.flash > 0) { r = r * 4 + 0.6; gr = gr * 4 + 0.6; bl = bl * 4 + 0.6; }
      col[o] = r; col[o + 1] = gr; col[o + 2] = bl;
      if (nShadow < 1800) setInstance(sh, nShadow++, x, 0.012, z, 0, e.r * S * 0.95, 1, e.r * S * 0.7);
    }
    this.drawCorpses();
    // Begleiter: erweckte Skelette und der Köder des Ninjas stehen als bläuliche Skelettkrieger da, Begleittiere mit
    // eigener Figur (Wölfe der Jägerin); Geschütztürme und Fangeisen zeichnet drawObjects
    const helpers = this.buckets.get(CAST.skeletonwarrior.fig);
    for (const al of g.allies) {
      if (al.kind === "turret" || al.kind === "trap") continue;
      const pet = PET_FIG[al.kind];
      const b = pet ? this.buckets.get(pet) : helpers;
      if (!b) continue;
      const frame = al.moving ? Math.floor(this.animT * b.fps + al.uid) % b.steps : b.steps;
      const slot = b.n[frame];
      if (slot >= b.cap) continue;
      b.n[frame]++;
      const mesh = b.meshes[frame];
      const fade = Math.min(1, (al.life - al.t) / 0.5);
      const yaw = pet ? Math.atan2(Math.cos(al.aim ?? 0), Math.sin(al.aim ?? 0)) : (al.facing || 1) > 0 ? Math.PI / 2 : -Math.PI / 2;
      setInstance(mesh.instanceMatrix.array, slot, al.x * S, 0, al.y * S, yaw, (pet ? 0.75 : 1.1) * Math.max(0.05, fade));
      mesh.instanceColor.array.set(pet ? [1, 1, 1] : al.kind === "decoy" ? [1.6, 1.6, 2.2] : [0.7, 1.2, 1.9], slot * 3);
      if (nShadow < 1800) setInstance(sh, nShadow++, al.x * S, 0.012, al.y * S, 0, pet ? 0.45 : 0.38, 1, 0.28);
    }
    for (const b of this.buckets.values()) {
      for (let f = 0; f < b.meshes.length; f++) { commit(b.meshes[f], b.n[f]); b.hulls[f].count = b.n[f]; b.hulls[f].visible = b.n[f] > 0 && this.outlines; }
    }
    commit(this.shadows, nShadow);
    this.stats.figures = figures;
  }

  // ── Abgänge ───────────────────────────────────────────────────────────────
  // Die Simulation meldet jeden Tod mit Art und Richtung (engine/fx.js death). Daraus werden hier Splitter, ein
  // Körper, der noch kurz zu sehen ist, und eine Spur am Boden:
  //   hit / blast  der Körper fliegt in Trefferrichtung davon, Splitter in Körperfarbe
  //   burn         der Körper verkohlt an Ort und Stelle, Glut steigt auf
  //   poison       der Körper wird grün und versinkt, Blasen steigen
  //   shatter      Eissplitter nach allen Seiten, kein Körper
  //   shock        schnelle helle Funken, kein Körper
  readDeaths(g) {
    const list = g.fx.deaths;
    for (let i = list.length - 1; i >= 0 && list[i].seq > this.deathSeq; i--) {
      const d = list[i];
      if (Math.abs(d.x * S - this.target.x) < 24 && Math.abs(d.y * S - this.target.z) < 18) this.dieAt(d);
    }
    this.deathSeq = g.fx.deathSeq;
  }

  dieAt(d) {
    const cast = d.bossId ? BOSS_CAST[d.bossId] || DEFAULT_BOSS : CAST[d.type] || KNECHT;
    const x = d.x * S, z = d.y * S, low = this.lite;
    const look = DEATH_LOOK[d.kind] || DEATH_LOOK.hit;
    const colors = look.colors || [cast.chunk];
    const n = Math.round(look.n * (d.big ? 3.5 : 1) * (low ? 0.5 : 1));
    const aim = Math.atan2(d.dirY, d.dirX);
    for (let i = 0; i < n && this.chunks.length < 900; i++) {
      const a = look.cone ? aim + (Math.random() - 0.5) * look.cone : Math.random() * Math.PI * 2;
      const sp = look.speed[0] + Math.random() * (look.speed[1] - look.speed[0]);
      this.chunks.push({
        x, y: 0.3 + Math.random() * 0.5, z, vx: Math.cos(a) * sp, vy: look.up[0] + Math.random() * (look.up[1] - look.up[0]), vz: Math.sin(a) * sp,
        size: (look.size + Math.random() * look.size) * (d.big ? 1.8 : 1), spin: Math.random() * 6, t: 0, life: look.life * (0.7 + Math.random() * 0.6),
        gravity: look.gravity, color: colors[i % colors.length],
      });
    }
    // Körper: nur wenn die Figur geladen ist und nicht schon zu viele unterwegs sind
    if (look.body && this.buckets.has(cast.fig) && this.corpses.length < (low ? 40 : 160)) {
      const fly = look.body === "fly", power = (d.kind === "blast" ? 9 : 6) * (d.big ? 0.5 : 1);
      this.corpses.push({
        fig: cast.fig, mode: look.body, x, y: 0, z, h: d.r * 2.7 * S * cast.k, tint: cast.tint || [1, 1, 1], lift: cast.lift || 0,
        vx: fly ? d.dirX * power * (0.7 + Math.random() * 0.6) : 0, vy: fly ? 4.5 + Math.random() * 2.5 : 0, vz: fly ? d.dirY * power * (0.7 + Math.random() * 0.6) : 0,
        yaw: Math.atan2(-d.dirX, -d.dirY), spin: fly ? (Math.random() < 0.5 ? -1 : 1) * (9 + Math.random() * 8) : 0, t: 0, life: fly ? 0.5 : 0.6,
      });
    }
    // Spur am Boden (die ältesten weichen den neuen)
    if (this.splats.length >= 300) this.splats.shift();
    this.splats.push({ x: x + (Math.random() - 0.5) * 0.3, z: z + (Math.random() - 0.5) * 0.3, r: d.r * S * (0.45 + Math.random() * 0.4) * (d.big ? 1.6 : 1), color: look.splat || cast.chunk, t: 0, turn: Math.random() * 6 });
  }

  // Körper der Gefallenen in die Töpfe ihrer Figuren einsortieren (stehendes Bild)
  drawCorpses() {
    const dt = this.frameDt;
    for (const c of this.corpses) {
      c.t += dt;
      const b = this.buckets.get(c.fig);
      if (!b || c.t >= c.life) continue;
      const slot = b.n[b.steps];
      if (slot >= b.cap) continue;
      b.n[b.steps]++;
      const mesh = b.meshes[b.steps], k = c.t / c.life;
      let sx = c.h, sy = c.h, y = c.lift * c.h, r = c.tint[0], g = c.tint[1], bl = c.tint[2];
      if (c.mode === "fly") {
        c.vy -= 18 * dt;
        c.x += c.vx * dt; c.y = Math.max(0, c.y + c.vy * dt); c.z += c.vz * dt;
        c.yaw += c.spin * dt;
        y += c.y;
        const shrink = k > 0.65 ? 1 - (k - 0.65) / 0.35 : 1;
        sx *= shrink; sy *= shrink;
        r *= 1.5; g *= 1.5; bl *= 1.5;
      } else if (c.mode === "char") { // verkohlt: wird schwarz und sackt zusammen
        r *= 1 - k * 0.9; g *= 1 - k * 0.93; bl *= 1 - k * 0.93;
        sy *= 1 - k * 0.75; sx *= 1 - k * 0.2;
      } else { // versinkt: grün, schrumpft in den Boden
        r *= 0.6; g *= 1.5; bl *= 0.5;
        sy *= 1 - k * 0.85; sx *= 1 + k * 0.25;
      }
      setInstance(mesh.instanceMatrix.array, slot, c.x, y, c.z, c.yaw, Math.max(0.01, sx), Math.max(0.01, sy), Math.max(0.01, sx));
      mesh.instanceColor.array.set([r, g, bl], slot * 3);
    }
    if (this.corpses.length && this.corpses[0].t >= this.corpses[0].life) this.corpses = this.corpses.filter((c) => c.t < c.life);
  }

  drawChunks(dt) {
    const arr = this.chunkMesh.instanceMatrix.array, col = this.chunkMesh.instanceColor.array;
    let n = 0;
    for (const c of this.chunks) {
      c.t += dt;
      c.vy -= (c.gravity ?? 16) * dt;
      c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
      if (c.y < c.size * 0.5) { c.y = c.size * 0.5; c.vy *= -0.35; c.vx *= 0.6; c.vz *= 0.6; }
      if (c.t >= c.life) continue;
      const s = c.size * Math.min(1, (c.life - c.t) / 0.2);
      setInstance(arr, n, c.x, c.y, c.z, c.spin + c.t * 9, s);
      _c.set(c.color).toArray(col, n * 3);
      n++;
    }
    this.chunks = this.chunks.filter((c) => c.t < c.life);
    commit(this.chunkMesh, n);

    // Spuren am Boden: bleiben SPLAT_LIFE Sekunden und schrumpfen am Ende weg
    const sp = this.splatMesh.instanceMatrix.array, scol = this.splatMesh.instanceColor.array;
    let m = 0;
    for (const s of this.splats) {
      s.t += dt;
      if (s.t >= SPLAT_LIFE) continue;
      const k = Math.min(1, s.t / 0.15) * Math.min(1, (SPLAT_LIFE - s.t) / 3);
      setInstance(sp, m, s.x, 0.009, s.z, s.turn, s.r * k, 1, s.r * k * 0.8);
      _c.set(s.color).multiplyScalar(0.28).toArray(scol, m * 3);
      m++;
    }
    if (this.splats.length && this.splats[0].t >= SPLAT_LIFE) this.splats = this.splats.filter((s) => s.t < SPLAT_LIFE);
    commit(this.splatMesh, m);
  }

  // Geschosse nach Form (SHOT_LOOK): Stäbe zeigen in Flugrichtung, Scheiben drehen sich, Kugeln leuchten
  drawShots(g) {
    const meshes = { orb: this.shotOrb, rod: this.shotRod, flat: this.shotFlat, cube: this.shotCube, gem: this.shotGem };
    const caps = { orb: 900, rod: 500, flat: 300, cube: 200, gem: 200 };
    const n = { orb: 0, rod: 0, flat: 0, cube: 0, gem: 0 };
    const put = (b, enemy) => {
      const [shape, color, size] = shotLook(b, enemy);
      if (n[shape] >= caps[shape]) return;
      const mesh = meshes[shape], i = n[shape]++;
      const r = b.r * S * (b.scale || 1) * size * (enemy ? 1.15 : 1);
      const yaw = -Math.atan2(b.vy, b.vx);
      const y = enemy ? 0.7 : 0.75;
      const arr = mesh.instanceMatrix.array;
      if (shape === "rod") setInstance(arr, i, b.x * S, y, b.y * S, yaw, r * 1.7, r * 0.13, r * 0.13);
      else if (shape === "flat") setInstance(arr, i, b.x * S, y, b.y * S, this.animT * 14 + b.x * 0.01, r, r * 0.22, r);
      else if (shape === "cube") setInstance(arr, i, b.x * S, y, b.y * S, this.animT * 6, r * 0.8);
      else if (shape === "gem") setInstance(arr, i, b.x * S, y, b.y * S, this.animT * 4, r * 0.75, r * 1.1, r * 0.75);
      else setInstance(arr, i, b.x * S, y, b.y * S, 0, r * 0.7);
      _c.set(b.element?.color || color).toArray(mesh.instanceColor.array, i * 3);
    };
    for (const b of g.pBullets) put(b, false);
    for (const b of g.eBullets) put(b, true);
    for (const k of Object.keys(meshes)) commit(meshes[k], n[k]);
  }

  // Telegraphen und Flächen am Boden
  drawGround(g) {
    const arr = this.hazards.instanceMatrix.array, col = this.hazards.instanceColor.array;
    let n = 0, nl = 0;
    const disc = (x, y, r, color, lift) => {
      if (n >= HAZARD_CAP) return;
      setInstance(arr, n, x * S, lift, y * S, 0, r * S);
      _c.set(color).toArray(col, n * 3);
      n++;
    };
    for (const z of g.zones) disc(z.x, z.y, z.r, z.kind === "fire" ? "#ff7a2e" : z.kind === "smoke" ? "#c8c8d4" : z.kind === "poison" || z.friendly ? "#8be04e" : z.kind === "spores" ? "#c49aff" : "#a050e0", 0.014);
    for (const h of g.hazards) {
      if (h.delay > 1.15) continue;
      const prog = Math.max(0, Math.min(1, 1 - h.delay / Math.min(h.maxDelay || 1, 1.15)));
      const color = h.friendly ? "#9ad1ff" : h.color || "#ff4a3a";
      if (h.shape === "circle") { disc(h.x, h.y, h.r, color, 0.016); disc(h.x, h.y, h.r * prog, color, 0.018); }
      else if (h.shape === "ring") {
        // Band zwischen rIn und r als Kette überlappender Scheiben; die inneren wachsen mit der Ankündigung
        const mid = (h.r + h.rIn) / 2, half = (h.r - h.rIn) / 2;
        const count = Math.max(8, Math.ceil((Math.PI * 2 * mid) / (half * 1.5)));
        for (let i = 0; i < count; i++) {
          const a = (Math.PI * 2 * i) / count, x = h.x + Math.cos(a) * mid, y = h.y + Math.sin(a) * mid;
          disc(x, y, half, color, 0.016);
          disc(x, y, half * prog, color, 0.018);
        }
      }
      else if (h.shape === "line" && nl < 120) {
        const len = Math.hypot(h.x2 - h.x, h.y2 - h.y);
        setInstance(this.lines.instanceMatrix.array, nl++, h.x * S, 0.016, h.y * S, -Math.atan2(h.y2 - h.y, h.x2 - h.x), len * S, 1, h.w * S);
      }
    }
    // Ansturm-Bahnen: wer zielt, zeigt, wohin er gleich rennt
    for (const e of g.enemies) {
      if (e.dead || e.state !== "aim" || nl >= 120) continue;
      setInstance(this.lines.instanceMatrix.array, nl++, e.x * S, 0.016, e.y * S, -e.aimAngle, (e.aimLen || 460) * S, 1, e.r * 1.2 * S);
    }
    // Glutaura des Helden
    const p = g.player;
    const aura = (p.weapons.hoellenherz && p.weaponState.hoellenherz) || (p.weapons.glutaura && p.weaponState.glutaura);
    if (aura?.r) disc(p.x, p.y, aura.r, "#ff6a3a", 0.013);
    commit(this.hazards, n);
    commit(this.lines, nl);
  }

  drawLoot(g) {
    let nc = 0, ng = 0, nx = 0;
    const xp = this.crystals.instanceMatrix.array, xcol = this.crystals.instanceColor.array;
    const coins = this.coins.instanceMatrix.array, gems = this.gems.instanceMatrix.array, gcol = this.gems.instanceColor.array;
    for (const k of g.pickups) {
      if (k.type === "gold") {
        if (nc < 600) setInstance(coins, nc++, k.x * S, 0.22, k.y * S, this.animT * 5 + k.x, 0.13);
      } else if (k.type === "xp") {
        // Erfahrungskristall: Farbe und Größe nach Wert; wer angezogen wird, hebt ab
        if (nx < 400) {
          const size = k.value < 3 ? 0.085 : k.value < 14 ? 0.115 : 0.16;
          setInstance(xp, nx, k.x * S, (k.pull ? 0.55 : 0.2) + Math.sin(this.animT * 5 + k.x) * 0.04, k.y * S, this.animT * 3 + k.y, size * 0.75, size * 1.3, size * 0.75);
          _c.set(k.value < 3 ? "#5ec8ff" : k.value < 14 ? "#7be06b" : "#ffd84a").toArray(xcol, nx * 3);
          nx++;
        }
      } else if (ng < 80) {
        const bob = 0.55 + Math.sin(this.animT * 4 + k.x) * 0.08;
        setInstance(gems, ng, k.x * S, bob, k.y * S, this.animT * 2, k.type === "heal" ? 0.16 : 0.26);
        _c.set(k.type === "heal" ? "#7be06b" : k.type === "item" ? RARITY[ITEMS[k.id]?.rarity]?.color || "#ffffff" : "#f0a33c").toArray(gcol, ng * 3);
        ng++;
      }
    }
    commit(this.coins, nc);
    commit(this.gems, ng);
    commit(this.crystals, nx);
  }

  drawObjects(g) {
    const arr = this.boxes.instanceMatrix.array, col = this.boxes.instanceColor.array;
    let n = 0, ng = 0;
    const DYN = ["chest", "bigChest", "equipChest", "opened", "shrine", "altar", "trap"];
    for (const key of DYN) { const p = this.props.get(key); if (p) p.n = 0; }
    const gems = this.shrineGems.instanceMatrix.array, gcol = this.shrineGems.instanceColor.array;
    for (const o of g.interactables) {
      const [color, h] = INTERACT_LOOK[o.type] || ["#8a8298", 0.8];
      // leicht gedreht je Ort, damit nicht alle Kisten gleich stehen; Front grob zur Kamera
      const yaw = (((o.x * 13 + o.y * 7) % 100) / 100) * 0.8 - 0.4;
      const isChest = o.type === "chest" || o.type === "bigChest" || o.type === "equipChest";
      const isShrine = !isChest && o.type !== "sacrificeAltar";
      const key = isChest ? (o.used ? "opened" : o.type) : o.type === "sacrificeAltar" ? "altar" : "shrine";
      const placed = this.putProp(key, o.x, o.y, yaw, 1, null, o.used && !isChest ? 0.45 : o.used ? 0.6 : 1);
      // Schreine: der Edelstein in ihrer Farbe schwebt darüber (verblasst, wenn benutzt)
      if (placed && isShrine && ng < 24) {
        setInstance(gems, ng, o.x * S, 2.05 + Math.sin(this.animT * 2.5 + o.x) * 0.08, o.y * S, this.animT * 1.6, 0.16, 0.24, 0.16);
        _c.set(color).multiplyScalar(o.used ? 0.3 : 1).toArray(gcol, ng * 3);
        ng++;
      }
      if (placed || n >= 80) continue;
      const w = h > 1 ? 0.5 : 0.75;
      setInstance(arr, n, o.x * S, 0, o.y * S, 0, w, h, w * (h > 1 ? 1 : 0.7));
      _c.set(color).multiplyScalar(o.used ? 0.25 : 1).toArray(col, n * 3);
      n++;
    }
    commit(this.shrineGems, ng);
    for (const al of g.allies) {
      if (n >= 80) continue;
      if (al.kind === "turret") {
        setInstance(arr, n, al.x * S, 0, al.y * S, -(al.aim || 0), 0.5, 0.55, 0.42);
        _c.set("#5ee0ff").toArray(col, n * 3);
        n++;
      } else if (al.kind === "trap" && !this.putProp("trap", al.x, al.y, (al.uid * 1.7) % 6.28, 1, null)) {
        // Fangeisen, solange das Modell noch lädt: flache Eisenplatte am Boden
        setInstance(arr, n, al.x * S, 0, al.y * S, 0.4, 0.5, 0.07, 0.5);
        _c.set("#9aa3ad").toArray(col, n * 3);
        n++;
      }
    }
    for (const key of DYN) this.commitProp(key);
    commit(this.boxes, n);

    const t = g.teleporter;
    this.tele.visible = t.state !== "locked";
    this.tele.position.set(t.x * S, 0.1, t.y * S);
    const color = t.state === "ready" ? 0x86d05f : t.state === "charging" ? 0xd9473a : 0xf0a33c;
    this.teleRing.material.color.setHex(color);
    this.teleBeam.material.color.setHex(color);
    this.teleBeam.visible = t.discovered || t.state !== "idle";
    this.teleZone.visible = t.state === "charging";
    this.teleRing.rotation.y = this.animT * 0.8;
  }

  // Mauern, Eier, kreisende Waffen und die Effekte aus g.fx (Funken, Ringe, Blitze, Hiebe)
  // Klingen der Zahnradfallen (Winkel setzt engine/worldMechanics.js an o.armA)
  drawMechanics() {
    let n = 0;
    for (const o of this.gears || []) {
      if (n >= 60) break;
      setInstance(this.blades.instanceMatrix.array, n++, o.x * S, 0.12, o.y * S, -(o.armA ?? 0), GEAR_REACH * S, 0.16, GEAR_W * S);
    }
    commit(this.blades, n);
  }

  drawExtras(g) {
    const p = g.player, fx = g.fx;
    let n = 0;
    for (const w of g.walls) {
      if (n >= 40) break;
      const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
      setInstance(this.walls.instanceMatrix.array, n++, w.x1 * S, 0, w.y1 * S, -Math.atan2(w.y2 - w.y1, w.x2 - w.x1), len * S, Math.min(1, w.t / 0.4) * 1.1, w.w * S);
    }
    commit(this.walls, n);

    n = 0;
    const orbs = this.orbs.instanceMatrix.array, ocol = this.orbs.instanceColor.array;
    const orb = (x, y, lift, r, color) => {
      if (n >= 120) return;
      setInstance(orbs, n, x * S, lift, y * S, 0, r * S);
      _c.set(color).toArray(ocol, n * 3);
      n++;
    };
    for (const e of g.enemies) {
      if (e.dead) continue;
      if (e.isEgg) orb(e.x, e.y, e.r * S * 0.9, e.r, "#e8e0c8");
      else if (e.hidden) orb(e.x, e.y, -e.r * S * 0.35, e.r * 1.15, g.biome.id === "lava" ? "#5a2a22" : "#8a6a44"); // Erdhügel
    }
    // Was gleich einschlägt, fällt sichtbar herunter: Meteor, Felsen, Schwert, Mörsergranate
    for (const h of g.hazards) {
      if (h.shape !== "circle" || h.delay > 1.15 || h.delay <= 0) continue;
      const prog = Math.max(0, Math.min(1, 1 - h.delay / Math.min(h.maxDelay || 1, 1.15)));
      const fall = (1 - prog) * 460 * S;
      if (h.meteor) orb(h.x, h.y, fall + 0.3, 24 + h.r * 0.12, "#ff9a3c");
      else if (h.boulder) orb(h.x, h.y, fall + 0.5, 34, "#8a8298");
      else if (h.sword) orb(h.x, h.y, fall + 0.4, 12, "#dcdce6");
      else if (h.lob) {
        const k = Math.max(0, Math.min(1, 1 - h.delay / h.maxDelay));
        orb(h.lob.x + (h.x - h.lob.x) * k, h.lob.y + (h.y - h.lob.y) * k, 0.5 + Math.sin(k * Math.PI) * 4.5, 11, "#3a3440");
      }
    }
    for (const [id, color, r] of [["feuerkugeln", "#ff9a3c", 15], ["sonnenkranz", "#ffd84a", 17]]) {
      for (const o of (p.weapons[id] && p.weaponState[id]?.orbs) || []) orb(o.x, o.y, 0.75, r, color);
    }
    commit(this.orbs, n);
    // Kriegsrad als drehendes Rad, Orbitalklingen als Klingen quer zur Kreisbahn (Formen der Geschosse mitbenutzt)
    {
      const flat = this.shotFlat, rod = this.shotRod;
      let nf = flat.count, nr = rod.count;
      for (const o of (p.weapons.kriegsrad && p.weaponState.kriegsrad?.orbs) || []) {
        if (nf >= 300) break;
        setInstance(flat.instanceMatrix.array, nf, o.x * S, 0.75, o.y * S, this.animT * 10, 20 * S, 5 * S, 20 * S);
        _c.set("#c9a06b").toArray(flat.instanceColor.array, nf * 3);
        nf++;
      }
      for (let i = 0; i < (p.items.orbitalklinge || 0) && nr < 500; i++) {
        const a = (p.orbitAngle || 0) + (Math.PI * 2 * i) / p.items.orbitalklinge;
        setInstance(rod.instanceMatrix.array, nr, (p.x + Math.cos(a) * 95) * S, 0.75, (p.y + Math.sin(a) * 95) * S, -a, 30 * S, 3 * S, 7 * S);
        _c.set("#dcdce6").toArray(rod.instanceColor.array, nr * 3);
        nr++;
      }
      commit(flat, nf); commit(rod, nr);
    }

    n = 0;
    const sp = this.sparks.instanceMatrix.array, scol = this.sparks.instanceColor.array;
    for (const q of fx.particles) {
      if (n >= 400) break;
      const k = 1 - q.t / q.life;
      setInstance(sp, n, q.x * S, 0.35 + k * 0.5, q.y * S, q.t * 9, q.size * S * 1.4 * k);
      _c.set(q.color).toArray(scol, n * 3);
      n++;
    }
    commit(this.sparks, n);

    n = 0;
    const rg = this.rings.instanceMatrix.array, rcol = this.rings.instanceColor.array;
    for (const r of fx.rings) {
      if (n >= 80) break;
      const k = r.t / r.life;
      setInstance(rg, n, r.x * S, 0.03, r.y * S, 0, r.r * (0.6 + 0.4 * k) * S);
      _c.set(r.color).multiplyScalar(1 - k * 0.6).toArray(rcol, n * 3);
      n++;
    }
    // Schutz am Helden: Blase (hell), Schild (blass), Block (sandfarben)
    const guard = p.buffs.bubble > 0 ? ["#78c8ff", 40] : p.buffs.guard > 0 ? ["#e6dcbe", 36] : p.shield > 0 ? ["#3a6a8a", 33] : null;
    if (guard && p.alive && n < 80) { setInstance(rg, n, p.x * S, 0.7, p.y * S, 0, guard[1] * S); _c.set(guard[0]).toArray(rcol, n * 3); n++; }
    if (p.spin && n < 80) { setInstance(rg, n, p.x * S, 0.6, p.y * S, 0, p.spin.r * S); _c.set("#cfe8ff").toArray(rcol, n * 3); n++; }
    commit(this.rings, n);

    // Blitze: Einschläge (mehrere Punkte von oben) als senkrechter Strahl am Ziel
    n = 0;
    for (const b of fx.bolts) {
      if (n >= 60 || b.points.length < 3) continue;
      const end = b.points[b.points.length - 1];
      setInstance(this.beams.instanceMatrix.array, n++, end.x * S, 0, end.y * S, 0, 0.09 * (1 - b.t / b.life) + 0.03, 9, 0.09);
    }
    commit(this.beams, n);

    n = 0;
    for (const sl of fx.slashes) {
      if (n >= 24) break;
      const k = sl.t / sl.life;
      setInstance(this.slashes.instanceMatrix.array, n++, sl.x * S, 0.55, sl.y * S, -sl.angle, sl.len * Math.min(1, 0.35 + k * 2.2) * S, 1, sl.half * 2 * (1 - k * 0.5) * S);
    }
    commit(this.slashes, n);
  }

  dispose() {
    this.disposed = true;
    this.scene.traverse((o) => { if (o.isMesh && !o.isInstancedMesh) o.geometry?.dispose(); });
    this.renderer.dispose();
  }
}
