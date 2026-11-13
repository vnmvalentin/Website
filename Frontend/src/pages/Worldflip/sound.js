// sound.js — Töne von Worldflip, im Browser erzeugt (WebAudio, keine Dateien). Stumm-Schalter wird gemerkt.
//
// Aufbau: Jeder Ton besteht aus mehreren Schichten (Rauschen durch Filter, Sinus-Bässe, kurze Knackser), ein Teil
// geht durch einen künstlichen Hall (Faltung mit ausklingendem Rauschen) — so klingen Einschläge groß statt piepsig.
// Dazu läuft je Welt ein leiser Hintergrundklang (ambience): Grollen und Knistern, Brandung, Grillen, Weltraum-Dröhnen.
const KEY = 'worldflip.muted';
let ctx = null;
let master = null;
let wet = null; // Eingang des Halls
let brown = null; // Puffer: tiefes Rauschen (Grollen, Brandung)
let white = null;
let muted = false;
try {
  muted = localStorage.getItem(KEY) === '1';
} catch {
  /* ohne Speicher: Ton an */
}

export const isMuted = () => muted;

function audio() {
  if (muted || typeof window === 'undefined') return null;
  try {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.9;
      const comp = ctx.createDynamicsCompressor();
      master.connect(comp).connect(ctx.destination);
      // Hall: zwei Sekunden ausklingendes Rauschen als Raumantwort
      const len = ctx.sampleRate * 2.2;
      const impulse = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch += 1) {
        const d = impulse.getChannelData(ch);
        for (let i = 0; i < len; i += 1) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.6;
      }
      const verb = ctx.createConvolver();
      verb.buffer = impulse;
      wet = ctx.createGain();
      wet.gain.value = 0.5;
      wet.connect(verb).connect(master);
      // Rauschpuffer
      white = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      brown = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
      const w = white.getChannelData(0);
      for (let i = 0; i < w.length; i += 1) w[i] = Math.random() * 2 - 1;
      const b = brown.getChannelData(0);
      let last = 0;
      for (let i = 0; i < b.length; i += 1) {
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        b[i] = last * 3.5;
      }
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

// ── Bausteine ───────────────────────────────────────────────────────────────────────────────
function out(node, reverb) {
  node.connect(master);
  if (reverb) {
    const send = ctx.createGain();
    send.gain.value = reverb;
    node.connect(send).connect(wet);
  }
}

/** Sinus/Dreieck/Säge mit Tonhöhen-Fahrt. */
function tone(freq, dur, { type = 'sine', gain = 0.12, to = null, delay = 0, attack = 0.005, reverb = 0 } = {}) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + delay;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g);
  out(g, reverb);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

/** Rauschen durch einen Filter, der von `from` nach `to` fährt. deep: tiefes Rauschen (Grollen). */
function noise(dur, { gain = 0.15, from = 800, to = null, q = 1, delay = 0, type = 'bandpass', deep = false, attack = 0.005, reverb = 0 } = {}) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + delay;
  const src = a.createBufferSource();
  src.buffer = deep ? brown : white;
  src.loop = true;
  const filter = a.createBiquadFilter();
  filter.type = type;
  filter.Q.value = q;
  filter.frequency.setValueAtTime(from, t);
  if (to) filter.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(g);
  out(g, reverb);
  src.start(t, Math.random() * 1.5);
  src.stop(t + dur + 0.05);
}

/** Knistern: viele kurze, helle Knackser über `dur` Sekunden (Feuer, Eis, Holz). */
function crackle(dur, { count = 24, gain = 0.2, from = 2500, delay = 0, reverb = 0.1 } = {}) {
  for (let i = 0; i < count; i += 1) {
    noise(0.012 + Math.random() * 0.03, {
      gain: gain * (0.3 + Math.random() * 0.7), from: from * (0.6 + Math.random()), q: 2, type: 'highpass',
      delay: delay + Math.random() * dur, attack: 0.001, reverb,
    });
  }
}

