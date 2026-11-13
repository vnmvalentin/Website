// audio.js — der Ton von Lights Out per WebAudio. Stimmung, Türen, Technik und Schrecktöne werden erzeugt;
// Schritte und die Stimmen der Monster sind Aufnahmen (public/media/lightsout/sfx, CC0), tiefer und langsamer
// abgespielt und verhallt. Räumliche Geräusche (Monster, Scheinschritte) laufen über PannerNodes (HRTF):
// man hört, ob etwas hinter einem ist.

const SFX_URL = '/media/lightsout/sfx';
/** Alle Aufnahmen, die geladen werden (Dateiname ohne .ogg) */
const SAMPLES = [
  ...['tile', 'grass', 'wood', 'gravel'].flatMap((s) => [0, 1, 2, 3, 4].map((i) => `step_${s}_${i}`)),
  'monster_01', 'monster_04', 'monster_06', 'monster_07', 'roar_01', 'roar_02', 'roar_03', 'scream_01', 'scream_02',
  'breath', 'nose', 'grunt_01', 'grunt_03', 'troll_01', 'burble_02', 'bug_01', 'bug_02', 'bug_04', 'hurt_02', 'howl',
  'alien_03', 'snore',
];

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
  // Begrenzer hinter dem Lautstärkeregler: fangen mehrere laute Töne zugleich an (Schrei + Brüllen + Schlag), wird
  // die Summe heruntergeregelt statt hart abgeschnitten — das klänge verzerrt und wäre unangenehm laut.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.knee.value = 6;
  limiter.ratio.value = 14;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.18;
  master.connect(limiter).connect(ctx.destination);

  const reverb = ctx.createConvolver();
  reverb.buffer = impulse(ctx, 2.6, 2.4);
  const wet = ctx.createGain();
  wet.gain.value = 0.35;
  reverb.connect(wet).connect(master);

  const white = noiseBuffer(ctx, 2);
  const brown = noiseBuffer(ctx, 4, true);
  const listener = ctx.listener;

  // ── Aufnahmen ───────────────────────────────────────────────────────────
  // Schritte und Kreaturenlaute sind echte Aufnahmen (public/media/lightsout, CC0). Sie laden im Hintergrund;
  // bis eine da ist — oder wenn der Browser sie nicht abspielen kann — springt der erzeugte Ersatzton ein.
  const bank = new Map();
  for (const name of SAMPLES) {
    fetch(`${SFX_URL}/${name}.ogg`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((data) => ctx.decodeAudioData(data))
      .then((buf) => bank.set(name, buf))
      .catch(() => { /* Ersatzton bleibt */ });
  }
  /**
   * Spielt eine der genannten Aufnahmen (zufällig gewählt). rate = Abspieltempo (unter 1: tiefer und länger),
   * vary = zufällige Abweichung davon, at = Verzögerung in Sekunden, lowpass = Grenzfrequenz (0 = keine).
   * @returns {boolean} false, wenn keine der Aufnahmen geladen ist
   */
  const sample = (dest, names, { rate = 1, gain = 1, at = 0, vary = 0.06, lowpass = 0 } = {}) => {
    const list = [].concat(names).map((n) => bank.get(n)).filter(Boolean);
    if (!list.length) return false;
    const src = ctx.createBufferSource();
    src.buffer = list[Math.floor(Math.random() * list.length)];
    src.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * vary);
    const g = ctx.createGain();
    g.gain.value = gain;
    let node = src;
    if (lowpass) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lowpass;
      node.connect(f);
      node = f;
    }
    node.connect(g).connect(dest);
    src.start(ctx.currentTime + at);
    return true;
  };
  const five = (prefix) => [0, 1, 2, 3, 4].map((i) => `${prefix}_${i}`);
  /** Lautstärke der eigenen Schritte je Untergrund (Faktor auf die Aufnahme, beim Gehen) */
  const STEP_LEVEL = { tile: 0.4, wet: 0.36, grass: 0.5, wood: 0.36, gravel: 0.34 };
  /** Schritt-Aufnahmen je Untergrund */
  const STEPS = { tile: five('step_tile'), wet: five('step_tile'), grass: five('step_grass'), wood: five('step_wood'), gravel: five('step_gravel') };

  /**
   * Stimmhafter Rohklang als Puffer: eine Folge kurzer Knackimpulse (wie Stimmlippen), deren Abstand und Stärke
   * leicht schwanken. Bei 20–40 Hz klingt das wie ein Röcheln aus der Kehle, bei 100+ Hz wie eine Stimme.
   * rate(t01) = Impulse je Sekunde über die Dauer, jitter = Unregelmäßigkeit (0…1).
   */
  const pulseBuffer = (seconds, rate, jitter = 0.2) => {
    const sr = ctx.sampleRate;
    const buf = ctx.createBuffer(1, Math.floor(sr * seconds), sr);
    const d = buf.getChannelData(0);
    let t = 0;
    while (t < seconds) {
      const start = Math.floor(t * sr);
      const amp = 0.6 + Math.random() * 0.4;
      // ein Impuls: steiler Anstieg, schnelles Ausklingen (~2 ms)
      for (let i = 0; i < 110 && start + i < d.length; i++) d[start + i] += amp * Math.exp(-i / 22) * (i < 3 ? i / 3 : 1);
      t += (1 / rate(t / seconds)) * (1 + (Math.random() * 2 - 1) * jitter);
    }
    return buf;
  };

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

    /**
     * Eigener Schritt. surface = Untergrund: tile (Fliesen), wet (nasser Beton), grass (Waldboden), wood (Dielen),
     * gravel (Kies). soft = Schleichen: kaum zu hören.
     */
    footstep(sprint, surface = 'tile', soft = false) {
      const t = ctx.currentTime;
      footstepFlip = !footstepFlip;
      const outdoors = surface === 'grass' || surface === 'gravel';
      const dest = out(0.9, outdoors ? 0.12 : 0.5);
      const loud = soft ? 0.28 : sprint ? 1.25 : 0.8;
      // linker und rechter Fuß klingen leicht verschieden
      const rate = (footstepFlip ? 1.05 : 0.96) * (sprint ? 1.08 : 1);
      // Die Aufnahmen sind alle voll ausgesteuert (Spitze 0,9). Eigene Schritte sollen leise mitlaufen, etwa so laut
      // wie früher die erzeugten (Spitze um 0,3) — das Rascheln im Laub etwas mehr, weil es dünner klingt.
      const had = sample(dest, STEPS[surface] || STEPS.tile, { rate, gain: loud * (STEP_LEVEL[surface] ?? 0.36), vary: 0.08 });
      if (!had) {
        noiseHit(dest, t, sprint ? 0.12 : 0.09, footstepFlip ? 520 : 440, 1.6, 0.4 * loud);
        tone(dest, t, 'sine', 90, 50, 0.08, 0.2 * loud);
      }
      // Was die Aufnahme nicht hat: der Absatz auf Fliesen, das Platschen im Keller, Zweige im Wald, hohle Dielen
      if (surface === 'tile') noiseHit(dest, t, 0.03, 2400 + Math.random() * 700, 2.5, 0.07 * loud);
      else if (surface === 'wet') {
        noiseHit(dest, t + 0.02, 0.13, 1300 + Math.random() * 700, 1.2, 0.13 * loud);
        tone(dest, t + 0.03, 'sine', 640, 230, 0.07, 0.035 * loud);
      } else if (surface === 'grass' && !soft && Math.random() < 0.16) {
        noiseHit(dest, t + 0.05, 0.04, 2000 + Math.random() * 900, 2.5, 0.24 * loud);
      } else if (surface === 'wood') tone(dest, t, 'sine', 105 + Math.random() * 20, 68, 0.13, 0.12 * loud);
    },

    /**
     * Schritt an einer Weltposition. kind: hunter (harte Sohlen, ein Bein schleift), listener (nackte, nasse Füße),
     * tracker (schwere Stiefel auf Kies), peer (Mitspieler).
     */
    monsterStep(x, y, z, loud = 1, kind = 'hunter') {
      const t = ctx.currentTime;
      const p = panner(x, y, z);
      const g = ctx.createGain();
      g.gain.value = loud;
      p.connect(g).connect(master);
      const r = ctx.createGain();
      r.gain.value = (kind === 'tracker' ? 0.15 : 0.5) * loud;
      p.connect(r).connect(reverb);
      if (kind === 'peer') {
        if (!sample(p, STEPS.tile, { rate: 1, gain: 0.9 })) noiseHit(p, t, 0.1, 480, 1.6, 0.5);
        return;
      }
      if (kind === 'listener') {
        sample(p, STEPS.tile, { rate: 0.58, gain: 0.9 });
        tone(p, t, 'sine', 60, 34, 0.2, 0.5);
        noiseHit(p, t + 0.02, 0.11, 1100 + Math.random() * 500, 1.3, 0.3);
        return;
      }
      if (kind === 'tracker') {
        if (!sample(p, STEPS.gravel, { rate: 0.72, gain: 1.1 })) noiseHit(p, t, 0.25, 700, 0.8, 0.5);
        tone(p, t, 'sine', 66, 34, 0.26, 0.8);
        return;
      }
      const had = sample(p, STEPS.tile, { rate: 0.68, gain: 1.2 });
      tone(p, t, 'sine', 70, 34, 0.32, 0.9);
      if (!had) noiseHit(p, t, 0.28, 260, 0.9, 0.55, brown);
      // das nachgezogene Bein
      noiseHit(p, t + 0.12, 0.34, 900, 2.5, 0.12);
    },

    /** Tiefes Knurren aus der Kehle an einer Position. */
    growl(x, y, z) {
      const t = ctx.currentTime;
      const p = panner(x, y, z);
      p.connect(master);
      p.connect(reverb);
      if (sample(p, ['monster_04', 'monster_07'], { rate: 0.6, gain: 1.3, vary: 0.1 })) return;
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
      // Mit den Aufnahmen (Kreischen + Brüllen, tiefer gelegt) tritt der erzeugte Schrei in den Hintergrund
      const voice = out(1, 0.6);
      const voiced = sample(voice, ['scream_01', 'scream_02'], { rate: 0.66, gain: soft ? 0.4 : 1.2 });
      sample(voice, 'roar_02', { rate: 0.5, gain: soft ? 0.3 : 0.9 });
      sample(voice, 'monster_06', { rate: 0.52, gain: soft ? 0.25 : 0.8, at: 0.35 });
      const peak = (soft ? 0.35 : 1.1) * (voiced ? 0.45 : 1);
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
      // Aufnahme: kurze Züge durch die Nase, jeder etwas anders
      if (bank.has('nose')) {
        for (let i = 0; i < n; i++) sample(p, 'nose', { rate: 0.8 + Math.random() * 0.25, gain: 1, at: i * 0.2 + Math.random() * 0.04 });
        sample(p, 'breath', { rate: 0.55, gain: 2.6, at: n * 0.2 + 0.1 });
        return;
      }
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
      if (Math.random() < 0.3) sample(p, ['bug_01', 'bug_02'], { rate: 0.8, gain: 0.9, at: 0.3 });
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

    // ── Schreckmomente ────────────────────────────────────────────────────
    /** Kurzer, schriller Aufschrei direkt im Kopf — für Erscheinungen (kein Ort, volle Lautstärke). */
    shriek(soft = false) {
      const t = ctx.currentTime;
      const shaper = ctx.createWaveShaper();
      shaper.curve = distortionCurve(soft ? 15 : 60);
      const g = ctx.createGain();
      const voiced = sample(out(1, 0.7), ['scream_01', 'scream_02'], { rate: 1.12, gain: soft ? 0.3 : 1 });
      const peak = (soft ? 0.25 : 0.8) * (voiced ? 0.5 : 1);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      shaper.connect(g);
      g.connect(master);
      const r = ctx.createGain();
      r.gain.value = 0.7;
      g.connect(r).connect(reverb);
      for (const f of [880, 1245, 1661, 233]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(f * 0.8, t);
        o.frequency.exponentialRampToValueAtTime(f * 1.5, t + 0.09);
        o.frequency.exponentialRampToValueAtTime(f * 0.9, t + 0.7);
        const og = ctx.createGain();
        og.gain.value = 0.16;
        o.connect(og).connect(shaper);
        o.start(t);
        o.stop(t + 0.75);
      }
      noiseHit(shaper, t, 0.45, 3400, 0.6, 0.8);
      tone(g, t, 'sine', 90, 28, 0.5, 0.9);
    },

    /** Anschwellendes Heulen (etwas rennt auf einen zu). Dauer in Sekunden; endet abrupt. */
    riser(dur = 1.2) {
      const t = ctx.currentTime;
      const dest = out(0.9, 0.6);
      for (const f of [110, 164, 221]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(f, t);
        o.frequency.exponentialRampToValueAtTime(f * 4, t + dur);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.11, t + dur);
        g.gain.setValueAtTime(0.0001, t + dur + 0.01);
        o.connect(g).connect(dest);
        o.start(t);
        o.stop(t + dur + 0.05);
      }
      const src = ctx.createBufferSource();
      src.buffer = white;
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 1.2;
      bp.frequency.setValueAtTime(300, t);
      bp.frequency.exponentialRampToValueAtTime(5000, t + dur);
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.0001, t);
      ng.gain.exponentialRampToValueAtTime(0.35, t + dur);
      ng.gain.setValueAtTime(0.0001, t + dur + 0.01);
      src.connect(bp).connect(ng).connect(dest);
      src.start(t);
      src.stop(t + dur + 0.05);
    },

    /** Atem im Nacken: zwei lange, nahe Züge an einer Stelle dicht hinter dem Kopf. */
    neckBreath(x, y, z) {
      const t = ctx.currentTime;
      const p = panner(x, y, z);
      p.refDistance = 0.6;
      p.connect(master);
      // (die Atem-Aufnahme ist sehr leise, Spitze 0,24 — deshalb der hohe Faktor)
      if (sample(p, 'breath', { rate: 0.5, gain: 4 })) {
        sample(p, 'breath', { rate: 0.42, gain: 4.5, at: 1.5 });
        return;
      }
      for (const [at, dur, f] of [[0, 0.9, 520], [1.1, 1.2, 380]]) {
        const src = ctx.createBufferSource();
        src.buffer = white;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = f;
        bp.Q.value = 1.4;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t + at);
        g.gain.linearRampToValueAtTime(0.3, t + at + dur * 0.5);
        g.gain.linearRampToValueAtTime(0, t + at + dur);
        src.connect(bp).connect(g).connect(p);
        src.start(t + at, Math.random());
        src.stop(t + at + dur + 0.05);
      }
    },

    /** Dreimal Klopfen auf Holz bzw. Blech an einer Stelle. */
    knock(x, y, z, metal = false) {
      const t = ctx.currentTime;
      const p = panner(x, y, z);
      p.connect(master);
      const r = ctx.createGain();
      r.gain.value = 0.9;
      p.connect(r).connect(reverb);
      for (let i = 0; i < 3; i++) {
        const at = t + i * 0.34;
        tone(p, at, 'sine', metal ? 210 : 130, metal ? 150 : 70, 0.14, 0.9);
        noiseHit(p, at, 0.07, metal ? 1800 : 600, 2, 0.5);
      }
    },

    /** Ferner Schrei — irgendwo im Haus bzw. tief im Wald. */
    distantScream(x, y, z) {
      const t = ctx.currentTime;
      const p = panner(x, y, z);
      p.refDistance = 6;
      const r = ctx.createGain();
      r.gain.value = 2;
      p.connect(r).connect(reverb);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1400;
      lp.connect(p);
      if (sample(lp, ['hurt_02', 'howl', 'scream_02'], { rate: 0.58, gain: 1.2, vary: 0.12 })) return;
      for (const f of [520, 787]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(f, t);
        o.frequency.linearRampToValueAtTime(f * 1.25, t + 0.4);
        o.frequency.linearRampToValueAtTime(f * 0.6, t + 1.8);
        const vib = ctx.createOscillator();
        vib.frequency.value = 9;
        const vg = ctx.createGain();
        vg.gain.value = f * 0.04;
        vib.connect(vg).connect(o.frequency);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.16, t + 0.15);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.9);
        o.connect(g).connect(lp);
        o.start(t); vib.start(t);
        o.stop(t + 2); vib.stop(t + 2);
      }
    },

    /** Tür knarrt langsam auf (an einer Stelle). */
    creak(x, y, z) {
      const t = ctx.currentTime;
      const p = panner(x, y, z);
      p.connect(master);
      p.connect(reverb);
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(140, t);
      o.frequency.linearRampToValueAtTime(260, t + 0.9);
      o.frequency.linearRampToValueAtTime(190, t + 1.6);
      const am = ctx.createOscillator();
      am.frequency.value = 17;
      const amG = ctx.createGain();
      amG.gain.value = 0.2;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 900;
      bp.Q.value = 5;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.22, t + 0.2);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.7);
      am.connect(amG).connect(g.gain);
      o.connect(bp).connect(g).connect(p);
      o.start(t); am.start(t);
      o.stop(t + 1.8); am.stop(t + 1.8);
    },

    /** Der Schatten löst sich im Licht auf: kurzes, nach unten gezogenes Fauchen. */
    vanish(x, y, z) {
      const t = ctx.currentTime;
      const p = panner(x, y, z);
      p.refDistance = 4;
      p.connect(master);
      p.connect(reverb);
      const src = ctx.createBufferSource();
      src.buffer = white;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 2;
      bp.frequency.setValueAtTime(3200, t);
      bp.frequency.exponentialRampToValueAtTime(300, t + 0.6);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.5, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.65);
      src.connect(bp).connect(g).connect(p);
      src.start(t, Math.random());
      src.stop(t + 0.7);
      sample(p, 'alien_03', { rate: 0.5, gain: 0.8 });
    },

    /** Strom fällt aus: Brummen sackt ab, dann Stille. */
    powerDown() {
      const t = ctx.currentTime;
      const dest = out(1, 0.8);
      tone(dest, t, 'sawtooth', 120, 22, 0.9, 0.3);
      noiseHit(dest, t, 0.12, 2400, 2, 0.5);
    },

    /** Der letzte Schlag, wenn es einen packt: dumpfer Aufprall, danach ein hohes Klingeln im Ohr. */
    deathHit(soft = false) {
      const t = ctx.currentTime;
      const dest = out(1, 0.5);
      tone(dest, t, 'sine', 110, 24, 0.9, soft ? 0.5 : 1.2);
      noiseHit(dest, t, 0.35, 180, 0.7, soft ? 0.5 : 1.2, brown);
      if (soft) return;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = 5200;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t + 0.9);
      g.gain.linearRampToValueAtTime(0.05, t + 1.1);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
      o.connect(g).connect(master);
      o.start(t + 0.9);
      o.stop(t + 3.3);
    },

    // ── Schreckmomente der Karten (events.js) ─────────────────────────────
    /** Fledermausschwarm über dem Kopf: Flattern und hohes Zirpen, zieht von vorn nach hinten durch. */
    bats() {
      const t = ctx.currentTime;
      const dest = out(1, 0.15);
      // Flügel: dichtes, leises Flattern
      for (let i = 0; i < 46; i++) noiseHit(dest, t + i * 0.035 + Math.random() * 0.03, 0.03, 900 + Math.random() * 1400, 1.2, 0.34 * Math.sin((i / 46) * Math.PI) + 0.06);
      // Rufe: kurze, sehr hohe Zirper
      for (let i = 0; i < 16; i++) {
        const at = t + 0.1 + Math.random() * 1.4;
        const f = 5200 + Math.random() * 3200;
        tone(dest, at, 'sine', f, f * 0.82, 0.045, 0.11);
      }
    },

    /** Krähen fliegen auf: heiseres Krächzen und schwere Flügelschläge, an ihrer Stelle. */
    caws(x, y, z) {
      const t = ctx.currentTime;
      const p = panner(x, y, z);
      p.refDistance = 4;
      p.connect(master);
      const r = ctx.createGain();
      r.gain.value = 0.35;
      p.connect(r).connect(reverb);
      for (let i = 0; i < 6; i++) {
        const at = t + i * 0.26 + Math.random() * 0.12;
        const f = 520 + Math.random() * 180;
        // „kraa“: raue Sägezahnstimme, fällt ab, durch einen engen Mundraum
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(f, at);
        o.frequency.linearRampToValueAtTime(f * 0.72, at + 0.22);
        const rough = ctx.createOscillator();
        rough.frequency.value = 62;
        const rg = ctx.createGain();
        rg.gain.value = f * 0.25;
        rough.connect(rg).connect(o.frequency);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 1500;
        bp.Q.value = 2.2;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, at);
        g.gain.linearRampToValueAtTime(0.8, at + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, at + 0.25);
        o.connect(bp).connect(g).connect(p);
        o.start(at); rough.start(at);
        o.stop(at + 0.3); rough.stop(at + 0.3);
      }
      for (let i = 0; i < 12; i++) noiseHit(p, t + i * 0.11 + Math.random() * 0.04, 0.07, 380, 0.9, 0.8, brown);
    },

    /** Wildschwein: tiefes, stoßweises Grunzen. */
    boarGrunt(x, y, z) {
      const p = panner(x, y, z);
      p.refDistance = 4;
      p.connect(master);
      if (sample(p, ['grunt_03', 'grunt_01'], { rate: 0.85, gain: 1.4, vary: 0.1 })) {
        sample(p, 'nose', { rate: 0.7, gain: 0.9, at: 0.45 });
        return;
      }
      const t = ctx.currentTime;
      for (let i = 0; i < 3; i++) tone(p, t + i * 0.16, 'sawtooth', 95, 70, 0.12, 0.5);
    },

    /** Wildschwein quiekt im Vorbeirennen. */
    boarSqueal(x, y, z) {
      const t = ctx.currentTime;
      const p = panner(x, y, z);
      p.refDistance = 4;
      p.connect(master);
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(700, t);
      o.frequency.linearRampToValueAtTime(1250, t + 0.12);
      o.frequency.linearRampToValueAtTime(820, t + 0.42);
      const rough = ctx.createOscillator();
      rough.frequency.value = 48;
      const rg = ctx.createGain();
      rg.gain.value = 160;
      rough.connect(rg).connect(o.frequency);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1900;
      bp.Q.value = 1.6;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(1.2, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      o.connect(bp).connect(g).connect(p);
      o.start(t); rough.start(t);
      o.stop(t + 0.5); rough.stop(t + 0.5);
    },

    /** Ein Huf auf Waldboden (das Schwein im Galopp ruft das viele Male). */
    hoof(x, y, z) {
      const t = ctx.currentTime;
      const p = panner(x, y, z);
      p.refDistance = 3;
      p.connect(master);
      tone(p, t, 'sine', 95, 45, 0.07, 0.7);
      noiseHit(p, t, 0.05, 700 + Math.random() * 500, 1.2, 0.35);
    },

    /** Tür schlägt zu — nah, hart, mit Nachhall im Flur. */
    slam(x, y, z) {
      const t = ctx.currentTime;
      const p = panner(x, y, z);
      p.refDistance = 4;
      p.connect(master);
      const r = ctx.createGain();
      r.gain.value = 1.1;
      p.connect(r).connect(reverb);
      tone(p, t, 'sine', 110, 38, 0.4, 0.85);
      noiseHit(p, t, 0.22, 500, 0.8, 0.8, brown);
      noiseHit(p, t, 0.05, 2600, 2, 0.4);
      // Schloss klappert nach
      noiseHit(p, t + 0.12, 0.04, 3400, 5, 0.25);
    },

    /** Glühlampe platzt: Knall, Glas, kurzes Britzeln. */
    bulbPop(x, y, z) {
      const t = ctx.currentTime;
      const p = panner(x, y, z);
      p.refDistance = 3;
      p.connect(master);
      const r = ctx.createGain();
      r.gain.value = 0.5;
      p.connect(r).connect(reverb);
      noiseHit(p, t, 0.035, 3000, 0.8, 1.4);
      tone(p, t, 'sine', 180, 60, 0.12, 0.6);
      for (let i = 0; i < 7; i++) tone(p, t + 0.05 + Math.random() * 0.5, 'triangle', 3500 + Math.random() * 4000, 3000, 0.05, 0.05);
      for (let i = 0; i < 6; i++) noiseHit(p, t + 0.08 + i * 0.05 + Math.random() * 0.03, 0.02, 5000, 3, 0.2);
    },

    /** Ratten: Trippeln vieler kleiner Füße und Fiepen, läuft an einem vorbei. */
    rats() {
      const t = ctx.currentTime;
      const dest = out(1, 0.35);
      for (let i = 0; i < 44; i++) noiseHit(dest, t + i * 0.036 + Math.random() * 0.02, 0.014, 2600 + Math.random() * 1800, 4, 0.2 + 0.26 * Math.sin((i / 44) * Math.PI));
      for (let i = 0; i < 7; i++) {
        const at = t + 0.15 + Math.random() * 1.3;
        const f = 3300 + Math.random() * 1500;
        tone(dest, at, 'triangle', f, f * 1.25, 0.06, 0.14);
      }
    },

    /** Dampf schießt aus einem geplatzten Rohr: Schlag, dann lautes Zischen, das abklingt. */
    steam(x, y, z, dur = 2.6) {
      const t = ctx.currentTime;
      const p = panner(x, y, z);
      p.refDistance = 3;
      p.connect(master);
      const r = ctx.createGain();
      r.gain.value = 0.4;
      p.connect(r).connect(reverb);
      tone(p, t, 'square', 150, 70, 0.1, 0.35);
      noiseHit(p, t, 0.06, 1200, 1, 0.6);
      const src = ctx.createBufferSource();
      src.buffer = white;
      src.loop = true;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.setValueAtTime(2600, t);
      hp.frequency.linearRampToValueAtTime(1500, t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.25, t + 0.06);
      g.gain.setValueAtTime(0.22, t + dur * 0.7);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.8);
      src.connect(hp).connect(g).connect(p);
      src.start(t);
      src.stop(t + dur + 0.9);
    },

    /** Etwas Schweres fällt an einer Kette von der Decke: Rasseln, Ruck, dumpfer Schlag. */
    chainDrop(x, y, z) {
      const t = ctx.currentTime;
      const p = panner(x, y, z);
      p.refDistance = 3.5;
      p.connect(master);
      const r = ctx.createGain();
      r.gain.value = 0.9;
      p.connect(r).connect(reverb);
      for (let i = 0; i < 12; i++) {
        const at = t + i * 0.022;
        tone(p, at, 'square', 1700 + Math.random() * 1600, 1200, 0.03, 0.12);
        noiseHit(p, at, 0.02, 4200, 4, 0.25);
      }
      tone(p, t + 0.28, 'sine', 85, 30, 0.5, 0.85);
      noiseHit(p, t + 0.28, 0.3, 260, 0.7, 0.7, brown);
      tone(p, t + 0.28, 'square', 900, 500, 0.12, 0.2);
    },

    /** Jonas' Uhr tickt (an ihrer Stelle am Boden). */
    tick(x, y, z) {
      const t = ctx.currentTime;
      const p = panner(x, y, z);
      p.refDistance = 1.3;
      p.rolloffFactor = 1.6;
      p.connect(master);
      noiseHit(p, t, 0.012, 5200, 8, 3.4);
      noiseHit(p, t + 0.5, 0.012, 4300, 8, 2.6);
    },

    /** Ein vernageltes Brett bricht ab: Holz kracht, Nägel quietschen. */
    crack(x, y, z) {
      const t = ctx.currentTime;
      const p = panner(x, y, z);
      p.refDistance = 3;
      p.connect(master);
      const r = ctx.createGain();
      r.gain.value = 0.6;
      p.connect(r).connect(reverb);
      tone(p, t, 'sawtooth', 620, 380, 0.16, 0.12);
      noiseHit(p, t + 0.12, 0.09, 1800, 1.5, 0.55);
      noiseHit(p, t + 0.14, 0.22, 500, 0.9, 0.5, brown);
      tone(p, t + 0.14, 'sine', 140, 60, 0.2, 0.4);
      noiseHit(p, t + 0.5, 0.08, 900, 2, 0.4);
    },

    /** Papier rascheln (Notiz aufheben). */
    paper() {
      const t = ctx.currentTime;
      const dest = out(1, 0.2);
      for (let i = 0; i < 4; i++) noiseHit(dest, t + i * 0.05 + Math.random() * 0.03, 0.06, 4200 + Math.random() * 2500, 1.5, 0.16);
    },

    // ── Stimmen der Monster ───────────────────────────────────────────────
    /** Kreischen, wenn die Nachtschwester einen entdeckt (an ihrer Position). */
    screech(x, y, z) {
      const p = panner(x, y, z);
      p.refDistance = 5;
      p.connect(master);
      const r = ctx.createGain();
      r.gain.value = 0.8;
      p.connect(r).connect(reverb);
      if (sample(p, ['scream_01', 'scream_02'], { rate: 0.8, gain: 1.3 })) sample(p, 'roar_02', { rate: 0.6, gain: 0.9, at: 0.1 });
      else {
        const t = ctx.currentTime;
        for (const f of [620, 930]) tone(p, t, 'sawtooth', f, f * 1.4, 0.7, 0.2);
      }
    },

    /** Kurzes Brüllen (Lauscher springt los, Gärtner hat einen gesehen). */
    roar(x, y, z) {
      const p = panner(x, y, z);
      p.refDistance = 4;
      p.connect(master);
      p.connect(reverb);
      if (!sample(p, ['roar_03', 'roar_01', 'monster_06'], { rate: 0.58, gain: 1.5, vary: 0.1 })) {
        const t = ctx.currentTime;
        tone(p, t, 'sawtooth', 90, 55, 0.7, 0.5);
        noiseHit(p, t, 0.6, 500, 0.7, 0.5, brown);
      }
    },

    /** Grunzen des Gärtners, wenn er eine Spur aufnimmt. */
    grunt(x, y, z) {
      const p = panner(x, y, z);
      p.connect(master);
      const r = ctx.createGain();
      r.gain.value = 0.3;
      p.connect(r).connect(reverb);
      if (!sample(p, ['grunt_01', 'grunt_03', 'troll_01'], { rate: 0.6, gain: 1.3, vary: 0.1 })) {
        tone(p, ctx.currentTime, 'sawtooth', 70, 50, 0.4, 0.3);
      }
    },

    /**
     * Röcheln des Lauschers: ein Knarren tief aus der Kehle, das schneller wird und wieder abreißt
     * (einzelne Knackimpulse, durch zwei Mundraum-Filter geschickt).
     */
    croak(x, y, z, dur = 1.6) {
      const t = ctx.currentTime;
      const p = panner(x, y, z);
      p.refDistance = 2.5;
      p.connect(master);
      const r = ctx.createGain();
      r.gain.value = 1.1;
      p.connect(r).connect(reverb);
      const src = ctx.createBufferSource();
      src.buffer = pulseBuffer(dur, (k) => 17 + 20 * Math.sin(k * Math.PI) ** 2, 0.28);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(1.3, t + dur * 0.3);
      g.gain.linearRampToValueAtTime(0, t + dur);
      for (const [freq, q, lvl] of [[820, 2.5, 1], [1900, 4, 0.7], [3100, 5, 0.3]]) {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = freq * (0.9 + Math.random() * 0.2);
        bp.Q.value = q;
        const lv = ctx.createGain();
        lv.gain.value = lvl;
        src.connect(bp).connect(lv).connect(g);
      }
      g.connect(p);
      src.start(t);
      if (Math.random() < 0.5) sample(p, 'burble_02', { rate: 0.55, gain: 1.1, at: dur * 0.5 });
    },

    /**
     * Die Nachtschwester summt auf ihrer Runde ein Wiegenlied — ein paar Töne, zu langsam und nicht ganz sauber.
     * phrase zählt weiter (jede Runde ein Stück mehr vom Lied).
     */
    hum(x, y, z, phrase = 0) {
      const t = ctx.currentTime;
      const p = panner(x, y, z);
      p.refDistance = 3;
      p.rolloffFactor = 1.1;
      p.connect(master);
      const r = ctx.createGain();
      r.gain.value = 1.3;
      p.connect(r).connect(reverb);
      // „Guten Abend, gut' Nacht“: Töne als Halbtonschritte über dem Grundton, Dauer in Schlägen
      const PHRASES = [
        [[4, 0.5], [4, 0.5], [7, 2]],
        [[4, 0.5], [4, 0.5], [7, 2]],
        [[4, 0.5], [7, 0.5], [12, 1], [11, 1.5]],
        [[9, 0.5], [9, 1], [7, 2]],
      ];
      const notes = PHRASES[phrase % PHRASES.length];
      const base = 196;   // tiefes g
      const beat = 0.62;
      let at = t;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 900;
      lp.connect(p);
      for (const [semi, beats] of notes) {
        const dur = beats * beat;
        // jede Note einen Hauch zu tief, die langen sacken am Ende ab
        const f = base * 2 ** (semi / 12) * (0.985 + Math.random() * 0.012);
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.setValueAtTime(f * 0.97, at);
        o.frequency.linearRampToValueAtTime(f, at + 0.09);
        o.frequency.setValueAtTime(f, at + dur * 0.7);
        o.frequency.linearRampToValueAtTime(f * (beats > 1 ? 0.972 : 0.995), at + dur);
        const vib = ctx.createOscillator();
        vib.frequency.value = 5.2;
        const vg = ctx.createGain();
        vg.gain.setValueAtTime(0, at);
        vg.gain.linearRampToValueAtTime(f * 0.012, at + Math.min(dur, 0.5));
        vib.connect(vg).connect(o.frequency);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, at);
        g.gain.linearRampToValueAtTime(0.22, at + 0.08);
        g.gain.setValueAtTime(0.22, at + dur * 0.75);
        g.gain.linearRampToValueAtTime(0, at + dur + 0.05);
        o.connect(g).connect(lp);
        o.start(at); vib.start(at);
        o.stop(at + dur + 0.1); vib.stop(at + dur + 0.1);
        at += dur;
      }
      // Luft holen danach
      sample(p, 'breath', { rate: 0.6, gain: 2, at: at - t + 0.15 });
    },

    // ── Anruf im Auto (Anfahrt) ───────────────────────────────────────────
    /** Handy klingelt in der Halterung: Summen des Vibrationsmotors auf dem Armaturenbrett, dazu der Klingelton. */
    phoneRing() {
      const t = ctx.currentTime;
      const dest = out(1, 0.12);
      for (const at of [0, 0.75]) {
        // Vibration: tiefes Schnarren, kurz an- und abschwellend
        const o = ctx.createOscillator();
        o.type = 'square';
        o.frequency.value = 148;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 520;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t + at);
        g.gain.linearRampToValueAtTime(0.11, t + at + 0.03);
        g.gain.setValueAtTime(0.11, t + at + 0.42);
        g.gain.linearRampToValueAtTime(0, t + at + 0.5);
        o.connect(lp).connect(g).connect(dest);
        o.start(t + at);
        o.stop(t + at + 0.55);
        // Klingelton: vier helle Töne
        [1318.5, 1568, 1976, 1568].forEach((f, i) => tone(dest, t + at + i * 0.11, 'sine', f, f, 0.16, 0.06));
      }
    },

    /** Anruf angenommen: Klick. */
    phonePickup() {
      const t = ctx.currentTime;
      const dest = out(1, 0.1);
      noiseHit(dest, t, 0.025, 3000, 4, 0.3);
      tone(dest, t + 0.03, 'sine', 880, 880, 0.08, 0.05);
    },

    /**
     * Rauschen und Knacken der schlechten Verbindung. Gibt eine Steuerung zurück: set(0…1) = wie schlecht,
     * stop().
     */
    phoneLine() {
      const t = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = white;
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1900;
      bp.Q.value = 0.7;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.02, t + 0.2);
      src.connect(bp).connect(g).connect(master);
      src.start(t);
      let level = 0.2;
      // Knackser in unregelmäßigen Abständen, je schlechter die Verbindung, desto dichter
      const crackle = setInterval(() => {
        if (Math.random() < 0.25 + level * 0.6) noiseHit(master, ctx.currentTime, 0.012 + Math.random() * 0.03, 1500 + Math.random() * 2500, 2, 0.05 + level * 0.12);
      }, 90);
      return {
        set(v) {
          level = v;
          g.gain.setTargetAtTime(0.012 + v * 0.07, ctx.currentTime, 0.3);
        },
        stop() {
          clearInterval(crackle);
          g.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
          setTimeout(() => { try { src.stop(); g.disconnect(); } catch { /* schon gestoppt */ } }, 300);
        },
      };
    },

    /**
     * Jonas' Stimme durchs Telefon: man versteht ihn nicht (dafür stehen die Untertitel da), man hört nur, DASS
     * jemand hastig redet — eine Männerstimme in Silben, schmalbandig, verzerrt, mit Aussetzern.
     * Mit pitch (Grundton in Hz), level und dropouts = 0 auch die Sprecherin im Fernseher (leise, ohne Aussetzer).
     */
    phoneVoice(dur = 2.5, { pitch = 0, level = 1, dropouts = 0.14 } = {}) {
      const t = ctx.currentTime;
      const f0 = pitch || 108 + Math.random() * 14;
      const src = ctx.createBufferSource();
      // Sprechmelodie: steigt in jeder Silbengruppe leicht an und fällt zum Ende
      src.buffer = pulseBuffer(dur, (k) => f0 * (1.12 - k * 0.22 + 0.1 * Math.sin(k * 23)), 0.04);
      // Telefonband
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 420;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2900;
      const shaper = ctx.createWaveShaper();
      shaper.curve = distortionCurve(30);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      // zwei Mundraum-Filter, die je Silbe auf einen anderen Vokal springen
      const VOWELS = [[700, 1200], [400, 1900], [300, 2300], [520, 900], [350, 800], [600, 1700]];
      const f1 = ctx.createBiquadFilter();
      f1.type = 'bandpass';
      f1.Q.value = 5;
      const f2 = ctx.createBiquadFilter();
      f2.type = 'bandpass';
      f2.Q.value = 7;
      src.connect(f1).connect(shaper);
      src.connect(f2).connect(shaper);
      shaper.connect(hp).connect(lp).connect(g).connect(master);
      let at = 0;
      while (at < dur) {
        const syl = 0.12 + Math.random() * 0.1;
        const [a, b] = VOWELS[Math.floor(Math.random() * VOWELS.length)];
        f1.frequency.setTargetAtTime(a, t + at, 0.02);
        f2.frequency.setTargetAtTime(b, t + at, 0.02);
        // Aussetzer: manche Silben fehlen ganz
        const lvl = Math.random() < dropouts ? 0 : (0.16 + Math.random() * 0.1) * level;
        g.gain.setTargetAtTime(lvl, t + at, 0.012);
        g.gain.setTargetAtTime(lvl * 0.25, t + at + syl * 0.7, 0.02);
        at += syl + (Math.random() < 0.18 ? 0.12 + Math.random() * 0.15 : 0);
      }
      g.gain.setTargetAtTime(0, t + dur, 0.02);
      src.start(t);
      src.stop(t + dur + 0.2);
    },

    // ── Vorspann: Fernseher, Losfahren, Unfall ────────────────────────────
    /** Fernseher geht an: Knacken, ein Moment Rauschen. */
    tvOn() {
      const t = ctx.currentTime;
      const dest = out(1, 0.2);
      noiseHit(dest, t, 0.03, 2400, 3, 0.4);
      noiseHit(dest, t + 0.04, 0.5, 3200, 0.6, 0.1);
    },

    /** Fernseher aus: Klick, das Bild fällt hörbar zusammen. */
    tvOff() {
      const t = ctx.currentTime;
      const dest = out(1, 0.2);
      noiseHit(dest, t, 0.03, 2800, 4, 0.4);
      tone(dest, t + 0.01, 'sine', 1100, 90, 0.3, 0.05);
    },

    /** Im Dunkeln: Schlüssel klimpern, Autotür, der Anlasser dreht und der Motor kommt. */
    carStart() {
      const t = ctx.currentTime;
      const dest = out(1, 0.25);
      for (let i = 0; i < 4; i++) tone(dest, t + i * 0.06 + Math.random() * 0.03, 'triangle', 2300 + Math.random() * 1100, 2100, 0.1, 0.05);
      tone(dest, t + 0.35, 'sine', 85, 42, 0.25, 0.5);
      noiseHit(dest, t + 0.35, 0.12, 600, 1, 0.4);
      // Anlasser: vier kurze Züge
      for (let i = 0; i < 4; i++) tone(dest, t + 0.62 + i * 0.085, 'sawtooth', 62 + i * 5, 48, 0.07, 0.16);
    },

    /** Reifen auf Schotter beim Herumreißen: Rutschen und Prasseln, wird lauter. */
    skid(dur = 1.4) {
      const t = ctx.currentTime;
      const dest = out(1, 0.25);
      const src = ctx.createBufferSource();
      src.buffer = white;
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(900, t);
      bp.frequency.linearRampToValueAtTime(1900, t + dur);
      bp.Q.value = 0.8;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.5, t + 0.15);
      g.gain.linearRampToValueAtTime(0.75, t + dur);
      g.gain.setValueAtTime(0, t + dur + 0.01);
      src.connect(bp).connect(g).connect(dest);
      src.start(t);
      src.stop(t + dur + 0.05);
      // einzelne Steine gegen das Blech
      for (let i = 0; i < 14; i++) noiseHit(dest, t + Math.random() * dur, 0.03, 1500 + Math.random() * 3000, 3, 0.25);
    },

    /** Aufprall: dumpfer Schlag, Blech, splitterndes Glas — danach ein hoher Ton im Ohr. */
    crash() {
      const t = ctx.currentTime;
      const dest = out(1, 0.5);
      tone(dest, t, 'sine', 80, 22, 1.1, 1.5);
      noiseHit(dest, t, 0.55, 220, 0.6, 1.5, brown);
      noiseHit(dest, t, 0.25, 900, 0.7, 0.9);
      tone(dest, t + 0.02, 'square', 190, 55, 0.5, 0.2);
      // Glas: erst der Bruch, dann einzelne Scherben, die nachrieseln
      for (let i = 0; i < 10; i++) noiseHit(dest, t + 0.03 + i * 0.03 + Math.random() * 0.03, 0.06, 3500 + Math.random() * 4000, 3, 0.45);
      for (let i = 0; i < 9; i++) tone(dest, t + 0.5 + Math.random() * 1.4, 'triangle', 3200 + Math.random() * 3800, 2800, 0.07, 0.035);
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = 4700;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t + 0.5);
      g.gain.linearRampToValueAtTime(0.045, t + 1.0);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 4.4);
      o.connect(g).connect(master);
      o.start(t + 0.5);
      o.stop(t + 4.5);
    },

    /** Verbindung weg: ein Schwall Rauschen, dann drei Töne. */
    phoneLost() {
      const t = ctx.currentTime;
      const dest = out(1, 0.05);
      noiseHit(dest, t, 0.35, 2200, 0.6, 0.3);
      for (let i = 0; i < 3; i++) tone(dest, t + 0.45 + i * 0.36, 'sine', 425, 425, 0.2, 0.09);
    },

    dispose() {
      try {
        ambience?.sources.forEach((s) => s.stop());
        ctx.close();
      } catch { /* bereits zu */ }
    },
  };
}
