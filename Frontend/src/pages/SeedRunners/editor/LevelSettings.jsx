// Angaben zum Level als Ganzes: Name, Beschreibung, Tags, Schwierigkeit, Biom, Tempo-Klasse und Größe.
import React, { useState } from "react";
import { BIOMES, BIOME_IDS } from "../gen/biomes.js";
import { SPEED_CLASSES, SPEED_CLASS_IDS } from "../sim/classes.js";
import { LIMITS } from "../level/limits.js";
import { TextField, SelectField, NumberField, Section, buttonClass } from "./fields.jsx";

export default function LevelSettings({ doc, onMeta, onSpeedClass, onResize }) {
  const [size, setSize] = useState({ w: null, h: null, alignX: "left", alignY: "bottom" });
  const w = size.w ?? doc.width;
  const h = size.h ?? doc.height;
  const dirty = w !== doc.width || h !== doc.height;

  return (
    <Section title="Level">
      <TextField label="Name" value={doc.meta.name} maxLength={LIMITS.nameMax} placeholder="Wie heißt dein Level?" onCommit={(v) => onMeta({ name: v })} />
      <TextField label="Beschreibung" value={doc.meta.description} maxLength={LIMITS.descriptionMax} multiline onCommit={(v) => onMeta({ description: v })} />
      <TextField
        label="Tags"
        hint="Mit Komma trennen, höchstens 5"
        value={doc.meta.tags.join(", ")}
        onCommit={(v) => onMeta({ tags: v.split(",").map((t) => t.trim()).filter(Boolean).slice(0, LIMITS.maxTags) })}
      />
      <div className="grid grid-cols-2 gap-3">
        <SelectField
          label="Schwierigkeit"
          value={doc.meta.difficulty ?? ""}
          options={[{ value: "", label: "Keine Angabe" }, ...[1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))]}
          onChange={(v) => onMeta({ difficulty: v === "" ? null : Number(v) })}
        />
        <SelectField label="Biom" value={doc.meta.biome} options={BIOME_IDS.map((id) => ({ value: id, label: BIOMES[id].label }))} onChange={(v) => onMeta({ biome: v })} />
      </div>
      <SelectField
        label="Tempo-Klasse"
        hint="Gilt für alle, die das Level spielen. Ändert die Sprungweiten — Testlauf danach wiederholen."
        value={doc.speedClass}
        options={SPEED_CLASS_IDS.map((id) => ({ value: id, label: SPEED_CLASSES[id].label }))}
        onChange={onSpeedClass}
      />
      <div className="grid grid-cols-2 gap-3">
        <NumberField label="Breite" unit="Kacheln" value={w} min={LIMITS.minWidth} max={LIMITS.maxWidth} integer onCommit={(v) => setSize((s) => ({ ...s, w: v }))} />
        <NumberField label="Höhe" unit="Kacheln" value={h} min={LIMITS.minHeight} max={LIMITS.maxHeight} integer onCommit={(v) => setSize((s) => ({ ...s, h: v }))} />
      </div>
      {dirty && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <SelectField label="Inhalt bleibt" value={size.alignX} options={[{ value: "left", label: "Links" }, { value: "right", label: "Rechts" }]} onChange={(v) => setSize((s) => ({ ...s, alignX: v }))} />
            <SelectField label="und" value={size.alignY} options={[{ value: "bottom", label: "Unten" }, { value: "top", label: "Oben" }]} onChange={(v) => setSize((s) => ({ ...s, alignY: v }))} />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className={`${buttonClass} flex-1`}
              onClick={() => { onResize(w, h, size.alignX, size.alignY); setSize((s) => ({ ...s, w: null, h: null })); }}
            >
              Größe ändern
            </button>
            <button type="button" className={buttonClass} onClick={() => setSize((s) => ({ ...s, w: null, h: null }))}>Abbrechen</button>
          </div>
        </>
      )}
    </Section>
  );
}
