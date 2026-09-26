// Prüfung des Levels: Fehler (blockieren Testspiel und Veröffentlichung) und Warnungen (Hinweise). Einträge mit
// Koordinaten springen beim Klick dorthin.
import React from "react";
import { AlertTriangle, Check, XCircle } from "lucide-react";
import { Section } from "./fields.jsx";

// Fehlertexte nennen Orte als "(12|34)"; daraus wird ein Sprungziel
const COORD_RE = /\((\d+)\|(\d+)\)/;

function Row({ tone, text, tx, ty, onFocus }) {
  const Icon = tone === "error" ? XCircle : AlertTriangle;
  const color = tone === "error" ? "text-red-300" : "text-amber-300";
  const content = (
    <span className={`flex items-start gap-2 text-left text-[13px] leading-snug ${color}`}>
      <Icon size={14} className="shrink-0 mt-0.5" />
      <span className="text-white/75">{text}</span>
    </span>
  );
  return tx !== undefined
    ? <button type="button" onClick={() => onFocus(tx, ty)} className="block w-full hover:bg-white/5 rounded-md -mx-1 px-1 py-0.5">{content}</button>
    : <div className="py-0.5">{content}</div>;
}

export default function IssuesPanel({ check, previewIssues, onFocus }) {
  const errors = check.ok ? [] : check.errors;
  const warnings = check.ok ? check.warnings : [];
  const rows = [];
  errors.forEach((text, i) => {
    const m = COORD_RE.exec(text);
    rows.push({ key: `e${i}`, tone: "error", text, tx: m ? Number(m[1]) : undefined, ty: m ? Number(m[2]) : undefined });
  });
  warnings.forEach((w, i) => rows.push({ key: `w${i}`, tone: "warn", text: w.message, tx: w.tx, ty: w.ty }));

  return (
    <Section title="Prüfung">
      {check.ok && warnings.length === 0 && (
        <p className="flex items-center gap-2 text-sm text-green-300"><Check size={14} />Alles in Ordnung — bereit zum Testen.</p>
      )}
      {check.ok && warnings.length > 0 && (
        <p className="flex items-center gap-2 text-sm text-white/70">
          <Check size={14} className="text-green-300" />
          Gültig, {warnings.length === 1 ? "eine Warnung" : `${warnings.length} Warnungen`}.
        </p>
      )}
      {!check.ok && (
        <p className="text-sm text-white/70">
          {errors.length === 1 ? "Ein Fehler verhindert das Testen:" : `${errors.length} Fehler verhindern das Testen:`}
        </p>
      )}
      <div className="space-y-0.5">
        {rows.slice(0, 12).map((r) => <Row key={r.key} tone={r.tone} text={r.text} tx={r.tx} ty={r.ty} onFocus={onFocus} />)}
        {rows.length > 12 && <p className="text-xs text-white/35 pt-1">… und {rows.length - 12} weitere</p>}
      </div>
      {previewIssues.length > 0 && (
        <p className="text-xs text-white/35 leading-snug">
          In der Ansicht fehlen {previewIssues.length} unfertige {previewIssues.length === 1 ? "Element" : "Elemente"} (Warnmarker im Level).
        </p>
      )}
    </Section>
  );
}
