// Comic-Titel im Clash-Royale-Arcade-Look: harter Text-Rand + Schlagschatten statt
// eines normalen Überschrift-Stils — siehe .cr-arcade-title in index.css.
// `as` wählt das HTML-Element (Default h1), damit die Dokumentstruktur stimmt, auch wenn
// z.B. ein h2 optisch wie der große Seitentitel aussehen soll.
import React from 'react';

export default function ArcadeTitle({ as: Tag = 'h1', className = '', children, ...props }) {
  return (
    <Tag {...props} className={['cr-arcade-title', 'font-arcade', className].filter(Boolean).join(' ')}>
      {children}
    </Tag>
  );
}
