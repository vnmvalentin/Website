// scene/maedn3d.js — Mensch ärgere dich nicht auf dem Tisch: gedrucktes Brett, Spielfiguren („Pöppel“) und ein Würfel.
//
// Das Spielobjekt für zimmerSzene.js (Schnittstelle wie createVierGewinntSpiel in vierGewinnt3d.js). Es übernimmt den
// Server-Stand (Backend/spieleabend/spiele/maedn.js, sicht) und spielt Neues der Reihe nach ab: der Würfel fliegt vom
// Platz des Werfenden auf den Tisch und rollt aus, die Figur hüpft Feld für Feld, eine geschlagene Figur fliegt im
// Bogen heim. Danach wird hart mit dem Server-Stand abgeglichen.
//
// Raster: klassisches 11×11-Brett, Spieler-Raster 0 links, Laufrichtung im Uhrzeigersinn. Die Brettgruppe ist um 90°
// gedreht, damit Platz 0 vorne (+z) sitzt, Platz 1 links, 2 gegenüber, 3 rechts (Stühle in spiele.js: 0, 6, 4, 2).
import * as THREE from "three";

const C = 0.21; // Feldabstand
const HALB = 5.5 * C + 0.12;
const DICKE = 0.035;
const OBEN = DICKE; // Oberkante des Bretts über der Tischplatte
const HOP = 0.17; // s je Feld (Server: HOP_MS)
const FLUG = 0.65; // s Heimflug einer geschlagenen Figur (Server: FLUG_MS)
const WURF = 0.85; // s Würfel (Server: WURF_MS 950)
const W_GROSS = 0.15; // Kantenlänge Würfel

// Raster von Spieler 0; die anderen sind um 90° je Platz gedreht (rot)
const SPUR0 = [
  [0, 4], [1, 4], [2, 4], [3, 4], [4, 4], [4, 3], [4, 2], [4, 1], [4, 0], [5, 0],
  [6, 0], [6, 1], [6, 2], [6, 3], [6, 4], [7, 4], [8, 4], [9, 4], [10, 4], [10, 5],
  [10, 6], [9, 6], [8, 6], [7, 6], [6, 6], [6, 7], [6, 8], [6, 9], [6, 10], [5, 10],
  [4, 10], [4, 9], [4, 8], [4, 7], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6], [0, 5],
];
const HAUS0 = [[0, 0], [1, 0], [0, 1], [1, 1]];
const ZIEL0 = [[1, 5], [2, 5], [3, 5], [4, 5]];
const rot = ([x, y], n) => {
  let p = [x, y];
  for (let i = 0; i < n; i += 1) p = [10 - p[1], p[0]];
  return p;
};

/** Rasterfeld (gx, gy) einer Figur. steps: -1 Haus, 0–39 Runde, 40–43 Ziel. */
export function rasterFeld(platz, steps, figur) {
  if (steps < 0) return rot(HAUS0[figur], platz);
  if (steps >= 40) return rot(ZIEL0[steps - 40], platz);
  return SPUR0[(platz * 10 + steps) % 40];
}
const lokal = ([gx, gy], out = new THREE.Vector3()) => out.set((gx - 5) * C, OBEN, (gy - 5) * C);

// Druckfarbe: unter der hellen Hängelampe wirken die Spielfarben sonst blass
function tiefer(hex, k = 0.8) {
  const c = new THREE.Color(hex);
  return `#${c.multiplyScalar(k).getHexString()}`;
}

