// ui/card/Card.jsx — Kartenrahmen (komplett CSS/SVG), Format 5:7.
// Oben Name, darunter das Artwork-Fenster, Kosten oben rechts, unten Angriff (Klauen) links, Leben (Wachsherz) rechts,
// dazwischen bis zu 4 Sigil-Slots. Seltenheit über das Rahmenmaterial: Papier, Holzrand, Messingbeschläge, Messing mit Glut.
import React, { memo } from "react";
import CardArt from "./CardArt.jsx";
import SigilIcon from "../icons/SigilIcon.jsx";
import { Claw, WaxHeart, CostBadge } from "../icons/GameIcons.jsx";
import { CARDS } from "../../engine/cards.js";
import { de } from "../../i18n/de.js";
import { parseSigil } from "../../engine/sigils/index.js";
import "./card.css";

const SPECIAL_MARK = { schwarmzahl: "Σ", knochenlast: "⚲", flammenmass: "♨", handschwere: "✋" };

/**
 * @param {{
 *   card: any, width?: number, attack?: number|null, health?: number|null, maxHealth?: number|null,
 *   auras?: string[], faceDown?: boolean, selected?: boolean, marked?: boolean, dim?: boolean, glow?: boolean,
 *   wick?: number|null, submerged?: boolean, className?: string, style?: React.CSSProperties,
 *   onClick?: (e: any) => void, onDetail?: () => void, title?: string, uid?: string, tabIndex?: number,
 *   draggable?: boolean, onDragStart?: (e: any) => void, onDragEnd?: (e: any) => void,
 * }} props
 */
