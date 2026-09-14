// Eine Einstellungszeile im Host-Panel: Symbol, Titel, Bedienelement, Erklärung.
//
// Diese Struktur — Überschrift mit Symbol, darunter das Bedienelement, darunter ein
// grauer Hinweistext, optional eine rote Warnung — stand in der Lobby vierzehnmal
// von Hand ausgeschrieben. Jede Kopie hatte leicht andere Abstände. Ab hier gibt es
// genau eine Definition.

import React from 'react';

/**
 * @param {React.ElementType} icon    lucide-Symbol (optional)
 * @param {string}   iconClass         Farbklasse des Symbols, z.B. 'text-fuchsia-400'
 * @param {string}   label             Überschrift der Einstellung
 * @param {string}   note              Erklärender Text darunter (optional)
 * @param {string}   warning           Rote Warnung ganz unten (optional)
 * @param {boolean}  inline            true = Bedienelement rechts neben dem Titel
 *                                     (für Toggles), sonst darunter (für Slider)
 */
export default function SettingRow({
  icon: Icon,
  iconClass = 'text-white/40',
  label,
  note,
  warning,
  inline = false,
  children,
}) {
  const heading = (
    <p className="text-white text-sm font-semibold flex items-center gap-2">
      {Icon && <Icon size={13} className={`${iconClass} shrink-0`} />}
      {label}
    </p>
  );

  if (inline) {
    return (
      <div>
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            {heading}
            {note && <p className="text-white/30 text-xs mt-0.5">{note}</p>}
          </div>
          {children}
        </div>
        {warning && <p className="text-red-400 text-xs mt-1.5">{warning}</p>}
      </div>
    );
  }

  return (
    <div>
      {heading}
      <div className="mt-2.5">{children}</div>
      {note && <p className="text-white/30 text-xs mt-2">{note}</p>}
      {warning && <p className="text-red-400 text-xs mt-1.5">{warning}</p>}
    </div>
  );
}

/**
 * Segmentierte Auswahl für Einstellungen mit wenigen, benannten Zuständen —
 * z.B. das Aufdecksystem des Karussells (Dynamisch / Immer 2 / Immer 1). Ein Slider
 * wäre hier falsch: die Optionen sind keine Skala.
 *
 * @param {Array}    options   [{ id, label, disabled?, title?, icon? }] — icon ist ein
 *                             optionales lucide-Symbol VOR dem Label, für Wahlen, bei denen
 *                             ein Icon die Option schneller erkennbar macht als reiner Text.
 * @param {*}        value     Aktuell gewählte id
 * @param {Function} onChange  Bekommt die neue id
 * @param {string}   accent    Tailwind-Klassen für den aktiven Zustand
 */
export function SegmentedControl({
  options,
  value,
  onChange,
  accent = 'bg-violet-500 text-white',
  disabled = false,
}) {
  return (
    // flex-wrap statt Scrollcontainer: bei 5+ Optionen (Rastergröße, Angel-Cooldown)
    // bricht die Reihe auf dem Handy sauber um, statt seitlich zu verschwinden.
    <div className="flex flex-wrap gap-1.5" role="group">
      {options.map(opt => {
        const active = opt.id === value;
        const isDisabled = disabled || opt.disabled;
        const Icon = opt.icon;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => !isDisabled && onChange(opt.id)}
            disabled={isDisabled}
            title={opt.title}
            aria-pressed={active}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
              isDisabled
                ? 'bg-black/30 text-white/20 cursor-not-allowed'
                : active
                  ? accent
                  : 'bg-black/30 text-white/50 hover:text-white hover:bg-black/50'
            }`}>
            {Icon && <Icon size={13} />}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
