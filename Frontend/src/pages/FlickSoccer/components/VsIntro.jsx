// components/VsIntro.jsx — Einblendung zum Anpfiff: zwei schräge Teamtafeln fahren von links und rechts herein,
// dazwischen „VS", danach „Anpfiff". Liegt über dem Spielfeld; die Animation steht in theme.css (fk-vs-*), hier nur
// Inhalt und Ende. Während sie läuft, darf niemand schießen.
import React, { useEffect } from "react";
import { FORMATIONS } from "../engine/index.js";
import { playWhistle } from "../sound.js";

export const INTRO_MS = 2700;

// tags: optionale Zusätze für die kleine Zeile je Seite (z. B. die KI-Stärke), damit der große Name kurz bleibt
export default function VsIntro({ names, formations, tags = [], onDone }) {
  useEffect(() => {
    const whistle = setTimeout(() => playWhistle(false), INTRO_MS - 500);
    const done = setTimeout(() => onDone?.(), INTRO_MS);
    return () => {
      clearTimeout(whistle);
      clearTimeout(done);
    };
  }, [onDone]);

  // Kleine Zeile: Aufstellung (+ Zusatz). Die Teamfarbe zeigt die Tafel selbst, der Kurzcode steht im Menü.
  const sub = (id, tag) => [FORMATIONS[id] ? FORMATIONS[id].name : "", tag].filter(Boolean).join(" · ");
  return (
    <div className="fk-vs" aria-live="polite">
      <div className="fk-vs-plate left">
        <span className="fk-vs-sub">{sub(formations[0], tags[0])}</span>
        <span className="fk-vs-name">{names[0]}</span>
      </div>
      <div className="fk-vs-plate right">
        <span className="fk-vs-sub">{sub(formations[1], tags[1])}</span>
        <span className="fk-vs-name">{names[1]}</span>
      </div>
      <div className="fk-vs-mark">VS</div>
      <div className="fk-vs-kickoff">Anpfiff</div>
    </div>
  );
}
