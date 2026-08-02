// Sprachauswahl als Flaggen-Dropdown — deutlich schneller zu finden als ein DE/EN-Kürzel.

import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

// Flaggen als Inline-SVG statt Emoji: Windows besitzt keine Glyphen für Flaggen-Emojis
// (🇩🇪 würde dort nur als Buchstabenkasten "DE" erscheinen).
function FlagDE({ size = 18 }) {
  return (
    <svg viewBox="0 0 60 30" width={size} height={size * 0.6} className="rounded-[2px] shrink-0" aria-hidden="true">
      <rect width="60" height="10" fill="#000000" />
      <rect y="10" width="60" height="10" fill="#DD0000" />
      <rect y="20" width="60" height="10" fill="#FFCE00" />
    </svg>
  );
}

function FlagGB({ size = 18 }) {
  return (
    <svg viewBox="0 0 60 30" width={size} height={size * 0.6} className="rounded-[2px] shrink-0" aria-hidden="true">
      <rect width="60" height="30" fill="#012169" />
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#FFFFFF" strokeWidth="6" />
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#C8102E" strokeWidth="3" />
      <path d="M30,0 V30 M0,15 H60" stroke="#FFFFFF" strokeWidth="10" />
      <path d="M30,0 V30 M0,15 H60" stroke="#C8102E" strokeWidth="6" />
    </svg>
  );
}

const LANGUAGES = [
  { id: 'de', label: 'Deutsch', Flag: FlagDE },
  { id: 'en', label: 'English', Flag: FlagGB },
];

export default function LanguageSelect({ lang, onChange, className = '' }) {
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

  const current = LANGUAGES.find(l => l.id === lang) || LANGUAGES[0];
  const CurrentFlag = current.Flag;
  const label = lang === 'de' ? 'Sprache wählen' : 'Choose language';

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        onClick={() => setOpen(v => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        title={label}
        className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/50 hover:text-white transition-colors">
        <CurrentFlag />
        <ChevronDown size={12} className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div role="listbox" className="absolute right-0 top-full mt-1.5 z-50 min-w-[9.5rem] panel-strong overflow-hidden py-1">
          {LANGUAGES.map(l => {
            const Flag = l.Flag;
            const active = l.id === lang;
            return (
              <button key={l.id} role="option" aria-selected={active}
                onClick={() => { onChange(l.id); setOpen(false); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                  active ? 'bg-white/[0.06] text-white font-semibold' : 'text-white/60 hover:bg-white/[0.04] hover:text-white'
                }`}>
                <Flag />
                <span className="flex-1 text-left">{l.label}</span>
                {active && <Check size={13} className="text-violet-400 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
