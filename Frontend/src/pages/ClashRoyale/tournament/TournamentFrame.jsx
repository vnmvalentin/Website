// Gemeinsamer Rahmen der Turnier-Seiten: volle Fläche im CR-Look, oben eine Leiste mit
// Zurück-Knopf, Sprache und Einstellungen — dieselbe Leiste wie im Hub (HubScreen.jsx).
import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import LanguageSelect from '../components/LanguageSelect';
import { CrSettings } from '../ui/CrIcons';
import { useCrPrefs } from '../ui/crPrefs';
import { withLang } from './tournamentApi';

const chipClass = 'cr-chip flex items-center gap-2 h-11 rounded-xl font-cr text-[15px] text-white transition-colors';

export default function TournamentFrame({ lang, changeLang, backTo, backLabel, width = 'max-w-3xl', children }) {
  const { openSettings } = useCrPrefs();
  return (
    <div className="page-fade cr-arcade-bg h-full overflow-y-auto custom-scrollbar relative">
      <div className="min-h-full flex flex-col">
        <div className="shrink-0 flex items-center gap-2 px-3 md:px-6 pt-3 md:pt-5 relative z-20">
          <Link to={withLang(backTo, lang)} className={`${chipClass} px-3.5`} title={backLabel}>
            <ArrowLeft size={16} />
            <span className="hidden sm:inline">{backLabel}</span>
          </Link>
          <div className="flex-1" />
          <LanguageSelect lang={lang} onChange={changeLang} />
          <button onClick={openSettings} className={`${chipClass} w-11 justify-center`} aria-label="Settings">
            <CrSettings size={24} />
          </button>
        </div>
        <div className={`flex-1 w-full ${width} mx-auto px-3 md:px-6 py-4 md:py-6`}>
          {children}
        </div>
      </div>
    </div>
  );
}

/** Kleiner Zahlen-Stepper (−/Wert/+) im Arcade-Look. Der Wert ist auch eintippbar — er wird
 *  erst beim Verlassen des Felds begrenzt, sonst würde "16" beim Tippen der "1" schon auf das
 *  Minimum springen. */
export function Stepper({ value, min, max, onChange, label }) {
  const [draft, setDraft] = React.useState(null);
  const commit = () => {
    if (draft === null) return;
    const n = Math.round(Number(draft));
    if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
    setDraft(null);
  };
  return (
    <div className="cr-seg !flex-nowrap items-center w-fit">
      <button type="button" className="!flex-none w-10 font-cr !text-lg" disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))} aria-label="−">−</button>
      <input
        type="text" inputMode="numeric" aria-label={label}
        value={draft ?? String(value)}
        onChange={e => setDraft(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))}
        onBlur={commit}
        onKeyDown={e => e.key === 'Enter' && commit()}
        className="w-16 bg-transparent text-center font-cr text-white text-lg tabular-nums outline-none"
      />
      <button type="button" className="!flex-none w-10 font-cr !text-lg" disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))} aria-label="+">+</button>
    </div>
  );
}
