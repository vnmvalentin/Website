// Match-Raum (Reiter "Raum"): Serienstand, Bereit, Start, Pick & Ban, Weg in die Draft-Lobby, gedraftete
// Decks + Freundschaftslinks für den Kampf in Clash Royale, Spielverlauf und Chat. Der Veranstalter
// trägt hier Spielergebnisse ein, annulliert Spiele oder entscheidet das Match direkt. Phase 4: Status der
// automatischen Kampfsuche, Fristen (Erscheinen, Kampf) als Countdown, Klärungsfälle mit Begründung.
// Zustand kommt live vom Server (Backend/clashRoyale/tournament/matchRoom.js → tmatch:state).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { playSound } from '../ui/sound';
import { useTitleAlert } from './useTitleAlert';
import { useNavigate } from 'react-router-dom';
import ChunkyButton from '../ui/ChunkyButton';
import Section from '../ui/Section';
import CardTile from '../ui/CardTile';
import { RankBadge } from '../lobby/PlayerList';
import { buildDeckLink } from '../data/cardDeckIds';
import { modeInfo, modeNameFor } from '../modesConfig';
import {
  CrBattle, CrCheck, CrClock, CrCancel, CrChat, CrSwap, CrRandom, CrCards, CrKingBlue, CrKingRed,
  CrCrown, CrTourneyTrophy, CrSocial, CrBook, CrTv,
} from '../ui/CrIcons';
import { tError } from './tI18n';
import { getSecret, tournamentApi } from './tournamentApi';
import { ResultModal } from './TournamentStructure';
import { matchLabel } from './matchLabels';

// Sekundentakt für Countdowns
function useNow(active = true) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}
const mmss = (ms) => {
  const sec = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
};

/** Klärungsfall (Unentschieden, falsches Deck, kein Kampf) mit Begründung. */
function ReviewBox({ game, nameOf, t }) {
  const r = game.review;
  if (!r) return null;
  const deckLines = [];
  if (r.reason === 'deckMismatch' && game.battle?.deck) {
    for (const side of ['a', 'b']) {
      const d = game.battle.deck[side];
      if (d?.missing?.length) deckLines.push(t.deckMissing(nameOf(side), d.missing.join(', ')));
      if (d?.extra?.length) deckLines.push(t.deckExtra(nameOf(side), d.extra.join(', ')));
    }
  }
  return (
    <div className="rounded-xl border border-amber-300/40 bg-amber-400/[0.07] px-4 py-3 space-y-1.5">
      <p className="font-cr text-[var(--cr-arcade-gold)] flex items-center gap-2"><CrClock size={18} />{t.reviewTitle}</p>
      <p className="text-white/80 text-sm">
        {r.reason === 'draw' ? t.reviewDraw(game.battle?.crownsA ?? 0, game.battle?.crownsB ?? 0)
          : r.reason === 'deckMismatch' ? t.reviewDeck : t.reviewNoBattle}
      </p>
      {game.battle && r.reason !== 'draw' && <p className="text-white/60 text-xs">{t.battleFound(game.battle.crownsA, game.battle.crownsB)}</p>}
      {deckLines.map((l, i) => <p key={i} className="text-red-300/90 text-xs">{l}</p>)}
    </div>
  );
}

const SIDE_STYLE = {
  a: { color: '#4d8dff', King: CrKingBlue },
  b: { color: '#ef4444', King: CrKingRed },
};

