// BlobbyPage.jsx — Landing: Namen eingeben, Regeln wählen, neue Partie erstellen oder per
// Code beitreten. Gleicher Ablauf wie Connect4, nur dass hinter dem Link ein Echtzeitspiel
// steckt.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { io } from "socket.io-client";
import { Volleyball, ArrowRight, Users, Loader2 } from "lucide-react";
import SEO from "../../components/SEO";
import BlobbySettings from "./BlobbySettings";
import { DEFAULT_SETTINGS } from "./settings";

export default function BlobbyPage() {
  const navigate = useNavigate();
  const socketRef = useRef(null);

  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem("blobby_last_name") || "";
    } catch {
      return "";
    }
  });
  const [settings, setSettings] = useState(() => {
    try {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem("blobby_settings") || "{}") };
    } catch {
      return { ...DEFAULT_SETTINGS };
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
      socket.emit("bv:create", { name: trimmed, settings }, (res) => {
        if (!res?.ok) {
          setCreating(false);
          setError("Spiel konnte nicht erstellt werden. Versuch es nochmal.");
          return;
        }
        try {
          localStorage.setItem("blobby_last_name", trimmed);
          localStorage.setItem("blobby_settings", JSON.stringify(settings));
          localStorage.setItem("blobby_session", JSON.stringify({ code: res.code, name: trimmed }));
        } catch { /* ignore */ }
        socket.disconnect();
        navigate(`/blobby/${res.code}`);
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
      if (name.trim()) localStorage.setItem("blobby_last_name", name.trim());
    } catch { /* ignore */ }
    navigate(`/blobby/${code}`);
  };

  const players = settings.mode === "2v2" ? 4 : 2;

  return (
    <div className="page-fade w-full max-w-2xl mx-auto px-2 md:px-4 py-10 md:py-16">
      <SEO
        title="Blobby Volley"
        description="Blobby Volley online: Volleyball im Browser — 1v1 oder 2v2, Link teilen, WASD drücken, losspielen. Mit Powerups und Strandkulisse, kein Download."
        path="/blobby"
      />

      <div className="flex items-start gap-4 mb-8 md:mb-10">
        <span className="hidden sm:flex items-center justify-center w-14 h-14 rounded-2xl bg-violet-500/10 border border-violet-400/20 text-violet-300 shrink-0">
          <Volleyball size={26} />
        </span>
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-violet-300/80 mb-2">1v1 oder 2v2 · Live</p>
          <h1 className="font-display text-3xl md:text-5xl font-bold text-white tracking-tight mb-3">Blobby Volley</h1>
          <p className="text-white/50 text-sm md:text-base max-w-xl leading-relaxed">
            Volleyball am Strand, mit Blobs und einem Pfeiler in der Mitte — Physik wie im
            Original. Erstelle eine Partie, schick den Link an deine Leute und legt los. Wer den
            Ball auf der gegnerischen Seite auf den Sand bringt, punktet.
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

        <div className="pt-1 border-t border-white/10">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-4 mt-4">
            Spieleinstellungen
          </p>
          <BlobbySettings value={settings} onChange={setSettings} />
        </div>

        {error && <p className="text-sm text-red-300">{error}</p>}

        <button
          type="button"
          onClick={createGame}
          disabled={creating}
          className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:bg-violet-600/40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg text-sm transition-colors"
        >
          {creating ? <Loader2 size={16} className="animate-spin" /> : <Volleyball size={16} />}
          {creating ? "Erstelle Spiel…" : `Neues Spiel erstellen (${players} Spieler)`}
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

      {/* Steuerung & Regeln */}
      <div className="grid sm:grid-cols-2 gap-4 mt-6">
        <div className="panel p-5">
          <h2 className="text-sm font-bold text-white mb-3">Steuerung</h2>
          <ul className="space-y-2 text-sm text-white/55">
            <li><span className="text-white/85 font-semibold">A / D</span> oder <span className="text-white/85 font-semibold">← / →</span> — laufen</li>
            <li><span className="text-white/85 font-semibold">W</span>, <span className="text-white/85 font-semibold">↑</span> oder <span className="text-white/85 font-semibold">Leertaste</span> — springen (gedrückt halten springt höher)</li>
            <li>Am Handy: die drei Tasten unter dem Spielfeld</li>
          </ul>
        </div>
        <div className="panel p-5">
          <h2 className="text-sm font-bold text-white mb-3">Regeln</h2>
          <ul className="space-y-2 text-sm text-white/55">
            <li>Der Ball darf den Sand auf der eigenen Seite nicht berühren</li>
            <li>Gespielt wird auf <span className="text-white/85 font-semibold">15 Punkte</span> mit 2 Punkten Vorsprung</li>
            <li>
              {settings.crossNet
                ? "Der Pfeiler ist offen: hochspringen, rüberklettern, den Gegner anrempeln"
                : "Jedes Team bleibt in seiner Hälfte"}
            </li>
            <li>
              {settings.maxTouches === 3
                ? "Höchstens 3 Ballberührungen pro Seite"
                : "Beliebig viele Ballberührungen pro Seite"}
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
