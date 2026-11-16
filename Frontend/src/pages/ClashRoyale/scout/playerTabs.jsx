// playerTabs.jsx — die Reiter der Spielerseite neben der Übersicht: Kämpfe (beide Decks wie im Spiel), Decks,
// Sammlung (Aufwert-Rechnung aus upgradePlan.js, alle Evolutionen und Helden, Turmtruppen) und Abzeichen.
import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { ALL_CARDS } from '../data/cards';
import { CrCards, CrCrown, CrCrownBlue, CrCrownRed, CrSkull, CrStar, CrTrophy } from '../ui/CrIcons';
import { MEDAL_ICON_URL, LEAGUE_MEDAL_ICON_URL, ULTIMATE_CHAMPION_LEAGUE } from '../data/leagueIcons';
import spookyChessImg from '../../../assets/clashRoyale/ui/spooky-chess.webp';
import league2v2Img from '../../../assets/clashRoyale/badges/league2v2.png';
import tripleDraftImg from '../../../assets/clashRoyale/ui/icon_triple_draft.png';
import suddenDeathImg from '../../../assets/clashRoyale/ui/sudden_death.webp';
import crlImg from '../../../assets/clashRoyale/badges/crl.webp';
import tourneyImg from '../../../assets/clashRoyale/ui/tourney_trophy.webp';
import starImg from '../../../assets/clashRoyale/ui/star.webp';
import trophyImg from '../../../assets/clashRoyale/ui/trophy.png';
import {
  BannerIcon, Bar, CardArt, CollectionIcon, ClanLink, DeckGrid, DeckLine, EvoShard, Fig, GoldCoin, HeroShard, LoadState, ModeBadge, Panel, PlayerLink, Row, ScoutCard,
  Seg, SortControl, StarLevelIcon, TowerIcon, UpgradeArrow,
} from './parts';
import FormInsights from './FormInsights';
import { typeCard } from './matchupUtil';
import { cardKey, deckFit, deckKey, rankedChange } from './analysis';
import { collectionPlan, planFor, supported } from './upgradePlan';
import { scoutGet, useScout } from './scoutApi';
import { fmtDate, fmtDec, fmtNum, fmtPct, prettyMode, timeAgo, useScoutText } from './scoutI18n';
import { gameForms, localCard, rankedBadge, rankedName, sortBy } from './scoutUtil';

const GOOD = '#7ee79a';
const BAD = '#ff8f91';

// ── Kämpfe ───────────────────────────────────────────────────────────────────
/**
 * Eine Seite eines Kampfes: je Spieler Name, darunter sein Clan mit Wappen (beides klickbar), und das Deck wie im Spiel (4 × 2, Turmtruppe daneben). Im Duell
 * (Crown Series, Clankriegs-Duell) steht jede Runde mit ihrem eigenen Deck untereinander.
 */
// Modi, in denen die API als „Stand vor dem Kampf“ (startingTrophies) die bisherigen Siege zählt statt Trophäen
const WIN_COUNT_GROUPS = new Set(['crown', 'party', 'challenge', 'tournament']);

/**
 * Stand eines Spielers VOR dem Kampf: Ranked = Medaillen (bei Top-Spielern dazu der Weltrang), Crown Series/Events/
 * Challenge/Turnier = Siege bisher, sonst Trophäen. In Challenges nennt die API die Siege nur für den eigenen Spieler
 * (challengeWinCountBefore) — die kommen über `wins` herein.
 */
