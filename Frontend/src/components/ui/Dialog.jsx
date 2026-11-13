// Dialog.jsx — ein Fenster über der Seite für alle Seiten im Website-Layout.
//
// Übernimmt, was bisher jede Seite einzeln (oder gar nicht) machte: Escape schließt, Klick daneben
// schließt, der Fokus springt ins Fenster und danach zurück auf den Knopf, der es geöffnet hat,
// Tab bleibt im Fenster, und die Seite dahinter scrollt nicht mit.
import React, { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

const WIDTHS = { sm: "max-w-sm", md: "max-w-md", lg: "max-w-lg", xl: "max-w-2xl" };
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {React.ReactNode} [props.title]
 * @param {React.ReactNode} [props.kicker]   kleine Zeile über dem Titel
 * @param {React.ReactNode} [props.footer]   Knöpfe unten rechts
 * @param {"sm"|"md"|"lg"|"xl"} [props.width]
 * @param {boolean} [props.dismissible]  false = weder Escape noch Klick daneben schließen (z. B. während gespeichert wird)
 */
export default function Dialog({ open, onClose, title, kicker, footer, width = "md", dismissible = true, children }) {
  const panelRef = useRef(null);
  const titleId = useId();
  // onClose kommt oft als neue Funktion bei jedem Zeichnen — sonst liefe der Effekt dauernd neu
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const dismissRef = useRef(dismissible);
  dismissRef.current = dismissible;

  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement;
    const panel = panelRef.current;
    // Erstes Feld bevorzugen, sonst das Fenster selbst (der Schließen-Knopf soll nicht der Startpunkt sein)
    const first = panel?.querySelector("input, select, textarea") || panel;
    first?.focus({ preventScroll: true });

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e) => {
      if (e.key === "Escape" && dismissRef.current) {
        e.stopPropagation();
        closeRef.current?.();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const items = [...panel.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === firstItem || document.activeElement === panel)) {
        e.preventDefault();
        lastItem.focus();
      } else if (!e.shiftKey && document.activeElement === lastItem) {
        e.preventDefault();
        firstItem.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      if (opener && typeof opener.focus === "function") opener.focus({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/70"
      onMouseDown={(e) => { if (e.target === e.currentTarget && dismissible) onClose?.(); }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={`w-full ${WIDTHS[width] || WIDTHS.md} max-h-[calc(100dvh-2rem)] flex flex-col rounded-lg bg-surface-raised border border-line text-white shadow-2xl shadow-black/60 focus:outline-none`}
      >
        {(title || kicker || dismissible) && (
          <div className="flex items-start justify-between gap-4 px-5 pt-5 shrink-0">
            <div className="min-w-0">
              {kicker && <p className="text-[11px] font-bold uppercase tracking-wider text-accent-soft">{kicker}</p>}
              {title && <h2 id={titleId} className={`font-display text-lg font-bold text-white ${kicker ? "mt-1" : ""}`}>{title}</h2>}
            </div>
            {dismissible && (
              <button type="button" onClick={onClose} aria-label="Schließen"
                className="p-1.5 -mr-1.5 -mt-0.5 rounded-md text-white/40 hover:text-white hover:bg-white/5 transition-colors">
                <X size={18} />
              </button>
            )}
          </div>
        )}
        <div className="px-5 py-4 overflow-y-auto custom-scrollbar text-sm text-white/80">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 px-5 pb-5 pt-1 shrink-0">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
