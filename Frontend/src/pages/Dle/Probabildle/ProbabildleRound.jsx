// ProbabildleRound.jsx — eine einzelne Rate-Runde: Bild, Eingabe (Slider + Zahlenfeld), dann
// Auflösung mit Vergleichsbalken, Differenz und Punktzahl.
//
// Die Skala unterscheidet sich von beiden Geschwistern: Tempdle geht unbegrenzt in beide
// Richtungen von einer festen Mitte (0 °C) aus, Velocidle ist unbegrenzt nach oben ab einem
// Nullpunkt. Prozent ist dagegen auf BEIDEN Seiten hart begrenzt (0 % und 100 % sind echte,
// bedeutungsvolle Ränder) — deshalb eine eigene, an beiden Enden gespiegelte Log-Skala mit
// fester Mitte bei 50 %. Für Werte unter 50 % wird die Seltenheit (der Abstand zu 0 %) selbst
// logarithmisch gestaucht, für Werte über 50 % der Abstand zu 100 % — NICHT der Abstand zu
// 50 % selbst (das würde winzige Wahrscheinlichkeiten wie den Lotto-Hauptgewinn und
// alltägliche 10-%-Werte auf fast dieselbe Reglerposition quetschen, weil beide fast denselben
// Abstand zur Mitte haben). So bekommen sowohl sehr seltene (nahe 0 %) als auch sehr sichere
// Ereignisse (nahe 100 %) genug sichtbaren Platz auf dem Regler, genau wie alltägliche Werte
// um die Mitte herum.
import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { scoreGuess } from '../scoring';

const HALF_RANGE = 50; // Prozentpunkte von 0 % bis zur Mitte bzw. von der Mitte bis 100 %
const SLIDER_STEPS = 1000;

// Eigene, kleinere Mindesttoleranz statt core/scoring.js' Standardwert von 7 (siehe
// Backend-Duplikat Backend/dle/core/games/probabildle.js für die ausführliche Begründung:
// 7 Prozentpunkte sind auf der hart begrenzten 0-100-%-Skala 14 % des GESAMTEN Wertebereichs
// — jede Schätzung nahe 0 % bzw. 100 % gab dadurch bei kleinen/großen Istwerten fast
// automatisch ~100 Punkte, egal wie genau tatsächlich geraten wurde. Muss mit dem
// Backend-Wert übereinstimmen, sonst weicht diese Sofort-Anzeige von der später vom Server
// gespeicherten Punktzahl ab.
const MIN_TOLERANCE_PERCENT = 2;

function logHalf(x) {
  // x in [0, HALF_RANGE] -> t in [0, 1], logarithmisch gestaucht (feine Auflösung nahe 0).
  return Math.log10(1 + x) / Math.log10(1 + HALF_RANGE);
}

function logHalfInverse(t) {
  return Math.pow(1 + HALF_RANGE, t) - 1;
}

function normPos(p) {
  const clamped = Math.max(0, Math.min(100, p));
  if (clamped <= 50) {
    return 0.5 * logHalf(clamped); // Seltenheit = Abstand zu 0 %
  }
  return 1 - 0.5 * logHalf(100 - clamped); // "Sicherheit" = Abstand zu 100 %
}

function normPosToValue(pos) {
  const clamped = Math.max(0, Math.min(1, pos));
  if (clamped <= 0.5) {
    return logHalfInverse(clamped / 0.5);
  }
  return 100 - logHalfInverse((1 - clamped) / 0.5);
}

const posPercent = (v) => normPos(v) * 100;

// Score → Deckkraft der Akzentfarbe, dieselbe Logik wie bei Tempdle/Velocidle.
function scoreColor(score) {
  const alpha = 0.25 + (score / 100) * 0.65;
  return `rgba(139, 92, 246, ${alpha.toFixed(3)})`;
}

// "Selten → alltäglich → (fast) sicher"-Verlauf — dieselbe Farbfamilie wie bei den anderen
// -dle-Spielen, damit sich alle als eine visuelle Familie lesen.
const SCALE_GRADIENT = 'linear-gradient(to right, rgba(96,165,250,0.28), rgba(139,92,246,0.16), rgba(245,158,11,0.28))';

