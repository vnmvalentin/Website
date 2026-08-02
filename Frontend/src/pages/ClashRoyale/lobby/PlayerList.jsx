// Spielerliste der Lobby.
//
// Vorher stand unter jedem Spieler eine zweite Zeile mit Aktionsknöpfen — bei acht
// Spielern wuchs die Liste dadurch auf gut die doppelte Höhe, und auf dem Handy war die
// Modus-Karte danach nicht mehr zu sehen. Jetzt liegt alles auf EINER Zeile: links wer,
// rechts was man mit ihm tun kann.
//
// Neu sichtbar: der Zustand "Verbindung getrennt". Der Server schickt ihn seit jeher mit
// (sanitizeLobby → disconnected), die Liste hat ihn nur nie ausgewertet — ein Spieler in
// der Gnadenfrist sah aus wie jeder andere, und der Host wunderte sich, warum das Spiel
// auf ihn wartet.

import React from 'react';
import { Users, Crown, Eye, EyeOff, ArrowLeftRight, UserX, WifiOff, Link2 } from 'lucide-react';
import PlayerAvatar from '../components/PlayerAvatar';
import CrScoreBadge from './CrScoreBadge';

/** Kleiner Zustands-Aufkleber neben dem Namen. */
function Badge({ icon: Icon, label, className, title }) {
  return (
    <span title={title}
      className={`flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md shrink-0 ${className}`}>
      {Icon && <Icon size={9} />}
      {label}
    </span>
  );
}

/** Runder Icon-Knopf für die Host-Aktionen rechts in der Zeile. */
function IconAction({ icon: Icon, title, onClick, tone = 'neutral' }) {
  const tones = {
    neutral: 'text-white/40 hover:text-white hover:bg-white/10',
    violet: 'text-violet-300 hover:text-violet-200 hover:bg-violet-500/15',
    amber: 'text-white/40 hover:text-amber-300 hover:bg-amber-500/15',
    red: 'text-white/40 hover:text-red-400 hover:bg-red-500/15',
  };
  // 32px sichtbare Fläche — kompakt genug für vier Aktionen nebeneinander und
  // groß genug, um auf dem Handy sicher getroffen zu werden.
  return (
    <button onClick={onClick} title={title} aria-label={title}
      className={`flex items-center justify-center w-8 h-8 rounded-lg transition-colors shrink-0 ${tones[tone]}`}>
      <Icon size={15} />
    </button>
  );
}

