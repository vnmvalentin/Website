// MitspielenPanel.jsx — „Jetzt mitspielen“ im AdminDashboard (Reiter „Mitspielen“): Stream-Raum setzen (Raumlink aus
// einem beliebigen Spiel), Modus offen oder Warteschlange, nächste Runde aufrufen, Raum beenden. Dazu die Adresse für
// den Chat-Befehl !mitspielen in Streamer.bot. Server: /api/mitspielen/steuerung|raum|aufrufen|beenden.
import React, { useCallback, useEffect, useState } from "react";
import { Copy, Check, Play, Square, Users, RefreshCw, Megaphone } from "lucide-react";

async function senden(pfad, method, body) {
  const r = await fetch(`/api/mitspielen/${pfad}`, {
    method, credentials: "include", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `Fehler ${r.status}`);
  return d;
}

const zeit = (t) => new Date(t).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
const feld = "w-full h-10 rounded-lg bg-black/30 border border-line px-3 text-sm text-white placeholder:text-white/30 focus:border-accent focus:outline-none";

function Kopieren({ text }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1500); } catch { /* steht daneben */ } }}
      className="inline-flex items-center gap-1 text-xs text-white/50 hover:text-white" title="Kopieren">
      {ok ? <Check size={13} /> : <Copy size={13} />} {ok ? "Kopiert" : "Kopieren"}
    </button>
  );
}

