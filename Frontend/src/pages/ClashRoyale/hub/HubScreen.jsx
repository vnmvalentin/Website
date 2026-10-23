// Startseite der Clash-Royale-Minigames — ein Videospiel-Hauptmenü statt einer Seite mit
// offen nebeneinanderstehenden Panels.
//
// AUFBAU: Titel → animiertes Hero-Bild → sechs gestapelte Menü-Knöpfe. Ein Klick auf einen
// Knopf wechselt NICHT die Route, sondern nur den lokalen `view`-Zustand — genau das
// Muster, das ClashRoyalePage.jsx schon auf der obersten Ebene benutzt (phase: hub/lobby/
// game). Jeder View hat einen Zurück-Knopf zum Menü.
//
// WICHTIG — SEO bleibt unverändert gültig: Alle Views sind IMMER im DOM, nur `hidden`
// blendet die inaktiven aus. Der Grund steht schon in jsonLd.js: Google erwartet die
// Modusbeschreibungen (ItemList) und FAQ-Antworten (FAQPage) im DOM zu finden — vorher
// löste line-clamp/<details> dieselbe Aufgabe fürs Kürzen, jetzt eben `hidden` fürs
// Verstecken hinter einem Menüpunkt. Nichts davon darf conditional unmounten.
//
// Seit Sept. 2026 ohne Website-Kopfzeile und ohne eigene Leiste (siehe ui/CrShell.jsx): Die
// obere Zeile dieser Seite trägt links den Weg zurück zur Website, rechts Profil + Sprache.
// Das Profil ersetzt den früheren "Streamer Setup"-Knopf — Streamer-Setup liegt als zweiter
// Reiter IM Profil (ProfileModal.jsx).

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowLeftToLine } from 'lucide-react';
import SEO from '../../../components/SEO';
import ProfileModal from '../profile/ProfileModal';
import PlayerAvatar from '../components/PlayerAvatar';
import { AVATAR_IDS, AVATAR_URL_MAP } from '../components/avatars';
import LanguageSelect from '../components/LanguageSelect';
import UsedByPanel from './UsedByPanel';
import FriendsPanel from './FriendsPanel';
import ModeCard from './ModeCard';
import ModeTutorialModal from './ModeTutorialModal';
import { TUTORIAL_I18N } from './modeTutorials';
import FaqAccordion from '../../../components/FaqAccordion';
import ChunkyButton from '../ui/ChunkyButton';
import ArcadeTitle from '../ui/ArcadeTitle';
import PopText from '../ui/PopText';
import HubStage from './HubStage';
import {
  CrBattle, CrSocial, CrCards, CrNews, CrFriends, CrInfo, CrLock, CrRegion, CrQuestion, CrChat, CrTourneyTrophy,
} from '../ui/CrIcons';
import TournamentHubView from '../tournament/TournamentHubView';
import { tDict } from '../tournament/tI18n';
import { MODES, modeNameFor, modeDescFor, modeInfo } from '../modesConfig';
import { buildClashJsonLd } from '../jsonLd';
import { useCrPrefs } from '../ui/crPrefs';
import { CrSettings } from '../ui/CrIcons';
import crownGif from '../../../assets/clashRoyale/ui/crown-animated.webp';

// Menüpunkt → Symbol + Farbe der ChunkyButton. Eine Tabelle statt fünf einzelner JSX-Blöcke,
// damit ein neuer Menüpunkt nur eine Zeile braucht. Alle Symbole sind echte CR-Grafiken
// (ui/CrIcons.jsx) und gehen deshalb über `icon` — dieselbe Schnittstelle wie lucide.
const MENU_ITEMS = [
  { view: 'create', icon: CrBattle, variant: 'green' },
  { view: 'join', icon: CrSocial, variant: 'blue' },
  { view: 'tournaments', icon: CrTourneyTrophy, variant: 'gold' },
  { view: 'minigames', icon: CrCards, variant: 'gold' },
  { view: 'faq', icon: CrNews, variant: 'blue' },
  { view: 'support', icon: CrFriends, variant: 'blue' },
];

/** Überschrift einer Unteransicht — Titelschrift mit CR-Symbol, wie die Abschnitte der Lobby. */
function ViewTitle({ icon: Icon, children, right }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="cr-section-title text-xl">
        {Icon && <Icon size={28} />}
        {children}
      </h2>
      {right}
    </div>
  );
}

