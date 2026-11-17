// SpielePanel.jsx — Reiter „Spiele“ im AdminDashboard: Besucher, Spielzeit und Partien je Spiel, was gerade offen ist,
// und der Trichter Startseite → Spiel. Holt sich seine Daten selbst von GET /api/admin/spiele (Backend/admin/routes.js);
// gezählt wird in Backend/analytics/ (Seiten → Spiele: analytics/spiele.js), Live-Zahlen und Partien melden die Spiele
// über Backend/lib/spielStatistik.js.
import React, { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

const ZEITRAUM = [
  { tage: 7, label: "7 Tage" },
  { tage: 30, label: "30 Tage" },
  { tage: 90, label: "90 Tage" },
];
const AUFFRISCHEN_MS = 15_000;

const num = (n) => Number(n || 0).toLocaleString("de-DE");
const euro = (cent) => (Number(cent || 0) / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
const anteil = (teil, ganzes) => (ganzes ? Math.round((teil / ganzes) * 100) : 0);
const tagLabel = (day) => {
  const [y, m, d] = String(day).split("-");
  return `${d}.${m}.${y}`;
};

function spielzeit(sekunden) {
  const s = Math.round(sekunden || 0);
  if (s < 60) return `${s} s`;
  const min = s / 60;
  if (min < 120) return `${Math.round(min)} min`;
  return `${(min / 60).toLocaleString("de-DE", { maximumFractionDigits: 1 })} h`;
}

function MiniVerlauf({ series }) {
  const max = Math.max(1, ...series.map((d) => d.visitors));
  const eng = series.length > 45;
  return (
    <div className={`flex items-end h-6 w-32 ${eng ? "" : "gap-px"}`}>
      {series.map((d) => (
        <div key={d.day} title={`${tagLabel(d.day)}: ${num(d.visitors)} Besucher${d.matches != null ? ` · ${num(d.matches)} Partien` : ""}`}
          className="flex-1 bg-accent/70 rounded-[1px]"
          style={{ height: `${(d.visitors / max) * 100}%`, minHeight: d.visitors > 0 ? 2 : 0 }} />
      ))}
    </div>
  );
}

// Breit: Beschriftung | Balken | Zahl in einer Zeile. Schmal: Beschriftung und Zahl oben, der Balken darunter über die
// volle Breite — sonst bliebe ihm neben dem Text kein Platz.
function TrichterZeile({ label, wert, basis, text }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,11rem)_1fr_auto] items-center gap-x-3 gap-y-1 text-sm">
      <span className="text-white/70 truncate">{label}</span>
      <div className="h-2.5 rounded-sm bg-white/[0.06] overflow-hidden col-span-2 sm:col-span-1 order-last sm:order-none">
        <div className="h-full bg-accent" style={{ width: `${basis ? Math.min(100, (wert / basis) * 100) : 0}%` }} />
      </div>
      <span className="text-right tabular-nums whitespace-nowrap">
        <span className="text-white font-semibold">{num(wert)}</span>
        {text && <span className="text-white/40 text-xs ml-2">{text}</span>}
      </span>
    </div>
  );
}

// Wiederkehr neuer Konten (Backend/konto, GET /api/admin/konten): Anteil, der nach 1, 7 bzw. 30 Tagen wieder da war
function QuoteZeile({ label, wert }) {
  const basis = wert?.basis || 0;
  const zurueck = wert?.zurueck || 0;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,11rem)_1fr_auto] items-center gap-x-3 gap-y-1 text-sm">
      <span className="text-white/70 truncate">{label}</span>
      <div className="h-2.5 rounded-sm bg-white/[0.06] overflow-hidden col-span-2 sm:col-span-1 order-last sm:order-none">
        <div className="h-full bg-emerald-400/80" style={{ width: `${anteil(zurueck, basis)}%` }} />
      </div>
      <span className="text-right tabular-nums whitespace-nowrap">
        {basis ? (
          <>
            <span className="text-white font-semibold">{anteil(zurueck, basis)} %</span>
            <span className="text-white/40 text-xs ml-2">{num(zurueck)} von {num(basis)}</span>
          </>
        ) : <span className="text-white/30 text-xs">noch zu früh</span>}
      </span>
    </div>
  );
}

