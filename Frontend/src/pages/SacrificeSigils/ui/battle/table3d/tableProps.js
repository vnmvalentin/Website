// ui/battle/table3d/tableProps.js — Gegenstände auf dem 3D-Tisch: Messingwaage und geschnitzte Totems.
//
// Beide sind reine Anzeige: die Regeln, Texte und Tooltips bleiben im DOM. Die Waage kippt wie die
// bisherige SVG-Waage (gedämpfte Feder mit Nachschwingen, deine Schale links, bei 4 zittert sie) und legt
// Gewichte in die Schale dessen, der vorn liegt.
import * as THREE from "three";

const SCALE_WIN = 5;
const lathe = (pts, segs = 28) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), segs);

/** Messing-Materialien teilen sich alle Gegenstände (werden vom Aufrufer entsorgt). */
export function propMaterials() {
  return {
    // Messing nur halb metallisch: ohne Umgebungsbild wäre echtes Metall im Kerzenlicht fast schwarz
    brass: new THREE.MeshStandardMaterial({ color: 0xc49a5c, roughness: 0.38, metalness: 0.5, emissive: 0x2a1a08, emissiveIntensity: 0.6 }),
    brassDark: new THREE.MeshStandardMaterial({ color: 0x7a5c34, roughness: 0.45, metalness: 0.5 }),
    iron: new THREE.MeshStandardMaterial({ color: 0x2b2622, roughness: 0.6, metalness: 0.6 }),
    wood: new THREE.MeshStandardMaterial({ color: 0xa0703f, roughness: 0.72, emissive: 0x2a180a, emissiveIntensity: 0.7 }),
    woodDark: new THREE.MeshStandardMaterial({ color: 0x2a1a0e, roughness: 0.9 }),
    bone: new THREE.MeshStandardMaterial({ color: 0xe6dcc4, roughness: 0.7 }),
  };
}

/**
 * Balkenwaage (Tischeinheiten: etwa 34 breit, 26 hoch). `set(value)` = Vorsprung aus deiner Sicht (−5…5),
 * `update(dt, t, reduced)` lässt sie federn. Rückgabe `moving` = noch in Bewegung.
 */
export function makeScale(mat) {
  const group = new THREE.Group();
  const base = new THREE.Mesh(lathe([[0, 0], [7, 0], [7.4, 0.6], [6.2, 1.4], [3, 1.9], [1.4, 3], [0, 3]]), mat.brass);
  group.add(base);
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 1.1, 19, 16).translate(0, 12.5, 0), mat.brass);
  group.add(column);
  const finial = new THREE.Mesh(new THREE.SphereGeometry(1.3, 16, 12).translate(0, 24.4, 0), mat.brass);
  group.add(finial);
  // Balken dreht um die Achse in Blickrichtung (z), sodass das Kippen von vorn zu sehen ist
  const beam = new THREE.Group();
  beam.position.y = 22;
  group.add(beam);
  beam.add(new THREE.Mesh(new THREE.BoxGeometry(32, 0.9, 1.1), mat.brass));
  beam.add(new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 1.6, 20).rotateX(Math.PI / 2), mat.brassDark));
  const pointer = new THREE.Mesh(new THREE.ConeGeometry(0.5, 4.5, 8).translate(0, 2.6, 0), mat.brassDark);
  beam.add(pointer);
  const L = 15;
  const pans = [-1, 1].map((side) => {
    const pan = new THREE.Group();
    group.add(pan);
    // drei Ketten zur Schale, die immer waagrecht hängt
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 9.4, 4), mat.brassDark);
      const bx = Math.cos(a) * 3.6, bz = Math.sin(a) * 3.6;
      chain.position.set(bx / 2, -4.7, bz / 2);
      chain.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-bx, 9.4, -bz).normalize());
      pan.add(chain);
    }
    const dish = new THREE.Mesh(lathe([[0, -0.6], [3, -0.5], [4.2, 0.4], [4.3, 0.9], [0, -0.2]]).translate(0, -9.6, 0), mat.brass);
    pan.add(dish);
    const weights = new THREE.Group();
    weights.position.y = -9.4;
    pan.add(weights);
    return { pan, side, weights };
  });
  // Gewichte: kleine Eisenblöcke mit Messinggriff, bis zu 7 je Schale
  const wGeo = new THREE.CylinderGeometry(0.8, 1.0, 1.2, 10);
  const knobGeo = new THREE.SphereGeometry(0.35, 8, 6);
  const placeWeights = (target, n) => {
    while (target.children.length > n) target.remove(target.children[target.children.length - 1]);
    for (let i = target.children.length; i < n; i++) {
      const w = new THREE.Group();
      w.add(new THREE.Mesh(wGeo, mat.iron));
      const knob = new THREE.Mesh(knobGeo, mat.brassDark);
      knob.position.y = 0.75;
      w.add(knob);
      const ring = i < 4 ? i : i - 4;
      const layer = i < 4 ? 0 : 1;
      const a = (ring / (layer ? 3 : 4)) * Math.PI * 2 + layer * 0.6;
      const r = i === 0 && n === 1 ? 0 : layer ? 1.1 : 1.9;
      w.position.set(Math.cos(a) * r, 0.6 + layer * 1.25, Math.sin(a) * r);
      target.add(w);
    }
  };

  const DEG = (6.2 * Math.PI) / 180;
  const st = { a: 0, v: 0, target: 0, value: 0 };
  const place = (a) => {
    beam.rotation.z = a;
    for (const p of pans) {
      // Balkenende (deine Schale links = side −1)
      p.pan.position.set(beam.position.x + Math.cos(a) * L * p.side, beam.position.y + Math.sin(a) * L * p.side, 0);
    }
  };
  place(0);
  return {
    group,
    set(value) {
      if (value === st.value) return;
      st.value = value;
      // deine Schale (links) sinkt bei Vorsprung: positiver Winkel um z senkt das linke Ende
      st.target = Math.max(-SCALE_WIN - 1, Math.min(SCALE_WIN + 1, value)) * DEG;
      st.v += (st.target - st.a) * 0.08;
      const lead = Math.min(7, Math.abs(value));
      placeWeights(pans[0].weights, value > 0 ? lead : 0);
      placeWeights(pans[1].weights, value < 0 ? lead : 0);
    },
    update(dt, t, reduced) {
      const tense = Math.abs(st.value) >= SCALE_WIN - 1;
      if (reduced) { st.a = st.target; st.v = 0; }
      else {
        // gleiche Feder wie die SVG-Waage, auf 60 Bilder/s normiert
        const steps = Math.max(1, Math.round(dt * 60));
        for (let i = 0; i < steps; i++) {
          st.v += -0.06 * (st.a - st.target) - 0.16 * st.v;
          st.a += st.v;
        }
      }
      const jitter = tense && !reduced ? (Math.sin(t * 27) * 0.35 + Math.sin(t * 77) * 0.2) * (Math.PI / 180) : 0;
      place(st.a + jitter);
      return tense || Math.abs(st.v) > 0.0005 || Math.abs(st.a - st.target) > 0.001;
    },
  };
}

