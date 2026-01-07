// bingoUtils.js

export function hexToRgba(hex, alpha = 1) {
  if (!hex) return `rgba(0,0,0,${alpha})`;
  let h = String(hex).replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length !== 6) return `rgba(0,0,0,${alpha})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const a = Math.max(0, Math.min(1, Number(alpha)));
  return `rgba(${r},${g},${b},${a})`;
}

export function parseJoinKey(input) {
  const t = String(input || "").trim();
  if (!t) return "";
  const m = t.match(/(join_[a-zA-Z0-9_-]+)/);
  return m ? m[1] : "";
}

export function clamp(n, min, max) {
  const v = Number(n);
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

export function gridFontSize(gridSize) {
  // Angepasste Formel für größere Standardschrift
  const g = Number(gridSize) || 5;
  // Vorher: 30 - g * 2.8 (~16px bei 5x5)
  // Neu: Startet höher, skaliert aber immer noch runter bei mehr Feldern
  const base = 44 - g * 3.5; 
  return Math.max(14, Math.round(base));
}