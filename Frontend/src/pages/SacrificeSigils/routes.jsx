// Routen von Sacrifice & Sigils (eingehängt in App.jsx): eigenes Kartenspiel mit eigener Hülle (Kohle & Kerzenwachs).
import { lazy } from "react";
import { Route } from "react-router-dom";

const SigilsShell = lazy(() => import("./ui/Shell.jsx"));
const SigilsHome = lazy(() => import("./ui/screens/HomeScreen.jsx"));
const SigilsRoom = lazy(() => import("./ui/pages/RoomPage.jsx"));
const SigilsPractice = lazy(() => import("./ui/pages/PracticePage.jsx"));
const SigilsCodex = lazy(() => import("./ui/pages/CodexPage.jsx"));
const SigilsGuide = lazy(() => import("./ui/pages/GuidePage.jsx"));
const SigilsTutorial = lazy(() => import("./ui/pages/TutorialPage.jsx"));
const SigilsRun = lazy(() => import("./ui/pages/MoorwanderungPage.jsx"));
const SigilsRunRoom = lazy(() => import("./ui/pages/RunRoomPage.jsx"));

export const sacrificeSigilsRoutes = (
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
);
