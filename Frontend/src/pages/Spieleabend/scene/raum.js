// scene/raum.js — das Spielzimmer: Holzboden, runder Teppich, Wände mit Holzverkleidung, ein echtes Fenster in der
// Rückwand (Laibung, Sprossen, Glas, Kerze auf der Fensterbank, draußen verschneite Häuser: draussen.js), das
// Spieleregal (regal.js), Sofa mit Couchtisch, Chipsschale und Limo, Stehlampe, Pflanze, Bilder und der runde Tisch mit
// Hängelampe darüber. HINDERNISSE beschreibt, wo Blobs beim Laufen nicht hindurchkommen.
// Zum Anfassen: die unteren Fensterflügel gehen auf (Schneeflocken wehen herein, draußen auf dem Sims liegt Schnee),
// der Lichtschalter neben der Tür macht das Licht aus (dann scheinen nur Kerze und Mond, mit Fensterkreuz-Schatten).
//
// Alles aus einfachen Körpern; Muster (Dielen, Teppich, Tapete, Himmel) malt ein Canvas. Tischplatte liegt bei y = 0,
// der Boden bei BODEN. Die Stühle setzt zimmerSzene.js selbst (sie hängen an der Sitzordnung).
import * as THREE from "three";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import { buildDraussen } from "./draussen.js";
import { buildRegal } from "./regal.js";
import { bogenhanf, pflanzeEntsorgen } from "./pflanzen.js";

export const BODEN = -1.55;
export const TISCH_R = 2.05;
export const RAUM = 8; // halbe Kantenlänge des Zimmers
const WAND_H = 6.4;
// Fenster in der Rückwand: Breite, Höhe, Mitte (Weltkoordinaten)
const FB = 3.2;
const FH = 2.3;
const FY = BODEN + 3.2;
const LAIBUNG = 0.45;
// Spieleregal an der Rückwand links, Couchtisch mit Chips vor dem Sofa, Umkleide an der linken Wand vorne
export const REGAL = { x: -5.2, z: -RAUM + 0.34 };
export const COUCHTISCH = { x: 4.45, z: -4.45 };
export const UMKLEIDE = { z: 4.0, spiegelX: -RAUM + 0.42, stehX: -6.25 };
// Eingangstür vorne rechts: hier kommen neue Leute herein (Backend/spieleabend/zimmer.js TUER)
export const TUER = { x: 5.2 };
// Lichtschalter links neben der Tür (vordere Wand) und wo man davor steht
export const LICHTSCHALTER = { x: 3.95, y: BODEN + 2.05, z: RAUM - 0.03, steh: { x: 3.95, z: 6.85 } };
// Vor dem Fenster stehen (Schnee holen; Backend zimmer.js FENSTER prüft die Nähe)
export const FENSTER = { x: 0, z: -6.75, blick: Math.PI, bankY: FY - FH / 2, bankZ: -RAUM + 0.04 };
// Sofa rechts hinten, schräg zur Zimmermitte; drei Sitzplätze (Backend zimmer.js SOFA_PLAETZE)
export const SOFA = { x: 5.6, z: -5.6, r: -Math.PI / 4, sitzY: BODEN + 1.06 };
const SOFA_SITZE = [[-1.05, 0.12], [0, 0.12], [1.05, 0.12]];
const SOFA_AUFSTEHEN = [[-1.3, 1.45], [-1.45, 1.95], [1.3, 1.45]];
/** Lokaler Punkt des Sofas (lx seitlich, lz nach vorn) in Weltkoordinaten. */
function sofaPunkt(lx, lz) {
  const c = Math.cos(SOFA.r);
  const s = Math.sin(SOFA.r);
  return { x: SOFA.x + c * lx + s * lz, z: SOFA.z - s * lx + c * lz };
}
/** Sofaplatz i: wo der Blob sitzt (x, z, Blick r) und wo er beim Aufstehen landet (steh). */
export function sofaPlatz(i) {
  const [lx, lz] = SOFA_SITZE[i] || SOFA_SITZE[0];
  const [ax, az] = SOFA_AUFSTEHEN[i] || SOFA_AUFSTEHEN[0];
  return { ...sofaPunkt(lx, lz), r: SOFA.r, steh: sofaPunkt(ax, az) };
}
const BLOB = 0.45; // Radius eines laufenden Blobs
// Wo Blobs nicht hinkönnen (schon um den Blob-Radius vergrößert): Tisch samt Stühlen, Sofa, Couchtisch, Stehlampe,
// Pflanze, Regal; dazu die Wände (grenze)
export const HINDERNISSE = {
  grenze: RAUM - 0.25 - BLOB,
  kreise: [
    { x: 0, z: 0, r: 3.1 + BLOB },
    { x: 6.2, z: -5.0, r: 0.85 + BLOB },
    { x: 5.0, z: -6.2, r: 0.85 + BLOB },
    { x: 5.6, z: -5.6, r: 0.85 + BLOB },
    { x: COUCHTISCH.x, z: COUCHTISCH.z, r: 0.62 + BLOB },
    { x: 7.0, z: -3.2, r: 0.35 + BLOB },
    { x: -6.6, z: 6.2, r: 0.45 + BLOB },
  ],
  rechtecke: [
    { x0: REGAL.x - 1.65 - BLOB, x1: REGAL.x + 1.65 + BLOB, z0: -RAUM, z1: REGAL.z + 0.3 + BLOB },
    // Umkleide: Paravent, Spiegel, Kleiderständer an der linken Wand
    { x0: -RAUM, x1: -RAUM + 1.05 + BLOB, z0: UMKLEIDE.z - 2.2 - BLOB, z1: UMKLEIDE.z + 1.9 + BLOB },
  ],
};

function canvasTextur(w, h, malen, { wiederholen = null } = {}) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  malen(c.getContext("2d"), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  if (wiederholen) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(wiederholen[0], wiederholen[1]);
  }
  return tex;
}

