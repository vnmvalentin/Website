// screens/Codex.jsx — Nachschlagewerk: Items (gefundene mit Beschreibung, andere als "???"), Waffen & Talente, Ausrüstung,
// Gegner und Bosse.

import React, { useMemo, useState } from "react";
import { ArrowLeft, Lock } from "lucide-react";
import { ITEMS, ITEM_IDS, RARITY } from "../data/items.js";
import { EQUIPMENT, EQUIPMENT_IDS } from "../data/equipment.js";
import { ENEMIES, ELITE_AFFIXES } from "../data/enemies.js";
import { BOSSES } from "../data/bosses.js";
import { BIOMES } from "../data/biomes.js";
import { WEAPONS, WEAPON_IDS, TALENTS, TALENT_IDS, MAX_WEAPONS, MAX_TALENTS, EVOLUTION_IDS } from "../data/weapons.js";
import { ItemIcon, EquipmentIcon, UpgradeIcon } from "../ui/icons.jsx";
import FlatSprite from "../ui/FlatSprite.jsx";

const TABS = [["items", "Items"], ["weapons", "Waffen & Talente"], ["equipment", "Ausrüstung"], ["enemies", "Gegner"], ["bosses", "Bosse"]];
const RARITY_ORDER = ["common", "uncommon", "legendary", "boss"];
// Texte der älteren Eigenschaften (die neuen bringen ihren Text in data/enemies.js mit)
const ELITE_DESC = { feuer: "hinterlässt brennende Spuren", eis: "verlangsamt, explodiert beim Tod in Frost", blitz: "schießt Blitzkugeln, die betäuben", gift: "Treffer vergiften" };

