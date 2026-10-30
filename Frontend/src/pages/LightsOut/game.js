// game.js — Lights Out: eine Ebene als three.js-Welt mit Steuerung, Monster und Schreck-Regie.
//
// Drei Ebenen (levels.js), jede mit eigenem Monster und eigener Spielweise:
//  - Wald (forest):    Schlüssel finden, Haustür aufschließen. Der Beobachter bewegt sich nur,
//                      solange man ihn nicht sieht — man muss sich umdrehen, und das kostet Licht.
//  - Anstalt (halls):  drei Sicherungen in den Kasten am Ausgang. Der Jäger sieht das Licht und
//                      hört Rennen; in Spinden ist man sicher, außer er sieht einen gerade hineinsteigen.
//  - Keller (cellar):  drei Ventile aufdrehen, dann öffnet der Notausgang. Der Lauscher ist blind
//                      und jagt nur nach Gehör — Licht ist sicher, Schritte nicht.
//
// Alle Monster bewegen sich auf dem Kachelraster (Breitensuche). Ohne Licht gewöhnen sich die Augen
// in etwa zwei Sekunden an die Dunkelheit (Umrisse werden sichtbar). Der "Regisseur" streut echte
// Schrecks sparsam ein, nur wenn das Monster weit weg ist.
//
// Fotolook: Wände, Böden, Rinde usw. sind Poly-Haven-Fotomaterialien, dazu Scan-Requisiten
// (photoWorld.js) und Nachbearbeitung mit Bloom + Vignette (createPostFX aus scene3d/kit.js).
// Die gemalten Texturen bleiben als Grundlage, bis die Fotos geladen sind.
import * as THREE from 'three';
import { createAssets, createPostFX } from '../ClashRoyale/modes/scene3d/kit';
import {
  generateMaze, placeThings, generateForest, placeForest, isOpen, findPath, makeRng, DIRS, wallDirs, FOREST, pickStatues,
} from './maze';
import { buildGarden } from './gardenWorld';
import { SYMBOL_IDS, SYMBOL_NAMES } from './symbols';
import {
  wallTexture, floorTexture, ceilingTexture, lockerTexture, fuseBoxTexture, fuseSlotTexture,
  doorTexture, writingTexture, creatureViews, sidingTexture, brickTexture, wetFloorTextures,
  carvingTexture, codeLockTexture,
} from './textures';
import { buildForest, STAR_R } from './forestWorld';
import { placeRoomProps, propSpots } from './photoWorld';
import { furnishRooms, createFlickerLamps, placePipes } from './decor';
import { createAudio } from './audio';
import { loadMonsterKit, buildMonsterModel } from './monsterModel';
import { createFlashlight } from './viewmodel';
import { LEVELS } from './levels';

const S = 2.4; // Kachelgröße in Metern
const EYE = 1.6;
const PLAYER_R = 0.32;
const WALK = 2.5;
const SPRINT = 4.7;
const SNEAK = 1.25;
const STAMINA_DRAIN = 20;
const STAMINA_REGEN = 14;
const BATTERY_DRAIN = 1.0; // Prozent je Sekunde, ~100 s Licht je Ladung
const BATTERY_PICKUP = 45;
const CATCH_DIST = 0.95;

/** Was je Welt anders ist: Licht, Nebel, Hörweite der eigenen Schritte (Meter), Ruhezeit des Monsters. */
const THEMES = {
  forest: { wallH: 9, fog: 0.045, hemi: [0x5a6a90, 0x0c0c0c, 0.12], adapt: 0.45, noise: { walk: 5, sprint: 14, sneak: 1.2 }, dormant: 12 },
  halls: { wallH: 3, fog: 0.085, hemi: [0x8890a0, 0x201810, 0.05], adapt: 0.2, noise: { walk: 4.5, sprint: 13, sneak: 1.2 }, dormant: 22 },
  cellar: { wallH: 2.8, fog: 0.09, hemi: [0x8a8a80, 0x141210, 0.04], adapt: 0.18, noise: { walk: 7, sprint: 18, sneak: 2 }, dormant: 15 },
  garden: { wallH: 3.3, fog: 0.055, hemi: [0x55648c, 0x0c0c0a, 0.1], adapt: 0.38, noise: { walk: 5, sprint: 14, sneak: 1.2 }, dormant: 14 },
};

/**
 * Gärtner (Garten): folgt der Duftspur des Spielers Brotkrumen für Brotkrumen. Eine Krume je TRAIL_STEP Meter;
 * sie verfliegt nach TRAIL_LIFE (beim Schleichen nach TRAIL_LIFE_SNEAK) Sekunden. Gehen ist schneller als er —
 * wer stehen bleibt (Statuen drehen!), wird eingeholt.
 */
const TRAIL_STEP = 0.7;
const TRAIL_LIFE = 60;
const TRAIL_LIFE_SNEAK = 24;
const TRACKER_SPEED = { roam: 1.3, track: 2.15, hunt: 2.9, chase: 3.3, search: 1.4 };
/** Wie lange eine Statue gedreht werden muss (eine Vierteldrehung) */
const STATUE_TURN = 1.2;

const WRITINGS = {
  halls: ['SIE HÖRT DICH', 'NICHT RENNEN', 'VERSTECK DICH', 'LICHT AUS', 'HINTER DIR', 'KEIN AUSWEG', 'ES SIEHT DAS LICHT'],
  cellar: ['ES HÖRT ALLES', 'LANGSAM', 'NICHT ATMEN', 'SCHLEICH', 'STILL', 'ES IST BLIND', 'HÖRST DU ES KLICKEN'],
};

const MONSTER_HEIGHT = { hunter: 2.7, watcher: 3.1, listener: 2.3, tracker: 2.5 };

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const tileOf = (p) => Math.round(p / S);
const world = (t) => t * S;
const yawTo = (dx, dz) => Math.atan2(-dx, -dz);

/**
 * Grafikstufen. ratio = Auflösungsfaktor zu Beginn (höchstens die Bildschirmdichte), min = so weit darf die
 * automatische Anpassung herunter, shadow = Schattenkarte der Taschenlampe (0 = keine Schatten),
 * samples = Kantenglättung in der Nachbearbeitung, post = Zwischenbild mit Tonwerten (ohne: direkt zeichnen),
 * bloom = Nachleuchten heller Lichtquellen (der teuerste Teil der Nachbearbeitung),
 * lights = wie viele Flackerlampen (decor.js) gleichzeitig echtes Licht geben.
 * Die Vignette malt die Seite per CSS (.lo-vignette) — ein eigener Durchgang dafür wäre doppelt.
 */
export const QUALITY = {
  low: { ratio: 0.75, min: 0.5, shadow: 0, samples: 0, post: false, bloom: false, lights: 1 },
  medium: { ratio: 1, min: 0.6, shadow: 512, samples: 0, post: false, bloom: false, lights: 2 },
  high: { ratio: 1.5, min: 0.75, shadow: 1024, samples: 4, post: true, bloom: true, lights: 3 },
};
const qualityOf = (q) => QUALITY[q] || QUALITY.medium;

/**
 * Startstufe für „Auto“ aus dem Grafikchip: Software-Zeichnen und einfache Intel-Grafik → Niedrig,
 * übrige Onboard-Grafik (Intel Iris, AMD Radeon Graphics, Handy-Chips) → Mittel, sonst Hoch. Liegt sie
 * daneben, korrigiert die Bildraten-Regelung (govern) nach unten.
 */
function autoQualityName(renderer) {
  let name = '';
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) || '');
  } catch { /* unbekannt */ }
  if (/swiftshader|llvmpipe|software|basic render/i.test(name)) return 'low';
  if (/intel.*(uhd|hd graphics)/i.test(name)) return 'low';
  if (/intel|radeon\(tm\) graphics|radeon graphics|vega|mali|adreno|powervr/i.test(name)) return 'medium';
  return 'high';
}

/**
 * Zeichenfläche und Ton, die über alle Ebenen bestehen bleiben. Dadurch geht es ohne Bruch von einer Ebene
 * in die nächste: dieselbe Zeigersperre (kein neuer Klick nötig), derselbe Audiokontext.
 * @param {HTMLElement} container
 */
