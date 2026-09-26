// SeedRunnersTestPage.jsx — Entwicklungsseite: Movement-Prototyp (Phase 1) und Level-Generator (Phase 2).
//
// Zwei Modi:
//   Testkarte    handgebaute Karte mit einem Abschnitt pro Fähigkeit
//   Zufallslevel aus Seed, Länge, Tempo-Klasse und Biom erzeugt — bei allen mit denselben
//                Eingaben identisch (das ist später die Grundlage der Multiplayer-Runden)
//
// Kein Multiplayer. Ein Dev-Panel erlaubt, alle Werte aus sim/config.js live zu verstellen. Die Seite
// ist nicht in der Navigation verlinkt und für Suchmaschinen gesperrt.
//
// Aufbau pro Bild: Gamepad lesen → so viele Sim-Ticks rechnen, wie seit dem letzten Bild fällig
// sind (FixedStepper) → Kamera nachführen → zeichnen. Die Sim kennt nur Ticks; der Bildschirmtakt
// beeinflusst deshalb weder Sprunghöhe noch Rennzeit.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Copy, Check, RotateCcw, Gamepad2, Dices, CalendarDays } from "lucide-react";
import SEO from "../../components/SEO";
import SandboxTabs from "./SandboxTabs.jsx";
import { TICK_HZ, TUNING, TUNING_SPEC, PLAYER_W, PLAYER_H, TILE } from "./sim/config.js";
import { INPUT } from "./sim/inputBits.js";
import { createWorld, stepWorld, warpPlayer, resetRun } from "./sim/world.js";
import { createTestMap } from "./sim/testMap.js";
import { SPEED_CLASSES, SPEED_CLASS_IDS, classValues } from "./sim/classes.js";
import { generateLevel, createLevelWorld, normalizeParams, dailyParams, validateLevel, BIOMES, BIOME_IDS, LENGTHS } from "./gen/index.js";
import { FixedStepper } from "./client/loop.js";
import { createInput, keyLabel } from "./client/input.js";
import { ACTIONS } from "./client/inputLatch.js";
import { createCamera, updateCamera, VIEW_W, VIEW_H } from "./client/camera.js";
import { createEventBus } from "./client/events.js";
import { drawFrame, fitCanvas } from "./client/render.js";
import { createJuice } from "./client/juice.js";
import FxPanel from "./client/FxPanel.jsx";
import { useSoundUnlock } from "./client/useSoundUnlock.js";
import TuningPanel from "./client/TuningPanel.jsx";

const TUNING_STORAGE_KEY = "seedrunners_tuning";
const PAGE_STORAGE_KEY = "seedrunners_page";

// Werte, die eine Tempo-Klasse steuert: Wechselt die Klasse, gelten sie nicht mehr als eigene Anpassung
const CLASS_KEYS = Object.keys(classValues("normal"));

const LENGTH_LABELS = { short: "Kurz (~1 min)", medium: "Mittel (~3 min)", long: "Lang (~5–8 min)" };

// Eigene Anpassungen der Werte (nur Abweichungen vom Standard). Beim Laden wird jeder auf seinen
// Slider-Bereich geklemmt, damit ein alter Eintrag nach einer Config-Änderung nichts Unbrauchbares liefert.
function loadOverrides() {
  try {
    const raw = JSON.parse(localStorage.getItem(TUNING_STORAGE_KEY) || "null");
    if (!raw || typeof raw !== "object") return {};
    const out = {};
    for (const [key, spec] of Object.entries(TUNING_SPEC)) {
      const v = raw[key];
      if (typeof v === "number" && Number.isFinite(v)) out[key] = Math.min(spec.max, Math.max(spec.min, v));
    }
    return out;
  } catch {
    return {};
  }
}

function saveOverrides(values) {
  try {
    localStorage.setItem(TUNING_STORAGE_KEY, JSON.stringify(values));
  } catch { /* Speicher gesperrt: Werte gelten nur bis zum Neuladen */ }
}

function loadPage() {
  try {
    const raw = JSON.parse(localStorage.getItem(PAGE_STORAGE_KEY) || "null");
    if (raw && typeof raw === "object") {
      return { mode: raw.mode === "level" ? "level" : "test", params: normalizeParams(raw.params) };
    }
  } catch { /* ignorieren */ }
  return { mode: "test", params: normalizeParams({ seed: "seed-runners", length: "short", speedClass: "normal", biome: "random" }) };
}

