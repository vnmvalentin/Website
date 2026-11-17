// sound.js — Klänge des Spieleabends (WebAudio). Stumm-Schalter wird gemerkt.
// Würfeln und Chips-Knuspern sind echte Aufnahmen (public/media/spieleabend/klang, CC0, Quellen in der README dort);
// alles andere entsteht im Browser: Plastik-Klacken für Steine, Plopp, Kissen-Wumms, kleine Melodien für Sieg und
// Niederlage. Fehlt eine Aufnahme oder kann der Browser sie nicht lesen, springt ein erzeugter Klang ein.
const KEY = "spieleabend.muted";
const LAUT_KEY = "spieleabend.lautstaerke";
const GRUND = 0.55; // Lautstärke bei 100 %
let ctx = null;
let master = null;
let muted = false;
let lautstaerke = 1;
try {
  muted = localStorage.getItem(KEY) === "1";
  const l = Number(localStorage.getItem(LAUT_KEY));
  if (localStorage.getItem(LAUT_KEY) !== null && Number.isFinite(l)) lautstaerke = Math.max(0, Math.min(1, l));
} catch {
  /* ohne Speicher: Ton an */
}
// Kopfleiste und Einstellungsmenü zeigen denselben Stand: wer sich anmeldet, hört Änderungen
const hoerer = new Set();
/** fn() bei jeder Änderung von Stumm oder Lautstärke; gibt das Abmelden zurück. */
export function abonniere(fn) {
  hoerer.add(fn);
  return () => hoerer.delete(fn);
}
const melden = () => hoerer.forEach((fn) => fn());

export const isMuted = () => muted;
export function setMuted(v) {
  muted = !!v;
  try {
    localStorage.setItem(KEY, muted ? "1" : "0");
  } catch {
    /* nicht gemerkt */
  }
  // ein laufendes Windrauschen (offenes Fenster) gleich mit verstummen lassen
  if (muted && wind) {
    wind.src.stop();
    wind.lfo.stop();
    wind = null;
  }
  melden();
}
export const getLautstaerke = () => lautstaerke;
/** Lautstärke 0–1 (gemerkt); 0 heißt nicht stumm, nur ganz leise — dafür gibt es setMuted. */
export function setLautstaerke(v) {
  lautstaerke = Math.max(0, Math.min(1, Number(v) || 0));
  if (master) master.gain.value = GRUND * lautstaerke;
  try {
    localStorage.setItem(LAUT_KEY, String(lautstaerke));
  } catch {
    /* nicht gemerkt */
  }
  melden();
}

