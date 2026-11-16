// ui/table/GestureWheel.jsx — das Gestenrad: sechs feste Gesten statt eines Chats (Rebuild „Am Tisch“, Phase 3).
//
// Öffnet sich am Zeiger (Rechtsklick oder langes Drücken auf den Tisch) oder mit der Taste G in der Bildmitte.
// Wählen per Klick oder mit den Tasten 1–6; Esc oder ein Klick daneben schließt es wieder.
import React, { useEffect } from "react";
import { GESTURES } from "./masks.js";

/**
 * @param {{ at: { x: number, y: number }, onPick: (id: string) => void, onClose: () => void, omit?: string[] }} props
 *   omit: Gesten, die hier nicht gehen (Lobby: Zeigen — es liegt noch keine Karte)
 */
export default function GestureWheel({ at, onPick, onClose, omit = [] }) {
  const list = GESTURES.filter((g) => !omit.includes(g.id));
  useEffect(() => {
    const onKey = (e) => {
      const g = list.find((x) => x.key === e.key);
      if (g) { e.preventDefault(); e.stopPropagation(); onPick(g.id); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onPick, omit.join()]);

  // Das Rad bleibt ganz im Fenster
  const R = 118;
  const x = Math.min(window.innerWidth - R - 96, Math.max(R + 96, at.x));
  const y = Math.min(window.innerHeight - R - 40, Math.max(R + 40, at.y));
  return (
    <div className="st-wheel" role="menu" aria-label="Gesten" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }}>
      <div className="st-wheel-hub" style={{ left: x, top: y }}>
        {list.map((g, i) => {
          const a = (i / list.length) * Math.PI * 2 - Math.PI / 2;
          return (
            <button
              key={g.id}
              type="button"
              role="menuitem"
              className="st-wheel-item ss-paper"
              style={{ left: Math.cos(a) * R * 1.25, top: Math.sin(a) * R }}
              onClick={(e) => { e.stopPropagation(); onPick(g.id); }}
            >
              <span className="st-wheel-key">{g.key}</span>{g.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
