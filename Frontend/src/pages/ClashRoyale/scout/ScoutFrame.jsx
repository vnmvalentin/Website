// ScoutFrame.jsx — Rahmen aller Stats-Seiten unter /clash: Rautenhintergrund wie der Hub, oben der Weg zurück,
// Sprache und Einstellungen, darunter die Bereiche (Spieler, Ranglisten, Meta Decks, Crown Series, Karten, Vergleich)
// und die Suche. Auf breiten Bildschirmen stehen Favoriten und zuletzt Angesehenes in den Rändern jeder Seite.
// Am Fuß führen Links zu den übrigen Clash-Royale-Seiten (Minigames, Kartenspiele, Streamer-Werkzeuge).
// Läuft in der CR-Hülle (ui/CrShell.jsx).
import React, { useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import SEO from '../../../components/SEO';
import ShellLegalLinks from '../../../components/shell/ShellLegalLinks';
import HubStage from '../hub/HubStage';
import LanguageSelect from '../components/LanguageSelect';
import { BACKGROUNDS, statsBackgroundUrl, useCrPrefs } from '../ui/crPrefs';
import StatsBackdrop, { StaticBackdrop } from './StatsBackdrop';
import { CrBattle, CrCards, CrCrown, CrKingBlue, CrSettings, CrSwap, CrTrophy } from '../ui/CrIcons';
import crownSeriesImg from '../../../assets/clashRoyale/modes/CR_CrownSeriesIcon.webp';
import ScoutSearch from './ScoutSearch';
import { SavedPanel } from './parts';
import { useScoutText } from './scoutI18n';
import './scout.css';

const CHIP = 'cr-chip flex items-center gap-2 h-11 rounded-xl font-cr text-[15px] text-white transition-colors';

// Vorschaubild für Discord & Co. aus der Link-Vorschau des Servers (Backend/og). Vorgerenderte Seiten (Karten, Decks,
// Ranglisten …) liefert nginx auch Bots direkt als Datei aus — ohne diese Angabe zeigte ihre Vorschau nur das Logo.
// Nur Adressen, die Backend/og/ogMeta.js kennt; ein einzelnes Deck hat dort kein eigenes Bild, dann das der Deck-Liste.
function previewImage(path) {
  const p = /^\/clash\/decks\/./.test(path || '') ? '/clash/decks' : path;
  if (!/^\/clash\/(spieler|clan|ranglisten|karten|decks|crown-series|vergleich|baukasten)(\/|$)/.test(p || '')) return undefined;
  return `/api/og/image.png?u=${encodeURIComponent(p)}&v=s1`;
}

/**
 * @param {object}  seo        Props für <SEO>
 * @param {boolean} noSearch   Suche in der Kopfleiste weglassen (die Startseite trägt eine große eigene)
 * @param {boolean} wide       Inhalt darf über die übliche Breite hinaus (Startseite: Seitenspalten in den Rändern)
 */
export default function ScoutFrame({ seo, noSearch = false, wide = false, children }) {
  const { prefs, openSettings } = useCrPrefs();
  const { lang, t, changeLang, q } = useScoutText();
  const { pathname } = useLocation();
  // Die Seite scrollt in diesem Behälter, nicht im Fenster — beim Wechsel (Spieler → Gegner → Karte) wieder nach oben
  const scroller = useRef(null);
  useEffect(() => { scroller.current?.scrollTo(0, 0); }, [pathname]);
  const navigate = useNavigate();
  // Der Router zählt die Schritte innerhalb der Website in history.state.idx — 0 heißt: hier hat der Besuch begonnen
  const canGoBack = typeof window !== 'undefined' && (window.history.state?.idx ?? 0) > 0;
  // Auf der Hauptseite selbst führt der Knopf zur Website zurück
  const isMain = pathname === '/clash';

  const nav = [
    { to: '/clash', icon: CrKingBlue, label: t.navStart, on: pathname === '/clash' || /^\/clash\/(spieler|clan)(\/|$)/.test(pathname) },
    { to: '/clash/ranglisten', icon: CrTrophy, label: t.navRankings, on: pathname.startsWith('/clash/ranglisten') },
    // Der Deck-Baukasten gehört zu den Meta Decks (eigener Reiter wäre einer zu viel für die Leiste)
    { to: '/clash/decks', icon: CrBattle, label: t.navDecks, on: pathname.startsWith('/clash/decks') || pathname.startsWith('/clash/baukasten') },
    { to: '/clash/crown-series', img: crownSeriesImg, label: t.navCrown, on: pathname.startsWith('/clash/crown-series') },
    { to: '/clash/karten', icon: CrCards, label: t.navCards, on: pathname.startsWith('/clash/karten') },
    { to: '/clash/vergleich', icon: CrSwap, label: t.navCompare, on: pathname.startsWith('/clash/vergleich') },
  ];

  // Wechselnde Hintergründe (Einstellung, Standard aus) — sonst ein festes Bild (eigene Wahl oder ohne Wahl
  // The Heist, crPrefs.statsBackgroundUrl) bzw. das Karo, wenn jemand ausdrücklich das Karo gewählt hat
  const rotate = prefs.statsBgRotate && BACKGROUNDS.length > 0;
  const staticUrl = rotate ? null : statsBackgroundUrl(prefs);

  // JEDER Hintergrund (wechselnd, fest gewählt oder Karo) liegt AUSSERHALB des scrollenden Behälters, der selbst
  // keinen trägt. Zwei Gründe: (1) Inhalte reichen nie unter die Scrollleiste, deren Rinne zeigte sonst den Hintergrund
  // des Behälters; (2) der Behälter blendet beim Seitenwechsel ein (page-fade, jede Stats-Seite hängt ihren eigenen
  // ScoutFrame ein) — ein Hintergrund darin würde mit ausblenden, die dunkle Hüllenfläche blitzte kurz durch.
  return (
    <div className={`h-full relative ${rotate || staticUrl ? '' : 'cr-arcade-bg'}`}>
      {rotate ? <StatsBackdrop animate={prefs.animations} />
        : staticUrl ? <StaticBackdrop url={staticUrl} />
          : <div className="absolute inset-0 overflow-hidden pointer-events-none"><HubStage /></div>}
    <div ref={scroller} className="crs page-fade h-full overflow-y-auto custom-scrollbar relative">
      {seo && (
        <SEO image={previewImage(seo.path)} {...seo} lang={lang} search={lang === 'en' ? '?lang=en' : ''}
          alternates={[{ hrefLang: 'de', search: '' }, { hrefLang: 'en', search: '?lang=en' }, { hrefLang: 'x-default', search: '' }]} />
      )}
      <div className="relative z-10 min-h-full flex flex-col">
        <div className="shrink-0 flex items-center gap-2 px-3 md:px-6 pt-3 md:pt-5 relative z-30">
          {/* Zurück geht EINEN Schritt zurück (Spieler → Gegner → Karte und wieder zurück). Wer direkt über einen Link
              hier gelandet ist, hat keinen Schritt davor — dann führt der Knopf zum Hub. Die Krone führt immer dorthin. */}
          {isMain
            ? <Link to="/" className={`${CHIP} px-3.5`}><ArrowLeft size={16} /><span>{t.website}</span></Link>
            : canGoBack
              ? <button type="button" onClick={() => navigate(-1)} className={`${CHIP} px-3.5`}><ArrowLeft size={16} /><span>{t.stepBack}</span></button>
              : <Link to={`/clash${q}`} className={`${CHIP} px-3.5`}><ArrowLeft size={16} /><span>{t.back}</span></Link>}
          {canGoBack && !isMain && (
            <Link to={`/clash${q}`} className={`${CHIP} w-11 justify-center`} title={t.back} aria-label={t.back}><CrCrown size={24} /></Link>
          )}
          <div className="flex-1" />
          <LanguageSelect lang={lang} onChange={changeLang} languages={['de', 'en']} />
          <button type="button" onClick={openSettings} className={`${CHIP} w-11 justify-center`} title={t.settings} aria-label={t.settings}>
            <CrSettings size={24} />
          </button>
        </div>

        <div className="w-full max-w-6xl mx-auto px-3 md:px-6 pt-3 relative z-20 flex flex-col lg:flex-row lg:items-center gap-3">
          <nav className="crs-nav lg:flex-1" aria-label="Clash Royale Stats">
            {nav.map(({ to, icon: Icon, img, label, on }) => (
              <Link key={to} to={`${to}${q}`} aria-current={on ? 'page' : undefined}>
                {img ? <img src={img} alt="" className="h-5 w-5 object-contain" /> : <Icon size={20} />} {label}
              </Link>
            ))}
          </nav>
          {!noSearch && <div className="lg:w-80"><ScoutSearch /></div>}
        </div>

        <main className={`flex-1 w-full ${wide ? 'max-w-[1720px]' : 'max-w-6xl crs-main--side'} mx-auto px-3 md:px-6 pt-4 pb-10`}>
          {/* Favoriten links, zuletzt Angesehenes rechts in den Rändern (scout.css .crs-sidegrid, erst auf breiten
              Bildschirmen). Die Startseite (wide) ordnet beide selbst an. */}
          {wide ? children : (
            <div className="crs-sidegrid">
              <div className="crs-sidegrid-main min-w-0">{children}</div>
              <aside className="crs-sidegrid-left"><SavedPanel which="favorites" /></aside>
              <aside className="crs-sidegrid-right"><SavedPanel which="recent" /></aside>
            </div>
          )}
        </main>

        <footer className="w-full max-w-6xl mx-auto px-3 md:px-6 pb-8">
          {!isMain && <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm">
            <span className="cr-eyebrow">{t.moreTitle}</span>
            <Link to={`/clash-royale${q}`} className="crs-link text-white/80">{t.moreMinigames}</Link>
            <Link to={`/clash?reiter=kartenspiele${lang === 'en' ? '&lang=en' : ''}`} className="crs-link text-white/80">{t.moreCardGames}</Link>
            <Link to={`/clash?reiter=streamer${lang === 'en' ? '&lang=en' : ''}`} className="crs-link text-white/80">{t.moreStreamer}</Link>
          </div>}
          <p className="text-white/35 text-[11px] text-center max-w-lg mx-auto leading-relaxed mt-5">
            {t.notAffiliated}{' '}
            <a href="https://supercell.com/en/fan-content-policy/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-white/60">{t.fanPolicy}</a>.
          </p>
          <ShellLegalLinks className="mt-3 text-white/50" linkClassName="hover:text-white transition-colors" />
        </footer>
      </div>
    </div>
    </div>
  );
}
