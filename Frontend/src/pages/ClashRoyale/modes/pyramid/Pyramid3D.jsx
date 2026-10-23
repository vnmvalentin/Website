// Pyramidendraft in 3D: eine Stufenpyramide aus Karten in der Grabkammer einer großen Pyramide.
//
//   • Zum Start eine Kamerafahrt: draußen in der Wüste bei Sonnenuntergang über den Prozessionsweg
//     zwischen Obelisken auf das Portal zu, durch den Fackelgang hinein in die Kammer, bis vor die
//     Kartenpyramide. Klick überspringt. Nur bei frischem Spiel (sonst direkt in der Kammer).
//     Der Server gibt dem ersten Zug dafür Zeit dazu (PYRAMID_INTRO_BONUS_S).
//   • Danach steht die Kamera frontal und rahmt die Reihen, in denen gerade gewählt werden kann
//     (plus die nächsten darüber), und pendelt nur minimal (Schwenken verzerrt die Artworks).
//   • Jede Karte ist ein eigener Steinquader vor ihrer Stufe. Verdeckte Steine zeigen die
//     Kartenrückseite und drehen sich beim Aufdecken um die Hochachse; genommene und blockierte
//     drehen weiter (genommen = Karte mit Namensschild, blockiert = Verbotszeichen).
//
// Optik: Fototexturen + Himmel + Modelle (CC0, public/media/cr3d), Schatten, Nachbearbeitung über
// scene3d/kit. Reine Darstellung — Zustand und Server bleiben in PyramidDraft.jsx. Ohne WebGL
// meldet onUnsupported(), dann zeigt PyramidDraft die 2D-Pyramide.
import React, { useEffect, useImperativeHandle, useRef } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { CARD_FRAME_BOX, CARD_IMAGE_SIZE } from '../cardCrop';
import { plaqueTexture, frameRingTexture } from '../auction/auctionTextures';
import {
  glyphBandTexture, friezeTexture, starCeiling, columnTexture, wingedSunTexture, sparkTexture, forbiddenTexture,
} from './pyramidTextures';
import {
  createPostFX, cloneModel, flameMaterial, beamMaterial, monotoneSpline, smoothstep, rng, warmUp, createQualityGovernor,
} from '../scene3d/kit';
import { createCrAssets } from '../scene3d/crAssets';
import { playSound } from '../../ui/sound';

const cardTextureUrl = (id) => `/api/clash/card-img/${encodeURIComponent(id)}`;
const animOff = () => document.documentElement.dataset.crAnim === 'off';
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const easeOutBack = (t) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2;

const CELL_W = 1.05;          // Abstand zweier Karten in einer Reihe
const STEP_H = 1.2;           // Höhe einer Stufe
const STEP_D = 0.75;          // so weit springt jede Stufe nach hinten
const CARD_H = 0.98;
// Kartenstein: dreht sich in seiner Zelle, ohne in die Nachbarn zu ragen (√(SW²+SD²)/2 < CELL_W/2)
const STONE_W = 0.98, STONE_H = 1.12, STONE_D = 0.3;
const PAN_X = 0.15;
const FOV = 46;
const TAN = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
const FLIP_S = 0.55, TURN_S = 0.7;
const CARD_GLOW = 0.1;

// Welt: Kammer vorne bis FRONT_Z, Gang bis zum Portal, Außenpyramide drumherum
const FRONT_Z = 32;                 // Vorderwand der Kammer (weit genug für Hochformat-Kamera)
const CW = 3.2, CH = 4.2;           // Gang: Breite, Höhe
const SHELL_C = 10, SHELL_S = 48, SHELL_H = 56;  // Außenpyramide: Mitte z, halbe Basis, Höhe
const PORTAL_Z = 61, PORTAL_W = 11, PORTAL_H = 8.5, PORTAL_BACK = 48;
const INTRO_S = 3.0;   // kurz: startet direkt vor dem Portal (Nutzerwunsch), nicht mehr weit draußen in der Wüste
// Sonne im Himmelsbild (qwantani_sunset): u = 0,60, knapp über dem Horizont. Gewünschte Richtung:
// links hinter der Pyramide — die linke Flanke glüht, die Front liegt im kühlen Schatten, das
// Feuer am Portal leuchtet davor.
const SKY_SUN_U = 0.6;
const SUN_DIR = new THREE.Vector3(-0.8, 0.12, -0.55).normalize();

function cardSize(rarity) {
  const box = CARD_FRAME_BOX[rarity] || CARD_FRAME_BOX.Common;
  return { w: CARD_H * (box.w / box.h), h: CARD_H };
}

/** Quader mit UVs in Welteinheiten (Textur wiederholt sich je `unit` Meter statt zu strecken). */
function worldBox(w, h, d, unit = 3) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  // Flächen: +x, -x, +y, -y, +z, -z — je 4 Ecken
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uv.getX(i) * dims[f][0] / unit, uv.getY(i) * dims[f][1] / unit);
    }
  }
  return g;
}

/** Fläche mit UVs in Welteinheiten. */
function worldPlane(w, h, unit = 3) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / unit, uv.getY(i) * h / unit);
  return g;
}

/** Dünenhöhe: flach um die Pyramide und den Prozessionsweg, nach außen höher. */
function duneHeight(x, z) {
  const n = Math.sin(x * 0.021 + z * 0.013) * 3.2 + Math.sin(x * 0.047 - z * 0.031 + 1.7) * 1.8
    + Math.sin(x * 0.093 + z * 0.071 + 0.4) * 0.7 + Math.sin(z * 0.017 - 0.6) * 2.4 + Math.sin(x * 0.011 - 2) * 3;
  const dx = Math.max(0, Math.abs(x) - SHELL_S), dz = Math.max(0, Math.abs(z - SHELL_C) - SHELL_S);
  const dp = Math.hypot(dx, dz);
  const mPyr = smoothstep(6, 45, dp);
  const mPath = z > SHELL_C ? smoothstep(9, 34, Math.abs(x)) : 1;
  const far = 1 + smoothstep(90, 300, Math.hypot(x, z - SHELL_C)) * 2.2;
  return Math.max(0, n + 2.5) * Math.min(mPyr, mPath) * far - 0.04;
}

/**
 * @param {Array}    props.rows         state.rows (Reihe 0 = unten)
 * @param {Set}      props.clickable    Schlüssel "r,c" der gerade wählbaren Felder
 * @param {object}   props.colors       Spieler-ID → Farbe
 * @param {object}   props.names        Spieler-ID → Name (Schild auf genommenen Steinen)
 * @param {Map}      props.chatOptions  "r,c" → { n, count, leading } (Chat-Abstimmung)
 * @param {Function} props.onPick       (r, c) => void
 * @param {string}   props.unknownImg   Rückseite verdeckter Karten
 * @param {Function} props.onUnsupported
 */
