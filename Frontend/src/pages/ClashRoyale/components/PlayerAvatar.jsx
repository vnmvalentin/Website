// Profilbild eines Spielers — in Lobby, Spielerliste, Verlauf und Endscreen.
//
// Die Bilder liegen in src/assets/avatars/ (siehe avatars.js) und werden zur Bauzeit
// eingelesen; die Lobby kennt nur den Dateinamen ("Knight_Evolution.webp") und schickt genau
// den über den Socket. `avatarUrl` (Prop) ist der Ausnahmefall: die Profil-Option "Twitch-Bild
// verwenden" schickt eine echte Bild-URL statt eines Dateinamens — die hat dann Vorrang.
//
// Die Avatare sind freigestellte Figuren (transparenter Hintergrund). Der Kreis trägt deshalb
// selbst eine Bühne: ein von oben beleuchtetes CR-Blau (.cr-avatar in index.css) — auf einer
// schwarzen Fläche wirkten die Figuren wie ausgeschnitten.

import React from 'react';
import { avatarUrl as resolveAvatarUrl } from './avatars';
import { CrShield } from '../ui/CrIcons';

export default function PlayerAvatar({ avatarId, avatarUrl, size = 28, className = '', isAdmin = false }) {
  if (isAdmin) {
    return (
      <div
        className={`cr-avatar rounded-full shrink-0 flex items-center justify-center ${className}`}
        style={{ width: size, height: size }}>
        <CrShield size={Math.round(size * 0.62)} />
      </div>
    );
  }

  const url = avatarUrl || resolveAvatarUrl(avatarId);
  if (!url) {
    return (
      <div className={`cr-avatar rounded-full shrink-0 ${className}`} style={{ width: size, height: size }} />
    );
  }

  return (
    <div
      className={`cr-avatar rounded-full overflow-hidden shrink-0 ${className}`}
      style={{ width: size, height: size }}>
      <img
        src={url} alt="" width={size} height={size}
        loading="lazy" decoding="async"
        className="w-full h-full object-cover object-center"
      />
    </div>
  );
}
