// components/GoalBanner.jsx — Tor-Einblendung: zwei schräge Bänder wischen über das Feld (weiß, darüber die Teamfarbe),
// die Buchstaben fliegen einzeln ein, darunter der Torschütze. Dauer = GOAL_MS, danach räumt der Elternteil ab.
// Konfetti, Netz und Wackeln zeichnet das Spielfeld selbst (render.js / Pitch.jsx).
import React from "react";
import { TEAM_COLORS } from "../render.js";

export const GOAL_MS = 2300;

export default function GoalBanner({ team, scorer, score }) {
  const word = "TOR!";
  return (
    <div className="fk-goal" role="status">
      <div className="fk-goal-band under" />
      <div className="fk-goal-band over" style={{ background: TEAM_COLORS[team].main }} />
      <div className="fk-goal-text">
        <div className="fk-goal-word" aria-label={word}>
          {[...word].map((ch, i) => (
            <span key={i} style={{ animationDelay: `${60 + i * 55}ms` }} aria-hidden="true">{ch}</span>
          ))}
        </div>
        <div className="fk-goal-sub">
          {scorer}
          {score ? ` · ${score[0]} : ${score[1]}` : ""}
        </div>
      </div>
    </div>
  );
}
