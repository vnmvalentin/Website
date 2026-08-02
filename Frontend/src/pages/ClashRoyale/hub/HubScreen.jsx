// Startseite der Clash-Royale-Minigames.
//
// AUFBAU: Eine schmale Spalte links, der Rest in zwei zusammenhängenden Flächen.
//
//   • Links „Benutzt von" als eigene Spalte. Bewusst ausgelagert: Die Liste wächst mit
//     jedem neuen Streamer, und innerhalb des Hauptrahmens hätte sie irgendwann die
//     Höhe des Lobby-Bereichs bestimmt.
//     Rechts steht eine gleich breite LEERE Spalte. Ohne sie stünde der Hauptteil nicht
//     in der Bildschirmmitte, sondern um die Breite der Randspalte nach rechts versetzt.
//   • Rechts ein großer gemeinsamer Rahmen: Lobby erstellen/beitreten über die volle
//     Breite, darunter die acht Modi. Vorher lag beides in eigenen Panels und die Seite
//     wirkte wie ein Haufen loser Fenster.
//   • Darunter ein kleinerer Rahmen für alles Erklärende: Kurztext, FAQ, Support.
//
// Was dabei NICHT passieren durfte: Text löschen. Die Seite trägt strukturierte Daten
// (jsonLd.js) — eine ItemList mit den Modusbeschreibungen und eine FAQPage mit allen
// Fragen. Google erwartet beides auf der Seite wiederzufinden. Der Text steht deshalb
// unverändert im DOM, nur sichtbar gekürzt: Beschreibungen per line-clamp, Fragen im
// <details>-Akkordeon. Beides zählt für Google als vorhanden.

import React, { useEffect, useState } from 'react';
import { Sword, Link2, Monitor, Info } from 'lucide-react';
import SEO from '../../../components/SEO';
import StreamerConfigPanel from '../streamer/StreamerConfigPanel';
import PlayerAvatar from '../components/PlayerAvatar';
import { AVATAR_IDS, AVATAR_URL_MAP } from '../components/avatars';
import LanguageSelect from '../components/LanguageSelect';
import UsedByPanel from './UsedByPanel';
import ModeCard from './ModeCard';
import ModeTutorialModal from './ModeTutorialModal';
import { TUTORIAL_I18N } from './modeTutorials';
import FaqAccordion from './FaqAccordion';
import { MODES, modeNameFor, modeDescFor } from '../modesConfig';
import { buildClashJsonLd } from '../jsonLd';
import archerQueenImg from '../../../assets/clashRoyale/goldenknight.png';

