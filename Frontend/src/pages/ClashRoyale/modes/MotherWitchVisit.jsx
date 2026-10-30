import React, { useEffect, useMemo, useState } from 'react';
import { MOTHER_WITCH_IMG } from '../data/motherWitchAssets';
import ChunkyButton from '../ui/ChunkyButton';
import { playSound } from '../ui/sound';
import elixirIcon from '../../../assets/clashRoyale/ui/elixir_1.png';

const MOTHER_WITCH_VISIT_I18N = {
  de: {
    alt: 'Hexenmutter',
    appears: 'Die Hexenmutter erscheint…',
    cost: 'Kosten',
    accept: 'Akzeptieren',
    decline: 'Ablehnen',
  },
  en: {
    alt: 'Mother Witch',
    appears: 'The Mother Witch appears…',
    cost: 'Cost',
    accept: 'Accept',
    decline: 'Decline',
  },
  es: {
    alt: 'Madre Bruja',
    appears: 'Aparece la Madre Bruja…',
    cost: 'Coste',
    accept: 'Aceptar',
    decline: 'Rechazar',
  },
};

// Wie lange der Abgang dauert, bevor die Antwort rausgeht (= Animationsdauer in index.css)
const EXIT_MS = 520;
const TYPE_MS = 24;
const BUBBLES = 14;
const animationsOff = () => document.documentElement.dataset.crAnim === 'off';

// Besuch der Mutterhexe während der Elixir Auction — inszeniert (Okt. 2026): violetter Nebel
// zieht auf, Trankblasen steigen, die Hexe schießt federnd von unten herein, ihr Gruß tippt sich
// in die Sprechblase. Annehmen = Zauberblitz und sie wirbelt davon, Ablehnen = sie versinkt.
// Sprechblase bewusst im Comic-Look (weiß, schwarzer Rand) — abweichend vom dunklen UI.
// scene3d: im 3D-Auktionssaal erscheint sie im Zauberspiegel (auction/Auction3D.jsx) — dann ohne
// eigenes Bild und Nebel, das Angebot sitzt unten und lässt den Spiegel frei.
export default function MotherWitchVisit({ visit, onRespond, lang = 'de', scene3d = false }) {
  const t = MOTHER_WITCH_VISIT_I18N[lang] || MOTHER_WITCH_VISIT_I18N.de;
  const [leaving, setLeaving] = useState(null); // null | 'accept' | 'decline'
  const [typed, setTyped] = useState(0);
  const greeting = visit?.greeting || '';

  const bubbles = useMemo(() => Array.from({ length: BUBBLES }, () => ({
    x: `${Math.random() * 100}%`, s: `${8 + Math.random() * 22}px`,
    dur: `${4 + Math.random() * 4}s`, dl: `${-Math.random() * 6}s`,
  })), []);

  // Neuer Besuch: Abgang zurücksetzen, Gruß Buchstabe für Buchstabe tippen
  useEffect(() => {
    if (!visit) return undefined;
    setLeaving(null);
    playSound('magic');
    if (animationsOff()) { setTyped(greeting.length); return undefined; }
    setTyped(0);
    let i = 0;
    let iv = 0;
    // Erst tippen, wenn die Sprechblase aufgeploppt ist (crSpeechIn startet nach 0,5 s)
    const start = setTimeout(() => {
      iv = setInterval(() => {
        i += 1;
        setTyped(i);
        if (i >= greeting.length) clearInterval(iv);
      }, TYPE_MS);
    }, 650);
    return () => { clearTimeout(start); clearInterval(iv); };
  }, [visit, greeting]);

  if (!visit) return null;

  const done = typed >= greeting.length;
  const respond = (accepted) => {
    if (leaving) return;
    setLeaving(accepted ? 'accept' : 'decline');
    if (accepted) playSound('magic');
    setTimeout(() => onRespond(accepted), animationsOff() ? 0 : EXIT_MS);
  };

  return (
    <div className={`cr-mw-stage fixed inset-0 z-[100] flex justify-center p-4 ${scene3d ? 'cr-mw-stage--scene items-end pb-8' : 'items-center'} ${leaving ? 'cr-mw-stage--out' : ''}`}>
      {!scene3d && <div className="cr-mw-fog" aria-hidden="true" />}
      {!scene3d && <div className="cr-mw-fog cr-mw-fog--2" aria-hidden="true" />}
      {!scene3d && bubbles.map((b, i) => (
        <span key={i} className="cr-mw-bubble" aria-hidden="true"
          style={{ '--x': b.x, '--s': b.s, '--dur': b.dur, '--dl': b.dl }} />
      ))}
      {leaving === 'accept' && <div className="cr-mw-flash" aria-hidden="true" />}

      <div className={`relative flex flex-col sm:flex-row items-center sm:items-end gap-2 sm:gap-0 w-full ${scene3d ? 'max-w-xl' : 'max-w-3xl'}`}>
        {MOTHER_WITCH_IMG && !scene3d && (
          <img
            src={MOTHER_WITCH_IMG}
            alt={t.alt}
            draggable={false}
            className={`w-52 sm:w-80 shrink-0 select-none drop-shadow-[0_18px_24px_rgba(0,0,0,0.6)] sm:-mr-10 relative z-10 ${
              leaving === 'accept' ? 'cr-mw-witch--cast' : leaving === 'decline' ? 'cr-mw-witch--sink' : 'cr-mw-witch'
            }`}
          />
        )}

        <div className={`cr-mw-speech relative flex-1 w-full bg-white border-[3px] border-black rounded-xl p-5 ${scene3d ? '' : 'sm:pl-12'} shadow-[0_8px_0_rgba(0,0,0,0.6)]`}>
          {/* Sprechblasen-Spitze */}
          {!scene3d && <div className="absolute -left-3 bottom-12 w-5 h-5 bg-white border-l-[3px] border-b-[3px] border-black rotate-45 hidden sm:block" />}

          <p className="text-fuchsia-700 font-bold text-xs uppercase tracking-widest mb-2">{t.appears}</p>
          <p className={`text-black text-[15px] italic mb-3 min-h-[2.8em] ${done ? '' : 'cr-caret'}`}>
            &bdquo;{greeting.slice(0, typed)}{done ? '“' : ''}
          </p>

          <div className={`border-t-2 border-black/15 pt-3 mb-4 transition-opacity duration-300 ${done ? 'opacity-100' : 'opacity-0'}`}>
            <p className="font-cr text-2xl text-fuchsia-700 leading-tight mb-1">{visit.name}</p>
            <p className="text-black/80 text-sm leading-relaxed">{visit.description}</p>
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-fuchsia-100 border-2 border-fuchsia-700/40 px-2.5 py-1 text-black font-bold text-sm">
              {t.cost}
              <img src={elixirIcon} alt="" style={{ height: 18, width: 'auto' }} />
              <span className="tabular-nums">{visit.cost}</span>
            </p>
          </div>

          <div className={`flex gap-3 ${done ? 'cr-drop-in' : 'invisible'}`}>
            <ChunkyButton variant="green" size="sm" block onClick={() => respond(true)} disabled={!!leaving}>
              {t.accept}
            </ChunkyButton>
            <ChunkyButton variant="red" size="sm" block onClick={() => respond(false)} disabled={!!leaving}>
              {t.decline}
            </ChunkyButton>
          </div>
        </div>
      </div>
    </div>
  );
}
