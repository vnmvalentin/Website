// RaceView.jsx — das eigentliche Rennen in einem Raum: Level erzeugen, auf den gemeinsamen Start
// warten, spielen, Checkpoints und Ziel melden.
//
// Alles läuft lokal: Der Server hat weder Level noch Physik. Jeder erzeugt dasselbe Level aus
// dem Seed (gen/generator.js), meldet dessen Hash (bei Abweichung wird er ausgeschlossen) und
// startet zum Zeitpunkt, den der Server vorgibt, umgerechnet in die eigene Uhr (clockSync.js).
// Gemessen wird in Sim-Ticks ab dem Startzeitpunkt — unabhängig von Bildrate und Ping.
//
// Alle spielen mit denselben Werten (die der Tempo-Klasse); das Dev-Panel der Testseite gibt es
// hier bewusst nicht.
import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createLevelWorld, BIOMES, levelFuerParams, weltParams } from "../gen/index.js";
import { pfadLevel } from "../client/generateWorldAsync.js";

import { stepWorld } from "../sim/world.js";
import { INPUT } from "../sim/inputBits.js";
import { FixedStepper } from "../client/loop.js";
import { createInput } from "../client/input.js";
import { createCamera, updateCamera, VIEW_W, VIEW_H } from "../client/camera.js";
import { createEventBus } from "../client/events.js";
import { drawFrame, fitCanvas } from "../client/render.js";
import { createJuice } from "../client/juice.js";
import { useSoundUnlock } from "../client/useSoundUnlock.js";
import { moveStartTo } from "../client/testStart.js";
import { createGhost, stepGhost } from "../client/ghost.js";
import { minimapTiles, renderMinimapTiles, minimapAusschnitt, drawMinimap, MINIMAP_BOX } from "../client/minimap.js";
import { getFx, subscribeFx } from "../client/fxSettings.js";
import { PLAYER_W, PLAYER_H } from "../sim/config.js";
import { projectStartPerf, freezeDisplayStart, countdownNumber } from "./countdown.js";
import { createInputLog } from "./inputLog.js";
import { formatTicks } from "./format.js";
import { ENGINE_FINGERPRINT, SIM_FINGERPRINT } from "../version.js";

const GO_FLASH_MS = 800;
// Breite des Spielfelds in CSS-Pixeln: doppelt so breit wie die interne Auflösung (VIEW_W = 480), damit
// jeder Weltpixel genau zwei Bildschirmpixel bekommt. Fest statt "so breit wie der Platz", siehe Render.
const RACE_MAX_W = 960;
// Wo die Minimap sitzt (Einstellung minimapEcke, client/fxSettings.js)
const MINIMAP_ECKE = {
  or: { top: 8, right: 8 },
  ol: { top: 8, left: 8 },
  ur: { bottom: 8, right: 8 },
  ul: { bottom: 8, left: 8 },
};

const Stat = ({ label, value }) => (
  <div className="px-4 py-2.5 min-w-0">
    <p className="text-[11px] uppercase tracking-wider text-white/35 mb-0.5">{label}</p>
    <p className="text-sm text-white tabular-nums truncate">{value}</p>
  </div>
);

/**
 * @param params       Level-Parameter der Runde { seed, length, speedClass, biome }
 * @param level        Fertiges Level statt `params` (Testspiel im Editor, eigene Level): wird nicht erzeugt, sondern gespielt
 * @param startTile    { tx, ty }: Start (und Neustart nach dem Tod) auf dieser Kachel statt am Levelstart — Testspiel ab Cursor
 * @param ghosts       [{ log, ticks, name, color }]: Geister, die ihr Log in einer eigenen Welt neben dem Spieler ablaufen (client/ghost.js)
 * @param roundNumber  Nummer der Runde (neue Runde = neues Level, auch bei gleichem Seed bei Revanche)
 * @param phase        Raumphase: loading | countdown | racing
 * @param startAt      Startzeitpunkt in SERVER-Zeit (ms) oder null
 * @param clock        Uhrenabgleich (clockSync.js)
 * @param epoch        Zählt (Wieder-)Beitritte; danach wird der Fortschritt erneut gesendet
 * @param frozen       Spieler hat aufgegeben: nichts mehr simulieren
 * @param meState      Zustand des Spielers im Raum (ready, racing, finished, dnf …)
 * @param finishNote   Text unter der Zielzeit (Standard: "die anderen laufen noch"; die Tagesseite ersetzt ihn)
 * @param waitNote     Text, solange der Spieler bereit ist und der Start aussteht (Standard: "Warte auf die anderen Spieler …")
 */
