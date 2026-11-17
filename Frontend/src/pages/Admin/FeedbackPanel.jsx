// FeedbackPanel.jsx — Feedback der Website im AdminDashboard (Reiter „Feedback“): lesen, beantworten, erledigen.
// Holt sich seine Daten selbst: GET /api/feedback/admin?status=…, POST …/:id/antwort, POST …/:id/status
// (Backend/routes/feedbackRoutes.js). Eine Antwort landet in der Glocke des Absenders und kommt als Mitteilung,
// wenn er beim Senden angemeldet war; sonst lässt sie sich nur hier festhalten.
import React, { useCallback, useEffect, useState } from "react";
import { RefreshCw, Send, Check, RotateCcw, UserX } from "lucide-react";

const STATUS = [
  { id: "offen", label: "Offen" },
  { id: "beantwortet", label: "Beantwortet" },
  { id: "erledigt", label: "Erledigt" },
  { id: "alle", label: "Alle" },
];
const zeit = (t) => new Date(t).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

async function senden(pfad, body) {
  const r = await fetch(`/api/feedback/admin${pfad}`, {
    method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `Fehler ${r.status}`);
  return d;
}

function Eintrag({ e, onNeu }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [meldung, setMeldung] = useState("");

  const antworten = async () => {
    setBusy(true);
    setMeldung("");
    try {
      const d = await senden(`/${e.id}/antwort`, { text });
      setText("");
      setMeldung(d.zugestellt ? "Antwort zugestellt (Glocke + Mitteilung)." : "Gespeichert — ohne Konto beim Senden kann sie nicht zugestellt werden.");
      onNeu(d.eintrag);
    } catch (err) {
      setMeldung(err.message);
    }
    setBusy(false);
  };
  const status = async (s) => {
    setBusy(true);
    try { onNeu((await senden(`/${e.id}/status`, { status: s })).eintrag); } catch (err) { setMeldung(err.message); }
    setBusy(false);
  };

  return (
    <li className="rounded-lg border border-line bg-surface/80 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-semibold text-white">
          {e.name}
          {!e.kontoId && <span className="flex items-center gap-1 text-[11px] font-normal text-white/40" title="Ohne Konto gesendet"><UserX size={12} /> ohne Konto</span>}
        </span>
        <span className="text-xs text-white/40">{zeit(e.erstellt)}{e.seite ? ` · ${e.seite}` : ""}</span>
      </div>
      <p className="text-sm text-white/80 whitespace-pre-line break-words">{e.nachricht}</p>
      {e.antwort && (
        <div className="rounded-md border border-accent/25 bg-accent/10 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wider text-accent-soft mb-1">Deine Antwort · {zeit(e.beantwortet)}</p>
          <p className="text-sm text-white/80 whitespace-pre-line break-words">{e.antwort}</p>
        </div>
      )}
      <div className="space-y-2">
        <textarea value={text} onChange={(ev) => setText(ev.target.value)} maxLength={1000} rows={2}
          placeholder={e.kontoId ? "Antwort schreiben … (landet in der Glocke)" : "Notiz zur Antwort (ohne Konto nicht zustellbar)"}
          className="w-full rounded-lg bg-black/30 border border-line text-sm text-white placeholder:text-white/30 px-3 py-2 focus:border-accent focus:outline-none resize-y" />
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={antworten} disabled={busy || text.trim().length < 2}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent hover:bg-accent-hover disabled:bg-white/5 disabled:text-white/30 text-white text-xs font-semibold px-3 py-2">
            <Send size={13} /> {e.antwort ? "Noch einmal antworten" : "Antworten"}
          </button>
          {e.status !== "erledigt" ? (
            <button type="button" onClick={() => status("erledigt")} disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line text-white/70 hover:text-white text-xs font-semibold px-3 py-2">
              <Check size={13} /> Erledigt
            </button>
          ) : (
            <button type="button" onClick={() => status("offen")} disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line text-white/70 hover:text-white text-xs font-semibold px-3 py-2">
              <RotateCcw size={13} /> Wieder öffnen
            </button>
          )}
          {meldung && <span className="text-xs text-white/55">{meldung}</span>}
        </div>
      </div>
    </li>
  );
}

export default function FeedbackPanel() {
  const [status, setStatus] = useState("offen");
  const [daten, setDaten] = useState(null);
  const [fehler, setFehler] = useState("");

  const laden = useCallback(async () => {
    setFehler("");
    try {
      const r = await fetch(`/api/feedback/admin?status=${status}`, { credentials: "include" });
      if (!r.ok) throw new Error(`Fehler ${r.status}`);
      setDaten(await r.json());
    } catch (e) {
      setFehler(e.message);
    }
  }, [status]);
  useEffect(() => { laden(); }, [laden]);

  const ersetze = (neu) => setDaten((d) => d && ({ ...d, eintraege: d.eintraege.map((x) => (x.id === neu.id ? neu : x)) }));
  const z = daten?.zahlen || {};

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {STATUS.map((s) => (
          <button key={s.id} type="button" onClick={() => setStatus(s.id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold border ${status === s.id ? "bg-accent/15 border-accent text-white" : "border-line text-white/55 hover:text-white"}`}>
            {s.label}{s.id !== "alle" && z[s.id] ? ` (${z[s.id]})` : ""}
          </button>
        ))}
        <button type="button" onClick={laden} className="ml-auto p-2 rounded-lg text-white/45 hover:text-white hover:bg-white/5" title="Neu laden"><RefreshCw size={15} /></button>
      </div>
      {fehler && <p className="text-sm text-red-300">{fehler}</p>}
      {!daten && !fehler && <p className="text-sm text-white/40">Lade Feedback …</p>}
      {daten && daten.eintraege.length === 0 && <p className="text-sm text-white/40 py-8 text-center">Hier ist gerade nichts.</p>}
      {daten && daten.eintraege.length > 0 && (
        <ul className="space-y-3">
          {daten.eintraege.map((e) => <Eintrag key={e.id} e={e} onNeu={ersetze} />)}
        </ul>
      )}
    </div>
  );
}
