// cinemaScene.js — Stream-Ending als 3D-Kino (three.js).
//
// Ablauf:
//   • Die Kamera steht im Flur vor Saal 1 (Plakate links und rechts), geht los, die Türen schwingen auf, sie geht in einem Zug
//     und gleichmäßigem Tempo hinein, die rechte Treppe hinunter, durch Reihe 5 bis zur
//     Saalmitte und setzt sich.
//   • Saallicht dimmt, der Vorhang öffnet sich. Sobald Credits da sind (Streamer.bot),
//     läuft der Filmvorspann 3-2-1 und danach der Abspann auf der Leinwand.
//   • Clips: die Szene meldet über onClip() das Rechteck auf dem Bildschirm, über das
//     die Seite den Twitch-Player legt. Das passt pixelgenau, weil die Leinwand genau
//     zum Sitzplatz hin geneigt ist (keine Verzerrung) und die Kamera dann stillsteht.
//   • Endkarte, später schließt sich der Vorhang und das Saallicht kommt halb zurück.
//   • Im Saal sitzen die Chatter (cinemaAudience.js): Namen aus den Credits und aus dem Chat,
//     zufällig verteilt; der eigene Platz, der Weg dorthin und Sitze vor der Leinwand bleiben frei.
//
// Die Leinwand ist ein 1920×1080-Canvas (cinemaScreen.js) — gezeichnet wird nur neu,
// wenn sich dort etwas bewegt. Der Abspann scrollt als vorgemalter Streifen (siehe roll).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createStage, canvasTexture, smooth, easeInOut, phase, lerp, clamp01, box, rng } from './sceneKit';
import {
  SCREEN_W, SCREEN_H, CLIP_INSET, LEADER_S,
  ROLL_CHUNK_H, ROLL_STEP,
  layoutCredits, rollPosition, chunkBlocks, drawChunkBlock, clearChunk, drawVignette, drawWaiting, drawLeader, drawClipFrame, drawEnd,
} from './cinemaScreen';
import { createAudience, creditNames, PERSON_SEATED_HEAD_TOP } from './cinemaAudience';
import { SEATED_HEAD_TOP } from './chatterFigure';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createAssets, createPostFX, warmUp } from '../ClashRoyale/modes/scene3d/kit';
import {
  carpetTexture, wallTexture, velvetTexture, doorTexture, signTexture, posterTexture, lightPoolTexture,
} from './cinemaTextures';

/**
 * Eigene Plakate für den Flur: jedes Bild in src/assets/streamScenes/posters/ wird
 * automatisch mitgebaut (Hochformat ideal, wird sonst mittig auf 2:3 beschnitten).
 * Bis zu 6 Plätze; fehlende füllen die gemalten Plakate.
 */
const POSTER_URLS = Object.values(import.meta.glob('/src/assets/streamScenes/posters/*.{png,jpg,jpeg,webp}', {
  eager: true, query: '?url', import: 'default',
}));

/** Bild mittig auf ein Seitenverhältnis beschneiden (wie CSS object-fit: cover). */
function coverCrop(tex, aspect) {
  const img = tex.image;
  const ia = img.width / img.height;
  if (ia > aspect) {
    tex.repeat.set(aspect / ia, 1);
    tex.offset.set((1 - aspect / ia) / 2, 0);
  } else {
    tex.repeat.set(1, ia / aspect);
    tex.offset.set(0, (1 - ia / aspect) / 2);
  }
}

// ── Maße (Meter) ──────────────────────────────────────────────────────────────
const HX = 8;                       // Saal von x = -8 bis 8
const FRONT_Z = -11.8;
const BACK_Z = 9.5;
const CEIL_Y = 8.8;
const ROWS = 8;
const ROW_D = 1.1;
const ROW_RISE = 0.3;
const ROW0_Z = -4.6;
const PLATFORM_Z = ROW0_Z + ROWS * ROW_D;     // 4.2 — hinterer Gang
const PLATFORM_Y = ROWS * ROW_RISE;           // 2.4
const SEATS = 19;
const SEAT_GAP = 0.62;
const AISLE_X0 = 5.95;                        // Seitengänge ab |x| > 5.95
const WALK_X = 7.0;
const MY_ROW = 4;
const STAND_EYE = 1.65;
const rowFront = (i) => ROW0_Z + i * ROW_D;
const seatZ = (i) => rowFront(i) + 0.6;

const DOOR_X0 = 6.1, DOOR_X1 = 7.9, DOOR_H = 2.4;
const CORR_X0 = 5.6, CORR_X1 = 8.4, CORR_Z1 = 19.6, CORR_H = 3.0;

const SCREEN_WM = 12, SCREEN_HM = 6.75;       // Leinwand 16:9
const SCREEN_C = new THREE.Vector3(0, 4.55, -10.9);
const SEAT_POS = new THREE.Vector3(0, MY_ROW * ROW_RISE + 1.15, seatZ(MY_ROW) + 0.08);
const PROJECTOR = new THREE.Vector3(0, 7.3, BACK_Z - 0.05);
/** So viel der Bildbreite/-höhe nimmt die Leinwand im Sitzen ein. */
const SCREEN_FILL = 0.8;
const WALK_FOV = 58;

/** Bodenhöhe, über die die Kamera läuft: Treppe im Seitengang (halbe Stufen), sanft gerundet. */
function floorAt(z) {
  if (z > PLATFORM_Z + 0.2) return PLATFORM_Y;
  let y = 0;
  for (let i = 1; i <= ROWS; i++) {
    for (const edge of [rowFront(i) - 0.55, rowFront(i)]) {
      y += 0.15 * smooth((z - (edge - 0.12)) / 0.24);
    }
  }
  return y;
}

const v = (x, y, z) => new THREE.Vector3(x, y, z);

