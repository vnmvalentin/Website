// Results.jsx — Ergebnis nach der Runde: Platz, Name, Zeit, Abstand zum Ersten, Tode und die Zwischenzeiten je Checkpoint (die
// beste jeweils hervorgehoben). Darunter das Level zum Bewerten (1–5 Sterne) und Merken (Favorit) — jede Runde einzeln, auch
// in einer Serie. Jede Runde landet außerdem im Verlauf dieses Browsers (rundenVerlauf.js, Seite „Verlauf“). Der Host startet die nächste Runde (neuer Seed), die Revanche (gleicher Seed) oder geht zurück in die Lobby.
//
// Anti-Cheat: Der Server spielt den Lauf des Siegers nach (beim Tages-Level alle). Ein Haken heißt "nachgespielt
// und bestätigt", "nicht bestätigt" heißt: Das Nachspielen ergab nicht diese Zeit — der Lauf zählt nicht.
import React, { useEffect, useState } from "react";
import { RotateCcw, Shuffle, ArrowLeft, ShieldCheck, ArrowRight } from "lucide-react";
import { formatTicks, formatGap } from "./format.js";
import { Panel, Spinner } from "../ui/kit.jsx";
import RateBox from "../ui/RateBox.jsx";
import { refForRound, randomTitle, infoFromLevel } from "../ui/levelRef.js";
import { pfadLevel } from "../client/generateWorldAsync.js";
import { merkeRunde, eintragAusRunde } from "./rundenVerlauf.js";

/**
 * Wertung über mehrere Runden: die Serie (Zwischenstand bzw. Gesamtwertung) oder die ganze Sitzung seit der Lobby.
 * Gleiche Punktzahl = gleicher Platz. `extra`: zusätzliche Spalten [{ label, value(r) }].
 */
