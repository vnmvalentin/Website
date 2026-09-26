// LevelPlay.jsx — ein veröffentlichtes Level spielen. Derselbe Lauf wie im Rennen und im Editor (RaceView), allein und ohne Server-Countdown.
// Beim Ziel geht das Input-Log an den Server; er spielt es nach und trägt die Zeit erst dann in die Bestenliste ein.
//
// mode "submit"    ein Lauf für die Bestenliste
// mode "reverify"  der Ersteller spielt sein Level nach einer Physik-Änderung neu durch; danach ist es wieder sichtbar
//
// Geister (`ghosts`) laufen in eigenen Welten mit — reine Orientierung, sie berühren den Lauf nicht. Das Array muss stabil bleiben
// (State der Seite), sonst würde RaceView bei jedem Rendern neu starten.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, RotateCcw, Loader2, Check, AlertTriangle, Trophy } from "lucide-react";
import RaceView from "../room/RaceView.jsx";
import { beginAttempt, submitRun, reverifyOwnLevel } from "./levelsApi.js";
import { formatTicks } from "../room/format.js";
import { buttonClass, primaryButtonClass } from "../editor/fields.jsx";

const COUNTDOWN_MS = 3300;
const OWN_CLOCK = { toLocal: (t) => t };
const noop = () => {};
const RETRY = new Set(["busy", "fehler", "zu-viele"]);

