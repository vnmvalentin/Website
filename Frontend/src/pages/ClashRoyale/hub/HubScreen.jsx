// Startseite der Clash-Royale-Minigames — jetzt ein Videospiel-Hauptmenü statt einer
// Seite mit offen nebeneinanderstehenden Panels.
//
// AUFBAU: Titel → animiertes Hero-Bild → fünf gestapelte Menü-Knöpfe. Ein Klick auf einen
// Knopf wechselt NICHT die Route, sondern nur den lokalen `view`-Zustand — genau das
// Muster, das ClashRoyalePage.jsx schon auf der obersten Ebene benutzt (phase: hub/lobby/
// game). Jeder View hat einen Zurück-Pfeil zum Menü.
//
// WICHTIG — SEO bleibt unverändert gültig: Alle Views sind IMMER im DOM, nur `hidden`
// blendet die inaktiven aus. Der Grund steht schon in jsonLd.js: Google erwartet die
// Modusbeschreibungen (ItemList) und FAQ-Antworten (FAQPage) im DOM zu finden — vorher
// löste line-clamp/<details> dieselbe Aufgabe fürs Kürzen, jetzt eben `hidden` fürs
// Verstecken hinter einem Menüpunkt. Nichts davon darf conditional unmounten.
//
// Das Profil-Icon oben ersetzt den früheren "Streamer Setup"-Knopf — Streamer-Setup liegt
// jetzt als zweiter Reiter IM Profil (ProfileModal.jsx), zusammen mit Twitch-Verbindung,
// Name, Avatar und dem verknüpften Clash-Royale-Account.

import React, { useEffect, useState } from 'react';
import { Sword, Link2, Info, Gamepad2, HelpCircle, LifeBuoy, ArrowLeft } from 'lucide-react';
import SEO from '../../../components/SEO';
import ProfileModal from '../profile/ProfileModal';
import PlayerAvatar from '../components/PlayerAvatar';
import { AVATAR_IDS, AVATAR_URL_MAP } from '../components/avatars';
import LanguageSelect from '../components/LanguageSelect';
import UsedByPanel from './UsedByPanel';
import ModeCard from './ModeCard';
import ModeTutorialModal from './ModeTutorialModal';
import HeroCarousel from './HeroCarousel';
import { TUTORIAL_I18N } from './modeTutorials';
import FaqAccordion from '../../../components/FaqAccordion';
import ChunkyButton from '../ui/ChunkyButton';
import ArcadeTitle from '../ui/ArcadeTitle';
import { MODES, modeNameFor, modeDescFor, modeInfo } from '../modesConfig';
import { buildClashJsonLd } from '../jsonLd';
// Echte Clash-Royale-UI-Symbole (RoyaleAPI-CDN, siehe src/assets/clashRoyale/ui/README) —
// lokal gespeichert statt live von royaleapi.com eingebunden, damit die Seite nicht von
// einem fremden CDN abhängt.
import battleIcon from '../../../assets/clashRoyale/ui/battle.png';
import cardsIcon from '../../../assets/clashRoyale/ui/cards.png';
import socialIcon from '../../../assets/clashRoyale/ui/social.png';
import friendsIcon from '../../../assets/clashRoyale/ui/icon_menu_friends.png';
import newsIcon from '../../../assets/clashRoyale/ui/icon_menu_news_royale.png';
import crownGif from '../../../assets/clashRoyale/ui/crown-animated.webp';

