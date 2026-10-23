// SeedRunnersDaily.jsx — das Tagesrennen: Jeden Tag ein festes Level für alle, allein gespielt, so oft man will.
// Die beste Zeit des Tages zählt. Sie kommt erst in die Rangliste, wenn der Server den Lauf aus dem Input-Log
// nachgespielt und dieselbe Zeit herausbekommen hat (Backend: seedRunners/replay.js, daily.js).
//
// Der Lauf selbst ist der aus den Räumen (RaceView): gleiche Sim, gleiches Rendering, nur ohne Server-Countdown —
// der Start liegt ein paar Sekunden nach dem Klick auf die eigene Uhr.
//
// Archiv (27.09.2026): Unter /seed-runners/daily/JJJJ-MM-TT läuft ein vergangener Tag (ui/tagesArchiv.js) — dasselbe Level,
// die feste Rangliste des Tages, aber nichts wird eingereicht: Die Zeit ist nur für einen selbst.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Play, RotateCcw, Trophy, Loader2, Check, AlertTriangle, History, ArrowLeft, Film, Share2 } from "lucide-react";
import SEO from "../../components/SEO";
import RaceView from "./room/RaceView.jsx";
import { getIdentity, saveIdentity, getDailyKey } from "./room/identity.js";
import { getDailyBoard, getDailyBoardOf, submitDailyRun, getDailyTopReplay } from "./room/dailyApi.js";
import ReplayScrubber from "./levels/ReplayScrubber.jsx";
import { formatTicks, formatDelta } from "./room/format.js";
import { checkpointSpalten, besteJeCheckpoint, splitVergleich } from "./room/splits.js";
import { vorerzeugen, pfadLevel } from "./client/generateWorldAsync.js";
import RateBox from "./ui/RateBox.jsx";
import { refForParams } from "./ui/levelRef.js";
import { isArchivTag, germanDate, ARCHIV_AB } from "./ui/tagesArchiv.js";
import { useBoundAction } from "./client/useBoundAction.js";
import { boundLabel } from "./client/input.js";
import { tagesrennenText } from "./room/shareText.js";
import { copyText } from "./levels/clipboard.js";

const COUNTDOWN_MS = 3300;
// Solo gibt es keinen Uhrenabgleich: Die Startzeit ist schon die eigene Zeit.
const OWN_CLOCK = { toLocal: (t) => t };
const noop = () => {};

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

