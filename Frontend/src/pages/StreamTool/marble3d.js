// marble3d.js — 3D-Darstellung der Murmelbahn (three.js, lazy geladen).
//
// Gerechnet wird weiter ausschließlich in marbleSim.js (2D, deterministisch) —
// hier wird nur gezeichnet. Deshalb darf dieses Modul Math.sin/cos/atan2 frei
// benutzen: nichts davon fließt zurück ins Rennen.
//
// Aufbau: die Bahn ist eine senkrechte Wand (Ebene z = 0), alle Hindernisse
// ragen DEPTH Einheiten nach vorne heraus, die Murmeln rollen davor. Eine
// Simulations-Einheit = eine three-Einheit; x wird um die Mitte verschoben,
// y umgedreht (Sim: nach unten wachsend, three: nach oben).
import * as THREE from 'three';
import { WORLD_W, MARBLE_R } from './marbleSim';

const DEPTH = 30;
const HALF_W = WORLD_W / 2;
/** Abstand der Kamera zur Wand — kleiner = mehr Perspektive. */
const CAM_DIST = 1100;
/** Die Kamera schaut leicht von oben auf die Wand, damit man die Tiefe sieht. */
const CAM_PITCH = 0.16;
const FONT = 'Inter, Roboto, system-ui, sans-serif';

const tx = (x) => x - HALF_W;
const ty = (y) => -y;

/** Lädt ein Avatarbild CORS-sauber — ohne den Header darf WebGL es nicht benutzen. */
function loadAvatar(url, onLoad) {
  if (!url) return;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => onLoad(img);
  img.src = url;
}

