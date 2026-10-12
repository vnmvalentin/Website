// screens/Unlocks.jsx — der Freischaltpfad: was es auf welcher Account-Stufe gibt. XP gibt es für jeden Lauf, auch für
// verlorene (Kills, geschaffte Welten, Bosse, Spielzeit; ein Sieg zählt extra).

import React from "react";
import { ArrowLeft, Check, Lock } from "lucide-react";
import { KITS } from "../data/kits.js";
import FlatSprite from "../ui/FlatSprite.jsx";
import { ITEMS } from "../data/items.js";
import { EQUIPMENT } from "../data/equipment.js";
import { ItemIcon, EquipmentIcon } from "../ui/icons.jsx";

function RewardVisual({ entry }) {
  if (entry.kind === "kit" && KITS[entry.id]) return <FlatSprite kind="hero" id={entry.id} size={44} />;
  if (entry.kind === "items") {
    return (
      <span className="flex gap-2">
        {entry.ids.map((id) => (ITEMS[id] ? <ItemIcon key={id} id={id} size={30} /> : EQUIPMENT[id] ? <EquipmentIcon key={id} id={id} size={30} /> : null))}
      </span>
    );
  }
  return null;
}

export default function Unlocks({ profile, onBack }) {
  if (!profile) return null;
  return (
    <div className="absolute inset-0 overflow-y-auto av-scroll">
      <div className="w-full max-w-[860px] mx-auto px-4 md:px-8 py-6 md:py-10">
        <div className="flex items-center gap-4 mb-2">
          <button onClick={onBack} className="av-btn av-btn-stone av-btn-sm"><ArrowLeft size={15} /> Zurück</button>
          <h1 className="av-title text-[28px] md:text-[36px]">Freischaltungen</h1>
        </div>
        <p className="av-dim mb-6 leading-relaxed">
          Jeder Lauf gibt Account-XP — auch verlorene. Es zählen Kills, geschaffte Welten, besiegte Bosse und die Spielzeit; ein Sieg über
          Thunderwing bringt 400 extra. Du bist auf <span className="av-torch">Stufe {profile.level}</span> ({profile.levelXp} / {profile.levelNeed} XP).
        </p>
        <ol className="av-block divide-y divide-[var(--av-line)]">
          {profile.track.map((u, i) => {
            const done = u.level <= profile.level;
            return (
              <li key={i} className="flex items-center gap-4 px-4 py-3" style={{ opacity: done ? 1 : 0.62 }}>
                <span className={`w-16 shrink-0 av-num ${done ? "av-torch" : "av-faint"}`}>Stufe {u.level}</span>
                <span className="w-[100px] shrink-0 flex justify-center"><RewardVisual entry={u} /></span>
                <span className="flex-1 min-w-0">{u.label}</span>
                {done ? <Check size={18} className="av-moss shrink-0" aria-label="frei" /> : <Lock size={16} className="av-faint shrink-0" aria-label="gesperrt" />}
              </li>
            );
          })}
        </ol>
        {profile.legacyHighScore > 0 && (
          <p className="mt-5 text-[14px] av-faint">Dein Rekord aus dem alten adVentures: Stage {profile.legacyHighScore}.</p>
        )}
      </div>
    </div>
  );
}