function RoundImage({ src, alt }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return null;
  return (
    <div className="relative -mx-6 -mt-6 md:-mx-10 md:-mt-10 mb-6 h-56 md:h-72 overflow-hidden rounded-t-[14px] bg-black/30">
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        className="w-full h-full object-cover"
        onError={() => setFailed(true)}
      />
      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#0e0e1a] to-transparent" />
    </div>
  );
}

// Formatiert Prozentwerte lesbar: sehr kleine Werte (Lotto, Royal Flush) brauchen genug
// Nachkommastellen, sonst zeigt die Anzeige einfach "0 %" an. Ab 1 % BEWUSST kein
// `Math.round()` mehr auf ganze Prozent — das rundete die angezeigte Schätzung/den Istwert
// weg von der tatsächlichen, der Punkteformel zugrundeliegenden Präzision (Nutzer-Feedback).
function formatPercent(v) {
  if (Math.abs(v) > 0 && Math.abs(v) < 1) return v.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
  return v.toLocaleString('de-DE', { maximumFractionDigits: 2 });
}

// Rundet den Regler-Rohwert auf eine Schrittweite, die sich am Abstand zum NÄHEREN Rand
// (0 % oder 100 %) orientiert — nicht auf eine feste "ganze Prozent"-Stufe wie bei den
// anderen -dle-Spielen. Grund: Probabildles Datensatz enthält bewusst ein paar winzige
// Ausreißer (Lotto-Hauptgewinn 0,00001 %, Royal Flush 0,0002 %, Blitzschlag 0,006 %, …) —
// mit einer festen "ganzzahliges Prozent"-Rundung wäre der Regler für die praktisch nie
// erreichbar, jeder Zug würde auf 0 % zurückfallen. Die schon vorhandene gespiegelte
// Log-Skala (normPos/normPosToValue) gibt in Reglerpixeln bereits genug Auflösung nahe den
// Rändern her — nur die Rundung hat diese Auflösung bisher weggeworfen. Bei Werten nahe der
// Mitte (z.B. 50 %) bleibt die Schrittweite weiterhin 1, also ganze Prozent wie gewohnt.
function localRoundingStep(v) {
  const distFromEdge = Math.max(Math.min(Math.abs(v), Math.abs(100 - v)), 1e-9);
  const magnitude = Math.floor(Math.log10(distFromEdge));
  return Math.pow(10, magnitude - 1);
}

function roundToLocalStep(v) {
  const step = localRoundingStep(v);
  return Math.round(v / step) * step;
}

