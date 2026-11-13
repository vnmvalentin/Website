// components/Countdown.jsx — Restzeit bis zu einem Zeitpunkt (Ortszeit in ms) als m:ss, tickt jede Sekunde.
import React, { useEffect, useState } from "react";

export default function Countdown({ until }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);
  const left = Math.max(0, Math.ceil((until - now) / 1000));
  return <span className="fk-num">{Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</span>;
}
