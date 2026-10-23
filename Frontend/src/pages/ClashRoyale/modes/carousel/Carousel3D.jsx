// Blindes Karussell in 3D: ein Jahrmarkt-Karussell, auf dessen Plattform die Tische stehen.
//
//   • Jeder Spieler hat einen festen Platz am Rand. Die Plattform trägt die Tische und dreht
//     sich nach jeder Runde einen Platz weiter — genau die Regel des Modus (Server:
//     carouselTableForSeat). Der eigene Platz liegt immer vorne bei der Kamera.
//   • Während der Runde schaut die Kamera schräg auf den eigenen Tisch. Verdeckte Karten
//     liegen auf blauem Filz; Auswahl hebt die Karte an, Aufdecken dreht sie um, genommene
//     Plätze bleiben als Mulde mit Punkt in der Farbe des Nehmenden.
//   • Rundenwechsel (Server hält 4 s): Kamera steigt in den Überblick, an jedem Tisch steigt
//     der Pick des Spielers auf und dreht sich um, fliegt zu seinem Namensschild, dann dreht
//     sich das Karussell weiter und die Kamera fährt zum neuen Tisch.
//   • Zuschauer sehen dauerhaft den Überblick mit allen Live-Aufdeckungen.
//
// Reine Darstellung — Zustand, Auswahl und Aktionsleiste bleiben in ShadowCarousel.jsx. Ohne
// WebGL meldet onUnsupported(), dann zeigt ShadowCarousel die 2D-Tische.
import React, { useEffect, useImperativeHandle, useRef } from 'react';
import * as THREE from 'three';
import { CARD_FRAME_BOX, CARD_IMAGE_SIZE } from '../cardCrop';
import { RARITY_COLOR } from '../../data/cards';
import { plaqueTexture, frameRingTexture } from '../auction/auctionTextures';
import { platformTexture, stripeTexture, feltTexture, woodTexture, groundTexture, checkTexture, cobbleTexture } from './carouselTextures';
import { createPostFX, cloneModel, scatter, warmUp, createQualityGovernor } from '../scene3d/kit';
import { createCrAssets } from '../scene3d/crAssets';

const cardTextureUrl = (id) => `/api/clash/card-img/${encodeURIComponent(id)}`;
const animOff = () => document.documentElement.dataset.crAnim === 'off';
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const deg = THREE.MathUtils.degToRad;
const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOutBack = (t) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2;

const CW = 0.8, CH = 1.0, GAP = 0.14, PAD = 0.42; // Kartenfeld, Abstand, Tischrand
const TABLE_Y = 0.95;                               // Tischplatte (Oberkante)
const PLATFORM_TOP = 0.35;
const POLE_H = 3.6;
const FOV = 40;
// Am eigenen Tisch steil von oben (Nutzerwunsch, vorher 52°) — die Karten liegen fast frontal
const SEAT_PITCH = deg(70), OVER_PITCH = deg(55);
const FLIP_S = 0.5;
// Zeitplan des Rundenwechsels in ms ab Beginn der Übergangsphase (Server: 4000 ms)
const T_UP = [0, 750], T_RISE = [250, 1050], T_FLY = [1900, 2550], T_SPIN = [2600, 3500], T_DOWN = [3250, 4000];
const phaseP = (ms, [a, b]) => clamp01((ms - a) / (b - a));

// Spalten so wählen, dass die Karten auf dem Bildschirm möglichst groß werden
function chooseCols(n, aspect) {
  let best = { cols: Math.min(n, 4), score: 0 };
  for (const cols of [2, 3, 4, 5, 6, 8]) {
    const rows = Math.ceil(n / cols);
    if (cols > n || rows * cols - n >= cols) continue;
    const w = cols * CW + (cols - 1) * GAP, h = (rows * CH + (rows - 1) * GAP) * Math.sin(SEAT_PITCH);
    const score = Math.min(aspect / w, 1 / h);
    if (score > best.score) best = { cols, score };
  }
  return best.cols;
}

function artSize(rarity) {
  const b = CARD_FRAME_BOX[rarity] || CARD_FRAME_BOX.Common;
  const h = CH * 0.96;
  return { w: Math.min(CW * 0.96, h * (b.w / b.h)), h };
}

/**
 * @param {object}   props.state         carouselState
 * @param {string}   props.myPlayerId
 * @param {number}   props.selectedSlot
 * @param {boolean}  props.canAct
 * @param {Function} props.onSlotClick   (slotIdx) => void
 * @param {string}   props.unknownImg    Rückseite verdeckter Karten
 * @param {string}   props.youLabel      Beschriftung des eigenen Platzes
 * @param {Function} props.onUnsupported
 */
