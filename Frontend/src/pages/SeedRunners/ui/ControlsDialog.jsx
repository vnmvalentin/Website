// ControlsDialog.jsx — das Fenster „Steuerung“: Tastenbelegung ansehen und umbelegen, Gamepad, Regeln einer Runde.
// Die Belegung liegt im Browser (client/input.js, dieselbe wie im Übungsbereich) und gilt ab dem nächsten Rennen.
import React, { useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Modal, Tabs } from "./kit.jsx";
import { createInput, keyLabel } from "../client/input.js";
import { ACTIONS } from "../client/inputLatch.js";

const HINWEISE = {
  left: "laufen",
  right: "laufen",
  up: "Grapple und Dash nach oben zielen",
  down: "nach unten zielen, schneller fallen",
  jump: "gedrückt halten springt höher; an der Wand: Wandsprung; in der Luft: Doppelsprung",
  dash: "in die Richtung der Pfeiltasten — braucht eine Kristall-Ladung",
  grapple: "am Anker, auf den du zielst",
  restart: "zurück zum letzten Checkpoint (die Zeit läuft weiter)",
};

const PAD = [
  ["Stick / Steuerkreuz", "laufen und zielen"],
  ["A", "springen"],
  ["X oder B", "Dash"],
  ["Y oder Schultertasten", "Grapple"],
  ["Back / Select", "zurück zum Checkpoint"],
];

const REGELN = [
  "Alle laufen dasselbe Level aus demselben Seed; gestartet wird mit einem gemeinsamen Countdown.",
  "Wandsprung, Doppelsprung und Grapple stehen von Anfang an bereit. Dash-Ladungen gibt es an Kristallen.",
  "Ein Tod kostet nur Zeit: Du startest sofort am letzten Checkpoint neu.",
  "Ist der Erste im Ziel, haben die anderen noch 60 Sekunden, dann zählt es als nicht beendet.",
  "Nach jeder Runde kannst du das Level mit Sternen bewerten und dir als Favorit merken.",
];

export default function ControlsDialog({ open, onClose }) {
  const [tab, setTab] = useState("tasten");
  const inputRef = useRef(null);
  const [bindings, setBindings] = useState(null);
  const [rebinding, setRebinding] = useState(null);

  // Nur solange das Fenster offen ist, hört eine eigene Eingabe mit (für das Umbelegen)
  useEffect(() => {
    if (!open) return undefined;
    const input = createInput();
    input.attach();
    inputRef.current = input;
    setBindings(input.getBindings());
    return () => {
      input.cancelRebind();
      input.detach();
      inputRef.current = null;
      setRebinding(null);
    };
  }, [open]);

  const toggle = (actionId) => {
    const input = inputRef.current;
    if (!input) return;
    if (rebinding === actionId) {
      input.cancelRebind();
      setRebinding(null);
      return;
    }
    setRebinding(actionId);
    input.rebind(actionId, (next) => {
      setBindings({ ...next });
      setRebinding(null);
    });
  };

  const reset = () => {
    const input = inputRef.current;
    if (!input) return;
    input.cancelRebind();
    setRebinding(null);
    setBindings({ ...input.resetBindings() });
  };

  // Escape gehört während des Umbelegens der Taste, nicht dem Fenster
  const close = () => { if (!rebinding) onClose(); };

  return (
    <Modal open={open} title="Steuerung" onClose={close} width={620}>
      <Tabs
        label="Steuerung"
        value={tab}
        onChange={setTab}
        tabs={[{ id: "tasten", label: "Tastatur" }, { id: "pad", label: "Gamepad" }, { id: "regeln", label: "So läuft eine Runde" }]}
        className="mb-4"
      />

      {tab === "tasten" && bindings && (
        <div>
          <div className="sr-rows">
            {ACTIONS.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 py-2.5">
                <div className="min-w-0 flex-1 basis-56">
                  <p className="font-semibold sr-ink leading-tight">{a.label}</p>
                  <p className="text-xs sr-faint leading-snug">{HINWEISE[a.id]}</p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {rebinding === a.id
                    ? <span className="sr-cond sr-accent-text font-semibold">Taste drücken … (Esc bricht ab)</span>
                    : (bindings[a.id] || []).map((code) => <span key={code} className="sr-kbd">{keyLabel(code)}</span>)}
                </div>
                <button type="button" onClick={() => toggle(a.id)} className="sr-btn sr-btn-sm sr-btn-ghost w-24">
                  {rebinding === a.id ? "Abbrechen" : "Ändern"}
                </button>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
            <p className="text-xs sr-faint">Gilt ab dem nächsten Rennen und bleibt in diesem Browser gespeichert.</p>
            <button type="button" onClick={reset} className="sr-btn sr-btn-sm sr-btn-quiet"><RotateCcw size={14} />Standard</button>
          </div>
        </div>
      )}

      {tab === "pad" && (
        <div>
          <div className="sr-rows">
            {PAD.map(([k, v]) => (
              <div key={k} className="flex items-center gap-4 py-2.5">
                <span className="sr-kbd">{k}</span>
                <span className="sr-dim">{v}</span>
              </div>
            ))}
          </div>
          <p className="text-xs sr-faint mt-4">Ein angeschlossenes Gamepad wird automatisch erkannt. Am Handy gibt es noch keine Touch-Steuerung.</p>
        </div>
      )}

      {tab === "regeln" && (
        <ol className="space-y-2.5">
          {REGELN.map((r, i) => (
            <li key={r} className="flex gap-3">
              <span className="sr-num sr-accent-text w-5 shrink-0 text-right">{i + 1}</span>
              <span className="sr-dim">{r}</span>
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}
