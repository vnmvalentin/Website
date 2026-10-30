// 3D-Ansicht für Blobby Volley.
//
// Reine Darstellung: Es wird derselbe Weltzustand gezeichnet, den auch render.js bekommt
// (`worldRef` aus BlobbyRoom.jsx). Physik und Netzcode bleiben 2D — die Blobs bewegen sich
// weiter nur auf der Linie z = 0. Die dritte Achse ist Kulisse, kein Spielraum. Dadurch
// fühlt sich das Spiel exakt gleich an und der Server muss nichts davon wissen.
//
// Einheiten: 1 = 1 Physik-Pixel. Physik-y zeigt nach unten (Boden bei GROUND_Y), hier zeigt
// y nach oben (Boden bei 0). Die Feldmitte (der Pfeiler) liegt bei x = 0.
//
// Gespiegelt wird über die Kamera: Wer rechts spielt, schaut von der anderen Seite auf
// das Feld (z < 0). Damit steht man selbst links im Bild, genau wie in 2D, und die
// Tastenumkehr in BlobbyRoom.jsx passt ohne Änderung.
import * as THREE from "three";
import {
  GROUND_Y, BALL_RADIUS, NET_RADIUS,
  BLOBBY_UPPER_SPHERE, BLOBBY_UPPER_RADIUS, BLOBBY_LOWER_SPHERE, BLOBBY_LOWER_RADIUS,
  POWERUP_RADIUS, POWERUP_TYPES, teamOf,
} from "./physics";
import { SLOT_COLOR, POWERUP_COLOR, drawGlyph } from "./render";

const COURT_HALF_DEPTH = 240;   // nur Optik: so tief ist das Feld nach vorn und hinten
const TAU = Math.PI * 2;

const toY = (physY) => GROUND_Y - physY;

// ── Texturen ────────────────────────────────────────────────────────────────

export function canvasTexture(w, h, paint, { repeat = null, srgb = true } = {}) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  paint(c.getContext("2d"), w, h);
  const tex = new THREE.CanvasTexture(c);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat[0], repeat[1]);
  }
  tex.anisotropy = 4;
  return tex;
}

export function skyTexture() {
  return canvasTexture(4, 256, (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#123f6d");
    sky.addColorStop(0.45, "#2d78ab");
    sky.addColorStop(0.8, "#79b6d1");
    sky.addColorStop(1, "#cfe8ec");
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
  });
}

export function sandTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = "#e3bd83";
    g.fillRect(0, 0, w, h);
    // Körnung aus einem festen Hash — kein Math.random, damit jeder dasselbe sieht
    for (let i = 0; i < 2400; i++) {
      const x = Math.abs((Math.sin(i * 12.9898) * 43758.5453) % 1) * w;
      const y = Math.abs((Math.sin(i * 78.233) * 12345.6789) % 1) * h;
      const dark = i % 3 !== 0;
      g.fillStyle = dark ? "rgba(120, 82, 40, 0.16)" : "rgba(255, 240, 210, 0.35)";
      g.fillRect(x, y, 2, 2);
    }
  }, { repeat: [24, 24] });
}

export function seaTexture() {
  return canvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = "#147aa6";
    g.fillRect(0, 0, w, h);
    g.lineCap = "round";
    for (let i = 0; i < 70; i++) {
      const x = Math.abs((Math.sin(i * 3.17) * 9134.21) % 1) * w;
      const y = Math.abs((Math.sin(i * 7.91) * 4711.13) % 1) * h;
      const len = 20 + (i % 5) * 9;
      g.strokeStyle = "rgba(225, 248, 255, 0.28)";
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + len / 2, y - 4, x + len, y);
      g.stroke();
    }
  }, { repeat: [10, 4] });
}

// Netzmaschen: Linien auf transparentem Grund. Die Textur wiederholt sich, damit die
// Maschen bei hohem und tiefem Pfeiler (Powerups) gleich groß bleiben.
export function netTexture() {
  return canvasTexture(64, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = "rgba(30, 30, 44, 0.85)";
    g.lineWidth = 3;
    g.strokeRect(0, 0, w, h);
  }, { repeat: [1, 1] });
}