export default function ProbabildleRound({ round, unit, roundNumber, totalRounds, onDone }) {
  const [guess, setGuess] = useState(50);
  const [sliderRaw, setSliderRaw] = useState(SLIDER_STEPS / 2); // Start in der Mitte (50 %)
  const [revealed, setRevealed] = useState(false);

  const handleGuess = () => setRevealed(true);
  const score = revealed ? scoreGuess(guess, round.value, MIN_TOLERANCE_PERCENT) : null;
  const delta = revealed ? Math.round((guess - round.value) * 1000) / 1000 : null;

  // Adaptiv runden statt immer auf ganze Prozent (siehe localRoundingStep oben) — so lassen
  // sich auch die winzigen Ausreißer (Lotto, Royal Flush, Blitzschlag) direkt mit dem Regler
  // exakt treffen, nicht nur übers Zahlenfeld.
  const handleSlider = (raw) => {
    setSliderRaw(raw);
    setGuess(roundToLocalStep(normPosToValue(raw / SLIDER_STEPS)));
  };
  const handleNumberInput = (value) => {
    setGuess(value);
    if (Number.isFinite(value)) setSliderRaw(Math.round(normPos(value) * SLIDER_STEPS));
  };

  return (
    <div className="relative panel p-6 md:p-10 overflow-hidden">
      <RoundImage src={round.image} alt="" />

      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-bold uppercase tracking-widest text-violet-300/80">
          Runde {roundNumber} / {totalRounds}
        </span>
      </div>

      <h2 className="font-display text-xl md:text-3xl font-bold text-white mt-3 mb-6">
        {round.label}
      </h2>

      {!revealed ? (
        <>
          <div className="flex items-end justify-between mb-3">
            <label className="text-sm text-white/60">Deine Schätzung</label>
            <div className="flex items-baseline gap-1.5">
              <input
                type="number"
                value={guess}
                onChange={(e) => handleNumberInput(Number(e.target.value))}
                className="w-40 bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-right text-white text-lg font-bold tabular-nums focus:outline-none focus:border-violet-400/50"
              />
              <span className="text-white/50 text-base font-semibold">{unit}</span>
            </div>
          </div>

          <div className="relative h-3 rounded-full mb-1" style={{ background: SCALE_GRADIENT }}>
            {/* Mittelmarkierung bei 50 % — der Regler startet genau hier */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-px h-5 bg-white/25" />
          </div>
          <input
            type="range"
            min={0}
            max={SLIDER_STEPS}
            step={1}
            value={sliderRaw}
            onChange={(e) => handleSlider(Number(e.target.value))}
            className="w-full h-6 accent-violet-500 -mt-2"
          />
          <div className="flex justify-between text-[11px] text-white/25 mt-1 mb-6">
            <span>0{unit}</span>
            <span>50{unit} · Mitte</span>
            <span>100{unit}</span>
          </div>

          <button
            type="button"
            onClick={handleGuess}
            className="w-full py-3 rounded-lg bg-violet-500 hover:bg-violet-400 text-white font-semibold text-sm transition-colors"
          >
            Raten
          </button>
        </>
      ) : (
        <>
          <div className="relative h-2 rounded-full mt-9 mb-10" style={{ background: SCALE_GRADIENT }}>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-px h-4 bg-white/25" />

            <div className="absolute top-1/2 -translate-y-1/2" style={{ left: `${posPercent(round.value)}%` }}>
              <div className="absolute -translate-x-1/2 w-3.5 h-3.5 rounded-full border-2 border-[#0b0b16] bg-white" />
              <span className="absolute -translate-x-1/2 -top-7 whitespace-nowrap text-[10px] font-bold uppercase tracking-wider text-white/70">
                Richtig
              </span>
            </div>
            <div className="absolute top-1/2 -translate-y-1/2" style={{ left: `${posPercent(guess)}%` }}>
              <div
                className="absolute -translate-x-1/2 w-3.5 h-3.5 rounded-full border-2 border-[#0b0b16]"
                style={{ background: scoreColor(score) }}
              />
              <span className="absolute -translate-x-1/2 top-4 whitespace-nowrap text-[10px] font-bold uppercase tracking-wider text-violet-300/80">
                Du
              </span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-5 text-center">
            <div className="panel p-3">
              <p className="text-[11px] uppercase tracking-wider text-white/40 mb-1">Geschätzt</p>
              <p className="text-white font-bold tabular-nums">{formatPercent(guess)}{unit}</p>
            </div>
            <div className="panel p-3">
              <p className="text-[11px] uppercase tracking-wider text-white/40 mb-1">Richtig</p>
              <p className="text-white font-bold tabular-nums">{formatPercent(round.value)}{unit}</p>
            </div>
            <div className="panel p-3">
              <p className="text-[11px] uppercase tracking-wider text-white/40 mb-1">Abweichung</p>
              <p className="text-white font-bold tabular-nums">{delta > 0 ? `+${formatPercent(delta)}` : formatPercent(delta)}{unit}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 mb-5 panel p-4" style={{ borderColor: scoreColor(score) }}>
            <Sparkles size={18} className="text-violet-300 shrink-0" />
            <p className="text-sm text-white/70">
              <span className="text-white font-bold">{score} Punkte</span> — {round.description}
            </p>
          </div>

          <button
            type="button"
            onClick={() => onDone(guess, score)}
            className="w-full py-3 rounded-lg bg-violet-500 hover:bg-violet-400 text-white font-semibold text-sm transition-colors"
          >
            {roundNumber < totalRounds ? 'Nächste Runde' : 'Ergebnis ansehen'}
          </button>
        </>
      )}
    </div>
  );
}