function Stand({ p, group, wins = null }) {
  const { t, lang } = useScoutText();
  if (WIN_COUNT_GROUPS.has(group)) {
    const n = typeof p.start === 'number' ? p.start : wins;
    return typeof n === 'number' ? <span className="crs-battle-stand" title={t.standBefore}>{t.winsBefore(n)}</span> : null;
  }
  if (typeof p.start !== 'number') return null;
  const ranked = group === 'ranked';
  return (
    <span className="crs-battle-stand" title={t.standBefore}>
      <img src={ranked ? MEDAL_ICON_URL : trophyImg} alt="" />{fmtNum(p.start, lang)}
      {ranked && typeof p.rank === 'number' && <small>#{fmtNum(p.rank, lang)}</small>}
    </span>
  );
}

function Side({ players, cap, rounds, group, challengeWins = null, theirs = false }) {
  const { t } = useScoutText();
  return (
    <div className={`crs-battle-side${theirs ? ' is-theirs' : ''}`}>
      {players.map((p, i) => (
        <div key={p.tag || p.name} className="min-w-0">
          <div className="crs-battle-who">
            <PlayerLink tag={p.tag} name={p.name} />
            {p.clan && <ClanLink clan={p.clan} size={16} className="crs-battle-clan" />}
            <Stand p={p} group={group} wins={!theirs && i === 0 ? challengeWins : null} />
          </div>
          {p.decks?.length > 1 ? (
            <div className="flex flex-col gap-3">
              {p.decks.map((cards, i) => {
                const r = rounds?.[i];
                const won = r ? (theirs ? r.a > r.f : r.f > r.a) : null;
                return (
                  <div key={i}>
                    <div className={`crs-round${won === true ? ' is-win' : won === false ? ' is-loss' : ''}`}>
                      {t.roundN(i + 1)}{r ? <b className="crs-num">{theirs ? `${r.a}:${r.f}` : `${r.f}:${r.a}`}</b> : null}
                    </div>
                    <DeckGrid cards={cards} cap={cap} size="md" />
                  </div>
                );
              })}
            </div>
          ) : (
            <DeckGrid cards={p.cards} tower={p.tower} cap={cap} size="md" />
          )}
        </div>
      ))}
    </div>
  );
}

function VsRow({ label, mine, theirs, better }) {
  if (mine === null && theirs === null) return null;
  return (
    <div className="crs-vsrow">
      <b className={`crs-num${better === 'mine' ? ' is-better' : ''}`}>{mine ?? '–'}</b>
      <span>{label}</span>
      <b className={`crs-num${better === 'theirs' ? ' is-better' : ''}`}>{theirs ?? '–'}</b>
    </div>
  );
}

function BattleMore({ b }) {
  const { t, lang } = useScoutText();
  const me = b.team[0];
  const opp = b.opponent[0];
  const num = (v) => (typeof v === 'number' ? fmtNum(v, lang) : null);
  const dec = (v) => (typeof v === 'number' ? fmtDec(v, lang) : null);
  const towers = (p) => (p.princessHp.length ? p.princessHp.map((h) => fmtNum(h, lang)).join(' · ') : p.kingHp !== null ? t.destroyed : null);
  const cmp = (a, c, lowerWins = false) => (typeof a !== 'number' || typeof c !== 'number' || a === c ? null : (a > c) !== lowerWins ? 'mine' : 'theirs');
  return (
    <div className="crs-battle-more">
      <VsRow label={t.avgCardLevel} mine={dec(me.avgLevel)} theirs={dec(opp.avgLevel)} better={cmp(me.avgLevel, opp.avgLevel)} />
      <VsRow label={t.leaked} mine={dec(me.leaked)} theirs={dec(opp.leaked)} better={cmp(me.leaked, opp.leaked, true)} />
      <VsRow label={t.kingTower} mine={num(me.kingHp)} theirs={num(opp.kingHp)} better={cmp(me.kingHp, opp.kingHp)} />
      <VsRow label={t.princessTowers} mine={towers(me)} theirs={towers(opp)} />
      {(typeof me.rank === 'number' || typeof opp.rank === 'number') && <VsRow label={t.rankAtBattle} mine={num(me.rank)} theirs={num(opp.rank)} better={cmp(me.rank, opp.rank, true)} />}
      {b.arena && <p className="text-xs crs-muted text-center mt-2">{b.arena}{b.mode ? ` · ${prettyMode(b.mode)}` : ''}</p>}
    </div>
  );
}

/**
 * Duell (Crown Series, Clankriegs-Duell): oben die Spieler und das Gesamtergebnis in Runden, darunter jede Runde als
 * eigene Zeile — eigenes Deck links, Rundenergebnis in der Mitte, Deck des Gegners rechts —, klar voneinander getrennt.
 */
function DuelBody({ b, cap }) {
  const { t } = useScoutText();
  const me = b.team[0];
  const opp = b.opponent[0];
  const won = b.rounds.filter((r) => r.f > r.a).length;
  const lost = b.rounds.filter((r) => r.f < r.a).length;
  const who = (p, theirs) => (
    <div className={`crs-battle-who${theirs ? ' is-theirs' : ''}`}>
      <PlayerLink tag={p.tag} name={p.name} />
      {p.clan && <ClanLink clan={p.clan} size={16} className="crs-battle-clan" />}
      <Stand p={p} group={b.group} wins={theirs ? null : b.challengeWins} />
    </div>
  );
  return (
    <div className="crs-duel">
      <div className="crs-duel-top">
        {who(me, false)}
        <div className="crs-battle-mid">
          <ModeBadge group={b.group} size={46} />
          <div className="crs-battle-score crs-num"><CrCrownBlue size={26} /> {won} : {lost} <CrCrownRed size={26} /></div>
          <span className="text-xs crs-muted">{t.roundsLabel}</span>
        </div>
        {who(opp, true)}
      </div>
      {b.rounds.map((r, i) => {
        const res = r.f > r.a ? 'win' : r.f < r.a ? 'loss' : 'draw';
        return (
          <div key={i} className={`crs-duel-round is-${res}`}>
            <DeckGrid cards={me.decks?.[i] || []} cap={cap} size="md" />
            <div className="crs-duel-mid">
              <span className="crs-duel-label">{t.roundN(i + 1)}</span>
              <b className="crs-num">{r.f}<i>:</i>{r.a}</b>
              <span className="crs-duel-res">{t[res] || t.draw}</span>
            </div>
            <div className="crs-duel-theirs"><DeckGrid cards={opp.decks?.[i] || []} cap={cap} size="md" /></div>
          </div>
        );
      })}
    </div>
  );
}

function BattleRow({ b, cap }) {
  const { t, lang } = useScoutText();
  const [open, setOpen] = useState(false);
  const me = b.team[0];
  const opp = b.opponent[0];
  if (!me || !opp) return null;
  const detail = b.challengeTitle || (b.group === 'party' || b.group === 'challenge' ? prettyMode(b.mode) : '');
  // Im Duell zählen gewonnene Runden, nicht die Summe der Kronen
  const won = b.rounds ? b.rounds.filter((r) => r.f > r.a).length : null;
  const lost = b.rounds ? b.rounds.filter((r) => r.f < r.a).length : null;
  // Duell mit Runden-Decks (1 gegen 1): eigene Darstellung Runde für Runde
  const isDuel = !!b.rounds && b.team.length === 1 && b.opponent.length === 1 && (me.decks?.length > 1 || opp.decks?.length > 1);
  // Ranked: Stufe (Liga 1–6) bzw. Medaillen (UC) statt der rohen API-Zahl, über dem Ergebnis die Liga des Kampfs
  const ranked = rankedChange(b);
  const league = b.group === 'ranked' ? (b.league || (ranked?.kind === 'medals' ? ULTIMATE_CHAMPION_LEAGUE : null)) : null;
  return (
    <article className={`crs-battle is-${b.result}`}>
      {/* Kopfzeile: Ergebnis und Modus links, Zeit und Aufklapp-Knopf rechts */}
      <div className="crs-battle-head">
        <span className="crs-battle-res">{t[b.result] || t.draw}</span>
        <span className="text-sm font-semibold text-white/90">{t.groups[b.group] || b.group}</span>
        {detail && <span className="text-xs crs-muted truncate">{detail}</span>}
        <span className="flex-1" />
        <span className="text-xs crs-muted whitespace-nowrap">{timeAgo(b.t, lang)}</span>
        <button type="button" className="crs-iconbtn" aria-expanded={open} onClick={() => setOpen((v) => !v)}
          title={open ? t.hideDetails : t.showDetails} aria-label={open ? t.hideDetails : t.showDetails}>
          <ChevronDown size={18} />
        </button>
      </div>
      {isDuel ? <DuelBody b={b} cap={cap} /> : (
      <div className="crs-battle-main">
        <Side players={b.team} cap={cap} rounds={b.rounds} group={b.group} challengeWins={b.challengeWins} />
        <div className="crs-battle-mid">
          {league ? (
            <img src={rankedBadge(league)} alt={rankedName(league, lang)} title={t.battleLeague(rankedName(league, lang))}
              draggable={false} className="inline-block shrink-0 object-contain" style={{ width: 46, height: 46 }} />
          ) : <ModeBadge group={b.group} size={46} />}
          <div className="crs-battle-score crs-num">
            <CrCrownBlue size={26} /> {won !== null ? won : me.crowns} : {lost !== null ? lost : opp.crowns} <CrCrownRed size={26} />
          </div>
          {won !== null && <span className="text-xs crs-muted">{t.roundsLabel}</span>}
          {ranked ? (
            <span className={`crs-change ${ranked.delta > 0 ? 'is-up' : 'is-down'}`} title={ranked.kind === 'steps' ? t.stepHint : undefined}>
              {ranked.kind === 'medals' && <img src={MEDAL_ICON_URL} alt="" />}
              {ranked.delta > 0 ? '+' : ''}{ranked.delta}
              {ranked.kind === 'steps' && <small>{t.stepUnit}</small>}
            </span>
          ) : b.group !== 'ranked' && typeof me.change === 'number' && me.change !== 0 && b.group !== 'crown' && (
            <span className={`crs-change ${me.change > 0 ? 'is-up' : 'is-down'}`}>
              <img src={trophyImg} alt="" />
              {me.change > 0 ? '+' : ''}{me.change}
            </span>
          )}
        </div>
        <Side players={b.opponent} cap={cap} rounds={b.rounds} group={b.group} theirs />
      </div>
      )}
      {open && <BattleMore b={b} />}
    </article>
  );
}

export function BattlesTab({ data }) {
  const { t, lang } = useScoutText();
  const [group, setGroup] = useState('all');
  // Ältere Kämpfe aus dem Verlauf des Servers, seitenweise nachgeladen
  const [older, setOlder] = useState({ list: [], more: true, busy: false, failed: false });
  const { profile } = data;
  const battles = useMemo(() => {
    const seen = new Set(data.battles.map((b) => b.t));
    return [...data.battles, ...older.list.filter((b) => !seen.has(b.t))];
  }, [data.battles, older.list]);
  const groups = useMemo(() => ['all', ...new Set(battles.map((b) => b.group))], [battles]);
  const list = group === 'all' || !groups.includes(group) ? battles : battles.filter((b) => b.group === group);
  const stored = data.history?.n ?? battles.length;
  const canLoadMore = older.more && stored > battles.length;

  const loadMore = async () => {
    const last = battles[battles.length - 1];
    if (!last || older.busy) return;
    setOlder((o) => ({ ...o, busy: true, failed: false }));
    const res = await scoutGet(`/player/${profile.tag}/battles?vor=${last.t}`);
    setOlder((o) => (res.ok
      ? { list: [...o.list, ...res.battles], more: res.more, busy: false, failed: false }
      : { ...o, busy: false, failed: true }));
  };

  if (!battles.length) return <Panel><p className="crs-empty">{data.battlesAvailable ? t.noBattles : t.battlesDown}</p></Panel>;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {groups.length > 2 ? (
          <Seg className="max-w-full" label={t.tabBattles} value={groups.includes(group) ? group : 'all'} onChange={setGroup}
            options={groups.map((g) => ({ id: g, label: t.groups[g] || g }))} />
        ) : <span />}
        <span className="text-xs crs-muted">{t.historyNote(fmtNum(stored, lang), data.history?.oldest ? fmtDate(data.history.oldest, lang) : null)}</span>
      </div>
      {list.map((b, i) => <BattleRow key={`${b.t}-${i}`} b={b} cap={profile.cap} />)}
      {canLoadMore && (
        <button type="button" className="cr-arcade-btn cr-arcade-btn--sm cr-arcade-btn--blue self-center mt-1" onClick={loadMore} disabled={older.busy}>
          {older.busy ? t.loading : older.failed ? t.retry : t.loadOlder}
        </button>
      )}
    </div>
  );
}

