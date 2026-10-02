// Auslosung als Show (Turnierstart): Namen werden reihum in ihre Gruppen "ausgeteilt" — in derselben
// Reihenfolge, in der der Server sie verteilt hat (Auslosungsreihenfolge, Gruppen reihum) — bzw. ohne
// Gruppenphase die Paarungen der ersten Runde nacheinander aufgedeckt. Öffnet sich automatisch, wenn man
// den Start live miterlebt, und lässt sich in der Übersicht erneut ansehen (z.B. für den Stream).
import React, { useEffect, useState } from 'react';
import ChunkyButton from '../ui/ChunkyButton';
import { CrRandom, CrBattle, CrClose } from '../ui/CrIcons';
import { playSound } from '../ui/sound';

const TOTAL_MS = 4200; // ungefähre Gesamtdauer, unabhängig von der Spielerzahl

/** Einträge in Austeil-Reihenfolge, jeweils mit Verzögerung. */
function buildPlan(structure) {
  const groups = structure.groups || [];
  if (groups.length) {
    const members = groups.map(g => g.standings.map(r => r.id));
    const order = [];
    const max = Math.max(...members.map(m => m.length));
    for (let i = 0; i < max; i++) members.forEach((m, g) => { if (m[i]) order.push({ g, i, id: m[i] }); });
    const step = Math.max(35, Math.min(160, TOTAL_MS / Math.max(1, order.length)));
    return { kind: 'groups', members, delayOf: new Map(order.map((o, k) => [o.id, k * step])), total: order.length * step };
  }
  const first = structure.matches.filter(m => m.stage === 'upper' && m.round === 1).sort((a, b) => a.slot - b.slot);
  const step = Math.max(60, Math.min(260, TOTAL_MS / Math.max(1, first.length)));
  return { kind: 'pairs', pairs: first, step, total: first.length * step };
}

export default function DrawReveal({ structure, byId, t, onClose }) {
  // Einmal beim Öffnen festhalten — spätere Live-Aktualisierungen der Seite starten die Show nicht neu
  const [plan] = useState(() => buildPlan(structure));

  const [done, setDone] = useState(false);
  useEffect(() => {
    // Ein paar Ticks während des Austeilens (gedeckelt), am Ende der Startton
    const ticks = Math.min(24, Math.round(plan.total / 140));
    const timers = Array.from({ length: ticks }, (_, i) => setTimeout(() => playSound('tap'), (plan.total / Math.max(1, ticks)) * i));
    timers.push(setTimeout(() => { setDone(true); playSound('start'); }, plan.total + 350));
    return () => timers.forEach(clearTimeout);
  }, [plan]);

  const name = (id) => byId.get(id)?.displayName || '—';

  return (
    <div className="cr-stage fixed inset-0 z-[60] flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 md:p-6"
      role="dialog" aria-label={t.drawTitle}>
      <div className="cr-arcade-panel w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="cr-section !py-3.5 flex items-center justify-between gap-3 shrink-0">
          <h2 className="cr-section-title text-xl"><CrRandom size={28} />{t.drawTitle}</h2>
          <button onClick={onClose} aria-label="Close" className="cr-arcade-icon-btn cr-arcade-icon-btn--red w-9 h-9 shrink-0">
            <CrClose size={16} />
          </button>
        </div>
        <div className="cr-section--rule overflow-y-auto custom-scrollbar p-4 md:p-5">
          {plan.kind === 'groups' ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {plan.members.map((ids, g) => (
                <div key={g} className="cr-row p-3">
                  <p className="font-cr text-[var(--cr-arcade-gold)] mb-2">{t.groupName(g)}</p>
                  <div className="flex flex-col gap-1.5">
                    {ids.map(id => (
                      <div key={id} className="cr-deal-in rounded-lg bg-white/[0.06] border border-white/10 px-2.5 py-1.5 font-cr text-white text-sm truncate"
                        style={{ animationDelay: `${plan.delayOf.get(id)}ms` }}>
                        {name(id)}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-2.5">
              <p className="cr-eyebrow sm:col-span-2">{t.drawFirstRound}</p>
              {plan.pairs.map((m, i) => (
                <div key={m.id} className="cr-deal-in cr-row px-3 py-2 flex items-center gap-2" style={{ animationDelay: `${i * plan.step}ms` }}>
                  <span className={`flex-1 truncate text-right font-cr ${m.aBye ? 'text-white/35 italic' : 'text-white'}`}>{m.aBye ? t.bye : name(m.a)}</span>
                  <span className="text-white/40 text-xs font-cr px-1">{t.vs}</span>
                  <span className={`flex-1 truncate font-cr ${m.bBye ? 'text-white/35 italic' : 'text-white'}`}>{m.bBye ? t.bye : name(m.b)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="cr-section--rule shrink-0 px-5 py-3.5 flex justify-center">
          <ChunkyButton variant="green" size="lg" icon={CrBattle} iconSize={26} onClick={onClose}
            className={done ? 'cr-win-pop' : ''}>
            {t.drawDone}
          </ChunkyButton>
        </div>
      </div>
    </div>
  );
}
