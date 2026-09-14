// Rahmen für Draft-/Modus-Karten im Comic-Look: dicker dunkler Rahmen, runde Ecken,
// wächst und dreht sich beim Hover minimal — siehe .cr-arcade-card in index.css.
// `hoverable` abschalten für Karten, die nicht anklickbar sind (z.B. reine Anzeige).
import React from 'react';

const ArcadeCard = React.forwardRef(function ArcadeCard(
  { hoverable = true, className = '', children, ...props },
  ref
) {
  return (
    <div
      ref={ref}
      {...props}
      className={['cr-arcade-card', hoverable ? 'cr-arcade-card--hoverable' : '', className]
        .filter(Boolean).join(' ')}>
      {children}
    </div>
  );
});

export default ArcadeCard;
