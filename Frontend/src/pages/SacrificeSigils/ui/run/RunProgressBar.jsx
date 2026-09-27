// ui/run/RunProgressBar.jsx — Fortschrittsleiste der Moorwanderung: pro Spieler Siegel, Status, Pfad-Fortschritt,
// Deckgröße. Kompakte Zeilen (6 Spieler passen), Ausgeschiedene ausgegraut am Ende. Auf schmalen Bildschirmen
// eingeklappt; ein Tipp öffnet sie. Öffentlich bekannte Karten per Tipp auf einen Namen.
import React, { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import Seals from "./Seals.jsx";
import TurnTimer from "../common/TurnTimer.jsx";
import { de } from "../../i18n/de.js";
import { statusText } from "./names.js";

/** @param {{ view: any, you: number|null, timers?: any, clockOffset?: number, onShowPlayer?: (q: number) => void }} props */
export default function RunProgressBar({ view, you, timers, clockOffset = 0, onShowPlayer }) {
  const [open, setOpen] = useState(false);
  const order = view.players.map((P, q) => ({ P, q })).sort((a, b) => Number(b.P.alive) - Number(a.P.alive) || (a.P.place ?? 99) - (b.P.place ?? 99) || a.q - b.q);
  const phaseLabel = view.phase === "starter" ? "Startdecks"
    : view.phase === "path" ? `Runde ${view.round + 1} · Pfad ${view.pathInRound + 1}/${view.pathsPerRound}`
      : view.phase === "duels" ? `${de.run.duels} ${view.round}` : "Ende";
  const pathTimer = view.phase === "path" ? timers?.path : null;
  return (
    <div className={`ss-run-bar ${open ? "ss-open" : ""}`}>
      <div className="ss-run-bar-head">
        <span className="ss-title text-[var(--candle)] whitespace-nowrap">{phaseLabel}</span>
        {pathTimer && <TurnTimer timer={pathTimer} clockOffset={clockOffset} />}
        <button type="button" className="ss-btn ss-btn-sm ss-btn-ghost ss-run-bar-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />} Mitspieler
        </button>
      </div>
      <ol className="ss-run-bar-list" aria-label="Mitspieler">
        {order.map(({ P, q }) => {
          const st = P.status;
          const lv = st?.level !== undefined && st?.levels ? ` · ${Math.min(st.level + (st.stage === "fight" || st.stage === "scene" ? 1 : 0), st.levels)}/${st.levels}` : "";
          return (
            <li key={q} className={`ss-run-row ${P.alive ? "" : "ss-out"} ${q === you ? "ss-me" : ""}`}>
              <button type="button" className="ss-run-name" onClick={() => onShowPlayer?.(q)} title="Öffentlich bekannte Karten">
                {P.name}{q === you ? " (du)" : ""}
              </button>
              <Seals left={P.seals} total={view.settings.seals} size={15} />
              <span className="ss-run-status">{P.alive ? `${statusText(view, st)}${view.phase === "path" ? lv : ""}` : P.place ? de.run.place(P.place) : de.run.eliminated}</span>
              <span className="ss-run-deck" title="Karten im Deck">{P.deckSize}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