/** Schild am Totem: Name des Kopfs in Tusche auf hellem Holz. */
function plaqueTexture(text) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#c9a876";
  ctx.fillRect(0, 0, 256, 64);
  ctx.strokeStyle = "rgba(40,24,10,0.6)";
  ctx.lineWidth = 4;
  ctx.strokeRect(3, 3, 250, 58);
  ctx.fillStyle = "#1a1612";
  ctx.font = "600 30px 'IM Fell English SC', Georgia, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let s = String(text || "");
  while (s.length > 1 && ctx.measureText(s).width > 236) s = s.slice(0, -1);
  ctx.fillText(s, 128, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/**
 * Geschnitzter Totempfahl (etwa 14 hoch). `kind`: "tribe" (Eule), "lane" (Widder mit Hörnern),
 * sonst Maske. `label` steht auf dem Schild am Fuß. `dispose()` entsorgt Geometrien und Schild (Materialien sind geteilt).
 */
export function makeTotem(mat, kind = "tribe", label = "") {
  const totem = new THREE.Group();
  const pole = new THREE.Mesh(lathe([
    [0, 0], [3.6, 0], [3.6, 1.1], [2.5, 1.4], [2.7, 3.0], [2.2, 3.4], [2.7, 5.0], [2.2, 5.4], [2.6, 7.0], [2.0, 7.4], [0, 7.4],
  ], 20), mat.wood);
  totem.add(pole);
  for (const y of [2.2, 4.2, 6.2]) {
    const notch = new THREE.Mesh(new THREE.TorusGeometry(2.48, 0.12, 6, 24), mat.woodDark);
    notch.rotation.x = Math.PI / 2;
    notch.position.y = y;
    totem.add(notch);
  }
  const head = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), mat.wood);
  head.scale.set(3, 2.6, 2.7);
  head.position.y = 9.4;
  totem.add(head);
  const eyeGeo = new THREE.SphereGeometry(0.7, 14, 10);
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, mat.woodDark);
    eye.position.set(sx * 1.15, 9.8, 2.25);
    totem.add(eye);
    if (kind === "lane") {
      // Widderhörner
      const horn = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.42, 8, 16, Math.PI * 1.4), mat.bone);
      horn.position.set(sx * 2.4, 10.6, -0.3);
      horn.rotation.set(0, sx * Math.PI / 2, sx > 0 ? 0.4 : Math.PI - 0.4);
      totem.add(horn);
    } else if (kind === "tribe") {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.2, 8, 20), mat.wood);
      ring.position.set(sx * 1.15, 9.8, 2.35);
      const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.7, 2.4, 8), mat.wood);
      tuft.position.set(sx * 1.9, 12.1, 0);
      tuft.rotation.z = -sx * 0.45;
      totem.add(ring, tuft);
    } else {
      const mark = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.2, 0.3), mat.woodDark);
      mark.position.set(sx * 1.15, 8.6, 2.5);
      totem.add(mark);
    }
  }
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.6, 8), mat.woodDark);
  beak.position.set(0, 8.9, 2.75);
  beak.rotation.x = Math.PI / 2 + 0.5;
  totem.add(beak);
  let plaqueTex = null;
  let plaqueMat = null;
  if (label) {
    plaqueTex = plaqueTexture(label);
    plaqueMat = new THREE.MeshStandardMaterial({ map: plaqueTex, roughness: 0.8 });
    const plaque = new THREE.Mesh(new THREE.BoxGeometry(7.2, 1.8, 0.3), [mat.wood, mat.wood, mat.wood, mat.wood,
      plaqueMat, mat.wood]);
    plaque.position.set(0, 0.95, 3.75);
    plaque.rotation.x = -0.35;
    totem.add(plaque);
  }
  return {
    group: totem,
    dispose() {
      totem.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      plaqueTex?.dispose();
      plaqueMat?.dispose();
    },
  };
}
