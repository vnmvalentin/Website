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
import AwardsSubmitPage from "./pages//Award/AwardsSubmitPage";
import AwardsAdminPage from "./pages/Award/AwardsAdminPage";
import BingoPage from "./pages/Bingo/BingoPage";
import BingoEditorPage from "./pages/Bingo/BingoEditorPage";
import BingoJoinPage from "./pages/Bingo/BingoJoinPage";
import BingoOverlayPage from "./pages/Bingo/BingoOverlayPage";
import CasinoPage from "./pages/CasinoPage";
import AdventureGame from "./pages/Adventure/AdventureGame"
import AdminDashboard from "./pages/AdminDashboard";
import YTMBotPage from "./pages/YTM/YTMBotPage";
import TwitchAuthProvider from "./components/TwitchAuthContext";
import ViewerPond from "./pages/ViewerPond/ViewerPond";
import PondPage from "./pages/ViewerPond/PondPage";
import Updates from "./pages/Updates";
import CardDashboard from "./pages/Card/CardDashboard";
import Hub from "./pages/Hub";
import StreamCredits from "./pages/StreamCredits";
import GameContainer from "./pages/GardenGame/GameContainer";
import DiscordBotDashboard from "./pages/Discord/DiscordBotDashboard";

export default function App() {
  return (
    <TwitchAuthProvider>
      <Routes>
        {/* Overlay separat, ohne Layout */}
        <Route path="/WinChallengeOverlay/:overlayKey" element={<WinChallengeOverlay />}/>
        <Route path="/overlay/credits" element={<StreamCredits />} />
        
        <Route path="/bingo/overlay/:overlayKey" element={<BingoOverlayPage />} />
        <Route path="/overlay/pond" element={<ViewerPond />} />

        {/* Alle “normalen” Seiten unter Layout */}
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="Abstimmungen" element={<Abstimmung />} />
          <Route path="Abstimmungen/:id" element={<AbstimmungDetail />} />
          <Route path="auth/twitch" element={<AuthTwitch />} />
          <Route path="WinChallenge-Overlay" element={<WinChallenge />} />
          <Route
            path="WinChallengeControl/:controlKey"
            element={<WinChallengeControl />}
          />
          <Route path="Giveaways" element={<GiveawaysPage />} />
          <Route path="avards-2026" element={<AwardsSubmitPage/>} />
          <Route path="avards-admin" element={<AwardsAdminPage />} />
          <Route path="Bingo" element={<BingoPage/>} />
          <Route path="Bingo/:sessionId" element={<BingoEditorPage/>} />
          <Route path="Bingo/join/:joinKey" element={<BingoJoinPage/>} />
          <Route path="Packs" element={<CardDashboard />} />
          <Route path="Casino" element={<CasinoPage />} />
          <Route path="adventures" element={<AdventureGame/>} />
          <Route path="garden" element={<GameContainer />} />
          <Route path="admin" element={<AdminDashboard />} />
          <Route path="tutorial/ytm-bot" element={<YTMBotPage />} />
          <Route path="tutorial/ytm-songrequest" element={<Navigate to="/tutorial/ytm-bot" replace />} />
          <Route path="tutorial/ytm-streamdeck" element={<Navigate to="/tutorial/ytm-bot" replace />} />
          <Route path="pond" element={<PondPage />} />
          <Route path="updates" element={<Updates />} />
          <Route path="season" element={<Hub />} />
          <Route path="/discord-bot" element={<DiscordBotDashboard />} />
          
        </Route>
      </Routes>
    </TwitchAuthProvider>
  );
}
