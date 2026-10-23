// Clash-Royale-Look für die 3D-Szenen — alles im Code erzeugt, keine Downloads (Start ohne
// Ladezeit). Die Regeln stammen aus dem 2D-Look der Seite (index.css, .cr-arcade-*):
//   • satte, gemalte Flächenfarben mit hellem Schein oben und dunklerem Fuß
//   • dunkelbraune Kontur (--cr-arcade-ink #2b1c10) um klobige Formen
//   • weiche, abgerundete Kanten statt Fotostruktur
import * as THREE from 'three';
import { rng } from './kit';

export const CR_INK = 0x2b1c10;

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function tex(c, rx = 1, ry = rx) {
  const t = new THREE.CanvasTexture(c);
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = 16; // wird auf das Gerätemaximum begrenzt
  return t;
}

/** Gemalte Grashalme/Tupfer (kurze, helle und dunkle Striche) — wie die Arena-Wiese. */
function grassStrokes(ctx, x0, y0, w, h, rand, n, light, dark) {
  ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const x = x0 + rand() * w, y = y0 + rand() * h, l = 3 + rand() * 5;
    ctx.strokeStyle = rand() < 0.55 ? light : dark;
    ctx.lineWidth = 1.6 + rand() * 1.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rand() - 0.5) * 3, y - l);
    ctx.stroke();
  }
}

/**
 * Arena-Rasen: Schachbrett aus zwei Grüntönen (2×2 Felder je Kachel), weiche Ränder je Feld,
 * gemalte Halme. Eine Wiederholung = 2 Felder.
 */
export function checkerGrassTexture(rx = 1, ry = rx) {
  const S = 256, F = S / 2;
  const c = canvas(S);
  const ctx = c.getContext('2d');
  const rand = rng(41);
  const A = ['#86c84a', '#78bb3f'];
  for (let r = 0; r < 2; r++) {
    for (let k = 0; k < 2; k++) {
      const x = k * F, y = r * F;
      ctx.fillStyle = A[(r + k) % 2];
      ctx.fillRect(x, y, F, F);
      // weicher Schein oben links je Feld (gemalter Look)
      const g = ctx.createLinearGradient(x, y, x + F, y + F);
      g.addColorStop(0, 'rgba(255,255,210,0.10)');
      g.addColorStop(1, 'rgba(20,60,0,0.10)');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, F, F);
      // Halme dezent: kräftige, feine Striche flimmern bei flachem Blick in der Ferne
      grassStrokes(ctx, x + 4, y + 8, F - 8, F - 10, rand, 30, 'rgba(180,235,120,0.32)', 'rgba(60,120,30,0.26)');
    }
  }
  return tex(c, rx, ry);
}

/**
 * Klobige Steinmauer (Ufer, Sockel): unregelmäßige, abgerundete Steine mit heller Oberkante,
 * dunkler Fuge und brauner Kontur. Eine Wiederholung ≈ 4 Steine breit, 2 hoch.
 */
export function chunkyStoneTexture(rx = 1, ry = rx, palette = ['#b9b2a4', '#a9a294', '#c6bfb0']) {
  const W = 512, H = 256;
  const c = canvas(W, H);
  const ctx = c.getContext('2d');
  const rand = rng(77);
  ctx.fillStyle = '#4b3f33';
  ctx.fillRect(0, 0, W, H);
  const rows = 2, rh = H / rows;
  for (let r = 0; r < rows; r++) {
    // Steinbreiten je Reihe ergeben zusammen GENAU die Texturbreite — vorher lief die Reihe mit
    // zufälligen Breiten über den Rand, und das umgebrochene Stück lag über dem ersten Stein
    // (sichtbar als überlappende Steine am Kachelrand)
    const raw = Array.from({ length: 4 }, () => 100 + rand() * 50);
    const sum = raw.reduce((a, b) => a + b, 0);
    const widths = raw.map((v) => (v / sum) * W);
    let x = r % 2 ? 64 : 0; // versetzte Fugen; Stein über den rechten Rand wird links fortgesetzt
    for (const w of widths) {
      const y = r * rh;
      const pad = 5, rad = 22;
      const col = palette[Math.floor(rand() * palette.length)];
      const draw = (dx) => {
        const sx = x + dx + pad, sy = y + pad, sw = w - pad * 2, sh = rh - pad * 2;
        ctx.beginPath();
        ctx.roundRect(sx, sy, sw, sh, rad);
        ctx.fillStyle = col;
        ctx.fill();
        // heller Schein oben, Schatten unten (wie die Arcade-Knöpfe)
        const g = ctx.createLinearGradient(0, sy, 0, sy + sh);
        g.addColorStop(0, 'rgba(255,255,255,0.32)');
        g.addColorStop(0.35, 'rgba(255,255,255,0.0)');
        g.addColorStop(1, 'rgba(40,25,10,0.30)');
        ctx.fillStyle = g;
        ctx.fill();
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(43,28,16,0.85)';
        ctx.stroke();
        // Kerben
        ctx.strokeStyle = 'rgba(60,45,30,0.35)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        const cx = sx + sw * (0.3 + rand() * 0.4), cy = sy + sh * (0.3 + rand() * 0.4);
        ctx.moveTo(cx, cy); ctx.lineTo(cx + 10 + rand() * 12, cy + 4 + rand() * 8);
        ctx.stroke();
      };
      draw(0);
      if (x + w > W) draw(-W); // nahtlos kacheln
      x += w;
    }
  }
  return tex(c, rx, ry);
}