function audio() {
  if (muted || typeof window === "undefined") return null;
  try {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = GRUND * lautstaerke;
      master.connect(ctx.createDynamicsCompressor()).connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

// ── Aufnahmen ─────────────────────────────────────────────────────────────────────────────
const KLANG = "/media/spieleabend/klang/";
const PROBEN = {
  schuetteln: [1, 2, 3].map((i) => `wuerfel-schuetteln-${i}`),
  wurf: [1, 2, 3].map((i) => `wuerfel-wurf-${i}`),
  knusper: [1, 2, 3, 4, 5, 6, 7].map((i) => `knusper-${i}`),
};
// Vorlauf bis zum Biss in jeder Knusper-Aufnahme (s, am Lautstärkeverlauf gemessen): so knackt es genau, wenn der
// Chip im Mund ankommt
const KNUSPER_VORLAUF = [0.5, 0.2, 0.15, 0.08, 0.18, 0.12, 0.12];
const puffer = new Map(); // name -> AudioBuffer | "laedt" | "fehlt"

function lade(name) {
  const a = audio();
  if (!a || puffer.has(name)) return;
  puffer.set(name, "laedt");
  fetch(`${KLANG}${name}.ogg`)
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
    .then((b) => a.decodeAudioData(b))
    .then((buf) => puffer.set(name, buf))
    .catch(() => puffer.set(name, "fehlt"));
}

/** Aufnahmen schon einmal holen (beim Betreten des Zimmers), damit der erste Wurf nicht stumm bleibt. */
export function vorladen() {
  for (const liste of Object.values(PROBEN)) liste.forEach(lade);
}

/** Aufnahme abspielen; false, wenn sie (noch) nicht da ist. */
function probe(name, { start = 0, ab = 0, dauer = null, laut = 1, rate = 1 } = {}) {
  const a = audio();
  const buf = a && puffer.get(name);
  if (!buf || typeof buf === "string") {
    lade(name);
    return false;
  }
  const t = a.currentTime + Math.max(0, start);
  const src = a.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  const g = a.createGain();
  g.gain.value = laut;
  if (dauer) {
    // weich ausblenden statt abzuschneiden
    g.gain.setValueAtTime(laut, t + Math.max(0, dauer - 0.08));
    g.gain.linearRampToValueAtTime(0.0001, t + dauer);
  }
  src.connect(g).connect(master);
  src.start(t, ab, dauer || undefined);
  return true;
}
const zufallAus = (liste) => liste[Math.floor(Math.random() * liste.length)];

function rauschen(a, dauer) {
  const len = Math.max(1, Math.floor(a.sampleRate * dauer));
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i += 1) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const src = a.createBufferSource();
  src.buffer = buf;
  return src;
}

function ton(a, { freq, typ = "sine", start = 0, dauer = 0.2, laut = 0.3, gleit = null }) {
  const t = a.currentTime + start;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = typ;
  osc.frequency.setValueAtTime(freq, t);
  if (gleit) osc.frequency.exponentialRampToValueAtTime(gleit, t + dauer);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(laut, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dauer);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + dauer + 0.05);
}

