// components/ReplayTag.jsx — Kennzeichnung der Torwiederholung über dem Feld, mit Knopf zum Überspringen
// (auch per Leertaste/Esc).
import React, { useEffect } from "react";
import { SkipForward } from "lucide-react";

export default function ReplayTag({ onSkip }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" || e.key === " ") {
        e.preventDefault();
        onSkip();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSkip]);
  return (
    <div className="fk-replay">
      <span className="fk-replay-tag"><span className="fk-replay-dot" />Wiederholung</span>
      <button type="button" className="fk-btn fk-btn-sm fk-btn-quiet" onClick={onSkip}>
        <SkipForward size={14} /> Überspringen
      </button>
    </div>
  );
}
