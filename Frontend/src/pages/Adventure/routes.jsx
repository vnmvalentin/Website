// Routen von adVentures (eingehängt in App.jsx): eigene Pixel-Dungeon-Hülle (ui/Shell.jsx).
import { lazy } from "react";
import { Route } from "react-router-dom";

const AdventureShell = lazy(() => import("./ui/Shell.jsx"));
const AdventureGame = lazy(() => import("./AdventureGame"));

export const adventureRoutes = (
  <Route path="/adventures" element={<AdventureShell />}>
    <Route index element={<AdventureGame/>} />
  </Route>
);
