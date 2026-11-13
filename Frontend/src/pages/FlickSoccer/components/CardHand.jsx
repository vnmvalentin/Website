// components/CardHand.jsx — Chaos-Modus: die Kartenhand und das Ereignis. Links die drei Karten des Teams am Zug — darf
// man selbst spielen (canPick), sind es Knöpfe: antippen wählt eine Karte für den nächsten Schuss, nochmal antippen
// legt sie zurück. In der Mitte steht, was die gewählte Karte tut — oder welches Ereignis gerade das ganze Feld trifft.
// Rechts das Ereignis (läuft / kommt in N Zügen) und klein die Hand des Gegners: Alles liegt offen, damit man planen kann.
import React from "react";
import { TriangleAlert } from "lucide-react";
import { CHAOS_EVENTS, POWERUPS, chaosHand, currentEvent, nextEvent } from "../engine/index.js";
import { TEAM_COLORS } from "../render.js";
import { POWERUP_ICON } from "./cardIcons.js";

/**
 * match: laufendes Spiel · names: [Name Team 0, Name Team 1]
 * canPick: der Spieler an diesem Gerät darf jetzt eine Karte wählen · selected / onSelect: gewählte Karte
 * played: Karte, die gerade ausgespielt wird (Computer zielt, Ball rollt) — wird statt der Auswahl hervorgehoben
 */
export default function CardHand({ match, names, canPick = false, selected = null, onSelect, played = null }) {
  if (!match?.chaos || match.winner !== null) return null;
  const team = match.turn;
  const hand = chaosHand(match, team);
  const other = chaosHand(match, 1 - team);
  const bonus = match.chaos.bonus;
  const shown = played || selected;
  const event = currentEvent(match);
  const coming = event ? null : nextEvent(match);
  let hint;
  let hintName = null;
  if (shown) {
    hintName = POWERUPS[shown].name;
    hint = POWERUPS[shown].hint;
  } else if (event) {
    hintName = CHAOS_EVENTS[event].name;
    hint = CHAOS_EVENTS[event].hint;
  } else if (bonus) hint = "Zweiter Schuss vom Doppelschuss — ohne Karte";
  else if (canPick) hint = "Karte antippen, dann schießen — oder ohne Karte spielen";
  else hint = `${names[team]} ist am Zug`;

  return (
    <div className="fk-hand" style={{ borderColor: TEAM_COLORS[team].main }}>
      <div className="fk-hand-cards" role="group" aria-label={`Karten von ${names[team]}`}>
        {hand.map((id) => {
          const Icon = POWERUP_ICON[id];
          const on = shown === id;
          return (
            <button
              key={id}
              type="button"
              className="fk-cardbtn"
              style={on ? { background: TEAM_COLORS[team].main, borderColor: TEAM_COLORS[team].main } : undefined}
              aria-pressed={on}
              disabled={!canPick || bonus}
              title={POWERUPS[id].hint}
              onClick={() => onSelect?.(selected === id ? null : id)}
            >
              <Icon size={17} />
              <span>{POWERUPS[id].name}</span>
            </button>
          );
        })}
      </div>
      <p className="fk-hand-hint">
        {hintName && <b className="fk-hand-name">{hintName}</b>}
        {hint}
      </p>
      {event && (
        <span className="fk-event on" title={CHAOS_EVENTS[event].hint}>
          <TriangleAlert size={14} /> {CHAOS_EVENTS[event].name}
        </span>
      )}
      {coming && (
        <span className="fk-event" title={`${CHAOS_EVENTS[coming.id].name}: ${CHAOS_EVENTS[coming.id].hint}`}>
          <TriangleAlert size={14} /> {coming.inTurns === 1 ? "nächster Zug" : `in ${coming.inTurns} Zügen`}: {CHAOS_EVENTS[coming.id].name}
        </span>
      )}
      <div className="fk-hand-other" title={`Karten von ${names[1 - team]}: ${other.map((id) => POWERUPS[id].name).join(", ")}`}>
        <span className="fk-faint">{names[1 - team]}</span>
        {other.map((id) => {
          const Icon = POWERUP_ICON[id];
          return (
            <span key={id} className="fk-hand-mini" style={{ color: TEAM_COLORS[1 - team].light }}>
              <Icon size={14} />
            </span>
          );
        })}
      </div>
    </div>
  );
}
