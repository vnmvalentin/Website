// tournament.js — Gemeinsames der Turnier-Seiten: Socket-Verbindung, Rundennamen, Größen.
// Server: Backend/flickSoccer/tournamentManager.js (Protokoll `ft:` in Backend/routes/flickSoccerRoutes.js).
import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { normalizeSettings } from "./engine/index.js";

export const TOURNAMENT_SIZES = [4, 8, 16, 32, 64];

export function roundsFor(size) {
  let r = 0;
  for (let s = size; s > 1; s /= 2) r += 1;
  return r;
}

/** Name einer Runde, vom Finale aus gezählt. total = Anzahl Runden, round = 0 … total − 1 */
export function roundName(total, round) {
  const left = total - round;
  if (left === 1) return "Finale";
  if (left === 2) return "Halbfinale";
  if (left === 3) return "Viertelfinale";
  if (left === 4) return "Achtelfinale";
  return `Runde ${round + 1}`;
}

/** Regeln auf eine Rundenzahl bringen — wie der Server: am Finale ausgerichtet, frühe Runden erben die erste Regel. */
export function fitRules(rules, count) {
  const list = (Array.isArray(rules) ? rules : []).slice(-count).map((r) => normalizeSettings(r || {}));
  if (!list.length) list.push(normalizeSettings({}));
  while (list.length < count) list.unshift({ ...list[0] });
  return list;
}

export const STATUS_LABEL = { signup: "Anmeldung offen", running: "läuft", done: "beendet", cancelled: "abgesagt" };

/**
 * Eine Socket-Verbindung für eine Turnier-Seite. onConnect läuft bei jedem (Wieder-)Verbinden — dort anmelden/abfragen.
 * call(event, payload) → Promise mit der Antwort des Servers ({ ok, error?, … }).
 */
export function useTournamentSocket(onConnect, handlers = {}) {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const onConnectRef = useRef(onConnect);
  const handlersRef = useRef(handlers);
  onConnectRef.current = onConnect;
  handlersRef.current = handlers;

  const call = useCallback(
    (event, payload = {}) =>
      new Promise((resolve) => {
        const socket = socketRef.current;
        if (!socket) {
          resolve({ ok: false, error: "Keine Verbindung." });
          return;
        }
        socket.timeout(8000).emit(event, payload, (err, res) => {
          resolve(err ? { ok: false, error: "Der Server antwortet nicht." } : res || { ok: false });
        });
      }),
    [],
  );

  useEffect(() => {
    const socket = io("/", { path: "/socket.io", transports: ["websocket", "polling"], reconnection: true, reconnectionDelay: 1000 });
    socketRef.current = socket;
    socket.on("connect", () => {
      setConnected(true);
      onConnectRef.current?.(call);
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("ft:state", (v) => handlersRef.current.onState?.(v));
    socket.on("ft:gone", () => handlersRef.current.onGone?.());
    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [call]);

  return { call, connected };
}
