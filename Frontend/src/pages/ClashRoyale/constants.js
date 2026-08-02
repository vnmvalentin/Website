// Modulweite Konstanten der Clash-Royale-Minigames.
//
// Lagen vorher verstreut in ClashRoyalePage.jsx und wurden von den herausgelösten
// Screens gleichermaßen gebraucht. Bewusst ohne React-Import, damit auch reine
// Helfer-Module (i18n, jsonLd) sie ziehen können, ohne den React-Chunk anzufassen.

/** Kartenartwork. 150px-Variante reicht für alle Ansichten inkl. Retina-Kacheln. */
export const CARD_CDN = 'https://cdn.royaleapi.com/static/img/cards-150/';

/** Twitch-ID des Streamers — nur dieser Account darf per ?adminCode= in fremde Lobbys. */
export const STREAMER_ID = '160224748';

/** Kanonische Reihenfolge der Seltenheiten in Kartengittern (Pool-Modal, Admin-Tausch). */
export const RARITY_ORDER = ['Common', 'Rare', 'Epic', 'Legendary', 'Champion'];

/** Deutsche Beschriftung der Seltenheiten; im Englischen wird der Schlüssel selbst gezeigt. */
export const RARITY_LABEL = {
  Common: 'Gewöhnlich',
  Rare: 'Selten',
  Epic: 'Episch',
  Legendary: 'Legendär',
  Champion: 'Champions',
};

// Spaltenzahl der Deck-Karten im Endscreen je Größenstufe (S/M/L-Umschalter).
// Die Klassen stehen bewusst als VOLLSTÄNDIGE Literale da, inklusive sm:-Präfix:
// Tailwind erkennt Klassen nur, wenn sie wörtlich im Quelltext vorkommen. Ein
// zusammengesetztes `sm:${SIZE_COLS[size]}` würde zur Laufzeit zwar den richtigen
// Namen ergeben, aber die passende CSS-Regel wäre nie erzeugt worden.
// Unter sm immer einspaltig — vier Deckkarten nebeneinander sind auf dem Handy
// sonst zu klein, um die Karte zu erkennen.
export const SIZE_COLS = {
  s: 'grid-cols-1 sm:grid-cols-4',
  m: 'grid-cols-1 sm:grid-cols-3',
  l: 'grid-cols-1 sm:grid-cols-2',
};

/** Basis-URL für kanonische Links und strukturierte Daten. */
export const SITE_URL = 'https://vnmvalentin.de';