export default function PlayerList({
  lobbyData, myId, canControlLobby, t,
  activeCount, spectatorCount,
  onToggleOwnSpectator, onSetPlayerSpectator, onTransferHost, onKick,
  onOpenCrAccount,
}) {
  const players = lobbyData?.players || [];
  const hostId = lobbyData?.host;
  const maxPlayers = lobbyData?.maxPlayers || 8;

  // Kicken wirft jemanden ohne Vorwarnung raus und ist für ihn nicht rückgängig zu machen —
  // deshalb einmal nachfragen. Der Knopf sitzt direkt neben harmlosen Aktionen.
  const confirmKick = (player) => {
    if (window.confirm(t.kickConfirm(player.name))) onKick(player.id);
  };

  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <span className="text-white font-semibold text-sm flex items-center gap-2">
          <Users size={14} className="text-white/40" />
          {t.playersOfMax(activeCount, maxPlayers)}
        </span>
        {spectatorCount > 0 && (
          <span className="text-white/30 text-xs">{t.spectatorCount(spectatorCount)}</span>
        )}
      </div>

      <div className="space-y-1.5">
        {players.map(p => {
          const isMe = p.id === myId;
          const isHost = p.id === hostId;
          const showOwnToggle = isMe && !p.isAdmin;
          const showHostTools = canControlLobby && !isMe && !p.isAdmin;

          // Verknüpfen darf jeder für sich; Host und Admin zusätzlich für alle anderen
          const canLink = !p.isAdmin && (isMe || canControlLobby);

          return (
            <div key={p.id}
              className={`rounded-lg overflow-hidden ${
                p.isAdmin ? 'bg-violet-500/5 border border-violet-500/20'
                  : isMe ? 'bg-violet-500/[0.07]'
                    : 'bg-black/30'
              }`}>
            <div className="flex items-center gap-2.5 pl-3 pr-2 py-2">

              <PlayerAvatar
                avatarId={p.avatar}
                size={34}
                isAdmin={p.isAdmin}
                // Zuschauer und Getrennte treten optisch zurück, ohne zu verschwinden
                className={p.isSpectator || p.disconnected ? 'opacity-40' : ''}
              />

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className={`font-semibold truncate text-sm ${
                    p.isAdmin ? 'text-violet-300' : p.isSpectator || p.disconnected ? 'text-white/40' : 'text-white'
                  }`}>
                    {p.name}
                  </span>
                  {isHost && <Crown size={13} className="text-amber-400 shrink-0" />}
                </div>

                <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                  {/* Der getrackte Punktestand steht direkt unter dem Namen — dort sucht
                      man ihn während einer laufenden Challenge, nicht am Zeilenende
                      zwischen den Aktionsknöpfen. */}
                  {p.crScore && <CrScoreBadge score={p.crScore} t={t} />}
                  {p.crName && !p.crScore && (
                    <Badge icon={Link2} label={p.crName} className="text-white/40 border border-white/10" />
                  )}
                  {p.isAdmin && (
                    <Badge label={t.admin} className="text-violet-300 bg-violet-500/10 border border-violet-500/30" />
                  )}
                  {p.disconnected && (
                    <Badge icon={WifiOff} label={t.disconnected} title={t.disconnectedTitle}
                      className="text-amber-300 bg-amber-400/10 border border-amber-400/30" />
                  )}
                  {!p.isAdmin && p.isSpectator && (
                    <Badge icon={Eye} label={t.spectator} className="text-white/40 border border-white/10" />
                  )}
                </div>
              </div>

              {/* Aktionen rechts, dauerhaft sichtbar — auf Touch gibt es kein Hover,
                  und der Host soll nicht erst suchen müssen. */}
              <div className="flex items-center gap-0.5 shrink-0">
                {showOwnToggle && (
                  <button onClick={onToggleOwnSpectator}
                    className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 h-8 rounded-lg transition-colors ${
                      p.isSpectator
                        ? 'text-violet-300 bg-violet-500/10 hover:bg-violet-500/20'
                        : 'text-white/50 hover:text-white hover:bg-white/10'
                    }`}>
                    {p.isSpectator ? <Eye size={14} /> : <EyeOff size={14} />}
                    <span className="hidden sm:inline">{p.isSpectator ? t.play : t.spectate}</span>
                  </button>
                )}

                {showHostTools && (
                  <IconAction
                    icon={p.isSpectator ? Eye : EyeOff}
                    tone={p.isSpectator ? 'violet' : 'neutral'}
                    title={p.isSpectator ? t.reactivateTitle : t.setSpectatorTitle}
                    onClick={() => onSetPlayerSpectator(p.id, !p.isSpectator)}
                  />
                )}
                {showHostTools && !isHost && (
                  <IconAction icon={ArrowLeftRight} tone="amber"
                    title={t.transferHostTitle} onClick={() => onTransferHost(p.id)} />
                )}
                {showHostTools && !isHost && (
                  <IconAction icon={UserX} tone="red"
                    title={t.kickTitle} onClick={() => confirmKick(p)} />
                )}
              </div>
            </div>

            {/* Clash-Royale-Account als eigenes Feld unter dem Spieler statt als
                Icon-Knopf in der Reihe: Der verknüpfte Name ist eine Information, die
                man lesen können soll — als Symbol war weder erkennbar, OB verknüpft
                ist, noch WER. */}
            {canLink && (
              <button onClick={() => onOpenCrAccount(p)}
                className={`w-full flex items-center gap-2 px-3 py-2 border-t transition-colors text-left ${
                  p.crTag
                    ? 'border-white/5 text-white/60 hover:bg-white/5'
                    : 'border-white/5 text-white/30 hover:bg-white/5 hover:text-white/60'
                }`}>
                <Link2 size={12} className={p.crTag ? 'text-violet-400 shrink-0' : 'shrink-0'} />
                <span className="text-xs truncate flex-1">
                  {p.crTag ? p.crName || p.crTag : t.linkAccount}
                </span>
                {p.crTag && <span className="text-white/25 text-[10px] font-mono shrink-0">#{p.crTag}</span>}
              </button>
            )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
