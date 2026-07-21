// DeckOverlayPage.jsx — Globales Deck-Overlay (OBS-Browserquelle).
// Zeigt nach jedem abgeschlossenen Draft die finalen Decks aller Lobbys, in denen
// der Streamer mitspielt. Läuft die Quelle in OBS auf dem Streamer-PC, ist sie
// zusätzlich die lokale Brücke: Server-Events (Minigame-Start / Draft-Ende)
// werden hier empfangen und als Szenen-/Quellen-Aktionen an OBS weitergegeben.
import React, { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { io } from "socket.io-client";
import { connectObs, runObsEventActions } from "./obsClient";

const CARD_CDN = "https://cdn.royaleapi.com/static/img/cards-150/";
const CARD_ASPECT = 150 / 172; // width / height der Kartenbilder

const RARITY_BORDER = {
  Common: "rgba(148, 163, 184, 0.55)",
  Rare: "rgba(249, 115, 22, 0.65)",
  Epic: "rgba(168, 85, 247, 0.65)",
  Legendary: "rgba(34, 211, 238, 0.7)",
  Champion: "rgba(250, 204, 21, 0.75)",
};

const OUTER_PAD_X = 40;
const OUTER_PAD_Y = 32;
const CELL_GAP = 28; // Abstand zwischen den Spieler-Kacheln (horizontal & vertikal)
const CARD_GAP = 10; // Abstand zwischen den Karten innerhalb eines Decks
const NAME_ROW_H_RATIO = 0.22; // Namenszeile als Anteil der Kartenhöhe
const CELL_FILL_RATIO = 0.9; // Reserve für die Box selbst (Padding/Rand) innerhalb der Kachel

/**
 * Ordnet die Spieler in einem Raster an (2 Spieler → nebeneinander, 4 Spieler → 2×2, …)
 * und berechnet dazu die größtmögliche Kartengröße für ein 4×2-Deck-Layout (wie beim
 * Clash-Royale-Deckbau: 2 Reihen à 4 Karten) pro Spieler-Kachel.
 */
function computeLayout(viewportW, viewportH, playerCount) {
  const n = Math.max(1, playerCount);
  const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
  const rows = Math.max(1, Math.ceil(n / cols));

  const availW = Math.max(0, viewportW - OUTER_PAD_X * 2 - CELL_GAP * (cols - 1));
  const availH = Math.max(0, viewportH - OUTER_PAD_Y * 2 - CELL_GAP * (rows - 1));
  const cellW = (availW / cols) * CELL_FILL_RATIO;
  const cellH = (availH / rows) * CELL_FILL_RATIO;

  // Breiten-Limit: 4 Karten + 3 Lücken müssen nebeneinander in die Kachel passen
  const widthFromW = (cellW - CARD_GAP * 3) / 4;
  const heightFromW = widthFromW / CARD_ASPECT;

  // Höhen-Limit: Namenszeile + 2 Kartenreihen + 1 Lücke dazwischen müssen in die Kachel passen
  const heightFromH = (cellH - CARD_GAP) / (2 + NAME_ROW_H_RATIO);

  const cardHeight = Math.max(20, Math.min(heightFromW, heightFromH));
  const cardWidth = cardHeight * CARD_ASPECT;
  return { cols, rows, cardWidth, cardHeight };
}

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
  const { cols, rows, cardWidth, cardHeight } = computeLayout(viewport.w, viewport.h, players.length);
  const nameFontSize = Math.max(12, cardHeight * NAME_ROW_H_RATIO * 0.7);
  const nameRowHeight = cardHeight * NAME_ROW_H_RATIO;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        fontFamily: "Inter, system-ui, sans-serif",
        background: "transparent",
        color: "#fff",
        boxSizing: "border-box",
        padding: `${OUTER_PAD_Y}px ${OUTER_PAD_X}px`,
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
        gap: CELL_GAP,
        textShadow: "0 2px 6px rgba(0,0,0,.6)",
      }}
    >
      {players.map((p) => (
        <div
          key={p.name}
          style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <div
            style={{
              background: "rgba(15, 15, 19, 1)",
              borderLeft: `${Math.max(3, cardWidth * 0.03)}px solid ${p.color || "#22d3ee"}`,
              borderRadius: Math.max(8, cardWidth * 0.06),
              padding: `${nameRowHeight * 0.3}px ${cardWidth * 0.12}px`,
              boxShadow: "0 12px 32px rgba(0,0,0,.4)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: nameFontSize * 0.5,
                height: nameRowHeight,
                fontWeight: 800,
                fontSize: nameFontSize,
              }}
            >
              <span
                style={{
                  width: nameFontSize * 0.5,
                  height: nameFontSize * 0.5,
                  borderRadius: "50%",
                  background: p.color || "#22d3ee",
                  display: "inline-block",
                  flexShrink: 0,
                }}
              />
              {p.name}
            </div>
            {/* 4×2-Deck-Layout pro Spieler (wie beim Clash-Royale-Deckbau): 2 Reihen à 4 Karten.
                Spieler stehen nebeneinander im Raster (computeLayout) statt untereinander. */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(4, ${cardWidth}px)`,
                gridAutoRows: `${cardHeight}px`,
                gap: CARD_GAP,
              }}
            >
              {(p.deck || []).map((c, i) => (
                <div
                  key={`${c.id}-${i}`}
                  title={c.name}
                  style={{
                    width: cardWidth,
                    height: cardHeight,
                    borderRadius: Math.max(6, cardWidth * 0.08),
                    overflow: "hidden",
                    border: `2px solid ${RARITY_BORDER[c.rarity] || "rgba(255,255,255,.2)"}`,
                    background: "rgba(0,0,0,.35)",
                    lineHeight: 0,
                  }}
                >
                  <img
                    src={`${CARD_CDN}${c.id}.png`}
                    alt={c.name}
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                    onError={(e) => { e.target.style.visibility = "hidden"; }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}

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
    </div>
  );
}
