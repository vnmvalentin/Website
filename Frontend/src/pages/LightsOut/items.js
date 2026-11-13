// items.js — die Dinge, die man aufhebt und benutzt, als richtige kleine Modelle statt Zylinder und Kästchen:
//   • Sicherung: alte Schraubsicherung aus Porzellan (Messingfuß, Messingkappe mit farbigem Kennplättchen)
//   • Akku: zwei dicke Zellen mit Etikett, mit Gewebeband zusammengeklebt
//   • Schlüssel: Bartschlüssel mit Ring, Bund und gezacktem Bart, dazu ein Anhänger am Draht
//   • Notiz: leicht gewelltes Blatt mit aufgebogener Ecke
//   • Sicherungskasten: Blechschrank mit offener Tür, Porzellanfassungen und Kontrolllampe
// Alles ist etwa doppelt so groß wie in echt — am Boden eines dunklen Flurs muss man es finden können.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}
function texture(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
/** Schmutz: weiche dunkle Flecken (fester Zufall, damit jede Ebene gleich aussieht). */
function dirt(ctx, w, h, n, color, seed = 7) {
  let a = seed;
  const rnd = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
  for (let i = 0; i < n; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const r = 4 + rnd() * Math.min(w, h) * 0.22;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

/** Drehkörper aus einem Profil [[Radius, Höhe], …] (Achse = y). */
function lathe(profile, segments = 20) {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments);
}

// ── Sicherung ──────────────────────────────────────────────────────────────

function porcelainTexture() {
  const [c, x] = canvas(256, 128);
  x.fillStyle = '#d9d2c0';
  x.fillRect(0, 0, 256, 128);
  // Aufdruck läuft um den Körper: Nennstrom und Spannung, darunter ein roter Ring
  x.fillStyle = '#2a2622';
  x.font = 'bold 30px "Arial Narrow", Arial, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  for (const u of [64, 192]) x.fillText('25 A', u, 52);
  x.font = 'bold 16px "Arial Narrow", Arial, sans-serif';
  for (const u of [64, 192]) x.fillText('500 V', u, 78);
  x.fillStyle = '#8f2318';
  x.fillRect(0, 100, 256, 7);
  // Haarrisse und Schmutz
  x.strokeStyle = 'rgba(60,50,40,0.5)';
  x.lineWidth = 1;
  for (const [sx, sy, pts] of [[20, 0, [[28, 30], [22, 60], [34, 96]]], [150, 128, [[144, 96], [156, 70]]], [226, 10, [[218, 44], [230, 66]]]]) {
    x.beginPath();
    x.moveTo(sx, sy);
    for (const [px, py] of pts) x.lineTo(px, py);
    x.stroke();
  }
  dirt(x, 256, 128, 14, 'rgba(70,52,30,0.4)', 11);
  return texture(c);
}

/**
 * Gemeinsame Geometrie und Materialien für alle Sicherungen einer Ebene.
 * @returns {{ geo: THREE.BufferGeometry, mats: THREE.Material[], length: number, radius: number }}
 *   Achse = y, Fuß (Kontakt) bei y = 0, Kappe bei y = length
 */
export function fuseParts(keep) {
  // Profil von unten (Fußkontakt) nach oben (Kappe mit Kennplättchen)
  const foot = lathe([[0, 0], [0.013, 0], [0.016, 0.006], [0.016, 0.02], [0.02, 0.024]], 16);
  const body = lathe([[0.02, 0.024], [0.027, 0.03], [0.034, 0.06], [0.041, 0.105], [0.043, 0.122], [0.049, 0.126], [0.05, 0.134]], 24);
  const cap = lathe([[0.05, 0.134], [0.054, 0.138], [0.055, 0.146], [0.055, 0.172], [0.052, 0.18], [0.032, 0.183]], 24);
  const window = lathe([[0.032, 0.183], [0.03, 0.186], [0, 0.187]], 16);
  // Rillen in der Messingkappe (Griffrand)
  const p = cap.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y < 0.145 || y > 0.173) continue;
    const a = Math.atan2(p.getZ(i), p.getX(i));
    const k = 1 + Math.cos(a * 12) * 0.03;
    p.setXYZ(i, p.getX(i) * k, y, p.getZ(i) * k);
  }
  cap.computeVertexNormals();
  const geo = keep(mergeGeometries([foot, body, cap, window], true));
  for (const g of [foot, body, cap, window]) g.dispose();
  const brass = keep(new THREE.MeshStandardMaterial({ color: 0xb48c46, emissive: 0x241600, roughness: 0.38, metalness: 0.85 }));
  const porcelain = keep(new THREE.MeshStandardMaterial({ map: keep(porcelainTexture()), emissive: 0x16140f, roughness: 0.32, metalness: 0 }));
  // Kennplättchen: rot = 10 A … hier kupferrot, leuchtet ganz schwach (man findet die Sicherung auch am Rand des Lichtkegels)
  const mark = keep(new THREE.MeshStandardMaterial({ color: 0xa8321e, emissive: 0x4a0e06, roughness: 0.25, metalness: 0.2 }));
  return { geo, mats: [brass, porcelain, brass, mark], length: 0.187, radius: 0.055 };
}

