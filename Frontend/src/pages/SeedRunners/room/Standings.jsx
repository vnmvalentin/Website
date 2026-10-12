// Standings.jsx — Live-Rangliste während der Runde: Platz nach Checkpoint-Fortschritt, im Ziel nach
// Zeit (Zeitjagd: nach der bisher besten Zeit). Platz und Status kommen nur aus den Meldungen des Servers (Checkpoints und
// Ziel); die Positionen für Geister und Zuschauen laufen getrennt davon (room/remoteRunners.js).
//
// Zuschauen: Wer gerade nicht selbst läuft (im Ziel, aufgegeben, zu spät gekommen), wählt hier per Klick einen Läufer —
// die Rennansicht folgt ihm dann mit der Kamera.
import React from "react";
import { Crown, WifiOff, Eye } from "lucide-react";
import { formatTicks } from "./format.js";
import { Panel } from "../ui/kit.jsx";

const RACING_STATES = ["loading", "ready", "racing", "finished", "dnf"];

function statusText(p, total, timeattack) {
  const runs = p.runs === 1 ? "1 Lauf" : `${p.runs || 0} Läufe`;
  if (timeattack && p.state === "racing" && p.finishTicks !== null) return `Beste ${formatTicks(p.finishTicks)} · ${runs}`;
  if (p.state === "finished") return timeattack ? `${formatTicks(p.finishTicks)} · ${runs} · fertig` : formatTicks(p.finishTicks);
  if (p.state === "dnf" && p.died) return "Ausgeschieden (Tod)";
  if (p.state === "dnf") return timeattack ? "Beendet ohne Zeit" : "Aufgegeben";
  if (p.state === "racing") return p.cp > 0 ? `Checkpoint ${p.cp} / ${total}` : "Unterwegs";
  if (p.state === "ready") return "Bereit";
  if (p.state === "loading") return "Lädt …";
  if (p.state === "incompatible") return "Falsche Version";
  return "Schaut zu";
}

/**
 * @param mode        'race' | 'timeattack'
 * @param canWatch    Zuschau-Knöpfe zeigen (man läuft gerade nicht selbst)
 * @param watchingId  wem man gerade zuschaut
 * @param onWatch     (id | null) — derselbe Klick noch einmal beendet das Zuschauen
 */
export default function Standings({ players, meId, checkpointTotal, title = "Rangliste", mode = "race", canWatch = false, watchingId = null, onWatch }) {
  const timeattack = mode === "timeattack";
  const racers = players
    .filter((p) => RACING_STATES.includes(p.state))
    .sort((a, b) => (a.place ?? 99) - (b.place ?? 99));
  const others = players.filter((p) => !RACING_STATES.includes(p.state));

  return (
    <Panel title={title} bodyClassName="">
      <ul className="sr-rows">
        {racers.map((p) => {
          const watchable = canWatch && onWatch && p.id !== meId && p.state === "racing" && p.connected;
          const watching = watchingId === p.id;
          const progress = p.state === "racing" && checkpointTotal > 0 ? Math.min(1, p.cp / checkpointTotal) : null;
          return (
            <li key={p.id} className={`px-4 py-2.5 flex items-center gap-3 ${p.id === meId || watching ? "bg-white/[0.04]" : ""}`}>
              <span className={`sr-num w-5 text-right shrink-0 ${p.place === 1 ? "sr-accent-text" : "sr-faint"}`}>{p.place ?? "–"}</span>
              <span className="w-3 h-3 rounded-[2px] shrink-0" style={{ background: p.color }} />
              <div className="min-w-0 flex-1">
                <p className="sr-ink truncate leading-tight">
                  {p.name}
                  {p.id === meId && <span className="sr-faint"> (du)</span>}
                  {p.isHost && <Crown size={11} className="inline ml-1.5 -mt-0.5 sr-faint" />}
                </p>
                <p className={`text-xs sr-num truncate ${p.state === "finished" || (timeattack && p.finishTicks !== null && p.state === "racing") ? "sr-good" : "sr-faint"}`}>
                  {statusText(p, checkpointTotal, timeattack)}
                </p>
                {progress !== null && (
                  <div className="h-[2px] mt-1.5 bg-white/10" aria-hidden="true">
                    <div className="h-full" style={{ width: `${progress * 100}%`, background: p.color }} />
                  </div>
                )}
              </div>
              {!p.connected && <WifiOff size={13} className="sr-warn shrink-0" aria-label="Verbindung getrennt" />}
              {watchable && (
                <button
                  type="button"
                  onClick={() => onWatch(watching ? null : p.id)}
                  className="sr-icon-btn !w-8 !h-8 shrink-0"
                  style={watching ? { color: "var(--sr-accent)", boxShadow: "inset 0 0 0 1px var(--sr-accent)" } : undefined}
                  title={watching ? "Zuschauen beenden" : `${p.name} zuschauen`}
                  aria-label={watching ? "Zuschauen beenden" : `${p.name} zuschauen`}
                  aria-pressed={watching}
                >
                  <Eye size={15} />
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {others.length > 0 && (
        <p className="px-4 py-2.5 text-xs sr-faint sr-divider">
          Schauen zu: {others.map((p) => p.name).join(", ")}
        </p>
      )}
    </Panel>
  );
}
