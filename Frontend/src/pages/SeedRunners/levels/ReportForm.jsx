// ReportForm.jsx — ein Level melden. Die Meldung geht an die Moderation (Admin-Bereich); bei mehreren Meldungen steigt das Level in deren Liste.
// Melden darf nur, wer angemeldet ist und nicht selbst der Ersteller ist (der Server prüft beides).
import React, { useState } from "react";
import { Flag, Loader2, Check } from "lucide-react";
import { reportLevel } from "./levelsApi.js";
import { REPORT_REASONS, reasonOf } from "./labels.js";
import { buttonClass, inputClass, primaryButtonClass } from "../editor/fields.jsx";

export default function ReportForm({ code, loggedIn, onLogin, onClose }) {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  if (!loggedIn) {
    return (
      <div className="border border-white/10 rounded-md px-4 py-3 text-sm text-white/70" data-testid="report-form">
        <p className="mb-2 leading-relaxed">Zum Melden musst du mit Twitch angemeldet sein — so lassen sich Meldungen nicht massenhaft missbrauchen.</p>
        <div className="flex gap-2">
          <button type="button" onClick={onLogin} className={primaryButtonClass}>Mit Twitch anmelden</button>
          <button type="button" onClick={onClose} className={buttonClass}>Schließen</button>
        </div>
      </div>
    );
  }

  const send = async () => {
    setBusy(true);
    setResult(await reportLevel(code, { reason, note: note.trim() }));
    setBusy(false);
  };

  if (result?.status === "ok") {
    return (
      <div className="border border-green-400/25 bg-green-500/5 rounded-md px-4 py-3 text-sm text-white/80" role="status" data-testid="report-form">
        <p className="flex items-start gap-2"><Check size={15} className="text-green-300 mt-0.5 shrink-0" />
          {result.already ? "Du hast dieses Level schon gemeldet." : "Danke. Die Moderation schaut sich das Level an."}
        </p>
        <button type="button" onClick={onClose} className={`${buttonClass} mt-3`}>Schließen</button>
      </div>
    );
  }

  return (
    <div className="border border-white/10 rounded-md px-4 py-3 space-y-3" data-testid="report-form">
      <p className="text-sm font-semibold text-white flex items-center gap-2"><Flag size={14} className="text-white/45" />Level melden</p>
      <label className="block">
        <span className="block text-[11px] uppercase tracking-wider text-white/35 mb-1">Grund</span>
        <select value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} aria-label="Grund der Meldung">
          <option value="">Bitte wählen …</option>
          {REPORT_REASONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="block text-[11px] uppercase tracking-wider text-white/35 mb-1">Anmerkung (optional)</span>
        <textarea value={note} maxLength={300} rows={2} onChange={(e) => setNote(e.target.value)} className={`${inputClass} resize-y`} aria-label="Anmerkung zur Meldung" />
      </label>
      {result && <p className="text-sm text-amber-300" role="alert">{reasonOf(result)}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={send} disabled={!reason || busy} className={primaryButtonClass}>
          {busy && <Loader2 size={14} className="animate-spin" />}Melden
        </button>
        <button type="button" onClick={onClose} className={buttonClass}>Abbrechen</button>
      </div>
    </div>
  );
}
