// Reiter "Veranstalter" (Phase 5): Turnier pausieren/fortsetzen/abbrechen, Übersicht über alles, was gerade
// Aufmerksamkeit braucht (Klärungsfälle zuerst, dann am längsten wartende Spiele), und die Teilnehmerliste mit
// Disqualifizieren. Daten: GET /:id → ownerOverview (Backend matchRoom.ownerOverview).
import React, { useState } from 'react';
import ChunkyButton from '../ui/ChunkyButton';
import Section from '../ui/Section';
import { RankBadge } from '../lobby/PlayerList';
import { CrSettings, CrCancel, CrClock, CrCheck, CrUserRemove, CrSocial, CrBattle, CrKingBlue } from '../ui/CrIcons';
import { tError } from './tI18n';
import { tournamentApi } from './tournamentApi';
import { matchLabel } from './matchLabels';

const PHASE_STYLE = {
  review: 'text-amber-200 border-amber-300/50 bg-amber-400/10',
  battle: 'text-sky-200 border-sky-300/40 bg-sky-400/10',
  drafting: 'text-violet-200 border-violet-300/40 bg-violet-400/10',
  banning: 'text-violet-200 border-violet-300/40 bg-violet-400/10',
  lobby: 'text-white/60 border-white/15 bg-white/5',
};

function Presence({ here }) {
  return here
    ? <CrCheck size={14} className="inline-block" />
    : <CrClock size={14} className="inline-block opacity-50" />;
}

export default function OwnerPanel({ tournament, overview = [], structure, participants, onOpenRoom, onChanged, t }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const byId = new Map(participants.map(p => [p.id, p]));
  const paused = !!tournament.settings.paused;
  const running = tournament.status === 'running';
  const now = Date.now();

  const run = async (fn) => {
    setBusy(true); setError('');
    try { await fn(); onChanged(); } catch (e) { setError(tError(t, e)); } finally { setBusy(false); }
  };

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] gap-4 items-start">
      <div className="cr-arcade-panel overflow-hidden">
        {/* ── Was gerade Aufmerksamkeit braucht ── */}
        <Section icon={CrClock} title={t.attentionTitle} aside={overview.length || null}>
          {overview.length === 0 ? (
            <p className="text-white/55 text-sm">{t.attentionEmpty}</p>
          ) : (
            <div className="flex flex-col gap-2">
              {overview.map(item => {
                const m = structure?.matches.find(x => x.id === item.matchId);
                const A = byId.get(item.a), B = byId.get(item.b);
                const minutes = item.since ? Math.max(0, Math.floor((now - item.since) / 60000)) : null;
                return (
                  <div key={item.matchId} className={`cr-row px-3.5 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 ${item.phase === 'review' ? 'cr-row--me' : ''}`}>
                    <div className="min-w-0 flex-1">
                      <p className="text-white/50 text-[11px]">
                        {m ? matchLabel(m, structure.matches, t) : item.matchId} · {t.bestOfShort(item.bestOf)}
                        {item.gameNo ? ` · ${t.gameN(item.gameNo)}` : ''}
                      </p>
                      <p className="font-cr text-white text-[15px] truncate">
                        {A?.displayName} <span className="text-white/45 font-sans text-sm mx-1">{item.scoreA}:{item.scoreB}</span> {B?.displayName}
                      </p>
                      <p className="text-white/45 text-[11px] flex items-center gap-1.5">
                        <Presence here={item.presentA} /> {A?.displayName}
                        <span className="mx-1">·</span>
                        <Presence here={item.presentB} /> {B?.displayName}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${PHASE_STYLE[item.phase]}`}>
                        {item.phase === 'review' && item.reviewReason ? t.reviewReason[item.reviewReason] : t.phaseLabel[item.phase]}
                      </span>
                      {minutes !== null && <span className="text-white/40 text-[11px]">{t.sinceMin(minutes)}</span>}
                    </div>
                    <ChunkyButton variant={item.phase === 'review' ? 'gold' : 'blue'} size="sm" icon={CrBattle}
                      onClick={() => onOpenRoom(item.matchId)}>
                      {t.openRoom}
                    </ChunkyButton>
                  </div>
                );
              })}
            </div>
          )}
        </Section>
      </div>

      <div className="space-y-4">
        {/* ── Steuerung ── */}
        <div className="cr-arcade-panel overflow-hidden">
          <Section icon={CrSettings} title={t.controlTitle}>
            {running ? (
              <div className="flex flex-wrap gap-2">
                <ChunkyButton variant={paused ? 'green' : 'gold'} size="sm" disabled={busy}
                  onClick={() => run(() => tournamentApi.pause(tournament.id, !paused))}>
                  {paused ? t.resume : t.pause}
                </ChunkyButton>
                <ChunkyButton variant="red" size="sm" icon={CrCancel} disabled={busy}
                  onClick={() => window.confirm(t.abortConfirm) && run(() => tournamentApi.cancel(tournament.id))}>
                  {t.abortTournament}
                </ChunkyButton>
              </div>
            ) : <p className="text-white/55 text-sm">{t[`status${tournament.status[0].toUpperCase()}${tournament.status.slice(1)}`] || tournament.status}</p>}
            {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
          </Section>
        </div>

        {/* ── Teilnehmer mit Disqualifizieren ── */}
        <div className="cr-arcade-panel overflow-hidden">
          <Section icon={CrSocial} title={t.participantsTitle} aside={participants.length}>
            <div className="flex flex-col gap-2">
              {participants.map(p => (
                <div key={p.id} className={`cr-row px-3 py-2 flex items-center gap-3 ${p.dropped ? 'opacity-55' : ''}`}>
                  <div className="min-w-0 flex-1">
                    <p className={`font-cr text-white text-[15px] truncate ${p.dropped ? 'line-through' : ''}`}>{p.displayName}</p>
                    <p className="text-white/45 text-[11px] flex items-center gap-1 truncate"><CrKingBlue size={12} />{p.crName} #{p.crTag}</p>
                  </div>
                  {p.dropped
                    ? <span className="text-red-300 text-[10px] font-bold uppercase tracking-wider">{t.droppedBadge}</span>
                    : <RankBadge p={p} />}
                  {running && !p.dropped && (
                    <button type="button" title={t.disqualify} aria-label={t.disqualify} disabled={busy}
                      onClick={() => window.confirm(t.disqualifyConfirm(p.displayName)) && run(() => tournamentApi.disqualify(tournament.id, p.id))}
                      className="cr-arcade-icon-btn cr-arcade-icon-btn--red w-[34px] h-[34px] shrink-0">
                      <CrUserRemove size={20} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
