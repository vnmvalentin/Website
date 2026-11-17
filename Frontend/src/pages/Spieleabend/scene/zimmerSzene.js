// scene/zimmerSzene.js — die 3D-Szene des Spieleabends: Zimmer, Tisch, Blobs, das Spiel in der Mitte.
//
// Die Szene kennt keine Regeln. Sie bekommt mit setze(view) den Zustand des Zimmers (Server-Sicht, siehe
// Backend/spieleabend/zimmer.js) und stellt sich darauf ein: Wer sitzt auf welchem Spielstuhl, wer steht wo im Zimmer,
// wer ist dran. Was in der Tischmitte steht, bringt jedes Spiel als eigenes Spielobjekt mit (SPIEL_OBJEKTE:
// vierGewinnt3d.js, maedn3d.js); es animiert neue Züge selbst. Beim Spielwechsel schrumpft das alte weg.
//
// Laufen: Wer nicht auf einem Spielstuhl sitzt, steht als Blob im Zimmer. Den eigenen Blob steuert dieser Browser
// (WASD, Pfeile/Q/E drehen; Klick auf den Boden; Hindernisse aus raum.js HINDERNISSE) und meldet die Position (onOrt).
// Ich-Sicht am PC wie in Ego-Spielen: ein Klick ins Bild fängt die Maus (Pointer Lock), Bewegen schaut sich um, Klicken
// wirkt auf das, was im Fadenkreuz liegt (onZiel meldet es, die Seite zeichnet das Fadenkreuz); Esc gibt sie frei,
// Hinsetzen und Umkleide auch. Am Handy schaut man durch Wischen um und tippt auf das Ziel. Ansicht: „ich“ (aus den Augen des Blobs, Standard) oder „folge“ (von
// schräg hinten oben); im Spiegel der Umkleide sieht man sich auch in der Ich-Sicht (eigener Blob auf Ebene 1).
// Spaß: Chips machen dick (bauch, bis zum Fünffachen; einer zu viel und der Blob platzt wie ein Luftballon), ein Klick
// auf einen anderen Blob oder F haut ihm ein Kissen um die Ohren (Federn, Sterne, Rückstoß beim Getroffenen). In der
// Umkleide probiert man Aussehen direkt am eigenen Blob an. Gesten-Rad (Taste G halten, 1–7, oder Knopf; gesten.js),
// Limo am Couchtisch (Schluckauf: Hickser schickt der Server), aufs Sofa plumpsen (eigene Kamera, Mausrad zoomt zum
// Tisch), Lichtschalter neben der Tür (dunkel: Kerze, Mond, Taschenlampen — taschenlampen.js), Fenster auf → Schnee
// holen und werfen (schnee.js), die Zimmerkatze (katze.js) streichelt man per Klick.
// fremde Blobs gleiten zu der Position, die per ortVon() hereinkommt. Klick auf einen freien Stuhl: hinlaufen, dann
// onStuhl(i) — der Blob hüpft hinauf, sobald der Server ihn hingesetzt hat. Aufstehen: hüpft hinter den Stuhl.
//
// Klicks meldet die Szene zurück:
//   onAktion(aktion)   Zug für den Server, z. B. { spalte } oder { art: "wuerfeln" } (nur wenn man dran ist)
//   onStuhl(i)         freier Spielstuhl (nur im Wartestand)
//   onSpielWahl(id)    Spielkarton im Regal angeklickt
//   onOrt({ x, z, r }) eigener Blob ist gelaufen (höchstens ~10× je Sekunde)
//   onGeste(art, extra) eigener Blob macht etwas (Chips, Limo, Gesten; extra: { ziel } beim Kissen/Schneeball,
//                      { punkt } beim Zeigen/Schneeball ins Leere)
//   onUmkleide()       eigener Blob steht vor dem Spiegel: Seite öffnet die Anprobe (anprobieren(skin) / (null))
//   onAnsicht(a)       Taste V hat die Ansicht gewechselt
//   onSperre(an)       Maus ist gefangen (Fadenkreuz zeigen) oder wieder frei
//   onZiel(z)          was im Fadenkreuz liegt: { stuhl } | { karton } | { chips } | { limo } | { blob, schnee? } |
//                      { umkleide } | { sofa } | { licht } | { fenster } | { schneeHolen } | { katze } | { werfen } | null
//   onSofa(i | null)   aufs Sofa (Platz i) oder aufstehen
//   onLicht()          Lichtschalter umgelegt; onFenster() Fenster auf/zu; onSchnee() Schnee geholt; onKatze() gestreichelt
//   onRad({ offen, wahl })  Gesten-Rad auf/zu und welche Geste gerade gewählt ist (Taste G, Maus bei gefangenem Zeiger)
//   onMenue(auf?)      Menü öffnen (true: Esc hat die gefangene Maus gelöst) oder umschalten (ohne Wert: Esc so)
// Im Stehen (Ich-Sicht, gefangene Maus) gibt es keine Schilder im Zimmer: onZiel meldet nur Dinge in Reichweite
// (GREIFWEITE), Klick oder E benutzt sie gleich, ohne hinzulaufen.
// Beschriftungen zeichnet die Seite als HTML darüber; bildschirm(key) liefert die Bildschirmposition eines Ankers:
// "person:<id>", "bot:<platz>", "stuhl:<i>", "regal", "chips", "brett" (und was das Spiel sonst kennt).
//
// Kamera: Sitzt man am Spieltisch, hinter dem eigenen Stuhl (je Spiel eingestellt). Steht man, folgt sie dem Blob
// von schräg oben. Ohne eigene Figur (Zuschauer jenseits von sechs) Überblick über das Zimmer.
import * as THREE from "three";
import { createAvatar } from "../../Worldflip/scene/avatars.js";
import { normalizeSkin } from "../../Worldflip/skins.js";
import { BODEN, FENSTER, HINDERNISSE, LICHTSCHALTER, RAUM, REGAL, SOFA, buildRaum, buildStuhl, sofaPlatz, TISCH_R } from "./raum.js";
import { createGesten, RAD } from "./gesten.js";
import { createKatze } from "./katze.js";
import { createSchnee, BALL_GEO } from "./schnee.js";
import { createTaschenlampen, LAMPEN_GEOS } from "./taschenlampen.js";
import { createVierGewinntSpiel } from "./vierGewinnt3d.js";
import { createMaednSpiel } from "./maedn3d.js";
import { createZeichnenSpiel } from "./zeichnen3d.js";
import { POSITIONEN, SPIELE, sitzende } from "../spiele.js";
import * as sound from "../sound.js";

const GROESSE = 1.25; // Blobs etwas größer als in Worldflip: am Tisch sollen Köpfe über das Brett schauen
const SITZ_R = TISCH_R + 0.56; // Abstand sitzender Figuren von der Mitte
const STUHL_R = SITZ_R + 0.06;
const HINTER_STUHL = STUHL_R + 0.95; // hier steht man nach dem Aufstehen
const FIGUR_Y = -0.55; // Unterkante einer sitzenden Figur (auf dem Kissen)
const BASIS = FIGUR_Y / GROESSE; // dieselbe Unterkante im (vergrößerten) Halter
const STEH_Y = BODEN - FIGUR_Y; // Halterhöhe, damit eine stehende Figur auf dem Boden steht
const KOPF = FIGUR_Y + 2.75 * GROESSE; // über dem Hut: hier hängt das Namensschild (relativ zum Halter)
const MAX_R = 7.0; // Kamera bleibt vor den Wänden (Zimmer halb 8)
const MAX_Y = 4.5; // … und unter der Decke
const LAUF = 2.9; // Schritttempo (Einheiten je Sekunde)
const UMWEG_R = 3.95; // Kreis um den Tisch, auf dem man außen herum läuft
const ORT_MS = 100; // so oft höchstens die eigene Position senden
const AUGE = 2.25; // Augenhöhe eines stehenden Blobs über dem Boden (Ich-Sicht)
const REICHWEITE = 2.1; // so nah muss man für einen Kissenhieb heran
// So weit kann man in der Ich-Sicht nach unten schauen (83°). Vorher 63°: mit dickem Bauch sitzen die Augen so hoch,
// dass die Chips-Schale direkt vor einem steiler liegt — der Blick ging dann über sie hinweg aufs Sofa.
const NEIGUNG_MIN = -1.45;
const MAX_BAUCH = 40; // wie Backend/spieleabend/zimmer.js
const DICKER = 0.1; // je Bauch-Punkt so viel breiter (40 → fünfmal so breit)
const SITZ_BREIT = 1.9; // auf dem Spielstuhl höchstens so breit (sonst läge der Bauch auf dem Brett)
const SOFA_HALTER_Y = SOFA.sitzY - FIGUR_Y - 0.08; // Halterhöhe auf dem Sofa (sinkt ein bisschen ein)
const SPIEGEL_EBENE = 1; // eigener Blob in der Ich-Sicht: nur der Spiegel sieht ihn
const GESTE_MS = 1250; // eigene Gesten nicht schneller als der Server sie annimmt (zimmer.js GESTE_MS)
const STREICHEL_NAH = 1.15; // so weit vor der Katze bleibt man zum Streicheln stehen

const richtung = (pos) => {
  const a = (pos / POSITIONEN) * Math.PI * 2;
  return new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
};
const zurMitte = (pos) => {
  const d = richtung(pos);
  return Math.atan2(-d.x, -d.z);
};
const skinKey = (s) => (s ? `${s.c}.${s.h}.${s.f}` : "-");
const easeInOut = (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
const winkelLerp = (a, b, k) => {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
};
const SPIEL_OBJEKTE = { vierGewinnt: createVierGewinntSpiel, maedn: createMaednSpiel, zeichnen: createZeichnenSpiel };
// Q und E drehen nicht (E benutzt, was im Fadenkreuz liegt); drehen mit Maus oder Pfeiltasten
const TASTEN = { w: "vor", arrowup: "vor", s: "zurueck", arrowdown: "zurueck", a: "links", d: "rechts", arrowleft: "drehLinks", arrowright: "drehRechts" };
// so nah (vom Auge bis zum Ding) muss etwas sein, damit am Fadenkreuz ein Hinweis erscheint und Klick/E es benutzt
const GREIFWEITE = 3.3;
const GREIFWEITE_BLOB = 2.8;

// Kissen für die Kissenschlacht und Federn, die beim Treffer fliegen
const KISSEN_GEO = new THREE.SphereGeometry(0.34, 18, 12).scale(1, 0.62, 0.32);
const FEDER_GEO = new THREE.PlaneGeometry(0.07, 0.16);
const STERN_GEO = new THREE.OctahedronGeometry(0.07, 0);

/** Blob aus Hindernissen und Wänden schieben (gleitet so an Kanten entlang). extra: dicker Bauch braucht mehr Platz. */
function kollision(x, z, extra = 0) {
  for (const k of HINDERNISSE.kreise) {
    let dx = x - k.x;
    let dz = z - k.z;
    let d = Math.hypot(dx, dz);
    const r = k.r + extra;
    if (d < r) {
      if (d < 1e-4) {
        dx = 1;
        dz = 0;
        d = 1;
      }
      x = k.x + (dx / d) * r;
      z = k.z + (dz / d) * r;
    }
  }
  for (const r of HINDERNISSE.rechtecke) {
    if (x > r.x0 - extra && x < r.x1 + extra && z > r.z0 - extra && z < r.z1 + extra) {
      const raus = [
        [r.x0 - extra - x, 0],
        [r.x1 + extra - x, 0],
        [0, r.z0 - extra - z],
        [0, r.z1 + extra - z],
      ].sort((a, b) => Math.abs(a[0] + a[1]) - Math.abs(b[0] + b[1]))[0];
      x += raus[0];
      z += raus[1];
    }
  }
  const g = HINDERNISSE.grenze - extra;
  return [Math.max(-g, Math.min(g, x)), Math.max(-g, Math.min(g, z))];
}

/** Weg von (x, z) nach (zx, zz): führt die Strecke über den Tisch, geht es außen herum (dicker Bauch: weiter außen). */
function weg(x, z, zx, zz, extra = 0) {
  const punkte = [];
  // Abstand der Strecke zur Tischmitte
  const dx = zx - x;
  const dz = zz - z;
  const len2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, -(x * dx + z * dz) / len2));
  const naehe = Math.hypot(x + dx * t, z + dz * t);
  if (naehe < HINDERNISSE.kreise[0].r + 0.1 + extra) {
    const umweg = Math.max(UMWEG_R, HINDERNISSE.kreise[0].r + extra + 0.15);
    const a0 = Math.atan2(x, z);
    const a1 = Math.atan2(zx, zz);
    const d = ((a1 - a0 + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    const schritte = Math.max(1, Math.ceil(Math.abs(d) / 0.35));
    for (let i = 0; i <= schritte; i += 1) {
      const a = a0 + (d * i) / schritte;
      punkte.push(new THREE.Vector2(Math.sin(a) * umweg, Math.cos(a) * umweg));
    }
  }
  punkte.push(new THREE.Vector2(zx, zz));
  return punkte;
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ low?: boolean, onAktion?: Function, onStuhl?: Function, onSpielWahl?: Function, onOrt?: Function, onGeste?: Function, onFrame?: Function }} opts
 */
