// Profilbild eines Spielers — in Lobby, Spielerliste, Verlauf und Endscreen.
//
// Die Bilder liegen in src/assets/avatars/ (siehe avatars.js) und werden zur Bauzeit
// eingelesen; die Lobby kennt nur den Dateinamen ("Golem.jpg") und schickt genau den
// über den Socket. `avatarUrl` (Prop) ist der Ausnahmefall: die Profil-Option "Twitch-Bild
// verwenden" schickt eine echte Bild-URL statt eines Dateinamens — die hat dann Vorrang.

import React from 'react';
import { Shield } from 'lucide-react';
import { avatarUrl as resolveAvatarUrl } from './avatars';

export default function PlayerAvatar({ avatarId, avatarUrl, size = 28, className = '', isAdmin = false }) {
  if (isAdmin) {
    return (
      <div
        className={`rounded-full shrink-0 bg-violet-500/20 border-2 border-violet-400 flex items-center justify-center ${className}`}
        style={{ width: size, height: size }}>
        <Shield size={Math.round(size * 0.55)} className="text-violet-300" />
      </div>
    );
  }

  const url = avatarUrl || resolveAvatarUrl(avatarId);
  if (!url) {
    return (
      <div
        className={`rounded-full shrink-0 bg-black/40 border border-white/20 ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      className={`rounded-full overflow-hidden shrink-0 border border-white/20 bg-black/40 ${className}`}
      style={{ width: size, height: size }}>
      <img
        src={url} alt="" width={size} height={size}
        loading="lazy" decoding="async"
        className="w-full h-full object-cover object-center"
      />
    </div>
  );
}
