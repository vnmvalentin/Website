// Raumeinstellungen — dieselben Regler im Hauptmenü (beim Erstellen) und im Raum
// (solange der Host wartet). Die Werte gehen 1:1 als `settings` an den Server, der sie
// nochmal prüft.
import React from "react";
import { normalizeSettings, PARTY_RULES, PARTY_LABELS } from "./settings";

function Row({ label, hint, children }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2.5">
      <div className="min-w-0">
        <div className="text-[14px] font-semibold">{label}</div>
        {hint && <div className="text-xs bv-faint mt-0.5">{hint}</div>}
      </div>
      <div className="bv-seg shrink-0">{children}</div>
    </div>
  );
}

function Choice({ active, disabled, onClick, children }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} aria-pressed={active}>
      {children}
    </button>
  );
}

export default function BlobbySettings({ value, onChange, disabled = false }) {
  const s = normalizeSettings(value);
  const set = (patch) => onChange({ ...s, ...patch });

  const beach = s.field === "beach";

  return (
    <div className="bv-rows">
      <Row label="Spielfeld" hint="Ego 3D: Volleyball aus der Ich-Sicht — mit der Maus zielen, per Klick schlagen">
        <Choice active={!beach} disabled={disabled} onClick={() => set({ field: "classic" })}>Klassisch</Choice>
        <Choice active={beach} disabled={disabled} onClick={() => set({ field: "beach" })}>Ego 3D</Choice>
      </Row>

      <Row label="Spielmodus" hint="2 gegen 2 spielt auf einem größeren Feld">
        <Choice active={s.mode === "1v1"} disabled={disabled} onClick={() => set({ mode: "1v1" })}>1 gegen 1</Choice>
        <Choice active={s.mode === "2v2"} disabled={disabled} onClick={() => set({ mode: "2v2" })}>2 gegen 2</Choice>
      </Row>

      {!beach && (
      <Row label="Pfeiler" hint="Offen: hochspringen, rüberklettern, anrempeln">
        <Choice active={s.crossNet} disabled={disabled} onClick={() => set({ crossNet: true })}>Offen</Choice>
        <Choice active={!s.crossNet} disabled={disabled} onClick={() => set({ crossNet: false })}>Blockiert</Choice>
      </Row>
      )}

      <Row label="Ballberührungen" hint={s.party.includes("doppelball") ? "Mit zwei Bällen zählt niemand mit" : "Klassisch verliert man ab der vierten"}>
        <Choice active={s.maxTouches === 0} disabled={disabled} onClick={() => set({ maxTouches: 0 })}>Frei</Choice>
        <Choice active={s.maxTouches === 3} disabled={disabled || s.party.includes("doppelball")} onClick={() => set({ maxTouches: 3 })}>Max. 3</Choice>
      </Row>

      <Row label="Powerups" hint={beach ? "Über dem Netz anspringen, mit E zünden" : "Über dem Pfeiler anspringen, per Leertaste zünden"}>
        <Choice active={!s.powerups} disabled={disabled} onClick={() => set({ powerups: false })}>Aus</Choice>
        <Choice active={s.powerups} disabled={disabled} onClick={() => set({ powerups: true })}>An</Choice>
      </Row>

      {/* Partyregeln und König des Strandes nur auf dem klassischen Feld */}
      {!beach && (
      <Row label="Partyregeln" hint="Frei kombinierbar: zweiter Ball, Wind (wechselt je Aufschlag), Riesenball, Mini-Netz">
        {PARTY_RULES.map((r) => (
          <Choice key={r} active={s.party.includes(r)} disabled={disabled}
            onClick={() => set({ party: s.party.includes(r) ? s.party.filter((x) => x !== r) : [...s.party, r] })}>
            {PARTY_LABELS[r]}
          </Choice>
        ))}
      </Row>
      )}

      {!beach && (
      <Row label="König des Strandes" hint="Partien bis 7: der Sieger bleibt, wer zuschaut, rückt der Reihe nach">
        <Choice active={!s.koenig} disabled={disabled} onClick={() => set({ koenig: false })}>Aus</Choice>
        <Choice active={s.koenig} disabled={disabled} onClick={() => set({ koenig: true })}>An</Choice>
      </Row>
      )}
    </div>
  );
}
