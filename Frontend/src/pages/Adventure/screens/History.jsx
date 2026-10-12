// screens/History.jsx — die letzten 20 Läufe (vom Server, /api/adventure/history): Ergebnis, Punkte, Waffen, Items und
// woran man gestorben ist.

import React, { useEffect, useState } from "react";
import { ArrowLeft, Trophy, CalendarDays } from "lucide-react";
import { KITS } from "../data/kits.js";
import FlatSprite from "../ui/FlatSprite.jsx";
import { DIFFICULTIES } from "../engine/difficulty.js";
import { WEAPONS } from "../data/weapons.js";
import { ITEMS } from "../data/items.js";
import { ItemIcon, UpgradeIcon } from "../ui/icons.jsx";
import { fmtTime } from "../engine/util.js";
import { api } from "../api.js";

const fmtDate = (ms) => new Date(ms).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export default function History({ onBack }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    api.history().then((r) => setRows(Array.isArray(r) ? r : [])).catch((e) => { setError(e.message); setRows([]); });
  }, []);

  return (
    <div className="absolute inset-0 overflow-y-auto av-scroll">
      <div className="w-full max-w-[1000px] mx-auto px-4 md:px-8 py-6 md:py-10">
        <div className="flex items-center gap-4 mb-6">
          <button onClick={onBack} className="av-btn av-btn-stone av-btn-sm"><ArrowLeft size={15} /> Zurück</button>
          <h1 className="av-title text-[28px] md:text-[36px]">Verlauf</h1>
        </div>
        {rows === null && <p className="av-faint">Lädt …</p>}
        {error && <p className="av-blood mb-4">{error}</p>}
        {rows && rows.length === 0 && !error && <p className="av-slot px-4 py-6 text-center av-faint">Noch keine gewerteten Läufe.</p>}
        <ol className="flex flex-col gap-3">
          {(rows || []).map((r) => {
            const kit = KITS[r.kitId];
            return (
              <li key={r.at} className="av-block p-4">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  {kit && <FlatSprite kind="hero" id={kit.id} size={44} />}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {r.won && <Trophy size={15} className="av-gold" aria-label="Sieg" />}
                      {r.mode === "daily" && <CalendarDays size={15} className="av-torch" aria-label="Tageslauf" />}
                      <span>{kit?.name} · {DIFFICULTIES[r.difficulty]?.name}{r.ascension ? `+${r.ascension}` : ""}</span>
                    </div>
                    <div className="text-[14px] av-dim av-num">
                      {fmtDate(r.at)} · {r.stages} {r.stages === 1 ? "Welt" : "Welten"} · {fmtTime(r.timeSec)} · {r.kills} Kills
                    </div>
                    {r.deathCause && (
                      <div className="text-[14px]">
                        <span className="av-faint">Getötet von </span>
                        <span className={r.deathCause.boss || r.deathCause.champion ? "av-gold" : "av-blood"}>{r.deathCause.name}</span>
                        {r.deathCause.affixes?.length > 0 && <span className="av-faint"> ({r.deathCause.affixes.join(", ")})</span>}
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="av-title text-[22px] av-num">{(r.score ?? 0).toLocaleString("de-DE")}</div>
                    <div className="av-label">Punkte</div>
                  </div>
                </div>
                {(r.weapons?.length > 0 || r.items?.length > 0) && (
                  <div className="mt-3 flex flex-wrap gap-[9px]">
                    {(r.weapons || []).filter((w) => WEAPONS[w.id]).map((w) => (
                      <span key={w.id} className="relative" title={WEAPONS[w.id].name}><UpgradeIcon kind="weapon" id={w.id} size={30} /><span className="av-count av-num">{w.level}</span></span>
                    ))}
                    {r.weapons?.length > 0 && r.items?.length > 0 && <span className="w-[2px] h-[30px] bg-[var(--av-line)] mx-1" />}
                    {(r.items || []).filter((it) => ITEMS[it.id]).map((it) => (
                      <span key={it.id} className="relative" title={ITEMS[it.id].name}><ItemIcon id={it.id} size={30} />{it.n > 1 && <span className="av-count av-num">{it.n}</span>}</span>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
