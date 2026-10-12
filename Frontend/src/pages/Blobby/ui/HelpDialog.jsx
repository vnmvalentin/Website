// HelpDialog.jsx — Steuerung und Regeln als Fenster über der Seite (vorher zwei Kästen unter dem Startformular).
// Escape und ein Klick daneben schließen es; der Fokus springt hinein und danach zurück.
import React, { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { POWERUP_LABELS } from "../settings";

const Key = ({ children }) => <span className="bv-kbd">{children}</span>;

export default function HelpDialog({ open, onClose }) {
  const boxRef = useRef(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const before = document.activeElement;
    const onKey = (e) => { if (e.key === "Escape") closeRef.current(); };
    document.addEventListener("keydown", onKey);
    boxRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      if (before && typeof before.focus === "function") before.focus();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="bv-modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={boxRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} className="bv-card w-full max-w-[620px] outline-none">
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b-2 border-[var(--bv-ink)]">
          <h2 id={titleId} className="bv-display text-[24px]">Steuerung &amp; Regeln</h2>
          <button type="button" onClick={onClose} className="bv-icon-btn" aria-label="Schließen"><X size={18} /></button>
        </div>
        <div className="grid sm:grid-cols-2 gap-6 p-5">
          <section>
            <h3 className="bv-label mb-3">Steuerung</h3>
            <ul className="space-y-2.5 text-[14px]">
              <li className="flex flex-wrap items-center gap-1.5"><Key>A</Key><Key>D</Key> oder <Key>←</Key><Key>→</Key> laufen</li>
              <li className="flex flex-wrap items-center gap-1.5"><Key>W</Key> oder <Key>↑</Key> springen — halten springt höher</li>
              <li className="flex flex-wrap items-center gap-1.5"><Key>Leertaste</Key> gesammeltes Powerup einsetzen</li>
              <li className="bv-dim">Am Handy: die Tasten unter dem Spielfeld</li>
            </ul>
          </section>
          <section>
            <h3 className="bv-label mb-3">Regeln</h3>
            <ul className="space-y-2 text-[14px] bv-dim list-disc pl-4 marker:text-[var(--bv-coral)]">
              <li>Der Ball darf den Sand auf der eigenen Seite nicht berühren.</li>
              <li>Gespielt wird auf <b className="text-[var(--bv-ink)]">15 Punkte</b> mit 2 Punkten Vorsprung.</li>
              <li>Pfeiler offen: hochspringen, rüberklettern und den Gegner anrempeln ist erlaubt.</li>
              <li>Mit „Max. 3" verliert die Seite den Punkt ab der vierten Ballberührung.</li>
            </ul>
          </section>
          <section className="sm:col-span-2 bv-divider pt-4">
            <h3 className="bv-label mb-2">Powerups</h3>
            <p className="text-[14px] bv-dim mb-3">Erscheinen über dem Pfeiler. Anspringen sammelt sie ein, die Leertaste zündet sie.</p>
            <div className="flex flex-wrap gap-1.5">
              {Object.values(POWERUP_LABELS).map((label) => <span key={label} className="bv-chip">{label}</span>)}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