function knack(a, { start = 0, freq = 2600, laut = 0.5, dauer = 0.05 }) {
  const t = a.currentTime + start;
  const src = rauschen(a, dauer);
  const f = a.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = freq;
  f.Q.value = 2.5;
  const g = a.createGain();
  g.gain.value = laut;
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

/** Stein landet im Brett: Klacken mit kurzem Nachklappern; tiefer gefallen = etwas lauter. */
export function klack(tiefe = 1) {
  const a = audio();
  if (!a) return;
  const k = 0.55 + Math.min(1, tiefe / 6) * 0.45;
  knack(a, { freq: 2200, laut: 0.7 * k });
  ton(a, { freq: 190, typ: "triangle", dauer: 0.08, laut: 0.25 * k, gleit: 120 });
  knack(a, { start: 0.07, freq: 3200, laut: 0.22 * k, dauer: 0.03 });
}

/** Stein rutscht oben in den Schlitz. */
export function einwurf() {
  const a = audio();
  if (!a) return;
  knack(a, { freq: 4200, laut: 0.18, dauer: 0.04 });
}

/** Brett wird ausgeleert: viele Steine prasseln heraus. */
export function ausleeren() {
  const a = audio();
  if (!a) return;
  for (let i = 0; i < 14; i += 1) knack(a, { start: i * 0.035 + Math.random() * 0.03, freq: 1800 + Math.random() * 1800, laut: 0.35, dauer: 0.04 });
}

/** Würfeln: kurz in der Hand schütteln, dann fällt der Würfel auf den Tisch (passt zur Flugbahn in maedn3d.js). */
export function wuerfelRollt() {
  const a = audio();
  if (!a) return;
  const rate = 0.95 + Math.random() * 0.1;
  const geschuettelt = probe(zufallAus(PROBEN.schuetteln), { ab: 0.35, dauer: 0.42, laut: 0.75, rate });
  const geworfen = probe(zufallAus(PROBEN.wurf), { start: 0.42, laut: 1, rate });
  if (geschuettelt && geworfen) return;
  const zeiten = [0, 0.09, 0.2, 0.33, 0.45, 0.55, 0.63, 0.7, 0.76];
  zeiten.forEach((t, i) => knack(a, { start: t, freq: 1400 + Math.random() * 1600, laut: 0.55 * (1 - i / zeiten.length) + 0.08, dauer: 0.035 }));
}

/** Spielfigur setzt auf einem Feld auf. */
export function hopp(i = 0) {
  const a = audio();
  if (!a) return;
  knack(a, { freq: 900 + (i % 2) * 220, laut: 0.28, dauer: 0.03 });
}

/** Eine Figur wird rausgeworfen und fliegt heim. */
export function rauswurf() {
  const a = audio();
  if (!a) return;
  knack(a, { freq: 1700, laut: 0.7, dauer: 0.06 });
  ton(a, { freq: 620, typ: "triangle", start: 0.05, dauer: 0.5, laut: 0.18, gleit: 180 });
}

/** Figur erreicht ein Zielfeld. */
export function imZiel() {
  const a = audio();
  if (!a) return;
  ton(a, { freq: 988, dauer: 0.16, laut: 0.12 });
  ton(a, { freq: 1319, start: 0.08, dauer: 0.24, laut: 0.1 });
}

/** Jemand beißt in einen Chip; biss = Sekunden bis der Chip im Mund ist. */
export function knusper(biss = 0.45) {
  const a = audio();
  if (!a) return;
  const i = Math.floor(Math.random() * PROBEN.knusper.length);
  const vorlauf = KNUSPER_VORLAUF[i];
  // Aufnahme so starten, dass ihr Biss auf den Moment fällt, in dem der Chip im Mund ist
  const start = biss - vorlauf;
  if (probe(PROBEN.knusper[i], { start: Math.max(0, start), ab: Math.max(0, -start), laut: 0.9, rate: 0.94 + Math.random() * 0.14 })) return;
  [0.45, 0.58, 0.7, 0.83, 0.95].forEach((t, i) => knack(a, { start: t + Math.random() * 0.03, freq: 2600 + Math.random() * 2400, laut: 0.4 - i * 0.05, dauer: 0.05 }));
}

/** Kissen schwingt durch die Luft. */
export function wusch() {
  const a = audio();
  if (!a) return;
  const t = a.currentTime;
  const src = rauschen(a, 0.3);
  const f = a.createBiquadFilter();
  f.type = "bandpass";
  f.Q.value = 1.2;
  f.frequency.setValueAtTime(500, t);
  f.frequency.exponentialRampToValueAtTime(1800, t + 0.22);
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.35, t + 0.12);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

/** Kissen trifft: dumpfer Wumms mit etwas Federrascheln. */
export function kissen() {
  const a = audio();
  if (!a) return;
  const t = a.currentTime;
  const dumpf = rauschen(a, 0.25);
  const tp = a.createBiquadFilter();
  tp.type = "lowpass";
  tp.frequency.value = 420;
  const g = a.createGain();
  g.gain.value = 1.1;
  dumpf.connect(tp).connect(g).connect(master);
  dumpf.start(t);
  ton(a, { freq: 120, dauer: 0.22, laut: 0.4, gleit: 60 });
  for (let i = 0; i < 5; i += 1) knack(a, { start: 0.04 + i * 0.05 + Math.random() * 0.04, freq: 5000 + Math.random() * 3000, laut: 0.06, dauer: 0.06 });
}

/** Zu viele Chips: ein Rülpser. */
export function ruelpser() {
  const a = audio();
  if (!a) return;
  const t = a.currentTime;
  const osc = a.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(95, t);
  osc.frequency.linearRampToValueAtTime(70, t + 0.45);
  // leichtes Flattern der Stimmbänder
  const lfo = a.createOscillator();
  lfo.frequency.value = 23;
  const lfoG = a.createGain();
  lfoG.gain.value = 18;
  lfo.connect(lfoG).connect(osc.frequency);
  const tp = a.createBiquadFilter();
  tp.type = "lowpass";
  tp.frequency.value = 520;
  tp.Q.value = 6;
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.5, t + 0.05);
  g.gain.setValueAtTime(0.5, t + 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
  osc.connect(tp).connect(g).connect(master);
  osc.start(t);
  lfo.start(t);
  osc.stop(t + 0.6);
  lfo.stop(t + 0.6);
}

/** Jemand setzt sich an den Tisch. */
export function plopp() {
  const a = audio();
  if (!a) return;
  ton(a, { freq: 420, dauer: 0.16, laut: 0.25, gleit: 820 });
}

/** Du bist dran. */
export function dran() {
  const a = audio();
  if (!a) return;
  ton(a, { freq: 880, dauer: 0.18, laut: 0.12 });
  ton(a, { freq: 1320, start: 0.09, dauer: 0.22, laut: 0.1 });
}

export function sieg() {
  const a = audio();
  if (!a) return;
  [523, 659, 784, 1047].forEach((f, i) => ton(a, { freq: f, typ: "triangle", start: i * 0.11, dauer: 0.32, laut: 0.22 }));
}

export function niederlage() {
  const a = audio();
  if (!a) return;
  ton(a, { freq: 392, typ: "triangle", dauer: 0.3, laut: 0.2 });
  ton(a, { freq: 311, typ: "triangle", start: 0.22, dauer: 0.5, laut: 0.2 });
}

// ── Zimmer-Spaß (Gesten, Licht, Fenster, Katze) ────────────────────────────────────────────
// laut: 0–1, die Szene dämpft damit Klänge, die weiter weg passieren.

/** Gefiltertes Rauschen als kurzer Stoß (Klatschen, Platschen, Schnee). */
function stoss(a, { start = 0, dauer = 0.08, typ = "bandpass", freq = 1400, q = 0.9, laut = 0.5 }) {
  const t = a.currentTime + start;
  const src = rauschen(a, dauer);
  const f = a.createBiquadFilter();
  f.type = typ;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = a.createGain();
  g.gain.value = laut;
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

/** Ein Ton durch ein Filter (Posaune, Tröte, Miau). punkte: [[Zeit, Frequenz], …] */
function stimme(a, { start = 0, typ = "sawtooth", punkte, filter = 1200, q = 1, laut = 0.3, dauer, vibrato = 0 }) {
  const t = a.currentTime + start;
  const osc = a.createOscillator();
  osc.type = typ;
  osc.frequency.setValueAtTime(punkte[0][1], t);
  for (const [z, f] of punkte.slice(1)) osc.frequency.linearRampToValueAtTime(f, t + z);
  let lfo = null;
  if (vibrato) {
    lfo = a.createOscillator();
    lfo.frequency.value = 6;
    const lg = a.createGain();
    lg.gain.value = vibrato;
    lfo.connect(lg).connect(osc.frequency);
    lfo.start(t);
    lfo.stop(t + dauer + 0.05);
  }
  const f = a.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = filter;
  f.Q.value = q;
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(laut, t + 0.03);
  g.gain.setValueAtTime(laut, t + Math.max(0.04, dauer - 0.08));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dauer);
  osc.connect(f).connect(g).connect(master);
  osc.start(t);
  osc.stop(t + dauer + 0.05);
}

/** Klatschen: anzahl Klatscher im Abstand (passt zur Handbewegung in scene/gesten.js). */
export function klatschen(laut = 1, anzahl = 5, abstand = 0.3, start = 0.15) {
  const a = audio();
  if (!a) return;
  for (let i = 0; i < anzahl; i += 1) {
    const s = start + i * abstand;
    stoss(a, { start: s, dauer: 0.07, freq: 1300 + Math.random() * 400, q: 0.8, laut: 0.9 * laut });
    stoss(a, { start: s + 0.012, dauer: 0.05, typ: "highpass", freq: 2500, q: 0.5, laut: 0.25 * laut });
  }
}

/** Jubeln: Partytröte und eine kleine Fanfare. */
export function jubel(laut = 1) {
  const a = audio();
  if (!a) return;
  stimme(a, { punkte: [[0, 330], [0.12, 520], [0.5, 560]], filter: 1800, q: 3, laut: 0.22 * laut, dauer: 0.55 });
  [659, 784, 1047].forEach((f, i) => ton(a, { freq: f, typ: "triangle", start: 0.35 + i * 0.09, dauer: 0.28, laut: 0.14 * laut }));
}

/** Schmollen: traurige Posaune, wah wah wah waaah. */
export function schmollen(laut = 1) {
  const a = audio();
  if (!a) return;
  [[0, 311], [0.38, 294], [0.76, 277]].forEach(([s, f]) => stimme(a, { start: s, punkte: [[0, f], [0.3, f * 0.97]], filter: 900, q: 2, laut: 0.24 * laut, dauer: 0.34 }));
  stimme(a, { start: 1.14, punkte: [[0, 262], [1.0, 250]], filter: 800, q: 2, laut: 0.24 * laut, dauer: 1.1, vibrato: 9 });
}

/** Tanzen: vier Sekunden Groove (Bass, Bassdrum, Hi-Hat, ein paar Töne obendrauf). */
export function tanzMusik(laut = 1) {
  const a = audio();
  if (!a) return;
  const schlag = 0.5;
  const bass = [65.4, 65.4, 98, 98, 110, 110, 87.3, 98];
  const oben = [523, 0, 659, 784, 0, 659, 587, 523, 0, 659, 784, 880, 784, 0, 659, 0];
  for (let i = 0; i < 8; i += 1) {
    const s = i * schlag;
    ton(a, { freq: 150, start: s, dauer: 0.16, laut: 0.5 * laut, gleit: 45 });
    stoss(a, { start: s + schlag / 2, dauer: 0.04, typ: "highpass", freq: 6500, q: 0.4, laut: 0.25 * laut });
    ton(a, { freq: bass[i], typ: "triangle", start: s, dauer: schlag * 0.9, laut: 0.28 * laut });
  }
  oben.forEach((f, i) => f && ton(a, { freq: f, typ: "square", start: i * (schlag / 2), dauer: 0.12, laut: 0.045 * laut }));
}

/** Zensur-Piep (Mittelfinger). */
export function piep(laut = 1) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + 0.05;
  const osc = a.createOscillator();
  osc.frequency.value = 1000;
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.16 * laut, t + 0.01);
  g.gain.setValueAtTime(0.16 * laut, t + 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.62);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + 0.7);
}

