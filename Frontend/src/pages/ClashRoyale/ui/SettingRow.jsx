// Eine Einstellungszeile im Einstellungsfenster: Symbol, Titel, Bedienelement, Erklärung.
//
// Diese Struktur — Überschrift mit Symbol, darunter das Bedienelement, darunter ein
// grauer Hinweistext, optional eine rote Warnung — stand in der Lobby vierzehnmal
// von Hand ausgeschrieben. Jede Kopie hatte leicht andere Abstände. Ab hier gibt es
// genau eine Definition.
//
// Sept. 2026: Jede Zeile ist ein Abschnitt (.cr-section) der gemeinsamen Fläche des
// Fensters — getrennt durch eine eingeprägte Fuge statt als lose Einzelelemente.

import React from 'react';

/**
 * @param {React.ElementType} icon    Symbol (CR-Grafik oder lucide, optional)
 * @param {string}   iconClass         Zusatzklassen für das Symbol
 * @param {string}   label             Überschrift der Einstellung
 * @param {string}   note              Erklärender Text darunter (optional)
 * @param {string}   warning           Rote Warnung ganz unten (optional)
 * @param {boolean}  inline            true = Bedienelement rechts neben dem Titel
 *                                     (für Toggles), sonst darunter (für Slider)
 */
export default function SettingRow({
  icon: Icon,
  iconClass = '',
  label,
  note,
  warning,
  inline = false,
  children,
}) {
  const heading = (
    <p className="font-cr text-white text-base leading-tight flex items-center gap-2.5">
      {Icon && <Icon size={24} className={`shrink-0 ${iconClass}`} />}
      {label}
    </p>
  );

  if (inline) {
    return (
      <div className="cr-section">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            {heading}
            {note && <p className={`text-white/50 text-xs mt-1 ${Icon ? 'pl-[34px]' : ''}`}>{note}</p>}
          </div>
          {children}
        </div>
        {warning && <p className={`text-red-400 text-xs mt-1.5 ${Icon ? 'pl-[34px]' : ''}`}>{warning}</p>}
      </div>
    );
  }

  return (
    <div className="cr-section">
      {heading}
      <div className="mt-3">{children}</div>
      {note && <p className="text-white/50 text-xs mt-2">{note}</p>}
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
 *                             optionales Symbol VOR dem Label.
 * @param {*}        value     Aktuell gewählte id
 * @param {Function} onChange  Bekommt die neue id
 * @param {string}   accent    Tailwind-Klassen für den aktiven Zustand (nur Variante 'flat';
 *                             im Arcade-Look trägt das aktive Segment die Spur-Farbe)
 * @param {string}   variant   'arcade' = alle Optionen auf EINER eingelassenen Spur (Minigames),
 *                             'flat' = lose Einzelknöpfe (WinTracker-Editor, bewusst schlicht)
 */
export function SegmentedControl({
  options,
  value,
  onChange,
  accent = 'bg-violet-500 text-white',
  disabled = false,
  variant = 'arcade',
}) {
  if (variant === 'arcade') {
    return (
      <div className="cr-seg" role="group">
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
              aria-pressed={active}>
              {Icon && <Icon size={16} />}
              {opt.label}
            </button>
          );
        })}
      </div>
    );
  }

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
