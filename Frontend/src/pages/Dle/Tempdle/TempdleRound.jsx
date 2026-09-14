// TempdleRound.jsx — eine einzelne Rate-Runde: optionales Bild, Eingabe (Slider + Zahlenfeld)
// mit Kalt/Hitze-Effekt, dann Auflösung mit Vergleichsbalken, Differenz und Punktzahl.
import { useState } from 'react';
import { Atom, Globe2, Sparkles, Flame, Snowflake } from 'lucide-react';
import { scoreGuess } from '../scoring';
import { centeredWindow, centeredNormPos, centeredNormPosToValue, roundToAdaptiveStep } from '../guessWindow';

const SLIDER_STEPS = 1000;

// Score → Deckkraft der Akzentfarbe, dieselbe Logik wie shareCard.js (bewusst EIN
// Farbton statt Rot/Gelb/Grün, siehe dortige Begründung).
function scoreColor(score) {
  const alpha = 0.25 + (score / 100) * 0.65;
  return `rgba(139, 92, 246, ${alpha.toFixed(3)})`;
}

// Kalt-warm-Verlauf für die Vergleichsskala — hier bewusst NICHT nur Violett: eine
// Temperaturachse liest sich mit der üblichen Kalt→Warm-Konvention (Blau→Bernstein)
// sofort richtig, ganz ohne Beschriftung. Bleibt gedeckt/dunkel, damit es nicht wie ein
// bunter Regenbogen-Slider wirkt, sondern wie eine echte Skala.
const SCALE_GRADIENT = 'linear-gradient(to right, rgba(96,165,250,0.28), rgba(139,92,246,0.16), rgba(245,158,11,0.28))';

// Ambiente-Effekt beim Ziehen des Reglers: je weiter Richtung Hitze, desto wärmer/roter der
// Schein am Kartenrand, je weiter Richtung Kälte, desto bläulicher. Als INSET-Schatten auf
// der Karte selbst statt einer Hintergrundfläche dahinter — sonst würde das Bild oben an der
// Karte (siehe RoundImage) die Wash einfach komplett verdecken, weil es undurchsichtig direkt
// darüber liegt. Ein Inset-Schatten liegt dagegen sichtbar ÜBER allem, folgt automatisch der
// abgerundeten Kartenform und bleibt am Rand statt großflächig in der Mitte. Reine Rückmeldung
// auf die eigene Eingabe (nicht auf den richtigen Wert) — Gefühl für "das wird jetzt richtig
// heiß/kalt" beim Ziehen.
function ambientShadow(guess, scaleWindow) {
  const t = centeredNormPos(guess, scaleWindow); // 0 kalt … 0.5 neutral … 1 heiß
  const heat = Math.max(0, (t - 0.5) * 2);
  const cold = Math.max(0, (0.5 - t) * 2);
  if (heat > 0.03 && heat >= cold) {
    return `inset 0 0 ${(50 + heat * 70).toFixed(0)}px rgba(249,115,22,${(0.1 + heat * 0.32).toFixed(3)})`;
  }
  if (cold > 0.03) {
    return `inset 0 0 ${(50 + cold * 70).toFixed(0)}px rgba(56,189,248,${(0.1 + cold * 0.28).toFixed(3)})`;
  }
  return 'none';
}

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
      {/* Weicher Übergang zur Kartenfläche statt einer harten Bildkante */}
      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#0e0e1a] to-transparent" />
    </div>
  );
}

// Formatiert °C-Werte lesbar — anders als die Geschwister-Spiele (Velocidle/Duratidle/…)
// fehlte diese Funktion hier bisher komplett: guess/round.value/delta wurden roh als
// JS-Zahl interpoliert. Meist harmlos (z.B. "16.6"), aber Zwischenwerte aus der
// Regler-Mathematik (centeredNormPosToValue, Math.pow/Math.log10) landen nicht immer exakt
// auf einer "glatten" Dezimalzahl — das Ergebnis wurde dann ungerundet mit voller
// Gleitkomma-Länge angezeigt (z.B. "16,600000000...", siehe Nutzer-Meldung).
//
// `maximumFractionDigits` deckelt dabei nur Anzeige-RAUSCHEN (max. 2 Nachkommastellen) — es
// wird NICHT zusätzlich vorab auf eine feste Nachkommastelle gerundet: eine solche Rundung
// zeigte im Ergebnis-Screen eine andere (gröbere) Zahl, als tatsächlich in die Punkteformel
// eingeflossen war, was Schätzung/Istwert/Punktzahl inkonsistent wirken ließ
// (Nutzer-Feedback).
function formatTemperature(v) {
  if (Math.abs(v) > 0 && Math.abs(v) < 1) return v.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  return v.toLocaleString('de-DE', { maximumFractionDigits: 2 });
}