function StandingsTable({ title, note, standings, meId, extra = [] }) {
  let place = 0;
  return (
    <Panel title={title} bodyClassName="">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left sr-label">
            <th className="px-4 py-2 font-semibold w-12">Platz</th>
            <th className="px-2 py-2 font-semibold">Name</th>
            {extra.map((c) => <th key={c.label} className="px-2 py-2 font-semibold text-right">{c.label}</th>)}
            <th className="px-4 py-2 font-semibold text-right">Punkte</th>
          </tr>
        </thead>
        <tbody className="sr-rows">
          {standings.map((r, i) => {
            if (i === 0 || standings[i - 1].points !== r.points) place = i + 1;
            return (
              <tr key={r.id} className={r.id === meId ? "bg-white/[0.04]" : ""}>
                <td className={`px-4 py-2.5 sr-num ${place === 1 ? "sr-accent-text text-base" : "sr-faint"}`}>{place}</td>
                <td className="px-2 py-2.5 sr-ink whitespace-nowrap">
                  <span className="inline-block w-3 h-3 rounded-[2px] mr-2.5 align-middle" style={{ background: r.color }} />
                  {r.name}{r.id === meId && <span className="sr-faint"> (du)</span>}
                </td>
                {extra.map((c) => <td key={c.label} className="px-2 py-2.5 sr-num sr-dim text-right">{c.value(r)}</td>)}
                <td className="px-4 py-2.5 sr-num sr-ink text-right">{r.points}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {note && <p className="px-4 py-2.5 sr-divider text-xs sr-faint">{note}</p>}
    </Panel>
  );
}

/** Das gespielte Level: Name bzw. Leitidee und Autor, Seed */
function LevelLine({ round, level }) {
  if (round?.kind === "custom" && round.custom) {
    return <p className="text-sm sr-dim">{round.custom.name} <span className="sr-faint">von {round.custom.creatorName} · {round.custom.code}</span></p>;
  }
  const params = round?.params;
  if (!params) return null;
  const info = infoFromLevel(level);
  return (
    <p className="text-sm sr-dim">
      {round.kind === "daily" ? "Tages-Level" : randomTitle(info)}
      <span className="sr-faint"> · Seed <span className="sr-num">{params.seed}</span></span>
    </p>
  );
}

export default function Results({ state, meId, isHost, actions }) {
  const results = state.results || [];
  const round = state.round;
  const total = round?.checkpointTotal || 0;
  const series = state.series;
  const inSeries = series && series.total > 1;
  const timeattack = round?.mode === "timeattack";
  // Sitzungswertung nur, wenn sie mehr zeigt als die Runde bzw. Serie selbst: mehr Runden seit der Lobby als in dieser Serie
  const session = state.session;
  const showSession = session && session.rounds > (inSeries ? series.index : 1);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [level, setLevel] = useState(null);

  // Das Pfad-Level der Runde steht im Cache (es wurde eben gespielt) — Leitidee und Autor für Anzeige und Favorit
  useEffect(() => {
    setLevel(null);
    const p = round?.kind !== "custom" ? pfadLevel(round?.params) : null;
    if (!p) return undefined;
    let alive = true;
    p.then((l) => { if (alive) setLevel(l); }, () => {});
    return () => { alive = false; };
  }, [round?.number]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (name, fn) => {
    setBusy(name);
    setError("");
    const res = await fn();
    setBusy("");
    if (!res.ok) setError(res.error || "Nicht möglich.");
  };

  // Nur Checkpoints zeigen, die jemand erreicht hat
  const splitIndexes = [];
  for (let i = 1; i <= total; i++) if (results.some((r) => r.splits.some(([idx]) => idx === i))) splitIndexes.push(i);

  const winner = results.find((r) => !r.dnf);
  const anyInvalid = results.some((r) => r.invalid);
  const levelRef = refForRound(round);

  // In den Verlauf: sofort mit Seed und Platz, Leitidee/Autor kommen nach, sobald das Level gebaut ist; spätere Bestätigungen
  // (nicht bestätigte Zeit) überschreiben denselben Eintrag
  useEffect(() => {
    const entry = eintragAusRunde({ round, results, meId, ref: levelRef, info: levelRef?.kind === "pfad" ? infoFromLevel(level) : null });
    if (entry) merkeRunde(entry);
  }, [round?.startAt, round?.number, results, level, meId]); // eslint-disable-line react-hooks/exhaustive-deps

  const primary = (name, icon, label, fn) => (
    <button type="button" disabled={!!busy} onClick={() => run(name, fn)} className="sr-btn">
      {busy === name ? <Spinner size={15} className="!text-current" /> : icon}{label}
    </button>
  );
  const secondary = (name, icon, label, fn, quiet = false) => (
    <button type="button" disabled={!!busy} onClick={() => run(name, fn)} className={`sr-btn ${quiet ? "sr-btn-quiet" : "sr-btn-ghost"}`}>
      {busy === name ? <Spinner size={15} /> : icon}{label}
    </button>
  );

  return (
    <div className="space-y-4">
      <section className="sr-panel">
        <div className="px-4 pt-4 pb-3 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div className="min-w-0">
            <p className="sr-label mb-1">
              {inSeries ? `Runde ${series.index} von ${series.total}` : session?.rounds > 1 ? `Runde ${session.rounds} dieser Sitzung` : "Ergebnis"}
              {timeattack ? " · Zeitjagd" : ""}
            </p>
            <h2 className="sr-display text-2xl md:text-3xl">{winner ? `${winner.name} gewinnt` : "Niemand im Ziel"}</h2>
          </div>
          <LevelLine round={round} level={level} />
        </div>

        <div className="overflow-x-auto sr-divider">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left sr-label">
                <th className="px-4 py-2.5 font-semibold w-14">Platz</th>
                <th className="px-2 py-2.5 font-semibold">Name</th>
                <th className="px-2 py-2.5 font-semibold">Zeit</th>
                <th className="px-2 py-2.5 font-semibold">Abstand</th>
                <th className="px-2 py-2.5 font-semibold">Tode</th>
                {timeattack && <th className="px-2 py-2.5 font-semibold">Läufe</th>}
                {inSeries && <th className="px-2 py-2.5 font-semibold">Punkte</th>}
                {splitIndexes.map((i) => <th key={i} className="px-2 py-2.5 font-semibold whitespace-nowrap">CP {i}</th>)}
              </tr>
            </thead>
            <tbody className="sr-rows">
              {results.map((r) => {
                const bySplit = new Map(r.splits);
                return (
                  <tr key={r.id} className={r.id === meId ? "bg-white/[0.04]" : ""}>
                    <td className={`px-4 py-2.5 sr-num ${r.place === 1 && !r.dnf ? "sr-accent-text text-base" : "sr-dim"}`}>{r.dnf ? "–" : r.place}</td>
                    <td className="px-2 py-2.5 sr-ink whitespace-nowrap">
                      <span className="inline-block w-3 h-3 rounded-[2px] mr-2.5 align-middle" style={{ background: r.color }} />
                      {r.name}
                      {r.id === meId && <span className="sr-faint"> (du)</span>}
                    </td>
                    <td className="px-2 py-2.5 sr-num sr-ink whitespace-nowrap">
                      {r.invalid ? <span className="sr-warn">nicht bestätigt</span> : r.dnf ? (r.died ? "DNF · Tod" : "DNF") : formatTicks(r.ticks)}
                      {r.verified === true && (
                        <ShieldCheck size={14} className="inline-block ml-2 -mt-0.5 sr-good" aria-label="Vom Server nachgespielt und bestätigt" />
                      )}
                    </td>
                    <td className="px-2 py-2.5 sr-num sr-dim whitespace-nowrap">{r.dnf ? "–" : formatGap(r.gap)}</td>
                    <td className="px-2 py-2.5 sr-num sr-dim">{r.dnf ? "–" : r.deaths}</td>
                    {timeattack && <td className="px-2 py-2.5 sr-num sr-dim">{r.runs ?? 0}</td>}
                    {inSeries && <td className="px-2 py-2.5 sr-num sr-ink">{r.points}</td>}
                    {splitIndexes.map((i) => (
                      <td key={i} className={`px-2 py-2.5 sr-num whitespace-nowrap ${r.bestSplits.includes(i) ? "sr-accent-text" : "sr-dim"}`}>
                        {bySplit.has(i) ? formatTicks(bySplit.get(i)) : "–"}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {(splitIndexes.length > 0 || anyInvalid) && (
          <div className="px-4 py-2.5 sr-divider text-xs sr-faint space-y-1">
            {splitIndexes.length > 0 && <p>Hervorgehoben: beste Zwischenzeit am jeweiligen Checkpoint.{timeattack ? " Zeiten, Tode und Zwischenzeiten gehören jeweils zum besten Lauf." : ""}</p>}
            {anyInvalid && <p className="sr-warn">Nicht bestätigte Zeiten hat der Server nachgespielt: Die Eingaben führten nicht zu dieser Zeit, sie zählen nicht.</p>}
          </div>
        )}
        {levelRef && (
          <div className="px-4 py-3 sr-divider">
            <RateBox levelRef={levelRef} level={level} />
          </div>
        )}
      </section>

      {(inSeries || showSession) && (
        <div className={`grid gap-4 items-start ${inSeries && showSession ? "lg:grid-cols-2" : ""}`}>
          {inSeries && series.standings && (
            <StandingsTable
              title={series.hasNext ? `Zwischenstand · nach Runde ${series.index} von ${series.total}` : "Gesamtwertung der Serie"}
              standings={series.standings}
              meId={meId}
              note={series.hasNext ? "Bei Punktgleichstand am Ende entscheidet die Summe der Zeiten." : null}
            />
          )}
          {showSession && (
            <StandingsTable
              title={`Sitzung · ${session.rounds} Runden`}
              standings={session.standings}
              meId={meId}
              extra={[{ label: "Siege", value: (r) => r.wins }, { label: "Runden", value: (r) => r.rounds }]}
              note="Alle Runden seit der Lobby. Zurück in die Lobby beginnt eine neue Sitzung."
            />
          )}
        </div>
      )}

      <div className="sr-panel-flat px-4 py-3 flex flex-wrap items-center gap-3">
        {isHost ? (
          inSeries && series.hasNext ? (
            <>
              {primary("next", <ArrowRight size={16} />, `Nächste Runde (${series.index + 1} / ${series.total})`, () => actions.start("next"))}
              {secondary("lobby", <ArrowLeft size={15} />, "Serie abbrechen · Zur Lobby", () => actions.toLobby(), true)}
            </>
          ) : inSeries ? (
            <>
              {primary("settings", <Shuffle size={16} />, "Neue Serie", () => actions.start("settings"))}
              {secondary("lobby", <ArrowLeft size={15} />, "Zur Lobby", () => actions.toLobby(), true)}
            </>
          ) : (
            <>
              {primary("new", <Shuffle size={16} />, "Nächste Runde (neuer Seed)", () => actions.start("new"))}
              {secondary("same", <RotateCcw size={15} />, "Revanche (gleicher Seed)", () => actions.start("same"))}
              {secondary("lobby", <ArrowLeft size={15} />, "Zur Lobby", () => actions.toLobby(), true)}
            </>
          )
        ) : (
          <p className="text-sm sr-dim flex items-center gap-2">
            <Spinner size={14} />
            {inSeries && series.hasNext ? "Der Host startet die nächste Runde …" : "Der Host entscheidet, wie es weitergeht …"}
          </p>
        )}
        {error && <p className="text-sm sr-bad basis-full">{error}</p>}
      </div>
    </div>
  );
}
