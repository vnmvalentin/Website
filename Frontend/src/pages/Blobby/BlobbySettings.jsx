// Raumeinstellungen — dieselben Regler auf der Startseite (beim Erstellen) und im Raum
// (solange der Host wartet). Die Werte gehen 1:1 als `settings` an den Server, der sie
// nochmal prüft.
import React from "react";
import { POWERUP_LABELS, normalizeSettings } from "./settings";

function Row({ label, hint, children }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-white">{label}</div>
        {hint && <div className="text-xs text-white/40 mt-0.5">{hint}</div>}
      </div>
      <div className="flex shrink-0 rounded-lg border border-white/10 overflow-hidden">{children}</div>
    </div>
  );
}

function Choice({ active, disabled, onClick, children }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed ${
        active
          ? "bg-violet-600 text-white"
          : "bg-white/5 text-white/55 hover:text-white hover:bg-white/10 disabled:hover:bg-white/5 disabled:hover:text-white/55"
      }`}
    >
      {children}
    </button>
  );
}

export default function BlobbySettings({ value, onChange, disabled = false }) {
  const s = normalizeSettings(value);
  const set = (patch) => onChange({ ...s, ...patch });

  return (
    <div className="space-y-4">
      <Row label="Spielmodus" hint="2 gegen 2 spielt auf einem breiteren Feld">
        <Choice active={s.mode === "1v1"} disabled={disabled} onClick={() => set({ mode: "1v1" })}>1 gegen 1</Choice>
        <Choice active={s.mode === "2v2"} disabled={disabled} onClick={() => set({ mode: "2v2" })}>2 gegen 2</Choice>
      </Row>

      <Row label="Pfeiler" hint="Offen: hochspringen, rüberklettern, den Gegner anrempeln">
        <Choice active={s.crossNet} disabled={disabled} onClick={() => set({ crossNet: true })}>Offen</Choice>
        <Choice active={!s.crossNet} disabled={disabled} onClick={() => set({ crossNet: false })}>Hälfte blockiert</Choice>
      </Row>

      <Row label="Ballberührungen" hint="Klassisch verliert man ab der vierten Berührung">
        <Choice active={s.maxTouches === 0} disabled={disabled} onClick={() => set({ maxTouches: 0 })}>Unbegrenzt</Choice>
        <Choice active={s.maxTouches === 3} disabled={disabled} onClick={() => set({ maxTouches: 3 })}>Max. 3</Choice>
      </Row>

      <Row label="Powerups" hint="Schweben über dem Pfeiler — mit Ball oder Blob einsammeln">
        <Choice active={!s.powerups} disabled={disabled} onClick={() => set({ powerups: false })}>Aus</Choice>
        <Choice active={s.powerups} disabled={disabled} onClick={() => set({ powerups: true })}>An</Choice>
      </Row>

      {s.powerups && (
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-xs text-white/45 pt-1">
          {Object.values(POWERUP_LABELS).map((label) => (
            <li key={label} className="bg-white/5 border border-white/10 rounded px-2 py-1">{label}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
