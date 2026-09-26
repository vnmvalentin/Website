// OwnerPanel.jsx — was nur der Ersteller mit seinem veröffentlichten Level tun kann: Angaben ändern und löschen.
// Der SPIELINHALT bleibt unangetastet (er ist an die Verifizierung und alle Bestzeiten gebunden). Wer das Gelände ändern will, baut im
// Editor eine neue Fassung und veröffentlicht sie als neues Level.
import React, { useState } from "react";
import { Pencil, Trash2, Loader2, Check } from "lucide-react";
import { updateLevel, deleteLevel } from "./levelsApi.js";
import { DIFFICULTIES, reasonOf } from "./labels.js";
import { BIOMES, BIOME_IDS } from "../gen/biomes.js";
import { LIMITS } from "../level/limits.js";
import { SelectField, TextField, buttonClass, primaryButtonClass } from "../editor/fields.jsx";

export default function OwnerPanel({ detail, onChanged, onDeleted }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const begin = () => {
    setForm({ name: detail.name, description: detail.description || "", tags: detail.tags, difficulty: detail.difficulty, biome: detail.biome });
    setResult(null);
    setOpen(true);
  };

  const save = async () => {
    setBusy(true);
    const res = await updateLevel(detail.code, form);
    setBusy(false);
    setResult(res);
    if (res.status === "ok") {
      setOpen(false);
      onChanged();
    }
  };

  const remove = async () => {
    setBusy(true);
    const res = await deleteLevel(detail.code);
    setBusy(false);
    if (res.status === "ok") onDeleted();
    else { setConfirmDelete(false); setResult(res); }
  };

  return (
    <div className="border border-white/10 rounded-md" data-testid="owner-panel">
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-white">Dein Level</h2>
        {!open && !confirmDelete && (
          <div className="flex gap-2">
            <button type="button" onClick={begin} className={buttonClass}><Pencil size={14} />Angaben ändern</button>
            <button type="button" onClick={() => setConfirmDelete(true)} className={buttonClass} title="Level löschen"><Trash2 size={14} /></button>
          </div>
        )}
      </div>

      {open && form && (
        <div className="p-4 space-y-3">
          <TextField label="Name" value={form.name} maxLength={LIMITS.nameMax} onCommit={(v) => setForm((f) => ({ ...f, name: v }))} />
          <TextField label="Beschreibung" value={form.description} maxLength={LIMITS.descriptionMax} multiline onCommit={(v) => setForm((f) => ({ ...f, description: v }))} />
          <TextField
            label="Tags"
            hint="Mit Komma trennen, höchstens 5"
            value={form.tags.join(", ")}
            onCommit={(v) => setForm((f) => ({ ...f, tags: v.split(",").map((t) => t.trim()).filter(Boolean).slice(0, LIMITS.maxTags) }))}
          />
          <div className="grid grid-cols-2 gap-3">
            <SelectField
              label="Schwierigkeit"
              value={form.difficulty ?? ""}
              options={[{ value: "", label: "Keine Angabe" }, ...DIFFICULTIES]}
              onChange={(v) => setForm((f) => ({ ...f, difficulty: v === "" ? null : Number(v) }))}
            />
            <SelectField label="Biom" value={form.biome} options={BIOME_IDS.map((id) => ({ value: id, label: BIOMES[id].label }))} onChange={(v) => setForm((f) => ({ ...f, biome: v }))} />
          </div>
          <p className="text-xs text-white/40 leading-relaxed">Gelände, Elemente und Tempo-Klasse lassen sich nach der Veröffentlichung nicht ändern — die Bestzeiten gelten genau für diesen Inhalt.</p>
          {result && result.status !== "ok" && (
            <div className="text-sm text-amber-300" role="alert">
              <p>{reasonOf(result)}</p>
              {result.errors?.length > 1 && <ul className="list-disc pl-5 text-white/65">{result.errors.slice(0, 4).map((e) => <li key={e}>{e}</li>)}</ul>}
            </div>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={save} disabled={busy} className={primaryButtonClass}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}Speichern
            </button>
            <button type="button" onClick={() => setOpen(false)} className={buttonClass}>Abbrechen</button>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="p-4 flex flex-wrap items-center gap-3">
          <p className="text-sm text-white/75 flex-1 min-w-[14rem] leading-relaxed">Level wirklich löschen? Bestenliste und Zeiten sind danach weg, der Code funktioniert nicht mehr.</p>
          <button type="button" onClick={remove} disabled={busy} className={`${buttonClass} text-red-300 hover:text-red-200`}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}Löschen
          </button>
          <button type="button" onClick={() => setConfirmDelete(false)} className={buttonClass}>Behalten</button>
        </div>
      )}

      {!open && !confirmDelete && result && result.status !== "ok" && <p className="px-4 py-3 text-sm text-amber-300" role="alert">{reasonOf(result)}</p>}
      {!open && !confirmDelete && !result && (
        <p className="px-4 py-3 text-xs text-white/40 leading-relaxed">Name, Beschreibung, Tags, Schwierigkeit und Biom kannst du jederzeit ändern.</p>
      )}
    </div>
  );
}
