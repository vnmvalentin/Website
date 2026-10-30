// StatsDuel.jsx — /clash/stats-duell: Höher oder tiefer mit echten Kampfwerten (Level 11, data/cardStats.json).
// Jede Runde wird ein anderer Wert verglichen: Leben, Schaden, Schaden pro Sekunde, Angriffstempo, Laufgeschwindigkeit,
// Reichweite oder Anzahl. Links steht der Wert offen, rechts verdeckt. Gleich zählt als richtig. Ein Fehler beendet
// die Serie. Mit wachsender Serie liegen die beiden Werte immer näher beieinander.
// Unter jeder Karte steht, wozu der Wert gehört, wo das nicht offensichtlich ist (cardStats → of, z. B. beim Busch:
// Leben = Busch, Schaden = Busch-Kobolde), und wann die Karte zuletzt per Balance-Update geändert wurde.
import React, { useEffect, useState } from 'react';
import GameFrame from './GameFrame';
import CardFace from '../ui/CardFace';
import ChunkyButton from '../ui/ChunkyButton';
import { CrReplay, CrUpgrade, CrDowngrade, CrStar } from '../ui/CrIcons';
import { POOL, STATS, STATS_FETCHED_ISO, DUEL_STATS, fmtDate, readStore, writeStore } from './quizData';
import { useClashLang, pick } from './clashI18n';
import { playSound } from '../ui/sound';
import swordImg from '../../../assets/clashRoyale/ui/sword.webp';

const STORE = 'crq_stats_v1';
const REVEAL_MS = 1500;
const val = (id, key) => STATS[id]?.[key];

/**
 * Nächste Paarung zu einer festen linken Karte: zufälliger Wert, den die linke Karte hat, und eine rechte Karte,
 * die ihn auch hat und sich unterscheidet. Schwierigkeit: je länger die Serie, desto kleiner der Abstand.
 */
function nextRound(left, streak) {
  const stats = DUEL_STATS.filter((s) => val(left.id, s.key) != null);
  for (let attempt = 0; attempt < 60; attempt++) {
    const s = stats[Math.floor(Math.random() * stats.length)];
    const a = val(left.id, s.key);
    const cands = POOL.filter((c) => c.id !== left.id && val(c.id, s.key) != null && val(c.id, s.key) !== a);
    if (!cands.length) continue;
    // Abstand relativ zum größeren Wert: anfangs bis 100 %, ab Serie 10 höchstens ~25 %
    const maxGap = Math.max(0.25, 1 - streak * 0.075);
    const close = cands.filter((c) => { const b = val(c.id, s.key); return Math.abs(a - b) / Math.max(a, b) <= maxGap; });
    const list = close.length ? close : cands;
    return { stat: s, right: list[Math.floor(Math.random() * list.length)] };
  }
  return null;
}

function firstLeft() {
  const list = POOL.filter((c) => DUEL_STATS.filter((s) => val(c.id, s.key) != null).length >= 3);
  return list[Math.floor(Math.random() * list.length)];
}

function Side({ card, stat, hidden, state, lang, t }) {
  const value = val(card.id, stat.key);
  const of = STATS[card.id]?.of?.[stat.key];
  const changed = STATS[card.id]?.changed;
  return (
    <div className={`crq-duel-card${state ? ` is-${state}` : ''}`}>
      <div className="crq-duel-face"><CardFace id={card.id} rarity={card.rarity} /></div>
      <p className="font-cr text-lg text-center leading-tight mt-2 truncate max-w-full">{card.name}</p>
      <div className="crq-duel-cost crq-duel-cost--stat">
        <span className="crq-duel-statname">{pick(stat.short, lang)}</span>
        <span>{hidden ? '?' : stat.format(value, lang)}</span>
      </div>
      {of && <p className="crq-duel-of">{t.valueOf}: <b>{pick(of, lang)}</b></p>}
      {changed && <p className="crq-duel-changed">{t.lastChange(fmtDate(changed, lang))}</p>}
    </div>
  );
}

