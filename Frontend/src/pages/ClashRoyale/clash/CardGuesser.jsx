// CardGuesser.jsx — /clash/kartenraten: Vor dir liegen 24 Karten. Pro Runde erscheint links ein Hinweis zur
// gesuchten Karte; du klappst selbst die Karten um, die es nicht mehr sein können. Sobald du sicher bist: tippen.
// Ein Tipp — richtig gewinnt, falsch verliert. Je weniger Hinweise du brauchst, desto mehr Kronen.
// Hinweise kommen aus quizData.hintPlan (gespeichert als Aussage + wahr/falsch, Text je nach Sprache).
import React, { useMemo, useState } from 'react';
import GameFrame from './GameFrame';
import FlipCard from './FlipCard';
import ChunkyButton from '../ui/ChunkyButton';
import { CrCrown, CrReplay, CrTarget } from '../ui/CrIcons';
import { POOL, FACT_BY_ID, hintPlan, shuffled, seeded, berlinDay, readStore, writeStore } from './quizData';
import { useClashLang, pick } from './clashI18n';
import { playSound } from '../ui/sound';
import questionImg from '../../../assets/clashRoyale/ui/question.webp';

const BOARD = 24;
const HINTS = 6;
const STORE = 'crq_guess_v3';

/** Pool + gesuchte Karte + Hinweise; so lange neu würfeln, bis die Hinweise die Karte eindeutig machen */
function deal(seedText) {
  const rand = seedText ? seeded(seedText) : Math.random;
  for (let attempt = 0; attempt < 40; attempt++) {
    const board = shuffled(POOL, rand).slice(0, BOARD);
    const secret = board[Math.floor(rand() * board.length)];
    const { plan, unresolved } = hintPlan(secret, board, HINTS, rand);
    if (unresolved === 0 && plan.length === HINTS) {
      return { board: board.map((c) => c.id), secret: secret.id, hints: plan.map((p) => ({ id: p.fact.id, truth: p.truth })) };
    }
  }
  return null;
}

function newGame(mode) {
  const day = berlinDay();
  const d = deal(mode === 'daily' ? `guess3|${day}` : null) || deal(null);
  return { mode, day, ...d, shown: 1, crossed: [], over: false, won: false, guess: null };
}

const crownsFor = (shown, won) => (!won ? 0 : shown <= 3 ? 3 : shown <= 5 ? 2 : 1);
const byId = Object.fromEntries(POOL.map((c) => [c.id, c]));

