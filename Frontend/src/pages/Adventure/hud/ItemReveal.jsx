// hud/ItemReveal.jsx — großes Kärtchen über der Figur, wenn man ein Item oder eine Ausrüstung aufhebt. Das Spiel friert
// dazu kurz ein (render/runner.js hitstop); das Kärtchen bleibt etwas länger stehen, damit man den Text lesen kann.

import React from "react";
import { ITEMS, RARITY } from "../data/items.js";
import { EQUIPMENT } from "../data/equipment.js";
import { ItemIcon, EquipmentIcon } from "../ui/icons.jsx";

export default function ItemReveal({ reveal }) {
  if (!reveal) return null;
  const isEq = reveal.kind === "equipment";
  const def = isEq ? EQUIPMENT[reveal.id] : ITEMS[reveal.id];
  if (!def) return null;
  const color = isEq ? "var(--av-torch)" : RARITY[def.rarity].color;
  const tag = isEq ? "Ausrüstung · Taste Q" : RARITY[def.rarity].name;
  return (
    <div className="absolute left-1/2 top-[19%] -translate-x-1/2 z-20 pointer-events-none" key={reveal.key}>
      <div className="av-reveal" style={{ "--acc": color }}>
        {isEq ? <EquipmentIcon id={reveal.id} size={64} /> : <ItemIcon id={reveal.id} size={64} />}
        <div className="min-w-0">
          <div className="text-[12px] uppercase tracking-[0.12em]" style={{ color }}>{tag}{!isEq && reveal.count > 1 ? ` · ×${reveal.count}` : ""}</div>
          <div className="av-title text-[24px] mt-1 leading-tight" style={{ color }}>{def.name}</div>
          <div className="text-[15px] av-dim mt-1.5 leading-snug">{isEq ? def.desc : def.desc(reveal.count)}</div>
        </div>
      </div>
    </div>
  );
}
