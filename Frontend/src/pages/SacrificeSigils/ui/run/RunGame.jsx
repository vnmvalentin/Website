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
import { TableStage } from "../battle/table3d/tableStage.js";
import { useAtTable } from "../table/useAtTable.js";
import RunTablePath from "./RunTablePath.jsx";
import TableStarter from "./TableStarter.jsx";
import TableCamp from "./TableCamp.jsx";
import { TableDuelAnnounce, TableSealBreak } from "./TableRunFx.jsx";
import TableRunResult from "./TableRunResult.jsx";
import { zaehleMoorwanderung } from "../../kontoStand.js";
import "./run.css";

/** @param {{ game: any, onExit: () => void }} props */
export default function RunGame({ game, onExit }) {
  const view = game.view;
  const you = game.you;
  const { setTension } = useShell();
  // Am Tisch im Kerzenlicht (Phase 6): alles läuft am Tisch — Startdeck, Pfad, Kämpfe, Lager mit Blick auf die
  // Nachbartische, Duell-Ankündigung, Siegelbruch, Ende mit Podest. Ausweichweg: die bisherigen Bildschirme.
  const [atTable, tableFallback] = useAtTable();
  const [battleBusy, setBattleBusy] = useState(false);
  const phaseRef = useRef(/** @type {HTMLDivElement|null} */ (null));
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

  // Statistik am Konto: eine beendete Moorwanderung einmal zählen (je Seed), mit dem eigenen Platz
  const eigenerPlatz = you !== null && you !== undefined ? view?.players?.[you]?.place ?? null : null;
  useEffect(() => {
    if (view?.phase !== "over" || you === null || you === undefined) return;
    zaehleMoorwanderung({ seed: view.seed, platz: eigenerPlatz });
  }, [view?.phase, view?.seed, eigenerPlatz, you]);

  if (!view) return <p className="text-center ss-dim py-20">Der Tisch wird gedeckt …</p>;
  const me = you !== null ? view.players[you] : null;

  let content;
  // Ansicht des 3D-Tischs: Kampf und Pfad melden sich selbst, alles andere hier
  let kind = "camp";
  if (atTable && announce) {
    // Am Tisch: erst werden die Paarungen auf den Tisch gelegt, dann setzt sich das Gegenüber zum eigenen Duell
    content = <TableDuelAnnounce view={view} pairs={announce.pairs} round={announce.round} you={you} onDone={endAnnounce} onFallback={tableFallback} />;
    kind = "announce";
  } else if (shownKey) {
    content = <RunBattle game={game} battleKey={shownKey} onBusy={onBusy} onSurrender={surrender} />;
    kind = "battle";
  } else if (view.phase === "over") {
    content = atTable ? <TableRunResult game={game} onExit={onExit} onFallback={tableFallback} /> : <RunResult game={game} onExit={onExit} />;
    kind = "over";
  } else if (view.phase === "starter") {
    content = atTable ? <TableStarter game={game} onFallback={tableFallback} />
      : <StarterScreen view={view} you={you} send={game.send} timers={game.timers} clockOffset={game.clockOffset} />;
    kind = "starter";
  } else if (!me) {
    content = atTable ? <TableCamp game={game} how="spectator" onFallback={tableFallback} />
      : view.phase === "duels" ? <DuelBoard game={game} /> : <CampScreen game={game} spectator />;
  } else if (me && !me.alive) {
    content = atTable ? <TableCamp game={game} how="eliminated" onFallback={tableFallback} />
      : view.phase === "duels" ? <DuelBoard game={game} /> : <CampScreen game={game} eliminated />;
  } else if (view.phase === "path" && view.path?.me && !view.path.me.done) {
    content = atTable ? <RunTablePath game={game} onFallback={tableFallback} /> : <RunPath game={game} />;
    kind = "path";
  } else if (atTable) {
    // Lager (Pfad beendet) und Duellrunde ohne eigenes Duell: allein am Tisch, Zettel für die Nachbartische
    content = <TableCamp game={game} how="camp" onFallback={tableFallback} />;
  } else if (view.phase === "duels") {
    content = <DuelBoard game={game} />;
  } else {
    content = <CampScreen game={game} />;
  }

  return (
    <div className="relative">
      {game.notice && <div className="ss-toast ss-paper" role="status">{game.notice}</div>}
      {!shownKey && !atTable && <RunProgressBar view={view} you={you} timers={game.timers} clockOffset={game.clockOffset} onShowPlayer={setShowPlayer} />}
      <div key={kind} ref={phaseRef} className="ss-phase">{content}</div>
      {kind !== "battle" && kind !== "path" && !atTable && <TableStage stage={kind === "starter" ? "draft" : "rest"} zirkel={zirkel} anchor={phaseRef} />}
      {view.phase === "path" && (
        <BudgetWarning timer={game.timers?.path} pathNo={view.pathNo} active={!!me?.alive && !!view.path?.me && !view.path.me.done} clockOffset={game.clockOffset} />
      )}
      {announce && !atTable && <DuelAnnounce view={view} pairs={announce.pairs} round={announce.round} you={you} onDone={endAnnounce} />}
      {sealFx && !shownKey && !announce && (atTable
        ? <TableSealBreak left={sealFx.left} total={view.settings.seals} reason={sealFx.reason} onDone={endSealFx} />
        : <SealBreak left={sealFx.left} total={view.settings.seals} reason={sealFx.reason} onDone={endSealFx} />)}
      {showPlayer !== null && <PublicCards view={view} q={showPlayer} onClose={() => setShowPlayer(null)} />}
    </div>
  );
}
