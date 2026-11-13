// introScene.js — der Anfang von Lights Out: ein dunkles Wohnzimmer, im Fernseher laufen die Nachrichten.
// Jonas wird vermisst, die Suche ist eingestellt. Danach geht es ins Auto (game.js).
//
// Das Zimmer steht weit abseits der Waldkarte in derselben Szene. Es braucht kein eigenes Licht: alle Flächen
// sind unbeleuchtete Materialien, deren Helligkeit hier gemalt ist (Lichtschein des Bildschirms auf Boden und
// Wand) und im Takt des Fernsehbilds flackert. So ändert sich die Zahl der Lichter in der Szene nicht — sonst
// müssten für die paar Sekunden alle Shader neu übersetzt werden — und das Mondlicht des Waldes fällt nicht
// ins Zimmer.
import * as THREE from 'three';

const W = 512;
const H = 384;

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

/** Fläche mit gemaltem Lichtschein: hell um (cx, cy), nach außen schwarz. pattern = Tapetenstreifen. */
function glowTexture(cx, cy, r, color, pattern = false) {
  const [c, x] = canvas(256, 256);
  x.fillStyle = '#020203';
  x.fillRect(0, 0, 256, 256);
  const g = x.createRadialGradient(cx, cy, 4, cx, cy, r);
  g.addColorStop(0, color);
  g.addColorStop(0.45, 'rgba(40,58,96,0.5)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 256, 256);
  if (pattern) {
    x.fillStyle = 'rgba(0,0,0,0.22)';
    for (let i = 0; i < 256; i += 16) x.fillRect(i, 0, 7, 256);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Passfoto aus der Fahndung: nur Kopf und Schultern als Schattenriss mit etwas Licht von links. */
function drawPortrait(x, px, py, pw, ph) {
  const g = x.createLinearGradient(px, py, px, py + ph);
  g.addColorStop(0, '#8b949c');
  g.addColorStop(1, '#5d666e');
  x.fillStyle = g;
  x.fillRect(px, py, pw, ph);
  const mx = px + pw / 2;
  // Schultern, Hals, Kopf, Haar
  x.fillStyle = '#23272c';
  x.beginPath();
  x.ellipse(mx, py + ph * 1.02, pw * 0.5, ph * 0.3, 0, Math.PI, Math.PI * 2);
  x.fill();
  x.fillStyle = '#9a8474';
  x.fillRect(mx - pw * 0.09, py + ph * 0.58, pw * 0.18, ph * 0.2);
  const face = x.createRadialGradient(mx - pw * 0.08, py + ph * 0.4, 4, mx, py + ph * 0.42, pw * 0.3);
  face.addColorStop(0, '#c9b09c');
  face.addColorStop(1, '#6e5a4e');
  x.fillStyle = face;
  x.beginPath();
  x.ellipse(mx, py + ph * 0.43, pw * 0.2, ph * 0.24, 0, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#1e1a18';
  x.beginPath();
  x.ellipse(mx, py + ph * 0.3, pw * 0.22, ph * 0.15, 0, Math.PI, Math.PI * 2);
  x.fill();
  x.fillRect(mx - pw * 0.22, py + ph * 0.28, pw * 0.07, ph * 0.12);
  // Augen, Mund: nur Schatten
  x.fillStyle = 'rgba(20,14,12,0.7)';
  x.fillRect(mx - pw * 0.13, py + ph * 0.4, pw * 0.09, ph * 0.025);
  x.fillRect(mx + pw * 0.04, py + ph * 0.4, pw * 0.09, ph * 0.025);
  x.fillRect(mx - pw * 0.06, py + ph * 0.54, pw * 0.12, ph * 0.015);
  x.strokeStyle = '#e8e8e8';
  x.lineWidth = 3;
  x.strokeRect(px, py, pw, ph);
}

/** Archivbild des Sanatoriums bei Nacht: langer Bau mit Mittelgiebel, vernagelte Fenster, Bäume. */
function drawSanatorium(x, px, py, pw, ph) {
  const sky = x.createLinearGradient(0, py, 0, py + ph);
  sky.addColorStop(0, '#0d1626');
  sky.addColorStop(1, '#27364a');
  x.fillStyle = sky;
  x.fillRect(px, py, pw, ph);
  const base = py + ph * 0.82;
  x.fillStyle = '#3d4450';
  x.fillRect(px + pw * 0.1, base - ph * 0.42, pw * 0.8, ph * 0.42);
  x.beginPath();
  x.moveTo(px + pw * 0.4, base - ph * 0.42);
  x.lineTo(px + pw * 0.5, base - ph * 0.62);
  x.lineTo(px + pw * 0.6, base - ph * 0.42);
  x.fill();
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 11; c++) {
      x.fillStyle = (r * 7 + c * 3) % 5 === 0 ? '#5a4a38' : '#11151c';
      x.fillRect(px + pw * (0.13 + c * 0.069), base - ph * (0.37 - r * 0.125), pw * 0.04, ph * 0.075);
    }
  }
  x.fillStyle = '#0a0d12';
  x.fillRect(px, base, pw, ph * 0.18);
  for (const [tx, th] of [[0.04, 0.6], [0.93, 0.7], [0.0, 0.45], [0.97, 0.5]]) {
    x.beginPath();
    x.moveTo(px + pw * tx - pw * 0.07, base);
    x.lineTo(px + pw * tx, base - ph * th);
    x.lineTo(px + pw * tx + pw * 0.07, base);
    x.fill();
  }
}

/**
 * @param {{ scene: THREE.Scene, keep: (x:any)=>any, at: number[] }} p  at = Ort des Zimmers in der Welt
 * @returns {{ group: THREE.Group, camera: (t:number, cam: THREE.Camera)=>void, update: (t:number, off:number)=>void }}
 *   update(t, off): t = Sekunden seit dem Einschalten, off = Sekunde, in der der Fernseher ausgeht
 */
export function buildTvRoom({ scene, keep, at }) {
  const group = new THREE.Group();
  group.position.set(at[0], at[1], at[2]);
  /** Alle Materialien, deren Helligkeit mit dem Bildschirm flackert: [Material, Grundfarbe] */
  const lit = [];
  const mat = (opts, base = 0xffffff) => {
    const m = keep(new THREE.MeshBasicMaterial({ ...opts, color: base, fog: false }));
    lit.push([m, new THREE.Color(base)]);
    return m;
  };
  const plane = (w, h, material, pos, rot) => {
    const m = new THREE.Mesh(keep(new THREE.PlaneGeometry(w, h)), material);
    m.position.set(...pos);
    m.rotation.set(...rot);
    group.add(m);
    return m;
  };
  // Zimmer: Boden, Rückwand mit Tapete, Seitenwände, Decke — der Schein des Bildschirms ist aufgemalt
  plane(6, 6, mat({ map: keep(glowTexture(128, 60, 150, 'rgba(120,150,210,0.75)')) }), [0, 0, 0.4], [-Math.PI / 2, 0, 0]);
  plane(6, 2.6, mat({ map: keep(glowTexture(128, 150, 170, 'rgba(96,124,186,0.6)', true)) }), [0, 1.3, -1.62], [0, 0, 0]);
  const side = mat({ map: keep(glowTexture(40, 170, 160, 'rgba(60,84,140,0.4)', true)) });
  plane(6, 2.6, side, [-3, 1.3, 0.4], [0, Math.PI / 2, 0]).scale.x = -1;
  plane(6, 2.6, side, [3, 1.3, 0.4], [0, -Math.PI / 2, 0]);
  plane(6, 6, keep(new THREE.MeshBasicMaterial({ color: 0x010102, fog: false })), [0, 2.6, 0.4], [Math.PI / 2, 0, 0]);
  // Möbel: Flächen zum Bildschirm hin heller, der Rest fast schwarz
  const dark = keep(new THREE.MeshBasicMaterial({ color: 0x050506, fog: false }));
  const top = mat({}, 0x1a2234);
  const box = (w, h, d, pos, topMat = top) => {
    const m = new THREE.Mesh(keep(new THREE.BoxGeometry(w, h, d)), [dark, dark, topMat, dark, dark, dark]);
    m.position.set(...pos);
    group.add(m);
    return m;
  };
  box(1.9, 0.5, 0.5, [0, 0.25, -1.33]);                    // Kommode
  box(0.84, 0.64, 0.5, [0, 0.82, -1.33], dark);            // Fernseher (Röhre)
  box(1.3, 0.42, 0.7, [0.15, 0.21, 0.35], mat({}, 0x263450)); // Couchtisch
  const mug = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.04, 0.035, 0.1, 12)), mat({}, 0x44506a));
  mug.position.set(-0.2, 0.47, 0.3);
  group.add(mug);
  const frame = box(0.26, 0.34, 0.03, [0.72, 0.67, -1.3], dark); // Bilderrahmen auf der Kommode
  frame.rotation.set(-0.12, -0.3, 0);
  const photo = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.2, 0.28)), mat({}, 0x2e3a52));
  photo.position.set(0, 0, 0.017);
  frame.add(photo);
  // Bildschirm
  const [cv, x] = canvas(W, H);
  const tex = keep(new THREE.CanvasTexture(cv));
  tex.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.66, 0.495)), keep(new THREE.MeshBasicMaterial({ map: tex, fog: false })));
  screen.position.set(0, 0.83, -1.078);
  group.add(screen);
  scene.add(group);

  const TICKER = '+++ Suche im Erlenwald eingestellt +++ Polizei bittet um Hinweise +++ Vermisster zuletzt am ehemaligen Sanatorium Erlengrund gesehen +++ Wagen am Tor gefunden ';
  let drawnAt = -1;
  /** Bildschirm malen: Rauschen beim Einschalten, dann drei Bilder der Meldung, am Ende fällt das Bild zusammen. */
  function draw(t, off) {
    x.fillStyle = '#05070c';
    x.fillRect(0, 0, W, H);
    if (t >= off) {
      // Röhre geht aus: das Bild schrumpft zu einem Strich, dann zu einem Punkt
      const k = Math.min(1, (t - off) / 0.28);
      if (k < 1) {
        x.fillStyle = '#dfe8ff';
        const h = Math.max(2, H * (1 - k) ** 3);
        const w = k < 0.6 ? W : W * (1 - (k - 0.6) / 0.4);
        x.fillRect((W - w) / 2, (H - h) / 2, w, h);
      }
      return k < 1 ? 0.5 * (1 - k) : 0;
    }
    if (t < 0.55) {
      const img = x.createImageData(W / 4, H / 4);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.random() * 255;
        img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
      }
      x.putImageData(img, 0, 0);
      x.imageSmoothingEnabled = false;
      x.drawImage(cv, 0, 0, W / 4, H / 4, 0, 0, W, H);
      return 0.9;
    }
    // Studiohintergrund
    const bg = x.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#12254a');
    bg.addColorStop(1, '#0a1226');
    x.fillStyle = bg;
    x.fillRect(0, 0, W, H);
    const slide = t < off * 0.36 ? 0 : t < off * 0.73 ? 1 : 2;
    x.textBaseline = 'middle';
    if (slide === 1) {
      drawSanatorium(x, 28, 54, 456, 214);
      x.fillStyle = 'rgba(0,0,0,0.6)';
      x.fillRect(28, 238, 456, 30);
      x.fillStyle = '#e6ebf5';
      x.font = '600 17px system-ui, sans-serif';
      x.textAlign = 'left';
      x.fillText('Sanatorium Erlengrund · geschlossen seit 1987', 40, 254);
    } else {
      drawPortrait(x, 36, 62, 150, 196);
      x.textAlign = 'left';
      x.fillStyle = '#ff5346';
      x.font = '800 40px system-ui, sans-serif';
      x.fillText(slide === 0 ? 'VERMISST' : 'SUCHE', 210, 92);
      if (slide === 2) x.fillText('EINGESTELLT', 210, 134);
      x.fillStyle = '#f2f5fb';
      x.font = '700 30px system-ui, sans-serif';
      x.fillText('Jonas Brandt', 210, slide === 0 ? 146 : 188);
      x.font = '500 20px system-ui, sans-serif';
      x.fillStyle = '#b9c6de';
      x.fillText('27 Jahre', 210, slide === 0 ? 180 : 220);
      x.fillText(slide === 0 ? 'seit drei Tagen ohne Spur' : 'nach drei Tagen ohne Spur', 210, slide === 0 ? 208 : 246);
    }
    // Senderlogo, Uhr, Laufband
    x.fillStyle = '#c8321e';
    x.fillRect(28, 20, 92, 26);
    x.fillStyle = '#fff';
    x.font = '800 16px system-ui, sans-serif';
    x.textAlign = 'center';
    x.fillText('REGIONAL', 74, 34);
    x.textAlign = 'right';
    x.font = '600 17px system-ui, sans-serif';
    x.fillStyle = '#d7deed';
    x.fillText('23:47', 484, 34);
    x.fillStyle = '#c8321e';
    x.fillRect(0, 290, W, 34);
    x.fillStyle = '#fff';
    x.font = '700 19px system-ui, sans-serif';
    x.textAlign = 'left';
    x.fillText('EILMELDUNG', 14, 308);
    x.fillStyle = '#0c1220';
    x.fillRect(0, 324, W, 34);
    x.fillStyle = '#e6ebf5';
    x.font = '500 18px system-ui, sans-serif';
    const tw = x.measureText(TICKER).width;
    const shift = (t * 70) % tw;
    x.fillText(TICKER + TICKER, 10 - shift, 342);
    // Zeilen der Röhre und ein durchlaufender heller Balken
    x.fillStyle = 'rgba(0,0,0,0.28)';
    for (let y = 0; y < H; y += 3) x.fillRect(0, y, W, 1);
    x.fillStyle = 'rgba(255,255,255,0.05)';
    x.fillRect(0, (t * 90) % (H + 60) - 60, W, 60);
    // Helligkeit des Bilds bestimmt den Lichtschein im Zimmer
    return (slide === 1 ? 0.62 : 0.8) + Math.sin(t * 31) * 0.03 + (Math.random() < 0.08 ? -0.12 : 0);
  }

  // Einmal vorab alle drei Bilder malen: der Browser lädt Schriften erst beim ersten Zeichnen, das gäbe sonst
  // einen kurzen Hänger genau beim Umschalten vom Rauschen auf die Meldung
  for (const t of [1, 7, 11]) draw(t, 14);
  draw(0, 14);
  const look = new THREE.Vector3();
  return {
    group,
    /** Kamera im Sessel: schaut auf den Fernseher und rückt ganz langsam näher. */
    camera(t, cam) {
      const k = Math.min(1, t / 14);
      cam.position.set(at[0] + 0.2 - k * 0.1, at[1] + 0.98, at[2] + 0.3 - k * 0.45);
      look.set(at[0], at[1] + 0.86, at[2] - 1.08);
      cam.lookAt(look);
      cam.rotation.z += Math.sin(t * 0.7) * 0.004;
    },
    update(t, off) {
      // ~12 Bilder je Sekunde reichen für Laufband und Flimmern
      if (Math.abs(t - drawnAt) < 0.08 && t < off) return;
      drawnAt = t;
      const glow = draw(t, off);
      tex.needsUpdate = true;
      for (const [m, base] of lit) m.color.copy(base).multiplyScalar(glow);
    },
  };
}