export default function HubScreen({
  lang, t, changeLang,
  playerName, setPlayerName,
  selectedAvatar, setSelectedAvatar,
  initialJoinCode,
  onCreate, onJoin,
  error,
}) {
  const [hubTab, setHubTab] = useState('create');   // 'create' | 'join'
  const [joinCode, setJoinCode] = useState('');
  const [streamerCfgOpen, setStreamerCfgOpen] = useState(false);
  // Welcher Modus zeigt gerade seine Anleitung (null = keiner)
  const [tutorialMode, setTutorialMode] = useState(null);

  // Kam der Besucher über einen Einladungslink, steht der Code schon fest —
  // dann direkt auf den Beitreten-Reiter springen.
  useEffect(() => {
    if (!initialJoinCode) return;
    setJoinCode(initialJoinCode);
    setHubTab('join');
  }, [initialJoinCode]);

  const submit = () => (hubTab === 'create' ? onCreate() : onJoin(joinCode));
  const availableModes = MODES.filter(m => m.available);
  const tutorialLabels = TUTORIAL_I18N[lang] || TUTORIAL_I18N.de;

  return (
    <div className="page-fade h-full overflow-y-auto custom-scrollbar">
      <SEO
        title={t.seoTitle}
        description={t.seoDesc}
        keywords={t.seoKeywords}
        path="/clash-royale"
        search={lang === 'en' ? '?lang=en' : ''}
        lang={lang}
        alternates={[
          { hrefLang: 'de', search: '' },
          { hrefLang: 'en', search: '?lang=en' },
          { hrefLang: 'x-default', search: '' },
        ]}
        jsonLd={buildClashJsonLd(t, lang)} />

      <div className="w-full px-3 md:px-6 py-5 md:py-8">
        <div className="max-w-[88rem] mx-auto flex flex-col gap-5">

          {/* ── Hero ─────────────────────────────────────────────────────────── */}
          <div className="flex flex-col items-center text-center gap-3">
            <div className="flex items-center gap-3">
              <span className="flex items-center justify-center w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-violet-500/10 border border-violet-400/20 overflow-hidden shrink-0">
                <img src={archerQueenImg} alt="" className="w-full h-full object-cover object-top" />
              </span>
              <h1 className="font-display text-2xl md:text-4xl font-bold text-white tracking-tight">
                Clash Royale Draft Minigames
              </h1>
            </div>
            <p className="text-white/50 text-sm">{t.subtitle}</p>
            <div className="flex items-center gap-2">
              <LanguageSelect lang={lang} onChange={changeLang} />
              <button
                onClick={() => setStreamerCfgOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/50 hover:text-white text-xs font-bold transition-colors"
                title={t.streamerSetupTitle}>
                <Monitor size={13} />
                {t.streamerSetup}
              </button>
            </div>
          </div>

          {streamerCfgOpen && <StreamerConfigPanel onClose={() => setStreamerCfgOpen(false)} lang={lang} />}

          {/* Anleitung eines Modus — geöffnet über die Kachel weiter unten */}
          {tutorialMode && (
            <ModeTutorialModal
              mode={tutorialMode}
              name={modeNameFor(tutorialMode.id, lang)}
              description={modeDescFor(tutorialMode.id, lang)}
              lang={lang}
              onClose={() => setTutorialMode(null)}
            />
          )}

          {/* Ab xl dreispaltig: Streamer links, Inhalt in der MITTE, rechts eine leere
              Spalte gleicher Breite als Gegengewicht. Darunter stapelt es — `order-last`
              schiebt die Streamer dort ans Ende, damit auf dem Handy zuerst die Lobby
              kommt. So braucht es die Liste nur EINMAL im DOM (zwei Instanzen hießen
              zwei Abrufe und zwei Timer). */}
          <div className="flex flex-col gap-5 xl:grid xl:grid-cols-[15rem_minmax(0,1fr)_15rem] xl:items-start xl:gap-5">

            <aside className="order-last xl:order-none xl:sticky xl:top-4">
              <UsedByPanel t={t} />
            </aside>

            <div className="flex flex-col gap-5 min-w-0">

          {/* ══ Rahmen 1: alles zum Spielen ═════════════════════════════════════
              Lobby und Modi teilen sich eine Fläche — kein Kasten im Kasten, die
              Trennung läuft über eine Linie. */}
          <section className="panel-strong overflow-hidden">

              {/* Lobby erstellen / beitreten — über die volle Breite */}
              <div className="min-w-0">
                <div className="grid grid-cols-2 border-b border-white/[0.07] bg-violet-500/[0.05]">
                  <button onClick={() => setHubTab('create')}
                    className={`flex items-center justify-center gap-2 py-3.5 text-sm font-bold transition-colors border-b-2 ${
                      hubTab === 'create' ? 'border-violet-400 text-white bg-white/[0.04]' : 'border-transparent text-white/40 hover:text-white/70'
                    }`}>
                    <Sword size={14} />
                    {t.tabCreate}
                  </button>
                  <button onClick={() => setHubTab('join')}
                    className={`flex items-center justify-center gap-2 py-3.5 text-sm font-bold transition-colors border-b-2 ${
                      hubTab === 'join' ? 'border-violet-400 text-white bg-white/[0.04]' : 'border-transparent text-white/40 hover:text-white/70'
                    }`}>
                    <Link2 size={14} />
                    {t.tabJoin}
                  </button>
                </div>

                <div className="p-5 md:p-6 space-y-5">
                  <div className="flex items-center gap-3">
                    <PlayerAvatar avatarId={selectedAvatar} size={40} />
                    <input
                      value={playerName}
                      onChange={e => setPlayerName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && submit()}
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
                            onClick={() => setSelectedAvatar(id)}
                            title={id.replace(/\.[^.]+$/, '')}
                            className={`rounded-full overflow-hidden border-2 transition-colors shrink-0 ${
                              selectedAvatar === id
                                ? 'border-violet-400 ring-2 ring-violet-400/30'
                                : 'border-white/15 hover:border-white/40'
                            }`}
                            style={{ width: 42, height: 42 }}>
                            {/* 17 Bilder auf einmal: async dekodieren, damit der
                                Main-Thread beim Öffnen der Seite nicht stockt */}
                            <img src={AVATAR_URL_MAP[id]} alt={id} width={42} height={42}
                              loading="lazy" decoding="async"
                              className="w-full h-full object-cover object-center" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {hubTab === 'join' && (
                    <input
                      value={joinCode}
                      onChange={e => setJoinCode(e.target.value.toUpperCase())}
                      onKeyDown={e => e.key === 'Enter' && onJoin(joinCode)}
                      placeholder={t.codePlaceholder}
                      maxLength={6}
                      className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-white/25 focus:border-violet-500 outline-none text-sm font-mono tracking-widest uppercase transition-colors"
                    />
                  )}

                  <button onClick={submit}
                    className="w-full bg-violet-600 hover:bg-violet-500 text-white font-bold py-3.5 rounded-lg transition-colors flex items-center justify-center gap-2">
                    {hubTab === 'create' ? <Sword size={16} /> : <Link2 size={16} />}
                    {hubTab === 'create' ? t.createBtn : t.joinBtn}
                  </button>
                  <p className="text-white/30 text-xs text-center">{t.playNowHint}</p>

                  {error && <p className="text-red-400 text-sm text-center">{error}</p>}
                </div>
              </div>

            {/* Modi — untere Hälfte derselben Fläche */}
            <div className="border-t border-white/[0.07] p-5 md:p-6">
              <div className="flex items-baseline justify-between gap-3 mb-3.5">
                <h2 className="text-white font-semibold text-sm">{t.modesHeading}</h2>
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
                    onOpen={() => setTutorialMode(m)}
                  />
                ))}
              </div>
            </div>
          </section>

          {/* ══ Rahmen 2: alles Erklärende ══════════════════════════════════════
              Bewusst zurückhaltender als Rahmen 1 — das hier liest man einmal, nicht
              bei jedem Besuch. */}
          <section className="panel p-5 md:p-6 space-y-6">
            {/* Fan-Content-Hinweis von Supercell. Bewusst abgesetzt und mit klickbarer
                Quelle statt als grauer Kleingedruckt-Absatz — die Richtlinie verlangt,
                dass der Hinweis auffindbar ist, nicht dass er versteckt wird. */}
            <div className="rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-4">
              <div className="flex items-start gap-3">
                <Info size={16} className="text-amber-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <h2 className="text-amber-300 font-bold text-sm mb-1">{t.aboutHeading}</h2>
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

            <div>
              <h2 className="text-white font-semibold text-sm mb-3">{t.tabSupport}</h2>
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
          </section>

            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
