// scene/pflanzen.js — Zimmerpflanzen aus echten Blattformen statt Kegeln und Kugeln.
//
// Ein Blatt ist eine flache, spitz zulaufende Form (Shape), die nach außen gebogen wird; die Farbe kommt aus einer
// kleinen Textur (Mittelrippe, beim Bogenhanf Querbänder und gelber Rand). Zwei Pflanzen:
//   bogenhanf()   große Ecke: aufrechte, schwertförmige Blätter in einem Terrakottatopf
//   gruenlilie()  klein, fürs Regal: viele schmale Blätter, die nach außen und unten überhängen
import * as THREE from "three";

function zufall(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function blattTextur(art) {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 256;
  const g = c.getContext("2d");
  if (art === "bogenhanf") {
    const v = g.createLinearGradient(0, 0, 0, 256);
    v.addColorStop(0, "#5f8f3e");
    v.addColorStop(1, "#2e5a2a");
    g.fillStyle = v;
    g.fillRect(0, 0, 64, 256);
    // dunkle Querwellen
    g.strokeStyle = "rgba(20, 50, 25, 0.55)";
    g.lineWidth = 5;
    for (let y = 10; y < 256; y += 17) {
      g.beginPath();
      for (let x = 0; x <= 64; x += 4) g.lineTo(x, y + Math.sin(x / 9 + y) * 4);
      g.stroke();
    }
    // gelber Rand
    g.fillStyle = "#d8c75a";
    g.fillRect(0, 0, 6, 256);
    g.fillRect(58, 0, 6, 256);
  } else {
    // Grünlilie: hellgrün mit weißem Mittelstreifen
    g.fillStyle = "#5aa848";
    g.fillRect(0, 0, 64, 256);
    g.fillStyle = "#eef3d6";
    g.fillRect(22, 0, 20, 256);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Blattform: Breite b, Länge l, zeigt in +y; biegung > 0 wölbt die Spitze nach −z (außen, siehe blaetterAuf). */
function blattGeometrie(b, l, biegung) {
  const s = new THREE.Shape();
  s.moveTo(-b * 0.35, 0);
  s.quadraticCurveTo(-b * 0.75, l * 0.45, 0, l);
  s.quadraticCurveTo(b * 0.75, l * 0.45, b * 0.35, 0);
  s.lineTo(-b * 0.35, 0);
  const geo = new THREE.ShapeGeometry(s, 14);
  const p = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i += 1) {
    const x = p.getX(i);
    const y = p.getY(i);
    const t = y / l;
    uv.setXY(i, x / (b * 1.5) + 0.5, t);
    // nach außen wölben und zur Mitte leicht falten (wirkt fester als ein flaches Blatt)
    p.setZ(i, -biegung * t * t * l + Math.abs(x) * 0.25);
  }
  geo.computeVertexNormals();
  return geo;
}

function topf(low, radius, hoehe, farbe = "#b5562c") {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: farbe, roughness: 0.8 });
  const k = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.78, hoehe, 18), m);
  k.position.y = hoehe / 2;
  const rand = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.06, radius * 1.06, hoehe * 0.14, 18), m);
  rand.position.y = hoehe * 0.93;
  const erde = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.95, 18), new THREE.MeshStandardMaterial({ color: "#3b2a1e", roughness: 1 }));
  erde.rotation.x = -Math.PI / 2;
  erde.position.y = hoehe * 0.97;
  for (const x of [k, rand]) {
    x.castShadow = !low;
    x.receiveShadow = !low;
  }
  g.add(k, rand, erde);
  return g;
}

function blaetterAuf(gruppe, { anzahl, b, l, lVar, biegung, neigung, neigungVar, hoehe, mat, seed, low }) {
  const rnd = zufall(seed);
  for (let i = 0; i < anzahl; i += 1) {
    const geo = blattGeometrie(b * (0.85 + rnd() * 0.3), l * (1 - lVar / 2 + rnd() * lVar), biegung * (0.8 + rnd() * 0.4));
    const blatt = new THREE.Mesh(geo, mat);
    blatt.castShadow = !low;
    const halter = new THREE.Group();
    halter.rotation.y = (i / anzahl) * Math.PI * 2 + rnd() * 0.5;
    // neigung > 0: Blatt kippt nach außen (−z im Halter, der um die Mitte gedreht ist)
    blatt.rotation.x = -(neigung + (rnd() - 0.5) * neigungVar);
    blatt.rotation.y = (rnd() - 0.5) * 0.8; // Blattfläche leicht gedreht
    blatt.position.set((rnd() - 0.5) * 0.05, hoehe, (rnd() - 0.5) * 0.05);
    halter.add(blatt);
    gruppe.add(halter);
  }
}

/** Große Bogenhanf-Pflanze im Terrakottatopf (Gesamthöhe etwa 2,6). */
export function bogenhanf({ low = false } = {}) {
  const g = new THREE.Group();
  g.add(topf(low, 0.42, 0.75));
  const tex = blattTextur("bogenhanf");
  const mat = new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.55 });
  blaetterAuf(g, { anzahl: 11, b: 0.22, l: 1.75, lVar: 0.5, biegung: 0.12, neigung: 0.16, neigungVar: 0.28, hoehe: 0.72, mat, seed: 17, low });
  return g;
}

/** Kleine Grünlilie mit überhängenden Blättern (für oben aufs Regal). */
export function gruenlilie({ low = false } = {}) {
  const g = new THREE.Group();
  g.add(topf(low, 0.13, 0.2, "#c76a3c"));
  const tex = blattTextur("gruenlilie");
  const mat = new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.6 });
  // innen aufrechter, außen weit überhängend
  blaetterAuf(g, { anzahl: 8, b: 0.045, l: 0.38, lVar: 0.3, biegung: 0.5, neigung: 0.25, neigungVar: 0.3, hoehe: 0.19, mat, seed: 5, low });
  blaetterAuf(g, { anzahl: 12, b: 0.045, l: 0.55, lVar: 0.35, biegung: 1.2, neigung: 0.75, neigungVar: 0.35, hoehe: 0.19, mat, seed: 9, low });
  return g;
}

/** Alles in der Gruppe freigeben (Geometrien, Materialien, Texturen). */
export function pflanzeEntsorgen(g) {
  g.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry.dispose();
    o.material.map?.dispose();
    o.material.dispose();
  });
}
