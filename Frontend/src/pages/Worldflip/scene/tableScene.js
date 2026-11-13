// scene/tableScene.js — der 3D-Tisch von Worldflip (three.js): Welten-Trommel, schwebender Tisch, Mitspieler, Karten.
//
// Die Szene kennt keine Regeln. Sie bekommt
//   sync(view)      Sicht eines Platzes (engine viewFor) — stellt alles hart auf diesen Stand
//   play(events)    Ereignisse eines Zugs (engine apply) — spielt sie nacheinander ab (Promise), Dauer wie in ANIM
// und meldet Klicks auf eine Handkarte (onCard) oder den Nachziehstapel (onDraw) sowie die Karte unter dem Zeiger
// (onHover).
//
// Plätze: Die Kamera sitzt auf dem eigenen Platz (unten). Die anderen sitzen im Uhrzeigersinn links, gegenüber, rechts.
// Der Tisch schwebt ein Stück über der Welt, die gerade gilt: Wechselt sie, dreht sich die Trommel die neue Welt
// unter den Tisch.
// Bei der Kipp-Karte überschlägt sich die Trommel einmal ganz; die Richtung zeigen die Pfeile am Tischrand.
//
// Leuchten: Mit echter Grafikkarte läuft ein Leucht-Durchgang (Bloom). Er lässt nur Flächen glühen, deren Farbe über
// Weiß hinausgeht (worlds.js glow mit boost > 1) — Karten und Figuren bleiben scharf. Im Sparmodus entfällt er.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ANIM, RULES, TEAMS, WORLDS } from '../engine/index.js';
import { cardCanvas, cardKey, CARD_W, CARD_H } from './cardArt.js';
import { buildDrum, dotTexture, glow, FLOOR, R } from './worlds.js';
import { createAvatar } from './avatars.js';
import { ambience, sfx } from '../sound.js';
import { SKIN_COLORS, normalizeSkin } from '../skins.js';

const CW = 0.62; // Kartenbreite in Welt-Einheiten
const CH = CW * (CARD_H / CARD_W);
const SEAT_RADIUS = 4.3;
const PILE = new THREE.Vector3(0.5, 0.02, 0.1);
const DECK = new THREE.Vector3(-0.72, 0.02, 0.1);
const CENTER = new THREE.Vector3(0, 1.4, 0);
const HAND_DIST = 3.4; // Abstand der eigenen Hand vor der Kamera
const FAN_SCALE = 0.74;
const KIND_ORDER = { n: 0, kipp: 1, sturm: 2, meteor: 3, walze: 4, frost: 5, welle: 6, schild: 7, saat: 8, tausch: 9, strahl: 10, portal: 11, finsternis: 12, zuender: 13 };
const UP = new THREE.Vector3(0, 1, 0);

const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);
const easeOut = (k) => 1 - (1 - k) ** 3;
const easeIn = (k) => k * k;
const linear = (k) => k;
const sortKey = (c) => (c.w < 0 ? 4 : c.w) * 1000 + KIND_ORDER[c.k] * 20 + (c.n || 0);

function cardGeometry() {
  const r = 0.055;
  const w = CW / 2;
  const h = CH / 2;
  const s = new THREE.Shape();
  s.moveTo(-w + r, -h);
  s.lineTo(w - r, -h);
  s.quadraticCurveTo(w, -h, w, -h + r);
  s.lineTo(w, h - r);
  s.quadraticCurveTo(w, h, w - r, h);
  s.lineTo(-w + r, h);
  s.quadraticCurveTo(-w, h, -w, h - r);
  s.lineTo(-w, -h + r);
  s.quadraticCurveTo(-w, -h, -w + r, -h);
  const geo = new THREE.ShapeGeometry(s, 4);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i += 1) uv.setXY(i, pos.getX(i) / CW + 0.5, pos.getY(i) / CH + 0.5);
  return geo;
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ low?: boolean, onCard?: (id: number) => void, onDraw?: () => void, onHover?: (card: object | null) => void, onFrame?: () => void }} opts
 */
