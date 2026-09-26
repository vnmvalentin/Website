// audio/sound.js — Sound-Manager von Sacrifice & Sigils.
//
// Alle Klänge entstehen prozedural per Web Audio API (keine Audiodateien nötig). Liegt eine Datei
// public/assets/sfx/<key>.ogg vor, wird sie stattdessen benutzt (einmal per HEAD geprüft und dann gecacht).
// Kanäle: Gesamt → Effekte / Ambient. Einstellungen in localStorage. Audio startet erst nach der ersten
// Nutzerinteraktion (Autoplay-Regeln der Browser): unlock() wird von der Hülle bei pointerdown/keydown aufgerufen.

const STORE_KEY = "ss_audio_v1";
const DEFAULTS = { master: 0.8, sfx: 0.85, ambient: 0.45, muted: false };

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

class SoundManager {
  constructor() {
    /** @type {AudioContext|null} */
    this.ctx = null;
    this.settings = loadSettings();
    this.listeners = new Set();
    /** @type {Map<string, AudioBuffer|null|Promise<any>>} */
    this.overrides = new Map();
    this.ambientNodes = null;
    this.tension = 0;
    this.ambientWanted = false;
    this.noiseBuf = null;
    this.reverb = null;
  }

  // ───────── Einstellungen ─────────

  /** @param {Partial<typeof DEFAULTS>} patch */
  set(patch) {
    this.settings = { ...this.settings, ...patch };
    try { localStorage.setItem(STORE_KEY, JSON.stringify(this.settings)); } catch { /* privat/voll */ }
    this.applyGains();
    this.listeners.forEach((fn) => fn(this.settings));
  }

