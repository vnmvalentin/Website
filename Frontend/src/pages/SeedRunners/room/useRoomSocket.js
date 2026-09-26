// useRoomSocket — Verbindung zu einem Seed-Runners-Raum (Protokoll: Backend/routes/seedRunnersRoutes.js).
//
// Aufgaben: verbinden, beitreten (mit Token, damit Neuladen und Verbindungsabbrüche denselben Platz
// zurückholen), den Raumzustand bereithalten, die Uhr mit dem Server abgleichen und die Aktionen
// als kleine Funktionen anbieten. Alles Spielerische (Level, Sim, Eingabe) steckt NICHT hier,
// sondern in RaceView.
import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { getIdentity, rememberName } from './identity.js';
import { getFx } from '../client/fxSettings.js';
import { createClockSync } from './clockSync.js';

// Abstand der Uhr-Messungen im laufenden Betrieb; direkt nach dem Beitritt gibt es eine Salve
const PING_EVERY_MS = 4000;
const PING_BURST = 6;
const PING_BURST_GAP_MS = 120;

export function useRoomSocket(code) {
  // connecting → (name) → joining → in; Endzustände: notfound, kicked
  const [status, setStatus] = useState('connecting');
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState(null);
  const [you, setYou] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(null);
  // Zählt erfolgreiche (Wieder-)Beitritte: Wer mitten im Rennen zurückkommt, sendet danach seinen
  // Fortschritt erneut (siehe RaceView), weil Meldungen während der Trennung verloren gehen.
  const [epoch, setEpoch] = useState(0);

  const socketRef = useRef(null);
  const statusRef = useRef('connecting');
  const clockRef = useRef(null);
  if (clockRef.current === null) clockRef.current = createClockSync();

  const setStatusBoth = useCallback((next) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const join = useCallback((name) => {
    const socket = socketRef.current;
    if (!socket) return;
    if (statusRef.current !== 'in') setStatusBoth('joining');
    socket.emit('sr:join', { code, name, token: getIdentity().token, color: getFx().farbe || undefined }, (res) => {
      if (!res?.ok) {
        if (res?.error === 'Raum nicht gefunden.') {
          setStatusBoth('notfound');
        } else {
          setError(res?.error || 'Beitritt fehlgeschlagen.');
          setStatusBoth('name');
        }
        return;
      }
      rememberName(name);
      setYou(res.you);
      setState(res.state);
      setError('');
      setStatusBoth('in');
      setEpoch((e) => e + 1);
    });
  }, [code, setStatusBoth]);

  // Verbindung
  useEffect(() => {
    const socket = io('/', {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      // Nach "kicked" hat ein anderes Fenster den Platz: nicht selbsttätig zurückholen, sonst
      // werfen sich zwei Fenster gegenseitig hinaus
      if (statusRef.current === 'kicked') return;
      const saved = getIdentity().name;
      if (saved) join(saved);
      else if (statusRef.current !== 'in') setStatusBoth('name');
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('sr:state', (next) => setState(next));
    socket.on('sr:notice', (n) => setNotice({ text: n.text, id: Date.now() + Math.random() }));
    socket.on('sr:kicked', () => setStatusBoth('kicked'));

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [join, setStatusBoth]);

  // Uhrenabgleich, solange man im Raum ist: Salve nach dem Beitritt, danach in Abständen
  useEffect(() => {
    if (status !== 'in' || !connected) return undefined;
    const socket = socketRef.current;
    const ping = () => {
      const t0 = Date.now();
      socket.emit('sr:ping', { t: t0 }, (res) => {
        if (res?.ok) clockRef.current.addSample(t0, Date.now(), res.serverNow);
      });
    };
    const timers = [];
    for (let i = 0; i < PING_BURST; i++) timers.push(setTimeout(ping, i * PING_BURST_GAP_MS));
    const every = setInterval(ping, PING_EVERY_MS);
    return () => {
      timers.forEach(clearTimeout);
      clearInterval(every);
    };
  }, [status, connected, epoch]);

  const send = useCallback((event, payload) => new Promise((resolve) => {
    const socket = socketRef.current;
    if (!socket || !socket.connected) {
      resolve({ ok: false, error: 'Keine Verbindung.' });
      return;
    }
    socket.emit(event, payload || {}, (res) => resolve(res || { ok: false, error: 'Keine Antwort.' }));
  }), []);

  const actions = {
    setSettings: (settings) => send('sr:settings', settings),
    setColor: (color) => send('sr:color', { color }),
    start: (mode) => send('sr:start', { mode }),
    ready: (hash, checkpoints) => send('sr:ready', { hash, checkpoints }),
    checkpoint: (index, tick) => send('sr:checkpoint', { index, tick }),
    finish: (payload) => send('sr:finish', payload),
    giveUp: () => send('sr:giveup'),
    toLobby: () => send('sr:lobby'),
    leave: async () => {
      await send('sr:leave');
      socketRef.current?.disconnect();
    },
  };

  const me = state && you ? state.players.find((p) => p.id === you.id) || null : null;

  return { status, connected, state, me, you, error, notice, epoch, join, actions, clock: clockRef.current };
}