// ── Form ─────────────────────────────────────────────────────────────────────
/**
 * Muster in den Kämpfen (Ausbauplan „cr-form“): aus dem ganzen gespeicherten Verlauf, nicht nur den geladenen Kämpfen
 * — der Server rechnet (/player/:tag/form, Backend lib/formPatterns.js). Tageszeit in der Zeitzone dieses Geräts.
 */
export function FormTab({ tag }) {
  const { t, lang } = useScoutText();
  const [group, setGroup] = useState('all');
  const tz = useMemo(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { return ''; }
  }, []);
  const { data, error, loading, reload } = useScout(`/player/${tag}/form?gruppe=${group}&tz=${encodeURIComponent(tz)}`);
  if (!data) return <LoadState loading={loading} error={error} onRetry={reload} />;
  const groups = data.groups || [];
  return (
    <div className="flex flex-col gap-3">
      {groups.length > 1 && (
        <Seg className="max-w-full self-start" label={t.tabForm} value={group} onChange={setGroup}
          options={[{ id: 'all', label: t.groups.all }, ...groups.map((g) => ({ id: g.group, label: t.groups[g.group] || g.group }))]} />
      )}
      <FormInsights patterns={data.patterns} lang={lang} fromText={data.patterns?.from ? fmtDate(data.patterns.from, lang) : null} />
      <OwnTypes types={data.types} overall={data.patterns?.winRate ?? null} />
    </div>
  );
}