export default function StatsDuel() {
  const { lang, t } = useClashLang();
  const [left, setLeft] = useState(() => firstLeft());
  const [round, setRound] = useState(null);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(() => readStore(STORE, { best: 0 }).best || 0);
  const [reveal, setReveal] = useState(null); // null | 'right' | 'wrong'

  useEffect(() => { if (!round) setRound(nextRound(left, streak)); }, [round, left, streak]);

  const answer = (more) => {
    if (!round || reveal) return;
    const { stat, right } = round;
    const a = val(left.id, stat.key), b = val(right.id, stat.key);
    // „mehr/schneller“: beim Angriffstempo ist die kleinere Zahl die schnellere
    const bigger = stat.invert ? b < a : b > a;
    const ok = a === b || (more ? bigger : !bigger);
    setReveal(ok ? 'right' : 'wrong');
    playSound(ok ? 'pick' : 'error');
    if (!ok) return;
    const s = streak + 1;
    setStreak(s);
    if (s > best) { setBest(s); writeStore(STORE, { best: s }); }
    setTimeout(() => { setLeft(right); setRound(nextRound(right, s)); setReveal(null); }, REVEAL_MS);
  };

  const restart = () => {
    const l = firstLeft();
    setLeft(l);
    setStreak(0);
    setRound(nextRound(l, 0));
    setReveal(null);
  };

  const stat = round?.stat;
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const question = round && t.duelQuestion(
    <b key="r" className="text-white">{round.right.name}</b>,
    <b key="s" className="text-white">{pick(stat.label, lang)}</b>,
    pick(stat.more, lang), pick(stat.less, lang),
    <b key="l" className="text-white">{left.name}</b>,
  );

  return (
    <GameFrame title={t.statsTitle} icon={swordImg}
      seo={{ title: lang === 'en' ? 'Clash Royale Stats Duel' : 'Clash Royale Stats-Duell', description: t.statsSeo, path: '/clash/stats-duell' }}>
      <div className="flex justify-center gap-3 mb-4">
        <span className="crq-counter crq-counter--lg">{t.streak} <b>{streak}</b></span>
        <span className="crq-counter crq-counter--lg"><CrStar size={18} /> {t.best} <b>{best}</b></span>
      </div>

      <div className="cr-arcade-panel p-4 md:p-6">
        {round && (
          <>
            <p className="text-center mb-4"><span className="crq-stat-chip">{pick(stat.label, lang)}</span></p>
            <div className="grid grid-cols-2 gap-4 md:gap-8 items-start">
              <Side card={left} stat={stat} lang={lang} t={t} />
              <Side key={`${round.right.id}-${stat.key}`} card={round.right} stat={stat} hidden={!reveal} state={reveal} lang={lang} t={t} />
            </div>
          </>
        )}

        <div className="mt-6 pt-5 border-t border-white/10 flex flex-col items-center gap-3">
          {reveal === 'wrong' ? (
            <>
              <p className="font-cr text-2xl text-center">{t.missed}</p>
              <p className="text-white/70 text-sm text-center">
                {round.right.name}: {stat.format(val(round.right.id, stat.key), lang)} · {left.name}: {stat.format(val(left.id, stat.key), lang)}
              </p>
              <p className="text-white/70 text-sm">{t.yourStreak(streak)}{streak > 0 && streak >= best ? t.newBest : ''}</p>
              <ChunkyButton variant="green" icon={CrReplay} onClick={restart}>{t.again}</ChunkyButton>
            </>
          ) : round && (
            <>
              <p className="text-white/80 text-center">{question}</p>
              <div className="flex flex-wrap justify-center gap-3">
                <ChunkyButton variant="green" size="lg" icon={CrUpgrade} iconSize={26} disabled={!!reveal} onClick={() => answer(true)}>{cap(pick(stat.more, lang))}</ChunkyButton>
                <ChunkyButton variant="red" size="lg" icon={CrDowngrade} iconSize={26} disabled={!!reveal} onClick={() => answer(false)}>{cap(pick(stat.less, lang))}</ChunkyButton>
              </div>
            </>
          )}
          <p className="text-white/40 text-[11px] text-center">{t.statsSource(fmtDate(STATS_FETCHED_ISO, lang))}</p>
        </div>
      </div>
    </GameFrame>
  );
}
