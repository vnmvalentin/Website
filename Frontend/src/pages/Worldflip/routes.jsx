// Routen von Worldflip (eingehängt in App.jsx): 3D-Kartenspiel für 2 bis 4 am schwebenden Tisch, eigene Hülle (ui/Shell.jsx).
import { lazy } from "react";
import { Route } from "react-router-dom";

const WfShell = lazy(() => import("./ui/Shell.jsx"));
const WfMenu = lazy(() => import("./WfMenu.jsx"));
const WfLocal = lazy(() => import("./WfLocal.jsx"));
const WfRoom = lazy(() => import("./WfRoom.jsx"));

export const worldflipRoutes = (
  <Route path="/worldflip" element={<WfShell />}>
    <Route index element={<WfMenu/>} />
    <Route path="spiel" element={<WfLocal/>} />
    <Route path=":code" element={<WfRoom/>} />
  </Route>
);
