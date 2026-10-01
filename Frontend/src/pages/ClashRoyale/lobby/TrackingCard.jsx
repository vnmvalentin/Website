// "Spiele tracken" — Host-only: Gäste sehen weder den Schalter noch bräuchten sie ihn, das
// Tracking gilt für die ganze Lobby. Seit Sept. 2026 kein eigener Kasten mehr, sondern der
// Inhalt eines Abschnitts der gemeinsamen Lobby-Fläche (LobbyScreen.jsx).
import React, { useState } from 'react';
import Toggle from '../ui/Toggle';
import { CrTrophy } from '../ui/CrIcons';
import { resolveError } from '../i18n';

export default function TrackingCard({ lobbyData, actions, t }) {
  const [trackingError, setTrackingError] = useState('');
  const linkedCount = (lobbyData?.players || []).filter(p => !p.isAdmin && p.crTag).length;

  const toggleTracking = async (next) => {
    setTrackingError('');
    const res = await actions.setTracking(next);
    if (!res?.ok) setTrackingError(resolveError(t, res));
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex items-start gap-3">
          <CrTrophy size={28} className={lobbyData?.trackingEnabled ? '' : 'opacity-60 grayscale'} />
          <div className="min-w-0">
            <p className="font-cr text-white text-base leading-tight">{t.tracking}</p>
            <p className="text-white/50 text-xs mt-1 leading-relaxed">{t.trackingNote}</p>
          </div>
        </div>
        <Toggle
          checked={!!lobbyData?.trackingEnabled}
          onChange={toggleTracking}
          accent="bg-green-500"
          aria-label={t.tracking}
        />
      </div>
      {lobbyData?.trackingEnabled && (
        <p className="text-white/40 text-[11px] leading-relaxed mt-2">{t.trackingDelayNote}</p>
      )}
      {!lobbyData?.trackingEnabled && linkedCount === 0 && (
        <p className="text-white/40 text-[11px] leading-relaxed mt-2">{t.trackingNoAccounts}</p>
      )}
      {trackingError && <p className="text-red-400 text-xs mt-2">{trackingError}</p>}
    </div>
  );
}
