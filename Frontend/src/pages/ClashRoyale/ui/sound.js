// Einfache UI-Sounds der Clash-Royale-Minigames — per WebAudio synthetisiert statt als
// Audiodateien: keine Downloads, keine neue Abhängigkeit, und jeder Klang ist nur ein paar
// Zeilen Hüllkurve. Bewusst kurz und leise gehalten; die globale Lautstärke kommt aus den
// persönlichen Einstellungen (crPrefs.js → setSoundVolume).
//
// Browser erlauben Audio erst nach einer Nutzereingabe. Der AudioContext entsteht deshalb
// erst beim ersten playSound() (das immer aus einem Klick heraus kommt) und wird bei Bedarf
// wieder aufgeweckt. Schlägt irgendetwas fehl (kein WebAudio, gesperrt), bleibt es still —
// Sounds sind Komfort, nie Voraussetzung.

let ctx = null;
let volume = 0.5; // 0..1

export function setSoundVolume(v) {
  volume = Math.max(0, Math.min(1, Number(v) || 0));
}

function audio() {
  if (typeof window === 'undefined') return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

/** Ein Ton mit kurzer Hüllkurve. freq kann ein [start, ende]-Paar sein (Glissando). */
function tone(ac, { freq, type = 'sine', start = 0, dur = 0.12, gain = 0.3 }) {
  const t0 = ac.currentTime + start;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  const [f0, f1] = Array.isArray(freq) ? freq : [freq, freq];
  osc.frequency.setValueAtTime(f0, t0);
  if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  const peak = gain * volume;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

const SOUNDS = {
  // Knopfdruck: kurzer, weicher "Plopp"
  tap: (ac) => tone(ac, { freq: [520, 360], type: 'triangle', dur: 0.07, gain: 0.22 }),
  // Fenster/Blatt öffnet sich
  open: (ac) => tone(ac, { freq: [300, 620], type: 'sine', dur: 0.14, gain: 0.18 }),
  // Karte genommen / Auswahl bestätigt
  pick: (ac) => {
    tone(ac, { freq: 880, type: 'triangle', dur: 0.08, gain: 0.2 });
    tone(ac, { freq: 1320, type: 'sine', start: 0.05, dur: 0.1, gain: 0.14 });
  },
  // Jemand betritt die Lobby
  join: (ac) => {
    tone(ac, { freq: 660, type: 'sine', dur: 0.1, gain: 0.2 });
    tone(ac, { freq: 990, type: 'sine', start: 0.08, dur: 0.14, gain: 0.18 });
  },
  // Spielstart: aufsteigender Dreiklang
  start: (ac) => {
    [523, 659, 784, 1047].forEach((f, i) => tone(ac, { freq: f, type: 'square', start: i * 0.08, dur: 0.16, gain: 0.1 }));
  },
  // Spielende: kleine Fanfare
  win: (ac) => {
    [[523, 0], [659, 0.1], [784, 0.2], [1047, 0.32]].forEach(([f, s]) =>
      tone(ac, { freq: f, type: 'triangle', start: s, dur: s === 0.32 ? 0.45 : 0.14, gain: 0.22 }));
  },
  // Fehler / nicht erlaubt
  error: (ac) => tone(ac, { freq: [220, 150], type: 'sawtooth', dur: 0.18, gain: 0.08 }),
};

/** Spielt einen der Sounds oben ab — bei Lautstärke 0 oder ohne WebAudio still. */
export function playSound(name) {
  if (volume <= 0) return;
  const fn = SOUNDS[name];
  if (!fn) return;
  const ac = audio();
  if (!ac) return;
  try { fn(ac); } catch { /* Sound ist Komfort — nie die Seite stören */ }
}
