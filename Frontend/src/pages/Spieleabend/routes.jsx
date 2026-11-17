// Routen des Spieleabends (eingehängt in App.jsx): 3D-Spielzimmer mit Tisch, eigene Hülle (ui/Shell.jsx).
// /spieleabend öffnet ein neues Zimmer, /spieleabend/:code ist die Einladung. /connect4 (der Vorgänger) leitet hierher.
import { lazy } from "react";
import { Navigate, Route } from "react-router-dom";

const SaShell = lazy(() => import("./ui/Shell.jsx"));
const Zimmer = lazy(() => import("./Zimmer.jsx"));

export const spieleabendRoutes = (
  <>
    <Route path="/spieleabend" element={<SaShell />}>
      <Route index element={<Zimmer />} />
      <Route path=":code" element={<Zimmer />} />
    </Route>
    <Route path="/connect4" element={<Navigate to="/spieleabend" replace />} />
    <Route path="/connect4/*" element={<Navigate to="/spieleabend" replace />} />
  </>
);
