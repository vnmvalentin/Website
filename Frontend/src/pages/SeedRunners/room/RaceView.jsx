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
import { Maximize2, Minimize2 } from "lucide-react";
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
import TouchControls, { TOUCH_LEISTE_PX } from "../client/TouchControls.jsx";
import FxSettingsButton from "../client/FxSettingsButton.jsx";
import { istTouchGeraet, onTouchGeraet } from "../client/touchInput.js";
import { PLAYER_W, PLAYER_H, TICK_HZ } from "../sim/config.js";
import { projectStartPerf, freezeDisplayStart, countdownNumber } from "./countdown.js";
import { createInputLog } from "./inputLog.js";
import { formatTicks } from "./format.js";
import { ENGINE_FINGERPRINT, SIM_FINGERPRINT } from "../version.js";

const GO_FLASH_MS = 800;
// Breite des Spielfelds in CSS-Pixeln: doppelt so breit wie die interne Auflösung (VIEW_W = 480), damit
// jeder Weltpixel genau zwei Bildschirmpixel bekommt. Fest statt "so breit wie der Platz", siehe Render.
const RACE_MAX_W = 960;
// Spielbildschirm am Rechner (Bühne, siehe unten „Vollbild“): Höhe der Spielleiste, Breite der Seitenspalte (Rangliste
// im Raum) und ab welcher Fensterbreite sie neben das Bild passt. Das Bild wächst höchstens auf das Vierfache der
// internen Auflösung — darüber kostet der Canvas nur noch Rechenzeit.
const BUEHNE_LEISTE_PX = 46;
const BUEHNE_PANEL_PX = 316;
const BUEHNE_PANEL_AB = 1280;
const BUEHNE_MAX_W = 1920;
// Wo die Minimap sitzt (Einstellung minimapEcke, client/fxSettings.js)
const MINIMAP_ECKE = {
  or: { top: 8, right: 8 },
  ol: { top: 8, left: 8 },
  ur: { bottom: 8, right: 8 },
  ul: { bottom: 8, left: 8 },
};

const Stat = ({ label, value }) => (
  <div className="px-3 md:px-4 py-2.5 min-w-0">
    <p className="text-[11px] uppercase tracking-wider text-white/35 mb-0.5">{label}</p>
    <p className="text-sm text-white tabular-nums truncate">{value}</p>
  </div>
);