  /** @param {(s: any) => void} fn */
  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  applyGains() {
    if (!this.ctx) return;
    const s = this.settings;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.muted ? 0 : s.master, t, 0.05);
    this.sfx.gain.setTargetAtTime(s.sfx, t, 0.05);
    this.amb.gain.setTargetAtTime(s.ambient, t, 0.3);
  }

  // ───────── Start ─────────

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);
    this.amb = ctx.createGain();
    this.amb.connect(this.master);
    // Nachhall aus abklingendem Rauschen
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(2.4, 2.8);
    this.reverbGain = ctx.createGain();
    this.reverbGain.gain.value = 0.35;
    this.reverb.connect(this.reverbGain);
    this.reverbGain.connect(this.sfx);
    this.noiseBuf = this.makeNoise(2);
    this.applyGains();
    if (this.ambientWanted) this.startAmbient();
  }

  /** @param {number} seconds @param {number} decay */
  impulse(seconds, decay) {
    const ctx = /** @type {AudioContext} */ (this.ctx);
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  /** @param {number} seconds */
  makeNoise(seconds) {
    const ctx = /** @type {AudioContext} */ (this.ctx);
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // ───────── Bausteine ─────────

  /** Rauschquelle mit Filter und Hüllkurve. */
  noise({ t = 0, dur = 0.2, type = "bandpass", freq = 1000, q = 1, gain = 0.3, attack = 0.005, sweepTo = 0, dest = null, reverb = 0 }) {
    const ctx = /** @type {AudioContext} */ (this.ctx);
    const start = ctx.currentTime + t;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = /** @type {BiquadFilterType} */ (type);
    f.frequency.setValueAtTime(freq, start);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(20, sweepTo), start + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(f);
    f.connect(g);
    g.connect(dest || this.sfx);
    if (reverb) {
      const rg = ctx.createGain();
      rg.gain.value = reverb;
      g.connect(rg);
      rg.connect(/** @type {ConvolverNode} */ (this.reverb));
    }
    src.start(start, Math.random() * 1.5);
    src.stop(start + dur + 0.05);
  }

  /** Oszillator mit Tonhöhenverlauf und Hüllkurve. */
  tone({ t = 0, dur = 0.3, type = "sine", freq = 220, to = 0, gain = 0.3, attack = 0.005, dest = null, reverb = 0, detune = 0 }) {
    const ctx = /** @type {AudioContext} */ (this.ctx);
    const start = ctx.currentTime + t;
    const o = ctx.createOscillator();
    o.type = /** @type {OscillatorType} */ (type);
    o.frequency.setValueAtTime(freq, start);
    if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + dur);
    o.detune.value = detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g);
    g.connect(dest || this.sfx);
    if (reverb) {
      const rg = ctx.createGain();
      rg.gain.value = reverb;
      g.connect(rg);
      rg.connect(/** @type {ConvolverNode} */ (this.reverb));
    }
    o.start(start);
    o.stop(start + dur + 0.05);
  }

  // ───────── Abspielen ─────────

  /**
   * @param {string} key
   * @param {{ amount?: number }} [opts]
   */
  play(key, opts = {}) {
    if (!this.ctx || this.settings.muted) return;
    const ov = this.overrides.get(key);
    if (ov === undefined) this.probeOverride(key);
    else if (ov && !(ov instanceof Promise)) {
      const src = this.ctx.createBufferSource();
      src.buffer = ov;
      src.connect(this.sfx);
      src.start();
      return;
    }
    const synth = SYNTHS[key];
    if (synth) {
      try { synth(this, opts); } catch { /* ein kaputter Klang darf das Spiel nie stören */ }
    }
  }

  /** Prüft einmal, ob public/assets/sfx/<key>.ogg existiert. @param {string} key */
  probeOverride(key) {
    const url = `/assets/sfx/${key}.ogg`;
    const p = fetch(url)
      .then((r) => {
        const type = r.headers.get("content-type") || "";
        if (!r.ok || !type.includes("audio")) return null;
        return r.arrayBuffer().then((b) => /** @type {AudioContext} */ (this.ctx).decodeAudioData(b));
      })
      .then((buf) => this.overrides.set(key, buf || null))
      .catch(() => this.overrides.set(key, null));
    this.overrides.set(key, p);
  }

  // ───────── Ambient ─────────

  setAmbient(on) {
    this.ambientWanted = on;
    if (!this.ctx) return;
    if (on) this.startAmbient();
    else this.stopAmbient();
  }

  startAmbient() {
    if (!this.ctx || this.ambientNodes) return;
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 320;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setTargetAtTime(0.16, ctx.currentTime, 2);
    lp.connect(g);
    g.connect(this.amb);
    const o1 = ctx.createOscillator();
    o1.type = "sawtooth";
    o1.frequency.value = 55;
    const o2 = ctx.createOscillator();
    o2.type = "sawtooth";
    o2.frequency.value = 55.6;
    const o3 = ctx.createOscillator();
    o3.type = "triangle";
    o3.frequency.value = 77.8; // Tritonus – nur in der Spannungsschicht hörbar
    const g3 = ctx.createGain();
    g3.gain.value = 0;
    o1.connect(lp);
    o2.connect(lp);
    o3.connect(g3);
    g3.connect(lp);
    // langsames Atmen des Filters
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 90;
    lfo.connect(lfoG);
    lfoG.connect(lp.frequency);
    [o1, o2, o3, lfo].forEach((o) => o.start());
    const timer = setInterval(() => this.ambientTick(), 700);
    this.ambientNodes = { o1, o2, o3, g3, lfo, g, timer, beat: 0 };
    this.setTension(this.tension);
  }

  stopAmbient() {
    const n = this.ambientNodes;
    if (!n || !this.ctx) return;
    clearInterval(n.timer);
    n.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
    const stopAt = this.ctx.currentTime + 2;
    [n.o1, n.o2, n.o3, n.lfo].forEach((o) => o.stop(stopAt));
    this.ambientNodes = null;
  }

  ambientTick() {
    if (!this.ctx || this.settings.muted) return;
    const r = Math.random();
    const dest = this.amb;
    if (r < 0.28) SYNTHS.crackle(this, { dest, soft: true });
    else if (r < 0.34) this.noise({ dur: 3.5, type: "bandpass", freq: 400, sweepTo: 900, q: 0.7, gain: 0.05, attack: 1.4, dest });
    else if (r < 0.4) this.tone({ freq: 1400 + Math.random() * 500, to: 700, dur: 0.18, gain: 0.05, dest, reverb: 0.6 });
    // Herzschlag bei Spannung
    if (this.tension >= 4 && this.ambientNodes) {
      this.ambientNodes.beat += 1;
      SYNTHS.heartbeat(this, { dest });
    }
  }

  /** Spannung 0–5 (Waage-Vorsprung des Gegners o. Ä.): Dissonanz und Herzschlag. @param {number} level */
  setTension(level) {
    this.tension = level;
    const n = this.ambientNodes;
    if (!n || !this.ctx) return;
    const t = this.ctx.currentTime;
    n.g3.gain.setTargetAtTime(level >= 3 ? 0.25 + (level - 3) * 0.2 : 0, t, 1.2);
    n.o2.frequency.setTargetAtTime(55.6 + Math.max(0, level - 2) * 1.4, t, 1.5);
  }
}

