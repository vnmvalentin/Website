// TouchControls.jsx — die Knöpfe auf dem Bildschirm fürs Handy: links ein Steuerkreuz (laufen und zielen, acht Richtungen),
// rechts Sprung, Dash und Grapple, oben eine Leiste mit „Zum Checkpoint“ (bewusst weit weg von den Daumen: ein versehentlicher
// Tipp kostet Zeit), der Anzeige und dem Knopf zum Verlassen. Liegt über dem Spielfeld der Vollbild-Ansicht (room/RaceView.jsx) und meldet nur Bits (client/touchInput.js).
//
// Zeiger-Ereignisse mit setPointerCapture: Jeder Finger gehört bis zum Loslassen seinem Knopf, auch wenn er herunterrutscht —
// so lassen sich Laufen, Springen und Dash gleichzeitig halten, und das Steuerkreuz folgt dem Daumen über seinen Rand hinaus.
import React, { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown, RotateCcw, X } from "lucide-react";
import { INPUT } from "../sim/inputBits.js";
import { setTouch, releaseTouch, padRichtung } from "./touchInput.js";

const PAD_PX = 148;
const PAD_TOTZONE = 0.12;      // Anteil der Kantenlänge um die Mitte, in dem nichts gedrückt ist

// Kein Markieren, kein Kontextmenü beim langen Drücken, kein Scrollen/Zoomen unter dem Finger
const FINGER = { touchAction: "none", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none", WebkitTapHighlightColor: "transparent" };
const FLAECHE = "border border-white/25 rounded-[6px] text-white/75";
const kein = (e) => e.preventDefault();

function fangen(e) {
  e.preventDefault();
  try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* Zeiger schon weg */ }
}

function Steuerkreuz() {
  const finger = useRef(null);
  const [richtung, setRichtung] = useState(0);

  const melden = (mask) => {
    setTouch("kreuz", mask);
    setRichtung(mask);
  };
  const lesen = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    melden(padRichtung(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2), r.width * PAD_TOTZONE));
  };
  const los = (e) => {
    if (finger.current !== e.pointerId) return;
    finger.current = null;
    melden(0);
  };
  const pfeil = (bit) => (richtung & bit ? "text-white" : "text-white/45");

  return (
    <div
      role="group"
      aria-label="Steuerkreuz: laufen und zielen"
      className={`relative ${FLAECHE} bg-white/[0.07]`}
      style={{ ...FINGER, width: PAD_PX, height: PAD_PX }}
      onPointerDown={(e) => {
        if (finger.current !== null) return;
        finger.current = e.pointerId;
        fangen(e);
        lesen(e);
      }}
      onPointerMove={(e) => { if (finger.current === e.pointerId) lesen(e); }}
      onPointerUp={los}
      onPointerCancel={los}
      onLostPointerCapture={los}
      onContextMenu={kein}
    >
      <ChevronLeft size={30} className={`absolute left-1.5 top-1/2 -translate-y-1/2 ${pfeil(INPUT.LEFT)}`} />
      <ChevronRight size={30} className={`absolute right-1.5 top-1/2 -translate-y-1/2 ${pfeil(INPUT.RIGHT)}`} />
      <ChevronUp size={30} className={`absolute top-1.5 left-1/2 -translate-x-1/2 ${pfeil(INPUT.UP)}`} />
      <ChevronDown size={30} className={`absolute bottom-1.5 left-1/2 -translate-x-1/2 ${pfeil(INPUT.DOWN)}`} />
      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-[4px] bg-white/10" aria-hidden="true" />
    </div>
  );
}

function Knopf({ id, bit, label, grund = "bg-white/[0.07]", className = "", style, children }) {
  const [an, setAn] = useState(false);
  const melden = (gedrueckt) => {
    setTouch(id, gedrueckt ? bit : 0);
    setAn(gedrueckt);
  };
  return (
    <button
      type="button"
      aria-label={label}
      className={`flex items-center justify-center ${FLAECHE} ${an ? "bg-white/30 text-white" : grund} font-bold uppercase tracking-wider ${className}`}
      style={{ ...FINGER, ...style }}
      onPointerDown={(e) => { fangen(e); melden(true); }}
      onPointerUp={() => melden(false)}
      onPointerCancel={() => melden(false)}
      onLostPointerCapture={() => melden(false)}
      onContextMenu={kein}
    >
      {children || label}
    </button>
  );
}

/** Höhe, die die obere Leiste (Checkpoint, Anzeige, Schließen) samt Abstand belegt */
export const TOUCH_LEISTE_PX = 56;

/**
 * @param hardcore  Hardcore-Runde: „Zum Checkpoint“ ist gesperrt (room/RaceView.jsx), der Knopf fehlt dann
 * @param anzeige   Inhalt der Mitte der oberen Leiste (Zeit, Checkpoint, Tode)
 * @param onClose   Vollbild verlassen (die Seite mit Rangliste und Knöpfen kommt zurück, der Lauf läuft weiter)
 */
export default function TouchControls({ hardcore = false, anzeige, onClose }) {
  // Verschwindet die Steuerung mitten im Druck (Lauf zu Ende, Vollbild verlassen), käme kein Loslassen mehr an
  useEffect(() => releaseTouch, []);

  return (
    <>
      <div className="absolute" style={{ left: "max(16px, env(safe-area-inset-left))", bottom: "max(16px, env(safe-area-inset-bottom))" }}>
        <Steuerkreuz />
      </div>
      <div
        className="absolute grid grid-cols-2 items-end justify-items-end gap-2.5"
        style={{ right: "max(16px, env(safe-area-inset-right))", bottom: "max(16px, env(safe-area-inset-bottom))" }}
      >
        <span />
        <Knopf id="grapple" bit={INPUT.GRAPPLE} label="Grapple" className="text-[11px]" style={{ width: 68, height: 68 }} />
        <Knopf id="dash" bit={INPUT.DASH} label="Dash" className="text-[11px]" style={{ width: 68, height: 68 }} />
        <Knopf id="jump" bit={INPUT.JUMP} label="Sprung" className="text-[13px]" style={{ width: 84, height: 84 }} />
      </div>
      <div
        className="absolute flex items-start justify-between gap-2"
        style={{ left: "max(8px, env(safe-area-inset-left))", right: "max(8px, env(safe-area-inset-right))", top: "max(8px, env(safe-area-inset-top))", height: TOUCH_LEISTE_PX - 16 }}
      >
        {hardcore ? <span /> : (
          <Knopf id="restart" bit={INPUT.RESTART} label="Zum Checkpoint" grund="bg-black/50" className="gap-1.5 px-2.5 text-[11px] h-full">
            <RotateCcw size={14} />Checkpoint
          </Knopf>
        )}
        <div className="min-w-0 h-full flex items-center pointer-events-none">{anzeige}</div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Vollbild verlassen"
          className={`flex items-center justify-center h-full aspect-square ${FLAECHE} bg-black/50`}
          style={FINGER}
        >
          <X size={18} />
        </button>
      </div>
    </>
  );
}
