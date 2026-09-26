// Palette: was sich setzen lässt — Gelände, Markierungen und alle Elemente nach Kategorien.
import React from "react";
import { TILE_ENTRIES, MARKER_ENTRIES, ELEMENT_GROUPS, sameBrush } from "./palette.js";

function Entry({ entry, brush, onPick }) {
  const active = sameBrush(entry, brush);
  return (
    <button
      type="button"
      onClick={() => onPick(entry)}
      title={entry.label}
      className={`flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-md text-[13px] border transition-colors ${
        active ? "bg-violet-500/15 border-violet-400/50 text-white" : "border-transparent text-white/70 hover:bg-white/5 hover:text-white"
      }`}
    >
      <span className="w-3.5 h-3.5 rounded-sm shrink-0 border border-white/15" style={{ backgroundColor: entry.color }} />
      <span className="truncate">{entry.label}</span>
    </button>
  );
}

const Group = ({ title, children }) => (
  <div className="px-2.5 py-2.5 border-b border-white/10 last:border-b-0">
    <h3 className="px-2 mb-1.5 text-[11px] font-bold uppercase tracking-wider text-white/40">{title}</h3>
    <div className="space-y-0.5">{children}</div>
  </div>
);

export default function Palette({ brush, onPick }) {
  return (
    <div>
      <Group title="Gelände">
        {TILE_ENTRIES.map((e) => <Entry key={e.ch} entry={e} brush={brush} onPick={onPick} />)}
      </Group>
      <Group title="Markierungen">
        {MARKER_ENTRIES.map((e) => <Entry key={e.ch} entry={e} brush={brush} onPick={onPick} />)}
      </Group>
      {ELEMENT_GROUPS.map((g) => (
        <Group key={g.id} title={g.label}>
          {g.entries.map((e) => <Entry key={e.type} entry={e} brush={brush} onPick={onPick} />)}
        </Group>
      ))}
    </div>
  );
}