/** Eine Sicherung, die am Boden liegt (auf der Seite, Kappe leicht angehoben, weil sie dicker ist als der Fuß). */
export function makeFuse(parts) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(parts.geo, parts.mats);
  m.castShadow = true;
  // liegt auf Kappenrand und Fuß: Achse um den Winkel geneigt, den der Dickenunterschied ergibt
  const tilt = Math.asin((parts.radius - 0.016) / parts.length);
  m.rotation.z = Math.PI / 2 - tilt;
  m.position.set(parts.length / 2, 0.016, 0);
  g.add(m);
  return g;
}

// ── Akku ───────────────────────────────────────────────────────────────────

function cellLabelTexture() {
  const [c, x] = canvas(256, 128);
  // u läuft um die Zelle, v entlang: oben Pluspol
  x.fillStyle = '#1d3a2a';
  x.fillRect(0, 0, 256, 128);
  x.fillStyle = '#c9bf9e';
  x.fillRect(0, 0, 256, 26);
  x.fillStyle = '#9c2a1c';
  x.fillRect(0, 26, 256, 5);
  x.fillStyle = '#d8d0b4';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  for (const u of [64, 192]) {
    x.font = 'bold 34px "Arial Narrow", Arial, sans-serif';
    x.fillText('4,5 V', u, 66);
    x.font = 'bold 15px "Arial Narrow", Arial, sans-serif';
    x.fillText('LAMPENZELLE', u, 98);
    x.fillStyle = '#1d3a2a';
    x.font = 'bold 22px Arial, sans-serif';
    x.fillText('+', u, 13);
    x.fillStyle = '#d8d0b4';
  }
  dirt(x, 256, 128, 16, 'rgba(12,10,6,0.5)', 23);
  return texture(c);
}

/** Gemeinsame Teile für alle Akkus einer Ebene. */
export function batteryParts(keep) {
  const R = 0.034;
  const L = 0.128;
  const caps = [];
  for (const s of [-1, 1]) {
    const disc = new THREE.CylinderGeometry(R * 0.97, R * 0.97, 0.004, 20);
    disc.translate(0, s * (L / 2 + 0.001), 0);
    caps.push(disc);
  }
  const nub = new THREE.CylinderGeometry(0.011, 0.011, 0.012, 12);
  nub.translate(0, L / 2 + 0.008, 0);
  caps.push(nub);
  const oneMetal = mergeGeometries(caps);
  for (const g of caps) g.dispose();
  // Beide Zellen in je ein Netz für Etikett und Metall: nebeneinander, Achse liegend (z), die zweite andersherum
  const pairOf = (src) => {
    const parts = [1, -1].map((s) => src.clone().rotateX(s * Math.PI / 2).translate(s * R * 1.02, 0, 0));
    const out = keep(mergeGeometries(parts));
    for (const g of parts) g.dispose();
    src.dispose();
    return out;
  };
  const wrap = pairOf(new THREE.CylinderGeometry(R, R, L, 20, 1, true));
  const metalGeo = pairOf(oneMetal);
  // Klebeband: Band mit zwei Halbkreisen um beide Zellen
  const d = R * 1.02;
  const shape = new THREE.Shape();
  const rr = R + 0.0025;
  shape.absarc(-d, 0, rr, Math.PI / 2, Math.PI * 1.5, false);
  shape.absarc(d, 0, rr, -Math.PI / 2, Math.PI / 2, false);
  shape.closePath();
  const tape = keep(new THREE.ExtrudeGeometry(shape, { depth: 0.036, bevelEnabled: false, curveSegments: 10 }));
  tape.translate(0, 0, -0.018);
  const label = keep(new THREE.MeshStandardMaterial({ map: keep(cellLabelTexture()), emissive: 0x0c1810, roughness: 0.45, metalness: 0.15 }));
  const metal = keep(new THREE.MeshStandardMaterial({ color: 0x9a988e, emissive: 0x0a0a08, roughness: 0.35, metalness: 0.9 }));
  const tapeMat = keep(new THREE.MeshStandardMaterial({ color: 0x15140f, roughness: 0.9 }));
  return { wrap, metalGeo, tape, label, metal, tapeMat, R, L, d };
}

