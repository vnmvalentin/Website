// net/useOnlineGame.js — Online-Spiel über Socket.io (Server: Backend/sacrificeSigils/socket.js).
//
// Liefert dieselbe Form wie useLocalGame, damit die Screens nicht wissen müssen, wo die Engine läuft:
//   { room, you, view, batches, timers, clockOffset, connection, notice, error, send, lobby: {...} }
// `batches` ist eine wachsende Liste von { id, view, events } — der Spielbildschirm spielt die Ereignisse jeder
// Charge über die Animations-Queue ab und zeigt danach die neue Sicht.
import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { playerToken, getPrefs, usePrefs } from "../ui/prefs.js";
import { ENGINE_FINGERPRINT } from "../version.js";

let batchSeq = 0;
let gestureSeq = 0;

/**
 * @param {{ code: string|null, name: string, create?: { settings: any, seed: string } | null, onCreated?: (code: string) => void,
 *   prefix?: "ss"|"mw" }} opts  prefix: Ereignis-Präfix (ss = Duell, mw = Moorwanderung)
 */
export function useOnlineGame({ code, name, create, onCreated, prefix = "ss" }) {
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
  const [gesture, setGesture] = useState(/** @type {{ n: number, seat: number, kind: string, target: any } | null} */ (null));
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
        socket.emit(`${prefix}:join`, { code: c, name: nameRef.current, token, mask: getPrefs().mask, fingerprint: ENGINE_FINGERPRINT }, (res) => {
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
        socket.emit(`${prefix}:create`, { name: nameRef.current, token, mask: getPrefs().mask, settings: cr.settings, seed: cr.seed }, (res) => {
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
    socket.on(`${prefix}:room`, (r) => setRoom(r));
    socket.on(`${prefix}:state`, (msg) => {
      setView(msg.view);
      setYou(msg.you);
      setTimers(msg.timers || {});
      if (typeof msg.serverNow === "number") setClockOffset(msg.serverNow - Date.now());
      batchSeq += 1;
      const batch = { id: batchSeq, view: msg.view, events: msg.events || [] };
      setBatches((b) => [...b.slice(-40), batch]);
    });
    socket.on(`${prefix}:notice`, (n) => {
      setNotice(n.text);
      setTimeout(() => setNotice((cur) => (cur === n.text ? null : cur)), 4000);
    });
    // Geste eines anderen am Tisch (statt Chat): { seat, kind, target? }
    socket.on(`${prefix}:gesture`, (g) => {
      if (!g || typeof g.kind !== "string") return;
      gestureSeq += 1;
      setGesture({ n: gestureSeq, seat: g.seat, kind: g.kind, target: g.target || null });
    });
    socket.on(`${prefix}:kicked`, () => setKicked(true));
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [prefix]);

  const call = useCallback((event, payload) => new Promise((resolve) => {
    const s = socketRef.current;
    if (!s || !s.connected) {
      resolve({ ok: false, error: "offline" });
      return;
    }
    s.timeout(8000).emit(event, payload, (err, res) => resolve(err ? { ok: false, error: "timeout" } : res));
  }), []);

  // Maske in den Einstellungen gewechselt (auch mitten im Spiel): dem Raum mitteilen, damit das Gegenüber sie sieht.
  // Beim Beitreten geht sie schon mit — hier nur der spätere Wechsel. Nur im Duell (die Moorwanderung kennt keine Masken).
  const mask = usePrefs().mask;
  const sentMask = useRef(mask);
  useEffect(() => {
    if (prefix !== "ss" || you === null || connection !== "connected" || !room || sentMask.current === mask) return;
    sentMask.current = mask;
    call("ss:mask", { mask });
  }, [mask, prefix, you, connection, room, call]);

  const send = useCallback((action) => call(`${prefix}:action`, { action }), [call, prefix]);
  // Geste verschicken; ein älterer Server kennt das Ereignis nicht — dann verfällt sie still
  const sendGesture = useCallback((kind, target) => { call(`${prefix}:gesture`, { kind, target }); }, [call, prefix]);

  const lobby = {
    setSettings: (settings, seed) => call(`${prefix}:settings`, { settings, seed }),
    setReady: (ready) => call(`${prefix}:ready`, { ready }),
    rematch: () => call(`${prefix}:rematch`, {}),
    leave: () => call(`${prefix}:leave`, {}),
  };

  return { mode: "online", room, you, view, batches, timers, clockOffset, connection, notice, error, kicked, staleClient, send, lobby, gesture, sendGesture };
}
