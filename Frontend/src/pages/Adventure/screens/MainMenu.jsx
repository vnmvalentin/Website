// screens/MainMenu.jsx — Hauptmenü: links Titel, Lauf starten/fortsetzen, Account-Stufe und Menüpunkte; rechts eine
// kleine Szene und die Halle der Helden (beste Läufe nach Punkten — die rechnet der Server, siehe progression.js runScore).

import React, { useEffect, useState } from "react";
import { Play, Lock, BookOpen, MessageSquare, Library, Trophy, ChevronRight, Swords, CalendarDays, Medal, History as HistoryIcon } from "lucide-react";
import { KITS, KIT_ORDER } from "../data/kits.js";
import FlatSprite from "../ui/FlatSprite.jsx";
import { api } from "../api.js";
import { DIFFICULTIES } from "../engine/difficulty.js";
import { fmtTime } from "../engine/util.js";

function MenuButton({ icon: Icon, label, sub, onClick }) {
  return (
    <button onClick={onClick} className="av-menu-item">
      <Icon size={20} className="av-torch shrink-0" />
      <span className="flex-1 min-w-0">
        <span className="block">{label}</span>
        {sub && <span className="block text-[14px] av-faint">{sub}</span>}
      </span>
      <ChevronRight size={18} className="av-menu-arrow av-faint shrink-0" />
    </button>
  );
}

const SCOPES = [["all", "Gesamt"], ["week", "Diese Woche"], ["daily", "Tageslauf"]];

