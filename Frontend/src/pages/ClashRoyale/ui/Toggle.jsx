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
 * @param {string}   variant   'arcade' (Minigames: eingelassene Spur, gewölbter Knopf) oder
 *                             'flat' (WinTracker-Editor: bewusst schlichter Stil)
 */
export default function Toggle({
  checked,
  onChange,
  accent = 'bg-violet-500',
  disabled = false,
  variant = 'arcade',
  'aria-label': ariaLabel,
}) {
  const flat = variant === 'flat';
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
      {flat ? (
        <span className={`block w-11 h-6 rounded-full transition-colors duration-200 ${checked ? accent : 'bg-white/10'}`}>
          <span className={`block w-5 h-5 mt-0.5 ml-0.5 bg-white rounded-full shadow transition-transform duration-200 ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`} />
        </span>
      ) : (
        // Eingelassene Spur (Innenschatten, dunkle Kante) + gewölbter Knopf mit Lichtkante —
        // dieselbe Schattierung wie Segment-Spur und Knöpfe im Arcade-Look.
        <span className={`block w-12 h-7 rounded-full border-2 border-[#071225] shadow-[inset_0_2px_4px_rgba(0,0,0,0.45)] transition-colors duration-200 ${checked ? accent : 'bg-[#081426]'}`}>
          <span className={`block w-5 h-5 mt-[2px] ml-[2px] rounded-full bg-gradient-to-b from-white to-[#cfdcee] shadow-[0_2px_0_rgba(2,8,20,0.5)] transition-transform duration-200 ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`} />
        </span>
      )}
    </button>
  );
}
