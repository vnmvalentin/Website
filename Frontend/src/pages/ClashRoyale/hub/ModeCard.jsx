// Kachel eines Spielmodus — im Hub unter "Minigames" (Klick öffnet die Anleitung) und im
// Modus-Wähler der Lobby (Klick wählt den Modus).
//
// Seit Okt. 2026 ohne Screenshot/Cover: das Design der Modi ändert sich oft, die Bilder
// waren dadurch regelmäßig veraltet. Stattdessen trägt jede Kachel das CR-Symbol des Modus
// (modesConfig.js) und ist deutlich kleiner — mehr Modi auf einen Blick, übersichtlichere Wahl.
//
// WICHTIG: Die Beschreibung ist nur SICHTBAR gekürzt (line-clamp), nicht entfernt — die
// strukturierten Daten der Seite (ItemList in jsonLd.js) verweisen auf diesen Text, und
// Google erwartet ihn auf der Seite wiederzufinden. Im Modus-Wähler (`compact`) fehlt sie,
// dort zählt nur der Name.

import React from 'react';
import { CrBook, CrCheck } from '../ui/CrIcons';

// Kachel neigt sich zum Mauszeiger (nur Maus — auf Touch gäbe es kein "Loslassen" zum Zurückkippen).
// Schreibt CSS-Variablen direkt ans Element statt in den React-Zustand: kein Neu-Rendern pro Bewegung.
function tiltTo(e) {
  if (e.pointerType !== 'mouse') return;
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width - 0.5;
  const y = (e.clientY - r.top) / r.height - 0.5;
  el.style.setProperty('--ry', `${(x * 14).toFixed(2)}deg`);
  el.style.setProperty('--rx', `${(-y * 12).toFixed(2)}deg`);
}
function tiltReset(e) {
  e.currentTarget.style.setProperty('--rx', '0deg');
  e.currentTarget.style.setProperty('--ry', '0deg');
}

/**
 * @param {boolean} [selected]       Goldener Rahmen + "Aktiv"-Abzeichen (Modus-Wähler)
 * @param {string}  [selectedLabel]  Text des Abzeichens
 * @param {boolean} [hideHint]       Blendet den "Anleitung"-Hinweis aus (Modus-Wähler)
 * @param {string}  [newLabel]       Etikett für neue Modi (`mode.isNew`)
 * @param {boolean} [compact]        Nur Symbol + Name, ohne Beschreibung (Modus-Wähler)
 */
export default function ModeCard({
  mode, name, description, comingSoonLabel, howToPlayLabel, openLabel, onOpen,
  selected = false, selectedLabel, hideHint = false, newLabel, compact = false,
}) {
  const Icon = mode.icon;

  return (
    <article className="group h-full">
      <button
        type="button"
        onClick={onOpen}
        aria-label={openLabel}
        aria-pressed={selected}
        onPointerMove={tiltTo}
        onPointerLeave={tiltReset}
        className={`cr-mode-card cr-tilt relative w-full h-full rounded-2xl border-[3px] transition-[transform,border-color,box-shadow] duration-150 cursor-pointer hover:-translate-y-1 hover:z-10 flex ${
          compact ? 'flex-col items-center text-center gap-2 px-2.5 pt-4 pb-3' : 'items-start text-left gap-3 p-3'
        } ${selected ? 'border-[var(--cr-arcade-gold)]' : 'border-[var(--cr-panel-edge)] hover:border-[var(--cr-arcade-gold)]'}`}>

        <span className={`cr-tile-icon shrink-0 ${compact ? 'w-16 h-16' : 'w-14 h-14'}`}>
          <Icon size={compact ? 44 : 38} />
        </span>

        <span className="min-w-0 flex-1 w-full">
          <span className={`block text-white font-cr leading-tight ${compact ? 'text-[15px]' : 'text-base'}`}
            style={{ textShadow: '0 2px 0 rgba(2,8,20,0.6)' }}>
            {name}
          </span>
          {!compact && (
            <span className="text-white/55 text-xs leading-relaxed mt-1 line-clamp-2">{description}</span>
          )}
          {!compact && !hideHint && (
            <span className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-white/45 group-hover:text-[var(--cr-arcade-gold)] transition-colors">
              <CrBook size={14} /> {howToPlayLabel}
            </span>
          )}
        </span>

        {/* Abzeichen oben rechts: Aktiv > Bald verfügbar > Neu */}
        {selected ? (
          <span className="absolute -top-2.5 -right-2 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider pl-1 pr-2 py-0.5 rounded-md bg-[var(--cr-arcade-gold)] text-[#4a2e00] shadow-[0_2px_0_#b07a08]">
            <CrCheck size={14} /> {selectedLabel}
          </span>
        ) : !mode.available ? (
          <span className="absolute -top-2.5 -right-2 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-black/70 text-white/60">
            {comingSoonLabel}
          </span>
        ) : mode.isNew && newLabel ? (
          <span className="absolute -top-2.5 -right-2 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-emerald-500 text-white shadow-[0_2px_0_#047857]">
            {newLabel}
          </span>
        ) : null}
      </button>
    </article>
  );
}