/** Ein Wert in der Spielleiste der Bühne; `breite` hält die Leiste ruhig, wenn die Zahl läuft */
const HudWert = ({ label, value, breite }) => (
  <span className="flex items-baseline gap-1.5">
    <span className="sr-label">{label}</span>
    <span className="sr-num sr-ink text-[17px]" style={breite ? { minWidth: breite } : undefined}>{value}</span>
  </span>
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
 *
 * Mehrspieler (27.09.2026, alle optional):
 * @param onPosition   ({ x, y, f, t }) etwa 10× pro Sekunde, solange der eigene Lauf läuft — für Geister/Zuschauer der anderen
 * @param remote       Positionen der anderen (room/remoteRunners.js)
 * @param runners      [{ id, name, color }] die anderen, die gerade laufen — als Geister gezeigt, wenn fx.geister an ist
 * @param spectate     { id, name, color } oder null: Die Kamera folgt diesem Läufer statt der eigenen Figur
 * @param watchOnly    nur zuschauen (kam zu spät o. Ä.): kein eigener Lauf, keine Eingaben
 * @param deadline     { label, at } — Serverzeit, zu der die Runde endet (Zeitjagd) bzw. die DNF-Frist abläuft
 * @param extraStats   [{ label, value }] zusätzliche Anzeigen neben dem Spielfeld (z. B. Versuch und Bestzeit der Zeitjagd)
 * @param hardcore     Hardcore-Runde (30.09.2026): Beim ersten Tod hält der Lauf sofort an und meldet sich einmal über onDeath;
 *                     „Zum Checkpoint“ ist gesperrt (sonst ließe sich ein Sturz in Spikes oder Abgrund kurz vorher wegdrücken)
 * @param onDeath      () => void — nur mit hardcore; nach einem Wiederverbinden erneut
 *
 * Spielbildschirm am Rechner (12.10.2026, alle optional):
 * @param vollbild     Der laufende Lauf füllt den Bildschirm (Bühne mit Spielleiste) — für die Spielseiten (Raum, Tagesrennen,
 *                     Level); Werkzeuge (Editor, Werkbank) lassen es weg. Abschaltbar in den Einstellungen (fx.vollbild)
 * @param panel        Seitenspalte der Bühne auf breiten Fenstern (im Raum: Rangliste und Knöpfe)
 * @param hudActions   Knöpfe in der Spielleiste der Bühne (z. B. „Neu starten“)
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

// So oft geht die eigene Position an den Server (Geister, Zuschauen); er bündelt ohnehin auf 10 pro Sekunde
const POSITION_EVERY_MS = 100;
// Aufholen der Zuschauer-Welt: höchstens so viele Sim-Ticks pro Bild (≈ 15 µs je Tick), damit das Bild nicht stockt
const SPECTATE_CATCHUP_TICKS = 600;

/** Stand-in für den beobachteten Läufer: nur die Felder, die drawFrame/updateCamera lesen */
function zuschauFigur(base, s) {
  return {
    ...base, x: s.x, y: s.y, prevX: s.x, prevY: s.y, vx: s.vx, vy: 0, facing: s.facing, grapple: null, gd: 1, dashCharges: 1,
  };
}

/** Restzeit bis `at` (Serverzeit) als m:ss */
function restText(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function RennAnsicht({
  level: levelProp, startTile, ghosts, roundNumber, phase, startAt, clock, epoch, frozen, meState, finishNote, waitNote,
  onReady, onCheckpoint, onFinish, playerColor,
  onPosition, remote, runners, spectate, watchOnly = false, deadline, extraStats, hardcore = false, onDeath,
  vollbild = false, panel = null, hudActions = null,
}) {
  const canvasRef = useRef(null);
  const minimapRef = useRef(null);
  const runRef = useRef(null);
  const debugMask = useRef(null);      // nur mit ?debug: Eingaben per Skript statt Tastatur (Tests)
  const [input] = useState(createInput);
  useSoundUnlock();
  // Anzeige-Einstellungen (Minimap, Figurenfarbe) — ändern sich auch während des Laufs, ohne ihn neu aufzusetzen
  const fx = useSyncExternalStore(subscribeFx, getFx, getFx);
  const [hud, setHud] = useState({ time: 0, cp: 0, deaths: 0, count: null, started: false, go: false, finished: null, rest: null, dead: false });
  // Handy (Finger als Hauptbedienung): Der Lauf füllt den Bildschirm, darüber liegen die Touch-Knöpfe — siehe unten „Vollbild“
  const [touch, setTouch] = useState(istTouchGeraet);
  useEffect(() => onTouchGeraet(setTouch), []);
  const [hochkant, setHochkant] = useState(() => typeof window !== "undefined" && window.innerHeight > window.innerWidth);
  useEffect(() => {
    const messen = () => setHochkant(window.innerHeight > window.innerWidth);
    window.addEventListener("resize", messen);
    return () => window.removeEventListener("resize", messen);
  }, []);
  const [breit, setBreit] = useState(() => typeof window !== "undefined" && window.innerWidth >= BUEHNE_PANEL_AB);
  useEffect(() => {
    const messen = () => setBreit(window.innerWidth >= BUEHNE_PANEL_AB);
    window.addEventListener("resize", messen);
    return () => window.removeEventListener("resize", messen);
  }, []);
  const [vollZu, setVollZu] = useState(false);     // Vollbild von Hand verlassen (gilt bis zum Ende dieses Laufs)

  // Das Level kommt fertig aus dem Mantel (RaceView oben) — derselbe Seed ergibt bei allen dasselbe Level
  const level = levelProp;
  // Aus dem Raster gezählt statt aus den Chunk-Placements: Eigene Level haben keine (sie sind kein Generator-Ergebnis)
  const checkpointTotal = useMemo(() => level.rows.reduce((n, row) => n + [...row].filter((c) => c === "C").length, 0), [level]);

  // Aktuelle Werte für die Schleife, ohne sie bei jeder Änderung neu aufzusetzen
  const live = useRef({});
  useEffect(() => {
    // (Figurenfarbe: im Raum die Raumfarbe, sonst die eigene Wahl aus den Einstellungen)
    live.current = {
      startAt, clock, frozen: frozen || watchOnly, phase, onReady, onCheckpoint, onFinish, fx, playerColor: playerColor || fx.farbe,
      onPosition, remote, runners, spectate, watchOnly, deadline, hardcore, onDeath,
    };
  });

  // ── Lauf aufsetzen: neue Welt pro Runde ───────────────────────────────────
  useEffect(() => {
    // Anzeige sofort zurücksetzen (der 100-ms-Takt würde sonst kurz die Werte der letzten Runde zeigen)
    setHud({ time: 0, cp: 0, deaths: 0, count: null, started: false, go: false, finished: null, rest: null, dead: false });
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
      lastPosAt: 0,
      spec: null,          // Zuschauen: eigene Welt, die im Takt des Beobachteten mitläuft (Elemente bewegen sich)
      dead: false,         // Hardcore: gestorben — der Lauf ist vorbei
    };
    // Einmal pro Level: das Kachelbild der Minimap (1 Pixel je Kachel) — pro Bild wird daraus nur noch ausgeschnitten,
    // siehe client/minimap.js
    run.minimap = { canvas: renderMinimapTiles(minimapTiles(world.map), BIOMES[level.biome]?.palette), w: world.map.w, h: world.map.h, groesse: '' };
    bus.on("checkpoint", (d) => {
      run.splits.push([d.index, d.tick]);
      live.current.onCheckpoint?.(d.index, d.tick);
    });
    bus.on("death", () => {
      if (!live.current.hardcore || run.dead) return;
      run.dead = true;
      live.current.onDeath?.();
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
    if (!live.current.watchOnly) live.current.onReady?.(level.hash, world.map.checkpoints.length);
    return () => {
      juice.dispose();
      if (runRef.current === run) runRef.current = null;
    };
  }, [level, roundNumber, startTile, ghosts]);

  // Messzugang für automatisierte Tests — nur mit ?debug in der Adresse, sonst existiert er gar nicht
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("debug")) return undefined;
    window.__seedRace = () => runRef.current;
    window.__seedRaceLive = () => live.current;   // Props der Ansicht (Geister, Zuschauen) für Tests
    // Ein Skript liefert die Eingabemaske je Tick. Sie läuft durch dasselbe Log und dasselbe Nachspielen im Server
    // wie Tastendrücke — der Anti-Cheat kann sie nicht von einem Menschen unterscheiden und muss es nicht.
    window.__seedRaceInput = (fn) => { debugMask.current = fn; };
    return () => { delete window.__seedRace; delete window.__seedRaceInput; delete window.__seedRaceLive; };
  }, []);

  // ── Eingabe ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    input.attach();
    return () => input.detach();
  }, [input]);

  // Während des Rennens drücken Leertaste und Enter keine Knöpfe der Seite: Nach dem Schließen des Fensters „Steuerung“ (oder
  // einem Klick auf „Runde starten“) liegt der Fokus auf einem Knopf — eine gerade nicht belegte Leertaste öffnete dann das
  // Fenster mitten im Lauf wieder. In einem offenen Fenster (Dialog, Einstellungen) bleibt die Tastatur normal bedienbar.
  useEffect(() => {
    const onKey = (e) => {
      if (e.code !== "Space" && e.code !== "Enter" && e.code !== "NumpadEnter") return;
      if (live.current.phase !== "racing" && live.current.phase !== "countdown") return;
      const el = e.target;
      if (!el || !el.closest || !el.closest("button, a, [role='button']") || el.closest("[role='dialog'], [aria-expanded='true'], [data-sr-popup]")) return;
      e.preventDefault();
      el.blur();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

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

      if (run.started && !run.finished && !run.dead && !stop) {
        const ticks = run.stepper.advance(now);
        for (let i = 0; i < ticks; i++) {
          const typed = input.sampleTick();
          const roh = debugMask.current ? debugMask.current(run.world.tick) : typed;
          // (Hardcore: die Taste kommt gar nicht erst ins Log — der Server wiese den Lauf sonst ab)
          const mask = live.current.hardcore ? roh & ~INPUT.RESTART : roh;
          run.lastMask = mask;
          run.log.record(run.world.tick, mask);
          stepWorld(run.world, mask);
          for (const g of run.ghosts) stepGhost(g);
          if (run.world.finished || run.dead) break;
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

      const L = live.current;
      // Eigene Position für Geister und Zuschauer der anderen — nur während der eigene Lauf wirklich läuft
      if (run.started && !run.finished && !stop && L.onPosition && now - run.lastPosAt >= POSITION_EVERY_MS) {
        run.lastPosAt = now;
        const me = run.world.player;
        L.onPosition({ x: Math.round(me.x), y: Math.round(me.y), f: me.facing < 0 ? -1 : 1, t: run.world.tick });
      }

      // Zuschauen: Die Kamera folgt einem anderen Läufer. Dessen Welt läuft als eigene Kopie im Takt seiner Sim-Ticks mit
      // (Plattformen, Sägen und Laser stehen dann dort, wo er sie gerade sieht); seine Figur kommt aus den Positionen.
      const target = L.spectate && L.remote ? L.remote.sample(L.spectate.id, now) : null;
      let view = run.world;
      let viewCam = run.cam;
      let viewColor = L.playerColor;
      if (target) {
        if (!run.spec || run.spec.id !== L.spectate.id || run.spec.attempt !== target.attempt || target.tick < run.spec.world.tick - TICK_HZ * 2) {
          run.spec = { id: L.spectate.id, attempt: target.attempt, world: createLevelWorld(level), cam: run.spec?.cam || createCamera() };
        }
        const sw = run.spec.world;
        const soll = Math.floor(target.tick);
        for (let n = 0; sw.tick < soll && n < SPECTATE_CATCHUP_TICKS; n++) stepWorld(sw, 0);
        const figur = zuschauFigur(sw.player, target);
        view = { ...sw, player: figur, checkpointIndex: 0, flags: { ...sw.flags, keys: 0 } };
        viewCam = run.spec.cam;
        viewColor = L.spectate.color;
      } else if (run.spec && !L.spectate) {
        run.spec = null;
      }

      // Geister der anderen (Einstellung "Geister"): der Beobachtete ist die Hauptfigur und fehlt deshalb hier
      const geister = run.ghosts.slice();
      if (L.fx.geister && L.remote && L.runners) {
        for (const r of L.runners) {
          if (L.spectate && r.id === L.spectate.id) continue;
          const s = L.remote.sample(r.id, now);
          if (!s) continue;
          geister.push({ world: { player: { x: s.x, y: s.y, prevX: s.x, prevY: s.y }, finished: false }, name: r.name, color: r.color, finished: false, remote: true });
        }
      }

      const p = view.player;
      const alpha = !target && run.started && !run.finished && !stop ? run.stepper.alpha : 0;
      // Freeze-Frame (nach dem Tod): das Bild bleibt kurz stehen, die Sim läuft weiter
      if (!target && run.juice.isFrozen(now)) return;
      updateCamera(viewCam, p.prevX + (p.x - p.prevX) * alpha, p.prevY + (p.y - p.prevY) * alpha, p, view.map, dt);
      run.juice.update(dt, run.world, viewCam);
      const scale = fitCanvas(canvas);
      drawFrame(ctx, scale, view, viewCam, alpha, {
        juice: run.juice,
        aim: target ? { x: 0, y: 0 } : {
          x: (run.lastMask & INPUT.RIGHT ? 1 : 0) - (run.lastMask & INPUT.LEFT ? 1 : 0),
          y: (run.lastMask & INPUT.DOWN ? 1 : 0) - (run.lastMask & INPUT.UP ? 1 : 0),
        },
        showWarps: false,
        palette,
        ghosts: geister,
        playerColor: viewColor,
        // (vom Beobachteten kennt man weder Luftsprünge noch Dash-Ladungen — lieber keine Anzeige als eine falsche)
        hidePips: !!target,
        // Wer nur zuschaut und niemanden gewählt hat, sieht das Level ohne eigene Figur
        hidePlayer: !target && L.watchOnly,
      });

      const mm = minimapRef.current;
      const set = L.fx;
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
        const players = L.watchOnly && !target ? [] : [{ x: p.x + PLAYER_W / 2, y: p.y + PLAYER_H / 2, color: viewColor || "#ffffff", you: true }];
        for (const g of geister) {
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
    if (run.dead) live.current.onDeath?.();
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
        // Restzeit (Zeitjagd) bzw. DNF-Frist: Serverzeit über den Uhrenabgleich in die eigene Uhr
        rest: live.current.deadline?.at && live.current.clock ? live.current.clock.toLocal(live.current.deadline.at) - Date.now() : null,
        dead: run.dead,
      });
    }, 100);
    return () => clearInterval(id);
  }, [level, roundNumber]);

  // ── Vollbild ─────────────────────────────────────────────────────────────────
  // Solange der eigene Lauf läuft (ab dem Countdown, bis Ziel/Tod/Aufgabe), liegt das Spielfeld fest über der ganzen Seite.
  // Danach kommt die Seite von selbst zurück (Zeit, Rangliste, „Nochmal“). Dasselbe DOM-Element wechselt nur seine
  // Klassen — die Schleife hält den Canvas fest, er darf nicht neu entstehen.
  //  · Handy (voll): Im Querformat passte das Bild sonst nie zusammen mit Kopfleiste und Rangliste auf den Bildschirm, und
  //    die Touch-Knöpfe brauchen die Ecken.
  //  · Rechner (buehne): wie ein eigenes Spiel — oben eine schmale Spielleiste (Zeit, Checkpoint, Tode, Einstellungen),
  //    darunter das Bild so groß, wie es passt; auf breiten Fenstern daneben die Seitenspalte (panel).
  const aktiv = !watchOnly && !frozen && (hud.count !== null || hud.started) && hud.finished === null && !hud.dead && meState !== "dnf";
  const laeuft = touch && aktiv;
  const voll = laeuft && !vollZu;
  const buehneMoeglich = !touch && vollbild && fx.vollbild && aktiv;
  const buehne = buehneMoeglich && !vollZu;
  const mitPanel = buehne && breit && !!panel;
  useEffect(() => { if (!aktiv) setVollZu(false); }, [aktiv]);
  useEffect(() => {
    if (!voll && !buehne) return undefined;
    const vorher = document.body.style.overflow;
    document.body.style.overflow = "hidden";       // die Seite darunter scrollt nicht mit
    return () => { document.body.style.overflow = vorher; };
  }, [voll, buehne]);
  // Querformat: Die Leiste liegt über dem Bild — eine Minimap in einer oberen Ecke rückt darunter
  const minimapEcke = MINIMAP_ECKE[fx.minimapEcke] || MINIMAP_ECKE.or;
  const minimapOrt = voll && !hochkant && minimapEcke.top !== undefined ? { ...minimapEcke, top: TOUCH_LEISTE_PX } : minimapEcke;

  // Sobald der Lauf lokal gestartet ist, gehört das Spielfeld dem Spieler: Wartetexte kommen dann nicht
  // mehr zurück. Der Server schaltet seine Phase erst mit der nächsten Zustandsnachricht von "countdown"
  // auf "racing" — ohne diese Sperre blitzte "Gleich geht's los …" nach dem LOS-Blitz noch einmal auf.
  let overlay = null;
  if (spectate || watchOnly) overlay = null;
  else if (hud.finished !== null) overlay = { big: formatTicks(hud.finished), small: finishNote || "Im Ziel — die anderen laufen noch" };
  else if (hardcore && hud.dead) overlay = { big: "Ausgeschieden", small: "Hardcore: Ein Tod beendet die Runde" };
  else if (meState === "dnf") overlay = { big: "Aufgegeben", small: "Du siehst die Rangliste rechts" };
  else if (hud.count !== null) overlay = { big: String(hud.count) };
  else if (hud.go) overlay = { big: "LOS" };
  else if (hud.started) overlay = null;
  else if (phase === "loading") overlay = { small: meState === "ready" ? (waitNote || "Warte auf die anderen Spieler …") : "Level wird erzeugt …" };
  else if (phase === "countdown") overlay = { small: "Gleich geht's los …" };

  return (
    // (schmale Bildschirme: die Anzeige rutscht unter das Bild, statt es zusammenzuquetschen)
    <div className="flex flex-col md:flex-row items-start gap-3">
      {/* Feste Spielfeldbreite (RACE_MAX_W): Das Bild soll zwischen Runden, Seiten und Fenstergrößen
          gleich groß bleiben — nur wenn der Platz wirklich nicht reicht, wird es kleiner. */}
      <div
        className={voll
          ? `fixed inset-0 z-50 bg-black flex justify-center ${hochkant ? "items-start" : "items-center"}`
          : buehne
            ? "fixed inset-0 z-50 grid"
            : "relative border border-white/10 rounded-md overflow-hidden bg-[#0b0b14]"}
        style={voll
          ? { touchAction: "none", paddingTop: hochkant ? TOUCH_LEISTE_PX : 0 }
          : buehne
            ? { gridTemplateColumns: "minmax(0, 1fr) auto", gridTemplateRows: `${BUEHNE_LEISTE_PX}px minmax(0, 1fr)`, background: "var(--sr-sunk, #07070c)" }
            : { width: RACE_MAX_W, maxWidth: "100%", aspectRatio: `${VIEW_W} / ${VIEW_H}` }}
        data-testid={voll ? "race-vollbild" : buehne ? "race-buehne" : undefined}
      >
        {/* Spielleiste der Bühne (Rechner). Steht immer an dieser Stelle im Baum — das Bild darunter behält so seinen Platz
            und entsteht beim Umschalten nicht neu. */}
        {buehne && (
          <header
            className="relative z-10 grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-3"
            style={{ gridColumn: "1 / -1", background: "var(--sr-bg)", borderBottom: "1px solid var(--sr-line)" }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={() => setVollZu(true)}
                className="sr-btn sr-btn-sm sr-btn-ghost"
                title="Vollbild verlassen — der Lauf läuft weiter"
              >
                <Minimize2 size={14} /><span className="hidden lg:inline">Fenster</span>
              </button>
              {hudActions}
            </div>
            <div className="flex items-center gap-5 whitespace-nowrap">
              <HudWert label="Zeit" value={formatTicks(hud.time)} breite="5.2em" />
              <HudWert label="Checkpoint" value={`${hud.cp} / ${checkpointTotal}`} />
              <HudWert label="Tode" value={hud.deaths} />
              {(extraStats || []).map((st) => <HudWert key={st.label} label={st.label} value={st.value} />)}
              {deadline && hud.rest !== null && <HudWert label={deadline.label} value={restText(hud.rest)} />}
            </div>
            <div className="flex items-center justify-end gap-2">
              <FxSettingsButton />
            </div>
          </header>
        )}
        {/* Das Bild selbst: im Vollbild so groß, wie es bei 16:9 in den Bildschirm passt */}
        <div
          key="bild"
          className={voll || buehne ? "relative overflow-hidden bg-[#0b0b14]" : "relative w-full h-full"}
          style={voll
            ? { width: `min(100vw, calc((100dvh - ${hochkant ? TOUCH_LEISTE_PX : 0}px) * ${VIEW_W} / ${VIEW_H}))`, aspectRatio: `${VIEW_W} / ${VIEW_H}` }
            : buehne
              ? {
                gridColumn: 1, gridRow: 2, placeSelf: "center", aspectRatio: `${VIEW_W} / ${VIEW_H}`,
                width: `min(100vw - ${mitPanel ? BUEHNE_PANEL_PX : 0}px, (100dvh - ${BUEHNE_LEISTE_PX}px) * ${VIEW_W} / ${VIEW_H}, ${BUEHNE_MAX_W}px)`,
              }
              : undefined}
        >
        <canvas ref={canvasRef} className="block w-full h-full" />
        <canvas
          ref={minimapRef}
          className="absolute pointer-events-none"
          style={{ ...minimapOrt, display: fx.minimap === "aus" ? "none" : "block", maxWidth: "45%" }}
          aria-hidden="true"
        />
        {(spectate || watchOnly) && (
          <div className="absolute left-2 bottom-2 pointer-events-none bg-black/60 px-2.5 py-1.5 rounded-[3px] text-xs text-white/85 flex items-center gap-2">
            {spectate && <span className="w-2.5 h-2.5 rounded-[2px] shrink-0" style={{ background: spectate.color }} />}
            {spectate ? <span>Du schaust <span className="text-white font-semibold">{spectate.name}</span> zu</span> : <span>Du schaust zu — wähle rechts in der Rangliste einen Läufer</span>}
          </div>
        )}
        {overlay && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none bg-black/35">
            {overlay.big && <p className="font-display font-bold text-white tabular-nums text-6xl md:text-7xl">{overlay.big}</p>}
            {overlay.small && <p className="text-white/70 text-sm mt-2 px-3 text-center">{overlay.small}</p>}
          </div>
        )}
        {((laeuft && !voll) || (buehneMoeglich && !buehne)) && (
          <button
            type="button"
            onClick={() => setVollZu(false)}
            className="absolute left-2 bottom-2 flex items-center gap-1.5 bg-black/70 border border-white/25 rounded-[3px] px-2.5 py-1.5 text-xs font-semibold text-white"
          >
            <Maximize2 size={13} />{touch ? "Vollbild mit Touch-Steuerung" : "Vollbild"}
          </button>
        )}
        </div>
        {mitPanel && (
          <aside
            className="overflow-y-auto p-3"
            style={{ gridColumn: 2, gridRow: 2, width: BUEHNE_PANEL_PX, borderLeft: "1px solid var(--sr-line)", background: "var(--sr-bg)" }}
          >
            {panel}
          </aside>
        )}
        {voll && (
          <TouchControls
            hardcore={hardcore}
            onClose={() => setVollZu(true)}
            anzeige={(
              <p className="bg-black/50 rounded-[3px] px-2.5 py-1 text-xs text-white/90 tabular-nums whitespace-nowrap truncate">
                {formatTicks(hud.time)}
                <span className="text-white/45"> · CP </span>{hud.cp}/{checkpointTotal}
                <span className="text-white/45"> · Tode </span>{hud.deaths}
                {deadline && hud.rest !== null && <><span className="text-white/45"> · </span>{restText(hud.rest)}</>}
              </p>
            )}
          />
        )}
      </div>

      {/* Zeit/Checkpoint stehen neben dem Spielfeld, nicht darunter: Der Blick bleibt auf Augenhöhe
          mit dem Geschehen, und das Bild rutscht nicht, wenn eine Zahl breiter wird. */}
      <div className="w-full md:w-[136px] shrink-0 bg-[#0d0d14] border border-white/10 rounded-md grid grid-cols-3 md:block md:divide-y divide-white/10">
        <Stat label="Zeit" value={formatTicks(hud.time)} />
        <Stat label="Checkpoint" value={`${hud.cp} / ${checkpointTotal}`} />
        <Stat label="Tode" value={hud.deaths} />
        {(extraStats || []).map((st) => <Stat key={st.label} label={st.label} value={st.value} />)}
        {deadline && hud.rest !== null && <Stat label={deadline.label} value={restText(hud.rest)} />}
      </div>
    </div>
  );
}
