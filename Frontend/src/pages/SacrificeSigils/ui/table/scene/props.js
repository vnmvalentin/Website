// ui/table/scene/props.js — Gegenstände des neuen Tischs, die es vorher nur als Knopf oder Kasten gab:
// Siegelstempel (Zug beenden), Stundenglas (Zugzeit), Hammer, Kartenstapel, Knochenschale, Wachsschale,
// Zettel mit Ziffern, Tintenfass mit Feder. Waage und Totems kommen weiter aus battle/table3d/tableProps.js.
import * as THREE from "three";
import { CARD_W, CARD_H } from "../cards/cardMesh.js";

const lathe = (pts, segs = 24) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), segs);

/** Alle Meshes einer Gruppe werfen und empfangen Schatten. */
export function shadows(obj, cast = true, receive = true) {
  obj.traverse((o) => {
    if (o.isMesh) { o.castShadow = cast; o.receiveShadow = receive; }
  });
  return obj;
}

/** Materialien, die nur der neue Tisch braucht (werden vom Aufrufer entsorgt). */
export function roomMaterials() {
  return {
    wax: new THREE.MeshStandardMaterial({ color: 0x8e1b1b, roughness: 0.32, metalness: 0 }),
    waxPale: new THREE.MeshStandardMaterial({ color: 0xe9dcba, roughness: 0.45, emissive: 0x3a2410, emissiveIntensity: 0.35 }),
    slate: new THREE.MeshStandardMaterial({ color: 0x23211f, roughness: 0.8 }),
    glass: new THREE.MeshStandardMaterial({ color: 0xcfe0dc, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.26, depthWrite: false }),
    sand: new THREE.MeshStandardMaterial({ color: 0xd9b56a, roughness: 0.95 }),
    paperEdge: new THREE.MeshStandardMaterial({ color: 0xcdbd95, roughness: 0.92 }),
    inkGlass: new THREE.MeshStandardMaterial({ color: 0x0d0f12, roughness: 0.12, metalness: 0.3 }),
    quill: new THREE.MeshStandardMaterial({ color: 0xcfc2a4, roughness: 0.9, side: THREE.DoubleSide }),
    hit: new THREE.MeshBasicMaterial({ visible: false }),
    leather: new THREE.MeshStandardMaterial({ color: 0x6a4428, roughness: 0.85 }),
    cord: new THREE.MeshStandardMaterial({ color: 0xc9b48a, roughness: 0.9 }),
    water: new THREE.MeshStandardMaterial({ color: 0x3e7a93, roughness: 0.15, transparent: true, opacity: 0.85 }),
  };
}

/**
 * Item: verschnürter Lederbeutel mit einem Namenszettel davor (eigene Items) oder ohne Zettel (Items des Gegenübers).
 * @param {string | null} name
 */
export function makeItemToken(mat, pm, name) {
  const group = new THREE.Group();
  const pouch = new THREE.Mesh(lathe([[0, 0], [2.0, 0], [2.6, 0.9], [2.4, 2.3], [1.3, 3.1], [0.95, 3.5], [1.4, 4.1], [0, 4.0]], 20), mat.leather);
  const tie = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.2, 6, 18), mat.cord);
  tie.rotation.x = Math.PI / 2;
  tie.position.y = 3.35;
  group.add(pouch, tie);
  shadows(group);
  let tex = null;
  let tagMat = null;
  let tagGeo = null;
  if (name) {
    const c = document.createElement("canvas");
    c.width = 384;
    c.height = 112;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#dccfa9";
    ctx.fillRect(0, 0, 384, 112);
    ctx.strokeStyle = "rgba(60,40,20,0.55)";
    ctx.lineWidth = 3;
    ctx.strokeRect(4, 4, 376, 104);
    ctx.fillStyle = "#1a1612";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    let size = 54;
    do {
      ctx.font = `${size}px 'IM Fell English SC', Georgia, serif`;
      size -= 3;
    } while (ctx.measureText(name).width > 356 && size > 24);
    ctx.fillText(name, 192, 60);
    tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tagMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
    tagGeo = new THREE.PlaneGeometry(9.6, 2.8);
    const tag = new THREE.Mesh(tagGeo, tagMat);
    tag.rotation.x = -Math.PI / 2;
    tag.position.set(0, 0.07, 4.6);
    tag.receiveShadow = true;
    group.add(tag);
  }
  return { group, dispose() { pouch.geometry.dispose(); tie.geometry.dispose(); tex?.dispose(); tagMat?.dispose(); tagGeo?.dispose(); } };
}

