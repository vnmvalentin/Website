// components/CardFlash.jsx — Chaos-Modus: kurze Einblendung über dem Feld, wenn eine Karte ausgespielt wird (schräge
// Tafel in Teamfarbe mit Symbol und Name). Beide Spieler sehen sie; nach gut einer Sekunde ist sie wieder weg.
// Bei jedem neuen Schuss mit Karte per `key` neu einhängen.
import React, { useEffect, useState } from "react";
import { POWERUPS } from "../engine/index.js";
import { TEAM_COLORS } from "../render.js";
import { POWERUP_ICON } from "./cardIcons.js";

export const CARD_FLASH_MS = 1300;

export default function CardFlash({ power, team, name }) {
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setGone(true), CARD_FLASH_MS);
    return () => clearTimeout(id);
  }, []);
  const Icon = POWERUP_ICON[power];
  if (gone || !POWERUPS[power]) return null;
  return (
    <div className="fk-cardflash" role="status">
      <div className="fk-cardflash-plate" style={{ background: TEAM_COLORS[team].main }}>
        <span className="fk-cardflash-inner">
          <Icon size={26} />
          <span>
            <span className="fk-cardflash-who">{name} spielt</span>
            <span className="fk-cardflash-name">{POWERUPS[power].name}</span>
          </span>
        </span>
      </div>
    </div>
  );
}