// Matchup-Ratgeber im Profil: ab so vielen Kämpfen gegen einen Deck-Typ eine Zeile, so viele Zeilen höchstens.
// Farbig wie in FormInsights erst ab 10 Kämpfen und 10 Punkten Abstand zur eigenen Gesamtquote. Die Quote bei den
// Besten erst ab 30 Kämpfen — darunter springt sie zwischen 0 und 100 %.
const OWN_MIN = 3;
const OWN_SHOWN = 6;
const OWN_TOP_MIN = 30;

/**
 * „Deine schwersten Gegner“: eigene Bilanz gegen Deck-Typen (Win-Condition des Gegners), schwächste zuerst, darunter
 * die Quote von Decks desselben Typs wie das aktuelle bei den Besten — so sieht man, ob es am Matchup liegt oder am
 * eigenen Spiel.
 * Server: /player/:tag/form → types (Backend scoutMatchups.ownTypes).
 */
function OwnTypes({ types, overall }) {
  const { t, lang } = useScoutText();
  const list = (types?.list || [])
    .filter((e) => e.n >= OWN_MIN)
    .sort((a, b) => a.wins / a.n - b.wins / b.n || b.n - a.n)
    .slice(0, OWN_SHOWN);
  if (!list.length) return null;
  const top = (e) => (e.global && e.global.n >= OWN_TOP_MIN ? e.global.wins / e.global.n : null);
  const hasTop = list.some((e) => top(e) !== null);
  return (
    <Panel title={t.muOwnTitle} sub={t.muOwnSub} icon={<CrSkull size={30} />}>
      <div className="crs-murows">
        {list.map((e) => {
          const card = typeCard(e.type);
          const r = e.wins / e.n;
          const color = overall === null || e.n < 10 ? undefined : r >= overall + 0.1 ? GOOD : r <= overall - 0.1 ? BAD : undefined;
          return (
            <div key={e.type} className="crs-murow">
              <ScoutCard card={card} size="sm" level={false} link={!!card.id} />
              <div className="min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <b className="truncate text-sm text-white">{card.name}</b>
                  <span className="text-xs crs-muted crs-num whitespace-nowrap">{t.record(e.wins, e.n - e.wins)}</span>
                </div>
                <Bar value={r} split className="mt-1.5" />
                {hasTop && (
                  <span className="block mt-1 text-[11px] crs-muted crs-num" title={t.muOwnTopHint}>
                    {t.muOwnTop}: {top(e) !== null ? fmtPct(top(e), lang) : '–'}
                  </span>
                )}
              </div>
              <b className="font-cr text-lg leading-none text-right crs-num" style={color ? { color } : undefined}>{fmtPct(r, lang)}</b>
            </div>
          );
        })}
      </div>
      {hasTop && <p className="text-xs crs-muted mt-4">{t.muOwnRefType(typeCard(types.deckType).name)}</p>}
    </Panel>
  );
}

// ── Decks ────────────────────────────────────────────────────────────────────
const SHOW_DECKS = 5;

export function DecksTab({ data, analysis }) {
  const { t, lang, q } = useScoutText();
  const { profile } = data;
  const { data: metaRes } = useScout('/meta');
  const meta = metaRes?.meta;
  const [all, setAll] = useState(false);

  // Decks der Besten, die mit der eigenen Sammlung spielbar sind — die mit den höchsten eigenen Leveln zuerst
  const fits = useMemo(() => {
    if (!meta?.decks?.length) return [];
    const owned = new Map(profile.cards.map((c) => [cardKey(c), c]));
    return meta.decks
      .map((d) => ({ deck: d, fit: deckFit(d.cards, owned) }))
      .filter((x) => x.fit.missing.length === 0 && x.fit.avgLevel !== null)
      .sort((a, b) => b.fit.avgLevel - a.fit.avgLevel || b.deck.uses - a.deck.uses)
      .slice(0, 5)
      .map((x) => ({ ...x, cards: x.deck.cards.map((c) => ({ ...c, lvl: owned.get(cardKey(c))?.lvl ?? null })) }));
  }, [meta, profile.cards]);
  const metaByKey = useMemo(() => new Map((meta?.decks || []).map((d) => [deckKey(d.cards), d])), [meta]);
  const shown = all ? analysis.decks : analysis.decks.slice(0, SHOW_DECKS);

  return (
    <div className="flex flex-col gap-4">
      <Panel title={t.decksPlayed} sub={t.decksPlayedSub} icon={<CrCards size={30} />}>
        {analysis.decks.length ? (
          <div className="flex flex-col gap-2.5">
            {shown.map((d) => {
              const top = metaByKey.get(d.key);
              return (
                <DeckLine key={d.key} cards={d.cards} cap={profile.cap} tower={d.tower}
                  figures={[{ value: fmtPct(d.winRate, lang), label: t.winRate, tone: d.n >= 3 ? (d.winRate >= 0.5 ? GOOD : BAD) : undefined }]}>
                  {t.games(d.n)} · {t.record(d.wins, d.n - d.wins)} · {d.groups.map((g) => t.groups[g] || g).join(', ')}
                  {top && <span className="block text-[#ffd65c]">{t.metaYourDeck(top.uses, fmtPct(top.winRate, lang))}</span>}
                </DeckLine>
              );
            })}
            {analysis.decks.length > SHOW_DECKS && !all && (
              <button type="button" className="cr-arcade-btn cr-arcade-btn--sm cr-arcade-btn--blue self-center mt-1" onClick={() => setAll(true)}>
                {t.showMore} ({analysis.decks.length - SHOW_DECKS})
              </button>
            )}
          </div>
        ) : <p className="crs-empty">{t.noDecks}</p>}
      </Panel>
      {fits.length > 0 && (
        <Panel title={t.metaForYou} sub={t.metaForYouSub} icon={<CrCrown size={30} />}
          action={<Link to={`/clash/decks${q}`} className="cr-chip flex items-center h-9 px-3 rounded-xl font-cr text-sm text-white">{t.allDecks}</Link>}>
          <div className="flex flex-col gap-2.5">
            {fits.map(({ deck, fit, cards }) => (
              <DeckLine key={deckKey(deck.cards)} cards={cards} cap={profile.cap}
                figures={[{ value: fmtDec(fit.avgLevel, lang), label: t.yourAvg }, { value: fmtPct(deck.winRate, lang), label: t.winRate }]}>
                {t.weakest(fit.minLevel)} · {t.topUses(deck.uses)}
              </DeckLine>
            ))}
          </div>
        </Panel>
      )}
      {!fits.length && (
        <p className="text-center text-sm"><Link to={`/clash/decks${q}`} className="crs-link text-white/80">{t.allDecks}</Link></p>
      )}
    </div>
  );
}