function brettTextur(spielFarben) {
  const farben = spielFarben.map((f) => tiefer(f));
  const N = 1024;
  const c = document.createElement("canvas");
  c.width = N;
  c.height = N;
  const g = c.getContext("2d");
  const zelle = N / (11 + (2 * 0.12) / C);
  const rand = (N - 11 * zelle) / 2;
  const px = (v) => rand + (v + 0.5) * zelle;
  g.fillStyle = "#f2e2b6";
  g.fillRect(0, 0, N, N);
  // feine Papierstruktur
  for (let i = 0; i < 2600; i += 1) {
    g.fillStyle = `rgba(120, 90, 40, ${Math.random() * 0.05})`;
    g.fillRect(Math.random() * N, Math.random() * N, 2, 2);
  }
  g.strokeStyle = "#7a5a2e";
  g.lineWidth = 10;
  g.strokeRect(14, 14, N - 28, N - 28);
  // Verbindungslinien der Runde und der Zielgassen
  g.strokeStyle = "#3b2a1a";
  g.lineWidth = 7;
  g.beginPath();
  SPUR0.forEach(([x, y], i) => (i ? g.lineTo(px(x), px(y)) : g.moveTo(px(x), px(y))));
  g.closePath();
  g.stroke();
  for (let p = 0; p < 4; p += 1) {
    g.beginPath();
    const vor = SPUR0[(p * 10 + 39) % 40];
    g.moveTo(px(vor[0]), px(vor[1]));
    ZIEL0.forEach((f) => {
      const [x, y] = rot(f, p);
      g.lineTo(px(x), px(y));
    });
    g.stroke();
  }
  const kreis = (x, y, r, fill, rand2 = "#2b1d12", breite = 5) => {
    g.beginPath();
    g.arc(px(x), px(y), r * zelle, 0, Math.PI * 2);
    g.fillStyle = fill;
    g.fill();
    g.lineWidth = breite;
    g.strokeStyle = rand2;
    g.stroke();
  };
  SPUR0.forEach(([x, y], i) => kreis(x, y, 0.37, i % 10 === 0 ? farben[i / 10] : "#fbf6ea"));
  for (let p = 0; p < 4; p += 1) {
    ZIEL0.forEach((f) => {
      const [x, y] = rot(f, p);
      kreis(x, y, 0.37, farben[p]);
      kreis(x, y, 0.16, "rgba(255,255,255,0.55)", "rgba(0,0,0,0)", 0);
    });
    HAUS0.forEach((f) => {
      const [x, y] = rot(f, p);
      kreis(x, y, 0.4, farben[p]);
    });
    // Pfeil am Startfeld in Laufrichtung
    const [sx, sy] = SPUR0[p * 10];
    const [nx, ny] = SPUR0[p * 10 + 1];
    const dx = nx - sx;
    const dy = ny - sy;
    g.save();
    g.translate(px(sx) + dx * zelle * 0.5, px(sy) + dy * zelle * 0.5);
    g.rotate(Math.atan2(dy, dx));
    g.fillStyle = "#2b1d12";
    g.beginPath();
    g.moveTo(9, 0);
    g.lineTo(-7, -9);
    g.lineTo(-7, 9);
    g.closePath();
    g.fill();
    g.restore();
  }
  // Mitte: kleine Windrose in den vier Farben
  for (let p = 0; p < 4; p += 1) {
    g.save();
    g.translate(px(5), px(5));
    g.rotate((p * Math.PI) / 2 + Math.PI);
    g.fillStyle = farben[p];
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(-zelle * 0.18, -zelle * 0.18);
    g.lineTo(-zelle * 0.42, 0);
    g.lineTo(-zelle * 0.18, zelle * 0.18);
    g.closePath();
    g.fill();
    g.restore();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function wuerfelSeite(n) {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const g = c.getContext("2d");
  g.fillStyle = "#fbf8f1";
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = "#1c1612";
  const P = { 1: [[64, 64]], 2: [[34, 34], [94, 94]], 3: [[30, 30], [64, 64], [98, 98]], 4: [[34, 34], [94, 34], [34, 94], [94, 94]], 5: [[32, 32], [96, 32], [64, 64], [32, 96], [96, 96]], 6: [[34, 28], [94, 28], [34, 64], [94, 64], [34, 100], [94, 100]] };
  for (const [x, y] of P[n]) {
    g.beginPath();
    g.arc(x, y, 11, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// Flächen der BoxGeometry: +x, -x, +y, -y, +z, -z → Augenzahl (Gegenseiten ergeben 7)
const SEITEN = [3, 4, 1, 6, 2, 5];
const OBEN_ZEIGT = {
  1: new THREE.Euler(0, 0, 0),
  6: new THREE.Euler(Math.PI, 0, 0),
  2: new THREE.Euler(-Math.PI / 2, 0, 0),
  5: new THREE.Euler(Math.PI / 2, 0, 0),
  3: new THREE.Euler(0, 0, Math.PI / 2),
  4: new THREE.Euler(0, 0, -Math.PI / 2),
};

function figurGeometrie() {
  const p = [
    [0, 0], [0.066, 0], [0.068, 0.012], [0.058, 0.028], [0.04, 0.05], [0.028, 0.1], [0.023, 0.124], [0.034, 0.134], [0.022, 0.146], [0, 0.146],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  return { koerper: new THREE.LatheGeometry(p, 22), kopf: new THREE.SphereGeometry(0.043, 18, 12) };
}

const easeInOut = (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);

/**
 * @param {{ low?: boolean, sound: object, platzRichtung: (platz: number) => THREE.Vector3 }} ctx
 */
export function createMaednSpiel({ low = false, sound, platzRichtung }) {
  const group = new THREE.Group();
  const brett = new THREE.Group();
  brett.rotation.y = Math.PI / 2;
  group.add(brett);

  let farben = ["#d93a32", "#2f6fd6", "#2f9e4a", "#f2c21b"];
  const holz = new THREE.MeshStandardMaterial({ color: "#5c3a22", roughness: 0.6 });
  let druck = new THREE.MeshStandardMaterial({ map: brettTextur(farben), roughness: 0.75 });
  const platte = new THREE.Mesh(new THREE.BoxGeometry(HALB * 2, DICKE, HALB * 2), [holz, holz, druck, holz, holz, holz]);
  platte.position.y = DICKE / 2;
  platte.receiveShadow = !low;
  platte.castShadow = !low;
  brett.add(platte);

  // ── Figuren ─────────────────────────────────────────────────────────────────────────────
  const geo = figurGeometrie();
  const pickGeo = new THREE.CylinderGeometry(0.095, 0.095, 0.28, 10);
  pickGeo.translate(0, 0.14, 0);
  const pickMat = new THREE.MeshBasicMaterial({ visible: false });
  let figMats = farben.map((hex) => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.32 }));
  const figuren = []; // [platz][figur] -> { g, steps, ... }
  for (let p = 0; p < 4; p += 1) {
    const reihe = [];
    for (let f = 0; f < 4; f += 1) {
      const g = new THREE.Group();
      const k = new THREE.Mesh(geo.koerper, figMats[p]);
      const h = new THREE.Mesh(geo.kopf, figMats[p]);
      h.position.y = 0.183;
      k.castShadow = h.castShadow = !low;
      const pick = new THREE.Mesh(pickGeo, pickMat);
      pick.userData = { platz: p, figur: f };
      g.add(k, h, pick);
      g.userData = { platz: p, figur: f };
      brett.add(g);
      const fig = { g, k, h, pick, steps: -1, bob: 0 };
      lokal(rasterFeld(p, -1, f), g.position);
      reihe.push(fig);
    }
    figuren.push(reihe);
  }

  // Markierungen: dunkler Ring und hüpfender Pfeil über ziehbaren Figuren (auf dem hellen Brett gut zu sehen),
  // Zielring für die Figur unter dem Zeiger (rot, wenn dort jemand rausfliegt)
  const ringGeo = new THREE.TorusGeometry(0.084, 0.014, 8, 32);
  ringGeo.rotateX(Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({ color: "#2b1d12" });
  const pfeilGeo = new THREE.ConeGeometry(0.055, 0.11, 4);
  pfeilGeo.rotateX(Math.PI);
  const pfeilMat = new THREE.MeshBasicMaterial({ color: "#ffc93c" });
  const ringe = [];
  const pfeile = [];
  for (let i = 0; i < 4; i += 1) {
    const r = new THREE.Mesh(ringGeo, ringMat);
    r.visible = false;
    brett.add(r);
    ringe.push(r);
    const p = new THREE.Mesh(pfeilGeo, pfeilMat);
    p.visible = false;
    brett.add(p);
    pfeile.push(p);
  }
  const zielMat = new THREE.MeshBasicMaterial({ color: "#2b1d12", transparent: true, opacity: 0.95 });
  const zielRing = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.02, 8, 36), zielMat);
  zielRing.geometry.rotateX(Math.PI / 2);
  zielRing.visible = false;
  brett.add(zielRing);

  // ── Würfel ──────────────────────────────────────────────────────────────────────────────
  const seitenTex = [1, 2, 3, 4, 5, 6].map(wuerfelSeite);
  const wMats = SEITEN.map((n) => new THREE.MeshStandardMaterial({ map: seitenTex[n - 1], roughness: 0.4 }));
  const wuerfel = new THREE.Mesh(new THREE.BoxGeometry(W_GROSS, W_GROSS, W_GROSS), wMats);
  wuerfel.castShadow = !low;
  const wPick = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), pickMat);
  wuerfel.add(wPick);
  wuerfel.position.set(0, W_GROSS / 2, 1.55);
  group.add(wuerfel);
  const wZiel = new THREE.Quaternion();
  const wAchse = new THREE.Vector3(1, 0, 0);
  let wurfAnim = null;

  function wuerfelRuhe(platz) {
    const d = platzRichtung(platz);
    const seite = new THREE.Vector3(d.z, 0, -d.x);
    return d.clone().multiplyScalar(1.56).addScaledVector(seite, 0.38).setY(W_GROSS / 2);
  }
  function zielQuat(wert, yaw) {
    const q = new THREE.Quaternion().setFromEuler(OBEN_ZEIGT[wert]);
    return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw).multiply(q);
  }

  // ── Ablauf ──────────────────────────────────────────────────────────────────────────────
  let gezeigtNr = null;
  let gesehen = 0; // höchste abgespielte Ereignisnummer
  let stand = null; // letzter Server-Stand (figuren)
  let aktiv = [true, true, true, true];
  const schlange = [];
  let laeuft = null; // aktuelle Animation
  let optionen = [];
  let klickbarWuerfel = false;
  let vorgewaehlt = null;
  let hoverFigur = null;
  let letzteSicht = null;
  let meinPlatzJetzt = null;

  function hart(figs) {
    for (let p = 0; p < 4; p += 1) {
      for (let f = 0; f < 4; f += 1) {
        const fig = figuren[p][f];
        fig.steps = figs ? figs[p][f] : -1;
        lokal(rasterFeld(p, fig.steps, f), fig.g.position);
        fig.g.rotation.set(0, 0, 0);
        fig.g.visible = aktiv[p];
      }
    }
  }

  function setFarben(f) {
    if (f.join() === farben.join()) return;
    farben = f;
    druck.map.dispose();
    druck.map = brettTextur(farben);
    druck.needsUpdate = true;
    figMats.forEach((m, i) => m.color.set(farben[i]));
  }

  function setze({ partie, sicht, meinPlatz, farben: f, erstes }) {
    if (f) setFarben(f);
    meinPlatzJetzt = meinPlatz;
    letzteSicht = sicht;
    if (!partie || !sicht) {
      if (gezeigtNr !== null) hart(null);
      gezeigtNr = null;
      schlange.length = 0;
      laeuft = null;
      aktiv = [true, true, true, true];
      for (const reihe of figuren) for (const fig of reihe) fig.g.visible = true;
      wuerfel.position.copy(wuerfelRuhe(0));
      optionen = [];
      klickbarWuerfel = false;
      markieren();
      return;
    }
    aktiv = sicht.aktiv;
    stand = sicht.figuren;
    const neueste = Math.max(sicht.letzterWurf?.seq || 0, sicht.letzterZug?.seq || 0);
    if (partie.nr !== gezeigtNr || erstes) {
      gezeigtNr = partie.nr;
      schlange.length = 0;
      laeuft = null;
      hart(sicht.figuren);
      gesehen = neueste;
      const w = sicht.letzterWurf;
      wuerfel.position.copy(wuerfelRuhe(w ? w.platz : sicht.amZug ?? 0));
      wuerfel.quaternion.copy(zielQuat(w ? w.wert : 1, 0.3));
    } else {
      const neu = [];
      if (sicht.letzterWurf && sicht.letzterWurf.seq > gesehen) neu.push({ art: "wurf", ...sicht.letzterWurf });
      if (sicht.letzterZug && sicht.letzterZug.seq > gesehen) neu.push({ art: "zug", ...sicht.letzterZug });
      neu.sort((a, b) => a.seq - b.seq).forEach((e) => schlange.push(e));
      gesehen = Math.max(gesehen, neueste);
    }
    optionen = sicht.phase === "ziehen" && meinPlatz !== null && sicht.amZug === meinPlatz && !sicht.fertig ? sicht.optionen : [];
    klickbarWuerfel = sicht.phase === "wuerfeln" && meinPlatz !== null && sicht.amZug === meinPlatz && !sicht.fertig;
    vorgewaehlt = null;
    markieren();
  }

  const beschaeftigt = () => !!laeuft || schlange.length > 0;

  function markieren() {
    const zeigen = !beschaeftigt();
    ringe.forEach((r, i) => {
      const o = optionen[i];
      r.visible = zeigen && !!o;
      pfeile[i].visible = r.visible;
      if (o) {
        const fig = figuren[meinPlatzJetzt][o.figur];
        r.position.set(fig.g.position.x, OBEN + 0.004, fig.g.position.z);
        pfeile[i].position.set(fig.g.position.x, OBEN + 0.34, fig.g.position.z);
      }
    });
    zeigeZiel(zeigen ? vorgewaehlt ?? hoverFigur : null);
  }

  function zeigeZiel(figur) {
    const o = figur === null ? null : optionen.find((x) => x.figur === figur);
    zielRing.visible = !!o;
    if (o) {
      lokal(rasterFeld(meinPlatzJetzt, o.nach, o.figur), zielRing.position).setY(OBEN + 0.006);
      zielMat.color.set(o.schlaegt ? "#e0281c" : "#2b1d12");
    }
  }

  function starte(e) {
    if (e.art === "wurf") {
      const start = platzRichtung(e.platz).multiplyScalar(2.2).setY(0.75);
      const ziel = wuerfelRuhe(e.platz);
      ziel.x += (Math.random() - 0.5) * 0.12;
      ziel.z += (Math.random() - 0.5) * 0.12;
      wAchse.set(Math.random() - 0.5, Math.random() * 0.3, Math.random() - 0.5).normalize();
      wZiel.copy(zielQuat(e.wert, Math.random() * Math.PI * 2));
      wurfAnim = { start, ziel };
      sound.wuerfelRollt();
      return { e, t: 0, dauer: WURF };
    }
    // Zug: Weg Feld für Feld
    const weg = [];
    if (e.von === -1) weg.push(0);
    else for (let s = e.von + 1; s <= e.nach; s += 1) weg.push(s);
    const fig = figuren[e.platz][e.figur];
    const punkte = [fig.g.position.clone(), ...weg.map((s) => lokal(rasterFeld(e.platz, s, e.figur)))];
    return { e, t: 0, dauer: weg.length * HOP + (e.geschlagen ? FLUG : 0), punkte, fig, hops: weg.length, gehuepft: 0 };
  }

  function beende(a) {
    if (a.e.art === "zug") {
      const fig = a.fig;
      fig.steps = a.e.nach;
      lokal(rasterFeld(a.e.platz, a.e.nach, a.e.figur), fig.g.position);
      if (a.e.geschlagen) {
        const g = a.e.geschlagen;
        const opfer = figuren[g.platz][g.figur];
        opfer.steps = -1;
        opfer.g.rotation.set(0, 0, 0);
        lokal(rasterFeld(g.platz, -1, g.figur), opfer.g.position);
      }
      if (a.e.nach >= 40) sound.imZiel();
    } else {
      wuerfel.position.copy(wurfAnim.ziel);
      wuerfel.quaternion.copy(wZiel);
    }
  }

  function schritt(a, dt) {
    a.t += dt;
    if (a.e.art === "wurf") {
      const k = Math.min(1, a.t / a.dauer);
      const { start, ziel } = wurfAnim;
      // Flug bis 60 %, danach zwei kleine Hüpfer
      const flug = Math.min(1, k / 0.6);
      wuerfel.position.lerpVectors(start, ziel, easeInOut(Math.min(1, k / 0.75)));
      let y = ziel.y;
      if (k < 0.6) y = start.y * (1 - flug) + ziel.y * flug + Math.sin(flug * Math.PI) * 0.35;
      else {
        const b = (k - 0.6) / 0.4;
        y = ziel.y + Math.abs(Math.sin(b * Math.PI * 2)) * 0.06 * (1 - b);
      }
      wuerfel.position.y = y;
      const rest = (1 - easeInOut(k)) * Math.PI * 5;
      wuerfel.quaternion.copy(wZiel).multiply(new THREE.Quaternion().setFromAxisAngle(wAchse, rest));
      return k >= 1;
    }
    // Hüpfen
    const hopT = Math.min(a.t / HOP, a.hops);
    const i = Math.min(a.hops - 1, Math.floor(hopT));
    const lauf = a.t < a.hops * HOP;
    if (lauf) {
      const k = hopT - i;
      const von = a.punkte[i];
      const nach = a.punkte[i + 1];
      a.fig.g.position.lerpVectors(von, nach, k);
      const hoehe = a.e.von === -1 ? 0.3 : 0.12;
      a.fig.g.position.y = OBEN + Math.sin(k * Math.PI) * hoehe;
      if (Math.floor(hopT) > a.gehuepft) {
        a.gehuepft = Math.floor(hopT);
        sound.hopp(a.gehuepft);
      }
    } else {
      a.fig.g.position.copy(a.punkte[a.punkte.length - 1]);
      if (a.e.geschlagen) {
        const g = a.e.geschlagen;
        const opfer = figuren[g.platz][g.figur];
        if (!a.flugStart) {
          a.flugStart = opfer.g.position.clone();
          a.flugZiel = lokal(rasterFeld(g.platz, -1, g.figur));
          sound.rauswurf();
        }
        const k = Math.min(1, (a.t - a.hops * HOP) / FLUG);
        opfer.g.position.lerpVectors(a.flugStart, a.flugZiel, easeInOut(k));
        opfer.g.position.y = OBEN + Math.sin(k * Math.PI) * 0.75;
        opfer.g.rotation.x = k * Math.PI * 4;
      }
    }
    return a.t >= a.dauer;
  }

  // ── Zeiger ──────────────────────────────────────────────────────────────────────────────
  function treffer(ray) {
    if (beschaeftigt()) return null;
    if (klickbarWuerfel) {
      const hit = ray.intersectObject(wPick, false)[0] || ray.intersectObject(wuerfel, false)[0];
      if (hit) return { art: "wuerfel" };
    }
    if (optionen.length) {
      const picks = optionen.map((o) => figuren[meinPlatzJetzt][o.figur].pick);
      const hit = ray.intersectObjects(picks, false)[0];
      if (hit) return { art: "figur", figur: hit.object.userData.figur };
    }
    return null;
  }
  function hover(hit) {
    hoverFigur = hit?.art === "figur" ? hit.figur : null;
    if (!beschaeftigt()) zeigeZiel(vorgewaehlt ?? hoverFigur);
  }
  function klick(hit, touch) {
    if (!hit) {
      vorgewaehlt = null;
      zeigeZiel(null);
      return null;
    }
    if (hit.art === "wuerfel") return { art: "wuerfeln" };
    if (touch && vorgewaehlt !== hit.figur) {
      // am Handy: erst zeigen, wohin es geht
      vorgewaehlt = hit.figur;
      zeigeZiel(hit.figur);
      return null;
    }
    vorgewaehlt = null;
    optionen = [];
    markieren();
    return { art: "ziehen", figur: hit.figur };
  }

  function update(dt, time) {
    if (!laeuft && schlange.length) laeuft = starte(schlange.shift());
    if (laeuft && schritt(laeuft, dt)) {
      beende(laeuft);
      laeuft = null;
      if (!schlange.length) {
        // abgleichen: was nicht zur Animation passte, springt an seinen Platz
        if (stand) {
          for (let p = 0; p < 4; p += 1) {
            for (let f = 0; f < 4; f += 1) {
              if (figuren[p][f].steps !== stand[p][f]) {
                figuren[p][f].steps = stand[p][f];
                lokal(rasterFeld(p, stand[p][f], f), figuren[p][f].g.position);
              }
            }
          }
        }
        markieren();
      }
    }
    // ziehbare Figuren wippen
    if (!beschaeftigt() && meinPlatzJetzt !== null) {
      for (const o of optionen) {
        const fig = figuren[meinPlatzJetzt][o.figur];
        fig.g.position.y = OBEN + Math.abs(Math.sin(time * 4 + o.figur)) * 0.035;
      }
    }
    pfeile.forEach((p, i) => {
      if (p.visible) {
        p.position.y = OBEN + 0.38 + Math.abs(Math.sin(time * 4 + i)) * 0.07;
        p.rotation.y = time * 2;
      }
    });
    if (zielRing.visible) zielRing.scale.setScalar(1 + Math.sin(time * 6) * 0.08);
    // der Würfel lädt zum Klicken ein: wackelt kurz, wenn man dran ist
    if (klickbarWuerfel && !beschaeftigt()) wuerfel.position.y = W_GROSS / 2 + Math.max(0, Math.sin(time * 3.2)) ** 8 * 0.06;
  }

  /** Wie lange läuft noch Animation? (für den Sieg-Klang) */
  const restZeit = () => (laeuft ? laeuft.dauer - laeuft.t : 0) + schlange.reduce((s, e) => s + (e.art === "wurf" ? WURF : HOP * 4), 0);

  function anker(key, out) {
    if (key === "brett") return out.set(0, 0.1, 0);
    if (key === "wuerfel") return wuerfel.getWorldPosition(out);
    if (key.startsWith("figur:")) {
      const [, p, f] = key.split(":").map(Number);
      return figuren[p]?.[f] ? figuren[p][f].g.getWorldPosition(out).setY(OBEN + 0.12) : null;
    }
    return null;
  }

  function dispose() {
    group.traverse((o) => {
      if (o.isMesh) o.geometry.dispose();
    });
    [holz, druck, pickMat, ringMat, pfeilMat, zielMat, ...figMats, ...wMats].forEach((m) => m.dispose());
    druck.map?.dispose();
    seitenTex.forEach((t) => t.dispose());
  }

  return { group, setze, treffer, hover, klick, update, anker, restZeit, dispose, get beschaeftigt() { return beschaeftigt(); }, letzte: () => letzteSicht };
}