/** Zeigen: kurzes Ping an der Stelle. */
export function ping(laut = 1) {
  const a = audio();
  if (!a) return;
  ton(a, { freq: 1320, dauer: 0.14, laut: 0.14 * laut });
  ton(a, { freq: 1760, start: 0.07, dauer: 0.3, laut: 0.12 * laut });
}

/** Schluckauf: „hick“. */
export function hicks(laut = 1) {
  const a = audio();
  if (!a) return;
  stoss(a, { dauer: 0.03, freq: 2200, q: 1.5, laut: 0.5 * laut });
  stimme(a, { typ: "triangle", punkte: [[0, 620], [0.05, 1350], [0.09, 900]], filter: 3000, laut: 0.3 * laut, dauer: 0.11 });
  stoss(a, { start: 0.07, dauer: 0.04, freq: 3400, q: 2, laut: 0.25 * laut });
}

/** Limo: Flasche zischt, drei Schlucke, „aah“. */
export function schluck(laut = 1) {
  const a = audio();
  if (!a) return;
  stoss(a, { dauer: 0.28, typ: "highpass", freq: 4000, q: 0.5, laut: 0.35 * laut });
  [0.4, 0.66, 0.92].forEach((s) => {
    ton(a, { freq: 190, start: s, dauer: 0.12, laut: 0.35 * laut, gleit: 110 });
    stoss(a, { start: s, dauer: 0.1, typ: "lowpass", freq: 500, q: 1, laut: 0.5 * laut });
  });
  stimme(a, { start: 1.15, punkte: [[0, 240], [0.4, 200]], filter: 1100, q: 4, laut: 0.16 * laut, dauer: 0.45 });
}

