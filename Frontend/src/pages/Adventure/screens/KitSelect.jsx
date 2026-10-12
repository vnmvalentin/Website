// screens/KitSelect.jsx — Kit, Farbvariante und Schwierigkeit (mit Albtraum+) wählen. Gesperrte Kits zeigen, ab welcher
// Account-Stufe sie frei werden. Im Tageslauf (mode "daily") ist die Schwierigkeit fest auf Normal.

import React, { useMemo, useState } from "react";
import { ArrowLeft, Lock, Play, CalendarDays, Minus, Plus } from "lucide-react";
import { KITS, KIT_ORDER, SLOT_KEYS } from "../data/kits.js";
import { DIFFICULTIES } from "../engine/difficulty.js";
import { AbilityIcon } from "../ui/icons.jsx";
import { SKINS, SKIN_ORDER } from "../data/skins.js";
import FlatSprite from "../ui/FlatSprite.jsx";

const SLOT_NAMES = { primary: "Hauptangriff", secondary: "Zweitangriff", utility: "Bewegung", special: "Spezial" };

export default function KitSelect({ profile, mode = "normal", onBack, onStart, busy, error }) {
  const daily = mode === "daily";
  const unlocked = profile?.unlocks.kits || ["default"];
  const kitLevel = useMemo(() => Object.fromEntries((profile?.track || []).filter((u) => u.kind === "kit").map((u) => [u.id, u.level])), [profile]);
  const diffLevel = useMemo(() => Object.fromEntries((profile?.track || []).filter((u) => u.kind === "difficulty").map((u) => [u.id, u.level])), [profile]);
  const [kitId, setKitId] = useState(() => {
    try { const last = localStorage.getItem("av-last-kit"); if (last && unlocked.includes(last)) return last; } catch { /* egal */ }
    return "default";
  });
  const [difficulty, setDifficulty] = useState("normal");
  const [skinByKit, setSkinByKit] = useState(() => {
    try { return JSON.parse(localStorage.getItem("av-skins") || "{}") || {}; } catch { return {}; }
  });
  const maxAsc = profile?.ascension || 0;
  const [ascension, setAscension] = useState(maxAsc);
  const kit = KITS[kitId];
  const isUnlocked = unlocked.includes(kitId);
  const owned = new Set(profile?.achievements || []);
  const skinOpen = (s) => owned.has(`${s}_${kitId}`);
  const skin = skinByKit[kitId] && skinOpen(skinByKit[kitId]) ? skinByKit[kitId] : "";
  const diff = daily ? "normal" : difficulty;

  const chooseSkin = (s) => {
    const next = { ...skinByKit, [kitId]: s };
    setSkinByKit(next);
    try { localStorage.setItem("av-skins", JSON.stringify(next)); } catch { /* egal */ }
  };

  const start = () => {
    try { localStorage.setItem("av-last-kit", kitId); } catch { /* egal */ }
    onStart(kitId, diff, { mode, skin, ascension: diff === "hard" && !daily ? ascension : 0 });
  };

  return (
    <div className="absolute inset-0 overflow-y-auto av-scroll">
      <div className="w-full max-w-[1300px] mx-auto px-4 md:px-8 py-6 md:py-10">
        <div className="flex items-center gap-4 mb-6">
          <button onClick={onBack} className="av-btn av-btn-stone av-btn-sm"><ArrowLeft size={15} /> Zurück</button>
          <h1 className="av-title text-[28px] md:text-[36px]">{daily ? "Tageslauf" : "Kit wählen"}</h1>
        </div>
        {daily && (
          <p className="av-slot px-4 py-3 mb-6 flex items-center gap-3 av-dim leading-snug">
            <CalendarDays size={18} className="av-torch shrink-0" />
            Heute spielen alle dieselbe Welt ({profile?.daily?.day}). Immer auf Normal, alle Items im Pool, kein Startgeschenk —
            dein bester Versuch zählt für die Tagesbestenliste.
          </p>
        )}

        <div className="grid lg:grid-cols-[minmax(0,1fr)_420px] gap-8">
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 content-start">
            {KIT_ORDER.map((id) => {
              const k = KITS[id];
              const open = unlocked.includes(id);
              return (
                <button key={id} onClick={() => setKitId(id)} aria-pressed={kitId === id} className="av-seg-btn flex flex-col items-center gap-2 py-4">
                  <FlatSprite kind="hero" id={id} skin={skinByKit[id] && owned.has(`${skinByKit[id]}_${id}`) ? skinByKit[id] : ""} size={80} dim={!open} />
                  <span className="text-center">{k.name}</span>
                  <span className="text-[13px] av-faint text-center flex items-center gap-1">{open ? k.role : <><Lock size={12} /> Stufe {kitLevel[id] ?? "?"}</>}</span>
                </button>
              );
            })}
          </div>

          <div className="av-block p-5 md:p-6 self-start">
            <div className="flex items-center gap-4">
              <FlatSprite kind="hero" id={kit.id} skin={skin} size={100} dim={!isUnlocked} animate />
              <div>
                <h2 className="av-title text-[26px]">{kit.name}</h2>
                <p className="av-torch">{kit.role}</p>
              </div>
            </div>
            <p className="mt-3 av-dim leading-relaxed">{kit.blurb}</p>
            <dl className="mt-4 grid grid-cols-4 gap-2 text-center">
              {[["Leben", kit.hp], ["Tempo", kit.speed], ["Rüstung", kit.armor], ["Krit", `${Math.round(kit.crit * 100)} %`]].map(([k, v]) => (
                <div key={k} className="av-slot py-2"><dt className="text-[12px] av-faint">{k}</dt><dd className="av-num text-[17px]">{v}</dd></div>
              ))}
            </dl>
            <ul className="mt-4 flex flex-col divide-y divide-[var(--av-line)]">
              {Object.entries(kit.abilities).map(([slot, ab]) => (
                <li key={slot} className="flex gap-3 py-2.5">
                  <span className="relative av-skill !w-[44px] !h-[44px] shrink-0"><span className="av-key">{SLOT_KEYS[slot]}</span><AbilityIcon id={ab.id} size={20} /></span>
                  <div className="min-w-0">
                    <div>{ab.name} <span className="text-[13px] av-faint">· {SLOT_NAMES[slot]}{ab.cd ? ` · ${ab.cd} s` : ""}</span></div>
                    <div className="text-[14px] av-dim leading-snug">{ab.desc}</div>
                  </div>
                </li>
              ))}
            </ul>

            <h3 className="av-label mt-5 mb-2">Farbe</h3>
            <div className="flex gap-2">
              {["", ...SKIN_ORDER].map((s) => {
                const open = !s || skinOpen(s);
                return (
                  <button key={s || "normal"} disabled={!open} aria-pressed={skin === s} onClick={() => chooseSkin(s)} className="av-seg-btn !p-1.5 flex flex-col items-center gap-1 w-[72px]"
                    title={open ? (s ? SKINS[s].name : "Normal") : "Über einen Erfolg freischalten (Menü → Erfolge)"}>
                    <FlatSprite kind="hero" id={kit.id} skin={s} size={40} dim={!open} />
                    <span className="text-[12px]">{open ? (s ? SKINS[s].name : "Normal") : <Lock size={11} className="inline" />}</span>
                  </button>
                );
              })}
            </div>

            {!daily && <>
            <h3 className="av-label mt-5 mb-2">Schwierigkeit</h3>
            <div className="av-seg grid-cols-3">
              {Object.values(DIFFICULTIES).map((d) => {
                const open = profile?.unlocks.difficulties.includes(d.id) ?? d.id !== "hard";
                return (
                  <button key={d.id} disabled={!open} aria-pressed={difficulty === d.id} onClick={() => setDifficulty(d.id)} className="av-seg-btn" title={d.desc}>
                    <span className="block">{d.name}</span>
                    <span className="block text-[12px] av-faint">{open ? (d.id === "easy" ? "80 % XP" : d.id === "hard" ? "140 % XP" : "100 % XP") : `ab Stufe ${diffLevel[d.id] ?? "?"}`}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[14px] av-faint leading-snug">{DIFFICULTIES[difficulty].desc}</p>
            {difficulty === "hard" && maxAsc > 0 && (
              <div className="mt-3 av-slot px-3 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <span>Albtraum+ <span className="av-torch av-num">{ascension}</span> <span className="text-[13px] av-faint">· frei bis {maxAsc}</span></span>
                  <span className="flex gap-1.5">
                    <button className="av-btn av-btn-stone av-btn-sm" disabled={ascension <= 0} onClick={() => setAscension((a) => a - 1)} aria-label="Stufe runter"><Minus size={14} /></button>
                    <button className="av-btn av-btn-stone av-btn-sm" disabled={ascension >= maxAsc} onClick={() => setAscension((a) => a + 1)} aria-label="Stufe hoch"><Plus size={14} /></button>
                  </span>
                </div>
                {ascension > 0 && (
                  <ul className="mt-2 text-[13px] av-dim leading-snug flex flex-col gap-0.5">
                    {(profile?.ascensions || []).filter((a) => a.level <= ascension).map((a) => <li key={a.level}>{a.level}. {a.label}</li>)}
                    <li className="av-gold">Punkte ×{(1 + 0.25 * ascension).toFixed(2).replace(".", ",")}</li>
                  </ul>
                )}
              </div>
            )}
            </>}

            {error && <p className="mt-4 av-blood text-[15px]">{error}</p>}
            <button onClick={start} disabled={!isUnlocked || busy} className="av-btn av-btn-lg w-full mt-5">
              {isUnlocked ? <><Play size={20} fill="currentColor" /> Lauf starten</> : <><Lock size={18} /> Ab Stufe {kitLevel[kitId]}</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