/** Holzplanken (Brücken, Flöße, Stege): warme Bretter mit Maserung, Nägeln und Kontur. */
export function plankTexture(rx = 1, ry = rx, base = ['#c98a4b', '#b97a3e', '#d39657']) {
  const W = 256, H = 256;
  const c = canvas(W, H);
  const ctx = c.getContext('2d');
  const rand = rng(9);
  const n = 4, bh = H / n;
  for (let i = 0; i < n; i++) {
    const y = i * bh;
    ctx.fillStyle = base[i % base.length];
    ctx.fillRect(0, y, W, bh);
    const g = ctx.createLinearGradient(0, y, 0, y + bh);
    g.addColorStop(0, 'rgba(255,240,200,0.28)');
    g.addColorStop(0.3, 'rgba(255,240,200,0)');
    g.addColorStop(1, 'rgba(60,30,10,0.35)');
    ctx.fillStyle = g;
    ctx.fillRect(0, y, W, bh);
    // Maserung
    ctx.strokeStyle = 'rgba(90,50,20,0.3)';
    ctx.lineWidth = 2;
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      const yy = y + 12 + rand() * (bh - 24);
      ctx.moveTo(0, yy);
      for (let x = 0; x <= W; x += 32) ctx.lineTo(x, yy + Math.sin(x / 30 + k) * 3);
      ctx.stroke();
    }
    // Fuge
    ctx.fillStyle = 'rgba(43,28,16,0.9)';
    ctx.fillRect(0, y + bh - 4, W, 4);
    // Nägel
    ctx.fillStyle = 'rgba(60,40,25,0.8)';
    [18, W - 18].forEach((x) => { ctx.beginPath(); ctx.arc(x, y + bh / 2, 3.5, 0, Math.PI * 2); ctx.fill(); });
  }
  return tex(c, rx, ry);
}

/**
 * Dunkle Kontur um ein Objekt (umgedrehte Hülle): Rückseiten leicht aufgeblasen in Tintenfarbe.
 * Für klobige Formen mit glatten Normalen (abgerundete Quader, Kugeln). Liefert das Kontur-Mesh.
 */
const outlineMats = new Map();
export function addOutline(mesh, thickness = 0.03, color = CR_INK) {
  const key = `${color}|${thickness}`;
  if (!outlineMats.has(key)) {
    outlineMats.set(key, new THREE.ShaderMaterial({
      // fog:true verlangt die Nebel-Uniforms im Material (sonst Fehler beim Zeichnen)
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uColor: { value: new THREE.Color(color) }, uThick: { value: thickness } }]),
      vertexShader: /* glsl */`
        uniform float uThick;
        #include <common>
        #include <fog_pars_vertex>
        void main() {
          vec4 local = vec4(position + normalize(normal) * uThick, 1.0);
          // InstancedMesh (scatter): ohne das landeten alle Umrisse übereinander im Ursprung
          #ifdef USE_INSTANCING
            local = instanceMatrix * local;
          #endif
          vec4 mvPosition = modelViewMatrix * local;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uColor;
        #include <common>
        #include <fog_pars_fragment>
        void main() {
          gl_FragColor = vec4(uColor, 1.0);
          #include <fog_fragment>
        }`,
      side: THREE.BackSide,
      fog: true,
    }));
  }
  const o = new THREE.Mesh(mesh.geometry, outlineMats.get(key));
  o.userData.sharedGeometry = true;
  o.raycast = () => {};
  mesh.add(o);
  return o;
}

