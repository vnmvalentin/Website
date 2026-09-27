// ui/run/RunGame.jsx — laufende Moorwanderung: Fortschrittsleiste + der passende Bildschirm für die eigene Lage.
//
//   Startdecks → StarterScreen · eigener Kampf (NPC/Boss/Duell) → RunBattle · Pfad → RunPath · fertig → Lager
//   · Duellrunde ohne eigenes Duell → DuelBoard · Ende → RunResult
// Ein Kampf bleibt sichtbar, bis seine Schluss-Animation gelaufen ist, auch wenn der Server schon weiter ist.
import React, { useCallback, useEffect, useRef, useState } from "react";
import RunProgressBar from "./RunProgressBar.jsx";
import StarterScreen from "./StarterScreen.jsx";
import RunBattle from "./RunBattle.jsx";
import { RunPath, CampScreen, DuelBoard, RunResult, PublicCards } from "./RunScreens.jsx";
import BudgetWarning from "./BudgetWarning.jsx";
import { SealBreak, DuelAnnounce } from "./RunFx.jsx";
import { BIOMES } from "../../data/modes/moorwanderung/biomes.js";
import { sound } from "../../audio/sound.js";
import { useShell } from "../shellContext.js";
import "./run.css";

/** @param {{ game: any, onExit: () => void }} props */
export default function RunGame({ game, onExit }) {
  const view = game.view;
  const you = game.you;
  const { setTension } = useShell();
  const [battleBusy, setBattleBusy] = useState(false);
  const [shownKey, setShownKey] = useState(/** @type {string|null} */ (null));
  const [showPlayer, setShowPlayer] = useState(/** @type {number|null} */ (null));
  const liveKey = view?.battleInfo?.key || null;

  useEffect(() => {
    if (liveKey) setShownKey(liveKey);
    else if (!battleBusy) setShownKey(null);
  }, [liveKey, battleBusy]);

  // Farbthema des Zirkels (wie im Duellmodus)
  const zirkel = view?.settings?.zirkel || "moor";
  useEffect(() => {
    const el = document.querySelector(".ss-game");
    if (!el) return undefined;
    el.setAttribute("data-zirkel", zirkel);
    return () => el.removeAttribute("data-zirkel");
  }, [zirkel]);
  useEffect(() => () => setTension(0), [setTension]);

  // Große Momente aus den Ereignissen: Duell-Ankündigung, eigener Siegelbruch
  const [announce, setAnnounce] = useState(/** @type {any} */ (null));
  const [sealFx, setSealFx] = useState(/** @type {any} */ (null));
  const seenBatch = useRef(/** @type {any} */ (null));
  const lastBatch = game.batches[game.batches.length - 1];
  useEffect(() => {
    if (!lastBatch || seenBatch.current === lastBatch.id) return;
    const first = seenBatch.current === null;
    seenBatch.current = lastBatch.id;
    if (first && game.batches.length === 1 && !lastBatch.events.length) return;
    for (const e of lastBatch.events) {
      if (e.type === "duelsStart") setAnnounce({ pairs: e.pairs, round: e.round });
      else if (e.type === "duelEnd" && you !== null && e.loser === you) setSealFx({ left: e.seals, reason: "duel" });
      else if (e.type === "sealLost" && e.player === you) setSealFx({ left: e.seals, reason: e.reason });
    }
  }, [lastBatch, game.batches.length, you]);
  const endAnnounce = useCallback(() => setAnnounce(null), []);
  const endSealFx = useCallback(() => setSealFx(null), []);

  // Klangkulisse des aktuellen Bioms (bleibt während der Duellrunde bestehen)
  const biomeId = view?.path?.biome;
  useEffect(() => {
    const b = biomeId && BIOMES.find((x) => x.id === biomeId);
    if (b) sound.setBiome(b.ambient);
  }, [biomeId]);
  useEffect(() => () => sound.setBiome(null), []);

  const onBusy = useCallback((b) => setBattleBusy(b), []);
  const surrender = useCallback(() => { game.send({ type: "surrender" }); }, [game]);

  if (!view) return <p className="text-center ss-dim py-20">Der Tisch wird gedeckt …</p>;
  const me = you !== null ? view.players[you] : null;

  let content;
  if (shownKey) {
    content = <RunBattle game={game} battleKey={shownKey} onBusy={onBusy} onSurrender={surrender} />;
  } else if (view.phase === "over") {
    content = <RunResult game={game} onExit={onExit} />;
  } else if (view.phase === "starter") {
    content = <StarterScreen view={view} you={you} send={game.send} timers={game.timers} clockOffset={game.clockOffset} />;
  } else if (!me) {
    content = view.phase === "duels" ? <DuelBoard game={game} /> : <CampScreen game={game} spectator />;
  } else if (me && !me.alive) {
    content = view.phase === "duels" ? <DuelBoard game={game} /> : <CampScreen game={game} eliminated />;
  } else if (view.phase === "path" && view.path?.me && !view.path.me.done) {
    content = <RunPath game={game} />;
  } else if (view.phase === "duels") {
    content = <DuelBoard game={game} />;
  } else {
    content = <CampScreen game={game} />;
  }

  return (
    <div className="relative">
      {game.notice && <div className="ss-toast ss-paper" role="status">{game.notice}</div>}
      {!shownKey && <RunProgressBar view={view} you={you} timers={game.timers} clockOffset={game.clockOffset} onShowPlayer={setShowPlayer} />}
      {content}
      {view.phase === "path" && (
        <BudgetWarning timer={game.timers?.path} pathNo={view.pathNo} active={!!me?.alive && !!view.path?.me && !view.path.me.done} clockOffset={game.clockOffset} />
      )}
      {announce && <DuelAnnounce view={view} pairs={announce.pairs} round={announce.round} you={you} onDone={endAnnounce} />}
      {sealFx && !shownKey && !announce && <SealBreak left={sealFx.left} total={view.settings.seals} reason={sealFx.reason} onDone={endSealFx} />}
      {showPlayer !== null && <PublicCards view={view} q={showPlayer} onClose={() => setShowPlayer(null)} />}
    </div>
  );
}
