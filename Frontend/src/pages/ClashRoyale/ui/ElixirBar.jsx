// Der Elixierbalken — einmal richtig gebaut statt in Elixir Rush und Elixir Auction je
// eigenen Anlauf zu haben (die Auktion zeichnete den Vorrat sogar zweimal verschieden:
// dünner Streifen in der Kopfzeile, eigene Zahl in der Fußzeile).
//
// AUSSEHEN: Die Kachel im Spiel selbst hat einen einzelnen kräftigen Verlauf über die
// GANZE Füllung, keine 3-4 Farbstopps mehr — vorher liefen ihn drei Töne (hell-Rosa →
// Pink → Violett) hoch, was auf einem 6-14px hohen Balken vor allem wie ein weicher
// Farbmatsch aussah. Jetzt: EIN Ton als Fläche plus ein schmaler heller Glanzstreifen
// oben — der klassische Cartoon-Trick für "glänzende Kapsel" (Flash-Games, mobile
// Spiele), der ohne echten Verlauf auskommt und auf einem dünnen Balken auch bei
// 100% Zoom nicht bandet.
//
// ICON: Der echte Elixier-Tropfen aus dem Spiel (elixir_1.png) statt der selbst
// gezeichneten <ElixirDrop>-Krontur — die SVG bleibt für Fließtext-große Stellen (11-14px,
// oft ein Dutzend Mal pro Bildschirm) im Einsatz, siehe ui/CrIcons.jsx; hier, wo der
// Tropfen als eigenständiges Icon sitzt, darf es die echte Grafik sein.
import React from 'react';
import elixirDropImg from '../../../assets/clashRoyale/ui/elixir_1.png';

// Natürliches Seitenverhältnis von elixir_1.png (85×99, nach dem Zuschneiden) — damit die
// Breite bei jeder Höhe passend mitwächst, statt den Tropfen zu stauchen.
const ELIXIR_ASPECT = 85 / 99;

/**
 * Großer, eigenständiger Elixier-Betrag: der Tropfen selbst trägt die Zahl, genau wie im
 * Original — statt Icon und Zahl nebeneinander zu zeigen. Die Zahl sitzt dafür nicht
 * geometrisch mittig, sondern etwas unterhalb: der Tropfen ist oben spitz und unten rund,
 * der Bauch (wo auch die echte Grafik die Zahl trägt) liegt im unteren Drittel.
 *
 * Von Elixir Rush (Fußzeile) UND Elixir Auction (Fußzeile, Gebots-Hinweise) genutzt —
 * vorher hatte jeder Modus dafür eine eigene, leicht andere Lösung.
 *
 * @param {number} value  Anzuzeigende Zahl (schon gerundet/formatiert vom Aufrufer)
 * @param {number} size   Höhe des Tropfens in px; die Breite ergibt sich aus ELIXIR_ASPECT
 */
export function ElixirAmount({ value, size = 56 }) {
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size * ELIXIR_ASPECT, height: size }}>
      <img src={elixirDropImg} alt="" style={{ width: '100%', height: '100%' }} />
      <span className="absolute inset-x-0 flex items-center justify-center font-arcade font-black text-white tabular-nums"
        style={{ top: '46%', fontSize: size * 0.32, textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
        {value}
      </span>
    </span>
  );
}

/**
 * @param {number}  value   Aktueller Vorrat (kann Nachkommastellen haben, siehe Elixir Rush)
 * @param {number}  max     Kapazität des Balkens
 * @param {'sm'|'lg'} size  'sm' = Zeile in einer Spielerkachel, 'lg' = große Anzeige in der Fußleiste
 * @param {boolean} ticks   Segment-Striche zeichnen (nur bei ganzzahligem max sinnvoll)
 */
export default function ElixirBar({ value, max = 10, size = 'sm', ticks = size === 'lg' }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const whole = Math.floor(value + 1e-6);

  if (size === 'sm') {
    return (
      <div className="flex items-center gap-2">
        <img src={elixirDropImg} alt="" width={16} height={16} className="shrink-0" />
        <div className="flex-1 relative h-2.5 rounded-full overflow-hidden bg-[#1a0f24]"
          style={{ border: '2px solid var(--cr-arcade-ink)' }}>
          <div className="absolute inset-0 rounded-full" style={{ width: `${pct}%`, background: '#d926e0' }}>
            <div className="absolute inset-x-0 top-0 h-[3px] bg-white/40 rounded-full" />
          </div>
        </div>
        <span className="text-fuchsia-200 font-arcade font-bold text-xs tabular-nums w-5 text-right shrink-0">
          {whole}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      {/* Größerer Tropfen mit der Zahl direkt darauf statt eines kleinen Kreis-Abzeichens
          mit Icon+Zahl nebeneinander — dieselbe Darstellung wie in Elixir Auction. */}
      <ElixirAmount value={whole} size={52} />

      <div className="flex-1 relative h-8 rounded-full overflow-hidden bg-[#1a0f24]"
        style={{ border: '3px solid var(--cr-arcade-ink)' }}>
        <div className="absolute inset-y-0 left-0 transition-[width] duration-100 ease-linear rounded-full"
          style={{ width: `${pct}%`, background: '#d926e0' }}>
          <div className="absolute inset-x-0 top-0 h-2 bg-white/35 rounded-full" />
        </div>
        {ticks && Array.from({ length: max - 1 }, (_, i) => (
          <div key={i} className="absolute inset-y-0 w-px bg-black/40" style={{ left: `${((i + 1) / max) * 100}%` }} />
        ))}
        <div className="absolute inset-0 flex items-center justify-end pr-3.5 pointer-events-none">
          <span className="text-white font-arcade font-bold text-sm tabular-nums" style={{ textShadow: '0 1px 0 rgba(0,0,0,0.4)' }}>
            {value.toFixed(max % 1 === 0 && Number.isInteger(value) ? 0 : 1)} / {max}
          </span>
        </div>
      </div>
    </div>
  );
}
