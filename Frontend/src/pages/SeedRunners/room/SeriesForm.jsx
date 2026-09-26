// SeriesForm.jsx — der Rundenplan einer Lobby: wie viele Runden, welches Level in welcher Runde, dazu optional eine Runde mit
// dem heutigen Tages-Level. Befüllt wird der Plan über die Level-Auswahl (LevelPicker.jsx); hier sieht man die Reihe und kann
// eine Runde wieder auf „Zufällig“ setzen.
//
// Einträge (siehe Backend/seedRunners/roomManager.js): { kind: 'random' } · { kind: 'custom', code } (Community-Level) ·
// { kind: 'seed', seed, biome } (ein bestimmtes Zufallslevel, z. B. ein Favorit). Der fertige Plan steht erst fest, wenn der
// Host startet (an zufälliger Stelle kommt dann ggf. die Tages-Runde dazu).
import React, { useEffect, useState } from "react";
import { Shuffle, X, LibraryBig } from "lucide-react";
import { getLevel } from "../levels/levelsApi.js";
import { BIOMES } from "../gen/biomes.js";
import { seedLine, entryKey } from "../ui/levelRef.js";

const ROUNDS_OPTIONS = [1, 2, 3, 4, 5];

// Namen veröffentlichter Level, einmal je Code nachgeschlagen (für Einträge, die nicht aus der Auswahl hier stammen —
// Neuladen, ein anderer Host)
const nameCache = new Map();
function useCustomName(code, known) {
  const [label, setLabel] = useState(() => known || nameCache.get(code) || null);
  useEffect(() => {
    if (!code || known) return undefined;
    if (nameCache.has(code)) { setLabel(nameCache.get(code)); return undefined; }
    let alive = true;
    getLevel(code).then((l) => {
      const v = l ? { title: l.name, sub: `von ${l.creator.name}`, biome: l.biome } : { title: code, sub: "nicht (mehr) verfügbar — wird zufällig" };
      nameCache.set(code, v);
      if (alive) setLabel(v);
    }).catch(() => {});
    return () => { alive = false; };
  }, [code, known]);
  return known || label;
}

function Slot({ index, entry, label: known, disabled, onReset, showIndex }) {
  const customLabel = useCustomName(entry.kind === "custom" ? entry.code : null, entry.kind === "custom" ? known : null);
  let title = "Zufällig";
  let sub = "neues Level aus einem frischen Seed";
  let biome = null;
  if (entry.kind === "custom") {
    title = customLabel?.title || entry.code;
    sub = customLabel?.sub || "Community-Level";
    biome = customLabel?.biome;
  } else if (entry.kind === "seed") {
    title = known?.title || "Zufallslevel";
    sub = known?.sub || seedLine(entry.seed, entry.biome);
    biome = entry.biome;
  }
  const pal = BIOMES[biome]?.palette;
  return (
    <li className="flex items-center gap-3 py-2">
      {showIndex && <span className="sr-num sr-faint w-5 text-right shrink-0">{index + 1}</span>}
      <span
        className="w-8 h-8 shrink-0 rounded-[2px] flex items-center justify-center"
        style={pal ? { background: pal.tile, borderTop: `3px solid ${pal.tileTop}` } : { boxShadow: "inset 0 0 0 1px var(--sr-line-strong)" }}
        aria-hidden="true"
      >
        {entry.kind === "random" ? <Shuffle size={14} className="sr-faint" /> : entry.kind === "custom" ? <LibraryBig size={14} style={{ color: pal?.accent }} /> : <Shuffle size={14} style={{ color: pal?.accent }} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`truncate leading-tight ${entry.kind === "random" ? "sr-dim" : "font-semibold sr-ink"}`}>{title}</p>
        <p className="text-xs sr-faint truncate">{sub}</p>
      </div>
      {entry.kind !== "random" && !disabled && (
        <button type="button" onClick={onReset} className="sr-icon-btn !w-8 !h-8 shrink-0" title="Wieder zufällig" aria-label={`Runde ${index + 1} wieder zufällig`}>
          <X size={15} />
        </button>
      )}
    </li>
  );
}

/**
 * @param settings  { rounds, playlist, includeDaily } — Teil der Rundeneinstellungen
 * @param onChange  Patch, z. B. { rounds: 3 } oder { playlist: [...] }
 * @param labels    Namen der gewählten Level (entryKey → { title, sub, biome }), aus der Level-Auswahl
 * @param disabled  nur der Host darf ändern
 */
export default function SeriesForm({ settings, onChange, labels = {}, disabled = false }) {
  const reset = (i) => onChange({ playlist: settings.playlist.map((e, j) => (j === i ? { kind: "random" } : e)) });
  const chosen = settings.playlist.some((e) => e.kind !== "random");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <label className="block">
          <span className="sr-label block mb-1.5">Runden</span>
          <select disabled={disabled} value={settings.rounds} onChange={(e) => onChange({ rounds: Number(e.target.value) })} className="sr-input !w-auto">
            {ROUNDS_OPTIONS.map((n) => <option key={n} value={n}>{n === 1 ? "1 Runde" : `${n} Runden`}</option>)}
          </select>
        </label>
        <label className={`flex items-center gap-2.5 pb-2.5 ${disabled ? "opacity-50" : "cursor-pointer"}`}>
          <input type="checkbox" disabled={disabled} checked={settings.includeDaily} onChange={(e) => onChange({ includeDaily: e.target.checked })} className="sr-check" />
          <span className="text-sm sr-ink">Tages-Level einbauen</span>
        </label>
      </div>

      <ul className="sr-rows sr-sunk px-3">
        {settings.playlist.map((entry, i) => (
          <Slot key={i} index={i} entry={entry} label={labels[entryKey(entry)]} disabled={disabled} onReset={() => reset(i)} showIndex={settings.rounds > 1} />
        ))}
      </ul>

      <p className="text-xs sr-faint leading-relaxed">
        {disabled
          ? "Der Host stellt die Runden zusammen."
          : chosen
            ? "Gewählte Level laufen genau so; „Zufällig“ bekommt bei jedem Start einen frischen Seed."
            : "Wähle in der Level-Auswahl Level für die Runden aus — Favoriten, Community-Level oder bestbewertete Zufallslevel. Ohne Wahl ist jede Runde zufällig."}
        {settings.rounds > 1 && " Punkte: Teilnehmerzahl minus Platz plus 1, aufgegeben zählt 0."}
        {settings.includeDaily && " Das Tages-Level landet an einer zufälligen Stelle in der Reihe."}
      </p>
    </div>
  );
}
