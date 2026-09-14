// BalancdleRound.jsx — eine einzelne Rate-Runde: Bild, Eingabe (Slider + Zahlenfeld), dann
// Auflösung mit Vergleichsbalken, Differenz und Punktzahl.
//
// Strukturell praktisch identisch zu VelocidleRound.jsx/PricedleRound.jsx: Gewicht hat wie
// Geschwindigkeit und Preis einen echten, bedeutungsvollen Nullpunkt (0 g) und keine
// sinnvolle negative Seite — deshalb dieselbe reine positive Log-Skala mit pro Runde
// zufällig gezogener Obergrenze aus guessWindow.js (halfLineWindow).
//
// Anzeige-Einheit ist NICHT für den ganzen Datensatz fest ' g' (anders als früher) — ab
// 1000 g wird stattdessen in Kilogramm angezeigt (siehe pickDisplayUnit unten): "190.000 g"
// für einen Löwen liest sich niemand intuitiv vor, "190 kg" dagegen schon. Bewusst eine REINE
// Anzeige-Entscheidung, nur lokal in dieser Komponente: intern (Reglermathematik in Gramm,
// `guess`/`round.value`, die eingereichte Schätzung, die Punkteformel) bleibt buchstäblich
// alles unverändert in Gramm, exakt wie zuvor — nur was auf dem Bildschirm steht und was man
// ins Zahlenfeld tippt, wird für die Anzeige in Kilogramm umgerechnet und beim Eintippen
// wieder zurück. Das hält die bereits kalibrierte Punkteformel (core/scoring.js) unberührt,
// die für Gramm-Größenordnungen abgestimmt ist.
import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { scoreGuess } from '../scoring';
import { halfLineWindow, halfLineNormPos, halfLineNormPosToValue, roundToAdaptiveStep } from '../guessWindow';

const SLIDER_STEPS = 1000;
const KG_THRESHOLD_G = 1000;

// Eigene, kleinere Mindesttoleranz statt core/scoring.js' Standardwert von 7 g (siehe
// Backend-Duplikat Backend/dle/core/games/balancdle.js für die ausführliche Begründung: die
// leichtesten Einträge — Reiskorn, Heftklammer, Biene, … — lagen sonst fast unabhängig von
// der Genauigkeit der Schätzung immer bei ~90+ Punkten). Muss mit dem Backend-Wert
// übereinstimmen, sonst weicht diese Sofort-Anzeige von der später vom Server gespeicherten
// Punktzahl ab.
const MIN_TOLERANCE_WEIGHT = 0.1;

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

// Wählt anhand des ISTWERTS der Runde (nicht der zufällig gezogenen Reglerobergrenze — der
// Istwert bleibt über die ganze Runde stabil, das Reglerfenster soll das nicht beeinflussen)
// eine einzige, für die ganze Runde konsistente Anzeige-Einheit.
function pickDisplayUnit(actualG) {
  return Math.abs(actualG) >= KG_THRESHOLD_G ? { unit: ' kg', factor: 1000 } : { unit: ' g', factor: 1 };
}

// Formatiert einen Gramm-Wert in der übergebenen Anzeige-Einheit — mit bis zu 2
// Nachkommastellen für Kilogramm (12500 g → "12,5 kg" statt grob gerundet "13 kg"), aber ohne
// überflüssige Nullen (toLocaleString lässt sie ohnehin weg, "190 kg" statt "190,00 kg").
function formatWeight(vGrams, factor) {
  return (vGrams / factor).toLocaleString('de-DE', { maximumFractionDigits: 2 });
}

export default function BalancdleRound({ round, roundNumber, totalRounds, onDone }) {
  const { unit, factor } = pickDisplayUnit(round.value);

  // Skalenobergrenze wird EINMAL pro Runde um den Istwert herum gezogen (siehe
  // guessWindow.js) — GuessScaleGamePage.jsx setzt `key={round.id}`, ein Rundenwechsel
  // mountet diese Komponente also frisch und zieht dadurch automatisch eine neue Obergrenze.
  // Reiner Zufall reicht — das Fenster steuert nur die Reglerauflösung, hat mit der
  // Punkteformel nichts zu tun (core/scoring.js rechnet unabhängig davon direkt mit
  // |Istwert|).
  const [{ max: scaleMax }] = useState(() => halfLineWindow(round.value));

  const [guess, setGuess] = useState(0); // in Gramm, siehe Kommentarkopf
  const [sliderRaw, setSliderRaw] = useState(0); // Start bei 0 g — echter, bedeutungsvoller Rand
  const [revealed, setRevealed] = useState(false);

  const handleGuess = () => setRevealed(true);
  const score = revealed ? scoreGuess(guess, round.value, MIN_TOLERANCE_WEIGHT) : null;
  const delta = revealed ? Math.round((guess - round.value) * 100) / 100 : null;

  // Adaptiv runden statt immer auf ganze Gramm (siehe roundToAdaptiveStep in guessWindow.js)
  // — bei leichten Gegenständen mit entsprechend kleinem Reglerfenster blieb der Regler
  // sonst über viele Roh-Schritte auf "0" hängen.
  const handleSlider = (raw) => {
    setSliderRaw(raw);
    setGuess(roundToAdaptiveStep(halfLineNormPosToValue(raw / SLIDER_STEPS, scaleMax)));
  };
  const handleNumberInput = (value) => {
    setGuess(value);
    if (Number.isFinite(value)) setSliderRaw(Math.round(halfLineNormPos(value, scaleMax) * SLIDER_STEPS));
  };
  // Zahlenfeld zeigt/erwartet die Anzeige-Einheit (kg oder g), nicht die intern in Gramm
  // geführte `guess` — Tippen rechnet vor dem Verarbeiten zurück in Gramm um.
  const displayGuess = Math.round((guess / factor) * 1000) / 1000;
  const handleDisplayNumberInput = (displayValue) => handleNumberInput(displayValue * factor);

  const posPercent = (v) => halfLineNormPos(v, scaleMax) * 100;

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
                value={displayGuess}
                onChange={(e) => handleDisplayNumberInput(Number(e.target.value))}
                className="w-40 bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-right text-white text-lg font-bold tabular-nums focus:outline-none focus:border-violet-400/50"
              />
              <span className="text-white/50 text-base font-semibold">{unit}</span>
            </div>
          </div>

          <div className="relative h-3 rounded-full mb-1" style={{ background: SCALE_GRADIENT }} />
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
            <span>{formatWeight(scaleMax, factor)}{unit}+</span>
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
              <p className="text-white font-bold tabular-nums">{formatWeight(guess, factor)}{unit}</p>
            </div>
            <div className="panel p-3">
              <p className="text-[11px] uppercase tracking-wider text-white/40 mb-1">Richtig</p>
              <p className="text-white font-bold tabular-nums">{formatWeight(round.value, factor)}{unit}</p>
            </div>
            <div className="panel p-3">
              <p className="text-[11px] uppercase tracking-wider text-white/40 mb-1">Abweichung</p>
              <p className="text-white font-bold tabular-nums">{delta > 0 ? `+${formatWeight(delta, factor)}` : formatWeight(delta, factor)}{unit}</p>
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
