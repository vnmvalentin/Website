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
//
// Duo-Party-Modus (partyMode === 'duo'): statt der einen flachen Liste zeigt sich hier
// zusätzlich die Team-Zuordnung — zwei Spalten mit je 2 Slots. Die Zeilen-Kachel selbst
// (PlayerRow) bleibt für beide Ansichten identisch, nur die Anordnung drumherum ändert sich.

import React from 'react';
import PlayerAvatar from '../components/PlayerAvatar';
import CrScoreBadge from './CrScoreBadge';
import { leagueIconUrl, leagueName } from '../data/leagueIcons';
// Alle Symbole echte CR-Grafiken: Zuschauen = Royale-TV, Mitspielen = Kampf-Schwerter,
// Host übergeben = Krone, Account = König, Bot = Goblin — siehe ui/CrIcons.jsx.
import {
  CrTv, CrBattle, CrCrown, CrUserRemove, CrDisconnected, CrKingBlue, CrUserAdd, CrGoblin,
  CrCrownBlue, CrCrownRed, CrTrophy,
} from '../ui/CrIcons';

/** Rang des verknüpften CR-Accounts rechts im Banner: Ranked-Liga-Emblem, sonst die Trophäen.
 *  crLeague/crTrophies setzt der Server beim Verknüpfen (clashRoyaleRoutes → linkCrAccount). */
export function RankBadge({ p }) {
  const icon = p.crLeague >= 1 ? leagueIconUrl(p.crLeague) : null;
  if (icon) {
    return (
      <span className="shrink-0 flex flex-col items-center -my-1" title={leagueName(p.crLeague)}>
        <img src={icon} alt={leagueName(p.crLeague)} width={38} height={38} className="w-[38px] h-[38px] object-contain drop-shadow-[0_2px_2px_rgba(2,8,20,0.6)]" />
      </span>
    );
  }
  if (p.crTrophies > 0) {
    return (
      <span className="shrink-0 flex items-center gap-1 font-cr text-sm text-[var(--cr-arcade-gold)] tabular-nums" title="Trophäen">
        <CrTrophy size={20} />{p.crTrophies.toLocaleString()}
      </span>
    );
  }
  return null;
}

/** Kleiner Zustands-Aufkleber neben dem Namen. */
function Badge({ icon: Icon, label, className, title }) {
  return (
    <span title={title}
      className={`flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md shrink-0 ${className}`}>
      {Icon && <Icon size={12} />}
      {label}
    </span>
  );
}

/** Chunky Icon-Knopf für die Host-Aktionen rechts in der Zeile. */
function IconAction({ icon: Icon, title, onClick, tone = 'neutral' }) {
  const toneClass = { neutral: '', violet: '', amber: 'cr-arcade-icon-btn--amber', red: 'cr-arcade-icon-btn--red' };
  // 34px sichtbare Fläche — kompakt genug für vier Aktionen nebeneinander und
  // groß genug, um auf dem Handy sicher getroffen zu werden.
  return (
    <button onClick={onClick} title={title} aria-label={title}
      className={`cr-arcade-icon-btn w-[34px] h-[34px] shrink-0 ${toneClass[tone] || ''}`}>
      <Icon size={20} />
    </button>
  );
}

