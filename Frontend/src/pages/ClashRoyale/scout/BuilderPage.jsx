// BuilderPage.jsx — /clash/baukasten: Deck-Baukasten. Links der Kartenpool, rechts das Deck (4 × 2 wie im Spiel) mit
// Ø Elixier, Cycle, Lücken und Rollen, darunter ähnliche Meta Decks. Die Auswertung steht in deckBuilder.js.
// Die Auswahl steckt in der Adresse (?karten=a,b,…), ein Deck lässt sich also teilen; die Deck-Seite und die
// Meta-Decks-Seite verlinken hierher. Ins Spiel kopieren geht über DeckShare (parts.jsx), sobald acht Karten drin sind.
import React, { useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ALL_CARDS } from '../data/cards';
import { ELIXIR_COST } from '../data/cardElixir';
import { CrElixir, CrRandom, CrSearch } from '../ui/CrIcons';
import draftImg from '../../../assets/clashRoyale/ui/draft.webp';
import bannerArt from '../../../assets/clashRoyale/bg/chaos_draft_modes.webp';
import ScoutFrame from './ScoutFrame';
import { Banner, DeckRow, DeckShare, Panel, ScoutCard, Seg } from './parts';
import { useScout } from './scoutApi';
import { fmtDec, fmtNum, fmtPct, useScoutText } from './scoutI18n';
import { CARD_BY_ID, cardType, deckPath, expandDeck, localCard } from './scoutUtil';
import { DECK_SIZE, ROLES, analyzeDeck, canAdd, hasRole, parseDeckParam, similarDecks } from './deckBuilder';

const GOOD = '#7ee79a';
const BAD = '#ff8f91';
const HINT = '#ffd65c';
const TYPES = ['all', 'troop', 'spell', 'building'];
const isKnown = (id) => !!CARD_BY_ID[id];

