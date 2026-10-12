// screens/EndScreen.jsx — Auswertung nach einem Lauf: Ergebnis, Werte, Items, Account-XP und neue Freischaltungen.

import React from "react";
import { Trophy, Skull, Flag, Play, Home, Sparkles, Medal } from "lucide-react";
import { SKINS } from "../data/skins.js";
import { KITS } from "../data/kits.js";
import FlatSprite from "../ui/FlatSprite.jsx";
import { DIFFICULTIES } from "../engine/difficulty.js";
import { ItemIcon, UpgradeIcon } from "../ui/icons.jsx";
import { WEAPONS, TALENTS } from "../data/weapons.js";
import { fmtTime } from "../engine/util.js";

export default function EndScreen({ result, onAgain, onMenu }) {
  const kit = KITS[result.kitId] || KITS.default;
  const s = result.server;
  const title = result.won ? "Sieg" : result.dead ? "Gefallen" : "Lauf beendet";
  const Icon = result.won ? Trophy : result.dead ? Skull : Flag;
  const pct = s ? s.levelXp / s.levelNeed : 0;

  return (
    <div className="absolute inset-0 overflow-y-auto av-scroll">
      <div className="w-full max-w-[920px] mx-auto px-4 md:px-8 py-8 md:py-12">
        <div className="av-block p-6 md:p-8">
          <div className="flex items-center gap-4">
            <Icon size={34} className={result.won ? "av-gold" : result.dead ? "av-blood" : "av-torch"} />
            <div>
              <h1 className="av-title text-[34px] md:text-[42px]">{title}</h1>
              <p className="av-dim">{result.mode === "daily" ? "Tageslauf · " : ""}{kit.name} · {DIFFICULTIES[result.difficulty]?.name}{result.ascension ? `+${result.ascension}` : ""} · {fmtTime(result.time)}</p>
              {result.deathCause && (
                <p className="mt-1 text-[15px]">
                  <span className="av-faint">Getötet von </span>
                  <span className={result.deathCause.boss || result.deathCause.champion ? "av-gold" : "av-blood"}>{result.deathCause.name}</span>
                  {result.deathCause.affixes.length > 0 && <span className="av-faint"> ({result.deathCause.affixes.join(", ")})</span>}
                </p>
              )}
            </div>
            <span className="ml-auto hidden sm:block"><FlatSprite kind="hero" id={kit.id} skin={result.skin || ""} size={84} /></span>
          </div>

          <dl className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            {[["Welten", result.stagesCleared], ["Bosse", result.stats.bossesKilled], ["Kills", result.stats.kills], ["Stufe", result.level],
              ["Schaden", Math.round(result.stats.damageDealt).toLocaleString("de-DE")], ["Erlitten", Math.round(result.stats.damageTaken).toLocaleString("de-DE")],
              ["Gold", result.stats.goldCollected.toLocaleString("de-DE")], ["Items", result.stats.itemsCollected]].map(([k, v]) => (
              <div key={k} className="av-slot py-2.5"><dt className="text-[12px] av-faint">{k}</dt><dd className="av-num text-[20px]">{v}</dd></div>
            ))}
          </dl>

          {(result.weapons?.length > 0 || result.talents?.length > 0) && (
            <div className="mt-5 flex flex-wrap gap-[10px]">
              {[...(result.weapons || []).map((w) => ({ ...w, kind: "weapon" })), ...(result.talents || []).map((t) => ({ ...t, kind: "talent" }))].map((u) => (
                <span key={`${u.kind}-${u.id}`} className="relative" title={(u.kind === "weapon" ? WEAPONS[u.id] : TALENTS[u.id])?.name}>
                  <UpgradeIcon kind={u.kind} id={u.id} size={34} /><span className="av-count av-num">{u.level}</span>
                </span>
              ))}
            </div>
          )}

          {result.items.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-[10px]">
              {result.items.map(({ id, n }) => (
                <span key={id} className="relative"><ItemIcon id={id} size={34} />{n > 1 && <span className="av-count av-num">{n}</span>}</span>
              ))}
            </div>
          )}

          <div className="mt-6 av-slot px-4 py-4">
            {s ? (
              <>
                <span className="av-title text-[18px]">+{s.xpGained} XP{s.levelAfter > s.levelBefore ? <span className="av-torch"> · Stufe {s.levelAfter}!</span> : ` · Stufe ${s.levelAfter}`}</span>
                <div className="av-xpbar mt-2.5"><i style={{ width: `calc(${pct * 100}% - 4px)` }} /></div>
                {s.score !== undefined && (
                  <div className="mt-4 flex flex-wrap items-baseline justify-between gap-3">
                    <span><span className="av-label">Punkte</span> <span className="av-title text-[26px] av-num ml-2">{s.score.toLocaleString("de-DE")}</span></span>
                    {s.isRecord
                      ? <span className="av-gold flex items-center gap-2"><Trophy size={15} /> Neuer persönlicher Rekord</span>
                      : <span className="av-dim av-num">Dein Rekord: {s.bestScore.toLocaleString("de-DE")}</span>}
                  </div>
                )}
                {s.isRecord && s.score === undefined && <p className="mt-3 av-gold flex items-center gap-2"><Trophy size={15} /> Neuer persönlicher Rekord</p>}
                {result.mode === "daily" && s.dailyBest != null && (
                  <p className="mt-2 av-dim av-num">Tageslauf · dein Bestwert heute: <span className="av-gold">{s.dailyBest.toLocaleString("de-DE")}</span></p>
                )}
                {s.newAchievements?.length > 0 && (
                  <ul className="mt-3 flex flex-col gap-1">
                    {s.newAchievements.map((a) => (
                      <li key={a.id} className="flex items-center gap-2 av-gold"><Medal size={15} /> Erfolg: {a.name}
                        {a.skin && <span className="av-dim text-[14px]">· Farbe „{SKINS[a.skin]?.name}" für {KITS[a.kit]?.name} frei</span>}
                      </li>
                    ))}
                  </ul>
                )}
                {s.newUnlocks.length > 0 && (
                  <ul className="mt-3 flex flex-col gap-1">
                    {s.newUnlocks.map((u) => <li key={u} className="flex items-center gap-2 av-moss"><Sparkles size={15} /> Neu frei: {u}</li>)}
                  </ul>
                )}
              </>
            ) : (
              <p className="av-blood">Die Wertung konnte nicht gespeichert werden{result.error ? `: ${result.error}` : ""}.</p>
            )}
          </div>

          <div className="mt-6 grid sm:grid-cols-2 gap-3">
            <button className="av-btn av-btn-lg" onClick={onAgain}><Play size={20} fill="currentColor" /> Nächster Lauf</button>
            <button className="av-btn av-btn-stone av-btn-lg" onClick={onMenu}><Home size={19} /> Hauptmenü</button>
          </div>
        </div>
      </div>
    </div>
  );
}
