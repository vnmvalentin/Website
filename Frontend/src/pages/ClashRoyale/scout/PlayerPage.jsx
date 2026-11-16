// PlayerPage.jsx — /clash/spieler/:tag: Profil eines Spielers. Kopf mit Arena, Trophäen, Ranked-Stand und Serie,
// darunter fünf Reiter (?reiter=): Übersicht (Deck je Modus, letzte Kämpfe, Ranked, Laufbahn), Kämpfe, Decks,
// Sammlung, Abzeichen (playerTabs.jsx).
// Daten: /api/clash/scout/player/:tag, alle zwei Minuten still aufgefrischt, solange der Tab sichtbar ist.
import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Copy, Star, ThumbsDown, ThumbsUp } from 'lucide-react';
import { TwitchAuthContext } from '../../../components/TwitchAuthContext';
import {
  CrBattle, CrBook, CrCards, CrChat, CrCheck, CrClock, CrCrown, CrRandom, CrCrownBlue, CrCrownRed, CrElixir, CrShield, CrSkull, CrStar, CrSwap, CrTarget, CrTourneyTrophy, CrTrophy, CrTv, CrXp,
} from '../ui/CrIcons';
import collectionLevelImg from '../../../assets/clashRoyale/ui/collection-level.png';
import { MEDAL_ICON_URL, LEAGUE_MEDAL_ICON_URL } from '../data/leagueIcons';
import { trophyArenaIcon, trophyArenaIconByName } from '../data/trophyArenas';
import trophyImg from '../../../assets/clashRoyale/ui/trophy.png';
import battleImg from '../../../assets/clashRoyale/ui/battle.png';
import skullImg from '../../../assets/clashRoyale/ui/sudden_death.webp';
import crownBlueImg from '../../../assets/clashRoyale/ui/blue_crown_1.png';
import trophy2v2Img from '../../../assets/clashRoyale/ui/trophy2v2.webp';
import challengeImg from '../../../assets/clashRoyale/ui/challenge-grand.webp';
import seasonalTrophyImg from '../../../assets/clashRoyale/ui/seasonal-trophy-green.png';
import heroArt from '../../../assets/clashRoyale/bg/evergreen.webp';
import ScoutFrame from './ScoutFrame';
import {
  BannerIcon, ClanLink, ClanWarIcon, CollectionIcon, CountUp, DeckGrid, DeckShare, FormTrail, LoadState, ModeBadge, Panel, RefreshButton, Row, Seg, Sparkline, StarLevelIcon, StreakFlame, Tabs, TowerIcon,
} from './parts';
import { BadgesTab, BattlesTab, CollectionTab, DecksTab, FormTab } from './playerTabs';
import { analyze, deckStats, localDayKey } from './analysis';
import { parseTag, rememberRecent, scoutGet, toggleFavorite, useSaved, useScout } from './scoutApi';
import { fmtDate, fmtDec, fmtNum, fmtPct, timeAgo, useScoutText } from './scoutI18n';
import { deckPath, hasMedals, rankedBadge, rankedName, useTab } from './scoutUtil';

const TAB_IDS = ['uebersicht', 'kaempfe', 'form', 'decks', 'sammlung', 'abzeichen'];

function Plaque({ img, symbol, value, label }) {
  return (
    <div className="crs-well crs-plaque">
      {img ? <img src={img} alt="" draggable={false} /> : symbol}
      <div className="min-w-0">
        <div className="crs-plaque-value">{value}</div>
        <div className="crs-plaque-label">{label}</div>
      </div>
    </div>
  );
}

