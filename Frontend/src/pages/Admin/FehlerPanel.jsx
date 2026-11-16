// FehlerPanel.jsx — Fehlerprotokoll im AdminDashboard (Reiter „Fehler“). Holt sich seine Daten selbst:
// GET /api/fehler/liste?status=…, GET /api/fehler/bild/:signatur, POST /api/fehler/bild/:signatur/status.
// Gemeldet wird über utils/fehlerMelder.js (Browser) und Backend/fehler meldeServer (Server).
import React, { useCallback, useEffect, useState } from "react";
import { RefreshCw, ChevronDown, ChevronRight } from "lucide-react";

const STATUS = [
  { id: "offen", label: "Offen" },
  { id: "erledigt", label: "Erledigt" },
  { id: "stumm", label: "Stumm" },
];
const AKTIONEN = {
  offen: [{ status: "erledigt", label: "Als erledigt markieren" }, { status: "stumm", label: "Stumm schalten" }],
  erledigt: [{ status: "offen", label: "Wieder öffnen" }],
  stumm: [{ status: "offen", label: "Wieder öffnen" }],
};
const ART_NAMEN = {
  error: "Laufzeitfehler",
  unhandledrejection: "Promise abgelehnt",
  react: "React",
  webgl: "WebGL-Abbruch",
  manuell: "Vom Spiel gemeldet",
  socket: "Socket-Ereignis",
  http: "Anfrage (5xx)",
  uncaughtException: "Prozess",
  unhandledRejection: "Prozess (Promise)",
};

const num = (n) => Number(n || 0).toLocaleString("de-DE");
const zeit = (t) =>
  new Date(t).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

