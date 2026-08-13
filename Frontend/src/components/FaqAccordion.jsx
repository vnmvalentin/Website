// Häufige Fragen als Akkordeon. Genutzt von /clash-royale, /WinChallenge-Overlay
// und /twitch-tools.
//
// Vorher standen alle sechs Antworten offen untereinander und machten die Startseite zu
// einer Textwand. Zugeklappt bleibt die Seite kurz — die Antworten stehen aber
// weiterhin vollständig im HTML.
//
// Das ist kein Detail, sondern Bedingung: die Seiten melden dieselben Fragen als
// FAQPage in den strukturierten Daten an, und Google verlangt dafür, dass Frage und
// Antwort auch auf der Seite stehen. Inhalt in einem Akkordeon zählt dabei als
// vorhanden — nachgeladener oder gelöschter Text nicht.
//
// <details>/<summary> statt eigener Zustandslogik: Auf- und Zuklappen, Tastaturbedienung
// und die Ansage an Screenreader bringt der Browser mit, und der Inhalt steht auch dann
// im DOM, wenn JavaScript gar nicht erst läuft (Crawler, Prerender).

import React from 'react';
import { ChevronDown } from 'lucide-react';

export default function FaqAccordion({ items = [], heading }) {
  if (items.length === 0) return null;

  return (
    <section>
      <h2 className="text-white font-semibold text-sm mb-3">{heading}</h2>
      <div className="divide-y divide-white/5 rounded-xl border border-white/5 bg-black/20 overflow-hidden">
        {items.map((item, i) => (
          <details key={i} className="group">
            <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer list-none text-white/80 hover:text-white text-sm font-medium transition-colors">
              <span className="flex-1">{item.q}</span>
              <ChevronDown size={15} className="text-white/30 shrink-0 transition-transform group-open:rotate-180" />
            </summary>
            <p className="px-4 pb-3.5 -mt-0.5 text-white/40 text-xs leading-relaxed">
              {item.a}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}
