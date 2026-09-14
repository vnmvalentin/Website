// Gemeinsame Bausteine für das Aussehen aller Spielmodi.
//
// WARUM:
// Jeder Modus hatte seine eigene Kopfzeile, seine eigene Seitenleiste und seine eigene
// Fußleiste — sieben Mal dieselbe Idee in sieben leicht verschiedenen Ausführungen
// (mal `border-white/10`, mal `border-white/5`, mal `rounded-sm`, mal `rounded-md`).
// Deshalb wirkten die Modi zusammengewürfelt, obwohl sie zum selben Spiel gehören.
//
// ZWEITER UMBAU (dieser hier): Die erste Fassung dieser Datei zog bewusst FLÄCHEN statt
// Kästen, KEINE Verläufe und KEIN Glühen durch — passend zur damaligen Idee, die Modi
// ruhiger zu halten als Hauptmenü und Lobby. Das hat sich als Fehler in die andere
// Richtung erwiesen: Hub und Lobby liefen längst im knalligen Comic-„Arcade"-Look
// (.cr-arcade-btn, .cr-arcade-panel — siehe index.css), Spielerkacheln und Fußleiste
// waren noch reine Flächen ohne Kontur. Diese Bausteine tragen jetzt dieselbe Formsprache:
// dicke dunkle Ränder statt Flächen ohne Kontur, Verlauf statt einfarbiger Fläche. DIE
// TYPOGRAFIE der Kopfzeile (GameHeader) bleibt bewusst bei der ruhigen, schlichten Fassung
// — ein erster Anlauf steckte die Rundenzahl in eine umrandete Plakette und den Timer in
// eine Pille, das kollidierte mit der großen-Zahl-als-Anker-Idee und wirkte neben dem
// echten Inhalt (Karten, Raster) zu laut. Eine große Zahl, alles Weitere leise daneben,
// bleibt hier die Regel. Der HINTERGRUND der Kopfzeile dagegen ist jetzt ein eigenes
// Modul: derselbe Verlauf wie die Seitenleiste (ModeShell.jsx) statt eines transparenten
// Streifens über dem Diamant-Karo — Kopfzeile und Seitenleiste rahmen die Spielfläche
// jetzt sichtbar als zusammengehöriges Paar aus zwei blickdichten Leisten.
import React from 'react';

/** Spielfläche: der Bereich, in dem die Karten liegen, trägt jetzt selbst das
 *  Diamant-Karo (.cr-arcade-bg, wie Hub/Lobby/Endscreen) statt einer einfarbigen
 *  Fläche — auf Wunsch, damit das Muster auch während des Spiels sichtbar bleibt und
 *  nicht nur zwischen den Fenstern. Damit die Karten darauf nicht untergehen, brauchen
 *  ALLE Karten-Module (CardTile, DeckGrid-Zellen, Marktplatz-Kacheln, …) eine eigene
 *  blickdichte Fläche plus Tinten-Rand — das Muster darf nur zwischen ihnen
 *  durchscheinen, nie darunter. */
export function GameSurface({ children, className = '' }) {
  return (
    <div className={`flex-1 flex flex-col overflow-hidden min-h-0 cr-arcade-bg ${className}`}>
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
    <div className="shrink-0 px-4 sm:px-10 pt-5 sm:pt-6 pb-4 flex items-baseline gap-3 sm:gap-4 flex-wrap
      bg-gradient-to-b from-[#17293f] to-[#0c1725] border-b-[3px]"
      style={{ borderColor: 'var(--cr-arcade-ink)' }}>
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
 * Fortschrittsbalken unter der Kopfzeile — eine dicke, abgerundete Spur statt des
 * früheren Ein-Pixel-Haarstrichs. Der hauchdünne Strich passte zur zurückhaltenden
 * Vorgänger-Fassung dieser Datei; im chunky Comic-Look wirkte er nur noch wie ein
 * vergessenes Render-Artefakt.
 *
 * WICHTIG bg-[#0d1420] statt bg-black/30: Diese Leiste hängt zwischen Kopfzeile und
 * Spielfläche — bei einigen Modi (Fischen, Fallensteller-Klickphase) ist die Spielfläche
 * selbst blickdicht (Fluss-Canvas, schwarzes Raster), die Leiste saß aber weiterhin direkt
 * auf dem Diamant-Karo darunter. Bei nur 30% Deckkraft blieb genau dort ein sichtbarer
 * Streifen Karo übrig — wie eine Lücke zwischen zwei sonst nahtlosen blickdichten Flächen.
 *
 * @param {number} pct     0–100
 * @param {string} accent  CSS-Farbe des Modus
 * @param {boolean} urgent Rot statt Akzentfarbe
 */
export function ProgressHairline({ pct, accent = '#a78bfa', urgent = false }) {
  return (
    <div className="shrink-0 h-1.5 bg-[#0d1420]">
      <div className="h-full rounded-r-full"
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

/** Abgesetzte Fußleiste (Eingaben, Status) — trägt jetzt denselben Verlauf wie Kopfzeile
 *  und Seitenleiste statt eines fast durchsichtigen Schwarztons (bg-black/20). Auf dem
 *  Diamant-Karo der Spielfläche (siehe GameSurface) war darauf kaum noch etwas zu lesen —
 *  Regler, Knöpfe und Hinweistexte in der Fußzeile brauchen denselben blickdichten
 *  Untergrund wie alles andere. */
export function GameFooter({ children, className = '' }) {
  return (
    <div className={`shrink-0 px-4 sm:px-8 py-4 bg-gradient-to-b from-[#17293f] to-[#0c1725] border-t-[3px] ${className}`}
      style={{ borderColor: 'var(--cr-arcade-ink)' }}>
      {children}
    </div>
  );
}

/**
 * Spielerkachel für die Seitenleiste — dieselbe Formsprache wie die Draft-Karten
 * (.cr-arcade-card): dicker Tinten-Rand statt einer Fläche ohne Kontur. Der eigene
 * Eintrag bekommt einen goldenen statt dunklen Rand — Gold ist im ganzen Arcade-Skin
 * die Hervorhebungsfarbe (siehe ChunkyButton), das ersetzt das frühere, kaum
 * wahrnehmbare "etwas hellerer Hintergrund" für "das bin ich".
 */
export function PlayerPanel({ isMe = false, header, children, className = '' }) {
  return (
    <div className={`cr-game-card ${isMe ? 'cr-game-card--me' : ''} p-3 space-y-2.5 ${className}`}>
      {header}
      {children}
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
    <div className="grid grid-cols-4 gap-1.5">
      {Array.from({ length: size }, (_, i) => (
        // Blickdichtes Grau statt eines nur 25% deckenden Schwarztons — die Zellen sitzen
        // jetzt auf dem Diamant-Karo (siehe GameSurface) und müssen als eigenes Modul
        // erkennbar bleiben, auch wenn sie noch leer sind.
        <div key={i} className="aspect-square rounded-md overflow-hidden bg-[#0d0d14]"
          style={{ border: '2px solid var(--cr-arcade-ink)' }}>
          {deck[i] ? renderCard(deck[i], i) : null}
        </div>
      ))}
    </div>
  );
}