/** Ein Akku am Boden: zwei Zellen nebeneinander, die Pole zeigen in entgegengesetzte Richtungen. */
export function makeBattery(parts) {
  const g = new THREE.Group();
  const pack = new THREE.Group();
  pack.add(new THREE.Mesh(parts.wrap, parts.label), new THREE.Mesh(parts.metalGeo, parts.metal), new THREE.Mesh(parts.tape, parts.tapeMat));
  pack.position.y = parts.R;
  pack.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.add(pack);
  return g;
}

// ── Schlüssel ──────────────────────────────────────────────────────────────

function tagTexture() {
  const [c, x] = canvas(128, 80);
  x.fillStyle = '#b9ab86';
  x.fillRect(0, 0, 128, 80);
  x.strokeStyle = '#3a2f22';
  x.lineWidth = 3;
  x.strokeRect(6, 6, 116, 68);
  x.fillStyle = '#2a2018';
  x.font = 'bold 34px "Arial Narrow", Arial, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText('HAUS', 70, 42);
  x.fillStyle = '#15120e';
  x.beginPath();
  x.arc(18, 40, 6, 0, Math.PI * 2);
  x.fill();
  dirt(x, 128, 80, 8, 'rgba(60,40,20,0.4)', 5);
  return texture(c);
}

/** Bartschlüssel, flach am Boden (Schaft entlang x), mit Anhänger. */
export function makeKey(keep) {
  const g = new THREE.Group();
  const metal = keep(new THREE.MeshStandardMaterial({ color: 0xa08650, emissive: 0x241a06, roughness: 0.42, metalness: 0.85 }));
  // Umriss: Ring (Reide) mit Loch, Schaft mit zwei Bunden, Bart mit Kerben
  const s = new THREE.Shape();
  const R = 0.04;
  // Ring als Kreis mit Ansatz zum Schaft
  s.absarc(-0.105, 0, R, 0.16, Math.PI * 2 - 0.16, false);
  s.lineTo(-0.058, -0.0065);
  s.lineTo(-0.046, -0.0065);
  s.lineTo(-0.046, -0.011);   // erster Bund
  s.lineTo(-0.036, -0.011);
  s.lineTo(-0.036, -0.0065);
  s.lineTo(0.062, -0.0065);
  // Bart: nach unten, mit zwei Kerben
  s.lineTo(0.062, -0.05);
  s.lineTo(0.074, -0.05);
  s.lineTo(0.074, -0.03);
  s.lineTo(0.082, -0.03);
  s.lineTo(0.082, -0.05);
  s.lineTo(0.094, -0.05);
  s.lineTo(0.094, -0.036);
  s.lineTo(0.102, -0.036);
  s.lineTo(0.102, -0.0065);
  s.lineTo(0.112, -0.0065);
  s.lineTo(0.116, 0);         // Spitze
  s.lineTo(0.112, 0.0065);
  s.lineTo(-0.036, 0.0065);
  s.lineTo(-0.036, 0.011);
  s.lineTo(-0.046, 0.011);
  s.lineTo(-0.046, 0.0065);
  s.lineTo(-0.058, 0.0065);
  s.closePath();
  const hole = new THREE.Path();
  hole.absellipse(-0.105, 0, 0.024, 0.021, 0, Math.PI * 2, true);
  s.holes.push(hole);
  const geo = keep(new THREE.ExtrudeGeometry(s, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 2, curveSegments: 16 }));
  geo.rotateX(-Math.PI / 2);     // flach hinlegen (Umriss in der Bodenebene)
  const key = new THREE.Mesh(geo, metal);
  key.position.y = 0.004;
  key.castShadow = true;
  g.add(key);
  // Anhänger: Pappschild am Draht, liegt schräg neben dem Ring
  const tag = new THREE.Mesh(keep(new THREE.BoxGeometry(0.075, 0.003, 0.047)),
    keep(new THREE.MeshStandardMaterial({ map: keep(tagTexture()), emissive: 0x14110a, roughness: 0.9 })));
  tag.position.set(-0.15, 0.004, 0.075);
  tag.rotation.y = 0.5;
  tag.castShadow = true;
  const wire = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.0012, 0.0012, 0.06, 5)), metal);
  wire.rotation.z = Math.PI / 2;
  wire.rotation.y = -0.95;
  wire.position.set(-0.132, 0.006, 0.042);
  g.add(tag, wire);
  return g;
}

