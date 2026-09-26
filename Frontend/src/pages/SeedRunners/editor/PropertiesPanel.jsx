// Eigenschaften des gewählten Elements — das Formular entsteht aus dem Schema (sim/elements/schema.js), also
// stimmen Bereiche und Beschriftungen mit dem überein, was der Server annimmt.
import React from "react";
import { Trash2, Route, Link2 } from "lucide-react";
import { ELEMENT_SCHEMA, CHANNELS } from "../sim/elements/schema.js";
import { CHANNEL_COLORS } from "../client/drawElements.js";
import { paramsOf } from "./ops.js";
import { NumberField, SelectField, CheckField, Section, buttonClass } from "./fields.jsx";

const DIR_LABELS = {
  up: "Nach oben", down: "Nach unten", left: "Nach links", right: "Nach rechts",
  upLeft: "Schräg links oben", upRight: "Schräg rechts oben", downLeft: "Schräg links unten", downRight: "Schräg rechts unten",
};
const dirOptions = (options, auto) => [
  ...(auto ? [{ value: "", label: "Automatisch (am Block)" }] : []),
  ...options.map((o) => ({ value: o, label: DIR_LABELS[o] || o })),
];
const channelOptions = Array.from({ length: CHANNELS }, (_, i) => ({ value: i, label: `Kanal ${i + 1}` }));

function ChannelChips({ channel }) {
  const [a, b] = CHANNEL_COLORS[channel] || CHANNEL_COLORS[0];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-white/45">
      <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: a }} />
      <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: b }} />
      Farben dieses Kanals
    </span>
  );
}

/** Vorschlag für eine neue Nummer: nach der zuletzt vergebenen — bei "eins nach dem anderen nummerieren" */
const nextFreeOrder = (doc) => (doc.checkpointOrder?.length
  ? Math.max(...doc.checkpointOrder.map((o) => o.order)) + 1
  : 1);

function CheckpointSection({ checkpoint, doc, onSetOrder, onDelete }) {
  const hasOrder = checkpoint.order !== undefined;
  return (
    <Section title="Checkpoint" action={<span className="text-xs text-white/35 tabular-nums">{checkpoint.tx} | {checkpoint.ty}</span>}>
      <CheckField
        label="Feste Reihenfolge-Nummer"
        hint="Ohne Nummer zählt die Position (links nach rechts) — bei einem senkrechten Level (z. B. einem Turm) kann das die falsche Reihenfolge ergeben. Mit fester Nummer zählt nur sie, dann aber bei JEDEM Checkpoint im Level."
        checked={hasOrder}
        onChange={(on) => onSetOrder(on ? nextFreeOrder(doc) : undefined)}
      />
      {hasOrder && (
        <NumberField
          label="Nummer"
          hint="Höher = später erreicht. Muss bei jedem nummerierten Checkpoint im Level unterschiedlich sein — zwei Türme desselben Levels dürfen aber gleich zählen."
          value={checkpoint.order}
          min={1}
          max={999}
          step={1}
          integer
          onCommit={onSetOrder}
        />
      )}
      <button type="button" onClick={onDelete} className={`${buttonClass} w-full text-red-300 hover:text-red-200`}>
        <Trash2 size={14} />
        Checkpoint löschen
      </button>
    </Section>
  );
}

