// Dunkles Labyrinth in der Ego-Perspektive (three.js) — Dungeon-Crawler-Steuerung:
// W/S bzw. Pfeil hoch/runter = Schritt vor/zurück, A/D bzw. Pfeil links/rechts = 90° drehen,
// Q/E = seitwärts, Leertaste/Enter = aufheben. Jeder Schritt ist ein Feld — der Server sieht
// exakt dieselben Züge (oben/unten/links/rechts) wie bei der Draufsicht (useMazeStepper).
//
// Fairness: Nebel endet genau am Lichtradius des Spiels (state.lightRadius) — man sieht in
// 3D nicht weiter als in der Draufsicht. Die Minikarte zeigt nur, was man selbst schon im
// Licht hatte, und Gegenstände/Mitspieler nur, solange sie im Licht sind.
//
// Kartenbilder kommen über /api/clash/card-img/<id> (Server reicht Supercells CDN durch,
// das selbst keinen CORS-Header für WebGL schickt).
import React, { useCallback, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { ChevronUp, ChevronDown, RotateCcw, RotateCw, Hand } from 'lucide-react';
import { useMazeStepper, isWalkable, MOVE_DIRS } from './useMazeStepper';
import { wallTextures, floorTextures, ceilingTexture, glowTexture, labelTexture } from './mazeTextures';
import { RARITY_COLOR, cardImageUrl } from '../../data/cards';
import { rememberCustomPick } from '../../ui/flyToDeck';
import { CARD_FRAME_BOX, CARD_IMAGE_SIZE } from '../cardCrop';
import ghostImgSrc from '../../../../assets/clashRoyale/ui/Royale_Ghost.png';
import chestImgSrc from '../../../../assets/clashRoyale/ui/draft-chest.png';
import jokerImgSrc from '../../../../assets/clashRoyale/ui/UnknownCard.webp';

// Blickrichtungen im Uhrzeigersinn — Index = Blickrichtung, Wert = Server-Zugrichtung
const FACING = ['up', 'right', 'down', 'left'];
// Relative Bewegung → Drehung gegenüber der Blickrichtung
const REL = { forward: 0, right: 1, back: 2, left: 3 };
const KEY_MOVES = { w: 'forward', arrowup: 'forward', s: 'back', arrowdown: 'back', q: 'left', e: 'right' };
const KEY_TURNS = { a: -1, arrowleft: -1, d: 1, arrowright: 1 };
const TURN_REPEAT_MS = 260;

const WALL_H = 1.25;
const EYE = 0.6;
// Kamera sitzt etwas hinter der Feldmitte: ein Gegenstand auf dem eigenen Feld liegt dadurch
// sichtbar vor einem statt in der Kamera.
const CAM_BACK = 0.3;
const CARD_H = 0.48;
const DUST = 380;
const MINIMAP_PX = 168;
const MINIMAP_CELL = 9; // Pixel je Feld — die Minikarte zeigt den Ausschnitt um einen herum

const IS_COARSE_POINTER = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  ? window.matchMedia('(pointer: coarse)').matches
  : false;

const cardTextureUrl = (id) => `/api/clash/card-img/${encodeURIComponent(id)}`;
const itemKey = (it) => `${it.kind}:${it.x},${it.y}:${it.card?.id || ''}`;
const easeOut = (t) => 1 - (1 - t) ** 3;

/** Längster freier Gang ab (x,y) — die Startblickrichtung schaut den längsten Gang hinunter. */
function bestFacing(s, x, y) {
  let best = 0, bestLen = -1;
  FACING.forEach((dir, f) => {
    const [dx, dy] = MOVE_DIRS[dir];
    let len = 0;
    while (isWalkable(s, x + dx * (len + 1), y + dy * (len + 1)) && len < 40) len++;
    if (len > bestLen) { bestLen = len; best = f; }
  });
  return best;
}

export default function Maze3D({ state, myPlayerId, onMove, onPickup, frozen, onUnsupported }) {
  const containerRef = useRef(null);
  const minimapRef = useRef(null);
  const stateRef = useRef(state);
  const keysRef = useRef([]);            // gehaltene relative Bewegungen, letzte zuerst
  const turnHeldRef = useRef(0);         // gehaltene Drehrichtung (−1/0/1)
  const turnsRef = useRef(null);         // Anzahl Vierteldrehungen (fortlaufend, für weiche Winkel)
  const lastTurnRef = useRef(0);
  const { predRef, pendingRef, tryStep } = useMazeStepper({ state, myPlayerId, frozen });
  const propsRef = useRef({});
  stateRef.current = state;
  propsRef.current = { myPlayerId, onMove, onPickup, frozen, tryStep, onUnsupported };

  // Öffnet ein Popup, dürfen gehaltene Tasten nicht "nachlaufen", sobald es schließt
  useEffect(() => {
    if (frozen) { keysRef.current = []; turnHeldRef.current = 0; pendingRef.current = []; }
  }, [frozen, pendingRef]);

  // Steht man auf einer Karte und hebt sie auf, fliegt sie nach der Server-Bestätigung vom
  // Bildschirm ins eigene Deck (ui/flyToDeck.js) — Start ist die Stelle, an der die
  // dargebotene Karte vor einem schwebt (siehe "present" in der Schleife).
  const rememberCardHere = useCallback(() => {
    const s = stateRef.current;
    const pred = predRef.current;
    const box = containerRef.current?.getBoundingClientRect();
    if (!s || !pred || !box) return;
    const it = s.items.find(i => i.kind === 'card' && i.card && i.x === pred.x && i.y === pred.y);
    if (!it) return;
    const h = box.height * 0.34, w = h * 0.8;
    rememberCustomPick(cardImageUrl(it.card.id), {
      left: box.left + box.width / 2 - w / 2, top: box.top + box.height * 0.53 - h / 2, width: w, height: h,
    });
  }, [predRef]);

  const turn = useCallback((dir) => {
    if (turnsRef.current === null || propsRef.current.frozen) return;
    turnsRef.current += dir;
    lastTurnRef.current = performance.now();
  }, []);

  // ── Tastatur ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const isTyping = (el) => !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
    const onKeyDown = (e) => {
      if (isTyping(e.target)) return;
      const key = e.key.toLowerCase();
      if (KEY_MOVES[key]) {
        e.preventDefault();
        if (!keysRef.current.includes(KEY_MOVES[key])) keysRef.current.push(KEY_MOVES[key]);
      } else if (KEY_TURNS[key]) {
        e.preventDefault();
        if (e.repeat) return;
        turnHeldRef.current = KEY_TURNS[key];
        turn(KEY_TURNS[key]);
      } else if (key === ' ' || key === 'enter') {
        e.preventDefault();
        if (propsRef.current.frozen) return;
        rememberCardHere();
        propsRef.current.onPickup();
      }
    };
    const onKeyUp = (e) => {
      const key = e.key.toLowerCase();
      if (KEY_MOVES[key]) keysRef.current = keysRef.current.filter(m => m !== KEY_MOVES[key]);
      if (KEY_TURNS[key] && turnHeldRef.current === KEY_TURNS[key]) turnHeldRef.current = 0;
    };
    const onBlur = () => { keysRef.current = []; turnHeldRef.current = 0; };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [turn, rememberCardHere]);

  // ── Szene ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch {
      propsRef.current.onUnsupported?.();
      return undefined;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.domElement.style.display = 'block';
    container.appendChild(renderer.domElement);

    const disposables = [];
    const own = (x) => { disposables.push(x); return x; };

    const scene = new THREE.Scene();
    const FOG_COLOR = new THREE.Color(0x030309);
    scene.background = FOG_COLOR;
    scene.fog = new THREE.Fog(FOG_COLOR, 1, 4);
    const camera = new THREE.PerspectiveCamera(74, 1, 0.03, 60);
    camera.rotation.order = 'YXZ';
    scene.add(camera);

    // Fackel: warmes Punktlicht leicht rechts unterhalb des Auges, flackert
    const torch = new THREE.PointLight(0xff9a4d, 2.6, 6, 2);
    torch.position.set(0.16, -0.1, -0.05);
    camera.add(torch);
    // Kühles Restlicht: was die Fackel nicht trifft, kippt ins Blaue statt ins Schwarze
    scene.add(new THREE.HemisphereLight(0x3a4a8a, 0x05040a, 0.55));

    // Materialien
    const wallTex = wallTextures();
    const floorTex = floorTextures();
    const ceilTex = ceilingTexture();
    const glowTex = own(glowTexture());
    [wallTex.map, wallTex.bump, floorTex.map, floorTex.bump, ceilTex].forEach(own);
    const wallMat = own(new THREE.MeshStandardMaterial({ map: wallTex.map, bumpMap: wallTex.bump, bumpScale: 2.2, roughness: 0.93, metalness: 0.02 }));
    const floorMat = own(new THREE.MeshStandardMaterial({ map: floorTex.map, bumpMap: floorTex.bump, bumpScale: 1.6, roughness: 0.88 }));
    const ceilMat = own(new THREE.MeshStandardMaterial({ map: ceilTex, roughness: 1 }));

    const loader = new THREE.TextureLoader();
    const texCache = new Map();
    const texture = (url, setup) => {
      if (!texCache.has(url)) {
        const tex = own(loader.load(url, (t) => setup?.(t)));
        tex.colorSpace = THREE.SRGBColorSpace;
        texCache.set(url, tex);
      }
      return texCache.get(url);
    };
    const ghostTex = texture(ghostImgSrc);
    const chestTex = texture(chestImgSrc);
    const jokerTex = texture(jokerImgSrc);
    // Kartenbild ohne transparenten Rand: nur der Rahmen der jeweiligen Seltenheit (cardCrop.js)
    const cardTex = (card) => texture(cardTextureUrl(card.id), (t) => {
      const box = CARD_FRAME_BOX[card.rarity] || CARD_FRAME_BOX.Common;
      t.repeat.set(box.w / CARD_IMAGE_SIZE.w, box.h / CARD_IMAGE_SIZE.h);
      t.offset.set(box.x / CARD_IMAGE_SIZE.w, 1 - (box.y + box.h) / CARD_IMAGE_SIZE.h);
      t.needsUpdate = true;
    });

    // ── Welt (Wände/Boden/Decke) — neu gebaut, wenn sich das Labyrinth ändert ──
    let world = null;
    let worldSig = '';
    const buildWorld = (s) => {
      if (world) {
        scene.remove(world.group);
        world.geos.forEach(g => g.dispose());
        world.wallMesh.dispose();
      }
      const group = new THREE.Group();
      const geos = [];
      const cells = [];
      for (let y = -1; y <= s.H; y++) {
        for (let x = -1; x <= s.W; x++) {
          if (isWalkable(s, x, y)) continue;
          // Nur Wände, die an einen Gang grenzen — der Rest ist nie zu sehen
          let near = false;
          for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if (isWalkable(s, x + dx, y + dy)) { near = true; break; }
          if (near) cells.push([x, y]);
        }
      }
      const wallGeo = new THREE.BoxGeometry(1, WALL_H, 1);
      geos.push(wallGeo);
      const wallMesh = new THREE.InstancedMesh(wallGeo, wallMat, cells.length);
      const m = new THREE.Matrix4();
      cells.forEach(([x, y], i) => { m.makeTranslation(x + 0.5, WALL_H / 2, y + 0.5); wallMesh.setMatrixAt(i, m); });
      group.add(wallMesh);

      const floorGeo = new THREE.PlaneGeometry(s.W + 2, s.H + 2);
      geos.push(floorGeo);
      floorTex.map.repeat.set((s.W + 2) / 2, (s.H + 2) / 2);
      floorTex.bump.repeat.copy(floorTex.map.repeat);
      const floor = new THREE.Mesh(floorGeo, floorMat);
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(s.W / 2, 0, s.H / 2);
      group.add(floor);

      const ceilGeo = new THREE.PlaneGeometry(s.W + 2, s.H + 2);
      geos.push(ceilGeo);
      ceilTex.repeat.set(s.W + 2, s.H + 2);
      const ceil = new THREE.Mesh(ceilGeo, ceilMat);
      ceil.rotation.x = Math.PI / 2;
      ceil.position.set(s.W / 2, WALL_H, s.H / 2);
      group.add(ceil);

      scene.add(group);
      world = { group, geos, wallMesh };
    };

    // ── Gemeinsame Geometrien ────────────────────────────────────────────────
    const unitPlane = own(new THREE.PlaneGeometry(1, 1));
    const ringGeo = own(new THREE.RingGeometry(0.26, 0.33, 40));
    const additive = (color, opacity) => own(new THREE.SpriteMaterial({
      map: glowTex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false,
    }));

    // ── Gegenstände ──────────────────────────────────────────────────────────
    const items = new Map(); // key → { group, kind, x, y, mats, phase, dying, dieStart, pickup }
    const makeItem = (it) => {
      const group = new THREE.Group();
      const mats = [];
      const color = it.kind === 'joker' ? 0xa78bfa : it.kind === 'chest' ? 0xffc54a
        : new THREE.Color(RARITY_COLOR[it.card?.rarity] || '#ffffff');
      // Lichthof hinter dem Gegenstand und Lichtfleck am Boden
      const halo = new THREE.Sprite(additive(color, 0.5));
      halo.scale.setScalar(it.kind === 'joker' ? 1.3 : 1.05);
      halo.position.y = 0.55;
      group.add(halo);
      mats.push(halo.material);
      const floorGlowMat = own(new THREE.MeshBasicMaterial({ map: glowTex, color, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }));
      const floorGlow = new THREE.Mesh(unitPlane, floorGlowMat);
      floorGlow.rotation.x = -Math.PI / 2;
      floorGlow.position.y = 0.012;
      floorGlow.scale.setScalar(0.9);
      group.add(floorGlow);
      mats.push(floorGlowMat);

      let body;
      if (it.kind === 'card' && it.card) {
        const box = CARD_FRAME_BOX[it.card.rarity] || CARD_FRAME_BOX.Common;
        const mat = own(new THREE.MeshBasicMaterial({ map: cardTex(it.card), transparent: true, alphaTest: 0.04, side: THREE.DoubleSide }));
        body = new THREE.Mesh(unitPlane, mat);
        body.scale.set(CARD_H * (box.w / box.h), CARD_H, 1);
        mats.push(mat);
      } else {
        const mat = own(new THREE.SpriteMaterial({ map: it.kind === 'chest' ? chestTex : jokerTex, transparent: true }));
        body = new THREE.Sprite(mat);
        body.scale.set(it.kind === 'chest' ? 0.62 : 0.46, it.kind === 'chest' ? 0.62 : 0.56, 1);
        mats.push(mat);
      }
      body.position.y = 0.55;
      group.add(body);

      // Funken, die um den Gegenstand kreisen
      const sparks = [];
      const count = it.kind === 'joker' ? 9 : 5;
      for (let i = 0; i < count; i++) {
        const sp = new THREE.Sprite(additive(color, 0.9));
        sp.scale.setScalar(0.05 + Math.random() * 0.04);
        group.add(sp);
        sparks.push({ sp, a: (i / count) * Math.PI * 2, r: 0.28 + Math.random() * 0.12, h: Math.random(), v: 0.6 + Math.random() * 0.8 });
        mats.push(sp.material);
      }
      group.position.set(it.x + 0.5, 0, it.y + 0.5);
      scene.add(group);
      return {
        group, body, halo, sparks, kind: it.kind, x: it.x, y: it.y, mats, phase: Math.random() * 10, dying: false,
        baseScale: body.scale.clone(), present: 0,
      };
    };

    // Funkenregen beim Aufheben
    const bursts = [];
    const burst = (pos, color) => {
      for (let i = 0; i < 18; i++) {
        const sp = new THREE.Sprite(additive(color, 1));
        sp.scale.setScalar(0.06);
        sp.position.copy(pos);
        scene.add(sp);
        const a = Math.random() * Math.PI * 2, up = 0.8 + Math.random() * 1.4, out = 0.6 + Math.random() * 1.2;
        bursts.push({ sp, v: new THREE.Vector3(Math.cos(a) * out, up, Math.sin(a) * out), t0: performance.now() });
      }
    };

    // ── Mitspieler ───────────────────────────────────────────────────────────
    const others = new Map(); // id → { group, ghost, label, ring, rp, mats, labelTex }
    const makeOther = (p) => {
      const group = new THREE.Group();
      const ghostMat = own(new THREE.SpriteMaterial({ map: ghostTex, transparent: true, opacity: 0.92 }));
      // Kalter Lichthof hinter dem Geist — sieht man ihn im Dunkeln, soll er unheimlich leuchten
      const aura = new THREE.Sprite(additive(0x7fb4ff, 0.35));
      aura.scale.setScalar(1.15);
      aura.position.y = 0.5;
      group.add(aura);
      const ghost = new THREE.Sprite(ghostMat);
      ghost.scale.setScalar(0.78);
      ghost.position.y = 0.5;
      group.add(ghost);
      const labelTex = own(labelTexture(p.name, p.color));
      const labelMat = own(new THREE.SpriteMaterial({ map: labelTex, transparent: true, depthWrite: false }));
      const label = new THREE.Sprite(labelMat);
      label.scale.set(0.8, 0.2, 1);
      label.position.y = 1.0;
      group.add(label);
      const ringMat = own(new THREE.MeshBasicMaterial({ color: new THREE.Color(p.color || '#a78bfa'), transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.015;
      group.add(ring);
      scene.add(group);
      return { group, ghost, aura, name: p.name, phase: Math.random() * 10 };
    };

    // ── Staub im Fackellicht ─────────────────────────────────────────────────
    const dustGeo = own(new THREE.BufferGeometry());
    const dustPos = new Float32Array(DUST * 3);
    const dustVel = new Float32Array(DUST * 3);
    for (let i = 0; i < DUST; i++) {
      dustPos[i * 3] = (Math.random() - 0.5) * 6;
      dustPos[i * 3 + 1] = Math.random() * WALL_H;
      dustPos[i * 3 + 2] = (Math.random() - 0.5) * 6;
      dustVel[i * 3] = (Math.random() - 0.5) * 0.04;
      dustVel[i * 3 + 1] = (Math.random() - 0.3) * 0.03;
      dustVel[i * 3 + 2] = (Math.random() - 0.5) * 0.04;
    }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    const dustMat = own(new THREE.PointsMaterial({ map: glowTex, color: 0xffc98a, size: 0.018, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    scene.add(new THREE.Points(dustGeo, dustMat));
    let dustCentered = false;

    // ── Größe ────────────────────────────────────────────────────────────────
    const resize = () => {
      const w = container.clientWidth, h = container.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = `${w}px`;
      renderer.domElement.style.height = `${h}px`;
      camera.aspect = w / h;
      // Hochformat: weiterer Blickwinkel, sonst sieht man auf dem Handy nur einen Ausschnitt der Wand
      camera.fov = w < h ? 92 : 74;
      camera.updateProjectionMatrix();
      // setSize leert die Zeichenfläche — sofort neu zeichnen, sonst ist sie bis zum nächsten
      // Frame leer und blitzt auf (der ResizeObserver feuert erst nach dem Frame)
      renderer.render(scene, camera);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    // ── Minikarte: erkundete Felder ──────────────────────────────────────────
    let explored = null;
    let exploredSig = '';
    let lastMinimap = 0;
    const drawMinimap = (s, me, facing, visibleItems, visibleOthers) => {
      const cv = minimapRef.current;
      if (!cv) return;
      const ctx = cv.getContext('2d');
      const dpr = window.devicePixelRatio || 1;
      const px = MINIMAP_PX;
      if (cv.width !== px * dpr) { cv.width = px * dpr; cv.height = px * dpr; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, px, px);
      const cs = MINIMAP_CELL;
      const ox = px / 2 - (me.x + 0.5) * cs, oy = px / 2 - (me.y + 0.5) * cs;
      const span = Math.ceil(px / cs / 2) + 1;
      for (let y = Math.max(0, Math.floor(me.y) - span); y < Math.min(s.H, Math.ceil(me.y) + span); y++) {
        for (let x = Math.max(0, Math.floor(me.x) - span); x < Math.min(s.W, Math.ceil(me.x) + span); x++) {
          if (!explored[y * s.W + x]) continue;
          ctx.fillStyle = s.walls[y][x] === '1' ? '#2a2638' : '#8f86b8';
          ctx.fillRect(ox + x * cs, oy + y * cs, cs + 0.3, cs + 0.3);
        }
      }
      for (const it of visibleItems) {
        ctx.fillStyle = it.kind === 'joker' ? '#c4b5fd' : it.kind === 'chest' ? '#ffc54a' : (RARITY_COLOR[it.card?.rarity] || '#fff');
        ctx.beginPath();
        ctx.arc(ox + (it.x + 0.5) * cs, oy + (it.y + 0.5) * cs, Math.max(1.6, cs * 0.38), 0, Math.PI * 2);
        ctx.fill();
      }
      for (const o of visibleOthers) {
        ctx.fillStyle = o.color || '#fff';
        ctx.beginPath();
        ctx.arc(ox + (o.x + 0.5) * cs, oy + (o.y + 0.5) * cs, Math.max(2, cs * 0.45), 0, Math.PI * 2);
        ctx.fill();
      }
      // Eigene Position als Pfeil in Blickrichtung
      const cx = ox + (me.x + 0.5) * cs, cy = oy + (me.y + 0.5) * cs;
      const r = Math.max(4, cs * 0.9);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(facing * Math.PI / 2);
      ctx.fillStyle = '#ffd34d';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, -r); ctx.lineTo(r * 0.75, r * 0.8); ctx.lineTo(0, r * 0.4); ctx.lineTo(-r * 0.75, r * 0.8);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.restore();
    };

    // ── Schleife ─────────────────────────────────────────────────────────────
    const renderPos = {};        // weich interpolierte Positionen (eigene + Mitspieler)
    let yaw = null;
    let bobPhase = 0;
    let bump = null;             // { dir: [dx,dy], t0 } — Anstoßen an einer Wand
    let lastFrame = performance.now();
    let raf = 0;
    const fwd = new THREE.Vector3();

    const frame = (nowPerf) => {
      raf = requestAnimationFrame(frame);
      if (document.hidden) return;
      const dt = Math.min(64, nowPerf - lastFrame);
      lastFrame = nowPerf;
      const s = stateRef.current;
      const { myPlayerId: myId, onMove: move, frozen: isFrozen, tryStep: step } = propsRef.current;
      if (!s) return;

      const sig = `${s.W}x${s.H}:${s.walls.join('')}`;
      if (sig !== worldSig) {
        worldSig = sig;
        buildWorld(s);
      }
      if (exploredSig !== sig) { exploredSig = sig; explored = new Uint8Array(s.W * s.H); }

      const pred = predRef.current;
      if (!pred) { renderer.render(scene, camera); return; }
      if (turnsRef.current === null) turnsRef.current = bestFacing(s, pred.x, pred.y);
      const facing = ((turnsRef.current % 4) + 4) % 4;
      container.dataset.facing = String(facing); // für Prüfstände: aktuelle Blickrichtung

      const clientOffset = s.clientReceivedAt - s.serverNow;
      const inCountdown = s.countdownUntil && (s.countdownUntil + clientOffset) > Date.now();
      const canAct = !isFrozen && !inCountdown && !s.finished;

      // Eingabe: gehaltene Drehung wiederholen, gehaltene Bewegung als Schritte senden
      if (canAct && turnHeldRef.current && nowPerf - lastTurnRef.current >= TURN_REPEAT_MS) turn(turnHeldRef.current);
      if (canAct && keysRef.current.length) {
        const rel = keysRef.current[keysRef.current.length - 1];
        const dir = FACING[(facing + REL[rel]) % 4];
        if (step(s, dir, nowPerf, move) === 'wall' && (!bump || nowPerf - bump.t0 > 320)) {
          bump = { dir: MOVE_DIRS[dir], t0: nowPerf };
        }
      }

      // Positionen weich nachziehen (wie in der Draufsicht)
      const targets = { ...s.positions };
      targets[myId] = { x: pred.x, y: pred.y };
      for (const [pid, tp] of Object.entries(targets)) {
        const rp = renderPos[pid] || (renderPos[pid] = { x: tp.x, y: tp.y });
        const speed = (dt / s.stepMs) * 1.15;
        const dx = tp.x - rp.x, dy = tp.y - rp.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 3) { rp.x = tp.x; rp.y = tp.y; } else if (dist > 0.001) {
          const st = Math.min(dist, speed);
          rp.x += (dx / dist) * st; rp.y += (dy / dist) * st;
        }
      }
      for (const pid of Object.keys(renderPos)) if (!targets[pid]) delete renderPos[pid];
      const me = renderPos[myId];
      const moving = Math.hypot(pred.x - me.x, pred.y - me.y) > 0.02;

      // Kamera: Drehung weich, Kopfwippen beim Gehen, kurzer Ruck an der Wand
      const yawTarget = -turnsRef.current * Math.PI / 2;
      if (yaw === null) yaw = yawTarget;
      yaw += (yawTarget - yaw) * (1 - Math.exp(-dt / 65));
      bobPhase += moving ? dt * 0.024 : 0;
      const bobY = Math.sin(bobPhase) * 0.022 * (moving ? 1 : 0);
      fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw));
      let bx = 0, bz = 0;
      if (bump) {
        const p = (nowPerf - bump.t0) / 220;
        if (p >= 1) bump = null;
        else { const k = Math.sin(p * Math.PI) * 0.07; bx = bump.dir[0] * k; bz = bump.dir[1] * k; }
      }
      camera.position.set(me.x + 0.5 - fwd.x * CAM_BACK + bx, EYE + bobY, me.y + 0.5 - fwd.z * CAM_BACK + bz);
      camera.rotation.set(Math.sin(bobPhase * 0.5) * 0.006, yaw, Math.sin(bobPhase * 0.5) * 0.004);

      // Fackel flackert, Nebel endet am Lichtradius
      const flicker = 1 + Math.sin(nowPerf / 87) * 0.05 + Math.sin(nowPerf / 31 + 1.3) * 0.035 + (Math.random() - 0.5) * 0.04;
      torch.intensity = 2.6 * flicker;
      torch.distance = s.lightRadius * 1.6;
      scene.fog.near = s.lightRadius * 0.35;
      scene.fog.far = s.lightRadius + 0.35;

      // Erkundet: alles im Lichtkreis
      const R = s.lightRadius;
      const R2 = R * R;
      for (let y = Math.floor(pred.y - R); y <= Math.ceil(pred.y + R); y++) {
        for (let x = Math.floor(pred.x - R); x <= Math.ceil(pred.x + R); x++) {
          if (x < 0 || y < 0 || x >= s.W || y >= s.H) continue;
          if ((x - pred.x) ** 2 + (y - pred.y) ** 2 <= R2) explored[y * s.W + x] = 1;
        }
      }
      const inLight = (x, y) => (x - me.x) ** 2 + (y - me.y) ** 2 <= R2;

      // Gegenstände abgleichen
      const seen = new Set();
      for (const it of s.items) {
        const key = itemKey(it);
        seen.add(key);
        if (!items.has(key)) items.set(key, makeItem(it));
      }
      for (const [key, obj] of items) {
        if (!seen.has(key) && !obj.dying) {
          obj.dying = true;
          obj.dieStart = nowPerf;
          // Selbst aufgehoben (eigenes Feld): Karte fliegt auf einen zu, Funken stieben
          obj.pickup = Math.hypot(obj.x - pred.x, obj.y - pred.y) < 0.6;
          if (obj.pickup) {
            burst(new THREE.Vector3(obj.x + 0.5, 0.42, obj.y + 0.5), obj.halo.material.color);
            burst(new THREE.Vector3(obj.x + 0.5, 0.42, obj.y + 0.5), new THREE.Color(0xffffff));
          }
        }
      }
      const t = nowPerf / 1000;
      for (const [key, obj] of items) {
        // Steht man auf dem Feld, wird der Gegenstand "dargeboten": tiefer, kleiner, zu einem
        // gedreht — sonst stünde er mitten in der Kamera
        const onMyCell = !obj.dying && obj.x === pred.x && obj.y === pred.y;
        obj.present += ((onMyCell ? 1 : 0) - obj.present) * (1 - Math.exp(-dt / 110));
        const pr = obj.present;
        const bob = Math.sin(t * 2.2 + obj.phase) * 0.045 * (1 - pr * 0.6);
        const baseY = 0.55 - pr * 0.09;
        obj.body.position.y = baseY + bob;
        obj.halo.position.y = baseY + bob;
        // ... und rückt ans andere Ende des Feldes, damit sie mit Abstand vor einem schwebt
        obj.body.position.x = obj.halo.position.x = fwd.x * 0.26 * pr;
        obj.body.position.z = obj.halo.position.z = fwd.z * 0.26 * pr;
        // Karten etwas kleiner, Kiste/Joker (größere Sprites) deutlich kleiner
        const sc = 1 - pr * (obj.kind === 'card' ? 0.4 : 0.55);
        if (!obj.dying) obj.body.scale.set(obj.baseScale.x * sc, obj.baseScale.y * sc, 1);
        if (obj.kind === 'card') {
          const spin = t * 1.3 + obj.phase;
          // kürzester Weg vom Drehwinkel zur Kamerablickrichtung
          const diff = Math.atan2(Math.sin(yaw - spin), Math.cos(yaw - spin));
          obj.body.rotation.y = spin + diff * pr;
        }
        const pulse = obj.kind === 'joker' ? 0.45 + Math.sin(t * 5) * 0.15 : 0.42 + Math.sin(t * 2.6 + obj.phase) * 0.08;
        obj.halo.material.opacity = pulse;
        for (const sp of obj.sparks) {
          const a = sp.a + t * sp.v;
          sp.sp.position.set(Math.cos(a) * sp.r, 0.2 + ((sp.h + t * 0.25 * sp.v) % 1) * 0.8, Math.sin(a) * sp.r);
        }
        if (obj.dying) {
          const p = Math.min(1, (nowPerf - obj.dieStart) / (obj.pickup ? 240 : 320));
          if (obj.pickup) {
            // kurz aufblähen und verpuffen — die Karte selbst fliegt als Bild ins Deck
            obj.group.scale.setScalar(1 + easeOut(p) * 0.35);
          } else {
            obj.group.scale.setScalar(1 - p);
          }
          obj.mats.forEach(mt => { mt.opacity = (mt.userData.baseOpacity ??= mt.opacity) * (1 - p); });
          if (p >= 1) { scene.remove(obj.group); items.delete(key); }
        }
      }
      for (let i = bursts.length - 1; i >= 0; i--) {
        const b = bursts[i];
        const age = (nowPerf - b.t0) / 1000;
        b.v.y -= 3.2 * (dt / 1000);
        b.sp.position.addScaledVector(b.v, dt / 1000);
        b.sp.material.opacity = Math.max(0, 1 - age / 0.75);
        if (age > 0.75) { scene.remove(b.sp); b.sp.material.dispose(); bursts.splice(i, 1); }
      }

      // Mitspieler abgleichen
      const playerById = Object.fromEntries(s.players.map(p => [p.id, p]));
      for (const [pid, rp] of Object.entries(renderPos)) {
        if (pid === myId || !playerById[pid]) continue;
        let o = others.get(pid);
        if (!o || o.name !== playerById[pid].name) {
          if (o) scene.remove(o.group);
          o = makeOther(playerById[pid]);
          others.set(pid, o);
        }
        o.group.position.set(rp.x + 0.5, 0, rp.y + 0.5);
        o.ghost.position.y = 0.5 + Math.sin(t * 2.6 + o.phase) * 0.04;
        o.aura.position.y = o.ghost.position.y;
        o.aura.material.opacity = 0.28 + Math.sin(t * 3.1 + o.phase) * 0.08;
      }
      for (const [pid, o] of others) {
        if (!renderPos[pid] || pid === myId) { scene.remove(o.group); others.delete(pid); }
      }

      // Staub: treibt langsam, wird um die Kamera herum nachgeführt
      const cx = camera.position.x, cz = camera.position.z;
      if (!dustCentered) {
        for (let i = 0; i < DUST; i++) { dustPos[i * 3] += cx; dustPos[i * 3 + 2] += cz; }
        dustCentered = true;
      }
      const k = dt / 16;
      for (let i = 0; i < DUST; i++) {
        const ix = i * 3;
        dustPos[ix] += dustVel[ix] * k * 0.05;
        dustPos[ix + 1] += dustVel[ix + 1] * k * 0.05;
        dustPos[ix + 2] += dustVel[ix + 2] * k * 0.05;
        if (dustPos[ix] - cx > 3) dustPos[ix] -= 6; else if (dustPos[ix] - cx < -3) dustPos[ix] += 6;
        if (dustPos[ix + 2] - cz > 3) dustPos[ix + 2] -= 6; else if (dustPos[ix + 2] - cz < -3) dustPos[ix + 2] += 6;
        if (dustPos[ix + 1] > WALL_H) dustPos[ix + 1] = 0; else if (dustPos[ix + 1] < 0) dustPos[ix + 1] = WALL_H;
        // Direkt vor der Linse würde ein Staubkorn zum riesigen Fleck — auf die andere Seite versetzen
        const ddx = dustPos[ix] - cx, ddz = dustPos[ix + 2] - cz, ddy = dustPos[ix + 1] - camera.position.y;
        if (ddx * ddx + ddy * ddy + ddz * ddz < 0.36) dustPos[ix] = cx + (ddx >= 0 ? -2.4 : 2.4);
      }
      dustGeo.attributes.position.needsUpdate = true;

      renderer.render(scene, camera);

      if (nowPerf - lastMinimap > 90) {
        lastMinimap = nowPerf;
        const visItems = s.items.filter(it => inLight(it.x, it.y));
        const visOthers = Object.entries(renderPos)
          .filter(([pid, rp]) => pid !== myId && playerById[pid] && inLight(rp.x, rp.y))
          .map(([pid, rp]) => ({ x: rp.x, y: rp.y, color: playerById[pid].color }));
        drawMinimap(s, me, facing, visItems, visOthers);
      }
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      if (world) { world.geos.forEach(g => g.dispose()); world.wallMesh.dispose(); }
      bursts.forEach(b => b.sp.material.dispose());
      disposables.forEach(d => d.dispose?.());
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [predRef, turn]);

  // ── Touch-Steuerung ──────────────────────────────────────────────────────────
  const hold = (move, down) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (down) {
      e.currentTarget.setPointerCapture?.(e.pointerId);
      if (!keysRef.current.includes(move)) keysRef.current.push(move);
    } else {
      keysRef.current = keysRef.current.filter(m => m !== move);
    }
  };
  const tap = (fn) => (e) => { e.preventDefault(); e.stopPropagation(); fn(); };
  const btn = 'w-14 h-14 flex items-center justify-center rounded-xl bg-black/40 border border-white/20 text-white/90 active:bg-violet-600 active:border-violet-300 backdrop-blur-md';

  return (
    <div className="absolute inset-0 overflow-hidden" style={IS_COARSE_POINTER ? { touchAction: 'none' } : undefined}>
      <div ref={containerRef} className="absolute inset-0" data-maze3d=""
        onMouseDown={() => { if (!propsRef.current.frozen) { rememberCardHere(); propsRef.current.onPickup(); } }} />
      {/* Vignette + warmer Fackelschein am Bildrand */}
      <div className="cr-maze3d-vignette absolute inset-0 pointer-events-none" aria-hidden="true" />
      <div className="cr-maze3d-torchglow absolute inset-0 pointer-events-none" aria-hidden="true" />

      <canvas ref={minimapRef} className="absolute top-3 right-3 rounded-lg border-2 border-[var(--cr-panel-edge)] bg-black/55 pointer-events-none"
        style={{ width: MINIMAP_PX, height: MINIMAP_PX }} />

      {IS_COARSE_POINTER && (
        <>
          <div className="absolute bottom-4 left-3 grid grid-cols-3 gap-1.5 select-none">
            <button type="button" aria-label="Links drehen" className={btn} onPointerDown={tap(() => turn(-1))} style={{ touchAction: 'none' }}><RotateCcw size={22} /></button>
            <button type="button" aria-label="Vorwärts" className={btn} onPointerDown={hold('forward', true)} onPointerUp={hold('forward', false)} onPointerCancel={hold('forward', false)} style={{ touchAction: 'none' }}><ChevronUp size={26} /></button>
            <button type="button" aria-label="Rechts drehen" className={btn} onPointerDown={tap(() => turn(1))} style={{ touchAction: 'none' }}><RotateCw size={22} /></button>
            <span />
            <button type="button" aria-label="Zurück" className={btn} onPointerDown={hold('back', true)} onPointerUp={hold('back', false)} onPointerCancel={hold('back', false)} style={{ touchAction: 'none' }}><ChevronDown size={26} /></button>
            <span />
          </div>
          <button type="button" aria-label="Aufheben"
            onPointerDown={tap(() => { if (!propsRef.current.frozen) { rememberCardHere(); propsRef.current.onPickup(); } })}
            className="absolute bottom-9 right-4 w-20 h-20 rounded-full bg-violet-600/85 border border-violet-300/40 text-white flex items-center justify-center active:bg-violet-500 backdrop-blur-md"
            style={{ touchAction: 'none' }}>
            <Hand size={30} />
          </button>
        </>
      )}
    </div>
  );
}
