// OverlayGalleryPage.jsx — /tools/vorlagen: die Overlay-Galerie mit einem Reiter je Overlay. Win Tracker und Win
// Challenge zeigen ihre fertigen Looks (Klick → Editor mit ?vorlage=<id>, der übernimmt sie), die Twitch-Overlays
// ihre Module live mit Beispieldaten. Alles sind die ECHTEN Overlay-Komponenten, keine Bilder — ändert sich ein
// Overlay, ändert sich die Galerie mit. Auch Quelle der Vorschaubilder (scripts/vorschaubilder.cjs).
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import SEO from "../../components/SEO";
import { Page, PageHeader, Tabs, Button } from "../../components/ui";
import OverlayPreview from "../ClashRoyale/WinTracker/OverlayPreview";
import OverlayView from "../WinChallenge/OverlayView";
import { STYLE_PRESETS } from "../WinChallenge/stylePresets";
import { OVERLAY_TEMPLATES, CR_FONT_HREF } from "../ClashRoyale/WinTracker/overlayTheme";
import { PollWidget, PredictionWidget, GoalWidget, StatsWidget } from "../StreamTool/OverlayWidgets";
import { defaultConfig, effectiveModules, useDemoSim, paintDemo, toGoalView, toStatsView } from "../StreamTool/streamToolConfig";
import { useFontLink } from "../../components/shell/useFontLink";
import { WT_SETTINGS, WC_DOC, WC_TIMER_MS } from "./demoData";

const noop = () => {};

