// ui/Shell.jsx — Hülle aller Seiten von Sacrifice & Sigils: eigener Look statt Website-Layout.
// Holztisch, flackerndes Kerzenlicht (folgt leicht der Maus), Partikel-Overlay, Tooltip, Ton- und Anzeige-Einstellungen.
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { Volume2, VolumeX, Settings2 } from "lucide-react";
import { ShellContext } from "./shellContext.js";
import Table3DLayer from "./battle/table3d/Table3DLayer.jsx";
import MaskPicker from "./table/MaskPicker.jsx";
import { TableKeeper } from "./table/TableKeeper.jsx";
import { sound } from "../audio/sound.js";
import { particles } from "./anim/particles.js";
import { usePrefs, setPrefs, useNewTable, SPEED_OPTIONS, systemPrefersReducedMotion } from "./prefs.js";
import { useWideEnough } from "./table/useAtTable.js";
import { isLowGfx } from "../../../utils/lowGfx.js";
import { de } from "../i18n/de.js";
import "./theme.css";
import { useFontLink } from "../../../components/shell/useFontLink";
import BackToSite from "../../../components/shell/BackToSite";
import { ssKonto } from "../konto.js";

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
      {/* Sparmodus (Browser ohne Grafikkarte, utils/lowGfx.js): immer der flache Tisch ohne 3D — sonst rechnet der
          Prozessor jedes Bild selbst und alles ruckelt (Phase 7) */}
      {isLowGfx() ? (
        <p className="text-sm opacity-80">Sparmodus: Dein Browser zeichnet ohne Grafikkarte. Damit nichts ruckelt, spielst du am flachen Tisch ohne 3D.</p>
      ) : (
        <>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={prefs.table3d !== false} onChange={(e) => setPrefs({ table3d: e.target.checked })} /> Tisch in 3D (Kerzenlicht)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!prefs.oldTable} onChange={(e) => setPrefs({ oldTable: e.target.checked })} /> Bisheriger Tisch (flach, ohne Gestalt)
          </label>
          {/* Masken gibt es nur am Tisch im Kerzenlicht (Standard) */}
          {!prefs.oldTable && <MaskPicker />}
        </>
      )}
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
  // Hochkant auf dem flachen Tisch, obwohl der Tisch im Kerzenlicht gewünscht wäre (nicht Sparmodus, nicht abgewählt)
  const newTable = useNewTable();
  const wideEnough = useWideEnough();
  const rotateHint = newTable && !wideEnough && !prefs.rotateHintOff;
  const coarse = typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches;

  useEffect(() => sound.subscribe((s) => setMuted(s.muted)), []);

  // Schriften einmal laden (per <link>, wie in der Seed-Runners-Hülle)
  useFontLink(FONT_HREF);

  // Duelle und Moorwanderungen am Konto (kontoStand.js)
  ssKonto.useAnbindung();

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
    // Sparmodus (ohne Grafikkarte): ruhiges Licht — jedes Flackern malt sonst den ganzen Holztisch neu (gemessen
    // mit Software-Grafik: Bildzeit im Mittel 61 statt 43 ms, Phase 7)
    if (!prefs.reduceMotion && !isLowGfx()) raf = requestAnimationFrame(loop);
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

  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const ctx = useMemo(() => ({ showTip: setTip, setTension, shake, openSettings }), [shake, openSettings]);

  return (
    <ShellContext.Provider value={ctx}>
      <div ref={rootRef} className={`ss-game ${prefs.reduceMotion ? "ss-reduced" : ""} ${tension >= 4 ? "ss-tense" : ""}`}>
        <div ref={bgRef} className="ss-table-bg" aria-hidden />
        {/* 3D-Tisch für alle Spielphasen; die Bildschirme melden per useTableStage, was sie zeigen */}
        {prefs.table3d !== false && !isLowGfx() && <Table3DLayer reduced={prefs.reduceMotion} />}
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
              <BackToSite className="ss-btn ss-btn-sm ss-btn-ghost" />
            </div>
          </div>
        </header>
        {/* Hochkant bleibt der flache Tisch (Phase 7): ein leiser Hinweis, wie man an den Tisch im Kerzenlicht kommt */}
        {rotateHint && (
          <div className="ss-content ss-rotate-hint" role="note">
            <span>{coarse ? de.ui.rotateHintPhone : de.ui.rotateHintWindow}</span>
            <button type="button" className="ss-rotate-hint-off ss-focus" onClick={() => setPrefs({ rotateHintOff: true })}>{de.ui.rotateHintOff}</button>
          </div>
        )}
        {/* außerhalb der Leiste: am Tisch ist die Leiste ausgeblendet, die Einstellungen öffnet dann das Menü am Tisch */}
        {settingsOpen && <SettingsPopover onClose={() => setSettingsOpen(false)} />}
        <main className="ss-content">
          {/* Der Tisch im Kerzenlicht bleibt über Seitenwechsel stehen (Menü → Lobby → Match) */}
          <TableKeeper><Outlet /></TableKeeper>
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
        {/* Kommt die Erklärung vom Tastatur-Fokus am Tisch (TableMirror), liest ein Screenreader sie nach dem Ziel vor.
            Die Zone steht immer da — neu eingefügte Live-Zonen werden oft nicht angesagt. */}
        <div className="ss-sr-only" aria-live="polite">
          {tip && typeof document !== "undefined" && document.activeElement?.closest?.(".st-mirror") ? tip.content : null}
        </div>
      </div>
    </ShellContext.Provider>
  );
}
