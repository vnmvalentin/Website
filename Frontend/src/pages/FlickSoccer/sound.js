// sound.js — Klänge von Flick Soccer, per WebAudio synthetisiert (keine Audiodateien). Lautstärke folgt der Aufprall-
// geschwindigkeit. Der AudioContext entsteht erst beim ersten Klang (der immer auf eine Eingabe folgt); schlägt etwas
// fehl, bleibt es still — Ton ist Komfort, nie Voraussetzung.

const MUTE_KEY = "flickSoccer.muted";
let ctx = null;
let muted = false;
try {
  muted = localStorage.getItem(MUTE_KEY) === "1";
} catch {
  /* ohne Speicher: Ton an */
}

export const isMuted = () => muted;
export function setMuted(v) {
  muted = !!v;
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    /* egal */
  }
}

function audio() {
  if (muted || typeof window === "undefined") return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

function click(ac, { freq, dur, gain, type = "triangle", lp = 0 }) {
  const t0 = ac.currentTime;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.55), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  let node = osc;
  if (lp) {
    const f = ac.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = lp;
    osc.connect(f);
    node = f;
  }
  node.connect(g).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

let lastHit = 0;

/** Aufprall aus der Physik: { type: 'ball' | 'piece' | 'wall' | 'post', speed } */
export function playImpact(ev) {
  const ac = audio();
  if (!ac) return;
  // nicht mehr als ~40 Klicks pro Sekunde, leise Berührungen gar nicht
  const now = ac.currentTime;
  if (ev.type === "eject") {
    // Torblockade-Regel greift: zwei kurze hohe Töne
    click(ac, { freq: 1700, dur: 0.07, gain: 0.08, type: "sine" });
    setTimeout(() => ac.state === "running" && click(ac, { freq: 1900, dur: 0.07, gain: 0.08, type: "sine" }), 90);
    return;
  }
  if (now - lastHit < 0.025 || ev.speed < 60) return;
  lastHit = now;
  const v = Math.min(1, ev.speed / 2200);
  if (ev.type === "ball") click(ac, { freq: 900, dur: 0.06, gain: 0.05 + v * 0.25, type: "square", lp: 2400 });
  else if (ev.type === "piece") click(ac, { freq: 520, dur: 0.07, gain: 0.05 + v * 0.22, type: "triangle" });
  else if (ev.type === "post") click(ac, { freq: 1500, dur: 0.18, gain: 0.04 + v * 0.18, type: "sine" });
  else click(ac, { freq: 180, dur: 0.08, gain: 0.04 + v * 0.2, type: "triangle", lp: 900 });
}

export function playShot(power) {
  const ac = audio();
  if (!ac) return;
  click(ac, { freq: 300 + power * 200, dur: 0.09, gain: 0.08 + power * 0.15, type: "sawtooth", lp: 1200 });
  // Harter Schuss: tiefer Schlag darunter, damit man die Wucht hört
  if (power >= 0.9) click(ac, { freq: 95, dur: 0.22, gain: 0.32, type: "sine" });
}

/** Hinweis-Ton: zwei aufsteigende Töne (z. B. der Gegner will eine Revanche). */
export function playNotify() {
  const ac = audio();
  if (!ac) return;
  click(ac, { freq: 660, dur: 0.12, gain: 0.12, type: "triangle" });
  setTimeout(() => ac.state === "running" && click(ac, { freq: 990, dur: 0.16, gain: 0.12, type: "triangle" }), 120);
}

/** Kurzer Pfiff (Tor, Abpfiff). */
export function playWhistle(long = false) {
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime;
  const osc = ac.createOscillator();
  const lfo = ac.createOscillator();
  const lfoGain = ac.createGain();
  const g = ac.createGain();
  osc.type = "sine";
  osc.frequency.value = 2350;
  lfo.frequency.value = 28;
  lfoGain.gain.value = 90;
  lfo.connect(lfoGain).connect(osc.frequency);
  const dur = long ? 0.9 : 0.45;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.09, t0 + 0.02);
  g.gain.setValueAtTime(0.09, t0 + dur - 0.06);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(t0);
  lfo.start(t0);
  osc.stop(t0 + dur + 0.02);
  lfo.stop(t0 + dur + 0.02);
}
