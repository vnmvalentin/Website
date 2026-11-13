// Routen von Flick Soccer (eingehängt in App.jsx): rundenbasierter Scheiben-Fußball, Hülle „Kronkorken-Liga" (ui/Shell.jsx).
import { lazy } from "react";
import { Route } from "react-router-dom";

const FlickShell = lazy(() => import("./ui/Shell.jsx"));
const FlickMenu = lazy(() => import("./FlickMenu.jsx"));
const FlickLocal = lazy(() => import("./FlickLocal.jsx"));
const FlickTour = lazy(() => import("./FlickTour.jsx"));
const FlickTrick = lazy(() => import("./FlickTrick.jsx"));
const FlickRoom = lazy(() => import("./FlickRoom.jsx"));
const FlickTournaments = lazy(() => import("./FlickTournaments.jsx"));
const FlickTournament = lazy(() => import("./FlickTournament.jsx"));

export const flickSoccerRoutes = (
  <Route path="/flick-soccer" element={<FlickShell />}>
    <Route index element={<FlickMenu/>} />
    <Route path="spiel" element={<FlickLocal/>} />
    <Route path="tour" element={<FlickTour/>} />
    <Route path="trick" element={<FlickTrick/>} />
    <Route path="trick/:id" element={<FlickTrick/>} />
    <Route path="turnier" element={<FlickTournaments/>} />
    <Route path="turnier/:code" element={<FlickTournament/>} />
    <Route path=":code" element={<FlickRoom/>} />
  </Route>
);
