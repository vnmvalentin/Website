// Routen von Virtual Farm (eingehängt in App.jsx): eigene Hülle, volle Fensterhöhe (ui/menu/GardenShell.jsx).
import { lazy } from "react";
import { Route } from "react-router-dom";

const GardenShell = lazy(() => import("./ui/menu/GardenShell.jsx"));
const GameContainer = lazy(() => import("./GameContainer"));

export const gardenRoutes = (
  <Route path="/garden" element={<GardenShell />}>
    <Route index element={<GameContainer />} />
  </Route>
);
