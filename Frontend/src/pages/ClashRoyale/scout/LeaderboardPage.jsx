// LeaderboardPage.jsx — /clash/ranglisten: Ranked-Rangliste der Spieler (je Zeile ihr zuletzt gespieltes Ranked-Deck
// groß in einer Reihe, die Turmtruppe dahinter), Clans nach Punkten und nach Kriegstrophäen; weltweit oder je Land. Die Auswahl steht
// in der Adresse (?liste=&land=&top=&karten=), damit man sie teilen kann.
//
// Decks: die API liefert in Ranglisten keine. Der Server hängt an, was er aus Battlelogs schon kennt; für die
// sichtbaren Zeilen ohne Deck fragt die Seite in kleinen Paketen nach (/decks), der Server merkt sich das Ergebnis.
// Der Karten-Filter („wer spielt Hog Rider?") braucht die Decks der ganzen Liste — dann wird für alle Zeilen
// nachgeladen, nicht nur für die sichtbaren.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { CrBattle, CrElixir, CrRandom, CrTrophy } from '../ui/CrIcons';
import { MEDAL_ICON_URL } from '../data/leagueIcons';
import trophyImg from '../../../assets/clashRoyale/ui/trophy.png';
import bannerArt from '../../../assets/clashRoyale/bg/prince_victory.webp';
import ScoutFrame from './ScoutFrame';
import { Banner, CardPicker, ClanBadge, ClanLink, DeckGrid, DeckShare, LoadState, Panel, PickedCards, PlayerLink, Seg } from './parts';
import { deckStats } from './analysis';
import { scoutGet, useScout } from './scoutApi';
import { fmtDec, fmtNum, useScoutText } from './scoutI18n';
import { CARD_BY_ID, deckPath, expandDeck } from './scoutUtil';

const KINDS = ['players', 'clans', 'wars'];
const SHOW_STEP = 50;
const DECK_BATCH = 12;
const MAX_PICKED = 4;

