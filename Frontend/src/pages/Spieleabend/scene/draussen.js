// scene/draussen.js — was man durchs Fenster sieht: Nachthimmel mit Sternen und Mond, verschneite Nachbarhäuser mit
// erleuchteten Fenstern, ein paar Tannen und leiser Schneefall. Alles hinter der Rückwand (z < −8.5); weil es echte
// Tiefe hat, verschiebt sich der Blick beim Laufen durchs Zimmer.
//
// Bewusst unbeleuchtete Materialien (MeshBasic): die Nacht draußen soll nicht vom warmen Zimmerlicht angestrahlt werden.
import * as THREE from "three";

function zufall(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function himmelTextur() {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 512;
  const g = c.getContext("2d");
  const v = g.createLinearGradient(0, 0, 0, 512);
  v.addColorStop(0, "#060a1f");
  v.addColorStop(0.55, "#121c45");
  v.addColorStop(0.85, "#2a2f5e");
  v.addColorStop(1, "#3c3a66");
  g.fillStyle = v;
  g.fillRect(0, 0, 1024, 512);
  const rnd = zufall(7);
  for (let i = 0; i < 420; i += 1) {
    const y = rnd() * 380;
    g.fillStyle = `rgba(255, 252, 235, ${0.25 + rnd() * 0.7 * (1 - y / 460)})`;
    const s = rnd() < 0.08 ? 2 : 1;
    g.fillRect(rnd() * 1024, y, s, s);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function glutTextur() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const g = c.getContext("2d");
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, "rgba(255, 246, 214, 0.55)");
  r.addColorStop(0.35, "rgba(200, 210, 255, 0.18)");
  r.addColorStop(1, "rgba(200, 210, 255, 0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/** @param {{ low?: boolean, boden: number }} opts  boden = Höhe des Zimmerbodens (raum.js BODEN) */
export function buildDraussen({ low = false, boden: BODEN }) {
  const root = new THREE.Group();
  const UNTEN = BODEN - 6; // Straße: das Zimmer liegt ein gutes Stück darüber, man schaut über die Dächer
  const geos = [];
  const mats = [];
  const texs = [];
  const basic = (o) => {
    const m = new THREE.MeshBasicMaterial(o);
    mats.push(m);
    return m;
  };
  const add = (geo, m, parent = root) => {
    geos.push(geo);
    const x = new THREE.Mesh(geo, m);
    parent.add(x);
    return x;
  };

  // Himmel als große Wand weit hinten
  const himmelTex = himmelTextur();
  texs.push(himmelTex);
  const himmel = add(new THREE.PlaneGeometry(90, 45), basic({ map: himmelTex, toneMapped: false }));
  himmel.position.set(0, BODEN + 14, -42);

  // Mond mit Hof
  const mond = add(new THREE.CircleGeometry(1.3, 40), basic({ color: "#fbf3d8", toneMapped: false }));
  mond.position.set(4.2, BODEN + 5.4, -40);
  const glutTex = glutTextur();
  texs.push(glutTex);
  const glut = new THREE.Sprite(new THREE.SpriteMaterial({ map: glutTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  mats.push(glut.material);
  glut.scale.set(11, 11, 1);
  glut.position.set(4.2, BODEN + 5.4, -39.9);
  root.add(glut);

  // Verschneiter Boden (das Zimmer liegt im ersten Stock)
  const boden = add(new THREE.PlaneGeometry(90, 40), basic({ color: "#5b6a92" }));
  boden.rotation.x = -Math.PI / 2;
  boden.position.set(0, UNTEN, -28);

  // Nachbarhäuser
  const rnd = zufall(31);
  const wandFarben = ["#1d2440", "#232a4a", "#1a2038", "#2a2748"];
  const dachMat = basic({ color: "#121626" });
  const schneeMat = basic({ color: "#c9d4ee" });
  const lichtMat = basic({ color: "#ffcf73", toneMapped: false });
  const dunkelMat = basic({ color: "#0d1122" });
  const dachForm = new THREE.Shape();
  dachForm.moveTo(-0.5, 0);
  dachForm.lineTo(0.5, 0);
  dachForm.lineTo(0, 0.5);
  dachForm.closePath();
  const dachGeo = new THREE.ExtrudeGeometry(dachForm, { depth: 1, bevelEnabled: false });
  dachGeo.translate(0, 0, -0.5);
  geos.push(dachGeo);
  const fensterGeo = new THREE.PlaneGeometry(0.42, 0.55);
  geos.push(fensterGeo);
  const hausGeo = new THREE.BoxGeometry(1, 1, 1);
  geos.push(hausGeo);
  const haeuser = [
    [-13, -27, 4.5, 6.5], [-7.5, -24, 3.8, 5], [-2.5, -30, 5.5, 7.5], [3, -25, 4, 5.5], [8.5, -29, 5, 8], [14, -24.5, 4.2, 6],
    [-18, -33, 5, 9], [18.5, -33, 5, 7],
  ];
  for (const [x, z, b, h] of haeuser) {
    const haus = new THREE.Group();
    const korpus = new THREE.Mesh(hausGeo, basic({ color: wandFarben[Math.floor(rnd() * wandFarben.length)] }));
    korpus.scale.set(b, h, 3.2);
    korpus.position.y = h / 2;
    haus.add(korpus);
    const dach = new THREE.Mesh(dachGeo, dachMat);
    dach.scale.set(b + 0.5, b * 0.9, 3.5);
    dach.position.y = h;
    haus.add(dach);
    // Schnee auf dem Dach: etwas kleiner und heller, leicht obenauf
    const schnee = new THREE.Mesh(dachGeo, schneeMat);
    schnee.scale.set(b + 0.3, b * 0.82, 3.3);
    schnee.position.set(0, h + 0.12, 0.05);
    haus.add(schnee);
    if (rnd() < 0.7) {
      const kamin = new THREE.Mesh(hausGeo, dachMat);
      kamin.scale.set(0.45, 1.2, 0.45);
      kamin.position.set(b * 0.22, h + b * 0.35, 0.3);
      haus.add(kamin);
    }
    // Fensterreihen, manche erleuchtet
    const reihen = Math.max(1, Math.floor((h - 1) / 1.6));
    const spalten = Math.max(1, Math.floor(b / 1.3));
    for (let r = 0; r < reihen; r += 1) {
      for (let s = 0; s < spalten; s += 1) {
        const f = new THREE.Mesh(fensterGeo, rnd() < 0.45 ? lichtMat : dunkelMat);
        f.position.set((s - (spalten - 1) / 2) * 1.25, 1.2 + r * 1.6, 1.61);
        haus.add(f);
      }
    }
    haus.position.set(x, UNTEN, z);
    root.add(haus);
  }

  // Tannen mit Schneespitzen
  const tanneMat = basic({ color: "#0e2a24" });
  const tannenSchnee = basic({ color: "#b8c6e6" });
  for (const [x, z, s] of [[-6, -15, 1.9], [-4.4, -16.5, 1.5], [5.5, -14.5, 1.8], [7.4, -16, 2.2], [0.8, -18, 1.4]]) {
    for (let i = 0; i < 3; i += 1) {
      const kegel = add(new THREE.ConeGeometry(1.2 * s * (1 - i * 0.25), 1.6 * s, 7), i === 2 ? tannenSchnee : tanneMat);
      kegel.position.set(x, UNTEN + s * (0.9 + i * 0.9), z);
    }
  }

  // Schneefall vor dem Fenster
  const ANZAHL = low ? 160 : 420;
  const pos = new Float32Array(ANZAHL * 3);
  const tempo = new Float32Array(ANZAHL);
  for (let i = 0; i < ANZAHL; i += 1) {
    pos[i * 3] = (rnd() - 0.5) * 16;
    pos[i * 3 + 1] = UNTEN + rnd() * 14;
    pos[i * 3 + 2] = -8.8 - rnd() * 10;
    tempo[i] = 0.35 + rnd() * 0.45;
  }
  const schneeGeo = new THREE.BufferGeometry();
  schneeGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geos.push(schneeGeo);
  const flocken = new THREE.Points(schneeGeo, new THREE.PointsMaterial({ color: "#eef2ff", size: 0.06, sizeAttenuation: true, transparent: true, opacity: 0.85, depthWrite: false }));
  mats.push(flocken.material);
  root.add(flocken);

  function update(dt, time) {
    for (let i = 0; i < ANZAHL; i += 1) {
      let y = pos[i * 3 + 1] - tempo[i] * dt;
      if (y < UNTEN) y += 14;
      pos[i * 3 + 1] = y;
      pos[i * 3] += Math.sin(time * 0.7 + i) * 0.08 * dt;
    }
    schneeGeo.attributes.position.needsUpdate = true;
  }

  function dispose() {
    geos.forEach((g) => g.dispose());
    mats.forEach((m) => m.dispose());
    texs.forEach((t) => t.dispose());
  }

  return { root, update, dispose };
}