const Pyramid3D = React.forwardRef(function Pyramid3D(props, ref) {
  const containerRef = useRef(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const apiRef = useRef({ getCellRect: () => null });
  useImperativeHandle(ref, () => ({ getCellRect: (r, c) => apiRef.current.getCellRect(r, c) }), []);

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
    // Neutral statt ACES: Kartenartworks behalten ihre Farben (ACES bleicht und verschiebt)
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    const cvs = renderer.domElement;
    cvs.style.display = 'block';
    cvs.style.touchAction = 'none';
    container.appendChild(cvs);

    const disposables = [];
    const own = (x) => { disposables.push(x); return x; };
    const scene = new THREE.Scene();
    const INT_FOG = new THREE.Color(0x140b05);
    const EXT_FOG = new THREE.Color(0xc9a27c);
    scene.background = new THREE.Color(0x7a8cab);
    scene.fog = new THREE.Fog(EXT_FOG.clone(), 80, 600);
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 900);
    const post = createPostFX(renderer, scene, camera, { bloom: { strength: 0.38, radius: 0.5, threshold: 1.1 }, vignette: 0.32 });
    // Clash-Royale-Look: gemalte Texturen und Objekte, im Code erzeugt (keine Downloads, kein Warten)
    const assets = createCrAssets(renderer);

    // Himmel drehen, bis die Sonne aus SUN_DIR kommt (Equirect: φ = (u − 0,5)·2π = atan2(z, x))
    const phiSky = (SKY_SUN_U - 0.5) * Math.PI * 2;
    const phiWant = Math.atan2(SUN_DIR.z, SUN_DIR.x);
    scene.backgroundRotation.y = phiSky - phiWant;
    scene.environmentRotation.y = phiSky - phiWant;
    assets.sky(scene, 'desert', { top: 0x3b84e6, horizon: 0xffd7a0 });

    // ── Licht ─────────────────────────────────────────────────────────────────
    // Außen: tiefe Abendsonne + Himmelslicht. Innen: warmes Grundlicht, Strahl von oben, Feuer.
    // Beide Sätze werden je nach Kameraposition überblendet (Wände blocken kein Licht ohne Schatten).
    const extSun = new THREE.DirectionalLight(0xffb070, 3.2);
    extSun.position.copy(SUN_DIR).multiplyScalar(200);
    const extHemi = new THREE.HemisphereLight(0xa9c0e6, 0xd7a168, 1.25);
    scene.add(extSun, extHemi);
    const intHemi = new THREE.HemisphereLight(0xfff0dc, 0x2a1a10, 0.5);
    const fill = new THREE.DirectionalLight(0xfff4e6, 1.35);
    fill.position.set(1.5, 5, 22);
    scene.add(intHemi, fill);
    const sun = new THREE.SpotLight(0xf4f2ff, 260, 60, THREE.MathUtils.degToRad(16), 0.6, 1.3);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    sun.shadow.radius = 3;
    scene.add(sun, sun.target);
    const torch = new THREE.PointLight(0xffb468, 0, 11, 1.8);   // Fackel der Kamera im Gang
    scene.add(torch);

    // ── Gemeinsame Materialien ────────────────────────────────────────────────
    const std = (opts) => own(new THREE.MeshStandardMaterial(opts));
    const goldMat = std({ color: 0xd9a845, roughness: 0.28, metalness: 1 });
    const bronzeMat = std({ color: 0x8a5a2b, roughness: 0.45, metalness: 1 });
    const sparkTex = own(sparkTexture());
    const flames = [];   // { mesh, mat, light?, base, phase }
    const addFlame = (parent, x, y, z, w, h, light) => {
      const mat = own(flameMaterial(2.8));
      const mesh = new THREE.Mesh(own(new THREE.PlaneGeometry(w, h)), mat);
      mesh.position.set(x, y + h * 0.42, z);
      parent.add(mesh);
      let pl = null;
      if (light) {
        pl = new THREE.PointLight(0xff9440, light.intensity, light.distance, 1.7);
        pl.position.set(x, y + h * 0.5, z);
        parent.add(pl);
      }
      flames.push({ mesh, mat, light: pl, base: light?.intensity || 0, phase: Math.random() * 10 });
    };

    // Glut-Funken über den Feuerschalen (ein Punktsystem für alle Quellen)
    const EMBERS_PER = 18;
    const emberSources = [];
    let embers = null;
    const buildEmbers = () => {
      if (embers) { scene.remove(embers); embers.geometry.dispose(); }
      const n = emberSources.length * EMBERS_PER;
      const g = new THREE.BufferGeometry();
      const pos = new Float32Array(n * 3), life = new Float32Array(n);
      for (let i = 0; i < n; i++) { life[i] = Math.random(); }
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const m = own(new THREE.PointsMaterial({ map: sparkTex, size: 0.06, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      m.color.setRGB(4, 1.6, 0.4);
      embers = new THREE.Points(g, m);
      embers.userData.life = life;
      embers.frustumCulled = false;
      scene.add(embers);
    };

    // ── Außenwelt ─────────────────────────────────────────────────────────────
    const exterior = new THREE.Group();
    scene.add(exterior);
    const rand = rng(17);
    {
      // Dünen
      const g = own(new THREE.PlaneGeometry(1000, 1000, 240, 240));
      g.rotateX(-Math.PI / 2);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) p.setY(i, duneHeight(p.getX(i), p.getZ(i)));
      g.computeVertexNormals();
      // Farbe selbst (die Fototextur ist Strandsand, grau) — nur Relief/Rauheit kommen aus dem Foto.
      // Leichte Variation: Kämme heller, Senken etwas rötlicher.
      const col = new Float32Array(p.count * 3);
      const cA = new THREE.Color(0xd9a35f), cB = new THREE.Color(0xc4834a), cC = new THREE.Color(0xe8bb7a);
      const cv = new THREE.Color();
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), z = p.getZ(i), y = p.getY(i);
        const n = 0.5 + 0.5 * Math.sin(x * 0.07 + Math.sin(z * 0.05) * 2) * Math.cos(z * 0.06 - x * 0.02);
        cv.copy(cA).lerp(cB, n * 0.5).lerp(cC, smoothstep(2, 9, y) * 0.6);
        col[i * 3] = cv.r; col[i * 3 + 1] = cv.g; col[i * 3 + 2] = cv.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const sandMat = assets.pbr(std({ color: 0xffffff, vertexColors: true }), 'aerial_sand', 1000 / 9, 1000 / 9, { normalScale: 1.2, noMap: true });
      const dunes = new THREE.Mesh(g, sandMat);
      dunes.receiveShadow = true;
      exterior.add(dunes);

      // Außenpyramide: vier Dreiecke, vorne mit Aussparung für das Portal. UVs in Welteinheiten.
      const casing = assets.pbr(std({ color: 0xffd9a6 }), 'sandstone_blocks_05', 1, 1, { normalScale: 1.4 });
      const L = Math.hypot(SHELL_S, SHELL_H);   // Schräghöhe
      const U = 7;                              // Meter je Texturwiederholung
      const notchS = (PORTAL_H + 0.6) * L / SHELL_H;
      const shape = new THREE.Shape();
      shape.moveTo(-SHELL_S, 0);
      shape.lineTo(-PORTAL_W / 2 + 0.3, 0);
      shape.lineTo(-PORTAL_W / 2 + 0.3, notchS);
      shape.lineTo(PORTAL_W / 2 - 0.3, notchS);
      shape.lineTo(PORTAL_W / 2 - 0.3, 0);
      shape.lineTo(SHELL_S, 0);
      shape.lineTo(0, L);
      shape.closePath();
      const faceGeo = new THREE.ShapeGeometry(shape);
      const fp = faceGeo.attributes.position, fu = faceGeo.attributes.uv;
      for (let i = 0; i < fp.count; i++) {
        const u = fp.getX(i), s = fp.getY(i);
        fu.setXY(i, u / U, s / U);
        fp.setXYZ(i, u, s * SHELL_H / L, SHELL_S - s * SHELL_S / L);
      }
      faceGeo.computeVertexNormals();
      own(faceGeo);
      for (let k = 0; k < 4; k++) {
        let geo = faceGeo;
        if (k > 0) {
          // volle Dreiecke für die übrigen Seiten
          const tri = new THREE.Shape();
          tri.moveTo(-SHELL_S, 0); tri.lineTo(SHELL_S, 0); tri.lineTo(0, L); tri.closePath();
          geo = own(new THREE.ShapeGeometry(tri));
          const tp = geo.attributes.position, tu = geo.attributes.uv;
          for (let i = 0; i < tp.count; i++) {
            const u = tp.getX(i), s = tp.getY(i);
            tu.setXY(i, u / U, s / U);
            tp.setXYZ(i, u, s * SHELL_H / L, SHELL_S - s * SHELL_S / L);
          }
          geo.computeVertexNormals();
        }
        const face = new THREE.Mesh(geo, casing);
        face.rotation.y = (k * Math.PI) / 2;
        face.position.z = SHELL_C;
        face.receiveShadow = true;
        exterior.add(face);
      }
      // Goldene Spitze
      const capH = 3.2;
      const cap = new THREE.Mesh(own(new THREE.ConeGeometry(capH * SHELL_S / SHELL_H * Math.SQRT2, capH, 4)), goldMat);
      cap.rotation.y = Math.PI / 4;
      cap.position.set(0, SHELL_H - capH / 2 + 0.02, SHELL_C);
      exterior.add(cap);

      // Portal: zwei Pfeiler, Sturz, Gesims — Sandstein; geflügelte Sonne über dem Eingang
      const portalMat = assets.pbr(std({ color: 0xfff0dc }), 'sandstone_blocks_08', 1, 1, { normalScale: 1.2 });
      const depth = PORTAL_Z - PORTAL_BACK;
      const pierW = (PORTAL_W - CW) / 2;
      [-1, 1].forEach((side) => {
        const pier = new THREE.Mesh(own(worldBox(pierW, PORTAL_H, depth, 3)), portalMat);
        pier.position.set(side * (CW / 2 + pierW / 2), PORTAL_H / 2, PORTAL_BACK + depth / 2);
        pier.castShadow = pier.receiveShadow = true;
        exterior.add(pier);
      });
      const lintel = new THREE.Mesh(own(worldBox(CW + 0.02, PORTAL_H - CH, depth, 3)), portalMat);
      lintel.position.set(0, CH + (PORTAL_H - CH) / 2, PORTAL_BACK + depth / 2);
      exterior.add(lintel);
      const cornice = new THREE.Mesh(own(worldBox(PORTAL_W + 1.2, 0.9, depth + 1.2, 3)), portalMat);
      cornice.position.set(0, PORTAL_H + 0.45, PORTAL_BACK + depth / 2 + 0.3);
      cornice.castShadow = true;
      exterior.add(cornice);
      const ws = wingedSunTexture();
      own(ws.map); own(ws.normalMap);
      const wsMat = std({ map: ws.map, normalMap: ws.normalMap, transparent: true, alphaTest: 0.2, roughness: 0.55, metalness: 0.15 });
      const wsMesh = new THREE.Mesh(own(new THREE.PlaneGeometry(PORTAL_W - 0.8, (PORTAL_W - 0.8) * 320 / 1024)), wsMat);
      wsMesh.position.set(0, CH + (PORTAL_H - CH) / 2 + 0.1, PORTAL_Z + 0.02);
      exterior.add(wsMesh);
      // Hieroglyphen-Spalten auf den Pfeilern
      const band = glyphBandTexture(1);
      own(band.map); own(band.normalMap);
      [-1, 1].forEach((side) => {
        const m = std({ map: band.map, normalMap: band.normalMap, transparent: true, alphaTest: 0.15, roughness: 0.8 });
        const col = new THREE.Mesh(own(new THREE.PlaneGeometry(PORTAL_H - 1.4, 1.5)), m);
        col.rotation.z = Math.PI / 2;
        col.position.set(side * (CW / 2 + pierW / 2), PORTAL_H / 2 - 0.2, PORTAL_Z + 0.02);
        exterior.add(col);
      });

      // Prozessionsweg mit Bordsteinen, Obelisken-Paare, Feuerschalen am Portal
      const pathLen = 260;
      const pathMat = assets.pbr(std({ color: 0xf2dcc0 }), 'floor_tiles_04', 1, 1);
      const path = new THREE.Mesh(own(worldPlane(8, pathLen, 4)), pathMat);
      path.rotation.x = -Math.PI / 2;
      path.position.set(0, 0.03, PORTAL_Z + pathLen / 2 - 0.5);
      path.receiveShadow = true;
      exterior.add(path);
      [-1, 1].forEach((side) => {
        const curb = new THREE.Mesh(own(worldBox(0.6, 0.35, pathLen, 3)), portalMat);
        curb.position.set(side * 4.3, 0.17, PORTAL_Z + pathLen / 2);
        curb.receiveShadow = true;
        exterior.add(curb);
      });
      const obeliskMat = assets.pbr(std({ color: 0xffe9d0 }), 'sandstone_blocks_04', 1, 4);
      const obeliskGeo = own(new THREE.CylinderGeometry(0.55, 0.9, 12, 4, 1));
      obeliskGeo.rotateY(Math.PI / 4);
      const tipGeo = own(new THREE.ConeGeometry(0.78, 1.2, 4));
      tipGeo.rotateY(Math.PI / 4);
      const baseGeo = own(worldBox(2.6, 1.2, 2.6, 3));
      [80, 108, 136, 164].forEach((z) => {
        [-1, 1].forEach((side) => {
          const g = new THREE.Group();
          const base = new THREE.Mesh(baseGeo, portalMat);
          base.position.y = 0.6;
          const shaft = new THREE.Mesh(obeliskGeo, obeliskMat);
          shaft.position.y = 1.2 + 6;
          const tip = new THREE.Mesh(tipGeo, goldMat);
          tip.position.y = 1.2 + 12 + 0.6;
          [base, shaft, tip].forEach((m) => { m.castShadow = true; m.receiveShadow = true; });
          g.add(base, shaft, tip);
          g.position.set(side * 7.5, 0, z);
          exterior.add(g);
        });
      });

      // Modelle: Köcherbäume und Felsblöcke in den Dünen (fester Zufall, nicht auf dem Weg)
      const tree = assets.model('quiver_tree_02', 6.5);
      const boulder = assets.model('namaqualand_boulder_02', 2.6);
      // Kamerabahn der Einfahrt (x, z) — dort nichts hinstellen
      const lane = [[-28, 205], [-24, 192], [-10, 116], [0, 72]];
      const nearLane = (x, z) => lane.slice(1).some(([bx, bz], i) => {
        const [ax, az] = lane[i];
        const t = clamp01(((x - ax) * (bx - ax) + (z - az) * (bz - az)) / ((bx - ax) ** 2 + (bz - az) ** 2));
        return Math.hypot(x - (ax + t * (bx - ax)), z - (az + t * (bz - az))) < 13;
      });
      const place = (holder, n, minX, maxX, z0, z1, sMin, sMax) => {
        for (let i = 0, tries = 0; i < n && tries < n * 20; tries++) {
          const side = rand() < 0.5 ? -1 : 1;
          const x = side * (minX + rand() * (maxX - minX));
          const z = z0 + rand() * (z1 - z0);
          if (nearLane(x, z)) continue;
          i++;
          const g = cloneModel(holder);
          g.position.set(x, duneHeight(x, z) - 0.15, z);
          g.rotation.y = rand() * Math.PI * 2;
          g.scale.setScalar(sMin + rand() * (sMax - sMin));
          exterior.add(g);
        }
      };
      place(tree, 9, 14, 46, 66, 210, 0.8, 1.3);
      place(boulder, 12, 11, 70, 62, 240, 0.6, 1.7);

      // Feuerschalen vor dem Portal: Steinsockel + Messingtopf + Flamme
      const pedestal = own(worldBox(1.1, 1.3, 1.1, 2));
      const pot = assets.model('brass_pot_01', 0.75);
      [-1, 1].forEach((side) => {
        const x = side * (CW / 2 + 1.2), z = PORTAL_Z + 1.6;
        const ped = new THREE.Mesh(pedestal, portalMat);
        ped.position.set(x, 0.65, z);
        ped.castShadow = true;
        const p2 = cloneModel(pot);
        p2.position.set(x, 1.3, z);
        exterior.add(ped, p2);
        addFlame(exterior, x, 1.95, z, 1.1, 1.6, { intensity: 9, distance: 10 }); // schwächer: die Fahrt startet jetzt direkt davor
        emberSources.push(new THREE.Vector3(x, 2.1, z));
      });
    }

    // ── Gang ──────────────────────────────────────────────────────────────────
    const corridor = new THREE.Group();
    scene.add(corridor);
    {
      const len = PORTAL_Z - FRONT_Z;
      const wallMat = assets.pbr(std({ color: 0xf2e2cc }), 'sandstone_blocks_08', 1, 1);
      const floorMat = assets.pbr(std({ color: 0xead2b2 }), 'floor_tiles_04', 1, 1);
      const floor = new THREE.Mesh(own(worldPlane(CW, len, 2.5)), floorMat);
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(0, 0.01, FRONT_Z + len / 2);
      floor.receiveShadow = true;
      const ceil = new THREE.Mesh(own(worldPlane(CW, len, 2.5)), wallMat);
      ceil.rotation.x = Math.PI / 2;
      ceil.position.set(0, CH - 0.01, FRONT_Z + len / 2);
      corridor.add(floor, ceil);
      const band = glyphBandTexture(len / 4);
      own(band.map); own(band.normalMap);
      const bandMat = std({ map: band.map, normalMap: band.normalMap, transparent: true, alphaTest: 0.15, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2 });
      [-1, 1].forEach((side) => {
        const w = new THREE.Mesh(own(worldPlane(len, CH, 3)), wallMat);
        w.rotation.y = side * -Math.PI / 2;
        w.position.set(side * (CW / 2 - 0.02), CH / 2, FRONT_Z + len / 2);
        w.receiveShadow = true;
        const b = new THREE.Mesh(own(new THREE.PlaneGeometry(len, 1)), bandMat);
        b.rotation.y = side * -Math.PI / 2;
        b.position.set(side * (CW / 2 - 0.03), 1.6, FRONT_Z + len / 2);
        corridor.add(w, b);
        // Wandfackeln: Bronzehalter + Flamme (ohne eigenes Licht — die Kamera trägt eine Fackel)
        for (let z = FRONT_Z + 4; z < PORTAL_Z - 3; z += 7) {
          const h = new THREE.Mesh(own(new THREE.CylinderGeometry(0.04, 0.03, 0.3, 8)), bronzeMat);
          h.position.set(side * (CW / 2 - 0.12), 2.66, z);
          h.rotation.z = side * 0.6;
          corridor.add(h);
          addFlame(corridor, side * (CW / 2 - 0.22), 2.78, z, 0.3, 0.5, null);
        }
      });
    }

    // ── Kammer (wird mit der Pyramide neu gebaut, passt sich ihrer Größe an) ───────
    const hall = new THREE.Group();
    scene.add(hall);
    const glyphBand = glyphBandTexture(1);
    const frieze = friezeTexture(1);
    const stars = starCeiling(1);
    const colTex = columnTexture();
    const mural = wingedSunTexture();
    [glyphBand, frieze, stars, colTex, mural].forEach((t) => { own(t.map); own(t.normalMap); });
    const hallWallMat = assets.pbr(std({ color: 0xfff0dc }), 'sandstone_blocks_08', 1, 1, { normalScale: 1.1 });
    const hallFloorMat = assets.pbr(std({ color: 0xf2dcbc, roughness: 0.6 }), 'floor_tiles_04', 1, 1);
    const ceilMat = std({ map: stars.map, normalMap: stars.normalMap, roughness: 0.9 });
    const colShaftMat = assets.pbr(std({ color: 0xffeacc }), 'sandstone_blocks_04', 2, 3);
    const colPaintMat = std({ map: colTex.map, normalMap: colTex.normalMap, roughness: 0.85 });
    const potModel = assets.model('brass_pot_01', 0.8);
    const vaseA = assets.model('brass_vase_01', 0.95);
    const vaseB = assets.model('brass_vase_03', 0.8);
    let hallLights = [];
    let beam = null, beamMat = null;
    let dust = null;
    let hallDims = { W: 30, back: -10, H: 13, beamZ: -2 };

    const buildHall = (dims) => {
      hall.children.slice().forEach((ch) => {
        hall.remove(ch);
        ch.traverse((m) => { if (m.isMesh && !m.geometry.userData.shared && !m.userData.sharedGeometry) m.geometry.dispose(); });
      });
      flames.splice(0, flames.length, ...flames.filter((f) => !f.inHall));
      emberSources.splice(0, emberSources.length, ...emberSources.filter((e) => !e.inHall));
      hallLights = [];
      const W = Math.max(30, dims.bottom * CELL_W + 18);
      const back = -Math.max(10, dims.depth + 3.5);
      const H = Math.max(13, dims.height + 4.5);
      const D = FRONT_Z - back;
      const beamZ = -(dims.rows - 1) * STEP_D - 0.55;   // über der obersten Stufe
      hallDims = { W, back, H, beamZ };

      const floor = new THREE.Mesh(worldPlane(W, D, 4), hallFloorMat);
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(0, 0, back + D / 2);
      floor.receiveShadow = true;
      hall.add(floor);
      // Wände: hinten, links, rechts, vorne (mit Türöffnung zum Gang)
      const wall = (w, h, x, y, z, ry) => {
        const m = new THREE.Mesh(worldPlane(w, h, 3.5), hallWallMat);
        m.position.set(x, y, z);
        m.rotation.y = ry;
        m.receiveShadow = true;
        hall.add(m);
      };
      wall(W, H, 0, H / 2, back, 0);
      wall(D, H, -W / 2, H / 2, back + D / 2, Math.PI / 2);
      wall(D, H, W / 2, H / 2, back + D / 2, -Math.PI / 2);
      const sideW = (W - CW) / 2;
      wall(sideW, H, -(CW / 2 + sideW / 2), H / 2, FRONT_Z, Math.PI);
      wall(sideW, H, CW / 2 + sideW / 2, H / 2, FRONT_Z, Math.PI);
      wall(CW, H - CH, 0, CH + (H - CH) / 2, FRONT_Z, Math.PI);

      // Bemalter Fries unter der Decke + Hieroglyphenband in Augenhöhe (Aufkleber, rundum)
      const decal = (tex, w, h, x, y, z, ry, rx) => {
        const t = tex.map.clone(); t.repeat.set(rx, 1); t.needsUpdate = true; own(t);
        const n = tex.normalMap.clone(); n.repeat.set(rx, 1); n.needsUpdate = true; own(n);
        const m = own(new THREE.MeshStandardMaterial({ map: t, normalMap: n, transparent: true, alphaTest: 0.15, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2 }));
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
        mesh.position.set(x, y, z);
        mesh.rotation.y = ry;
        hall.add(mesh);
      };
      [[W, 0, back + 0.03, 0], [D, -W / 2 + 0.03, back + D / 2, Math.PI / 2], [D, W / 2 - 0.03, back + D / 2, -Math.PI / 2]].forEach(([len, x, z, ry]) => {
        decal(frieze, len, len * 0 + 1.1, x, H - 0.75, z, ry, len / 8);
        decal(glyphBand, len, 1.4, x, 2.6, z, ry, len / 5.5);
      });
      // Wandmalerei: geflügelte Sonne hinter der Pyramidenspitze
      const muralW = Math.min(W - 6, 16);
      const mm = own(new THREE.MeshStandardMaterial({ map: mural.map, normalMap: mural.normalMap, transparent: true, alphaTest: 0.2, roughness: 0.6, metalness: 0.2 }));
      const mMesh = new THREE.Mesh(new THREE.PlaneGeometry(muralW, muralW * 320 / 1024), mm);
      mMesh.position.set(0, H - 1.6 - muralW * 160 / 1024, back + 0.04);
      hall.add(mMesh);

      // Sternendecke mit Öffnung über der Pyramide
      const hole = 3.8;
      const ceilPart = (w, d, x, z) => {
        if (w <= 0 || d <= 0) return;
        const g = worldPlane(w, d, 4);
        const m = new THREE.Mesh(g, ceilMat);
        m.rotation.x = Math.PI / 2;
        m.position.set(x, H, z);
        hall.add(m);
        // Deckenbalken als Dicke (von oben blockiert er auch das Licht außerhalb der Öffnung)
        const slab = new THREE.Mesh(worldBox(w, 0.8, d, 4), hallWallMat);
        slab.position.set(x, H + 0.41, z);
        slab.castShadow = true;
        hall.add(slab);
      };
      ceilPart(W, beamZ - hole / 2 - back, 0, (back + beamZ - hole / 2) / 2);
      ceilPart(W, FRONT_Z - (beamZ + hole / 2), 0, (FRONT_Z + beamZ + hole / 2) / 2);
      ceilPart((W - hole) / 2, hole, -(hole / 2 + (W - hole) / 4), beamZ);
      ceilPart((W - hole) / 2, hole, hole / 2 + (W - hole) / 4, beamZ);

      // Papyrussäulen: Basis, gebündelter Schaft (Lathe), offenes Kapitell, Abakus
      const colH = H;
      const shaftPts = [];
      for (let i = 0; i <= 16; i++) {
        const t = i / 16;
        const r = 0.5 + 0.08 * Math.sin(Math.min(1, t * 6) * Math.PI / 2) - 0.1 * t;
        shaftPts.push(new THREE.Vector2(r, 0.35 + t * (colH - 2.3)));
      }
      const shaftGeo = new THREE.LatheGeometry(shaftPts, 32);
      const capPts = [];
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        capPts.push(new THREE.Vector2(0.42 + 0.58 * t ** 1.7, colH - 1.95 + t * 1.3));
      }
      const capGeo = new THREE.LatheGeometry(capPts, 32);
      const baseGeo = new THREE.CylinderGeometry(0.85, 0.9, 0.35, 32);
      const abacusGeo = worldBox(1.3, colH - (colH - 0.65), 1.3, 2);
      const colX = W / 2 - 3.2;
      const colZs = [back + 3.5, back + 3.5 + (FRONT_Z - 8 - back - 3.5) / 2, FRONT_Z - 8];
      [-1, 1].forEach((side) => colZs.forEach((z) => {
        const g = new THREE.Group();
        const b = new THREE.Mesh(baseGeo, colShaftMat); b.position.y = 0.175;
        const s = new THREE.Mesh(shaftGeo, colPaintMat);
        const c = new THREE.Mesh(capGeo, colShaftMat);
        const a = new THREE.Mesh(abacusGeo, hallWallMat); a.position.y = colH - 0.325;
        [b, s, c, a].forEach((m) => { m.castShadow = true; m.receiveShadow = true; });
        g.add(b, s, c, a);
        g.position.set(side * colX, 0, z);
        hall.add(g);
      }));

      // Feuerschalen: vorne seitlich der Pyramide und hinten in den Ecken
      const bw = dims.bottom * CELL_W;
      const ped = worldBox(1.0, 1.25, 1.0, 2);
      [[bw / 2 + 2.2, 2.0], [bw / 2 + 3.6, back + 3.2]].forEach(([ax, z], k) => {
        [-1, 1].forEach((side) => {
          const x = side * ax;
          const p = new THREE.Mesh(ped, hallWallMat);
          p.position.set(x, 0.625, z);
          p.castShadow = true; p.receiveShadow = true;
          const pot = cloneModel(potModel);
          pot.position.set(x, 1.25, z);
          hall.add(p, pot);
          const before = flames.length;
          addFlame(hall, x, 1.95, z, 1.0, 1.45, { intensity: k === 0 ? 16 : 22, distance: 13 });
          flames.slice(before).forEach((f) => { f.inHall = true; hallLights.push(f.light); });
          const src = new THREE.Vector3(x, 2.05, z); src.inHall = true;
          emberSources.push(src);
        });
      });
      // Opfergaben am Fuß der Pyramide: Messingvasen
      [[bw / 2 + 0.9, 0.9, vaseA, 0.3], [bw / 2 + 1.25, 0.25, vaseB, 1.2]].forEach(([ax, z, model, rot]) => {
        [-1, 1].forEach((side) => {
          const v = cloneModel(model);
          v.position.set(side * ax, 0, z);
          v.rotation.y = rot * side;
          hall.add(v);
        });
      });

      // Lichtstrahl durch die Deckenöffnung + Staub darin
      beamMat = own(beamMaterial(0xeef2ff, 0.2));
      // Strahl endet auf der Spitze — reicht er bis zum Boden, legt er sich als Schleier vor die oberen Karten
      const beamH = H - dims.height;
      beam = new THREE.Mesh(new THREE.CylinderGeometry(hole / 2 * 0.95, hole / 2 * 1.1, beamH, 40, 1, true), beamMat);
      beam.position.set(0, dims.height + beamH / 2, beamZ);
      hall.add(beam);
      const DUST = 260;
      const dg = new THREE.BufferGeometry();
      const dp = new Float32Array(DUST * 3);
      for (let i = 0; i < DUST; i++) {
        const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * hole * 0.6;
        dp[i * 3] = Math.cos(a) * rr;
        dp[i * 3 + 1] = dims.height + Math.random() * (H - dims.height);
        dp[i * 3 + 2] = beamZ + Math.sin(a) * rr;
      }
      dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
      const dm = own(new THREE.PointsMaterial({ map: sparkTex, size: 0.05, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      dm.color.setRGB(1.6, 1.4, 1.1);
      dust = new THREE.Points(dg, dm);
      hall.add(dust);

      sun.position.set(0, H + 9, beamZ + 0.6);
      sun.distance = H + 30;
      sun.shadow.camera.near = 4;
      sun.shadow.camera.far = H + 26;
      buildEmbers();
    };

    // ── Pyramide (wird bei neuer Reihenstruktur neu gebaut) ─────────────────────
    const loader = new THREE.TextureLoader();
    // Kartenbilder einzeln (eins pro Bild) auf die Grafikkarte laden statt alle im selben Moment
    const uploadQ = [];
    const texCache = new Map();
    const cardTex = (id, rarity) => {
      if (texCache.has(id)) return texCache.get(id);
      const tex = own(loader.load(cardTextureUrl(id), (t) => {
        uploadQ.push(t);
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
    const backTex = own(loader.load(propsRef.current.unknownImg));
    backTex.colorSpace = THREE.SRGBColorSpace;
    const ringTex = own(frameRingTexture());
    const forbiddenMat = own(new THREE.MeshStandardMaterial({ map: own(forbiddenTexture()), transparent: true, depthWrite: false, roughness: 0.6, emissive: 0xffffff, emissiveIntensity: 0.12 }));
    forbiddenMat.emissiveMap = forbiddenMat.map;
    const plaqueCache = new Map();
    const plaque = (text, tone) => {
      const key = `${tone}|${text}`;
      if (!plaqueCache.has(key)) plaqueCache.set(key, plaqueTexture(text, tone));
      return plaqueCache.get(key);
    };
    const stoneGeo = own(new RoundedBoxGeometry(STONE_W, STONE_H, STONE_D, 3, 0.035));
    stoneGeo.userData.shared = true;
    const stoneMat = assets.pbr(std({ color: 0xffe4c4 }), 'sandstone_blocks_04', 0.45, 0.5, { normalScale: 0.9 });

    const pyramid = new THREE.Group();
    scene.add(pyramid);
    let structSig = '';
    let cells = new Map();
    let dims = { rows: 0, bottom: 0, height: 0, depth: 0 };
    const disposeGroup = (g) => g.traverse((m) => {
      if (!m.isMesh) return;
      if (!m.geometry.userData.shared) m.geometry.dispose();
      if (m.material === stoneMat || m.material === goldMat || m.material === forbiddenMat || m.material.userData.keep) return;
      m.material.dispose();
    });
    const buildPyramid = (rows) => {
      const sig = rows.map(r => r.length).join(',');
      if (sig === structSig) return false;
      structSig = sig;
      pyramid.children.slice().forEach((ch) => { pyramid.remove(ch); disposeGroup(ch); });
      cells = new Map();
      const R = rows.length;
      const totalD = R * STEP_D + 0.8;
      dims = { rows: R, bottom: rows[0]?.length || 1, height: R * STEP_H, depth: totalD };
      buildHall(dims);
      rows.forEach((row, r) => {
        const width = row.length * CELL_W + 0.5;
        const depth = totalD - r * STEP_D;
        const front = -r * STEP_D;
        const mat = assets.pbr(new THREE.MeshStandardMaterial({ color: 0xffe8cc }), 'sandstone_blocks_08', width / 2.6, STEP_H / 2.6);
        mat.userData.keep = true;
        own(mat);
        const block = new THREE.Mesh(new RoundedBoxGeometry(width, STEP_H, depth, 2, 0.05), mat);
        block.position.set(0, r * STEP_H + STEP_H / 2, front - depth / 2);
        block.castShadow = true;
        block.receiveShadow = true;
        pyramid.add(block);
        // Goldene Kante oben an jeder Stufe
        const edge = new THREE.Mesh(new THREE.BoxGeometry(width + 0.04, 0.06, 0.08), goldMat);
        edge.position.set(0, (r + 1) * STEP_H - 0.03, front + 0.02);
        pyramid.add(edge);
        row.forEach((cell, c) => {
          const x = (c - (row.length - 1) / 2) * CELL_W;
          const y = r * STEP_H + STEP_H * 0.5;
          const key = `${r},${c}`;
          // group (Mitte des Steins) → lift (Herausrücken) → spin (Drehen um Y) → Stein + zwei Seiten
          const group = new THREE.Group();
          group.position.set(x, y, front + STONE_D / 2 + 0.01);
          const lift = new THREE.Group();
          const spin = new THREE.Group();
          lift.add(spin);
          group.add(lift);
          const stone = new THREE.Mesh(stoneGeo, stoneMat);
          stone.castShadow = true;
          stone.receiveShadow = true;
          spin.add(stone);
          const frontSide = new THREE.Group();
          frontSide.position.z = STONE_D / 2 + 0.004;
          const backSide = new THREE.Group();
          backSide.position.z = -STONE_D / 2 - 0.004;
          backSide.rotation.y = Math.PI;
          spin.add(frontSide, backSide);
          const { w, h } = cardSize(cell.rarity);
          const hidden = new THREE.Mesh(new THREE.PlaneGeometry(CARD_H * 0.8, CARD_H), new THREE.MeshStandardMaterial({ map: backTex, transparent: true, alphaTest: 0.3, roughness: 0.8, emissive: 0xffffff, emissiveMap: backTex, emissiveIntensity: CARD_GLOW }));
          backSide.add(hidden);
          const frontMat = new THREE.MeshStandardMaterial({ transparent: true, alphaTest: 0.35, roughness: 0.82, emissive: 0xffffff, emissiveIntensity: CARD_GLOW });
          const faceMesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), frontMat);
          faceMesh.position.z = 0.003;
          faceMesh.userData.key = key;
          const frameMat = new THREE.MeshBasicMaterial({ map: ringTex, color: 0x38bdf8, transparent: true, opacity: 0, depthWrite: false });
          const frame = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.16, h + 0.16), frameMat);
          frontSide.add(frame, faceMesh);
          const chatMat = new THREE.MeshStandardMaterial({ transparent: true, emissive: 0xffffff, emissiveIntensity: 0.2 });
          const chat = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.16), chatMat);
          chat.position.set(0, STONE_H / 2 - 0.02, STONE_D / 2 + 0.12);
          chat.visible = false;
          group.add(chat);
          pyramid.add(group);
          cells.set(key, {
            key, r, c, group, lift, spin, frontSide, backSide, hidden, faceMesh, frontMat, frame, frameMat, chat, chatMat, chatKey: '',
            w, h, rarity: cell.rarity || null, cardId: null, revealed: false, pickedBy: null, blocked: false,
            flipAt: null, turnAt: null, hover: 0,
          });
        });
      });
      return true;
    };

    // Ergebnis auf die Seite malen, die gerade zur Wand zeigt — die nächste halbe Drehung um Y
    // bringt sie nach vorne.
    const showResult = (o, kind, pickedBy) => {
      const side = o.revealed ? o.backSide : o.frontSide;
      side.children.forEach((ch) => { ch.visible = false; });
      const content = new THREE.Group();
      const map = o.cardId ? cardTex(o.cardId, o.rarity) : null;
      if (kind === 'picked') {
        const color = propsRef.current.colors?.[pickedBy] || '#a8a29e';
        const name = propsRef.current.names?.[pickedBy] || '?';
        const card = new THREE.Mesh(new THREE.PlaneGeometry(o.w * 0.84, o.h * 0.84), new THREE.MeshStandardMaterial({ map, emissiveMap: map, transparent: true, alphaTest: 0.35, roughness: 0.82, color: 0xe6e6e6, emissive: 0xffffff, emissiveIntensity: CARD_GLOW }));
        card.position.set(0, -0.1, 0.003);
        const signMap = plaque(name, color);
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.2), new THREE.MeshStandardMaterial({ map: signMap, emissiveMap: signMap, transparent: true, roughness: 0.5, emissive: 0xffffff, emissiveIntensity: 0.15 }));
        sign.position.set(0, STONE_H / 2 - 0.13, 0.006);
        content.add(card, sign);
      } else {
        const card = new THREE.Mesh(new THREE.PlaneGeometry(o.w, o.h), new THREE.MeshStandardMaterial({ map, transparent: true, alphaTest: 0.35, roughness: 0.9, color: 0x8f8072, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.04 }));
        card.position.z = 0.003;
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.82, 0.82), forbiddenMat);
        sign.position.z = 0.006;
        content.add(card, sign);
      }
      side.add(content);
    };

    // Zustand je Feld abgleichen: Änderungen starten Animationen (beim ersten Aufbau sofort)
    const syncCells = (now, instant) => {
      const rows = propsRef.current.rows || [];
      rows.forEach((row, r) => row.forEach((cell, c) => {
        const o = cells.get(`${r},${c}`);
        if (!o) return;
        if (cell.rarity && cell.rarity !== o.rarity) {
          // Verdeckte Karten werden in Normalgröße angelegt; erst beim Aufdecken kennt man den
          // (bei Champions und Legendären höheren) Rahmen — sonst wirkt das Bild gestaucht
          o.rarity = cell.rarity;
          const { w, h } = cardSize(cell.rarity);
          if (w !== o.w || h !== o.h) {
            o.w = w; o.h = h;
            o.faceMesh.geometry.dispose();
            o.faceMesh.geometry = new THREE.PlaneGeometry(w, h);
            o.frame.geometry.dispose();
            o.frame.geometry = new THREE.PlaneGeometry(w + 0.16, h + 0.16);
          }
        }
        if (cell.cardId && cell.cardId !== o.cardId) {
          o.cardId = cell.cardId;
          o.frontMat.map = cardTex(cell.cardId, cell.rarity);
          o.frontMat.emissiveMap = o.frontMat.map;
          o.frontMat.needsUpdate = true;
        }
        if (cell.revealed && !o.revealed) { o.revealed = true; o.flipAt = instant ? -1e9 : now; }
        if (!cell.revealed && o.revealed) { o.revealed = false; o.flipAt = null; }
        if (cell.pickedBy && !o.pickedBy && !o.blocked) {
          o.pickedBy = cell.pickedBy;
          o.turnAt = instant ? -1e9 : now;
          showResult(o, 'picked', cell.pickedBy);
        }
        if (cell.blocked && !o.blocked && !o.pickedBy) {
          o.blocked = true;
          o.turnAt = instant ? -1e9 : now;
          showResult(o, 'blocked');
        }
      }));
    };

    // ── Kamera ────────────────────────────────────────────────────────────────
    let aspect = 1;
    // Ausschnitt: von der untersten Reihe mit wählbaren Karten bis zwei Reihen über der obersten
    const focusBox = () => {
      const rows = propsRef.current.rows || [];
      let lo = Infinity, hi = -1;
      rows.forEach((row, r) => row.forEach((cell) => {
        if (cell.revealed && !cell.pickedBy && !cell.blocked) { lo = Math.min(lo, r); hi = Math.max(hi, r); }
      }));
      if (hi < 0) { lo = 0; hi = rows.length - 1; }
      hi = Math.min(rows.length - 1, Math.max(hi + 2, lo + 2));
      return { lo, hi, width: (rows[lo]?.length || 1) * CELL_W + 0.7 };
    };
    const overview = (pan) => {
      const { lo, hi, width } = focusBox();
      const y0 = lo * STEP_H - 0.05, y1 = (hi + 1) * STEP_H + 0.15;
      const halfH = (y1 - y0) / 2;
      const halfW = width / 2;
      const front = -lo * STEP_D;
      const d = Math.max(halfH / TAN, halfW / (TAN * aspect), 3.2);
      const cy = (y0 + y1) / 2;
      return {
        pos: new THREE.Vector3(pan * PAN_X, cy + 0.35, Math.min(FRONT_Z - 1.5, front + d + 0.2)),
        look: new THREE.Vector3(pan * PAN_X * 0.3, cy, front - 0.4),
      };
    };
    const camPos = new THREE.Vector3(0, 3, 20);
    const camLook = new THREE.Vector3(0, 2, 0);
    // Kamerafahrt: Stützpunkte (Zeit, Position, Blickziel). Der letzte kommt aus overview().
    let intro = null;   // { start, pos: Curve, look: Curve, param: (t) => u }
    let introDone = false;
    const makeIntro = (now) => {
      const target = overview(0);
      const keys = [
        [0, [0, 3.0, PORTAL_Z + 9], [0, 2.4, PORTAL_Z - 10]],
        [0.9, [0, 2.2, PORTAL_Z - 6], [0, 2.1, FRONT_Z - 2]],
        [1.8, [0, 2.3, FRONT_Z + 3], [0, 2.8, 8]],
        [INTRO_S, target.pos.toArray(), target.look.toArray()],
      ];
      const v = (a) => new THREE.Vector3(...a);
      const pos = new THREE.CatmullRomCurve3(keys.map((k) => v(k[1])), false, 'centripetal');
      const look = new THREE.CatmullRomCurve3(keys.map((k) => v(k[2])), false, 'centripetal');
      const param = monotoneSpline(keys.map((k) => k[0]), keys.map((_, i) => i / (keys.length - 1)));
      intro = { start: now, pos, look, param };
    };
    const finishIntro = () => {
      if (introDone) return;
      introDone = true;
      playSound('start');
    };

    // ── Bildschirm-Rechteck eines Felds (für Effekte im DOM) ─────────────────────
    const tmp = new THREE.Vector3();
    api.getCellRect = (r, c) => {
      const o = cells.get(`${r},${c}`);
      if (!o) return null;
      const rect = cvs.getBoundingClientRect();
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy]) => {
        tmp.set(sx * o.w / 2, sy * o.h / 2, STONE_D / 2);
        o.group.localToWorld(tmp);
        tmp.project(camera);
        const x = rect.left + (tmp.x + 1) / 2 * rect.width;
        const y = rect.top + (1 - tmp.y) / 2 * rect.height;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      });
      return new DOMRect(minX, minY, maxX - minX, maxY - minY);
    };

    // ── Zeiger ────────────────────────────────────────────────────────────────
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let hoverKey = null;
    const pick = (e) => {
      if (!introDone) return null;
      const rect = cvs.getBoundingClientRect();
      ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const targets = [];
      cells.forEach((o) => targets.push(o.faceMesh));
      const hits = raycaster.intersectObjects(targets, false);
      const key = hits.length ? hits[0].object.userData.key : null;
      return key && propsRef.current.clickable?.has(key) ? key : null;
    };
    const onMove = (e) => { hoverKey = pick(e); cvs.style.cursor = hoverKey ? 'pointer' : 'default'; };
    const onLeave = () => { hoverKey = null; cvs.style.cursor = 'default'; };
    const onClick = (e) => {
      // Klick während der Kamerafahrt: überspringen (die Kamera gleitet dann zur Pyramide)
      if (!introDone) { if (intro) { intro = null; finishIntro(); } return; }
      const key = pick(e);
      if (!key) return;
      const [r, c] = key.split(',').map(Number);
      propsRef.current.onPick?.(r, c);
    };
    cvs.addEventListener('pointermove', onMove);
    cvs.addEventListener('pointerleave', onLeave);
    cvs.addEventListener('click', onClick);

    const resize = () => {
      const w = container.clientWidth || 1, h = container.clientHeight || 1;
      renderer.setSize(w, h, false);
      post.setSize(w, h);
      cvs.style.width = `${w}px`;
      cvs.style.height = `${h}px`;
      aspect = w / h;
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
    };
    // Auflösung startet bei max. 1,75 und sinkt automatisch, wenn Bilder zu lange dauern
    const adaptQuality = createQualityGovernor(renderer, Math.min(window.devicePixelRatio || 1, 1.75), () => resize());
    resize();
    // setSize leert die Zeichenfläche. Der ResizeObserver feuert NACH dem Frame — direkt dort
    // aufgerufen, zeigte der Browser ein Bild lang die leere Fläche. Deshalb im nächsten Frame
    // vor dem Zeichnen.
    let sizeDirty = false;
    const ro = new ResizeObserver(() => { sizeDirty = true; });
    ro.observe(container);


    // ── Schleife ──────────────────────────────────────────────────────────────
    let raf = 0;
    let last = performance.now();
    let fresh = null;
    let warmed = false;
    const fogCol = new THREE.Color();
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const P = propsRef.current;
      const off = animOff();
      if (sizeDirty) { sizeDirty = false; resize(); }
      const rebuilt = buildPyramid(P.rows || []);
      syncCells(now, rebuilt || off);
      if (fresh === null && (P.rows || []).length) {
        fresh = P.rows.every((row) => row.every((c) => !c.pickedBy && !c.blocked));
      }
      if (!warmed) {
        // Noch verdeckt: alle Shader übersetzen und alle Texturen hochladen, sonst passiert das
        // erst, wenn etwas zum ersten Mal ins Bild kommt — mitten in der Kamerafahrt (Standbilder)
        warmed = true;
        [exterior, corridor, hall, pyramid].forEach((g) => { g.visible = true; });
        warmUp(renderer, scene, camera, post);
        last = performance.now();
        return;
      }
      if (cvs.style.opacity !== '1') cvs.style.opacity = '1';
      if (uploadQ.length) renderer.initTexture(uploadQ.shift());
      adaptQuality(dt);

      // Kamera: Fahrt von draußen hinein, danach sanft dem Ausschnitt folgen
      const pan = off ? 0 : Math.sin(now / 9000);
      const target = overview(pan);
      if (!introDone && !intro) {
        if (fresh && !off) makeIntro(now);
        else { camPos.copy(target.pos); camLook.copy(target.look); finishIntro(); }
      }
      if (intro) {
        // Prüfstand: window.__cr3dIntroT hält die Fahrt an einem Zeitpunkt fest (Screenshots unter
        // Software-Rendering dauern Sekunden)
        const dbgT = typeof window.__cr3dIntroT === 'number' ? window.__cr3dIntroT : null;
        const t = dbgT ?? (now - intro.start) / 1000;
        const u = clamp01(intro.param(t));
        intro.pos.getPoint(u, camPos);
        intro.look.getPoint(u, camLook);
        if (t >= INTRO_S && dbgT === null) { intro = null; finishIntro(); }
      } else {
        const k = off ? 1 : 1 - Math.exp(-dt * 2.5);
        camPos.lerp(target.pos, k);
        camLook.lerp(target.look, k);
      }
      camera.position.copy(camPos);
      camera.lookAt(camLook);

      // Innen/Außen überblenden: Licht, Nebel, Sichtweite
      const inside = smoothstep(57, 47, camPos.z);
      extSun.intensity = 3.2 * (1 - inside);
      extHemi.intensity = 1.25 * (1 - inside);
      intHemi.intensity = 0.5 * inside;
      fill.intensity = 1.35 * smoothstep(FRONT_Z + 4, FRONT_Z - 6, camPos.z);
      sun.intensity = 260 * inside;
      scene.environmentIntensity = 0.85 - 0.6 * inside;
      torch.intensity = 8 * smoothstep(PORTAL_Z + 2, PORTAL_Z - 4, camPos.z) * smoothstep(FRONT_Z - 2, FRONT_Z + 6, camPos.z);
      torch.position.set(camPos.x + 0.4, camPos.y + 0.3, camPos.z - 0.6);
      fogCol.copy(EXT_FOG).lerp(INT_FOG, inside);
      scene.fog.color.copy(fogCol);
      const distToPyr = Math.max(4, camPos.z);
      scene.fog.near = THREE.MathUtils.lerp(90, distToPyr + 10, inside);
      scene.fog.far = THREE.MathUtils.lerp(650, distToPyr + 46, inside);
      // near nicht zu klein (Flackern); im Gang reichen 0,12 (Wände ≥ 1,6 entfernt)
      const near = THREE.MathUtils.lerp(0.5, 0.12, inside);
      const far = THREE.MathUtils.lerp(900, 160, inside);
      if (camera.near !== near || camera.far !== far) { camera.near = near; camera.far = far; camera.updateProjectionMatrix(); }
      // Ausblenden erst nach der Fahrt — Ein-/Ausblenden während der Fahrt kostete Bilder
      if (introDone) {
        exterior.visible = camPos.z > 42;
        corridor.visible = camPos.z > FRONT_Z - 14;
      }
      sun.target.position.set(0, dims.height, hallDims.beamZ);
      if (beamMat) beamMat.uniforms.uTime.value = now / 1000;

      // Felder
      const pulse = 0.5 + Math.sin(now / 260) * 0.5;
      cells.forEach((o) => {
        const clickable = P.clickable?.has(o.key);
        const kk = off ? 1 : 1 - Math.exp(-dt * 10);
        o.hover += ((hoverKey === o.key ? 1 : 0) - o.hover) * kk;
        let rotY = Math.PI;
        if (o.revealed) {
          const fp = o.flipAt == null ? 1 : clamp01((now - o.flipAt) / (FLIP_S * 1000));
          rotY = Math.PI * (1 - easeOutBack(fp));
        }
        let out = 0;
        if (o.pickedBy || o.blocked) {
          const tp = o.turnAt == null ? 1 : clamp01((now - o.turnAt) / (TURN_S * 1000));
          rotY -= Math.PI * easeOutBack(tp);
          out = 0.14 * Math.sin(Math.PI * clamp01(tp * 1.15));
        }
        o.spin.rotation.y = rotY;
        o.lift.position.z = out + o.hover * 0.1;
        o.frontMat.color.setScalar(0.9);
        o.frameMat.opacity = clickable && introDone ? Math.max(o.hover, 0.25 + pulse * 0.45) : 0;

        const opt = P.chatOptions?.get(o.key);
        o.chat.visible = !!opt;
        if (opt) {
          const ck = `${opt.n}|${opt.count}|${opt.leading}`;
          if (ck !== o.chatKey) {
            o.chatKey = ck;
            o.chatMat.map = plaque(`#${opt.n} · ${opt.count}`, opt.leading ? 'brass' : 'mine');
            o.chatMat.emissiveMap = o.chatMat.map;
            o.chatMat.needsUpdate = true;
          }
        }
      });

      // Feuer: Flammen zur Kamera drehen, flackern; Funken steigen auf
      const time = now / 1000;
      flames.forEach((f) => {
        if (!f.mesh.parent?.visible) return;
        f.mat.uniforms.uTime.value = off ? 0 : time;
        f.mesh.quaternion.copy(camera.quaternion);
        if (f.light) {
          const fl = off ? 1 : 0.86 + Math.sin(time * 11 + f.phase) * 0.07 + Math.sin(time * 27 + f.phase * 2) * 0.05;
          f.light.intensity = f.base * fl * (f.mesh.parent === exterior ? 1 : inside > 0 ? 1 : 0.3);
        }
      });
      if (embers) {
        const pa = embers.geometry.attributes.position;
        const life = embers.userData.life;
        for (let i = 0; i < life.length; i++) {
          const src = emberSources[Math.floor(i / EMBERS_PER)];
          if (!src) continue;
          life[i] += dt * (0.35 + (i % 7) * 0.05);
          if (life[i] > 1) life[i] -= 1;
          const l = life[i];
          const a = i * 2.39996 + l * 2;
          pa.setXYZ(i, src.x + Math.cos(a) * 0.22 * l + Math.sin(time + i) * 0.05, src.y + l * 1.8, src.z + Math.sin(a) * 0.22 * l);
        }
        pa.needsUpdate = true;
      }
      if (dust && !off) {
        const pa = dust.geometry.attributes.position;
        for (let i = 0; i < pa.count; i++) {
          let yy = pa.getY(i) - dt * 0.1;
          if (yy < dims.height) yy = hallDims.H;
          pa.setY(i, yy);
        }
        pa.needsUpdate = true;
      }

      post.render(dt);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      cvs.removeEventListener('pointermove', onMove);
      cvs.removeEventListener('pointerleave', onLeave);
      cvs.removeEventListener('click', onClick);
      pyramid.children.forEach(disposeGroup);
      hall.traverse((m) => { if (m.isMesh || m.isPoints) m.geometry.dispose(); });
      if (embers) embers.geometry.dispose();
      plaqueCache.forEach((t) => t.dispose());
      disposables.forEach((d) => d.dispose?.());
      assets.dispose();
      post.dispose();
      renderer.dispose();
      cvs.remove();
      api.getCellRect = () => null;
    };
  }, []);

  return <div ref={containerRef} className="absolute inset-0" />;
});

export default Pyramid3D;