function PlayerBanner({ side, player, ready, showReady, isMe, t }) {
  const { color, King } = SIDE_STYLE[side];
  return (
    <div className={`cr-row cr-banner overflow-hidden min-w-0 ${isMe ? 'cr-row--me' : ''}`} style={{ '--cr-banner': color }}>
      <div className={`flex items-center gap-3 px-3.5 py-2.5 ${side === 'b' ? 'flex-row-reverse text-right' : ''}`}>
        <King size={34} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <p className={`font-cr text-white text-lg leading-tight truncate ${player?.dropped ? 'line-through opacity-60' : ''}`}>{player?.displayName || '—'}</p>
          <p className="text-white/45 text-[11px] truncate">{player ? `${player.crName} #${player.crTag}` : ''}</p>
        </div>
        {player && <RankBadge p={player} />}
      </div>
      {showReady && (
        <div className={`px-3.5 pb-2 flex ${side === 'b' ? 'justify-end' : ''}`}>
          <span className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${
            ready ? 'text-emerald-300 border-emerald-400/40 bg-emerald-500/10' : 'text-white/45 border-white/10 bg-black/20'
          }`}>
            {ready ? <CrCheck size={12} /> : <CrClock size={12} />}
            {ready ? t.ready : t.notReady}
          </span>
        </div>
      )}
    </div>
  );
}

/** Modus-Kachel für Pick & Ban und die Anzeige des gespielten Modus. */
function ModeTile({ modeId, lang, banned, bannedLabel, onClick, highlight }) {
  const Icon = modeInfo(modeId).icon;
  const inner = (
    <>
      <span className="cr-tile-icon w-14 h-14"><Icon size={38} /></span>
      <span className="font-cr text-white text-base text-center leading-tight">{modeNameFor(modeId, lang)}</span>
      {banned && (
        <span className="absolute inset-0 rounded-[14px] bg-[rgba(6,16,32,0.72)] flex flex-col items-center justify-center gap-1">
          <CrCancel size={34} />
          <span className="text-red-300 text-[11px] font-semibold">{bannedLabel}</span>
        </span>
      )}
    </>
  );
  const cls = `cr-tile-btn !flex-col !gap-2 px-3 py-4 ${highlight ? '!border-[var(--cr-arcade-gold)]' : ''}`;
  return onClick && !banned
    ? <button type="button" onClick={onClick} className={`${cls} hover:!border-red-400`}>{inner}</button>
    : <div className={`${cls} cr-tile-btn--static`}>{inner}</div>;
}

function DeckBlock({ title, deck, t }) {
  const link = buildDeckLink(deck);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(link.url); setCopied(true); setTimeout(() => setCopied(false), 1600); }
    catch { window.prompt(t.copyLink, link.url); }
  };
  return (
    <div className="cr-row p-3 space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-cr text-white min-w-0 basis-full xl:basis-auto xl:flex-1 truncate">{title}</p>
        {link.ok ? (
          <div className="flex gap-1.5 shrink-0">
            <ChunkyButton variant="blue" size="sm" onClick={copy}>{copied ? <CrCheck size={14} /> : t.copyLink}</ChunkyButton>
            <a href={link.url} target="_blank" rel="noopener noreferrer"><ChunkyButton variant="green" size="sm" tabIndex={-1}>{t.openDeck}</ChunkyButton></a>
          </div>
        ) : <span className="text-white/40 text-[11px]">{t.deckUnavailable}</span>}
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {(deck || []).map((c, i) => <CardTile key={`${c.id}-${i}`} card={c} ratio="card" />)}
      </div>
    </div>
  );
}

function FriendLink({ player, t }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-white/70 min-w-0 truncate">{t.friendLinkOf(player?.displayName)}</span>
      {player?.friendLink
        ? <a href={player.friendLink} target="_blank" rel="noopener noreferrer"><ChunkyButton variant="blue" size="sm" tabIndex={-1}>{t.open}</ChunkyButton></a>
        : <span className="text-white/40 text-xs">{t.noFriendLink}</span>}
    </div>
  );
}

function ChatPanel({ chat, onSend, myRole, players, t }) {
  const [text, setText] = useState('');
  const listRef = useRef(null);
  useEffect(() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight; }, [chat.length]);
  const send = () => { if (text.trim()) { onSend(text); setText(''); } };
  const roleColor = { a: SIDE_STYLE.a.color, b: SIDE_STYLE.b.color, owner: 'var(--cr-arcade-gold)', system: '#5eead4' };
  return (
    <div className="cr-arcade-panel overflow-hidden flex flex-col h-[28rem] lg:h-[36rem]">
      <div className="cr-section !py-3 shrink-0">
        <h3 className="cr-section-title"><CrChat size={22} />{t.chat}</h3>
      </div>
      <div ref={listRef} className="cr-section--rule flex-1 overflow-y-auto custom-scrollbar px-4 py-3 space-y-2">
        {chat.length === 0 && <p className="text-white/40 text-sm">{t.chatEmpty}</p>}
        {chat.map(m => (
          <div key={m.id} className="text-sm leading-snug break-words">
            <span className="font-cr mr-1.5" style={{ color: roleColor[m.role] }}>
              {m.role === 'owner' ? `${m.authorName} · ${t.roleOwner}` : m.role === 'system' ? t.roleSystem : (players[m.role]?.displayName || m.authorName)}
            </span>
            <span className="text-white/35 text-[10px] mr-1.5 tabular-nums">
              {new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            <span className={`text-white/85 ${m.role === myRole ? 'text-white' : ''}`}>{m.text}</span>
          </div>
        ))}
      </div>
      <div className="cr-section--rule shrink-0 p-3 flex gap-2">
        <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()}
          maxLength={300} placeholder={t.chatPh} className="cr-input px-3 py-2 text-sm flex-1 min-w-0" />
        <ChunkyButton variant="blue" size="sm" onClick={send}>{t.send}</ChunkyButton>
      </div>
    </div>
  );
}

export default function MatchRoom({ tournament, matchId, socket, connected, me, isOwner, structure, participants, onChanged, t, lang }) {
  const navigate = useNavigate();
  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  const [decideOpen, setDecideOpen] = useState(false);
  const [correctOpen, setCorrectOpen] = useState(false);
  const now = useNow(true);

  // Töne für die wichtigen Momente (Phase 6) — immer aus Sicht des eigenen Spielers
  const prevStateRef = useRef(null);
  useEffect(() => {
    const prev = prevStateRef.current;
    prevStateRef.current = state;
    if (!prev || !state || prev.matchId !== state.matchId || !me) return;
    const side = state.players.a?.id === me.id ? 'a' : state.players.b?.id === me.id ? 'b' : null;
    if (!side) return;
    const opp = side === 'a' ? 'b' : 'a';
    if (!prev.ready[opp] && state.ready[opp]) playSound('join');
    if (state.banTurn === side && prev.banTurn !== side) playSound('pick');
    else if (prev.phase !== state.phase && (state.phase === 'banning' || state.phase === 'drafting')) playSound('start');
    const doneBefore = prev.games.filter(g => g.status === 'done').length;
    const doneNow = state.games.filter(g => g.status === 'done');
    if (doneNow.length > doneBefore) playSound(doneNow[doneNow.length - 1].winner === side ? 'win' : 'tap');
  }, [state, me]);
  // Tab-Titel blinkt, wenn ich beim Bannen dran bin und der Tab im Hintergrund ist
  const myBanTurn = !!(state && me && state.banTurn && state.players[state.banTurn]?.id === me.id);
  useTitleAlert(myBanTurn ? t.yourTurnTitle : null);
  const secret = getSecret(tournament.id);
  const base = useMemo(() => ({ tournamentId: tournament.id, matchId, secret }), [tournament.id, matchId, secret]);

  // Raum betreten/verlassen und Zustand live halten
  useEffect(() => {
    if (!socket || !connected || !matchId) return undefined;
    setError('');
    const onState = (s) => { if (s.matchId === matchId) setState(s); };
    const onChat = ({ matchId: mid, message }) => {
      if (mid !== matchId) return;
      setState(prev => (prev && !prev.chat.some(c => c.id === message.id) ? { ...prev, chat: [...prev.chat, message] } : prev));
    };
    const onError = ({ error: e }) => setError(tError(t, { error: e }));
    socket.on('tmatch:state', onState);
    socket.on('tmatch:chat', onChat);
    socket.on('tmatch:error', onError);
    socket.emit('tmatch:join', base, (res) => { if (res?.error) setError(tError(t, res)); });
    return () => {
      socket.emit('tmatch:leave', base);
      socket.off('tmatch:state', onState);
      socket.off('tmatch:chat', onChat);
      socket.off('tmatch:error', onError);
    };
    // t wechselt nur mit der Sprache — kein Grund, den Raum neu zu betreten
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, connected, base]);

  const send = (event, payload = {}) => new Promise((resolve) => {
    setError('');
    socket?.emit(event, { ...base, ...payload }, (res) => {
      if (res?.error) setError(tError(t, res));
      resolve(res);
    });
  });

  if (error && !state) return <div className="cr-arcade-panel p-6 text-center text-white/75">{error}</div>;
  if (!state) return <p className="text-center text-white/55 py-12">{connected ? t.loading : t.connecting}</p>;

  const mySide = me && state.players.a?.id === me.id ? 'a' : me && state.players.b?.id === me.id ? 'b' : null;
  const myRole = mySide || (isOwner ? 'owner' : null);
  const P = state.players;
  const active = state.games.find(g => !['done', 'void'].includes(g.status)) || null;
  const nextNo = state.games.length ? Math.max(...state.games.map(g => g.gameNo)) + 1 : 1;
  const bothReady = state.ready.a && state.ready.b;
  const matchStructure = structure?.matches?.find(m => m.id === state.matchId);
  const label = matchStructure ? matchLabel(matchStructure, structure.matches, t) : '';
  const nameOf = (side) => P[side]?.displayName || side.toUpperCase();
  // Erscheinen-Frist: läuft, solange genau einer da war und noch kein Spiel begonnen hat
  const pr = state.presence || {};
  const showUpLeft = state.phase === 'lobby' && !state.games.some(g => g.status !== 'void') && pr.waitStart && (pr.a !== pr.b)
    ? pr.waitStart + state.showUpMinutes * 60000 - now : null;

  // ── Hauptbereich je Phase ──
  let main;
  if (state.phase === 'finished') {
    const w = state.match.winner;
    main = (
      <div className="flex items-center gap-4">
        <CrTourneyTrophy size={60} />
        <div>
          <p className="font-cr text-white text-2xl">{w ? t.matchWonBy(nameOf(w)) : '—'}</p>
          <p className="text-white/55 text-sm">
            {state.match.scoreA} : {state.match.scoreB}{state.presence?.forfeit ? ` · ${t.forfeitNote}` : ''}
          </p>
        </div>
      </div>
    );
  } else if (state.phase === 'lobby') {
    main = (
      <div className="space-y-4">
        <p className="text-white/65 text-sm">{t.readyHint(nameOf('a'))}</p>
        {state.paused && <p className="text-amber-200 text-sm">{t.pausedBanner}</p>}
        <div className="flex flex-wrap gap-3">
          {mySide && (
            <ChunkyButton variant={state.ready[mySide] ? 'blue' : 'green'} size="lg" icon={CrCheck} iconSize={24}
              onClick={() => send('tmatch:ready', { ready: !state.ready[mySide] })}>
              {state.ready[mySide] ? t.unsetReady : t.setReady}
            </ChunkyButton>
          )}
          {(mySide === 'a' || isOwner) && (
            <ChunkyButton variant="gold" size="lg" icon={CrBattle} iconSize={26} disabled={!bothReady || state.paused}
              onClick={() => send('tmatch:start')}>
              {t.startGame(nextNo)}
            </ChunkyButton>
          )}
        </div>
        {bothReady && mySide === 'b' && <p className="text-white/60 text-sm">{t.waitingForStart(nameOf('a'))}</p>}
        {showUpLeft !== null && (
          <p className="text-amber-200 text-sm flex items-center gap-2">
            <CrClock size={18} />{t.waitingForShowUp(nameOf(state.presence.a ? 'b' : 'a'), mmss(showUpLeft))}
          </p>
        )}
      </div>
    );
  } else if (state.phase === 'banning' && active) {
    const myTurn = mySide && state.banTurn === mySide;
    main = (
      <div className="space-y-4">
        <p className={`font-cr text-lg ${myTurn ? 'text-[var(--cr-arcade-gold)]' : 'text-white/70'}`}>
          {myTurn ? t.yourBan : t.theirBan(nameOf(state.banTurn))}
        </p>
        <div className="grid grid-cols-3 gap-3">
          {active.offer.map(mid => {
            const ban = active.bans.find(b => b.mode === mid);
            return (
              <ModeTile key={mid} modeId={mid} lang={lang} banned={!!ban} bannedLabel={ban ? t.bannedBy(nameOf(ban.side)) : ''}
                onClick={myTurn ? () => send('tmatch:ban', { mode: mid }) : null} />
            );
          })}
        </div>
      </div>
    );
  } else if (state.phase === 'drafting' && active) {
    const draftUrl = `/clash-royale?code=${encodeURIComponent(active.lobbyCode)}&turnier=${encodeURIComponent(tournament.id)}`;
    main = (
      <div className="flex flex-wrap items-center gap-5">
        <div className="w-40"><ModeTile modeId={active.mode} lang={lang} highlight /></div>
        <div className="flex-1 min-w-[14rem] space-y-3">
          <p className="cr-eyebrow">{t.playedMode}</p>
          <p className="font-cr text-white text-2xl leading-tight">{modeNameFor(active.mode, lang)}</p>
          <p className="text-white/55 text-sm">{t.draftHint}</p>
          {(mySide || isOwner) && (
            <ChunkyButton variant="green" size="lg" icon={mySide ? CrCards : CrTv} iconSize={26} onClick={() => navigate(draftUrl)}>
              {mySide ? t.toDraft : t.watchDraft}
            </ChunkyButton>
          )}
        </div>
      </div>
    );
  } else if (state.phase === 'battle' && active) {
    const opp = mySide === 'a' ? 'b' : mySide === 'b' ? 'a' : null;
    main = (
      <div className="space-y-4">
        {/* Klärungsfall zuerst — das ist es, worum sich der Veranstalter jetzt kümmern muss */}
        <ReviewBox game={active} nameOf={nameOf} t={t} />
        <div>
          <p className="font-cr text-white text-xl">{t.battleTitle}</p>
          <ol className="mt-2 space-y-1">
            {t.battleSteps.map((s, i) => (
              <li key={i} className="flex gap-2 text-sm text-white/75">
                <span className="text-[var(--cr-arcade-gold)] font-cr shrink-0">{i + 1}.</span><span>{s}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="space-y-2">
          {opp ? <FriendLink player={P[opp]} t={t} /> : <><FriendLink player={P.a} t={t} /><FriendLink player={P.b} t={t} /></>}
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          {(mySide === 'b' ? ['b', 'a'] : ['a', 'b']).map(side => (
            <DeckBlock key={side} title={t.deckOf(nameOf(side))} deck={active.decks?.[side]} t={t} />
          ))}
        </div>
        {active.status === 'battle' && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            {state.apiActive ? (
              <span className="flex items-center gap-2 text-white/75">
                <CrClock size={18} />{t.searching}
                {active.checkedAt && <span className="text-white/40 text-xs">{t.lastChecked(Math.max(0, Math.round((now - active.checkedAt) / 1000)))}</span>}
              </span>
            ) : <span className="text-white/60">{t.apiOff}</span>}
            {active.battleDeadline && (
              <span className={`text-xs ${active.battleDeadline - now > 0 ? 'text-white/50' : 'text-amber-200'}`}>
                {active.battleDeadline - now > 0 ? t.battleDeadlineIn(mmss(active.battleDeadline - now)) : t.battleDeadlineOver}
              </span>
            )}
          </div>
        )}
        {state.apiActive && <p className="text-white/45 text-xs">{t.waitingResult}</p>}
      </div>
    );
  }

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] gap-4 items-start">
      <div className="space-y-4 min-w-0">
        {/* ── Kopf: A · Serienstand · B ── */}
        <div className="cr-arcade-panel p-3 md:p-4">
          <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
            <PlayerBanner side="a" player={P.a} ready={state.ready.a} showReady={state.phase === 'lobby'} isMe={mySide === 'a'} t={t} />
            <div className="text-center px-1">
              <p className="cr-eyebrow whitespace-nowrap">{label} · {t.bestOfShort(state.match.bestOf)}</p>
              <p className="font-cr text-white text-4xl md:text-5xl leading-none tabular-nums mt-1" style={{ textShadow: '0 3px 0 rgba(2,8,20,0.6)' }}>
                {/* Entschiedenes Match: offizieller Endstand (auch bei direkter Entscheidung/kampflos), sonst Serienstand */}
                {state.phase === 'finished' ? state.match.scoreA : state.score.a}
                <span className="text-white/35 mx-1.5">:</span>
                {state.phase === 'finished' ? state.match.scoreB : state.score.b}
              </p>
            </div>
            <PlayerBanner side="b" player={P.b} ready={state.ready.b} showReady={state.phase === 'lobby'} isMe={mySide === 'b'} t={t} />
          </div>
        </div>

        {/* ── Phase ── */}
        <div className="cr-arcade-panel overflow-hidden">
          <Section icon={state.phase === 'banning' ? CrSwap : state.phase === 'drafting' ? (state.modeSelection === 'random' ? CrRandom : CrCards) : CrBattle}
            title={state.phase === 'banning' && active ? t.pickBanTitle(active.gameNo) : active ? t.gameN(active.gameNo) : t.roomTitle}>
            {main}
            {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
          </Section>

          {/* Veranstalter: Ergebnis des laufenden Spiels, annullieren, Match direkt entscheiden */}
          {isOwner && state.phase === 'finished' && matchStructure && matchStructure.status === 'done' && (
            <Section icon={CrCrown} title={t.ownerTools}>
              <div className="flex flex-wrap gap-2">
                <ChunkyButton variant="blue" size="sm" icon={CrSwap} onClick={() => setCorrectOpen(true)}>{t.correctResult}</ChunkyButton>
                <ChunkyButton variant="red" size="sm" icon={CrCancel} onClick={async () => {
                  if (!window.confirm(t.replayConfirm)) return;
                  try { await tournamentApi.resetMatch(tournament.id, state.matchId); onChanged(); }
                  catch (e) { setError(tError(t, e)); }
                }}>{t.replayMatch}</ChunkyButton>
              </div>
              {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
            </Section>
          )}
          {isOwner && state.phase !== 'finished' && (
            <Section icon={CrCrown} title={t.ownerTools}>
              <div className="flex flex-wrap gap-2">
                {active && ['battle', 'drafting', 'review'].includes(active.status) && (
                  <>
                    <ChunkyButton variant="green" size="sm" onClick={() => send('tmatch:gameResult', { gameNo: active.gameNo, winner: 'a' })}>
                      {t.gameWonBy(nameOf('a'))}
                    </ChunkyButton>
                    <ChunkyButton variant="green" size="sm" onClick={() => send('tmatch:gameResult', { gameNo: active.gameNo, winner: 'b' })}>
                      {t.gameWonBy(nameOf('b'))}
                    </ChunkyButton>
                  </>
                )}
                {active && (
                  <ChunkyButton variant="red" size="sm" icon={CrCancel}
                    onClick={() => window.confirm(t.voidConfirm) && send('tmatch:voidGame', { gameNo: active.gameNo })}>
                    {t.voidGame}
                  </ChunkyButton>
                )}
                {matchStructure?.playable && (
                  <ChunkyButton variant="blue" size="sm" icon={CrSwap} onClick={() => setDecideOpen(true)}>{t.decideMatch}</ChunkyButton>
                )}
              </div>
            </Section>
          )}

          {/* ── Spielverlauf der Serie ── */}
          {state.games.length > 0 && (
            <Section icon={CrBook} title={t.gameHistory}>
              <div className="flex flex-col gap-1.5">
                {state.games.map(g => (
                  <div key={g.gameNo} className={`flex items-center gap-3 text-sm ${g.status === 'void' ? 'opacity-45' : ''}`}>
                    <span className="font-cr text-white/60 w-16 shrink-0">{t.gameN(g.gameNo)}</span>
                    <span className="text-white/85 flex-1 truncate">{g.mode ? modeNameFor(g.mode, lang) : '—'}</span>
                    {g.status === 'done' && (g.crownsA || g.crownsB) ? (
                      <span className="font-cr text-white/70 text-xs tabular-nums">{g.crownsA} : {g.crownsB}</span>
                    ) : null}
                    <span className={`font-semibold text-xs ${g.winner ? 'text-[var(--cr-arcade-gold)]' : g.status === 'review' ? 'text-amber-200' : 'text-white/45'}`}>
                      {g.status === 'done' ? t.gameWonBy(nameOf(g.winner)) : g.status === 'void' ? t.gameVoid : g.status === 'review' ? t.reviewTitle : t.gameRunning}
                    </span>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </div>
      </div>

      <ChatPanel chat={state.chat} myRole={myRole} players={P} t={t} onSend={(text) => send('tmatch:chat', { text })} />

      {correctOpen && matchStructure && (
        <ResultModal correct tournamentId={tournament.id} match={matchStructure} matches={structure.matches}
          byId={new Map(participants.map(p => [p.id, p]))} t={t}
          onClose={() => setCorrectOpen(false)}
          onSaved={() => { setCorrectOpen(false); onChanged(); }} />
      )}
      {decideOpen && matchStructure && (
        <ResultModal tournamentId={tournament.id} match={matchStructure} matches={structure.matches}
          byId={new Map(participants.map(p => [p.id, p]))} t={t}
          onClose={() => setDecideOpen(false)}
          onSaved={() => { setDecideOpen(false); onChanged(); }} />
      )}
    </div>
  );
}

/** Platzhalter im Reiter "Raum", wenn (noch) kein Match gewählt ist. */
export function NoRoom({ isOwner, t }) {
  return (
    <div className="cr-arcade-panel p-6 flex items-center gap-4">
      <CrSocial size={48} className="shrink-0 opacity-70" />
      <p className="text-white/70">{isOwner ? t.roomOwnerHint : t.roomNoMatch}</p>
    </div>
  );
}
