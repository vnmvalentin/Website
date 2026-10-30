// DeckOverlayRotationControls.jsx — Schalter "Seiten wechseln" + Takt + Decks pro Seite.
//
// Steht an beiden Stellen, an denen ein Deck-Overlay-Link kopiert wird: im Endscreen
// (Lobby-Overlay, Arcade-Look) und im Streamer Setup (Account-Overlay, schlichter Look).
// Die Komponente hält keinen eigenen Zustand — der Elternteil baut daraus den Link
// (siehe buildDeckOverlayUrl in deckOverlayOptions.js).
import React from "react";
import Toggle from "../ui/Toggle";
import { ROTATE_SECONDS_OPTIONS, PER_PAGE_OPTIONS } from "./deckOverlayOptions";

const I18N = {
  de: {
    title: "Seiten wechseln",
    hint: "Bei vielen Spielern werden die Decks sonst sehr klein. Mit Schalter zeigt das Overlay wenige Decks groß und blättert automatisch weiter.",
    interval: "Wechsel alle",
    perPage: "Decks pro Seite",
    relink: "Nach einer Änderung den Link neu kopieren und in OBS ersetzen.",
  },
  en: {
    title: "Rotate pages",
    hint: "With many players the decks get very small. When on, the overlay shows a few decks at a large size and flips through them automatically.",
    interval: "Switch every",
    perPage: "Decks per page",
    relink: "After a change, copy the link again and replace it in OBS.",
  },
  es: {
    title: "Rotar páginas",
    hint: "Con muchos jugadores los mazos quedan muy pequeños. Activado, el overlay muestra pocos mazos en grande y pasa de página automáticamente.",
    interval: "Cambiar cada",
    perPage: "Mazos por página",
    relink: "Después de un cambio, vuelve a copiar el enlace y reemplázalo en OBS.",
  },
};

function Segments({ options, value, onChange, format, flat, label }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const active = opt === value;
        const base = flat
          ? "px-2.5 py-1 rounded-sm text-xs font-bold transition-colors"
          : "px-2.5 py-1 rounded-md text-xs font-bold border-2 transition-colors";
        const look = flat
          ? active ? "bg-cyan-500 text-black" : "bg-white/5 text-gray-400 hover:bg-white/10"
          : active ? "bg-sky-500 border-[#071225] text-white" : "bg-[#081426] border-[#071225] text-white/60 hover:text-white";
        return (
          <button
            key={opt}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt)}
            className={`${base} ${look}`}
          >
            {format(opt)}
          </button>
        );
      })}
    </div>
  );
}

/**
 * @param {{enabled:boolean, seconds:number, perPage:number}} value
 * @param {Function} onChange  bekommt das komplette neue Objekt
 * @param {string}   lang      'de' | 'en' | 'es'
 * @param {string}   variant   'arcade' (Endscreen) | 'flat' (Streamer Setup)
 */
export default function DeckOverlayRotationControls({ value, onChange, lang = "de", variant = "arcade" }) {
  const t = I18N[lang] || I18N.de;
  const flat = variant === "flat";
  const set = (patch) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <Toggle
          checked={value.enabled}
          onChange={(enabled) => set({ enabled })}
          variant={flat ? "flat" : "arcade"}
          accent={flat ? "bg-cyan-500" : "bg-sky-500"}
          aria-label={t.title}
        />
        <div className="min-w-0">
          <div className={flat ? "text-xs font-bold text-white" : "font-arcade text-sm font-bold text-white"}>{t.title}</div>
          <p className={flat ? "text-xs text-gray-500" : "text-white/40 text-xs"}>{t.hint}</p>
        </div>
      </div>

      {value.enabled && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <div className={flat ? "text-[11px] text-gray-400" : "text-[11px] text-white/50"}>{t.interval}</div>
            <Segments
              options={ROTATE_SECONDS_OPTIONS}
              value={value.seconds}
              onChange={(seconds) => set({ seconds })}
              format={(v) => `${v} s`}
              flat={flat}
              label={t.interval}
            />
          </div>
          <div className="space-y-1.5">
            <div className={flat ? "text-[11px] text-gray-400" : "text-[11px] text-white/50"}>{t.perPage}</div>
            <Segments
              options={PER_PAGE_OPTIONS}
              value={value.perPage}
              onChange={(perPage) => set({ perPage })}
              format={(v) => String(v)}
              flat={flat}
              label={t.perPage}
            />
          </div>
          <p className={`sm:col-span-2 text-[11px] ${flat ? "text-gray-500" : "text-white/35"}`}>{t.relink}</p>
        </div>
      )}
    </div>
  );
}