// Kontaktschatten: weicher dunkler Fleck. Wichtigster Tiefenhinweis — ohne ihn kann man
// in 3D kaum abschätzen, wo der Ball landet.
export function shadowTexture() {
  return canvasTexture(128, 128, (g, w, h) => {
    const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    r.addColorStop(0, "rgba(40, 24, 8, 0.55)");
    r.addColorStop(0.6, "rgba(40, 24, 8, 0.3)");
    r.addColorStop(1, "rgba(40, 24, 8, 0)");
    g.fillStyle = r;
    g.fillRect(0, 0, w, h);
  }, { srgb: false });
}

// Volleyball als Kugelabwicklung: drei Farbbahnen, die sich als Wellen um die Kugel legen
export function ballTexture() {
  return canvasTexture(512, 256, (g, w, h) => {
    const colors = ["#f7f7f1", "#1f62bd", "#f2c22e", "#f7f7f1", "#1f62bd", "#f2c22e"];
    const band = w / colors.length;
    for (let i = 0; i < colors.length; i++) {
      g.fillStyle = colors[i];
      g.beginPath();
      g.moveTo(i * band, 0);
      for (let y = 0; y <= h; y += 8) g.lineTo(i * band + Math.sin((y / h) * Math.PI * 2) * band * 0.35, y);
      g.lineTo((i + 1) * band + Math.sin(Math.PI * 2) * band * 0.35, h);
      for (let y = h; y >= 0; y -= 8) g.lineTo((i + 1) * band + Math.sin((y / h) * Math.PI * 2) * band * 0.35, y);
      g.closePath();
      g.fill();
    }
    g.strokeStyle = "rgba(40, 40, 48, 0.55)";
    g.lineWidth = 3;
    for (let i = 0; i <= colors.length; i++) {
      g.beginPath();
      for (let y = 0; y <= h; y += 8) {
        const x = i * band + Math.sin((y / h) * Math.PI * 2) * band * 0.35;
        if (y === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
    }
  });
}

export function labelTexture(text) {
  const font = "bold 34px system-ui, sans-serif";
  const probe = document.createElement("canvas").getContext("2d");
  probe.font = font;
  const w = Math.ceil(probe.measureText(text).width) + 24;
  const tex = canvasTexture(w, 48, (g) => {
    g.font = font;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineWidth = 7;
    g.strokeStyle = "rgba(0, 0, 0, 0.65)";
    g.strokeText(text, w / 2, 25);
    g.fillStyle = "rgba(255, 255, 255, 0.95)";
    g.fillText(text, w / 2, 25);
  });
  return { tex, w, h: 48 };
}

export function powerupTexture(type) {
  const color = POWERUP_COLOR[type] || "#38bdf8";
  return canvasTexture(128, 128, (g, w, h) => {
    const r = 54;
    g.translate(w / 2, h / 2);
    g.fillStyle = color;
    g.beginPath();
    g.arc(0, 0, r, 0, TAU);
    g.fill();
    g.strokeStyle = "rgba(255, 255, 255, 0.9)";
    g.lineWidth = 5;
    g.beginPath();
    g.arc(0, 0, r - 3, 0, TAU);
    g.stroke();
    drawGlyph(g, type, r);
  });
}

// ── Formen ──────────────────────────────────────────────────────────────────

// Umriss eines Blobs als Drehkörper: konvexe Hülle der beiden Kugeln aus physics.js —
// dieselbe Form, gegen die der Ball prallt, nur einmal um die Hochachse gedreht.
export function blobGeometry() {
  const dist = BLOBBY_LOWER_SPHERE + BLOBBY_UPPER_SPHERE;
  const alpha = Math.asin((BLOBBY_LOWER_RADIUS - BLOBBY_UPPER_RADIUS) / dist);
  const lowerY = -BLOBBY_LOWER_SPHERE;
  const upperY = BLOBBY_UPPER_SPHERE;
  const pts = [];
  const N = 16;
  for (let i = 0; i <= N; i++) {
    const a = -Math.PI / 2 + (alpha + Math.PI / 2) * (i / N);
    pts.push(new THREE.Vector2(Math.max(0, Math.cos(a) * BLOBBY_LOWER_RADIUS), lowerY + Math.sin(a) * BLOBBY_LOWER_RADIUS));
  }
  for (let i = 1; i <= N; i++) {
    const a = alpha + (Math.PI / 2 - alpha) * (i / N);
    pts.push(new THREE.Vector2(Math.max(0, Math.cos(a) * BLOBBY_UPPER_RADIUS), upperY + Math.sin(a) * BLOBBY_UPPER_RADIUS));
  }
  return new THREE.LatheGeometry(pts, 40);
}

export function makePalm(own, mats, h, lean, yaw) {
  const group = new THREE.Group();
  const top = new THREE.Vector3(lean * h * 0.26, h, 0);
  const curve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(lean * h * 0.04, h * 0.55, 0),
    top,
  );
  const trunk = new THREE.Mesh(own(new THREE.TubeGeometry(curve, 12, h * 0.045, 7, false)), mats.trunk);
  group.add(trunk);
  const frond = own(new THREE.ConeGeometry(h * 0.07, h * 0.5, 4, 1));
  frond.translate(0, h * 0.25, 0);
  for (let i = 0; i < 8; i++) {
    const leaf = new THREE.Mesh(frond, i % 2 ? mats.leafDark : mats.leaf);
    leaf.position.copy(top);
    leaf.rotation.order = "YZX";
    leaf.rotation.y = (i / 8) * TAU;
    leaf.rotation.z = 1.25 + (i % 2) * 0.2;
    leaf.scale.set(1, 1, 0.25);
    group.add(leaf);
  }
  group.rotation.y = yaw;
  return group;
}

// ── Aufbau ──────────────────────────────────────────────────────────────────

/**
 * Baut die Szene auf `canvas`. Gibt null zurück, wenn der Browser kein WebGL kann —
 * der Aufrufer bleibt dann bei der 2D-Ansicht.
 */
export function createBlobby3D(canvas, { width }) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  } catch {
    return null;
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const disposables = [];
  const own = (x) => { disposables.push(x); return x; };
  const half = width / 2;

  const scene = new THREE.Scene();
  scene.background = own(skyTexture());
  scene.fog = new THREE.Fog(0xbfe0ea, 2200, 7000);

  const camera = new THREE.PerspectiveCamera(46, 4 / 3, 10, 12000);

  scene.add(new THREE.HemisphereLight(0xd6ecff, 0xd8b078, 1.6));
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
  sun.position.set(-900, 1400, 900);
  scene.add(sun);

  // Boden, Meer, Kulisse
  const sand = new THREE.Mesh(
    own(new THREE.PlaneGeometry(9000, 6000)),
    own(new THREE.MeshLambertMaterial({ map: own(sandTexture()) })),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.z = 1400;
  scene.add(sand);

  const sea = new THREE.Mesh(
    own(new THREE.PlaneGeometry(14000, 6000)),
    own(new THREE.MeshLambertMaterial({ map: own(seaTexture()), color: 0xbfe9ff })),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 1, -4600);
  scene.add(sea);
  // Schaumkante zwischen Strand und Meer — fest an beiden Seiten, also nur hier einmal
  const foam = new THREE.Mesh(
    own(new THREE.PlaneGeometry(14000, 50)),
    own(new THREE.MeshBasicMaterial({ color: 0xeefcff })),
  );
  foam.rotation.x = -Math.PI / 2;
  foam.position.set(0, 1.5, -1600);
  scene.add(foam);

  // Spielfeldlinien: Außenkanten = die unsichtbaren Wände der Physik
  const lineMat = own(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }));
  const lineGeoX = own(new THREE.PlaneGeometry(width, 6));
  const lineGeoZ = own(new THREE.PlaneGeometry(6, COURT_HALF_DEPTH * 2));
  for (const z of [-COURT_HALF_DEPTH, COURT_HALF_DEPTH]) {
    const l = new THREE.Mesh(lineGeoX, lineMat);
    l.rotation.x = -Math.PI / 2;
    l.position.set(0, 0.8, z);
    scene.add(l);
  }
  for (const x of [-half, half]) {
    const l = new THREE.Mesh(lineGeoZ, lineMat);
    l.rotation.x = -Math.PI / 2;
    l.position.set(x, 0.8, 0);
    scene.add(l);
  }

  const palmMats = {
    trunk: own(new THREE.MeshLambertMaterial({ color: 0x6d4a2f })),
    leaf: own(new THREE.MeshLambertMaterial({ color: 0x2f9155 })),
    leafDark: own(new THREE.MeshLambertMaterial({ color: 0x1f6b41 })),
  };
  const palms = [
    [-half - 330, -330, 300, 1, 0.4], [half + 340, -360, 320, -1, -0.3],
    [-half - 900, -1250, 260, -1, 1.2], [half + 950, -1300, 280, 1, 2.1],
    [-half - 620, 180, 340, 1, -0.8], [half + 640, 220, 300, -1, 0.6],
  ];
  for (const [x, z, h, lean, yaw] of palms) {
    const p = makePalm(own, palmMats, h, lean, yaw);
    p.position.set(x, 0, z);
    scene.add(p);
  }

  // Pfeiler + Netz. Die Höhe ändert sich mit den Powerups, deshalb wird nur skaliert.
  const pillarMat = own(new THREE.MeshStandardMaterial({ color: 0xe8e8f1, roughness: 0.6 }));
  const pillar = new THREE.Mesh(own(new THREE.CylinderGeometry(NET_RADIUS, NET_RADIUS, 1, 20)), pillarMat);
  scene.add(pillar);
  const cap = new THREE.Mesh(
    own(new THREE.SphereGeometry(NET_RADIUS, 20, 12, 0, TAU, 0, Math.PI / 2)),
    own(new THREE.MeshStandardMaterial({ color: 0x5a6478, roughness: 0.5 })),
  );
  scene.add(cap);
  const netTex = own(netTexture());
  const net = new THREE.Mesh(
    own(new THREE.PlaneGeometry(1, 1)),
    own(new THREE.MeshBasicMaterial({ map: netTex, transparent: true, side: THREE.DoubleSide, depthWrite: false })),
  );
  net.rotation.y = Math.PI / 2;
  scene.add(net);
  const band = new THREE.Mesh(
    own(new THREE.BoxGeometry(4, 9, COURT_HALF_DEPTH * 2)),
    own(new THREE.MeshLambertMaterial({ color: 0xffffff })),
  );
  scene.add(band);
  const postGeo = own(new THREE.CylinderGeometry(6, 6, 1, 10));
  const postMat = own(new THREE.MeshStandardMaterial({ color: 0x9d9db2, roughness: 0.5 }));
  const posts = [-1, 1].map((side) => {
    const p = new THREE.Mesh(postGeo, postMat);
    p.userData.z = side * COURT_HALF_DEPTH;
    scene.add(p);
    return p;
  });

  // Schatten
  const shadowMat = own(new THREE.MeshBasicMaterial({ map: own(shadowTexture()), transparent: true, depthWrite: false }));
  const shadowGeo = own(new THREE.PlaneGeometry(1, 1));
  const makeShadow = () => {
    const s = new THREE.Mesh(shadowGeo, shadowMat);
    s.rotation.x = -Math.PI / 2;
    s.renderOrder = 1;
    scene.add(s);
    return s;
  };

  // Blobs
  const blobGeo = own(blobGeometry());
  const eyeGeo = own(new THREE.SphereGeometry(7.5, 16, 12));
  const pupilGeo = own(new THREE.SphereGeometry(3.8, 12, 8));
  const eyeMat = own(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25 }));
  const pupilMat = own(new THREE.MeshBasicMaterial({ color: 0x15151c }));
  const blobs = {};
  for (const slot of [1, 2, 3, 4]) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(blobGeo, own(new THREE.MeshStandardMaterial({
      color: SLOT_COLOR[slot].hex, roughness: 0.32, metalness: 0,
    })));
    group.add(body);
    const eyes = [-1, 1].map((side) => {
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      // Auf der Vorderseite (lokal +x schaut zum Ball), leicht seitlich versetzt
      eye.position.set(BLOBBY_UPPER_RADIUS * 0.72, BLOBBY_UPPER_SPHERE + 2, side * 10);
      const pupil = new THREE.Mesh(pupilGeo, pupilMat);
      group.add(eye, pupil);
      return { eye, pupil };
    });
    group.visible = false;
    scene.add(group);
    blobs[slot] = { group, eyes, shadow: makeShadow(), yaw: 0, label: null, labelText: "" };
  }

  // Ball
  const ball = new THREE.Mesh(
    own(new THREE.SphereGeometry(BALL_RADIUS, 32, 20)),
    own(new THREE.MeshStandardMaterial({ map: own(ballTexture()), roughness: 0.45 })),
  );
  scene.add(ball);
  const ballShadow = makeShadow();

  // Powerup: Kugel in seiner Farbe + Sinnbild als Schild, das immer zur Kamera schaut
  const powerupTex = Object.fromEntries(POWERUP_TYPES.map((t) => [t, own(powerupTexture(t))]));
  const powerupMat = own(new THREE.SpriteMaterial({ map: powerupTex.speed }));
  const powerup = new THREE.Sprite(powerupMat);
  powerup.scale.set(POWERUP_RADIUS * 2.4, POWERUP_RADIUS * 2.4, 1);
  scene.add(powerup);

  // Kamera folgt dem eigenen Blob nur gedämpft: ein voll mitlaufendes Bild macht in
  // einem schnellen Ballspiel schnell schwindelig.
  const cam = { x: 0, init: false };
  const tmp = new THREE.Vector3();
  const look = new THREE.Vector3();

  function setLabel(b, text) {
    if (b.labelText === text) return;
    b.labelText = text;
    if (b.label) {
      b.group.remove(b.label);
      b.label.material.map.dispose();
      b.label.material.dispose();
      b.label = null;
    }
    if (!text) return;
    const { tex, w, h } = labelTexture(text);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
    sprite.scale.set(w * 0.5, h * 0.5, 1);
    sprite.position.set(0, BLOBBY_UPPER_SPHERE + BLOBBY_UPPER_RADIUS + 24, 0);
    sprite.renderOrder = 5;
    b.group.add(sprite);
    b.label = sprite;
  }

  function render(w, { slots, names, mySlot, mirror, dt }) {
    const k = 1 - Math.exp(-(dt || 16) / 220);
    const active = new Set(slots);

    for (const slot of [1, 2, 3, 4]) {
      const b = blobs[slot];
      const src = w.blobs[slot];
      const on = active.has(slot) && !!src;
      b.group.visible = on;
      b.shadow.visible = on;
      if (!on) continue;
      const scale = src.scale || 1;
      const x = src.x - half;
      const y = toY(src.y);
      b.group.position.set(x, y, 0);
      b.group.scale.setScalar(scale);

      // Zum Ball drehen: Vorderseite (lokal +x) zeigt auf den Ball, gedämpft, damit der
      // Blob beim Ballwechsel über seinem Kopf nicht hin und her zuckt.
      const dx = w.ball.x - src.x;
      const target = dx >= 0 ? 0 : Math.PI;
      let diff = target - b.yaw;
      while (diff > Math.PI) diff -= TAU;
      while (diff < -Math.PI) diff += TAU;
      b.yaw += diff * Math.min(1, k * 1.6);
      b.group.rotation.y = b.yaw;

      // Pupillen schauen zum Ball
      b.group.updateMatrixWorld();
      look.set(w.ball.x - half, toY(w.ball.y), 0);
      b.group.worldToLocal(look);
      for (const { eye, pupil } of b.eyes) {
        tmp.copy(look).sub(eye.position).normalize().multiplyScalar(5.2);
        pupil.position.copy(eye.position).add(tmp);
      }

      // Schatten schrumpft mit der Sprunghöhe
      const air = Math.max(0, y - BLOBBY_LOWER_SPHERE * scale - BLOBBY_LOWER_RADIUS * scale);
      const s = Math.max(0.35, 1 - air / 420);
      b.shadow.position.set(x, 0.9, 0);
      b.shadow.scale.set(BLOBBY_LOWER_RADIUS * 2.6 * scale * s, BLOBBY_LOWER_RADIUS * 1.6 * scale * s, 1);

      setLabel(b, names?.[slot] || "");
    }

    // Ball: Drehung um die Tiefenachse, wie in 2D
    const bx = w.ball.x - half;
    const by = toY(w.ball.y);
    ball.position.set(bx, by, 0);
    ball.rotation.z = -w.rot;
    const ballAir = Math.max(0, by - BALL_RADIUS);
    const bs = Math.max(0.3, 1 - ballAir / 900);
    ballShadow.position.set(bx, 1, 0);
    ballShadow.scale.set(BALL_RADIUS * 2.4 * bs, BALL_RADIUS * 1.8 * bs, 1);

    // Pfeiler und Netz auf die aktuelle Höhe bringen
    const top = toY(w.netTop);
    const nx = w.netX - half;
    pillar.scale.y = top;
    pillar.position.set(nx, top / 2, 0);
    cap.position.set(nx, top, 0);
    net.scale.set(COURT_HALF_DEPTH * 2, top, 1);
    net.position.set(nx, top / 2, 0);
    netTex.repeat.set((COURT_HALF_DEPTH * 2) / 24, top / 24);
    band.position.set(nx, top - 4, 0);
    for (const p of posts) {
      p.scale.y = top + 10;
      p.position.set(nx, (top + 10) / 2, p.userData.z);
    }

    if (w.powerup) {
      const type = POWERUP_TYPES[w.powerup.t] || "speed";
      if (powerupMat.map !== powerupTex[type]) {
        powerupMat.map = powerupTex[type];
        powerupMat.needsUpdate = true;
      }
      powerup.visible = true;
      powerup.position.set(w.powerup.x - half, toY(w.powerup.y + Math.sin(w.bob) * 6), 0);
    } else {
      powerup.visible = false;
    }

    // ── Kamera ────────────────────────────────────────────────────────────
    // Schräg hinter der eigenen Feldhälfte, gedämpft dem eigenen Blob nach. Zuschauer
    // sehen das Feld mittig von vorn.
    const me = mySlot ? w.blobs[mySlot] : null;
    const side = mySlot ? (teamOf(mySlot) === 1 ? -1 : 1) : 0;
    const zs = mirror ? -1 : 1;
    // Abstand aus dem waagrechten Blickwinkel: so weit weg, dass das ganze Feld plus etwas
    // Rand in die Breite passt. 2 gegen 2 ist breiter, hat aber auch das breitere Bild.
    const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
    const dist = (half * 1.2) / tanH + 120;
    let goalX = 0;
    if (me && side) {
      const myX = me.x - half;
      // Basis: draußen auf der eigenen Seite; der Blob schiebt nur ein Drittel nach
      goalX = side * half * 0.8 + (myX - side * half * 0.5) * 0.35;
    }
    if (!cam.init) { cam.x = goalX; cam.init = true; }
    cam.x += (goalX - cam.x) * k;
    camera.position.set(cam.x, side ? 310 : 330, zs * dist);
    camera.lookAt(side ? cam.x * 0.18 : 0, 235, 0);

    renderer.render(scene, camera);
  }

  function setSize(cssW, cssH, dpr) {
    renderer.setPixelRatio(Math.min(2, dpr || 1));
    renderer.setSize(cssW, cssH, true);
    camera.aspect = cssW / Math.max(1, cssH);
    camera.updateProjectionMatrix();
  }

  function dispose() {
    for (const b of Object.values(blobs)) setLabel(b, "");
    for (const d of disposables) d.dispose?.();
    renderer.dispose();
  }

  return { render, setSize, dispose };
}
