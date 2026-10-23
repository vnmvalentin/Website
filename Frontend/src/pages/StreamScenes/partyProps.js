// partyProps.js — Technik und Möbel des Party-Saals (Stream Starting).
//
// Statt glatter schwarzer Quader: Boxen mit strukturiertem Lack, Metallecken, Griffmulden,
// Bassreflex-Schlitzen und verschraubten Membranen; ein DJ-Pult mit LED-Pixelfront, zwei Playern,
// Mischpult und Laptop; Nebelmaschinen mit Lüftungsschlitzen, Tragebügel und Fluidtank; Moving
// Heads mit Bügel (dreht nur seitlich) und Kopf (folgt dem Lichtkegel); Flammen-Einheiten mit
// Warnstreifen. Oberflächen sind Poly-Haven-Fotomaterialien (public/media/cr3d) — Struktur kommt
// aus deren Normal-/Rauheitskarten, die Farbe bleibt dunkel wie echte Bühnentechnik.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { canvasTexture } from './sceneKit';

const rbox = (w, h, d, r = 0.03) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2));

/** Gemeinsame Materialien (einmal je Szene). */
export function propMaterials(assets, envMap) {
  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.8, ...o });
  return {
    // Boxenlack: dunkel, Struktur aus dem Beton-Scan (nur Normalen/Rauheit)
    tolex: assets.pbr(std({ color: '#141418', roughness: 0.9 }), 'rough_concrete', 2, 2, { noMap: true, normalScale: 0.6 }),
    metal: assets.pbr(std({ color: '#3a3d45', metalness: 0.85, roughness: 0.4, envMap, envMapIntensity: 0.7 }), 'rusty_metal_02', 1, 1, { noMap: true, normalScale: 0.4, noArm: true }),
    darkMetal: std({ color: '#1b1c21', metalness: 0.7, roughness: 0.45, envMap, envMapIntensity: 0.5 }),
    rubber: std({ color: '#070708', roughness: 0.95 }),
    hole: new THREE.MeshBasicMaterial({ color: '#020203' }),
    cone: assets.pbr(std({ color: '#1e1f24', roughness: 0.85 }), 'rough_concrete', 1, 1, { noMap: true, normalScale: 0.35 }),
    cap: std({ color: '#454852', roughness: 0.25, metalness: 0.7, envMap, envMapIntensity: 0.8 }),
    velvet: assets.pbr(std({ color: '#0a0a0e', roughness: 0.95 }), 'velour_velvet', 8, 2, { noMap: true }),
    deck: assets.pbr(std({ color: '#2a2622', roughness: 0.75 }), 'wood_planks', 6, 2),
  };
}

// ── Boxen ────────────────────────────────────────────────────────────────────
const CAB_W = 1.3, CAB_H = 1.25, CAB_D = 1.1;

/**
 * Ein Boxenturm aus drei Gehäusen (2 Bässe, oben Mittel-/Hochton).
 * @returns {{ tower: THREE.Group, cabinets: { group: THREE.Group, cones: THREE.Group[], base: number }[], logos: THREE.MeshBasicMaterial[] }}
 */
