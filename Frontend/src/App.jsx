// App.jsx
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
import AdventureGame from "./pages/Adventure/AdventureGame"
import AdminDashboard from "./pages/AdminDashboard";
import YTMBotPage from "./pages/YTM/YTMBotPage";
import TwitchAuthProvider from "./components/TwitchAuthProvider";
import Updates from "./pages/Updates";
import StreamCredits from "./pages/StreamCredits";
import GameContainer from "./pages/GardenGame/GameContainer";
import DiscordBotDashboard from "./pages/Discord/DiscordBotDashboard";
import DiscordBotPrivacyPage from "./pages/Discord/DiscordBotPrivacyPage";
import DiscordBotTermsPage from "./pages/Discord/DiscordBotTermsPage";
import ClashRoyalePage from "./pages/ClashRoyale/ClashRoyalePage";
import BannedCardsOverlayPage from "./pages/ClashRoyale/BannedCards/BannedCardsOverlayPage";
import DeckOverlayPage from "./pages/ClashRoyale/streamer/DeckOverlayPage";
import NuzlockePage from "./pages/ClashRoyale/Nuzlocke/NuzlockePage";
import WinTrackerPage from "./pages/ClashRoyale/WinTracker/WinTrackerPage";
import WinTrackerOverlayPage from "./pages/ClashRoyale/WinTracker/WinTrackerOverlayPage";
import CategoryPage from "./pages/CategoryPage";
import Profile from "./pages/Profile";
import Connect4Page from "./pages/Connect4/Connect4Page";
import Connect4Room from "./pages/Connect4/Connect4Room";

export default function App() {
  return (
    <TwitchAuthProvider>
      <Routes>
        {/* Overlay separat, ohne Layout */}
        <Route path="/WinChallengeOverlay/:overlayKey" element={<WinChallengeOverlay />}/>
        <Route path="/overlay/credits" element={<StreamCredits />} />

        <Route path="/bingo/overlay/:overlayKey" element={<BingoOverlayPage />} />
        <Route path="/banned-cards/overlay/:overlayKey" element={<BannedCardsOverlayPage />} />
        <Route path="/clash-royale/overlay/decks/:overlayKey" element={<DeckOverlayPage />} />
        <Route path="/clash-royale/win-tracker/overlay/:overlayKey" element={<WinTrackerOverlayPage />} />

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

          {/* Entfernte Seiten sanft umleiten */}
          <Route path="Casino" element={<Navigate to="/fun" replace />} />
          <Route path="avards-2026" element={<Navigate to="/community" replace />} />
          <Route path="avards-admin" element={<Navigate to="/community" replace />} />
        </Route>
      </Routes>
    </TwitchAuthProvider>
  );
}
