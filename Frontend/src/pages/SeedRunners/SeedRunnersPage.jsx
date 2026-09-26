// SeedRunnersPage.jsx — das Hauptmenü von Seed Runners: Tagesrennen, Mehrspieler (Lobby erstellen/beitreten), Level-Bibliothek,
// Sandbox und Steuerung. Hinter dem Menü läuft ein echtes Level vorbei (ui/MenuBackground.jsx). Alle Einstellungen einer Runde
// stellt der Host in der Lobby ein, nicht hier. Gleicher Ablauf wie Connect4 und Blobby: Der Link ist die Einladung, ein Konto
// ist nicht nötig.
import React, { useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { io } from "socket.io-client";
import { ArrowRight, Users, CalendarDays, Hammer, LibraryBig, Gamepad2, Flag, ChevronDown } from "lucide-react";
import SEO from "../../components/SEO";
import { getIdentity, saveIdentity } from "./room/identity.js";
import { getFx } from "./client/fxSettings.js";
import MenuBackground from "./ui/MenuBackground.jsx";
import { Spinner } from "./ui/kit.jsx";
import { useGameShell } from "./ui/shellContext.js";

// Einstellungen einer neuen Lobby; der Host ändert sie dort
const DEFAULT_SETTINGS = { length: "short", speedClass: "normal", biome: "random", seedMode: "random", seed: "" };

function MenuItem({ to, onClick, icon: Icon, title, text, expanded, children }) {
  const inner = (
    <>
      <Icon size={24} className="sr-accent-text shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block sr-cond font-bold uppercase tracking-wider text-[19px] leading-tight sr-ink">{title}</span>
        <span className="block text-sm sr-dim leading-snug">{text}</span>
      </span>
      {expanded === undefined
        ? <ArrowRight size={18} className="sr-faint shrink-0" />
        : <ChevronDown size={18} className={`sr-faint shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />}
    </>
  );
  return (
    <li>
      {to
        ? <Link to={to} className="sr-menu-item">{inner}</Link>
        : <button type="button" onClick={onClick} aria-expanded={expanded} className="sr-menu-item">{inner}</button>}
      {children}
    </li>
  );
}

export default function SeedRunnersPage() {
  const navigate = useNavigate();
  const { biome, openControls } = useGameShell();
  const socketRef = useRef(null);
  const [name, setName] = useState(() => getIdentity().name);
  const [joinCode, setJoinCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [multiOpen, setMultiOpen] = useState(true);

  useEffect(() => () => socketRef.current?.disconnect(), []);

  const requireName = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Bitte gib zuerst deinen Namen ein.");
      return null;
    }
    return trimmed;
  };

  const createRoom = () => {
    const trimmed = requireName();
    if (!trimmed) return;
    setError("");
    setCreating(true);
    const identity = getIdentity();
    saveIdentity({ ...identity, name: trimmed });

    const socket = io("/", { path: "/socket.io", transports: ["websocket", "polling"] });
    socketRef.current = socket;
    socket.once("connect_error", () => {
      setCreating(false);
      setError("Keine Verbindung zum Server. Versuch es gleich noch einmal.");
      socket.disconnect();
    });
    socket.once("connect", () => {
      socket.emit("sr:create", { name: trimmed, token: identity.token, settings: DEFAULT_SETTINGS, color: getFx().farbe || undefined }, (res) => {
        if (!res?.ok) {
          setCreating(false);
          setError(res?.error || "Lobby konnte nicht erstellt werden.");
          socket.disconnect();
          return;
        }
        // Die Raum-Seite tritt mit demselben Token wieder bei; der Platz bleibt so lange reserviert.
        socket.disconnect();
        navigate(`/seed-runners/${res.code}`);
      });
    });
  };

  const joinRoom = (e) => {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (!code) {
      setError("Bitte gib einen Lobby-Code ein.");
      return;
    }
    const trimmed = name.trim();
    if (trimmed) saveIdentity({ ...getIdentity(), name: trimmed });
    navigate(`/seed-runners/${code}`);
  };

  const day = new Date().toISOString().slice(0, 10);

  return (
    <div className="relative min-h-[calc(100dvh-56px)] overflow-hidden">
      <SEO
        title="Seed Runners"
        description="Seed Runners: schnelles Speedrun-Rennen im Browser. Alle Spieler laufen dasselbe zufällig erzeugte Level — wer zuerst im Ziel ist, gewinnt. Mit Wandsprung, Dash, Grapple und vielen Hindernissen."
        path="/seed-runners"
        keywords="Seed Runners, Browser Speedrun, Platformer Multiplayer, Wandsprung, Grapple, Rennen im Browser"
      />
      <MenuBackground biome={biome} seed={`menu-${day}`} />
      {/* Links abgedunkelt, damit das Menü auf jedem Biom lesbar bleibt; rechts bleibt das Level zu sehen */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(90deg, color-mix(in srgb, var(--sr-bg) 88%, transparent) 0%, color-mix(in srgb, var(--sr-bg) 70%, transparent) 42%, transparent 78%)" }} />

      <div className="relative max-w-[1480px] mx-auto px-4 py-10 md:py-14">
        <div className="max-w-[500px]">
          <p className="sr-label mb-3">2–8 Spieler · Rennen im Browser</p>
          <h1 className="sr-display text-[44px] sm:text-[60px] mb-3">SEED<br /><span className="sr-accent-text">RUNNERS</span></h1>
          <p className="sr-dim leading-relaxed mb-8 max-w-[440px]">
            Alle laufen dieselbe Welt aus einem Seed: Wandsprünge, Dashes, Grapple-Anker und Fallen. Jeder spielt lokal ohne Lag —
            wer zuerst im Ziel ist, gewinnt.
          </p>

          <ul className="flex flex-col gap-2">
            <MenuItem to="/seed-runners/daily" icon={CalendarDays} title="Tagesrennen" text="Jeden Tag ein festes Level für alle. Bestätigte Zeiten kommen in die Rangliste." />

            <MenuItem onClick={() => setMultiOpen((v) => !v)} expanded={multiOpen} icon={Users} title="Mehrspieler" text="Lobby erstellen oder mit einem Code beitreten.">
              {multiOpen && (
                <div className="sr-panel-flat border-t-0 px-4 pt-4 pb-4 -mt-px space-y-4" style={{ background: "var(--sr-raised)" }}>
                  <label className="block">
                    <span className="sr-label block mb-1.5">Dein Name</span>
                    <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={24} placeholder="Name eingeben" className="sr-input" />
                  </label>
                  <button type="button" onClick={createRoom} disabled={creating} className="sr-btn w-full">
                    {creating ? <Spinner size={16} className="!text-current" /> : <Flag size={16} />}
                    {creating ? "Erstelle Lobby …" : "Lobby erstellen"}
                  </button>
                  <form onSubmit={joinRoom} className="flex gap-2">
                    <input
                      type="text"
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                      maxLength={8}
                      placeholder="Code, z. B. AB3XZ"
                      aria-label="Lobby-Code"
                      className="sr-input min-w-0 flex-1 uppercase tracking-widest"
                    />
                    <button type="submit" className="sr-btn sr-btn-ghost shrink-0">Beitreten</button>
                  </form>
                  {error && <p className="text-sm sr-bad">{error}</p>}
                  <p className="text-xs sr-faint leading-relaxed">In der Lobby wählst du Runden, Level und Biom und schickst den Link an deine Leute.</p>
                </div>
              )}
            </MenuItem>

            <MenuItem to="/seed-runners/levels" icon={LibraryBig} title="Level-Bibliothek" text="Level der Community spielen, bewerten und als Favorit merken." />
            <MenuItem to="/seed-runners/sandbox" icon={Hammer} title="Sandbox" text="Eigene Level im Editor bauen, anspielen und veröffentlichen." />
            <MenuItem onClick={openControls} icon={Gamepad2} title="Steuerung" text="Tasten ansehen und umbelegen, Gamepad, Regeln einer Runde." />
          </ul>
        </div>
      </div>
    </div>
  );
}
