// Leaderboard.jsx — Bestenliste eines Levels: die Zeit des Erstellers steht hervorgehoben oben, darunter die bestätigten Läufe.
// Ein Häkchen holt den Lauf als Geist ins nächste Spiel (höchstens MAX_GHOSTS gleichzeitig).
import React from "react";
import { BadgeCheck, Trophy, Eye } from "lucide-react";
import { formatTicks, formatGap } from "../room/format.js";
import { MAX_GHOSTS } from "./ghostSetup.js";

function WatchButton({ onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Diesen Lauf ansehen, ohne selbst zu spielen"
      aria-label={label}
      className="text-white/35 hover:text-white transition-colors"
    >
      <Eye size={13} />
    </button>
  );
}

function GhostBox({ id, selected, disabled, color, onToggle, label }) {
  return (
    <label className={`inline-flex items-center gap-1.5 text-xs ${disabled && !selected ? "text-white/25" : "text-white/55 cursor-pointer"}`} title={disabled && !selected ? `Höchstens ${MAX_GHOSTS} Geister gleichzeitig` : "Diesen Lauf beim Spielen als Geist mitlaufen lassen"}>
      <input
        type="checkbox"
        className="accent-violet-500"
        checked={selected}
        disabled={disabled && !selected}
        onChange={() => onToggle(id)}
        aria-label={label}
      />
      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: selected ? color : "transparent", border: selected ? "none" : "1px solid rgba(255,255,255,.2)" }} />
    </label>
  );
}

/**
 * @param detail    Antwort von getLevel()
 * @param selected  Liste der gewählten Geister ('creator' oder runId)
 * @param colors    Map Geist-ID → Farbe
 * @param onWatch   (id, name, color) → Zeitleiste öffnen und diesen Lauf ansehen (optional)
 */
export default function Leaderboard({ detail, selected, colors, onToggle, onWatch }) {
  const { board, me, creatorRun, creator } = detail;
  const full = selected.length >= MAX_GHOSTS;
  const first = board[0]?.ticks ?? null;
  const isMine = (e) => me.best && e.rank === me.best.rank && e.ticks === me.best.ticks;
  const mineOutside = me.best && !board.some(isMine);

  return (
    <div className="bg-[#0d0d14] border border-white/10 rounded-md" data-testid="leaderboard">
      <div className="px-4 py-3 border-b border-white/10 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <Trophy size={16} className="text-white/45" />
          <h2 className="text-sm font-semibold text-white">Bestenliste</h2>
        </div>
        <p className="text-xs text-white/40 tabular-nums">{detail.runs} {detail.runs === 1 ? "bestätigter Lauf" : "bestätigte Läufe"}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-white/35">
              <th className="pl-4 pr-2 py-2 font-medium w-12">Platz</th>
              <th className="px-2 py-2 font-medium">Name</th>
              <th className="px-2 py-2 font-medium text-right">Zeit</th>
              <th className="px-2 py-2 font-medium text-right hidden sm:table-cell">Abstand</th>
              <th className="px-2 py-2 font-medium text-right hidden sm:table-cell">Tode</th>
              <th className="pl-2 pr-4 py-2 font-medium text-right">Geist</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/8">
            <tr className="bg-violet-500/10" data-testid="creator-row">
              <td className="pl-4 pr-2 py-2.5 text-violet-200"><BadgeCheck size={15} aria-label="Ersteller" /></td>
              <td className="px-2 py-2.5 text-white truncate max-w-[12rem]">
                {creator.name} <span className="text-xs text-violet-200/80">Ersteller</span>
              </td>
              <td className="px-2 py-2.5 text-right tabular-nums text-white font-semibold" data-testid="creator-row-time">{formatTicks(creatorRun.ticks)}</td>
              <td className="px-2 py-2.5 text-right tabular-nums text-white/40 hidden sm:table-cell">–</td>
              <td className="px-2 py-2.5 text-right tabular-nums text-white/60 hidden sm:table-cell">{creatorRun.deaths}</td>
              <td className="pl-2 pr-4 py-2.5 text-right">
                <span className="inline-flex items-center gap-2.5">
                  {onWatch && <WatchButton onClick={() => onWatch("creator", creator.name, colors.creator)} label={`Lauf von ${creator.name} ansehen`} />}
                  <GhostBox id="creator" selected={selected.includes("creator")} disabled={full} color={colors.creator} onToggle={onToggle} label="Geist des Erstellers" />
                </span>
              </td>
            </tr>
            {board.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-sm text-white/45">Noch kein bestätigter Lauf — die erste Zeit gehört dir.</td></tr>
            )}
            {board.map((e) => (
              <tr key={e.runId} className={isMine(e) ? "bg-white/[0.05]" : ""} data-testid="board-row">
                <td className="pl-4 pr-2 py-2.5 tabular-nums text-white/55">{e.rank}</td>
                <td className="px-2 py-2.5 text-white truncate max-w-[12rem]">
                  {e.name}{isMine(e) && <span className="text-white/40"> (Du)</span>}
                </td>
                <td className="px-2 py-2.5 text-right tabular-nums text-white">{formatTicks(e.ticks)}</td>
                <td className="px-2 py-2.5 text-right tabular-nums text-white/40 hidden sm:table-cell">{e.rank === 1 ? "–" : formatGap(e.ticks - first)}</td>
                <td className="px-2 py-2.5 text-right tabular-nums text-white/60 hidden sm:table-cell">{e.deaths}</td>
                <td className="pl-2 pr-4 py-2.5 text-right">
                  {e.hasGhost ? (
                    <span className="inline-flex items-center gap-2.5">
                      {onWatch && <WatchButton onClick={() => onWatch(e.runId, e.name, colors[e.runId] || "#a78bfa")} label={`Lauf von ${e.name} ansehen`} />}
                      <GhostBox id={e.runId} selected={selected.includes(e.runId)} disabled={full} color={colors[e.runId]} onToggle={onToggle} label={`Geist von ${e.name}`} />
                    </span>
                  ) : (
                    <span className="text-xs text-white/25" title="Dieser Lauf stammt aus einer älteren Spielversion und lässt sich nicht mehr abspielen">–</span>
                  )}
                </td>
              </tr>
            ))}
            {mineOutside && (
              <tr className="bg-white/[0.05]" data-testid="own-row">
                <td className="pl-4 pr-2 py-2.5 tabular-nums text-white/55">{me.best.rank}</td>
                <td className="px-2 py-2.5 text-white">Du</td>
                <td className="px-2 py-2.5 text-right tabular-nums text-white">{formatTicks(me.best.ticks)}</td>
                <td className="px-2 py-2.5 hidden sm:table-cell" />
                <td className="px-2 py-2.5 text-right tabular-nums text-white/60 hidden sm:table-cell">{me.best.deaths}</td>
                <td className="pl-2 pr-4 py-2.5" />
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="px-4 py-2.5 text-xs text-white/35 border-t border-white/10 leading-relaxed">
        Jede Zeit hat der Server aus dem Input-Log nachgespielt. Geister laufen beim Spielen mit und ändern nichts an deinem Lauf.
      </p>
    </div>
  );
}
