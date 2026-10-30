// audio.js — sämtlicher Ton per WebAudio erzeugt, ohne Dateien.
// Räumliche Geräusche (Monster, Scheinschritte) laufen über PannerNodes (HRTF):
// man hört, ob etwas hinter einem ist.

function noiseBuffer(ctx, seconds, brown = false) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    } else d[i] = w;
  }
  return buf;
}

/** Nachhall aus abklingendem Rauschen — macht aus trockenen Klicks einen Kellerraum. */
function impulse(ctx, seconds, decay) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

function distortionCurve(amount) {
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((3 + amount) * x * 20 * (Math.PI / 180)) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}

export function createAudio(volume = 0.8) {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  const ctx = new AC();
  const master = ctx.createGain();
  master.gain.value = volume;
  master.connect(ctx.destination);

  const reverb = ctx.createConvolver();
  reverb.buffer = impulse(ctx, 2.6, 2.4);
  const wet = ctx.createGain();
  wet.gain.value = 0.35;
  reverb.connect(wet).connect(master);

  const white = noiseBuffer(ctx, 2);
  const brown = noiseBuffer(ctx, 4, true);
  const listener = ctx.listener;

  /** Ausgang mit trockenem und verhalltem Anteil. */
  const out = (dry = 1, rev = 1) => {
    const g = ctx.createGain();
    const d = ctx.createGain();
    d.gain.value = dry;
    const r = ctx.createGain();
    r.gain.value = rev;
    g.connect(d).connect(master);
    g.connect(r).connect(reverb);
    return g;
  };

  const panner = (x, y, z) => {
    const p = ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = 2;
    p.rolloffFactor = 1.4;
    p.maxDistance = 60;
    p.positionX.value = x;
    p.positionY.value = y;
    p.positionZ.value = z;
    return p;
  };

  const noiseHit = (dest, t, dur, freq, q, gain, buffer = white) => {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  };

  const tone = (dest, t, type, f0, f1, dur, gain) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  };

  // ── Dauergeräusche ──────────────────────────────────────────────────────
  let ambience = null;
  /** theme: 'halls' (Lüftung + Brummen), 'forest'/'garden' (Wind, kaum Brummen), 'cellar' (tiefer, feuchter) */
  const startAmbience = (themeName = 'halls') => {
    if (ambience) return;
    // Der Garten klingt wie der Wald: Wind unter freiem Himmel
    const theme = themeName === 'garden' ? 'forest' : themeName;
    const bus = out(0.9, 0.6);
    bus.gain.value = 0;
    bus.gain.linearRampToValueAtTime(1, ctx.currentTime + 3);
    // Lüftungsrauschen bzw. Wind im Wald
    const wind = ctx.createBufferSource();
    wind.buffer = brown;
    wind.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = theme === 'forest' ? 900 : theme === 'cellar' ? 260 : 380;
    const wg = ctx.createGain();
    wg.gain.value = theme === 'forest' ? 0.32 : 0.22;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 160;
    lfo.connect(lfoGain).connect(lp.frequency);
    wind.connect(lp).connect(wg).connect(bus);
    // Tiefes Brummen, leicht gegeneinander verstimmt
    const drones = [41, 41.6, 61.7].map((f) => {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = theme === 'forest' ? 0.012 : theme === 'cellar' ? 0.07 : 0.05;
      o.connect(g).connect(bus);
      o.start();
      return o;
    });
    wind.start();
    lfo.start();
    // Herzschlag und Verfolgungsdröhnen hängen am selben Bus und werden über ihre Lautstärke geregelt
    const chase = ctx.createGain();
    chase.gain.value = 0;
    chase.connect(master);
    const chaseOsc = [55, 58.3, 82.4].map((f) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      const lp2 = ctx.createBiquadFilter();
      lp2.type = 'lowpass';
      lp2.frequency.value = 300;
      const g = ctx.createGain();
      g.gain.value = 0.06;
      o.connect(lp2).connect(g).connect(chase);
      o.start();
      return o;
    });
    ambience = { bus, sources: [wind, lfo, ...drones, ...chaseOsc], chase };
  };

  /** Blendet die Grundstimmung aus — beim Wechsel in die nächste Ebene (die bringt ihre eigene mit). */
  const stopAmbience = () => {
    if (!ambience) return;
    const a = ambience;
    ambience = null;
    const t = ctx.currentTime;
    a.bus.gain.setTargetAtTime(0, t, 0.25);
    a.chase.gain.setTargetAtTime(0, t, 0.1);
    setTimeout(() => {
      try {
        a.sources.forEach((s) => s.stop());
        a.bus.disconnect();
        a.chase.disconnect();
      } catch { /* schon gestoppt */ }
    }, 1500);
  };

  let heartAt = 0;
  let footstepFlip = false;

  return {
    ctx,
    resume() { if (ctx.state === 'suspended') ctx.resume(); },
    setVolume(v) { master.gain.value = v; },
    startAmbience,
    stopAmbience,

    /** Glas knirscht unter dem Fuß. */
    crunch(loud = 1) {
      const t = ctx.currentTime;
      const dest = out(1, 0.5);
      for (let i = 0; i < 5; i++) noiseHit(dest, t + i * 0.025 + Math.random() * 0.02, 0.04, 3500 + Math.random() * 3000, 3, 0.35 * loud);
      tone(dest, t, 'triangle', 4200, 3800, 0.06, 0.04 * loud);
    },

    /**
     * Motor fürs Intro. Gibt eine Steuerung zurück: set(drehzahl 0..1), stop().
     */
    engine() {
      const t = ctx.currentTime;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.32, t + 0.8);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 420;
      g.connect(master);
      lp.connect(g);
      const oscs = [1, 2.02, 0.5].map((m, i) => {
        const o = ctx.createOscillator();
        o.type = i === 2 ? 'sine' : 'sawtooth';
        o.frequency.value = 38 * m;
        const og = ctx.createGain();
        og.gain.value = i === 2 ? 0.5 : 0.18;
        o.connect(og).connect(lp);
        o.start(t);
        return { o, m };
      });
      const rumble = ctx.createBufferSource();
      rumble.buffer = brown;
      rumble.loop = true;
      const rg = ctx.createGain();
      rg.gain.value = 0.5;
      rumble.connect(rg).connect(lp);
      rumble.start(t);
      return {
        set(rpm) {
          const now = ctx.currentTime;
          for (const { o, m } of oscs) o.frequency.setTargetAtTime((32 + rpm * 40) * m, now, 0.2);
          lp.frequency.setTargetAtTime(300 + rpm * 500, now, 0.2);
        },
        stop() {
          const now = ctx.currentTime;
          g.gain.setTargetAtTime(0, now, 0.25);
          for (const { o } of oscs) o.frequency.setTargetAtTime(15, now, 0.3);
          setTimeout(() => {
            try {
              oscs.forEach(({ o }) => o.stop());
              rumble.stop();
              g.disconnect();
            } catch { /* schon gestoppt */ }
          }, 1600);
        },
      };
    },

    /** Autotür fällt zu. */
    doorSlam() {
      const t = ctx.currentTime;
      const dest = out(1, 0.6);
      tone(dest, t, 'sine', 90, 40, 0.3, 0.7);
      noiseHit(dest, t, 0.15, 600, 1, 0.6);
      noiseHit(dest, t + 0.02, 0.05, 3000, 3, 0.3);
    },

    /** Altes Gartentor quietscht und fällt ins Schloss. */
    gateCreak() {
      const t = ctx.currentTime;
      const dest = out(0.8, 1);
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(380, t);
      o.frequency.linearRampToValueAtTime(260, t + 0.9);
      o.frequency.linearRampToValueAtTime(420, t + 1.3);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 900;
      bp.Q.value = 6;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.12, t + 0.1);
      g.gain.setValueAtTime(0.12, t + 1.2);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
      o.connect(bp).connect(g).connect(dest);
      o.start(t);
      o.stop(t + 1.5);
      noiseHit(dest, t + 1.45, 0.12, 900, 1.5, 0.5);
    },

    /** Übergang in die nächste Ebene: Tür auf und Schritte (treppab = in den Keller). */
    transition(kind) {
      const t = ctx.currentTime;
      const dest = out(0.9, 1);
      if (kind === 'door') {
        noiseHit(dest, t, 0.05, 2800, 4, 0.4);
        tone(dest, t + 0.1, 'sawtooth', 160, 120, 0.6, 0.05);
      }
      for (let i = 0; i < 6; i++) {
        const at = t + 0.5 + i * (kind === 'stairs' ? 0.38 : 0.45);
        noiseHit(dest, at, 0.1, kind === 'stairs' ? 380 - i * 25 : 480, 1.4, 0.3);
        tone(dest, at, 'sine', 80 - i * 4, 45, 0.1, 0.12);
      }
    },

    /** Hörerposition = Kamera. Vorwärtsrichtung (fx, fz) als Einheitsvektor. */
    setListener(x, y, z, fx, fz) {
      if (listener.positionX) {
        listener.positionX.value = x;
        listener.positionY.value = y;
        listener.positionZ.value = z;
        listener.forwardX.value = fx;
        listener.forwardY.value = 0;
        listener.forwardZ.value = fz;
        listener.upX.value = 0;
        listener.upY.value = 1;
        listener.upZ.value = 0;
      } else {
        listener.setPosition(x, y, z);
        listener.setOrientation(fx, 0, fz, 0, 1, 0);
      }
    },

    /** 0..1 — wie nah die Verfolgung ist. Regelt Dröhnen. */
    setChase(level) {
      if (!ambience) return;
      ambience.chase.gain.setTargetAtTime(level * 0.9, ctx.currentTime, 0.4);
    },

    /** Herzschlag, Tempo nach Angst (0..1). Muss jedes Bild gerufen werden. */
    heartbeat(fear) {
      if (fear < 0.15) return;
      const now = ctx.currentTime;
      if (now < heartAt) return;
      const bpm = 70 + fear * 90;
      heartAt = now + 60 / bpm;
      const dest = out(1, 0.05);
      const g = 0.25 + fear * 0.55;
      tone(dest, now, 'sine', 62, 40, 0.16, g);
      tone(dest, now + 0.17, 'sine', 55, 36, 0.2, g * 0.75);
    },

    footstep(sprint) {
      const t = ctx.currentTime;
      footstepFlip = !footstepFlip;
      const dest = out(0.9, 0.5);
      noiseHit(dest, t, sprint ? 0.12 : 0.09, footstepFlip ? 520 : 440, 1.6, sprint ? 0.5 : 0.26);
      tone(dest, t, 'sine', 90, 50, 0.08, sprint ? 0.25 : 0.12);
    },

    /** Schritt des Monsters an einer Weltposition — schwer, schleifend. */
    monsterStep(x, y, z, loud = 1) {
      const t = ctx.currentTime;
      const p = panner(x, y, z);
      const g = ctx.createGain();
      g.gain.value = loud;
      p.connect(g).connect(master);
      const r = ctx.createGain();
      r.gain.value = 0.5 * loud;
      p.connect(r).connect(reverb);
      tone(p, t, 'sine', 70, 34, 0.32, 0.9);
      noiseHit(p, t, 0.28, 260, 0.9, 0.55, brown);
      noiseHit(p, t + 0.1, 0.35, 900, 2.5, 0.12);
    },

    /** Leises Atmen/Knurren an einer Position. */
    growl(x, y, z) {
      const t = ctx.currentTime;
      const p = panner(x, y, z);
      p.connect(master);
      p.connect(reverb);
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(48, t);
      o.frequency.linearRampToValueAtTime(38, t + 1.4);
      const am = ctx.createOscillator();
      am.frequency.value = 23;
      const amG = ctx.createGain();
      amG.gain.value = 0.5;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 420;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.5, t + 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
      am.connect(amG).connect(g.gain);
      o.connect(lp).connect(g).connect(p);
      o.start(t); am.start(t);
      o.stop(t + 1.6); am.stop(t + 1.6);
    },

    /** Schriller Akkord, wenn das Monster einen entdeckt. */
    stinger() {
      const t = ctx.currentTime;
      const dest = out(0.8, 1);
      for (const f of [740, 784, 1046, 1108]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(f, t);
        o.frequency.linearRampToValueAtTime(f * 0.97, t + 1.6);
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 600;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.07, t + 0.04);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
        o.connect(hp).connect(g).connect(dest);
        o.start(t);
        o.stop(t + 1.9);
      }
      tone(dest, t, 'sine', 120, 30, 1.2, 0.6);
    },

    /** Schrei für den Jumpscare. soft = ohne Spitzenpegel. */
    scream(soft) {
      const t = ctx.currentTime;
      const shaper = ctx.createWaveShaper();
      shaper.curve = distortionCurve(soft ? 20 : 80);
      const g = ctx.createGain();
      const peak = soft ? 0.35 : 1.1;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak, t + 0.03);
      g.gain.setValueAtTime(peak, t + 0.7);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
      shaper.connect(g);
      g.connect(master);
      const r = ctx.createGain();
      r.gain.value = 0.5;
      g.connect(r).connect(reverb);
      for (const [type, f] of [['sawtooth', 310], ['sawtooth', 465], ['square', 620], ['sawtooth', 157]]) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.setValueAtTime(f, t);
        o.frequency.linearRampToValueAtTime(f * 1.35, t + 0.25);
        o.frequency.linearRampToValueAtTime(f * 0.7, t + 1.5);
        const vib = ctx.createOscillator();
        vib.frequency.value = 31;
        const vg = ctx.createGain();
        vg.gain.value = f * 0.06;
        vib.connect(vg).connect(o.frequency);
        const og = ctx.createGain();
        og.gain.value = 0.18;
        o.connect(og).connect(shaper);
        o.start(t); vib.start(t);
        o.stop(t + 1.6); vib.stop(t + 1.6);
      }
      noiseHit(shaper, t, 1.4, 2400, 0.5, 0.9);
    },

    click() {
      const t = ctx.currentTime;
      noiseHit(out(1, 0.2), t, 0.03, 3200, 4, 0.35);
    },

    pickup() {
      const t = ctx.currentTime;
      const dest = out(0.9, 0.7);
      noiseHit(dest, t, 0.05, 2600, 6, 0.3);
      tone(dest, t + 0.02, 'triangle', 880, 860, 0.25, 0.08);
    },

    clunk() {
      const t = ctx.currentTime;
      const dest = out(1, 0.8);
      tone(dest, t, 'square', 110, 60, 0.18, 0.25);
      noiseHit(dest, t, 0.2, 700, 1.2, 0.6);
    },

    /** Strom kommt zurück: Brummen, das hochfährt. */
    powerOn() {
      const t = ctx.currentTime;
      const dest = out(0.8, 1);
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(30, t);
      o.frequency.exponentialRampToValueAtTime(100, t + 2.2);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 500;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.3, t + 1.8);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 3.5);
      o.connect(lp).connect(g).connect(dest);
      o.start(t);
      o.stop(t + 3.6);
    },

    /** Alarm des offenen Tors — pulsierend, solange die Flucht läuft. */
    alarm() {
      const t = ctx.currentTime;
      const dest = out(0.7, 1);
      for (let i = 0; i < 3; i++) tone(dest, t + i * 0.5, 'square', 440, 330, 0.4, 0.07);
    },

    /** Elektrisches Knistern beim Flackern. */
    buzz(dur = 1.2) {
      const t = ctx.currentTime;
      const dest = out(0.9, 0.3);
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = 100;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      for (let i = 0; i < dur * 14; i++) g.gain.setValueAtTime(Math.random() < 0.5 ? 0.06 : 0.0001, t + i / 14);
      g.gain.setValueAtTime(0.0001, t + dur);
      o.connect(g).connect(dest);
      o.start(t);
      o.stop(t + dur + 0.05);
    },

    /** Schnüffeln des Gärtners: kurze Atemstöße durch die Nase, an seiner Position. */
    sniff(x, y, z) {
      const t = ctx.currentTime;
      const p = panner(x, y, z);
      p.connect(master);
      const r = ctx.createGain();
      r.gain.value = 0.4;
      p.connect(r).connect(reverb);
      const n = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) noiseHit(p, t + i * 0.13 + Math.random() * 0.03, 0.09, 1300 + Math.random() * 500, 1.6, 0.42);
      noiseHit(p, t + n * 0.13 + 0.15, 0.35, 700, 1, 0.25);
    },

    /** Steinsockel dreht sich: tiefes Mahlen mit Knirschen (an der Statue). */
    grind(x, y, z) {
      const t = ctx.currentTime;
      const p = panner(x, y, z);
      p.refDistance = 2.5;
      p.connect(master);
      p.connect(reverb);
      noiseHit(p, t, 0.42, 180, 0.9, 0.7, brown);
      noiseHit(p, t + 0.05, 0.3, 900, 2.5, 0.22);
      tone(p, t, 'sawtooth', 48 + Math.random() * 6, 40, 0.4, 0.06);
    },

    /** Ferne Glocke — das Tor im Garten öffnet sich. */
    bell() {
      const t = ctx.currentTime;
      const dest = out(0.5, 1.4);
      for (const [f, g] of [[196, 0.18], [392, 0.08], [523, 0.05], [740, 0.03]]) tone(dest, t, 'sine', f, f * 0.995, 4.5, g);
    },

    /** Leuchtstoffröhre zündet bzw. setzt aus: kurzes Brummen mit Klick an der Lampe (decor.js). */
    fluoro(x, y, z) {
      const t = ctx.currentTime;
      const p = panner(x, y, z);
      p.refDistance = 1.2;
      p.rolloffFactor = 1.8;
      p.connect(master);
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 100 + Math.random() * 20;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 600;
      bp.Q.value = 1.2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.05, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      o.connect(bp).connect(g).connect(p);
      o.start(t);
      o.stop(t + 0.15);
      noiseHit(p, t, 0.02, 5000, 2, 0.12);
    },

    /** Entfernter Knall (Tür) an einer Position. */
    bang(x, y, z) {
      const t = ctx.currentTime;
      const p = panner(x, y, z);
      p.connect(master);
      const r = ctx.createGain();
      r.gain.value = 1.4;
      p.connect(r).connect(reverb);
      tone(p, t, 'sine', 80, 30, 0.6, 1);
      noiseHit(p, t, 0.5, 400, 0.7, 1, brown);
    },

    /** Flüstern direkt am Ohr. */
    whisper(x, y, z) {
      const t = ctx.currentTime;
      const p = panner(x, y, z);
      p.refDistance = 0.5;
      p.connect(master);
      for (let i = 0; i < 6; i++) {
        noiseHit(p, t + i * 0.18 + Math.random() * 0.08, 0.16, 1800 + Math.random() * 2400, 8, 0.25);
      }
    },

    /** Elektrisches Knistern einer Sicherung — Orientierung per Gehör. */
    crackle(x, y, z) {
      const t = ctx.currentTime;
      const p = panner(x, y, z);
      p.refDistance = 1.5;
      p.connect(master);
      for (let i = 0; i < 4; i++) noiseHit(p, t + i * 0.06 + Math.random() * 0.05, 0.03, 4000, 3, 0.35);
    },

    /** Piepen des Sicherungskastens an seiner Position. */
    beep(x, y, z) {
      const t = ctx.currentTime;
      const p = panner(x, y, z);
      p.refDistance = 3;
      p.connect(master);
      p.connect(reverb);
      tone(p, t, 'sine', 1320, 1320, 0.18, 0.12);
    },

    /** Ast knackt unter einem Fuß — der Beobachter, wenn er sich bewegt. */
    twig(x, y, z) {
      const t = ctx.currentTime;
      const p = panner(x, y, z);
      p.connect(master);
      p.connect(reverb);
      noiseHit(p, t, 0.05, 1800, 2, 0.7);
      noiseHit(p, t + 0.04 + Math.random() * 0.03, 0.08, 900, 1.5, 0.5);
    },

    /** Klicklaut des blinden Lauschers (wie Echoortung). */
    echo(x, y, z) {
      const t = ctx.currentTime;
      const p = panner(x, y, z);
      p.connect(master);
      const r = ctx.createGain();
      r.gain.value = 1.2;
      p.connect(r).connect(reverb);
      for (let i = 0; i < 3; i++) noiseHit(p, t + i * 0.09, 0.025, 2600, 6, 0.6);
    },

    /** Rostiges Ventil, das sich dreht. */
    squeak(x, y, z) {
      const t = ctx.currentTime;
      const p = panner(x, y, z);
      p.connect(master);
      p.connect(reverb);
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(700 + Math.random() * 300, t);
      o.frequency.linearRampToValueAtTime(500 + Math.random() * 400, t + 0.5);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1400;
      bp.Q.value = 4;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.25, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
      o.connect(bp).connect(g).connect(p);
      o.start(t);
      o.stop(t + 0.6);
    },

    /** Wassertropfen irgendwo im Keller. */
    drip(x, y, z) {
      const t = ctx.currentTime;
      const p = panner(x, y, z);
      p.connect(master);
      const r = ctx.createGain();
      r.gain.value = 1.5;
      p.connect(r).connect(reverb);
      tone(p, t, 'sine', 1800 + Math.random() * 900, 700, 0.09, 0.18);
    },

    /** Eule bzw. ferner Ruf im Wald. */
    owl(x, y, z) {
      const t = ctx.currentTime;
      const p = panner(x, y, z);
      p.connect(master);
      p.connect(reverb);
      tone(p, t, 'sine', 410, 380, 0.35, 0.14);
      tone(p, t + 0.5, 'sine', 400, 360, 0.6, 0.12);
    },

    /** Schlüssel klimpert leise — Orientierung im Wald. */
    jingle(x, y, z) {
      const t = ctx.currentTime;
      const p = panner(x, y, z);
      p.refDistance = 1.5;
      p.connect(master);
      for (let i = 0; i < 3; i++) tone(p, t + i * 0.07 + Math.random() * 0.03, 'triangle', 2400 + Math.random() * 900, 2200, 0.12, 0.08);
    },

    /** Schloss springt auf. */
    unlock() {
      const t = ctx.currentTime;
      const dest = out(1, 0.6);
      noiseHit(dest, t, 0.04, 3000, 4, 0.5);
      noiseHit(dest, t + 0.18, 0.06, 1500, 3, 0.6);
      tone(dest, t + 0.18, 'square', 180, 90, 0.15, 0.15);
    },

    /** Schweres Atmen bei leerer Ausdauer. */
    breath() {
      const t = ctx.currentTime;
      const dest = out(1, 0.1);
      noiseHit(dest, t, 0.5, 900, 0.8, 0.12);
      noiseHit(dest, t + 0.6, 0.6, 700, 0.8, 0.1);
    },

    dispose() {
      try {
        ambience?.sources.forEach((s) => s.stop());
        ctx.close();
      } catch { /* bereits zu */ }
    },
  };
}
