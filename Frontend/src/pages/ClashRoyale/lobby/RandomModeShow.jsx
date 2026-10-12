// Zufallsmodus beim Lobby-Start: erst die Walze aus dem Turnier (tournament/ModeSpin.jsx), dann
// nach kurzem Stehenbleiben noch einmal groß der ausgeloste Modus. Den eigentlichen Start löst
// der Server nach RANDOM_SPIN_MS aus (Backend/clashRoyale/core/randomMode.js) — mit
// clash:gameStart wechselt der Client in die Spielansicht und diese Bühne verschwindet mit der
// Lobby. Hier wird also nichts gestartet, nur gezeigt.
//
// Wer erst während der Walze dazukommt (Beitritt, Reload), bekommt msLeft mit: reicht die Zeit
// nicht mehr für die Walze, geht es direkt mit der Modus-Einblendung los.
import React, { useState } from 'react';
import ModeSpin from '../tournament/ModeSpin';
import { modeInfo, modeNameFor, modeDescFor } from '../modesConfig';
import { useCrPrefs } from '../ui/crPrefs';

// Anteil der Modus-Einblendung an RANDOM_SPIN_MS im Backend (3600 Walze + 1700 Halten + 2200)
const INTRO_MS = 2200;

function ModeIntro({ modeId, lang, t }) {
  const { prefs } = useCrPrefs();
  const Icon = modeInfo(modeId).icon;
  return (
    <div className="cr-stage fixed inset-0 z-[60] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      role="dialog" aria-label={modeNameFor(modeId, lang)}>
      <div className="cr-arcade-panel w-full max-w-xl p-6 md:p-8 text-center flex flex-col items-center">
        <p className="cr-eyebrow">{t.randomIntroEyebrow}</p>
        <span className="cr-tile-icon w-24 h-24 md:w-28 md:h-28 my-4"><Icon size={72} /></span>
        <p className={`font-cr text-3xl md:text-4xl text-[var(--cr-arcade-gold)] leading-tight ${prefs.animations ? 'cr-win-pop' : ''}`}>
          {modeNameFor(modeId, lang)}
        </p>
        <p className="text-white/60 text-sm leading-relaxed mt-3 max-w-md">{modeDescFor(modeId, lang)}</p>
      </div>
    </div>
  );
}

export default function RandomModeShow({ spin, lang, t }) {
  const [stage, setStage] = useState(() => (spin.msLeft > INTRO_MS + 500 ? 'spin' : 'intro'));
  if (stage === 'spin') {
    return (
      <ModeSpin pool={spin.pool} target={spin.mode} kind="spin" lang={lang} t={t}
        onDone={() => setStage('intro')} />
    );
  }
  return <ModeIntro modeId={spin.mode} lang={lang} t={t} />;
}