export function buildSpeakerTower(mats) {
  const tower = new THREE.Group();
  const cabinets = [];
  const logos = [];
  const bodyGeo = rbox(CAB_W, CAB_H, CAB_D, 0.035);
  const cornerGeo = rbox(0.12, 0.12, 0.12, 0.025);
  const coneGeo = new THREE.LatheGeometry([
    new THREE.Vector2(0.06, -0.13), new THREE.Vector2(0.14, -0.12), new THREE.Vector2(0.27, -0.07), new THREE.Vector2(0.37, -0.02), new THREE.Vector2(0.4, 0),
  ], 40).rotateX(Math.PI / 2);
  const capGeo = new THREE.SphereGeometry(0.13, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.55, 1).rotateX(Math.PI / 2).translate(0, 0, -0.11);
  const surroundGeo = new THREE.TorusGeometry(0.41, 0.035, 10, 48);
  const basketGeo = new THREE.TorusGeometry(0.455, 0.022, 6, 48);
  const boltGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.02, 8).rotateX(Math.PI / 2);
  const front = CAB_D / 2;

  const woofer = (g, x, y, r) => {
    const k = r / 0.42;
    const surround = new THREE.Mesh(surroundGeo, mats.rubber);
    surround.position.set(x, y, front + 0.01);
    surround.scale.setScalar(k);
    const basket = new THREE.Mesh(basketGeo, mats.darkMetal);
    basket.position.set(x, y, front + 0.005);
    basket.scale.setScalar(k);
    g.add(surround, basket);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const b = new THREE.Mesh(boltGeo, mats.metal);
      b.position.set(x + Math.cos(a) * 0.455 * k, y + Math.sin(a) * 0.455 * k, front + 0.02);
      g.add(b);
    }
    const cone = new THREE.Group();
    cone.position.set(x, y, front + 0.01);
    cone.scale.setScalar(k);
    cone.add(new THREE.Mesh(coneGeo, mats.cone), new THREE.Mesh(capGeo, mats.cap));
    g.add(cone);
    return cone;
  };

  for (let i = 0; i < 3; i++) {
    const g = new THREE.Group();
    g.position.y = 0.66 + i * 1.27;
    g.add(new THREE.Mesh(bodyGeo, mats.tolex));
    // Metallecken
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      const c = new THREE.Mesh(cornerGeo, mats.metal);
      c.position.set(sx * (CAB_W / 2 - 0.045), sy * (CAB_H / 2 - 0.045), sz * (CAB_D / 2 - 0.045));
      g.add(c);
    }
    // Griffmulden mit Bügel an beiden Seiten
    for (const sx of [-1, 1]) {
      const dish = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.12, 0.3), mats.hole);
      dish.position.set(sx * (CAB_W / 2 + 0.001), 0.3, 0);
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.26, 8).rotateX(Math.PI / 2), mats.metal);
      bar.position.set(sx * (CAB_W / 2 + 0.02), 0.3, 0);
      g.add(dish, bar);
    }
    // Frontrahmen
    for (const [w, h, x, y] of [[CAB_W - 0.1, 0.035, 0, CAB_H / 2 - 0.06], [CAB_W - 0.1, 0.035, 0, -CAB_H / 2 + 0.06], [0.035, CAB_H - 0.1, CAB_W / 2 - 0.06, 0], [0.035, CAB_H - 0.1, -CAB_W / 2 + 0.06, 0]]) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.02), mats.darkMetal);
      f.position.set(x, y, front + 0.005);
      g.add(f);
    }
    let cones;
    if (i < 2) {
      cones = [woofer(g, 0, 0.06, 0.46)];
      // Bassreflex-Schlitze unten
      for (const x of [-0.3, 0.3]) {
        const port = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.07, 0.02), mats.hole);
        port.position.set(x, -CAB_H / 2 + 0.13, front + 0.002);
        g.add(port);
      }
    } else {
      cones = [woofer(g, -0.32, 0.18, 0.24), woofer(g, 0.32, 0.18, 0.24)];
      // Hochtonhorn
      const horn = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.22, 0.02), mats.hole);
      horn.position.set(0, -0.3, front + 0.003);
      const hornFrame = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.28, 0.025), mats.darkMetal);
      hornFrame.position.set(0, -0.3, front - 0.001);
      g.add(hornFrame, horn);
      // Leuchtleiste (Farbe folgt der Lichtstimmung)
      const logoMat = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
      logos.push(logoMat);
      const logo = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.025, 0.01), logoMat);
      logo.position.set(0, -CAB_H / 2 + 0.12, front + 0.01);
      g.add(logo);
    }
    tower.add(g);
    cabinets.push({ group: g, cones, base: g.position.y });
  }
  // Rollbrett unter dem Turm
  const dolly = new THREE.Mesh(rbox(CAB_W + 0.04, 0.05, CAB_D + 0.04, 0.015), mats.darkMetal);
  dolly.position.y = 0.025;
  tower.add(dolly);
  return { tower, cabinets, logos };
}