export function createTableScene(canvas, opts = {}) {
  const low = !!opts.low;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !low, powerPreference: 'high-performance' });
  const pixelRatio = Math.min(window.devicePixelRatio || 1, low ? 1 : 2);
  renderer.setPixelRatio(pixelRatio);
  renderer.shadowMap.enabled = !low;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const sky = new THREE.Color(WORLDS[0].sky);
  const skyTarget = new THREE.Color(WORLDS[0].sky);
  scene.background = sky.clone();
  scene.fog = new THREE.Fog(sky.clone(), 20, 62);

  const camRig = new THREE.Group();
  scene.add(camRig);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 150);
  camera.position.set(0, 4.5, 9.4);
  camera.lookAt(0, -0.1, -0.6);
  camRig.add(camera);
  let baseFov = 50;
  let fovKick = 0;

  const hemi = new THREE.HemisphereLight('#ffffff', '#3a3550', 1.25);
  const sun = new THREE.DirectionalLight('#ffffff', 1.7);
  sun.position.set(3.5, 9, 5);
  if (!low) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 30 });
    sun.shadow.bias = -0.002;
  }
  const worldLight = new THREE.PointLight(WORLDS[0].color, 60, 34, 1.6);
  worldLight.position.set(0, 2.6, -0.5);
  scene.add(hemi, sun, worldLight);
  let lightKick = 0; // kurzer Lichtblitz bei Einschlägen

  // Leucht-Durchgang
  let composer = null;
  let bloom = null;
  if (!low) {
    const target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
    composer = new EffectComposer(renderer, target);
    composer.setPixelRatio(pixelRatio);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(4, 4), 0.75, 0.55, 1.06);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  }

  // ── Trommel ─────────────────────────────────────────────────────────────────────────────
  const { drum, walls } = buildDrum(low);
  scene.add(drum);
  drum.position.y = R - FLOOR; // die untere Wand liegt als Boden unter dem schwebenden Tisch
  const levels = [0, 0, 0, 0]; // angezeigte Ladung je Welt (gleitet zum Ziel)
  const levelTarget = [0, 0, 0, 0];
  const focus = [1, 0, 0, 0]; // 1 = aktuelle Welt; die anderen zeigen ihre Ladung nur gedämpft (sonst ragen sie in die Sitzplätze)
  let charges = [0, 0, 0, 0];
  let drumAngle = 0;

  // ── Tisch ───────────────────────────────────────────────────────────────────────────────
  const table = new THREE.Group();
  scene.add(table);
  const slate = new THREE.MeshStandardMaterial({ color: '#2d2937', roughness: 0.7 });
  const top = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.05, 0.24, 56), slate);
  top.position.y = -0.12;
  top.receiveShadow = true;
  top.castShadow = true;
  table.add(top);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.07, 8, 64), new THREE.MeshStandardMaterial({ color: '#e7dcc4', roughness: 0.5 }));
  rim.rotation.x = Math.PI / 2;
  table.add(rim);
  const inlayMat = glow(WORLDS[0].color, {}, 1.7);
  const inlay = new THREE.Mesh(new THREE.RingGeometry(2.28, 2.36, 64), inlayMat);
  inlay.rotation.x = -Math.PI / 2;
  inlay.position.y = 0.004;
  table.add(inlay);
  // Der Tisch schwebt auf einem Felsbrocken
  const rock = new THREE.Mesh(new THREE.ConeGeometry(2.9, 2.5, 9), new THREE.MeshStandardMaterial({ color: '#4b4458', roughness: 1, flatShading: true }));
  rock.rotation.x = Math.PI;
  rock.position.y = -1.48;
  rock.castShadow = true;
  table.add(rock);
  // Richtungspfeile am Tischrand
  const arrows = new THREE.Group();
  const arrowGeo = new THREE.ConeGeometry(0.1, 0.34, 3);
  arrowGeo.rotateX(Math.PI / 2);
  arrowGeo.scale(1, 0.25, 1);
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2;
    const m = new THREE.Mesh(arrowGeo, inlayMat);
    m.position.set(Math.sin(a) * 2.72, 0.012, Math.cos(a) * 2.72);
    m.rotation.y = a - Math.PI / 2; // Spitze zeigt im Uhrzeigersinn (von oben gesehen)
    arrows.add(m);
  }
  table.add(arrows);
  // Ladungs-Steine am Tischrand: je Welt vier (zwischen den Plätzen), sie leuchten mit der Ladung auf
  const studs = [];
  const studGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.06, 12);
  for (let w = 0; w < 4; w += 1) {
    for (let k = 0; k < RULES.CHARGE_MAX; k += 1) {
      const a = Math.PI / 4 + (w * Math.PI) / 2 + (k - (RULES.CHARGE_MAX - 1) / 2) * 0.135;
      const m = new THREE.Mesh(studGeo, new THREE.MeshBasicMaterial({ color: '#3a3644' }));
      m.material.toneMapped = false;
      m.position.set(Math.sin(a) * 2.98, 0.03, Math.cos(a) * 2.98);
      table.add(m);
      studs.push(m);
    }
  }

  // ── Karten ──────────────────────────────────────────────────────────────────────────────
  const cardGeo = cardGeometry();
  const textures = new Map();
  function texture(card) {
    const key = cardKey(card);
    let tex = textures.get(key);
    if (!tex) {
      tex = new THREE.CanvasTexture(cardCanvas(card));
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = low ? 1 : 8;
      textures.set(key, tex);
    }
    return tex;
  }
  const backMat = new THREE.MeshBasicMaterial({ map: texture(null) });

  /** Karte als Gruppe: Vorderseite zeigt nach +z, Rückseite nach −z. card === null: beide Seiten Rückseite. */
  function makeCard(card) {
    const g = new THREE.Group();
    const front = new THREE.Mesh(cardGeo, card ? new THREE.MeshBasicMaterial({ map: texture(card) }) : backMat);
    front.position.z = 0.004;
    const back = new THREE.Mesh(cardGeo, backMat);
    back.rotation.y = Math.PI;
    back.position.z = -0.004;
    g.add(front, back);
    g.userData = { card, front };
    return g;
  }
  function dropCard(obj) {
    obj.removeFromParent();
    if (obj.userData.front && obj.userData.front.material !== backMat) obj.userData.front.material.dispose();
  }

  // Nachziehstapel
  const deckMat = new THREE.MeshStandardMaterial({ color: '#f1ead9', roughness: 0.8 });
  const deckGeo = new THREE.BoxGeometry(CW, 1, CH);
  deckGeo.translate(0, 0.5, 0);
  const deck = new THREE.Mesh(deckGeo, [deckMat, deckMat, backMat, deckMat, deckMat, deckMat]);
  deck.position.copy(DECK);
  deck.rotation.y = 0.12;
  deck.castShadow = true;
  table.add(deck);
  let deckLift = 0;

  const pile = []; // abgelegte Karten (nur die obersten bleiben als Objekte)
  const flatQuat = (angle) => new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, angle));

  // ── Zustand der Anzeige ─────────────────────────────────────────────────────────────────
  let n = 0;
  let mySeat = null; // null = Zuschauer (schaut von Platz 0)
  let teams = null;
  let myColor = '#f4eedf'; // Farbe des eigenen Blobs (Zeige-Arm, Rahmen der gezeigten Karte)
  let avatars = []; // je Platz oder null (eigener Platz)
  let counts = [];
  let world = 0;
  let dir = 1;
  let darkness = 0;
  let darkTarget = 0;
  let blind = false;
  let shake = 0;
  let roll = 0;
  let disposed = false;
  let handSpawn = null; // Weltposition, von der neue Handkarten einfliegen (null = Nachziehstapel)
  const hand = []; // eigene Karten (Kinder von handRig)
  const handRig = new THREE.Group();
  camera.add(handRig);
  const ui = { playable: new Set(), canDraw: false, hover: null, hoverDeck: false, down: null };

  const viewSeat = () => (mySeat === null ? 0 : mySeat);
  const rel = (seat) => (seat - viewSeat() + n) % n;
  const isFoe = (a, b) => a !== b && (!teams || teams[a] !== teams[b]);
  function seatAngle(seat) {
    const r = rel(seat);
    if (n === 2) return r * Math.PI;
    if (n === 3) return (-r * Math.PI * 2) / 3;
    return (-r * Math.PI) / 2;
  }
  function seatPos(seat, radius = SEAT_RADIUS) {
    const a = seatAngle(seat);
    return new THREE.Vector3(Math.sin(a) * radius, 0, Math.cos(a) * radius);
  }
  /** Wo Karten eines Platzes herkommen und hinfliegen (Weltkoordinaten). */
  function anchor(seat) {
    const av = avatars[seat];
    if (av) return av.fan.getWorldPosition(new THREE.Vector3());
    return handRig.getWorldPosition(new THREE.Vector3());
  }
  function anchorQuat(seat) {
    const av = avatars[seat];
    if (av) return av.fan.getWorldQuaternion(new THREE.Quaternion()).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0)));
    return camera.getWorldQuaternion(new THREE.Quaternion());
  }
  /** Mitte der Figur (für Treffer-Effekte); beim eigenen Platz ein Punkt vor der Kamera. */
  function body(seat) {
    const av = avatars[seat];
    if (av) return av.group.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, av.bodyY, 0));
    return new THREE.Vector3(0, 1.6, 5.2);
  }

  // ── Animationen ─────────────────────────────────────────────────────────────────────────
  const anims = new Set();
  function anim(ms, fn, ease = easeInOut) {
    if (disposed) return Promise.resolve();
    return new Promise((resolve) => anims.add({ t: 0, ms: Math.max(1, ms), fn, ease, resolve }));
  }
  const wait = (ms) => anim(ms, () => {});
  function fly(obj, pos, quat, ms, arc = 0.9, scale = null, ease = easeInOut) {
    const p0 = obj.position.clone();
    const q0 = obj.quaternion.clone();
    const s0 = obj.scale.x;
    return anim(ms, (e) => {
      obj.position.lerpVectors(p0, pos, e);
      obj.position.y += Math.sin(e * Math.PI) * arc;
      if (quat) obj.quaternion.slerpQuaternions(q0, quat, e);
      if (scale !== null) obj.scale.setScalar(s0 + (scale - s0) * e);
    }, ease);
  }
  function trash(obj) {
    scene.remove(obj);
    obj.traverse((o) => {
      o.geometry?.dispose?.();
      o.material?.dispose?.();
    });
  }

  // ── Effekt-Bausteine ────────────────────────────────────────────────────────────────────
  function burst(color, origin, amount = 60, ms = 1500, spread = 5, gravity = 6) {
    const count = low ? Math.ceil(amount / 2) : amount;
    const pos = new Float32Array(count * 3);
    const vel = [];
    for (let i = 0; i < count; i += 1) {
      pos.set([origin.x, origin.y, origin.z], i * 3);
      vel.push(new THREE.Vector3((Math.random() - 0.5) * spread, Math.random() * spread * 1.3, (Math.random() - 0.5) * spread));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color, size: 0.22, map: dotTexture(), alphaTest: 0.2, transparent: true, depthWrite: false });
    mat.color.multiplyScalar(2.2);
    mat.toneMapped = false;
    const pts = new THREE.Points(geo, mat);
    scene.add(pts);
    let last = 0;
    return anim(ms, (e, k) => {
      const dt = ((k - last) * ms) / 1000;
      last = k;
      const a = geo.attributes.position;
      for (let i = 0; i < count; i += 1) {
        vel[i].y -= gravity * dt;
        a.setXYZ(i, a.getX(i) + vel[i].x * dt, a.getY(i) + vel[i].y * dt, a.getZ(i) + vel[i].z * dt);
      }
      a.needsUpdate = true;
      mat.opacity = 1 - k;
    }, linear).then(() => {
      scene.remove(pts);
      geo.dispose();
      mat.dispose();
    });
  }

  // Leuchtender Ring, der sich flach ausbreitet (Einschlag, Welle)
  function ring(pos, color, ms = 700, size = 3.2, thick = false) {
    const m = new THREE.Mesh(
      thick ? new THREE.TorusGeometry(1, 0.09, 8, 48) : new THREE.RingGeometry(0.86, 1, 48),
      glow(color, { transparent: true, side: THREE.DoubleSide, depthWrite: false }, 2.6),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.copy(pos);
    scene.add(m);
    return anim(ms, (e, k) => {
      m.scale.setScalar(0.15 + e * size);
      m.material.opacity = 1 - k * k;
    }, easeOut).then(() => trash(m));
  }

  // Leuchtendes Geschoss im Bogen von A nach B
  function projectile(from, to, color, ms, arc = 3, size = 0.3) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(size, 0), glow(color, {}, 3.2));
    m.position.copy(from);
    scene.add(m);
    return anim(ms, (e) => {
      m.position.lerpVectors(from, to, e);
      m.position.y += Math.sin(e * Math.PI) * arc;
      m.rotation.x += 0.3;
      m.rotation.z += 0.2;
    }, easeIn).then(() => trash(m));
  }

  // Gezackter Blitz von oben auf einen Punkt
  function bolt(to, color) {
    const g = new THREE.Group();
    const mat = glow(color, {}, 4);
    let p = to.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, 13, (Math.random() - 0.5) * 3));
    const steps = 9;
    for (let i = 0; i < steps; i += 1) {
      const q = i === steps - 1 ? to.clone() : p.clone().lerp(to, 1 / (steps - i)).add(new THREE.Vector3((Math.random() - 0.5) * 1.1, 0, (Math.random() - 0.5) * 1.1));
      const len = p.distanceTo(q);
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, len, 5), mat);
      seg.position.copy(p).lerp(q, 0.5);
      seg.quaternion.setFromUnitVectors(UP, q.clone().sub(p).normalize());
      g.add(seg);
      p = q;
    }
    scene.add(g);
    return g;
  }

  // ── Zeiger: welche Karte liegt unter der Maus ───────────────────────────────────────────
  function setHover(obj) {
    if (ui.hover === obj) return;
    ui.hover = obj;
    opts.onHover?.(obj && !blind ? obj.userData.card : null);
  }

  // ── Fächer der Mitspieler ───────────────────────────────────────────────────────────────
  function setFan(seat) {
    const av = avatars[seat];
    if (!av) return;
    const want = Math.min(counts[seat], 14);
    while (av.fan.children.length > want) av.fan.remove(av.fan.children[av.fan.children.length - 1]);
    while (av.fan.children.length < want) av.fan.add(makeCard(null));
    const step = Math.min(0.2, 1.7 / Math.max(1, want));
    av.fan.children.forEach((c, i) => {
      const t = i - (want - 1) / 2;
      c.position.set(t * step, -Math.abs(t) * 0.022, i * 0.004);
      c.rotation.set(0, Math.PI, t * 0.085);
      c.scale.setScalar(FAN_SCALE);
    });
    av.setNervous(counts[seat] === 1);
  }

  // ── Eigene Hand ─────────────────────────────────────────────────────────────────────────
  function handMetrics() {
    const halfH = Math.tan(THREE.MathUtils.degToRad(baseFov) / 2) * HAND_DIST;
    const halfW = halfH * camera.aspect;
    const scale = Math.min(0.86, Math.max(0.5, (halfW * 2) / 3.6));
    return { halfH, halfW, scale };
  }
  function layoutHand() {
    const { halfH, halfW, scale } = handMetrics();
    hand.sort((a, b) => sortKey(a.userData.card) - sortKey(b.userData.card) || a.userData.card.id - b.userData.card.id);
    const count = hand.length;
    const room = halfW * 2 - CW * scale - 0.25;
    const step = Math.min(CW * scale * 0.74, room / Math.max(1, count - 1));
    handRig.position.set(0, -halfH + CH * scale * (camera.aspect < 1 ? 0.56 : 0.4), -HAND_DIST);
    hand.forEach((c, i) => {
      const t = i - (count - 1) / 2;
      c.userData.slot = { x: t * step, y: -Math.abs(t) * Math.abs(t) * 0.006 * Math.min(1, 9 / Math.max(1, count)), z: i * 0.006, rz: -t * Math.min(0.045, 0.5 / Math.max(1, count)), scale };
    });
  }
  function addToHand(card, fromWorld, delay = 0) {
    const obj = makeCard(card);
    obj.userData.wait = delay;
    obj.userData.hold = null;
    handRig.add(obj);
    obj.position.copy(handRig.worldToLocal((fromWorld || deck.getWorldPosition(new THREE.Vector3())).clone()));
    obj.rotation.set(-1.2, Math.PI, 0);
    obj.scale.setScalar(0.7);
    hand.push(obj);
    layoutHand();
    return obj;
  }
  function takeFromHand(id) {
    const i = hand.findIndex((c) => c.userData.card.id === id);
    if (i < 0) return null;
    const [obj] = hand.splice(i, 1);
    if (ui.hover === obj) setHover(null);
    scene.attach(obj);
    obj.userData.front.material.color.setScalar(1);
    layoutHand();
    return obj;
  }
  function updateHand(dt) {
    const k = 1 - Math.exp(-dt * 11);
    const myTurn = ui.playable.size > 0 || ui.canDraw;
    for (const c of hand) {
      const u = c.userData;
      if (u.wait > 0) {
        u.wait -= dt;
        continue;
      }
      const s = u.slot;
      if (!s) continue;
      const playable = ui.playable.has(u.card.id);
      const hover = ui.hover === c;
      let { x, y, z } = s;
      let ry = blind ? Math.PI : 0;
      let rz = s.rz;
      let sc = s.scale;
      if (u.hold) {
        ({ x, y, z } = u.hold);
        ry = 0;
        rz = Math.sin(performance.now() / 28) * 0.05;
        sc = s.scale * 1.25;
      } else {
        if (playable) y += 0.1 * s.scale;
        if (hover) {
          y += 0.3 * s.scale;
          z += 0.25;
          sc *= 1.1;
          rz = 0;
        }
      }
      c.position.x += (x - c.position.x) * k;
      c.position.y += (y - c.position.y) * k;
      c.position.z += (z - c.position.z) * k;
      c.rotation.x += (0 - c.rotation.x) * k;
      c.rotation.y += (ry - c.rotation.y) * k;
      c.rotation.z += (rz - c.rotation.z) * k;
      c.scale.setScalar(c.scale.x + (sc - c.scale.x) * k);
      // am Zug: was nicht passt, tritt zurück (blind weiß man es nicht)
      const dim = myTurn && !blind && !playable ? 0.4 : 1;
      const col = u.front.material.color;
      col.setScalar(col.r + (dim - col.r) * k);
    }
  }

  // ── Zeiger ──────────────────────────────────────────────────────────────────────────────
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function pick(ev) {
    const rect = canvas.getBoundingClientRect();
    ndc.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects([...hand, deck], true);
    for (const h of hits) {
      if (h.object === deck) return deck;
      const owner = h.object.parent;
      if (hand.includes(owner)) return owner;
    }
    return null;
  }
  const usable = (obj) => (obj === deck ? ui.canDraw : obj && ui.playable.has(obj.userData.card.id));
  function onMove(ev) {
    const obj = pick(ev);
    setHover(obj && obj !== deck ? obj : null);
    ui.hoverDeck = obj === deck && ui.canDraw;
    canvas.style.cursor = usable(obj) ? 'pointer' : 'default';
  }
  function onDown(ev) {
    onMove(ev);
    ui.down = pick(ev);
  }
  function onUp(ev) {
    const obj = pick(ev);
    const same = obj && obj === ui.down;
    ui.down = null;
    if (ev.pointerType !== 'mouse') setHover(null);
    if (!same || !usable(obj)) return;
    if (obj === deck) opts.onDraw?.();
    else opts.onCard?.(obj.userData.card.id);
  }
  function onLeave() {
    setHover(null);
    ui.hoverDeck = false;
    ui.down = null;
  }
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointerleave', onLeave);

  // ── Welt drehen ─────────────────────────────────────────────────────────────────────────
  // Zielwinkel: die aktuelle Welt liegt unten
  function targetAngle() {
    const want = -(world * Math.PI) / 2;
    const turns = Math.round((drumAngle - want) / (Math.PI * 2));
    return want + turns * Math.PI * 2;
  }
  function applyWorldLook() {
    skyTarget.set(WORLDS[world].sky);
    inlayMat.color.set(WORLDS[world].color).multiplyScalar(1.7);
    worldLight.color.set(WORLDS[world].color);
  }
  function turnDrum(ms) {
    const from = drumAngle;
    const to = targetAngle();
    return anim(ms, (e, k) => {
      drumAngle = from + (to - from) * e;
      fovKick = Math.sin(k * Math.PI) * 9; // die Welt rauscht vorbei: kurz weiter aufziehen
    }).then(() => {
      fovKick = 0;
    });
  }
  function setCharges(list) {
    charges = list.slice();
    for (let i = 0; i < 4; i += 1) levelTarget[i] = charges[i] / RULES.CHARGE_MAX;
    studs.forEach((m, i) => {
      const w = Math.floor(i / RULES.CHARGE_MAX);
      if (i % RULES.CHARGE_MAX < charges[w]) m.material.color.set(WORLDS[w].color).multiplyScalar(2.4);
      else m.material.color.set('#3a3644');
    });
  }

  // ── Karten bewegen ──────────────────────────────────────────────────────────────────────
  function spawnCard(seat, card) {
    const obj = makeCard(card);
    obj.position.copy(anchor(seat));
    obj.quaternion.copy(anchorQuat(seat));
    obj.scale.setScalar(FAN_SCALE);
    scene.add(obj);
    return obj;
  }
  /** Karten vom Stapel (oder von `from`) zu einem Platz; eigene Karten landen in der Hand. */
  function deal(seat, cards, count, from) {
    const jobs = [];
    const origin = from || deck.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, deckLift + 0.05, 0));
    for (let i = 0; i < count; i += 1) {
      if (seat === mySeat && cards?.[i]) {
        addToHand(cards[i], origin, i * 0.16);
        counts[seat] += 1;
        continue;
      }
      const obj = makeCard(null);
      obj.position.copy(origin);
      obj.quaternion.copy(flatQuat(0.1)).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0)));
      obj.visible = false;
      scene.add(obj);
      jobs.push(
        wait(i * 160).then(() => {
          obj.visible = true;
          sfx.draw();
          return fly(obj, anchor(seat), anchorQuat(seat), 380, 0.7, FAN_SCALE);
        }).then(() => {
          dropCard(obj);
          counts[seat] += 1;
          setFan(seat);
        }),
      );
    }
    if (seat === mySeat && count) sfx.draw();
    return Promise.all(jobs);
  }
  const dealAll = (draws) => (draws || []).map((d) => {
    avatars[d.seat]?.hit();
    if (d.seat === mySeat) shake = Math.max(shake, 0.4);
    return deal(d.seat, d.cards, d.cards ? d.cards.length : d.n);
  });

  /** Päckchen aus drei Karten wandert von Punkt zu Punkt (Tausch, Flut, Strudel). */
  function bundle(from, fromQ, to, toQ, ms, arc = 1.6) {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i += 1) {
      const c = makeCard(null);
      c.position.set((i - 1) * 0.1, 0, i * 0.01);
      c.rotation.z = (i - 1) * 0.12;
      g.add(c);
    }
    g.position.copy(from);
    g.quaternion.copy(fromQ);
    scene.add(g);
    return fly(g, to, toQ, ms, arc, null).then(() => {
      g.children.slice().forEach(dropCard);
      g.removeFromParent();
    });
  }
  const seatBundle = (a, b, ms) => bundle(anchor(a), anchorQuat(a), anchor(b), anchorQuat(b), ms);
  // eigene Hand ist weg; die neue kommt beim nächsten sync() von `from`
  function clearHand(from) {
    hand.splice(0).forEach(dropCard);
    setHover(null);
    handSpawn = from;
  }
  // Karte eines Platzes geht verloren: fliegt nach `to` und verschwindet
  function lose(l, to, ms) {
    const obj = (l.seat === mySeat ? takeFromHand(l.card.id) : null) || spawnCard(l.seat, l.card);
    counts[l.seat] = Math.max(0, counts[l.seat] - 1);
    setFan(l.seat);
    const spin = new THREE.Quaternion().setFromEuler(new THREE.Euler(2, 3, 1));
    return fly(obj, to, spin, ms, 0.4, 0.05, easeIn).then(() => dropCard(obj));
  }
  async function swapHands(a, b, ms) {
    const jobs = [seatBundle(a, b, ms), seatBundle(b, a, ms)];
    if (a === mySeat) clearHand(anchor(b));
    if (b === mySeat) clearHand(anchor(a));
    await Promise.all(jobs);
    [counts[a], counts[b]] = [counts[b], counts[a]];
    setFan(a);
    setFan(b);
  }
  // Richtungswechsel: nicht die Welt dreht sich, sondern der Tisch wirbelt einmal in der NEUEN Spielrichtung herum,
  // die Ablage hüpft hoch, und große Pfeile kreisen in dieser Richtung um den Tisch
  async function flipWorld(newDir, ms) {
    dir = newDir;
    shake = Math.max(shake, 0.2);
    const orbit = new THREE.Group();
    const mat = glow('#f4eedf', { transparent: true }, 1.25);
    const geo = new THREE.ConeGeometry(0.26, 0.9, 4);
    geo.rotateX(Math.PI / 2);
    geo.scale(1, 0.3, 1);
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2;
      const m = new THREE.Mesh(geo, mat);
      m.position.set(Math.sin(a) * 4.05, 0, Math.cos(a) * 4.05);
      m.rotation.y = a - Math.PI / 2; // Spitze im Uhrzeigersinn
      orbit.add(m);
    }
    orbit.position.y = 0.9;
    orbit.scale.z = dir; // gespiegelt = gegen den Uhrzeigersinn
    scene.add(orbit);
    await anim(ms, (e, k) => {
      table.rotation.y = -dir * e * Math.PI * 2;
      const hop = Math.sin(k * Math.PI) * 1.8;
      pile.forEach((c, i) => {
        c.position.y = PILE.y + 0.012 * i + hop * (0.6 + (i % 3) * 0.2);
      });
      orbit.rotation.y = -dir * e * Math.PI * 3;
      mat.opacity = Math.min(1, Math.sin(k * Math.PI) * 2.2);
    });
    table.rotation.y = 0;
    pile.forEach((c, i) => {
      c.position.y = PILE.y + 0.012 * i;
    });
    trash(orbit);
  }

  // ── Zielen ──────────────────────────────────────────────────────────────────────────────
  const handOf = (seat) => (avatars[seat] ? avatars[seat].handWorld(new THREE.Vector3()) : new THREE.Vector3(0.9, 0.3, 7.6));
  const colorOf = (seat) => avatars[seat]?.color || myColor;
  const unmark = (seat) => avatars[seat]?.setTargeted(false);
  /**
   * Zeigen: Ein langer Arm mit Zeigefinger streckt sich von `by` bis kurz vor das Ziel und stupst zweimal nach.
   * Das Ziel bekommt rote Ringe und erschrickt (bis unmark). Bin ich das Ziel, zeigt der Finger in die Kamera.
   */
  async function point(by, to, ms) {
    sfx.point();
    const from = handOf(by);
    const tip = to === mySeat ? new THREE.Vector3(0, 2.9, 6.6) : body(to).add(new THREE.Vector3(0, 0.3, 0));
    const way = tip.clone().sub(from);
    const len = Math.max(0.5, way.length() - (to === mySeat ? 0 : 0.95));
    const mat = new THREE.MeshStandardMaterial({ color: colorOf(by), roughness: 0.5 });
    const arm = new THREE.Group();
    const tubeGeo = new THREE.CylinderGeometry(0.11, 0.11, 1, 8);
    tubeGeo.translate(0, 0.5, 0);
    const tube = new THREE.Mesh(tubeGeo, mat);
    const hand = new THREE.Group();
    hand.add(new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), mat));
    const finger = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.5, 4, 8), mat);
    finger.position.y = 0.48;
    const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.16, 4, 8), mat);
    thumb.position.set(0.27, 0.1, 0);
    thumb.rotation.z = -0.9;
    hand.add(finger, thumb);
    arm.add(tube, hand);
    arm.position.copy(from);
    arm.quaternion.setFromUnitVectors(UP, way.normalize());
    scene.add(arm);
    const set = (l) => {
      tube.scale.y = Math.max(0.001, l);
      hand.position.y = l;
    };
    avatars[by]?.hop();
    await anim(ms * 0.36, (e) => set(len * e), easeOut);
    avatars[to]?.setTargeted(true);
    if (to === mySeat) shake = Math.max(shake, 0.35);
    ring(to === mySeat ? new THREE.Vector3(0, 0.3, 4.6) : new THREE.Vector3(tip.x, 0.1, tip.z), '#ff3b30', 500, 2.2);
    await anim(ms * 0.44, (k) => set(len - Math.abs(Math.sin(k * Math.PI * 2)) * 0.45), linear);
    anim(ms * 0.2, (e) => set(len * (1 - e)), easeIn).then(() => trash(arm));
    await wait(ms * 0.2);
  }

  function setActive(seat) {
    avatars.forEach((av, s) => av?.setActive(s === seat));
  }

  // ── Ereignisse abspielen ────────────────────────────────────────────────────────────────
  const handlers = {
    async play(e) {
      const fx = e.card.k !== 'n';
      const total = fx ? ANIM.playFx : ANIM.play;
      const mine = e.seat === mySeat;
      const obj = (mine ? takeFromHand(e.card.id) : null) || spawnCard(e.seat, e.card);
      counts[e.seat] = Math.max(0, counts[e.seat] - 1);
      setFan(e.seat);
      avatars[e.seat]?.hop();
      let used = 0;
      if (fx) {
        // Effektkarte groß zeigen — bei der Figur, die sie spielt (eigene: vor der eigenen Hand), mit Rahmen in
        // ihrer Farbe und einer Leine zur Figur. So verwechselt man fremde Karten nicht mit eigenen.
        const show = mine ? new THREE.Vector3(0, 2.1, 4.3) : body(e.seat).multiplyScalar(0.4).add(new THREE.Vector3(0, 1.7, 0.4));
        const scale = (2.5 * show.distanceTo(camera.getWorldPosition(new THREE.Vector3()))) / 5.8;
        const frame = new THREE.Mesh(cardGeo, glow(colorOf(e.seat), {}, 1.5));
        frame.scale.setScalar(1.1);
        frame.position.z = -0.012;
        const frameBack = frame.clone();
        frameBack.rotation.y = Math.PI;
        obj.add(frame, frameBack);
        sfx.show();
        await fly(obj, show, camera.getWorldQuaternion(new THREE.Quaternion()), 500, 0.5, scale);
        let leash = null;
        if (!mine) {
          const a = handOf(e.seat);
          const way = show.clone().sub(a);
          leash = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, way.length(), 6), glow(colorOf(e.seat), {}, 1.8));
          leash.position.copy(a).lerp(show, 0.5);
          leash.quaternion.setFromUnitVectors(UP, way.normalize());
          scene.add(leash);
        }
        const hold = total - 500 - 420 - 320;
        await anim(hold, (k) => {
          obj.position.y = show.y + Math.sin(k * Math.PI * 2) * 0.05;
        }, linear);
        if (leash) trash(leash);
        obj.remove(frame, frameBack);
        frame.material.dispose();
        used = 500 + hold;
      }
      const target = PILE.clone();
      target.y += 0.012 * Math.min(pile.length, 12);
      const drop = fx ? 420 : total * 0.5;
      await fly(obj, target, flatQuat((Math.random() - 0.5) * 0.9), drop, fx ? 0.3 : 1.1, 1);
      sfx.card();
      ring(new THREE.Vector3(PILE.x, 0.03, PILE.z), WORLDS[e.world].color, 560, fx ? 2.6 : 1.2);
      if (fx) lightKick = Math.max(lightKick, 0.6);
      pile.push(obj);
      while (pile.length > 12) dropCard(pile.shift());
      pile.forEach((c, i) => {
        c.position.y = PILE.y + 0.012 * i;
      });
      setCharges(e.charges);
      await wait(total - used - drop);
    },

    async draw(e) {
      await Promise.all([deal(e.seat, e.cards, e.n), wait(ANIM.draw)]);
    },

    async misplay(e) {
      sfx.wrong();
      const mine = e.seat === mySeat ? hand.find((c) => c.userData.card.id === e.card.id) : null;
      if (mine) {
        mine.userData.hold = { x: 0, y: CH * 1.25, z: 0.7 };
        await wait(ANIM.misplay * 0.75);
        mine.userData.hold = null;
        await wait(ANIM.misplay * 0.25);
        return;
      }
      const obj = spawnCard(e.seat, e.card);
      const home = obj.position.clone();
      const homeQ = obj.quaternion.clone();
      await fly(obj, new THREE.Vector3(0, 1.5, 1.2), camera.getWorldQuaternion(new THREE.Quaternion()), ANIM.misplay * 0.3, 0.4, 1.3);
      avatars[e.seat]?.hit();
      await anim(ANIM.misplay * 0.4, (k) => {
        obj.rotation.z = Math.sin(k * 40) * 0.08 * (1 - k);
      });
      await fly(obj, home, homeQ, ANIM.misplay * 0.3, 0.4, FAN_SCALE);
      dropCard(obj);
    },

    async world(e) {
      sfx.world();
      ambience(e.to);
      world = e.to;
      applyWorldLook();
      shake = Math.max(shake, 0.16);
      lightKick = Math.max(lightKick, 1);
      burst(WORLDS[e.to].color, new THREE.Vector3(0, 0.2, 0), 50, 1200, 9, 2);
      await turnDrum(ANIM.world * 0.9);
      await wait(ANIM.world * 0.1);
    },

    async flip(e) {
      sfx.flip();
      await flipWorld(e.dir, ANIM.flip * 0.85);
      await wait(ANIM.flip * 0.15);
    },

    // Sturm: erst zeigen, dann fliegt die Figur davon und bleibt weg, bis sie wieder dran ist
    async skip(e) {
      await point(e.by, e.seat, 800);
      sfx.skip();
      const av = avatars[e.seat];
      if (av) {
        burst('#ffffff', body(e.seat), 50, 1100, 5, 1);
        av.setAway(true); // kommt zurück, sobald sie wieder dran ist (turn)
      } else if (e.seat === mySeat) {
        shake = Math.max(shake, 0.4);
        anim(1300, (k) => {
          roll = Math.sin(k * Math.PI * 3) * 0.14 * (1 - k);
        }, linear).then(() => {
          roll = 0;
        });
      }
      unmark(e.seat);
      await wait(ANIM.skip - 800);
    },

    // Meteor: zeigen, dann stürzt ein großer brennender Brocken aus dem Himmel auf das Ziel
    async meteor(e) {
      await point(e.by, e.seat, 900);
      sfx.meteor();
      const to = body(e.seat);
      const m = new THREE.Group();
      const rockMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1.15, 1), glow('#ff8a2a', {}, 2.4));
      const crust = new THREE.Mesh(new THREE.IcosahedronGeometry(1.2, 0), new THREE.MeshStandardMaterial({ color: '#3a2622', roughness: 1, flatShading: true, wireframe: false, transparent: true, opacity: 0.55 }));
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.95, 7, 8, 1, true), glow('#ff6a1f', { transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }, 2.2));
      const tail2 = new THREE.Mesh(new THREE.ConeGeometry(0.5, 9, 8, 1, true), glow('#ffe27a', { transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }, 2.8));
      tail.position.y = 3.6;
      tail2.position.y = 4.4;
      m.add(rockMesh, crust, tail, tail2);
      const from = to.clone().add(new THREE.Vector3(to.x * 0.5 + 4, 17, -10));
      m.position.copy(from);
      m.quaternion.setFromUnitVectors(UP, from.clone().sub(to).normalize());
      scene.add(m);
      let puffAt = 0;
      await anim(1000, (k) => {
        m.position.lerpVectors(from, to, k);
        rockMesh.rotation.x += 0.3;
        crust.rotation.y += 0.2;
        lightKick = Math.max(lightKick, k * 1.5);
        if (k > puffAt) {
          puffAt = k + 0.07;
          burst('#ff9a2e', m.position, 10, 600, 2.5, 1);
        }
      }, easeIn);
      trash(m);
      shake = Math.max(shake, 0.95);
      lightKick = 2.6;
      avatars[e.seat]?.hit();
      burst('#ffb23e', to, 130, 1300, 9);
      burst('#3a2622', to, 40, 1100, 7, 9);
      ring(new THREE.Vector3(to.x, 0.1, to.z), '#ff8a2a', 800, 4, true);
      wait(140).then(() => ring(new THREE.Vector3(to.x, 0.1, to.z), '#ffe27a', 700, 5.5, true));
      unmark(e.seat);
      await Promise.all([deal(e.seat, e.cards, e.n), wait(ANIM.meteor - 900 - 1000)]);
    },

    // Feuerwalze: ein Kranz aus Flammen rollt vom Tisch nach außen, jeder Getroffene zieht
    async walze(e) {
      sfx.walze();
      shake = Math.max(shake, 0.45);
      lightKick = 1.8;
      const wall = new THREE.Group();
      const flameMat = glow('#ff7b1c', { transparent: true }, 2.2);
      const coreMat = glow('#ffe27a', { transparent: true }, 2.8);
      const flameGeo = new THREE.ConeGeometry(0.2, 1.3, 6);
      flameGeo.translate(0, 0.65, 0);
      const flames = [];
      for (let i = 0; i < 26; i += 1) {
        const a = (i / 26) * Math.PI * 2;
        const f = new THREE.Mesh(flameGeo, i % 2 ? coreMat : flameMat);
        f.userData.a = a;
        flames.push(f);
        wall.add(f);
      }
      wall.position.y = 0.05;
      scene.add(wall);
      ring(new THREE.Vector3(0, 0.25, 0), '#ff7b1c', ANIM.walze * 0.6, 7, true);
      burst('#ff7b1c', new THREE.Vector3(0, 0.3, 0), 80, 1200, 8, 3);
      const spread = anim(ANIM.walze * 0.62, (ek, k) => {
        const r = 0.6 + ek * 6.4;
        flames.forEach((f, i) => {
          f.position.set(Math.sin(f.userData.a) * r, 0, Math.cos(f.userData.a) * r);
          f.scale.set(1 + r * 0.25, 1.2 + Math.sin(k * 40 + i) * 0.5 + r * 0.2, 1 + r * 0.25);
        });
        flameMat.opacity = 1 - k * k;
        coreMat.opacity = 1 - k * k;
      }, easeOut).then(() => trash(wall));
      await wait(ANIM.walze * 0.35);
      for (const d of e.draws) burst('#ffb23e', body(d.seat), 30, 800, 3.5);
      await Promise.all([...dealAll(e.draws), spread, wait(ANIM.walze * 0.65)]);
    },

    // Frost: zeigen, Eissplitter fliegt zum Ziel, Eiszacken schießen aus dem Boden, das Ziel erstarrt
    async frost(e) {
      await point(e.by, e.seat, 800);
      sfx.frost();
      const to = body(e.seat);
      await projectile(handOf(e.by), to, '#bfe9ff', 420, 1.6, 0.3);
      avatars[e.seat]?.setFrozen(true);
      avatars[e.seat]?.hit();
      if (e.seat === mySeat) shake = Math.max(shake, 0.35);
      lightKick = 1.2;
      burst('#dff4ff', to, 60, 1000, 4.5, 3);
      ring(new THREE.Vector3(to.x, 0.1, to.z), '#bfe9ff', 700, 2.6, true);
      // Eiszacken rings um das Ziel
      const spikes = new THREE.Group();
      const spikeMat = glow('#bfe9ff', { transparent: true }, 1.5);
      const spikeGeo = new THREE.ConeGeometry(0.22, 1.7, 5);
      spikeGeo.translate(0, 0.85, 0);
      for (let i = 0; i < 9; i += 1) {
        const s = new THREE.Mesh(spikeGeo, spikeMat);
        const a = (i / 9) * Math.PI * 2;
        s.position.set(Math.sin(a) * 1.25, 0, Math.cos(a) * 1.25);
        s.rotation.set(Math.cos(a) * 0.35, 0, -Math.sin(a) * 0.35);
        s.scale.y = 0.6 + (i % 3) * 0.3;
        spikes.add(s);
      }
      spikes.position.set(to.x, to.y - 1.9, to.z);
      scene.add(spikes);
      anim(1100, (k) => {
        spikes.scale.y = Math.min(1, k * 6);
        spikeMat.opacity = 1 - Math.max(0, k - 0.5) * 2;
      }, linear).then(() => trash(spikes));
      unmark(e.seat);
      await wait(ANIM.frost - 800 - 420);
    },

    async again(e) {
      sfx.again();
      const p = body(e.seat);
      ring(new THREE.Vector3(p.x, 0.15, p.z), '#5fb6ff', 600, 2.2, true);
      wait(160).then(() => ring(new THREE.Vector3(p.x, 0.15, p.z), '#bfe1ff', 560, 2.8, true));
      avatars[e.seat]?.hop();
      await wait(ANIM.again);
    },

    async shield(e) {
      sfx.shield();
      avatars[e.seat]?.setShield(true);
      burst('#7dff9a', body(e.seat), 40, 800, 3.5, 1);
      await wait(ANIM.shield);
    },

    // Dornenschild fängt einen Angriff ab und zerspringt
    async block(e) {
      sfx.block();
      const p = body(e.seat);
      avatars[e.seat]?.setShield(false);
      avatars[e.seat]?.hop();
      burst('#9dffb0', p, 60, 800, 6, 4);
      ring(p, '#9dffb0', 500, 2.4);
      lightKick = 1;
      await wait(ANIM.block);
    },

    // Aufgetaut: der Eisblock zerspringt, der Spieler setzt dafür aus
    async thaw(e) {
      sfx.block();
      avatars[e.seat]?.setFrozen(false);
      burst('#dff4ff', body(e.seat), 50, 800, 5, 5);
      await wait(ANIM.thaw);
    },

    // Saat: zeigen, dann wandert eine Karte von Hand zu Hand
    async gift(e) {
      await point(e.from, e.to, 800);
      sfx.swap();
      const obj = (e.from === mySeat && e.card ? takeFromHand(e.card.id) : null) || spawnCard(e.from, null);
      counts[e.from] = Math.max(0, counts[e.from] - 1);
      setFan(e.from);
      const to = anchor(e.to);
      burst('#7dff9a', anchor(e.from), 20, 700, 2.5, 1);
      await fly(obj, to, anchorQuat(e.to), 700, 2, FAN_SCALE);
      dropCard(obj);
      if (e.to === mySeat && e.card) addToHand(e.card, to);
      counts[e.to] += 1;
      setFan(e.to);
      avatars[e.to]?.hit();
      burst('#7dff9a', to, 26, 700, 3, 2);
      unmark(e.to);
      await wait(ANIM.gift - 800 - 700);
    },

    // Wurmloch: zeigen, dann tauschen die Hände durch einen leuchtenden Ring in der Tischmitte
    async swap(e) {
      await point(e.a, e.b, 800);
      sfx.swap();
      ring(CENTER, '#c9a2ff', 1100, 2.4, true);
      wait(200).then(() => ring(CENTER, '#ff9ee0', 900, 1.8, true));
      lightKick = 1;
      await swapHands(e.a, e.b, 1100);
      unmark(e.b);
      await wait(ANIM.swap - 800 - 1100);
    },

    // Strahl: zeigen, dann fahren Blitze in einer Lichtsäule auf das Ziel nieder
    async beam(e) {
      await point(e.by, e.seat, 800);
      sfx.beam();
      const to = body(e.seat);
      const column = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 16, 12, 1, true), glow('#c9a2ff', { transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }, 1.8));
      column.position.set(to.x, to.y + 7, to.z);
      scene.add(column);
      for (let i = 0; i < 4; i += 1) {
        const b = bolt(to, i % 2 ? '#ffffff' : '#c9a2ff');
        const b2 = bolt(to.clone().add(new THREE.Vector3(0.5 - i * 0.3, 0, 0.3)), '#ffffff');
        lightKick = 2.4;
        column.material.opacity = 0.45;
        await wait(110);
        trash(b);
        trash(b2);
        column.material.opacity = 0.15;
        await wait(60);
      }
      trash(column);
      shake = Math.max(shake, 0.55);
      avatars[e.seat]?.hit();
      burst('#c9a2ff', to, 80, 1000, 6);
      ring(new THREE.Vector3(to.x, 0.1, to.z), '#c9a2ff', 700, 3, true);
      unmark(e.seat);
      await Promise.all([deal(e.seat, e.cards, e.n), wait(ANIM.beam - 800 - 680)]);
    },

    async combo() {
      await wait(ANIM.combo);
    },

    // Weltereignis: die Welt bäumt sich auf, dann je nach Ereignis Geschosse, Kartenflug, Tausch, Eis
    async erupt(e) {
      const w = e.world;
      sfx.erupt(w);
      const color = WORLDS[w].color;
      levelTarget[w] = 1.22;
      shake = Math.max(shake, 0.6);
      lightKick = 2;
      const rumble = anim(ANIM.erupt * 0.5, (k) => {
        shake = Math.max(shake, 0.3 * (1 - k));
      }, linear);
      burst(color, new THREE.Vector3(0, -0.5, 0), 140, 1700, 11);
      ring(new THREE.Vector3(0, 0.2, 0), color, 900, 8, true);
      wait(200).then(() => ring(new THREE.Vector3(0, 0.2, 0), '#ffffff', 800, 6.5, true));
      await wait(ANIM.erupt * 0.3);

      const part = ANIM.erupt * 0.42;
      const jobs = [rumble];
      if (e.draws) {
        if (w === 0) {
          // Lavabrocken fliegen zu den Getroffenen
          const size = e.ev === 'lavabombe' ? 0.6 : 0.3;
          await Promise.all(e.draws.map((d) => projectile(new THREE.Vector3(0, -1, 0), body(d.seat), '#ffb23e', part * 0.5, 4.5, size)));
          for (const d of e.draws) burst('#ff7b1c', body(d.seat), e.ev === 'lavabombe' ? 70 : 30, 800, 5);
          if (e.ev === 'lavabombe') shake = Math.max(shake, 0.7);
        } else {
          for (const d of e.draws) burst(color, body(d.seat), 34, 1000, 3.5);
        }
        jobs.push(...dealAll(e.draws));
      }
      if (e.losses) {
        // Karten verschwinden: im Kosmos ins Schwarze Loch, sonst nach oben in den Funkenregen
        const hole = walls[3].hole.getWorldPosition(new THREE.Vector3());
        for (const l of e.losses) {
          const to = w === 3 ? hole : anchor(l.seat).add(new THREE.Vector3(0, 5, 0));
          jobs.push(lose(l, to, part).then(() => (w === 3 ? null : burst(color, to, 20, 600, 3))));
        }
      }
      if (e.rotate) {
        for (let p = 0; p < n; p += 1) jobs.push(seatBundle(p, (p + e.rotate + n) % n, part));
        if (mySeat !== null) clearHand(anchor((mySeat - e.rotate + n) % n));
        jobs.push(wait(part).then(() => {
          const old = counts.slice();
          for (let p = 0; p < n; p += 1) counts[(p + e.rotate + n) % n] = old[p];
          for (let p = 0; p < n; p += 1) setFan(p);
        }));
      }
      if (e.mix) {
        // Strudel: alle Hände in die Mitte, einmal herum, wieder hinaus
        const q = flatQuat(0);
        for (let p = 0; p < n; p += 1) {
          jobs.push(bundle(anchor(p), anchorQuat(p), CENTER, q, part * 0.45, 0.8).then(() => bundle(CENTER, q, anchor(p), anchorQuat(p), part * 0.45, 0.8)));
        }
        if (mySeat !== null) clearHand(CENTER.clone());
        ring(CENTER, color, part, 4, true);
      }
      if (e.swap) jobs.push(swapHands(e.swap[0], e.swap[1], part));
      if (e.flip) jobs.push(flipWorld(e.flip, part));
      if (e.freeze) {
        for (const p of e.freeze) {
          avatars[p]?.setFrozen(true);
          avatars[p]?.hit();
          burst('#51cf66', body(p), 40, 900, 4, 2);
        }
      }
      await Promise.all(jobs);
      await wait(ANIM.erupt * 0.2);
      charges[w] = 0;
      setCharges(charges);
    },

    async dark(e) {
      sfx.dark();
      darkTarget = 1;
      blind = mySeat !== null && isFoe(e.by, mySeat);
      if (blind) setHover(null);
      await wait(ANIM.dark);
    },
    async light() {
      sfx.light();
      darkTarget = 0;
      blind = false;
      await wait(ANIM.light);
    },

    async reshuffle() {
      const moving = pile.splice(0, Math.max(0, pile.length - 1));
      const to = deck.getWorldPosition(new THREE.Vector3());
      await Promise.all(moving.map((c, i) => fly(c, to, null, ANIM.reshuffle * 0.8, 0.3 + i * 0.03, null).then(() => dropCard(c))));
      await wait(ANIM.reshuffle * 0.2);
    },

    async turn(e) {
      setActive(e.seat);
      // wer weggeweht war, kommt zu seinem Zug zurück
      if (avatars[e.seat]?.away) {
        avatars[e.seat].setAway(false);
        sfx.skip();
        wait(450).then(() => burst('#ffffff', body(e.seat), 24, 600, 3, 1));
      }
      await wait(ANIM.turn);
    },

    async win(e) {
      const team = e.team ?? null;
      avatars.forEach((av, seat) => {
        av?.setActive(false);
        av?.setAway(false);
        av?.setCheer(seat === e.seat || (team !== null && !!teams && teams[seat] === team));
      });
      lightKick = 2;
      ['#ffd23f', '#ff5d8f', '#3ddbd9', '#ffffff'].forEach((c, i) => burst(c, new THREE.Vector3((i - 1.5) * 1.2, 1, 0), 80, 2800, 8));
      ring(new THREE.Vector3(0, 0.2, 0), '#ffd23f', 1200, 9, true);
      await wait(ANIM.win);
    },
  };

  // ── Öffentliche Funktionen ──────────────────────────────────────────────────────────────
  /** Tisch für eine Runde aufbauen. my: eigener Platz oder null (Zuschauer). teamOf: Team je Platz oder null. skins: Aussehen je Platz. */
  function setSeats(count, my, teamOf = null, skins = []) {
    avatars.forEach((av) => av && trash(av.group));
    hand.splice(0).forEach(dropCard);
    pile.splice(0).forEach(dropCard);
    n = count;
    mySeat = my;
    teams = teamOf;
    counts = new Array(n).fill(0);
    if (my !== null) myColor = SKIN_COLORS[normalizeSkin(skins[my], my).c].hex;
    avatars = [];
    for (let s = 0; s < n; s += 1) {
      if (s === mySeat) {
        avatars.push(null);
        continue;
      }
      const av = createAvatar(s, skins[s], teams ? TEAMS[teams[s]].color : null);
      av.group.position.copy(seatPos(s)).setY(av.baseY);
      av.group.lookAt(0, av.baseY, 0);
      scene.add(av.group);
      avatars.push(av);
    }
    handSpawn = null;
    setHover(null);
  }

  /** Anzeige hart auf die Sicht stellen. fresh: neue Runde — die Hand wird ausgeteilt. */
  function sync(view, fresh = false) {
    if (disposed || !view || view.n !== n) return;
    world = view.world;
    dir = view.dir;
    applyWorldLook();
    ambience(world);
    if (fresh) {
      drumAngle = targetAngle();
    } else if (Math.abs(targetAngle() - drumAngle) > 0.01) {
      turnDrum(500);
    }
    setCharges(view.charges);
    darkTarget = view.dark > 0 ? 1 : 0;
    blind = view.dark > 0 && mySeat !== null && view.darkBy !== null && isFoe(view.darkBy, mySeat);
    counts = view.counts.slice();
    const won = (s) => view.winner !== null && (s === view.winner || (view.winTeam !== null && !!teams && teams[s] === view.winTeam));
    for (let s = 0; s < n; s += 1) {
      setFan(s);
      avatars[s]?.setShield(view.shield[s]);
      avatars[s]?.setFrozen(view.frozen[s]);
      avatars[s]?.setCheer(won(s));
    }
    setActive(view.winner === null ? view.turn : -1);
    if (view.winner === null) avatars[view.turn]?.setAway(false);
    else avatars.forEach((av) => av?.setAway(false));

    // Hand abgleichen
    if (view.hand) {
      const want = new Map(view.hand.map((c) => [c.id, c]));
      for (let i = hand.length - 1; i >= 0; i -= 1) {
        if (!want.has(hand[i].userData.card.id)) {
          if (ui.hover === hand[i]) setHover(null);
          dropCard(hand.splice(i, 1)[0]);
        }
      }
      const have = new Set(hand.map((c) => c.userData.card.id));
      let k = 0;
      for (const c of view.hand) {
        if (have.has(c.id)) continue;
        addToHand(c, handSpawn, k * (fresh ? 0.11 : 0.04));
        k += 1;
      }
      layoutHand();
    }
    handSpawn = null;

    // Ablage: die oberste Karte muss stimmen
    const topObj = pile[pile.length - 1];
    if (!topObj || topObj.userData.card?.id !== view.top.id) {
      const obj = makeCard(view.top);
      obj.position.copy(PILE);
      obj.position.y += 0.012 * Math.min(pile.length, 12);
      obj.quaternion.copy(flatQuat(0.15));
      scene.add(obj);
      pile.push(obj);
    }
    deckLift = Math.max(0.012, view.deckCount * 0.0042);
    deck.scale.y = deckLift;
    deck.visible = view.deckCount > 0;
  }

  /** Ereignisse eines Zugs nacheinander abspielen. onEvent(e) wird gerufen, sobald ein Ereignis beginnt. */
  async function play(events, onEvent) {
    for (const e of events) {
      if (disposed) return;
      onEvent?.(e);
      const h = handlers[e.t];
      if (h) await h(e);
    }
  }

  function setInteractive({ playable = [], canDraw = false } = {}) {
    ui.playable = new Set(playable);
    ui.canDraw = canDraw;
    if (!canDraw) ui.hoverDeck = false;
  }

  /** Bildschirmposition über dem Kopf eines Mitspielers (für Namensschilder), null für den eigenen Platz. */
  const proj = new THREE.Vector3();
  function plate(seat) {
    const av = avatars[seat];
    if (!av) return null;
    av.plateWorld(proj);
    proj.project(camera);
    return { x: (proj.x * 0.5 + 0.5) * canvas.clientWidth, y: (-proj.y * 0.5 + 0.5) * canvas.clientHeight };
  }

  function resize() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    composer?.setSize(w, h);
    camera.aspect = w / h;
    // Hochformat: etwas weiter öffnen und die Kamera zurücknehmen, damit der Tisch samt Sitznachbarn ins Bild passt
    const narrow = Math.max(0, 1.25 - camera.aspect);
    baseFov = 50 + Math.min(22, narrow * 30);
    camera.fov = baseFov;
    camera.position.set(0, 4.5, 9.4).multiplyScalar(1 + narrow * 0.78);
    camera.lookAt(0, -0.1, -0.6);
    camera.updateProjectionMatrix();
    layoutHand();
  }

  // ── Bildschleife ────────────────────────────────────────────────────────────────────────
  const clock = new THREE.Clock();
  let frame = 0;
  let time = 0;
  const black = new THREE.Color('#000000');
  function loop() {
    if (disposed) return;
    frame = requestAnimationFrame(loop);
    const dt = Math.min(0.05, clock.getDelta());
    time += dt;

    for (const a of [...anims]) {
      a.t += dt * 1000;
      const k = Math.min(1, a.t / a.ms);
      a.fn(a.ease(k), k);
      if (k >= 1) {
        anims.delete(a);
        a.resolve();
      }
    }

    drum.rotation.z = drumAngle;
    if (Math.abs(camera.fov - (baseFov + fovKick)) > 0.01) {
      camera.fov = baseFov + fovKick;
      camera.updateProjectionMatrix();
    }
    const lk = 1 - Math.exp(-dt * 3.2);
    for (let i = 0; i < 4; i += 1) {
      levels[i] += (levelTarget[i] - levels[i]) * lk;
      focus[i] += ((i === world ? 1 : 0) - focus[i]) * lk;
      walls[i].update(time, dt, levels[i] * (0.45 + 0.55 * focus[i]), focus[i]);
    }

    darkness += (darkTarget - darkness) * (1 - Math.exp(-dt * 4));
    lightKick = Math.max(0, lightKick - dt * 3.5);
    sky.lerp(skyTarget, 1 - Math.exp(-dt * 3));
    scene.background.copy(sky).lerp(black, darkness * 0.82);
    scene.fog.color.copy(scene.background);
    hemi.intensity = 1.25 - darkness * 1.0 + lightKick * 0.12;
    sun.intensity = 1.7 - darkness * 1.45;
    worldLight.intensity = 60 - darkness * 30 + lightKick * 34;
    if (bloom) bloom.strength = 0.75 + lightKick * 0.25;

    arrows.rotation.y -= dir * dt * 0.35;
    arrows.scale.z = dir; // Pfeile zeigen in Spielrichtung
    deck.position.y = DECK.y + (ui.hoverDeck ? 0.08 : 0) + (ui.canDraw ? Math.abs(Math.sin(time * 3)) * 0.03 : 0);

    avatars.forEach((av) => av?.update(time, dt));
    updateHand(dt);

    shake = Math.max(0, shake - dt * 1.4);
    camRig.position.set((Math.random() - 0.5) * shake * 0.5, (Math.random() - 0.5) * shake * 0.5, 0);
    camRig.rotation.z = roll + Math.sin(time * 0.4) * 0.004;

    if (composer) composer.render();
    else renderer.render(scene, camera);
    opts.onFrame?.();
  }

  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  loop();

  function dispose() {
    disposed = true;
    ambience(-1);
    cancelAnimationFrame(frame);
    ro.disconnect();
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointerleave', onLeave);
    for (const a of anims) a.resolve();
    anims.clear();
    scene.traverse((o) => {
      o.geometry?.dispose?.();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      mats.forEach((m) => m.dispose?.());
    });
    textures.forEach((t) => t.dispose());
    composer?.dispose();
    renderer.dispose();
  }

  return { setSeats, sync, play, setInteractive, plate, resize, dispose };
}