export default function TempdleRound({ round, unit, roundNumber, totalRounds, onDone }) {
  // Reglerfenster [min, max] wird EINMAL pro Runde zufällig gezogen (siehe guessWindow.js) —
  // GuessScaleGamePage.jsx setzt `key={round.id}` auf diese Komponente, ein Rundenwechsel
  // mountet TempdleRound also frisch und zieht dadurch automatisch ein neues Fenster, ohne
  // dass wir das hier manuell zurücksetzen müssten. 0 °C bleibt für JEDE Runde exakt in der
  // Mitte (physikalischer Bezugspunkt, unabhängig vom gesuchten Wert) — nur wie weit das
  // Fenster nach links/rechts reicht, variiert pro Runde und verrät dadurch nicht, wie die
  // Antwort ungefähr aussieht. Reiner Zufall (Math.random) reicht — das Fenster steuert nur
  // die Reglerauflösung, core/scoring.js rechnet unabhängig davon direkt mit |Istwert|.
  const [scaleWindow] = useState(() => centeredWindow(round.value));

  const [guess, setGuess] = useState(0);
  // sliderRaw ist eine EIGENE, unabhängige State — nicht bei jedem Render aus guess
  // neu berechnet. Grund: die Log-Skala hat nahe der Mitte (Werte um 0°C) viele Dutzend
  // Roh-Slider-Schritte, die auf dieselbe gerundete Gradzahl fallen. Würde sliderRaw jedes
  // Mal aus dem gerundeten guess neu hergeleitet, sprang der Regler beim Ziehen innerhalb so
  // eines "Eimers" ständig auf seine kanonische Position zurück, statt dem Mauszeiger zu
  // folgen — genau das Verhalten, das sich wie ein blockierender Slider anfühlt. Mit eigenem
  // State bekommt der Regler beim Ziehen exakt den Rohwert aus dem onChange-Event
  // zurückgespiegelt, ohne Umweg über guess.
  const [sliderRaw, setSliderRaw] = useState(SLIDER_STEPS / 2); // Start exakt in der Mitte (0°C)
  const [revealed, setRevealed] = useState(false);

  const handleGuess = () => setRevealed(true);
  const score = revealed ? scoreGuess(guess, round.value) : null;
  const delta = revealed ? Math.round((guess - round.value) * 10) / 10 : null;

  const CategoryIcon = round.category === 'element' ? Atom : Globe2;

  const handleSlider = (raw) => {
    setSliderRaw(raw);
    setGuess(roundToAdaptiveStep(centeredNormPosToValue(raw / SLIDER_STEPS, scaleWindow)));
  };
  // Zahlenfeld darf frei getippt werden (auch Zwischenwerte während des Tippens) — der
  // Regler zieht nur nach, wenn ein gültiger, sinnvoller Wert vorliegt.
  const handleNumberInput = (value) => {
    setGuess(value);
    if (Number.isFinite(value)) setSliderRaw(Math.round(centeredNormPos(value, scaleWindow) * SLIDER_STEPS));
  };

  const heatT = centeredNormPos(guess, scaleWindow);
  const heat = Math.max(0, (heatT - 0.5) * 2);
  const cold = Math.max(0, (0.5 - heatT) * 2);
  const posPercent = (v) => centeredNormPos(v, scaleWindow) * 100;

  return (
    <div
      className="relative panel p-6 md:p-10 overflow-hidden transition-shadow duration-300 ease-out"
      style={{ boxShadow: revealed ? 'none' : ambientShadow(guess, scaleWindow) }}
    >
      <div className="relative">
        <RoundImage src={round.image} alt="" />

        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-bold uppercase tracking-widest text-violet-300/80">
            Runde {roundNumber} / {totalRounds}
          </span>
          <span className="flex items-center gap-1.5 text-xs font-semibold text-white/40">
            <CategoryIcon size={13} /> {round.category === 'element' ? 'Chemisches Element' : 'Phänomen'}
          </span>
        </div>

        <h2 className="font-display text-xl md:text-3xl font-bold text-white mt-3 mb-6">
          {round.label}
        </h2>

        {!revealed ? (
          <>
            <div className="flex items-end justify-between mb-3">
              <label className="text-sm text-white/60">Deine Schätzung</label>
              <div className="flex items-center gap-2">
                {heat > 0.05 && <Flame size={16} style={{ color: `rgba(249,115,22,${Math.min(1, 0.3 + heat).toFixed(2)})` }} />}
                {cold > 0.05 && <Snowflake size={16} style={{ color: `rgba(56,189,248,${Math.min(1, 0.3 + cold).toFixed(2)})` }} />}
                <div className="flex items-baseline gap-1.5">
                  <input
                    type="number"
                    value={guess}
                    onChange={(e) => handleNumberInput(Number(e.target.value))}
                    className="w-32 bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-right text-white text-lg font-bold tabular-nums focus:outline-none focus:border-violet-400/50"
                  />
                  <span className="text-white/50 text-base font-semibold">{unit}</span>
                </div>
              </div>
            </div>

            <div className="relative h-3 rounded-full mb-1" style={{ background: SCALE_GRADIENT }}>
              {/* Mittelmarkierung bei 0°C — der Slider startet genau hier */}
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
              <span>{formatTemperature(scaleWindow.min)}{unit}</span>
              <span>0{unit} · Mitte</span>
              <span>{formatTemperature(scaleWindow.max)}{unit}+</span>
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
            {/* Vergleichsskala: deine Schätzung vs. richtiger Wert, beide immer beschriftet
                (kein reines Hover-Tooltip — auf dem Handy gibt's kein Hover). */}
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
                <p className="text-white font-bold tabular-nums">{formatTemperature(guess)}{unit}</p>
              </div>
              <div className="panel p-3">
                <p className="text-[11px] uppercase tracking-wider text-white/40 mb-1">Richtig</p>
                <p className="text-white font-bold tabular-nums">{formatTemperature(round.value)}{unit}</p>
              </div>
              <div className="panel p-3">
                <p className="text-[11px] uppercase tracking-wider text-white/40 mb-1">Abweichung</p>
                <p className="text-white font-bold tabular-nums">{delta > 0 ? `+${formatTemperature(delta)}` : formatTemperature(delta)}{unit}</p>
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
    </div>
  );
}
