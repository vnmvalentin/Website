// Farb-Raten (/clash/farbe): aus jedem Kartenbild EINE Farbe herauslösen — samt ihrer Schatten und Glanzlichter.
//
//   cd Backend && npm run cr:card-colors            alle Karten aus cardFarben.json bauen
//   npm run cr:card-colors -- knight archers        nur diese Karten
//   npm run cr:card-colors -- --vorschau <ordner>   zusätzlich Prüfbilder (Original, umgefärbt, entfärbt) dorthin
//   npm run cr:card-colors -- --kandidaten <id>     Farbfamilien einer Karte auflisten (für einen neuen Eintrag)
//
// Ergebnis je Karte:
//   Frontend/public/media/cr-farben/<id>.webp   Originalpixel der Farbfläche, Alpha = Zugehörigkeit (285×420, verlustfrei)
//   Frontend/src/pages/ClashRoyale/data/cardColors.json   { id: [r, g, b] } — die gesuchte Grundfarbe
//
// Warum das klappt, wo Lasso und Farbschwelle gescheitert sind (September 2026): Es wird keine FLÄCHE abgegrenzt,
// sondern eine FARBFAMILIE. Jedes Pixel wird in OKLab auf seine Farbart (a/L, b/L) reduziert — die bleibt gleich,
// wenn dieselbe Farbe heller oder dunkler beleuchtet ist. Ein k-means über die Farbarten findet die Familien der
// Karte (Haare, Haut, Himmel …); die Maske einer Familie ist weich („wie eindeutig gehört das Pixel zu ihr?“) und
// zieht am Rand Kantenpixel und Glanzlichter gleichen Farbtons nach. Umgefärbt wird im Spiel je Pixel relativ zur
// Grundfarbe (Farbton drehen, Sättigung skalieren, Helligkeit stückweise linear) — trifft man die Grundfarbe
// exakt, steht wieder das Originalbild da. Dieselbe Rechnung steckt in clash/colorMath.js (recolor) — beide
// Stellen gemeinsam ändern.
//
// Nicht jede Karte hat eine sauber lösbare Farbe (Haut neben orangefarbenem Bart, graue Rüstungen): welche Karte
// mit welcher Farbe mitspielt, steht handverlesen in cardFarben.json — pick = ungefähre Grundfarbe der Familie,
// optional grow/tol (weiterer Saum in px / Farbton-Toleranz in Grad) und add (weitere Familien dazunehmen).
// Neue Karte: --kandidaten ansehen, Eintrag ergänzen, mit --vorschau prüfen (das entfärbte Bild darf keine
// Farbreste zeigen, das umgefärbte keine Nachbarflächen mitnehmen).
//
// sharp kommt aus dem Frontend (dort Entwicklungs-Abhängigkeit), die Kartenbilder aus cardIconUrls.json.
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const sharp = require(path.join(ROOT, 'Frontend', 'node_modules', 'sharp'));
const URLS = require(path.join(ROOT, 'Frontend', 'src', 'pages', 'ClashRoyale', 'data', 'cardIconUrls.json'));
const PICKS = require('./cardFarben.json');
const OUT_IMG = path.join(ROOT, 'Frontend', 'public', 'media', 'cr-farben');
const OUT_JSON = path.join(ROOT, 'Frontend', 'src', 'pages', 'ClashRoyale', 'data', 'cardColors.json');
const CACHE = path.join(os.tmpdir(), 'cr-card-farben');

// Seltenheit je Karte aus data/cards.js (ESM, deshalb per Muster gelesen) — bestimmt den Artwork-Bereich
const RARITY = Object.fromEntries(
  [...fs.readFileSync(path.join(ROOT, 'Frontend', 'src', 'pages', 'ClashRoyale', 'data', 'cards.js'), 'utf8')
    .matchAll(/id:\s*'([^']+)',\s*name:\s*'[^']+',\s*rarity:\s*'(\w+)'/g)].map((m) => [m[1], m[2]]),
);
// Artwork innerhalb des Rahmens (ohne Rahmen und ohne den gelben Stein der Champions)
const ART_BOX = {
  Legendary: { x: 28, y: 72, w: 229, h: 306 },
  Champion: { x: 28, y: 92, w: 229, h: 285 },
};

