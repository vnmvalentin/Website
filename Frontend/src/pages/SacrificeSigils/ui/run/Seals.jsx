// ui/run/Seals.jsx — Lebenssiegel als kleine Wachssiegel (SVG, Tuschestil). Verlorene Siegel sind gesprungen und blass.
import React, { useEffect, useRef, useState } from "react";

/** Ein Wachssiegel. @param {{ lost?: boolean, size?: number, breaking?: boolean }} props */
export function WaxSeal({ lost = false, size = 18, breaking = false }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={breaking ? "ss-seal-break" : undefined} aria-hidden>
      <path
        d="M12 2.5c2 .2 3 1.4 4.6 1.9 1.7.5 3.3 1.2 3.8 3 .6 1.8-.3 3.2-.2 4.8.1 1.7 1 3.4.1 5-.9 1.7-2.8 2-4.3 2.9-1.4.9-2.3 2.3-4 2.4-1.8.1-2.9-1.2-4.4-2-1.6-.8-3.5-1.2-4.3-2.9-.8-1.6.2-3.3.2-5S2.6 9.3 3.2 7.5c.6-1.8 2.3-2.4 4-2.9C8.8 4 9.9 2.7 12 2.5z"
        fill={lost ? "#4a3a30" : "#8e1b1b"}
        stroke={lost ? "#2a2018" : "#3a0a0a"}
        strokeWidth="1"
        opacity={lost ? 0.55 : 1}
      />
      <circle cx="12" cy="12" r="5.2" fill="none" stroke={lost ? "#6a5a48" : "#c0504a"} strokeWidth="0.9" />
      <path d="M9.5 12.5l2-3 2.5 4 1.5-2" fill="none" stroke={lost ? "#6a5a48" : "#e8a090"} strokeWidth="1" strokeLinecap="round" />
      {lost && <path d="M7 4l3 6-2 4 4 3-1 5" fill="none" stroke="#1a1612" strokeWidth="1.2" strokeLinejoin="round" />}
    </svg>
  );
}

/** Reihe von Siegeln. @param {{ left: number, total: number, size?: number }} props */
export default function Seals({ left, total, size = 16 }) {
  // Gerade verlorenes Siegel springt kurz (nur wenn sich die Zahl während der Anzeige verringert)
  const prev = useRef(left);
  const [breaking, setBreaking] = useState(/** @type {number|null} */ (null));
  useEffect(() => {
    if (left < prev.current) {
      setBreaking(left);
      const t = setTimeout(() => setBreaking(null), 800);
      prev.current = left;
      return () => clearTimeout(t);
    }
    prev.current = left;
    return undefined;
  }, [left]);
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${left} von ${total} Lebenssiegeln`} title={`${left} von ${total} Lebenssiegeln`}>
      {Array.from({ length: total }, (_, i) => <WaxSeal key={i} lost={i >= left} size={size} breaking={i === breaking} />)}
    </span>
  );
}
