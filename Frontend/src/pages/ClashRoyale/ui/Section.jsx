// Ein Abschnitt innerhalb EINER gemeinsamen Fläche (.cr-arcade-panel) — Lobby, Beitreten,
// Einstellungsfenster. Ersetzt die frühere Reihe einzelner Kästen: die Fläche bleibt eine,
// die Abschnitte trennt eine eingeprägte Fuge (.cr-section + .cr-section in index.css).
import React from 'react';

/**
 * @param {React.ElementType} icon   CR-Symbol vor der Überschrift (optional)
 * @param {React.ReactNode}   title  Überschrift (optional — ohne sie nur Abstand + Fuge)
 * @param {React.ReactNode}   aside  Leiser Zusatz rechts neben der Überschrift (z.B. Zähler)
 */
export default function Section({ icon: Icon, title, aside, className = '', children }) {
  return (
    <section className={`cr-section ${className}`}>
      {(title || aside) && (
        <div className="flex items-center justify-between gap-3 mb-3.5">
          {title && (
            <h2 className="cr-section-title min-w-0">
              {Icon && <Icon size={24} />}
              <span className="truncate">{title}</span>
            </h2>
          )}
          {aside && <div className="shrink-0 text-white/45 text-xs">{aside}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
