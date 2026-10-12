// screens/Achievements.jsx — Erfolge. Oben die allgemeinen, darunter pro Kit die drei, die je eine Farbvariante
// freischalten (Vorschau eingefärbt). Definitionen kommen vom Server (profile.achievementDefs, Backend/adventure/meta.js).

import React from "react";
import { ArrowLeft, Check, Lock } from "lucide-react";
import { KITS, KIT_ORDER } from "../data/kits.js";
import { SKINS } from "../data/skins.js";
import FlatSprite from "../ui/FlatSprite.jsx";

export default function Achievements({ profile, onBack }) {
  if (!profile) return null;
  const owned = new Set(profile.achievements || []);
  const general = profile.achievementDefs.filter((a) => !a.kit);
  const perKit = profile.achievementDefs.filter((a) => a.kit);
  return (
    <div className="absolute inset-0 overflow-y-auto av-scroll">
      <div className="w-full max-w-[1100px] mx-auto px-4 md:px-8 py-6 md:py-10">
        <div className="flex items-center gap-4 mb-6">
          <button onClick={onBack} className="av-btn av-btn-stone av-btn-sm"><ArrowLeft size={15} /> Zurück</button>
          <h1 className="av-title text-[28px] md:text-[36px]">Erfolge</h1>
          <span className="ml-auto av-dim av-num">{owned.size} / {profile.achievementDefs.length}</span>
        </div>

        <h2 className="av-label mb-3">Allgemein</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 mb-8">
          {general.map((a) => {
            const done = owned.has(a.id);
            return (
              <div key={a.id} className="av-slot flex items-center gap-3 px-3 py-2.5">
                {done ? <Check size={18} className="av-moss shrink-0" aria-label="geschafft" /> : <Lock size={16} className="av-faint shrink-0" aria-label="offen" />}
                <div className="min-w-0" style={{ opacity: done ? 1 : 0.6 }}>
                  <div className={done ? "av-gold" : ""}>{a.name}</div>
                  <div className="text-[13px] av-dim leading-snug">{a.desc}</div>
                </div>
              </div>
            );
          })}
        </div>

        <h2 className="av-label mb-3">Farbvarianten · pro Kit</h2>
        <div className="grid md:grid-cols-2 gap-3">
          {KIT_ORDER.map((kitId) => (
            <div key={kitId} className="av-block p-4">
              <div className="flex items-center gap-3 mb-3">
                <FlatSprite kind="hero" id={kitId} size={40} />
                <span className="av-title text-[18px]">{KITS[kitId].name}</span>
              </div>
              <ul className="flex flex-col gap-2">
                {perKit.filter((a) => a.kit === kitId).map((a) => {
                  const done = owned.has(a.id);
                  return (
                    <li key={a.id} className="flex items-center gap-3">
                      <FlatSprite kind="hero" id={kitId} skin={a.skin} size={44} dim={!done} />
                      <div className="min-w-0 flex-1">
                        <div className={done ? "av-gold" : ""}>{SKINS[a.skin]?.name} <span className="text-[13px] av-faint">· {a.name}</span></div>
                        <div className="text-[13px] av-dim leading-snug">{a.desc}</div>
                      </div>
                      {done ? <Check size={16} className="av-moss shrink-0" /> : <Lock size={14} className="av-faint shrink-0" />}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
