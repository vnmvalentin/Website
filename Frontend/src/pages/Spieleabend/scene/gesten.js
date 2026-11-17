// scene/gesten.js — Gesten der Blobs: die sieben aus dem Gesten-Rad (winken, tanzen, jubeln, schmollen, klatschen,
// Mittelfinger, zeigen) und kleine Handgriffe (streicheln, werfen, Schnee holen, trinken).
//
// Jede Geste bewegt die beiden schwebenden Hände des Blobs (createAvatar → hands; Ruhelage (±0.5, 0.98, 0.5), der Blob
// schaut nach +z) und lässt den Körper wippen (schritt() gibt den Versatz zurück, zimmerSzene.js setzt ihn). Dazu
// gehört, was in der Luft passiert: Notenzeichen beim Tanzen, Konfetti beim Jubeln, eine Regenwolke beim Schmollen,
// ein verpixelter Zensurbalken über dem Mittelfinger, ein Ring an der Stelle, auf die jemand zeigt.
// In der Ich-Sicht sieht man den eigenen Blob nicht — dafür hängen zwei Hände vor der Kamera (Ebene FP_EBENE, die der
// Spiegel nicht sieht), die dieselbe Bewegung machen.
import * as THREE from "three";

/** Gesten im Rad, in dieser Reihenfolge rundherum (Backend zimmer.js RAD). */
export const RAD = [
  { id: "winken", name: "Winken" },
  { id: "tanzen", name: "Tanzen" },
  { id: "jubeln", name: "Jubeln" },
  { id: "schmollen", name: "Schmollen" },
  { id: "klatschen", name: "Klatschen" },
  { id: "mittelfinger", name: "Mittelfinger" },
  { id: "zeigen", name: "Zeigen" },
];
const DAUER = {
  winken: 1.8,
  tanzen: 4,
  jubeln: 1.9,
  schmollen: 3,
  klatschen: 1.75,
  mittelfinger: 2.2,
  zeigen: 2.4,
  streicheln: 2.0,
  werfen: 0.5,
  schneeHolen: 1.0,
  trinken: 1.5,
};
export const FP_EBENE = 2;

const RUHE = [new THREE.Vector3(-0.5, 0.98, 0.5), new THREE.Vector3(0.5, 0.98, 0.5)];
const KONFETTI_FARBEN = ["#e23a3a", "#f4c20d", "#2f9e4a", "#2f6fd6", "#ee8a1f", "#8a4fd1", "#f6ecdf"];
const NOTE_GEO = new THREE.SphereGeometry(0.08, 10, 8).scale(1.25, 0.9, 0.6);
const HALS_GEO = new THREE.BoxGeometry(0.025, 0.24, 0.025).translate(0.085, 0.12, 0);
const FAHNE_GEO = new THREE.BoxGeometry(0.1, 0.035, 0.02).translate(0.13, 0.22, 0).rotateZ(-0.25);
const KONFETTI_GEO = new THREE.PlaneGeometry(0.07, 0.11);
const TROPFEN_GEO = new THREE.SphereGeometry(0.03, 6, 5).scale(0.7, 1.6, 0.7);
const WOLKE_GEO = new THREE.SphereGeometry(0.22, 12, 10);
const FINGER_GEO = new THREE.CapsuleGeometry(0.045, 0.2, 4, 8).translate(0, 0.16, 0);
const RING_GEO = new THREE.TorusGeometry(0.36, 0.04, 8, 36).rotateX(Math.PI / 2);
const PFEIL_GEO = new THREE.ConeGeometry(0.13, 0.32, 14).rotateX(Math.PI);

const glatt = (k) => k * k * (3 - 2 * k);