/** Name + Avatar-Wahl — identisch in "Erstellen" und "Beitreten", deshalb hier EINMAL
 *  statt als Kopie in beiden Views (siehe Kopiervermeidung z.B. in HostSettings.jsx).
 *  Das Twitch-Bild selbst wählt man im Profil (ProfileModal) — hier zeigt die Vorschau nur,
 *  was aktuell aktiv ist, und ein Klick auf einen festen Avatar schaltet zurück darauf. */
function PlayerIdentityFields({
  t, playerName, setPlayerName,
  selectedAvatar, setSelectedAvatar, selectedAvatarUrl, setSelectedAvatarUrl,
  onEnter,
}) {
  return (
    <>
      <div className="flex items-center gap-3">
        <PlayerAvatar avatarId={selectedAvatar} avatarUrl={selectedAvatarUrl} size={52} />
        <input
          value={playerName}
          onChange={e => setPlayerName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onEnter()}
          placeholder={t.namePlaceholder}
          maxLength={20}
          className="cr-input flex-1 min-w-0 px-4 py-3 text-base font-semibold"
        />
      </div>

      {AVATAR_IDS.length > 0 && (
        <div>
          <p className="cr-eyebrow mb-2.5">{t.avatarLabel}</p>
          {/* Eigene eingelassene Spur für die Auswahl — dieselbe Formsprache wie die
              Segment-Auswahl in den Einstellungen, statt loser Kreise auf der Fläche. */}
          <div className="rounded-2xl bg-[#081426] border border-[rgba(2,8,20,0.8)] p-2.5 shadow-[inset_0_2px_4px_rgba(0,0,0,0.45)]">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(48px,1fr))] gap-2 max-h-[172px] overflow-y-auto custom-scrollbar pr-1">
              {AVATAR_IDS.map(id => {
                const active = !selectedAvatarUrl && selectedAvatar === id;
                return (
                  <button key={id} type="button"
                    onClick={() => { setSelectedAvatar(id); setSelectedAvatarUrl(null); }}
                    title={id.replace(/\.[^.]+$/, '').replace(/_/g, ' ')}
                    aria-pressed={active}
                    className={`cr-avatar-pick aspect-square rounded-full overflow-hidden border-[3px] transition-colors ${
                      active ? 'border-[var(--cr-arcade-gold)]' : 'border-[var(--cr-panel-edge)] hover:border-white/50'
                    }`}>
                    <img src={AVATAR_URL_MAP[id]} alt={id} width={48} height={48}
                      loading="lazy" decoding="async"
                      className="w-full h-full object-cover object-center" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function HubScreen({
  lang, t, changeLang,
  playerName, setPlayerName,
  selectedAvatar, setSelectedAvatar,
  selectedAvatarUrl, setSelectedAvatarUrl,
  initialJoinCode,
  onCreate, onJoin,
  error,
  publicLobbies = [],
  profile, updateProfile, linkCr, unlinkCr, switchActiveCr,
  friends, user, login, onJoinFriend,
}) {
  // 'menu' | 'create' | 'join' | 'tournaments' | 'minigames' | 'faq' | 'support'
  const [view, setView] = useState('menu');
  const [joinCode, setJoinCode] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);
  const [tutorialMode, setTutorialMode] = useState(null);
  // Intro (Krone, Buchstaben, einfliegende Knöpfe) nur beim ersten Öffnen — kommt man aus einer
  // Unteransicht zurück, gleitet das Menü nur kurz herein, statt die ganze Show zu wiederholen.
  const [intro, setIntro] = useState(true);
  useEffect(() => { if (view !== 'menu') setIntro(false); }, [view]);
  const { openSettings } = useCrPrefs();

  const menuLabel = {
    create: t.tabCreate, join: t.tabJoin, tournaments: tDict(lang).menuTournaments,
    minigames: t.menuMinigames, faq: t.faqHeading, support: t.tabSupport,
  };

  // Einladungslink (?code=): Code steht schon fest — direkt in die Beitreten-Ansicht springen
  useEffect(() => {
    if (!initialJoinCode) return;
    setJoinCode(initialJoinCode);
    setView('join');
  }, [initialJoinCode]);

  const submitCreate = () => onCreate();
  const submitJoin = () => onJoin(joinCode);
  const availableModes = MODES.filter(m => m.available);
  const tutorialLabels = TUTORIAL_I18N[lang] || TUTORIAL_I18N.de;

  // self-start: ohne das streckt der flex-col-Elternblock den Knopf sonst auf die volle
  // Breite (Flex-Default align-items: stretch) — sah wie ein zu breiter Balken aus.
  const BackButton = () => (
    <ChunkyButton variant="blue" size="sm" icon={ArrowLeft} onClick={() => setView('menu')} className="self-start">
      {t.menuBack}
    </ChunkyButton>
  );

  // Gemeinsamer Stil der beiden Chips oben (Website / Profil) — derselbe wie LanguageSelect.
  const chipClass = 'cr-chip flex items-center gap-2 h-11 rounded-xl font-cr text-[15px] text-white transition-colors';

  return (
    <div className="page-fade cr-arcade-bg h-full overflow-y-auto custom-scrollbar relative">
      <SEO
        title={t.seoTitle}
        description={t.seoDesc}
        keywords={t.seoKeywords}
        path="/clash-royale"
        search={lang === 'de' ? '' : `?lang=${lang}`}
        lang={lang}
        alternates={[
          { hrefLang: 'de', search: '' },
          { hrefLang: 'en', search: '?lang=en' },
          { hrefLang: 'es', search: '?lang=es' },
          { hrefLang: 'x-default', search: '' },
        ]}
        jsonLd={buildClashJsonLd(t, lang)} />

      {/* Langsam wanderndes Rautenmuster hinter allem (hub/HubStage.jsx) */}
      <HubStage />

      {profileOpen && (
        <ProfileModal
          lang={lang} t={t}
          profile={profile} updateProfile={updateProfile} linkCr={linkCr} unlinkCr={unlinkCr} switchActiveCr={switchActiveCr}
          onClose={() => setProfileOpen(false)}
        />
      )}

      {tutorialMode && (
        <ModeTutorialModal
          mode={tutorialMode}
          name={modeNameFor(tutorialMode.id, lang)}
          description={modeDescFor(tutorialMode.id, lang)}
          lang={lang}
          onClose={() => setTutorialMode(null)}
        />
      )}

      {/* min-h-full + flex-col: Die obere Zeile steht oben, der Rest füllt die Höhe und
          zentriert sich darin vertikal, WENN er ins Fenster passt (z.B. 2560×1440), und
          scrollt normal von oben, wenn nicht — min-height ist nur eine Untergrenze. */}
      <div className="relative z-10 min-h-full flex flex-col">

        {/* ── Obere Zeile: zurück zur Website | Profil + Sprache ─────────────────── */}
        <div className="shrink-0 flex items-center gap-2 px-3 md:px-6 pt-3 md:pt-5 relative z-20">
          <Link to="/clash" className={`${chipClass} px-3.5`} title={t.backToWebsite}>
            <ArrowLeftToLine size={16} />
            <span className="hidden sm:inline">{t.backToWebsite}</span>
          </Link>
          <div className="flex-1" />
          <button onClick={() => setProfileOpen(true)} className={`${chipClass} pl-1.5 pr-4`}>
            <PlayerAvatar avatarId={selectedAvatar} avatarUrl={selectedAvatarUrl} size={32} />
            {t.profileBtn}
          </button>
          <LanguageSelect lang={lang} onChange={changeLang} />
          <button onClick={openSettings} className={`${chipClass} w-11 justify-center`} title={t.settingsSection} aria-label={t.settingsSection}>
            <CrSettings size={24} />
          </button>
        </div>

        <div className="flex-1 w-full flex items-center justify-center px-3 md:px-6 pt-1 pb-3">
          <div className="max-w-6xl w-full mx-auto">

            {/* ══ Hauptmenü ══════════════════════════════════════════════════════ */}
            <div hidden={view !== 'menu'} className={`cr-hub-menu ${intro ? '' : 'cr-view-back'} flex flex-col items-center gap-2`}>
              {/* Kopf aufgeräumt (Okt. 2026): vorher Banner-Kasten, Krone, Kicker „Clash Royale“,
                  Titel und Untertitel übereinander. Jetzt nur Krone, EIN Titel und darunter eine
                  schlanke Neuigkeiten-Zeile ohne Kasten. */}
              <div className="flex flex-col items-center">
                {/* Feste statt responsiv wachsender Größe — auf einem breiten, aber nicht
                    sehr hohen Bildschirm (z.B. 1920×1080) reißt eine mit der Breite
                    mitwachsende Krone sonst die Höhe, obwohl nur die Breite groß ist. */}
                <img src={crownGif} alt="" className="cr-hub-crown h-14 md:h-16 w-auto pointer-events-none drop-shadow-[0_6px_6px_rgba(2,8,20,0.5)]" />
                <ArcadeTitle as="h1" className="text-3xl sm:text-4xl md:text-5xl text-center leading-none px-1 mt-1">
                  {intro ? <PopText text="Deck Draft Minigames" baseDelay={0.3} /> : 'Deck Draft Minigames'}
                </ArcadeTitle>
                <p className={`mt-3 max-w-[92vw] flex items-center justify-center gap-2 text-sm leading-snug text-center ${intro ? 'cr-fade-in-late' : ''}`}>
                  <span className="shrink-0 px-1.5 py-0.5 rounded-[4px] bg-[var(--cr-arcade-gold)] text-[#4a2e00] font-cr text-xs uppercase tracking-wider">
                    {t.newMode}
                  </span>
                  <span className="text-white/75">{t.news3d}</span>
                </p>
              </div>

              {/* Drei Spalten: "Benutzt von" fest links (ab lg, auf dem Handy ganz weg),
                  Karussell + Knöpfe zusammen in der Mitte, rechts gleich breit die Freundesliste
                  (auf dem Handy unter den Knöpfen) — so steht die Mitte mittig auf der Seite.
                  Knöpfe stecken BEWUSST mit im selben Grid-Feld wie das Karussell:
                  eine Grid-Zeile ist immer so hoch wie ihre höchste Spalte, als eigene Zeile
                  risse die hohe "Benutzt von"-Liste sonst eine Lücke unter dem Karussell auf. */}
              <div className="w-full grid grid-cols-1 lg:grid-cols-[16rem_minmax(0,1fr)_16rem] lg:items-start gap-3 lg:gap-6 mt-3">
                <div className={`hidden lg:block ${intro ? 'cr-fly-l' : ''}`} style={intro ? { animationDelay: '0.95s' } : undefined}>
                  <UsedByPanel t={t} />
                </div>
                <div className="flex flex-col items-center gap-4">
                  <div className={`w-full max-w-md flex flex-col gap-3.5 ${intro ? '' : 'cr-stagger'}`}>
                    {/* Intro: Knöpfe fliegen abwechselnd von links/rechts ein; der erste (Lobby
                        erstellen) trägt dauerhaft einen Glanzstreifen als Hauptaktion */}
                    {MENU_ITEMS.map(({ view: v, icon, variant }, i) => (
                      <ChunkyButton key={v} variant={variant} size="lg" block icon={icon} iconSize={30}
                        className={[intro ? (i % 2 ? 'cr-fly-r' : 'cr-fly-l') : '', i === 0 ? 'cr-shine' : ''].filter(Boolean).join(' ')}
                        style={intro ? { animationDelay: `${(0.5 + i * 0.07).toFixed(2)}s` } : undefined}
                        onClick={() => setView(v)}>
                        {menuLabel[v]}
                      </ChunkyButton>
                    ))}
                  </div>
                  {view === 'menu' && error && <p className="text-red-400 text-sm text-center">{error}</p>}
                </div>
                <div className={`w-full max-w-md mx-auto lg:max-w-none ${intro ? 'cr-fly-r' : ''}`} style={intro ? { animationDelay: '1.05s' } : undefined}>
                  <FriendsPanel lang={lang} friends={friends} user={user} login={login}
                    onJoin={onJoinFriend} maxListHeight={320} />
                </div>
              </div>

              {/* mt-3: reiner Abstand zum Schatten des untersten Knopfes — ohne den saß der
                  Hinweistext sichtbar IN dessen Drop-Shadow. */}
              <p className={`text-white/40 text-xs text-center mt-3 ${intro ? 'cr-fade-in-late' : ''}`}>{t.playNowHint}</p>
              {/* Fan-Content-Hinweis auch direkt hier, nicht nur unter "Häufige Fragen" —
                  soll sichtbar sein, ohne dass man extra klicken muss. */}
              <p className={`text-white/35 text-[11px] text-center max-w-lg leading-relaxed ${intro ? 'cr-fade-in-late' : ''}`}>
                {t.introText} {t.disclaimerMore}{' '}
                <a href={t.disclaimerUrl} target="_blank" rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-white/60 transition-colors">
                  {t.disclaimerUrlLabel}
                </a>
              </p>
            </div>

            {/* ══ Lobby erstellen ════════════════════════════════════════════════
                Unteransichten bewusst OHNE Streamer-Spalte und schmaler als das Hauptmenü —
                "nur die Blase" der jeweiligen Aktion, nicht die ganze Seitenbreite. */}
            <div hidden={view !== 'create'} className="cr-view-in max-w-xl mx-auto flex flex-col gap-4">
              <BackButton />
              <div className="cr-arcade-panel p-5 md:p-6 space-y-5">
                <ViewTitle icon={CrBattle}>{t.tabCreate}</ViewTitle>
                <PlayerIdentityFields
                  t={t} playerName={playerName} setPlayerName={setPlayerName}
                  selectedAvatar={selectedAvatar} setSelectedAvatar={setSelectedAvatar}
                  selectedAvatarUrl={selectedAvatarUrl} setSelectedAvatarUrl={setSelectedAvatarUrl}
                  onEnter={submitCreate}
                />
                <ChunkyButton variant="green" size="lg" block icon={CrBattle} iconSize={28} onClick={submitCreate}>
                  {t.createBtn}
                </ChunkyButton>
                {view === 'create' && error && <p className="text-red-400 text-sm text-center">{error}</p>}
              </div>
            </div>

            {/* ══ Lobby beitreten ════════════════════════════════════════════════
                EINE Fläche mit drei Abschnitten statt drei Kästen: wer man ist (gilt für
                beide Wege darunter), Code-Eingabe für private Lobbies, dann öffentliche
                Lobbies — die Liste bewusst zuletzt, damit sie den Code-Knopf bei vielen
                offenen Lobbies nicht aus dem Bild schiebt. */}
            <div hidden={view !== 'join'} className="cr-view-in max-w-xl mx-auto flex flex-col gap-4">
              <BackButton />
              <div className="cr-arcade-panel overflow-hidden">
                <div className="cr-section space-y-5">
                  <ViewTitle icon={CrSocial}>{t.tabJoin}</ViewTitle>
                  <PlayerIdentityFields
                    t={t} playerName={playerName} setPlayerName={setPlayerName}
                    selectedAvatar={selectedAvatar} setSelectedAvatar={setSelectedAvatar}
                    selectedAvatarUrl={selectedAvatarUrl} setSelectedAvatarUrl={setSelectedAvatarUrl}
                    onEnter={submitJoin}
                  />
                  {view === 'join' && error && <p className="text-red-400 text-sm text-center">{error}</p>}
                </div>

                <div className="cr-section space-y-4">
                  <h3 className="cr-section-title"><CrLock size={22} />{t.codeLabel}</h3>
                  <input
                    value={joinCode}
                    onChange={e => setJoinCode(e.target.value.toUpperCase())}
                    onKeyDown={e => e.key === 'Enter' && submitJoin()}
                    placeholder={t.codePlaceholder}
                    maxLength={6}
                    className="cr-input px-4 py-3 text-lg font-cr tracking-[0.3em] uppercase text-center"
                  />
                  <ChunkyButton variant="blue" size="lg" block icon={CrSocial} iconSize={28} onClick={submitJoin}>
                    {t.joinBtn}
                  </ChunkyButton>
                </div>

                {publicLobbies.length > 0 && (
                  <div className="cr-section space-y-3">
                    <h3 className="cr-section-title"><CrRegion size={22} />{t.publicLobbiesHeading}</h3>
                    <div className="flex flex-col gap-2">
                      {publicLobbies.map(pl => {
                        const Icon = modeInfo(pl.mode).icon;
                        return (
                          <div key={pl.code} className="cr-tile-btn cr-tile-btn--static px-3 py-2.5">
                            <span className="cr-tile-icon w-11 h-11"><Icon size={28} /></span>
                            <div className="min-w-0 flex-1">
                              <p className="font-cr text-white text-[15px] truncate">{modeNameFor(pl.mode, lang)}</p>
                              <p className="text-white/50 text-xs truncate">
                                {t.publicLobbyBy(pl.hostName)} · {t.playersOfMax(pl.playerCount, pl.maxPlayers)}
                              </p>
                            </div>
                            <ChunkyButton variant="green" size="sm" onClick={() => onJoin(pl.code)}>
                              {t.joinBtn}
                            </ChunkyButton>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ══ Minigames ══════════════════════════════════════════════════════
                Textinhalt (Name+Beschreibung je Modus) bleibt unverändert im DOM —
                siehe jsonLd.js (ItemList). */}
            <div hidden={view !== 'minigames'} className="cr-view-in max-w-5xl mx-auto flex flex-col gap-4">
              <BackButton />
              <div className="cr-arcade-panel p-5 md:p-6">
                <div className="mb-4">
                  <ViewTitle icon={CrCards}
                    right={<span className="text-white/45 text-xs tabular-nums">{t.modesCount(availableModes.length)}</span>}>
                    {t.modesHeading}
                  </ViewTitle>
                </div>
                <div className="cr-deal grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {MODES.map(m => (
                    <ModeCard
                      key={m.id}
                      mode={m}
                      name={modeNameFor(m.id, lang)}
                      description={modeDescFor(m.id, lang)}
                      comingSoonLabel={t.comingSoon}
                      howToPlayLabel={tutorialLabels.howToPlay}
                      openLabel={tutorialLabels.openLabel(modeNameFor(m.id, lang))}
                      newLabel={t.newMode}
                      onOpen={() => setTutorialMode(m)}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* ══ Häufige Fragen ═════════════════════════════════════════════════ */}
            <div hidden={view !== 'faq'} className="cr-view-in max-w-xl mx-auto flex flex-col gap-4">
              <BackButton />
              <div className="cr-arcade-panel overflow-hidden">
                <div className="cr-section">
                  <div className="flex items-start gap-3">
                    <CrInfo size={26} className="mt-0.5" />
                    <div className="min-w-0">
                      <h3 className="cr-section-title mb-1.5">{t.aboutHeading}</h3>
                      <p className="text-white/75 text-sm leading-relaxed">{t.introText}</p>
                      <p className="text-white/50 text-xs leading-relaxed mt-1.5">
                        {t.disclaimerMore}{' '}
                        <a href={t.disclaimerUrl} target="_blank" rel="noopener noreferrer"
                          className="text-[var(--cr-arcade-gold)] hover:text-white underline underline-offset-2 break-all">
                          {t.disclaimerUrlLabel}
                        </a>
                      </p>
                    </div>
                  </div>
                </div>
                <div className="cr-section">
                  <FaqAccordion items={t.faqItems}
                    heading={<><CrQuestion size={24} />{t.faqHeading}</>}
                    headingClassName="cr-section-title mb-3" />
                </div>
              </div>
            </div>

            {/* ══ Turniere ═══════════════════════════════════════════════════════ */}
            <div hidden={view !== 'tournaments'} className="cr-view-in max-w-xl mx-auto flex flex-col gap-4">
              <BackButton />
              <TournamentHubView active={view === 'tournaments'} lang={lang} />
            </div>

            {/* ══ Support ════════════════════════════════════════════════════════ */}
            <div hidden={view !== 'support'} className="cr-view-in max-w-xl mx-auto flex flex-col gap-4">
              <BackButton />
              <div className="cr-arcade-panel p-5 md:p-6">
                <div className="mb-4"><ViewTitle icon={CrChat}>{t.tabSupport}</ViewTitle></div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <a href="https://discord.gg/ecRJSx2R6x" target="_blank" rel="noopener noreferrer"
                    className="cr-tile-btn px-4 py-3">
                    <img src="https://cdn.simpleicons.org/discord/5865F2" alt="" className="w-7 h-7 shrink-0" />
                    <span className="font-cr text-white text-[15px]">{t.joinDiscord}</span>
                  </a>
                  <a href="https://twitch.tv/vnmvalentin" target="_blank" rel="noopener noreferrer"
                    className="cr-tile-btn px-4 py-3">
                    <img src="https://cdn.simpleicons.org/twitch/9146FF" alt="" className="w-7 h-7 shrink-0" />
                    <span className="font-cr text-white text-[15px] truncate">twitch.tv/vnmvalentin</span>
                  </a>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
