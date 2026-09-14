// DuratidleRound.jsx — eine einzelne Rate-Runde: Bild, Eingabe (Slider + Zahlenfeld), dann
// Auflösung mit Vergleichsbalken, Differenz und Punktzahl.
//
// Größter Unterschied zu Tempdle/Velocidle/Probabildle: die drei haben je EINE feste Einheit
// für den ganzen Datensatz (°C, km/h, %). Dauer braucht zwingend unterschiedliche Einheiten
// pro Runde (siehe Backend/dle/core/games/duratidle.js) — ein Flügelschlag in Sekunden wäre
// eine lächerliche Kommazahl, eine Königinnen-Regierungszeit in Millisekunden eine
// unlesbare Ziffernwurst. `round.unit` (statt eines global gesetzten `unit`-Props) bestimmt
// deshalb pro Runde die Anzeige- UND Rate-Einheit.
//
// Daraus folgt: die Reglerskala kann nicht wie bei Velocidle eine einzige feste Obergrenze
// haben (150 km/h und 150 Jahre sind grundverschiedene Reglerbereiche). Stattdessen wird die
// Obergrenze PRO RUNDE zufällig um den Istwert herum gezogen — dieselbe geteilte Logik wie
// jetzt auch bei Tempdle/Velocidle, siehe guessWindow.js für die ausführliche Begründung
// (kurz: eine feste Formel wie "Istwert × 2,4" würde durch die sichtbaren Reglergrenzen
// selbst verraten, wo ungefähr die Antwort liegt).
import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { scoreGuess } from '../scoring';
import { halfLineWindow, halfLineNormPos, halfLineNormPosToValue, roundToAdaptiveStep } from '../guessWindow';

const SLIDER_STEPS = 1000;

// Eigene, kleinere Mindesttoleranz statt core/scoring.js' Standardwert von 7 (siehe
// Backend-Duplikat Backend/dle/core/games/duratidle.js für die ausführliche Begründung: fast
// die Hälfte aller Einträge hat einen Istwert unter 14 in ihrer jeweils EIGENEN Einheit —
// z.B. "1 Millisekunde" beim Kamerablitz —, wodurch der Mindestwert von 7 dort die eigentlich
// vorgesehene proportionale Toleranz komplett überschrieb. Muss mit dem Backend-Wert
// übereinstimmen, sonst weicht diese Sofort-Anzeige von der später vom Server gespeicherten
// Punktzahl ab.
const MIN_TOLERANCE_DURATION = 1;

// Score → Deckkraft der Akzentfarbe, dieselbe Logik wie bei den Geschwister-Spielen.
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

// BEWUSST kein `Math.round()` mehr auf ganze Einheiten — siehe VelocidleRound.jsx-Kommentar:
// das rundete die angezeigte Schätzung/den Istwert weg von der tatsächlichen, der
// Punkteformel zugrundeliegenden Präzision (Nutzer-Feedback).
function formatDuration(v) {
  if (Math.abs(v) > 0 && Math.abs(v) < 1) return v.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  return v.toLocaleString('de-DE', { maximumFractionDigits: 2 });
}

export default function DuratidleRound({ round, unit, roundNumber, totalRounds, onDone }) {
  const roundUnit = round.unit || unit;
  // Einmal pro Runde gezogen (siehe guessWindow.js) — GuessScaleGamePage.jsx setzt
  // `key={round.id}`, ein Rundenwechsel mountet diese Komponente also frisch und zieht
  // dadurch automatisch eine neue, unabhängige Obergrenze. Reiner Zufall reicht — das
  // Fenster steuert nur die Reglerauflösung, hat mit der Punkteformel nichts zu tun
  // (core/scoring.js rechnet unabhängig davon direkt mit |Istwert|).
  const [{ max: scaleMax }] = useState(() => halfLineWindow(round.value));

  const [guess, setGuess] = useState(0);
  const [sliderRaw, setSliderRaw] = useState(0); // Start bei 0 — echter, bedeutungsvoller Rand
  const [revealed, setRevealed] = useState(false);

  const handleGuess = () => setRevealed(true);
  const score = revealed ? scoreGuess(guess, round.value, MIN_TOLERANCE_DURATION) : null;
  const delta = revealed ? Math.round((guess - round.value) * 1000) / 1000 : null;

  // Adaptiv runden statt immer auf ganze Einheiten (siehe roundToAdaptiveStep in
  // guessWindow.js) — gerade bei Duratidles oft kleinen Werten (Millisekunden, wenige
  // Sekunden) blieb der Regler sonst über viele Roh-Schritte auf "0" hängen.
  const handleSlider = (raw) => {
    setSliderRaw(raw);
    setGuess(roundToAdaptiveStep(halfLineNormPosToValue(raw / SLIDER_STEPS, scaleMax)));
  };
  const handleNumberInput = (value) => {
    setGuess(value);
    if (Number.isFinite(value)) setSliderRaw(Math.round(halfLineNormPos(value, scaleMax) * SLIDER_STEPS));
  };

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
                value={guess}
                onChange={(e) => handleNumberInput(Number(e.target.value))}
                className="w-40 bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-right text-white text-lg font-bold tabular-nums focus:outline-none focus:border-violet-400/50"
              />
              <span className="text-white/50 text-base font-semibold">{roundUnit}</span>
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
            <span>0{roundUnit}</span>
            <span>{formatDuration(scaleMax)}{roundUnit}+</span>
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
              <p className="text-white font-bold tabular-nums">{formatDuration(guess)}{roundUnit}</p>
            </div>
            <div className="panel p-3">
              <p className="text-[11px] uppercase tracking-wider text-white/40 mb-1">Richtig</p>
              <p className="text-white font-bold tabular-nums">{formatDuration(round.value)}{roundUnit}</p>
            </div>
            <div className="panel p-3">
              <p className="text-[11px] uppercase tracking-wider text-white/40 mb-1">Abweichung</p>
              <p className="text-white font-bold tabular-nums">{delta > 0 ? `+${formatDuration(delta)}` : formatDuration(delta)}{roundUnit}</p>
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
