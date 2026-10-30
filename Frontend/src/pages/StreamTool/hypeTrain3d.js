// hypeTrain3d.js — der Hype Train als echter 3D-Zug (three.js, lazy geladen wie marble3d.js).
//
// Modelle: Kenney „Train Kit“ (CC0) in public/media/stream3d/train/ — Dampflok + Personenwagen + Gleis.
// Eingefärbt wird über eine umgefärbte Kopie der Farbpalette (colormap.png): bei der Lok wird Rot zur Zugfarbe,
// beim Wagen Orange zur Zugfarbe und Weiß zur Wagenfarbe. Die Schattierung der Palette bleibt erhalten.
//
// Fahrgäste: je Wagen drei Gesichter in den Fenstern und drei auf dem Dach (Sprites, schauen immer zur Kamera).
// Wer neu zusteigt, ploppt mit einer kleinen Feder herein. Passt nicht alles, zeigt das letzte Dach "+N".
//
// Bewegung wie beim 2D-Zug: einfahren und bremsen, bei jedem Level vorne hinaus und mit einem Wagen mehr wieder
// herein, am Ende abfahren. Die Lage der Lok (Bildschirm-x) meldet view.draw() zurück — die Anzeige mit Level,
// Fortschritt und Restzeit ist DOM und hängt sich daran (OverlayScenes.jsx).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const BASE = '/media/stream3d/train/';
const FONT = 'Inter, Roboto, system-ui, sans-serif';
const CAR_LEN = 2.6;          // Länge von Lok und Wagen im Modell
const GAP = 0.18;             // Kupplung zwischen zwei Fahrzeugen
const PX_PER_UNIT = 100;      // bei Größe 100 %: ein Wagen ≈ 260 px
const FOV = 16;
const ENTER_MS = 4600;
const EXIT_MS = 2600;
const WINDOW_X = [-0.78, 0, 0.78];
const ROOF_X = [-0.82, 0, 0.82];
export const SEATS_PER_CAR = WINDOW_X.length + ROOF_X.length;
// Nur einzelne Räder drehen ("wheel"); "wheels-front/-back" sind ganze Drehgestelle samt Rahmen
const WHEEL_RE = /^wheel(_[0-9]+)?$/i;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const easeOut = (t) => 1 - (1 - t) ** 3;
const easeIn = (t) => t * t * t;
const springPop = (t) => (t >= 1 ? 1 : 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2);

/* ── Farbpalette umfärben ──────────────────────────────────────────────── */

function hsv(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}
const hueNear = (h, c, w) => Math.min(Math.abs(h - c), 360 - Math.abs(h - c)) <= w;

/**
 * @param rules  [{ test(hsv) → bool, color: '#rrggbb', ref: Helligkeit der Originalfarbe }]
 */
function recolorPalette(img, rules) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height);
  const px = data.data;
  // getRGB(..., SRGB): die Palette ist ein sRGB-Bild — lineare Werte würden die Farbe dunkler und satter machen
  const targets = rules.map((r) => { const rgb = {}; new THREE.Color(r.color).getRGB(rgb, THREE.SRGBColorSpace); return { ...r, rgb }; });
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i] / 255, g = px[i + 1] / 255, b = px[i + 2] / 255;
    const col = hsv(r, g, b);
    const rule = targets.find((t) => t.test(col));
    if (!rule) continue;
    // Schattierung behalten: Helligkeitsverhältnis zur Ausgangsfarbe auf die neue Farbe übertragen
    const k = clamp(col.v / rule.ref, 0.45, 1.35);
    px[i] = clamp(rule.rgb.r * k, 0, 1) * 255;
    px[i + 1] = clamp(rule.rgb.g * k, 0, 1) * 255;
    px[i + 2] = clamp(rule.rgb.b * k, 0, 1) * 255;
  }
  ctx.putImageData(data, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false; // wie die glTF-Textur
  tex.magFilter = THREE.NearestFilter;
  return tex;
}

/** Sehr dunkle Wagenfarben (Standard #23232d) etwas aufhellen — sonst säuft der Wagen im Spielbild ab. */
function liftDark(hex, min = 0.2) {
  const c = new THREE.Color(hex);
  const hsl = {};
  c.getHSL(hsl);
  if (hsl.l < min) c.setHSL(hsl.h, hsl.s, min);
  return `#${c.getHexString()}`;
}

/* ── Gesichter + Namen ─────────────────────────────────────────────────── */

function loadAvatar(url, onLoad) {
  if (!url) return;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => onLoad(img);
  img.src = url;
}