/** Füllhöhe des Gezeitenglases je Phase (steigend, Flut, fallend, Ebbe) — wie die bisherige Anzeige. */
const TIDE_LEVEL = [0.15, 0.6, 0.92, 0.45];

/** Gezeitenglas: Glaszylinder auf Messingfuß, der Wasserstand zeigt die Phase. @param {number} tide 0–3 */
export function makeTideGauge(mat, pm, tide) {
  const group = new THREE.Group();
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.6, 0.8, 28), pm.brass);
  foot.position.y = 0.4;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(2.7, 0.28, 8, 28), pm.brass);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 10.6;
  const level = Math.max(0.05, TIDE_LEVEL[tide] ?? 0.4) * 9.4;
  const water = new THREE.Mesh(new THREE.CylinderGeometry(2.45, 2.45, level, 24), mat.water);
  water.position.y = 0.9 + level / 2;
  group.add(foot, rim, water);
  shadows(group);
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 2.7, 9.8, 28, 1, true), mat.glass);
  glass.position.y = 5.7;
  glass.renderOrder = 3;
  group.add(glass);
  return { group, dispose() { group.traverse((o) => o.geometry?.dispose()); } };
}

/** Siegelstempel auf einer Schieferplatte mit einem Klecks rotem Wachs. Der Stempel ist `stamp` (zum Anheben). */
export function makeSeal(mat, pm) {
  const group = new THREE.Group();
  const tile = new THREE.Mesh(new THREE.BoxGeometry(11, 0.6, 8), mat.slate);
  tile.position.y = 0.3;
  group.add(tile);
  const blob = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), mat.wax);
  blob.scale.set(2.5, 0.42, 2.3);
  blob.position.set(-2.4, 0.66, 0.2);
  group.add(blob);
  for (const [x, z, s] of [[-4.6, 1.8, 0.5], [-0.4, -1.9, 0.38], [-3.6, -2.2, 0.3]]) {
    const drop = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), mat.wax);
    drop.scale.set(s, 0.16, s);
    drop.position.set(x, 0.63, z);
    group.add(drop);
  }
  const stamp = new THREE.Group();
  const head = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 2.05, 0.9, 28), pm.brass);
  head.position.y = 0.45;
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.7, 0.7, 24), pm.brassDark);
  collar.position.y = 1.25;
  const handle = new THREE.Mesh(lathe([[0.95, 0], [0.8, 1.2], [1.25, 2.6], [1.55, 3.6], [1.35, 4.5], [0.7, 5.0], [0, 5.1]], 20), pm.wood);
  handle.position.y = 1.6;
  stamp.add(head, collar, handle);
  stamp.position.set(2.6, 0.6, 0);
  group.add(stamp);
  shadows(group);
  return { group, stamp };
}

/**
 * Stundenglas (etwa 9 hoch). `body` dreht sich um die Mitte (Umdrehen beim Zugwechsel),
 * `setSand(oben, rieselt)` stellt die Sandmengen: oben 0–1 = Anteil der Zugzeit, der noch bleibt.
 */
export function makeHourglass(mat, pm) {
  const group = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 4.5;
  group.add(body);
  const capGeo = new THREE.CylinderGeometry(2.3, 2.3, 0.5, 24);
  const bottom = new THREE.Mesh(capGeo, pm.wood);
  bottom.position.y = -4.25;
  const top = new THREE.Mesh(capGeo, pm.wood);
  top.position.y = 4.25;
  body.add(bottom, top);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 8, 6), pm.brassDark);
    post.position.set(Math.cos(a) * 1.95, 0, Math.sin(a) * 1.95);
    body.add(post);
  }
  // Sand unten: Kegel, der vom Boden her wächst · oben: umgekehrter Kegel, der zur Engstelle hin schrumpft
  const sandLow = new THREE.Mesh(new THREE.ConeGeometry(1.5, 2.6, 20).translate(0, 1.3, 0), mat.sand);
  sandLow.position.y = -4;
  const sandHigh = new THREE.Mesh(new THREE.ConeGeometry(1.5, 2.6, 20).rotateX(Math.PI).translate(0, 1.3, 0), mat.sand);
  sandHigh.position.y = 0.35;
  const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.6, 6), mat.sand);
  stream.position.y = -1.6;
  body.add(sandLow, sandHigh, stream);
  shadows(group);
  // Glas zuletzt und ohne Schattenwurf (durchsichtig)
  const glass = new THREE.Mesh(lathe([[1.8, -4], [1.8, -2.9], [0.28, 0], [1.8, 2.9], [1.8, 4]], 28), mat.glass);
  glass.renderOrder = 3;
  body.add(glass);
  const setSand = (high, running) => {
    const h = Math.cbrt(Math.min(1, Math.max(0, high)));
    const l = Math.cbrt(Math.min(1, Math.max(0, 1 - high)));
    sandHigh.scale.setScalar(Math.max(0.04, h));
    sandHigh.visible = high > 0.004;
    sandLow.scale.setScalar(Math.max(0.04, l));
    sandLow.visible = high < 0.996;
    stream.visible = !!running && high > 0.004;
  };
  setSand(0.5, false);
  return { group, body, setSand };
}

