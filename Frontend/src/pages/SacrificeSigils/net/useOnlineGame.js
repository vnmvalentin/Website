// net/useOnlineGame.js — Online-Spiel über Socket.io (Server: Backend/routes/sacrificeSigilsRoutes.js).
//
// Liefert dieselbe Form wie useLocalGame, damit die Screens nicht wissen müssen, wo die Engine läuft:
//   { room, you, view, batches, timers, clockOffset, connection, notice, error, send, lobby: {...} }
// `batches` ist eine wachsende Liste von { id, view, events } — der Spielbildschirm spielt die Ereignisse jeder
// Charge über die Animations-Queue ab und zeigt danach die neue Sicht.
import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { playerToken } from "../ui/prefs.js";
import { ENGINE_FINGERPRINT } from "../version.js";

let batchSeq = 0;

/**
 * @param {{ code: string|null, name: string, create?: { settings: any, seed: string } | null, onCreated?: (code: string) => void }} opts
 */
export function useOnlineGame({ code, name, create, onCreated }) {
  const socketRef = useRef(/** @type {import("socket.io-client").Socket|null} */ (null));
  const [room, setRoom] = useState(/** @type {any} */ (null));
  const [you, setYou] = useState(/** @type {0|1|null} */ (null));
  const [view, setView] = useState(/** @type {any} */ (null));
  const [batches, setBatches] = useState(/** @type {any[]} */ ([]));
  const [timers, setTimers] = useState(/** @type {any} */ ({}));
  const [clockOffset, setClockOffset] = useState(0);
  const [connection, setConnection] = useState("connecting");
  const [notice, setNotice] = useState(/** @type {string|null} */ (null));
  const [error, setError] = useState(/** @type {string|null} */ (null));
  const [kicked, setKicked] = useState(false);
  const [staleClient, setStaleClient] = useState(false);
  const codeRef = useRef(code);
  const nameRef = useRef(name);
  nameRef.current = name;
  const createRef = useRef(create);
  const onCreatedRef = useRef(onCreated);
  onCreatedRef.current = onCreated;

  useEffect(() => {
    const socket = io("/", { path: "/socket.io", transports: ["websocket", "polling"] });
    socketRef.current = socket;
    const token = playerToken();

    const enter = () => {
      setConnection("connected");
      const c = codeRef.current;
      if (c) {
        socket.emit("ss:join", { code: c, name: nameRef.current, token, fingerprint: ENGINE_FINGERPRINT }, (res) => {
          if (!res?.ok) {
            setError(res?.error || "joinFailed");
            return;
          }
          setError(null);
          setYou(res.seat);
          setRoom(res.room);
          if (res.room?.fingerprint && res.room.fingerprint !== ENGINE_FINGERPRINT) setStaleClient(true);
        });
      } else if (createRef.current) {
        const cr = createRef.current;
        createRef.current = null;
        socket.emit("ss:create", { name: nameRef.current, token, settings: cr.settings, seed: cr.seed }, (res) => {
          if (!res?.ok) {
            setError(res?.error || "createFailed");
            return;
          }
          codeRef.current = res.code;
          setYou(res.seat);
          setRoom(res.room);
          onCreatedRef.current?.(res.code);
        });
      }
    };

    socket.on("connect", enter);
    socket.on("disconnect", () => setConnection("lost"));
    socket.io.on("reconnect_attempt", () => setConnection("reconnecting"));
    socket.on("ss:room", (r) => setRoom(r));
    socket.on("ss:state", (msg) => {
      setView(msg.view);
      setYou(msg.you);
      setTimers(msg.timers || {});
      if (typeof msg.serverNow === "number") setClockOffset(msg.serverNow - Date.now());
      batchSeq += 1;
      const batch = { id: batchSeq, view: msg.view, events: msg.events || [] };
      setBatches((b) => [...b.slice(-40), batch]);
    });
    socket.on("ss:notice", (n) => {
      setNotice(n.text);
      setTimeout(() => setNotice((cur) => (cur === n.text ? null : cur)), 4000);
    });
    socket.on("ss:kicked", () => setKicked(true));
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const call = useCallback((event, payload) => new Promise((resolve) => {
    const s = socketRef.current;
    if (!s || !s.connected) {
      resolve({ ok: false, error: "offline" });
      return;
    }
    s.timeout(8000).emit(event, payload, (err, res) => resolve(err ? { ok: false, error: "timeout" } : res));
  }), []);

  const send = useCallback((action) => call("ss:action", { action }), [call]);

  const lobby = {
    setSettings: (settings, seed) => call("ss:settings", { settings, seed }),
    setReady: (ready) => call("ss:ready", { ready }),
    rematch: () => call("ss:rematch", {}),
    leave: () => call("ss:leave", {}),
  };

  return { mode: "online", room, you, view, batches, timers, clockOffset, connection, notice, error, kicked, staleClient, send, lobby };
}
