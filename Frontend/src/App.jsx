// App.jsx
import { Routes, Route } from "react-router-dom";
import Layout from "./pages/Layout";
import Home from "./pages/Home";
import Abstimmung from "./pages/Abstimmung/Abstimmung";
import AbstimmungDetail from "./pages/Abstimmung/AbstimmungDetail";
import AuthTwitch from "./pages/AuthTwitch";
import WinChallenge from "./pages/WinChallenge/WinChallenge";
import WinChallengeOverlay from "./pages/WinChallenge/WinChallengeOverlay";
import WinChallengeControl from "./pages/WinChallenge/WinChallengeControl";

import CardPackPage from "./pages/Card/CardPackPage";
import CardAlbumPage from "./pages/Card/CardAlbumPage";
import CardSuggestionsPage from "./pages/Card/CardSuggestionsPage";
import CardGalleryPage from "./pages/Card/CardGalleryPage";
import CardGalleryPublicPage from "./pages/Card/CardGalleryPublicPage";
import CardGalleriesIndexPage from "./pages/Card/CardGalleriesIndexPage";
import AchievementsPage from "./pages/Card/AchievementsPage";

import GiveawaysPage from "./pages/GiveawaysPage";
import ClipQueue from "./pages/ClipQueue";

import AwardsSubmitPage from "./pages//Award/AwardsSubmitPage";
import AwardsAdminPage from "./pages/Award/AwardsAdminPage";

import BingoPage from "./pages/Bingo/BingoPage";
import BingoEditorPage from "./pages/Bingo/BingoEditorPage";
import BingoJoinPage from "./pages/Bingo/BingoJoinPage";
import BingoOverlayPage from "./pages/Bingo/BingoOverlayPage";

import KnowledgeBase from "./pages/KnowledgeBase";
import CasinoPage from "./pages/CasinoPage";
import AdventureGame from "./pages/Adventure/AdventureGame"


// 🔽 NEU: Provider hier importieren
import TwitchAuthProvider from "./components/TwitchAuthContext";

export default function App() {
  return (
    <TwitchAuthProvider>
      <Routes>
        {/* Overlay separat, ohne Layout */}
        <Route path="/WinChallengeOverlay/:overlayKey" element={<WinChallengeOverlay />}/>
        <Route path="/bingo/overlay/:overlayKey" element={<BingoOverlayPage />} />

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
          <Route path="Packs" element={<CardPackPage />} />
          <Route path="Packs/Album" element={<CardAlbumPage />} />
          <Route path="Packs/Vorschläge" element={<CardSuggestionsPage />} />
          <Route path="Giveaways" element={<GiveawaysPage />} />
          <Route path="Clip-Queue" element={<ClipQueue />} />
          <Route path="avards-2026" element={<AwardsSubmitPage/>} />
          <Route path="/avards-admin" element={<AwardsAdminPage />} />
          <Route path="/Bingo" element={<BingoPage/>} />
          <Route path="/Bingo/:sessionId" element={<BingoEditorPage/>} />
          <Route path="/Bingo/join/:joinKey" element={<BingoJoinPage/>} />
          <Route path="/Packs/Galerie" element={<CardGalleryPage />} />
          <Route path="/Packs/Galerie/:twitchLogin" element={<CardGalleryPublicPage />} />
          <Route path="/Packs/Galerien" element={<CardGalleriesIndexPage />} />
          <Route path="/Packs/Achievements" element={<AchievementsPage />} />
          <Route path="/KnowledgeBase" element={<KnowledgeBase />} />
          <Route path="/Casino" element={<CasinoPage />} />
          <Route path="/beta_test_adventure_gfx" element={<AdventureGame/>} />

        </Route>
      </Routes>
    </TwitchAuthProvider>
  );
}
