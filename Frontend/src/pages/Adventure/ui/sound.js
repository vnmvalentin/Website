// ui/sound.js — Spielklänge von adVentures, per WebAudio synthetisiert (keine Audiodateien), nach dem Muster der
// Clash-Royale-Sounds (pages/ClashRoyale/ui/sound.js). Häufige Klänge (Treffer, Kills, Gold) sind gedrosselt, damit eine
// Horde nicht zu Rauschen wird. Lautstärke kommt aus ui/settings.js. Ohne WebAudio bleibt es still.

import { getSettings } from "./settings.js";

let ctx = null;
let noiseBuf = null;
const lastPlayed = {};

function audio() {
  if (typeof window === "undefined") return null;
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

function out(ac, gain, t0, dur, atk) {
  const g = ac.createGain();
  const peak = Math.max(0.0002, gain * getSettings().volume);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + Math.min(atk, dur * 0.5));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  g.connect(ac.destination);
  return g;
}

function tone(ac, { freq, type = "sine", start = 0, dur = 0.12, gain = 0.2, atk = 0.006, lp = 0 }) {
  const t0 = ac.currentTime + start;
  const osc = ac.createOscillator();
  osc.type = type;
  const [f0, f1] = Array.isArray(freq) ? freq : [freq, freq];
  osc.frequency.setValueAtTime(f0, t0);
  if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  const g = out(ac, gain, t0, dur, atk);
  if (lp) {
    const f = ac.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = lp;
    osc.connect(f).connect(g);
  } else osc.connect(g);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

// Kurzes gefiltertes Rauschen für Treffer und Einschläge
function noise(ac, { start = 0, dur = 0.06, gain = 0.15, freq = 1800, q = 0.8 }) {
  if (!noiseBuf) {
    noiseBuf = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.5), ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t0 = ac.currentTime + start;
  const src = ac.createBufferSource();
  src.buffer = noiseBuf;
  const f = ac.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = freq;
  f.Q.value = q;
  src.connect(f).connect(out(ac, gain, t0, dur, 0.002));
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

const arp = (ac, notes, type, gain, step = 0.07, dur = 0.16) => notes.forEach((f, i) => tone(ac, { freq: f, type, start: i * step, dur, gain }));

const SOUNDS = {
  hit: (ac) => noise(ac, { dur: 0.04, gain: 0.05, freq: 2400 }),
  crit: (ac) => { noise(ac, { dur: 0.05, gain: 0.07, freq: 3400 }); tone(ac, { freq: 1500, type: "square", dur: 0.04, gain: 0.025, lp: 3000 }); },
  kill: (ac) => tone(ac, { freq: [320, 120], type: "triangle", dur: 0.09, gain: 0.08 }),
  gold: (ac) => tone(ac, { freq: 1760, type: "triangle", dur: 0.04, gain: 0.035 }),
  hurt: (ac) => { tone(ac, { freq: [180, 70], type: "square", dur: 0.14, gain: 0.08, lp: 900 }); noise(ac, { dur: 0.08, gain: 0.08, freq: 600 }); },
  item_common: (ac) => arp(ac, [523, 784], "triangle", 0.12),
  item_uncommon: (ac) => arp(ac, [523, 659, 988], "triangle", 0.13),
  item_legendary: (ac) => arp(ac, [523, 659, 784, 1047, 1319], "triangle", 0.14, 0.06, 0.3),
  item_boss: (ac) => arp(ac, [392, 523, 659, 784, 1047], "square", 0.07, 0.07, 0.3),
  levelup: (ac) => arp(ac, [392, 523, 659, 784], "triangle", 0.13, 0.05, 0.22),
  pick: (ac) => { tone(ac, { freq: 784, type: "triangle", dur: 0.07, gain: 0.12 }); tone(ac, { freq: 1175, type: "triangle", start: 0.06, dur: 0.16, gain: 0.12 }); },
  evolution: (ac) => { arp(ac, [262, 330, 392, 523, 659, 784, 1047], "square", 0.06, 0.05, 0.25); tone(ac, { freq: 131, type: "triangle", dur: 0.6, gain: 0.12 }); },
  boss: (ac) => { tone(ac, { freq: [110, 82], type: "sawtooth", dur: 0.9, gain: 0.1, atk: 0.08, lp: 700 }); tone(ac, { freq: [165, 123], type: "sawtooth", dur: 0.9, gain: 0.07, atk: 0.08, lp: 700 }); },
  bossDead: (ac) => { noise(ac, { dur: 0.4, gain: 0.15, freq: 300 }); arp(ac, [392, 494, 587, 784], "triangle", 0.13, 0.09, 0.35); },
  champion: (ac) => { tone(ac, { freq: [220, 330], type: "square", dur: 0.25, gain: 0.06, lp: 1500 }); tone(ac, { freq: [330, 440], type: "square", start: 0.18, dur: 0.3, gain: 0.06, lp: 1500 }); },
  blood: (ac) => { tone(ac, { freq: [98, 73], type: "sawtooth", dur: 1.4, gain: 0.09, atk: 0.3, lp: 500 }); tone(ac, { freq: [147, 110], type: "sine", dur: 1.4, gain: 0.08, atk: 0.3 }); },
  ring: (ac) => [0, 0.16, 0.32].forEach((s) => tone(ac, { freq: 740, type: "square", start: s, dur: 0.1, gain: 0.05, lp: 2000 })),
  shrine: (ac) => arp(ac, [440, 554, 659], "sine", 0.12, 0.08, 0.3),
  death: (ac) => { tone(ac, { freq: [392, 98], type: "sawtooth", dur: 1.2, gain: 0.1, atk: 0.01, lp: 1200 }); noise(ac, { dur: 0.5, gain: 0.1, freq: 400 }); },
  victory: (ac) => arp(ac, [523, 659, 784, 1047, 784, 1047, 1319], "triangle", 0.14, 0.11, 0.35),
};

// Mindestabstand in Sekunden je Klang (alles andere spielt sofort)
const THROTTLE = { hit: 0.06, crit: 0.08, kill: 0.07, gold: 0.09, hurt: 0.12 };

export function playSound(name) {
  if (getSettings().volume <= 0) return;
  const fn = SOUNDS[name];
  if (!fn) return;
  const now = typeof performance !== "undefined" ? performance.now() / 1000 : 0;
  if (THROTTLE[name] && now - (lastPlayed[name] || 0) < THROTTLE[name]) return;
  lastPlayed[name] = now;
  const ac = audio();
  if (!ac) return;
  try { fn(ac); } catch { /* Klang ist Komfort */ }
}
