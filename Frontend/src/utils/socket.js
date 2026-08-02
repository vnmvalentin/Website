// src/utils/socket.js — Socket.io-URL: gleiche Origin (Vite-Proxy) oder VITE_SOCKET_URL
import { useEffect } from "react";
import { io } from "socket.io-client";

/**
 * - Ohne VITE_SOCKET_URL: gleiche Origin wie die Seite (lokal: Vite 5173 → proxy zu Backend).
 * - Mit VITE_SOCKET_URL (z. B. http://127.0.0.1:3001) wenn Frontend und API getrennt laufen.
 */
const explicit = import.meta.env.VITE_SOCKET_URL;
/** `undefined` = gleiche Origin (z. B. Vite-Proxy in Dev) */
export const socketServerUrl =
  typeof explicit === "string" && explicit.trim() !== "" ? explicit.trim() : undefined;

export const socket = io(socketServerUrl, {
  path: "/socket.io",
  withCredentials: true,
  // Bewusst NICHT automatisch: sonst startet der WebSocket-Handshake schon beim
  // Import — also mitten in der Ladephase jeder Seite, im Wettbewerb mit dem
  // ersten Rendern. Verbunden wird stattdessen über ensureSocketConnected(),
  // sobald der Browser Luft hat.
  autoConnect: false,
  transports: ["websocket", "polling"],
});

/**
 * Stellt die Socket-Verbindung her, sobald der Browser nichts Wichtigeres zu tun
 * hat. Mehrfachaufrufe sind unschädlich — wer den Socket braucht, ruft das einfach
 * beim Mounten auf.
 *
 * Emits, die vor dem Verbindungsaufbau abgesetzt werden, puffert socket.io selbst
 * und schickt sie beim Verbinden nach; zusätzlich melden sich die Verbraucher bei
 * jedem `connect`-Ereignis erneut an (siehe useFeedRoom und Layout).
 */
let connectScheduled = false;

export function ensureSocketConnected() {
  // `active` deckt auch den Zustand "verbindet gerade" bzw. "versucht Reconnect" ab
  if (socket.connected || socket.active || connectScheduled) return;
  connectScheduled = true;

  const start = () => {
    connectScheduled = false;
    if (!socket.connected && !socket.active) socket.connect();
  };

  // Bewusst BEIDE Wege: requestIdleCallback trifft den besten Zeitpunkt, feuert
  // aber in Hintergrund-Tabs (und in manchen Automatisierungs-Umgebungen) unter
  // Umständen gar nicht. Der Timer ist die Zusicherung, dass die Verbindung
  // spätestens nach einer Sekunde steht — was zuerst kommt, gewinnt.
  if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(start, { timeout: 1000 });
  }
  setTimeout(start, 1000);
}

/**
 * Tritt einem Live-Feed-Raum bei, solange die Komponente montiert ist.
 *
 * Die vollständigen Abstimmungs-/Giveaway-Daten gehen nur noch an diese Räume.
 * Ohne das bekäme jede verbundene Socket — auch OBS-Overlays und Clash-Royale-
 * Spieler — bei jeder einzelnen Stimme die komplette Liste inklusive aller
 * Teilnehmer geschickt. Siehe Backend/lib/liveBadges.js.
 *
 * @param {"polls"|"giveaways"} feed
 */
export function useFeedRoom(feed) {
  useEffect(() => {
    ensureSocketConnected();
    const join = () => socket.emit("feed:join", feed);
    join();
    // Nach einem Reconnect ist die Raum-Mitgliedschaft weg
    socket.on("connect", join);
    return () => {
      socket.emit("feed:leave", feed);
      socket.off("connect", join);
    };
  }, [feed]);
}