// ── Notiz ──────────────────────────────────────────────────────────────────

/** Blatt Papier, flach am Boden, leicht gewellt, eine Ecke aufgebogen. */
export function paperGeometry() {
  const w = 0.21;
  const h = 0.3;
  const geo = new THREE.PlaneGeometry(w, h, 5, 7);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) / (w / 2);
    const v = p.getZ(i) / (h / 2);
    const corner = Math.max(0, u * v - 0.25);      // nur eine Ecke (u, v > 0)
    p.setY(i, corner * corner * 0.05 + Math.sin(v * 3.1 + u) * 0.0025 + 0.003);
  }
  geo.computeVertexNormals();
  return geo;
}

// ── Sicherungskasten ───────────────────────────────────────────────────────

function cabinetTexture() {
  const [c, x] = canvas(256, 256);
  x.fillStyle = '#5d6360';
  x.fillRect(0, 0, 256, 256);
  dirt(x, 256, 256, 40, 'rgba(30,34,30,0.35)', 3);
  dirt(x, 256, 256, 18, 'rgba(110,56,22,0.5)', 17);   // Rost
  // Kratzer
  x.strokeStyle = 'rgba(170,176,170,0.35)';
  x.lineWidth = 1;
  let a = 91;
  const rnd = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
  for (let i = 0; i < 26; i++) {
    const sx = rnd() * 256;
    const sy = rnd() * 256;
    x.beginPath();
    x.moveTo(sx, sy);
    x.lineTo(sx + (rnd() - 0.5) * 50, sy + (rnd() - 0.5) * 14);
    x.stroke();
  }
  return texture(c);
}

function panelTexture() {
  const [c, x] = canvas(512, 128);
  x.fillStyle = '#c9c2a8';
  x.fillRect(0, 0, 512, 128);
  x.strokeStyle = '#2a2622';
  x.lineWidth = 5;
  x.strokeRect(8, 8, 496, 112);
  // Warndreieck links, Schrift rechts
  x.fillStyle = '#d0a81e';
  x.beginPath();
  x.moveTo(62, 22); x.lineTo(104, 100); x.lineTo(20, 100); x.closePath();
  x.fill();
  x.strokeStyle = '#1c1916';
  x.lineWidth = 4;
  x.stroke();
  x.fillStyle = '#1c1916';
  x.font = 'bold 54px Arial, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText('!', 62, 70);
  x.font = 'bold 50px "Arial Narrow", Arial, sans-serif';
  x.fillText('HAUPTSTROM', 306, 52);
  x.font = 'bold 24px "Arial Narrow", Arial, sans-serif';
  x.fillText('STATION 3 · 380 V', 306, 96);
  dirt(x, 512, 128, 16, 'rgba(90,50,20,0.4)', 29);
  return texture(c);
}

/**
 * Sicherungskasten für die Wand: lokale +z zeigt in den Raum, Mitte des Kastens im Ursprung.
 * @param {{ keep: Function, slots: number, fuse: ReturnType<typeof fuseParts> }} p
 * @returns {{ group: THREE.Group, setInserted: (n:number)=>void, setPower: (on:boolean)=>void }}
 */
