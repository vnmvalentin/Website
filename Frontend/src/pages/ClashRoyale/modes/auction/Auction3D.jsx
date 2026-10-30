// Elixir Auction in 3D: ein Auktionssaal mit Tafel, Vorhängen und Scheinwerfern.
//
// Ablauf:
//   • Zu Spielbeginn fährt die Kamera durch die Saaltür bis vor die Auktionstafel.
//   • Jede Runde werden die Karten von oben an die Tafel gehängt und drehen sich um.
//     Geboten wird per Klick auf die Karte — Gebotshöhe und Elixier bleiben als normale
//     Leiste unter der Szene (ElixirAuction.jsx).
//   • Auflösung Karte für Karte (Zeitplan aus revealTiming.js, derselbe wie in 2D) — nur Karten
//     mit Geboten kommen nach vorne, die übrigen blenden solange aus. Im Finale stehen alle
//     Karten noch einmal zusammen da, Karten ohne Gebot bekommen erst dann ihren Stempel. Die
//     Kamera bleibt stehen — die Karte fliegt von der Tafel nach vorne in die obere Bildmitte,
//     direkt darunter steigen die Gebote auf (DOM-Tafel, immer an derselben Stelle, dieselben
//     CSS-Animationen wie AuctionRevealCard), dann knallt ein 3D-Stempel in der Gewinnerfarbe
//     auf die Karte und sie fliegt zurück. Danach trägt sie dauerhaft die Avatar-Plakette des
//     Gewinners (eigene Karten zusätzlich ein goldenes DU-Band) — so sieht man am Ende auf einen
//     Blick, wer was bekommen hat.
//   • Mutterhexe: Die Kamera schwenkt zum Zauberspiegel an der linken Wand, grüner Nebel
//     wabert, ihr Porträt erscheint im Glas. Das Angebot selbst bleibt das bekannte Fenster.
//
// Die Szene ist reine Darstellung: Zustand und Server-Kommunikation bleiben in
// ElixirAuction.jsx. Kann das Gerät kein WebGL, meldet onUnsupported() — dann zeigt
// ElixirAuction die 2D-Ansicht.
import React, { useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as THREE from 'three';
import { RARITY_COLOR } from '../../data/cards';
import { CARD_FRAME_BOX, CARD_IMAGE_SIZE } from '../cardCrop';
import { glowTexture } from '../maze/mazeTextures';
import {
  curtainTexture, boardTexture, cardBackTexture,
  plaqueTexture, stampTexture, frameRingTexture, runeRingTexture, avatarBadgeTexture, bannerTexture,
} from './auctionTextures';
import {
  createPostFX, neutralEnvironment, monotoneSpline, springTo, warmUp, createQualityGovernor, flameMaterial,
} from '../scene3d/kit';
import { plankTexture, chunkyStoneTexture, diamondWallTexture, carpetTexture, addOutline } from '../scene3d/crStyle';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { sparkBurst, ringPulse } from '../../ui/juice';
import { playSound } from '../../ui/sound';
import { avatarUrl } from '../../components/avatars';
import elixirIcon from '../../../../assets/clashRoyale/ui/elixir_1.png';
import checkIcon from '../../../../assets/clashRoyale/ui/check.webp';
import redCrownImg from '../../../../assets/clashRoyale/ui/red_crown_1.png';
import blueCrownImg from '../../../../assets/clashRoyale/ui/blue_crown_1.png';

// Wimpel: Kronenbild aus dem Spiel passend zur Farbe (Rot/Blau wie die Seiten in der Arena)
const crownFor = (color) => (color === '#d93a3a' ? redCrownImg : blueCrownImg);
const cardTextureUrl = (id) => `/api/clash/card-img/${encodeURIComponent(id)}`;
const animOff = () => document.documentElement.dataset.crAnim === 'off';
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOutBack = (t) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2;

// Maße in Metern (frei gewählt, aber zueinander stimmig)
const CARD_H = 1.2;           // Höhe einer Karte an der Tafel
const SLOT_W = 1.32;          // Abstand zweier Karten in einer Reihe
const ROW_H = 1.85;           // Abstand zweier Reihen (Karte + Schild)
const BOARD_Y = 2.35;         // Mitte der Tafel über dem Boden
const ROOM_W = 14, ROOM_D = 18, ROOM_H = 5.6;
const FOV = 50;
const SPOT_I = 38;            // Scheinwerfer auf die Tafel (vorher 95: oben ausgebrannt)
const TAN = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
const INTRO_S = 3.2;          // Kamerafahrt durch die Tür (eine durchgehende Bahn, kein Halt an der Tür)
const CAM_SMOOTH = 0.5;       // Feder-Zeit der Kamera (Spiegel ↔ Tafel): weich los, weich an
const LIFT_IN_S = 0.75, LIFT_OUT_S = 0.7; // Karte fliegt nach vorne / zurück — feste Dauer
const DEAL_S = 0.7;           // Karte fliegt an die Tafel
const DEAL_STEP = 0.12;
const FLIP_S = 0.5;           // Umdrehen bei vertauschten Karten (Mutterhexe)
const MIRROR = { x: -ROOM_W / 2 + 0.06, y: 2.5, z: 6.2 };
const FRONT_DIST = 2.8;       // so weit vor der Kamera schwebt die Karte bei ihrer Auflösung

/**
 * Kartenplätze an der Tafel: eine Reihe bis 5 Karten, darüber zwei (bzw. drei) Reihen.
 * Im Hochformat (Handy) höchstens 2–3 Karten je Reihe — sonst würden sie winzig.
 */
function layout(n, portrait = false, k = 1) {
  const perRow = portrait
    ? (n <= 2 ? Math.max(1, n) : n <= 4 ? 2 : 3)
    : n <= 5 ? Math.max(1, n) : n <= 10 ? Math.ceil(n / 2) : Math.ceil(n / 3);
  const rows = Math.ceil(n / perRow);
  const slots = [];
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / perRow);
    const inRow = r === rows - 1 ? n - perRow * (rows - 1) : perRow;
    const c = i % perRow;
    slots.push({
      x: (c - (inRow - 1) / 2) * SLOT_W * k,
      y: BOARD_Y + ((rows - 1) / 2 - r) * ROW_H * k + 0.12 * k,
    });
  }
  return { slots, k, width: perRow * SLOT_W * k + 0.9, height: rows * ROW_H * k + 0.75 };
}

/** Kartengröße je Seltenheit: höhere Rahmen (Legendär, Champion) werden schmaler, nicht höher. */
function cardSize(card) {
  if (card?.isPig) return { w: CARD_H * 0.8, h: CARD_H };
  const box = CARD_FRAME_BOX[card?.rarity] || CARD_FRAME_BOX.Common;
  return { w: CARD_H * (box.w / box.h), h: CARD_H };
}

/**
 * @param {object}   props
 * @param {Array}    props.cards        angezeigte Karten (ggf. Schweine / vertauscht)
 * @param {number}   props.round
 * @param {string|null} props.revealKey  wechselt, wenn die Auflösung (neu) startet; null = keine
 * @param {Array|null}  props.schedule   revealSchedule(...).cards
 * @param {Array|null}  props.results    je Karte { receiver, stampText, stampColor, bids }
 * @param {Array}    props.bidStates    je Karte 'open' | 'mine' | 'locked' | 'none'
 * @param {number}   props.myBidAmount
 * @param {boolean}  props.witch        Mutterhexen-Besuch läuft
 * @param {string}   props.witchImg     Porträt der Mutterhexe
 * @param {string}   props.pigImg       Schweine-Bild (Schweinezauber)
 * @param {object}   props.labels       { title, championLimit, notAwarded, you, noBids }
 * @param {number}   props.bottomInset  Höhe (px) der Fußzeile, die unten über der Szene liegt —
 *                                      der Bildausschnitt richtet sich auf die Fläche darüber aus
 * @param {Function} props.onCardClick  (idx) => void
 * @param {Function} props.onUnsupported
 * @param {React.ReactNode} props.afterReveal  wird nach der letzten Karte eingeblendet
 */
