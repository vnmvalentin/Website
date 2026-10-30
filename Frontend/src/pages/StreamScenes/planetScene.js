// planetScene.js — „Be Right Back“ als Mini-Planet (three.js), OBS-Quelle /overlay/brb.
//
// Der Streamer (seine Figur aus dem Figurbaukasten) läuft auf einer kleinen Kugel eine endlose
// Straße entlang; die Kamera folgt von hinten, die Straße verschwindet vorn über der Wölbung.
// Links und rechts liegen Grundstücke: wer im Chat schreibt, bekommt eines — am liebsten eines,
// das gerade im Bild liegt (das Haus wächst dann aus dem Boden), sonst eines hinter dem Horizont.
// Der Besitzer kommt aus der Tür, stellt sich ans Gartentor, winkt dem Streamer und zeigt seine
// Nachrichten als Sprechblase. Wer länger still ist, geht wieder hinein; das Haus bleibt stehen
// (auch über Neustarts der Quelle hinweg, localStorage).
//
// Am Himmel steht „BE RIGHT BACK“ aus Wolken. Modus „Störung“ (Steuerpult): die Wolken formen
// „TECHNICAL DIFFICULTIES“, der Himmel wird grau, vor dem Streamer fällt eine Baustelle vom Himmel,
// er bleibt stehen und kratzt sich am Kopf. Themen: Tag, Halloween (Nacht, Kürbisse aus dem KayKit-
// Paket, Kostüme), Winter (Abendrot, Schnee, Tannen, Schneemänner, Lichterketten).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { createAssets, createPostFX, warmUp } from '../ClashRoyale/modes/scene3d/kit';
import { createStage, canvasTexture, noise, rng, clamp01, lerp, smooth, SanitizeShader } from './sceneKit';
import {
  R, ROAD_HALF, WALK_OUT, WALK_H, SLOTS_PER_SIDE, SLOT_ANGLE, PLOT_LAT, GATE_X,
  surfacePose, bandGeometry, curbGeometry, paintMaterial, buildPlot, nameSignTexture, freeSignTexture, cloudTextPoints,
} from './planetWorld';
import { loadPeopleKit, buildPersonFigure, personSeed, COSTUMES, PERSON_WALK_MPS } from './peopleFigure';
import { createBeatClock, requestLook, cachedLook, forgetLook } from './sceneLink';
import { requestChatAvatar } from './chatAvatars';
import { buildLabel, fillBubble } from './partyDancers';
import { createPlanetRace, RACE_CMD } from './planetRace';

const TAU = Math.PI * 2;
const WALK_RATE = 1.2;                         // Gehtempo des Streamers (Clip-Geschwindigkeit)
const WALK_MPS = PERSON_WALK_MPS * WALK_RATE;
const ACTIVE_MS = 8 * 60e3;                    // so lange steht ein Chatter nach seiner Nachricht draußen
const BUBBLE_MS = 9000;
const PENDING_MS = 4 * 60e3;                   // Nachricht wartet höchstens so lange auf ihr Grundstück
const STORE_KEY = 'brbPlanet.v1';
const STORE_DAYS = 30;
const HW_URL = '/media/stream3d/halloween/halloween.glb';
const BEHIND = -0.6;
const CLOUD_DIST = 78;                         // Abstand der Wolkenschrift zur Kamera                           // ab hier (rad hinter dem Streamer) wird nichts mehr gezeichnet

const THEMES = {
  day: {
    sky: { top: '#3d8ad6', horizon: '#c4e2f3', ground: '#a7cbe0', sunDir: new THREE.Vector3(0.55, 0.62, 0.5), sunColor: '#fff6e0' },
    hemi: ['#d4e8ff', '#6f8c4c', 1.15], sun: ['#fff0d8', 2.7], sunPos: [14, 26, 12],
    fog: ['#c4e2f3', 40, 190], exposure: 1.0, bloom: 1.05,
    grass: '#86b45e', cloud: '#ffffff', cloudGlow: 0.12, lamp: 0.0, windows: 0, stars: false, snow: false,
  },
  halloween: {
    sky: { top: '#0a0518', horizon: '#3b1d50', ground: '#140b1e', sunDir: new THREE.Vector3(0.5, -0.1, -0.86), sunColor: '#737ba8' },
    hemi: ['#6050a8', '#1b1024', 0.75], sun: ['#a8b6ff', 1.0], sunPos: [-12, 18, -20],
    fog: ['#2a1638', 28, 130], exposure: 1.05, bloom: 0.92,
    grass: '#5d7448', cloud: '#cfc6e6', cloudGlow: 0.32, lamp: 1, windows: 1, stars: true, snow: false,
  },
  winter: {
    sky: { top: '#253a63', horizon: '#ebbba6', ground: '#d6dcea', sunDir: new THREE.Vector3(0.62, -0.3, -0.75), sunColor: '#ffb487' },
    hemi: ['#a9bde3', '#eef3fb', 1.0], sun: ['#ffc7a0', 1.5], sunPos: [16, 7, -20],
    fog: ['#cdbfc8', 34, 160], exposure: 1.0, bloom: 0.85,
    grass: '#eef3fb', cloud: '#fff6f0', cloudGlow: 0.2, lamp: 1, windows: 1, stars: false, snow: true,
  },
};
const STORM = { top: '#3c4350', horizon: '#8a909a', ground: '#6a6f78', cloud: '#7d838e' };

/**
 * Himmelskugel für den kleinen Planeten: von oben sieht man den Horizont etwa 30° unter Augenhöhe,
 * der Verlauf beginnt deshalb dort (skyMaterial aus kit.js färbt alles unter 0° als Boden).
 */
function planetSkyMaterial({ top, horizon, ground, sunDir, sunColor }) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: new THREE.Color(top) },
      uHorizon: { value: new THREE.Color(horizon) },
      uGround: { value: new THREE.Color(ground) },
      uSunDir: { value: sunDir.clone().normalize() },
      uSunColor: { value: new THREE.Color(sunColor) },
    },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uGround; uniform vec3 uSunDir; uniform vec3 uSunColor;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(uHorizon, uTop, pow(smoothstep(-0.55, 0.45, h), 0.8));
        col = mix(col, uGround, smoothstep(-0.55, -0.8, h));
        float s = max(dot(d, normalize(uSunDir)), 0.0);
        col += uSunColor * (pow(s, 900.0) * 14.0 + pow(s, 40.0) * 0.55 + pow(s, 6.0) * 0.18);
        gl_FragColor = vec4(col, 1.0);
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
}

const wrap = (a) => { let x = (a + Math.PI) % TAU; if (x < 0) x += TAU; return x - Math.PI; };

/** Halloween-Modelle (KayKit, CC0): ein gemeinsames Material mit Leucht-Maske für Kürbisgesichter. */
let hwKitPromise = null;
function loadHalloweenKit() {
  if (!hwKitPromise) {
    hwKitPromise = new Promise((resolve) => {
      new GLTFLoader().load(HW_URL, (gltf) => {
        const mask = canvasTexture(64, 32, (ctx) => {
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, 64, 32);
          ctx.fillStyle = '#ffa63a'; ctx.fillRect(8, 0, 8, 8);     // Kürbis innen (Feld 1,0)
          ctx.fillStyle = '#ffd27a'; ctx.fillRect(16, 24, 8, 8);   // Laternenglas (Feld 2,3)
        });
        Object.assign(mask.tex, { flipY: false, magFilter: THREE.NearestFilter, minFilter: THREE.NearestFilter, generateMipmaps: false, needsUpdate: true });
        let mat = null;
        gltf.scene.traverse((o) => {
          if (!o.isMesh) return;
          if (!mat) {
            if (o.material.map) o.material.map.colorSpace = THREE.SRGBColorSpace;
            mat = new THREE.MeshStandardMaterial({ map: o.material.map, roughness: 0.65, emissive: '#ffffff', emissiveMap: mask.tex, emissiveIntensity: 2 });
          }
          o.material = mat;
          o.castShadow = true;
        });
        gltf.scene.updateMatrixWorld(true);
        const box = new THREE.Box3();
        resolve({
          mat,
          make(name, h) {
            const proto = gltf.scene.getObjectByName(`HW_${name}`);
            if (!proto) return null;
            box.setFromObject(proto);
            const k = h / Math.max(1e-3, box.max.y - box.min.y);
            const obj = proto.clone(true);
            obj.scale.setScalar(k);
            obj.userData.lift = -box.min.y * k;
            return obj;
          },
        });
      }, undefined, () => resolve(null));
    });
  }
  return hwKitPromise;
}

