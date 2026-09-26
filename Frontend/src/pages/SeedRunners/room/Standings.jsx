// Standings.jsx — Live-Rangliste während der Runde: Platz nach Checkpoint-Fortschritt, im Ziel nach
// Zeit. Bewusst nur so genau wie die Meldungen des Servers (Checkpoints und Ziel); es werden keine
// Positionen übertragen.
import React from "react";
import { Crown, WifiOff } from "lucide-react";
import { formatTicks } from "./format.js";
import { Panel } from "../ui/kit.jsx";

const RACING_STATES = ["loading", "ready", "racing", "finished", "dnf"];

function statusText(p, total) {
  if (p.state === "finished") return formatTicks(p.finishTicks);
  if (p.state === "dnf") return "Aufgegeben";
  if (p.state === "racing") return p.cp > 0 ? `Checkpoint ${p.cp} / ${total}` : "Unterwegs";
  if (p.state === "ready") return "Bereit";
  if (p.state === "loading") return "Lädt …";
  if (p.state === "incompatible") return "Falsche Version";
  return "Schaut zu";
}

export default function Standings({ players, meId, checkpointTotal, title = "Rangliste" }) {
  const racers = players
    .filter((p) => RACING_STATES.includes(p.state))
    .sort((a, b) => (a.place ?? 99) - (b.place ?? 99));
  const others = players.filter((p) => !RACING_STATES.includes(p.state));

  return (
    <Panel title={title} bodyClassName="">
      <ul className="sr-rows">
        {racers.map((p) => (
          <li key={p.id} className={`px-4 py-2.5 flex items-center gap-3 ${p.id === meId ? "bg-white/[0.04]" : ""}`}>
            <span className={`sr-num w-5 text-right shrink-0 ${p.place === 1 ? "sr-accent-text" : "sr-faint"}`}>{p.place ?? "–"}</span>
            <span className="w-3 h-3 rounded-[2px] shrink-0" style={{ background: p.color }} />
            <div className="min-w-0 flex-1">
              <p className="sr-ink truncate leading-tight">
                {p.name}
                {p.id === meId && <span className="sr-faint"> (du)</span>}
                {p.isHost && <Crown size={11} className="inline ml-1.5 -mt-0.5 sr-faint" />}
              </p>
              <p className={`text-xs sr-num truncate ${p.state === "finished" ? "sr-good" : "sr-faint"}`}>{statusText(p, checkpointTotal)}</p>
            </div>
            {!p.connected && <WifiOff size={13} className="sr-warn shrink-0" aria-label="Verbindung getrennt" />}
          </li>
        ))}
      </ul>
      {others.length > 0 && (
        <p className="px-4 py-2.5 text-xs sr-faint sr-divider">
          Schauen zu: {others.map((p) => p.name).join(", ")}
        </p>
      )}
    </Panel>
  );
}