/** Hammer, liegend (Stiel entlang z). */
export function makeHammer(mat, pm) {
  const group = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 13, 10).rotateX(Math.PI / 2), pm.wood);
  handle.position.set(0, 0.55, 1.5);
  const head = new THREE.Mesh(new THREE.BoxGeometry(5.6, 2.5, 2.5), pm.iron);
  head.position.set(0, 1.25, -5);
  const band = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.7, 2.7), pm.brassDark);
  band.position.copy(head.position);
  group.add(handle, head, band);
  shadows(group);
  // Der Stiel ist dünn: eine unsichtbare, großzügige Fläche zum Anklicken
  const hit = new THREE.Mesh(new THREE.BoxGeometry(9, 4, 18), mat.hit);
  hit.position.set(0, 2, 0.5);
  group.add(hit);
  return { group };
}

/** Kanten eines Stapels: feine Lagen Papier. */
function stackEdgeTexture() {
  const c = document.createElement("canvas");
  c.width = 8;
  c.height = 64;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#cdbd95";
  ctx.fillRect(0, 0, 8, 64);
  for (let y = 0; y < 64; y += 2) {
    ctx.fillStyle = y % 4 ? "rgba(70,50,25,0.45)" : "rgba(255,245,215,0.25)";
    ctx.fillRect(0, y, 8, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Kartenstapel: Höhe folgt der Kartenzahl. @param {THREE.Texture} backTex @param {number} count (Infinity = Nebendeck)
 */
export function makeDeck(backTex, count) {
  const edgeTex = stackEdgeTexture();
  const edge = new THREE.MeshStandardMaterial({ map: edgeTex, roughness: 0.9 });
  const top = new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.8 });
  const h = Number.isFinite(count) ? Math.max(0.16, count * 0.16) : 3.4;
  const geo = new THREE.BoxGeometry(CARD_W, h, CARD_H);
  const box = new THREE.Mesh(geo, [edge, edge, top, edge, edge, edge]);
  box.position.y = h / 2;
  const group = new THREE.Group();
  group.add(box);
  group.visible = count !== 0;
  shadows(group);
  return { group, height: h, dispose() { geo.dispose(); edge.dispose(); top.dispose(); edgeTex.dispose(); } };
}

/** Zettel mit einer Ziffer, flach auf dem Tisch — „Zahlen bleiben Zahlen“. */
export function makeTag(text, { w = 5.6, h = 4 } = {}) {
  const c = document.createElement("canvas");
  c.width = 224;
  c.height = 160;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#dccfa9";
  ctx.fillRect(0, 0, 224, 160);
  const g = ctx.createRadialGradient(80, 50, 10, 112, 80, 150);
  g.addColorStop(0, "rgba(255,255,255,0.25)");
  g.addColorStop(1, "rgba(110,80,30,0.35)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 224, 160);
  ctx.strokeStyle = "rgba(60,40,20,0.55)";
  ctx.lineWidth = 3;
  ctx.strokeRect(5, 5, 214, 150);
  ctx.fillStyle = "#1a1612";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const s = String(text);
  ctx.font = `${s.length > 3 ? 78 : 108}px 'IM Fell English', Georgia, serif`;
  ctx.fillText(s, 112, 86);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
  const geo = new THREE.PlaneGeometry(w, h);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.07;
  mesh.receiveShadow = true;
  const group = new THREE.Group();
  group.add(mesh);
  return { group, dispose() { tex.dispose(); mat.dispose(); geo.dispose(); } };
}

/**
 * Zettel mit Text, flach auf dem Tisch (Rast: besuchte Orte · Ergebnis: Ausgang und Zahlen · Pfad-Szenen: das Blatt
 * mit Titel und Erklärung, die Wahlmöglichkeiten). Die erste Zeile ist die Überschrift. Lange Zeilen brechen um
 * (`wrap`), und die Schrift wird so weit verkleinert, bis alles auf den Zettel passt.
 * @param {Array<string | { text: string, size?: number, wrap?: boolean }>} lines  size = Größe gegenüber einer normalen Zeile
 * @param {{ w?: number, h?: number, mark?: boolean, dim?: boolean }} [o]  Größe in Tischeinheiten ·
 *   mark = gewählt (roter Wachsrand) · dim = gerade nicht wählbar (blass)
 */
export function makeNote(lines, { w = 18, h = 12, mark = false, dim = false } = {}) {
  const PX = 36;
  const c = document.createElement("canvas");
  c.width = Math.round(w * PX);
  c.height = Math.round(h * PX);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#dccfa9";
  ctx.fillRect(0, 0, c.width, c.height);
  const g = ctx.createRadialGradient(c.width * 0.35, c.height * 0.3, 10, c.width / 2, c.height / 2, Math.max(c.width, c.height) * 0.75);
  g.addColorStop(0, "rgba(255,255,255,0.22)");
  g.addColorStop(1, "rgba(110,80,30,0.33)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.strokeStyle = mark ? "#8e1b1b" : "rgba(60,40,20,0.5)";
  ctx.lineWidth = mark ? 10 : 3;
  ctx.strokeRect(mark ? 7 : 6, mark ? 7 : 6, c.width - (mark ? 14 : 12), c.height - (mark ? 14 : 12));
  const rows = lines.map((l, i) => (typeof l === "string" ? { text: l, size: i === 0 ? 1.25 : 1 } : { size: i === 0 ? 1.25 : 1, ...l }));
  const pad = Math.min(PX * 0.9, c.height * 0.16);
  const maxW = c.width - pad * 2 - (mark ? 10 : 0);
  const family = (i) => (i === 0 ? "'IM Fell English SC', Georgia, serif" : "'IM Fell English', Georgia, serif");
  /** Zeilen bei dieser Grundgröße setzen (umbrechen, wo erlaubt). */
  const layout = (unit) => {
    const out = [];
    rows.forEach((r, i) => {
      ctx.font = `${unit * r.size}px ${family(i)}`;
      if (!r.wrap || ctx.measureText(r.text).width <= maxW) { out.push({ text: r.text, size: r.size, i }); return; }
      let line = "";
      for (const word of r.text.split(" ")) {
        const next = line ? `${line} ${word}` : word;
        if (line && ctx.measureText(next).width > maxW) { out.push({ text: line, size: r.size, i }); line = word; } else line = next;
      }
      if (line) out.push({ text: line, size: r.size, i });
    });
    return out;
  };
  const avail = c.height - pad * 2;
  let unit = PX * 2.3;
  let set = layout(unit);
  for (let k = 0; k < 28 && set.reduce((sum, r) => sum + r.size * 1.28 * unit, 0) > avail; k++) {
    unit *= 0.93;
    set = layout(unit);
  }
  ctx.fillStyle = "#1a1612";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let y = (c.height - set.reduce((sum, r) => sum + r.size * 1.28 * unit, 0)) / 2;
  for (const r of set) {
    let size = unit * r.size;
    ctx.font = `${size}px ${family(r.i)}`;
    const wide = ctx.measureText(r.text).width;
    if (wide > maxW) { size *= maxW / wide; ctx.font = `${size}px ${family(r.i)}`; }
    ctx.globalAlpha = r.i === 0 ? 1 : 0.88;
    ctx.fillText(r.text, c.width / 2, y + (r.size * 1.28 * unit) / 2);
    y += r.size * 1.28 * unit;
  }
  ctx.globalAlpha = 1;
  if (dim) { ctx.fillStyle = "rgba(40,26,14,0.5)"; ctx.fillRect(0, 0, c.width, c.height); }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  // Der Zettel liegt oft quer über den eingeritzten Feldern: in der Tiefe stärker vorgezogen als deren Abziehbild,
  // sonst scheinen die Linien durch das Papier
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 });
  const geo = new THREE.PlaneGeometry(w, h);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.12;
  mesh.receiveShadow = true;
  const group = new THREE.Group();
  group.add(mesh);
  return { group, dispose() { tex.dispose(); mat.dispose(); geo.dispose(); } };
}
/** Flache Holzschale mit Knochen (so viele, wie der Spieler hat; ab 12 wird nicht mehr gestapelt). */
export function makeBonePile(pm, count, rand) {
  const group = new THREE.Group();
  const dish = new THREE.Mesh(lathe([[0, 0], [5.6, 0], [6.4, 0.5], [6.6, 1.3], [6.1, 1.25], [5.4, 0.6], [0, 0.5]], 32), pm.woodDark);
  group.add(dish);
  const shaft = new THREE.CylinderGeometry(0.26, 0.26, 3.4, 8);
  const knob = new THREE.SphereGeometry(0.46, 10, 8);
  const n = Math.min(12, count);
  for (let i = 0; i < n; i++) {
    const bone = new THREE.Group();
    const s = new THREE.Mesh(shaft, pm.bone);
    s.rotation.z = Math.PI / 2;
    bone.add(s);
    for (const [x, z] of [[-1.7, 0.3], [-1.7, -0.3], [1.7, 0.3], [1.7, -0.3]]) {
      const k = new THREE.Mesh(knob, pm.bone);
      k.position.set(x, 0, z);
      bone.add(k);
    }
    const layer = Math.floor(i / 5);
    const a = rand() * Math.PI * 2;
    const r = rand() * (3.4 - layer * 0.9);
    bone.position.set(Math.cos(a) * r, 0.95 + layer * 0.62, Math.sin(a) * r);
    bone.rotation.set((rand() - 0.5) * 0.3, rand() * Math.PI, (rand() - 0.5) * 0.3);
    group.add(bone);
  }
  shadows(group);
  return { group, dispose() { group.traverse((o) => o.geometry?.dispose()); } };
}

/** Messingschale mit Wachsperlen (Wachs) bzw. Salzbrocken (Gezeiten). */
export function makeResourceBowl(mat, pm, count, kind, rand) {
  const group = new THREE.Group();
  const dish = new THREE.Mesh(lathe([[0, 0], [3.6, 0], [4.8, 0.7], [5.2, 1.7], [4.8, 1.65], [4.2, 0.9], [0, 0.6]], 32), pm.brass);
  group.add(dish);
  const pearl = kind === "salt" ? new THREE.OctahedronGeometry(1.0, 0) : new THREE.SphereGeometry(0.95, 16, 12);
  const m = kind === "salt" ? pm.bone : mat.waxPale;
  const n = Math.min(8, count);
  for (let i = 0; i < n; i++) {
    const p = new THREE.Mesh(pearl, m);
    const a = (i / Math.max(1, Math.min(n, 5))) * Math.PI * 2 + (i >= 5 ? 0.6 : 0);
    const r = n === 1 ? 0 : i >= 5 ? 1.0 : 2.1;
    p.position.set(Math.cos(a) * r, 1.45 + (i >= 5 ? 1.2 : 0), Math.sin(a) * r);
    p.rotation.set(rand() * 3, rand() * 3, rand() * 3);
    group.add(p);
  }
  shadows(group);
  return { group, dispose() { group.traverse((o) => o.geometry?.dispose()); } };
}

/** Tintenfass mit Feder — das Werkzeug der Zeichner. */
export function makeInkpot(mat) {
  const group = new THREE.Group();
  const pot = new THREE.Mesh(lathe([[0, 0], [3.4, 0], [3.7, 0.6], [3.6, 3.2], [2.6, 4.4], [1.5, 4.7], [1.5, 5.6], [1.8, 5.8], [0, 5.8]]), mat.inkGlass);
  group.add(pot);
  const quill = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 16, 6), mat.quill);
  shaft.position.y = 8;
  const vane = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 11, 1, 6), mat.quill);
  const vp = vane.geometry.attributes.position;
  for (let k = 0; k < vp.count; k++) {
    const y = vp.getY(k);
    vp.setX(k, vp.getX(k) * Math.sin(((y + 5.5) / 11) * Math.PI) * 1.1 + 0.6);
    vp.setZ(k, Math.sin(y * 0.3) * 0.4);
  }
  vane.geometry.computeVertexNormals();
  vane.position.y = 10.5;
  quill.add(shaft, vane);
  quill.position.set(0.5, 4.6, 0);
  quill.rotation.set(0.45, 0.6, -0.35);
  group.add(quill);
  shadows(group);
  return { group };
}
