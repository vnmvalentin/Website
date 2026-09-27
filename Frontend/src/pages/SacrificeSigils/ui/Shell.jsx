// ui/Shell.jsx — Hülle aller Seiten von Sacrifice & Sigils: eigener Look statt Website-Layout.
// Holztisch, flackerndes Kerzenlicht (folgt leicht der Maus), Partikel-Overlay, Tooltip, Ton- und Anzeige-Einstellungen.
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { ArrowLeftToLine, Volume2, VolumeX, Settings2 } from "lucide-react";
import { ShellContext } from "./shellContext.js";
import { sound } from "../audio/sound.js";
import { particles } from "./anim/particles.js";
import { usePrefs, setPrefs, SPEED_OPTIONS, systemPrefersReducedMotion } from "./prefs.js";
import { de } from "../i18n/de.js";
import "./theme.css";

const FONT_HREF = "https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=IM+Fell+English:ital@0;1&family=IM+Fell+English+SC&display=swap";

const NAV = [
  { to: "/sacrifice-and-sigils", label: "Spielen", end: true },
  { to: "/sacrifice-and-sigils/kartenbuch", label: de.ui.codex },
  { to: "/sacrifice-and-sigils/anleitung", label: de.ui.guide },
];

/**
 * Tooltip mit Kollisionserkennung (Runde 2, D2): bevorzugt über dem Anker, sonst darunter; immer ganz im Fenster.
 * @param {{ tip: { x: number, y: number, bottom?: number, content: any } }} props
 */
function Tooltip({ tip }) {
  const ref = useRef(/** @type {HTMLDivElement|null} */ (null));
  const [pos, setPos] = useState(/** @type {{ left: number, top: number } | null} */ (null));
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const m = 8;
    const left = Math.max(m, Math.min(vw - w - m, tip.x - w / 2));
    const below = (tip.bottom ?? tip.y) + 10;
    let top = tip.y - h - 10;
    if (top < m) top = below + h <= vh - m ? below : Math.max(m, vh - h - m);
    setPos({ left, top });
  }, [tip]);
  return (
    <div ref={ref} className="ss-tip ss-paper" style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, maxWidth: "min(280px, calc(100vw - 16px))" }} role="tooltip">
      {tip.content}
    </div>
  );
}

