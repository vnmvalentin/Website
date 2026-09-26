// VerifyRun.jsx — der Verifizierungslauf: Das Level wird vom Start bis ins Ziel durchgespielt, der Server spielt das
// Input-Log nach und bestätigt die Zeit. Erst ein verifiziertes Level darf veröffentlicht werden (der Beweis, dass es
// schaffbar ist).
//
// Das Level ist GESPERRT: Gespielt wird die Momentaufnahme, mit der der Lauf gestartet wurde (`run.level`); der Editor
// bleibt im Hintergrund unangetastet. Kein Start ab Zeiger, kein Sprung — nur der Lauf vom Start, mit der Uhr des Rennens.
//
// Ablauf: spielen → (Ziel) → "Verifizierung läuft" → Szene "Verifiziert" mit Ersteller-Zeit  |  Fehlermeldung mit Grund.
// Ein Lauf, der langsamer ist als eine frühere Verifizierung, ändert die offizielle Zeit nicht (der Server sagt es).
import React, { useEffect, useRef, useState } from "react";
import { ArrowLeft, RotateCcw, Loader2, Check, AlertTriangle } from "lucide-react";
import RaceView from "../room/RaceView.jsx";
import { verifyLevel } from "../room/levelApi.js";
import { formatTicks } from "../room/format.js";
import { buttonClass, primaryButtonClass } from "./fields.jsx";

const OWN_CLOCK = { toLocal: (t) => t };
const noop = () => {};

// Was der Spieler bei welchem Ergebnis des Servers liest. Die Fehler sind fast alle "nicht deine Schuld": Ein ehrlicher
// Lauf wird nur abgelehnt, wenn Seite und Server verschiedene Stände haben oder etwas kaputt ist.
const RETRYABLE = new Set(["busy", "fehler", "zu-viele"]);
const TITLES = {
  abgelehnt: "Der Server konnte deinen Lauf nicht bestätigen",
  ungeprueft: "Seite und Server sind nicht auf demselben Stand",
  ungueltig: "Das Level ist ungültig",
  anmeldung: "Du bist nicht mehr angemeldet",
  busy: "Der Server ist gerade ausgelastet",
  "zu-viele": "Zu viele Verifizierungen",
  fehler: "Die Prüfung ist fehlgeschlagen",
};

