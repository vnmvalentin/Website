// Connect4Page.jsx — Landing: Namen eingeben, neues Spiel erstellen oder per Code beitreten.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { io } from "socket.io-client";
import { Disc, ArrowRight, Users, Loader2 } from "lucide-react";
import SEO from "../../components/SEO";

export default function Connect4Page() {
  const navigate = useNavigate();
  const socketRef = useRef(null);

  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem("connect4_last_name") || "";
    } catch {
      return "";
    }
  });
  const [joinCode, setJoinCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    return () => socketRef.current?.disconnect();
  }, []);

  const ensureSocket = useCallback(() => {
    if (socketRef.current) return socketRef.current;
    const socket = io("/", { path: "/socket.io", transports: ["websocket", "polling"] });
    socketRef.current = socket;
    return socket;
  }, []);

  const createGame = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Bitte gib zuerst deinen Namen ein.");
      return;
    }
    setError("");
    setCreating(true);
    const socket = ensureSocket();

    const doCreate = () => {
      socket.emit("c4:create", { name: trimmed }, (res) => {
        if (!res?.ok) {
          setCreating(false);
          setError("Spiel konnte nicht erstellt werden. Versuch es nochmal.");
          return;
        }
        try {
          localStorage.setItem("connect4_last_name", trimmed);
          localStorage.setItem("connect4_session", JSON.stringify({ code: res.code, name: trimmed }));
        } catch { /* ignore */ }
        socket.disconnect();
        navigate(`/connect4/${res.code}`);
      });
    };

    if (socket.connected) doCreate();
    else socket.once("connect", doCreate);
  };

  const joinExisting = (e) => {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (!code) {
      setError("Bitte gib einen Spiel-Code ein.");
      return;
    }
    try {
      if (name.trim()) localStorage.setItem("connect4_last_name", name.trim());
    } catch { /* ignore */ }
    navigate(`/connect4/${code}`);
  };

  return (
    <div className="page-fade w-full max-w-2xl mx-auto px-2 md:px-4 py-10 md:py-16">
      <SEO
        title="Connect 4"
        description="Vier Gewinnt gegen einen Freund — Link teilen und direkt loslegen, kein Download nötig."
        path="/connect4"
      />

      <div className="flex items-start gap-4 mb-8 md:mb-10">
        <span className="hidden sm:flex items-center justify-center w-14 h-14 rounded-2xl bg-violet-500/10 border border-violet-400/20 text-violet-300 shrink-0">
          <Disc size={26} />
        </span>
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-violet-300/80 mb-2">1 gegen 1 · Live</p>
          <h1 className="font-display text-3xl md:text-5xl font-bold text-white tracking-tight mb-3">Connect 4</h1>
          <p className="text-white/50 text-sm md:text-base max-w-xl leading-relaxed">
            Vier Gewinnt auf einem 7×6-Feld. Erstelle ein Spiel, schick den Link an einen Freund und setzt
            abwechselnd — wer zuerst vier in einer Reihe hat, gewinnt.
          </p>
        </div>
      </div>

      <div className="panel p-5 md:p-7 space-y-5">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-white/40 mb-2">
            Dein Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={24}
            placeholder="Name eingeben"
            className="w-full bg-black/40 border border-white/10 rounded-lg px-3.5 py-2.5 text-white placeholder:text-white/25 focus:border-violet-500 focus:outline-none transition-colors text-sm"
          />
        </div>

        {error && <p className="text-sm text-red-300">{error}</p>}

        <button
          type="button"
          onClick={createGame}
          disabled={creating}
          className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:bg-violet-600/40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg text-sm transition-colors"
        >
          {creating ? <Loader2 size={16} className="animate-spin" /> : <Disc size={16} />}
          {creating ? "Erstelle Spiel…" : "Neues Spiel erstellen"}
        </button>

        <div className="flex items-center gap-3 pt-1">
          <div className="h-px flex-1 bg-white/10" />
          <span className="text-[11px] uppercase tracking-widest text-white/30">oder</span>
          <div className="h-px flex-1 bg-white/10" />
        </div>

        <form onSubmit={joinExisting} className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            maxLength={8}
            placeholder="Code eingeben (z.B. AB3XZ)"
            className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3.5 py-2.5 text-white placeholder:text-white/25 focus:border-violet-500 focus:outline-none transition-colors text-sm uppercase tracking-widest"
          />
          <button
            type="submit"
            className="flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors shrink-0"
          >
            <Users size={15} />
            Beitreten
            <ArrowRight size={14} />
          </button>
        </form>
      </div>
    </div>
  );
}
