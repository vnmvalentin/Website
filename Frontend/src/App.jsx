// App.jsx
import { Component, lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import Home from "./pages/Website/Home";
import NotFound from "./pages/Website/NotFound";
import TwitchAuthProvider from "./components/TwitchAuthProvider";
import AnalyticsTracker from "./components/AnalyticsTracker";
import LeistungTracker from "./components/LeistungTracker";
import Anmeldung from "./components/Anmeldung";
import { VisitMemory } from "./utils/visitMemory";
import { ToolScroll } from "./components/toolShell/ToolParts";
import { seedRunnersRoutes } from "./pages/SeedRunners/routes";
import { sacrificeSigilsRoutes } from "./pages/SacrificeSigils/routes";
import { blobbyRoutes } from "./pages/Blobby/routes";
import { clashRoyaleRoutes } from "./pages/ClashRoyale/routes";
import { gardenRoutes } from "./pages/GardenGame/routes";
import { adventureRoutes } from "./pages/Adventure/routes";
import { flickSoccerRoutes } from "./pages/FlickSoccer/routes";
import { worldflipRoutes } from "./pages/Worldflip/routes";

// ── Nachgeladene Routen ─────────────────────────────────────────────────────
// Eager importiert bleibt nur, was auf JEDER Seite gebraucht wird (Layout, die
// Startseite selbst, TwitchAuthProvider als Context-Provider um den ganzen Baum,
// NotFound für eine sofort da stehende 404). Alles andere war früher ein
// statischer Import und landete dadurch im selben Chunk wie die Startseite — wer
// nur die Startseite öffnete, lud und PARSTE auch das Garden-Game, die Adventure-
// Engine, jede Clash-Royale-Unterseite, jedes Bingo/WinChallenge/Connect4/Blobby-
// Overlay usw. mit. Das Parsen blockiert den Main-Thread, deshalb reagierte die
// Seite anfangs verzögert (Haupt-Chunk lag bei ~900 KB). Mit lazy() holt der
// Browser den Code erst, wenn die jeweilige Route wirklich aufgerufen wird.
//
// ACHTUNG bei Änderungen: mehrere Routen hier werden von prerender.js vorgerendert
// (siehe dortige routesToPrerender-Liste — u.a. /clash-royale, /discord-bot,
// /Bingo, /nuzlocke, /clash-royale/win-tracker, /twitch-tools, /tutorial/ytm-bot,
// /WinChallenge-Overlay). Das Skript wartet dafür generisch darauf, dass der
// Suspense-Fallback verschwindet (data-page-fallback), und bricht den Build ab,
// wenn er es doch ins HTML schafft — das gilt unabhängig davon, welche der
// Routen hier lazy sind, trotzdem beim Umbenennen/Verschieben einer der oben
// gelisteten Routen an prerender.js denken.
//
// Spiele mit eigener Hülle führen ihre Routen in pages/<Spiel>/routes.jsx (unten eingehängt);
// hier stehen OBS-Overlays, Streamer-Werkzeuge und die Seiten im Website-Layout.

// OBS-Overlays (ohne Hülle)
const WinChallengeOverlay = lazy(() => import("./pages/WinChallenge/WinChallengeOverlay"));
const StreamCredits = lazy(() => import("./pages/StreamScenes/StreamCredits"));
const StreamStarting = lazy(() => import("./pages/StreamScenes/StreamStarting"));
const StreamEnding = lazy(() => import("./pages/StreamScenes/StreamEnding"));
const StreamBrb = lazy(() => import("./pages/StreamScenes/StreamBrb"));
const GambleOverlay = lazy(() => import("./pages/StreamGamble/GambleOverlay"));
const BingoOverlayPage = lazy(() => import("./pages/Bingo/BingoOverlayPage"));
const BannedCardsOverlayPage = lazy(() => import("./pages/ClashRoyale/BannedCards/BannedCardsOverlayPage"));
const DeckOverlayPage = lazy(() => import("./pages/ClashRoyale/streamer/DeckOverlayPage"));
const LobbyDeckOverlayPage = lazy(() => import("./pages/ClashRoyale/streamer/LobbyDeckOverlayPage"));
const WinTrackerOverlayPage = lazy(() => import("./pages/ClashRoyale/WinTracker/WinTrackerOverlayPage"));
const ViewerGamesOverlay = lazy(() => import("./pages/ClashRoyale/clash/ViewerGamesOverlay"));
const PollsPredictionsOverlay = lazy(() => import("./pages/StreamTool/PollsPredictionsOverlay"));

// Streamer-Werkzeuge (Tool-Hülle bzw. Win-Challenge-Aufsatz)
const ToolShell = lazy(() => import("./components/toolShell/ToolShell.jsx"));
const WcShell = lazy(() => import("./pages/WinChallenge/ui/WcShell.jsx"));
const WinChallenge = lazy(() => import("./pages/WinChallenge/WinChallenge"));
const WinChallengeControl = lazy(() => import("./pages/WinChallenge/WinChallengeControl"));
const PollsPredictionsPage = lazy(() => import("./pages/StreamTool/PollsPredictionsPage"));
const StreamScenesControlPage = lazy(() => import("./pages/StreamScenes/StreamScenesControlPage"));
const BingoPage = lazy(() => import("./pages/Bingo/BingoPage"));
const BingoEditorPage = lazy(() => import("./pages/Bingo/BingoEditorPage"));
const DiscordBotDashboard = lazy(() => import("./pages/Discord/DiscordBotDashboard"));

// Lights Out hat seine Hülle in der Seite selbst
const LightsOut = lazy(() => import("./pages/LightsOut/LightsOut.jsx"));

// Seiten im Website-Layout
const CategoryPage = lazy(() => import("./pages/Website/CategoryPage"));
const StreamerToolsPage = lazy(() => import("./pages/StreamerTools/StreamerToolsPage"));
const OverlayGalleryPage = lazy(() => import("./pages/StreamerTools/OverlayGalleryPage"));
const Profile = lazy(() => import("./pages/Website/Profile"));
const PublicProfilePage = lazy(() => import("./pages/PublicProfile/PublicProfilePage"));
const Abstimmung = lazy(() => import("./pages/Abstimmung/Abstimmung"));
const AbstimmungDetail = lazy(() => import("./pages/Abstimmung/AbstimmungDetail"));
const AuthTwitch = lazy(() => import("./pages/Website/AuthTwitch"));
const GiveawaysPage = lazy(() => import("./pages/Giveaways/GiveawaysPage"));
const BingoJoinPage = lazy(() => import("./pages/Bingo/BingoJoinPage"));
const Connect4Page = lazy(() => import("./pages/Connect4/Connect4Page"));
const Connect4Room = lazy(() => import("./pages/Connect4/Connect4Room"));
const SeedRunnersTestPage = lazy(() => import("./pages/SeedRunners/SeedRunnersTestPage"));
const SeedRunnersWorldLab = lazy(() => import("./pages/SeedRunners/SeedRunnersWorldLab"));
const AdminDashboard = lazy(() => import("./pages/Admin/AdminDashboard"));
const YTMBotPage = lazy(() => import("./pages/YTM/YTMBotPage"));
const Updates = lazy(() => import("./pages/Website/Updates"));
const DiscordBotPrivacyPage = lazy(() => import("./pages/Discord/DiscordBotPrivacyPage"));
const DiscordBotTermsPage = lazy(() => import("./pages/Discord/DiscordBotTermsPage"));
const AvatarBuilderPage = lazy(() => import("./pages/StreamScenes/AvatarBuilderPage"));
const Abo = lazy(() => import("./pages/Website/Abo"));
const Impressum = lazy(() => import("./pages/Legal/Impressum"));
const Datenschutz = lazy(() => import("./pages/Legal/Datenschutz"));
const Agb = lazy(() => import("./pages/Legal/Agb"));
const Widerruf = lazy(() => import("./pages/Legal/Widerruf"));

// Der Marker data-page-fallback ist die Schnittstelle zu prerender.js — nicht umbenennen.
function PageFallback() {
  return (
    <div data-page-fallback className="min-h-[60vh] flex items-center justify-center">
      <p className="text-white/40 text-sm">Lädt…</p>
    </div>
  );
}

// Ohne diese Grenze führt ein fehlgeschlagener Chunk-Download zu einer komplett WEISSEN
// Seite: React.lazy wirft, und ohne Error Boundary hängt sich der ganze Baum aus.
// Der praktische Fall dafür ist ein Deploy während einer offenen Sitzung — die im alten
// HTML referenzierten Chunk-Namen sind gehasht und danach nicht mehr vorhanden, der
// Nachladeversuch bekommt also eine 404. Neu laden holt das aktuelle HTML und löst es auf.
class LazyRouteBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error('Route konnte nicht geladen werden:', error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      // data-page-error ist wie data-page-fallback die Schnittstelle zu prerender.js:
      // eine Fehlermeldung darf niemals als fertige Seite ausgeliefert werden.
      <div data-page-error className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="panel p-6 max-w-md text-center">
          <p className="text-white font-semibold mb-2">Diese Seite konnte nicht geladen werden</p>
          <p className="text-white/50 text-sm mb-4">
            Das passiert meist, wenn die Seite während deines Besuchs aktualisiert wurde.
            Ein Neuladen behebt es.
          </p>
          <button onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-lg bg-violet-500 text-white text-sm font-semibold hover:bg-violet-400 transition-colors">
            Neu laden
          </button>
        </div>
      </div>
    );
  }
}

