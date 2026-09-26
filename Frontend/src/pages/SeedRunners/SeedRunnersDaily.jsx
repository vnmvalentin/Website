// SeedRunnersDaily.jsx — das Tagesrennen: Jeden Tag ein festes Level für alle, allein gespielt, so oft man will.
// Die beste Zeit des Tages zählt. Sie kommt erst in die Rangliste, wenn der Server den Lauf aus dem Input-Log
// nachgespielt und dieselbe Zeit herausbekommen hat (Backend: seedRunners/replay.js, daily.js).
//
// Der Lauf selbst ist der aus den Räumen (RaceView): gleiche Sim, gleiches Rendering, nur ohne Server-Countdown —
// der Start liegt ein paar Sekunden nach dem Klick auf die eigene Uhr.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Play, RotateCcw, Trophy, Loader2, Check, AlertTriangle } from "lucide-react";
import SEO from "../../components/SEO";
import RaceView from "./room/RaceView.jsx";
import { getIdentity, saveIdentity, getDailyKey } from "./room/identity.js";
import { getDailyBoard, submitDailyRun } from "./room/dailyApi.js";
import { formatTicks, formatDelta } from "./room/format.js";
import { checkpointSpalten, besteJeCheckpoint, splitVergleich } from "./room/splits.js";
import { vorerzeugen, pfadLevel } from "./client/generateWorldAsync.js";
import RateBox from "./ui/RateBox.jsx";
import { refForParams } from "./ui/levelRef.js";

const COUNTDOWN_MS = 3300;
// Solo gibt es keinen Uhrenabgleich: Die Startzeit ist schon die eigene Zeit.
const OWN_CLOCK = { toLocal: (t) => t };
const noop = () => {};

const germanDate = (dateKey) => dateKey.split("-").reverse().join(".");

const Panel = ({ children, className = "" }) => (
  <div className={`sr-panel ${className}`}>{children}</div>
);

// Meldung nach dem Einsenden
function SubmitNote({ submit, onRetry }) {
  if (!submit) return null;
  const tone = {
    ok: "sr-good",
    "nicht-besser": "sr-dim",
  }[submit.state] || (submit.state === "sending" ? "sr-dim" : "sr-warn");
  let text;
  switch (submit.state) {
    case "sending": text = "Der Server spielt deinen Lauf nach …"; break;
    case "ok": text = `Bestätigt und eingetragen: Platz ${submit.rank}.`; break;
    case "nicht-besser": text = `Deine Bestzeit von heute (${formatTicks(submit.best.ticks)}) ist schneller — sie bleibt, Platz ${submit.rank}.`; break;
    case "abgelehnt": text = "Der Server konnte diese Zeit nicht bestätigen, sie steht deshalb nicht in der Liste."; break;
    case "kein-key": text = "Zum Eintragen braucht die Seite eine sichere Verbindung (https)."; break;
    default: text = submit.reason || "Das Einsenden hat nicht geklappt.";
  }
  const retry = ["busy", "fehler", "zu-viele"].includes(submit.state);
  return (
    <p className={`text-sm flex flex-wrap items-center gap-x-3 gap-y-1 ${tone}`}>
      {submit.state === "sending" && <Loader2 size={14} className="animate-spin" />}
      {submit.state === "ok" && <Check size={14} />}
      {["abgelehnt", "ungeprueft", "busy", "fehler", "zu-viele", "ungueltig", "kein-key"].includes(submit.state) && <AlertTriangle size={14} />}
      <span>{text}</span>
      {retry && (
        <button type="button" onClick={onRetry} className="underline underline-offset-2 hover:text-white">Erneut senden</button>
      )}
    </p>
  );
}