/** Verkleinert ein Overlay mit fester Pixelbreite passend in seine Kachel (nie größer als 100 %). */
export function Fit({ children }) {
  const outer = useRef(null);
  const inner = useRef(null);
  const [box, setBox] = useState({ scale: 1, w: 0, h: 0 });
  useEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i || typeof ResizeObserver === "undefined") return undefined;
    const measure = () => {
      const w = i.offsetWidth;
      const h = i.offsetHeight;
      const scale = Math.min(1, o.clientWidth / Math.max(1, w));
      setBox((b) => (Math.abs(b.scale - scale) < 0.001 && b.w === w && b.h === h ? b : { scale, w, h }));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(o);
    ro.observe(i);
    measure();
    return () => ro.disconnect();
  }, []);
  // transform verkleinert nur die Darstellung, nicht den Platz im Layout: Die Hülle bekommt deshalb die verkleinerte
  // Größe, das Overlay liegt absolut darin und behält seine echte Pixelbreite.
  return (
    <div ref={outer} className="w-full flex justify-center">
      <div style={{ position: "relative", width: box.w * box.scale, height: box.h * box.scale }}>
        <div ref={inner} style={{ position: "absolute", top: 0, left: 0, width: "max-content", transform: `scale(${box.scale})`, transformOrigin: "top left" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

/** Eine Vorlage: die ganze Kachel ist der Link */
function GalleryTile({ label, note, to, children }) {
  return (
    <Link to={to} className="group flex flex-col rounded-lg border border-line bg-surface/80 hover:border-accent/45 transition-colors overflow-hidden" data-gallery-tile>
      <div className="flex-1 min-h-[200px] flex items-center justify-center p-4 bg-[#08080b] border-b border-line overflow-hidden" data-gallery-preview>
        {children}
      </div>
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-white truncate">{label}</span>
          {note && <span className="block text-xs text-white/45 truncate">{note}</span>}
        </span>
        <span className="shrink-0 text-xs font-semibold text-accent-soft group-hover:text-white">Verwenden →</span>
      </div>
    </Link>
  );
}

function TwitchWidgets() {
  const m = useMemo(() => effectiveModules(defaultConfig()), []);
  const sim = useDemoSim(true, 2);
  const items = [
    { id: "poll", label: "Umfragen", note: "Balken füllen sich mit jeder Stimme", el: sim.poll && <PollWidget data={paintDemo(sim.poll, m.poll)} module={m.poll} /> },
    { id: "prediction", label: "Vorhersagen", note: "Kanalpunkte, Teilnehmer, Auflösung", el: sim.prediction && <PredictionWidget data={paintDemo(sim.prediction, m.prediction)} module={m.prediction} /> },
    { id: "goal", label: "Follower- und Abo-Ziele", note: "Eigene oder Twitch-Ziele", el: (() => { const v = toGoalView("followerGoal", sim.goals, m.followerGoal); return v && <GoalWidget data={v} module={m.followerGoal} />; })() },
    { id: "stats", label: "Stream-Statistik", note: "Follows, Abos, Bits des Streams", el: (() => { const v = toStatsView(sim.stats, { ...m.streamStats, hideOffline: false }); return v && <StatsWidget data={v} module={m.streamStats} />; })() },
  ];
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      {items.map((x) => (
        <GalleryTile key={x.id} label={x.label} note={x.note} to="/twitch-tools">{x.el && <Fit>{x.el}</Fit>}</GalleryTile>
      ))}
    </div>
  );
}

const TABS = [
  { id: "win-tracker", label: "Win Tracker", hint: "Fünf Looks für das Clash-Royale-Overlay — Inhalt und Sprache bleiben, wie du sie eingestellt hast." },
  { id: "win-challenge", label: "Win Challenge", hint: "Sechs Farbvorlagen — Farben und Details lassen sich danach im Editor anpassen." },
  { id: "twitch", label: "Twitch-Overlays", hint: "Umfragen, Vorhersagen, Ziele und Statistik — alle Module laufen in einer einzigen OBS-Quelle." },
];

export default function OverlayGalleryPage() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.find((x) => x.id === params.get("reiter")) || TABS[0];

  // Der Royale-Look braucht seine Schrift — das echte Overlay lädt sie genauso (WinTrackerOverlayPage.jsx)
  useFontLink(CR_FONT_HREF);

  return (
    <Page width="wide" className="py-4 md:py-10">
      <SEO title="Overlay-Galerie" description="Fertige Looks für die kostenlosen OBS-Overlays: Win Tracker, Win Challenge und Twitch-Umfragen, -Vorhersagen und -Ziele. Mit einem Klick übernehmen." path="/tools/vorlagen" />
      <Button to="/tools" variant="ghost" icon={ArrowLeft} className="-ml-3 mb-4">Streamer-Tools</Button>
      <PageHeader
        size="hero"
        className="!mb-8"
        kicker="Für Streamer"
        title="Overlay-Galerie"
        description="Fertige Looks zum Durchklicken. Ein Klick übernimmt die Vorlage in deinen Editor."
      />

      <Tabs
        className="mb-3"
        label="Overlays"
        value={tab.id}
        onChange={(id) => setParams({ reiter: id }, { replace: true })}
        items={TABS.map((x) => ({ value: x.id, label: x.label }))}
      />
      <p className="text-sm text-white/45 mb-6">{tab.hint}</p>

      <div role="tabpanel">
        {tab.id === "win-tracker" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {OVERLAY_TEMPLATES.map((tpl) => (
              <GalleryTile key={tpl.id} label={tpl.label} to={`/clash-royale/win-tracker?vorlage=${tpl.id}`}>
                <Fit>
                  <OverlayPreview settings={{ ...WT_SETTINGS, ...tpl.settings }} overlayKey={null}
                    moduleVisibility={{ deck: true, session: true }} onToggleModule={noop} onToggleProfile={noop} refreshSignal="" showcase />
                </Fit>
              </GalleryTile>
            ))}
          </div>
        )}
        {tab.id === "win-challenge" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {STYLE_PRESETS.map((p) => (
              <GalleryTile key={p.id} label={p.label} to={`/WinChallenge-Overlay?vorlage=${p.id}`}>
                <Fit><OverlayView doc={{ ...WC_DOC, style: p.style }} timerMs={WC_TIMER_MS} /></Fit>
              </GalleryTile>
            ))}
          </div>
        )}
        {tab.id === "twitch" && <TwitchWidgets />}
      </div>
    </Page>
  );
}
