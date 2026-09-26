// ui/battle/Scale.jsx — die Messingwaage. Kippt physikalisch (gedämpftes Federsystem mit Nachschwingen).
// Deine Schale ist links: Liegst du vorn, senkt sie sich. Bei 4 zittert die Waage.
import React, { useEffect, useRef } from "react";
import { usePrefs } from "../prefs.js";
import { SCALE_WIN } from "../../engine/battle.js";

const DEG_PER = 6.2;
const K = 0.06; // Federkonstante (pro Frame)
const C = 0.16; // Dämpfung (pro Frame) — leicht unterdämpft, schwingt sichtbar nach

/**
 * @param {{ value: number, compact?: boolean, labels?: [string, string] }} props value = Vorsprung aus deiner Sicht (−5…5)
 */
export default function Scale({ value, compact = false, labels = ["Du", "Gegner"] }) {
  const prefs = usePrefs();
  const beamRef = useRef(/** @type {SVGGElement|null} */ (null));
  const leftRef = useRef(/** @type {SVGGElement|null} */ (null));
  const rightRef = useRef(/** @type {SVGGElement|null} */ (null));
  const state = useRef({ a: 0, v: 0, target: 0 });
  const tense = Math.abs(value) >= SCALE_WIN - 1;

  useEffect(() => {
    // Deine Schale (links) sinkt bei Vorsprung → Balken dreht gegen den Uhrzeigersinn (negativer Winkel = links runter)
    state.current.target = -Math.max(-SCALE_WIN - 1, Math.min(SCALE_WIN + 1, value)) * DEG_PER;
    state.current.v += (state.current.target - state.current.a) * 0.08; // Stoß beim Einschlag der Gewichte
  }, [value]);

  useEffect(() => {
    let raf = 0;
    const L = 58;
    const place = (a) => {
      const rad = (a * Math.PI) / 180;
      beamRef.current?.setAttribute("transform", `rotate(${a.toFixed(2)} 80 40)`);
      const lx = 80 - Math.cos(rad) * L;
      const ly = 40 - Math.sin(rad) * L;
      const rx = 80 + Math.cos(rad) * L;
      const ry = 40 + Math.sin(rad) * L;
      leftRef.current?.setAttribute("transform", `translate(${(lx - 22).toFixed(2)} ${ly.toFixed(2)})`);
      rightRef.current?.setAttribute("transform", `translate(${(rx - 138).toFixed(2)} ${ry.toFixed(2)})`);
    };
    const loop = (t) => {
      const s = state.current;
      if (prefs.reduceMotion) {
        s.a = s.target;
        s.v = 0;
      } else {
        s.v += -K * (s.a - s.target) - C * s.v;
        s.a += s.v;
      }
      const jitter = tense && !prefs.reduceMotion ? Math.sin(t / 37) * 0.35 + Math.sin(t / 13) * 0.2 : 0;
      place(s.a + jitter);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [prefs.reduceMotion, tense]);

  const lead = Math.min(SCALE_WIN + 2, Math.abs(value));
  const weights = (n) => Array.from({ length: n }, (_, i) => {
    const row = Math.floor(i / 3);
    const col = i % 3;
    return <path key={i} d={`M${8 + col * 9 + row * 4} ${-2 - row * 6}h6l1.5 5h-9z`} fill="#6b5230" stroke="#1a1612" strokeWidth="0.8" />;
  });

  return (
    <div className={`ss-scale ${tense ? "ss-scale-tense" : ""}`} data-anchor="scale" aria-label={`Waage: ${value === 0 ? "ausgeglichen" : value > 0 ? `${value} zu deinen Gunsten` : `${-value} zugunsten des Gegners`}`} role="img">
      <svg viewBox="0 0 160 120" width={compact ? 150 : 210}>
        <defs>
          <linearGradient id="brass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e2c48c" /><stop offset="0.5" stopColor="#b08d57" /><stop offset="1" stopColor="#6b5230" /></linearGradient>
        </defs>
        {/* Sockel und Säule */}
        <path d="M58 116h44l-6-8H64z" fill="url(#brass)" stroke="#1a1612" strokeWidth="1" />
        <rect x="77" y="38" width="6" height="72" fill="url(#brass)" stroke="#1a1612" strokeWidth="1" />
        <circle cx="80" cy="30" r="5" fill="url(#brass)" stroke="#1a1612" strokeWidth="1" />
        {/* Balken */}
        <g ref={beamRef}>
          <path d="M20 38h120v4H20z" fill="url(#brass)" stroke="#1a1612" strokeWidth="1" />
          <circle cx="80" cy="40" r="4" fill="#3a2d20" stroke="#e2c48c" strokeWidth="1" />
          <path d="M76 40l4 -10l4 10" fill="none" stroke="#1a1612" strokeWidth="1" />
        </g>
        {/* Schalen (bleiben senkrecht) */}
        {[{ ref: leftRef, x: 22, mine: true }, { ref: rightRef, x: 138, mine: false }].map((pan) => (
          <g key={pan.x} ref={pan.ref}>
            <g transform={`translate(${pan.x} 0)`}>
              <path d="M0 0L-16 34M0 0L16 34M0 0v34" stroke="#3a2d20" strokeWidth="0.8" strokeDasharray="1.5 1" />
              <path d="M-20 34h40q-4 10 -20 10t-20 -10z" fill="url(#brass)" stroke="#1a1612" strokeWidth="1" />
              <g transform="translate(-17 34)">{weights(value !== 0 && (value > 0) === pan.mine ? lead : 0)}</g>
            </g>
          </g>
        ))}
      </svg>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 w-full px-1 text-xs ss-dim">
        <span className="truncate text-left">{labels[0]}</span>
        <span className="ss-num text-lg text-[var(--parchment-light)]">{value > 0 ? `+${value}` : value}</span>
        <span className="truncate text-right">{labels[1]}</span>
      </div>
    </div>
  );
}
