// kit.jsx — Bausteine im Seed-Runners-Look (siehe theme.css): Fläche, Fenster, Reiter, Sterne, Ladeanzeige.
// Farben und Formen stehen in theme.css; hier nur Aufbau und Verhalten, damit alle Seiten gleich aussehen.
import React, { useEffect, useId, useRef } from "react";
import { Loader2, Star, X } from "lucide-react";

/** Eine Fläche wie ein Spielblock: oben die Kante in der Grasnarben-Farbe des Bioms */
export function Panel({ title, actions, children, className = "", bodyClassName = "p-4", as: Tag = "section", ...rest }) {
  return (
    <Tag className={`sr-panel ${className}`} {...rest}>
      {(title || actions) && (
        <div className="sr-panel-head">
          {title ? <h2 className="sr-panel-title min-w-0 truncate">{title}</h2> : <span />}
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </Tag>
  );
}

/** Beschriftetes Feld */
export function Field({ label, hint, children, className = "" }) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="sr-label block mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-xs sr-faint mt-1.5 leading-relaxed">{hint}</span>}
    </label>
  );
}

export function Spinner({ size = 18, className = "" }) {
  return <Loader2 size={size} className={`animate-spin sr-accent-text ${className}`} aria-hidden="true" />;
}

/**
 * Reiter. `tabs`: [{ id, label }]. Tastatur: Pfeiltasten wechseln (wie bei einer echten Reiterleiste).
 */
export function Tabs({ tabs, value, onChange, className = "", label }) {
  const onKey = (e) => {
    const i = tabs.findIndex((t) => t.id === value);
    if (e.key === "ArrowRight") onChange(tabs[(i + 1) % tabs.length].id);
    else if (e.key === "ArrowLeft") onChange(tabs[(i - 1 + tabs.length) % tabs.length].id);
  };
  return (
    <div role="tablist" aria-label={label} className={`sr-tabs ${className}`} onKeyDown={onKey}>
      {tabs.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={t.id === value} tabIndex={t.id === value ? 0 : -1} onClick={() => onChange(t.id)} className="sr-tab">
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** Ein Fenster über der Seite. Escape und ein Klick daneben schließen es; der Fokus springt hinein und danach zurück. */
export function Modal({ open, title, onClose, children, width = 640, footer }) {
  const boxRef = useRef(null);
  const titleId = useId();
  // (onClose über eine Ref: Ein neuer Handler bei jedem Rendern darf den Fokus nicht jedes Mal neu setzen)
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return undefined;
    const before = document.activeElement;
    const onKey = (e) => { if (e.key === "Escape") closeRef.current(); };
    document.addEventListener("keydown", onKey);
    boxRef.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      if (before && typeof before.focus === "function") before.focus();
    };
  }, [open]);
  if (!open) return null;
  return (
    <div className="sr-modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={boxRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} className="sr-modal sr-panel outline-none" style={{ maxWidth: width }}>
        <div className="sr-panel-head">
          <h2 id={titleId} className="sr-panel-title">{title}</h2>
          <button type="button" onClick={onClose} className="sr-icon-btn" aria-label="Schließen"><X size={18} /></button>
        </div>
        <div className="p-4 md:p-5">{children}</div>
        {footer && <div className="sr-divider px-4 md:px-5 py-3 flex flex-wrap justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

/** Sterne-Schnitt als Anzeige: ★ 4,3 (12) — ohne Bewertung ein Strich */
export function RatingBadge({ rating, className = "", compact = false }) {
  const count = rating?.count || 0;
  if (!count) return <span className={`inline-flex items-center gap-1 sr-faint sr-num text-sm ${className}`} title="Noch nicht bewertet"><Star size={13} />–</span>;
  const avg = rating.avg.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return (
    <span className={`inline-flex items-center gap-1 sr-num text-sm ${className}`} title={`${avg} von 5 Sternen, ${count} ${count === 1 ? "Bewertung" : "Bewertungen"}`}>
      <Star size={13} fill="currentColor" style={{ color: "var(--sr-star)" }} />
      <span className="sr-ink">{avg}</span>
      {!compact && <span className="sr-faint">({count})</span>}
    </span>
  );
}

/** Fünf Sterne zum Anklicken. Ein Klick auf die schon gesetzte Zahl nimmt die Bewertung zurück (0). */
export function StarInput({ value, onChange, disabled = false, size = 22 }) {
  const [hover, setHover] = React.useState(0);
  const shown = hover || value || 0;
  return (
    <span className="sr-stars" onMouseLeave={() => setHover(0)} role="radiogroup" aria-label="Bewertung in Sternen">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} ${n === 1 ? "Stern" : "Sterne"}`}
          disabled={disabled}
          data-on={n <= shown}
          onMouseEnter={() => !disabled && setHover(n)}
          onClick={() => onChange(value === n ? 0 : n)}
          className="sr-star-btn"
        >
          <Star size={size} fill={n <= shown ? "currentColor" : "none"} strokeWidth={1.8} />
        </button>
      ))}
    </span>
  );
}

/** Leerer Zustand einer Liste */
export function Empty({ children }) {
  return <p className="text-sm sr-faint py-6 text-center">{children}</p>;
}