export function createHost(container) {
  let renderer;
  try {
    // Ohne eigene Kantenglättung: die übernimmt die Nachbearbeitung (MSAA im Zwischenbild) — auf der
    // niedrigen Stufe gibt es bewusst keine
    renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  container.appendChild(renderer.domElement);
  renderer.domElement.style.display = 'block';
  const audio = createAudio(0.8);
  return {
    renderer,
    canvas: renderer.domElement,
    audio,
    container,
    dispose() {
      if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
      audio?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

/**
 * Eine Ebene auf einer bestehenden Hülle (createHost).
 * @param {ReturnType<typeof createHost>} host
 * @param {{ level?:number, seed?:number, sensitivity?:number, volume?:number, softScares?:boolean, autoplay?:boolean, intro?:boolean }} opts
 *   autoplay = direkt weiterlaufen (Übergang aus der vorigen Ebene), intro = Anfahrt im Auto (nur Wald)
 * @param {{ onHud:(h:object)=>void, onEnd:(r:object)=>void, onPause:(p:boolean)=>void, onScare:(s:object)=>void }} cb
 */
export function createGame(host, opts, cb) {
  const { renderer, container, audio } = host;
  renderer.shadowMap.needsUpdate = true;

  const levelIndex = clamp(opts.level || 0, 0, LEVELS.length - 1);
  const isLast = levelIndex === LEVELS.length - 1;
  const level = LEVELS[levelIndex];
  const theme = THEMES[level.theme];
  const WALL_H = theme.wallH;
  const forest = level.theme === 'forest';
  const cellar = level.theme === 'cellar';
  const halls = level.theme === 'halls';
  const garden = level.theme === 'garden';
  /** Unter freiem Himmel (Sterne, Mond, Himmelsfarbe statt Schwarz) */
  const outdoor = forest || garden;

  // ── Koop ────────────────────────────────────────────────────────────────
  // net (aus LightsOut.jsx): { mySeat, players:[{seat,name}], round, isHost(), send(kind, payload) }.
  // Alle Browser bauen aus demselben Seed dieselbe Welt; der Host rechnet das Monster.
  const net = opts.net || null;
  const coop = !!net;
  const teamSize = coop ? Math.max(1, net.players.length) : 1;
  let isHost = !coop || net.isHost();
  /**
   * Schwierigkeit. Zu mehreren: mehr Sicherungen/Ventile/Statuen, vierstelliger Code, schnelleres und
   * weitsichtigeres Monster, das früher erwacht, länger angestarrt werden muss und besser hört; weniger Akkus.
   * Wer erwischt wird, schaut nur noch zu — bis die anderen die Ebene schaffen.
   */
  const HARD = coop
    ? { speed: 1.1, sight: 1.15, stare: 6, dormant: 0.6, noise: 1.2, goals: Math.min(5, 2 + teamSize), batteries: 3, statues: teamSize >= 3 ? 5 : 4, codeLen: 4 }
    : { speed: 1, sight: 1, stare: 3.5, dormant: 1, noise: 1, goals: 3, batteries: 5, statues: 4, codeLen: 3 };

  const seed = opts.seed || ((Math.random() * 2 ** 31) >>> 0);
  const rng = makeRng(seed ^ 0x9e3779b9 ^ (levelIndex * 0x1234567));
  const disposables = [];
  const keep = (x) => { disposables.push(x); return x; };

  // ── Karte ───────────────────────────────────────────────────────────────
  let maze;
  let start;
  let door; // Kachel der Ausgangstür (in einer Wand)
  let exitCell; // Kachel davor
  let objectives; // Schlüssel / Sicherungen / Ventile
  let batteries;
  let lockerCells = [];
  let writingCells = [];
  let fromStart;
  let forestInfo = null;
  let gardenInfo = null;
  if (forest) {
    const f = generateForest(seed);
    maze = f.maze;
    start = f.start;
    door = f.door;
    exitCell = [door[0], door[1] + 1];
    const p = placeForest(maze, rng, start, door);
    objectives = [p.key];
    batteries = p.batteries.slice(0, HARD.batteries);
    fromStart = p.fromStart;
    forestInfo = { gate: f.gate, hut: f.hut, fire: f.fire, bushes: p.bushes };
  } else if (garden) {
    // Großes Labyrinth, in der Mitte ein offener Platz (Brunnen + Obelisk)
    maze = generateMaze(seed + levelIndex, 11, 2);
    const c = Math.floor(maze.size / 2);
    for (let z = c - 1; z <= c + 1; z++) for (let x = c - 1; x <= c + 1; x++) maze.grid[z * maze.size + x] = 0;
    maze.rooms = [[c, c], ...maze.rooms.filter(([x, z]) => Math.abs(x - c) + Math.abs(z - c) > 4)];
    maze.blocked.add(c * maze.size + c);
    const t = placeThings(maze, rng, 0);
    start = t.start;
    door = t.exit.door;
    exitCell = t.exit.cell;
    fromStart = t.fromStart;
    gardenInfo = pickStatues(maze, rng, [c, c], start, exitCell, HARD.statues);
    objectives = gardenInfo.puzzle.map((s) => s.cell);
    const used = new Set([...objectives, ...gardenInfo.decoys].map(([x, z]) => z * maze.size + x));
    batteries = t.batteries.filter(([x, z]) => !used.has(z * maze.size + x)).slice(0, HARD.batteries - 1);
  } else {
    // Anstalt mit vier Behandlungsräumen, Keller mit drei Lagerräumen
    maze = generateMaze(seed + levelIndex, cellar ? 8 : 9, halls ? 4 : 3);
    const t = placeThings(maze, rng, HARD.goals);
    start = t.start;
    door = t.exit.door;
    exitCell = t.exit.cell;
    objectives = t.fuses;
    batteries = t.batteries.slice(0, HARD.batteries);
    lockerCells = t.lockers;
    writingCells = t.writings;
    fromStart = t.fromStart;
  }
  const size = maze.size;
  /** Wie viele Sicherungen / Ventile / Statuen diese Ebene braucht */
  const NEED = objectives.length;
  /** Ruhezeit des Monsters zu Beginn (zu mehreren kürzer) */
  const DORMANT = theme.dormant * HARD.dormant;

  audio?.setVolume(opts.volume ?? 0.8);
  let sensitivity = opts.sensitivity ?? 1;
  const softScares = !!opts.softScares;

  const scene = new THREE.Scene();
  // Draußen ein fast schwarzer, leicht blauer Nachthimmel: Kronen und Mauern heben sich als Umrisse ab, die
  // Ferne versinkt darin
  const skyColor = forest ? 0x06080e : garden ? 0x070a12 : 0x000000;
  scene.background = new THREE.Color(skyColor);
  scene.fog = new THREE.FogExp2(skyColor, theme.fog);

  // Sichtweite knapp hinter dem Nebel: was dahinter liegt, ist ohnehin unsichtbar (Sterne hängen an der Kamera)
  const camera = new THREE.PerspectiveCamera(72, 1, 0.04, outdoor ? STAR_R + 12 : 48);
  camera.rotation.order = 'YXZ';
  const assets = createAssets(renderer, { timeoutMs: 15000 });
  // „auto“ (Vorgabe): Stufe aus dem Grafikchip, die Regelung darf sie senken. Eine gesenkte Stufe merkt sich
  // die Hülle (host.autoQuality), damit die nächste Ebene nicht wieder zu hoch anfängt.
  let autoQuality = !opts.quality || opts.quality === 'auto';
  if (autoQuality && !host.autoQuality) host.autoQuality = autoQualityName(renderer);
  let quality = qualityOf(autoQuality ? host.autoQuality : opts.quality);
  // Bloom nur für Lichtquellen (Laterne, Fenster, Ausgang) — nicht für den Lichtkegel auf naher Wand
  const makePost = () => createPostFX(renderer, scene, camera, {
    bloom: quality.bloom ? { strength: 0.3, radius: 0.45, threshold: 1.5 } : false, vignette: 0, samples: quality.samples,
  });
  let post = makePost();
  let noPost = false; // Prüfstand: Nachbearbeitung umgehen (_debug.noPost)
  const direct = () => noPost || !quality.post;
  renderer.shadowMap.enabled = quality.shadow > 0;

  const hemi = new THREE.HemisphereLight(theme.hemi[0], theme.hemi[1], theme.hemi[2]);
  scene.add(hemi);
  if (forest) {
    // Schwaches Mondlicht von schräg oben: Stämme werden als Umrisse sichtbar, ohne dass es hell wird
    const moon = new THREE.DirectionalLight(0x7088c0, 0.9);
    moon.position.set(-40, 60, 20);
    scene.add(moon);
  }

  // ── Taschenlampe ────────────────────────────────────────────────────────
  const flash = new THREE.SpotLight(0xffe8c4, 26, 24, 0.48, 0.55, 1.4);
  flash.castShadow = quality.shadow > 0;
  flash.shadow.mapSize.set(quality.shadow || 512, quality.shadow || 512);
  flash.shadow.camera.near = 0.2;
  flash.shadow.camera.far = 24;
  flash.shadow.bias = -0.0006;
  const spill = new THREE.PointLight(0xffe8c4, 0.6, 3.2, 1.5);
  camera.add(flash, flash.target, spill);
  // Die Lampe in der Hand (viewmodel.js); der Lichtkegel tritt an ihrer Spitze aus und schwingt mit ihr
  const torch = createFlashlight({ assets, camera, keep });
  flash.position.copy(torch.tipOffset);
  flash.target.position.set(0, -0.1, -4);
  scene.add(camera);

  // ── Welt ────────────────────────────────────────────────────────────────
  let doorOpen = false;
  const isDoorTile = (x, z) => x === door[0] && z === door[1];
  const cellValue = (x, z) => (x < 0 || z < 0 || x >= size || z >= size ? 1 : maze.grid[z * size + x]);
  const solid = (x, z) => !isOpen(maze, x, z) && !(doorOpen && isDoorTile(x, z));
  /** Bäume sind Kreise (man kann zwischen ihnen hindurchsehen); Zaun, Haus und Hütte sind Kästen. */
  const isTrunk = (x, z) => forest && x > 0 && z > 0 && x < size - 1 && z < size - 1 && cellValue(x, z) === FOREST.TREE;

  const trunks = new Map();
  if (forest) {
    for (let z = 0; z < size; z++) {
      for (let x = 0; x < size; x++) {
        if (!isTrunk(x, z)) continue;
        trunks.set(z * size + x, {
          x: world(x) + (rng() - 0.5) * 1.0,
          z: world(z) + (rng() - 0.5) * 1.0,
          r: 0.28 + rng() * 0.22,
        });
      }
    }
  }

  const span = size * S;
  const center = span / 2 - S / 2;
  const addPlane = (mat, y, up) => {
    const m = new THREE.Mesh(keep(new THREE.PlaneGeometry(span, span)), mat);
    m.rotation.x = up ? -Math.PI / 2 : Math.PI / 2;
    m.position.set(center, y, center);
    m.receiveShadow = true;
    scene.add(m);
    return m;
  };

  const touchesOpen = (x, z) => DIRS.some(([dx, dz]) => isOpen(maze, x + dx, z + dz));
  const m4 = new THREE.Matrix4();
  let wallMat;
  const instanced = [];

  // Hindernisse, an denen der Spieler hängen bleibt (Spinde, Kasten, Möbel, Statuen)
  const props = [];
  const addProp = (cx, cz, hx, hz) => props.push({ minX: cx - hx, maxX: cx + hx, minZ: cz - hz, maxZ: cz + hz });

  let forestView = null;
  let gardenView = null;
  if (garden) {
    gardenView = buildGarden({
      scene, keep, rng, maze, isOpen, S, wallH: WALL_H, assets, addProp, door, exitCell,
      center: maze.rooms[0], puzzle: gardenInfo.puzzle, decoys: gardenInfo.decoys, benches: gardenInfo.benches,
    });
    instanced.push(...gardenView.instanced);
  } else if (forest) {
    forestView = buildForest({
      scene, keep, rng, maze, S, wallH: WALL_H, gate: forestInfo.gate, hut: forestInfo.hut,
      fire: forestInfo.fire, bushes: forestInfo.bushes, trunks, assets,
    });
    instanced.push(...forestView.instanced);
    // Ohne Anfahrt brauchen die Scheinwerfer nicht mitzuleuchten — jedes Licht kostet in jedem Shader
    if (!opts.intro) forestView.headlights.forEach((h) => { h.visible = false; });

    // Haus: Bretterwände, manche mit vernageltem Fenster und schwachem Licht dahinter
    const plain = sidingTexture(false);
    const win = sidingTexture(true);
    keep(plain.map); keep(win.map); keep(win.glow);
    // Gemalte Bretter + vernagelte Fenster bleiben, die Holzstruktur (Normalen, Rauheit) kommt vom Foto
    const houseMat = assets.pbr(keep(new THREE.MeshStandardMaterial({ map: plain.map, roughness: 0.9 })), 'wood_plank_wall', 1, 2, { noMap: true });
    const winMat = assets.pbr(keep(new THREE.MeshStandardMaterial({ map: win.map, emissiveMap: win.glow, emissive: 0xffffff, emissiveIntensity: 0.22, roughness: 0.9 })), 'wood_plank_wall', 1, 2, { noMap: true });
    const houseH = 4.6;
    const houseGeo = keep(new THREE.BoxGeometry(S, houseH, S));
    houseGeo.translate(0, houseH / 2, 0);
    for (let z = 0; z < size; z++) {
      for (let x = 0; x < size; x++) {
        // Die Türkachel bekommt auch eine Wand — die Tür hängt davor (sonst klafft neben ihr eine Lücke)
        if (cellValue(x, z) !== FOREST.HOUSE || !touchesOpen(x, z)) continue;
        const m = new THREE.Mesh(houseGeo, (x + z) % 3 === 0 ? winMat : houseMat);
        m.position.set(world(x), 0, world(z));
        m.castShadow = true;
        m.receiveShadow = true;
        scene.add(m);
      }
    }
    wallMat = houseMat;
  } else {
    const wallTex = keep(cellar ? brickTexture() : wallTexture(seed % 1000));
    const wallPhoto = cellar ? 'concrete_wall_008' : ['peeling_painted_wall', 'worn_plaster_wall', 'decrepit_wallpaper'][seed % 3];
    // Die Fotos sind heller als die gemalten Wände — abdunkeln, sonst überstrahlt der Lichtkegel aus der Nähe
    wallMat = assets.pbr(keep(new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.92, color: cellar ? 0x7e7a74 : 0x8a857e })), wallPhoto, 1, 1.25, { normalScale: 1.4 });
    const wallGeo = keep(new THREE.BoxGeometry(S, WALL_H, S));
    wallGeo.translate(0, WALL_H / 2, 0);
    const wallTiles = [];
    for (let z = 0; z < size; z++) {
      for (let x = 0; x < size; x++) {
        if (isOpen(maze, x, z) || isDoorTile(x, z)) continue;
        if (touchesOpen(x, z)) wallTiles.push([x, z]);
      }
    }
    const walls = new THREE.InstancedMesh(wallGeo, wallMat, wallTiles.length);
    wallTiles.forEach(([x, z], i) => walls.setMatrixAt(i, m4.makeTranslation(world(x), 0, world(z))));
    walls.castShadow = true;
    walls.receiveShadow = true;
    scene.add(walls);
    instanced.push(walls);

    if (cellar) {
      const wet = wetFloorTextures();
      keep(wet.map); keep(wet.rough);
      wet.map.repeat.set(size / 2, size / 2);
      wet.rough.repeat.copy(wet.map.repeat);
      // Foto-Beton, aber die nassen Stellen (Rauheit) bleiben aus der gemalten Karte
      addPlane(assets.pbr(keep(new THREE.MeshStandardMaterial({ map: wet.map, roughnessMap: wet.rough, roughness: 1, metalness: 0.1 })),
        'damaged_concrete_floor', size * S / 3, size * S / 3, { noArm: true }), 0, true);
    } else {
      const floorTex = keep(floorTexture(seed % 977));
      floorTex.repeat.set(size, size);
      addPlane(assets.pbr(keep(new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.85 })), 'worn_tile_floor', size * S / 1.4, size * S / 1.4), 0, true);
    }
    const ceilTex = keep(ceilingTexture());
    ceilTex.repeat.set(size, size);
    addPlane(assets.pbr(keep(new THREE.MeshStandardMaterial({ map: ceilTex, roughness: 1, color: cellar ? 0x8a8070 : 0xffffff })), 'rough_concrete', size, size, { noMap: true }), WALL_H, false);
  }

  /** Richtung (dx, dz) zu einer echten Wand neben einer Zelle — bevorzugt die gegenüber dem einzigen Ausgang. */
  const wallSide = ([x, z], avoid = []) => {
    const isAvoided = (d) => avoid.some((a) => a[0] === d[0] && a[1] === d[1]);
    const open = DIRS.filter(([dx, dz]) => isOpen(maze, x + dx, z + dz));
    if (open.length === 1) {
      const back = [-open[0][0], -open[0][1]];
      if (!isAvoided(back)) return back;
    }
    return wallDirs(maze, x, z).find((d) => !isAvoided(d)) || null;
  };


  // ── Ausgangstür ─────────────────────────────────────────────────────────
  const doorDir = [door[0] - exitCell[0], door[1] - exitCell[1]];
  const doorH = forest ? 2.6 : WALL_H * 0.9;
  const doorMesh = new THREE.Mesh(keep(new THREE.BoxGeometry(S * (forest ? 0.5 : 0.8), doorH, 0.12)),
    keep(new THREE.MeshStandardMaterial({ map: keep(doorTexture(forest ? '' : cellar ? 'NOTAUSGANG' : 'TREPPE')), roughness: 0.7 })));
  const doorBase = new THREE.Vector3(world(exitCell[0]) + doorDir[0] * (S / 2 - 0.02), doorH / 2, world(exitCell[1]) + doorDir[1] * (S / 2 - 0.02));
  doorMesh.position.copy(doorBase);
  doorMesh.rotation.y = Math.atan2(doorDir[0], doorDir[1]);
  doorMesh.castShadow = true;
  // Im Garten ist der Ausgang das schmiedeeiserne Tor (gardenWorld.js)
  if (garden) doorMesh.visible = false;
  scene.add(doorMesh);
  // Dahinter: Tageslicht (Anstalt/Keller), warmer Hausflur (Wald) bzw. Feld im Morgengrauen (Garten)
  const outside = new THREE.Mesh(keep(new THREE.PlaneGeometry(S, Math.min(WALL_H, 4.6))),
    keep(new THREE.MeshBasicMaterial({ color: forest ? 0x6b4a2a : garden ? 0x3a4662 : 0xdfe8ff, fog: false })));
  outside.position.set(world(door[0]) + doorDir[0] * (S / 2 - 0.05), Math.min(WALL_H, 4.6) / 2, world(door[1]) + doorDir[1] * (S / 2 - 0.05));
  outside.rotation.y = Math.atan2(-doorDir[0], -doorDir[1]);
  outside.visible = false;
  scene.add(outside);
  const exitLight = new THREE.PointLight(forest ? 0xffb070 : 0xcfe0ff, 0, 14, 1.2);
  exitLight.position.set(world(door[0]), 1.6, world(door[1]));
  scene.add(exitLight);
  if (!outdoor) {
    // Seitenwände des Durchgangs, damit man im offenen Tor nicht ins Leere schaut
    const side = [doorDir[1], doorDir[0]];
    for (const k of [-1, 1]) {
      const w = new THREE.Mesh(keep(new THREE.BoxGeometry(0.2, WALL_H, S)), wallMat);
      w.position.set(world(door[0]) + side[0] * k * (S / 2), WALL_H / 2, world(door[1]) + side[1] * k * (S / 2));
      // Die Box ist entlang z lang — bei einer Tür in x-Richtung muss sie quer liegen
      if (doorDir[0] !== 0) w.rotation.y = Math.PI / 2;
      scene.add(w);
    }
  }

  // ── Sicherungskasten (Anstalt) ──────────────────────────────────────────
  let boxPos = null;
  const slotMeshes = [];
  let boxLamp = null;
  if (halls) {
    const boxSide = wallSide(exitCell, [doorDir]) || [-doorDir[0], -doorDir[1]];
    boxPos = new THREE.Vector3(world(exitCell[0]) + boxSide[0] * (S / 2 - 0.1), 1.35, world(exitCell[1]) + boxSide[1] * (S / 2 - 0.1));
    const fuseBox = new THREE.Mesh(keep(new THREE.BoxGeometry(0.7, 0.7, 0.2)),
      keep(new THREE.MeshStandardMaterial({ map: keep(fuseBoxTexture()), roughness: 0.6, metalness: 0.3 })));
    fuseBox.position.copy(boxPos);
    fuseBox.rotation.y = Math.atan2(-boxSide[0], -boxSide[1]);
    fuseBox.castShadow = true;
    scene.add(fuseBox);
    const slotMat = keep(new THREE.MeshStandardMaterial({ map: keep(fuseSlotTexture()), emissive: 0x403000, roughness: 0.4 }));
    const slotGeo = keep(new THREE.PlaneGeometry(0.1, 0.15));
    // ein Schlitz je Sicherung (allein drei, zu mehreren bis zu fünf), gleichmäßig über die Breite
    const slots = objectives.length;
    for (let i = 0; i < slots; i++) {
      const m = new THREE.Mesh(slotGeo, slotMat);
      m.position.set(slots === 1 ? 0 : -0.22 + (i * 0.44) / (slots - 1), -0.2, 0.105);
      m.visible = false;
      fuseBox.add(m);
      slotMeshes.push(m);
    }
    boxLamp = new THREE.PointLight(0xff3020, 0.5, 3, 1.5);
    boxLamp.position.copy(boxPos).add(new THREE.Vector3(-boxSide[0] * 0.4, 0.5, -boxSide[1] * 0.4));
    scene.add(boxLamp);
    if (boxSide[0] !== 0) addProp(boxPos.x, boxPos.z, 0.12, 0.35); else addProp(boxPos.x, boxPos.z, 0.35, 0.12);
  }

  // ── Zahlenschloss (Wald) ────────────────────────────────────────────────
  // Die Haustür hat neben dem Schlüsselloch ein Zahlenschloss. Auf seinem Schild stehen drei Zeichen in
  // fester Reihenfolge; dieselben Zeichen sind mit je einer Ziffer in Bäume geritzt — dazu eine vierte
  // Schnitzerei, deren Zeichen gar nicht auf dem Schloss steht. Wer dreimal falsch tippt, lockt den Beobachter.
  let codeLock = null;
  const carvings = [];
  if (forest) {
    const ids = [...SYMBOL_IDS];
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    const order = ids.slice(0, HARD.codeLen);
    const used = ids.slice(0, HARD.codeLen + 1);
    const digits = Object.fromEntries(used.map((id) => [id, Math.floor(rng() * 10)]));
    codeLock = { order, code: order.map((id) => digits[id]).join(''), entered: '', open: false, active: false, wrong: 0 };
    // Bäume an Wegen, weit genug vom Start und der Tür, untereinander weit auseinander
    const cands = [];
    for (const [k, t] of trunks) {
      const x = k % size;
      const z = (k - x) / size;
      const open = DIRS.find(([dx, dz]) => isOpen(maze, x + dx, z + dz) && fromStart[(z + dz) * size + x + dx] > 7);
      if (open && Math.abs(x - door[0]) + Math.abs(z - door[1]) >= 5) cands.push({ t, x, z, open });
    }
    for (let i = cands.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [cands[i], cands[j]] = [cands[j], cands[i]];
    }
    const chosen = [];
    for (const minGap of [9, 6, 3]) {
      for (const c of cands) {
        if (chosen.length >= used.length) break;
        if (chosen.includes(c) || chosen.some((o) => Math.abs(o.x - c.x) + Math.abs(o.z - c.z) < minGap)) continue;
        chosen.push(c);
      }
    }
    // Markierte Bäume: rotes Stoffband um den Stamm (von allen Seiten im Lichtkegel zu sehen) — sonst war die
    // handgroße Schnitzerei auf einer Seite eines von ~700 Stämmen praktisch nicht zu finden
    const clothMat = keep(new THREE.MeshStandardMaterial({ color: 0x9a1712, emissive: 0x2a0402, roughness: 0.85, side: THREE.DoubleSide }));
    const stripGeo = keep(new THREE.PlaneGeometry(0.07, 0.5));
    stripGeo.translate(0, -0.25, 0);
    used.forEach((id, i) => {
      const c = chosen[i];
      if (!c) return;
      // Richtung vom Stamm zur freien Kachel; die Schnitzerei liegt als gebogenes Stück auf der Rinde
      const fx = world(c.x + c.open[0]) - c.t.x;
      const fz = world(c.z + c.open[1]) - c.t.z;
      const phi = Math.atan2(fx, fz);
      const radiusAt = (y) => c.t.r * (1 - (0.68 * y) / WALL_H) + 0.022; // Stamm verjüngt sich (forestWorld)
      const arc = Math.min(2.2, 0.56 / radiusAt(1.4));
      const mat = keep(new THREE.MeshStandardMaterial({
        map: keep(carvingTexture(id, digits[id], seed + i)), transparent: true, depthWrite: false, roughness: 0.95,
        polygonOffset: true, polygonOffsetFactor: -2,
      }));
      // vorn (zum Weg) und hinten — lesbar aus beiden Richtungen
      for (const side of [0, Math.PI]) {
        const geo = keep(new THREE.CylinderGeometry(radiusAt(1.81), radiusAt(0.99), 0.82, 12, 1, true, phi + side - arc / 2, arc));
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(c.t.x, 1.4, c.t.z);
        mesh.receiveShadow = true;
        scene.add(mesh);
      }
      // Stoffband über der Schnitzerei, zwei Enden hängen herab
      const band = new THREE.Mesh(keep(new THREE.CylinderGeometry(radiusAt(2.12) + 0.012, radiusAt(1.98) + 0.012, 0.14, 16, 1, true)), clothMat);
      band.position.set(c.t.x, 2.05, c.t.z);
      scene.add(band);
      for (const k of [-0.18, 0.12]) {
        const a = phi + k;
        const strip = new THREE.Mesh(stripGeo, clothMat);
        const rr = radiusAt(2) + 0.03;
        strip.position.set(c.t.x + Math.sin(a) * rr, 2.0, c.t.z + Math.cos(a) * rr);
        strip.rotation.set(0.12, a, k * 0.6);
        scene.add(strip);
      }
      const r = radiusAt(1.4);
      carvings.push({ id, digit: digits[id], x: c.t.x + Math.sin(phi) * r, z: c.t.z + Math.cos(phi) * r, tx: c.t.x, tz: c.t.z, read: false });
    });
    // Messingschild am Schloss (Spielerseite der Tür), knapp über Augenhöhe — so verdeckt der Hinweis unter
    // dem Fadenkreuz es nicht. Matt und dunkel, sonst überstrahlt es im Lichtkegel.
    const plate = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.42, 0.28)),
      keep(new THREE.MeshStandardMaterial({ map: keep(codeLockTexture(order)), color: 0x9a9080, roughness: 0.75, metalness: 0.25 })));
    plate.position.set(0, 0.42, -0.065);
    plate.rotation.y = Math.PI;
    doorMesh.add(plate);
  }

  // ── Gegenstände am Boden ────────────────────────────────────────────────
  const fuseGeo = keep(new THREE.CylinderGeometry(0.06, 0.06, 0.22, 12));
  fuseGeo.rotateZ(Math.PI / 2);
  const fuseMat = keep(new THREE.MeshStandardMaterial({ color: 0xd9b030, emissive: 0x3a2800, roughness: 0.35, metalness: 0.6 }));
  const batGeo = keep(new THREE.CylinderGeometry(0.05, 0.05, 0.16, 12));
  const batMat = keep(new THREE.MeshStandardMaterial({ color: 0x3c8a4a, emissive: 0x0a2010, roughness: 0.4, metalness: 0.4 }));
  const brassMat = keep(new THREE.MeshStandardMaterial({ color: 0xc8a050, emissive: 0x2a1a00, roughness: 0.3, metalness: 0.9 }));
  const makeKey = () => {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(keep(new THREE.TorusGeometry(0.06, 0.016, 8, 20)), brassMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.x = -0.1;
    const shaft = new THREE.Mesh(keep(new THREE.BoxGeometry(0.18, 0.02, 0.025)), brassMat);
    shaft.position.x = 0.04;
    const bit = new THREE.Mesh(keep(new THREE.BoxGeometry(0.03, 0.02, 0.06)), brassMat);
    bit.position.set(0.11, 0, 0.03);
    g.add(ring, shaft, bit);
    g.traverse((o) => { o.castShadow = true; });
    return g;
  };
  const items = [];
  const placeItem = (cell, kind) => {
    const mesh = kind === 'key' ? makeKey() : new THREE.Mesh(kind === 'fuse' ? fuseGeo : batGeo, kind === 'fuse' ? fuseMat : batMat);
    mesh.position.set(world(cell[0]) + (rng() - 0.5) * 0.8, kind === 'battery' ? 0.08 : 0.06, world(cell[1]) + (rng() - 0.5) * 0.8);
    mesh.rotation.y = rng() * Math.PI;
    mesh.castShadow = true;
    scene.add(mesh);
    items.push({ kind, mesh, taken: false, nextSound: 1 + rng() * 3 });
  };
  if (forest) placeItem(objectives[0], 'key');
  if (halls) objectives.forEach((c) => placeItem(c, 'fuse'));
  batteries.forEach((c) => placeItem(c, 'battery'));

  // ── Ventile (Keller) ────────────────────────────────────────────────────
  const valves = [];
  if (cellar) {
    const pipeMat = assets.pbr(keep(new THREE.MeshStandardMaterial({ color: 0x8a8a84, roughness: 0.5, metalness: 0.7 })), 'rusty_metal_02', 1, 2);
    const wheelMat = keep(new THREE.MeshStandardMaterial({ color: 0x8a1c14, roughness: 0.5, metalness: 0.4 }));
    const wheelGeo = keep(new THREE.TorusGeometry(0.22, 0.03, 8, 24));
    const spokeGeo = keep(new THREE.BoxGeometry(0.44, 0.03, 0.03));
    const pipeGeo = keep(new THREE.CylinderGeometry(0.07, 0.07, 0.4, 10));
    pipeGeo.rotateX(Math.PI / 2);
    const vertGeo = keep(new THREE.CylinderGeometry(0.08, 0.08, WALL_H, 10));
    for (const cell of objectives) {
      const side = wallSide(cell) || DIRS[0];
      const base = new THREE.Vector3(world(cell[0]) + side[0] * (S / 2 - 0.02), 1.3, world(cell[1]) + side[1] * (S / 2 - 0.02));
      const g = new THREE.Group();
      g.position.copy(base);
      g.rotation.y = Math.atan2(-side[0], -side[1]);
      const pipe = new THREE.Mesh(pipeGeo, pipeMat);
      pipe.position.z = 0.2;
      const vert = new THREE.Mesh(vertGeo, pipeMat);
      vert.position.set(0, WALL_H / 2 - 1.3, 0.09);
      const wheel = new THREE.Group();
      wheel.position.z = 0.42;
      wheel.add(new THREE.Mesh(wheelGeo, wheelMat));
      const s1 = new THREE.Mesh(spokeGeo, wheelMat);
      const s2 = new THREE.Mesh(spokeGeo, wheelMat);
      s2.rotation.z = Math.PI / 2;
      wheel.add(s1, s2);
      g.add(pipe, vert, wheel);
      g.traverse((o) => { o.castShadow = true; });
      scene.add(g);
      const pos = base.clone().add(new THREE.Vector3(-side[0] * 0.42, 0, -side[1] * 0.42));
      valves.push({ cell, wheel, pos, progress: 0, done: false, squeakAt: 0 });
    }
  }

  // ── Spinde ──────────────────────────────────────────────────────────────
  const lockerGeo = keep(new THREE.BoxGeometry(0.9, 2.1, 0.6));
  lockerGeo.translate(0, 1.05, 0);
  const lockerPlain = assets.pbr(keep(new THREE.MeshStandardMaterial({ color: 0x55625c, roughness: 0.6, metalness: 0.4 })), 'rusty_metal_02', 1, 2);
  const lockerFace = assets.pbr(keep(new THREE.MeshStandardMaterial({ map: keep(lockerTexture()), roughness: 0.6, metalness: 0.3 })), 'rusty_metal_02', 1, 2, { noMap: true });
  // Würfelseiten: +x, -x, +y, -y, +z (vorn), -z
  const lockerMats = [lockerPlain, lockerPlain, lockerPlain, lockerPlain, lockerFace, lockerPlain];
  const lockers = [];
  for (const cell of lockerCells) {
    const back = wallSide(cell);
    if (!back) continue;
    const cx = world(cell[0]) + back[0] * (S / 2 - 0.3);
    const cz = world(cell[1]) + back[1] * (S / 2 - 0.3);
    const mesh = new THREE.Mesh(lockerGeo, lockerMats);
    mesh.position.set(cx, 0, cz);
    mesh.rotation.y = Math.atan2(-back[0], -back[1]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    if (back[0] !== 0) addProp(cx, cz, 0.3, 0.45); else addProp(cx, cz, 0.45, 0.3);
    lockers.push({ cell, mesh, x: cx, z: cz, face: [-back[0], -back[1]] });
  }

  // Wandschriften — nur an echten Wänden
  const texts = WRITINGS[level.theme] || [];
  writingCells.forEach((cell, i) => {
    const side = wallSide(cell);
    if (!side || !texts.length) return;
    const tex = keep(writingTexture(texts[i % texts.length], seed + i));
    const m = new THREE.Mesh(keep(new THREE.PlaneGeometry(1.8, 0.9)),
      keep(new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.9 })));
    m.position.set(world(cell[0]) + side[0] * (S / 2 - 0.01), 1.55 + rng() * 0.25, world(cell[1]) + side[1] * (S / 2 - 0.01));
    m.rotation.y = Math.atan2(-side[0], -side[1]);
    scene.add(m);
  });

  // ── Requisiten (Scan-Modelle) ───────────────────────────────────────────
  // Möblierte Räume (decor.js), dazu Kram an Wänden von Sackgassen und geraden Gängen (mit Kollision),
  // hängende Flackerlampen und im Keller Rohre unter der Decke.
  let flicker = null;
  if (!outdoor) {
    const avoid = new Set();
    const mark = ([x, z]) => avoid.add(z * size + x);
    [start, exitCell, door, ...objectives, ...batteries, ...lockerCells, ...writingCells].forEach(mark);
    for (const [dx, dz] of DIRS) mark([exitCell[0] + dx, exitCell[1] + dz]);
    const rooms = furnishRooms({ scene, assets, keep, maze, isOpen, S, addProp, rng, kind: level.theme, avoid });
    // Gang-Requisiten nicht noch zusätzlich in die Räume stellen
    for (const [cx, cz] of maze.rooms) for (let z = cz - 1; z <= cz + 1; z++) for (let x = cx - 1; x <= cx + 1; x++) mark([x, z]);
    const spots = propSpots(maze, isOpen, DIRS, avoid, rng, halls ? 16 : 12);
    placeRoomProps({ scene, assets, kind: level.theme, spots, S, addProp, rng });
    // Lampen über Gängen: gleichmäßig verteilt (Abstand ≥ 4 Kacheln), über die ganze Karte
    const lampCand = [];
    for (let z = 1; z < size - 1; z++) {
      for (let x = 1; x < size - 1; x++) if (isOpen(maze, x, z) && !avoid.has(z * size + x)) lampCand.push([x, z]);
    }
    for (let i = lampCand.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [lampCand[i], lampCand[j]] = [lampCand[j], lampCand[i]];
    }
    const lampCells = [];
    for (const c of lampCand) {
      if (lampCells.length >= (halls ? 14 : 10)) break;
      if (lampCells.some(([x, z]) => Math.abs(x - c[0]) + Math.abs(z - c[1]) < 4)) continue;
      lampCells.push(c);
    }
    flicker = createFlickerLamps({
      scene, assets, keep, rng, S, wallH: WALL_H, kind: level.theme, audio,
      cells: lampCells, roomCells: rooms.lamps, pool: quality.lights,
    });
    if (cellar) instanced.push(...placePipes({ scene, assets, keep, maze, isOpen, S, wallH: WALL_H }));
  }
  // Möbel und Lampen nur in der Nähe zeichnen: drinnen ist nach ~20 m alles im Nebel verschwunden, gezeichnet
  // (samt Schatten) hätten sie trotzdem den Großteil der Dreiecke gekostet
  const PROP_RANGE = 22;
  const cullables = [];
  scene.traverse((o) => { if (o.userData.prop && o.parent === scene) cullables.push(o); });
  let cullTick = 0;
  function cullProps() {
    if (!cullables.length || (++cullTick & 7) !== 0) return;
    const cx = camera.position.x;
    const cz = camera.position.z;
    for (const o of cullables) o.visible = Math.hypot(o.position.x - cx, o.position.z - cz) < PROP_RANGE;
  }

  // ── Scherben (Keller) ───────────────────────────────────────────────────
  // Glasflächen am Boden: wer drübergeht, knirscht — laut genug, dass der Lauscher es auch beim Schleichen hört.
  // Sie glitzern im Lichtkegel; manche füllen einen Gang ganz aus, dann muss man außen herum.
  const shards = [];
  if (cellar) {
    const avoid = new Set([...objectives, start, exitCell].map(([x, z]) => z * size + x));
    const candidates = [];
    for (let z = 1; z < size - 1; z++) {
      for (let x = 1; x < size - 1; x++) {
        if (!isOpen(maze, x, z) || avoid.has(z * size + x)) continue;
        if (Math.abs(x - start[0]) + Math.abs(z - start[1]) < 4) continue;
        candidates.push([x, z]);
      }
    }
    const count = Math.min(18, Math.floor(candidates.length * 0.12));
    const pos = [];
    for (let i = 0; i < count && candidates.length; i++) {
      const [c] = candidates.splice(Math.floor(rng() * candidates.length), 1);
      const sx = world(c[0]) + (rng() - 0.5) * 0.8;
      const sz = world(c[1]) + (rng() - 0.5) * 0.8;
      const r = 0.7 + rng() * 0.35;
      shards.push({ x: sx, z: sz, r });
      // Viele kleine, zufällig gedrehte Dreiecke flach am Boden
      for (let k = 0; k < 70; k++) {
        const a = rng() * Math.PI * 2;
        const d = Math.sqrt(rng()) * r;
        const cx = sx + Math.cos(a) * d;
        const cz = sz + Math.sin(a) * d;
        const s = 0.03 + rng() * 0.07;
        const rot = rng() * Math.PI * 2;
        const y = 0.006 + rng() * 0.01;
        for (let j = 0; j < 3; j++) {
          const ang = rot + (j * Math.PI * 2) / 3 + (rng() - 0.5) * 0.8;
          pos.push(cx + Math.cos(ang) * s, y, cz + Math.sin(ang) * s);
        }
      }
    }
    if (pos.length) {
      const g = keep(new THREE.BufferGeometry());
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.computeVertexNormals();
      const glassMat = keep(new THREE.MeshStandardMaterial({
        color: 0xe4f0ee, metalness: 0.85, roughness: 0.05, transparent: true, opacity: 0.85, side: THREE.DoubleSide,
        emissive: 0x1a2222,
      }));
      scene.add(new THREE.Mesh(g, glassMat));
    }
  }
  const onShards = () => shards.some((s) => Math.hypot(player.x - s.x, player.z - s.z) < s.r);
  let shardWarned = false;
  let glassStride = 1; // > 0,45: der erste Schritt aufs Glas knirscht sofort

  // ── Monster (Billboard mit Alpha-Schatten) ──────────────────────────────
  // Drei Ansichten (vorn, hinten, Seite) wie bei alten Ego-Shootern: das Billboard dreht sich zur Kamera,
  // die Textur zeigt aber, wohin das Monster läuft.
  const views = creatureViews(level.monster);
  const viewMats = {};
  for (const name of ['front', 'back', 'side']) {
    const t = views[name];
    keep(t.map); keep(t.emissive);
    viewMats[name] = {
      // Lambert statt Standard: ohne Glanzanteil bleibt der Körper auch direkt im Lichtkegel schwarz
      mat: keep(new THREE.MeshLambertMaterial({
        map: t.map, emissiveMap: t.emissive, emissive: 0xffffff, emissiveIntensity: 0.9,
        alphaTest: 0.5, side: THREE.DoubleSide,
      })),
      depth: keep(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: t.map, alphaTest: 0.5 })),
    };
  }
  const monsterH = MONSTER_HEIGHT[level.monster] || 2.7;
  const creatureGeo = keep(new THREE.PlaneGeometry(monsterH * 0.5, monsterH));
  creatureGeo.translate(0, monsterH / 2, 0);
  const makeCreature = () => {
    const m = new THREE.Mesh(creatureGeo, viewMats.front.mat);
    m.castShadow = true;
    m.customDepthMaterial = viewMats.front.depth;
    scene.add(m);
    return m;
  };
  /** Wählt die Ansicht aus Laufrichtung (fx, fz) und Blick der Kamera. Der Beobachter schaut immer her. */
  const applyView = (mesh, fx, fz) => {
    const dx = camera.position.x - mesh.position.x;
    const dz = camera.position.z - mesh.position.z;
    const len = Math.hypot(dx, dz) || 1;
    const tx = dx / len;
    const tz = dz / len;
    let name = 'front';
    let flip = 1;
    if (monster.kind !== 'watcher') {
      const dot = fx * tx + fz * tz;
      if (dot < -0.45) name = 'back';
      else if (dot < 0.45) {
        name = 'side';
        // lokale +x-Achse des Billboards in Weltkoordinaten = (tz, -tx); die Seitenansicht schaut nach +x
        flip = fx * tz - fz * tx >= 0 ? 1 : -1;
      }
    }
    mesh.material = viewMats[name].mat;
    mesh.customDepthMaterial = viewMats[name].depth;
    return flip;
  };
  const monsterMesh = makeCreature();
  const phantom = makeCreature();
  phantom.visible = false;

  // 3D-Figuren (monsterModel.js) ersetzen die Billboards, sobald das Modell geladen ist. Die Billboards
  // bleiben als Spiellogik-Platzhalter bestehen (Position/Sichtbarkeit), werden dann aber nicht mehr
  // gezeichnet (Ebene 31). Lädt das Modell nicht, bleibt alles wie bisher.
  let body = null;
  let phantomBody = null;
  let bodyYaw = 0;
  let animStep = 0;
  let gone = false;
  loadMonsterKit().then((kit) => {
    if (gone || !kit) return;
    const a = buildMonsterModel(kit, level.monster);
    const b = buildMonsterModel(kit, level.monster);
    if (!a || !b) { a?.dispose(); b?.dispose(); return; }
    body = keep(a);
    phantomBody = keep(b);
    scene.add(body.group, phantomBody.group);
    body.group.visible = false;
    phantomBody.group.visible = false;
    monsterMesh.layers.set(31);
    phantom.layers.set(31);
    // Mitspieler als Figuren in ihrer Platzfarbe
    for (const p of peers.values()) {
      const av = buildMonsterModel(kit, 'human', { color: SEAT_COLORS[p.seat % SEAT_COLORS.length] });
      if (!av) continue;
      p.avatar = keep(av);
      av.group.visible = false;
      scene.add(av.group);
    }
    // Sonst übersetzt der Browser die Shader erst beim ersten Blick aufs Monster (spürbarer Ruckler)
    warm();
  });

  // Startplatz des Monsters: weit weg vom Start
  const spawn = (() => {
    let best = null;
    let bestScore = -1;
    for (let z = 1; z < size - 1; z++) {
      for (let x = 1; x < size - 1; x++) {
        if (!isOpen(maze, x, z)) continue;
        const d = fromStart[z * size + x];
        if (d < 0) continue;
        const toExit = Math.abs(x - exitCell[0]) + Math.abs(z - exitCell[1]);
        const score = Math.min(d, size * 1.1) + Math.min(toExit, 8) + rng() * 4;
        if (score > bestScore) { bestScore = score; best = [x, z]; }
      }
    }
    return best;
  })();

  const monster = {
    kind: level.monster,
    x: world(spawn[0]), z: world(spawn[1]),
    state: 'dormant', path: [], pathAt: 0, target: null,
    fx: 0, fz: 1, lastSeenX: 0, lastSeenZ: 0, seenAt: -99, searchUntil: 0,
    stepDist: 0, nextGrowl: 8, huntUntil: 0, sawHide: false, freezeUntil: 0,
    nextEcho: 2, seenByPlayer: false, stingAt: -99, stare: 0, staredAway: false, awayUntil: 0, stalkUntil: 0,
    trailT: 0,
  };

  // Gärtner (Garten): Duftspur des Spielers und seine Laterne (Licht wandert mit — man sieht ihren Schein
  // um Ecken und über eingestürzte Mauern, bevor man ihn sieht)
  /** @type {{x:number, z:number, t:number, life:number}[]} */
  const trail = [];
  let myCrumb = null; // zuletzt selbst gelegte Krume (in der Koop-Runde liegen fremde dazwischen)
  let lanternLight = null;
  if (garden) {
    lanternLight = new THREE.PointLight(0xffa850, 0, 8, 1.6);
    lanternLight.position.set(monster.x, 1.1, monster.z);
    scene.add(lanternLight);
    // Rätsel-Statuen kennen ihre richtige Richtung (gardenInfo hat sie berechnet)
    gardenInfo.puzzle.forEach((p, i) => { gardenView.statues[i].correct = p.correct; });
  }
  const puzzleStatues = gardenView ? gardenView.statues.filter((s) => s.turnable) : [];

  // ── Spieler ─────────────────────────────────────────────────────────────
  const player = {
    x: world(start[0]), z: world(start[1]),
    yaw: 0, pitch: 0, stamina: 100, exhausted: false, staminaPause: 0,
    battery: 100, light: true, fuses: 0, inserted: 0, hasKey: false, valvesDone: 0,
    hidden: null, stride: 0, bob: 0, hold: 0, adapt: 0,
  };
  {
    // Erste Blickrichtung: in den offenen Gang bzw. in den Wald hinein
    const [sx, sz] = start;
    const d = forest ? [0, -1] : (DIRS.find(([dx, dz]) => isOpen(maze, sx + dx, sz + dz)) || [0, 1]);
    player.yaw = yawTo(d[0], d[1]);
  }
  player.alive = true;
  player.seat = coop ? net.mySeat : -1;

  // ── Koop: Mitspieler ────────────────────────────────────────────────────
  // Jeder Mitspieler: zuletzt gemeldete Lage (t…) und die geglättete (x/z/yaw), nach der das Monster jagt und
  // die man sieht. Dazu eine Figur (Mannequin in Platzfarbe) und das Licht seiner Taschenlampe — als echtes
  // Spotlicht (ohne Schatten) plus schwacher Lichtkegel in der Luft, damit man Mitspieler im Dunkeln findet.
  const SEAT_COLORS = ['#34485e', '#5e3434', '#365e40', '#5e5432'];
  const peers = new Map();
  if (coop) {
    const beamGeo = keep(new THREE.ConeGeometry(1.5, 7, 18, 1, true));
    beamGeo.translate(0, -3.5, 0);
    beamGeo.rotateX(Math.PI / 2);
    const beamMat = keep(new THREE.MeshBasicMaterial({
      color: 0xfff0d0, transparent: true, opacity: 0.06, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    // Leuchtendes Lampenglas in der Hand des Mitspielers (über der Bloom-Schwelle) — so sieht man von weitem, wo er ist
    const lensGeo = keep(new THREE.SphereGeometry(0.035, 10, 8));
    const lensMat = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff2d8).multiplyScalar(3) }));
    for (const p of net.players) {
      if (p.seat === net.mySeat) continue;
      const spot = new THREE.SpotLight(0xffe8c4, 0, 22, 0.46, 0.55, 1.4);
      spot.castShadow = false;
      scene.add(spot, spot.target);
      const beam = new THREE.Mesh(beamGeo, beamMat);
      beam.rotation.order = 'YXZ';
      beam.visible = false;
      scene.add(beam);
      const lens = new THREE.Mesh(lensGeo, lensMat);
      lens.visible = false;
      scene.add(lens);
      peers.set(p.seat, {
        seat: p.seat, name: p.name, x: player.x, z: player.z, yaw: player.yaw, pitch: 0, tx: undefined, tz: 0, tyaw: 0, tpitch: 0,
        light: true, lightOn: true, hidden: null, sneak: false, alive: true, sees: false, moving: false, connected: true, sawHide: false,
        netSpeed: 0, stride: 0, spot, beam, lens, avatar: null,
      });
    }
  }
  const peerName = (seat) => peers.get(seat)?.name || 'Jemand';
  /** Alle, die das Monster gerade jagen kann: lebend und verbunden. */
  const targets = () => {
    const out = player.alive ? [player] : [];
    for (const p of peers.values()) if (p.alive && p.connected) out.push(p);
    return out;
  };
  const targetBySeat = (seat) => targets().find((t) => t.seat === seat) || null;
  /** Abstand zum nächsten Mitspieler — der Beobachter sucht sich gern den aus, der allein ist. */
  const loneliness = (t) => targets().reduce((m, o) => (o === t ? m : Math.min(m, Math.hypot(o.x - t.x, o.z - t.z))), 99);
  const sendEvent = (e) => { if (coop) net.send('event', e); };

  // ── Eingabe ─────────────────────────────────────────────────────────────
  const keys = new Set();
  let ePressed = false;
  let paused = true;
  let ended = false;
  const canvasEl = renderer.domElement;

  // Anfahrt im Auto (nur Wald, nur bei neuem Spiel): t läuft, bis INTRO_END; Leertaste/E/Enter überspringt
  const INTRO_END = 9.2;
  const intro = forest && opts.intro ? { t: 0, engine: null, slammed: false, faded: false, creaked: false } : null;

  const onKeyDown = (e) => {
    const k = e.key.toLowerCase();
    if (paused || ended) return;
    if (intro && intro.t < INTRO_END) {
      if ([' ', 'e', 'enter'].includes(k)) {
        e.preventDefault();
        if (intro.t < 7.4) intro.t = 7.4;
      }
      return;
    }
    if (['w', 'a', 's', 'd', 'c', 'shift', 'e', 'f', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
    // Erwischt (Koop): nur noch zuschauen, Leertaste wechselt den Mitspieler
    if (!player.alive) {
      if (k === ' ' && !e.repeat) { e.preventDefault(); nextSpectate(); }
      return;
    }
    // Zahlenschloss: Ziffern tippen (Haupt- und Ziffernblock), Rücktaste löscht
    if (codeLock?.active && !e.repeat) {
      if (/^[0-9]$/.test(e.key)) { e.preventDefault(); typeDigit(e.key); return; }
      if (k === 'backspace') { e.preventDefault(); codeLock.entered = codeLock.entered.slice(0, -1); return; }
    }
    if (k === 'f' && !e.repeat) toggleLight();
    if (k === 'e' && !e.repeat) ePressed = true;
    keys.add(k);
  };
  const onKeyUp = (e) => keys.delete(e.key.toLowerCase());
  const onMouse = (e) => {
    if (paused || ended || document.pointerLockElement !== canvasEl) return;
    player.yaw -= e.movementX * 0.0022 * sensitivity;
    player.pitch = clamp(player.pitch - e.movementY * 0.0022 * sensitivity, -1.35, 1.35);
    if (player.hidden) {
      // Im Spind nur nach vorn durch die Schlitze
      const base = Math.atan2(-player.hidden.face[0], -player.hidden.face[1]);
      let d = player.yaw - base;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      player.yaw = base + clamp(d, -0.6, 0.6);
      player.pitch = clamp(player.pitch, -0.4, 0.4);
    }
  };
  const onLockChange = () => {
    const locked = document.pointerLockElement === canvasEl;
    if (!locked && !ended && !paused) {
      paused = true;
      keys.clear();
      cb.onPause?.(true);
    }
  };
  const onBlur = () => keys.clear();
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  document.addEventListener('mousemove', onMouse);
  document.addEventListener('pointerlockchange', onLockChange);

  function toggleLight() {
    torch.click();
    audio?.click();
    if (player.battery <= 0) return;
    player.light = !player.light;
  }

  // ── Hilfen ──────────────────────────────────────────────────────────────
  const circleOut = (px, pz, cx, cz, r) => {
    const dx = px - cx;
    const dz = pz - cz;
    const min = r + PLAYER_R;
    const d2 = dx * dx + dz * dz;
    if (d2 >= min * min || d2 < 1e-9) return [px, pz];
    const d = Math.sqrt(d2);
    return [cx + (dx / d) * min, cz + (dz / d) * min];
  };

  function collide(px, pz) {
    for (let pass = 0; pass < 2; pass++) {
      const tx = tileOf(px);
      const tz = tileOf(pz);
      const boxes = [];
      for (let z = tz - 1; z <= tz + 1; z++) {
        for (let x = tx - 1; x <= tx + 1; x++) {
          if (!solid(x, z)) continue;
          const trunk = isTrunk(x, z) ? trunks.get(z * size + x) : null;
          if (trunk) [px, pz] = circleOut(px, pz, trunk.x, trunk.z, trunk.r);
          else boxes.push({ minX: world(x) - S / 2, maxX: world(x) + S / 2, minZ: world(z) - S / 2, maxZ: world(z) + S / 2 });
        }
      }
      for (const p of props) if (Math.abs(p.minX - px) < 3 && Math.abs(p.minZ - pz) < 3) boxes.push(p);
      for (const b of boxes) {
        const cx = clamp(px, b.minX, b.maxX);
        const cz = clamp(pz, b.minZ, b.maxZ);
        const dx = px - cx;
        const dz = pz - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= PLAYER_R * PLAYER_R) continue;
        if (d2 > 1e-9) {
          const d = Math.sqrt(d2);
          px = cx + (dx / d) * PLAYER_R;
          pz = cz + (dz / d) * PLAYER_R;
        } else {
          // Mittelpunkt in der Box: auf kürzestem Weg hinaus
          const pens = [[px - b.minX, -1, 0], [b.maxX - px, 1, 0], [pz - b.minZ, 0, -1], [b.maxZ - pz, 0, 1]];
          pens.sort((a, c) => a[0] - c[0]);
          px += pens[0][1] * (pens[0][0] + PLAYER_R);
          pz += pens[0][2] * (pens[0][0] + PLAYER_R);
        }
      }
    }
    return [px, pz];
  }

  /** Freie Sicht zwischen zwei Punkten. Im Wald blockieren nur die Stämme selbst, nicht ganze Kacheln. */
  function lineOfSight(x0, z0, x1, z1) {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const steps = Math.ceil(dist / 0.25);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = x0 + dx * t;
      const z = z0 + dz * t;
      const tx = tileOf(x);
      const tz = tileOf(z);
      if (!solid(tx, tz)) continue;
      if (isTrunk(tx, tz)) {
        const tr = trunks.get(tz * size + tx);
        if (tr && Math.hypot(x - tr.x, z - tr.z) > tr.r) continue;
      }
      return false;
    }
    return true;
  }

  const distTo = (x, z) => Math.hypot(player.x - x, player.z - z);

  // ── Zustand für Regie und HUD ───────────────────────────────────────────
  let time = 0;
  let phase = 'collect'; // collect → deliver → escape
  let lastScare = 0;
  let flickerUntil = 0;
  let nextAlarm = 0;
  let nextBeep = 0;
  let nextAmbient = 4;
  let hudAt = 0;
  let breathAt = 0;
  let shake = 0;
  let message = { text: level.title, until: 4 };
  let glimpseUntil = 0;
  const say = (text, secs = 4) => { message = { text, until: time + secs }; };

  /**
   * Geräusch des Spielers (oder an einer Stelle). Jäger und Lauscher horchen auf, der Beobachter nicht.
   * @param {number} radius Hörweite in Metern
   */
  function noise(radius, x = player.x, z = player.z) {
    // Koop: Nur der Host rechnet das Monster — die anderen melden laute Geräusche an ihn (gedrosselt)
    if (coop && !isHost) {
      const now = performance.now();
      if (radius >= 3 && now > noiseSentAt) {
        noiseSentAt = now + 250;
        sendEvent({ type: 'noise', x: r2(x), z: r2(z), r: radius });
      }
      return;
    }
    if (monster.state === 'dormant' || monster.kind === 'watcher') return;
    const d = Math.hypot(monster.x - x, monster.z - z);
    if (d > radius * HARD.noise) return;
    if (monster.kind === 'tracker') {
      // Der Gärtner hört schlecht, aber Lärm macht ihn hastig — und bringt ihn auf die Spur
      monster.huntUntil = Math.max(monster.huntUntil, time + 10);
      if (monster.state === 'roam' || monster.state === 'search') {
        // auf die Spur dessen, der am nächsten am Lärm ist — ein Stück hinter ihm
        const ts = targets();
        const who = ts.reduce((best, t) => (!best || Math.hypot(t.x - x, t.z - z) < Math.hypot(best.x - x, best.z - z) ? t : best), null);
        const own = who ? trail.filter((c) => c.o === (who.seat ?? -1)) : [];
        if (own.length) {
          monster.state = 'track';
          monster.trailOwner = who.seat ?? -1;
          monster.trailT = own[Math.max(0, own.length - 25)].t - 0.01;
          monster.path = [];
        }
      }
      return;
    }
    if (monster.kind === 'hunter') {
      if (monster.state === 'chase') return;
      monster.state = 'investigate';
    } else {
      // Lauscher: nah = Sprung, weiter weg = nachsehen
      const wasCharging = monster.state === 'charge';
      monster.state = d < 7 ? 'charge' : 'investigate';
      if (monster.state === 'charge' && !wasCharging && time - monster.stingAt > 6) {
        monster.stingAt = time;
        // erschreckt den, der das Geräusch gemacht hat
        const ts = targets();
        focus = ts.reduce((b, t) => (!b || Math.hypot(t.x - x, t.z - z) < Math.hypot(b.x - x, b.z - z) ? t : b), null) || player;
        mfx('stinger', monster.x, monster.z, focus);
      }
    }
    monster.target = [tileOf(x), tileOf(z)];
    monster.lastSeenX = x;
    monster.lastSeenZ = z;
    monster.path = [];
  }

  function startChase() {
    if (monster.state === 'chase' || (coop && !isHost)) return;
    monster.state = 'chase';
    // Kurzes Zögern beim Entdecken — das ist der Vorsprung, um wegzukommen
    monster.freezeUntil = time + 0.9;
    mfx('stinger', monster.x, monster.z, focus);
    mfx('growl', monster.x, monster.z);
  }

  // ── Ziele je Ebene ──────────────────────────────────────────────────────
  function goalText() {
    if (forest) {
      if (codeLock.open && player.hasKey) return ['Zur Haustür', 'Schloss offen, Schlüssel in der Tasche.'];
      const todo = [];
      if (!player.hasKey) todo.push('Finde den Schlüssel');
      if (!codeLock.open) todo.push(player.hasKey ? 'Knacke das Zahlenschloss' : 'knacke das Zahlenschloss');
      const read = carvings.filter((c) => c.read).length;
      const hint = codeLock.open ? '' : ` Der Code ist in Bäume mit rotem Band geritzt — Schnitzereien ${read} / ${carvings.length}.`;
      return [todo.join(' und '), (player.hasKey ? '' : 'Hör auf das Klimpern.') + hint];
    }
    if (garden) {
      if (phase === 'escape') return ['Das Tor ist offen — raus hier.', 'Folge dem Quietschen.'];
      const found = puzzleStatues.filter((s) => s.touched).length;
      return ['Drehe die Statuen zum roten Licht', `Drehbare Sockel gefunden: ${found} / ${puzzleStatues.length}`];
    }
    if (halls) {
      if (phase === 'escape') return ['Zur Treppe nach unten.', `Sicherungen ${NEED} / ${NEED}`];
      const found = player.fuses + player.inserted;
      return [player.fuses > 0 || phase === 'deliver' ? `Sicherungen einsetzen (${player.inserted} / ${NEED})` : 'Finde die Sicherungen',
        `Sicherungen ${found} / ${NEED} · ${coop ? 'im Team' : 'bei dir'} ${player.fuses}`];
    }
    if (phase === 'escape') return ['Raus durch den Notausgang.', `Ventile ${NEED} / ${NEED}`];
    return [`Ventile aufdrehen (${player.valvesDone} / ${NEED})`, 'Jedes Ventil quietscht. Es hört das.'];
  }

  // ── Interaktion ─────────────────────────────────────────────────────────
  function findInteract() {
    if (player.hidden) return { kind: 'leave', label: 'Spind verlassen' };
    const fx = -Math.sin(player.yaw);
    const fz = -Math.cos(player.yaw);
    let best = null;
    let bestD = 1.9;
    const consider = (x, z, obj) => {
      const dx = x - player.x;
      const dz = z - player.z;
      const d = Math.hypot(dx, dz);
      if (d > bestD) return;
      if (d > 0.5 && (dx * fx + dz * fz) / d < 0.45) return;
      bestD = d;
      best = obj;
    };
    const LABEL = { fuse: 'Sicherung aufheben', battery: 'Akku aufheben', key: 'Schlüssel aufheben' };
    for (const it of items) {
      if (!it.taken) consider(it.mesh.position.x, it.mesh.position.z, { kind: it.kind, item: it, label: LABEL[it.kind] });
    }
    for (const l of lockers) consider(l.x, l.z, { kind: 'locker', locker: l, label: 'Im Spind verstecken' });
    if (halls && phase !== 'escape') {
      consider(boxPos.x, boxPos.z, player.fuses > 0
        ? { kind: 'box', hold: true, label: 'Sicherung einsetzen (E halten)' }
        : { kind: 'info', label: `Sicherungskasten — ${player.inserted} / 3 eingesetzt` });
    }
    for (const v of valves) {
      if (!v.done) consider(v.pos.x, v.pos.z, { kind: 'valve', valve: v, hold: true, label: 'Ventil aufdrehen (E halten)' });
    }
    if (forest) {
      let t;
      if (!codeLock.open) t = { kind: 'code', label: codeLock.active ? 'Ziffern tippen (0–9) · E: zurücktreten' : 'Zahlenschloss: Code eingeben' };
      else if (!player.hasKey) t = { kind: 'info', label: 'Das Zahlenschloss ist offen. Fehlt der Schlüssel.' };
      else t = { kind: 'houseDoor', label: 'Tür aufschließen' };
      consider(doorBase.x, doorBase.z, t);
      // Stammmitte statt Vorderseite: die Schnitzerei ist auch auf der Rückseite, ansehen geht von beiden Seiten
      for (const c of carvings) consider(c.tx, c.tz, { kind: 'carving', carving: c, label: c.read ? 'Schnitzerei (schon gesehen)' : 'Schnitzerei ansehen' });
    }
    for (const s of gardenView?.statues || []) {
      consider(s.x, s.z, s.turnable
        ? (phase === 'escape' ? { kind: 'info', label: 'Die Statue rührt sich nicht mehr.' } : { kind: 'statue', statue: s, hold: true, label: 'Sockel drehen (E halten)' })
        : { kind: 'info', label: 'Diese Figur sitzt fest im Stein.' });
    }
    return best;
  }

  /**
   * Gegenstand aufheben. by = null: selbst (dann auch an die anderen melden), sonst der Platz des Mitspielers.
   * Akkus gehören dem, der sie nimmt; Schlüssel und Sicherungen dem ganzen Team.
   */
  function takeItem(item, by) {
    if (item.taken) return;
    const mine = by === null;
    item.taken = true;
    item.mesh.visible = false;
    if (mine) {
      audio?.pickup();
      noise(3);
      sendEvent({ type: 'take', i: items.indexOf(item) });
    }
    const who = mine ? '' : `${peerName(by)}: `;
    if (item.kind === 'battery') {
      if (mine) {
        player.battery = Math.min(100, player.battery + BATTERY_PICKUP);
        say('Akku eingelegt.', 2.5);
      }
      return;
    }
    if (item.kind === 'key') {
      player.hasKey = true;
      phase = 'deliver';
      say(mine ? 'Der Schlüssel. Zurück zum Haus.' : `${who}Ich hab den Schlüssel!`, 4);
      flickerUntil = time + 1.2;
      audio?.buzz(1.2);
      return;
    }
    player.fuses++;
    const found = player.inserted + player.fuses;
    if (found === 1) {
      say(mine ? 'Eine Sicherung. Irgendwo hat es dich gehört.' : `${who}Eine Sicherung!`, 4);
      const a = rng() * Math.PI * 2;
      audio?.bang(player.x + Math.cos(a) * 14, 1.5, player.z + Math.sin(a) * 14);
      if (monster.state === 'dormant') monster.state = 'patrol';
      noise(99);
    } else if (found < NEED) {
      say(mine ? `Noch eine (${found} / ${NEED}). Es kommt näher.` : `${who}Sicherung ${found} / ${NEED}.`, 4);
      if (mine) mfx('growl', monster.x, monster.z);
    } else {
      say(`Alle ${NEED}. Zum Sicherungskasten am Ausgang — dem Piepen nach.`, 5);
      flickerUntil = time + 1.6;
      audio?.buzz(1.6);
    }
    if (found >= NEED) phase = 'deliver';
  }

  function interact(target) {
    if (target.kind === 'leave') {
      const l = player.hidden;
      player.hidden = null;
      player.x = l.x + l.face[0] * 0.75;
      player.z = l.z + l.face[1] * 0.75;
      audio?.clunk();
      noise(6);
      return;
    }
    if (target.kind === 'fuse' || target.kind === 'battery' || target.kind === 'key') {
      takeItem(target.item, null);
      return;
    }
    if (target.kind === 'locker') {
      // Herausgezogen wird man nur, wenn es einen GERADE sieht und nah ist — nicht, weil es einen vor einer Sekunde gesehen hat
      player.sawHide = monster.kind === 'hunter' && canSee(player) && distTo(monster.x, monster.z) < 7;
      player.hidden = target.locker;
      player.x = target.locker.x + target.locker.face[0] * 0.05;
      player.z = target.locker.z + target.locker.face[1] * 0.05;
      player.yaw = Math.atan2(-target.locker.face[0], -target.locker.face[1]);
      player.pitch = 0;
      audio?.clunk();
      noise(6);
      return;
    }
    if (target.kind === 'houseDoor') {
      audio?.unlock();
      openDoor();
      say('Offen.', 2);
      escaped();
      return;
    }
    if (target.kind === 'code') {
      codeLock.active = !codeLock.active;
      codeLock.entered = '';
      audio?.click();
      return;
    }
    if (target.kind === 'carving') {
      const c = target.carving;
      if (!c.read) {
        c.read = true;
        audio?.pickup();
        // Gefundene Schnitzereien sehen alle (stehen im HUD unter dem Ziel)
        sendEvent({ type: 'carving', i: carvings.indexOf(c) });
      }
      say(`In die Rinde geritzt: ${SYMBOL_NAMES[c.id]} — ${c.digit}`, 5);
    }
  }

  /** Zahlenschloss offen (selbst geknackt oder von einem Mitspieler). */
  function openCode(by) {
    if (codeLock.open) return;
    codeLock.open = true;
    codeLock.active = false;
    audio?.unlock();
    if (by === null) sendEvent({ type: 'code' });
    const pre = by === null ? '' : `${peerName(by)}: `;
    say(`${pre}Das Zahlenschloss springt auf.${player.hasKey ? ' Jetzt der Schlüssel.' : ' Fehlt noch der Schlüssel.'}`, 4);
  }

  /** Eine Ziffer am Zahlenschloss. Nach drei Ziffern wird geprüft. */
  function typeDigit(d) {
    if (!codeLock || codeLock.open) return;
    codeLock.entered += d;
    audio?.click();
    if (codeLock.entered.length < codeLock.code.length) return;
    if (codeLock.entered === codeLock.code) {
      openCode(null);
      return;
    }
    codeLock.wrong++;
    codeLock.entered = '';
    audio?.clunk();
    if (codeLock.wrong % 3 === 0) {
      // Das Rütteln hallt durch den Wald — der Beobachter kommt sofort
      say('Das Rütteln hallt durch den Wald.', 3);
      if (isHost && (monster.state === 'away' || monster.state === 'dormant')) { monster.state = 'away'; monster.awayUntil = time; }
      else sendEvent({ type: 'noise', x: player.x, z: player.z, r: 0, lure: 1 });
    } else say('Falsch.', 1.6);
  }

  /** Garten: Sockel um eine Vierteldrehung weiter; stehen alle richtig, öffnet sich das Tor. by: wie takeItem. */
  function turnStatue(s, by = null) {
    if (phase === 'escape') return;
    gardenView.turnStatue(s);
    s.touched = true;
    if (by === null) sendEvent({ type: 'statue', i: puzzleStatues.indexOf(s) });
    audio?.clunk();
    if (puzzleStatues.every((p) => p.facing === p.correct)) {
      phase = 'escape';
      gardenView.openGate();
      openDoor();
      audio?.bell();
      setTimeout(() => { if (!ended) audio?.gateCreak(); }, 900);
      say('Ein Glockenschlag. Irgendwo öffnet sich quietschend ein Tor.', 5);
      // Der Gärtner hat es auch gehört: er hetzt los, deiner Spur nach
      monster.huntUntil = time + 25;
      noise(99);
    }
  }

  /** Sicherung einsetzen (by: wie takeItem). Die Sicherungen gehören dem Team — jeder kann jede einsetzen. */
  function insertFuse(by = null) {
    if (player.inserted >= NEED) return;
    player.fuses = Math.max(0, player.fuses - 1);
    player.inserted++;
    if (slotMeshes[player.inserted - 1]) slotMeshes[player.inserted - 1].visible = true;
    audio?.clunk();
    if (by === null) {
      noise(9);
      sendEvent({ type: 'insert' });
    }
    if (player.inserted >= NEED) powerOn();
    else say(`${by === null ? '' : `${peerName(by)}: `}${player.inserted} / ${NEED} eingesetzt.`, 2.5);
  }

  function openDoor() {
    doorOpen = true;
    outside.visible = true;
  }

  /** Bringt das Monster außer Reichweite, wenn es beim Öffnen des Ausgangs direkt neben jemandem steht. */
  function keepFair(minDist) {
    if (!isHost) return;
    const ts = targets();
    const nearest = (x, z) => ts.reduce((m, t) => Math.min(m, Math.hypot(x - t.x, z - t.z)), Infinity);
    if (nearest(monster.x, monster.z) >= minDist) return;
    for (let tries = 0; tries < 400; tries++) {
      const x = 1 + Math.floor(rng() * (size - 2));
      const z = 1 + Math.floor(rng() * (size - 2));
      if (!isOpen(maze, x, z)) continue;
      const d = nearest(world(x), world(z));
      if (d > minDist + 2 && d < minDist + 10) {
        monster.x = world(x);
        monster.z = world(z);
        monster.path = [];
        return;
      }
    }
  }

  function powerOn() {
    phase = 'escape';
    audio?.powerOn();
    say('Strom ist da. Die Tür zur Treppe geht auf — RENN.', 5);
    boxLamp?.color.set(0x30ff60);
    flicker?.powerOn();
    openDoor();
    keepFair(12);
    monster.huntUntil = time + 8;
    startChase();
  }

  function valveDone(v, by = null) {
    if (v.done) return;
    v.done = true;
    v.progress = 1;
    player.valvesDone++;
    audio?.clunk();
    if (by === null) sendEvent({ type: 'valve', i: valves.indexOf(v) });
    if (player.valvesDone >= NEED) {
      phase = 'escape';
      say('Der Notausgang ist offen. Es hat es auch gehört.', 5);
      audio?.powerOn();
      openDoor();
      keepFair(12);
      // Das Ding rennt zum Ausgang — wer zögert, trifft es dort
      noise(99, world(exitCell[0]), world(exitCell[1]));
    } else {
      say(`${by === null ? '' : `${peerName(by)}: `}${player.valvesDone} / ${NEED} Ventile.`, 2.5);
    }
  }

  // ── Monster ─────────────────────────────────────────────────────────────
  // Das Monster jagt immer EINEN Spieler: focus. Allein ist das der eigene Spieler; in der Koop-Runde wählt der
  // Host-Browser unter allen Lebenden (wen es sieht, wessen Spur es folgt, wen es belauert). Ein Ziel hat
  // x, z, yaw, light, hidden (Spind bzw. Versteck mit x/z) und alive.
  let focus = player;
  const focusDist = () => Math.hypot(focus.x - monster.x, focus.z - monster.z);

  /** Sieht der Jäger dieses Ziel? Im Dunkeln verliert er es schneller. */
  function canSee(t = focus) {
    if (t.hidden || t.alive === false) return false;
    const d = Math.hypot(t.x - monster.x, t.z - monster.z);
    let range;
    if (monster.state === 'chase') range = t.light ? 16 : 8;
    else range = t.light ? 15 : 5.5;
    if (d > range) return false;
    if (d > 3 && monster.state !== 'chase') {
      const dot = ((t.x - monster.x) * monster.fx + (t.z - monster.z) * monster.fz) / d;
      if (dot < 0.3) return false;
    }
    return lineOfSight(monster.x, monster.z, t.x, t.z);
  }

  /** Das nächste Ziel, das gerade gesehen wird (oder null). Setzt focus darauf. */
  function seeAny(test = canSee) {
    let best = null;
    let bestD = Infinity;
    for (const t of targets()) {
      if (!test(t)) continue;
      const d = Math.hypot(t.x - monster.x, t.z - monster.z);
      if (d < bestD) { bestD = d; best = t; }
    }
    if (best) focus = best;
    return best;
  }

  /** Sieht (irgend)ein Spieler gerade das Monster? Für den Beobachter — er erstarrt im Blick. */
  function seenByAnyone() {
    if (playerSeesMonster()) return true;
    for (const p of peers.values()) if (p.alive && p.sees) return true;
    return false;
  }

  /** Sieht der eigene Spieler das Monster? (für den Beobachter) Im Lichtkegel weit, sonst je nach Augen. */
  function playerSeesMonster() {
    if (player.hidden || !player.alive) return false;
    const dx = monster.x - player.x;
    const dz = monster.z - player.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.01) return true;
    const fx = -Math.sin(player.yaw);
    const fz = -Math.cos(player.yaw);
    const cos = (dx * fx + dz * fz) / d;
    const halfH = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
    if (cos < Math.cos(halfH - 0.08)) return false;
    const inBeam = player.light && cos > Math.cos(0.5);
    const range = inBeam ? 22 : 3.5 + player.adapt * 6;
    if (d > range) return false;
    return lineOfSight(player.x, player.z, monster.x, monster.z);
  }

  function randomTarget(nearPlayer) {
    for (let tries = 0; tries < 200; tries++) {
      let x;
      let z;
      if (nearPlayer) {
        // Leine: es streift in der Nähe des Spielers umher, nicht am anderen Ende
        x = tileOf(focus.x) + Math.round((rng() - 0.5) * 14);
        z = tileOf(focus.z) + Math.round((rng() - 0.5) * 14);
      } else {
        x = 1 + Math.floor(rng() * (size - 2));
        z = 1 + Math.floor(rng() * (size - 2));
      }
      if (isOpen(maze, x, z) && !maze.blocked?.has(z * size + x)) return [x, z];
    }
    return [tileOf(monster.x), tileOf(monster.z)];
  }

  const follows = () => monster.state === 'chase' || monster.state === 'stalk';

  /** Bewegt das Monster ein Stück entlang seines Wegs; gibt die zurückgelegte Strecke zurück. */
  function moveAlongPath(speed, dt) {
    if (monster.target && (monster.path.length === 0 || time > monster.pathAt)) {
      monster.path = findPath(maze, tileOf(monster.x), tileOf(monster.z), monster.target[0], monster.target[1]);
      monster.pathAt = time + (follows() || monster.state === 'charge' ? 0.35 : 1.5);
      if (!monster.path.length && !follows() && monster.state !== 'charge') monster.target = null;
    }
    let goalX;
    let goalZ;
    if (monster.path.length) {
      goalX = world(monster.path[0][0]);
      goalZ = world(monster.path[0][1]);
      if (Math.hypot(goalX - monster.x, goalZ - monster.z) < 0.12) {
        monster.path.shift();
        if (!monster.path.length && !follows()) monster.target = null;
      }
    } else if (follows() || monster.state === 'charge') {
      // Auf derselben Kachel: direkt aufs Ziel
      goalX = monster.state === 'stalk' ? focus.x : monster.lastSeenX;
      goalZ = monster.state === 'stalk' ? focus.z : monster.lastSeenZ;
      if (monster.state === 'charge' && Math.hypot(goalX - monster.x, goalZ - monster.z) < 0.3) monster.target = null;
    }
    if (goalX === undefined) return 0;
    const dx = goalX - monster.x;
    const dz = goalZ - monster.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.001) return 0;
    const step = Math.min(len, speed * dt);
    monster.x += (dx / len) * step;
    monster.z += (dz / len) * step;
    monster.fx = dx / len;
    monster.fz = dz / len;
    return step;
  }

  function updateHunter(dt) {
    const sees = !!seeAny();
    if (sees) {
      monster.seenAt = time;
      monster.lastSeenX = focus.x;
      monster.lastSeenZ = focus.z;
      startChase();
    }
    if (time < monster.huntUntil && !focus.hidden) {
      monster.lastSeenX = focus.x;
      monster.lastSeenZ = focus.z;
      monster.seenAt = time;
    }
    if (monster.state === 'chase') {
      if (focus.hidden && focus.sawHide) {
        monster.target = [tileOf(focus.hidden.x), tileOf(focus.hidden.z)];
      } else if (time - monster.seenAt > 2.5) {
        monster.state = 'search';
        monster.target = [tileOf(monster.lastSeenX), tileOf(monster.lastSeenZ)];
        monster.searchUntil = time + 8;
        monster.path = [];
      } else {
        monster.target = [tileOf(monster.lastSeenX), tileOf(monster.lastSeenZ)];
      }
    } else if (monster.state === 'search' && time > monster.searchUntil) {
      monster.state = 'patrol';
      monster.target = null;
    }
    if (!monster.target) {
      if (monster.state === 'investigate') {
        monster.state = 'search';
        monster.searchUntil = time + 5;
      }
      if (monster.state === 'search') monster.target = randomTarget(true);
      if (monster.state === 'patrol') monster.target = randomTarget(rng() < 0.65);
      monster.path = [];
    }
    if (time < monster.freezeUntil) return 0;
    const SPEED = { patrol: 1.5, investigate: 2.5, chase: 3.45, search: 1.2 };
    const speed = (SPEED[monster.state] + (monster.state === 'chase' ? (player.inserted + player.fuses) * 0.08 : 0)) * HARD.speed;
    const d = focusDist();
    if (monster.state === 'chase' && sees && d < 3) {
      // Letzte Meter direkt auf den Spieler zu
      const step = Math.min(d, speed * dt);
      monster.fx = (focus.x - monster.x) / d;
      monster.fz = (focus.z - monster.z) / d;
      monster.x += monster.fx * step;
      monster.z += monster.fz * step;
      return step;
    }
    return moveAlongPath(speed, dt);
  }

  function updateListener(dt) {
    // Klicklaute verraten, wo es ist
    if (time > monster.nextEcho) {
      monster.nextEcho = time + (monster.state === 'charge' ? 0.7 : 1.6 + rng());
      mfx('echo', monster.x, monster.z);
    }
    // Ganz nah spürt es einen auch ohne Geräusch
    if (monster.state !== 'charge') {
      for (const t of targets()) {
        if (!t.hidden && Math.hypot(t.x - monster.x, t.z - monster.z) < 1.6) { focus = t; noise(2, t.x, t.z); break; }
      }
    }
    if (!monster.target) {
      if (monster.state === 'charge' || monster.state === 'investigate') {
        monster.state = 'search';
        monster.searchUntil = time + 3;
      } else if (monster.state === 'search' && time > monster.searchUntil) {
        monster.state = 'patrol';
      }
      if (monster.state === 'search') return 0; // horcht auf der Stelle
      monster.target = randomTarget(rng() < 0.6);
      monster.path = [];
    }
    const SPEED = { patrol: 1.2, investigate: 2.4, charge: 4.0 };
    return moveAlongPath((SPEED[monster.state] || 1.2) * HARD.speed, dt);
  }

  /**
   * Versetzt den Beobachter ungesehen hinter den Spieler (yaw zeigt nach -z; +sin/+cos liegt hinter einem).
   * Ist dahinter nichts frei (am Zaun, an der Hauswand), dann seitlich — und notfalls irgendwohin ohne Sichtlinie.
   */
  function relocateBehind(minR, maxR) {
    const spreads = [1.8, 3.6, 2 * Math.PI];
    for (let pass = 0; pass < spreads.length; pass++) {
      for (let tries = 0; tries < 60; tries++) {
        const a = focus.yaw + (rng() - 0.5) * spreads[pass];
        const r = minR + rng() * (maxR - minR);
        const tx = tileOf(focus.x + Math.sin(a) * r);
        const tz = tileOf(focus.z + Math.cos(a) * r);
        if (!isOpen(maze, tx, tz)) continue;
        // In den weiteren Durchgängen nur Plätze, die gerade keiner sehen kann
        if (pass > 0 && targets().some((t) => {
          if (!lineOfSight(t.x, t.z, world(tx), world(tz))) return false;
          const dx = world(tx) - t.x;
          const dz = world(tz) - t.z;
          return (dx * -Math.sin(t.yaw) + dz * -Math.cos(t.yaw)) / Math.hypot(dx, dz) > 0.2;
        })) continue;
        monster.x = world(tx);
        monster.z = world(tz);
        monster.path = [];
        return true;
      }
    }
    return false;
  }

  /**
   * Der Beobachter ist die meiste Zeit gar nicht da ('away'). Er taucht sporadisch auf, schleicht eine Weile
   * hinter einem her und verschwindet wieder — von selbst oder weil man ihn zu lange angestarrt hat.
   * So hat man nicht ständig Angst, und wenn er kommt, kommt er unerwartet.
   */
  function sendAway(minS, maxS) {
    monster.state = 'away';
    monster.awayUntil = time + minS + rng() * (maxS - minS);
    monster.x = -1000;
    monster.z = -1000;
    monster.path = [];
    monster.stare = 0;
    monster.seenByPlayer = false;
  }

  function updateWatcher(dt) {
    if (monster.state === 'away') {
      // Mit dem Schlüssel in der Tasche wird die Pause kürzer — der Rückweg ist die Zuspitzung
      if (player.hasKey && monster.awayUntil > time + 15) monster.awayUntil = time + 8 + rng() * 7;
      if (time < monster.awayUntil) return 0;
      // In der Gruppe sucht er sich einen aus — bevorzugt, wer allein unterwegs ist
      const ts = targets();
      if (!ts.length) return 0;
      focus = ts.length === 1 ? ts[0] : ts.reduce((best, t) => (loneliness(t) > loneliness(best) ? t : best), ts[0]);
      if (!relocateBehind(14, 20)) return 0; // nächstes Bild nochmal versuchen
      monster.state = 'stalk';
      monster.stalkUntil = time + (player.hasKey ? 60 : 40 + rng() * 25);
      return 0;
    }
    if (focus.alive === false) { const ts = targets(); if (ts.length) focus = ts[0]; }
    const seen = seenByAnyone();
    const d = focusDist();
    // Lange genug gelauert und gerade nicht im Blick: er zieht sich zurück
    if (!seen && time > monster.stalkUntil) {
      sendAway(30, 55);
      return 0;
    }
    if (seen) {
      if (!monster.seenByPlayer && d < 9 && time - monster.stingAt > 8) {
        monster.stingAt = time;
        mfx('stinger', monster.x, monster.z, focus);
      }
      monster.seenByPlayer = true;
      // Wer es lange genug anstarrt, verscheucht es: das Licht zuckt, es ist weg — und kommt erst nach einer
      // ganzen Weile wieder. Sonst könnte man es dauerhaft mit dem Blick festhalten. Zu mehreren dauert es länger.
      monster.stare += dt;
      if (monster.stare > HARD.stare) {
        mfx('staredAway', focus.x + Math.sin(focus.yaw) * 0.8, focus.z + Math.cos(focus.yaw) * 0.8, focus);
        sendAway(40, 70);
        if (!monster.staredAway) {
          monster.staredAway = true;
          say('Weg. Fürs Erste.', 3);
        }
      }
      return 0;
    }
    monster.seenByPlayer = false;
    monster.stare = Math.max(0, monster.stare - dt * 2);
    // Zu weit weg: ungesehen hinter den Spieler versetzen, damit der Druck bleibt
    if (d > 26) relocateBehind(13, 18);
    monster.state = 'stalk';
    monster.target = [tileOf(focus.x), tileOf(focus.z)];
    return moveAlongPath((player.hasKey ? 3.0 : 2.6) * HARD.speed, dt);
  }

  // ── Gärtner ─────────────────────────────────────────────────────────────
  /** Sieht der Gärtner dieses Ziel? Kurzsichtig: mit Licht 11 m, ohne 4,5 m; nach vorn, außer ganz nah. */
  function trackerSees(t = focus) {
    if (t.hidden || t.alive === false) return false;
    const d = Math.hypot(t.x - monster.x, t.z - monster.z);
    const range = (t.light ? 11 : 4.5) * HARD.sight;
    if (d > range) return false;
    if (d > 2.5 && monster.state !== 'chase') {
      const dot = ((t.x - monster.x) * monster.fx + (t.z - monster.z) * monster.fz) / d;
      if (dot < 0.2) return false;
    }
    return lineOfSight(monster.x, monster.z, t.x, t.z);
  }

  const crumbFresh = (c) => time - c.t < c.life;
  /** Jeder Spieler hinterlässt eine eigene Spur (o = Platz); der Gärtner folgt immer nur einer davon. */
  const onTrail = (c) => c.o === monster.trailOwner;

  /**
   * Zustände: roam (streift umher) → track (folgt der Spur, Krume für Krume, in der Reihenfolge, in der man
   * gelaufen ist) → chase (sieht einen) → search (Spur verloren) → roam. Lärm (Statuen) macht ihn hastig.
   */
  function updateTracker(dt) {
    if (time > monster.nextEcho) {
      monster.nextEcho = time + (monster.state === 'track' || monster.state === 'chase' ? 1.1 : 2.2) + rng() * 0.8;
      mfx('sniff', monster.x, monster.z);
    }
    const hunting = time < monster.huntUntil;
    const sp = (k) => TRACKER_SPEED[k] * HARD.speed;
    const seen = seeAny(trackerSees);
    if (seen) {
      monster.seenAt = time;
      monster.lastSeenX = seen.x;
      monster.lastSeenZ = seen.z;
      if (monster.state !== 'chase') {
        monster.state = 'chase';
        monster.freezeUntil = time + 0.6;
        mfx('stinger', monster.x, monster.z, seen);
      }
    }
    if (time < monster.freezeUntil) return 0;
    if (monster.state === 'chase') {
      if (time - monster.seenAt > 3 || focus.alive === false) {
        // Aus den Augen verloren: zurück auf die Spur dieses Spielers, ein paar Sekunden hinter ihm
        monster.state = 'track';
        monster.trailOwner = focus.seat ?? -1;
        const back = trail.findLast?.((c) => onTrail(c) && c.t < time - 4) || trail.find(onTrail);
        monster.trailT = back ? back.t - 0.01 : time;
        monster.path = [];
      } else {
        const d = focusDist();
        if (seen && d < 3) {
          const step = Math.min(d, sp('chase') * dt);
          monster.fx = (focus.x - monster.x) / d;
          monster.fz = (focus.z - monster.z) / d;
          monster.x += monster.fx * step;
          monster.z += monster.fz * step;
          return step;
        }
        monster.target = [tileOf(monster.lastSeenX), tileOf(monster.lastSeenZ)];
        return moveAlongPath(sp('chase'), dt);
      }
    }
    if (monster.state === 'roam' || monster.state === 'search' || monster.state === 'patrol') {
      // Witterung: frische Krume in der Nähe → auf die Spur (dessen, der sie gelegt hat)
      let found = null;
      for (const c of trail) if (crumbFresh(c) && Math.hypot(c.x - monster.x, c.z - monster.z) < 3) { found = c; break; }
      if (found) {
        monster.state = 'track';
        monster.trailOwner = found.o;
        monster.trailT = found.t - 0.01;
        monster.path = [];
      } else {
        if (monster.state === 'patrol') monster.state = 'roam';
        if (monster.state === 'search' && time > monster.searchUntil) monster.state = 'roam';
        if (!monster.target) {
          // Suche: in der Nähe der Stelle, wo die Spur abriss; sonst irgendwo (oft grob in Richtung eines Spielers)
          const ts = targets();
          if (ts.length) focus = ts[Math.floor(rng() * ts.length)];
          monster.target = monster.state === 'search' ? nearTile(monster.x, monster.z, 4) : randomTarget(rng() < 0.4);
          monster.path = [];
        }
        return moveAlongPath(hunting ? sp('track') : sp(monster.state), dt);
      }
    }
    // track: nächste noch frische Krume dieser Spur nach trailT
    let next = null;
    for (const c of trail) if (onTrail(c) && c.t > monster.trailT && crumbFresh(c)) { next = c; break; }
    const owner = targetBySeat(monster.trailOwner);
    if (owner) focus = owner;
    if (!next) {
      // Ende der Spur: der Spieler steht ganz nah (eingeholt) — oder die Spur ist verflogen
      if (owner && focusDist() < 4 && lineOfSight(monster.x, monster.z, focus.x, focus.z)) {
        monster.state = 'chase';
        monster.seenAt = time;
        monster.lastSeenX = focus.x;
        monster.lastSeenZ = focus.z;
      } else {
        monster.state = 'search';
        monster.searchUntil = time + 6;
        monster.target = null;
      }
      return 0;
    }
    const speed = hunting ? sp('hunt') : sp('track');
    const dx = next.x - monster.x;
    const dz = next.z - monster.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 3.5) {
      // Lücke in der Spur (verflogen oder weit weg): auf dem Raster zur Krume laufen
      monster.target = [tileOf(next.x), tileOf(next.z)];
      const moved = moveAlongPath(speed, dt);
      if (!monster.path.length && tileOf(monster.x) === tileOf(next.x) && tileOf(monster.z) === tileOf(next.z)) monster.trailT = next.t;
      return moved;
    }
    monster.target = null;
    const step = Math.min(dist, speed * dt);
    if (dist > 1e-4) {
      monster.fx = dx / dist;
      monster.fz = dz / dist;
      monster.x += monster.fx * step;
      monster.z += monster.fz * step;
    }
    if (dist - step < 0.2) monster.trailT = next.t;
    return step;
  }

  /** Zufällige freie Kachel im Umkreis r (Kacheln) um eine Weltposition. */
  function nearTile(x, z, r) {
    for (let tries = 0; tries < 60; tries++) {
      const tx = tileOf(x) + Math.round((rng() - 0.5) * 2 * r);
      const tz = tileOf(z) + Math.round((rng() - 0.5) * 2 * r);
      if (isOpen(maze, tx, tz) && !maze.blocked?.has(tz * size + tx)) return [tx, tz];
    }
    return [tileOf(x), tileOf(z)];
  }

  function updateMonster(dt) {
    monster.speed = 0;
    // Koop, nicht Host: das Monster nur nach dem Stand des Hosts bewegen (geglättet) — Schritte selbst hören
    if (coop && !isHost) {
      if (monster.tx === undefined) return;
      const ox = monster.x;
      const oz = monster.z;
      const k = Math.min(1, dt * 10);
      monster.x += (monster.tx - ox) * k;
      monster.z += (monster.tz - oz) * k;
      const moved = Math.hypot(monster.x - ox, monster.z - oz);
      monster.speed = monster.netSpeed ?? moved / Math.max(dt, 1e-4);
      monsterSteps(moved);
      return;
    }
    if (monster.state === 'dormant') {
      if (time > DORMANT) {
        // Der Beobachter lässt einen am Anfang erst eine Weile in Ruhe (zusammen ~45–70 s)
        if (monster.kind === 'watcher') sendAway(33 * HARD.dormant, 58 * HARD.dormant);
        else monster.state = monster.kind === 'tracker' ? 'roam' : 'patrol';
      }
      return;
    }
    if (monster.state === 'away') {
      updateWatcher(dt);
      return;
    }
    if (focus !== player && !targets().includes(focus)) focus = targets()[0] || player;
    let moved;
    if (monster.kind === 'hunter') moved = updateHunter(dt);
    else if (monster.kind === 'listener') moved = updateListener(dt);
    else if (monster.kind === 'tracker') moved = updateTracker(dt);
    else moved = updateWatcher(dt);
    monster.speed = moved / Math.max(dt, 1e-4);   // für die Laufanimation der 3D-Figur
    monsterSteps(moved);
    if (monster.kind === 'hunter' && time > monster.nextGrowl && targets().some((t) => Math.hypot(t.x - monster.x, t.z - monster.z) < 18)) {
      monster.nextGrowl = time + 7 + rng() * 9;
      mfx('growl', monster.x, monster.z);
    }

    // Erwischt — jeden, der in Reichweite ist (allein: nur einen selbst). Im Spind nur, wer beim Hineinsteigen gesehen wurde.
    for (const t of targets()) {
      if (t.hidden) {
        if (t.sawHide && Math.hypot(t.hidden.x - monster.x, t.hidden.z - monster.z) < 1.4) catchTarget(t);
      } else if (Math.hypot(t.x - monster.x, t.z - monster.z) < (monster.kind === 'watcher' ? 1.1 : CATCH_DIST)) catchTarget(t);
    }
  }

  /** Schritte: Beobachter knackt mit Ästen, Lauscher schlurft leise, Jäger stampft. */
  function monsterSteps(moved) {
    monster.stepDist += moved;
    const stride = monster.kind === 'watcher' ? 1.3 : monster.state === 'chase' || monster.state === 'charge' ? 1.1 : 1.5;
    if (monster.stepDist > stride) {
      monster.stepDist = 0;
      if (monster.kind === 'watcher') audio?.twig(monster.x, 0.2, monster.z);
      else audio?.monsterStep(monster.x, 0.2, monster.z, monster.kind === 'listener' ? 0.45 : monster.state === 'chase' ? 1.4 : 0.8);
    }
  }

  function caught() {
    if (ended || !player.alive) return;
    audio?.scream(softScares);
    // Kamera reißt zum Monster herum
    player.yaw = yawTo(monster.x - player.x, monster.z - player.z);
    player.pitch = 0.12;
    cb.onScare?.({ soft: softScares, monster: monster.kind });
    if (coop) {
      // Koop: man ist raus und schaut den anderen zu, bis sie es schaffen — oder alle erwischt sind
      player.alive = false;
      player.light = false;
      player.hidden = null;
      if (isHost) sendEvent({ type: 'caught', s: player.seat });
      setTimeout(() => {
        if (disposed || ended) return;
        cb.onScare?.(null);
        nextSpectate();
        say(spectate !== null ? 'Erwischt. Du schaust zu — Leertaste wechselt.' : 'Erwischt.', 5);
      }, softScares ? 900 : 1500);
      checkWipe();
      return;
    }
    ended = true;
    audio?.setChase(0);
    setTimeout(() => {
      if (document.pointerLockElement === canvasEl) document.exitPointerLock();
      cb.onEnd?.({ result: 'caught', time, level: levelIndex, seed });
    }, softScares ? 900 : 1500);
  }

  function win() {
    if (ended) return;
    ended = true;
    audio?.setChase(0);
    if (!isLast) {
      // Direkter Übergang: Tür bzw. Treppe hören, die Stimmung blendet aus, die nächste Ebene bringt ihre eigene
      // Wald: Haustür, Anstalt: Treppe nach unten, Keller: Notausgangstür in den Garten
      audio?.transition(forest || cellar ? 'door' : 'stairs');
      audio?.stopAmbience();
    }
    setTimeout(() => {
      // Zeigersperre nur am Ende des Spiels lösen — zwischen den Ebenen bleibt sie, kein neuer Klick nötig
      if (isLast && document.pointerLockElement === canvasEl) document.exitPointerLock();
      cb.onEnd?.({ result: 'escaped', time, level: levelIndex, seed });
    }, forest ? 500 : 0);
  }

  // ── Regie ───────────────────────────────────────────────────────────────
  function director() {
    // Hintergrund: Tropfen im Keller, Eulen im Wald
    if (time > nextAmbient) {
      const a = rng() * Math.PI * 2;
      const r = 4 + rng() * 10;
      if (cellar) {
        audio?.drip(player.x + Math.cos(a) * r, 2.5, player.z + Math.sin(a) * r);
        nextAmbient = time + 1.5 + rng() * 3;
      } else if (outdoor) {
        audio?.owl(player.x + Math.cos(a) * 20, 8, player.z + Math.sin(a) * 20);
        nextAmbient = time + 20 + rng() * 25;
      } else nextAmbient = Infinity;
    }
    if (monster.state === 'chase' || monster.state === 'charge' || player.hidden || time < 30) return;
    if (time - lastScare < 32 + rng() * 20) return;
    if (distTo(monster.x, monster.z) < 12) return;
    lastScare = time;
    const fx = -Math.sin(player.yaw);
    const fz = -Math.cos(player.yaw);
    const roll = rng();
    if (halls && roll < 0.3) {
      // Gestalt am Gangende — nur, wenn dort wirklich freie Sicht ist
      for (let dist = 13; dist >= 7; dist -= 1) {
        const x = player.x + fx * dist;
        const z = player.z + fz * dist;
        if (solid(tileOf(x), tileOf(z)) || !lineOfSight(player.x, player.z, x, z)) continue;
        phantom.position.set(x, 0, z);
        phantom.visible = true;
        glimpseUntil = time + 0.7;
        audio?.growl(x, 1.6, z);
        return;
      }
    }
    if (roll < 0.5) {
      flickerUntil = time + 1.4;
      audio?.buzz(1.4);
    } else if (roll < 0.75 && !outdoor) {
      // Schritte direkt hinter einem (draußen nicht: dort sind Geräusche hinter einem echt)
      for (let i = 0; i < 3; i++) {
        setTimeout(() => {
          if (!ended) audio?.monsterStep(player.x - fx * (4 - i), 0.2, player.z - fz * (4 - i), 0.9);
        }, i * 520);
      }
    } else if (roll < 0.9) {
      const a = rng() * Math.PI * 2;
      audio?.bang(player.x + Math.cos(a) * 12, 1.5, player.z + Math.sin(a) * 12);
    } else {
      audio?.whisper(player.x - fx * 0.6, EYE, player.z - fz * 0.6);
    }
  }

  // ── Koop: Netz ──────────────────────────────────────────────────────────
  const STATES = ['dormant', 'patrol', 'investigate', 'chase', 'search', 'charge', 'away', 'stalk', 'roam', 'track'];
  const r2 = (v) => Math.round(v * 100) / 100;
  let netStateAt = 0;
  let netWorldAt = 0;
  let noiseSentAt = 0;
  let wiped = false;
  let spectate = null; // Platz des Mitspielers, dem man nach dem Erwischtwerden zuschaut

  /**
   * Laute des Monsters, die die KI auslöst: beim Host abspielen und an alle schicken (die anderen rechnen keine KI).
   * who = Ziel (Stinger erschreckt nur den Gemeinten bzw. wer nah dran ist).
   */
  function mfx(kind, x, z, who = null) {
    if (coop && !isHost) return;
    playFx(kind, x, z, who === null || who === player);
    if (coop) net.send('event', { type: 'sfx', k: kind, x: r2(x), z: r2(z), s: who ? who.seat : -2 });
  }
  function playFx(kind, x, z, mine) {
    if (kind === 'echo') audio?.echo(x, 1.4, z);
    else if (kind === 'sniff') audio?.sniff(x, 1.7, z);
    else if (kind === 'growl') audio?.growl(x, 1.8, z);
    else if (kind === 'stinger') {
      if (!mine && Math.hypot(x - camera.position.x, z - camera.position.z) > 12) return;
      audio?.stinger();
      shake = Math.max(shake, softScares ? 0.1 : 0.3);
    } else if (kind === 'staredAway' && mine) {
      flickerUntil = time + 0.4;
      audio?.buzz(0.4);
      audio?.whisper(x, EYE, z);
    }
  }

  /** Eigene Lage (~12×/s) und — als Host — Monster + geteilter Stand (~10×/s) verschicken. */
  function netSend(now) {
    if (!coop) return;
    if (now > netStateAt) {
      netStateAt = now + 80;
      const f = (player.lightOn ? 1 : 0) | (player.hidden ? 2 : 0) | (keys.has('c') ? 4 : 0) | (player.alive ? 8 : 0)
        | (playerSeesMonster() ? 16 : 0) | (player.moving ? 32 : 0) | (player.sprinting ? 64 : 0);
      net.send('state', { r: net.round, x: r2(player.x), z: r2(player.z), yaw: r2(player.yaw), pitch: r2(player.pitch), sp: r2(player.netSpeed || 0), f });
    }
    if (isHost && now > netWorldAt) {
      netWorldAt = now + 100;
      let taken = 0;
      items.forEach((it, i) => { if (it.taken) taken |= 1 << i; });
      let vd = 0;
      valves.forEach((v, i) => { if (v.done) vd |= 1 << i; });
      net.send('world', {
        r: net.round,
        m: [r2(monster.x), r2(monster.z), r2(monster.fx), r2(monster.fz), STATES.indexOf(monster.state), r2(monster.speed || 0), monster.seenByPlayer ? 1 : 0],
        g: [taken, player.inserted, vd, player.hasKey ? 1 : 0, codeLock?.open ? 1 : 0],
      });
    }
  }

  /** Stand vom Host übernehmen (nur wer nicht Host ist). Geteilter Stand nur vorwärts — nie zurückdrehen. */
  function applyWorld(w) {
    if (isHost || !w || w.r !== net.round || !Array.isArray(w.m)) return;
    const [mx, mz, fx, fz, st, sp, seen] = w.m;
    const first = monster.tx === undefined;
    monster.tx = mx;
    monster.tz = mz;
    if (first || Math.hypot(mx - monster.x, mz - monster.z) > 6) { monster.x = mx; monster.z = mz; }
    monster.fx = fx;
    monster.fz = fz;
    monster.state = STATES[st] || monster.state;
    monster.netSpeed = sp;
    monster.seenByPlayer = !!seen;
    const [taken, ins, vd, key, code] = Array.isArray(w.g) ? w.g : [];
    items.forEach((it, i) => { if ((taken >> i) & 1 && !it.taken) takeItem(it, -1); });
    while (player.inserted < Math.min(ins || 0, NEED)) insertFuse(-1);
    valves.forEach((v, i) => { if ((vd >> i) & 1 && !v.done) valveDone(v, -1); });
    if (key && !player.hasKey) { player.hasKey = true; phase = 'deliver'; }
    if (code && codeLock && !codeLock.open) openCode(-1);
  }

  function applyPeer(p) {
    const peer = peers.get(p.seat);
    if (!peer || p.r !== net.round) return;
    if (peer.tx === undefined) { peer.x = p.x; peer.z = p.z; peer.yaw = p.yaw; }
    peer.tx = p.x;
    peer.tz = p.z;
    peer.tyaw = p.yaw;
    peer.tpitch = p.pitch;
    peer.netSpeed = p.sp;
    const f = p.f | 0;
    peer.lightOn = !!(f & 1);
    peer.light = peer.lightOn;
    const hidden = !!(f & 2);
    if (hidden && !peer.hidden) {
      // Hat das Monster ihn beim Hineinsteigen gesehen? (wie beim eigenen Spieler)
      peer.sawHide = isHost && monster.kind === 'hunter' && canSee({ ...peer, hidden: null })
        && Math.hypot(peer.x - monster.x, peer.z - monster.z) < 7;
      peer.hidden = { x: p.x, z: p.z };
    } else if (!hidden) peer.hidden = null;
    peer.sneak = !!(f & 4);
    peer.sees = !!(f & 16);
    peer.moving = !!(f & 32);
    if (!(f & 8)) peer.alive = false;
    peer.connected = true;
  }

  function applyEvent(e) {
    if (!e || ended && e.type !== 'escaped') return;
    const by = e.seat;
    switch (e.type) {
      case 'take': if (items[e.i]) takeItem(items[e.i], by); break;
      case 'insert': insertFuse(by); break;
      case 'valve': if (valves[e.i]) valveDone(valves[e.i], by); break;
      case 'statue': if (puzzleStatues[e.i]) turnStatue(puzzleStatues[e.i], by); break;
      case 'code': if (codeLock) openCode(by); break;
      case 'carving': if (carvings[e.i]) carvings[e.i].read = true; break;
      case 'noise':
        if (!isHost) break;
        if (e.lure && (monster.state === 'away' || monster.state === 'dormant')) { monster.state = 'away'; monster.awayUntil = time; }
        else if (!e.lure) noise(Number(e.r) || 0, Number(e.x) || 0, Number(e.z) || 0);
        break;
      case 'crumb':
        if (isHost && garden) {
          trail.push({ x: Number(e.x) || 0, z: Number(e.z) || 0, t: time, life: Math.min(TRAIL_LIFE, Number(e.l) || TRAIL_LIFE), o: by });
          while (trail.length > 900 || (trail.length && time - trail[0].t > TRAIL_LIFE)) trail.shift();
        }
        break;
      case 'caught':
        if (e.s === player.seat) caught();
        else if (peers.get(e.s)?.alive) {
          peers.get(e.s).alive = false;
          say(`${peerName(e.s)} wurde erwischt.`, 4);
          if (spectate === e.s) nextSpectate();
        }
        break;
      case 'escaped':
        if (!ended) { say(`${peerName(by)} ist durch!`, 2); win(); }
        break;
      case 'wipe': wipe(); break;
      case 'sfx': playFx(e.k, Number(e.x) || 0, Number(e.z) || 0, e.s === player.seat); break;
      default: break;
    }
  }

  /** Der Host hat gewechselt (der alte ist weg). Wer jetzt Host ist, rechnet ab sofort das Monster. */
  function setHost(v) {
    if (v === isHost) return;
    isHost = v;
    if (v) {
      if (monster.tx !== undefined) { monster.x = monster.tx; monster.z = monster.tz; }
      monster.path = [];
      monster.target = null;
      focus = targets()[0] || player;
      checkWipe();
    }
  }

  function peerLeft(seat) {
    const p = peers.get(seat);
    if (!p) return;
    p.connected = false;
    say(`${p.name} hat das Spiel verlassen.`, 3);
    if (spectate === seat) nextSpectate();
    if (focus === p) focus = targets()[0] || player;
    checkWipe();
  }

  /** Mitspieler glätten und zeichnen: Figur, Lampe, Schritte. */
  function updatePeers(dt) {
    const k = Math.min(1, dt * 12);
    for (const p of peers.values()) {
      const ox = p.x;
      const oz = p.z;
      if (p.tx !== undefined) {
        p.x += (p.tx - p.x) * k;
        p.z += (p.tz - p.z) * k;
        let dy = p.tyaw - p.yaw;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        p.yaw += dy * k;
        p.pitch += (p.tpitch - p.pitch) * k;
      }
      const show = p.alive && p.connected && !p.hidden && p.tx !== undefined;
      const dCam = Math.hypot(p.x - camera.position.x, p.z - camera.position.z);
      if (p.avatar) {
        p.avatar.group.visible = show && dCam < camera.far && !(spectate === p.seat && !player.alive);
        p.avatar.group.position.set(p.x, 0, p.z);
        p.avatar.group.rotation.y = p.yaw + Math.PI;
        p.avatar.update(dt, { speed: p.netSpeed || 0 });
      }
      const on = show && p.lightOn;
      const hx = p.x + Math.cos(p.yaw) * 0.22;
      const hz = p.z - Math.sin(p.yaw) * 0.22;
      p.spot.intensity = on ? 18 : 0;
      p.spot.position.set(hx, 1.4, hz);
      const cp = Math.cos(p.pitch);
      p.spot.target.position.set(hx - Math.sin(p.yaw) * cp * 4, 1.4 + Math.sin(p.pitch) * 4 - 0.3, hz - Math.cos(p.yaw) * cp * 4);
      p.beam.visible = on && !(spectate === p.seat && !player.alive);
      p.beam.position.set(hx, 1.4, hz);
      p.lens.visible = p.beam.visible;
      p.lens.position.set(hx - Math.sin(p.yaw) * 0.12, 1.4 + Math.sin(p.pitch) * 0.12, hz - Math.cos(p.yaw) * 0.12);
      p.beam.rotation.set(p.pitch - 0.07, p.yaw, 0);
      // Schritte der anderen leise hören (wer schleicht, ist still)
      if (show && p.moving) {
        p.stride += Math.hypot(p.x - ox, p.z - oz);
        if (p.stride > 1.7) {
          p.stride = 0;
          if (!p.sneak && dCam > 0.5) audio?.monsterStep(p.x, 0.1, p.z, 0.28);
        }
      }
    }
  }

  /** Nach dem Erwischtwerden: den nächsten lebenden Mitspieler beobachten (Leertaste wechselt). */
  function nextSpectate() {
    const alive = [...peers.values()].filter((p) => p.alive && p.connected);
    if (!alive.length) { spectate = null; return; }
    const i = alive.findIndex((p) => p.seat === spectate);
    spectate = alive[(i + 1) % alive.length].seat;
  }

  /** Host: Monster hat jemanden erwischt. */
  function catchTarget(t) {
    if (t === player) caught();
    else if (t.alive) {
      t.alive = false;
      sendEvent({ type: 'caught', s: t.seat });
      say(`${t.name} wurde erwischt.`, 4);
      if (spectate === t.seat) nextSpectate();
    }
    if (!coop) return;
    // Kurz ablassen — sonst erwischt es den Nächsten gleich mit
    monster.freezeUntil = time + 2.5;
    if (monster.kind === 'watcher') sendAway(20, 35);
    else {
      monster.state = 'search';
      monster.searchUntil = time + 4;
      monster.target = null;
      monster.path = [];
    }
    focus = targets()[0] || player;
    checkWipe();
  }

  /** Host: alle erwischt → Runde vorbei (der Host startet die Ebene danach neu, siehe LightsOut.jsx). */
  function checkWipe() {
    if (!coop || !isHost || wiped || ended) return;
    if (targets().length) return;
    wiped = true;
    sendEvent({ type: 'wipe' });
    wipe();
  }

  function wipe() {
    if (ended) return;
    ended = true;
    audio?.setChase(0);
    setTimeout(() => {
      if (disposed) return;
      cb.onScare?.(null);
      cb.onEnd?.({ result: 'wiped', time, level: levelIndex, seed });
    }, 2200);
  }

  /** Selbst durch den Ausgang: alle schaffen die Ebene. */
  function escaped() {
    sendEvent({ type: 'escaped' });
    win();
  }

  // ── Anfahrt im Auto ─────────────────────────────────────────────────────
  // 0–6 s: Fahrt auf dem Schotterweg (Scheinwerfer, Motor), 6–7.6 s: anhalten, Blick zum Tor,
  // 7.6 s: Tür zu, 8 s: abblenden, 8.6 s: man steht am Tor, Tor quietscht, 9.2 s: aufblenden, los.
  const introActive = () => intro && intro.t < INTRO_END;
  const easeOut = (x) => 1 - (1 - x) * (1 - x);
  let introHudAt = 0;
  function updateIntro(dt) {
    intro.t += dt;
    const t = intro.t;
    const car = forestView.car;
    const s = easeOut(Math.min(t / 6, 1));
    car.position.x = forestView.parkX + 45 * (1 - s);
    if (!intro.engine && t < 6) intro.engine = audio?.engine() || 'none';
    if (intro.engine && intro.engine !== 'off' && intro.engine !== 'none') {
      intro.engine.set(t < 6 ? 0.15 + 0.6 * (1 - s) : 0.08);
      if (t > 6.2) { intro.engine.stop(); intro.engine = 'off'; }
    }
    if (t > 7.6 && !intro.slammed) { intro.slammed = true; audio?.doorSlam(); }
    if (t > 8.0 && !intro.faded) {
      intro.faded = true;
      cb.onFade?.(true);
      // Ab hier steht man am Tor: Scheinwerfer aus (zwei Lichter weniger in jedem Pixel) und unter dem
      // schwarzen Bild für die neue Lichterzahl vorwärmen
      forestView.headlights.forEach((h) => { h.visible = false; });
      warm();
    }
    if (t > 8.7 && !intro.creaked) { intro.creaked = true; audio?.gateCreak(); }
    if (t >= INTRO_END) {
      if (intro.engine && intro.engine !== 'off' && intro.engine !== 'none') intro.engine.stop();
      cb.onFade?.(false);
      audio?.startAmbience(level.theme);
      message = { text: level.title, until: time + 4 };
    }
    if (t > introHudAt) {
      introHudAt = t + 0.25;
      cb.onHud?.({ cinematic: true });
    }
  }

  /** Kamera im Auto: Fahrersitz links (Fahrtrichtung -x, links = +z), am Ende Blick zum Tor. */
  function introCamera() {
    const t = intro.t;
    const car = forestView.car;
    camera.position.set(car.position.x - 0.35, 1.5 + Math.sin(t * 9) * 0.006, car.position.z + 0.42);
    const turn = clamp((t - 6.6) / 1, 0, 1);
    const yaw = Math.PI / 2 * (1 - easeOut(turn));
    camera.rotation.set(-0.06, yaw, 0);
  }

  // ── Schleife ────────────────────────────────────────────────────────────
  function update(dt) {
    if (introActive()) {
      updateIntro(dt);
      return;
    }
    time += dt;
    const px0 = player.x;
    const pz0 = player.z;

    // Bewegung (wer erwischt wurde, schaut nur noch zu)
    if (!player.alive) { player.moving = false; player.sprinting = false; }
    if (!player.hidden && player.alive) {
      let mx = 0;
      let mz = 0;
      if (keys.has('w') || keys.has('arrowup')) mz -= 1;
      if (keys.has('s') || keys.has('arrowdown')) mz += 1;
      if (keys.has('a') || keys.has('arrowleft')) mx -= 1;
      if (keys.has('d') || keys.has('arrowright')) mx += 1;
      const moving = mx !== 0 || mz !== 0;
      const sneaking = keys.has('c');
      const wantSprint = keys.has('shift') && !sneaking && moving && mz < 0 && !player.exhausted;
      player.moving = moving;
      player.sprinting = wantSprint;
      if (wantSprint) {
        player.stamina = Math.max(0, player.stamina - STAMINA_DRAIN * dt);
        player.staminaPause = 1.2;
        if (player.stamina <= 0) player.exhausted = true;
      } else {
        player.staminaPause -= dt;
        if (player.staminaPause <= 0) player.stamina = Math.min(100, player.stamina + STAMINA_REGEN * dt);
        if (player.exhausted && player.stamina > 35) player.exhausted = false;
      }
      if (player.exhausted && time > breathAt) {
        breathAt = time + 1.4;
        audio?.breath();
        noise(3);
      }
      if (moving) {
        const len = Math.hypot(mx, mz);
        const sp = (wantSprint ? SPRINT : sneaking ? SNEAK : WALK) * dt;
        const sin = Math.sin(player.yaw);
        const cos = Math.cos(player.yaw);
        const vx = ((mx * cos + mz * sin) / len) * sp;
        const vz = ((-mx * sin + mz * cos) / len) * sp;
        [player.x, player.z] = collide(player.x + vx, player.z + vz);
        // Duftspur für den Gärtner: alle TRAIL_STEP Meter eine Krume (beim Schleichen verfliegt sie schneller)
        if (garden) {
          if (!myCrumb || Math.hypot(player.x - myCrumb.x, player.z - myCrumb.z) > TRAIL_STEP) {
            const life = sneaking ? TRAIL_LIFE_SNEAK : TRAIL_LIFE;
            myCrumb = { x: player.x, z: player.z, t: time, life, o: player.seat };
            trail.push(myCrumb);
            while (trail.length > 900 || (trail.length && time - trail[0].t > TRAIL_LIFE)) trail.shift();
            if (coop && !isHost) sendEvent({ type: 'crumb', x: r2(player.x), z: r2(player.z), l: life });
          }
        }
        player.stride += sp;
        player.bob += sp * (wantSprint ? 3.4 : sneaking ? 2.2 : 3);
        const strideLen = wantSprint ? 2.2 : sneaking ? 1.1 : 1.7;
        if (player.stride > strideLen) {
          player.stride = 0;
          if (!sneaking) audio?.footstep(wantSprint);
          noise(wantSprint ? theme.noise.sprint : sneaking ? theme.noise.sneak : theme.noise.walk);
        }
        // Glas: knirscht beim Betreten und dann alle paar Zentimeter — auch beim Schleichen hörbar,
        // beim Rennen durch den halben Keller. (Am normalen Schritt hängen reichte nicht: der ist länger als eine Glasfläche.)
        if (cellar && onShards()) {
          glassStride += sp;
          if (glassStride > 0.45) {
            glassStride = 0;
            audio?.crunch(sneaking ? 0.5 : 1);
            noise(wantSprint ? 20 : sneaking ? 6 : 12);
            if (!shardWarned) {
              shardWarned = true;
              say('Glas. Es knirscht unter deinen Füßen.', 3);
            }
          }
        } else glassStride = 1;
      }
    }
    // Tempo für die Laufanimation der eigenen Figur bei den anderen (geglättet)
    player.netSpeed = (player.netSpeed || 0) * 0.8 + (Math.hypot(player.x - px0, player.z - pz0) / Math.max(dt, 1e-4)) * 0.2;

    // Licht und Augen
    if (player.light) {
      player.battery = Math.max(0, player.battery - BATTERY_DRAIN * dt);
      if (player.battery <= 0) {
        player.light = false;
        audio?.click();
        say('Der Akku ist leer.', 3);
      }
    }
    // Ohne Licht gewöhnen sich die Augen in ~2 s an die Dunkelheit, mit Licht ist das sofort weg
    player.adapt = player.light ? Math.max(0, player.adapt - dt * 3) : Math.min(1, player.adapt + dt * 0.5);
    let lightOn = player.light;
    if (time < flickerUntil || (player.light && player.battery < 15 && Math.random() < 0.04)) {
      lightOn = player.light && Math.random() < 0.45;
    }
    const md = distTo(monster.x, monster.z);
    if (monster.state !== 'dormant' && monster.kind === 'hunter' && md < 5 && Math.random() < (5 - md) * 0.05) lightOn = false;
    const level01 = player.battery < 25 ? 0.55 + player.battery / 55 : 1;
    player.lightOn = lightOn;
    player.level01 = level01;
    flash.intensity = lightOn ? 26 * level01 : 0;
    spill.intensity = lightOn ? 0.6 * level01 : 0;
    if (!(halls && phase === 'escape')) {
      hemi.intensity = theme.hemi[2] + player.adapt * theme.adapt;
      scene.fog.density = theme.fog * (1 - player.adapt * 0.35);
    }

    // Interaktion: E drücken bzw. halten
    const target = findInteract();
    if (ePressed) {
      ePressed = false;
      if (target && !target.hold && target.kind !== 'info') interact(target);
    }
    if (target?.hold && keys.has('e')) {
      if (target.kind === 'box') {
        player.hold += dt / 1.1;
        if (player.hold >= 1) { player.hold = 0; insertFuse(); }
      } else if (target.kind === 'valve') {
        const v = target.valve;
        v.progress += dt / 2.4;
        player.hold = v.progress;
        v.wheel.rotation.z -= dt * 2.5;
        if (time > v.squeakAt) {
          v.squeakAt = time + 0.6;
          audio?.squeak(v.pos.x, v.pos.y, v.pos.z);
          noise(12, v.pos.x, v.pos.z);
        }
        if (v.progress >= 1) { player.hold = 0; valveDone(v); }
      } else if (target.kind === 'statue') {
        const s = target.statue;
        player.hold += dt / STATUE_TURN;
        if (time > (s.grindAt || 0)) {
          s.grindAt = time + 0.4;
          audio?.grind(s.x, 0.6, s.z);
          noise(22, s.x, s.z);
        }
        if (player.hold >= 1) { player.hold = 0; turnStatue(s); }
      }
    } else if (target?.kind === 'valve') {
      // Ein halb aufgedrehtes Ventil bleibt halb offen
      player.hold = target.valve.progress;
    } else player.hold = 0;
    // Vom Zahlenschloss weggegangen bzw. weggeschaut: Eingabe beenden
    if (codeLock?.active && target?.kind !== 'code') {
      codeLock.active = false;
      codeLock.entered = '';
    }

    updateMonster(dt);
    flicker?.update(time, dt, camera.position, monster.state === 'dormant' || monster.state === 'away' ? null : monster);
    if (ended) return;
    director();

    // Orientierung per Gehör
    for (const it of items) {
      if (it.taken || it.kind === 'battery') continue;
      it.nextSound -= dt;
      if (it.nextSound <= 0) {
        it.nextSound = 2.6 + Math.random() * 2;
        if (it.kind === 'key') audio?.jingle(it.mesh.position.x, 0.2, it.mesh.position.z);
        else audio?.crackle(it.mesh.position.x, 0.2, it.mesh.position.z);
      }
    }
    if (halls && phase === 'deliver' && time > nextBeep) {
      nextBeep = time + 1.6;
      audio?.beep(boxPos.x, boxPos.y, boxPos.z);
    }
    if (halls && player.fuses > 0 && phase === 'collect' && time > nextBeep) {
      nextBeep = time + 1.6;
      audio?.beep(boxPos.x, boxPos.y, boxPos.z);
    }
    if (phase === 'escape') {
      if (halls && time > nextAlarm) { nextAlarm = time + 2.2; audio?.alarm(); }
      if (halls) {
        const pulse = 0.5 + 0.5 * Math.sin(time * 4);
        hemi.color.setRGB(1, 0.15, 0.1);
        hemi.intensity = 0.05 + pulse * 0.25;
      }
      exitLight.intensity = Math.min(8, exitLight.intensity + dt * 4);
      doorMesh.position.y = Math.min(doorBase.y + doorH * 0.95, doorMesh.position.y + dt * 1.2);
      // Durchs Tor = geschafft (zu mehreren: für alle)
      if (player.alive && tileOf(player.x) === door[0] && tileOf(player.z) === door[1]) escaped();
    }

    // Angst → Herzschlag, Verfolgung → Dröhnen
    let fear = monster.state === 'dormant' || monster.state === 'away' ? 0 : clamp(1 - md / 16, 0, 1);
    if (monster.state === 'chase' || monster.state === 'charge') fear = Math.max(fear, 0.7);
    audio?.heartbeat(fear);
    audio?.setChase(monster.state === 'chase' || monster.state === 'charge' ? 1 : 0);

    if (glimpseUntil && time > glimpseUntil) { phantom.visible = false; glimpseUntil = 0; }

    netSend(performance.now());

    // HUD gedrosselt
    if (time > hudAt) {
      hudAt = time + 0.1;
      const [goal, sub] = goalText();
      cb.onHud?.({
        battery: player.battery, stamina: player.stamina, exhausted: player.exhausted, light: player.light,
        goal, sub, prompt: target ? target.label : '', hidden: !!player.hidden, hold: player.hold,
        message: time < message.until ? message.text : '', time, fear, sneaking: keys.has('c'),
        code: codeLock ? { order: codeLock.order, entered: codeLock.entered, active: codeLock.active, open: codeLock.open } : null,
        notes: carvings.filter((c) => c.read).map((c) => ({ id: c.id, digit: c.digit })),
        team: coop
          ? [{ name: 'Du', alive: player.alive }, ...[...peers.values()].map((p) => ({ name: p.name, alive: p.alive && p.connected, left: !p.connected }))]
          : null,
        spectating: coop && !player.alive ? (spectate !== null ? peerName(spectate) : '—') : '',
      });
    }
  }

  function render() {
    // Im Auto (bis man am Tor steht) sieht man durch die Windschutzscheibe, ohne Taschenlampe
    const inCar = introActive() && intro.t < 8.6;
    if (inCar) {
      introCamera();
      flash.intensity = 0;
      spill.intensity = 0;
    } else if (coop && !player.alive && spectate !== null && peers.get(spectate)) {
      // Zuschauen: aus den Augen des Mitspielers (seine Lampe ist ein echtes Licht an seinem Kopf)
      const p = peers.get(spectate);
      camera.position.set(p.x, EYE - (p.sneak ? 0.35 : 0), p.z);
      camera.rotation.set(p.pitch, p.yaw, 0);
      flash.intensity = 0;
      spill.intensity = 0;
    } else {
      const sneaking = keys.has('c') && !player.hidden;
      const bobY = player.hidden ? 0 : Math.sin(player.bob) * (sneaking ? 0.02 : 0.045);
      const bobX = player.hidden ? 0 : Math.cos(player.bob * 0.5) * 0.03;
      const eye = EYE - (sneaking ? 0.35 : 0) - (player.hidden ? 0.05 : 0);
      camera.position.set(player.x + Math.cos(player.yaw) * bobX, eye + bobY, player.z - Math.sin(player.yaw) * bobX);
      let sx = 0;
      let sy = 0;
      if (shake > 0) {
        sx = (Math.random() - 0.5) * shake * 0.05;
        sy = (Math.random() - 0.5) * shake * 0.05;
      }
      camera.rotation.set(player.pitch + sy, player.yaw + sx, 0);
    }
    // Lampe in der Hand; der Lichtkegel folgt ihrem Nachschwingen
    const tilt = torch.update(animStep || 0, {
      yaw: player.yaw, pitch: player.pitch, bob: player.bob, moving: !!player.moving && !player.hidden,
      sprint: !!player.sprinting && !player.hidden, sneak: keys.has('c'),
      hidden: !!player.hidden, away: inCar || !player.alive, shake,
    });
    if (peers.size) updatePeers(frameDt);
    cullProps();
    flash.target.position.set(-tilt.x * 2.2, -0.1 + tilt.y * 2.2, -4);
    forestView?.tick(performance.now() / 1000, camera);
    gardenView?.tick(performance.now() / 1000, animStep || 0, camera);

    // Billboards drehen sich um die Hochachse zur Kamera; die Ansicht folgt der Laufrichtung
    monsterMesh.position.set(monster.x, 0, monster.z);
    for (const m of [monsterMesh, phantom]) {
      m.rotation.y = Math.atan2(camera.position.x - m.position.x, camera.position.z - m.position.z);
    }
    const flip = applyView(monsterMesh, monster.fx, monster.fz);
    // Leichtes Wanken, damit es nicht wie ein Pappaufsteller wirkt — der Beobachter steht vollkommen still
    const sway = monster.kind === 'watcher' ? 0 : 1;
    monsterMesh.scale.set(flip * (1 + Math.sin(time * 3.1) * 0.03 * sway), 1 + Math.sin(time * 2.3) * 0.015 * sway, 1);
    monsterMesh.visible = !inCar && monster.state !== 'away' && (monster.state !== 'dormant' || time > DORMANT - 0.1);

    if (body) {
      // Jäger/Lauscher schauen in Laufrichtung, der Beobachter immer zum Spieler
      const watcher = monster.kind === 'watcher';
      const goal = watcher
        ? Math.atan2(camera.position.x - monster.x, camera.position.z - monster.z)
        : Math.atan2(monster.fx, monster.fz);
      const frozen = watcher && monster.seenByPlayer;
      // erstarrt: dreht sich auch nicht mehr. Ungesehen darf er sich sofort umwenden.
      if (!frozen) {
        let d = goal - bodyYaw;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        bodyYaw += Math.abs(d) > 2.5 && !monsterMesh.visible ? d : d * Math.min(1, animStep * 8);
      }
      // Hinter dem Nebel ist es unsichtbar — dann auch nicht zeichnen (Skinning + Schatten kosten)
      body.group.visible = monsterMesh.visible && Math.hypot(monster.x - camera.position.x, monster.z - camera.position.z) < camera.far;
      body.group.position.set(monster.x, 0, monster.z);
      body.group.rotation.y = bodyYaw;
      body.update(animStep, {
        speed: monster.speed || 0,
        frozen,
        // Lauscher horcht, Gärtner schnüffelt (Kopf pendelt) — beide nur im Stehen bzw. auf der Spur
        listening: (monster.kind === 'listener' && monster.state === 'search' && !monster.speed)
          || (monster.kind === 'tracker' && (monster.state === 'track' || monster.state === 'search')),
      });
      // Erscheinung am Gangende: steht still und schaut her
      phantomBody.group.visible = phantom.visible;
      if (phantom.visible) {
        phantomBody.group.position.copy(phantom.position);
        phantomBody.group.rotation.y = Math.atan2(camera.position.x - phantom.position.x, camera.position.z - phantom.position.z);
        phantomBody.update(animStep, { speed: 0 });
      }
    }
    // Laterne des Gärtners: das Licht sitzt am Laternenglas in seiner Hand und flackert wie eine Flamme
    if (lanternLight) {
      const active = monster.state !== 'dormant' || time > DORMANT - 0.1;
      if (body?.lantern) body.lantern.getWorldPosition(lanternLight.position);
      else lanternLight.position.set(monster.x, 1.1, monster.z);
      lanternLight.intensity = active ? 1.8 * (0.86 + Math.sin(time * 11) * 0.06 + Math.sin(time * 5.3) * 0.08) : 0;
    }
    animStep = 0;

    const fx = -Math.sin(player.yaw);
    const fz = -Math.cos(player.yaw);
    audio?.setListener(camera.position.x, camera.position.y, camera.position.z, fx, fz);
    draw();
  }

  function draw() {
    if (direct()) renderer.render(scene, camera); else post.render();
  }

  // ── Vorwärmen ───────────────────────────────────────────────────────────
  // Shader übersetzen und Texturen auf die Grafikkarte laden, BEVOR etwas zum ersten Mal ins Bild kommt.
  // Sonst passiert das mitten im Spiel: der erste Blick aufs Monster hing bis zu 180 ms, das Aussteigen im
  // Wald über eine halbe Sekunde. Dafür wird alles Versteckte kurz sichtbar gemacht, der Shader für genau
  // das Ziel übersetzt, in das später gezeichnet wird (das Zwischenbild der Nachbearbeitung hat andere
  // Shader als der Bildschirm), und dann in vier Richtungen gezeichnet — in einem Rutsch, angezeigt wird
  // nur das letzte Bild.
  let disposed = false;
  let warming = Promise.resolve();
  function warm() {
    warming = warming.then(async () => {
      if (disposed) return;
      const hidden = [];
      // Lichter NICHT einschalten: ihre Anzahl steckt in jedem Shader — sonst wäre alles für die falsche Zahl übersetzt
      scene.traverse((o) => { if (!o.visible && !o.isLight) { hidden.push(o); o.visible = true; } });
      const moved = [];
      const ahead = new THREE.Vector3(camera.position.x - Math.sin(player.yaw) * 3, 0, camera.position.z - Math.cos(player.yaw) * 3);
      for (const g of [body?.group, phantomBody?.group]) if (g) { moved.push([g, g.position.clone()]); g.position.copy(ahead); }
      const flashWas = flash.intensity;
      flash.intensity = 1;
      try {
        if (renderer.compileAsync) {
          if (!direct()) renderer.setRenderTarget(post.composer.readBuffer);
          const p = renderer.compileAsync(scene, camera);
          renderer.setRenderTarget(null);
          await p;
        }
      } catch { /* dann übersetzt eben das Zeichnen */ }
      if (disposed) return;
      const yaw = camera.rotation.y;
      for (let i = 0; i < 4; i++) {
        camera.rotation.y = yaw + (i * Math.PI) / 2;
        camera.updateMatrixWorld();
        draw();
      }
      camera.rotation.y = yaw;
      flash.intensity = flashWas;
      for (const o of hidden) o.visible = false;
      for (const [g, p] of moved) g.position.copy(p);
      render();
    }).catch(() => {});
    return warming;
  }

  // ── Auflösung und Grafikstufe nach Bildrate ─────────────────────────────
  // Unter ~45 fps (im Mittel) sinkt erst die Auflösung in großen Schritten bis quality.min. Reicht das nicht
  // und steht die Grafik auf „Auto“, geht es eine Stufe runter (Hoch → Mittel → Niedrig) — so wird ein
  // schwacher Rechner in wenigen Sekunden spielbar, statt bei 10 fps zu bleiben. Hoch geht es nur mit der
  // Auflösung wieder, nie mit der Stufe (sonst pendelt es).
  const baseRatio = () => Math.min(quality.ratio, Math.max(1, window.devicePixelRatio || 1));
  let ratio = baseRatio();
  const gov = { avg: 1 / 60, slow: 0, fast: 0, settle: 0 };
  function setRatio(r) {
    ratio = r;
    renderer.setPixelRatio(r);
    resize();
  }
  /** Grafikstufe wechseln (Menü oder Regelung). Übersetzt die Shader neu, deshalb gleich vorwärmen. */
  function applyQuality(name) {
    const next = qualityOf(name);
    if (autoQuality) host.autoQuality = name;
    if (next === quality) return;
    quality = next;
    renderer.shadowMap.enabled = quality.shadow > 0;
    flash.castShadow = quality.shadow > 0;
    if (quality.shadow && flash.shadow.mapSize.x !== quality.shadow) {
      flash.shadow.map?.dispose();
      flash.shadow.map = null;
      flash.shadow.mapSize.set(quality.shadow, quality.shadow);
    }
    post.dispose();
    post = makePost();
    scene.traverse((o) => { [].concat(o.material || []).forEach((m) => { m.needsUpdate = true; }); });
    setRatio(Math.min(ratio, baseRatio()));
    warm();
  }

  function govern(rawDt) {
    const dt = Math.min(rawDt, 0.1);
    // Nach jedem Eingriff kurz warten: das erste Bild danach (neue Puffer, Shader) ist immer langsam
    if (gov.settle > 0) { gov.settle -= dt; return; }
    gov.avg += (dt - gov.avg) * 0.08;
    if (gov.avg > 1 / 45) { gov.slow += dt; gov.fast = 0; } else if (gov.avg < 1 / 56) { gov.fast += dt; gov.slow = 0; } else { gov.slow = 0; gov.fast = 0; }
    if (gov.slow > 1 && ratio > quality.min + 0.01) {
      setRatio(Math.max(quality.min, ratio - 0.25));
      gov.slow = 0;
      gov.avg = 1 / 50;
      gov.settle = 0.5;
    } else if (gov.slow > 2.5 && autoQuality && quality !== QUALITY.low) {
      const next = quality === QUALITY.high ? 'medium' : 'low';
      applyQuality(next);
      say(`Grafik automatisch gesenkt: ${next === 'medium' ? 'Mittel' : 'Niedrig'}.`, 3);
      cb.onQuality?.(next);
      gov.slow = 0;
      gov.avg = 1 / 50;
      gov.settle = 1.5;
    } else if (gov.fast > 10 && ratio < baseRatio() - 0.01) {
      setRatio(Math.min(baseRatio(), ratio + 0.125));
      gov.fast = 0;
    }
  }

  let raf = 0;
  let last = performance.now();
  let frameDt = 0;
  const loop = (now) => {
    raf = requestAnimationFrame(loop);
    const raw = (now - last) / 1000;
    const dt = Math.min(0.05, raw);
    last = now;
    frameDt = dt;
    shake = Math.max(0, shake - dt * 1.5);
    // Koop: die Welt läuft weiter, auch wenn man selbst im Pausenmenü steht (die anderen spielen ja)
    if ((!paused || coop) && !ended) { update(dt); animStep = dt; if (!paused) govern(raw); }
    render();
  };

  function resize() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    post.setSize(w, h);
    canvasEl.style.width = '100%';
    canvasEl.style.height = '100%';
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    render();
  }
  renderer.setPixelRatio(ratio);
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();
  // Die drei Billboard-Ansichten wechseln das Material zur Laufzeit — jede einmal übersetzen
  monsterMesh.visible = true;
  for (const name of ['back', 'side', 'front']) { monsterMesh.material = viewMats[name].mat; renderer.compile(scene, camera); }
  warm();
  raf = requestAnimationFrame(loop);
  // Die Fotomaterialien kommen nachträglich und ändern dabei die Shader (Normal-/Rauheitskarten) —
  // sobald alles geladen ist, noch einmal vorwärmen
  assets.ready().then(() => { if (!disposed) warm(); });
  // Fertig = Fotos und Monster geladen und vorgewärmt (höchstens 12 s warten). Erst dann gibt die Oberfläche
  // „Los“ frei bzw. blendet beim Ebenenwechsel auf — sonst fiel das Vorwärmen mitten ins Spiel (Ruckler).
  const readyPromise = Promise.race([
    Promise.all([assets.ready(), loadMonsterKit()]).then(() => new Promise((r) => setTimeout(r, 0))).then(() => warming),
    new Promise((r) => setTimeout(r, 12000)),
  ]).then(() => true);

  // Übergang aus der vorigen Ebene: die Zeigersperre besteht noch, also direkt weiterspielen
  if (opts.autoplay && document.pointerLockElement === canvasEl) {
    paused = false;
    audio?.startAmbience(level.theme);
    queueMicrotask(() => cb.onPause?.(false));
  }

  return {
    seed,
    level: levelIndex,
    /** Startet bzw. setzt fort. Muss aus einem Klick heraus gerufen werden (Zeigersperre, Ton). */
    play() {
      if (ended) return;
      audio?.resume();
      // Während der Anfahrt läuft noch keine Waldstimmung — die kommt, wenn man aussteigt
      if (!introActive()) audio?.startAmbience(level.theme);
      try {
        const p = canvasEl.requestPointerLock?.();
        p?.catch?.(() => {});
      } catch { /* manche Browser werfen statt abzulehnen */ }
      paused = false;
      last = performance.now();
      cb.onPause?.(false);
    },
    /** Löst auf, sobald die Welt geladen und vorgewärmt ist. */
    whenReady: () => readyPromise,
    setSensitivity(v) { sensitivity = v; },
    /**
     * Koop-Nachrichten aus LightsOut.jsx: 'peer' (Lage eines Mitspielers), 'world' (Stand vom Host),
     * 'event' (Spielereignis), 'host' (Host gewechselt: payload = bin ich jetzt Host?), 'left' (Platz ist weg).
     */
    net(kind, payload) {
      if (!coop || disposed) return;
      if (kind === 'peer') applyPeer(payload);
      else if (kind === 'world') applyWorld(payload);
      else if (kind === 'event') applyEvent(payload);
      else if (kind === 'host') setHost(!!payload);
      else if (kind === 'left') peerLeft(payload);
    },
    setVolume(v) { audio?.setVolume(v); },
    /** Grafikstufe wechseln (aus dem Pausenmenü). Übersetzt die Shader neu, deshalb gleich vorwärmen. */
    setQuality(q) {
      autoQuality = !q || q === 'auto';
      applyQuality(autoQuality ? (host.autoQuality || autoQualityName(renderer)) : q);
    },
    dispose() {
      disposed = true;
      gone = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('mousemove', onMouse);
      document.removeEventListener('pointerlockchange', onLockChange);
      if (intro?.engine && typeof intro.engine === 'object') intro.engine.stop();
      // Zeichenfläche, Ton und Zeigersperre gehören der Hülle — hier nur die eigene Szene abbauen
      audio?.stopAmbience();
      audio?.setChase(0);
      for (const d of disposables) d.dispose?.();
      for (const m of instanced) m.dispose();
      post.dispose();
      assets.dispose();
    },
    // Für den Prüfstand
    _debug: {
      player, monster, maze, items, valves, lockers, boxPos, door, exitCell, objectives, shards,
      scene, flash, renderer, camera, trail, codeLock, carvings, gardenView, puzzleStatues, turnStatue, insertFuse, peers, targets, NEED, HARD, applyQuality,
      get quality() { return Object.keys(QUALITY).find((k) => QUALITY[k] === quality); }, get ratio() { return ratio; },
      get isHost() { return isHost; }, get focus() { return focus; }, get flicker() { return flicker; }, get body() { return body; }, get noPost() { return noPost; }, set noPost(v) { noPost = v; },
      get time() { return time; }, get phase() { return phase; }, get introT() { return intro?.t; }, get paused() { return paused; }, get ended() { return ended; }, interact, findInteract,
    },
  };
}
