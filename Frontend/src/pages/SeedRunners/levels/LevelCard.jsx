// LevelCard.jsx — eine Karte im Level-Browser: Vorschau, Name, Ersteller, Ersteller-Zeit, Erfolgsquote, Sterne, Spiele.
import React from "react";
import { Link } from "react-router-dom";
import { Play, Users, Timer } from "lucide-react";
import { RatingBadge } from "../ui/kit.jsx";
import LevelPreview from "./LevelPreview.jsx";
import { creatorPath, levelPath } from "./shareCode.js";
import { STATUS_LABELS, formatPercent } from "./labels.js";
import { BIOMES } from "../gen/biomes.js";
import { SPEED_CLASSES } from "../sim/classes.js";
import { formatTicks } from "../room/format.js";

const Fact = ({ icon: Icon, title, children }) => (
  <span className="inline-flex items-center gap-1 tabular-nums" title={title}>
    <Icon size={12} className="text-white/35" />{children}
  </span>
);

/** Fünf Kästchen: so viele gefüllt, wie die Schwierigkeit hoch ist */
export function DifficultyMeter({ value }) {
  if (!value) return null;
  return (
    <span className="inline-flex items-center gap-0.5" title={`Schwierigkeit ${value} von 5 (Angabe des Erstellers)`} aria-label={`Schwierigkeit ${value} von 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={`w-1.5 h-3 rounded-[1px] ${n <= value ? "bg-violet-400" : "bg-white/12"}`} />
      ))}
    </span>
  );
}

export default function LevelCard({ level, onTag }) {
  const status = STATUS_LABELS[level.status];
  return (
    <article className="bg-[#0d0d14] border border-white/10 rounded-md overflow-hidden flex flex-col hover:border-white/25 transition-colors" data-testid="level-card">
      <Link to={levelPath(level.code)} className="block" tabIndex={-1} aria-hidden="true">
        <LevelPreview preview={level.preview} biome={level.biome} className="aspect-[3/1] w-full" />
      </Link>
      <div className="p-3 flex flex-col gap-2 flex-1">
        <div className="min-w-0">
          <Link to={levelPath(level.code)} className="block text-sm font-semibold text-white truncate hover:text-violet-200 transition-colors" title={level.name}>
            {level.name}
          </Link>
          <p className="text-xs text-white/45 truncate">
            von <Link to={creatorPath(level.creator.id)} className="hover:text-white transition-colors">{level.creator.name}</Link>
            <span className="text-white/25"> · </span>{level.code}
          </p>
        </div>

        {status && <p className="text-xs text-amber-300">{status.label}</p>}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/65">
          <Fact icon={Timer} title="Zeit des Erstellers (vom Server bestätigt)">{formatTicks(level.creatorTicks)}</Fact>
          <Fact icon={Users} title={`${level.clears} von ${level.players} Spielern im Ziel`}>{formatPercent(level.clearRate)}</Fact>
          <RatingBadge rating={level.rating} className="!text-xs" />
          <Fact icon={Play} title="Gespielte Versuche">{level.plays}</Fact>
          <DifficultyMeter value={level.difficulty} />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 mt-auto pt-1">
          <span className="text-[11px] text-white/40 border border-white/10 rounded px-1.5 py-0.5">{BIOMES[level.biome]?.label || level.biome}</span>
          <span className="text-[11px] text-white/40 border border-white/10 rounded px-1.5 py-0.5">{SPEED_CLASSES[level.speedClass]?.label || level.speedClass}</span>
          {level.tags.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onTag?.(t)}
              disabled={!onTag}
              className="text-[11px] text-violet-200/80 border border-violet-400/20 rounded px-1.5 py-0.5 enabled:hover:bg-violet-500/10 transition-colors"
            >
              {t}
            </button>
          ))}
        </div>
      </div>
    </article>
  );
}
