// ClashHubPage.jsx — /clash im Clash-Royale-Look (ersetzt die allgemeine Kategorieseite an derselben Adresse).
// Oben die großen Bereiche (Minigames, Turniere, Nuzlocke, Win Tracker), darunter die Kartenspiele.
// Kopf nach Hub-Regel ruhig: Krone, ein Titel, eine NEU-Zeile. Texte DE/EN aus clashI18n.js.
import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import GameFrame from './GameFrame';
import ArcadeTitle from '../ui/ArcadeTitle';
import { CrCheck } from '../ui/CrIcons';
import { getCategory } from '../../../config/navigation';
import { berlinDay, readStore } from './quizData';
import { useClashLang } from './clashI18n';
import crownGif from '../../../assets/clashRoyale/ui/crown-animated.webp';
import tourneyImg from '../../../assets/clashRoyale/ui/tourney_trophy.webp';
import skullImg from '../../../assets/clashRoyale/ui/sudden_death.webp';
import trophyImg from '../../../assets/clashRoyale/ui/trophy.png';
import questionImg from '../../../assets/clashRoyale/ui/question.webp';
import kingImg from '../../../assets/clashRoyale/ui/king_blue.webp';
import swordImg from '../../../assets/clashRoyale/ui/sword.webp';
import searchImg from '../../../assets/clashRoyale/ui/search.webp';
import eyeImg from '../../../assets/clashRoyale/ui/eye.webp';
import tvImg from '../../../assets/clashRoyale/ui/tv.webp';
import scrollImg from '../../../assets/clashRoyale/ui/icon_daily_task_scroll_opened.png';

function Tile({ to, img, tone, title, text, done, tag, cta, doneLabel, big = false }) {
  return (
    <Link to={to} className={`crz-tile crz-tile--${tone}${big ? ' crz-tile--big' : ''}`}>
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

export default function ClashHubPage() {
  const { lang, t } = useClashLang();
  const cat = getCategory('clash-royale');
  const today = berlinDay();
  const q = lang === 'en' ? '?lang=en' : '';

  const main = [
    { to: `/clash-royale?ansicht=turniere${lang === 'en' ? '&lang=en' : ''}`, img: tourneyImg, tone: 'gold', title: t.tournaments, text: t.tournamentsText },
    { to: `/nuzlocke${q}`, img: skullImg, tone: 'red', title: t.nuzlocke, text: t.nuzlockeText },
  ];
  // Für Streamer: OBS-Overlays
  const streamer = [
    { to: '/clash/viewer-games', img: tvImg, tone: 'blue', title: t.vgTitle, text: t.vgText, tag: t.vgTag },
    { to: `/clash-royale/win-tracker${q}`, img: trophyImg, tone: 'purple', title: t.winTracker, text: t.winTrackerText },
  ];
  const games = [
    { id: 'wordle', to: '/clash/wordle', img: scrollImg, tone: 'gold', title: t.wordleTitle, text: t.wordleText, tag: t.wordleTag, store: 'crq_wordle_v1' },
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

  return (
    <GameFrame wide back={{ to: '/', label: t.website }}
      seo={{ title: cat.seoTitle || cat.label, description: cat.seoDescription || cat.description, keywords: cat.keywords, path: '/clash' }}>
      <div className="flex flex-col items-center mb-6">
        <img src={crownGif} alt="" className="h-14 md:h-16 w-auto drop-shadow-[0_6px_6px_rgba(2,8,20,0.5)]" />
        <ArcadeTitle as="h1" className="text-4xl sm:text-5xl text-center leading-none mt-1">Clash Royale</ArcadeTitle>
        <p className="mt-3 flex items-center justify-center gap-2 text-sm text-center">
          <span className="shrink-0 px-1.5 py-0.5 rounded-[4px] bg-[var(--cr-arcade-gold)] text-[#4a2e00] font-cr text-xs uppercase tracking-wider">{lang === 'en' ? 'New' : 'Neu'}</span>
          <span className="text-white/75">{t.hubNew}</span>
        </p>
      </div>

      <section aria-label={t.hubMinigames} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
        <Link to={`/clash-royale${q}`} className="crz-tile crz-tile--green crz-tile--big md:col-span-2 lg:col-span-2">
          <span className="crz-tile-head crz-tile-head--modes" aria-hidden="true">
            {['auction', 'snake', 'dark-maze'].map((m) => <img key={m} src={`/cr-modes/${m}.png`} alt="" draggable={false} loading="lazy" />)}
          </span>
          <span className="crz-tile-body">
            <span className="crz-tile-title">{t.hubMinigames}</span>
            <span className="crz-tile-text">{t.hubMinigamesText}</span>
            <span className="cr-arcade-btn cr-arcade-btn--sm cr-arcade-btn--green self-start mt-auto">{t.play}</span>
          </span>
        </Link>
        {main.map((m) => <Tile key={m.to} {...m} cta={t.open} />)}
      </section>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-10 mb-4">
        <ArcadeTitle as="h2" className="text-2xl leading-none">{t.forStreamers}</ArcadeTitle>
        <span className="text-sm text-white/60">{t.forStreamersSub}</span>
      </div>
      <section aria-label={t.forStreamers} className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
        {streamer.map((m) => <Tile key={m.to} {...m} cta={t.open} />)}
      </section>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-10 mb-4">
        <ArcadeTitle as="h2" className="text-2xl leading-none">{t.cardGames}</ArcadeTitle>
        <span className="text-sm text-white/60">{t.cardGamesSub}</span>
      </div>
      <section aria-label={t.cardGames} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
        {games.map((g) => <Tile key={g.id} {...g} cta={t.play} done={doneToday[g.id]} doneLabel={t.solvedToday} />)}
      </section>

      <p className="text-white/35 text-[11px] text-center max-w-lg mx-auto leading-relaxed mt-10">
        {t.notAffiliated}{' '}
        <a href="https://supercell.com/en/fan-content-policy/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-white/60">{t.fanPolicy}</a>.
      </p>
    </GameFrame>
  );
}
