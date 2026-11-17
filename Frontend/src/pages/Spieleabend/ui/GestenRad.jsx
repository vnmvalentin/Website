// ui/GestenRad.jsx — das Gesten-Rad: sieben Gesten im Kreis um die Bildmitte (Reihenfolge wie RAD in scene/gesten.js,
// Feld 0 oben, dann im Uhrzeigersinn — so wählt auch die Maus bei gefangenem Zeiger, zimmerSzene.js onMove).
// Taste G halten und Feld ansteuern, loslassen führt es aus; per Knopf geöffnet reicht ein Klick oder Tippen aufs Feld.
import React from "react";
import { Frown, Hand, Music, PartyPopper, Pointer } from "lucide-react";
import { RAD } from "../scene/gesten.js";

/** Zwei Hände, die gegeneinander klatschen (im Strich wie die übrigen Symbole). */
function Klatschen({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8.5 21c-2.5-1.2-4-3.6-4-6.4V9.5a1.5 1.5 0 0 1 3 0V12" />
      <path d="M7.5 12V5.5a1.5 1.5 0 0 1 3 0V11" />
      <path d="M15.5 21c2.5-1.2 4-3.6 4-6.4V9.5a1.5 1.5 0 0 0-3 0V12" />
      <path d="M16.5 12V5.5a1.5 1.5 0 0 0-3 0V11" />
      <path d="M12 2v1.5M9.2 2.6l.6 1.2M14.8 2.6l-.6 1.2" />
    </svg>
  );
}

/** Zensurbalken: Pixelmosaik statt Mittelfinger. */
function Zensiert({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {[
        [5, 4, 0.9], [9.5, 4, 0.55], [14, 4, 0.8],
        [5, 8.5, 0.6], [9.5, 8.5, 1], [14, 8.5, 0.5],
        [5, 13, 0.85], [9.5, 13, 0.65], [14, 13, 0.95],
        [7.25, 17.5, 0.7], [11.75, 17.5, 0.9],
      ].map(([x, y, o]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="4.5" height="4.5" fill="currentColor" opacity={o} />
      ))}
    </svg>
  );
}

const SYMBOLE = { winken: Hand, tanzen: Music, jubeln: PartyPopper, schmollen: Frown, klatschen: Klatschen, mittelfinger: Zensiert, zeigen: Pointer };

/**
 * @param {{ wahl: number | null, onWahl: (i: number) => void, onMachen: (id: string) => void, onZu: () => void, klein?: boolean }} props
 */
export default function GestenRad({ wahl, onWahl, onMachen, onZu, klein = false }) {
  const r = klein ? 104 : 122;
  return (
    <div
      className="sa-rad"
      role="menu"
      aria-label="Gesten"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onZu();
      }}
    >
      <div className="sa-rad-kreis">
        <div className="sa-rad-mitte">
          {wahl !== null ? RAD[wahl].name : "Geste"}
          <small>{klein ? "antippen" : "G loslassen · 1–7"}</small>
        </div>
        {RAD.map((g, i) => {
          const a = (i / RAD.length) * Math.PI * 2;
          const Symbol = SYMBOLE[g.id];
          return (
            <button
              key={g.id}
              type="button"
              role="menuitem"
              className={`sa-rad-feld${wahl === i ? " sa-an" : ""}`}
              style={{ transform: `translate(${Math.round(Math.sin(a) * r)}px, ${Math.round(-Math.cos(a) * r)}px) translate(-50%, -50%)` }}
              onPointerEnter={() => onWahl(i)}
              onClick={() => onMachen(g.id)}
              aria-label={`${g.name} (Taste ${i + 1})`}
            >
              <Symbol size={22} aria-hidden="true" />
              <span>{g.name}</span>
              {!klein && <kbd>{i + 1}</kbd>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
