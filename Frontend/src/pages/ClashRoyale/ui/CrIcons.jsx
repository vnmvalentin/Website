// Clash-Royale-eigene Symbole als Inline-SVG.
//
// WARUM SELBST GEZEICHNET UND NICHT AUS LUCIDE:
// Für Elixier stand bisher überall `Droplets` — ein Wassertropfen. Der Modus heißt aber
// „Elixir Auction", und der Elixiertropfen ist das Symbol, das jeder aus dem Spiel kennt.
// Ein generischer Wassertropfen daneben wirkt wie ein Platzhalter.
//
// WARUM NICHT DIE ORIGINALGRAFIK:
// Supercells Artwork darf nicht als Datei mitgeliefert werden (Fan-Content-Policy) und
// wäre für ein 12px-Symbol auch viel zu schwer. Diese Formen sind eigene, stark
// vereinfachte Nachzeichnungen — sie tragen den Wiedererkennungswert, sind aber nur ein
// paar hundert Byte und skalieren verlustfrei.
//
// WARUM forwardRef UND NICHT EINFACH function:
// Nicht kosmetisch, sondern notwendig. Das Einstellungs-Schema (lobby/hostSettingsSchema.js)
// erlaubt für jedes Feld entweder einen Wert oder eine Funktion, die ihn aus dem Kontext
// berechnet; HostSettings löst das mit `typeof v === 'function' ? v(ctx) : v` auf.
// Lucide-Symbole sind forwardRef-OBJEKTE (typeof 'object') und rutschen dort unverändert
// durch. Eine schlichte Funktionskomponente wäre stattdessen als Resolver AUFGERUFEN
// worden — sie hätte den Kontext als Props bekommen und ein fertiges Element
// zurückgegeben, das React dann als Komponententyp verwenden sollte. Ergebnis: „Element
// type is invalid", der Lazy-Route-Boundary fing es ab und die ganze Lobby-Route blieb
// leer. forwardRef macht diese Symbole zu demselben Typ wie lucide — überall austauschbar.
//
// Alle Symbole verhalten sich damit wie lucide-Symbole: `size` steuert Breite und Höhe,
// `className` die Farbe drumherum. Die Füllfarben des Elixiertropfens stehen fest, weil
// genau sie ihn erkennbar machen — ein graues Elixier wäre kein Elixier mehr.

import React from 'react';

/**
 * Elixiertropfen — rund unten, spitz oben, mit Glanzpunkt.
 * Genutzt überall dort, wo es um Elixier geht (Auktion, Elixir Rush).
 */
export const ElixirDrop = React.forwardRef(function ElixirDrop(
  { size = 14, className = '', title, ...rest }, ref,
) {
  return (
    <svg ref={ref} width={size} height={size} viewBox="0 0 24 24" className={className}
      role={title ? 'img' : 'presentation'} aria-hidden={title ? undefined : true}
      focusable="false" {...rest}>
      {title && <title>{title}</title>}
      <path d="M12 1.6c0 0 7.6 8.9 7.6 13.4a7.6 7.6 0 1 1-15.2 0C4.4 10.5 12 1.6 12 1.6z"
        fill="#c026d3" stroke="#7e1d8f" strokeWidth="1.1" strokeLinejoin="round" />
      {/* Glanzpunkt oben links — ohne ihn wirkt der Tropfen flach */}
      <ellipse cx="9.4" cy="13.6" rx="1.9" ry="2.8" fill="#f5b8ff" opacity="0.75"
        transform="rotate(-18 9.4 13.6)" />
    </svg>
  );
});

/**
 * Kartenstapel — für „Karten pro Runde", Deckgrößen, Marktplatz.
 * Zwei angeschnittene Karten hinter einer vorderen.
 */
export const CardStack = React.forwardRef(function CardStack(
  { size = 14, className = '', title, ...rest }, ref,
) {
  return (
    <svg ref={ref} width={size} height={size} viewBox="0 0 24 24" className={className}
      role={title ? 'img' : 'presentation'} aria-hidden={title ? undefined : true}
      focusable="false" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" {...rest}>
      {title && <title>{title}</title>}
      <rect x="8" y="3" width="12" height="16" rx="2" />
      <path d="M5 6v13a2 2 0 0 0 2 2h9" />
    </svg>
  );
});

/**
 * Königsturm — steht für die Arena/den Spielmodus selbst.
 * Zinnen oben, schmaler Sockel unten.
 */
export const KingTower = React.forwardRef(function KingTower(
  { size = 14, className = '', title, ...rest }, ref,
) {
  return (
    <svg ref={ref} width={size} height={size} viewBox="0 0 24 24" className={className}
      role={title ? 'img' : 'presentation'} aria-hidden={title ? undefined : true}
      focusable="false" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" {...rest}>
      {title && <title>{title}</title>}
      <path d="M4 9V5l3 2 5-4 5 4 3-2v4" />
      <path d="M5 9h14v11H5z" />
      <path d="M10 20v-4h4v4" />
    </svg>
  );
});
