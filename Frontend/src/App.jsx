// App.jsx
import { Component, lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./pages/Layout";
import Home from "./pages/Home";
import Abstimmung from "./pages/Abstimmung/Abstimmung";
import AbstimmungDetail from "./pages/Abstimmung/AbstimmungDetail";
import AuthTwitch from "./pages/AuthTwitch";
import WinChallenge from "./pages/WinChallenge/WinChallenge";
import WinChallengeOverlay from "./pages/WinChallenge/WinChallengeOverlay";
import WinChallengeControl from "./pages/WinChallenge/WinChallengeControl";
import GiveawaysPage from "./pages/GiveawaysPage";
import BingoPage from "./pages/Bingo/BingoPage";
import BingoEditorPage from "./pages/Bingo/BingoEditorPage";
import BingoJoinPage from "./pages/Bingo/BingoJoinPage";
import BingoOverlayPage from "./pages/Bingo/BingoOverlayPage";
import AdminDashboard from "./pages/AdminDashboard";
import YTMBotPage from "./pages/YTM/YTMBotPage";
import TwitchAuthProvider from "./components/TwitchAuthProvider";
import Updates from "./pages/Updates";
import StreamCredits from "./pages/StreamCredits";
import DiscordBotPrivacyPage from "./pages/Discord/DiscordBotPrivacyPage";
import DiscordBotTermsPage from "./pages/Discord/DiscordBotTermsPage";
import BannedCardsOverlayPage from "./pages/ClashRoyale/BannedCards/BannedCardsOverlayPage";
import DeckOverlayPage from "./pages/ClashRoyale/streamer/DeckOverlayPage";
import NuzlockePage from "./pages/ClashRoyale/Nuzlocke/NuzlockePage";
import WinTrackerPage from "./pages/ClashRoyale/WinTracker/WinTrackerPage";
import WinTrackerOverlayPage from "./pages/ClashRoyale/WinTracker/WinTrackerOverlayPage";
import PollsPredictionsPage from "./pages/StreamTool/PollsPredictionsPage";
import PollsPredictionsOverlay from "./pages/StreamTool/PollsPredictionsOverlay";
import CategoryPage from "./pages/CategoryPage";
import NotFound from "./pages/NotFound";
import Profile from "./pages/Profile";
import Connect4Page from "./pages/Connect4/Connect4Page";
import Connect4Room from "./pages/Connect4/Connect4Room";
import BlobbyPage from "./pages/Blobby/BlobbyPage";
import BlobbyRoom from "./pages/Blobby/BlobbyRoom";

// ── Nachgeladene Routen ─────────────────────────────────────────────────────
// Diese vier sind die Schwergewichte der Anwendung. Als statische Importe landeten
// sie im selben Chunk wie die Startseite — wer nur die Startseite öffnete, lud und
// PARSTE also auch das Garden-Game, die Adventure-Engine, alle Clash-Royale-Modi und
// das Discord-Dashboard. Das Parsen blockiert den Main-Thread, deshalb reagierte die
// Seite anfangs verzögert. Mit lazy() holt der Browser den Code erst, wenn die Route
// wirklich aufgerufen wird.
//
// ACHTUNG bei Änderungen: /clash-royale und /discord-bot werden von prerender.js
// vorgerendert. Das Skript wartet darauf, dass der Suspense-Fallback verschwindet
// (data-page-fallback), und bricht den Build ab, wenn er es doch ins HTML schafft.
const GameContainer = lazy(() => import("./pages/GardenGame/GameContainer"));
const AdventureGame = lazy(() => import("./pages/Adventure/AdventureGame"));
const ClashRoyalePage = lazy(() => import("./pages/ClashRoyale/ClashRoyalePage"));
const DiscordBotDashboard = lazy(() => import("./pages/Discord/DiscordBotDashboard"));

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
          <Route path="/clash-royale/win-tracker/overlay/:overlayKey" element={<WinTrackerOverlayPage />} />
          <Route path="/twitch-tools/overlay/:overlayKey" element={<PollsPredictionsOverlay />} />

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
            <Route path="garden" element={<GameContainer />} />
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
