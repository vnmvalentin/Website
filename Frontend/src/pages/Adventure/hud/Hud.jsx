// hud/Hud.jsx — Anzeige über dem Spielfeld. Bekommt ~10× pro Sekunde den fertigen Zustand aus engine/game.js
// (hudState) und rechnet selbst nichts. Unten rechts bleibt frei: dort zeichnet der Renderer die Minikarte.
//
// Oben links Leben/Schild/XP/Gold, darunter Waffen/Talente und die Items, oben Mitte Boss oder Teleporter, oben rechts
// Zeit und Schwierigkeit, unten Mitte die Fähigkeiten und der Hinweis für E. Aufgehobene Items zeigt hud/ItemReveal.jsx.

import React, { useState } from "react";
import { ITEMS, RARITY } from "../data/items.js";
import { EQUIPMENT } from "../data/equipment.js";
import { SLOT_KEYS } from "../data/kits.js";
import FlatSprite from "../ui/FlatSprite.jsx";
import { WEAPONS, TALENTS, MAX_WEAPONS, MAX_TALENTS } from "../data/weapons.js";
import { ItemIcon, EquipmentIcon, AbilityIcon, UpgradeIcon } from "../ui/icons.jsx";
import { fmtTime } from "../engine/util.js";
import { CHARGE_TIME } from "../engine/stage.js";

function Bar({ value, max, color, label, extra = 0, extraColor }) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const ext = max > 0 ? Math.max(0, Math.min(1 - pct, extra / max)) : 0;
  return (
    <div className="av-bar">
      <i style={{ width: `calc(${pct * 100}% - ${pct > 0 ? 4 : 0}px)`, background: color }} />
      {ext > 0 && <i style={{ left: `calc(${pct * 100}% )`, width: `calc(${ext * 100}% - 2px)`, background: extraColor }} />}
      <span className="av-num">{label}</span>
    </div>
  );
}

function SkillSlot({ keyLabel, slot, abilityId }) {
  const cooling = slot.charges <= 0;
  return (
    <div className="av-skill" title={slot.name}>
      <span className="av-key">{keyLabel}</span>
      <AbilityIcon id={abilityId} size={24} />
      {slot.max > 1 && <span className="av-count av-num">{slot.charges}</span>}
      {cooling && (
        <>
          <div className="av-skill-cd" style={{ height: `${(1 - slot.progress) * 100}%` }} />
          <div className="av-skill-time av-num">{Math.ceil(slot.left)}</div>
        </>
      )}
      {!cooling && slot.max > 1 && slot.charges < slot.max && (
        <div className="absolute left-0 right-0 bottom-0 h-[4px] bg-[var(--av-edge)]"><div className="h-full bg-[var(--av-torch)]" style={{ width: `${slot.progress * 100}%` }} /></div>
      )}
    </div>
  );
}

function ItemsGrid({ items }) {
  const [hover, setHover] = useState(null);
  return (
    <div className="relative flex flex-wrap gap-[9px] max-w-[372px] pointer-events-auto" onMouseLeave={() => setHover(null)}>
      {items.map(({ id, n }) => (
        <span key={id} className="relative" onMouseEnter={() => setHover({ id, n })}>
          <ItemIcon id={id} size={32} />
          {n > 1 && <span className="av-count av-num">{n}</span>}
        </span>
      ))}
      {hover && ITEMS[hover.id] && (
        <div className="av-tip" style={{ top: "calc(100% + 12px)", left: 0 }}>
          <div style={{ color: RARITY[ITEMS[hover.id].rarity].color }}>{ITEMS[hover.id].name} {hover.n > 1 ? `×${hover.n}` : ""}</div>
          <div className="text-[14px] av-dim mt-1 leading-snug">{ITEMS[hover.id].desc(hover.n)}</div>
        </div>
      )}
    </div>
  );
}

// Waffen (oben) und Talente (unten) mit Stufenbalken; leere Plätze zeigen, wie viele noch frei sind
function LoadoutRow({ kind, list, max, onHover }) {
  const defs = kind === "weapon" ? WEAPONS : TALENTS;
  return (
    <div className="flex items-center gap-[9px]">
      <span className="w-[54px] text-[11px] uppercase tracking-[0.1em] av-faint">{kind === "weapon" ? "Waffen" : "Talente"}</span>
      {Array.from({ length: max }, (_, i) => {
        const it = list[i];
        if (!it) return <span key={i} className="w-[36px] h-[36px] shrink-0 shadow-[inset_0_0_0_2px_var(--av-stone-3)]" />;
        const def = defs[it.id];
        const top = kind === "weapon" ? def.levels.length : def.max;
        return (
          <span key={it.id} className="relative" style={{ "--acc": def.color }} onMouseEnter={() => onHover({ kind, ...it })}>
            <UpgradeIcon kind={kind} id={it.id} size={36} />
            <span className="av-pips">{Array.from({ length: top }, (_, k) => <i key={k} className={k < it.level ? "on" : ""} />)}</span>
          </span>
        );
      })}
    </div>
  );
}