export function buildFuseBox({ keep, slots, fuse }) {
  const W = 0.66;
  const H = 0.8;
  const D = 0.17;
  const group = new THREE.Group();
  const steel = keep(new THREE.MeshStandardMaterial({ map: keep(cabinetTexture()), roughness: 0.6, metalness: 0.45 }));
  const dark = keep(new THREE.MeshStandardMaterial({ color: 0x16181a, roughness: 0.8, metalness: 0.3 }));
  // Schrank: Rückwand und vier Seiten (innen hohl), damit man hineinsieht
  const back = new THREE.Mesh(keep(new THREE.BoxGeometry(W, H, 0.012)), dark);
  back.position.z = -D / 2 + 0.006;
  group.add(back);
  const sideGeo = keep(new THREE.BoxGeometry(0.014, H, D));
  const topGeo = keep(new THREE.BoxGeometry(W, 0.014, D));
  for (const s of [-1, 1]) {
    const side = new THREE.Mesh(sideGeo, steel);
    side.position.x = s * (W / 2 - 0.007);
    const top = new THREE.Mesh(topGeo, steel);
    top.position.y = s * (H / 2 - 0.007);
    group.add(side, top);
  }
  // Tür: links angeschlagen, steht weit offen
  const door = new THREE.Group();
  const leaf = new THREE.Mesh(keep(new THREE.BoxGeometry(W, H, 0.012)), steel);
  leaf.position.x = W / 2;
  const handle = new THREE.Mesh(keep(new THREE.BoxGeometry(0.03, 0.12, 0.03)), dark);
  handle.position.set(W - 0.06, 0, 0.02);
  door.add(leaf, handle);
  door.position.set(-W / 2, 0, D / 2);
  door.rotation.y = -1.95;
  group.add(door);
  // Schild über den Fassungen
  const plate = new THREE.Mesh(keep(new THREE.PlaneGeometry(W - 0.1, (W - 0.1) / 4)),
    keep(new THREE.MeshStandardMaterial({ map: keep(panelTexture()), roughness: 0.6, metalness: 0.1 })));
  plate.position.set(0, H / 2 - 0.14, -D / 2 + 0.014);
  group.add(plate);
  // Fassungen: Porzellanring mit dunklem Loch; eingesetzte Sicherungen schauen mit der Kappe heraus
  const ringGeo = keep(new THREE.CylinderGeometry(0.043, 0.047, 0.05, 20, 1, true));
  ringGeo.rotateX(Math.PI / 2);
  const rimGeo = keep(new THREE.RingGeometry(0.03, 0.045, 20));
  const holeGeo = keep(new THREE.CircleGeometry(0.031, 16));
  // Fassungen aus dunklem Bakelit mit Messingrand (helles Porzellan sah im Lichtkegel aus wie Augen)
  const porcelain = keep(new THREE.MeshStandardMaterial({ color: 0x2c231c, roughness: 0.5, side: THREE.DoubleSide }));
  const rimMat = keep(new THREE.MeshStandardMaterial({ color: 0x8a6c38, roughness: 0.45, metalness: 0.8, side: THREE.DoubleSide }));
  const holeMat = keep(new THREE.MeshBasicMaterial({ color: 0x050505 }));
  const scale = slots > 4 ? 0.62 : 0.72;
  const span = W - 0.2;
  const inserted = [];
  for (let i = 0; i < slots; i++) {
    const x = slots === 1 ? 0 : -span / 2 + (i * span) / (slots - 1);
    const y = -0.1;
    const z = -D / 2 + 0.012;
    const ring = new THREE.Mesh(ringGeo, porcelain);
    ring.position.set(x, y, z + 0.025);
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.position.set(x, y, z + 0.05);
    const hole = new THREE.Mesh(holeGeo, holeMat);
    hole.position.set(x, y, z + 0.022);
    ring.scale.setScalar(scale / 0.72);
    rim.scale.setScalar(scale / 0.72);
    hole.scale.setScalar(scale / 0.72);
    group.add(ring, rim, hole);
    const f = new THREE.Mesh(fuse.geo, fuse.mats);
    f.rotation.x = Math.PI / 2;          // Achse nach +z: Kappe zeigt in den Raum
    f.scale.setScalar(scale);
    f.position.set(x, y, z + 0.075 - fuse.length * scale + 0.03);
    f.visible = false;
    group.add(f);
    inserted.push(f);
  }
  // Kontrolllampe unten: rot, mit Strom grün (über der Bloom-Schwelle)
  const lampMat = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2a18).multiplyScalar(1.6) }));
  const lamp = new THREE.Mesh(keep(new THREE.SphereGeometry(0.02, 12, 8)), lampMat);
  lamp.position.set(0, -H / 2 + 0.1, -D / 2 + 0.03);
  group.add(lamp);
  group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  lamp.castShadow = false;
  return {
    group,
    /** So viele Sicherungen stecken. */
    setInserted(n) { inserted.forEach((f, i) => { f.visible = i < n; }); },
    setPower(on) { lampMat.color.set(on ? 0x30ff60 : 0xff2a18).multiplyScalar(1.6); },
  };
}

