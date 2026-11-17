// ui/GameScreen.jsx — Rahmen eines laufenden Matches: Animations-Queue, Effekte (Sound, Partikel, Shake, Spannung)
// und Umschaltung zwischen den Phasen (Draft, Extras, Kampf, Pfad, Rast, Ergebnis).
import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { FastForward, Flag, Wifi, WifiOff } from "lucide-react";
import { useAnimationQueue } from "./anim/useAnimationQueue.js";
import { EVENT_TIMING, TABLE_TIMING, TABLE_OPP_EXTRA } from "./anim/timing.js";
import { cleanFigureMask, cleanMask, maskFromText } from "./table/masks.js";
import PathResultBanner from "./path/PathResultBanner.jsx";
import { particles, centerOf } from "./anim/particles.js";
import { usePrefs, useNewTable } from "./prefs.js";
import { useWideEnough } from "./table/useAtTable.js";
import { useShell } from "./shellContext.js";
import { sound } from "../audio/sound.js";
import { de } from "../i18n/de.js";
import BattleScreen from "./battle/BattleScreen.jsx";
import DraftScreen from "./screens/DraftScreen.jsx";
import ExtrasScreen from "./screens/ExtrasScreen.jsx";
import PathScreen from "./path/PathScreen.jsx";
import InterludeScreen from "./screens/InterludeScreen.jsx";
import ResultScreen from "./screens/ResultScreen.jsx";
import { zaehleDuell } from "../kontoStand.js";
import { TableStage } from "./battle/table3d/tableStage.js";

/**
 * Der Tisch im Kerzenlicht (Rebuild „Am Tisch“): eine 3D-Szene (TableHost), die für Draft, Totem-Wahl und Kampf
 * stehen bleibt; je Phase bedient ein eigenes Bauteil. Erst bei Bedarf geladen.
 */
const TableHost = lazy(() => import("./table/TableHost.jsx"));
const TableBattle = lazy(() => import("./table/TableBattle.jsx"));
const TableDraft = lazy(() => import("./table/TableDraft.jsx"));
const TableExtras = lazy(() => import("./table/TableExtras.jsx"));
const TableInterlude = lazy(() => import("./table/TableInterlude.jsx"));
const TableResult = lazy(() => import("./table/TableResult.jsx"));
const TableScene = lazy(() => import("./table/TableScene.jsx"));
const TableMap = lazy(() => import("./table/TableMap.jsx"));

/** Phase → Ansicht des 3D-Tischs (Kampf und Pfad melden sich selbst, mit mehr Angaben). */
const TABLE_STAGE = { draft: "draft", extras: "totem", interlude: "rest", over: "rest" };
/** So lange bleibt die Pfadkarte nach der Wahl eines Orts liegen: die Figur läuft hin und landet (pathMap3d.js). */
const WALK_HOLD_MS = 1500;

/**
 * @param {{ game: any, extra?: any, pauseExtra?: React.ReactNode, onBattleAction?: (a: any) => void, onExit?: () => void, bar?: React.ReactNode,
 *   table?: { oppMask?: string, oppCrown?: boolean, oppCracked?: boolean, title?: string, sub?: React.ReactNode, notes?: any[], noteTip?: (id: string) => React.ReactNode, surrenderText?: string } }} props
 *   extra: eigener Knopf in der Hinweiszeile des bisherigen Tischs · pauseExtra: derselbe am Tisch, im Pausenmenü (Tutorial)
 *   bar: eigene Kopfzeile statt Siege/Splitter/Aufgeben (Moorwanderung nutzt den Kampfbildschirm für NPC-Kämpfe und Duelle)
 */
