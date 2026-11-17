// scene/katze.js — die Zimmerkatze: grau getigert, weiße Pfoten und Brust.
//
// Was sie vorhat, sagt der Server (Backend/spieleabend/katze.js: Modus und Ziel, siehe setze()); wie sie dorthin
// kommt, rechnet dieser Browser: Sie läuft (außen um den Tisch herum, an Möbeln entlang), springt auf einen freien
// Spielstuhl oder die Fensterbank, setzt sich, rollt sich ein, miaut beim Betteln und schnurrt beim Streicheln
// (Herzchen steigen auf). Im Dunkeln leuchten ihre Augen.
import * as THREE from "three";
import { BODEN, FENSTER } from "./raum.js";
import { createSchlauch } from "../../Worldflip/scene/schlauch.js";

// Feste Plätze im Zimmer (Backend katze.js ORTE = 8, gleiche Reihenfolge): x, z, Blickrichtung
export const KATZEN_ORTE = [
  { x: -2.3, z: -6.4, r: 0.4 },
  { x: 6.4, z: 1.0, r: -1.4 },
  { x: -6.0, z: 0.4, r: 1.5 },
  { x: -4.4, z: 5.4, r: 2.6 },
  { x: 2.2, z: 6.0, r: 3.0 },
  { x: 5.2, z: 7.1, r: Math.PI }, // auf der Fußmatte
  { x: 4.2, z: -1.8, r: -2.2 },
  { x: -4.6, z: -1.6, r: 1.2 },
];
const BANK = { x: 0.6, z: FENSTER.bankZ, y: FENSTER.bankY, r: Math.PI, anlauf: { x: 0.6, z: -6.95 } };
const TEMPO = 1.9;
const GROESSE = 1.15;
const SITZ_Y = -0.59; // Oberkante des Stuhlkissens (raum.js buildStuhl)

const winkelLerp = (a, b, k) => {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
};

function fellTextur() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 64;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#8f9099";
  ctx.fillRect(0, 0, 128, 64);
  // waagrechte, leicht wellige Streifen: auf der längs gedrehten Kugel (Körper) werden daraus Ringe um den Rücken
  ctx.strokeStyle = "#5c5d66";
  ctx.lineCap = "round";
  for (let i = 0; i < 7; i += 1) {
    const y = 8 + i * 8;
    ctx.lineWidth = 2.5 + (i % 2);
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= 128; x += 16) ctx.lineTo(x, y + Math.sin(x * 0.2 + i) * 1.6);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function herzForm() {
  const s = new THREE.Shape();
  s.moveTo(0, -0.1);
  s.bezierCurveTo(-0.02, -0.06, -0.12, -0.02, -0.12, 0.04);
  s.bezierCurveTo(-0.12, 0.1, -0.04, 0.12, 0, 0.06);
  s.bezierCurveTo(0.04, 0.12, 0.12, 0.1, 0.12, 0.04);
  s.bezierCurveTo(0.12, -0.02, 0.02, -0.06, 0, -0.1);
  return s;
}

/**
 * @param {{ scene: THREE.Scene, camera: THREE.Camera, low?: boolean, sound: object,
 *   weg: (x:number, z:number, zx:number, zz:number) => THREE.Vector2[],
 *   kollision: (x:number, z:number) => [number, number],
 *   stuhlPunkt: (i:number) => ({ x:number, z:number, r:number, anlauf: { x:number, z:number } } | null),
 *   personPunkt: (id:number) => ({ x:number, z:number, r:number } | null),
 *   laut: (p: THREE.Vector3) => number }} opts
 */
