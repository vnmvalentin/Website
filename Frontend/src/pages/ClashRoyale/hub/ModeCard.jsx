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
// Zeigt bevorzugt den echten Gameplay-Screenshot des Modus (modeCover(), siehe
// modesConfig.js), sonst dessen gezeichnetes Logo (public/cr-modes/<id>.png). Fehlt
// auch das, tritt an seine Stelle das Modus-Symbol auf dunkler Fläche — die Startseite
// ist damit sofort benutzbar und wird besser, sobald echte Grafiken nachgelegt werden.

import React, { useState } from 'react';
import { BookOpen, Check } from 'lucide-react';
import { modeCover } from '../modesConfig';

/**
 * @param {boolean} [selected]     Zeigt einen violetten Rahmen + "Aktiv"-Abzeichen statt des
 *                                 "Bald verfügbar"-Abzeichens — für den Modus-Wähler in der
 *                                 Lobby (dort ersetzt ein Klick den aktiven Modus, statt eine
 *                                 Anleitung zu öffnen).
 * @param {string}  [selectedLabel]  Text des Abzeichens, wenn `selected` gesetzt ist.
 * @param {boolean} [hideHint]     Blendet den "Anleitung"-Hinweis unten links aus — im
 *                                 Modus-Wähler wäre er irreführend, weil der Klick dort
 *                                 auswählt statt die Anleitung zu öffnen.
 * @param {string}  [newLabel]    Text des Eck-Banners für frisch hinzugekommene Modi
 *                                 (`mode.isNew`). Ohne diese Prop bleibt das Banner aus,
 *                                 auch wenn `mode.isNew` gesetzt ist.
 */
export default function ModeCard({
  mode, name, description, comingSoonLabel, howToPlayLabel, openLabel, onOpen,
  selected = false, selectedLabel, hideHint = false, newLabel,
}) {
  const [hasImage, setHasImage] = useState(true);
  const Icon = mode.icon;

  return (
    <article className="group">
      {/* Comic-Karten-Look: dicker dunkler Rahmen, beim Hover leicht größer + gedreht wie
          eine angehobene Spielkarte. z-index nur beim Hover, damit die gedrehte Karte nicht
          hinter ihren Nachbarn im Raster verschwindet. */}
      <button
        type="button"
        onClick={onOpen}
        aria-label={openLabel}
        aria-pressed={selected}
        className={`relative w-full text-left rounded-xl overflow-hidden bg-black/25 border-[3px] transition-all duration-150 cursor-pointer motion-safe:hover:scale-[1.05] motion-safe:hover:rotate-2 hover:z-10 ${
          selected ? 'border-[var(--cr-arcade-gold)]' : 'border-[var(--cr-arcade-ink)] hover:border-[var(--cr-arcade-gold)]'
        }`}>

        {/* 16:10 — fest, damit das Raster nicht springt, während die Bilder laden */}
        <div className="relative aspect-[16/10] bg-[#0e0e1a] overflow-hidden">
          {hasImage ? (
            <img
              src={modeCover(mode.id)}
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

          {/* Eck-Banner statt eines weiteren Abzeichens neben "Bald verfügbar"/"Aktiv" — beide
              sitzen oben rechts, das Banner bewusst in der freien oberen linken Ecke, als
              schräger Streifen statt einer weiteren Pille, damit man die zwei neuen Modi auf
              den ersten Blick von den bestehenden unterscheidet. */}
          {mode.isNew && newLabel && (
            <div className="absolute top-3 -left-10 w-36 -rotate-45">
              <span className="block text-center text-[10px] font-bold uppercase tracking-wider text-white bg-emerald-600 py-1">
                {newLabel}
              </span>
            </div>
          )}

          {selected ? (
            <span className="absolute top-2 right-2 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-violet-500 text-white">
              <Check size={11} /> {selectedLabel}
            </span>
          ) : !mode.available && (
            <span className="absolute top-2 right-2 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-black/70 text-white/60">
              {comingSoonLabel}
            </span>
          )}

          {/* Hinweis, dass hier etwas dahintersteckt — erst beim Überfahren, damit das
              Raster im Ruhezustand ruhig bleibt. Auf Touch-Geräten gibt es kein Hover;
              dort führt schlicht der Klick zum Ziel. */}
          {!hideHint && (
            <span className="absolute bottom-2 left-2 flex items-center gap-1.5 text-[10px] font-semibold px-2 py-1 rounded-md bg-black/70 text-white/70 opacity-0 group-hover:opacity-100 transition-opacity">
              <BookOpen size={11} /> {howToPlayLabel}
            </span>
          )}
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
