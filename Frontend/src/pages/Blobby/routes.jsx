// Routen von Blobby Volley (eingehängt in App.jsx): eigene Strand-Hülle (ui/Shell.jsx).
import { lazy } from "react";
import { Route } from "react-router-dom";

const BlobbyShell = lazy(() => import("./ui/Shell.jsx"));
const BlobbyPage = lazy(() => import("./BlobbyPage"));
const BlobbyRoom = lazy(() => import("./BlobbyRoom"));

export const blobbyRoutes = (
  <Route path="/blobby" element={<BlobbyShell />}>
    <Route index element={<BlobbyPage/>} />
    <Route path=":code" element={<BlobbyRoom/>} />
  </Route>
);
