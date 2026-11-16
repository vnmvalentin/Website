// ui/table/TablePause.jsx — das Pausenmenü am Tisch (Esc oder „Menü“): die eine Stelle, an der es am Tisch Knöpfe gibt.
// Für alle Phasen am Tisch dasselbe (Draft, Totem-Wahl, Kampf): weiterspielen, Ton, Tempo, Bewegung, zum bisherigen
// Tisch wechseln, aufgeben. Die Phase gibt Überschrift, Unterzeile, eigene Knöpfe und den Bedientext dazu.
import React, { useEffect, useState } from "react";
import { de } from "../../i18n/de.js";
import { sound } from "../../audio/sound.js";
import { usePrefs, setPrefs, SPEED_OPTIONS } from "../prefs.js";

/**
 * @param {{ title: string, sub?: React.ReactNode, extra?: React.ReactNode, help: React.ReactNode, onClose: () => void,
 *   onSurrender?: (() => void) | null, onFallback?: () => void, surrenderText?: string }} props
 *   surrenderText: Rückfrage beim Aufgeben (Moorwanderung: es kostet den ganzen Run)
 *   extra: zusätzliche Knöpfe der Phase (stehen unter „Weiterspielen“) · onSurrender: null/fehlt = kein Aufgeben
 *   onFallback: für dieses Match an den bisherigen Tisch wechseln
 */
export default function TablePause({ title, sub, extra, help, onClose, onSurrender, onFallback, surrenderText }) {
  const prefs = usePrefs();
  const [muted, setMuted] = useState(sound.settings.muted);
  const [confirmSurrender, setConfirmSurrender] = useState(false);
  useEffect(() => sound.subscribe((s) => setMuted(s.muted)), []);
  return (
    <div className="st-pause" role="dialog" aria-modal="true" aria-label="Pause" onClick={onClose}>
      <div className="st-pause-box ss-paper" onClick={(e) => e.stopPropagation()}>
        <p className="ss-title !text-[var(--ink)] text-2xl">{title}</p>
        {sub && <p className="text-sm opacity-75">{sub}</p>}
        <div className="st-pause-list">
          <button type="button" className="ss-btn" onClick={onClose}>Weiterspielen</button>
          {extra}
          <button type="button" className="ss-btn" onClick={() => sound.set({ muted: !muted })}>{muted ? "Ton einschalten" : "Ton ausschalten"}</button>
          <div className="st-pause-row">
            <span>{de.ui.speed}</span>
            {SPEED_OPTIONS.map((v) => (
              <button key={v} type="button" className={`ss-btn ss-btn-sm ${prefs.speed === v ? "!text-[var(--candle)]" : ""}`} aria-pressed={prefs.speed === v} onClick={() => setPrefs({ speed: v })}>{v}×</button>
            ))}
          </div>
          <label className="st-pause-row">
            <input type="checkbox" checked={prefs.reduceMotion} onChange={(e) => setPrefs({ reduceMotion: e.target.checked })} /> {de.ui.reduceMotion}
          </label>
          <button type="button" className="ss-btn" onClick={() => { setPrefs({ oldTable: true }); onFallback?.(); }}>Zum bisherigen Tisch wechseln</button>
          {onSurrender && (confirmSurrender ? (
            <div className="st-pause-row">
              <span className="text-sm">{surrenderText || de.ui.surrenderConfirm}</span>
              <button type="button" className="ss-btn ss-btn-sm" onClick={() => { onClose(); onSurrender(); }}>{de.ui.surrender}</button>
              <button type="button" className="ss-btn ss-btn-sm" onClick={() => setConfirmSurrender(false)}>{de.ui.cancel}</button>
            </div>
          ) : (
            <button type="button" className="ss-btn" onClick={() => setConfirmSurrender(true)}>{de.ui.surrender}</button>
          ))}
        </div>
        <p className="st-pause-help">{help}</p>
      </div>
    </div>
  );
}
