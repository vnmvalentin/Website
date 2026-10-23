// Angel Royale in 3D: ein sonniger Fluss, schräg von oben gesehen.
//
//   • Orthografische Kamera im 42°-Winkel — kein Fluchtpunkt. Jede Karte erscheint dadurch an
//     GENAU der Bildschirmstelle und in GENAU der Größe wie im 2D-Fluss (riverMath.fishPos),
//     egal auf welcher Bahn sie treibt. Hintere Karten sind weder kleiner noch langsamer, und
//     die Trefferprüfung beim Klick ist dieselbe Rechteck-Prüfung wie in 2D.
//   • worldAt() rechnet eine Bildschirmstelle (Referenzeinheiten) auf den Punkt in Höhe y um,
//     der dort erscheint. Flach liegende Flächen werden um 1/sin(Neigung) in die Tiefe
//     gestreckt, damit sie auf dem Bildschirm unverzerrt aussehen.
//   • Karten liegen auf kleinen Holzflößen. Abtauchen = das Floß sinkt wirklich unter die
//     halbdurchsichtige Wasseroberfläche. Fang = die Karte wird vom Floß gerissen, an einer
//     Schnur in der Farbe des Fängers, mit Spritzwasser.
//
// Reine Darstellung — Zustand, Server und Deck-Leiste bleiben in AngelRoyale.jsx. Ohne WebGL
// meldet onUnsupported(), dann zeigt AngelRoyale den 2D-Fluss.
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { CARD_FRAME_BOX, CARD_IMAGE_SIZE } from '../cardCrop';
import { RARITY_COLOR } from '../../data/cards';
import { useServerClock } from '../../ui/serverClock';
import { playSound } from '../../ui/sound';
import {
  FISH_W, FISH_H, CAUGHT_LINGER_MS, DECK_BAR_PX, fishScale, fishPos, diveFactor, isHardDiving, sprintFactor,
} from './riverMath';
import {
  woodTexture, bedTexture, foamTexture, dropTexture, lilyTexture, reedTexture, labelTexture, shadowTexture,
  crownTexture, wakeTexture,
} from './angelTextures';
import { createPostFX, neutralEnvironment, warmUp, createQualityGovernor } from '../scene3d/kit';
import { checkerGrassTexture, chunkyStoneTexture, plankTexture, addOutline, bushGeometry, crSkyMaterial } from '../scene3d/crStyle';

const cardTextureUrl = (id) => `/api/clash/card-img/${encodeURIComponent(id)}`;
const animOff = () => document.documentElement.dataset.crAnim === 'off';
const clamp01 = (x) => Math.min(1, Math.max(0, x));

const TILT = THREE.MathUtils.degToRad(42);
const SIN = Math.sin(TILT), COS = Math.cos(TILT);
const S = 0.01;                 // Welteinheiten je Referenzeinheit
const RAFT_T = 0.1;             // Floßdicke
// Holzrand rund um die Karte — reine Deko: geklickt wird weiterhin genau die Kartenfläche
// (FISH_W × FISH_H wie in 2D), damit 2D- und 3D-Spieler dieselbe Trefferfläche haben
const RAFT_PAD = 5;
const DIVE_DEPTH = 0.34;        // so tief sinkt ein abtauchendes Floß
const BANK_REF = 6;             // sichtbarer Uferstreifen oben (Referenzeinheiten)
const LABEL_W = 130;            // Breite des Namensschilds (Referenzeinheiten)
const DROP_MS = 750;
const RIPPLE_MS = 550;

// Zufallszahl je Floß aus der fishId — Schaukeln und Schaum sind auf allen Clients gleich
function hash01(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 10000) / 10000;
}