export default function PropertiesPanel({ el, doc, checkpoint, onChange, onDelete, onSetCheckpointOrder, pathEdit, onTogglePath, onFocusTile }) {
  if (!el) {
    if (checkpoint) return <CheckpointSection checkpoint={checkpoint} doc={doc} onSetOrder={onSetCheckpointOrder} onDelete={onDelete} />;
    return (
      <Section title="Element">
        <p className="text-sm text-white/40 leading-relaxed">
          Wähle mit dem Auswahl-Werkzeug (V) ein Element oder einen Checkpoint im Level, um seine Eigenschaften zu ändern.
        </p>
      </Section>
    );
  }

  const schema = ELEMENT_SCHEMA[el.type];
  const p = paramsOf(el);
  const set = (patch) => onChange(patch);
  const num = (key) => {
    const def = schema.params[key];
    return (
      <NumberField
        key={key}
        label={def.label}
        hint={def.hint}
        value={p[key] ?? def.default}
        min={def.min}
        max={def.max}
        step={def.step}
        integer={!!def.int}
        unit={def.unit}
        onCommit={(v) => set({ [key]: v })}
      />
    );
  };
  const en = (key, options) => {
    const def = schema.params[key];
    return (
      <SelectField
        key={key}
        label={def.label}
        hint={def.hint}
        value={p[key] ?? ""}
        options={options}
        onChange={(v) => set({ [key]: v === "" ? undefined : v })}
      />
    );
  };

  const fields = [];
  switch (el.type) {
    case "spike": {
      const retracting = p.period !== undefined;
      fields.push(en("dir", dirOptions(schema.params.dir.options, true)));
      fields.push(
        <CheckField
          key="retracting"
          label="Ein-/ausfahrend statt fest ausgefahren"
          hint="Fährt im Takt ein und aus; eine Vorwarnung kündigt das Ausfahren an."
          checked={retracting}
          onChange={(on) => set(on ? { period: 3, on: 1.5 } : { period: undefined, on: undefined, warn: undefined, phase: undefined })}
        />,
      );
      if (retracting) fields.push(num("period"), num("on"), num("warn"), num("phase"));
      break;
    }
    case "saw": {
      const mode = el.path ? "path" : el.orbit !== undefined ? "orbit" : "still";
      fields.push(
        <SelectField
          key="mode"
          label="Bewegung"
          value={mode}
          options={[{ value: "still", label: "Stehend" }, { value: "path", label: "Auf einem Pfad" }, { value: "orbit", label: "Kreisbahn um die Kachel" }]}
          onChange={(v) => {
            if (v === "still") set({ path: undefined, orbit: undefined });
            else if (v === "path") set({ path: [[0, 0], [6, 0]], orbit: undefined });
            else set({ orbit: 3, path: undefined });
          }}
        />,
        num("radius"),
      );
      if (mode === "path") fields.push(num("speed"), num("phase"));
      if (mode === "orbit") fields.push(num("orbit"), num("turnsPerSecond"), num("phase"));
      break;
    }
    case "laser":
      fields.push(en("dir", dirOptions(schema.params.dir.options, false)), num("period"), num("on"), num("warn"), num("phase"));
      break;
    case "fallingBlock":
      fields.push(num("width"), num("height"), num("range"), num("margin"), num("shake"), num("reset"));
      break;
    case "mover":
      fields.push(
        num("width"),
        num("speed"),
        num("phase"),
        <SelectField
          key="mode"
          label="Bahn"
          value={p.mode}
          options={[{ value: "pingpong", label: "Hin und zurück" }, { value: "loop", label: "Im Kreis" }]}
          onChange={(v) => set({ mode: v })}
        />,
        <CheckField key="oneWay" label="Von unten durchspringbar" checked={!!p.oneWay} onChange={(v) => set({ oneWay: v })} />,
      );
      break;
    case "spring":
      fields.push(en("dir", dirOptions(schema.params.dir.options, false)));
      break;
    case "ring":
      fields.push(en("dir", dirOptions(schema.params.dir.options, false)), num("radius"), num("cooldown"));
      break;
    case "crystal":
      fields.push(num("radius"), num("respawn"));
      break;
    case "crumble":
      fields.push(num("delay"), num("respawn"));
      break;
    case "wind": {
      const gusts = p.period !== undefined;
      fields.push(num("w"), num("h"), num("ax"), num("ay"));
      fields.push(
        <CheckField
          key="gusts"
          label="Böen statt Dauerwind"
          hint="Der Wind weht nur im Takt; eine Vorwarnung kündigt ihn an."
          checked={gusts}
          onChange={(on) => set(on ? { period: 3, on: 1.5 } : { period: undefined, on: undefined, warn: undefined, phase: undefined })}
        />,
      );
      if (gusts) fields.push(num("period"), num("on"), num("warn"), num("phase"));
      break;
    }
    case "gravityZone":
      fields.push(num("w"), num("h"));
      break;
    case "portal": {
      const mate = doc.elements.find((e) => e.type === "portal" && e.id === el.pair && e.pair === el.id);
      fields.push(
        <div key="pair" className="text-sm text-white/70 leading-relaxed">
          Paar <span className="text-white">{el.id}</span> ↔ <span className="text-white">{el.pair}</span>
          {mate ? (
            <button type="button" className={`${buttonClass} mt-2 w-full`} onClick={() => onFocusTile(mate.tx, mate.ty)}>
              <Link2 size={14} />Zum Partner springen
            </button>
          ) : (
            <span className="block mt-1.5 text-amber-300/90 text-xs">Der Partner fehlt noch: Portal-Pinsel wählen und das Gegenstück setzen.</span>
          )}
        </div>,
      );
      break;
    }
    case "switch":
      fields.push(
        <SelectField key="channel" label="Kanal" value={p.channel} options={channelOptions} onChange={(v) => set({ channel: Number(v) })} />,
        <ChannelChips key="chips" channel={p.channel} />,
      );
      break;
    case "colorBlock":
      fields.push(
        <SelectField key="channel" label="Kanal" value={p.channel} options={channelOptions} onChange={(v) => set({ channel: Number(v) })} />,
        <SelectField
          key="solidWhen"
          label="Fest"
          value={p.solidWhen}
          options={[{ value: 0, label: "Im Ausgangszustand" }, { value: 1, label: "Nach dem ersten Schalter" }]}
          onChange={(v) => set({ solidWhen: Number(v) })}
        />,
        <ChannelChips key="chips" channel={p.channel} />,
      );
      break;
    default:
      break;
  }

  const hasPath = !!el.path;
  return (
    <Section title={schema.label} action={<span className="text-xs text-white/35 tabular-nums">{el.tx} | {el.ty}</span>}>
      {fields.length === 0 && <p className="text-sm text-white/40">Dieses Element hat keine Einstellungen.</p>}
      {fields}
      {hasPath && (
        <button type="button" onClick={onTogglePath} className={`${buttonClass} w-full ${pathEdit ? "border-violet-400/60 bg-violet-500/15" : ""}`}>
          <Route size={14} />
          {pathEdit ? "Pfad bearbeiten beenden" : "Pfad bearbeiten"}
        </button>
      )}
      {hasPath && pathEdit && (
        <p className="text-xs text-white/40 leading-relaxed">
          Klick auf freie Kachel: Punkt anhängen. Punkt ziehen: verschieben. Umschalt+Klick auf einen Punkt: entfernen.
        </p>
      )}
      <button type="button" onClick={onDelete} className={`${buttonClass} w-full text-red-300 hover:text-red-200`}>
        <Trash2 size={14} />
        Element löschen
      </button>
    </Section>
  );
}