/** Hände für Geste art zur Zeit t (s) in Avatar-Koordinaten (rechts = Index 0). richtung: lokale Zeigerichtung. */
function pose(art, t, richtung, aus) {
  const [r, l] = aus;
  r.copy(RUHE[0]);
  l.copy(RUHE[1]);
  if (art === "winken") r.set(-0.8 + Math.sin(t * 13) * 0.17, 2.05, 0.3);
  else if (art === "tanzen") {
    const s = Math.sin(t * Math.PI * 2); // ein Arm je Schlag (120 bpm)
    r.set(-0.74, 1.25 + Math.max(0, s) * 1.05, 0.35);
    l.set(0.74, 1.25 + Math.max(0, -s) * 1.05, 0.35);
  } else if (art === "jubeln") {
    const w = Math.sin(t * 22) * 0.06;
    r.set(-0.62 + w, 2.45, 0.2);
    l.set(0.62 - w, 2.45, 0.2);
  } else if (art === "schmollen") {
    r.set(0.2, 1.05, 0.64);
    l.set(-0.2, 1.13, 0.6);
  } else if (art === "klatschen") {
    // fünf Klatscher im Abstand von 0,3 s ab 0,15 s (sound.klatschen)
    const d = 0.07 + 0.3 * Math.abs(Math.sin((Math.PI * Math.max(0, t - 0.15)) / 0.3));
    r.set(-d, 1.42, 0.74);
    l.set(d, 1.42, 0.74);
  } else if (art === "mittelfinger") r.set(-0.22 + Math.sin(t * 9) * 0.02, 1.86, 0.8);
  else if (art === "zeigen") r.set(-0.4, 1.45, 0.25).addScaledVector(richtung, 0.75);
  else if (art === "streicheln") r.set(-0.15 + Math.sin(t * 7) * 0.08, 0.55 + Math.abs(Math.sin(t * 7)) * 0.12, 1.0 + Math.sin(t * 7) * 0.18);
  else if (art === "werfen") {
    const k = Math.min(1, t / 0.32);
    r.set(-0.55 + k * 0.15, 1.75 - k * 0.1, -0.35 + glatt(k) * 1.35);
  } else if (art === "schneeHolen") {
    const k = Math.sin(Math.min(1, t / 0.9) * Math.PI);
    r.set(-0.3, 1.25 + k * 0.4, 0.5 + k * 0.8);
    l.set(0.3, 1.25 + k * 0.4, 0.5 + k * 0.8);
  } else if (art === "trinken") r.set(-0.16, 1.62, 0.55);
}

