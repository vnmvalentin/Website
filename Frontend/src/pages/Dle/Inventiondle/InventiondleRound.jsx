// InventiondleRound.jsx — eine einzelne Rate-Runde: optionales Bild, Eingabe (Slider +
// Zahlenfeld), dann Auflösung mit Vergleichsbalken, Differenz und Punktzahl.
//
// Strukturell praktisch identisch zu TempdleRound.jsx: Jahr 0 (der Übergang v. Chr./n. Chr.)
// ist wie 0°C bei Tempdle ein echter, bedeutungsvoller fester Bezugspunkt, deshalb dieselbe
// an einer festen Mitte gespiegelte Log-Skala aus guessWindow.js (centeredWindow). Ohne die
// Kalt/Hitze-Metapher, die für Jahreszahlen keinen Sinn ergibt — kein Ambiente-Glow, keine
// Flame/Snowflake-Icons.
import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { scoreYearGuess } from '../yearScoring';
import { centeredWindow, centeredNormPos, centeredNormPosToValue, roundToAdaptiveStep } from '../guessWindow';

const SLIDER_STEPS = 1000;

function scoreColor(score) {
  const alpha = 0.25 + (score / 100) * 0.65;
  return `rgba(139, 92, 246, ${alpha.toFixed(3)})`;
}

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

// Formatiert eine Jahreszahl lesbar mit v. Chr./n. Chr. statt eines bloßen Vorzeichens —
// "-3500" liest sich sofort schlechter als "3500 v. Chr.".
function formatYear(y) {
  const rounded = Math.round(y);
  return rounded < 0 ? `${Math.abs(rounded).toLocaleString('de-DE')} v. Chr.` : `${rounded.toLocaleString('de-DE')} n. Chr.`;
}

// Hartes Limit fürs Reglerfenster — reine UX-Deckelung (kein Erfindungsjahr in der Zukunft),
// betrifft NUR die Regler-DARSTELLUNG. Ohne sie hätte z.B. das iPhone (2007) ein Fenster bis
// Jahr 5000+ bekommen können (die generische Kopfraum-Formel aus guessWindow.js kennt diese
// Grenze nicht von selbst) — ein Regler, der bis "5000 n. Chr." reicht, wirkt fürs Raten
// eines vergangenen Ereignisses einfach absurd. Die Punkteformel (core/scoring.js) rechnet
// unabhängig davon direkt mit |Istwert|, betrifft diese Deckelung also nicht.
const WINDOW_OPTIONS = { hardMax: 2050, hardMin: -10000 };

export default function InventiondleRound({ round, roundNumber, totalRounds, onDone }) {
  // Reglerfenster [min, max] wird EINMAL pro Runde gezogen (siehe guessWindow.js) —
  // GuessScaleGamePage.jsx setzt `key={round.id}`, ein Rundenwechsel mountet diese Komponente
  // also frisch und zieht dadurch automatisch ein neues Fenster. Jahr 0 bleibt für JEDE Runde
  // exakt in der Mitte, nur wie weit das Fenster nach v. Chr./n. Chr. reicht, variiert pro
  // Runde (innerhalb von WINDOW_OPTIONS' Grenzen). Reiner Zufall reicht — das Fenster steuert
  // nur die Reglerauflösung, hat mit der Punkteformel nichts zu tun.
  const [scaleWindow] = useState(() => centeredWindow(round.value, Math.random, WINDOW_OPTIONS));

  const [guess, setGuess] = useState(0);
  const [sliderRaw, setSliderRaw] = useState(SLIDER_STEPS / 2); // Start exakt in der Mitte (Jahr 0)
  const [revealed, setRevealed] = useState(false);

  const handleGuess = () => setRevealed(true);
  const score = revealed ? scoreYearGuess(guess, round.value) : null;
  const delta = revealed ? Math.round(guess - round.value) : null;

  // Adaptiv runden statt immer auf ganze Jahre (siehe roundToAdaptiveStep in guessWindow.js)
  // — bei Jahreszahlen nah an 0 blieb der Regler sonst über viele Roh-Schritte hängen.
  const handleSlider = (raw) => {
    setSliderRaw(raw);
    setGuess(roundToAdaptiveStep(centeredNormPosToValue(raw / SLIDER_STEPS, scaleWindow)));
  };
  const handleNumberInput = (value) => {
    setGuess(value);
    if (Number.isFinite(value)) setSliderRaw(Math.round(centeredNormPos(value, scaleWindow) * SLIDER_STEPS));
  };

  const posPercent = (v) => centeredNormPos(v, scaleWindow) * 100;

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
            <label className="text-sm text-white/60">Deine Schätzung (Jahr)</label>
            <div className="flex items-baseline gap-1.5">
              <input
                type="number"
                value={guess}
                onChange={(e) => handleNumberInput(Number(e.target.value))}
                className="w-32 bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-right text-white text-lg font-bold tabular-nums focus:outline-none focus:border-violet-400/50"
              />
            </div>
          </div>

          <div className="relative h-3 rounded-full mb-1" style={{ background: SCALE_GRADIENT }}>
            {/* Mittelmarkierung bei Jahr 0 — der Slider startet genau hier */}
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
            <span>{formatYear(scaleWindow.min)}</span>
            <span>Jahr 0 · Mitte</span>
            <span>{formatYear(scaleWindow.max)}</span>
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
              <p className="text-white font-bold tabular-nums">{formatYear(guess)}</p>
            </div>
            <div className="panel p-3">
              <p className="text-[11px] uppercase tracking-wider text-white/40 mb-1">Richtig</p>
              <p className="text-white font-bold tabular-nums">{formatYear(round.value)}</p>
            </div>
            <div className="panel p-3">
              <p className="text-[11px] uppercase tracking-wider text-white/40 mb-1">Abweichung</p>
              <p className="text-white font-bold tabular-nums">{delta > 0 ? `+${delta}` : delta} Jahre</p>
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