async function cardFile(id) {
  const file = path.join(CACHE, `${id}.png`);
  if (fs.existsSync(file)) return file;
  const url = URLS[id]?.base;
  if (!url) throw new Error(`Keine Bild-Adresse für „${id}“ in cardIconUrls.json`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Bild für „${id}“ nicht ladbar (HTTP ${res.status})`);
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return file;
}

const W = 285, H = 420;
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const LIN = Float32Array.from({ length: 256 }, (_, i) => lin(i));
const gam = (c) => { c = c <= 0 ? 0 : c >= 1 ? 1 : c; return Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)); };
function toLab(r, g, b) {
  r = LIN[r]; g = LIN[g]; b = LIN[b];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
function toRgb(L, a, b) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [gam(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), gam(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), gam(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)];
}
/** Umfärben: Zielfarbe T → Wunschfarbe G, Schattierung je Pixel bleibt (identisch, wenn G = T) */
function recolor(L, a, b, T, G) {
  // Helligkeit stückweise linear durch (0,0), (T.L, G.L), (1,1): Schatten bleiben anteilig, Lichter laufen nicht aus
  const tl = Math.min(0.97, Math.max(0.03, T.L));
  const L2 = L <= tl ? L * (G.L / tl) : 1 - (1 - L) * ((1 - G.L) / (1 - tl));
  const k = G.C / Math.max(T.C, 1e-4);
  const th = G.h - T.h, cs = Math.cos(th), sn = Math.sin(th);
  return [L2, k * (a * cs - b * sn), k * (a * sn + b * cs)];
}
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

function mulberry(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const BOX = { x: 14 + 9, y: 66 + 9, w: 257 - 18, h: 322 - 18 }; // normale Karte: Rahmen 14/66 257×322, 9 px Rand ab

async function analyse(id, opts = {}) {
  const { data } = await sharp(await cardFile(id)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const n = W * H;
  const L = new Float32Array(n), A = new Float32Array(n), B = new Float32Array(n), FA = new Float32Array(n), FB = new Float32Array(n);
  const inBox = new Uint8Array(n);
  const box = ART_BOX[RARITY[id]] || BOX;
  const idx = [];
  for (let y = box.y; y < box.y + box.h; y++) for (let x = box.x; x < box.x + box.w; x++) {
    const i = y * W + x;
    if (data[i * 4 + 3] < 250) continue;
    const [l, a, b] = toLab(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
    L[i] = l; A[i] = a; B[i] = b; inBox[i] = 1;
    // Farbart unabhängig von der Helligkeit (Schatten = gleiche Farbart, kleineres L)
    const d = Math.max(l, 0.12);
    FA[i] = a / d; FB[i] = b / d;
    const C = Math.hypot(a, b);
    if (C > 0.035 && l > 0.2) idx.push(i);
  }
  const boxArea = box.w * box.h;
  // k-means auf (FA, FB)
  const K = 9, rand = mulberry(12345);
  let cen = [];
  cen.push(idx[Math.floor(rand() * idx.length)]);
  const dmin = new Float32Array(idx.length).fill(1e9);
  while (cen.length < K) {
    const c = cen[cen.length - 1]; let sum = 0;
    for (let j = 0; j < idx.length; j++) { const i = idx[j]; const d = (FA[i] - FA[c]) ** 2 + (FB[i] - FB[c]) ** 2; if (d < dmin[j]) dmin[j] = d; sum += dmin[j]; }
    let r = rand() * sum, pick = 0;
    for (let j = 0; j < idx.length; j++) { r -= dmin[j]; if (r <= 0) { pick = j; break; } }
    cen.push(idx[pick]);
  }
  let cs = cen.map((i) => [FA[i], FB[i]]);
  const asg = new Int8Array(idx.length);
  for (let it = 0; it < 25; it++) {
    const acc = cs.map(() => [0, 0, 0]);
    for (let j = 0; j < idx.length; j++) {
      const i = idx[j]; let best = 0, bd = 1e9;
      for (let c = 0; c < cs.length; c++) { const d = (FA[i] - cs[c][0]) ** 2 + (FB[i] - cs[c][1]) ** 2; if (d < bd) { bd = d; best = c; } }
      asg[j] = best; acc[best][0] += FA[i]; acc[best][1] += FB[i]; acc[best][2]++;
    }
    cs = cs.map((c, k) => (acc[k][2] ? [acc[k][0] / acc[k][2], acc[k][1] / acc[k][2]] : c));
  }
  // zu ähnliche Zentren zusammenlegen (gleiches Material, nur in Licht/Schatten geteilt)
  let groups = cs.map((c, k) => ({ a: c[0], b: c[1], n: 0, members: [k] }));
  for (let j = 0; j < idx.length; j++) groups[asg[j]].n++;
  groups = groups.filter((g) => g.n > 0);
  const hueOf = (g) => Math.atan2(g.b, g.a), satOf = (g) => Math.hypot(g.a, g.b);
  const angd = (x, y) => { let d = Math.abs(x - y) % (2 * Math.PI); return d > Math.PI ? 2 * Math.PI - d : d; };
  for (let merged = true; merged;) {
    merged = false;
    outer: for (let p = 0; p < groups.length; p++) for (let q = p + 1; q < groups.length; q++) {
      const g = groups[p], h = groups[q];
      const dh = angd(hueOf(g), hueOf(h)) * 180 / Math.PI, sr = Math.max(satOf(g), satOf(h)) / Math.max(1e-3, Math.min(satOf(g), satOf(h)));
      if (dh < (opts.mergeHue ?? 14) && sr < (opts.mergeSat ?? 1.45)) {
        const t = g.n + h.n;
        groups[p] = { a: (g.a * g.n + h.a * h.n) / t, b: (g.b * g.n + h.b * h.n) / t, n: t, members: [...g.members, ...h.members] };
        groups.splice(q, 1); merged = true; break outer;
      }
    }
  }
  return { id, data, L, A, B, FA, FB, inBox, idx, groups, boxArea, box, hueOf, satOf };
}

/** Weiche Maske (0..1) einer Gruppe: wie eindeutig gehört das Pixel zu ihr statt zur nächstbesten */
function maskOf(an, gi, opts = {}) {
  const { L, A, B, FA, FB, inBox, groups } = an;
  const n = W * H, g = groups[gi];
  let m = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (!inBox[i]) continue;
    const C = Math.hypot(A[i], B[i]);
    let d1 = 1e9;
    const dg = Math.hypot(FA[i] - g.a, FB[i] - g.b);
    for (let k = 0; k < groups.length; k++) if (k !== gi) { const d = Math.hypot(FA[i] - groups[k].a, FB[i] - groups[k].b); if (d < d1) d1 = d; }
    // Grau als eigener „Nachbar“: Abstand zum Nullpunkt
    d1 = Math.min(d1, Math.hypot(FA[i], FB[i]) * 1.6);
    const share = d1 / (d1 + dg + 1e-6); // 1 = klar meine Gruppe
    m[i] = smooth(0.46, 0.6, share) * smooth(0.02, 0.045, C) * smooth(0.12, 0.22, L[i]);
  }
  // 3×3-Median gegen Einzelpixel, dann kleine Inseln entfernen, dann leicht weichzeichnen
  const med = new Float32Array(n), win = new Float32Array(9);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    let k = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) win[k++] = m[(y + dy) * W + x + dx];
    win.sort(); med[y * W + x] = win[4];
  }
  m = med;
  const seen = new Uint8Array(n), stack = [];
  for (let s = 0; s < n; s++) {
    if (seen[s] || m[s] < 0.5) continue;
    const comp = []; stack.push(s); seen[s] = 1;
    while (stack.length) { const i = stack.pop(); comp.push(i); for (const j of [i - 1, i + 1, i - W, i + W]) if (j >= 0 && j < n && !seen[j] && m[j] >= 0.5) { seen[j] = 1; stack.push(j); } }
    if (comp.length < 40) for (const i of comp) m[i] = 0;
  }
  // Rand nachziehen: Kantenpixel (Mischfarbe mit dem Nachbarn), Glanzlichter und tiefe Schatten haben denselben
  // Farbton, aber eine andere Sättigung — bis GROW px vom Kern mitnehmen, mit der Entfernung ausblendend
  const GROW = opts.grow ?? 4, TOL = (opts.tol ?? 30) * Math.PI / 180;
  const gh = Math.atan2(g.b, g.a);
  const FADE = opts.grow === undefined; // kurzer Standard-Saum blendet aus, ein bewusst weiter Saum (Karten-Option) nicht
  let front = [];
  const dist = new Int16Array(n).fill(-1);
  for (let i = 0; i < n; i++) if (m[i] >= 0.5) dist[i] = 0;
  for (let i = 0; i < n; i++) if (dist[i] === 0) front.push(i);
  for (let r = 1; r <= GROW; r++) {
    const next = [];
    for (const i of front) for (const j of [i - 1, i + 1, i - W, i + W]) {
      if (j < 0 || j >= n || dist[j] !== -1 || !inBox[j]) continue;
      const C = Math.hypot(A[j], B[j]);
      let dh = Math.abs(Math.atan2(B[j], A[j]) - gh) % (2 * Math.PI); if (dh > Math.PI) dh = 2 * Math.PI - dh;
      const v = (1 - smooth(TOL * 0.6, TOL, dh)) * smooth(0.012, 0.03, C) * (FADE ? 1 - (r - 1) / (GROW + 1) : 1);
      if (v < 0.25) continue;
      dist[j] = r; if (v > m[j]) m[j] = v; next.push(j);
    }
    front = next;
  }
  // Reste aufsammeln: kleine Stellen gleichen Farbtons, die an die Fläche grenzen, aber knapp einer anderen Familie
  // zugeschlagen wurden (Schattenkanten, Glanzlichter, Haarspitzen) — daran ließ sich die Farbe sonst ablesen.
  // Nur zusammenhängende Stücke, die klein im Vergleich zur Fläche sind und an ihr anliegen; große Nachbarflächen
  // ähnlichen Farbtons (Haut neben Haar) bleiben draußen. Sättigung relativ zur Familie hält Grau/Blasses fern.
  const RT = (opts.restTol ?? 32) * Math.PI / 180;
  const gsat = Math.hypot(g.a, g.b), minSat = gsat * (opts.restSat ?? 0.55);
  const restVal = new Float32Array(n);
  let core = 0;
  for (let i = 0; i < n; i++) if (m[i] >= 0.5) core++;
  for (let i = 0; i < n; i++) {
    if (!inBox[i] || m[i] >= 0.5) continue;
    const C = Math.hypot(A[i], B[i]);
    if (C < 0.025 || C / Math.max(L[i], 0.12) < minSat) continue;
    let dh = Math.abs(Math.atan2(B[i], A[i]) - gh) % (2 * Math.PI); if (dh > Math.PI) dh = 2 * Math.PI - dh;
    restVal[i] = 1 - smooth(RT * 0.7, RT, dh);
  }
  const maxRest = Math.max(80, core * (opts.restMax ?? 0.2));
  const seenR = new Uint8Array(n);
  for (let s = 0; s < n; s++) {
    if (seenR[s] || restVal[s] < 0.25) continue;
    const comp = []; let contact = 0, close = 0; stack.push(s); seenR[s] = 1;
    while (stack.length) {
      const i = stack.pop(); comp.push(i);
      if (restVal[i] > 0.99) close++;
      let touches = false;
      for (const j of [i - 1, i + 1, i - W, i + W]) {
        if (j < 0 || j >= n) continue;
        if (m[j] >= 0.5) touches = true;
        else if (!seenR[j] && restVal[j] >= 0.25) { seenR[j] = 1; stack.push(j); }
      }
      if (touches) contact++;
    }
    // fast durchweg derselbe Farbton (abgespaltene Schattenseite derselben Fläche) darf so groß sein wie die Fläche selbst
    const limit = close > comp.length * 0.8 ? Math.max(maxRest, core * (opts.restMaxNah ?? 0)) : maxRest;
    // Anliegen: bei kleinen Stücken ein Anteil der Pixel, bei großen ein Anteil des Umfangs (wächst nur mit √Fläche)
    if (comp.length > limit || contact < Math.max(2, Math.min(comp.length * 0.08, Math.sqrt(comp.length)))) continue;
    for (const i of comp) if (restVal[i] > m[i]) m[i] = restVal[i];
  }
  const out = new Float32Array(n);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    out[i] = (m[i] * 4 + m[i - 1] + m[i + 1] + m[i - W] + m[i + W]) / 8;
  }
  return out;
}

/** Zielfarbe der Maske: Median von L, a, b über die sicher gewählten Pixel */
function targetOf(an, m) {
  const ls = [], as = [], bs = [];
  for (let i = 0; i < W * H; i++) if (m[i] > 0.9) { ls.push(an.L[i]); as.push(an.A[i]); bs.push(an.B[i]); }
  if (ls.length < 50) return null;
  const med = (v) => { v.sort((x, y) => x - y); return v[v.length >> 1]; };
  const Lm = med(ls), am = med(as), bm = med(bs);
  const rgb = toRgb(Lm, am, bm);
  const [l2, a2, b2] = toLab(...rgb);
  return { L: l2, a: a2, b: b2, C: Math.hypot(a2, b2), h: Math.atan2(b2, a2), rgb, count: ls.length };
}

const hex = (rgb) => '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('');
const hexLab = (h) => toLab(parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16));
/** Familie, deren Farbart der angegebenen Farbe am nächsten liegt */
function groupFor(an, h) {
  const [l, a, b] = hexLab(h);
  const d = Math.max(l, 0.12);
  let best = 0, bd = Infinity;
  an.groups.forEach((g, i) => { const dist = Math.hypot(g.a - a / d, g.b - b / d); if (dist < bd) { bd = dist; best = i; } });
  return best;
}

async function build(id, p) {
  const an = await analyse(id, p);
  const m = maskOf(an, groupFor(an, p.pick), p);
  const T = targetOf(an, m);
  if (!T) throw new Error(`„${id}“: Farbfläche zu klein — pick prüfen`);
  for (const h of p.add || []) {
    const extra = maskOf(an, groupFor(an, h), p);
    for (let i = 0; i < W * H; i++) if (extra[i] > m[i]) m[i] = extra[i];
  }
  return { an, m, T };
}

/** Prüfbild: Maske mit Wunschfarbe G gefüllt (Schattierung bleibt) */
function render(an, m, T, G) {
  const out = Buffer.from(an.data);
  for (let i = 0; i < W * H; i++) {
    const al = m[i];
    if (al <= 0.003) continue;
    const rgb = toRgb(...recolor(an.L[i], an.A[i], an.B[i], T, G));
    for (let c = 0; c < 3; c++) out[i * 4 + c] = Math.round(an.data[i * 4 + c] * (1 - al) + rgb[c] * al);
  }
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const take = (flag) => { const i = args.indexOf(flag); return i < 0 ? null : args.splice(i, 2)[1]; };
  const preview = take('--vorschau');
  const listFor = take('--kandidaten');

  if (listFor) {
    const an = await analyse(listFor, {});
    for (let gi = 0; gi < an.groups.length; gi++) {
      const m = maskOf(an, gi, {});
      const T = targetOf(an, m);
      if (!T) continue;
      let area = 0;
      for (let i = 0; i < W * H; i++) area += m[i];
      console.log(`${hex(T.rgb)}  ${(100 * area / an.boxArea).toFixed(0).padStart(3)} % der Karte  Sättigung ${T.C.toFixed(2)}`);
    }
    return;
  }

  const ids = args.length ? args : Object.keys(PICKS);
  const unknown = ids.filter((id) => !PICKS[id]);
  if (unknown.length) throw new Error(`Nicht in cardFarben.json: ${unknown.join(', ')}`);
  fs.mkdirSync(OUT_IMG, { recursive: true });
  if (preview) fs.mkdirSync(preview, { recursive: true });
  const colors = fs.existsSync(OUT_JSON) ? JSON.parse(fs.readFileSync(OUT_JSON, 'utf8')) : {};
  const raw = { raw: { width: W, height: H, channels: 4 } };

  for (const id of ids) {
    const { an, m, T } = await build(id, PICKS[id]);
    const patch = Buffer.alloc(W * H * 4);
    for (let i = 0; i < W * H; i++) {
      const al = Math.round(m[i] * 255);
      if (al < 2) continue;
      patch[i * 4] = an.data[i * 4]; patch[i * 4 + 1] = an.data[i * 4 + 1]; patch[i * 4 + 2] = an.data[i * 4 + 2]; patch[i * 4 + 3] = al;
    }
    await sharp(patch, raw).webp({ lossless: true, effort: 6 }).toFile(path.join(OUT_IMG, `${id}.webp`));
    colors[id] = T.rgb;
    if (preview) {
      const shifted = render(an, m, T, { L: T.L, C: Math.max(T.C, 0.12), h: T.h + 2.6 });
      const grey = render(an, m, T, { L: Math.min(0.8, Math.max(0.45, T.L)), C: 0, h: 0 });
      await sharp({ create: { width: W * 3, height: H, channels: 4, background: '#333333' } })
        .composite([
          { input: await sharp(an.data, raw).png().toBuffer(), left: 0, top: 0 },
          { input: await sharp(shifted, raw).png().toBuffer(), left: W, top: 0 },
          { input: await sharp(grey, raw).png().toBuffer(), left: W * 2, top: 0 },
        ])
        .png().toFile(path.join(preview, `${id}.png`));
    }
    console.log(`${id.padEnd(22)} ${hex(T.rgb)}`);
  }

  // Nur Karten behalten, die noch in der Auswahl stehen; verwaiste Masken löschen
  const kept = Object.fromEntries(Object.keys(PICKS).filter((id) => colors[id]).map((id) => [id, colors[id]]));
  fs.writeFileSync(OUT_JSON, '{\n' + Object.entries(kept).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n') + '\n}\n');
  for (const f of fs.readdirSync(OUT_IMG)) if (f.endsWith('.webp') && !PICKS[f.slice(0, -5)]) fs.unlinkSync(path.join(OUT_IMG, f));
  console.log(`${Object.keys(kept).length} Karten → ${path.relative(ROOT, OUT_JSON)}`);
}

if (require.main === module) main().catch((err) => { console.error(err.message); process.exit(1); });
module.exports = { analyse, maskOf, targetOf, build, render, recolor, toLab, toRgb, W, H, PICKS };
