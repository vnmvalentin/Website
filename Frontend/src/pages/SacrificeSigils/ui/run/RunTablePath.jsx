// ui/run/RunTablePath.jsx — der Pfad der Moorwanderung am Tisch (Rebuild „Am Tisch“, Phase 6).
//
// Dieselben Bauteile wie im Duell (table/TableMap.jsx, table/TableScene.jsx) über die umgerechnete Pfad-Sicht
// (pathView, eigener Fortschritt als Platz 0). Statt eines Gegenübers liegt links ein Zettel mit den Mitspielern
// (Siegel, was sie gerade tun); das Stundenglas zeigt das Pfad-Budget. Gegenüber sitzt niemand — beginnt ein Kampf,
// setzt sich die Gestalt des NPCs an denselben Tisch (RunBattle). Nach der Wahl eines Orts läuft die Figur erst hin.
import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import TableHost from "../table/TableHost.jsx";
import PathResultBanner from "../path/PathResultBanner.jsx";
import { pathView } from "./pathView.js";
import { statusText } from "./names.js";
import { usePrefs } from "../prefs.js";
import { de } from "../../i18n/de.js";

const TableMap = lazy(() => import("../table/TableMap.jsx"));
const TableScene = lazy(() => import("../table/TableScene.jsx"));
/** So lange bleibt die Karte nach der Wahl eines Orts liegen (Figur läuft und landet), wie im Duell (GameScreen). */
const WALK_HOLD_MS = 1500;

/** @param {{ game: any, onFallback: () => void }} props */
export default function RunTablePath({ game, onFallback }) {
  const rv = game.view;
  const you = game.you;
  const prefs = usePrefs();
  const view = useMemo(() => pathView(rv, you), [rv, you]);
  const me = rv.players[you];
  const pp = rv.path.me;

  // Figur erst laufen lassen, dann die Szene zeigen (nicht bei „Animationen reduzieren“)
  const routeLen = pp?.route?.length || 0;
  const [hold, setHold] = useState(false);
  const lastRoute = useRef(routeLen);
  useEffect(() => {
    const before = lastRoute.current;
    lastRoute.current = routeLen;
    if (prefs.reduceMotion || routeLen <= before) return undefined;
    setHold(true);
    const id = setTimeout(() => setHold(false), WALK_HOLD_MS);
    return () => { clearTimeout(id); setHold(false); };
  }, [routeLen, prefs.reduceMotion]);

  // Ergebnisse der Szenen (Kartenwahl, Lagerfeuer …) gelten für „Platz 0“, wie im bisherigen Pfadbildschirm
  const events = useMemo(() => game.batches.map((b) => ({ ...b, events: b.events.map((e) => ({ ...e, player: e.player === you ? 0 : 99 })) })), [game.batches, you]);
  const run = {
    // status: voller Text (Tooltip) · short: ein Wort für den Zettel (lange Zeilen ließen die Schrift dort schrumpfen)
    others: rv.players.map((P, q) => ({ q, name: P.name, alive: P.alive, seals: P.seals, status: statusText(rv, P.status), short: de.run.status[P.status?.stage] || "" })).filter((o) => o.q !== you),
    sealsTotal: rv.settings.seals,
    sub: <>Runde {rv.round + 1} · Pfad {rv.pathInRound + 1}/{rv.pathsPerRound} · {de.run.seals}: {me.seals} von {rv.settings.seals} · {de.ui.shards}: {me.shards}</>,
  };
  const timers = game.timers?.path ? { 0: game.timers.path } : {};
  const names = [me.name, ""];
  const common = { view, you: 0, send: game.send, names, timers, clockOffset: game.clockOffset, onFallback, run };

  return (
    <>
      <TableHost zirkel={rv.settings.zirkel} seated={false} onFallback={onFallback}>
        {(room) => (
          <Suspense fallback={null}>
            {pp.scene && !hold ? <TableScene room={room} {...common} /> : <TableMap room={room} {...common} />}
          </Suspense>
        )}
      </TableHost>
      <PathResultBanner events={events} you={0} />
    </>
  );
}
