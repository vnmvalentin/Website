// HubSections.jsx — „Mehr Clash Royale" auf der Hauptseite /clash (scout/ScoutHomePage.jsx): Minigames,
// Kartenspiele und Streamer-Werkzeuge als Reiter mit Kacheln. Bis Nov. 2026 war das die eigene Hub-Seite
// (ClashHubPage); seitdem ist /clash die Stats-Startseite und trägt diese Abschnitte unter sich.
// Der gewählte Reiter steht in ?reiter= — so führen die Zurück-Knöpfe der Spiele (GameFrame, Minigames, Nuzlocke,
// Win Tracker) direkt zum passenden Abschnitt, und die Seite scrollt beim Öffnen dorthin.
import React, { useEffect, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CrBattle, CrCards, CrCheck, CrTv } from '../ui/CrIcons';
import { berlinDay, readStore } from './quizData';
import { useClashLang } from './clashI18n';
import { DAILY_GAMES, doneCount, syncDaily } from './dailyRound';
import crownImg from '../../../assets/clashRoyale/ui/crown.webp';
import skullImg from '../../../assets/clashRoyale/modes/sudden_death.webp';
import trophyImg from '../../../assets/clashRoyale/ui/trophy.webp';
import questionImg from '../../../assets/clashRoyale/ui/question.webp';
import kingImg from '../../../assets/clashRoyale/ui/king_blue.webp';
import swordImg from '../../../assets/clashRoyale/ui/sword.webp';
import searchImg from '../../../assets/clashRoyale/ui/search.webp';
import eyeImg from '../../../assets/clashRoyale/ui/eye.webp';
import tvImg from '../../../assets/clashRoyale/ui/tv.webp';
import potionImg from '../../../assets/clashRoyale/ui/card_boost_potion.webp';
import scrollImg from '../../../assets/clashRoyale/ui/icon_daily_task_scroll_opened.webp';

// Kartenspiele zuerst und standardmäßig offen (Nutzerwunsch 15.11.2026), Minigames dahinter
const TAB_IDS = ['kartenspiele', 'minigames', 'streamer'];

function Tile({ to, img, tone, title, text, done, tag, cta, doneLabel, big = false, className = '' }) {
  return (
    <Link to={to} className={`crz-tile crz-tile--${tone}${big ? ' crz-tile--big' : ''} ${className}`}>
      <span className="crz-tile-head">
        <img src={img} alt="" draggable={false} />
        {tag && !done && <span className="crz-tile-done">{tag}</span>}
        {done && <span className="crz-tile-done"><CrCheck size={18} /> {doneLabel}</span>}
      </span>
      <span className="crz-tile-body">
        <span className="crz-tile-title">{title}</span>
        <span className="crz-tile-text">{text}</span>
        <span className="cr-arcade-btn cr-arcade-btn--sm cr-arcade-btn--green self-start mt-auto">{cta}</span>
      </span>
    </Link>
  );
}