function Leaderboard({ board, me, ownName }) {
  const entries = board?.today.entries || [];
  // Zwischenzeiten je Checkpoint (vom Server nachgespielt); die schnellste an jedem Checkpoint ist hervorgehoben
  const cps = checkpointSpalten(...entries.map((e) => e.splits));
  const beste = besteJeCheckpoint(entries);
  const yesterday = board?.yesterday.entries[0];
  return (
    <Panel>
      <div className="sr-panel-head">
        <div className="flex items-center gap-2.5">
          <Trophy size={16} className="sr-accent-text" />
          <h2 className="sr-panel-title">Rangliste von heute</h2>
        </div>
        <p className="text-xs sr-faint">
          {board ? `${board.today.total} ${board.today.total === 1 ? "bestätigter Lauf" : "bestätigte Läufe"}` : ""}
        </p>
      </div>

      {entries.length === 0 ? (
        <p className="px-4 py-6 text-sm sr-faint">
          {board ? "Noch keine bestätigte Zeit — die erste gehört dir." : "Lädt …"}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left sr-label">
                <th className="px-4 py-2.5 font-semibold w-14">Platz</th>
                <th className="px-2 py-2.5 font-semibold">Name</th>
                <th className="px-2 py-2.5 font-semibold">Zeit</th>
                <th className="px-2 py-2.5 font-semibold">Tode</th>
                {cps.map((cp) => <th key={cp} className="px-2 py-2.5 font-semibold whitespace-nowrap">CP {cp}</th>)}
              </tr>
            </thead>
            <tbody className="sr-rows">
              {entries.map((e) => {
                const mine = me && me.rank === e.rank && (ownName || me.name) === e.name;
                return (
                  <tr key={e.rank} className={mine ? "bg-white/[0.04]" : ""}>
                    <td className={`px-4 py-2.5 sr-num ${e.rank === 1 ? "sr-accent-text text-base" : "sr-dim"}`}>{e.rank}</td>
                    <td className="px-2 py-2.5 sr-ink whitespace-nowrap">
                      {e.name}
                      {mine && <span className="sr-faint"> (du)</span>}
                    </td>
                    <td className="px-2 py-2.5 sr-num sr-ink whitespace-nowrap">{formatTicks(e.ticks)}</td>
                    <td className="px-2 py-2.5 sr-num sr-dim">{e.deaths}</td>
                    {cps.map((cp) => {
                      const tick = (e.splits || []).find((s) => s[0] === cp)?.[1];
                      const top = tick !== undefined && beste.get(cp)?.tick === tick;
                      return <td key={cp} className={`px-2 py-2.5 sr-num whitespace-nowrap ${top ? "sr-accent-text" : "sr-dim"}`}>{tick === undefined ? "–" : formatTicks(tick)}</td>;
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {cps.length > 0 && <p className="px-4 py-2.5 sr-divider text-xs sr-faint">CP = Zeit am jeweiligen Checkpoint; hervorgehoben die schnellste des Tages.</p>}
      {me && !entries.some((e) => e.rank === me.rank) && (
        <p className="px-4 py-2.5 sr-divider text-sm sr-dim">
          Du: Platz {me.rank} · {formatTicks(me.ticks)} · {me.deaths} {me.deaths === 1 ? "Tod" : "Tode"}
        </p>
      )}
      {yesterday && (
        <p className="px-4 py-2.5 sr-divider text-xs sr-faint">
          Gestern gewann {yesterday.name} mit {formatTicks(yesterday.ticks)}.
        </p>
      )}
    </Panel>
  );
}

/**
 * Wo warst du an jedem Checkpoint? Der Lauf (der letzte oder die eigene Bestzeit) gegen die eigene Bestzeit und gegen die
 * schnellste Zwischenzeit des Tages — mit Namen, wer dort vorn war. Minus = schneller.
 */
function SplitVergleich({ lauf, titel, me, entries, mitBestDu }) {
  const zeilen = splitVergleich(lauf, mitBestDu ? me?.splits : [], entries);
  if (!zeilen.length) return null;
  const ton = (d) => (d === null ? "sr-faint" : d < 0 ? "sr-good" : d > 0 ? "sr-bad" : "sr-dim");
  return (
    <div data-testid="split-vergleich">
      <p className="sr-label mb-1.5">{titel}</p>
      <div className="overflow-x-auto sr-sunk">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left sr-label">
              <th className="px-3 py-2 font-semibold">Checkpoint</th>
              <th className="px-3 py-2 font-semibold">Zeit</th>
              {mitBestDu && <th className="px-3 py-2 font-semibold">zu deiner Bestzeit</th>}
              <th className="px-3 py-2 font-semibold">zur Tagesbesten</th>
              <th className="px-3 py-2 font-semibold">Tagesbeste dort</th>
            </tr>
          </thead>
          <tbody className="sr-rows">
            {zeilen.map((z) => (
              <tr key={z.cp}>
                <td className="px-3 py-1.5 sr-num sr-dim">CP {z.cp}</td>
                <td className="px-3 py-1.5 sr-num sr-ink">{formatTicks(z.du)}</td>
                {mitBestDu && <td className={`px-3 py-1.5 sr-num ${ton(z.zuBestDu)}`}>{formatDelta(z.zuBestDu)}</td>}
                <td className={`px-3 py-1.5 sr-num ${ton(z.zuTagesBest)}`}>{formatDelta(z.zuTagesBest)}</td>
                <td className="px-3 py-1.5 sr-dim whitespace-nowrap">
                  {z.tagesBest ? <><span className="sr-num">{formatTicks(z.tagesBest.tick)}</span> <span className="sr-faint">· {z.tagesBest.name}</span></> : "–"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function SeedRunnersDaily() {
  const [board, setBoard] = useState(null);
  const [boardError, setBoardError] = useState("");
  const [key, setKey] = useState(undefined);            // undefined = wird berechnet, null = nicht möglich
  const [name, setName] = useState(() => getIdentity().name);
  const [attempt, setAttempt] = useState(1);
  const [phase, setPhase] = useState("idle");           // idle | countdown | racing | finished
  const [startAt, setStartAt] = useState(null);
  const [run, setRun] = useState(null);                 // Ergebnis des letzten Laufs { ticks, deaths, log, fp, … }
  const [submit, setSubmit] = useState(null);
  const [error, setError] = useState("");
  const startTimer = useRef(null);

  const loadBoard = useCallback(async (playerKey) => {
    try {
      const b = await getDailyBoard(playerKey);
      setBoard(b);
      setBoardError("");
      // Ein Pfad-Tagesrennen braucht einige Sekunden: schon beim Öffnen der Seite im Hintergrund bauen (Phase D)
      vorerzeugen(b?.today?.params);
    } catch (e) {
      setBoardError(e.message || "Rangliste nicht erreichbar.");
    }
  }, []);

  useEffect(() => {
    let alive = true;
    getDailyKey().then((k) => {
      if (!alive) return;
      setKey(k);
      loadBoard(k);
    });
    return () => { alive = false; clearTimeout(startTimer.current); };
  }, [loadBoard]);

  const send = useCallback(async (finished, playerName) => {
    if (!key) {
      setSubmit({ state: "kein-key" });
      return;
    }
    setSubmit({ state: "sending" });
    const res = await submitDailyRun({
      dateKey: board.today.dateKey, playerKey: key, name: playerName, ticks: finished.ticks, deaths: finished.deaths, log: finished.log, fp: finished.fp,
    });
    setSubmit({ state: res.status, ...res });
    if (res.status === "ok" || res.status === "nicht-besser") loadBoard(key);
  }, [key, board, loadBoard]);

  const startRun = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Bitte gib zuerst deinen Namen ein — er steht in der Rangliste.");
      return;
    }
    setError("");
    saveIdentity({ ...getIdentity(), name: trimmed });
    // Erster Start: die Welt steht schon auf Tick 0. Jeder weitere ist ein neuer Versuch mit frischer Welt.
    if (phase !== "idle") setAttempt((a) => a + 1);
    setRun(null);
    setSubmit(null);
    setStartAt(Date.now() + COUNTDOWN_MS);
    setPhase("countdown");
    clearTimeout(startTimer.current);
    startTimer.current = setTimeout(() => setPhase((p) => (p === "countdown" ? "racing" : p)), COUNTDOWN_MS);
  };

  const handleFinish = useCallback((finished) => {
    setRun(finished);
    setPhase("finished");
    send(finished, name.trim());
  }, [send, name]);

  const running = phase === "countdown" || phase === "racing";
  const dailyRef = refForParams(board?.today?.params);

  // Das gebaute Level (für Leitidee/Autor im Favoriten) — erst nach dem ersten Lauf nötig, dann steht es im Cache
  const [builtLevel, setBuiltLevel] = useState(null);
  useEffect(() => {
    if (phase !== "finished" || builtLevel) return;
    pfadLevel(board?.today?.params)?.then(setBuiltLevel, () => {});
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="w-full max-w-[1160px] mx-auto px-4 py-8 md:py-10">
      <SEO
        title="Seed Runners: Tagesrennen"
        description="Das Tagesrennen von Seed Runners: jeden Tag ein festes Level für alle. Die beste bestätigte Zeit kommt in die Rangliste."
        path="/seed-runners/daily"
        keywords="Seed Runners, Tagesrennen, Daily Speedrun, Rangliste"
      />

      <div className="mb-6">
        <p className="sr-label mb-2">
          Tagesrennen{board ? ` · ${germanDate(board.today.dateKey)}` : ""}
        </p>
        <h1 className="sr-display text-3xl md:text-5xl mb-3">Das Level von heute</h1>
        <p className="sr-dim text-sm max-w-2xl leading-relaxed">
          Jeden Tag ein festes Level, für alle gleich. Du spielst allein, so oft du willst, und deine beste Zeit zählt.
          Der Server spielt jeden Lauf aus deinen Eingaben nach — nur bestätigte Zeiten kommen in die Rangliste.
        </p>
      </div>

      {boardError && !board && (
        <Panel className="px-5 py-4 mb-5">
          <p className="text-sm sr-bad mb-3">{boardError}</p>
          <button type="button" onClick={() => loadBoard(key)} className="sr-btn sr-btn-sm sr-btn-ghost">Erneut versuchen</button>
        </Panel>
      )}

      {!board && !boardError && (
        <p className="flex items-center gap-2 text-sm sr-dim py-10"><Loader2 size={16} className="animate-spin sr-accent-text" /> Lade das Level von heute …</p>
      )}

      {board && (
        <div className="space-y-4">
          <Panel className="px-4 py-3 flex flex-wrap items-end gap-x-6 gap-y-3">
            {phase === "idle" || phase === "finished" ? (
              <>
                <label className="block flex-1 min-w-[12rem]">
                  <span className="sr-label block mb-1.5">Dein Name in der Rangliste</span>
                  <input
                    id="daily-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={24}
                    placeholder="Name eingeben"
                    className="sr-input"
                  />
                </label>
                <button type="button" onClick={startRun} className="sr-btn sr-btn-lg">
                  {phase === "finished" ? <RotateCcw size={16} /> : <Play size={16} fill="currentColor" />}
                  {phase === "finished" ? "Nochmal versuchen" : "Rennen starten"}
                </button>
              </>
            ) : (
              <>
                <p className="text-sm sr-dim flex-1">
                  {phase === "countdown" ? "Gleich geht's los …" : "Das Rennen läuft. R bringt dich zum letzten Checkpoint zurück, die Zeit läuft weiter."}
                </p>
                <button type="button" onClick={startRun} className="sr-btn sr-btn-sm sr-btn-ghost">
                  <RotateCcw size={13} />
                  Neu starten
                </button>
              </>
            )}
            {error && <p className="basis-full text-sm sr-bad">{error}</p>}
          </Panel>

          {phase === "finished" && run && (
            <Panel className="px-4 py-3 space-y-3">
              <div className="space-y-1.5">
                <p className="sr-ink">
                  <span className="sr-label mr-2">Zeit</span><span className="sr-num text-2xl">{formatTicks(run.ticks)}</span>
                  <span className="sr-faint"> · {run.deaths} {run.deaths === 1 ? "Tod" : "Tode"}</span>
                </p>
                <SubmitNote submit={submit} onRetry={() => send(run, name.trim())} />
              </div>
              <SplitVergleich lauf={run.splits} titel="Deine Zwischenzeiten" me={board.me} entries={board.today.entries} mitBestDu={!!board.me} />
              {dailyRef && <RateBox levelRef={dailyRef} level={builtLevel} title="Wie war das Level von heute?" />}
            </Panel>
          )}

          <RaceView
            params={board.today.params}
            roundNumber={attempt}
            phase={running ? phase : "loading"}
            startAt={startAt}
            clock={OWN_CLOCK}
            epoch={1}
            frozen={false}
            meState={running ? "racing" : phase === "finished" ? "finished" : "ready"}
            finishNote={!submit || submit.state === "sending" ? "Im Ziel — der Server prüft deinen Lauf" : "Im Ziel"}
            waitNote="Bereit — starte das Rennen mit dem Knopf oben"
            onReady={noop}
            onCheckpoint={noop}
            onFinish={handleFinish}
          />

          <Leaderboard board={board} me={board.me} ownName={name.trim()} />
          {!(phase === "finished" && run) && board.me?.splits?.length > 0 && (
            <Panel className="px-4 py-3">
              <SplitVergleich lauf={board.me.splits} titel="Deine Bestzeit von heute an den Checkpoints" me={board.me} entries={board.today.entries} mitBestDu={false} />
            </Panel>
          )}
        </div>
      )}
    </div>
  );
}
