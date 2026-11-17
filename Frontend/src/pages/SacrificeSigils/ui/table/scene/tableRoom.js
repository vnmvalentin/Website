// ui/table/scene/tableRoom.js — der neue Tisch („Am Tisch“, REBUILD-PLAN.md): EINE 3D-Szene, in der alles liegt.
//
// Anders als battle/table3d/tableScene.js (Canvas unter einer DOM-Oberfläche) sind hier auch die Karten Körper in
// der Szene: Licht, Schatten und Perspektive stimmen für alles, und bedient wird direkt an den Gegenständen.
//
// Arbeitsweise (Phase 1):
//   sync(model)   gleicht die Szene mit dem Anzeigemodell des Kampfs ab. Karten sind über ihre uid bekannt und
//                 gleiten von selbst an ihren neuen Platz (Stapel → Hand → Feld), neue erscheinen, fehlende vergehen.
//   setUi(ui)     was gerade wählbar/markiert ist (Auswahl in der Hand, Opfer, mögliche Felder, Ziehen, Zug beenden …)
//   play(ev)      kleine Gesten zu einzelnen Ereignissen (Stoß beim Angriff, Zucken beim Treffer, Vergehen)
//   onIntent      Klick/Rechtsklick auf etwas: die Regeln dazu liegen in TableBattle.jsx, nicht hier
//
// Maße in Tischeinheiten: eine Karte ist 12 × 16,8 groß. x nach rechts, z zum Spieler hin, y nach oben.
import * as THREE from "three";
import { rng, woodTextures, waxTexture, waxGlowTexture, flameMaterial, dotTexture } from "../../battle/table3d/tableScene.js";
import { makeScale, makeTotem, propMaterials } from "../../battle/table3d/tableProps.js";
import { createCardKit, CARD_W, CARD_H } from "../cards/cardMesh.js";
import { prepareFaces, renderCardFace, renderCardBack, faceKey } from "../cards/cardFace.js";
import { roomMaterials, makeSeal, makeHourglass, makeHammer, makeDeck, makeTag, makeNote, makeBonePile, makeResourceBowl, makeInkpot, makeItemToken, makeTideGauge, shadows } from "./props.js";
import { figureMaterials, makeFigure, makeHand, poseHand } from "./figure.js";
import { createPuppet } from "./puppet.js";
import { createEffects } from "./effects.js";
import { createPathMap } from "../../battle/table3d/pathMap3d.js";
import { NODE_PATHS } from "../../path/nodePaths.js";

export const LANE_X = [-21, -7, 7, 21];
export const ROW_Z = { oppBack: -30, oppFront: -11, ownFront: 11, ownBack: 30 };
export const ROWS = /** @type {const} */ (["oppBack", "oppFront", "ownFront", "ownBack"]);
const TABLE = { w: 200, zFar: -54, zNear: 84 };
const CANDLE_FULL = 11;
const CANDLE_STUB = 2.4;
const CANDLE_R = 1.7;
/** Feste Plätze der Gegenstände. */
const AT = {
  deck: [52, 30], sideDeck: [67.5, 30], seal: [52, 5], hourglass: [66, -8], hammer: [67, 15],
  bones: [-52, 30], third: [-68, 28], scale: [-52, -5], tide: [-76, -15],
  oppHand: [0, -47], inkpot: [-60, -45],
  // Stapel und Siegelstempel des Gegenübers (Phase 3): klein an der hinteren Kante, in Reichweite seiner Hände
  oppDeck: [20, -46.5], oppSeal: [29.5, -45.5],
  // Vorrat des Drafts: rechts hinter dem Brett, frei von den ausliegenden Karten der Runde und vom Stempel
  pool: [47, -22],
};
/** Gegenstände des Gegenübers sind so klein wie seine Handkarten. */
const OPP_SCALE = 0.6;

/**
 * Kamerapositionen. Mit vier Reihen Tiefe gibt es einen echten Zielkonflikt: je flacher der Blick, desto mehr
 * sieht man vom Gegenüber, desto stärker sind die Karten aber gestaucht.
 */
export const POSES = {
  // Standard (eigener Zug): steil genug, dass Karten kaum gestaucht sind; vom Gegenüber sieht man die Hände
  brett: { pos: [0, 108, 70], look: [0, 0, 12], fov: 44 },
  // Zug des Gegenübers und große Momente: Maske im Bild, Karten deutlich gestaucht
  gegenueber: { pos: [0, 56, 114], look: [0, 0, -4], fov: 42 },
  // Fast senkrecht: Karten unverzerrt, kein Gegenüber (nur zum Vergleichen)
  aufsicht: { pos: [0, 140, 38], look: [0, 0, 10], fov: 44 },
  // Zuschauer: schräg von der Seite — beide Tischhälften und die Gestalt im Bild
  seite: { pos: [98, 92, 82], look: [-2, 0, -2], fov: 44 },
  // Hauptmenü (Phase 5): der ganze Tisch im Raum, etwas nach rechts gerückt — links bleibt Platz für die Zeilen
  raum: { pos: [-30, 70, 118], look: [-30, 0, -6], fov: 42 },
  // Lobby (Phase 5): wie „gegenueber“, nur etwas höher geschaut — die Maske bleibt unter der Zeile mit dem Code
  lobby: { pos: [0, 56, 114], look: [0, 5, -6], fov: 43 },
};
const MOVE_S = 1.1;
const ease = (x) => {
  const t = Math.min(1, Math.max(0, x));
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
};
const clamp01 = (x) => Math.min(1, Math.max(0, x));

/**
 * Eingelassene Felder: Front als geritzte Rahmen, Hinterreihe als dunklere Mulde, in der Mitte eine Messingleiste —
 * oder (channel) die Rinne für das Wasser der Gezeiten.
 * @param {boolean} [channel]
 */