/** @param {string} title  Überschrift des Abschnitts */
export default function HubSections({ title }) {
  const { lang, t } = useClashLang();
  const today = berlinDay();
  const q = lang === 'en' ? '?lang=en' : '';
  const [params, setParams] = useSearchParams();
  const asked = TAB_IDS.includes(params.get('reiter')) ? params.get('reiter') : null;
  const tab = asked || 'kartenspiele';
  const selectTab = (id) => setParams((prev) => {
    const next = new URLSearchParams(prev);
    next.set('reiter', id);
    return next;
  }, { replace: true });

  // Mit ?reiter= in der Adresse (Zurück aus einem Spiel) gleich zum Abschnitt springen. Nicht sofort: der Rahmen
  // (ScoutFrame) setzt seine Scrollposition beim Seitenwechsel erst danach auf oben, und das Podest im Banner darüber lädt
  // nach und schiebt den Abschnitt nach unten — deshalb kurz danach springen und einmal nachkorrigieren, solange man
  // nicht selbst gescrollt hat.
  const ref = useRef(null);
  useEffect(() => {
    if (!asked) return undefined;
    let landed = null;
    const scroller = () => ref.current?.closest('.overflow-y-auto');
    const jump = () => {
      ref.current?.scrollIntoView({ block: 'start' });
      landed = scroller()?.scrollTop ?? null;
    };
    const first = setTimeout(jump, 80);
    const again = setTimeout(() => {
      if (landed !== null && Math.abs((scroller()?.scrollTop ?? 0) - landed) < 4) jump();
    }, 900);
    return () => { clearTimeout(first); clearTimeout(again); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const tabs = [
    { id: 'kartenspiele', icon: CrCards, label: t.cardGames, sub: t.cardGamesSub },
    { id: 'minigames', icon: CrBattle, label: t.tabMinigames, sub: t.tabMinigamesSub },
    { id: 'streamer', icon: CrTv, label: t.forStreamers, sub: t.forStreamersSub },
  ];
  const activeTab = tabs.find((x) => x.id === tab);

  const nuzlocke = { to: `/nuzlocke${q}`, img: skullImg, tone: 'red', title: t.nuzlocke, text: t.nuzlockeText };
  const streamer = [
    { to: '/clash/viewer-games', img: tvImg, tone: 'blue', title: t.vgTitle, text: t.vgText, tag: t.vgTag },
    { to: `/clash-royale/win-tracker${q}`, img: trophyImg, tone: 'purple', title: t.winTracker, text: t.winTrackerText },
  ];
  const games = [
    { id: 'wordle', to: '/clash/wordle', img: scrollImg, tone: 'gold', title: t.wordleTitle, text: t.wordleText, tag: t.wordleTag, store: 'crq_wordle_v1' },
    { id: 'farbe', to: '/clash/farbe', img: potionImg, tone: 'purple', title: t.colorTitle, text: t.colorText, tag: t.colorTag, store: 'crq_color_v1' },
    { id: 'kartenraten', to: '/clash/kartenraten', img: questionImg, tone: 'blue', title: t.guessTitle, text: t.guessText, tag: t.guessTag, store: 'crq_guess_v3' },
    { id: 'wer-bin-ich', to: '/clash/wer-bin-ich', img: kingImg, tone: 'gold', title: t.whoTitle, text: t.whoText, tag: t.whoTag },
    { id: 'stats-duell', to: '/clash/stats-duell', img: swordImg, tone: 'purple', title: t.statsTitle, text: t.statsText, tag: t.statsTag },
    { id: 'zoom', to: '/clash/zoom', img: searchImg, tone: 'green', title: t.zoomTitle, text: t.zoomText, tag: t.zoomTag, store: 'crq_zoom_v1' },
    { id: 'pixel', to: '/clash/pixel', img: eyeImg, tone: 'red', title: t.pixelTitle, text: t.pixelText, tag: t.pixelTag, store: 'crq_pixel_v1' },
  ];
  const doneToday = useMemo(() => Object.fromEntries(games.map((g) => {
    const d = g.store ? readStore(g.store, {})?.daily : null;
    return [g.id, !!d && d.day === today && (d.over || d.won)];
  })), [today]); // eslint-disable-line react-hooks/exhaustive-deps
  // Tagesrunde aller fünf Ratespiele (HeutePage.jsx): wie viele heute schon gespielt sind
  const dailyDone = useMemo(() => doneCount(syncDaily().scores), [today]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section ref={ref} className="cr-arcade-panel crs-panel scroll-mt-4" aria-label={title}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <h2 className="crs-title text-2xl">{title}</h2>
        <div className="cr-tabs max-w-full" role="tablist">
          {tabs.map(({ id, icon: Icon, label }) => (
            <button key={id} type="button" role="tab" id={`crz-tab-${id}`} aria-controls="crz-tabpanel"
              aria-selected={tab === id} aria-label={label} onClick={() => selectTab(id)}>
              <Icon size={22} />
              <span className="cr-tab-label">{label}</span>
            </button>
          ))}
        </div>
      </div>
      <p className="text-sm text-white/60 mb-4">{activeTab.sub}</p>

      <div id="crz-tabpanel" role="tabpanel" aria-labelledby={`crz-tab-${tab}`}>
        {tab === 'minigames' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Link to={`/clash-royale${q}`} className="crz-tile crz-tile--green crz-tile--big md:col-span-2">
              <span className="crz-tile-head" aria-hidden="true"><img src={crownImg} alt="" draggable={false} /></span>
              <span className="crz-tile-body">
                <span className="crz-tile-title">{t.hubMinigames}</span>
                <span className="crz-tile-text">{t.hubMinigamesText}</span>
                <span className="cr-arcade-btn cr-arcade-btn--sm cr-arcade-btn--green self-start mt-auto">{t.play}</span>
              </span>
            </Link>
            <Tile {...nuzlocke} cta={t.open} />
          </div>
        )}
        {tab === 'kartenspiele' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Tile to={`/clash/heute${q}`} img={crownImg} tone="gold" big className="sm:col-span-2 lg:col-span-4"
              title={t.heuteTitle} text={t.heuteTileText} tag={t.heuteTileTag(dailyDone)} cta={dailyDone ? t.heuteResult : t.play}
              done={dailyDone === DAILY_GAMES.length} doneLabel={t.solvedToday} />
            {games.map((g) => <Tile key={g.id} {...g} cta={t.play} done={doneToday[g.id]} doneLabel={t.solvedToday} />)}
          </div>
        )}
        {tab === 'streamer' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {streamer.map((m) => <Tile key={m.to} {...m} cta={t.open} />)}
          </div>
        )}
      </div>
    </section>
  );
}
