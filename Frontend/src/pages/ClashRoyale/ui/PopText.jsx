// Text, dessen Buchstaben nacheinander aufploppen (Intro des Hub-Titels).
// Der Text bleibt als ganz normaler Text im Element (Suchmaschinen, Screenreader lesen
// "Deck Draft Minigames"), nur jeder Buchstabe steckt in einem eigenen <span>. Wörter bleiben
// zusammen (nowrap), damit der Titel nur zwischen Wörtern umbricht.
import React from 'react';

export default function PopText({ text, baseDelay = 0, step = 0.035 }) {
  let n = 0;
  const words = String(text).split(' ');
  return words.map((word, wi) => (
    <React.Fragment key={wi}>
      <span className="inline-block whitespace-nowrap">
        {[...word].map((ch) => {
          const i = n++;
          return (
            <span key={i} className="cr-pop-letter" style={{ animationDelay: `${(baseDelay + i * step).toFixed(3)}s` }}>
              {ch}
            </span>
          );
        })}
      </span>
      {wi < words.length - 1 ? ' ' : null}
    </React.Fragment>
  ));
}
