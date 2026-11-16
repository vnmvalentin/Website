// CardsPage.jsx — /clash/karten (alle Karten als Raster oder Tabelle; Filter nach Art, Seltenheit und Nutzung,
// Sortierung auf- oder absteigend) und /clash/karten/:id (eine Karte: Formen, Eigenschaften, Kampfwerte, Rolle in
// den Decks der Besten, Karte gegen Karte, passende Kartenspiele).
// Kampfwerte: data/cardStats.json (Wiki, Turnierniveau). Nutzung/Siegquote: Meta-Schnappschuss (/api/clash/scout/meta).
// Karte gegen Karte und — bei einer Win-Condition — ihr Deck-Typ gegen andere Typen: /api/clash/scout/matchups/card/:id
// (45 Tage Verlauf, Backend scoutMatchups.js).
import React, { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { ALL_CARDS, cardImageUrl } from '../data/cards';
import { ELIXIR_COST } from '../data/cardElixir';
import { CARD_ATTRS, bingoAttrLabel } from '../data/bingoAttributes';
import { DUEL_STATS, STATS, STATS_FETCHED_ISO, fmtDate as fmtIso } from '../clash/quizData';
import { pick } from '../clash/clashI18n';
import { SITE_URL } from '../constants';
import { CrBattle, CrCards, CrCrown, CrElixir, CrSearch, CrSkull, CrSword } from '../ui/CrIcons';
import searchImg from '../../../assets/clashRoyale/ui/search.webp';
import swordImg from '../../../assets/clashRoyale/ui/sword.webp';
import scrollImg from '../../../assets/clashRoyale/ui/icon_daily_task_scroll_opened.png';
import cardsImg from '../../../assets/clashRoyale/ui/cards.png';
import bannerArt from '../../../assets/clashRoyale/bg/battle_healer.webp';
import ScoutFrame from './ScoutFrame';
import { Banner, Bar, CardArt, DeckLine, Panel, ScoutCard, Seg, SortControl, Stat } from './parts';
import { useScout } from './scoutApi';
import { fmtPct, useScoutText } from './scoutI18n';
import { CARD_BY_ID, cardType, localCard, sortBy } from './scoutUtil';
import { CardRecords, TypeRows } from './matchupParts';
import { useMuSource } from './matchupUtil';

const RARITIES = ['Common', 'Rare', 'Epic', 'Legendary', 'Champion'];
const RARITY_ORDER = Object.fromEntries(RARITIES.map((r, i) => [r, i]));
// Eigenschaften, die auf der Kartenseite als Marken erscheinen (Kosten, Seltenheit und Art stehen schon woanders)
const SHOWN_ATTR = /^(move_|range_|target_|splash|swarm|single|speed_)/;
const GOOD = '#7ee79a';
const BAD = '#ff8f91';

function useMetaCards() {
  const { data } = useScout('/meta');
  const meta = data?.meta || null;
  const byId = useMemo(() => new Map((meta?.cards || []).filter((c) => c.id).map((c) => [c.id, c])), [meta]);
  return { meta, byId };
}

export function CardsPage() {
  const { t, lang, q } = useScoutText();
  const { meta, byId } = useMetaCards();
  const [type, setType] = useState('all');
  const [rarity, setRarity] = useState('all');
  const [minUsage, setMinUsage] = useState('0');
  const [view, setView] = useState('grid');
  const [sort, setSort] = useState({ by: 'name', dir: 'asc' });
  const [text, setText] = useState('');

  const list = useMemo(() => {
    const needle = text.trim().toLowerCase();
    const min = Number(minUsage) / 100;
    const filtered = ALL_CARDS.filter((c) => (type === 'all' || cardType(c.id) === type)
      && (rarity === 'all' || c.rarity === rarity)
      && (!min || (byId.get(c.id)?.usage ?? 0) >= min)
      && (!needle || c.name.toLowerCase().includes(needle)));
    const value = {
      name: (c) => c.name,
      elixir: (c) => ELIXIR_COST[c.id] ?? 99,
      // Wie im Spiel: innerhalb einer Seltenheit nach Elixier, billigste zuerst — in beide Sortierrichtungen
      // (Seltenheit × 100, die Kosten mit dem Vorzeichen der Richtung dazu), danach erst der Name
      rarity: (c) => (RARITY_ORDER[c.rarity] ?? -1) * 100 + (sort.dir === 'asc' ? 1 : -1) * (ELIXIR_COST[c.id] ?? 50),
      usage: (c) => byId.get(c.id)?.usage ?? -1,
      winRate: (c) => byId.get(c.id)?.winRate ?? -1,
    }[sort.by];
    return sortBy(filtered, value, sort.dir);
  }, [type, rarity, minUsage, sort, text, byId]);

  // Namen sortiert man von A bis Z, Zahlen meist von oben — beim Wechsel der Spalte die passende Richtung vorgeben
  const pickSort = (by, dir) => setSort((prev) => (by !== prev.by ? { by, dir: by === 'name' || by === 'elixir' ? 'asc' : 'desc' } : { by, dir }));
  const head = (id, label, cls = '') => (
    <th className={cls} aria-sort={sort.by === id ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
      <button type="button" onClick={() => pickSort(id, sort.by === id ? (sort.dir === 'asc' ? 'desc' : 'asc') : undefined)}>
        {label}{sort.by === id && (sort.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </button>
    </th>
  );
  const peak = Math.max(0.01, ...[...byId.values()].map((c) => c.usage));
  const sortOptions = [
    { id: 'name', label: t.sortName }, { id: 'elixir', label: t.sortElixir }, { id: 'rarity', label: t.sortRarity },
    ...(meta ? [{ id: 'usage', label: t.sortUsage }, { id: 'winRate', label: t.sortWinRate }] : []),
  ];

  return (
    <ScoutFrame seo={{ title: t.cardsTitle, description: t.cardsSeo, path: '/clash/karten' }}>
      <Banner art={bannerArt} badge={<img src={cardsImg} alt="" />} title={t.cardsTitle} sub={t.cardsSub} />
      <Panel className="mt-4">
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <Seg label={t.cardsTitle} value={type} onChange={setType}
            options={['all', 'troop', 'spell', 'building'].map((id) => ({ id, label: t.types[id] }))} />
          <select className="crs-select" value={rarity} onChange={(e) => setRarity(e.target.value)} aria-label={t.sortRarity}>
            <option value="all">{t.sortRarity}: {t.filterAll}</option>
            {RARITIES.map((r) => <option key={r} value={r}>{t.rarity[r]}</option>)}
          </select>
          {meta && (
            <select className="crs-select" value={minUsage} onChange={(e) => setMinUsage(e.target.value)} aria-label={t.usage}>
              <option value="0">{t.usage}: {t.filterAll}</option>
              {[1, 5, 10, 20].map((p) => <option key={p} value={p}>{t.usageFrom(p)}</option>)}
            </select>
          )}
          <div className="flex-1" />
          <div className="relative w-full sm:w-52">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"><CrSearch size={18} /></span>
            <input type="text" className="cr-input h-10 pl-9 pr-3 text-sm" placeholder={t.cardSearchPh} aria-label={t.cardSearchPh}
              value={text} onChange={(e) => setText(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <Seg label={t.view} value={view} onChange={setView} options={[{ id: 'grid', label: t.viewGrid }, { id: 'table', label: t.viewTable }]} />
          <SortControl options={sortOptions} value={sort.by} dir={sort.dir} onChange={pickSort} />
          <span className="text-sm crs-muted crs-num">{t.cardsN(list.length)}</span>
        </div>
        {!meta && <p className="text-xs crs-muted mb-3">{t.noMetaYet}</p>}

        {view === 'grid' ? (
          <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-x-3 gap-y-4">
            {list.map((c) => {
              const m = byId.get(c.id);
              return (
                <ScoutCard key={c.id} card={localCard(c.id)} link level={false}>
                  <span className="block mt-1 text-center text-[13px] font-semibold leading-tight text-white">{c.name}</span>
                  <span className="flex items-center justify-center gap-1 text-[11.5px] crs-muted crs-num">
                    <CrElixir size={12} />{ELIXIR_COST[c.id] ?? '–'}
                    {m && <> · {fmtPct(m.usage, lang)} · <span style={{ color: m.winRate >= 0.5 ? GOOD : BAD }}>{fmtPct(m.winRate, lang)}</span></>}
                  </span>
                </ScoutCard>
              );
            })}
          </div>
        ) : (
          <div className="crs-scroll-x">
            <table className="crs-table">
              <thead>
                <tr>
                  {head('name', t.colCard)}
                  {head('elixir', t.sortElixir, 'num')}
                  {head('rarity', t.sortRarity)}
                  {head('usage', t.usage)}
                  {head('winRate', t.winRate, 'num')}
                </tr>
              </thead>
              <tbody>
                {list.map((c) => {
                  const m = byId.get(c.id);
                  return (
                    <tr key={c.id}>
                      <td className="name">
                        <Link to={`/clash/karten/${c.id}${q}`} className="crs-link inline-flex items-center gap-3">
                          <span className="w-9 shrink-0 crs-card"><span className="crs-card-art block"><CardArt card={{ id: c.id }} /></span></span>
                          {c.name}
                        </Link>
                      </td>
                      <td className="num"><span className="inline-flex items-center gap-1"><CrElixir size={14} />{ELIXIR_COST[c.id] ?? '–'}</span></td>
                      <td>{t.rarity[c.rarity] || c.rarity}</td>
                      <td className="w-[34%]">
                        {m ? (
                          <span className="flex items-center gap-3">
                            <Bar value={m.usage / peak} className="flex-1" />
                            <span className="w-12 text-right font-cr text-white crs-num">{fmtPct(m.usage, lang)}</span>
                          </span>
                        ) : '–'}
                      </td>
                      <td className="num font-cr" style={m ? { color: m.winRate >= 0.5 ? GOOD : BAD } : undefined}>{m ? fmtPct(m.winRate, lang) : '–'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!list.length && <p className="crs-empty">{t.nothingHere}</p>}
      </Panel>
    </ScoutFrame>
  );
}

export function CardDetailPage() {
  const { id } = useParams();
  const { t, lang, q } = useScoutText();
  const { meta, byId } = useMetaCards();
  const [form, setForm] = useState('base');
  const card = CARD_BY_ID[id];

  // Welche Karten stehen in den Decks der Besten am häufigsten daneben, und welche Decks enthalten sie
  const { partners, decks } = useMemo(() => {
    if (!meta?.decks || !card) return { partners: [], decks: [] };
    const withCard = meta.decks.filter((d) => d.cards.some((c) => c.id === card.id));
    const count = new Map();
    for (const d of withCard) for (const c of d.cards) if (c.id && c.id !== card.id) count.set(c.id, (count.get(c.id) || 0) + d.uses);
    return {
      partners: [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([cid]) => localCard(cid)).filter(Boolean),
      decks: withCard.slice(0, 4),
    };
  }, [meta, card]);
  // Matchups (45 Tage): fehlt die Auswertung noch, bleiben die beiden Flächen einfach weg
  const { data: muRes } = useScout(card ? `/matchups/card/${card.id}` : null);
  const mu = muRes?.matchups || null;
  const muSource = useMuSource();

  if (!card) {
    return (
      <ScoutFrame seo={{ title: t.cardsTitle, description: t.cardsSeo, path: '/clash/karten', noindex: true }}>
        <Panel className="text-center">
          <p className="crs-title text-xl mb-3">{t.cardUnknown}</p>
          <Link to={`/clash/karten${q}`} className="cr-arcade-btn cr-arcade-btn--sm cr-arcade-btn--blue">{t.cardsTitle}</Link>
        </Panel>
      </ScoutFrame>
    );
  }

  const base = cardImageUrl(card.id);
  const forms = ['base', 'ev1', 'hero'].filter((f) => f === 'base' || cardImageUrl(card.id, f) !== base);
  const shownForm = forms.includes(form) ? form : 'base';
  const stats = STATS[card.id];
  const m = byId.get(card.id);
  const attrs = (CARD_ATTRS[card.id] || []).filter((a) => SHOWN_ATTR.test(a));
  const type = cardType(card.id);
  const games = [
    { to: `/clash/zoom${q}`, img: searchImg, label: t.gameZoom },
    { to: `/clash/stats-duell${q}`, img: swordImg, label: t.gameDuel },
    { to: `/clash/wordle${q}`, img: scrollImg, label: t.gameWordle },
  ];
  // Suchtreffer: eigener Titel und eigene Beschreibung je Karte (sonst hätten 120 Seiten denselben Text) und der Pfad
  // Stats › Karten › Karte als Brotkrumen unter dem Treffer. Die Seiten werden vorgerendert (Frontend/prerender.js).
  const facts = [typeof ELIXIR_COST[card.id] === 'number' ? t.elixirN(ELIXIR_COST[card.id]) : null, t.rarity[card.rarity] || card.rarity]
    .filter(Boolean).join(', ');
  const langQ = lang === 'en' ? '?lang=en' : '';
  const crumbs = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: t.crumbStats, item: `${SITE_URL}/clash${langQ}` },
      { '@type': 'ListItem', position: 2, name: t.cardsTitle, item: `${SITE_URL}/clash/karten${langQ}` },
      { '@type': 'ListItem', position: 3, name: card.name, item: `${SITE_URL}/clash/karten/${card.id}${langQ}` },
    ],
  };

  return (
    <ScoutFrame seo={{ title: t.cardSeoTitle(card.name), description: t.cardSeo(card.name, facts), path: `/clash/karten/${card.id}`, jsonLd: crumbs }}>
      <div className="grid lg:grid-cols-[300px_minmax(0,1fr)] gap-4 items-start">
        {/* sticky am Hüllelement: die Fläche selbst ist position: relative (.cr-arcade-panel) */}
        <div className="lg:sticky lg:top-4">
          <Panel className="flex flex-col items-center cr-anim-rise">
            <div className="w-48 crs-card"><span className="crs-card-art block"><CardArt card={{ id: card.id, name: card.name, variant: shownForm === 'base' ? undefined : shownForm }} /></span></div>
            {forms.length > 1 && (
              <Seg className="mt-4" label={card.name} value={shownForm} onChange={setForm} options={forms.map((f) => ({ id: f, label: t.forms[f] }))} />
            )}
            <h1 className="crs-title text-3xl text-center mt-4">{card.name}</h1>
            <div className="flex flex-wrap justify-center gap-2 mt-3">
              <span className="crs-tagchip"><CrElixir size={15} /> {ELIXIR_COST[card.id] ?? '–'}</span>
              <span className="crs-tagchip">{t.rarity[card.rarity] || card.rarity}</span>
              {type && <span className="crs-tagchip">{t.types[type]}</span>}
            </div>
            {attrs.length > 0 && (
              <div className="flex flex-wrap justify-center gap-1.5 mt-3">
                {attrs.map((a) => <span key={a} className="crs-role">{bingoAttrLabel(a, lang)}</span>)}
              </div>
            )}
            <Link to={`/clash/decks?karten=${card.id}${lang === 'en' ? '&lang=en' : ''}`} className="cr-arcade-btn cr-arcade-btn--sm cr-arcade-btn--blue mt-4">{t.decksWithShort}</Link>
          </Panel>
        </div>

        <div className="flex flex-col gap-4 min-w-0">
          <Panel title={t.usageTop} icon={<CrCrown size={28} />}>
            {m ? (
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-[110px_minmax(0,1fr)_56px] items-center gap-3 text-sm">
                  <span className="font-semibold text-white">{t.usage}</span>
                  <Bar value={m.usage} />
                  <span className="font-cr text-base text-white text-right crs-num">{fmtPct(m.usage, lang)}</span>
                </div>
                <div className="grid grid-cols-[110px_minmax(0,1fr)_56px] items-center gap-3 text-sm">
                  <span className="font-semibold text-white">{t.winRate}</span>
                  <Bar value={m.winRate} color={m.winRate >= 0.5 ? '#4fd36d' : '#ff6b6d'} />
                  <span className="font-cr text-base text-white text-right crs-num">{fmtPct(m.winRate, lang)}</span>
                </div>
                {m.special > 0 && <p className="text-xs crs-muted">{t.playedSpecial(fmtPct(m.special, lang))}</p>}
              </div>
            ) : <p className="text-sm crs-muted">{meta ? t.notInMeta : t.noMetaYet}</p>}
          </Panel>

          {mu && (
            <Panel title={t.muCardTitle} sub={t.muCardSub(card.name)} icon={<CrBattle size={28} />}>
              {mu.hard.length || mu.easy.length ? (
                <div className="grid md:grid-cols-2 gap-x-8 gap-y-5">
                  <CardRecords title={t.vsCardsHard} icon={<CrSkull size={20} />} list={mu.hard} tone="hard" />
                  <CardRecords title={t.vsCardsEasy} icon={<CrCrown size={20} />} list={mu.easy} tone="easy" />
                </div>
              ) : <p className="crs-empty">{t.muCardNone}</p>}
              <p className="text-xs crs-muted mt-4">{muSource(mu)}</p>
            </Panel>
          )}

          {mu?.type?.vs?.length > 0 && (
            <Panel title={t.muTypeTitle(card.name)} sub={t.muTypesSub} icon={<CrSword size={28} />}>
              <TypeRows list={mu.type.vs} />
              <p className="text-xs crs-muted mt-4">{muSource(mu, mu.type.n)}</p>
            </Panel>
          )}

          {stats && (
            <Panel title={t.stats} icon={<CrSword size={28} />}>
              <div className="crs-stats crs-stats--3">
                {DUEL_STATS.filter((s) => typeof stats[s.key] === 'number').map((s) => (
                  <Stat key={s.key} label={pick(s.label, lang)} value={s.format(stats[s.key], lang)} sub={stats.of?.[s.key] ? pick(stats.of[s.key], lang) : undefined} />
                ))}
              </div>
              <p className="text-xs crs-muted mt-3">{t.statsNote(fmtIso(STATS_FETCHED_ISO, lang))}</p>
            </Panel>
          )}

          {partners.length > 0 && (
            <Panel title={t.oftenWith} icon={<CrCards size={28} />}>
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                {partners.map((c) => <ScoutCard key={c.id} card={c} link level={false} />)}
              </div>
            </Panel>
          )}

          {decks.length > 0 && (
            <Panel title={t.decksWith}>
              <div className="flex flex-col gap-2.5">
                {decks.map((d) => (
                  <DeckLine key={d.cards.map((c) => c.id || c.name).join(',')} cards={d.cards} tower={d.tower} level={false}
                    figures={[{ value: fmtPct(d.winRate, lang), label: t.winRate, tone: d.winRate >= 0.5 ? GOOD : BAD }, { value: d.uses, label: t.usesLabel }]}>
                    {t.usedBy(d.players)}
                  </DeckLine>
                ))}
              </div>
            </Panel>
          )}

          <Panel title={t.playWith}>
            <div className="grid sm:grid-cols-3 gap-2">
              {games.map((g) => (
                <Link key={g.to} to={g.to} className="cr-tile-btn px-3 py-2.5">
                  <img src={g.img} alt="" className="h-9 w-9 object-contain shrink-0" draggable={false} />
                  <span className="font-cr text-[1.05rem] text-white">{g.label}</span>
                </Link>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </ScoutFrame>
  );
}
