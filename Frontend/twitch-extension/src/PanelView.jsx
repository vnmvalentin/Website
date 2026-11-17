// PanelView.jsx — die Win-Tracker-Karte im Twitch-Panel (und als Vorschau auf der Einstellungsseite).
// Die Karte ist die echte OBS-Overlay-Seite (WinTrackerOverlayPage.jsx, liest den Schlüssel per useParams) — hier in
// einem eigenen Router mit Platzhalter-Schlüssel, die Daten kommen über extApi.js. Darunter ein Hinweis, solange keine
// Karte da ist (lädt, kein Win Tracker, kein Account, Störung).
import React, { useEffect, useState } from "react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import WinTrackerOverlayPage from "../../src/pages/ClashRoyale/WinTracker/WinTrackerOverlayPage.jsx";
import { getStatus, subscribeStatus } from "./extApi.js";

const MESSAGE = { loading: "loading", no_tracker: "noTracker", no_account: "noAccount", error: "error" };

export default function PanelView({ t, footer = true }) {
  const [status, setStatus] = useState(getStatus());
  useEffect(() => subscribeStatus(setStatus), []);
  const message = MESSAGE[status.phase];

  return (
    <>
      <div className="tx-card-host" data-tx-card>
        <MemoryRouter initialEntries={["/panel/ext"]}>
          <Routes>
            <Route path="/panel/:overlayKey" element={<WinTrackerOverlayPage />} />
          </Routes>
        </MemoryRouter>
      </div>
      {message && <p className="tx-msg" role="status" data-tx-status={status.phase}>{t.panel[message]}</p>}
      {footer && status.phase === "ok" && <p className="tx-footer">{t.panel.footer}</p>}
    </>
  );
}
