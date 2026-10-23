// partyScene.js — Stream Starting als Party-Saal (three.js).
//
// Bühne mit großer LED-Wand (STREAM STARTING + Countdown), davor eine LED-Tanzfläche,
// auf der die Chatter tanzen (partyDancers.js). Licht und Effekte laufen in einem festen
// Takt (BPM): Moving Heads mit sichtbaren Lichtkegeln im Dunst, Discokugel mit wandernden
// Lichtpunkten, Bodennebel, Nebelmaschinen am Rand, CO2-Fontänen, Flammensäulen (auch als
// Lauflicht). Die Boxen pumpen im Bass und schicken Druckwellen in den Saal.
// Alle 16 Schläge wechselt die Lichtstimmung (Farben + Bewegungsmuster).
//
// Ist die Tanzfläche voll (oder der Chat sehr aktiv), rastet der Saal aus: Drops mit
// Konfettikanonen, Konfettiregen, Strobo, Feuer-Lauflicht, schnellere Lichtwechsel.
//
// Steuerpult (applySettings/command): Ausraster-Modus und Schwellen, Statisten, Tanzstil, Effekte
// einzeln aus, Drop auf Knopfdruck. Musik (music/setSong, aus der YTMusicApp): der Takt rastet auf die
// erkannten Kicks ein, Boxen/Licht/LED-Wand folgen dem Bass, der Song steht auf der LED-Wand.
//
// Die Kamera gleitet in einer geschlossenen Schleife vor der Tanzfläche entlang.
// Fotolook: Boden und Wände sind Poly-Haven-Fotomaterialien (public/media/cr3d), Bloom lässt
// LED-Wand, Lichtkegel und Feuer strahlen (createPostFX aus scene3d/kit.js). Schwelle über der
// Kachelhelligkeit der Tanzfläche (max. 0,87), sonst überstrahlt der Boden bei weißem Licht.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { createAssets, createPostFX, warmUp } from '../ClashRoyale/modes/scene3d/kit';
import { createStage, canvasTexture, box, rng, lerp, clamp01 } from './sceneKit';
import {
  smokeTexture, flameTexture, trussTexture, concreteTexture,
  LED_W, LED_H, drawLedWall,
} from './partyTextures';
import { createDancers } from './partyDancers';
import { createBeatClock, cachedLook } from './sceneLink';
import { propMaterials, buildSpeakerTower, buildDjBooth, buildFogMachine, buildMovingHead, buildFlameUnit } from './partyProps';

const BPM = 124;
const HX = 13;                  // Halle x ±13
const BACK_Z = -11;
const FRONT_Z = 14;
const CEIL_Y = 10;
const STAGE_Z = -7;             // Vorderkante der Bühne
const STAGE_H = 1.2;
const LED_WM = 14, LED_HM = LED_WM * 9 / 16;
const LED_C = new THREE.Vector3(0, STAGE_H + 0.5 + LED_HM / 2, -10.5);
const TILE = 1.6, TILE_COLS = 10, TILE_ROWS = 7;
const FLOOR = { x0: -TILE * TILE_COLS / 2, x1: TILE * TILE_COLS / 2, z0: STAGE_Z + 0.4, z1: STAGE_Z + 0.4 + TILE * TILE_ROWS };
const DOOR = new THREE.Vector3(-HX + 0.6, 0, 7.5);
const CAM_LOOP_S = 64;
/** Ab so vielen Tänzern (oder Nachrichten in 30 s) rastet der Saal aus. */
const FULL_DANCERS = 22;
const FULL_MSGS = 28;

/** Lichtstimmungen: zwei Farben je Stimmung. */
const PALETTES = [
  ['#ff2fb3', '#28d7ff'],
  ['#8b5cf6', '#3b82f6'],
  ['#ff7a18', '#ff2a3d'],
  ['#22e39a', '#14b8d4'],
  ['#ffd23f', '#ff4fd8'],
  ['#ffffff', '#7c8cff'],
];
const PATTERNS = ['sweep', 'fan', 'circle', 'cross'];

const v = (x, y, z) => new THREE.Vector3(x, y, z);

