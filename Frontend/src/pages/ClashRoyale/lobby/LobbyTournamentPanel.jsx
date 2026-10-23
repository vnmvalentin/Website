// Laufendes Lobby-Turnier — Inhalt des Reiters "Turnier" in der Lobby und im Ende-Bildschirm.
//
// Aufbau: oben Stand + Host-Steuerung (Turnier starten → Runde für Runde: Sieger eintragen,
// "Nächste Runde starten"), darunter der Spielplan als Runden-Auswahl mit großen VS-Karten
// (Profilbilder), ganz unten die Tabelle (Jeder gegen jeden) bzw. der Turnierbaum.
// Runden kommen vom Server (match.wave, Backend/clashRoyale/core/lobbyTournament.js).
//
// Baum, Podest und Rundennamen stammen aus dem großen Turnier (tournament/TournamentStructure.jsx,
// Podium.jsx, matchLabels.js) — die Match-Objekte haben dieselbe Form.
import React, { useEffect, useMemo, useState } from 'react';
import ChunkyButton from '../ui/ChunkyButton';
import Modal from '../ui/Modal';
import Section from '../ui/Section';
import CardFace from '../ui/CardFace';
import PlayerAvatar from '../components/PlayerAvatar';
import { DeckGrid } from '../modes/GameChrome';
import { BracketPanel } from '../tournament/TournamentStructure';
import Podium from '../tournament/Podium';
import { tDict } from '../tournament/tI18n';
import { matchLabel } from '../tournament/matchLabels';
import { CrTourneyTrophy, CrBattle, CrCards, CrSocial, CrCrown, CrCheck } from '../ui/CrIcons';
import { ltDict } from './ltourI18n';

const phaseText = (lt, phase) => ({
  drawn: lt.phaseDrawn, running: lt.phaseRunning, finished: lt.phaseFinished,
}[phase] || '');

/** Name einer Begegnung: "Halbfinale" & Co. im Baum, "Runde N" bei Jeder-gegen-jeden. */
const labelOf = (m, ltour, tt) => (m.stage === 'group' ? tt.roundN(m.round) : matchLabel(m, ltour.matches, tt));

/** Runden (Wellen) mit Namen: tragen alle Begegnungen denselben Namen ("Finale"), dann der, sonst "Runde N". */
function roundsOf(ltour, tt) {
  const waves = [...new Set(ltour.matches.map(m => m.wave))].sort((a, b) => a - b);
  return waves
    .map((w, i) => {
      const list = ltour.matches.filter(m => m.wave === w && m.status !== 'skipped');
      const real = list.filter(m => m.status !== 'bye');
      const names = [...new Set(real.map(m => labelOf(m, ltour, tt)))];
      return { wave: w, index: i + 1, list, label: names.length === 1 ? names[0] : tt.roundN(i + 1), real: real.length };
    })
    .filter(r => r.list.length > 0);
}

/** Deck eines Spielers in einer Begegnung — kommt aus dem Draft der Begegnung bzw. ihrer Runde. */
const deckFor = (m, side) => m.decks?.[side] || [];

// ── Decks einer Begegnung (Dialog) ──────────────────────────────────────────

function DecksDialog({ m, ltour, byId, lt, tt, onClose }) {
  const side = (key) => {
    const P = byId.get(key === 'a' ? m.a : m.b);
    const deck = deckFor(m, key);
    return (
      <div className={`cr-row p-3 flex-1 min-w-0 ${m.status === 'done' && m.winner === key ? 'cr-row--me' : ''}`}>
        <p className="font-cr text-white text-lg truncate flex items-center gap-2">
          <PlayerAvatar avatarId={P?.avatar} avatarUrl={P?.avatarUrl} size={30} />
          {P?.displayName || tt.tbd}
        </p>
        <div className="mt-2">
          {deck.length
            ? <DeckGrid deck={deck} size={8} renderCard={(c) => <CardFace id={c.id} alt={c.name} />} />
            : <p className="text-white/45 text-xs py-6 text-center">{lt.noDeckYet}</p>}
        </div>
      </div>
    );
  };
  return (
    <Modal onClose={onClose} size="lg" icon={<CrCards size={24} />} title={`${labelOf(m, ltour, tt)} · ${lt.decks}`}>
      <div className="cr-section flex flex-col sm:flex-row gap-3">
        {side('a')}
        <span className="self-center font-cr text-white/40 text-xl">{tt.vs}</span>
        {side('b')}
      </div>
    </Modal>
  );
}