// kleiner fester Zufall, damit das Zimmer bei allen gleich aussieht
function zufall(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function dielen(ctx, w, h) {
  const rnd = zufall(11);
  const reihen = 8;
  const rh = h / reihen;
  for (let r = 0; r < reihen; r += 1) {
    let x = -rnd() * 200;
    while (x < w) {
      const len = 160 + rnd() * 220;
      const t = rnd();
      ctx.fillStyle = `rgb(${Math.round(112 + t * 34)}, ${Math.round(72 + t * 22)}, ${Math.round(44 + t * 14)})`;
      ctx.fillRect(x, r * rh, len, rh);
      // Maserung
      ctx.strokeStyle = "rgba(60, 34, 18, 0.18)";
      ctx.lineWidth = 1;
      for (let k = 0; k < 4; k += 1) {
        const y = r * rh + 4 + rnd() * (rh - 8);
        ctx.beginPath();
        ctx.moveTo(x + 4, y);
        ctx.bezierCurveTo(x + len * 0.3, y + rnd() * 6 - 3, x + len * 0.7, y + rnd() * 6 - 3, x + len - 4, y);
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(40, 22, 12, 0.55)";
      ctx.fillRect(x, r * rh, 2, rh);
      x += len;
    }
    ctx.fillStyle = "rgba(40, 22, 12, 0.6)";
    ctx.fillRect(0, r * rh, w, 2);
  }
}

function teppich(ctx, w, h) {
  const cx = w / 2;
  const cy = h / 2;
  const ringe = [
    [1, "#7a2633"], [0.93, "#d9a441"], [0.9, "#7a2633"], [0.74, "#2c4a5a"], [0.7, "#d9a441"], [0.67, "#8c2f3c"],
    [0.45, "#d9a441"], [0.42, "#2c4a5a"], [0.2, "#d9a441"], [0.16, "#8c2f3c"],
  ];
  for (const [r, f] of ringe) {
    ctx.fillStyle = f;
    ctx.beginPath();
    ctx.arc(cx, cy, (w / 2) * r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Rautenkranz
  ctx.fillStyle = "#e8c070";
  for (let i = 0; i < 24; i += 1) {
    const a = (i / 24) * Math.PI * 2;
    const r = (w / 2) * 0.56;
    ctx.save();
    ctx.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(-14, 0);
    ctx.lineTo(0, -8);
    ctx.lineTo(14, 0);
    ctx.lineTo(0, 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function tapete(ctx, w, h) {
  ctx.fillStyle = "#2c4743";
  ctx.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 32) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.035)";
    ctx.fillRect(x, 0, 12, h);
  }
  // kleine Blüten in Reihen
  ctx.fillStyle = "rgba(226, 198, 140, 0.16)";
  for (let y = 24; y < h; y += 64) {
    for (let x = (y / 64) % 2 ? 22 : 54; x < w; x += 64) {
      for (let k = 0; k < 4; k += 1) {
        const a = (k / 4) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * 5, y + Math.sin(a) * 5, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function bild(seed) {
  return (ctx, w, h) => {
    const rnd = zufall(seed);
    const farben = ["#e07a5f", "#3d405b", "#81b29a", "#f2cc8f", "#f4f1de", "#c8553d"];
    ctx.fillStyle = "#f2e8cf";
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 7; i += 1) {
      ctx.fillStyle = farben[Math.floor(rnd() * farben.length)];
      if (rnd() < 0.5) {
        ctx.beginPath();
        ctx.arc(rnd() * w, rnd() * h, 14 + rnd() * 40, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(rnd() * w * 0.8, rnd() * h * 0.8, 20 + rnd() * 70, 14 + rnd() * 50);
      }
    }
  };
}

/** Baut das Zimmer. Gibt Gruppe, die Lampenlichter (für leichtes Flackern) und Aufräumen zurück. */
/** @param {{ low?: boolean, spiele: { id: string, name: string }[] }} opts  spiele: Kartons im Regal */
export function buildRaum({ low = false, spiele = [] } = {}) {
  const root = new THREE.Group();
  const geos = [];
  const mats = [];
  const texs = [];
  const mat = (o) => {
    const m = new THREE.MeshStandardMaterial({ roughness: 0.8, ...o });
    mats.push(m);
    return m;
  };
  const mesh = (geo, m, schatten = true) => {
    geos.push(geo);
    const x = new THREE.Mesh(geo, m);
    x.castShadow = schatten && !low;
    x.receiveShadow = !low;
    return x;
  };
  const tex = (...a) => {
    const t = canvasTextur(...a);
    texs.push(t);
    return t;
  };

  // Boden und Teppich
  const boden = mesh(new THREE.PlaneGeometry(RAUM * 2, RAUM * 2), mat({ map: tex(512, 512, dielen, { wiederholen: [3, 3] }), roughness: 0.7 }), false);
  boden.rotation.x = -Math.PI / 2;
  boden.position.y = BODEN;
  root.add(boden);
  const tep = mesh(new THREE.CircleGeometry(4.3, 64), mat({ map: tex(512, 512, teppich), roughness: 1 }), false);
  tep.rotation.x = -Math.PI / 2;
  tep.position.y = BODEN + 0.012;
  root.add(tep);

  // Wände mit Tapete, unten Holzverkleidung, oben Leiste
  const tapetenTex = tex(256, 256, tapete, { wiederholen: [6, 2.4] });
  const wandMat = mat({ map: tapetenTex, roughness: 0.95 });
  const holz = mat({ color: "#5a3a24", roughness: 0.6 });
  const holzHell = mat({ color: "#8a5a36", roughness: 0.55 });
  // Wände merken: steht die Kamera dahinter (Laufen, Blick von oben), blendet zimmerSzene.js sie aus
  const waende = [];
  for (let i = 0; i < 4; i += 1) {
    const w = new THREE.Group();
    let wand;
    if (i === 0) {
      // Rückwand: Fläche mit Loch für das Fenster; UV aus der Lage, damit die Tapete wie auf den anderen Wänden sitzt
      const form = new THREE.Shape();
      form.moveTo(-RAUM, BODEN);
      form.lineTo(RAUM, BODEN);
      form.lineTo(RAUM, BODEN + WAND_H);
      form.lineTo(-RAUM, BODEN + WAND_H);
      form.closePath();
      const loch = new THREE.Path();
      loch.moveTo(-FB / 2, FY - FH / 2);
      loch.lineTo(-FB / 2, FY + FH / 2);
      loch.lineTo(FB / 2, FY + FH / 2);
      loch.lineTo(FB / 2, FY - FH / 2);
      loch.closePath();
      form.holes.push(loch);
      const geo = new THREE.ShapeGeometry(form);
      const p = geo.attributes.position;
      const uv = geo.attributes.uv;
      for (let k = 0; k < p.count; k += 1) uv.setXY(k, (p.getX(k) + RAUM) / (RAUM * 2), (p.getY(k) - BODEN) / WAND_H);
      wand = mesh(geo, wandMat, false);
    } else {
      wand = mesh(new THREE.PlaneGeometry(RAUM * 2, WAND_H), wandMat, false);
      wand.position.y = BODEN + WAND_H / 2;
    }
    const paneel = mesh(new THREE.BoxGeometry(RAUM * 2, 1.15, 0.08), holz, false);
    paneel.position.set(0, BODEN + 0.575, 0.04);
    const leiste = mesh(new THREE.BoxGeometry(RAUM * 2, 0.08, 0.14), holzHell, false);
    leiste.position.set(0, BODEN + 1.17, 0.07);
    const decke = mesh(new THREE.BoxGeometry(RAUM * 2, 0.16, 0.16), holzHell, false);
    decke.position.set(0, BODEN + WAND_H - 0.08, 0.08);
    w.add(wand, paneel, leiste, decke);
    w.rotation.y = (i * Math.PI) / 2;
    w.position.set(Math.sin((i * Math.PI) / 2 + Math.PI) * RAUM, 0, Math.cos((i * Math.PI) / 2 + Math.PI) * RAUM);
    root.add(w);
    // innen liegt die Seite, auf die die Wand schaut: i 0 → z > −8, 1 → x > −8, 2 → z < 8, 3 → x < 8
    waende.push({ gruppe: w, achse: i % 2 ? "x" : "z", innen: i < 2 ? 1 : -1, wert: i < 2 ? -RAUM : RAUM });
  }
  const deckeM = mesh(new THREE.PlaneGeometry(RAUM * 2, RAUM * 2), mat({ color: "#1e1a1c", roughness: 1 }), false);
  deckeM.rotation.x = Math.PI / 2;
  deckeM.position.y = BODEN + WAND_H;
  root.add(deckeM);

  // Fenster hinten (−z): Laibung in der Wandstärke, Rahmen mit Sprossen, Glas, Fensterbank mit Kerze und Pflanze.
  // Draußen (draussen.js) liegen Himmel, Häuser und Schnee mit echter Tiefe.
  const fenster = new THREE.Group();
  const putz = mat({ color: "#d8ccb2", roughness: 0.95 });
  const rahmenMat = mat({ color: "#ece4d2", roughness: 0.5 });
  const laibung = (w, h, x, y) => {
    const m = mesh(new THREE.BoxGeometry(w, h, LAIBUNG), putz, false);
    m.position.set(x, y, -LAIBUNG / 2);
    fenster.add(m);
  };
  laibung(0.1, FH + 0.2, -FB / 2 - 0.05, 0);
  laibung(0.1, FH + 0.2, FB / 2 + 0.05, 0);
  laibung(FB + 0.2, 0.1, 0, FH / 2 + 0.05);
  laibung(FB + 0.2, 0.1, 0, -FH / 2 - 0.05);
  const rahmenZ = -LAIBUNG + 0.08;
  // fester Rahmen und Oberlicht (oberhalb des Kämpfers bei FH·0.22); Rahmen werfen Schatten (Mondlicht im Dunkeln)
  const KAEMPFER = FH * 0.22;
  for (const [w, h, x, y] of [
    [FB, 0.1, 0, FH / 2 - 0.05], [FB, 0.1, 0, -FH / 2 + 0.05], [0.1, FH, -FB / 2 + 0.05, 0], [0.1, FH, FB / 2 - 0.05, 0],
    [0.08, FH / 2 - KAEMPFER, 0, (FH / 2 + KAEMPFER) / 2], [FB, 0.07, 0, KAEMPFER], [0.05, FH * 0.28, -FB / 4, FH * 0.36], [0.05, FH * 0.28, FB / 4, FH * 0.36],
  ]) {
    const r = mesh(new THREE.BoxGeometry(w, h, 0.09), rahmenMat);
    r.position.set(x, y, rahmenZ);
    fenster.add(r);
  }
  const glasMat = new THREE.MeshPhysicalMaterial({ color: "#bcd2f0", transparent: true, opacity: 0.1, roughness: 0.04, metalness: 0.1, depthWrite: false });
  mats.push(glasMat);
  const obenH = FH / 2 - KAEMPFER - 0.085;
  const glas = mesh(new THREE.PlaneGeometry(FB - 0.1, obenH), glasMat, false);
  glas.position.set(0, KAEMPFER + 0.035 + obenH / 2, rahmenZ - 0.02);
  fenster.add(glas);
  // zwei Flügel unten, an den Außenkanten angeschlagen; offen schwingen sie ins Zimmer (über der Fensterbank)
  const fluegel = [];
  const fluegelTeile = [];
  const FLB = (FB - 0.2) / 2; // Breite eines Flügels
  const unten = -FH / 2 + 0.1;
  const FLH = KAEMPFER - 0.035 - unten; // Höhe eines Flügels
  for (const seite of [-1, 1]) {
    const angel = new THREE.Group();
    angel.position.set(seite * (FB / 2 - 0.1), unten + FLH / 2, rahmenZ);
    const mitte = -seite * (FLB / 2); // Flügelmitte vom Scharnier aus
    for (const [w, h, x, y] of [[FLB, 0.07, 0, FLH / 2 - 0.035], [FLB, 0.07, 0, -FLH / 2 + 0.035], [0.07, FLH, -FLB / 2 + 0.035, 0], [0.07, FLH, FLB / 2 - 0.035, 0]]) {
      const r = mesh(new THREE.BoxGeometry(w, h, 0.08), rahmenMat);
      r.position.set(mitte + x, y, 0);
      angel.add(r);
      fluegelTeile.push(r);
    }
    const g = mesh(new THREE.PlaneGeometry(FLB - 0.12, FLH - 0.12), glasMat, false);
    g.position.set(mitte, 0, -0.02);
    angel.add(g);
    fluegelTeile.push(g);
    // Griff am inneren Rand
    const griff = mesh(new THREE.BoxGeometry(0.03, 0.16, 0.05), mat({ color: "#d9a73a", metalness: 0.7, roughness: 0.35 }), false);
    griff.position.set(mitte - seite * (FLB / 2 - 0.09), 0, 0.06);
    angel.add(griff);
    fluegelTeile.push(griff);
    fenster.add(angel);
    fluegel.push({ angel, seite });
  }
  // Öffnung des unteren Teils: unsichtbare Fläche, an der man (bei offenem Fenster) Schnee holt
  const schneeFlaeche = new THREE.Mesh(new THREE.PlaneGeometry(FB - 0.25, FLH), new THREE.MeshBasicMaterial({ visible: false }));
  geos.push(schneeFlaeche.geometry);
  mats.push(schneeFlaeche.material);
  schneeFlaeche.position.set(0, unten + FLH / 2, rahmenZ - 0.15);
  fenster.add(schneeFlaeche);
  // Sims draußen mit einer Schneewehe (von drinnen durch das Glas zu sehen; hier holt man den Schnee)
  const sims = mesh(new THREE.BoxGeometry(FB + 0.3, 0.08, 0.34), mat({ color: "#8e8a86", roughness: 0.9 }), false);
  sims.position.set(0, -FH / 2 - 0.04, -LAIBUNG - 0.15);
  fenster.add(sims);
  const schneeMat = mat({ color: "#eef3fb", roughness: 1 });
  const wehe = mesh(new THREE.CapsuleGeometry(0.13, FB - 0.2, 6, 12), schneeMat, false);
  wehe.rotation.z = Math.PI / 2;
  wehe.scale.set(0.7, 1, 1);
  wehe.position.set(0, -FH / 2 + 0.03, -LAIBUNG - 0.15);
  fenster.add(wehe);
  // Fensterbank innen, mit Kerze im Glas und kleinem Kaktus
  const bank = mesh(new THREE.BoxGeometry(FB + 0.6, 0.07, LAIBUNG + 0.32), rahmenMat);
  bank.position.set(0, -FH / 2 - 0.035, -LAIBUNG / 2 + 0.16);
  fenster.add(bank);
  const kerze = new THREE.Group();
  const kerzenGlas = new THREE.MeshPhysicalMaterial({ color: "#e0a24a", transparent: true, opacity: 0.45, roughness: 0.1 });
  mats.push(kerzenGlas);
  const glasG = mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.2, 18, 1, true), kerzenGlas, false);
  glasG.position.y = 0.1;
  const wachs = mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.13, 16), mat({ color: "#f4ead2", roughness: 0.9 }), false);
  wachs.position.y = 0.065;
  const flammeMat = new THREE.MeshBasicMaterial({ color: "#ffcf6a", toneMapped: false });
  mats.push(flammeMat);
  const flamme = mesh(new THREE.ConeGeometry(0.025, 0.08, 8), flammeMat, false);
  flamme.position.y = 0.17;
  kerze.add(glasG, wachs, flamme);
  // Kerze und Kaktus stehen an den Enden der Fensterbank, wo die Flügel beim Öffnen nicht hinkommen
  kerze.position.set(-1.76, -FH / 2, 0.1);
  fenster.add(kerze);
  const kerzenLicht = new THREE.PointLight("#ffb860", 2.2, 4.5, 1.8);
  kerzenLicht.position.set(-1.76, -FH / 2 + 0.3, 0.3);
  fenster.add(kerzenLicht);
  const kaktus = new THREE.Group();
  const kTopf = mesh(new THREE.CylinderGeometry(0.11, 0.08, 0.16, 14), mat({ color: "#c76a3c" }), false);
  kTopf.position.y = 0.08;
  const kKoerper = mesh(new THREE.CapsuleGeometry(0.065, 0.16, 4, 10), mat({ color: "#5a8f4a", roughness: 0.7 }), false);
  kKoerper.position.y = 0.27;
  const kArm = mesh(new THREE.CapsuleGeometry(0.035, 0.07, 4, 8), mat({ color: "#5a8f4a", roughness: 0.7 }), false);
  kArm.position.set(0.075, 0.3, 0);
  kArm.rotation.z = -0.6;
  kaktus.add(kTopf, kKoerper, kArm);
  kaktus.position.set(1.76, -FH / 2, 0.1);
  fenster.add(kaktus);
  const vorhangMat = mat({ color: "#7c2232", roughness: 0.95, side: THREE.DoubleSide });
  for (const sx of [-1, 1]) {
    const v = new THREE.Group();
    for (let k = 0; k < 5; k += 1) {
      const falte = mesh(new THREE.CylinderGeometry(0.11, 0.13, 3.3, 10, 1, true), vorhangMat, false);
      falte.position.set(k * 0.17, 0, (k % 2) * 0.06);
      v.add(falte);
    }
    v.position.set(sx * 2.05 - (sx > 0 ? 0 : 0.68), -0.15, 0.22);
    fenster.add(v);
    // Raffhalter: die Vorhänge sind zur Seite gebunden
    const halter = mesh(new THREE.TorusGeometry(0.3, 0.03, 6, 20), mat({ color: "#d9a441", roughness: 0.5 }), false);
    halter.rotation.x = Math.PI / 2;
    halter.scale.set(1.15, 0.7, 1);
    halter.position.set(sx * 2.05 - (sx > 0 ? -0.34 : 0.34), -0.55, 0.25);
    fenster.add(halter);
  }
  const stange = mesh(new THREE.CylinderGeometry(0.035, 0.035, 5.4, 8), mat({ color: "#2b2420", metalness: 0.5, roughness: 0.4 }), false);
  stange.rotation.z = Math.PI / 2;
  stange.position.set(0, 1.55, 0.25);
  fenster.add(stange);
  fenster.position.set(0, FY, -RAUM + 0.02);
  root.add(fenster);
  const draussen = buildDraussen({ low, boden: BODEN });
  root.add(draussen.root);

  // Spieleregal an der Rückwand links (Spielkartons sind anklickbar, siehe regal.js)
  const regal = buildRegal({ low, spiele });
  regal.root.position.set(REGAL.x, BODEN, REGAL.z);
  root.add(regal.root);

  // Sofa rechts hinten
  const sofa = new THREE.Group();
  const stoff = mat({ color: "#c08a2e", roughness: 0.95 });
  const kissenM = mat({ color: "#d39b3a", roughness: 1 });
  const sitz = mesh(new THREE.BoxGeometry(3.4, 0.55, 1.3), stoff);
  sitz.position.y = 0.55;
  const lehne = mesh(new THREE.BoxGeometry(3.4, 1.2, 0.35), stoff);
  lehne.position.set(0, 1.1, -0.5);
  sofa.add(sitz, lehne);
  const sofaTeile = [sitz, lehne];
  for (const sx of [-1, 1]) {
    const arm = mesh(new THREE.BoxGeometry(0.35, 0.9, 1.3), stoff);
    arm.position.set(sx * 1.7, 0.75, 0);
    sofa.add(arm);
    const kissen = mesh(new THREE.BoxGeometry(1.45, 0.24, 1.0), kissenM);
    kissen.position.set(sx * 0.76, 0.94, 0.1);
    sofa.add(kissen);
    sofaTeile.push(arm, kissen);
  }
  for (const [x, z] of [[-1.55, -0.5], [1.55, -0.5], [-1.55, 0.5], [1.55, 0.5]]) {
    const bein = mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.28, 8), holz);
    bein.position.set(x, 0.14, z);
    sofa.add(bein);
  }
  sofa.rotation.y = SOFA.r;
  sofa.position.set(SOFA.x, BODEN, SOFA.z);
  root.add(sofa);

  // Stehlampe neben dem Sofa
  const steh = new THREE.Group();
  const metall = mat({ color: "#2b2420", metalness: 0.6, roughness: 0.35 });
  const fussS = mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.06, 20), metall);
  const stangeS = mesh(new THREE.CylinderGeometry(0.03, 0.03, 3.1, 8), metall);
  stangeS.position.y = 1.58;
  const schirmMat = mat({ color: "#f3dfb3", emissive: "#ffcf7a", emissiveIntensity: 0.55, side: THREE.DoubleSide, roughness: 1 });
  const schirm = mesh(new THREE.CylinderGeometry(0.32, 0.5, 0.55, 22, 1, true), schirmMat, false);
  schirm.position.y = 3.2;
  steh.add(fussS, stangeS, schirm);
  steh.position.set(7.0, BODEN, -3.2);
  root.add(steh);
  const stehLicht = new THREE.PointLight("#ffbf6a", 9, 9, 1.6);
  stehLicht.position.set(7.0, BODEN + 3.0, -3.2);
  root.add(stehLicht);

  // Couchtisch vor dem Sofa mit einer Schale Chips (anklickbar: der Blob holt sich einen)
  const couch = new THREE.Group();
  const cPlatte = mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.06, 32), holzHell);
  cPlatte.position.y = 0.6;
  const cBein = mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.58, 10), holz);
  cBein.position.y = 0.29;
  const cFuss = mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.04, 20), holz);
  cFuss.position.y = 0.02;
  couch.add(cPlatte, cBein, cFuss);
  const schale = new THREE.Group();
  const schaleGeo = new THREE.LatheGeometry(
    [[0, 0], [0.16, 0], [0.27, 0.07], [0.31, 0.16], [0.295, 0.165], [0.255, 0.08], [0.15, 0.015], [0, 0.015]].map(([a, b]) => new THREE.Vector2(a, b)),
    28,
  );
  const schaleM = mesh(schaleGeo, mat({ color: "#2f5d7c", roughness: 0.35, side: THREE.DoubleSide }));
  schale.add(schaleM);
  const chipGeo = new THREE.SphereGeometry(0.055, 10, 6);
  chipGeo.scale(1, 0.22, 0.8);
  geos.push(chipGeo);
  const chipMat = mat({ color: "#efb446", roughness: 0.6 });
  const rChips = zufall(41);
  const ANZ = 30;
  const haufen = new THREE.InstancedMesh(chipGeo, chipMat, ANZ);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  for (let i = 0; i < ANZ; i += 1) {
    const a = rChips() * Math.PI * 2;
    const rr = Math.sqrt(rChips()) * 0.22;
    q.setFromEuler(new THREE.Euler((rChips() - 0.5) * 1.6, rChips() * 6.3, (rChips() - 0.5) * 1.6));
    m4.compose(new THREE.Vector3(Math.cos(a) * rr, 0.06 + rChips() * 0.1 + (0.22 - rr) * 0.35, Math.sin(a) * rr), q, new THREE.Vector3(1, 1, 1));
    haufen.setMatrixAt(i, m4);
  }
  haufen.castShadow = !low;
  schale.add(haufen);
  schale.position.y = 0.63;
  couch.add(schale);
  // Limo: eine Flasche und zwei Gläser neben der Schale (anklickbar: Schluck nehmen → Schluckauf)
  const limoTeile = [];
  const flaschenGlas = new THREE.MeshPhysicalMaterial({ color: "#cfe36a", transparent: true, opacity: 0.78, roughness: 0.12, metalness: 0 });
  mats.push(flaschenGlas);
  const flascheGeo = new THREE.LatheGeometry(
    [[0, 0], [0.075, 0], [0.08, 0.02], [0.08, 0.24], [0.06, 0.31], [0.028, 0.36], [0.028, 0.42], [0, 0.42]].map(([a, b]) => new THREE.Vector2(a, b)),
    20,
  );
  const flasche = mesh(flascheGeo, flaschenGlas);
  flasche.position.set(0.38, 0.63, -0.2);
  const deckel = mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.035, 12), mat({ color: "#c8352e", roughness: 0.4, metalness: 0.4 }), false);
  deckel.position.set(0.38, 0.63 + 0.435, -0.2);
  const etikett = mesh(new THREE.CylinderGeometry(0.082, 0.082, 0.1, 20, 1, true), mat({ color: "#f3e9c8", roughness: 0.7 }), false);
  etikett.position.set(0.38, 0.63 + 0.14, -0.2);
  couch.add(flasche, deckel, etikett);
  limoTeile.push(flasche, deckel, etikett);
  const glasLimo = new THREE.MeshPhysicalMaterial({ color: "#ffffff", transparent: true, opacity: 0.28, roughness: 0.05 });
  const saft = mat({ color: "#f2d64b", roughness: 0.25, transparent: true, opacity: 0.9 });
  mats.push(glasLimo);
  const glaeser = [];
  for (const [x, z] of [[-0.3, -0.33], [0.14, 0.44]]) {
    const g = mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.16, 16, 1, true), glasLimo, false);
    g.position.set(x, 0.63 + 0.08, z);
    const s = mesh(new THREE.CylinderGeometry(0.052, 0.046, 0.1, 16), saft, false);
    s.position.set(x, 0.63 + 0.055, z);
    couch.add(g, s);
    limoTeile.push(g, s);
    glaeser.push(new THREE.Vector3(COUCHTISCH.x + x, BODEN + 0.71, COUCHTISCH.z + z));
  }
  couch.position.set(COUCHTISCH.x, BODEN, COUCHTISCH.z);
  root.add(couch);
  const chips = {
    teile: [schaleM, haufen],
    geo: chipGeo,
    mat: chipMat,
    // Mitte der Schale (Welt) und wo ein Blob zum Essen steht (zur Zimmermitte hin)
    schale: new THREE.Vector3(COUCHTISCH.x, BODEN + 0.78, COUCHTISCH.z),
    stehPlatz: new THREE.Vector3(COUCHTISCH.x - 0.8, BODEN, COUCHTISCH.z + 0.8),
  };

  // Umkleide an der linken Wand: Standspiegel (spiegelt wirklich, auch den eigenen Blob in der Ich-Sicht),
  // Paravent mit Stoffbespannung, Kleiderständer mit Hüten, Schild, runde Matte als Stehplatz
  const umkleide = new THREE.Group();
  const uTeile = [];
  const uMesh = (geo, m, x, y, z) => {
    const me = mesh(geo, m);
    me.position.set(x, y, z);
    umkleide.add(me);
    uTeile.push(me);
    return me;
  };
  const goldHolz = mat({ color: "#b8862f", roughness: 0.45, metalness: 0.25 });
  const SPH = 2.3; // Spiegelhöhe
  const SPB = 1.2;
  const spiegelY = BODEN + 0.3 + SPH / 2;
  let spiegel;
  if (!low) {
    spiegel = new Reflector(new THREE.PlaneGeometry(SPB, SPH), { textureWidth: 512, textureHeight: 1024, color: "#c4ccd4", clipBias: 0.003 });
    geos.push(spiegel.geometry);
  } else {
    spiegel = new THREE.Mesh(new THREE.PlaneGeometry(SPB, SPH), mat({ color: "#b7c3d0", roughness: 0.12, metalness: 0.9 }));
    geos.push(spiegel.geometry);
  }
  spiegel.position.set(UMKLEIDE.spiegelX + 0.03, spiegelY, UMKLEIDE.z);
  spiegel.rotation.y = Math.PI / 2;
  umkleide.add(spiegel);
  uTeile.push(spiegel);
  for (const [w, h, dz, dy] of [[0.1, SPH + 0.2, -SPB / 2 - 0.05, 0], [0.1, SPH + 0.2, SPB / 2 + 0.05, 0], [SPB + 0.2, 0.1, 0, SPH / 2 + 0.05], [SPB + 0.2, 0.1, 0, -SPH / 2 - 0.05]]) {
    // Rahmen (Breite entlang der Wand = z)
    uMesh(new THREE.BoxGeometry(0.08, h, w), goldHolz, UMKLEIDE.spiegelX, spiegelY + dy, UMKLEIDE.z + dz);
  }
  uMesh(new THREE.BoxGeometry(0.5, 0.3, SPB + 0.3), goldHolz, UMKLEIDE.spiegelX + 0.12, BODEN + 0.15, UMKLEIDE.z);
  // Schild über dem Spiegel
  const schildTex = tex(256, 64, (c, w, h) => {
    c.fillStyle = "#3a2618";
    c.fillRect(0, 0, w, h);
    c.fillStyle = "#f4e3b5";
    c.font = '900 34px Rubik, "Arial Black", sans-serif';
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("Umkleide", w / 2, h / 2 + 2);
  });
  const schild = uMesh(new THREE.PlaneGeometry(1.2, 0.3), mat({ map: schildTex, roughness: 0.7 }), UMKLEIDE.spiegelX + 0.06, spiegelY + SPH / 2 + 0.35, UMKLEIDE.z);
  schild.rotation.y = Math.PI / 2;
  // Paravent: drei Felder im Zickzack neben dem Spiegel
  const stoffTex = tex(128, 256, (c, w, h) => {
    c.fillStyle = "#7c2e4a";
    c.fillRect(0, 0, w, h);
    c.fillStyle = "rgba(244, 214, 150, 0.35)";
    for (let y = 12; y < h; y += 28) {
      for (let x = (y / 28) % 2 ? 10 : 30; x < w; x += 40) {
        c.beginPath();
        c.arc(x, y, 6, 0, Math.PI * 2);
        c.fill();
      }
    }
  });
  const paraventStoff = mat({ map: stoffTex, roughness: 0.95, side: THREE.DoubleSide });
  for (let i = 0; i < 3; i += 1) {
    const feld = new THREE.Group();
    const f = mesh(new THREE.PlaneGeometry(0.66, 2.3), paraventStoff);
    f.position.y = 1.35;
    feld.add(f);
    for (const sx of [-0.35, 0.35]) {
      const pfosten = mesh(new THREE.BoxGeometry(0.05, 2.6, 0.05), goldHolz);
      pfosten.position.set(sx, 1.3, 0);
      feld.add(pfosten);
    }
    feld.position.set(-RAUM + 0.55 + (i % 2) * 0.28, BODEN, UMKLEIDE.z - 1.15 - i * 0.62);
    feld.rotation.y = Math.PI / 2 + (i % 2 ? -0.5 : 0.5);
    umkleide.add(feld);
    feld.traverse((o) => o.isMesh && uTeile.push(o));
  }
  // Kleiderständer mit Hüten
  const staender = new THREE.Group();
  const sStange = mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.7, 8), goldHolz);
  sStange.position.y = 1.35;
  const sFuss = mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.06, 18), goldHolz);
  sFuss.position.y = 0.03;
  staender.add(sStange, sFuss);
  const hutFarben = ["#2b2233", "#d9a441", "#3f7ad6", "#c8372d"];
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const haken = mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.32, 6), goldHolz);
    haken.position.set(Math.cos(a) * 0.14, 2.45, Math.sin(a) * 0.14);
    haken.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
    staender.add(haken);
    const hutMat = mat({ color: hutFarben[i], roughness: 0.6 });
    const hut = i % 2 ? mesh(new THREE.ConeGeometry(0.17, 0.42, 14), hutMat) : mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.26, 14), hutMat);
    hut.position.set(Math.cos(a) * 0.3, 2.42, Math.sin(a) * 0.3);
    hut.rotation.set(Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4);
    staender.add(hut);
  }
  const schal = mesh(new THREE.TorusGeometry(0.16, 0.05, 8, 18), mat({ color: "#2f9e4a", roughness: 0.9 }));
  schal.position.set(0, 1.95, 0);
  schal.rotation.x = Math.PI / 2;
  staender.add(schal);
  staender.position.set(-RAUM + 0.6, BODEN, UMKLEIDE.z + 1.45);
  umkleide.add(staender);
  staender.traverse((o) => o.isMesh && uTeile.push(o));
  // runde Matte vor dem Spiegel: hier steht man zum Umziehen
  const matte = mesh(new THREE.CircleGeometry(0.75, 40), mat({ color: "#d9a441", roughness: 1 }), false);
  matte.rotation.x = -Math.PI / 2;
  matte.position.set(UMKLEIDE.stehX, BODEN + 0.015, UMKLEIDE.z);
  umkleide.add(matte);
  uTeile.push(matte);
  root.add(umkleide);
  const umkleideInfo = {
    teile: uTeile,
    spiegel: low ? null : spiegel,
    stehPlatz: new THREE.Vector3(UMKLEIDE.stehX, BODEN, UMKLEIDE.z),
    blick: -Math.PI / 2, // Blob schaut zum Spiegel (−x)
    // Anprobe: Kamera im Raum, der Blob dreht sich zu ihr um; im Spiegel dahinter sieht man seinen Rücken
    kamera: new THREE.Vector3(UMKLEIDE.stehX + 5.6, BODEN + 2.4, UMKLEIDE.z + 0.9),
    schild: new THREE.Vector3(UMKLEIDE.spiegelX + 0.2, spiegelY + SPH / 2 + 0.7, UMKLEIDE.z),
  };

  // Bogenhanf in der Ecke vorne links (pflanzen.js)
  const pflanze = bogenhanf({ low });
  pflanze.position.set(-6.6, BODEN, 6.2);
  root.add(pflanze);

  // Eingangstür an der vorderen Wand: Zarge, Türblatt mit Kassetten, Klinke, Fußmatte
  const tuer = new THREE.Group();
  const zargeMat = mat({ color: "#e9e1cf", roughness: 0.5 });
  const tuerMat = mat({ color: "#7a4a2a", roughness: 0.55 });
  const kassetteMat = mat({ color: "#6a3f23", roughness: 0.6 });
  const TB = 1.5;
  const TH = 3.45;
  for (const [w, h, x, y] of [[0.14, TH + 0.14, -TB / 2 - 0.07, TH / 2], [0.14, TH + 0.14, TB / 2 + 0.07, TH / 2], [TB + 0.28, 0.14, 0, TH + 0.07]]) {
    const z = mesh(new THREE.BoxGeometry(w, h, 0.12), zargeMat, false);
    z.position.set(x, y, 0);
    tuer.add(z);
  }
  const blatt = mesh(new THREE.BoxGeometry(TB, TH, 0.06), tuerMat, false);
  blatt.position.set(0, TH / 2, -0.01);
  tuer.add(blatt);
  for (const [y, h] of [[TH * 0.72, TH * 0.36], [TH * 0.27, TH * 0.4]]) {
    for (const x of [-TB * 0.22, TB * 0.22]) {
      const k = mesh(new THREE.BoxGeometry(TB * 0.32, h, 0.03), kassetteMat, false);
      k.position.set(x, y, 0.03);
      tuer.add(k);
    }
  }
  const klinke = mesh(new THREE.SphereGeometry(0.06, 12, 10), mat({ color: "#d9a73a", metalness: 0.8, roughness: 0.3 }), false);
  klinke.position.set(TB * 0.38, TH * 0.48, 0.08);
  tuer.add(klinke);
  tuer.rotation.y = Math.PI; // schaut ins Zimmer (−z)
  tuer.position.set(TUER.x, BODEN, RAUM - 0.12); // vor der Holzverkleidung
  root.add(tuer);
  const fussmatte = mesh(new THREE.PlaneGeometry(1.6, 0.9), mat({
    map: tex(128, 64, (c, w, h) => {
      c.fillStyle = "#7a5a32";
      c.fillRect(0, 0, w, h);
      c.strokeStyle = "rgba(40, 25, 10, 0.5)";
      for (let x = 0; x < w; x += 4) {
        c.beginPath();
        c.moveTo(x, 0);
        c.lineTo(x, h);
        c.stroke();
      }
    }),
    roughness: 1,
  }), false);
  fussmatte.rotation.x = -Math.PI / 2;
  fussmatte.position.set(TUER.x, BODEN + 0.012, RAUM - 0.75);
  root.add(fussmatte);

  // Lichtschalter neben der Tür: Abdeckung mit Wippe (oben = an); eine unsichtbare, größere Fläche macht ihn leicht
  // zu treffen
  const schalter = new THREE.Group();
  const abdeckung = mesh(new THREE.BoxGeometry(0.26, 0.36, 0.035), mat({ color: "#efe7d6", roughness: 0.45 }), false);
  const wippe = mesh(new THREE.BoxGeometry(0.1, 0.16, 0.05), mat({ color: "#f8f3e8", roughness: 0.35 }), false);
  wippe.position.z = 0.03;
  wippe.rotation.x = -0.3;
  const schalterZiel = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.8), new THREE.MeshBasicMaterial({ visible: false }));
  geos.push(schalterZiel.geometry);
  mats.push(schalterZiel.material);
  schalterZiel.position.z = 0.05;
  schalter.add(abdeckung, wippe, schalterZiel);
  schalter.rotation.y = Math.PI; // schaut ins Zimmer (−z)
  schalter.position.set(LICHTSCHALTER.x, LICHTSCHALTER.y, LICHTSCHALTER.z);
  root.add(schalter);

  // Bilder an den Wänden
  const rahmenB = mat({ color: "#3a2618", roughness: 0.6 });
  for (const [seed, x, y, z, ry, w, h] of [
    [21, 7.94, 2.0, 2.8, -Math.PI / 2, 1.6, 1.15],
    [33, 7.94, 1.75, 0.7, -Math.PI / 2, 0.9, 1.25],
    [47, -2.5, 2.1, 7.94, Math.PI, 1.4, 1.0],
    [52, 2.6, 1.9, 7.94, Math.PI, 1.0, 1.3],
    [64, -7.94, 2.05, -2.6, Math.PI / 2, 1.5, 1.1],
    [71, -7.94, 1.85, -0.4, Math.PI / 2, 0.85, 1.15],
  ]) {
    const g = new THREE.Group();
    const rahmen = mesh(new THREE.BoxGeometry(w + 0.14, h + 0.14, 0.06), rahmenB, false);
    const flaeche = mesh(new THREE.PlaneGeometry(w, h), mat({ map: tex(160, 128, bild(seed)), roughness: 0.9 }), false);
    flaeche.position.z = 0.032;
    g.add(rahmen, flaeche);
    g.position.set(x, BODEN + y + 1.2, z);
    g.rotation.y = ry;
    root.add(g);
  }

  // Tisch: runde Platte auf einem Fuß
  const tisch = new THREE.Group();
  const platteMat = mat({
    map: tex(512, 512, (ctx, w, h) => {
      ctx.fillStyle = "#7b4a2a";
      ctx.fillRect(0, 0, w, h);
      const r = zufall(23);
      for (let y = 0; y < h; y += 3) {
        ctx.fillStyle = `rgba(${r() < 0.5 ? "50, 26, 12" : "160, 100, 60"}, ${0.05 + r() * 0.08})`;
        ctx.fillRect(0, y + Math.sin(y * 0.05) * 2, w, 2);
      }
    }),
    roughness: 0.45,
  });
  const platte = mesh(new THREE.CylinderGeometry(TISCH_R, TISCH_R, 0.1, 64), [mat({ color: "#5e3720", roughness: 0.5 }), platteMat, platteMat]);
  platte.position.y = -0.05;
  const kante = mesh(new THREE.TorusGeometry(TISCH_R, 0.05, 8, 64), mat({ color: "#5e3720", roughness: 0.45 }));
  kante.rotation.x = Math.PI / 2;
  kante.position.y = -0.05;
  const saeule = mesh(new THREE.CylinderGeometry(0.22, 0.3, -BODEN - 0.2, 16), holz);
  saeule.position.y = BODEN / 2 - 0.05;
  const fussT = mesh(new THREE.CylinderGeometry(0.5, 0.95, 0.18, 24), holz);
  fussT.position.y = BODEN + 0.09;
  tisch.add(platte, kante, saeule, fussT);
  root.add(tisch);

  // Hängelampe über dem Tisch
  const lampe = new THREE.Group();
  const kabel = mesh(new THREE.CylinderGeometry(0.012, 0.012, 2.1, 6), mat({ color: "#111111" }), false);
  kabel.position.y = 1.05;
  const glockeMat = mat({ color: "#1f3d36", roughness: 0.4, metalness: 0.3, side: THREE.DoubleSide });
  const glocke = mesh(new THREE.CylinderGeometry(0.18, 0.95, 0.55, 32, 1, true), glockeMat, false);
  const birneMat = new THREE.MeshBasicMaterial({ color: "#fff1c9" });
  mats.push(birneMat);
  const birne = mesh(new THREE.SphereGeometry(0.15, 16, 12), birneMat, false);
  birne.position.y = -0.2;
  const innenMat = mat({ color: "#f5e3b5", emissive: "#ffd27a", emissiveIntensity: 0.6, side: THREE.BackSide });
  const innen = mesh(new THREE.CylinderGeometry(0.17, 0.93, 0.53, 32, 1, true), innenMat, false);
  lampe.add(kabel, glocke, innen, birne);
  lampe.position.y = 3.15;
  root.add(lampe);

  // Licht: warmer Kegel von der Hängelampe (wirft die Schatten), dazu Raumlicht und Mondlicht vom Fenster
  const kegel = new THREE.SpotLight("#ffd9a0", 75, 16, 0.95, 0.65, 1.4);
  kegel.position.set(0, 2.9, 0);
  kegel.target.position.set(0, BODEN, 0);
  if (!low) {
    kegel.castShadow = true;
    kegel.shadow.mapSize.set(1024, 1024);
    kegel.shadow.bias = -0.0015;
    kegel.shadow.camera.near = 0.5;
    kegel.shadow.camera.far = 9;
  }
  root.add(kegel, kegel.target);
  const warm = new THREE.PointLight("#ffbe78", 22, 18, 1.5);
  warm.position.set(0, 2.2, 0);
  const hemi = new THREE.HemisphereLight("#ffe2c0", "#2a1d1a", 0.5);
  const mond = new THREE.DirectionalLight("#9fb6ff", 0.35);
  mond.position.set(0, 4, -9);
  // Aufhellung von vorn und hinten: das stehende Brett und die Gesichter am Tisch bekommen sonst kaum Licht
  const vorn = new THREE.DirectionalLight("#ffe6c4", 0.7);
  vorn.position.set(0.8, 3.2, 7);
  const hinten = new THREE.DirectionalLight("#ffe6c4", 0.7);
  hinten.position.set(-0.8, 3.2, -7);
  root.add(warm, hemi, mond, vorn, hinten);
  // Mondlicht durchs Fenster: nur bei ausgeschaltetem Licht; mit Schatten zeichnet es das Fensterkreuz auf den Boden
  const mondKegel = new THREE.SpotLight("#a8bcff", 0, 0, 0.42, 0.35, 0);
  mondKegel.position.set(0, FY + 3.5, -RAUM - 6);
  mondKegel.target.position.set(0, BODEN, -2.5);
  mondKegel.visible = false;
  if (!low) {
    mondKegel.castShadow = true;
    mondKegel.shadow.mapSize.set(1024, 1024);
    mondKegel.shadow.bias = -0.002;
    mondKegel.shadow.camera.near = 4;
    mondKegel.shadow.camera.far = 30;
  }
  root.add(mondKegel, mondKegel.target);
  // die Rückwand (mit dem Fensterloch) hält das Mondlicht draußen
  waende[0].gruppe.children[0].castShadow = !low;

  // Tür und Lichtschalter gehören zur Vorderwand: steht die Kamera dahinter, verschwinden sie mit ihr
  waende[2].gruppe.attach(tuer);
  waende[2].gruppe.attach(schalter);

  // ── Licht an/aus ──
  let lichtAn = true;
  let lichtWert = 1; // 1 = an, 0 = aus (dazwischen beim Flackern)
  let flackern = 0;
  const birneHell = new THREE.Color("#fff1c9");
  const birneDunkel = new THREE.Color("#3b3631");
  /** Licht an oder aus (Schalter für alle). Beim Einschalten flackert die Birne kurz. */
  function setLicht(an) {
    if (an === lichtAn) return;
    lichtAn = an;
    wippe.rotation.x = an ? -0.3 : 0.3;
    if (an) flackern = 0.42;
    else lichtWert = 0;
    // Lichter ein- und ausblenden (ändert die Zahl der Lichter: einmal neu übersetzen, danach im Speicher)
    mondKegel.visible = !an;
    kegel.visible = an;
  }

  // ── Fenster auf/zu ──
  let fensterOffen = false;
  let fensterT = 0; // 0 zu … 1 offen
  function setFenster(offen) {
    fensterOffen = !!offen;
  }

  // Schneeflocken, die durchs offene Fenster hereinwehen
  const FLOCKEN = low ? 60 : 150;
  const flockenPos = new Float32Array(FLOCKEN * 3).fill(-100);
  const flockenV = new Float32Array(FLOCKEN * 3);
  const flockenAlter = new Float32Array(FLOCKEN).fill(99);
  const flockenGeo = new THREE.BufferGeometry();
  flockenGeo.setAttribute("position", new THREE.BufferAttribute(flockenPos, 3));
  geos.push(flockenGeo);
  // runde, weiche Flocke (ohne Textur wären die Punkte Quadrate)
  const flockenTex = tex(32, 32, (c, w, h) => {
    const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.45, "rgba(255,255,255,0.9)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  });
  const flockenMat = new THREE.PointsMaterial({ color: "#f4f8ff", map: flockenTex, size: 0.045, transparent: true, opacity: 0.95, depthWrite: false });
  mats.push(flockenMat);
  const flocken = new THREE.Points(flockenGeo, flockenMat);
  flocken.frustumCulled = false;
  root.add(flocken);
  let flockenTakt = 0;
  let flockeNr = 0;

  function update(dt, time) {
    draussen.update(dt, time);
    regal.update(dt);
    // Licht: beim Einschalten ein paar Aussetzer, sonst an oder aus
    if (flackern > 0) {
      flackern -= dt;
      lichtWert = flackern > 0 ? (Math.sin(flackern * 70) > -0.2 ? 1 : 0.12) : 1;
    }
    const l = lichtWert;
    kegel.intensity = 75 * l;
    warm.intensity = (22 + Math.sin(time * 7.3) * 0.25) * l;
    stehLicht.intensity = 9 * l;
    vorn.intensity = 0.7 * l;
    hinten.intensity = 0.7 * l;
    hemi.intensity = 0.5 * (0.1 + 0.9 * l);
    mond.intensity = 0.03 + 0.32 * l;
    innenMat.emissiveIntensity = 0.6 * l;
    schirmMat.emissiveIntensity = 0.55 * l;
    birneMat.color.lerpColors(birneDunkel, birneHell, l);
    mondKegel.intensity = (1 - l) * 3.4;
    // Kerze flackert (im Dunkeln reicht ihr Schein etwas weiter)
    const f = 1 + Math.sin(time * 13) * 0.08 + Math.sin(time * 31) * 0.05;
    flamme.scale.set(1, f, 1);
    kerzenLicht.intensity = 2.2 * f * (1 + (1 - l) * 0.7);
    kerzenLicht.distance = 4.5 + (1 - l) * 3;

    // Fensterflügel schwingen auf oder zu
    const soll = fensterOffen ? 1 : 0;
    if (fensterT !== soll) {
      fensterT = Math.max(0, Math.min(1, fensterT + (soll > fensterT ? dt : -dt) / 0.7));
      const e = fensterT < 0.5 ? 2 * fensterT * fensterT : 1 - (-2 * fensterT + 2) ** 2 / 2;
      for (const fl of fluegel) fl.angel.rotation.y = fl.seite * 1.35 * e;
    }
    // Schneeflocken: bei offenem Fenster kommen neue, die alten trudeln zu Boden
    if (fensterOffen && fensterT > 0.3) {
      flockenTakt += dt * (low ? 14 : 32);
      while (flockenTakt >= 1) {
        flockenTakt -= 1;
        const i = flockeNr % FLOCKEN;
        flockeNr += 1;
        flockenPos[i * 3] = (Math.random() - 0.5) * (FB - 0.4);
        flockenPos[i * 3 + 1] = FY - FH / 2 + 0.2 + Math.random() * 1.4;
        flockenPos[i * 3 + 2] = -RAUM - 0.35;
        flockenV[i * 3] = (Math.random() - 0.5) * 0.4;
        flockenV[i * 3 + 1] = -0.2 - Math.random() * 0.3;
        flockenV[i * 3 + 2] = 0.7 + Math.random() * 1.1;
        flockenAlter[i] = 0;
      }
    }
    let bewegt = false;
    for (let i = 0; i < FLOCKEN; i += 1) {
      if (flockenAlter[i] > 6) continue;
      flockenAlter[i] += dt;
      bewegt = true;
      const k = i * 3;
      if (flockenAlter[i] > 6) {
        flockenPos[k + 1] = -100; // geschmolzen
        continue;
      }
      if (flockenPos[k + 1] <= BODEN + 0.02) continue; // liegt kurz auf dem Boden
      flockenV[k] += Math.sin(time * 1.7 + i) * 0.25 * dt;
      flockenV[k + 2] *= Math.exp(-dt * 0.45);
      flockenPos[k] += flockenV[k] * dt;
      flockenPos[k + 1] = Math.max(BODEN + 0.02, flockenPos[k + 1] + flockenV[k + 1] * dt);
      flockenPos[k + 2] += flockenV[k + 2] * dt;
    }
    if (bewegt) flockenGeo.attributes.position.needsUpdate = true;
    // die Schneewehe draußen wächst langsam nach
    if (wehe.scale.x < 0.7) wehe.scale.x = Math.min(0.7, wehe.scale.x + dt * 0.012);
  }

  /** Schnee vom Sims genommen: die Wehe wird etwas kleiner und wächst langsam nach (nur fürs Auge). */
  function schneeNehmen() {
    wehe.scale.x = Math.max(0.3, wehe.scale.x - 0.15);
  }

  function dispose() {
    geos.forEach((g) => g.dispose());
    mats.forEach((m) => m.dispose());
    texs.forEach((t) => t.dispose());
    draussen.dispose();
    regal.dispose();
    pflanzeEntsorgen(pflanze);
    spiegel.dispose?.();
  }

  return {
    root, lampe, kegel, warm, regal, chips, umkleide: umkleideInfo, waende, decke: deckeM, deckeY: BODEN + WAND_H, update, dispose,
    // Sofa (Klick: hinsetzen), Limo am Couchtisch, Lichtschalter, Fenster (Flügel: auf/zu; Öffnung: Schnee holen)
    sofa: { teile: sofaTeile },
    limo: { teile: limoTeile, glaeser },
    licht: { teile: [abdeckung, wippe, schalterZiel], setAn: setLicht, get an() { return lichtAn; }, get wert() { return lichtWert; } },
    fenster: { teile: fluegelTeile, schneeTeile: [schneeFlaeche], setOffen: setFenster, get offen() { return fensterOffen; }, schneeNehmen },
  };
}

/** Ein Stuhl, der zur Tischmitte schaut. polster: Farbe des Sitzkissens (Spielfarbe) oder null. */
export function buildStuhl(polster, low = false) {
  const g = new THREE.Group();
  const holz = new THREE.MeshStandardMaterial({ color: "#6b4329", roughness: 0.6 });
  const teile = [];
  const box = (w, h, d, x, y, z, m = holz) => {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = !low;
    mesh.receiveShadow = !low;
    g.add(mesh);
    teile.push(mesh);
    return mesh;
  };
  const sitzY = -0.66; // Oberkante der Sitzfläche
  box(0.95, 0.08, 0.9, 0, sitzY - 0.04, 0);
  for (const [x, z] of [[-0.4, -0.38], [0.4, -0.38], [-0.4, 0.38], [0.4, 0.38]]) box(0.07, sitzY - BODEN - 0.08, 0.07, x, (sitzY - 0.08 + BODEN) / 2, z);
  // Lehne (hinten = vom Tisch weg, +z der Gruppe zeigt zur Mitte)
  for (const x of [-0.4, 0.4]) box(0.07, 1.05, 0.07, x, sitzY + 0.52, -0.42);
  box(0.9, 0.2, 0.06, 0, sitzY + 0.92, -0.42);
  box(0.9, 0.12, 0.06, 0, sitzY + 0.55, -0.42);
  let kissenMat = null;
  if (polster) {
    kissenMat = new THREE.MeshStandardMaterial({ color: polster, roughness: 0.9 });
    const k = box(0.82, 0.07, 0.78, 0, sitzY + 0.035, 0.02, kissenMat);
    k.userData.kissen = true;
  }
  return {
    group: g,
    teile,
    setPolster(hex) {
      if (kissenMat) kissenMat.color.set(hex);
    },
    dispose() {
      teile.forEach((m) => m.geometry.dispose());
      holz.dispose();
      kissenMat?.dispose();
    },
  };
}
