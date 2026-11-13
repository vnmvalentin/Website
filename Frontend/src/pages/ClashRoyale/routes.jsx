// Routen der Clash-Royale-Bereiche (eingehängt in App.jsx): Minigames, Win-Tracker, Turniere, /clash-Hub und Nuzlocke
// laufen in der Arcade-Hülle (ui/CrShell.jsx) mit voller Fensterhöhe. Die OBS-Overlays stehen ohne Hülle in App.jsx.
import { lazy } from "react";
import { Route } from "react-router-dom";

const CrShell = lazy(() => import("./ui/CrShell.jsx"));
const ClashRoyalePage = lazy(() => import("./ClashRoyalePage"));
const TournamentPage = lazy(() => import("./tournament/TournamentPage"));
const TournamentForm = lazy(() => import("./tournament/TournamentForm"));
const WinTrackerPage = lazy(() => import("./WinTracker/WinTrackerPage"));
const WinTrackerRecapPage = lazy(() => import("./WinTracker/WinTrackerRecapPage"));
const ClashHubPage = lazy(() => import("./clash/ClashHubPage"));
const CardGuesser = lazy(() => import("./clash/CardGuesser"));
const WhoAmI = lazy(() => import("./clash/WhoAmI"));
const StatsDuel = lazy(() => import("./clash/StatsDuel"));
const ImageGuess = lazy(() => import("./clash/ImageGuess"));
const CardWordle = lazy(() => import("./clash/CardWordle"));
const ColorGuess = lazy(() => import("./clash/ColorGuess"));
const ViewerGamesPage = lazy(() => import("./clash/ViewerGamesPage"));
const NuzlockePage = lazy(() => import("./Nuzlocke/NuzlockePage"));

export const clashRoyaleRoutes = (
  <>
    <Route path="/clash-royale" element={<CrShell />}>
      <Route index element={<ClashRoyalePage />} />
      {/* Turniere (Backend/clashRoyale/tournament) */}
      <Route path="turnier/neu" element={<TournamentForm />} />
      <Route path="turnier/:id" element={<TournamentPage />} />
      <Route path="turnier/:id/bearbeiten" element={<TournamentForm />} />
      <Route path="win-tracker" element={<WinTrackerPage />} />
      {/* Saisonrückblick als eigene Seite (Backend: lib/winTrackerRecap.js) */}
      <Route path="win-tracker/rueckblick" element={<WinTrackerRecapPage />} />
    </Route>
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
      <Route path="farbe" element={<ColorGuess />} />
      <Route path="viewer-games" element={<ViewerGamesPage />} />
    </Route>
    {/* Nuzlocke: URL bleibt /nuzlocke (SEO) */}
    <Route path="/nuzlocke" element={<CrShell />}>
      <Route index element={<NuzlockePage />} />
    </Route>
  </>
);
