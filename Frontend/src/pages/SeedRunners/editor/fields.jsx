// Formularbausteine des Editors. Zahlenfelder übernehmen ihre Eingabe erst beim Verlassen oder mit Enter:
// Sonst würde jede Ziffer einen eigenen Undo-Schritt erzeugen, und ein halb getippter Wert ("1" auf dem Weg zu
// "12") würde das Dokument kurz ungültig machen.
import React, { useState } from "react";

// (Alle Nutzer liegen in der Spiel-Hülle — ui/GameShell.jsx, ui/theme.css —, deshalb die sr-Klassen)
export const inputClass = "sr-input !px-2.5 !py-1.5 text-sm";

export const buttonClass = "sr-btn sr-btn-sm sr-btn-ghost";

export const primaryButtonClass = "sr-btn sr-btn-sm";

export function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="sr-label block mb-1">{label}</span>
      {children}
      {hint && <span className="block text-xs sr-faint mt-1 leading-snug">{hint}</span>}
    </label>
  );
}

export function NumberField({ label, hint, value, min, max, step = 1, integer = false, unit, onCommit, disabled }) {
  const [draft, setDraft] = useState(null);
  const shown = draft ?? String(value ?? "");
  const commit = () => {
    if (draft === null) return;
    const n = Number(draft.replace(",", "."));
    setDraft(null);
    if (!Number.isFinite(n) || draft.trim() === "") return;
    let v = Math.min(max, Math.max(min, n));
    v = integer ? Math.round(v) : Math.round(v * 1000) / 1000;
    if (v !== value) onCommit(v);
  };
  return (
    <Field label={unit ? `${label} (${unit})` : label} hint={hint}>
      <input
        type="text"
        inputMode="decimal"
        value={shown}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") { setDraft(null); e.currentTarget.blur(); }
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            const n = Math.min(max, Math.max(min, (Number(value) || 0) + (e.key === "ArrowUp" ? step : -step)));
            setDraft(null);
            onCommit(integer ? Math.round(n) : Math.round(n * 1000) / 1000);
          }
        }}
        className={inputClass}
        title={`${min} bis ${max}`}
      />
    </Field>
  );
}

export function SelectField({ label, hint, value, options, onChange, disabled }) {
  return (
    <Field label={label} hint={hint}>
      <select value={String(value)} disabled={disabled} onChange={(e) => onChange(e.target.value)} className={inputClass}>
        {options.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
      </select>
    </Field>
  );
}

export function CheckField({ label, hint, checked, onChange }) {
  return (
    <label className="flex items-start gap-2.5 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 accent-violet-500" />
      <span className="text-sm text-white/80 leading-snug">
        {label}
        {hint && <span className="block text-xs text-white/35 mt-0.5">{hint}</span>}
      </span>
    </label>
  );
}

/** Text: übernimmt beim Verlassen oder mit Enter (mehrzeilig: nur beim Verlassen) */
export function TextField({ label, hint, value, maxLength, multiline, onCommit, placeholder }) {
  const [draft, setDraft] = useState(null);
  const shown = draft ?? value ?? "";
  const commit = () => {
    if (draft === null) return;
    setDraft(null);
    if (draft !== value) onCommit(draft);
  };
  const props = {
    value: shown,
    maxLength,
    placeholder,
    onChange: (e) => setDraft(e.target.value),
    onBlur: commit,
    className: inputClass,
  };
  return (
    <Field label={label} hint={hint}>
      {multiline
        ? <textarea rows={3} {...props} className={`${inputClass} resize-y`} />
        : <input type="text" {...props} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />}
    </Field>
  );
}

export const Section = ({ title, children, action }) => (
  <section className="px-4 py-3.5 border-b border-white/10 last:border-b-0">
    <div className="flex items-center justify-between gap-2 mb-2.5">
      <h3 className="text-[11px] font-bold uppercase tracking-wider text-white/45">{title}</h3>
      {action}
    </div>
    <div className="space-y-3">{children}</div>
  </section>
);
