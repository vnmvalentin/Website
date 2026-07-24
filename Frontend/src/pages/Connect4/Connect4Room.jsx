// Connect4Room.jsx — Spielraum: Beitritts-Flow über den Link-Code, danach das eigentliche
// 7x6-Feld. Ein Socket pro Seitenbesuch (analog zur Clash-Royale-Lobby), Reconnect via
// localStorage (gleicher Code + Name), Server ist die einzige Quelle der Wahrheit.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { io } from "socket.io-client";
import { Disc, Copy, Check, LogOut, RotateCcw, Loader2, Users } from "lucide-react";
import SEO from "../../components/SEO";

const ROWS = 6;
const COLS = 7;

const SLOT_COLOR = {
  1: { hex: "#ef4444", label: "Rot" },
  2: { hex: "#8b5cf6", label: "Violett" },
};

function otherSlot(slot) {
  return slot === 1 ? 2 : 1;
}

export default function Connect4Room() {
  const { code: rawCode } = useParams();
  const code = String(rawCode || "").toUpperCase();
  const navigate = useNavigate();

  const socketRef = useRef(null);
  const nameUsedRef = useRef("");

  const [connStatus, setConnStatus] = useState("connecting"); // connecting | connected | reconnecting
  const [phase, setPhase] = useState("loading"); // loading | name-entry | joining | in-game | not-found
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem("connect4_last_name") || "";
    } catch {
      return "";
    }
  });
  const [error, setError] = useState("");
  const [game, setGame] = useState(null);
  const [mySlot, setMySlot] = useState(null);
  const [isSpectator, setIsSpectator] = useState(false);
  const [hoverCol, setHoverCol] = useState(null);
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState(null);

  const handleJoinAck = useCallback((res) => {
    if (!res?.ok) {
      try { localStorage.removeItem("connect4_session"); } catch { /* ignore */ }
      if (res?.error === "Spiel nicht gefunden.") {
        setPhase("not-found");
      } else {
        setError(res?.error || "Beitritt fehlgeschlagen.");
        setPhase("name-entry");
      }
      return;
    }
    setMySlot(res.slot ?? null);
    setIsSpectator(!!res.spectator);
    setError("");
    try {
      localStorage.setItem("connect4_last_name", nameUsedRef.current);
      localStorage.setItem("connect4_session", JSON.stringify({ code, name: nameUsedRef.current }));
    } catch { /* ignore */ }
    setPhase("in-game");
  }, [code]);

  useEffect(() => {
    const socket = io("/", {
      path: "/socket.io",
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnStatus("connected");
      let saved = null;
      try { saved = JSON.parse(localStorage.getItem("connect4_session") || "null"); } catch { /* ignore */ }
      if (saved?.code === code && saved?.name) {
        nameUsedRef.current = saved.name;
        setName(saved.name);
        setPhase((p) => (p === "in-game" ? p : "joining"));
        socket.emit("c4:join", { code, name: saved.name }, handleJoinAck);
      } else {
        setPhase((p) => (p === "in-game" ? p : "name-entry"));
      }
    });

    socket.on("disconnect", () => setConnStatus("reconnecting"));
    socket.on("c4:state", (state) => setGame(state));
    socket.on("c4:opponentLeft", () => setToast("Dein Gegner hat das Spiel verlassen."));

    return () => socket.disconnect();
  }, [code, handleJoinAck]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const submitName = (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Bitte gib einen Namen ein.");
      return;
    }
    setError("");
    nameUsedRef.current = trimmed;
    setPhase("joining");
    socketRef.current?.emit("c4:join", { code, name: trimmed }, handleJoinAck);
  };

  const claimSlot = () => {
    const trimmed = nameUsedRef.current || name.trim();
    if (!trimmed) return;
    socketRef.current?.emit("c4:join", { code, name: trimmed }, handleJoinAck);
  };

  const leaveGame = () => {
    socketRef.current?.emit("c4:leave");
    socketRef.current?.disconnect();
    try { localStorage.removeItem("connect4_session"); } catch { /* ignore */ }
    navigate("/connect4");
  };

  const requestRematch = () => socketRef.current?.emit("c4:rematch");

  const copyLink = async () => {
    const url = `${window.location.origin}/connect4/${code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* ignore */ }
  };

  const handleDrop = (col) => {
    if (!canPlay || columnFull[col]) return;
    socketRef.current?.emit("c4:move", { col });
  };

  const board = game?.board || Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  const winKeys = new Set((game?.winningCells || []).map(([r, c]) => `${r},${c}`));
  const columnFull = Array.from({ length: COLS }, (_, c) => board[0][c] !== 0);
  const canPlay = phase === "in-game" && game?.status === "playing" && mySlot != null && game.turn === mySlot;

  // ---------- Zwischenzustände (noch nicht im Spiel) ----------
  if (phase === "loading" || phase === "joining") {
    return (
      <div className="page-fade w-full max-w-md mx-auto px-2 md:px-4 py-20 text-center">
        <SEO title="Connect 4" description="Tritt einer Connect-4-Partie bei." path={`/connect4/${code}`} />
        <Loader2 size={24} className="animate-spin text-violet-300 mx-auto mb-3" />
        <p className="text-white/50 text-sm">{phase === "joining" ? "Trete bei…" : "Verbinde…"}</p>
      </div>
    );
  }

  if (phase === "not-found") {
    return (
      <div className="page-fade w-full max-w-md mx-auto px-2 md:px-4 py-16">
        <SEO title="Connect 4" description="Diese Connect-4-Partie wurde nicht gefunden." path={`/connect4/${code}`} />
        <div className="panel p-6 text-center">
          <h1 className="font-display text-xl font-bold text-white mb-2">Spiel nicht gefunden</h1>
          <p className="text-sm text-white/50 mb-5">
            Dieser Link ist abgelaufen oder die Partie wurde beendet.
          </p>
          <button
            type="button"
            onClick={() => navigate("/connect4")}
            className="bg-violet-600 hover:bg-violet-500 text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors"
          >
            Neues Spiel erstellen
          </button>
        </div>
      </div>
    );
  }

  if (phase === "name-entry") {
    return (
      <div className="page-fade w-full max-w-md mx-auto px-2 md:px-4 py-16">
        <SEO title="Connect 4 · Einladung" description="Tritt einer Connect-4-Partie bei." path={`/connect4/${code}`} />
        <div className="panel p-6 text-center">
          <span className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-violet-500/10 border border-violet-400/20 text-violet-300 mb-4">
            <Disc size={26} />
          </span>
          <h1 className="font-display text-xl font-bold text-white mb-1">Connect-4-Einladung</h1>
          <p className="text-xs uppercase tracking-widest text-white/30 mb-5">Code: {code}</p>
          <form onSubmit={submitName} className="space-y-3">
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={24}
              placeholder="Dein Name"
              className="w-full bg-black/40 border border-white/10 rounded-lg px-3.5 py-2.5 text-white placeholder:text-white/25 focus:border-violet-500 focus:outline-none transition-colors text-sm text-center"
            />
            {error && <p className="text-sm text-red-300">{error}</p>}
            <button
              type="submit"
              className="w-full bg-violet-600 hover:bg-violet-500 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
            >
              Beitreten
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ---------- Spiel ----------
  const winnerName = game?.winner && game.winner !== 3 ? game.players?.[game.winner]?.name : null;

  let turnText = "";
  if (game?.status === "waiting") turnText = "Warte auf einen zweiten Spieler…";
  else if (game?.status === "playing") {
    const activeName = game.players?.[game.turn]?.name || "?";
    turnText = mySlot === game.turn ? "Du bist am Zug" : `${activeName} ist am Zug`;
  }

  return (
    <div className="page-fade w-full max-w-2xl mx-auto px-2 md:px-4 py-8 md:py-12">
      <SEO title={`Connect 4 · ${code}`} description="Live-Partie Vier Gewinnt." path={`/connect4/${code}`} />

      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 panel-strong px-4 py-2.5 text-sm text-white/85 shadow-2xl shadow-black/60">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <span className="hidden sm:flex items-center justify-center w-11 h-11 rounded-xl bg-violet-500/10 border border-violet-400/20 text-violet-300">
            <Disc size={20} />
          </span>
          <div>
            <h1 className="font-display text-xl font-bold text-white">Connect 4</h1>
            <p className="text-[11px] text-white/40 tracking-widest uppercase">
              Code: {code}
              {game?.spectatorCount > 0 && (
                <span className="ml-2 inline-flex items-center gap-1 normal-case tracking-normal text-white/30">
                  <Users size={11} /> {game.spectatorCount}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={copyLink}
            className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 hover:text-white text-sm font-semibold px-3.5 py-2 rounded-lg transition-colors"
          >
            {copied ? <Check size={15} className="text-emerald-400" /> : <Copy size={15} />}
            {copied ? "Kopiert" : "Link kopieren"}
          </button>
          <button
            type="button"
            onClick={leaveGame}
            className="flex items-center gap-2 bg-white/5 hover:bg-red-500/15 border border-white/10 hover:border-red-500/30 text-white/60 hover:text-red-300 text-sm font-semibold px-3.5 py-2 rounded-lg transition-colors"
          >
            <LogOut size={15} />
            Verlassen
          </button>
        </div>
      </div>

      {connStatus === "reconnecting" && (
        <div className="mb-4 text-center text-xs text-amber-300/90 bg-amber-500/10 border border-amber-400/20 rounded-lg py-2">
          Verbindung wird wiederhergestellt…
        </div>
      )}

      {/* Spieler-Karten */}
      <div className="grid grid-cols-2 gap-3 max-w-md mx-auto mb-5">
        {[1, 2].map((slot) => {
          const p = game?.players?.[slot];
          const isTurn = game?.status === "playing" && game.turn === slot;
          const isMe = mySlot === slot;
          return (
            <div
              key={slot}
              className={`panel p-3 sm:p-4 flex items-center gap-3 transition-colors ${
                isTurn ? "border-white/25" : ""
              }`}
            >
              <span
                className="w-4 h-4 rounded-full shrink-0 border border-black/20"
                style={{ background: SLOT_COLOR[slot].hex }}
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-white truncate">
                  {p ? p.name : "Wartet…"}
                  {isMe && <span className="text-white/40 font-normal"> (Du)</span>}
                </div>
                <div className="text-[11px] text-white/40">
                  {!p ? "Platz frei" : !p.connected ? "Verbindung getrennt…" : isTurn ? "Am Zug" : "Verbunden"}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {game?.status === "waiting" && (
        <div className="panel p-6 text-center mb-6">
          <Loader2 size={20} className="animate-spin text-violet-300 mx-auto mb-3" />
          <p className="text-white/60 text-sm mb-4">Schick diesen Link an einen Freund, um zu starten:</p>
          <div className="flex items-center gap-2 max-w-md mx-auto">
            <code className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white/80 text-xs sm:text-sm truncate text-left">
              {window.location.origin}/connect4/{code}
            </code>
            <button
              type="button"
              onClick={copyLink}
              className="shrink-0 flex items-center gap-1.5 bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold px-3.5 py-2 rounded-lg transition-colors"
            >
              {copied ? <Check size={15} /> : <Copy size={15} />}
            </button>
          </div>
        </div>
      )}

      {isSpectator && (!game?.players?.[1] || !game?.players?.[2]) && (
        <div className="flex justify-center mb-6">
          <button
            type="button"
            onClick={claimSlot}
            className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
          >
            <Disc size={15} /> Als Spieler mitspielen
          </button>
        </div>
      )}

      {game?.status === "playing" && (
        <p className="text-center text-sm font-semibold text-white/80 mb-4">{turnText}</p>
      )}

      {game?.status === "finished" && (
        <div className="text-center mb-4">
          <p className="font-display text-xl font-bold text-white">
            {game.winner === 3
              ? "Unentschieden!"
              : mySlot === game.winner
              ? "Du hast gewonnen!"
              : `${winnerName || "Jemand"} hat gewonnen!`}
          </p>
        </div>
      )}

      {/* Spielfeld */}
      <div className="flex justify-center">
        <div className="panel-strong p-3 sm:p-5 inline-block">
          <div className="grid grid-cols-7 gap-1.5 sm:gap-2.5 mb-2 h-7 sm:h-9">
            {Array.from({ length: COLS }).map((_, c) => (
              <div key={c} className="flex items-center justify-center">
                {canPlay && hoverCol === c && !columnFull[c] && (
                  <div
                    className="w-5 h-5 sm:w-8 sm:h-8 rounded-full opacity-70"
                    style={{ background: SLOT_COLOR[mySlot].hex }}
                  />
                )}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1.5 sm:gap-2.5 bg-black/30 rounded-xl p-2 sm:p-3 border border-white/10">
            {board.flatMap((rowArr, r) =>
              rowArr.map((val, c) => {
                const isWin = winKeys.has(`${r},${c}`);
                const clickable = canPlay && !columnFull[c];
                return (
                  <button
                    key={`${r}-${c}`}
                    type="button"
                    disabled={!clickable}
                    onMouseEnter={() => setHoverCol(c)}
                    onMouseLeave={() => setHoverCol((h) => (h === c ? null : h))}
                    onClick={() => handleDrop(c)}
                    aria-label={
                      val ? `Spalte ${c + 1}, Reihe ${r + 1}, belegt von ${SLOT_COLOR[val].label}` : `Spalte ${c + 1}, Reihe ${r + 1}, leer`
                    }
                    className={`w-8 h-8 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded-full border transition-colors ${
                      val === 0 ? "bg-black/40 border-white/10" : "border-black/25"
                    } ${clickable ? "cursor-pointer" : "cursor-default"} ${
                      isWin ? "ring-2 ring-white/80" : ""
                    }`}
                    style={val !== 0 ? { background: SLOT_COLOR[val].hex } : undefined}
                  />
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Revanche */}
      {game?.status === "finished" && mySlot != null && (
        <div className="flex flex-col items-center gap-2 mt-6">
          <button
            type="button"
            onClick={requestRematch}
            disabled={!!game.rematch?.[mySlot]}
            className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:bg-violet-600/40 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
          >
            <RotateCcw size={15} />
            {game.rematch?.[mySlot] ? "Warte auf Gegner…" : "Revanche"}
          </button>
          {game.rematch?.[otherSlot(mySlot)] && !game.rematch?.[mySlot] && (
            <p className="text-xs text-violet-300">Dein Gegner möchte eine Revanche!</p>
          )}
        </div>
      )}
    </div>
  );
}