function SettingsPopover({ onClose }) {
  const prefs = usePrefs();
  const [s, setS] = useState(sound.settings);
  useEffect(() => sound.subscribe(setS), []);
  const slider = (key, label) => (
    <label className="flex items-center gap-3 text-sm">
      <span className="w-20">{label}</span>
      <input type="range" min="0" max="1" step="0.05" value={s[key]} onChange={(e) => sound.set({ [key]: Number(e.target.value) })} className="flex-1 accent-[#8e1b1b]" aria-label={label} />
    </label>
  );
  return (
    // Zentrierter Dialog statt Popover (Runde 2, D2): passt in jedes Fenster, scrollt bei Bedarf innen
    <div className="fixed inset-0 z-[95] flex items-center justify-center p-4 bg-black/55 ss-fade-in" onClick={onClose}>
    <div className="ss-paper ss-modal-box w-[min(360px,calc(100vw-32px))] p-4 space-y-3" role="dialog" aria-modal="true" aria-label={de.ui.settings} onClick={(e) => e.stopPropagation()}>
      <p className="ss-title !text-[var(--ink)] text-lg">{de.ui.settings}</p>
      {slider("master", de.ui.master)}
      {slider("sfx", de.ui.effects)}
      {slider("ambient", de.ui.music)}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={s.muted} onChange={(e) => sound.set({ muted: e.target.checked })} /> {de.ui.mute}
      </label>
      <hr className="border-[#a8966c]" />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={prefs.reduceMotion} onChange={(e) => setPrefs({ reduceMotion: e.target.checked })} /> {de.ui.reduceMotion}
      </label>
      <div className="flex items-center gap-2 text-sm">
        <span className="w-20">{de.ui.speed}</span>
        {SPEED_OPTIONS.map((v) => (
          <button key={v} type="button" onClick={() => setPrefs({ speed: v })} aria-pressed={prefs.speed === v} className={`px-3 py-1 min-h-[44px] min-w-[44px] border ${prefs.speed === v ? "bg-[#8e1b1b] text-[#f7e6d0] border-[#5c0f0f]" : "border-[#a8966c]"}`}>{String(v).replace(".", ",")}×</button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={prefs.tipsOff} onChange={(e) => setPrefs({ tipsOff: e.target.checked })} /> Tutorial-Hinweise ausblenden
      </label>
      <div className="text-right"><button type="button" className="ss-btn ss-btn-sm min-h-[44px] min-w-[64px]" onClick={onClose}>OK</button></div>
    </div>
    </div>
  );
}

export default function Shell() {
  const prefs = usePrefs();
  const rootRef = useRef(/** @type {HTMLDivElement|null} */ (null));
  const bgRef = useRef(/** @type {HTMLDivElement|null} */ (null));
  const canvasRef = useRef(/** @type {HTMLCanvasElement|null} */ (null));
  const [tip, setTip] = useState(/** @type {any} */ (null));
  const [tension, setTension] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [muted, setMuted] = useState(sound.settings.muted);

  useEffect(() => sound.subscribe((s) => setMuted(s.muted)), []);

  // Schriften einmal laden (per <link>, wie in der Seed-Runners-Hülle)
  useEffect(() => {
    if (document.querySelector(`link[href="${FONT_HREF}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = FONT_HREF;
    document.head.appendChild(link);
  }, []);

  // Audio erst nach der ersten Interaktion; Ambient läuft, solange die Hülle offen ist
  useEffect(() => {
    const unlock = () => sound.unlock();
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock);
    sound.setAmbient(true);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      sound.setAmbient(false);
    };
  }, []);

  useEffect(() => sound.setTension(tension), [tension]);

  // Partikel-Canvas
  useEffect(() => {
    if (!canvasRef.current) return undefined;
    particles.attach(canvasRef.current);
    const onResize = () => particles.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      particles.detach();
    };
  }, []);
  useEffect(() => { particles.reduced = prefs.reduceMotion; }, [prefs.reduceMotion]);

  // Flackerndes Kerzenlicht: zufällige Intensität, Lichtpunkt folgt leicht der Maus
  // Die Variablen sitzen nur auf der Hintergrund-Ebene: auf der Wurzel würden sie (vererbt) jedes Frame die Styles der
  // ganzen Seite neu berechnen lassen.
  useEffect(() => {
    const el = bgRef.current;
    if (!el) return undefined;
    let raf = 0;
    let target = { x: 50, y: 30 };
    let cur = { x: 50, y: 30 };
    let flick = 1;
    let goal = 1;
    let next = 0;
    const onMove = (e) => {
      target = { x: 35 + (e.clientX / window.innerWidth) * 30, y: 18 + (e.clientY / window.innerHeight) * 24 };
    };
    const loop = (t) => {
      if (t > next) {
        goal = 0.78 + Math.random() * 0.34;
        next = t + 80 + Math.random() * 260;
      }
      flick += (goal - flick) * 0.12;
      cur = { x: cur.x + (target.x - cur.x) * 0.03, y: cur.y + (target.y - cur.y) * 0.03 };
      el.style.setProperty("--flicker", flick.toFixed(3));
      el.style.setProperty("--light-x", `${cur.x.toFixed(1)}%`);
      el.style.setProperty("--light-y", `${cur.y.toFixed(1)}%`);
      raf = requestAnimationFrame(loop);
    };
    if (!prefs.reduceMotion) raf = requestAnimationFrame(loop);
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
    };
  }, [prefs.reduceMotion]);

  const shake = useCallback(() => {
    const el = rootRef.current?.querySelector(".ss-shake-target");
    if (!el || prefs.reduceMotion) return;
    el.classList.remove("ss-shake");
    void /** @type {HTMLElement} */ (el).offsetWidth;
    el.classList.add("ss-shake");
  }, [prefs.reduceMotion]);

  const ctx = useMemo(() => ({ showTip: setTip, setTension, shake }), [shake]);

  return (
    <ShellContext.Provider value={ctx}>
      <div ref={rootRef} className={`ss-game ${prefs.reduceMotion ? "ss-reduced" : ""} ${tension >= 4 ? "ss-tense" : ""}`}>
        <div ref={bgRef} className="ss-table-bg" aria-hidden />
        <header className="ss-content ss-topbar">
          <div className="max-w-[1500px] mx-auto px-3 md:px-5 h-14 flex items-center gap-3 md:gap-6">
            <Link to="/sacrifice-and-sigils" className="ss-title text-lg md:text-xl whitespace-nowrap" title="Hauptmenü">
              Sacrifice <span className="text-[var(--wax-red-light)]">&amp;</span> Sigils
            </Link>
            <nav className="hidden sm:flex items-center gap-1" aria-label="Bereiche">
              {NAV.map((n) => (
                <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `px-2.5 py-1 text-[15px] ss-focus ${isActive ? "text-[var(--candle)]" : "ss-dim hover:text-[var(--bone)]"}`}>
                  {n.label}
                </NavLink>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-2 relative">
              <button type="button" className="ss-btn ss-btn-sm ss-btn-ghost" onClick={() => sound.set({ muted: !muted })} aria-label={muted ? "Ton an" : "Ton aus"} title={muted ? "Ton an" : "Ton aus"}>
                {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
              <button type="button" className="ss-btn ss-btn-sm ss-btn-ghost" onClick={() => setSettingsOpen((o) => !o)} aria-label={de.ui.settings} aria-expanded={settingsOpen}>
                <Settings2 size={16} />
              </button>
              {settingsOpen && <SettingsPopover onClose={() => setSettingsOpen(false)} />}
              <Link to="/fun" className="ss-btn ss-btn-sm ss-btn-ghost" title="Zurück zur Website"><ArrowLeftToLine size={16} /><span className="hidden md:inline">Website</span></Link>
            </div>
          </div>
        </header>
        <main className="ss-content">
          <Outlet />
        </main>
        {systemPrefersReducedMotion && !prefs.motionHintSeen && !prefs.reduceMotion && (
          <div className="ss-motion-hint ss-paper" role="status">
            <p className="text-sm">{de.ui.motionHint}</p>
            <div className="flex gap-2 justify-end mt-2">
              <button type="button" className="ss-btn ss-btn-sm" onClick={() => setPrefs({ reduceMotion: true, motionHintSeen: true })}>{de.ui.motionHintReduce}</button>
              <button type="button" className="ss-btn ss-btn-sm" onClick={() => setPrefs({ motionHintSeen: true })}>OK</button>
            </div>
          </div>
        )}
        <canvas ref={canvasRef} className="fixed inset-0 w-full h-full pointer-events-none z-[70]" aria-hidden />
        {tip && <Tooltip tip={tip} />}
      </div>
    </ShellContext.Provider>
  );
}