export default function App() {
  return (
    <TwitchAuthProvider>
      <AnalyticsTracker />
      {/* Ladezeiten, Reaktion und Bildrate echter Besucher (utils/leistungMessung.js) */}
      <LeistungTracker />
      {/* "Schnell weiter" auf der Startseite: meistbesuchte Bereiche, nur im Browser gespeichert */}
      <VisitMemory />
      {/* Konto für alle Anmeldewege: Anmelde-Dialog (Twitch, Discord, Gast) und Hinweise (utils/konto.js) */}
      <Anmeldung />
      <LazyRouteBoundary>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          {/* Overlay separat, ohne Layout */}
          <Route path="/WinChallengeOverlay/:overlayKey" element={<WinChallengeOverlay />}/>
          <Route path="/overlay/credits" element={<StreamCredits />} />
          {/* 3D-Szenen: Streamer-Zimmer vor dem Stream, Kino mit den Credits danach */}
          <Route path="/overlay/stream-starting" element={<StreamStarting />} />
          <Route path="/overlay/stream-ending" element={<StreamEnding />} />
          <Route path="/overlay/brb" element={<StreamBrb />} />
          {/* Gamble-System aus Streamer.bot (Rakete, Murmel-Wetten, Würfeln, Topf) */}
          <Route path="/overlay/gamble" element={<GambleOverlay />} />

          <Route path="/bingo/overlay/:overlayKey" element={<BingoOverlayPage />} />
          <Route path="/banned-cards/overlay/:overlayKey" element={<BannedCardsOverlayPage />} />
          <Route path="/clash-royale/overlay/decks/:overlayKey" element={<DeckOverlayPage />} />
          <Route path="/clash-royale/overlay/lobby-decks/:overlayKey" element={<LobbyDeckOverlayPage />} />
          <Route path="/clash-royale/win-tracker/overlay/:overlayKey" element={<WinTrackerOverlayPage />} />
          <Route path="/twitch-tools/overlay/:overlayKey" element={<PollsPredictionsOverlay />} />
          <Route path="/clash/viewer-games/overlay/:overlayKey" element={<ViewerGamesOverlay />} />

          {/* Streamer-Werkzeuge in der gemeinsamen Tool-Hülle (components/toolShell/ToolShell.jsx) statt im
              Website-Layout. Die Win Challenge setzt Sprachwahl und Übersetzung obendrauf (ui/WcShell.jsx).
              OBS-Overlays oben bleiben ohne Hülle; Bingo-Beitritt (Zuschauer) bleibt im Layout. */}
          <Route element={<WcShell />}>
            <Route path="/WinChallenge-Overlay" element={<WinChallenge />} />
            <Route path="/WinChallengeControl/:controlKey" element={<WinChallengeControl />} />
          </Route>
          <Route element={<ToolShell />}>
            <Route path="/twitch-tools" element={<PollsPredictionsPage />} />
            {/* Diese drei scrollen ganz normal (ToolScroll); die übrigen haben eine Arbeitsfläche über die volle Höhe */}
            <Route path="/stream-szenen" element={<ToolScroll><StreamScenesControlPage /></ToolScroll>} />
            <Route path="/Bingo" element={<ToolScroll><BingoPage/></ToolScroll>} />
            <Route path="/Bingo/:sessionId" element={<ToolScroll><BingoEditorPage/></ToolScroll>} />
            <Route path="/discord-bot" element={<DiscordBotDashboard />} />
          </Route>

          {/* Spiele mit eigener Hülle (pages/<Spiel>/routes.jsx) */}
          {seedRunnersRoutes}
          {sacrificeSigilsRoutes}
          {blobbyRoutes}
          {clashRoyaleRoutes}
          {gardenRoutes}
          {adventureRoutes}
          {flickSoccerRoutes}
          {worldflipRoutes}

          {/* Lights Out: Horror-Labyrinth in der Ego-Perspektive, eigene Hülle (LightsOut/LightsOut.jsx) */}
          <Route path="/lights-out" element={<LightsOut />} />

          {/* Alle “normalen” Seiten unter Layout */}
          <Route path="/" element={<Layout />}>
            <Route index element={<Home />} />

            {/* Kategorie-Übersichten */}
            <Route path="fun" element={<CategoryPage categoryKey="fun" />} />
            <Route path="community" element={<CategoryPage categoryKey="community" />} />
            {/* „Für Streamer": Live-Vorschau aller Overlays statt der Kachel-Übersicht (gleiche Adresse) */}
            <Route path="tools" element={<StreamerToolsPage />} />
            {/* Overlay-Galerie mit Reitern je Overlay (Vorlagen übernehmen per ?vorlage=) */}
            <Route path="tools/vorlagen" element={<OverlayGalleryPage />} />
            <Route path="contact" element={<CategoryPage categoryKey="contact" />} />

            <Route path="profile" element={<Profile />} />
            {/* Öffentliches Profil (opt-in unter /profile), Backend/profile */}
            <Route path="u/:login" element={<PublicProfilePage />} />

            <Route path="Abstimmungen" element={<Abstimmung />} />
            <Route path="Abstimmungen/:id" element={<AbstimmungDetail />} />
            <Route path="auth/twitch" element={<AuthTwitch />} />

            <Route path="Giveaways" element={<GiveawaysPage />} />
            <Route path="Bingo/join/:joinKey" element={<BingoJoinPage/>} />
            <Route path="connect4" element={<Connect4Page/>} />
            <Route path="connect4/:code" element={<Connect4Room/>} />
            {/* Seed Runners: Übungsbereich und Welten-Werkbank sind Entwickler-Werkzeuge und bleiben im Website-Look; der Rest
                des Spiels hat eine eigene Hülle (unten). Feste Routen gewinnen gegen ":code". */}
            <Route path="seed-runners/test" element={<SeedRunnersTestPage/>} />
            <Route path="seed-runners/welten" element={<SeedRunnersWorldLab/>} />
            <Route path="admin" element={<AdminDashboard />} />
            <Route path="tutorial/ytm-bot" element={<YTMBotPage />} />
            <Route path="tutorial/ytm-songrequest" element={<Navigate to="/tutorial/ytm-bot" replace />} />
            <Route path="tutorial/ytm-streamdeck" element={<Navigate to="/tutorial/ytm-bot" replace />} />
            <Route path="updates" element={<Updates />} />
            <Route path="/discord-bot/privacy" element={<DiscordBotPrivacyPage />} />
            <Route path="/discord-bot/terms" element={<DiscordBotTermsPage />} />
            {/* Figurbaukasten der 3D-Stream-Szenen (Zuschauer); das Steuerpult steht in der Tool-Hülle oben */}
            <Route path="/tanzfigur" element={<AvatarBuilderPage />} />
            {/* Premium-Abo ansehen, verwalten, kündigen (Backend/billing) */}
            <Route path="/abo" element={<Abo />} />
            {/* Rechtsseiten — die Angaben des Betreibers stehen in config/legal.js */}
            <Route path="/impressum" element={<Impressum />} />
            <Route path="/datenschutz" element={<Datenschutz />} />
            <Route path="/agb" element={<Agb />} />
            <Route path="/widerruf" element={<Widerruf />} />

            {/* Entfernte Seiten sanft umleiten */}
            <Route path="Casino" element={<Navigate to="/fun" replace />} />
            <Route path="avards-2026" element={<Navigate to="/community" replace />} />
            <Route path="avards-admin" element={<Navigate to="/community" replace />} />

            {/* Längst gelöschte Pfade, die Google noch kennt: sauber ins Nichts
                statt einer leeren 200er-Seite (siehe NotFound.jsx). */}
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </Suspense>
      </LazyRouteBoundary>
    </TwitchAuthProvider>
  );
}