function WiederkehrKarte({ konten }) {
  if (!konten) return null;
  const { wiederkehr: w, zahlen: z } = konten;
  return (
    <div className="rounded-lg border border-line bg-surface/80 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-white/40">Wiederkehr neuer Konten</h3>
        <span className="text-[11px] text-white/30">{num(w.neu)} {w.neu === 1 ? "neues Konto" : "neue Konten"} im Zeitraum</span>
      </div>
      <div className="space-y-2.5">
        <QuoteZeile label="Am Folgetag wieder da" wert={w.tag1} />
        <QuoteZeile label="Innerhalb von 7 Tagen" wert={w.tage7} />
        <QuoteZeile label="Innerhalb von 30 Tagen" wert={w.tage30} />
      </div>
      <p className="text-[11px] text-white/35 mt-4">
        Konten gesamt {num(z.konten)} · mit Twitch {num(z.twitch)} · mit Discord {num(z.discord)} · nur Gast {num(z.nurGast)} · mit Spielstand {num(z.mitSpielstand)}
        {/* Einladungslinks (Backend/einladung): angenommen = neues Konto über einen Link, bestätigt = am zweiten Tag wieder da */}
        {konten.einladungen && ` · Einladungen ${num(konten.einladungen.angenommen)} angenommen, ${num(konten.einladungen.bestaetigt)} bestätigt`}
        {/* Laden (Backend/laden): bezahlte Käufe gesamt, Beträge brutto */}
        {konten.laden?.unterstuetzer && ` · Unterstützungen ${num(konten.laden.unterstuetzer.anzahl)} (${euro(konten.laden.unterstuetzer.cent)})`}
        {konten.laden?.artikel && ` · Laden-Käufe ${num(konten.laden.artikel.anzahl)} (${euro(konten.laden.artikel.cent)})`}
      </p>
    </div>
  );
}

function Jetzt({ live }) {
  if (live === undefined) return <span className="text-white/25" title="Dieses Spiel meldet noch keine Live-Zahlen">–</span>;
  if (live === null) return <span className="text-red-300 text-xs">nicht lesbar</span>;
  if (!live.raeume && !live.spieler) return <span className="text-white/40">leer</span>;
  return (
    <span className="tabular-nums whitespace-nowrap">
      <span className="text-emerald-300 font-semibold">{num(live.spieler)}</span>
      <span className="text-white/40 text-xs"> in {num(live.raeume)} {live.raeume === 1 ? "Raum" : "Räumen"}</span>
    </span>
  );
}

