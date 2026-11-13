// Ego-Volleyball — Töne, erzeugt mit WebAudio (keine Dateien, nichts zu laden).
//
// Der Ton ist hier mehr als Zierde: Aus der Ich-Sicht sieht man den eigenen Körper nicht,
// der Schlag wird erst durch Geräusch und Bildruck spürbar.
const STORE_KEY = "blobby_sound";

function readMuted() {
  try { return localStorage.getItem(STORE_KEY) === "0"; } catch { return false; }
}

export function createSfx() {
  let ctx = null;
  let muted = readMuted();
  let noise = null;

  // Erst bei der ersten Eingabe anlegen — vorher verweigert der Browser den Ton ohnehin
  function ready() {
    if (muted) return null;
    try {
      if (!ctx) {
        const Ctor = window.AudioContext || window.webkitAudioContext;
        if (!Ctor) return null;
        ctx = new Ctor();
        const len = Math.floor(ctx.sampleRate * 0.3);
        noise = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = noise.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      }
      if (ctx.state === "suspended") ctx.resume();
      return ctx;
    } catch {
      return null;
    }
  }

  function tone(from, to, secs, gain, type = "sine", delay = 0) {
    const c = ready();
    if (!c) return;
    const t = c.currentTime + delay;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + secs);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + secs);
    osc.connect(g).connect(c.destination);
    osc.start(t);
    osc.stop(t + secs + 0.02);
  }

  function hiss(secs, gain, freq, q = 0.8) {
    const c = ready();
    if (!c || !noise) return;
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = noise;
    const filter = c.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + secs);
    src.connect(filter).connect(g).connect(c.destination);
    src.start(t);
    src.stop(t + secs + 0.02);
  }

  return {
    /** Ballberührung. kind: 1 Schlag, 2 Zuspiel, 3 Schmetterschlag. vol 0…1 */
    touch(kind, vol = 1) {
      if (kind === 3) { tone(170, 48, 0.2, 0.5 * vol); hiss(0.09, 0.3 * vol, 1800); }
      else if (kind === 1) { tone(230, 80, 0.13, 0.36 * vol); hiss(0.06, 0.18 * vol, 2200); }
      else if (kind === 2) { tone(430, 300, 0.1, 0.2 * vol); }
      else { tone(190, 95, 0.09, 0.22 * vol); }
    },
    /** Eigener Schlag in die Luft (das Rauschen des Arms) */
    swing() { hiss(0.13, 0.07, 900, 0.5); },
    dash() { hiss(0.2, 0.09, 500, 0.4); },
    point(won) {
      if (won) { tone(660, 660, 0.12, 0.16, "triangle"); tone(880, 880, 0.2, 0.16, "triangle", 0.11); }
      else { tone(330, 220, 0.28, 0.14, "triangle"); }
    },
    get muted() { return muted; },
    setMuted(v) {
      muted = !!v;
      try { localStorage.setItem(STORE_KEY, muted ? "0" : "1"); } catch { /* privates Fenster */ }
    },
    close() {
      try { ctx?.close(); } catch { /* schon zu */ }
      ctx = null;
    },
  };
}
