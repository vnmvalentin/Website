// Eine Socket-Verbindung je Turnierseite: meldet sich für Live-Änderungen am Turnier an
// (tournament:changed → Seite lädt neu) und trägt die Match-Räume (tournament/matchRoom.js).
// Die Twitch-Session reist als Cookie mit — der Server erkennt daran Spieler und Veranstalter.
import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

export function useTournamentSocket(tournamentId, onChanged) {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const onChangedRef = useRef(onChanged);
  useEffect(() => { onChangedRef.current = onChanged; }, [onChanged]);

  useEffect(() => {
    if (!tournamentId) return undefined;
    const s = io('/', { path: '/socket.io', transports: ['websocket', 'polling'], reconnection: true });
    s.on('connect', () => {
      setConnected(true);
      s.emit('tournament:watch', { tournamentId });
    });
    s.on('disconnect', () => setConnected(false));
    s.on('tournament:changed', () => onChangedRef.current?.());
    setSocket(s);
    return () => { s.disconnect(); setSocket(null); setConnected(false); };
  }, [tournamentId]);

  return { socket, connected };
}
