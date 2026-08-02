// Offcanvas-Panel: Auf dem Desktop fährt es von rechts ein, auf dem Handy von unten als
// Blatt über fast die volle Höhe. Der Unterschied ist reine CSS-Sache (siehe
// .cr-drawer-panel in index.css); die Komponente selbst kennt keine Bildschirmgröße.
//
// Genutzt von der Mitspielerliste der Spielmodi (modes/ModeShell.jsx). Das
// Einstellungsfenster des Hosts lag hier ebenfalls, ist aber auf den zentrierten Dialog
// (ui/Modal.jsx) umgezogen — am rechten Bildschirmrand war es auf breiten Schirmen zu
// weit weg von dem, was man gerade einstellt.

import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useFocusTrap } from './useFocusTrap';

/**
 * @param {boolean}         open      Steuert Sichtbarkeit; false = nichts im DOM
 * @param {Function}        onClose   Schließen (Backdrop, X, Escape)
 * @param {string}          title     Überschrift
 * @param {React.ReactNode} icon      Symbol links neben dem Titel (optional)
 * @param {React.ReactNode} footer    Fest stehender Fußbereich, z.B. "Spiel starten"
 */
export default function Drawer({ open, onClose, title, icon, footer, children }) {
  const containerRef = useFocusTrap(open, onClose);
  if (!open) return null;

  // Über ein Portal direkt an <body>, NICHT an die Stelle im Seitenbaum:
  // Der Inhaltsbereich der Seite ist `relative z-0` (pages/Layout.jsx) und bildet damit
  // einen eigenen Stacking-Context. Ein z-50 darin bleibt trotzdem unter dem Seiten-Header
  // (z-40) — die Kopfzeile des Drawers samt Schließen-Kreuz verschwände hinter der
  // Navigation. Am body hängend gibt es diesen Deckel nicht.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-stretch sm:justify-end">
      <div className="cr-drawer-backdrop absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="cr-drawer-panel relative w-full sm:w-[26rem] max-h-[92vh] sm:max-h-none sm:h-full
                   flex flex-col bg-[#0d0d18] border-t sm:border-t-0 sm:border-l border-white/10
                   rounded-t-2xl sm:rounded-none shadow-2xl shadow-black/60">
        {/* Zieh-Griff: rein optisch, signalisiert auf dem Handy "das ist ein Blatt" */}
        <div className="sm:hidden flex justify-center pt-2.5 pb-1 shrink-0">
          <span className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/10 shrink-0">
          <span className="text-white font-bold flex items-center gap-2 min-w-0">
            {icon}
            <span className="truncate">{title}</span>
          </span>
          <button onClick={onClose} aria-label="Close"
            className="text-white/40 hover:text-white p-1.5 -mr-1.5 rounded-lg hover:bg-white/5 transition-colors shrink-0">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar px-5 py-5">{children}</div>

        {/* Fußbereich klebt am unteren Rand — die Hauptaktion bleibt erreichbar,
            egal wie weit man in den Einstellungen gescrollt hat. */}
        {footer && (
          <div className="shrink-0 border-t border-white/10 px-5 py-4 bg-[#0d0d18]">{footer}</div>
        )}
      </div>
    </div>,
    document.body
  );
}
