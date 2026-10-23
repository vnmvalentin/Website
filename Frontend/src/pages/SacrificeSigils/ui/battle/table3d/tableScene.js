// ui/battle/table3d/tableScene.js — der Spieltisch als echte 3D-Szene (three.js, lazy geladen).
//
// Die Szene liegt UNTER den Spielbildschirmen: Karten, Slots, Hand und alle Bedienung bleiben DOM.
// Sie liefert, was CSS nicht kann: echtes Holz mit Licht und Tiefe, zwei Kerzen, Staub im Kerzenlicht,
// Tintenfass und Kartenstapel. Ein Tisch für das ganze Match: jede Ansicht (Draft, Totem, Pfadkarte,
// Kampf, Rast) hat eine eigene Kameraposition, zwischen denen die Kamera fährt. Zum Einstieg kommt sie
// aus dem Dunkeln knapp über der Tischkante, während die Kerzen angezündet werden.
// Im Kampf stehen Messingwaage und beide Totems als Gegenstände neben dem Feld (tableProps.js); die
// Kerzen brennen mit den Zügen bis zum Patt herunter (STALEMATE_TURN), danach als Stummel.
// Die Pfadkarte liegt als eigenes 3D-Pergament mit Holzmarken und Spielfigur auf dem Tisch (pathMap3d.js).
//
// Kosten klein halten: in Ruhe höchstens 30 Bilder pro Sekunde, nur während Fahrten und Animationen mehr.
import * as THREE from "three";
import { makeScale, makeTotem, propMaterials } from "./tableProps.js";
import { createPathMap } from "./pathMap3d.js";
import { NODE_PATHS } from "../../path/nodePaths.js";

const FULL_H = 11;
const STUB_H = 2.4;
const CANDLE_R = 1.7;
const FPS = 30;