function Details({ signatur, onStatus }) {
  const [d, setD] = useState(null);
  const [fehler, setFehler] = useState("");
  useEffect(() => {
    let aktiv = true;
    fetch(`/api/fehler/bild/${encodeURIComponent(signatur)}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((x) => { if (aktiv) setD(x); })
      .catch(() => { if (aktiv) setFehler("Details konnten nicht geladen werden."); });
    return () => { aktiv = false; };
  }, [signatur]);

  if (fehler) return <p className="text-sm text-red-300 px-4 pb-4">{fehler}</p>;
  if (!d) return <p className="text-sm text-white/40 px-4 pb-4">Lade Details …</p>;
  const max = Math.max(1, ...d.verlauf.map((v) => v.anzahl));
  return (
    <div className="px-4 pb-4 space-y-4">
      {d.stapel ? (
        <pre className="text-xs text-white/70 bg-black/30 border border-line rounded-md p-3 overflow-x-auto whitespace-pre max-h-64">{d.stapel}</pre>
      ) : (
        <p className="text-xs text-white/40">Kein Stack übermittelt.</p>
      )}
      {d.verlauf.length > 0 && (
        <div>
          <p className="text-[11px] uppercase tracking-wider text-white/40 mb-1.5">Letzte 30 Tage</p>
          <div className="flex items-end gap-[3px] h-12">
            {d.verlauf.map((v) => (
              <div key={v.tag} title={`${v.tag.split("-").reverse().join(".")}: ${num(v.anzahl)}`}
                className="w-2 bg-accent rounded-t-sm" style={{ height: `${Math.max(8, (v.anzahl / max) * 100)}%` }} />
            ))}
          </div>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-white/40">
              <th className="font-medium py-1 pr-3">Zeit</th>
              <th className="font-medium py-1 pr-3">Seite</th>
              <th className="font-medium py-1 pr-3">Browser</th>
              <th className="font-medium py-1 pr-3">Gerät</th>
              <th className="font-medium py-1">Kontext</th>
            </tr>
          </thead>
          <tbody>
            {d.beispiele.map((b, i) => (
              <tr key={i} className="border-t border-line text-white/70">
                <td className="py-1 pr-3 tabular-nums whitespace-nowrap">{zeit(b.zeit)}</td>
                <td className="py-1 pr-3">{b.seite || "–"}</td>
                <td className="py-1 pr-3 whitespace-nowrap">{b.browser || "–"}</td>
                <td className="py-1 pr-3 whitespace-nowrap">{b.geraet || "–"}</td>
                <td className="py-1 break-all">{b.kontext || "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-2">
        {(AKTIONEN[d.status] || []).map((a) => (
          <button key={a.status} type="button" onClick={() => onStatus(signatur, a.status)}
            className="px-3 py-1.5 rounded-md text-xs font-semibold border border-line text-white/80 hover:bg-white/[0.06] transition-colors">
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function FehlerPanel() {
  const [status, setStatus] = useState("offen");
  const [daten, setDaten] = useState(null);
  const [fehler, setFehler] = useState("");
  const [laedt, setLaedt] = useState(false);
  const [aufgeklappt, setAufgeklappt] = useState(null);

  const laden = useCallback(async () => {
    setLaedt(true);
    try {
      const res = await fetch(`/api/fehler/liste?status=${status}`, { credentials: "include" });
      if (!res.ok) throw new Error(String(res.status));
      setDaten(await res.json());
      setFehler("");
    } catch {
      setFehler("Fehlerprotokoll konnte nicht geladen werden.");
    } finally {
      setLaedt(false);
    }
  }, [status]);

  useEffect(() => { laden(); }, [laden]);

  async function setzeStatus(signatur, neu) {
    try {
      const res = await fetch(`/api/fehler/bild/${encodeURIComponent(signatur)}/status`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: neu }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setAufgeklappt(null);
      laden();
    } catch {
      setFehler("Status konnte nicht geändert werden.");
    }
  }

  const zaehler = daten?.zaehler || {};
  const bilder = daten?.bilder || [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="rounded-lg border border-line bg-surface/80 p-1 flex gap-1">
          {STATUS.map((s) => (
            <button key={s.id} type="button" onClick={() => { setStatus(s.id); setAufgeklappt(null); }}
              className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-colors ${status === s.id ? "bg-accent text-white" : "text-white/50 hover:text-white/80"}`}>
              {s.label} <span className="tabular-nums opacity-70">{num(zaehler[s.id])}</span>
            </button>
          ))}
        </div>
        <button type="button" onClick={laden} disabled={laedt}
          className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-white/60 hover:text-white border border-line transition-colors disabled:opacity-50">
          <RefreshCw size={14} className={laedt ? "animate-spin" : ""} /> Aktualisieren
        </button>
      </div>

      {fehler && <p className="text-sm text-red-300">{fehler}</p>}

      {!fehler && daten && bilder.length === 0 && (
        <div className="rounded-lg border border-line bg-surface/80 p-8 text-center text-white/50 text-sm">
          {status === "offen"
            ? "Keine offenen Fehler. Neue erscheinen hier, sobald ein Besucher oder der Server einen meldet."
            : status === "erledigt" ? "Noch nichts als erledigt markiert." : "Nichts stummgeschaltet."}
        </div>
      )}

      {bilder.length > 0 && (
        <div className="rounded-lg border border-line bg-surface/80 overflow-hidden divide-y divide-white/[0.06]">
          {bilder.map((b) => {
            const offen = aufgeklappt === b.signatur;
            const Pfeil = offen ? ChevronDown : ChevronRight;
            return (
              <div key={b.signatur}>
                <button type="button" onClick={() => setAufgeklappt(offen ? null : b.signatur)} aria-expanded={offen}
                  className="w-full text-left px-4 py-3 flex gap-3 hover:bg-white/[0.03] transition-colors">
                  <Pfeil size={16} className="mt-0.5 shrink-0 text-white/40" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white font-medium break-words line-clamp-2">{b.nachricht}</p>
                    <p className="text-xs text-white/45 mt-1">
                      {b.quelle === "server" ? "Server" : "Browser"} · {ART_NAMEN[b.art] || b.art} · {b.seite || "–"} · zuletzt {zeit(b.letztes)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm text-white tabular-nums font-semibold">{num(b.anzahl)}×</p>
                    <p className="text-[11px] text-white/40 tabular-nums">{num(b.woche)} in 7 Tagen</p>
                  </div>
                </button>
                {offen && <Details signatur={b.signatur} onStatus={setzeStatus} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