// ── DJ-Pult ──────────────────────────────────────────────────────────────────
/** LED-Pixelfront: runde Punkte auf Schwarz, Farbe kommt aus dem Material. */
function pixelTexture() {
  return canvasTexture(512, 128, (ctx, w, h) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    const step = 8;
    for (let y = step / 2; y < h; y += step) {
      for (let x = step / 2; x < w; x += step) {
        // Muster: zwei Wellen, außen dunkler — ergibt ein Laufband, wenn die Textur wandert
        const f = 0.5 + 0.5 * Math.sin(x * 0.045) * Math.cos(y * 0.09 + x * 0.01);
        ctx.fillStyle = `rgba(255,255,255,${(0.15 + 0.85 * f).toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(x, y, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }, { repeat: [1, 1] }).tex;
}

/** Display eines Players/Laptops: dunkle Fläche mit Wellenform. */
function screenTexture(kind) {
  return canvasTexture(256, 160, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#0b1a2e');
    g.addColorStop(1, '#050a14');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = kind === 'laptop' ? '#ff4fd8' : '#46c8ff';
    ctx.lineWidth = 2;
    for (let row = 0; row < (kind === 'laptop' ? 2 : 1); row++) {
      const cy = kind === 'laptop' ? 45 + row * 60 : h / 2;
      ctx.beginPath();
      for (let x = 0; x < w; x += 2) {
        const a = Math.abs(Math.sin(x * 0.11 + row) * Math.sin(x * 0.023 + row * 2)) * 26;
        ctx.moveTo(x, cy - a);
        ctx.lineTo(x, cy + a);
      }
      ctx.stroke();
      if (kind === 'laptop') ctx.strokeStyle = '#46c8ff';
    }
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(w * 0.38, 0, 2, h);
  }).tex;
}

/**
 * DJ-Pult auf der Bühne. update(t, colA, colB, kick) lässt die LED-Front im Takt laufen.
 * @returns {{ group: THREE.Group, update: (t: number, a: THREE.Color, b: THREE.Color, kick: number) => void }}
 */
export function buildDjBooth(mats, trimMat) {
  const group = new THREE.Group();
  const W = 3.2, H = 1.1, D = 1.0;
  const body = new THREE.Mesh(rbox(W, H, D, 0.04), mats.tolex);
  body.position.y = H / 2;
  group.add(body);
  // LED-Pixelfront
  const pix = pixelTexture();
  pix.wrapS = THREE.RepeatWrapping;
  const facadeMat = new THREE.MeshBasicMaterial({ map: pix, color: '#ffffff', toneMapped: false });
  const facade = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.24, H - 0.3), facadeMat);
  facade.position.set(0, H / 2 - 0.02, D / 2 + 0.004);
  group.add(facade);
  // Leisten oben/unten (Farbe setzt die Szene über trimMat)
  for (const y of [H - 0.07, 0.09]) {
    const trim = new THREE.Mesh(new THREE.BoxGeometry(W - 0.2, 0.035, 0.03), trimMat);
    trim.position.set(0, y, D / 2 + 0.01);
    group.add(trim);
  }
  // Tischplatte
  const top = new THREE.Mesh(rbox(W + 0.1, 0.05, D + 0.1, 0.02), mats.darkMetal);
  top.position.y = H + 0.025;
  group.add(top);
  const y0 = H + 0.05;
  const screens = [];
  // Zwei Player
  for (const x of [-0.95, 0.95]) {
    const cdj = new THREE.Mesh(rbox(0.36, 0.07, 0.46, 0.015), mats.darkMetal);
    cdj.position.set(x, y0 + 0.035, 0.02);
    const platter = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.02, 32), mats.metal);
    platter.position.set(x, y0 + 0.08, 0.09);
    const center = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.025, 24), mats.rubber);
    center.position.set(x, y0 + 0.085, 0.09);
    const scrMat = new THREE.MeshBasicMaterial({ map: screenTexture('cdj'), toneMapped: false });
    screens.push(scrMat);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.1), scrMat);
    scr.rotation.x = -Math.PI / 2 + 0.5;
    scr.position.set(x, y0 + 0.09, -0.14);
    group.add(cdj, platter, center, scr);
  }
  // Mischpult mit Reglern und Fadern
  const mixer = new THREE.Mesh(rbox(0.4, 0.08, 0.46, 0.015), mats.darkMetal);
  mixer.position.set(0, y0 + 0.04, 0.02);
  group.add(mixer);
  const knobGeo = new THREE.CylinderGeometry(0.014, 0.016, 0.03, 12);
  const knobs = new THREE.InstancedMesh(knobGeo, mats.rubber, 16);
  const m4 = new THREE.Matrix4();
  let k = 0;
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) knobs.setMatrixAt(k++, m4.makeTranslation(-0.12 + c * 0.08, y0 + 0.095, -0.17 + r * 0.06));
  group.add(knobs);
  const faderMat = new THREE.MeshStandardMaterial({ color: '#d9dbe2', roughness: 0.4 });
  for (let c = 0; c < 4; c++) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.025, 0.02), faderMat);
    f.position.set(-0.12 + c * 0.08, y0 + 0.095, 0.12 + (c % 2) * 0.04);
    group.add(f);
  }
  // Laptop auf Ständer
  const stand = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.16, 0.04), mats.metal);
  stand.position.set(-0.45, y0 + 0.08, -0.32);
  const lapBase = new THREE.Mesh(rbox(0.34, 0.015, 0.24, 0.006), mats.metal);
  lapBase.position.set(-0.45, y0 + 0.165, -0.32);
  lapBase.rotation.x = 0.18;
  const lapMat = new THREE.MeshBasicMaterial({ map: screenTexture('laptop'), toneMapped: false });
  screens.push(lapMat);
  const lapScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.33, 0.21), lapMat);
  lapScreen.position.set(-0.45, y0 + 0.28, -0.44);
  lapScreen.rotation.x = -0.2;
  const lapBack = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.22, 0.008), mats.metal);
  lapBack.position.set(-0.45, y0 + 0.28, -0.446);
  lapBack.rotation.x = -0.2;
  group.add(stand, lapBase, lapBack, lapScreen);

  const tmp = new THREE.Color();
  return {
    group,
    update(t, a, b, kick) {
      pix.offset.x = (t * 0.06) % 1;
      facadeMat.color.copy(a).lerp(b, 0.5 + 0.5 * Math.sin(t * 0.8)).multiplyScalar(0.55 + 0.45 * kick);
      for (const s of screens) s.color.copy(tmp.setScalar(0.85 + 0.15 * kick));
    },
  };
}

// ── Nebelmaschine ────────────────────────────────────────────────────────────
/** @returns {{ group: THREE.Group, led: THREE.Mesh, nozzle: THREE.Vector3 }} Düse in Gruppen-Koordinaten */
export function buildFogMachine(mats) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(rbox(0.55, 0.34, 0.72, 0.04), mats.metal);
  body.position.y = 0.21;
  g.add(body);
  // Lüftungsschlitze an beiden Seiten
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const slot = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.025, 0.36), mats.hole);
      slot.position.set(sx * 0.276, 0.13 + i * 0.03, -0.05);
      g.add(slot);
    }
  }
  // Füße
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.04, 10), mats.rubber);
    foot.position.set(sx * 0.22, 0.02, sz * 0.28);
    g.add(foot);
  }
  // Tragebügel
  for (const sz of [-0.2, 0.2]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 8), mats.darkMetal);
    post.position.set(0, 0.44, sz);
    g.add(post);
  }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.42, 10).rotateX(Math.PI / 2), mats.rubber);
  bar.position.set(0, 0.5, 0);
  g.add(bar);
  // Fluidtank hinten
  const tank = new THREE.Mesh(rbox(0.2, 0.24, 0.12, 0.02), new THREE.MeshStandardMaterial({ color: '#5a6f80', roughness: 0.2, transparent: true, opacity: 0.35, depthWrite: false }));
  tank.position.set(0.12, 0.5, -0.42);
  const fluid = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.14, 0.09), new THREE.MeshStandardMaterial({ color: '#2f6f8c', roughness: 0.3 }));
  fluid.position.set(0.12, 0.45, -0.42);
  g.add(fluid, tank);
  // Düse mit Kühlrippen
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.085, 0.16, 18).rotateX(Math.PI / 2), mats.darkMetal);
  nozzle.position.set(0, 0.24, 0.43);
  g.add(nozzle);
  for (let i = 0; i < 3; i++) {
    const fin = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.008, 6, 20), mats.metal);
    fin.position.set(0, 0.24, 0.38 + i * 0.035);
    g.add(fin);
  }
  // Statuslämpchen + Bedienfeld
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.09, 0.01), mats.hole);
  panel.position.set(0.1, 0.27, 0.362);
  g.add(panel);
  const led = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.025, 0.012), new THREE.MeshBasicMaterial({ color: '#ff2a2a' }));
  led.position.set(0.16, 0.28, 0.366);
  g.add(led);
  return { group: g, led, nozzle: new THREE.Vector3(0, 0.24, 0.55) };
}

// ── Moving Head ──────────────────────────────────────────────────────────────
/**
 * Hängender Scheinwerfer: Sockel am Träger, Bügel dreht seitlich, Kopf sitzt am Drehpunkt (pivot)
 * und zeigt mit +z in Strahlrichtung. aim(target) richtet Bügel und Kopf aus.
 */
export function buildMovingHead(mats, pivot) {
  const base = new THREE.Group();
  const housing = new THREE.Mesh(rbox(0.44, 0.2, 0.44, 0.04), mats.darkMetal);
  housing.position.y = 0.36;
  base.add(housing);
  const display = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.05), new THREE.MeshBasicMaterial({ color: '#46c8ff', toneMapped: false }));
  display.position.set(0, 0.36, 0.222);
  base.add(display);
  const yoke = new THREE.Group();
  yoke.position.y = 0.24;
  base.add(yoke);
  const top = new THREE.Mesh(rbox(0.46, 0.05, 0.14, 0.02), mats.darkMetal);
  yoke.add(top);
  for (const sx of [-1, 1]) {
    const arm = new THREE.Mesh(rbox(0.05, 0.36, 0.14, 0.02), mats.darkMetal);
    arm.position.set(sx * 0.215, -0.17, 0);
    yoke.add(arm);
  }
  // Kopf: Gehäuse hinter der Linse, Ring vorn
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.15, 0.36, 24).rotateX(Math.PI / 2), mats.darkMetal);
  head.position.z = -0.17;
  const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.165, 0.022, 8, 28), mats.metal);
  bezel.position.z = 0.0;
  pivot.add(head, bezel);
  const tmp = new THREE.Vector3();
  return {
    base,
    aim(target) {
      base.getWorldPosition(tmp);
      yoke.rotation.y = Math.atan2(target.x - tmp.x, target.z - tmp.z);
    },
  };
}

// ── Flammen-Einheit ──────────────────────────────────────────────────────────
function hazardTexture() {
  return canvasTexture(256, 32, (ctx, w, h) => {
    ctx.fillStyle = '#e8b81c';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#111';
    for (let x = -h; x < w + h; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, h); ctx.lineTo(x + 16, h); ctx.lineTo(x + 16 + h, 0); ctx.lineTo(x + h, 0);
      ctx.fill();
    }
  }, { repeat: [1, 1] }).tex;
}

let hazardTex = null;
export function buildFlameUnit(mats) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(rbox(0.44, 0.26, 0.44, 0.03), mats.metal);
  body.position.y = 0.13;
  g.add(body);
  hazardTex = hazardTex || hazardTexture();
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.05, 0.45), new THREE.MeshStandardMaterial({ map: hazardTex, roughness: 0.6 }));
  band.position.y = 0.2;
  g.add(band);
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.1, 16), mats.darkMetal);
  pipe.position.y = 0.31;
  const lip = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.01, 6, 18).rotateX(Math.PI / 2), mats.metal);
  lip.position.y = 0.36;
  g.add(pipe, lip);
  return g;
}
