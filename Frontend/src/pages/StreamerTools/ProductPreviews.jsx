// ProductPreviews.jsx — die Live-Vorschau auf den Produktseiten (ProductPage.jsx): das ECHTE Overlay mit
// Beispieldaten, in der Sprache der Seite. Win Tracker wechselt durch seine fertigen Looks, die Win Challenge zählt
// Siege und Zeit, die Twitch-Overlays zeigen ihre Module nacheinander — Alerts und der Subathon-Timer mit
// aufspringender Zeit eingeschlossen. Eigener Chunk (lazy), bis dahin steht das Vorschaubild.
import React, { useEffect, useMemo, useState } from "react";
import FitBox from "./FitBox";
import OverlayPreview from "../ClashRoyale/WinTracker/OverlayPreview";
import { OVERLAY_TEMPLATES, CR_FONT_HREF } from "../ClashRoyale/WinTracker/overlayTheme";
import OverlayView from "../WinChallenge/OverlayView";
import { STYLE_PRESETS } from "../WinChallenge/stylePresets";
import { PollWidget, PredictionWidget, GoalWidget, StatsWidget } from "../StreamTool/OverlayWidgets";
import { AlertWidget } from "../StreamTool/OverlayAlerts";
import { SubathonWidget } from "../StreamTool/OverlaySubathon";
import { OverlayLangContext, OVERLAY_TEXTS } from "../StreamTool/overlayI18n";
import {
  defaultConfig, withLanguage, effectiveModules, useDemoSim, paintDemo, toGoalView, toStatsView, toSubathonView, demoAlert,
} from "../StreamTool/streamToolConfig";
import { useFontLink } from "../../components/shell/useFontLink";
import { WT_SETTINGS, WC_DOC, WC_DOC_EN, WC_TIMER_MS } from "./demoData";

const noop = () => {};
const WT_SWITCH_MS = 6000;
const WC_STEP_MS = 2500;
const TWITCH_SWITCH_MS = 4500;
const SUBATHON_STEP_MS = 2200;

/** Zählt alle `ms` Millisekunden einen Takt weiter — steht still, solange der Tab im Hintergrund ist. */
function useBeat(ms) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => { if (!document.hidden) setN((x) => x + 1); }, ms);
    return () => clearInterval(id);
  }, [ms]);
  return n;
}

function WinTrackerLive({ lang }) {
  // Der Clash-Royale-Look braucht seine Schrift — das echte Overlay lädt sie genauso
  useFontLink(CR_FONT_HREF);
  const beat = useBeat(WT_SWITCH_MS);
  const tpl = OVERLAY_TEMPLATES[beat % OVERLAY_TEMPLATES.length];
  return (
    <OverlayPreview settings={{ ...WT_SETTINGS, ...tpl.settings, language: lang }} overlayKey={null}
      moduleVisibility={{ deck: true, session: true }} onToggleModule={noop} onToggleProfile={noop} refreshSignal="" showcase />
  );
}

function WinChallengeLive({ lang }) {
  const beat = useBeat(WC_STEP_MS);
  const base = lang === "en" ? WC_DOC_EN : WC_DOC;
  // Die erste Challenge zählt Sieg für Sieg hoch (2 → 3, erledigt) und beginnt dann von vorn
  const progress = 1 + (beat % 3);
  const doc = {
    ...base,
    style: STYLE_PRESETS[0].style,
    items: base.items.map((it, i) => (i === 0 ? { ...it, progress, done: progress >= it.target } : it)),
  };
  return <OverlayView doc={doc} timerMs={WC_TIMER_MS + beat * WC_STEP_MS} />;
}

/** Subathon mit Beispieldaten: alle paar Sekunden kommt ein Abo oder Bits dazu, die Zeit springt als „+5:00“ auf. */
function useSubathonSim() {
  const [state, setState] = useState(() => ({
    endsAt: Date.now() + (3 * 3600 + 47 * 60 + 12) * 1000,
    n: 0,
    recent: [{ id: "s0", at: 0, kind: "gift", name: "Mika", amount: 5, tier: "1", ms: 1500000 }],
  }));
  useEffect(() => {
    const names = ["Lou", "Sam", "Noa", "Kim"];
    const id = setInterval(() => {
      if (document.hidden) return;
      setState((s) => {
        const n = s.n + 1;
        const entry = n % 2
          ? { id: `s${n}`, at: 0, kind: "sub", name: names[n % names.length], amount: 1, tier: "1", ms: 300000 }
          : { id: `s${n}`, at: 0, kind: "bits", name: names[n % names.length], amount: 500, tier: "", ms: 300000 };
        return { endsAt: s.endsAt + entry.ms, n, recent: [...s.recent, entry].slice(-5) };
      });
    }, SUBATHON_STEP_MS);
    return () => clearInterval(id);
  }, []);
  return { status: "running", endsAt: state.endsAt, remainingMs: 0, elapsedMs: 0, capMs: 0, capReached: false, recent: state.recent };
}

const TWITCH_ORDER = ["poll", "alert-follow", "goal", "subathon", "prediction", "alert-bits", "stats"];

function TwitchLive({ lang }) {
  // Standardtexte (Ziel-Überschriften, Alert-Texte) in der Sprache der Seite
  const m = useMemo(() => effectiveModules(withLanguage(defaultConfig(), lang)), [lang]);
  const sim = useDemoSim(true, 2, lang);
  const subathon = useSubathonSim();
  const shown = TWITCH_ORDER[useBeat(TWITCH_SWITCH_MS) % TWITCH_ORDER.length];
  const t = OVERLAY_TEXTS.dict(lang);

  let el = null;
  if (shown === "poll" && sim.poll) el = <PollWidget data={paintDemo(sim.poll, m.poll)} module={m.poll} />;
  if (shown === "prediction" && sim.prediction) el = <PredictionWidget data={paintDemo(sim.prediction, m.prediction)} module={m.prediction} />;
  if (shown === "goal") {
    const v = toGoalView("followerGoal", sim.goals, m.followerGoal);
    if (v) el = <GoalWidget data={v} module={m.followerGoal} />;
  }
  if (shown === "stats") {
    const v = toStatsView(sim.stats, { ...m.streamStats, hideOffline: false });
    if (v) el = <StatsWidget data={v} module={m.streamStats} />;
  }
  if (shown === "alert-follow" || shown === "alert-bits") {
    const ev = demoAlert(shown === "alert-follow" ? "follow" : "bits", t);
    // key: jeder Wechsel spielt den Alert neu ab
    el = <AlertWidget key={shown} event={{ ...ev, test: false }} module={m.alerts} />;
  }
  if (shown === "subathon") {
    el = <SubathonWidget data={toSubathonView(subathon, m.subathon)} module={m.subathon} />;
  }
  return <OverlayLangContext.Provider value={lang}><div lang={lang}>{el}</div></OverlayLangContext.Provider>;
}

const LIVE = { "win-tracker": WinTrackerLive, "win-challenge": WinChallengeLive, "twitch-overlays": TwitchLive };

/**
 * @param {object} props
 * @param {string} props.id    Produkt (PRODUCT_IDS)
 * @param {string} props.lang  'de' | 'en'
 */
export default function ProductPreview({ id, lang }) {
  const Live = LIVE[id];
  if (!Live) return null;
  // inert: reine Vorführung — nichts darin soll Klick oder Fokus bekommen
  return (
    <div className="absolute inset-0" inert aria-hidden="true">
      <FitBox inset="inset-[6%]"><Live lang={lang} /></FitBox>
    </div>
  );
}