/** Wumms: tiefer Sinus, der abfällt, plus dumpfes Rauschen. */
function boom(gain = 0.5, delay = 0, len = 0.9) {
  tone(95, len, { to: 28, gain, delay, attack: 0.004, reverb: 0.5 });
  noise(len * 0.8, { gain: gain * 0.7, from: 260, to: 50, q: 0.6, delay, deep: true, type: 'lowpass', reverb: 0.6 });
}

/** Feuer: Fauchen, Grollen und Knistern. */
function fire(dur, gain = 0.3, delay = 0) {
  noise(dur, { gain, from: 500, to: 1400, q: 0.5, delay, attack: dur * 0.25, reverb: 0.25 });
  noise(dur, { gain: gain * 1.1, from: 160, to: 90, q: 0.5, delay, deep: true, type: 'lowpass', attack: dur * 0.2, reverb: 0.3 });
  crackle(dur, { count: Math.round(dur * 26), gain: gain * 0.8, delay });
}

/** Wasser: Rauschen einer Welle, die anrollt und ausläuft, mit Blubbern. */
function wash(dur, gain = 0.3, delay = 0) {
  noise(dur, { gain, from: 350, to: 1500, q: 0.7, delay, attack: dur * 0.45, reverb: 0.3 });
  noise(dur * 0.7, { gain: gain * 0.6, from: 2800, to: 900, q: 0.8, delay: delay + dur * 0.35, attack: dur * 0.2, reverb: 0.3 });
  for (let i = 0; i < 7; i += 1) tone(300 + Math.random() * 500, 0.09, { to: 900 + Math.random() * 600, gain: gain * 0.25, delay: delay + Math.random() * dur });
}

