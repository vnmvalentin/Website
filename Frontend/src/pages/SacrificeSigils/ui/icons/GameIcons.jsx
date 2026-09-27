// ui/icons/GameIcons.jsx — Ressourcen- und Werte-Symbole im Tusche-Stil.
import React from "react";

const ink = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" };

/** Roter Wachstropfen (Blut). */
export function BloodDrop({ size = 16, className = "" }) {
  return (
    <svg viewBox="0 0 16 20" width={size} height={size * 1.25} className={className} aria-hidden>
      <path d="M8 1C5 6 2 9 2 12.5a6 6 0 0012 0C14 9 11 6 8 1z" fill="#8e1b1b" stroke="#3a0a0a" strokeWidth="1" />
      <path d="M5 12c0-1.5.8-2.8 1.8-4" fill="none" stroke="#e8a090" strokeWidth="1" strokeLinecap="round" opacity="0.8" />
    </svg>
  );
}

export function Bone({ size = 18, className = "" }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden>
      <path d="M7 17l10-10M5 15a2.3 2.3 0 102.6 4.3A2.3 2.3 0 1011.9 17M13 6.9A2.3 2.3 0 1017.3 5a2.3 2.3 0 104.3 2.6" fill="#e8dfcc" stroke="#1a1612" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

export function CandleStub({ size = 18, className = "", lit = true }) {
  return (
    <svg viewBox="0 0 16 24" width={size * 0.67} height={size} className={className} aria-hidden>
      <path d="M4 11h8v11H4z" fill="#e8dfcc" stroke="#1a1612" strokeWidth="1.2" />
      <path d="M4 12c1 1 2 .5 2 2M10 11c0 2 1 2 2 2" fill="none" stroke="#a8966c" strokeWidth="1" />
      <path d="M8 11V8.5" stroke="#1a1612" strokeWidth="1" />
      {lit && <path className="ss-candle-flame" d="M8 2c-2 2.5-2 4.5 0 6.5 2-2 2-4 0-6.5z" fill="#f2b54a" stroke="#c07a1a" strokeWidth="0.6" />}
    </svg>
  );
}

/** Klauen (Angriff). */
export function Claw({ size = 18, className = "" }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden>
      <g {...ink} strokeWidth="1.8">
        <path d="M5 20C7 13 9 8 14 3" />
        <path d="M9 21c2-6 4-10 9-14" />
        <path d="M13 22c1-4 3-7 7-10" />
      </g>
    </svg>
  );
}

/** Herz aus Wachs (Leben). */
export function WaxHeart({ size = 18, className = "" }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden>
      <path d="M12 21C6 16 3 13 3 9a4.5 4.5 0 019-1.5A4.5 4.5 0 0121 9c0 4-3 7-9 12z" fill="#8e1b1b" stroke="#3a0a0a" strokeWidth="1.2" />
      <path d="M7 8.5c.5-1.5 1.8-2 3-1.8" fill="none" stroke="#e8a090" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

export function Shard({ size = 16, className = "" }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} className={className} aria-hidden>
      <path d="M8 1l5 5-3 9-6-4z" fill="#b08d57" stroke="#1a1612" strokeWidth="1" />
      <path d="M8 1L7 11M13 6L7 11" fill="none" stroke="#e8d5a8" strokeWidth="0.7" />
    </svg>
  );
}

export function Hammer({ size = 20, className = "" }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden>
      <g {...ink}>
        <path d="M4 20l9-9" />
        <path d="M11 5l4-2 6 6-2 4-3-1-5-5z" />
      </g>
    </svg>
  );
}

export function Weight({ size = 14, className = "" }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} className={className} aria-hidden>
      <path d="M4 6h8l2 8H2z" fill="#6b5230" stroke="#1a1612" strokeWidth="1" />
      <circle cx="8" cy="4" r="1.8" fill="none" stroke="#1a1612" strokeWidth="1" />
    </svg>
  );
}

