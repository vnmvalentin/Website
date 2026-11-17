// ClanPage.jsx — /clash/clan/:tag: Clan mit Mitgliederliste (sortierbar, mit Aktivitäts-Ampel) und Clankrieg
// (laufender Krieg mit „heute noch offen", letzte Kriege). Der Krieg wird erst geladen, wenn sein Reiter offen ist.
import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, Copy, Star } from 'lucide-react';
import { CrBattle, CrCards, CrCheck, CrScroll, CrSocial, CrStar, CrTrophy } from '../ui/CrIcons';
import { useClanBadgeUrl } from '../data/clanBadges';
import ScoutFrame from './ScoutFrame';
import { Bar, ClanBadge, LoadState, Panel, PlayerLink, RefreshButton, Stat, Tabs } from './parts';
import { parseTag, rememberRecent, toggleFavorite, useSaved, useScout } from './scoutApi';
import { fmtDate, fmtNum, timeAgo, useScoutText } from './scoutI18n';
import { seenClass, useTab } from './scoutUtil';
import ClanCentral from './ClanCentral';
import { CENTRAL_TEXTS } from './clanCentralTexts';

const TAB_IDS = ['mitglieder', 'krieg', 'zentrale'];
const WEEK = 7 * 86400000;
const DECKS_PER_DAY = 4;