const Carousel3D = React.forwardRef(function Carousel3D(props, ref) {
  const containerRef = useRef(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const apiRef = useRef({ getSlotRect: () => null });
  useImperativeHandle(ref, () => ({ getSlotRect: (si) => apiRef.current.getSlotRect(si) }), []);

  useEffect(() => {
    const container = containerRef.current;
    const api = apiRef.current;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
      if (!renderer.getContext()) throw new Error('no context');
    } catch {
      propsRef.current.onUnsupported?.();
      return undefined;
    }
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Neutral statt ACES: Kartenfarben bleiben unverändert
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.touchAction = 'none';
    container.appendChild(renderer.domElement);

    const disposables = [];
    const own = (x) => { disposables.push(x); return x; };
    const scene = new THREE.Scene();
    const SKY = new THREE.Color(0xc4d9ea);   // Dunst = Horizontfarbe des Himmelsbilds
    scene.background = SKY;
    scene.fog = new THREE.Fog(SKY, 45, 140);
    // near nicht zu klein: sonst reicht die Tiefengenauigkeit nicht und aufliegende Flächen
    // (Pflasterweg, Filz) flackern durch den Untergrund
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.6, 250);
    if (import.meta.env.DEV) window.__cr3dScene = scene; // Prüfstand: Szene im Browser untersuchen
    const post = createPostFX(renderer, scene, camera, { bloom: { strength: 0.3, radius: 0.45, threshold: 1.1 }, vignette: 0.2 });
    // Clash-Royale-Look: gemalte Texturen und Objekte, im Code erzeugt (keine Downloads, kein Warten)
    const assets = createCrAssets(renderer);
    assets.sky(scene, 'kloofendal_48d_partly_cloudy_puresky');
    scene.environmentIntensity = 0.6;

    // ── Licht: sonniger Festplatz ────────────────────────────────────────────
    scene.add(new THREE.HemisphereLight(0xe2f3ff, 0x8a7350, 0.9));
    const sun = new THREE.DirectionalLight(0xfff0d0, 2.6);
    sun.position.set(-8, 16, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 60 });
    scene.add(sun, sun.target);

    // ── Boden + Zelte im Hintergrund ────────────────────────────────────────────
    const groundTex = own(groundTexture());
    groundTex.repeat.set(60, 60);
    const groundMat = own(new THREE.MeshStandardMaterial({ map: groundTex, color: 0xa8d07a, roughness: 1 }));
    assets.pbr(groundMat, 'leafy_grass', 240 / 2.5, 240 / 2.5);
    const ground = new THREE.Mesh(own(new THREE.PlaneGeometry(240, 240)), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    // Park rund um den Festplatz: Bäume (Scans, instanziert) in einem lockeren Ring
    const treeModels = [assets.model('island_tree_01', 4.2), assets.model('island_tree_02', 3.8)];
    const treeSets = [[], []];
    for (let i = 0; i < 70; i++) {
      const h = (n) => { const x = Math.sin(i * 12.9898 + n * 78.233) * 43758.5453; return x - Math.floor(x); };
      const a = h(1) * Math.PI * 2;
      const r = 24 + h(2) * 40;
      treeSets[i % 2].push({ x: Math.sin(a) * r, y: -0.05, z: Math.cos(a) * r, s: 0.8 + h(3) * 0.7, ry: h(4) * 6 });
    }
    treeModels.forEach((m, i) => scene.add(scatter(m, treeSets[i], { castShadow: true })));
    const lampModel = assets.model('street_lamp_01', 3.4, {
      tweak: (m) => {
        if (/bulb/i.test(m.name)) { m.emissive = new THREE.Color(0xffe2a0); m.emissiveIntensity = 3; }
        if (/glass/i.test(m.name)) { m.emissive = new THREE.Color(0xffd890); m.emissiveIntensity = 0.6; }
      },
    });
    const plantModel = assets.model('potted_plant_02', 0.85);
    const crateModel = assets.model('wooden_crate_01', 0.55);
    const tableModel = assets.model('wooden_picnic_table', 0.8);

    // ── Karussell: root dreht den eigenen Platz nach vorn, platform trägt die Tische ──
    const root = new THREE.Group();
    scene.add(root);
    const platform = new THREE.Group();
    root.add(platform);
    const woodTex = own(woodTexture());
    const woodMat = own(new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.8, color: 0xd9b89a }));
    assets.pbr(woodMat, 'wood_table_001', 1, 1);
    const feltTex = own(feltTexture());
    const feltMat = own(new THREE.MeshStandardMaterial({ map: feltTex, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
    const goldMat = own(new THREE.MeshStandardMaterial({ color: 0xe0b04a, roughness: 0.28, metalness: 1 }));
    const redMat = own(new THREE.MeshStandardMaterial({ color: 0xb3242b, roughness: 0.6 }));
    const backTex = own(new THREE.TextureLoader().load(propsRef.current.unknownImg));
    backTex.colorSpace = THREE.SRGBColorSpace;
    // Karten unbeleuchtet in Originalfarbe — beleuchtet wirkten sie unter der Sonne überbelichtet
    const backMat = own(new THREE.MeshBasicMaterial({ map: backTex, transparent: true, alphaTest: 0.3, color: 0xeeeeee, toneMapped: false }));
    const ringTex = own(frameRingTexture());
    const checkMat = own(new THREE.SpriteMaterial({ map: own(checkTexture()), transparent: true, depthWrite: false }));
    const loader = new THREE.TextureLoader();
    const texCache = new Map();
    const cardTex = (id, rarity) => {
      if (texCache.has(id)) return texCache.get(id);
      const tex = own(loader.load(cardTextureUrl(id), (t) => {
        const b = CARD_FRAME_BOX[rarity] || CARD_FRAME_BOX.Common;
        t.repeat.set(b.w / CARD_IMAGE_SIZE.w, b.h / CARD_IMAGE_SIZE.h);
        t.offset.set(b.x / CARD_IMAGE_SIZE.w, 1 - (b.y + b.h) / CARD_IMAGE_SIZE.h);
        t.needsUpdate = true;
      }));
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      texCache.set(id, tex);
      return tex;
    };
    const plaqueCache = new Map();
    const plaque = (text, tone) => {
      const key = `${tone}|${text}`;
      if (!plaqueCache.has(key)) plaqueCache.set(key, plaqueTexture(text, tone));
      return plaqueCache.get(key);
    };

    // Aufbau hängt an Tischanzahl, Karten pro Tisch und Spaltenzahl → bei Änderung neu
    let sig = '';
    let geo = { N: 0, R: 4, step: 1, cols: 4, rows: 2, tw: 4, td: 3 };
    let tables = [];      // [{ group, slots: [...] }]
    let bulbs = null;
    const built = new THREE.Group();
    platform.add(built);
    const disposeBuilt = () => built.children.slice().forEach((ch) => {
      built.remove(ch);
      ch.traverse((m) => {
        if (m.isInstancedMesh) m.dispose();
        if (m.geometry && !m.geometry.userData.shared) m.geometry.dispose();
        if (m.material?.userData?.own) m.material.dispose();
      });
    });
    const cardGeoBack = own(new THREE.PlaneGeometry(CW * 0.96, CH * 0.96));
    cardGeoBack.userData.shared = true;
    const frameGeo = own(new THREE.PlaneGeometry(CW + 0.16, CH + 0.16));
    frameGeo.userData.shared = true;
    const dotGeo = own(new THREE.CircleGeometry(0.11, 20));
    dotGeo.userData.shared = true;
    const holeGeo = own(new THREE.PlaneGeometry(CW * 0.96, CH * 0.96));
    holeGeo.userData.shared = true;
    const holeMat = own(new THREE.MeshStandardMaterial({ color: 0x132a52, roughness: 1 }));

    // ── Festplatz-Deko rund ums Karussell (steht fest, dreht nicht mit) ───────────
    // Nur im Ring, den der Überblick zeigt; vorne (Richtung Kamera, Winkel ≈ 0) bleibt frei,
    // damit nichts den Blick auf den eigenen Tisch verdeckt.
    const deco = new THREE.Group();
    scene.add(deco);
    const decoAnim = { balloons: [] };
    const cobbleTex = own(cobbleTexture());
    const ropeMat = own(new THREE.MeshStandardMaterial({ color: 0xd13a3a, roughness: 0.7 }));
    const stringMat = own(new THREE.LineBasicMaterial({ color: 0xf5f5f5 }));
    const balloonColors = [0xe23b4a, 0xf2c14e, 0x2f6fd6, 0x3fbf6a, 0xb45ad8];
    // Ballons: Lack mit Klarlackschicht (glänzen wie echte Latexballons)
    const balloonMats = balloonColors.map((c) => own(new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.15, sheen: 0.3 })));
    const awningTexs = [['#d8303a', '#fff4e0'], ['#2f6fd6', '#fff4e0'], ['#3fbf6a', '#fff4e0'], ['#f2a23a', '#fff4e0']]
      .map((cols) => own(stripeTexture(cols, 10)));
    const STALLS = ['Popcorn', 'Zuckerwatte', 'Lose', 'Limo'];
    const disposeDeco = () => deco.children.slice().forEach((ch) => {
      deco.remove(ch);
      ch.traverse((m) => {
        if (m.isInstancedMesh) m.dispose();
        if (m.geometry && !m.userData.sharedGeometry) m.geometry.dispose();
        if (m.material?.userData?.own) m.material.dispose();
      });
    });
    const at = (a, r, y = 0) => new THREE.Vector3(Math.sin(a) * r, y, Math.cos(a) * r);
    const inFront = (a) => Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < deg(32);
    const buildDeco = (platR) => {
      disposeDeco();
      decoAnim.balloons = [];
      // Pflasterweg rund um die Plattform
      // RingGeometry hat flache UVs über die ganze Scheibe → gleiche Wiederholung in x und y
      const pathTex = cobbleTex.clone();
      const rep = (platR + 2.4) * 2 / 0.9;
      pathTex.repeat.set(rep, rep);
      pathTex.needsUpdate = true;
      disposables.push(pathTex);
      const pathMat = new THREE.MeshStandardMaterial({ map: pathTex, roughness: 1 });
      pathMat.userData.own = true;
      assets.pbr(pathMat, 'cobblestone_floor_08', rep / 1.6, rep / 1.6);
      const ring = new THREE.Mesh(new THREE.RingGeometry(platR + 0.1, platR + 2.4, 96, 1), pathMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.035;
      pathMat.polygonOffset = true;
      pathMat.polygonOffsetFactor = -2;
      pathMat.polygonOffsetUnits = -4;
      ring.receiveShadow = true;
      deco.add(ring);
      // Seilzaun: Pfosten mit Messingkugel, rot-weißes Seil
      const fenceR = platR + 2.6;
      const postGeo = new THREE.CylinderGeometry(0.05, 0.06, 0.75, 8);
      const knobGeo = new THREE.SphereGeometry(0.08, 10, 8);
      const postCount = Math.round((fenceR * Math.PI * 2) / 1.3);
      for (let i = 0; i < postCount; i++) {
        const a = (i / postCount) * Math.PI * 2;
        const post = new THREE.Mesh(postGeo, goldMat);
        post.position.copy(at(a, fenceR, 0.375));
        const knob = new THREE.Mesh(knobGeo, goldMat);
        knob.position.copy(at(a, fenceR, 0.78));
        deco.add(post, knob);
      }
      const rope = new THREE.Mesh(new THREE.TorusGeometry(fenceR, 0.025, 6, 160), ropeMat);
      rope.rotation.x = Math.PI / 2;
      rope.position.y = 0.6;
      deco.add(rope);
      // Laternen mit Wimpelketten dazwischen
      const lampR = platR + 3.6;
      const lamps = [];
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + Math.PI / 10;
        if (inFront(a)) continue;
        const base = at(a, lampR);
        const lamp = cloneModel(lampModel);
        lamp.position.set(base.x, 0, base.z);
        lamp.rotation.y = a;
        deco.add(lamp);
        lamps.push({ a, top: new THREE.Vector3(base.x, 2.95, base.z) });
      }
      const flagGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([-0.12, 0, 0, 0.12, 0, 0, 0, -0.28, 0], 3));
      flagGeo.computeVertexNormals();
      const flagMat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.8 });
      flagMat.userData.own = true;
      const flags = [];
      for (let i = 0; i < lamps.length; i++) {
        const a = lamps[i], b = lamps[(i + 1) % lamps.length];
        // Über die freie Front keine Kette spannen
        const gap = Math.atan2(Math.sin(b.a - a.a), Math.cos(b.a - a.a));
        if (Math.abs(gap) > deg(60)) continue;
        const count = Math.max(5, Math.round(a.top.distanceTo(b.top) / 0.45));
        for (let k = 1; k < count; k++) {
          const p = k / count;
          const pos = a.top.clone().lerp(b.top, p);
          pos.y -= Math.sin(p * Math.PI) * 0.55;
          flags.push({ pos, rot: Math.atan2(b.top.x - a.top.x, b.top.z - a.top.z) + Math.PI / 2, color: ['#d8303a', '#f2c14e', '#2f6fd6', '#ffffff', '#3fbf6a'][k % 5] });
        }
      }
      if (flags.length) {
        const fm = new THREE.InstancedMesh(flagGeo, flagMat, flags.length);
        const dummy = new THREE.Object3D();
        flags.forEach((f, i) => {
          dummy.position.copy(f.pos);
          dummy.rotation.set(0, f.rot, 0);
          dummy.updateMatrix();
          fm.setMatrixAt(i, dummy.matrix);
          fm.setColorAt(i, new THREE.Color(f.color));
        });
        deco.add(fm);
      }
      // Buden mit gestreifter Markise und Schild — hinten und an den Seiten
      const stallR = platR + 6.2;
      [deg(115), deg(160), deg(205), deg(250)].forEach((a, i) => {
        const g = new THREE.Group();
        g.position.copy(at(a, stallR));
        g.rotation.y = a + Math.PI; // Front zur Mitte
        const counter = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.0, 1.0), woodMat);
        counter.position.y = 0.5;
        const back = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.2, 0.12), woodMat);
        back.position.set(0, 1.1, -0.6);
        g.add(counter, back);
        [[-1.0, 0.45], [1.0, 0.45]].forEach(([x, z]) => {
          const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 8), woodMat);
          p.position.set(x, 1.1, z);
          g.add(p);
        });
        const awnMat = new THREE.MeshStandardMaterial({ map: awningTexs[i % awningTexs.length], roughness: 0.8, side: THREE.DoubleSide });
        awnMat.userData.own = true;
        const awn = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.08, 1.5), awnMat);
        awn.position.set(0, 2.35, 0);
        awn.rotation.x = 0.28;
        g.add(awn);
        const signMat = new THREE.SpriteMaterial({ map: plaque(STALLS[i % STALLS.length], ['#d8303a', '#2f6fd6', '#3fbf6a', '#f2a23a'][i % 4]), transparent: true });
        signMat.userData.own = true;
        const sign = new THREE.Sprite(signMat);
        sign.position.set(0, 2.95, 0);
        sign.scale.set(1.8, 1.8 * 112 / 512, 1);
        g.add(sign);
        // Strohballen und Kübel neben der Bude
        const crate = cloneModel(crateModel);
        crate.position.set(1.6, 0, 0.35);
        crate.rotation.y = 0.4;
        const crate2 = cloneModel(crateModel);
        crate2.position.set(1.55, 0.55, 0.4);
        crate2.rotation.y = -0.2;
        crate2.scale.setScalar(0.85);
        const table = cloneModel(tableModel);
        table.position.set(-0.2, 0, 2.4);
        table.rotation.y = Math.PI / 2 + 0.15;
        g.add(crate, crate2, table);
        deco.add(g);
      });
      // Blumenkübel am Zaun (nicht vorne)
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + 0.13;
        if (inFront(a)) continue;
        const p = at(a, fenceR + 0.55);
        const plant = cloneModel(plantModel);
        plant.position.set(p.x, 0, p.z);
        plant.rotation.y = a * 3.7;
        deco.add(plant);
      }
      // Ballontrauben an einigen Laternen
      lamps.filter((_, i) => i % 2 === 0).forEach((l, li) => {
        for (let k = 0; k < 5; k++) {
          const off = new THREE.Vector3(Math.cos(k * 1.3 + li) * 0.35, 3.9 + (k % 3) * 0.32, Math.sin(k * 1.3 + li) * 0.35);
          const b = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 12), balloonMats[(k + li) % balloonMats.length]);
          b.scale.set(1, 1.18, 1);
          const anchor = new THREE.Vector3(l.top.x, 3.3, l.top.z);
          b.position.copy(anchor).add(off);
          const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([anchor, b.position.clone().add(new THREE.Vector3(0, -0.24, 0))]), stringMat);
          deco.add(b, line);
          decoAnim.balloons.push({ mesh: b, base: b.position.clone(), phase: k + li * 1.7 });
        }
      });
    };

    // Raster nur bei deutlich anderem Format neu wählen (z. B. Handy gedreht). Die Fläche ändert
    // ihre Höhe auch beim Rundenwechsel (Aktionsleiste verschwindet) — sonst sprang das
    // Kartenraster mitten in der Drehung z. B. von 2 auf 3 Reihen.
    let layoutAspect = null;
    let layoutCols = 4;
    let layoutPer = 0;
    const build = (N, perTable, aspect) => {
      if (layoutAspect == null || perTable !== layoutPer || Math.abs(Math.log(aspect / layoutAspect)) > Math.log(1.6)) {
        layoutAspect = aspect;
        layoutPer = perTable;
        layoutCols = chooseCols(perTable, aspect);
      }
      const cols = layoutCols;
      const s = `${N}|${perTable}|${cols}`;
      if (s === sig) return false;
      sig = s;
      disposeBuilt();
      const rows = Math.ceil(perTable / cols);
      const tw = cols * CW + (cols - 1) * GAP + PAD * 2;
      const td = rows * CH + (rows - 1) * GAP + PAD * 2;
      const step = (Math.PI * 2) / Math.max(1, N);
      // Radius: Tische dürfen sich am Rand nicht berühren und innen nicht an die Säule stoßen
      const R = Math.max(td / 2 + 1.7, (N * (tw + 1.3)) / (Math.PI * 2), 3.2);
      geo = { N, R, step, cols, rows, tw, td };
      const platR = R + td / 2 + 0.7;
      // Plattform
      const platTex = platformTexture(Math.max(8, N * 2));
      const platTopMat = new THREE.MeshStandardMaterial({ map: platTex, roughness: 0.8 });
      platTopMat.userData.own = true;
      disposables.push(platTex);
      const plat = new THREE.Mesh(new THREE.CylinderGeometry(platR, platR, PLATFORM_TOP, 72), [redMat, platTopMat, redMat]);
      plat.position.y = PLATFORM_TOP / 2;
      plat.receiveShadow = true;
      built.add(plat);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(platR, 0.06, 8, 96), goldMat);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = PLATFORM_TOP;
      built.add(rim);
      // Säule mit Goldringen und gestreiftem Dach
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, POLE_H, 24), goldMat);
      pole.position.y = POLE_H / 2;
      pole.castShadow = true;
      built.add(pole);
      [0.6, 1.6, 2.6].forEach((y) => {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.06, 8, 24), redMat);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = y;
        built.add(ring);
      });
      const roofR = Math.min(2.2, R - td / 2 - 0.2);
      const roofTex = stripeTexture();
      disposables.push(roofTex);
      const roofMat = new THREE.MeshStandardMaterial({ map: roofTex, roughness: 0.85 });
      roofMat.userData.own = true;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(roofR, 1.2, 32), roofMat);
      roof.position.y = POLE_H + 0.6;
      roof.castShadow = true;
      built.add(roof);
      const skirt = new THREE.Mesh(new THREE.CylinderGeometry(roofR, roofR, 0.28, 32, 1, true), roofMat);
      skirt.position.y = POLE_H - 0.12;
      built.add(skirt);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), goldMat);
      knob.position.y = POLE_H + 1.3;
      built.add(knob);
      // Wimpelketten von der Säule zum Rand (zwischen den Tischen)
      const flagGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([-0.11, 0, 0, 0.11, 0, 0, 0, -0.26, 0], 3));
      flagGeo.computeVertexNormals();
      // unbeleuchtet: von unten sah man sonst die dunkle Schattenseite (wirkte wie dunkle Klumpen an der Säule)
      const flagMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
      flagMat.userData.own = true;
      const flags = [];
      for (let i = 0; i < N; i++) {
        const a = (i + 0.5) * step;
        const from = new THREE.Vector3(0, POLE_H - 0.1, 0);
        const to = new THREE.Vector3(Math.sin(a) * (platR - 0.1), 2.3, Math.cos(a) * (platR - 0.1));
        const count = Math.max(6, Math.round(from.distanceTo(to) / 0.42));
        for (let k = 1; k < count; k++) {
          const p = k / count;
          if (p < 0.22) continue; // dicht an der Säule drängten sich die Fähnchen zu einem Klumpen
          const pos = from.clone().lerp(to, p);
          pos.y -= Math.sin(p * Math.PI) * 0.35; // durchhängende Schnur
          flags.push({ pos, a, color: ['#d8303a', '#f2c14e', '#2f6fd6', '#ffffff'][k % 4] });
        }
      }
      const flagMesh = new THREE.InstancedMesh(flagGeo, flagMat, flags.length);
      const dummy = new THREE.Object3D();
      flags.forEach((f, i) => {
        dummy.position.copy(f.pos);
        dummy.rotation.set(0, f.a + Math.PI / 2, 0);
        dummy.updateMatrix();
        flagMesh.setMatrixAt(i, dummy.matrix);
        flagMesh.setColorAt(i, new THREE.Color(f.color));
      });
      built.add(flagMesh);
      // Lauflichter am Plattformrand
      const bulbCount = Math.round((platR * Math.PI * 2) / 0.45);
      const bulbMat = new THREE.MeshBasicMaterial({ toneMapped: false });
      bulbMat.userData.own = true;
      bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.075, 10, 8), bulbMat, bulbCount);
      for (let i = 0; i < bulbCount; i++) {
        const a = (i / bulbCount) * Math.PI * 2;
        dummy.position.set(Math.sin(a) * (platR + 0.02), PLATFORM_TOP * 0.55, Math.cos(a) * (platR + 0.02));
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        bulbs.setMatrixAt(i, dummy.matrix);
        bulbs.setColorAt(i, new THREE.Color(0xfff1b0));
      }
      built.add(bulbs);
      // Tische
      const topGeo = new THREE.BoxGeometry(tw, 0.1, td);
      const feltGeo = new THREE.PlaneGeometry(tw - 0.2, td - 0.2).rotateX(-Math.PI / 2);
      const legGeo = new THREE.CylinderGeometry(0.06, 0.08, TABLE_Y - PLATFORM_TOP - 0.1, 10);
      tables = [];
      for (let ti = 0; ti < N; ti++) {
        const a = ti * step;
        const group = new THREE.Group();
        group.position.set(Math.sin(a) * R, 0, Math.cos(a) * R);
        group.rotation.y = a;
        const top = new THREE.Mesh(topGeo, woodMat);
        top.position.y = TABLE_Y - 0.05;
        top.castShadow = true;
        top.receiveShadow = true;
        const felt = new THREE.Mesh(feltGeo, feltMat);
        felt.position.y = TABLE_Y + 0.01;
        felt.receiveShadow = true;
        group.add(top, felt);
        [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sz]) => {
          const leg = new THREE.Mesh(legGeo, woodMat);
          leg.position.set(sx * (tw / 2 - 0.2), PLATFORM_TOP + (TABLE_Y - PLATFORM_TOP - 0.1) / 2, sz * (td / 2 - 0.2));
          leg.castShadow = true;
          group.add(leg);
        });
        const slots = [];
        for (let si = 0; si < perTable; si++) {
          const col = si % cols, row = Math.floor(si / cols);
          const x = (col - (cols - 1) / 2) * (CW + GAP);
          const z = (row - (rows - 1) / 2) * (CH + GAP);
          const slot = new THREE.Group();
          slot.position.set(x, TABLE_Y + 0.02, z);
          const flat = new THREE.Group();
          flat.rotation.x = -Math.PI / 2;
          slot.add(flat);
          const lift = new THREE.Group();
          flat.add(lift);
          const flip = new THREE.Group();
          lift.add(flip);
          const frontMat = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.35, color: 0xf2f2f2, toneMapped: false });
          frontMat.userData.own = true;
          const front = new THREE.Mesh(new THREE.PlaneGeometry(CW * 0.96, CH * 0.96), frontMat);
          front.position.z = 0.004;
          front.userData = { ti, si };
          front.receiveShadow = true;
          const back = new THREE.Mesh(cardGeoBack, backMat);
          back.rotation.y = Math.PI;
          back.position.z = -0.004;
          back.userData = { ti, si };
          flip.add(front, back);
          const frameMat = new THREE.MeshBasicMaterial({ map: ringTex, color: 0x22d3ee, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
          frameMat.userData.own = true;
          const frame = new THREE.Mesh(frameGeo, frameMat);
          frame.position.z = -0.002;
          lift.add(frame);
          const hole = new THREE.Mesh(holeGeo, holeMat);
          hole.position.z = 0.001;
          hole.visible = false;
          flat.add(hole);
          const dotMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
          dotMat.userData.own = true;
          const dot = new THREE.Mesh(dotGeo, dotMat);
          dot.position.z = 0.004;
          dot.visible = false;
          flat.add(dot);
          group.add(slot);
          slots.push({ ti, si, slot, lift, flip, front, frontMat, back, frame, frameMat, hole, dot, dotMat, cardId: null, rarity: null, known: false, flipAt: null, taken: false, takenAt: null, hover: 0, sel: 0 });
        }
        built.add(group);
        tables.push({ group, slots });
      }
      buildDeco(platR);
      // Schatten-Kamera passend zur Plattform
      const sc = sun.shadow.camera;
      sc.left = -platR - 1; sc.right = platR + 1; sc.top = platR + 1; sc.bottom = -platR - 1;
      sc.near = 1; sc.far = 60;
      sc.updateProjectionMatrix();
      return true;
    };

    // ── Namensschilder an den festen Plätzen (drehen sich NICHT mit) ──────────────
    const seatsGroup = new THREE.Group();
    root.add(seatsGroup);
    let seatSig = '';
    let seatObjs = [];
    const buildSeats = (owners, players, myId) => {
      const s = `${geo.R}|${owners.join(',')}|${players.map((p) => `${p.id}:${p.name}:${p.color}`).join(',')}`;
      if (s === seatSig) return;
      seatSig = s;
      seatObjs.forEach((o) => { seatsGroup.remove(o.plate, o.check); o.plate.material.dispose(); });
      seatObjs = owners.map((ownerId, seat) => {
        const pl = players.find((p) => p.id === ownerId);
        const mine = ownerId === myId;
        const mat = new THREE.SpriteMaterial({ map: plaque(mine ? propsRef.current.youLabel || 'Du' : (pl?.name || '?'), pl?.color || '#8b8b8b'), transparent: true, depthWrite: false });
        const plate = new THREE.Sprite(mat);
        const a = seat * geo.step;
        const r = geo.R + geo.td / 2 + 1.25;
        plate.position.set(Math.sin(a) * r, 2.0, Math.cos(a) * r);
        plate.scale.set(1.9, 1.9 * 112 / 512, 1);
        plate.renderOrder = 20;
        const check = new THREE.Sprite(checkMat);
        check.position.set(plate.position.x, 2.42, plate.position.z);
        check.scale.set(0.42, 0.42, 1);
        check.visible = false;
        check.renderOrder = 21;
        seatsGroup.add(plate, check);
        return { ownerId, plate, check, mine, color: pl?.color || '#ffffff' };
      });
    };

    // ── Picks beim Rundenwechsel (schweben über den Tischen, fliegen zum Schild) ──────
    let picks = [];
    let transRound = null;
    let transStart = 0;
    const clearPicks = () => {
      picks.forEach((p) => { root.remove(p.group); p.frontMat.dispose(); p.nameMat.dispose(); });
      picks = [];
    };
    const tmp = new THREE.Vector3();
    const startPicks = (s) => {
      clearPicks();
      Object.entries(s.picksThisRound || {}).forEach(([pid, pk]) => {
        if (pk.ghost || !pk.card) return;
        const t = tables[pk.tableIndex];
        const sl = t?.slots[pk.slotIdx];
        const seat = seatObjs.find((o) => o.ownerId === pid);
        if (!sl || !seat) return;
        const from = root.worldToLocal(sl.slot.getWorldPosition(new THREE.Vector3()));
        const group = new THREE.Group();
        const { w, h } = artSize(pk.card.rarity);
        const frontMat = new THREE.MeshBasicMaterial({ map: cardTex(pk.card.id, pk.card.rarity), transparent: true, alphaTest: 0.3, toneMapped: false });
        const front = new THREE.Mesh(new THREE.PlaneGeometry(w, h), frontMat);
        const back = new THREE.Mesh(cardGeoBack, backMat);
        back.rotation.y = Math.PI;
        const flip = new THREE.Group();
        flip.add(front, back);
        const nameMat = new THREE.SpriteMaterial({ map: plaque(seat.mine ? propsRef.current.youLabel || 'Du' : (s.players.find((p) => p.id === pid)?.name || '?'), seat.color), transparent: true, depthWrite: false, depthTest: false });
        const name = new THREE.Sprite(nameMat);
        name.scale.set(1.5, 1.5 * 112 / 512, 1);
        name.position.y = -0.72;
        name.renderOrder = 30;
        group.add(flip, name);
        group.position.copy(from);
        group.visible = false;
        root.add(group);
        picks.push({ group, flip, front, frontMat, name, nameMat, from, to: seat.plate.position.clone(), delay: picks.length * 90 });
      });
    };

    // ── Bildschirm-Rechteck eines eigenen Platzes (für Effekte im DOM) ────────────
    let myTable = -1;
    api.getSlotRect = (si) => {
      const sl = tables[myTable]?.slots[si];
      if (!sl) return null;
      const rect = renderer.domElement.getBoundingClientRect();
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy]) => {
        tmp.set(sx * CW / 2, sy * CH / 2, 0);
        sl.lift.localToWorld(tmp);
        tmp.project(camera);
        const x = rect.left + (tmp.x + 1) / 2 * rect.width;
        const y = rect.top + (1 - tmp.y) / 2 * rect.height;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      });
      return new DOMRect(minX, minY, maxX - minX, maxY - minY);
    };

    // ── Zeiger: nur die eigenen, noch freien Plätze ─────────────────────────────
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let hoverSlot = null;
    const pickSlot = (e) => {
      const P = propsRef.current;
      if (!P.canAct || myTable < 0) return null;
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const targets = [];
      tables[myTable]?.slots.forEach((sl) => { if (!sl.taken) targets.push(sl.front, sl.back); });
      const hit = raycaster.intersectObjects(targets, false)[0];
      return hit ? hit.object.userData.si : null;
    };
    const onMove = (e) => { hoverSlot = pickSlot(e); renderer.domElement.style.cursor = hoverSlot != null ? 'pointer' : 'default'; };
    const onLeave = () => { hoverSlot = null; renderer.domElement.style.cursor = 'default'; };
    const onClick = (e) => {
      const si = pickSlot(e);
      if (si != null) propsRef.current.onSlotClick?.(si);
    };
    renderer.domElement.addEventListener('pointermove', onMove);
    renderer.domElement.addEventListener('pointerleave', onLeave);
    renderer.domElement.addEventListener('click', onClick);

    // ── Größe ────────────────────────────────────────────────────────────────
    let aspect = 1;
    const layout = () => {
      const w = container.clientWidth || 1, h = container.clientHeight || 1;
      renderer.setSize(w, h, false);
      post.setSize(w, h);
      renderer.domElement.style.width = `${w}px`;
      renderer.domElement.style.height = `${h}px`;
      aspect = w / h;
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
    };
    const adaptQuality = createQualityGovernor(renderer, Math.min(window.devicePixelRatio || 1, 1.75), () => layout());
    layout();
    let warmed = false; // kein Warten auf Downloads — die Szene startet sofort
    // setSize leert die Zeichenfläche → erst im nächsten Frame vor dem Zeichnen (kein Blitzen)
    let sizeDirty = false;
    const ro = new ResizeObserver(() => { sizeDirty = true; });
    ro.observe(container);

    // ── Kamera: eigener Tisch ↔ Überblick ─────────────────────────────────────
    const TAN = Math.tan(deg(FOV / 2));
    const seatView = () => {
      const bw = geo.cols * CW + (geo.cols - 1) * GAP + 0.5;
      const bh = (geo.rows * CH + (geo.rows - 1) * GAP + 0.5) * Math.sin(SEAT_PITCH);
      // Etwas Luft um den Tisch: Nachbartische und Säule gehören mit ins Bild
      const d = Math.max((bh / 2) / TAN, (bw / 2) / (TAN * aspect)) * 1.45 + 0.6;
      const look = new THREE.Vector3(0, TABLE_Y, geo.R - 0.15);
      return { look, pos: look.clone().add(new THREE.Vector3(0, Math.sin(SEAT_PITCH) * d, Math.cos(SEAT_PITCH) * d)) };
    };
    const overView = () => {
      // bis zu den Namensschildern (Abstand R + td/2 + 1,25, halbe Schildbreite 0,95) plus Rand —
      // die Schilder schweben höher und damit näher an der Kamera, wirken also breiter
      const r = geo.R + geo.td / 2 + 3.3;
      const d = Math.max((r * Math.sin(OVER_PITCH) + 1.5) / TAN, r / (TAN * aspect)) * 1.02;
      const look = new THREE.Vector3(0, 0.6, 0);
      return { look, pos: look.clone().add(new THREE.Vector3(0, Math.sin(OVER_PITCH) * d, Math.cos(OVER_PITCH) * d)) };
    };
    const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
    let camInit = false;

    // ── Schleife ──────────────────────────────────────────────────────────────
    let raf = 0;
    let last = performance.now();
    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (sizeDirty) { sizeDirty = false; layout(); }
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const off = animOff();
      const P = propsRef.current;
      const s = P.state;
      if (!s?.tables?.length) { post.render(dt); return; }
      if (!warmed) {
        // Erst bauen, dann vorwärmen (Shader + Texturen) — danach sichtbar
        warmed = true;
        build(s.tables.length, s.tables[0].slots.length, aspect);
        warmUp(renderer, scene, camera, post);
        return;
      }
      if (renderer.domElement.style.opacity !== '1') renderer.domElement.style.opacity = '1';
      adaptQuality(dt);

      const N = s.tables.length;
      const perTable = s.tables[0].slots.length;
      if (build(N, perTable, aspect)) seatSig = '';
      // Wer sitzt an welchem Platz: Tisch ti gehört diese Runde Platz (ti + round − 1) mod N
      const owners = Array.from({ length: N }, (_, seat) => s.tables[((seat - (s.round - 1)) % N + N) % N]?.ownerId ?? null);
      buildSeats(owners, s.players, P.myPlayerId);
      myTable = s.myTableIndex;
      const spectator = myTable < 0;
      const mySeat = spectator ? 0 : owners.indexOf(P.myPlayerId);
      root.rotation.y = -Math.max(0, mySeat) * geo.step;

      // Rundenwechsel-Zeitachse
      if (s.phase === 'transition' && transRound !== s.round) {
        transRound = s.round;
        transStart = now;
        startPicks(s);
      }
      if (s.phase !== 'transition' && transRound !== null && transRound !== s.round) { transRound = null; clearPicks(); }
      const tms = s.phase === 'transition' ? (off ? 4000 : now - transStart) : null;

      // Plattform: Grundstellung der Runde, beim Wechsel schwungvoll einen Platz weiter
      let platAngle = (s.round - 1) * geo.step;
      if (tms != null) platAngle += geo.step * (off ? 1 : easeOutBack(phaseP(tms, T_SPIN)));
      platform.rotation.y = platAngle;

      // Kamera
      const seatV = seatView(), overV = overView();
      let o = spectator || s.finished ? 1 : 0;
      if (tms != null && !spectator) o = easeIO(phaseP(tms, T_UP)) * (1 - easeIO(phaseP(tms, T_DOWN)));
      // Kamera in Weltkoordinaten: root hat den eigenen Platz bereits nach vorn (+z) gedreht
      const tPos = seatV.pos.clone().lerp(overV.pos, o);
      const tLook = seatV.look.clone().lerp(overV.look, o);
      if (!camInit || off) { camPos.copy(tPos); camLook.copy(tLook); camInit = true; }
      else {
        // Während des Wechsels folgt die Kamera der Zeitachse direkt, sonst weich
        const k = tms != null ? 1 : 1 - Math.exp(-dt * 6);
        camPos.lerp(tPos, k);
        camLook.lerp(tLook, k);
      }
      camera.position.copy(camPos);
      camera.lookAt(camLook);

      // Lauflichter: jede dritte Birne an, das Muster wandert
      if (bulbs) {
        const c = new THREE.Color();
        const phase = off ? 0 : Math.floor(now / 220);
        for (let i = 0; i < bulbs.count; i++) {
          c.set((i + phase) % 3 === 0 ? 0xfff6c8 : 0xc98a2e);
          bulbs.setColorAt(i, c);
        }
        bulbs.instanceColor.needsUpdate = true;
      }

      // Ballons schwingen leicht im Wind
      if (!off) decoAnim.balloons.forEach((b) => {
        b.mesh.position.set(b.base.x + Math.sin(now / 900 + b.phase) * 0.05, b.base.y + Math.sin(now / 700 + b.phase * 1.3) * 0.04, b.base.z);
      });

      // Namensschilder: eigenes Schild nur im Überblick, Haken bei abgegebener Wahl
      seatObjs.forEach((so) => {
        so.plate.material.opacity = so.mine ? o : 1;
        so.plate.visible = !so.mine || o > 0.05;
        so.check.visible = s.phase === 'picking' && !!s.hasPicked?.[so.ownerId] && (!so.mine || o > 0.05);
      });

      // Plätze abgleichen
      const pulse = 0.5 + Math.sin(now / 260) * 0.5;      tables.forEach((t, ti) => {
        const st = s.tables[ti];
        if (!st) return;
        t.slots.forEach((sl) => {
          const ss = st.slots[sl.si];
          if (!ss) return;
          // Kartenidentität: nur eigene Aufdeckungen (bzw. alles für Zuschauer) kommen an
          const card = ss.card;
          if (card && card.id !== sl.cardId) {
            sl.cardId = card.id;
            sl.rarity = card.rarity;
            const { w, h } = artSize(card.rarity);
            sl.front.geometry.dispose();
            sl.front.geometry = new THREE.PlaneGeometry(w, h);
            sl.frontMat.map = cardTex(card.id, card.rarity);
            sl.frontMat.needsUpdate = true;
          }
          const known = !!card;
          if (known && !sl.known) { sl.known = true; sl.flipAt = off ? -1e9 : now; }
          if (!known && sl.known) { sl.known = false; sl.flipAt = null; sl.cardId = null; }
          if (ss.taken && !sl.taken) { sl.taken = true; sl.takenAt = off || tms != null ? -1e9 : now; }
          if (!ss.taken && sl.taken) { sl.taken = false; sl.takenAt = null; }

          // Umdrehen: verdeckt = Rückseite oben (π), aufgedeckt = 0
          let rotY = Math.PI;
          if (sl.known) {
            const fp = sl.flipAt == null ? 1 : clamp01((now - sl.flipAt) / (FLIP_S * 1000));
            rotY = Math.PI * (1 - easeOutBack(fp));
          }
          sl.flip.rotation.y = rotY;
          const mine = ti === myTable && !spectator;
          const selected = mine && P.selectedSlot === sl.si && !sl.taken;
          const hovered = mine && hoverSlot === sl.si && P.canAct && !sl.taken;
          const kk = off ? 1 : 1 - Math.exp(-dt * 12);
          sl.hover += ((hovered ? 1 : 0) - sl.hover) * kk;
          sl.sel += ((selected ? 1 : 0) - sl.sel) * kk;
          // Genommen: Karte hebt ab und verschwindet, zurück bleibt die Mulde mit Farbpunkt
          let liftZ = 0.02 + sl.hover * 0.06 + sl.sel * 0.16;
          let vis = true;
          if (sl.taken) {
            const tp = sl.takenAt == null ? 1 : clamp01((now - sl.takenAt) / 600);
            liftZ = 0.02 + tp * 1.2;
            vis = tp < 1;
            sl.frontMat.opacity = 1 - tp;
            sl.hole.visible = true;
            sl.dot.visible = !!ss.takenBy;
            const taker = s.players.find((p) => p.id === ss.takenBy);
            if (taker) sl.dotMat.color.set(taker.color || '#ffffff');
          } else {
            sl.frontMat.opacity = 1;
            sl.hole.visible = false;
            sl.dot.visible = false;
          }
          sl.lift.position.z = liftZ;
          sl.flip.visible = vis;
          sl.frameMat.opacity = sl.taken ? 0 : Math.max(sl.sel, mine && P.canAct ? sl.hover * 0.7 : 0);
          sl.frameMat.color.set(sl.sel > 0.5 ? '#22d3ee' : '#ffffff');
          if (!sl.taken && mine && P.canAct && sl.sel < 0.5 && sl.hover < 0.1) sl.frameMat.opacity = 0.12 + pulse * 0.1;
          if (sl.known && !sl.taken && sl.rarity && sl.sel < 0.5 && sl.hover < 0.1 && mine) {
            sl.frameMat.color.set(RARITY_COLOR[sl.rarity] || '#ffffff');
            sl.frameMat.opacity = 0.7;
          }
        });
      });

      // Picks: aufsteigen + umdrehen, kurz zeigen, zum Namensschild fliegen
      picks.forEach((p) => {
        const ms = (tms ?? 0) - p.delay;
        const rise = easeIO(phaseP(ms, T_RISE));
        const fly = easeIO(phaseP(ms, T_FLY));
        p.group.visible = ms > T_RISE[0] && fly < 1;
        if (!p.group.visible) return;
        const hover = tmp.copy(p.from).add(new THREE.Vector3(0, 0.15 + rise * 1.5, 0));
        p.group.position.copy(hover).lerp(p.to, fly);
        p.group.position.y += Math.sin(fly * Math.PI) * 0.8;
        // zur Kamera ausrichten (in root-Koordinaten)
        p.group.quaternion.copy(root.quaternion).invert().multiply(camera.quaternion);
        p.flip.rotation.y = Math.PI * (1 - easeOutBack(clamp01((ms - T_RISE[0] - 300) / 500)));
        const sc = 2.0 * (1 - fly * 0.75);
        p.group.scale.setScalar(sc);
        p.nameMat.opacity = 1 - fly;
      });

      post.render(dt);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointermove', onMove);
      renderer.domElement.removeEventListener('pointerleave', onLeave);
      renderer.domElement.removeEventListener('click', onClick);
      clearPicks();
      seatObjs.forEach((o) => o.plate.material.dispose());
      disposeBuilt();
      disposeDeco();
      plaqueCache.forEach((t) => t.dispose());
      disposables.forEach((d) => d.dispose?.());
      assets.dispose();
      post.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      api.getSlotRect = () => null;
    };
  }, []);

  return <div ref={containerRef} className="absolute inset-0" />;
});

export default Carousel3D;
