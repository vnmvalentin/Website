// App.jsx
import { Component, lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./pages/Layout";
import Home from "./pages/Home";
import NotFound from "./pages/NotFound";
import TwitchAuthProvider from "./components/TwitchAuthProvider";

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
const GameContainer = lazy(() => import("./pages/GardenGame/GameContainer"));
const AdventureGame = lazy(() => import("./pages/Adventure/AdventureGame"));
const ClashRoyalePage = lazy(() => import("./pages/ClashRoyale/ClashRoyalePage"));
const DiscordBotDashboard = lazy(() => import("./pages/Discord/DiscordBotDashboard"));

const Abstimmung = lazy(() => import("./pages/Abstimmung/Abstimmung"));
const AbstimmungDetail = lazy(() => import("./pages/Abstimmung/AbstimmungDetail"));
const AuthTwitch = lazy(() => import("./pages/AuthTwitch"));
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
const DiscordBotPrivacyPage = lazy(() => import("./pages/Discord/DiscordBotPrivacyPage"));
const DiscordBotTermsPage = lazy(() => import("./pages/Discord/DiscordBotTermsPage"));
const BannedCardsOverlayPage = lazy(() => import("./pages/ClashRoyale/BannedCards/BannedCardsOverlayPage"));
const DeckOverlayPage = lazy(() => import("./pages/ClashRoyale/streamer/DeckOverlayPage"));
const LobbyDeckOverlayPage = lazy(() => import("./pages/ClashRoyale/streamer/LobbyDeckOverlayPage"));
const NuzlockePage = lazy(() => import("./pages/ClashRoyale/Nuzlocke/NuzlockePage"));
const WinTrackerPage = lazy(() => import("./pages/ClashRoyale/WinTracker/WinTrackerPage"));
const WinTrackerOverlayPage = lazy(() => import("./pages/ClashRoyale/WinTracker/WinTrackerOverlayPage"));
const PollsPredictionsPage = lazy(() => import("./pages/StreamTool/PollsPredictionsPage"));
const PollsPredictionsOverlay = lazy(() => import("./pages/StreamTool/PollsPredictionsOverlay"));
const CategoryPage = lazy(() => import("./pages/CategoryPage"));
const Profile = lazy(() => import("./pages/Profile"));
const Connect4Page = lazy(() => import("./pages/Connect4/Connect4Page"));
const Connect4Room = lazy(() => import("./pages/Connect4/Connect4Room"));
const BlobbyPage = lazy(() => import("./pages/Blobby/BlobbyPage"));
const BlobbyRoom = lazy(() => import("./pages/Blobby/BlobbyRoom"));
const SeedRunnersPage = lazy(() => import("./pages/SeedRunners/SeedRunnersPage"));
const SeedRunnersRoom = lazy(() => import("./pages/SeedRunners/SeedRunnersRoom"));
const SeedRunnersTestPage = lazy(() => import("./pages/SeedRunners/SeedRunnersTestPage"));
const SeedRunnersWorldLab = lazy(() => import("./pages/SeedRunners/SeedRunnersWorldLab"));
const SeedRunnersDaily = lazy(() => import("./pages/SeedRunners/SeedRunnersDaily"));
const SeedRunnersSandbox = lazy(() => import("./pages/SeedRunners/SeedRunnersSandbox"));
const SeedRunnersEditor = lazy(() => import("./pages/SeedRunners/SeedRunnersEditor"));
const SeedRunnersLevels = lazy(() => import("./pages/SeedRunners/SeedRunnersLevels"));
const SeedRunnersLevel = lazy(() => import("./pages/SeedRunners/SeedRunnersLevel"));
const SeedRunnersCreator = lazy(() => import("./pages/SeedRunners/SeedRunnersCreator"));
const SeedRunnersShell = lazy(() => import("./pages/SeedRunners/ui/GameShell"));
const DleHubPage = lazy(() => import("./pages/Dle/DleHubPage"));
const SigilsShell = lazy(() => import("./pages/SacrificeSigils/ui/Shell.jsx"));
const SigilsHome = lazy(() => import("./pages/SacrificeSigils/ui/screens/HomeScreen.jsx"));
const SigilsRoom = lazy(() => import("./pages/SacrificeSigils/ui/pages/RoomPage.jsx"));
const SigilsPractice = lazy(() => import("./pages/SacrificeSigils/ui/pages/PracticePage.jsx"));
const SigilsCodex = lazy(() => import("./pages/SacrificeSigils/ui/pages/CodexPage.jsx"));
const SigilsGuide = lazy(() => import("./pages/SacrificeSigils/ui/pages/GuidePage.jsx"));
const SigilsTutorial = lazy(() => import("./pages/SacrificeSigils/ui/pages/TutorialPage.jsx"));
const TempdlePage = lazy(() => import("./pages/Dle/Tempdle/TempdlePage"));
const VelocidlePage = lazy(() => import("./pages/Dle/Velocidle/VelocidlePage"));
const ProbabildlePage = lazy(() => import("./pages/Dle/Probabildle/ProbabildlePage"));
const DuratidlePage = lazy(() => import("./pages/Dle/Duratidle/DuratidlePage"));
const InventiondlePage = lazy(() => import("./pages/Dle/Inventiondle/InventiondlePage"));
const PricedlePage = lazy(() => import("./pages/Dle/Pricedle/PricedlePage"));
const BalancdlePage = lazy(() => import("./pages/Dle/Balancdle/BalancdlePage"));

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
      <LazyRouteBoundary>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          {/* Overlay separat, ohne Layout */}
          <Route path="/WinChallengeOverlay/:overlayKey" element={<WinChallengeOverlay />}/>
          <Route path="/overlay/credits" element={<StreamCredits />} />

          <Route path="/bingo/overlay/:overlayKey" element={<BingoOverlayPage />} />
          <Route path="/banned-cards/overlay/:overlayKey" element={<BannedCardsOverlayPage />} />
          <Route path="/clash-royale/overlay/decks/:overlayKey" element={<DeckOverlayPage />} />
          <Route path="/clash-royale/overlay/lobby-decks/:overlayKey" element={<LobbyDeckOverlayPage />} />
          <Route path="/clash-royale/win-tracker/overlay/:overlayKey" element={<WinTrackerOverlayPage />} />
          <Route path="/twitch-tools/overlay/:overlayKey" element={<PollsPredictionsOverlay />} />

          {/* Seed Runners als eigenes Spiel: eigene Hülle statt Website-Layout (ui/GameShell.jsx) */}
          <Route path="/seed-runners" element={<SeedRunnersShell />}>
            <Route index element={<SeedRunnersPage/>} />
            <Route path="daily" element={<SeedRunnersDaily/>} />
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
          </Route>

          {/* Alle “normalen” Seiten unter Layout */}
          <Route path="/" element={<Layout />}>
            <Route index element={<Home />} />

            {/* Kategorie-Übersichten */}
            <Route path="fun" element={<CategoryPage categoryKey="fun" />} />
            <Route path="community" element={<CategoryPage categoryKey="community" />} />
            <Route path="clash" element={<CategoryPage categoryKey="clash-royale" />} />
            <Route path="tools" element={<CategoryPage categoryKey="tools" />} />
            <Route path="contact" element={<CategoryPage categoryKey="contact" />} />

            <Route path="profile" element={<Profile />} />

            <Route path="Abstimmungen" element={<Abstimmung />} />
            <Route path="Abstimmungen/:id" element={<AbstimmungDetail />} />
            <Route path="auth/twitch" element={<AuthTwitch />} />
            <Route path="WinChallenge-Overlay" element={<WinChallenge />} />
            <Route
              path="WinChallengeControl/:controlKey"
              element={<WinChallengeControl />}
            />
            <Route path="Giveaways" element={<GiveawaysPage />} />
            <Route path="Bingo" element={<BingoPage/>} />
            <Route path="Bingo/:sessionId" element={<BingoEditorPage/>} />
            <Route path="Bingo/join/:joinKey" element={<BingoJoinPage/>} />
            <Route path="adventures" element={<AdventureGame/>} />
            <Route path="connect4" element={<Connect4Page/>} />
            <Route path="connect4/:code" element={<Connect4Room/>} />
            <Route path="blobby" element={<BlobbyPage/>} />
            <Route path="blobby/:code" element={<BlobbyRoom/>} />
            {/* Seed Runners: Übungsbereich und Welten-Werkbank sind Entwickler-Werkzeuge und bleiben im Website-Look; der Rest
                des Spiels hat eine eigene Hülle (unten). Feste Routen gewinnen gegen ":code". */}
            <Route path="seed-runners/test" element={<SeedRunnersTestPage/>} />
            <Route path="seed-runners/welten" element={<SeedRunnersWorldLab/>} />
            <Route path="garden" element={<GameContainer />} />
            <Route path="daily" element={<DleHubPage/>} />
            <Route path="daily/tempdle" element={<TempdlePage/>} />
            <Route path="daily/velocidle" element={<VelocidlePage/>} />
            <Route path="daily/probabildle" element={<ProbabildlePage/>} />
            <Route path="daily/duratidle" element={<DuratidlePage/>} />
            <Route path="daily/inventiondle" element={<InventiondlePage/>} />
            <Route path="daily/pricedle" element={<PricedlePage/>} />
            <Route path="daily/balancdle" element={<BalancdlePage/>} />
            <Route path="admin" element={<AdminDashboard />} />
            <Route path="tutorial/ytm-bot" element={<YTMBotPage />} />
            <Route path="tutorial/ytm-songrequest" element={<Navigate to="/tutorial/ytm-bot" replace />} />
            <Route path="tutorial/ytm-streamdeck" element={<Navigate to="/tutorial/ytm-bot" replace />} />
            <Route path="updates" element={<Updates />} />
            <Route path="/discord-bot" element={<DiscordBotDashboard />} />
            <Route path="/discord-bot/privacy" element={<DiscordBotPrivacyPage />} />
            <Route path="/discord-bot/terms" element={<DiscordBotTermsPage />} />
            <Route path="/clash-royale" element={<ClashRoyalePage />} />
            <Route path="/nuzlocke" element={<NuzlockePage />} />
            <Route path="/clash-royale/win-tracker" element={<WinTrackerPage />} />
            <Route path="/twitch-tools" element={<PollsPredictionsPage />} />

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
