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
// die Team-Zuordnung — 2 bis 4 Team-Karten mit je 2 Plätzen, darüber für den Host Teamanzahl,
// "Teams mischen" und "Bot hinzufügen". Beitreten geht nur über den freien Platz im Team selbst
// (keine zweite Knopfreihe unter dem eigenen Namen), Verlassen über einen Knopf in der eigenen
// Zeile. Die Zeilen-Kachel selbst (PlayerRow) bleibt für beide Ansichten identisch.

import React from 'react';
import PlayerAvatar from '../components/PlayerAvatar';
import CrScoreBadge from './CrScoreBadge';
import { leagueIconUrl, leagueName } from '../data/leagueIcons';
// Alle Symbole echte CR-Grafiken: Zuschauen = Royale-TV, Mitspielen = Kampf-Schwerter,
// Host übergeben = Krone, Account = König, Bot = Goblin — siehe ui/CrIcons.jsx.
import {
  CrTv, CrBattle, CrCrown, CrUserRemove, CrDisconnected, CrKingBlue, CrUserAdd, CrGoblin,
  CrTrophy, CrRandom,
} from '../ui/CrIcons';
import { SegmentedControl } from '../ui/SettingRow';
import { activeTeams, teamStyle, teamChipClass } from './teamStyle';

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
  extraAction = null,
}) {
  const isMe = p.id === myId;
  const isHost = p.id === hostId;
  const showOwnToggle = isMe && !p.isAdmin && !!onToggleOwnSpectator;
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
      className={`cr-row cr-banner cr-join-in overflow-hidden ${p.isAdmin ? 'cr-row--admin' : isMe ? 'cr-row--me' : ''}`}
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
          {extraAction}
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

/** Leerer Team-Platz: "Beitreten" für den Betrachter, sonst nur "Frei". */
function EmptySlot({ letter, canJoin, onJoin, t }) {
  return (
    <div className="rounded-xl border-2 border-dashed border-white/10 bg-[rgba(6,16,32,0.35)] px-3 min-h-[60px] flex items-center justify-between gap-2">
      <span className="text-white/40 text-xs">{t.emptyTeamSlot}</span>
      {canJoin && (
        <button onClick={onJoin}
          className="cr-arcade-icon-btn flex items-center gap-1.5 text-xs font-semibold px-2.5 h-[34px] w-auto">
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
  onOpenCrAccount, onSwitchTeam, onAddBot, onSetTeamCount, onRandomizeTeams,
}) {
  const players = lobbyData?.players || [];
  const hostId = lobbyData?.host;
  const duo = lobbyData?.partyMode === 'duo';

  // Turnier-Lobby: niemand schaltet sich selbst auf Zuschauen (sonst startet sie nie von selbst)
  const rowProps = {
    myId, hostId, canControlLobby, t, onSetPlayerSpectator, onTransferHost, onKick, onOpenCrAccount,
    onToggleOwnSpectator: lobbyData?.tournament ? null : onToggleOwnSpectator,
  };

  // Für die Team-Plätze: [Slot 1, Slot 2] je Team, egal in welcher Reihenfolge beigetreten wurde
  const teamIds = activeTeams(lobbyData?.teamCount);
  const teamOf = (letter) => {
    const inTeam = players.filter(p => p.teamId === letter);
    return [inTeam.find(p => p.teamSlot !== 2) || null, inTeam.find(p => p.teamSlot === 2) || null];
  };
  const unassigned = players.filter(p => !p.teamId || !teamIds.includes(p.teamId));
  const me = players.find(p => p.id === myId) || null;

  return (
    <div>

      {duo ? (
        <div className="space-y-3">
          {/* Host-Werkzeuge in einer Zeile: Teamanzahl, mischen, Bot. Bots spielen sich nur in den
              2v2-Modi selbst (elixirAuction2v2.js/elixirRush2v2.js) — praktisch, um Plätze zu füllen. */}
          {canControlLobby && !lobbyData?.started && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-white/55 text-xs font-semibold">{t.teamCountLabel}</span>
              <div className="w-[150px]">
                <SegmentedControl
                  options={[2, 3, 4].map(n => ({ id: n, label: String(n) }))}
                  value={teamIds.length}
                  onChange={onSetTeamCount} />
              </div>
              <span className="flex-1" />
              <button onClick={onRandomizeTeams}
                className="cr-arcade-icon-btn flex items-center gap-1.5 text-xs font-semibold px-2.5 h-[34px] w-auto">
                <CrRandom size={18} />
                {t.randomizeTeams}
              </button>
              <button onClick={onAddBot}
                className="cr-arcade-icon-btn flex items-center gap-1.5 text-xs font-semibold px-2.5 h-[34px] w-auto">
                <CrGoblin size={18} />
                {t.addBot}
              </button>
            </div>
          )}

          {/* Untereinander statt zweispaltig: in der halben Lobby-Breite wurden die Namen sonst abgeschnitten */}
          <div className="grid grid-cols-1 gap-3">
            {teamIds.map(letter => {
              const slots = teamOf(letter);
              const style = teamStyle(letter);
              const filled = slots.filter(Boolean).length;
              // Beitreten darf jeder aktive Spieler, der nicht schon in genau diesem Team ist —
              // auch direkt aus einem anderen Team heraus (wechseln statt erst verlassen).
              const canJoin = !!me && !me.isSpectator && !me.isAdmin && me.teamId !== letter && !lobbyData?.started;
              return (
                <div key={letter} className={`rounded-xl border p-2.5 space-y-2 ${style.panel}`}>
                  <div className="flex items-center gap-2 px-0.5">
                    <span className={`${teamChipClass(letter)} w-6 h-6 text-sm`}>{letter}</span>
                    <span className={`font-cr text-sm ${style.text}`}>{t.teamLabel(letter)}</span>
                    <span className="ml-auto text-white/45 text-xs tabular-nums">{filled}/2</span>
                  </div>
                  {[0, 1].map(i => {
                    const pl = slots[i];
                    if (!pl) {
                      return <EmptySlot key={`empty-${i}`} letter={letter} t={t} canJoin={canJoin} onJoin={() => onSwitchTeam(letter)} />;
                    }
                    const isMe = pl.id === myId;
                    return (
                      <div key={pl.id} className="space-y-1">
                        <PlayerRow p={pl} {...rowProps}
                          extraAction={isMe && !lobbyData?.started ? (
                            <button onClick={() => onSwitchTeam(null)} title={t.leaveTeam}
                              className="cr-arcade-icon-btn flex items-center gap-1.5 text-xs font-semibold px-2.5 h-[34px] w-auto">
                              <CrUserRemove size={18} />
                              <span className="hidden sm:inline">{t.leaveTeamShort}</span>
                            </button>
                          ) : null} />
                        {/* Host/Admin nimmt andere aus dem Team — leise unter der Zeile, damit die
                            Aktionsleiste nicht noch einen roten Knopf neben "Kicken" bekommt. */}
                        {!isMe && canControlLobby && !lobbyData?.started && (
                          <button onClick={() => onSwitchTeam(null, pl.id)}
                            className="w-full text-white/30 hover:text-white/60 text-[11px] text-center py-0.5">
                            {t.removeFromTeam}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {unassigned.length > 0 && (
            <div className="space-y-1.5 pt-2 border-t border-white/10">
              <p className="text-white/45 text-xs font-semibold px-0.5">{t.withoutTeam(unassigned.length)}</p>
              {unassigned.map(pl => {
                // Nur der Host/Admin weist ANDERE direkt einem Team zu; für sich selbst nimmt jeder
                // den "Beitreten"-Knopf im Team (keine doppelte Knopfreihe unter dem eigenen Namen).
                const showAssign = canControlLobby && pl.id !== myId && !pl.isSpectator && !lobbyData?.started;
                return (
                  <div key={pl.id} className="space-y-1">
                    <PlayerRow p={pl} {...rowProps} />
                    {showAssign && (
                      <div className="flex flex-wrap items-center gap-1.5 px-1">
                        <span className="text-white/40 text-[11px]">{t.assignTo}</span>
                        {teamIds.map(letter => (
                          <button key={letter} onClick={() => onSwitchTeam(letter, pl.id)}
                            disabled={teamOf(letter).filter(Boolean).length >= 2}
                            title={t.assignToTeamLabel(letter)}
                            className="cr-arcade-icon-btn flex items-center gap-1.5 text-xs font-semibold px-2 h-[30px] w-auto disabled:opacity-35 disabled:cursor-not-allowed">
                            <span className={`${teamChipClass(letter)} w-5 h-5 text-xs`}>{letter}</span>
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
