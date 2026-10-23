// Hintergrund des Hubs: das blaue Rautenmuster (wie .cr-arcade-bg) wandert langsam schräg —
// wie die Menü-Hintergründe im Spiel. Ersetzt seit Okt. 2026 die aufsteigenden Karten und
// Elixiertropfen (zu unruhig). Reine Deko hinter dem Inhalt, aus mit dem Animations-Schalter.
//
// Sticky mit Höhe 0 statt position:fixed: der Hub-Container trägt die page-fade-Animation mit
// Füllmodus "both", sein transform bliebe stehen und würde ein fixed-Element mitscrollen lassen.
// Bewegt wird per transform (GPU) statt background-position — das würde jedes Bild neu malen.
import React from 'react';

export default function HubStage() {
  return (
    <div className="sticky top-0 h-0 z-0" aria-hidden="true">
      <div className="cr-hub-bg">
        <div className="cr-hub-bg__tile" />
        <div className="cr-hub-bg__light" />
      </div>
    </div>
  );
}
