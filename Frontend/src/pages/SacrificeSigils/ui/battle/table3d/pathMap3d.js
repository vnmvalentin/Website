// ui/battle/table3d/pathMap3d.js — die Pfadkarte als Gegenstand auf dem 3D-Tisch.
//
// Ein Pergament mit eingerollten Ecken liegt auf dem Tisch. Darauf (als Canvas-Textur) Aquarellflecken in
// der Biom-Farbe, Kaffeeränder, gezeichnete Landschaft, Kompass, Kartusche mit Biom-Name und die Wege in
// Tusche; noch nicht erreichbare Ebenen sind nur gestrichelt. Die Orte sind echte Holzmarken mit dem
// Symbol obenauf, wählbare Marken haben einen pulsierenden Lichtring und heben sich unter dem Zeiger.
// Eine geschnitzte Holzfigur läuft den Weg von unten (Start, nah an der Kamera) nach oben (Boss, hinten).
// Die Bedienung macht das DOM (PathMap3D.jsx): es fragt per pick(), welche Marke unter dem Zeiger liegt.
import * as THREE from "three";
import { reachable, STRANDS } from "../../../engine/path.js";
import { hashParts, streamFrom, rand } from "../../../engine/rng.js";
import { DRAWINGS } from "../../path/mapDrawings.js";

const TW = 1600;
const PAPER_Y = 0.25;
const WALK_S = 0.9;
const INK = "#1a1612";
const ease = (x) => { const t = Math.min(1, Math.max(0, x)); return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2; };

/** Lage eines Orts auf der Karte: u = links→rechts, v = unten (Start)→oben (Boss), beides 0…1. */
function nodeUV(L, pathNo, lv, st) {
  const j = (axis) => (hashParts("mapj", pathNo, lv, st, axis) % 1000) / 1000 - 0.5;
  return {
    u: 0.22 + st * 0.28 + j("x") * 0.07,
    v: (L > 1 ? 0.22 + (lv / (L - 1)) * 0.66 : 0.5) + j("y") * 0.035,
  };
}
const START = { u: 0.5, v: 0.08 };

/** Punkt auf der Tuschekurve zwischen a und b (senkrechter Verlauf, wie die Hochkant-Karte). */
function bezier(a, b, t, out) {
  const my = (a.v + b.v) / 2;
  const u = 1 - t;
  out.u = u * u * u * a.u + 3 * u * u * t * a.u + 3 * u * t * t * b.u + t * t * t * b.u;
  out.v = u * u * u * a.v + 3 * u * u * t * my + 3 * u * t * t * my + t * t * t * b.v;
  return out;
}