export default function LeaderboardPage() {
  const { t, lang, q } = useScoutText();
  const [params, setParams] = useSearchParams();
  const kind = KINDS.includes(params.get('liste')) ? params.get('liste') : 'players';
  const loc = /^5700\d{4}$/.test(params.get('land') || '') ? params.get('land') : 'global';
  const top1000 = params.get('top') === '1000' && kind === 'players' && loc === 'global';
  const picked = useMemo(
    () => (kind === 'players' ? (params.get('karten') || '').split(',').filter((id) => CARD_BY_ID[id]).slice(0, MAX_PICKED) : []),
    [params, kind],
  );
  const [filter, setFilter] = useState('');
  const [shown, setShown] = useState(SHOW_STEP);
  const [decks, setDecks] = useState({});
  const [towers, setTowers] = useState({});
  const asked = useRef(new Set());

  const set = (patch) => {
    setShown(SHOW_STEP);
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k); }
      return next;
    }, { replace: true });
  };
  const toggleCard = (id) => set({ karten: (picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]).join(',') });

  const { data: locs } = useScout('/locations');
  const { data, error, loading, reload } = useScout(`/ranking/${kind}?loc=${loc}${top1000 ? '&top=1000' : ''}`);
  const isPlayers = data?.kind === 'players';

  // Nachgeladenes geht vor; undefined = wird noch geladen, null = kein Ranked-Deck bekannt
  const rawDeckOf = (it) => (Object.prototype.hasOwnProperty.call(decks, it.tag) ? decks[it.tag] ?? it.deck ?? null : it.deck);

  const named = useMemo(() => {
    const list = data?.items || [];
    const needle = filter.trim().toLowerCase();
    return needle ? list.filter((it) => it.name.toLowerCase().includes(needle) || it.tag.toLowerCase().includes(needle.replace(/^#/, '')) || it.clan?.name?.toLowerCase().includes(needle)) : list;
  }, [data, filter]);
  // Karten-Filter: nur Zeilen, deren Deck alle gewählten Karten enthält; pending = Decks, die noch geladen werden
  const { items, pending } = useMemo(() => {
    if (!picked.length || !isPlayers) return { items: named, pending: 0 };
    let waiting = 0;
    const hits = named.filter((it) => {
      const deck = rawDeckOf(it);
      if (deck === undefined) { waiting += 1; return false; }
      return !!deck && picked.every((id) => deck.some((c) => c.id === id));
    });
    return { items: hits, pending: waiting };
  }, [named, picked, isPlayers, decks]); // eslint-disable-line react-hooks/exhaustive-deps
  const visible = useMemo(() => items.slice(0, shown), [items, shown]);

  // Decks nachladen, die der Server noch nicht (oder nur veraltet) kennt: für die sichtbaren Zeilen — mit
  // Karten-Filter für die ganze Liste, sonst ließe sich nicht filtern
  useEffect(() => {
    if (!isPlayers) return;
    const pool = picked.length ? data.items : visible;
    const want = pool.filter((it) => (it.deck === undefined || it.deckStale) && !asked.current.has(it.tag)).map((it) => it.tag);
    if (!want.length) return;
    want.forEach((tag) => asked.current.add(tag));
    (async () => {
      for (let i = 0; i < want.length; i += DECK_BATCH) {
        const chunk = want.slice(i, i + DECK_BATCH);
        const res = await scoutGet(`/decks?tags=${chunk.join(',')}`);
        // Was der Server nicht liefern konnte, gilt als „kein Deck" — sonst bliebe der Platzhalter für immer stehen
        const rest = res.ok ? chunk : want.slice(i);
        const none = Object.fromEntries(rest.map((tag) => [tag, null]));
        setDecks((prev) => ({ ...none, ...prev, ...(res.ok && res.decks ? res.decks : null) }));
        if (res.ok && res.towers) setTowers((prev) => ({ ...prev, ...res.towers }));
        if (!res.ok) break;
      }
    })();
  }, [data, visible, isPlayers, picked.length]);

  const scoreIcon = kind === 'players' ? <img src={MEDAL_ICON_URL} alt="" className="h-5 w-auto" /> : kind === 'wars' ? <CrBattle size={18} /> : <CrTrophy size={18} />;

  return (
    <ScoutFrame seo={{ title: t.rankingsTitle, description: t.rankingsSeo, path: '/clash/ranglisten' }}>
      <Banner art={bannerArt} badge={<img src={trophyImg} alt="" />} title={t.rankingsTitle} sub={t.rankingsSub} />
      <Panel className="mt-4">
        <div className="flex flex-wrap items-center gap-3 mb-4 relative z-20">
          <Seg label={t.rankingsTitle} value={kind} onChange={(id) => set({ liste: id === 'players' ? '' : id, top: '', karten: id === 'players' ? picked.join(',') : '' })}
            options={[{ id: 'players', label: t.rkPlayers }, { id: 'clans', label: t.rkClans }, { id: 'wars', label: t.rkWars }]} />
          <select className="crs-select" value={loc} aria-label={t.country} onChange={(e) => set({ land: e.target.value === 'global' ? '' : e.target.value, top: '' })}>
            <option value="global">{t.global}</option>
            {(locs?.items || []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          {kind === 'players' && loc === 'global' && (
            <Seg label="Top" value={top1000 ? '1000' : '200'} onChange={(id) => set({ top: id === '1000' ? '1000' : '' })}
              options={[{ id: '200', label: t.top200 }, { id: '1000', label: t.top1000 }]} />
          )}
          <div className="flex-1" />
          <input type="text" className="cr-input h-10 px-3 text-sm max-w-56" placeholder={t.filterPh} aria-label={t.filterPh}
            value={filter} onChange={(e) => { setFilter(e.target.value); setShown(SHOW_STEP); }} />
        </div>
        {kind === 'players' && (
          <div className="flex flex-wrap items-center gap-2 mb-4 relative z-10">
            <CardPicker picked={picked} onToggle={toggleCard} max={MAX_PICKED} label={t.playsCard} />
            <PickedCards picked={picked} onToggle={toggleCard} />
            {picked.length > 0 && data && (
              <span className="text-sm crs-muted">
                {t.playsCardHits(items.length, named.length)}{pending > 0 ? ` · ${t.decksLoading(pending)}` : ''}
              </span>
            )}
          </div>
        )}

        {!data ? <LoadState loading={loading} error={error} onRetry={reload} /> : !items.length ? (
          <p className="crs-empty">
            {picked.length && isPlayers ? (pending > 0 ? t.decksLoading(pending) : t.playsCardNone) : `${t.rankingEmpty}${kind === 'players' && !filter ? ` ${t.rankingSeasonStart}` : ''}`}
          </p>
        ) : (
          <>
            <div className={isPlayers ? 'crs-ranklist' : 'crs-scroll-x'}>
              {isPlayers ? visible.map((it) => {
                const deck = expandDeck(rawDeckOf(it));
                const page = deck ? deckPath(deck) : null;
                const { avgElixir: elixir = null, cycle = null } = deck ? deckStats(deck) : {};
                const tower = towers[it.tag] || it.deckTower || null;
                return (
                  <div key={it.tag} className="crs-rankrow">
                    <span className={`crs-rank crs-rank--${it.rank}`}>{it.rank ?? '–'}</span>
                    <div className="crs-rankrow-who">
                      <PlayerLink tag={it.tag} name={it.name} className="block truncate font-cr text-[1.2rem] leading-tight text-white" />
                      {it.clan && <ClanLink clan={it.clan} size={16} className="max-w-full text-[13px] crs-muted mt-0.5" />}
                      <span className="crs-rankrow-score"><img src={MEDAL_ICON_URL} alt="" className="h-5 w-auto" />{fmtNum(it.score, lang)}</span>
                    </div>
                    <div className="crs-rankrow-deck">
                      <DeckGrid cards={deck} tower={tower} size="row" level={false} />
                      {deck && (
                        <div className="crs-rankrow-meta">
                          {elixir !== null && <span className="crs-delta"><CrElixir size={14} /> {fmtDec(elixir, lang)}</span>}
                          {cycle !== null && <span className="crs-delta" title={t.cycleHint}><CrRandom size={14} /> {cycle} {t.cycle}</span>}
                          {/* Knöpfe als Gruppe rechts — bricht am Handy gemeinsam in die nächste Zeile um */}
                          <span className="ml-auto flex items-center gap-2">
                            {page && <Link to={`${page}${q}`} className="cr-chip flex items-center h-9 px-3 rounded-xl font-cr text-sm text-white">{t.deckPage}</Link>}
                            <DeckShare cards={deck} />
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              }) : (
                <table className="crs-table">
                  <tbody>
                    {visible.map((it) => {
                      const move = typeof it.prevRank === 'number' && it.prevRank > 0 ? it.prevRank - it.rank : 0;
                      return (
                        <tr key={it.tag}>
                          <td className="w-14"><span className={`crs-rank crs-rank--${it.rank}`}>{it.rank ?? '–'}</span></td>
                          <td className="name">
                            <Link to={`/clash/clan/${it.tag}${q}`} className="crs-link inline-flex items-center gap-2 min-w-0">
                              <ClanBadge badgeId={it.badgeId} size={26} />
                              <span className="min-w-0">
                                <span className="block truncate">{it.name}</span>
                                <span className="block text-xs font-normal crs-muted">{[it.location?.name, typeof it.members === 'number' ? t.members(it.members) : ''].filter(Boolean).join(' · ')}</span>
                              </span>
                            </Link>
                          </td>
                          <td className="num w-10">
                            {move !== 0 && (
                              <span className={`inline-flex items-center gap-0.5 text-xs ${move > 0 ? 'text-[#7ee79a]' : 'text-[#ff8f91]'}`}>
                                {move > 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}{Math.abs(move)}
                              </span>
                            )}
                          </td>
                          <td className="num w-28"><span className="inline-flex items-center gap-1.5 font-cr text-base text-white">{scoreIcon}{fmtNum(it.score, lang)}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            {isPlayers && <p className="text-xs crs-muted mt-3">{t.rankingDeckNote}</p>}
            {items.length > shown && (
              <div className="flex justify-center mt-4">
                <button type="button" className="cr-arcade-btn cr-arcade-btn--sm cr-arcade-btn--blue" onClick={() => setShown((n) => n + SHOW_STEP)}>
                  {t.showMore} ({fmtNum(items.length - shown, lang)})
                </button>
              </div>
            )}
          </>
        )}
      </Panel>
    </ScoutFrame>
  );
}
