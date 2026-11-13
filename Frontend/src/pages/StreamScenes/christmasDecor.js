// christmasDecor.js — Weihnachts-Ausstattung für die Stream-Szenen (Thema „christmas“).
//
// Alles aus einfachen Formen gebaut (keine Modell-Datei, lädt also sofort): geschmückte Tannen,
// Geschenke, Zuckerstangen, Tannengirlanden, Kränze, Schneemänner, Schneehaufen, Sterne und Schneefall.
// Dazu Lichterketten (eine einzige Instanz-Wolke): Sie hängen in Bögen an Traversen und Wänden,
// laufen als Spirale um die Tannen und blinken als Lauflicht im Takt.
//
// Zwei Aufstellungen (LAYOUTS):
//   • party  — Party-Saal (Stream Starting): Tannen neben der LED-Wand, Deko an Bühne und Traversen, Schneefall
//   • cinema — Kino (Stream Ending): Tannen vor der Bühne, Girlande an der Bühnenkante, Lichterketten an
//              den Wänden und im Flur. Nichts davon liegt vom Sitzplatz aus vor der Leinwand (dort
//              liegt der Clip als HTML über dem Bild), deshalb auch kein Schneefall.
//
// Schnittstelle wie halloweenDecor.js; wird erst gebaut, wenn das Thema zum ersten Mal eingeschaltet wird.
import * as THREE from 'three';
import { canvasTexture, rng } from './sceneKit';

/** Farben der Lichterketten (über 1 hinaus: die Birnen überstrahlen und bekommen einen Lichthof). */
const BULB_COLORS = ['#ff2a2a', '#22e060', '#ffc22e', '#4aa8ff'].map((c) => new THREE.Color(c));
const BAUBLE_COLORS = ['#d8202c', '#f2c230', '#e9e9f2', '#2f7de0', '#c22fa0'];

/**
 * Aufstellungen. Einträge:
 *   trees      [x, y, z, Höhe]
 *   gifts      [x, y, z, Breite, Höhe]
 *   canes      [x, y, z, Höhe, Drehung]
 *   garlands   [x0, x1, y, z, Bögen]            Tannengirlande entlang x (Lichter davor, +z)
 *   wreaths    [x, y, z]                        an einer Seitenwand (zeigt zur Raummitte)
 *   swags      [[x,y,z], [x,y,z], Durchhang, Birnen]
 *   strings    [[x,y,z], [x,y,z], Birnen]       gerade Lichterkette
 *   snowmen    [x, y, z, Größe, Drehung]
 *   piles      [x, y, z, Breite, Höhe]
 *   stars      [x, y, z, Aufhängung y]          Eissterne an Fäden
 *   snow       { x, y0, y1, z0, z1 } | null     Bereich des Schneefalls
 *   light      [x, y, z] | null                 warmes Licht an der großen Tanne
 *   bulbSize   Radius der Birnen (Standard 0,055)
 */
