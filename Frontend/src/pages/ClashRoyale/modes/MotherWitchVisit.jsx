import React from 'react';
import { MOTHER_WITCH_IMG } from '../data/motherWitchAssets';
import ChunkyButton from '../ui/ChunkyButton';

const MOTHER_WITCH_VISIT_I18N = {
  de: {
    alt: 'Mutterhexe',
    appears: 'Die Mutterhexe erscheint…',
    cost: (cost) => `Kosten: ${cost} Elixier`,
    accept: 'Akzeptieren',
    decline: 'Ablehnen',
  },
  en: {
    alt: 'Mother Witch',
    appears: 'The Mother Witch appears…',
    cost: (cost) => `Cost: ${cost} elixir`,
    accept: 'Accept',
    decline: 'Decline',
  },
  es: {
    alt: 'Madre Bruja',
    appears: 'Aparece la Madre Bruja…',
    cost: (cost) => `Coste: ${cost} de elixir`,
    accept: 'Aceptar',
    decline: 'Rechazar',
  },
};

// Pop-up-Besuch der Mutterhexe während der Elixir Auction — Sprechblasen-Look bewusst
// abweichend vom sonstigen dunklen UI (weißer Hintergrund, schwarzer Rahmen/Text).
export default function MotherWitchVisit({ visit, onRespond, lang = 'de' }) {
  if (!visit) return null;
  const t = MOTHER_WITCH_VISIT_I18N[lang] || MOTHER_WITCH_VISIT_I18N.de;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
      <div className="flex items-end gap-4 max-w-xl w-full">
        {MOTHER_WITCH_IMG && (
          <img
            src={MOTHER_WITCH_IMG}
            alt={t.alt}
            className="w-36 h-36 object-cover object-top shrink-0 hidden sm:block"
          />
        )}

        <div className="relative flex-1 bg-white border-2 border-black rounded-sm p-5">
          {/* Sprechblasen-Spitze */}
          <div className="absolute -left-2.5 bottom-9 w-4 h-4 bg-white border-l-2 border-b-2 border-black rotate-45 hidden sm:block" />

          <p className="text-black font-bold text-xs uppercase tracking-wide mb-2">{t.appears}</p>
          <p className="text-black text-sm italic mb-3">&bdquo;{visit.greeting}&ldquo;</p>

          <div className="border-t border-black/20 pt-3 mb-3">
            <p className="text-black font-bold text-sm mb-1">{visit.name}</p>
            <p className="text-black text-sm leading-relaxed">{visit.description}</p>
          </div>

          <p className="text-black font-bold text-sm mb-4">{t.cost(visit.cost)}</p>

          <div className="flex gap-3">
            <ChunkyButton variant="green" size="sm" block onClick={() => onRespond(true)}>
              {t.accept}
            </ChunkyButton>
            <ChunkyButton variant="red" size="sm" block onClick={() => onRespond(false)}>
              {t.decline}
            </ChunkyButton>
          </div>
        </div>
      </div>
    </div>
  );
}
