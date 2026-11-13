// Connect4Page.jsx — Landing: Namen eingeben, neues Spiel erstellen oder per Code beitreten.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { io } from "socket.io-client";
import { Disc, ArrowRight, Users, Loader2 } from "lucide-react";
import SEO from "../../components/SEO";
import { Page, PageHeader, Card, Button, Field, Input } from "../../components/ui";

function SpinningLoader({ size }) {
  return <Loader2 size={size} className="animate-spin" />;
}

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
    <Page width="narrow" className="py-6 md:py-10">
      <SEO
        title="Connect 4"
        description="Vier Gewinnt gegen einen Freund — Link teilen und direkt loslegen, kein Download nötig."
        path="/connect4"
      />

      <PageHeader
        icon={Disc}
        kicker="1 gegen 1 · Live"
        title="Connect 4"
        description="Vier Gewinnt auf einem 7×6-Feld. Erstelle ein Spiel, schick den Link an einen Freund und setzt abwechselnd — wer zuerst vier in einer Reihe hat, gewinnt."
      />

      <Card className="md:p-7 space-y-5">
        <Field label="Dein Name" error={error && !name.trim() ? error : undefined}>
          <Input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={24}
            placeholder="Name eingeben"
          />
        </Field>

        {error && name.trim() && <p className="text-sm text-red-300">{error}</p>}

        <Button block size="lg" onClick={createGame} loading={creating} loadingText="Erstelle Spiel…"
          icon={creating ? SpinningLoader : Disc}>
          Neues Spiel erstellen
        </Button>

        <div className="flex items-center gap-3 pt-1">
          <div className="h-px flex-1 bg-white/10" />
          <span className="text-[11px] uppercase tracking-widest text-white/30">oder</span>
          <div className="h-px flex-1 bg-white/10" />
        </div>

        <form onSubmit={joinExisting} className="flex flex-col sm:flex-row gap-3">
          <Input
            type="text"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            maxLength={8}
            aria-label="Spiel-Code"
            placeholder="Code eingeben (z.B. AB3XZ)"
            className="flex-1 uppercase tracking-widest"
          />
          <Button type="submit" variant="secondary" icon={Users} className="shrink-0">
            Beitreten
            <ArrowRight size={14} />
          </Button>
        </form>
      </Card>
    </Page>
  );
}
