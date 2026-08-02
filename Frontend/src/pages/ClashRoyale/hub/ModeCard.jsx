// Kachel eines Spielmodus auf der Startseite.
//
// Ersetzt die frühere Textkachel (Symbol + Überschrift + fünf Zeilen Fließtext). Der
// Modus wird jetzt zuerst über ein Bild erzählt; der Beschreibungstext bleibt darunter,
// aber auf zwei Zeilen begrenzt.
//
// WICHTIG: begrenzt heißt SICHTBAR gekürzt, nicht entfernt. Der vollständige Text steht
// weiter im DOM — die strukturierten Daten der Seite (ItemList in jsonLd.js) verweisen
// genau darauf, und Google erwartet ihn auf der Seite wiederzufinden.
//
// Die Kachel ist ein <button>: Ein Klick öffnet die Anleitung (ModeTutorialModal). Sie
// war vorher ein reines Schaubild — man sah acht Modi und konnte über keinen davon mehr
// erfahren, ohne ihn zu starten.
//
// Fehlt das Bild (public/cr-modes/<id>.jpg), tritt an seine Stelle das Modus-Symbol auf
// dunkler Fläche. Die Startseite ist damit sofort benutzbar und wird besser, sobald
// echte Grafiken nachgelegt werden.

import React, { useState } from 'react';
import { BookOpen } from 'lucide-react';
import { modeImage } from '../modesConfig';

export default function ModeCard({ mode, name, description, comingSoonLabel, howToPlayLabel, openLabel, onOpen }) {
  const [hasImage, setHasImage] = useState(true);
  const Icon = mode.icon;

  return (
    <article className="group">
      <button
        type="button"
        onClick={onOpen}
        aria-label={openLabel}
        className="w-full text-left rounded-xl overflow-hidden bg-black/25 border border-white/5 hover:border-white/15 transition-colors cursor-pointer">

        {/* 16:10 — fest, damit das Raster nicht springt, während die Bilder laden */}
        <div className="relative aspect-[16/10] bg-[#0e0e1a] overflow-hidden">
          {hasImage ? (
            <img
              src={modeImage(mode.id)}
              alt=""
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover"
              onError={() => setHasImage(false)}
            />
          ) : (
            // Platzhalter: großes Modus-Symbol, ruhig gehalten — es soll nicht so aussehen,
            // als wäre hier etwas kaputt, sondern als wäre es so gemeint.
            <div className="w-full h-full flex items-center justify-center bg-violet-500/[0.06]">
              <Icon size={44} className="text-violet-300/40" strokeWidth={1.25} />
            </div>
          )}

          {!mode.available && (
            <span className="absolute top-2 right-2 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-black/70 text-white/60">
              {comingSoonLabel}
            </span>
          )}

          {/* Hinweis, dass hier etwas dahintersteckt — erst beim Überfahren, damit das
              Raster im Ruhezustand ruhig bleibt. Auf Touch-Geräten gibt es kein Hover;
              dort führt schlicht der Klick zum Ziel. */}
          <span className="absolute bottom-2 left-2 flex items-center gap-1.5 text-[10px] font-semibold px-2 py-1 rounded-md bg-black/70 text-white/70 opacity-0 group-hover:opacity-100 transition-opacity">
            <BookOpen size={11} /> {howToPlayLabel}
          </span>
        </div>

        <div className="p-3.5">
          <h3 className="flex items-center gap-2 text-white font-semibold text-sm leading-tight">
            <Icon size={14} className="text-violet-300 shrink-0" />
            {name}
          </h3>
          {/* line-clamp kürzt nur die Darstellung; der Text bleibt vollständig im DOM */}
          <p className="text-white/40 text-xs leading-relaxed mt-1.5 line-clamp-2">
            {description}
          </p>
        </div>
      </button>
    </article>
  );
}
