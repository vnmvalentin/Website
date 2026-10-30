// ImageGuess.jsx — Kartenbild erraten, zwei Modi (eigene Adressen, gleicher Ablauf):
//   /clash/zoom   winziger, stark vergrößerter Ausschnitt des Artworks (zufällige Stelle)
//   /clash/pixel  das ganze Artwork, extrem grob verpixelt
// Man tippt den Kartennamen (Vorschläge beim Tippen). Alle zwei Fehlversuche wird das Bild eine Stufe deutlicher
// (6 Stufen, also höchstens 12 Versuche); „Überspringen“ zählt als Versuch. Kronen je nach Stufe beim Treffer.
// Gezeichnet wird in ein <canvas>: Das CDN liefert keinen CORS-Header, das Canvas ist danach „tainted“ — für die
// Anzeige egal, es werden keine Pixel ausgelesen. Tagesrunde per Datum-Seed (gleich für alle) oder freies Spiel.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import GameFrame from './GameFrame';
import CardFace from '../ui/CardFace';
import ChunkyButton from '../ui/ChunkyButton';
import { CrCrown, CrReplay, CrSearch, CrClose } from '../ui/CrIcons';
import { ALL_CARDS } from '../data/cards';
import { STAGES, VIEW_W, VIEW_H, useCardImage, drawCardStage } from './cardStage';
import { seeded, berlinDay, readStore, writeStore } from './quizData';
import { useClashLang } from './clashI18n';
import { playSound } from '../ui/sound';
import searchImg from '../../../assets/clashRoyale/ui/search.webp';
import eyeImg from '../../../assets/clashRoyale/ui/eye.webp';

const PER_STAGE = 2;
const MAX_TRIES = STAGES * PER_STAGE;

const MODES = {
  zoom: { store: 'crq_zoom_v1', salt: 'zoom', icon: searchImg },
  pixel: { store: 'crq_pixel_v1', salt: 'pixel', icon: eyeImg },
};

function newGame(mode, daily) {
  const day = berlinDay();
  const rand = daily ? seeded(`${MODES[mode].salt}|${day}`) : Math.random;
  const card = ALL_CARDS[Math.floor(rand() * ALL_CARDS.length)];
  // Zoom-Mittelpunkt als Anteil 0..1 im Artwork — das Fenster der kleinsten Stufe bleibt immer im Artwork
  return { mode, daily, day, cardId: card.id, fx: 0.2 + rand() * 0.6, fy: 0.2 + rand() * 0.6, wrong: [], skips: 0, over: false, won: false };
}

const stageOf = (g) => Math.min(STAGES - 1, Math.floor((g.wrong.length + g.skips) / PER_STAGE));
const crownsFor = (stage, won) => (!won ? 0 : stage <= 1 ? 3 : stage <= 3 ? 2 : 1);

function search(query, exclude) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return ALL_CARDS
    .filter((c) => !exclude.has(c.id) && c.name.toLowerCase().includes(q))
    .sort((a, b) => Number(!a.name.toLowerCase().startsWith(q)) - Number(!b.name.toLowerCase().startsWith(q)) || a.name.localeCompare(b.name))
    .slice(0, 8);
}

/** Zeichnet die aktuelle Stufe ins Canvas (gemeinsame Zeichenfunktion: cardStage.js) */
function useStageCanvas(canvasRef, game, stage) {
  const img = useCardImage(game.cardId);
  useEffect(() => {
    drawCardStage(canvasRef.current, img, { mode: game.mode, stage, fx: game.fx, fy: game.fy, reveal: game.over });
  }, [img, stage, game.over, game.mode, game.fx, game.fy, canvasRef]);
  return !!img;
}