function Note({ tone, icon: Icon, spin, children }) {
  const colors = { info: "text-white/70", ok: "text-green-300", warn: "text-amber-300" };
  return (
    <p className={`text-sm flex items-start gap-2.5 ${colors[tone]}`} role="status">
      <Icon size={15} className={`mt-0.5 shrink-0 ${spin ? "animate-spin" : ""}`} />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

function ResultNote({ res, mode }) {
  if (res.state === "sending") return <Note tone="info" icon={Loader2} spin>Der Server spielt deinen Lauf nach ({formatTicks(res.fin.ticks)}) …</Note>;
  if (res.status === "ok" && mode === "reverify") {
    return <Note tone="ok" icon={Check}>Neu verifiziert: Ersteller-Zeit {formatTicks(res.ticks)}. Dein Level ist wieder für alle sichtbar.</Note>;
  }
  if (res.status === "ok") {
    return (
      <Note tone="ok" icon={Check}>
        {res.improved === false
          ? <>Bestätigt. Deine Bestzeit von {formatTicks(res.ticks)} ist schneller — sie bleibt (Platz {res.rank}).</>
          : <>Bestätigt und eingetragen: <strong className="text-white">Platz {res.rank}</strong> mit {formatTicks(res.ticks)}.</>}
      </Note>
    );
  }
  if (res.status === "nicht-besser") {
    return <Note tone="info" icon={Trophy}>Deine Bestzeit von {formatTicks(res.ticks)} ist schneller — sie bleibt (Platz {res.rank}).</Note>;
  }
  if (res.status === "abgelehnt") return <Note tone="warn" icon={AlertTriangle}>Der Server konnte diese Zeit nicht bestätigen, sie steht deshalb nicht in der Liste. {res.reason}</Note>;
  return <Note tone="warn" icon={AlertTriangle}>{res.reason || "Das Einsenden hat nicht geklappt."}</Note>;
}

/** Ein Versuch. Die Szene mountet ihn je Runde neu (key), damit Einsende-Zustand und Zielmeldung sauber zurückgesetzt sind. */
function Attempt({ code, level, ghosts, mode, name, canImprove, round, startAt, onExit, onRestart, onSubmitted }) {
  const [res, setRes] = useState(null);
  const [improve, setImprove] = useState(null);
  const finished = useRef(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  // Ein Versuch beginnt: zählt Spiele und erlaubt danach das Bewerten. Nur Statistik — Fehler bleiben still.
  useEffect(() => { beginAttempt(code); }, [code, round]);

  const send = useCallback(async (fin) => {
    setRes({ state: "sending", fin });
    const answer = mode === "reverify" ? await reverifyOwnLevel(code, fin) : await submitRun(code, { ...fin, name });
    if (answer.status === "ok" || answer.status === "nicht-besser") onSubmitted?.(answer);
    if (mounted.current) setRes({ state: "done", fin, ...answer });
  }, [code, mode, name, onSubmitted]);

  const handleFinish = useCallback((fin) => {
    if (finished.current) return;
    finished.current = fin;
    send(fin);
  }, [send]);

  const improveCreator = async () => {
    setImprove({ state: "sending" });
    const answer = await reverifyOwnLevel(code, finished.current);
    if (answer.status === "ok") onSubmitted?.(answer);
    if (mounted.current) setImprove({ state: "done", ...answer });
  };

  const settled = res && res.state === "done";
  const beatsCreator = canImprove && settled && res.fin.ticks < canImprove.ticks;

  return (
    <div className="p-3 space-y-3">
      {/* Das Ergebnis steht ÜBER dem Spielfeld: Darunter läge es nach dem Ziel außerhalb des sichtbaren Bereichs */}
      {res && (
        <div className="space-y-2.5 border border-white/10 rounded-md px-4 py-3" data-testid="attempt-result">
          <ResultNote res={res} mode={mode} />
          {settled && RETRY.has(res.status) && (
            <button type="button" onClick={() => send(res.fin)} className={buttonClass}>Erneut senden</button>
          )}
          {settled && res.status === "ungeprueft" && (
            <button type="button" onClick={() => window.location.reload()} className={buttonClass}>Seite neu laden</button>
          )}
          {beatsCreator && !improve && (
            <p className="text-sm text-white/70">
              Du warst schneller als deine Ersteller-Zeit ({formatTicks(canImprove.ticks)}).{" "}
              <button type="button" onClick={improveCreator} className="text-violet-200 hover:text-white underline underline-offset-2">Als neue Ersteller-Zeit übernehmen</button>
            </p>
          )}
          {improve?.state === "sending" && <Note tone="info" icon={Loader2} spin>Der Server prüft deinen Lauf …</Note>}
          {improve?.state === "done" && (
            improve.status === "ok"
              ? <Note tone="ok" icon={Check}>Ersteller-Zeit aktualisiert: {formatTicks(improve.ticks)}.</Note>
              : <Note tone="warn" icon={AlertTriangle}>{improve.reason || "Das hat nicht geklappt."}</Note>
          )}
          {settled && (
            <div className="flex flex-wrap gap-2 pt-1">
              <button type="button" onClick={onRestart} className={primaryButtonClass}><RotateCcw size={14} />Nochmal spielen (N)</button>
              <button type="button" onClick={onExit} className={buttonClass}><ArrowLeft size={14} />Zurück zum Level (Esc)</button>
            </div>
          )}
        </div>
      )}
      <RaceView
        level={level}
        ghosts={ghosts}
        roundNumber={round}
        phase="countdown"
        startAt={startAt}
        clock={OWN_CLOCK}
        epoch={1}
        finishNote={res ? (settled ? "Im Ziel" : "Im Ziel — der Server prüft deinen Lauf …") : "Im Ziel"}
        onReady={noop}
        onFinish={handleFinish}
      />
    </div>
  );
}

/**
 * @param level       Engine-Level (validateDoc(...).level)
 * @param ghosts      [{ log, ticks, name, color }] oder undefined
 * @param name        Anzeigename für die Bestenliste (nur für Gäste maßgeblich; Angemeldete tragen ihr Twitch-Konto)
 * @param canImprove  { ticks } bei eigenem Level: schnellere Läufe lassen sich als Ersteller-Zeit übernehmen
 * @param onExit      zurück zur Detailseite
 * @param onSubmitted Callback nach bestätigtem Lauf (die Seite lädt Bestenliste und Likes neu)
 */
export default function LevelPlay({ code, level, ghosts, mode = "submit", name, canImprove, onExit, onSubmitted }) {
  const [round, setRound] = useState(1);
  const [startAt, setStartAt] = useState(() => Date.now() + COUNTDOWN_MS);
  const restart = useCallback(() => { setRound((r) => r + 1); setStartAt(Date.now() + COUNTDOWN_MS); }, []);

  // Esc zurück, N neu — dieselben Tasten wie im Testspiel des Editors
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "Escape") onExit();
      else if (e.key.toLowerCase() === "n") restart();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onExit, restart]);

  return (
    <div className="bg-[#0d0d14] border border-white/10 rounded-md" data-testid="level-play">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-white/10">
        <button type="button" onClick={onExit} className={buttonClass}><ArrowLeft size={14} />Zurück zum Level (Esc)</button>
        <button type="button" onClick={restart} className={buttonClass}><RotateCcw size={14} />Neu starten (N)</button>
        <span className="text-xs text-white/40 ml-auto">
          {mode === "reverify" ? "Neu-Verifizierung deines Levels" : ghosts?.length ? `${ghosts.length} ${ghosts.length === 1 ? "Geist läuft" : "Geister laufen"} mit` : "Lauf für die Bestenliste"}
        </span>
      </div>
      <Attempt
        key={round}
        code={code}
        level={level}
        ghosts={ghosts}
        mode={mode}
        name={name}
        canImprove={canImprove}
        round={round}
        startAt={startAt}
        onExit={onExit}
        onRestart={restart}
        onSubmitted={onSubmitted}
      />
    </div>
  );
}
