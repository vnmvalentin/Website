// Gemeinsames Grundgerüst aller Spielmodi: Seitenleiste links, Spielfeld rechts.
//
// Warum es das gibt — gemessen auf einem 390px-Handy VOR diesem Umbau:
//
//   Snake Royale       Seitenleiste 224px → 166px fürs Spiel
//   Bingo Royale       Seitenleiste 240px → 150px
//   Blindes Karussell  Seitenleiste 240px → 150px
//   Karten-Evolution   Seitenleiste 240px → 150px
//   …
//
// Die feste Seitenleiste nahm also die Hälfte bis zwei Drittel des Bildschirms weg, und
// im verbleibenden Streifen war das eigentliche Spiel nicht mehr bedienbar. Jede der
// sieben Dateien hatte dieselbe Konstruktion einzeln ausgeschrieben.
//
// Ab jetzt: Auf großen Bildschirmen unverändert (Leiste links, immer sichtbar). Unter
// `lg` bekommt das Spielfeld die volle Breite; die Mitspieler stehen in einem schmalen
// Streifen darüber und ausführlich in einem Blatt, das von unten hereinfährt.

import React, { useState } from 'react';
import { Users, ChevronUp } from 'lucide-react';
import Drawer from '../ui/Drawer';

const SHELL_I18N = {
  de: { players: 'Mitspieler', open: 'Mitspieler anzeigen' },
  en: { players: 'Players', open: 'Show players' },
};

/**
 * @param {React.ReactNode} sidebar    Inhalt der Seitenleiste OHNE eigenen Rahmen —
 *                                     Hintergrund, Rand, Scrollen und Abstände macht diese Hülle
 * @param {React.ReactNode} strip      Optionale Kurzfassung für den Handy-Streifen
 *                                     (z.B. Mini-Avatare); ohne Angabe nur "Mitspieler"
 * @param {number}          playerCount Zahl neben der Beschriftung im Streifen
 * @param {string}          width      Tailwind-Breite der Leiste am Desktop (Standard w-60)
 */
export default function ModeShell({
  sidebar, strip, playerCount, width = 'lg:w-60', lang = 'de', children,
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const t = SHELL_I18N[lang] || SHELL_I18N.de;

  return (
    <div className="h-full flex overflow-hidden select-none">

      {/* Desktop: dauerhaft sichtbare Leiste. data-mode-sidebar dient der Messung. */}
      <aside
        data-mode-sidebar="true"
        className={`hidden lg:flex ${width} shrink-0 bg-[#16161a] border-r border-white/5 overflow-y-auto custom-scrollbar py-3 px-2.5 flex-col gap-3`}>
        {sidebar}
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Handy: schmaler Streifen statt Spalte — er kostet ~40px Höhe und gibt dafür
            240px Breite zurück. Wer mehr sehen will, tippt ihn an. */}
        <button
          onClick={() => setSheetOpen(true)}
          aria-label={t.open}
          className="lg:hidden shrink-0 flex items-center gap-2 px-3 h-10 bg-[#16161a] border-b border-white/5 text-left">
          <Users size={14} className="text-white/40 shrink-0" />
          <span className="text-white/70 text-xs font-semibold shrink-0">
            {t.players}{typeof playerCount === 'number' ? ` (${playerCount})` : ''}
          </span>
          <div className="flex-1 min-w-0 overflow-hidden">{strip}</div>
          <ChevronUp size={14} className="text-white/30 shrink-0" />
        </button>

        {children}
      </div>

      {/* Nur unterhalb lg erreichbar — am Desktop steht der Inhalt ohnehin links.
          Drawer selbst rendert per Portal und fährt auf dem Handy von unten ein. */}
      {sheetOpen && (
        <Drawer
          open
          onClose={() => setSheetOpen(false)}
          title={t.players}
          icon={<Users size={15} className="text-violet-400 shrink-0" />}>
          <div className="flex flex-col gap-3">{sidebar}</div>
        </Drawer>
      )}
    </div>
  );
}
