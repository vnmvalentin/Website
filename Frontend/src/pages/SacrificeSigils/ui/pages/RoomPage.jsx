// ui/pages/RoomPage.jsx — Online-Raum: /sacrifice-and-sigils/raum/:code (bzw. „neu“ zum Erstellen).
// Am Tisch im Kerzenlicht (Standard) sitzt man schon in der Lobby am Tisch (table/TableLobby.jsx); LobbyScreen bleibt
// der Ausweichweg wie beim Hauptmenü.
import React, { Suspense, lazy, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import SEO from "../../../../components/SEO";
import { useOnlineGame } from "../../net/useOnlineGame.js";
import { DEFAULT_SETTINGS } from "../../engine/match.js";
import { getPrefs, setPrefs, useNewTable } from "../prefs.js";
import LobbyScreen from "../screens/LobbyScreen.jsx";
import GameScreen from "../GameScreen.jsx";
import { de } from "../../i18n/de.js";

const TableLobby = lazy(() => import("../table/TableLobby.jsx"));
const TableHost = lazy(() => import("../table/TableHost.jsx"));

const ERRORS = {
  notFound: "Diesen Raum gibt es nicht (mehr). Prüfe den Code.",
  noSpectators: "In diesem Raum sind keine Zuschauer erlaubt.",
  badToken: "Deine Sitzung konnte nicht erkannt werden. Lade die Seite neu.",
  createFailed: "Der Raum konnte nicht erstellt werden.",
  joinFailed: "Beitreten fehlgeschlagen.",
  rateLimited: "Zu viele Anfragen – kurz warten.",
  serverError: "Der Server ist gerade nicht bereit. Versuch es gleich noch einmal.",
};

function NameGate({ onDone }) {
  const [name, setName] = useState(getPrefs().name || "");
  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <form className="ss-paper p-6 space-y-4" onSubmit={(e) => { e.preventDefault(); if (name.trim()) { setPrefs({ name: name.trim().slice(0, 24) }); onDone(name.trim()); } }}>
        <p className="ss-title !text-[var(--ink)] text-2xl">An den Tisch setzen</p>
        <label className="block">
          <span className="text-sm opacity-75">{de.ui.yourName}</span>
          <input className="ss-input mt-1" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <button type="submit" className="ss-seal" disabled={!name.trim()}>{de.ui.join}</button>
      </form>
    </div>
  );
}

function Room({ code, name }) {
  const navigate = useNavigate();
  const creating = code === "neu";
  const [realCode, setRealCode] = useState(creating ? null : code);
  const game = useOnlineGame({
    code: creating ? null : code,
    name,
    create: creating ? { settings: DEFAULT_SETTINGS, seed: "" } : null,
    onCreated: (c) => {
      setRealCode(c);
      navigate(`/sacrifice-and-sigils/raum/${c}`, { replace: true });
    },
  });
  // Tisch im Kerzenlicht wie im Hauptmenü: Standard, außer bisheriger Tisch gewählt, Sparmodus, hochkant, kein WebGL
  const newTable = useNewTable();
  const [tableFailed, setTableFailed] = useState(false);
  const wideEnough = typeof window === "undefined" || window.innerWidth >= window.innerHeight * 1.2;
  const atTable = newTable && wideEnough && !tableFailed;

  if (game.kicked) return <p className="text-center py-20 ss-dim">Dieser Platz wurde in einem anderen Fenster übernommen.</p>;
  if (game.error) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center space-y-4">
        <p className="ss-paper p-5">{ERRORS[game.error] || ERRORS.joinFailed}</p>
        <Link to="/sacrifice-and-sigils" className="ss-btn">{de.ui.back}</Link>
      </div>
    );
  }
  const waiting = game.connection === "connected" ? "Tisch wird gedeckt …" : "Verbinde …";
  if (!game.room) {
    // Am Tisch: der Tisch aus dem Hauptmenü bleibt stehen, bis der Raum da ist (kein Sprung auf eine leere Seite)
    if (atTable) {
      return (
        <Suspense fallback={null}>
          <TableHost zirkel="moor" seated={false} quiet onFallback={() => setTableFailed(true)}>
            {() => <div className="st-toast ss-paper" role="status">{waiting}</div>}
          </TableHost>
        </Suspense>
      );
    }
    return <p className="text-center py-20 ss-dim">{waiting}</p>;
  }
  const shownCode = realCode || game.room.code;
  return (
    <>
      {game.staleClient && <p className="ss-hint max-w-xl mx-auto mt-3">Das Spiel wurde aktualisiert. Bitte lade die Seite neu, damit Server und Browser gleich rechnen.</p>}
      {game.room.status === "lobby"
        ? (atTable
          ? <Suspense fallback={null}><TableLobby game={game} onFallback={() => setTableFailed(true)} /></Suspense>
          : <LobbyScreen game={game} code={shownCode} />)
        : <GameScreen game={game} onExit={() => { game.lobby.leave(); navigate("/sacrifice-and-sigils"); }} />}
    </>
  );
}

export default function RoomPage() {
  const { code = "" } = useParams();
  const [name, setName] = useState(getPrefs().name || "");
  return (
    <>
      <SEO title="Sacrifice & Sigils – Raum" description="Ein Tisch in der versunkenen Kapelle." path="/sacrifice-and-sigils" noindex />
      {!name ? <NameGate onDone={setName} /> : <Room code={code.toUpperCase() === "NEU" ? "neu" : code.toUpperCase()} name={name} />}
    </>
  );
}
