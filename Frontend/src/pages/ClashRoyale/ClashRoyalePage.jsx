import React, { useState, useEffect, useRef, useCallback, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import {
  Sword, Copy, Check, Users, Clock, Play, Crown, LogOut,
  Link2, UserX, Eye, EyeOff, Trophy, Worm, Droplets,
  LayoutGrid, Rows, Hash, Ban, Shield, ArrowLeftRight, XCircle, X,
} from 'lucide-react';
import SEO from '../../components/SEO';
import { TwitchAuthContext } from '../../components/TwitchAuthContext';
import { RARITY_COLOR } from './data/cards';
import SnakeRoyale from './modes/SnakeRoyale';
import ElixirAuction from './modes/ElixirAuction';
import BingoRoyale from './modes/BingoRoyale';
import { getMyBannedCardsList } from './BannedCards/bannedCardsApi';

const NUZLOCKE_REDIRECT_KEY = 'clash_nuzlocke_redirect';
const STREAMER_ID = '160224748';

const MODES = [
  {
    id: 'snake',
    name: 'Snake Royale',
    icon: Worm,
    desc: 'Wähle Karten aus einem 11×11-Raster – aber nur anliegend an die zuletzt gewählte Karte. Baue das beste Deck!',
    available: true,
  },
  {
    id: 'auction',
    name: 'Elixir Auction',
    icon: Droplets,
    desc: 'Starte mit 100 Elixier und biete in jeder Runde auf angezeigte Karten. Der Höchstbietende gewinnt – Verlierer erhalten einen Trostpreis!',
    available: true,
  },
  {
    id: 'bingo',
    name: 'Bingo Royale',
    icon: Hash,
    desc: 'Fülle deine Bingo-Karte mit Clash Royale Karten. Bingos geben dir PowerUps mit denen du dein Deck verbessern oder gegnerische sabotieren kannst.',
    available: true,
  },
];

const TIMER_OPTIONS = [15, 30, 45, 60, 90, 120];

const CARD_CDN = 'https://cdn.royaleapi.com/static/img/cards-150/';

// Alle Bilder aus src/assets/avatars/ automatisch einlesen (wird beim Build aufgelöst)
const _avatarGlob = import.meta.glob(
  '/src/assets/avatars/*.{png,jpg,jpeg,gif,webp,PNG,JPG,JPEG,GIF,WEBP}',
  { eager: true }
);
// Map: "held.png" → "/assets/held-abc123.png"
const AVATAR_URL_MAP = Object.fromEntries(
  Object.entries(_avatarGlob).map(([p, m]) => [p.split('/').pop(), m.default])
);
const AVATAR_IDS = Object.keys(AVATAR_URL_MAP).sort();

function avatarUrl(id) {
  if (!id) return null;
  return AVATAR_URL_MAP[id] ?? null;
}

function PlayerAvatar({ avatarId, size = 28, className = '', isAdmin = false }) {
  if (isAdmin) {
    return (
      <div className={`rounded-full shrink-0 bg-cyan-500/20 border-2 border-cyan-400 flex items-center justify-center ${className}`}
        style={{ width: size, height: size }}>
        <Shield size={Math.round(size * 0.55)} className="text-cyan-300" />
      </div>
    );
  }
  const url = avatarUrl(avatarId);
  if (!url) return (
    <div className={`rounded-full shrink-0 bg-[#1a1a20] border border-white/20 ${className}`}
      style={{ width: size, height: size }} />
  );
  return (
    <div className={`rounded-full overflow-hidden shrink-0 border border-white/20 bg-[#1a1a20] ${className}`}
      style={{ width: size, height: size }}>
      <img src={url} alt=""
        className="w-full h-full object-cover object-center" />
    </div>
  );
}


export default function ClashRoyalePage() {
  const navigate = useNavigate();
  const { user, login } = useContext(TwitchAuthContext);
  const socketRef      = useRef(null);
  const playerNameRef  = useRef('');
  const avatarRef      = useRef('');
  const [phase, setPhase] = useState('hub');
  const [selectedMode, setSelectedMode] = useState('snake');
  const [playerName, setPlayerName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const [codeHidden, setCodeHidden] = useState(true);
  const [linkHidden, setLinkHidden] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyData, setHistoryData] = useState([]);

  const [selectedAvatar, setSelectedAvatar] = useState(() => {
    try { return JSON.parse(localStorage.getItem('clash_session') || '{}').avatar || AVATAR_IDS[0] || ''; }
    catch { return AVATAR_IDS[0] ?? ''; }
  });
  const [lobbyData, setLobbyData] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [myId, setMyId] = useState('');
  // Derive host status from lobbyData so host-transfers via disconnect are reflected immediately
  const effectiveIsHost = lobbyData ? lobbyData.host === (myId || socketRef.current?.id) : isHost;
  const mySocketId = myId || socketRef.current?.id;
  const myPlayerEntry = lobbyData?.players?.find(p => p.id === mySocketId);
  const isClashAdmin = !!myPlayerEntry?.isAdmin;
  // Host-Aktionen (Einstellungen, Kick, Spiel abbrechen, ...) dürfen auch vom Admin ausgeführt werden
  const canControlLobby = effectiveIsHost || isClashAdmin;
  const isAdminModeRef = useRef(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [gameState, setGameState] = useState(null);
  const [gameOver, setGameOver] = useState(null);
  // Auction-specific
  const [auctionState, setAuctionState] = useState(null);
  const [auctionReveal, setAuctionReveal] = useState(null);
  const [myBid, setMyBid] = useState(null);
  const [motherWitchVisit, setMotherWitchVisit] = useState(null);
  // Bingo-specific
  const [bingoState, setBingoState] = useState(null);

  // Keep refs in sync for use inside socket handlers (avoid stale closure)
  useEffect(() => { playerNameRef.current = playerName; }, [playerName]);
  useEffect(() => { avatarRef.current = selectedAvatar; }, [selectedAvatar]);

  // Pre-fill code from URL ?code= then immediately clean URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const c = params.get('code');
    if (c) {
      setJoinCode(c.toUpperCase());
      window.history.replaceState({}, '', '/clash-royale');
    }
  }, []);

  // Nach Twitch-Login (Redirect-Roundtrip) automatisch zur Moderator-Seite weiterleiten
  useEffect(() => {
    if (!user) return;
    if (sessionStorage.getItem(NUZLOCKE_REDIRECT_KEY) !== '1') return;
    sessionStorage.removeItem(NUZLOCKE_REDIRECT_KEY);
    getMyBannedCardsList()
      .then((doc) => navigate(`/banned-cards/moderator/${doc.modKey}`))
      .catch(() => {});
  }, [user, navigate]);

  const handleNuzlockeClick = () => {
    if (!user) {
      sessionStorage.setItem(NUZLOCKE_REDIRECT_KEY, '1');
      login();
      return;
    }
    getMyBannedCardsList()
      .then((doc) => navigate(`/banned-cards/moderator/${doc.modKey}`))
      .catch(() => {});
  };

  // Socket setup — guard against React StrictMode double-invoke
  useEffect(() => {
    if (socketRef.current?.connected) return; // bereits verbunden, nicht neu erstellen
    const socket = io('/', {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setMyId(socket.id);
      // Auto-rejoin from localStorage after page reload
      try {
        const saved = JSON.parse(localStorage.getItem('clash_session') || 'null');
        if (saved?.code && saved?.playerName) {
          setPlayerName(saved.playerName);
          playerNameRef.current = saved.playerName;
          if (saved.avatar) { setSelectedAvatar(saved.avatar); avatarRef.current = saved.avatar; }
          socket.emit('clash:joinLobby', { code: saved.code, playerName: saved.playerName, avatar: saved.avatar || '' });
        }
      } catch {}
    });
    if (socket.id) setMyId(socket.id);
    socket.on('clash:lobbyCreated', ({ code }) => {
      setIsHost(true); setPhase('lobby');
      try { localStorage.setItem('clash_session', JSON.stringify({ code, playerName: playerNameRef.current, avatar: avatarRef.current })); } catch {}
    });
    socket.on('clash:lobbyJoined', ({ isHost: h, code, reconnected }) => {
      setIsHost(h); setPhase('lobby');
      // Admin-Beobachter-Sessions nicht in localStorage persistieren (kein Auto-Rejoin als Admin)
      if (code && !isAdminModeRef.current) {
        try { localStorage.setItem('clash_session', JSON.stringify({ code, playerName: playerNameRef.current, avatar: avatarRef.current })); } catch {}
      }
    });
    socket.on('clash:gameReconnect', ({ mode }) => {
      // Restore game phase without resetting game state
      setPhase('game'); setGameOver(null);
    });
    socket.on('clash:lobbyUpdate', setLobbyData);
    socket.on('clash:gameStart', () => { setPhase('game'); setGameOver(null); setAuctionState(null); setAuctionReveal(null); setMyBid(null); setBingoState(null); setMotherWitchVisit(null); });
    socket.on('clash:gameState', setGameState);
    socket.on('clash:timerTick', ({ remaining }) => {
      setGameState(prev => prev ? { ...prev, timerRemaining: remaining } : prev);
      setAuctionState(prev => prev ? { ...prev, timerRemaining: remaining } : prev);
      setBingoState(prev => prev ? { ...prev, timerRemaining: remaining } : prev);
    });
    socket.on('clash:gameOver', setGameOver);
    socket.on('clash:auctionRound', (data) => { setAuctionState(data); setAuctionReveal(null); setMyBid(null); });
    socket.on('clash:auctionBidUpdate', ({ pendingBidCount }) =>
      setAuctionState(prev => prev ? { ...prev, pendingBidCount } : prev));
    socket.on('clash:auctionReveal', (data) => { setAuctionReveal(data); setAuctionState(data); });
    socket.on('clash:bingo:state', setBingoState);
    socket.on('clash:historyData', setHistoryData);
    socket.on('clash:motherWitch:visit', (data) => setMotherWitchVisit(data));
    socket.on('clash:motherWitch:expire', () => setMotherWitchVisit(null));
    socket.on('clash:motherWitch:resolved', ({ accepted, elixir }) => {
      setMotherWitchVisit(null);
      if (accepted && typeof elixir === 'number') {
        const myPid = socketRef.current?.id;
        setAuctionState(prev => prev ? {
          ...prev,
          players: prev.players.map(p => p.id === myPid ? { ...p, elixir } : p),
        } : prev);
      }
    });
    socket.on('clash:lobbyRestart', ({ cancelled } = {}) => {
      setPhase('lobby');
      setGameOver(null); setGameState(null);
      setAuctionState(null); setAuctionReveal(null); setMyBid(null);
      setBingoState(null); setMotherWitchVisit(null);
      setCodeHidden(true); setLinkHidden(true);
      if (cancelled) {
        setError('Das Spiel wurde vom Host/Admin abgebrochen.');
        setTimeout(() => setError(''), 4000);
      }
    });
    socket.on('clash:kicked', () => {
      try { localStorage.removeItem('clash_session'); } catch {}
      setError('Du wurdest aus der Lobby entfernt.');
      setPhase('hub'); setLobbyData(null); setGameState(null);
    });
    socket.on('clash:error', ({ message }) => {
      setError(message);
      setTimeout(() => setError(''), 3000);
    });

    return () => socket.disconnect();
  }, []);

  // Admin-Einstieg über ?adminCode=XXX (z.B. aus dem Admin-Dashboard verlinkt) — nur für den Streamer
  const adminJoinAttemptedRef = useRef(false);
  useEffect(() => {
    if (adminJoinAttemptedRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const adminCode = params.get('adminCode');
    if (!adminCode) return;
    if (!user) return; // Twitch-Auth lädt noch nach — später erneut versuchen
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

  const emit = useCallback((ev, data) => socketRef.current?.emit(ev, data), []);

  // ── Actions ──────────────────────────────────────────────────────────────
  const handleCreate = () => {
    if (!playerName.trim()) return setError('Bitte Namen eingeben');
    setError('');
    emit('clash:createLobby', { playerName: playerName.trim(), mode: selectedMode, timerSeconds: 60, avatar: selectedAvatar });
  };

  const handleJoin = (codeOverride) => {
    const code = (codeOverride || joinCode).toUpperCase().trim();
    if (!playerName.trim()) return setError('Bitte Namen eingeben');
    if (!code) return setError('Bitte Lobby-Code eingeben');
    setError('');
    emit('clash:joinLobby', { code, playerName: playerName.trim(), avatar: selectedAvatar });
  };

  const handlePickCard = useCallback((cellIndex) =>
    emit('clash:pickCard', { code: lobbyData?.code, cellIndex }), [emit, lobbyData?.code]);

  const handleStart = () => emit('clash:startGame', { code: lobbyData?.code });
  const handleKick = (id) => emit('clash:kickPlayer', { code: lobbyData?.code, playerId: id });
  const handleSetTimer = (s) => emit('clash:setTimer', { code: lobbyData?.code, seconds: s });
  const handleSetCardsPerRound = (n) => emit('clash:setCardsPerRound', { code: lobbyData?.code, count: n });
  const handleAuctionBid = useCallback((cardIndex, amount) => {
    setMyBid({ cardIndex, amount });
    emit('clash:auction:bid', { code: lobbyData?.code, cardIndex, amount });
  }, [emit, lobbyData?.code]);

  const handleLeave = () => {
    try { localStorage.removeItem('clash_session'); } catch {}
    if (lobbyData?.code) emit('clash:leaveLobby', { code: lobbyData.code });
    socketRef.current?.disconnect();
    socketRef.current?.connect();
    setPhase('hub'); setLobbyData(null); setGameState(null); setGameOver(null); setIsHost(false);
    setAuctionState(null); setAuctionReveal(null); setMyBid(null); setBingoState(null); setMotherWitchVisit(null);
    setCodeHidden(true); setLinkHidden(true);
  };

  const handleRestart = () => emit('clash:restartLobby', { code: lobbyData?.code });
  const handleCancelGame = () => {
    if (window.confirm('Spiel wirklich abbrechen? Alle Spieler kehren zur Lobby zurück, der Fortschritt dieser Runde geht verloren.')) {
      emit('clash:restartLobby', { code: lobbyData?.code });
    }
  };
  const handleTransferHost = (targetId) => {
    const target = lobbyData?.players?.find(p => p.id === targetId);
    if (!target) return;
    if (window.confirm(`Host-Status an "${target.name}" übergeben?${effectiveIsHost ? ' Du verlierst danach deine Host-Rechte.' : ''}`)) {
      emit('clash:transferHost', { code: lobbyData?.code, targetPlayerId: targetId });
    }
  };
  const handleSetPlayerSpectator = (targetId, isSpectator) =>
    emit('clash:setPlayerSpectator', { code: lobbyData?.code, targetPlayerId: targetId, isSpectator });
  const handleBingoPick = useCallback((cardIndex, bingoCell) =>
    emit('clash:bingo:pick', { code: lobbyData?.code, cardIndex, bingoCell }), [emit, lobbyData?.code]);
  const handleBingoPowerup = useCallback((type, params) =>
    emit('clash:bingo:powerup', { code: lobbyData?.code, type, ...params }), [emit, lobbyData?.code]);
  const handleToggleSpectator = () => emit('clash:toggleSpectator', { code: lobbyData?.code });
  const handleSetShowElixir = (show) => emit('clash:setShowElixir', { code: lobbyData?.code, show });
  const handleSetStartElixir = (amount) => emit('clash:setStartElixir', { code: lobbyData?.code, amount });
  const handleSetMotherWitch = (enabled) => emit('clash:setMotherWitch', { code: lobbyData?.code, enabled });
  const handleMotherWitchRespond = useCallback((accept) =>
    emit('clash:motherWitch:respond', { code: lobbyData?.code, accept }), [emit, lobbyData?.code]);
  const handleSetGridSize = (size) => emit('clash:setGridSize', { code: lobbyData?.code, size });
  const handleOpenHistory = () => {
    emit('clash:requestHistory', { code: lobbyData?.code });
    setHistoryOpen(true);
  };

  const copyText = (text, key) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(''), 2000);
    });
  };

  const lobbyLink = lobbyData ? `${window.location.origin}/clash-royale?code=${lobbyData.code}` : '';

  // ── Hub ───────────────────────────────────────────────────────────────────
  if (phase === 'hub') return (
    <div className="h-full overflow-y-auto custom-scrollbar">
      <SEO title="Clash Royale Minigames" description="Multiplayer Minigames im Clash Royale Stil." path="/clash-royale" />

      <div className="border-b border-white/5 bg-[#0f0f13] px-6 py-8 text-center relative">
        <div className="flex items-center justify-center gap-4 mb-1">
          <img
            src="https://cdn.royaleapi.com/static/img/clash-royale.png"
            alt="Clash Royale"
            className="h-14 w-auto drop-shadow-lg"
            onError={e => { e.target.style.display = 'none'; }}
          />
          <h1 className="text-4xl font-black text-white tracking-tight">Clash Royale</h1>
        </div>
        <p className="text-gray-500 text-sm mb-4">Multiplayer Minigames · Echtzeit · Lobbybasiert</p>
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={handleNuzlockeClick}
            title="Gebannte Karten verwalten (Moderator-Seite)"
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-sm text-xs font-semibold border bg-white/5 border-white/10 text-gray-400 hover:border-red-500/40 hover:text-red-300 transition-colors"
          >
            <Ban size={12} />
            Nuzlocke
          </button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">

        <div className="bg-[#0f0f13] border border-white/5 rounded-sm p-6 space-y-4">
          <h2 className="text-white font-bold">Spieler</h2>

          {/* Name + selected avatar preview */}
          <div className="flex items-center gap-3">
            <PlayerAvatar avatarId={selectedAvatar} size={40} />
            <input
              value={playerName}
              onChange={e => setPlayerName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              placeholder="Dein Name…"
              maxLength={20}
              className="flex-1 bg-[#1a1a20] border border-white/10 rounded-sm px-4 py-2.5 text-white placeholder-gray-600 focus:border-cyan-500 outline-none text-sm"
            />
          </div>

          {/* Avatar picker — nur anzeigen wenn Bilder vorhanden */}
          {AVATAR_IDS.length > 0 && (
            <div>
              <p className="text-gray-500 text-xs mb-2">Profilbild wählen</p>
              <div className="flex flex-wrap gap-2">
                {AVATAR_IDS.map(id => (
                  <button key={id}
                    onClick={() => setSelectedAvatar(id)}
                    title={id.replace(/\.[^.]+$/, '')}
                    className={`rounded-full overflow-hidden border-2 transition-all shrink-0 ${
                      selectedAvatar === id
                        ? 'border-cyan-500 ring-2 ring-cyan-500/30 scale-110'
                        : 'border-white/15 hover:border-white/40'
                    }`}
                    style={{ width: 48, height: 48 }}>
                    <img src={AVATAR_URL_MAP[id]} alt={id}
                      className="w-full h-full object-cover object-center" />
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <input
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && handleJoin()}
              placeholder="Lobby-Code eingeben…"
              maxLength={6}
              className="flex-1 bg-[#1a1a20] border border-white/10 rounded-sm px-4 py-2.5 text-white placeholder-gray-600 focus:border-cyan-500 outline-none text-sm font-mono tracking-widest uppercase"
            />
            <button onClick={() => handleJoin()}
              className="bg-white/5 hover:bg-white/10 border border-white/10 text-white px-5 py-2.5 rounded-sm text-sm font-semibold transition-colors whitespace-nowrap">
              Beitreten
            </button>
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
        </div>

        <div className="space-y-3">
          <h2 className="text-white font-bold">Modus wählen</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {MODES.map(m => {
              const Icon = m.icon;
              return (
                <button key={m.id} disabled={!m.available}
                  onClick={() => m.available && setSelectedMode(m.id)}
                  className={`text-left p-5 rounded-sm border transition-all
                    ${selectedMode === m.id && m.available ? 'border-cyan-500/50 bg-cyan-500/5 ring-1 ring-cyan-500/20' : 'border-white/5 bg-[#0f0f13]'}
                    ${m.available ? 'hover:border-white/20 cursor-pointer' : 'opacity-40 cursor-not-allowed'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <Icon size={20} className={selectedMode === m.id && m.available ? 'text-cyan-400' : 'text-gray-500'} />
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-sm ${m.available ? 'bg-green-500/15 text-green-400' : 'bg-white/5 text-gray-600'}`}>
                      {m.available ? 'Verfügbar' : 'Coming soon'}
                    </span>
                  </div>
                  <div className="text-white font-bold text-sm mb-1">{m.name}</div>
                  <div className="text-gray-500 text-xs leading-relaxed">{m.desc}</div>
                </button>
              );
            })}
          </div>
        </div>

        <button onClick={handleCreate}
          className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-black py-3.5 rounded-sm transition-colors flex items-center justify-center gap-2">
          <Sword size={16} />
          Lobby erstellen
        </button>
      </div>
    </div>
  );

  // ── Lobby ─────────────────────────────────────────────────────────────────
  if (phase === 'lobby') {
    const realPlayers = (lobbyData?.players || []).filter(p => !p.isAdmin);
    const activePlayers = realPlayers.filter(p => !p.isSpectator);
    const canStart = canControlLobby && activePlayers.length >= 2;
    const currentTimer = lobbyData?.timerSeconds || 60;
    const currentStartElixir = lobbyData?.startElixir ?? 100;
    const currentShowElixir = lobbyData?.showElixir ?? false;
    const currentMotherWitch = lobbyData?.motherWitchEnabled ?? false;
    const currentGridSize = lobbyData?.gridSize || 11;

    return (
      <div className="h-full overflow-y-auto custom-scrollbar">
        <SEO title="Lobby · Clash Royale" description="Warte auf Mitspieler" path="/clash-royale" />

        {/* History Modal */}
        {historyOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setHistoryOpen(false)}>
            <div className="bg-[#16161a] border border-white/10 rounded-sm w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 shrink-0">
                <span className="text-white font-bold flex items-center gap-2"><Trophy size={15} className="text-amber-400" /> Spielverlauf dieser Sitzung</span>
                <button onClick={() => setHistoryOpen(false)} className="text-gray-500 hover:text-white p-1">✕</button>
              </div>
              <div className="overflow-y-auto custom-scrollbar p-5 space-y-8">
                {historyData.length === 0 ? (
                  <p className="text-gray-500 text-sm text-center py-8">Noch kein abgeschlossenes Spiel in dieser Sitzung.</p>
                ) : historyData.map((game, gi) => (
                  <div key={gi}>
                    <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-3">Spiel {game.gameNum} · {game.mode === 'auction' ? 'Elixir Auction' : game.mode === 'bingo' ? 'Bingo Royale' : 'Snake Royale'}</p>
                    <div className={`grid gap-4 ${game.players.filter(p=>!p.isSpectator).length <= 2 ? 'grid-cols-2' : game.players.filter(p=>!p.isSpectator).length <= 3 ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-4'}`}>
                      {game.players.filter(p => !p.isSpectator).map((p, pi) => (
                        <div key={pi} className="bg-[#0f0f13] border border-white/5 rounded-sm p-3 space-y-2">
                          <div className="flex items-center gap-2">
                            <PlayerAvatar avatarId={p.avatar} size={28} />
                            <span className="text-white font-semibold text-xs truncate flex-1">{p.name}</span>
                          </div>
                          <div className="grid grid-cols-4 gap-1">
                            {p.deck.map((card, ci) => (
                              <div key={ci} title={card.name} className="aspect-square rounded-[2px] overflow-hidden">
                                <img src={`${CARD_CDN}${card.id}.png`} alt={card.name} className="w-full h-full object-cover" onError={e => { e.target.style.display='none'; }} />
                              </div>
                            ))}
                          </div>
                          <p className="text-gray-600 text-[9px]">{p.deck.length}/8 Karten</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">

          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">
                {MODES.find(m => m.id === lobbyData?.mode)?.name || 'Lobby'}
              </p>
              <h1 className="text-2xl font-black text-white">Warte auf Spieler…</h1>
            </div>
            <div className="flex items-center gap-2">
              {(lobbyData?.historyCount > 0) && (
                <button onClick={handleOpenHistory} title="Spielverlauf"
                  className="p-2 border border-white/10 rounded-sm hover:border-amber-500/40 hover:text-amber-400 transition-colors text-gray-500 flex items-center gap-1.5 text-xs font-semibold px-3">
                  <Trophy size={13} /> Verlauf
                </button>
              )}
              <button onClick={handleLeave}
                className="p-2 border border-white/10 rounded-sm hover:border-white/30 transition-colors text-gray-500 hover:text-white">
                <LogOut size={16} />
              </button>
            </div>
          </div>

          {/* Lobby code card */}
          <div className="bg-[#0f0f13] border border-white/5 rounded-sm p-5 space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-gray-500 text-xs w-10 shrink-0">Code</span>
              <span className={`flex-1 text-3xl font-black text-white tracking-[0.25em] font-mono transition-all ${codeHidden ? 'blur-md select-none pointer-events-none' : 'select-all'}`}>
                {lobbyData?.code || '------'}
              </span>
              <button onClick={() => copyText(lobbyData?.code, 'code')} title="Kopieren"
                className="p-2 border border-white/10 rounded-sm hover:border-white/30 transition-colors text-gray-500 hover:text-white shrink-0">
                {copied === 'code' ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
              </button>
              <button onClick={() => setCodeHidden(v => !v)}
                className="p-2 border border-white/10 rounded-sm hover:border-white/30 transition-colors text-gray-500 hover:text-white shrink-0">
                {codeHidden ? <Eye size={14} /> : <EyeOff size={14} />}
              </button>
            </div>
            <div className="h-px bg-white/5" />
            <div className="flex items-center gap-3">
              <span className="text-gray-500 text-xs w-10 shrink-0">Link</span>
              <div className={`flex-1 bg-[#1a1a20] border border-white/5 rounded-sm px-3 py-2 text-gray-500 text-xs font-mono truncate transition-all ${linkHidden ? 'blur-sm select-none pointer-events-none' : ''}`}>
                {lobbyLink}
              </div>
              <button onClick={() => copyText(lobbyLink, 'link')} title="Kopieren"
                className="p-2 border border-white/10 rounded-sm hover:border-white/30 transition-colors text-gray-500 hover:text-white shrink-0">
                {copied === 'link' ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
              </button>
              <button onClick={() => setLinkHidden(v => !v)}
                className="p-2 border border-white/10 rounded-sm hover:border-white/30 transition-colors text-gray-500 hover:text-white shrink-0">
                {linkHidden ? <Eye size={14} /> : <EyeOff size={14} />}
              </button>
            </div>
          </div>

          {/* Player list */}
          <div className="bg-[#0f0f13] border border-white/5 rounded-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <span className="text-white font-semibold text-sm flex items-center gap-2">
                <Users size={14} className="text-gray-500" />
                {activePlayers.length} Spieler · {realPlayers.length - activePlayers.length} Zuschauer
              </span>
            </div>
            <div className="space-y-1.5">
              {lobbyData?.players?.map(p => (
                <div key={p.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-sm ${p.isAdmin ? 'bg-cyan-500/5 border border-cyan-500/20' : p.isSpectator ? 'bg-[#1a1a20]/50' : 'bg-[#1a1a20]'}`}>
                  <PlayerAvatar avatarId={p.avatar} size={36} isAdmin={p.isAdmin} />
                  <span className={`font-semibold flex-1 truncate text-sm ${p.isAdmin ? 'text-cyan-300' : p.isSpectator ? 'text-gray-500' : 'text-white'}`}>{p.name}</span>
                  {p.isAdmin && <span className="text-[9px] text-cyan-300 border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 rounded-sm shrink-0">Admin</span>}
                  {!p.isAdmin && p.isSpectator && <span className="text-[9px] text-gray-600 border border-white/10 px-1.5 py-0.5 rounded-sm shrink-0">Zuschauer</span>}
                  {p.id === lobbyData?.host && <Crown size={11} className="text-amber-400 shrink-0" />}
                  {p.id === mySocketId && !p.isAdmin && (
                    <button onClick={handleToggleSpectator}
                      className={`text-[9px] px-2 py-1 rounded-sm border transition-colors shrink-0 ${p.isSpectator ? 'border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/10' : 'border-white/10 text-gray-500 hover:text-white hover:border-white/30'}`}>
                      {p.isSpectator ? 'Mitspielen' : 'Zuschauen'}
                    </button>
                  )}
                  {canControlLobby && p.id !== mySocketId && !p.isAdmin && (
                    <>
                      <button onClick={() => handleSetPlayerSpectator(p.id, !p.isSpectator)}
                        title={p.isSpectator ? 'Wieder aktivieren' : 'Als Zuschauer setzen'}
                        className={`text-[9px] px-2 py-1 rounded-sm border transition-colors shrink-0 ${p.isSpectator ? 'border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/10' : 'border-white/10 text-gray-500 hover:text-white hover:border-white/30'}`}>
                        {p.isSpectator ? 'Reaktivieren' : 'Zuschauer'}
                      </button>
                      {p.id !== lobbyData?.host && (
                        <button onClick={() => handleTransferHost(p.id)} title="Host-Status übergeben"
                          className="text-gray-700 hover:text-amber-400 transition-colors p-0.5 shrink-0">
                          <ArrowLeftRight size={12} />
                        </button>
                      )}
                    </>
                  )}
                  {canControlLobby && p.id !== lobbyData?.host && !p.isAdmin && (
                    <button onClick={() => handleKick(p.id)} title="Kicken"
                      className="text-gray-700 hover:text-red-400 transition-colors p-0.5 shrink-0">
                      <UserX size={12} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Host controls */}
          {canControlLobby && (
            <div className="bg-[#0f0f13] border border-white/5 rounded-sm p-5 space-y-5">
              {isClashAdmin && !effectiveIsHost && (
                <p className="text-cyan-400 text-xs flex items-center gap-1.5">
                  <Shield size={12} /> Admin-Zugriff — du steuerst diese Lobby, ohne Host zu sein.
                </p>
              )}
              {/* Timer */}
              <div>
                <p className="text-white text-sm font-semibold flex items-center gap-2 mb-3">
                  <Clock size={13} className="text-gray-500" />
                  {lobbyData?.mode === 'auction' ? 'Zeit pro Runde' : lobbyData?.mode === 'bingo' ? 'Zeit pro Pick' : 'Zeit pro Pick'}
                </p>
                <div className="flex gap-2 flex-wrap items-center">
                  {TIMER_OPTIONS.map(s => (
                    <button key={s} onClick={() => handleSetTimer(s)}
                      className={`px-3 py-1.5 rounded-sm text-sm font-semibold transition-colors border ${currentTimer === s ? 'bg-cyan-500 text-black border-cyan-500' : 'bg-[#1a1a20] text-gray-400 border-white/5 hover:border-white/20 hover:text-white'}`}>
                      {s}s
                    </button>
                  ))}
                  <div className="flex items-center gap-1">
                    <input type="number" min={5} max={300} placeholder="Custom"
                      className="w-16 bg-[#1a1a20] border border-white/10 rounded-sm px-1 py-1.5 text-white text-sm text-center focus:border-cyan-500 outline-none tabular-nums placeholder-gray-600"
                      onKeyDown={e => e.key === 'Enter' && e.target.value && handleSetTimer(Math.max(5, Math.min(300, Number(e.target.value))))}
                      onBlur={e => e.target.value && handleSetTimer(Math.max(5, Math.min(300, Number(e.target.value))))} />
                    <span className="text-gray-600 text-xs">s</span>
                  </div>
                </div>
              </div>

              {lobbyData?.mode === 'snake' && (
                <div>
                  <p className="text-white text-sm font-semibold flex items-center gap-2 mb-3">
                    <Worm size={13} className="text-cyan-400" />
                    Rastergröße
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    {[7, 8, 9, 10, 11].map(s => (
                      <button key={s} onClick={() => handleSetGridSize(s)}
                        className={`px-3 py-1.5 rounded-sm text-sm font-semibold transition-colors border ${currentGridSize === s ? 'bg-cyan-500 text-black border-cyan-500' : 'bg-[#1a1a20] text-gray-400 border-white/5 hover:border-white/20 hover:text-white'}`}>
                        {s}×{s}
                        {s === 11 && <span className="text-[9px] ml-1 opacity-60">alle</span>}
                      </button>
                    ))}
                  </div>
                  <p className="text-gray-600 text-xs mt-2">
                    {currentGridSize === 11 ? 'Alle 121 Karten · kein Zufall' : `${currentGridSize * currentGridSize} zufällige Karten aus dem Pool`}
                  </p>
                </div>
              )}

              {lobbyData?.mode === 'bingo' && (
                <div>
                  <p className="text-white text-sm font-semibold flex items-center gap-2 mb-3">
                    <Hash size={13} className="text-amber-400" />
                    Karten pro Runde (min. {activePlayers.length || 2})
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    {[2,3,4,5,6,7,8,9,10].filter(n => n >= (activePlayers.length || 2)).map(n => (
                      <button key={n} onClick={() => handleSetCardsPerRound(n)}
                        className={`px-3 py-1.5 rounded-sm text-sm font-semibold transition-colors border ${(lobbyData?.cardsPerRound || activePlayers.length || 2) === n ? 'bg-amber-400 text-black border-amber-400' : 'bg-[#1a1a20] text-gray-400 border-white/5 hover:border-white/20 hover:text-white'}`}>
                        {n}
                      </button>
                    ))}
                  </div>
                  <p className="text-gray-600 text-xs mt-2">Karten die pro Runde zur Auswahl stehen (mindestens 1 pro Spieler)</p>
                </div>
              )}

              {lobbyData?.mode === 'auction' && (<>
                {/* Karten pro Runde */}
                <div>
                  <p className="text-white text-sm font-semibold flex items-center gap-2 mb-3">
                    <Droplets size={13} className="text-purple-400" />
                    Karten pro Runde (min. {activePlayers.length || 2})
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    {[2,3,4,5,6,7,8].filter(n => n >= (activePlayers.length || 2)).map(n => (
                      <button key={n} onClick={() => handleSetCardsPerRound(n)}
                        className={`px-3 py-1.5 rounded-sm text-sm font-semibold transition-colors border ${(lobbyData?.cardsPerRound || activePlayers.length || 2) === n ? 'bg-purple-500 text-white border-purple-500' : 'bg-[#1a1a20] text-gray-400 border-white/5 hover:border-white/20 hover:text-white'}`}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Start-Elixir */}
                <div>
                  <p className="text-white text-sm font-semibold flex items-center gap-2 mb-3">
                    <Droplets size={13} className="text-cyan-400" />
                    Start-Elixier
                  </p>
                  <div className="flex gap-2 flex-wrap items-center">
                    {[50, 100, 150, 200].map(v => (
                      <button key={v} onClick={() => handleSetStartElixir(v)}
                        className={`px-3 py-1.5 rounded-sm text-sm font-semibold transition-colors border ${currentStartElixir === v ? 'bg-cyan-500 text-black border-cyan-500' : 'bg-[#1a1a20] text-gray-400 border-white/5 hover:border-white/20 hover:text-white'}`}>
                        {v}
                      </button>
                    ))}
                    <div className="flex items-center gap-1">
                      <input type="number" min={10} max={500} placeholder="Custom"
                        className="w-16 bg-[#1a1a20] border border-white/10 rounded-sm px-1 py-1.5 text-white text-sm text-center focus:border-cyan-500 outline-none tabular-nums placeholder-gray-600"
                        onKeyDown={e => e.key === 'Enter' && e.target.value && handleSetStartElixir(Number(e.target.value))}
                        onBlur={e => e.target.value && handleSetStartElixir(Number(e.target.value))} />
                    </div>
                  </div>
                </div>

                {/* Elixier anderer anzeigen */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white text-sm font-semibold">Elixier anderer Spieler anzeigen</p>
                    <p className="text-gray-600 text-xs mt-0.5">Alle sehen das Elixier aller Mitspieler in der Seitenleiste</p>
                  </div>
                  <button onClick={() => handleSetShowElixir(!currentShowElixir)}
                    className={`relative w-11 h-6 rounded-full transition-colors duration-200 shrink-0 ${currentShowElixir ? 'bg-cyan-500' : 'bg-[#2a2a32]'}`}>
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${currentShowElixir ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>

                {/* Mutterhexen Besuche */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white text-sm font-semibold">Mutterhexen Besuche</p>
                    <p className="text-gray-600 text-xs mt-0.5">In Runde 2-7: 30% Chance, dass ein zufälliger Spieler von der Mutterhexe eine Fähigkeit angeboten bekommt</p>
                  </div>
                  <button onClick={() => handleSetMotherWitch(!currentMotherWitch)}
                    className={`relative w-11 h-6 rounded-full transition-colors duration-200 shrink-0 ${currentMotherWitch ? 'bg-cyan-500' : 'bg-[#2a2a32]'}`}>
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${currentMotherWitch ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>
              </>)}

              <button onClick={handleStart} disabled={!canStart}
                className="w-full bg-cyan-500 disabled:bg-white/5 disabled:text-gray-600 hover:bg-cyan-400 text-black font-black py-3 rounded-sm transition-colors flex items-center justify-center gap-2 disabled:cursor-not-allowed">
                <Play size={15} />
                {canStart ? 'Spiel starten' : `Mind. 2 aktive Spieler benötigt`}
              </button>
            </div>
          )}

          {!canControlLobby && (
            <p className="text-gray-600 text-sm text-center">Warte auf den Host…</p>
          )}
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
        </div>
      </div>
    );
  }

  // ── Game ──────────────────────────────────────────────────────────────────
  if (phase === 'game') return (
    <div className="h-full flex flex-col overflow-hidden">
      <SEO title={lobbyData?.mode === 'auction' ? 'Elixir Auction' : lobbyData?.mode === 'bingo' ? 'Bingo Royale' : 'Snake Royale'} description="Wähle dein Deck!" path="/clash-royale" />
      <div className="shrink-0 h-11 bg-[#16161a] border-b border-white/5 flex items-center px-4 gap-3">
        {lobbyData?.mode === 'auction'
          ? <Droplets size={15} className="text-purple-400 shrink-0" />
          : lobbyData?.mode === 'bingo'
            ? <Hash size={15} className="text-amber-400 shrink-0" />
            : <Worm size={15} className="text-cyan-400 shrink-0" />}
        <span className="text-white font-bold text-sm">
          {lobbyData?.mode === 'auction' ? 'Elixir Auction' : lobbyData?.mode === 'bingo' ? 'Bingo Royale' : 'Snake Royale'}
        </span>
        <div className="flex-1" />
        {error && <span className="text-red-400 text-xs animate-pulse">{error}</span>}
        {isClashAdmin && (
          <button onClick={() => setShowAdminPanel(v => !v)} title="Admin-Steuerung"
            className={`p-1.5 rounded-sm border transition-colors ${showAdminPanel ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300' : 'border-white/10 text-gray-500 hover:text-cyan-300 hover:border-cyan-500/30'}`}>
            <Shield size={14} />
          </button>
        )}
        {canControlLobby && !gameOver && (
          <button onClick={handleCancelGame} title="Spiel abbrechen"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors text-xs font-semibold">
            <XCircle size={13} /> Abbrechen
          </button>
        )}
        <button onClick={handleLeave}
          className="text-gray-600 hover:text-white transition-colors p-1">
          <LogOut size={15} />
        </button>
      </div>
      {showAdminPanel && isClashAdmin && (
        <AdminControlPanel
          players={(lobbyData?.players || []).filter(p => !p.isAdmin)}
          hostId={lobbyData?.host}
          onTransferHost={handleTransferHost}
          onSetSpectator={handleSetPlayerSpectator}
          onClose={() => setShowAdminPanel(false)}
        />
      )}
      <div className="flex-1 overflow-hidden">
        {gameOver ? (
          <GameOverScreen gameOver={gameOver} myId={myId || socketRef.current?.id} isHost={canControlLobby} onLeave={handleLeave} onRestart={handleRestart} />
        ) : lobbyData?.mode === 'auction' ? (
          <ElixirAuction
            auctionState={auctionState}
            revealState={auctionReveal}
            myPlayerId={myId || socketRef.current?.id}
            myBid={myBid}
            onBid={handleAuctionBid}
            showElixirProp={lobbyData?.showElixir}
            motherWitchVisit={motherWitchVisit}
            onMotherWitchRespond={handleMotherWitchRespond}
          />
        ) : lobbyData?.mode === 'bingo' ? (
          <BingoRoyale
            bingoState={bingoState}
            myPlayerId={myId || socketRef.current?.id}
            onPick={handleBingoPick}
            onPowerup={handleBingoPowerup}
            players={lobbyData?.players || []}
          />
        ) : gameState ? (
          <SnakeRoyale
            gameState={gameState}
            players={lobbyData?.players || []}
            myPlayerId={socketRef.current?.id || myId}
            onPickCard={handlePickCard}
          />
        ) : (
          <div className="h-full flex items-center justify-center">
            <p className="text-gray-500 text-sm">Lade Spiel…</p>
          </div>
        )}
      </div>
    </div>
  );

  return null;
}

// ── Admin-Steuerung (während einer laufenden Runde) ─────────────────────────
function AdminControlPanel({ players, hostId, onTransferHost, onSetSpectator, onClose }) {
  return (
    <div className="shrink-0 bg-[#0f0f13] border-b border-cyan-500/20 px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-cyan-300 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
          <Shield size={12} /> Admin-Steuerung
        </span>
        <button onClick={onClose} className="text-gray-500 hover:text-white p-1"><X size={14} /></button>
      </div>
      <div className="flex flex-wrap gap-2">
        {players.map(p => (
          <div key={p.id} className="flex items-center gap-2 bg-[#1a1a20] border border-white/5 rounded-sm px-2.5 py-1.5">
            <PlayerAvatar avatarId={p.avatar} size={20} />
            <span className="text-white text-xs font-semibold max-w-[100px] truncate">{p.name}</span>
            {p.id === hostId && <Crown size={10} className="text-amber-400 shrink-0" />}
            {p.isSpectator && <span className="text-[8px] text-gray-500 border border-white/10 px-1 rounded-sm shrink-0">Zuschauer</span>}
            <button onClick={() => onSetSpectator(p.id, !p.isSpectator)}
              title={p.isSpectator ? 'Wieder aktivieren' : 'Als Zuschauer setzen'}
              className={`text-[9px] px-1.5 py-0.5 rounded-sm border transition-colors shrink-0 ${p.isSpectator ? 'border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/10' : 'border-white/10 text-gray-500 hover:text-white hover:border-white/30'}`}>
              {p.isSpectator ? 'Reaktivieren' : 'Zuschauer'}
            </button>
            {p.id !== hostId && (
              <button onClick={() => onTransferHost(p.id)} title="Host-Status übergeben"
                className="text-gray-500 hover:text-amber-400 transition-colors p-0.5 shrink-0">
                <ArrowLeftRight size={11} />
              </button>
            )}
          </div>
        ))}
        {players.length === 0 && <p className="text-gray-600 text-xs italic">Keine Spieler in dieser Sitzung.</p>}
      </div>
    </div>
  );
}

// ── Game Over ─────────────────────────────────────────────────────────────
const SIZE_COLS = { s: 'grid-cols-4', m: 'grid-cols-3', l: 'grid-cols-2' };

function GameOverScreen({ gameOver, myId, isHost, onLeave, onRestart }) {
  const [size, setSize] = React.useState('m');
  const [layout, setLayout] = React.useState('grid'); // 'grid' | 'list'

  const activePlayers = (gameOver.players || []).filter(p => !p.isSpectator);

  return (
    <div className="h-full overflow-y-auto custom-scrollbar p-6">
      <div className="max-w-6xl mx-auto space-y-5">

        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Trophy size={20} className="text-amber-400" />
            <div>
              <h2 className="text-lg font-black text-white">Drafting abgeschlossen</h2>
              <p className="text-gray-500 text-xs">Alle Decks wurden zusammengestellt</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Layout toggle */}
            <div className="flex items-center gap-0.5 border border-white/10 rounded-sm p-0.5">
              <button onClick={() => setLayout('grid')} title="Nebeneinander"
                className={`p-1.5 rounded-[2px] transition-colors ${layout === 'grid' ? 'bg-white/15 text-white' : 'text-gray-600 hover:text-gray-400'}`}>
                <LayoutGrid size={13} />
              </button>
              <button onClick={() => setLayout('list')} title="Untereinander"
                className={`p-1.5 rounded-[2px] transition-colors ${layout === 'list' ? 'bg-white/15 text-white' : 'text-gray-600 hover:text-gray-400'}`}>
                <Rows size={13} />
              </button>
            </div>
            {/* Size toggle — nur im Grid-Modus sinnvoll */}
            {layout === 'grid' && (
              <div className="flex items-center gap-1 border border-white/10 rounded-sm p-0.5">
                {Object.keys(SIZE_COLS).map(k => (
                  <button key={k} onClick={() => setSize(k)}
                    className={`w-7 h-6 text-xs font-bold rounded-[2px] transition-colors ${
                      size === k ? 'bg-white/15 text-white' : 'text-gray-600 hover:text-gray-400'
                    }`}>
                    {k.toUpperCase()}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              {isHost ? (
                <>
                  <button onClick={onRestart}
                    className="bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold px-5 py-2 rounded-sm transition-colors text-sm">
                    Erneut spielen
                  </button>
                  <button onClick={onLeave}
                    className="bg-cyan-500 hover:bg-cyan-400 text-black font-bold px-5 py-2 rounded-sm transition-colors text-sm">
                    Zur Übersicht
                  </button>
                </>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="text-gray-500 text-sm">Warte auf den Host…</span>
                  <button onClick={onLeave}
                    className="bg-white/5 hover:bg-white/10 border border-white/10 text-gray-400 hover:text-white font-bold px-5 py-2 rounded-sm transition-colors text-sm">
                    Trotzdem beenden
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {layout === 'grid' ? (
          <div className={`grid ${SIZE_COLS[size]} gap-4`}>
            {activePlayers.map((p, i) => (
              <div key={p.id || i} className="bg-[#0f0f13] border border-white/5 rounded-sm p-4 space-y-3">
                <div className="flex items-center gap-2.5">
                  <PlayerAvatar avatarId={p.avatar} size={36} />
                  <span className="text-white font-bold text-sm truncate flex-1">{p.name}</span>
                  {p.id === myId && <span className="text-[10px] text-cyan-400 font-semibold shrink-0">Du</span>}
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {p.deck.map((card, ci) => (
                    <div key={ci} title={card.name} className="aspect-square rounded-sm overflow-hidden">
                      <img src={`https://cdn.royaleapi.com/static/img/cards-150/${card.id}.png`} alt={card.name}
                        className="w-full h-full object-cover" onError={e => { e.target.style.display = 'none'; }} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {activePlayers.map((p, i) => (
              <div key={p.id || i} className="bg-[#0f0f13] border border-white/5 rounded-sm p-4">
                <div className="flex items-center gap-2.5 mb-3">
                  <PlayerAvatar avatarId={p.avatar} size={32} />
                  <span className="text-white font-bold text-sm truncate flex-1">{p.name}</span>
                  {p.id === myId && <span className="text-[10px] text-cyan-400 font-semibold shrink-0">Du</span>}
                  <span className="text-gray-600 text-xs shrink-0">{p.deck.length}/8</span>
                </div>
                <div className="grid grid-cols-8 gap-1.5">
                  {p.deck.map((card, ci) => (
                    <div key={ci} title={card.name} className="aspect-square rounded-sm overflow-hidden">
                      <img src={`https://cdn.royaleapi.com/static/img/cards-150/${card.id}.png`} alt={card.name}
                        className="w-full h-full object-cover" onError={e => { e.target.style.display = 'none'; }} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
