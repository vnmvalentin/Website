// ui/Umkleide.jsx — Anprobe vor dem Spiegel: Name, Farbe, Hut, Gesicht. Der eigene Blob im Zimmer trägt jede Änderung
// sofort (die Kamera schaut ihn vom Spiegel aus an); „Fertig“ übernimmt, „Abbrechen“ (oder Esc) stellt zurück.
// Die Listen kommen aus Worldflip/skins.js — derselbe Blob wie dort.
import React, { useEffect } from "react";
import { ChevronLeft, ChevronRight, Shuffle } from "lucide-react";
import { Link } from "react-router-dom";
import { LADEN_HUETE, SKIN_COLORS, SKIN_FACES, SKIN_HATS, randomSkin, waehlbareHuete } from "../../Worldflip/skins.js";
import { ladenSichtbar, useLadenBesitz } from "../../../utils/ladenBesitz.js";

// erlaubt: wählbare Indizes (Hüte: ohne nicht gekaufte aus dem Laden); ohne Angabe alle
function Wahl({ titel, namen, wert, onWert, erlaubt = null }) {
  const liste = erlaubt || namen.map((_, i) => i);
  const n = liste.length;
  const pos = Math.max(0, liste.indexOf(wert));
  return (
    <div className="sa-wahl">
      <span className="sa-label">{titel}</span>
      <div className="sa-wahl-zeile">
        <button type="button" className="sa-icon-btn sa-icon-sm" onClick={() => onWert(liste[(pos - 1 + n) % n])} aria-label={`${titel}: zurück`}>
          <ChevronLeft size={16} />
        </button>
        <span className="sa-wahl-name">{namen[wert]}</span>
        <button type="button" className="sa-icon-btn sa-icon-sm" onClick={() => onWert(liste[(pos + 1) % n])} aria-label={`${titel}: weiter`}>
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

export default function Umkleide({ entwurf, onAendern, onFertig, onAbbrechen }) {
  const { name, skin } = entwurf;
  const setze = (teil) => onAendern({ ...entwurf, skin: { ...skin, ...teil } });
  const besitz = useLadenBesitz("worldflip"); // Hüte aus dem Laden gelten hier wie in Worldflip
  const fehlen = Object.entries(LADEN_HUETE).filter(([, id]) => !besitz.has(id)).map(([h]) => SKIN_HATS[h]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onAbbrechen();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onAbbrechen]);

  return (
    <form
      className="sa-panel sa-umkleide"
      role="dialog"
      aria-label="Umkleide"
      onSubmit={(e) => {
        e.preventDefault();
        onFertig();
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-extrabold text-lg">Umkleide</h2>
        <button type="button" className="sa-btn sa-btn-sm sa-btn-ghost" onClick={() => onAendern({ ...entwurf, skin: randomSkin() })}>
          <Shuffle size={14} />Zufall
        </button>
      </div>
      <label className="grid gap-1">
        <span className="sa-label">Name</span>
        <input className="sa-input" value={name} maxLength={20} onChange={(e) => onAendern({ ...entwurf, name: e.target.value })} autoComplete="nickname" />
      </label>
      <div className="grid gap-1">
        <span className="sa-label">Farbe</span>
        <div className="sa-farben">
          {SKIN_COLORS.map((c, i) => (
            <button key={c.name} type="button" title={c.name} aria-label={c.name} aria-pressed={skin.c === i} style={{ background: c.hex }} onClick={() => setze({ c: i })} />
          ))}
        </div>
      </div>
      <Wahl titel="Hut" namen={SKIN_HATS} wert={skin.h} erlaubt={waehlbareHuete(besitz)} onWert={(h) => setze({ h })} />
      {fehlen.length > 0 && ladenSichtbar() && (
        <p className="sa-card-sub" style={{ marginTop: 0 }}>
          {fehlen.join(" und ")} gibt es im <Link to="/laden" className="underline underline-offset-2">Laden</Link>.
        </p>
      )}
      <Wahl titel="Gesicht" namen={SKIN_FACES} wert={skin.f} onWert={(f) => setze({ f })} />
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" className="sa-btn sa-btn-ghost" onClick={onAbbrechen}>Abbrechen</button>
        <button type="submit" className="sa-btn">Fertig</button>
      </div>
    </form>
  );
}