/** Kosten-Anzeige einer Karte. @param {{ cost: { type: string, amount: number }, size?: number }} props */
export function CostBadge({ cost, size = 14 }) {
  if (cost.type === "blood") {
    if (cost.amount === 0) return <span className="ss-cost ss-cost-free" title="Kostenlos">·</span>;
    return (
      <span className="ss-cost ss-cost-blood" title={`${cost.amount} Blut`}>
        {Array.from({ length: cost.amount }, (_, i) => <BloodDrop key={i} size={size * 0.8} />)}
      </span>
    );
  }
  if (cost.type === "bones") {
    return <span className="ss-cost ss-cost-bones" title={`${cost.amount} Knochen`}><Bone size={size + 2} /><b className="ss-num">{cost.amount}</b></span>;
  }
  return <span className="ss-cost ss-cost-wax" title={`${cost.amount} Wachs`}><CandleStub size={size + 2} /><b className="ss-num">{cost.amount}</b></span>;
}

// ───────── Ersatz für Symbolzeichen (Runde 2, D3: keine Emojis im Modus) ─────────

/** Kleines Tusche-Icon aus Pfaden (Linienstärke 1,6, currentColor). */
function InkIcon({ size = 14, className = "", title, children, viewBox = "0 0 24 24" }) {
  return (
    <svg viewBox={viewBox} width={size} height={size} className={`inline-block align-[-0.15em] ${className}`} aria-hidden={title ? undefined : true} role={title ? "img" : undefined}>
      {title && <title>{title}</title>}
      <g {...ink}>{children}</g>
    </svg>
  );
}

export function PauseIcon(props) {
  return <InkIcon {...props}><path d="M9 5v14M15 5v14" strokeWidth="2.6" /></InkIcon>;
}
export function Hourglass(props) {
  return <InkIcon {...props}><path d="M6 3h12M6 21h12M7 3c0 5 10 6 10 9s-10 4-10 9M17 3c0 5-10 6-10 9s10 4 10 9" /></InkIcon>;
}
export function ShieldBark(props) {
  return <InkIcon {...props}><path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z" /><path d="M9 9c1 2 1 5 0 7M13 8c1 3 1 6 0 9" /></InkIcon>;
}
export function RushArrow(props) {
  return <InkIcon {...props}><path d="M12 20V5" /><path d="M6 11l6-6 6 6" /><path d="M8 20h8" /></InkIcon>;
}
export function Crown(props) {
  return <InkIcon {...props}><path d="M3 18l2-10 5 5 2-7 2 7 5-5 2 10z" fill="#b08d57" /><path d="M4 21h16" /></InkIcon>;
}
export function CheckMark(props) {
  return <InkIcon {...props}><path d="M4 13l5 5L20 6" strokeWidth="2.2" /></InkIcon>;
}
/** Pfeil nach links/rechts (Reihenfolge ändern). @param {{ dir: -1|1, size?: number }} props */
export function InkChevron({ dir, ...props }) {
  return <InkIcon {...props}><path d={dir < 0 ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} strokeWidth="2" /></InkIcon>;
}

/**
 * Zeichen für besondere Angriffswerte (Schwarmzahl, Knochenlast, Flammenmaß, Handschwere).
 * @param {{ special: string, size?: number, className?: string }} props
 */
export function SpecialMark({ special, size = 14, className = "" }) {
  const title = { schwarmzahl: "Schwarmzahl", knochenlast: "Knochenlast", flammenmass: "Flammenmaß", handschwere: "Handschwere" }[special] || "Besonderer Angriff";
  return (
    <InkIcon size={size} className={className} title={title}>
      {special === "schwarmzahl" && <><circle cx="7" cy="9" r="2" /><circle cx="15" cy="7" r="2" /><circle cx="11" cy="15" r="2" /><circle cx="18" cy="15" r="1.5" /></>}
      {special === "knochenlast" && <><path d="M7 17l10-10" /><path d="M5 15a2.3 2.3 0 102.6 4.3A2.3 2.3 0 1011.9 17M13 6.9A2.3 2.3 0 1017.3 5a2.3 2.3 0 104.3 2.6" /></>}
      {special === "flammenmass" && <><path d="M12 3c-4 5-5 8-2 12 1-2 2-3 2-5 2 2 3 4 2 7 4-2 5-7-2-14z" /><path d="M8 21h8" /></>}
      {special === "handschwere" && <><path d="M7 20l-1-8 3-1 1 5M10 16l1-10 2 0 0 9M13 15l1-8 2 .5-.5 8M15.5 15.5l1.5-6 2 .5-2 9c-1 2-3 3-6 3H9" /></>}
      {!["schwarmzahl", "knochenlast", "flammenmass", "handschwere"].includes(special) && <path d="M12 5v14M5 12h14" />}
    </InkIcon>
  );
}