/** Eine Spielerzeile — identisch in der flachen Solo-Liste wie in den Duo-Team-Slots. */
function PlayerRow({
  p, myId, hostId, canControlLobby, t,
  onToggleOwnSpectator, onSetPlayerSpectator, onTransferHost, onKick, onOpenCrAccount,
}) {
  const isMe = p.id === myId;
  const isHost = p.id === hostId;
  const showOwnToggle = isMe && !p.isAdmin;
  const showHostTools = canControlLobby && !isMe && !p.isAdmin;
  const canLink = !p.isAdmin && !p.isBot && (isMe || canControlLobby);

  // Ein Bot rauswerfen ist folgenlos (keine echte Verbindung, kein Fortschritt) — die
  // Rückfrage, die bei echten Spielern vor versehentlichem Kicken schützt, wäre hier nur
  // ein unnötiger Klick.
  const confirmKick = () => {
    if (p.isBot || window.confirm(t.kickConfirm(p.name))) onKick(p.id);
  };

  return (
    <div
      className={`cr-row cr-banner overflow-hidden ${p.isAdmin ? 'cr-row--admin' : isMe ? 'cr-row--me' : ''}`}
      // Spieler-Banner: die Spielerfarbe (dieselbe wie im Spiel) als Streifen links und
      // auslaufender Schimmer — so erkennt man die eigene Farbe schon vor dem Start.
      style={!p.isAdmin && p.color ? { '--cr-banner': p.color } : undefined}>
      <div className="flex items-center gap-3 pl-3.5 pr-2 py-2">

        <PlayerAvatar
          avatarId={p.avatar}
          avatarUrl={p.avatarUrl}
          size={44}
          isAdmin={p.isAdmin}
          // Zuschauer und Getrennte treten optisch zurück, ohne zu verschwinden
          className={p.isSpectator || p.disconnected ? 'opacity-40' : ''}
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className={`font-cr text-base leading-tight truncate ${
              p.isAdmin ? 'text-violet-300' : p.isSpectator || p.disconnected ? 'text-white/40' : 'text-white'
            }`}>
              {p.name}
            </span>
            {isHost && <CrCrown size={18} />}
          </div>

          <div className="flex items-center gap-1 mt-0.5 flex-wrap">
            {/* Der getrackte Punktestand steht direkt unter dem Namen — dort sucht
                man ihn während einer laufenden Challenge, nicht am Zeilenende
                zwischen den Aktionsknöpfen. */}
            {p.crScore && <CrScoreBadge score={p.crScore} t={t} />}
            {p.crName && !p.crScore && (
              <Badge icon={CrKingBlue} label={p.crName} className="text-white/55 border border-white/10" />
            )}
            {p.isAdmin && (
              <Badge label={t.admin} className="text-violet-300 bg-violet-500/10 border border-violet-500/30" />
            )}
            {p.isBot && (
              <Badge icon={CrGoblin} label={t.botBadge} className="text-cyan-300 bg-cyan-500/10 border border-cyan-500/30" />
            )}
            {p.disconnected && (
              <Badge icon={CrDisconnected} label={t.disconnected} title={t.disconnectedTitle}
                className="text-amber-300 bg-amber-400/10 border border-amber-400/30" />
            )}
            {!p.isAdmin && p.isSpectator && (
              <Badge icon={CrTv} label={t.spectator} className="text-white/55 border border-white/10" />
            )}
          </div>
        </div>

        {!p.isAdmin && !p.isBot && <RankBadge p={p} />}

        {/* Aktionen rechts, dauerhaft sichtbar — auf Touch gibt es kein Hover,
            und der Host soll nicht erst suchen müssen. */}
        <div className="flex items-center gap-1 shrink-0">
          {showOwnToggle && (
            <button onClick={onToggleOwnSpectator}
              className="cr-arcade-icon-btn flex items-center gap-1.5 text-xs font-semibold px-2.5 h-[34px] w-auto">
              {p.isSpectator ? <CrBattle size={18} /> : <CrTv size={18} />}
              <span className="hidden sm:inline">{p.isSpectator ? t.play : t.spectate}</span>
            </button>
          )}

          {showHostTools && (
            <IconAction
              icon={p.isSpectator ? CrBattle : CrTv}
              tone={p.isSpectator ? 'violet' : 'neutral'}
              title={p.isSpectator ? t.reactivateTitle : t.setSpectatorTitle}
              onClick={() => onSetPlayerSpectator(p.id, !p.isSpectator)}
            />
          )}
          {showHostTools && !isHost && !p.isBot && (
            <IconAction icon={CrCrown} tone="amber"
              title={t.transferHostTitle} onClick={() => onTransferHost(p.id)} />
          )}
          {showHostTools && !isHost && (
            <IconAction icon={CrUserRemove} tone="red"
              title={t.kickTitle} onClick={confirmKick} />
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
              ? 'border-[rgba(2,8,20,0.5)] text-white/70 hover:bg-white/5'
              : 'border-[rgba(2,8,20,0.5)] text-white/45 hover:bg-white/5 hover:text-white/75'
          }`}>
          <CrKingBlue size={18} className={p.crTag ? '' : 'opacity-60 grayscale'} />
          <span className="text-xs truncate flex-1">
            {p.crTag ? p.crName || p.crTag : t.linkAccount}
          </span>
          {p.crTag && <span className="text-white/35 text-[10px] tabular-nums shrink-0">#{p.crTag}</span>}
        </button>
      )}
    </div>
  );
}

/** Leerer Team-Slot: eigener "Beitreten"-Knopf für den Betrachter, sonst nur "Frei". */
function EmptySlot({ letter, canJoin, onJoin, t }) {
  return (
    <div className="rounded-xl border-2 border-dashed border-white/10 bg-[rgba(6,16,32,0.35)] px-3 py-2.5 flex items-center justify-between gap-2">
      <span className="text-white/40 text-xs">{t.emptyTeamSlot}</span>
      {canJoin && (
        <button onClick={onJoin}
          className="cr-arcade-icon-btn flex items-center gap-1.5 text-xs font-semibold px-2.5 h-[30px] w-auto">
          <CrUserAdd size={18} />
          {t.joinTeamLabel(letter)}
        </button>
      )}
    </div>
  );
}

export default function PlayerList({
  lobbyData, myId, canControlLobby, t,
  onToggleOwnSpectator, onSetPlayerSpectator, onTransferHost, onKick,
  onOpenCrAccount, onSwitchTeam, onAddBot,
}) {
  const players = lobbyData?.players || [];
  const hostId = lobbyData?.host;
  const duo = lobbyData?.partyMode === 'duo';

  const rowProps = { myId, hostId, canControlLobby, t, onToggleOwnSpectator, onSetPlayerSpectator, onTransferHost, onKick, onOpenCrAccount };

  // Für die Team-Slots: pro Team nach teamSlot sortiert (Slot 1 zuerst), egal in welcher
  // Reihenfolge die Spieler beigetreten sind.
  const teamOf = (letter) => players
    .filter(p => p.teamId === letter)
    .sort((a, b) => (a.teamSlot || 1) - (b.teamSlot || 1));
  const unassigned = players.filter(p => !p.teamId);
  const myTeam = players.find(p => p.id === myId)?.teamId || null;

  return (
    <div>

      {duo ? (
        <div className="space-y-4">
          {/* Test-Bots: nur in Duo sichtbar, weil sie sich aktuell nur in den 2v2-Modi selbst
              spielen (siehe elixirAuction2v2.js/elixirRush2v2.js) — praktisch, um die 4 Slots
              zu füllen, ohne jedes Mal 4 echte Leute zusammentrommeln zu müssen. */}
          {canControlLobby && !lobbyData?.started && (
            <button onClick={onAddBot}
              className="cr-arcade-icon-btn w-full flex items-center justify-center gap-1.5 text-xs font-semibold h-[34px]">
              <CrGoblin size={20} />
              {t.addBot}
            </button>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {['A', 'B'].map(letter => {
              const slots = teamOf(letter);
              // EIN gemeinsames Kästchen pro Team statt loser Beschriftung über zwei
              // unverbundenen Zeilen — Blau für Team A, Rot für Team B (dieselben
              // Akzentfarben wie --cr-arcade-blue/--cr-arcade-red im Rest vom Arcade-Look),
              // damit die zwei Teams auf den ersten Blick auseinanderfallen.
              const teamTint = letter === 'A'
                ? 'bg-blue-500/10 border-blue-500/25'
                : 'bg-red-500/10 border-red-500/25';
              const teamLabelTint = letter === 'A' ? 'text-blue-300' : 'text-red-300';
              const TeamCrown = letter === 'A' ? CrCrownBlue : CrCrownRed;
              return (
                <div key={letter} className={`rounded-lg border p-2.5 space-y-1.5 ${teamTint}`}>
                  <p className={`flex items-center gap-1.5 font-cr text-sm ${teamLabelTint}`}><TeamCrown size={22} />{t.teamLabel(letter)}</p>
                  {[0, 1].map(i => (
                    slots[i]
                      ? (
                        <div key={slots[i].id} className="space-y-1">
                          <PlayerRow p={slots[i]} {...rowProps} />
                          {/* Eigenes Team verlassen (jeder für sich) oder — als Host/Admin —
                              jeden beliebigen Spieler aus seinem Team nehmen (z.B. um ihn
                              danach über die Liste unten neu zuzuordnen). */}
                          {(slots[i].id === myId || canControlLobby) && (
                            <button onClick={() => onSwitchTeam(null, slots[i].id === myId ? undefined : slots[i].id)}
                              className="w-full text-white/25 hover:text-white/50 text-[11px] text-center py-0.5">
                              {slots[i].id === myId ? t.leaveTeam : t.removeFromTeam}
                            </button>
                          )}
                        </div>
                      )
                      : (
                        <EmptySlot key={i} letter={letter} t={t}
                          canJoin={!myTeam}
                          onJoin={() => onSwitchTeam(letter)} />
                      )
                  ))}
                </div>
              );
            })}
          </div>

          {unassigned.length > 0 && (
            <div className="space-y-1.5 pt-1 border-t border-white/5">
              {unassigned.map(p => {
                const isMe = p.id === myId;
                // Eigene Zeile: direkt hier beitreten statt erst zur Team-Spalte hochzuscrollen.
                // Jede fremde Zeile: Host/Admin darf JEDEN unzugeordneten Spieler direkt einem
                // Team zuweisen — praktisch, wenn er im Stream reihum durchgegeben wird.
                const showAssign = (isMe || canControlLobby) && !p.isSpectator;
                return (
                  <div key={p.id} className="space-y-1">
                    <PlayerRow p={p} {...rowProps} />
                    {showAssign && (
                      <div className="flex gap-1.5 px-1">
                        {['A', 'B'].map(letter => (
                          <button key={letter} onClick={() => onSwitchTeam(letter, isMe ? undefined : p.id)}
                            className="cr-arcade-icon-btn flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold px-2.5 h-[30px]">
                            <CrUserAdd size={18} />
                            {isMe ? t.joinTeamLabel(letter) : t.assignToTeamLabel(letter)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-1.5">
          {players.map(p => <PlayerRow key={p.id} p={p} {...rowProps} />)}
        </div>
      )}
    </div>
  );
}
