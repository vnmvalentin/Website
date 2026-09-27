// ui/common/NpcPortrait.jsx — Porträt eines NPC oder Bosses: prozedurales Artwork im Stil der Karten (art/procedural.js),
// im ovalen Rahmen mit Namensschild. Bosse bekommen den legendären Rahmen (Glut, Ornamente).
import React, { useMemo } from "react";
import { artDataUri } from "../../art/procedural.js";
import { hashParts } from "../../engine/rng.js";

/** @param {{ npc: any, size?: number, boss?: boolean, showName?: boolean }} props */
export default function NpcPortrait({ npc, size = 120, boss = false, showName = true }) {
  const uri = useMemo(() => {
    if (!npc) return null;
    return artDataUri({
      id: `npc_${npc.id}`,
      name: npc.name,
      tribe: npc.tribes?.[0] || "stammlose",
      rarity: boss ? "legendary" : "rare",
      art: { silhouette: npc.silhouette || "construct", seed: hashParts("portrait", npc.id) % 100000, palette: npc.tribes?.[0] },
    });
  }, [npc, boss]);
  if (!npc) return null;
  return (
    <figure className={`ss-portrait ${boss ? "ss-portrait-boss" : ""}`} style={{ "--pw": `${size}px` }}>
      <div className="ss-portrait-frame"><img src={uri} alt="" draggable={false} /></div>
      {showName && <figcaption className="ss-title">{npc.name}</figcaption>}
    </figure>
  );
}
