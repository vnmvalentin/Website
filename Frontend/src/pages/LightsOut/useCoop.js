// useCoop.js — Verbindung zum Koop-Raum von Lights Out (Backend/routes/lightsOutRoutes.js).
//
// Hält den Socket, den Raum (Spieler, Host, Code) und reicht Spielnachrichten an das laufende Spiel weiter
// (gameRef.current.net(kind, payload)). Die Spielwelt selbst kennt den Socket nicht: Sie bekommt ein schlankes
// net-Objekt (makeNet) mit send(kind, payload) und isHost().
import { useCallback, useEffect, useRef, useState } from 'react';

const TOKEN_KEY = 'lo:token';
const NAME_KEY = 'lo:name';

function token() {
  try {
    let t = localStorage.getItem(TOKEN_KEY);
    if (!t || !/^[A-Za-z0-9_-]{8,64}$/.test(t)) {
      t = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(TOKEN_KEY, t);
    }
    return t;
  } catch {
    return `t${Math.random().toString(36).slice(2, 14)}`;
  }
}

export function loadName() {
  try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; }
}
function saveName(n) {
  try { localStorage.setItem(NAME_KEY, n); } catch { /* privates Fenster */ }
}

const SEND_EVENT = { state: 'lo:state', world: 'lo:world', event: 'lo:event' };

/**
 * @param {{ gameRef: { current: any }, onStart: (payload:object, net:object) => void, onLobby: () => void }} p
 */
export function useCoop({ gameRef, onStart, onLobby }) {
  const [room, setRoom] = useState(null);
  const [mySeat, setMySeat] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const socketRef = useRef(null);
  const seatRef = useRef(null);
  const roomRef = useRef(null);
  const nameRef = useRef('');
  const startRef = useRef(onStart);
  const lobbyRef = useRef(onLobby);
  startRef.current = onStart;
  lobbyRef.current = onLobby;

  /** Schlankes net-Objekt für createGame (game.js) zu einer Runde. */
  const makeNet = useCallback((payload) => ({
    mySeat: seatRef.current,
    players: payload.players || [],
    round: payload.round,
    isHost: () => roomRef.current?.hostSeat === seatRef.current,
    send: (kind, p) => socketRef.current?.emit(SEND_EVENT[kind], p),
  }), []);

  const connect = useCallback(async () => {
    if (socketRef.current) return socketRef.current;
    const { io } = await import('socket.io-client');
    const socket = io('/', { path: '/socket.io', transports: ['websocket', 'polling'], reconnection: true, reconnectionDelay: 1000 });
    socketRef.current = socket;
    socket.on('lo:room', (v) => {
      roomRef.current = v;
      setRoom(v);
    });
    socket.on('lo:start', (p) => {
      if (roomRef.current) roomRef.current = { ...roomRef.current, hostSeat: p.hostSeat, phase: 'playing' };
      startRef.current?.(p, makeNet(p));
    });
    socket.on('lo:lobby', () => lobbyRef.current?.());
    socket.on('lo:peer', (p) => gameRef.current?.net?.('peer', p));
    socket.on('lo:world', (p) => gameRef.current?.net?.('world', p));
    socket.on('lo:event', (p) => gameRef.current?.net?.('event', p));
    socket.on('lo:host', ({ hostSeat }) => {
      if (roomRef.current) roomRef.current = { ...roomRef.current, hostSeat };
      gameRef.current?.net?.('host', hostSeat === seatRef.current);
    });
    socket.on('lo:left', ({ seat }) => gameRef.current?.net?.('left', seat));
    // Verbindung kurz weg (WLAN, Server-Neustart): mit demselben Token wieder auf den eigenen Platz
    socket.io.on('reconnect', () => {
      const code = roomRef.current?.code;
      if (!code) return;
      socket.emit('lo:join', { code, name: nameRef.current, token: token() }, (res) => {
        if (!res?.ok) { setError(res?.error === 'notFound' ? 'Der Raum existiert nicht mehr.' : res?.error || 'Verbindung verloren.'); return; }
        seatRef.current = res.seat;
        setMySeat(res.seat);
        roomRef.current = res.room;
        setRoom(res.room);
      });
    });
    return socket;
  }, [gameRef, makeNet]);

  const enter = useCallback(async (kind, { name, code }) => {
    const clean = String(name || '').trim().slice(0, 18);
    if (!clean) { setError('Bitte gib einen Namen ein.'); return; }
    if (kind === 'join' && !/^[A-Za-z0-9]{5}$/.test(String(code || '').trim())) { setError('Der Code hat fünf Zeichen.'); return; }
    nameRef.current = clean;
    saveName(clean);
    setError('');
    setBusy(true);
    let socket;
    try {
      socket = await connect();
    } catch {
      setBusy(false);
      setError('Keine Verbindung zum Server.');
      return;
    }
    const payload = kind === 'create' ? { name: clean, token: token() } : { code: String(code).trim().toUpperCase(), name: clean, token: token() };
    const timer = setTimeout(() => { setBusy(false); setError('Der Server antwortet nicht.'); }, 8000);
    socket.emit(kind === 'create' ? 'lo:create' : 'lo:join', payload, (res) => {
      clearTimeout(timer);
      setBusy(false);
      if (!res?.ok) {
        setError(res?.error === 'notFound' ? 'Kein Raum mit diesem Code.' : res?.error || 'Das hat nicht geklappt.');
        return;
      }
      seatRef.current = res.seat;
      setMySeat(res.seat);
      roomRef.current = res.room;
      setRoom(res.room);
      // Mitten in eine laufende Runde zurück (Neuladen der Seite)
      if (res.start) startRef.current?.(res.start, makeNet(res.start));
    });
  }, [connect, makeNet]);

  const create = useCallback((name) => enter('create', { name }), [enter]);
  const join = useCallback((code, name) => enter('join', { code, name }), [enter]);

  const startLevel = useCallback((level, seed) => {
    socketRef.current?.emit('lo:start', { level, seed }, (res) => { if (res && !res.ok) setError(res.error || 'Start fehlgeschlagen.'); });
  }, []);
  const backToLobby = useCallback(() => socketRef.current?.emit('lo:lobby', {}, () => {}), []);

  const leave = useCallback(() => {
    const s = socketRef.current;
    socketRef.current = null;
    roomRef.current = null;
    seatRef.current = null;
    setRoom(null);
    setMySeat(null);
    if (s) {
      s.emit('lo:leave', {}, () => {});
      s.removeAllListeners();
      s.io.removeAllListeners?.('reconnect');
      setTimeout(() => s.disconnect(), 150);
    }
  }, []);

  useEffect(() => () => {
    const s = socketRef.current;
    if (s) { s.removeAllListeners(); s.disconnect(); }
  }, []);

  const isHost = room != null && mySeat != null && room.hostSeat === mySeat;
  return { room, mySeat, isHost, error, setError, busy, create, join, startLevel, backToLobby, leave };
}
