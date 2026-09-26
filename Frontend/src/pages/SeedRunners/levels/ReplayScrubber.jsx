// ReplayScrubber.jsx — einen Geisterlauf ansehen, ohne selbst zu spielen: Zeitleiste zum Vor- und Zurückspulen,
// Play/Pause, Neustart. Lädt sein Level und den Lauf selbst (Code + welcher Geist).
//
// Der Renderer ist derselbe wie im Spiel (client/render.js) — nur die Kamera folgt hier ohne Glättung, denn beim
// Ziehen am Regler soll sofort die richtige Stelle zu sehen sein, nicht erst nachgezogen kommen.
import React, { useEffect, useRef, useState } from "react";
import { Play, Pause, RotateCcw, X, Loader2, AlertTriangle } from "lucide-react";
import { getLevelDoc, getGhost } from "./levelsApi.js";
import { validateDoc } from "../level/index.js";
import { seekTo } from "./replayScrub.js";
import { stepWorld } from "../sim/world.js";
import { createCamera, updateCamera, VIEW_W, VIEW_H } from "../client/camera.js";
import { drawFrame, fitCanvas } from "../client/render.js";
import { FixedStepper } from "../client/loop.js";
import { BIOMES } from "../gen/biomes.js";
import { formatTicks } from "../room/format.js";
import { buttonClass, primaryButtonClass } from "../editor/fields.jsx";

/** Kamera sofort auf den Spieler ausgerichtet, ohne Nachlaufen — passend zum Springen im Regler */
function snappedCamera(world) {
  const cam = createCamera();
  const p = world.player;
  updateCamera(cam, p.x, p.y, p, world.map, 0);
  return cam;
}

export default function ReplayScrubber({ code, which, name, color = "#a78bfa", onClose }) {
  const [state, setState] = useState({ status: "loading" });
  const [tick, setTick] = useState(0);
  const [playing, setPlaying] = useState(false);
  const canvasRef = useRef(null);
  const dataRef = useRef(null);          // { level, log, ticks, palette }
  const runRef = useRef(null);           // { world, maskAt } — der aktuelle Stand
  const seekRaf = useRef(0);
  const pendingTick = useRef(null);

  useEffect(() => {
    let alive = true;
    setState({ status: "loading" });
    (async () => {
      const [served, ghost] = await Promise.all([getLevelDoc(code), getGhost(code, which)]);
      if (!alive) return;
      if (!served || !ghost || !Array.isArray(ghost.log)) { setState({ status: "error" }); return; }
      const res = validateDoc(served.doc, { smoke: false });
      if (!res.ok || res.hash !== served.hash) { setState({ status: "error" }); return; }
      dataRef.current = { level: res.level, log: ghost.log, ticks: ghost.ticks, palette: BIOMES[res.level.biome].palette };
      const { world, maskAt } = seekTo(res.level, ghost.log, 0);
      runRef.current = { world, maskAt };
      setTick(0);
      setState({ status: "ready" });
    })();
    return () => { alive = false; };
  }, [code, which]);

  const draw = () => {
    const canvas = canvasRef.current;
    const data = dataRef.current;
    const run = runRef.current;
    if (!canvas || !data || !run) return;
    const scale = fitCanvas(canvas);
    const ctx = canvas.getContext("2d");
    drawFrame(ctx, scale, run.world, snappedCamera(run.world), 1, { palette: data.palette, showWarps: false });
  };

  // Ziehen am Regler: pro Bild höchstens einmal neu rechnen (nicht bei jedem einzelnen input-Ereignis) — bei sehr
  // langen Läufen bliebe es sonst hängen, weil jeder Sprung die Welt von vorn abspielt (replayScrub.js)
  const requestSeek = (target) => {
    pendingTick.current = target;
    if (seekRaf.current) return;
    seekRaf.current = requestAnimationFrame(() => {
      seekRaf.current = 0;
      const t = pendingTick.current;
      pendingTick.current = null;
      if (!dataRef.current) return;
      runRef.current = seekTo(dataRef.current.level, dataRef.current.log, t);
      setTick(runRef.current.world.tick);
      draw();
    });
  };

  // Wiedergabe: von hier an ganz normal vorwärts, wie im Spiel selbst — kein erneutes Abspielen von vorn nötig
  useEffect(() => {
    if (!playing || state.status !== "ready") return undefined;
    const stepper = new FixedStepper();
    let raf;
    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      const run = runRef.current;
      const data = dataRef.current;
      if (!run || !data) return;
      const n = stepper.advance(now);
      for (let i = 0; i < n; i++) {
        if (run.world.tick >= data.ticks || run.world.finished) { setPlaying(false); break; }
        stepWorld(run.world, run.maskAt(run.world.tick));
      }
      setTick(run.world.tick);
      draw();
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [playing, state.status]);

  // Erstes Bild, sobald Level und Lauf da sind (das Canvas existiert erst ab hier); danach bei jedem Sprung im Regler.
  // Während der Wiedergabe zeichnet schon deren eigene Schleife oben — hier nur reagieren, wenn `tick` sich durch
  // einen SPRUNG geändert hat, nicht bei jedem Play/Pause-Wechsel (deshalb bewusst ohne `playing` in den Abhängigkeiten).
  useEffect(() => { if (state.status === "ready") draw(); }, [state.status]);
  useEffect(() => { if (!playing) draw(); }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const restart = () => { setPlaying(false); requestSeek(0); };

  if (state.status === "loading") {
    return <p className="flex items-center gap-2 text-sm text-white/50 py-6"><Loader2 size={15} className="animate-spin" />Lädt …</p>;
  }
  if (state.status === "error") {
    return (
      <div className="flex items-center justify-between gap-3 py-4" role="alert">
        <p className="flex items-center gap-2 text-sm text-amber-300"><AlertTriangle size={15} />Dieser Lauf lässt sich gerade nicht ansehen.</p>
        <button type="button" onClick={onClose} className={buttonClass}><X size={14} />Schließen</button>
      </div>
    );
  }

  const total = dataRef.current.ticks;

  return (
    <div className="space-y-3" data-testid="replay-scrubber">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-white/70">
          Lauf ansehen{name ? <> · <span className="text-white font-semibold">{name}</span></> : null}
        </p>
        <button type="button" onClick={onClose} className={buttonClass}><X size={14} />Schließen</button>
      </div>

      <div className="relative border border-white/10 rounded-md overflow-hidden bg-[#0b0b14]">
        <canvas ref={canvasRef} className="block w-full" style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}` }} />
      </div>

      <div className="flex items-center gap-3">
        <button type="button" onClick={() => setPlaying((v) => !v)} className={primaryButtonClass} aria-label={playing ? "Pause" : "Abspielen"}>
          {playing ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <button type="button" onClick={restart} className={buttonClass} aria-label="Neu starten"><RotateCcw size={14} /></button>
        <input
          type="range"
          min={0}
          max={total}
          value={tick}
          onChange={(e) => { setPlaying(false); requestSeek(Number(e.target.value)); }}
          className="flex-1 accent-violet-500"
          style={{ accentColor: color }}
          aria-label="Zeitpunkt im Lauf"
        />
        <span className="text-xs text-white/60 tabular-nums w-24 text-right shrink-0">{formatTicks(tick)} / {formatTicks(total)}</span>
      </div>
    </div>
  );
}
