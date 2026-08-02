// Admin-Leiste während einer laufenden Runde: Zuschauerstatus umschalten und
// Host-Status übergeben, ohne das Spiel zu unterbrechen.

import React from 'react';
import { Shield, X, Crown, ArrowLeftRight } from 'lucide-react';
import PlayerAvatar from '../components/PlayerAvatar';

export default function AdminControlPanel({ players, hostId, onTransferHost, onSetSpectator, onClose, t }) {
  return (
    <div className="shrink-0 bg-black/25 border-b border-violet-500/20 px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-violet-300 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
          <Shield size={12} /> {t.adminControlTitle}
        </span>
        <button onClick={onClose} aria-label={t.closeLabel}
          className="text-white/40 hover:text-white p-1">
          <X size={14} />
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {players.map(p => (
          <div key={p.id} className="flex items-center gap-2 bg-black/30 border border-white/5 rounded-lg px-2.5 py-1.5">
            <PlayerAvatar avatarId={p.avatar} size={20} />
            <span className="text-white text-xs font-semibold max-w-[100px] truncate">{p.name}</span>
            {p.id === hostId && <Crown size={10} className="text-amber-400 shrink-0" />}
            {p.isSpectator && (
              <span className="text-[8px] text-white/40 border border-white/10 px-1 rounded-lg shrink-0">{t.spectator}</span>
            )}
            <button onClick={() => onSetSpectator(p.id, !p.isSpectator)}
              title={p.isSpectator ? t.reactivateTitle : t.setSpectatorTitle}
              className={`text-[9px] px-1.5 py-0.5 rounded-lg border transition-colors shrink-0 ${
                p.isSpectator
                  ? 'border-violet-500/40 text-violet-400 hover:bg-violet-500/10'
                  : 'border-white/10 text-white/40 hover:text-white hover:border-white/30'
              }`}>
              {p.isSpectator ? t.reactivate : t.setSpectator}
            </button>
            {p.id !== hostId && (
              <button onClick={() => onTransferHost(p.id)} title={t.transferHostTitle}
                aria-label={t.transferHostTitle}
                className="text-white/40 hover:text-amber-400 transition-colors p-0.5 shrink-0">
                <ArrowLeftRight size={11} />
              </button>
            )}
          </div>
        ))}
        {players.length === 0 && <p className="text-white/30 text-xs italic">{t.noPlayersInSession}</p>}
      </div>
    </div>
  );
}
