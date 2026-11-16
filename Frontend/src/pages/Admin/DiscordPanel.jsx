// DiscordPanel.jsx — Reiter „Discord-Bot“ im AdminDashboard: auf wie vielen Servern der Bot ist, wie viele Mitglieder
// er erreicht und wie viele Server neu dazukamen. Daten von GET /api/admin/discord (Backend/admin/discordUebersicht.js),
// gelesen aus dem Zwischenspeicher des Bots — kostet keine Anfrage an Discord.
import React, { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

const TAG_MS = 24 * 60 * 60 * 1000;
const num = (n) => Number(n || 0).toLocaleString("de-DE");
const datum = (ts) => (ts ? new Date(ts).toLocaleDateString("de-DE") : "—");
const datumZeit = (ts) => (ts ? new Date(ts).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }) : "—");

export default function DiscordPanel() {
  const [daten, setDaten] = useState(null);
  const [fehler, setFehler] = useState("");
  const [laedt, setLaedt] = useState(false);

  const laden = useCallback(async () => {
    setLaedt(true);
    try {
      const res = await fetch("/api/admin/discord", { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDaten(await res.json());
      setFehler("");
    } catch (e) {
      console.error(e);
      setFehler("Discord-Übersicht konnte nicht geladen werden.");
    }
    setLaedt(false);
  }, []);

  useEffect(() => { laden(); }, [laden]);

  const aktualisieren = (
    <button type="button" onClick={laden} disabled={laedt}
      className="ml-auto flex items-center gap-1.5 px-4 py-2.5 bg-accent hover:bg-accent-hover disabled:bg-white/5 disabled:text-white/30 text-white rounded-lg text-sm font-semibold transition-colors">
      <RefreshCw size={14} /> {laedt ? "Lädt..." : "Aktualisieren"}
    </button>
  );

  if (!daten) return <div className="p-8 text-center text-white/40">{fehler || "Lade Discord-Übersicht..."}</div>;

  if (!daten.bereit) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">{fehler && <span className="text-xs text-red-400">{fehler}</span>}{aktualisieren}</div>
        <div className="rounded-lg border border-amber-500/25 bg-surface/80 p-6 text-sm text-white/70">
          Der Bot ist gerade nicht mit Discord verbunden. Nach einem Neustart dauert das ein paar Sekunden; bleibt es so,
          steht der Grund im Server-Log.
        </div>
      </div>
    );
  }

  const kacheln = [
    { label: "Server", wert: num(daten.server) },
    { label: "Mitglieder", wert: num(daten.mitglieder), hinweis: "Summe aller Server, Bots eingeschlossen" },
    { label: "Neu in 7 Tagen", wert: num(daten.neu7), hinweis: "Server, die den Bot hinzugefügt haben" },
    { label: "Neu in 30 Tagen", wert: num(daten.neu30), hinweis: "Server, die den Bot hinzugefügt haben" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-2 text-sm text-white/60">
          <span className="w-1.5 h-1.5 rounded-sm bg-emerald-400" />
          {daten.name || "Bot"} verbunden seit {datumZeit(daten.onlineSeit)}
          {daten.ping != null && <span className="text-white/40">· Ping {num(daten.ping)} ms</span>}
        </span>
        {fehler && <span className="text-xs text-red-400">{fehler}</span>}
        {aktualisieren}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kacheln.map((k) => (
          <div key={k.label} className="rounded-lg border border-line bg-surface/80 p-5">
            <div className="text-white/40 text-xs font-bold uppercase tracking-wider mb-2">{k.label}</div>
            <div className="text-3xl font-bold text-white tabular-nums">{k.wert}</div>
            {k.hinweis && <div className="text-[11px] text-white/30 mt-1">{k.hinweis}</div>}
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-line bg-surface/80 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-black/25 text-[10px] uppercase tracking-wider text-white/40">
              <tr>
                <th className="p-3 font-bold">Server</th>
                <th className="p-3 font-bold text-right">Mitglieder</th>
                <th className="p-3 font-bold text-right">Bot dabei seit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {daten.liste.map((g) => {
                const neu = g.beigetreten && daten.at - g.beigetreten <= 7 * TAG_MS;
                return (
                  <tr key={g.id} className="hover:bg-white/[0.03] transition-colors">
                    <td className="p-3 text-white/90">
                      {g.name}
                      {neu && <span className="ml-2 text-[9px] font-bold uppercase tracking-wider text-emerald-300 border border-emerald-500/30 px-1.5 rounded">neu</span>}
                    </td>
                    <td className="p-3 text-right text-white tabular-nums">{num(g.mitglieder)}</td>
                    <td className="p-3 text-right text-white/50 tabular-nums">{datum(g.beigetreten)}</td>
                  </tr>
                );
              })}
              {daten.liste.length === 0 && (
                <tr><td colSpan={3} className="p-8 text-center text-white/30 italic">Der Bot ist auf keinem Server.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {daten.server > daten.liste.length && (
          <p className="px-3 py-2 text-[11px] text-white/30 border-t border-white/5">
            Gezeigt werden die {daten.liste.length} größten von {num(daten.server)} Servern.
          </p>
        )}
      </div>

      <p className="text-[11px] text-white/30 leading-relaxed">
        Neuzugänge zählen Server, denen der Bot im Zeitraum beigetreten ist. Wer ihn wieder entfernt, verschwindet aus
        der Liste — Abgänge zeigt diese Übersicht deshalb nicht.
      </p>
    </div>
  );
}