// ── Kamerafahrt ──────────────────────────────────────────────────────────────
// EIN durchgehender Weg (Flur → Treppe → Reihe) mit gleichmäßigem Schritttempo:
// sanft anlaufen, konstant gehen, sanft anhalten — keine Zwischenstopps. Gemessen
// wird in Metern entlang der Kurve (getPointAt), damit Kurven nicht schneller wirken.
const WALK = new THREE.CatmullRomCurve3([
  [7.0, 17.8], [7.0, 16.0], [7.0, 14.0], [7.0, 12.0], [7.0, 10.0], [7.0, 8.0], [7.0, 6.0], [7.03, 4.0], [7.05, 2.0],
  [6.95, 0.6], [6.4, 0.0], [5.0, -0.03], [3.0, -0.03], [1.2, -0.02], [0.25, -0.02],
].map(([x, z]) => v(x, 0, z)), false, 'centripetal');
const WALK_LEN = WALK.getLength();
const WALK_SPEED = 1.55;        // m/s
const WALK_ACC = 1.4;           // s Anlaufen
const WALK_DEC = 1.6;           // s Abbremsen
const SIT_S = 2.0;

// ── Zeitplan (Sekunden) ──────────────────────────────────────────────────────
const T_DOORS = [3.8, 5.8];
const T_WALK0 = 1.8;
const T_WALK_END = T_WALK0 + WALK_LEN / WALK_SPEED + (WALK_ACC + WALK_DEC) / 2;
const T_SEATED = T_WALK_END + SIT_S;
const T_LIGHTS = [T_SEATED - 0.4, T_SEATED + 3.6];
const T_CURTAIN = [T_SEATED, T_SEATED + 4.2];
const T_SHOW_READY = T_SEATED + 3.4;
const SKIP_TO = T_SEATED;       // ?skip=1: gleich am Platz

/** Strecke (m) und Tempoanteil 0…1 nach `t` Sekunden Gehen — Rampen sind Smoothstep-Kurven. */
function walkProgress(t) {
  const total = T_WALK_END - T_WALK0;
  if (t <= 0) return { s: 0, k: 0 };
  if (t >= total) return { s: WALK_LEN, k: 0 };
  const ramp = (x) => x * x * x - x * x * x * x / 2;   // ∫ smoothstep
  if (t < WALK_ACC) {
    const x = t / WALK_ACC;
    return { s: WALK_SPEED * WALK_ACC * ramp(x), k: smooth(x) };
  }
  if (t > total - WALK_DEC) {
    const y = (total - t) / WALK_DEC;
    return { s: WALK_LEN - WALK_SPEED * WALK_DEC * ramp(y), k: smooth(y) };
  }
  return { s: WALK_SPEED * (WALK_ACC / 2 + t - WALK_ACC), k: 1 };
}

/** Wie stark der Blick zur Leinwand geht (0 = in Gehrichtung). */
function attention(p) {
  if (p.z > BACK_Z + 0.2) return 0;                 // Flur: geradeaus durch die Tür
  if (p.z > PLATFORM_Z) return 0.72;                // oben: den Saal bestaunen
  if (p.x > AISLE_X0 - 0.2) return 0.45;            // Treppe: halb auf die Stufen
  return lerp(1, 0.55, clamp01(p.x / 5.5));         // Reihe: zur Mitte hin ganz zur Leinwand
}

/** Einfache Überblendung eines Werts: set(ziel, jetzt, dauer), get(jetzt). */
function tween(value) {
  let from = value, to = value, t0 = 0, dur = 0;
  return {
    set(target, now, d) { from = this.get(now); to = target; t0 = now; dur = d; },
    get(now) { return dur <= 0 ? to : lerp(from, to, easeInOut((now - t0) / dur)); },
    get target() { return to; },
  };
}

// ── Bauteile ─────────────────────────────────────────────────────────────────
function seatGeometries() {
  const cushion = new RoundedBoxGeometry(0.5, 0.13, 0.48, 2, 0.05).translate(0, 0.46, -0.02);
  const back = new RoundedBoxGeometry(0.5, 0.72, 0.13, 2, 0.05).rotateX(-0.12).translate(0, 0.87, 0.27);
  const head = new RoundedBoxGeometry(0.46, 0.16, 0.16, 2, 0.06).translate(0, 1.22, 0.33);
  const fabric = mergeGeometries([cushion.toNonIndexed(), back.toNonIndexed(), head.toNonIndexed()]);
  const side = new THREE.BoxGeometry(0.06, 0.6, 0.56).translate(0, 0.3, 0.05);
  const arm = new RoundedBoxGeometry(0.09, 0.05, 0.54, 2, 0.02).translate(0, 0.63, 0.03);
  const frame = mergeGeometries([side.toNonIndexed(), arm.toNonIndexed()]);
  return { fabric, frame };
}

/** Vorhanghälfte mit Falten; Ursprung an der Außenkante, damit scale.x sie zusammenschiebt. */
function curtainGeometry(w, h, dir) {
  const geo = new THREE.PlaneGeometry(w, h, 120, 10);
  geo.translate(dir * w / 2, 0, 0);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const fold = Math.sin(x * (Math.PI * 2 / 0.5)) * 0.09 + Math.sin(x * 3.1 + 1.3) * 0.04;
    pos.setZ(i, fold * (0.85 + 0.15 * Math.sin(y * 0.8)));
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ overlay?: HTMLElement|null, skipIntro?: boolean, skipNames?: string[], onClip?: (clip: object|null, rect: object|null) => void }} opts
 *   overlay: Ebene für die Namensschilder des Publikums; skipNames: nehmen nie Platz (Kanal, Bots)
 */
