// Die komplette Socket-Schicht der Clash-Royale-Minigames.
//
// Vorher lagen Verbindungsaufbau, ~45 Event-Handler, der gesamte Spielzustand und
// alle Aktionen mitten in ClashRoyalePage.jsx zwischen dem JSX von Hub, Lobby und
// Spielphase. Hier ist beides getrennt: dieser Hook weiß alles über den Server und
// nichts über die Darstellung, die Screens umgekehrt.
//
// Was der Hook NICHT tut: Sprache kennen. Fehler wandern als { key, params, message }
// durch — sowohl die eigenen als auch die des Servers. Übersetzt wird erst beim Rendern
// (resolveError() in i18n.js). Vorher hing hier ein langRef, nur damit zwei Handler eine
// deutsche oder englische Meldung zusammenbauen konnten.

import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { STREAMER_ID } from './constants';
import { MODE_CHUNK_LOADERS } from './modesConfig';
import { AVATAR_IDS } from './components/avatars';

const SESSION_KEY = 'clash_session';

const readSession = () => {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
  catch { return null; }
};
const writeSession = (data) => {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(data)); }
  catch { /* privater Modus o.ä. — Auto-Rejoin ist Komfort, kein Muss */ }
};
const clearSession = () => {
  try { localStorage.removeItem(SESSION_KEY); }
  catch { /* ignore */ }
};

/**
 * @param {object|null} user  Eingeloggter Twitch-Nutzer (für den Admin-Einstieg)
 */
