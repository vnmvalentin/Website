// Wertregler für die Host-Einstellungen.
//
// Ersetzt die Button-Reihen ("15s 30s 45s 60s 90s 120s" + Custom-Eingabefeld), die
// in der Lobby vierzehnmal fast identisch standen. Ein nativer <input type="range">
// bringt Touch, Tastatur (Pfeile/Pos1/Ende) und Screenreader-Ansage mit; ein
// JS-Slider müsste das alles nachbauen.
//
// Zwei Dinge, die der Regler NICHT naiv machen darf:
//
// 1. Nicht bei jeder Pixelbewegung senden. Der Wert läuft lokal mit (flüssige
//    Anzeige), onChange feuert erst beim Loslassen — sonst löst ein Zug über die
//    Skala Dutzende Socket-Events und ebenso viele Lobby-Broadcasts an alle aus.
// 2. Nach dem Loslassen nicht sofort auf den Server-Wert zurückfallen. Der ist bis
//    zum lobbyUpdate noch der alte, der Regler würde sichtbar zurückspringen und
//    kurz darauf wieder vorschnellen. Der lokale Wert bleibt deshalb stehen, bis
//    der Server ihn bestätigt — oder bis klar ist, dass er ihn abgelehnt hat.

import React, { useEffect, useRef, useState } from 'react';

// Nach dieser Zeit ohne Bestätigung gilt eine Änderung als abgelehnt (z.B. weil
// sanitize() im Backend sie verworfen hat, Kartenpool zu klein o.ä.) und die
// Anzeige kehrt zum echten Serverwert zurück.
const CONFIRM_TIMEOUT_MS = 1500;

/**
 * @param {number}   value     Aktueller Wert (vom Server)
 * @param {Function} onChange  Wird beim Loslassen mit dem neuen Wert aufgerufen
 * @param {number}   min       Kleinster Wert
 * @param {number}   max       Größter Wert
 * @param {number}   step      Schrittweite
 * @param {Function} format    Wert → Anzeigetext, z.B. (v) => `${v}s`
 * @param {string}   accent    CSS-Farbe der Füllung (Standard: Violett der Seite)
 * @param {boolean}  disabled
 */
export default function Slider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  format = (v) => String(v),
  accent,
  disabled = false,
  'aria-label': ariaLabel,
}) {
  // Lokaler Wert während des Ziehens und bis zur Server-Bestätigung; null = Serverwert zeigen
  const [localValue, setLocalValue] = useState(null);
  const timeoutRef = useRef(null);
  const shown = localValue ?? value;

  const clearRevert = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  // Server hat den gesetzten Wert übernommen → lokalen Zwischenstand aufgeben
  useEffect(() => {
    if (localValue !== null && value === localValue) {
      clearRevert();
      setLocalValue(null);
    }
  }, [value, localValue]);

  useEffect(() => clearRevert, []);

  const commit = (raw) => {
    const next = Number(raw);
    if (!Number.isFinite(next) || next === value) {
      clearRevert();
      setLocalValue(null);
      return;
    }
    setLocalValue(next);
    onChange(next);
    clearRevert();
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      setLocalValue(null);
    }, CONFIRM_TIMEOUT_MS);
  };

  // Füllstand 0–100 % für den Verlauf der Spur (siehe .cr-slider in index.css)
  const fill = max > min ? ((shown - min) / (max - min)) * 100 : 0;

  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        className="cr-slider flex-1"
        style={{ '--cr-slider-fill': `${fill}%`, ...(accent ? { '--cr-slider-accent': accent } : null) }}
        min={min}
        max={max}
        step={step}
        value={shown}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-valuetext={format(shown)}
        // Beim Ziehen nur die lokale Anzeige mitführen — clearRevert(), damit ein
        // noch laufender Rückfall-Timer der vorherigen Änderung nicht dazwischenfunkt.
        onChange={e => { clearRevert(); setLocalValue(Number(e.target.value)); }}
        // pointerup/keyup decken Maus, Touch und Tastatur ab; onBlur fängt den Fall,
        // dass der Finger außerhalb des Fensters losgelassen wird.
        onPointerUp={e => commit(e.currentTarget.value)}
        onKeyUp={e => commit(e.currentTarget.value)}
        onBlur={e => { if (localValue !== null && timeoutRef.current === null) commit(e.currentTarget.value); }}
      />
      {/* tabular-nums: die Breite springt sonst beim Durchziehen, weil Ziffern
          unterschiedlich breit sind — und mit ihr das ganze Layout der Zeile. */}
      <span className="text-white text-sm font-bold tabular-nums text-right shrink-0 min-w-[3.5rem]">
        {format(shown)}
      </span>
    </div>
  );
}