const Auction3D = React.forwardRef(function Auction3D(props, ref) {
  const containerRef = useRef(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const apiRef = useRef({ getCardRect: () => null });
  useImperativeHandle(ref, () => ({ getCardRect: (i) => apiRef.current.getCardRect(i) }), []);

  // Welche Karte wird gerade aufgelöst (für die Gebotstafel im DOM); -2 = alles durch
  const [focus, setFocus] = useState(-1);
  const revealT0Ref = useRef(null);
  useEffect(() => {
    if (!props.revealKey || !props.schedule) { revealT0Ref.current = null; setFocus(-1); return undefined; }
    revealT0Ref.current = performance.now();
    setFocus(-1);
    const timers = [];
    props.schedule.forEach((c, k) => {
      if (c.empty) return;
      timers.push(setTimeout(() => setFocus(k), c.focus * 1000));
      // Tafel verschwindet, sobald die Karte zurückfliegt (wie in der Szene: slam + 1 s)
      timers.push(setTimeout(() => setFocus((cur) => (cur === k ? -1 : cur)), (c.slam + 1.0) * 1000));
    });
    const total = props.schedule.reduce((m, c) => Math.max(m, c.empty ? 0 : c.end), 0);
    timers.push(setTimeout(() => setFocus(-2), total * 1000));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.revealKey]);

  // ── Szene ──────────────────────────────────────────────────────────────────
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
    // Neutral statt ACES: die Nachbearbeitung wendet die Tonwerte auf ALLES an (auch auf die
    // unbeleuchteten Karten mit toneMapped:false) — Neutral lässt Kartenfarben unverändert
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.touchAction = 'none';
    container.appendChild(renderer.domElement);

    const disposables = [];
    const own = (x) => { disposables.push(x); return x; };

    const scene = new THREE.Scene();
    const BG = new THREE.Color(0x14244a);
    scene.background = BG;
    scene.fog = new THREE.Fog(BG, 18, 40);
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.15, 60); // near nicht zu klein (Flackern aufliegender Flächen)
    const post = createPostFX(renderer, scene, camera, { bloom: { strength: 0.22, radius: 0.45, threshold: 1.45 }, vignette: 0.26 });
    const env = neutralEnvironment(renderer);
    scene.environment = env.texture;
    scene.environmentIntensity = 0.35;

    // ── Licht: warmes Grundlicht, zwei Scheinwerfer auf die Tafel, Wandleuchten ──
    scene.add(new THREE.HemisphereLight(0xeaf2ff, 0x2a3a66, 1.8)); // etwas mehr Grundlicht statt greller Scheinwerfer
    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const spots = [-1, 1].map((side) => {
      // Gedämpft (Nutzer: Lichter über der Tafel zu hell) — weicher Rand, Ziel unter der Tafelmitte, damit der
      // Kegel nicht oben auf Goldrahmen und Wand ausbrennt
      const s = new THREE.SpotLight(0xfff1d6, SPOT_I, 22, THREE.MathUtils.degToRad(32), 0.95, 1.6);
      s.position.set(side * 3.2, ROOM_H - 0.3, 6.5);
      s.target.position.set(side * 0.8, BOARD_Y - 0.9, 0);
      scene.add(s, s.target);
      return s;
    });

    // ── Raum (Clash-Royale-Stil, alles im Code erzeugt — keine Downloads) ─────────
    const curtTex = own(curtainTexture());
    const glowTex = own(glowTexture());
    const plankT = own(plankTexture());
    const stoneT = own(chunkyStoneTexture(1, 1, ['#cdbb9b', '#bfac8c', '#d9c8a9']));
    const royalT = own(diamondWallTexture());
    const carpetT = own(carpetTexture());
    // Material mit eigener Wiederholung je Fläche (Textur geteilt) — so bleibt das Muster überall
    // gleich groß statt sich auf langen Wänden zu verzerren
    const tiledMat = (t, rx, ry, extra = {}) => {
      const c = own(t.clone());
      c.repeat.set(rx, ry);
      c.needsUpdate = true;
      return own(new THREE.MeshStandardMaterial({ map: c, roughness: 0.85, ...extra }));
    };
    const WAIN_H = 1.3;   // Steinsockel
    const floorMat = tiledMat(plankT, ROOM_W / 1.8, (ROOM_D + 6) / 1.8);
    const woodMat = own(new THREE.MeshStandardMaterial({ map: plankT, roughness: 0.8 }));
    const darkWoodMat = own(new THREE.MeshStandardMaterial({ map: plankT, color: 0x9a6c52, roughness: 0.85 }));
    // Gold matter + schwächere Umgebungsspiegelung: die Oberkante des Tafelrahmens spiegelte sonst eine helle
    // Fläche und überstrahlte als grelles Licht über der Tafel
    const goldMat = own(new THREE.MeshStandardMaterial({ color: 0xf2b632, roughness: 0.45, metalness: 0.7, envMapIntensity: 0.55 }));
    // Tafelrahmen + Goldleiste der Blende liegen direkt im Bild: fast ohne Spiegelung, sonst Lichtfleck oben
    const frameGoldMat = own(new THREE.MeshStandardMaterial({ color: 0xe0a830, roughness: 0.6, metalness: 0.35, envMapIntensity: 0.25 }));
    const curtMat = own(new THREE.MeshStandardMaterial({ map: curtTex, roughness: 0.8, side: THREE.DoubleSide }));
    const ceilMat = tiledMat(plankT, ROOM_W / 2.2, ROOM_D / 2.2, { color: 0x8f6a4e });

    // Gemeinsame Materialien — beim Umbau der Tafel NICHT freigeben (das macht das Aufräumen am Ende)
    const SHARED = new Set([goldMat, frameGoldMat, curtMat, woodMat, darkWoodMat]);
    const plane = (w, h, mat) => new THREE.Mesh(own(new THREE.PlaneGeometry(w, h)), mat);
    const box = (w, h, d, mat) => new THREE.Mesh(own(new THREE.BoxGeometry(w, h, d)), mat);
    const rbox = (w, h, d, mat, r = 0.05) => new THREE.Mesh(own(new RoundedBoxGeometry(w, h, d, 2, r)), mat);

    // Wandstück: Steinsockel, königsblaue Wand, Goldleiste, Holzgesims. Beidseitig, weil man
    // bei der Einfahrt die Stirnwand von außen sieht.
    const wallSeg = (w, x, z, ry, { from = 0, to = ROOM_H } = {}) => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = ry;
      if (from < WAIN_H) {
        const lo = plane(w, WAIN_H - from, tiledMat(stoneT, w / 2.2, (WAIN_H - from) / 1.1, { side: THREE.DoubleSide }));
        lo.position.y = from + (WAIN_H - from) / 2;
        const rail = box(w, 0.14, 0.12, goldMat);
        rail.position.set(0, WAIN_H, 0.05);
        g.add(lo, rail);
      }
      const up0 = Math.max(from, WAIN_H);
      const up = plane(w, to - up0, tiledMat(royalT, w / 2.2, (to - up0) / 2.2, { side: THREE.DoubleSide }));
      up.position.y = up0 + (to - up0) / 2;
      const cornice = box(w, 0.24, 0.18, darkWoodMat);
      cornice.position.set(0, ROOM_H - 0.12, 0.08);
      g.add(up, cornice);
      scene.add(g);
      return g;
    };

    const floor = plane(ROOM_W, ROOM_D + 6, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, ROOM_D / 2 + 3);
    scene.add(floor);
    // Roter Teppich mit Goldborte im Mittelgang
    const carpet = plane(2.2, ROOM_D + 2, tiledMat(carpetT, 1, (ROOM_D + 2) / 4.4));
    carpet.rotation.x = -Math.PI / 2;
    carpet.position.set(0, 0.015, ROOM_D / 2 + 1.6);
    Object.assign(carpet.material, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    scene.add(carpet);
    const ceil = plane(ROOM_W, ROOM_D, ceilMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, ROOM_H, ROOM_D / 2);
    scene.add(ceil);
    // Deckenbalken quer
    for (let z = 2.5; z < ROOM_D; z += 3) {
      const beam = box(ROOM_W, 0.32, 0.36, darkWoodMat);
      beam.position.set(0, ROOM_H - 0.16, z);
      addOutline(beam, 0.02);
      scene.add(beam);
    }
    // Rückwand etwas zurück: ihre Goldleiste ragte sonst durch die Tafel (z = 0,1) — goldener Streifen mitten im Bild
    wallSeg(ROOM_W, 0, -0.12, 0);
    wallSeg(ROOM_D, -ROOM_W / 2, ROOM_D / 2, Math.PI / 2);
    wallSeg(ROOM_D, ROOM_W / 2, ROOM_D / 2, -Math.PI / 2);
    // Holzpfeiler mit Goldkappen an den Seitenwänden
    [-1, 1].forEach((side) => {
      [3.2, 8.6, 14].forEach((z) => {
        const p = rbox(0.5, ROOM_H, 0.42, woodMat, 0.06);
        p.position.set(side * (ROOM_W / 2 - 0.22), ROOM_H / 2, z);
        addOutline(p, 0.02);
        const cap = rbox(0.66, 0.22, 0.56, goldMat, 0.05);
        cap.position.set(side * (ROOM_W / 2 - 0.22), ROOM_H - 0.42, z);
        const foot = rbox(0.66, 0.26, 0.56, goldMat, 0.05);
        foot.position.set(side * (ROOM_W / 2 - 0.22), 0.13, z);
        scene.add(p, cap, foot);
      });
    });
    // Wimpel mit Krone zwischen den Pfeilern (links nicht bei z≈6 — dort hängt der Zauberspiegel)
    [[-1, 11.3, '#d93a3a'], [-1, 16.3, '#2f7bea'], [1, 5.9, '#2f7bea'], [1, 11.3, '#d93a3a'], [1, 16.3, '#2f7bea']].forEach(([side, z, color]) => {
      const t = own(bannerTexture(color, crownFor(color)));
      const m = new THREE.Mesh(own(new THREE.PlaneGeometry(1.0, 2.05)), own(new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.1, roughness: 0.85, side: THREE.DoubleSide })));
      m.position.set(side * (ROOM_W / 2 - 0.06), 3.0, z);
      m.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
      const rod = new THREE.Mesh(own(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 10)), goldMat);
      rod.rotation.x = Math.PI / 2;
      rod.rotation.z = Math.PI / 2;
      rod.position.set(side * (ROOM_W / 2 - 0.1), 4.05, z);
      rod.rotation.set(0, side < 0 ? Math.PI / 2 : -Math.PI / 2, Math.PI / 2);
      scene.add(m, rod);
    });

    // Stirnwand mit Tür: zwei Wandstücke, Sturz, Türrahmen
    const DOOR_W = 2.4, DOOR_H = 3.2;
    const sideW = (ROOM_W - DOOR_W) / 2;
    [-1, 1].forEach((side) => {
      wallSeg(sideW, side * (DOOR_W / 2 + sideW / 2), ROOM_D, Math.PI);
      const post = rbox(0.3, DOOR_H, 0.4, woodMat, 0.05);
      post.position.set(side * (DOOR_W / 2 + 0.12), DOOR_H / 2, ROOM_D);
      addOutline(post, 0.02);
      scene.add(post);
    });
    wallSeg(DOOR_W, 0, ROOM_D, Math.PI, { from: DOOR_H });
    const lintel = rbox(DOOR_W + 0.6, 0.32, 0.44, woodMat, 0.05);
    lintel.position.set(0, DOOR_H + 0.1, ROOM_D);
    addOutline(lintel, 0.02);
    scene.add(lintel);
    // Gang hinter der Tür: warm beleuchtet, damit die Fahrt nicht im Nichts beginnt
    const sconceGlowMat = own(new THREE.MeshBasicMaterial({ color: 0xffd28a }));
    const corridorLight = new THREE.PointLight(0xffa65c, 14, 9, 2);
    corridorLight.position.set(0, 3.2, ROOM_D + 3.5);
    scene.add(corridorLight);
    [-1, 1].forEach((side) => {
      const lantern = new THREE.PointLight(0xffb36b, 9, 4.5, 2);
      lantern.position.set(side * (DOOR_W / 2 + 0.55), 2.5, ROOM_D + 0.45);
      const glass = new THREE.Mesh(own(new THREE.SphereGeometry(0.1, 12, 10)), sconceGlowMat);
      glass.position.copy(lantern.position);
      scene.add(lantern, glass);
      wallSeg(6, side * (DOOR_W / 2 + 0.3), ROOM_D + 3, -side * Math.PI / 2);
    });

    // Publikum: klobige Holzbänke links und rechts vom Mittelgang
    const seatGeo = own(new RoundedBoxGeometry(3.6, 0.16, 0.62, 2, 0.05));
    const backGeo = own(new RoundedBoxGeometry(3.6, 0.62, 0.12, 2, 0.04));
    const legGeo = own(new RoundedBoxGeometry(0.16, 0.5, 0.5, 2, 0.03));
    for (let r = 0; r < 4; r++) {
      [-1, 1].forEach((side) => {
        const g = new THREE.Group();
        const seat = new THREE.Mesh(seatGeo, woodMat);
        seat.position.y = 0.55;
        const backrest = new THREE.Mesh(backGeo, darkWoodMat);
        backrest.position.set(0, 0.98, 0.28);
        g.add(seat, backrest);
        [-1.5, 1.5].forEach((lx) => {
          const leg = new THREE.Mesh(legGeo, darkWoodMat);
          leg.position.set(lx, 0.25, 0);
          g.add(leg);
        });
        g.children.forEach((m) => addOutline(m, 0.018));
        g.position.set(side * 3.35, 0, 6.6 + r * 2.2);
        scene.add(g);
      });
    }

    // Kronleuchter: Wagenrad aus Holz mit Kerzen und echten Flammen (hinter der Kamera —
    // sichtbar bei der Einfahrt und am Handy)
    const chandFlames = [];
    [11, 16].forEach((z) => {
      const g = new THREE.Group();
      g.position.set(0, ROOM_H - 1.25, z);
      const ring = new THREE.Mesh(own(new THREE.TorusGeometry(0.95, 0.09, 12, 40)), darkWoodMat);
      ring.rotation.x = Math.PI / 2;
      addOutline(ring, 0.02);
      const chain = new THREE.Mesh(own(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 8)), goldMat);
      chain.position.y = 0.6;
      g.add(ring, chain);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const candle = new THREE.Mesh(own(new THREE.CylinderGeometry(0.06, 0.06, 0.26, 10)), own(new THREE.MeshStandardMaterial({ color: 0xfff3d6, roughness: 0.6 })));
        candle.position.set(Math.cos(a) * 0.95, 0.2, Math.sin(a) * 0.95);
        const fm = own(flameMaterial(2.6));
        const flame = new THREE.Mesh(own(new THREE.PlaneGeometry(0.16, 0.26)), fm);
        flame.position.set(Math.cos(a) * 0.95, 0.44, Math.sin(a) * 0.95);
        g.add(candle, flame);
        chandFlames.push({ flame, fm });
      }
      const l = new THREE.PointLight(0xffd2a0, 8, 9, 2);
      l.position.set(0, ROOM_H - 1.4, z);
      scene.add(g, l);
    });

    // Wandleuchten (warme Punktlichter mit kleiner Glühkugel)
    const sconceBulbMat = own(new THREE.MeshBasicMaterial({ color: 0xffd28a }));
    const sconces = [];
    [[-1, 4], [1, 4], [-1, 11], [1, 11]].forEach(([side, z]) => {
      const bulb = new THREE.Mesh(own(new THREE.SphereGeometry(0.09, 12, 10)), sconceBulbMat);
      bulb.position.set(side * (ROOM_W / 2 - 0.25), 3.3, z);
      const holder = box(0.12, 0.35, 0.12, goldMat);
      holder.position.set(side * (ROOM_W / 2 - 0.1), 3.1, z);
      const light = new THREE.PointLight(0xffb36b, 5, 6, 2);
      light.position.copy(bulb.position);
      scene.add(bulb, holder, light);
      sconces.push(light);
    });

    // Schwebender Staub im Licht
    const DUST = 260;
    const dustGeo = own(new THREE.BufferGeometry());
    const dustPos = new Float32Array(DUST * 3);
    for (let i = 0; i < DUST; i++) {
      dustPos[i * 3] = (Math.random() - 0.5) * ROOM_W * 0.9;
      dustPos[i * 3 + 1] = Math.random() * ROOM_H;
      dustPos[i * 3 + 2] = Math.random() * ROOM_D;
    }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    const dust = new THREE.Points(dustGeo, own(new THREE.PointsMaterial({
      map: glowTex, size: 0.05, color: 0xffe2b0, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending,
    })));
    scene.add(dust);

    // ── Tafel (wächst mit der Kartenzahl) ────────────────────────────────────
    const boardGroup = new THREE.Group();
    scene.add(boardGroup);
    let boardTex = null;
    let boardSig = '';
    let boardDims = layout(1);
    const buildBoard = (n, title, portrait) => {
      const sig = `${n}|${title}|${portrait}`;
      if (sig === boardSig) return false;
      boardSig = sig;
      // Tafel (und damit der Bildausschnitt) mindestens so groß wie bei 8 Karten — bei wenigen
      // Karten zoomte die Kamera sonst nah heran, die 8er-Ansicht wirkt ruhiger. Damit die Tafel
      // trotzdem gefüllt ist, wachsen wenige Karten mit (Maßstab k).
      const ref = layout(Math.max(n, 8), portrait);
      const nat = layout(n, portrait);
      const k = Math.min(1.8, Math.max(1, Math.min((ref.width * 0.95) / nat.width, (ref.height * 0.85) / nat.height)));
      boardDims = layout(n, portrait, k);
      boardDims = { ...boardDims, width: Math.max(boardDims.width, ref.width), height: Math.max(boardDims.height, ref.height) };
      boardGroup.children.slice().forEach((ch) => {
        boardGroup.remove(ch);
        ch.geometry?.dispose();
        if (SHARED.has(ch.material)) return;
        if (ch.userData.ownMap) ch.material?.map?.dispose();
        ch.material?.dispose();
      });
      boardTex?.dispose();
      boardTex = boardTexture(title);
      const { width, height } = boardDims;
      // Ohne Schriftzug: Tafel nur so hoch wie die Kartenreihen (vorher +0,55 für „AUKTION“ mit Kronen)
      const felt = new THREE.Mesh(new THREE.PlaneGeometry(width, height),
        // unbeleuchtet: der goldene Schriftzug strahlte unter den Scheinwerfern über
        new THREE.MeshBasicMaterial({ map: boardTex, toneMapped: false }));
      felt.position.set(0, BOARD_Y - 0.075, 0.1);
      boardGroup.add(felt);
      const t = 0.14;
      const frame = [
        [width + t * 2, t, 0, height / 2 - 0.075 + t / 2],
        [width + t * 2, t, 0, -height / 2 - 0.075 - t / 2],
        [t, height + t * 2, -width / 2 - t / 2, -0.075],
        [t, height + t * 2, width / 2 + t / 2, -0.075],
      ];
      frame.forEach(([w, h, x, y]) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.12), frameGoldMat);
        m.position.set(x, BOARD_Y + y, 0.13);
        boardGroup.add(m);
      });
      // Vorhänge links und rechts der Tafel, oben eine Blende
      [-1, 1].forEach((side) => {
        const cur = new THREE.Mesh(new THREE.PlaneGeometry(1.7, ROOM_H - 0.2), curtMat);
        cur.position.set(side * (width / 2 + 1.25), (ROOM_H - 0.2) / 2, 0.45);
        cur.rotation.y = -side * 0.12;
        boardGroup.add(cur);
      });
      const valance = new THREE.Mesh(new THREE.BoxGeometry(width + 4.6, 0.55, 0.2), curtMat);
      valance.position.set(0, ROOM_H - 0.45, 0.5);
      const valanceTrim = new THREE.Mesh(new THREE.BoxGeometry(width + 4.7, 0.09, 0.24), frameGoldMat);
      valanceTrim.position.set(0, ROOM_H - 0.74, 0.5);
      boardGroup.add(valance, valanceTrim);
      // Wimpel mit Krone links (rot) und rechts (blau) an der Wand — wie die Banner in der Arena
      [[-1, '#d93a3a'], [1, '#2f7bea']].forEach(([side, color]) => {
        const tex = bannerTexture(color, crownFor(color));
        const m = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 1.95), new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.1, roughness: 0.85, side: THREE.DoubleSide }));
        m.userData.ownMap = true;
        m.position.set(side * (width / 2 + 1.05), 3.25, 0.7); // vor dem Vorhang
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.15, 10), goldMat);
        rod.rotation.z = Math.PI / 2;
        rod.position.set(side * (width / 2 + 1.05), 4.25, 0.74);
        boardGroup.add(m, rod);
      });
      // Rednerpult vor der Tafel
      const podium = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.15, 0.6), woodMat);
      podium.position.set(width / 2 + 0.25, 0.575, 1.4);
      const podiumTop = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.7), goldMat);
      podiumTop.position.set(width / 2 + 0.25, 1.19, 1.4);
      boardGroup.add(podium, podiumTop);
      // Elixier-Hammer auf dem Pult
      const hammerHead = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.32, 14), darkWoodMat);
      hammerHead.rotation.z = Math.PI / 2;
      hammerHead.position.set(width / 2 + 0.2, 1.31, 1.4);
      const hammerHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.45, 8), woodMat);
      hammerHandle.rotation.x = Math.PI / 2;
      hammerHandle.position.set(width / 2 + 0.2, 1.27, 1.6);
      boardGroup.add(hammerHead, hammerHandle);

      return true;
    };

    // ── Zauberspiegel (Mutterhexe) ───────────────────────────────────────────
    const mirror = new THREE.Group();
    mirror.position.set(MIRROR.x, MIRROR.y, MIRROR.z);
    mirror.rotation.y = Math.PI / 2;
    scene.add(mirror);
    // Dicker Goldrahmen (oval) mit dunkel-violettem Glas, Kontur wie die übrigen Möbel
    const glass = new THREE.Mesh(own(new THREE.CircleGeometry(1, 48)), own(new THREE.MeshStandardMaterial({ color: 0x2a1745, roughness: 0.2, metalness: 0.4 })));
    glass.scale.set(0.85, 1.25, 1);
    glass.position.z = 0.02;
    const rim = new THREE.Mesh(own(new THREE.TorusGeometry(1, 0.11, 16, 64)), goldMat);
    rim.scale.set(0.85, 1.25, 1);
    rim.position.z = 0.06;
    addOutline(rim, 0.02);
    mirror.add(glass, rim);
    const FACE_W = 0.78 * 2, FACE_H = 1.16 * 2;
    const loader = new THREE.TextureLoader();
    const witchMat = own(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    const FACE_ASPECT = FACE_W / FACE_H;
    if (propsRef.current.witchImg) {
      // Wie object-fit: cover — das rechteckige Porträt wird zugeschnitten statt in die
      // schmale Spiegelform gestaucht (vorher wirkte sie zusammengedrückt)
      const wt = own(loader.load(propsRef.current.witchImg, (t) => {
        const a = t.image.width / t.image.height;
        if (a > FACE_ASPECT) { t.repeat.set(FACE_ASPECT / a, 1); t.offset.set((1 - FACE_ASPECT / a) / 2, 0); }
        else { t.repeat.set(1, a / FACE_ASPECT); t.offset.set(0, 1 - a / FACE_ASPECT); } // oben bleibt das Gesicht
        t.needsUpdate = true;
      }));
      wt.colorSpace = THREE.SRGBColorSpace;
      witchMat.map = wt;
      witchMat.needsUpdate = true;
    }
    const witchFace = new THREE.Mesh(own(new THREE.CircleGeometry(1, 48)), witchMat);
    witchFace.scale.set(0.78, 1.16, 1);
    witchFace.position.z = 0.04;
    mirror.add(witchFace);
    const fogMats = [];
    const fogSprites = Array.from({ length: 4 }, (_, i) => {
      const m = own(new THREE.SpriteMaterial({ map: glowTex, color: 0x4ade80, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      fogMats.push(m);
      const sp = new THREE.Sprite(m);
      sp.scale.setScalar(1.6 + i * 0.4);
      sp.position.set(0, -0.2, 0.25 + i * 0.05);
      mirror.add(sp);
      return sp;
    });
    // Runenring: dreht sich hinter dem Spiegel, folgt dessen Umriss
    const runeHolder = new THREE.Group();
    runeHolder.scale.set(0.85, 1.25, 1);
    runeHolder.position.z = 0.01;
    mirror.add(runeHolder);
    const runeMats = [0x4ade80, 0xd946ef].map((color, i) => {
      const m = own(new THREE.MeshBasicMaterial({ map: own(runeRingTexture()), color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      const ring = new THREE.Mesh(own(new THREE.PlaneGeometry(1, 1)), m);
      ring.scale.setScalar(i ? 2.75 : 3.15);
      ring.position.z = 0.01 * i;
      runeHolder.add(ring);
      return { m, ring, dir: i ? -1 : 1 };
    });
    // Funken, die auf der Ellipse um den Rahmen kreisen
    const orbit = Array.from({ length: 26 }, (_, i) => {
      const m = own(new THREE.SpriteMaterial({ map: glowTex, color: i % 2 ? 0xd946ef : 0x86efac, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      const sp = new THREE.Sprite(m);
      mirror.add(sp);
      return { sp, m, a: (i / 26) * Math.PI * 2, speed: 0.5 + (i % 5) * 0.12, r: 1.08 + (i % 3) * 0.06, size: 0.12 + (i % 4) * 0.04 };
    });
    const witchLight = new THREE.PointLight(0x4ade80, 0, 7, 2);
    witchLight.position.set(MIRROR.x + 1.2, MIRROR.y, MIRROR.z);
    scene.add(witchLight);

    // ── Karten ───────────────────────────────────────────────────────────────
    const backTex = own(cardBackTexture());
    const ringTex = own(frameRingTexture());
    const texCache = new Map();
    const cardTex = (card) => {
      const key = card.isPig ? 'pig' : card.id;
      if (texCache.has(key)) return texCache.get(key);
      const url = card.isPig ? propsRef.current.pigImg : cardTextureUrl(card.id);
      if (!url) return null;
      const tex = own(loader.load(url, (t) => {
        if (card.isPig) return;
        const b = CARD_FRAME_BOX[card.rarity] || CARD_FRAME_BOX.Common;
        t.repeat.set(b.w / CARD_IMAGE_SIZE.w, b.h / CARD_IMAGE_SIZE.h);
        t.offset.set(b.x / CARD_IMAGE_SIZE.w, 1 - (b.y + b.h) / CARD_IMAGE_SIZE.h);
        t.needsUpdate = true;
      }));
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      texCache.set(key, tex);
      return tex;
    };

    // Eigenes Gebot: CR-Haken + Zahl + Elixier-Tropfen als Bilder auf dem Schild (statt „✓“)
    let iconsReady = 0;
    const loadIcon = (src) => {
      const img = new Image();
      img.onload = () => { iconsReady += 1; };
      img.src = src;
      return img;
    };
    const ICONS = { mine: { before: loadIcon(checkIcon), after: loadIcon(elixirIcon) } };
    const plaqueCache = new Map();
    const plaque = (text, tone) => {
      const key = `${tone}|${text}|${iconsReady}`;
      if (!plaqueCache.has(key)) plaqueCache.set(key, plaqueTexture(text, tone, ICONS[tone]));
      return plaqueCache.get(key);
    };

    let cardObjs = [];
    let cardsRound = null;
    const clearCards = () => {
      cardObjs.forEach((o) => {
        scene.remove(o.group);
        o.group.traverse((m) => { if (m.isMesh) { m.geometry.dispose(); m.material.dispose(); } });
        o.stampTex?.dispose();
        o.badgeTex?.dispose();
      });
      cardObjs = [];
    };
    const makeCard = (card, slot, idx, dealAt) => {
      const { w, h } = cardSize(card);
      const group = new THREE.Group();
      // Unbeleuchtet und ohne Tonemapping: die Karte zeigt exakt die Farben des Kartenbilds —
      // unter den Scheinwerfern wirkten sie mit beleuchtetem Material überbelichtet
      const frontMat = new THREE.MeshBasicMaterial({
        map: cardTex(card), transparent: true, alphaTest: 0.05, toneMapped: false,
      });
      const front = new THREE.Mesh(new THREE.PlaneGeometry(w, h), frontMat);
      front.userData.idx = idx;
      const back = new THREE.Mesh(new THREE.PlaneGeometry(CARD_H * 0.8, h), new THREE.MeshStandardMaterial({ map: backTex, transparent: true, alphaTest: 0.3, roughness: 0.6 }));
      back.rotation.y = Math.PI;
      // Rahmen hinter der Karte: Magenta fürs eigene Gebot, Gewinnerfarbe nach dem Stempel
      const frameMat = new THREE.MeshBasicMaterial({ map: ringTex, color: 0xc026d3, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
      const frame = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.2, h + 0.2), frameMat);
      frame.position.z = -0.01;
      const plaqueMat = new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false });
      const plaqueMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.26), plaqueMat);
      plaqueMesh.position.set(0, -h / 2 - 0.22, 0.02);
      const stampMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthTest: false, toneMapped: false });
      const stamp = new THREE.Mesh(new THREE.PlaneGeometry(1.02, 0.32), stampMat);
      stamp.position.set(0, 0.05, 0.12);
      stamp.rotation.z = 0.2;
      stamp.renderOrder = 10;
      // Gewinner: runde Avatar-Plakette oben auf der Karte, eigene Karte zusätzlich mit DU-Band
      const badgeMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, toneMapped: false });
      const badge = new THREE.Mesh(new THREE.CircleGeometry(0.25, 32), badgeMat);
      badge.position.set(0, h / 2 + 0.05, 0.08);
      const youMat = new THREE.MeshBasicMaterial({ map: plaque(propsRef.current.labels?.you || 'DU', 'brass'), transparent: true, opacity: 0, toneMapped: false });
      const youBand = new THREE.Mesh(new THREE.PlaneGeometry(0.82, 0.21), youMat);
      youBand.position.set(-w / 2 + 0.2, h / 2 - 0.18, 0.09);
      youBand.rotation.z = 0.62;
      group.add(frame, front, back, plaqueMesh, stamp, badge, youBand);
      group.position.set(slot.x, slot.y, 0.22);
      scene.add(group);
      return {
        group, front, frontMat, frame, frameMat, plaqueMesh, plaqueMat, stamp, stampMat, stampTex: null,
        badge, badgeMat, badgeTex: null, youMat,
        card, slot, idx, w, h, dealAt, flipAt: null, pendingCard: null,
        base: boardDims.k || 1, hover: 0, lift: 0, dim: 1, vis: 1, frameA: 0, badgeA: 0, youA: 0, plaqueKey: '', slamAt: null, slammed: false,
      };
    };
    const syncCards = (now) => {
      const P = propsRef.current;
      const cards = P.cards || [];
      // Tafel ohne Schriftzug (Nutzerwunsch: kein „AUKTION“ mit Kronen)
      const relaid = buildBoard(cards.length, '', aspect < 0.85);
      const off = animOff();
      if (relaid && P.round === cardsRound && cards.length === cardObjs.length) {
        // Nur das Format hat gewechselt (Handy gedreht): Karten an die neuen Plätze, ohne neu auszuteilen
        cardObjs.forEach((o, i) => { o.slot = boardDims.slots[i]; o.base = boardDims.k; });
        return;
      }
      if (P.round !== cardsRound || cards.length !== cardObjs.length) {
        clearCards();
        cardsRound = P.round;
        // Während der Einfahrt erst austeilen, wenn die Kamera an der Tafel ankommt
        const introLeft = introStart == null ? INTRO_S * 0.7 : Math.max(0, introStart / 1000 + INTRO_S * 0.7 - now / 1000);
        cardObjs = cards.map((c, i) => makeCard(c, boardDims.slots[i], i, off ? -1e9 : now + (introLeft + 0.25 + i * DEAL_STEP) * 1000));
        if (!off && cards.length) setTimeout(() => playSound('open'), (introLeft + 0.25) * 1000);
        return;
      }
      // Gleiche Runde, andere Karte am selben Platz (Schweine → echt, Mutterhexen-Tausch): umdrehen
      cards.forEach((c, i) => {
        const o = cardObjs[i];
        const shownKey = (o.pendingCard || o.card);
        if ((shownKey.isPig ? 'pig' : shownKey.id) !== (c.isPig ? 'pig' : c.id)) {
          o.pendingCard = c;
          o.flipAt = off ? now - FLIP_S * 1000 : now;
        }
      });
    };
    const applyCardTexture = (o, card) => {
      const { w, h } = cardSize(card);
      o.card = card;
      o.frontMat.map = cardTex(card);
      o.frontMat.needsUpdate = true;
      o.front.geometry.dispose();
      o.front.geometry = new THREE.PlaneGeometry(w, h);
      o.w = w; o.h = h;
    };

    // ── Kamera ──────────────────────────────────────────────────────────────
    let aspect = 1;
    const overviewPose = () => {
      const top = BOARD_Y - 0.075 + boardDims.height / 2 + 0.9; // Rahmen + Blende darüber im Bild
      const bottom = BOARD_Y - boardDims.height / 2 - 0.15;
      const cy = (top + bottom) / 2;
      const halfH = (top - bottom) / 2 + 0.15;
      const halfW = boardDims.width / 2 + 1.6; // Vorhänge mit Wimpeln im Bild
      const d = Math.max(halfH / TAN, halfW / (TAN * aspect), 3.4);
      return { pos: new THREE.Vector3(0, cy, d + 0.3), look: new THREE.Vector3(0, cy - 0.05, 0) };
    };
    // Fester Platz vor der Kamera, an den die Karte bei ihrer Auflösung fliegt: obere Bildmitte,
    // die Gebotstafel (DOM) sitzt direkt darunter — man muss nicht zur Seite schauen.
    const fwd = new THREE.Vector3(), rightV = new THREE.Vector3(), upV = new THREE.Vector3();
    const frontSpot = (out) => {
      fwd.subVectors(camLook, camPos).normalize();
      rightV.crossVectors(fwd, camera.up).normalize();
      upV.crossVectors(rightV, fwd).normalize();
      const halfH = FRONT_DIST * TAN, halfW = halfH * aspect;
      out.copy(camPos).addScaledVector(fwd, FRONT_DIST);
      if (aspect >= 1.05) {
        // Querformat: Karte links der Mitte, Gebotstafel (DOM) rechts daneben — beides mittig
        const scale = (1.05 * halfH) / (CARD_H + 0.5);
        out.addScaledVector(rightV, -0.22 * halfW);
        out.addScaledVector(upV, 0.08 * scale);
        return scale;
      }
      // Hochformat: Karte oben, Gebotstafel darunter
      const scale = Math.min((0.9 * halfH) / (CARD_H + 0.5), (1.3 * halfW) / 1.2);
      out.addScaledVector(upV, 0.28 * halfH); // Platz für die Gewinner-Plakette oben
      out.addScaledVector(upV, 0.14 * scale); // Schild unter der Karte mit einrechnen
      return scale;
    };
    const frontPos = new THREE.Vector3();
    const basePos = new THREE.Vector3();
    const witchPose = () => ({
      pos: new THREE.Vector3(MIRROR.x + 3.6, MIRROR.y - 0.1, MIRROR.z + 0.5),
      look: new THREE.Vector3(MIRROR.x, MIRROR.y, MIRROR.z),
    });
    const camPos = new THREE.Vector3(0, 1.7, ROOM_D + 5);
    const camLook = new THREE.Vector3(0, 1.8, 0);
    const camVel = new THREE.Vector3(), lookVel = new THREE.Vector3();
    // Startet erst, wenn alles geladen und vorgewärmt ist (siehe Schleife) — sonst wäre ein Teil
    // der Fahrt vorbei, bevor man etwas sieht. Vorher: zwei getrennte Abschnitte mit Halt an der
    // Tür; jetzt eine Bahn mit durchgehender Geschwindigkeit.
    let introStart = animOff() ? -1e9 : null;
    let intro = null;
    let introSoundDone = animOff();
    const makeIntro = (now, target) => {
      const keys = [
        [0, [0, 1.7, ROOM_D + 5.5], [0, 1.9, 0]],
        [1.1, [0, 1.8, ROOM_D - 0.6], [0, 2.0, 0]],
        [INTRO_S, target.pos.toArray(), target.look.toArray()],
      ];
      const v = (a) => new THREE.Vector3(...a);
      intro = {
        pos: new THREE.CatmullRomCurve3(keys.map((k) => v(k[1])), false, 'centripetal'),
        look: new THREE.CatmullRomCurve3(keys.map((k) => v(k[2])), false, 'centripetal'),
        param: monotoneSpline(keys.map((k) => k[0]), keys.map((_, i) => i / (keys.length - 1))),
      };
      introStart = now;
    };

    // ── Bildschirm-Rechteck einer Karte (für Tropfenflug und Funken im DOM) ──
    const tmp = new THREE.Vector3();
    api.getCardRect = (i) => {
      const o = cardObjs[i];
      if (!o) return null;
      const rect = renderer.domElement.getBoundingClientRect();
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy]) => {
        tmp.set(sx * o.w / 2, sy * o.h / 2, 0);
        o.front.localToWorld(tmp);
        tmp.project(camera);
        const x = rect.left + (tmp.x + 1) / 2 * rect.width;
        const y = rect.top + (1 - tmp.y) / 2 * rect.height;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      });
      return new DOMRect(minX, minY, maxX - minX, maxY - minY);
    };

    // ── Zeiger: Karte anklicken = bieten ─────────────────────────────────────
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let hoverIdx = -1;
    const pick = (e) => {
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(cardObjs.map(o => o.front), false);
      const idx = hits.length ? hits[0].object.userData.idx : -1;
      const P = propsRef.current;
      return idx >= 0 && P.bidStates?.[idx] === 'open' && !P.revealKey ? idx : -1;
    };
    const onMove = (e) => {
      hoverIdx = pick(e);
      renderer.domElement.style.cursor = hoverIdx >= 0 ? 'pointer' : 'default';
    };
    const onLeave = () => { hoverIdx = -1; renderer.domElement.style.cursor = 'default'; };
    const onClick = (e) => {
      const idx = pick(e);
      if (idx >= 0) propsRef.current.onCardClick?.(idx);
    };
    renderer.domElement.addEventListener('pointermove', onMove);
    renderer.domElement.addEventListener('pointerleave', onLeave);
    renderer.domElement.addEventListener('click', onClick);

    // ── Größe ────────────────────────────────────────────────────────────────
    let fullW = 1, fullH = 1, inset = propsRef.current.bottomInset || 0;
    // Sichtbarer Bereich = Fläche über der Fußzeile: die Kamera rahmt dafür, der Rest der
    // Zeichenfläche (unter der Fußzeile) wird einfach mitgezeichnet
    const applyView = () => {
      const visH = Math.max(1, fullH - inset);
      aspect = fullW / visH;
      camera.aspect = aspect;
      camera.setViewOffset(fullW, visH, 0, 0, fullW, fullH);
      camera.updateProjectionMatrix();
    };
    const resize = () => {
      const w = container.clientWidth || 1, h = container.clientHeight || 1;
      renderer.setSize(w, h, false);
      post.setSize(w, h);
      renderer.domElement.style.width = `${w}px`;
      renderer.domElement.style.height = `${h}px`;
      fullW = w; fullH = h;
      applyView();
      // setSize leert die Zeichenfläche — sofort neu zeichnen, sonst ist sie bis zum nächsten
      // Frame leer und blitzt auf (passiert z. B., wenn nach dem Gebot die Fußzeile wechselt)
      post.render(0);
    };
    const adaptQuality = createQualityGovernor(renderer, Math.min(window.devicePixelRatio || 1, 1.75), () => resize());
    resize();
    let warmed = false; // kein Warten auf Downloads — die Szene startet sofort
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    // ── Stempel beim Hammerschlag ────────────────────────────────────────────
    const slam = (o) => {
      const r = propsRef.current.results?.[o.idx];
      if (!r) return;
      o.slammed = true;
      o.slamAt = performance.now();
      o.stampTex?.dispose();
      o.stampTex = stampTexture(r.stampText, r.stampColor);
      o.stampMat.map = o.stampTex;
      o.stampMat.needsUpdate = true;
      if (r.receiver) {
        o.badgeTex?.dispose();
        o.badgeTex = avatarBadgeTexture(avatarUrl(r.receiver.avatar), r.stampColor);
        o.badgeMat.map = o.badgeTex;
        o.badgeMat.needsUpdate = true;
        o.isMine = !!r.receiver.isMe;
      }
      const rect = api.getCardRect(o.idx);
      if (rect && r.receiver) {
        sparkBurst(rect, { color: r.stampColor, count: 26, spread: 150 });
        ringPulse(rect, { color: r.stampColor });
      }
    };

    // ── Schleife ─────────────────────────────────────────────────────────────
    let raf = 0;
    let last = performance.now();
    let witchAmt = 0;
    let focusDim = 0;
    let revealSeen = null;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const P = propsRef.current;
      const off = animOff();
      const wantInset = Math.min(fullH * 0.5, P.bottomInset || 0);
      if (Math.abs(wantInset - inset) > 0.5) {
        inset += (wantInset - inset) * (off ? 1 : 1 - Math.exp(-dt * 6));
        applyView();
      }
      if (!warmed) {
        warmed = true;
        warmUp(renderer, scene, camera, post);
        last = performance.now();
        return;
      }
      if (renderer.domElement.style.opacity !== '1') renderer.domElement.style.opacity = '1';
      adaptQuality(dt);
      syncCards(now);

      // Auflösung: Zeit seit Start, aktive Karte
      if (revealSeen !== P.revealKey) {
        revealSeen = P.revealKey;
        cardObjs.forEach((o) => { o.slammed = false; o.slamAt = null; o.stampMat.opacity = 0; o.badgeA = 0; o.youA = 0; o.isMine = false; });
      }
      const t0 = revealT0Ref.current;
      const rt = P.revealKey && t0 != null ? (now - t0) / 1000 : null;
      const sched = P.schedule;
      let focusIdx = -1;
      if (rt != null && sched) sched.forEach((c, k) => { if (!c.empty && rt >= c.focus && rt < c.end) focusIdx = k; });

      // Kamera: Einfahrt, sonst weich zur Zielansicht (Spiegel, sonst Übersicht — in der
      // Auflösung bleibt sie stehen, die Karten kommen nach vorne)
      const target = P.witch ? witchPose() : overviewPose();
      if (introStart == null) makeIntro(now, target);
      // Prüfstand: window.__cr3dIntroT hält die Fahrt an einem Zeitpunkt fest
      const dbgT = typeof window.__cr3dIntroT === 'number' ? window.__cr3dIntroT : null;
      const it = intro ? (dbgT ?? (now - introStart) / 1000) : Infinity;
      if (it < INTRO_S || (intro && dbgT !== null)) {
        const u = Math.min(1, Math.max(0, intro.param(it)));
        intro.pos.getPoint(u, camPos);
        intro.look.getPoint(u, camLook);
      } else {
        if (!introSoundDone) { introSoundDone = true; playSound('start'); }
        intro = null;
        if (off) { camPos.copy(target.pos); camLook.copy(target.look); camVel.set(0, 0, 0); lookVel.set(0, 0, 0); }
        else { springTo(camPos, camVel, target.pos, CAM_SMOOTH, dt); springTo(camLook, lookVel, target.look, CAM_SMOOTH, dt); }
      }
      camera.position.copy(camPos);
      camera.lookAt(camLook);

      // Karten
      cardObjs.forEach((o) => {
        const g = o.group;
        // Austeilen: von oben herab, Rückseite zuerst, dreht sich beim Ankommen um
        const dp = clamp01((now - o.dealAt) / (DEAL_S * 1000));
        let rotY = Math.PI * (1 - easeOutBack(dp));
        const y = o.slot.y + (1 - easeInOut(dp)) * 3.2;
        const z = 0.22 + (1 - easeInOut(dp)) * 1.4;
        // Umdrehen bei Kartenwechsel am selben Platz
        if (o.flipAt != null) {
          const fp = clamp01((now - o.flipAt) / (FLIP_S * 1000));
          if (fp >= 0.5 && o.pendingCard) { applyCardTexture(o, o.pendingCard); o.pendingCard = null; }
          rotY += Math.sin(fp * Math.PI) * (Math.PI / 2);
          if (fp >= 1) o.flipAt = null;
        }
        const st = P.bidStates?.[o.idx] || 'none';
        const resolved = rt != null && sched?.[o.idx] && rt >= sched[o.idx].slam;
        const focused = focusIdx === o.idx;
        const waiting = rt != null && !resolved && !focused;
        const kk = off ? 1 : 1 - Math.exp(-dt * 10);
        o.hover += ((hoverIdx === o.idx ? 1 : 0) - o.hover) * kk;
        // Solange eine Karte vorne aufgelöst wird, treten alle anderen ganz zurück
        o.vis += (((focusIdx >= 0 && !focused) ? 0 : 1) - o.vis) * (off ? 1 : 1 - Math.exp(-dt * 6));
        // Vorne bleiben bis kurz nach dem Stempel, dann zurück — bevor die nächste Karte ankommt
        const front = focused && rt < sched[o.idx].slam + 1.0;
        // Feste Flugdauer (vorher exponentiell: schoss los und kroch dann ans Ziel)
        if (off) o.lift = front ? 1 : 0;
        else o.lift = front ? Math.min(1, o.lift + dt / LIFT_IN_S) : Math.max(0, o.lift - dt / LIFT_OUT_S);
        const dimT = st === 'locked' && rt == null ? 0.35 : waiting ? 0.42 : 1;
        o.dim += (dimT - o.dim) * kk;
        basePos.set(o.slot.x, y + o.hover * 0.06, z + o.hover * 0.18);
        let scale = o.base * (1 + o.hover * 0.06);
        if (o.lift > 0.001) {
          const e = easeInOut(clamp01(o.lift));
          const frontScale = frontSpot(frontPos);
          basePos.lerp(frontPos, e);
          // kleiner Bogen nach oben auf dem Weg nach vorne
          basePos.y += Math.sin(e * Math.PI) * 0.35;
          scale += (frontScale - scale) * e;
        }
        g.position.copy(basePos);
        g.rotation.y = rotY;
        g.rotation.z = o.lift > 0.001 ? Math.sin(clamp01(o.lift) * Math.PI) * -0.08 : 0;
        g.scale.setScalar(scale);
        g.renderOrder = focused ? 5 : 0;
        o.frontMat.color.setScalar(o.dim);
        o.frontMat.opacity = o.vis;
        o.plaqueMat.opacity = o.vis;
        o.group.visible = o.vis > 0.02;

        // Hammerschlag
        if (rt != null && sched?.[o.idx] && !o.slammed && rt >= sched[o.idx].slam) slam(o);
        const r = P.results?.[o.idx];
        // Plakette poppt mit dem Stempel auf und bleibt; DU-Band bei eigenen Karten
        const showBadge = rt != null && o.slammed && !!P.results?.[o.idx]?.receiver;
        o.badgeA += ((showBadge ? 1 : 0) - o.badgeA) * kk;
        o.youA += ((showBadge && o.isMine ? 1 : 0) - o.youA) * kk;
        o.badgeMat.opacity = o.badgeA * o.vis;
        o.youMat.opacity = o.youA * o.vis;
        if (showBadge && o.slamAt != null) o.badge.scale.setScalar(off ? 1 : easeOutBack(clamp01((now - o.slamAt) / 450)));
        if (o.slamAt != null) {
          const s = (now - o.slamAt) / 1000;
          const sp = clamp01(s / 0.2);
          o.stamp.scale.setScalar(off ? 1 : 2.6 - 1.6 * easeInOut(sp));
          o.stampMat.opacity = s < 1.15 ? clamp01(sp * 1.6) : clamp01(1 - (s - 1.15) / 0.35);
        }

        // Rahmen + Schild
        let frameColor = null;
        let plaqueText = o.card.isPig ? '?' : o.card.name;
        let tone = 'brass';
        if (rt != null && o.slammed && r) {
          if (r.receiver) { frameColor = r.stampColor; plaqueText = r.receiver.name; tone = r.stampColor; }
          else { plaqueText = P.labels?.notAwarded || '–'; tone = '#475569'; }
        } else if (rt == null && st === 'mine') {
          frameColor = '#c026d3'; plaqueText = `${P.myBidAmount ?? ''}`; tone = 'mine';
        } else if (rt == null && st === 'locked') {
          plaqueText = P.labels?.championLimit || 'Champion'; tone = 'locked';
        }
        if (frameColor) o.frameMat.color.set(frameColor);
        o.frameA += ((frameColor ? 1 : (o.hover > 0.05 ? 0.6 * o.hover : 0)) - o.frameA) * kk;
        o.frameMat.opacity = o.frameA * o.vis;
        if (!frameColor && o.hover > 0.05) o.frameMat.color.set('#e879f9');
        const pk = `${tone}|${plaqueText}|${iconsReady}`;
        if (pk !== o.plaqueKey) {
          o.plaqueKey = pk;
          o.plaqueMat.map = plaque(plaqueText, tone);
          o.plaqueMat.needsUpdate = true;
        }
      });

      // Spiegel
      witchAmt += ((P.witch ? 1 : 0) - witchAmt) * (off ? 1 : 1 - Math.exp(-dt * 2.2));
      witchMat.opacity = witchAmt * (0.88 + Math.sin(now / 260) * 0.06);
      witchLight.intensity = witchAmt * (6 + Math.sin(now / 90) * 1.5);
      runeMats.forEach(({ m, ring, dir }, i) => {
        m.opacity = witchAmt * (0.55 + Math.sin(now / 300 + i) * 0.2);
        ring.rotation.z += dt * 0.35 * dir;
      });
      orbit.forEach((o) => {
        const a = o.a + (now / 1000) * o.speed;
        o.sp.position.set(Math.cos(a) * 0.85 * o.r, Math.sin(a) * 1.25 * o.r, 0.14);
        o.sp.scale.setScalar(o.size * (0.8 + Math.sin(now / 150 + o.a * 3) * 0.3));
        o.m.opacity = witchAmt * 0.85;
      });
      fogSprites.forEach((sp, i) => {
        fogMats[i].opacity = witchAmt * 0.16;
        sp.position.x = Math.sin(now / (900 + i * 260) + i) * 0.35;
        sp.position.y = -0.3 + Math.cos(now / (1100 + i * 310) + i) * 0.25;
      });
      sconces.forEach((l, i) => { l.intensity = 12 + Math.sin(now / (130 + i * 37)) * 0.6 - witchAmt * 4; });
      // Während eine Karte vorne aufgelöst wird, tritt der Saal etwas zurück
      focusDim += ((focusIdx >= 0 ? 1 : 0) - focusDim) * (off ? 1 : 1 - Math.exp(-dt * 3));
      spots.forEach((s) => { s.intensity = SPOT_I * (1 - witchAmt * 0.5 - focusDim * 0.2); });

      chandFlames.forEach(({ flame, fm }) => { flame.quaternion.copy(camera.quaternion); fm.uniforms.uTime.value = off ? 0 : now / 1000; });
      // Staub treibt langsam nach oben
      const pa = dustGeo.attributes.position;
      for (let i = 0; i < DUST; i++) {
        let yy = pa.array[i * 3 + 1] + dt * 0.05;
        if (yy > ROOM_H) yy = 0;
        pa.array[i * 3 + 1] = yy;
      }
      pa.needsUpdate = true;

      post.render(dt);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointermove', onMove);
      renderer.domElement.removeEventListener('pointerleave', onLeave);
      renderer.domElement.removeEventListener('click', onClick);
      clearCards();
      boardGroup.children.forEach((ch) => ch.geometry?.dispose());
      boardGroup.children.forEach((ch) => { if (SHARED.has(ch.material)) return; if (ch.userData.ownMap) ch.material?.map?.dispose(); ch.material?.dispose(); });
      boardTex?.dispose();
      plaqueCache.forEach((t) => t.dispose());
      disposables.forEach((d) => d.dispose?.());
      env.dispose();
      post.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      api.getCardRect = () => null;
    };
  }, []);

  const P = props;
  const showPanel = P.revealKey && P.schedule && focus >= 0 && P.results?.[focus];
  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="absolute inset-0" />
      {showPanel && (
        <BidsPanel key={`${P.revealKey}-${focus}`} inset={P.bottomInset || 0} result={P.results[focus]} timing={P.schedule[focus]}
          card={P.cards[focus]} labels={P.labels} />
      )}
      {P.revealKey && focus === -2 && P.afterReveal && (
        <div className="absolute inset-x-0 bottom-3 flex justify-center px-3 cr-drop-in">{P.afterReveal}</div>
      )}
    </div>
  );
});