function savePage(mode, params) {
  try {
    localStorage.setItem(PAGE_STORAGE_KEY, JSON.stringify({ mode, params }));
  } catch { /* ignorieren */ }
}

// Nur für die Oberfläche (Würfeln-Knopf): Die Level-Erzeugung selbst nutzt nie Math.random.
function randomSeed() {
  const buf = new Uint32Array(2);
  crypto.getRandomValues(buf);
  return (buf[0].toString(36) + buf[1].toString(36)).slice(0, 8);
}

// Kalendertag in Berlin — derselbe Schlüssel wie das Backend (Backend/dle/core/dailySeed.js)
function berlinDateKey() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/** Baut Welt und (bei Zufallslevel) Level. Werte: Klasse, dann eigene Anpassungen obendrauf. */
function buildWorld(mode, params, overrides, bus) {
  const emit = (type, data) => bus.emit(type, data);
  if (mode === "level") {
    const level = generateLevel(params);
    const world = createLevelWorld(level, { tuning: { ...classValues(level.params.speedClass), ...overrides }, emit });
    return { world, level, palette: BIOMES[level.biome].palette };
  }
  return { world: createWorld(createTestMap(), { tuning: overrides, emit }), level: null, palette: undefined };
}

function createSession() {
  const bus = createEventBus();
  const page = loadPage();
  const overrides = loadOverrides();
  const built = buildWorld(page.mode, page.params, overrides, bus);
  const juice = createJuice({ biome: built.level?.biome, palette: built.palette });
  juice.setWorld(built.world);
  bus.onAny((data, type) => juice.handleEvent(data, type));
  return { bus, juice, ...built, input: createInput(), cam: createCamera(), lastEvent: "", overrides, mode: page.mode, params: page.params };
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, "0")}`;
}

function describeState(p) {
  if (p.dashTimer > 0) return "Dash";
  if (p.grapple) return "Grapple";
  if (p.clinging) return "Klebt";
  if (p.sliding) return "Wandrutschen";
  if (p.gd < 0) return p.onGround ? "Decke" : "Kopfüber";
  return p.onGround ? "Boden" : "Luft";
}

// Welcher Chunk liegt unter dem Spieler? (Nur Anzeige für die Entwicklung)
function chunkAt(level, tx) {
  if (!level) return null;
  let found = level.placements[0];
  for (const p of level.placements) {
    if (p.x0 <= tx) found = p;
    else break;
  }
  return found;
}

function readHud(session) {
  const { world, level } = session;
  const p = world.player;
  const chunk = chunkAt(level, Math.floor((p.x + PLAYER_W / 2) / TILE));
  return {
    time: (world.finished ? world.finishTick : world.tick) / TICK_HZ,
    finished: world.finished,
    deaths: world.deaths,
    checkpoint: world.checkpointIndex,
    checkpointTotal: world.map.checkpoints.length,
    speed: Math.round(Math.hypot(p.vx, p.vy)),
    state: describeState(p),
    lastEvent: session.lastEvent,
    chunk: chunk ? `${chunk.index + 1}/${level.placements.length}  ${chunk.id}` : null,
  };
}

const Stat = ({ label, value }) => (
  <div className="px-4 py-2.5 min-w-0">
    <p className="text-[11px] uppercase tracking-wider text-white/35 mb-0.5">{label}</p>
    <p className="text-sm text-white tabular-nums truncate">{value}</p>
  </div>
);

const fieldClass = "w-full bg-black/40 border border-white/10 rounded-md px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none transition-colors";

const Field = ({ label, children }) => (
  <label className="block min-w-0">
    <span className="block text-[11px] uppercase tracking-wider text-white/35 mb-1.5">{label}</span>
    {children}
  </label>
);

export default function SeedRunnersTestPage() {
  const canvasRef = useRef(null);
  useSoundUnlock();
  const [session] = useState(createSession);
  const [mode, setMode] = useState(session.mode);
  const [params, setParams] = useState(session.params);
  const [seedDraft, setSeedDraft] = useState(session.params.seed);
  const [levelInfo, setLevelInfo] = useState(() => describeLevel(session.level));
  const [tuning, setTuning] = useState(() => ({ ...session.world.cfg }));
  const [hud, setHud] = useState(() => readHud(session));
  const [bindings, setBindings] = useState(() => session.input.getBindings());
  const [rebinding, setRebinding] = useState(null);
  const [copied, setCopied] = useState("idle"); // idle | done | failed

  // ── Welt neu aufbauen (Modus, Seed, Länge, Klasse oder Biom haben sich geändert) ─────────────
  const rebuild = useCallback((nextMode, nextParams, { classChanged = false } = {}) => {
    // Eigene Anpassungen der klassengesteuerten Werte fallen weg, sonst würde "Schnell" von einem
    // Slider-Wert aus "Normal" überstimmt
    if (classChanged) {
      for (const key of CLASS_KEYS) delete session.overrides[key];
      saveOverrides(session.overrides);
    }
    const built = buildWorld(nextMode, nextParams, session.overrides, session.bus);
    session.world = built.world;
    session.level = built.level;
    session.palette = built.palette;
    session.juice.setBiome(built.level?.biome, built.palette);
    session.juice.setWorld(built.world);
    session.mode = nextMode;
    session.params = nextParams;
    session.cam.ready = false;
    session.lastEvent = "";
    setMode(nextMode);
    setParams(nextParams);
    setSeedDraft(nextParams.seed);
    setLevelInfo(describeLevel(built.level));
    setTuning({ ...built.world.cfg });
    savePage(nextMode, nextParams);
  }, [session]);

  const changeMode = (next) => {
    if (next === mode) return;
    rebuild(next, params, { classChanged: true });
  };

  const changeParam = (key, value) => {
    const next = normalizeParams({ ...params, [key]: value });
    rebuild("level", next, { classChanged: key === "speedClass" });
  };

  const applySeed = () => {
    const seed = seedDraft.trim() || "0";
    if (seed !== params.seed) changeParam("seed", seed);
  };

  const rollSeed = () => changeParam("seed", randomSeed());
  // Der Tages-Seed legt Länge, Klasse und Biom fest: Alle sollen dasselbe Level bekommen
  const loadDaily = () => rebuild("level", dailyParams(berlinDateKey()), { classChanged: true });

  // ── Hauptschleife ────────────────────────────────────────────────────────
  useEffect(() => {
    const { input, cam } = session;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const stepper = new FixedStepper();
    input.attach();

    let raf = 0;
    let lastFrame = 0;
    let lastMask = 0;

    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      // Kamera und Anzeige laufen mit echter Bildzeit; nach einer Pause nicht mehr als 100 ms
      const dt = lastFrame ? Math.min(0.1, (now - lastFrame) / 1000) : 1 / 60;
      lastFrame = now;

      const { world } = session;   // kann zwischen zwei Bildern durch "neu erzeugen" ausgetauscht werden
      input.beginFrame();
      const ticks = stepper.advance(now);
      for (let i = 0; i < ticks; i++) {
        lastMask = input.sampleTick();
        stepWorld(world, lastMask);
      }

      const p = world.player;
      const alpha = stepper.alpha;
      if (session.juice.isFrozen(now)) return;   // Freeze-Frame: das Bild bleibt kurz stehen
      updateCamera(
        cam,
        p.prevX + (p.x - p.prevX) * alpha,
        p.prevY + (p.y - p.prevY) * alpha,
        p,
        world.map,
        dt,
      );
      session.juice.update(dt, world, cam);
      const scale = fitCanvas(canvas);
      drawFrame(ctx, scale, world, cam, alpha, {
        juice: session.juice,
        aim: {
          x: (lastMask & INPUT.RIGHT ? 1 : 0) - (lastMask & INPUT.LEFT ? 1 : 0),
          y: (lastMask & INPUT.DOWN ? 1 : 0) - (lastMask & INPUT.UP ? 1 : 0),
        },
        showWarps: session.mode === "test",
        palette: session.palette,
      });
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      input.detach();
    };
  }, [session]);

  // ── Anzeige und Ereignisprotokoll (10× pro Sekunde, nicht pro Bild) ─────────
  useEffect(() => {
    const off = session.bus.onAny((data, type) => {
      session.lastEvent = `${type}  ·  Tick ${data.tick}`;
    });
    const id = setInterval(() => setHud(readHud(session)), 100);
    return () => {
      off();
      clearInterval(id);
    };
  }, [session]);

  // Messzugang für automatisierte Tests — nur mit ?debug in der Adresse, sonst existiert er gar nicht
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("debug")) window.__seedRunners = session;
    return () => { delete window.__seedRunners; };
  }, [session]);

  // ── Dev-Werkzeuge: Warp per Ziffer (Testkarte), Bild hoch/runter (Chunks), Strg+Klick ────────
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.repeat) return;
      const { world, level } = session;
      if (session.mode === "test" && e.code.startsWith("Digit")) {
        const spot = world.map.warps[e.code.slice(5)];
        if (spot) warpPlayer(world, spot.x, spot.y);
      } else if (level && (e.code === "PageUp" || e.code === "PageDown")) {
        e.preventDefault();
        const here = chunkAt(level, Math.floor((world.player.x + PLAYER_W / 2) / TILE));
        const target = level.placements[Math.max(0, Math.min(level.placements.length - 1, here.index + (e.code === "PageDown" ? 1 : -1)))];
        warpPlayer(world, (target.x0 + 1) * TILE + 3, (target.dy + target.entry) * TILE - PLAYER_H);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [session]);

  const onCanvasClick = useCallback((e) => {
    if (!e.ctrlKey) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const wx = session.cam.x + ((e.clientX - rect.left) / rect.width) * VIEW_W;
    const wy = session.cam.y + ((e.clientY - rect.top) / rect.height) * VIEW_H;
    warpPlayer(session.world, wx - PLAYER_W / 2, wy - PLAYER_H / 2);
  }, [session]);

  // ── Werte ──────────────────────────────────────────────────────────────────
  const changeTuning = useCallback((key, value) => {
    session.world.cfg[key] = value; // die Sim liest ihre Werte live aus world.cfg
    // Gleicht der Wert dem, was Standard bzw. Klasse ohnehin ergeben, ist es keine Anpassung
    const base = session.mode === "level" && CLASS_KEYS.includes(key)
      ? classValues(session.params.speedClass)[key]
      : TUNING[key];
    if (value === base) delete session.overrides[key];
    else session.overrides[key] = value;
    saveOverrides(session.overrides);
    setTuning((prev) => ({ ...prev, [key]: value }));
  }, [session]);

  const resetTuning = () => {
    session.overrides = {};
    saveOverrides({});
    rebuild(mode, params);
  };

  const copyTuning = async () => {
    const lines = Object.entries(TUNING_SPEC)
      .filter(([key]) => tuning[key] !== TUNING[key])
      .map(([key, spec]) => `${key}: ${tuning[key]}   // Standard: ${spec.value}`);
    const text = lines.length
      ? `// Geänderte Werte. In sim/config.js (TUNING_SPEC) je Eintrag "value" ersetzen:\n${lines.join("\n")}`
      : "// Keine Werte geändert.";
    try {
      await navigator.clipboard.writeText(text);
      setCopied("done");
    } catch {
      setCopied("failed");
    }
    setTimeout(() => setCopied("idle"), 2000);
  };

  // ── Steuerung umbelegen ──────────────────────────────────────────────────────
  const startRebind = (actionId) => {
    setRebinding(actionId);
    session.input.rebind(actionId, (next) => {
      setBindings(next);
      setRebinding(null);
    });
  };

  const toggleRebind = (actionId) => {
    if (rebinding === actionId) {
      session.input.cancelRebind();
      setRebinding(null);
    } else {
      startRebind(actionId);
    }
  };

  const resetBindings = () => {
    session.input.cancelRebind();
    setRebinding(null);
    setBindings(session.input.resetBindings());
  };

  const speedInfo = useMemo(() => SPEED_CLASSES[params.speedClass], [params.speedClass]);

  return (
    <div className="page-fade w-full max-w-7xl mx-auto px-2 md:px-4 py-8 md:py-12">
      <SEO
        title="Seed Runners: Entwicklung"
        description="Interner Testbereich für Spielerbewegung und Level-Generator von Seed Runners."
        path="/seed-runners/test"
        noindex
      />

      <SandboxTabs />

      <div className="mb-6">
        <p className="text-xs font-bold uppercase tracking-widest text-violet-300/80 mb-2">Übungsbereich · Elemente und Level-Generator</p>
        <h1 className="font-display text-3xl md:text-4xl font-bold text-white tracking-tight mb-2">Seed Runners</h1>
        <p className="text-white/50 text-sm max-w-2xl leading-relaxed">
          {mode === "test"
            ? "Testkarte mit einem Abschnitt pro Fähigkeit. Ziffern 1–6 springen zum jeweiligen Abschnitt, Strg + Klick setzt die Figur an die angeklickte Stelle."
            : "Zufallslevel aus dem Seed: Bild hoch/runter springt zum vorigen bzw. nächsten Chunk, Strg + Klick setzt die Figur an die angeklickte Stelle."}
          {" "}Die Werte rechts wirken sofort und bleiben im Browser gespeichert.
        </p>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start">
        <div className="min-w-0 space-y-4">
          <div className="border border-white/10 rounded-md overflow-hidden bg-[#0b0b14]">
            <canvas
              ref={canvasRef}
              onClick={onCanvasClick}
              className="block w-full"
              style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}` }}
            />
          </div>

          <FxPanel />

          <div className="bg-[#0d0d14] border border-white/10 rounded-md">
            <div className="grid grid-cols-2 sm:grid-cols-5 divide-x divide-white/10">
              <Stat label="Zeit" value={`${formatTime(hud.time)}${hud.finished ? " · Ziel" : ""}`} />
              <Stat label="Tode" value={hud.deaths} />
              <Stat label="Checkpoint" value={`${hud.checkpoint} / ${hud.checkpointTotal}`} />
              <Stat label="Tempo" value={`${hud.speed} px/s`} />
              <Stat label="Zustand" value={hud.state} />
            </div>
            <div className="border-t border-white/10 px-4 py-2.5 flex items-center justify-between gap-4">
              <p className="text-xs text-white/40 truncate">
                {hud.chunk ? `Chunk ${hud.chunk}  ·  ` : ""}{hud.lastEvent || "Noch keine Ereignisse"}
              </p>
              <button
                type="button"
                onClick={() => resetRun(session.world)}
                className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white font-semibold px-3.5 py-1.5 rounded-md text-xs transition-colors shrink-0"
              >
                <RotateCcw size={13} />
                Lauf zurücksetzen
              </button>
            </div>
          </div>

          {/* Level */}
          <div className="bg-[#0d0d14] border border-white/10 rounded-md divide-y divide-white/10">
            <div className="flex gap-6 px-4">
              {[["test", "Testkarte"], ["level", "Zufallslevel"]].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => changeMode(id)}
                  className={`py-3 text-sm font-semibold border-b-2 -mb-px transition-colors ${mode === id ? "border-violet-500 text-white" : "border-transparent text-white/45 hover:text-white/80"}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {mode === "level" && (
              <div className="p-4 space-y-4">
                <div className="grid sm:grid-cols-[minmax(0,1fr)_auto] gap-3 items-end">
                  <Field label="Seed">
                    <input
                      type="text"
                      value={seedDraft}
                      onChange={(e) => setSeedDraft(e.target.value)}
                      onBlur={applySeed}
                      onKeyDown={(e) => { if (e.key === "Enter") { applySeed(); e.currentTarget.blur(); } }}
                      maxLength={40}
                      className={fieldClass}
                    />
                  </Field>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={rollSeed}
                      className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white font-semibold px-3.5 py-2 rounded-md text-sm transition-colors"
                    >
                      <Dices size={15} />
                      Würfeln
                    </button>
                    <button
                      type="button"
                      onClick={loadDaily}
                      className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold px-3.5 py-2 rounded-md text-sm transition-colors"
                    >
                      <CalendarDays size={15} />
                      Tages-Seed
                    </button>
                  </div>
                </div>

                <div className="grid sm:grid-cols-3 gap-3">
                  <Field label="Länge">
                    <select value={params.length} onChange={(e) => changeParam("length", e.target.value)} className={fieldClass}>
                      {Object.keys(LENGTHS).map((id) => <option key={id} value={id}>{LENGTH_LABELS[id]}</option>)}
                    </select>
                  </Field>
                  <Field label="Tempo-Klasse">
                    <select value={params.speedClass} onChange={(e) => changeParam("speedClass", e.target.value)} className={fieldClass}>
                      {SPEED_CLASS_IDS.map((id) => <option key={id} value={id}>{SPEED_CLASSES[id].label}</option>)}
                    </select>
                  </Field>
                  <Field label="Biom">
                    <select value={params.biome} onChange={(e) => changeParam("biome", e.target.value)} className={fieldClass}>
                      <option value="random">Zufall (aus dem Seed)</option>
                      {BIOME_IDS.map((id) => <option key={id} value={id}>{BIOMES[id].label}</option>)}
                    </select>
                  </Field>
                </div>

                <p className="text-xs text-white/40 leading-relaxed">
                  {speedInfo.description}
                  {levelInfo && (
                    <>
                      {" "}Biom {BIOMES[levelInfo.biome].label} · {levelInfo.chunks} Chunks · {levelInfo.width}×{levelInfo.height} Tiles ·
                      Hash <span className="tabular-nums text-white/60">{levelInfo.hash}</span> ·
                      Prüfung {levelInfo.issues === 0 ? "bestanden" : `${levelInfo.issues} Fehler`}
                    </>
                  )}
                </p>
              </div>
            )}
          </div>

          <div className="bg-[#0d0d14] border border-white/10 rounded-md divide-y divide-white/10">
            <div className="px-4 py-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-white">Steuerung</h2>
              <button
                type="button"
                onClick={resetBindings}
                className="text-xs text-white/50 hover:text-white transition-colors"
              >
                Auf Standard
              </button>
            </div>
            <div className="p-4 grid sm:grid-cols-2 gap-3">
              {ACTIONS.map((action) => (
                <div key={action.id} className="border border-white/10 bg-white/[0.03] rounded-md p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-white/70">{action.label}</p>
                    <p className="text-sm text-white truncate">
                      {rebinding === action.id ? "Taste oder Maustaste drücken …" : (bindings[action.id] || []).map(keyLabel).join("  /  ")}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleRebind(action.id)}
                    className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-white px-3 py-1.5 rounded-md transition-colors shrink-0"
                  >
                    {rebinding === action.id ? "Abbrechen" : "Ändern"}
                  </button>
                </div>
              ))}
            </div>
            <div className="px-4 py-3 flex items-start gap-2.5 text-xs text-white/45 leading-relaxed">
              <Gamepad2 size={14} className="mt-0.5 shrink-0 text-white/40" />
              <p>
                Gamepad wird automatisch erkannt: Stick oder Steuerkreuz bewegen und zielen, A springt,
                X oder B ist Dash, Y oder eine Schultertaste ist Grapple, Back geht zurück zum Checkpoint.
                Der Grapple greift den Anker, auf den du zielst (Ring um den Anker); ohne Richtung nimmt er
                den nächsten schräg oben in Blickrichtung. Sprungtaste am Seil lässt los. Hoch und Runter
                steuern an klebrigen Wänden das Klettern, Runter + Sprung lässt dich durch Einweg-Plattformen fallen.
              </p>
            </div>
          </div>
        </div>

        <aside className="bg-[#0d0d14] border border-white/10 rounded-md lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] flex flex-col min-h-0">
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-3 shrink-0">
            <h2 className="text-sm font-semibold text-white">Werte</h2>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={copyTuning}
                className="flex items-center gap-1.5 text-xs text-white/60 hover:text-white transition-colors"
              >
                {copied === "done" ? <Check size={13} /> : <Copy size={13} />}
                {copied === "done" ? "Kopiert" : copied === "failed" ? "Nicht möglich" : "Kopieren"}
              </button>
              <button
                type="button"
                onClick={resetTuning}
                className="text-xs text-white/50 hover:text-white transition-colors"
              >
                Auf Standard
              </button>
            </div>
          </div>
          <div className="overflow-y-auto min-h-0">
            <TuningPanel values={tuning} onChange={changeTuning} />
          </div>
        </aside>
      </div>
    </div>
  );
}

function describeLevel(level) {
  if (!level) return null;
  return {
    biome: level.biome,
    chunks: level.placements.length,
    width: level.width,
    height: level.height,
    hash: level.hash,
    issues: validateLevel(level).length,
  };
}
