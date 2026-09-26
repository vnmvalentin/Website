// Seed-Galerie: 30 Welten auf einen Blick, gruppiert nach Welttyp.
//
// Wofür das da ist: Vielfalt lässt sich nicht an einer einzelnen Welt beurteilen. Erst dreißig
// Minikarten nebeneinander zeigen, ob zwei Welttypen wirklich verschieden sind oder nur derselbe
// Plan mit anderen Zahlen. Wenn man die Gruppen abdeckt und trotzdem nicht sagen kann, welche Karte
// zu welchem Typ gehört, ist der Umbau gescheitert — dann sieht man es hier und nirgends sonst.

import React, { useEffect, useRef, useState } from "react";
import { generateWorldAsync } from "./client/generateWorldAsync.js";
import { drawMinikarte } from "./client/worldOverview.js";
import { WELTTYPEN } from "./gen/world/registry.js";

const KACHEL = { w: 200, h: 78 };

function Minikarte({ eintrag, onWaehlen }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !eintrag.level) return;
    c.width = KACHEL.w;
    c.height = KACHEL.h;
    drawMinikarte(c.getContext("2d"), eintrag.level, KACHEL);
  }, [eintrag.level]);

  const kernideeLabel = eintrag.level?.meta.kernideeLabel;

  return (
    <button
      type="button"
      onClick={() => onWaehlen(eintrag)}
      className="block text-left bg-[#0b0b14] border border-white/10 hover:border-white/30 rounded-md overflow-hidden transition-colors"
      title={`${eintrag.seed} · ${eintrag.level?.meta.worldLabel || ""}${kernideeLabel ? ` · ${kernideeLabel}` : ""}`}
    >
      <canvas ref={ref} className="block" style={{ width: KACHEL.w, height: KACHEL.h }} />
      <div className="px-2 py-1.5 border-t border-white/10">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs text-white/70 truncate">{eintrag.seed}</span>
          <span className="text-[11px] text-white/35 tabular-nums shrink-0">
            {eintrag.level ? `${eintrag.level.width}×${eintrag.level.height}` : "…"}
          </span>
        </div>
        {kernideeLabel && <p className="text-[11px] text-violet-300/70 truncate mt-0.5">{kernideeLabel}</p>}
      </div>
    </button>
  );
}

/**
 * @param {{ length: string, speedClass: string, difficulty: number, anzahl?: number,
 *           onWaehlen: (e: {seed: string}) => void }} props
 */
export default function SeedGalerie({ length, speedClass, difficulty, anzahl = 30, onWaehlen }) {
  const [eintraege, setEintraege] = useState([]);
  const [laeuft, setLaeuft] = useState(false);
  const auftrag = useRef(0);

  useEffect(() => {
    const meiner = ++auftrag.current;
    setLaeuft(true);
    setEintraege([]);
    // Nacheinander statt alles auf einmal: Der Worker hat einen Faden, und so füllt sich die
    // Galerie sichtbar von vorn, statt dreißig Sekunden nichts zu zeigen.
    (async () => {
      const gesammelt = [];
      for (let i = 0; i < anzahl; i++) {
        const seed = `galerie-${i}`;
        try {
          const { level } = await generateWorldAsync({ seed, length, speedClass, difficulty }, { check: false });
          if (auftrag.current !== meiner) return;
          gesammelt.push({ seed, level });
          setEintraege([...gesammelt]);
        } catch {
          if (auftrag.current !== meiner) return;
        }
      }
      if (auftrag.current === meiner) setLaeuft(false);
    })();
  }, [length, speedClass, difficulty, anzahl]);

  // Nach Welttyp gruppieren — die Gruppen sind der eigentliche Zweck der Ansicht
  const gruppen = new Map();
  for (const e of eintraege) {
    const id = e.level?.meta.worldType || "?";
    if (!gruppen.has(id)) gruppen.set(id, []);
    gruppen.get(id).push(e);
  }

  return (
    <div className="bg-[#0d0d14] border border-white/10 rounded-md p-3">
      <div className="flex items-baseline justify-between mb-3 gap-3 flex-wrap">
        <h2 className="text-sm font-semibold text-white">Seed-Galerie</h2>
        <div className="flex items-baseline gap-3">
          <span className="text-xs text-white/35">
            {eintraege.length} von {anzahl}{laeuft ? " · wird erzeugt …" : ""}
          </span>
        </div>
      </div>

      {[...gruppen.entries()].map(([id, liste]) => (
        <section key={id} className="mb-4 last:mb-0">
          <div className="flex items-baseline gap-2 mb-2">
            <h3 className="text-sm text-white">{WELTTYPEN[id]?.label || id}</h3>
            <span className="text-xs text-white/35">{liste.length} Seeds</span>
            {WELTTYPEN[id] && (
              <span className="text-xs text-white/30 truncate">· {WELTTYPEN[id].beschreibung}</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {liste.map((e) => <Minikarte key={e.seed} eintrag={e} onWaehlen={onWaehlen} />)}
          </div>
        </section>
      ))}

      {!eintraege.length && <p className="text-sm text-white/45">Welten werden erzeugt …</p>}
    </div>
  );
}
