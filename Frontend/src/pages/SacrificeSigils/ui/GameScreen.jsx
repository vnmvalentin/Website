// ui/GameScreen.jsx — Rahmen eines laufenden Matches: Animations-Queue, Effekte (Sound, Partikel, Shake, Spannung)
// und Umschaltung zwischen den Phasen (Draft, Extras, Kampf, Pfad, Rast, Ergebnis).
import React, { useCallback, useEffect, useState } from "react";
import { FastForward, Wifi, WifiOff } from "lucide-react";
import { useAnimationQueue } from "./anim/useAnimationQueue.js";
import { EVENT_TIMING } from "./anim/timing.js";
import { particles, centerOf } from "./anim/particles.js";
import { usePrefs } from "./prefs.js";
import { useShell } from "./shellContext.js";
import { sound } from "../audio/sound.js";
import { de } from "../i18n/de.js";
import BattleScreen from "./battle/BattleScreen.jsx";
import DraftScreen from "./screens/DraftScreen.jsx";
import ExtrasScreen from "./screens/ExtrasScreen.jsx";
import PathScreen from "./path/PathScreen.jsx";
import InterludeScreen from "./screens/InterludeScreen.jsx";
import ResultScreen from "./screens/ResultScreen.jsx";

/**
 * @param {{ game: any, extra?: any, onBattleAction?: (a: any) => void, onExit?: () => void }} props
 */
export default function GameScreen({ game, extra, onBattleAction, onExit }) {
  const prefs = usePrefs();
  const { shake, setTension } = useShell();
  const you = game.you;

  const onEvent = useCallback((ev, stage, display) => {
    const t = EVENT_TIMING[ev.type];
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
          const bowl = centerOf(`[data-anchor="blood-${ev.player}"]`);
          if (bowl) particles.fly("blood", c, bowl, 650);
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
        const c = at(ev.uid);
        if (c) particles.burst("ink", c.x, c.y);
        break;
      }
      case "overflow": {
        // Tusche spritzt weiter: zur Hinterreihe-Karte oder zur Waage
        const lane = centerOf(`[data-slot="${ev.player}:${ev.fromZone}:${ev.lane}"]`);
        const to = ev.to ? at(ev.to) : centerOf('[data-anchor="scale"]');
        if (lane && to) particles.fly("blood", lane, to, 520);
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
      case "burn":
      case "candle": {
        const s = centerOf('[data-anchor="scale"]');
        if (s) particles.burst("ember", s.x, s.y);
        break;
      }
      default:
        break;
    }
  }, [shake, setTension, you]);

  const q = useAnimationQueue(game.batches, { speed: prefs.speed, reduced: prefs.reduceMotion, onEvent });

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
  const view = q.view;
  if (!view) return <p className="text-center ss-dim py-20">Der Tisch wird gedeckt …</p>;
  const names = view.players.map((p) => p.name);
  const phase = view.phase;
  const common = { view, you, send: game.send, names, busy: q.busy };

  return (
    <div
      className="relative"
      onPointerDownCapture={(e) => {
        // Klick überspringt laufende Animationen (Knöpfe ausgenommen)
        if (q.busy && !(e.target instanceof Element && e.target.closest("button, input, select, a"))) q.skip();
      }}
    >
      <div className="max-w-[1400px] mx-auto px-3 pt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="ss-title text-[var(--candle)]">{de.phases[phase]}{phase === "battle" && view.battle ? ` ${view.battleNo}` : ""}</span>
        <span className="ss-dim">
          {names[0]} <b className="ss-num text-[var(--bone)]">{view.wins[0]}</b> : <b className="ss-num text-[var(--bone)]">{view.wins[1]}</b> {names[1]}
          <span className="ss-faint"> · {view.settings.winsNeeded} {view.settings.winsNeeded === 1 ? de.ui.win : de.ui.wins} nötig</span>
        </span>
        {you !== null && <span className="ss-dim">{de.ui.shards}: <b className="ss-num">{view.players[you].shards}</b></span>}
        <span className="ss-faint">Seed {view.seed}</span>
        <div className="ml-auto flex items-center gap-2">
          {game.mode === "online" && (game.connection === "connected" ? <Wifi size={15} className="ss-faint" aria-label="Verbunden" /> : <span className="flex items-center gap-1 text-[var(--wax-red-light)]"><WifiOff size={15} /> {de.ui.reconnecting}</span>)}
          {q.busy && <button type="button" className="ss-btn ss-btn-sm ss-btn-ghost" onClick={q.skip} title="Animationen überspringen"><FastForward size={14} /> Überspringen</button>}
          {you !== null && phase !== "over" && (
            confirmSurrender ? (
              <span className="flex items-center gap-2 ss-paper px-2 py-1 text-xs">
                {de.ui.surrenderConfirm}
                <button type="button" className="ss-btn ss-btn-sm" onClick={() => { setConfirmSurrender(false); game.send({ type: "surrender" }); }}>{de.ui.surrender}</button>
                <button type="button" className="ss-btn ss-btn-sm" onClick={() => setConfirmSurrender(false)}>{de.ui.cancel}</button>
              </span>
            ) : (
              <button type="button" className="ss-btn ss-btn-sm ss-btn-ghost" onClick={() => setConfirmSurrender(true)}>{de.ui.surrender}</button>
            )
          )}
        </div>
      </div>
      {game.notice && <div className="ss-toast ss-paper" role="status">{game.notice}</div>}

      {phase === "draft" && <DraftScreen {...common} timers={game.timers} clockOffset={game.clockOffset} />}
      {phase === "extras" && <ExtrasScreen {...common} timers={game.timers} clockOffset={game.clockOffset} />}
      {phase === "battle" && q.display && (
        <BattleScreen {...common} display={q.display} anim={q.anim} timers={game.timers} clockOffset={game.clockOffset} hintExtra={extra} onAction={onBattleAction} />
      )}
      {phase === "path" && <PathScreen {...common} timers={game.timers} clockOffset={game.clockOffset} events={game.batches} />}
      {phase === "interlude" && <InterludeScreen {...common} />}
      {phase === "over" && <ResultScreen {...common} onRematch={game.lobby?.rematch} onExit={onExit} rematchState={game.room} />}
    </div>
  );
}