// ───────────────────────── Synth-Funktionen je Sound-Key ─────────────────────────

/** @type {Record<string, (m: SoundManager, o: any) => void>} */
const SYNTHS = {
  // Papierrascheln
  draw(m) {
    m.noise({ dur: 0.16, type: "bandpass", freq: 3200, q: 0.8, gain: 0.18, sweepTo: 1800 });
    m.noise({ t: 0.05, dur: 0.12, type: "highpass", freq: 4500, gain: 0.08 });
  },
  // Holz-Thump beim Ablegen
  place(m) {
    m.tone({ freq: 120, to: 55, dur: 0.22, gain: 0.5, type: "sine" });
    m.noise({ dur: 0.08, type: "lowpass", freq: 600, gain: 0.25 });
    m.tone({ freq: 340, to: 200, dur: 0.06, gain: 0.08, type: "triangle" });
  },
  // Riss + tiefer Hall-Schwell
  sacrifice(m) {
    m.noise({ dur: 0.35, type: "bandpass", freq: 1800, sweepTo: 500, q: 1.4, gain: 0.3 });
    m.tone({ t: 0.08, freq: 70, to: 45, dur: 1.4, gain: 0.3, attack: 0.4, reverb: 0.9 });
  },
  // Knochen: 2–3 klackernde Klicks
  bones(m) {
    const n = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
      const f = 900 + Math.random() * 900;
      m.tone({ t: i * 0.07 + Math.random() * 0.02, freq: f, to: f * 0.7, dur: 0.05, gain: 0.2, type: "square" });
      m.noise({ t: i * 0.07, dur: 0.03, type: "highpass", freq: 3000, gain: 0.1 });
    }
  },
  // Whoosh + dumpfer Schlag, Tonhöhe skaliert mit dem Schaden
  attack(m, o) {
    const dmg = Math.max(1, Math.min(8, o.amount || 1));
    m.noise({ dur: 0.18, type: "bandpass", freq: 700, sweepTo: 2400, q: 0.9, gain: 0.16 });
    m.tone({ t: 0.14, freq: 150 - dmg * 10, to: 40, dur: 0.25, gain: 0.35 + dmg * 0.04 });
    m.noise({ t: 0.14, dur: 0.1, type: "lowpass", freq: 900, gain: 0.25 });
  },
  hit(m, o) {
    const dmg = Math.max(1, Math.min(8, o.amount || 1));
    m.tone({ freq: 180 - dmg * 12, to: 50, dur: 0.2, gain: 0.3 + dmg * 0.03 });
    m.noise({ dur: 0.07, type: "lowpass", freq: 1200, gain: 0.2 });
  },
  wing(m) {
    for (let i = 0; i < 3; i++) m.noise({ t: i * 0.11, dur: 0.09, type: "bandpass", freq: 500, q: 1.2, gain: 0.18, sweepTo: 260 });
  },
  splash(m) {
    m.noise({ dur: 0.5, type: "lowpass", freq: 2500, sweepTo: 300, gain: 0.25 });
    for (let i = 0; i < 4; i++) m.tone({ t: 0.1 + i * 0.06 + Math.random() * 0.05, freq: 500 + Math.random() * 600, to: 1500, dur: 0.05, gain: 0.05 });
  },
  crackle(m, o = {}) {
    const n = o.soft ? 3 : 7;
    for (let i = 0; i < n; i++) m.noise({ t: Math.random() * (o.soft ? 0.5 : 0.6), dur: 0.02, type: "highpass", freq: 2000 + Math.random() * 3000, gain: o.soft ? 0.05 : 0.14, dest: o.dest });
  },
  fire(m) {
    m.noise({ dur: 1.1, type: "lowpass", freq: 700, gain: 0.12, attack: 0.3 });
    SYNTHS.crackle(m, {});
  },
  needle(m) {
    m.tone({ freq: 3200, to: 2400, dur: 0.05, gain: 0.08, type: "triangle" });
    m.noise({ t: 0.02, dur: 0.05, type: "highpass", freq: 6000, gain: 0.07 });
  },
  chain(m) {
    for (let i = 0; i < 4; i++) {
      const f = 1800 + Math.random() * 1600;
      m.tone({ t: i * 0.05 + Math.random() * 0.03, freq: f, to: f * 0.98, dur: 0.25, gain: 0.05, type: "sine" });
      m.tone({ t: i * 0.05, freq: f * 2.7, dur: 0.12, gain: 0.02, type: "sine" });
    }
  },
  creak(m) {
    m.tone({ freq: 90, to: 140, dur: 0.5, gain: 0.07, type: "sawtooth", attack: 0.12 });
    m.noise({ dur: 0.45, type: "bandpass", freq: 700, q: 6, gain: 0.05, sweepTo: 1100 });
  },
  scale(m) {
    SYNTHS.creak(m, {});
    SYNTHS.chain(m, {});
  },
  weight(m) {
    m.tone({ freq: 260, to: 120, dur: 0.18, gain: 0.25, type: "triangle" });
    m.tone({ t: 0.02, freq: 1400, to: 1300, dur: 0.3, gain: 0.05 });
  },
  seal(m) {
    m.noise({ dur: 0.05, type: "bandpass", freq: 1400, q: 2, gain: 0.2 });
    m.tone({ freq: 240, to: 160, dur: 0.07, gain: 0.12 });
  },
  coins(m) {
    for (let i = 0; i < 4; i++) {
      const f = 2600 + Math.random() * 1400;
      m.tone({ t: i * 0.07 + Math.random() * 0.03, freq: f, to: f * 1.01, dur: 0.22, gain: 0.07 });
    }
  },
  death(m) {
    m.noise({ dur: 0.45, type: "bandpass", freq: 1500, q: 0.6, gain: 0.22, sweepTo: 400 });
    m.noise({ t: 0.15, dur: 0.25, type: "highpass", freq: 2500, gain: 0.06 });
  },
  heartbeat(m, o = {}) {
    m.tone({ freq: 60, to: 40, dur: 0.16, gain: 0.35, dest: o.dest });
    m.tone({ t: 0.22, freq: 55, to: 38, dur: 0.14, gain: 0.25, dest: o.dest });
  },
  transform(m) {
    m.noise({ dur: 0.8, type: "lowpass", freq: 500, sweepTo: 2500, gain: 0.16, attack: 0.3 });
    m.tone({ t: 0.5, freq: 330, to: 660, dur: 0.4, gain: 0.08, reverb: 0.5 });
  },
  victory(m) {
    [262, 330, 392, 523].forEach((f, i) => m.tone({ t: i * 0.16, freq: f, dur: 1.2, gain: 0.12, type: "triangle", reverb: 0.8 }));
  },
  defeat(m) {
    [220, 208, 196, 147].forEach((f, i) => m.tone({ t: i * 0.25, freq: f, dur: 1.4, gain: 0.12, type: "triangle", reverb: 0.8 }));
  },
  turn(m) {
    m.tone({ freq: 520, dur: 0.5, gain: 0.05, type: "sine", reverb: 0.7 });
  },
  error(m) {
    m.tone({ freq: 140, to: 110, dur: 0.15, gain: 0.12, type: "square" });
  },
};

export const SOUND_KEYS = Object.keys(SYNTHS);
export const sound = new SoundManager();