export function createZimmerSzene(canvas, opts = {}) {
  const low = !!opts.low;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !low, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, low ? 1 : 2));
  renderer.shadowMap.enabled = !low;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#0b0f24");
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 90);
  const camPos = new THREE.Vector3(0, 4.5, 9);
  const camZiel = new THREE.Vector3(0, 0.5, 0);
  const camPosSoll = camPos.clone();
  const camZielSoll = camZiel.clone();
  let camSofort = true;
  let camFolgt = false;

  const raum = buildRaum({ low, spiele: Object.entries(SPIELE).map(([id, s]) => ({ id, name: s.name })) });
  scene.add(raum.root);

  // Spielobjekte entstehen beim ersten Gebrauch; sichtbar ist nur das des gewählten Spiels
  const spielObjekte = {};
  let aktivId = null;
  const platzRichtung = (platz) => richtung((SPIELE[aktivId] || SPIELE.vierGewinnt).stuehle[platz] ?? 0);
  function spielObjekt(id) {
    if (!spielObjekte[id]) {
      const fabrik = SPIEL_OBJEKTE[id] || SPIEL_OBJEKTE.vierGewinnt;
      const o = fabrik({ low, sound, platzRichtung, sende: (a) => opts.onAktion?.(a) });
      o.groesse = 0.001;
      o.group.scale.setScalar(0.001);
      scene.add(o.group);
      spielObjekte[id] = o;
    }
    return spielObjekte[id];
  }
  const aktivesSpiel = () => (aktivId ? spielObjekte[aktivId] : null);

  // ── Zustand ─────────────────────────────────────────────────────────────────────────────
  let view = null;
  let ich = null; // eigene Personen-ID
  let meinPlatz = null; // Spielstuhl (Index), auf dem ich sitze
  let meinePos = null; // Tischposition dieses Stuhls (0–7)
  let klickStuehle = new Set();
  const figuren = new Map(); // key -> Figur
  const stuehle = new Map(); // pos -> { stuhl, polster, wanted }
  let siegerGezeigt = null;
  let disposed = false;
  let ersteSetzung = true;

  // eigener Blob
  const meinOrt = { x: 0, z: 4, r: Math.PI };
  const tasten = new Set();
  let auto = null; // { punkte: Vector2[], danach?: () => void, stau: 0 }
  let ortGesendet = 0;
  let ortOffen = false;
  let ansicht = opts.ansicht === "folge" ? "folge" : "ich";
  let neigung = -0.18; // Ich-Sicht: Blick nach unten (negativ) oder oben
  let anprobe = null; // Aussehen, das man in der Umkleide gerade anprobiert
  const schub = new THREE.Vector2(); // Rückstoß nach einem Kissenhieb (Einheiten je Sekunde)
  let fpHieb = null; // Kissenschwung vor der Kamera (Ich-Sicht)
  let gesperrt = false; // Maus gefangen (Ich-Sicht am PC)
  let zielKey = "";
  let chipsAb = 0; // eigene Chips nicht im Dauerfeuer (Server lässt ohnehin nur alle 1,2 s einen zu)
  let sofaAb = 0; // kurz nach Chips/Limo zählt ein Klick aufs Sofa nicht (die Schale steht direkt davor)
  let fadenBild = 0; // Zähler: das Fadenkreuz-Ziel wird nur jedes dritte Bild neu bestimmt
  let bildZeit = 0.008; // geglättete Dauer eines Bildes in Sekunden (steuert, wie oft die Schatten neu berechnet werden)
  let schattenBild = 0;
  const schattenLichter = []; // alle Lichter, die Schatten werfen (einmal nach dem Aufbau gesammelt, siehe unten)
  let gesteAb = 0; // dasselbe für Gesten aus dem Rad
  let schneeAb = 0;
  let meinSchnee = 0; // Schneebälle in der Hand
  let sofaZoom = 0; // Sofa: 0 ganzes Zimmer … 1 nah am Tisch (Mausrad)
  let rad = null; // Gesten-Rad offen: { wahl, x, y } (x/y: Mausweg bei gefangenem Zeiger)
  let fpRuck = 0; // Kamera ruckt (Hickser, Platzen) in der Ich-Sicht
  let fpRoll = 0;
  let knarzIn = 15; // im Dunkeln knarzt ab und zu eine Diele
  let klickSperre = null; // { art, bis }: letztes Klickziel (schnelle Klicks nur aufs selbe Ziel)
  let direktModus = false; // gerade per Fadenkreuz in Reichweite benutzt: nicht erst hinlaufen
  let pausiert = false; // Menü offen: keine Tasten fürs Zimmer
  let selbstFrei = false; // die Szene gibt die Maus selbst frei (Hinsetzen …) — dann kein Menü
  let menueAb = 0; // Zeitpunkt, an dem Esc die Maus gelöst hat (dieselbe Taste soll das Menü nicht gleich schließen)
  let mausTempo = typeof opts.mausTempo === "number" ? opts.mausTempo : 1;
  const federn = [];
  const kissenMat = new THREE.MeshStandardMaterial({ color: "#f3d7e1", roughness: 0.95 });
  const federMat = new THREE.MeshBasicMaterial({ color: "#ffffff", side: THREE.DoubleSide, transparent: true });
  const sternMat = new THREE.MeshBasicMaterial({ color: "#ffd84a" });
  // Kissen vor der Kamera (Ich-Sicht): hängt an der Kamera, darum kommt sie mit in die Szene
  scene.add(camera);
  const fpKissen = new THREE.Mesh(KISSEN_GEO, kissenMat);
  fpKissen.visible = false;
  camera.add(fpKissen);
  // Spiegel der Umkleide sieht auch Ebene 1 (eigener Blob in der Ich-Sicht)
  raum.umkleide.spiegel?.getReflectionCamera?.(camera).layers.enable(SPIEGEL_EBENE);

  // Gesten, Schneebälle, Taschenlampen, Katze
  const gesten = createGesten({ scene, camera, low });
  const schnee = createSchnee({ scene, low, boden: BODEN, raum: RAUM });
  const lampen = createTaschenlampen({ scene, camera, low });
  for (const wurzel of [scene, camera]) wurzel.traverse((o) => { if (o.isLight && o.castShadow && !schattenLichter.includes(o)) schattenLichter.push(o); });
  // Schneeball vor der Kamera (Ich-Sicht), solange man welche hat
  const fpBall = new THREE.Mesh(BALL_GEO, schnee.ballMat);
  fpBall.scale.setScalar(0.28);
  fpBall.position.set(0.24, -0.24, -0.6);
  fpBall.visible = false;
  camera.add(fpBall);
  // geteilte Formen und Stoffe: beim Entsorgen einer Figur nicht mit wegwerfen
  const geteilt = new Set([BALL_GEO, ...LAMPEN_GEOS, schnee.ballMat]);
  const katze = createKatze({
    scene,
    camera,
    low,
    sound,
    weg,
    kollision: (x, z) => kollision(x, z),
    stuhlPunkt: (i) => {
      const spiel = SPIELE[view?.spiel] || SPIELE.vierGewinnt;
      const p = spiel.stuehle[i];
      if (p === undefined) return null;
      const d = richtung(p);
      return { x: d.x * STUHL_R, z: d.z * STUHL_R, r: zurMitte(p), anlauf: { x: d.x * HINTER_STUHL, z: d.z * HINTER_STUHL } };
    },
    personPunkt: (id) => {
      const f = figuren.get(`p${id}`);
      if (!f || f.weg || f.sitz !== null || f.sofa !== null) return null;
      // abstand: vor dem Bauch sitzen, nicht darin
      return { x: f.holder.position.x, z: f.holder.position.z, r: f.holder.rotation.y, abstand: 1.35 + f.bauchR * GROESSE };
    },
    laut: (p) => lautVon(p),
  });

  /** Lautstärke für etwas, das bei p passiert: nah voll, weit weg leiser. */
  function lautVon(p) {
    if (!p) return 1;
    return Math.max(0.2, Math.min(1, 1.2 - camera.position.distanceTo(p) / 11));
  }

  // ── Stühle ──────────────────────────────────────────────────────────────────────────────
  function stuhlAn(pos, polster) {
    let s = stuehle.get(pos);
    if (!s) {
      const stuhl = buildStuhl(polster, low);
      stuhl.group.position.copy(richtung(pos)).multiplyScalar(STUHL_R);
      // direkt über den Winkel: lookAt + Nullsetzen der übrigen Achsen drehte den Stuhl vorne falsch herum
      stuhl.group.rotation.set(0, zurMitte(pos), 0);
      stuhl.teile.forEach((t) => {
        t.userData.stuhlPos = pos;
      });
      scene.add(stuhl.group);
      s = { stuhl, polster, wanted: true };
      stuehle.set(pos, s);
    }
    s.stuhl.setPolster(polster);
    s.wanted = true;
    return s;
  }

  // ── Figuren ─────────────────────────────────────────────────────────────────────────────
  function figurBauen(key, skin, seed) {
    const av = createAvatar(seed, skin);
    const holder = new THREE.Group();
    holder.scale.setScalar(GROESSE);
    holder.add(av.group);
    av.group.position.y = BASIS;
    scene.add(holder);
    if (key.startsWith("p")) holder.userData.person = Number(key.slice(1));
    // Schneeball in der rechten, Taschenlampe (nur im Dunkeln) in der linken Hand
    const [rechts, links] = av.hands;
    const ball = new THREE.Mesh(BALL_GEO, schnee.ballMat);
    ball.position.set(0, 0.1, 0.08);
    ball.visible = false;
    rechts.add(ball);
    const lampe = lampen.modell();
    lampe.position.set(0, 0.02, 0.12);
    links.add(lampe);
    const farbe = `#${av.hands[0].material.color.getHexString()}`;
    return {
      key, av, holder, skin: skinKey(skin), farbe, sitz: null, sofa: null, ziel: null, hop: null, spawn: 0, weg: false, wegT: 0, wanted: true,
      geht: 0, schritt: 0, geste: null, bauch: 0, dick: 0, kissen: null, sterne: null, rad: null, schnee: 0, ball, lampe,
      neigung: -0.2, hicks: 0, platzt: null, kappe: null, plumps: 0,
      heben: 0, // so weit sitzt der Kopf wegen des Bauchs höher (Avatar-Einheiten)
      bauchR: 0, // so viel breiter ist der Bauch (Radius, Avatar-Einheiten)
    };
  }

  function figurEntsorgen(f) {
    gesten.beende(f);
    scene.remove(f.holder);
    if (f.geste?.chip) scene.remove(f.geste.chip);
    if (f.geste?.glas) scene.remove(f.geste.glas);
    if (f.sterne) scene.remove(f.sterne.gruppe);
    if (f.kissen) f.holder.remove(f.kissen.mesh);
    f.holder.traverse((o) => {
      if (o.geometry === KISSEN_GEO || o.geometry === STERN_GEO || geteilt.has(o.geometry)) return; // gemeinsame Formen bleiben
      if (o.isMesh) {
        o.geometry.dispose();
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
      }
    });
  }

  /** Figur holen oder bauen; neu gebaute stehen/sitzen gleich am Ziel und fallen von oben herein. */
  function figur(key, skin, seed, start) {
    let f = figuren.get(key);
    const sk = skinKey(skin);
    if (f && f.skin !== sk) {
      // neues Aussehen: Figur neu bauen, Platz und Zustand behalten
      const alt = f;
      f = figurBauen(key, skin, seed);
      Object.assign(f, { sitz: alt.sitz, sofa: alt.sofa, ziel: alt.ziel, spawn: 1, bauch: alt.bauch, dick: alt.dick, schnee: alt.schnee });
      f.holder.position.copy(alt.holder.position);
      f.holder.rotation.copy(alt.holder.rotation);
      figurEntsorgen(alt);
      figuren.set(key, f);
    }
    if (!f) {
      f = figurBauen(key, skin, seed);
      figuren.set(key, f);
      f.sitz = start.sitz;
      if (start.sitz !== null) {
        f.holder.position.copy(richtung(start.sitz)).multiplyScalar(SITZ_R);
        f.holder.rotation.set(0, zurMitte(start.sitz), 0);
      } else if (start.sofa !== null && start.sofa !== undefined) {
        // sitzt schon auf dem Sofa (kommt dazu, während jemand dort liegt)
        const s = sofaPlatz(start.sofa);
        f.sofa = start.sofa;
        f.holder.position.set(s.x, SOFA_HALTER_Y, s.z);
        f.holder.rotation.set(0, s.r, 0);
      } else {
        f.holder.position.set(start.ort.x, STEH_Y, start.ort.z);
        f.holder.rotation.set(0, start.ort.r, 0);
      }
      if (!ersteSetzung) sound.plopp();
    }
    f.wanted = true;
    if (f.weg) {
      // kommt zurück, bevor sie ganz verschwunden ist
      f.weg = false;
      f.wegT = 0;
      f.av.group.scale.setScalar(1);
    }
    return f;
  }

  /** Bogensprung (auf den Stuhl, herunter, Stuhl gewechselt). */
  function huepfe(f, nach, ryNach) {
    const von = f.holder.position.clone();
    const dist = von.distanceTo(nach);
    f.hop = { von, nach: nach.clone(), ryVon: f.holder.rotation.y, ryNach, t: 0, dauer: 0.45 + Math.min(0.6, dist * 0.08), hoehe: 0.9 + Math.min(1.2, dist * 0.12) };
  }

  /** Sofaplatz einer Figur ändern (null = steht auf). Hinein plumpst sie, heraus hüpft sie vor das Sofa. */
  function setzeSofa(f, neu, istIch) {
    if (f.sofa === neu) return;
    const alt = f.sofa;
    f.sofa = neu;
    if (neu !== null) {
      const s = sofaPlatz(neu);
      huepfe(f, new THREE.Vector3(s.x, SOFA_HALTER_Y, s.z), s.r);
      f.hop.plumps = true;
      if (istIch) {
        auto = null;
        mausFrei();
        sofaZoom = 0;
      }
    } else if (f.sitz === null) {
      const s = sofaPlatz(alt ?? 0);
      const r = s.r + Math.PI * 0.15;
      huepfe(f, new THREE.Vector3(s.steh.x, STEH_Y, s.steh.z), r);
      f.ziel = { x: s.steh.x, z: s.steh.z, r };
      if (istIch) {
        Object.assign(meinOrt, { x: s.steh.x, z: s.steh.z, r });
        neigung = -0.18;
        ortOffen = true;
      }
    }
    if (istIch) eigeneZeigen();
  }

  /** Sitzplatz einer Figur ändern (null = steht). */
  function setzeSitz(f, neu, istIch) {
    if (f.sitz === neu) return;
    const alt = f.sitz;
    f.sitz = neu;
    if (neu !== null) {
      huepfe(f, richtung(neu).multiplyScalar(SITZ_R), zurMitte(neu));
      if (istIch) auto = null;
    } else {
      // hinter den Stuhl, auf dem sie saß
      const p = alt !== null ? richtung(alt).multiplyScalar(HINTER_STUHL) : f.holder.position.clone();
      const r = alt !== null ? zurMitte(alt) + Math.PI : f.holder.rotation.y;
      huepfe(f, new THREE.Vector3(p.x, STEH_Y, p.z), r);
      f.ziel = { x: p.x, z: p.z, r };
      if (istIch) {
        Object.assign(meinOrt, { x: p.x, z: p.z, r });
        ortOffen = true;
      }
    }
  }

  // ── Zustand übernehmen ──────────────────────────────────────────────────────────────────
  function setze(v, meineId) {
    if (disposed || !v) return;
    const erstes = !view;
    ersteSetzung = erstes;
    view = v;
    const ichNeu = meineId;
    if (ichNeu !== ich) {
      ich = ichNeu;
      const p = v.leute.find((x) => x.id === ich);
      if (p?.ort) Object.assign(meinOrt, p.ort);
      camSofort = true;
    }
    const spiel = SPIELE[v.spiel] || SPIELE.vierGewinnt;
    const sitz = sitzende(v);
    const partie = v.partie;
    const sicht = partie?.sicht || null;
    const amStuhl = new Map();
    sitz.forEach((s, i) => s.person !== null && amStuhl.set(s.person, i));

    // Stühle: nur die Spielstühle, mit Polster in der Spielfarbe
    for (const s of stuehle.values()) s.wanted = false;
    spiel.stuehle.forEach((p, i) => stuhlAn(p, spiel.farben[i].hex));
    for (const [p, s] of stuehle) {
      if (!s.wanted) {
        scene.remove(s.stuhl.group);
        s.stuhl.dispose();
        stuehle.delete(p);
      }
    }

    // Menschen: sitzen auf einem Spielstuhl oder stehen im Zimmer
    for (const f of figuren.values()) f.wanted = false;
    const sofa = v.sofa || [];
    for (const p of v.leute) {
      const stuhl = amStuhl.get(p.id);
      const sitzPos = stuhl !== undefined ? spiel.stuehle[stuhl] : null;
      const sofaPos = sitzPos === null && sofa.includes(p.id) ? sofa.indexOf(p.id) : null;
      const istIch = p.id === ich;
      const ort = istIch ? meinOrt : p.ort || { x: 0, z: 4, r: 0 };
      const skin = istIch && anprobe ? anprobe : p.skin;
      const f = figur(`p${p.id}`, normalizeSkin(skin, p.id), p.id, { sitz: sitzPos, sofa: sofaPos, ort });
      f.bauch = p.bauch || 0;
      f.schnee = p.schnee || 0;
      if (istIch) schneeZahl(f.schnee);
      setzeSofa(f, sofaPos, istIch);
      setzeSitz(f, sitzPos, istIch);
      if (sitzPos === null && sofaPos === null && !istIch && p.ort && !f.hop) f.ziel = { ...p.ort };
      if (typeof p.ort?.n === "number") f.neigung = p.ort.n;
      f.getrennt = !p.connected;
    }
    // Licht, Fenster, Katze (Klänge erst nach dem ersten Stand, sonst klickt es beim Betreten)
    if (typeof v.licht === "boolean" && v.licht !== raum.licht.an) {
      raum.licht.setAn(v.licht);
      lampen.setAktiv(!v.licht);
      if (!erstes) {
        sound.schalter();
        if (!v.licht) sound.dunkel();
      }
    }
    if (typeof v.fenster === "boolean" && v.fenster !== raum.fenster.offen) {
      raum.fenster.setOffen(v.fenster);
      sound.windAn(v.fenster);
      if (!erstes) sound.knarzen(lautVon(tmpV.set(FENSTER.x, 0.5, -7.9)));
    }
    if (v.katze) katze.setze(v.katze);
    // Bots der laufenden (oder gerade beendeten) Partie sitzen auf ihren Stühlen
    const botBesetzung = partie && partie.spiel === v.spiel ? partie.besetzung : [];
    botBesetzung.forEach((b, i) => {
      if (!b.bot) return;
      // im Wartestand nach dem Ende: Bot bleibt sitzen, solange niemand den Stuhl nimmt
      if (v.phase !== "spiel" && v.stuehle[i] !== null) return;
      const f = figur(`b${i}:${b.bot.name}`, normalizeSkin(b.bot.skin, i + 3), i + 3, { sitz: spiel.stuehle[i] });
      setzeSitz(f, spiel.stuehle[i], false);
    });
    for (const f of figuren.values()) {
      if (!f.wanted && !f.weg) {
        f.weg = true;
        f.wegT = 0;
      }
    }

    // eigener Platz (vor dem Spielobjekt: es braucht meinPlatz)
    meinPlatz = ich !== null && amStuhl.has(ich) ? amStuhl.get(ich) : null;
    meinePos = meinPlatz !== null ? spiel.stuehle[meinPlatz] : null;
    // sitzt man, ist die Kamera dort: eigene Figur und Lehne stünden groß im Bild
    eigeneZeigen();
    if (meinPlatz !== null) mausFrei(); // am Tisch braucht man den Zeiger (Spalten, Würfel, Figuren, Knöpfe)
    for (const [p, s] of stuehle) s.stuhl.group.visible = p !== meinePos;
    // Spiele ohne Bots: leere Stühle stehen während der Runde nicht im Bild
    if (v.phase === "spiel" && partie && spiel.ohneBots) {
      for (const [p, s] of stuehle) {
        const b = partie.besetzung[spiel.stuehle.indexOf(p)];
        if (!b || (b.person === null && !b.bot)) s.stuhl.group.visible = false;
      }
    }

    // Spiel in der Tischmitte (eine beendete Partie eines anderen Spiels zeigt es nicht)
    const neuesSpiel = aktivId !== v.spiel;
    aktivId = v.spiel;
    raum.regal.waehle(v.spiel);
    const obj = spielObjekt(v.spiel);
    const eigenePartie = partie && partie.spiel === v.spiel ? partie : null;
    obj.setze({ partie: eigenePartie, sicht: eigenePartie ? sicht : null, meinPlatz, farben: spiel.farben.map((f) => f.hex), erstes: erstes || neuesSpiel });

    // Wer ist dran, wer hat gewonnen
    const laeuft = !!partie?.laeuft;
    const dranPlatz = laeuft ? sicht.amZug : null;
    const figurAmPlatz = (i) => {
      const b = partie?.besetzung[i];
      if (!b) return null;
      return b.person !== null ? figuren.get(`p${b.person}`) : b.bot ? figuren.get(`b${i}:${b.bot.name}`) : null;
    };
    for (const f of figuren.values()) {
      f.av.setActive(false);
      f.av.setCheer(false);
    }
    if (dranPlatz !== null) figurAmPlatz(dranPlatz)?.av.setActive(true);
    // Sieger: ein Platz (sieger) oder mehrere (siegerListe, z. B. alle Künstler beim Zeichen-Hochstapler)
    const siegerListe = sicht?.siegerListe ?? (sicht?.sieger !== null && sicht?.sieger !== undefined ? [sicht.sieger] : []);
    if (eigenePartie && sicht.fertig && siegerListe.length) {
      siegerListe.forEach((i) => figurAmPlatz(i)?.av.setCheer(true));
      const key = `${partie.nr}`;
      if (siegerGezeigt !== key && !erstes) {
        siegerGezeigt = key;
        // Klang erst, wenn der letzte Zug zu sehen war
        const meiner = meinPlatz;
        setTimeout(() => {
          if (disposed) return;
          if (meiner === null || siegerListe.includes(meiner)) sound.sieg();
          else sound.niederlage();
        }, Math.max(250, obj.restZeit() * 1000));
      } else siegerGezeigt = key;
    }

    // Klickbar?
    klickStuehle = new Set();
    if (v.phase === "lobby" && v.du !== null) v.stuehle.forEach((s, i) => s === null && klickStuehle.add(i));

    zielKamera();
    if (erstes) camSofort = true;
  }

  /** Position eines anderen Blobs (kommt per sa:ort, viel öfter als der ganze Zimmerstand). */
  function ortVon(id, ort) {
    if (id === ich) return;
    const f = figuren.get(`p${id}`);
    if (f && f.sitz === null && f.sofa === null) f.ziel = { x: ort.x, z: ort.z, r: ort.r };
    if (f && typeof ort.n === "number") f.neigung = ort.n;
  }

  // ── Gesten ──────────────────────────────────────────────────────────────────────────────
  const tmpV = new THREE.Vector3();
  /** Eigene Figur sichtbar? Sitzt man, nein (Kamera dort). Ich-Sicht: nur im Spiegel (Ebene 1). */
  function eigeneZeigen() {
    const f = meineFigur();
    if (!f) return;
    const sitzt = meinPlatz !== null && !f.hop;
    f.av.group.visible = !sitzt;
    // auf dem Sofa schaut die Kamera von hinten über den eigenen Blob: dann ist er zu sehen
    const ebene = !sitzt && ansicht === "ich" && !anprobe && f.sofa === null ? SPIEGEL_EBENE : 0;
    f.holder.traverse((o) => o.layers.set(ebene));
  }

  const RAD_IDS = new Set(RAD.map((r) => r.id));
  const ichSicht = () => camFolgt && ansicht === "ich" && !anprobe && meinPlatz === null && meineFigur()?.sofa === null;
  // Limo-Glas, das zum Mund fliegt
  const LIMO_GLAS_GEO = new THREE.CylinderGeometry(0.075, 0.06, 0.2, 14, 1, true);
  const LIMO_SAFT_GEO = new THREE.CylinderGeometry(0.066, 0.055, 0.13, 14);
  const limoGlasMat = new THREE.MeshPhysicalMaterial({ color: "#ffffff", transparent: true, opacity: 0.3, roughness: 0.05, side: THREE.DoubleSide });
  const limoSaftMat = new THREE.MeshStandardMaterial({ color: "#f2d64b", roughness: 0.25 });

  /** Was ein Blob tut: eigene Aktionen gehen auch hier durch, die der anderen kommen per sa:geste. */
  function geste(id, art, extra = {}) {
    const f = figuren.get(`p${id}`);
    if (!f || f.weg) return;
    const selbst = id === ich;
    const laut = selbst ? 1 : lautVon(f.holder.position);
    if (art === "hau") {
      hiebZeigen(f, extra.ziel);
      return;
    }
    if (art === "hicks") {
      f.hicks = 1;
      sound.hicks(laut);
      if (selbst) fpRuck = 1;
      return;
    }
    if (art === "schneeHolen") {
      gesten.starte(f, "schneeHolen", { farbe: f.farbe, fp: selbst && ichSicht() });
      sound.schneeKnirschen(laut);
      raum.fenster.schneeNehmen();
      if (typeof extra.schnee === "number") f.schnee = extra.schnee;
      return;
    }
    if (art === "schnee") {
      schneeballZeigen(f, extra);
      return;
    }
    if (RAD_IDS.has(art)) {
      gesten.starte(f, art, { punkt: extra.punkt || null, farbe: f.farbe, fp: selbst && ichSicht() });
      if (art === "klatschen") sound.klatschen(laut);
      else if (art === "jubeln") sound.jubel(laut);
      else if (art === "schmollen") sound.schmollen(laut);
      else if (art === "tanzen") sound.tanzMusik(laut);
      else if (art === "mittelfinger") sound.piep(laut);
      else if (art === "zeigen") sound.ping(extra.punkt ? lautVon(tmpV.set(extra.punkt.x, extra.punkt.y, extra.punkt.z)) : laut);
      else if (art === "winken") f.av.hop();
      return;
    }
    if (art !== "chips" && art !== "limo") return;
    // läuft noch ein Bissen oder Schluck: wegräumen, sonst blieben Chip, Glas oder Krümel in der Luft hängen
    if (f.geste) {
      if (f.geste.chip?.parent) scene.remove(f.geste.chip);
      if (f.geste.glas?.parent) scene.remove(f.geste.glas);
      f.geste.kruemel?.forEach((k) => scene.remove(k));
      f.geste = null;
    }
    // aus der Schale (vom Tisch), wenn der Blob nah genug ist, sonst aus seiner Hand
    const nah = f.holder.position.distanceTo(raum.chips.schale) < 2.6;
    const ausHand = f.holder.localToWorld(tmpV.set(0.45, BASIS + 1.05, 0.45)).clone();
    if (art === "limo") {
      let start = ausHand;
      if (nah) {
        const gl = raum.limo.glaeser;
        start = (gl[0].distanceTo(f.holder.position) < gl[1].distanceTo(f.holder.position) ? gl[0] : gl[1]).clone();
      }
      const glas = new THREE.Group();
      const saft = new THREE.Mesh(LIMO_SAFT_GEO, limoSaftMat);
      saft.position.y = -0.03;
      glas.add(new THREE.Mesh(LIMO_GLAS_GEO, limoGlasMat), saft);
      glas.position.copy(start);
      scene.add(glas);
      f.geste = { art, t: 0, glas, saft, start, kruemel: [] };
      gesten.starte(f, "trinken", { farbe: f.farbe, fp: selbst && ichSicht() });
      sound.schluck(laut);
      return;
    }
    const chip = new THREE.Mesh(raum.chips.geo, raum.chips.mat);
    chip.scale.setScalar(1.4);
    const start = nah ? raum.chips.schale.clone() : ausHand;
    chip.position.copy(start);
    scene.add(chip);
    f.geste = { art, t: 0, chip, start, kruemel: [] };
    sound.knusper(0.45);
    // Chips machen dick; einer zu viel und der Blob platzt (sagt der Server), sonst rülpst er bei vollem Bauch
    f.bauch = typeof extra.bauch === "number" ? extra.bauch : Math.min(MAX_BAUCH, f.bauch + 1);
    if (extra.platzt) platzen(f);
    else if (f.bauch >= MAX_BAUCH - 8 && Math.random() < 0.45) setTimeout(() => !disposed && sound.ruelpser(), 1500);
  }

  /** Geplatzt: die Luft entweicht, der Blob schwirrt wie ein losgelassener Luftballon herum und ist wieder schlank. */
  function platzen(f) {
    f.platzt = { t: 0, dick: Math.max(f.dick, 6) };
    f.bauch = 0;
    sound.ballon(f.key === `p${ich}` ? 1 : lautVon(f.holder.position));
    if (f.key === `p${ich}`) fpRoll = 1;
  }

  /** Antwort des Servers auf eine eigene Geste (Bauch, platzt, Schneebälle). */
  function eigenesErgebnis(art, res) {
    const f = meineFigur();
    if (!f || !res?.ok) return;
    if (art === "chips" && typeof res.bauch === "number") {
      if (res.platzt) platzen(f);
      else f.bauch = res.bauch;
      // der Bauch (und damit die Augenhöhe) steht jetzt fest — nach dem Platzen sitzt man wieder tief: Blick auf die
      // Schale nachführen, solange man gerade am Essen ist
      if (performance.now() < sofaAb && kannLaufen()) {
        const b = raum.chips.schale;
        blickAuf(b.x, b.y, b.z);
      }
    }
    if (typeof res.schnee === "number") {
      f.schnee = res.schnee;
      schneeZahl(res.schnee);
    }
  }
  /** Eigene Schneebälle ändern und der Seite melden (Anzeige oben). */
  function schneeZahl(n) {
    if (n === meinSchnee) return;
    meinSchnee = n;
    opts.onSchneeZahl?.(n);
  }

  // ── Schneebälle ─────────────────────────────────────────────────────────────────────────
  const tmpZ = new THREE.Vector3();
  /** Ein Wurf (eigener oder per sa:geste): Wurfbewegung, Ball fliegt zum Blob (ziel) oder an die Stelle (punkt). */
  function schneeballZeigen(f, extra) {
    if (typeof extra.schnee === "number") f.schnee = extra.schnee;
    const selbst = f.key === `p${ich}`;
    const fp = selbst && ichSicht();
    const von = (fp ? fpBall : f.av.hands[0]).getWorldPosition(new THREE.Vector3());
    gesten.starte(f, "werfen", { farbe: f.farbe, fp });
    sound.wusch();
    if (extra.ziel !== undefined) {
      const opfer = figuren.get(`p${extra.ziel}`);
      if (!opfer) return;
      if (!selbst && f.sitz === null && f.sofa === null) {
        f.holder.rotation.y = Math.atan2(opfer.holder.position.x - f.holder.position.x, opfer.holder.position.z - f.holder.position.z);
      }
      schnee.werfe(von, () => opfer.holder.localToWorld(tmpZ.set(0, BASIS + 1.6 + opfer.heben, 0)), (p) => {
        if (disposed || opfer.weg) return;
        schnee.platzen(p, false);
        sound.platsch(lautVon(p));
        opfer.av.hit();
        kappeAuf(opfer);
        // bin ich getroffen und stehe: kleiner Rückstoß
        if (extra.ziel === ich && kannLaufen()) {
          const dx = meinOrt.x - f.holder.position.x;
          const dz = meinOrt.z - f.holder.position.z;
          const d = Math.hypot(dx, dz) || 1;
          schub.set((dx / d) * 3, (dz / d) * 3);
          fpRuck = 1;
        }
      });
    } else if (extra.punkt) {
      const p = new THREE.Vector3(extra.punkt.x, extra.punkt.y, extra.punkt.z);
      schnee.werfe(von, p, (q) => {
        schnee.platzen(q, true);
        sound.platsch(lautVon(q));
      });
    }
  }
  /** Schneeklecks mitten im Gesicht eines Getroffenen (rutscht nach ein paar Sekunden herunter). */
  function kappeAuf(f) {
    if (f.kappe) f.av.group.remove(f.kappe.mesh);
    const m = new THREE.Mesh(BALL_GEO, schnee.ballMat);
    m.scale.set(1.7, 1.35, 0.7);
    m.position.set((Math.random() - 0.5) * 0.2, 1.8 + f.heben, 0.38);
    m.layers.mask = f.holder.layers.mask;
    f.av.group.add(m);
    f.kappe = { mesh: m, t: 0 };
  }
  /** Eigener Wurf auf das, was getroffen wurde (Blob) oder die Stelle im Fadenkreuz / unter dem Zeiger. */
  function eigenerWurf(t, e) {
    const f = meineFigur();
    if (!f || meinSchnee <= 0 || anprobe) return;
    const jetzt = performance.now();
    if (jetzt < schneeAb) return;
    schneeAb = jetzt + 480;
    let extra;
    if (t?.blob !== undefined) extra = { ziel: t.blob };
    else {
      const p = stellePunkt(e);
      extra = { punkt: { x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100, z: Math.round(p.z * 100) / 100 } };
    }
    if (kannLaufen()) {
      // in Wurfrichtung drehen (Ich-Sicht schaut schon dorthin)
      const zx = extra.ziel !== undefined ? figuren.get(`p${extra.ziel}`)?.holder.position.x : extra.punkt.x;
      const zz = extra.ziel !== undefined ? figuren.get(`p${extra.ziel}`)?.holder.position.z : extra.punkt.z;
      if (!ichSicht() && zx !== undefined) {
        meinOrt.r = Math.atan2(zx - meinOrt.x, zz - meinOrt.z);
        ortOffen = true;
      }
    }
    schneeZahl(meinSchnee - 1);
    schneeballZeigen(f, { ...extra, schnee: meinSchnee });
    opts.onGeste?.("schnee", extra);
  }
  /** Punkt im Zimmer unter dem Zeiger bzw. im Fadenkreuz (e = "mitte" oder ein Zeiger-Ereignis). */
  function stellePunkt(e) {
    if (e === "mitte" || !e) strahlMitte();
    else strahl(e);
    const ziele = [raum.root, ...[...figuren.values()].filter((x) => x.key !== `p${ich}`).map((x) => x.holder)];
    // ausgeblendete Wände (Kamera dahinter), unsichtbare Klickflächen und Schneeflocken zählen nicht
    const sichtbar = (o) => {
      for (let x = o; x; x = x.parent) if (!x.visible) return false;
      return o.material?.visible !== false && !o.isPoints;
    };
    const hit = ray.intersectObjects(ziele, true).find((h) => sichtbar(h.object));
    if (hit) return hit.point.clone();
    return ray.ray.at(8, new THREE.Vector3());
  }

  function gesteSchritt(f, dt) {
    const g = f.geste;
    g.t += dt;
    const mund = f.holder.localToWorld(tmpV.set(0, BASIS + 1.72 + f.heben, 0.38));
    if (g.art === "limo") {
      // hin zum Mund, kippen und trinken, zurück auf den Tisch
      if (g.t < 0.4) {
        const k = g.t / 0.4;
        g.glas.position.lerpVectors(g.start, mund, easeInOut(k));
        g.glas.position.y += Math.sin(k * Math.PI) * 0.3;
      } else if (g.t < 1.2) {
        g.glas.position.copy(mund);
        g.glas.rotation.x = -Math.min(1, (g.t - 0.4) * 4) * 1.2;
        g.glas.rotation.y = f.holder.rotation.y;
        g.saft.scale.y = Math.max(0.05, 1 - (g.t - 0.4) / 0.8);
      } else {
        const k = Math.min(1, (g.t - 1.2) / 0.4);
        g.glas.position.lerpVectors(mund, g.start, easeInOut(k));
        g.glas.rotation.x = -1.2 * (1 - k);
      }
      if (g.t > 1.65) {
        scene.remove(g.glas);
        f.geste = null;
      }
      // schlucken: kurzes Strecken bei jedem Schluck
      return g.t > 0.45 && g.t < 1.15 ? Math.max(0, Math.sin((g.t - 0.45) * 12)) * 0.05 : 0;
    }
    if (g.t < 0.45) {
      const k = g.t / 0.45;
      g.chip.position.lerpVectors(g.start, mund, easeInOut(k));
      g.chip.position.y += Math.sin(k * Math.PI) * 0.6;
      g.chip.rotation.x += dt * 9;
      g.chip.rotation.z += dt * 6;
    } else if (g.chip.parent) {
      scene.remove(g.chip);
      // Krümel fallen aus dem Mund
      for (let i = 0; i < 5; i += 1) {
        const k = new THREE.Mesh(raum.chips.geo, raum.chips.mat);
        k.scale.setScalar(0.35);
        k.position.copy(mund);
        k.userData.v = new THREE.Vector3((Math.random() - 0.5) * 1.2, 0.8 + Math.random() * 0.6, (Math.random() - 0.5) * 1.2);
        scene.add(k);
        g.kruemel.push(k);
      }
    }
    // kauen: Kopf staucht sich ein paar Mal (Rückgabe: Stauchung für die Größe der Figur)
    const kau = g.t > 0.45 && g.t < 1.35 ? Math.sin((g.t - 0.45) * 22) * 0.05 : 0;
    for (const k of g.kruemel) {
      if (k.position.y <= BODEN + 0.02) continue; // liegt schon auf dem Boden
      k.userData.v.y -= 9 * dt;
      k.position.addScaledVector(k.userData.v, dt);
      k.rotation.x += dt * 12;
      if (k.position.y < BODEN + 0.02) k.position.y = BODEN + 0.02;
    }
    if (g.t > 1.4) {
      g.kruemel.forEach((k) => scene.remove(k));
      f.geste = null;
    }
    return kau;
  }

  // ── Kissenschlacht ──────────────────────────────────────────────────────────────────────
  /** Kissen schwingt an der Seite des Blobs nach vorn. */
  function starteKissen(f) {
    if (!f) return;
    if (f.kissen) f.holder.remove(f.kissen.mesh);
    const mesh = new THREE.Mesh(KISSEN_GEO, kissenMat);
    mesh.castShadow = !low;
    if (f.key === `p${ich}` && ansicht === "ich" && !anprobe) mesh.layers.set(SPIEGEL_EBENE);
    f.holder.add(mesh);
    f.kissen = { t: 0, mesh };
  }
  function kissenSchritt(f, dt) {
    const k = f.kissen;
    k.t += dt;
    const q = Math.min(1, k.t / 0.32);
    const a = -1.4 + easeInOut(q) * 2.2; // von der rechten Seite nach vorn (dicker Bauch: weiter außen)
    const rad = 0.72 + f.bauchR * 1.1;
    k.mesh.position.set(Math.sin(a) * rad, BASIS + 1.3 + f.heben * 0.55 + Math.sin(q * Math.PI) * 0.25, Math.cos(a) * rad);
    k.mesh.rotation.set(0.3, a, Math.sin(q * Math.PI) * 0.6);
    if (k.t > 0.5) {
      f.holder.remove(k.mesh);
      f.kissen = null;
    }
  }
  /** Treffer: der Getroffene zuckt zusammen, Federn fliegen, Sterne kreisen über dem Kopf. */
  function treffen(opfer) {
    if (!opfer || opfer.weg) return;
    opfer.av.hit();
    sound.kissen();
    const kopf = opfer.holder.localToWorld(new THREE.Vector3(0, BASIS + 1.8, 0));
    for (let i = 0; i < 12; i += 1) {
      const feder = new THREE.Mesh(FEDER_GEO, federMat.clone());
      feder.position.copy(kopf);
      feder.userData = { v: new THREE.Vector3((Math.random() - 0.5) * 3, 1 + Math.random() * 2, (Math.random() - 0.5) * 3), dreh: (Math.random() - 0.5) * 12, t: 0 };
      scene.add(feder);
      federn.push(feder);
    }
    if (opfer.sterne) scene.remove(opfer.sterne.gruppe);
    const gruppe = new THREE.Group();
    for (let i = 0; i < 5; i += 1) {
      const st = new THREE.Mesh(STERN_GEO, sternMat);
      gruppe.add(st);
    }
    scene.add(gruppe);
    opfer.sterne = { t: 0, gruppe };
  }
  function sterneSchritt(f, dt, time) {
    const st = f.sterne;
    st.t += dt;
    const kopf = f.holder.position;
    st.gruppe.position.set(kopf.x, kopf.y + KOPF - 0.25 + f.heben * GROESSE, kopf.z);
    st.gruppe.children.forEach((m, i) => {
      const a = time * 5 + (i / 5) * Math.PI * 2;
      m.position.set(Math.cos(a) * 0.55, Math.sin(a * 2) * 0.06, Math.sin(a) * 0.55);
      m.rotation.y = a * 2;
    });
    st.gruppe.scale.setScalar(Math.max(0.01, Math.min(1, (1.4 - st.t) * 3)));
    if (st.t > 1.4) {
      scene.remove(st.gruppe);
      f.sterne = null;
    }
  }
  /** Ein Hieb, den jemand anderes ausgeführt hat (sa:geste hau): Schwung zeigen, nach kurzer Zeit Treffer. */
  function hiebZeigen(hauer, zielId) {
    const opfer = figuren.get(`p${zielId}`);
    if (opfer && hauer.sitz === null) {
      hauer.holder.rotation.y = Math.atan2(opfer.holder.position.x - hauer.holder.position.x, opfer.holder.position.z - hauer.holder.position.z);
    }
    starteKissen(hauer);
    sound.wusch();
    setTimeout(() => {
      if (disposed) return;
      treffen(opfer);
      // bin ich getroffen und stehe: Rückstoß weg vom Hauer
      if (zielId === ich && kannLaufen()) {
        const dx = meinOrt.x - hauer.holder.position.x;
        const dz = meinOrt.z - hauer.holder.position.z;
        const d = Math.hypot(dx, dz) || 1;
        schub.set((dx / d) * 6, (dz / d) * 6);
      }
    }, 200);
  }
  /** Selbst hauen: Kissen schwingen, Ziel nach kurzer Zeit getroffen, Server sagt es den anderen. */
  function eigenerHieb() {
    const f = meineFigur();
    starteKissen(f);
    if (ansicht === "ich" && !anprobe) fpHieb = { t: 0 };
    sound.wusch();
  }
  function hauen(zielId) {
    const ziel = figuren.get(`p${zielId}`);
    if (!kannLaufen() || anprobe || !ziel || ziel.weg || zielId === ich) return;
    const t = ziel.holder.position;
    const d = Math.hypot(t.x - meinOrt.x, t.z - meinOrt.z);
    if (d > REICHWEITE && !direktModus) {
      // erst hinlaufen, dann hauen
      const nx = (meinOrt.x - t.x) / d;
      const nz = (meinOrt.z - t.z) / d;
      geheNach(t.x + nx * 1.5, t.z + nz * 1.5, () => hauen(zielId));
      return;
    }
    meinOrt.r = Math.atan2(t.x - meinOrt.x, t.z - meinOrt.z);
    ortOffen = true;
    eigenerHieb();
    setTimeout(() => !disposed && treffen(ziel), 200);
    opts.onGeste?.("hau", { ziel: zielId });
  }
  /** Taste F: wer steht vorn in Reichweite? Sonst ein Schwung ins Leere. */
  function hauNachVorn() {
    if (!kannLaufen() || anprobe) return;
    let best = null;
    let bestD = Infinity;
    for (const [key, f] of figuren) {
      if (!key.startsWith("p") || key === `p${ich}` || f.weg) continue;
      const dx = f.holder.position.x - meinOrt.x;
      const dz = f.holder.position.z - meinOrt.z;
      const d = Math.hypot(dx, dz);
      const winkel = Math.abs(winkelLerp(meinOrt.r, Math.atan2(dx, dz), 1) - meinOrt.r);
      if (d < REICHWEITE + 0.4 && winkel < 0.9 && d < bestD) {
        best = f.holder.userData.person;
        bestD = d;
      }
    }
    if (best !== null) hauen(best);
    else eigenerHieb();
  }

  // ── Umkleide ────────────────────────────────────────────────────────────────────────────
  function zurUmkleide() {
    const u = raum.umkleide;
    if (!kannLaufen()) return;
    geheNach(u.stehPlatz.x, u.stehPlatz.z, () => {
      meinOrt.r = u.blick;
      ortOffen = true;
      opts.onUmkleide?.();
    });
  }
  /** Anprobe: skin = Aussehen, das der eigene Blob sofort trägt (Kamera schaut ihn von vorn an); null = fertig. */
  function anprobieren(skin) {
    if (skin) mausFrei();
    const vorher = !!anprobe;
    anprobe = skin ? normalizeSkin(skin, ich ?? 0) : null;
    // zur Kamera umdrehen, danach wieder in den Spiegel schauen
    if (!!anprobe !== vorher) {
      meinOrt.r = anprobe ? Math.PI / 2 : raum.umkleide.blick;
      ortOffen = true;
    }
    if (view) setze(view, ich);
    eigeneZeigen();
  }

  // ── eigener Blob ────────────────────────────────────────────────────────────────────────
  const meineFigur = () => (ich !== null ? figuren.get(`p${ich}`) : null);
  const kannLaufen = () => {
    const f = meineFigur();
    return !!f && f.sitz === null && f.sofa === null && !f.hop && !f.weg;
  };
  /** Dicker Bauch braucht beim Laufen mehr Platz (Hindernisse rücken ab). */
  // nur ein kleiner Rand: der dicke Bauch darf durch Möbel ragen — sonst käme man weder auf den Teppich (Tisch samt
  // Stühlen + Bauch wäre größer als der Teppich) noch an die Chips, und könnte nie den letzten Chip zum Platzen essen
  const bauchPlatz = () => Math.min(0.3, (meineFigur()?.bauchR || 0) * GROESSE * 0.2);

  /**
   * Blick auf einen Punkt richten (Drehung, in der Ich-Sicht auch hoch/runter): nach dem Hinlaufen liegt das Ziel so
   * wieder im Fadenkreuz, und weitere Klicks treffen dasselbe statt das, was dahinter liegt.
   */
  function blickAuf(x, y, z) {
    meinOrt.r = Math.atan2(x - meinOrt.x, z - meinOrt.z);
    if (ansicht === "ich") {
      const d = Math.hypot(x - meinOrt.x, z - meinOrt.z);
      // Augenhöhe wie in folgeKamera: der dicke Bauch hebt den Kopf. Gerechnet wird mit dem Bauch, auf den der Blob
      // gerade zuwächst (f.bauch) — sonst zielte der Blick nach jedem Chip ein Stück zu hoch, über die Schale hinweg
      // aufs Sofa, und der nächste Klick setzte einen dorthin (Kamera von hinten: „man sieht sich selbst“).
      const heben = 1.54 * 0.03 * (meineFigur()?.bauch || 0) * GROESSE;
      neigung = Math.max(NEIGUNG_MIN, Math.min(0.6, Math.atan2(y - (BODEN + AUGE + heben), Math.max(0.3, d - 0.3))));
    }
    ortOffen = true;
  }

  /** Hinlaufen, dann auf blick ({x,y,z} oder null) schauen und danach() — steht man schon dort, sofort. */
  function hinUnd(x, z, blick, danach) {
    if (!kannLaufen()) return;
    const fertig = () => {
      if (blick) blickAuf(blick.x, blick.y, blick.z);
      ortOffen = true;
      danach();
    };
    // per Fadenkreuz in Reichweite benutzt oder schon dort: gleich, sonst erst hinlaufen
    if (direktModus || Math.hypot(x - meinOrt.x, z - meinOrt.z) < 0.6) fertig();
    else geheNach(x, z, fertig);
  }

  /** Aufs Sofa: den nächsten freien Platz nehmen. */
  function zumSofa() {
    if (!kannLaufen() || !view) return;
    const frei = (view.sofa || []).map((s, i) => (s === null ? i : -1)).filter((i) => i >= 0);
    if (!frei.length) return;
    frei.sort((a, b) => {
      const pa = sofaPlatz(a).steh;
      const pb = sofaPlatz(b).steh;
      return Math.hypot(pa.x - meinOrt.x, pa.z - meinOrt.z) - Math.hypot(pb.x - meinOrt.x, pb.z - meinOrt.z);
    });
    const s = sofaPlatz(frei[0]);
    hinUnd(s.steh.x, s.steh.z, null, () => opts.onSofa?.(frei[0]));
  }
  function zumSchalter() {
    hinUnd(LICHTSCHALTER.steh.x, LICHTSCHALTER.steh.z, LICHTSCHALTER, () => opts.onLicht?.());
  }
  function zumFenster(danach) {
    hinUnd(FENSTER.x, FENSTER.z, { x: FENSTER.x, y: FENSTER.bankY + 0.7, z: -RAUM }, danach);
  }
  function zurLimo() {
    const jetzt = performance.now();
    if (jetzt < chipsAb) return;
    chipsAb = jetzt + 1250;
    const trinken = () => {
      geste(ich, "limo");
      opts.onGeste?.("limo");
      sofaAb = performance.now() + 1500;
    };
    if (kannLaufen()) {
      const s = raum.chips.stehPlatz;
      const b = raum.chips.schale;
      hinUnd(s.x, s.z, { x: b.x, y: b.y, z: b.z }, trinken);
    } else if (ich !== null) trinken();
  }
  /** Zur Katze und streicheln (sitzt man schon in der Nähe, gleich). */
  function streicheln() {
    const f = meineFigur();
    if (!f || anprobe) return;
    const k = katze.position;
    const tun = () => {
      gesten.starte(meineFigur(), "streicheln", { farbe: f.farbe, fp: ichSicht() });
      opts.onKatze?.();
    };
    if (!kannLaufen()) {
      if (f.holder.position.distanceTo(k) < 3) tun();
      return;
    }
    const dx = meinOrt.x - k.x;
    const dz = meinOrt.z - k.z;
    const d = Math.hypot(dx, dz) || 1;
    if (d < STREICHEL_NAH + 0.5 || direktModus) {
      blickAuf(k.x, k.y + 0.4, k.z);
      tun();
      return;
    }
    geheNach(k.x + (dx / d) * STREICHEL_NAH, k.z + (dz / d) * STREICHEL_NAH, () => {
      const kk = katze.position;
      blickAuf(kk.x, kk.y + 0.4, kk.z);
      tun();
    });
  }

  /** Geste aus dem Rad selbst machen (Taste G, 1–7, Knopf). */
  function machGeste(art) {
    const f = meineFigur();
    if (!f || f.weg || anprobe || !RAD_IDS.has(art)) return;
    const jetzt = performance.now();
    if (jetzt < gesteAb) return;
    gesteAb = jetzt + GESTE_MS;
    let extra = {};
    if (art === "zeigen") {
      const p = stellePunkt("mitte");
      extra = { punkt: { x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100, z: Math.round(p.z * 100) / 100 } };
    }
    geste(ich, art, extra);
    opts.onGeste?.(art, extra);
  }

  /** Gesten-Rad: auf (Taste G gedrückt), Auswahl (Maus bei gefangenem Zeiger oder Zeiger über dem Rad), zu. */
  function radAuf() {
    if (rad || !meineFigur() || anprobe) return;
    rad = { wahl: null, x: 0, y: 0 };
    opts.onRad?.({ offen: true, wahl: null });
  }
  function radZu(ausfuehren) {
    if (!rad) return;
    const wahl = rad.wahl;
    rad = null;
    opts.onRad?.({ offen: false, wahl: null });
    if (ausfuehren && wahl !== null) machGeste(RAD[wahl].id);
  }
  function radWahl(i) {
    if (!rad) return;
    rad.wahl = i;
    opts.onRad?.({ offen: true, wahl: i });
  }

  function geheNach(x, z, danach = null) {
    if (!kannLaufen()) return false;
    const extra = bauchPlatz();
    const [zx, zz] = kollision(x, z, extra);
    auto = { punkte: weg(meinOrt.x, meinOrt.z, zx, zz, extra), danach, stau: 0 };
    return true;
  }

  /** Zum freien Spielstuhl i laufen und sich setzen (sitzt man schon, gleich umsetzen). */
  function geheZuStuhl(i) {
    const spiel = SPIELE[view?.spiel] || SPIELE.vierGewinnt;
    const pos = spiel.stuehle[i];
    if (pos === undefined) return;
    // sitzt schon (umsetzen) oder steht per Fadenkreuz in Reichweite: gleich hinüberhüpfen
    if (!kannLaufen() || direktModus) {
      opts.onStuhl?.(i);
      return;
    }
    const p = richtung(pos).multiplyScalar(HINTER_STUHL);
    geheNach(p.x, p.z, () => opts.onStuhl?.(i));
  }

  function zuDenChips() {
    const jetzt = performance.now();
    if (jetzt < chipsAb) return;
    chipsAb = jetzt + 1250;
    if (kannLaufen()) {
      // hin, auf die Schale schauen (bleibt so im Fadenkreuz), zugreifen
      const s = raum.chips.stehPlatz;
      const b = raum.chips.schale;
      hinUnd(s.x, s.z, { x: b.x, y: b.y, z: b.z }, () => {
        geste(ich, "chips");
        opts.onGeste?.("chips");
        // der Bissen macht dicker und hebt den Kopf: Blick gleich für die neue Höhe nachführen
        blickAuf(b.x, b.y, b.z);
        sofaAb = performance.now() + 1500;
      });
    } else if (ich !== null) {
      geste(ich, "chips");
      opts.onGeste?.("chips");
    }
  }

  function steuern(dt, jetzt) {
    const f = meineFigur();
    if (!kannLaufen()) {
      if (f) f.geht = 0;
      return;
    }
    if (anprobe) {
      // vor dem Spiegel stillhalten
      f.geht = 0;
      f.holder.position.set(meinOrt.x, STEH_Y, meinOrt.z);
      f.holder.rotation.set(0, meinOrt.r, 0);
      return;
    }
    const vor = (tasten.has("vor") ? 1 : 0) - (tasten.has("zurueck") ? 1 : 0);
    const seit = (tasten.has("rechts") ? 1 : 0) - (tasten.has("links") ? 1 : 0);
    const dreh = (tasten.has("drehLinks") ? 1 : 0) - (tasten.has("drehRechts") ? 1 : 0);
    let vx = 0;
    let vz = 0;
    let blickBleibt = false;
    if (ansicht === "ich") {
      // aus den Augen: W/S vor und zurück, A/D seitwärts, Pfeile/Q/E drehen
      if (dreh) {
        meinOrt.r += dreh * 2.3 * dt;
        ortOffen = true;
      }
      if (vor || seit) {
        const sn = Math.sin(meinOrt.r);
        const cs = Math.cos(meinOrt.r);
        vx = sn * vor - cs * seit;
        vz = cs * vor + sn * seit;
        blickBleibt = true;
      }
    } else {
      // von oben: Richtungen wie auf dem Bildschirm, Pfeile links/rechts gehen seitwärts
      vx = seit - dreh;
      vz = -vor;
    }
    if (vx || vz) auto = null;
    else if (auto) {
      // Ich-Sicht: beim Hinlaufen bleibt der Blick, wo er ist — sonst träfen weitere Klicks, was gerade ins Bild
      // schwenkt (Sofa statt Chips)
      if (ansicht === "ich") blickBleibt = true;
      const p = auto.punkte[0];
      const dx = p.x - meinOrt.x;
      const dz = p.y - meinOrt.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.12) {
        auto.punkte.shift();
        if (!auto.punkte.length) {
          const danach = auto.danach;
          auto = null;
          if (klickSperre) klickSperre.bis = performance.now() + 700; // nach dem Ankommen noch kurz dasselbe Ziel
          danach?.();
        }
      } else {
        vx = dx / d;
        vz = dz / d;
      }
    }
    const l = Math.hypot(vx, vz);
    // dicke Blobs sind langsamer (ganz dick: nicht mal halb so schnell)
    const tempo = LAUF * Math.max(0.42, 1 - f.dick * 0.016);
    let nx = meinOrt.x;
    let nz = meinOrt.z;
    if (l > 0) {
      nx += (vx / l) * tempo * dt;
      nz += (vz / l) * tempo * dt;
    }
    // Rückstoß nach einem Kissenhieb klingt schnell ab
    const geschubst = schub.lengthSq() > 0.01;
    if (geschubst) {
      nx += schub.x * dt;
      nz += schub.y * dt;
      schub.multiplyScalar(Math.exp(-dt * 6));
    } else schub.set(0, 0);
    if (l > 0 || geschubst) {
      [nx, nz] = kollision(nx, nz, bauchPlatz());
      const bewegt = Math.hypot(nx - meinOrt.x, nz - meinOrt.z);
      // festgelaufen (Hindernis im Weg): Ziel aufgeben
      if (auto && l > 0 && bewegt < tempo * dt * 0.25) {
        auto.stau += dt;
        if (auto.stau > 0.5) auto = null;
      }
      meinOrt.x = nx;
      meinOrt.z = nz;
      if (l > 0 && !blickBleibt) meinOrt.r = winkelLerp(meinOrt.r, Math.atan2(vx, vz), 1 - Math.exp(-dt * 12));
      ortOffen = true;
    }
    f.geht = l > 0 ? 1 : 0;
    f.holder.position.set(meinOrt.x, STEH_Y, meinOrt.z);
    f.holder.rotation.set(0, meinOrt.r, 0);
    if (ortOffen && jetzt - ortGesendet >= ORT_MS) {
      ortOffen = false;
      ortGesendet = jetzt;
      opts.onOrt?.({ x: Math.round(meinOrt.x * 100) / 100, z: Math.round(meinOrt.z * 100) / 100, r: Math.round(meinOrt.r * 100) / 100, n: Math.round(neigung * 100) / 100 });
    }
  }

  function tasteRunter(e) {
    const t = e.target;
    if (t instanceof HTMLElement && (t.closest("input, textarea, select, [role=dialog]") || t.isContentEditable)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const taste = e.key.toLowerCase();
    // Esc: Gesten-Rad zu, sonst Menü auf/zu (hat Esc gerade erst die Maus gelöst, ist das Menü schon offen)
    if (taste === "escape") {
      if (rad) radZu(false);
      else if (!anprobe && performance.now() - menueAb > 400) opts.onMenue?.();
      return;
    }
    if (pausiert) return;
    // E: benutzen, was in Reichweite im Fadenkreuz liegt
    if (taste === "e" && !e.repeat) {
      if (gesperrt) interagieren(false);
      return;
    }
    // F: Schneeball werfen, wenn man welche hat, sonst Kissen
    if (taste === "f" && !e.repeat) {
      if (meinSchnee > 0) {
        const t = treffer("mitte");
        eigenerWurf(t?.blob !== undefined ? t : null, "mitte");
      } else hauNachVorn();
    }
    if (taste === "v" && !e.repeat && !anprobe) {
      setAnsicht(ansicht === "ich" ? "folge" : "ich");
      opts.onAnsicht?.(ansicht);
    }
    // Gesten: G halten öffnet das Rad, 1–7 direkt
    if (taste === "g" && !e.repeat) radAuf();
    if (/^[1-7]$/.test(e.key) && !e.repeat) machGeste(RAD[Number(e.key) - 1].id);
    const r = TASTEN[taste];
    // auf dem Sofa: laufen oder Leertaste heißt aufstehen
    const f = meineFigur();
    if (f?.sofa !== null && f?.sofa !== undefined && !f.hop && (r || taste === " ") && !e.repeat) {
      if (taste === " ") e.preventDefault();
      opts.onSofa?.(null);
      return;
    }
    if (!r || !kannLaufen() || anprobe) return;
    if (e.key.startsWith("Arrow")) e.preventDefault();
    tasten.add(r);
  }
  function tasteHoch(e) {
    if (e.key.toLowerCase() === "g") radZu(true);
    const r = TASTEN[e.key.toLowerCase()];
    if (r) tasten.delete(r);
  }
  const tastenWeg = () => {
    tasten.clear();
    radZu(false);
  };
  window.addEventListener("keydown", tasteRunter);
  window.addEventListener("keyup", tasteHoch);
  window.addEventListener("blur", tastenWeg);

  // ── Kamera ──────────────────────────────────────────────────────────────────────────────
  function zielKamera() {
    const spiel = SPIELE[view?.spiel] || SPIELE.vierGewinnt;
    const aspect = Math.max(0.3, canvas.clientWidth / Math.max(1, canvas.clientHeight));
    camFolgt = false;
    if (meinePos === null) {
      if (meineFigur()) {
        camFolgt = true; // folgt dem eigenen Blob (jedes Bild, siehe frame)
        return;
      }
      // Überblick von schräg oben
      camPosSoll.copy(richtung(1.5)).multiplyScalar(MAX_R).setY(MAX_Y);
      camZielSoll.set(0, 0, 0);
      return;
    }
    const k = spiel.kamera;
    // Abstand so wählen, dass Breite und Höhe des Ausschnitts ins Bild passen
    const vfov = (camera.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
    const naeheBreite = k.breite / 2 / Math.tan(hfov / 2);
    const naeheHoehe = k.hoch / 2 / Math.tan(vfov / 2);
    // Blickwinkel bleibt, nur der Abstand wächst; hochkant (Handy) schaut die Kamera bei flachen Brettern steiler
    // herab (k.steil Grad), weil oben und unten Platz ist
    const hoch0 = k.hoehe - k.ziel;
    const dist = Math.max(Math.hypot(k.abstand, hoch0), naeheBreite, naeheHoehe);
    const winkel = Math.atan2(hoch0, k.abstand) + (aspect < 1 ? (((k.steil || 0) * Math.PI) / 180) * (1 - aspect) : 0);
    // im Zimmer bleiben: nicht durch Decke oder Wand (dann lieber etwas abgeschnitten)
    const y = Math.min(MAX_Y, k.ziel + Math.sin(winkel) * dist);
    const h = Math.min(MAX_R, Math.sqrt(Math.max(0.5, dist * dist - (y - k.ziel) ** 2)));
    camPosSoll.copy(richtung(meinePos)).multiplyScalar(h).setY(y);
    camZielSoll.set(0, k.ziel, 0);
  }

  // Laufen: Kamera schräg von oben hinter dem Blob, auch über Decke und Wand hinaus (die werden dann ausgeblendet,
  // wie beim Blick in ein Puppenhaus)
  function folgeKamera() {
    const ichF = meineFigur();
    if (ichF && ichF.sofa !== null) {
      // Sofa: hoch hinter der Lehne (in der Zimmerecke), über den eigenen Kopf hinweg auf den Tisch; Mausrad zoomt heran
      const hinten = SOFA.r + Math.PI;
      camPosSoll.set(SOFA.x + Math.sin(hinten) * 1.5, BODEN + 5.35, SOFA.z + Math.cos(hinten) * 1.5);
      camZielSoll.set(0, -0.35, 0);
      return;
    }
    if (anprobe) {
      // Umkleide: Blick vom Spiegel auf den eigenen Blob
      camPosSoll.copy(raum.umkleide.kamera);
      // hochkant liegt die Leiste unten: Blob etwas höher ins Bild
      camZielSoll.set(meinOrt.x, BODEN + (canvas.clientWidth < canvas.clientHeight ? 0.1 : 1.45), meinOrt.z);
      return;
    }
    if (ansicht === "ich") {
      // aus den Augen des Blobs, direkt (ohne Nachziehen); beim Gehen wippt der Blick leicht
      const sn = Math.sin(meinOrt.r);
      const cs = Math.cos(meinOrt.r);
      const wipp = meineFigur()?.geht ? Math.sin(performance.now() / 110) * 0.035 : 0;
      // dicker Bauch hebt den Kopf: man schaut von weiter oben
      const heben = (meineFigur()?.heben || 0) * GROESSE;
      camPosSoll.set(meinOrt.x + sn * 0.3, BODEN + AUGE + heben + wipp, meinOrt.z + cs * 0.3);
      const cp = Math.cos(neigung);
      camZielSoll.set(camPosSoll.x + sn * cp, camPosSoll.y + Math.sin(neigung), camPosSoll.z + cs * cp);
      camSofort = true;
      return;
    }
    const hochkant = canvas.clientWidth < canvas.clientHeight;
    camPosSoll.set(meinOrt.x * 0.85, BODEN + (hochkant ? 8.6 : 7.2), meinOrt.z + (hochkant ? 7.6 : 6.8));
    camZielSoll.set(meinOrt.x, BODEN + 1.0, meinOrt.z - 0.6);
  }

  /** Ansicht im Stehen: "ich" (aus den Augen) oder "folge" (von schräg hinten oben). */
  function setAnsicht(a) {
    ansicht = a === "folge" ? "folge" : "ich";
    if (ansicht !== "ich") mausFrei();
    neigung = -0.18;
    eigeneZeigen();
    fovSetzen();
  }

  /** Blickwinkel: Ich-Sicht weiter, sonst wie gehabt (hochkant weiter, weil die Kamera nicht weit zurück kann). */
  function fovSetzen() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    const aufSofa = camFolgt && meineFigur()?.sofa !== null && meineFigur()?.sofa !== undefined;
    const ichSicht = camFolgt && ansicht === "ich" && !anprobe && !aufSofa;
    const fov = aufSofa
      ? (w < h ? 64 : 50) - sofaZoom * 30
      : ichSicht
        ? w < h
          ? 76
          : 66
        : w < h
          ? Math.min(60, 42 + (1 - w / h) * 30)
          : 42;
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  }

  /** Wände und Decke zwischen Kamera und Zimmer ausblenden. */
  function schnitt() {
    const c = camera.position;
    for (const w of raum.waende) w.gruppe.visible = (c[w.achse] - w.wert) * w.innen > 0.05;
    const drunter = c.y < raum.deckeY - 0.05;
    raum.decke.visible = drunter;
    // schaut die Kamera von oben auf den Tisch (Brettspiele, Zeichnen, Laufen), stünde die Hängelampe im Bild;
    // ihr Licht und Schatten bleiben
    raum.lampe.visible = drunter && c.y < 2.85;
  }

  // ── Zeiger ──────────────────────────────────────────────────────────────────────────────
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const bodenEbene = new THREE.Plane(new THREE.Vector3(0, 1, 0), -BODEN);
  const bodenPunkt = new THREE.Vector3();
  let zeigerTouch = false;
  let runter = null;
  let zieht = false; // gerade wird gezeichnet (Zeichen-Hochstapler): Zeiger gehört dem Spiel

  // ── Maus fangen (Ich-Sicht am PC) ──
  function mausFrei() {
    if (document.pointerLockElement === canvas) {
      selbstFrei = true;
      document.exitPointerLock?.();
    }
  }
  function onSperre() {
    const vorher = gesperrt;
    gesperrt = document.pointerLockElement === canvas;
    opts.onSperre?.(gesperrt);
    if (!gesperrt) {
      zielKey = "";
      opts.onZiel?.(null);
      raum.regal.hover(null);
      // mit Esc gelöst (nicht von der Szene selbst, z. B. beim Hinsetzen): Menü auf
      if (vorher && !selbstFrei && !disposed) {
        menueAb = performance.now();
        opts.onMenue?.(true);
      }
      selbstFrei = false;
    }
  }
  document.addEventListener("pointerlockchange", onSperre);
  const darfFangen = (e) => e.pointerType === "mouse" && e.button === 0 && ansicht === "ich" && kannLaufen() && !anprobe && !pausiert;
  /** Maus wieder fangen (Knopf „Weiter“ im Menü; braucht einen Klick als Auslöser). */
  function mausFangen() {
    if (ansicht !== "ich" || !kannLaufen() || anprobe || gesperrt) return;
    try {
      const p = canvas.requestPointerLock?.();
      // der Browser lässt das kurz nach Esc nicht zu: dann fängt eben der nächste Klick ins Bild
      p?.catch?.(() => {});
    } catch {
      /* dito */
    }
  }
  /** Menü offen: Tasten bewegen den Blob nicht. */
  function setPause(an) {
    pausiert = !!an;
    if (pausiert) {
      tasten.clear();
      radZu(false);
    }
  }

  /** Strahl durch die Bildmitte (Fadenkreuz). */
  function strahlMitte() {
    ndc.set(0, 0);
    ray.setFromCamera(ndc, camera);
  }

  function strahl(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
  }

  function treffer(e) {
    if (e === "mitte") strahlMitte();
    else strahl(e);
    const spielTreffer = aktivesSpiel()?.treffer(ray);
    if (spielTreffer) return { spiel: spielTreffer };
    if (klickStuehle.size) {
      const spiel = SPIELE[view.spiel] || SPIELE.vierGewinnt;
      const objekte = [];
      for (const i of klickStuehle) {
        const s = stuehle.get(spiel.stuehle[i]);
        if (s) objekte.push(...s.stuhl.teile);
      }
      const hit = ray.intersectObjects(objekte, false)[0];
      if (hit) return { stuhl: spiel.stuehle.indexOf(hit.object.userData.stuhlPos), d: hit.distance };
    }
    if (!meineFigur()) return null;
    // alles, was getroffen wird, sammeln; das nächste gewinnt (sonst klickte man durch einen Blob die Chips an)
    const kandidaten = [];
    const pruefe = (objekte, ergebnis, rekursiv = false) => {
      const hit = ray.intersectObjects(objekte, rekursiv)[0];
      if (hit) kandidaten.push({ d: hit.distance, t: typeof ergebnis === "function" ? ergebnis(hit) : ergebnis });
    };
    if (view?.phase === "lobby") pruefe(raum.regal.kartons.map((k) => k.mesh), (h) => ({ karton: h.object.userData.spiel }));
    pruefe(raum.chips.teile, { chips: true });
    pruefe(raum.limo.teile, { limo: true });
    if (!anprobe) pruefe(katze.teile, { katze: true });
    if (kannLaufen() && !anprobe) {
      // ein anderer Blob: Kissen (oder Schneeball, wenn man welche hat)
      const andere = [];
      for (const [key, f] of figuren) if (key.startsWith("p") && key !== `p${ich}` && !f.weg) andere.push(f.holder);
      pruefe(andere, (h) => {
        let o = h.object;
        while (o && o.userData.person === undefined) o = o.parent;
        return o ? (meinSchnee > 0 ? { blob: o.userData.person, schnee: true } : { blob: o.userData.person }) : null;
      }, true);
      pruefe(raum.umkleide.teile, { umkleide: true });
      if ((view?.sofa || []).includes(null)) pruefe(raum.sofa.teile, { sofa: true });
      pruefe(raum.licht.teile, { licht: true });
      pruefe(raum.fenster.teile, { fenster: true });
      if (raum.fenster.offen) pruefe(raum.fenster.schneeTeile, { schneeHolen: true });
    }
    const best = kandidaten.filter((k) => k.t).sort((a, b) => a.d - b.d)[0];
    if (best) return { ...best.t, d: best.d };
    if (kannLaufen() && !anprobe && ray.ray.intersectPlane(bodenEbene, bodenPunkt)) return { boden: bodenPunkt.clone() };
    return null;
  }

  function onMove(e) {
    zeigerTouch = e.pointerType === "touch";
    if (zieht) {
      strahl(e);
      aktivesSpiel()?.ziehen?.(ray);
      return;
    }
    // Ich-Sicht mit gefangener Maus: jede Bewegung schaut sich um — außer das Gesten-Rad ist offen, dann wählt sie
    if (gesperrt && rad) {
      rad.x += e.movementX || 0;
      rad.y += e.movementY || 0;
      const l = Math.hypot(rad.x, rad.y);
      if (l > 120) {
        rad.x *= 120 / l;
        rad.y *= 120 / l;
      }
      if (l > 28) {
        // Feld 0 oben, dann im Uhrzeigersinn (wie ui/GestenRad.jsx)
        const a = (Math.atan2(rad.x, -rad.y) + Math.PI * 2) % (Math.PI * 2);
        const i = Math.round(a / ((Math.PI * 2) / RAD.length)) % RAD.length;
        if (i !== rad.wahl) radWahl(i);
      }
      return;
    }
    if (gesperrt) {
      // Mausgeschwindigkeit aus dem Menü
      meinOrt.r -= (e.movementX || 0) * 0.0024 * mausTempo;
      neigung = Math.max(NEIGUNG_MIN, Math.min(0.6, neigung - (e.movementY || 0) * 0.0022 * mausTempo));
      ortOffen = true;
      return;
    }
    // am Handy: wischen = umschauen (danach zählt das Loslassen nicht als Tippen)
    if (runter && zeigerTouch && ansicht === "ich" && kannLaufen() && !anprobe) {
      const dx = e.clientX - runter.lx;
      const dy = e.clientY - runter.ly;
      runter.lx = e.clientX;
      runter.ly = e.clientY;
      if (Math.hypot(e.clientX - runter.x, e.clientY - runter.y) > 6) {
        const empf = zeigerTouch ? 0.009 : 0.0055;
        meinOrt.r -= dx * empf;
        neigung = Math.max(NEIGUNG_MIN, Math.min(0.6, neigung - dy * empf * 0.8));
        ortOffen = true;
        auto = null;
      }
      if (zeigerTouch) return;
    }
    if (zeigerTouch) return;
    const t = treffer(e);
    aktivesSpiel()?.hover(t?.spiel || null);
    raum.regal.hover(t?.karton || null);
    canvas.style.cursor = t?.spiel?.art === "blatt" ? "crosshair" : t && !t.boden ? "pointer" : "";
  }
  function onDown(e) {
    zeigerTouch = e.pointerType === "touch";
    // gefangene Maus: Klick wirkt nur auf das, was am Fadenkreuz steht (gelaufen wird mit WASD). Boden zählt
    // nicht: sonst schickten schnelle Klicks den Blob dorthin, wohin der Blick beim Hinlaufen gerade schwenkt.
    if (gesperrt) {
      if (e.button !== 0) return;
      if (rad) {
        radZu(true);
        return;
      }
      interagieren(true);
      return;
    }
    // Ich-Sicht am PC: erster Klick fängt die Maus
    if (darfFangen(e)) {
      canvas.requestPointerLock?.();
      runter = null;
      return;
    }
    runter = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY };
    // Spiele mit Ziehen (Zeichnen): ein Strich beginnt beim Drücken
    const spiel = aktivesSpiel();
    if (spiel?.ziehenStart) {
      strahl(e);
      if (spiel.ziehenStart(ray)) {
        zieht = true;
        runter = null;
        canvas.setPointerCapture?.(e.pointerId);
      }
    }
  }
  function onUp(e) {
    if (zieht) {
      zieht = false;
      canvas.releasePointerCapture?.(e.pointerId);
      aktivesSpiel()?.ziehenEnde?.();
      return;
    }
    if (!runter || Math.hypot(e.clientX - runter.x, e.clientY - runter.y) > 12) {
      runter = null;
      return;
    }
    runter = null;
    handeln(treffer(e), e.pointerType === "touch");
  }
  /**
   * Was Klick oder E bei gefangener Maus täte: ein Ding in Reichweite im Fadenkreuz, ein Blob als Schneeball-Ziel
   * (auch weiter weg), sonst mit Schnee in der Hand { werfen }; null = nichts (kein Hinweis am Fadenkreuz).
   */
  function fadenZiel(t) {
    if (t && !t.boden && !t.spiel) {
      if (t.blob !== undefined && meinSchnee > 0) return { blob: t.blob, schnee: true };
      // dicker Bauch: das Auge sitzt höher und die Hände weiter außen — die Reichweite wächst mit
      const f = meineFigur();
      const mehr = f ? (f.heben + f.bauchR * 0.3) * GROESSE : 0;
      if (t.d <= (t.blob !== undefined ? GREIFWEITE_BLOB : GREIFWEITE) + mehr) {
        const z = { ...t };
        delete z.d;
        delete z.schnee;
        return z;
      }
    }
    if (meinSchnee > 0) return { werfen: meinSchnee };
    return null;
  }
  /** Klick oder E bei gefangener Maus: das Ding im Fadenkreuz benutzen (ohne Hinlaufen); Schnee in der Hand: werfen. */
  function interagieren(perKlick) {
    if (pausiert) return;
    const z = fadenZiel(treffer("mitte"));
    if (!z) return;
    if (z.werfen) {
      if (perKlick) eigenerWurf(null, "mitte");
      return;
    }
    if (z.schnee) {
      eigenerWurf(z, "mitte");
      return;
    }
    handeln(z, false, true);
  }

  /** Klick oder Tippen auf einen Treffer ausführen; direkt: steht schon in Reichweite (Fadenkreuz), nicht hinlaufen. */
  function handeln(t, touch, direkt = false) {
    direktModus = direkt;
    try {
      handelnJetzt(t, touch);
    } finally {
      direktModus = false;
    }
  }
  function handelnJetzt(t, touch) {
    if (!t || t.spiel) {
      // das Spiel entscheidet: Vorschau (am Handy erst zeigen, zweites Tippen zieht) oder Zug
      const aktion = t || touch ? aktivesSpiel()?.klick(t?.spiel || null, touch) : null;
      if (aktion) opts.onAktion?.(aktion);
      return;
    }
    // schnelle Klicks hintereinander wirken nur auf dasselbe Ziel: sonst setzte man sich beim Chips-Dauerklick aufs
    // Sofa, weil der Blick aus der Nähe über die Schale hinweg aufs Sofa fällt. Boden bleibt frei.
    // Per Fadenkreuz in Reichweite (direkt) gibt es kein Hinlaufen, also nichts, was wandern könnte: dort keine Sperre
    // (sonst ginge „Chips essen, gleich danach Platz nehmen“ nicht)
    const art = t.boden ? "boden" : t.blob !== undefined ? `blob${t.blob}` : Object.keys(t)[0];
    const jetzt = performance.now();
    if (direktModus) klickSperre = null;
    else {
      if (klickSperre && klickSperre.art !== "boden" && art !== klickSperre.art && (auto || jetzt < klickSperre.bis)) return;
      klickSperre = { art, bis: jetzt + 700 };
    }
    if (t.stuhl !== undefined && t.stuhl >= 0) geheZuStuhl(t.stuhl);
    else if (t.karton) opts.onSpielWahl?.(t.karton);
    else if (t.chips) zuDenChips();
    else if (t.limo) zurLimo();
    else if (t.katze) streicheln();
    else if (t.blob !== undefined) {
      if (t.schnee) eigenerWurf(t, null);
      else hauen(t.blob);
    } else if (t.umkleide) zurUmkleide();
    else if (t.sofa) {
      // gleich nach einem Bissen oder Schluck nicht aufs Sofa: die Schale steht direkt davor, ein knapp verfehlter
      // Klick träfe sonst das Sofa (auch mit Fadenkreuz in Reichweite, wo die Klick-Sperre oben nicht gilt)
      if (jetzt >= sofaAb) zumSofa();
    } else if (t.licht) zumSchalter();
    else if (t.fenster) zumFenster(() => opts.onFenster?.());
    else if (t.schneeHolen) zumFenster(() => opts.onSchnee?.());
    else if (t.boden) geheNach(t.boden.x, t.boden.z);
  }
  /** Mausrad auf dem Sofa: näher an den Tisch heran (oder wieder weg). */
  function onMausrad(e) {
    const f = meineFigur();
    if (!f || f.sofa === null) return;
    e.preventDefault();
    sofaZoom = Math.max(0, Math.min(1, sofaZoom - e.deltaY * 0.0012));
  }
  canvas.addEventListener("wheel", onMausrad, { passive: false });
  function onLeave(e) {
    if (zieht || gesperrt) return; // beim Zeichnen hält setPointerCapture den Zeiger, beim Umschauen die Sperre
    // Finger heben löst ebenfalls „leave“ aus — die Vorschau für das zweite Tippen muss stehen bleiben
    if (e.pointerType !== "touch" && !zeigerTouch) aktivesSpiel()?.hover(null);
    raum.regal.hover(null);
    canvas.style.cursor = "";
  }
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointerleave", onLeave);

  // ── Anker für Beschriftungen ────────────────────────────────────────────────────────────
  const tmp = new THREE.Vector3();
  function weltAnker(key, out) {
    if (key === "regal") return out.set(REGAL.x, BODEN + 3.75, REGAL.z + 0.2);
    if (key === "chips") return out.copy(raum.chips.schale).setY(raum.chips.schale.y + 0.5);
    if (key === "umkleide") return out.copy(raum.umkleide.schild);
    if (key === "sofa") return out.set(SOFA.x, BODEN + 2.7, SOFA.z);
    if (key === "licht") return out.set(LICHTSCHALTER.x, LICHTSCHALTER.y + 0.45, LICHTSCHALTER.z - 0.1);
    if (key === "fenster") return out.set(FENSTER.x, FENSTER.bankY + 2.75, -RAUM + 0.1);
    if (key === "katze") return out.copy(katze.position).setY(katze.position.y + 1.25);
    if (key.startsWith("karton:")) return raum.regal.kartons.find((k) => k.id === key.slice(7))?.mesh.getWorldPosition(out) || null;
    const [art, id] = key.split(":");
    if (art !== "person" && art !== "bot" && art !== "stuhl") return aktivesSpiel()?.anker(key, out) || null;
    if (art === "person" || art === "bot") {
      let f = null;
      if (art === "person") f = figuren.get(`p${id}`);
      else for (const [k, x] of figuren) if (k.startsWith(`b${id}:`) && !x.weg) f = x;
      if (!f || f.weg) return null;
      return out.copy(f.holder.position).setY(f.holder.position.y + KOPF + f.heben * GROESSE);
    }
    const spiel = SPIELE[view?.spiel] || SPIELE.vierGewinnt;
    const p = spiel.stuehle[Number(id)];
    if (p === undefined) return null;
    // sitzt dort noch jemand (Bot der letzten Partie): Schild über den Kopf, sonst über den leeren Stuhl
    for (const f of figuren.values()) if (f.sitz === p && !f.weg && !f.hop) return out.copy(f.holder.position).setY(KOPF);
    return out.copy(richtung(p)).multiplyScalar(STUHL_R).setY(1.9);
  }

  /** Bildschirmposition (CSS-Pixel relativ zum Canvas) eines Ankers, oder null (hinter der Kamera / unbekannt). */
  function bildschirm(key) {
    if (!weltAnker(key, tmp)) return null;
    tmp.project(camera);
    if (tmp.z > 1 || tmp.z < -1) return null;
    return { x: ((tmp.x + 1) / 2) * canvas.clientWidth, y: ((1 - tmp.y) / 2) * canvas.clientHeight };
  }

  // ── Schleife ────────────────────────────────────────────────────────────────────────────
  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    fovSetzen();
    if (view) zielKamera();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  const clock = new THREE.Clock();
  let raf = 0;
  function frame() {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, clock.getDelta());
    const time = clock.elapsedTime;

    steuern(dt, performance.now());
    if (camFolgt) folgeKamera();
    fovSetzen();
    if (gesperrt && !kannLaufen()) mausFrei();
    // Kamera gleitet; leichtes Atmen, damit das Zimmer lebt
    const k = camSofort ? 1 : 1 - Math.exp(-dt * (camFolgt ? 4.5 : 2.6));
    camSofort = false;
    camPos.lerp(camPosSoll, k);
    camZiel.lerp(camZielSoll, k);
    camera.position.copy(camPos);
    if (!(camFolgt && ansicht === "ich" && !anprobe)) {
      camera.position.y += Math.sin(time * 0.6) * 0.02;
      camera.position.x += Math.sin(time * 0.37) * 0.025;
    }
    camera.lookAt(camZiel);
    // Ich-Sicht: eigene Geste (Tanzen wippt, Jubeln hüpft), Hickser und Treffer rucken, Platzen wirbelt
    const fpV = gesten.fpSchritt(dt);
    if (ichSicht()) {
      if (fpV) {
        camera.position.y += fpV.y;
        camera.rotateZ(fpV.rz);
      }
      if (fpRuck > 0) camera.position.y += Math.sin(fpRuck * Math.PI) * 0.13;
      if (fpRoll > 0) {
        camera.rotateZ(Math.sin(time * 23) * 0.4 * fpRoll);
        camera.position.y += Math.sin(time * 17) * 0.15 * fpRoll;
      }
    }
    fpRuck = Math.max(0, fpRuck - dt * 3.5);
    fpRoll = Math.max(0, fpRoll - dt / 1.7);
    fpBall.visible = meinSchnee > 0 && ichSicht();
    // was liegt im Fadenkreuz? (nur bei gefangener Maus; Meldung nur bei Änderung)
    // Nur jedes dritte Bild: der Strahl prüft alle Möbel, Blobs und die Katze — für den Hinweis reichen ~20 Mal je
    // Sekunde. E oder Klick prüfen ohnehin selbst im Augenblick des Drückens (interagieren).
    fadenBild = (fadenBild + 1) % 3;
    if (gesperrt && fadenBild === 0) {
      camera.updateMatrixWorld();
      // Hinweis nur für Dinge in Reichweite (sonst bleibt das Fadenkreuz leer)
      const ziel = fadenZiel(treffer("mitte"));
      const key = ziel ? JSON.stringify(ziel) : "";
      if (key !== zielKey) {
        zielKey = key;
        opts.onZiel?.(ziel);
        raum.regal.hover(ziel?.karton || null);
      }
    }
    // Kissenschwung vor der eigenen Kamera
    if (fpHieb) {
      fpHieb.t += dt;
      const q = Math.min(1, fpHieb.t / 0.3);
      const e = easeInOut(q);
      fpKissen.visible = fpHieb.t < 0.45;
      fpKissen.position.set(0.62 - e * 0.85, -0.5 + Math.sin(q * Math.PI) * 0.3, -0.95);
      fpKissen.rotation.set(0.2, -0.6 + e * 1.1, 0.5 - e * 0.9);
      if (fpHieb.t > 0.45) fpHieb = null;
    }
    schnitt();

    const kFolge = 1 - Math.exp(-dt * 10);
    const dunkel = lampen.aktiv;
    for (const [key, f] of figuren) {
      // Bauch (Chips): nur der Körper wird breiter (bis zum Fünffachen) und etwas höher, der Kopf sitzt obendrauf;
      // geplatzt: schnell wieder schlank
      if (f.platzt) f.dick = f.platzt.dick * Math.max(0, 1 - f.platzt.t / 1.3);
      else f.dick += (f.bauch - f.dick) * Math.min(1, dt * 3);
      // breiter und höher: aus dem Blob wird eine runde Kugel mit Kopf obendrauf (statt einer flachen Torte)
      let breite = 1 + f.dick * DICKER;
      let hoehe = 1 + f.dick * 0.03;
      // am Spieltisch eingequetscht (der Bauch läge sonst auf dem Brett)
      if (f.sitz !== null && !f.hop) {
        breite = Math.min(breite, SITZ_BREIT);
        hoehe = Math.min(hoehe, 1.1);
      }
      // dicke Blobs schwabbeln beim Laufen
      if (f.geht && f.dick > 6) {
        const wob = Math.sin(f.schritt * 2) * 0.06 * Math.min(1, f.dick / 25);
        breite *= 1 + wob;
        hoehe *= 1 - wob * 0.5;
      }
      f.heben = f.av.setBauch(breite, hoehe);
      f.bauchR = 0.46 * (breite - 1);
      let sx = 1;
      let sy = 1;
      // Erscheinen: fällt von oben herein und federt
      let basisY = BASIS;
      let ry = 0;
      let px = 0;
      let pz = 0;
      if (f.spawn < 1) {
        f.spawn = Math.min(1, f.spawn + dt * 1.8);
        const s = f.spawn;
        const fall = Math.max(0, 1 - s * 1.6);
        basisY += fall * fall * 3.2;
        const squash = s > 0.62 ? 1 - Math.sin(((s - 0.62) / 0.38) * Math.PI) * 0.18 : 1;
        sx /= Math.sqrt(squash);
        sy *= squash;
      }
      // Sprung auf den Stuhl, herunter oder zum anderen Stuhl
      if (f.hop) {
        const h = f.hop;
        h.t += dt;
        const q = Math.min(1, h.t / h.dauer);
        const e = easeInOut(q);
        f.holder.position.lerpVectors(h.von, h.nach, e);
        f.holder.position.y += Math.sin(q * Math.PI) * h.hoehe;
        f.holder.rotation.set(0, winkelLerp(h.ryVon, h.ryNach, e), 0);
        if (q >= 1) {
          // aufs Sofa geplumpst: einsinken und federn
          if (h.plumps) {
            f.plumps = 1;
            sound.plumps(lautVon(f.holder.position));
          }
          f.hop = null;
          if (f.key === `p${ich}`) eigeneZeigen();
        }
      } else if (f.sitz === null && f.sofa === null && f.key !== `p${ich}` && f.ziel) {
        // fremder Blob: gleitet zur gemeldeten Position
        const p = f.holder.position;
        const dx = f.ziel.x - p.x;
        const dz = f.ziel.z - p.z;
        const d = Math.hypot(dx, dz);
        p.x += dx * kFolge;
        p.z += dz * kFolge;
        p.y = STEH_Y;
        f.holder.rotation.set(0, winkelLerp(f.holder.rotation.y, f.ziel.r, kFolge), 0);
        f.geht = d > 0.04 ? 1 : 0;
      }
      // Watscheln beim Laufen
      if (f.geht) f.schritt += dt * 11;
      const wackel = f.geht ? Math.sin(f.schritt) : 0;
      let rz = wackel * 0.11;
      // Geste aus dem Rad (Hände bewegt gesten.js — auch in Ruhe, der Bauch schiebt sie nach außen —, hier der Körper)
      const kopf = tmp.copy(f.holder.position).setY(f.holder.position.y + KOPF - 0.25 + f.heben * GROESSE);
      const v = gesten.schritt(f, dt, kopf, { bauch: f.bauchR, heben: f.heben });
      if (v) {
        basisY += v.y;
        ry = v.ry;
        rz += v.rz;
        sy *= v.sy;
      }
      // Schluckauf: kurzer Hüpfer mit Strecken
      if (f.hicks > 0) {
        f.hicks = Math.max(0, f.hicks - dt * 3.2);
        const h = Math.sin((1 - f.hicks) * Math.PI);
        basisY += h * 0.32;
        sy *= 1 + h * 0.09;
      }
      // aufs Sofa geplumpst: staucht sich zusammen und federt nach
      if (f.plumps > 0) {
        f.plumps = Math.max(0, f.plumps - dt * 2.6);
        const p = Math.sin(f.plumps * Math.PI * 2) * f.plumps;
        sy *= 1 - p * 0.22;
        sx *= 1 + p * 0.14;
      }
      // geplatzt: schwirrt wie ein losgelassener Luftballon umher, dreht sich, landet wieder
      if (f.platzt) {
        const pl = f.platzt;
        pl.t += dt;
        const rest = Math.max(0, 1 - pl.t / 1.7);
        px = Math.sin(pl.t * 11) * 1.2 * rest;
        pz = Math.cos(pl.t * 13) * 1.2 * rest;
        basisY += Math.sin(Math.min(1, pl.t / 1.7) * Math.PI) * 1.8;
        ry += pl.t * 22 * rest;
        rz += Math.sin(pl.t * 30) * 0.4 * rest;
        if (pl.t >= 1.7) {
          f.platzt = null;
          f.av.hop();
        }
      }
      f.av.group.rotation.z += (rz - f.av.group.rotation.z) * Math.min(1, dt * 14);
      f.av.group.rotation.y = ry;
      f.av.group.position.set(px, basisY + (f.geht ? Math.abs(Math.sin(f.schritt)) * 0.06 : 0), pz);
      if (f.geste) sy *= 1 + gesteSchritt(f, dt);
      if (f.kissen) kissenSchritt(f, dt);
      if (f.sterne) sterneSchritt(f, dt, time);
      // Schneehaube nach einem Treffer: bleibt kurz, dann rutscht sie weg
      if (f.kappe) {
        f.kappe.t += dt;
        const k = f.kappe;
        if (k.t > 2.6) {
          k.mesh.position.y -= dt * 1.5;
          k.mesh.scale.multiplyScalar(Math.exp(-dt * 4));
        }
        if (k.t > 3.3) {
          f.av.group.remove(k.mesh);
          f.kappe = null;
        }
      }
      // Schneeball in der Hand, Taschenlampe im Dunkeln
      f.ball.visible = f.schnee > 0;
      f.lampe.visible = dunkel;
      // Verschwinden
      if (f.weg) {
        f.wegT += dt * 2.5;
        const rest = Math.max(0.001, 1 - f.wegT);
        sx *= rest;
        sy *= rest;
        if (f.wegT >= 1) {
          figurEntsorgen(f);
          figuren.delete(key);
          continue;
        }
      }
      f.av.group.scale.set(sx, sy, sx);
      f.av.update(time, dt);
    }

    for (const [id, o] of Object.entries(spielObjekte)) {
      // Spielwechsel: altes schrumpft weg, neues wächst herein
      const soll = id === aktivId ? 1 : 0;
      o.groesse += (soll - o.groesse) * (1 - Math.exp(-dt * 7));
      if (Math.abs(soll - o.groesse) < 0.002) o.groesse = soll;
      const s = Math.max(0.001, o.groesse);
      o.group.scale.setScalar(s);
      o.group.visible = s > 0.01;
      if (o.group.visible) o.update(dt, time);
    }
    // Federn trudeln zu Boden und verblassen
    for (let i = federn.length - 1; i >= 0; i -= 1) {
      const fe = federn[i];
      const u = fe.userData;
      u.t += dt;
      u.v.y -= 2.2 * dt;
      u.v.multiplyScalar(Math.exp(-dt * 2.2));
      fe.position.addScaledVector(u.v, dt);
      fe.position.x += Math.sin(u.t * 7 + i) * 0.4 * dt;
      fe.rotation.z += u.dreh * dt;
      fe.rotation.x += u.dreh * 0.5 * dt;
      fe.material.opacity = Math.max(0, 1 - Math.max(0, u.t - 0.9) * 1.6);
      if (u.t > 1.6 || fe.position.y < BODEN) {
        scene.remove(fe);
        fe.material.dispose();
        federn.splice(i, 1);
      }
    }
    raum.update(dt, time);
    // Lampe pendelt kaum merklich (Licht und Flackern regelt raum.update)
    raum.lampe.rotation.z = Math.sin(time * 0.5) * 0.012;
    gesten.update(dt);
    schnee.update(dt);
    katze.update(dt, time);
    const dunkelWert = 1 - raum.licht.wert;
    katze.setDunkel(dunkelWert);
    // Taschenlampen: die eigene an der Kamera, die der anderen (die nächsten zur Kamera) in ihrer Hand
    if (dunkel) {
      const andere = [];
      for (const f of figuren.values()) {
        if (f.weg || f.key === `p${ich}`) continue;
        const pos = f.lampe.getWorldPosition(new THREE.Vector3());
        let dir;
        if (f.sitz !== null || f.sofa !== null || !f.key.startsWith("p")) dir = new THREE.Vector3(-pos.x, -0.25 - pos.y, -pos.z).normalize(); // auf den Tisch
        else {
          const r = f.holder.rotation.y;
          const n = f.neigung ?? -0.2;
          dir = new THREE.Vector3(Math.sin(r) * Math.cos(n), Math.sin(n), Math.cos(r) * Math.cos(n));
        }
        andere.push({ pos, dir, d: pos.distanceToSquared(camera.position) });
      }
      andere.sort((a, b) => a.d - b.d);
      lampen.update(dunkelWert, !!meineFigur(), andere);
      // ab und zu knarzt eine Diele
      knarzIn -= dt;
      if (knarzIn <= 0) {
        knarzIn = 14 + Math.random() * 18;
        sound.knarzen(0.35);
      }
    }

    // Schatten kosten fast die Hälfte der Zeichenaufrufe (jedes Möbel wird dafür ein zweites Mal gezeichnet). Läuft
    // das Zimmer flüssig, bleibt es bei jedem Bild; kommt der Rechner nicht hinterher, werden die Schatten nur jedes
    // zweite bzw. dritte Bild neu berechnet — sie hinken dann ein Bild nach, was man nicht sieht.
    bildZeit += (dt - bildZeit) * 0.05;
    const schattenTakt = bildZeit > 0.03 ? 3 : bildZeit > 0.014 ? 2 : 1;
    schattenBild = (schattenBild + 1) % schattenTakt;
    for (const l of schattenLichter) {
      l.shadow.autoUpdate = schattenTakt === 1;
      if (schattenTakt > 1 && schattenBild === 0) l.shadow.needsUpdate = true;
    }

    renderer.render(scene, camera);
    opts.onFrame?.();
  }
  raf = requestAnimationFrame(frame);

  function dispose() {
    disposed = true;
    cancelAnimationFrame(raf);
    ro.disconnect();
    canvas.removeEventListener("pointermove", onMove);
    canvas.removeEventListener("pointerdown", onDown);
    canvas.removeEventListener("pointerup", onUp);
    canvas.removeEventListener("pointerleave", onLeave);
    canvas.removeEventListener("wheel", onMausrad);
    window.removeEventListener("keydown", tasteRunter);
    window.removeEventListener("keyup", tasteHoch);
    window.removeEventListener("blur", tastenWeg);
    document.removeEventListener("pointerlockchange", onSperre);
    mausFrei();
    sound.windAn(false);
    for (const f of figuren.values()) figurEntsorgen(f);
    figuren.clear();
    for (const s of stuehle.values()) s.stuhl.dispose();
    stuehle.clear();
    for (const o of Object.values(spielObjekte)) o.dispose();
    federn.forEach((fe) => fe.material.dispose());
    [kissenMat, federMat, sternMat, limoGlasMat, limoSaftMat].forEach((m) => m.dispose());
    [LIMO_GLAS_GEO, LIMO_SAFT_GEO].forEach((g) => g.dispose());
    gesten.dispose();
    katze.dispose();
    lampen.dispose();
    camera.remove(fpBall);
    schnee.dispose();
    raum.dispose();
    renderer.dispose();
  }

  return {
    setze,
    ortVon,
    geste,
    /** Zwischenstand eines Zugs (sa:live), z. B. Strich-Stück beim Zeichen-Hochstapler */
    live: (d) => aktivesSpiel()?.live?.(d),
    geheZuStuhl,
    bildschirm,
    resize,
    dispose,
    /** Steht der eigene Blob (und kann laufen)? */
    get stehe() {
      return kannLaufen();
    },
    anprobieren,
    setAnsicht,
    /** Geste aus dem Rad machen (Knopf, Klick ins Rad). */
    machGeste,
    /** Gesten-Rad per Knopf öffnen/schließen; radWahl(i): Zeiger über Feld i (G loslassen führt sie aus). */
    radAuf,
    radZu,
    radWahl,
    /** Antwort des Servers auf eine eigene Geste (Bauch, platzt, Schneebälle). */
    eigenesErgebnis,
    /** Neuer Plan der Katze (sa:katze). */
    katze: (k) => katze.setze(k),
    /** Menü: Tasten fürs Zimmer aus/an; danach per Klick (Knopf „Weiter“) die Maus wieder fangen. */
    setPause,
    mausFangen,
    /** Mausgeschwindigkeit beim Umschauen (1 = normal). */
    setMausTempo: (f) => {
      mausTempo = Math.max(0.2, Math.min(4, Number(f) || 1));
    },
    /** Prüfstand: eigener Ort, Chips holen, hinlaufen, hauen, Umkleide */
    _ort: () => ({ ...meinOrt }),
    _chips: () => zuDenChips(),
    _limo: () => zurLimo(),
    _sofa: () => zumSofa(),
    _schalter: () => zumSchalter(),
    _fenster: () => zumFenster(() => opts.onFenster?.()),
    _schneeHolen: () => zumFenster(() => opts.onSchnee?.()),
    _wurf: (ziel) => eigenerWurf(ziel !== undefined ? { blob: ziel } : null, "mitte"),
    _streicheln: () => streicheln(),
    _katze: () => ({ ...katze.position, plan: katze.plan }),
    _dick: () => meineFigur()?.dick ?? 0,
    _info: () => ({ ...renderer.info.render, geometrien: renderer.info.memory.geometries, schattenLichter: schattenLichter.length, bildMs: Math.round(bildZeit * 1000) }),
    _hicks: (id) => figuren.get(`p${id}`)?.hicks ?? 0,
    _gehe: (x, z) => geheNach(x, z),
    _blick: (r, n = -0.18) => {
      meinOrt.r = r;
      neigung = n;
      ortOffen = true;
    },
    _hau: (id) => hauen(id),
    _umkleide: () => zurUmkleide(),
  };
}