// ── Fundstücke von Jonas ───────────────────────────────────────────────────
// Liegen wie Notizen in den Ebenen (lore.js, Feld item) und werden genauso angesehen.

/** Armbanduhr: Gehäuse mit gesprungenem Glas, das Band zu beiden Seiten flach ausgelegt (eine Seite gerissen). */
function makeWatch(keep) {
  const g = new THREE.Group();
  const [c, x] = canvas(128, 128);
  x.fillStyle = '#e8e2d0';
  x.beginPath();
  x.arc(64, 64, 60, 0, Math.PI * 2);
  x.fill();
  x.strokeStyle = '#1c1916';
  x.lineWidth = 4;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    x.beginPath();
    x.moveTo(64 + Math.cos(a) * 46, 64 + Math.sin(a) * 46);
    x.lineTo(64 + Math.cos(a) * 55, 64 + Math.sin(a) * 55);
    x.stroke();
  }
  // Zeiger: zehn nach drei
  x.lineWidth = 5;
  x.beginPath(); x.moveTo(64, 64); x.lineTo(92, 64); x.stroke();
  x.lineWidth = 3;
  x.beginPath(); x.moveTo(64, 64); x.lineTo(86, 26); x.stroke();
  // Sprung im Glas
  x.strokeStyle = 'rgba(255,255,255,0.8)';
  x.lineWidth = 1.5;
  x.beginPath(); x.moveTo(20, 30); x.lineTo(58, 70); x.lineTo(70, 116); x.moveTo(58, 70); x.lineTo(104, 84); x.stroke();
  const steel = keep(new THREE.MeshStandardMaterial({ color: 0xa8a8a0, emissive: 0x161614, roughness: 0.3, metalness: 0.9 }));
  const body = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 24)), steel);
  body.position.y = 0.006;
  const face = new THREE.Mesh(keep(new THREE.CircleGeometry(0.026, 24)),
    keep(new THREE.MeshStandardMaterial({ map: keep(texture(c)), emissive: 0x2a2820, roughness: 0.2 })));
  face.rotation.x = -Math.PI / 2;
  face.position.y = 0.0125;
  const crown = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.004, 0.004, 0.008, 8)), steel);
  crown.rotation.z = Math.PI / 2;
  crown.position.set(0.033, 0.006, 0);
  const leather = keep(new THREE.MeshStandardMaterial({ color: 0x3a2416, roughness: 0.8 }));
  const strapGeo = keep(new THREE.BoxGeometry(0.03, 0.004, 0.085));
  const a = new THREE.Mesh(strapGeo, leather);
  a.position.set(0, 0.002, 0.07);
  const b = new THREE.Mesh(keep(new THREE.BoxGeometry(0.03, 0.004, 0.05)), leather);
  b.position.set(0.006, 0.002, -0.052);
  b.rotation.y = 0.35;
  g.add(body, face, crown, a, b);
  return g;
}