/** Geplatzt: Luft entweicht flatternd wie aus einem Luftballon, dann landet er. */
export function ballon(laut = 1) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime;
  const osc = a.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(460, t);
  osc.frequency.exponentialRampToValueAtTime(130, t + 1.5);
  const lfo = a.createOscillator();
  lfo.frequency.value = 31;
  const lg = a.createGain();
  lg.gain.value = 70;
  lfo.connect(lg).connect(osc.frequency);
  const f = a.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = 900;
  f.Q.value = 2.5;
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.45 * laut, t + 0.04);
  g.gain.setValueAtTime(0.45 * laut, t + 1.25);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.55);
  osc.connect(f).connect(g).connect(master);
  osc.start(t);
  lfo.start(t);
  osc.stop(t + 1.6);
  lfo.stop(t + 1.6);
  stoss(a, { dauer: 1.3, typ: "highpass", freq: 3000, q: 0.4, laut: 0.12 * laut });
  ton(a, { freq: 300, start: 1.65, dauer: 0.16, laut: 0.25 * laut, gleit: 700 });
}

/** Lichtschalter klickt. */
export function schalter() {
  const a = audio();
  if (!a) return;
  knack(a, { freq: 3800, laut: 0.45, dauer: 0.025 });
  knack(a, { start: 0.03, freq: 1600, laut: 0.25, dauer: 0.03 });
}

