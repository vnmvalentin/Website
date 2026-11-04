// Ladebildschirm.jsx — beim Betreten einer Welt. Dieselbe Kulisse und dieselben Holzschilder wie das Hauptmenü,
// statt eines festen Bildes mit eingebranntem (englischem) Titel. Der Balken bleibt unter 100 %, bis Bilder UND
// Farmdaten wirklich da sind (hooks/useWorldBoot.js).
import React, { useEffect, useState } from "react";
import FarmKulisse from "./FarmKulisse";

// Nur Dinge, die im Spiel wirklich so funktionieren (Tasten: siehe Einstellungen → Tastenkürzel).
const TIPPS = [
  "Halte Shift und zieh die Maus über reife Pflanzen, um viele auf einmal zu ernten.",
  "Mit Shift + 1, 2 und 3 springst du zum Markt, zum Shop-Areal und zurück auf deine Farm.",
  "Mit E oder der Leertaste öffnest du den Stand, vor dem du gerade stehst.",
  "Je mehr verschiedene Sorten auf deinem Acker wachsen, desto mehr bringt jede Ernte — bis zu +32 %.",
  "Saisonsorten bringen beim Ernten 50 % mehr. Welche gerade dran sind, zeigt die Jahreszeit oben rechts.",
  "Am Briefkasten eines Nachbarn kannst du ihm Gold, Samen oder Ernte hinterlassen.",
  "In der Kiste im Schuppen lagerst du Sachen, ohne Rucksackplätze zu belegen.",
  "Tab öffnet den Rucksack.",
];
const TIPP_DAUER_MS = 4500;

export default function Ladebildschirm({ label, progress }) {
  const [tipp, setTipp] = useState(() => Math.floor(Math.random() * TIPPS.length));
  useEffect(() => {
    const t = setInterval(() => setTipp((i) => (i + 1) % TIPPS.length), TIPP_DAUER_MS);
    return () => clearInterval(t);
  }, []);
  const prozent = Math.round(Math.max(0, Math.min(100, progress || 0)));

  return (
    <div className="gf-scene absolute inset-0 z-[120] flex items-center justify-center overflow-hidden p-4" role="status" aria-live="polite">
      <FarmKulisse />
      <div className="relative z-10 w-[min(540px,94vw)] text-center">
        <h1 className="gf-title mb-5 text-[52px] sm:text-[72px]">Virtual Farm</h1>
        <div className="gf-board p-4 text-left sm:p-5">
          <div className="gf-paper px-4 py-3">
            <div className="mb-2 flex items-baseline justify-between gap-3 font-bold">
              <span className="truncate">{label || "Bitte warten …"}</span>
              <span className="shrink-0 tabular-nums text-[var(--gf-ink-dim)]">{prozent} %</span>
            </div>
            <div className="h-5 overflow-hidden rounded-[10px] border-[3px] border-[var(--gf-wood-edge)] bg-[var(--gf-cream-2)]">
              <div className="h-full bg-[var(--gf-green)] transition-[width] duration-200" style={{ width: `${Math.max(4, prozent)}%` }} />
            </div>
          </div>
          <p className="mt-3 min-h-[3rem] text-[15px] font-semibold leading-snug">
            <span className="gf-label mr-2 text-amber-300">Tipp</span>
            {TIPPS[tipp]}
          </p>
        </div>
      </div>
    </div>
  );
}