const WATER_VERT = /* glsl */`
  varying vec3 vW;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
// Wellen aus überlagerten Sinuszügen; die Normale kommt aus deren Ableitung. Glitzer entsteht,
// wo eine Wellenflanke die Sonne zur Kamera spiegelt — die Blickrichtung ist bei der
// orthografischen Kamera überall gleich (uView).
const WATER_FRAG = /* glsl */`
  uniform float uTime;
  uniform vec3 uSun;
  uniform vec3 uView;
  uniform float uAlpha;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uEdgeA;
  uniform float uEdgeB;
  varying vec3 vW;
  float h(vec2 p) {
    return sin(p.x * 1.7 + uTime * 0.9) * 0.5
      + sin(p.y * 2.3 - uTime * 1.1 + p.x * 0.4) * 0.35
      + sin((p.x + p.y) * 3.1 + uTime * 1.7) * 0.18
      + sin((p.x * 0.6 - p.y) * 5.3 - uTime * 2.3) * 0.08
      + sin((p.x * 1.3 + p.y * 0.7) * 9.7 + uTime * 3.1) * 0.03;
  }
  void main() {
    vec2 p = vW.xz;
    float e = 0.04;
    float hx = h(p + vec2(e, 0.0)) - h(p - vec2(e, 0.0));
    float hz = h(p + vec2(0.0, e)) - h(p - vec2(0.0, e));
    vec3 n = normalize(vec3(-hx * 0.32, 2.0 * e, -hz * 0.32));
    // Clash-Royale-Fluss: kräftiges Blau, zur Mitte etwas heller; gemalte helle Strömungslinien,
    // die mit dem Wasser ziehen; weißer Schaumrand an beiden Ufern (uEdgeA/uEdgeB = z der Kanten)
    float mid = 0.5 * (uEdgeA + uEdgeB), half_ = max(0.5, 0.5 * abs(uEdgeB - uEdgeA));
    float across = clamp(abs(p.y - mid) / half_, 0.0, 1.0);
    vec3 centerCol = vec3(0.10, 0.42, 0.86);
    vec3 edgeCol = vec3(0.04, 0.26, 0.66);
    vec3 col = mix(centerCol, edgeCol, across * across);
    // Wellenstriche: je Rasterzelle höchstens ein kurzer, geschwungener Strich („~“), zufällig
    // versetzt, zieht mit der Strömung nach +x — wie die gemalten Wellen im Spiel
    vec2 q = vec2(p.x - uTime * 0.6, p.y) * vec2(0.9, 2.2);
    vec2 cell = floor(q);
    vec2 f = fract(q);
    float rnd = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
    float rnd2 = fract(rnd * 17.13);
    vec2 c0 = vec2(0.25 + rnd * 0.5, 0.3 + rnd2 * 0.4);
    float u = (f.x - c0.x) / 0.32;          // −1…1 entlang des Strichs
    float curve = c0.y + 0.12 * sin(u * 3.1416);
    float stroke = (1.0 - smoothstep(0.035, 0.07, abs(f.y - curve))) * (1.0 - smoothstep(0.75, 1.0, abs(u)));
    stroke *= step(0.45, rnd2);              // nicht in jeder Zelle
    float pulse = 0.6 + 0.4 * sin(uTime * 1.3 + rnd * 6.28);
    col = mix(col, vec3(0.70, 0.90, 1.0), stroke * 0.55 * pulse);
    // leichte Wellenschattierung (sanft, keine Fotospiegelung)
    col *= 0.92 + 0.14 * dot(n, uSun);
    // Schaumrand: unregelmäßige weiße Kante dicht am Ufer
    float edgeDist = min(abs(p.y - uEdgeA), abs(p.y - uEdgeB));
    float foamWob = 0.12 + 0.08 * sin(p.x * 3.1 + uTime * 1.6) + 0.05 * sin(p.x * 7.3 - uTime * 2.2);
    float foam = 1.0 - smoothstep(foamWob, foamWob + 0.1, edgeDist);
    col = mix(col, vec3(0.95, 0.98, 1.0), foam * 0.9);
    // kleine Glanzpunkte (wenige, weich) — Clash-Royale-Wasser funkelt nur leicht
    vec3 r = reflect(-uSun, n);
    float rv = max(dot(r, uView), 0.0);
    float spec = pow(rv, 600.0) * 0.5;
    col += vec3(1.0) * spec;
    float alpha = min(1.0, uAlpha + foam * 0.5 + spec * 0.3);
    // Dunst in der Ferne (nur während der Intro-Fahrt sichtbar, danach liegt uFogNear weit weg)
    float ff = smoothstep(uFogNear, uFogFar, distance(cameraPosition, vW));
    col = mix(col, uFogColor, ff);
    alpha = mix(alpha, 1.0, ff);
    gl_FragColor = vec4(col, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/**
 * @param {object}   props.state        fishState vom Server (inkl. clientReceivedAt)
 * @param {boolean}  props.canInteract  darf gerade geangelt werden
 * @param {Function} props.onCatch      (fishId, { card, rect }) => void
 * @param {object}   props.deniedRef    { fishId, ts } der letzten Ablehnung
 * @param {string}   props.myPlayerId
 * @param {Function} props.onUnsupported
 */
export default function Angel3D({ state, canInteract, onCatch, deniedRef, myPlayerId, onUnsupported }) {
  const containerRef = useRef(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const canRef = useRef(canInteract);
  canRef.current = canInteract;
  const propsRef = useRef(null);
  propsRef.current = { onCatch, deniedRef, myPlayerId, onUnsupported };
  const clock = useServerClock(state);
  const clockRef = useRef(clock);
  clockRef.current = clock;

  useEffect(() => {
    const container = containerRef.current;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
      if (!renderer.getContext()) throw new Error('no context');
    } catch {
      propsRef.current.onUnsupported?.();
      return undefined;
    }
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Neutral statt ACES: Kartenfarben bleiben unverändert (Tonwerte wirken in der
    // Nachbearbeitung auf alles, auch auf die unbeleuchteten Karten)
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
    // Himmel + Dunst sieht man nur während der Intro-Fahrt; danach schaut die Kamera schräg
    // aufs Wasser, und der Nebel wird weit weggeschoben (an- und abschalten hieße, alle
    // Materialien mitten im Spielstart neu zu übersetzen)
    const SKY = new THREE.Color(0xc8e4ff);   // Dunst = Horizontfarbe des gemalten Himmels
    scene.background = SKY;
    scene.fog = new THREE.Fog(SKY, 1e4, 2e4);
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 120);
    camera.position.set(0, 40 * SIN, 40 * COS);
    camera.lookAt(0, 0, 0);
    // near nicht zu klein: sonst reicht die Tiefengenauigkeit in der Ferne nicht (Flimmern)
    const introCam = new THREE.PerspectiveCamera(50, 1, 0.3, 600);
    const upVec = new THREE.Vector3(0, COS, -SIN); // Bildschirm-oben in Weltkoordinaten
    const post = createPostFX(renderer, scene, camera, { bloom: { strength: 0.25, radius: 0.4, threshold: 1.15 }, vignette: 0.18 });
    // Alles im Code erzeugt (kein Download → keine Ladezeit). Gemalter Himmel nur für die Intro-Fahrt.
    const sky = new THREE.Mesh(own(new THREE.SphereGeometry(400, 32, 16)), own(crSkyMaterial()));
    sky.frustumCulled = false;
    sky.renderOrder = -10;
    scene.add(sky);
    const env = neutralEnvironment(renderer);
    scene.environment = env.texture;
    scene.environmentIntensity = 0.35;

    // ── Licht: sonniger Tag ──────────────────────────────────────────────────
    // Arena-Licht: hell und warm, weiche Schatten
    scene.add(new THREE.HemisphereLight(0xeaf6ff, 0x6a8f3a, 1.35));
    const sun = new THREE.DirectionalLight(0xfff0d8, 2.2);
    sun.position.set(-12, 27, -9);
    // Schatten der Bäume/Steine auf die Ufer (Spielfläche ist Wasser — dort ändert sich nichts)
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 90 });
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.03;
    sun.shadow.radius = 4;
    scene.add(sun, sun.target);

    // ── Wasser + Flussbett ────────────────────────────────────────────────────
    const sunDir = new THREE.Vector3(0.45, 0.85, -0.25).normalize();
    const waterMat = own(new THREE.ShaderMaterial({
      vertexShader: WATER_VERT,
      fragmentShader: WATER_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uSun: { value: sunDir },
        uView: { value: new THREE.Vector3(0, SIN, COS) },
        uAlpha: { value: 0.8 },
        uFogColor: { value: SKY },
        uFogNear: { value: 1e4 },
        uFogFar: { value: 2e4 },
        uEdgeA: { value: -3 },
        uEdgeB: { value: 3 },
      },
      transparent: true,
      depthWrite: false,
    }));
    const water = new THREE.Mesh(own(new THREE.PlaneGeometry(600, 600)), waterMat);
    water.rotation.x = -Math.PI / 2;
    water.renderOrder = 1;
    scene.add(water);
    // Flussbett: dunkles Arena-Blau (schimmert unter dem Wasser durch und vertieft die Farbe)
    const bedTex = own(bedTexture());
    bedTex.repeat.set(180, 180);
    const bedMat = own(new THREE.MeshStandardMaterial({ map: bedTex, roughness: 1, color: 0x2d5fa8, envMapIntensity: 0.2 }));
    const bed = new THREE.Mesh(own(new THREE.PlaneGeometry(600, 600)), bedMat);
    bed.rotation.x = -Math.PI / 2;
    bed.position.y = -1.1;
    scene.add(bed);

    // ── Gemeinsame Materialien ────────────────────────────────────────────────
    const woodTex = own(woodTexture());
    const raftWoodTex = own(woodTex.clone());
    raftWoodTex.repeat.set(0.6, 0.6);
    raftWoodTex.needsUpdate = true;
    const raftMat = own(new THREE.MeshStandardMaterial({ map: raftWoodTex, roughness: 0.85 }));
    raftMat.map = own(plankTexture(1, 1));
    const raftGeo = own(new THREE.BoxGeometry((FISH_W + RAFT_PAD * 2) * S, RAFT_T, ((FISH_H + RAFT_PAD * 2) * S) / SIN));
    const foamTex = own(foamTexture());
    const shadowTex = own(shadowTexture());
    const dropTex = own(dropTexture());
    const foamGeo = own(new THREE.PlaneGeometry(1, 1));

    // Layout in Referenzeinheiten — wird bei jeder Größenänderung neu gesetzt
    let W = 1360, H = 822, k = 1, padBottom = DECK_BAR_PX;
    const worldAt = (sx, sy, y, out = new THREE.Vector3()) => {
      const u = (H / 2 - sy) * S;
      return out.set((sx - W / 2) * S, y, -(u - y * COS) / SIN);
    };

    // ── Ufer, Steg, Seerosen (hängen von der Fläche ab → bei Resize neu) ────────
    const scenery = new THREE.Group();
    scene.add(scenery);
    // ── Arena rund um den Fluss (Clash-Royale-Stil, alles im Code erzeugt) ────────────
    const grassTex = own(checkerGrassTexture());
    const stoneTex = own(chunkyStoneTexture());
    const deckTex = own(plankTexture());
    const earthMat = own(new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 1 }));
    const bushMat = own(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
    const trunkMat = own(new THREE.MeshStandardMaterial({ color: 0x8a5a32, roughness: 0.9 }));
    const lilyMats = [false, false, true].map((fl) => own(new THREE.MeshStandardMaterial({ map: own(lilyTexture(fl)), transparent: true, alphaTest: 0.4, roughness: 0.7 })));
    const reedMats = [5, 9].map((seed) => own(new THREE.SpriteMaterial({ map: own(reedTexture(seed)), transparent: true, alphaTest: 0.3 })));
    const bushGeos = [3, 7, 11].map((seed) => own(bushGeometry(seed)));
    const treeCrownGeo = own(bushGeometry(21, 7, '#9ad857', '#3a7f28'));
    const trunkGeo = own(new THREE.CylinderGeometry(0.16, 0.24, 1.4, 10).translate(0, 0.7, 0));
    const disposeScenery = () => scenery.children.slice().forEach((ch) => {
      scenery.remove(ch);
      ch.traverse((m) => {
        if (m.isInstancedMesh) m.dispose();
        if (m.geometry && !m.userData.sharedGeometry && !bushGeos.includes(m.geometry) && m.geometry !== treeCrownGeo && m.geometry !== trunkGeo) m.geometry.dispose();
        if (m.material?.userData?.sceneryOwned) m.material.dispose();
      });
    });
    // Material mit eigener Wiederholung (Textur wird geteilt, nur repeat je Fläche)
    const tiled = (t, rx, ry, extra = {}) => {
      const c = t.clone();
      c.repeat.set(rx, ry);
      c.needsUpdate = true;
      const m = new THREE.MeshStandardMaterial({ map: c, roughness: 0.9, ...extra });
      m.userData.sceneryOwned = true;
      m.addEventListener('dispose', () => c.dispose());
      return m;
    };
    const FIELD = 3.2; // Breite von zwei Rasenfeldern (eine Texturwiederholung)
    const grassPlane = (w, d, x, z, y) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), tiled(grassTex, w / FIELD, d / FIELD));
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, y, z);
      m.receiveShadow = true;
      return m;
    };
    // Ufermauer aus klobigen Steinen: sichtbare Front + Deckstein-Reihe
    const bankWall = (z, y, dir, span) => {
      const g = new THREE.Group();
      // nur knapp unter die Wasserlinie (sonst schimmert die Mauer breit durchs Wasser)
      const face = new THREE.Mesh(new THREE.BoxGeometry(span, 0.42, 0.5), tiled(stoneTex, span / 1.3, 1));
      face.position.set(0, y - 0.15, z - dir * 0.25);
      face.receiveShadow = true;
      const cap = new THREE.Mesh(new THREE.BoxGeometry(span, 0.14, 0.62), tiled(stoneTex, span / 1.6, 0.25, { color: 0xe6e0d4 }));
      cap.position.set(0, y + 0.05, z - dir * 0.27); // Oberkante über dem Rasen, nicht auf gleicher Höhe
      cap.castShadow = true;
      cap.receiveShadow = true;
      g.add(face, cap);
      return g;
    };
    const buildScenery = () => {
      disposeScenery();
      const span = 240;
      const bankTop = 0.06;
      const bankEdge = worldAt(0, BANK_REF, bankTop);
      const dockTop = 0.2;
      const dockEdge = worldAt(0, H - padBottom * 0.82, dockTop);
      waterMat.uniforms.uEdgeA.value = bankEdge.z;
      waterMat.uniforms.uEdgeB.value = dockEdge.z;
      // Gegenufer: Mauer + Arena-Rasen bis weit nach hinten
      scenery.add(bankWall(bankEdge.z, bankTop, -1, span));
      scenery.add(grassPlane(span, 70, 0, bankEdge.z - 0.55 - 35, bankTop + 0.09));
      const backEarth = new THREE.Mesh(new THREE.BoxGeometry(span, 0.6, 70), earthMat);
      backEarth.position.set(0, bankTop - 0.42, bankEdge.z - 0.55 - 35); // Oberkante deutlich unter dem Rasen (sonst Flimmern)
      scenery.add(backEarth);
      // Diesseits (unter der Deck-Leiste): Mauer, Rasen, in der Mitte ein Holzsteg
      scenery.add(bankWall(dockEdge.z, dockTop, 1, span));
      scenery.add(grassPlane(span, 70, 0, dockEdge.z + 0.55 + 35, dockTop + 0.09));
      const nearEarth = new THREE.Mesh(new THREE.BoxGeometry(span, 0.9, 70), earthMat);
      nearEarth.position.set(0, dockTop - 0.62, dockEdge.z + 0.55 + 35);
      scenery.add(nearEarth);
      const pierW = Math.min(6, W * S * 0.35);
      const pier = new THREE.Mesh(new THREE.BoxGeometry(pierW, 0.16, 1.4), tiled(deckTex, 1, pierW / 1.2));
      pier.material.map.rotation = Math.PI / 2;
      pier.position.set(0, dockTop + 0.12, dockEdge.z - 0.35);
      pier.castShadow = pier.receiveShadow = true;
      addOutline(pier, 0.02);
      scenery.add(pier);
      const postGeo = new THREE.CylinderGeometry(0.09, 0.1, 0.9, 10);
      for (let x = -pierW / 2 + 0.2; x <= pierW / 2 - 0.1; x += pierW / 4) {
        const post = new THREE.Mesh(postGeo, raftMat);
        post.position.set(x, dockTop - 0.3, dockEdge.z - 1.0);
        scenery.add(post);
      }

      // Holzbrücken wie in der Arena — links und rechts außerhalb des Spielausschnitts
      // (Karten treiben nie darunter), sichtbar in der Intro-Fahrt
      const riverW = dockEdge.z - bankEdge.z;
      const bridgeX = (W * S) / 2 + 3.2;
      [-1, 1].forEach((side) => {
        const g = new THREE.Group();
        g.position.set(side * bridgeX, 0, (bankEdge.z + dockEdge.z) / 2);
        const deck = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.22, riverW + 1.6), tiled(deckTex, 1, (riverW + 1.6) / 1.3));
        deck.position.y = 0.42;
        deck.castShadow = deck.receiveShadow = true;
        addOutline(deck, 0.025);
        g.add(deck);
        [-1, 1].forEach((rs) => {
          const rail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, riverW + 1.4), tiled(deckTex, 0.2, riverW / 1.3));
          rail.position.set(rs * 1.2, 0.95, 0);
          addOutline(rail, 0.02);
          g.add(rail);
          for (let k = 0; k <= 6; k++) {
            const pz = -riverW / 2 - 0.5 + (k / 6) * (riverW + 1);
            const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.16), raftMat);
            post.position.set(rs * 1.2, 0.72, pz);
            g.add(post);
          }
        });
        // Steinpfeiler an den Ufern
        [-1, 1].forEach((es) => {
          const pil = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.0, 0.9), tiled(stoneTex, 1.3, 0.5));
          pil.position.set(0, 0.0, es * (riverW / 2 + 0.2));
          pil.castShadow = true;
          addOutline(pil, 0.025);
          g.add(pil);
        });
        scenery.add(g);
      });

      // Büsche und Bäume (Arena-Stil: weiche Kugelhaufen mit Kontur), im Spiel außerhalb des Bilds
      const r = (key) => hash01(key);
      const addBush = (x, y, z, s, k) => {
        const m = new THREE.Mesh(bushGeos[k % bushGeos.length], bushMat);
        m.position.set(x, y, z);
        m.scale.setScalar(s);
        m.rotation.y = r(`br${k}`) * 6;
        m.castShadow = true;
        addOutline(m, 0.035 / s);
        scenery.add(m);
      };
      const addTree = (x, y, z, s, k) => {
        const g = new THREE.Group();
        const t = new THREE.Mesh(trunkGeo, trunkMat);
        t.castShadow = true;
        addOutline(t, 0.03);
        const c = new THREE.Mesh(treeCrownGeo, bushMat);
        c.position.y = 1.1;
        c.scale.setScalar(1.35);
        c.castShadow = true;
        addOutline(c, 0.03);
        g.add(t, c);
        g.position.set(x, y, z);
        g.scale.setScalar(s);
        g.rotation.y = r(`tr${k}`) * 6;
        scenery.add(g);
      };
      for (let i = 0; i < 46; i++) {
        const far = i % 2 === 0;
        const x = -60 + r(`bx${i}`) * 120;
        const z = far ? bankEdge.z - 1.4 - r(`bz${i}`) * 6 : dockEdge.z + 5 + r(`bz${i}`) * 8;
        addBush(x, far ? bankTop + 0.09 : dockTop + 0.09, z, 0.55 + r(`bs${i}`) * 0.5, i);
      }
      for (let i = 0; i < 36; i++) {
        const far = i % 2 === 0;
        const x = -70 + r(`tx${i}`) * 140;
        const z = far ? bankEdge.z - 5 - r(`tz${i}`) * 20 : dockEdge.z + 8 + r(`tz${i}`) * 18;
        addTree(x, far ? bankTop + 0.09 : dockTop + 0.09, z, 0.9 + r(`ts${i}`) * 0.6, i);
      }

      // Seerosen am oberen und unteren Rand, Schilf an den Ecken
      const lilyGeo = new THREE.PlaneGeometry(1, 1);
      const lilyRand = (i) => hash01(`lily${i}`);
      for (let i = 0; i < 9; i++) {
        const top = i % 2 === 0;
        const sx = lilyRand(i) * W;
        const sy = top ? BANK_REF + 10 + lilyRand(i + 30) * 26 : H - padBottom * 0.82 - 12 - lilyRand(i + 60) * 22;
        const size = 26 + lilyRand(i + 90) * 22;
        const lily = new THREE.Mesh(lilyGeo, lilyMats[i % 3]);
        lily.rotation.x = -Math.PI / 2;
        lily.rotation.z = lilyRand(i + 120) * Math.PI * 2;
        lily.scale.set(size * S, (size * S) / SIN, 1);
        worldAt(sx, sy, 0.003, lily.position);
        scenery.add(lily);
      }
      [[18, 0], [W - 18, 1], [52, 1], [W - 56, 0]].forEach(([sx, m], i) => {
        const reed = new THREE.Sprite(reedMats[m]);
        const hRef = 70 + i * 6;
        reed.center.set(0.5, 0);
        reed.scale.set((hRef / 2) * S, hRef * S, 1);
        worldAt(sx, H - padBottom * 0.82 - 2, dockTop, reed.position);
        scenery.add(reed);
      });
    };

    // ── Karten-Flöße ─────────────────────────────────────────────────────────
    const loader = new THREE.TextureLoader();
    const texCache = new Map();
    const cardTex = (id, rarity) => {
      if (texCache.has(id)) return texCache.get(id);
      const tex = own(loader.load(cardTextureUrl(id), (t) => {
        const b = CARD_FRAME_BOX[rarity] || CARD_FRAME_BOX.Common;
        t.repeat.set(b.w / CARD_IMAGE_SIZE.w, b.h / CARD_IMAGE_SIZE.h);
        t.offset.set(b.x / CARD_IMAGE_SIZE.w, 1 - (b.y + b.h) / CARD_IMAGE_SIZE.h);
        t.needsUpdate = true;
        t.userData.ready = true; // vorher bleibt die Karte unsichtbar (nur das leere Floß)
      }));
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      texCache.set(id, tex);
      return tex;
    };
    const labelCache = new Map();
    const label = (text, color) => {
      const key = `${color}|${text}`;
      if (!labelCache.has(key)) labelCache.set(key, labelTexture(text, color));
      return labelCache.get(key);
    };
    // Kartenbild passend (contain) in die Kartenfläche — genau wie drawCardFrame im 2D-Fluss
    const artSize = (rarity) => {
      const b = CARD_FRAME_BOX[rarity] || CARD_FRAME_BOX.Common;
      const sc = Math.min(FISH_W / b.w, FISH_H / b.h);
      return { w: b.w * sc, h: b.h * sc };
    };
    const flatPlane = (wRef, hRef) => new THREE.PlaneGeometry(wRef * S, (hRef * S) / SIN).rotateX(-Math.PI / 2);
    const labelGeo = own(new THREE.PlaneGeometry(LABEL_W * S, (LABEL_W * 72 / 512) * S));
    const crownGeo = own(flatPlane(15, 13));
    const crownMat = own(new THREE.MeshBasicMaterial({ map: own(crownTexture()), transparent: true, toneMapped: false }));
    const ghostGeo = own(flatPlane(FISH_W, FISH_H));
    const wakeTex = own(wakeTexture());
    const bubbleMat = own(new THREE.SpriteMaterial({ map: dropTex, color: 0xe8f8ff, transparent: true, depthWrite: false }));

    const fishObjs = new Map();
    const makeFish = (f) => {
      const rnd = hash01(f.fishId);
      const group = new THREE.Group();         // folgt der Bahn
      const bob = new THREE.Group();           // Schaukeln
      const lift = new THREE.Group();          // Karte (wird beim Fang abgerissen)
      group.add(bob);
      bob.add(lift);
      const raft = new THREE.Mesh(raftGeo, raftMat);
      raft.position.y = -RAFT_T / 2;
      bob.add(raft);
      const { w, h } = artSize(f.card.rarity);
      const rimMat = new THREE.MeshBasicMaterial({ color: RARITY_COLOR[f.card.rarity] || '#9ca3af', transparent: true, toneMapped: false });
      const rim = new THREE.Mesh(flatPlane(w + 4, h + 4), rimMat);
      rim.position.y = 0.003;
      const cardMat = new THREE.MeshBasicMaterial({ map: cardTex(f.card.id, f.card.rarity), transparent: true, alphaTest: 0.3, toneMapped: false });
      const card = new THREE.Mesh(flatPlane(w, h), cardMat);
      card.position.y = 0.006;
      lift.add(rim, card);
      // Champion-Abzeichen oben rechts (gleiche Stelle wie im 2D-Fluss)
      if (f.card.isChampion) {
        const crown = new THREE.Mesh(crownGeo, crownMat);
        crown.position.set((FISH_W / 2 - 10.5) * S, 0.009, -((FISH_H / 2 - 9.5) * S) / SIN);
        lift.add(crown);
      }
      scene.add(group);
      // Kielwasser hinter dem Floß (immer leicht, beim Sprint kräftig) — Textur läuft zum Floß hin auf
      // DoubleSide: für Flöße nach links wird der Streifen über eine negative Skalierung gespiegelt
      const wakeMat = new THREE.MeshBasicMaterial({ map: wakeTex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
      const wake = new THREE.Mesh(foamGeo, wakeMat);
      wake.rotation.x = -Math.PI / 2;
      wake.renderOrder = 2;
      scene.add(wake);
      // Flitzer: drei Nachbilder hinter der Karte, damit der Schub ablesbar bleibt (wie in 2D)
      const ghosts = f.sprints?.length ? [0, 1, 2].map(() => {
        const gm = new THREE.MeshBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
        const g = new THREE.Mesh(ghostGeo, gm);
        g.renderOrder = 4;
        scene.add(g);
        return g;
      }) : [];
      // Luftblasen beim Abtauchen (liegen unter dem Wasser → werden von ihm eingefärbt)
      const bubbles = f.dives?.length ? [0, 1, 2, 3].map(() => {
        const b = new THREE.Sprite(bubbleMat);
        b.visible = false;
        scene.add(b);
        return b;
      }) : [];
      // Schaumring auf dem Wasser (bleibt an der Oberfläche, sinkt nicht mit)
      const foamMat = new THREE.MeshBasicMaterial({ map: foamTex, transparent: true, opacity: 0.5, depthWrite: false });
      const foam = new THREE.Mesh(foamGeo, foamMat);
      foam.rotation.x = -Math.PI / 2;
      foam.scale.set((FISH_W + 34) * S, ((FISH_H + 34) * S) / SIN, 1);
      foam.renderOrder = 2;
      scene.add(foam);
      // Schatten des Floßes auf dem Wasser, zur sonnenabgewandten Seite versetzt
      const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0.35, depthWrite: false });
      const shadow = new THREE.Mesh(foamGeo, shadowMat);
      shadow.rotation.x = -Math.PI / 2;
      shadow.scale.set((FISH_W + RAFT_PAD * 2 + 22) * S, ((FISH_H + RAFT_PAD * 2 + 22) * S) / SIN, 1);
      shadow.renderOrder = 2;
      scene.add(shadow);
      const nameMat = new THREE.MeshBasicMaterial({ map: label(f.card.name, '#ffffff'), transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
      const name = new THREE.Mesh(labelGeo, nameMat);
      name.renderOrder = 10;
      scene.add(name);
      return {
        f, rnd, group, bob, lift, raft, rim, rimMat, card, cardMat, foam, foamMat, shadow, shadowMat, name, nameMat,
        wake, wakeMat, ghosts, bubbles,
        hover: 0, splashed: false, line: null, lineMat: null, lastSpray: 0,
      };
    };
    const disposeFish = (o) => {
      scene.remove(o.group, o.foam, o.shadow, o.name, o.wake);
      o.wakeMat.dispose();
      o.ghosts.forEach((g) => { scene.remove(g); g.material.dispose(); });
      o.bubbles.forEach((b) => scene.remove(b));
      if (o.line) { scene.remove(o.line); o.line.geometry.dispose(); o.lineMat.dispose(); }
      o.rim.geometry.dispose(); o.rimMat.dispose();
      o.card.geometry.dispose(); o.cardMat.dispose();
      o.foamMat.dispose(); o.shadowMat.dispose(); o.nameMat.dispose();
    };

    // ── Tropfen + Klick-Ringe ────────────────────────────────────────────────
    const drops = [];
    const dropMats = new Map();
    const dropMat = (color) => {
      if (!dropMats.has(color)) dropMats.set(color, new THREE.SpriteMaterial({ map: dropTex, color, transparent: true, depthWrite: false }));
      return dropMats.get(color);
    };
    // count/power: großer Spritzer beim Fang, kleine Gischt am Bug eines Flitzers
    const spawnDrops = (pos, color, count = 24, power = 1) => {
      if (animOff()) return;
      const born = performance.now();
      for (let i = 0; i < count; i++) {
        const sp = new THREE.Sprite(dropMat(i % 3 === 0 ? color : '#d6f2ff'));
        const r = (5 + Math.random() * 6) * S;
        sp.scale.set(r, r, 1);
        sp.position.copy(pos);
        const a = Math.random() * Math.PI * 2;
        const v = (1.2 + Math.random() * 1.6) * power;
        sp.userData = { born, size: power, vx: Math.cos(a) * v * 0.6, vz: Math.sin(a) * v * 0.6, vy: (2.2 + Math.random() * 2.2) * power, x0: pos.x, y0: pos.y, z0: pos.z };
        sp.renderOrder = 11;
        scene.add(sp);
        drops.push(sp);
      }
    };
    const ripples = [];
    const spawnRipple = (sx, sy) => {
      if (animOff()) return;
      const mat = new THREE.MeshBasicMaterial({ map: foamTex, transparent: true, depthWrite: false, color: 0xe6f8ff });
      const m = new THREE.Mesh(foamGeo, mat);
      m.rotation.x = -Math.PI / 2;
      worldAt(sx, sy, 0.004, m.position);
      m.userData.born = performance.now();
      m.renderOrder = 3;
      scene.add(m);
      ripples.push(m);
    };

    // ── Treffer: dieselbe Rechteck-Prüfung wie im 2D-Fluss ─────────────────────
    // Bei Überlappung gewinnt die vordere (weiter unten liegende) Karte — die sieht man vorne.
    const mouse = { x: -1, y: -1 };
    const fishAt = (mx, my, serverTime) => {
      const s = stateRef.current;
      if (!s) return null;
      let best = null;
      for (const f of s.fish) {
        if (f.caughtBy) continue;
        const { x, y, age } = fishPos(f, serverTime, W, H, padBottom);
        if (age < 0 || age > f.travelMs) continue;
        if (mx >= x && mx <= x + FISH_W && my >= y && my <= y + FISH_H && (!best || y > best.y)) best = { f, x, y, age };
      }
      return best;
    };
    const toRef = (e) => {
      const rect = renderer.domElement.getBoundingClientRect();
      return { rect, mx: (e.clientX - rect.left) / k, my: (e.clientY - rect.top) / k };
    };
    const onMove = (e) => { const { mx, my } = toRef(e); mouse.x = mx; mouse.y = my; };
    const onLeave = () => { mouse.x = -1; mouse.y = -1; };
    const onDown = (e) => {
      const { rect, mx, my } = toRef(e);
      spawnRipple(mx, my);
      if (!canRef.current) return;
      const hit = fishAt(mx, my, clockRef.current.serverTime());
      if (!hit) return;
      if (isHardDiving(hit.f, hit.age)) return; // klick-immun während des Abtauchens
      propsRef.current.onCatch?.(hit.f.fishId, {
        card: hit.f.card,
        rect: new DOMRect(rect.left + hit.x * k, rect.top + hit.y * k, FISH_W * k, FISH_H * k),
      });
    };
    renderer.domElement.addEventListener('pointermove', onMove);
    renderer.domElement.addEventListener('pointerleave', onLeave);
    renderer.domElement.addEventListener('pointerdown', onDown);

    // ── Größe ────────────────────────────────────────────────────────────────
    let scenerySig = '';
    const layout = () => {
      const wPx = container.clientWidth || 1, hPx = container.clientHeight || 1;
      renderer.setSize(wPx, hPx, false);
      post.setSize(wPx, hPx);
      renderer.domElement.style.width = `${wPx}px`;
      renderer.domElement.style.height = `${hPx}px`;
      k = fishScale(wPx, hPx);
      W = wPx / k; H = hPx / k;
      padBottom = DECK_BAR_PX / k;
      camera.left = (-W / 2) * S; camera.right = (W / 2) * S;
      camera.top = (H / 2) * S; camera.bottom = (-H / 2) * S;
      camera.updateProjectionMatrix();
      const sig = `${Math.round(W)}x${Math.round(H)}`;
      if (sig !== scenerySig) { scenerySig = sig; buildScenery(); }
    };
    const adaptQuality = createQualityGovernor(renderer, Math.min(window.devicePixelRatio || 1, 1.75), () => layout());
    layout();
    // Kein Laden: alles ist sofort da. Beim ersten Bild nur Shader vorübersetzen.
    let warmed = false, lastPerf = performance.now();
    // setSize leert die Zeichenfläche; der ResizeObserver feuert nach dem Frame → erst im
    // nächsten Frame vor dem Zeichnen anpassen, sonst blitzt ein leeres Bild auf (wie Pyramide)
    let sizeDirty = false;
    const ro = new ResizeObserver(() => { sizeDirty = true; });
    ro.observe(container);

    // ── Intro-Kamerafahrt (läuft während des Server-Countdowns) ──────────────────
    // Start tief über dem Wasser mit Blick flussabwärts, dann herumschwenken und aufsteigen.
    // Zum Schluss ein Dolly-Zoom: Die Kamera fährt weit zurück, während das Blickfeld
    // gleich viel Fluss zeigt — die Perspektive wird dabei flach und geht nahtlos in die
    // orthografische Spielansicht über (Endstellung = gleiche Richtung, gleicher Ausschnitt).
    // Karten schwimmen erst nach dem Countdown, die Fahrt verschafft also niemandem Vorsprung.
    const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
    const INTRO_D0 = 7, INTRO_D1 = 260;
    const introTarget = new THREE.Vector3();
    const introPose = (t) => {
      const u = easeIO(t);
      const zMid = worldAt(W / 2, (H - padBottom) / 2, 0).z;
      const yaw = (Math.PI / 2) * (1 - easeIO(clamp01(t * 1.15)));
      const pitch = THREE.MathUtils.degToRad(7) + (TILT - THREE.MathUtils.degToRad(7)) * easeIO(clamp01((t - 0.08) / 0.92));
      introTarget.set(-18 * (1 - u), 0.4 * (1 - u), zMid * (1 - u));
      const d = INTRO_D0 * (INTRO_D1 / INTRO_D0) ** (u ** 2.4);
      const vh0 = 2 * INTRO_D0 * Math.tan(THREE.MathUtils.degToRad(27));
      const vh = vh0 + (H * S - vh0) * u;
      const fwd = tmp.set(Math.cos(pitch) * Math.sin(yaw), -Math.sin(pitch), -Math.cos(pitch) * Math.cos(yaw));
      introCam.position.copy(introTarget).addScaledVector(fwd, -d);
      introCam.fov = THREE.MathUtils.radToDeg(2 * Math.atan(vh / 2 / d));
      introCam.aspect = W / H;
      introCam.updateProjectionMatrix();
      introCam.lookAt(introTarget);
      // Dunst wandert mit: beim Zurückfahren wäre der Fluss sonst selbst im Nebel
      setFog(d + 22, d + 120);
    };
    const setFog = (near, far) => {
      scene.fog.near = near; scene.fog.far = far;
      waterMat.uniforms.uFogNear.value = near;
      waterMat.uniforms.uFogFar.value = far;
    };
    let intro = null;          // { start, end } in Server-Zeit
    let introChecked = false;

    // ── Schleife ──────────────────────────────────────────────────────────────
    const tmp = new THREE.Vector3();
    const tmp2 = new THREE.Vector3();
    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (sizeDirty) { sizeDirty = false; layout(); }
      const nowPerf = performance.now();
      const dt = Math.min(0.05, (nowPerf - lastPerf) / 1000);
      lastPerf = nowPerf;
      if (!warmed) { warmed = true; warmUp(renderer, scene, camera, post); }
      // Auflösung nicht mitten in der Kamerafahrt umstellen (sichtbarer Sprung)
      if (!intro) adaptQuality(dt);
      const off = animOff();
      waterMat.uniforms.uTime.value = off ? 0 : nowPerf / 1000;
      const s = stateRef.current;
      const serverTime = clockRef.current.serverTime();
      const P = propsRef.current;

      // Intro nur beim Betreten während des Countdowns (nicht nach Neuladen mitten im Spiel)
      if (!introChecked && s) {
        introChecked = true;
        if (!off && s.countdownUntil && s.countdownUntil - serverTime > 1200) {
          intro = { start: serverTime, end: s.countdownUntil };
        }
      }
      let viewCam = camera;
      // Prüfstand: window.__cr3dIntroT (0–1) hält die Fahrt fest; ohne Countdown startet sie dann trotzdem
      const dbgT = typeof window.__cr3dIntroT === 'number' ? window.__cr3dIntroT : null;
      if (dbgT !== null && !intro) intro = { start: serverTime, end: serverTime + 5000 };
      if (intro) {
        const t = dbgT ?? clamp01((serverTime - intro.start) / (intro.end - intro.start));
        if ((t >= 1 && dbgT === null) || off) { intro = null; setFog(1e4, 2e4); }
        else { introPose(t); viewCam = introCam; }
      }

      // Flöße mit dem Zustand abgleichen
      const alive = new Set();
      (s?.fish || []).forEach((f) => {
        alive.add(f.fishId);
        const o = fishObjs.get(f.fishId);
        if (!o) fishObjs.set(f.fishId, makeFish(f));
        else o.f = f;
      });
      fishObjs.forEach((o, id) => { if (!alive.has(id)) { disposeFish(o); fishObjs.delete(id); } });

      const hovered = canRef.current && mouse.x >= 0 ? fishAt(mouse.x, mouse.y, serverTime) : null;
      const hoverId = hovered && !isHardDiving(hovered.f, hovered.age) ? hovered.f.fishId : null;
      const denied = P.deniedRef?.current;
      const nowMs = Date.now();

      fishObjs.forEach((o) => {
        const f = o.f;
        const { x, y, age } = fishPos(f, serverTime, W, H, padBottom);
        const cx = x + FISH_W / 2, cy = y + FISH_H / 2;
        const visible = f.caughtBy || (age >= 0 && age <= f.travelMs);
        o.group.visible = o.foam.visible = o.shadow.visible = o.name.visible = o.wake.visible = !!visible;
        if (!visible || f.caughtBy) {
          o.ghosts.forEach((g) => { g.visible = false; });
          o.bubbles.forEach((b) => { b.visible = false; });
          if (f.caughtBy) o.wake.visible = false;
        }
        if (!visible) return;
        const ready = !!o.cardMat.map?.userData.ready;
        o.card.visible = o.rim.visible = ready;

        const bobT = off ? 0 : nowPerf / 1000;
        o.bob.rotation.z = Math.sin(bobT * 1.4 + o.rnd * 6) * 0.03;
        o.bob.rotation.x = Math.sin(bobT * 1.1 + o.rnd * 4) * 0.025;

        if (f.caughtBy) {
          // Fang: Karte reißt vom Floß nach oben, Floß sinkt weg, Schnur in Fängerfarbe
          const e = clamp01((serverTime - f.caughtAt) / CAUGHT_LINGER_MS);
          worldAt(cx, cy, 0, o.group.position);
          const color = f.caughtColor || '#22c55e';
          if (!o.splashed) {
            o.splashed = true;
            o.nameMat.map = label(f.caughtName || '', color);
            o.nameMat.needsUpdate = true;
            if (e < 0.35) spawnDrops(o.group.position.clone(), color);
            if (f.caughtBy !== P.myPlayerId) playSound('pick');
          }
          const rise = (e * e * 150 + e * 20) * S;
          o.lift.position.copy(upVec).multiplyScalar(rise);
          o.lift.position.y += 0.08 * Math.min(1, e * 6);
          o.lift.rotation.x = Math.min(1, e * 2.5) * (Math.PI / 2 - TILT) * 0.7;
          o.raft.position.y = -RAFT_T / 2 - e * DIVE_DEPTH * 1.4;
          const fade = 1 - e;
          o.cardMat.opacity = fade;
          o.rimMat.color.set(color);
          o.rimMat.opacity = fade;
          o.foamMat.opacity = 0.7 * fade;
          o.foam.scale.set((FISH_W + 34 + e * 60) * S, ((FISH_H + 34 + e * 60) * S) / SIN, 1);
          worldAt(cx, cy, 0.002, o.foam.position);
          o.shadowMat.opacity = 0.35 * Math.max(0, 1 - e * 3);
          worldAt(cx + 7, cy + 9, 0.001, o.shadow.position);
          // Fänger-Name über der Karte
          o.nameMat.opacity = fade;
          o.name.quaternion.copy(camera.quaternion);
          tmp.copy(o.group.position).add(o.lift.position);
          o.name.position.copy(tmp).addScaledVector(upVec, (FISH_H / 2 + 14) * S);
          // Schnur: vom Steg (eigener Fang) bzw. vom oberen Ufer (Mitspieler) zum Haken
          const mine = f.caughtBy === P.myPlayerId;
          const from = mine
            ? worldAt(W / 2, H - padBottom * 0.5, 1.4, tmp2)
            : worldAt(W * (0.15 + hash01(f.caughtBy) * 0.7), 0, 1.4, tmp2);
          const hook = tmp.copy(o.group.position).add(o.lift.position).addScaledVector(upVec, (FISH_H / 2) * S);
          const mid = from.clone().lerp(hook, 0.5);
          mid.y -= 0.35 * (1 - e);
          const curve = new THREE.QuadraticBezierCurve3(from.clone(), mid, hook.clone());
          if (!o.line) {
            o.lineMat = new THREE.MeshBasicMaterial({ color, transparent: true, toneMapped: false });
            o.line = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.012, 5), o.lineMat);
            o.line.renderOrder = 9;
            scene.add(o.line);
          } else {
            o.line.geometry.dispose();
            o.line.geometry = new THREE.TubeGeometry(curve, 24, 0.012, 5);
          }
          o.lineMat.opacity = fade;
          return;
        }

        const dv = diveFactor(f, age);
        const sf = sprintFactor(f, age);
        const isHover = hoverId === f.fishId;
        o.hover += ((isHover ? 1 : 0) - o.hover) * (off ? 1 : 0.25);
        // Abtauchen: Floß sinkt unter die Oberfläche (auf dem Bildschirm sackt es leicht ab)
        worldAt(cx, cy + dv * 9, -DIVE_DEPTH * dv + o.hover * 0.06, o.group.position);
        // Schaum: um treibende Flöße ruhig, im Sprint aufgewühlt, beim Abtauchen Blasenring
        worldAt(cx, cy, 0.002, o.foam.position);
        const pulse = off ? 0 : Math.sin(nowPerf / 380 + o.rnd * 9) * 0.06;
        const grow = 34 + sf * 30 + dv * 16;
        o.foam.scale.set((FISH_W + grow) * S * (1 + pulse), ((FISH_H + grow) * S * (1 + pulse)) / SIN, 1);
        o.foamMat.opacity = 0.42 + sf * 0.4 + dv * 0.2;
        // Schatten: beim Anheben (Hover) weiter weg und weicher, beim Abtauchen verschwunden
        worldAt(cx + 7 + o.hover * 5, cy + 9 + o.hover * 6, 0.001, o.shadow.position);
        o.shadowMat.opacity = 0.35 * (1 - dv) * (1 - o.hover * 0.25);
        // Rand: Seltenheit, beim Hovern weiß, nach einer Ablehnung kurz rot
        const deniedHere = denied && denied.fishId === f.fishId && nowMs - denied.ts < 700;
        if (deniedHere) o.rimMat.color.set('#ef4444');
        else if (isHover) o.rimMat.color.set('#ffffff');
        else if (sf > 0.3) o.rimMat.color.set('#bae6fd');
        else o.rimMat.color.set(RARITY_COLOR[f.card.rarity] || '#9ca3af');
        o.cardMat.opacity = 1;
        o.rimMat.opacity = 1;
        // Kartenname unter dem Floß (nur oberflächennah, im Sprint verwischt)
        o.name.quaternion.copy(camera.quaternion);
        worldAt(cx, y + FISH_H + 9, 0.02, o.name.position);
        o.name.visible = dv < 0.4;
        o.nameMat.opacity = (1 - dv) * 0.9 * (1 - sf * 0.75);
        // Kielwasser: Streifen hinter dem Floß, beim Sprint lang und kräftig
        const wakeLen = 60 + sf * 120;
        worldAt(cx - f.dir * (FISH_W / 2 + wakeLen / 2 - 6), cy, 0.003, o.wake.position);
        o.wake.scale.set(f.dir * wakeLen * S, (FISH_H * 0.8 * S) / SIN, 1);
        o.wakeMat.opacity = (0.22 + sf * 0.6) * (1 - dv);
        // Flitzer: Nachbilder an den Positionen von vor 55/110/165 ms, Gischt am Bug
        o.ghosts.forEach((g, gi) => {
          const op = sf * (0.2 - gi * 0.06);
          g.visible = op > 0.01;
          if (!g.visible) return;
          const gp = fishPos(f, serverTime - (gi + 1) * 55, W, H, padBottom);
          worldAt(gp.x + FISH_W / 2, gp.y + FISH_H / 2, 0.01, g.position);
          g.material.opacity = op;
        });
        if (sf > 0.5 && !off && nowPerf - o.lastSpray > 70) {
          o.lastSpray = nowPerf;
          spawnDrops(worldAt(cx + f.dir * (FISH_W / 2), cy, 0.05), '#ffffff', 3, 0.45);
        }
        // Luftblasen steigen vom abgetauchten Floß zur Oberfläche
        o.bubbles.forEach((b, i) => {
          b.visible = dv > 0.12 && !off;
          if (!b.visible) return;
          const ph = (nowPerf / 900 + i / 4 + o.rnd) % 1;
          const base = o.group.position;
          b.position.set(base.x + Math.sin(nowPerf / 300 + i * 2.1) * 0.12, base.y + (0.03 - base.y) * ph, base.z + (i - 1.5) * 0.08);
          const sz = (5 + i * 1.5) * S * (0.6 + ph * 0.6) * Math.min(1, dv * 1.4);
          b.scale.set(sz, sz, 1);
        });
      });

      // Tropfen (ballistisch) und Klick-Ringe
      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i];
        const t = (nowPerf - d.userData.born) / 1000;
        if (t * 1000 > DROP_MS) { scene.remove(d); drops.splice(i, 1); continue; }
        const u = d.userData;
        d.position.set(u.x0 + u.vx * t, u.y0 + u.vy * t - 9.8 * t * t, u.z0 + u.vz * t);
        d.material.opacity = 1; // gemeinsames Material — Ausblenden über die Größe
        const sc = (1 - t * 1000 / DROP_MS) * 0.09 * u.size;
        d.scale.set(sc, sc, 1);
      }
      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i];
        const e = (nowPerf - r.userData.born) / RIPPLE_MS;
        if (e >= 1) { scene.remove(r); r.material.dispose(); ripples.splice(i, 1); continue; }
        const size = (10 + e * 60) * S;
        r.scale.set(size, size / SIN, 1);
        r.material.opacity = (1 - e) * 0.8;
      }

      renderer.domElement.style.cursor = !canRef.current ? 'not-allowed' : hoverId ? 'pointer' : 'default';
      post.renderPass.camera = viewCam;
      post.render(dt);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointermove', onMove);
      renderer.domElement.removeEventListener('pointerleave', onLeave);
      renderer.domElement.removeEventListener('pointerdown', onDown);
      fishObjs.forEach(disposeFish);
      drops.forEach((d) => scene.remove(d));
      ripples.forEach((r) => r.material.dispose());
      dropMats.forEach((m) => m.dispose());
      labelCache.forEach((t) => t.dispose());
      disposeScenery();
      disposables.forEach((d) => d.dispose?.());
      env.dispose();
      post.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={containerRef} className="absolute inset-0" style={{ touchAction: 'none' }} />;
}