function faceTexture(person, ring) {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const ctx = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const paint = (img) => {
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = ring;
    ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 10, 0, Math.PI * 2); ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 15, 0, Math.PI * 2); ctx.clip();
    if (img) ctx.drawImage(img, 15, 15, S - 30, S - 30);
    else {
      ctx.fillStyle = ring;
      ctx.fillRect(0, 0, S, S);
      ctx.fillStyle = '#fff';
      ctx.font = `800 58px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(person.more ? `+${person.more}` : (person.name || '?').slice(0, 1).toUpperCase(), S / 2, S / 2 + 3);
    }
    ctx.restore();
    tex.needsUpdate = true;
  };
  paint(null);
  if (!person.more) loadAvatar(person.avatar, paint);
  return tex;
}

function nameTexture(text) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const font = `700 34px ${FONT}`;
  ctx.font = font;
  const label = text.length > 16 ? `${text.slice(0, 15)}…` : text;
  const w = Math.ceil(ctx.measureText(label).width) + 28;
  c.width = w; c.height = 52;
  ctx.font = font;
  ctx.fillStyle = 'rgba(12, 12, 18, 0.82)';
  ctx.beginPath(); ctx.roundRect(0, 0, w, 52, 10); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, w / 2, 28);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { tex, aspect: w / 52 };
}

function puffTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 31);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.6, 'rgba(235,235,242,0.6)');
  g.addColorStop(1, 'rgba(235,235,242,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ── Szene ─────────────────────────────────────────────────────────────── */

/**
 * @param canvas  Zeichenfläche (Größe in CSS-Pixeln: opts.width × opts.height)
 * @param opts    { width, height, size, from: 'left'|'right', colors: [Zug, Wagen], golden, still }
 * @returns view | null (ohne WebGL)
 */
export function createHypeTrainView(canvas, opts) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, premultipliedAlpha: true });
    if (!renderer.getContext()) throw new Error('no ctx');
  } catch {
    return null;
  }
  const W = opts.width, H = opts.height;
  renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
  renderer.setSize(W, H, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x50506a, 1.9));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(-6, 10, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 512);
  sun.shadow.camera.left = -40; sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 4; sun.shadow.camera.bottom = -4;
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);

  const camera = new THREE.PerspectiveCamera(FOV, W / H, 1, 600);
  const tanH = Math.tan(THREE.MathUtils.degToRad(FOV / 2));

  // Schatten auf unsichtbarem Boden — der Zug steht sichtbar auf dem Spielbild
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 6), new THREE.ShadowMaterial({ opacity: 0.32 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const disposables = [ground.geometry, ground.material];
  const puffTex = puffTexture();
  disposables.push(puffTex);

  let dir = opts.from === 'right' ? -1 : 1;
  let size = opts.size || 1;
  let colors = opts.colors;
  let golden = !!opts.golden;

  const state = {
    ready: false,
    models: null,           // { loco, coach, track, palette }
    trainGroup: new THREE.Group(),
    cars: [],               // [{ group, wheels: [], seats: [] }]
    level: 0,
    worldW: 20,
    x: 0,                   // Lage der Lok-Spitze (Weltkoordinate, in Fahrtrichtung)
    lastX: 0,
    move: null,             // { from, to, t0, ms, ease, done }
    puffs: [],
    nextPuff: 0,
    seats: new Map(),       // person.id → { sprite, label, born }
    track: null,
  };
  scene.add(state.trainGroup);

  /* Modelle laden */
  const loader = new GLTFLoader();
  const load = (n) => loader.loadAsync(`${BASE}${n}.glb`);
  const paletteImg = new Image();
  const paletteReady = new Promise((res, rej) => { paletteImg.onload = res; paletteImg.onerror = rej; paletteImg.src = `${BASE}Textures/colormap.png`; });
  let locoTex = null, coachTex = null;

  function paints() {
    const train = golden ? '#f5b82e' : colors[0] || '#9146ff';
    const wagon = golden ? '#5b3b0e' : liftDark(colors[1] || '#23232d');
    locoTex?.dispose(); coachTex?.dispose();
    locoTex = recolorPalette(paletteImg, [
      { test: (c) => c.s > 0.35 && c.v > 0.3 && hueNear(c.h, 2, 14), color: train, ref: 0.82 },
    ]);
    coachTex = recolorPalette(paletteImg, [
      { test: (c) => c.s > 0.35 && c.v > 0.3 && hueNear(c.h, 18, 12), color: train, ref: 0.9 },
      { test: (c) => c.s < 0.13 && c.v > 0.7, color: wagon, ref: 0.97 },
    ]);
  }

  /** Räder drehen sich um ihre Mitte: Geometrie einmal je Modell auf die Radmitte verschieben */
  function centerWheels(root) {
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      if (!o.isMesh || !WHEEL_RE.test(o.name) || o.userData.centered) return;
      o.geometry.computeBoundingBox();
      const c = o.geometry.boundingBox.getCenter(new THREE.Vector3());
      o.geometry.translate(-c.x, -c.y, -c.z);
      o.position.add(c.multiply(o.scale).applyQuaternion(o.quaternion));
      o.userData.centered = true;
    });
  }

  function prepare(root, tex) {
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.material = o.material.clone();
      o.material.map = tex;
      o.material.needsUpdate = true;
      disposables.push(o.material);
    });
    return root;
  }

  Promise.all([load('train-locomotive-b'), load('train-locomotive-passenger-a'), load('track-detailed'), paletteReady])
    .then(([loco, coach, track]) => {
      if (disposed) return;
      paints();
      centerWheels(loco.scene);
      centerWheels(coach.scene);
      state.models = { loco: loco.scene, coach: coach.scene, track: track.scene };
      [loco.scene, coach.scene, track.scene].forEach((s) => s.traverse((o) => { if (o.isMesh) disposables.push(o.geometry); }));
      buildTrack();
      state.ready = true;
      if (pendingLevel) { setLevel(pendingLevel, pendingPeople, pendingNames); pendingAction?.(); }
    })
    .catch(() => { failed = true; });

  let disposed = false;
  let failed = false;
  let pendingLevel = 0;
  let pendingPeople = [];
  let pendingNames = false;
  let pendingAction = null;

  function buildTrack() {
    if (state.track) scene.remove(state.track);
    const g = new THREE.Group();
    const half = Math.ceil(state.worldW / 2 + CAR_LEN * 2);
    for (let i = -half; i <= half; i++) {
      const t = state.models.track.clone();
      t.position.x = i;
      t.rotation.y = Math.PI / 2;
      t.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
      g.add(t);
    }
    state.track = g;
    scene.add(g);
  }

  /* Kamera: Breite so, dass der ganze Zug (plus Rand) ins Bild passt — wie die Verkleinerung im 2D-Zug */
  function frame(level) {
    const trainLen = (level + 1) * (CAR_LEN + GAP);
    const wanted = W / (PX_PER_UNIT * size);
    state.worldW = Math.max(wanted, trainLen + 2.4);
    const visH = state.worldW / camera.aspect;
    const dist = visH / 2 / tanH;
    // Gleis knapp über dem unteren Rand, Kamera leicht von oben
    const lookY = visH / 2 - visH * 0.1;
    camera.position.set(0, lookY + dist * 0.11, dist);
    camera.lookAt(0, lookY, 0);
    camera.updateProjectionMatrix();
    if (state.models) buildTrack();
  }

  function clearCars() {
    state.cars.forEach((c) => state.trainGroup.remove(c.group));
    state.cars = [];
    state.seats.forEach((s) => { s.sprite.material.map.dispose(); s.sprite.material.dispose(); s.label?.material.map.dispose(); s.label?.material.dispose(); });
    state.seats.clear();
  }

  function findWheels(root) {
    const out = [];
    root.traverse((o) => { if (WHEEL_RE.test(o.name)) out.push(o); });
    return out;
  }

  /** Zug neu zusammenstellen: Lok vorne (x = 0 lokal), Wagen dahinter in Richtung −x */
  function buildCars(level) {
    clearCars();
    const loco = prepare(state.models.loco.clone(true), locoTex);
    loco.rotation.y = Math.PI / 2;
    loco.position.x = -CAR_LEN / 2;
    const locoG = new THREE.Group();
    locoG.add(loco);
    state.cars.push({ group: locoG, wheels: findWheels(loco), seats: [], loco: true });
    for (let i = 0; i < level; i++) {
      const coach = prepare(state.models.coach.clone(true), coachTex);
      coach.rotation.y = Math.PI / 2;
      const g = new THREE.Group();
      g.position.x = -(i + 1) * (CAR_LEN + GAP) - CAR_LEN / 2;
      g.add(coach);
      state.cars.push({ group: g, wheels: findWheels(coach), seats: [] });
    }
    state.cars.forEach((c) => state.trainGroup.add(c.group));
    state.trainGroup.scale.x = dir; // Fahrt nach links: gespiegelt
    state.level = level;
  }

  /** Fahrgäste auf die Plätze verteilen (Reihenfolge = Reihenfolge des Zusteigens, Wagen 1 direkt hinter der Lok) */
  function seat(people, showNames) {
    const cap = (state.cars.length - 1) * SEATS_PER_CAR;
    const overflow = people.length > cap ? people.length - cap + 1 : 0;
    const shown = overflow ? people.slice(0, cap - 1) : people.slice(0, cap);
    const list = overflow ? [...shown, { id: '__more', more: overflow }] : shown;
    const wantIds = new Set(list.map((p) => `${p.id}|${p.more || ''}|${showNames ? 1 : 0}`));

    // Weggefallene entfernen
    for (const [key, s] of state.seats) {
      if (wantIds.has(key)) continue;
      s.sprite.parent?.remove(s.sprite);
      s.label?.parent?.remove(s.label);
      s.sprite.material.map.dispose(); s.sprite.material.dispose();
      s.label?.material.map.dispose(); s.label?.material.dispose();
      state.seats.delete(key);
    }

    const ring = golden ? '#f5b82e' : colors[0] || '#9146ff';
    list.forEach((p, i) => {
      const car = state.cars[1 + Math.floor(i / SEATS_PER_CAR)];
      if (!car) return;
      const slot = i % SEATS_PER_CAR;
      const inWindow = slot < WINDOW_X.length;
      const key = `${p.id}|${p.more || ''}|${showNames ? 1 : 0}`;
      let s = state.seats.get(key);
      if (!s) {
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: faceTexture(p, ring), transparent: true, depthWrite: false }));
        sprite.renderOrder = 2;
        let label = null;
        if (showNames && !p.more && p.name) {
          const nt = nameTexture(p.name);
          label = new THREE.Sprite(new THREE.SpriteMaterial({ map: nt.tex, transparent: true, depthWrite: false, depthTest: false }));
          label.userData.aspect = nt.aspect;
          label.renderOrder = 3;
        }
        s = { sprite, label, born: performance.now(), base: 0 };
        state.seats.set(key, s);
      }
      // Platz im Wagen (lokal zum Wagen, vor dem Spiegeln — x in Fahrtrichtung)
      const x = inWindow ? WINDOW_X[slot] : ROOF_X[slot - WINDOW_X.length];
      const y = inWindow ? 0.98 : 1.9;
      const z = inWindow ? 0.66 : 0;
      const d = inWindow ? 0.56 : 0.62;
      s.sprite.position.set(x * dir, y, z);
      s.sprite.userData.d = d;
      s.base = y;
      if (s.sprite.parent !== car.group) car.group.add(s.sprite);
      if (s.label) {
        s.label.position.set(x * dir, inWindow ? 0.6 : 2.4, z + 0.05);
        const lh = 0.2;
        s.label.scale.set(lh * s.label.userData.aspect, lh, 1);
        if (s.label.parent !== car.group) car.group.add(s.label);
      }
    });
  }

  function setLevel(level, people, showNames) {
    if (!state.ready) { pendingLevel = level; pendingPeople = people; pendingNames = showNames; return; }
    frame(level);
    buildCars(level);
    seat(people || [], showNames);
  }

  /** Spitze der Lok am Halteplatz bzw. außerhalb (Weltkoordinaten, x in Fahrtrichtung gedacht) */
  const parkX = () => state.worldW / 2 - 1.2;
  const outX = () => state.worldW / 2 + (state.level + 1) * (CAR_LEN + GAP) + 1.5;

  function moveTo(to, ms, ease, onDone) {
    state.move = { from: state.x, to, t0: performance.now(), ms, ease, onDone };
  }

  /* ── Öffentliche Schnittstelle ── */
  const view = {
    get ready() { return state.ready; },
    get failed() { return failed; },
    /** Neuer Aufbau (Level/Fahrgäste) ohne Fahrt — für die stehende Vorschau */
    park(level, people, showNames) {
      setLevel(level, people, showNames);
      const go = () => { state.x = parkX(); state.lastX = state.x; state.move = null; };
      if (state.ready) go(); else pendingAction = go;
    },
    /** Von hinten einfahren und bremsen */
    enter(level, people, showNames, onDone) {
      setLevel(level, people, showNames);
      const go = () => {
        state.x = -state.worldW / 2 - 0.5; // Lok-Spitze knapp vor dem Bildrand, der Rest dahinter
        state.lastX = state.x;
        moveTo(parkX(), ENTER_MS, easeOut, onDone);
      };
      if (state.ready) go(); else pendingAction = go;
    },
    /** Nach vorne aus dem Bild */
    exit(onDone) {
      moveTo(outX(), EXIT_MS, easeIn, onDone);
    },
    updatePeople(people, showNames) {
      if (!state.ready) { pendingPeople = people; pendingNames = showNames; return; }
      seat(people, showNames);
    },
    setStyle(next) {
      const nextDir = next.from === 'right' ? -1 : 1;
      const recolor = next.colors?.join() !== colors?.join() || !!next.golden !== golden;
      colors = next.colors || colors;
      golden = !!next.golden;
      if (next.size && next.size !== size) { size = next.size; frame(state.level || 1); }
      if (nextDir !== dir) { dir = nextDir; state.trainGroup.scale.x = dir; }
      if (recolor && state.ready) {
        paints();
        state.cars.forEach((c, i) => c.group.traverse((o) => { if (o.isMesh) { o.material.map = i === 0 ? locoTex : coachTex; o.material.needsUpdate = true; } }));
      }
    },
    /**
     * Ein Bild zeichnen.
     * @returns {{ locoX: number, locoTop: number, moving: boolean }} Lok in CSS-Pixeln der Zeichenfläche
     */
    draw(now = performance.now()) {
      if (!state.ready) return null;
      // Fahrt
      if (state.move) {
        const m = state.move;
        const t = clamp((now - m.t0) / m.ms, 0, 1);
        state.x = m.from + (m.to - m.from) * m.ease(t);
        if (t >= 1) { state.move = null; m.onDone?.(); }
      }
      const dx = state.x - state.lastX;
      state.lastX = state.x;
      const moving = Math.abs(dx) > 0.0005;
      state.trainGroup.position.x = state.x * dir;
      // Räder drehen sich passend zur Strecke
      const spin = dx / 0.17;
      state.cars.forEach((c) => c.wheels.forEach((w) => { w.rotation.x += spin; }));
      // Leichtes Schaukeln der Wagen in Fahrt, Fahrgäste wippen
      state.cars.forEach((c, i) => {
        c.group.rotation.x = moving ? Math.sin(now / 140 + i) * 0.006 : 0;
      });
      state.seats.forEach((s, key) => {
        const age = (now - s.born) / 520;
        const pop = springPop(clamp(age, 0, 1));
        const d = s.sprite.userData.d || 0.56;
        s.sprite.scale.set(d * pop, d * pop, 1);
        const bob = Math.sin(now / 260 + key.length * 1.7) * (moving ? 0.03 : 0.012);
        s.sprite.position.y = s.base + bob;
        if (s.label) s.label.material.opacity = clamp(age, 0, 1);
      });

      // Dampf aus dem Schornstein — mehr, solange er fährt
      const chimneyX = (state.x - 0.55) * dir;
      if (now > state.nextPuff && state.x > -state.worldW / 2 - 2 && state.x < state.worldW / 2 + 3) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false, opacity: 0.9 }));
        sp.position.set(chimneyX, 1.75, 0.05);
        sp.userData = { t0: now, life: moving ? 1600 : 2400, x0: chimneyX, drift: (Math.random() - 0.5) * 0.4 };
        scene.add(sp);
        state.puffs.push(sp);
        state.nextPuff = now + (moving ? 110 : 520);
      }
      state.puffs = state.puffs.filter((sp) => {
        const a = (now - sp.userData.t0) / sp.userData.life;
        if (a >= 1) { scene.remove(sp); sp.material.dispose(); return false; }
        const s = 0.35 + a * 1.4;
        sp.scale.set(s, s, 1);
        // steigt auf und weht leicht nach hinten (die Lok fährt ihm davon)
        sp.position.y = 1.75 + a * 0.95;
        sp.position.x = sp.userData.x0 + (sp.userData.drift - dir * 0.5) * a;
        sp.material.opacity = 0.95 * (1 - a) ** 1.4;
        return true;
      });

      renderer.render(scene, camera);

      // Lok-Spitze/Oberkante auf den Bildschirm
      const p = new THREE.Vector3((state.x - CAR_LEN / 2) * dir, 1.75, 0).project(camera);
      return { locoX: (p.x * 0.5 + 0.5) * W, locoTop: (-p.y * 0.5 + 0.5) * H, moving, visible: state.x > -state.worldW / 2 && state.x - (state.level + 1) * (CAR_LEN + GAP) < state.worldW / 2 };
    },
    dispose() {
      disposed = true;
      clearCars();
      state.puffs.forEach((sp) => sp.material.dispose());
      locoTex?.dispose(); coachTex?.dispose();
      disposables.forEach((d) => d.dispose?.());
      renderer.dispose();
    },
  };
  frame(1);
  return view;
}
