// hud/LevelUp.jsx — Wahl beim Stufenaufstieg (und am Schicksalsschrein): drei Karten (Waffe/Talent/Evolution/Item), Tasten 1–3 oder Klick, "Neu würfeln" gegen
// Gold. Das Spiel steht, solange das Fenster offen ist (engine/levelup.js). Die ersten 0,4 s nimmt es keine Eingabe an,
// damit ein Klick oder Tastendruck aus dem Kampf nicht aus Versehen eine Karte wählt.

import React, { useEffect, useRef, useState } from "react";
import { Dices } from "lucide-react";
import { WEAPONS, TALENTS } from "../data/weapons.js";
import { ITEMS, RARITY } from "../data/items.js";
import { UpgradeIcon, ItemIcon } from "../ui/icons.jsx";

const LOCK_MS = 400;

function cardText(c) {
  if (c.kind === "evolution") {
    const def = WEAPONS[c.id];
    return { name: def.name, color: "#f5cf4a", tag: `Evolution · ${WEAPONS[c.from].name} + ${TALENTS[def.talent].name}`, desc: `${def.blurb} ${def.desc(def.levels[0])}.` };
  }
  if (c.kind === "item") {
    const def = ITEMS[c.id];
    return { name: def.name, color: RARITY[def.rarity].color, tag: RARITY[def.rarity].name, desc: `${def.desc(1)}.` };
  }
  if (c.kind === "weapon") {
    const def = WEAPONS[c.id];
    const l = def.levels[c.level - 1];
    return { name: def.name, color: def.color, tag: c.level === 1 ? "Neue Waffe" : `Waffe · Stufe ${c.level}`, desc: c.level === 1 ? `${def.blurb} ${def.desc(l)}.` : `${def.desc(l)}.`, max: def.levels.length };
  }
  if (c.kind === "talent") {
    const def = TALENTS[c.id];
    return { name: def.name, color: def.color, tag: c.level === 1 ? "Neues Talent" : `Talent · Stufe ${c.level}`, desc: `${def.desc(c.level)}${c.level > 1 ? " insgesamt" : ""}.`, max: def.max };
  }
  if (c.kind === "gold") return { name: "Goldbeutel", color: "#f5cf4a", tag: "Alles ausgebaut", desc: `+${c.amount} Gold.` };
  return { name: "Heilquelle", color: "#7be06b", tag: "Alles ausgebaut", desc: `Heilt ${Math.round(c.amount * 100)} % deines Lebens.` };
}

export default function LevelUp({ offer, gold, onChoose, onReroll }) {
  const [ready, setReady] = useState(false);
  const openedRef = useRef(0);

  useEffect(() => {
    openedRef.current = performance.now();
    setReady(false);
    const t = setTimeout(() => setReady(true), LOCK_MS);
    return () => clearTimeout(t);
  }, [offer.level, offer.shrine]);

  useEffect(() => {
    const onKey = (e) => {
      if (performance.now() - openedRef.current < LOCK_MS) return;
      const n = Number(e.key);
      if (n >= 1 && n <= offer.choices.length) { e.preventDefault(); onChoose(n - 1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [offer, onChoose]);

  const canReroll = !offer.shrine && gold >= offer.rerollPrice && offer.choices.some((c) => c.kind === "weapon" || c.kind === "talent" || c.kind === "evolution");

  return (
    <div className="av-overlay z-30 bg-[rgb(10_9_13/0.6)]">
      <div className="w-full max-w-[860px] flex flex-col items-center">
        <div className="av-banner">
          <div className="av-label av-torch">{offer.shrine ? "Schicksalsschrein" : `Stufe ${offer.level}`}</div>
          <h2 className="av-title text-[34px] mt-1">{offer.shrine ? "Wähle ein Item" : "Wähle eine Verbesserung"}</h2>
          {offer.more > 0 && <div className="mt-1 text-[14px] av-dim">noch {offer.more} weitere Wahl{offer.more > 1 ? "en" : ""} danach</div>}
        </div>
        <div className="mt-6 grid gap-4 w-full sm:grid-cols-3">
          {offer.choices.map((c, i) => {
            const t = cardText(c);
            return (
              <button key={`${c.kind}-${c.id || i}`} disabled={!ready} onClick={() => onChoose(i)} className="av-upgrade" style={{ "--acc": t.color }}>
                <span className="av-key">{i + 1}</span>
                <span className="flex items-center gap-3">
                  {c.kind === "item" ? <ItemIcon id={c.id} size={56} />
                    : c.kind === "weapon" || c.kind === "talent" || c.kind === "evolution"
                    ? <UpgradeIcon kind={c.kind === "talent" ? "talent" : "weapon"} id={c.id} size={56} />
                    : <span className="av-item-icon text-[22px]" style={{ width: 56, height: 56, "--rar": t.color }}>{c.kind === "gold" ? "G" : "+"}</span>}
                  <span className="min-w-0 text-left">
                    <span className="block text-[12px] uppercase tracking-[0.12em]" style={{ color: t.color }}>{t.tag}</span>
                    <span className="block av-title text-[19px] mt-1 leading-tight">{t.name}</span>
                  </span>
                </span>
                {t.max > 1 && (
                  <span className="flex gap-[3px] mt-3" aria-label={`Stufe ${c.level} von ${t.max}`}>
                    {Array.from({ length: t.max }, (_, k) => (
                      <i key={k} className="h-[6px] flex-1" style={{ background: k < c.level - 1 ? t.color : k === c.level - 1 ? "var(--av-ink)" : "var(--av-stone-3)" }} />
                    ))}
                  </span>
                )}
                <span className="block mt-3 text-[15px] av-dim leading-snug text-left">{t.desc}</span>
              </button>
            );
          })}
        </div>
        {!offer.shrine && (
          <button className="av-btn av-btn-stone av-btn-sm mt-6" disabled={!ready || !canReroll} onClick={onReroll}>
            <Dices size={15} /> Neu würfeln · <span className={gold >= offer.rerollPrice ? "av-gold" : "av-blood"}>{offer.rerollPrice} Gold</span>
          </button>
        )}
        <p className="mt-3 text-[13px] av-faint">Tasten 1–3 wählen · das Spiel steht, bis du dich entscheidest</p>
      </div>
    </div>
  );
}
