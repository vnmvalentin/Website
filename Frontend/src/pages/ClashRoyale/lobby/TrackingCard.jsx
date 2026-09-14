// "Spiele tracken" — eigene Karte unter der Spielerliste (rechte Spalte). Host-only:
// Gäste sehen weder den Schalter noch bräuchten sie ihn, das Tracking gilt für die ganze
// Lobby. Ausgelagert aus dem früheren LobbyControls.jsx, Logik unverändert.
import React, { useState } from 'react';
import { Activity } from 'lucide-react';
import Toggle from '../ui/Toggle';
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
    <div className="cr-arcade-panel p-5">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-white text-sm font-semibold flex items-center gap-2">
            <Activity size={13} className={lobbyData?.trackingEnabled ? 'text-green-400' : 'text-white/40'} />
            {t.tracking}
          </p>
          <p className="text-white/30 text-xs mt-0.5 leading-relaxed">{t.trackingNote}</p>
        </div>
        <Toggle
          checked={!!lobbyData?.trackingEnabled}
          onChange={toggleTracking}
          accent="bg-green-500"
          aria-label={t.tracking}
        />
      </div>
      {lobbyData?.trackingEnabled && (
        <p className="text-white/25 text-[11px] leading-relaxed mt-2">{t.trackingDelayNote}</p>
      )}
      {!lobbyData?.trackingEnabled && linkedCount === 0 && (
        <p className="text-white/25 text-[11px] leading-relaxed mt-2">{t.trackingNoAccounts}</p>
      )}
      {trackingError && <p className="text-red-400 text-xs mt-2">{trackingError}</p>}
    </div>
  );
}