const sides = (fn) => [-1, 1].flatMap(fn);
const LAYOUTS = {
  party: {
    trees: [[9.6, 1.2, -9.7, 4.7], [-9.6, 1.2, -9.7, 3.7], [11.4, 0, 9.6, 2.6]],
    gifts: [
      [8.5, 1.2, -9.0, 0.7, 0.5], [9.3, 1.2, -8.6, 0.5, 0.4], [10.4, 1.2, -8.9, 0.6, 0.7], [8.9, 1.2, -8.3, 0.4, 0.3], [10.0, 1.2, -8.2, 0.45, 0.35],
      [-8.7, 1.2, -9.0, 0.6, 0.45], [-10.4, 1.2, -8.8, 0.5, 0.55], [-9.4, 1.2, -8.5, 0.4, 0.3],
      [10.6, 0, 8.9, 0.5, 0.4], [11.7, 0, 8.6, 0.4, 0.5], [10.9, 0, 10.4, 0.45, 0.3],
      ...sides((s) => [[s * 9.2, 0, -3.8, 0.9, 0.6], [s * 9.15, 0.6, -3.8, 0.55, 0.4], [s * 9.9, 0, -3.1, 0.5, 0.45], [s * 8.9, 0, 3.0, 0.6, 0.5]]),
      [1.45, 2.35, -8.95, 0.26, 0.2], [-1.45, 2.35, -8.95, 0.22, 0.26],
    ],
    canes: [[-12.3, 0, 6.0, 2.7, Math.PI / 2], [-12.3, 0, 9.0, 2.7, -Math.PI / 2], [-11.5, 1.2, -7.4, 2.0, 0], [11.5, 1.2, -7.4, 2.0, Math.PI], [-5.6, 1.2, -7.4, 0.9, 0.4], [5.6, 1.2, -7.4, 0.9, Math.PI - 0.4]],
    garlands: [[-10.8, 10.8, 1.12, -6.93, 9]],
    wreaths: sides((s) => [[s * 12.8, 5.4, -2.2], [s * 12.8, 5.4, 4.2]]),
    swags: [
      ...[0, 1, 2, 3].map((i) => [[-11 + i * 5.5, 8.35, 3.5], [-5.5 + i * 5.5, 8.35, 3.5], 0.9, 16]),
      ...[0, 1, 2, 3].map((i) => [[-10 + i * 5, 8.35, -7.75], [-5 + i * 5, 8.35, -7.75], 0.6, 12]),
      ...sides((s) => [0, 1, 2, 3, 4].map((i) => [[s * 12.8, 7.6, -10 + i * 4.6], [s * 12.8, 7.6, -5.4 + i * 4.6], 0.8, 13])),
    ],
    strings: [[[-12.85, 0.3, 6.35], [-12.85, 2.7, 6.35], 8], [[-12.85, 0.3, 8.65], [-12.85, 2.7, 8.65], 8], [[-12.85, 2.75, 6.35], [-12.85, 2.75, 8.65], 7]],
    snowmen: [[11.3, 0, 1.4, 1.05, -Math.PI / 2 + 0.3], [-11.4, 0, 2.9, 0.9, Math.PI / 2 - 0.4], [-7.6, 1.2, -9.9, 0.8, 0.3]],
    piles: [
      [-12.2, 0, -4, 1.6, 0.4], [-12.3, 0, 0.6, 1.3, 0.3], [-12.2, 0, 11.6, 1.8, 0.45], [12.2, 0, -4.4, 1.5, 0.4], [12.3, 0, 3.6, 1.4, 0.32],
      [12.1, 0, 7.4, 1.7, 0.4], [-11.8, 1.2, -10.4, 1.2, 0.3], [11.4, 1.2, -10.5, 1.3, 0.32], [-6.4, 0, -6.6, 1.4, 0.2], [6.2, 0, -6.6, 1.5, 0.22],
    ],
    stars: [[-9.2, 6.9], [-6.1, 7.4], [-3.2, 6.6], [0, 7.2], [3.1, 6.7], [6.2, 7.5], [9.1, 6.8]].map(([x, y]) => [x, y, 3.5, 8.4]),
    snow: { x: 12.6, y0: 0.1, y1: 9.8, z0: -10.6, z1: 13.6 },
    light: [8.6, 3.6, -8.2],
  },
  // Kino: Saal x ±8, Leinwand bei z −10,9 (x ±6), Bühne bis z −9,4 auf 0,9 m, Sitzplatz bei (0 | 2,35 | 0,5),
  // hinterer Gang und Flur auf 2,4 m, Flur x 5,6 … 8,4 von z 9,8 bis 19,6
  cinema: {
    // kleine Tannen im Rand neben der Leinwand (vom Sitz aus sichtbar), große in den Ecken (bei der Kamerafahrt)
    trees: [[5.6, 0, -9.0, 1.8], [-5.6, 0, -9.0, 1.8], [6.8, 0, -7.6, 3.1], [-6.8, 0, -7.6, 3.1]],
    gifts: [
      [7.4, 0, -6.6, 0.5, 0.4], [6.2, 0, -6.5, 0.4, 0.3], [-7.4, 0, -6.6, 0.55, 0.45], [-6.1, 0, -6.6, 0.4, 0.5],
      [5.85, 2.4, 12.05, 0.34, 0.3], [8.15, 2.4, 13.75, 0.32, 0.36], [5.85, 2.4, 15.5, 0.36, 0.26], [8.15, 2.4, 10.3, 0.3, 0.3],
    ],
    canes: [[5.82, 2.4, 9.95, 1.7, 0], [8.18, 2.4, 9.95, 1.7, Math.PI]],
    // auf der Bühne direkt unter der Leinwand: vom Sitz aus im Streifen zwischen Bildrand und Leinwand
    garlands: [[-6.4, 6.4, 1.0, -10.55, 8]],
    wreaths: sides((s) => [[s * 7.84, 4.5, -4.0], [s * 7.84, 4.5, 1.0]]),
    swags: [
      ...sides((s) => [0, 1, 2, 3].map((i) => [[s * 7.9, 6.7, -9 + i * 4.5], [s * 7.9, 6.7, -4.5 + i * 4.5], 0.7, 12])),
      ...[5.68, 8.32].flatMap((x) => [0, 1, 2].map((i) => [[x, 5.12, 10 + i * 3.1], [x, 5.12, 13.1 + i * 3.1], 0.28, 10])),
    ],
    strings: [],
    snowmen: [[-4.4, 0, -7.9, 0.8, 0.5]],
    piles: [],
    stars: [],
    snow: null,
    light: null,
    // ohne Lichthof und aus größerer Entfernung gesehen: größere Birnen
    bulbSize: 0.09,
  },
};

