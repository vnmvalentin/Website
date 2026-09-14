// Animiertes Hero-Bild oben auf der Startseite: wechselt automatisch zwischen echten
// Gameplay-Screenshots der Minigames (src/assets/clashRoyale/screenshots/<id>.webp —
// andere Bilder als die Modus-Logos in public/cr-modes/). Neuer Screenshot ersetzt einfach
// die Datei unter demselben Namen, dieser Code muss dafür nicht angefasst werden. Fehlt für
// einen Modus (noch) kein Screenshot, fällt die Kachel automatisch auf das Modus-Cover zurück.
import React, { useEffect, useState } from 'react';
import { MODES, modeCover, modeNameFor } from '../modesConfig';

const SLIDE_MS = 4000;

export default function HeroCarousel({ lang }) {
  const slides = MODES.filter(m => m.available);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (slides.length <= 1) return;
    const id = setInterval(() => setIndex(i => (i + 1) % slides.length), SLIDE_MS);
    return () => clearInterval(id);
  }, [slides.length]);

  if (slides.length === 0) return null;
  const current = slides[index];

  return (
    <div
      className="relative w-full max-w-md aspect-[16/9] rounded-2xl overflow-hidden"
      style={{ border: '4px solid var(--cr-arcade-ink)', boxShadow: '0 6px 0 rgba(0,0,0,0.4)' }}>
      {slides.map((m, i) => (
        <img
          key={m.id}
          src={modeCover(m.id)}
          alt={modeNameFor(m.id, lang)}
          loading={i === 0 ? 'eager' : 'lazy'}
          decoding="async"
          className="absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ease-in-out"
          style={{ opacity: i === index ? 1 : 0 }}
          onError={(e) => { e.currentTarget.style.opacity = 0; }}
        />
      ))}

      {/* Bauchbinde unten: Platzhalter für das spätere Deck-Overlay-Foto, bis dahin
          zumindest der Modusname im selben Arcade-Font */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-4 pt-10 pb-3">
        <p className="font-arcade font-semibold text-white text-sm sm:text-base">
          {modeNameFor(current.id, lang)}
        </p>
      </div>

      {/* Punkte-Indikator oben rechts */}
      <div className="absolute top-3 right-3 flex gap-1.5">
        {slides.map((m, i) => (
          <span
            key={m.id}
            className="w-1.5 h-1.5 rounded-full transition-colors duration-300"
            style={{ background: i === index ? 'var(--cr-arcade-gold)' : 'rgba(255,255,255,0.35)' }}
          />
        ))}
      </div>
    </div>
  );
}
