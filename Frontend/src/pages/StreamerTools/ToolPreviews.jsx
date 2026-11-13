// ToolPreviews.jsx — Live-Vorschau in den Karten auf /tools: statt eines Standbilds läuft das ECHTE Overlay mit
// Beispieldaten (demoData.js). Win Challenge zählt die Zeit weiter, die Twitch-Overlays wechseln durch ihre Module
// und füllen sich mit Stimmen, beim Bingo werden Felder abgehakt. Eigener Chunk (lazy in StreamerToolsPage.jsx):
// bis er geladen ist, zeigt die Karte ihr Vorschaubild, danach liegt diese Fläche darüber.
import React, { useEffect, useMemo, useRef, useState } from "react";
import OverlayView from "../WinChallenge/OverlayView";
import { STYLE_PRESETS } from "../WinChallenge/stylePresets";
import { PollWidget, PredictionWidget, GoalWidget, StatsWidget } from "../StreamTool/OverlayWidgets";
import { defaultConfig, effectiveModules, useDemoSim, paintDemo, toGoalView, toStatsView } from "../StreamTool/streamToolConfig";
import BingoGrid from "../Bingo/BingoGrid";
import { WC_DOC, WC_TIMER_MS, BINGO_SIZE, BINGO_STYLE, BINGO_TEXTS, BINGO_ORDER } from "./demoData";

const TWITCH_SWITCH_MS = 5000;
const BINGO_STEP_MS = 1400;
const BINGO_HOLD_STEPS = 3; // so viele Takte bleibt die fertige Karte stehen, bevor sie von vorn beginnt
const BINGO_BOX = 520;      // Kantenlänge der Karte in Pixeln, bevor sie in die Kachel verkleinert wird

/** Verkleinert ein Overlay mit fester Pixelgröße, bis es in Breite UND Höhe der Fläche passt (nie größer als 100 %). */
function FitBox({ children }) {
  const outer = useRef(null);
  const inner = useRef(null);
  const [box, setBox] = useState({ s: 1, w: 0, h: 0 });
  useEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i || typeof ResizeObserver === "undefined") return undefined;
    const measure = () => {
      const w = i.offsetWidth;
      const h = i.offsetHeight;
      const s = Math.min(1, o.clientWidth / Math.max(1, w), o.clientHeight / Math.max(1, h));
      setBox((b) => (Math.abs(b.s - s) < 0.001 && b.w === w && b.h === h ? b : { s, w, h }));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(o);
    ro.observe(i);
    measure();
    return () => ro.disconnect();
  }, []);
  // transform verkleinert nur die Darstellung, nicht den Platz im Layout: die Hülle bekommt die verkleinerte Größe
  return (
    <div ref={outer} className="absolute inset-[7%] flex items-center justify-center">
      <div style={{ position: "relative", width: box.w * box.s, height: box.h * box.s }}>
        <div ref={inner} style={{ position: "absolute", top: 0, left: 0, width: "max-content", transform: `scale(${box.s})`, transformOrigin: "top left" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

/** Zählt alle `ms` Millisekunden einen Takt weiter — steht still, solange der Tab im Hintergrund ist */
function useBeat(ms) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => { if (!document.hidden) setN((x) => x + 1); }, ms);
    return () => clearInterval(id);
  }, [ms]);
  return n;
}

function WinChallengeLive() {
  const seconds = useBeat(1000);
  return <OverlayView doc={{ ...WC_DOC, style: STYLE_PRESETS[0].style }} timerMs={WC_TIMER_MS + seconds * 1000} />;
}

function TwitchLive() {
  const m = useMemo(() => effectiveModules(defaultConfig()), []);
  const sim = useDemoSim(true, 2);
  const shown = useBeat(TWITCH_SWITCH_MS) % 4;
  if (shown === 0) return sim.poll ? <PollWidget data={paintDemo(sim.poll, m.poll)} module={m.poll} /> : null;
  if (shown === 1) return sim.prediction ? <PredictionWidget data={paintDemo(sim.prediction, m.prediction)} module={m.prediction} /> : null;
  if (shown === 2) {
    const v = toGoalView("followerGoal", sim.goals, m.followerGoal);
    return v ? <GoalWidget data={v} module={m.followerGoal} /> : null;
  }
  const v = toStatsView(sim.stats, { ...m.streamStats, hideOffline: false });
  return v ? <StatsWidget data={v} module={m.streamStats} /> : null;
}

function BingoLive() {
  const step = useBeat(BINGO_STEP_MS) % (BINGO_ORDER.length + 1 + BINGO_HOLD_STEPS);
  const cells = useMemo(() => {
    const marked = new Set(BINGO_ORDER.slice(0, step));
    return BINGO_TEXTS.map((text, idx) => ({ text, mark: marked.has(idx) ? "x" : "none", markColor: "" }));
  }, [step]);
  return (
    <div style={{ width: BINGO_BOX, height: BINGO_BOX }}>
      <BingoGrid gridSize={BINGO_SIZE} cells={cells} style={BINGO_STYLE} />
    </div>
  );
}

const LIVE = {
  "win-challenge": WinChallengeLive,
  "twitch-tools": TwitchLive,
  bingo: BingoLive,
};

/**
 * @param {object} props
 * @param {string} props.kind  id des Tools aus navigation.js — ohne passende Vorschau bleibt das Bild der Karte stehen
 */
export default function ToolPreview({ kind }) {
  const Live = LIVE[kind];
  if (!Live) return null;
  // inert: die Vorschau liegt in einer Karte, die als Ganzes der Link ist — nichts darin soll Klick oder Fokus bekommen
  return (
    <div className="tile3d-live" inert aria-hidden="true">
      <FitBox><Live /></FitBox>
    </div>
  );
}
