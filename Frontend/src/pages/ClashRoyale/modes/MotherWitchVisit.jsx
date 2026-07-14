import React from 'react';
import { MOTHER_WITCH_IMG } from '../data/motherWitchAssets';

// Pop-up-Besuch der Mutterhexe während der Elixir Auction — Sprechblasen-Look bewusst
// abweichend vom sonstigen dunklen UI (weißer Hintergrund, schwarzer Rahmen/Text).
export default function MotherWitchVisit({ visit, onRespond }) {
  if (!visit) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
      <div className="flex items-end gap-4 max-w-xl w-full">
        {MOTHER_WITCH_IMG && (
          <img
            src={MOTHER_WITCH_IMG}
            alt="Mutterhexe"
            className="w-36 h-36 object-cover object-top shrink-0 hidden sm:block"
          />
        )}

        <div className="relative flex-1 bg-white border-2 border-black rounded-sm p-5">
          {/* Sprechblasen-Spitze */}
          <div className="absolute -left-2.5 bottom-9 w-4 h-4 bg-white border-l-2 border-b-2 border-black rotate-45 hidden sm:block" />

          <p className="text-black font-bold text-xs uppercase tracking-wide mb-2">Die Mutterhexe erscheint…</p>
          <p className="text-black text-sm italic mb-3">&bdquo;{visit.greeting}&ldquo;</p>

          <div className="border-t border-black/20 pt-3 mb-3">
            <p className="text-black font-bold text-sm mb-1">{visit.name}</p>
            <p className="text-black text-sm leading-relaxed">{visit.description}</p>
          </div>

          <p className="text-black font-bold text-sm mb-4">Kosten: {visit.cost} Elixier</p>

          <div className="flex gap-3">
            <button
              onClick={() => onRespond(true)}
              className="flex-1 bg-black hover:bg-gray-800 text-white font-bold py-2 rounded-sm border border-black transition-colors text-sm"
            >
              Akzeptieren
            </button>
            <button
              onClick={() => onRespond(false)}
              className="flex-1 bg-white hover:bg-gray-100 text-black font-bold py-2 rounded-sm border border-black transition-colors text-sm"
            >
              Ablehnen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
