// components/EndPanel.jsx — Ende einer Runde: wer gewonnen hat, wie viele Karten die anderen noch hielten.
import React from "react";
import { playerColor } from "../skins.js";
import { TEAMS } from "../engine/index.js";

/**
 * @param {object} props
 * @param {object} props.view     Sicht nach dem letzten Zug (winner gesetzt)
 * @param {{players: {name: string}[], seat: number | null}} props.table
 * @param {React.ReactNode} props.children  Knöpfe (Nochmal, Menü …)
 */
export default function EndPanel({ view, table, children }) {
  const me = table.seat;
  const { teams } = table;
  const team = view.winTeam;
  const won = view.winner === me || (!!teams && me !== null && teams[me] === team);
  const winnerName = teams ? TEAMS[team].name : table.players[view.winner]?.name;
  const order = table.players.map((p, seat) => ({ ...p, seat, left: view.counts[seat] })).sort((a, b) => a.left - b.left);
  return (
    <div className="wf-center">
      <div className="wf-card p-5 w-full max-w-sm">
        <div className="wf-label mb-1">Runde vorbei</div>
        <h2 className="wf-display text-3xl mb-4">
          {me !== null && won ? (teams ? "Euer Team gewinnt" : "Du hast gewonnen") : `${winnerName} gewinnt`}
        </h2>
        <ul className="wf-rows wf-card mb-4">
          {order.map((p, i) => (
            <li key={p.seat} className="wf-seat">
              <span className="wf-num wf-faint w-4">{i + 1}</span>
              <span className="wf-seat-dot" style={{ background: playerColor(table.players, teams, p.seat) }} />
              <span className="font-semibold">{p.seat === me ? `${p.name} (du)` : p.name}</span>
              <span className="ml-auto wf-dim wf-num">{p.left === 0 ? "leer" : `${p.left} ${p.left === 1 ? "Karte" : "Karten"}`}</span>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">{children}</div>
      </div>
    </div>
  );
}