/** Symbol eines Orts (Tusche auf hellem Pergament), Fragezeichen für Orte im Nebel. */
function iconTexture(type, iconPaths, boss = false) {
  const S = 128;
  const c = document.createElement("canvas");
  c.width = S;
  c.height = S;
  const ctx = c.getContext("2d");
  ctx.fillStyle = type === "fog" ? "#8f8366" : boss ? "#e0c79a" : "#ecdfbd";
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = boss ? "#5a1010" : INK;
  ctx.lineWidth = boss ? 7 : 4;
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S / 2 - 6, 0, Math.PI * 2);
  ctx.stroke();
  if (type === "fog") {
    ctx.fillStyle = "rgba(26,22,18,0.75)";
    ctx.font = "700 64px Georgia, serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("?", S / 2, S / 2 + 4);
  } else {
    const k = (S * 0.62) / 24;
    ctx.save();
    ctx.translate(S / 2 - 12 * k, S / 2 - 12 * k);
    ctx.scale(k, k);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.7;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke(new Path2D(iconPaths[type] || iconPaths.event));
    ctx.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Weiche dunkle Scheibe als Schatten unter dem Pergament. */
function shadowTexture() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(64, 64, 20, 64, 64, 64);
  g.addColorStop(0, "rgba(0,0,0,0.55)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/**
 * @param {THREE.Scene} scene
 * @param {{ iconPaths: Record<string, string>, maxAniso: number }} opts
 */
export function createPathMap(scene, { iconPaths, maxAniso }) {
  const root = new THREE.Group();
  root.visible = false;
  scene.add(root);
  const disposables = [];
  const keep = (x) => { disposables.push(x); return x; };

  // ── Pergament ──
  const canvas = document.createElement("canvas");
  canvas.width = TW;
  canvas.height = TW;
  const ctx = canvas.getContext("2d");
  const bg = document.createElement("canvas");
  const tex = keep(new THREE.CanvasTexture(canvas));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  const paperMat = keep(new THREE.MeshStandardMaterial({
    map: tex, roughness: 0.9, metalness: 0, side: THREE.DoubleSide,
    emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.28,
  }));
  let paper = null;
  const shadow = new THREE.Mesh(keep(new THREE.PlaneGeometry(1, 1)), keep(new THREE.MeshBasicMaterial({
    map: keep(shadowTexture()), transparent: true, depthWrite: false,
  })));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.06;
  root.add(shadow);

  // ── Marken und Figur ──
  const woodMat = keep(new THREE.MeshStandardMaterial({ color: 0x5a3a20, roughness: 0.7 }));
  const tokenGeo = keep(new THREE.CylinderGeometry(1, 1.08, 1, 32).translate(0, 0.5, 0));
  const topGeo = keep(new THREE.CircleGeometry(0.93, 32).rotateX(-Math.PI / 2));
  const ringGeo = keep(new THREE.TorusGeometry(1, 0.07, 8, 48).rotateX(Math.PI / 2));
  const sealGeo = keep(new THREE.TorusGeometry(1, 0.12, 8, 40).rotateX(Math.PI / 2));
  const glowMat = keep(new THREE.MeshBasicMaterial({ color: 0xffc46a, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
  const sealMat = keep(new THREE.MeshStandardMaterial({ color: 0x7a1414, roughness: 0.45 }));
  const icons = new Map();
  const iconOf = (type, boss) => {
    const key = `${type}${boss ? "!" : ""}`;
    if (!icons.has(key)) icons.set(key, keep(iconTexture(type, iconPaths, boss)));
    return icons.get(key);
  };

  const pawn = new THREE.Group();
  {
    const wood = keep(new THREE.MeshStandardMaterial({ color: 0x9a6a3c, roughness: 0.6 }));
    const body = new THREE.Mesh(keep(new THREE.LatheGeometry([
      [0, 0], [2.4, 0], [2.4, 0.7], [1.7, 1.1], [1.15, 2.0], [1.45, 4.0], [0.95, 5.4], [0.55, 6.0], [0, 6.1],
    ].map(([r, y]) => new THREE.Vector2(r, y)), 24)), wood);
    const head = new THREE.Mesh(keep(new THREE.SphereGeometry(1.25, 20, 14)), wood);
    head.position.y = 7.1;
    const collar = new THREE.Mesh(keep(new THREE.TorusGeometry(1.0, 0.18, 8, 24).rotateX(Math.PI / 2)), keep(new THREE.MeshStandardMaterial({ color: 0x5a1010, roughness: 0.5 })));
    collar.position.y = 5.7;
    pawn.add(body, head, collar);
  }
  root.add(pawn);

  /** @type {Array<{ group: THREE.Group, base: THREE.Mesh, top: THREE.Mesh, ring: THREE.Mesh, seal: THREE.Mesh, lv: number, st: number, r: number, uv: {u:number,v:number}, fog: boolean, revealAt: number, lift: number }>} */
  let tokens = [];
  const area = { cx: 0, cz: 0, W: 100, D: 120 };
  let data = null;
  let mapKey = "";
  let appearAt = -10;
  let hover = null;
  const walk = { from: { ...START }, to: { ...START }, t0: -10, key: "" };

  const world = (uv, out = new THREE.Vector3()) => out.set(area.cx + (uv.u - 0.5) * area.W, 0, area.cz + (0.5 - uv.v) * area.D);
  const TH = () => Math.round(TW * Math.min(1.8, Math.max(0.6, area.D / area.W)));
  const px = (uv) => [uv.u * TW, (1 - uv.v) * canvas.height];

  /** Feste Gestaltung je Karte: Grundton, Aquarell, Kaffeeränder, Landschaft, Kompass, Ränder. */
  const paintBackground = () => {
    const { map, biome } = data;
    const H = TH();
    if (canvas.height !== H) {
      // neue Größe: die Textur muss auf der Grafikkarte neu angelegt werden, sonst bleibt der alte Speicher
      canvas.height = H;
      tex.dispose();
    }
    bg.width = TW;
    bg.height = H;
    const b = bg.getContext("2d");
    const pal = biome?.palette || { wash: "#6f7a5a", ink: INK, accent: "#c9d18a" };
    b.fillStyle = "#d9c9a3";
    b.fillRect(0, 0, TW, H);
    let g = b.createRadialGradient(TW * 0.2, H * 0.2, 0, TW * 0.2, H * 0.2, TW * 0.6);
    g.addColorStop(0, "rgba(255,255,255,0.25)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    b.fillStyle = g;
    b.fillRect(0, 0, TW, H);
    const s = streamFrom("mapdeco3d", map.pathNo, biome?.id || "");
    // Aquarellflecken
    b.save();
    b.filter = "blur(38px)";
    for (let i = 0; i < 8; i++) {
      b.globalAlpha = 0.12 + rand(s) * 0.16;
      b.fillStyle = pal.wash;
      b.beginPath();
      b.ellipse(rand(s) * TW, rand(s) * H, 120 + rand(s) * 260, 90 + rand(s) * 180, rand(s) * 3, 0, Math.PI * 2);
      b.fill();
    }
    b.restore();
    // Fasern
    for (let i = 0; i < 3000; i++) {
      b.fillStyle = rand(s) < 0.6 ? `rgba(90,60,20,${0.03 + rand(s) * 0.05})` : `rgba(255,250,235,${0.03 + rand(s) * 0.05})`;
      b.fillRect(rand(s) * TW, rand(s) * H, 1 + rand(s) * 4, 1 + rand(s) * 2);
    }
    // Kaffeeränder
    b.save();
    b.filter = "blur(2px)";
    b.strokeStyle = "rgba(107,74,42,0.16)";
    b.lineWidth = 9;
    for (let i = 0; i < 2; i++) {
      b.beginPath();
      b.arc(rand(s) * TW, rand(s) * H, 60 + rand(s) * 50, 0, Math.PI * 2);
      b.stroke();
    }
    b.restore();
    // Landschaft (Federzeichnungen des Bioms), nicht auf Orten und Wegen
    const L = map.levels;
    const kinds = biome?.decor?.length ? biome.decor : ["schilf", "pfahl"];
    const spots = [START, ...map.nodes.flatMap((row, lv) => row.map((_, st) => nodeUV(L, map.pathNo, lv, st)))];
    b.save();
    b.strokeStyle = INK;
    b.globalAlpha = 0.55;
    b.lineCap = "round";
    b.lineJoin = "round";
    let placed = 0;
    for (let i = 0; i < 300 && placed < 10 + L * 3; i++) {
      const uv = { u: 0.05 + rand(s) * 0.9, v: 0.06 + rand(s) * 0.88 };
      const scale = 2.6 + rand(s) * 1.8;
      const flip = rand(s) < 0.5;
      if (spots.some((p) => Math.hypot((p.u - uv.u) * TW, (p.v - uv.v) * H) < 150)) continue;
      // Kartusche (unten links) und Kompass (oben rechts) freihalten
      if ((uv.u < 0.36 && uv.v < 0.16) || (uv.u > 0.8 && uv.v > 0.84)) continue;
      const kind = kinds[placed % kinds.length];
      if (!DRAWINGS[kind]) continue;
      const [x, y] = px(uv);
      b.save();
      b.translate(x, y);
      b.scale(flip ? -scale : scale, scale);
      b.lineWidth = 1.2;
      b.stroke(new Path2D(DRAWINGS[kind]));
      b.restore();
      placed++;
    }
    b.restore();
    // Kompass oben rechts
    {
      const cx = TW - 120, cy = 120, r = 62;
      b.save();
      b.strokeStyle = pal.ink || INK;
      b.lineWidth = 2.5;
      b.beginPath();
      b.arc(cx, cy, r, 0, Math.PI * 2);
      b.stroke();
      b.fillStyle = "#ecdfbd";
      b.beginPath();
      b.moveTo(cx, cy - r - 6); b.lineTo(cx + 12, cy); b.lineTo(cx, cy + r + 6); b.lineTo(cx - 12, cy); b.closePath();
      b.fill();
      b.stroke();
      b.fillStyle = "#5a1010";
      b.beginPath();
      b.moveTo(cx, cy - r - 6); b.lineTo(cx + 12, cy); b.lineTo(cx - 12, cy); b.closePath();
      b.fill();
      b.fillStyle = INK;
      b.font = "600 26px 'IM Fell English SC', Georgia, serif";
      b.textAlign = "center";
      b.fillText("N", cx, cy - r - 14);
      b.restore();
    }
    // Ränder: Bräunung nach innen
    const edge = (x0, y0, x1, y1, rx, ry, rw, rh) => {
      const lg = b.createLinearGradient(x0, y0, x1, y1);
      lg.addColorStop(0, "rgba(70,40,12,0.75)");
      lg.addColorStop(0.25, "rgba(90,60,20,0.3)");
      lg.addColorStop(1, "rgba(90,60,20,0)");
      b.fillStyle = lg;
      b.fillRect(rx, ry, rw, rh);
    };
    const E = 90;
    edge(0, 0, E, 0, 0, 0, E, H);
    edge(TW, 0, TW - E, 0, TW - E, 0, E, H);
    edge(0, 0, 0, E, 0, 0, TW, E);
    edge(0, H, 0, H - E, 0, H - E, TW, E);
  };

  /** Veränderliches: Wege (gesehen = Tusche, sonst gestrichelt), Fußspuren, Start, Kartusche. */
  const paintDynamic = () => {
    const { map, pp, biome, cycle, subtitle } = data;
    const L = map.levels;
    const visibleUpTo = pp ? pp.level + 1 : L;
    const ink = biome?.palette?.ink || INK;
    ctx.drawImage(bg, 0, 0);
    ctx.lineCap = "round";
    const curve = (a, b) => {
      const [ax, ay] = px(a);
      const [bx, by] = px(b);
      const my = (ay + by) / 2;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.bezierCurveTo(ax, my, bx, my, bx, by);
      ctx.stroke();
    };
    const uvOf = (lv, st) => nodeUV(L, map.pathNo, lv, st);
    for (let lv = 0; lv < L; lv++) {
      const seen = lv <= visibleUpTo;
      ctx.strokeStyle = ink;
      ctx.globalAlpha = seen ? 0.85 : 0.2;
      ctx.lineWidth = seen ? 4.2 : 3;
      ctx.setLineDash(seen ? [] : [10, 16]);
      for (let st = 0; st < STRANDS; st++) {
        if (lv === 0) curve(START, uvOf(0, st));
        else for (const to of reachable(st)) curve(uvOf(lv - 1, st), uvOf(lv, to));
      }
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    // Fußspuren des gegangenen Wegs
    const route = pp?.route || [];
    ctx.strokeStyle = "#5a1010";
    ctx.lineWidth = 8;
    ctx.setLineDash([5, 24]);
    ctx.globalAlpha = 0.8;
    let prev = START;
    route.forEach((st, lv) => { const n = uvOf(lv, st); curve(prev, n); prev = n; });
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    // Startpunkt
    const [sx, sy] = px(START);
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.arc(sx, sy, 14, 0, Math.PI * 2);
    ctx.fill();
    // Kartusche unten links
    const title = `${biome?.name || "Die Moorkarte"}${cycle ? ` · Stufe ${cycle + 1}` : ""}`;
    const H = canvas.height;
    ctx.font = "600 44px 'IM Fell English SC', Georgia, serif";
    const tw = Math.max(ctx.measureText(title).width, 260);
    const bx = 60, by = H - 190, bw = tw + 64, bh = subtitle ? 128 : 92;
    ctx.fillStyle = "#e6d9b8";
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.strokeRect(bx, by, bw, bh);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(bx - 8, by - 8, bw + 16, bh + 16);
    ctx.fillStyle = INK;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(title, bx + 32, by + 62);
    if (subtitle) {
      ctx.font = "500 28px 'EB Garamond', Georgia, serif";
      ctx.fillText(subtitle, bx + 32, by + 104);
    }
    tex.needsUpdate = true;
  };

  /** Pergament-Fläche mit leicht hochgebogenen Ecken in der aktuellen Größe. */
  const buildPaper = () => {
    if (paper) { root.remove(paper); paper.geometry.dispose(); }
    const geo = new THREE.PlaneGeometry(area.W, area.D, 30, 30);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const nx = Math.abs(pos.getX(i)) / (area.W / 2);
      const ny = Math.abs(pos.getY(i)) / (area.D / 2);
      const curl = Math.max(0, nx - 0.82) / 0.18;
      const curlY = Math.max(0, ny - 0.86) / 0.14;
      pos.setZ(i, 1.4 * curl * curl * curl + 0.8 * curlY * curlY * curlY * (0.5 + 0.5 * nx) + 0.04 * Math.sin(pos.getX(i) * 0.4 + pos.getY(i) * 0.3));
    }
    geo.computeVertexNormals();
    paper = new THREE.Mesh(geo, paperMat);
    paper.rotation.x = -Math.PI / 2;
    paper.position.set(area.cx, PAPER_Y, area.cz);
    root.add(paper);
    shadow.scale.set(area.W * 1.12, area.D * 1.1, 1);
    shadow.position.set(area.cx + 1.5, 0.06, area.cz + 2);
  };

  /** Marken neu aufbauen (neue Karte) bzw. nur umsetzen (neue Fläche). */
  const buildTokens = () => {
    for (const tk of tokens) root.remove(tk.group);
    tokens = [];
    const { map } = data;
    const L = map.levels;
    const scale = Math.min(1.25, Math.max(0.7, area.W / 100));
    map.nodes.forEach((row, lv) => row.forEach((node, st) => {
      const boss = node.type === "boss";
      const r = (boss ? 6.6 : 4.6) * scale;
      const group = new THREE.Group();
      const base = new THREE.Mesh(tokenGeo, woodMat);
      base.scale.set(r, 1.3, r);
      base.userData.node = { lv, st };
      const top = new THREE.Mesh(topGeo, new THREE.MeshStandardMaterial({ map: iconOf("fog"), roughness: 0.75 }));
      top.scale.set(r, 1, r);
      top.position.y = 1.31;
      const ring = new THREE.Mesh(ringGeo, glowMat);
      ring.scale.set(r + 1.4, 1, r + 1.4);
      ring.position.y = 0.3;
      ring.visible = false;
      const seal = new THREE.Mesh(sealGeo, sealMat);
      seal.scale.set(r * 0.78, 1, r * 0.78);
      seal.position.y = 1.36;
      seal.visible = false;
      group.add(base, top, ring, seal);
      root.add(group);
      tokens.push({ group, base, top, ring, seal, lv, st, r, node, uv: nodeUV(L, map.pathNo, lv, st), fog: true, revealAt: -10, lift: 0 });
    }));
    pawn.scale.setScalar(scale);
    placeTokens();
  };
  const placeTokens = () => {
    for (const tk of tokens) world(tk.uv, tk.group.position);
  };

  /** Zustand der Marken aus dem Pfad-Fortschritt. */
  const refreshTokens = (t) => {
    const { map, pp } = data;
    const L = map.levels;
    const visibleUpTo = pp ? pp.level + 1 : L;
    const options = pp && !pp.scene && !pp.done && !data.disabled ? reachable(pp.strand) : [];
    for (const tk of tokens) {
      const fog = tk.lv > visibleUpTo;
      if (fog !== tk.fog) {
        tk.fog = fog;
        tk.revealAt = t + Math.max(0, tk.lv - (pp?.level ?? 0)) * 0.12;
        tk.top.material.map = fog ? iconOf("fog") : iconOf(tk.node.type, tk.node.type === "boss");
        tk.top.material.needsUpdate = true;
      }
      const onRoute = pp?.route?.[tk.lv] === tk.st;
      const past = pp && tk.lv < pp.level && !onRoute;
      tk.option = !!pp && pp.level === tk.lv && options.includes(tk.st);
      tk.seal.visible = onRoute;
      tk.ring.visible = tk.option;
      const dim = fog ? 0.55 : past ? 0.5 : 1;
      tk.top.material.color.setScalar(dim);
    }
  };

  /** Ziel der Figur: zuletzt gewählter Ort, sonst der Start. */
  const pawnTarget = () => {
    const { map, pp } = data;
    const route = pp?.route || [];
    if (!route.length) return { uv: START, key: "start" };
    const lv = route.length - 1;
    return { uv: nodeUV(map.levels, map.pathNo, lv, route[lv]), key: `${lv}-${route[lv]}` };
  };

  const tmpV = new THREE.Vector3();
  const tmpUV = { u: 0, v: 0 };
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  return {
    /** Kartendaten setzen (null = Karte weg). */
    setData(next, t) {
      if (!next) { data = null; root.visible = false; mapKey = ""; return; }
      const key = `${next.map.pathNo}-${next.biome?.id || ""}-${next.cycle || 0}-${next.map.levels}`;
      const fresh = key !== mapKey;
      data = next;
      if (fresh) {
        mapKey = key;
        paintBackground();
        buildPaper();
        buildTokens();
        appearAt = t;
        const pt = pawnTarget();
        walk.from = pt.uv; walk.to = pt.uv; walk.key = pt.key; walk.t0 = -10;
      }
      paintDynamic();
      refreshTokens(t);
      const pt = pawnTarget();
      if (pt.key !== walk.key) {
        walk.from = walk.to;
        walk.to = pt.uv;
        walk.key = pt.key;
        walk.t0 = t;
      }
      root.visible = true;
    },
    /** Lage auf dem Tisch: Mitte und Größe (Tischeinheiten). */
    setArea(cx, cz, W, D) {
      const sizeChanged = Math.abs(W - area.W) > 0.5 || Math.abs(D - area.D) > 0.5;
      Object.assign(area, { cx, cz, W, D });
      if (!data) return;
      if (sizeChanged) { paintBackground(); paintDynamic(); buildPaper(); buildTokens(); refreshTokens(0); }
      else { buildPaper(); placeTokens(); }
    },
    setHover(node) { hover = node; },
    /** Welche Marke liegt unter dem Bildpunkt (NDC)? */
    pick(nx, ny, camera) {
      if (!root.visible || !tokens.length) return null;
      ndc.set(nx, ny);
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(tokens.map((tk) => tk.base), false);
      return hits.length ? { ...hits[0].object.userData.node } : null;
    },
    /** Bildschirmposition (NDC) über einer Marke — für die Vorschau. */
    nodeNdc(lv, st, camera) {
      const tk = tokens.find((x) => x.lv === lv && x.st === st);
      if (!tk) return null;
      tmpV.copy(tk.group.position);
      tmpV.y += 3;
      return tmpV.project(camera);
    },
    /** Ein Bild weiter; gibt zurück, ob sich noch etwas bewegt. */
    update(t, reduced) {
      if (!root.visible || !data) return false;
      let moving = false;
      // Auflegen: das Pergament senkt sich auf den Tisch
      const drop = reduced ? 1 : ease((t - appearAt) / 0.6);
      root.position.y = (1 - drop) * 8;
      if (drop < 1) moving = true;
      for (const tk of tokens) {
        const k = reduced ? 1 : ease((t - tk.revealAt) / 0.45);
        if (k < 1) moving = true;
        const goalLift = hover && tk.option && hover.lv === tk.lv && hover.st === tk.st ? 1.6 : 0;
        tk.lift += (goalLift - tk.lift) * (reduced ? 1 : 0.25);
        if (Math.abs(goalLift - tk.lift) > 0.01) moving = true;
        tk.group.scale.set(1, Math.max(0.05, tk.fog ? 0.5 : 0.3 + 0.7 * k), 1);
        tk.group.position.y = PAPER_Y + 0.05 + tk.lift;
        if (tk.option) {
          tk.ring.material.opacity = reduced ? 0.7 : 0.45 + 0.3 * Math.sin(t * 4);
          moving = true;
        }
      }
      // Figur: läuft den Weg entlang (kleine Hüpfer pro Schritt), sonst steht sie auf ihrem Ort
      const wk = reduced ? 1 : Math.min(1, (t - walk.t0) / WALK_S);
      bezier(walk.from, walk.to, ease(wk), tmpUV);
      world(tmpUV, pawn.position);
      const onTokenH = walk.key === "start" ? 0 : 1.36;
      const standing = tokens.find((tk) => walk.key === `${tk.lv}-${tk.st}`);
      pawn.position.y = PAPER_Y + (wk < 1 ? 0.6 + Math.abs(Math.sin(wk * Math.PI * 4)) * 1.4 : onTokenH * (standing ? standing.group.scale.y : 1) + (standing?.lift || 0));
      if (wk < 1) {
        moving = true;
        bezier(walk.from, walk.to, Math.min(1, ease(wk) + 0.02), tmpUV);
        world(tmpUV, tmpV);
        const dx = tmpV.x - pawn.position.x, dz = tmpV.z - pawn.position.z;
        if (Math.hypot(dx, dz) > 1e-3) pawn.rotation.y = Math.atan2(dx, dz);
        pawn.rotation.z = Math.sin(wk * Math.PI * 8) * 0.08;
      } else {
        pawn.rotation.y += (0 - pawn.rotation.y) * 0.1;
        pawn.rotation.z = 0;
      }
      return moving;
    },
    /** Läuft die Figur gerade? (für die Schrittgeräusche) */
    walking(t) { return t - walk.t0 < WALK_S; },
    dispose() {
      for (const tk of tokens) tk.top.material.dispose();
      if (paper) paper.geometry.dispose();
      for (const d of disposables) d.dispose?.();
      pawn.traverse((o) => o.geometry?.dispose?.());
      scene.remove(root);
    },
  };
}