/** Straße: Asphalt, durchgezogene Randlinien, gestrichelte Mitte (eine Kachel = 8 m). */
function roadTexture() {
  return canvasTexture(1024, 512, (ctx, w, h) => {
    ctx.fillStyle = '#4a4b50';
    ctx.fillRect(0, 0, w, h);
    noise(ctx, w, h, 0.09, 11, 26000);
    ctx.fillStyle = '#ecebe6';
    ctx.fillRect(0, h * 0.07, w, 10);
    ctx.fillRect(0, h * 0.93 - 10, w, 10);
    ctx.fillStyle = '#f2c64a';
    ctx.fillRect(w * 0.1, h / 2 - 6, w * 0.38, 12);
    ctx.fillRect(w * 0.6, h / 2 - 6, w * 0.38, 12);
  }, { repeat: [1, 1] });
}

/** Gehweg: helle Platten (Kachel 2 × 1,4 m). */
function pavingTexture() {
  return canvasTexture(256, 180, (ctx, w, h) => {
    ctx.fillStyle = '#b9b4ab';
    ctx.fillRect(0, 0, w, h);
    noise(ctx, w, h, 0.07, 5, 2500);
    ctx.strokeStyle = 'rgba(70,64,58,0.55)';
    ctx.lineWidth = 3;
    for (let x = 0; x <= w; x += w / 4) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y <= h; y += h / 3) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  }, { repeat: [1, 1] });
}

/** Weicher runder Fleck (Schnee, Sterne, Lampenschein). */
function dotTexture() {
  return canvasTexture(64, 64, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.75)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

/** Rot-weiße Absperrbake. */
function stripeTexture() {
  return canvasTexture(512, 64, (ctx, w, h) => {
    ctx.fillStyle = '#f4f1ea';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#d4232f';
    for (let x = -h; x < w + h; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, h); ctx.lineTo(x + 32, h); ctx.lineTo(x + 32 + h, 0); ctx.lineTo(x + h, 0); ctx.closePath();
      ctx.fill();
    }
  });
}

/** Warnschild (gelbes Dreieck mit Ausrufezeichen) für die Baustelle. */
function warnTexture() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#d4232f';
    ctx.beginPath(); ctx.moveTo(w / 2, 8); ctx.lineTo(w - 8, h - 20); ctx.lineTo(8, h - 20); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffd23a';
    ctx.beginPath(); ctx.moveTo(w / 2, 48); ctx.lineTo(w - 42, h - 40); ctx.lineTo(42, h - 40); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#1b1b1b';
    ctx.fillRect(w / 2 - 11, 100, 22, 70);
    ctx.fillRect(w / 2 - 11, 182, 22, 22);
  });
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {HTMLElement} overlay  Ebene für Namensschilder und Sprechblasen
 * @param {{ onFatal?: (reason: string) => void, store?: boolean }} opts  store: Grundstücke im Browser merken
 */
