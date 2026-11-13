// Tabs.jsx — Reiterleiste für Seiten im Website-Layout.
//
// Nur die Leiste: welcher Inhalt darunter steht, entscheidet die Seite selbst (so passt der Baustein
// auch auf Seiten, deren Reiter an der Adresse hängen). Pfeiltasten wechseln wie bei echten Reitern.
import React, { useRef } from "react";

/**
 * @param {object} props
 * @param {{ value: string, label: React.ReactNode, icon?: React.ComponentType<{size?: number}>, badge?: React.ReactNode, disabled?: boolean }[]} props.items
 * @param {string} props.value
 * @param {(value: string) => void} props.onChange
 * @param {string} [props.label]  Name der Leiste für Screenreader
 * @param {string} [props.idPrefix]  ergibt id/aria-controls, falls die Seite die Inhaltsflächen verknüpfen will
 */
export default function Tabs({ items, value, onChange, label, idPrefix, className = "" }) {
  const listRef = useRef(null);

  const onKeyDown = (e) => {
    const keys = { ArrowRight: 1, ArrowLeft: -1, Home: "first", End: "last" };
    if (!(e.key in keys)) return;
    e.preventDefault();
    const enabled = items.filter((it) => !it.disabled);
    if (!enabled.length) return;
    const idx = enabled.findIndex((it) => it.value === value);
    const step = keys[e.key];
    const next =
      step === "first" ? enabled[0]
        : step === "last" ? enabled[enabled.length - 1]
          : enabled[(idx + step + enabled.length) % enabled.length];
    onChange(next.value);
    // Fokus mitnehmen, sonst bleibt er auf dem alten Reiter stehen
    requestAnimationFrame(() => listRef.current?.querySelector(`[data-tab="${CSS.escape(next.value)}"]`)?.focus());
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={`flex items-stretch gap-1 border-b border-line overflow-x-auto custom-scrollbar ${className}`}
    >
      {items.map(({ value: v, label: text, icon: Icon, badge, disabled }) => {
        const active = v === value;
        return (
          <button
            key={v}
            type="button"
            role="tab"
            data-tab={v}
            id={idPrefix ? `${idPrefix}-tab-${v}` : undefined}
            aria-controls={idPrefix ? `${idPrefix}-panel-${v}` : undefined}
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(v)}
            className={`relative inline-flex items-center gap-2 px-3.5 h-10 -mb-px text-sm font-semibold whitespace-nowrap border-b-2 transition-colors
              disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-soft
              ${active ? "border-accent text-white" : "border-transparent text-white/50 hover:text-white/85"}`}
          >
            {Icon && <Icon size={15} />}
            {text}
            {badge !== undefined && badge !== null && badge !== false && (
              <span className="min-w-5 h-5 px-1.5 rounded-md bg-white/10 text-[11px] leading-5 text-center text-white/70">{badge}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
