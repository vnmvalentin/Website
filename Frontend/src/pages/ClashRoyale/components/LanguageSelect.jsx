// Sprachauswahl als Flaggen-Dropdown — deutlich schneller zu finden als ein DE/EN-Kürzel.

import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { CrCheck } from '../ui/CrIcons';
import { FlagDE, FlagGB, FlagES } from '../../../components/Flags';

const LANGUAGES = [
  { id: 'de', label: 'Deutsch', Flag: FlagDE },
  { id: 'en', label: 'English', Flag: FlagGB },
  { id: 'es', label: 'Español', Flag: FlagES },
];

// languages: optional nur diese Sprach-IDs anbieten (der Win-Tracker kennt nur DE/EN).
export default function LanguageSelect({ lang, onChange, className = '', languages }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const list = languages ? LANGUAGES.filter(l => languages.includes(l.id)) : LANGUAGES;
  const current = list.find(l => l.id === lang) || list[0];
  const CurrentFlag = current.Flag;
  const label = lang === 'de' ? 'Sprache wählen' : lang === 'es' ? 'Elegir idioma' : 'Choose language';

  return (
    <div ref={ref} className={`relative ${className}`}>
      {/* Gleicher solider Arcade-Chip wie der Profil-Knopf daneben/darüber — vorher ein
          fast unsichtbarer bg-white/5-Knopf, dadurch kaum als eigenes Bedienelement zu
          erkennen. Zeigt jetzt zusätzlich den Sprachcode als Text, nicht nur die Flagge. */}
      <button
        onClick={() => setOpen(v => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        title={label}
        className="cr-chip flex items-center gap-2 h-11 pl-2.5 pr-3 rounded-xl transition-colors font-cr text-[15px] text-white">
        <CurrentFlag size={20} />
        <span className="uppercase">{current.id}</span>
        <ChevronDown size={13} className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        // .cr-arcade-panel setzt selbst position:relative (ungeschichtetes CSS schlägt
        // Tailwinds @layer-utilities-.absolute unabhängig von der Reihenfolge im
        // Stylesheet) — genau das ließ die Liste bisher den Fluss verschieben statt zu
        // schweben. style gewinnt gegen jede Klasse, deshalb hier explizit erzwungen.
        <div role="listbox" className="cr-arcade-panel absolute right-0 top-full mt-2 z-50 min-w-[10rem] overflow-hidden py-1.5"
          style={{ position: 'absolute' }}>
          {list.map(l => {
            const Flag = l.Flag;
            const active = l.id === lang;
            return (
              <button key={l.id} role="option" aria-selected={active}
                onClick={() => { onChange(l.id); setOpen(false); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-arcade transition-colors ${
                  active ? 'bg-white/[0.08] text-white font-semibold' : 'text-white/60 hover:bg-white/[0.05] hover:text-white'
                }`}>
                <Flag />
                <span className="flex-1 text-left">{l.label}</span>
                {active && <CrCheck size={16} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
