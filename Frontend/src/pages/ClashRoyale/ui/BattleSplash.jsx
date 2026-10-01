// Kurze Einblendung beim Übergang Lobby → Spiel: gekreuzte Schwerter + Modusname, wie der
// "Kampf!"-Moment im Spiel. Rein dekorativ (pointer-events: none), nach ~1,4 s von
// ClashRoyalePage wieder ausgehängt — blockiert also nie einen Klick im gerade startenden Modus.
import React from 'react';
import { CrBattle } from './CrIcons';

export default function BattleSplash({ title }) {
  return (
    <div className="fixed inset-0 z-[60] pointer-events-none flex items-center justify-center" aria-hidden="true">
      <div className="cr-splash-bg absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(11,26,48,0.75),rgba(3,8,20,0.9))]" />
      <div className="cr-splash relative flex flex-col items-center gap-2">
        <CrBattle size={120} />
        <p className="cr-arcade-title text-4xl sm:text-6xl text-center px-4">{title}</p>
      </div>
    </div>
  );
}
