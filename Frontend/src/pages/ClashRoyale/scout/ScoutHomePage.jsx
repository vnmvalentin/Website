// ScoutHomePage.jsx — /clash: Hauptseite des Clash-Royale-Bereichs (bis Nov. 2026 /clash/spieler, das jetzt hierher
// weiterleitet). Einstieg in die Stats und darunter Minigames, Kartenspiele und Streamer-Werkzeuge (clash/HubSections). Großes Suchfeld,
// Favoriten in der linken Spalte, zuletzt Angesehenes rechts (die verknüpften Accounts aus dem Minigame-Profil stehen
// seit 15.11.2026 bewusst nicht mehr hier — Favoriten reichen), in der Mitte die Wege zu Ranglisten, Meta Decks,
// Crown Series und Karten; im Banner ein Podest mit den drei Besten der Welt.
import React from 'react';
import { Link } from 'react-router-dom';
import { CrInfo } from '../ui/CrIcons';
import { MEDAL_ICON_URL } from '../data/leagueIcons';
import trophyImg from '../../../assets/clashRoyale/ui/trophy.png';
import cardsImg from '../../../assets/clashRoyale/ui/cards.png';
import battleImg from '../../../assets/clashRoyale/ui/battle.png';
import crownSeriesImg from '../../../assets/clashRoyale/ui/CR_CrownSeriesIcon.png';
import kingImg from '../../../assets/clashRoyale/ui/king_blue.webp';
// Dunkles, ruhiges Motiv: das Podest rechts im Banner bleibt darauf gut lesbar (evergreen war dort zu bunt)
import bannerArt from '../../../assets/clashRoyale/bg/goblinstein.webp';
import ScoutFrame from './ScoutFrame';
import ScoutSearch from './ScoutSearch';
import HubSections from '../clash/HubSections';
import { Banner, Panel, PlayerLink, SavedPanel } from './parts';
import { useScout } from './scoutApi';
import { fmtNum, useScoutText } from './scoutI18n';

function Tile({ to, img, tone, title, text, cta }) {
  return (
    <Link to={to} className={`crz-tile crz-tile--${tone}`}>
      <span className="crz-tile-head"><img src={img} alt="" draggable={false} /></span>
      <span className="crz-tile-body">
        <span className="crz-tile-title">{title}</span>
        <span className="crz-tile-text">{text}</span>
        <span className="cr-arcade-btn cr-arcade-btn--sm cr-arcade-btn--green self-start mt-auto">{cta}</span>
      </span>
    </Link>
  );
}

/** Die drei Besten der Weltrangliste als kleines Podest im Banner: Platz 2 links, 1 in der Mitte, 3 rechts. */
function Podium({ players }) {
  const { t, lang } = useScoutText();
  const byRank = (r) => players.find((p) => p.rank === r);
  return (
    <div className="crs-podium" aria-label={t.topNow}>
      <ol className="crs-podium-row">
        {[2, 1, 3].map((rank) => {
          const p = byRank(rank);
          return (
            <li key={rank} className={`crs-podium-col crs-podium-col--${rank}`}>
              <PlayerLink tag={p.tag} name={p.name} className="crs-podium-name" />
              <span className="crs-podium-score">
                <img src={MEDAL_ICON_URL} alt="" />{fmtNum(p.score, lang)}
              </span>
              <span className="crs-podium-step">{rank}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export default function ScoutHomePage() {
  const { t, q } = useScoutText();
  const { data: top } = useScout('/ranking/players');
  const podium = (top?.items || []).filter((p) => p.rank >= 1 && p.rank <= 3).sort((a, b) => a.rank - b.rank);

  return (
    <ScoutFrame noSearch wide seo={{ title: t.homeSeoTitle, description: t.homeSeo, path: '/clash' }}>
      {/* Mitte in voller Breite: Kopf mit Podest, Suche, die Hauptreiter nebeneinander, „Mehr Clash Royale". Favoriten
          und zuletzt Angesehenes stehen in den freien Rändern links und rechts; die Tag-Hilfe ganz unten. */}
      <div className="crs-homegrid">
        <div className="crs-homegrid-main flex flex-col gap-4 min-w-0">
          <Banner art={bannerArt} badge={<img src={kingImg} alt="" />} title={t.homeTitle} sub={t.homeSub}
            className={podium.length === 3 ? 'crs-banner--podium' : ''}>
            {podium.length === 3 && <Podium players={podium} />}
          </Banner>
          <div className="relative z-20 max-w-3xl w-full mx-auto"><ScoutSearch big autoFocus /></div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Tile to={`/clash/ranglisten${q}`} img={trophyImg} tone="gold" title={t.navRankings} text={t.tileRankings} cta={t.open} />
            <Tile to={`/clash/decks${q}`} img={battleImg} tone="red" title={t.navDecks} text={t.tileDecks} cta={t.open} />
            <Tile to={`/clash/crown-series${q}`} img={crownSeriesImg} tone="purple" title={t.navCrown} text={t.tileCrown} cta={t.open} />
            <Tile to={`/clash/karten${q}`} img={cardsImg} tone="blue" title={t.navCards} text={t.tileCards} cta={t.open} />
          </div>
          <HubSections title={t.moreTitle} />
        </div>
        <aside className="crs-homegrid-left flex flex-col gap-4 min-w-0">
          <SavedPanel which="favorites" />
        </aside>
        <aside className="crs-homegrid-right flex flex-col gap-4 min-w-0">
          <SavedPanel which="recent" />
        </aside>
        <div className="crs-homegrid-foot min-w-0">
          <Panel title={t.tagHelpTitle} icon={<CrInfo size={24} />}>
            <p className="text-sm leading-relaxed crs-muted">{t.tagHelp}</p>
            <p className="text-sm leading-relaxed crs-muted mt-2">{t.nameHelp}</p>
          </Panel>
        </div>
      </div>
    </ScoutFrame>
  );
}
