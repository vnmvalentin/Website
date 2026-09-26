// Was der Editor platzieren kann: Gelände, Markierungen und alle Elemente aus dem Schema, in Gruppen für die
// Palette. Ein "Pinsel" ist einer dieser Einträge: { kind: 'tile' | 'marker', ch } oder { kind: 'element', type }.
import { ELEMENT_SCHEMA } from '../sim/elements/schema.js';

export const TILE_ENTRIES = [
  { kind: 'tile', ch: '#', label: 'Block', color: '#5d5d95' },
  { kind: 'tile', ch: 'I', label: 'Eis', color: '#b4ecfb' },
  { kind: 'tile', ch: 'W', label: 'Klebrige Wand', color: '#8fc65a' },
  { kind: 'tile', ch: '>', label: 'Förderband →', color: '#e4b04a' },
  { kind: 'tile', ch: '<', label: 'Förderband ←', color: '#e4b04a' },
  { kind: 'tile', ch: '=', label: 'Einweg-Plattform', color: '#8a90b8' },
];

export const MARKER_ENTRIES = [
  { kind: 'marker', ch: 'S', label: 'Start', color: '#a78bfa' },
  { kind: 'marker', ch: 'C', label: 'Checkpoint', color: '#8b5cf6' },
  { kind: 'marker', ch: 'E', label: 'Ziel', color: '#22c55e' },
  { kind: 'marker', ch: 'G', label: 'Greifanker', color: '#e4e4e7' },
];

const ELEMENT_COLORS = {
  spike: '#ff5a5a', saw: '#ff5a5a', laser: '#ff5a5a', fallingBlock: '#6d6a7c',
  mover: '#7f8cff', crumble: '#8a7a68',
  spring: '#f0b94a', ring: '#7dd3fc', crystal: '#a78bfa', wind: '#7dd3fc', gravityZone: '#c084fc', portal: '#38bdf8',
  switch: '#e05a5a', colorBlock: '#5a8be0', key: '#facc15', door: '#a07a3e',
};

export const ELEMENT_GROUPS = [
  { id: 'hazard', label: 'Gefahren' },
  { id: 'platform', label: 'Plattformen' },
  { id: 'movement', label: 'Bewegung' },
  { id: 'logic', label: 'Schalter und Türen' },
].map((g) => ({
  ...g,
  entries: Object.entries(ELEMENT_SCHEMA)
    .filter(([, s]) => s.category === g.id)
    .map(([type, s]) => ({ kind: 'element', type, label: s.label, color: ELEMENT_COLORS[type] })),
}));

/** Zwei Pinsel gleich? */
export const sameBrush = (a, b) => a.kind === b.kind && a.ch === b.ch && a.type === b.type;

export const DEFAULT_BRUSH = TILE_ENTRIES[0];

/** Kurzer Name für die Statuszeile */
export function brushLabel(brush) {
  if (brush.kind === 'element') return ELEMENT_SCHEMA[brush.type].label;
  const entry = [...TILE_ENTRIES, ...MARKER_ENTRIES].find((e) => e.ch === brush.ch);
  return entry ? entry.label : brush.ch;
}