function Card(props) {
  const { card, width = 112, faceDown = false, selected, marked, dim, glow, className = "", style, onClick, onDetail, uid, tabIndex } = props;
  if (faceDown || !card) {
    return (
      <div className={`ss-card ss-card-back ${className}`} style={{ "--cw": `${width}px`, ...style }} data-uid={uid} onClick={onClick} aria-label="Verdeckte Karte">
        <div className="ss-card-back-inner"><span>S&amp;S</span></div>
      </div>
    );
  }
  const def = CARDS[card.baseId] || CARDS[card.id] || card;
  const baseAttack = typeof def.attack === "number" ? def.attack : 0;
  const special = card.special ?? (typeof def.attack === "object" ? def.attack.special : null);
  const atk = props.attack ?? (typeof card.attack === "number" ? card.attack : baseAttack);
  const hp = props.health ?? card.health ?? def.health;
  const maxHp = props.maxHealth ?? hp;
  const atkClass = special ? "" : atk > baseAttack ? "ss-up" : atk < baseAttack ? "ss-down" : "";
  const hpClass = hp < maxHp ? "ss-down" : hp > def.health ? "ss-up" : hp < def.health ? "ss-down" : "";
  const sigils = card.sigils || def.sigils || [];
  const auras = props.auras || [];
  const mods = card.mods || [];
  const fire = mods.filter((m) => m.kind === "campfire").reduce((a, m) => ({ attack: a.attack + (m.attack || 0), health: a.health + (m.health || 0) }), { attack: 0, health: 0 });
  const fused = mods.some((m) => m.kind === "fuse");
  const cursed = card.cursed || def.cursed;
  const copied = mods.some((m) => m.kind === "mark" && (m.mark === "copied" || m.mark === "mirrored"));
  const cost = card.cost || def.cost;
  const rarity = def.rarity || "common";
  const name = def.name;
  const artDef = { ...def, cursed };

  const handleKey = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick?.(e);
    } else if ((e.key === "i" || e.key === "?") && onDetail) {
      onDetail();
    }
  };

  // Long-Press öffnet die Detailansicht (Mobile)
  let pressTimer = null;
  const onPointerDown = (e) => {
    if (!onDetail || e.pointerType === "mouse") return;
    pressTimer = setTimeout(() => { pressTimer = null; onDetail(); }, 480);
  };
  const cancelPress = () => { if (pressTimer) clearTimeout(pressTimer); pressTimer = null; };

  return (
    <div
      className={`ss-card ss-r-${rarity} ${selected ? "ss-selected" : ""} ${marked ? "ss-marked" : ""} ${dim ? "ss-dimmed" : ""} ${glow ? "ss-glow" : ""} ${cursed ? "ss-cursed" : ""} ${props.submerged ? "ss-submerged" : ""} ${className}`}
      style={{ "--cw": `${width}px`, ...style }}
      data-uid={uid}
      onClick={onClick}
      onKeyDown={handleKey}
      onContextMenu={onDetail ? (e) => { e.preventDefault(); onDetail(); } : undefined}
      onPointerDown={onPointerDown}
      onPointerUp={cancelPress}
      onPointerLeave={cancelPress}
      onPointerCancel={cancelPress}
      tabIndex={tabIndex}
      role={onClick ? "button" : undefined}
      aria-label={`${name}, ${special ? de.specials[special].name : atk} Angriff, ${hp} Leben${sigils.length ? `, ${sigils.map((s) => de.sigils[parseSigil(s).id]?.name).join(", ")}` : ""}`}
      title={props.title}
      draggable={props.draggable}
      onDragStart={props.onDragStart}
      onDragEnd={props.onDragEnd}
    >
      <div className="ss-card-frame">
        <div className="ss-card-head">
          <span className="ss-card-name">{name}</span>
          <span className="ss-card-cost"><CostBadge cost={cost} size={Math.max(9, width / 9)} /></span>
        </div>
        <div className="ss-card-window">
          <CardArt def={artDef} />
          {fused && <svg className="ss-stitches" viewBox="0 0 100 76" preserveAspectRatio="none" aria-hidden><path d="M50 0 L50 76" stroke="#3a2a1a" strokeWidth="1.2" strokeDasharray="4 3" /><path d="M46 6l8 4M46 18l8 4M46 30l8 4M46 42l8 4M46 54l8 4M46 66l8 4" stroke="#3a2a1a" strokeWidth="1" /></svg>}
          {(fire.attack > 0 || fire.health > 0) && (
            <span className="ss-scar" title="Am Lagerfeuer verstärkt">+{fire.attack}/+{fire.health}</span>
          )}
          {copied && <span className="ss-stamp">Kopie</span>}
          {props.wick != null && <span className="ss-wick" title="Kerzendocht: verbleibende Zugenden">{props.wick}</span>}
        </div>
        <div className="ss-card-foot">
          <span className={`ss-stat ss-atk ${atkClass}`}>
            <Claw size={Math.max(10, width / 8.5)} />
            <b className="ss-num">{special && props.attack == null ? SPECIAL_MARK[special] : atk}</b>
          </span>
          <span className="ss-sigils">
            {sigils.slice(0, 4).map((s, i) => (
              <SigilIcon key={`${s}${i}`} sigil={s} size={Math.max(12, width / 5.4)} title={de.sigils[parseSigil(s).id]?.name} />
            ))}
            {auras.filter((a) => !sigils.some((s) => parseSigil(s).id === parseSigil(a).id)).slice(0, 2).map((s) => (
              <SigilIcon key={`aura${s}`} sigil={s} size={Math.max(12, width / 5.4)} aura title={`${de.sigils[parseSigil(s).id]?.name} (Totem)`} />
            ))}
          </span>
          <span className={`ss-stat ss-hp ${hpClass}`}>
            <b className="ss-num">{hp}</b>
            <WaxHeart size={Math.max(10, width / 8.5)} />
          </span>
        </div>
        {special && <span className="ss-special" title={de.specials[special].desc}>{de.specials[special].name}</span>}
      </div>
      {rarity === "legendary" && <span className="ss-embers" aria-hidden />}
    </div>
  );
}

export default memo(Card);
