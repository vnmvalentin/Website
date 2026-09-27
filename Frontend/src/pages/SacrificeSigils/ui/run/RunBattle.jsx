// ui/run/RunBattle.jsx — eigener Kampf der Moorwanderung (NPC, Boss, Duell) über den normalen Kampfbildschirm.
//
// Die Run-Sicht wird für GameScreen in eine Duellmodus-Sicht übersetzt ({ phase: "battle", battle, players, … });
// die Ereignisse jeder Charge werden auf diesen Kampf (ctx-Schlüssel) gefiltert. Endet der Kampf, liefert der Server
// schon die nächste Sicht ohne Kampf – dann wird die letzte bekannte Sicht mit „vorbei“ fortgeschrieben, damit die
// Schluss-Animation noch sauber abläuft, bevor RunGame auf den nächsten Bildschirm wechselt.
import React, { useMemo, useState } from "react";
import { Flag } from "lucide-react";
import GameScreen from "../GameScreen.jsx";
import Seals from "./Seals.jsx";
import { opponentName } from "./names.js";
import { de } from "../../i18n/de.js";

/**
 * @param {any} rv Run-Sicht mit battle/battleInfo @param {number} you Run-Spieler
 */
function adaptView(rv, you) {
  const info = rv.battleInfo;
  const seat = info.seat;
  const players = info.seats.map((q, i) => (i === seat
    ? { name: rv.players[you].name, totems: rv.players[you].totems, shards: rv.players[you].shards ?? 0 }
    : { name: opponentName(rv, info, seat), shards: 0 }));
  return {
    phase: "battle",
    battle: rv.battle,
    battleNo: rv.round,
    seed: rv.seed,
    settings: { ...rv.settings, winsNeeded: 1, turnTimer: 0 },
    wins: [0, 0],
    players,
    runInfo: info,
  };
}

/**
 * @param {{ game: any, battleKey: string, onBusy: (b: boolean) => void, onSurrender: () => void }} props
 */
export default function RunBattle({ game, battleKey, onBusy, onSurrender }) {
  const you = game.you;
  const [confirm, setConfirm] = useState(false);
  // Sitz im Kampf: aus der letzten Charge, die diesen Kampf enthielt
  const { batches, seat, info, latest } = useMemo(() => {
    const out = [];
    let last = null;
    let lastInfo = null;
    for (const b of game.batches) {
      const rv = b.view;
      const evs = b.events.filter((e) => e.ctx === battleKey);
      if (rv.battleInfo?.key === battleKey && rv.battle) {
        last = adaptView(rv, you);
        lastInfo = rv.battleInfo;
        out.push({ id: b.id, view: last, events: evs });
      } else if (last && evs.length) {
        const end = evs.find((e) => e.type === "battleEnd");
        const view = end ? { ...last, battle: { ...last.battle, phase: "over", winner: end.winner, scale: end.scale } } : last;
        out.push({ id: b.id, view, events: evs });
        last = view;
      }
    }
    return { batches: out, seat: lastInfo?.seat ?? 0, info: lastInfo, latest: last };
  }, [game.batches, battleKey, you]);

  const timers = useMemo(() => {
    if (!info) return {};
    const t = {};
    if (info.kind === "duel") info.seats.forEach((q, i) => { if (q !== null && game.timers?.players?.[q]) t[i] = game.timers.players[q]; });
    else if (game.timers?.path) t[0] = game.timers.path;
    return t;
  }, [info, game.timers]);

  const adapted = useMemo(() => ({
    ...game,
    you: seat,
    view: latest,
    batches,
    timers,
    lobby: {},
    setBusy: (b) => { onBusy(b); game.setBusy?.(b); },
  }), [game, seat, latest, batches, timers, onBusy]);

  if (!latest || !info) return null;
  const rv = game.view;
  const me = rv.players[you];
  const oppSeat = info.seats[1 - seat];
  const title = info.kind === "duel" ? `${de.run.duels} ${rv.round}` : info.kind === "boss" ? "Pfad-Boss" : info.kind === "elite" ? "Elite-Kampf" : "Kampf";
  const bar = (
    <div className="ss-gamebar max-w-[1760px] mx-auto px-3 flex flex-nowrap items-center gap-x-4 text-sm">
      <span className="ss-title text-[var(--candle)] whitespace-nowrap">{title}</span>
      <span className="ss-dim truncate">gegen <b className="text-[var(--bone)]">{latest.players[1 - seat].name}</b></span>
      <span className="hidden sm:inline-flex items-center gap-2"><Seals left={me.seals} total={rv.settings.seals} size={15} />{oppSeat !== null && oppSeat !== undefined && <><span className="ss-faint">·</span><Seals left={rv.players[oppSeat].seals} total={rv.settings.seals} size={15} /></>}</span>
      <div className="ml-auto flex items-center gap-2">
        {confirm ? (
          <span className="flex items-center gap-2 ss-paper px-2 py-1 text-xs">
            Den ganzen Run aufgeben?
            <button type="button" className="ss-btn ss-btn-sm" onClick={() => { setConfirm(false); onSurrender(); }}>{de.ui.surrender}</button>
            <button type="button" className="ss-btn ss-btn-sm" onClick={() => setConfirm(false)}>{de.ui.cancel}</button>
          </span>
        ) : (
          <button type="button" className="ss-btn ss-btn-sm ss-btn-ghost min-h-[40px]" onClick={() => setConfirm(true)} aria-label={de.ui.surrender} title={de.ui.surrender}><Flag size={14} /><span className="hidden sm:inline">{de.ui.surrender}</span></button>
        )}
      </div>
    </div>
  );
  return <GameScreen key={battleKey} game={adapted} bar={bar} />;
}