/** Licht aus: tiefes Grollen, das ein bisschen unheimlich klingt. */
export function dunkel() {
  const a = audio();
  if (!a) return;
  ton(a, { freq: 55, start: 0.05, dauer: 2.2, laut: 0.3 });
  ton(a, { freq: 58.3, start: 0.05, dauer: 2.2, laut: 0.25 });
  stoss(a, { start: 0.05, dauer: 1.6, typ: "lowpass", freq: 260, q: 0.7, laut: 0.35 });
}

/** Knarzen (Fenster, Dielen im Dunkeln). */
export function knarzen(laut = 1) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime;
  const osc = a.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(80 + Math.random() * 30, t);
  osc.frequency.linearRampToValueAtTime(130 + Math.random() * 40, t + 0.55);
  const lfo = a.createOscillator();
  lfo.frequency.value = 14 + Math.random() * 6;
  const lg = a.createGain();
  lg.gain.value = 35;
  lfo.connect(lg).connect(osc.frequency);
  const f = a.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = 700;
  f.Q.value = 7;
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.35 * laut, t + 0.08);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
  osc.connect(f).connect(g).connect(master);
  osc.start(t);
  lfo.start(t);
  osc.stop(t + 0.65);
  lfo.stop(t + 0.65);
}

// Wind am offenen Fenster: leises Rauschen, solange es offen ist
let wind = null;
export function windAn(an) {
  const a = audio();
  if (!a) return;
  if (an && !wind) {
    const len = a.sampleRate * 2;
    const buf = a.createBuffer(1, len, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) d[i] = Math.random() * 2 - 1;
    const src = a.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const f = a.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 480;
    f.Q.value = 0.8;
    const lfo = a.createOscillator();
    lfo.frequency.value = 0.23;
    const lg = a.createGain();
    lg.gain.value = 220;
    lfo.connect(lg).connect(f.frequency);
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.09, a.currentTime + 0.8);
    src.connect(f).connect(g).connect(master);
    src.start();
    lfo.start();
    wind = { src, lfo, g };
  } else if (!an && wind) {
    const w = wind;
    wind = null;
    const t = a.currentTime;
    w.g.gain.cancelScheduledValues(t);
    w.g.gain.setValueAtTime(Math.max(0.0001, w.g.gain.value), t);
    w.g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    w.src.stop(t + 0.65);
    w.lfo.stop(t + 0.65);
  }
}