// ── Töne ────────────────────────────────────────────────────────────────────────────────────
export const sfx = {
  card: () => { noise(0.07, { gain: 0.22, from: 3200, to: 1200, q: 0.8, type: 'highpass', attack: 0.001 }); tone(160, 0.08, { to: 90, gain: 0.12 }); },
  show: () => { noise(0.35, { gain: 0.14, from: 600, to: 3600, q: 1.4, attack: 0.1, reverb: 0.3 }); tone(520, 0.3, { to: 780, gain: 0.07, type: 'triangle', reverb: 0.4 }); },
  draw: () => noise(0.13, { gain: 0.13, from: 1200, to: 3200, q: 1.2, attack: 0.02 }),
  wrong: () => { tone(190, 0.18, { type: 'square', gain: 0.06 }); tone(140, 0.26, { type: 'square', gain: 0.06, delay: 0.16 }); },
  // Weltwechsel: tiefes Mahlen der Trommel mit einem Windzug
  world: () => {
    noise(1.7, { gain: 0.34, from: 120, to: 60, q: 0.6, deep: true, type: 'lowpass', attack: 0.4, reverb: 0.5 });
    noise(1.5, { gain: 0.16, from: 300, to: 2200, q: 2, attack: 0.6, reverb: 0.4 });
    tone(55, 1.6, { to: 82, gain: 0.2, attack: 0.3, reverb: 0.3 });
    boom(0.3, 1.45, 0.6);
  },
  // Kipp: der Tisch wirbelt herum
  flip: () => {
    for (let i = 0; i < 3; i += 1) noise(0.42, { gain: 0.2, from: 400, to: 2400, q: 3, delay: i * 0.3, attack: 0.12, reverb: 0.2 });
    tone(300, 1.1, { to: 620, gain: 0.08, type: 'triangle', reverb: 0.3 });
    boom(0.28, 0.95, 0.5);
  },
  // Zeigen: kurzes Sirren, dann ein Stups
  point: () => { noise(0.28, { gain: 0.14, from: 900, to: 4200, q: 4, attack: 0.05 }); tone(880, 0.09, { gain: 0.1, delay: 0.27, type: 'triangle' }); tone(1320, 0.14, { gain: 0.09, delay: 0.33, type: 'triangle', reverb: 0.3 }); },
  // Sturm: Böe, die anschwillt und abzieht
  skip: () => {
    noise(1.5, { gain: 0.34, from: 300, to: 2600, q: 1.5, attack: 0.5, reverb: 0.3 });
    noise(1.3, { gain: 0.2, from: 1800, to: 500, q: 3, delay: 0.25, attack: 0.4, reverb: 0.3 });
  },
  // Meteor: Heulen aus der Höhe, Einschlag, Geröll
  meteor: () => {
    noise(1.0, { gain: 0.3, from: 3600, to: 300, q: 2.5, attack: 0.5, reverb: 0.2 });
    tone(900, 1.0, { to: 110, gain: 0.1, type: 'sawtooth', attack: 0.4 });
    boom(0.7, 0.98, 1.4);
    crackle(1.1, { count: 30, gain: 0.3, from: 1500, delay: 1.0 });
    fire(1.2, 0.2, 1.0);
  },
  // Feuerwalze: Feuerwand rollt los
  walze: () => { fire(1.9, 0.4); boom(0.4, 0.05, 0.8); },
  // Frost: Splitter sirrt, Eis knackt und klirrt
  frost: () => {
    noise(0.5, { gain: 0.16, from: 5000, to: 9000, q: 4, attack: 0.1 });
    crackle(0.7, { count: 22, gain: 0.28, from: 4500, delay: 0.5, reverb: 0.3 });
    for (const [f, d] of [[1760, 0.5], [2217, 0.58], [2637, 0.66], [3520, 0.76]]) tone(f, 0.9, { gain: 0.05, delay: d, type: 'triangle', reverb: 0.6 });
    tone(140, 0.4, { to: 60, gain: 0.2, delay: 0.5 });
  },
  again: () => { wash(0.9, 0.24); tone(520, 0.16, { gain: 0.08, delay: 0.35, type: 'triangle', reverb: 0.3 }); tone(780, 0.26, { gain: 0.08, delay: 0.5, type: 'triangle', reverb: 0.3 }); },
  shield: () => {
    for (const [f, d] of [[330, 0], [440, 0.08], [660, 0.16]]) tone(f, 0.7, { gain: 0.08, delay: d, type: 'triangle', reverb: 0.5 });
    crackle(0.5, { count: 10, gain: 0.12, from: 1800, delay: 0.1 });
    noise(0.6, { gain: 0.1, from: 900, to: 3000, q: 3, attack: 0.2, reverb: 0.3 });
  },
  block: () => {
    noise(0.25, { gain: 0.4, from: 4200, to: 900, q: 1.2, type: 'highpass', attack: 0.002, reverb: 0.4 });
    tone(1200, 0.5, { to: 400, gain: 0.1, type: 'triangle', reverb: 0.5 });
    crackle(0.5, { count: 16, gain: 0.25, from: 3000, delay: 0.05, reverb: 0.3 });
  },
  swap: () => {
    noise(1.0, { gain: 0.16, from: 500, to: 3000, q: 5, attack: 0.4, reverb: 0.4 });
    tone(330, 0.5, { to: 880, gain: 0.08, reverb: 0.4 });
    tone(880, 0.5, { to: 330, gain: 0.08, delay: 0.4, reverb: 0.4 });
  },
  // Strahl: Knall, dann rollender Donner
  beam: () => {
    noise(0.12, { gain: 0.6, from: 5000, to: 1200, q: 0.6, type: 'highpass', attack: 0.001, reverb: 0.5 });
    crackle(0.4, { count: 14, gain: 0.35, from: 3500, reverb: 0.3 });
    noise(1.8, { gain: 0.5, from: 300, to: 60, q: 0.6, deep: true, type: 'lowpass', delay: 0.12, attack: 0.05, reverb: 0.7 });
    tone(70, 1.2, { to: 34, gain: 0.35, delay: 0.12, reverb: 0.5 });
  },
  // Weltereignis je Welt: Vulkan bricht aus, Welle bricht, Dickicht ächzt, Raum verzerrt sich
  erupt: (world = 0) => {
    if (world === 0) {
      boom(0.7, 0, 1.6);
      fire(2.6, 0.45, 0.1);
      boom(0.4, 0.9, 1);
    } else if (world === 1) {
      wash(2.6, 0.5);
      noise(2.2, { gain: 0.4, from: 140, to: 70, q: 0.6, deep: true, type: 'lowpass', attack: 0.8, reverb: 0.5 });
      boom(0.35, 1.3, 1);
    } else if (world === 2) {
      // Holz ächzt, Laub rauscht, Trommelschläge
      tone(90, 1.4, { to: 130, gain: 0.16, type: 'sawtooth', attack: 0.3, reverb: 0.4 });
      tone(67, 1.6, { to: 52, gain: 0.16, type: 'sawtooth', delay: 0.5, attack: 0.3, reverb: 0.4 });
      noise(2.2, { gain: 0.3, from: 2500, to: 5000, q: 0.6, type: 'highpass', attack: 0.7, reverb: 0.3 });
      crackle(2, { count: 36, gain: 0.3, from: 900, reverb: 0.3 });
      for (let i = 0; i < 5; i += 1) boom(0.3, i * 0.32, 0.3);
    } else {
      // tiefer Sog nach unten, darüber flirrende Obertöne
      tone(220, 2.6, { to: 30, gain: 0.3, type: 'sawtooth', attack: 0.4, reverb: 0.6 });
      tone(110, 2.6, { to: 24, gain: 0.3, attack: 0.4, reverb: 0.6 });
      noise(2.4, { gain: 0.25, from: 3000, to: 120, q: 4, attack: 0.5, reverb: 0.6 });
      for (let i = 0; i < 8; i += 1) tone(1400 + Math.random() * 2400, 0.5, { gain: 0.04, delay: Math.random() * 2, type: 'triangle', reverb: 0.8 });
    }
  },
  splash: () => { noise(0.3, { gain: 0.14, from: 1800, to: 600, q: 0.8, attack: 0.01, reverb: 0.3 }); tone(500, 0.08, { to: 1100, gain: 0.05 }); },
  dark: () => { tone(320, 1.2, { to: 50, gain: 0.16, reverb: 0.6 }); noise(1.2, { gain: 0.18, from: 2000, to: 150, q: 1, attack: 0.1, reverb: 0.5 }); },
  light: () => { tone(200, 0.6, { to: 800, gain: 0.1, reverb: 0.5 }); tone(1200, 0.5, { gain: 0.04, delay: 0.3, type: 'triangle', reverb: 0.7 }); },
  turn: () => { tone(660, 0.14, { gain: 0.1, type: 'triangle', reverb: 0.3 }); tone(990, 0.26, { gain: 0.1, delay: 0.11, type: 'triangle', reverb: 0.4 }); },
  win: () => {
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.5, { gain: 0.12, delay: i * 0.13, type: 'triangle', reverb: 0.5 }));
    crackle(1.2, { count: 30, gain: 0.2, from: 3000, delay: 0.5, reverb: 0.4 });
  },
  lose: () => [392, 330, 262].forEach((f, i) => tone(f, 0.5, { gain: 0.1, delay: i * 0.2, type: 'triangle', reverb: 0.4 })),
};

