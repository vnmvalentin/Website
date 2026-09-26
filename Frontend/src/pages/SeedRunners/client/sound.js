// Ton: alle Klänge werden mit der Web Audio API erzeugt, es gibt keine Audiodateien.
//
// Warum synthetisiert: keine Ladezeit, kein Lizenzthema, und die Klänge lassen sich hier im Text
// abstimmen. Jeder Klang ist eine Handvoll Töne (Oszillatoren mit Frequenzverlauf) und Rauschen
// (gefiltert), alle mit kurzer Hüllkurve.
//
// Der AudioContext darf erst nach einer Nutzeraktion laufen (Autoplay-Regel der Browser): `resume()`
// wird vom ersten Tastendruck oder Klick aufgerufen. Vorher ist `play()` ein No-Op.
//
// Räumlichkeit: Ereignisse mit Ort (Laser, Block, Portal …) kommen mit `gain` (Entfernung zur
// Kamera) und `pan` (links/rechts) an; Ereignisse der Figur selbst spielen mit voller Lautstärke.

const MIN_GAP_MS = {
  crumbleStart: 90, crumbleGone: 60, blockShake: 250, laserWarn: 110, laserOn: 90, gust: 400,
  land: 60, jump: 40, tick: 0, go: 0,
};

export function createSound() {
  let ctx = null;
  let master = null;
  let noise = null;
  let volume = 0.6;
  let muted = false;
  const last = new Map();

  function ensure() {
    if (ctx) return ctx;
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return null;
    try {
      ctx = new AC();
    } catch {
      return null;
    }
    master = ctx.createGain();
    master.gain.value = muted ? 0 : volume * 0.5;
    // Der Kompressor fängt Spitzen ab, wenn viele Klänge zugleich laufen (Tod, Ring, Checkpoint …)
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp);
    comp.connect(ctx.destination);
    // Eine Sekunde weißes Rauschen als Grundlage aller Geräusche
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return ctx;
  }

  const applyVolume = () => {
    if (master) master.gain.setTargetAtTime(muted ? 0 : volume * 0.5, ctx.currentTime, 0.02);
  };

  /** Ton: Oszillator mit Frequenzverlauf f0 → f1 und Hüllkurve. */
  function tone(type, f0, f1, dur, vol, o = {}) {
    const t0 = ctx.currentTime + (o.delay || 0);
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t0);
    if (f1 && f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const g = ctx.createGain();
    const peak = Math.max(0.0002, vol * (o.gain ?? 1));
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + (o.attack ?? 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    let out = g;
    if (o.pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = o.pan;
      g.connect(p);
      out = p;
    }
    if (o.vibrato) {
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = o.vibrato;
      depth.gain.value = f0 * 0.06;
      lfo.connect(depth);
      depth.connect(osc.frequency);
      lfo.start(t0);
      lfo.stop(t0 + dur + 0.02);
    }
    out.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /** Rauschen durch ein Filter mit Frequenzverlauf f0 → f1. */
  function hiss(filter, f0, f1, dur, vol, o = {}) {
    const t0 = ctx.currentTime + (o.delay || 0);
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const flt = ctx.createBiquadFilter();
    flt.type = filter;
    flt.Q.value = o.q ?? 1;
    flt.frequency.setValueAtTime(f0, t0);
    if (f1 && f1 !== f0) flt.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const g = ctx.createGain();
    const peak = Math.max(0.0002, vol * (o.gain ?? 1));
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + (o.attack ?? 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(flt);
    flt.connect(g);
    let out = g;
    if (o.pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = o.pan;
      g.connect(p);
      out = p;
    }
    out.connect(master);
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + dur + 0.02);
  }

  // Alle Klänge. `o` = { gain, pan, impact }
  const SOUNDS = {
    jump: (o) => tone('triangle', 230, 470, 0.1, 0.2, o),
    doubleJump: (o) => { tone('triangle', 340, 700, 0.11, 0.2, o); tone('sine', 1050, 1400, 0.08, 0.08, { ...o, delay: 0.03 }); },
    wallJump: (o) => { hiss('bandpass', 1400, 600, 0.06, 0.16, { ...o, q: 2 }); tone('triangle', 250, 420, 0.09, 0.16, o); },
    land: (o) => {
      const k = Math.min(1, Math.max(0.15, (o.impact ?? 250) / 420));
      tone('sine', 130, 55, 0.1, 0.3 * k, o);
      hiss('lowpass', 900, 200, 0.09, 0.25 * k, o);
    },
    dash: (o) => { hiss('bandpass', 500, 2600, 0.15, 0.2, { ...o, q: 1.5 }); tone('sawtooth', 190, 95, 0.1, 0.05, o); },
    death: (o) => { tone('sawtooth', 320, 55, 0.36, 0.18, o); hiss('lowpass', 1800, 180, 0.32, 0.22, o); },
    restart: (o) => tone('sine', 420, 210, 0.09, 0.12, o),
    checkpoint: (o) => {
      tone('sine', 660, 660, 0.14, 0.2, o);
      tone('sine', 880, 880, 0.2, 0.2, { ...o, delay: 0.1 });
      tone('triangle', 1320, 1320, 0.25, 0.07, { ...o, delay: 0.1 });
    },
    finish: (o) => {
      [523, 659, 784, 1047].forEach((f, i) => {
        tone('triangle', f, f, 0.2, 0.2, { ...o, delay: i * 0.11 });
        tone('sine', f * 2, f * 2, 0.18, 0.06, { ...o, delay: i * 0.11 });
      });
      [523, 659, 784, 1047].forEach((f) => tone('triangle', f, f, 0.7, 0.1, { ...o, delay: 0.5 }));
    },
    crystal: (o) => { tone('sine', 880, 1760, 0.12, 0.2, o); tone('sine', 1320, 1320, 0.16, 0.1, { ...o, delay: 0.05 }); },
    ring: (o) => { hiss('bandpass', 700, 3200, 0.2, 0.18, { ...o, q: 1.2 }); tone('sine', 520, 1040, 0.16, 0.18, o); },
    spring: (o) => { tone('sine', 170, 560, 0.2, 0.25, { ...o, vibrato: 14 }); hiss('highpass', 2500, 2500, 0.03, 0.1, o); },
    crumbleStart: (o) => hiss('lowpass', 500, 300, 0.14, 0.12, o),
    crumbleGone: (o) => { hiss('bandpass', 350, 200, 0.22, 0.16, { ...o, q: 0.8 }); tone('sine', 120, 60, 0.15, 0.1, o); },
    blockShake: (o) => { tone('square', 55, 52, 0.32, 0.07, o); tone('square', 58, 55, 0.32, 0.06, o); },
    blockLand: (o) => { tone('sine', 95, 38, 0.26, 0.4, o); hiss('lowpass', 900, 150, 0.22, 0.35, o); },
    portal: (o) => {
      tone('sine', 400, 900, 0.3, 0.14, o);
      tone('sine', 406, 912, 0.3, 0.14, o);
      tone('triangle', 1200, 300, 0.24, 0.08, { ...o, delay: 0.04 });
    },
    switch: (o) => { tone('square', 880, 880, 0.03, 0.12, o); tone('square', 620, 620, 0.05, 0.12, { ...o, delay: 0.04 }); },
    key: (o) => { tone('sine', 1200, 1200, 0.07, 0.18, o); tone('sine', 1650, 1650, 0.12, 0.18, { ...o, delay: 0.07 }); },
    doorOpen: (o) => { tone('sawtooth', 90, 150, 0.32, 0.08, o); hiss('lowpass', 500, 300, 0.26, 0.18, o); tone('sine', 110, 50, 0.15, 0.25, { ...o, delay: 0.28 }); },
    grappleAttach: (o) => { tone('square', 1500, 900, 0.06, 0.1, o); hiss('highpass', 3000, 3000, 0.02, 0.1, o); },
    grappleRelease: (o) => tone('triangle', 620, 300, 0.08, 0.1, o),
    gravity: (o) => { tone('sine', 320, 140, 0.16, 0.16, o); tone('sine', 140, 330, 0.16, 0.16, { ...o, delay: 0.16 }); },
    laserWarn: (o) => tone('sine', 1500, 1500, 0.045, 0.07, o),
    laserOn: (o) => { hiss('bandpass', 3200, 1400, 0.12, 0.12, { ...o, q: 2 }); tone('square', 95, 90, 0.1, 0.06, o); },
    gust: (o) => hiss('bandpass', 450, 950, 0.5, 0.12, { ...o, q: 0.8, attack: 0.15 }),
    tick: (o) => tone('sine', 660, 660, 0.07, 0.16, o),
    go: (o) => { tone('sine', 990, 990, 0.22, 0.2, o); tone('triangle', 1980, 1980, 0.2, 0.06, o); },
  };

  return {
    /** Beim ersten Tastendruck/Klick aufrufen (Autoplay-Regel). */
    resume() {
      const c = ensure();
      if (c && c.state === 'suspended') c.resume().catch(() => {});
    },
    /** @param {string} name  Klang; @param {{gain?: number, pan?: number, impact?: number}} [opts] */
    play(name, opts = {}) {
      if (!ctx || ctx.state !== 'running' || muted || volume <= 0) return;
      const fn = SOUNDS[name];
      if (!fn) return;
      const now = performance.now();
      const gap = MIN_GAP_MS[name] ?? 25;
      if (now - (last.get(name) || 0) < gap) return;
      last.set(name, now);
      try {
        fn(opts);
      } catch { /* ein misslungener Klang darf das Spiel nie stören */ }
    },
    setVolume(v) {
      volume = Math.min(1, Math.max(0, v));
      applyVolume();
    },
    setMuted(m) {
      muted = !!m;
      applyVolume();
    },
    get sounds() { return Object.keys(SOUNDS); },
  };
}

// Eine gemeinsame Instanz für die ganze Seite: Browser erlauben nur wenige AudioContexts, und der
// erste Tastendruck in der Lobby soll den Ton auch für das Rennen freischalten.
export const sharedSound = createSound();
