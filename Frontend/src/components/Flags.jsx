// Flags.jsx — Landesflaggen für die Sprachwahl, als Inline-SVG statt Emoji: Windows besitzt
// keine Glyphen für Flaggen-Emojis (🇩🇪 würde dort nur als Buchstabenkasten "DE" erscheinen).
// Genutzt von der Sprachwahl in Clash Royale (LanguageSelect) und der Win-Challenge-Hülle.
import React from 'react';

export function FlagDE({ size = 18 }) {
  return (
    <svg viewBox="0 0 60 30" width={size} height={size * 0.6} className="rounded-[2px] shrink-0" aria-hidden="true">
      <rect width="60" height="10" fill="#000000" />
      <rect y="10" width="60" height="10" fill="#DD0000" />
      <rect y="20" width="60" height="10" fill="#FFCE00" />
    </svg>
  );
}

export function FlagGB({ size = 18 }) {
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

export function FlagES({ size = 18 }) {
  return (
    <svg viewBox="0 0 60 30" width={size} height={size * 0.6} className="rounded-[2px] shrink-0" aria-hidden="true">
      <rect width="60" height="30" fill="#AA151B" />
      <rect y="7.5" width="60" height="15" fill="#F1BF00" />
    </svg>
  );
}