// ── VS-Karte einer Begegnung ────────────────────────────────────────────────

function VsSide({ P, bye, won, lost, align, tt }) {
  return (
    <div className={`flex flex-col items-center gap-1.5 min-w-0 flex-1 transition-opacity ${lost ? 'opacity-45' : ''}`}>
      <div className="relative">
        {won && <CrCrown size={30} className="absolute -top-5 left-1/2 -translate-x-1/2 cr-win-pop" />}
        {P ? (
          <PlayerAvatar avatarId={P.avatar} avatarUrl={P.avatarUrl} size={64}
            className={won ? 'ring-[3px] ring-[var(--cr-arcade-gold)]' : ''} />
        ) : (
          <span className="cr-avatar rounded-full flex items-center justify-center text-white/40 font-cr text-2xl" style={{ width: 64, height: 64 }}>?</span>
        )}
      </div>
      <span className={`font-cr text-base leading-tight truncate max-w-full ${align} ${
        won ? 'text-[var(--cr-arcade-gold)]' : P ? 'text-white' : 'text-white/40'
      }`}>
        {bye ? tt.bye : P?.displayName || tt.tbd}
      </span>
    </div>
  );
}

function VsCard({ m, ltour, byId, canControl, inGame, isCurrentRound, actions, lt, tt, onDecks, style }) {
  const A = byId.get(m.a), B = byId.get(m.b);
  const done = m.status === 'done';
  const bye = m.status === 'bye';
  const perMatch = ltour.settings.draft === 'perMatch';
  const hasDecks = !!m.decks;
  const score = done ? { scoreA: m.scoreA, scoreB: m.scoreB } : m.live;
  const drafting = m.live?.phase === 'drafting';
  const host = canControl && m.playable;
  const showDecks = !!(m.a && m.b && m.decks);
  const showUndo = canControl && m.games > 0 && isCurrentRound;
  const winBtn = (side, P) => (
    <ChunkyButton variant="green" size="sm" block icon={CrCheck} iconSize={16}
      onClick={() => actions.ltourGameWin(m.id, side)} title={lt.gameWon(P?.displayName || '?')}>
      {lt.win}
    </ChunkyButton>
  );

  return (
    <div style={style}
      className={`cr-deal-card cr-game-card p-3.5 flex flex-col gap-3 ${isCurrentRound && m.playable ? 'cr-game-card--turn' : ''} ${bye ? 'opacity-60' : ''}`}>
      <div className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-wider text-white/45">
        <span className="truncate">{labelOf(m, ltour, tt)}</span>
        <span className="shrink-0">{tt.bestOfShort(m.bestOf)}</span>
      </div>

      <div className="flex items-center gap-2">
        <VsSide P={A} bye={m.aBye} won={done && m.winner === 'a'} lost={done && m.winner === 'b'} align="text-center" tt={tt} />
        <div className="shrink-0 w-16 text-center">
          {score && (score.scoreA || score.scoreB || done) ? (
            <span className={`font-cr text-2xl tabular-nums ${done ? 'text-[var(--cr-arcade-gold)]' : 'text-sky-200'}`}>
              {score.scoreA}:{score.scoreB}
            </span>
          ) : (
            <span className="font-cr text-2xl text-white/80" style={{ textShadow: 'var(--cr-text-outline)' }}>VS</span>
          )}
          {drafting && <span className="block text-sky-200 text-[11px] mt-0.5">{lt.draftRunning}</span>}
        </div>
        <VsSide P={B} bye={m.bBye} won={done && m.winner === 'b'} lost={done && m.winner === 'a'} align="text-center" tt={tt} />
      </div>

      {/* Host-Steuerung nur an Begegnungen der laufenden Runde */}
      {host && perMatch && !hasDecks && !inGame && (
        <ChunkyButton variant="blue" size="sm" block icon={CrCards} iconSize={18} disabled={drafting}
          onClick={() => actions.ltourStartMatch(m.id)}>
          {drafting ? lt.draftRunning : lt.startDraft}
        </ChunkyButton>
      )}
      {host && hasDecks && (
        <div className="flex gap-2">
          <div className="flex-1">{winBtn('a', A)}</div>
          <div className="flex-1">{winBtn('b', B)}</div>
        </div>
      )}

      {(showDecks || showUndo) && (
        <div className="flex items-center justify-center gap-3 text-xs">
          {showDecks && (
            <button type="button" onClick={() => onDecks(m.id)} className="text-white/60 hover:text-white underline underline-offset-2">
              {lt.showDecks}
            </button>
          )}
          {showUndo && (
            <button type="button" onClick={() => actions.ltourUndo(m.id)} className="text-white/60 hover:text-white underline underline-offset-2">
              {lt.undo}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Tabelle (Jeder gegen jeden) ─────────────────────────────────────────────

function StandingsTable({ ltour, byId, lt }) {
  return (
    <div className="cr-arcade-panel overflow-hidden">
      <Section icon={CrSocial} title={lt.standings}>
        <div className="flex flex-col gap-1.5">
          {(ltour.standings || []).map((r, i) => {
            const p = byId.get(r.id);
            const podium = r.place <= 3 && r.played > 0;
            return (
              <div key={r.id} className={`cr-row cr-deal-card flex items-center gap-3 px-3 py-2 ${r.place === 1 && r.played > 0 ? 'cr-row--me' : ''}`}
                style={{ animationDelay: `${(i * 0.05).toFixed(2)}s` }}>
                <span className={`font-cr text-lg w-6 text-center ${podium ? 'text-[var(--cr-arcade-gold)]' : 'text-white/45'}`}>{r.place}</span>
                <PlayerAvatar avatarId={p?.avatar} avatarUrl={p?.avatarUrl} size={36} />
                <span className="flex-1 min-w-0 truncate font-cr text-white text-base">{p?.displayName || '—'}</span>
                <span className="text-right tabular-nums">
                  <span className="block font-cr text-white text-base leading-none">{r.wins}–{r.losses}</span>
                  <span className="block text-white/45 text-[11px] mt-0.5">{lt.colGames} {r.gameDiff > 0 ? '+' : ''}{r.gameDiff}</span>
                </span>
              </div>
            );
          })}
        </div>
      </Section>
    </div>
  );
}

/**
 * @param {boolean} inGame  Im Ende-Bildschirm eines Drafts: Sieger eintragen und nächste Runde gehen,
 *                          Starten, Draft starten, Abbrechen und "Neues Turnier" erst in der Lobby
 */
export default function LobbyTournamentPanel({ lobbyData, canControl, actions, lang, inGame = false }) {
  const ltour = lobbyData?.ltour;
  const lt = ltDict(lang);
  const tt = tDict(lang);
  const byId = useMemo(() => new Map((ltour?.participants || []).map(p => [p.id, p])), [ltour?.participants]);
  const rounds = useMemo(() => (ltour ? roundsOf(ltour, tt) : []), [ltour, tt]);
  const currentWave = ltour?.round || rounds[0]?.wave || 1;
  const [shownWave, setShownWave] = useState(currentWave);
  const [decksId, setDecksId] = useState(null);
  // Beginnt eine neue Runde, springt die Ansicht mit
  useEffect(() => { setShownWave(currentWave); }, [currentWave]);
  if (!ltour || ltour.phase === 'setup') return null;

  const current = rounds.find(r => r.wave === currentWave);
  const shown = rounds.find(r => r.wave === shownWave) || current || rounds[0];
  const decided = current ? current.list.filter(m => m.status !== 'pending').length : 0;
  const decksMatch = ltour.matches.find(m => m.id === decksId) || null;

  const shared = ltour.settings.draft === 'shared';
  // Draft pro Runde: Runde läuft, aber ihr Draft fehlt (abgebrochen oder Start gescheitert)
  const roundNeedsDraft = shared && ltour.phase === 'running' && !ltour.draftingRound && !!current
    && current.list.some(m => m.playable && !m.decks);

  let status = null;
  if (ltour.phase === 'drawn') status = lt.drawnHint;
  else if (ltour.phase === 'running' && current) {
    status = ltour.draftingRound ? lt.roundDraftRunning(current.label)
      : roundNeedsDraft ? lt.roundNeedsDraft(current.label)
        : ltour.roundDone ? lt.roundComplete(current.label)
          : lt.roundStatus(current.label, decided, current.list.length);
    if (inGame && shared && ltour.roundDone && ltour.hasNextRound) status += ` ${lt.nextRoundFromLobby}`;
  }

  return (
    <div id="ltour-panel" className="space-y-4 cr-anim-rise">
      {/* ── Stand + Host-Steuerung ── */}
      <div className="cr-arcade-panel overflow-hidden">
        <Section icon={CrTourneyTrophy} title={lt.title} aside={phaseText(lt, ltour.phase)}>
          {ltour.phase === 'finished' && ltour.podium && <Podium podium={ltour.podium} byId={byId} me={null} t={tt} />}
          <div className={`flex flex-wrap items-center justify-between gap-3 ${ltour.phase === 'finished' ? 'mt-3' : ''}`}>
            {status && <p className="text-white/70 text-sm flex-1 min-w-[12rem]">{status}</p>}
            <div className="flex flex-wrap items-center gap-2">
              {canControl && !inGame && ltour.phase === 'drawn' && (
                <ChunkyButton variant="green" size="md" icon={CrBattle} iconSize={24} className="cr-shine" onClick={actions.ltourBegin}>
                  {ltour.settings.draft === 'shared' ? lt.beginShared : lt.beginTournament}
                </ChunkyButton>
              )}
              {canControl && !inGame && roundNeedsDraft && (
                <ChunkyButton variant="blue" size="md" icon={CrCards} iconSize={24} onClick={actions.ltourStartRoundDraft}>
                  {lt.startRoundDraft}
                </ChunkyButton>
              )}
              {/* Draft pro Runde: die nächste Runde startet mit einem Draft — das geht nur aus der Lobby */}
              {canControl && ltour.phase === 'running' && ltour.roundDone && !(inGame && shared && ltour.hasNextRound) && (
                <ChunkyButton variant="green" size="md" icon={CrBattle} iconSize={24} className="cr-shine" onClick={actions.ltourNextRound}>
                  {ltour.hasNextRound ? lt.nextRound : lt.finishTournament}
                </ChunkyButton>
              )}
              {!canControl && (ltour.phase === 'drawn' || ltour.roundDone) && (
                <span className="text-white/45 text-xs">{lt.waitingHost}</span>
              )}
              {canControl && !inGame && ltour.phase === 'finished' && (
                <ChunkyButton variant="gold" size="md" icon={CrTourneyTrophy} iconSize={22} onClick={actions.ltourReset}>
                  {lt.newTournament}
                </ChunkyButton>
              )}
              {canControl && !inGame && ltour.phase !== 'finished' && (
                <button type="button" className="cr-tile-btn !w-auto px-3 py-1.5 font-cr text-sm text-red-300"
                  onClick={() => { if (window.confirm(lt.abortConfirm)) actions.ltourReset(); }}>
                  {lt.abort}
                </button>
              )}
            </div>
          </div>
        </Section>
      </div>

      {/* ── Spielplan: Runden-Auswahl + VS-Karten ── */}
      <div className="cr-arcade-panel overflow-hidden">
        <Section icon={CrBattle} title={lt.schedule}>
          <div className="flex flex-wrap gap-2 mb-4" role="tablist">
            {rounds.map(r => {
              const active = r.wave === shown?.wave;
              const isNow = r.wave === currentWave && ltour.phase === 'running';
              const finished = r.list.every(m => m.status !== 'pending');
              return (
                <button key={r.wave} type="button" role="tab" aria-selected={active} onClick={() => setShownWave(r.wave)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-cr text-sm border-2 transition-colors ${
                    active ? 'bg-[#22477a] text-white border-[var(--cr-arcade-gold)]'
                      : 'bg-[#081426] border-transparent text-white/60 hover:text-white'
                  }`}>
                  {finished && ltour.phase !== 'drawn' && <CrCheck size={14} />}
                  {r.label}
                  {isNow && <span className="cr-tab-dot" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
          {shown && (
            // key: beim Rundenwechsel werden die Karten neu ausgeteilt
            <div key={shown.wave} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {shown.list.map((m, i) => (
                <VsCard key={m.id} m={m} ltour={ltour} byId={byId} canControl={canControl} inGame={inGame}
                  isCurrentRound={shown.wave === currentWave && ltour.phase === 'running'}
                  actions={actions} lt={lt} tt={tt} onDecks={setDecksId}
                  style={{ animationDelay: `${(i * 0.08).toFixed(2)}s` }} />
              ))}
            </div>
          )}
        </Section>
      </div>

      {/* ── Tabelle bzw. Turnierbaum ── */}
      {ltour.settings.format === 'roundrobin' ? (
        <StandingsTable ltour={ltour} byId={byId} lt={lt} />
      ) : (
        <BracketPanel structure={{ matches: ltour.matches }} byId={byId} me={null}
          canOpen={() => false} onOpen={() => {}} t={tt} />
      )}

      {decksMatch && <DecksDialog m={decksMatch} ltour={ltour} byId={byId} lt={lt} tt={tt} onClose={() => setDecksId(null)} />}
    </div>
  );
}
