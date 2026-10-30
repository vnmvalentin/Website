// App.jsx
import { Component, lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./pages/Layout";
import Home from "./pages/Home";
import NotFound from "./pages/NotFound";
import TwitchAuthProvider from "./components/TwitchAuthProvider";
import AnalyticsTracker from "./components/AnalyticsTracker";
import { VisitMemory } from "./utils/visitMemory";

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
const GardenShell = lazy(() => import("./pages/GardenGame/ui/menu/GardenShell.jsx"));
const GameContainer = lazy(() => import("./pages/GardenGame/GameContainer"));
const AdventureShell = lazy(() => import("./pages/Adventure/ui/Shell.jsx"));
const AdventureGame = lazy(() => import("./pages/Adventure/AdventureGame"));
const CrShell = lazy(() => import("./pages/ClashRoyale/ui/CrShell.jsx"));
const ClashRoyalePage = lazy(() => import("./pages/ClashRoyale/ClashRoyalePage"));
const ClashHubPage = lazy(() => import("./pages/ClashRoyale/clash/ClashHubPage"));
const CardGuesser = lazy(() => import("./pages/ClashRoyale/clash/CardGuesser"));
const WhoAmI = lazy(() => import("./pages/ClashRoyale/clash/WhoAmI"));
const StatsDuel = lazy(() => import("./pages/ClashRoyale/clash/StatsDuel"));
const ImageGuess = lazy(() => import("./pages/ClashRoyale/clash/ImageGuess"));
const CardWordle = lazy(() => import("./pages/ClashRoyale/clash/CardWordle"));
const ViewerGamesPage = lazy(() => import("./pages/ClashRoyale/clash/ViewerGamesPage"));
const ViewerGamesOverlay = lazy(() => import("./pages/ClashRoyale/clash/ViewerGamesOverlay"));
const TournamentPage = lazy(() => import("./pages/ClashRoyale/tournament/TournamentPage"));
const TournamentForm = lazy(() => import("./pages/ClashRoyale/tournament/TournamentForm"));
const DiscordBotDashboard = lazy(() => import("./pages/Discord/DiscordBotDashboard"));

const Abstimmung = lazy(() => import("./pages/Abstimmung/Abstimmung"));
const AbstimmungDetail = lazy(() => import("./pages/Abstimmung/AbstimmungDetail"));
const AuthTwitch = lazy(() => import("./pages/AuthTwitch"));
const WcShell = lazy(() => import("./pages/WinChallenge/ui/WcShell.jsx"));
const WinChallenge = lazy(() => import("./pages/WinChallenge/WinChallenge"));
const WinChallengeOverlay = lazy(() => import("./pages/WinChallenge/WinChallengeOverlay"));
const WinChallengeControl = lazy(() => import("./pages/WinChallenge/WinChallengeControl"));
const GiveawaysPage = lazy(() => import("./pages/GiveawaysPage"));
const BingoPage = lazy(() => import("./pages/Bingo/BingoPage"));
const BingoEditorPage = lazy(() => import("./pages/Bingo/BingoEditorPage"));
const BingoJoinPage = lazy(() => import("./pages/Bingo/BingoJoinPage"));
const BingoOverlayPage = lazy(() => import("./pages/Bingo/BingoOverlayPage"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const YTMBotPage = lazy(() => import("./pages/YTM/YTMBotPage"));
const Updates = lazy(() => import("./pages/Updates"));
const StreamCredits = lazy(() => import("./pages/StreamCredits"));
const StreamStarting = lazy(() => import("./pages/StreamScenes/StreamStarting"));
const StreamEnding = lazy(() => import("./pages/StreamScenes/StreamEnding"));
const StreamBrb = lazy(() => import("./pages/StreamScenes/StreamBrb"));
const StreamScenesControlPage = lazy(() => import("./pages/StreamScenes/StreamScenesControlPage"));
const AvatarBuilderPage = lazy(() => import("./pages/StreamScenes/AvatarBuilderPage"));
const DiscordBotPrivacyPage = lazy(() => import("./pages/Discord/DiscordBotPrivacyPage"));
const DiscordBotTermsPage = lazy(() => import("./pages/Discord/DiscordBotTermsPage"));
const BannedCardsOverlayPage = lazy(() => import("./pages/ClashRoyale/BannedCards/BannedCardsOverlayPage"));
const DeckOverlayPage = lazy(() => import("./pages/ClashRoyale/streamer/DeckOverlayPage"));
const LobbyDeckOverlayPage = lazy(() => import("./pages/ClashRoyale/streamer/LobbyDeckOverlayPage"));
const NuzlockePage = lazy(() => import("./pages/ClashRoyale/Nuzlocke/NuzlockePage"));
const WinTrackerPage = lazy(() => import("./pages/ClashRoyale/WinTracker/WinTrackerPage"));
const WinTrackerRecapPage = lazy(() => import("./pages/ClashRoyale/WinTracker/WinTrackerRecapPage"));
const WinTrackerOverlayPage = lazy(() => import("./pages/ClashRoyale/WinTracker/WinTrackerOverlayPage"));
const PollsPredictionsPage = lazy(() => import("./pages/StreamTool/PollsPredictionsPage"));
const Abo = lazy(() => import("./pages/Abo"));
const Impressum = lazy(() => import("./pages/Legal/Impressum"));
const Datenschutz = lazy(() => import("./pages/Legal/Datenschutz"));
const Agb = lazy(() => import("./pages/Legal/Agb"));
const Widerruf = lazy(() => import("./pages/Legal/Widerruf"));
const PollsPredictionsOverlay = lazy(() => import("./pages/StreamTool/PollsPredictionsOverlay"));
const CategoryPage = lazy(() => import("./pages/CategoryPage"));
const StreamerToolsPage = lazy(() => import("./pages/StreamerTools/StreamerToolsPage"));
const OverlayGalleryPage = lazy(() => import("./pages/StreamerTools/OverlayGalleryPage"));
const Profile = lazy(() => import("./pages/Profile"));
const PublicProfilePage = lazy(() => import("./pages/PublicProfile/PublicProfilePage"));
const Connect4Page = lazy(() => import("./pages/Connect4/Connect4Page"));
const Connect4Room = lazy(() => import("./pages/Connect4/Connect4Room"));
const BlobbyShell = lazy(() => import("./pages/Blobby/ui/Shell.jsx"));
const BlobbyPage = lazy(() => import("./pages/Blobby/BlobbyPage"));
const BlobbyRoom = lazy(() => import("./pages/Blobby/BlobbyRoom"));
const SeedRunnersPage = lazy(() => import("./pages/SeedRunners/SeedRunnersPage"));
const SeedRunnersRoom = lazy(() => import("./pages/SeedRunners/SeedRunnersRoom"));
const SeedRunnersTestPage = lazy(() => import("./pages/SeedRunners/SeedRunnersTestPage"));
const SeedRunnersWorldLab = lazy(() => import("./pages/SeedRunners/SeedRunnersWorldLab"));
const SeedRunnersDaily = lazy(() => import("./pages/SeedRunners/SeedRunnersDaily"));
const SeedRunnersVerlauf = lazy(() => import("./pages/SeedRunners/SeedRunnersVerlauf"));
const SeedRunnersSandbox = lazy(() => import("./pages/SeedRunners/SeedRunnersSandbox"));
const SeedRunnersEditor = lazy(() => import("./pages/SeedRunners/SeedRunnersEditor"));
const SeedRunnersLevels = lazy(() => import("./pages/SeedRunners/SeedRunnersLevels"));
const SeedRunnersLevel = lazy(() => import("./pages/SeedRunners/SeedRunnersLevel"));
const SeedRunnersCreator = lazy(() => import("./pages/SeedRunners/SeedRunnersCreator"));
const SeedRunnersShell = lazy(() => import("./pages/SeedRunners/ui/GameShell"));
const FlickShell = lazy(() => import("./pages/FlickSoccer/ui/Shell.jsx"));
const FlickMenu = lazy(() => import("./pages/FlickSoccer/FlickMenu.jsx"));
const FlickLocal = lazy(() => import("./pages/FlickSoccer/FlickLocal.jsx"));
const FlickRoom = lazy(() => import("./pages/FlickSoccer/FlickRoom.jsx"));
const LightsOut = lazy(() => import("./pages/LightsOut/LightsOut.jsx"));
const SigilsShell = lazy(() => import("./pages/SacrificeSigils/ui/Shell.jsx"));
const SigilsHome = lazy(() => import("./pages/SacrificeSigils/ui/screens/HomeScreen.jsx"));
const SigilsRoom = lazy(() => import("./pages/SacrificeSigils/ui/pages/RoomPage.jsx"));
const SigilsPractice = lazy(() => import("./pages/SacrificeSigils/ui/pages/PracticePage.jsx"));
const SigilsCodex = lazy(() => import("./pages/SacrificeSigils/ui/pages/CodexPage.jsx"));
const SigilsGuide = lazy(() => import("./pages/SacrificeSigils/ui/pages/GuidePage.jsx"));
const SigilsTutorial = lazy(() => import("./pages/SacrificeSigils/ui/pages/TutorialPage.jsx"));
const SigilsRun = lazy(() => import("./pages/SacrificeSigils/ui/pages/MoorwanderungPage.jsx"));
const SigilsRunRoom = lazy(() => import("./pages/SacrificeSigils/ui/pages/RunRoomPage.jsx"));

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
      {/* "Schnell weiter" auf der Startseite: meistbesuchte Bereiche, nur im Browser gespeichert */}
      <VisitMemory />
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

          <Route path="/bingo/overlay/:overlayKey" element={<BingoOverlayPage />} />
          <Route path="/banned-cards/overlay/:overlayKey" element={<BannedCardsOverlayPage />} />
          <Route path="/clash-royale/overlay/decks/:overlayKey" element={<DeckOverlayPage />} />
          <Route path="/clash-royale/overlay/lobby-decks/:overlayKey" element={<LobbyDeckOverlayPage />} />
          <Route path="/clash-royale/win-tracker/overlay/:overlayKey" element={<WinTrackerOverlayPage />} />
          <Route path="/twitch-tools/overlay/:overlayKey" element={<PollsPredictionsOverlay />} />

          {/* Win Challenge: Editor, öffentliche Beschreibung und Moderator-Ansicht in eigener Hülle
              (ui/WcShell.jsx) statt im Website-Layout; das OBS-Overlay oben bleibt ohne Hülle */}
          <Route element={<WcShell />}>
            <Route path="/WinChallenge-Overlay" element={<WinChallenge />} />
            <Route path="/WinChallengeControl/:controlKey" element={<WinChallengeControl />} />
          </Route>

          {/* Seed Runners als eigenes Spiel: eigene Hülle statt Website-Layout (ui/GameShell.jsx) */}
          <Route path="/seed-runners" element={<SeedRunnersShell />}>
            <Route index element={<SeedRunnersPage/>} />
            <Route path="daily" element={<SeedRunnersDaily/>} />
            {/* Tagesarchiv: ein vergangener Tag (JJJJ-MM-TT); die Liste steht im Verlauf */}
            <Route path="daily/:dateKey" element={<SeedRunnersDaily/>} />
            <Route path="verlauf" element={<SeedRunnersVerlauf/>} />
            {/* Sandbox: Entwürfe verwalten und der Level-Editor */}
            <Route path="sandbox" element={<SeedRunnersSandbox/>} />
            <Route path="editor" element={<Navigate to="/seed-runners/sandbox" replace />} />
            <Route path="editor/:draftId" element={<SeedRunnersEditor/>} />
            {/* Veröffentlichte Level: Browser, Ersteller-Profil, Detailseite (Share-Code in der Adresse) */}
            <Route path="levels" element={<SeedRunnersLevels/>} />
            <Route path="levels/creator/:id" element={<SeedRunnersCreator/>} />
            <Route path="levels/:code" element={<SeedRunnersLevel/>} />
            {/* Nach dem Beitreten steht der Code nicht mehr in der Adresse (Streamer-Schutz, room/raumCode.js) */}
            <Route path="raum" element={<SeedRunnersRoom/>} />
            <Route path=":code" element={<SeedRunnersRoom/>} />
          </Route>

          {/* Sacrifice & Sigils: eigenes Kartenspiel mit eigener Hülle (Kohle & Kerzenwachs) */}
          <Route path="/sacrifice-and-sigils" element={<SigilsShell />}>
            <Route index element={<SigilsHome/>} />
            <Route path="raum/:code" element={<SigilsRoom/>} />
            <Route path="uebung" element={<SigilsPractice/>} />
            <Route path="kartenbuch" element={<SigilsCodex/>} />
            <Route path="anleitung" element={<SigilsGuide/>} />
            <Route path="tutorial" element={<SigilsTutorial/>} />
            <Route path="moorwanderung" element={<SigilsRun/>} />
            <Route path="moorwanderung/:code" element={<SigilsRunRoom/>} />
          </Route>

          {/* Blobby Volley: eigene Strand-Hülle (Blobby/ui/Shell.jsx) */}
          <Route path="/blobby" element={<BlobbyShell />}>
            <Route index element={<BlobbyPage/>} />
            <Route path=":code" element={<BlobbyRoom/>} />
          </Route>

          {/* Clash-Royale-Minigames: volle Fensterhöhe ohne Website-Kopfzeile (ClashRoyale/ui/CrShell.jsx).
              Seit Okt. 2026 auch der Win-Tracker und Nuzlocke (gleicher Arcade-Look). */}
          <Route path="/clash-royale" element={<CrShell />}>
            <Route index element={<ClashRoyalePage />} />
            {/* Turniere (Backend/clashRoyale/PLANUNG_TURNIER.md) */}
            <Route path="turnier/neu" element={<TournamentForm />} />
            <Route path="turnier/:id" element={<TournamentPage />} />
            <Route path="turnier/:id/bearbeiten" element={<TournamentForm />} />
            {/* Win-Tracker-Editor seit Okt. 2026 im selben Arcade-Look (das OBS-Overlay oben bleibt ohne Hülle) */}
            <Route path="win-tracker" element={<WinTrackerPage />} />
            {/* Saisonrückblick als eigene Seite (Backend: lib/winTrackerRecap.js) */}
            <Route path="win-tracker/rueckblick" element={<WinTrackerRecapPage />} />
          </Route>
          {/* Viewer Games: OBS-Overlay ohne Hülle (transparenter Hintergrund) */}
          <Route path="/clash/viewer-games/overlay/:overlayKey" element={<ViewerGamesOverlay />} />
          {/* /clash: Clash-Royale-Hub im Arcade-Look + Kartenrätsel (statt der allgemeinen Kategorieseite) */}
          <Route path="/clash" element={<CrShell />}>
            <Route index element={<ClashHubPage />} />
            <Route path="kartenraten" element={<CardGuesser />} />
            <Route path="wer-bin-ich" element={<WhoAmI />} />
            <Route path="wer-bin-ich/:code" element={<WhoAmI />} />
            <Route path="stats-duell" element={<StatsDuel />} />
            <Route path="zoom" element={<ImageGuess key="zoom" mode="zoom" />} />
            <Route path="pixel" element={<ImageGuess key="pixel" mode="pixel" />} />
            <Route path="wordle" element={<CardWordle />} />
            <Route path="viewer-games" element={<ViewerGamesPage />} />
          </Route>
          {/* Nuzlocke: seit Okt. 2026 ebenfalls im Arcade-Look, URL bleibt /nuzlocke (SEO) */}
          <Route path="/nuzlocke" element={<CrShell />}>
            <Route index element={<NuzlockePage />} />
          </Route>

          {/* Virtual Farm: eigene Hülle, volle Fensterhöhe (GardenGame/ui/menu/GardenShell.jsx) */}
          <Route path="/garden" element={<GardenShell />}>
            <Route index element={<GameContainer />} />
          </Route>

          {/* adVentures: eigene Pixel-Dungeon-Hülle (Adventure/ui/Shell.jsx) */}
          <Route path="/adventures" element={<AdventureShell />}>
            <Route index element={<AdventureGame/>} />
          </Route>

          {/* Flick Soccer: rundenbasierter Scheiben-Fußball, eigene Hülle „Kronkorken-Liga" (FlickSoccer/ui/Shell.jsx) */}
          <Route path="/flick-soccer" element={<FlickShell />}>
            <Route index element={<FlickMenu/>} />
            <Route path="spiel" element={<FlickLocal/>} />
            <Route path=":code" element={<FlickRoom/>} />
          </Route>

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
            <Route path="Bingo" element={<BingoPage/>} />
            <Route path="Bingo/:sessionId" element={<BingoEditorPage/>} />
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
            <Route path="/discord-bot" element={<DiscordBotDashboard />} />
            <Route path="/discord-bot/privacy" element={<DiscordBotPrivacyPage />} />
            <Route path="/discord-bot/terms" element={<DiscordBotTermsPage />} />
            <Route path="/twitch-tools" element={<PollsPredictionsPage />} />
            {/* 3D-Stream-Szenen: Steuerpult (Streamer) und Figurbaukasten (Zuschauer) */}
            <Route path="/stream-szenen" element={<StreamScenesControlPage />} />
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