export function createCinemaScene(canvas, { overlay = null, skipIntro = false, skipNames = [], onClip, figures = 'people' } = {}) {
  let seatFov = 40;
  let viewW = 1920, viewH = 1080;
  let nowT = 0;
  const stage = createStage(canvas, {
    fov: WALK_FOV,
    onResize: (w, h) => {
      viewW = w;
      viewH = h;
      const aspect = w / h;
      const d = SEAT_POS.distanceTo(SCREEN_C);
      const halfH = Math.max(SCREEN_HM / 2 / SCREEN_FILL, SCREEN_WM / 2 / SCREEN_FILL / aspect);
      seatFov = THREE.MathUtils.radToDeg(2 * Math.atan(halfH / d));
      if (show.mode === 'clips') needRect = true;
    },
  });
  const { scene, camera, renderer } = stage;
  // Fotolook: Holzvertäfelung, Stoff- und Samtstruktur (Poly Haven); kein Bloom — der Abspann würde milchig
  // Großzügige Frist: die Kamerafahrt startet erst, wenn alles da ist (sonst wechseln Texturen mitten in der Fahrt)
  const assets = createAssets(renderer, { timeoutMs: 20000 });
  const post = createPostFX(renderer, scene, camera, { bloom: false, vignette: 0.3, warm: [1.03, 1, 0.96] });
  stage.setPost(post);
  scene.background = new THREE.Color('#050406');
  scene.fog = new THREE.Fog('#050406', 30, 60);

  // ── Materialien ──
  // Teppich behält sein Muster, bekommt aber die Webstruktur des Fotostoffs
  const carpet = assets.pbr(new THREE.MeshStandardMaterial({ map: carpetTexture([10, 12]), roughness: 0.95 }), 'quatrefoil_jacquard_fabric', 20, 24, { noMap: true, normalScale: 0.8 });
  const corridorCarpet = assets.pbr(new THREE.MeshStandardMaterial({ map: carpetTexture([2, 4]), roughness: 0.95 }), 'quatrefoil_jacquard_fabric', 4, 8, { noMap: true, normalScale: 0.8 });
  const wallMat = assets.pbr(new THREE.MeshStandardMaterial({ map: wallTexture([6, 2]), color: '#8a6f62', roughness: 0.9 }), 'dark_paneled_wood', 8, 3);
  const sideWallMat = assets.pbr(new THREE.MeshStandardMaterial({ map: wallTexture([12, 2.5]), color: '#8a6f62', roughness: 0.9 }), 'dark_paneled_wood', 16, 3.5);
  const darkMat = new THREE.MeshStandardMaterial({ color: '#0c0b0d', roughness: 0.95 });
  const ceilMat = new THREE.MeshStandardMaterial({ color: '#0b0a0c', roughness: 1 });
  const stepMat = assets.pbr(new THREE.MeshStandardMaterial({ map: carpetTexture([8, 1]), roughness: 0.95 }), 'quatrefoil_jacquard_fabric', 16, 2, { noMap: true, normalScale: 0.8 });
  const velvet = assets.pbr(new THREE.MeshStandardMaterial({ map: velvetTexture([3, 1]), roughness: 0.82, side: THREE.DoubleSide }), 'velour_velvet', 6, 6, { noMap: true });
  const seatFabric = assets.pbr(new THREE.MeshStandardMaterial({ map: velvetTexture([1, 1], '#7d1622'), roughness: 0.85 }), 'velour_velvet', 1, 1, { noMap: true });
  const seatFrame = new THREE.MeshStandardMaterial({ color: '#1b1a1e', roughness: 0.55, metalness: 0.4 });
  const brass = new THREE.MeshStandardMaterial({ color: '#a98448', roughness: 0.35, metalness: 0.8 });
  const ledMat = new THREE.MeshBasicMaterial({ color: '#ffb35c' });
  const corridorWall = assets.pbr(new THREE.MeshStandardMaterial({ color: '#9a8070', roughness: 0.85 }), 'dark_paneled_wood', 4, 1.5);

  const add = (m) => { scene.add(m); return m; };
  const LAMP_COLOR = new THREE.Color('#ffd29a');

  // ── Saal: Boden, Wände, Decke ──
  const frontFloor = add(new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, rowFront(0) - FRONT_Z), carpet));
  frontFloor.rotation.x = -Math.PI / 2;
  frontFloor.position.set(0, 0, (FRONT_Z + rowFront(0)) / 2);

  for (let i = 1; i < ROWS; i++) {
    const h = i * ROW_RISE;
    add(box(HX * 2, h, ROW_D, stepMat, 0, h / 2, rowFront(i) + ROW_D / 2));
  }
  add(box(HX * 2, PLATFORM_Y, BACK_Z - PLATFORM_Z, carpet, 0, PLATFORM_Y / 2, (PLATFORM_Z + BACK_Z) / 2));

  // Halbe Stufen + Stufenlichter in beiden Seitengängen
  const aisleW = HX - AISLE_X0;
  for (const side of [-1, 1]) {
    const ax = side * (AISLE_X0 + aisleW / 2);
    for (let i = 1; i <= ROWS; i++) {
      const top = (i - 1) * ROW_RISE + 0.15;
      add(box(aisleW, top, 0.55, stepMat, ax, top / 2, rowFront(i) - 0.275));
      add(box(aisleW - 0.3, 0.025, 0.025, ledMat, ax, top - 0.01, rowFront(i) - 0.55 + 0.012));
      add(box(aisleW - 0.3, 0.025, 0.025, ledMat, ax, i * ROW_RISE - 0.01, rowFront(i) + 0.012));
    }
  }

  // Seitenwände, Stirnwand, Decke
  for (const side of [-1, 1]) {
    add(box(0.3, CEIL_Y, BACK_Z - FRONT_Z, sideWallMat, side * (HX + 0.15), CEIL_Y / 2, (FRONT_Z + BACK_Z) / 2));
  }
  add(box(HX * 2, CEIL_Y, 0.3, darkMat, 0, CEIL_Y / 2, FRONT_Z - 0.15));
  const ceiling = add(new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, BACK_Z - FRONT_Z), ceilMat));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, CEIL_Y, (FRONT_Z + BACK_Z) / 2);

  // Rückwand mit Türöffnung
  const bw = (x0, x1, y0, y1) => add(box(x1 - x0, y1 - y0, 0.3, wallMat, (x0 + x1) / 2, (y0 + y1) / 2, BACK_Z + 0.15));
  bw(-HX, DOOR_X0, PLATFORM_Y, CEIL_Y);
  bw(DOOR_X1, HX, PLATFORM_Y, CEIL_Y);
  bw(DOOR_X0, DOOR_X1, PLATFORM_Y + DOOR_H, CEIL_Y);
  // Projektorfenster
  add(box(0.9, 0.5, 0.05, darkMat, PROJECTOR.x, PROJECTOR.y, BACK_Z - 0.02));
  const lens = add(new THREE.Mesh(new THREE.CircleGeometry(0.11, 24), new THREE.MeshBasicMaterial({ color: '#dfe8ff' })));
  lens.position.set(PROJECTOR.x, PROJECTOR.y, BACK_Z - 0.05);
  lens.rotation.y = Math.PI;

  // Bühne unter der Leinwand
  add(box(HX * 2, 0.9, 2.4, darkMat, 0, 0.45, FRONT_Z + 1.2));

  // Sternenhimmel an der Decke (Glasfaser-Punkte)
  {
    const r = rng(99);
    const n = 420;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = (r() * 2 - 1) * (HX - 0.4);
      arr[i * 3 + 1] = CEIL_Y - 0.02;
      arr[i * 3 + 2] = lerp(FRONT_Z + 2, BACK_Z - 0.5, r());
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    add(new THREE.Points(g, new THREE.PointsMaterial({ color: '#fff3dc', size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0.85 })));
  }

  // ── Sitze ──
  const { fabric, frame } = seatGeometries();
  const seatMesh = add(new THREE.InstancedMesh(fabric, seatFabric, SEATS * ROWS));
  const frameMesh = add(new THREE.InstancedMesh(frame, seatFrame, (SEATS + 1) * ROWS));
  {
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    const r = rng(4);
    let si = 0, fi = 0;
    for (let row = 0; row < ROWS; row++) {
      const y = row * ROW_RISE;
      const z = seatZ(row);
      for (let k = 0; k < SEATS; k++) {
        m.makeTranslation((k - (SEATS - 1) / 2) * SEAT_GAP, y, z);
        seatMesh.setMatrixAt(si, m);
        c.setScalar(0.82 + r() * 0.18);
        seatMesh.setColorAt(si++, c);
      }
      for (let k = 0; k <= SEATS; k++) {
        m.makeTranslation((k - SEATS / 2) * SEAT_GAP, y, z);
        frameMesh.setMatrixAt(fi++, m);
      }
    }
    seatMesh.instanceMatrix.needsUpdate = true;
    frameMesh.instanceMatrix.needsUpdate = true;
  }

  // ── Leinwand: zum Sitzplatz geneigt, damit sie von dort ein exaktes Rechteck ist ──
  const screenCanvas = canvasTexture(SCREEN_W, SCREEN_H, drawWaiting);
  screenCanvas.tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  // Wird beim Vorspann jedes Bild neu gemalt: ohne Mipmaps ist das Hochladen deutlich billiger
  screenCanvas.tex.generateMipmaps = false;
  screenCanvas.tex.minFilter = THREE.LinearFilter;
  const screenMat = new THREE.MeshBasicMaterial({ map: screenCanvas.tex, toneMapped: false });
  const screen = add(new THREE.Mesh(new THREE.PlaneGeometry(SCREEN_WM, SCREEN_HM), screenMat));
  screen.position.copy(SCREEN_C);
  screen.lookAt(SEAT_POS);
  const masking = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN_WM + 0.8, SCREEN_HM + 0.7), new THREE.MeshBasicMaterial({ color: '#020202' }));
  masking.position.set(0, 0, -0.03);
  screen.add(masking);
  screen.updateMatrixWorld(true);
  // Vignette über dem gescrollten Abspann (eigene Ebene, weil der Abspann als Streifen scrollt)
  const vignette = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN_WM, SCREEN_HM), new THREE.MeshBasicMaterial({
    map: canvasTexture(960, 540, (ctx) => { ctx.scale(0.5, 0.5); drawVignette(ctx); }).tex,
    transparent: true, depthWrite: false, toneMapped: false,
  }));
  vignette.position.z = 0.004;
  vignette.visible = false;
  screen.add(vignette);

  // ── Publikum: Chatter auf den Sitzen ──
  // Gesperrt: der eigene Platz samt Weg dorthin (rechte Hälfte von Reihe MY_ROW) und alle Sitze,
  // deren Köpfe vom Platz aus vor der Leinwand lägen — sonst verdecken sie Abspann und Clip.
  const audienceSeats = [];
  {
    const cam = new THREE.PerspectiveCamera(40, 16 / 9, 0.05, 100);
    const d = SEAT_POS.distanceTo(SCREEN_C);
    cam.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.max(SCREEN_HM / 2, SCREEN_WM / 2 / (16 / 9)) / SCREEN_FILL / d));
    cam.position.copy(SEAT_POS);
    cam.lookAt(SCREEN_C);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => v(sx * SCREEN_WM / 2, sy * SCREEN_HM / 2, 0).applyMatrix4(screen.matrixWorld).project(cam));
    const minX = Math.min(...corners.map((p) => p.x)) - 0.05;
    const maxX = Math.max(...corners.map((p) => p.x)) + 0.05;
    const minY = Math.min(...corners.map((p) => p.y)) - 0.05;
    const head = new THREE.Vector3();
    for (let row = 0; row < ROWS; row++) {
      for (let k = 0; k < SEATS; k++) {
        const x = (k - (SEATS - 1) / 2) * SEAT_GAP;
        const y = row * ROW_RISE;
        const z = seatZ(row);
        if (row === MY_ROW && x > -0.1) continue;
        // Oberkante des Kopfs im Sitzen (höhere der beiden Figurarten)
        const top = y + Math.max(SEATED_HEAD_TOP, PERSON_SEATED_HEAD_TOP) + 0.03;
        const blocks = [-0.26, 0.26].some((dx) => {
          head.set(x + dx, top, z + 0.1).project(cam);
          return head.z < 1 && head.x > minX && head.x < maxX && head.y > minY;
        });
        if (!blocks) audienceSeats.push({ x, y, z });
      }
    }
  }
  // Spiegelungen für die Metall-Roboter und die Murmelköpfe
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const audience = createAudience(scene, overlay, audienceSeats, { skip: skipNames, envMap: envTex, figures });

  // ── Vorhang ──
  const CURT_W = 7.4, CURT_H = 7.9, CURT_Z = -9.85, CURT_Y = 0.9 + CURT_H / 2;
  const curtL = add(new THREE.Mesh(curtainGeometry(CURT_W, CURT_H, 1), velvet));
  const curtR = add(new THREE.Mesh(curtainGeometry(CURT_W, CURT_H, -1), velvet));
  curtL.position.set(-CURT_W + 0.15, CURT_Y, CURT_Z);
  curtR.position.set(CURT_W - 0.15, CURT_Y, CURT_Z + 0.06);
  add(box(HX * 2, 0.8, 0.35, velvet, 0, CEIL_Y - 0.4, CURT_Z - 0.05));
  add(box(HX * 2, 0.05, 0.05, brass, 0, CEIL_Y - 0.82, CURT_Z + 0.14));

  // ── Wandleuchten ──
  const poolTex = lightPoolTexture();
  const sconces = [];
  for (const side of [-1, 1]) {
    for (const z of [-6.5, -1.5, 3.5]) {
      const x = side * (HX - 0.02);
      add(box(0.12, 0.42, 0.26, brass, x - side * 0.06, 4.6, z));
      const lamp = add(box(0.02, 0.32, 0.18, new THREE.MeshBasicMaterial({ color: '#ffd29a' }), x - side * 0.125, 4.6, z));
      const pool = add(new THREE.Mesh(new THREE.PlaneGeometry(2.6, 3.4),
        new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
      pool.position.set(x - side * 0.01, 4.6, z);
      pool.rotation.y = -side * Math.PI / 2;
      const light = add(new THREE.PointLight('#ffc58a', 9, 11, 2));
      light.position.set(x - side * 0.5, 4.6, z);
      sconces.push({ lamp, pool, light });
    }
  }
  const hemi = add(new THREE.HemisphereLight('#ffe7cc', '#2a1416', 0.5));

  // Deckenstrahler (Saallicht über den Reihen)
  const downlights = [];
  for (const [x, z] of [[-3.5, -6], [3.5, -6], [-3.5, 0], [3.5, 0], [-3.5, 5.5], [3.5, 5.5]]) {
    const l = add(new THREE.SpotLight('#ffd9a8', 0, 14, 0.85, 0.7, 1.5));
    l.position.set(x, CEIL_Y - 0.05, z);
    l.target.position.set(x * 0.8, 0, z);
    scene.add(l.target);
    const disc = add(new THREE.Mesh(new THREE.CircleGeometry(0.12, 20), new THREE.MeshBasicMaterial({ color: '#ffe6c4' })));
    disc.rotation.x = Math.PI / 2;
    disc.position.set(x, CEIL_Y - 0.01, z);
    downlights.push(l);
  }

  // Rampenlicht: von der Bühnenkante schräg nach oben auf den geschlossenen Vorhang
  const footlights = [];
  for (const x of [-4.2, 0, 4.2]) {
    const l = add(new THREE.SpotLight('#ffb98a', 0, 12, 0.7, 0.8, 1.4));
    l.position.set(x, 0.95, -8.6);
    l.target.position.set(x, 6.5, -9.85);
    scene.add(l.target);
    footlights.push(l);
  }
  const screenLight = add(new THREE.PointLight('#cfdcff', 0, 28, 1.6));
  screenLight.position.set(0, 4.4, -8.6);

  // Ausgangsschild über der Tür (Saalseite)
  const exit = add(new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.24), new THREE.MeshBasicMaterial({ map: signTexture('AUSGANG'), toneMapped: false })));
  exit.position.set((DOOR_X0 + DOOR_X1) / 2, PLATFORM_Y + DOOR_H + 0.35, BACK_Z - 0.01);
  exit.rotation.y = Math.PI;

  // ── Türen ──
  const doorMat = new THREE.MeshStandardMaterial({ map: doorTexture(), roughness: 0.6 });
  const leafW = (DOOR_X1 - DOOR_X0) / 2;
  const doorL = add(new THREE.Mesh(new THREE.BoxGeometry(leafW, DOOR_H, 0.06).translate(leafW / 2, DOOR_H / 2, 0), doorMat));
  doorL.position.set(DOOR_X0, PLATFORM_Y, BACK_Z + 0.15);
  const doorR = add(new THREE.Mesh(new THREE.BoxGeometry(leafW, DOOR_H, 0.06).translate(-leafW / 2, DOOR_H / 2, 0), doorMat));
  doorR.position.set(DOOR_X1, PLATFORM_Y, BACK_Z + 0.15);

  // ── Flur vor Saal 1 ──
  const posterLoads = [];
  {
    const cz0 = BACK_Z + 0.3;
    const len = CORR_Z1 - cz0;
    const cx = (CORR_X0 + CORR_X1) / 2;
    const floor = add(new THREE.Mesh(new THREE.PlaneGeometry(CORR_X1 - CORR_X0, len), corridorCarpet));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, PLATFORM_Y, cz0 + len / 2);
    const ceil = add(new THREE.Mesh(new THREE.PlaneGeometry(CORR_X1 - CORR_X0, len), ceilMat));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(cx, PLATFORM_Y + CORR_H, cz0 + len / 2);
    add(box(0.2, CORR_H, len, corridorWall, CORR_X0 - 0.1, PLATFORM_Y + CORR_H / 2, cz0 + len / 2));
    add(box(0.2, CORR_H, len, corridorWall, CORR_X1 + 0.1, PLATFORM_Y + CORR_H / 2, cz0 + len / 2));
    add(box(CORR_X1 - CORR_X0, CORR_H, 0.2, corridorWall, cx, PLATFORM_Y + CORR_H / 2, CORR_Z1 + 0.1));
    // Flurseite der Saalwand (die Saal-Rückwand reicht nur bis zur Saalbreite)
    add(box(CORR_X1 - HX, CORR_H, 0.3, corridorWall, (HX + CORR_X1) / 2, PLATFORM_Y + CORR_H / 2, BACK_Z + 0.15));
    // Sockelleiste aus Messing
    add(box(0.03, 0.08, len, brass, CORR_X0 + 0.015, PLATFORM_Y + 0.04, cz0 + len / 2));
    add(box(0.03, 0.08, len, brass, CORR_X1 - 0.015, PLATFORM_Y + 0.04, cz0 + len / 2));

    // Plakate im Leuchtkasten: eigene Bilder aus POSTER_URLS (zufällig verteilt), Rest gemalt
    const own = POSTER_URLS.slice().sort(() => Math.random() - 0.5);
    const loader = new THREE.TextureLoader();
    const posterAt = (slot, x, z, ry) => {
      add(box(0.06, 1.62, 1.1, brass, x, PLATFORM_Y + 1.55, z));
      const mat = new THREE.MeshBasicMaterial({ map: posterTexture(slot), toneMapped: false });
      const p = add(new THREE.Mesh(new THREE.PlaneGeometry(0.98, 1.47), mat));
      p.position.set(x, PLATFORM_Y + 1.55, z);
      p.rotation.y = ry;
      p.position.x += Math.sin(ry) * 0.04;
      const url = own[slot];
      if (!url) return;
      posterLoads.push(new Promise((res) => {
        loader.load(url, (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = 8;
          coverCrop(tex, 0.98 / 1.47);
          mat.map.dispose();
          mat.map = tex;
          mat.needsUpdate = true;
          res();
        }, undefined, () => { console.warn('Plakat konnte nicht geladen werden:', url); res(); });
      }));
    };
    // Alle sechs liegen vor dem Startpunkt der Kamera (z = 17.8) — dahinter sähe man sie nie
    posterAt(0, CORR_X0 + 0.03, 11.2, Math.PI / 2);
    posterAt(1, CORR_X0 + 0.03, 12.9, Math.PI / 2);
    posterAt(2, CORR_X0 + 0.03, 14.6, Math.PI / 2);
    posterAt(3, CORR_X1 - 0.03, 11.2, -Math.PI / 2);
    posterAt(4, CORR_X1 - 0.03, 12.9, -Math.PI / 2);
    posterAt(5, CORR_X1 - 0.03, 14.6, -Math.PI / 2);

    // Schild über der Tür (Flurseite)
    const sign = add(new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.3),
      new THREE.MeshBasicMaterial({ map: signTexture('SAAL 1', { bg: '#1a1410', fg: '#f3d29a' }), toneMapped: false })));
    sign.position.set((DOOR_X0 + DOOR_X1) / 2, PLATFORM_Y + DOOR_H + 0.3, BACK_Z + 0.31);

    // Deckenlichter
    for (const z of [11.2, 14.4, 17.6]) {
      add(box(1.4, 0.03, 0.5, new THREE.MeshBasicMaterial({ color: '#fff1dc' }), cx, PLATFORM_Y + CORR_H - 0.02, z));
      const l = add(new THREE.PointLight('#ffe9cc', 6, 7, 2));
      l.position.set(cx, PLATFORM_Y + CORR_H - 0.35, z);
    }
  }

  // ── Zustand ──
  const house = tween(1);           // Saallicht 0…1
  const curtain = tween(0);         // Vorhang 0 = zu, 1 = offen
  const screenBright = tween(0.75);
  house.set(0.1, T_LIGHTS[0], T_LIGHTS[1] - T_LIGHTS[0]);
  curtain.set(1, T_CURTAIN[0], T_CURTAIN[1] - T_CURTAIN[0]);
  screenBright.set(1, T_CURTAIN[0], 3);

  const timeOffset = skipIntro ? SKIP_TO : 0;
  let pending = null;
  let needRect = false;
  const show = { mode: 'waiting', t0: 0, layout: null, credits: null, clip: 0, clipEnd: 0, closed: false };

  // Abspann-Streifen: Abschnitte werden vorab und verteilt über mehrere Bilder gemalt (höchstens
  // ~4 ms pro Bild), dann einmal hochgeladen. Gescrollt wird über die Texturkoordinaten.
  const roll = new Map();          // Abschnitt-Nr. → { ctx, blocks, next, tex }
  const dropRoll = (keepFrom = Infinity) => {
    for (const [i, ch] of roll) {
      if (i >= keepFrom) continue;
      if (screenMat.map === ch.tex) screenMat.map = screenCanvas.tex;
      ch.tex?.dispose();
      roll.delete(i);
    }
  };
  const queueChunk = (i) => {
    if (roll.has(i) || i * ROLL_STEP > show.layout.endOffset - show.layout.startOffset) return;
    const c2 = document.createElement('canvas');
    c2.width = SCREEN_W;
    c2.height = ROLL_CHUNK_H;
    const ctx = c2.getContext('2d');
    clearChunk(ctx);
    roll.set(i, { ctx, blocks: chunkBlocks(show.layout, i), next: 0, tex: null });
  };
  const finishChunk = (i, budgetMs) => {
    const ch = roll.get(i);
    if (!ch || ch.tex) return true;
    const t0 = performance.now();
    while (ch.next < ch.blocks.length) {
      drawChunkBlock(ch.ctx, show.layout, i, ch.blocks[ch.next++]);
      if (performance.now() - t0 > budgetMs) return false;
    }
    const tex = new THREE.CanvasTexture(ch.ctx.canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    tex.repeat.set(1, SCREEN_H / ROLL_CHUNK_H);
    renderer.initTexture(tex);
    ch.tex = tex;
    return true;
  };
  const workRoll = () => {
    for (const i of [...roll.keys()].sort((a, b) => a - b)) {
      if (!roll.get(i).tex) { finishChunk(i, 4); return; }
    }
  };

  const startShow = (credits, now) => {
    show.credits = credits;
    show.layout = layoutCredits(credits);
    dropRoll();
    queueChunk(0);
    queueChunk(1);
    show.mode = 'leader';
    show.t0 = now;
    show.closed = false;
    if (curtain.target < 1) curtain.set(1, now, 3.5);
    if (house.target > 0.1) house.set(0.1, now, 3);
    screenBright.set(1, now, 1);
    onClip?.(null, null);
  };

  const clipRect = () => {
    const w = window.innerWidth, h = window.innerHeight;
    const pts = [[CLIP_INSET.x, CLIP_INSET.y], [CLIP_INSET.x + CLIP_INSET.w, CLIP_INSET.y + CLIP_INSET.h]].map(([fx, fy]) => {
      const p = v((fx - 0.5) * SCREEN_WM, (0.5 - fy) * SCREEN_HM, 0).applyMatrix4(screen.matrixWorld).project(camera);
      return [(p.x + 1) / 2 * w, (1 - p.y) / 2 * h];
    });
    return { left: pts[0][0], top: pts[0][1], width: pts[1][0] - pts[0][0], height: pts[1][1] - pts[0][1] };
  };

  const startClip = (i, now) => {
    const clips = show.credits.clips;
    show.mode = 'clips';
    show.clip = i;
    const dur = Number(clips[i].duration);
    show.clipEnd = now + (Number.isFinite(dur) && dur > 3 ? dur + 1.5 : 32);
    screenCanvas.redraw((ctx) => drawClipFrame(ctx, clips[i], i, clips.length));
    onClip?.(clips[i], clipRect());
  };

  const toEnd = (now) => {
    show.mode = 'end';
    show.t0 = now;
    onClip?.(null, null);
  };

  const updateShow = (now) => {
    if (pending && now >= T_SHOW_READY) { startShow(pending, now); pending = null; }
    workRoll();
    const st = now - show.t0;
    switch (show.mode) {
      case 'leader':
        screenCanvas.redraw((ctx) => drawLeader(ctx, st));
        if (st >= LEADER_S) { show.mode = 'roll'; show.t0 = now; }
        break;
      case 'roll': {
        const rollY = rollPosition(show.layout, st);
        const i = Math.floor(rollY / ROLL_STEP);
        queueChunk(i);
        queueChunk(i + 1);
        finishChunk(i, Infinity);      // falls der Vorlauf nicht gereicht hat
        dropRoll(i);
        const ch = roll.get(i);
        screenMat.map = ch.tex;
        ch.tex.offset.y = 1 - (rollY - i * ROLL_STEP + SCREEN_H) / ROLL_CHUNK_H;
        vignette.visible = true;
        if (st >= show.layout.duration + 3) {
          screenMat.map = screenCanvas.tex;
          vignette.visible = false;
          dropRoll();
          if (show.credits.clips?.length) startClip(0, now);
          else toEnd(now);
        }
        break;
      }
      case 'clips':
        if (needRect) { needRect = false; onClip?.(show.credits.clips[show.clip], clipRect()); }
        if (now >= show.clipEnd) {
          if (show.clip + 1 < show.credits.clips.length) startClip(show.clip + 1, now);
          else toEnd(now);
        }
        break;
      case 'end':
        if (st < 1.6) screenCanvas.redraw((ctx) => drawEnd(ctx, st / 1.5));
        if (st > 14 && !show.closed) {
          show.closed = true;
          curtain.set(0, now, 5);
          house.set(0.75, now + 2, 5);
          screenBright.set(0.6, now + 3, 3);
        }
        break;
      default:
        break;
    }
  };

  // ── Kamera ──
  const pos = new THREE.Vector3();
  const dir = new THREE.Vector3(0, -0.05, -1).normalize();   // aktuelle Blickrichtung (gedämpft)
  const want = new THREE.Vector3();
  const toScreen = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const sitFrom = { pos: new THREE.Vector3(), dir: new THREE.Vector3(), set: false };
  const sitCurve = new THREE.CatmullRomCurve3([v(0, 0, 0), v(0, 0, 0), SEAT_POS.clone()]);

  const updateCamera = (t, dt) => {
    let fov = WALK_FOV;
    let roll = 0;
    if (t >= T_SEATED) {
      // Am Platz: exakt auf die Leinwandmitte — Voraussetzung für den pixelgenauen Clip-Player
      camera.position.copy(SEAT_POS);
      camera.lookAt(SCREEN_C);
      dir.copy(SCREEN_C).sub(SEAT_POS).normalize();
      fov = seatFov;
    } else if (t >= T_WALK_END) {
      // Hinsetzen: vom Ende des Wegs leicht zurück und nach unten in den Sitz
      if (!sitFrom.set) {
        WALK.getPointAt(1, sitFrom.pos);
        sitFrom.pos.y = floorAt(sitFrom.pos.z) + STAND_EYE;
        sitFrom.dir.copy(dir);
        sitCurve.points[0].copy(sitFrom.pos);
        sitCurve.points[1].set(lerp(sitFrom.pos.x, SEAT_POS.x, 0.6), sitFrom.pos.y - 0.32, lerp(sitFrom.pos.z, SEAT_POS.z, 0.75));
        sitFrom.set = true;
      }
      const e = easeInOut((t - T_WALK_END) / SIT_S);
      sitCurve.getPoint(e, pos);
      toScreen.copy(SCREEN_C).sub(pos).normalize();
      dir.copy(sitFrom.dir).lerp(toScreen, e).normalize();
      fov = lerp(WALK_FOV, seatFov, e);
      camera.position.copy(pos);
      camera.lookAt(want.copy(pos).add(dir));
    } else {
      const { s, k } = walkProgress(t - T_WALK0);
      const u = s / WALK_LEN;
      WALK.getPointAt(u, pos);
      WALK.getTangentAt(u, tangent);
      const onStairs = pos.z < PLATFORM_Z && pos.x > AISLE_X0 - 0.2;
      pos.y = floorAt(pos.z) + STAND_EYE;
      // Schritte: Auf und Ab + minimales Wiegen, beides mit dem Tempo skaliert
      const step = s * Math.PI / 0.72;
      pos.y += (Math.abs(Math.sin(step)) - 0.5) * 0.04 * k * (onStairs ? 1.2 : 1);
      roll = Math.sin(step) * 0.005 * k;

      tangent.y = onStairs ? -0.2 : -0.05;
      tangent.normalize();
      toScreen.copy(SCREEN_C).sub(pos).normalize();
      want.copy(tangent).lerp(toScreen, attention(pos)).normalize();
      // Blick folgt weich (bildratenunabhängig) — keine Ruckler an Kurven und Bereichsgrenzen
      dir.lerp(want, 1 - Math.exp(-dt * 2.6)).normalize();
      camera.position.copy(pos);
      camera.lookAt(want.copy(pos).add(dir));
    }
    if (roll) camera.rotateZ(roll);
    if (Math.abs(camera.fov - fov) > 1e-4) { camera.fov = fov; camera.updateProjectionMatrix(); }
  };

  const tick = (rawT, dt) => {
    const t = rawT + timeOffset;

    // Türen
    const d = phase(t, T_DOORS[0], T_DOORS[1]);
    doorL.rotation.y = d * 1.55;
    doorR.rotation.y = -d * 1.55;

    updateCamera(t, dt);

    // Licht
    const hl = house.get(t);
    hemi.intensity = 0.05 + 0.9 * hl;
    for (const l of downlights) l.intensity = 40 * hl;
    for (const s of sconces) {
      s.light.intensity = 9 * hl;
      s.pool.material.opacity = hl;
      s.lamp.material.color.copy(LAMP_COLOR).multiplyScalar(0.25 + 0.75 * hl);
    }
    const c = curtain.get(t);
    const sc = 1 - 0.84 * c;
    // Rampenlicht ist schon bei halb offenem Vorhang aus — sonst wandern die Kegel über die Leinwand
    for (const l of footlights) l.intensity = 34 * (1 - smooth(c * 2));
    curtL.scale.x = sc;
    curtR.scale.x = sc;

    updateShow(t);

    const flicker = 1 + Math.sin(t * 37) * 0.008 + Math.sin(t * 23.3) * 0.006;
    const sb = screenBright.get(t) * flicker;
    screenMat.color.setScalar(sb);
    screenLight.intensity = 22 * c * sb;

    // Publikum; Namensschilder nur auf dem Weg zum Platz
    nowT = t;
    audience.update(t, camera, viewW, viewH, 1 - phase(t, T_WALK_END - 1.5, T_WALK_END + 0.3));
  };

  // Erst starten, wenn Fototexturen, Plakate, Figur-Datei und die ersten Profilbilder da sind.
  // Danach alles einmal auf die Grafikkarte laden (warmUp) — so beginnt die Fahrt mit dem fertigen
  // Bild und ohne Ruckler, wenn ein Teil des Saals zum ersten Mal ins Bild kommt.
  let disposed = false;
  const ready = (async () => {
    await Promise.all([assets.ready(), ...posterLoads]);
    // pbr() setzt die Karten erst einen Mikrotask nach dem Laden — einmal abwarten
    await new Promise((r) => setTimeout(r, 0));
    await audience.settled(4000);
    if (disposed) return;
    stage.resize();
    tick(0, 0);                      // Startbild stellen (Kamera, Licht, Figuren)
    warmUp(renderer, scene, camera, post);
    stage.start(tick);
  })();

  return {
    /** Erfüllt sich, sobald die Szene geladen ist und läuft (vorher bleibt die Zeichenfläche verdeckt). */
    ready,
    /** Neue Credits (Streamer.bot). Vor dem Hinsetzen werden sie gemerkt; die Namen nehmen sofort Platz. */
    setCredits(payload) {
      pending = payload;
      audience.addMany(creditNames(payload), nowT < 1);
    },
    /** Jemand schreibt im Chat: setzt sich (falls noch ein Platz frei ist). */
    addChatter(person) {
      audience.addOne(person);
    },
    dispose() {
      disposed = true;
      audience.dispose();
      envTex.dispose();
      pmrem.dispose();
      assets.dispose();
      stage.dispose();
    },
  };
}