export default function BuilderPage() {
  const { t, lang, q } = useScoutText();
  const [params, setParams] = useSearchParams();
  const deck = useMemo(() => parseDeckParam(params.get('karten'), isKnown), [params]);
  const [text, setText] = useState('');
  const [type, setType] = useState('all');
  const [role, setRole] = useState('');
  const poolRef = useRef(null);
  const { data } = useScout('/meta');
  const metaDecks = data?.meta?.decks;

  // Die Adresse ist der Speicher: andere Parameter (Sprache) bleiben stehen
  const setDeck = (ids) => setParams((prev) => {
    const next = new URLSearchParams(prev);
    if (ids.length) next.set('karten', ids.join(',')); else next.delete('karten');
    return next;
  }, { replace: true });
  const toggle = (id) => {
    if (deck.includes(id)) setDeck(deck.filter((x) => x !== id));
    else if (canAdd(deck, id) === 'ok') setDeck([...deck, id]);
  };

  const analysis = useMemo(() => analyzeDeck(deck), [deck]);
  const cards = useMemo(() => deck.map(localCard).filter(Boolean), [deck]);
  const complete = deck.length === DECK_SIZE;
  const similar = useMemo(() => similarDecks(deck, metaDecks, { min: 4, limit: 5 }), [deck, metaDecks]);

  const pool = useMemo(() => {
    const needle = text.trim().toLowerCase();
    return ALL_CARDS
      .filter((c) => (type === 'all' || cardType(c.id) === type)
        && (!role || hasRole(c.id, role))
        && (!needle || c.name.toLowerCase().includes(needle)))
      .sort((a, b) => (ELIXIR_COST[a.id] ?? 99) - (ELIXIR_COST[b.id] ?? 99) || a.name.localeCompare(b.name));
  }, [text, type, role]);

  // Aus einer Lücke heraus: Pool auf die passende Rolle filtern und hinscrollen
  const showRole = (key) => {
    setRole(key);
    setType('all');
    setText('');
    poolRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const slots = Array.from({ length: DECK_SIZE }, (_, i) => cards[i] || null);

  return (
    <ScoutFrame seo={{ title: t.builderTitle, description: t.builderSeo, path: '/clash/baukasten' }}>
      <Banner art={bannerArt} badge={<img src={draftImg} alt="" />} title={t.builderTitle} sub={t.builderSub} />

      <div className="grid lg:grid-cols-[minmax(0,1fr)_400px] gap-4 mt-4 items-start">
        {/* Rechte Spalte (auf dem Handy oben): Deck, Lücken, Rollen. sticky am Hüllelement, nicht an der Fläche
            (.cr-arcade-panel ist position: relative). */}
        <div className="flex flex-col gap-4 min-w-0 lg:sticky lg:top-4">
          <Panel title={t.builderDeck}
            action={deck.length > 0 && <button type="button" className="cr-chip h-9 px-3 rounded-xl font-cr text-sm text-white" onClick={() => setDeck([])}>{t.builderClear}</button>}>
            <div className="crs-build-slots">
              {slots.map((c, i) => (c ? (
                <button key={c.id} type="button" className="crs-build-slot" onClick={() => toggle(c.id)} title={t.builderRemove(c.name)} aria-label={t.builderRemove(c.name)}>
                  <ScoutCard card={c} level={false} />
                </button>
              ) : <span key={`leer-${i}`} className="crs-build-slot is-empty" aria-hidden="true" />))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 mt-3">
              <span className="crs-deckmeta">
                <span><CrElixir size={18} /><b>{analysis.avgElixir !== null ? fmtDec(analysis.avgElixir, lang) : '–'}</b> {t.avgElixir}</span>
                <span title={t.cycleHint}><CrRandom size={18} /><b>{analysis.cycle ?? '–'}</b> {t.cycle}</span>
              </span>
              {complete ? (
                <span className="flex flex-wrap items-center gap-2">
                  <Link to={`${deckPath(cards)}${q}`} className="cr-chip flex items-center h-9 px-3 rounded-xl font-cr text-sm text-white">{t.deckPage}</Link>
                  <DeckShare cards={cards} />
                </span>
              ) : <span className="text-sm crs-muted">{deck.length ? t.builderMissing(DECK_SIZE - deck.length) : t.builderEmpty}</span>}
            </div>
          </Panel>

          <Panel title={t.builderGaps}>
            {!complete ? <p className="text-sm crs-muted">{t.builderGapsLater}</p>
              : !analysis.gaps.length ? <p className="text-sm" style={{ color: GOOD }}>{t.builderNoGaps}</p>
                : (
                  <ul className="flex flex-col divide-y divide-white/10">
                    {analysis.gaps.map((g) => (
                      <li key={g.key} className="flex items-start gap-2.5 py-2 first:pt-0 last:pb-0">
                        <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: g.level === 'gap' ? BAD : HINT }} />
                        <span className="flex-1 text-sm text-white/90 leading-snug">{t.gaps[g.key]}</span>
                        {g.role && (
                          <button type="button" className="cr-chip shrink-0 h-8 px-2.5 rounded-lg font-cr text-xs text-white" onClick={() => showRole(g.role)}>
                            {t.builderShowCards}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
          </Panel>

          <Panel title={t.builderRoles}>
            <dl className="flex flex-col divide-y divide-white/10">
              {ROLES.map((r) => (
                <div key={r.key} className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 py-1.5 first:pt-0 last:pb-0 text-sm">
                  <dt>
                    <button type="button" className="crs-link text-left text-white/70" onClick={() => showRole(r.key)}>{t.deckRoles[r.key]}</button>
                  </dt>
                  <dd className="flex flex-wrap gap-1.5">
                    {analysis.roles[r.key].length
                      ? analysis.roles[r.key].map((id) => <span key={id} className="crs-role">{CARD_BY_ID[id]?.name || id}</span>)
                      : <span className="crs-muted">–</span>}
                  </dd>
                </div>
              ))}
            </dl>
          </Panel>
        </div>

        {/* Linke Spalte (auf dem Handy darunter): der Kartenpool */}
        <div ref={poolRef} className="min-w-0 lg:order-first scroll-mt-4">
          <Panel title={t.builderPool} sub={complete ? undefined : (deck.length ? t.builderMissing(DECK_SIZE - deck.length) : t.builderPoolHint)}>
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <Seg label={t.builderPool} value={type} onChange={setType} options={TYPES.map((id) => ({ id, label: t.types[id] }))} />
              <select className="crs-select" value={role} onChange={(e) => setRole(e.target.value)} aria-label={t.builderRoleFilter}>
                <option value="">{t.builderRoleFilter}: {t.filterAll}</option>
                {ROLES.map((r) => <option key={r.key} value={r.key}>{t.deckRoles[r.key]}</option>)}
              </select>
              <div className="relative flex-1 min-w-[180px]">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"><CrSearch size={18} /></span>
                <input type="text" className="cr-input h-10 pl-9 pr-3 text-sm" placeholder={t.cardSearchPh} aria-label={t.cardSearchPh}
                  value={text} onChange={(e) => setText(e.target.value)} />
              </div>
            </div>
            <div className="crs-build-pool">
              {pool.map((c) => {
                const inDeck = deck.includes(c.id);
                const why = inDeck ? 'ok' : canAdd(deck, c.id);
                return (
                  <button key={c.id} type="button" aria-pressed={inDeck} disabled={why === 'full' || why === 'champion'}
                    onClick={() => toggle(c.id)}
                    title={why === 'champion' ? `${c.name} — ${t.builderChampion}` : inDeck ? t.builderRemove(c.name) : t.builderAdd(c.name)}
                    aria-label={inDeck ? t.builderRemove(c.name) : t.builderAdd(c.name)}>
                    <ScoutCard card={{ id: c.id, name: c.name }} level={false}>
                      <span className="crs-build-cost"><CrElixir size={22} /><b>{ELIXIR_COST[c.id] ?? '?'}</b></span>
                    </ScoutCard>
                  </button>
                );
              })}
            </div>
            {!pool.length && <p className="crs-empty">{t.nothingHere}</p>}
          </Panel>
        </div>
      </div>

      <Panel title={t.builderSimilar} sub={t.builderSimilarSub} className="mt-4">
        {!deck.length || !similar.length ? <p className="text-sm crs-muted">{t.builderSimilarEmpty}</p> : (
          <ul className="flex flex-col divide-y divide-white/10">
            {similar.map(({ deck: d, shared, same }) => {
              const ids = d.cards.map((c) => c.id).filter(Boolean);
              const page = deckPath(d.cards);
              return (
                <li key={d.key} className="flex flex-col lg:flex-row lg:items-center gap-2 lg:gap-4 py-3 first:pt-0 last:pb-0">
                  <DeckRow cards={expandDeck(d.cards)} mini level={false} className="lg:max-w-[440px] w-full" />
                  <div className="flex flex-1 flex-wrap items-center justify-between gap-x-4 gap-y-2 min-w-0">
                    <span className="text-sm">
                      <b className="font-cr" style={{ color: same ? GOOD : undefined }}>{same ? t.builderSame : t.builderShared(shared)}</b>
                      <span className="crs-muted"> · </span>
                      <b className="font-cr" style={{ color: d.winRate >= 0.5 ? GOOD : BAD }}>{fmtPct(d.winRate, lang)}</b>
                      <span className="crs-muted"> {t.winRate} · {fmtNum(d.uses, lang)} {t.usesLabel}</span>
                    </span>
                    <span className="flex flex-wrap items-center gap-2">
                      {page && <Link to={`${page}${q}`} className="cr-chip flex items-center h-9 px-3 rounded-xl font-cr text-sm text-white">{t.deckPage}</Link>}
                      {!same && (
                        <button type="button" className="cr-chip h-9 px-3 rounded-xl font-cr text-sm text-white" onClick={() => setDeck(parseDeckParam(ids.join(','), isKnown))}>
                          {t.builderTake}
                        </button>
                      )}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </ScoutFrame>
  );
}
