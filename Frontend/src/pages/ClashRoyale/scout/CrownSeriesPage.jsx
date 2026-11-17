// CrownSeriesPage.jsx — /clash/crown-series: die besten Duell-Decks der Crown Series. In der Crown Series spielt man
// im Duell (Best of 3) mit einem Set aus bis zu vier Decks, keine Karte darf doppelt vorkommen. Drei Ansichten:
//   • Zusammengestellt — die stärksten Duell-Decks zu Sets ohne doppelte Karte kombiniert
//   • Sets der Besten   — was die Bestplatzierten zuletzt in der Crown Series gespielt haben
//   • Einzelne Decks    — die häufigsten Duell-Decks mit Rundensiegquote
// Daten: /api/clash/scout/crown (Backend: scout/scoutCrown.js, gesammelt mit der Meta-Auswertung).
import React, { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import crownSeriesImg from '../../../assets/clashRoyale/modes/CR_CrownSeriesIcon.webp';
import bannerArt from '../../../assets/clashRoyale/bg/skeleton_king.webp';
import { CrElixir } from '../ui/CrIcons';
import ScoutFrame from './ScoutFrame';
import { Banner, DeckGrid, DeckLine, DeckShare, LoadState, Panel, PlayerLink, Seg } from './parts';
import { deckStats } from './analysis';
import { useScout } from './scoutApi';
import { fmtDec, fmtNum, fmtPct, timeAgo, useScoutText } from './scoutI18n';
import { expandDeck } from './scoutUtil';

const VIEWS = ['zusammengestellt', 'sets', 'decks'];
const GOOD = '#7ee79a';
const BAD = '#ff8f91';

/**
 * Ein Deck im Set: Nummer, Ø Elixier, Rundensiegquote und Kopieren-Menü neben dem Deck (4×2 wie im Spiel, Karten so
 * groß wie bei den Meta Decks). Ist die Fläche zu schmal, stehen die Angaben in einer Zeile über dem Deck.
 */
function SetDeck({ n, deck }) {
  const { t, lang } = useScoutText();
  const cards = expandDeck(deck.cards);
  const { avgElixir } = deckStats(cards);
  return (
    <div className="crs-setdeck crs-setdeck--side">
      <div className="crs-setdeck-body">
        <div className="crs-setdeck-info">
          <span className="font-cr text-[1.05rem] text-white">{t.duelDeck(n)}</span>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs crs-muted crs-num">
            {avgElixir !== null && <span className="inline-flex items-center gap-1"><CrElixir size={14} />{fmtDec(avgElixir, lang)}</span>}
            {deck.uses > 0 && <span><b style={{ color: deck.winRate >= 0.5 ? GOOD : BAD }}>{fmtPct(deck.winRate, lang)}</b> · {t.roundsN(fmtNum(deck.uses, lang))}</span>}
          </span>
          <DeckShare cards={cards} />
        </div>
        <DeckGrid cards={cards} size="md" level={false} />
      </div>
    </div>
  );
}

/** Ein Set aus bis zu vier Decks mit Kopfzeile. */
function DuelSet({ head, decks }) {
  return (
    <section className="cr-arcade-panel crs-duelset-card">
      <div className="crs-duelset-head">{head}</div>
      <div className="crs-duelset">
        {decks.map((d, i) => <SetDeck key={d.key} n={i + 1} deck={d} />)}
      </div>
    </section>
  );
}

export default function CrownSeriesPage() {
  const { t, lang } = useScoutText();
  const [params, setParams] = useSearchParams();
  const view = VIEWS.includes(params.get('ansicht')) ? params.get('ansicht') : VIEWS[0];
  const setView = (id) => setParams((prev) => {
    const next = new URLSearchParams(prev);
    if (id === VIEWS[0]) next.delete('ansicht'); else next.set('ansicht', id);
    return next;
  }, { replace: true });
  const { data, error, loading, reload } = useScout('/crown');
  const crown = data?.crown;
  const byKey = useMemo(() => new Map((crown?.decks || []).map((d) => [d.key, d])), [crown]);
  const resolve = (keys) => keys.map((k) => byKey.get(k)).filter(Boolean);

  return (
    <ScoutFrame seo={{ title: t.crownTitle, description: t.crownSeo, path: '/clash/crown-series' }}>
      <Banner art={bannerArt} badge={<img src={crownSeriesImg} alt="" />} title={t.crownTitle}
        sub={crown ? `${t.crownSub} ${t.crownSource(fmtNum(crown.battles, lang), timeAgo(crown.updatedAt, lang))}` : t.crownSub} />
      {!data ? <div className="mt-4"><LoadState loading={loading} error={error} onRetry={reload} /></div> : !crown ? (
        <Panel className="mt-4"><p className="crs-empty">{t.crownEmpty}</p></Panel>
      ) : (
        <>
          <div className="flex justify-center my-4">
            <Seg label={t.crownTitle} value={view} onChange={setView}
              options={[{ id: 'zusammengestellt', label: t.crownBuilt }, { id: 'sets', label: t.crownSets }, { id: 'decks', label: t.crownDecks }]} />
          </div>
          <p className="text-sm text-center crs-muted mb-4 max-w-2xl mx-auto">
            {view === 'zusammengestellt' ? t.crownBuiltSub : view === 'sets' ? t.crownSetsSub : t.crownDecksSub}
          </p>

          {view === 'zusammengestellt' && (crown.built.length ? (
            <div className="flex flex-col gap-4">
              {crown.built.map((s, i) => {
                const decks = resolve(s.decks);
                const rounds = decks.reduce((sum, d) => sum + d.uses, 0);
                const wins = decks.reduce((sum, d) => sum + d.uses * d.winRate, 0);
                return (
                  <DuelSet key={s.decks.join('|')} decks={decks}
                    head={<>
                      <span className={`crs-rank crs-rank--${i + 1}`}>{i + 1}</span>
                      <span className="font-cr text-[1.25rem] text-white">{t.crownSetN(i + 1)}</span>
                      <span className="flex-1" />
                      {rounds > 0 && <span className="text-sm crs-muted crs-num"><b className="text-white">{fmtPct(wins / rounds, lang)}</b> · {t.roundsN(fmtNum(rounds, lang))}</span>}
                    </>} />
                );
              })}
            </div>
          ) : <Panel><p className="crs-empty">{t.crownEmpty}</p></Panel>)}

          {view === 'sets' && (crown.sets.length ? (
            <div className="flex flex-col gap-4">
              {crown.sets.map((s) => (
                <DuelSet key={s.player.tag} decks={resolve(s.decks)}
                  head={<>
                    <span className="crs-rank">{s.player.rank}</span>
                    <span className="min-w-0">
                      <PlayerLink tag={s.player.tag} name={s.player.name || `#${s.player.tag}`} className="block truncate font-cr text-[1.2rem] text-white" />
                      {s.player.clan && <span className="block text-xs crs-muted truncate">{s.player.clan}</span>}
                    </span>
                    <span className="flex-1" />
                    <span className="text-sm crs-muted crs-num whitespace-nowrap">
                      <b className="text-white">{t.record(s.record.wins, s.record.n - s.record.wins)}</b> · {timeAgo(s.t, lang)}
                    </span>
                  </>} />
              ))}
            </div>
          ) : <Panel><p className="crs-empty">{t.crownEmpty}</p></Panel>)}

          {view === 'decks' && (
            <div className="flex flex-col gap-2.5">
              {crown.decks.filter((d) => d.uses > 0).slice(0, 40).map((d, i) => (
                <DeckLine key={d.key} cards={expandDeck(d.cards)} rank={i + 1} level={false} wide
                  figures={[
                    { value: fmtPct(d.winRate, lang), label: t.roundWinRate, tone: d.winRate >= 0.5 ? GOOD : BAD },
                    { value: fmtNum(d.uses, lang), label: t.roundsLabel },
                  ]}>
                  {t.usedBy(d.players)}
                </DeckLine>
              ))}
            </div>
          )}
        </>
      )}
    </ScoutFrame>
  );
}
