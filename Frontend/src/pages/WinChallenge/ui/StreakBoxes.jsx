// ui/StreakBoxes.jsx — die Wins einer Serie (B2B, B3B …) als anklickbare Kästchen, im Editor
// und in der Moderator-Ansicht. Offene Kästchen tragen ihre Nummer, gewonnene einen Haken;
// ist die Serie geschafft, sind alle grün. Im Overlay zeichnet StreakPips (overlayParts.jsx)
// dieselbe Reihe ohne Bedienung.
import React from "react";
import { Check } from "lucide-react";

// Größen der Kästchen: „lg“ für die eigene Serien-Zeile der Challenge-Karte. 30px, damit
// eine Zehner-Serie auf einem 1366er-Laptop noch in eine Reihe neben „Auf 0“ passt.
const SIZES = {
  md: { box: "w-6 h-6 text-[11px]", wrap: "shrink-0", check: 14 },
  lg: { box: "w-[30px] h-[30px] text-xs", wrap: "flex-1 min-w-0", check: 16 },
};

/**
 * @param {object} props
 * @param {number} props.total    Länge der Serie
 * @param {number} props.filled   bisher gewonnene Wins
 * @param {(index: number) => void} props.onPick  Klick auf Kästchen `index` (ab 0)
 * @param {object} props.t        Texte (wcI18n.js)
 * @param {"md"|"lg"} [props.size]
 */
export default function StreakBoxes({ total, filled, onPick, t, size = "md" }) {
  const done = total > 0 && filled >= total;
  const dim = SIZES[size] || SIZES.md;
  return (
    <div role="group" aria-label={t.modeStreak} className={`flex flex-wrap items-center gap-1 ${dim.wrap}`}>
      {Array.from({ length: total }).map((_, i) => {
        const on = i < filled;
        let tone = "bg-black/30 text-white/35 ring-1 ring-inset ring-white/15 hover:ring-white/45 hover:text-white";
        if (on) tone = done ? "bg-green-500 hover:bg-green-400 text-black" : "bg-violet-600 hover:bg-violet-500 text-white";
        return (
          <button
            key={i}
            type="button"
            aria-pressed={on}
            aria-label={t.streakWin(i + 1)}
            title={t.streakWin(i + 1)}
            onClick={() => onPick(i)}
            className={`${dim.box} flex items-center justify-center rounded-[3px] font-bold tabular-nums transition-colors ${tone}`}
          >
            {on ? <Check size={dim.check} strokeWidth={3.5} /> : i + 1}
          </button>
        );
      })}
    </div>
  );
}
