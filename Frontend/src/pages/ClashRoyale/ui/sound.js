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

/**
 * Ein Ton mit kurzer Hüllkurve. freq kann ein [start, ende]-Paar sein (Glissando).
 * atk = Einschwingzeit (kurz = knackiger), lp = optionaler Tiefpass in Hz (nimmt die Schärfe aus
 * Rechteck/Sägezahn). Die Rezepte unten stammen aus der Klangbibliothek
 * (claude.ai/artifact/WrL3SexXfQXUw9vRPmMM5S) und sind dort 1:1 anhörbar.
 */
function tone(ac, { freq, type = 'sine', start = 0, dur = 0.12, gain = 0.3, atk = 0.012, lp = 0 }) {
  const t0 = ac.currentTime + start;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  const [f0, f1] = Array.isArray(freq) ? freq : [freq, freq];
  osc.frequency.setValueAtTime(f0, t0);
  if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  const peak = gain * volume;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + Math.min(atk, dur * 0.5));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  let out = osc;
  if (lp) {
    const filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lp;
    osc.connect(filter);
    out = filter;
  }
  out.connect(g).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

const SOUNDS = {
  // Knopfdruck ("Kissen"): tiefer, runder Sinus — der häufigste Klang, deshalb bewusst unaufdringlich
  tap: (ac) => tone(ac, { freq: [260, 180], dur: 0.08, gain: 0.25, atk: 0.004 }),
  // Walze/Auslosung, eine vorbeilaufende Kachel ("Murmel") — sehr kurz, spielt in schneller Folge
  tick: (ac) => tone(ac, { freq: 1200, dur: 0.025, gain: 0.1, atk: 0.001 }),
  // Walze bleibt stehen / Auslosung fertig ("Ta-da sanft")
  land: (ac) => {
    tone(ac, { freq: 659, type: 'triangle', dur: 0.12, gain: 0.15, atk: 0.004 });
    tone(ac, { freq: 988, type: 'triangle', start: 0.09, dur: 0.4, gain: 0.15, atk: 0.004 });
  },
  // Countdown-Zahl 3, 2, 1 ("Beep weich")
  count: (ac) => tone(ac, { freq: 880, type: 'triangle', dur: 0.09, gain: 0.1, atk: 0.003, lp: 2500 }),
  // Fenster/Blatt öffnet sich ("Aufklappen")
  open: (ac) => tone(ac, { freq: [400, 800], dur: 0.1, gain: 0.1, atk: 0.012 }),
  // Karte genommen / Auswahl bestätigt ("Bestätigt": Quinte nach oben)
  pick: (ac) => {
    tone(ac, { freq: 784, type: 'triangle', dur: 0.07, gain: 0.14, atk: 0.003 });
    tone(ac, { freq: 1175, type: 'triangle', start: 0.06, dur: 0.12, gain: 0.12, atk: 0.003 });
  },
  // Jemand betritt die Lobby ("Freundlich")
  join: (ac) => {
    tone(ac, { freq: 587, type: 'triangle', dur: 0.12, gain: 0.13, atk: 0.004 });
    tone(ac, { freq: 880, type: 'triangle', start: 0.1, dur: 0.2, gain: 0.13, atk: 0.004 });
  },
  // Spielstart ("Arena-Horn"): gedämpfte Sägezahn-Quarte
  start: (ac) => {
    tone(ac, { freq: 262, type: 'sawtooth', dur: 0.25, gain: 0.08, atk: 0.02, lp: 1200 });
    tone(ac, { freq: 392, type: 'sawtooth', start: 0.15, dur: 0.55, gain: 0.08, atk: 0.02, lp: 1200 });
  },
  // Spielende ("Krone"): Dreiklang, langer Schlusston mit Glitzer
  win: (ac) => {
    [784, 988, 1175].forEach((f, i) => tone(ac, { freq: f, type: 'triangle', start: i * 0.09, dur: 0.12, gain: 0.14, atk: 0.003 }));
    tone(ac, { freq: 1568, type: 'triangle', start: 0.27, dur: 0.6, gain: 0.15, atk: 0.003 });
    tone(ac, { freq: 3136, start: 0.3, dur: 0.5, gain: 0.03, atk: 0.003 });
  },
  // Fehler / nicht erlaubt ("Zwei tief"): absteigende Terz
  error: (ac) => {
    tone(ac, { freq: 330, type: 'triangle', dur: 0.08, gain: 0.12, atk: 0.003 });
    tone(ac, { freq: 262, type: 'triangle', start: 0.1, dur: 0.12, gain: 0.12, atk: 0.003 });
  },
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