/** Schnee vom Fensterbrett holen: knirschen. */
export function schneeKnirschen(laut = 1) {
  const a = audio();
  if (!a) return;
  for (let i = 0; i < 6; i += 1) knack(a, { start: i * 0.06 + Math.random() * 0.03, freq: 3000 + Math.random() * 2500, laut: 0.25 * laut, dauer: 0.05 });
  stoss(a, { dauer: 0.35, typ: "lowpass", freq: 900, q: 0.6, laut: 0.25 * laut });
}

/** Schneeball klatscht auf. */
export function platsch(laut = 1) {
  const a = audio();
  if (!a) return;
  stoss(a, { dauer: 0.18, typ: "lowpass", freq: 700, q: 0.7, laut: 0.9 * laut });
  for (let i = 0; i < 4; i += 1) knack(a, { start: 0.02 + i * 0.03, freq: 2500 + Math.random() * 3000, laut: 0.25 * laut, dauer: 0.04 });
}

/** Aufs Sofa geplumpst. */
export function plumps(laut = 1) {
  const a = audio();
  if (!a) return;
  ton(a, { freq: 95, dauer: 0.3, laut: 0.5 * laut, gleit: 48 });
  stoss(a, { dauer: 0.25, typ: "lowpass", freq: 380, q: 0.8, laut: 0.7 * laut });
}

/** Die Katze miaut (zwei Formanten über einer Sägezahn-Stimme, „mi-auu“). */
export function miau(laut = 1) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime;
  const hoch = 0.9 + Math.random() * 0.25;
  const osc = a.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(470 * hoch, t);
  osc.frequency.linearRampToValueAtTime(720 * hoch, t + 0.18);
  osc.frequency.linearRampToValueAtTime(520 * hoch, t + 0.62);
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.32 * laut, t + 0.06);
  g.gain.setValueAtTime(0.3 * laut, t + 0.45);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.66);
  for (const [f0, f1, f2, q, v] of [[750, 1150, 650, 6, 1], [1700, 2100, 1250, 9, 0.6]]) {
    const f = a.createBiquadFilter();
    f.type = "bandpass";
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.linearRampToValueAtTime(f1, t + 0.2);
    f.frequency.linearRampToValueAtTime(f2, t + 0.6);
    const fg = a.createGain();
    fg.gain.value = v * 3;
    osc.connect(f).connect(fg).connect(g);
  }
  g.connect(master);
  osc.start(t);
  osc.stop(t + 0.7);
}

/** Schnurren: tiefes, schnell pulsierendes Brummen mit Atemzügen. */
export function schnurren(dauer = 4, laut = 1) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime;
  const len = Math.floor(a.sampleRate * dauer);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  const sr = a.sampleRate;
  let tief = 0;
  for (let i = 0; i < len; i += 1) {
    const s = i / sr;
    tief += ((Math.random() * 2 - 1) - tief) * 0.04; // weiches Rauschen
    const puls = 0.55 + 0.45 * Math.sign(Math.sin(s * Math.PI * 2 * 25)); // ~25 Schläge je Sekunde
    const atem = 0.45 + 0.55 * Math.abs(Math.sin((s * Math.PI) / 1.25)); // ein- und ausatmen
    const rand = Math.min(1, s / 0.3, (dauer - s) / 0.4);
    d[i] = tief * puls * atem * rand * 4;
  }
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = 320;
  const g = a.createGain();
  g.gain.value = 0.7 * laut;
  src.connect(f).connect(g).connect(master);
  src.start(t);
}