/** Kleinbildkamera: Gehäuse, Objektiv, Sucherbuckel, zersplitterter Aufsteckblitz, Riemen. */
function makeCamera(keep) {
  const g = new THREE.Group();
  const black = keep(new THREE.MeshStandardMaterial({ color: 0x151515, emissive: 0x080808, roughness: 0.75 }));
  const chrome = keep(new THREE.MeshStandardMaterial({ color: 0xa4a49c, emissive: 0x121210, roughness: 0.3, metalness: 0.85 }));
  const body = new THREE.Mesh(keep(new THREE.BoxGeometry(0.15, 0.085, 0.045)), black);
  body.position.y = 0.0425;
  const topPlate = new THREE.Mesh(keep(new THREE.BoxGeometry(0.152, 0.02, 0.047)), chrome);
  topPlate.position.y = 0.092;
  const prism = new THREE.Mesh(keep(new THREE.BoxGeometry(0.05, 0.03, 0.04)), chrome);
  prism.position.y = 0.115;
  const lens = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.03, 0.033, 0.06, 20)), black);
  lens.rotation.x = Math.PI / 2;
  lens.position.set(0, 0.045, 0.05);
  const glass = new THREE.Mesh(keep(new THREE.CircleGeometry(0.024, 20)), keep(new THREE.MeshStandardMaterial({ color: 0x1a2430, roughness: 0.05, metalness: 0.6 })));
  glass.position.set(0, 0.045, 0.0805);
  const flash = new THREE.Mesh(keep(new THREE.BoxGeometry(0.05, 0.035, 0.03)), black);
  flash.position.set(0.035, 0.145, 0);
  flash.rotation.z = -0.3;
  const strap = new THREE.Mesh(keep(new THREE.TorusGeometry(0.11, 0.006, 5, 20, Math.PI * 1.2)), black);
  strap.rotation.x = Math.PI / 2;
  strap.position.set(-0.03, 0.006, -0.1);
  g.add(body, topPlate, prism, lens, glass, flash, strap);
  // liegt auf der Seite, wie fallen gelassen
  const tilt = new THREE.Group();
  tilt.add(g);
  g.rotation.z = Math.PI / 2 - 0.12;
  g.position.set(0, 0.076, 0);
  return tilt;
}

/** Handy mit gesprungenem Display, das noch schwach leuchtet. */
function makePhone(keep) {
  const g = new THREE.Group();
  const [c, x] = canvas(96, 192);
  x.fillStyle = '#0c1422';
  x.fillRect(0, 0, 96, 192);
  x.fillStyle = '#9fb6d6';
  x.font = '600 13px system-ui, sans-serif';
  x.textAlign = 'center';
  x.fillText('Letzter Anruf', 48, 44);
  x.fillStyle = '#eef3f8';
  x.font = '700 24px system-ui, sans-serif';
  x.fillText('Lena', 48, 76);
  x.fillStyle = '#d8584c';
  x.font = '600 12px system-ui, sans-serif';
  x.fillText('abgebrochen', 48, 100);
  x.strokeStyle = 'rgba(255,255,255,0.75)';
  x.lineWidth = 1.5;
  x.beginPath();
  x.moveTo(8, 6); x.lineTo(40, 88); x.lineTo(30, 186);
  x.moveTo(40, 88); x.lineTo(92, 60);
  x.moveTo(40, 88); x.lineTo(88, 150);
  x.stroke();
  const body = new THREE.Mesh(keep(new THREE.BoxGeometry(0.075, 0.009, 0.155)), keep(new THREE.MeshStandardMaterial({ color: 0x101012, roughness: 0.5 })));
  body.position.y = 0.0045;
  const screen = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.067, 0.143)), keep(new THREE.MeshBasicMaterial({ map: keep(texture(c)), color: 0x9a9a9a })));
  screen.rotation.x = -Math.PI / 2;
  screen.position.y = 0.0095;
  g.add(body, screen);
  return g;
}

/** Fundstück zum Namen aus lore.js (item). Liefert eine Gruppe, die auf y = 0 aufliegt, oder null. */
export function makeFind(kind, keep) {
  const g = kind === 'watch' ? makeWatch(keep) : kind === 'camera' ? makeCamera(keep) : kind === 'phone' ? makePhone(keep) : null;
  if (g) {
    // etwas größer als in echt, wie alle Gegenstände am Boden
    g.scale.setScalar(kind === 'camera' ? 1.5 : 2);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  }
  return g;
}

/** Brecheisen: Stange mit gebogener Klaue an einem Ende und flach ausgeschmiedeter Spitze am anderen. */
export function makeCrowbar(keep) {
  const pts = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0.52, 0),
    new THREE.Vector3(0.015, 0.6, 0),
    new THREE.Vector3(0.06, 0.645, 0),
    new THREE.Vector3(0.11, 0.62, 0),
  ];
  const geo = keep(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.011, 7, false));
  const iron = keep(new THREE.MeshStandardMaterial({ color: 0x4a2a22, emissive: 0x0c0605, roughness: 0.55, metalness: 0.75 }));
  const bar = new THREE.Mesh(geo, iron);
  bar.castShadow = true;
  const tip = new THREE.Mesh(keep(new THREE.BoxGeometry(0.03, 0.06, 0.006)), iron);
  tip.position.set(0, -0.025, 0);
  const g = new THREE.Group();
  g.add(bar, tip);
  return g;
}
