// components/Scoreboard.jsx — Spielstand wie eine TV-Einblendung, einzeilig für die Spielleiste (GameStage): schräge
// Teamtafeln links/rechts, in der Mitte die Tore auf heller Tafel (springen bei einem Treffer neu ein). Wer dran ist,
// sieht man an der gefüllten Tafel samt Restzeit; die Zugzeit läuft zusätzlich als Balken an der Unterkante der Leiste.
import React, { useEffect, useState } from "react";
import { TEAM_COLORS } from "../render.js";

function useNow(active) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

export default function Scoreboard({ names, score, turn, winner, deadline, turnSeconds }) {
  const now = useNow(!!deadline);
  const left = deadline ? Math.max(0, deadline - now) : null;
  const active = winner === null || winner === undefined ? turn : null;
  const frac = left !== null && turnSeconds ? Math.min(1, left / (turnSeconds * 1000)) : null;

  const plate = (t) => (active === t ? { background: TEAM_COLORS[t].main, borderColor: TEAM_COLORS[t].main, color: "#fff" } : undefined);
  const stripe = (t) => ({ background: active === t ? "#fff" : TEAM_COLORS[t].main });
  const time = (t) => (active === t && left !== null ? <span className="fk-board-time">{Math.ceil(left / 1000)}s</span> : null);

  return (
    <>
      <div className="fk-board" aria-label={`${names[0]} ${score[0]} zu ${score[1]} ${names[1]}`}>
        <div className="fk-board-team left" style={plate(0)}>
          <span className="fk-board-stripe" style={stripe(0)} />
          <span className="fk-board-name">{names[0]}</span>
          {time(0)}
        </div>
        <div className="fk-board-mid">
          <div className="fk-board-score l" style={{ boxShadow: `inset 0 -4px 0 ${TEAM_COLORS[0].main}` }}>
            <span key={`a${score[0]}`} className={score[0] ? "pop" : ""}>{score[0]}</span>
          </div>
          <div className="fk-board-score r" style={{ boxShadow: `inset 0 -4px 0 ${TEAM_COLORS[1].main}` }}>
            <span key={`b${score[1]}`} className={score[1] ? "pop" : ""}>{score[1]}</span>
          </div>
        </div>
        <div className="fk-board-team right" style={plate(1)}>
          {time(1)}
          <span className="fk-board-name text-right">{names[1]}</span>
          <span className="fk-board-stripe" style={stripe(1)} />
        </div>
      </div>
      {frac !== null && active !== null && (
        <div className="fk-timebar" aria-hidden="true">
          <div style={{ width: `${frac * 100}%`, background: frac < 0.34 ? "#ff5a3c" : TEAM_COLORS[active].main }} />
        </div>
      )}
    </>
  );
}