function Leaderboard({ board, me, ownName, archiv }) {
  const entries = board?.today.entries || [];
  // Zwischenzeiten je Checkpoint (vom Server nachgespielt); die schnellste an jedem Checkpoint ist hervorgehoben
  const cps = checkpointSpalten(...entries.map((e) => e.splits));
  const beste = besteJeCheckpoint(entries);
  const yesterday = board?.yesterday?.entries[0];
  return (
    <Panel>
      <div className="sr-panel-head">
        <div className="flex items-center gap-2.5">
          <Trophy size={16} className="sr-accent-text" />
          <h2 className="sr-panel-title">{archiv ? `Rangliste vom ${germanDate(archiv)}` : "Rangliste von heute"}</h2>
        </div>
        <p className="text-xs sr-faint">
          {board ? `${board.today.total} ${board.today.total === 1 ? "bestätigter Lauf" : "bestätigte Läufe"}` : ""}
        </p>
      </div>

      {entries.length === 0 ? (
        <p className="px-4 py-6 text-sm sr-faint">
          {!board ? "Lädt …" : archiv ? "An diesem Tag hat niemand eine bestätigte Zeit eingetragen." : "Noch keine bestätigte Zeit — die erste gehört dir."}
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

      {cps.length > 0 && <p className="px-4 py-2.5 sr-divider text-xs sr-faint">CP = Zeit am jeweiligen Checkpoint; hervorgehoben die schnellste des Tages.{archiv ? " Die Rangliste ist abgeschlossen." : ""}</p>}
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

/**
 * Ergebnis teilen wie bei Wordle: Zeit, Platz und ein Quadrat je Abschnitt. Geteilt wird die eigene Bestzeit des Tages
 * (aus der Rangliste); ohne bestätigte Zeit (Archiv, abgelehnt) der letzte Lauf ohne Platz. Am Handy über das
 * Teilen-Menü des Systems, sonst in die Zwischenablage.
 */
function ShareResult({ board, run, archiv }) {
  const [done, setDone] = useState(null);
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  const best = !archiv && board.me ? board.me : null;
  const url = `${window.location.origin}${archiv ? `/seed-runners/daily/${archiv}` : "/seed-runners/daily"}`;
  const text = tagesrennenText({
    dateKey: board.today.dateKey,
    lauf: best || run,
    rank: best?.rank ?? null,
    total: board.today.total,
    entries: board.today.entries,
    url,
    archiv: !!archiv,
  });

  const share = async () => {
    const mobil = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
    if (mobil && navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch (e) {
        if (e?.name === "AbortError") return;           // selbst abgebrochen
      }
    }
    const ok = await copyText(text);
    setDone(ok ? "ok" : "fehler");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setDone(null), 2500);
  };

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <button type="button" onClick={share} className="sr-btn sr-btn-sm sr-btn-ghost" data-testid="daily-share">
        {done === "ok" ? <Check size={14} /> : <Share2 size={14} />}
        {done === "ok" ? "Kopiert" : best ? "Bestzeit teilen" : "Ergebnis teilen"}
      </button>
      {done === "fehler" && (
        <pre className="basis-full text-xs sr-dim whitespace-pre-wrap select-all sr-sunk px-3 py-2">{text}</pre>
      )}
    </div>
  );
}

// Ein eigener Zustand je Tag: Beim Wechsel zwischen heute und einem Archiv-Tag (dieselbe Komponente) fängt alles frisch an
export default function SeedRunnersDaily() {
  const { dateKey } = useParams();
  return <DailyPage key={dateKey || "heute"} tagParam={dateKey} />;
}

function DailyPage({ tagParam }) {
  // Archiv-Modus: ein vergangener Tag; ein ungültiges Datum (Zukunft, heute, vor dem Archiv) zeigt einen Hinweis
  const archiv = tagParam && isArchivTag(tagParam) ? tagParam : null;
  const falscherTag = !!tagParam && !archiv;
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
  const [replayOffen, setReplayOffen] = useState(false);
  const startTimer = useRef(null);
  const feldRef = useRef(null);
  // Beim Start das ganze Spielfeld ins Bild holen: Nach einem Lauf stehen Zeit und Checkpoint-Übersicht darüber und
  // schieben es nach unten — sonst war es oben oder unten abgeschnitten
  useEffect(() => {
    if (phase === "countdown") feldRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [phase, attempt]);

  const loadBoard = useCallback(async (playerKey) => {
    try {
      let b;
      if (archiv) {
        const res = await getDailyBoardOf(archiv, playerKey);
        b = { today: res.board, yesterday: null, me: res.me || null };
      } else {
        b = await getDailyBoard(playerKey);
      }
      setBoard(b);
      setBoardError("");
      // Ein Pfad-Tagesrennen braucht einige Sekunden: schon beim Öffnen der Seite im Hintergrund bauen (Phase D)
      vorerzeugen(b?.today?.params);
    } catch (e) {
      setBoardError(e.message || "Rangliste nicht erreichbar.");
    }
  }, [archiv]);

  useEffect(() => {
    if (falscherTag) return undefined;
    let alive = true;
    getDailyKey().then((k) => {
      if (!alive) return;
      setKey(k);
      loadBoard(k);
    });
    return () => { alive = false; clearTimeout(startTimer.current); };
  }, [loadBoard, falscherTag]);

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
    if (!trimmed && !archiv) {
      setError("Bitte gib zuerst deinen Namen ein — er steht in der Rangliste.");
      return;
    }
    setError("");
    if (trimmed) saveIdentity({ ...getIdentity(), name: trimmed });
    // Erster Start: die Welt steht schon auf Tick 0. Jeder weitere ist ein neuer Versuch mit frischer Welt.
    if (phase !== "idle") setAttempt((a) => a + 1);
    setRun(null);
    setSubmit(null);
    setStartAt(Date.now() + COUNTDOWN_MS);
    setPhase("countdown");
    clearTimeout(startTimer.current);
    startTimer.current = setTimeout(() => setPhase((p) => (p === "countdown" ? "racing" : p)), COUNTDOWN_MS);
  };

  // Neu starten per Taste (Standard N, umbelegbar unter „Steuerung“) — während des Laufs und danach, nicht vor dem ersten Start
  useBoundAction("neustart", (e) => { e.preventDefault(); startRun(); }, board !== null && phase !== "idle");

  const handleFinish = useCallback((finished) => {
    setRun(finished);
    setPhase("finished");
    if (!archiv) send(finished, name.trim());                  // im Archiv zählt die Zeit nur für einen selbst
  }, [send, name, archiv]);

  const running = phase === "countdown" || phase === "racing";
  const dailyRef = refForParams(board?.today?.params);

  // Das gebaute Level (für Leitidee/Autor im Favoriten) — erst nach dem ersten Lauf nötig, dann steht es im Cache
  const [builtLevel, setBuiltLevel] = useState(null);
  useEffect(() => {
    if (phase !== "finished" || builtLevel) return;
    pfadLevel(board?.today?.params)?.then(setBuiltLevel, () => {});
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  if (falscherTag) {
    return (
      <div className="w-full max-w-[1160px] mx-auto px-4 py-8 md:py-10">
        <p className="sr-label mb-2">Tagesrennen-Archiv</p>
        <h1 className="sr-display text-3xl md:text-5xl mb-3">Diesen Tag gibt es nicht im Archiv</h1>
        <p className="sr-dim text-sm max-w-2xl leading-relaxed mb-5">
          Im Archiv stehen alle vergangenen Tagesrennen seit dem {germanDate(ARCHIV_AB)}. Das heutige Level spielst du im Tagesrennen.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link to="/seed-runners/verlauf?tab=archiv" className="sr-btn sr-btn-ghost"><History size={15} />Zum Archiv</Link>
          <Link to="/seed-runners/daily" className="sr-btn">Zum Tagesrennen</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1160px] mx-auto px-4 py-8 md:py-10">
      <SEO
        title={archiv ? `Seed Runners: Tagesrennen vom ${germanDate(archiv)}` : "Seed Runners: Tagesrennen"}
        description="Das Tagesrennen von Seed Runners: jeden Tag ein festes Level für alle. Die beste bestätigte Zeit kommt in die Rangliste."
        path={archiv ? `/seed-runners/daily/${archiv}` : "/seed-runners/daily"}
        keywords="Seed Runners, Tagesrennen, Daily Speedrun, Rangliste"
        noindex={!!archiv}
      />

      <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="sr-label mb-2">
            {archiv ? "Tagesrennen-Archiv" : "Tagesrennen"}{board ? ` · ${germanDate(board.today.dateKey)}` : ""}
          </p>
          <h1 className="sr-display text-3xl md:text-5xl mb-3">{archiv ? `Das Level vom ${germanDate(archiv)}` : "Das Level von heute"}</h1>
          <p className="sr-dim text-sm max-w-2xl leading-relaxed">
            {archiv
              ? "Ein vergangenes Tagesrennen, genau dasselbe Level wie an dem Tag. Spiel es so oft du willst — die Rangliste des Tages ist abgeschlossen, deine Zeit hier zählt nur für dich."
              : "Jeden Tag ein festes Level, für alle gleich. Du spielst allein, so oft du willst, und deine beste Zeit zählt. Der Server spielt jeden Lauf aus deinen Eingaben nach — nur bestätigte Zeiten kommen in die Rangliste."}
          </p>
        </div>
        <Link to="/seed-runners/verlauf?tab=archiv" className="sr-btn sr-btn-sm sr-btn-ghost shrink-0">
          {archiv ? <ArrowLeft size={14} /> : <History size={14} />}
          {archiv ? "Zum Archiv" : "Vergangene Tage"}
        </Link>
      </div>

      {boardError && !board && (
        <Panel className="px-5 py-4 mb-5">
          <p className="text-sm sr-bad mb-3">{boardError}</p>
          <button type="button" onClick={() => loadBoard(key)} className="sr-btn sr-btn-sm sr-btn-ghost">Erneut versuchen</button>
        </Panel>
      )}

      {!board && !boardError && (
        <p className="flex items-center gap-2 text-sm sr-dim py-10"><Loader2 size={16} className="animate-spin sr-accent-text" /> {archiv ? "Lade das Level …" : "Lade das Level von heute …"}</p>
      )}

      {board && (
        <div className="space-y-4">
          <Panel className="px-4 py-3 flex flex-wrap items-end gap-x-6 gap-y-3">
            {phase === "idle" || phase === "finished" ? (
              <>
                {archiv ? (
                  <p className="text-sm sr-dim flex-1 min-w-[12rem]">Archiv-Lauf: Die Zeit wird nicht eingereicht.</p>
                ) : (
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
                )}
                <button type="button" onClick={startRun} className="sr-btn sr-btn-lg">
                  {phase === "finished" ? <RotateCcw size={16} /> : <Play size={16} fill="currentColor" />}
                  {phase === "finished" ? "Nochmal versuchen" : "Rennen starten"}
                  {phase === "finished" && <span className="sr-kbd">{boundLabel("neustart")}</span>}
                </button>
              </>
            ) : (
              <>
                <p className="text-sm sr-dim flex-1">
                  {phase === "countdown" ? "Gleich geht's los …" : `Das Rennen läuft. ${boundLabel("restart")} bringt dich zum letzten Checkpoint zurück, die Zeit läuft weiter.`}
                </p>
                <button type="button" onClick={startRun} className="sr-btn sr-btn-sm sr-btn-ghost">
                  <RotateCcw size={13} />
                  Neu starten <span className="sr-kbd">{boundLabel("neustart")}</span>
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
                {archiv
                  ? <p className="text-sm sr-dim">Im Archiv zählt die Zeit nur für dich — die Rangliste des Tages bleibt, wie sie war.</p>
                  : <SubmitNote submit={submit} onRetry={() => send(run, name.trim())} />}
              </div>
              <SplitVergleich lauf={run.splits} titel="Deine Zwischenzeiten" me={board.me} entries={board.today.entries} mitBestDu={!!board.me} />
              {(archiv || (submit && submit.state !== "sending")) && <ShareResult board={board} run={run} archiv={archiv} />}
              {dailyRef && <RateBox levelRef={dailyRef} level={builtLevel} title={archiv ? "Wie war das Level?" : "Wie war das Level von heute?"} />}
            </Panel>
          )}

          <div ref={feldRef} className="scroll-mt-4">
          <RaceView
            params={board.today.params}
            roundNumber={attempt}
            phase={running ? phase : "loading"}
            startAt={startAt}
            clock={OWN_CLOCK}
            epoch={1}
            frozen={false}
            meState={running ? "racing" : phase === "finished" ? "finished" : "ready"}
            finishNote={archiv ? "Im Ziel" : !submit || submit.state === "sending" ? "Im Ziel — der Server prüft deinen Lauf" : "Im Ziel"}
            waitNote="Bereit — starte das Rennen mit dem Knopf oben"
            onReady={noop}
            onCheckpoint={noop}
            onFinish={handleFinish}
            vollbild
            hudActions={(
              <button type="button" onClick={startRun} className="sr-btn sr-btn-sm sr-btn-ghost">
                <RotateCcw size={13} />
                <span className="hidden md:inline">Neu starten</span> <span className="sr-kbd">{boundLabel("neustart")}</span>
              </button>
            )}
          />
          </div>

          {board.today.entries.length > 0 && !running && (
            replayOffen ? (
              <Panel className="px-4 py-3">
                <ReplayScrubber
                  name={`Platz 1 · ${board.today.entries[0].name}`}
                  // Lauf vom Server, Level wie beim Spielen (gleiche Parameter samt Generator-Version, im Worker gebaut)
                  load={async () => {
                    const r = await getDailyTopReplay(board.today.dateKey);
                    return r ? { level: await pfadLevel(r.params), log: r.log, ticks: r.ticks } : null;
                  }}
                  onClose={() => setReplayOffen(false)}
                />
              </Panel>
            ) : (
              <button type="button" onClick={() => setReplayOffen(true)} className="sr-btn sr-btn-sm sr-btn-ghost">
                <Film size={14} />
                Replay von Platz 1 ansehen ({board.today.entries[0].name})
              </button>
            )
          )}
          <Leaderboard board={board} me={board.me} ownName={name.trim()} archiv={archiv} />
        </div>
      )}
    </div>
  );
}