/** Ein verpixelter Zensurbalken in Hautfarbtönen (je Geste neu, damit er zur Farbe des Blobs passt). */
function zensurTextur(farbe) {
  const c = document.createElement("canvas");
  c.width = 8;
  c.height = 8;
  const ctx = c.getContext("2d");
  const basis = new THREE.Color(farbe);
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const k = basis.clone().offsetHSL(0, -0.05, (Math.random() - 0.5) * 0.28);
      ctx.fillStyle = `#${k.getHexString()}`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * @param {{ scene: THREE.Scene, camera: THREE.Camera, low?: boolean }} opts
 */
export function createGesten({ scene, camera, low = false }) {
  const teilchen = []; // Noten, Konfetti, Tropfen: { mesh, v, dreh, t, leben, art }
  const pings = []; // Ringe an Zeige-Stellen
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();
  const notenMat = new THREE.MeshBasicMaterial({ color: "#ffe08a" });
  const wolkeMat = new THREE.MeshStandardMaterial({ color: "#7d8290", roughness: 1 });
  const tropfenMat = new THREE.MeshBasicMaterial({ color: "#8cc6ff" });
  const konfettiMats = KONFETTI_FARBEN.map((c) => new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));

  // ── Hände vor der Kamera (Ich-Sicht) ──
  const fpMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.5 });
  const fpHaende = [0, 1].map(() => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.036, 14, 10), fpMat);
    m.visible = false;
    m.layers.set(FP_EBENE);
    camera.add(m);
    return m;
  });
  camera.layers.enable(FP_EBENE);
  let fp = null; // { art, t, dauer, richtung, finger?, zensur? }
  const fpUnten = [new THREE.Vector3(0.26, -0.7, -0.6), new THREE.Vector3(-0.26, -0.7, -0.6)];

  /** Avatar-Pose → Kameraraum (Hände etwas zusammengerückt, damit sie im Bild bleiben). */
  function zurKamera(p, out) {
    return out.set(-p.x * 0.42, (p.y - 1.55) * 0.42 - 0.1, -0.55 - p.z * 0.12);
  }

  function aufraeumen(g) {
    for (const p of g.props) {
      p.parent?.remove(p);
      if (p.isSprite) {
        p.material.map?.dispose();
        p.material.dispose();
      }
    }
    g.props = [];
  }

  /** Laufende Geste einer Figur beenden (Hände zurück in Ruhe, Beiwerk weg). */
  function beende(f) {
    if (!f.rad) return;
    aufraeumen(f.rad);
    f.rad = null;
    f.av.hands?.forEach((h, i) => h.position.copy(RUHE[i]));
  }

  /** Finger an eine Hand stecken (zeigt in Richtung dir, Hand-Koordinaten). */
  function finger(hand, mat, dir, ebeneVon) {
    const m = new THREE.Mesh(FINGER_GEO, mat);
    m.quaternion.setFromUnitVectors(tmp.set(0, 1, 0), dir);
    m.layers.mask = ebeneVon.layers.mask;
    hand.add(m);
    return m;
  }

  function zensurBalken(farbe, groesse, ebeneVon) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: zensurTextur(farbe), depthTest: true }));
    s.scale.setScalar(groesse);
    s.layers.mask = ebeneVon.layers.mask;
    return s;
  }

  /** Ring mit Pfeil an der Stelle, auf die jemand zeigt. */
  function ping(punkt, farbe) {
    const mat = new THREE.MeshBasicMaterial({ color: farbe, transparent: true, opacity: 0.95, depthWrite: false });
    const g = new THREE.Group();
    const ring = new THREE.Mesh(RING_GEO, mat);
    const pfeil = new THREE.Mesh(PFEIL_GEO, mat);
    g.add(ring, pfeil);
    g.position.set(punkt.x, punkt.y + 0.03, punkt.z);
    scene.add(g);
    pings.push({ g, ring, pfeil, mat, t: 0 });
  }

  /**
   * Geste starten. f: Figur aus zimmerSzene.js (av, holder); punkt: Ziel beim Zeigen (Welt); farbe: Farbe des Blobs;
   * fp: auch die Hände vor der Kamera bewegen (eigener Blob in der Ich-Sicht).
   */
  function starte(f, art, { punkt = null, farbe = "#ffffff", fp: mitFp = false } = {}) {
    if (!DAUER[art] || !f?.av?.hands) return;
    beende(f);
    const g = { art, t: 0, dauer: DAUER[art], props: [], richtung: new THREE.Vector3(0, 0, 1), notenTakt: 0, wolke: null };
    const [rechts] = f.av.hands;
    const handMat = rechts.material;
    if (art === "zeigen" && punkt) {
      // Richtung im Blob: vom Schultergelenk zum Punkt, Drehung des Halters herausgerechnet
      const schulter = f.holder.localToWorld(tmp2.set(-0.35, f.av.group.position.y + 1.45, 0.2));
      g.richtung.set(punkt.x - schulter.x, punkt.y - schulter.y, punkt.z - schulter.z).applyAxisAngle(tmp.set(0, 1, 0), -f.holder.rotation.y).normalize();
      g.props.push(finger(rechts, handMat, g.richtung.clone(), rechts));
      ping(punkt, farbe);
    }
    if (art === "mittelfinger") {
      g.props.push(finger(rechts, handMat, new THREE.Vector3(0, 1, 0.15).normalize(), rechts));
      const balken = zensurBalken(farbe, 0.7, rechts);
      balken.position.set(0, 0.16, 0.12);
      rechts.add(balken);
      g.props.push(balken);
      g.balken = balken;
    }
    if (art === "schmollen") {
      const w = new THREE.Group();
      for (const [x, y, z, s] of [[-0.22, 0, 0, 1], [0.05, 0.08, 0.05, 1.25], [0.3, 0, 0, 0.95], [0.08, -0.06, -0.12, 1]]) {
        const k = new THREE.Mesh(WOLKE_GEO, wolkeMat);
        k.position.set(x, y, z);
        k.scale.setScalar(s);
        w.add(k);
      }
      w.scale.setScalar(0.001);
      scene.add(w);
      g.wolke = w;
      g.props.push(w);
    }
    if (art === "jubeln") {
      const kopf = f.holder.localToWorld(tmp.set(0, f.av.group.position.y + 2.6, 0));
      const anz = low ? 18 : 34;
      for (let i = 0; i < anz; i += 1) {
        const m = new THREE.Mesh(KONFETTI_GEO, konfettiMats[i % konfettiMats.length]);
        m.position.copy(kopf);
        const a = Math.random() * Math.PI * 2;
        const v = new THREE.Vector3(Math.cos(a) * (1 + Math.random() * 1.6), 2.6 + Math.random() * 2.2, Math.sin(a) * (1 + Math.random() * 1.6));
        scene.add(m);
        teilchen.push({ mesh: m, v, dreh: new THREE.Vector3(Math.random() * 9, Math.random() * 9, Math.random() * 9), t: 0, leben: 2.4, art: "konfetti" });
      }
    }
    f.rad = g;
    if (mitFp) fpStarte(art, g.richtung, farbe);
  }

  function fpStarte(art, richtung, farbe) {
    fpEnde();
    fp = { art, t: 0, dauer: DAUER[art], richtung: richtung.clone(), props: [] };
    fpMat.color.set(farbe).lerp(new THREE.Color("#ffffff"), 0.22);
    if (art === "zeigen") {
      const fi = finger(fpHaende[0], fpMat, richtung.clone().multiply(tmp.set(-1, 1, -1)).normalize(), fpHaende[0]);
      fi.scale.setScalar(0.28);
      fp.props.push(fi);
    }
    if (art === "mittelfinger") {
      const fi = finger(fpHaende[0], fpMat, new THREE.Vector3(0, 1, 0), fpHaende[0]);
      fi.scale.setScalar(0.28);
      fp.props.push(fi);
      const balken = zensurBalken(farbe, 0.13, fpHaende[0]);
      balken.position.set(0, 0.04, 0.02);
      fpHaende[0].add(balken);
      fp.props.push(balken);
    }
  }
  function fpEnde() {
    if (!fp) return;
    aufraeumen(fp);
    fp = null;
    fpHaende.forEach((h) => {
      h.visible = false;
    });
  }

  const handPose = [new THREE.Vector3(), new THREE.Vector3()];
  const handMix = new THREE.Vector3();
  /**
   * Dicker Bauch (Chips): Hände dort nach außen schieben, wo der Bauch ist (über dem Kopf kaum), und mit dem Kopf
   * anheben. form: { bauch: Radiuszuwachs, heben: Kopf gestiegen } in Avatar-Einheiten.
   */
  function mitBauch(p, form, out) {
    out.copy(p);
    if (!form || (form.bauch <= 0 && form.heben <= 0)) return out;
    const r = Math.hypot(p.x, p.z) || 1e-4;
    const amBauch = Math.max(0, Math.min(1, (1.55 - p.y) / 0.6 + 0.5));
    out.x += (p.x / r) * form.bauch * amBauch;
    out.z += (p.z / r) * form.bauch * amBauch;
    out.y += form.heben * (p.y > 1.3 ? 1 : 0.55);
    return out;
  }

  /**
   * Hände setzen und eine laufende Geste weiterführen (jedes Bild, auch ohne Geste: der Bauch schiebt die Hände).
   * Gibt den Körperversatz zurück ({ y, ry, rz, sy }) oder null, wenn keine Geste läuft. kopf: Weltpunkt über dem Kopf
   * (Wolke, Noten); form: Bauch (mitBauch).
   */
  function schritt(f, dt, kopf, form = null) {
    const g = f.rad;
    if (g) {
      g.t += dt;
      if (g.t >= g.dauer) beende(f);
    }
    if (!f.rad) {
      f.av.hands?.forEach((h, i) => h.position.copy(mitBauch(RUHE[i], form, handMix)));
      return null;
    }
    const t = g.t;
    // weich hinein und hinaus
    const w = glatt(Math.min(1, t / 0.18, (g.dauer - t) / 0.25));
    pose(g.art, t, g.richtung, handPose);
    f.av.hands.forEach((h, i) => h.position.copy(mitBauch(handMix.lerpVectors(RUHE[i], handPose[i], w), form, handMix)));
    const v = { y: 0, ry: 0, rz: 0, sy: 1 };
    if (g.art === "tanzen") {
      const s = Math.abs(Math.sin(t * Math.PI * 2));
      v.y = s * 0.28 * w;
      v.sy = 1 - (1 - s) * 0.06 * w;
      v.rz = Math.sin(t * Math.PI) * 0.16 * w;
      // hin und her wiegen, in der Mitte eine ganze Drehung (danach steht er wie vorher, 2π = 0)
      v.ry = Math.sin(t * Math.PI) * 0.45 * w + (t > 1.5 && t < 2.5 ? glatt(t - 1.5) * Math.PI * 2 : 0);
      g.notenTakt -= dt;
      if (g.notenTakt <= 0 && kopf) {
        g.notenTakt = 0.38;
        const n = new THREE.Group();
        n.add(new THREE.Mesh(NOTE_GEO, notenMat), new THREE.Mesh(HALS_GEO, notenMat));
        if (Math.random() < 0.5) n.add(new THREE.Mesh(FAHNE_GEO, notenMat));
        n.position.copy(kopf).add(tmp.set((Math.random() - 0.5) * 0.6, 0, (Math.random() - 0.5) * 0.6));
        scene.add(n);
        teilchen.push({ mesh: n, v: new THREE.Vector3((Math.random() - 0.5) * 0.5, 0.9, (Math.random() - 0.5) * 0.5), dreh: new THREE.Vector3(0, 0, 0), t: 0, leben: 1.4, art: "note" });
      }
    } else if (g.art === "jubeln") v.y = (t < 1.2 ? Math.abs(Math.sin((t * Math.PI) / 0.6)) * 0.5 : 0) * w;
    else if (g.art === "schmollen") {
      v.ry = 0.9 * w;
      v.sy = 1 - 0.07 * w;
      if (g.wolke && kopf) {
        g.wolke.position.copy(kopf).y += 0.35 + Math.sin(t * 2) * 0.04;
        g.wolke.scale.setScalar(Math.max(0.001, w) * 0.9);
        g.notenTakt -= dt;
        if (g.notenTakt <= 0 && w > 0.5) {
          g.notenTakt = 0.09;
          const d = new THREE.Mesh(TROPFEN_GEO, tropfenMat);
          d.position.copy(g.wolke.position).add(tmp.set((Math.random() - 0.5) * 0.6, -0.15, (Math.random() - 0.5) * 0.3));
          scene.add(d);
          teilchen.push({ mesh: d, v: new THREE.Vector3(0, -2.6, 0), dreh: new THREE.Vector3(0, 0, 0), t: 0, leben: 0.45, art: "tropfen" });
        }
      }
    } else if (g.art === "winken") v.y = Math.abs(Math.sin(t * 6.5)) * 0.05 * w;
    else if (g.art === "mittelfinger") {
      v.rz = 0.06 * w;
      // Zensurbalken zwischen Finger und Betrachter schieben, damit er ihn von jeder Seite verdeckt
      if (g.balken) {
        const hand = f.av.hands[0];
        hand.getWorldPosition(tmp);
        tmp2.copy(camera.position).sub(tmp).normalize().multiplyScalar(0.4).add(tmp);
        tmp2.y += 0.18;
        g.balken.position.copy(hand.worldToLocal(tmp2));
      }
    }
    else if (g.art === "klatschen") v.y = Math.abs(Math.sin((Math.PI * Math.max(0, t - 0.15)) / 0.3)) * 0.03 * w;
    return v;
  }

  /** Kameraversatz der eigenen Geste in der Ich-Sicht ({ y, rz }), dazu die Hände vor der Kamera. */
  function fpSchritt(dt) {
    if (!fp) return null;
    fp.t += dt;
    const t = fp.t;
    if (t >= fp.dauer) {
      fpEnde();
      return null;
    }
    const w = glatt(Math.min(1, t / 0.18, (fp.dauer - t) / 0.25));
    pose(fp.art, t, fp.richtung, handPose);
    fpHaende.forEach((h, i) => {
      // Arme in Ruhe bleiben unter dem Bildrand
      const ruht = fp.art === "zeigen" || fp.art === "mittelfinger" || fp.art === "winken" || fp.art === "trinken" || fp.art === "werfen" || fp.art === "streicheln";
      const soll = i === 1 && ruht ? fpUnten[1] : zurKamera(handPose[i], tmp);
      h.position.lerpVectors(fpUnten[i], soll, w);
      h.visible = w > 0.02;
    });
    if (fp.art === "tanzen") return { y: Math.abs(Math.sin(t * Math.PI * 2)) * 0.12 * w, rz: Math.sin(t * Math.PI) * 0.07 * w };
    if (fp.art === "jubeln") return { y: (t < 1.2 ? Math.abs(Math.sin((t * Math.PI) / 0.6)) * 0.25 : 0) * w, rz: 0 };
    return null;
  }

  /** Teilchen und Zeige-Ringe weiterbewegen (einmal je Bild). */
  function update(dt) {
    for (let i = teilchen.length - 1; i >= 0; i -= 1) {
      const p = teilchen[i];
      p.t += dt;
      if (p.art === "konfetti") {
        p.v.y -= 6.5 * dt;
        p.v.multiplyScalar(Math.exp(-dt * 2.4));
      }
      p.mesh.position.addScaledVector(p.v, dt);
      p.mesh.rotation.x += p.dreh.x * dt;
      p.mesh.rotation.y += p.dreh.y * dt;
      p.mesh.rotation.z += p.art === "note" ? Math.sin(p.t * 6) * dt : p.dreh.z * dt;
      if (p.art === "note") p.mesh.scale.setScalar(Math.max(0.001, Math.min(1, p.t * 6, (p.leben - p.t) * 3)));
      if (p.t > p.leben) {
        scene.remove(p.mesh);
        teilchen.splice(i, 1);
      }
    }
    for (let i = pings.length - 1; i >= 0; i -= 1) {
      const p = pings[i];
      p.t += dt;
      const auf = Math.min(1, p.t * 5);
      p.ring.scale.setScalar(auf * (1 + Math.sin(p.t * 9) * 0.08));
      p.pfeil.position.y = 0.55 + Math.abs(Math.sin(p.t * 5)) * 0.25;
      p.mat.opacity = 0.95 * Math.min(1, (3 - p.t) * 2);
      if (p.t > 3) {
        scene.remove(p.g);
        p.mat.dispose();
        pings.splice(i, 1);
      }
    }
  }

  function dispose() {
    fpEnde();
    for (const p of teilchen) scene.remove(p.mesh);
    for (const p of pings) {
      scene.remove(p.g);
      p.mat.dispose();
    }
    fpHaende.forEach((h) => {
      camera.remove(h);
      h.geometry.dispose();
    });
    [notenMat, wolkeMat, tropfenMat, fpMat, ...konfettiMats].forEach((m) => m.dispose());
  }

  return { starte, beende, schritt, fpSchritt, fpEnde, update, dispose, get fpAktiv() { return !!fp; } };
}
