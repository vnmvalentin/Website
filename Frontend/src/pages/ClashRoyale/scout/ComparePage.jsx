// ComparePage.jsx — /clash/vergleich?a=TAG&b=TAG: zwei Spieler nebeneinander. Kennzahlen mit Balken zur Mitte,
// beide Decks, gemeinsame Karten und direkte Duelle aus den Battlelogs. Die Tags stehen in der Adresse (teilbar).
import React, { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { X } from 'lucide-react';
import { CrCards, CrCrownBlue, CrCrownRed, CrSwap, CrSword, CrUser } from '../ui/CrIcons';
import { ULTIMATE_CHAMPION_LEAGUE } from '../data/leagueIcons';
import swapImg from '../../../assets/clashRoyale/ui/swap.webp';
import bannerArt from '../../../assets/clashRoyale/bg/the_heist.webp';
import ScoutFrame from './ScoutFrame';
import ScoutSearch from './ScoutSearch';
import { Banner, Bar, DeckMeta, DeckRow, LoadState, Panel, PlayerLink, ScoutCard } from './parts';
import { analyze, cardKey, deckStats } from './analysis';
import { parseTag, useSaved, useScout } from './scoutApi';
import { fmtDec, fmtNum, fmtPct, timeAgo, useScoutText } from './scoutI18n';

function Slot({ label, tag, data, onPick, onClear }) {
  const { t } = useScoutText();
  return (
    <div className="min-w-0">
      <div className="cr-eyebrow mb-1.5">{label}</div>
      {tag ? (
        <div className="cr-chip crs-savedchip">
          <CrUser size={28} />
          <span className="min-w-0 flex-1">
            <b>{data?.profile?.name || `#${tag}`}</b>
            <small>#{tag}</small>
          </span>
          <button type="button" className="crs-iconbtn" onClick={onClear} aria-label={`${label}: ${t.remove}`} title={t.remove}><X size={16} /></button>
        </div>
      ) : <ScoutSearch playersOnly onPick={onPick} placeholder={t.searchPh} />}
    </div>
  );
}

/** Eine Zeile: linker Wert, Bezeichnung, rechter Wert — der bessere ist hervorgehoben, die Balken laufen zur Mitte. */
function Row({ label, a, b, format, lowerWins = false }) {
  if (typeof a !== 'number' && typeof b !== 'number') return null;
  const max = Math.max(Math.abs(a || 0), Math.abs(b || 0), 1e-9);
  const better = typeof a !== 'number' || typeof b !== 'number' || a === b ? null : (a > b) !== lowerWins ? 'a' : 'b';
  const side = (v, isBetter) => (
    <div className="crs-cmp-side">
      <span className={`crs-cmp-val crs-num${isBetter ? ' is-better' : ''}`}>{typeof v === 'number' ? format(v) : '–'}</span>
      <Bar value={typeof v === 'number' ? Math.abs(v) / max : 0} color={isBetter ? '#ffc93c' : '#4a6fa5'} />
    </div>
  );
  return (
    <div className="crs-cmp">
      {side(a, better === 'a')}
      <span className="crs-cmp-label">{label}</span>
      {side(b, better === 'b')}
    </div>
  );
}

const collection = (p) => {
  const lv = p.cards.map((c) => c.lvl).filter((l) => typeof l === 'number');
  return { found: p.cards.length, maxed: p.cards.filter((c) => c.maxed).length, avg: lv.length ? lv.reduce((x, y) => x + y, 0) / lv.length : null };
};

function Result({ A, B }) {
  const { t, lang } = useScoutText();
  const a = A.profile;
  const b = B.profile;
  const calc = useMemo(() => {
    const fa = analyze(A.battles);
    const fb = analyze(B.battles);
    // Verglichen wird das zuletzt gespielte Ranked-Deck (sonst das nächste aus dem Log, sonst das im Profil gewählte)
    const da = fa.latestDecks[0] || { cards: a.deck, tower: a.deckTower };
    const db = fb.latestDecks[0] || { cards: b.deck, tower: b.deckTower };
    return {
    fa, fb, da, db, ca: collection(a), cb: collection(b),
    shared: da.cards.filter((c) => db.cards.some((d) => cardKey(d) === cardKey(c))),
    // Direkte Duelle stehen in beiden Logs — das von A reicht, ergänzt um Kämpfe, die nur B noch im Log hat
    duels: [
      ...A.battles.filter((x) => x.opponent.some((p) => p.tag === b.tag)).map((x) => ({ t: x.t, result: x.result, fa: x.team[0].crowns, fb: x.opponent[0].crowns })),
      ...B.battles.filter((x) => x.opponent.some((p) => p.tag === a.tag)).map((x) => ({ t: x.t, result: x.result === 'win' ? 'loss' : x.result === 'loss' ? 'win' : 'draw', fa: x.opponent[0].crowns, fb: x.team[0].crowns })),
    ].filter((d, i, all) => all.findIndex((o) => o.t === d.t) === i).sort((x, y) => y.t - x.t),
    };
  }, [A, B, a, b]);
  const { fa, fb, da, db, ca, cb, shared, duels } = calc;
  const n = (v) => fmtNum(v, lang);
  const pct = (v) => fmtPct(v, lang);
  const dec = (v) => fmtDec(v, lang);
  const life = (p) => (p.wins + p.losses ? p.wins / (p.wins + p.losses) : null);
  const medals = (p) => (p.ranked.current?.league >= ULTIMATE_CHAMPION_LEAGUE ? p.ranked.current.medals : null);

  return (
    <div className="flex flex-col gap-4">
      <Panel>
        <div className="crs-cmp mb-2">
          <PlayerLink tag={a.tag} name={a.name} className="crs-title text-2xl text-right truncate" />
          <span className="crs-cmp-label">{t.vs}</span>
          <PlayerLink tag={b.tag} name={b.name} className="crs-title text-2xl truncate" />
        </div>
        <Row label={t.trophies} a={a.trophies} b={b.trophies} format={n} />
        <Row label={t.best} a={a.bestTrophies} b={b.bestTrophies} format={n} />
        <Row label={t.medals} a={medals(a)} b={medals(b)} format={n} />
        <Row label={t.wins} a={a.wins} b={b.wins} format={n} />
        <Row label={t.winRate} a={life(a)} b={life(b)} format={pct} />
        <Row label={t.cmpFormRate} a={fa.decided ? fa.winRate : null} b={fb.decided ? fb.winRate : null} format={pct} />
        <Row label={t.threeCrowns} a={a.threeCrownWins} b={b.threeCrownWins} format={n} />
        <Row label={t.challengeMax} a={a.challengeMaxWins} b={b.challengeMaxWins} format={n} />
        <Row label={t.cmpCollection} a={ca.found} b={cb.found} format={n} />
        <Row label={t.maxed} a={ca.maxed} b={cb.maxed} format={n} />
        <Row label={t.avgLevel} a={ca.avg} b={cb.avg} format={dec} />
        <Row label={t.leaked} a={fa.leaked?.mine ?? null} b={fb.leaked?.mine ?? null} format={dec} lowerWins />
        <Row label={t.totalDonations} a={a.totalDonations} b={b.totalDonations} format={n} />
      </Panel>

      <div className="grid lg:grid-cols-2 gap-4">
        {[[a, da], [b, db]].map(([p, d]) => d.cards.length > 0 && (
          <Panel key={p.tag} title={p.name} sub={d.group ? t.groups[d.group] : t.deckInProfile} icon={<CrCards size={28} />}>
            <DeckRow cards={d.cards} cap={p.cap} link className="crs-deck--grid4 mb-3" />
            <DeckMeta cards={d.cards} tower={d.tower} />
          </Panel>
        ))}
      </div>

      <Panel title={t.sharedCards} sub={shared.length ? `${shared.length} / 8` : undefined}>
        {shared.length ? (
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 max-w-xl">
            {shared.map((c) => <ScoutCard key={cardKey(c)} card={c} link level={false} />)}
          </div>
        ) : <p className="text-sm crs-muted">{t.noShared}</p>}
        {deckStats(da.cards).avgElixir !== null && deckStats(db.cards).avgElixir !== null && (
          <div className="mt-3"><Row label={t.avgElixir} a={deckStats(da.cards).avgElixir} b={deckStats(db.cards).avgElixir} format={dec} lowerWins /></div>
        )}
      </Panel>

      <Panel title={t.headToHead} icon={<CrSword size={28} />}>
        {duels.length ? (
          <div className="flex flex-col gap-1.5">
            {duels.map((d) => (
              <div key={d.t} className="cr-row grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-3 py-2">
                <span className={`text-right font-semibold truncate ${d.result === 'win' ? 'text-white' : 'text-white/45'}`}>{a.name}</span>
                <span className="flex items-center gap-1.5 font-cr text-lg text-white crs-num"><CrCrownBlue size={18} />{d.fa} : {d.fb}<CrCrownRed size={18} /></span>
                <span className="flex items-center justify-between gap-3 min-w-0">
                  <span className={`font-semibold truncate ${d.result === 'loss' ? 'text-white' : 'text-white/45'}`}>{b.name}</span>
                  <span className="text-xs crs-muted whitespace-nowrap">{timeAgo(d.t, lang)}</span>
                </span>
              </div>
            ))}
          </div>
        ) : <p className="text-sm crs-muted">{t.headToHeadNone}</p>}
      </Panel>
    </div>
  );
}

export default function ComparePage() {
  const { t } = useScoutText();
  const [params, setParams] = useSearchParams();
  const tagA = parseTag(params.get('a'));
  const tagB = parseTag(params.get('b'));
  const { favorites, recent } = useSaved();
  const A = useScout(tagA ? `/player/${tagA}` : null);
  const B = useScout(tagB ? `/player/${tagB}` : null);

  const set = (key, tag) => setParams((prev) => {
    const next = new URLSearchParams(prev);
    if (tag) next.set(key, tag); else next.delete(key);
    return next;
  }, { replace: true });
  const swap = () => setParams((prev) => {
    const next = new URLSearchParams(prev);
    next.delete('a'); next.delete('b');
    if (tagB) next.set('a', tagB);
    if (tagA) next.set('b', tagA);
    return next;
  }, { replace: true });

  // Schnellwahl: Favoriten und zuletzt Angesehenes, ohne die schon gewählten
  const quick = [...favorites, ...recent]
    .filter((e, i, all) => e.kind === 'player' && e.tag !== tagA && e.tag !== tagB && all.findIndex((o) => o.kind === 'player' && o.tag === e.tag) === i)
    .slice(0, 8);
  const freeKey = !tagA ? 'a' : !tagB ? 'b' : null;

  return (
    <ScoutFrame noSearch seo={{ title: t.compareTitle, description: t.compareSeo, path: '/clash/vergleich' }}>
      <Banner art={bannerArt} badge={<img src={swapImg} alt="" />} title={t.compareTitle} sub={t.compareSub} />
      <Panel className="relative z-20 my-4">
        <div className="grid sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-3">
          <Slot label={t.playerA} tag={tagA} data={A.data} onPick={(it) => set('a', it.tag)} onClear={() => set('a', null)} />
          <button type="button" className="cr-chip flex items-center justify-center h-11 w-11 rounded-xl text-white justify-self-center" onClick={swap} title={t.swap} aria-label={t.swap}>
            <CrSwap size={22} />
          </button>
          <Slot label={t.playerB} tag={tagB} data={B.data} onPick={(it) => set('b', it.tag)} onClear={() => set('b', null)} />
        </div>
        {freeKey && quick.length > 0 && (
          <div className="mt-4">
            <div className="cr-eyebrow mb-1.5">{t.pickHint}</div>
            <div className="flex flex-wrap gap-2">
              {quick.map((e) => (
                <button key={e.tag} type="button" className="crs-tagchip" onClick={() => set(freeKey, e.tag)}>{e.name || `#${e.tag}`}</button>
              ))}
            </div>
          </div>
        )}
      </Panel>

      {tagA && tagB && (
        A.data && B.data
          ? <Result A={A.data} B={B.data} />
          : <LoadState loading={A.loading || B.loading} error={A.error || B.error} onRetry={() => { A.reload(); B.reload(); }} />
      )}
    </ScoutFrame>
  );
}
