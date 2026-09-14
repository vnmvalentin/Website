// Einheitlicher Dialog für Kartenpool, Deck-QR, Admin-Kartentausch und Verlauf.
//
// Vorher hatte jedes Modal seine eigene Kopie aus Backdrop, Kopfzeile und
// stopPropagation — vier Varianten mit leicht unterschiedlichen Abständen und
// keine davon mit Fokusklammer oder Escape.

import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useFocusTrap } from './useFocusTrap';

/**
 * @param {React.ReactNode} icon      Symbol links neben dem Titel (optional)
 * @param {string}          title     Überschrift des Dialogs
 * @param {Function}        onClose   Schließen (Backdrop-Klick, X, Escape)
 * @param {string}          size      'sm' | 'md' | 'lg' | 'xl' — Maximalbreite
 * @param {React.ReactNode} footer    Fest stehender Bereich unter dem Inhalt (optional)
 * @param {boolean}         bodyScroll  false = der Inhalt regelt sein Scrollen selbst
 */
export default function Modal({
  icon, title, onClose, size = 'lg', footer, bodyScroll = true, children,
}) {
  const containerRef = useFocusTrap(true, onClose);
  const maxWidth = { sm: 'max-w-sm', md: 'max-w-2xl', lg: 'max-w-4xl', xl: 'max-w-6xl' }[size] || 'max-w-4xl';

  // Portal an <body>, aus demselben Grund wie beim Drawer: der Inhaltsbereich der Seite
  // ist `relative z-0` (pages/Layout.jsx) und deckelt jedes z-index darin unter dem
  // Seiten-Header. Ohne Portal legt sich die Navigation über den Dialog.
  return createPortal(
    <div
      className="cr-modal-backdrop fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}>
      {/* Auf dem Handy sitzt der Dialog am unteren Rand und darf fast die volle Höhe
          nutzen; ab sm ist er zentriert. So bleibt die Kopfzeile in Daumenreichweite. */}
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={e => e.stopPropagation()}
        className={`cr-modal-panel cr-arcade-panel w-full ${maxWidth} max-h-[92vh] sm:max-h-[85vh] flex flex-col rounded-b-none sm:rounded-b-[18px]`}>
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b-2 border-white/5 shrink-0">
          <span className="text-white font-arcade font-semibold text-base flex items-center gap-2.5 min-w-0">
            {icon}
            <span className="truncate">{title}</span>
          </span>
          <button onClick={onClose} aria-label="Close"
            className="text-white/40 hover:text-white p-1.5 -mr-1.5 rounded-lg hover:bg-white/5 transition-colors shrink-0">
            <X size={16} />
          </button>
        </div>

        <div className={bodyScroll ? 'overflow-y-auto custom-scrollbar' : 'flex-1 flex flex-col min-h-0'}>
          {children}
        </div>

        {footer && <div className="shrink-0 border-t border-white/5 px-5 py-4">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}