// Menüpunkt → Symbol + Farbe der ChunkyButton. Eine Tabelle statt fünf einzelner JSX-Blöcke,
// damit ein neuer Menüpunkt (z.B. später "Profil") nur eine Zeile braucht. iconSrc (echtes
// CR-Symbol) hat Vorrang vor icon (lucide) — siehe ChunkyButton.jsx.
const MENU_ITEMS = [
  { view: 'create', iconSrc: battleIcon, icon: Sword, variant: 'green' },
  { view: 'join', iconSrc: socialIcon, icon: Link2, variant: 'blue' },
  { view: 'minigames', iconSrc: cardsIcon, icon: Gamepad2, variant: 'gold' },
  { view: 'faq', iconSrc: newsIcon, icon: HelpCircle, variant: 'blue' },
  { view: 'support', iconSrc: friendsIcon, icon: LifeBuoy, variant: 'blue' },
];

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
        <PlayerAvatar avatarId={selectedAvatar} avatarUrl={selectedAvatarUrl} size={40} />
        <input
          value={playerName}
          onChange={e => setPlayerName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onEnter()}
          placeholder={t.namePlaceholder}
          maxLength={20}
          className="flex-1 min-w-0 bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-white/25 focus:border-violet-500 outline-none text-sm transition-colors"
        />
      </div>

      {AVATAR_IDS.length > 0 && (
        <div>
          <p className="text-white/40 text-xs mb-2">{t.avatarLabel}</p>
          <div className="flex flex-wrap gap-2">
            {AVATAR_IDS.map(id => (
              <button key={id}
                onClick={() => { setSelectedAvatar(id); setSelectedAvatarUrl(null); }}
                title={id.replace(/\.[^.]+$/, '')}
                className={`rounded-full overflow-hidden border-2 transition-colors shrink-0 ${
                  !selectedAvatarUrl && selectedAvatar === id
                    ? 'border-violet-400 ring-2 ring-violet-400/30'
                    : 'border-white/15 hover:border-white/40'
                }`}
                style={{ width: 42, height: 42 }}>
                <img src={AVATAR_URL_MAP[id]} alt={id} width={42} height={42}
                  loading="lazy" decoding="async"
                  className="w-full h-full object-cover object-center" />
              </button>
            ))}
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
}) {
  // 'menu' | 'create' | 'join' | 'minigames' | 'faq' | 'support'
  const [view, setView] = useState('menu');
  const [joinCode, setJoinCode] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);
  const [tutorialMode, setTutorialMode] = useState(null);

  const menuLabel = { create: t.tabCreate, join: t.tabJoin, minigames: t.menuMinigames, faq: t.faqHeading, support: t.tabSupport };

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

      {/* Profil/Sprache hängen HIER, außerhalb des zentrierten Inhalts unten — sonst
          würden sie mit diesem mitwandern, sobald er auf einem hohen Bildschirm vertikal
          zentriert wird, und säßen nicht mehr "ganz oben rechts im Bild". Getrennt von
          allem anderen, auf jeder Ansicht an derselben Stelle. */}
      <div className="absolute top-3 md:top-5 right-3 md:right-6 flex flex-col items-end gap-2 z-20">
        <button
          onClick={() => setProfileOpen(true)}
          className="flex items-center gap-2.5 pl-2 pr-4 py-2 rounded-xl bg-[#17293f] hover:bg-[#1d3348] border-2 transition-colors font-arcade font-semibold text-sm text-white"
          style={{ borderColor: 'var(--cr-arcade-ink)', boxShadow: '0 3px 0 rgba(0,0,0,0.35)' }}>
          <PlayerAvatar avatarId={selectedAvatar} avatarUrl={selectedAvatarUrl} size={30} />
          {t.profileBtn}
        </button>
        <LanguageSelect lang={lang} onChange={changeLang} />
      </div>

      {/* min-h-full + items-center: zentriert den ÜBRIGEN Inhalt vertikal, WENN er ins
          Sichtfenster passt (z.B. 2560×1440 — vorher klebte alles oben und darunter blieb
          eine große leere Fläche), UND lässt ihn normal von oben scrollen, wenn er es (auf
          kleineren Bildschirmen) doch nicht tut — min-height ist nur eine Untergrenze. */}
      <div className="min-h-full w-full flex items-center justify-center px-3 md:px-6 py-2 md:py-3">
        <div className="max-w-6xl w-full mx-auto relative">

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

          {/* ══ Hauptmenü ══════════════════════════════════════════════════════ */}
          <div hidden={view !== 'menu'} className="flex flex-col items-center gap-1.5 py-0.5">
            {/* sm:mt-0: Auf schmalen Bildschirmen schwebt das Profil/Sprache-Badge oben
                rechts über der ansonsten vertikal zentrierten ersten Zeile — genug Abstand
                nach oben, damit der Titel darunter startet statt dahinter zu verschwinden. */}
            <div className="flex flex-col items-center gap-0.5 mt-20 sm:mt-0">
              {/* Ohne Rahmen/Kasten, direkt über dem Titel, dicht dran statt mit großer
                  Lücke. Feste statt responsiv wachsender Größe — auf einem breiten, aber
                  nicht sehr hohen Bildschirm (z.B. 1920×1080) reißt eine mit der Breite
                  mitwachsende Krone sonst die Höhe, obwohl nur die Breite groß ist. */}
              <img src={crownGif} alt="" className="h-14 md:h-16 w-auto pointer-events-none" />
              {/* Kleiner als sm:, damit der Titel auf schmalen Bildschirmen nicht unter das
                  oben rechts schwebende Profil/Sprache-Badge läuft — ab md (Tablet/Desktop,
                  wo rechts genug Platz ist) darf er wie gewünscht größer sein. */}
              <ArcadeTitle as="h1" className="text-xl sm:text-3xl md:text-4xl text-center leading-tight -mt-1 px-1">
                Valentins Clash Royale<br />Deck Draft Minigames
              </ArcadeTitle>
              <p className="text-white/50 text-sm">{t.subtitle}</p>
            </div>

            {/* Drei Spalten wie im allerersten Entwurf: "Benutzt von" fest links (ab lg,
                auf dem Handy ganz weg — dort ist die Liste verzichtbarer Ballast), Karussell
                + Knöpfe zusammen in der Mitte — eine gleich breite LEERE dritte Spalte
                gleicht die linke aus, sonst stünde die Mitte nicht mittig auf der Seite,
                sondern um die Breite der linken Spalte nach rechts verschoben. Knöpfe stecken
                BEWUSST mit im selben Grid-Feld wie das Karussell (nicht mehr als eigener
                Flex-Block danach): eine Grid-Zeile ist immer so hoch wie ihre höchste Spalte,
                stünde "Benutzt von" (voll ausgeklappt eher hoch) als eigene Spalte daneben,
                risse das sonst eine Lücke zwischen Karussell und Knöpfen auf, obwohl die
                Knöpfe rein visuell direkt unters Karussell gehören. items-start lässt alle
                Spalten oben bündig anfangen. */}
            <div className="w-full grid grid-cols-1 lg:grid-cols-[15rem_minmax(0,1fr)_15rem] lg:items-start gap-2 lg:gap-4">
              <div className="hidden lg:block">
                {/* Ohne Höhen-Deckel: die Liste soll komplett sichtbar sein, alle Streamer
                    auf einen Blick, kein eigenes Scrollen mehr innerhalb der Box. */}
                <UsedByPanel t={t} />
              </div>
              <div className="flex flex-col items-center gap-3">
                <HeroCarousel lang={lang} />
                <div className="w-full max-w-md flex flex-col gap-3">
                  {MENU_ITEMS.map(({ view: v, icon, iconSrc, variant }) => (
                    <ChunkyButton key={v} variant={variant} size="lg" block icon={icon} iconSrc={iconSrc}
                      onClick={() => setView(v)}>
                      {menuLabel[v]}
                    </ChunkyButton>
                  ))}
                </div>
              </div>
              <div className="hidden lg:block" aria-hidden="true" />
            </div>

            {/* mt-2: reiner Abstand zum Schatten des untersten Knopfes — ohne den saß der
                Hinweistext sichtbar IN dessen Drop-Shadow. */}
            <p className="text-white/30 text-xs text-center mt-2">{t.playNowHint}</p>
            {/* Fan-Content-Hinweis auch direkt hier, nicht nur unter "Häufige Fragen" —
                soll sichtbar sein, ohne dass man extra klicken muss. */}
            <p className="text-white/30 text-[11px] text-center max-w-lg leading-relaxed">
              {t.introText} {t.disclaimerMore}{' '}
              <a href={t.disclaimerUrl} target="_blank" rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-white/55 transition-colors">
                {t.disclaimerUrlLabel}
              </a>
            </p>
          </div>

          {/* ══ Lobby erstellen ════════════════════════════════════════════════
              Unteransichten bewusst OHNE Streamer-Sidebar und schmaler als das Hauptmenü —
              "nur die Blase" der jeweiligen Aktion, nicht die ganze Seitenbreite. */}
          <div hidden={view !== 'create'} className="max-w-xl mx-auto flex flex-col gap-4 pt-2">
            <BackButton />
                <div className="cr-arcade-panel p-5 md:p-6 space-y-5">
                  <h2 className="font-arcade text-white text-lg">{t.tabCreate}</h2>
                  <PlayerIdentityFields
                    t={t} playerName={playerName} setPlayerName={setPlayerName}
                    selectedAvatar={selectedAvatar} setSelectedAvatar={setSelectedAvatar}
                    selectedAvatarUrl={selectedAvatarUrl} setSelectedAvatarUrl={setSelectedAvatarUrl}
                    onEnter={submitCreate}
                  />
                  <ChunkyButton variant="green" size="lg" block iconSrc={battleIcon} onClick={submitCreate}>
                    {t.createBtn}
                  </ChunkyButton>
                  {view === 'create' && error && <p className="text-red-400 text-sm text-center">{error}</p>}
                </div>
              </div>

              {/* ══ Lobby beitreten ════════════════════════════════════════════════
                  Erst wer man ist (Name/Avatar — gilt für beide Wege darunter), dann
                  öffentliche Lobbies zum Direktbeitritt, dann Code-Eingabe für private. */}
              <div hidden={view !== 'join'} className="max-w-xl mx-auto flex flex-col gap-4 pt-2">
                <BackButton />

                <div className="cr-arcade-panel p-5 md:p-6 space-y-5">
                  <h2 className="font-arcade text-white text-lg">{t.tabJoin}</h2>
                  <PlayerIdentityFields
                    t={t} playerName={playerName} setPlayerName={setPlayerName}
                    selectedAvatar={selectedAvatar} setSelectedAvatar={setSelectedAvatar}
                    selectedAvatarUrl={selectedAvatarUrl} setSelectedAvatarUrl={setSelectedAvatarUrl}
                    onEnter={submitJoin}
                  />
                  {view === 'join' && error && <p className="text-red-400 text-sm text-center">{error}</p>}
                </div>

                <div className="cr-arcade-panel p-5 md:p-6 space-y-5">
                  <h2 className="font-arcade text-white text-lg">{t.codeLabel}</h2>
                  <input
                    value={joinCode}
                    onChange={e => setJoinCode(e.target.value.toUpperCase())}
                    onKeyDown={e => e.key === 'Enter' && submitJoin()}
                    placeholder={t.codePlaceholder}
                    maxLength={6}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-white/25 focus:border-violet-500 outline-none text-sm font-mono tracking-widest uppercase transition-colors"
                  />
                  <ChunkyButton variant="blue" size="lg" block iconSrc={socialIcon} onClick={submitJoin}>
                    {t.joinBtn}
                  </ChunkyButton>
                </div>

                {/* Unter dem Code-Beitreten-Knopf statt darüber — bei sehr vielen gleichzeitig
                    offenen Lobbies würde die Liste sonst so lang, dass der Knopf zum
                    Code-Beitreten nicht mehr erreichbar wäre. */}
                {publicLobbies.length > 0 && (
                  <div className="cr-arcade-panel p-5 md:p-6 space-y-3">
                    <h2 className="font-arcade text-white text-lg">{t.publicLobbiesHeading}</h2>
                    <div className="flex flex-col gap-2">
                      {publicLobbies.map(pl => {
                        const info = modeInfo(pl.mode);
                        const Icon = info.icon;
                        return (
                          <div key={pl.code}
                            className="flex items-center gap-3 bg-black/30 border border-white/10 rounded-lg px-3.5 py-2.5">
                            <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-violet-500/10 border border-violet-400/20 text-violet-300 shrink-0">
                              <Icon size={16} />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-white text-sm font-semibold truncate">{modeNameFor(pl.mode, lang)}</p>
                              <p className="text-white/40 text-xs truncate">
                                {t.publicLobbyBy(pl.hostName)} · {t.playersOfMax(pl.playerCount, pl.maxPlayers)}
                              </p>
                            </div>
                            <ChunkyButton variant="green" size="sm" iconSrc={socialIcon}
                              onClick={() => onJoin(pl.code)}>
                              {t.joinBtn}
                            </ChunkyButton>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* ══ Minigames ══════════════════════════════════════════════════════
                  Textinhalt (Name+Beschreibung je Modus) bleibt unverändert im DOM —
                  siehe jsonLd.js (ItemList). Nur die Kartenoptik bekommt ihren vollen
                  Comic-Look erst in der letzten Ausbaustufe (ArcadeCard-Rahmen). */}
              <div hidden={view !== 'minigames'} className="max-w-5xl mx-auto flex flex-col gap-4 pt-2">
                <BackButton />
                <div className="cr-arcade-panel p-5 md:p-6">
                  <div className="flex items-baseline justify-between gap-3 mb-3.5">
                    <h2 className="font-arcade text-white text-lg">{t.modesHeading}</h2>
                    <span className="text-white/30 text-xs tabular-nums">{t.modesCount(availableModes.length)}</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
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
              <div hidden={view !== 'faq'} className="max-w-xl mx-auto flex flex-col gap-4 pt-2">
                <BackButton />
                <div className="cr-arcade-panel p-5 md:p-6 space-y-6">
                  <div className="rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-4">
                    <div className="flex items-start gap-3">
                      <Info size={16} className="text-amber-400 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <h3 className="text-amber-300 font-bold text-sm mb-1">{t.aboutHeading}</h3>
                        <p className="text-white/70 text-sm leading-relaxed">{t.introText}</p>
                        <p className="text-white/45 text-xs leading-relaxed mt-1.5">
                          {t.disclaimerMore}{' '}
                          <a href={t.disclaimerUrl} target="_blank" rel="noopener noreferrer"
                            className="text-amber-300 hover:text-amber-200 underline underline-offset-2 break-all">
                            {t.disclaimerUrlLabel}
                          </a>
                        </p>
                      </div>
                    </div>
                  </div>
                  <FaqAccordion items={t.faqItems} heading={t.faqHeading} />
                </div>
              </div>

              {/* ══ Support ════════════════════════════════════════════════════════ */}
              <div hidden={view !== 'support'} className="max-w-xl mx-auto flex flex-col gap-4 pt-2">
                <BackButton />
                <div className="cr-arcade-panel p-5 md:p-6">
                  <h2 className="font-arcade text-white text-lg mb-3">{t.tabSupport}</h2>
                  <div className="flex flex-wrap gap-3">
                    <a href="https://discord.gg/ecRJSx2R6x" target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2.5 px-4 py-2.5 rounded-lg bg-black/25 border border-white/10 hover:border-[#5865F2]/50 hover:bg-[#5865F2]/10 transition-colors">
                      <img src="https://cdn.simpleicons.org/discord/5865F2" alt="" className="w-5 h-5 shrink-0" />
                      <span className="text-white font-semibold text-sm">{t.joinDiscord}</span>
                    </a>
                    <a href="https://twitch.tv/vnmvalentin" target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2.5 px-4 py-2.5 rounded-lg bg-black/25 border border-white/10 hover:border-[#9146FF]/50 hover:bg-[#9146FF]/10 transition-colors">
                      <img src="https://cdn.simpleicons.org/twitch/9146FF" alt="" className="w-5 h-5 shrink-0" />
                      <span className="text-white font-semibold text-sm">twitch.tv/vnmvalentin</span>
                    </a>
                  </div>
                </div>
              </div>

        </div>
      </div>
    </div>
  );
}