export function useClashSocket(user) {
  const socketRef = useRef(null);

  // ── Sitzung & Identität ───────────────────────────────────────────────────
  const [phase, setPhase] = useState('hub');           // 'hub' | 'lobby' | 'game'
  const [playerName, setPlayerName] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState(
    () => readSession()?.avatar || AVATAR_IDS[0] || ''
  );
  const [myId, setMyId] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [lobbyData, setLobbyData] = useState(null);
  const [historyData, setHistoryData] = useState([]);

  // Fehler als { key, params, message } — übersetzt wird erst beim Rendern
  // (resolveError() in i18n.js). null = kein Fehler.
  const [error, setError] = useState(null);

  // ── Spielzustände je Modus ────────────────────────────────────────────────
  const [gameState, setGameState] = useState(null);        // Snake
  const [gameOver, setGameOver] = useState(null);
  const [auctionState, setAuctionState] = useState(null);
  const [auctionReveal, setAuctionReveal] = useState(null);
  const [myBid, setMyBid] = useState(null);
  const [motherWitchVisit, setMotherWitchVisit] = useState(null);
  const [bingoState, setBingoState] = useState(null);
  const [carouselState, setCarouselState] = useState(null);
  const [rushState, setRushState] = useState(null);
  const [rushDenied, setRushDenied] = useState(null);
  const [evoState, setEvoState] = useState(null);
  const [fishState, setFishState] = useState(null);
  const [fishDenied, setFishDenied] = useState(null);
  const [fishAutoCatch, setFishAutoCatch] = useState(null);
  const [mazeState, setMazeState] = useState(null);

  // Refs, damit Socket-Handler (einmalig beim Mount registriert) nicht auf
  // eingefrorene Werte aus ihrer Closure zugreifen
  const playerNameRef = useRef('');
  const avatarRef = useRef('');
  const isAdminModeRef = useRef(false);
  useEffect(() => { playerNameRef.current = playerName; }, [playerName]);
  useEffect(() => { avatarRef.current = selectedAvatar; }, [selectedAvatar]);

  /** Alle modusspezifischen Zustände zurücksetzen (Spielstart, Neustart, Verlassen). */
  const resetGameStates = useCallback(() => {
    setGameState(null); setGameOver(null);
    setAuctionState(null); setAuctionReveal(null); setMyBid(null); setMotherWitchVisit(null);
    setBingoState(null); setCarouselState(null);
    setRushState(null); setRushDenied(null);
    setEvoState(null);
    setFishState(null); setFishDenied(null); setFishAutoCatch(null);
    setMazeState(null);
  }, []);

  /**
   * Fehler anzeigen und nach kurzer Zeit selbst wieder ausblenden.
   * @param {object} payload  { key, params?, message? }
   */
  const flashError = useCallback((payload) => {
    setError(payload);
    setTimeout(() => setError(null), 4000);
  }, []);

  // ── Einladungslink: ?code= übernehmen und URL sofort säubern ───────────────
  // Ein neuer Einladungslink schlägt eine gespeicherte Sitzung: Zeigt die URL einen
  // ANDEREN Lobby-Code als localStorage, wird die alte Sitzung verworfen (kein
  // Auto-Rejoin in die alte Lobby mehr) — Name und Avatar bleiben als Vorbelegung.
  const [initialJoinCode, setInitialJoinCode] = useState('');
  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get('code');
    if (!c) return;
    const urlCode = c.toUpperCase();
    setInitialJoinCode(urlCode);
    const saved = readSession();
    if (saved?.code && saved.code !== urlCode) {
      clearSession();
      if (saved.playerName) { setPlayerName(saved.playerName); playerNameRef.current = saved.playerName; }
      if (saved.avatar) { setSelectedAvatar(saved.avatar); avatarRef.current = saved.avatar; }
    }
    window.history.replaceState({}, '', '/clash-royale');
  }, []);

  // ── Verbindung + Event-Handler ────────────────────────────────────────────
  useEffect(() => {
    if (socketRef.current?.connected) return; // StrictMode-Doppelaufruf abfangen
    const socket = io('/', {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setMyId(socket.id);
      // Auto-Rejoin nach einem Seiten-Reload
      const saved = readSession();
      if (saved?.code && saved?.playerName) {
        setPlayerName(saved.playerName);
        playerNameRef.current = saved.playerName;
        if (saved.avatar) { setSelectedAvatar(saved.avatar); avatarRef.current = saved.avatar; }
        // auto: true → bei ungültiger Sitzung räumt der Server still auf, statt einen Fehler zu zeigen
        socket.emit('clash:joinLobby', {
          code: saved.code, playerName: saved.playerName, avatar: saved.avatar || '', auto: true,
        });
      }
    });
    if (socket.id) setMyId(socket.id);

    // ── Lobby ───────────────────────────────────────────────────────────────
    socket.on('clash:lobbyCreated', ({ code }) => {
      setIsHost(true);
      setPhase('lobby');
      writeSession({ code, playerName: playerNameRef.current, avatar: avatarRef.current });
    });

    socket.on('clash:lobbyJoined', ({ isHost: h, code }) => {
      setIsHost(h);
      setPhase('lobby');
      // Admin-Beobachter-Sitzungen nicht persistieren (kein Auto-Rejoin als Admin)
      if (code && !isAdminModeRef.current) {
        writeSession({ code, playerName: playerNameRef.current, avatar: avatarRef.current });
      }
    });

    socket.on('clash:lobbyUpdate', setLobbyData);
    socket.on('clash:historyData', setHistoryData);

    socket.on('clash:lobbyRestart', ({ cancelled } = {}) => {
      setPhase('lobby');
      resetGameStates();
      if (cancelled) flashError({ key: 'gameCancelled' });
    });

    // ── Spielphase ──────────────────────────────────────────────────────────
    socket.on('clash:gameStart', () => { resetGameStates(); setPhase('game'); });
    // Reconnect mitten im Spiel: Phase wiederherstellen, ohne den Zustand zu leeren
    socket.on('clash:gameReconnect', () => { setPhase('game'); setGameOver(null); });
    socket.on('clash:gameOver', setGameOver);
    socket.on('clash:gameState', setGameState);

    // Ein Timer-Tick gilt immer nur für den gerade laufenden Modus — welcher das ist,
    // weiß der Client hier nicht, deshalb bekommen alle rundenbasierten Zustände ihn.
    // Die nicht aktiven sind null und der Aufruf verpufft.
    socket.on('clash:timerTick', ({ remaining }) => {
      const patch = (prev) => (prev ? { ...prev, timerRemaining: remaining } : prev);
      setGameState(patch);
      setAuctionState(patch);
      setBingoState(patch);
      setCarouselState(patch);
      setEvoState(patch);
    });

    // ── Elixir Auction ──────────────────────────────────────────────────────
    socket.on('clash:auctionRound', (data) => { setAuctionState(data); setAuctionReveal(null); setMyBid(null); });
    socket.on('clash:auctionBidUpdate', ({ pendingBidCount }) =>
      setAuctionState(prev => (prev ? { ...prev, pendingBidCount } : prev)));
    socket.on('clash:auctionReveal', (data) => { setAuctionReveal(data); setAuctionState(data); });
    socket.on('clash:motherWitch:visit', setMotherWitchVisit);
    socket.on('clash:motherWitch:expire', () => setMotherWitchVisit(null));
    socket.on('clash:motherWitch:resolved', ({ accepted, elixir }) => {
      setMotherWitchVisit(null);
      if (!accepted || typeof elixir !== 'number') return;
      const myPid = socketRef.current?.id;
      setAuctionState(prev => (prev ? {
        ...prev,
        players: prev.players.map(p => (p.id === myPid ? { ...p, elixir } : p)),
      } : prev));
    });

    // ── Bingo / Karussell / Evolution ───────────────────────────────────────
    socket.on('clash:bingo:state', setBingoState);
    socket.on('clash:carousel:state', setCarouselState);
    socket.on('clash:evo:state', setEvoState);

    // ── Elixir Rush ─────────────────────────────────────────────────────────
    // Voller State bei jedem Marktereignis, leichter Elixier-Sync jede Sekunde.
    // clientReceivedAt erlaubt dem Client, den Elixierbalken zwischen Syncs flüssig
    // hochzurechnen, statt ihn im Sekundentakt springen zu lassen.
    socket.on('clash:rush:state', (data) => setRushState({ ...data, clientReceivedAt: Date.now() }));
    socket.on('clash:rush:sync', (sync) => setRushState(prev => {
      if (!prev) return prev;
      const byId = Object.fromEntries((sync.players || []).map(p => [p.id, p]));
      return {
        ...prev,
        serverNow: sync.serverNow,
        clientReceivedAt: Date.now(),
        players: prev.players.map(p => (byId[p.id]
          ? { ...p, elixir: byId[p.id].elixir, fullDeadline: byId[p.id].fullDeadline }
          : p)),
      };
    }));
    socket.on('clash:rush:denied', (d) => setRushDenied({ ...d, ts: Date.now() }));

    // ── Angel Royale ────────────────────────────────────────────────────────
    // Voller State bei jedem Spawn/Fang/Despawn — die Bewegung rechnen die Clients selbst
    socket.on('clash:fish:state', (data) => setFishState({ ...data, clientReceivedAt: Date.now() }));
    socket.on('clash:fish:denied', (d) => setFishDenied({ ...d, ts: Date.now() }));
    socket.on('clash:fish:auto', (d) => setFishAutoCatch({ ...d, ts: Date.now() }));

    // ── Dunkles Labyrinth ───────────────────────────────────────────────────
    socket.on('clash:maze:state', (data) => setMazeState({ ...data, clientReceivedAt: Date.now() }));
    socket.on('clash:maze:pos', ({ positions }) => setMazeState(prev => (prev ? { ...prev, positions } : prev)));

    // ── Sitzungsereignisse ──────────────────────────────────────────────────
    socket.on('clash:kicked', () => {
      clearSession();
      setPhase('hub'); setLobbyData(null); resetGameStates();
      flashError({ key: 'kicked' });
    });
    // Gespeicherte Sitzung ist nicht mehr gültig (Lobby existiert nicht mehr) — still aufräumen
    socket.on('clash:sessionExpired', clearSession);
    // Ein anderer Tab hat diese Sitzung übernommen — zurück zum Hub.
    // localStorage NICHT löschen: die Sitzung gehört jetzt dem anderen Tab.
    socket.on('clash:sessionTakeover', () => {
      setPhase('hub'); setLobbyData(null); resetGameStates();
      flashError({ key: 'sessionTakeover' });
    });
    // Der Server schickt { key, params, message } — durchreichen, übersetzt wird beim Rendern
    socket.on('clash:error', (payload) => flashError(payload));

    return () => socket.disconnect();
  }, [resetGameStates, flashError]);

  // ── Admin-Einstieg über ?adminCode=XXX ────────────────────────────────────
  // (z.B. aus dem Admin-Dashboard verlinkt) — nur für den Streamer selbst
  const adminJoinAttemptedRef = useRef(false);
  useEffect(() => {
    if (adminJoinAttemptedRef.current) return;
    const adminCode = new URLSearchParams(window.location.search).get('adminCode');
    if (!adminCode) return;
    if (!user) return; // Twitch-Auth lädt noch — der Effekt läuft erneut, sobald user steht
    if (String(user.id) !== STREAMER_ID) {
      window.history.replaceState({}, '', '/clash-royale');
      return;
    }
    adminJoinAttemptedRef.current = true;
    isAdminModeRef.current = true;
    window.history.replaceState({}, '', '/clash-royale');
    const doJoin = () => socketRef.current?.emit('clash:adminJoinLobby', { code: adminCode.toUpperCase() });
    if (socketRef.current?.connected) doJoin();
    else socketRef.current?.once('connect', doJoin);
  }, [user]);

  // ── Abgeleitete Identität ─────────────────────────────────────────────────
  const mySocketId = myId || socketRef.current?.id;
  // Host-Status aus lobbyData ableiten, damit eine Host-Übergabe nach Disconnect
  // sofort greift und nicht erst beim nächsten lobbyJoined
  const effectiveIsHost = lobbyData ? lobbyData.host === mySocketId : isHost;
  const myPlayerEntry = lobbyData?.players?.find(p => p.id === mySocketId);
  const isClashAdmin = !!myPlayerEntry?.isAdmin;
  // Host-Aktionen (Einstellungen, Kick, Spiel abbrechen …) darf auch der Admin ausführen
  const canControlLobby = effectiveIsHost || isClashAdmin;

  // Ein undefined als drittes Argument würde Socket.io als echten Parameter mitschicken
  // statt als Callback — deshalb die Fallunterscheidung.
  const emit = useCallback((ev, data, ack) => (
    ack ? socketRef.current?.emit(ev, data, ack) : socketRef.current?.emit(ev, data)
  ), []);
  const code = lobbyData?.code;

  /**
   * Kurzform für die vielen Aktionen, die nur den Lobby-Code brauchen.
   * Mit `ack` antwortet der Server direkt — genutzt dort, wo der Client auf ein Ergebnis
   * warten muss (Tag prüfen, Tracking einschalten), statt es aus dem nächsten
   * lobbyUpdate herauszulesen.
   */
  const emitToLobby = useCallback(
    (ev, data = {}, ack) => emit(ev, { code, ...data }, ack),
    [emit, code]
  );

  // Modus-Chunk vorladen, sobald in der Lobby feststeht, was gespielt wird — dann ist
  // er beim Start schon da und der Suspense-Fallback wird gar nicht erst sichtbar.
  useEffect(() => {
    const load = MODE_CHUNK_LOADERS[lobbyData?.mode];
    if (load) load().catch(() => { /* optional; beim Start wird es erneut versucht */ });
  }, [lobbyData?.mode]);

  // ── Aktionen: Sitzung ─────────────────────────────────────────────────────
  // Die Eingabeprüfungen melden dieselben Schlüssel, die auch der Server kennt —
  // der Hook braucht dafür keine übersetzten Texte mehr von außen.
  const createLobby = useCallback(() => {
    if (!playerName.trim()) return flashError({ key: 'nameRequired' });
    setError(null);
    // Der Modus wird erst in der Lobby gewählt — hier startet sie mit dem Standard
    emit('clash:createLobby', {
      playerName: playerName.trim(), mode: 'snake', timerSeconds: 60, avatar: selectedAvatar,
    });
  }, [emit, playerName, selectedAvatar, flashError]);

  const joinLobby = useCallback((joinCode) => {
    const target = (joinCode || '').toUpperCase().trim();
    if (!playerName.trim()) return flashError({ key: 'nameRequired' });
    if (!target) return flashError({ key: 'codeRequired' });
    setError(null);
    emit('clash:joinLobby', { code: target, playerName: playerName.trim(), avatar: selectedAvatar });
  }, [emit, playerName, selectedAvatar, flashError]);

  const leaveLobby = useCallback(() => {
    clearSession();
    // Erst NACH der Server-Bestätigung (Ack) trennen — sonst geht das leaveLobby-Paket
    // beim sofortigen disconnect() gelegentlich verloren und der Spieler bleibt in der
    // Lobby hängen. Der Timeout ist die Rückfallebene, falls kein Ack kommt.
    const finish = () => {
      socketRef.current?.disconnect();
      socketRef.current?.connect();
      setPhase('hub'); setLobbyData(null); setIsHost(false);
      resetGameStates();
    };
    if (!code || !socketRef.current?.connected) return finish();

    let done = false;
    const fallback = setTimeout(() => { if (!done) { done = true; finish(); } }, 1000);
    socketRef.current.emit('clash:leaveLobby', { code }, () => {
      if (done) return;
      done = true;
      clearTimeout(fallback);
      finish();
    });
  }, [code, resetGameStates]);

  const requestHistory = useCallback(() => emitToLobby('clash:requestHistory'), [emitToLobby]);

  return {
    // Zustand
    phase, lobbyData, historyData, error,
    playerName, setPlayerName, selectedAvatar, setSelectedAvatar, initialJoinCode,
    myId: mySocketId, effectiveIsHost, isClashAdmin, canControlLobby,
    gameState, gameOver, auctionState, auctionReveal, myBid, motherWitchVisit,
    bingoState, carouselState, rushState, rushDenied, evoState,
    fishState, fishDenied, fishAutoCatch, mazeState,

    // Sitzung
    createLobby, joinLobby, leaveLobby, requestHistory,

    // Rohzugriff für die Screens: jede weitere Aktion ist ein Einzeiler auf emitToLobby
    // und würde als benannte Funktion hier nur eine dritte Stelle erzeugen, an der ein
    // Event-Name gepflegt werden muss.
    emit, emitToLobby, setMyBid,
  };
}
