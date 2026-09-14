// DeckOverlayPage.jsx — Globales Deck-Overlay (OBS-Browserquelle).
// Zeigt nach jedem abgeschlossenen Draft die finalen Decks aller Lobbys, in denen
// der Streamer mitspielt. Läuft die Quelle in OBS auf dem Streamer-PC, ist sie
// zusätzlich die lokale Brücke: Server-Events (Minigame-Start / Draft-Ende)
// werden hier empfangen und als Szenen-/Quellen-Aktionen an OBS weitergegeben.
import React, { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { io } from "socket.io-client";
import { connectObs, runObsEventActions } from "./obsClient";
import DeckOverlayGrid from "./DeckOverlayGrid";

export default function DeckOverlayPage() {
  const { overlayKey } = useParams();
  const [decks, setDecks] = useState(null);
  const [debugLines, setDebugLines] = useState([]);

  const cfgRef = useRef({ obs: null, actions: null });
  const obsRef = useRef(null);
  const obsConnectingRef = useRef(false);

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

  const isDebug =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("debug") === "1";

  const log = (line) => {
    if (!isDebug) return;
    setDebugLines((prev) => [...prev.slice(-8), `${new Date().toLocaleTimeString()} ${line}`]);
  };

  // OBS-Verbindung sicherstellen (lazy, mit Wiederverwendung)
  const ensureObs = async () => {
    if (obsRef.current?.connected) return obsRef.current;
    if (obsConnectingRef.current) return null;
    const obsCfg = cfgRef.current.obs;
    if (!obsCfg) return null;
    obsConnectingRef.current = true;
    try {
      const client = await connectObs({
        host: obsCfg.host,
        port: obsCfg.port,
        password: obsCfg.password,
      });
      client.onClose(() => {
        if (obsRef.current === client) obsRef.current = null;
      });
      obsRef.current = client;
      log("OBS verbunden");
      return client;
    } catch (e) {
      log("OBS-Verbindung fehlgeschlagen: " + e.message);
      return null;
    } finally {
      obsConnectingRef.current = false;
    }
  };

  const handleStreamerEvent = async (eventName) => {
    const actionCfg = cfgRef.current.actions?.[eventName];
    if (!actionCfg || (!actionCfg.sceneName && !actionCfg.source)) return;
    const client = await ensureObs();
    if (!client) return;
    try {
      await runObsEventActions(client, actionCfg);
      log(`Event „${eventName}“ ausgeführt`);
    } catch (e) {
      log(`Event „${eventName}“ fehlgeschlagen: ${e.message}`);
    }
  };

  useEffect(() => {
    let alive = true;

    const applyState = (data) => {
      if (!alive || !data) return;
      if (data.obs) cfgRef.current.obs = data.obs;
      if (data.actions) cfgRef.current.actions = data.actions;
      if (data.lastDecks !== undefined) setDecks(data.lastDecks);
    };

    // Initial + Polling-Fallback über REST
    const fetchState = async () => {
      try {
        const res = await fetch(`/api/clash/streamer/overlay/${overlayKey}`);
        if (!res.ok) return;
        applyState(await res.json());
      } catch { /* */ }
    };
    fetchState().then(() => {
      // OBS früh verbinden, damit das erste Event ohne Verzögerung greift
      ensureObs();
    });
    const pollIv = setInterval(fetchState, 30000);

    // Live-Updates über Socket.io
    const socket = io("/", {
      path: "/socket.io",
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
    });
    socket.on("connect", () => {
      socket.emit("cr:deckoverlay:join", { overlayKey });
      log("Server verbunden");
    });
    socket.on("cr:deckoverlay:state", applyState);
    socket.on("cr:deckoverlay:update", (payload) => {
      if (alive) setDecks(payload);
    });
    socket.on("cr:streamer:event", ({ event }) => {
      log(`Event empfangen: ${event}`);
      handleStreamerEvent(event);
    });

    return () => {
      alive = false;
      clearInterval(pollIv);
      socket.disconnect();
      obsRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlayKey]);

  const players = decks?.players || [];

  return (
    <>
      <DeckOverlayGrid players={players} viewport={viewport} />

      {isDebug && (
        <div
          style={{
            position: "fixed",
            left: 12,
            bottom: 12,
            background: "rgba(0,0,0,.8)",
            borderRadius: 6,
            padding: 10,
            fontSize: 11,
            fontFamily: "monospace",
            maxWidth: 400,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Debug</div>
          {debugLines.length === 0 ? <div>Keine Ereignisse.</div> : debugLines.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}
    </>
  );
}