/**
 * Mantel um die Rennansicht (Phase D): Ein Pfad-Level (params.gen === 'pfad') braucht einige Sekunden — es entsteht im
 * Worker (client/generateWorldAsync.js, geteilt mit der Vorab-Erzeugung), bis dahin ein Platzhalter. Chunk-Level (v1) und
 * fertige Level wie bisher sofort. Die eigentliche Ansicht bekommt immer ein fertiges Level.
 */
export default function RaceView(props) {
  const { params, level: levelProp } = props;
  const pfad = !levelProp && !!params && !!weltParams(params);
  const [level, setLevel] = useState(() => levelProp || (params && !pfad ? levelFuerParams(params) : null));
  const [fehler, setFehler] = useState(null);
  useEffect(() => {
    if (levelProp) { setLevel(levelProp); return undefined; }
    if (!params) return undefined;
    if (!pfad) { setLevel(levelFuerParams(params)); return undefined; }
    let aktiv = true;
    setLevel(null);
    setFehler(null);
    pfadLevel(params).then((l) => { if (aktiv) setLevel(l); }, (e) => { if (aktiv) setFehler(e.message); });
    return () => { aktiv = false; };
  }, [levelProp, params?.seed, params?.length, params?.speedClass, params?.biome, params?.gen]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!level) {
    return (
      <div className="flex items-start gap-3">
        <div
          className="relative border border-white/10 rounded-md overflow-hidden bg-[#0b0b14] flex items-center justify-center"
          style={{ width: RACE_MAX_W, maxWidth: "100%", aspectRatio: `${VIEW_W} / ${VIEW_H}` }}
        >
          <p className="text-sm text-white/60">{fehler ? `Level konnte nicht erzeugt werden: ${fehler}` : "Level wird erzeugt …"}</p>
        </div>
      </div>
    );
  }
  return <RennAnsicht {...props} level={level} />;
}