export function createPlanetScene(canvas, overlay, { onFatal, store = true } = {}) {
  let viewW = 1920, viewH = 1080;
  const stage = createStage(canvas, { fov: 46, far: 600, onFatal, onResize: (w, h) => { viewW = w; viewH = h; } });
  const { scene, camera, renderer } = stage;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const assets = createAssets(renderer, { timeoutMs: 15000 });
  const post = createPostFX(renderer, scene, camera, { bloom: { strength: 0.45, radius: 0.5, threshold: 1.05 }, vignette: 0.22 });
  post.composer.insertPass(new ShaderPass(SanitizeShader), 1);
  stage.setPost(post);
  const clock = createBeatClock(100);
  const owned = [];                              // Texturen/Materialien/Geometrien zum Aufräumen
  const keep = (x) => { owned.push(x); return x; };

  const cfg = { mode: 'brb', theme: 'day' };
  let disposed = false;

  // ── Himmel, Licht, Nebel ──
  const skyMat = keep(planetSkyMaterial(THEMES.day.sky));
  const sky = new THREE.Mesh(keep(new THREE.SphereGeometry(500, 32, 16)), skyMat);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  scene.add(sky);
  scene.fog = new THREE.Fog('#c4e2f3', 40, 190);
  const hemi = new THREE.HemisphereLight('#ffffff', '#556644', 1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffffff', 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 90 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  sun.target.position.set(0, 0, -8);
  scene.add(sun, sun.target);

  // ── Planet ──
  const planet = new THREE.Group();
  planet.position.y = -R;
  scene.add(planet);
  const std = (o) => keep(new THREE.MeshStandardMaterial({ roughness: 0.9, ...o }));
  const grassMat = assets.pbr(std({ color: THEMES.day.grass }), 'leafy_grass', 70, 35, { normalScale: 0.8 });
  const groundGeo = keep(new THREE.SphereGeometry(R, 192, 96));
  groundGeo.rotateZ(Math.PI / 2);                // Pole auf die x-Achse: die Straße läuft auf dem Äquator
  const ground = new THREE.Mesh(groundGeo, grassMat);
  ground.receiveShadow = true;
  planet.add(ground);
  const roadTex = keep(roadTexture().tex);
  const roadMat = assets.pbr(std({ map: roadTex, roughness: 0.85 }), 'rough_concrete', 2, 1.3, { noMap: true, noArm: true, normalScale: 0.6 });
  const road = new THREE.Mesh(keep(bandGeometry(-ROAD_HALF, ROAD_HALF, 0.03, { tileLen: 8 })), roadMat);
  road.receiveShadow = true;
  planet.add(road);
  const paveTex = keep(pavingTexture().tex);
  const paveMat = std({ map: paveTex, roughness: 0.92 });
  for (const s of [-1, 1]) {
    const lat0 = s > 0 ? ROAD_HALF : -WALK_OUT, lat1 = s > 0 ? WALK_OUT : -ROAD_HALF;
    const walk = new THREE.Mesh(keep(bandGeometry(lat0, lat1, WALK_H, { tileLen: 2, across: 2 })), paveMat);
    walk.receiveShadow = true;
    planet.add(walk);
  }
  const curbMat = std({ color: '#a19d96', side: THREE.DoubleSide });
  for (const s of [-1, 1]) {
    planet.add(new THREE.Mesh(keep(curbGeometry(s * ROAD_HALF, 0.03, WALK_H, -s)), curbMat));
    planet.add(new THREE.Mesh(keep(curbGeometry(s * WALK_OUT, -0.02, WALK_H, s)), curbMat));
  }

  // ── Grundstücke ──
  const paintMat = keep(paintMaterial());
  const lampMat = keep(new THREE.MeshBasicMaterial({ color: '#ffe2a8', toneMapped: false }));
  const lampGeo = keep(new THREE.BoxGeometry(0.4, 0.05, 0.3));
  const signGeo = keep(new THREE.PlaneGeometry(1.36, 0.42));
  const freeTex = keep(freeSignTexture().tex);
  const freeSignMat = std({ map: freeTex, roughness: 0.8, emissive: '#ffffff', emissiveMap: freeTex, emissiveIntensity: 0 });
  const bulbGeo = keep(new THREE.SphereGeometry(0.07, 6, 4));
  const bulbMat = keep(new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }));
  const XMAS = ['#ff3b3b', '#ffd23a', '#3bff7a', '#3bb5ff', '#ff7ad8'].map((c) => new THREE.Color(c).multiplyScalar(2.4));

  const slots = [];
  for (const side of [-1, 1]) {
    for (let k = 0; k < SLOTS_PER_SIDE; k++) {
      const a = (k + (side > 0 ? 0.5 : 0)) * SLOT_ANGLE;
      const outer = new THREE.Group();
      surfacePose(outer, a, side * PLOT_LAT, 0);
      const inner = new THREE.Group();
      inner.rotation.y = side < 0 ? 0 : Math.PI;
      outer.add(inner);
      planet.add(outer);
      slots.push({
        i: slots.length, side, a, tc: side < 0 ? 1 : -1, outer, inner, owner: null, built: null,
        glassMat: std({ color: '#2b3747', roughness: 0.15, metalness: 0.3, emissive: '#ffb766', emissiveIntensity: 0 }),
        pop: 1, hwItems: [], lights: null, rel: 0, visible: false,
      });
    }
  }

  let hwKit = null;
  const placeHalloween = (slot) => {
    if (!hwKit || !slot.built || slot.hwItems.length) return;
    for (const [name, x, z, h, rot, y = 0] of slot.built.hw) {
      const obj = hwKit.make(name, h);
      if (!obj) continue;
      obj.position.set(x, y + obj.userData.lift - (x * x + z * z) / (2 * R), z);
      obj.rotation.y = rot;
      obj.visible = cfg.theme === 'halloween';
      slot.inner.add(obj);
      slot.hwItems.push(obj);
    }
  };

  /** Grundstück neu bauen (leer oder mit Haus des Besitzers). */
  const buildSlot = (slot) => {
    const old = slot.built;
    if (old) {
      for (const m of Object.values(old.meshes)) if (m) { slot.inner.remove(m); m.geometry.dispose(); }
      slot.inner.remove(old.signMesh);
      if (old.lampMesh) slot.inner.remove(old.lampMesh);
      if (old.signTex) { old.signTex.dispose(); old.signMesh.material.dispose(); }
      for (const o of slot.hwItems) slot.inner.remove(o);
      slot.hwItems = [];
      if (slot.lights) { slot.inner.remove(slot.lights); slot.lights.dispose(); slot.lights = null; }
    }
    const owner = slot.owner;
    const b = buildPlot({ seed: owner ? personSeed(owner.userId) : 7919 * (slot.i + 1), tc: slot.tc, owned: !!owner, paintMat, glassMat: slot.glassMat, lamp: slot.i % 2 === 0 });
    for (const m of Object.values(b.meshes)) if (m) slot.inner.add(m);
    // Schild
    let signMat = freeSignMat;
    if (owner) {
      b.signTex = nameSignTexture(owner.name, owner.color).tex;
      signMat = new THREE.MeshStandardMaterial({ map: b.signTex, roughness: 0.8, emissive: '#ffffff', emissiveMap: b.signTex, emissiveIntensity: THEMES[cfg.theme].windows ? 0.35 : 0 });
    }
    b.signMesh = new THREE.Mesh(signGeo, signMat);
    b.signMesh.position.set(b.sign.x, b.sign.y, b.sign.z);
    b.signMesh.rotation.y = b.sign.yaw;
    slot.inner.add(b.signMesh);
    // Laternen-Leuchtfläche
    if (b.lamp) {
      b.lampMesh = new THREE.Mesh(lampGeo, lampMat);
      b.lampMesh.position.copy(b.lamp);
      slot.inner.add(b.lampMesh);
    }
    // Lichterkette (Winter)
    if (b.lights.length) {
      const inst = new THREE.InstancedMesh(bulbGeo, bulbMat, b.lights.length);
      const m = new THREE.Matrix4();
      b.lights.forEach((p, i) => { inst.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z)); inst.setColorAt(i, XMAS[i % XMAS.length]); });
      inst.visible = cfg.theme === 'winter';
      slot.lights = inst;
      slot.inner.add(inst);
    }
    slot.built = b;
    applySlotTheme(slot);
    if (hwKit) placeHalloween(slot);
  };

  const applySlotTheme = (slot) => {
    const b = slot.built;
    if (!b) return;
    const th = cfg.theme;
    if (b.meshes.day) b.meshes.day.visible = th !== 'winter' && th !== 'halloween';
    if (b.meshes.winter) b.meshes.winter.visible = th === 'winter';
    for (const o of slot.hwItems) o.visible = th === 'halloween';
    if (slot.lights) slot.lights.visible = th === 'winter';
    const night = THEMES[th].windows;
    slot.glassMat.emissiveIntensity = !night ? 0 : slot.owner?.fig ? 1.6 : slot.owner ? 0.45 : 0;
    if (b.signTex) b.signMesh.material.emissiveIntensity = night ? 0.35 : 0;
  };

  // Lampenschein (ein Punkt je Laterne, alle in einem Zeichenaufruf)
  const dotTex = keep(dotTexture().tex);
  const haloPos = [];
  const tmpV = new THREE.Vector3();
  planet.updateMatrixWorld(true);
  const planetInv = new THREE.Matrix4();
  for (const s of slots) {
    if (s.i % 2) continue;                      // Laterne nur an jedem zweiten Grundstück
    s.outer.updateMatrixWorld(true);
    planetInv.copy(planet.matrixWorld).invert();
    // Lage der Laterne ist bei allen Grundstücken gleich (buildPlot) — einmal über ein leeres Grundstück ermitteln
    const lx = PLOT_LAT - 3.7 + 0.85, lz = -4.5;
    tmpV.set(lx, 3.95 + WALK_H - (lx * lx + lz * lz) / (2 * R), lz);
    s.inner.localToWorld(tmpV).applyMatrix4(planetInv);
    haloPos.push(tmpV.x, tmpV.y, tmpV.z);
  }
  const haloGeo = keep(new THREE.BufferGeometry());
  haloGeo.setAttribute('position', new THREE.Float32BufferAttribute(haloPos, 3));
  const haloMat = keep(new THREE.PointsMaterial({ map: dotTex, color: '#ffcf87', size: 2.4, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  const halos = new THREE.Points(haloGeo, haloMat);
  halos.frustumCulled = false;
  planet.add(halos);

  // ── Besitzer (Chatter mit Grundstück) ──
  const owners = new Map();                      // userId → owner
  let kit = null;
  let saveTimer = 0;
  const persist = () => {
    if (!store) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        const list = [...owners.values()].filter((o) => !o.demo).map((o) => ({ u: o.userId, n: o.name, c: o.color, s: o.slot.i, t: o.lastAt }));
        localStorage.setItem(STORE_KEY, JSON.stringify(list));
      } catch { /* ohne Speicher: Grundstücke gelten nur bis zum Neuladen */ }
    }, 1500);
  };

  const relOf = (slot) => wrap(slot.a - phi);
  let visAhead = 0.75;                          // ab hier liegt ein Haus hinter dem Horizont (unten berechnet)

  /** Freies Grundstück: zuerst eines im Bild (vor dem Streamer), sonst das nächste hinter dem Horizont. */
  const pickSlot = () => {
    let best = null, bestScore = Infinity;
    for (const s of slots) {
      if (s.owner) continue;
      const rel = relOf(s);
      let score;
      if (rel > 0.06 && rel < visAhead - 0.08) score = rel;               // im Bild: sofort, mit Wachsen
      else if (rel >= visAhead - 0.08) score = 10 + rel;                  // kommt bald über den Horizont
      else continue;                                                     // schon vorbei
      if (score < bestScore) { bestScore = score; best = s; }
    }
    if (best) return best;
    // alles belegt: wer am längsten still ist und gerade nicht zu sehen ist, macht Platz
    let lru = null;
    for (const s of slots) {
      const o = s.owner;
      if (!o || o.fig || (relOf(s) > BEHIND && relOf(s) < visAhead)) continue;
      if (!lru || o.lastAt < lru.owner.lastAt) lru = s;
    }
    if (lru) { releaseOwner(lru.owner); return lru; }
    return null;
  };

  const releaseOwner = (o) => {
    removeFigure(o);
    owners.delete(o.userId);
    if (o.slot.owner === o) { o.slot.owner = null; buildSlot(o.slot); }
  };

  const assign = (o, slot) => {
    if (o.slot && o.slot.owner === o) { o.slot.owner = null; buildSlot(o.slot); }
    o.slot = slot;
    slot.owner = o;
    buildSlot(slot);
    // im Bild: Haus wächst aus dem Boden
    if (slot.visible) slot.pop = 0;
  };

  // Figuren
  const removeFigure = (o) => {
    if (!o.fig) return;
    o.slot.inner.remove(o.fig.group);
    o.fig.dispose();
    o.fig = null;
    o.label?.el.remove();
    o.label = null;
    applySlotTheme(o.slot);
  };

  const makeFigure = (o) => {
    if (!kit || o.fig) return;
    const look = cachedLook(o.userId);
    const fig = buildPersonFigure(kit, { seed: personSeed(o.userId), look, pool: cfg.theme === 'halloween' && !look ? COSTUMES : null });
    o.fig = fig;
    o.figLook = !!look;
    requestLook(o.userId, (lk) => { if (lk && o.fig === fig) { fig.setOutfit(lk); o.figLook = true; } });
    const door = o.slot.built?.door;
    const walkOut = o.slot.visible && door;
    fig.group.position.set(walkOut ? door.x : GATE_X, 0, 0);
    o.walk = walkOut ? { from: door.x, to: GATE_X, t: 0 } : null;
    o.yaw = walkOut ? Math.PI / 2 : Math.atan2(1, 0.45 * o.slot.tc);
    fig.group.rotation.y = o.yaw;
    fig.play(walkOut ? 'walk' : 'idle', { fade: 0 });
    o.slot.inner.add(fig.group);
    o.label = buildLabel(o.name, o.color, true);
    o.label.el.style.display = 'none';
    overlay.append(o.label.el);
    const lb = o.label;
    requestChatAvatar({ userId: o.userId, login: o.login }, (img) => { if (img && lb.avatar) { lb.avatar.src = img.src; lb.avatar.hidden = false; } });
    applySlotTheme(o.slot);
  };

  // Gespeicherte Grundstücke wiederherstellen (ohne Figuren — die kommen, sobald jemand schreibt)
  if (store) {
    try {
      const list = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
      const cutoff = Date.now() - STORE_DAYS * 86400e3;
      for (const e of Array.isArray(list) ? list : []) {
        const slot = slots[e?.s];
        if (!slot || slot.owner || typeof e.u !== 'string' || typeof e.n !== 'string' || !(e.t > cutoff)) continue;
        const o = { userId: e.u, name: e.n.slice(0, 25), login: e.n.toLowerCase(), color: typeof e.c === 'string' ? e.c : '#9b9b9b', lastAt: e.t, slot, fig: null, label: null, pending: null, bubbleUntil: 0, waveUntil: 0, waveAt: 0, activeUntil: 0 };
        slot.owner = o;
        owners.set(o.userId, o);
      }
    } catch { /* kaputter Speicher: neu anfangen */ }
  }
  for (const s of slots) buildSlot(s);

  // ── Streamer ──
  let channel = '';
  let me = null;                                 // { fig, label, bubbleUntil }
  const meGroup = new THREE.Group();
  scene.add(meGroup);
  const buildMe = () => {
    if (!kit || !channel) return;
    if (me) { meGroup.remove(me.fig.group); me.fig.dispose(); me.label.el.remove(); }
    const fig = buildPersonFigure(kit, { seed: personSeed(channel), look: cachedLook(null, channel) });
    fig.group.rotation.y = Math.PI;
    fig.play('walk', { fade: 0, timeScale: WALK_RATE });
    meGroup.add(fig.group);
    const label = buildLabel(channel, '#ffffff', true);
    label.el.classList.add('sp-tag--dj');
    overlay.append(label.el);
    me = { fig, label, bubbleUntil: 0, anim: 'walk' };
    if (import.meta.env.DEV) window.__brb = { me, owners, slots, kit, race };     // Prüfskripte
    const ch = channel;
    requestLook(null, (lk) => { if (lk && me?.fig === fig) fig.setOutfit(lk); }, ch);
    requestChatAvatar({ login: ch }, (img) => { if (img && label.avatar) { label.avatar.src = img.src; label.avatar.hidden = false; } });
  };

  // ── Wolkenschrift ──
  const TEXTS = {
    brb: cloudTextPoints(['BE RIGHT BACK'], 84, { step: 0.6 }),
    difficulties: cloudTextPoints(['TECHNICAL', 'DIFFICULTIES'], 62, { step: 0.62, seed: 9 }),
  };
  const PUFFS = Math.max(TEXTS.brb.length, TEXTS.difficulties.length);
  const cloudMat = std({ color: '#ffffff', roughness: 1, emissive: '#ffffff', emissiveIntensity: 0.12, fog: false });
  const puffGeo = keep(new THREE.IcosahedronGeometry(1, 1));   // grob reicht: aus 80 m Entfernung sieht man keine Kanten
  const puffs = new THREE.InstancedMesh(puffGeo, cloudMat, PUFFS);
  puffs.frustumCulled = false;
  const cloudText = new THREE.Group();
  cloudText.add(puffs);
  scene.add(cloudText);
  const pf = Array.from({ length: PUFFS }, (_, i) => ({ x: 0, y: 0, z: 0, s: 0, fx: 0, fy: 0, fz: 0, fs: 0, tx: 0, ty: 0, tz: 0, ts: 0, t0: -1, delay: 0, ph: i * 1.7 }));
  const setCloudText = (key, now, instant = false) => {
    const pts = [...TEXTS[key]].sort((p, q) => p.x - q.x);
    const order = pf.map((p, i) => i).sort((i, j) => pf[i].x - pf[j].x);
    const r = rng(key.length * 31);
    order.forEach((idx, n) => {
      const p = pf[idx];
      const q = pts[Math.round((n / Math.max(1, order.length - 1)) * (pts.length - 1))];
      p.fx = p.x; p.fy = p.y; p.fz = p.z; p.fs = p.s;
      if (n < pts.length) {
        const tq = pts[n];
        p.tx = tq.x; p.ty = tq.y; p.tz = (r() - 0.5) * 2.2; p.ts = tq.r;
      } else {
        // übrige Wolken lösen sich auf, wo sie gerade sind
        p.tx = q ? q.x : p.x; p.ty = (q ? q.y : p.y) + 2; p.tz = p.z; p.ts = 0;
      }
      p.t0 = instant ? -1 : now;
      p.delay = instant ? 0 : 0.2 + ((p.tx + 40) / 80) * 1.2 + r() * 0.4;
      if (instant) { p.x = p.tx; p.y = p.ty; p.z = p.tz; p.s = p.ts; }
    });
  };
  setCloudText('brb', 0, true);
  const _mat = new THREE.Matrix4();
  const _pos = new THREE.Vector3();
  const _quat = new THREE.Quaternion();
  const _scl = new THREE.Vector3();
  const updatePuffs = (t) => {
    for (let i = 0; i < PUFFS; i++) {
      const p = pf[i];
      if (p.t0 >= 0) {
        const k = smooth((t - p.t0 - p.delay) / 2.4);
        const arc = Math.sin(Math.PI * k) * 3;
        p.x = lerp(p.fx, p.tx, k); p.y = lerp(p.fy, p.ty, k) + arc; p.z = lerp(p.fz, p.tz, k);
        p.s = lerp(p.fs, p.ts, k);
        if (k >= 1) p.t0 = -1;
      }
      const bob = Math.sin(t * 0.7 + p.ph) * 0.12;
      const br = 1 + Math.sin(t * 0.9 + p.ph * 1.3) * 0.06;
      _mat.compose(_pos.set(p.x, p.y + bob, p.z), _quat, _scl.setScalar(Math.max(1e-4, p.s * br)));
      puffs.setMatrixAt(i, _mat);
    }
    puffs.instanceMatrix.needsUpdate = true;
  };

  // Freie Wolken am Himmel (drehen sich langsam)
  const skyClouds = new THREE.Group();
  {
    const r = rng(77);
    const mats = [];
    for (let c = 0; c < 14; c++) {
      const ang = (c / 14) * TAU + r() * 0.3;
      const dist = 140 + r() * 60;
      const cy = -26 + r() * 30;
      const n = 6 + Math.floor(r() * 7);
      for (let i = 0; i < n; i++) {
        const s = 3 + r() * 4;
        mats.push(_mat.compose(_pos.set(Math.cos(ang) * dist + (r() - 0.5) * 16, cy + (r() - 0.3) * 4, Math.sin(ang) * dist + (r() - 0.5) * 10), _quat, _scl.set(s * 1.4, s, s)).clone());
      }
    }
    const inst = new THREE.InstancedMesh(puffGeo, cloudMat, mats.length);
    mats.forEach((m, i) => inst.setMatrixAt(i, m));
    inst.frustumCulled = false;
    skyClouds.add(inst);
  }
  scene.add(skyClouds);

  // ── Sterne (Halloween) und Schnee (Winter) ──
  const stars = (() => {
    const r = rng(5);
    const p = [];
    for (let i = 0; i < 1200; i++) {
      const az = r() * TAU, el = Math.asin(-0.75 + r() * 1.75);
      p.push(Math.cos(az) * Math.cos(el) * 450, Math.sin(el) * 450, Math.sin(az) * Math.cos(el) * 450);
    }
    const g = keep(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    const pts = new THREE.Points(g, keep(new THREE.PointsMaterial({ map: dotTex, color: '#e8e4ff', size: 2.2, sizeAttenuation: false, transparent: true, depthWrite: false, fog: false })));
    pts.frustumCulled = false;
    pts.visible = false;
    scene.add(pts);
    return pts;
  })();
  const SNOW_N = 2200;
  const snowPos = new Float32Array(SNOW_N * 3);
  const snowSeed = new Float32Array(SNOW_N);
  {
    const r = rng(9);
    for (let i = 0; i < SNOW_N; i++) {
      snowPos[i * 3] = (r() - 0.5) * 70; snowPos[i * 3 + 1] = r() * 30; snowPos[i * 3 + 2] = (r() - 0.5) * 70 - 15;
      snowSeed[i] = r() * 10;
    }
  }
  const snowGeo = keep(new THREE.BufferGeometry());
  snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
  const snow = new THREE.Points(snowGeo, keep(new THREE.PointsMaterial({ map: dotTex, color: '#ffffff', size: 0.16, transparent: true, depthWrite: false, opacity: 0.95 })));
  snow.frustumCulled = false;
  snow.visible = false;
  scene.add(snow);

  // ── Baustelle (Modus „Störung“) ──
  const site = (() => {
    const g = new THREE.Group();
    const parts = [];                             // { obj, y } für Herunterfallen / Versinken
    const stripe = keep(stripeTexture().tex);
    const barMat = std({ map: stripe, roughness: 0.6 });
    const legMat = std({ color: '#2a2a2e', roughness: 0.6 });
    // y über der Oberfläche; die Wölbung zieht weiter außen liegende Teile etwas nach unten
    const sinkOf = (o) => (o.position.x ** 2 + o.position.z ** 2) / (2 * R);
    const add = (obj, y, flat = false) => {
      const yy = y - sinkOf(obj);
      obj.position.y = yy; obj.castShadow = !flat; g.add(obj); parts.push({ obj, y: yy, flat }); return obj;
    };
    const barrier = new THREE.Group();
    for (const y of [1.0, 0.55]) {
      const b = new THREE.Mesh(keep(new THREE.BoxGeometry(5.0, 0.3, 0.07)), barMat);
      b.position.y = y; b.castShadow = true; barrier.add(b);
    }
    for (const x of [-2.3, 2.3]) {
      for (const dz of [-0.25, 0.25]) {
        const l = new THREE.Mesh(keep(new THREE.BoxGeometry(0.07, 1.25, 0.07)), legMat);
        l.position.set(x, 0.6, dz * 0.5); l.rotation.x = dz > 0 ? 0.28 : -0.28; l.castShadow = true; barrier.add(l);
      }
    }
    const blinkMat = keep(new THREE.MeshBasicMaterial({ color: '#ffae1a', toneMapped: false }));
    const blinkMat2 = keep(new THREE.MeshBasicMaterial({ color: '#ffae1a', toneMapped: false }));
    const blinkGeo = keep(new THREE.SphereGeometry(0.11, 10, 8));
    for (const [x, m] of [[-2.1, blinkMat], [0, blinkMat2], [2.1, blinkMat]]) {
      const b = new THREE.Mesh(blinkGeo, m); b.position.set(x, 1.3, 0); barrier.add(b);
    }
    add(barrier, 0.03);
    // Pylonen
    const coneGeo = keep(new THREE.ConeGeometry(0.22, 0.75, 14));
    const coneMat = std({ color: '#ff6a1a', roughness: 0.55 });
    const bandGeo = keep(new THREE.CylinderGeometry(0.115, 0.15, 0.12, 14));
    const white = std({ color: '#f4f4f4', roughness: 0.5 });
    const cones = [[-1.9, 0.9], [-0.7, 1.2], [0.7, 1.1], [1.9, 0.8], [-2.25, 2.6], [2.2, 2.3]];
    for (const [x, z] of cones) {
      const c = new THREE.Group();
      const body = new THREE.Mesh(coneGeo, coneMat); body.position.y = 0.4; body.castShadow = true;
      const band = new THREE.Mesh(bandGeo, white); band.position.y = 0.48;
      const foot = new THREE.Mesh(keep(new THREE.BoxGeometry(0.5, 0.05, 0.5)), coneMat); foot.position.y = 0.025;
      c.add(body, band, foot);
      c.position.set(x, 0, z);
      add(c, 0.03);
    }
    // Loch in der Straße mit Erdhaufen
    const hole = new THREE.Mesh(keep(new THREE.CircleGeometry(1.1, 24)), std({ color: '#1b1511', roughness: 1 }));
    hole.rotation.x = -Math.PI / 2; hole.scale.set(1.3, 0.8, 1); hole.position.set(-0.4, 0, -1.6);
    add(hole, 0.05, true);
    const dirt = new THREE.Mesh(keep(new THREE.IcosahedronGeometry(0.9, 1)), std({ color: '#6b4a32', roughness: 1, flatShading: true }));
    dirt.scale.set(1.2, 0.55, 1); dirt.castShadow = true;
    dirt.position.set(1.4, 0, -2.2);
    add(dirt, 0.05);
    // Kaputter Verteilerkasten mit Funken
    const boxMat = std({ color: '#7b8590', roughness: 0.45, metalness: 0.5 });
    const cab = new THREE.Group();
    const body = new THREE.Mesh(keep(new THREE.BoxGeometry(0.9, 1.35, 0.55)), boxMat); body.position.y = 0.68; body.castShadow = true;
    const doorM = new THREE.Mesh(keep(new THREE.BoxGeometry(0.4, 1.1, 0.04)), boxMat); doorM.position.set(0.6, 0.68, 0.3); doorM.rotation.y = -1.1;
    cab.add(body, doorM);
    cab.position.set(3.1, WALK_H, -0.8);
    cab.rotation.y = -0.4;
    add(cab, WALK_H);
    // Warnschild
    const warn = new THREE.Group();
    const post0 = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.04, 0.04, 1.5, 8)), legMat); post0.position.y = 0.75;
    const wmat = keep(new THREE.MeshStandardMaterial({ map: keep(warnTexture().tex), transparent: true, roughness: 0.6, side: THREE.DoubleSide }));
    const plate = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.85, 0.85)), wmat); plate.position.set(0, 1.5, 0.03);
    warn.add(post0, plate);
    warn.position.set(-3.1, 0, 2.2);
    warn.rotation.y = 0.35;
    add(warn, WALK_H);
    // Funken (Punkte, die aus dem Kasten springen)
    const SPARKS = 90;
    const sp = new Float32Array(SPARKS * 3);
    const sv = new Float32Array(SPARKS * 3);
    const sl = new Float32Array(SPARKS);
    const sg = keep(new THREE.BufferGeometry());
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    const sparks = new THREE.Points(sg, keep(new THREE.PointsMaterial({ map: dotTex, color: '#ffd27a', size: 0.14, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
    sparks.frustumCulled = false;
    g.add(sparks);
    const sparkFrom = new THREE.Vector3(3.0, 1.15 + WALK_H, -0.55);
    let burst = 0;
    g.visible = false;
    planet.add(g);
    return {
      group: g, parts, sparks, blinkMat, blinkMat2,
      state: 'off',                                // off | drop | on | sink
      t0: 0,
      a: 0,
      update(t, dt) {
        if (this.state === 'off') return;
        const since = t - this.t0;
        parts.forEach((p, i) => {
          const d = i * 0.12;
          if (this.state === 'drop' || this.state === 'on') {
            const k = clamp01((since - d) / 0.9);
            // Fall mit kleinem Aufprall-Hüpfer
            const y = k < 1 ? (1 - k * k) * 14 : 0;
            const hop = k >= 1 ? Math.max(0, Math.sin(Math.min(1, (since - d - 0.9) / 0.35) * Math.PI)) * 0.25 : 0;
            // Skalierung nie 0 (sonst ungültige Normalenmatrix → NaN → schwarze Blöcke im Bloom)
            if (p.flat) { const s = Math.max(0.01, k); p.obj.scale.set(1.3 * s, 0.8 * s, 1); p.obj.position.y = p.y; }
            else p.obj.position.y = p.y + y + hop;
            p.obj.visible = since > d;
          } else if (this.state === 'sink') {
            const k = clamp01((since - d * 0.5) / 0.6);
            const s = Math.max(0.01, 1 - k);
            if (p.flat) p.obj.scale.set(1.3 * s, 0.8 * s, 1);
            else { p.obj.position.y = p.y - k * 2.5; p.obj.scale.setScalar(Math.max(0.05, 1 - k * 0.9)); }
          }
        });
        if (this.state === 'drop' && since > parts.length * 0.12 + 1.4) this.state = 'on';
        if (this.state === 'sink' && since > parts.length * 0.06 + 0.8) {
          this.state = 'off';
          g.visible = false;
          parts.forEach((p) => { p.obj.scale.set(p.flat ? 1.3 : 1, p.flat ? 0.8 : 1, 1); p.obj.position.y = p.y; });
        }
        // Blinklichter abwechselnd
        const on = Math.floor(t * 2.2) % 2 === 0;
        blinkMat.color.set(on ? '#ffb21f' : '#3a2600');
        blinkMat2.color.set(on ? '#3a2600' : '#ffb21f');
        if (on) blinkMat.color.multiplyScalar(2.2); else blinkMat2.color.multiplyScalar(2.2);
        // Funken: alle paar Sekunden ein Schwall
        burst -= dt;
        const live = this.state !== 'sink';
        if (live && burst <= 0) {
          burst = 0.9 + Math.random() * 2.2;
          let n = 0;
          for (let i = 0; i < SPARKS && n < 30; i++) {
            if (sl[i] > 0) continue;
            sl[i] = 0.5 + Math.random() * 0.5;
            sp[i * 3] = sparkFrom.x; sp[i * 3 + 1] = sparkFrom.y; sp[i * 3 + 2] = sparkFrom.z;
            sv[i * 3] = (Math.random() - 0.7) * 3; sv[i * 3 + 1] = 1 + Math.random() * 3; sv[i * 3 + 2] = (Math.random() - 0.3) * 3;
            n++;
          }
        }
        for (let i = 0; i < SPARKS; i++) {
          if (sl[i] <= 0) { sp[i * 3 + 1] = -100; continue; }
          sl[i] -= dt;
          sv[i * 3 + 1] -= 9.8 * dt;
          sp[i * 3] += sv[i * 3] * dt; sp[i * 3 + 1] += sv[i * 3 + 1] * dt; sp[i * 3 + 2] += sv[i * 3 + 2] * dt;
          if (sp[i * 3 + 1] < WALK_H) { sp[i * 3 + 1] = WALK_H; sv[i * 3 + 1] *= -0.3; sv[i * 3] *= 0.6; sv[i * 3 + 2] *= 0.6; }
        }
        sg.attributes.position.needsUpdate = true;
      },
    };
  })();

  // ── Bewegung ──
  let phi = 0;                                    // Drehung des Planeten
  let speed = 1;                                  // 0..1 vom Gehtempo
  let stopAt = null;                              // Ziel-Drehung beim Anhalten (Störung)
  let flash = 0;
  let nextFlash = 6;
  let storm = 0;                                  // 0..1 Überblendung zum grauen Himmel

  // Wie weit vorn verschwindet ein Haus hinter dem Horizont? Einmal für die Grundposition der Kamera berechnen.
  const CAM_BASE = new THREE.Vector3(0, 6.2, 8.6);
  {
    const C = CAM_BASE;
    const ctr = new THREE.Vector3(0, -R, 0);
    const P = new THREE.Vector3();
    const D = new THREE.Vector3();
    const h = 4.2, b = PLOT_LAT / R;
    for (let rel = 0; rel < Math.PI; rel += 0.005) {
      P.set(Math.sin(b) * (R + h), Math.cos(b) * Math.cos(rel) * (R + h) - R, -Math.cos(b) * Math.sin(rel) * (R + h));
      // Strecke C→P schneidet die Kugel (Radius R − 0,2)?
      D.subVectors(P, C);
      const len = D.length();
      D.divideScalar(len);
      const oc = C.clone().sub(ctr);
      const bq = oc.dot(D);
      const cq = oc.lengthSq() - (R - 0.2) ** 2;
      const disc = bq * bq - cq;
      if (disc > 0) {
        const t0 = -bq - Math.sqrt(disc);
        if (t0 > 0 && t0 < len) { visAhead = rel + 0.03; break; }
      }
    }
  }

  /** Liegt ein Weltpunkt hinter der Kugel (von der Kamera aus)? */
  const ctrW = new THREE.Vector3(0, -R, 0);
  const _d = new THREE.Vector3();
  const _oc = new THREE.Vector3();
  const occluded = (P) => {
    _d.subVectors(P, camera.position);
    const len = _d.length();
    _d.divideScalar(len);
    _oc.subVectors(camera.position, ctrW);
    const bq = _oc.dot(_d);
    const disc = bq * bq - (_oc.lengthSq() - (R - 0.1) ** 2);
    if (disc <= 0) return false;
    const t0 = -bq - Math.sqrt(disc);
    return t0 > 0 && t0 < len;
  };

  /** Namensschild über einem Kopf platzieren (oder ausblenden). */
  const placeLabel = (el, fig, show, z) => {
    if (!show) { el.style.display = 'none'; return; }
    tmpV.set(0, fig.headTop() + 0.15, 0);
    fig.group.localToWorld(tmpV);
    if (occluded(tmpV)) { el.style.display = 'none'; return; }
    const dist = camera.position.distanceTo(tmpV);
    tmpV.project(camera);
    if (tmpV.z > 1 || Math.abs(tmpV.x) > 1.15 || tmpV.y > 1.2 || tmpV.y < -1.2 || dist > 46) { el.style.display = 'none'; return; }
    const scale = Math.min(1.1, Math.max(0.5, 12 / dist));
    el.style.display = '';
    el.style.transform = `translate(${((tmpV.x + 1) / 2) * viewW}px, ${((1 - tmpV.y) / 2) * viewH}px) translate(-50%, -100%) scale(${scale.toFixed(3)})`;
    el.style.zIndex = String(z + Math.round(1000 - dist * 10));
  };

  // ── Planetenlauf (planetRace.js) ──
  const raceCfg = { enabled: true, modsOnly: false, joinSec: 30, cooldownMin: 3 };
  let raceCooldownUntil = 0;
  let raceWasActive = false;
  const race = createPlanetRace({
    planet, overlay, placeLabel,
    makeFigure: (userId, login) => {
      const look = cachedLook(userId, login);
      const fig = buildPersonFigure(kit, { seed: personSeed(userId), look, pool: cfg.theme === 'halloween' && !look ? COSTUMES : null });
      requestLook(userId, (lk) => { if (lk) fig.setOutfit(lk); }, login);
      return fig;
    },
  });
  /** Streamer während des Laufs: hängt am Planeten (bleibt an der Linie stehen, während die Kamera dem Feld folgt). */
  const meRace = { onPlanet: false, a: 0, lat: 0, yaw: Math.PI };
  const openRace = (t) => {
    if (race.active || !kit || cfg.mode === 'difficulties') return false;
    // in Bewegung: kurz bremsen, dort ist die Startaufstellung
    const startA = speed > 0.01 ? phi + 1.2 / R : phi;
    if (!race.open(t, startA, raceCfg.joinSec)) return false;
    stopAt = startA;
    return true;
  };
  const handleRaceCommand = (msg, sub) => {
    const boss = msg.role === 'broadcaster' || msg.role === 'mod';
    if (sub === 'stop' || sub === 'abbruch') { if (boss) race.abort(); return; }
    if (!raceCfg.enabled) return;
    if (!race.active) {
      if (raceCfg.modsOnly && !boss) return;
      if (!boss && performance.now() < raceCooldownUntil) return;
      if (!openRace(prevT)) return;
    }
    // Der Streamer startet das Rennen, läuft aber nicht mit
    if (msg.role !== 'broadcaster' || String(msg.userId).startsWith('demo-')) race.join(msg);
  };

  // ── Themen ──
  const _ca = new THREE.Color(), _cb = new THREE.Color();
  let grassMap = null;
  const applyTheme = () => {
    const th = THEMES[cfg.theme];
    grassMat.color.set(th.grass);
    grassMat.normalScale.setScalar(cfg.theme === 'winter' ? 0.25 : 0.8);
    // Winter: das Rasenfoto weglassen (weiß eingefärbt wirkt es schmutzig braun), nur die Struktur bleibt
    if (cfg.theme === 'winter' && grassMat.map) { grassMap = grassMat.map; grassMat.map = null; grassMat.needsUpdate = true; }
    else if (cfg.theme !== 'winter' && !grassMat.map && grassMap) { grassMat.map = grassMap; grassMat.needsUpdate = true; }
    stars.visible = th.stars;
    snow.visible = th.snow;
    haloMat.opacity = th.lamp ? 0.85 : 0;
    lampMat.color.set(th.lamp ? '#ffd79a' : '#f4ead6');
    if (th.lamp) lampMat.color.multiplyScalar(2.2);
    sun.position.set(...th.sunPos);
    renderer.toneMappingExposure = th.exposure;
    if (post.bloom) post.bloom.threshold = th.bloom;
    freeSignMat.emissiveIntensity = th.windows ? 0.3 : 0;
    for (const s of slots) applySlotTheme(s);
    if (cfg.theme === 'halloween' && !hwKit) {
      loadHalloweenKit().then((k) => {
        if (disposed || !k) return;
        hwKit = k;
        for (const s of slots) placeHalloween(s);
        renderer.compile(scene, camera);
      });
    }
  };
  /** Farben, die zwischen Thema und Sturm (Störung) überblenden — jedes Bild. */
  const blendColors = () => {
    const th = THEMES[cfg.theme];
    const k = storm * (cfg.theme === 'day' ? 0.75 : 0.45);
    skyMat.uniforms.uTop.value.copy(_ca.set(th.sky.top)).lerp(_cb.set(STORM.top), k);
    skyMat.uniforms.uHorizon.value.copy(_ca.set(th.sky.horizon)).lerp(_cb.set(STORM.horizon), k);
    skyMat.uniforms.uGround.value.copy(_ca.set(th.sky.ground)).lerp(_cb.set(STORM.ground), k);
    skyMat.uniforms.uSunDir.value.copy(th.sky.sunDir).normalize();
    skyMat.uniforms.uSunColor.value.set(th.sky.sunColor).multiplyScalar(1 - storm * 0.8);
    scene.fog.color.copy(_ca.set(th.fog[0])).lerp(_cb.set(STORM.horizon), k);
    scene.fog.near = th.fog[1]; scene.fog.far = th.fog[2];
    hemi.color.set(th.hemi[0]); hemi.groundColor.set(th.hemi[1]);
    hemi.intensity = th.hemi[2] * (1 - storm * 0.3) + flash * 2.5;
    sun.color.set(th.sun[0]);
    sun.intensity = th.sun[1] * (1 - storm * 0.65);
    cloudMat.color.copy(_ca.set(th.cloud)).lerp(_cb.set(STORM.cloud), storm * 0.85);
    cloudMat.emissive.copy(cloudMat.color);
    cloudMat.emissiveIntensity = th.cloudGlow + storm * 0.12 + flash * 0.8;
  };

  // ── Modus ──
  const setMode = (mode, t) => {
    if (mode === cfg.mode) return;
    cfg.mode = mode;
    if (mode === 'difficulties') race.abort();
    setCloudText(mode === 'difficulties' ? 'difficulties' : 'brb', t);
    if (mode === 'difficulties') {
      // Baustelle 7,5 m vor dem Streamer; er hält 3 m davor (hinter den Pylonen)
      site.a = phi + 7.5 / R;
      surfacePose(site.group, site.a, 0, 0);
      site.group.visible = true;
      site.state = 'drop';
      site.t0 = t;
      stopAt = site.a - 3.0 / R;
    } else {
      stopAt = null;
      if (site.state !== 'off') { site.state = 'sink'; site.t0 = t; }
    }
  };

  // ── Bild ──
  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  let prevT = 0;
  let lightsT = 0;
  const tick = (t, dt) => {
    prevT = t;
    const now = performance.now();
    const beat = clock.step(dt);

    // Planet drehen (beim Anhalten sanft vor der Baustelle bremsen; im Planetenlauf folgt er der Spitze)
    const prevPhi = phi;
    const focusA = race.active ? race.focus() : null;
    let target = 1;
    if (stopAt != null) {
      const rem = (stopAt - phi) * R;
      target = rem <= 0.01 ? 0 : Math.min(1, Math.sqrt(2 * 0.12 * rem) / WALK_MPS);
    }
    if (site.state === 'sink' || meRace.onPlanet) target = 0;          // erst wegräumen, dann weiterlaufen
    if (focusA != null) {
      phi += (focusA - phi) * clamp01(dt * 2.2);
      speed = 0;
    } else {
      speed += (target - speed) * clamp01(dt * (target > speed ? 0.8 : 3));
      if (stopAt != null && (stopAt - phi) * R < 0.01) speed = 0;
      phi += (WALK_MPS * speed / R) * dt;
    }
    const groundV = dt > 0 ? ((phi - prevPhi) * R) / dt : 0;
    planet.rotation.x = phi;
    storm += ((cfg.mode === 'difficulties' ? 1 : 0) - storm) * clamp01(dt * 0.6);
    if (import.meta.env.DEV) window.__brbState = { speed, phi, stopAt, mode: cfg.mode, site: site.state };

    // Blitze bei Störung
    if (cfg.mode === 'difficulties' && t > nextFlash) {
      nextFlash = t + 7 + Math.random() * 9;
      flash = 1;
    }
    flash = Math.max(0, flash - dt * 4);

    // Streamer
    if (me) {
      let want = 'walk';
      if (race.active || meRace.onPlanet) {
        // Planetenlauf: angehalten → an den Planeten hängen, an den Rand treten, zuschauen, zurück
        if (!meRace.onPlanet && speed === 0) {
          planet.attach(meGroup);
          Object.assign(meRace, { onPlanet: true, a: phi, lat: 0, yaw: Math.PI });
        }
        if (meRace.onPlanet) {
          const goalLat = race.active ? 3.1 : 0;
          const dl = goalLat - meRace.lat;
          let yawGoal;
          if (Math.abs(dl) > 0.03) {
            meRace.lat += Math.sign(dl) * Math.min(Math.abs(dl), 1.3 * dt);
            yawGoal = dl > 0 ? Math.PI / 2 : -Math.PI / 2;
          } else {
            want = race.active ? race.streamerCue() : 'walk';
            // am Rand: zur Straße und zur Linie gedreht; zurück in der Mitte: wieder vorwärts
            yawGoal = race.active ? -2.05 : Math.PI;
          }
          let dy = yawGoal - meRace.yaw;
          dy = Math.atan2(Math.sin(dy), Math.cos(dy));
          meRace.yaw += dy * clamp01(dt * 6);
          surfacePose(meGroup, meRace.a, meRace.lat, meRace.lat > ROAD_HALF ? WALK_H : 0);
          me.fig.group.rotation.y = meRace.yaw;
          if (!race.active && Math.abs(dl) <= 0.03) {
            // wieder auf der Straße: abhängen und weiterlaufen (nach Abbruch mitten im Rennen springt er zur Kamera)
            scene.attach(meGroup);
            meGroup.position.set(0, 0, 0);
            meGroup.quaternion.identity();
            me.fig.group.rotation.y = Math.PI;
            meRace.onPlanet = false;
            if (cfg.mode !== 'difficulties') stopAt = null;
          }
        }
      } else {
        const stopped = speed < 0.12 && cfg.mode === 'difficulties';
        want = stopped ? 'scratch' : 'walk';
      }
      if (me.anim !== want) { me.fig.play(want, { fade: 0.5, timeScale: WALK_RATE }); me.anim = want; }
      if (want === 'walk') me.fig.setTimeScale(meRace.onPlanet ? WALK_RATE : WALK_RATE * Math.max(0.25, speed));
      me.fig.update(dt, beat);
      if (me.bubbleUntil && now > me.bubbleUntil) { me.bubbleUntil = 0; me.label.bubble.classList.remove('is-on'); }
    }

    // Kamera: schwebt hinter dem Streamer, langsam pendelnd; bei Störung etwas seitlich auf die Baustelle
    const sx = Math.sin(t * TAU / 53) * 1.6 + storm * 1.8;
    camPos.set(CAM_BASE.x + sx, CAM_BASE.y + Math.sin(t * TAU / 67) * 0.45 - storm * 0.4, CAM_BASE.z + Math.sin(t * TAU / 79) * 0.8 - storm * 1.5);
    camLook.set(-sx * 0.25, -3.8 - storm * 0.6, -14);
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    sky.position.copy(camera.position);
    stars.position.copy(camera.position);
    // Wolkenschrift: in Blickrichtung, frontal zur Kamera
    camera.getWorldDirection(fwd);
    fwd.y = 0; fwd.normalize();
    // ~13° unter Augenhöhe: über dem (tief liegenden) Horizont des kleinen Planeten
    const cy = camera.position.y - CLOUD_DIST * 0.23;
    cloudText.position.set(camera.position.x + fwd.x * CLOUD_DIST, cy, camera.position.z + fwd.z * CLOUD_DIST);
    cloudText.lookAt(camera.position.x, cy, camera.position.z);
    updatePuffs(t);
    skyClouds.rotation.y = t * 0.004;

    // Schnee
    if (snow.visible) {
      for (let i = 0; i < SNOW_N; i++) {
        const j = i * 3;
        snowPos[j + 1] -= (1.1 + (snowSeed[i] % 1) * 0.8) * dt;
        snowPos[j] += Math.sin(t * 0.8 + snowSeed[i]) * 0.35 * dt;
        // Schnee bleibt mit der Welt: die Drehung des Planeten trägt ihn zur Kamera
        snowPos[j + 2] += groundV * dt;
        if (snowPos[j + 1] < -1) snowPos[j + 1] += 30;
        if (snowPos[j + 2] > 22) snowPos[j + 2] -= 70;
      }
      snowGeo.attributes.position.needsUpdate = true;
    }

    // Grundstücke: Sichtbarkeit, Wachsen, Figuren
    for (const s of slots) {
      s.rel = relOf(s);
      const inRange = s.rel > BEHIND && s.rel < visAhead + 0.12;
      s.outer.visible = inRange;
      s.visible = s.rel > BEHIND * 0.5 && s.rel < visAhead;
      if (s.pop < 1) {
        s.pop = Math.min(1, s.pop + dt / 1.1);
        const k = s.pop;
        const y = k < 0.7 ? smooth(k / 0.7) * 1.1 : 1.1 - 0.1 * smooth((k - 0.7) / 0.3);
        s.inner.scale.set(0.6 + 0.4 * smooth(k), Math.max(0.01, y), 0.6 + 0.4 * smooth(k));
      }
      const o = s.owner;
      if (!o) continue;
      // Wer still geworden ist, geht hinein
      if (o.fig && now > o.activeUntil && !o.walkIn) {
        if (s.visible && s.built?.door) { o.walkIn = true; o.walk = { from: o.fig.group.position.x, to: s.built.door.x, t: 0 }; o.yaw = -Math.PI / 2; o.fig.play('walk'); o.label.bubble.classList.remove('is-on'); }
        else { removeFigure(o); continue; }
      }
      if (!o.fig) continue;
      const f = o.fig;
      // läuft gerade beim Planetenlauf mit: am Gartentor ausblenden
      if (race.isRunner(o.userId)) { f.group.visible = false; if (o.label) o.label.el.style.display = 'none'; continue; }
      f.group.visible = true;
      if (o.walk) {
        const w = o.walk;
        w.t += dt * PERSON_WALK_MPS / Math.max(0.1, Math.abs(w.to - w.from));
        f.group.position.x = lerp(w.from, w.to, clamp01(w.t));
        f.group.rotation.y = o.yaw;
        if (w.t >= 1) {
          o.walk = null;
          if (o.walkIn) { o.walkIn = false; removeFigure(o); continue; }
          f.play('idle');
        }
      } else if (inRange) {
        // Dem Streamer entgegenschauen, wenn er nah ist; sonst halb zur Straße, halb zur Kamera
        const near = Math.abs(s.rel) * R < 13;
        let goal = Math.atan2(1, 0.45 * s.tc);
        if (near) {
          tmpV.set(0, 0, 0);
          s.inner.worldToLocal(tmpV);
          goal = Math.atan2(tmpV.x - f.group.position.x, tmpV.z - f.group.position.z);
        }
        let d = goal - f.group.rotation.y;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        f.group.rotation.y += d * clamp01(dt * 3);
        // Winken: wenn der Streamer vorbeikommt (höchstens alle 40 s) oder eine Nachricht erscheint
        if (s.visible && s.rel > -0.02 && s.rel * R < 6 && now - o.waveAt > 40000) { o.waveAt = now; o.waveUntil = now + 4500; }
        // Wartende Nachricht zeigen, sobald das Grundstück im Bild ist
        if (o.pending && s.visible) {
          if (now - o.pending.at < PENDING_MS) {
            fillBubble(o.label.bubble, o.pending.parts);
            o.label.bubble.classList.add('is-on');
            o.bubbleUntil = now + BUBBLE_MS;
            if (now - o.waveAt > 8000) { o.waveAt = now; o.waveUntil = now + 3200; }
          }
          o.pending = null;
        }
        const anim = now < o.waveUntil ? 'wave' : 'idle';
        if (f.current !== anim) f.play(anim, { fade: 0.4 });
      }
      if (o.bubbleUntil && now > o.bubbleUntil) { o.bubbleUntil = 0; o.label.bubble.classList.remove('is-on'); }
      if (inRange) f.update(dt, beat);
      if (o.label) placeLabel(o.label.el, f, inRange && s.visible, o.bubbleUntil ? 3000 : 1000);
    }
    if (me) placeLabel(me.label.el, me.fig, true, me.bubbleUntil ? 6000 : 4000);
    race.update(t, dt, beat);
    if (raceWasActive && !race.active) raceCooldownUntil = now + raceCfg.cooldownMin * 60e3;
    raceWasActive = race.active;

    // Lichterketten funkeln (alle 0,45 s ein Farbschritt)
    if (cfg.theme === 'winter' && t - lightsT > 0.45) {
      lightsT = t;
      const step = Math.floor(t / 0.45);
      for (const s of slots) {
        if (!s.lights || !s.outer.visible) continue;
        for (let i = 0; i < s.lights.count; i++) s.lights.setColorAt(i, XMAS[(i + step) % XMAS.length]);
        s.lights.instanceColor.needsUpdate = true;
      }
    }
    if (hwKit) hwKit.mat.emissiveIntensity = 1.6 + Math.sin(t * 9.3) * 0.25 + Math.sin(t * 23.1) * 0.15;
    site.update(t, dt);
    blendColors();
    // Schatten folgen dem Streamer (die Welt dreht sich, die Lichtquelle bleibt)
    sun.target.position.set(0, 0, -8);
    sun.target.updateMatrixWorld();
  };

  // ── Start ──
  const ready = (async () => {
    kit = await loadPeopleKit();
    await assets.ready();
    await new Promise((r) => setTimeout(r, 0));
    if (disposed) return;
    buildMe();
    applyTheme();
    stage.resize();
    tick(0, 0);
    warmUp(renderer, scene, camera, post);
    stage.start(tick);
  })();

  // Figuren bekommen echte Schatten, sobald ihr Modell da ist (peopleFigure schaltet sie aus)
  const shadowTimer = setInterval(() => {
    const figs = [me?.fig, ...[...owners.values()].map((o) => o.fig)].filter(Boolean);
    for (const f of figs) f.group.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  }, 1000);

  return {
    ready,
    setChannel(ch) {
      const c = String(ch || '').toLowerCase();
      if (c === channel) return;
      channel = c;
      ready.then(() => { if (!disposed) buildMe(); });
    },
    /** Läuft gerade die Anmeldung zum Planetenlauf? (Testmodus schickt dann !rennen) */
    get raceOpen() { return race.phase === 'lobby'; },
    onMessage(msg) {
      const now = performance.now();
      const text = (msg.parts || []).map((p) => p.text || '').join('').trim();
      const cmd = RACE_CMD.exec(text);
      if (cmd) { handleRaceCommand(msg, (cmd[2] || '').toLowerCase()); return; }
      if (race.say(msg)) return;
      // Der Streamer selbst: Sprechblase über seiner Figur
      if (msg.role === 'broadcaster' && me && !String(msg.userId).startsWith('demo-')) {
        fillBubble(me.label.bubble, msg.parts);
        me.label.bubble.classList.add('is-on');
        me.bubbleUntil = now + BUBBLE_MS;
        return;
      }
      if (!msg.userId) return;
      let o = owners.get(msg.userId);
      if (!o) {
        const slot = pickSlot();
        if (!slot) return;
        o = { userId: msg.userId, name: msg.name, login: String(msg.name || '').toLowerCase(), color: msg.color || '#9b9b9b', demo: String(msg.userId).startsWith('demo-'), lastAt: Date.now(), slot: null, fig: null, label: null, pending: null, bubbleUntil: 0, waveUntil: 0, waveAt: 0, activeUntil: 0 };
        owners.set(o.userId, o);
        assign(o, slot);
      } else {
        // Anzeigename/Farbe können sich ändern → Schild neu
        if (o.name !== msg.name || (msg.color && o.color !== msg.color)) { o.name = msg.name; o.color = msg.color || o.color; if (!o.fig) buildSlot(o.slot); }
        // Liegt das eigene Grundstück weit weg (länger als ~40 s bis ins Bild), zieht es um
        const rel = relOf(o.slot);
        const wait = rel > visAhead ? ((rel - visAhead) * R) / WALK_MPS : rel < BEHIND * 0.5 ? ((TAU + rel - visAhead) * R) / WALK_MPS : 0;
        if (wait > 40 && !o.fig) {
          const slot = pickSlot();
          if (slot && slot !== o.slot) assign(o, slot);
        }
      }
      o.lastAt = Date.now();
      o.activeUntil = now + ACTIVE_MS;
      o.pending = { parts: msg.parts, at: now };
      if (!o.fig) makeFigure(o);
      else if (o.walkIn) { o.walkIn = false; o.walk = null; o.fig.play('idle'); }
      persist();
    },
    clearUser(userId) {
      const o = owners.get(userId);
      if (o?.label) { o.label.bubble.classList.remove('is-on'); o.bubbleUntil = 0; }
      if (o) o.pending = null;
      race.clearUser(userId);
    },
    /**
     * Jemand hat im Figurbaukasten neu gespeichert ({ id, login } aus createControlLink → onLooks):
     * Streamer, Chatter am Gartentor und Läufer bauen sofort um. Gelöschte Figur → wieder die Standardfigur.
     */
    refreshLook({ id, login }) {
      const lg = String(login || '').toLowerCase();
      forgetLook(id, lg);
      if (me && lg && lg === channel) {
        const fig = me.fig;
        requestLook(null, (lk) => { if (me?.fig === fig) fig.setOutfit(lk); }, channel);
      }
      const o = owners.get(String(id));
      if (o?.fig) {
        const fig = o.fig;
        requestLook(o.userId, (lk) => { if (o.fig === fig) { fig.setOutfit(lk); o.figLook = !!lk; } }, o.login);
      }
      race.refreshLook(String(id), lg);
    },
    /** Einmaliger Befehl vom Steuerpult. */
    command(type) {
      if (type === 'brbRace') openRace(prevT);
      else if (type === 'brbRaceStop') race.abort();
    },
    clearDemo() {
      for (const o of [...owners.values()]) if (o.demo) releaseOwner(o);
    },
    /** Einstellungen vom Steuerpult (sceneStore.sanitizeSettings): Modus und Thema des BRB-Planeten. */
    applySettings(st) {
      if (!st) return;
      const brb = st.brb || {};
      let theme = brb.theme || 'auto';
      if (theme === 'auto') {
        const m = new Date().getMonth();
        theme = st.theme === 'halloween' ? 'halloween' : (m === 11 || m <= 1) ? 'winter' : 'day';
      }
      if (!THEMES[theme]) theme = 'day';
      const prev = cfg.theme;
      cfg.theme = theme;
      if (theme !== prev) {
        // Kostüme wechseln: Figuren ohne eigene Figur neu einkleiden
        for (const o of owners.values()) if (o.fig && !o.figLook) { removeFigure(o); makeFigure(o); }
        ready.then(() => { if (!disposed) applyTheme(); });
      }
      const rc = brb.race || {};
      raceCfg.enabled = rc.enabled !== false;
      raceCfg.modsOnly = !!rc.modsOnly;
      raceCfg.joinSec = Number(rc.joinSec) || 30;
      raceCfg.cooldownMin = Number.isFinite(Number(rc.cooldownMin)) ? Number(rc.cooldownMin) : 3;
      setMode(brb.mode === 'difficulties' ? 'difficulties' : 'brb', prevT);
    },
    dispose() {
      disposed = true;
      clearInterval(shadowTimer);
      clearTimeout(saveTimer);
      for (const o of owners.values()) removeFigure(o);
      race.dispose();
      if (me) { me.fig.dispose(); me.label.el.remove(); }
      for (const s of slots) {
        const b = s.built;
        if (b) {
          for (const m of Object.values(b.meshes)) m?.geometry.dispose();
          if (b.signTex) { b.signTex.dispose(); b.signMesh.material.dispose(); }
        }
        s.lights?.dispose();
        s.glassMat.dispose();
      }
      for (const o of owned) o.dispose?.();
      assets.dispose();
      stage.dispose();
    },
  };
}
