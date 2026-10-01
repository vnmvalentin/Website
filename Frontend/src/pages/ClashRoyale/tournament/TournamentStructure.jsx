// Turnierseite nach dem Start: "Dein nächstes Match", Gruppen-Tabellen mit Spielplan und der
// Bracket-Baum (Upper/Lower/Grand Final). Daten kommen fertig berechnet vom Server
// (Backend/clashRoyale/tournament/lifecycle.js → structureView).
import React, { useMemo, useState } from 'react';
import ChunkyButton from '../ui/ChunkyButton';
import Modal from '../ui/Modal';
import Section from '../ui/Section';
import { SegmentedControl } from '../ui/SettingRow';
import { RankBadge } from '../lobby/PlayerList';
import { CrBattle, CrTourneyTrophy, CrCrown, CrKingBlue, CrClock, CrSocial, CrSwap } from '../ui/CrIcons';
import { tError } from './tI18n';
import { tournamentApi } from './tournamentApi';

const has = (m, pid) => !!pid && (m.a === pid || m.b === pid);
const sideOf = (m, pid) => (m.a === pid ? 'a' : 'b');

/** Bezeichnung eines Bracket-Matches (Runde/Finale), für Karten und Dialog. */
function matchLabel(m, matches, t) {
  if (m.stage === 'group') return `${t.groupName(m.group)} · ${t.roundN(m.round)}`;
  if (m.stage === 'grand') return m.round === 1 ? t.grandFinal : t.bracketReset;
  const sameStage = matches.filter(x => x.stage === m.stage);
  const last = Math.max(...sameStage.map(x => x.round));
  const double = matches.some(x => x.stage === 'lower' || x.stage === 'grand');
  if (m.stage === 'lower') return m.round === last ? t.lowerFinal : t.lowerRound(m.round);
  if (double) return m.round === last ? t.upperFinal : t.roundN(m.round);
  if (m.round === last) return t.final;
  if (m.round === last - 1) return t.semiFinal;
  if (m.round === last - 2) return t.quarterFinal;
  return t.roundN(m.round);
}

// ── Nächstes Match / Sieger ─────────────────────────────────────────────

