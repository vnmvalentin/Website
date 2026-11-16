// Routen der Clash-Royale-Bereiche (eingehängt in App.jsx): Minigames, Win-Tracker, Turniere, /clash-Hub und Nuzlocke
// laufen in der Arcade-Hülle (ui/CrShell.jsx) mit voller Fensterhöhe. Die OBS-Overlays stehen ohne Hülle in App.jsx.
import { lazy } from "react";
import { Navigate, Route } from "react-router-dom";
import ToClashMain from "./scout/ToClashMain";

const CrShell = lazy(() => import("./ui/CrShell.jsx"));
const ClashRoyalePage = lazy(() => import("./ClashRoyalePage"));
const TournamentPage = lazy(() => import("./tournament/TournamentPage"));
const TournamentForm = lazy(() => import("./tournament/TournamentForm"));
const WinTrackerPage = lazy(() => import("./WinTracker/WinTrackerPage"));
const WinTrackerRecapPage = lazy(() => import("./WinTracker/WinTrackerRecapPage"));
const CardGuesser = lazy(() => import("./clash/CardGuesser"));
const WhoAmI = lazy(() => import("./clash/WhoAmI"));
const StatsDuel = lazy(() => import("./clash/StatsDuel"));
const ImageGuess = lazy(() => import("./clash/ImageGuess"));
const CardWordle = lazy(() => import("./clash/CardWordle"));
const ColorGuess = lazy(() => import("./clash/ColorGuess"));
const HeutePage = lazy(() => import("./clash/HeutePage"));
const ViewerGamesPage = lazy(() => import("./clash/ViewerGamesPage"));
const NuzlockePage = lazy(() => import("./Nuzlocke/NuzlockePage"));
// Stats-Seiten (scout/): Spieler, Clans, Ranglisten, Decks, Karten, Vergleich — Daten über /api/clash/scout
const ScoutHomePage = lazy(() => import("./scout/ScoutHomePage"));
const PlayerPage = lazy(() => import("./scout/PlayerPage"));
const ClanPage = lazy(() => import("./scout/ClanPage"));
const LeaderboardPage = lazy(() => import("./scout/LeaderboardPage"));
const CardsPage = lazy(() => import("./scout/CardsPage").then((m) => ({ default: m.CardsPage })));
const CardDetailPage = lazy(() => import("./scout/CardsPage").then((m) => ({ default: m.CardDetailPage })));
const DecksPage = lazy(() => import("./scout/DecksPage"));
const DeckPage = lazy(() => import("./scout/DeckPage"));
const CrownSeriesPage = lazy(() => import("./scout/CrownSeriesPage"));
const BuilderPage = lazy(() => import("./scout/BuilderPage"));

const ComparePage = lazy(() => import("./scout/ComparePage"));

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
      {/* Hauptseite: Stats-Startseite mit Minigames, Kartenspielen und Streamer-Werkzeugen (scout/ScoutHomePage.jsx) */}
      <Route index element={<ScoutHomePage />} />
      <Route path="kartenraten" element={<CardGuesser />} />
      <Route path="wer-bin-ich" element={<WhoAmI />} />
      <Route path="wer-bin-ich/:code" element={<WhoAmI />} />
      <Route path="stats-duell" element={<StatsDuel />} />
      <Route path="zoom" element={<ImageGuess key="zoom" mode="zoom" />} />
      <Route path="pixel" element={<ImageGuess key="pixel" mode="pixel" />} />
      <Route path="wordle" element={<CardWordle />} />
      <Route path="farbe" element={<ColorGuess />} />
      {/* Tagesrunde aller fünf Ratespiele mit Serie und Bestenliste (clash/dailyRound.js, Backend clashRoyale/daily/) */}
      <Route path="heute" element={<HeutePage />} />
      <Route path="viewer-games" element={<ViewerGamesPage />} />
      {/* Die Stats-Startseite lag bis Nov. 2026 hier — alte Links führen auf die Hauptseite */}
      <Route path="spieler" element={<ToClashMain />} />
      <Route path="spieler/:tag" element={<PlayerPage />} />
      <Route path="clan/:tag" element={<ClanPage />} />
      <Route path="ranglisten" element={<LeaderboardPage />} />
      <Route path="karten" element={<CardsPage />} />
      <Route path="karten/:id" element={<CardDetailPage />} />
      <Route path="decks" element={<DecksPage />} />
      {/* Ein einzelnes Deck — die Adresse trägt die acht Karten (scout/scoutUtil.js: deckPath) */}
      <Route path="decks/:karten" element={<DeckPage />} />
      {/* Deck-Baukasten: Deck bauen, Lücken sehen, ähnliche Meta Decks (scout/deckBuilder.js); ?karten= trägt die Auswahl */}
      <Route path="baukasten" element={<BuilderPage />} />
      {/* Crown Series: Duell-Decks im 4er-Set (Backend: scout/scoutCrown.js) */}
      <Route path="crown-series" element={<CrownSeriesPage />} />
      {/* /clash/meta hieß die Decks-Seite bis Nov. 2026 — alte Links führen weiter dorthin */}
      <Route path="meta" element={<Navigate to="/clash/decks" replace />} />
      <Route path="vergleich" element={<ComparePage />} />
    </Route>
    {/* Nuzlocke: URL bleibt /nuzlocke (SEO) */}
    <Route path="/nuzlocke" element={<CrShell />}>
      <Route index element={<NuzlockePage />} />
    </Route>
  </>
);
