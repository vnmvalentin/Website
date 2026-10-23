// AnalyticsPanel.jsx — Besucherstatistik im AdminDashboard. Holt sich ihre Daten selbst (wie
// GardenAdminPanel und ModerationPanel) von GET /api/admin/analytics; gezählt wird in
// components/AnalyticsTracker.jsx, gespeichert in Backend/analytics/.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";

const RANGES = [
  { days: 7, label: "7 Tage" },
  { days: 30, label: "30 Tage" },
  { days: 90, label: "90 Tage" },
  { days: 365, label: "1 Jahr" },
];
const METRICS = [
  { id: "views", label: "Aufrufe" },
  { id: "visitors", label: "Besucher" },
];
const LANG_NAMES = { de: "Deutsch", en: "Englisch", es: "Spanisch", fr: "Französisch", tr: "Türkisch", pl: "Polnisch", it: "Italienisch", nl: "Niederländisch", pt: "Portugiesisch", ru: "Russisch" };

const num = (n) => Number(n || 0).toLocaleString("de-DE");

function duration(seconds) {
  const s = Math.round(seconds || 0);
  if (s < 60) return `${s} s`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} min`;
}

const dayLabel = (day) => {
  const [y, m, d] = day.split("-");
  return `${d}.${m}.${y}`;
};

// Obere Achsengrenze auf eine runde Zahl (1, 2, 5 × Zehnerpotenz), damit die Hilfslinien lesbare Werte tragen.
function niceMax(value) {
  if (value <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 5, 10].find((f) => f * pow >= value);
  return step * pow;
}

function DayChart({ series, metric }) {
  const [hover, setHover] = useState(null);
  const max = niceMax(Math.max(...series.map((r) => r[metric]), 0));
  const active = hover != null ? series[hover] : null;
  const first = series[0]?.day;
  const last = series[series.length - 1]?.day;

  return (
    <div>
      <div className="relative h-52 ml-10">
        {[1, 0.5, 0].map((f) => (
          <div key={f} className="absolute inset-x-0 border-t border-white/[0.06]" style={{ bottom: `${f * 100}%` }}>
            <span className="absolute -left-10 w-8 -translate-y-1/2 text-right text-[10px] text-white/30 tabular-nums">{num(max * f)}</span>
          </div>
        ))}
        <div className="absolute inset-0 flex items-end gap-[2px]" onMouseLeave={() => setHover(null)}>
          {series.map((r, i) => (
            // Die ganze Spalte ist die Trefferfläche, nicht nur der Balken — sonst wäre ein Tag mit 1 Aufruf kaum zu treffen.
            <div key={r.day} className="relative flex-1 h-full flex items-end" onMouseEnter={() => setHover(i)}>
              <div
                className={`w-full rounded-t-[4px] transition-colors ${hover === i ? "bg-violet-300" : "bg-violet-500"}`}
                style={{ height: `${(r[metric] / max) * 100}%`, minHeight: r[metric] > 0 ? 2 : 0 }}
              />
            </div>
          ))}
        </div>
        {active && (
          <div
            className="absolute top-0 z-10 pointer-events-none bg-[#15151b] border border-white/10 rounded-lg px-3 py-2 text-xs whitespace-nowrap"
            style={hover < series.length / 2
              ? { left: `${((hover + 1) / series.length) * 100}%`, marginLeft: 8 }
              : { right: `${((series.length - hover) / series.length) * 100}%`, marginRight: 8 }}
          >
            <div className="text-white font-semibold mb-1">{dayLabel(active.day)}</div>
            <div className="text-white/60">Aufrufe <span className="text-white font-semibold tabular-nums ml-1">{num(active.views)}</span></div>
            <div className="text-white/60">Besucher <span className="text-white font-semibold tabular-nums ml-1">{num(active.visitors)}</span></div>
          </div>
        )}
      </div>
      <div className="ml-10 mt-2 flex justify-between text-[10px] text-white/30">
        <span>{first ? dayLabel(first) : ""}</span>
        <span>{last ? dayLabel(last) : ""}</span>
      </div>
    </div>
  );
}

// Rangliste mit Anteilsbalken hinter jeder Zeile (Herkunft, Sprache, Gerät).
function ShareList({ title, rows, empty }) {
  const total = rows.reduce((s, r) => s + r.value, 0);
  return (
    <div className="panel p-5">
      <h3 className="text-xs font-bold uppercase tracking-wider text-white/40 mb-3">{title}</h3>
      {rows.length === 0 && <p className="text-sm text-white/30 italic">{empty}</p>}
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.label} className="relative flex items-center justify-between gap-3 px-2 py-1.5 text-sm">
            <span className="absolute inset-y-0 left-0 bg-violet-500/15 rounded-md" style={{ width: `${total ? (r.value / total) * 100 : 0}%` }} />
            <span className="relative text-white/80 truncate">{r.label}</span>
            <span className="relative text-white/50 tabular-nums shrink-0">
              {num(r.value)} <span className="text-white/30">· {total ? Math.round((r.value / total) * 100) : 0} %</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function AnalyticsPanel() {
  const [days, setDays] = useState(30);
  const [metric, setMetric] = useState("views");
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/analytics?days=${days}`, { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setReport(await res.json());
      setError("");
    } catch (e) {
      console.error(e);
      setError("Statistik konnte nicht geladen werden.");
    }
    setLoading(false);
  }, [days]);

  useEffect(() => { load(); }, [load]);

  const lists = useMemo(() => {
    if (!report) return null;
    return {
      sources: report.sources.map((s) => ({ label: s.source, value: s.visitors })),
      langs: report.langs.map((l) => ({ label: LANG_NAMES[l.lang] || l.lang.toUpperCase(), value: l.visitors })),
      devices: [
        { label: "Desktop", value: report.totals.desktop },
        { label: "Handy / Tablet", value: report.totals.mobile },
      ].filter((d) => d.value > 0),
    };
  }, [report]);

  const toggle = (active) => `px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
    active ? "bg-violet-600 text-white" : "text-white/50 hover:text-white hover:bg-white/5"
  }`;

  if (!report) {
    return <div className="p-8 text-center text-white/40">{error || "Lade Statistik..."}</div>;
  }

  const { totals } = report;
  const tiles = [
    { label: "Gerade online", value: num(report.live), hint: "aktiv in den letzten 5 Minuten" },
    { label: "Aufrufe", value: num(totals.views), hint: `${dayLabel(report.from)} bis heute` },
    { label: "Besucher", value: num(totals.visitors), hint: "Summe der Tageswerte" },
    { label: "Zeit je Aufruf", value: duration(totals.views ? totals.seconds / totals.views : 0), hint: "Tab sichtbar" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="panel p-1 flex gap-1">
          {RANGES.map((r) => (
            <button key={r.days} onClick={() => setDays(r.days)} className={toggle(days === r.days)}>{r.label}</button>
          ))}
        </div>
        {error && <span className="text-xs text-red-400">{error}</span>}
        <button onClick={load} disabled={loading}
          className="ml-auto flex items-center gap-1.5 px-4 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:bg-white/5 disabled:text-white/30 text-white rounded-lg text-sm font-semibold transition-colors">
          <RefreshCw size={14} /> {loading ? "Lädt..." : "Aktualisieren"}
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {tiles.map((t) => (
          <div key={t.label} className="panel p-5">
            <div className="text-white/40 text-xs font-bold uppercase tracking-wider mb-2">{t.label}</div>
            <div className="text-3xl font-bold text-white tabular-nums">{t.value}</div>
            <div className="text-[11px] text-white/30 mt-1">{t.hint}</div>
          </div>
        ))}
      </div>

      <div className="panel p-5">
        <div className="flex items-center justify-between gap-3 mb-5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-white/40">
            {METRICS.find((m) => m.id === metric).label} pro Tag
          </h3>
          <div className="flex gap-1">
            {METRICS.map((m) => (
              <button key={m.id} onClick={() => setMetric(m.id)} className={toggle(metric === m.id)}>{m.label}</button>
            ))}
          </div>
        </div>
        <DayChart series={report.series} metric={metric} />
      </div>

      <div className="panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-black/25 text-[10px] uppercase tracking-wider text-white/40">
              <tr>
                <th className="p-3 font-bold">Seite</th>
                <th className="p-3 font-bold text-right">Aufrufe</th>
                <th className="p-3 font-bold text-right">Besucher</th>
                <th className="p-3 font-bold text-right">Zeit je Aufruf</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {report.pages.map((p) => (
                <tr key={p.path} className="hover:bg-white/[0.03] transition-colors">
                  <td className="p-3 text-white/80 font-mono text-xs">{p.path}</td>
                  <td className="p-3 text-right text-white tabular-nums">{num(p.views)}</td>
                  <td className="p-3 text-right text-white/60 tabular-nums">{num(p.visitors)}</td>
                  <td className="p-3 text-right text-white/60 tabular-nums">{duration(p.views ? p.seconds / p.views : 0)}</td>
                </tr>
              ))}
              {report.pages.length === 0 && (
                <tr><td colSpan={4} className="p-8 text-center text-white/30 italic">Noch keine Aufrufe in diesem Zeitraum.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ShareList title="Herkunft" rows={lists.sources} empty="Noch keine Daten." />
        <ShareList title="Browsersprache" rows={lists.langs} empty="Noch keine Daten." />
        <ShareList title="Gerät" rows={lists.devices} empty="Noch keine Daten." />
      </div>

      <p className="text-[11px] text-white/30 leading-relaxed">
        Gezählt wird ohne Cookies. Besucher werden nur innerhalb eines Tages wiedererkannt, deshalb ist „Besucher“
        über mehrere Tage die Summe der Tageswerte. Deine eigenen Aufrufe (eingeloggt), Overlays und Bots zählen nicht.
        Seiten mit „/*“ fassen alle Räume, Codes und Unterseiten einer Route zusammen.
      </p>
    </div>
  );
}
