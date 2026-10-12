// components/PowerupBar.jsx — Chaos-Modus: zeigt das Power-up des laufenden Zugs (mit Erklärung) und was der Gegner
// in seinem nächsten Zug bekommt. Die Folgen stehen mit dem Seed fest (engine/powerups.js), beide Teams bekommen
// je sechs Züge dieselben Power-ups — deshalb darf man das des Gegners ruhig sehen.
import React from "react";
import { Dumbbell, Zap, Maximize2, Waves, Snowflake, Repeat2 } from "lucide-react";
import { POWERUPS, currentPowerup, upcomingPowerup } from "../engine/index.js";
import { TEAM_COLORS } from "../render.js";

const POWERUP_ICON = { schwer: Dumbbell, turbo: Zap, riese: Maximize2, gummi: Waves, eis: Snowflake, doppel: Repeat2 };

export default function PowerupBar({ match, names }) {
  if (!match?.chaos || match.winner !== null) return null;
  const team = match.turn;
  const power = currentPowerup(match);
  const other = upcomingPowerup(match, 1 - team);
  const Icon = power ? POWERUP_ICON[power] : null;
  const OtherIcon = other ? POWERUP_ICON[other] : null;
  return (
    <div className="fk-power" style={{ borderColor: TEAM_COLORS[team].main }}>
      <span className="fk-power-icon" style={{ background: TEAM_COLORS[team].main }}>
        {Icon ? <Icon size={17} /> : <Repeat2 size={17} />}
      </span>
      <span className="min-w-0">
        <span className="fk-power-name">{power ? POWERUPS[power].name : "Bonus-Schuss"}</span>
        <span className="fk-power-hint">{power ? POWERUPS[power].hint : "Zweiter Schuss vom Doppelschuss — ohne Power-up"}</span>
      </span>
      {other && (
        <span className="fk-power-next" title={POWERUPS[other].hint}>
          <span className="fk-faint">Danach {names[1 - team]}:</span>
          <OtherIcon size={14} />
          <span>{POWERUPS[other].name}</span>
        </span>
      )}
    </div>
  );
}