export function createKatze({ scene, camera, low = false, sound, weg, kollision, stuhlPunkt, personPunkt, laut }) {
  const geos = [];
  const mats = [];
  const g = (geo) => {
    geos.push(geo);
    return geo;
  };
  const m = (o) => {
    const x = new THREE.MeshStandardMaterial({ roughness: 0.85, ...o });
    mats.push(x);
    return x;
  };
  const fellTex = fellTextur();
  const fell = m({ map: fellTex });
  const fellGlatt = m({ color: "#8f9099" });
  const weiss = m({ color: "#f1ede6" });
  const rosa = m({ color: "#e3a2a6" });
  const nase = m({ color: "#c96f7c", roughness: 0.5 });
  const augeMat = m({ color: "#b8e05a", emissive: "#a6e04c", emissiveIntensity: 0.15, roughness: 0.25 });
  const schwarz = m({ color: "#121014", roughness: 0.4 });
  const teile = [];
  const mesh = (geo, mat, parent, x = 0, y = 0, z = 0) => {
    const me = new THREE.Mesh(g(geo), mat);
    me.position.set(x, y, z);
    me.castShadow = !low;
    parent.add(me);
    teile.push(me);
    return me;
  };

  // ── Modell (schaut nach +z) ──
  const root = new THREE.Group();
  root.scale.setScalar(GROESSE);
  const huefte = new THREE.Group(); // Drehpunkt beim Sitzen: Hinterteil
  huefte.position.set(0, 0.34, -0.26);
  root.add(huefte);
  // Kugel längs gedreht: die Pole liegen vorn und hinten, die Fellstreifen laufen als Ringe um den Rücken
  const koerper = mesh(new THREE.SphereGeometry(0.3, 18, 14).rotateX(Math.PI / 2), fell, huefte, 0, 0.04, 0.3);
  koerper.scale.set(0.78, 0.74, 1.5);
  const brust = mesh(new THREE.SphereGeometry(0.17, 12, 10), weiss, huefte, 0, -0.02, 0.62);
  brust.scale.set(1, 1.15, 0.8);
  const kopf = new THREE.Group();
  kopf.position.set(0, 0.32, 0.74);
  huefte.add(kopf);
  mesh(new THREE.SphereGeometry(0.22, 18, 14), fellGlatt, kopf).scale.set(1.05, 0.92, 0.95);
  mesh(new THREE.SphereGeometry(0.1, 12, 10), weiss, kopf, 0, -0.06, 0.15).scale.set(1.25, 0.8, 0.85);
  mesh(new THREE.SphereGeometry(0.028, 8, 6), nase, kopf, 0, -0.02, 0.235);
  // Ohren: runde, nach vorn flache Kegel (vorher vierkantige Pyramiden); je Ohr eine Gruppe, damit es zucken kann
  const ohren = [];
  for (const s of [-1, 1]) {
    const ohr = new THREE.Group();
    ohr.position.set(s * 0.12, 0.13, 0);
    ohr.rotation.set(-0.1, 0, s * -0.28);
    kopf.add(ohr);
    mesh(new THREE.ConeGeometry(0.088, 0.18, 12), fellGlatt, ohr, 0, 0.08, 0).scale.set(1, 1, 0.55);
    mesh(new THREE.ConeGeometry(0.052, 0.12, 12), rosa, ohr, 0, 0.065, 0.026).scale.set(1, 1, 0.4);
    ohren.push({ gruppe: ohr, seite: s, zuck: 0 });
  }
  // Tigerung auf der Stirn (drei dunkle Streifen) und Schnurrhaare
  const dunkel3 = m({ color: "#5c5d66" });
  for (const x of [-0.055, 0, 0.055]) {
    const streif = mesh(new THREE.SphereGeometry(0.05, 8, 6), dunkel3, kopf, x, 0.158 - Math.abs(x) * 0.25, 0.118 - Math.abs(x) * 0.12);
    streif.scale.set(0.2, 1, 0.3);
    streif.rotation.set(-0.72, 0, x * -3);
    streif.castShadow = false;
  }
  const haarMat = m({ color: "#f4f1ea", roughness: 0.6 });
  for (const s of [-1, 1]) {
    for (let j = 0; j < 3; j += 1) {
      const haar = mesh(new THREE.CylinderGeometry(0.0035, 0.002, 0.22, 4), haarMat, kopf, s * 0.19, -0.075 + j * 0.02, 0.2);
      haar.rotation.set(0, s * -0.5, Math.PI / 2 + s * (j - 1) * 0.2);
      haar.castShadow = false;
    }
  }
  const augen = new THREE.Group();
  augen.position.set(0, 0.03, 0.17);
  kopf.add(augen);
  for (const s of [-1, 1]) {
    const a = mesh(new THREE.SphereGeometry(0.045, 12, 10), augeMat, augen, s * 0.085, 0, 0);
    a.scale.set(1, 1, 0.6);
    const p = mesh(new THREE.SphereGeometry(0.03, 8, 8), schwarz, augen, s * 0.085, 0, 0.022);
    p.scale.set(0.32, 1, 0.4);
  }
  // Beine: Gruppen mit Drehpunkt oben, die Pfote unten weiß
  const bein = (parent, x, y, z) => {
    const b = new THREE.Group();
    b.position.set(x, y, z);
    parent.add(b);
    mesh(new THREE.CapsuleGeometry(0.055, 0.2, 4, 8), fellGlatt, b, 0, -0.12, 0);
    mesh(new THREE.SphereGeometry(0.065, 10, 8), weiss, b, 0, -0.25, 0.02).scale.set(1, 0.7, 1.2);
    return b;
  };
  const vorne = [bein(huefte, -0.13, -0.04, 0.58), bein(huefte, 0.13, -0.04, 0.58)];
  const hinten = [bein(huefte, -0.15, -0.04, 0.05), bein(huefte, 0.15, -0.04, 0.05)];
  // Schwanz: EIN biegsamer Schlauch (Worldflip/scene/schlauch.js), zur Spitze dünner, die Spitze dunkel. Seine
  // Mittellinie wird jedes Bild neu gelegt (im Raum der Katze). Vorher eine Kette aus 24 Kugeln.
  const SCHWANZ_PUNKTE = 14;
  const schwanzLinie = Array.from({ length: SCHWANZ_PUNKTE }, () => new THREE.Vector3());
  const schwanz = createSchlauch({
    punkte: SCHWANZ_PUNKTE,
    rund: low ? 6 : 10,
    radius: (k) => 0.054 - k * 0.026,
    farbe: (k) => (k > 0.76 ? "#5c5d66" : "#8f9099"),
    material: m({ color: "#ffffff", vertexColors: true }),
  });
  schwanz.mesh.castShadow = !low;
  root.add(schwanz.mesh);
  scene.add(root);

  // Herzchen beim Schnurren
  const herzGeo = g(new THREE.ShapeGeometry(herzForm()));
  const herzMat = new THREE.MeshBasicMaterial({ color: "#ff7a95", transparent: true, depthWrite: false, side: THREE.DoubleSide });
  mats.push(herzMat);
  const herzen = [];

  // ── Zustand ──
  const pos = new THREE.Vector3(KATZEN_ORTE[0].x, BODEN, KATZEN_ORTE[0].z);
  let r = 0;
  let plan = { modus: "ort", ort: 0, nr: 0 };
  let oben = null; // null | { art: "stuhl", i } | { art: "bank" }
  let sprung = null;
  let pfad = [];
  let pfadZiel = null;
  let lauf = 0; // 0 steht … 1 läuft
  let sitz = 1;
  let lieg = 0;
  let schritt = 0;
  let schnurrT = 0;
  let miauIn = 2;
  let herzTakt = 0;
  let erstes = true;
  let dunkel = 0;

  /** Neuer Plan vom Server ({ modus, nr, ort?, stuhl?, person?, von? }). */
  function setze(k) {
    if (!k || (k.nr === plan.nr && !erstes)) return;
    const vorher = plan;
    plan = k;
    pfadZiel = null;
    if (erstes) {
      // erstes Bild: gleich dort sein, wo sie hin will (kein Lauf quer durchs Zimmer beim Betreten)
      erstes = false;
      const z = ziel();
      if (z && z.art === "boden") pos.set(z.x, BODEN, z.z);
      else if (z) {
        pos.set(z.x, z.y, z.z);
        oben = z.art === "stuhl" ? { art: "stuhl", i: z.i } : { art: "bank" };
      }
      if (z) r = z.r;
    }
    if (k.modus === "schnurren" && vorher.modus !== "schnurren") {
      schnurrT = 4.5;
      sound.schnurren(4.2, laut(pos));
    }
    if (k.modus === "betteln") miauIn = 1.2;
  }

  /** Wohin gerade: { art: "boden" | "stuhl" | "bank", x, z, y, r, anlauf? } */
  function ziel() {
    const p = plan;
    if (p.modus === "ort") {
      const o = KATZEN_ORTE[p.ort] || KATZEN_ORTE[0];
      return { art: "boden", x: o.x, z: o.z, y: BODEN, r: o.r };
    }
    if (p.modus === "stuhl" || (p.modus === "schnurren" && p.stuhl !== undefined)) {
      const s = stuhlPunkt(p.stuhl);
      if (s) return { art: "stuhl", i: p.stuhl, x: s.x, z: s.z, y: SITZ_Y, r: s.r + Math.PI / 2, anlauf: s.anlauf };
    }
    if (p.modus === "fensterbank") return { art: "bank", ...BANK };
    if (p.modus === "betteln") {
      const q = personPunkt(p.person);
      if (q) {
        const vor = q.abstand ?? 1.35; // vor dem (vielleicht dicken) Bauch
        const x = q.x + Math.sin(q.r) * vor;
        const z = q.z + Math.cos(q.r) * vor;
        return { art: "boden", x, z, y: BODEN, r: Math.atan2(q.x - x, q.z - z) };
      }
    }
    if (p.modus === "schnurren") {
      // bleibt, wo sie ist; schaut zu dem, der streichelt
      const q = p.von !== undefined ? personPunkt(p.von) : null;
      return { art: oben ? oben.art : "boden", i: oben?.i, x: pos.x, z: pos.z, y: pos.y, r: q ? Math.atan2(q.x - pos.x, q.z - pos.z) : r, hier: true };
    }
    return { art: "boden", x: pos.x, z: pos.z, y: BODEN, r, hier: true };
  }

  function springe(nach, obenNach) {
    sprung = { von: pos.clone(), nach: new THREE.Vector3(nach.x, nach.y, nach.z), t: 0, dauer: 0.55, oben: obenNach };
    const dx = nach.x - pos.x;
    const dz = nach.z - pos.z;
    if (Math.hypot(dx, dz) > 0.05) sprung.r = Math.atan2(dx, dz);
  }

  /** Ein Stück auf (tx, tz) zu laufen; true, wenn angekommen. */
  function laufe(tx, tz, dt) {
    if (!pfadZiel || Math.hypot(pfadZiel.x - tx, pfadZiel.y - tz) > 0.4) {
      pfad = weg(pos.x, pos.z, tx, tz);
      pfadZiel = new THREE.Vector2(tx, tz);
    }
    const p = pfad[0];
    if (!p) return true;
    const dx = p.x - pos.x;
    const dz = p.y - pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.1) {
      pfad.shift();
      return pfad.length === 0;
    }
    const tempo = TEMPO * (Math.hypot(tx - pos.x, tz - pos.z) > 4 ? 1.35 : 1);
    const s = Math.min(d, tempo * dt);
    const [nx, nz] = kollision(pos.x + (dx / d) * s, pos.z + (dz / d) * s);
    // festgelaufen: Ziel trotzdem als erreicht werten (lieber dort sitzen als ewig zappeln)
    if (Math.hypot(nx - pos.x, nz - pos.z) < s * 0.2) {
      pfad.shift();
      return pfad.length === 0;
    }
    pos.x = nx;
    pos.z = nz;
    r = winkelLerp(r, Math.atan2(dx, dz), 1 - Math.exp(-dt * 10));
    lauf = Math.min(1, lauf + dt * 5);
    return false;
  }

  const tmp = new THREE.Vector3();
  function update(dt, time) {
    let geht = false;
    if (sprung) {
      sprung.t += dt;
      const q = Math.min(1, sprung.t / sprung.dauer);
      pos.lerpVectors(sprung.von, sprung.nach, q);
      pos.y += Math.sin(q * Math.PI) * 0.7;
      if (sprung.r !== undefined) r = winkelLerp(r, sprung.r, 1 - Math.exp(-dt * 14));
      if (q >= 1) {
        oben = sprung.oben;
        sprung = null;
      }
    } else {
      const z = ziel();
      const passt = oben && z.art === oben.art && (z.art !== "stuhl" || z.i === oben.i);
      if (oben && !passt) {
        // erst herunter (vom Stuhl nach außen, von der Fensterbank ins Zimmer)
        const runter = oben.art === "bank" ? BANK.anlauf : stuhlPunkt(oben.i)?.anlauf || { x: pos.x * 1.3, z: pos.z * 1.3 };
        springe({ x: runter.x, y: BODEN, z: runter.z }, null);
      } else if (!oben && z.art !== "boden") {
        if (laufe(z.anlauf.x, z.anlauf.z, dt)) springe(z, z.art === "stuhl" ? { art: "stuhl", i: z.i } : { art: "bank" });
        else geht = true;
      } else if (!oben && !z.hier) {
        if (Math.hypot(z.x - pos.x, z.z - pos.z) > 0.15) geht = !laufe(z.x, z.z, dt);
        else r = winkelLerp(r, z.r, 1 - Math.exp(-dt * 4));
      } else r = winkelLerp(r, z.r, 1 - Math.exp(-dt * 4));
      if (!oben) pos.y = BODEN;
    }
    if (!geht) lauf = Math.max(0, lauf - dt * 6);

    // Haltung: läuft, sitzt oder liegt eingerollt (auf dem Stuhl)
    const liegt = !sprung && oben?.art === "stuhl";
    lieg += ((liegt ? 1 : 0) - lieg) * Math.min(1, dt * 5);
    sitz += ((!liegt && lauf < 0.3 && !sprung ? 1 : 0) - sitz) * Math.min(1, dt * 6);
    schritt += dt * 14 * lauf;
    const sw = Math.sin(schritt);
    // Hüfte: im Sitzen tiefer und der Körper aufgerichtet, liegend flach am Boden
    huefte.position.y = 0.34 - sitz * 0.16 - lieg * 0.2 + Math.abs(sw) * 0.02 * lauf;
    huefte.rotation.x = -sitz * 0.72;
    kopf.rotation.x = sitz * 0.6 + lieg * 0.25;
    kopf.rotation.y = lieg * 0.7;
    kopf.position.y = 0.32 - lieg * 0.18;
    // eingerollt ist sie rund statt lang; atmet sichtbar
    koerper.scale.set(0.78 + lieg * 0.2, 0.74 * (1 - lieg * 0.2) * (1 + Math.sin(time * 2.2) * 0.02), 1.5 - lieg * 0.32);
    koerper.position.z = 0.3 - lieg * 0.06;
    vorne.forEach((b, i) => {
      b.rotation.x = sw * 0.6 * lauf * (i ? 1 : -1) + sitz * 0.72;
      b.scale.setScalar(Math.max(0.01, 1 - lieg));
      b.scale.y = Math.max(0.01, (1 - lieg) * (1 + sitz * 0.25));
    });
    hinten.forEach((b, i) => {
      b.rotation.x = -sw * 0.6 * lauf * (i ? 1 : -1) - sitz * 0.9;
      b.scale.setScalar(Math.max(0.01, 1 - lieg));
    });
    // schnurren: zittert leise, Augen zu, Herzchen
    schnurrT = Math.max(0, schnurrT - dt);
    const zu = schnurrT > 0 || lieg > 0.6;
    augen.scale.y += ((zu ? 0.12 : (time + 1.3) % 4.1 < 0.12 ? 0.15 : 1) - augen.scale.y) * Math.min(1, dt * 14);
    root.position.copy(pos);
    if (schnurrT > 0) root.position.x += Math.sin(time * 90) * 0.004;
    root.rotation.y = r;
    // Ohren zucken ab und zu (einzeln), beim Schnurren liegen sie leicht an
    for (const o of ohren) {
      if (o.zuck <= 0 && Math.random() < dt * 0.22) o.zuck = 1;
      o.zuck = Math.max(0, o.zuck - dt * 5);
      o.gruppe.rotation.z = o.seite * (-0.28 - Math.sin(o.zuck * Math.PI) * 0.35 - (schnurrT > 0 ? 0.25 : 0));
    }

    // Schwanz: hoch beim Laufen, um die Pfoten gelegt im Sitzen, um den Körper im Liegen
    const wedel = Math.sin(time * 2.4) * 0.12;
    schwanzLinie.forEach((s, i) => {
      const k = i / (SCHWANZ_PUNKTE - 1);
      // sanfte Welle zur Spitze hin
      const hoch = tmp.set(Math.sin(time * 3 - k * 2.2) * 0.14 * k, 0.4 + k * 0.5 - k * k * 0.12, -0.5 - k * 0.32 + k * k * 0.18);
      const ax = hoch.x;
      const ay = hoch.y;
      const az = hoch.z;
      const a = Math.PI - k * 0.8 * Math.PI;
      // im Sitzen schlägt die Schwanzspitze ab und zu (ungeduldig), sonst liegt er ruhig um die Pfoten
      const schlag = Math.max(0, Math.sin(time * 0.9)) ** 6 * Math.sin(time * 9) * 0.1 * k * k;
      const sx = Math.sin(a + wedel * k) * 0.34 + schlag;
      const sz = Math.cos(a) * 0.34 - 0.08;
      const b = Math.PI - k * 1.1 * Math.PI;
      const lx = Math.sin(b) * 0.4;
      const lz = Math.cos(b) * 0.4 + 0.02;
      const wl = Math.max(0, 1 - sitz - lieg);
      s.set(ax * wl + sx * sitz + lx * lieg, ay * wl + 0.05 * sitz + 0.1 * lieg, az * wl + sz * sitz + lz * lieg);
    });
    schwanz.setze(schwanzLinie);

    // Betteln: angekommen vor der Person → ab und zu miauen
    if (plan.modus === "betteln" && !sprung && lauf < 0.2) {
      miauIn -= dt;
      if (miauIn <= 0) {
        miauIn = 3 + Math.random() * 1.8;
        sound.miau(laut(pos));
        kopf.rotation.x -= 0.3;
      }
    }
    // Herzchen steigen beim Schnurren auf
    if (schnurrT > 0) {
      herzTakt -= dt;
      if (herzTakt <= 0) {
        herzTakt = 0.35;
        const h = new THREE.Mesh(herzGeo, herzMat.clone());
        h.position.copy(pos).add(tmp.set((Math.random() - 0.5) * 0.4, 0.9, (Math.random() - 0.5) * 0.4));
        h.scale.setScalar(1.3);
        scene.add(h);
        herzen.push({ h, t: 0 });
      }
    }
    for (let i = herzen.length - 1; i >= 0; i -= 1) {
      const x = herzen[i];
      x.t += dt;
      x.h.position.y += dt * 0.7;
      x.h.position.x += Math.sin(x.t * 5 + i) * dt * 0.2;
      x.h.quaternion.copy(camera.quaternion);
      x.h.material.opacity = Math.max(0, 1 - x.t / 1.3);
      if (x.t > 1.3) {
        scene.remove(x.h);
        x.h.material.dispose();
        herzen.splice(i, 1);
      }
    }
    // Augen leuchten im Dunkeln
    augeMat.emissiveIntensity = 0.15 + dunkel * 2.4;
  }

  function dispose() {
    scene.remove(root);
    for (const x of herzen) {
      scene.remove(x.h);
      x.h.material.dispose();
    }
    geos.forEach((x) => x.dispose());
    schwanz.dispose();
    mats.forEach((x) => x.dispose());
    fellTex.dispose();
  }

  return {
    setze,
    update,
    dispose,
    teile,
    /** Mitte der Katze (Welt), z. B. für das Fadenkreuz-Ziel und das Hinlaufen zum Streicheln. */
    get position() {
      return pos;
    },
    get plan() {
      return plan;
    },
    /** 0 = Licht an … 1 = dunkel (Augen leuchten). */
    setDunkel(w) {
      dunkel = w;
    },
  };
}
