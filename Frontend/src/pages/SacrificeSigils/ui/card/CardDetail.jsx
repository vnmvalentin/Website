// ui/card/CardDetail.jsx — vergrößerte Detailansicht: Karte groß, alle Sigil-Texte, Flavor, Stamm, Modifikatoren.
import React, { useEffect } from "react";
import { X } from "lucide-react";
import Card from "./Card.jsx";
import SigilIcon from "../icons/SigilIcon.jsx";
import { CARDS } from "../../engine/cards.js";
import { parseSigil } from "../../engine/sigils/index.js";
import { de } from "../../i18n/de.js";

const MOD_TEXT = {
  campfire: (m) => `Lagerfeuer: ${m.attack ? `+${m.attack} Angriff` : ""}${m.health ? `+${m.health} Leben` : ""}`,
  fuse: (m) => `Verschmolzen: +${m.attack}/+${m.health}`,
  sigilAdd: (m) => `Sigil erhalten: ${de.sigils[parseSigil(m.sigil).id]?.name}${parseSigil(m.sigil).n > 1 ? ` ${parseSigil(m.sigil).n}` : ""}`,
  sigilRemove: (m) => `Sigil entfernt: ${de.sigils[parseSigil(m.sigil).id]?.name}`,
  stat: (m) => `${m.attack ? `${m.attack > 0 ? "+" : ""}${m.attack} Angriff ` : ""}${m.health ? `${m.health > 0 ? "+" : ""}${m.health} Leben` : ""}`,
  cost: (m) => `Kosten ${m.delta > 0 ? "+" : ""}${m.delta}`,
  dread: () => "Tintenwitwe: jeder Kampf beginnt mit 1 Gewicht gegen dich",
  mark: (m) => (m.mark === "copied" ? "Kopie des Kopisten" : m.mark === "mirrored" ? "Spiegelbild aus dem Brunnen" : "Verflucht"),
};

/** Sigil-Liste mit Texten. @param {{ sigils: string[], auras?: string[] }} props */
export function SigilTexts({ sigils, auras = [] }) {
  const all = [...sigils.map((s) => ({ s, aura: false })), ...auras.filter((a) => !sigils.some((s) => parseSigil(s).id === parseSigil(a).id)).map((s) => ({ s, aura: true }))];
  if (!all.length) return <p className="text-sm opacity-60">Keine Sigils.</p>;
  return (
    <ul className="space-y-2">
      {all.map(({ s, aura }) => {
        const { id, n } = parseSigil(s);
        const t = de.sigils[id];
        return (
          <li key={`${s}${aura}`} className="flex gap-2 items-start">
            <SigilIcon sigil={s} size={30} aura={aura} />
            <div className="text-[0.95rem] leading-snug">
              <b className="ss-title font-normal">{t?.name}{id === "kerzendocht" || n > 1 ? ` ${n}` : ""}{aura ? " (Totem)" : ""}</b>
              <div>{id === "kerzendocht" ? t.desc.replace("X", String(n)) : t?.desc}</div>
              {t?.example && <div className="text-sm italic opacity-70">{t.example}</div>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * @param {{ card: any, unit?: any, auras?: string[], attack?: number, onClose: () => void }} props
 */
export default function CardDetail({ card, unit, auras = [], attack, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const def = CARDS[card.baseId] || card;
  const sigils = unit ? unit.sigils : card.sigils || def.sigils;
  const special = card.special ?? (typeof def.attack === "object" ? def.attack.special : null);
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/60 ss-fade-in" onClick={onClose} role="dialog" aria-modal="true" aria-label={def.name}>
      <div className="ss-paper max-w-[640px] w-full p-5 md:p-6 grid sm:grid-cols-[auto_1fr] gap-5" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto">
          <Card card={card} width={220} attack={attack} health={unit?.health} maxHealth={unit?.maxHealth} auras={auras} wick={unit?.wick} />
        </div>
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="ss-title !text-[var(--ink)] text-2xl leading-tight">{def.name}</p>
              <p className="text-sm opacity-70">{de.tribes[def.tribe]?.name} · {de.rarities[def.rarity]}{def.unique ? " · einzigartig" : ""}{card.cursed ? " · verflucht" : ""}</p>
            </div>
            <button type="button" className="ss-btn ss-btn-sm" onClick={onClose} aria-label="Schließen"><X size={16} /></button>
          </div>
          <p className="italic my-3 opacity-80">„{def.flavor}“</p>
          {special && <p className="mb-2 text-sm"><b>{de.specials[special].name}:</b> {de.specials[special].desc}</p>}
          <SigilTexts sigils={sigils || []} auras={auras} />
          {!!card.mods?.length && (
            <div className="mt-3 text-sm">
              <p className="ss-title font-normal">Veränderungen</p>
              <ul className="list-disc pl-5">
                {card.mods.map((m, i) => <li key={i}>{MOD_TEXT[m.kind]?.(m) || m.kind}</li>)}
              </ul>
            </div>
          )}
          {def.evolvesTo && CARDS[def.evolvesTo] && <p className="mt-3 text-sm">Folgeform: <b>{CARDS[def.evolvesTo].name}</b></p>}
          {unit && (unit.stunned || unit.glued > 0 || unit.submerged) && (
            <p className="mt-2 text-sm">{unit.submerged ? "Abgetaucht. " : ""}{unit.stunned ? "Greift im nächsten Zug nicht an. " : ""}{unit.glued > 0 ? `Festgeleimt (${unit.glued}).` : ""}</p>
          )}
        </div>
      </div>
    </div>
  );
}
