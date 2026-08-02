// Gemeinsame Bausteine für das Aussehen aller Spielmodi.
//
// WARUM:
// Jeder Modus hatte seine eigene Kopfzeile, seine eigene Seitenleiste und seine eigene
// Fußleiste — sieben Mal dieselbe Idee in sieben leicht verschiedenen Ausführungen
// (mal `border-white/10`, mal `border-white/5`, mal `rounded-sm`, mal `rounded-md`).
// Deshalb wirkten die Modi zusammengewürfelt, obwohl sie zum selben Spiel gehören.
//
// Hier steht die Fassung, die sich bei der Elixier-Auktion durchgesetzt hat, einmal für
// alle: eine große Zahl als Anker, alles Weitere leise daneben, Tiefe statt Kästen.
//
// GESTALTUNGSREGELN, die diese Datei durchsetzt:
//   • Flächen statt Rahmen — bg-white/[0.02] statt border + eigener Hintergrund
//   • ein Akzent pro Modus, als CSS-Farbe übergeben (nicht als Tailwind-Klasse, weil
//     Tailwind nur wörtlich im Quelltext stehende Klassen findet)
//   • Zeitanzeige immer gleich: Zahl groß, darunter ein haarfeiner Fortschritt
//   • kein Glühen, keine Verläufe, keine Vergrößerung beim Überfahren

import React from 'react';

/** Spielfläche: dunkler als die Seitenleiste, füllt den Rest der Höhe. */
export function GameSurface({ children, className = '' }) {
  return (
    <div className={`flex-1 flex flex-col overflow-hidden min-h-0 bg-[#0b0b12] ${className}`}>
      {children}
    </div>
  );
}

/**
 * Kopfzeile eines Modus.
 *
 * @param {string} label       Bezeichnung links, z.B. "Runde"
 * @param {number|string} value  Große Zahl daneben
 * @param {number} [total]     Wird als "/ n" blass angehängt
 * @param {React.ReactNode} [badge]  Hinweis direkt neben dem Titel (Effekte, Tisch, …)
 * @param {React.ReactNode} [meta]   Leiser Fließtext rechts — auf dem Handy ausgeblendet
 * @param {number} [timerRemaining]  Restsekunden; ohne Angabe keine Zeitanzeige
 * @param {boolean} [timerUrgent]    Färbt die Zeit rot
 * @param {React.ReactNode} [right]  Ersetzt die Zeitanzeige ganz rechts
 */
export function GameHeader({
  label, value, total, badge, meta, timerRemaining, timerUrgent, right,
}) {
  return (
    <div className="shrink-0 px-4 sm:px-10 pt-5 sm:pt-6 pb-4 flex items-baseline gap-3 sm:gap-4 flex-wrap">
      <h2 className="font-display text-2xl sm:text-[28px] font-bold text-white leading-none">
        {label} {value}
        {total != null && <span className="text-white/20 font-normal"> / {total}</span>}
      </h2>

      {badge}

      <div className="flex-1" />

      {meta && <span className="text-white/35 text-sm hidden sm:block">{meta}</span>}

      {right}

      {typeof timerRemaining === 'number' && (
        <span className={`font-display text-2xl font-bold tabular-nums ${
          timerUrgent ? 'text-red-400' : 'text-white/70'
        }`}>
          {timerRemaining}s
        </span>
      )}
    </div>
  );
}

/**
 * Haarfeiner Fortschrittsbalken unter der Kopfzeile.
 * Ein Pixel hoch: Die Information ist da, sie schreit aber nicht.
 *
 * @param {number} pct     0–100
 * @param {string} accent  CSS-Farbe des Modus
 * @param {boolean} urgent Rot statt Akzentfarbe
 */
export function ProgressHairline({ pct, accent = '#a78bfa', urgent = false }) {
  return (
    <div className="shrink-0 h-px bg-white/[0.06] mx-4 sm:mx-10">
      <div className="h-full"
        style={{
          width: `${Math.max(0, Math.min(100, pct))}%`,
          backgroundColor: urgent ? '#f87171' : accent,
          transition: 'width 1s linear',
        }} />
    </div>
  );
}

/** Scrollender Spielbereich mit den Abständen, die überall gelten. */
export function GameBody({ children, center = false, className = '' }) {
  return (
    <div className={`flex-1 overflow-y-auto custom-scrollbar px-4 sm:px-10 py-6 sm:py-8 ${className}`}>
      {center
        ? <div className="min-h-full flex flex-col items-center justify-center gap-6">{children}</div>
        : children}
    </div>
  );
}

/** Abgesetzte Fußleiste (Eingaben, Status). Flächig, kein Rahmen ringsum. */
export function GameFooter({ children, className = '' }) {
  return (
    <div className={`shrink-0 px-4 sm:px-10 py-4 bg-white/[0.02] border-t border-white/[0.06] ${className}`}>
      {children}
    </div>
  );
}

/**
 * Spielerkachel für die Seitenleiste.
 * Der eigene Eintrag ist heller — das ersetzt das frühere farbige "Du"-Etikett.
 */
export function PlayerPanel({ isMe = false, header, children, className = '' }) {
  return (
    <div className={`rounded-xl p-3 space-y-2.5 ${isMe ? 'bg-white/[0.06]' : 'bg-white/[0.02]'} ${className}`}>
      {header}
      {children}
    </div>
  );
}

/** Dünner Fortschrittsbalken in einer Spielerkachel (Elixier, Fortschritt, …). */
export function MeterBar({ value, max, accent = '#a78bfa', label }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 bg-white/[0.07] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-300"
          style={{ width: `${pct}%`, backgroundColor: accent }} />
      </div>
      <span className="text-[11px] tabular-nums shrink-0" style={{ color: accent }}>
        {label ?? value}
      </span>
    </div>
  );
}

/**
 * 2×4-Deckraster. Leere Plätze bleiben als Fläche sichtbar, damit man sieht,
 * wie weit ein Deck ist, ohne zählen zu müssen.
 *
 * @param {function} renderCard  (card, index) => ReactNode
 */
export function DeckGrid({ deck = [], size = 8, renderCard }) {
  return (
    <div className="grid grid-cols-4 gap-1">
      {Array.from({ length: size }, (_, i) => (
        <div key={i} className="aspect-square rounded-md overflow-hidden bg-white/[0.03]">
          {deck[i] ? renderCard(deck[i], i) : null}
        </div>
      ))}
    </div>
  );
}
