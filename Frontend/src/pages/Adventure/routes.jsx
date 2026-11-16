// Routen von adVentures (eingehängt in App.jsx): eigene Pixel-Dungeon-Hülle (ui/Shell.jsx).
import { lazy } from "react";
import { Route } from "react-router-dom";

const AdventureShell = lazy(() => import("./ui/Shell.jsx"));
const AdventureGame = lazy(() => import("./AdventureGame"));
// Look-Probe für die 3D-Ansicht: nur im Dev-Server, landet nicht im Build
const Probe3d = import.meta.env.DEV ? lazy(() => import("./render3d/Probe3d.jsx")) : null;
// Bühne für die Kodex-Bilder der 3D-Figuren (fotografiert von render3d/tools/thumbs.mjs), ebenfalls nur im Dev-Server
const Thumbs3d = import.meta.env.DEV ? lazy(() => import("./render3d/Thumbs3d.jsx")) : null;

export const adventureRoutes = (
  <Route path="/adventures" element={<AdventureShell />}>
    <Route index element={<AdventureGame/>} />
    {Probe3d && <Route path="probe3d" element={<Probe3d />} />}
    {Thumbs3d && <Route path="probe3d/bilder" element={<Thumbs3d />} />}
  </Route>
);