// Halle der Helden: lädt selbst, mit Filter nach Zeitraum und Kit (der Tageslauf hat keinen Kit-Filter)
function HallOfHeroes({ reloadKey }) {
  const [scope, setScope] = useState("all");
  const [kit, setKit] = useState("");
  const [rows, setRows] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    setRows(null);
    api.leaderboard(scope, scope === "daily" ? "" : kit)
      .then((r) => { if (alive) { setRows(Array.isArray(r) ? r : []); setFailed(false); } })
      .catch(() => { if (alive) { setRows([]); setFailed(true); } });
    return () => { alive = false; };
  }, [scope, kit, reloadKey]);

  return (
    <section className="av-block p-5 md:p-6" aria-labelledby="av-hof">
      <h2 id="av-hof" className="flex items-center gap-2 av-title text-[22px] mb-3"><Trophy size={20} className="av-gold" /> Halle der Helden</h2>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div className="av-tabs !gap-4" role="tablist">
          {SCOPES.map(([id, label]) => <button key={id} role="tab" aria-selected={scope === id} className="av-tab !py-1.5" onClick={() => setScope(id)}>{label}</button>)}
        </div>
        {scope !== "daily" && (
          <select value={kit} onChange={(e) => setKit(e.target.value)} className="av-input !w-auto !py-1.5 text-[15px]" aria-label="Nach Kit filtern">
            <option value="">Alle Kits</option>
            {KIT_ORDER.map((id) => <option key={id} value={id}>{KITS[id].name}</option>)}
          </select>
        )}
      </div>
      {rows === null ? (
        <p className="av-slot px-4 py-6 text-center av-faint">Lädt …</p>
      ) : rows.length === 0 ? (
        <p className="av-slot px-4 py-6 text-center av-faint">
          {failed ? "Bestenliste gerade nicht erreichbar." : scope === "daily" ? "Heute hat noch niemand den Tageslauf gespielt." : "Noch keine Einträge — dein nächster Lauf bringt dich hierher."}
        </p>
      ) : (
        <ol className="flex flex-col gap-1.5 max-h-[420px] av-scroll pr-1">
          {rows.map((e, i) => (
            <li key={`${e.name}-${i}`} className="av-slot flex items-center gap-3 px-3 py-2">
              <span className={`w-8 shrink-0 av-num ${i === 0 ? "av-gold" : i < 3 ? "av-torch" : "av-faint"}`}>#{i + 1}</span>
              {KITS[e.kitId] && <FlatSprite kind="hero" id={e.kitId} size={32} title={KITS[e.kitId].name} />}
              <span className="flex-1 min-w-0 truncate" title={e.name}>{e.name}<span className="av-faint text-[13px]"> · Stufe {e.level}</span></span>
              <span className="shrink-0 text-right leading-tight">
                <b className="block font-normal av-num text-[var(--av-ink)]">{(e.score ?? 0).toLocaleString("de-DE")}</b>
                <span className="block av-faint av-num text-[13px]">
                  {e.won && <Trophy size={12} className="inline av-gold mr-1 -mt-0.5" aria-label="Sieg" />}
                  {e.stages} {e.stages === 1 ? "Welt" : "Welten"} · {fmtTime(e.timeSec)}
                  {e.difficulty === "hard" ? ` · Albtraum${e.ascension ? `+${e.ascension}` : ""}` : e.difficulty === "easy" ? " · Entspannt" : ""}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export default function MainMenu({ profile, leaderboardKey, onNewRun, onDaily, onResume, onAbandon, onUnlocks, onCodex, onAchievements, onHistory, onHelp, onFeedback, busy, guestNote = null }) {
  const next = profile?.track.find((u) => u.level > profile.level);
  const run = profile?.activeRun;
  const runKit = run ? KITS[run.kitId] : null;
  const pct = profile ? profile.levelXp / profile.levelNeed : 0;

  return (
    <div className="absolute inset-0 overflow-y-auto av-scroll">
      <div className="min-h-full w-full max-w-[1400px] mx-auto px-4 md:px-8 py-8 md:py-12 grid lg:grid-cols-[minmax(0,470px)_minmax(0,1fr)] gap-10 lg:gap-16 items-center">
        <div>
          <p className="av-label mb-3">Roguelite · Kits · Waffen · Items · Bosse</p>
          <h1 className="av-title text-[34px] sm:text-[50px] xl:text-[56px] [text-shadow:4px_4px_0_var(--av-edge)]">
            ad<span className="av-torch">V</span>entures
          </h1>
          <p className="mt-4 av-dim max-w-[440px] leading-relaxed">
            Wähle ein Kit und kämpf dich durch fünf Welten bis zu Thunderwing. Jede Stufe gibt dir eine neue Waffe oder ein Talent,
            Kisten geben Items, die sich stapeln — aber die Zeit läuft, und mit ihr werden die Monster stärker.
          </p>

          {run && runKit ? (
            <div className="mt-7 flex flex-col gap-2">
              <button onClick={onResume} disabled={busy} className="av-btn av-btn-lg w-full">
                <Play size={20} fill="currentColor" /> Weiterspielen
              </button>
              <div className="flex items-center justify-between gap-3 text-[14px] av-dim px-1">
                <span>{runKit.name} · Welt {run.stageIndex + 1}{run.loop > 0 ? ` · Zyklus ${run.loop + 1}` : ""} · {fmtTime(run.time)} · {DIFFICULTIES[run.difficulty]?.name}</span>
                <button onClick={onAbandon} disabled={busy} className="av-blood hover:underline shrink-0">Aufgeben</button>
              </div>
              <button onClick={onNewRun} disabled={busy} className="av-btn av-btn-stone w-full mt-1"><Swords size={18} /> Neuer Lauf</button>
            </div>
          ) : (
            <button onClick={onNewRun} disabled={busy} className="av-btn av-btn-lg w-full mt-7">
              <Play size={20} fill="currentColor" /> Neuer Lauf
            </button>
          )}
          <button onClick={onDaily} disabled={busy} className="av-btn av-btn-stone w-full mt-3 !justify-between">
            <span className="flex items-center gap-2.5"><CalendarDays size={18} /> Tageslauf</span>
            <span className="text-[14px] av-num font-normal av-dim">
              {profile?.daily?.best ? `heute ${(profile.daily.best.score ?? 0).toLocaleString("de-DE")} Punkte` : "heute noch nicht gespielt"}
            </span>
          </button>

          {profile && (
            <div className="mt-6 av-slot px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="av-title text-[18px]">Stufe {profile.level}{profile.unlocks.title ? <span className="av-gold"> · {profile.unlocks.title}</span> : null}</span>
                <span className="text-[14px] av-faint av-num">{profile.levelXp} / {profile.levelNeed} XP</span>
              </div>
              <div className="av-xpbar mt-2"><i style={{ width: `calc(${pct * 100}% - 4px)` }} /></div>
              {next && (
                <div className="mt-2.5 flex items-center gap-2 text-[14px] av-dim">
                  <Lock size={14} className="av-faint shrink-0" /> Stufe {next.level}: {next.label}
                </div>
              )}
            </div>
          )}
          {/* Als Gast: Hinweis + Anmelden (AdventureGame.jsx) */}
          {guestNote}

          <nav className="mt-4 flex flex-col gap-2" aria-label="Hauptmenü">
            <MenuButton icon={Lock} label="Freischaltungen" sub="Kits, Items und Boni pro Stufe" onClick={onUnlocks} />
            <MenuButton icon={Medal} label="Erfolge" sub={profile ? `${profile.achievements.length} / ${profile.achievementDefs.length} · schalten Farbvarianten frei` : "Schalten Farbvarianten frei"} onClick={onAchievements} />
            <MenuButton icon={HistoryIcon} label="Verlauf" sub="Deine letzten 20 Läufe" onClick={onHistory} />
            <MenuButton icon={Library} label="Kodex" sub="Items, Waffen, Ausrüstung, Gegner, Bosse" onClick={onCodex} />
            <MenuButton icon={BookOpen} label="Handbuch" sub="Steuerung und Regeln" onClick={onHelp} />
            <MenuButton icon={MessageSquare} label="Feedback" sub="Bugs, Wünsche, Balance" onClick={onFeedback} />
          </nav>

        </div>

        <div className="flex flex-col gap-8">
          <div className="hidden sm:flex items-end justify-center gap-6 md:gap-10 h-[120px]" aria-hidden="true">
            <FlatSprite kind="hero" id="knight" size={100} animate />
            <FlatSprite kind="hero" id="wizard" size={100} animate />
            <FlatSprite kind="enemy" id="slime" size={70} animate />
            <FlatSprite kind="enemy" id="orc" size={110} animate />
            <FlatSprite kind="boss" id="thunderwing" size={130} animate />
          </div>

          <HallOfHeroes reloadKey={leaderboardKey} />
        </div>
      </div>
    </div>
  );
}