/** Kleiner Zufall mit Startwert — die Maserung soll bei jedem Laden gleich aussehen. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PALETTES = {
  // Eiche: warmes Braun
  moor: { base: [74, 48, 30], vary: 16, grain: "rgba(28,16,8,", light: "rgba(150,105,60,", gap: "#140b05" },
  // Treibholz: grau-grün, ausgeblichen
  gezeiten: { base: [58, 66, 66], vary: 12, grain: "rgba(18,24,26,", light: "rgba(130,145,140,", gap: "#0b1012" },
};

/** Planken mit Maserung, Ästen und Kratzern. Gibt Farb- und Rauheitstextur zurück. */
function woodTextures(zirkel) {
  const pal = PALETTES[zirkel] || PALETTES.moor;
  const r = rng(zirkel === "gezeiten" ? 41 : 17);
  const W = 2048;
  const H = 1024;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d");
  const planks = 6;
  const ph = H / planks;
  for (let p = 0; p < planks; p++) {
    const y0 = p * ph;
    const v = (r() - 0.5) * pal.vary;
    ctx.fillStyle = `rgb(${pal.base[0] + v},${pal.base[1] + v * 0.8},${pal.base[2] + v * 0.6})`;
    ctx.fillRect(0, y0, W, ph);
    // Maserung: lange, leicht gewellte Linien
    for (let i = 0; i < 70; i++) {
      const y = y0 + r() * ph;
      const amp = 2 + r() * 6;
      const freq = 0.002 + r() * 0.006;
      const phase = r() * 10;
      const dark = r() < 0.65;
      ctx.strokeStyle = (dark ? pal.grain : pal.light) + (0.08 + r() * 0.22) + ")";
      ctx.lineWidth = 0.6 + r() * 2.2;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 16) {
        const yy = y + Math.sin(x * freq + phase) * amp + Math.sin(x * freq * 3.1 + phase) * amp * 0.3;
        if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    // Äste mit Jahresringen
    const knots = Math.floor(r() * 3);
    for (let k = 0; k < knots; k++) {
      const kx = r() * W;
      const ky = y0 + ph * (0.25 + r() * 0.5);
      for (let ring = 7; ring > 0; ring--) {
        ctx.strokeStyle = pal.grain + (0.12 + ring * 0.03) + ")";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(kx, ky, ring * 7 + 4, ring * 2.6 + 2, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = pal.grain + "0.7)";
      ctx.beginPath();
      ctx.ellipse(kx, ky, 6, 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Fuge zur nächsten Planke
    ctx.fillStyle = pal.gap;
    ctx.fillRect(0, y0 + ph - 5, W, 5);
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.fillRect(0, y0, W, 2);
    // Nagelköpfe
    for (const nx of [60 + r() * 40, W / 2 + (r() - 0.5) * 80, W - 80 - r() * 40]) {
      ctx.fillStyle = "rgba(20,14,10,0.85)";
      ctx.beginPath();
      ctx.arc(nx, y0 + ph * 0.5, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Kratzer und Flecken über alles
  for (let i = 0; i < 160; i++) {
    const x = r() * W;
    const y = r() * H;
    const len = 10 + r() * 60;
    const a = (r() - 0.5) * 0.8;
    ctx.strokeStyle = r() < 0.5 ? "rgba(0,0,0,0.25)" : pal.light + "0.18)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
  for (let i = 0; i < 9; i++) {
    const x = r() * W;
    const y = r() * H;
    const rad = 30 + r() * 110;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, "rgba(10,6,3,0.35)");
    g.addColorStop(1, "rgba(10,6,3,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // Wachstropfen von früheren Partien
  for (let i = 0; i < 14; i++) {
    ctx.fillStyle = `rgba(200,184,146,${0.12 + r() * 0.16})`;
    ctx.beginPath();
    ctx.ellipse(r() * W, r() * H, 2 + r() * 4, 2 + r() * 3, r() * 3, 0, Math.PI * 2);
    ctx.fill();
  }

  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 8;

  // Rauheit: dunkle Fugen und Maserung matter, helle Stellen etwas glatter (abgegriffen)
  const rc = document.createElement("canvas");
  rc.width = W / 4;
  rc.height = H / 4;
  const rctx = rc.getContext("2d");
  rctx.filter = "grayscale(1) invert(1) contrast(0.6) brightness(1.15)";
  rctx.drawImage(c, 0, 0, rc.width, rc.height);
  const rough = new THREE.CanvasTexture(rc);
  rough.wrapS = THREE.RepeatWrapping;
  rough.wrapT = THREE.RepeatWrapping;
  return { map, rough };
}

/** Wachs mit herablaufenden Tropfen. */
function waxTexture(seed) {
  const r = rng(seed);
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, "#efe3c4");
  g.addColorStop(1, "#d8c79e");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 22; i++) {
    const x = r() * 256;
    const len = 20 + r() * 150;
    const w = 3 + r() * 9;
    ctx.fillStyle = `rgba(255,248,226,${0.35 + r() * 0.4})`;
    ctx.beginPath();
    ctx.moveTo(x - w / 2, 0);
    ctx.lineTo(x + w / 2, 0);
    ctx.lineTo(x + w / 2, len - w);
    ctx.arc(x, len - w, w / 2, 0, Math.PI);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(150,120,70,0.25)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/**
 * Durchscheinendes Wachs: oben (nah an der Flamme) leuchtet es warm, nach unten verliert sich das.
 * Als Leuchtkarte, weil die Kerze im eigenen Licht von der Seite sonst schwarz wäre.
 */
function waxGlowTexture() {
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 128;
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, "#ffb060");
  g.addColorStop(0.25, "#8a4a18");
  g.addColorStop(1, "#1c0c03");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Flamme als Shader: tropfenförmig, heller Kern, unruhiger Rand, additiv. */
function flameMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uSeed: { value: 0 }, uWild: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      uniform float uTime;
      uniform float uSeed;
      uniform float uWild;
      void main() {
        vec2 p = vUv - vec2(0.5, 0.18);
        float t = uTime * (5.0 + uWild * 4.0) + uSeed;
        // seitliches Züngeln, oben stärker
        p.x += sin(t + vUv.y * 6.0) * 0.05 * vUv.y * (1.0 + uWild * 1.5);
        // Tropfen: unten rund, oben spitz
        float w = mix(0.3, 0.03, smoothstep(0.0, 0.8, p.y));
        float d = length(vec2(p.x / max(w, 0.001), p.y < 0.0 ? p.y * 4.0 : p.y * 1.3));
        float shape = 1.0 - smoothstep(0.55, 1.0, d);
        if (shape <= 0.0) discard;
        float core = 1.0 - smoothstep(0.0, 0.55, d);
        vec3 edge = vec3(1.0, 0.42, 0.08);
        vec3 mid = vec3(1.0, 0.78, 0.38);
        vec3 hot = vec3(1.0, 0.97, 0.86);
        vec3 col = mix(edge, mid, smoothstep(0.0, 0.6, shape));
        col = mix(col, hot, core);
        // bläulicher Fuß
        col = mix(col, vec3(0.35, 0.45, 1.0), (1.0 - smoothstep(-0.08, 0.04, p.y)) * 0.6);
        gl_FragColor = vec4(col, shape * 0.95);
      }
    `,
  });
}

/** Weiche Scheibe für Staubkörner. */
function dotTexture() {
  const c = document.createElement("canvas");
  c.width = 32;
  c.height = 32;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, "rgba(255,230,190,1)");
  g.addColorStop(1, "rgba(255,230,190,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

/** Rückseite eines Kartenstapels: Weinrot mit Messingrahmen und Siegelkreis. */
function cardBackTexture() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 180;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#4a1414";
  ctx.fillRect(0, 0, 128, 180);
  ctx.strokeStyle = "#b08d57";
  ctx.lineWidth = 4;
  ctx.strokeRect(8, 8, 112, 164);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(64, 90, 26, 0, Math.PI * 2);
  ctx.moveTo(64, 58);
  ctx.lineTo(64, 122);
  ctx.moveTo(38, 90);
  ctx.lineTo(90, 90);
  ctx.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Kamerapositionen je Ansicht (Tischeinheiten). Draft/Totem/Szene etwas steiler als der Kampf, die Karte schräg
 * von vorn (die Figur läuft von unten nach oben), die Rast flacher.
 */
const POSES = {
  battle: { pos: [0, 92, 88], look: [0, 0, -6], fov: 42 },
  draft: { pos: [0, 108, 62], look: [0, 0, -3], fov: 42 },
  totem: { pos: [10, 96, 78], look: [3, 0, -6], fov: 42 },
  map: { pos: [0, 118, 92], look: [0, 0, -10], fov: 42 },
  scene: { pos: [-6, 100, 74], look: [-2, 0, -6], fov: 42 },
  rest: { pos: [0, 66, 112], look: [0, 2, -24], fov: 42 },
};
/** Weiches Oberlicht je Ansicht (im Kampf nur ein Hauch, damit Waage und Totems neben dem Feld lesbar sind). */
const FILL = { battle: 0.38, draft: 0.95, totem: 0.95, map: 1.05, scene: 0.95, rest: 0.85 };
/** Einstieg: knapp über der Tischkante, im Dunkeln. */
const INTRO_FROM = { pos: [-52, 10, 132], look: [-8, 6, 12], fov: 50 };
const INTRO_S = 3.2;
const MOVE_S = 1.6;

const ease = (x) => {
  const t = Math.min(1, Math.max(0, x));
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
};

/** Kamerazustand aus einer Pose (Position, Blickrichtung als Quaternion, Brennweite). */
function poseState(p, aspect) {
  const cam = new THREE.PerspectiveCamera(p.fov, aspect, 1, 600);
  cam.position.set(p.pos[0], p.pos[1], p.pos[2]);
  cam.lookAt(p.look[0], p.look[1], p.look[2]);
  cam.updateMatrixWorld();
  return { pos: cam.position.clone(), quat: cam.quaternion.clone(), fov: p.fov, cam };
}

/**
 * @typedef {{ x: number, y: number }} ScreenPoint  Bildschirmpunkt in CSS-Pixeln
 * @typedef {{ kind: string, label: string } | null} TotemInfo
 */

/**
 * @param {HTMLElement} host       Ebene, in die das Canvas gelegt wird (die bisherige Tisch-Hintergrundebene)
 * @param {{ zirkel?: string, reduced?: boolean, intro?: boolean, onIntroDone?: () => void }} opts
 */
export function createTableScene(host, opts = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "low-power" });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  // Keine Schattenkarten: die einzigen Lichter sind die Kerzen selbst, und eine Kerze wirft im eigenen Licht nur
  // eine harte schwarze Scheibe um ihren Fuß. Das Spielfeld darüber ist ohnehin DOM.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  const canvas = renderer.domElement;
  canvas.className = "ss-table-3d";
  host.appendChild(canvas);

  const disposables = [];
  const keep = (x) => { disposables.push(x); return x; };
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070402);
  scene.fog = new THREE.Fog(0x070402, 150, 260);

  let reduced = !!opts.reduced;
  const intro = opts.intro !== false && !reduced;
  const camera = new THREE.PerspectiveCamera(42, 1, 1, 600);
  {
    const start = poseState(intro ? INTRO_FROM : POSES.battle, 1);
    camera.position.copy(start.pos);
    camera.quaternion.copy(start.quat);
    camera.fov = start.fov;
  }

  const { map, rough } = woodTextures(opts.zirkel);
  keep(map); keep(rough);
  // Waagrecht genau einmal über den ganzen Tisch: sonst sieht man die Naht der Kachel mitten im Bild
  map.repeat.set(1, 1.5);
  rough.repeat.copy(map.repeat);
  const table = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(420, 300)),
    keep(new THREE.MeshStandardMaterial({ map, roughnessMap: rough, roughness: 0.85, metalness: 0 })),
  );
  table.rotation.x = -Math.PI / 2;
  scene.add(table);

  // Grundlicht: kaum etwas — das Licht kommt von den Kerzen
  const ambientLevel = opts.zirkel === "gezeiten" ? 0.32 : 0.26;
  const ambient = new THREE.HemisphereLight(0x8a7055, 0x0a0604, intro ? 0 : ambientLevel);
  scene.add(ambient);
  // Oberlicht abseits des Kampfs: warmer, weicher Kegel von oben, damit Draft, Karte und Rast nicht im Dunkeln liegen
  const fill = new THREE.SpotLight(0xffd9a8, 0, 0, 0.62, 0.95, 0);
  fill.position.set(0, 170, 30);
  fill.target.position.set(0, 0, -6);
  scene.add(fill, fill.target);
  let fillLevel = 0;

  // ── Kerzen ──────────────────────────────────────────────────────────────
  const profile = [];
  // Einheitshöhe 1, wird per scale.y auf die Brennhöhe gezogen; oben leicht eingesunken mit Wulst
  profile.push(new THREE.Vector2(0, 0.97));
  profile.push(new THREE.Vector2(CANDLE_R * 0.75, 0.94));
  profile.push(new THREE.Vector2(CANDLE_R * 1.02, 1.0));
  profile.push(new THREE.Vector2(CANDLE_R * 1.04, 0.96));
  for (let i = 9; i >= 0; i--) {
    const y = (i / 10) * 0.95;
    profile.push(new THREE.Vector2(CANDLE_R * (1 + Math.sin(i * 1.7) * 0.03), y));
  }
  profile.push(new THREE.Vector2(CANDLE_R * 1.08, 0));
  profile.push(new THREE.Vector2(0, 0));
  const candleGeo = keep(new THREE.LatheGeometry(profile.reverse(), 28));

  const dishProfile = [
    new THREE.Vector2(0, 0), new THREE.Vector2(4.6, 0), new THREE.Vector2(4.9, 0.25), new THREE.Vector2(4.7, 0.7),
    new THREE.Vector2(4.2, 0.55), new THREE.Vector2(2.0, 0.4), new THREE.Vector2(1.9, 0.9), new THREE.Vector2(0, 0.9),
  ];
  const dishGeo = keep(new THREE.LatheGeometry(dishProfile, 32));
  const brass = keep(new THREE.MeshStandardMaterial({ color: 0x9a7a45, roughness: 0.38, metalness: 0.85 }));
  const wickGeo = keep(new THREE.CylinderGeometry(0.08, 0.1, 0.9, 6));
  const wickMat = keep(new THREE.MeshBasicMaterial({ color: 0x110b06 }));
  const flameGeo = keep(new THREE.PlaneGeometry(4.4, 6.4));
  flameGeo.translate(0, 2.0, 0);
  const waxGlow = keep(waxGlowTexture());

  const candles = [0, 1].map((i) => {
    const group = new THREE.Group();
    const dish = new THREE.Mesh(dishGeo, brass);
    group.add(dish);
    const waxMat = keep(new THREE.MeshStandardMaterial({
      map: keep(waxTexture(31 + i * 7)), roughness: 0.55, metalness: 0,
      emissive: 0xffffff, emissiveMap: waxGlow, emissiveIntensity: 0.9,
    }));
    const body = new THREE.Mesh(candleGeo, waxMat);
    body.position.y = 0.9;
    group.add(body);
    const wick = new THREE.Mesh(wickGeo, wickMat);
    group.add(wick);
    const fmat = keep(flameMaterial());
    fmat.uniforms.uSeed.value = i * 13.7;
    const flame = new THREE.Mesh(flameGeo, fmat);
    flame.renderOrder = 5;
    group.add(flame);
    const light = new THREE.PointLight(0xffb070, 0, 260, 2);
    group.add(light);
    group.visible = false;
    scene.add(group);
    return {
      group, dish, body, wick, flame, light, waxMat, base: i === 0 ? 1 : 0.85, flick: 1, goal: 1, next: 0,
      // Anzünden beim Einstieg: 0 = aus, 1 = brennt
      lit: intro ? 0 : 1, litAt: intro ? Infinity : -1,
      target: new THREE.Vector3(), placed: false,
    };
  });

  let burnHeight = FULL_H;
  let burnGoal = FULL_H;
  let wild = false;
  const placeHeights = () => {
    for (const c of candles) {
      c.body.scale.y = burnHeight;
      const top = 0.9 + burnHeight;
      c.wick.position.y = top + 0.15;
      c.flame.position.y = top + 0.6;
      c.light.position.y = top + 3;
    }
  };
  placeHeights();

  // ── Dinge auf dem Tisch: Tintenfass mit Feder, ein Kartenstapel (weg, solange die Karte liegt) ──
  const props = new THREE.Group();
  scene.add(props);
  {
    const glass = keep(new THREE.MeshStandardMaterial({ color: 0x0d0f12, roughness: 0.12, metalness: 0.3 }));
    const pot = new THREE.Mesh(keep(new THREE.LatheGeometry([
      new THREE.Vector2(0, 0), new THREE.Vector2(3.4, 0), new THREE.Vector2(3.7, 0.6), new THREE.Vector2(3.6, 3.2),
      new THREE.Vector2(2.6, 4.4), new THREE.Vector2(1.5, 4.7), new THREE.Vector2(1.5, 5.6), new THREE.Vector2(1.8, 5.8), new THREE.Vector2(0, 5.8),
    ], 24)), glass);
    pot.position.set(-62, 0, 50);
    props.add(pot);
    const quill = new THREE.Group();
    const shaft = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.12, 0.18, 16, 6)), keep(new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.6 })));
    shaft.position.y = 8;
    const vane = new THREE.Mesh(keep(new THREE.PlaneGeometry(2.6, 11, 1, 6)), keep(new THREE.MeshStandardMaterial({ color: 0xcfc2a4, roughness: 0.9, side: THREE.DoubleSide })));
    const vp = vane.geometry.attributes.position;
    for (let k = 0; k < vp.count; k++) {
      const y = vp.getY(k);
      vp.setX(k, vp.getX(k) * Math.sin(((y + 5.5) / 11) * Math.PI) * 1.1 + 0.6);
      vp.setZ(k, Math.sin(y * 0.3) * 0.4);
    }
    vane.geometry.computeVertexNormals();
    vane.position.y = 10.5;
    quill.add(shaft, vane);
    quill.position.set(-61.5, 4.6, 50);
    quill.rotation.set(0.45, 0.6, -0.35);
    props.add(quill);
    const back = keep(cardBackTexture());
    const edgeMat = keep(new THREE.MeshStandardMaterial({ color: 0xd8cba8, roughness: 0.9 }));
    const topMat = keep(new THREE.MeshStandardMaterial({ map: back, roughness: 0.7 }));
    const deck = new THREE.Mesh(keep(new THREE.BoxGeometry(9, 2.2, 12.6)), [edgeMat, edgeMat, topMat, edgeMat, edgeMat, edgeMat]);
    deck.position.set(64, 1.1, 46);
    deck.rotation.y = -0.25;
    props.add(deck);
    const loose = new THREE.Mesh(keep(new THREE.BoxGeometry(9, 0.12, 12.6)), [edgeMat, edgeMat, topMat, edgeMat, edgeMat, edgeMat]);
    loose.position.set(73, 0.06, 52);
    loose.rotation.y = 0.35;
    props.add(loose);
  }

  // ── Waage und Totems (Kampf; ein Totem auch in der Totem-Phase) ─────────
  const pm = propMaterials();
  for (const m of Object.values(pm)) keep(m);
  const balance = makeScale(pm);
  balance.group.visible = false;
  scene.add(balance.group);
  const items = {
    scale: { obj: balance.group, show: 0, placed: false, size: 1 },
    totem0: { obj: null, show: 0, placed: false, key: "", built: null, size: 1 },
    totem1: { obj: null, show: 0, placed: false, key: "", built: null, size: 1 },
  };
  /** Totem neu schnitzen, wenn sich Kopf oder Name ändern. */
  const setTotem = (slot, info) => {
    const it = items[slot];
    const key = info ? `${info.kind}|${info.label}` : "";
    if (key === it.key) return;
    it.key = key;
    if (it.built) { scene.remove(it.built.group); it.built.dispose(); it.built = null; it.obj = null; }
    if (!info) return;
    it.built = makeTotem(pm, info.kind, info.label);
    it.obj = it.built.group;
    it.obj.rotation.y = slot === "totem1" ? 0.15 : -0.2;
    it.obj.visible = false;
    scene.add(it.obj);
  };
  setTotem("totem0", { kind: "tribe", label: "" });
  let battleTotems = [null, null];

  // ── Pfadkarte ───────────────────────────────────────────────────────────
  const pathMap = createPathMap(scene, { iconPaths: NODE_PATHS, maxAniso: renderer.capabilities.getMaxAnisotropy() });
  let mapData = null;

  // ── Staub im Licht ─────────────────────────────────────────────────────
  const DUST = 140;
  const dustPos = new Float32Array(DUST * 3);
  const dustVel = new Float32Array(DUST * 3);
  const dr = rng(5);
  for (let i = 0; i < DUST; i++) {
    dustPos[i * 3] = (dr() - 0.5) * 160;
    dustPos[i * 3 + 1] = 4 + dr() * 40;
    dustPos[i * 3 + 2] = (dr() - 0.5) * 90;
    dustVel[i * 3] = (dr() - 0.5) * 0.6;
    dustVel[i * 3 + 1] = (dr() - 0.3) * 0.4;
    dustVel[i * 3 + 2] = (dr() - 0.5) * 0.6;
  }
  const dustGeo = keep(new THREE.BufferGeometry());
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(dustGeo, keep(new THREE.PointsMaterial({
    map: keep(dotTexture()), size: 0.22, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending,
  })));
  scene.add(dust);

  // ── Kamera: Fahrten zwischen den Ansichten ──────────────────────────────
  let aspect = 1;
  let stageName = "";
  /** Zielpose der aktuellen Ansicht — auch Grundlage für die Platzierung (Bildschirm → Tisch). */
  let goal = poseState(POSES.battle, aspect);
  const move = { from: null, to: null, t0: 0, dur: 0, arc: 0, done: true };
  let introPending = intro;
  let introDone = !intro;
  const clock = new THREE.Clock();
  const now = () => clock.getElapsedTime();

  const startMove = (to, dur, arc) => {
    move.from = { pos: camera.position.clone(), quat: camera.quaternion.clone(), fov: camera.fov };
    move.to = to;
    move.t0 = now();
    move.dur = reduced ? 0 : dur;
    move.arc = arc;
    move.done = false;
  };
  const stepCamera = () => {
    if (move.done) return false;
    const k = move.dur > 0 ? Math.min(1, (now() - move.t0) / move.dur) : 1;
    const e = ease(k);
    camera.position.lerpVectors(move.from.pos, move.to.pos, e);
    camera.position.y += move.arc * Math.sin(Math.PI * e);
    camera.quaternion.slerpQuaternions(move.from.quat, move.to.quat, e);
    camera.fov = move.from.fov + (move.to.fov - move.from.fov) * e;
    camera.updateProjectionMatrix();
    if (k >= 1) {
      move.done = true;
      if (!introDone) {
        introDone = true;
        opts.onIntroDone?.();
      }
    }
    return true;
  };

  // ── Platzierung: Bildschirmpunkt → Tischpunkt (mit der Zielkamera, nicht der fahrenden) ──
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const tablePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  // Kerzen: Bildpunkt trifft die obere Kerzenhälfte, nicht den Fuß — sonst ragt die Flamme am Bildrand hinaus
  const candlePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -FULL_H * 0.75);
  // Waage und Totems: Bildpunkt auf halber Höhe des Gegenstands
  const midPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -7);
  const toPlane = (sx, sy, plane, out) => {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    ndc.set((sx / w) * 2 - 1, -(sy / h) * 2 + 1);
    ray.setFromCamera(ndc, goal.cam);
    const target = out || new THREE.Vector3();
    return ray.ray.intersectPlane(plane, target) ? target : null;
  };

  let tense = false;
  let dirty = true;
  let raf = 0;
  let last = 0;

  const resize = () => {
    const w = host.clientWidth || window.innerWidth;
    const h = host.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    aspect = w / h;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    goal.cam.aspect = aspect;
    goal.cam.updateProjectionMatrix();
    dirty = true;
  };
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();

  /** Kerzen anzünden (Einstieg): Flamme wächst, Licht kommt. */
  const igniteAt = (t0) => {
    candles[0].litAt = t0 + 0.35;
    candles[1].litAt = t0 + 0.85;
  };

  /** Welche Gegenstände zeigt die aktuelle Ansicht? */
  const wants = (key) => {
    if (key === "scale") return stageName === "battle";
    if (key === "totem0") return stageName === "totem" || (stageName === "battle" && !!battleTotems[0]);
    if (key === "totem1") return stageName === "battle" && !!battleTotems[1];
    return false;
  };

  const flameQ = new THREE.Quaternion();
  const frame = (nowMs) => {
    raf = requestAnimationFrame(frame);
    const t = now();
    const animating = !move.done || mapAnimating
      || candles.some((c) => c.lit < 1 && c.litAt <= t) || Math.abs(burnGoal - burnHeight) > 0.01
      || candles.some((c) => c.group.visible && c.group.position.distanceToSquared(c.target) > 0.01)
      || Math.abs((FILL[stageName] ?? 0) - fillLevel) > 0.01
      || Object.entries(items).some(([k, it]) => Math.abs((wants(k) && it.placed ? 1 : 0) - it.show) > 0.005)
      || scaleMoving;
    // In Ruhe reichen 30 Bilder pro Sekunde, während Fahrten und Animationen läuft es mit voller Rate
    if (!animating && nowMs - last < 1000 / FPS && !dirty) return;
    const dt = Math.min(0.1, (nowMs - last) / 1000);
    last = nowMs;

    stepCamera();

    // Kerzen gleiten zu ihren Plätzen (beim ersten Mal stehen sie sofort da)
    for (const c of candles) {
      if (!c.group.visible) continue;
      if (reduced) c.group.position.copy(c.target);
      else c.group.position.lerp(c.target, 1 - Math.exp(-dt * 3.2));
    }
    // Brennhöhe weich nachziehen
    if (Math.abs(burnGoal - burnHeight) > 0.01) {
      burnHeight += (burnGoal - burnHeight) * (reduced ? 1 : 1 - Math.exp(-dt * 2.5));
      placeHeights();
    }

    let litSum = 0;
    for (const c of candles) {
      if (c.lit < 1 && t >= c.litAt) c.lit = Math.min(1, reduced ? 1 : (t - c.litAt) / 0.55);
      litSum += c.lit;
      if (!c.group.visible) continue;
      const shown = c.flame.visible;
      if (!reduced) {
        if (t > c.next) {
          c.goal = (wild ? 0.6 : 0.8) + Math.random() * (wild ? 0.6 : 0.3);
          c.next = t + 0.06 + Math.random() * (wild ? 0.12 : 0.25);
        }
        c.flick += (c.goal - c.flick) * 0.35;
        c.flame.material.uniforms.uTime.value = t;
      }
      c.flame.material.uniforms.uWild.value = wild ? 1 : 0;
      // beim Anzünden: kurz hochschießen, dann ruhig
      const ignite = c.lit < 1 ? c.lit * (1 + 0.5 * Math.sin(c.lit * Math.PI)) : 1;
      c.flame.scale.setScalar((wild ? 1.25 : 1) * Math.max(0.001, ignite));
      c.waxMat.emissiveIntensity = 0.9 * c.lit;
      const level = (tense ? 0.62 : 1) * c.base * c.flick * (shown ? 1 : 1.6) * c.lit;
      c.light.intensity = 2600 * level;
      c.light.color.setHex(wild ? 0xff9048 : 0xffb070);
      // Flamme zeigt immer zur Kamera
      c.group.getWorldQuaternion(flameQ).invert();
      c.flame.quaternion.copy(flameQ.multiply(camera.quaternion));
    }

    // Waage und Totems: richten sich auf bzw. versinken wieder
    for (const [k, it] of Object.entries(items)) {
      if (!it.obj) continue;
      const g = wants(k) && it.placed ? 1 : 0;
      it.show += (g - it.show) * (reduced ? 1 : 1 - Math.exp(-dt * 3));
      it.obj.visible = it.show > 0.01;
      if (it.obj.visible) it.obj.scale.set(it.size, it.size * Math.max(0.01, ease(it.show)), it.size);
    }
    scaleMoving = items.scale.obj.visible && balance.update(dt, t, reduced);

    // Pfadkarte (auch hinter einer Szene bleibt sie auf dem Tisch liegen)
    mapAnimating = pathMap.update(t, reduced);
    props.visible = !(stageName === "map" || stageName === "scene") || !mapData;

    const lightUp = introDone ? 1 : Math.min(1, litSum / 2);
    ambient.intensity = ambientLevel * lightUp;
    const fillGoal = (FILL[stageName] ?? 0) * lightUp;
    fillLevel += (fillGoal - fillLevel) * (reduced ? 1 : 1 - Math.exp(-dt * 2));
    fill.intensity = fillLevel;

    if (!reduced) {
      const p = dust.geometry.attributes.position;
      for (let i = 0; i < DUST; i++) {
        for (let k = 0; k < 3; k++) dustPos[i * 3 + k] += dustVel[i * 3 + k] * dt;
        if (dustPos[i * 3 + 1] > 46 || dustPos[i * 3 + 1] < 3) dustVel[i * 3 + 1] *= -1;
        if (Math.abs(dustPos[i * 3]) > 85) dustVel[i * 3] *= -1;
        if (Math.abs(dustPos[i * 3 + 2]) > 50) dustVel[i * 3 + 2] *= -1;
      }
      p.needsUpdate = true;
    }
    renderer.render(scene, camera);
    dirty = false;
  };
  let mapAnimating = false;
  let scaleMoving = false;
  raf = requestAnimationFrame(frame);

  const api = {
    /** Ansicht wechseln: Kamera fährt hin (beim ersten Mal als Einstieg aus dem Dunkeln). */
    setStage(name) {
      const pose = POSES[name] || POSES.battle;
      goal = poseState(pose, aspect);
      if (name === stageName && !introPending) return;
      const prev = stageName;
      stageName = name;
      if (introPending) {
        introPending = false;
        igniteAt(now());
        startMove(goal, INTRO_S, 14);
      } else {
        startMove(goal, MOVE_S, name === "map" || prev === "map" ? 8 : 4);
      }
      dirty = true;
    },
    /**
     * Gegenstände an Bildschirmpunkte stellen (berechnet mit der Zielkamera der Ansicht).
     * @param {{ candles: [ScreenPoint|null, ScreenPoint|null], candleFallback?: { top: number, height: number } | null,
     *   scale?: ScreenPoint|null, totems?: [ScreenPoint|null, ScreenPoint|null], size?: number }} layout
     *   candleFallback: ohne Punkt steht die Kerze knapp außerhalb des Bildes, ihr Licht fällt trotzdem herein
     *   size: Größe von Waage und Totems (1 = normal; auf kleinen Flächen kleiner)
     */
    setLayout({ candles: pts, candleFallback = null, scale = null, totems = [null, null], size = 1 }) {
      const w = canvas.clientWidth || window.innerWidth;
      pts.forEach((pt, i) => {
        const c = candles[i];
        let p = pt ? toPlane(pt.x, pt.y, candlePlane) : null;
        const offscreen = !p;
        if (offscreen && candleFallback) p = toPlane(i === 0 ? -60 : w + 60, candleFallback.top + candleFallback.height * 0.5, tablePlane);
        c.body.visible = !offscreen;
        c.flame.visible = !offscreen;
        c.wick.visible = !offscreen;
        c.dish.visible = !offscreen;
        if (!p) { c.group.visible = false; return; }
        c.target.set(p.x, 0, p.z);
        if (!c.placed) { c.group.position.copy(c.target); c.placed = true; }
        c.group.visible = true;
      });
      const put = (it, pt) => {
        const p = pt ? toPlane(pt.x, pt.y, midPlane) : null;
        it.placed = !!p;
        it.size = size;
        if (p && it.obj) it.obj.position.set(p.x, 0, p.z);
      };
      put(items.scale, scale);
      put(items.totem0, totems[0]);
      put(items.totem1, totems[1]);
      // Totems sind niedriger als die Waage — etwas größer, damit sie neben dem Feld nicht untergehen
      items.totem0.size = size * 1.6;
      items.totem1.size = size * 1.6;
      dirty = true;
    },
    /** Kampf: Waagenstand und beide Totems ({ kind, label } oder null). */
    setBattle({ scale = 0, totems = [null, null] }) {
      balance.set(scale);
      battleTotems = totems;
      setTotem("totem0", totems[0] || { kind: "tribe", label: "" });
      setTotem("totem1", totems[1]);
      dirty = true;
    },
    /** Pfadkarte: Daten ({ map, pp, biome, cycle, subtitle, disabled }) oder null. */
    setPathMap(data) {
      mapData = data;
      pathMap.setData(data, now());
      dirty = true;
    },
    /** Pfadkarte in das Bildschirm-Rechteck legen (Tisch-Trapez der Zielkamera, Karte passt hinein). */
    setMapRect(rect) {
      const c = [[rect.left, rect.top], [rect.left + rect.width, rect.top], [rect.left, rect.top + rect.height], [rect.left + rect.width, rect.top + rect.height]]
        .map(([x, y]) => toPlane(x, y, tablePlane));
      if (c.some((p) => !p)) return;
      const farW = c[1].x - c[0].x;
      const nearW = c[3].x - c[2].x;
      const depth = c[2].z - c[0].z;
      const W = Math.min(farW, nearW) * 0.94;
      const D = Math.min(depth * 0.92, W * 1.8);
      pathMap.setArea((c[0].x + c[1].x + c[2].x + c[3].x) / 4, (c[0].z + c[2].z) / 2, W, D);
      dirty = true;
    },
    /** Welche Marke liegt unter dem Bildschirmpunkt? */
    pickMapNode(sx, sy) {
      const w = canvas.clientWidth || 1;
      const h = canvas.clientHeight || 1;
      return pathMap.pick((sx / w) * 2 - 1, -(sy / h) * 2 + 1, camera);
    },
    /** Bildschirmpunkt über einer Marke (für die Vorschau). */
    mapNodeScreen(lv, st) {
      const p = pathMap.nodeNdc(lv, st, camera);
      if (!p) return null;
      return { x: ((p.x + 1) / 2) * (canvas.clientWidth || 1), y: ((1 - p.y) / 2) * (canvas.clientHeight || 1) };
    },
    setMapHover(node) { pathMap.setHover(node); dirty = true; },
    /** f = 0 (neu) … 1 (heruntergebrannt); wild = Patt-Kerze brennt. */
    setBurn(f, isWild) {
      const h = FULL_H + (STUB_H - FULL_H) * Math.min(1, Math.max(0, f));
      if (Math.abs(h - burnGoal) > 0.01 || isWild !== wild) {
        burnGoal = h;
        wild = isWild;
        dirty = true;
      }
    },
    setTense(v) { tense = v; dirty = true; },
    setReduced(v) { reduced = v; dirty = true; },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      pathMap.dispose();
      for (const it of Object.values(items)) it.built?.dispose();
      balance.group.traverse((o) => o.geometry?.dispose?.());
      for (const d of disposables) d.dispose?.();
      renderer.dispose();
      canvas.remove();
    },
  };
  return api;
}
