// scene/zeichnen3d.js — Zeichen-Hochstapler auf dem Tisch: ein großes Blatt Papier, darauf die Striche aller in ihrer
// Farbe, dazu ein Buntstift, der zum Zeichner wandert und beim Zeichnen der Linie folgt.
//
// Spielobjekt für zimmerSzene.js (Schnittstelle wie createVierGewinntSpiel), dazu Ziehen statt Klicken:
//   ziehenStart(ray) → true, wenn man jetzt zeichnen darf und das Blatt getroffen hat; ziehen(ray); ziehenEnde()
//   live({ platz, nr, punkte })  Strich-Stück eines anderen (sa:live), wird sofort weitergemalt
// Der eigene Strich wird sofort gemalt und in Stücken an den Server geschickt (sende); fertig beim Loslassen.
// Koordinaten auf dem Blatt: 0–1 in beide Richtungen (UV), für alle gleich — jeder sieht das Blatt von seinem Platz.
import * as THREE from "three";

const BREITE = 2.5;
const TIEFE = 1.75;
const PX_B = 1024;
const PX_H = Math.round((PX_B * TIEFE) / BREITE);
const LINIE = 11;
const SENDEN_MS = 80;
const MAX_PUNKTE = 380; // Server nimmt 400

export function createZeichnenSpiel({ low = false, sound, platzRichtung, sende }) {
  const group = new THREE.Group();

  // Papierstapel mit dem Zeichenblatt obenauf
  const canvas = document.createElement("canvas");
  canvas.width = PX_B;
  canvas.height = PX_H;
  const ctx = canvas.getContext("2d");
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const stapelMat = new THREE.MeshStandardMaterial({ color: "#e9e0cc", roughness: 0.95 });
  const stapel = new THREE.Mesh(new THREE.BoxGeometry(BREITE + 0.06, 0.03, TIEFE + 0.06), stapelMat);
  stapel.position.y = 0.015;
  stapel.receiveShadow = !low;
  // etwas gedämpft: unter der hellen Hängelampe wirkt reines Weiß grell und die Striche verblassen
  const blattMat = new THREE.MeshStandardMaterial({ map: tex, color: "#d8d1c0", roughness: 0.9 });
  const blattGeo = new THREE.PlaneGeometry(BREITE, TIEFE);
  blattGeo.rotateX(-Math.PI / 2);
  const blatt = new THREE.Mesh(blattGeo, blattMat);
  blatt.position.y = 0.032;
  blatt.receiveShadow = !low;
  group.add(stapel, blatt);
  const ebene = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.032);

  // Buntstift: sechseckiger Schaft, Holzspitze, Mine in der Farbe
  const stift = new THREE.Group();
  const schaftMat = new THREE.MeshStandardMaterial({ color: "#d93a32", roughness: 0.5 });
  const holzMat = new THREE.MeshStandardMaterial({ color: "#e8c48f", roughness: 0.8 });
  const schaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.55, 6), schaftMat);
  schaft.position.y = 0.36;
  const spitze = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.09, 6), holzMat);
  spitze.rotation.x = Math.PI;
  spitze.position.y = 0.045;
  const mine = new THREE.Mesh(new THREE.ConeGeometry(0.013, 0.035, 6), schaftMat);
  mine.rotation.x = Math.PI;
  mine.position.y = 0.012;
  stift.add(schaft, spitze, mine);
  stift.traverse((o) => {
    if (o.isMesh) o.castShadow = !low;
  });
  stift.rotation.z = 0.35;
  group.add(stift);
  const stiftPos = new THREE.Vector3(0, 0.03, TIEFE / 2 + 0.25);
  const stiftSoll = stiftPos.clone();
  let stiftHebt = 0;

  let farben = ["#d93a32", "#2f6fd6", "#2f9e4a", "#8a4fd1", "#ee8a1f", "#18a3a3"];

  // ── Malen ───────────────────────────────────────────────────────────────────────────────
  function leeren() {
    ctx.fillStyle = "#fbf7ec";
    ctx.fillRect(0, 0, PX_B, PX_H);
    // feine Karos wie auf einem Zeichenblock
    ctx.strokeStyle = "rgba(90, 120, 170, 0.08)";
    ctx.lineWidth = 1;
    for (let x = 0; x < PX_B; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, PX_H);
      ctx.stroke();
    }
    for (let y = 0; y < PX_H; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(PX_B, y);
      ctx.stroke();
    }
    tex.needsUpdate = true;
  }
  const px = ([u, v]) => [u * PX_B, (1 - v) * PX_H];
  const tief = new Map();
  // Stiftfarbe kräftiger als die Polsterfarbe
  const stiftFarbe = (hex) => {
    if (!tief.has(hex)) tief.set(hex, `#${new THREE.Color(hex).multiplyScalar(0.78).getHexString()}`);
    return tief.get(hex);
  };
  function segment(farbe, a, b) {
    ctx.strokeStyle = stiftFarbe(farbe);
    ctx.lineWidth = LINIE;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    const [ax, ay] = px(a);
    const [bx, by] = px(b || a);
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx + (b ? 0 : 0.01), by);
    ctx.stroke();
    tex.needsUpdate = true;
  }
  function strichMalen(platz, punkte) {
    const f = farben[platz] || "#333";
    punkte.forEach((p, i) => segment(f, i ? punkte[i - 1] : p, p));
  }

  // ── Zustand ─────────────────────────────────────────────────────────────────────────────
  let gezeigtNr = null;
  let signatur = "";
  let darf = false; // ich bin dran und habe meinen Strich noch nicht beendet
  let meinNr = null; // Strich-Nummer, die ich schon gezeichnet habe
  let aktuellNr = null;
  let meinPlatzJetzt = null;
  const live = new Map(); // nr -> letzter Punkt (fremde Striche, die gerade entstehen)
  let zieht = null; // { punkte, puffer, gesendet }

  function alles(striche) {
    leeren();
    for (const s of striche) strichMalen(s.platz, s.punkte);
  }

  function setze({ partie, sicht, meinPlatz, farben: f }) {
    if (f) farben = f;
    meinPlatzJetzt = meinPlatz;
    if (!partie || !sicht) {
      if (gezeigtNr !== null || !signatur) {
        leeren();
        signatur = "leer";
      }
      gezeigtNr = null;
      darf = false;
      stiftSoll.set(0, 0.03, TIEFE / 2 + 0.25);
      return;
    }
    const sig = `${partie.nr}:${sicht.striche.length}:${sicht.striche.reduce((n, s) => n + s.punkte.length, 0)}`;
    if (partie.nr !== gezeigtNr) {
      gezeigtNr = partie.nr;
      live.clear();
      if (sicht.striche.length === 0) sound.ausleeren?.();
    }
    // Server-Stand neu malen, außer ich male gerade selbst (dann käme mein Strich doppelt)
    if (sig !== signatur && !zieht) {
      signatur = sig;
      live.clear();
      alles(sicht.striche);
    }
    const dran = sicht.phase === "zeichnen" ? sicht.amZug : null;
    aktuellNr = sicht.zugNr;
    darf = dran !== null && dran === meinPlatz && meinNr !== sicht.zugNr;
    if (dran !== meinPlatz) meinNr = null;
    // Stift liegt beim Zeichner (vor seinem Platz am Blattrand)
    if (dran !== null) {
      const d = platzRichtung(dran);
      stiftSoll.set(Math.max(-BREITE / 2, Math.min(BREITE / 2, d.x * 1.5)), 0.03, Math.max(-TIEFE / 2, Math.min(TIEFE / 2, d.z * 1.5)) + d.z * 0.12);
      schaftMat.color.set(farben[dran] || "#d93a32");
      mine.material.color.set(farben[dran] || "#d93a32");
    }
  }

  function liveStueck(d) {
    if (!d || d.art !== "strich" || !Array.isArray(d.punkte) || !d.punkte.length) return;
    const f = farben[d.platz] || "#333";
    let letzter = live.get(d.nr) || null;
    for (const p of d.punkte) {
      segment(f, letzter || p, p);
      letzter = p;
    }
    live.set(d.nr, letzter);
    // Stift folgt der fremden Linie
    stiftSoll.set((letzter[0] - 0.5) * BREITE, 0.03, (0.5 - letzter[1]) * TIEFE);
    stiftHebt = 0;
  }

  // ── Zeichnen per Zeiger ─────────────────────────────────────────────────────────────────
  const tmp = new THREE.Vector3();
  function blattPunkt(ray, klemmen) {
    const hit = ray.intersectObject(blatt, false)[0];
    if (hit?.uv) return [hit.uv.x, hit.uv.y];
    if (!klemmen || !ray.ray.intersectPlane(ebene, tmp)) return null;
    // neben das Blatt gerutscht: auf den Rand klemmen
    const u = Math.max(0, Math.min(1, tmp.x / BREITE + 0.5));
    const v = Math.max(0, Math.min(1, 0.5 - tmp.z / TIEFE));
    return [u, v];
  }
  function abschicken(fertig) {
    if (!zieht) return;
    if (zieht.puffer.length || fertig) sende({ art: "strich", punkte: zieht.puffer.splice(0), fertig });
    zieht.gesendet = performance.now();
  }
  function ziehenStart(ray) {
    if (!darf) return false;
    const p = blattPunkt(ray, false);
    if (!p) return false;
    zieht = { punkte: [p], puffer: [p], gesendet: performance.now() };
    segment(farben[meinPlatzJetzt], p, null);
    stiftSoll.set((p[0] - 0.5) * BREITE, 0.03, (0.5 - p[1]) * TIEFE);
    return true;
  }
  function ziehen(ray) {
    if (!zieht) return;
    const p = blattPunkt(ray, true);
    if (!p) return;
    const l = zieht.punkte[zieht.punkte.length - 1];
    if (Math.hypot(p[0] - l[0], p[1] - l[1]) < 0.004 || zieht.punkte.length >= MAX_PUNKTE) return;
    segment(farben[meinPlatzJetzt], l, p);
    zieht.punkte.push(p);
    zieht.puffer.push(p);
    stiftSoll.set((p[0] - 0.5) * BREITE, 0.03, (0.5 - p[1]) * TIEFE);
    if (performance.now() - zieht.gesendet >= SENDEN_MS) abschicken(false);
  }
  function ziehenEnde() {
    if (!zieht) return;
    abschicken(true);
    zieht = null;
    darf = false;
    meinNr = aktuellNr; // bis der Server weiterschaltet, nicht nochmal ansetzen
    sound.klack?.(1);
  }

  function treffer(ray) {
    if (!darf) return null;
    return ray.intersectObject(blatt, false)[0] ? { art: "blatt" } : null;
  }

  function update(dt, time) {
    const k = 1 - Math.exp(-dt * (zieht ? 30 : 8));
    stiftPos.lerp(stiftSoll, k);
    stiftHebt += ((zieht ? 0 : 1) - stiftHebt) * Math.min(1, dt * 6);
    stift.position.set(stiftPos.x, stiftPos.y + stiftHebt * 0.08 + (darf && !zieht ? Math.abs(Math.sin(time * 4)) * 0.05 : 0), stiftPos.z);
  }

  function anker(key, out) {
    if (key === "brett") return out.set(0, 0.06, 0);
    return null;
  }

  function dispose() {
    group.traverse((o) => {
      if (o.isMesh) o.geometry.dispose();
    });
    [stapelMat, blattMat, schaftMat, holzMat].forEach((m) => m.dispose());
    tex.dispose();
  }

  leeren();
  return {
    group,
    setze,
    treffer,
    hover: () => {},
    klick: () => null,
    ziehenStart,
    ziehen,
    ziehenEnde,
    live: liveStueck,
    update,
    anker,
    restZeit: () => 0,
    dispose,
  };
}