export default function SpielePanel() {
  const [tage, setTage] = useState(30);
  const [daten, setDaten] = useState(null);
  const [konten, setKonten] = useState(null);
  const [fehler, setFehler] = useState("");
  const [laedt, setLaedt] = useState(false);

  const laden = useCallback(async (leise = false) => {
    if (!leise) setLaedt(true);
    try {
      const [res, kontenRes] = await Promise.all([
        fetch(`/api/admin/spiele?days=${tage}`, { credentials: "include" }),
        fetch(`/api/admin/konten?days=${tage}`, { credentials: "include" }).catch(() => null),
      ]);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDaten(await res.json());
      // Konten sind ein eigener Speicher — fehlen sie, fehlt nur die Wiederkehr-Karte
      setKonten(kontenRes?.ok ? await kontenRes.json().catch(() => null) : null);
      setFehler("");
    } catch (e) {
      console.error(e);
      setFehler("Spiele-Statistik konnte nicht geladen werden.");
    }
    if (!leise) setLaedt(false);
  }, [tage]);

  useEffect(() => { laden(); }, [laden]);

  // Die Live-Spalte veraltet im Sekundentakt; solange der Reiter offen und sichtbar ist, still nachladen
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) laden(true); }, AUFFRISCHEN_MS);
    return () => clearInterval(t);
  }, [laden]);

  const knopf = (aktiv) => `px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
    aktiv ? "bg-accent text-white" : "text-white/50 hover:text-white hover:bg-white/5"
  }`;

  if (!daten) return <div className="p-8 text-center text-white/40">{fehler || "Lade Spiele-Statistik..."}</div>;

  const live = daten.live || {};
  const liveWerte = Object.values(live).filter(Boolean);
  const spielerJetzt = liveWerte.reduce((s, l) => s + l.spieler, 0);
  const raeumeJetzt = liveWerte.reduce((s, l) => s + l.raeume, 0);
  const t = daten.trichter;
  const melden = daten.spiele.filter((s) => s.matches != null);
  const partien = melden.reduce((s, x) => s + x.matches, 0);
  const abSeit = daten.seit && daten.seit > daten.from;

  const kacheln = [
    { label: "Gerade in Spielen", wert: num(spielerJetzt), hinweis: `in ${num(raeumeJetzt)} offenen Räumen · ${Object.keys(live).length} Spiele melden` },
    { label: "Spielende Besucher", wert: num(t?.game), hinweis: "Summe der Tageswerte" },
    { label: "Startseite → Spiel", wert: t ? `${anteil(t.startToGame, t.start)} %` : "–", hinweis: t ? `${num(t.startToGame)} von ${num(t.start)} am selben Tag` : "noch keine Daten" },
    { label: "Partien", wert: melden.length ? num(partien) : "–", hinweis: melden.length ? `von ${melden.length} ${melden.length === 1 ? "Spiel" : "Spielen"}, die zählen` : "noch kein Spiel meldet Partien" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="rounded-lg border border-line bg-surface/80 p-1 flex gap-1">
          {ZEITRAUM.map((z) => (
            <button key={z.tage} type="button" onClick={() => setTage(z.tage)} className={knopf(tage === z.tage)}>{z.label}</button>
          ))}
        </div>
        {fehler && <span className="text-xs text-red-400">{fehler}</span>}
        <span className="text-xs text-white/30">Stand {new Date(daten.at).toLocaleTimeString("de-DE")} · lädt alle 15 s nach</span>
        <button type="button" onClick={() => laden()} disabled={laedt}
          className="ml-auto flex items-center gap-1.5 px-4 py-2.5 bg-accent hover:bg-accent-hover disabled:bg-white/5 disabled:text-white/30 text-white rounded-lg text-sm font-semibold transition-colors">
          <RefreshCw size={14} /> {laedt ? "Lädt..." : "Aktualisieren"}
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kacheln.map((k) => (
          <div key={k.label} className="rounded-lg border border-line bg-surface/80 p-5">
            <div className="text-white/40 text-xs font-bold uppercase tracking-wider mb-2">{k.label}</div>
            <div className="text-3xl font-bold text-white tabular-nums">{k.wert}</div>
            <div className="text-[11px] text-white/30 mt-1">{k.hinweis}</div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-line bg-surface/80 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-white/40">Weg ins Spiel</h3>
          {abSeit && <span className="text-[11px] text-white/30">gezählt seit {tagLabel(daten.seit)}</span>}
        </div>
        {t ? (
          <div className="space-y-2.5">
            <TrichterZeile label="Besucher" wert={t.visitors} basis={t.visitors} />
            <TrichterZeile label="Auf der Startseite" wert={t.start} basis={t.visitors} text={`${anteil(t.start, t.visitors)} % aller Besucher`} />
            <TrichterZeile label="Von dort in ein Spiel" wert={t.startToGame} basis={t.visitors} text={`${anteil(t.startToGame, t.start)} % der Startseite`} />
            <div className="pt-2 mt-1 border-t border-white/5" />
            <TrichterZeile label="In ein Spiel insgesamt" wert={t.game} basis={t.visitors} text={`${anteil(t.game, t.visitors)} % aller Besucher`} />
            <TrichterZeile label="Ohne die Startseite" wert={Math.max(0, t.game - t.startToGame)} basis={t.visitors} text="direkt per Link" />
          </div>
        ) : (
          <p className="text-sm text-white/30 italic">Noch keine Daten. Gezählt wird ab dem Update, das diesen Reiter gebracht hat.</p>
        )}
      </div>

      <WiederkehrKarte konten={konten} />

      <div className="rounded-lg border border-line bg-surface/80 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-black/25 text-[10px] uppercase tracking-wider text-white/40">
              <tr>
                <th className="p-3 font-bold">Spiel</th>
                <th className="p-3 font-bold">Jetzt</th>
                <th className="p-3 font-bold text-right">Besucher</th>
                <th className="p-3 font-bold text-right">Ø pro Tag</th>
                <th className="p-3 font-bold text-right">Spielzeit</th>
                <th className="p-3 font-bold text-right">Partien</th>
                <th className="p-3 font-bold">Besucher pro Tag</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {daten.spiele.map((s) => {
                const gezaehlt = s.series.filter((d) => !daten.seit || d.day >= daten.seit).length || 1;
                return (
                  <tr key={s.id} className="hover:bg-white/[0.03] transition-colors">
                    <td className="p-3 text-white font-semibold whitespace-nowrap">{s.name}</td>
                    <td className="p-3"><Jetzt live={live[s.id]} /></td>
                    <td className="p-3 text-right text-white tabular-nums">{num(s.visitors)}</td>
                    <td className="p-3 text-right text-white/60 tabular-nums">{(s.visitors / gezaehlt).toLocaleString("de-DE", { maximumFractionDigits: 1 })}</td>
                    <td className="p-3 text-right text-white/60 tabular-nums" title={`${num(s.views)} Aufrufe`}>{spielzeit(s.seconds)}</td>
                    <td className="p-3 text-right tabular-nums">
                      {s.matches == null
                        ? <span className="text-white/25" title="Dieses Spiel meldet noch keine Partien">–</span>
                        : <span className="text-white" title={`gezählt seit ${tagLabel(s.matchesSince)}`}>{num(s.matches)}</span>}
                    </td>
                    <td className="p-3"><MiniVerlauf series={s.series} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11px] text-white/30 leading-relaxed">
        Besucher je Spiel und der Weg ins Spiel werden wie die Besucherstatistik ohne Cookies gezählt und nur innerhalb eines
        Tages wiedererkannt: wer an drei Tagen spielt, zählt dreimal, und „Startseite → Spiel“ heißt am selben Tag.
        Spielzeit ist die sichtbare Zeit auf den Spielseiten. „Jetzt“ und „Partien“ melden die Spiele selbst; „–“ heißt,
        das Spiel ist noch nicht angeschlossen. Deine eigenen Besuche zählen nicht.
      </p>
      <p className="text-[11px] text-white/30 leading-relaxed">
        Wiederkehr gibt es nur für angemeldete Konten (Twitch, Discord oder Gast): gezählt werden aktive Tage je Konto,
        gelöscht nach 120 Tagen. Ein Zeitfenster zählt erst, wenn es vorbei ist. Konten aus Sitzungen von vor dem
        Konto-Update gelten nicht als neu; wer sich danach zum ersten Mal wieder mit Twitch anmeldet, schon.
      </p>
    </div>
  );
}
