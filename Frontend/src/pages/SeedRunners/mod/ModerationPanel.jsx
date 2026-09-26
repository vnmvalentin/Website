// ModerationPanel.jsx — Seed-Runners-Moderation im AdminDashboard: gemeldete Level ausblenden oder freigeben,
// Meldungen abweisen, Konten sperren/entsperren. Nutzt dieselben /mod/*-Endpunkte, die seit Phase 3 existieren
// (levelsRoutes.js) — bis jetzt ließen sie sich nur per curl bedienen.
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Flag, ShieldOff, ShieldCheck, RefreshCw, Eye, EyeOff, X, Ban, ExternalLink, Loader2 } from "lucide-react";
import { getReports, getBans, getHiddenLevels, hideLevel, unhideLevel, dismissReport, banAccount, unbanAccount, runReverify } from "./modApi.js";
import { REPORT_REASONS, STATUS_LABELS, formatDate, plural, reasonOf } from "../levels/labels.js";
import { levelPath } from "../levels/shareCode.js";

const reasonLabel = (id) => REPORT_REASONS.find((r) => r.id === id)?.label || id;

const btn = "inline-flex items-center gap-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
const btnDanger = "inline-flex items-center gap-1.5 bg-red-500/10 hover:bg-red-600 border border-red-500/30 text-red-300 hover:text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
const btnPrimary = "inline-flex items-center gap-1.5 bg-violet-600 hover:bg-violet-500 disabled:bg-white/5 disabled:text-white/30 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors";

