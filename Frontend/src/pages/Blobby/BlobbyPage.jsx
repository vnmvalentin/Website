// BlobbyPage.jsx — das Hauptmenü von Blobby Volley: Partie erstellen (mit Regeln), per Code beitreten, laufende Partie
// fortsetzen, Steuerung & Regeln. Hinter dem Menü spielen sich zwei Blobs am Strand den Ball zu (ui/MenuBeach.jsx).
// Gleicher Ablauf wie Connect4: Der Link ist die Einladung, ein Konto ist nicht nötig.
import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Link, useNavigate } from "react-router-dom";
import { io } from "socket.io-client";
import { Volleyball, ArrowRight, Users, Loader2, ChevronDown, Keyboard, RotateCcw } from "lucide-react";
import SEO from "../../components/SEO";
import BlobbySettings from "./BlobbySettings";
import MenuBeach from "./ui/MenuBeach.jsx";
import { useBlobbyShell } from "./ui/shellContext.js";
import { DEFAULT_SETTINGS } from "./settings";
import { BLOBBY_SOCKET_OPTS } from "./net";

// Ab 1024 px steht der Strand hinter dem Menü, darunter als Band darüber — nie beide gleichzeitig (jede Instanz zeichnet)
const WIDE_QUERY = "(min-width: 1024px)";
const subscribeWide = (cb) => {
  const mq = window.matchMedia(WIDE_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
const getWide = () => window.matchMedia(WIDE_QUERY).matches;

// Pfeiler mittig im freien Bereich rechts neben dem Menü (Menü: 470 px breit in einem zentrierten 1400er-Container)
const menuFocus = (cw) => {
  const menuRight = Math.max(0, (cw - 1400) / 2) + 16 + 470 + 40;
  return (menuRight + cw) / 2 / cw;
};

function readSession() {
  try {
    const s = JSON.parse(localStorage.getItem("blobby_session") || "null");
    return s?.code ? s : null;
  } catch {
    return null;
  }
}

function MenuItem({ icon: Icon, title, text, onClick, to, expanded, children }) {
  const inner = (
    <>
      <span className="bv-menu-icon"><Icon size={21} /></span>
      <span className="min-w-0 flex-1">
        <span className="block bv-display text-[21px] leading-tight">{title}</span>
        <span className="block text-[13px] bv-dim leading-snug mt-0.5">{text}</span>
      </span>
      {expanded === undefined
        ? <ArrowRight size={18} className="bv-faint shrink-0" />
        : <ChevronDown size={18} className={`bv-faint shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />}
    </>
  );
  return (
    <li>
      {to
        ? <Link to={to} className="bv-menu-item">{inner}</Link>
        : <button type="button" onClick={onClick} aria-expanded={expanded} className="bv-menu-item">{inner}</button>}
      {children}
    </li>
  );
}

export default function BlobbyPage() {
  const navigate = useNavigate();
  const { openHelp } = useBlobbyShell();
  const wide = useSyncExternalStore(subscribeWide, getWide, () => true);
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
  const [session] = useState(readSession);
  const [open, setOpen] = useState("create"); // create | join | null
  const [joinCode, setJoinCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    return () => socketRef.current?.disconnect();
  }, []);

  const ensureSocket = useCallback(() => {
    if (socketRef.current) return socketRef.current;
    const socket = io("/", { ...BLOBBY_SOCKET_OPTS });
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

  const toggle = (key) => {
    setError("");
    setOpen((v) => (v === key ? null : key));
  };
  const players = settings.mode === "2v2" ? 4 : 2;

  return (
    <div className="relative flex-1 flex flex-col lg:block">
      <SEO
        title="Blobby Volley"
        description="Blobby Volley online: Volleyball im Browser — 1v1 oder 2v2, Link teilen, WASD drücken, losspielen. Mit Powerups und Strandkulisse, kein Download."
        path="/blobby"
      />
      {/* Breit: der Strand steht fest im Fenster (unter der Leiste), das Menü scrollt darüber — sonst würde er mit der
          Menühöhe mitwachsen. Links abgedunkelt, damit der weiße Titel auf Himmel und Meer lesbar bleibt. */}
      {wide ? (
        <>
          <MenuBeach className="fixed inset-x-0 bottom-0 top-14" focus={menuFocus} />
          <div className="fixed inset-x-0 bottom-0 top-14 pointer-events-none" style={{ background: "linear-gradient(90deg, rgb(10 38 66 / 0.62) 0%, rgb(10 38 66 / 0.38) 34%, transparent 58%)" }} />
        </>
      ) : (
        <MenuBeach className="h-[210px] sm:h-[300px] shrink-0 border-b-2 border-[var(--bv-ink)]" />
      )}

      <div className="relative max-w-[1400px] w-full mx-auto px-4 py-6 lg:py-12">
        <div className="max-w-[470px]">
          <div className="mb-6 lg:mb-8">
            <p className="inline-block bv-label !text-[var(--bv-ink)] bg-[var(--bv-sun)] border-2 border-[var(--bv-ink)] rounded px-2 py-0.5 mb-3">1 gegen 1 oder 2 gegen 2 · live</p>
            <h1 className={`bv-display text-[48px] sm:text-[64px] ${wide ? "text-white [text-shadow:3px_3px_0_var(--bv-ink)]" : ""}`}>
              Blobby<br />Volley
            </h1>
            <p className={`mt-3 max-w-[420px] text-[15px] leading-relaxed ${wide ? "text-white [text-shadow:0_1px_2px_rgb(10_38_66/0.8)]" : "bv-dim"}`}>
              Volleyball am Strand, mit Blobs und einem Pfeiler in der Mitte — Physik wie im Original. Wer den Ball auf der
              anderen Seite in den Sand bringt, punktet.
            </p>
          </div>

          <div className="bv-card-flat px-4 py-3 mb-3 shadow-[3px_3px_0_var(--bv-ink)]">
            <label className="block">
              <span className="bv-label block mb-1.5">Dein Name</span>
              <input
                type="text"
                value={name}
                onChange={(e) => { setName(e.target.value); setError(""); }}
                maxLength={24}
                placeholder="Name eingeben"
                className="bv-input"
              />
            </label>
          </div>

          <ul className="flex flex-col gap-3">
            {session && (
              <MenuItem to={`/blobby/${session.code}`} icon={RotateCcw} title="Weiterspielen" text={`Zurück in die Partie ${session.code}.`} />
            )}

            <MenuItem icon={Volleyball} title="Partie erstellen" text="Regeln wählen, Link teilen, loslegen." onClick={() => toggle("create")} expanded={open === "create"}>
              {open === "create" && (
                <div className="bv-menu-drawer px-4 pt-1 pb-4">
                  <BlobbySettings value={settings} onChange={setSettings} />
                  <button type="button" onClick={createGame} disabled={creating} className="bv-btn bv-btn-lg w-full mt-3">
                    {creating ? <Loader2 size={17} className="animate-spin" /> : <Volleyball size={17} />}
                    {creating ? "Erstelle Partie …" : `Partie erstellen · ${players} Spieler`}
                  </button>
                  {error && open === "create" && <p className="text-sm bv-bad mt-2" role="alert">{error}</p>}
                </div>
              )}
            </MenuItem>

            <MenuItem icon={Users} title="Mit Code beitreten" text="Jemand hat dir einen Code geschickt?" onClick={() => toggle("join")} expanded={open === "join"}>
              {open === "join" && (
                <form onSubmit={joinExisting} className="bv-menu-drawer p-4">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={joinCode}
                      onChange={(e) => { setJoinCode(e.target.value.toUpperCase()); setError(""); }}
                      maxLength={8}
                      placeholder="Code, z. B. AB3XZ"
                      aria-label="Spiel-Code"
                      className="bv-input min-w-0 flex-1 uppercase tracking-widest"
                      autoFocus
                    />
                    <button type="submit" className="bv-btn bv-btn-sea shrink-0">Beitreten</button>
                  </div>
                  {error && open === "join" && <p className="text-sm bv-bad mt-2" role="alert">{error}</p>}
                </form>
              )}
            </MenuItem>

            <MenuItem icon={Keyboard} title="Steuerung & Regeln" text="Tasten, Punkte, Powerups." onClick={openHelp} />
          </ul>
        </div>
      </div>
    </div>
  );
}