function RennAnsicht({
  level: levelProp, startTile, ghosts, roundNumber, phase, startAt, clock, epoch, frozen, meState, finishNote, waitNote,
  onReady, onCheckpoint, onFinish, playerColor,
}) {
  const canvasRef = useRef(null);
  const minimapRef = useRef(null);
  const runRef = useRef(null);
  const debugMask = useRef(null);      // nur mit ?debug: Eingaben per Skript statt Tastatur (Tests)
  const [input] = useState(createInput);
  useSoundUnlock();
  // Anzeige-Einstellungen (Minimap, Figurenfarbe) — ändern sich auch während des Laufs, ohne ihn neu aufzusetzen
  const fx = useSyncExternalStore(subscribeFx, getFx, getFx);
  const [hud, setHud] = useState({ time: 0, cp: 0, deaths: 0, count: null, started: false, go: false, finished: null });

  // Das Level kommt fertig aus dem Mantel (RaceView oben) — derselbe Seed ergibt bei allen dasselbe Level
  const level = levelProp;
  // Aus dem Raster gezählt statt aus den Chunk-Placements: Eigene Level haben keine (sie sind kein Generator-Ergebnis)
  const checkpointTotal = useMemo(() => level.rows.reduce((n, row) => n + [...row].filter((c) => c === "C").length, 0), [level]);

  // Aktuelle Werte für die Schleife, ohne sie bei jeder Änderung neu aufzusetzen
  const live = useRef({});
  useEffect(() => {
    // (Figurenfarbe: im Raum die Raumfarbe, sonst die eigene Wahl aus den Einstellungen)
    live.current = { startAt, clock, frozen, phase, onReady, onCheckpoint, onFinish, fx, playerColor: playerColor || fx.farbe };
  });

  // ── Lauf aufsetzen: neue Welt pro Runde ───────────────────────────────────
  useEffect(() => {
    // Anzeige sofort zurücksetzen (der 100-ms-Takt würde sonst kurz die Werte der letzten Runde zeigen)
    setHud({ time: 0, cp: 0, deaths: 0, count: null, started: false, go: false, finished: null });
    const bus = createEventBus();
    const world = createLevelWorld(level, { emit: (type, data) => bus.emit(type, data) });
    if (startTile) moveStartTo(world, startTile.tx, startTile.ty);
    const run = {
      world,
      bus,
      log: createInputLog(),
      splits: [],
      finished: null,
      started: false,
      startPerf: null,
      goAt: 0,
      lastMask: 0,
      cam: createCamera(),
      stepper: new FixedStepper(),
      ghosts: (ghosts || []).map((g) => createGhost(level, g.log, g)),
      minimap: null,
      displayStartPerf: null,
    };
    // Einmal pro Level: das Kachelbild der Minimap (1 Pixel je Kachel) — pro Bild wird daraus nur noch ausgeschnitten,
    // siehe client/minimap.js
    run.minimap = { canvas: renderMinimapTiles(minimapTiles(world.map), BIOMES[level.biome]?.palette), w: world.map.w, h: world.map.h, groesse: '' };
    bus.on("checkpoint", (d) => {
      run.splits.push([d.index, d.tick]);
      live.current.onCheckpoint?.(d.index, d.tick);
    });
    // Effekte: hängen sich an die Ereignisse der Sim und verändern nichts an ihr
    const juice = createJuice({ biome: level.biome, palette: BIOMES[level.biome].palette });
    juice.setWorld(world);
    bus.onAny((data, type) => juice.handleEvent(data, type));
    run.juice = juice;
    run.lastCount = null;
    runRef.current = run;
    // Erst jetzt ist das Level da: Hash melden. Wer ein anderes Level erzeugt hat (z.B. alte Seite
    // im Tab), fällt dem Server dadurch auf und wird vor dem Start ausgeschlossen.
    live.current.onReady?.(level.hash, world.map.checkpoints.length);
    return () => {
      juice.dispose();
      if (runRef.current === run) runRef.current = null;
    };
  }, [level, roundNumber, startTile, ghosts]);

  // Messzugang für automatisierte Tests — nur mit ?debug in der Adresse, sonst existiert er gar nicht
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("debug")) return undefined;
    window.__seedRace = () => runRef.current;
    // Ein Skript liefert die Eingabemaske je Tick. Sie läuft durch dasselbe Log und dasselbe Nachspielen im Server
    // wie Tastendrücke — der Anti-Cheat kann sie nicht von einem Menschen unterscheiden und muss es nicht.
    window.__seedRaceInput = (fn) => { debugMask.current = fn; };
    return () => { delete window.__seedRace; delete window.__seedRaceInput; };
  }, []);

  // ── Eingabe ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    input.attach();
    return () => input.detach();
  }, [input]);

  // ── Hauptschleife ────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const palette = BIOMES[level.biome].palette;
    let raf = 0;
    let lastFrame = 0;

    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      const dt = lastFrame ? Math.min(0.1, (now - lastFrame) / 1000) : 1 / 60;
      lastFrame = now;
      const run = runRef.current;
      if (!run) return;
      const { startAt: at, clock: sync, frozen: stop } = live.current;

      input.beginFrame();

      // Startzeitpunkt in die eigene Uhr umrechnen: startPerf (der tatsächliche Auslöser) wird jedes Bild neu
      // aus der aktuell besten Uhrenmessung berechnet, displayStartPerf (die Grundlage der angezeigten Zahl)
      // dagegen einmalig eingefroren — siehe countdown.js für das Warum.
      if (!run.started && at != null && sync) {
        run.startPerf = projectStartPerf(now, at, sync);
        run.displayStartPerf = freezeDisplayStart(run.displayStartPerf, now, run.startPerf);
        if (now >= run.startPerf) {
          run.started = true;
          run.goAt = now;
          // Tick 0 liegt genau auf dem Startzeitpunkt, nicht auf dem ersten Bild danach — wer spät
          // dran ist (langsames Bild), holt die verpassten Ticks in diesem Bild nach.
          run.stepper.last = run.startPerf;
          run.stepper.acc = 0;
          run.juice.sound.play("go");
        }
      }

      if (run.started && !run.finished && !stop) {
        const ticks = run.stepper.advance(now);
        for (let i = 0; i < ticks; i++) {
          const typed = input.sampleTick();
          const mask = debugMask.current ? debugMask.current(run.world.tick) : typed;
          run.lastMask = mask;
          run.log.record(run.world.tick, mask);
          stepWorld(run.world, mask);
          for (const g of run.ghosts) stepGhost(g);
          if (run.world.finished) break;
        }
        if (run.world.finished && !run.finished) {
          run.finished = {
            ticks: run.world.finishTick,
            deaths: run.world.deaths,
            splits: run.splits.map((s) => s.slice()),
            log: run.log.toArray(),
            // Stand der Sim in diesem Browser: Der Server spielt den Lauf nur nach, wenn seiner derselbe ist. Ein eigenes
            // Level steckt komplett im Dokument, hängt also nur an der Physik (SIM); ein Seed-Level auch am Generator (ENGINE)
            fp: level.custom ? SIM_FINGERPRINT : ENGINE_FINGERPRINT,
          };
          live.current.onFinish?.(run.finished);
        }
      } else {
        input.sampleTick();   // gemerkte Tastendrücke verwerfen: Wer vor dem Start drückt, springt nicht sofort los
      }

      const p = run.world.player;
      const alpha = run.started && !run.finished && !stop ? run.stepper.alpha : 0;
      // Freeze-Frame (nach dem Tod): das Bild bleibt kurz stehen, die Sim läuft weiter
      if (run.juice.isFrozen(now)) return;
      updateCamera(run.cam, p.prevX + (p.x - p.prevX) * alpha, p.prevY + (p.y - p.prevY) * alpha, p, run.world.map, dt);
      run.juice.update(dt, run.world, run.cam);
      const scale = fitCanvas(canvas);
      drawFrame(ctx, scale, run.world, run.cam, alpha, {
        juice: run.juice,
        aim: {
          x: (run.lastMask & INPUT.RIGHT ? 1 : 0) - (run.lastMask & INPUT.LEFT ? 1 : 0),
          y: (run.lastMask & INPUT.DOWN ? 1 : 0) - (run.lastMask & INPUT.UP ? 1 : 0),
        },
        showWarps: false,
        palette,
        ghosts: run.ghosts,
        playerColor: live.current.playerColor,
      });

      const mm = minimapRef.current;
      const set = live.current.fx;
      if (run.minimap && mm && set.minimap !== "aus") {
        const box = MINIMAP_BOX[set.minimap] || MINIMAP_BOX.mittel;
        const aus = minimapAusschnitt(run.minimap.w, run.minimap.h, set.minimapAnsicht, box, p.x + PLAYER_W / 2, p.y + PLAYER_H / 2);
        // Canvas-Größe nur anfassen, wenn sie sich ändert (sonst würde jedes Bild den Inhalt leeren und neu anlegen)
        const dpr = window.devicePixelRatio || 1;
        const groesse = `${aus.dw}x${aus.dh}@${dpr}`;
        if (run.minimap.groesse !== groesse) {
          run.minimap.groesse = groesse;
          mm.width = Math.round(aus.dw * dpr);
          mm.height = Math.round(aus.dh * dpr);
          mm.style.width = `${aus.dw}px`;
          mm.style.height = "auto";          // Höhe folgt dem Seitenverhältnis — auch wenn maxWidth die Breite kappt
        }
        const players = [{ x: p.x + PLAYER_W / 2, y: p.y + PLAYER_H / 2, color: live.current.playerColor || "#ffffff", you: true }];
        for (const g of run.ghosts) {
          if (g.finished && g.world.finished) continue;
          players.push({ x: g.world.player.x + PLAYER_W / 2, y: g.world.player.y + PLAYER_H / 2, color: g.color });
        }
        drawMinimap(mm.getContext("2d"), run.minimap.canvas, aus, players);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [level, input]);

  // ── Nach Wiederverbinden: Fortschritt erneut senden ──────────────────────────
  // Während einer Trennung gehen Meldungen verloren. Der Server behandelt Wiederholungen als
  // harmlos (bekannter Checkpoint, bereits gemeldetes Ziel).
  useEffect(() => {
    const run = runRef.current;
    if (!run || epoch <= 1) return;
    for (const [index, tick] of run.splits) live.current.onCheckpoint?.(index, tick);
    if (run.finished) live.current.onFinish?.(run.finished);
  }, [epoch]);

  // ── Anzeige (10× pro Sekunde) ────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      const run = runRef.current;
      if (!run) return;
      const now = performance.now();
      const count = run.started ? null : countdownNumber(now, run.displayStartPerf);
      if (count !== null && count !== run.lastCount) run.juice.sound.play("tick");
      run.lastCount = count;
      setHud({
        time: run.finished ? run.finished.ticks : run.world.tick,
        cp: run.world.checkpointIndex,
        deaths: run.world.deaths,
        count,
        started: run.started,
        go: run.started && now - run.goAt < GO_FLASH_MS,
        finished: run.finished ? run.finished.ticks : null,
      });
    }, 100);
    return () => clearInterval(id);
  }, [level, roundNumber]);

  // Sobald der Lauf lokal gestartet ist, gehört das Spielfeld dem Spieler: Wartetexte kommen dann nicht
  // mehr zurück. Der Server schaltet seine Phase erst mit der nächsten Zustandsnachricht von "countdown"
  // auf "racing" — ohne diese Sperre blitzte "Gleich geht's los …" nach dem LOS-Blitz noch einmal auf.
  let overlay = null;
  if (hud.finished !== null) overlay = { big: formatTicks(hud.finished), small: finishNote || "Im Ziel — die anderen laufen noch" };
  else if (meState === "dnf") overlay = { big: "Aufgegeben", small: "Du siehst die Rangliste rechts" };
  else if (hud.count !== null) overlay = { big: String(hud.count) };
  else if (hud.go) overlay = { big: "LOS" };
  else if (hud.started) overlay = null;
  else if (phase === "loading") overlay = { small: meState === "ready" ? (waitNote || "Warte auf die anderen Spieler …") : "Level wird erzeugt …" };
  else if (phase === "countdown") overlay = { small: "Gleich geht's los …" };

  return (
    <div className="flex items-start gap-3">
      {/* Feste Spielfeldbreite (RACE_MAX_W): Das Bild soll zwischen Runden, Seiten und Fenstergrößen
          gleich groß bleiben — nur wenn der Platz wirklich nicht reicht, wird es kleiner. */}
      <div
        className="relative border border-white/10 rounded-md overflow-hidden bg-[#0b0b14]"
        style={{ width: RACE_MAX_W, maxWidth: "100%", aspectRatio: `${VIEW_W} / ${VIEW_H}` }}
      >
        <canvas ref={canvasRef} className="block w-full h-full" />
        <canvas
          ref={minimapRef}
          className="absolute pointer-events-none"
          style={{ ...(MINIMAP_ECKE[fx.minimapEcke] || MINIMAP_ECKE.or), display: fx.minimap === "aus" ? "none" : "block", maxWidth: "45%" }}
          aria-hidden="true"
        />
        {overlay && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none bg-black/35">
            {overlay.big && <p className="font-display font-bold text-white tabular-nums text-6xl md:text-7xl">{overlay.big}</p>}
            {overlay.small && <p className="text-white/70 text-sm mt-2">{overlay.small}</p>}
          </div>
        )}
      </div>

      {/* Zeit/Checkpoint stehen neben dem Spielfeld, nicht darunter: Der Blick bleibt auf Augenhöhe
          mit dem Geschehen, und das Bild rutscht nicht, wenn eine Zahl breiter wird. */}
      <div className="w-[136px] shrink-0 bg-[#0d0d14] border border-white/10 rounded-md divide-y divide-white/10">
        <Stat label="Zeit" value={formatTicks(hud.time)} />
        <Stat label="Checkpoint" value={`${hud.cp} / ${checkpointTotal}`} />
        <Stat label="Tode" value={hud.deaths} />
      </div>
    </div>
  );
}
