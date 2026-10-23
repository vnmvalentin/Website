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
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CrStopwatch, CrBattle } from '../ui/CrIcons';
import { cardImageUrl } from '../data/cards';
import { takePick, flyInto } from '../ui/flyToDeck';
import { avatarUrl } from '../components/avatars';
import { useCrPrefs } from '../ui/crPrefs';

/**
 * Umschalter 2D | 3D für Modi mit 3D-Szene (Elixir Auction, Pyramidendraft). Schreibt
 * dieselbe Einstellung wie das Zahnrad-Fenster (prefs.scene3d), gilt also modusübergreifend
 * und bleibt im Browser gespeichert. Ohne WebGL (`available` = false) gibt es nichts zu wählen.
 */
export function ViewToggle({ available = true, label = 'Ansicht' }) {
  const { prefs, setPref } = useCrPrefs();
  if (!available) return null;
  const opt = (on, text) => (
    <button type="button" aria-pressed={prefs.scene3d === on} onClick={() => setPref('scene3d', on)}
      className={`px-2 py-1 font-cr text-xs leading-none transition-colors ${
        prefs.scene3d === on ? 'bg-[var(--cr-arcade-gold)] text-[#4a2e00]' : 'text-white/55 hover:text-white'}`}>
      {text}
    </button>
  );
  return (
    <span role="group" aria-label={label} title={label}
      className="inline-flex shrink-0 rounded-md overflow-hidden border-2 border-[var(--cr-panel-edge)] bg-[#111d2c]">
      {opt(false, '2D')}{opt(true, '3D')}
    </span>
  );
}

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
    // Ab sm drei Spalten: Runde links, Hinweis (z.B. wer am Zug ist) MITTIG, Zeit rechts.
    // 1fr | auto | 1fr hält die Mitte auch dann mittig, wenn links und rechts unterschiedlich
    // viel steht. Auf dem Handy reicht der Platz dafür nicht — dort bricht die Zeile um.
    <div className="cr-game-header shrink-0 px-4 sm:px-8 py-3.5 sm:py-4 flex flex-wrap items-center gap-3 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:gap-4">
      {/* Rundenzahl im Titel-Look (Kontur + Schlagschatten) wie die Überschriften im Spiel */}
      <h2 className="cr-arcade-title text-2xl sm:text-[30px] leading-none whitespace-nowrap sm:justify-self-start">
        {label} {value}
        {total != null && <span className="text-white/45"> / {total}</span>}
      </h2>

      <div className="min-w-0 sm:justify-self-center flex justify-center">{badge}</div>

      <div className="flex items-center gap-3 sm:gap-4 ml-auto sm:ml-0 sm:justify-self-end">
        {meta && <span className="text-white/35 text-sm hidden sm:block">{meta}</span>}

        {right}

        {/* Zeit als eigenes Abzeichen mit Stoppuhr — wird in den letzten Sekunden rot und pocht */}
        {typeof timerRemaining === 'number' && (
          <span className={`cr-timer ${timerUrgent ? (timerRemaining <= 3 ? 'cr-timer--urgent cr-timer--critical' : 'cr-timer--urgent') : ''}`}>
            <CrStopwatch size={24} />
            <span className="tabular-nums">{timerRemaining}s</span>
          </span>
        )}
      </div>
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
    // Im CR-Look wie ein Ladebalken im Spiel: eingelassene Spur, glänzende Füllung mit
    // Lichtkante oben. Die Farbe bleibt die des Modus (bzw. Rot, wenn die Zeit knapp wird).
    <div className="shrink-0 h-2.5 bg-[#081426] shadow-[inset_0_2px_3px_rgba(0,0,0,0.5)] border-b-2 border-[var(--cr-panel-edge)]">
      <div className="h-full rounded-r-full"
        style={{
          width: `${Math.max(0, Math.min(100, pct))}%`,
          background: `linear-gradient(to bottom, rgba(255,255,255,0.45), rgba(255,255,255,0) 60%), ${urgent ? '#f87171' : accent}`,
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
    <div className={`cr-game-footer shrink-0 px-4 sm:px-8 py-4 ${className}`}>
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
export function PlayerPanel({ isMe = false, active = false, activeLabel, header, children, className = '' }) {
  return (
    <div className={`cr-game-card ${isMe ? 'cr-game-card--me' : ''} ${active ? 'cr-game-card--turn' : ''} relative p-3 space-y-2.5 ${className}`}>
      {/* Am Zug: goldenes Etikett oben rechts + pochender Rand (siehe .cr-game-card--turn) */}
      {active && activeLabel && <span className="cr-turn-tag">{activeLabel}</span>}
      {header}
      {children}
    </div>
  );
}

/**
 * Deutliche Zug-Anzeige für die Kopfzeile rundenbasierter Modi (Snake, Pyramide).
 * Eigener Zug: goldenes, pochendes "Du bist am Zug!"-Schild. Sonst: Avatar + Name in der
 * Spielerfarbe, damit man ohne Suchen sieht, auf wen gewartet wird.
 *
 * @param {object}  player  aktueller Spieler ({ name, color, avatar })
 * @param {boolean} mine    ist es der eigene Zug?
 * @param {string}  text    fertiger Text ("Du bist am Zug!" bzw. "ist am Zug")
 */
export function TurnBanner({ player, mine, text }) {
  if (mine) {
    return (
      <span className="cr-turn-banner cr-turn-banner--mine">
        <CrBattle size={24} />
        {text}
      </span>
    );
  }
  if (!player) return null;
  const url = avatarUrl(player.avatar);
  return (
    <span className="cr-turn-banner" style={{ '--cr-banner': player.color || '#8b5cf6' }}>
      <span className="cr-avatar-pick w-7 h-7 rounded-full overflow-hidden shrink-0 border-2"
        style={{ borderColor: player.color || '#8b5cf6' }}>
        {url && <img src={url} alt="" className="w-full h-full object-cover" />}
      </span>
      <span className="font-cr truncate max-w-[10rem]" style={{ color: player.color || '#fff' }}>{player.name}</span>
      <span className="text-white/70">{text}</span>
    </span>
  );
}

/**
 * 2×4-Deckraster. Leere Plätze bleiben als Fläche sichtbar, damit man sieht,
 * wie weit ein Deck ist, ohne zählen zu müssen.
 *
 * @param {function} renderCard  (card, index) => ReactNode
 */
/**
 * Eine Karte im Deck-Platz. Hat der Spieler genau diese Karte gerade selbst angeklickt, fliegt
 * sie von dort hierher (ui/flyToDeck.js) und staucht sich beim Landen — sonst ploppt sie auf.
 */
function DeckSlotCard({ card, index, renderCard }) {
  const ref = useRef(null);
  const mounted = useRef(false);
  const [phase, setPhase] = useState('pop'); // 'pop' | 'flying' | 'landed'
  // Eigene Mount-Ref statt eines Abbruch-Schalters im Effekt: React (StrictMode) spielt Effekte
  // im Dev-Modus doppelt ab — der zweite Lauf findet keinen Klick mehr, der erste Flug muss die
  // Karte trotzdem wieder sichtbar machen.
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useLayoutEffect(() => {
    const pick = takePick(cardImageUrl(card.id));
    if (!pick) return;
    const flight = flyInto(pick, ref.current);
    if (!flight) return;
    setPhase('flying');
    flight.then(() => { if (mounted.current) setPhase('landed'); });
  }, [card.id]);
  return (
    <div ref={ref} className={`w-full h-full ${phase === 'landed' ? 'cr-card-land' : phase === 'pop' ? 'cr-card-pop' : ''}`}
      style={phase === 'flying' ? { visibility: 'hidden' } : undefined}>
      {renderCard(card, index)}
    </div>
  );
}

export function DeckGrid({ deck = [], size = 8, renderCard }) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {Array.from({ length: size }, (_, i) => (
        // Blickdichtes Grau statt eines nur 25% deckenden Schwarztons — die Zellen sitzen
        // jetzt auf dem Diamant-Karo (siehe GameSurface) und müssen als eigenes Modul
        // erkennbar bleiben, auch wenn sie noch leer sind.
        // Leerer Platz als eingelassene Mulde (wie die leeren Deck-Slots im Spiel)
        <div key={i} className="aspect-[4/5] rounded-md overflow-hidden bg-[#081426] shadow-[inset_0_2px_4px_rgba(0,0,0,0.55)]"
          style={{ border: '2px solid var(--cr-panel-edge)' }}>
          {/* key an der Karte: wechselt der Inhalt eines Platzes, kommt die neue Karte neu herein */}
          {deck[i] ? <DeckSlotCard key={deck[i].id ?? i} card={deck[i]} index={i} renderCard={renderCard} /> : null}
        </div>
      ))}
    </div>
  );
}