function boardTexture(channel = false) {
  const S = 16;                       // Pixel je Tischeinheit
  const area = { x0: -30, z0: -42, w: 60, d: 84 };
  const c = document.createElement("canvas");
  c.width = area.w * S;
  c.height = area.d * S;
  const ctx = c.getContext("2d");
  const px = (x) => (x - area.x0) * S;
  const pz = (z) => (z - area.z0) * S;
  const round = (x, y, w, h, r) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };
  for (const row of ROWS) {
    const back = row.endsWith("Back");
    for (const lx of LANE_X) {
      const w = (CARD_W + 1.2) * S;
      const h = (CARD_H + 1.2) * S;
      const x = px(lx) - w / 2;
      const y = pz(ROW_Z[row]) - h / 2;
      round(x, y, w, h, 12);
      if (back) {
        // Mulde: oben dunkler (Schatten der Kante), unten eine Spur heller
        const g = ctx.createLinearGradient(0, y, 0, y + h);
        g.addColorStop(0, "rgba(0,0,0,0.46)");
        g.addColorStop(0.2, "rgba(0,0,0,0.3)");
        g.addColorStop(1, "rgba(0,0,0,0.22)");
        ctx.fillStyle = g;
        ctx.fill();
      } else {
        ctx.fillStyle = "rgba(0,0,0,0.1)";
        ctx.fill();
      }
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(8,4,2,0.8)";
      ctx.stroke();
      round(x + 2.5, y + 2.5, w, h, 12);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "rgba(255,214,160,0.13)";
      ctx.stroke();
    }
  }
  const my = pz(0);
  if (channel) {
    // Gezeiten-Zirkel: statt der Messingleiste eine eingelassene Rinne — das Wasser darin ist ein eigener Körper
    const h = 4.6 * S;
    round(px(-28.8), my - h / 2, 57.6 * S, h, 14);
    const cg = ctx.createLinearGradient(0, my - h / 2, 0, my + h / 2);
    cg.addColorStop(0, "rgba(0,0,0,0.78)");
    cg.addColorStop(0.35, "rgba(4,10,14,0.6)");
    cg.addColorStop(1, "rgba(6,14,18,0.5)");
    ctx.fillStyle = cg;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(8,4,2,0.85)";
    ctx.stroke();
    const tx = new THREE.CanvasTexture(c);
    tx.colorSpace = THREE.SRGBColorSpace;
    tx.anisotropy = 8;
    return { texture: tx, area };
  }
  // Mittelleiste aus Messing mit drei Nieten
  const g = ctx.createLinearGradient(0, my - 5, 0, my + 5);
  g.addColorStop(0, "rgba(214,178,122,0.85)");
  g.addColorStop(0.5, "rgba(150,116,63,0.85)");
  g.addColorStop(1, "rgba(90,66,34,0.85)");
  ctx.fillStyle = g;
  ctx.fillRect(px(-28.5), my - 4, 57 * S, 8);
  ctx.fillStyle = "rgba(20,12,6,0.7)";
  ctx.fillRect(px(-28.5), my + 4, 57 * S, 2);
  for (const x of [-28.5, 0, 28.5]) {
    ctx.fillStyle = "rgba(226,196,140,0.95)";
    ctx.beginPath();
    ctx.arc(px(x), my, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(40,26,10,0.8)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return { texture: t, area };
}

/** Warmer Rahmen mit weicher Füllung: „hier kannst du etwas tun“ (Feld, Stapel, Stempel). */
function ringTexture() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 176;
  const ctx = c.getContext("2d");
  const r = 14;
  ctx.beginPath();
  ctx.moveTo(8 + r, 8);
  ctx.arcTo(120, 8, 120, 168, r);
  ctx.arcTo(120, 168, 8, 168, r);
  ctx.arcTo(8, 168, 8, 8, r);
  ctx.arcTo(8, 8, 120, 8, r);
  ctx.closePath();
  ctx.fillStyle = "rgba(242,181,74,0.14)";
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(242,181,74,0.9)";
  ctx.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * @typedef {{ uid: string, row: "oppBack" | "oppFront" | "ownFront" | "ownBack", lane: number, card: any, attack: number,
 *   health: number, maxHealth: number, auras: string[], submerged?: boolean, state?: any }} UnitModel
 * @typedef {{ kind: string, label: string }} TotemModel
 * @typedef {{ zirkel: string, turn: number, stalemateTurn: number, scale: number, third: "wax" | "salt",
 *   tide: number | null, flooded: boolean, myTurn: boolean, seat: number,
 *   units: UnitModel[], hand: any[], oppHand: Array<any | null>,
 *   me: { bones: number, third: number, deck: number, items: string[], totems: TotemModel[] },
 *   opp: { items: number, deck?: number, totems: TotemModel[] }, oppTurn?: boolean,
 *   itemNames: Record<string, string>,
 *   stage?: "battle" | "draft" | "extras" | "interlude" | "result" | "scene" | "map" | "starter" | "camp",
 *   map?: { map: any, pp: any, biome: any, cycle?: number, subtitle?: string, disabled?: boolean } | null,
 *   wares?: Array<{ id: number, name: string, x: number, z: number }>, fire?: { x: number, z: number } | null,
 *   podium?: Array<{ place: number, seals: number }>,
 *   notes?: Array<{ id: string, lines: Array<string | { text: string, size?: number }>, x: number, z: number, w?: number, h?: number, ry?: number }>,
 *   candles?: boolean[],
 *   loose?: Array<{ uid: string, card: any, x: number, z: number, scale?: number, faceUp?: boolean, dim?: boolean, from?: string }>,
 *   pool?: { count: number, label: string } | null,
 *   choices?: Array<{ id: string | number, kind: string, label: string, x: number, z: number }> }} BattleModel
 *   Derselbe Tisch dient auch dem Draft und der Totem-Wahl (Phase 4): `stage` sagt, was gerade gespielt wird,
 *   `loose` sind frei ausliegende Karten, `pool` der Vorrat des Drafts, `choices` die zur Wahl stehenden Totem-Köpfe,
 *   `notes` Zettel mit Text, `candles` am Match-Ende: welche Kerze brennt (links, rechts).
 * @typedef {{ selected?: string | null, marked?: string[], targets?: string[], glow?: string[], drawable?: boolean,
 *   canEnd?: boolean, hammer?: "off" | "ready" | "active",
 *   pickable?: string[], picked?: string[], choosable?: Array<string>, choice?: string | number | null, oppSeal?: boolean }} UiState
 *   targets/glow: Felder als "reihe:lane", z. B. "ownFront:2" · pickable: nehmbare lose Karten (uid) ·
 *   choosable/choice: wählbare bzw. gewählte Totem-Köpfe (id)
 */

/**
 * @param {HTMLElement} host
 * @param {{ zirkel?: string, reduced?: boolean, seated?: boolean,
 *   mask?: string, onSound?: (key: string) => void,
 *   onIntent?: (pick: any, how: "click" | "context", at?: { x: number, y: number }) => void,
 *   onHover?: (pick: any | null, at: { x: number, y: number }) => void }} [opts]
 */
export function createTableRoom(host, opts = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
  } catch {
    return null;
  }
  // Schärfe (Phase 7): höchstens doppelt; auf Touch-Geräten (Handy, Tablet: kleine, aber dichte Bildschirme mit
  // schwächerer Grafik) höchstens 1,5-fach — gut 40 % weniger Bildpunkte, die Schrift auf den Karten bleibt lesbar
  const coarsePointer = !!window.matchMedia?.("(pointer: coarse)").matches;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarsePointer ? 1.5 : 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const canvas = renderer.domElement;
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none";
  host.appendChild(canvas);
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  // Wer gerade bedient, wechselt mit der Phase (Draft, Totem-Wahl, Kampf …): siehe setHandlers
  let onIntent = opts.onIntent || (() => {});
  let onHover = opts.onHover || (() => {});

  /** @type {Array<{ dispose?: () => void }>} */
  const disposables = [];
  const keep = (x) => { disposables.push(x); return x; };
  let reduced = !!opts.reduced;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050302);
  scene.fog = new THREE.Fog(0x050302, 230, 380);
  const camera = new THREE.PerspectiveCamera(44, 1, 1, 700);
  scene.add(camera);

  // ── Tisch ───────────────────────────────────────────────────────────────
  // Holz und eingeritzte Felder hängen vom Zirkel ab (Eiche bzw. Treibholz, Messingleiste bzw. Wasserrinne).
  // Sie werden nicht über keep() verwaltet, weil setZirkel sie am stehenden Tisch austauscht.
  let zirkel = opts.zirkel || "moor";
  const woodFor = (z) => {
    const w = woodTextures(z);
    w.map.repeat.set(1, 1.35);
    w.rough.repeat.copy(w.map.repeat);
    w.map.anisotropy = maxAniso;
    return w;
  };
  let wood = woodFor(zirkel);
  const { map, rough } = wood;
  const depth = TABLE.zNear - TABLE.zFar;
  const table = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(TABLE.w, depth)),
    keep(new THREE.MeshStandardMaterial({ map, roughnessMap: rough, roughness: 0.82, metalness: 0 })),
  );
  table.rotation.x = -Math.PI / 2;
  table.position.z = (TABLE.zNear + TABLE.zFar) / 2;
  table.receiveShadow = true;
  scene.add(table);
  // Rückwand: nur ein Hauch Helligkeit hinter der Gestalt, damit sich ihr Umriss abhebt
  {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext("2d");
    const g = ctx.createRadialGradient(128, 150, 6, 128, 150, 128);
    g.addColorStop(0, "#2a1c11");
    g.addColorStop(0.45, "#150e08");
    g.addColorStop(1, "#050302");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    const tex = keep(new THREE.CanvasTexture(c));
    tex.colorSpace = THREE.SRGBColorSpace;
    const wall = new THREE.Mesh(keep(new THREE.PlaneGeometry(420, 260)), keep(new THREE.MeshBasicMaterial({ map: tex, fog: false })));
    wall.position.set(0, 40, -150);
    scene.add(wall);
  }
  // Hintere Tischkante: dunkle, leicht abgesetzte Leiste — dahinter beginnt das Dunkel
  const lip = new THREE.Mesh(keep(new THREE.BoxGeometry(TABLE.w, 3, 2.4)), keep(new THREE.MeshStandardMaterial({ color: 0x1c110a, roughness: 0.9 })));
  lip.position.set(0, -1.52, TABLE.zFar - 1.1);
  scene.add(lip);

  let hasChannel = zirkel === "gezeiten";
  let board = boardTexture(hasChannel);
  // Wasser in der Rinne (Gezeiten): je höher der Stand, desto breiter und heller das Band
  const water = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(56.4, 1)),
    keep(new THREE.MeshStandardMaterial({ color: 0x3e7a93, roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.82, depthWrite: false })),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0.04, 0.2);
  water.renderOrder = 1;
  water.visible = false;
  scene.add(water);
  /** Wasserstand 0–1 (Ziel und aktuell). */
  const tideLevel = { goal: 0.3, now: 0.3 };
  const decal = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(board.area.w, board.area.d)),
    keep(new THREE.MeshStandardMaterial({ map: board.texture, transparent: true, roughness: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })),
  );
  decal.rotation.x = -Math.PI / 2;
  decal.position.set(board.area.x0 + board.area.w / 2, 0.02, board.area.z0 + board.area.d / 2);
  decal.receiveShadow = true;
  scene.add(decal);

  // ── Licht ───────────────────────────────────────────────────────────────
  // Hängelampe außerhalb des Bildes: macht das Brett lesbar und wirft die Schatten. Die Kerzen geben Wärme und Flackern.
  scene.add(new THREE.HemisphereLight(0x8a7055, 0x0a0604, 0.3));
  const key = new THREE.SpotLight(0xffd6a8, 2.1, 0, 0.62, 1, 0);
  key.position.set(0, 150, 26);
  key.target.position.set(0, 0, 2);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 60;
  key.shadow.camera.far = 240;
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.04;
  key.shadow.radius = 4;
  // Die Schatten ändern sich nur, wenn sich ein Gegenstand bewegt — sonst wird die Schattenkarte nicht neu gezeichnet
  key.shadow.autoUpdate = false;
  let shadowDirty = 3;
  scene.add(key, key.target);
  // Handlicht: nur die Karten in der Hand (kurze Reichweite, hängt an der Kamera)
  const handLight = new THREE.PointLight(0xffe2bd, 300, 46, 2);
  handLight.position.set(0, -4, -27);
  camera.add(handLight);
  // Glut vor dem Gegenüber: hebt Maske und Hände von unten aus dem Dunkel (wie eine Kerze knapp vor ihm)
  const figureLight = new THREE.PointLight(0xffa860, 1000, 95, 2);
  figureLight.position.set(0, 9, -43);
  scene.add(figureLight);

  // ── Kerzen (Bauart wie im alten Tisch) ──────────────────────────────────
  const profile = [new THREE.Vector2(0, 0.97), new THREE.Vector2(CANDLE_R * 0.75, 0.94), new THREE.Vector2(CANDLE_R * 1.02, 1.0), new THREE.Vector2(CANDLE_R * 1.04, 0.96)];
  for (let i = 9; i >= 0; i--) profile.push(new THREE.Vector2(CANDLE_R * (1 + Math.sin(i * 1.7) * 0.03), (i / 10) * 0.95));
  profile.push(new THREE.Vector2(CANDLE_R * 1.08, 0), new THREE.Vector2(0, 0));
  const candleGeo = keep(new THREE.LatheGeometry(profile.reverse(), 28));
  const dishGeo = keep(new THREE.LatheGeometry([
    new THREE.Vector2(0, 0), new THREE.Vector2(4.6, 0), new THREE.Vector2(4.9, 0.25), new THREE.Vector2(4.7, 0.7),
    new THREE.Vector2(4.2, 0.55), new THREE.Vector2(2.0, 0.4), new THREE.Vector2(1.9, 0.9), new THREE.Vector2(0, 0.9),
  ], 32));
  const pm = propMaterials();
  const rm = roomMaterials();
  const fm = figureMaterials();
  for (const m of [...Object.values(pm), ...Object.values(rm), ...Object.values(fm)]) keep(m);
  const wickGeo = keep(new THREE.CylinderGeometry(0.08, 0.1, 0.9, 6));
  const wickMat = keep(new THREE.MeshBasicMaterial({ color: 0x110b06 }));
  const flameGeo = keep(new THREE.PlaneGeometry(4.4, 6.4));
  flameGeo.translate(0, 2.0, 0);
  const waxGlow = keep(waxGlowTexture());
  const candles = [[-76, -36], [76, -36]].map(([x, z], i) => {
    const group = new THREE.Group();
    const dish = new THREE.Mesh(dishGeo, pm.brass);
    dish.castShadow = true;
    dish.receiveShadow = true;
    const waxMat = keep(new THREE.MeshStandardMaterial({
      map: keep(waxTexture(31 + i * 7)), roughness: 0.55, metalness: 0, emissive: 0xffffff, emissiveMap: waxGlow, emissiveIntensity: 0.9,
    }));
    const body = new THREE.Mesh(candleGeo, waxMat);
    body.position.y = 0.9;
    body.castShadow = true;
    const wick = new THREE.Mesh(wickGeo, wickMat);
    const fmat = keep(flameMaterial());
    fmat.uniforms.uSeed.value = i * 13.7;
    const flame = new THREE.Mesh(flameGeo, fmat);
    flame.renderOrder = 5;
    const light = new THREE.PointLight(0xffb070, 2400, 260, 2);
    group.add(dish, body, wick, flame, light);
    group.position.set(x, 0, z);
    group.userData.pick = { type: "candle", index: i };
    scene.add(group);
    // on: 1 = brennt, 0 = aus (nur am Match-Ende einzeln geschaltet, siehe candleLit)
    return { group, body, wick, flame, light, base: i === 0 ? 1 : 0.88, flick: 1, goal: 1, next: 0, on: 1 };
  });
  // Feuerschale für das Lagerfeuer am Pfad: Messingschale mit drei Flammen und eigenem Licht (sonst unsichtbar)
  const fire = (() => {
    const group = new THREE.Group();
    const bowl = new THREE.Mesh(dishGeo, pm.brass);
    bowl.scale.setScalar(1.7);
    bowl.castShadow = true;
    bowl.receiveShadow = true;
    const coal = new THREE.Mesh(keep(new THREE.SphereGeometry(1, 16, 10)), keep(new THREE.MeshStandardMaterial({ color: 0x1c110a, roughness: 1, emissive: 0xff5a1e, emissiveIntensity: 0.5 })));
    coal.scale.set(5.6, 1.1, 5.6);
    coal.position.y = 1.4;
    const flames = [[-2.2, 0.4, 1.25], [2.0, -0.6, 1.05], [0, 0.2, 1.6]].map(([x, z, s], k) => {
      const fmat = keep(flameMaterial());
      fmat.uniforms.uSeed.value = 40 + k * 9.3;
      const f = new THREE.Mesh(flameGeo, fmat);
      f.position.set(x, 1.6, z);
      f.scale.setScalar(s);
      f.renderOrder = 5;
      return f;
    });
    const light = new THREE.PointLight(0xff9a50, 2600, 150, 2);
    light.position.y = 9;
    group.add(bowl, coal, ...flames, light);
    group.userData.pick = { type: "fire" };
    group.visible = false;
    scene.add(group);
    return { group, flames, light };
  })();
  let burn = -1;
  const setBurn = (f) => {
    const v = clamp01(f);
    if (Math.abs(v - burn) < 0.002) return;
    burn = v;
    const h = CANDLE_FULL + (CANDLE_STUB - CANDLE_FULL) * v;
    for (const c of candles) {
      c.body.scale.y = h;
      c.wick.position.y = 0.9 + h + 0.15;
      c.flame.position.y = 0.9 + h + 0.6;
      c.light.position.y = 0.9 + h + 3;
    }
    shadowDirty = 2;
  };
  setBurn(0);

  // ── Feste Gegenstände ───────────────────────────────────────────────────
  const fixed = new THREE.Group();
  scene.add(fixed);
  const balance = makeScale(pm);
  balance.group.scale.setScalar(0.62);
  balance.group.position.set(AT.scale[0], 0, AT.scale[1]);
  balance.group.rotation.y = 0.28;
  balance.group.userData.pick = { type: "scale" };
  shadows(balance.group);
  const seal = makeSeal(rm, pm);
  seal.group.position.set(AT.seal[0], 0, AT.seal[1]);
  seal.group.rotation.y = -0.12;
  seal.group.userData.pick = { type: "seal" };
  const sealHome = seal.stamp.position.clone();
  const hourglass = makeHourglass(rm, pm);
  hourglass.group.position.set(AT.hourglass[0], 0, AT.hourglass[1]);
  hourglass.group.userData.pick = { type: "hourglass" };
  const hammer = makeHammer(rm, pm);
  hammer.group.position.set(AT.hammer[0], 0, AT.hammer[1]);
  hammer.group.rotation.y = 0.5;
  hammer.group.userData.pick = { type: "hammer" };
  const inkpot = makeInkpot(rm);
  inkpot.group.position.set(AT.inkpot[0], 0, AT.inkpot[1]);
  fixed.add(balance.group, seal.group, hourglass.group, hammer.group, inkpot.group);

  const figure = makeFigure(fm, { handX: 42, handZ: 27, mask: opts.mask });
  figure.group.position.set(0, 0, -74);
  scene.add(figure.group);
  // Die eigenen Hände: liegen unter der Tischkante und kommen nur für eine Geste ins Bild (klopfen, zeigen, Hände
  // heben). Finger zeigen vom Spieler weg; die rechte Hand (x > 0) hat den Daumen zur Mitte.
  const myHands = [-1, 1].map((ws) => {
    const obj = makeHand(fm, -ws);
    // Ärmel: weit am Handgelenk, läuft nach hinten aus dem Bild
    const sleeve = new THREE.Mesh(keep(new THREE.CylinderGeometry(6.2, 4.6, 40, 16, 1, true).rotateX(Math.PI / 2)), fm.clothRim);
    sleeve.position.set(0, 4, -29.5);
    obj.group.add(sleeve);
    obj.group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    obj.group.visible = false;
    scene.add(obj.group);
    const hidden = { x: ws * 34, y: -16, z: 74, yaw: Math.PI, pitch: 0, curl: 0, point: 0 };
    return { ws, obj, hidden, cur: { ...hidden } };
  });
  // Siegelstempel des Gegenübers: derselbe Gegenstand, klein und zu ihm gedreht
  const oppSeal = makeSeal(rm, pm);
  oppSeal.group.scale.setScalar(OPP_SCALE);
  oppSeal.group.position.set(AT.oppSeal[0], 0, AT.oppSeal[1]);
  oppSeal.group.rotation.y = Math.PI + 0.1;
  oppSeal.group.userData.pick = { type: "oppSeal" };
  const oppSealHome = oppSeal.stamp.position.clone();
  fixed.add(oppSeal.group);

  // ── Markierungen: mögliche Felder, ziehbare Stapel, Stempel ─────────────
  const ringTex = keep(ringTexture());
  const ringGeo = keep(new THREE.PlaneGeometry(CARD_W + 2.2, CARD_H + 2.2));
  const makeRing = (x, z, sx = 1, sz = 1) => {
    const mat = keep(new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, opacity: 0, depthWrite: false }));
    const m = new THREE.Mesh(ringGeo, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.05, z);
    m.scale.set(sx, sz, 1);
    m.renderOrder = 1;
    m.visible = false;
    scene.add(m);
    return { mesh: m, mat, level: 0, goal: 0 };
  };
  /** @type {Record<string, { mesh: THREE.Mesh, mat: THREE.MeshBasicMaterial, level: number, goal: number }>} */
  const rings = {};
  // Unsichtbare Flächen zum Anklicken leerer Felder
  const slotGeo = keep(new THREE.PlaneGeometry(CARD_W + 1.6, CARD_H + 1.6));
  const slotMat = keep(new THREE.MeshBasicMaterial({ visible: false }));
  const slotMeshes = [];
  // Überflutete Hinterreihen (Gezeiten): bläulicher Schleier über der Mulde
  const floodMat = keep(new THREE.MeshBasicMaterial({ color: 0x3e7a93, transparent: true, opacity: 0, depthWrite: false }));
  for (const row of ROWS) {
    LANE_X.forEach((x, lane) => {
      rings[`${row}:${lane}`] = makeRing(x, ROW_Z[row]);
      const s = new THREE.Mesh(slotGeo, slotMat);
      s.rotation.x = -Math.PI / 2;
      s.position.set(x, 0.04, ROW_Z[row]);
      s.userData.pick = { type: "slot", row, lane };
      scene.add(s);
      slotMeshes.push(s);
      if (row.endsWith("Back")) {
        const f = new THREE.Mesh(slotGeo, floodMat);
        f.rotation.x = -Math.PI / 2;
        f.position.set(x, 0.045, ROW_Z[row]);
        f.renderOrder = 1;
        scene.add(f);
      }
    });
  }
  rings.deck = makeRing(AT.deck[0], AT.deck[1], 1.12, 1.1);
  rings.sideDeck = makeRing(AT.sideDeck[0], AT.sideDeck[1], 1.12, 1.1);
  rings.seal = makeRing(AT.seal[0], AT.seal[1], 1.0, 0.62);
  rings.oppSeal = makeRing(AT.oppSeal[0], AT.oppSeal[1], 0.62, 0.4);
  rings.hammer = makeRing(AT.hammer[0], AT.hammer[1] - 1, 0.75, 1.0);

  // ── Staub im Licht ──────────────────────────────────────────────────────
  const DUST = 120;
  const dustPos = new Float32Array(DUST * 3);
  const dustVel = new Float32Array(DUST * 3);
  const dr = rng(5);
  for (let i = 0; i < DUST; i++) {
    dustPos[i * 3] = (dr() - 0.5) * 170;
    dustPos[i * 3 + 1] = 4 + dr() * 46;
    dustPos[i * 3 + 2] = (dr() - 0.5) * 110;
    dustVel[i * 3] = (dr() - 0.5) * 0.6;
    dustVel[i * 3 + 1] = (dr() - 0.3) * 0.4;
    dustVel[i * 3 + 2] = (dr() - 0.5) * 0.6;
  }
  const dustGeo = keep(new THREE.BufferGeometry());
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(dustGeo, keep(new THREE.PointsMaterial({
    map: keep(dotTexture()), size: 0.3, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending,
  })));
  scene.add(dust);

  // ── Kamera ──────────────────────────────────────────────────────────────
  let aspect = 16 / 9;
  /** Pose in Kamerazustand umrechnen; bei schmalem Bild rückt die Kamera zurück, damit die Seiten im Bild bleiben. */
  const stateOf = (pose) => {
    const look = new THREE.Vector3(...pose.look);
    const pos = new THREE.Vector3(...pose.pos);
    const f = Math.max(1, (16 / 9) / aspect);
    pos.sub(look).multiplyScalar(f).add(look);
    const probe = new THREE.PerspectiveCamera();
    probe.position.copy(pos);
    probe.lookAt(look);
    return { pos, quat: probe.quaternion.clone(), fov: pose.fov };
  };
  let poseName = "brett";
  let goal = stateOf(POSES.brett);
  const base = { pos: goal.pos.clone(), quat: goal.quat.clone(), fov: goal.fov };
  const move = { from: null, t0: 0, done: true };
  const clock = new THREE.Clock();
  const pointer = { x: 0, y: 0, cx: 0, cy: 0, sx: 0, sy: 0, inside: false };

  /** Winkel, um den der Blick seitlich steht (nur „seite“): Karten unter dem Zeiger drehen sich dorthin. */
  let camYaw = 0;
  const setPose = (name) => {
    if (!POSES[name] || name === poseName) return;
    poseName = name;
    camYaw = name === "seite" ? Math.atan2(POSES[name].pos[0] - POSES[name].look[0], POSES[name].pos[2] - POSES[name].look[2]) : 0;
    goal = stateOf(POSES[name]);
    move.from = { pos: base.pos.clone(), quat: base.quat.clone(), fov: base.fov };
    move.t0 = clock.getElapsedTime();
    move.done = false;
    wake(MOVE_S);
  };

  const resize = () => {
    const w = host.clientWidth || window.innerWidth;
    const h = host.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    aspect = w / h;
    camera.aspect = aspect;
    goal = stateOf(POSES[poseName]);
    if (move.done) { base.pos.copy(goal.pos); base.quat.copy(goal.quat); base.fov = goal.fov; }
  };
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();

  // ── Karten ──────────────────────────────────────────────────────────────
  const kit = createCardKit({ maxAniso });
  const cardLayer = new THREE.Group();
  const shadowLayer = new THREE.Group();
  scene.add(shadowLayer, cardLayer);
  /** @type {THREE.Texture | null} */
  let backTex = null;
  /** @type {THREE.Texture | null} */
  let sideBackTex = null;
  /**
   * Eine Karte in der Szene. kind: "unit" (auf dem Feld), "hand" (eigene Hand), "opp" (verdeckte Hand gegenüber).
   * @type {Map<string, any>}
   */
  const ents = new Map();
  /** Vergehende Karten (Tod, Opfer, Abwurf): laufen noch kurz weiter, sind aber nicht mehr anklickbar. */
  let dying = [];
  let hovered = null;
  /** @type {UiState} */
  let ui = {};
  let markedSet = new Set();
  /** Mehrere gewählte lose Karten (Pfad-Szenen: zwei Karten nähen …). */
  let pickedSet = new Set();
  const jitter = rng(11);
  const qx = new THREE.Quaternion();
  const qy = new THREE.Quaternion();
  const X = new THREE.Vector3(1, 0, 0);
  const Y = new THREE.Vector3(0, 1, 0);
  const v3 = new THREE.Vector3();
  const e3 = new THREE.Euler();
  const g = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), scale: 1 };

  /** Lage flach auf dem Tisch: Vorderseite oben (oder verdeckt), um die Hochachse gedreht. */
  const flat = (out, turn, faceUp, tilt = 0) => {
    qy.setFromAxisAngle(Y, turn);
    qx.setFromAxisAngle(X, (faceUp ? -1 : 1) * Math.PI / 2 + tilt);
    return out.copy(qy).multiply(qx);
  };

  const makeEnt = (uid, sideBack) => {
    const card = kit.make({ back: sideBack ? sideBackTex : backTex });
    card.front.userData.ent = uid;
    card.rear.userData.ent = uid;
    cardLayer.add(card.group);
    shadowLayer.add(card.shadow);
    return {
      uid, card, kind: "", row: "", lane: 0, index: 0, n: 1, owner: "me", spawn: null,
      jx: (jitter() - 0.5) * 0.7, jz: (jitter() - 0.5) * 0.7, turn: (jitter() - 0.5) * 0.07,
      pos: new THREE.Vector3(), quat: new THREE.Quaternion(), scale: 1, placed: false,
      hover: 0, sel: 0, mark: 0, submerged: false,
      // Lose Karte (Draft, Totem-Wahl): Ort und Größe auf dem Tisch, abgedunkelt = nicht wählbar
      lx: 0, lz: 0, lry: 0, lscale: 1, dim: false,
      // Wird gerade von einer Hand des Gegenübers getragen: { hand, from, until } (Szenen-Sekunden)
      hold: null,
      // Gesten (Zeitpunkte in Szenen-Sekunden; −9 = nie): Stoß, Rückstoß, Drehung (Verwandlung), Landung
      strikeAt: -9, strikeX: 0, strikeZ: 0, strikeLift: 2.4, knockAt: -9, knockX: 0, knockZ: 0, spinAt: -9, landAt: -9,
      flashUntil: 0, popAt: -9, dyingAt: 0, dyingDur: 0, dyingKind: "fade", faceKey: "", faceJob: 0, dead: false, faceUp: true,
    };
  };

  /** Kartenbild (neu) zeichnen, wenn sich etwas Sichtbares geändert hat. */
  const setFace = (ent, info) => {
    const k = faceKey(info);
    if (k === ent.faceKey) return;
    const first = !ent.faceKey;
    ent.faceKey = k;
    const job = ++ent.faceJob;
    prepareFaces([info]).then(() => renderCardFace(info)).then((cv) => {
      if (ent.dead || job !== ent.faceJob) return;
      ent.card.setFace(kit.texture(cv));
      if (!first) ent.popAt = clock.getElapsedTime();
    }).catch(() => {});
  };

  const removeEnt = (ent) => {
    ent.dead = true;
    cardLayer.remove(ent.card.group);
    shadowLayer.remove(ent.card.shadow);
    ent.card.dispose();
  };

  /** Startlage einer neuen Karte: vom Stapel (eigene Hand), aus der Hand gegenüber (seine Karten) oder über dem Feld. */
  const spawnAt = (ent, from) => {
    if (from === "deck" || from === "sideDeck") {
      ent.pos.set(AT[from][0], 4, AT[from][1]);
      flat(ent.quat, 0, false);
      ent.scale = 1;
    } else if (ent.kind === "loose" && from !== "pool" && !AT[from]) {
      // lose Karte ohne Herkunft: erscheint über ihrem Platz
      ent.pos.set(ent.lx, 7, ent.lz);
      flat(ent.quat, 0, true);
      ent.scale = 0.4;
    } else if (from === "pool") {
      ent.pos.set(AT.pool[0], 3, AT.pool[1]);
      flat(ent.quat, 0, false);
      ent.scale = 1;
    } else if (from === "oppHand") {
      ent.pos.set(AT.oppHand[0], 1.5, AT.oppHand[1]);
      flat(ent.quat, 0, false);
      ent.scale = 0.6;
    } else if (from === "oppDeck") {
      ent.pos.set(AT.oppDeck[0], 2.5, AT.oppDeck[1]);
      flat(ent.quat, 0, false);
      ent.scale = OPP_SCALE;
    } else {
      ent.pos.set(LANE_X[ent.lane], 7, ROW_Z[ent.row]);
      flat(ent.quat, 0, true);
      ent.scale = 0.4;
    }
    ent.placed = true;
  };

  // ── Vom Spielstand abhängige Gegenstände (werden nur neu gebaut, wenn sich ihr Wert ändert) ──
  const dynamic = new THREE.Group();
  scene.add(dynamic);
  /** @type {Record<string, { key: string, objs: Array<{ group: THREE.Object3D, dispose?: () => void }> }>} */
  const built = {};
  const rebuild = (name, k, make) => {
    const cur = built[name];
    if (cur && cur.key === k) return;
    if (cur) for (const o of cur.objs) { dynamic.remove(o.group); o.dispose?.(); }
    const objs = make() || [];
    for (const o of objs) dynamic.add(o.group);
    built[name] = { key: k, objs };
    shadowDirty = 2;
  };
  const at = (obj, x, z, ry = 0, pick = null) => {
    obj.group.position.set(x, 0, z);
    obj.group.rotation.y = ry;
    if (pick) obj.group.userData.pick = pick;
    return obj;
  };

  // ── Podest am Ende der Moorwanderung ──
  /** Platz 1 in der Mitte, 2 links, 3 rechts; hinter der Mitte des Bretts. */
  const PODIUM_X = [0, -17, 17];
  const PODIUM_Z = -15;
  const PODIUM_H = [7.5, 5, 3.2];
  /** Steigen nacheinander auf: erst Platz 3, dann 2, dann 1 (Verzögerung in s). */
  const PODIUM_DELAY = [0.6, 0.3, 0];
  const PODIUM_RISE_S = 0.8;
  /** @type {{ at: number, objs: any[] } | null} */
  let podium = null;
  /** Gebeiztes, dunkles Holz (das helle Holz der Stempelgriffe wirkte als Block wie Pappe); Kante etwas heller. */
  const podiumWood = keep(new THREE.MeshStandardMaterial({ color: 0x5a3a20, roughness: 0.78, metalness: 0 }));
  const podiumEdge = keep(new THREE.MeshStandardMaterial({ color: 0x7a5232, roughness: 0.7, metalness: 0 }));
  /**
   * Holzblock eines Platzes; oben liegen die übrigen Lebenssiegel als kleine Wachsscheiben, vorn eine Ziffer.
   * Der Block (`riser`) steigt beim Aufbau aus dem Tisch. @param {number} place @param {number} seals
   */
  const makePodiumBlock = (place, seals) => {
    const group = new THREE.Group();
    const riser = new THREE.Group();
    const h = PODIUM_H[place - 1] ?? 3;
    const geos = [];
    const block = new THREE.Mesh(keepGeo(geos, new THREE.BoxGeometry(13, h, 10)), podiumWood);
    block.position.y = h / 2;
    // Deckplatte, etwas überstehend
    const lid = new THREE.Mesh(keepGeo(geos, new THREE.BoxGeometry(13.8, 0.6, 10.8)), podiumEdge);
    lid.position.y = h - 0.3;
    riser.add(block, lid);
    const n = Math.max(0, Math.min(5, seals));
    for (let i = 0; i < n; i++) {
      const disc = new THREE.Mesh(keepGeo(geos, new THREE.CylinderGeometry(1.5, 1.6, 0.55, 20)), rm.wax);
      disc.position.set((i - (n - 1) / 2) * 3.6, h + 0.28, 0.5);
      riser.add(disc);
    }
    const th = Math.min(4.3, h - 1.1);
    const num = makeTag(String(place), { w: th * 1.4, h: th });
    num.group.rotation.x = Math.PI / 2;
    num.group.position.set(0, (h - 0.6) / 2, 5.03);
    riser.add(num.group);
    group.add(riser);
    shadows(group);
    group.userData.riser = riser;
    group.userData.h = h;
    group.userData.place = place;
    return { group, dispose() { geos.forEach((g) => g.dispose()); num.dispose(); } };
  };
  /** @param {THREE.BufferGeometry[]} list @param {THREE.BufferGeometry} g */
  function keepGeo(list, g) { list.push(g); return g; }
  /** @param {number} t */
  const stepPodium = (t) => {
    const p = /** @type {NonNullable<typeof podium>} */ (podium);
    let busy = false;
    for (const o of p.objs) {
      const { riser, h, place } = o.group.userData;
      const k = reduced ? 1 : Math.min(1, Math.max(0, (t - p.at - (PODIUM_DELAY[place - 1] ?? 0)) / PODIUM_RISE_S));
      const e = 1 - (1 - k) ** 3;
      riser.position.y = -(h + 6) * (1 - e);
      riser.visible = k > 0;
      if (k < 1) busy = true;
    }
    shadowDirty = 2;
    if (!busy) podium = null;
  };

  /** Zeitpunkt, bis zu dem der Knochenhaufen nicht neu gebaut wird (fliegende Knochen), 0 = frei. */
  let bonesHold = 0;
  const syncBones = (m) => rebuild("bones", `${m.me.bones}${(m.stage || "battle") === "battle"}`, () => [
    at(makeBonePile(pm, m.me.bones, rng(23)), AT.bones[0], AT.bones[1], 0, { type: "bones" }),
    ...((m.stage || "battle") === "battle" ? [at(makeTag(m.me.bones), AT.bones[0], AT.bones[1] + 11, -0.07)] : []),
  ]);

  /** @type {BattleModel | null} */
  let model = null;
  let pendingModel = null;
  let ready = false;
  let firstSync = true;
  /** Phase des letzten Stands ("battle", "draft", "extras" …): beim Wechsel wird neu aufgebaut statt geflogen. */
  let stage = "";
  /** Wo lose Karten zuletzt lagen — von dort greift das Gegenüber eine Karte (oppTake). @type {Map<string, THREE.Vector3>} */
  const lastLoose = new Map();
  /** Ringe unter losen Karten und Totem-Köpfen, die man wählen kann: bei Bedarf angelegt, mit dem Gegenstand entfernt. */
  const ensureRing = (key, x, z, sx = 1, sz = 1) => {
    if (!rings[key]) rings[key] = makeRing(x, z, sx, sz);
    rings[key].mesh.position.set(x, 0.05, z);
    rings[key].mesh.scale.set(sx, sz, 1);
  };
  const dropRings = (prefix, keepKeys) => {
    for (const k of Object.keys(rings)) {
      if (!k.startsWith(prefix) || keepKeys.has(k)) continue;
      scene.remove(rings[k].mesh);
      delete rings[k];
    }
  };

  /** @param {BattleModel} m */
  function applyModel(m) {
    model = m;
    const seen = new Set();
    const nextStage = m.stage || "battle";
    // Beginnt ein Kampf (nach Draft und Totem-Wahl am selben Tisch), steht sein erster Stand sofort da
    const enteringBattle = nextStage === "battle" && stage !== "battle";
    const leftDraft = stage === "draft" && nextStage !== "draft";
    stage = nextStage;
    const instant = firstSync || enteringBattle;
    firstSync = false;
    if (enteringBattle) { candleEnd = ""; timerKey = ""; }
    // Match-Ende: die Kerzen sind aus, bis jemand eine für die Revanche anzündet (m.candles = [links, rechts]).
    // In jeder anderen Phase vor einem Kampf brennen sie wieder wie gewohnt.
    if (nextStage === "result") {
      if (!candleLit) for (const c of candles) c.on = candleEnd === "lose" ? 0 : 1;
      candleLit = [!!m.candles?.[0], !!m.candles?.[1]];
      candleEnd = "";
    } else {
      candleLit = null;
      if (nextStage !== "battle") candleEnd = "";
    }
    const tags = nextStage === "battle";
    const upsert = (uid, kind, sideBack, from) => {
      let ent = ents.get(uid);
      if (!ent) {
        ent = makeEnt(uid, sideBack);
        ents.set(uid, ent);
        // Lage erst bestimmen, wenn Reihe und Lane gesetzt sind (unten)
        if (!instant) ent.spawn = from;
      }
      if (ent.kind === "hand" && kind === "unit") ent.sel = 0;
      ent.kind = kind;
      seen.add(uid);
      return ent;
    };

    for (const u of m.units) {
      const own = u.row.startsWith("own");
      const ent = upsert(u.uid, "unit", String(u.card.baseId || "").startsWith("side_"), own ? "slot" : "oppHand");
      ent.row = u.row;
      ent.lane = u.lane;
      ent.owner = own ? "me" : "opp";
      ent.submerged = !!u.submerged;
      ent.faceUp = true;
      setFace(ent, { card: u.card, attack: u.attack, health: u.health, maxHealth: u.maxHealth, auras: u.auras, state: u.state });
    }
    m.hand.forEach((card, i) => {
      const side = String(card.baseId || "").startsWith("side_");
      const ent = upsert(card.uid, "hand", side, side ? "sideDeck" : "deck");
      ent.index = i;
      ent.n = m.hand.length;
      ent.owner = "me";
      ent.faceUp = true;
      setFace(ent, { card });
    });
    m.oppHand.forEach((card, i) => {
      const ent = upsert(`opp#${i}`, "opp", false, "oppDeck");
      ent.index = i;
      ent.n = m.oppHand.length;
      ent.owner = "opp";
      // Aufgedeckt nur, wenn ein Effekt die Hand zeigt
      ent.faceUp = !!card;
      if (card) setFace(ent, { card });
    });
    // Lose Karten (Draft, Totem-Wahl): liegen frei auf dem Tisch, dort wo die Phase sie hinlegt
    for (const c of m.loose || []) {
      const ent = upsert(c.uid, "loose", String(c.card.baseId || "").startsWith("side_"), c.from || "pool");
      ent.lx = c.x;
      ent.lz = c.z;
      ent.lry = c.ry || 0;
      ent.lscale = c.scale ?? 1;
      ent.owner = "me";
      ent.faceUp = c.faceUp !== false;
      ent.dim = !!c.dim;
      setFace(ent, { card: c.card });
      ensureRing(`loose:${c.uid}`, c.x, c.z, ent.lscale, ent.lscale);
    }
    dropRings("loose:", new Set((m.loose || []).map((c) => `loose:${c.uid}`)));
    for (const c of m.choices || []) ensureRing(`choice:${c.id}`, c.x, c.z + 1, 0.95, 0.62);
    dropRings("choice:", new Set((m.choices || []).map((c) => `choice:${c.id}`)));
    for (const ent of ents.values()) {
      if (ent.spawn) { spawnAt(ent, ent.spawn); ent.spawn = null; }
    }
    // Was fehlt, vergeht (eine laufende Sterbe-Geste wird zu Ende gespielt)
    const now = clock.getElapsedTime();
    for (const [uid, ent] of ents) {
      if (seen.has(uid)) continue;
      ents.delete(uid);
      if (ent.kind === "loose") lastLoose.set(uid, ent.pos.clone());
      if (instant || ent.kind === "opp") { removeEnt(ent); continue; }
      // Nach dem Draft wandern die gewählten Karten aus der Hand auf den eigenen Stapel
      if (leftDraft && ent.kind === "hand") { ent.dyingAt = now; ent.dyingDur = 0.5; ent.dyingKind = "stack"; }
      // Ohne eigene Geste (z. B. Abwurf) kurz ausblenden; Zerreißen/Verbrennen läuft in voller Länge weiter,
      // auch wenn das Spiel schon beim nächsten Ereignis ist
      if (!ent.dyingAt) { ent.dyingAt = now; ent.dyingDur = 0.22; ent.dyingKind = "fade"; }
      ent.mark = 0;
      dying.push(ent);
    }
    if (hovered && !ents.has(hovered.uid)) hovered = null;

    // Stapel, Zettel, Schalen, Waage, Totems, Items. Die Zettel mit den Ziffern liegen nur im Kampf aus —
    // vorher (Draft, Totem-Wahl) gibt es noch nichts zu zählen.
    const tag = (value, x, z, ry) => (tags ? [at(makeTag(value), x, z, ry)] : []);
    rebuild("deck", `${m.me.deck}${tags}`, () => [
      at(makeDeck(backTex, m.me.deck), AT.deck[0], AT.deck[1], -0.04, { type: "deck", pile: "main" }),
      ...tag(m.me.deck, AT.deck[0], AT.deck[1] + 12.6, 0.05),
    ]);
    rebuild("sideDeck", `x${tags}`, () => (tags ? [
      at(makeDeck(sideBackTex, Infinity), AT.sideDeck[0], AT.sideDeck[1], 0.06, { type: "deck", pile: "side" }),
      at(makeTag("∞"), AT.sideDeck[0], AT.sideDeck[1] + 12.6, -0.06),
    ] : []));
    // Vorrat des Drafts: der Stapel, von dem die Karten der Runde kommen, mit der Runde als Zettel
    rebuild("pool", m.pool ? `${m.pool.count}|${m.pool.label}` : "", () => (m.pool ? [
      at(makeDeck(backTex, m.pool.count), AT.pool[0], AT.pool[1], 0.08, { type: "pool" }),
      at(makeTag(m.pool.label, { w: 8.4 }), AT.pool[0], AT.pool[1] + 12.6, -0.05),
    ] : []));
    // Zettel mit Text (Rast: besuchte Orte · Ergebnis: Ausgang und Zahlen)
    rebuild("notes", (m.notes || []).map((n) => `${n.id}|${n.x}|${n.z}|${n.w}|${n.h}|${!!n.mark}|${!!n.dim}|${n.lines.map((l) => (typeof l === "string" ? l : l.text)).join("/")}`).join(","), () => (m.notes || []).map((n) => (
      at(makeNote(n.lines, { w: n.w, h: n.h, mark: n.mark, dim: n.dim }), n.x, n.z, n.ry || 0, { type: "note", id: n.id, click: !!n.click })
    )));
    // Podest (Ende der Moorwanderung): drei Holzblöcke wachsen aus dem Tisch, auf jedem die Lebenssiegel des Platzes
    rebuild("podium", (m.podium || []).map((p) => `${p.place}|${p.seals}`).join(","), () => {
      const objs = (m.podium || []).map((p) => at(makePodiumBlock(p.place, p.seals), PODIUM_X[p.place - 1] ?? 0, PODIUM_Z, 0, { type: "podium", place: p.place }));
      podium = { at: clock.getElapsedTime(), objs };
      return objs;
    });
    // Waren des Händlers: Beutel mit Namenszettel; verkaufte fehlen
    rebuild("wares", (m.wares || []).map((w) => `${w.id}|${w.name}|${w.x}|${w.z}`).join(","), () => (m.wares || []).map((w) => {
      const o = makeItemToken(rm, pm, w.name);
      o.group.scale.setScalar(1.25);
      return at(o, w.x, w.z, 0, { type: "ware", id: w.id });
    }));
    // Feuerschale (Lagerfeuer)
    fire.group.visible = !!m.fire;
    if (m.fire) fire.group.position.set(m.fire.x, 0, m.fire.z);
    // Zur Wahl stehende Totem-Köpfe (Totem-Wahl): geschnitzte Figuren in einer Reihe
    rebuild("choices", (m.choices || []).map((c) => `${c.id}|${c.kind}|${c.label}|${c.x}|${c.z}`).join(","), () => (m.choices || []).map((c) => {
      const o = makeTotem(pm, c.kind, c.label);
      shadows(o.group);
      o.group.scale.setScalar(1.25);
      return at(o, c.x, c.z, 0, { type: "choice", id: c.id });
    }));
    rebuild("oppDeck", `${m.opp.deck ?? 0}`, () => {
      const d = makeDeck(backTex, m.opp.deck ?? 0);
      d.group.scale.setScalar(OPP_SCALE);
      return [at(d, AT.oppDeck[0], AT.oppDeck[1], Math.PI + 0.05, { type: "oppDeck" })];
    });
    // Solange Knochen noch zum Haufen fliegen, bleibt der alte Haufen liegen (siehe bonesHold)
    if (!bonesHold) syncBones(m);
    rebuild("third", `${m.third}${m.me.third}${tags}`, () => [
      at(makeResourceBowl(rm, pm, m.me.third, m.third, rng(29)), AT.third[0], AT.third[1], 0, { type: "third" }),
      ...tag(m.me.third, AT.third[0], AT.third[1] + 10, 0.08),
    ]);
    balance.set(m.scale);
    rebuild("scaleTag", `${m.scale}${tags}`, () => tag(`${m.scale > 0 ? "+" : ""}${m.scale}`, AT.scale[0], AT.scale[1] + 11.5, 0.1));
    rebuild("totemsMe", m.me.totems.map((t) => `${t.kind}|${t.label}`).join(","), () => m.me.totems.map((t, i) => {
      const o = makeTotem(pm, t.kind, t.label);
      shadows(o.group);
      o.group.scale.setScalar(0.9);
      return at(o, -72 + i * 11, 13 - i * 2, 0.25, { type: "totem", owner: "me", index: i });
    }));
    rebuild("totemsOpp", m.opp.totems.map((t) => `${t.kind}|${t.label}`).join(","), () => m.opp.totems.map((t, i) => {
      const o = makeTotem(pm, t.kind, t.label);
      shadows(o.group);
      o.group.scale.setScalar(0.9);
      return at(o, 54 + i * 11, -31 + i * 2, -0.2, { type: "totem", owner: "opp", index: i });
    }));
    rebuild("items", m.me.items.join(","), () => m.me.items.map((id, i) => (
      at(makeItemToken(rm, pm, m.itemNames[id] || id), 37, -8 + i * 9.5, 0, { type: "item", index: i, id })
    )));
    rebuild("oppItems", `${m.opp.items}`, () => Array.from({ length: m.opp.items }, (_, i) => (
      at(makeItemToken(rm, pm, null), -17 - i * 6, -47, 0.3, { type: "oppItem" })
    )));
    rebuild("tide", m.tide === null ? "-" : `${m.tide}`, () => (m.tide === null ? [] : [
      at(makeTideGauge(rm, pm, m.tide), AT.tide[0], AT.tide[1], 0, { type: "tide" }),
    ]));
    // Pfadkarte auflegen, ändern oder wegnehmen (nur wenn sich ihre Daten geändert haben — sie malt sonst neu)
    if ((m.map || null) !== mapData) {
      mapData = m.map || null;
      pathMap.setData(mapData, clock.getElapsedTime());
      decal.visible = !mapData;
      shadowDirty = 3;
    }
    puppet.setMood({ turn: m.oppTurn ? "opp" : "me" });
    floodMat.opacity = m.flooded ? 0.26 : 0;
    water.visible = hasChannel && m.tide !== null;
    // Ebbe, steigend, Flut, fallend — wie das Gezeitenglas
    if (m.tide !== null) tideLevel.goal = [0.15, 0.6, 0.92, 0.45][m.tide] ?? 0.4;
    if (instant) tideLevel.now = tideLevel.goal;
    setBurn(m.turn / m.stalemateTurn);
  }

  /** @param {BattleModel} m */
  function sync(m) {
    wake(1);
    if (!ready) { pendingModel = m; return; }
    applyModel(m);
    targetsChanged();
  }

  // Rückseiten und Schriften laden, danach den ersten Stand aufbauen
  let disposed = false;
  const whenReady = Promise.all([renderCardBack(), renderCardBack({ side: true })]).then(([a, b]) => {
    if (disposed) return;
    backTex = keep(kit.texture(a));
    sideBackTex = keep(kit.texture(b));
    ready = true;
    if (pendingModel) { applyModel(pendingModel); pendingModel = null; targetsChanged(); }
    // Alle Materialien vorab übersetzen (auch die der Gestalt, die im Standardblick nicht im Bild ist) —
    // sonst ruckelt der erste Kamerawechsel
    renderer.compile(scene, camera);
  });

  /** @param {UiState} next */
  function setUi(next) {
    wake();
    ui = next || {};
    markedSet = new Set(ui.marked || []);
    pickedSet = new Set(ui.picked || []);
    const targets = new Set(ui.targets || []);
    const glow = new Set(ui.glow || []);
    for (const row of ROWS) {
      for (let lane = 0; lane < 4; lane++) {
        const k = `${row}:${lane}`;
        rings[k].goal = targets.has(k) ? 0.85 : glow.has(k) ? 0.5 : 0;
      }
    }
    rings.deck.goal = ui.drawable ? 0.9 : 0;
    rings.sideDeck.goal = ui.drawable ? 0.9 : 0;
    rings.seal.goal = ui.canEnd ? 0.55 : 0;
    rings.oppSeal.goal = ui.oppSeal ? 0.8 : 0;
    rings.hammer.goal = ui.hammer === "active" ? 0.9 : 0;
    // Draft und Totem-Wahl: nehmbare lose Karten, wählbare und gewählte Totem-Köpfe
    const pickable = new Set(ui.pickable || []);
    const choosable = new Set(ui.choosable || []);
    for (const k of Object.keys(rings)) {
      if (k.startsWith("loose:")) rings[k].goal = ui.selected === k.slice(6) || pickedSet.has(k.slice(6)) ? 0.95 : pickable.has(k.slice(6)) ? 0.5 : 0;
      else if (k.startsWith("choice:")) rings[k].goal = String(ui.choice) === k.slice(7) ? 0.95 : choosable.has(k.slice(7)) ? 0.45 : 0;
    }
    targetsChanged();
  }

  // ── Gesten zu Ereignissen ───────────────────────────────────────────────
  let sealPressAt = -9;
  const fx = createEffects(scene, { bone: pm.bone, iron: pm.iron, brass: pm.brassDark });
  // Pfadkarte: das Pergament mit Holzmarken und Spielfigur (dasselbe Modul wie am bisherigen Tisch) liegt über dem
  // Brett, solange der Pfad gegangen wird — m.map im Stand. Darunter verschwinden die eingeritzten Felder.
  const pathMap = createPathMap(scene, { iconPaths: NODE_PATHS, maxAniso });
  pathMap.setArea(0, 3, 74, 88);
  let mapData = null;
  /** Später ausführen (Szenen-Sekunden). @type {Array<{ at: number, fn: () => void }>} */
  let later = [];
  const after = (sec, fn) => later.push({ at: clock.getElapsedTime() + sec, fn });

  // Ein Lebenssiegel bricht (Moorwanderung, Phase 6): ein Wachssiegel fällt auf den Tisch, zittert und springt in
  // zwei Hälften, die auseinanderkippen; dann sinkt es weg. Zwei halbe Scheiben mit geprägter Mitte und Schnittfläche.
  /** @type {null | { group: THREE.Group, halves: THREE.Group[], t0: number, x: number, z: number, landed: boolean, cracked: boolean }} */
  let lifeSeal = null;
  const LIFE_SEAL_S = 3;
  const dropLifeSeal = () => {
    if (!lifeSeal) return;
    scene.remove(lifeSeal.group);
    lifeSeal.group.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
    lifeSeal = null;
    shadowDirty = 2;
  };
  /** Dunkleres Wachs für Prägung und Bruchkante (sonst liest sich das Siegel nur als roter Fleck). */
  const waxDeep = keep(new THREE.MeshStandardMaterial({ color: 0x5a0f0f, roughness: 0.42, metalness: 0 }));
  const makeLifeSeal = () => {
    const group = new THREE.Group();
    const R = 7;
    const H = 1.3;
    const halves = [0, 1].map((k) => {
      const half = new THREE.Group();
      // theta 0…π liegt bei x ≥ 0 (Hälfte 0), π…2π bei x ≤ 0 (Hälfte 1)
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 1.07, H, 36, 1, false, k * Math.PI, Math.PI), rm.wax);
      disc.position.y = H / 2;
      // Prägung: ein erhabener Ring und eine flache Mitte
      const ringGeo = new THREE.TorusGeometry(R * 0.68, 0.38, 8, 28, Math.PI);
      ringGeo.rotateX(-Math.PI / 2);
      ringGeo.rotateY(k ? Math.PI / 2 : -Math.PI / 2);
      const ring = new THREE.Mesh(ringGeo, waxDeep);
      ring.position.y = H;
      const boss = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.36, R * 0.4, 0.3, 24, 1, false, k * Math.PI, Math.PI), waxDeep);
      boss.position.y = H + 0.15;
      const cut = new THREE.Mesh(new THREE.BoxGeometry(0.05, H, 2 * R * 1.04), waxDeep);
      cut.position.set(k ? -0.025 : 0.025, H / 2, 0);
      half.add(disc, ring, boss, cut);
      group.add(half);
      return half;
    });
    shadows(group);
    return { group, halves };
  };
  /** @param {number} t */
  const stepLifeSeal = (t) => {
    const s = /** @type {NonNullable<typeof lifeSeal>} */ (lifeSeal);
    const k = t - s.t0;
    // 0–0,4 s: fällt aus der Höhe auf den Tisch
    const fall = Math.min(1, Math.max(0, k) / 0.4);
    s.group.position.set(s.x, 15 * (1 - fall * fall), s.z);
    if (k >= 0.4 && !s.landed) {
      s.landed = true;
      onSound("seal");
      if (!reduced) fx.burst("dust", s.x, 0.4, s.z, 10, { spread: 4, power: 0.7 });
    }
    // kurz zittern, dann springt es
    s.group.rotation.y = k > 0.55 && k < 1 && !reduced ? Math.sin(t * 80) * 0.025 : 0;
    if (k >= 1 && !s.cracked) {
      s.cracked = true;
      onSound("crackle");
      if (!reduced) {
        fx.burst("wax", s.x, 1.4, s.z, 22, { spread: 1.5 });
        fx.burst("dust", s.x, 0.5, s.z, 8, { spread: 3, power: 0.6 });
      }
    }
    const sp = Math.min(1, Math.max(0, (k - 1) / 0.45));
    const e = 1 - (1 - sp) ** 3;
    // Die Hälften rutschen auseinander, die Bruchkante hebt sich
    s.halves[0].position.set(3.2 * e, 0.6 * e, 0.7 * e);
    s.halves[0].rotation.set(0, -0.12 * e, -0.22 * e);
    s.halves[1].position.set(-3.2 * e, 0.6 * e, -0.5 * e);
    s.halves[1].rotation.set(0, 0.1 * e, 0.22 * e);
    // zum Schluss sinkt es weg
    const gone = Math.min(1, Math.max(0, (k - 2.3) / 0.7));
    s.group.scale.setScalar(Math.max(0.001, 1 - gone));
    shadowDirty = 2;
    if (k >= LIFE_SEAL_S) dropLifeSeal();
  };
  /** Wo zuletzt eine Karte starb — von dort fliegen die Knochen. */
  const lastDeath = { me: new THREE.Vector3(0, 1, 11), opp: new THREE.Vector3(0, 1, -11) };
  /** Waagschalen in Weltkoordinaten (deine links). */
  const PAN = { me: new THREE.Vector3(-60.9, 7.5, -2.4), opp: new THREE.Vector3(-43.1, 7.5, -7.6) };
  const cam = { shakeAt: -9, shakeAmt: 0, leanAt: -9 };
  const hammerHit = { at: -9, to: new THREE.Vector3(), moving: false };
  /** Kerzen am Kampfende: "" = brennen, "win" = flammen auf, "lose" = verlöschen. */
  let candleEnd = "";
  let candleEndAt = 0;
  /** Match-Ende: welche der beiden Kerzen brennt (null = alle wie gewohnt). @type {boolean[] | null} */
  let candleLit = null;
  const shakeCam = (amt) => { if (!reduced && amt > cam.shakeAmt * 0.5) { cam.shakeAt = clock.getElapsedTime(); cam.shakeAmt = amt; } };
  const ownerOf = (seat) => (model && seat === model.seat ? "me" : "opp");
  // Die Gestalt gegenüber führt die Züge des Gegenübers mit den Händen aus (Phase 3)
  const onSound = opts.onSound || (() => {});
  const puppet = createPuppet(figure, {
    onKnock: (p) => {
      onSound("knock");
      if (!reduced) fx.burst("dust", p.x, 0.4, p.z, 5, { spread: 2, power: 0.6 });
    },
  });
  let oppSealPressAt = -9;
  /**
   * Eigene Geste: der Blick nickt, schüttelt sich, beugt sich vor; für Klopfen, Zeigen und Hände heben kommen die
   * eigenen Hände ins Bild. `target` = Ort, auf den gezeigt wird.
   */
  const self = { kind: "", at: -9, target: /** @type {{ x: number, z: number } | null} */ (null) };
  /** Feld, auf das gerade jemand zeigt. */
  const pointed = { key: "", until: 0 };
  /** Zugzeit für das Stundenglas (null = kein Zeitlimit). */
  let timer = /** @type {{ endsAt: number, total: number, paused: boolean, remaining: number } | null} */ (null);
  let timerKey = "";
  let sandShown = 0.5;
  let flipAt = -9;
  let oppAway = false;
  /** Sitzt jemand gegenüber? 0 = leerer Platz, 1 = sitzt; dazwischen kommt die Gestalt aus dem Dunkel heran. */
  const sit = { goal: opts.seated === false ? 0 : 1, now: opts.seated === false ? 0 : 1 };
  oppSeal.group.visible = sit.goal === 1;
  /** Für Prüfskripte (stats): wie viele Gesten die Gestalt gezeigt hat und welche zuletzt. */
  let oppGestures = 0;
  let lastGesture = "";

  /**
   * Geste zu einem Ereignis der Engine. Die Gesten laufen in der Szene von selbst zu Ende — der Takt des Spiels
   * (TABLE_TIMING) wartet nicht darauf, deshalb überlappen sie sich.
   * @param {any} ev @param {number} [durMs] Abstand bis zum nächsten Ereignis
   */
  function play(ev, durMs) {
    wake(ev.type === "bossPhase" ? 3 : 1);
    const t = clock.getElapsedTime();
    const ent = ev.uid ? ents.get(ev.uid) : null;
    const byOpp = typeof ev.player === "number" && ownerOf(ev.player) === "opp";
    switch (ev.type) {
      case "draw":
      case "handAdd": {
        // Das Gegenüber nimmt die Karte mit der Hand vom Stapel und steckt sie zu den anderen
        if (!byOpp || reduced || !model) break;
        const card = ents.get(`opp#${model.oppHand.length - 1}`);
        if (!card || card.hold) break;
        const off = card.index - (card.n - 1) / 2;
        const h = puppet.carry(
          { x: AT.oppDeck[0], y: 1.5, z: AT.oppDeck[1] },
          { x: AT.oppHand[0] + off * 3.4, y: 0.4, z: AT.oppHand[1] },
          { hand: 1, reach: 0.1, move: 0.2 },
        );
        card.hold = { hand: h.hand, from: t + h.grab, until: t + h.drop };
        break;
      }
      case "attackPhase": {
        // Zug beendet: das Gegenüber drückt seinen Stempel ins Wachs
        if (!byOpp || reduced) break;
        const d = puppet.stamp({ x: AT.oppSeal[0] - 1.5, z: AT.oppSeal[1] });
        oppSealPressAt = t + d - 0.08;
        after(d, () => onSound("seal"));
        break;
      }
      case "item": {
        if (!byOpp || reduced) break;
        puppet.tap({ x: -17, z: -45 }, { hand: 0 });
        const tgt = ev.target ? ents.get(ev.target) : null;
        if (tgt) puppet.lookAt(tgt.pos, 1.4);
        break;
      }
      case "attack": {
        // Stoß: kurz ausholen, vorschnellen (Treffer nach 0,2 s), federnd zurück
        if (!ent || ent.kind !== "unit") break;
        puppet.lookAt({ x: LANE_X[ev.lane ?? ent.lane], z: ent.owner === "me" ? -11 : 11 }, 0.9);
        const dir = ent.owner === "me" ? -1 : 1;
        const reach = ev.flying && ev.direct ? 13 : ev.direct ? 10 : 7;
        ent.strikeAt = t;
        ent.strikeX = ((ev.lane ?? ent.lane) - ent.lane) * 14 * 0.85;
        ent.strikeZ = dir * reach;
        ent.strikeLift = ev.flying ? 7 : 2.4;
        break;
      }
      case "damage": {
        if (!ent) break;
        // Rückstoß weg vom Angreifer, Tusche spritzt in dieselbe Richtung
        const src = ev.source ? ents.get(ev.source) : null;
        const dz = src ? Math.sign(ent.pos.z - src.pos.z) || 1 : ent.owner === "me" ? 1 : -1;
        const strong = Math.min(1.6, 0.7 + (ev.amount || 1) * 0.22);
        ent.knockAt = t;
        ent.knockX = 0;
        ent.knockZ = dz * 1.8 * strong;
        ent.flashUntil = t + 0.36;
        if (!reduced) fx.burst("ink", ent.pos.x, 1.2, ent.pos.z, 8 + Math.min(14, (ev.amount || 1) * 4), { dirZ: dz * 0.8, power: strong });
        if (ev.cause === "attack") shakeCam(0.1 + Math.min(0.5, (ev.amount || 1) * 0.09));
        break;
      }
      case "overflow": {
        // Der Rest des Schlags fährt weiter zur Hinterreihe oder zur Waage: Tusche in Stoßrichtung
        const att = ents.get(ev.uid);
        if (att && !reduced) {
          const dz = att.owner === "me" ? -1 : 1;
          fx.burst("ink", LANE_X[ev.lane ?? att.lane], 1.2, att.pos.z + dz * 16, 10, { dirZ: dz * 1.4 });
        }
        break;
      }
      case "death":
      case "shed": {
        if (!ent) break;
        // Zerreißen: zwei Hälften reißen auseinander, Fetzen fliegen
        ent.dyingAt = t;
        ent.dyingDur = 0.6;
        ent.dyingKind = "tear";
        lastDeath[ent.owner].copy(ent.pos);
        if (!reduced) {
          fx.burst("paper", ent.pos.x, 1.5, ent.pos.z, 16, { spread: 3 });
          fx.burst("dust", ent.pos.x, 0.5, ent.pos.z, 8, { spread: 4 });
        }
        break;
      }
      case "sacrifice":
      case "decay": {
        if (!ent) break;
        // Opfer: die Karte verkohlt und sinkt zusammen, Wachs und Asche
        ent.dyingAt = t;
        ent.dyingDur = 0.55;
        ent.dyingKind = "burn";
        lastDeath[ent.owner].copy(ent.pos);
        // Opfert das Gegenüber, legt es dazu kurz die Hand auf die Karte
        if (ev.type === "sacrifice" && ent.owner === "opp" && !reduced) puppet.tap(ent.pos);
        if (!reduced) {
          fx.burst(ev.type === "sacrifice" ? "wax" : "ash", ent.pos.x, 1.2, ent.pos.z, 12, { spread: 3 });
          fx.burst("ash", ent.pos.x, 1, ent.pos.z, 14, { spread: 4 });
          fx.burst("ember", ent.pos.x, 1, ent.pos.z, 8, { spread: 3 });
        }
        break;
      }
      case "bones": {
        // Knochen fliegen vom Ort des Todes auf den Haufen (deine) bzw. zum Gegenüber
        const who = ownerOf(ev.player);
        const n = Math.max(1, Math.min(4, ev.amount || 1));
        if (reduced) break;
        const to = who === "me" ? new THREE.Vector3(AT.bones[0], 2, AT.bones[1]) : new THREE.Vector3(18, 4, TABLE.zFar - 6);
        if (who === "me") bonesHold = t + 0.42 + n * 0.06;
        for (let i = 0; i < n; i++) {
          const from = lastDeath[who].clone();
          from.x += (Math.random() - 0.5) * 3;
          from.y = 2;
          fx.fly("bone", from, to.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, 0, (Math.random() - 0.5) * 3)), {
            delay: i * 0.06, dur: 0.4, arc: 10 + i * 2,
            onDone: who === "me" ? () => fx.burst("dust", to.x, 1.5, to.z, 4, { spread: 2, power: 0.6 }) : undefined,
          });
        }
        break;
      }
      case "scale": {
        // Gewichte fliegen in die Schale dessen, der getroffen hat; bei viel Schaden beugt sich der Blick zur Waage
        const n = Math.max(0, Math.min(5, ev.amount || 0));
        if (!n || reduced) break;
        const who = ownerOf(ev.player);
        const src = ev.source ? ents.get(ev.source) : null;
        const from = src ? src.pos.clone() : new THREE.Vector3(0, 4, who === "me" ? -6 : 6);
        from.y = Math.max(from.y, 3);
        const to = PAN[who];
        for (let i = 0; i < n; i++) {
          fx.fly("weight", from, to, {
            delay: i * 0.07, dur: 0.36, arc: 12,
            onDone: () => { fx.burst("spark", to.x, to.y + 1, to.z, 5, { spread: 1, power: 0.7 }); shadowDirty = 2; },
          });
        }
        if (n >= 3 || Math.abs(ev.scale ?? 0) >= 4) cam.leanAt = t;
        break;
      }
      case "play":
      case "spawn":
      case "revive": {
        // Landung: die Karte kommt von oben, Staub stiebt auf
        if (!ent) break;
        const row = ent.row;
        const lane = ent.lane;
        let delay = 0.2;
        if (ev.type === "play" && ent.owner === "opp" && !reduced) {
          // Das Gegenüber greift die Karte aus seiner Hand und legt sie selbst auf das Feld
          const h = puppet.carry({ x: ent.pos.x, y: ent.pos.y, z: ent.pos.z }, { x: LANE_X[lane], y: 0, z: ROW_Z[row] });
          ent.hold = { hand: h.hand, from: t + h.grab, until: t + h.drop };
          delay = h.drop + 0.08;
        } else ent.landAt = t;
        puppet.lookAt({ x: LANE_X[lane], z: ROW_Z[row] }, 1.3);
        after(delay, () => {
          if (reduced) return;
          fx.burst("dust", LANE_X[lane], 0.4, ROW_Z[row], ev.type === "play" ? 12 : 7, { spread: 6, power: 0.8 });
          if (ev.type === "play") shakeCam(0.12);
        });
        if (ev.type === "revive" && !reduced) fx.burst("ember", LANE_X[lane], 1, ROW_Z[row], 12, { spread: 4 });
        break;
      }
      case "transform":
        // Verwandlung: die Karte hebt sich und dreht sich einmal um sich selbst, Glut
        if (ent) {
          ent.spinAt = t;
          if (!reduced) fx.burst("ember", ent.pos.x, 1.5, ent.pos.z, 16, { spread: 4 });
        }
        break;
      case "submerge":
      case "surface":
        if (ent && !reduced) fx.burst("splash", ent.pos.x, 0.5, ent.pos.z, 14, { spread: 5 });
        break;
      case "buff":
        if (ent) { ent.popAt = t; if (!reduced) fx.burst("gold", ent.pos.x, 1, ent.pos.z, 8, { spread: 4 }); }
        break;
      case "heal":
        if (ent) { ent.popAt = t; if (!reduced) fx.burst("gold", ent.pos.x, 1, ent.pos.z, 5, { spread: 4 }); }
        break;
      case "debuff":
        if (ent) { ent.popAt = t; if (!reduced) fx.burst("ash", ent.pos.x, 1, ent.pos.z, 8, { spread: 4 }); }
        break;
      case "shield":
        if (ent) { ent.popAt = t; if (!reduced) fx.burst("spark", ent.pos.x, 2, ent.pos.z, 12, { spread: 3 }); }
        break;
      case "wick":
        if (ent && !reduced) fx.burst("ember", ent.pos.x + 3, 1, ent.pos.z + 3, ev.left <= 0 ? 10 : 3, { spread: 1 });
        break;
      case "hammer":
        // Der Hammer fährt vom Tischrand zur Karte und schlägt zu (Treffer nach 0,2 s)
        if (ent) {
          // Das Gegenüber hat keinen Hammer auf dem Tisch — es schlägt mit der Faust zu
          if (ent.owner === "opp") { if (!reduced) puppet.slam(ent.pos); } else {
            hammerHit.at = t;
            hammerHit.to.copy(ent.pos);
          }
          const e = ent;
          after(0.2, () => {
            e.knockAt = clock.getElapsedTime();
            e.knockX = 0;
            e.knockZ = 0.8;
            e.flashUntil = e.knockAt + 0.36;
            if (!reduced) {
              fx.burst("spark", e.pos.x, 1.5, e.pos.z, 10, { spread: 2 });
              fx.burst("dust", e.pos.x, 0.5, e.pos.z, 10, { spread: 5 });
            }
            shakeCam(0.45);
          });
        }
        break;
      case "candle":
        if (!reduced) for (const c of candles) fx.burst("ember", c.group.position.x, 12, c.group.position.z, 10, { spread: 1 });
        break;
      case "tide":
        // Der Wasserstand wechselt: es spritzt entlang der Rinne
        if (hasChannel && !reduced) for (let x = -24; x <= 24; x += 8) fx.burst("splash", x, 0.4, 0, 6, { spread: 3, power: 0.8 });
        break;
      case "battleEnd":
        candleEnd = ownerOf(ev.winner) === "me" ? "win" : "lose";
        candleEndAt = t;
        break;
      case "bossPhase": {
        // Moorwanderung: der Boss steht wieder auf — hebt beide Hände, die Maske bekommt einen glimmenden Sprung
        // (unter der Dornenkrone), dann schlagen beide Fäuste auf den Tisch und die Kerzen flackern
        if (reduced) { figure.setDecor({ crown: true, cracked: true }); shadowDirty = 2; break; }
        puppet.gesture("haende");
        after(0.45, () => {
          figure.setDecor({ crown: true, cracked: true });
          shadowDirty = 2;
          figure.head.getWorldPosition(headAt);
          fx.burst("ember", headAt.x, headAt.y, headAt.z + 8, 26, { spread: 3 });
          fx.burst("ash", headAt.x, headAt.y, headAt.z + 8, 14, { spread: 4 });
        });
        after(1.05, () => {
          puppet.slam({ x: -16, z: -30 });
          puppet.slam({ x: 16, z: -30 });
        });
        after(1.27, () => {
          shakeCam(0.9);
          for (const x of [-16, 16]) fx.burst("dust", x, 0.5, -24, 12, { spread: 5 });
          for (const c of candles) fx.burst("ember", c.group.position.x, 12, c.group.position.z, 8, { spread: 1 });
        });
        break;
      }
      default:
        break;
    }
    void durMs;
  }
  const headAt = new THREE.Vector3();

  // ── Ruhe (Phase 7) ──────────────────────────────────────────────────────
  // In Ruhe zeichnet der Tisch nur etwa 30 Bilder je Sekunde statt so vieler, wie der Bildschirm kann (bei 165 Hz
  // also ein Fünftel). Ruhe heißt: seit CALM_AFTER_S keine Eingabe, kein neuer Stand, kein Ereignis, keine
  // Kamerafahrt. Kerzen, Staub und das Atmen der Gestalt laufen dann ruhiger weiter; jede Eingabe und jedes Ereignis
  // schaltet sofort auf die volle Bildrate zurück. Spart Akku und Lüfter, vor allem auf Laptops und Handys.
  const CALM_AFTER_S = 1.5;
  const CALM_FRAME_MS = 32;
  let activeUntil = 0;
  /** Etwas passiert (gerade, oder noch so viele Sekunden lang): volle Bildrate. */
  const wake = (forS = 0) => { activeUntil = Math.max(activeUntil, clock.getElapsedTime() + CALM_AFTER_S + forS); };

  // ── Zeiger ──────────────────────────────────────────────────────────────
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const pickRoots = [cardLayer, dynamic, fixed, fire.group, ...slotMeshes, ...candles.map((c) => c.group)];
  /** Was liegt unter dem Zeiger? Handkarten zuerst (sie liegen vor dem Brett), sonst das Nächstliegende. */
  const pickAt = () => {
    if (!pointer.inside) return null;
    if (mapData) {
      const node = pathMap.pick(pointer.x, pointer.y, camera);
      if (node) return { type: "node", lv: node.lv, st: node.st };
    }
    ndc.set(pointer.x, pointer.y);
    ray.setFromCamera(ndc, camera);
    // Unsichtbares zählt nicht: der Strahl träfe sonst auch die ausgeblendete Feuerschale mitten auf dem Tisch
    const hits = ray.intersectObjects(pickRoots.filter((r) => r.visible && (stage === "battle" || r.userData.pick?.type !== "slot")), true);
    let best = null;
    for (const h of hits) {
      // Ausgeblendete Teile (z. B. Stempel des leeren Platzes gegenüber) zählen auch innerhalb einer Gruppe nicht
      let shown = true;
      for (let q = h.object; q && shown; q = q.parent) shown = q.visible;
      if (!shown) continue;
      let o = h.object;
      let pick = null;
      while (o && !pick) {
        if (o.userData.ent) {
          const ent = ents.get(o.userData.ent);
          if (ent) pick = ent.kind === "hand" ? { type: "hand", uid: ent.uid } : ent.kind === "unit" ? { type: "unit", uid: ent.uid, row: ent.row, lane: ent.lane } : ent.kind === "loose" ? { type: "loose", uid: ent.uid } : { type: "oppHand" };
        } else if (o.userData.pick) pick = o.userData.pick;
        o = o.parent;
      }
      if (!pick) continue;
      if (pick.type === "hand") return pick;
      if (!best) best = pick;
    }
    return best;
  };
  const samePick = (a, b) => (a === b) || (!!a && !!b && a.type === b.type && a.uid === b.uid && a.row === b.row && a.lane === b.lane && a.index === b.index && a.owner === b.owner && a.pile === b.pile && a.id === b.id && a.lv === b.lv && a.st === b.st);
  let lastPick = null;
  const setPointer = (e) => {
    const r = canvas.getBoundingClientRect();
    pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    pointer.y = -(((e.clientY - r.top) / r.height) * 2 - 1);
    pointer.cx = e.clientX;
    pointer.cy = e.clientY;
    pointer.inside = true;
  };
  const down = { x: 0, y: 0, timer: 0, long: false };
  /**
   * Touch (Phase 7): ohne Mauszeiger gibt es kein Drüberfahren. Das zuletzt angetippte Ding gilt deshalb für die
   * Erklärung (onHover) als „unter dem Zeiger“, bis zum nächsten Antippen — sonst sähe man am Handy nie, was die Waage,
   * ein Totem oder die Kerzen bedeuten. Angehoben wird dabei nichts (das bleibt dem echten Zeiger).
   * @type {{ pick: any, at: { x: number, y: number } } | null}
   */
  let touchTip = null;
  const onMove = (e) => { setPointer(e); wake(); };
  const onLeave = () => { pointer.inside = false; wake(); };
  const onDown = (e) => {
    setPointer(e);
    wake();
    down.x = e.clientX;
    down.y = e.clientY;
    down.long = false;
    touchTip = null;
    clearTimeout(down.timer);
    if (e.pointerType !== "mouse") {
      // Langes Drücken = ansehen (Handy)
      down.timer = window.setTimeout(() => {
        down.long = true;
        onIntent(pickAt(), "context", { x: pointer.cx, y: pointer.cy });
      }, 480);
    }
  };
  const onUp = (e) => {
    clearTimeout(down.timer);
    if (down.long || e.button !== 0) return;
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 12) return;
    setPointer(e);
    const p = pickAt();
    if (p) onIntent(p, "click");
    if (e.pointerType !== "mouse") {
      pointer.inside = false;
      touchTip = p ? { pick: p, at: { x: e.clientX, y: e.clientY } } : null;
    }
  };
  const onCancel = () => clearTimeout(down.timer);
  const onContext = (e) => {
    e.preventDefault();
    setPointer(e);
    onIntent(pickAt(), "context", { x: pointer.cx, y: pointer.cy });
  };
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerleave", onLeave);
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onCancel);
  canvas.addEventListener("contextmenu", onContext);

  // ── Tastatur und Screenreader (Phase 7) ─────────────────────────────────
  // Die Bedien-Spiegelung (TableMirror.jsx) ist eine unsichtbare Liste von Knöpfen für alles, was hier anfassbar ist.
  // Hat einer davon den Fokus, gilt sein Ziel wie „unter dem Zeiger“: die Karte hebt sich, die Erklärung erscheint.
  /** @type {any} */
  let focusPick = null;
  /** Welt-Lage eines Ziels (Karten über ihre uid, Felder über Reihe/Lane, Gegenstände über ihr pick). */
  const worldOf = (pick, out) => {
    if (!pick) return null;
    if (pick.uid) {
      const ent = ents.get(pick.uid);
      return ent ? out.copy(ent.pos) : null;
    }
    if (pick.type === "slot") return out.set(LANE_X[pick.lane], 0.1, ROW_Z[pick.row]);
    if (pick.type === "node") {
      const mk = pathMap.marks().find((x) => x.lv === pick.lv && x.st === pick.st);
      return mk ? out.copy(mk.world).setY(mk.world.y + 2) : null;
    }
    if (pick.type === "seal") { seal.stamp.getWorldPosition(out); out.y += 3.5; return out; }
    let found = null;
    for (const r of pickRoots) {
      if (found || !r.visible) continue;
      r.traverse((o) => { if (!found && o.visible && o.userData.pick && samePick(o.userData.pick, pick)) found = o; });
    }
    return found ? found.getWorldPosition(out) : null;
  };
  /** Bildschirmpunkt eines Ziels (CSS-Pixel), sonst die Bildmitte. */
  const screenOf = (pick) => {
    const r = canvas.getBoundingClientRect();
    const p = worldOf(pick, new THREE.Vector3());
    if (!p) return { x: r.left + r.width / 2, y: r.top + r.height * 0.55 };
    p.project(camera);
    return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
  };
  /** Was weiß die Szene über einen Gegenstand (für die Beschriftung der Spiegelung)? */
  const infoOf = (p) => {
    const m = model;
    switch (p.type) {
      case "deck": return { count: p.pile === "main" ? m.me.deck : null, drawable: !!ui.drawable };
      case "pool": return { count: m.pool?.count ?? 0, label: m.pool?.label || "" };
      case "bones": return { count: m.me.bones };
      case "third": return { count: m.me.third, kind: m.third };
      case "scale": return { count: m.scale };
      case "seal": return { ready: !!ui.canEnd };
      case "oppSeal": return { ready: !!ui.oppSeal };
      case "hammer": return { active: ui.hammer === "active", ready: ui.hammer === "ready" };
      case "item": return { label: m.itemNames?.[p.id] || p.id };
      case "totem": return { label: (p.owner === "me" ? m.me.totems : m.opp.totems)?.[p.index]?.label || "" };
      case "note": {
        const n = (m.notes || []).find((x) => String(x.id) === String(p.id));
        return { lines: (n?.lines || []).map((l) => (typeof l === "string" ? l : l.text)).filter(Boolean), dim: !!n?.dim };
      }
      case "choice": {
        const c = (m.choices || []).find((x) => String(x.id) === String(p.id));
        return { label: c?.label || "", chosen: String(ui.choice) === String(p.id), choosable: (ui.choosable || []).map(String).includes(String(p.id)) };
      }
      case "ware": {
        const w = (m.wares || []).find((x) => String(x.id) === String(p.id));
        return { label: w?.name || "", dim: !!w?.dim };
      }
      case "candle": return { lit: candleLit ? !!candleLit[p.index] : null };
      case "podium": return { place: p.place };
      default: return null;
    }
  };
  const targetListeners = new Set();
  let targetsQueued = false;
  /** Die Spiegelung neu lesen lassen (gebündelt auf das nächste Bild). */
  const targetsChanged = () => {
    if (targetsQueued || !targetListeners.size) return;
    targetsQueued = true;
    requestAnimationFrame(() => { targetsQueued = false; targetListeners.forEach((fn) => fn()); });
  };

  // ── Bild für Bild ───────────────────────────────────────────────────────
  const flameQ = new THREE.Quaternion();
  const tiltQ = new THREE.Quaternion();
  const WHITE = new THREE.Color(0xffffff);
  const HURT = new THREE.Color(0xff6a52);
  const WET = new THREE.Color(0x7d9fb0);
  const CHAR = new THREE.Color(0x1c1009);
  const add = new THREE.Vector3();
  const LEAN_TO = new THREE.Vector3(AT.scale[0], 16, AT.scale[1]);
  let hs = 1;

  /** Ziel-Lage einer Karte für dieses Bild (in `g`). */
  const goalOf = (ent, t) => {
    const e = ent.hover;
    if (ent.hold) {
      // In der Hand des Gegenübers: erst liegen bleiben, bis die Hand da ist, dann mit ihr mitgehen
      if (t >= ent.hold.until || reduced) ent.hold = null;
      else if (t < ent.hold.from) {
        g.pos.copy(ent.pos);
        g.quat.copy(ent.quat);
        g.scale = ent.scale;
        return;
      } else {
        const yaw = puppet.grip(ent.hold.hand, g.pos);
        flat(g.quat, yaw * 0.5, ent.kind === "unit");
        g.scale = ent.kind === "unit" ? 0.9 : OPP_SCALE;
        return;
      }
    }
    if (ent.kind === "unit") {
      g.pos.set(LANE_X[ent.lane] + ent.jx, 0.1 + e * 9 + ent.mark * 1.1, ROW_Z[ent.row] + ent.jz);
      // Landung: die Karte bleibt bis kurz vor dem Ziel angehoben und fällt dann das letzte Stück
      const land = t - ent.landAt;
      if (land >= 0 && land < 0.2) g.pos.y += 5 * (1 - land / 0.2);
      // Unter dem Zeiger dreht sich die Karte zum Betrachter (nur von der Seite, bei Zuschauern, ist das ein Winkel)
      flat(g.quat, ent.turn * (1 - e) + camYaw * e, true, e * 0.32);
      g.scale = (1 + e * 0.75) * (ent.submerged ? 0.9 : 1);
    } else if (ent.kind === "loose") {
      // Lose Karte (Draft, Totem-Wahl): liegt frei auf dem Tisch; gewählt hebt sie sich leicht an
      // etwas über der Platte: die Karten liegen quer über den eingeritzten Feldern, deren Linien sonst durchscheinen
      g.pos.set(ent.lx + ent.jx, 0.8 + e * 9 + ent.sel * 1.6, ent.lz + ent.jz);
      flat(g.quat, (ent.lry + ent.turn * 1.6) * (1 - e) + camYaw * e, ent.faceUp, e * 0.32);
      g.scale = ent.lscale * (1 + e * 0.6);
    } else if (ent.kind === "hand") {
      const off = ent.index - (ent.n - 1) / 2;
      const step = Math.min(4.5, 26 / Math.max(1, ent.n - 1));
      const lift = Math.max(e * 5.6, ent.sel * 3.4);
      v3.set(off * step * hs, (-14.3 - Math.abs(off) ** 1.5 * 0.12 + lift) * hs, -50 + ent.index * 0.12 + e * 2.5);
      g.pos.copy(camera.localToWorld(v3));
      e3.set(-0.2, 0, -off * 0.045 * (1 - Math.max(e, ent.sel)));
      g.quat.copy(camera.quaternion).multiply(tiltQ.setFromEuler(e3));
      g.scale = 0.46 * hs * (1 + Math.max(e * 0.7, ent.sel * 0.22));
    } else {
      const off = ent.index - (ent.n - 1) / 2;
      g.pos.set(AT.oppHand[0] + off * 3.4, 0.1 + ent.index * 0.05, AT.oppHand[1] + Math.abs(off) * 0.5);
      flat(g.quat, -off * 0.13, ent.faceUp);
      g.scale = 0.6;
    }
    const pop = t - ent.popAt;
    if (pop >= 0 && pop < 0.3) g.scale *= 1 + Math.sin((pop / 0.3) * Math.PI) * 0.14;
  };

  const place = (ent, t, dt) => {
    goalOf(ent, t);
    // Vergehen (0 → 1): „fade“ schrumpft weg, „burn“ verkohlt und sinkt zusammen, „tear“ reißt in zwei Hälften
    const d = ent.dyingAt ? clamp01((t - ent.dyingAt) / ent.dyingDur) : 0;
    if (d > 0) {
      if (ent.dyingKind === "stack") {
        // nach dem Draft: die Karte legt sich verdeckt auf den eigenen Stapel
        g.pos.set(AT.deck[0], 1.2 + (1 - d) * 3, AT.deck[1]);
        flat(g.quat, 0, false);
        g.scale = 1;
      } else if (ent.dyingKind === "fade") {
        g.scale *= 1 - ease(d) * 0.92;
        g.pos.y += ease(d) * 2.5;
      } else if (ent.dyingKind === "burn") g.scale *= 1 - ease(d) * 0.88;
      else g.scale *= 1 - ease(clamp01((d - 0.5) / 0.5));
    }
    if (!ent.placed || reduced) {
      ent.pos.copy(g.pos);
      ent.quat.copy(g.quat);
      ent.scale = g.scale;
      ent.placed = true;
    } else {
      // Hand straff an der Kamera, Wege über den Tisch etwas ruhiger
      const a = 1 - Math.exp(-dt * (ent.hold ? 42 : ent.kind === "hand" ? 24 : 16));
      ent.pos.lerp(g.pos, a);
      ent.quat.slerp(g.quat, a);
      ent.scale += (g.scale - ent.scale) * a;
    }
    const c = ent.card;
    // Gesten liegen ungedämpft obenauf (sonst wären Stoß und Rückstoß weich und spät)
    add.set(0, 0, 0);
    let pitch = 0;
    let roll = 0;
    let yaw = 0;
    const su = t - ent.strikeAt;
    if (su >= 0 && su < 0.52) {
      // 0–0,07 s ausholen · bis 0,2 s vorschnellen (Treffer) · kurz stehen · bis 0,52 s zurück
      const k = su < 0.07 ? -0.16 * (su / 0.07)
        : su < 0.2 ? -0.16 + 1.16 * ((su - 0.07) / 0.13) ** 2
          : su < 0.26 ? 1
            : 1 - (1 - (1 - (su - 0.26) / 0.26) ** 3);
      // Anheben über den ganzen Weg (hin und zurück); die Neigung folgt dem Anheben, sonst taucht die Vorderkante
      // beim Rückweg unter die Tischplatte
      const up = Math.sin(Math.PI * clamp01(su / 0.52));
      add.x += ent.strikeX * k;
      add.z += ent.strikeZ * k;
      add.y += ent.strikeLift * up;
      pitch += 0.16 * k * up * Math.sign(ent.strikeZ);
    }
    const ku = t - ent.knockAt;
    if (ku >= 0 && ku < 0.3) {
      const a = 1 - ku / 0.3;
      add.x += ent.knockX * a * a;
      add.z += ent.knockZ * a * a;
      roll += Math.sin(ku * 46) * 0.1 * a;
    }
    const pu = t - ent.spinAt;
    if (pu >= 0 && pu < 0.5) {
      add.y += Math.sin((Math.PI * pu) / 0.5) * 5;
      yaw += ease(pu / 0.5) * Math.PI * 2;
    }
    c.group.position.copy(ent.pos).add(add);
    c.group.quaternion.copy(ent.quat);
    if (yaw) c.group.quaternion.premultiply(qy.setFromAxisAngle(Y, yaw));
    if (pitch || roll) c.group.quaternion.multiply(tiltQ.setFromEuler(e3.set(pitch, 0, roll)));
    c.group.scale.setScalar(ent.scale);
    if (d > 0 && ent.dyingKind === "tear") {
      const h = c.tear();
      const e = ease(d);
      h[0].position.set(-e * 3.6, -e * 1.4, 0);
      h[0].rotation.z = e * 0.5;
      h[1].position.set(e * 3.6, -e * 0.5, 0);
      h[1].rotation.z = -e * 0.4;
    } else {
      c.mark.visible = ent.mark > 0.05;
      if (c.mark.visible) c.mark.scale.setScalar(0.6 + ent.mark * 0.5);
    }
    // Farbe: Treffer blitzt rot, abgetauchte Karten sind kalt und dunkler, Opfer verkohlen
    if (c.frontMat.map) {
      c.frontMat.color.copy(ent.submerged ? WET : WHITE);
      if (ent.flashUntil > t) c.frontMat.color.lerp(HURT, clamp01((ent.flashUntil - t) / 0.36));
      if (d > 0 && ent.dyingKind === "burn") c.frontMat.color.lerp(CHAR, Math.min(1, d * 1.6));
      if (ent.kind === "loose" && ent.dim) c.frontMat.color.lerp(CHAR, 0.55);
    }
    // Kontaktschatten: nur nah am Tisch, wandert mit der Höhe leicht weg und wird blasser
    const h = ent.pos.y;
    const near = clamp01(1 - h / 16);
    c.shadow.visible = near > 0.02 && ent.kind !== "hand";
    if (c.shadow.visible) {
      c.shadow.position.set(ent.pos.x + 0.25 + h * 0.12, 0.03, ent.pos.z + 0.35 + h * 0.1);
      c.shadow.rotation.z = ent.kind === "unit" ? ent.turn : 0;
      c.shadow.scale.setScalar(ent.scale * (1 + h * 0.03));
      c.shadow.material.opacity = 0.62 * near * (ent.dyingAt ? 1 - clamp01((t - ent.dyingAt) / ent.dyingDur) : 1);
    }
  };

  let last = 0;
  const frame = (nowMs) => {
    // In Ruhe nur jedes ~32. ms ein Bild (siehe „Ruhe“); last bleibt stehen, damit dt die Lücke mitzählt
    if (move.done && clock.getElapsedTime() > activeUntil && nowMs - last < CALM_FRAME_MS) return;
    const dt = Math.min(0.1, (nowMs - last) / 1000 || 0.016);
    last = nowMs;
    const t = clock.getElapsedTime();

    // Kamerafahrt zwischen den Blicken
    if (!move.done) {
      const k = reduced ? 1 : Math.min(1, (t - move.t0) / MOVE_S);
      const e = ease(k);
      base.pos.lerpVectors(move.from.pos, goal.pos, e);
      base.quat.slerpQuaternions(move.from.quat, goal.quat, e);
      base.fov = move.from.fov + (goal.fov - move.from.fov) * e;
      if (k >= 1) move.done = true;
    }
    // Ganz leichtes Mitgehen mit der Maus — straff geführt, damit das Bild nicht „schwimmt“
    const follow = Math.min(1, dt * 10);
    pointer.sx += ((pointer.inside ? pointer.x : 0) - pointer.sx) * follow;
    pointer.sy += ((pointer.inside ? pointer.y : 0) - pointer.sy) * follow;
    camera.position.copy(base.pos);
    // Vorbeugen zur Waage bei schweren Treffern, kurzes Zittern bei Einschlägen
    const le = t - cam.leanAt;
    if (le >= 0 && le < 1) camera.position.lerp(LEAN_TO, 0.085 * Math.sin(Math.PI * le));
    const sh = t - cam.shakeAt;
    if (sh >= 0 && sh < 0.22) {
      const a = cam.shakeAmt * (1 - sh / 0.22);
      camera.position.x += Math.sin(t * 95) * a;
      camera.position.y += Math.cos(t * 81) * a * 0.7;
    } else cam.shakeAmt = 0;
    e3.set(reduced ? 0 : pointer.sy * 0.004, reduced ? 0 : -pointer.sx * 0.007, 0);
    // Eigene Geste: man sieht sich selbst nicht, also bewegt sich der Blick — nicken, Kopf schütteln, verbeugen
    const gs = t - self.at;
    if (!reduced && gs >= 0 && gs < 1.2) {
      if (self.kind === "nicken" && gs < 0.9) e3.x -= 0.05 * Math.sin((gs / 0.9) * Math.PI * 4) ** 2 * (1 - (gs / 0.9) * 0.4);
      else if (self.kind === "kopfschuetteln" && gs < 1) e3.y += 0.06 * Math.sin(gs * Math.PI * 5) * (1 - gs);
      else if (self.kind === "verbeugen") {
        const k = Math.sin((Math.PI * gs) / 1.2);
        e3.x -= 0.12 * k;
        camera.position.y -= 7 * k;
        camera.position.z -= 5 * k;
      } else if (self.kind === "haende" && gs < 1) {
        const k = Math.sin(Math.PI * gs);
        camera.position.y += 3.5 * k;
        camera.position.z += 4 * k;
      }
    }
    camera.quaternion.copy(base.quat).multiply(tiltQ.setFromEuler(e3));
    camera.fov = base.fov;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    // Die Hand hängt an der Kamera und ist für 44° Bildwinkel ausgelegt; bei anderem Winkel in der Bildebene mitskalieren
    hs = Math.tan(THREE.MathUtils.degToRad(base.fov) / 2) / Math.tan(THREE.MathUtils.degToRad(44) / 2);

    // Was liegt unter dem Zeiger?
    const pick = focusPick || pickAt();
    hovered = pick && (pick.type === "hand" || pick.type === "unit" || pick.type === "loose") ? ents.get(pick.uid) || null : null;
    if (mapData) {
      pathMap.setHover(pick?.type === "node" ? { lv: pick.lv, st: pick.st } : null);
      pathMap.update(t, reduced);
    }
    const tipPick = pick || touchTip?.pick || null;
    if (!samePick(tipPick, lastPick)) {
      lastPick = tipPick;
      onHover(tipPick, focusPick ? screenOf(focusPick) : pick || !touchTip ? { x: pointer.cx, y: pointer.cy } : touchTip.at);
    }
    canvas.style.cursor = pick && !["candle", "oppHand", "oppItem", "oppDeck", "oppSeal", "hourglass", "pool", "fire"].includes(pick.type) && !(pick.type === "note" && !pick.click) ? "pointer" : "default";

    // Karten
    const rate = reduced ? 1 : Math.min(1, dt * 20);
    for (const ent of ents.values()) {
      ent.hover += ((ent === hovered ? 1 : 0) - ent.hover) * rate;
      ent.sel += ((ui.selected === ent.uid || pickedSet.has(ent.uid) ? 1 : 0) - ent.sel) * rate;
      ent.mark += ((markedSet.has(ent.uid) ? 1 : 0) - ent.mark) * rate;
      place(ent, t, dt);
    }
    if (dying.length) {
      dying = dying.filter((ent) => {
        if (t - ent.dyingAt >= ent.dyingDur) { removeEnt(ent); return false; }
        ent.hover += (0 - ent.hover) * rate;
        place(ent, t, dt);
        return true;
      });
    }

    // Markierungen ein- und ausblenden; ziehbare Stapel „atmen“
    const breathe = reduced ? 1 : 0.82 + Math.sin(t * 3.2) * 0.18;
    for (const k in rings) {
      const r = rings[k];
      r.level += (r.goal - r.level) * (reduced ? 1 : Math.min(1, dt * 10));
      // Feld, auf das jemand zeigt: pulsiert kurz, unabhängig davon, was sonst wählbar ist
      const shown = pointed.key === k && t < pointed.until ? Math.max(r.level, reduced ? 0.9 : 0.72 + 0.28 * Math.sin(t * 10)) : r.level;
      r.mesh.visible = shown > 0.01;
      if (r.mesh.visible) r.mat.opacity = shown * (k === "deck" || k === "sideDeck" ? breathe : 1);
    }

    // Gewählter Totem-Kopf (Totem-Wahl) hebt sich an
    if (built.choices && model?.choices) {
      built.choices.objs.forEach((o, i) => {
        const want = String(ui.choice) === String(model.choices[i]?.id) ? 2.4 : 0;
        if (Math.abs(o.group.position.y - want) < 0.01) return;
        o.group.position.y += (want - o.group.position.y) * (reduced ? 1 : Math.min(1, dt * 12));
        shadowDirty = 2;
      });
    }

    // Hinsetzen: aus dem Dunkel heran und herauf; das Licht vor ihr wächst mit
    if (sit.now !== sit.goal) {
      sit.now += Math.sign(sit.goal - sit.now) * Math.min(Math.abs(sit.goal - sit.now), reduced ? 1 : dt / 0.9);
      const k = ease(sit.now);
      figure.group.position.y = -30 * (1 - k);
      figure.group.position.z = -74 - 16 * (1 - k);
      figureLight.intensity = 260 + 740 * k;
      shadowDirty = 2;
    }
    figure.group.visible = sit.now > 0.01;
    // Die Gestalt: Hände, Kopf, Oberkörper
    if (figure.group.visible && puppet.update(dt, t, reduced)) shadowDirty = 2;
    // Die eigenen Hände: nur während einer Geste im Bild
    for (const mh of myHands) {
      let goal = mh.hidden;
      if (!reduced && gs >= 0) {
        if (self.kind === "klopfen" && mh.ws === 1 && gs < 0.8) {
          // hoch, zweimal mit den Knöcheln auf den Tisch (0,26 s und 0,48 s — dazu der Klang), zurück
          const y = gs < 0.2 ? 5 : gs < 0.27 ? 0.9 : gs < 0.42 ? 3.6 : gs < 0.49 ? 0.9 : 3;
          goal = { x: 36, y, z: 45, yaw: Math.PI, pitch: 0.15, curl: 1, point: 0 };
        } else if (self.kind === "haende" && gs < 1.1) {
          goal = { x: mh.ws * 33, y: 12, z: 46, yaw: Math.PI, pitch: -1.2, curl: 0, point: 0 };
        } else if (self.kind === "zeigen" && self.target && gs < 1.4 && mh.ws === (self.target.x < 0 ? -1 : 1)) {
          const hx = self.target.x * 0.55 + mh.ws * 9;
          // Drehung auf 0…2π bringen: sonst dreht sich die Hand links der Mitte einmal ganz herum (π → −π)
          const yaw = (Math.atan2(self.target.x - hx, self.target.z - 40) + Math.PI * 2) % (Math.PI * 2);
          goal = { x: hx, y: 8, z: 40, yaw, pitch: 0.18, curl: 1, point: 1 };
        }
      }
      const c = mh.cur;
      const a = 1 - Math.exp(-dt * (goal === mh.hidden ? 10 : 26));
      for (const k in c) c[k] += (goal[k] - c[k]) * a;
      const show = c.y > -13;
      if (show || mh.obj.group.visible) shadowDirty = 2;
      mh.obj.group.visible = show;
      if (!show) continue;
      mh.obj.group.position.set(c.x, c.y, c.z);
      mh.obj.group.rotation.set(c.pitch, c.yaw, 0);
      poseHand(mh.obj, [0, 1, 2, 3].map((f) => (f === mh.obj.index ? c.curl * (1 - c.point) : c.curl)));
    }
    const osp = t - oppSealPressAt;
    if (osp >= 0 && osp < 0.42) {
      const d = Math.sin((osp / 0.42) * Math.PI);
      oppSeal.stamp.position.set(oppSealHome.x - 5 * d, oppSealHome.y + (osp < 0.21 ? 2.5 * d : 0.4 * d), oppSealHome.z + 0.2 * d);
      shadowDirty = 2;
    } else if (oppSeal.stamp.position.x !== oppSealHome.x) {
      oppSeal.stamp.position.copy(oppSealHome);
      shadowDirty = 2;
    }

    // Stundenglas: der Sand zeigt die Zugzeit; beim Zugwechsel dreht es sich um. Die Sekunden liegen daneben,
    // unter 10 s glimmt der Sand und das Gegenüber trommelt mit den Fingern.
    {
      let frac = 0.5;
      let running = false;
      let secs = -1;
      if (timer) {
        const rem = timer.paused ? timer.remaining : Math.max(0, timer.endsAt - performance.now());
        frac = clamp01(rem / timer.total);
        running = !timer.paused && rem > 0;
        secs = Math.ceil(rem / 1000);
      }
      const fl = t - flipAt;
      const flipping = !reduced && fl >= 0 && fl < 0.5;
      if (flipping) {
        // Der Rest läuft durch, das Glas dreht sich — danach ist oben wieder voll
        sandShown += (0 - sandShown) * Math.min(1, dt * 14);
        hourglass.body.rotation.z = Math.PI * ease(fl / 0.5);
        shadowDirty = 2;
      } else {
        if (hourglass.body.rotation.z !== 0) { hourglass.body.rotation.z = 0; sandShown = 1 - sandShown; shadowDirty = 2; }
        sandShown += (frac - sandShown) * (reduced ? 1 : Math.min(1, dt * 5));
      }
      hourglass.setSand(sandShown, running && !flipping);
      const low = running && secs <= 10;
      rm.sand.emissive.setHex(low ? 0xff5a1e : 0x000000);
      rm.sand.emissiveIntensity = low ? 0.45 + (reduced ? 0 : 0.3 * Math.sin(t * 7)) : 0;
      puppet.setMood({ hurry: low && !!model?.oppTurn });
      // Zahlen bleiben Zahlen: die Sekunden liegen als Zettel neben dem Glas (von oben sieht man den Sand kaum)
      const shownSecs = timer ? String(secs) : "";
      rebuild("timerTag", shownSecs, () => (shownSecs ? [at(makeTag(shownSecs), AT.hourglass[0] + 1.5, AT.hourglass[1] + 9.5, -0.1)] : []));
    }

    // Siegelstempel: drückt beim Zugende ins Wachs
    const sp = t - sealPressAt;
    if (sp >= 0 && sp < 0.5) {
      const d = Math.sin((sp / 0.5) * Math.PI);
      seal.stamp.position.set(sealHome.x - 5 * d, sealHome.y + (sp < 0.25 ? 2.5 * d : 0.4 * d), sealHome.z + 0.2 * d);
      shadowDirty = 2;
    } else if (seal.stamp.position.x !== sealHome.x) {
      seal.stamp.position.copy(sealHome);
      shadowDirty = 2;
    }
    // Hammer: liegt, schwebt bereit über dem Tisch — oder schlägt gerade zu
    const hu = t - hammerHit.at;
    if (hu >= 0 && hu < 0.66 && !reduced) {
      // 0–0,16 s hin (Kopf über der Karte, ausgeholt) · 0,2 s Schlag · kurz liegen · zurück
      const k = hu < 0.16 ? ease(hu / 0.16) : hu < 0.32 ? 1 : 1 - ease((hu - 0.32) / 0.34);
      const swing = hu < 0.16 ? ease(hu / 0.16) : hu < 0.2 ? 1 - (hu - 0.16) / 0.04 : 0;
      const high = hu < 0.16 ? 8 * k : hu < 0.2 ? 8 - 7 * ((hu - 0.16) / 0.04) : hu < 0.32 ? 1 : 1 + 4 * (1 - k);
      hammer.group.position.set(
        AT.hammer[0] + (hammerHit.to.x - AT.hammer[0]) * k,
        high * Math.min(1, k * 4),
        AT.hammer[1] + (hammerHit.to.z + 5 - AT.hammer[1]) * k,
      );
      hammer.group.rotation.set(0.7 * swing, 0.5 * (1 - k), 0);
      hammerHit.moving = true;
      shadowDirty = 2;
    } else {
      if (hammerHit.moving) {
        hammerHit.moving = false;
        hammer.group.position.set(AT.hammer[0], 0, AT.hammer[1]);
        hammer.group.rotation.set(0, 0.5, 0);
        shadowDirty = 2;
      }
      const hy = ui.hammer === "active" ? 5 : 0;
      if (Math.abs(hammer.group.position.y - hy) > 0.01) {
        hammer.group.position.y += (hy - hammer.group.position.y) * (reduced ? 1 : Math.min(1, dt * 12));
        hammer.group.rotation.z = hammer.group.position.y * 0.05;
        shadowDirty = 2;
      }
    }

    // Kerzen flackern — unruhiger, wenn die Waage kurz vor dem Kippen steht; am Kampfende flammen sie auf
    // (gewonnen) oder verlöschen (verloren)
    const tense = !!model && Math.abs(model.scale) >= 4 && !candleEnd;
    let endLight = 1;
    let endFlame = 1;
    if (candleEnd === "lose") {
      const k = reduced ? 1 : clamp01((t - candleEndAt) / 0.9);
      endLight = 1 - k * 0.94;
      endFlame = Math.max(0.001, 1 - k);
    } else if (candleEnd === "win") {
      const k = reduced ? 1 : clamp01((t - candleEndAt) / 0.5);
      endLight = 1 + 0.45 * k;
      endFlame = 1 + 0.5 * k;
    }
    key.intensity = 2.1 * (candleLit ? 0.6 : candleEnd === "lose" ? 0.35 + 0.65 * endLight : tense ? 0.88 : 1);
    for (const [ci, c] of candles.entries()) {
      if (candleLit) {
        // einzeln geschaltet: sanft an- oder ausgehen
        c.on += ((candleLit[ci] ? 1 : 0) - c.on) * (reduced ? 1 : Math.min(1, dt * 4));
        endLight = c.on;
        endFlame = Math.max(0.001, c.on);
      }
      if (!reduced) {
        if (t > c.next) {
          c.goal = (tense ? 0.6 : 0.8) + Math.random() * (tense ? 0.6 : 0.3);
          c.next = t + 0.06 + Math.random() * (tense ? 0.12 : 0.25);
        }
        c.flick += (c.goal - c.flick) * 0.35;
        c.flame.material.uniforms.uTime.value = t;
      }
      // Ist das Gegenüber weg (Verbindung verloren), flackert die Kerze an seiner Seite unruhig und klein
      const gutter = oppAway && c === candles[1] && !candleEnd;
      c.flame.material.uniforms.uWild.value = tense || gutter ? 1 : 0;
      c.flame.scale.setScalar(endFlame * (gutter ? 0.55 : 1));
      c.light.intensity = 2400 * c.base * c.flick * endLight * (gutter ? 0.4 : 1);
      c.group.getWorldQuaternion(flameQ).invert();
      c.flame.quaternion.copy(flameQ.multiply(camera.quaternion));
    }
    if (fire.group.visible) {
      for (const f of fire.flames) {
        if (!reduced) f.material.uniforms.uTime.value = t;
        fire.group.getWorldQuaternion(flameQ).invert();
        f.quaternion.copy(flameQ.multiply(camera.quaternion));
      }
      fire.light.intensity = 2600 * (reduced ? 1 : 0.85 + 0.15 * Math.sin(t * 9.3) * Math.sin(t * 4.1));
    }
    if (balance.update(dt, t, reduced)) shadowDirty = 2;
    if (water.visible) {
      // Wasserband: Breite folgt dem Stand, dazu ein kaum merkliches Atmen
      tideLevel.now += (tideLevel.goal - tideLevel.now) * (reduced ? 1 : Math.min(1, dt * 1.6));
      water.scale.y = 0.9 + tideLevel.now * 3.3 + (reduced ? 0 : Math.sin(t * 1.3) * 0.06);
      water.material.opacity = 0.6 + tideLevel.now * 0.3;
    }
    // Teilchen, fliegende Knochen und Gewichte; verzögerte Schritte; Knochenhaufen nach der Landung nachziehen
    fx.update(dt);
    if (lifeSeal) stepLifeSeal(t);
    if (podium) stepPodium(t);
    if (later.length) {
      const due = later.filter((l) => l.at <= t);
      if (due.length) {
        later = later.filter((l) => l.at > t);
        for (const l of due) l.fn();
      }
    }
    if (bonesHold && t >= bonesHold) {
      bonesHold = 0;
      if (model) syncBones(model);
    }
    // Das Licht folgt dem, der am Zug ist: die eigene Tischhälfte ist dann eine Spur heller
    const tz = model && !model.myTurn ? -10 : 8;
    key.target.position.z += (tz - key.target.position.z) * (reduced ? 1 : Math.min(1, dt * 2));

    if (!reduced) {
      for (let i = 0; i < DUST; i++) {
        for (let k = 0; k < 3; k++) dustPos[i * 3 + k] += dustVel[i * 3 + k] * dt;
        if (dustPos[i * 3 + 1] > 52 || dustPos[i * 3 + 1] < 3) dustVel[i * 3 + 1] *= -1;
        if (Math.abs(dustPos[i * 3]) > 90) dustVel[i * 3] *= -1;
        if (Math.abs(dustPos[i * 3 + 2]) > 60) dustVel[i * 3 + 2] *= -1;
      }
      dust.geometry.attributes.position.needsUpdate = true;
    }
    if (shadowDirty > 0) { key.shadow.needsUpdate = true; shadowDirty--; }
    renderer.render(scene, camera);
  };
  renderer.setAnimationLoop(frame);

  return {
    sync,
    setUi,
    play,
    setPose,
    whenReady,
    /** Stempel ins Wachs drücken (Zug beendet). */
    pressSeal() { sealPressAt = clock.getElapsedTime(); after(0.12, () => onSound("seal")); },
    /** Das Gegenüber drückt seinen Stempel ins Wachs (Lobby: es ist bereit). */
    oppStamp() {
      wake(1);
      if (sit.goal !== 1) return;
      if (reduced) { onSound("seal"); return; }
      const d = puppet.stamp({ x: AT.oppSeal[0] - 1.5, z: AT.oppSeal[1] });
      oppSealPressAt = clock.getElapsedTime() + d - 0.08;
      after(Math.max(0, d - 0.05), () => onSound("seal"));
    },
    /**
     * Ein Lebenssiegel bricht (Moorwanderung): Wachssiegel fällt auf den Tisch und springt in zwei Hälften (3 s).
     * Bei „Animationen reduzieren“ liegt es gleich gebrochen da. @param {{ x?: number, z?: number }} [at]
     */
    lifeSealBreak(at = {}) {
      wake(3.5);
      if (disposed) return;
      dropLifeSeal();
      const made = makeLifeSeal();
      scene.add(made.group);
      const now = clock.getElapsedTime();
      lifeSeal = { ...made, t0: reduced ? now - 1.45 : now, x: at.x ?? 0, z: at.z ?? 8, landed: reduced, cracked: false };
    },
    setReduced(v) { reduced = !!v; },
    /**
     * Anderer Zirkel am stehenden Tisch (Hauptmenü → Übung im Gezeiten-Zirkel, Gastgeber wechselt in der Lobby):
     * Holz und eingeritzte Felder werden ausgetauscht, alles andere bleibt liegen.
     * @param {string} z
     */
    setZirkel(z) {
      const next = z || "moor";
      if (next === zirkel || disposed) return;
      zirkel = next;
      const oldWood = wood;
      wood = woodFor(zirkel);
      table.material.map = wood.map;
      table.material.roughnessMap = wood.rough;
      table.material.needsUpdate = true;
      oldWood.map.dispose();
      oldWood.rough.dispose();
      const channel = zirkel === "gezeiten";
      if (channel !== hasChannel) {
        hasChannel = channel;
        const oldBoard = board.texture;
        board = boardTexture(hasChannel);
        decal.material.map = board.texture;
        decal.material.needsUpdate = true;
        oldBoard.dispose();
        water.visible = hasChannel && !!model && model.tide !== null;
      }
      shadowDirty = 2;
    },
    /**
     * Alles, was man gerade anfassen oder ansehen kann — für die Bedien-Spiegelung (Tastatur, Screenreader).
     * group: brett | hand | auslage | karte | tisch · pick: wie beim Anklicken · info/state: was die Beschriftung braucht.
     */
    targets() {
      const out = [];
      const m = model;
      if (!m || !ready) return out;
      const targetsSet = new Set(ui.targets || []);
      if (stage === "battle") {
        // Brett: 16 Plätze, von der hinteren Reihe gegenüber bis zur eigenen hinteren Reihe
        for (const row of ROWS) for (let lane = 0; lane < 4; lane++) {
          const u = m.units.find((x) => x.row === row && x.lane === lane);
          out.push({
            group: "brett",
            pick: u ? { type: "unit", uid: u.uid, row, lane } : { type: "slot", row, lane },
            info: u ? { card: u.card, attack: u.attack, health: u.health, maxHealth: u.maxHealth, submerged: !!u.submerged } : null,
            state: { target: targetsSet.has(`${row}:${lane}`), marked: !!u && markedSet.has(u.uid) },
          });
        }
      }
      m.hand.forEach((card) => out.push({ group: "hand", pick: { type: "hand", uid: card.uid }, info: { card }, state: { selected: ui.selected === card.uid, marked: markedSet.has(card.uid) } }));
      const pickable = new Set(ui.pickable || []);
      [...(m.loose || [])].sort((a, b) => (Math.abs(a.z - b.z) > 6 ? a.z - b.z : a.x - b.x)).forEach((c) => out.push({
        group: "auslage",
        pick: { type: "loose", uid: c.uid },
        info: { card: c.faceUp === false ? null : c.card, dim: !!c.dim },
        state: { pickable: pickable.has(c.uid), selected: ui.selected === c.uid || pickedSet.has(c.uid) },
      }));
      if (mapData) for (const mk of pathMap.marks()) out.push({ group: "karte", pick: { type: "node", lv: mk.lv, st: mk.st }, info: { node: mk.type, level: mk.lv }, state: { option: mk.option, done: mk.onRoute } });
      if ((m.oppHand || []).length) out.push({ group: "tisch", pick: { type: "oppHand" }, info: { count: m.oppHand.length } });
      const seen = new Set();
      for (const r of pickRoots) {
        if (!r.visible) continue;
        r.traverse((o) => {
          const p = o.userData.pick;
          if (!p || p.type === "slot") return;
          for (let q = o; q; q = q.parent) if (!q.visible) return;
          const k = JSON.stringify(p);
          if (seen.has(k)) return;
          seen.add(k);
          out.push({ group: "tisch", pick: p, info: infoOf(p) });
        });
      }
      return out;
    },
    /** Die Spiegelung meldet sich an, um nach jedem neuen Stand neu zu lesen. @param {() => void} fn */
    subscribeTargets(fn) {
      targetListeners.add(fn);
      return () => targetListeners.delete(fn);
    },
    /** Fokus der Spiegelung: das Ziel gilt wie unter dem Zeiger (null = Zeiger zählt wieder). */
    setFocus(pick) { focusPick = pick || null; wake(); },
    /** Ein Ziel per Tastatur auslösen — dieselben Rückrufe wie ein Klick bzw. Rechtsklick. */
    trigger(pick, how = "click") {
      if (!pick) return;
      wake();
      onIntent(pick, how, screenOf(pick));
    },
    /** Bildschirmpunkt eines Ziels (für Prüfskripte und die Spiegelung). */
    screenOf,
    /** Wer bedient gerade? Jede Phase (Draft, Totem-Wahl, Kampf) setzt ihre eigenen Rückrufe. */
    setHandlers(h) {
      onIntent = h?.onIntent || (() => {});
      onHover = h?.onHover || (() => {});
      lastPick = null;
      wake();
      touchTip = null;
    },
    /**
     * Das Gegenüber nimmt eine lose Karte (Draft): seine Hand greift sie dort, wo sie lag, und steckt sie zu den
     * eigenen. Nach sync() aufrufen — die Karte liegt dann schon als letzte in seiner Hand.
     * @param {string} uid
     */
    oppTake(uid) {
      wake(1);
      const from = lastLoose.get(uid);
      lastLoose.delete(uid);
      dying = dying.filter((e) => { if (e.uid !== uid) return true; removeEnt(e); return false; });
      if (!from || !model || reduced) return;
      const card = ents.get(`opp#${model.oppHand.length - 1}`);
      if (!card) return;
      const t = clock.getElapsedTime();
      card.pos.copy(from);
      card.scale = 1;
      flat(card.quat, 0, card.faceUp);
      card.placed = true;
      const off = card.index - (card.n - 1) / 2;
      const h = puppet.carry({ x: from.x, y: 0.3, z: from.z }, { x: AT.oppHand[0] + off * 3.4, y: 0.4, z: AT.oppHand[1] }, { reach: 0.22, move: 0.32 });
      card.hold = { hand: h.hand, from: t + h.grab, until: t + h.drop };
      puppet.lookAt(from, 1.2);
      after(h.grab, () => onSound("draw"));
    },
    get pose() { return poseName; },
    /** Maske der Gestalt gegenüber (Kennung aus ../masks.js). */
    setMask(id) { figure.setMask(id); shadowDirty = 2; },
    /** Schmuck der Gestalt (Moorwanderung: Bosse tragen eine Dornenkrone, in Phase 2 mit Sprung in der Maske). */
    setDecor(d) { figure.setDecor(d || null); shadowDirty = 2; },
    /**
     * Zugzeit für das Stundenglas. `key` wechselt mit jedem neuen Zug (dann dreht sich das Glas um).
     * @param {{ remaining: number, total: number, paused?: boolean, key: string } | null} tm  Zeiten in ms
     */
    setTimer(tm) {
      const k = tm ? tm.key : "";
      if (k !== timerKey) {
        if (timerKey && tm) flipAt = clock.getElapsedTime();
        timerKey = k;
      }
      timer = tm ? { endsAt: performance.now() + tm.remaining, total: Math.max(1, tm.total), paused: !!tm.paused, remaining: tm.remaining } : null;
    },
    /**
     * Ist das Gegenüber gerade nicht verbunden? Die Gestalt sackt zusammen, ihre Kerze flackert.
     * seated = false: niemand sitzt gegenüber (Hauptmenü, Lobby vor dem Beitritt) — Gestalt und ihr Stempel fehlen.
     */
    setPresence({ away, seated = true, instant = false }) {
      wake(1);
      oppAway = !!away;
      puppet.setMood({ away: oppAway });
      // Hinsetzen bzw. Aufstehen: die Gestalt kommt aus dem Dunkel an den Tisch (siehe sit im Bildtakt)
      sit.goal = seated ? 1 : 0;
      if (instant || reduced) sit.now = sit.goal;
      oppSeal.group.visible = seated;
      shadowDirty = 2;
    },
    /**
     * Eine der sechs Gesten spielen. who = "opp": die Gestalt führt sie aus · "me": die eigene (Blick und Klang).
     * @param {string} id @param {"me" | "opp"} who @param {{ row: string, lane: number } | null} [target]
     */
    gesture(id, who, target = null) {
      wake(1.5);
      const t = clock.getElapsedTime();
      const ok = target && ROW_Z[target.row] !== undefined && LANE_X[target.lane] !== undefined;
      const P = ok ? { x: LANE_X[target.lane], y: 1, z: ROW_Z[target.row] } : null;
      if (P) { pointed.key = `${target.row}:${target.lane}`; pointed.until = t + 1.6; }
      if (who === "opp") {
        oppGestures += 1;
        lastGesture = `${id}${P ? `@${pointed.key}` : ""}`;
        puppet.gesture(id, P);
        return;
      }
      self.kind = id;
      self.at = t;
      self.target = P ? { x: P.x, z: P.z } : null;
      if (id === "klopfen") {
        for (const d of [0.26, 0.48]) {
          after(d, () => {
            onSound("knock");
            shakeCam(0.22);
            if (!reduced) fx.burst("dust", 36, 0.4, 38, 5, { spread: 2, power: 0.6 });
          });
        }
      }
    },
    /**
     * Wo liegt etwas auf dem Bildschirm (CSS-Pixel)? Für Tests und später für Tastatur-/Screenreader-Bedienung.
     * @param {{ type: "card", uid: string } | { type: "hand", index: number } | { type: "slot", row: string, lane: number }
     *   | { type: "item", index: number } | { type: "deck" | "sideDeck" | "seal" | "hammer" | "scale" }} what
     */
    locate(what) {
      const p = new THREE.Vector3();
      if (what.type === "card" || what.type === "hand" || what.type === "loose") {
        // lose Karten von links nach rechts gezählt
        const ent = what.type === "card" ? ents.get(what.uid)
          : what.type === "loose" ? [...ents.values()].filter((e) => e.kind === "loose").sort((a, b) => a.lx - b.lx)[what.index]
            : [...ents.values()].find((e) => e.kind === "hand" && e.index === what.index);
        if (!ent) return null;
        p.copy(ent.pos);
      } else if (what.type === "slot") p.set(LANE_X[what.lane], 0.1, ROW_Z[what.row]);
      else if (what.type === "item") p.set(37, 2, -8 + what.index * 9.5);
      else if (what.type === "totem") p.set(-72 + what.index * 11, 5, 13 - what.index * 2);
      else if (what.type === "node") {
        const q = pathMap.nodeNdc(what.lv, what.st, camera);
        if (!q) return null;
        const rc = canvas.getBoundingClientRect();
        // nodeNdc zeigt über die Marke (für die Vorschau) — zum Anklicken ein Stück tiefer, auf die Marke selbst
        return { x: rc.left + ((q.x + 1) / 2) * rc.width, y: rc.top + ((1 - q.y) / 2) * rc.height + 14 };
      } else if (what.type === "note" || what.type === "ware") {
        const n = ((what.type === "note" ? model?.notes : model?.wares) || []).find((x) => String(x.id) === String(what.id));
        if (!n) return null;
        p.set(n.x, what.type === "ware" ? 3 : 0.2, n.z);
      } else if (what.type === "candle") {
        // Mitte des Wachses — die Kerze brennt mit den Zügen herunter
        const c = candles[what.index || 0];
        p.set(c.group.position.x, 0.9 + c.body.scale.y * 0.5, c.group.position.z);
      }
      else if (what.type === "choice") {
        const c = (model?.choices || []).find((x) => String(x.id) === String(what.id));
        if (!c) return null;
        p.set(c.x, 6, c.z);
      }
      // Stempel: auf den Griff (die Mitte des Gegenstands liegt in der Luft zwischen Wachs und Griff)
      else if (what.type === "seal") { seal.stamp.getWorldPosition(p); p.y += 3.5; }
      else if (AT[what.type]) p.set(AT[what.type][0], what.type === "seal" ? 3 : 1, AT[what.type][1]);
      else return null;
      p.project(camera);
      const r = canvas.getBoundingClientRect();
      return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
    },
    /** Was läge unter diesem Bildschirmpunkt (CSS-Pixel)? Für Prüfskripte. */
    pickAtScreen(x, y) {
      const r = canvas.getBoundingClientRect();
      const keep0 = { ...pointer };
      pointer.x = ((x - r.left) / r.width) * 2 - 1;
      pointer.y = -((y - r.top) / r.height) * 2 + 1;
      pointer.inside = true;
      const p = pickAt();
      Object.assign(pointer, keep0);
      return p;
    },
    /** Kennzahlen für Messungen (nur Entwicklung). */
    stats() {
      return {
        frames: renderer.info.render.frame, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries, cards: ents.size,
        mask: figure.mask, decor: figure.decor, away: oppAway, lifeSeal: lifeSeal ? (lifeSeal.cracked ? "gebrochen" : "ganz") : null, podium: (model?.podium || []).length, seated: sit.goal === 1, sat: sit.now, zirkel, totems: (model?.me?.totems || []).length, pose: poseName, oppGestures, lastGesture,
        candles: candleLit, map: mapData ? { level: mapData.pp?.level ?? 0, levels: mapData.map.levels, done: !!mapData.pp?.done } : null, stage, notes: (model?.notes || []).filter((n) => n.click).map((n) => n.id), picked: pickedSet.size, loose: [...ents.values()].filter((e) => e.kind === "loose").length, hand: [...ents.values()].filter((e) => e.kind === "hand").length,
        oppHand: [...ents.values()].filter((e) => e.kind === "opp").length, pickable: (ui.pickable || []).length, choosable: (ui.choosable || []).length, canEnd: !!ui.canEnd,
        timerSecs: timer ? Math.ceil((timer.paused ? timer.remaining : Math.max(0, timer.endsAt - performance.now())) / 1000) : null,
      };
    },
    dispose() {
      disposed = true;
      ready = false;
      dropLifeSeal();
      renderer.setAnimationLoop(null);
      ro.disconnect();
      clearTimeout(down.timer);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onCancel);
      canvas.removeEventListener("contextmenu", onContext);
      for (const ent of [...ents.values(), ...dying]) removeEnt(ent);
      ents.clear();
      for (const b of Object.values(built)) for (const o of b.objs) o.dispose?.();
      fx.dispose();
      pathMap.dispose();
      kit.dispose();
      scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      for (const d of disposables) d.dispose?.();
      wood.map.dispose();
      wood.rough.dispose();
      board.texture.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