/** Busch/Baumkrone im Arena-Stil: Haufen weicher Kugeln, oben hell, unten dunkel (Vertexfarben). */
export function bushGeometry(seed = 1, lobes = 5, top = '#8fd04f', bottom = '#3f8a2a') {
  const rand = rng(seed);
  const parts = [];
  for (let i = 0; i < lobes; i++) {
    const r = 0.45 + rand() * 0.3;
    const g = new THREE.IcosahedronGeometry(r, 3);
    const a = (i / lobes) * Math.PI * 2 + rand();
    const d = i === 0 ? 0 : 0.35 + rand() * 0.25;
    g.translate(Math.cos(a) * d, r * 0.9 + (i === 0 ? 0.25 : rand() * 0.3), Math.sin(a) * d);
    parts.push(g);
  }
  // zusammenführen (ohne BufferGeometryUtils-Abhängigkeit: einfach Positionen/Normalen anhängen)
  let count = 0;
  parts.forEach((p) => { count += p.attributes.position.count; });
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), col = new Float32Array(count * 3);
  const cTop = new THREE.Color(top), cBot = new THREE.Color(bottom), cv = new THREE.Color();
  let o = 0, maxY = 0;
  parts.forEach((p) => { const a = p.attributes.position; for (let i = 0; i < a.count; i++) maxY = Math.max(maxY, a.getY(i)); });
  parts.forEach((p) => {
    const a = p.attributes.position, n = p.attributes.normal;
    for (let i = 0; i < a.count; i++) {
      pos[o * 3] = a.getX(i); pos[o * 3 + 1] = a.getY(i); pos[o * 3 + 2] = a.getZ(i);
      nor[o * 3] = n.getX(i); nor[o * 3 + 1] = n.getY(i); nor[o * 3 + 2] = n.getZ(i);
      // Höhe + Ausrichtung zur Sonne: gemalter Verlauf
      const t = Math.min(1, Math.max(0, a.getY(i) / maxY * 0.75 + n.getY(i) * 0.35));
      cv.copy(cBot).lerp(cTop, t);
      col[o * 3] = cv.r; col[o * 3 + 1] = cv.g; col[o * 3 + 2] = cv.b;
      o++;
    }
    p.dispose();
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** Weicher Himmel im Arena-Stil: hellblau oben, fast weiß am Horizont (ohne Download). */
export function crSkyMaterial({ top = 0x2a73eb, horizon = 0xc8e4ff } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { uTop: { value: new THREE.Color(top) }, uHor: { value: new THREE.Color(horizon) } },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() { vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: /* glsl */`
      uniform vec3 uTop; uniform vec3 uHor;
      varying vec3 vDir;
      void main() {
        float h = normalize(vDir).y;
        vec3 top = uTop, hor = uHor;
        vec3 col = mix(hor, top, pow(smoothstep(-0.05, 0.6, h), 0.8));
        // weiche Wolkenbänder
        float cl = smoothstep(0.55, 0.9, sin(vDir.x * 9.0 + sin(vDir.z * 7.0) * 1.5) * 0.5 + 0.5) * smoothstep(0.05, 0.25, h) * (1.0 - smoothstep(0.3, 0.6, h));
        col = mix(col, vec3(1.0), cl * 0.55);
        gl_FragColor = vec4(col, 1.0);
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
}

/** Krone (gemalt) — für Wand-Embleme und Teppichmuster. */
function crown(ctx, x, y, s, fill, stroke) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(-s, s * 0.45);
  ctx.lineTo(-s, -s * 0.25);
  ctx.lineTo(-s * 0.5, s * 0.1);
  ctx.lineTo(0, -s * 0.55);
  ctx.lineTo(s * 0.5, s * 0.1);
  ctx.lineTo(s, -s * 0.25);
  ctx.lineTo(s, s * 0.45);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = s * 0.14;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = stroke;
  ctx.stroke();
  [-s, 0, s].forEach((cx, i) => {
    ctx.beginPath();
    ctx.arc(cx, i === 1 ? -s * 0.62 : -s * 0.32, s * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });
  ctx.restore();
}

/**
 * Königsblaue Saalwand: gemalter Putz mit weichen Pinselbahnen, oben heller, dazu versetzte
 * goldene Kronen-Embleme. Eine Wiederholung = 2 Embleme breit. (Ersetzt die verzerrte Rautentapete.)
 */
export function royalWallTexture(rx = 1, ry = rx) {
  const S = 512;
  const c = canvas(S);
  const ctx = c.getContext('2d');
  const rand = rng(23);
  ctx.fillStyle = '#2a63c9';
  ctx.fillRect(0, 0, S, S);
  // Pinselbahnen
  // kurze, runde Pinseltupfer (lange Bahnen wirkten auf den Wänden wie verzerrt)
  for (let i = 0; i < 260; i++) {
    const y = rand() * S, x = rand() * S, r = 8 + rand() * 22;
    ctx.fillStyle = rand() < 0.5 ? 'rgba(120,175,255,0.07)' : 'rgba(10,30,90,0.08)';
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.4, r, rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  // senkrechte Zierstreifen (dunkel/hell) wie Paneele
  [0, S / 2].forEach((x) => {
    ctx.fillStyle = 'rgba(8,25,80,0.35)';
    ctx.fillRect(x, 0, 6, S);
    ctx.fillStyle = 'rgba(160,200,255,0.18)';
    ctx.fillRect(x + 6, 0, 3, S);
  });
  // Embleme: Rautenschild mit Krone, versetzt
  [[S / 4, S / 4], [S * 3 / 4, S * 3 / 4]].forEach(([x, y]) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.moveTo(0, -70); ctx.lineTo(56, 0); ctx.lineTo(0, 70); ctx.lineTo(-56, 0); ctx.closePath();
    ctx.fillStyle = '#1d4ea8';
    ctx.fill();
    ctx.lineWidth = 7;
    ctx.strokeStyle = '#f2b632';
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(43,28,16,0.8)';
    ctx.stroke();
    ctx.restore();
    crown(ctx, x, y + 6, 26, '#f6c445', '#7a4a10');
  });
  return tex(c, rx, ry);
}

/**
 * Blaues Rautenmuster wie der Menü-Hintergrund (.cr-arcade-bg / assets/clashRoyale/bg/diamond-tile.svg):
 * gleiche Kachel — Mittel-Raute hell, Eck-Dreiecke dunkel, Prägerand oben hell, unten dunkel.
 * Kanten etwas kräftiger als im SVG, damit das Muster auf Abstand im 3D noch lesbar bleibt.
 * Eine Wiederholung = eine Kachel (zwei Rauten breit). Nur quadratisch kacheln (rx/ry zur
 * Flächengröße passend), sonst verzerren die Rauten.
 */
export function diamondWallTexture(rx = 1, ry = rx) {
  const S = 512, k = S / 140; // Koordinaten aus dem 140er-SVG übernommen
  const c = canvas(S);
  const ctx = c.getContext('2d');
  const P = (x, y) => [x * k, y * k];
  const poly = (pts) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(...P(x, y)) : ctx.moveTo(...P(x, y)))); };
  const line = (pts, color) => { poly(pts); ctx.strokeStyle = color; ctx.lineWidth = 3 * k; ctx.lineCap = 'butt'; ctx.stroke(); };
  ctx.fillStyle = '#154c82';
  ctx.fillRect(0, 0, S, S);
  poly([[70, 0], [140, 70], [70, 140], [0, 70]]);
  ctx.closePath();
  ctx.fillStyle = '#1c5b96';
  ctx.fill();
  // Prägerand der Mittel-Raute
  line([[3.5, 70], [70, 3.5], [136.5, 70]], 'rgba(255,255,255,0.16)');
  line([[136.5, 70], [70, 136.5], [3.5, 70]], 'rgba(0,0,0,0.22)');
  // Prägerand der Rauten zwischen den Kacheln (liegt in den Eck-Dreiecken)
  line([[0, 66.5], [66.5, 0]], 'rgba(0,0,0,0.22)');
  line([[73.5, 0], [140, 66.5]], 'rgba(0,0,0,0.22)');
  line([[140, 73.5], [73.5, 140]], 'rgba(255,255,255,0.12)');
  line([[0, 73.5], [66.5, 140]], 'rgba(255,255,255,0.12)');
  // Fuge nur um die Mittel-Raute — zeichnet beide Rautensorten nach, ohne Kachelrand
  poly([[70, 0], [140, 70], [70, 140], [0, 70]]);
  ctx.closePath();
  ctx.lineJoin = 'round';
  ctx.lineWidth = 1.6 * k;
  ctx.strokeStyle = 'rgba(4,20,48,0.45)';
  ctx.stroke();
  return tex(c, rx, ry);
}

/** Roter Teppich mit Goldborte (Länge in v-Richtung). */
export function carpetTexture(rx = 1, ry = rx) {
  const W = 256, H = 512;
  const c = canvas(W, H);
  const ctx = c.getContext('2d');
  const rand = rng(5);
  ctx.fillStyle = '#c4262e';
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 2200; i++) {
    ctx.fillStyle = rand() < 0.5 ? 'rgba(255,120,120,0.08)' : 'rgba(80,0,10,0.10)';
    ctx.fillRect(rand() * W, rand() * H, 2, 2);
  }
  // Goldborte + dunkle Kontur
  [[0, 22], [W - 22, 22]].forEach(([x, w]) => {
    ctx.fillStyle = '#e8aa2e'; ctx.fillRect(x, 0, w, H);
    ctx.fillStyle = 'rgba(43,28,16,0.8)'; ctx.fillRect(x === 0 ? w : x - 4, 0, 4, H);
  });
  // Kronenmuster in der Mitte
  for (let y = 64; y < H; y += 128) crown(ctx, W / 2, y, 22, 'rgba(240,180,50,0.55)', 'rgba(110,20,20,0.5)');
  return tex(c, rx, ry);
}