/** Textur einer Murmel: Farbe, Avatar (sobald geladen) oder Anfangsbuchstabe, Farbring. */
function marbleTexture(name, color) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;

  const paint = (img) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, size, size);
    if (img) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2 - 10, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(img, 10, 10, size - 20, size - 20);
      ctx.restore();
    } else {
      ctx.fillStyle = '#fff';
      ctx.font = `800 64px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText((name || '?').slice(0, 1).toUpperCase(), size / 2, size / 2 + 4);
    }
    tex.needsUpdate = true;
  };
  paint(null);
  return { tex, paint };
}

/**
 * Kugel, deren Vorderseite die Textur flach von vorn aufgeprojiziert bekommt —
 * wie ein Aufkleber. Rollen ist eine Drehung um z, der Avatar bleibt also
 * immer sichtbar und dreht sich nur in der Bildebene.
 */
function marbleGeometry() {
  const geo = new THREE.SphereGeometry(MARBLE_R, 28, 20);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, 0.5 + pos.getX(i) / (2 * MARBLE_R), 0.5 + pos.getY(i) / (2 * MARBLE_R));
  }
  uv.needsUpdate = true;
  return geo;
}

/** Laufende Streifen für die Windzonen. */
function windTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = 'rgba(170, 215, 255, 0.85)';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(30, 20); ctx.lineTo(100, 20);
  ctx.moveTo(150, 46); ctx.lineTo(220, 46);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function checkerTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = (WORLD_W / 20) * 8;
  canvas.height = 16;
  const ctx = canvas.getContext('2d');
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < WORLD_W / 20; col++) {
      ctx.fillStyle = (row + col) % 2 ? '#101014' : '#f2f2f5';
      ctx.fillRect(col * 8, row * 8, 8, 8);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  return tex;
}

/** Balken von (x1,y1) nach (x2,y2) in Sim-Koordinaten als Matrix für einen Einheitswürfel. */
function barMatrix(m, x1, y1, x2, y2, thick) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.atan2(-dy, dx));
  return m.compose(
    new THREE.Vector3(tx((x1 + x2) / 2), ty((y1 + y2) / 2), 0),
    q,
    new THREE.Vector3(len, thick, 1),
  );
}

/**
 * Baut die Szene für ein Rennen. Gibt null zurück, wenn kein WebGL verfügbar ist
 * (dann zeichnet der Aufrufer weiter in 2D).
 *
 * @param {HTMLCanvasElement} canvas
 * @param {HTMLElement} layer   DOM-Ebene über dem Canvas für Namen und Countdown
 * @param {object} race         aus createRace()
 * @param {object[]} players    Spielerliste in Murmel-Reihenfolge
 * @param {{ width:number, height:number, pixel:number, colors:string[], accent:string }} opts
 */
export function createMarbleView(canvas, layer, race, players, opts) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch {
    return null;
  }
  const { width, height, pixel } = opts;
  renderer.setPixelRatio(pixel);
  renderer.setSize(width, height, false);
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const { course } = race;
  const scene = new THREE.Scene();
  const disposables = [];
  const keep = (x) => { disposables.push(x); return x; };

  const camera = new THREE.PerspectiveCamera(
    (2 * Math.atan((height / 2 + 14) / CAM_DIST) * 180) / Math.PI, width / height, 10, 4000,
  );

  scene.add(new THREE.HemisphereLight(0xffffff, 0x404050, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -420, right: 420, top: 600, bottom: -600, near: 10, far: 2400 });
  sun.shadow.bias = -0.0008;
  scene.add(sun, sun.target);

  // Rückwand: nur der Schatten wird gezeichnet, der Rest bleibt die Kartenfarbe
  const boardH = course.height + 1200;
  const board = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(WORLD_W + 40, boardH)),
    keep(new THREE.ShadowMaterial({ opacity: 0.42 })),
  );
  board.position.set(0, ty(course.height / 2), 0);
  board.receiveShadow = true;
  scene.add(board);

  const white = keep(new THREE.MeshStandardMaterial({ color: 0xe8e8ee, roughness: 0.55, metalness: 0.05 }));
  const accentMat = keep(new THREE.MeshStandardMaterial({ color: opts.accent, roughness: 0.4, metalness: 0.1 }));
  let accent = opts.accent;

  // Seitenwände: die Sim hält die Murmeln zwischen x = 0 und WORLD_W
  const railGeo = keep(new THREE.BoxGeometry(8, boardH, DEPTH + 6));
  for (const x of [-4, WORLD_W + 4]) {
    const rail = new THREE.Mesh(railGeo, white);
    rail.position.set(tx(x), ty(course.height / 2), (DEPTH + 6) / 2);
    rail.castShadow = true;
    scene.add(rail);
  }

  // Balken und Nägel als Instanzen — Hunderte Hindernisse in wenigen Zeichenaufrufen
  const boxGeo = keep(new THREE.BoxGeometry(1, 1, DEPTH));
  boxGeo.translate(0, 0, DEPTH / 2);
  const cylGeo = keep(new THREE.CylinderGeometry(1, 1, DEPTH, 24));
  cylGeo.rotateX(Math.PI / 2);
  cylGeo.translate(0, 0, DEPTH / 2);

  const m4 = new THREE.Matrix4();
  const springIdx = [];
  const segs = new THREE.InstancedMesh(boxGeo, white, Math.max(1, course.segs.length));
  const caps = new THREE.InstancedMesh(cylGeo, white, Math.max(1, course.segs.length * 2));
  course.segs.forEach((s, i) => {
    segs.setMatrixAt(i, barMatrix(m4, s.x1, s.y1, s.x2, s.y2, 8));
    for (const [k, x, y] of [[0, s.x1, s.y1], [1, s.x2, s.y2]]) {
      caps.setMatrixAt(i * 2 + k, m4.makeScale(4, 4, 1).setPosition(tx(x), ty(y), 0));
    }
    if (s.springy) springIdx.push(i);
  });
  segs.count = course.segs.length;
  caps.count = course.segs.length * 2;

  const bumperIdx = [];
  const pegs = new THREE.InstancedMesh(cylGeo, white, Math.max(1, course.pegs.length));
  course.pegs.forEach((p, i) => {
    pegs.setMatrixAt(i, m4.makeScale(p.r, p.r, 1).setPosition(tx(p.x), ty(p.y), 0));
    if (p.bumper) bumperIdx.push(i);
  });
  pegs.count = course.pegs.length;

  const paintAccent = () => {
    const c = new THREE.Color(accent);
    const w = new THREE.Color(0xffffff);
    course.segs.forEach((s, i) => {
      const col = s.springy ? c : w;
      segs.setColorAt(i, col);
      caps.setColorAt(i * 2, col);
      caps.setColorAt(i * 2 + 1, col);
    });
    course.pegs.forEach((p, i) => pegs.setColorAt(i, p.bumper ? c : w));
    for (const mesh of [segs, caps, pegs]) if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    accentMat.color.set(accent);
  };
  paintAccent();
  for (const mesh of [segs, caps, pegs]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // Die Instanzen liegen über die ganze Bahn verteilt — nie als Ganzes wegschneiden
    mesh.frustumCulled = false;
    scene.add(mesh);
  }

  // Drehkreuze und Propeller
  const hubGeo = keep(new THREE.CylinderGeometry(6, 6, DEPTH + 8, 20));
  hubGeo.rotateX(Math.PI / 2);
  hubGeo.translate(0, 0, (DEPTH + 8) / 2);
  const spinners = course.spinners.map((s) => {
    const g = new THREE.Group();
    g.position.set(tx(s.x), ty(s.y), 0);
    const armCount = s.arms === 2 ? 2 : 1;
    for (let a = 0; a < armCount; a++) {
      const bar = new THREE.Mesh(boxGeo, accentMat);
      bar.scale.set(s.len * 2, 9, 0.85);
      bar.rotation.z = (a * Math.PI) / 2;
      bar.castShadow = true;
      g.add(bar);
    }
    const hub = new THREE.Mesh(hubGeo, white);
    hub.castShadow = true;
    g.add(hub);
    scene.add(g);
    return { s, g };
  });

  // Schieber und Stempel: bewegte Balken
  const movers = [];
  for (const s of course.sliders) {
    const bar = new THREE.Mesh(boxGeo, white);
    bar.castShadow = true;
    scene.add(bar);
    movers.push({ o: s, bar });
  }
  const railMat = keep(new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.18 }));
  for (const p of course.pistons) {
    const guide = new THREE.Mesh(boxGeo, railMat);
    guide.scale.set(3, p.max - p.min + 12, 0.3);
    guide.position.set(tx(p.x), ty((p.min + p.max) / 2), 0);
    scene.add(guide);
    const bar = new THREE.Mesh(boxGeo, white);
    bar.castShadow = true;
    scene.add(bar);
    movers.push({ o: p, bar });
  }
  const placeMover = ({ o, bar }) => {
    const len = 2 * Math.sqrt(o.half * o.half + o.tilt * o.tilt);
    bar.scale.set(len, 10, 1);
    bar.position.set(tx(o.x), ty(o.y), 0);
    bar.rotation.z = Math.atan2(-o.tilt, o.half);
  };
  movers.forEach(placeMover);

  // Zonen: Honig als zäher Block, Wind als laufende Streifen auf der Wand
  const winds = [];
  for (const z of course.zones) {
    const h = z.y1 - z.y0;
    if (z.drag) {
      const honey = new THREE.Mesh(
        keep(new THREE.BoxGeometry(WORLD_W, h, DEPTH + 4)),
        keep(new THREE.MeshStandardMaterial({
          color: 0xd99614, transparent: true, opacity: 0.38, roughness: 0.2, depthWrite: false,
        })),
      );
      honey.position.set(0, ty(z.y0 + h / 2), (DEPTH + 4) / 2);
      honey.renderOrder = 2;
      scene.add(honey);
    } else {
      const tex = keep(windTexture());
      tex.repeat.set(WORLD_W / 256, h / 64);
      const wind = new THREE.Mesh(
        keep(new THREE.PlaneGeometry(WORLD_W, h)),
        keep(new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.55, depthWrite: false })),
      );
      wind.position.set(0, ty(z.y0 + h / 2), 1);
      scene.add(wind);
      winds.push({ tex, dir: z.ax > 0 ? 1 : -1 });
    }
  }

  // Ziellinie: Schachbrett auf der Wand plus Balken davor
  const finish = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(WORLD_W, 40)),
    keep(new THREE.MeshStandardMaterial({ map: keep(checkerTexture()), roughness: 0.8 })),
  );
  finish.position.set(0, ty(course.finishY + 20), 0.5);
  finish.receiveShadow = true;
  scene.add(finish);

  // Murmeln
  const marbleGeo = keep(marbleGeometry());
  const marbles = race.marbles.map((m, i) => {
    const color = opts.colors[i % opts.colors.length];
    const { tex, paint } = marbleTexture(players[i]?.name, color);
    keep(tex);
    loadAvatar(players[i]?.avatar, paint);
    const mat = keep(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.28, metalness: 0.15 }));
    const mesh = new THREE.Mesh(marbleGeo, mat);
    mesh.castShadow = true;
    mesh.position.set(tx(m.x), ty(m.y), DEPTH / 2);
    scene.add(mesh);
    return { mesh, lastX: m.x, spin: 0 };
  });

  // Namen und Countdown sind HTML über dem Canvas — gestochen scharf, ohne Textur pro Name
  const labels = [];
  const countdown = document.createElement('div');
  countdown.className = 'sts-m3-count';
  layer.appendChild(countdown);
  let lastCount = '';
  const v3 = new THREE.Vector3();

  return {
    /**
     * @param {{ cam:number, now:number, labelled:number[], countdown:number|null, accent:string }} f
     *   cam = obere Kante des Ausschnitts in Sim-Koordinaten (wie in 2D)
     */
    draw(f) {
      if (f.accent && f.accent !== accent) { accent = f.accent; paintAccent(); }

      const centerY = ty(f.cam + height / 2);
      camera.position.set(0, centerY + CAM_DIST * Math.sin(CAM_PITCH), CAM_DIST * Math.cos(CAM_PITCH));
      camera.lookAt(0, centerY, DEPTH / 2);
      sun.position.set(-260, centerY + 520, 900);
      sun.target.position.set(0, centerY, 0);

      for (const sp of spinners) sp.g.rotation.z = Math.atan2(-sp.s.uy, sp.s.ux);
      movers.forEach(placeMover);
      for (const w of winds) w.tex.offset.x = -((f.now * 0.0012 * w.dir) % 1);

      for (let i = 0; i < race.marbles.length; i++) {
        const m = race.marbles[i];
        const v = marbles[i];
        v.mesh.visible = !m.done;
        if (m.done) continue;
        // Rollen: Weg durch Radius = Drehwinkel, in der Bildebene
        v.spin -= (m.x - v.lastX) / MARBLE_R;
        v.lastX = m.x;
        v.mesh.position.set(tx(m.x), ty(m.y), DEPTH / 2);
        v.mesh.rotation.z = v.spin;
      }

      renderer.render(scene, camera);

      // Namen über den vordersten Murmeln
      while (labels.length < f.labelled.length) {
        const el = document.createElement('span');
        el.className = 'sts-m3-name';
        layer.appendChild(el);
        labels.push(el);
      }
      labels.forEach((el, k) => {
        const i = f.labelled[k];
        if (i === undefined) { el.style.display = 'none'; return; }
        const m = race.marbles[i];
        v3.set(tx(m.x), ty(m.y) + MARBLE_R + 6, DEPTH / 2 + MARBLE_R).project(camera);
        const x = Math.min(width - 50, Math.max(50, (v3.x + 1) * 0.5 * width));
        const y = (1 - v3.y) * 0.5 * height;
        el.style.display = '';
        el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
        const name = players[i]?.name || '';
        if (el.textContent !== name) el.textContent = name;
      });

      const c = f.countdown == null ? '' : String(f.countdown);
      if (c !== lastCount) { lastCount = c; countdown.textContent = c; }
    },

    dispose() {
      for (const el of labels) el.remove();
      countdown.remove();
      for (const d of disposables) d.dispose?.();
      for (const mesh of [segs, caps, pegs]) mesh.dispose();
      renderer.dispose();
    },
  };
}
