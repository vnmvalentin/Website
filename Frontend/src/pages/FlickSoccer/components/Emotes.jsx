// components/Emotes.jsx — feste Reaktionen im Online-Spiel (engine EMOTES): eine Knopfleiste zum Senden und die
// Sprechblase, die kurz über dem Feld auf der Seite des Absenders erscheint. Kein freier Text.
import React, { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { EMOTES, EMOTE_IDS, EMOTE_COOLDOWN_MS } from "../engine/index.js";
import { TEAM_COLORS } from "../render.js";

export const EMOTE_SHOW_MS = 2600;

/** Knopfleiste; onSend(id). Nach dem Senden kurz gesperrt (der Server drosselt genauso). */
export function EmoteBar({ onSend }) {
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    if (!locked) return undefined;
    const id = setTimeout(() => setLocked(false), EMOTE_COOLDOWN_MS);
    return () => clearTimeout(id);
  }, [locked]);
  return (
    <div className="fk-emotes" role="group" aria-label="Reaktion senden">
      <MessageCircle size={15} className="fk-faint shrink-0" aria-hidden="true" />
      {EMOTE_IDS.map((id) => (
        <button
          key={id}
          type="button"
          className="fk-emote-btn"
          disabled={locked}
          onClick={() => {
            setLocked(true);
            onSend(id);
          }}
        >
          {EMOTES[id]}
        </button>
      ))}
    </div>
  );
}

/** Sprechblasen über dem Feld. bubbles: { 0: { id, key } | null, 1: … } — Team 0 links, Team 1 rechts. */
export function EmoteBubbles({ bubbles }) {
  return (
    <>
      {[0, 1].map((team) => {
        const b = bubbles[team];
        if (!b || !EMOTES[b.id]) return null;
        return (
          <div key={`${team}-${b.key}`} className={`fk-emote-bubble ${team === 0 ? "left" : "right"}`} style={{ background: TEAM_COLORS[team].main }} role="status">
            {EMOTES[b.id]}
          </div>
        );
      })}
    </>
  );
}
