// ui/Shell.jsx — Hülle aller Seiten von Sacrifice & Sigils: eigener Look statt Website-Layout.
// Holztisch, flackerndes Kerzenlicht (folgt leicht der Maus), Partikel-Overlay, Tooltip, Ton- und Anzeige-Einstellungen.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { ArrowLeftToLine, Volume2, VolumeX, Settings2 } from "lucide-react";
import { ShellContext } from "./shellContext.js";
import { sound } from "../audio/sound.js";
import { particles } from "./anim/particles.js";
import { usePrefs, setPrefs } from "./prefs.js";
import { de } from "../i18n/de.js";
import "./theme.css";

const FONT_HREF = "https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=IM+Fell+English:ital@0;1&family=IM+Fell+English+SC&display=swap";

const NAV = [
  { to: "/sacrifice-and-sigils", label: "Spielen", end: true },
  { to: "/sacrifice-and-sigils/kartenbuch", label: de.ui.codex },
  { to: "/sacrifice-and-sigils/anleitung", label: de.ui.guide },
];

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
    <div className="ss-paper absolute right-0 top-12 z-50 w-72 p-4 space-y-3 ss-fade-in" role="dialog" aria-label={de.ui.settings}>
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
        {[1, 2].map((v) => (
          <button key={v} type="button" onClick={() => setPrefs({ speed: v })} className={`px-3 py-1 border ${prefs.speed === v ? "bg-[#8e1b1b] text-[#f7e6d0] border-[#5c0f0f]" : "border-[#a8966c]"}`}>{v}×</button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={prefs.tipsOff} onChange={(e) => setPrefs({ tipsOff: e.target.checked })} /> Tutorial-Hinweise ausblenden
      </label>
      <div className="text-right"><button type="button" className="ss-btn ss-btn-sm" onClick={onClose}>OK</button></div>
    </div>
  );
}

export default function Shell() {
  const prefs = usePrefs();
  const rootRef = useRef(/** @type {HTMLDivElement|null} */ (null));
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
  useEffect(() => {
    const el = rootRef.current;
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
        <div className="ss-table-bg" aria-hidden />
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
        <canvas ref={canvasRef} className="fixed inset-0 w-full h-full pointer-events-none z-[70]" aria-hidden />
        {tip && (
          <div className="ss-tip ss-paper" style={{ left: Math.min(window.innerWidth - 290, Math.max(8, tip.x - 140)), top: Math.max(8, tip.y - 12), transform: "translateY(-100%)" }} role="tooltip">
            {tip.content}
          </div>
        )}
      </div>
    </ShellContext.Provider>
  );
}
