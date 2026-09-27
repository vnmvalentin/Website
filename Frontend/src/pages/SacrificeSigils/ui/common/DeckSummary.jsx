// ui/common/DeckSummary.jsx — Deckliste mit Kostenkurve und Stammverteilung (Draft-Seitenleiste, Ergebnis, Pfad).
import React from "react";
import { TRIBE_BY_ID } from "../../data/tribes.js";
import { de } from "../../i18n/de.js";
import { CostBadge, SpecialMark } from "../icons/GameIcons.jsx";

const COST_COLOR = { blood: "#8e1b1b", bones: "#cfc3a8", wax: "#f2b54a" };

/**
 * @param {{ cards: any[], title?: string, onCard?: (c: any) => void, compact?: boolean }} props cards = aufgelöste Karten
 */
export default function DeckSummary({ cards, title, onCard, compact = false }) {
  const curve = Array.from({ length: 7 }, () => ({ blood: 0, bones: 0, wax: 0 }));
  const tribes = new Map();
  for (const c of cards) {
    const bucket = c.cost.type === "blood" ? Math.min(6, c.cost.amount) : c.cost.type === "wax" ? Math.min(6, c.cost.amount) : Math.min(6, Math.ceil(c.cost.amount / 2));
    curve[bucket][c.cost.type] += 1;
    tribes.set(c.tribe, (tribes.get(c.tribe) || 0) + 1);
  }
  const sorted = [...cards].sort((a, b) => a.cost.type.localeCompare(b.cost.type) || a.cost.amount - b.cost.amount || a.name.localeCompare(b.name));
  return (
    <div className="space-y-3">
      {title && <p className="ss-title !text-[var(--ink)] text-lg">{title} <span className="text-sm opacity-60">({cards.length})</span></p>}
      <div>
        <p className="text-xs opacity-60 mb-1">Kostenkurve (Knochen in Zweierschritten)</p>
        <div className="ss-curve" aria-label="Kostenkurve">
          {curve.map((col, i) => (
            <div key={i} title={`Stufe ${i}: ${col.blood} Blut, ${col.bones} Knochen, ${col.wax} Wachs`}>
              {["blood", "bones", "wax"].flatMap((t) => Array.from({ length: col[t] }, (_, k) => <span key={`${t}${k}`} style={{ background: COST_COLOR[t], border: "1px solid #1a1612" }} />))}
            </div>
          ))}
        </div>
        <div className="flex justify-between text-[10px] opacity-50 px-0.5">{curve.map((_, i) => <span key={i}>{i}</span>)}</div>
      </div>
      <div className="flex flex-wrap gap-1">
        {[...tribes.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => (
          <span key={t} className="text-xs px-1.5 py-0.5 rounded-sm" style={{ background: `${TRIBE_BY_ID[t]?.color}33`, border: `1px solid ${TRIBE_BY_ID[t]?.color}` }}>{de.tribes[t]?.name} {n}</span>
        ))}
      </div>
      {!compact && (
        <div className="max-h-[42vh] overflow-y-auto pr-1">
          {sorted.map((c) => (
            <div key={c.uid} className="ss-deck-row">
              <span className="w-12 flex-shrink-0"><CostBadge cost={c.cost} size={11} /></span>
              <button type="button" className="text-left flex-1 hover:underline" onClick={() => onCard?.(c)}>{c.name}</button>
              <span className="ss-num opacity-70">{c.special ? <SpecialMark special={c.special} size={12} /> : c.attack}/{c.health}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
