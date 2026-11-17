// AboVergabePanel.jsx — Admin-Reiter „Abos“: das Abo von Hand vergeben (Twitch-Name, Dauer, Notiz), verlängern oder
// wieder nehmen; darunter die bezahlten Abos zur Übersicht. Server: /api/billing/admin/abos (Backend/billing/adminGrants.js).
// Eine Vergabe kostet nichts und hat mit Stripe nichts zu tun.
import React, { useCallback, useEffect, useState } from "react";
import { Gift, Trash2, RefreshCw, Sparkles } from "lucide-react";

async function senden(method, pfad = "", body) {
  const r = await fetch(`/api/billing/admin/abos${pfad}`, {
    method, credentials: "include", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `Fehler ${r.status}`);
  return d;
}

const datum = (ms) => new Date(ms).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
const feld = "w-full h-10 rounded-lg bg-black/30 border border-line px-3 text-sm text-white placeholder:text-white/30 focus:border-accent focus:outline-none";
const DAUERN = [[30, "1 Monat"], [90, "3 Monate"], [365, "1 Jahr"], [0, "Dauerhaft"]];
const STATUS = { active: "aktiv", trialing: "Probezeit", past_due: "Zahlung offen", canceled: "beendet", unpaid: "unbezahlt", incomplete: "unvollständig" };

export default function AboVergabePanel() {
  const [d, setD] = useState(null);
  const [form, setForm] = useState({ login: "", tage: 30, notiz: "" });
  const [busy, setBusy] = useState(false);
  const [meldung, setMeldung] = useState(null); // { text, gut }

  const laden = useCallback(() => senden("GET").then(setD).catch((e) => setMeldung({ text: e.message, gut: false })), []);
  useEffect(() => { laden(); }, [laden]);

  const tu = async (fn, text) => {
    setBusy(true);
    setMeldung(null);
    try {
      const x = await fn();
      setD(x);
      setMeldung({ text: typeof text === "function" ? text(x) : text, gut: true });
      return true;
    } catch (e) {
      setMeldung({ text: e.message, gut: false });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const vergeben = async (e) => {
    e.preventDefault();
    const ok = await tu(
      () => senden("POST", "", form),
      (x) => `${x.neu.name} hat das Abo ${x.neu.bis ? `bis zum ${datum(x.neu.bis)}` : "dauerhaft"}.`,
    );
    if (ok) setForm((f) => ({ ...f, login: "", notiz: "" }));
  };

  const frei = d?.freischaltungen || [];
  const bezahlt = d?.bezahlt || [];

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-line bg-surface/80 p-5 space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-white/40">Abo vergeben</h3>
        <p className="text-sm text-white/60 max-w-2xl">
          Gib einen Twitch-Namen ein. Die Person hat sofort alle Abo-Funktionen, ohne zu bezahlen, und bekommt einen Hinweis in die Glocke.
          Wer schon eine Freischaltung hat, wird damit verlängert bzw. geändert.
        </p>
        <form className="space-y-3" onSubmit={vergeben}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-semibold text-white/70 mb-1.5">Twitch-Name</span>
              <input className={feld} value={form.login} maxLength={26} autoComplete="off" spellCheck={false} placeholder="z. B. maxmustermann"
                onChange={(e) => setForm({ ...form, login: e.target.value.trim() })} />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-white/70 mb-1.5">Notiz (nur für dich, optional)</span>
              <input className={feld} value={form.notiz} maxLength={120} placeholder="z. B. Gewinn vom Giveaway"
                onChange={(e) => setForm({ ...form, notiz: e.target.value })} />
            </label>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <span className="block text-xs font-semibold text-white/70 mb-1.5">Dauer</span>
              <div className="flex rounded-lg border border-line overflow-hidden" role="group" aria-label="Dauer">
                {DAUERN.map(([tage, label]) => (
                  <button key={tage} type="button" aria-pressed={form.tage === tage} onClick={() => setForm({ ...form, tage })}
                    className={`px-3 h-10 text-xs font-semibold ${form.tage === tage ? "bg-accent/20 text-white" : "text-white/55 hover:text-white"}`}>{label}</button>
                ))}
              </div>
            </div>
            <button type="submit" disabled={busy || form.login.length < 3}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-accent hover:bg-accent-hover text-sm font-semibold text-white disabled:bg-white/5 disabled:text-white/30">
              <Gift size={15} /> Abo vergeben
            </button>
          </div>
        </form>
        {meldung && <p role="status" className={`text-sm ${meldung.gut ? "text-emerald-300" : "text-red-300"}`}>{meldung.text}</p>}
      </div>

      <div className="rounded-lg border border-line bg-surface/80 p-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-white/40">Vergebene Abos ({frei.length})</h3>
          <button type="button" onClick={laden} className="inline-flex items-center gap-1 text-xs text-white/50 hover:text-white"><RefreshCw size={13} /> Neu laden</button>
        </div>
        {!d ? <p className="text-sm text-white/40">Lädt …</p> : frei.length === 0 ? (
          <p className="text-sm text-white/40">Noch niemand freigeschaltet.</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {frei.map((g) => (
              <li key={g.twitchId} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-white truncate">{g.login || `ID ${g.twitchId}`}</span>
                  <span className="block text-xs text-white/50 truncate">seit {datum(g.seit)}{g.notiz ? ` · ${g.notiz}` : ""}</span>
                </span>
                <span className={`text-xs font-semibold ${g.aktiv ? "text-emerald-300" : "text-white/40"}`}>
                  {!g.bis ? "dauerhaft" : g.aktiv ? `bis ${datum(g.bis)}` : `abgelaufen am ${datum(g.bis)}`}
                </span>
                <button type="button" disabled={busy} title="Freischaltung entfernen" aria-label={`Freischaltung von ${g.login || g.twitchId} entfernen`}
                  onClick={() => window.confirm(`Abo von ${g.login || g.twitchId} wirklich entfernen?`) && tu(() => senden("DELETE", `/${g.twitchId}`), "Entfernt.")}
                  className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-white/40 hover:text-red-300 hover:bg-red-500/10 disabled:opacity-40">
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-lg border border-line bg-surface/80 p-5">
        <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white/40 mb-3"><Sparkles size={13} /> Bezahlte Abos ({bezahlt.length})</h3>
        {bezahlt.length === 0 ? <p className="text-sm text-white/40">Noch keine.</p> : (
          <ul className="divide-y divide-white/5">
            {bezahlt.map((s) => (
              <li key={s.twitchId} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2 text-sm">
                <span className="text-white/80 tabular-nums">Twitch-ID {s.twitchId}</span>
                <span className="text-xs text-white/55">
                  {STATUS[s.status] || s.status}{s.bis ? ` · ${s.gekuendigt ? "endet" : "verlängert sich"} am ${datum(s.bis)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-white/40 mt-3">Bezahlte Abos verwaltet Stripe. Hier lassen sie sich nur ansehen.</p>
      </div>
    </div>
  );
}