/** Frühere Namen zum Aufklappen (wie bei Steam): zuletzt getragene zuerst, mit dem Tag, an dem sie zuletzt galten. */
function FormerNames({ names }) {
  const { t, lang } = useScoutText();
  const ref = useRef(null);
  // Klick daneben schließt die Liste
  useEffect(() => {
    const close = (e) => { if (ref.current?.open && !ref.current.contains(e.target)) ref.current.open = false; };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);
  if (!names?.length) return null;
  return (
    <details ref={ref} className="crs-names">
      <summary className="crs-tagchip"><CrClock size={15} /> {t.formerNames(names.length)}</summary>
      <ul className="crs-names-list" title={t.formerNamesHint}>
        {names.map((n) => (
          <li key={n.name}><span className="truncate">{n.name}</span><span className="crs-muted shrink-0">{fmtDate(n.t, lang)}</span></li>
        ))}
      </ul>
    </details>
  );
}

/** Daumen hoch/runter: Zahlen sieht jeder, abstimmen nur mit Twitch-Login. Nochmal tippen nimmt die Stimme zurück. */
function Votes({ tag }) {
  const { t, lang } = useScoutText();
  const { user, login } = useContext(TwitchAuthContext) || {};
  const [votes, setVotes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const userId = user?.id || user?.login || null;

  useEffect(() => {
    const ctrl = new AbortController();
    setVotes(null);
    scoutGet(`/player/${tag}/votes`, { signal: ctrl.signal }).then((res) => { if (res.ok) setVotes(res); });
    return () => ctrl.abort();
  }, [tag, userId]);

  const vote = async (value) => {
    if (!user) { login?.(); return; }
    if (busy || !votes) return;
    const next = votes.mine === value ? 0 : value;
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/clash/scout/player/${tag}/vote`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: next }),
      });
      const json = await res.json().catch(() => null);
      if (json?.ok) setVotes(json); else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  if (!votes) return null;
  const btn = (value, Icon, count, label) => {
    const on = votes.mine === value;
    const title = !user ? t.voteLogin : on ? t.voteUndo : label;
    return (
      <button type="button" className={`crs-tagchip crs-vote${on ? (value > 0 ? ' is-up' : ' is-down') : ''}`} disabled={busy}
        aria-pressed={on} title={title} aria-label={`${label} (${count})`} onClick={() => vote(value)}>
        <Icon size={14} /> {fmtNum(count, lang)}
      </button>
    );
  };
  return (
    <span className="inline-flex items-center gap-2">
      {btn(1, ThumbsUp, votes.up, t.voteUp)}
      {btn(-1, ThumbsDown, votes.down, t.voteDown)}
      {failed && <span className="text-xs text-[#ff8a8a]">{t.voteFailed}</span>}
    </span>
  );
}

function Hero({ profile, analysis, fetchedAt, refreshing, onRefresh }) {
  const { t, lang } = useScoutText();
  const { isFavorite } = useSaved();
  const [copied, setCopied] = useState(false);
  const cur = profile.ranked.current;
  const art = trophyArenaIconByName(profile.arena?.name) || trophyArenaIcon(profile.trophies) || (cur?.league ? rankedBadge(cur.league) : null) || trophyImg;
  const fav = isFavorite('player', profile.tag);
  const lifeRate = profile.wins + profile.losses > 0 ? profile.wins / (profile.wins + profile.losses) : null;
  // Serie aus den gezeigten Kämpfen (analysis.currentStreak) — der Serien-Wert des Profils passt nicht dazu
  const streak = analysis.streak && analysis.streak.n >= 2 ? analysis.streak : null;

  const copyTag = async () => {
    try {
      await navigator.clipboard.writeText(`#${profile.tag}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* Zwischenablage gesperrt */ }
  };

  return (
    <section className="cr-arcade-panel crs-hero cr-anim-rise">
      <div className="crs-hero-top has-art" style={{ '--crs-hero-art': `url(${heroArt})` }}>
        <img className="crs-hero-art" src={art} alt="" draggable={false} />
        <div className="min-w-0 flex-1">
          <h1 className="crs-hero-name">{profile.name}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <button type="button" className="crs-tagchip" onClick={copyTag} title={t.copyTag}>
              #{profile.tag} {copied ? <CrCheck size={14} /> : <Copy size={12} />}
            </button>
            {profile.clan
              ? <ClanLink clan={profile.clan} size={18} className="crs-tagchip" />
              : <span className="crs-tagchip">{t.noClan}</span>}
            <span className="crs-tagchip"><TowerIcon size={17} /> {t.kingLevel(profile.kingTowerLevel || profile.expLevel)}</span>
            <FormerNames names={profile.formerNames} />
            <Votes tag={profile.tag} />
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-2 self-start">
          <button type="button" aria-pressed={fav} title={fav ? t.favRemove : t.favAdd} aria-label={fav ? t.favRemove : t.favAdd}
            onClick={() => toggleFavorite({ kind: 'player', tag: profile.tag, name: profile.name, sub: fmtNum(profile.trophies, lang) })}
            className="cr-chip flex items-center justify-center h-10 w-10 rounded-xl text-white">
            {fav ? <CrStar size={22} /> : <Star size={18} />}
          </button>
          <RefreshButton onClick={onRefresh} busy={refreshing} />
        </div>
      </div>
      <div className="crs-plaques">
        <Plaque img={trophyImg} value={<CountUp value={profile.trophies} />}
          label={profile.arena?.name || `${t.trophies} · ${t.best} ${fmtNum(profile.bestTrophies, lang)}`} />
        <Plaque img={cur?.league ? rankedBadge(cur.league) : MEDAL_ICON_URL}
          value={!cur ? '–' : hasMedals(cur.league) ? <CountUp value={cur.medals} /> : rankedName(cur.league, lang)}
          label={!cur ? t.ranked : hasMedals(cur.league) ? `${t.medals}${cur.rank ? ` · ${t.rankN(fmtNum(cur.rank, lang))}` : ''}` : t.ranked} />
        <Plaque img={crownBlueImg} value={<CountUp value={profile.wins} />} label={`${t.wins}${lifeRate !== null ? ` · ${fmtPct(lifeRate, lang)}` : ''}`} />
        {streak
          ? (streak.result === 'win'
            ? <Plaque symbol={<StreakFlame size={36} />} value={streak.n} label={t.winStreak} />
            : <Plaque img={skullImg} value={streak.n} label={t.lossStreak} />)
          : <Plaque img={battleImg} value={analysis.decided ? fmtPct(analysis.winRate, lang) : '–'} label={t.recentRate(analysis.decided)} />}
      </div>
      <p className="px-4 md:px-[22px] pb-3 -mt-1 text-xs crs-muted">{t.updated(timeAgo(fetchedAt, lang))}</p>
    </section>
  );
}

/**
 * Ein Deck mit Ø Elixier, Cycle und rechts Deck-Seite + Kopieren-Menü (ins Spiel, Link, QR). Die Turmtruppe steht
 * als Bild neben dem Deck — kein eigener Text, keine eigene Knopfzeile mehr darunter.
 */
function DeckBlock({ cards, tower, cap, size = 'lg', compact = false, children }) {
  const { t, lang, q } = useScoutText();
  const { avgElixir, cycle } = deckStats(cards);
  const page = deckPath(cards);
  return (
    <div className="min-w-0">
      {children}
      <DeckGrid cards={cards} tower={tower} cap={cap} size={size} />
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 mt-3">
        <div className="crs-deckmeta">
          {avgElixir !== null && <span><CrElixir size={18} /><b>{fmtDec(avgElixir, lang)}</b>{!compact && ` ${t.avgElixir}`}</span>}
          {cycle !== null && !compact && <span title={t.cycleHint}><CrRandom size={18} /><b>{cycle}</b> {t.cycle}</span>}
        </div>
        <span className="flex flex-wrap items-center gap-2">
          {page && <Link to={`${page}${q}`} className="cr-chip flex items-center h-9 px-3 rounded-xl font-cr text-sm text-white">{t.deckPage}</Link>}
          <DeckShare cards={cards} />
        </span>
      </div>
    </div>
  );
}

/**
 * Das Deck des Spielers je Modus — Ranked zuerst. Das „aktuelle Deck" der API ist nur das zuletzt im Spiel gewählte.
 * Crown Series wird im Duell gespielt: dort steht das ganze Set (bis zu vier Decks ohne gemeinsame Karte).
 */
function DeckPanel({ profile, analysis }) {
  const { t, lang } = useScoutText();
  const options = useMemo(() => {
    const list = analysis.latestDecks.map((d) => ({ id: d.group, label: t.groups[d.group] || d.group, cards: d.cards, tower: d.tower, at: d.t }));
    const set = analysis.crownSet;
    if (set) {
      const crown = { id: 'crown', label: t.groups.crown, set: set.decks, at: set.t };
      const i = list.findIndex((o) => o.id === 'crown');
      if (i >= 0) list[i] = crown; else list.push(crown);
    }
    if (profile.deck.length) list.push({ id: 'profile', label: t.deckInProfile, cards: profile.deck, tower: profile.deckTower, at: null });
    return list;
  }, [analysis.latestDecks, analysis.crownSet, profile.deck, profile.deckTower, t]);
  const [picked, setPicked] = useState(null);
  const deck = options.find((o) => o.id === picked) || options[0];
  if (!deck) return null;
  return (
    <Panel title={deck.set ? t.duelSet : t.deck} icon={deck.set ? <ModeBadge group="crown" size={30} /> : <CrCards size={30} />}
      sub={deck.set ? t.duelSetSub(deck.set.length, timeAgo(deck.at, lang)) : deck.at ? t.lastPlayed(timeAgo(deck.at, lang)) : t.deckInProfileSub}>
      {options.length > 1 && (
        <Seg className="mb-4" label={t.deck} value={deck.id} onChange={setPicked} options={options.map((o) => ({ id: o.id, label: o.label }))} />
      )}
      {deck.set ? (
        <div className="crs-duelset">
          {/* Jedes Deck in einem eigenen Feld mit Nummer, damit die vier Decks nicht ineinanderlaufen */}
          {deck.set.map((d, i) => (
            <div key={i} className="crs-setdeck">
              <DeckBlock cards={d.cards} cap={profile.cap} size="md" compact>
                <div className="crs-setdeck-head">
                  <span className="font-cr text-[1.05rem] text-white">{t.duelDeck(i + 1)}</span>
                  <span className="flex-1" />
                  <span className="text-xs crs-muted crs-num">{t.roundsWon(d.wins, d.rounds)}</span>
                </div>
              </DeckBlock>
            </div>
          ))}
        </div>
      ) : (
        <DeckBlock cards={deck.cards} tower={deck.tower} cap={profile.cap} />
      )}
    </Panel>
  );
}

/** „Heute", „Gestern", sonst Wochentag und Datum. */
function dayLabel(ms, t, lang) {
  const key = localDayKey(ms);
  if (key === localDayKey(Date.now())) return t.today;
  if (key === localDayKey(Date.now() - 86400000)) return t.yesterday;
  return new Date(ms).toLocaleDateString(lang === 'en' ? 'en-US' : 'de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
}

/**
 * Bilanz der letzten Kämpfe als Formkurve: oben die Zahlen, darunter die Kurve (jeder Sieg hebt sie, jede Niederlage
 * senkt sie, jeder Kampf ist ein Punkt), die Bilanz je Modus und der Medaillen-/Trophäenverlauf.
 */
function RecentPanel({ analysis, battlesAvailable, onShowBattles }) {
  const { t, lang } = useScoutText();
  if (!analysis.count) {
    return <Panel title={t.lastBattles} icon={<CrBattle size={30} />}><p className="crs-empty">{battlesAvailable ? t.noBattles : t.battlesDown}</p></Panel>;
  }
  const streak = analysis.streak;
  return (
    <Panel title={t.lastBattles} sub={t.lastBattlesSub(analysis.count)} icon={<CrBattle size={30} />}
      action={<button type="button" onClick={onShowBattles} className="cr-chip h-9 px-3 rounded-xl font-cr text-sm text-white">{t.allBattles}</button>}>
      <div className="crs-formhead">
        <div className="crs-formhead-rate">
          <b className="crs-num">{fmtPct(analysis.winRate, lang)}</b>
          <span>{t.winRate}</span>
        </div>
        <div className="crs-formhead-rec">
          <span className="is-win"><CrCrownBlue size={24} /><b className="crs-num">{analysis.wins}</b> {t.wins}</span>
          <span className="is-loss"><CrCrownRed size={24} /><b className="crs-num">{analysis.losses}</b> {t.losses}</span>
        </div>
        {streak && streak.n >= 2 && (
          <span className={`crs-streak ${streak.result === 'win' ? 'is-win' : 'is-loss'}`}>
            {streak.result === 'win' ? <StreakFlame n={streak.n} size={34} /> : <img src={skullImg} alt="" />}
            {streak.result === 'win' ? t.winStreak : t.lossStreakN(streak.n)}
          </span>
        )}
      </div>

      <FormTrail form={analysis.form} dayLabel={(ms) => dayLabel(ms, t, lang)} />

      {analysis.byGroup.length > 0 && (
        <div className="crs-modepills">
          {analysis.byGroup.map((g) => (
            <span key={g.group} title={t.groups[g.group] || g.group}>
              <ModeBadge group={g.group} size={22} />
              <span className="crs-modepill-name">{t.groups[g.group] || g.group}</span>
              <b className="crs-num"><i className="is-win">{g.wins}</i>–<i className="is-loss">{g.n - g.wins}</i></b>
            </span>
          ))}
          <span title={t.avgCrowns}><CrCrown size={20} /><span className="crs-modepill-name">{t.avgCrowns}</span><b className="crs-num">{fmtDec(analysis.crownsFor, lang)} : {fmtDec(analysis.crownsAgainst, lang)}</b></span>
        </div>
      )}

      {analysis.lines.map((line) => (
        <div key={line.group} className="mt-5">
          <div className="cr-eyebrow mb-1">{t.trend[line.group]}</div>
          <Sparkline points={line.points} />
        </div>
      ))}
    </Panel>
  );
}

const SEASONAL_ICON = { '2v2': trophy2v2Img, seasonalRoad: seasonalTrophyImg };

function RankedPanel({ profile }) {
  const { t, lang } = useScoutText();
  const rows = [
    [t.seasonCurrent, profile.ranked.current],
    [t.seasonLast, profile.ranked.last],
    [t.seasonBest, profile.ranked.best],
  ].filter(([, s]) => s && s.league);
  if (!rows.length && !profile.seasonal.length) return null;
  return (
    <Panel title={t.ranked} icon={<img src={MEDAL_ICON_URL} alt="" className="h-7 w-auto" />}>
      <div className="crs-rows">
        {rows.map(([label, s]) => (
          <Row key={label} icon={<img src={rankedBadge(s.league) || MEDAL_ICON_URL} alt="" className="h-9 w-9 object-contain" />}
            label={rankedName(s.league, lang)} sub={label}
            value={s.medals > 0 ? fmtNum(s.medals, lang) : ''} valueSub={s.rank ? t.rankN(fmtNum(s.rank, lang)) : undefined} />
        ))}
        {profile.seasonal.map((s) => (
          <Row key={s.key} icon={<img src={SEASONAL_ICON[s.kind] || LEAGUE_MEDAL_ICON_URL} alt="" className="h-8 w-8 object-contain" />}
            label={t.seasonalKinds[s.kind] || s.name || s.key} sub={t.seasonalKinds[s.kind] ? s.name : undefined}
            value={fmtNum(s.trophies, lang)} valueSub={s.best > s.trophies ? t.bestShort(fmtNum(s.best, lang)) : undefined} />
        ))}
      </div>
    </Panel>
  );
}

function Career({ profile }) {
  const { t, lang } = useScoutText();
  const n = (v) => fmtNum(v, lang);
  const threeRate = profile.wins ? profile.threeCrownWins / profile.wins : null;
  const winRate = profile.wins + profile.losses > 0 ? profile.wins / (profile.wins + profile.losses) : null;
  // Zähler, die die API nur als Fortschritt eines Abzeichens kennt: Anzahl Emotes, Banner und Tage seit dem Start
  const counter = (name) => { const v = profile.badges?.find((b) => b.name === name)?.progress; return typeof v === 'number' && v > 0 ? v : null; };
  const emotes = counter('EmoteCollection');
  const banners = counter('BannerCollection');
  const days = counter('YearsPlayed');
  return (
    <Panel title={t.career} icon={<CrTrophy size={30} />}>
      <div className="crs-rows">
        <Row icon={<CrBattle size={26} />} label={t.battles} value={n(profile.battleCount)} />
        <Row icon={<img src={crownBlueImg} alt="" className="h-6 w-7 object-contain" />} label={t.wins} value={n(profile.wins)} valueSub={winRate !== null ? fmtPct(winRate, lang) : undefined} />
        <Row icon={<CrCrownRed size={24} />} label={t.losses} value={n(profile.losses)} />
        <Row icon={<CrCrown size={26} />} label={t.threeCrowns} value={n(profile.threeCrownWins)} valueSub={threeRate !== null ? fmtPct(threeRate, lang) : undefined} />
        <Row icon={<img src={challengeImg} alt="" className="h-7 w-7 object-contain" />} label={t.challengeMax}
          value={t.challengeMaxUnit(profile.challengeMaxWins)} valueSub={`${n(profile.challengeCardsWon)} ${t.cardsWon}`} />
        <Row icon={<CrTourneyTrophy size={26} />} label={t.tournaments} value={n(profile.tournamentBattleCount)} />
        <Row icon={<ClanWarIcon size={28} />} label={t.warWins} value={n(profile.warDayWins)} />
        <Row icon={<CrCards size={26} />} label={t.totalDonations} value={n(profile.totalDonations)} valueSub={`${t.donationsWeek}: ${n(profile.donations)}`} />
        <Row icon={<StarLevelIcon size={26} />} label={t.starPoints} value={n(profile.starPoints)} />
        {profile.collectionLevel ? <Row icon={<img src={collectionLevelImg} alt="" className="h-7 w-7 object-contain" />} label={t.collectionLevel} value={n(profile.collectionLevel)} /> : null}
        {profile.legacyBest ? <Row icon={<CrTrophy size={26} />} label={t.legacyBest} value={n(profile.legacyBest)} /> : null}
        {emotes !== null && <Row icon={<CrChat size={26} />} label={t.emotesOwned} value={n(emotes)} />}
        {banners !== null && <Row icon={<BannerIcon size={26} />} label={t.bannersOwned} value={n(banners)} />}
        {days !== null && <Row icon={<CrClock size={26} />} label={t.daysPlayed} value={n(days)} valueSub={t.since(fmtDate(Date.now() - days * 86400000, lang))} />}
      </div>
    </Panel>
  );
}

/** Wege zu den übrigen Clash-Royale-Seiten — eine schmale Zeile, keine eigene Fläche. */
function Tools({ tag }) {
  const { t, q, lang } = useScoutText();
  const items = [
    { to: `/clash/vergleich?a=${tag}${lang === 'en' ? '&lang=en' : ''}`, icon: <CrSwap size={22} />, label: t.toolCompare },
    { to: `/clash-royale/win-tracker${q}`, icon: <CrTv size={22} />, label: t.toolWinTracker },
    { to: `/nuzlocke${q}`, icon: <CrSkull size={22} />, label: t.toolNuzlocke },
  ];
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {items.map((it) => (
        <Link key={it.to} to={it.to} className="cr-chip flex items-center gap-2 h-10 px-3.5 rounded-xl font-cr text-[15px] text-white">{it.icon}{it.label}</Link>
      ))}
    </div>
  );
}

function Overview({ data, analysis, onShowBattles }) {
  const { profile } = data;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid lg:grid-cols-5 gap-4 items-start">
        <div className="lg:col-span-3 flex flex-col gap-4 min-w-0">
          <DeckPanel profile={profile} analysis={analysis} />
          <RecentPanel analysis={analysis} battlesAvailable={data.battlesAvailable} onShowBattles={onShowBattles} />
        </div>
        <div className="lg:col-span-2 flex flex-col gap-4 min-w-0">
          <RankedPanel profile={profile} />
          <Career profile={profile} />
        </div>
      </div>
      <Tools tag={profile.tag} />
    </div>
  );
}

export default function PlayerPage() {
  const { tag: rawTag } = useParams();
  const tag = parseTag(rawTag);
  const { t, lang, q } = useScoutText();
  const { data, error, loading, refreshing, reload } = useScout(tag ? `/player/${tag}` : null, 120000);
  const [tab, setTab] = useTab(TAB_IDS);
  const analysis = useMemo(() => (data ? analyze(data.battles) : null), [data]);
  const profile = data?.profile;

  useEffect(() => {
    if (profile) rememberRecent({ kind: 'player', tag: profile.tag, name: profile.name, sub: fmtNum(profile.trophies, lang) });
  }, [profile, lang]);

  const tabs = [
    { id: 'uebersicht', icon: CrBook, label: t.tabOverview },
    { id: 'kaempfe', icon: CrBattle, label: t.tabBattles },
    // Muster in den Kämpfen (FormInsights.jsx, Ausbauplan „cr-form“)
    { id: 'form', icon: CrTarget, label: t.tabForm },
    { id: 'decks', icon: CrCards, label: t.tabDecks },
    { id: 'sammlung', icon: CollectionIcon, label: t.tabCards },
    { id: 'abzeichen', icon: BannerIcon, label: t.tabBadges },
  ];

  const title = profile ? `${profile.name} (#${profile.tag}) – Clash Royale Stats` : t.homeSeoTitle;
  return (
    // Spielerseiten bleiben aus dem Suchindex (Ausbauplan cr-suche): unzählige Adressen mit Live-Daten ohne festen Inhalt
    <ScoutFrame seo={{ title, description: t.homeSeo, path: `/clash/spieler/${tag || ''}`, noindex: true }}>
      {!tag
        ? <LoadState error="invalidTag" />
        : !data
          ? (
            <LoadState loading={loading} error={error} onRetry={reload}>
              {error === 'notFound' && (
                <p className="text-sm crs-muted">{t.playerNotFound} <Link to={`/clash/clan/${tag}${q}`} className="crs-link text-white underline">{t.tryAsClan}</Link></p>
              )}
            </LoadState>
          )
          : (
            <div className="flex flex-col gap-4">
              <Hero profile={profile} analysis={analysis} fetchedAt={data.fetchedAt} refreshing={refreshing} onRefresh={reload} />
              <div className="flex justify-center"><Tabs tabs={tabs} value={tab} onChange={setTab} /></div>
              <div key={tab} className="cr-anim-rise">
                {tab === 'uebersicht' && <Overview data={data} analysis={analysis} onShowBattles={() => setTab('kaempfe')} />}
                {tab === 'kaempfe' && <BattlesTab data={data} analysis={analysis} />}
                {tab === 'form' && <FormTab tag={profile.tag} />}
                {tab === 'decks' && <DecksTab data={data} analysis={analysis} />}
                {tab === 'sammlung' && <CollectionTab profile={profile} />}
                {tab === 'abzeichen' && <BadgesTab profile={profile} />}
              </div>
            </div>
          )}
    </ScoutFrame>
  );
}