function SubNav({ active, onChange, reportCount, hiddenCount, banCount }) {
  const tabs = [
    { id: "reports", label: "Meldungen", icon: Flag, count: reportCount },
    { id: "hidden", label: "Ausgeblendete Level", icon: EyeOff, count: hiddenCount },
    { id: "bans", label: "Gesperrte Konten", icon: Ban, count: banCount },
  ];
  return (
    <div className="flex border-b border-white/5 mb-5">
      {tabs.map((t) => {
        const Icon = t.icon;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold transition-colors border-b-2 ${
              active === t.id ? "border-violet-400 text-white bg-white/[0.03]" : "border-transparent text-white/40 hover:text-white/70"
            }`}
          >
            <Icon size={14} />{t.label}
            {t.count > 0 && <span className="text-[10px] bg-white/10 text-white/70 px-1.5 py-0.5 rounded-md">{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

function ReportGroup({ group, busy, onAction }) {
  const l = group.level;
  const status = STATUS_LABELS[l.status];
  return (
    <div className="panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className="text-white font-semibold text-sm truncate">{l.name} <span className="text-white/30 font-normal">· {l.code}</span></p>
          <p className="text-xs text-white/40">
            von {l.creator.name} · <Link to={levelPath(l.code)} target="_blank" className="text-violet-300 hover:text-violet-200 inline-flex items-center gap-1">ansehen<ExternalLink size={10} /></Link>
            {status && <span className="ml-2 text-amber-300">{status.label}</span>}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          {l.status === "hidden" ? (
            <button disabled={!!busy} onClick={() => onAction("unhide", l.code)} className={btn}>
              {busy === `unhide:${l.code}` ? <Loader2 size={13} className="animate-spin" /> : <Eye size={13} />}Wieder einblenden
            </button>
          ) : (
            <button disabled={!!busy} onClick={() => onAction("hide", l.code)} className={btnDanger}>
              {busy === `hide:${l.code}` ? <Loader2 size={13} className="animate-spin" /> : <EyeOff size={13} />}Ausblenden
            </button>
          )}
        </div>
      </div>
      <ul className="space-y-2">
        {group.reports.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs bg-black/20 border border-white/5 rounded-lg px-3 py-2">
            <span className="text-white/80 font-semibold">{reasonLabel(r.reason)}</span>
            {r.note && <span className="text-white/50 italic truncate max-w-xs">„{r.note}"</span>}
            <span className="text-white/30 font-mono">{r.accountId}</span>
            <span className="text-white/30">{formatDate(r.createdAt)}</span>
            <span className="ml-auto flex gap-1.5">
              <button disabled={!!busy} onClick={() => onAction("ban", r.accountId)} className={btn} title="Meldendes Konto sperren — nicht das des Erstellers">
                <Ban size={12} />Melder sperren
              </button>
              <button disabled={!!busy} onClick={() => onAction("dismiss", r.id)} className={btn}>
                {busy === `dismiss:${r.id}` ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}Verwerfen
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function HiddenRow({ l, busy, onUnhide }) {
  return (
    <div className="panel p-4 flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="min-w-0 flex-1">
        <p className="text-white font-semibold text-sm truncate">{l.name} <span className="text-white/30 font-normal">· {l.code}</span></p>
        <p className="text-xs text-white/40">
          von {l.creator.name} · <Link to={levelPath(l.code)} target="_blank" className="text-violet-300 hover:text-violet-200 inline-flex items-center gap-1">ansehen<ExternalLink size={10} /></Link>
        </p>
        {l.statusReason && <p className="text-xs text-amber-300/80 mt-1">{l.statusReason}</p>}
      </div>
      <button disabled={busy} onClick={() => onUnhide(l.code)} className={btn}>
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Eye size={13} />}Wieder einblenden
      </button>
    </div>
  );
}

function BanRow({ b, busy, onUnban }) {
  return (
    <div className="panel p-4 flex flex-wrap items-center gap-x-5 gap-y-2">
      <span className="font-mono text-sm text-white/70">{b.accountId}</span>
      <span className="text-sm text-white/50">{b.reason || <span className="italic text-white/30">kein Grund angegeben</span>}</span>
      <span className="text-xs text-white/30">seit {formatDate(b.createdAt)}</span>
      <button disabled={busy} onClick={() => onUnban(b.accountId)} className={`${btn} ml-auto`}>
        {busy ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}Entsperren
      </button>
    </div>
  );
}

export default function ModerationPanel() {
  const [tab, setTab] = useState("reports");
  const [reports, setReports] = useState(null);
  const [hidden, setHidden] = useState(null);
  const [bans, setBans] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [banForm, setBanForm] = useState({ accountId: "", reason: "" });
  const [reverifyNote, setReverifyNote] = useState("");

  const load = async () => {
    setError("");
    const [r, h, b] = await Promise.all([getReports(), getHiddenLevels(), getBans()]);
    setReports(r);
    setHidden(h);
    setBans(b);
  };
  useEffect(() => { load(); }, []);

  const run = async (key, fn) => {
    setBusy(key);
    setError("");
    const res = await fn();
    setBusy("");
    if (res.status && res.status !== "ok") { setError(reasonOf(res)); return; }
    await load();
  };

  const onReportAction = (action, arg) => {
    if (action === "hide") {
      const reason = window.prompt("Grund für die Moderation (für den Ersteller sichtbar, optional):", "") ?? undefined;
      run(`hide:${arg}`, () => hideLevel(arg, reason));
    } else if (action === "unhide") {
      run(`unhide:${arg}`, () => unhideLevel(arg));
    } else if (action === "dismiss") {
      run(`dismiss:${arg}`, () => dismissReport(arg));
    } else if (action === "ban") {
      const reason = window.prompt("Grund für die Sperre (optional):", "Missbrauch der Meldefunktion") ?? undefined;
      run(`ban:${arg}`, () => banAccount(arg, reason));
    }
  };

  const submitBan = () => {
    const id = banForm.accountId.trim();
    if (!id) return;
    run(`ban:${id}`, () => banAccount(id, banForm.reason.trim())).then(() => setBanForm({ accountId: "", reason: "" }));
  };

  const doReverify = async () => {
    setReverifyNote("");
    setBusy("reverify");
    const res = await runReverify();
    setBusy("");
    if (res.status !== "ok") { setError(reasonOf(res)); return; }
    const s = res.summary;
    setReverifyNote(`Geprüft: ${s.levels.checked} Level (${s.levels.hidden} ausgeblendet), ${s.runs.checked} Bestenlisten-Einträge (${s.runs.dropped} entfernt).`);
    await load();
  };

  if (reports === null || hidden === null || bans === null) {
    return <p className="flex items-center gap-2 text-sm text-white/50 py-8"><Loader2 size={15} className="animate-spin" />Lädt …</p>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <button onClick={load} className={btn}><RefreshCw size={13} />Aktualisieren</button>
        <button onClick={doReverify} disabled={busy === "reverify"} className={btnPrimary} title="Ersteller-Läufe und Bestenlisten sofort mit der aktuellen Physik neu prüfen, statt bis zum nächsten Serverstart zu warten">
          {busy === "reverify" ? <Loader2 size={13} className="animate-spin" /> : <ShieldOff size={13} />}Neu-Prüfung jetzt anstoßen
        </button>
        {reverifyNote && <span className="text-xs text-white/50">{reverifyNote}</span>}
      </div>
      {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

      <SubNav active={tab} onChange={setTab} reportCount={reports.length} hiddenCount={hidden.length} banCount={bans.length} />

      {tab === "reports" ? (
        <div className="space-y-3">
          {reports.length === 0 ? (
            <p className="text-center text-white/30 italic py-10">Keine offenen Meldungen.</p>
          ) : (
            reports.map((g) => <ReportGroup key={g.level.code} group={g} busy={busy} onAction={onReportAction} />)
          )}
        </div>
      ) : tab === "hidden" ? (
        <div className="space-y-3">
          {hidden.length === 0 ? (
            <p className="text-center text-white/30 italic py-10">Kein Level ist gerade ausgeblendet.</p>
          ) : (
            hidden.map((l) => (
              <HiddenRow key={l.code} l={l} busy={busy === `unhide:${l.code}`} onUnhide={(code) => run(`unhide:${code}`, () => unhideLevel(code))} />
            ))
          )}
        </div>
      ) : (
        <div className="space-y-5">
          <div className="panel p-4 flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="text-xs text-white/40 font-bold uppercase tracking-wider block mb-1.5">Konto-ID</span>
              <input
                value={banForm.accountId}
                onChange={(e) => setBanForm((f) => ({ ...f, accountId: e.target.value }))}
                placeholder="Twitch-ID"
                className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-violet-500 outline-none transition-colors w-40"
              />
            </label>
            <label className="block flex-1 min-w-[12rem]">
              <span className="text-xs text-white/40 font-bold uppercase tracking-wider block mb-1.5">Grund (optional)</span>
              <input
                value={banForm.reason}
                onChange={(e) => setBanForm((f) => ({ ...f, reason: e.target.value }))}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-violet-500 outline-none transition-colors"
              />
            </label>
            <button onClick={submitBan} disabled={!banForm.accountId.trim()} className={btnPrimary}><Ban size={13} />Sperren</button>
          </div>
          <p className="text-xs text-white/35 -mt-2">Eine Sperre blendet alle veröffentlichten Level des Kontos aus und verhindert neue Veröffentlichungen, Bewertungen und Meldungen.</p>
          {bans.length === 0 ? (
            <p className="text-center text-white/30 italic py-6">Niemand ist gesperrt.</p>
          ) : (
            <div className="space-y-2">
              {bans.map((b) => <BanRow key={b.accountId} b={b} busy={busy === `unban:${b.accountId}`} onUnban={(id) => run(`unban:${id}`, () => unbanAccount(id))} />)}
            </div>
          )}
        </div>
      )}
      <p className="text-xs text-white/35 leading-relaxed mt-6">
        {plural(reports.reduce((n, g) => n + g.count, 0), "gemeldeter Verstoß", "gemeldete Verstöße")} über {plural(reports.length, "Level", "Level")} ·{" "}
        {plural(hidden.length, "ausgeblendetes Level", "ausgeblendete Level")} ·{" "}
        {plural(bans.length, "gesperrtes Konto", "gesperrte Konten")}
      </p>
    </div>
  );
}
