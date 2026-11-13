// Routen von Seed Runners (eingehängt in App.jsx). Eigene Hülle statt Website-Layout (ui/GameShell.jsx).
import { lazy } from "react";
import { Route, Navigate } from "react-router-dom";

const SeedRunnersShell = lazy(() => import("./ui/GameShell"));
const SeedRunnersPage = lazy(() => import("./SeedRunnersPage"));
const SeedRunnersRoom = lazy(() => import("./SeedRunnersRoom"));
const SeedRunnersDaily = lazy(() => import("./SeedRunnersDaily"));
const SeedRunnersVerlauf = lazy(() => import("./SeedRunnersVerlauf"));
const SeedRunnersSandbox = lazy(() => import("./SeedRunnersSandbox"));
const SeedRunnersEditor = lazy(() => import("./SeedRunnersEditor"));
const SeedRunnersLevels = lazy(() => import("./SeedRunnersLevels"));
const SeedRunnersLevel = lazy(() => import("./SeedRunnersLevel"));
const SeedRunnersCreator = lazy(() => import("./SeedRunnersCreator"));

export const seedRunnersRoutes = (
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
);
