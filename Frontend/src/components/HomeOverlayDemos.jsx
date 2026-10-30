// HomeOverlayDemos.jsx — die echten Overlays (Win Tracker / Win Challenge) als Live-Vorschau in den Favoriten-Karten
// der Startseite. Eigener Chunk (lazy in HomeFavorites.jsx), damit die Startseite selbst schlank bleibt. Gleiche
// Beispieldaten wie die Overlay-Galerie (StreamerTools/OverlayGalleryPage.jsx).
import React, { useEffect, useRef, useState } from "react";
import OverlayPreview from "../pages/ClashRoyale/WinTracker/OverlayPreview";
import OverlayView from "../pages/WinChallenge/OverlayView";
import { STYLE_PRESETS } from "../pages/WinChallenge/stylePresets";
import { OVERLAY_TEMPLATES, CR_FONT_HREF } from "../pages/ClashRoyale/WinTracker/overlayTheme";
import { WT_SETTINGS, WC_DOC, WC_TIMER_MS } from "../pages/StreamerTools/OverlayGalleryPage";

const noop = () => {};

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
  return (
    <div ref={outer} className="absolute inset-4 flex items-center justify-center">
      <div style={{ position: "relative", width: box.w * box.s, height: box.h * box.s }}>
        <div ref={inner} style={{ position: "absolute", top: 0, left: 0, width: "max-content", transform: `scale(${box.s})`, transformOrigin: "top left" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

/** Win-Challenge-Timer läuft sichtbar weiter (nur solange der Tab offen ist) */
function useTicking(startMs) {
  const [ms, setMs] = useState(startMs);
  useEffect(() => {
    const t0 = Date.now() - startMs;
    const id = setInterval(() => { if (!document.hidden) setMs(Date.now() - t0); }, 1000);
    return () => clearInterval(id);
  }, [startMs]);
  return ms;
}

/**
 * @param kind  "win-tracker" | "win-challenge"
 * @param look  id einer Vorlage (OVERLAY_TEMPLATES bzw. STYLE_PRESETS)
 */
export default function HomeOverlayDemo({ kind, look }) {
  const timerMs = useTicking(WC_TIMER_MS);

  // Der Royale-Look braucht seine Schrift — das echte Overlay lädt sie genauso
  useEffect(() => {
    if (kind !== "win-tracker" || document.querySelector(`link[href="${CR_FONT_HREF}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = CR_FONT_HREF;
    document.head.appendChild(link);
  }, [kind]);

  if (kind === "win-tracker") {
    const tpl = OVERLAY_TEMPLATES.find((t) => t.id === look) || OVERLAY_TEMPLATES[0];
    return (
      <FitBox>
        <OverlayPreview settings={{ ...WT_SETTINGS, ...tpl.settings }} overlayKey={null}
          moduleVisibility={{ deck: true, session: true }} onToggleModule={noop} onToggleProfile={noop} refreshSignal="" showcase />
      </FitBox>
    );
  }
  const preset = STYLE_PRESETS.find((p) => p.id === look) || STYLE_PRESETS[0];
  return (
    <FitBox>
      <OverlayView doc={{ ...WC_DOC, style: preset.style }} timerMs={timerMs} />
    </FitBox>
  );
}
