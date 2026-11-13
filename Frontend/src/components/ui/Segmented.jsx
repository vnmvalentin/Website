// Segmented.jsx — Umschalter aus wenigen Knöpfen, von denen genau einer gilt (Sprache DE/EN,
// Party/Halloween, Ansicht A/B). Für mehr als vier Möglichkeiten lieber <Select>.
import React from "react";

/**
 * @param {object} props
 * @param {{ value: string, label: React.ReactNode, icon?: React.ComponentType<{size?: number}> }[]} props.options
 * @param {string} props.value
 * @param {(value: string) => void} props.onChange
 * @param {string} [props.label]   Name der Gruppe für Screenreader
 * @param {"sm"|"md"} [props.size]
 */
export default function Segmented({ options, value, onChange, label, size = "md", className = "" }) {
  const h = size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-sm";
  return (
    <div role="group" aria-label={label} className={`inline-flex shrink-0 rounded-lg bg-black/30 border border-line p-0.5 ${className}`}>
      {options.map(({ value: v, label: text, icon: Icon }) => {
        const active = v === value;
        return (
          <button
            key={v}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(v)}
            className={`inline-flex items-center gap-1.5 rounded-md font-semibold transition-colors ${h} ${
              active ? "bg-accent text-white" : "text-white/50 hover:text-white"
            }`}
          >
            {Icon && <Icon size={14} />}
            {text}
          </button>
        );
      })}
    </div>
  );
}
