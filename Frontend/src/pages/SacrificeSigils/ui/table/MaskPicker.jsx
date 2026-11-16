// ui/table/MaskPicker.jsx — Wahl der eigenen Maske (Rebuild „Am Tisch“, Phase 3).
// Die Maske trägt die Gestalt, als die einen das Gegenüber am neuen Tisch sieht — man selbst sieht sie nie. Deshalb
// zeigt die Auswahl kleine Vorschaubilder (erst bei Bedarf gerendert, scene/maskThumbs.js lädt three.js nach).
import React, { useEffect, useState } from "react";
import { MASKS, cleanMask } from "./masks.js";
import { usePrefs, setPrefs } from "../prefs.js";
import "./masks.css";

export default function MaskPicker() {
  const prefs = usePrefs();
  const current = cleanMask(prefs.mask);
  const [thumbs, setThumbs] = useState(/** @type {Record<string, string>} */ ({}));
  useEffect(() => {
    let alive = true;
    import("./scene/maskThumbs.js").then((m) => m.maskThumbs()).then((t) => { if (alive) setThumbs(t); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const chosen = MASKS.find((m) => m.id === current);
  return (
    <div className="st-masks">
      <p className="text-sm">Deine Maske <span className="opacity-70">– so sieht dich dein Gegenüber im Kampf</span></p>
      <div className="st-masks-grid" role="radiogroup" aria-label="Deine Maske">
        {MASKS.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={current === m.id}
            className={`st-mask ${current === m.id ? "st-mask-on" : ""}`}
            title={m.desc}
            onClick={() => setPrefs({ mask: m.id })}
          >
            {thumbs[m.id] ? <img src={thumbs[m.id]} alt="" width="72" height="72" /> : <span className="st-mask-blank" aria-hidden />}
            <span>{m.name}</span>
          </button>
        ))}
      </div>
      {chosen && <p className="text-xs opacity-70">{chosen.desc}</p>}
    </div>
  );
}