export default function CardGuesser() {
  const { lang, t } = useClashLang();
  const [game, setGame] = useState(() => {
    const saved = readStore(STORE, {}).daily;
    return saved && saved.day === berlinDay() ? saved : newGame('daily');
  });
  const [guessing, setGuessing] = useState(false);
  const [picked, setPicked] = useState(null);

  // Immer auf dem neuesten Stand aufbauen (schnelle Klicks hintereinander gingen sonst verloren)
  const save = (update) => {
    setGame((prev) => {
      const g = typeof update === 'function' ? update(prev) : update;
      if (g.mode === 'daily') writeStore(STORE, { daily: g });
      return g;
    });
  };
  const crossed = useMemo(() => new Set(game.crossed), [game.crossed]);
  const hintText = (h) => { const f = FACT_BY_ID[h.id]; return f ? pick(h.truth ? f.yes : f.no, lang) : ''; };

  const onCard = (id) => {
    if (game.over) return;
    if (guessing) { setPicked(id === picked ? null : id); return; }
    save((g) => {
      const next = new Set(g.crossed);
      if (next.has(id)) next.delete(id); else next.add(id);
      return { ...g, crossed: [...next] };
    });
  };

  const nextHint = () => {
    if (game.over || game.shown >= game.hints.length) return;
    playSound('open');
    save((g) => ({ ...g, shown: Math.min(g.hints.length, g.shown + 1) }));
  };

  const confirmGuess = () => {
    if (!picked) return;
    const won = picked === game.secret;
    playSound(won ? 'win' : 'error');
    save((g) => ({ ...g, over: true, won, guess: picked }));
    setGuessing(false);
    setPicked(null);
  };

  const restart = (mode) => {
    setGuessing(false);
    setPicked(null);
    const saved = readStore(STORE, {}).daily;
    setGame(mode === 'daily' ? (saved?.day === berlinDay() ? saved : newGame('daily')) : newGame('free'));
  };
  const crowns = crownsFor(game.shown, game.won);
  const secret = byId[game.secret];

  return (
    <GameFrame wide title={t.guessTitle} icon={questionImg}
      seo={{ title: lang === 'en' ? 'Clash Royale Card Guess' : 'Clash Royale Kartenraten', description: t.guessSeo, path: '/clash/kartenraten' }}>
      <div className="flex justify-center mb-4">
        <div className="cr-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={game.mode === 'daily'} onClick={() => restart('daily')}>{t.daily}</button>
          <button type="button" role="tab" aria-selected={game.mode === 'free'} onClick={() => restart('free')}>{t.free}</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[20rem_minmax(0,1fr)] gap-4 lg:gap-5 items-start">
        <aside className="cr-arcade-panel p-4 flex flex-col gap-3 lg:sticky lg:top-3">
          <div className="flex items-center justify-between">
            <span className="font-cr text-lg">{t.hints}</span>
            <span className="crq-counter">{game.shown} / {game.hints.length}</span>
          </div>
          <ol className="flex flex-col gap-1.5">
            {game.hints.slice(0, game.shown).map((h, i) => (
              <li key={i} className={`crq-hint${i === game.shown - 1 && !game.over ? ' is-new' : ''}`}>
                <b className="font-cr font-normal text-[var(--cr-arcade-gold)] mr-1.5">{i + 1}.</b>{hintText(h)}
              </li>
            ))}
          </ol>
          {!game.over && (
            <div className="flex flex-col gap-2 pt-1">
              <ChunkyButton variant="blue" block onClick={nextHint} disabled={game.shown >= game.hints.length || guessing}>
                {game.shown >= game.hints.length ? t.noMoreHints : t.nextHint}
              </ChunkyButton>
              {!guessing
                ? <ChunkyButton variant="gold" block icon={CrTarget} onClick={() => setGuessing(true)}>{t.guess}</ChunkyButton>
                : (
                  <>
                    <ChunkyButton variant="green" block disabled={!picked} onClick={confirmGuess}>
                      {picked ? t.sure(byId[picked]?.name) : t.tapCard}
                    </ChunkyButton>
                    <button type="button" className="text-sm text-white/60 hover:text-white" onClick={() => { setGuessing(false); setPicked(null); }}>{t.cancel}</button>
                  </>
                )}
              <p className="text-xs text-white/50 leading-relaxed">{t.guessHelp}</p>
            </div>
          )}
          {game.over && (
            <div className="pt-2 border-t border-white/10 flex flex-col gap-2">
              <p className="font-cr text-2xl">{game.won ? t.correct : t.wrong}</p>
              <p className="text-sm text-white/75">{t.wasSecret(secret?.name)}{game.won ? t.foundAfter(game.shown) : '.'}</p>
              <div className="flex items-center gap-1" aria-label={t.crowns(crowns)}>
                {[0, 1, 2].map((i) => <CrCrown key={i} size={30} className={i < crowns ? '' : 'opacity-25 grayscale'} />)}
              </div>
              <ChunkyButton variant="green" size="sm" icon={CrReplay} onClick={() => restart('free')} className="self-start">{t.newRound}</ChunkyButton>
              {game.mode === 'daily' && <p className="text-xs text-white/50">{t.nextDaily}</p>}
            </div>
          )}
        </aside>

        <section className="cr-arcade-panel p-3 md:p-4">
          <div className="flex items-center gap-3 mb-3">
            <span className="crq-counter">{t.cardsOpen(game.board.length - crossed.size)}</span>
            {guessing && <span className="text-sm text-[var(--cr-arcade-gold)] font-semibold">{t.guessMode}</span>}
          </div>
          <div className={`crf-grid${guessing ? ' is-guessing' : ''}`} style={{ '--crf-cols': 6 }}>
            {game.board.map((id) => {
              const card = byId[id];
              const state = game.over
                ? (id === game.secret ? 'secret' : id === game.guess ? 'wrong' : '')
                : picked === id ? 'picked' : '';
              return <FlipCard key={id} card={card} flipped={crossed.has(id) && !(game.over && id === game.secret)} state={state} onClick={() => onCard(id)} disabled={game.over} />;
            })}
          </div>
        </section>
      </div>
    </GameFrame>
  );
}