export default function Codex({ profile, onBack }) {
  const [tab, setTab] = useState("items");
  const found = useMemo(() => new Set(profile?.discovered || []), [profile]);
  const lockLevel = useMemo(() => {
    const m = {};
    for (const u of profile?.track || []) if (u.kind === "items") for (const id of u.ids) m[id] = u.level;
    return m;
  }, [profile]);
  const level = profile?.level ?? 1;
  const itemCount = ITEM_IDS.filter((id) => found.has(id)).length;

  return (
    <div className="absolute inset-0 overflow-y-auto av-scroll">
      <div className="w-full max-w-[1200px] mx-auto px-4 md:px-8 py-6 md:py-10">
        <div className="flex items-center gap-4 mb-5">
          <button onClick={onBack} className="av-btn av-btn-stone av-btn-sm"><ArrowLeft size={15} /> Zurück</button>
          <h1 className="av-title text-[28px] md:text-[36px]">Kodex</h1>
          <span className="ml-auto av-dim av-num">{itemCount} / {ITEM_IDS.length} Items gefunden</span>
        </div>
        <div className="av-tabs mb-6" role="tablist">
          {TABS.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} className="av-tab" onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>

        {tab === "items" && RARITY_ORDER.map((r) => (
          <section key={r} className="mb-7">
            <h2 className="av-label mb-3" style={{ color: RARITY[r].color }}>{RARITY[r].name}</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {ITEM_IDS.filter((id) => ITEMS[id].rarity === r).map((id) => {
                const def = ITEMS[id];
                const known = found.has(id);
                const locked = lockLevel[id] && lockLevel[id] > level;
                return (
                  <div key={id} className="av-slot flex items-center gap-3 px-3 py-2.5">
                    <ItemIcon id={id} size={36} dim={!known} />
                    <div className="min-w-0">
                      <div style={{ color: known ? RARITY[r].color : "var(--av-faint)" }}>{known ? def.name : "???"}</div>
                      <div className="text-[13px] av-dim leading-snug">
                        {known ? def.desc(1) : locked ? <span className="flex items-center gap-1"><Lock size={12} /> Ab Stufe {lockLevel[id]} in Kisten</span> : r === "boss" ? "Fällt nur bei einem bestimmten Boss" : "Noch nicht gefunden"}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}

        {tab === "equipment" && (
          <div className="grid sm:grid-cols-2 gap-2">
            {EQUIPMENT_IDS.map((id) => {
              const def = EQUIPMENT[id];
              const locked = lockLevel[id] && lockLevel[id] > level;
              return (
                <div key={id} className="av-slot flex items-center gap-3 px-3 py-2.5">
                  <EquipmentIcon id={id} size={40} dim={locked} />
                  <div className="min-w-0">
                    <div>{def.name} <span className="text-[13px] av-faint">· {def.cd} s</span></div>
                    <div className="text-[13px] av-dim">{locked ? `Ab Stufe ${lockLevel[id]} in Ausrüstungstruhen` : def.desc}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === "weapons" && (
          <>
            <h2 className="av-label mb-3">Waffen · feuern von selbst, bis zu {MAX_WEAPONS} gleichzeitig</h2>
            <div className="grid sm:grid-cols-2 gap-2 mb-7">
              {WEAPON_IDS.map((id) => {
                const def = WEAPONS[id];
                return (
                  <div key={id} className="av-slot flex items-start gap-3 px-3 py-2.5">
                    <UpgradeIcon kind="weapon" id={id} size={40} />
                    <div className="min-w-0">
                      <div style={{ color: def.color }}>{def.name}</div>
                      <div className="text-[13px] av-dim leading-snug">{def.blurb}</div>
                      <div className="text-[13px] av-faint leading-snug mt-1">Stufe 1: {def.desc(def.levels[0])} · Stufe {def.levels.length}: {def.desc(def.levels.at(-1))}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            <h2 className="av-label mb-3">Evolutionen · Waffe auf Stufe 5 + passendes Talent</h2>
            <div className="grid sm:grid-cols-2 gap-2 mb-7">
              {EVOLUTION_IDS.map((id) => {
                const def = WEAPONS[id];
                return (
                  <div key={id} className="av-slot flex items-start gap-3 px-3 py-2.5">
                    <UpgradeIcon kind="weapon" id={id} size={40} />
                    <div className="min-w-0">
                      <div className="av-gold">{def.name} <span className="text-[13px] av-faint">· {WEAPONS[def.evolvedFrom].name} + {TALENTS[def.talent].name}</span></div>
                      <div className="text-[13px] av-dim leading-snug">{def.blurb} {def.desc(def.levels[0])}.</div>
                    </div>
                  </div>
                );
              })}
            </div>
            <h2 className="av-label mb-3">Talente · bis zu {MAX_TALENTS} gleichzeitig</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {TALENT_IDS.map((id) => {
                const def = TALENTS[id];
                return (
                  <div key={id} className="av-slot flex items-center gap-3 px-3 py-2.5">
                    <UpgradeIcon kind="talent" id={id} size={36} />
                    <div className="min-w-0">
                      <div style={{ color: def.color }}>{def.name} <span className="text-[13px] av-faint">· bis Stufe {def.max}</span></div>
                      <div className="text-[13px] av-dim leading-snug">Pro Stufe: {def.desc(1)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {tab === "enemies" && (
          <section className="mb-7">
            <h2 className="av-label mb-3">Elite-Eigenschaften · Elite haben eine, Champions zwei</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {Object.entries(ELITE_AFFIXES).map(([id, a]) => (
                <div key={id} className="av-slot flex items-center gap-3 px-3 py-2">
                  <span className="w-3 h-3 shrink-0" style={{ background: a.color }} />
                  <span><span style={{ color: a.color }}>{a.name}</span> <span className="text-[13px] av-dim">{a.desc || ELITE_DESC[id]}</span></span>
                </div>
              ))}
            </div>
          </section>
        )}

        {tab === "enemies" && BIOMES.filter((b) => !b.final).map((b) => (
          <section key={b.id} className="mb-7">
            <h2 className="av-label mb-3">{b.name}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {b.enemies.map(([id]) => (
                <div key={id} className="av-slot flex flex-col items-center gap-1 px-3 py-3">
                  <FlatSprite kind="enemy" id={id} size={64} />
                  <span className="text-center">{ENEMIES[id].name}</span>
                </div>
              ))}
            </div>
          </section>
        ))}

        {tab === "bosses" && (
          <div className="grid md:grid-cols-2 gap-3">
            {Object.entries(BOSSES).map(([id, def]) => {
              const world = BIOMES.find((b) => b.bosses.includes(id));
              const item = ITEMS[def.item];
              return (
                <div key={id} className="av-slot flex items-center gap-4 px-4 py-3">
                  <FlatSprite kind="boss" id={id} size={72} />
                  <div className="min-w-0">
                    <div className="av-title text-[18px]">{def.name}</div>
                    <div className="text-[14px] av-dim">{def.title} · {world?.name}</div>
                    <div className="mt-1 flex items-center gap-2 text-[13px]">
                      <ItemIcon id={def.item} size={22} dim={!found.has(def.item)} />
                      <span style={{ color: found.has(def.item) ? RARITY.boss.color : "var(--av-faint)" }}>{found.has(def.item) ? item.name : "???"}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
