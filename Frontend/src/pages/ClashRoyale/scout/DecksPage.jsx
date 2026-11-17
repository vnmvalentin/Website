// DecksPage.jsx — /clash/decks: die Decks der bestplatzierten Spieler zum Durchsuchen („Meta Decks"). Filter nach
// enthaltenen Karten, Sortierung auf- oder absteigend; jedes Deck führt auf seine eigene Seite (DeckPage.jsx).
// Daten: Meta-Schnappschuss (Backend: clashRoyale/scout/scoutMeta.js, wird mehrmals täglich neu gesammelt).
// ?top=100|250|500 zeigt nur Kämpfe der Top N (eigene Teil-Auswertung im Backend), ohne = alle gesammelten (Top 1.000).
import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import cardsImg from '../../../assets/clashRoyale/ui/cards.webp';
import bannerArt from '../../../assets/clashRoyale/bg/card_evolution.webp';
import ScoutFrame from './ScoutFrame';
import { Banner, CardPicker, DeckLine, LoadState, Panel, PickedCards, Seg, SortControl } from './parts';
import { deckStats } from './analysis';
import { useScout } from './scoutApi';
import { fmtNum, fmtPct, timeAgo, useScoutText } from './scoutI18n';
import { CARD_BY_ID, sortBy } from './scoutUtil';

const STEP = 12;
const MAX_PICKED = 8;
const GOOD = '#7ee79a';
const BAD = '#ff8f91';
const TOPS = ['100', '250', '500', '1000'];

export default function DecksPage() {
  const { t, lang } = useScoutText();
  const [params, setParams] = useSearchParams();
  const top = TOPS.includes(params.get('top')) ? params.get('top') : '1000';
  const { data, error, loading, reload } = useScout(top === '1000' ? '/meta' : `/meta?top=${top}`);
  const meta = data?.meta;
  // Standard: von den meisten Spielern genutzt. Die Zahl der Kämpfe misst eher, wie viel einzelne Spieler spielen —
  // sie steht nur noch auf der Deck-Seite. Gleichstand bleibt in der Server-Reihenfolge (nach Kämpfen).
  const [sort, setSort] = useState({ by: 'players', dir: 'desc' });
  const [count, setCount] = useState(STEP);

  // Gewählte Karten stehen in der Adresse (?karten=a,b), damit sich eine Auswahl teilen lässt
  const picked = useMemo(() => (params.get('karten') || '').split(',').filter((id) => CARD_BY_ID[id]).slice(0, MAX_PICKED), [params]);
  const toggleCard = (id) => {
    setCount(STEP);
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      const list = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id];
      if (list.length) next.set('karten', list.join(',')); else next.delete('karten');
      return next;
    }, { replace: true });
  };

  const decks = useMemo(() => {
    const list = (meta?.decks || [])
      .filter((d) => picked.every((id) => d.cards.some((c) => c.id === id)))
      .map((d) => ({ ...d, elixir: deckStats(d.cards).avgElixir }));
    const value = { players: (d) => d.players, winRate: (d) => d.winRate, elixir: (d) => d.elixir ?? 99 }[sort.by] || ((d) => d.players);
    return sortBy(list, value, sort.dir, () => '');
  }, [meta, picked, sort]);

  const pickTop = (v) => {
    setCount(STEP);
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (v === '1000') next.delete('top'); else next.set('top', v);
      return next;
    }, { replace: true });
  };
  const topSeg = <Seg options={TOPS.map((v) => ({ id: v, label: t.topN(fmtNum(Number(v), lang)) }))} value={top} onChange={pickTop} label={t.topFilter} />;

  const sortOptions = [{ id: 'players', label: t.players }, { id: 'winRate', label: t.sortWinRate }, { id: 'elixir', label: t.avgElixir }];

  return (
    <ScoutFrame seo={{ title: t.decksTitle, description: t.metaSeo, path: '/clash/decks' }}>
      <Banner art={bannerArt} badge={<img src={cardsImg} alt="" />} title={t.decksTitle}
        sub={meta ? t.metaSource(fmtNum(meta.battles, lang), fmtNum(meta.players, lang), timeAgo(meta.updatedAt, lang)) : t.decksSub} />
      {!data ? <div className="mt-4"><LoadState loading={loading} error={error} onRetry={reload} /></div> : !meta ? (
        // Teil-Auswertung (Top 100/250/500) gibt es erst nach dem nächsten Sammellauf — die Auswahl bleibt bedienbar
        <Panel className="mt-4">
          {top !== '1000' && <div className="mb-3">{topSeg}</div>}
          <p className="crs-empty">{top !== '1000' ? t.metaTierEmpty : t.metaEmpty}</p>
        </Panel>
      ) : (
        <>
          <Panel className="relative z-20 my-4">
            <div className="flex flex-wrap items-center gap-3">
              {topSeg}
              <CardPicker picked={picked} onToggle={toggleCard} max={MAX_PICKED} />
              <PickedCards picked={picked} onToggle={toggleCard} />
              <div className="flex-1" />
              <SortControl options={sortOptions} value={sort.by} dir={sort.dir} onChange={(by, dir) => { setSort({ by, dir }); setCount(STEP); }} />
              {/* Eigenes Deck bauen (BuilderPage.jsx) — gewählte Karten gehen gleich mit */}
              <Link to={`/clash/baukasten?${new URLSearchParams({ ...(picked.length ? { karten: picked.join(',') } : null), ...(lang === 'en' ? { lang: 'en' } : null) })}`}
                className="cr-chip flex items-center h-10 px-3 rounded-xl font-cr text-sm text-white">{t.builderOpen}</Link>
            </div>
          </Panel>

          {decks.length ? (
            <div className="flex flex-col gap-2.5">
              {decks.slice(0, count).map((d, i) => (
                <DeckLine key={d.key || d.cards.map((c) => c.id || c.name).join(',')} cards={d.cards} tower={d.tower} rank={i + 1} level={false} wide
                  figures={[
                    { value: fmtPct(d.winRate, lang), label: t.winRate, tone: d.winRate >= 0.5 ? GOOD : BAD },
                    { value: fmtNum(d.players, lang), label: t.players },
                  ]} />
              ))}
              {decks.length > count && (
                <button type="button" className="cr-arcade-btn cr-arcade-btn--sm cr-arcade-btn--blue self-center mt-2" onClick={() => setCount((n) => n + STEP)}>
                  {t.showMore} ({decks.length - count})
                </button>
              )}
            </div>
          ) : <Panel><p className="crs-empty">{t.noDeckMatch}</p></Panel>}
        </>
      )}
    </ScoutFrame>
  );
}