/** Ersetzt NaN/∞ durch Schwarz und deckelt Spitzlichter (Half-Float hört bei 65504 auf). */
const SanitizeShader = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      bvec4 bad = bvec4(isnan(c.r) || isinf(c.r), isnan(c.g) || isinf(c.g), isnan(c.b) || isinf(c.b), isnan(c.a) || isinf(c.a));
      c = vec4(bad.x ? 0.0 : c.r, bad.y ? 0.0 : c.g, bad.z ? 0.0 : c.b, bad.w ? 1.0 : c.a);
      // Spitzlichter deckeln: weit über der Bloom-Schwelle sieht man keinen Unterschied mehr
      gl_FragColor = vec4(clamp(c.rgb, 0.0, 64.0), c.a);
    }`,
};

const CAM_POS = [v(-6.5, 3.1, 10.5), v(0, 4.7, 12.6), v(6.8, 2.7, 10.2), v(2.2, 2.3, 8.2), v(-3.2, 3.8, 9.2)];
const CAM_LOOK = [v(0.8, 3.2, -4), v(0, 3.4, -4), v(-0.8, 3.0, -4), v(-0.3, 2.7, -3), v(0.4, 3.1, -4)];

/** Lichtkegel-Shader: hell an der Lampe, weich an den Rändern, läuft zum Boden hin aus. */
function beamMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color() }, uOpacity: { value: 0.35 } },
    vertexShader: `
      varying float vAlong;
      varying vec3 vN;
      varying vec3 vView;
      void main() {
        vAlong = uv.y;
        vN = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vAlong;
      varying vec3 vN;
      varying vec3 vView;
      void main() {
        // clamp: an den Kanten (Kantenglättung) liegt vAlong minimal unter 0 — pow() einer negativen
        // Zahl ist auf der GPU undefiniert und malte am offenen Kegelende schwarze Ringe
        float along = pow(clamp(vAlong, 0.0, 1.0), 1.6);
        float edge = clamp(abs(dot(normalize(vN), normalize(vView))), 0.0, 1.0);
        float a = uOpacity * along * edge;
        gl_FragColor = vec4(uColor * a, a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {HTMLElement} overlay
 * @param {{ getInfo: () => { countdown: string|null, title: string }, forceHype?: boolean, figures?: 'people'|'robots' }} opts
 *   forceHype: Ausraster-Stimmung erzwingen (Test); figures: Comic-Figuren (Standard) oder Roboter
 */
export function createPartyScene(canvas, overlay, { getInfo, forceHype = false, figures = 'people' }) {
  // Einstellungen vom Steuerpult (applySettings); ohne Steuerpult gelten diese Werte
  const cfg = {
    hypeMode: forceHype ? 'on' : 'auto',
    hypeDancers: FULL_DANCERS,
    hypeMsgs: FULL_MSGS,
    effects: { confetti: true, fire: true, strobe: true, fog: true },
    reactive: true,
    sensitivity: 1,
  };
  const clock = createBeatClock(BPM);
  let audio = null;              // letzter Musik-Rahmen (YTMusicApp)
  let audioAt = -1e9;
  let song = null;               // { title, artist }
  let bassEnv = 0;
  let viewW = 1920, viewH = 1080;
  const stage = createStage(canvas, { fov: 50, far: 120, onResize: (w, h) => { viewW = w; viewH = h; } });
  const { scene, camera, renderer } = stage;
  const assets = createAssets(renderer, { timeoutMs: 20000 });
  const post = createPostFX(renderer, scene, camera, { bloom: { strength: 0.55, radius: 0.55, threshold: 0.92 }, vignette: 0.35 });
  // Schutz vor schwarzen Blöcken: ein einziger ungültiger (NaN/∞) oder extrem heller Pixel wird vom
  // Bloom über seine Verkleinerungsstufen zu großen schwarzen Vierecken verschmiert. Vorher abfangen.
  post.composer.insertPass(new ShaderPass(SanitizeShader), 1);
  stage.setPost(post);
  scene.background = new THREE.Color('#050409');
  scene.fog = new THREE.FogExp2('#07060c', 0.026);

  const add = (m) => { scene.add(m); return m; };
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const pm = propMaterials(assets, envTex);
  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.8, ...o });
  const metal = std({ color: '#1b1c22', roughness: 0.35, metalness: 0.7 });

  // ── Halle ──
  const floor = add(new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, FRONT_Z - BACK_Z),
    assets.pbr(std({ map: concreteTexture([8, 8]), roughness: 0.32, metalness: 0.15 }), 'hangar_concrete_floor', 7, 7)));
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = (BACK_Z + FRONT_Z) / 2;
  const wallMat = assets.pbr(std({ color: '#2a2a33', roughness: 0.9 }), 'concrete_wall_008', 6, 2.5, { normalScale: 1.5 });
  add(box(0.3, CEIL_Y, FRONT_Z - BACK_Z, wallMat, -HX - 0.15, CEIL_Y / 2, (BACK_Z + FRONT_Z) / 2));
  add(box(0.3, CEIL_Y, FRONT_Z - BACK_Z, wallMat, HX + 0.15, CEIL_Y / 2, (BACK_Z + FRONT_Z) / 2));
  add(box(HX * 2, CEIL_Y, 0.3, wallMat, 0, CEIL_Y / 2, BACK_Z - 0.15));
  add(box(HX * 2, CEIL_Y, 0.3, wallMat, 0, CEIL_Y / 2, FRONT_Z + 0.15));
  const ceil = add(new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, FRONT_Z - BACK_Z), std({ color: '#08080c' })));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(0, CEIL_Y, (BACK_Z + FRONT_Z) / 2);

  // LED-Leisten an den Seitenwänden (Farbe folgt der Lichtstimmung)
  const stripMats = [new THREE.MeshBasicMaterial({ color: '#fff' }), new THREE.MeshBasicMaterial({ color: '#fff' })];
  for (const side of [-1, 1]) {
    for (let z = BACK_Z + 3; z < FRONT_Z - 1; z += 3.2) {
      add(box(0.06, CEIL_Y - 2.4, 0.08, stripMats[(Math.round(z) & 1)], side * (HX - 0.03), CEIL_Y / 2 + 0.6, z));
    }
  }

  // Eingang (links) — von hier kommen die Chatter
  {
    const frameMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    add(box(0.08, 2.6, 0.08, frameMat, -HX + 0.05, 1.3, DOOR.z - 1.1));
    add(box(0.08, 2.6, 0.08, frameMat, -HX + 0.05, 1.3, DOOR.z + 1.1));
    add(box(0.08, 0.08, 2.28, frameMat, -HX + 0.05, 2.6, DOOR.z));
    add(box(0.05, 2.55, 2.1, new THREE.MeshBasicMaterial({ color: '#1a1530' }), -HX + 0.02, 1.28, DOOR.z));
  }

  // ── Bühne ──
  add(new THREE.Mesh(new THREE.BoxGeometry(HX * 2 - 4, STAGE_H, -BACK_Z + STAGE_Z), [pm.velvet, pm.velvet, pm.deck, pm.velvet, pm.velvet, pm.velvet]))
    .position.set(0, STAGE_H / 2, (BACK_Z + STAGE_Z) / 2);
  const edgeMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  add(box(HX * 2 - 4, 0.05, 0.05, edgeMat, 0, STAGE_H, STAGE_Z + 0.01));

  // LED-Wand
  const led = canvasTexture(LED_W, LED_H, null);
  led.tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const ledMat = new THREE.MeshBasicMaterial({ map: led.tex, toneMapped: false, fog: false });
  const ledMesh = add(new THREE.Mesh(new THREE.PlaneGeometry(LED_WM, LED_HM), ledMat));
  ledMesh.position.copy(LED_C);
  add(box(LED_WM + 0.4, LED_HM + 0.4, 0.3, metal, LED_C.x, LED_C.y, LED_C.z - 0.17));
  const ledLight = add(new THREE.PointLight('#ffffff', 10, 22, 1.4));
  ledLight.position.set(0, LED_C.y, LED_C.z + 3);

  // DJ-Pult
  const dj = buildDjBooth(pm, edgeMat);
  dj.group.position.set(0, STAGE_H, STAGE_Z - 1.6);
  scene.add(dj.group);

  // Truss: zwei Türme + Querträger über der Bühne, zweiter Querträger über der Tanzfläche
  const truss = trussTexture();
  const trussBeam = (len, axis, x, y, z) => {
    const tex = truss.tex.clone();
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(Math.max(1, Math.round(len / 0.5)), 1);
    tex.needsUpdate = true;
    const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.35, metalness: 0.8 });
    const geo = axis === 'x' ? new THREE.BoxGeometry(len, 0.4, 0.4) : new THREE.BoxGeometry(0.4, len, 0.4);
    if (axis === 'y') {
      // Wiederholung entlang der Höhe: UVs drehen statt einer zweiten Textur
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i), uv.getX(i));
    }
    const m = add(new THREE.Mesh(geo, mat));
    m.position.set(x, y, z);
    return m;
  };
  const TRUSS_Y = 8.6;
  trussBeam(TRUSS_Y - STAGE_H, 'y', -10, STAGE_H + (TRUSS_Y - STAGE_H) / 2, -8);
  trussBeam(TRUSS_Y - STAGE_H, 'y', 10, STAGE_H + (TRUSS_Y - STAGE_H) / 2, -8);
  trussBeam(20.4, 'x', 0, TRUSS_Y, -8);
  trussBeam(22, 'x', 0, TRUSS_Y, 3.5);
  for (const x of [-11, 11]) {
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, CEIL_Y - TRUSS_Y, 6), metal)).position.set(x * 0.9, (CEIL_Y + TRUSS_Y) / 2, 3.5);
  }

  // Boxentürme neben der Tanzfläche: echte Membranen, die im Bass pumpen
  const cabinets = [];     // { group, cones: Mesh[] }
  const towers = [];       // Mitte der Front je Turm (für die Druckwellen)
  const speakerLogos = [];
  for (const side of [-1, 1]) {
    const { tower, cabinets: cabs, logos } = buildSpeakerTower(pm);
    tower.position.set(side * 10.6, 0, STAGE_Z + 1.2);
    tower.rotation.y = -side * 0.25;
    scene.add(tower);
    tower.updateMatrixWorld(true);
    cabinets.push(...cabs);
    speakerLogos.push(...logos.map((m) => ({ m, side })));
    towers.push({ tower, side, front: tower.localToWorld(new THREE.Vector3(0, 1.9, 0.62)) });
  }
  // Druckwellen: Ringe, die bei jedem Schlag von den Boxen weglaufen
  const ringGeo = new THREE.RingGeometry(0.42, 0.52, 64);
  const rings = Array.from({ length: 10 }, () => {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    m.visible = false;
    scene.add(m);
    return { m, age: 1, tower: null };
  });
  const pulse = (tw, col, strength) => {
    const r = rings.find((q) => q.age >= 1) || rings[0];
    r.age = 0;
    r.strength = strength;
    r.tower = tw;
    r.m.visible = true;
    r.m.material.color.copy(col);
    r.m.position.copy(tw.front);
    r.m.quaternion.copy(tw.tower.quaternion);
  };

  // Nebelmaschinen am Rand der Tanzfläche, Düse zur Mitte
  const fogMachines = [[-1, -2.4], [1, -2.4], [-1, 5.4], [1, 5.4]].map(([side, z]) => {
    const { group: g, led, nozzle } = buildFogMachine(pm);
    g.position.set(side * (HX - 0.55), 0, z);
    g.rotation.y = -side * Math.PI / 2;
    scene.add(g);
    g.updateMatrixWorld(true);
    return {
      side, led,
      origin: g.localToWorld(nozzle.clone()),
      dir: new THREE.Vector3(-side, 0, 0),
      from: 0, until: 0,
    };
  });

  // ── LED-Tanzfläche ──
  const tiles = add(new THREE.InstancedMesh(new THREE.BoxGeometry(TILE - 0.08, 0.06, TILE - 0.08), new THREE.MeshBasicMaterial({ color: '#ffffff' }), TILE_COLS * TILE_ROWS));
  {
    const m = new THREE.Matrix4();
    let i = 0;
    for (let r = 0; r < TILE_ROWS; r++) {
      for (let c = 0; c < TILE_COLS; c++) {
        m.makeTranslation(FLOOR.x0 + TILE / 2 + c * TILE, 0.03, FLOOR.z0 + TILE / 2 + r * TILE);
        tiles.setMatrixAt(i, m);
        tiles.setColorAt(i++, new THREE.Color('#000'));
      }
    }
    add(box(FLOOR.x1 - FLOOR.x0 + 0.2, 0.04, FLOOR.z1 - FLOOR.z0 + 0.2, std({ color: '#050507' }), 0, 0.01, (FLOOR.z0 + FLOOR.z1) / 2));
  }

  // ── Discokugel ──
  const ballPos = v(0, 7.6, -0.5);
  const ball = add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 3),
    new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 1, roughness: 0.08, flatShading: true, envMap: envTex, envMapIntensity: 3.2, fog: false })));
  ball.position.copy(ballPos);
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, CEIL_Y - ballPos.y - 0.6, 6), metal)).position.set(0, (CEIL_Y + ballPos.y + 0.6) / 2, ballPos.z);
  const ballSpot = add(new THREE.SpotLight('#ffffff', 60, 14, 0.12, 0.4, 1.2));
  ballSpot.position.set(4, CEIL_Y - 0.3, 5);
  ballSpot.target = ball;

  // Lichtpunkte der Kugel: Richtungen auf einer Kugel, auf Wände/Boden/Decke projiziert
  const DOTS = 170;
  const dotDirs = [];
  {
    const r = rng(77);
    for (let i = 0; i < DOTS; i++) {
      const u = r() * 2 - 1, a = r() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      // nur leicht nach unten: die Punkte landen an Wänden und Decke, nicht auf dem Boden
      dotDirs.push(v(s * Math.cos(a), Math.max(-0.18, u * 0.7), s * Math.sin(a)).normalize());
    }
  }
  const dotPos = new Float32Array(DOTS * 3);
  const dotGeo = new THREE.BufferGeometry();
  dotGeo.setAttribute('position', new THREE.BufferAttribute(dotPos, 3));
  const dotMat = new THREE.PointsMaterial({ color: '#ffffff', size: 0.11, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  add(new THREE.Points(dotGeo, dotMat));
  const dTmp = new THREE.Vector3();
  const updateDots = (angle) => {
    const ca = Math.cos(angle), sa = Math.sin(angle);
    for (let i = 0; i < DOTS; i++) {
      const d0 = dotDirs[i];
      dTmp.set(d0.x * ca - d0.z * sa, d0.y, d0.x * sa + d0.z * ca);
      // Abstand bis zur nächsten Fläche des Raums
      let t = Infinity;
      if (dTmp.x > 0) t = Math.min(t, (HX - 0.05 - ballPos.x) / dTmp.x);
      if (dTmp.x < 0) t = Math.min(t, (-HX + 0.05 - ballPos.x) / dTmp.x);
      if (dTmp.z > 0) t = Math.min(t, (FRONT_Z - 0.05 - ballPos.z) / dTmp.z);
      if (dTmp.z < 0) t = Math.min(t, (BACK_Z + 0.05 - ballPos.z) / dTmp.z);
      if (dTmp.y > 0) t = Math.min(t, (CEIL_Y - 0.05 - ballPos.y) / dTmp.y);
      if (dTmp.y < 0) t = Math.min(t, (0.08 - ballPos.y) / dTmp.y);
      dotPos[i * 3] = ballPos.x + dTmp.x * t;
      dotPos[i * 3 + 1] = ballPos.y + dTmp.y * t;
      dotPos[i * 3 + 2] = ballPos.z + dTmp.z * t;
    }
    dotGeo.attributes.position.needsUpdate = true;
  };

  // ── Moving Heads ──
  const heads = [];
  const beamGeo = new THREE.ConeGeometry(1.25, 16, 32, 1, true).translate(0, -8, 0).rotateX(-Math.PI / 2);
  const headPositions = [
    ...[-7.5, -4.5, -1.5, 1.5, 4.5, 7.5].map((x) => v(x, TRUSS_Y - 0.45, -8)),
    ...[-8, -2.7, 2.7, 8].map((x) => v(x, TRUSS_Y - 0.45, 3.5)),
  ];
  const realLights = new Set([0, 5, 7, 8]);   // nur vier echte Lichtquellen, Rest nur Kegel
  headPositions.forEach((p, i) => {
    const pivot = new THREE.Group();
    pivot.position.copy(p);
    scene.add(pivot);
    const rig = buildMovingHead(pm, pivot);
    rig.base.position.copy(p);
    scene.add(rig.base);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.14, 20), new THREE.MeshBasicMaterial({ color: '#fff', fog: false }));
    lens.position.z = 0.02;
    pivot.add(lens);
    const mat = beamMaterial();
    const cone = new THREE.Mesh(beamGeo, mat);
    pivot.add(cone);
    let light = null;
    if (realLights.has(i)) {
      light = add(new THREE.SpotLight('#ffffff', 0, 30, Math.atan(1.25 / 16) * 1.6, 0.5, 1));
      light.position.copy(p);
      scene.add(light.target);
    }
    heads.push({ p, pivot, mat, lens, light, i, front: p.z > 0, rig });
  });

  // ── Nebel und Feuer (Partikel) ──
  const smokeTex = smokeTexture();
  const flameTex = flameTexture();
  const makePool = (n, tex, blending) => Array.from({ length: n }, () => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending, opacity: 0 }));
    s.visible = false;
    scene.add(s);
    return { s, vel: new THREE.Vector3(), life: 0, max: 1, size0: 1, size1: 2, op: 0.5, kind: '', rot: 0 };
  });
  const smokePool = makePool(380, smokeTex, THREE.NormalBlending);
  const flamePool = makePool(360, flameTex, THREE.AdditiveBlending);
  const spawn = (pool, init) => {
    const p = pool.find((q) => q.life <= 0);
    if (!p) return;
    init(p);
    p.s.visible = true;
  };
  const fireLight = add(new THREE.PointLight('#ff7a1a', 0, 26, 1.3));
  fireLight.position.set(0, STAGE_H + 2, STAGE_Z + 1);
  // Flammendüsen: jede hat ein eigenes Zeitfenster, damit Lauflichter (Chase) möglich sind
  const nozzles = [-8, -3.2, 3.2, 8].map((x) => ({ x, from: 0, until: 0 }));
  for (const n of nozzles) add(buildFlameUnit(pm)).position.set(n.x, STAGE_H - 0.06, STAGE_Z - 0.35);
  const FIRE_PATTERNS = {
    all: [[0, 0], [1, 0], [2, 0], [3, 0]],
    outer: [[0, 0], [3, 0]],
    inner: [[1, 0], [2, 0]],
    chaseR: [[0, 0], [1, 0.14], [2, 0.28], [3, 0.42]],
    chaseL: [[3, 0], [2, 0.14], [1, 0.28], [0, 0.42]],
    vee: [[1, 0], [2, 0], [0, 0.22], [3, 0.22]],
  };
  const FIRE_NAMES = Object.keys(FIRE_PATTERNS);
  const fire = (name, t, len) => {
    if (!cfg.effects.fire) return;
    for (const [i, delay] of FIRE_PATTERNS[name]) {
      nozzles[i].from = t + delay;
      nozzles[i].until = t + delay + len;
    }
  };
  const co2Nozzles = [-6, 6];

  let co2Until = 0, fogUntil = 0;
  const r = Math.random;
  // Partikel pro Sekunde mit Bruchteil-Zähler — unabhängig von der Bildrate
  const acc = {};
  const count = (key, rate, dt) => {
    acc[key] = (acc[key] || 0) + rate * dt;
    const n = Math.floor(acc[key]);
    acc[key] -= n;
    return n;
  };
  const emit = (t, dt) => {
    // Bodennebel: rollt von der Bühne über die Tanzfläche
    if (t < fogUntil) {
      for (let k = count('fog', 16, dt); k > 0; k--) {
        spawn(smokePool, (p) => {
          p.s.position.set(lerp(-9, 9, r()), 0.4 + r() * 0.3, STAGE_Z + 0.3);
          p.vel.set((r() - 0.5) * 0.5, 0.03, 0.9 + r() * 0.6);
          p.life = p.max = 7 + r() * 3;
          p.size0 = 2.5; p.size1 = 6.5; p.op = 0.2; p.kind = 'fog'; p.rot = (r() - 0.5) * 0.3;
        });
      }
    }
    // Nebelmaschinen: dichter Strahl zur Mitte, der sich aufbläht und liegen bleibt
    fogMachines.forEach((fm, i) => {
      if (t < fm.from || t >= fm.until) return;
      for (let k = count('fm' + i, 46, dt); k > 0; k--) {
        spawn(smokePool, (p) => {
          p.s.position.copy(fm.origin);
          const sp = 5.5 + r() * 2.5;
          p.vel.set(fm.dir.x * sp, 0.35 + r() * 0.5, (r() - 0.5) * 1.6);
          p.life = p.max = 3.6 + r() * 1.6;
          p.size0 = 0.35; p.size1 = 3.8 + r() * 1.2; p.op = 0.3; p.kind = 'jet'; p.rot = (r() - 0.5) * 0.6;
        });
      }
    });
    // CO2: weiße Fontäne nach oben, die oben aufbläht
    if (t < co2Until) {
      for (const x of co2Nozzles) {
        for (let k = count('co2' + x, 40, dt); k > 0; k--) {
          spawn(smokePool, (p) => {
            p.s.position.set(x + (r() - 0.5) * 0.2, STAGE_H + 0.2, STAGE_Z - 0.4);
            p.vel.set((r() - 0.5) * 1.2, 9 + r() * 3, 0.5 + (r() - 0.5) * 0.8);
            p.life = p.max = 1.8 + r() * 0.8;
            p.size0 = 0.4; p.size1 = 2.4; p.op = 0.42; p.kind = 'co2'; p.rot = (r() - 0.5);
          });
        }
      }
    }
    // Flammensäulen
    for (const n of nozzles) {
      if (t < n.from || t >= n.until) continue;
      for (let k = count('fire' + n.x, 60, dt); k > 0; k--) {
        spawn(flamePool, (p) => {
          p.s.position.set(n.x + (r() - 0.5) * 0.15, STAGE_H + 0.3, STAGE_Z - 0.35 + (r() - 0.5) * 0.15);
          p.vel.set((r() - 0.5) * 0.8, 9 + r() * 4, (r() - 0.5) * 0.8);
          p.life = p.max = 0.55 + r() * 0.35;
          p.size0 = 0.7; p.size1 = 1.9; p.op = 1; p.kind = 'fire'; p.rot = 0;
        });
      }
    }
  };
  const fireCol = new THREE.Color();
  const stepParticles = (pool, dt, tint) => {
    for (const p of pool) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.s.visible = false; continue; }
      const age = 1 - p.life / p.max;
      if (p.kind === 'co2') { p.vel.multiplyScalar(Math.exp(-dt * 2.2)); p.vel.y -= dt * 0.5; }
      if (p.kind === 'jet') { p.vel.multiplyScalar(Math.exp(-dt * 1.1)); p.vel.y += dt * 0.12; }
      if (p.kind === 'fire') p.vel.multiplyScalar(Math.exp(-dt * 1.2));
      p.s.position.addScaledVector(p.vel, dt);
      const size = lerp(p.size0, p.size1, Math.sqrt(age));
      p.s.scale.set(size, size, 1);
      p.s.material.rotation += p.rot * dt;
      if (p.kind === 'fire') {
        // weiß-gelb → orange → dunkelrot
        if (age < 0.25) fireCol.setRGB(1, 0.95 - age, 0.6 - age * 2);
        else fireCol.setRGB(1, Math.max(0.15, 0.7 - age * 0.8), 0.05);
        p.s.material.color.copy(fireCol);
        p.s.material.opacity = (1 - age) * p.op;
      } else {
        p.s.material.color.copy(tint);
        p.s.material.opacity = (p.kind === 'jet' ? Math.min(1, age * 6) * (1 - age) : Math.sin(Math.PI * age)) * p.op;
      }
    }
  };

  // ── Konfetti (Kanonen an der Bühnenkante, Regen vom Traversen-Träger) ──
  const CONF = 900;
  const confetti = add(new THREE.InstancedMesh(new THREE.PlaneGeometry(0.075, 0.11),
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }), CONF));
  confetti.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  confetti.frustumCulled = false;
  const confBits = Array.from({ length: CONF }, () => ({
    life: 0, pos: new THREE.Vector3(), vel: new THREE.Vector3(), axis: new THREE.Vector3(1, 0, 0), ang: 0, spin: 0, phase: 0, ground: false, flat: new THREE.Quaternion(),
  }));
  const confMat4 = new THREE.Matrix4();
  const confQ = new THREE.Quaternion();
  const confS = new THREE.Vector3();
  const confE = new THREE.Euler();
  const confZero = new THREE.Matrix4().makeScale(0, 0, 0);
  const confCol = new THREE.Color();
  for (let i = 0; i < CONF; i++) { confetti.setMatrixAt(i, confZero); confetti.setColorAt(i, confCol.set('#fff')); }
  let confActive = 0;
  let confNext = 0;
  let rainUntil = 0;
  const confColors = [new THREE.Color(), new THREE.Color(), new THREE.Color('#ffffff'), new THREE.Color('#ffd23f'), new THREE.Color('#ff3d8b')];
  const spawnConf = (init) => {
    const i = confNext;
    const c = confBits[i];
    confNext = (confNext + 1) % CONF;
    if (c.life <= 0) confActive++;
    c.life = 14 + r() * 3;
    c.ground = false;
    c.ang = r() * Math.PI * 2;
    c.spin = 6 + r() * 10;
    c.phase = r() * 10;
    c.axis.set(r() - 0.5, r() - 0.5, r() - 0.5).normalize();
    init(c);
    confetti.setColorAt(i, confColors[Math.floor(r() * confColors.length)]);
    confetti.instanceColor.needsUpdate = true;
  };
  const cannon = (x, n) => {
    if (!cfg.effects.confetti) return;
    for (let i = 0; i < n; i++) {
      spawnConf((c) => {
        c.pos.set(x + (r() - 0.5) * 0.3, STAGE_H + 0.4, STAGE_Z - 0.1);
        c.vel.set(-Math.sign(x) * (0.5 + r() * 2.2) + (r() - 0.5) * 2, 10 + r() * 7, 2.5 + r() * 5);
      });
    }
  };
  const stepConfetti = (t, dt) => {
    if (t < rainUntil) {
      for (let k = count('rain', 90, dt); k > 0; k--) {
        spawnConf((c) => {
          c.pos.set(lerp(FLOOR.x0, FLOOR.x1, r()), TRUSS_Y - 0.4, lerp(FLOOR.z0, FLOOR.z1, r()));
          c.vel.set((r() - 0.5) * 0.6, -0.4, (r() - 0.5) * 0.6);
        });
      }
    }
    if (!confActive) return;
    for (let i = 0; i < CONF; i++) {
      const c = confBits[i];
      if (c.life <= 0) continue;
      c.life -= dt;
      if (c.life <= 0) { confetti.setMatrixAt(i, confZero); confActive--; continue; }
      if (!c.ground) {
        c.vel.y -= 3.2 * dt;
        c.vel.multiplyScalar(Math.exp(-2.4 * dt));
        c.pos.addScaledVector(c.vel, dt);
        c.pos.x += Math.sin(t * 5 + c.phase) * 0.35 * dt;
        c.pos.z += Math.cos(t * 4 + c.phase) * 0.25 * dt;
        c.ang += c.spin * dt;
        confQ.setFromAxisAngle(c.axis, c.ang);
        if (c.pos.y <= 0.075) {
          // liegen bleiben (flach auf der Tanzfläche), dann ausblenden
          c.pos.y = 0.075;
          c.ground = true;
          c.flat.setFromEuler(confE.set(-Math.PI / 2, 0, r() * Math.PI));
          c.life = Math.min(c.life, 6 + r() * 2);
        }
      } else {
        confQ.copy(c.flat);
      }
      confS.setScalar(c.life < 1 ? c.life : 1);
      confetti.setMatrixAt(i, confMat4.compose(c.pos, confQ, confS));
    }
    confetti.instanceMatrix.needsUpdate = true;
  };

  // Stroboskop (bei den großen Momenten) — kurze, flächige Aufhellung im 16tel-Takt
  const strobe = add(new THREE.AmbientLight('#ffffff', 0));
  let strobeUntil = 0;
  let shakeUntil = 0;

  // ── Grundlicht ──
  add(new THREE.HemisphereLight('#8f86ff', '#1a1022', 0.7));
  // Führungslicht von vorn oben, damit die Tänzer nicht im Dunkeln stehen
  const key = add(new THREE.DirectionalLight('#fff0e6', 1.6));
  key.position.set(3, 10, 16);
  key.target.position.set(0, 0, -2);
  scene.add(key.target);
  // Farbige Wandflutung (folgt der Lichtstimmung)
  const washes = [[-12.2, -3], [12.2, -3], [-12.2, 6], [12.2, 6], [-6, -10.6], [6, -10.6]].map(([x, z], i) => {
    const l = add(new THREE.PointLight('#ffffff', 0, 10, 1.3));
    l.position.set(x, 1.2, z);
    l.userData.odd = i % 2;
    return l;
  });

  const dancers = createDancers(scene, overlay, FLOOR, DOOR, { envMap: envTex, bpm: BPM, figures, floorTop: 0.06, getLook: cachedLook });

  // ── Kamera ──
  const posCurve = new THREE.CatmullRomCurve3(CAM_POS, true, 'centripetal');
  const lookCurve = new THREE.CatmullRomCurve3(CAM_LOOK, true, 'centripetal');
  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();

  // ── Zeitplan der Effekte ──
  let lastLed = -1;
  let wasCounting = false;
  let prevT = -1;
  let prevBeat = -1;
  const colA = new THREE.Color(), colB = new THREE.Color(), tint = new THREE.Color(), tileCol = new THREE.Color();
  const aim = new THREE.Vector3();
  const shakeOff = new THREE.Vector3();
  const towerFwd = new THREE.Vector3();

  // Stimmung: volle Tanzfläche oder viel Chat → "Ausrasten" (Drops mit Konfetti, Strobo, Feuer-Lauflicht)
  const msgTimes = [];
  let energy = 0;
  let hype = false;
  let nextFire = 9, nextFog = 6, nextCo2 = 15, nextStageFog = 3;
  let fogSide = 0;

  /** Der große Moment: Konfettikanonen, Konfettiregen, Feuer-Lauflicht, CO2, Strobo. */
  const drop = (t) => {
    cannon(-7.4, 170);
    cannon(7.4, 170);
    if (cfg.effects.confetti) rainUntil = t + 3.5;
    fire('chaseR', t, 0.5);
    fire('chaseL', t + 0.9, 0.5);
    fire('all', t + 1.9, 1.0);
    if (cfg.effects.fog) {
      co2Until = t + 1.8;
      for (const fm of fogMachines) { fm.from = t + 0.4; fm.until = t + 2.8; }
    }
    if (cfg.effects.strobe) strobeUntil = t + 60 / clock.bpm * 4;
    shakeUntil = t + 1.2;
  };

  const tick = (t, dt) => {
    const beat = clock.step(dt);
    dancers.setBpm(clock.bpm);
    const beatHit = Math.floor(beat) !== Math.floor(prevBeat);
    const crossedBeats = (every) => Math.floor(beat / every) !== Math.floor(prevBeat / every);

    // Stimmung aus Tänzern und Chat-Tempo (letzte 30 s); steigt schnell, fällt langsam
    while (msgTimes.length && msgTimes[0] < t - 30) msgTimes.shift();
    const raw = cfg.hypeMode === 'on' ? 1.3
      : cfg.hypeMode === 'off' ? Math.min(0.95, Math.max(dancers.count() / cfg.hypeDancers, msgTimes.length / cfg.hypeMsgs))
      : Math.max(dancers.count() / cfg.hypeDancers, msgTimes.length / cfg.hypeMsgs);
    energy += (raw - energy) * (1 - Math.exp(-dt * (raw > energy ? 1.5 : 0.25)));
    if (!hype && energy >= 1) { hype = true; drop(t); }
    else if (hype && energy < 0.8) hype = false;
    dancers.setEnergy(hype ? 1.2 : energy);
    const mood = hype ? 1 : clamp01(energy);

    // Lichtstimmung: normal alle 16 Schläge neu, beim Ausrasten alle 4
    const palLen = hype ? 4 : 16;
    const palIdx = Math.floor(beat / palLen);
    const pal = PALETTES[palIdx % PALETTES.length];
    const pattern = PATTERNS[palIdx % PATTERNS.length];
    let kick = Math.max(0, 1 - (beat % 1) * 2.5);             // kurzer Impuls auf jedem Schlag
    // Mit Musik: der echte Bass treibt Boxen, Licht und Kacheln (schnell hoch, weich runter)
    const live = cfg.reactive && audio && performance.now() - audioAt < 1500;
    if (live) {
      const b = Math.min(1, Math.pow(audio.bass, 1.6) * cfg.sensitivity);
      bassEnv = b > bassEnv ? b : bassEnv + (b - bassEnv) * clamp01(dt * 10);
      kick = Math.max(kick * 0.35, bassEnv);
    } else bassEnv = 0;
    // Farben weich überblenden (letzter Schlag vor dem Wechsel)
    const blend = hype ? 0 : clamp01((beat % palLen) - (palLen - 1));
    const next = PALETTES[(palIdx + 1) % PALETTES.length];
    colA.set(pal[0]).lerp(tint.set(next[0]), blend);
    colB.set(pal[1]).lerp(tint.set(next[1]), blend);
    confColors[0].copy(colA);
    confColors[1].copy(colB);

    // Kamera (beim Drop kurz wackeln)
    const u = (t / CAM_LOOP_S) % 1;
    posCurve.getPoint(u, camPos);
    lookCurve.getPoint(u, camLook);
    camera.position.copy(camPos);
    if (t < shakeUntil) {
      const a = (shakeUntil - t) / 1.2 * 0.07;
      shakeOff.set(Math.sin(t * 61) * a, Math.sin(t * 47 + 1) * a, 0);
      camera.position.add(shakeOff);
    }
    camera.lookAt(camLook);

    // Effekte — und einmal groß, wenn der Countdown abläuft
    const info = getInfo();
    if (wasCounting && !info.countdown) drop(t);
    wasCounting = !!info.countdown;
    if (hype) {
      // im Takt: alle 8 Schläge Feuer, alle 16 Nebelmaschinen, alle 32 der nächste Drop
      if (crossedBeats(32)) drop(t);
      else if (crossedBeats(8)) fire(FIRE_NAMES[Math.floor(r() * FIRE_NAMES.length)], t, 0.45);
      if (crossedBeats(16) && !crossedBeats(32) && cfg.effects.fog) {
        for (const fm of fogMachines) { fm.from = t; fm.until = t + 2.2; }
        co2Until = t + 1.2;
      }
    } else {
      // Zeitplan nach festen Zeitpunkten (nicht nach dt — das ist gedeckelt und überspringt lange Bilder)
      if (t >= nextFire) {
        fire(FIRE_NAMES[Math.floor(r() * FIRE_NAMES.length)], t, 0.9 + r() * 0.5);
        nextFire = t + lerp(13, 7, mood) + r() * 3;
      }
      if (t >= nextFog) {
        // abwechselnd die vorderen und die hinteren Maschinen, ab und zu alle
        const all = r() < 0.25;
        if (cfg.effects.fog) {
          fogMachines.forEach((fm, i) => {
            if (all || (i >> 1) === fogSide) { fm.from = t; fm.until = t + 2.4; }
          });
        }
        fogSide = 1 - fogSide;
        nextFog = t + lerp(11, 6, mood) + r() * 2;
      }
      if (t >= nextCo2) { if (cfg.effects.fog) co2Until = t + 1.4; nextCo2 = t + lerp(22, 12, mood) + r() * 4; }
      if (t >= nextStageFog) { if (cfg.effects.fog) fogUntil = t + 6; nextStageFog = t + 26; }
    }
    prevT = t;
    emit(t, dt);
    tint.copy(colA).lerp(colB, 0.5).multiplyScalar(0.35).addScalar(0.62);
    stepParticles(smokePool, dt, tint);
    stepParticles(flamePool, dt, tint);
    stepConfetti(t, dt);
    const burning = nozzles.some((n) => t >= n.from && t < n.until + 0.2);
    fireLight.intensity = burning ? 90 * (0.7 + 0.3 * Math.sin(t * 40)) : Math.max(0, fireLight.intensity - dt * 400);
    for (const fm of fogMachines) fm.led.material.color.setRGB(t >= fm.from && t < fm.until ? 1 : 0.25, 0.08, 0.08);

    // Strobo: 16tel-Blitze
    const strobing = t < strobeUntil;
    const flash = strobing && (beat * 4) % 1 < 0.3 ? 1 : 0;
    strobe.intensity = flash * 2.4;

    // Bass: Membranen pumpen, Druckwellen laufen von den Türmen weg
    const bass = Math.pow(kick, 1.5) * (0.7 + 0.5 * mood);
    for (const cab of cabinets) {
      for (const c of cab.cones) c.position.z = 0.56 + 0.06 * bass;
      cab.group.scale.setScalar(1 + 0.012 * bass);
    }
    if (beatHit) for (const tw of towers) pulse(tw, tw.side < 0 ? colA : colB, 0.55 + 0.45 * mood);
    for (const rg of rings) {
      if (rg.age >= 1) continue;
      rg.age += dt / 0.85;
      if (rg.age >= 1) { rg.m.visible = false; continue; }
      const sc = 1 + rg.age * 7;
      rg.m.scale.set(sc, sc, 1);
      rg.m.position.copy(rg.tower.front).addScaledVector(towerFwd.set(0, 0, 1).applyQuaternion(rg.tower.tower.quaternion), rg.age * 2.4);
      rg.m.material.opacity = 0.42 * rg.strength * Math.pow(1 - rg.age, 1.6);
    }
    prevBeat = beat;

    // Moving Heads
    for (const h of heads) {
      const odd = h.i % 2;
      const k = h.i - (h.front ? 6 : 0);
      const ph = beat * Math.PI / (hype ? 4 : 8);
      let x, z;
      switch (pattern) {
        case 'sweep':
          x = Math.sin(ph) * 7 + (h.front ? 0 : (k - 2.5) * 0.6);
          z = h.front ? -1 : 0.5;
          break;
        case 'fan':
          x = h.p.x * (1.1 + 0.6 * Math.sin(ph));
          z = h.front ? -2 + Math.cos(ph) * 2 : 2 + Math.cos(ph) * 2;
          break;
        case 'circle':
          x = h.p.x * 0.6 + Math.cos(ph * 2 + k) * 3;
          z = (h.front ? -1.5 : 0.5) + Math.sin(ph * 2 + k) * 3;
          break;
        default: // cross
          x = (odd ? 1 : -1) * Math.sin(ph) * 8;
          z = h.front ? -3 : 1.5;
      }
      aim.set(x, 0, z);
      h.pivot.lookAt(aim);
      h.rig.aim(aim);
      const c = flash ? tint.set('#ffffff') : odd ? colB : colA;
      h.mat.uniforms.uColor.value.copy(c);
      h.mat.uniforms.uOpacity.value = (0.55 + 0.25 * kick) * (1 + 0.35 * mood);
      h.lens.material.color.copy(c).lerp(tileCol.set('#ffffff'), 0.5);
      if (h.light) {
        h.light.color.copy(c);
        h.light.intensity = (140 + 60 * kick) * (1 + 0.5 * mood);
        h.light.target.position.copy(aim);
      }
    }

    for (const l of washes) {
      l.color.copy(l.userData.odd ? colB : colA);
      l.intensity = (28 + 14 * kick) * (1 + 0.6 * mood);
    }

    // LED-Leisten, Bühnenkante, Pult
    stripMats[0].color.copy(colA).multiplyScalar(0.55 + 0.45 * kick);
    stripMats[1].color.copy(colB).multiplyScalar(0.55 + 0.45 * kick);
    edgeMat.color.copy(colA).lerp(colB, 0.5 + 0.5 * Math.sin(beat * Math.PI / 2));
    dj.update(t, colA, colB, kick);
    for (const l of speakerLogos) l.m.color.copy(l.side < 0 ? colA : colB).multiplyScalar(0.6 + 0.6 * kick);

    // Tanzfläche: Muster je Stimmung
    {
      let i = 0;
      for (let rr = 0; rr < TILE_ROWS; rr++) {
        for (let cc = 0; cc < TILE_COLS; cc++) {
          let f;
          switch (palIdx % 4) {
            case 0: f = 0.5 + 0.5 * Math.sin((cc - TILE_COLS / 2) * 0.7 - beat * Math.PI / 2); break;           // Welle
            case 1: f = ((cc + rr + Math.floor(beat)) % 2) ? 1 : 0.08; break;                                     // Schachbrett im Takt
            case 2: { const d = Math.hypot(cc - 4.5, rr - 3); f = 0.5 + 0.5 * Math.cos(d * 1.1 - beat * Math.PI); break; } // Ringe
            default: f = ((cc * 7 + rr * 13 + Math.floor(beat / 2) * 5) % 5 === 0) ? 1 : 0.12;                    // Funkeln
          }
          tileCol.copy((cc + rr) % 2 ? colA : colB).multiplyScalar(0.12 + 0.75 * f * (0.75 + 0.25 * kick));
          if (flash) tileCol.setRGB(1, 1, 1);
          tiles.setColorAt(i++, tileCol);
        }
      }
      tiles.instanceColor.needsUpdate = true;
    }

    // Discokugel
    ball.rotation.y = t * 0.35;
    updateDots(t * 0.35);
    dotMat.color.copy(tint.set('#ffffff')).lerp(colA, 0.25);

    // LED-Wand mit 30 Bildern/s
    const frame = Math.floor(t * 30);
    if (frame !== lastLed) {
      lastLed = frame;
      led.redraw((ctx) => drawLedWall(ctx, t, {
        countdown: info.countdown, title: info.title, dancers: dancers.count(),
        pal: ['#' + colA.getHexString(), '#' + colB.getHexString()], beat, hype,
        audio: live ? audio : null, song,
      }));
    }
    ledMat.color.setScalar(flash ? 1.6 : 1);
    ledLight.color.copy(colA).lerp(colB, 0.5).lerp(tint.set('#ffffff'), 0.5);

    dancers.update(beat, kick, dt, camera, viewW, viewH);
  };

  // Erst starten, wenn Fototexturen und Figur-Datei da sind; dann alles vorab auf die Grafikkarte
  let disposed = false;
  const ready = (async () => {
    await Promise.all([assets.ready(), dancers.ready]);
    await new Promise((r) => setTimeout(r, 0));     // pbr() setzt die Karten einen Mikrotask später
    if (disposed) return;
    stage.resize();
    tick(0, 0);
    warmUp(renderer, scene, camera, post);
    stage.start(tick);
  })();

  return {
    /** Erfüllt sich, sobald alles geladen ist und die Szene läuft. */
    ready,
    onMessage: (msg) => {
      msgTimes.push(prevT);
      dancers.onMessage(msg);
    },
    removeMessage: (id) => dancers.removeMessage(id),

    /** Einstellungen vom Steuerpult (siehe Backend sceneStore.sanitizeSettings). */
    applySettings(st) {
      if (!st) return;
      cfg.hypeMode = forceHype ? 'on' : st.hypeMode;
      cfg.hypeDancers = st.hypeDancers;
      cfg.hypeMsgs = st.hypeMsgs;
      cfg.effects = { ...st.effects };
      cfg.reactive = !!st.music?.reactive;
      cfg.sensitivity = st.music?.sensitivity ?? 1;
      clock.setManualBpm(st.bpm);
      dancers.setMaxDancers(st.maxDancers);
      dancers.setExtras(st.extras);
      dancers.setDanceMode(st.danceStyle);
    },
    /** Einmaliger Befehl vom Steuerpult. */
    command(type) {
      if (type === 'drop') drop(prevT);
      else if (type === 'fire') { fire('all', prevT, 1.2); }
      else if (type === 'clearFloor') dancers.clearFloor();
    },
    /** Musik-Rahmen aus der YTMusicApp (createMusicFeed). */
    music(m) { audio = m; audioAt = performance.now(); clock.music(m); },
    setSong(sg) { song = sg && sg.title ? { title: sg.title, artist: sg.artist || '' } : null; },
    applyLook: (userId, look) => dancers.applyLook(userId, look),
    clearDemo: () => dancers.clearDemo(),
    clearUser: (userId) => dancers.clearUser(userId),
    dispose() {
      disposed = true;
      dancers.dispose();
      envTex.dispose();
      pmrem.dispose();
      assets.dispose();
      stage.dispose();
    },
  };
}