function Loadout({ weapons, talents }) {
  const [hover, setHover] = useState(null);
  if (!weapons.length && !talents.length) return null;
  const def = hover && (hover.kind === "weapon" ? WEAPONS[hover.id] : TALENTS[hover.id]);
  const text = def && (hover.kind === "weapon" ? def.desc(def.levels[hover.level - 1]) : def.desc(hover.level));
  return (
    <div className="relative av-hud-panel px-3 py-2.5 flex flex-col gap-2.5 pointer-events-auto" onMouseLeave={() => setHover(null)}>
      <LoadoutRow kind="weapon" list={weapons} max={MAX_WEAPONS} onHover={setHover} />
      <LoadoutRow kind="talent" list={talents} max={MAX_TALENTS} onHover={setHover} />
      {def && (
        <div className="av-tip" style={{ top: "calc(100% + 12px)", left: 0 }}>
          <div style={{ color: def.color }}>{def.name} · Stufe {hover.level}</div>
          <div className="text-[14px] av-dim mt-1 leading-snug">{text}</div>
        </div>
      )}
    </div>
  );
}

// Champion-Leiste und Zustände der Welt (Blutmond, Fluch) unter der Mitte oben
function WorldStatus({ hud }) {
  const c = hud.champion;
  if (!c && !hud.bloodMoon && !hud.curse) return null;
  return (
    <div className="flex flex-col items-center gap-2">
      {c && !hud.boss && (
        <div className="w-[min(380px,36vw)]">
          <div className="flex items-baseline justify-between gap-3 mb-1 text-[14px]">
            <span className="av-gold">{c.name}</span>
            <span className="av-faint truncate text-[12px]">{c.affixes.join(" · ")}</span>
          </div>
          <Bar value={c.hp} max={c.maxHp} color="#c9a022" label={`${Math.ceil(c.hp)}`} />
        </div>
      )}
      <div className="flex gap-2">
        {hud.bloodMoon > 0 && <span className="av-hud-panel px-3 py-1 text-[14px] av-num" style={{ color: "#ff5a4a" }}>Blutmond · {hud.bloodMoon} s</span>}
        {hud.curse && <span className="av-hud-panel px-3 py-1 text-[14px]" style={{ color: "#c49aff" }}>Verflucht · +50 % Beute</span>}
      </div>
    </div>
  );
}

function CenterTop({ hud }) {
  if (hud.boss) {
    const b = hud.boss;
    return (
      <div className="w-[min(560px,46vw)] av-hud-panel px-3 pt-2 pb-2.5">
        <div className="flex items-baseline justify-between gap-3 mb-1">
          <span className="av-title text-[18px]" style={{ color: b.phase2 ? "#ff5a4a" : "var(--av-ink)" }}>{b.name}</span>
          <span className="text-[13px] av-faint truncate">{b.title}</span>
        </div>
        <Bar value={b.hp} max={b.maxHp} color={b.phase2 ? "#ff5a4a" : "#d9473a"} label={`${Math.ceil(b.hp)} / ${Math.ceil(b.maxHp)}`} />
        {hud.tele.state === "charging" && <div className="mt-1.5 text-[13px] av-dim text-center av-num">Teleporter {Math.floor(hud.tele.charge * 100)} %</div>}
      </div>
    );
  }
  const t = hud.tele;
  let text = null;
  if (t.state === "idle") text = t.discovered ? "Finde Kisten — oder aktiviere den Teleporter" : "Erkunde die Welt und finde den Teleporter";
  if (t.state === "charging") text = `Teleporter lädt · ${Math.floor(t.charge * 100)} % · bleib im Kreis (noch ${Math.ceil((1 - t.charge) * CHARGE_TIME)} s)`;
  if (t.state === "ready") text = t.final ? "Sieg! Der Teleporter führt in den nächsten Zyklus" : "Teleporter bereit — mit E weiterreisen";
  if (!text) return null;
  return <div className="av-hud-panel px-4 py-2 text-[15px] av-num" style={{ color: t.state === "ready" ? "var(--av-moss)" : t.state === "charging" ? "var(--av-torch)" : "var(--av-dim)" }}>{text}</div>;
}

