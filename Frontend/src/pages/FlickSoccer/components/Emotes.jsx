// components/Emotes.jsx — Schnell-Nachrichten (engine EMOTES), kein freier Text. Ein Knopf unten links auf dem Feld
// klappt die Auswahl auf (immer erreichbar, auch am Handy im Querformat); gesendete Nachrichten erscheinen als große
// schräge Tafel in Teamfarbe mit dem Namen des Absenders auf dessen Seite des Feldes, mit einem kurzen Ton.
import React, { useEffect, useRef, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { EMOTES, EMOTE_IDS, EMOTE_COOLDOWN_MS } from "../engine/index.js";
import { TEAM_COLORS } from "../render.js";
import { playEmote } from "../sound.js";

export const EMOTE_SHOW_MS = 2800;

/** Knopf mit aufklappender Auswahl, liegt über dem Feld; onSend(id). Nach dem Senden kurz gesperrt (wie der Server). */
export function EmoteBar({ onSend }) {
  const [open, setOpen] = useState(false);
  const [locked, setLocked] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!locked) return undefined;
    const id = setTimeout(() => setLocked(false), EMOTE_COOLDOWN_MS);
    return () => clearTimeout(id);
  }, [locked]);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  return (
    <div className="fk-emotes" ref={ref}>
      {open && (
        <div className="fk-emote-grid" role="group" aria-label="Nachricht senden">
          {EMOTE_IDS.map((id) => (
            <button
              key={id}
              type="button"
              className="fk-emote-btn"
              disabled={locked}
              onClick={() => {
                setLocked(true);
                setOpen(false);
                onSend(id);
              }}
            >
              {EMOTES[id]}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        className="fk-emote-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title="Schnell-Nachricht senden"
        aria-label="Schnell-Nachricht senden"
      >
        {open ? <X size={18} /> : <MessageCircle size={18} />}
        <span>Chat</span>
      </button>
    </div>
  );
}

/**
 * Nachrichten über dem Feld. bubbles: { 0: { id, key } | null, 1: … } — Team 0 links, Team 1 rechts.
 * names: [Name Team 0, Name Team 1] — steht klein über der Nachricht.
 */
export function EmoteBubbles({ bubbles, names = [] }) {
  // Ton bei jeder neuen Nachricht
  const lastKeys = useRef({});
  useEffect(() => {
    for (const team of [0, 1]) {
      const key = bubbles[team]?.key;
      if (key && lastKeys.current[team] !== key) playEmote();
      lastKeys.current[team] = key;
    }
  }, [bubbles]);
  return (
    <>
      {[0, 1].map((team) => {
        const b = bubbles[team];
        if (!b || !EMOTES[b.id]) return null;
        return (
          <div key={`${team}-${b.key}`} className={`fk-emote-bubble ${team === 0 ? "left" : "right"}`} role="status">
            <div className="fk-emote-plate" style={{ background: TEAM_COLORS[team].main }}>
              <span className="fk-emote-inner">
                {names[team] && <span className="fk-emote-who">{names[team]}</span>}
                <span className="fk-emote-text">{EMOTES[b.id]}</span>
              </span>
            </div>
          </div>
        );
      })}
    </>
  );
}
