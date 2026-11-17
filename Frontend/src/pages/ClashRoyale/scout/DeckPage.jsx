// DeckPage.jsx — /clash/decks/:karten: ein einzelnes Deck. Oben das Deck wie im Spiel mit Nutzung und Siegquote bei
// den Besten, darunter wer es spielt, die Bilanz gegen die Decks, auf die es am häufigsten trifft, gegen Deck-Typen
// (Matchup-Ratgeber, 45 Tage) und die Karten, gegen die es schwer bzw. leicht hat.
// Die Adresse trägt die acht Karten selbst (scoutUtil.deckPath) — das Deck lässt sich also auch zeigen, wenn es in
// der aktuellen Auswertung nicht vorkommt; dann fehlen die Zahlen bis auf die Matchups seines Deck-Typs.
// Daten: /api/clash/scout/deck (Backend: scoutMeta.js, Eintrag „metaDetails“; matchups aus scoutMatchups.js).
import React, { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CrBattle, CrCards, CrCrown, CrElixir, CrKingBlue, CrRandom, CrSkull, CrSword } from '../ui/CrIcons';
import ScoutFrame from './ScoutFrame';
import { Bar, DeckGrid, DeckShare, LoadState, Panel, PlayerLink } from './parts';
import { cardKey, deckStats } from './analysis';
import { useScout } from './scoutApi';
import { fmtDec, fmtNum, fmtPct, timeAgo, useScoutText } from './scoutI18n';
import { cardsFromDeckParam, deckPath, expandDeck } from './scoutUtil';
import { CardRecords, TypeRows } from './matchupParts';
import { BAD, GOOD, typeCard, useMuSource } from './matchupUtil';
export default function DeckPage() {
  const { karten } = useParams();
  const { t, lang, q } = useScoutText();
  const fromUrl = useMemo(() => cardsFromDeckParam(karten), [karten]);
  const complete = fromUrl.length === 8;
  const { data, error, loading, reload } = useScout(complete ? `/deck?karten=${fromUrl.map((c) => encodeURIComponent(cardKey(c))).join(',')}` : null);

  // Mit Zahlen kommt das Deck vom Server (samt gespielter Form: Evolution/Held), sonst aus der Adresse
  const cards = data?.deck ? expandDeck(data.deck.cards) : fromUrl;
  const { avgElixir, cycle } = deckStats(cards);
  const names = cards.map((c) => c.name).join(', ');
  const deck = data?.deck;
  // Plätze kommen mit der Auswertung (alle 6 h) — eine ältere hat noch keine, dann ohne Platz-Kästchen statt lauter Striche
  const hasRanks = !!data?.players?.some((p) => typeof p.rank === 'number');
  // Plätze kommen live aus der Weltrangliste (wie /clash/rangliste); nur wenn die API hängt, die der Auswertung
  const rankHint = data?.ranksLive ? t.playedByRank : t.playedByRankOld;
  // Matchups (45 Tage): eigene Zahlen des Decks oder die seines Typs; die Karten-Bilanz nur aus eigenen Zahlen
  const mu = data?.matchups || null;
  const muCards = mu?.scope === 'deck' ? mu.cards : null;
  const muSource = useMuSource();

  return (
    <ScoutFrame seo={{ title: `${t.deckTitle}: ${names}`, description: t.deckSeo(names), path: complete ? deckPath(fromUrl) : '/clash/decks' }}>
      {!complete ? (
        <Panel className="text-center">
          <p className="crs-title text-xl mb-3">{t.deckInvalid}</p>
          <Link to={`/clash/decks${q}`} className="cr-arcade-btn cr-arcade-btn--sm cr-arcade-btn--blue">{t.allDecks}</Link>
        </Panel>
      ) : (
        <div className="flex flex-col gap-4">
          <section className="cr-arcade-panel crs-deckhero cr-anim-rise">
            <DeckGrid cards={cards} tower={deck?.tower} size="lg" level={false} />
            <div className="crs-deckhero-info">
              <h1 className="crs-title text-2xl md:text-3xl">{t.deckTitle}</h1>
              <div className="crs-deckmeta">
                {avgElixir !== null && <span><CrElixir size={20} /><b>{fmtDec(avgElixir, lang)}</b> {t.avgElixir}</span>}
                {cycle !== null && <span title={t.cycleHint}><CrRandom size={20} /><b>{cycle}</b> {t.cycle}</span>}
              </div>
              {deck ? (
                <div className="crs-deckhero-nums">
                  <div><b style={{ color: deck.winRate >= 0.5 ? GOOD : BAD }}>{fmtPct(deck.winRate, lang)}</b><span>{t.winRate}</span></div>
                  <div><b className="crs-num">{fmtNum(deck.uses, lang)}</b><span>{t.usesLabel}</span></div>
                  <div><b className="crs-num">{fmtNum(deck.players, lang)}</b><span>{t.players}</span></div>
                </div>
              ) : data ? <p className="text-sm crs-muted">{t.deckNotInMeta}</p> : null}
              <div className="flex flex-wrap items-center gap-2">
                <DeckShare cards={cards} />
                {/* Dieses Deck als Ausgangspunkt im Baukasten (BuilderPage.jsx) */}
                <Link to={`/clash/baukasten?${new URLSearchParams({ karten: cards.map((c) => c.id).filter(Boolean).join(','), ...(lang === 'en' ? { lang: 'en' } : null) })}`}
                  className="cr-chip flex items-center h-9 px-3 rounded-xl font-cr text-sm text-white">{t.builderEdit}</Link>
              </div>
              {data?.sample && <p className="text-xs crs-muted">{t.metaSource(fmtNum(data.sample.battles, lang), fmtNum(data.sample.players, lang), timeAgo(data.updatedAt, lang))}</p>}
            </div>
          </section>

          {!data ? <LoadState loading={loading} error={error} onRetry={reload} /> : (
            <>
              {deck && data.players.length > 0 && (
                <Panel title={t.playedBy} sub={t.playedBySub} icon={<CrKingBlue size={30} />}>
                  <div className={`crs-playedby${hasRanks ? '' : ' crs-playedby--plain'}`}>
                    {data.players.map((p) => (
                      <PlayerLink key={p.tag} tag={p.tag} className="crs-playedby-item"
                        name={<>{hasRanks && <span className={`crs-playedby-n${p.rank && p.rank <= 3 ? ` crs-rank--${p.rank}` : ''}`} title={rankHint}>{p.rank ? `#${fmtNum(p.rank, lang)}` : '–'}</span>}<b>{p.name || `#${p.tag}`}</b>{p.clan && <small>{p.clan}</small>}</>} />
                    ))}
                  </div>
                </Panel>
              )}

              {deck && (
              <Panel title={t.vsDecks} sub={t.vsDecksSub} icon={<CrBattle size={30} />}>
                {data.vsDecks.length ? (
                  <div className="crs-vslist">
                    {data.vsDecks.map((v) => {
                      const opp = expandDeck(v.cards);
                      const rate = v.n ? v.wins / v.n : 0;
                      return (
                        <Link key={v.key} to={`${deckPath(opp)}${q}`} className="crs-vsdeck">
                          <DeckGrid cards={opp} tower={v.tower} size="sm" level={false} link={false} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-3">
                              <b className="font-cr text-[1.5rem] leading-none" style={{ color: v.n >= 5 ? (rate >= 0.5 ? GOOD : BAD) : '#fff' }}>{fmtPct(rate, lang)}</b>
                              <span className="text-sm crs-muted crs-num whitespace-nowrap">{t.record(v.wins, v.n - v.wins)}</span>
                            </div>
                            <Bar value={rate} split className="mt-2" />
                            <p className="text-xs crs-muted mt-1.5">{t.games(v.n)}</p>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                ) : <p className="crs-empty">{t.vsDecksNone}</p>}
              </Panel>
              )}

              {mu?.vs?.length > 0 && (
                <Panel title={t.muTypes} sub={t.muTypesSub} icon={<CrSword size={30} />}>
                  <TypeRows list={mu.vs} />
                  <p className="text-xs crs-muted mt-4">
                    {mu.scope === 'type' && <>{t.muTypesFallback(typeCard(mu.type).name)} </>}{muSource(mu)}
                  </p>
                </Panel>
              )}

              {muCards ? (
                <Panel title={t.vsCards} sub={t.muCardsSub} icon={<CrCards size={30} />}>
                  {muCards.hard.length || muCards.easy.length ? (
                    <div className="grid md:grid-cols-2 gap-x-8 gap-y-5">
                      <CardRecords title={t.vsCardsHard} icon={<CrSkull size={20} />} list={muCards.hard} tone="hard" />
                      <CardRecords title={t.vsCardsEasy} icon={<CrCrown size={20} />} list={muCards.easy} tone="easy" />
                    </div>
                  ) : <p className="crs-empty">{t.muCardNone}</p>}
                  <p className="text-xs crs-muted mt-4">{muSource(mu)}</p>
                </Panel>
              ) : deck && (data.hard.length > 0 || data.easy.length > 0) && (
                <Panel title={t.vsCards} sub={t.vsCardsSub} icon={<CrCards size={30} />}>
                  <div className="grid md:grid-cols-2 gap-x-8 gap-y-5">
                    <CardRecords title={t.vsCardsHard} icon={<CrSkull size={20} />} list={data.hard} />
                    <CardRecords title={t.vsCardsEasy} icon={<CrCrown size={20} />} list={data.easy} />
                  </div>
                </Panel>
              )}

            </>
          )}
        </div>
      )}
    </ScoutFrame>
  );
}