/**
 * Gebotstafel neben der Karte, die gerade aufgelöst wird. Dieselben Animationen wie in 2D
 * (index.css: cr-bid-chip--win/lose, cr-reveal-head), nur relativ zum Fokus-Zeitpunkt.
 */
function BidsPanel({ result, timing, card, labels, inset }) {
  const bids = [...(result.bids || [])].sort((a, b) => (b.amount || 0) - (a.amount || 0));
  const rel = (s) => `${Math.max(0, s - timing.focus)}s`;
  const vars = { '--slam': rel(timing.slam), '--head': rel(timing.slam + 0.15), '--wc': result.stampColor, '--inset': `${inset}px` };
  const color = card?.isPig ? '#e879f9' : RARITY_COLOR[card?.rarity] || '#e879f9';
  return (
    <div className="absolute pointer-events-none cr-drop-in
      left-1/2 -translate-x-1/2 bottom-3 w-[min(92%,30rem)]
      landscape:left-[52%] landscape:translate-x-0 landscape:bottom-auto landscape:top-[calc((100%-var(--inset))/2)] landscape:-translate-y-1/2 landscape:w-[min(42%,28rem)]"
      style={vars}>
      <div className="cr-arcade-panel p-3 sm:p-4 space-y-2">
        <p className="font-cr text-2xl sm:text-3xl text-center truncate" style={{ color, textShadow: 'var(--cr-text-outline)' }}>
          {card?.isPig ? '?' : card?.name}
        </p>
        {result.receiver ? (
          <div className="cr-reveal-head flex items-center justify-center gap-2.5 rounded-xl py-2"
            style={{ backgroundColor: `${result.stampColor}38` }}>
            <PanelAvatar id={result.receiver.avatar} color={result.receiver.color} size={34} />
            <span className="font-cr text-xl truncate" style={{ color: result.stampColor, textShadow: 'var(--cr-text-outline)' }}>
              {result.receiver.name}
            </span>
          </div>
        ) : (
          <div className="cr-reveal-head text-center text-white/50 text-sm py-1">{labels.notAwarded}</div>
        )}
        {bids.length > 0 ? (
          <div className="space-y-2">
            {bids.map((bid, bi) => {
              const rank = bids.length - 1 - bi; // das niedrigste Gebot erscheint zuerst (unten)
              return (
                <div key={bid.playerId}
                  className={`${bid.isWin ? 'cr-bid-chip--win' : 'cr-bid-chip--lose'} flex items-center gap-3 rounded-xl px-3 py-2 bg-black/25`}
                  style={{ '--cd': rel(timing.chipAt(rank)), borderLeft: `5px solid ${bid.color || '#888'}` }}>
                  <PanelAvatar id={bid.avatar} color={bid.color} size={34} />
                  <span className={`flex-1 font-cr text-lg truncate ${bid.isWin ? 'text-white' : 'text-white/80'}`} style={{ textShadow: 'var(--cr-text-outline)' }}>
                    {bid.name}{bid.isMe ? ` (${labels.you})` : ''}
                  </span>
                  <span className="cr-elixir-pill text-lg">
                    <img src={elixirIcon} alt="" style={{ height: 22, width: 'auto' }} className="shrink-0" />
                    <span className="tabular-nums">{bid.amount}</span>
                    {bid.halved && <span className="text-[11px] text-fuchsia-200">½</span>}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-center text-white/45 text-sm">{labels.noBids}</p>
        )}
      </div>
    </div>
  );
}

function PanelAvatar({ id, color, size }) {
  const url = avatarUrl(id);
  return (
    <div className="rounded-full overflow-hidden shrink-0" style={{ width: size, height: size, boxShadow: `0 0 0 2px ${(color || '#888')}aa` }}>
      {url && <img src={url} alt="" className="w-full h-full object-cover" />}
    </div>
  );
}

export default Auction3D;