export default function Hud({ hud, kit, skin = "", banner }) {
  if (!hud) return null;
  const xpPct = hud.xpNext > 0 ? hud.xp / hud.xpNext : 0;
  const tierPct = Math.round(hud.tier.progress * 100);
  return (
    <div className="av-hud">
      {/* Oben links: Held, darunter Waffen/Talente und Items */}
      <div className="absolute top-4 left-4 flex flex-col gap-3 w-[300px]">
        <div className="av-hud-panel p-3">
          <div className="flex items-center gap-3">
            <div className="relative w-12 h-12 shrink-0 av-slot flex items-center justify-center">
              <FlatSprite kind="hero" id={kit.id} skin={skin} size={42} />
              <span className="absolute -bottom-2 -right-2 px-1 text-[12px] leading-[15px] bg-[var(--av-torch)] text-[#231305] av-num">{hud.level}</span>
            </div>
            <div className="flex-1 min-w-0">
              <Bar value={hud.hp} max={hud.maxHp} color={hud.hp / hud.maxHp < 0.3 ? "#ff5a4a" : "#c7392f"}
                label={`${Math.ceil(hud.hp)} / ${hud.maxHp}${hud.shield > 0 ? ` + ${Math.ceil(hud.shield)}` : ""}`} extra={hud.shield} extraColor="#5ec8ff" />
              <div className="av-xpbar mt-1.5"><i style={{ width: `calc(${xpPct * 100}% - 4px)` }} /></div>
            </div>
          </div>
          <div className="mt-2.5 flex items-center justify-between text-[15px]">
            <span className="flex items-center gap-1.5 av-gold av-num"><span className="av-coin" aria-hidden="true" />{hud.gold}</span>
            <span className="av-faint text-[13px] av-num">{hud.kills} Kills</span>
          </div>
        </div>
        <Loadout weapons={hud.weapons} talents={hud.talents} />
        <ItemsGrid items={hud.items} />
      </div>

      {/* Oben Mitte */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3">
        <CenterTop hud={hud} />
        <WorldStatus hud={hud} />
        {banner && (
          <div className="av-banner mt-6" key={banner.key}>
            <div className="av-title text-[34px]" style={{ color: banner.color || "var(--av-ink)" }}>{banner.title}</div>
            {banner.sub && <div className="mt-2 text-[17px] av-dim">{banner.sub}</div>}
          </div>
        )}
      </div>

      {/* Oben rechts: Zeit, Schwierigkeit, Welt */}
      <div className="absolute top-4 right-4 av-hud-panel p-3 w-[218px] text-right">
        <div className="av-title text-[30px] av-num">{fmtTime(hud.time)}</div>
        <div className="mt-1 text-[15px]" style={{ color: hud.tier.index >= 7 ? "#ff5a4a" : hud.tier.index >= 4 ? "var(--av-torch)" : "var(--av-ink)" }}>{hud.tier.label}</div>
        <div className="mt-1.5 flex gap-[3px] justify-end" aria-label={`Nächste Stufe ${tierPct} %`}>
          {Array.from({ length: 10 }, (_, i) => (
            <span key={i} className="w-[15px] h-[6px]" style={{ background: i < Math.round(hud.tier.progress * 10) ? "var(--av-torch)" : "var(--av-stone-3)" }} />
          ))}
        </div>
        <div className="mt-2 text-[14px] av-dim">{hud.loop > 0 ? `Zyklus ${hud.loop + 1} · ` : ""}Welt {hud.stageIndex + 1} · {hud.stageName}</div>
      </div>

      {/* Unten Mitte: Hinweis + Fähigkeiten */}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex flex-col items-center gap-4">
        {hud.prompt && (
          <div className="av-hud-panel px-4 py-2 flex items-center gap-3 text-[15px]">
            <span className="px-1.5 bg-[var(--av-ink)] text-[var(--av-edge)] text-[13px]">E</span>
            <span>{hud.prompt.text}</span>
            {hud.prompt.price > 0 && <span className={`av-num ${hud.prompt.canAfford ? "av-gold" : "av-blood"}`}>{hud.prompt.price} Gold</span>}
            {hud.prompt.sub && <span className="av-faint text-[13px] hidden md:inline">{hud.prompt.sub}</span>}
          </div>
        )}
        <div className="flex items-end gap-4">
          {["primary", "secondary", "utility", "special"].map((s) => (
            <SkillSlot key={s} keyLabel={SLOT_KEYS[s]} slot={hud.slots[s]} abilityId={kit.abilities[s].id} />
          ))}
          <div className="w-[3px] h-[46px] bg-[var(--av-line)] mx-1" />
          <div className="av-skill" title={hud.equipment ? EQUIPMENT[hud.equipment.id].name : "Keine Ausrüstung"}>
            <span className="av-key">{SLOT_KEYS.equipment}</span>
            {hud.equipment ? <EquipmentIcon id={hud.equipment.id} size={44} /> : <span className="text-[12px] av-faint">leer</span>}
            {hud.equipment && hud.equipment.left > 0 && (
              <>
                <div className="av-skill-cd" style={{ height: `${Math.min(1, hud.equipment.left / EQUIPMENT[hud.equipment.id].cd) * 100}%` }} />
                <div className="av-skill-time av-num">{Math.ceil(hud.equipment.left)}</div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
