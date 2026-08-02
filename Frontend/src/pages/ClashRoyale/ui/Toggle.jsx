// Schalter für Ja/Nein-Einstellungen.
//
// Ersetzt die handgebaute Variante, die in der Lobby viermal identisch stand
// (Elixier anzeigen, Restzeit-Timer, Mutterhexe …) und weder ein role noch einen
// aria-checked hatte — für Screenreader war das nur ein namenloser Button.

import React from 'react';

/**
 * @param {boolean}  checked
 * @param {Function} onChange  Bekommt den NEUEN Zustand
 * @param {string}   accent    Tailwind-Klasse für "an", z.B. 'bg-fuchsia-500'
 * @param {boolean}  disabled
 */
export default function Toggle({
  checked,
  onChange,
  accent = 'bg-violet-500',
  disabled = false,
  'aria-label': ariaLabel,
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      // p-2.5/-m-2.5: vergrößert die Trefferfläche auf 44px Höhe, ohne die sichtbare
      // Größe oder den Abstand zu den Nachbarn zu verändern. Ein 24px hoher Schalter
      // ist auf dem Handy sonst kaum zu treffen.
      className="relative shrink-0 p-2.5 -m-2.5 rounded-full transition-opacity disabled:opacity-40 disabled:cursor-not-allowed">
      <span className={`block w-11 h-6 rounded-full transition-colors duration-200 ${checked ? accent : 'bg-white/10'}`}>
        <span className={`block w-5 h-5 mt-0.5 ml-0.5 bg-white rounded-full shadow transition-transform duration-200 ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`} />
      </span>
    </button>
  );
}