// ── Hintergrundklang je Welt ────────────────────────────────────────────────────────────────
let amb = null; // { world, gain, nodes, timer }

function stopAmb(fade = 1.2) {
  if (!amb || !ctx) return;
  const old = amb;
  amb = null;
  clearInterval(old.timer);
  old.gain.gain.cancelScheduledValues(ctx.currentTime);
  old.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, fade / 4);
  setTimeout(() => {
    old.nodes.forEach((n) => {
      try { n.stop(); } catch { /* lief nie */ }
    });
    old.gain.disconnect();
  }, fade * 1000 + 300);
}

/** Hintergrundklang der Welt starten (blendet den alten aus). world < 0: aus. */
export function ambience(world) {
  if (amb && amb.world === world) return;
  stopAmb();
  const a = world >= 0 ? audio() : null;
  if (!a) return;
  const gain = a.createGain();
  gain.gain.value = 0.0001;
  gain.gain.setTargetAtTime(1, a.currentTime, 0.6);
  gain.connect(master);
  const nodes = [];
  // Dauerrauschen durch einen Filter, optional langsam an- und abschwellend
  const bed = (buffer, type, freq, q, level, lfoHz = 0, lfoDepth = 0) => {
    const src = a.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const f = a.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = a.createGain();
    g.gain.value = level;
    src.connect(f).connect(g).connect(gain);
    src.start(a.currentTime, Math.random() * 1.5);
    nodes.push(src);
    if (lfoHz) {
      const lfo = a.createOscillator();
      lfo.frequency.value = lfoHz;
      const depth = a.createGain();
      depth.gain.value = lfoDepth;
      lfo.connect(depth).connect(g.gain);
      lfo.start();
      nodes.push(lfo);
    }
  };
  const drone = (freq, level) => {
    const o = a.createOscillator();
    o.frequency.value = freq;
    const g = a.createGain();
    g.gain.value = level;
    o.connect(g).connect(gain);
    o.start();
    nodes.push(o);
  };
  let tick = () => {};
  if (world === 0) {
    bed(brown, 'lowpass', 120, 0.5, 0.22, 0.13, 0.08); // Grollen
    bed(white, 'bandpass', 700, 0.4, 0.012); // Glut
    tick = () => crackle(1.4, { count: 5, gain: 0.07, from: 2600, reverb: 0.15 });
  } else if (world === 1) {
    bed(white, 'bandpass', 500, 0.5, 0.035, 0.11, 0.03); // Brandung
    bed(brown, 'lowpass', 200, 0.5, 0.12, 0.09, 0.06);
    tick = () => {
      if (Math.random() < 0.3) {
        // Möwe
        tone(1500, 0.22, { to: 2100, gain: 0.018, type: 'triangle', reverb: 0.6 });
        tone(1900, 0.3, { to: 1300, gain: 0.018, delay: 0.2, type: 'triangle', reverb: 0.6 });
      }
    };
  } else if (world === 2) {
    bed(white, 'highpass', 4500, 0.5, 0.008, 0.2, 0.004); // Laub
    bed(white, 'bandpass', 5200, 14, 0.02, 7, 0.02); // Grillen
    tick = () => {
      if (Math.random() < 0.5) {
        // Vogel: zwei bis vier kurze Pfiffe
        const base = 1800 + Math.random() * 1400;
        for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i += 1) tone(base, 0.09, { to: base * 1.3, gain: 0.02, delay: i * 0.13, reverb: 0.5 });
      }
    };
  } else {
    drone(55, 0.035);
    drone(55.6, 0.035); // leichte Schwebung
    drone(82.4, 0.02);
    bed(white, 'bandpass', 2400, 8, 0.006, 0.07, 0.005);
    tick = () => {
      if (Math.random() < 0.5) tone(900 + Math.random() * 2200, 1.4, { gain: 0.012, type: 'triangle', attack: 0.4, reverb: 0.9 });
    };
  }
  amb = { world, gain, nodes, timer: setInterval(() => { if (!muted) tick(); }, 1400) };
}

export function setMuted(v) {
  muted = !!v;
  try {
    localStorage.setItem(KEY, muted ? '1' : '0');
  } catch {
    /* nicht gemerkt */
  }
  if (muted) stopAmb(0.2);
}
