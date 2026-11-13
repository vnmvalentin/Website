// ui/TimerPanel.jsx — Bedienung des Timers, genutzt vom Editor (WinChallenge.jsx) und der
// Moderator-Ansicht (WinChallengeControl.jsx).
//
// Zwei Formen mit denselben Funktionen:
//   groß (Standard) — eigenes Feld in der Seitenleiste: große Uhr, Start/Pause als breiter Knopf,
//                     Zeit anpassen, Zählrichtung und Sichtbarkeit stehen offen da
//   compact         — eine Zeile für schmale Bildschirme; alles Seltenere steckt im Aufklappfeld
//
// Gerechnet wird hier nichts: die Aktionen kommen vom Aufrufer (der Editor speichert das
// Dokument, die Moderator-Ansicht schickt Aktionen an den Server).
import React, { useEffect, useRef, useState } from "react";
import { Play, Pause, RotateCcw, Plus, Minus, Settings, EyeOff, Hourglass, Pencil } from "lucide-react";
import { msToClock, parseClockInput, isCountdown, timerDisplayMs, timerDurationMs } from "../overlayUtils";
import { Segmented, Switch } from "./editorKit";
import { BTN_QUIET, LABEL } from "./editorStyles";

// Schrittweiten für „Zeit anpassen“ — Beschriftung aus t.steps (wcI18n.js)
const TIMER_STEPS_MS = [60000, 600000, 3600000];

/**
 * @param {object} props
 * @param {object} props.timer     Timer des Dokuments ({ running, startedAt, elapsedMs, visible, mode, durationMs })
 * @param {number} props.now       aktuelle Zeit (der Aufrufer tickt)
 * @param {object} props.t         Texte (wcI18n.js)
 * @param {boolean} [props.compact]
 * @param {object} props.actions
 * @param {() => void} props.actions.start
 * @param {() => void} props.actions.pause
 * @param {() => void} props.actions.reset
 * @param {(deltaMs: number) => void} props.actions.adjust       ± auf die angezeigte Zeit
 * @param {(ms: number) => void} props.actions.setDisplay        angezeigte Zeit setzen (Countdown: Restzeit)
 * @param {(mode: "up"|"down") => void} props.actions.setMode
 * @param {(ms: number) => void} props.actions.setDuration       Startzeit des Countdowns
 * @param {() => void} props.actions.toggleVisible
 */
