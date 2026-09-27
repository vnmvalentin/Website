// ui/run/BudgetWarning.jsx — deutliche Warnung, bevor das Pfad-Budget abläuft (60 s und 15 s, je einmal pro Pfad).
// Danach trifft der Server die offenen Entscheidungen selbst und spielt laufende Kämpfe mit der KI zu Ende.
import React, { useEffect, useRef, useState } from "react";
import { BUDGET_WARNINGS } from "../../data/modes/moorwanderung/budgets.js";
import { sound } from "../../audio/sound.js";

/** @param {{ timer: any, pathNo: number, active: boolean, clockOffset?: number }} props */
export default function BudgetWarning({ timer, pathNo, active, clockOffset = 0 }) {
  const [shown, setShown] = useState(/** @type {number|null} */ (null));
  const fired = useRef(/** @type {Set<string>} */ (new Set()));
  useEffect(() => {
    if (!timer?.deadline || !active) return undefined;
    const tick = () => {
      const left = (timer.deadline - (Date.now() + clockOffset)) / 1000;
      for (const w of BUDGET_WARNINGS) {
        const key = `${pathNo}:${w}`;
        if (left <= w && left > 0 && !fired.current.has(key)) {
          fired.current.add(key);
          setShown(w);
          sound.play("error");
          setTimeout(() => setShown((x) => (x === w ? null : x)), 4500);
        }
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [timer?.deadline, pathNo, active, clockOffset]);
  if (shown === null) return null;
  return (
    <div className="ss-banner ss-paper ss-budget-warn" role="alert">
      <p className="ss-title !text-[var(--wax-red)] text-2xl">Noch {shown} Sekunden</p>
      <p className="text-[var(--ink)]">Danach wählt das Moor für dich: offene Orte per Standardwahl, laufende Kämpfe spielt die KI zu Ende.</p>
    </div>
  );
}
