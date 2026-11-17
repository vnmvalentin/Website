// scene/regal.js — das Spieleregal an der Rückwand: In der mittleren Reihe stehen die Spiele des Abends als Kartons mit
// Titelbild, drumherum Bücher und gestapelte Schachteln; oben auf dem Regal ein Pokal und eine Grünlilie.
//
// Die Spielkartons sind anklickbar (zimmerSzene.js): Der Gastgeber wählt damit das Spiel. Der gewählte Karton steht
// ein Stück vor, der Karton unter dem Zeiger leuchtet leicht auf. Neues Spiel = Eintrag in COVER (sonst schlichter Karton).
import * as THREE from "three";
import { gruenlilie, pflanzeEntsorgen } from "./pflanzen.js";

const KARTON = { b: 0.72, h: 0.86, t: 0.17 };

function zufall(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function titel(g, text, w, y, farbe, groesse = 30) {
  g.fillStyle = farbe;
  g.textAlign = "center";
  g.textBaseline = "middle";
  const zeilen = Array.isArray(text) ? text : [text];
  zeilen.forEach((z, i) => {
    g.font = `900 ${groesse}px Rubik, "Arial Black", sans-serif`;
    g.fillText(z, w / 2, y + i * groesse * 1.05);
  });
}

// Titelbilder (256×300): je Spiel Farbe, Titel und ein Motiv
const COVER = {
  vierGewinnt: {
    seite: "#1f5ad6",
    malen(g, w, h) {
      g.fillStyle = "#1f5ad6";
      g.fillRect(0, 0, w, h);
      titel(g, "4 gewinnt", w, 44, "#ffffff", 40);
      g.fillStyle = "#1846a8";
      g.fillRect(34, 90, w - 68, 168);
      const farben = [null, null, "y", null, null, "r", "y", "r", null, "r", "y", "y", "r", "r", "y", "r", "y", "r", "y", "r"];
      for (let r = 0; r < 4; r += 1) {
        for (let c = 0; c < 5; c += 1) {
          const f = farben[r * 5 + c];
          g.fillStyle = f === "r" ? "#e23a3a" : f === "y" ? "#f4c20d" : "#0e2a6b";
          g.beginPath();
          g.arc(58 + c * 35, 112 + r * 40, 14, 0, Math.PI * 2);
          g.fill();
        }
      }
    },
  },
  maedn: {
    seite: "#c8372d",
    malen(g, w, h) {
      g.fillStyle = "#f3e3b8";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#c8372d";
      g.fillRect(0, 0, w, 92);
      titel(g, ["Mensch ärgere", "dich nicht"], w, 32, "#ffffff", 27);
      // Kreuz aus Feldern
      g.strokeStyle = "#3b2a1a";
      g.lineWidth = 3;
      for (let i = 0; i < 9; i += 1) {
        for (const [x, y] of [[w / 2 - 16, 114 + i * 19], [w / 2 + 16, 114 + i * 19], [52 + i * 19, 190], [52 + i * 19, 222]]) {
          if (x > 100 && x < 156 && y > 175 && y < 240) continue;
          g.fillStyle = "#fbf6ea";
          g.beginPath();
          g.arc(x, y, 7, 0, Math.PI * 2);
          g.fill();
          g.stroke();
        }
      }
      const figuren = [["#d93a32", 52, 126], ["#2f6fd6", 204, 126], ["#2f9e4a", 204, 270], ["#f2c21b", 52, 270]];
      for (const [f, x, y] of figuren) {
        g.fillStyle = f;
        g.beginPath();
        g.moveTo(x - 14, y + 14);
        g.lineTo(x + 14, y + 14);
        g.lineTo(x + 5, y - 6);
        g.lineTo(x - 5, y - 6);
        g.closePath();
        g.fill();
        g.beginPath();
        g.arc(x, y - 11, 8, 0, Math.PI * 2);
        g.fill();
      }
    },
  },
  zeichnen: {
    seite: "#4b347a",
    malen(g, w, h) {
      g.fillStyle = "#4b347a";
      g.fillRect(0, 0, w, h);
      titel(g, ["Zeichen-", "Hochstapler"], w, 38, "#ffe9a8", 32);
      // Blatt mit Kritzelei
      g.fillStyle = "#fbf6ea";
      g.save();
      g.translate(w / 2, 200);
      g.rotate(-0.08);
      g.fillRect(-82, -62, 164, 124);
      g.strokeStyle = "#2f6fd6";
      g.lineWidth = 5;
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(-60, 30);
      g.bezierCurveTo(-30, -60, 10, 50, 40, -30);
      g.stroke();
      g.strokeStyle = "#d93a32";
      g.beginPath();
      g.arc(20, 10, 22, 0.4, 5.2);
      g.stroke();
      g.restore();
      // Maske mit Fragezeichen
      g.fillStyle = "#1c1424";
      g.beginPath();
      g.ellipse(196, 128, 30, 18, 0, 0, Math.PI * 2);
      g.fill();
      titel(g, "?", 392, 128, "#ffe9a8", 30);
    },
  },
};

function coverTextur(id, name) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 300;
  const g = c.getContext("2d");
  const cover = COVER[id];
  if (cover) cover.malen(g, 256, 300);
  else {
    g.fillStyle = "#6b4f3a";
    g.fillRect(0, 0, 256, 300);
    titel(g, name, 256, 150, "#ffffff", 26);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/**
 * @param {{ low?: boolean, spiele: { id: string, name: string }[] }} opts
 */
export function buildRegal({ low = false, spiele }) {
  const root = new THREE.Group();
  const geos = [];
  const mats = [];
  const texs = [];
  const mat = (o) => {
    const m = new THREE.MeshStandardMaterial({ roughness: 0.75, ...o });
    mats.push(m);
    return m;
  };
  const box = (w, h, d, m, x, y, z, parent = root) => {
    const geo = new THREE.BoxGeometry(w, h, d);
    geos.push(geo);
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = !low;
    mesh.receiveShadow = !low;
    parent.add(mesh);
    return mesh;
  };

  // Korpus: Rückwand, Seiten, vier Böden
  const holz = mat({ color: "#7a4c2c", roughness: 0.6 });
  const dunkel = mat({ color: "#4a2d1a", roughness: 0.7 });
  const B = 3.2;
  const T = 0.6;
  box(B, 3.4, 0.05, dunkel, 0, 1.7, -T / 2 + 0.03);
  for (const sx of [-1, 1]) box(0.09, 3.4, T, holz, sx * (B / 2), 1.7, 0);
  // drei Fächer; das oberste ist hoch genug für Bücher (früher ragten Pokal und Pflanze durch ein zu flaches viertes)
  const boeden = [0.06, 1.0, 2.05];
  const DECKEL = 3.42;
  for (const y of boeden) box(B, 0.07, T, holz, 0, y, 0);
  box(B + 0.12, 0.1, T + 0.06, holz, 0, DECKEL, 0);

  // Spielkartons in der mittleren Reihe, Titel nach vorn
  const kartons = [];
  const abstand = B / (spiele.length + 1);
  spiele.forEach((s, i) => {
    const tex = coverTextur(s.id, s.name);
    texs.push(tex);
    const seite = mat({ color: COVER[s.id]?.seite || "#6b4f3a" });
    const vorne = mat({ map: tex, roughness: 0.55, emissive: "#ffffff", emissiveMap: tex, emissiveIntensity: 0 });
    const geo = new THREE.BoxGeometry(KARTON.b, KARTON.h, KARTON.t);
    geos.push(geo);
    const m = new THREE.Mesh(geo, [seite, seite, seite, seite, vorne, seite]);
    m.castShadow = !low;
    const x = -B / 2 + abstand * (i + 1);
    m.position.set(x, 1.035 + KARTON.h / 2, 0.02);
    m.rotation.y = (i % 2 ? 1 : -1) * 0.04;
    m.userData.spiel = s.id;
    root.add(m);
    kartons.push({ id: s.id, mesh: m, vorne, x, raus: 0 });
  });

  // Deko: unten gestapelte Schachteln und Bücher, oben Bücher, Pokal und Pflanze
  const rnd = zufall(5);
  const buchFarben = ["#7a2633", "#2c4a5a", "#d9a441", "#4a5d3a", "#3d2f4f", "#b5651d", "#9b3b2a"];
  const buchMat = () => mat({ color: buchFarben[Math.floor(rnd() * buchFarben.length)], roughness: 0.85 });
  // Alles bleibt zwischen den Seitenwänden: jedes Stück wird nur gestellt, wenn es ganz hineinpasst
  const RECHTS = B / 2 - 0.08;
  // Reihe stehender Bücher ab x, so viele wie passen (mit kleinen Lücken)
  function buecherReihe(x0, boden, anzahl, hMin, hVar) {
    let x = x0;
    for (let b = 0; b < anzahl; b += 1) {
      const bh = hMin + rnd() * hVar;
      const bw = 0.07 + rnd() * 0.05;
      if (x + bw > RECHTS) break;
      box(bw, bh, 0.4, buchMat(), x + bw / 2, boden + 0.035 + bh / 2, 0);
      x += bw + 0.012;
    }
    return x;
  }
  // unten: gestapelte Schachteln im Wechsel mit Bücherreihen
  let x = -B / 2 + 0.12;
  while (x < RECHTS - 0.1) {
    if (rnd() < 0.45 && x + 0.62 <= RECHTS) {
      let y = boeden[0] + 0.035;
      const stapel = 1 + Math.floor(rnd() * 3);
      for (let s = 0; s < stapel; s += 1) {
        const d = 0.1 + rnd() * 0.08;
        box(0.6, d, 0.46, mat({ color: ["#c9b28a", "#8a6a9a", "#5d8a6a", "#b5503c"][Math.floor(rnd() * 4)] }), x + 0.31, y + d / 2, 0.02).rotation.y = (rnd() - 0.5) * 0.08;
        y += d;
      }
      x += 0.72;
    } else {
      const bis = buecherReihe(x, boeden[0], 3 + Math.floor(rnd() * 5), 0.55, 0.3);
      if (bis === x) break;
      x = bis + 0.2;
    }
  }
  // oben: Bücherreihe, zwischendurch ein liegender Stapel (statt schräger Bücher, die ins Nachbarbuch ragten)
  x = -B / 2 + 0.12;
  while (x < RECHTS - 0.1) {
    if (rnd() < 0.18 && x + 0.5 <= RECHTS) {
      let y = boeden[2] + 0.035;
      for (let s = 0; s < 2 + Math.floor(rnd() * 2); s += 1) {
        const d = 0.06 + rnd() * 0.03;
        box(0.46, d, 0.34, buchMat(), x + 0.25, y + d / 2, 0.02).rotation.y = (rnd() - 0.5) * 0.12;
        y += d;
      }
      x += 0.56;
    } else {
      const bis = buecherReihe(x, boeden[2], 3 + Math.floor(rnd() * 6), 0.6, 0.28);
      if (bis === x) break;
      x = bis + (rnd() < 0.3 ? 0.12 : 0.02);
    }
  }
  // Pokal
  const gold = mat({ color: "#d9a73a", metalness: 0.8, roughness: 0.3 });
  const pokal = new THREE.LatheGeometry([[0, 0], [0.12, 0], [0.12, 0.03], [0.03, 0.06], [0.03, 0.16], [0.14, 0.22], [0.16, 0.36], [0, 0.36]].map(([a, b]) => new THREE.Vector2(a, b)), 20);
  geos.push(pokal);
  const p = new THREE.Mesh(pokal, gold);
  p.position.set(-0.9, DECKEL + 0.05, 0);
  p.castShadow = !low;
  root.add(p);
  // Grünlilie, deren Blätter über die Kante hängen
  const lilie = gruenlilie({ low });
  lilie.position.set(0.95, DECKEL + 0.05, 0.05);
  root.add(lilie);

  let gewaehlt = null;
  let unterZeiger = null;
  function waehle(id) {
    gewaehlt = id;
  }
  function hover(id) {
    unterZeiger = id;
  }
  function update(dt) {
    const k = 1 - Math.exp(-dt * 8);
    for (const kt of kartons) {
      kt.raus += ((kt.id === gewaehlt ? 1 : 0) - kt.raus) * k;
      kt.mesh.position.z = 0.02 + kt.raus * 0.16;
      kt.mesh.position.y = 1.035 + KARTON.h / 2 + kt.raus * 0.04;
      const glanz = kt.id === unterZeiger ? 0.22 : 0;
      kt.vorne.emissiveIntensity += (glanz - kt.vorne.emissiveIntensity) * k;
    }
  }
  function dispose() {
    pflanzeEntsorgen(lilie);
    geos.forEach((g) => g.dispose());
    mats.forEach((m) => m.dispose());
    texs.forEach((t) => t.dispose());
  }

  return { root, kartons, waehle, hover, update, dispose };
}