export default function GameScreen({ game, extra, pauseExtra, onBattleAction, onExit, bar, table }) {
  const prefs = usePrefs();
  const newTable = useNewTable();
  const { shake, setTension } = useShell();
  const you = game.you;
  // Der Tisch im Kerzenlicht ist Standard (seit 14.11.2026), aber nur im 1-gegen-1 ohne Sonderaufbau (die
  // Moorwanderung bringt eine eigene Kopfzeile und einen Aktions-Haken mit und bleibt vorerst am bisherigen Tisch;
  // das Tutorial läuft seit Phase 5 am Tisch, mit Erzähler-Blatt und seinem Knopf im Pausenmenü).
  // Hochkant bleibt der bisherige Tisch (Entscheidung Phase 7); wer das Gerät dreht, wechselt sofort.
  const wideEnough = useWideEnough();
  // Ausweichen für dieses Match: der Browser kann den Tisch nicht darstellen, oder im Pausenmenü abgewählt
  const [tableFailed, setTableFailed] = useState(false);
  // (Das Tutorial läuft seit Phase 5 am Tisch: sein Knopf steht dort im Pausenmenü, die Hinweise auf dem Erzähler-Blatt.)
  // Moorwanderung (Phase 6): ihre Kämpfe bringen eine eigene Kopfzeile (bar) für den bisherigen Tisch und ein
  // Paket für den Tisch im Kerzenlicht (table: Maske, Zettel, Titel) — mit Paket geht es an den Tisch.
  const tableWanted = newTable && !tableFailed && wideEnough && (bar === undefined || !!table) && (!extra || !!pauseExtra) && !onBattleAction;

  const onEvent = useCallback((ev, stage, display) => {
    const t = (tableWanted ? TABLE_TIMING : EVENT_TIMING)[ev.type];
    if (t?.sound) {
      let key = t.sound;
      if (ev.type === "attack" && ev.flying) key = "wing";
      sound.play(key, { amount: ev.amount || 1 });
    }
    const at = (uid) => centerOf(`[data-uid="${uid}"]`);
    switch (ev.type) {
      case "play":
      case "spawn": {
        const c = at(ev.uid);
        if (c) particles.burst("dust", c.x, c.y + 40);
        if (ev.type === "play") shake();
        break;
      }
      case "sacrifice": {
        const c = at(ev.uid);
        if (c) {
          particles.burst("ash", c.x, c.y);
          particles.burst("wax", c.x, c.y);
          // Kein Flug zu einer Blutanzeige: Blut wird nicht gespeichert, das Opfer gibt nur Knochen (death-Ereignis)
        }
        break;
      }
      case "death": {
        const c = at(ev.uid);
        if (c) {
          particles.burst("ash", c.x, c.y, { n: 14 });
          const pile = centerOf(`[data-anchor="bones-${ev.player}"]`);
          if (pile) setTimeout(() => particles.fly("bone", c, pile, 620), 180);
        }
        break;
      }
      case "damage": {
        // Einschlag: Tusche spritzt, der Tisch wackelt kurz
        const c = at(ev.uid);
        if (c) particles.burst("ink", c.x, c.y, { n: 18 });
        if (ev.cause === "attack") shake();
        break;
      }
      case "overflow": {
        // Tusche spritzt weiter: zur Hinterreihe-Karte oder zur Waage
        const lane = centerOf(`[data-slot="${ev.player}:${ev.fromZone}:${ev.lane}"]`);
        const to = ev.to ? at(ev.to) : centerOf('[data-anchor="scale"]');
        if (lane && to) particles.fly("blood", lane, to, 520);
        break;
      }
      case "bossPhase": {
        // Moorwanderung: der Boss steht mit neuer Mannschaft wieder auf
        shake();
        const s = centerOf('[data-anchor="scale"]');
        if (s) particles.burst("ember", s.x, s.y, { n: 40, spread: 2 });
        break;
      }
      case "transform":
      case "revive": {
        const c = at(ev.uid);
        if (c) particles.burst("ember", c.x, c.y);
        break;
      }
      case "submerge":
      case "surface": {
        const c = at(ev.uid);
        if (c) particles.burst("splash", c.x, c.y + 30);
        break;
      }
      case "hammer":
      case "shield": {
        const c = at(ev.uid);
        if (c) particles.burst("spark", c.x, c.y);
        break;
      }
      case "scale": {
        sound.play("weight");
        const s = centerOf('[data-anchor="scale"]');
        if (s) particles.burst("spark", s.x, s.y - 10, { n: 6 });
        if (display) {
          const lead = Math.abs(display.scale);
          setTension(lead >= 4 ? lead : lead >= 3 ? 3 : 0);
        }
        break;
      }
      case "battleEnd": {
        // Sieg: Kerzen flammen auf (Glut), Niederlage: sie verlöschen (Asche)
        const won = ev.winner === you || you === null;
        sound.play(won ? "victory" : "defeat");
        setTension(0);
        const s = centerOf('[data-anchor="scale"]');
        if (s) particles.burst(won ? "ember" : "ash", s.x, s.y, { n: 50, spread: 2.5 });
        break;
      }
      case "wick": {
        // Kerzendocht erlischt: Rauch steigt auf, danach stirbt die Karte
        if (ev.left <= 0) {
          const c = at(ev.uid);
          if (c) particles.burst("ash", c.x, c.y - 20, { n: 18 });
        }
        break;
      }
      case "burn":
      case "candle": {
        const s = centerOf('[data-anchor="scale"]');
        if (s) particles.burst("ember", s.x, s.y);
        break;
      }
      default:
        break;
    }
  }, [shake, setTension, you, tableWanted]);

  // Am neuen Tisch gilt ein eigener, schnellerer Takt mit überlappenden Abläufen (TABLE_TIMING)
  // Wer dem Betrachter gegenübersitzt (Zuschauer sehen Platz 0 unten)
  const oppSeat = 1 - (you ?? 0);
  const q = useAnimationQueue(game.batches, {
    speed: prefs.speed, reduced: prefs.reduceMotion, onEvent,
    timing: tableWanted ? TABLE_TIMING : undefined, noReturns: tableWanted,
    // Die Hände des Gegenübers führen seine Züge aus — das braucht einen Moment mehr als das eigene Tun
    extraMs: tableWanted ? (ev) => (ev.player === oppSeat ? TABLE_OPP_EXTRA[ev.type] || 0 : 0) : undefined,
  });

  // Lokales Spiel: die KI wartet, bis die Animationen durch sind
  useEffect(() => { game.setBusy?.(q.busy); }, [q.busy, game]);

  // Spannung auch ohne Ereignis (Reconnect, neuer Kampf)
  useEffect(() => {
    if (!q.display) { setTension(0); return; }
    const lead = Math.abs(q.display.scale);
    setTension(lead >= 4 ? lead : lead >= 3 ? 3 : 0);
  }, [q.display, q.view?.phase, setTension]);
  useEffect(() => () => setTension(0), [setTension]);

  const [confirmSurrender, setConfirmSurrender] = useState(false);
  const phaseRef = useRef(/** @type {HTMLDivElement|null} */ (null));
  const view = q.view;
  // Farbthema des Zirkels am äußeren Spielrahmen (Tisch, Holz, Messing): Gezeiten = nasses Treibholz im Sturmlicht
  const zirkelTheme = view?.settings?.zirkel || "moor";
  useEffect(() => {
    const el = document.querySelector(".ss-game");
    if (!el) return undefined;
    el.setAttribute("data-zirkel", zirkelTheme);
    return () => el.removeAttribute("data-zirkel");
  }, [zirkelTheme]);
  // Pfad am Tisch: nach der Wahl eines Orts bleibt die Karte liegen, bis die Figur dort angekommen ist (Rückmeldung
  // 15.11.2026: „mehr Animationen beim Bewegen der Figur“) — erst dann beginnt die Szene. WALK_HOLD_MS passt zu WALK_S
  // in battle/table3d/pathMap3d.js (Weg + Landung).
  const myRoute = you !== null && view?.phase === "path" ? view.path?.players?.[you]?.route?.length || 0 : -1;
  const [walkHold, setWalkHold] = useState(false);
  const lastRoute = useRef(myRoute);
  useEffect(() => {
    const before = lastRoute.current;
    lastRoute.current = myRoute;
    if (!tableWanted || prefs.reduceMotion || before < 0 || myRoute <= before) return undefined;
    setWalkHold(true);
    const id = setTimeout(() => setWalkHold(false), WALK_HOLD_MS);
    return () => { clearTimeout(id); setWalkHold(false); };
  }, [myRoute, tableWanted, prefs.reduceMotion]);
  // Statistik am Konto: ein beendetes Match einmal zählen (je Seed; Revanche = neuer Seed)
  useEffect(() => {
    if (view?.phase !== "over" || you === null || you === undefined || view.winner === null || view.winner === undefined) return;
    zaehleDuell({ seed: view.seed, modus: game.mode, gewonnen: view.winner === you });
  }, [view?.phase, view?.seed, view?.winner, you, game.mode]);

  if (!view) return <p className="text-center ss-dim py-20">Der Tisch wird gedeckt …</p>;
  const names = view.players.map((p) => p.name);
  const phase = view.phase;
  const common = { view, you, send: game.send, names, busy: q.busy };
  // Am Tisch wird das ganze Match gespielt: Draft, Totem-Wahl, Pfad (Karte und Szenen), Kampf, Rast, Ergebnis —
  // die Szene wird einmal gebaut und bleibt stehen. Nur wer zuschaut, sieht den Pfad noch in der bisherigen Ansicht
  // (er hat keine eigene Karte).
  const pathAtTable = tableWanted && phase === "path" && you !== null;
  const pathScene = pathAtTable && !walkHold ? view.path?.players?.[you]?.scene : null;
  const tableMode = pathAtTable || (tableWanted && (phase === "draft" || phase === "extras" || phase === "battle" || phase === "interlude" || phase === "over"));
  const tableStatus = game.mode === "online" && game.connection !== "connected" ? de.ui.reconnecting : game.notice || null;
  // Maske der Gestalt gegenüber: online die des anderen Spielers, sonst (KI, Hotseat) aus dem Seed abgeleitet —
  // aber nie die eigene, damit man etwas anderes sieht als das, was man selbst trägt
  const seatInfo = game.mode === "online" ? game.room?.seats?.[oppSeat] : null;
  const oppMask = table?.oppMask ? cleanFigureMask(table.oppMask) : seatInfo?.mask ? cleanMask(seatInfo.mask) : maskFromText(`${view.seed}:${names[oppSeat]}`, game.mode === "online" ? null : cleanMask(prefs.mask));
  const oppAway = game.mode === "online" && !!seatInfo && seatInfo.connected === false;

  return (
    <div
      className="relative"
      onPointerDownCapture={(e) => {
        // Klick überspringt laufende Animationen (Knöpfe ausgenommen). Am neuen Tisch nicht: dort sind die Abläufe
        // kurz, und wer etwas anklickt, spult damit ohnehin vor (TableBattle)
        if (!tableMode && q.busy && !(e.target instanceof Element && e.target.closest("button, input, select, a"))) q.skip();
      }}
    >
      {tableMode ? null : bar !== undefined ? bar : <div className="ss-gamebar max-w-[1760px] mx-auto px-3 flex flex-nowrap items-center gap-x-4 text-sm">
        <span className="ss-title text-[var(--candle)]">{de.phases[phase]}{phase === "battle" && view.battle ? ` ${view.battleNo}` : ""}</span>
        <span className="ss-dim">
          {names[0]} <b className="ss-num text-[var(--bone)]">{view.wins[0]}</b> : <b className="ss-num text-[var(--bone)]">{view.wins[1]}</b> {names[1]}
          <span className="ss-faint"> · {view.settings.winsNeeded} {view.settings.winsNeeded === 1 ? de.ui.win : de.ui.wins} nötig</span>
        </span>
        {you !== null && <span className="ss-dim hidden sm:inline">{de.ui.shards}: <b className="ss-num">{view.players[you].shards}</b></span>}
        <span className="ss-faint hidden lg:inline">Seed {view.seed}</span>
        <div className="ml-auto flex items-center gap-2">
          {game.mode === "online" && (game.connection === "connected" ? <Wifi size={15} className="ss-faint" aria-label="Verbunden" /> : <span className="flex items-center gap-1 text-[var(--wax-red-light)]"><WifiOff size={15} /> {de.ui.reconnecting}</span>)}
          {q.busy && <button type="button" className="ss-btn ss-btn-sm ss-btn-ghost min-h-[40px]" aria-label="Alle Animationen überspringen" onClick={q.skipAll} title="Alle Animationen überspringen"><FastForward size={14} /> <span className="hidden sm:inline">Alle überspringen</span></button>}
          {you !== null && phase !== "over" && (
            confirmSurrender ? (
              <span className="flex items-center gap-2 ss-paper px-2 py-1 text-xs">
                {de.ui.surrenderConfirm}
                <button type="button" className="ss-btn ss-btn-sm" onClick={() => { setConfirmSurrender(false); game.send({ type: "surrender" }); }}>{de.ui.surrender}</button>
                <button type="button" className="ss-btn ss-btn-sm" onClick={() => setConfirmSurrender(false)}>{de.ui.cancel}</button>
              </span>
            ) : (
              <button type="button" className="ss-btn ss-btn-sm ss-btn-ghost min-h-[40px]" onClick={() => setConfirmSurrender(true)} aria-label={de.ui.surrender} title={de.ui.surrender}><Flag size={14} /><span className="hidden sm:inline">{de.ui.surrender}</span></button>
            )
          )}
        </div>
      </div>}
      {/* Am neuen Tisch zeigt der Tisch selbst die Meldung (status) — sonst stünde sie doppelt da */}
      {game.notice && !tableMode && <div className="ss-toast ss-paper" role="status">{game.notice}</div>}

      {/* Der Tisch steht außerhalb des Phasen-Rahmens: er bleibt beim Wechsel Draft → Totem-Wahl → Kampf stehen */}
      {tableMode && (
        <Suspense fallback={<p className="text-center ss-dim py-20">Der Tisch wird gedeckt …</p>}>
          <TableHost zirkel={zirkelTheme} oppMask={oppMask} oppAway={oppAway} oppCrown={!!table?.oppCrown} oppCracked={!!table?.oppCracked} onFallback={() => setTableFailed(true)}>
            {(room) => (phase === "draft" ? (
              <TableDraft room={room} {...common} timers={game.timers} clockOffset={game.clockOffset} status={tableStatus} onFallback={() => setTableFailed(true)} />
            ) : phase === "extras" ? (
              <TableExtras room={room} {...common} timers={game.timers} clockOffset={game.clockOffset} status={tableStatus} onFallback={() => setTableFailed(true)} />
            ) : phase === "path" && !pathScene ? (
              <TableMap room={room} view={view} you={you} send={game.send} names={names} timers={game.timers} clockOffset={game.clockOffset} status={tableStatus} onFallback={() => setTableFailed(true)} />
            ) : phase === "path" ? (
              <TableScene room={room} view={view} you={you} send={game.send} names={names} timers={game.timers} clockOffset={game.clockOffset} status={tableStatus} onFallback={() => setTableFailed(true)} />
            ) : phase === "interlude" ? (
              <TableInterlude room={room} {...common} timers={game.timers} clockOffset={game.clockOffset} status={tableStatus} onFallback={() => setTableFailed(true)} />
            ) : phase === "over" ? (
              <TableResult room={room} view={view} you={you} names={names} onRematch={game.lobby?.rematch} onExit={onExit} rematchState={game.room}
                status={tableStatus} onFallback={() => setTableFailed(true)} />
            ) : q.display ? (
              <TableBattle room={room} {...common} display={q.display} anim={q.anim} timers={game.timers} clockOffset={game.clockOffset} skipAll={q.skipAll} rush={q.rush}
                status={tableStatus} onFallback={() => setTableFailed(true)}
                aiManners={game.mode === "local"} gesture={game.gesture} onGesture={game.sendGesture} pauseExtra={pauseExtra} run={table} />
            ) : null)}
          </TableHost>
        </Suspense>
      )}
      {/* Neu pro Phase: blendet nach dem Wechsel weich ein, während der 3D-Tisch die Kamera umsetzt */}
      <div key={phase} ref={phaseRef} className="ss-phase">
      {phase === "draft" && !tableMode && <DraftScreen {...common} timers={game.timers} clockOffset={game.clockOffset} />}
      {phase === "extras" && !tableMode && <ExtrasScreen {...common} timers={game.timers} clockOffset={game.clockOffset} />}
      {phase === "battle" && q.display && !tableMode && (
        <BattleScreen {...common} display={q.display} anim={q.anim} hold={q.hold} timers={game.timers} clockOffset={game.clockOffset} hintExtra={extra} onAction={onBattleAction} />
      )}
      {phase === "path" && !tableMode && <PathScreen {...common} timers={game.timers} clockOffset={game.clockOffset} events={game.batches} />}
      {/* Ergebnis einer Pfad-Szene (neue Karte, verbrannt …) als kurzes Papierbanner — am Tisch wie auf dem Pergament */}
      {pathAtTable && <PathResultBanner events={game.batches} you={you} />}
      {phase === "interlude" && !tableMode && <InterludeScreen {...common} />}
      {phase === "over" && !tableMode && <ResultScreen {...common} onRematch={game.lobby?.rematch} onExit={onExit} rematchState={game.room} />}
      </div>
      {/* nach dem Rahmen, damit dessen ref beim Melden schon gesetzt ist */}
      {TABLE_STAGE[phase] && !tableMode && <TableStage stage={TABLE_STAGE[phase]} zirkel={zirkelTheme} anchor={phaseRef} />}
    </div>
  );
}
