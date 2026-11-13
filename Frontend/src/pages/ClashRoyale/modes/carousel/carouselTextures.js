// Prozedurale Texturen für das 3D-Jahrmarkt-Karussell (carousel/Carousel3D.jsx) — auf einem
// Canvas gemalt wie in Labyrinth, Pyramide und Fluss: kein Download, fester Zufallsstart.
import * as THREE from 'three';

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let x = s;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function speckle(ctx, w, h, rand, amount, alpha) {
  for (let i = 0; i < amount; i++) {
    const v = rand() < 0.5 ? 0 : 255;
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha * rand()})`;
    ctx.fillRect(rand() * w, rand() * h, 1 + rand() * 2, 1 + rand() * 2);
  }
}

function toTexture(c, { repeat = false } = {}) {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

/**
 * Plattform von oben: Segmente aus strahlenförmigen Brettern (je Segment mehrere Bretter mit
 * versetzten Stoßfugen, Maserung längs, Nägel), dunkle Fugen, rot-goldener Rand und ein Ring um
 * die Säule. Gemalt wie die Holzflächen in der Arena — vorher liefen feine Ringe quer über die
 * ganze Scheibe und wirkten aus der Nähe verwaschen und gestreckt. `platR` (Meter) hält die
 * Brettbreite überall gleich.
 */
export function platformTexture(segments = 16, platR = 8) {
  const size = 2048;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const rand = rng(3);
  const m = size / 2;
  const pxPerM = m / platR;
  const rim = 0.42 * pxPerM;                 // roter Rand
  const hub = Math.max(0.7, platR * 0.12) * pxPerM; // Ring um die Säule
  // Gedeckte Töne: die Plattform ist Hintergrund, die Tische davor sollen heller wirken
  const TONES = [['#b98c5e', '#a77a4e'], ['#a97c50', '#966b43']];
  ctx.fillStyle = '#3a2412';
  ctx.fillRect(0, 0, size, size);
  const wedgePath = (a0, a1, r0, r1) => {
    ctx.beginPath();
    ctx.arc(m, m, r1, a0, a1);
    ctx.arc(m, m, r0, a1, a0, true);
    ctx.closePath();
  };
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2, a1 = ((i + 1) / segments) * Math.PI * 2;
    // Bretter je Segment: außen etwa 0,75 m breit (schmaler wirkte unruhig)
    const boards = Math.max(2, Math.round(((a1 - a0) * (m - rim)) / (0.75 * pxPerM)));
    for (let b = 0; b < boards; b++) {
      const b0 = a0 + ((a1 - a0) * b) / boards, b1 = a0 + ((a1 - a0) * (b + 1)) / boards;
      // Stoßfugen versetzt: Brett in 2–3 Stücke entlang des Radius
      const cuts = [hub, hub + (m - rim - hub) * (0.3 + rand() * 0.25), m - rim];
      if (rand() < 0.5) cuts.splice(2, 0, cuts[1] + (m - rim - cuts[1]) * (0.4 + rand() * 0.3));
      for (let k = 0; k < cuts.length - 1; k++) {
        const [light, dark] = TONES[(i + b + k) % 2];
        wedgePath(b0, b1, cuts[k], cuts[k + 1]);
        const mid = (b0 + b1) / 2;
        const g = ctx.createLinearGradient(
          m + Math.cos(mid) * cuts[k], m + Math.sin(mid) * cuts[k],
          m + Math.cos(mid) * cuts[k + 1], m + Math.sin(mid) * cuts[k + 1],
        );
        g.addColorStop(0, dark);
        g.addColorStop(0.5, light);
        g.addColorStop(1, dark);
        ctx.fillStyle = g;
        ctx.fill();
        // Maserung längs des Bretts (leicht gewellt)
        ctx.save();
        ctx.clip();
        ctx.strokeStyle = 'rgba(96,56,22,0.18)';
        for (let s = 0; s < 3; s++) {
          const a = b0 + (b1 - b0) * (0.15 + rand() * 0.7);
          ctx.lineWidth = 1.5 + rand() * 2;
          ctx.beginPath();
          for (let r = cuts[k]; r <= cuts[k + 1]; r += 24) {
            const aa = a + Math.sin(r / 60 + s * 2) * 0.004;
            const x = m + Math.cos(aa) * r, y = m + Math.sin(aa) * r;
            if (r === cuts[k]) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
        ctx.restore();
        // Fuge um jedes Brettstück + zwei Nägel an der Stoßkante
        wedgePath(b0, b1, cuts[k], cuts[k + 1]);
        ctx.strokeStyle = 'rgba(43,28,16,0.7)';
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    }
    // Segmentgrenze kräftiger
    ctx.strokeStyle = 'rgba(43,28,16,0.95)';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(m + Math.cos(a0) * hub, m + Math.sin(a0) * hub);
    ctx.lineTo(m + Math.cos(a0) * (m - rim), m + Math.sin(a0) * (m - rim));
    ctx.stroke();
  }
  // Ring um die Säule: Rot mit Goldkanten
  const ring = (r0, r1, fill) => {
    ctx.beginPath();
    ctx.arc(m, m, r1, 0, Math.PI * 2);
    ctx.arc(m, m, r0, 0, Math.PI * 2, true);
    ctx.fillStyle = fill;
    ctx.fill();
  };
  ring(0, hub, '#b3242b');
  ring(hub - 14, hub, '#f2c14e');
  ring(hub * 0.55, hub * 0.55 + 10, '#f2c14e');
  // Rand: rotes Band mit Goldkanten und Kontur
  ring(m - rim, m, '#b3242b');
  ring(m - rim, m - rim + 12, '#f2c14e');
  ring(m - 12, m, '#f2c14e');
  ctx.strokeStyle = 'rgba(43,28,16,0.9)';
  ctx.lineWidth = 4;
  [m - rim, m - rim + 12, hub].forEach((r) => { ctx.beginPath(); ctx.arc(m, m, r, 0, Math.PI * 2); ctx.stroke(); });
  const tex = toTexture(c);
  tex.anisotropy = 16;
  return tex;
}

/** Senkrechte Streifen fürs Zeltdach (Kegel-UV läuft einmal herum → Streifen strahlenförmig). */
export function stripeTexture(colors = ['#d8303a', '#fff4e0', '#2f6fd6', '#fff4e0'], bands = 16) {
  const w = 512, h = 64;
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  for (let i = 0; i < bands; i++) {
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect((i / bands) * w, 0, w / bands + 1, h);
  }
  return toTexture(c);
}

/**
 * Spielfilz auf den Tischen: tiefes Nachtblau (dunkler als die blau-goldenen Kartensockel, die
 * darauf liegen), leises Rautenmuster, Randschatten und goldene Zierlinie.
 */
export function feltTexture(aspect = 1.4) {
  const w = 512, h = Math.round(512 / Math.min(3, Math.max(0.4, aspect)));
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#132a5e';
  ctx.fillRect(0, 0, w, h);
  const D = 64;
  for (let y = -D; y < h + D; y += D / 2) {
    const row = Math.round(y / (D / 2));
    for (let x = -D + (row % 2 ? D / 2 : 0); x < w + D; x += D) {
      ctx.beginPath();
      ctx.moveTo(x, y - D / 2 + 2); ctx.lineTo(x + D / 2 - 2, y); ctx.lineTo(x, y + D / 2 - 2); ctx.lineTo(x - D / 2 + 2, y);
      ctx.closePath();
      ctx.fillStyle = 'rgba(80,130,230,0.08)';
      ctx.fill();
    }
  }
  const edge = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
  edge.addColorStop(0, 'rgba(0,0,0,0)');
  edge.addColorStop(1, 'rgba(0,4,20,0.45)');
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(242,193,78,0.9)';
  ctx.lineWidth = 3;
  ctx.strokeRect(12, 12, w - 24, h - 24);
  return toTexture(c);
}

/** Holz für Tischkanten und Beine. */
export function woodTexture() {
  const size = 256;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const rand = rng(29);
  ctx.fillStyle = '#8a5a2f';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(55,30,10,0.3)';
  for (let k = 0; k < 26; k++) {
    const y0 = rand() * size;
    ctx.lineWidth = 1 + rand() * 2;
    ctx.beginPath();
    ctx.moveTo(0, y0);
    for (let x = 0; x <= size; x += 16) ctx.lineTo(x, y0 + Math.sin(x / 30 + k) * 2.5);
    ctx.stroke();
  }
  speckle(ctx, size, size, rand, 2500, 0.08);
  return toTexture(c, { repeat: true });
}

/** Festplatz-Boden: heller Sand mit Kieseln und Fußspuren-Flecken. */
export function groundTexture() {
  const size = 256;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const rand = rng(53);
  ctx.fillStyle = '#d8c08c';
  ctx.fillRect(0, 0, size, size);
  speckle(ctx, size, size, rand, 7000, 0.12);
  for (let i = 0; i < 40; i++) {
    const v = 150 + Math.round(rand() * 70);
    ctx.fillStyle = `rgba(${v},${Math.round(v * 0.9)},${Math.round(v * 0.75)},0.8)`;
    ctx.beginPath();
    ctx.ellipse(rand() * size, rand() * size, 2 + rand() * 4, 1.5 + rand() * 3, rand() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  return toTexture(c, { repeat: true });
}

/** Kopfsteinpflaster für den Weg rund ums Karussell. */
export function cobbleTexture() {
  const size = 256;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const rand = rng(61);
  ctx.fillStyle = '#6f675c';
  ctx.fillRect(0, 0, size, size);
  const cell = 32;
  for (let y = 0; y < size; y += cell) {
    const off = (y / cell) % 2 ? cell / 2 : 0;
    for (let x = -cell; x < size + cell; x += cell) {
      const v = 150 + Math.round(rand() * 50);
      ctx.fillStyle = `rgb(${v},${Math.round(v * 0.95)},${Math.round(v * 0.88)})`;
      ctx.beginPath();
      ctx.roundRect(x + off + 2, y + 2, cell - 4, cell - 4, 8);
      ctx.fill();
    }
  }
  speckle(ctx, size, size, rand, 4000, 0.1);
  return toTexture(c, { repeat: true });
}

/** Grüner Haken im Kreis — schwebt über dem Namensschild, sobald jemand gewählt hat. */
export function checkTexture() {
  const size = 128;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0b2a12';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#22c55e';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 14;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(34, 66);
  ctx.lineTo(55, 87);
  ctx.lineTo(94, 44);
  ctx.stroke();
  return toTexture(c);
}
