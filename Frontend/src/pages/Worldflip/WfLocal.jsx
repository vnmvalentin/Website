// WfLocal.jsx — Worldflip gegen Bots. Die Engine läuft hier im Browser; der Tisch (components/GameTable.jsx) bekommt
// nach jedem Zug Ereignisse und Sicht, genau wie im Online-Raum vom Server.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Home, RotateCcw } from "lucide-react";
import SEO from "../../components/SEO";
import GameTable from "./components/GameTable.jsx";
import EndPanel from "./components/EndPanel.jsx";
import { apply, botAction, createGame, eventsFor, viewFor } from "./engine/index.js";
import { randomSkin } from "./skins.js";
import { useWfShell } from "./ui/shellContext.js";

const BOT_NAMES = ["Kiesel", "Funke", "Moos", "Nebel", "Qualle", "Komet"];
const ME = 0;

export default function WfLocal() {
  const { prefs } = useWfShell();
  const tableRef = useRef(null);
  const stateRef = useRef(null);
  const botTimer = useRef(null);
  const [round, setRound] = useState(0);

  const push = useCallback((result) => {
    stateRef.current = result.state;
    tableRef.current?.push({ events: eventsFor(result.events, ME), view: viewFor(result.state, ME) });
  }, []);

  // neue Runde
  useEffect(() => {
    clearTimeout(botTimer.current);
    const names = BOT_NAMES.slice().sort(() => Math.random() - 0.5);
    const players = [{ name: prefs.name.trim() || "Du", bot: false, skin: prefs.skin }];
    const count = prefs.teams ? 4 : prefs.players;
    // Bots: zufälliges Aussehen, jede Farbe nur einmal am Tisch
    for (let i = 1; i < count; i += 1) players.push({ name: names[i - 1], bot: true, skin: randomSkin(players.map((p) => p.skin.c)) });
    const state = createGame({ players: count, teams: prefs.teams, handSize: prefs.handSize, seed: Math.floor(Math.random() * 0x7fffffff) });
    stateRef.current = state;
    tableRef.current?.push({ fresh: true, view: viewFor(state, ME), players, seat: ME });
    return () => clearTimeout(botTimer.current);
    // Einstellungen gelten ab der nächsten Runde — mitten im Spiel nicht neu austeilen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round]);

  const onAct = useCallback((action) => {
    const r = apply(stateRef.current, ME, action);
    if (r.ok) push(r);
  }, [push]);

  // Alles abgespielt: ist ein Bot dran, zieht er nach kurzer Bedenkzeit
  const onIdle = useCallback(() => {
    const s = stateRef.current;
    if (!s || s.winner !== null || s.turn === ME) return;
    clearTimeout(botTimer.current);
    botTimer.current = setTimeout(() => {
      const cur = stateRef.current;
      if (!cur || cur.winner !== null || cur.turn === ME) return;
      let r = apply(cur, cur.turn, botAction(cur, cur.turn));
      if (!r.ok) r = apply(cur, cur.turn, cur.drawn.length || cur.combo !== null ? { t: "pass" } : { t: "draw" });
      if (r.ok) push(r);
    }, 1300 + Math.random() * 700);
  }, [push]);

  return (
    <>
      <SEO title="Worldflip gegen Bots" description="Worldflip gegen Computergegner: Karten ablegen, während die Welt um den Tisch kippt." path="/worldflip/spiel" noindex />
      <GameTable
        ref={tableRef}
        onAct={onAct}
        onIdle={onIdle}
        renderOverlay={({ view, table, busy }) => view && view.winner !== null && !busy && (
          <EndPanel view={view} table={table}>
            <button type="button" className="wf-btn" onClick={() => setRound((r) => r + 1)}><RotateCcw size={16} />Nochmal</button>
            <Link to="/worldflip" className="wf-btn wf-btn-ghost"><Home size={16} />Menü</Link>
          </EndPanel>
        )}
      />
    </>
  );
}