export default function TimerPanel({ timer, now, t, compact = false, actions }) {
  const tm = timer || {};
  const running = !!tm.running;
  const countdown = isCountdown(tm);
  const visible = tm.visible !== false;
  const shownMs = timerDisplayMs(tm, now);

  // Zeit direkt in der Anzeige bearbeiten (Klick auf die Uhrzeit)
  const [editingTime, setEditingTime] = useState(false);
  const [manualTime, setManualTime] = useState("");
  const [manualTimeError, setManualTimeError] = useState(false);
  const timeSelectPendingRef = useRef(false);
  const [step, setStep] = useState(TIMER_STEPS_MS[0]);
  // Startzeit des Countdowns: null = nicht in Bearbeitung
  const [durationInput, setDurationInput] = useState(null);
  const [durationError, setDurationError] = useState(false);

  // Aufklappfeld der schmalen Form: schließt bei einem Klick daneben und mit Esc
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  useEffect(() => {
    if (!compact || !menuOpen) return undefined;
    const onDown = (e) => { if (!menuRef.current?.contains(e.target)) setMenuOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [compact, menuOpen]);

  /** Übernimmt die eingetippte Zeit. true = übernommen, false = ungültiges Format. */
  const applyManualTime = () => {
    const ms = parseClockInput(manualTime);
    if (ms == null) { setManualTimeError(true); return false; }
    setManualTimeError(false);
    actions.setDisplay(ms);
    setManualTime("");
    return true;
  };

  /** Startzeit des Countdowns übernehmen (Enter oder Verlassen des Felds). */
  const applyDuration = () => {
    if (durationInput == null) return;
    const ms = parseClockInput(durationInput);
    if (ms == null || ms <= 0) { setDurationError(true); return; }
    setDurationError(false);
    setDurationInput(null);
    if (ms !== timerDurationMs(tm)) actions.setDuration(ms);
  };

  // Uhrzeit — anklicken zum direkten Bearbeiten (Enter übernimmt, Esc bricht ab)
  const clock = (sizeClass, idleClass) => (
    <input
      type="text"
      aria-label={t.timeAria}
      title={t.timeTitle}
      value={editingTime ? manualTime : msToClock(shownMs)}
      onFocus={(e) => {
        setManualTime(msToClock(shownMs));
        setManualTimeError(false);
        setEditingTime(true);
        e.target.select();
        // Der Mausklick würde die Markierung beim Loslassen sofort wieder aufheben
        timeSelectPendingRef.current = true;
      }}
      onMouseUp={(e) => {
        if (timeSelectPendingRef.current) {
          e.preventDefault();
          timeSelectPendingRef.current = false;
        }
      }}
      onChange={(e) => { setManualTime(e.target.value); setManualTimeError(false); }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          if (applyManualTime()) e.target.blur();
        } else if (e.key === "Escape") {
          e.target.blur();
        }
      }}
      onBlur={() => {
        timeSelectPendingRef.current = false;
        setEditingTime(false);
        setManualTimeError(false);
      }}
      className={`${sizeClass} text-center font-semibold tabular-nums outline-none ring-1 transition-colors ${
        manualTimeError
          ? "text-red-400 ring-red-500/60"
          : editingTime
            ? "text-white ring-violet-500 bg-white/[0.06]"
            : `text-white ring-transparent ${idleClass}`
      }`}
    />
  );

  // Alles neben Start/Pause/Reset: Zeit anpassen, Zählrichtung, Startzeit, Sichtbarkeit
  const extras = (
    <>
      {/* Zeit anpassen — Schrittweite wählen, dann ± */}
      <div className="grid grid-cols-[auto_1fr_auto] gap-1.5">
        <button type="button" onClick={() => actions.adjust(-step)} title={t.subtractTime} aria-label={t.subtractTime} className={`${BTN_QUIET} w-9 flex items-center justify-center`}>
          <Minus size={16} />
        </button>
        <Segmented
          label={t.stepAria}
          value={step}
          onChange={setStep}
          options={TIMER_STEPS_MS.map((ms, i) => ({ value: ms, label: t.steps[i] }))}
        />
        <button type="button" onClick={() => actions.adjust(step)} title={t.addTime} aria-label={t.addTime} className={`${BTN_QUIET} w-9 flex items-center justify-center`}>
          <Plus size={16} />
        </button>
      </div>

      <div>
        <span className={`${LABEL} block mb-1.5`}>{t.timerDirection}</span>
        <Segmented
          label={t.timerDirection}
          value={countdown ? "down" : "up"}
          onChange={(mode) => { if (mode !== (countdown ? "down" : "up")) actions.setMode(mode); }}
          options={[
            { value: "up", label: t.timerUp },
            { value: "down", label: t.timerDown },
          ]}
        />
      </div>

      {/* Startzeit des Countdowns — Enter oder Verlassen übernimmt */}
      {countdown && (
        <div>
          <label className="flex items-center justify-between gap-3">
            <span className="text-sm text-white/80">{t.timerStartAt}</span>
            <input
              type="text"
              aria-label={t.timerStartAt}
              title={t.timeFormat}
              value={durationInput ?? msToClock(timerDurationMs(tm))}
              onFocus={(e) => { setDurationInput(msToClock(timerDurationMs(tm))); setDurationError(false); e.target.select(); }}
              onChange={(e) => { setDurationInput(e.target.value); setDurationError(false); }}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); applyDuration(); }
                // Kein blur: onBlur sähe noch den alten Wert und würde ihn übernehmen
                else if (e.key === "Escape") { e.stopPropagation(); setDurationInput(null); setDurationError(false); }
              }}
              onBlur={applyDuration}
              className={`w-28 h-8 px-2 bg-white/[0.06] text-center text-sm font-semibold tabular-nums rounded-sm outline-none ring-1 transition-colors ${
                durationError ? "text-red-400 ring-red-500/60" : "text-white ring-transparent focus:ring-violet-500"
              }`}
            />
          </label>
          {durationError && <p className="text-[11px] text-red-400 mt-1 text-right">{t.timeFormat}</p>}
          <p className="text-xs text-white/40 mt-1">{t.timerStartHint}</p>
        </div>
      )}

      <Switch label={t.timerVisible} checked={visible} onChange={() => actions.toggleVisible()} />
    </>
  );

  // --- Schmale Form: eine Zeile, Rest im Aufklappfeld ---
  if (compact) {
    return (
      <div ref={menuRef} className="relative flex items-center gap-0.5 bg-black/30 rounded-sm p-0.5">
        {!running ? (
          <button type="button" onClick={actions.start} title={t.start} aria-label={t.start} className="w-8 h-8 shrink-0 flex items-center justify-center bg-green-600 hover:bg-green-500 text-white rounded-[3px] transition-colors">
            <Play size={14} fill="currentColor" />
          </button>
        ) : (
          <button type="button" onClick={actions.pause} title={t.pause} aria-label={t.pause} className="w-8 h-8 shrink-0 flex items-center justify-center bg-amber-500 hover:bg-amber-400 text-black rounded-[3px] transition-colors">
            <Pause size={14} fill="currentColor" />
          </button>
        )}

        {clock("flex-1 min-w-[6.5rem] md:flex-none md:w-[6.5rem] h-8 mx-0.5 bg-transparent text-lg rounded-[3px]", "hover:bg-white/[0.06]")}
        {manualTimeError && (
          <p className="absolute left-0 top-full mt-1.5 z-20 px-2 py-1 bg-[#1c1c27] ring-1 ring-red-500/40 rounded-sm text-[11px] text-red-400 whitespace-nowrap">{t.timeFormat}</p>
        )}

        <button type="button" onClick={actions.reset} title={t.reset} aria-label={t.reset} className="w-8 h-8 shrink-0 flex items-center justify-center rounded-[3px] text-white/45 hover:text-white hover:bg-white/10 transition-colors">
          <RotateCcw size={15} />
        </button>
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          aria-expanded={menuOpen}
          title={t.timerMore}
          aria-label={t.timerMore}
          className={`h-8 px-1.5 shrink-0 flex items-center gap-1 rounded-[3px] transition-colors ${menuOpen ? "bg-white/15 text-white" : "text-white/45 hover:text-white hover:bg-white/10"}`}
        >
          {/* Ausgeblendet und Countdown sind die Zustände, die man sonst übersieht */}
          {!visible && <EyeOff size={14} className="text-amber-300" />}
          {countdown && <Hourglass size={14} className="text-violet-300" />}
          <Settings size={15} />
        </button>

        {menuOpen && (
          <div className="absolute left-0 md:left-auto md:right-0 top-full mt-1.5 z-20 w-72 max-w-[calc(100vw-1rem)] p-3 flex flex-col gap-2.5 bg-[#1c1c27] rounded-md shadow-xl shadow-black/50">
            {extras}
          </div>
        )}
      </div>
    );
  }

  // --- Große Form: eigenes Feld, alles sichtbar ---
  // Zwei Gruppen mit deutlichem Abstand dazwischen: oben die Uhr mit Start/Reset (das, was man
  // im Stream ständig bedient), darunter die Einstellungen. Vorher stand alles gleich dicht
  // übereinander.
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className={LABEL}>{t.timer}</h3>
          <div className="flex items-center gap-2.5 text-[11px] font-bold">
            {/* Ausgeblendet ist der Zustand, den man sonst übersieht */}
            {!visible && (
              <span className="flex items-center gap-1 text-amber-300"><EyeOff size={12} /> {t.timerHiddenShort}</span>
            )}
            <span className={running ? "text-green-400" : "text-white/40"}>{running ? t.running : t.paused}</span>
          </div>
        </div>

        <div>
          <div className="relative">
            {clock("w-full h-20 bg-black/30 text-[2.5rem] leading-none rounded-sm", "hover:bg-black/45")}
            {!editingTime && <Pencil size={12} className="absolute right-2 top-2 text-white/25 pointer-events-none" />}
          </div>
          {manualTimeError && <p className="text-[11px] text-red-400 mt-1.5">{t.timeFormat}</p>}
        </div>

        <div className="grid grid-cols-[1fr_auto] gap-2">
          {!running ? (
            <button type="button" onClick={actions.start} className="h-12 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 text-white text-sm font-bold rounded-sm transition-colors">
              <Play size={15} fill="currentColor" /> {t.start}
            </button>
          ) : (
            <button type="button" onClick={actions.pause} className="h-12 flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold rounded-sm transition-colors">
              <Pause size={15} fill="currentColor" /> {t.pause}
            </button>
          )}
          <button type="button" onClick={actions.reset} title={t.reset} aria-label={t.reset} className={`${BTN_QUIET} h-12 px-3.5 flex items-center gap-2 text-sm font-bold`}>
            <RotateCcw size={15} /> {t.reset}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-4">{extras}</div>
    </div>
  );
}