/**
 * @param {THREE.Scene} scene
 * @param {{ flameTex?: THREE.Texture|null, envMap?: THREE.Texture|null, layout?: 'party'|'cinema' }} opts
 *   flameTex: weicher Punkt (Schneeflocken, nur mit Schneefall nötig)
 * @returns {{ ready: Promise<void>, setVisible(on: boolean): void, update(t: number, dt: number, beat: number, kick: number): void, dispose(): void }}
 */
export function createChristmasDecor(scene, { flameTex = null, envMap = null, layout = 'party' } = {}) {
  const L = LAYOUTS[layout] || LAYOUTS.party;
  const root = new THREE.Group();
  root.name = 'christmas';
  root.visible = false;
  scene.add(root);
  const disposables = [];
  const keep = (x) => { disposables.push(x); return x; };
  const R = rng(2412);
  const std = (color, o = {}) => keep(new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o }));

  const green = std('#1d5c33', { flatShading: true });
  const greenDark = std('#174a2a', { flatShading: true });
  const wood = std('#5a3a22');
  const white = std('#f4f7fb', { roughness: 0.95 });
  const red = std('#c3202b');
  const black = std('#15151a');
  const orange = std('#f08a1e');
  const starGlow = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd76a').multiplyScalar(2.2), toneMapped: false }));
  const iceGlow = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color('#cfe8ff').multiplyScalar(1.5), toneMapped: false, side: THREE.DoubleSide }));

  const bulbs = [];      // { p: Vector3, ci: Farbe, ph: Phase }
  const baubles = [];    // { p: Vector3, s: Größe, ci }
  const bulb = (x, y, z) => bulbs.push({ p: new THREE.Vector3(x, y, z), ci: bulbs.length % BULB_COLORS.length, ph: R() * 6.28 });

  const coneGeo = keep(new THREE.ConeGeometry(1, 1, 11));
  const trunkGeo = keep(new THREE.CylinderGeometry(0.5, 0.6, 1, 8));
  const ballGeo = keep(new THREE.SphereGeometry(1, 14, 10));
  const boxGeo = keep(new THREE.BoxGeometry(1, 1, 1));
  const starShape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2, r = i % 2 ? 0.42 : 1;
    if (i === 0) starShape.moveTo(Math.sin(a) * r, Math.cos(a) * r);
    else starShape.lineTo(Math.sin(a) * r, Math.cos(a) * r);
  }
  starShape.closePath();
  const starGeo = keep(new THREE.ExtrudeGeometry(starShape, { depth: 0.3, bevelEnabled: false }).translate(0, 0, -0.15));

  // ── Tannen ──
  const tops = [];       // Sterne auf den Tannen (drehen sich langsam)
  for (const [x, y, z, H] of L.trees) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const trunk = new THREE.Mesh(trunkGeo, wood);
    trunk.scale.set(0.16 * H * 0.5, 0.14 * H, 0.16 * H * 0.5);
    trunk.position.y = 0.07 * H;
    g.add(trunk);
    const radii = [0.36, 0.3, 0.23, 0.15];
    const tierH = 0.31 * H;
    radii.forEach((rk, i) => {
      const cy = (0.275 + i * 0.19) * H;
      const c = new THREE.Mesh(coneGeo, i % 2 ? greenDark : green);
      c.scale.set(rk * H, tierH, rk * H);
      c.position.y = cy;
      c.rotation.y = i * 0.5;
      g.add(c);
      // Kugeln auf dem Kegelmantel
      const n = Math.round(9 - i * 1.5);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + i * 0.7 + R() * 0.3;
        const u = 0.45 + R() * 0.45;                 // 0 = Spitze, 1 = Rand
        const rr = rk * H * u + 0.04;
        baubles.push({ p: new THREE.Vector3(x + Math.sin(a) * rr, y + cy + tierH / 2 - tierH * u, z + Math.cos(a) * rr), s: (0.075 + R() * 0.035) * Math.min(1, H / 3), ci: Math.floor(R() * BAUBLE_COLORS.length) });
      }
    });
    // Lichterkette als Spirale
    const turns = 5.5, n = Math.round(H * 16);
    for (let k = 0; k < n; k++) {
      const u = k / (n - 1);
      const rr = (0.37 * (1 - u) + 0.03) * H;
      const a = u * turns * Math.PI * 2;
      bulb(x + Math.sin(a) * rr, y + (0.17 + 0.8 * u) * H, z + Math.cos(a) * rr);
    }
    const star = new THREE.Mesh(starGeo, starGlow);
    star.scale.setScalar(0.085 * H);
    star.position.y = 1.04 * H;
    g.add(star);
    tops.push(star);
    root.add(g);
  }

  // ── Geschenke ──
  const bowGeo = keep(new THREE.TorusGeometry(0.5, 0.16, 6, 10));
  const paper = ['#c3202b', '#1f7a3d', '#2f6fd0', '#f2c230', '#8a3fd0', '#e9e9f2'].map((c) => std(c, { roughness: 0.55 }));
  const ribbon = ['#f2c230', '#e9e9f2', '#c3202b'].map((c) => std(c, { roughness: 0.45 }));
  for (const [x, y, z, w, h] of L.gifts) {
    const d = w * (0.8 + R() * 0.4);
    const g = new THREE.Group();
    g.position.set(x, y + h / 2, z);
    g.rotation.y = R() * 1.2;
    const pm = paper[Math.floor(R() * paper.length)];
    let rm = ribbon[Math.floor(R() * ribbon.length)];
    if (rm.color.equals(pm.color)) rm = ribbon[0];
    const body = new THREE.Mesh(boxGeo, pm);
    body.scale.set(w, h, d);
    const r1 = new THREE.Mesh(boxGeo, rm);
    r1.scale.set(w * 0.16, h * 1.02, d * 1.02);
    const r2 = new THREE.Mesh(boxGeo, rm);
    r2.scale.set(w * 1.02, h * 1.02, d * 0.16);
    g.add(body, r1, r2);
    for (const s of [-1, 1]) {
      const bow = new THREE.Mesh(bowGeo, rm);
      const k = Math.min(w, d) * 0.2;
      bow.scale.set(k, k, k * 0.7);
      bow.position.set(s * k * 0.45, h / 2 + k * 0.35, 0);
      bow.rotation.z = s * 0.7;
      g.add(bow);
    }
    root.add(g);
  }

  // ── Zuckerstangen ──
  if (L.canes.length) {
    const caneTex = keep(canvasTexture(64, 64, (ctx, w) => {
      ctx.fillStyle = '#f6f4ee';
      ctx.fillRect(0, 0, w, w);
      ctx.fillStyle = '#c8202b';
      for (let i = -1; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(0, i * 32 + 32); ctx.lineTo(w, i * 32); ctx.lineTo(w, i * 32 + 14); ctx.lineTo(0, i * 32 + 46);
        ctx.fill();
      }
    }).tex);
    caneTex.wrapS = caneTex.wrapT = THREE.RepeatWrapping;
    caneTex.repeat.set(9, 1);
    const caneMat = keep(new THREE.MeshStandardMaterial({ map: caneTex, roughness: 0.35 }));
    const canePts = [];
    for (let i = 0; i <= 6; i++) canePts.push(new THREE.Vector3(0, i * 0.125, 0));
    for (let i = 1; i <= 8; i++) {
      const a = (i / 8) * Math.PI;
      canePts.push(new THREE.Vector3(0.14 - Math.cos(a) * 0.14, 0.75 + Math.sin(a) * 0.14, 0));
    }
    canePts.push(new THREE.Vector3(0.28, 0.66, 0));
    const caneGeo = keep(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(canePts), 40, 0.045, 8));
    for (const [x, y, z, h, rot] of L.canes) {
      const m = new THREE.Mesh(caneGeo, caneMat);
      m.position.set(x, y, z);
      m.scale.setScalar(h / 0.9);
      m.rotation.y = rot;
      root.add(m);
    }
  }

  // ── Tannengirlanden mit roten Schleifen und Lichtern ──
  const knot = keep(new THREE.SphereGeometry(0.13, 8, 6));
  for (const [x0, x1, y, z, spans] of L.garlands) {
    const pts = [];
    for (let s = 0; s < spans; s++) {
      for (let i = 0; i < 8; i++) {
        const u = i / 8;
        const x = x0 + ((s + u) / spans) * (x1 - x0);
        const gy = y - 0.34 * 4 * u * (1 - u);
        pts.push(new THREE.Vector3(x, gy, z));
        if (i % 2 === 1) bulb(x, gy - 0.02, z + 0.11);
      }
    }
    pts.push(new THREE.Vector3(x1, y, z));
    const tube = keep(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), spans * 24, 0.1, 5));
    root.add(new THREE.Mesh(tube, green));
    for (let s = 0; s <= spans; s++) {
      const b = new THREE.Mesh(knot, red);
      b.position.set(x0 + (s / spans) * (x1 - x0), y - 0.02, z + 0.08);
      b.scale.set(1.5, 1, 0.7);
      root.add(b);
    }
  }

  // ── Kränze an den Seitenwänden ──
  const wreathGeo = keep(new THREE.TorusGeometry(0.7, 0.19, 7, 16));
  for (const [x, y, z] of L.wreaths) {
    const inward = -Math.sign(x);
    const m = new THREE.Mesh(wreathGeo, green);
    m.position.set(x, y, z);
    m.rotation.y = Math.PI / 2;
    root.add(m);
    const bow = new THREE.Mesh(boxGeo, red);
    bow.scale.set(0.12, 0.3, 0.55);
    bow.position.set(x + inward * 0.18, y - 0.7, z);
    root.add(bow);
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      bulb(x + inward * 0.22, y + Math.cos(a) * 0.7, z + Math.sin(a) * 0.7);
    }
  }

  // ── Lichterketten: durchhängende Bögen und gerade Stücke ──
  for (const [a, b, sag, n] of L.swags) {
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      bulb(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u - sag * 4 * u * (1 - u), a[2] + (b[2] - a[2]) * u);
    }
  }
  for (const [a, b, n] of L.strings) {
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      bulb(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u);
    }
  }

  // ── Schneemänner (wippen im Bass) ──
  const snowmen = [];
  for (const [x, y, z, k, rot] of L.snowmen) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = rot;
    g.scale.setScalar(k);
    const part = (r, py, m = white) => { const b = new THREE.Mesh(ballGeo, m); b.scale.setScalar(r); b.position.y = py; g.add(b); return b; };
    part(0.55, 0.5);
    part(0.4, 1.25);
    const head = new THREE.Group();
    head.position.y = 1.85;
    g.add(head);
    const skull = new THREE.Mesh(ballGeo, white);
    skull.scale.setScalar(0.3);
    head.add(skull);
    const nose = new THREE.Mesh(coneGeo, orange);
    nose.scale.set(0.06, 0.3, 0.06);
    nose.rotation.x = Math.PI / 2;
    nose.position.z = 0.4;
    head.add(nose);
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(ballGeo, black);
      eye.scale.setScalar(0.04);
      eye.position.set(s * 0.11, 0.09, 0.27);
      head.add(eye);
    }
    const brim = new THREE.Mesh(trunkGeo, black);
    brim.scale.set(0.7, 0.04, 0.7);
    brim.position.y = 0.24;
    const hat = new THREE.Mesh(trunkGeo, black);
    hat.scale.set(0.42, 0.34, 0.42);
    hat.position.y = 0.42;
    head.add(brim, hat);
    const scarf = new THREE.Mesh(wreathGeo, red);
    scarf.scale.set(0.42, 0.42, 0.5);
    scarf.rotation.x = Math.PI / 2;
    scarf.position.y = 1.6;
    g.add(scarf);
    for (const py of [1.1, 1.3, 1.5]) { const b = part(0.045, py, black); b.position.z = 0.39 - Math.abs(py - 1.3) * 0.25; }
    root.add(g);
    snowmen.push({ g, head, k, ph: snowmen.length * 1.7 });
  }

  // ── Schneehaufen am Rand ──
  for (const [x, y, z, w, h] of L.piles) {
    const m = new THREE.Mesh(ballGeo, white);
    m.scale.set(w, h, w * 0.8);
    m.position.set(x, y, z);
    root.add(m);
  }

  // ── Eissterne an Fäden ──
  const hangers = [];
  const threadMat = keep(new THREE.LineBasicMaterial({ color: '#d8dce8', transparent: true, opacity: 0.5 }));
  L.stars.forEach(([x, y, z, hangY], i) => {
    const m = new THREE.Mesh(starGeo, i % 2 ? iceGlow : starGlow);
    m.scale.set(0.3, 0.3, 0.08);
    m.position.set(x, y, z);
    root.add(m);
    const line = new THREE.Line(keep(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, hangY, z), new THREE.Vector3(x, y + 0.3, z)])), threadMat);
    root.add(line);
    hangers.push({ m, ph: i * 1.3, y });
  });

  // ── Instanzen: Christbaumkugeln und Lichterketten ──
  const tmpM = new THREE.Matrix4();
  const tmpS = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();
  const baubleMesh = new THREE.InstancedMesh(ballGeo, keep(new THREE.MeshStandardMaterial({ metalness: 0.85, roughness: 0.22, envMap, envMapIntensity: 1.4 })), Math.max(1, baubles.length));
  baubles.forEach((b, i) => {
    baubleMesh.setMatrixAt(i, tmpM.compose(b.p, tmpQ, tmpS.setScalar(b.s)));
    baubleMesh.setColorAt(i, new THREE.Color(BAUBLE_COLORS[b.ci]));
  });
  baubleMesh.count = baubles.length;
  root.add(baubleMesh);
  const bulbGeo = keep(new THREE.SphereGeometry(L.bulbSize || 0.055, 7, 5));
  const bulbMesh = new THREE.InstancedMesh(bulbGeo, keep(new THREE.MeshBasicMaterial({ toneMapped: false, fog: false })), Math.max(1, bulbs.length));
  const bulbCol = new THREE.Color();
  bulbs.forEach((b, i) => {
    bulbMesh.setMatrixAt(i, tmpM.makeTranslation(b.p.x, b.p.y, b.p.z));
    bulbMesh.setColorAt(i, BULB_COLORS[b.ci]);
  });
  bulbMesh.count = bulbs.length;
  bulbMesh.frustumCulled = false;
  root.add(bulbMesh);

  // warmes Licht an der großen Tanne
  let treeLight = null;
  if (L.light) {
    treeLight = new THREE.PointLight('#ffb35a', 22, 9, 1.4);
    treeLight.position.set(...L.light);
    root.add(treeLight);
  }

  // ── Schneefall ──
  const BOX = L.snow;
  const FLAKES = BOX ? 1300 : 0;
  const snowPos = new Float32Array(FLAKES * 3);
  const snowVel = new Float32Array(FLAKES * 2);      // Fallgeschwindigkeit, Phase
  let snowGeo = null;
  if (BOX) {
    for (let i = 0; i < FLAKES; i++) {
      snowPos[i * 3] = (R() * 2 - 1) * BOX.x;
      snowPos[i * 3 + 1] = BOX.y0 + R() * (BOX.y1 - BOX.y0);
      snowPos[i * 3 + 2] = BOX.z0 + R() * (BOX.z1 - BOX.z0);
      snowVel[i * 2] = 0.45 + R() * 0.7;
      snowVel[i * 2 + 1] = R() * 6.28;
    }
    snowGeo = keep(new THREE.BufferGeometry());
    snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
    const snowMat = keep(new THREE.PointsMaterial({ map: flameTex, color: '#ffffff', size: 0.13, transparent: true, opacity: 0.85, depthWrite: false, sizeAttenuation: true }));
    const snow = new THREE.Points(snowGeo, snowMat);
    snow.frustumCulled = false;
    root.add(snow);
  }

  let visible = false;
  return {
    ready: Promise.resolve(),
    setVisible(on) { visible = !!on; root.visible = visible; },
    update(t, dt, beat, kick) {
      if (!visible) return;
      // Lichterketten: Lauflicht im Takt (jede vierte Birne hell), dazu leichtes Funkeln und der Bass
      const step = Math.floor(beat);
      const fade = 1 - Math.min(1, (beat - step) * 1.6);
      for (let i = 0; i < bulbs.length; i++) {
        const b = bulbs[i];
        const lead = (i + step) % 4 === 0;
        const k = 0.45 + (lead ? 1.2 * fade + 0.4 : 0) + 0.2 * Math.sin(t * 3.1 + b.ph) + 0.4 * kick;
        bulbMesh.setColorAt(i, bulbCol.copy(BULB_COLORS[b.ci]).multiplyScalar(Math.max(0.25, k)));
      }
      if (bulbs.length) bulbMesh.instanceColor.needsUpdate = true;
      if (treeLight) treeLight.intensity = 18 + 8 * kick + 3 * Math.sin(t * 2.3);
      for (const s of tops) s.rotation.y = t * 0.6;
      for (const h of hangers) {
        h.m.rotation.y = t * 0.5 + h.ph;
        h.m.position.y = h.y + 0.06 * Math.sin(t * 0.9 + h.ph);
      }
      // Schneemänner wippen im Bass und nicken
      for (const s of snowmen) {
        const sq = 1 + 0.06 * kick;
        s.g.scale.set(s.k / Math.sqrt(sq), s.k * sq, s.k / Math.sqrt(sq));
        s.head.rotation.z = 0.12 * Math.sin(beat * Math.PI / 2 + s.ph);
      }
      // Schnee: fällt, pendelt leicht, kommt oben wieder herein
      if (BOX) {
        for (let i = 0; i < FLAKES; i++) {
          const o = i * 3;
          const ph = snowVel[i * 2 + 1];
          snowPos[o] += Math.sin(t * 0.7 + ph) * 0.25 * dt;
          snowPos[o + 2] += Math.cos(t * 0.5 + ph * 1.3) * 0.2 * dt;
          snowPos[o + 1] -= snowVel[i * 2] * dt;
          if (snowPos[o + 1] < BOX.y0) {
            snowPos[o + 1] = BOX.y1;
            snowPos[o] = (Math.random() * 2 - 1) * BOX.x;
            snowPos[o + 2] = BOX.z0 + Math.random() * (BOX.z1 - BOX.z0);
          }
        }
        snowGeo.attributes.position.needsUpdate = true;
      }
    },
    dispose() {
      scene.remove(root);
      baubleMesh.dispose();
      bulbMesh.dispose();
      for (const d of disposables) d.dispose?.();
    },
  };
}