function ClanHero({ clan, fetchedAt, refreshing, onRefresh }) {
  const { t, lang } = useScoutText();
  const { isFavorite } = useSaved();
  const badge = useClanBadgeUrl(clan.badgeId);
  const [copied, setCopied] = useState(false);
  const fav = isFavorite('clan', clan.tag);
  const entry = { kind: 'clan', tag: clan.tag, name: clan.name, badgeId: clan.badgeId, sub: `${clan.memberCount}/50` };
  const copyTag = async () => {
    try {
      await navigator.clipboard.writeText(`#${clan.tag}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* Zwischenablage gesperrt */ }
  };
  return (
    <section className="cr-arcade-panel crs-hero cr-anim-rise">
      <div className="crs-hero-top">
        {badge ? <img className="crs-hero-art" src={badge} alt="" draggable={false} /> : <span className="crs-hero-art" />}
        <div className="min-w-0 flex-1">
          <h1 className="crs-hero-name">{clan.name}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <button type="button" className="crs-tagchip" onClick={copyTag} title={t.copyTag}>
              #{clan.tag} {copied ? <CrCheck size={14} /> : <Copy size={12} />}
            </button>
            {clan.location?.name && <span className="crs-tagchip">{clan.location.name}</span>}
            {t.clanTypes[clan.type] && <span className="crs-tagchip">{t.clanTypes[clan.type]}</span>}
          </div>
          {clan.description && <p className="mt-2 text-sm text-white/80 leading-snug max-w-2xl">{clan.description}</p>}
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-2 self-start">
          <button type="button" aria-pressed={fav} title={fav ? t.favRemove : t.favAdd} aria-label={fav ? t.favRemove : t.favAdd}
            onClick={() => toggleFavorite(entry)} className="cr-chip flex items-center justify-center h-10 w-10 rounded-xl text-white">
            {fav ? <CrStar size={22} /> : <Star size={18} />}
          </button>
          <RefreshButton onClick={onRefresh} busy={refreshing} />
        </div>
      </div>
      <div className="p-4 md:px-[22px]">
        <div className="crs-stats crs-stats--4">
          <Stat label={t.tabMembers} value={`${clan.memberCount} / 50`} icon={<CrSocial size={20} />} />
          <Stat label={t.clanScore} value={fmtNum(clan.score, lang)} icon={<CrTrophy size={20} />} />
          <Stat label={t.warTrophies} value={fmtNum(clan.warTrophies, lang)} icon={<CrBattle size={20} />} />
          <Stat label={t.perWeek} value={fmtNum(clan.donationsPerWeek, lang)} icon={<CrCards size={20} />} sub={`${t.required}: ${fmtNum(clan.requiredTrophies, lang)}`} />
        </div>
        <p className="mt-3 text-xs crs-muted">{t.updated(timeAgo(fetchedAt, lang))}</p>
      </div>
    </section>
  );
}

const SORTS = {
  rank: (a, b) => (a.rank ?? 99) - (b.rank ?? 99),
  name: (a, b) => a.name.localeCompare(b.name),
  trophies: (a, b) => b.trophies - a.trophies,
  donations: (a, b) => b.donations - a.donations,
  received: (a, b) => b.received - a.received,
  lastSeen: (a, b) => (b.lastSeen ?? 0) - (a.lastSeen ?? 0),
};

function Members({ clan }) {
  const { t, lang } = useScoutText();
  const [sort, setSort] = useState({ key: 'rank', flip: false });
  const now = Date.now();
  const list = useMemo(() => {
    const sorted = [...clan.members].sort(SORTS[sort.key]);
    return sort.flip ? sorted.reverse() : sorted;
  }, [clan.members, sort]);
  const active = clan.members.filter((m) => m.lastSeen && now - m.lastSeen <= WEEK).length;
  const cold = clan.members.filter((m) => m.lastSeen && now - m.lastSeen > WEEK).length;
  const avg = clan.members.length ? Math.round(clan.members.reduce((s, m) => s + m.trophies, 0) / clan.members.length) : 0;
  const donated = clan.members.reduce((s, m) => s + m.donations, 0);

  // Spaltenkopf zum Sortieren; ein zweiter Klick dreht die Richtung um
  const th = (id, label, num = false) => (
    <th className={num ? 'num' : ''} aria-sort={sort.key === id ? (sort.flip ? 'ascending' : 'descending') : undefined}>
      <button type="button" onClick={() => setSort((s) => ({ key: id, flip: s.key === id ? !s.flip : false }))}>
        {label}{sort.key === id && (sort.flip ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </button>
    </th>
  );

  return (
    <div className="flex flex-col gap-4">
      <Panel title={t.activity} icon={<CrSocial size={28} />}>
        <div className="crs-stats crs-stats--3">
          <Stat label={t.activity} value={`${active} / ${clan.members.length}`} sub={cold ? t.inactive(cold) : t.activeWeek(active, clan.members.length)} />
          <Stat label={t.avgTrophies} value={fmtNum(avg, lang)} icon={<CrTrophy size={18} />} />
          <Stat label={t.donatedTotal} value={fmtNum(donated, lang)} />
        </div>
      </Panel>
      <Panel>
        <div className="crs-scroll-x">
          <table className="crs-table">
            <thead>
              <tr>
                {th('rank', '#')}
                {th('name', t.colName)}
                <th>{t.colRole}</th>
                {th('trophies', t.colTrophies, true)}
                {th('donations', t.colDonated, true)}
                {th('received', t.colReceived, true)}
                {th('lastSeen', t.colLastSeen, true)}
              </tr>
            </thead>
            <tbody>
              {list.map((m) => (
                <tr key={m.tag}>
                  <td><span className={`crs-rank crs-rank--${m.rank}`}>{m.rank ?? '–'}</span></td>
                  <td className="name"><PlayerLink tag={m.tag} name={m.name} /></td>
                  <td><span className={`crs-role crs-role--${m.role}`}>{t.roles[m.role] || m.role}</span></td>
                  <td className="num"><span className="inline-flex items-center gap-1.5"><CrTrophy size={15} />{fmtNum(m.trophies, lang)}</span></td>
                  <td className="num">{fmtNum(m.donations, lang)}</td>
                  <td className="num">{fmtNum(m.received, lang)}</td>
                  <td className="num"><span className="inline-flex items-center gap-2"><span className={`crs-dot ${seenClass(m.lastSeen, now)}`} />{m.lastSeen ? timeAgo(m.lastSeen, lang, now) : '–'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function War({ tag, memberTags }) {
  const { t, lang } = useScoutText();
  const { data, error, loading, reload } = useScout(`/clan/${tag}/war`);
  if (!data) return <LoadState loading={loading} error={error} onRetry={reload} />;
  const { race, log } = data;
  const warDay = race && race.periodType !== 'training';
  const people = race ? [...race.clan.participants].sort((a, b) => b.fame - a.fame || b.decksUsed - a.decksUsed) : [];
  // Die Teilnehmerliste der API enthält auch Spieler, die den Clan verlassen haben — offen ist nur, wer noch Mitglied ist.
  // Wer heute schon angefangen hat, steht vorn (da fehlt nur noch ein Rest), dann die mit dem meisten Ruhm.
  const open = warDay
    ? people.filter((p) => p.decksToday < DECKS_PER_DAY && memberTags.has(p.tag)).sort((a, b) => b.decksToday - a.decksToday || b.fame - a.fame)
    : [];
  const standings = race ? [...race.clans].sort((a, b) => b.fame - a.fame || b.periodPoints - a.periodPoints) : [];
  const peak = Math.max(1, ...standings.map((c) => c.fame || c.periodPoints));
  const period = race ? (race.periodType === 'training' ? t.training : race.periodType === 'colosseum' ? t.colosseum : t.warDay) : '';

  return (
    <div className="flex flex-col gap-4">
      {!race ? <Panel><p className="crs-empty">{t.warNone}</p></Panel> : (
        <>
          <Panel title={t.warNow} sub={period} icon={<CrBattle size={28} />}>
            <div className="cr-eyebrow mb-2">{t.standings}</div>
            <div className="flex flex-col gap-2">
              {standings.map((c, i) => (
                <div key={c.tag} className={`cr-row flex items-center gap-3 px-3 py-2${c.tag === tag ? ' cr-row--me' : ''}`}>
                  <span className={`crs-rank crs-rank--${i + 1}`}>{i + 1}</span>
                  <ClanBadge badgeId={c.badgeId} size={26} />
                  <span className="min-w-0 w-36 sm:w-48 shrink-0">
                    <Link to={`/clash/clan/${c.tag}`} className="crs-link block font-semibold text-white truncate">{c.name}</Link>
                    <span className="block text-xs crs-muted">{t.activeN(c.active)}</span>
                  </span>
                  <Bar value={(c.fame || c.periodPoints) / peak} color="#ffc93c" className="flex-1" />
                  <span className="font-cr text-white crs-num w-16 text-right">{fmtNum(c.fame || c.periodPoints, lang)}</span>
                </div>
              ))}
            </div>
          </Panel>
          {warDay && (
            <Panel title={t.openToday} sub={t.openTodaySub}>
              {open.length ? (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {open.map((p) => (
                    <div key={p.tag} className="cr-row flex items-center justify-between gap-3 px-3 py-2">
                      <PlayerLink tag={p.tag} name={p.name} className="font-semibold text-white truncate" />
                      <span className="crs-delta is-down">{t.decksLeft(DECKS_PER_DAY - p.decksToday)}</span>
                    </div>
                  ))}
                </div>
              ) : <p className="crs-empty">{t.allPlayed}</p>}
            </Panel>
          )}
          <Panel title={t.participants}>
            <div className="crs-scroll-x">
              <table className="crs-table">
                <thead><tr><th>{t.colName}</th><th className="num">{t.fame}</th><th className="num">{t.decksToday}</th><th className="num">{t.decksUsed}</th><th className="num">{t.boatAttacks}</th></tr></thead>
                <tbody>
                  {people.map((p) => (
                    <tr key={p.tag}>
                      <td className="name"><PlayerLink tag={p.tag} name={p.name} /></td>
                      <td className="num">{fmtNum(p.fame, lang)}</td>
                      <td className="num">{p.decksToday} / {DECKS_PER_DAY}</td>
                      <td className="num">{p.decksUsed}</td>
                      <td className="num">{p.boatAttacks}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
      <Panel title={t.warLog} icon={<CrTrophy size={28} />}>
        {log.length ? (
          <div className="flex flex-col gap-2">
            {log.map((w) => {
              const idle = w.own ? w.own.participants.filter((p) => p.decksUsed === 0).length : 0;
              return (
                <details key={`${w.season}-${w.week}`} className="crs-details cr-row">
                  <summary className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5">
                    {w.own?.rank ? <span className={`crs-rank crs-rank--${w.own.rank}`}>{w.own.rank}</span> : <span className="crs-rank">–</span>}
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-white">{t.seasonWeek(w.season ?? '–', w.week ?? '–')}</span>
                      <span className="block text-xs crs-muted">{fmtDate(w.date, lang)}</span>
                    </span>
                    {w.own && <span className="text-sm crs-muted crs-num">{t.fame}: <b className="text-white">{fmtNum(w.own.fame, lang)}</b></span>}
                    {typeof w.own?.trophyChange === 'number' && (
                      <span className={`crs-delta ${w.own.trophyChange >= 0 ? 'is-up' : 'is-down'}`}><CrTrophy size={14} />{w.own.trophyChange > 0 ? '+' : ''}{w.own.trophyChange}</span>
                    )}
                    {idle > 0 && <span className="text-xs crs-muted">{t.noAttack(idle)}</span>}
                  </summary>
                  <div className="px-3 pb-3 flex flex-col gap-1">
                    {w.standings.map((s) => (
                      <div key={s.tag} className="flex items-center gap-3 text-sm">
                        <span className="w-6 text-right crs-muted crs-num">{s.rank}.</span>
                        <ClanBadge badgeId={s.badgeId} size={18} />
                        <Link to={`/clash/clan/${s.tag}`} className={`crs-link min-w-0 flex-1 truncate ${s.tag === tag ? 'text-[#ffd65c] font-semibold' : 'text-white/85'}`}>{s.name}</Link>
                        <span className="crs-num crs-muted">{fmtNum(s.fame, lang)}</span>
                      </div>
                    ))}
                  </div>
                </details>
              );
            })}
          </div>
        ) : <p className="crs-empty">{t.warLogEmpty}</p>}
      </Panel>
    </div>
  );
}

export default function ClanPage() {
  const { tag: rawTag } = useParams();
  const tag = parseTag(rawTag);
  const { t, q, lang } = useScoutText();
  const { data, error, loading, refreshing, reload } = useScout(tag ? `/clan/${tag}` : null);
  const [tab, setTab] = useTab(TAB_IDS);
  const clan = data?.clan;

  useEffect(() => {
    if (clan) rememberRecent({ kind: 'clan', tag: clan.tag, name: clan.name, badgeId: clan.badgeId, sub: `${clan.memberCount}/50` });
  }, [clan]);

  const tabs = [
    { id: 'mitglieder', icon: CrSocial, label: t.tabMembers },
    { id: 'krieg', icon: CrBattle, label: t.tabWar },
    { id: 'zentrale', icon: CrScroll, label: CENTRAL_TEXTS.dict(lang).tab },
  ];
  return (
    <ScoutFrame seo={{ title: clan ? `${clan.name} (#${clan.tag}) – Clash Royale Clan` : t.homeSeoTitle, description: t.homeSeo, path: `/clash/clan/${tag || ''}` }}>
      {!tag
        ? <LoadState error="invalidTag" />
        : !data
          ? (
            <LoadState loading={loading} error={error} onRetry={reload}>
              {error === 'notFound' && (
                <p className="text-sm crs-muted">{t.clanNotFound} <Link to={`/clash/spieler/${tag}${q}`} className="crs-link text-white underline">{t.tryAsPlayer}</Link></p>
              )}
            </LoadState>
          )
          : (
            <div className="flex flex-col gap-4">
              <ClanHero clan={clan} fetchedAt={data.fetchedAt} refreshing={refreshing} onRefresh={reload} />
              <div className="flex justify-center"><Tabs tabs={tabs} value={tab} onChange={setTab} /></div>
              <div key={tab} className="cr-anim-rise">
                {tab === 'mitglieder' ? <Members clan={clan} />
                  : tab === 'zentrale' ? <ClanCentral tag={clan.tag} />
                    : <War tag={clan.tag} memberTags={new Set(clan.members.map((m) => m.tag))} />}
              </div>
            </div>
          )}
    </ScoutFrame>
  );
}