export default function ImageGuess({ mode }) {
  const { t } = useClashLang();
  const cfg = MODES[mode];
  const [game, setGame] = useState(() => {
    const saved = readStore(cfg.store, {}).daily;
    return saved && saved.day === berlinDay() ? saved : newGame(mode, true);
  });
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const canvasRef = useRef(null);
  const inputRef = useRef(null);
  const stage = stageOf(game);
  const loaded = useStageCanvas(canvasRef, game, stage);
  const wrongSet = useMemo(() => new Set(game.wrong), [game.wrong]);
  const results = game.over ? [] : search(query, wrongSet);
  const card = ALL_CARDS.find((c) => c.id === game.cardId);
  const tries = game.wrong.length + game.skips;
  const triesToNext = PER_STAGE - (tries % PER_STAGE);

  const save = (update) => {
    setGame((prev) => {
      const g = typeof update === 'function' ? update(prev) : update;
      if (g.daily) writeStore(cfg.store, { daily: g });
      return g;
    });
  };

  const guess = (c) => {
    if (!c || game.over) return;
    setQuery('');
    setActive(0);
    if (c.id === game.cardId) {
      playSound('win');
      save((g) => ({ ...g, over: true, won: true }));
      return;
    }
    playSound('error');
    save((g) => {
      const wrong = [...g.wrong, c.id];
      return { ...g, wrong, over: wrong.length + g.skips >= MAX_TRIES };
    });
    inputRef.current?.focus();
  };
  const skip = () => {
    if (game.over) return;
    save((g) => {
      // Überspringen springt direkt zur nächsten Stufe (zählt als die fehlenden Versuche dieser Stufe)
      const add = PER_STAGE - ((g.wrong.length + g.skips) % PER_STAGE);
      const skips = g.skips + add;
      return { ...g, skips, over: g.wrong.length + skips >= MAX_TRIES };
    });
  };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    if (e.key === 'Enter') { e.preventDefault(); guess(results[active]); }
  };
  const restart = (daily) => {
    setQuery('');
    const saved = readStore(cfg.store, {}).daily;
    setGame(daily ? (saved?.day === berlinDay() ? saved : newGame(mode, true)) : newGame(mode, false));
  };
  const crowns = crownsFor(stage, game.won);
  const title = mode === 'zoom' ? t.zoomTitle : t.pixelTitle;

  return (
    <GameFrame title={title} icon={cfg.icon}
      seo={{ title: `Clash Royale ${title}`, description: mode === 'zoom' ? t.zoomSeo : t.pixelSeo, path: `/clash/${mode}` }}>
      <div className="flex justify-center mb-4">
        <div className="cr-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={game.daily} onClick={() => restart(true)}>{t.daily}</button>
          <button type="button" role="tab" aria-selected={!game.daily} onClick={() => restart(false)}>{t.free}</button>
        </div>
      </div>

      <div className="cr-arcade-panel p-4 md:p-6">
        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] gap-5 items-start">
          <div className="crq-img-stage">
            <canvas ref={canvasRef} width={VIEW_W} height={VIEW_H} aria-label={t.imageAlt} />
            {!loaded && <span className="crq-img-loading">…</span>}
            {!game.over && <span className="crq-img-stage-tag">{t.stage(stage + 1, STAGES)}</span>}
          </div>

          <div className="min-w-0 flex flex-col gap-3">
            {game.over ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <span className="w-16 shrink-0 aspect-[4/5]"><CardFace id={card.id} rarity={card.rarity} /></span>
                  <div className="min-w-0">
                    <p className="font-cr text-2xl">{game.won ? t.correct : t.wrong}</p>
                    <p className="text-sm text-white/75">{t.wasSecret(card.name)}{game.won ? t.solvedAt(stage + 1, tries + 1) : '.'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1" aria-label={t.crowns(crowns)}>
                  {[0, 1, 2].map((i) => <CrCrown key={i} size={30} className={i < crowns ? '' : 'opacity-25 grayscale'} />)}
                </div>
                <ChunkyButton variant="green" size="sm" icon={CrReplay} className="self-start" onClick={() => restart(false)}>{t.newRound}</ChunkyButton>
                {game.daily && <p className="text-xs text-white/50">{t.nextDaily}</p>}
              </div>
            ) : (
              <>
                <p className="text-white/80 text-sm leading-relaxed">{mode === 'zoom' ? t.zoomHelp : t.pixelHelp}</p>
                <div className="flex flex-wrap gap-2">
                  <span className="crq-counter">{t.triesLeft(MAX_TRIES - tries)}</span>
                  {stage < STAGES - 1 && <span className="crq-counter">{t.clearerIn(triesToNext)}</span>}
                </div>
                <div className="relative">
                  <CrSearch size={20} className="absolute left-3 top-1/2 -translate-y-1/2" />
                  <input ref={inputRef} value={query} onChange={(e) => { setQuery(e.target.value); setActive(0); }} onKeyDown={onKey}
                    placeholder={t.typeName} aria-label={t.typeName} autoComplete="off" className="crq-input" />
                  {results.length > 0 && (
                    <ul className="crq-suggest" role="listbox">
                      {results.map((c, i) => (
                        <li key={c.id} role="option" aria-selected={i === active}>
                          <button type="button" className={i === active ? 'is-active' : ''} onMouseEnter={() => setActive(i)} onClick={() => guess(c)}>
                            {c.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <ChunkyButton variant="blue" size="sm" className="self-start" onClick={skip}>{t.skip}</ChunkyButton>
              </>
            )}
            {game.wrong.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 text-sm text-white/60">
                {game.wrong.map((id) => (
                  <span key={id} className="crq-wrong"><CrClose size={12} />{ALL_CARDS.find((c) => c.id === id)?.name}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </GameFrame>
  );
}