// ── Sammlung ─────────────────────────────────────────────────────────────────
const RARITY_ORDER = { Common: 0, Rare: 1, Epic: 2, Legendary: 3, Champion: 4 };
const READY_SHOWN = 16;

/**
 * Alle Evolutionen bzw. Helden des Spiels mit ihrem eigenen Bild: was der Spieler freigeschaltet hat in Farbe,
 * der Rest ausgegraut. Freigeschaltetes zuerst.
 * @param {Array<{ card: object, owned: boolean }>} list
 */
function FormGrid({ title, icon, list }) {
  const { q } = useScoutText();
  if (!list.length) return null;
  const have = list.filter((f) => f.owned).length;
  return (
    <Panel title={title} icon={icon} action={<span className="crs-count"><b>{have}</b> / {list.length}</span>}>
      <div className="crs-formgrid">
        {list.map(({ card, owned, base }) => (
          <ScoutCard key={card.name} card={card} level={false} missing={!owned} link={false}>
            <span className="crs-card-count">{base.id ? <Link className="crs-link" to={`/clash/karten/${base.id}${q}`}>{card.name}</Link> : card.name}</span>
          </ScoutCard>
        ))}
      </div>
    </Panel>
  );
}

export function CollectionTab({ profile }) {
  const { t, lang } = useScoutText();
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState({ by: 'level', dir: 'desc' });
  const { data: catalog } = useScout('/catalog');
  const cap = profile.cap;
  const planOk = supported(cap);
  const n = (v) => fmtNum(v, lang);

  const calc = useMemo(() => {
    const have = new Set(profile.cards.map((c) => cardKey(c)));
    const levels = new Map();
    for (const c of profile.cards) if (typeof c.lvl === 'number') levels.set(c.lvl, (levels.get(c.lvl) || 0) + 1);
    const withLevel = profile.cards.filter((c) => typeof c.lvl === 'number');
    const plan = planOk ? collectionPlan(profile.cards) : null;
    // Turmtruppen werten nach derselben Tabelle auf wie Karten ihrer Seltenheit — eigene Zeile, eigene Summe
    const towerPlan = planOk ? collectionPlan(profile.towerCards) : null;
    return {
      // Karte + ihr Aufwert-Plan (null, wenn die Tabellen für dieses Höchstlevel nicht gelten)
      owned: profile.cards.map((c) => ({ card: c, plan: planOk ? planFor(c) : null })),
      towers: profile.towerCards.map((c) => ({ card: c, plan: planOk ? planFor(c) : null })),
      haveKeys: have,
      spread: [...levels.entries()].sort((a, b) => b[0] - a[0]),
      avg: withLevel.length ? withLevel.reduce((s, c) => s + c.lvl, 0) / withLevel.length : null,
      maxed: profile.cards.filter((c) => c.maxed).length,
      plan,
      towerPlan,
      ready: plan ? [...plan.ready, ...(towerPlan?.ready || [])] : [],
      readyGold: plan ? plan.readyGold + (towerPlan?.readyGold || 0) : 0,
      goldToMax: plan ? plan.goldToMax + (towerPlan?.goldToMax || 0) : 0,
      towerRow: towerPlan && profile.towerCards.length ? {
        cards: profile.towerCards.length,
        maxed: towerPlan.byRarity.reduce((s, r) => s + r.maxed, 0),
        missingCards: towerPlan.byRarity.reduce((s, r) => s + r.missingCards, 0),
      } : null,
    };
  }, [profile.cards, profile.towerCards, planOk]);

  // Evolutionen und Helden: was es im Spiel gibt (Katalog) gegen das, was der Spieler freigeschaltet hat.
  // Karten, die der Spieler noch nicht gefunden hat, kommen aus dem Katalog bzw. unserer Kartenliste.
  const special = useMemo(() => {
    const game = gameForms(catalog);
    const mine = new Map(profile.cards.map((c) => [cardKey(c), c]));
    const list = (which) => game[which]
      .map((f) => ({ card: { id: null, name: f.name, icon: f.icon }, base: f, owned: !!mine.get(cardKey(f))?.forms?.some((x) => x.id === which && x.owned) }))
      .sort((a, b) => Number(b.owned) - Number(a.owned) || a.card.name.localeCompare(b.card.name));
    const missing = [
      ...ALL_CARDS.filter((c) => !mine.has(c.id)).map((c) => localCard(c.id)),
      ...game.unknown.filter((c) => !mine.has(cardKey(c))).map((c) => ({ id: null, name: c.name, icon: c.icon, rarity: c.rarity, elixir: c.elixir })),
    ];
    return { ev1: list('ev1'), hero: list('hero'), missing };
  }, [catalog, profile.cards]);

  const { owned, spread, plan } = calc;
  const { missing } = special;
  const total = owned.length + missing.length;
  const peak = Math.max(1, ...spread.map(([, count]) => count));
  const evoOwned = special.ev1.filter((f) => f.owned).length;
  const heroOwned = special.hero.filter((f) => f.owned).length;

  const shown = useMemo(() => {
    if (filter === 'missing') return missing.map((card) => ({ card, plan: null }));
    const list = filter === 'ready' ? owned.filter((x) => x.plan?.next?.ready) : owned;
    const value = {
      level: (x) => x.card.lvl ?? 0,
      // Vorrat im Verhältnis zum nächsten Schritt; fertige Karten ans Ende
      progress: (x) => (x.plan?.next ? Math.min(1, x.plan.next.have / x.plan.next.cards) : -1),
      gold: (x) => x.plan?.goldToMax ?? 0,
      elixir: (x) => x.card.elixir ?? 99,
      rarity: (x) => RARITY_ORDER[x.card.rarity] ?? -1,
      name: (x) => x.card.name,
    }[sort.by];
    return sortBy(list, value, sort.dir, (x) => x.card.name);
  }, [filter, sort, owned, missing]);

  const sortOptions = [
    { id: 'level', label: t.sortLevel },
    ...(planOk ? [{ id: 'progress', label: t.sortProgress }, { id: 'gold', label: t.sortGold }] : []),
    { id: 'rarity', label: t.sortRarity }, { id: 'elixir', label: t.sortElixir }, { id: 'name', label: t.sortName },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Panel title={t.collection} icon={<CollectionIcon size={30} />}>
        <div className="crs-figs">
          <Fig value={owned.length} unit={`/ ${total}`} label={t.cardsFoundLabel} />
          <Fig value={calc.maxed} label={t.maxed} />
          <Fig value={calc.avg !== null ? fmtDec(calc.avg, lang) : '–'} unit={cap ? `/ ${cap}` : undefined} label={t.avgLevel} />
          {special.ev1.length > 0 && <Fig icon={<EvoShard size={24} />} value={evoOwned} unit={`/ ${special.ev1.length}`} label={t.evolutionsLabel} />}
          {special.hero.length > 0 && <Fig icon={<HeroShard size={24} />} value={heroOwned} unit={`/ ${special.hero.length}`} label={t.heroesLabel} />}
          {calc.towers.length > 0 && <Fig icon={<TowerIcon size={22} />} value={calc.towers.length} label={t.towerTroops} />}
        </div>

        {plan && (
          <div className="grid lg:grid-cols-2 gap-x-8 gap-y-4 mt-5">
            <div>
              <div className="cr-eyebrow mb-2">{t.upgradeCosts}</div>
              <div className="crs-rows">
                <Row icon={<UpgradeArrow size={28} />} label={t.readyNow} sub={t.readyNowSub}
                  value={t.cardsN(calc.ready.length)} valueSub={calc.ready.length ? <><GoldCoin size={14} /> {n(calc.readyGold)}</> : undefined} />
                <Row icon={<GoldCoin size={28} />} label={t.goldToMax} sub={t.goldToMaxSub} value={n(calc.goldToMax)} />
              </div>
            </div>
            <div>
              <div className="cr-eyebrow mb-2">{t.toMaxByRarity}</div>
              <div className="flex flex-col gap-2">
                {[...plan.byRarity.map((r) => ({ ...r, label: t.rarity[r.rarity] })), ...(calc.towerRow ? [{ ...calc.towerRow, rarity: 'tower', label: t.towerTroops }] : [])].map((r) => (
                  <div key={r.rarity} className="grid grid-cols-[96px_minmax(0,1fr)_auto] items-center gap-3 text-sm">
                    <span className="font-semibold text-white truncate">{r.label}</span>
                    <Bar value={r.maxed / r.cards} color="#ffc93c" />
                    <span className="crs-muted crs-num text-right whitespace-nowrap">
                      {r.maxed}/{r.cards} · {r.missingCards ? t.cardsMissing(n(r.missingCards)) : t.complete}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {spread.length > 0 && (
          <div className="mt-5">
            <div className="cr-eyebrow mb-2">{t.levelSpread}</div>
            <div className="flex flex-col gap-1.5">
              {spread.map(([lvl, count]) => (
                <div key={lvl} className="grid grid-cols-[52px_minmax(0,1fr)_34px] items-center gap-3 text-sm">
                  <span className={`font-cr ${cap && lvl >= cap ? 'text-[#ffd65c]' : 'text-white'}`}>{t.lvl} {lvl}</span>
                  <Bar value={count / peak} color={cap && lvl >= cap ? '#ffc93c' : undefined} />
                  <span className="crs-muted crs-num text-right">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Panel>

      {calc.ready.length > 0 && (
        <Panel title={t.readyNow} sub={t.readyListSub} icon={<UpgradeArrow size={30} />}>
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-x-2 gap-y-3">
            {calc.ready.slice(0, READY_SHOWN).map(({ card, plan: p }) => (
              <ScoutCard key={cardKey(card)} card={card} cap={cap} link>
                <span className="crs-card-count is-ready">→ {t.lvl} {p.reach}</span>
                <span className="crs-card-count"><GoldCoin size={12} /> {n(p.reachGold)}</span>
              </ScoutCard>
            ))}
          </div>
          {calc.ready.length > READY_SHOWN && (
            <button type="button" className="cr-chip h-9 px-3 rounded-xl font-cr text-sm text-white mt-4" onClick={() => setFilter('ready')}>{t.showAll} ({plan.ready.length})</button>
          )}
        </Panel>
      )}

      <FormGrid title={t.evolutionsLabel} icon={<EvoShard size={32} />} list={special.ev1} />
      <FormGrid title={t.heroesLabel} icon={<HeroShard size={32} />} list={special.hero} />

      {calc.towers.length > 0 && (
        <Panel title={t.towerTroops} icon={<TowerIcon size={30} />}>
          <div className="crs-formgrid">
            {calc.towers.map(({ card, plan: p }) => (
              <ScoutCard key={card.name} card={card} cap={cap}>
                {p?.next && (
                  <>
                    <span className={`crs-card-prog${p.next.ready ? ' is-ready' : ''}`}><i style={{ width: `${Math.min(100, (p.next.have / p.next.cards) * 100)}%` }} /></span>
                    <span className={`crs-card-count${p.next.ready ? ' is-ready' : ''}`}>{n(p.next.have)} / {n(p.next.cards)}</span>
                  </>
                )}
                <span className="crs-card-count">{card.name}</span>
                {p && p.goldToMax > 0 && <span className="crs-card-count" title={t.sortGold}><GoldCoin size={12} /> {n(p.goldToMax)}</span>}
              </ScoutCard>
            ))}
          </div>
        </Panel>
      )}

      <Panel>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <Seg value={filter} onChange={setFilter} label={t.collection} options={[
            { id: 'all', label: `${t.filterAll} (${owned.length})` },
            ...(plan ? [{ id: 'ready', label: `${t.filterReady} (${plan.ready.length})` }] : []),
            { id: 'missing', label: `${t.filterMissing} (${missing.length})` },
          ]} />
          <div className="flex-1" />
          {filter !== 'missing' && <SortControl options={sortOptions} value={sort.by} dir={sort.dir} onChange={(by, dir) => setSort({ by, dir })} />}
        </div>
        {shown.length ? (
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-x-2 gap-y-3">
            {shown.map(({ card, plan: p }) => (
              <ScoutCard key={card.id || card.name} card={card} cap={cap} link missing={filter === 'missing'}>
                {p?.next && (
                  <>
                    <span className={`crs-card-prog${p.next.ready ? ' is-ready' : ''}`}><i style={{ width: `${Math.min(100, (p.next.have / p.next.cards) * 100)}%` }} /></span>
                    <span className={`crs-card-count${p.next.ready ? ' is-ready' : ''}`}>{n(p.next.have)} / {n(p.next.cards)}</span>
                  </>
                )}
                {card.forms?.some((f) => f.owned) && (
                  <span className="crs-card-mark" title={card.forms.filter((f) => f.owned).map((f) => t.forms[f.id]).join(' + ')}>
                    {card.forms.filter((f) => f.owned).map((f) => (f.id === 'hero' ? <HeroShard key="h" size={20} /> : <EvoShard key="e" size={20} />))}
                  </span>
                )}
                {card.star > 0 && (
                  <span className="crs-card-star" title={t.starLevel(card.star)}><StarLevelIcon size={22} /><b>{card.star}</b></span>
                )}
              </ScoutCard>
            ))}
          </div>
        ) : <p className="crs-empty">{t.nothingHere}</p>}
        {planOk && filter !== 'missing' && <p className="text-xs crs-muted mt-4">{t.planNote}</p>}
      </Panel>
    </div>
  );
}

// ── Abzeichen ────────────────────────────────────────────────────────────────
// Die API nennt Abzeichen mit internen Namen (Classic12Wins, Crl20Wins2021 …). Bekannte bekommen einen lesbaren
// Namen; Meisterschafts-Abzeichen zeigen die Karte im Bild und brauchen keinen.
function badgeLabel(name, t) {
  const crl = /^Crl20Wins(\d{4})?$/.exec(name);
  if (crl) return `CRL 20 Wins${crl[1] ? ` ${crl[1]}` : ''}`;
  return t.badgeNames[name] || prettyMode(name);
}

// Für neuere Abzeichen nennt die API eine Bild-Adresse, unter der (noch) nichts liegt (14.11.2026: 17 von 177 bei einem
// echten Profil, u. a. Crl20Wins2026, 2v2LeagueRank, MasteryRonin). Dann springt ein passendes eigenes Bild ein:
// bei Meisterschaften die Karte selbst, sonst ein Symbol nach Stichwort im Namen.
const NORMALIZED_CARD_ID = new Map(ALL_CARDS.map((c) => [c.name.toLowerCase().replace(/[^a-z0-9]/g, ''), c.id]));
const BADGE_FALLBACKS = [
  [/SpookyChess/i, spookyChessImg], [/2v2/i, league2v2Img], [/TripleDraft/i, tripleDraftImg], [/SuddenDeath/i, suddenDeathImg],
  [/Crl/i, crlImg], [/Tournament/i, tourneyImg], [/League|Trail|Rank/i, LEAGUE_MEDAL_ICON_URL],
];
function badgeFallback(name) {
  if (/^Mastery/.test(name)) {
    const id = NORMALIZED_CARD_ID.get(name.replace(/^Mastery/, '').toLowerCase().replace(/[^a-z0-9]/g, ''));
    if (id) return { card: localCard(id) };
  }
  return { img: (BADGE_FALLBACKS.find(([re]) => re.test(name)) || [])[1] || starImg };
}

// Eigene Kopien der Abzeichen-Bilder (Backend: npm run cr:badges, von Hand ergänzbar — z. B. Crl20Wins2026, dessen
// API-Bild leer ist; ein lokales Bild hat immer Vorrang vor der API): <Name>.webp bzw. bei Abzeichen
// mit Stufen <Name>__<Stufe>.webp — dort hat jede Stufe ein eigenes Bild. eager + ?url liefert nur die Adressen.
const LOCAL_BADGES = Object.fromEntries(
  Object.entries(import.meta.glob('/src/assets/clashRoyale/badges/*.webp', { eager: true, query: '?url', import: 'default' }))
    .map(([p, url]) => [p.split('/').pop().replace(/\.webp$/, ''), url]),
);
const normBadge = (s) => String(s).toLowerCase().replace(/badge$/i, '').replace(/[^a-z0-9]/g, '');
// Von Hand abgelegte Dateien mit freiem Namen (z. B. pancake.webp) finden ihr Abzeichen über den vereinfachten Namen
const LOCAL_BY_NORM = new Map(Object.entries(LOCAL_BADGES).filter(([k]) => !k.includes('__')).map(([k, url]) => [normBadge(k), url]));
const leveled = (b) => b.maxLevel > 1 && b.level;
// Dateiname wie im Backend-Werkzeug (badgeSpiegel.js fileName): Leerzeichen werden zu _
const badgeFile = (name) => String(name).trim().replace(/\s+/g, '_');
/** Lokales Bild genau dieses Abzeichens (bei Stufen: genau dieser Stufe) */
function localBadge(b) {
  if (leveled(b)) return LOCAL_BADGES[`${badgeFile(b.name)}__${b.level}`] || null;
  return LOCAL_BADGES[badgeFile(b.name)] || LOCAL_BY_NORM.get(normBadge(b.name)) || null;
}
/** Notlösung, wenn auch die API kein Bild hat: die nächstniedrigere (sonst nächsthöhere) lokale Stufe */
function nearestLocalLevel(b) {
  if (!leveled(b)) return null;
  const levels = Object.keys(LOCAL_BADGES).filter((k) => k.startsWith(`${badgeFile(b.name)}__`)).map((k) => Number(k.split('__')[1])).filter(Number.isFinite);
  if (!levels.length) return null;
  const below = levels.filter((l) => l <= b.level).sort((x, y) => y - x)[0];
  const pickLevel = below ?? Math.min(...levels);
  return LOCAL_BADGES[`${badgeFile(b.name)}__${pickLevel}`];
}

function BadgeImage({ badge }) {
  const [failed, setFailed] = useState(false);
  const own = localBadge(badge);
  if (own) return <img src={own} alt="" loading="lazy" draggable={false} />;
  if (badge.icon && !failed) return <img src={badge.icon} alt="" loading="lazy" draggable={false} onError={() => setFailed(true)} />;
  const near = nearestLocalLevel(badge);
  if (near) return <img src={near} alt="" loading="lazy" draggable={false} />;
  const fb = badgeFallback(badge.name);
  return fb.card
    ? <span className="w-[52px] h-16 flex items-center crs-card"><span className="crs-card-art block w-full"><CardArt card={fb.card} /></span></span>
    : <img src={fb.img} alt="" draggable={false} />;
}

function BadgeGrid({ list, named = true }) {
  const { t, lang } = useScoutText();
  return (
    <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-8 gap-2">
      {list.map((b) => (
        <div key={b.name} className="crs-well crs-badge" title={named ? undefined : prettyMode(b.name.replace(/^Mastery/, ''))}>
          <BadgeImage badge={b} />
          {named && <span className="crs-badge-name">{badgeLabel(b.name, t)}</span>}
          {b.maxLevel > 1 && <span className="font-cr text-xs text-[#ffd65c]">{b.level} / {b.maxLevel}</span>}
          {/* Zähler-Abzeichen (Emotes, Banner, Tage dabei): die Zahl selbst ist das Interessante, der Balken zeigt nur
              den Weg zur nächsten Stufe */}
          {named && t.badgeCount[b.name] && typeof b.progress === 'number' && b.progress > 0 && (
            <span className="text-[12px] font-semibold text-white crs-num">{t.badgeCount[b.name](fmtNum(b.progress, lang))}</span>
          )}
          {typeof b.progress === 'number' && typeof b.target === 'number' && b.target > 0 && b.level < b.maxLevel
            ? <Bar value={b.progress / b.target} className="w-full" />
            : named && !t.badgeCount[b.name] && typeof b.progress === 'number' && b.progress > 0 && <span className="text-[11px] crs-muted crs-num">{fmtNum(b.progress, lang)}</span>}
        </div>
      ))}
    </div>
  );
}

export function BadgesTab({ profile }) {
  const { t, lang } = useScoutText();
  const mastery = profile.badges.filter((b) => /^Mastery/.test(b.name)).sort((a, b) => (b.level ?? 0) - (a.level ?? 0) || (b.progress ?? 0) - (a.progress ?? 0));
  const other = profile.badges.filter((b) => !/^Mastery/.test(b.name));
  if (!profile.badges.length && !profile.achievements.length) return <Panel><p className="crs-empty">{t.noBadges}</p></Panel>;
  const masteryMax = mastery.filter((b) => b.maxLevel && b.level >= b.maxLevel).length;
  return (
    <div className="flex flex-col gap-4">
      {other.length > 0 && <Panel title={t.badges} icon={<BannerIcon size={30} />}><BadgeGrid list={other} /></Panel>}
      {mastery.length > 0 && (
        <Panel title={t.mastery} sub={t.masterySub(mastery.length, masteryMax)} icon={<CrCards size={30} />}><BadgeGrid list={mastery} named={false} /></Panel>
      )}
      {profile.achievements.length > 0 && (
        <Panel title={t.achievements} icon={<CrTrophy size={30} />}>
          <div className="crs-rows">
            {profile.achievements.map((a) => (
              <div key={a.name}>
                <span className="flex shrink-0" aria-label={`${a.stars} / 3`}>
                  {[1, 2, 3].map((i) => <CrStar key={i} size={18} className={i <= a.stars ? '' : 'opacity-20 grayscale'} />)}
                </span>
                <span className="crs-row-label"><b>{a.name}</b>{a.info}</span>
                <span className="crs-row-value">{fmtNum(a.value, lang)}</span>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
