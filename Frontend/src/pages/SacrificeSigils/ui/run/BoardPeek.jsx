// ui/run/BoardPeek.jsx — öffentliche Sicht eines fremden Kampfs zum Zuschauen (Brett, Waage, Handgrößen; keine Hände).
import React from "react";
import Card from "../card/Card.jsx";

/** @param {{ battle: any, names: string[], width?: number }} props */
export default function BoardPeek({ battle, names, width = 64 }) {
  const rows = [
    { p: 1, zone: "back" }, { p: 1, zone: "front" }, { p: 0, zone: "front" }, { p: 0, zone: "back" },
  ];
  const lead = battle.scale;
  return (
    <div className="ss-peek">
      <div className="flex items-center justify-between text-sm mb-2">
        <span className="ss-title">{names[1]} <span className="ss-faint">· {battle.players[1].handSize} Karten</span></span>
        <span className="ss-num">Waage {lead > 0 ? `${names[0]} +${lead}` : lead < 0 ? `${names[1]} +${-lead}` : "ausgeglichen"} · Zug {battle.turn}</span>
      </div>
      <div className="ss-peek-grid" style={{ "--peek-w": `${width}px` }}>
        {rows.map((r) => battle.players[r.p][r.zone].map((u, lane) => (
          <div key={`${r.p}${r.zone}${lane}`} className={`ss-peek-slot ${r.zone === "back" ? "ss-back" : ""}`}>
            {u && <Card card={u.card} width={width} attack={u.attack} health={u.health} maxHealth={u.maxHealth} submerged={u.submerged} />}
          </div>
        )))}
      </div>
      <p className="text-sm mt-2 ss-title">{names[0]} <span className="ss-faint">· {battle.players[0].handSize} Karten</span>{battle.phase === "over" ? <span className="text-[var(--candle)]"> · vorbei</span> : null}</p>
    </div>
  );
}
