// LeistungPanel.jsx — Leistung echter Besucher im AdminDashboard (Reiter „Leistung“). Holt sich seine Daten selbst von
// GET /api/leistung/auswertung; gemessen wird in utils/leistungMessung.js, gespeichert in Backend/leistung/.
import React, { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

const ZEITRAUM = [
  { tage: 7, label: "7 Tage" },
  { tage: 30, label: "30 Tage" },
  { tage: 90, label: "90 Tage" },
];
const GERAETE = [
  { id: "alle", label: "Alle Geräte" },
  { id: "Handy", label: "Handy" },
  { id: "PC", label: "PC" },
  { id: "PC schwach", label: "PC schwach" },
];
const METRIKEN = [
  { id: "fcp", label: "Erster Inhalt", zeit: true },
  { id: "lcp", label: "Größter Inhalt", zeit: true },
  { id: "inp", label: "Reaktion", zeit: true },
  { id: "cls", label: "Layout-Sprünge", zeit: false },
];
const FARBE = { gut: "text-emerald-300", mittel: "text-amber-300", schlecht: "text-red-300" };
const FPS_NAMEN = ["unter 15", "15–25", "25–35", "35–50", "50–58", "ab 58"];

const prozent = (x) => `${Math.round((x || 0) * 100)} %`;
const zahl = (x, stellen = 0) => Number(x || 0).toLocaleString("de-DE", { maximumFractionDigits: stellen, minimumFractionDigits: stellen });

// Eigene Schwellen für Spiele (Google hat dafür keine): Anteil Bilder über 33 ms bzw. über 50 ms
function bewertungLange(anteil, gut, mittel) {
  if (anteil <= gut) return "gut";
  return anteil <= mittel ? "mittel" : "schlecht";
}

function Kennzahl({ m, zeit }) {
  if (!m) return <span className="text-white/25">–</span>;
  const wert = zeit ? (m.p75 >= 1000 ? `${zahl(m.p75 / 1000, 1)} s` : `${m.p75} ms`) : zahl(m.p75, 2);
  const titel = `${zahl(m.n)} Messungen · gut ${prozent(m.anteile.gut)} · mittel ${prozent(m.anteile.mittel)} · schlecht ${prozent(m.anteile.schlecht)}`;
  return (
    <span className={`${FARBE[m.bewertung] || "text-white"} tabular-nums font-semibold`} title={titel}>
      {m.offen ? "über " : "≤ "}{wert}
    </span>
  );
}

function FpsVerteilung({ faecher }) {
  const summe = faecher.reduce((s, x) => s + x, 0) || 1;
  return (
    <div className="flex h-2 w-28 overflow-hidden rounded-sm bg-white/[0.06]" title={faecher.map((x, i) => `${FPS_NAMEN[i]} fps: ${x}`).join(" · ")}>
      {faecher.map((x, i) => (
        <div key={i} style={{ width: `${(x / summe) * 100}%` }}
          className={i <= 1 ? "bg-red-400/80" : i <= 3 ? "bg-amber-300/80" : "bg-emerald-400/80"} />
      ))}
    </div>
  );
}

export default function LeistungPanel() {
  const [tage, setTage] = useState(30);
  const [geraet, setGeraet] = useState("alle");
  const [daten, setDaten] = useState(null);
  const [fehler, setFehler] = useState("");
  const [laedt, setLaedt] = useState(false);

  const laden = useCallback(async () => {
    setLaedt(true);
    try {
      const res = await fetch(`/api/leistung/auswertung?tage=${tage}&geraet=${encodeURIComponent(geraet)}`, { credentials: "include" });
      if (!res.ok) throw new Error(String(res.status));
      setDaten(await res.json());
      setFehler("");
    } catch {
      setFehler("Leistungsdaten konnten nicht geladen werden.");
    } finally {
      setLaedt(false);
    }
  }, [tage, geraet]);

  useEffect(() => { laden(); }, [laden]);

  const seiten = daten?.seiten || [];
  const spiele = daten?.spiele || [];
  const leer = daten && !seiten.length && !spiele.length;

  const knopf = (aktiv) => `px-3 py-1.5 rounded-md text-sm font-semibold transition-colors ${aktiv ? "bg-accent text-white" : "text-white/50 hover:text-white/80"}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="rounded-lg border border-line bg-surface/80 p-1 flex gap-1">
          {ZEITRAUM.map((z) => (
            <button key={z.tage} type="button" className={knopf(tage === z.tage)} onClick={() => setTage(z.tage)}>{z.label}</button>
          ))}
        </div>
        <div className="rounded-lg border border-line bg-surface/80 p-1 flex flex-wrap gap-1">
          {GERAETE.map((g) => (
            <button key={g.id} type="button" className={knopf(geraet === g.id)} onClick={() => setGeraet(g.id)}>{g.label}</button>
          ))}
        </div>
        <button type="button" onClick={laden} disabled={laedt}
          className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-white/60 hover:text-white border border-line transition-colors disabled:opacity-50">
          <RefreshCw size={14} className={laedt ? "animate-spin" : ""} /> Aktualisieren
        </button>
      </div>

      {fehler && <p className="text-sm text-red-300">{fehler}</p>}

      {leer && (
        <div className="rounded-lg border border-line bg-surface/80 p-8 text-center text-white/50 text-sm">
          Noch keine Messungen in diesem Zeitraum. Gemessen wird bei echten Besuchern, deine eigenen Besuche zählen nicht.
        </div>
      )}

      {seiten.length > 0 && (
        <div className="rounded-lg border border-line bg-surface/80 overflow-hidden">
          <div className="px-4 pt-4 pb-2">
            <p className="text-sm font-semibold text-white">Seiten: Laden und Reaktion</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-white/40 text-xs">
                  <th className="font-medium px-4 py-2">Seite</th>
                  <th className="font-medium px-3 py-2 text-right">Messungen</th>
                  {METRIKEN.map((m) => <th key={m.id} className="font-medium px-3 py-2 text-right whitespace-nowrap">{m.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {seiten.map((s) => (
                  <tr key={s.seite} className="border-t border-line">
                    <td className="px-4 py-2 text-white/80">{s.seite}</td>
                    <td className="px-3 py-2 text-right text-white/60 tabular-nums">{zahl(s.messungen)}</td>
                    {METRIKEN.map((m) => (
                      <td key={m.id} className="px-3 py-2 text-right whitespace-nowrap"><Kennzahl m={s.metriken[m.id]} zeit={m.zeit} /></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {spiele.length > 0 && (
        <div className="rounded-lg border border-line bg-surface/80 overflow-hidden">
          <div className="px-4 pt-4 pb-2">
            <p className="text-sm font-semibold text-white">Spiele: Flüssigkeit</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-white/40 text-xs">
                  <th className="font-medium px-4 py-2">Spiel</th>
                  <th className="font-medium px-3 py-2 text-right">Minuten</th>
                  <th className="font-medium px-3 py-2 text-right">Bildrate Ø</th>
                  <th className="font-medium px-3 py-2 text-right whitespace-nowrap">unter 30 fps</th>
                  <th className="font-medium px-3 py-2 text-right">Ruckler</th>
                  <th className="font-medium px-3 py-2 text-right">Sparmodus</th>
                  <th className="font-medium px-3 py-2">Verteilung</th>
                </tr>
              </thead>
              <tbody>
                {spiele.map((s) => (
                  <tr key={s.seite} className="border-t border-line">
                    <td className="px-4 py-2 text-white/80">{s.seite}</td>
                    <td className="px-3 py-2 text-right text-white/60 tabular-nums">{zahl(s.minuten, s.minuten < 10 ? 1 : 0)}</td>
                    <td className="px-3 py-2 text-right text-white tabular-nums font-semibold">{zahl(s.fps)} fps</td>
                    <td className={`px-3 py-2 text-right tabular-nums font-semibold ${FARBE[bewertungLange(s.anteil33, 0.05, 0.2)]}`}>{prozent(s.anteil33)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums font-semibold ${FARBE[bewertungLange(s.anteil50, 0.01, 0.05)]}`}>{prozent(s.anteil50)}</td>
                    <td className="px-3 py-2 text-right text-white/60 tabular-nums">{prozent(s.sparmodus)}</td>
                    <td className="px-3 py-2"><FpsVerteilung faecher={s.fpsFaecher} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="text-xs text-white/40 space-y-1.5 max-w-3xl">
        <p>Seiten: Gezeigt wird der Wert, den 75 % der Besuche erreichen oder unterbieten (so wertet auch Google). Grün gut, gelb verbesserungswürdig, rot schlecht, mit Googles Schwellen. Messwerte liefern vor allem Chrome, Edge und Android; Firefox nur die Ladezeiten, Safari kaum etwas.</p>
        <p>Spiele: „unter 30 fps“ ist der Anteil der Bilder über 33 ms, „Ruckler“ der Anteil über 50 ms (grün bis 5 % bzw. 1 %). Die Bildrate hängt auch an der Bildwiederholrate des Geräts (60, 120 oder 144 Hz); aussagekräftiger sind die beiden Anteile. Sparmodus: Anteil der Spielzeit ohne Grafikbeschleunigung.</p>
      </div>
    </div>
  );
}
