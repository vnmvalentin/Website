// LobbyDeckOverlayPage.jsx — Lobbyeigenes Deck-Overlay (OBS-Browserquelle).
//
// Anders als DeckOverlayPage (ein Overlay pro Twitch-Account, inklusive OBS-Automatik-
// Brücke) braucht diese Variante keinen Login: Der Link entsteht mit der Lobby selbst
// (lobby.overlayKey, siehe Backend/clashRoyale/core/lobbies.js) und jeder Spieler kann ihn
// im Endscreen kopieren (siehe GameOverScreen.jsx). Er zeigt für die komplette Sitzung —
// über beliebig viele "Erneut spielen"-Runden hinweg — die zuletzt fertiggestellten Decks
// dieser einen Lobby. Reine Anzeige, keine OBS-Szenen-Automatik: die ist ans persönliche
// Streamer-Setup gebunden, nicht an eine einzelne Lobby.
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { io } from "socket.io-client";
import DeckOverlayGrid from "./DeckOverlayGrid";

export default function LobbyDeckOverlayPage() {
  const { overlayKey } = useParams();
  const [decks, setDecks] = useState(null);

  // OBS rendert eine Browserquelle 1:1 in ihrer konfigurierten Auflösung —
  // window.innerWidth/Height entspricht also exakt der Quellengröße (z. B. 1920×1080).
  const [viewport, setViewport] = useState(() => ({
    w: typeof window !== "undefined" ? window.innerWidth : 1920,
    h: typeof window !== "undefined" ? window.innerHeight : 1080,
  }));
  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    let alive = true;

    const fetchState = async () => {
      try {
        const res = await fetch(`/api/clash/lobby-overlay/${overlayKey}`);
        if (!res.ok) return;
        const data = await res.json();
        if (alive) setDecks(data);
      } catch { /* Polling-Fallback — ein einzelner Fehlschlag ist kein Drama */ }
    };
    fetchState();
    const pollIv = setInterval(fetchState, 30000);

    // Live-Updates über Socket.io — greifen sofort nach jedem fertigen Draft, ohne auf den
    // nächsten Poll-Tick zu warten.
    const socket = io("/", {
      path: "/socket.io",
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
    });
    socket.on("connect", () => socket.emit("cr:lobbydeck:join", { overlayKey }));
    socket.on("cr:lobbydeck:state", (payload) => { if (alive) setDecks(payload); });
    socket.on("cr:lobbydeck:update", (payload) => { if (alive) setDecks(payload); });

    return () => {
      alive = false;
      clearInterval(pollIv);
      socket.disconnect();
    };
  }, [overlayKey]);

  return <DeckOverlayGrid players={decks?.players || []} viewport={viewport} />;
}