function Banner({ tone, icon: Icon, children }) {
  const colors = { info: "border-violet-400/30 bg-violet-500/8 text-white/80", busy: "border-violet-400/40 bg-violet-500/12 text-white", error: "border-red-400/30 bg-red-500/8 text-white/85" };
  return (
    <div className={`mx-3 mt-3 border rounded-md px-4 py-3 text-sm leading-relaxed flex items-start gap-3 ${colors[tone]}`} role="status">
      <Icon size={16} className={`shrink-0 mt-0.5 ${tone === "busy" ? "animate-spin text-violet-300" : tone === "error" ? "text-red-300" : "text-violet-300"}`} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Die Szene nach bestätigter Verifizierung */
function VerifiedScene({ result, played, onBack, onAgain }) {
  // Langsamer als die bisherige Bestzeit: Die offizielle Zeit bleibt die alte
  const slower = result.ticks < played;
  return (
    <div className="page-fade px-4 py-10 md:py-14 flex flex-col items-center text-center" data-testid="verified-scene">
      <span className="w-14 h-14 flex items-center justify-center rounded-md bg-green-500/10 border border-green-400/30 text-green-300 mb-5">
        <Check size={28} />
      </span>
      <p className="text-xs font-bold uppercase tracking-widest text-green-300/80 mb-2">Verifiziert</p>
      <h2 className="font-display text-2xl md:text-3xl font-bold text-white mb-6">Dein Level ist schaffbar</h2>

      <div className="grid grid-cols-2 divide-x divide-white/10 border border-white/10 rounded-md mb-5 w-full max-w-sm">
        <div className="px-5 py-3">
          <p className="text-[11px] uppercase tracking-wider text-white/35 mb-1">Ersteller-Zeit</p>
          <p className="text-2xl text-white tabular-nums font-display font-bold" data-testid="creator-time">{formatTicks(result.ticks)}</p>
        </div>
        <div className="px-5 py-3">
          <p className="text-[11px] uppercase tracking-wider text-white/35 mb-1">Tode</p>
          <p className="text-2xl text-white tabular-nums font-display font-bold">{result.deaths}</p>
        </div>
      </div>

      {slower && (
        <p className="text-sm text-white/60 mb-4 max-w-md">
          Dein Lauf war mit {formatTicks(played)} langsamer als deine bisherige Bestzeit. Die offizielle Ersteller-Zeit bleibt {formatTicks(result.ticks)}.
        </p>
      )}

      <p className="text-sm text-white/45 max-w-md leading-relaxed mb-6">
        Die Verifizierung gilt für genau diesen Spielinhalt. Änderst du Gelände, Elemente oder die Tempo-Klasse, musst du das Level
        erneut durchspielen. Name, Beschreibung, Tags und Biom kannst du jederzeit ändern.
      </p>

      <div className="flex flex-wrap justify-center gap-3">
        <button type="button" onClick={onBack} className={primaryButtonClass}><ArrowLeft size={14} />Zurück zum Editor</button>
        <button type="button" onClick={onAgain} className={buttonClass}><RotateCcw size={14} />Nochmal spielen (Zeit verbessern)</button>
      </div>
    </div>
  );
}

/**
 * @param run          { level, doc, hash, round, startAt } — die gesperrte Momentaufnahme; ein neuer Versuch bekommt ein neues `round`
 * @param onExit       zurück in den Editor
 * @param onRestart    neuer Versuch (setzt `round`/`startAt` neu; die Seite mountet diese Komponente dafür neu)
 * @param onVerified   Callback mit dem bestätigten Ergebnis { hash, ticks, deaths, verifiedAt }
 */
export default function VerifyRun({ run, onExit, onRestart, onVerified }) {
  const [state, setState] = useState({ phase: "playing" });
  const mounted = useRef(true);
  const finished = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const submit = async (fin) => {
    setState({ phase: "submitting", fin });
    const res = await verifyLevel({ doc: run.doc, log: fin.log, ticks: fin.ticks, fp: fin.fp, hash: run.hash });
    // Der Server hat das Ergebnis gespeichert, auch wenn man inzwischen neu gestartet hat: dem Editor immer melden
    if (res.status === "ok") onVerified({ hash: res.hash, ticks: res.ticks, deaths: res.deaths, verifiedAt: res.verifiedAt });
    if (!mounted.current) return;
    setState(res.status === "ok" ? { phase: "done", fin, result: res } : { phase: "error", fin, result: res });
  };

  const handleFinish = (fin) => {
    if (finished.current) return;
    finished.current = true;
    submit(fin);
  };

  const { phase } = state;
  const busy = phase === "submitting";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-white/10">
        <button type="button" onClick={onExit} className={buttonClass}><ArrowLeft size={14} />Zurück zum Editor (Esc)</button>
        {phase !== "done" && (
          <button type="button" onClick={onRestart} disabled={busy} className={buttonClass}><RotateCcw size={14} />Neu starten (N)</button>
        )}
        <span className="text-xs text-white/40 ml-auto">Verifizierungslauf · das Level ist gesperrt</span>
      </div>

      {phase === "playing" && (
        <Banner tone="info" icon={Check}>
          <strong className="text-white">Spiele dein Level einmal komplett vom Start bis ins Ziel.</strong>{" "}
          Ein Tod kostet nur Zeit; R bringt dich zum letzten Checkpoint zurück. Die Zeit, die du hier schaffst, wird deine Ersteller-Zeit.
        </Banner>
      )}
      {busy && (
        <Banner tone="busy" icon={Loader2}>
          <strong>Verifizierung läuft …</strong> Der Server spielt deinen Lauf Tick für Tick nach ({formatTicks(state.fin.ticks)}).
        </Banner>
      )}
      {phase === "error" && (
        <Banner tone="error" icon={AlertTriangle}>
          <strong className="text-white">{TITLES[state.result.status] || "Die Verifizierung hat nicht geklappt"}.</strong>{" "}
          {state.result.reason}
          {state.result.errors?.length > 0 && (
            <ul className="list-disc pl-5 mt-1.5 space-y-0.5 text-white/70">
              {state.result.errors.slice(0, 5).map((e) => <li key={e}>{e}</li>)}
            </ul>
          )}
          <div className="flex flex-wrap gap-2 mt-3">
            {RETRYABLE.has(state.result.status) && (
              <button type="button" onClick={() => submit(state.fin)} className={buttonClass}>Erneut senden</button>
            )}
            {state.result.status === "ungeprueft" && (
              <button type="button" onClick={() => window.location.reload()} className={buttonClass}>Seite neu laden</button>
            )}
            <button type="button" onClick={onRestart} className={buttonClass}>Nochmal spielen</button>
          </div>
        </Banner>
      )}

      {phase === "done" ? (
        <VerifiedScene result={state.result} played={state.fin.ticks} onBack={onExit} onAgain={onRestart} />
      ) : (
        <div className="p-3">
          <RaceView
            level={run.level}
            roundNumber={run.round}
            phase="countdown"
            startAt={run.startAt}
            clock={OWN_CLOCK}
            epoch={1}
            finishNote={busy ? "Im Ziel — der Server prüft deinen Lauf …" : "Im Ziel"}
            onReady={noop}
            onFinish={handleFinish}
          />
        </div>
      )}
    </div>
  );
}
