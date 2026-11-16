// hud/TouchControls.jsx — adVentures am Handy: liegt über dem Spielfeld, solange auf einem Touch-Gerät gespielt wird
// (ui/touchDevice.js). Schreibt nur in den Runner (render/runner.js: setTouchMove/setTouchAim/setHeld/press), das
// Spiel selbst kennt keinen Touch.
//
//   linke Hälfte     Stick zum Laufen — erscheint dort, wo der Daumen aufsetzt
//   rechte Hälfte    ziehen = in diese Richtung zielen und angreifen; ohne Finger greift der Held den nächsten
//                    Gegner von selbst an (runner.buildInput)
//   unten rechts     Spezial (R), Zweitangriff (RMB), Bewegung (Leertaste), Ausrüstung (Q) — halten wie die Tasten
//   unten Mitte      „Benutzen“ (E), sobald es etwas zu benutzen gibt (Kiste, Schrein, Teleporter …)
//   oben links       Pause (wie Esc)
import React, { useEffect, useRef } from "react";
import { Pause } from "lucide-react";
import { AbilityIcon, EquipmentIcon } from "../ui/icons.jsx";
import { EQUIPMENT } from "../data/equipment.js";

const STICK_R = 58; // so weit darf der Knauf aus der Mitte (Bildpunkte)
const MOVE_DEAD = 0.18;
const AIM_DEAD = 0.28; // kleiner Ausschlag rechts = weiter automatisch zielen (Tippen soll nicht verreißen)

/** Finger-Ausschlag → Richtung (Länge ≤ 1) oder null innerhalb der toten Zone */
function vectorOf(dx, dy, dead) {
  const len = Math.hypot(dx, dy);
  const k = Math.min(1, len / STICK_R);
  if (k < dead) return null;
  return { x: (dx / len) * k, y: (dy / len) * k };
}

// Ein Stick-Feld: merkt sich den Finger, der darauf gelandet ist, und meldet seine Richtung
function useStick(onVector, dead) {
  const base = useRef(null);
  const knob = useRef(null);
  const finger = useRef(null);
  const show = (x, y, kx, ky) => {
    const b = base.current, k = knob.current;
    if (!b || !k) return;
    b.style.display = "block";
    b.style.transform = `translate(${x - STICK_R}px, ${y - STICK_R}px)`;
    k.style.transform = `translate(${kx}px, ${ky}px)`;
  };
  const handlers = {
    onPointerDown: (e) => {
      if (finger.current) return;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      const r = e.currentTarget.getBoundingClientRect();
      finger.current = { id: e.pointerId, x: e.clientX, y: e.clientY, ox: e.clientX - r.left, oy: e.clientY - r.top };
      show(finger.current.ox, finger.current.oy, 0, 0);
    },
    onPointerMove: (e) => {
      const f = finger.current;
      if (!f || f.id !== e.pointerId) return;
      let dx = e.clientX - f.x, dy = e.clientY - f.y;
      const len = Math.hypot(dx, dy);
      if (len > STICK_R) { dx = (dx / len) * STICK_R; dy = (dy / len) * STICK_R; }
      show(f.ox, f.oy, dx, dy);
      onVector(vectorOf(e.clientX - f.x, e.clientY - f.y, dead));
    },
  };
  const end = (e) => {
    if (!finger.current || finger.current.id !== e.pointerId) return;
    finger.current = null;
    if (base.current) base.current.style.display = "none";
    onVector(null);
  };
  handlers.onPointerUp = end;
  handlers.onPointerCancel = end;
  return { base, knob, handlers };
}

function SkillButton({ label, abilityId, slot, onDown, onUp, big = false }) {
  const cooling = slot && slot.charges <= 0;
  return (
    <button
      type="button"
      className={`av-touch-btn${big ? " av-touch-btn-big" : ""}`}
      onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture?.(e.pointerId); onDown(); }}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onContextMenu={(e) => e.preventDefault()}
      aria-label={label}
    >
      <AbilityIcon id={abilityId} size={big ? 34 : 28} />
      {slot?.max > 1 && <span className="av-count av-num">{slot.charges}</span>}
      {cooling && (
        <>
          <span className="av-skill-cd" style={{ height: `${(1 - slot.progress) * 100}%` }} />
          <span className="av-skill-time av-num">{Math.ceil(slot.left)}</span>
        </>
      )}
    </button>
  );
}

export default function TouchControls({ runnerRef, hud, kit, onPause }) {
  const runner = () => runnerRef.current;
  const move = useStick((v) => runner()?.setTouchMove(v), MOVE_DEAD);
  const aim = useStick((v) => runner()?.setTouchAim(v), AIM_DEAD);

  // Touch-Modus im Runner an, solange die Steuerung da ist (automatisches Zielen)
  useEffect(() => {
    runnerRef.current?.setTouchMode(true);
    const r = runnerRef.current;
    // Verschwindet die Steuerung (Stufenwahl, Pause) mit einem Finger auf einem Knopf, bliebe die Fähigkeit sonst gedrückt
    return () => {
      r?.setTouchMode(false);
      for (const k of ["secondary", "utility", "special"]) r?.setHeld(k, false);
    };
  }, [runnerRef]);

  const hold = (name) => ({ onDown: () => runner()?.setHeld(name, true), onUp: () => runner()?.setHeld(name, false) });
  const slots = hud?.slots || {};
  const eq = hud?.equipment;

  return (
    <div className="av-touch" aria-label="Touch-Steuerung">
      <div className="av-touch-zone av-touch-left" {...move.handlers}>
        <div ref={move.base} className="av-stick"><div ref={move.knob} className="av-stick-knob" /></div>
      </div>
      <div className="av-touch-zone av-touch-right" {...aim.handlers}>
        <div ref={aim.base} className="av-stick av-stick-aim"><div ref={aim.knob} className="av-stick-knob" /></div>
      </div>

      {/* Auf kleinen Bildschirmen sitzt Pause in der HUD-Leiste (onPause = null), hier nur auf Tablets */}
      {onPause && (
        <button type="button" className="av-touch-pause" onClick={onPause} aria-label="Pause">
          <Pause size={20} />
        </button>
      )}

      {hud?.prompt && (
        <button
          type="button"
          className="av-touch-use"
          onPointerDown={(e) => { e.preventDefault(); runner()?.press("interact"); }}
        >
          <span>{hud.prompt.text}</span>
          {hud.prompt.price > 0 && <span className={`av-num ${hud.prompt.canAfford ? "av-gold" : "av-blood"}`}>{hud.prompt.price} Gold</span>}
        </button>
      )}

      <div className="av-touch-skills">
        <SkillButton label={kit.abilities.special.name} abilityId={kit.abilities.special.id} slot={slots.special} big {...hold("special")} />
        <SkillButton label={kit.abilities.secondary.name} abilityId={kit.abilities.secondary.id} slot={slots.secondary} {...hold("secondary")} />
        <SkillButton label={kit.abilities.utility.name} abilityId={kit.abilities.utility.id} slot={slots.utility} {...hold("utility")} />
        {eq && (
          <button
            type="button"
            className="av-touch-btn"
            onPointerDown={(e) => { e.preventDefault(); runner()?.press("equipment"); }}
            aria-label={EQUIPMENT[eq.id]?.name || "Ausrüstung"}
          >
            <EquipmentIcon id={eq.id} size={34} />
            {eq.left > 0 && (
              <>
                <span className="av-skill-cd" style={{ height: `${Math.min(1, eq.left / EQUIPMENT[eq.id].cd) * 100}%` }} />
                <span className="av-skill-time av-num">{Math.ceil(eq.left)}</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