function NextMatchCard({ structure, me, byId, t }) {
  const { matches, phase, champion } = structure;
  if (phase === 'finished') {
    const p = byId.get(champion);
    return (
      <div className="cr-arcade-panel cr-win-pop p-5 flex items-center gap-4">
        <CrTourneyTrophy size={72} className="shrink-0" />
        <div className="min-w-0">
          <p className="cr-eyebrow">{t.champion}</p>
          <p className="cr-arcade-title font-arcade text-3xl md:text-4xl truncate">{p?.displayName || '—'}</p>
          {me && me.id === champion && <p className="text-[var(--cr-arcade-gold)] font-cr mt-1">{t.youWon}</p>}
        </div>
      </div>
    );
  }
  if (!me) return null;

  const mine = matches.filter(m => has(m, me.id));
  const playable = mine.filter(m => m.playable);
  const waiting = mine.find(m => m.status === 'pending' && !m.playable);
  let body;
  if (playable.length) {
    const m = playable[0];
    const opp = byId.get(sideOf(m, me.id) === 'a' ? m.b : m.a);
    body = (
      <>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="min-w-0 flex-1">
            <p className="text-white/55 text-xs">
              {matchLabel(m, matches, t)} · {t.bestOfShort(m.bestOf)}
              {playable.length > 1 && <> · {t.openGroupMatches(playable.length)}</>}
            </p>
            <p className="font-cr text-white text-xl flex items-center gap-2 mt-0.5 min-w-0">
              <span className="text-white/50 text-base">{t.vs}</span>
              <span className="truncate">{opp?.displayName}</span>
              {opp && <RankBadge p={opp} />}
            </p>
            {opp && <p className="text-white/45 text-xs flex items-center gap-1"><CrKingBlue size={12} />{opp.crName} #{opp.crTag}</p>}
          </div>
          {/* Match-Räume kommen in Phase 3 — der Knopf steht schon an seinem Platz */}
          <ChunkyButton variant="green" size="lg" icon={CrBattle} iconSize={26} disabled title={t.roomComingSoon}>
            {t.joinRoom}
          </ChunkyButton>
        </div>
        <p className="text-white/45 text-xs mt-3">{t.roomComingSoon}</p>
      </>
    );
  } else if (waiting) {
    body = <p className="text-white/70 flex items-center gap-2"><CrClock size={20} />{t.waitingForOpponent} · {matchLabel(waiting, matches, t)}</p>;
  } else if (phase === 'groups') {
    body = <p className="text-white/70">{t.groupsDoneWaiting}</p>;
  } else {
    body = <p className="text-white/70">{t.eliminated}</p>;
  }
  return (
    <div className="cr-arcade-panel overflow-hidden">
      <Section icon={CrBattle} title={t.nextMatch}>{body}</Section>
    </div>
  );
}

// ── Gruppen ─────────────────────────────────────────────────────────────

function GroupTable({ group, matches, byId, me, canEdit, onEdit, t }) {
  const groupMatches = matches.filter(m => m.stage === 'group' && m.group === group.index);
  return (
    <div className="cr-row p-0 overflow-hidden">
      <p className="font-cr text-white text-lg px-3.5 pt-3 pb-2">{t.groupName(group.index)}</p>
      <table className="w-full text-sm tabular-nums whitespace-nowrap">
        <thead>
          <tr className="text-white/45 text-[11px] uppercase tracking-wider">
            <th className="text-left font-semibold pl-3.5 pr-2 py-1 w-8">#</th>
            <th className="text-left font-semibold py-1">{t.colPlayer}</th>
            <th className="text-right font-semibold py-1 px-2">{t.colWL}</th>
            <th className="text-right font-semibold py-1 px-2">{t.colGames}</th>
            <th className="text-right font-semibold py-1 pl-2 pr-3.5 hidden sm:table-cell">{t.colCrowns}</th>
          </tr>
        </thead>
        <tbody>
          {group.standings.map(r => {
            const p = byId.get(r.id);
            const isMe = me?.id === r.id;
            return (
              <tr key={r.id} className={`border-t border-[rgba(2,8,20,0.55)] ${r.advancing ? 'bg-emerald-400/[0.07]' : ''}`}>
                <td className={`pl-3.5 pr-2 py-1.5 font-cr ${r.advancing ? 'text-emerald-300' : 'text-white/45'}`}>{r.place}</td>
                <td className={`py-1.5 truncate max-w-0 w-full pr-2 ${isMe ? 'text-[var(--cr-arcade-gold)] font-semibold' : 'text-white'}`}>{p?.displayName || '—'}</td>
                <td className="text-right px-2 text-white/80">{r.wins}–{r.losses}</td>
                <td className="text-right px-2 text-white/60">{r.gameDiff > 0 ? '+' : ''}{r.gameDiff}</td>
                <td className="text-right pl-2 pr-3.5 text-white/60 hidden sm:table-cell">{r.crownDiff > 0 ? '+' : ''}{r.crownDiff}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="border-t border-[rgba(2,8,20,0.55)] px-3.5 py-2.5">
        <p className="cr-eyebrow mb-1.5">{t.schedule}</p>
        <div className="flex flex-col gap-1">
          {groupMatches.map(m => {
            const clickable = canEdit && m.playable;
            const A = byId.get(m.a), B = byId.get(m.b);
            const done = m.status === 'done';
            const row = (
              <>
                <span className={`flex-1 truncate text-right ${done && m.winner === 'a' ? 'text-white font-semibold' : 'text-white/60'}`}>{A?.displayName}</span>
                <span className={`font-cr w-12 text-center shrink-0 ${done ? 'text-[var(--cr-arcade-gold)]' : 'text-white/30'}`}>
                  {done ? `${m.scoreA}:${m.scoreB}` : t.vs}
                </span>
                <span className={`flex-1 truncate ${done && m.winner === 'b' ? 'text-white font-semibold' : 'text-white/60'}`}>{B?.displayName}</span>
              </>
            );
            const cls = `flex items-center gap-2 text-xs rounded-md px-1.5 py-1 ${has(m, me?.id) ? 'bg-amber-300/[0.07]' : ''}`;
            return clickable
              ? <button key={m.id} type="button" onClick={() => onEdit(m)} className={`${cls} w-full hover:bg-white/[0.08] ring-1 ring-inset ring-white/10 text-left`}>{row}</button>
              : <div key={m.id} className={cls}>{row}</div>;
          })}
        </div>
      </div>
    </div>
  );
}

// ── Bracket ─────────────────────────────────────────────────────────────

function MatchBox({ m, matches, byId, me, canEdit, onEdit, t }) {
  const clickable = canEdit && m.playable;
  const skipped = m.status === 'skipped';
  const line = (side) => {
    const pid = side === 'a' ? m.a : m.b;
    const isBye = side === 'a' ? m.aBye : m.bBye;
    const p = byId.get(pid);
    const won = m.winner === side && (m.status === 'done' || m.status === 'bye');
    const lost = m.status === 'done' && m.winner && m.winner !== side;
    return (
      <div className={`flex items-center gap-2 px-2.5 h-8 ${side === 'b' ? 'border-t border-[rgba(2,8,20,0.55)]' : ''}`}>
        <span className={`flex-1 min-w-0 truncate text-[13px] ${
          isBye ? 'text-white/30 italic' : !p ? 'text-white/30' : lost ? 'text-white/40' : won ? 'text-white font-semibold' : 'text-white/85'
        } ${p && me?.id === pid ? '!text-[var(--cr-arcade-gold)]' : ''}`}>
          {isBye ? t.bye : p ? p.displayName : t.tbd}
        </span>
        {m.status === 'done' && (
          <span className={`font-cr text-sm tabular-nums ${won ? 'text-[var(--cr-arcade-gold)]' : 'text-white/40'}`}>
            {side === 'a' ? m.scoreA : m.scoreB}
          </span>
        )}
      </div>
    );
  };
  const box = (
    <div className={`cr-row w-52 overflow-hidden ${has(m, me?.id) && m.status === 'pending' ? 'cr-row--me' : ''} ${skipped || m.status === 'bye' ? 'opacity-50' : ''}`}>
      <div className="flex items-center justify-between px-2.5 pt-1 text-[10px] uppercase tracking-wider text-white/40">
        <span>{skipped ? t.notNeeded : matchLabel(m, matches, t)}</span>
        <span>{t.bestOfShort(m.bestOf)}</span>
      </div>
      {line('a')}
      {line('b')}
    </div>
  );
  return clickable
    ? <button type="button" onClick={() => onEdit(m)} className="block text-left rounded-xl hover:ring-2 hover:ring-[var(--cr-arcade-gold)]">{box}</button>
    : box;
}

/** Eine Bracket-Hälfte: Spalten je Runde, Matches vertikal verteilt (spätere Runden mittig). */
function BracketPart({ title, list, ...rest }) {
  const rounds = [...new Set(list.map(m => m.round))].sort((x, y) => x - y);
  if (!rounds.length) return null;
  const maxCount = Math.max(...rounds.map(r => list.filter(m => m.round === r).length));
  return (
    <div>
      <p className="cr-eyebrow mb-2">{title}</p>
      <div className="overflow-x-auto custom-scrollbar pb-2">
        <div className="flex gap-6 w-max" style={{ minHeight: maxCount * 92 }}>
          {rounds.map(r => (
            <div key={r} className="flex flex-col justify-around gap-3">
              {list.filter(m => m.round === r).map(m => <MatchBox key={m.id} m={m} {...rest} />)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Ergebnis-Dialog (Veranstalter) ──────────────────────────────────────

function ResultModal({ tournamentId, match, matches, byId, onClose, onSaved, t }) {
  const need = Math.ceil(match.bestOf / 2);
  const [winner, setWinner] = useState('a');
  const [loserScore, setLoserScore] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const A = byId.get(match.a), B = byId.get(match.b);

  const save = async () => {
    setBusy(true); setError('');
    try {
      await tournamentApi.setResult(tournamentId, match.id, {
        winner, scoreA: winner === 'a' ? need : loserScore, scoreB: winner === 'b' ? need : loserScore,
      });
      onSaved();
    } catch (e) {
      setError(tError(t, e));
      setBusy(false);
    }
  };

  return (
    <Modal size="sm" title={`${t.setResult} · ${matchLabel(match, matches, t)}`} icon={<CrSwap size={22} />} onClose={onClose}
      footer={
        <div className="space-y-2">
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <ChunkyButton variant="green" block disabled={busy} onClick={save}>{t.saveResult}</ChunkyButton>
        </div>
      }>
      <div className="cr-section space-y-2">
        <p className="cr-eyebrow">{t.winnerLabel}</p>
        <SegmentedControl value={winner} onChange={setWinner}
          options={[{ id: 'a', label: A?.displayName || 'A' }, { id: 'b', label: B?.displayName || 'B' }]} />
      </div>
      {need > 1 && (
        <div className="cr-section space-y-2">
          <p className="cr-eyebrow">{t.seriesScore} ({t.bestOfShort(match.bestOf)})</p>
          <SegmentedControl value={loserScore} onChange={setLoserScore}
            options={Array.from({ length: need }, (_, l) => ({ id: l, label: winner === 'a' ? `${need}:${l}` : `${l}:${need}` }))} />
        </div>
      )}
    </Modal>
  );
}

// ── Gesamtansicht ───────────────────────────────────────────────────────

export default function TournamentStructure({ tournament, structure, participants, me, isOwner, onChanged, t }) {
  const [editing, setEditing] = useState(null);
  const byId = useMemo(() => new Map(participants.map(p => [p.id, p])), [participants]);
  const { matches, groups } = structure;
  const canEdit = isOwner && tournament.status === 'running';
  const shared = { matches, byId, me, canEdit, onEdit: setEditing, t };

  const upper = matches.filter(m => m.stage === 'upper');
  const lower = matches.filter(m => m.stage === 'lower');
  const grand = matches.filter(m => m.stage === 'grand');

  return (
    <div className="space-y-4">
      <NextMatchCard structure={structure} me={me} byId={byId} t={t} />

      {canEdit && <p className="text-white/50 text-xs flex items-center gap-1.5"><CrCrown size={16} />{t.ownerResultHint}</p>}

      {groups.length > 0 && (
        <div className="cr-arcade-panel overflow-hidden">
          <Section icon={CrSocial} title={t.groups} aside={t.advancesNote}>
            <div className="grid md:grid-cols-2 gap-3">
              {groups.map(g => <GroupTable key={g.index} group={g} {...shared} />)}
            </div>
          </Section>
        </div>
      )}

      {upper.length > 0 && (
        <div className="cr-arcade-panel overflow-hidden">
          <Section icon={CrTourneyTrophy} title={t.bracket}>
            <div className="space-y-5">
              <BracketPart title={lower.length ? t.upperBracket : t.koBracket} list={upper} {...shared} />
              <BracketPart title={t.lowerBracket} list={lower} {...shared} />
              <BracketPart title={t.grandFinal} list={grand} {...shared} />
            </div>
          </Section>
        </div>
      )}

      {editing && (
        <ResultModal tournamentId={tournament.id} match={editing} matches={matches} byId={byId} t={t}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); onChanged(); }} />
      )}
    </div>
  );
}
