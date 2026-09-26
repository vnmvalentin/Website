// ui/common/TurnTimer.jsx — Zug-Timer als abbrennende Kerze (Serverzeit + Uhrenabgleich).
import React, { useEffect, useState } from "react";

/** @param {{ timer: { deadline?: number, remaining: number, total: number, paused?: boolean } | undefined, clockOffset: number }} props */
export default function TurnTimer({ timer, clockOffset }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  if (!timer) return null;
  const remaining = timer.paused ? timer.remaining : Math.max(0, timer.deadline - (now + clockOffset));
  const frac = Math.max(0, Math.min(1, remaining / timer.total));
  const secs = Math.ceil(remaining / 1000);
  return (
    <div className={`ss-timer ${secs <= 10 ? "ss-low" : ""} ${timer.paused ? "ss-paused" : ""}`} title={timer.paused ? "Timer pausiert" : `${secs} s`} aria-label={`Zeit: ${secs} Sekunden`}>
      <div className="ss-timer-candle"><div className="ss-timer-wax" style={{ height: `${Math.max(6, frac * 100)}%` }} /></div>
      <span className="ss-num text-lg">{timer.paused ? "⏸" : secs}</span>
    </div>
  );
}
