// Results.jsx — Ergebnis nach der Runde: Platz, Name, Zeit, Abstand zum Ersten, Tode und die Zwischenzeiten je Checkpoint (die
// beste jeweils hervorgehoben). Darunter das Level zum Bewerten (1–5 Sterne) und Merken (Favorit) — jede Runde einzeln, auch
// in einer Serie. Der Host startet die nächste Runde (neuer Seed), die Revanche (gleicher Seed) oder geht zurück in die Lobby.
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

/** Gesamtwertung nach der letzten Runde einer Serie */
function StandingsTable({ standings, meId }) {
  return (
    <Panel title="Gesamtwertung" bodyClassName="">
      <ol className="sr-rows">
        {standings.map((r, i) => (
          <li key={r.id} className={`px-4 py-2.5 flex items-center gap-3 ${r.id === meId ? "bg-white/[0.04]" : ""}`}>
            <span className={`sr-num w-6 text-right shrink-0 ${i === 0 ? "sr-accent-text text-lg" : "sr-faint"}`}>{i + 1}</span>
            <span className="w-3 h-3 rounded-[2px] shrink-0" style={{ background: r.color }} />
            <span className="flex-1 min-w-0 truncate sr-ink">
              {r.name}{r.id === meId && <span className="sr-faint"> (du)</span>}
            </span>
            <span className="sr-num sr-ink">{r.points} P.</span>
          </li>
        ))}
      </ol>
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
            <p className="sr-label mb-1">{inSeries ? `Runde ${series.index} von ${series.total}` : "Ergebnis"}</p>
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
                      {r.invalid ? <span className="sr-warn">nicht bestätigt</span> : r.dnf ? "DNF" : formatTicks(r.ticks)}
                      {r.verified === true && (
                        <ShieldCheck size={14} className="inline-block ml-2 -mt-0.5 sr-good" aria-label="Vom Server nachgespielt und bestätigt" />
                      )}
                    </td>
                    <td className="px-2 py-2.5 sr-num sr-dim whitespace-nowrap">{r.dnf ? "–" : formatGap(r.gap)}</td>
                    <td className="px-2 py-2.5 sr-num sr-dim">{r.dnf ? "–" : r.deaths}</td>
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
            {splitIndexes.length > 0 && <p>Hervorgehoben: beste Zwischenzeit am jeweiligen Checkpoint.</p>}
            {anyInvalid && <p className="sr-warn">Nicht bestätigte Zeiten hat der Server nachgespielt: Die Eingaben führten nicht zu dieser Zeit, sie zählen nicht.</p>}
          </div>
        )}
        {levelRef && (
          <div className="px-4 py-3 sr-divider">
            <RateBox levelRef={levelRef} level={level} />
          </div>
        )}
      </section>

      {inSeries && !series.hasNext && <StandingsTable standings={series.standings} meId={meId} />}

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