export default function MitspielenPanel() {
  const [d, setD] = useState(null);
  const [form, setForm] = useState({ url: "", notiz: "", modus: "offen", rundeGroesse: 4 });
  const [busy, setBusy] = useState(false);
  const [meldung, setMeldung] = useState("");

  const laden = useCallback(async () => {
    try {
      const x = await senden("steuerung", "GET");
      setD(x);
      return x;
    } catch (e) {
      setMeldung(e.message);
      return null;
    }
  }, []);

  useEffect(() => {
    laden().then((x) => {
      if (x?.raum) setForm({ url: x.raum.link, notiz: x.raum.notiz || "", modus: x.raum.modus, rundeGroesse: x.raum.rundeGroesse });
    });
    const takt = setInterval(laden, 10_000);
    return () => clearInterval(takt);
  }, [laden]);

  const tu = async (fn, text) => {
    setBusy(true);
    setMeldung("");
    try {
      const x = await fn();
      setD(x);
      if (text) setMeldung(typeof text === "function" ? text(x) : text);
    } catch (e) {
      setMeldung(e.message);
    }
    setBusy(false);
  };

  const raum = d?.raum;
  return (
    <div className="space-y-5">
      {/* Raum setzen */}
      <div className="rounded-lg border border-line bg-surface/80 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-white/40">Stream-Raum</h3>
          {raum ? (
            <span className="text-xs text-emerald-300">Offen seit {zeit(raum.gesetzt)}{raum.spielName ? ` · ${raum.spielName}` : ""}</span>
          ) : <span className="text-xs text-white/40">Kein Raum offen</span>}
        </div>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); tu(() => senden("raum", "PUT", form), "Raum gesetzt."); }}>
          <label className="block">
            <span className="block text-xs font-semibold text-white/70 mb-1.5">Raumlink (aus dem Spiel kopiert)</span>
            <input className={feld} value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://vnmvalentin.de/worldflip/ABCD" />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-white/70 mb-1.5">Hinweis (optional)</span>
            <input className={feld} value={form.notiz} maxLength={120} onChange={(e) => setForm({ ...form, notiz: e.target.value })} placeholder="z. B. Viererrunde, jede Runde neue Leute" />
          </label>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <span className="block text-xs font-semibold text-white/70 mb-1.5">Modus</span>
              <div className="flex rounded-lg border border-line overflow-hidden">
                {[["offen", "Offen (Link für alle)"], ["schlange", "Warteschlange"]].map(([id, label]) => (
                  <button key={id} type="button" onClick={() => setForm({ ...form, modus: id })}
                    className={`px-3 h-10 text-xs font-semibold ${form.modus === id ? "bg-accent/20 text-white" : "text-white/55 hover:text-white"}`}>{label}</button>
                ))}
              </div>
            </div>
            {form.modus === "schlange" && (
              <label>
                <span className="block text-xs font-semibold text-white/70 mb-1.5">Plätze je Runde</span>
                <input type="number" min={1} max={50} className={`${feld} w-24`} value={form.rundeGroesse}
                  onChange={(e) => setForm({ ...form, rundeGroesse: e.target.value })} />
              </label>
            )}
            <button type="submit" disabled={busy || !form.url.trim()}
              className="inline-flex items-center gap-1.5 h-10 rounded-lg bg-accent hover:bg-accent-hover disabled:bg-white/5 disabled:text-white/30 text-white text-sm font-semibold px-4">
              <Play size={14} /> {raum ? "Raum aktualisieren" : "Raum öffnen"}
            </button>
            {raum && (
              <button type="button" disabled={busy} onClick={() => tu(() => senden("beenden", "POST"), "Raum beendet.")}
                className="inline-flex items-center gap-1.5 h-10 rounded-lg border border-line text-white/70 hover:text-white text-sm font-semibold px-4">
                <Square size={14} /> Beenden
              </button>
            )}
          </div>
        </form>
        {raum && (
          <p className="text-xs text-white/45 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>Öffentlich: <a href="/mitspielen" target="_blank" rel="noopener noreferrer" className="text-accent-soft hover:text-white">/mitspielen</a></span>
            <span className="font-mono text-white/60 break-all">{raum.link}</span> <Kopieren text={raum.link} />
          </p>
        )}
        {meldung && <p className="text-xs text-white/60">{meldung}</p>}
      </div>

      {/* Warteschlange */}
      {raum?.modus === "schlange" && (
        <div className="rounded-lg border border-line bg-surface/80 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white/40"><Users size={14} /> Warteschlange · {d.wartende.length}</h3>
            <div className="flex items-center gap-2">
              <button type="button" onClick={laden} className="p-2 rounded-lg text-white/45 hover:text-white hover:bg-white/5" title="Neu laden"><RefreshCw size={14} /></button>
              <button type="button" disabled={busy || !d.wartende.length}
                onClick={() => tu(() => senden("aufrufen", "POST", { anzahl: raum.rundeGroesse }), (x) => `Aufgerufen: ${x.aufgerufen.map((a) => a.name).join(", ") || "niemand"}`)}
                className="inline-flex items-center gap-1.5 h-9 rounded-lg bg-accent hover:bg-accent-hover disabled:bg-white/5 disabled:text-white/30 text-white text-xs font-semibold px-3">
                <Megaphone size={14} /> Nächste {raum.rundeGroesse} aufrufen
              </button>
            </div>
          </div>
          {d.wartende.length === 0 ? <p className="text-sm text-white/40">Noch niemand angestellt.</p> : (
            <ol className="divide-y divide-white/5 rounded-lg border border-line bg-black/20">
              {d.wartende.map((e, i) => (
                <li key={e.kontoId} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="text-white/85"><span className="text-white/35 tabular-nums mr-2">{i + 1}.</span>{e.name}</span>
                  <span className="text-xs text-white/35">{zeit(e.beigetreten)}</span>
                </li>
              ))}
            </ol>
          )}
          {d.aufgerufene.length > 0 && (
            <p className="text-xs text-white/50">Zuletzt aufgerufen: {d.aufgerufene.map((a) => a.name).join(", ")}</p>
          )}
        </div>
      )}

      {/* Chat-Befehl */}
      {d?.chatAdresse && (
        <div className="rounded-lg border border-line bg-surface/80 p-5 space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-white/40">Chat-Befehl !mitspielen (Streamer.bot)</h3>
          <p className="text-sm text-white/60">Befehl <span className="font-mono text-white/80">!mitspielen</span> anlegen → Sub-Action „Fetch URL“ mit dieser Adresse → das Ergebnis per „Send Message to Channel“ in den Chat schicken. Für Englisch <span className="font-mono">?lang=en</span> anhängen.</p>
          <p className="flex flex-wrap items-center gap-3 text-xs"><span className="font-mono text-white/70 break-all">{d.chatAdresse}</span> <Kopieren text={d.chatAdresse} /></p>
        </div>
      )}
    </div>
  );
}
