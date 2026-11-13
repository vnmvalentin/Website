// ui/SaisonzieleAnsicht.jsx — Reiter „Jahreszeit" im Missionsbrett: vier Ziele der
// laufenden Jahreszeit (Backend garden/core/saisonziele.js). Wer alle schafft,
// bekommt das Namensschild der Jahreszeit (Gold-Shop → Namensschild zum Ausrüsten).
// 06.11.: im Marktstand-Look (laden/Marktstand.jsx): Ziele als Zettel, Schilder als Sammlung.
import React, { useEffect, useState } from "react";
import { Zettel, Fortschritt } from "./laden/Marktstand";

const SAISON_NAME = { fruehling: "Frühling", sommer: "Sommer", herbst: "Herbst", winter: "Winter", alle: "alle vier" };
const SCHILD_NAME = { kirschbluete: "Kirschblüte", sonnenglut: "Sonnenglut", laubgold: "Laubgold", raureif: "Raureif", jahreskreis: "Jahreskreis" };
// Dieselben Farben wie in core/reskins.js / Renderer.js — für die Vorschau.
const SCHILD_FARBE = {
    kirschbluete: { bg: "#fdf2f8", bg2: "#fbcfe8", border: "#db2777", text: "#831843" },
    sonnenglut: { bg: "#fff7ed", bg2: "#fdba74", border: "#c2410c", text: "#7c2d12" },
    laubgold: { bg: "#fde68a", bg2: "#d97706", border: "#78350f", text: "#451a03" },
    raureif: { bg: "#f0f9ff", bg2: "#bae6fd", border: "#0369a1", text: "#0c4a6e" },
    jahreskreis: { bg: "#fbcfe8", bg2: "#bae6fd", border: "#6d28d9", text: "#3b0764" },
};
const HOLZ = "#3b2516";

function restzeit(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const t = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    return t > 0 ? `${t} T ${h} Std` : h > 0 ? `${h} Std ${m} Min` : `${m} Min`;
}

/** Namensschild-Vorschau: zwei Farben in harten Streifen statt Verlauf, eckig. */
function Schild({ id, aus = false, gross = false }) {
    const f = SCHILD_FARBE[id] || {};
    return (
        <span
            className={`inline-flex items-center justify-center border-[3px] font-bold ${gross ? "h-10 px-4 text-sm" : "h-8 px-3 text-[11px]"} ${aus ? "opacity-40 grayscale" : ""}`}
            style={{ background: `linear-gradient(135deg, ${f.bg} 0 50%, ${f.bg2 || f.bg} 50% 100%)`, borderColor: f.border, color: f.text, boxShadow: `0 3px 0 0 ${f.border}` }}
        >
            {SCHILD_NAME[id] || id}
        </span>
    );
}

function Hinweis({ children }) {
    return <div className="py-6 text-center text-sm text-[#f3e3c3]">{children}</div>;
}

export default function SaisonzieleAnsicht({ laden }) {
    const [daten, setDaten] = useState(null);
    const [fehler, setFehler] = useState(false);

    useEffect(() => {
        let aus = false;
        const holen = () => laden()
            .then((d) => { if (!aus) { setDaten(d); setFehler(false); } })
            .catch(() => { if (!aus) setFehler(true); });
        holen();
        const t = setInterval(holen, 15000);
        return () => { aus = true; clearInterval(t); };
    }, [laden]);

    if (fehler && !daten) return <Hinweis>Saisonziele konnten nicht geladen werden.</Hinweis>;
    if (!daten) return <Hinweis>Saisonziele werden geladen…</Hinweis>;

    const schonFrei = daten.sammlung?.find((s) => s.id === daten.belohnung)?.frei;
    const geschafft = daten.ziele.filter((z) => z.stand >= z.ziel).length;

    return (
        <div className="mt-3 space-y-5">
            <Zettel bereit={daten.fertig}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-[#8a5a32]">Saisonziele · {geschafft} von {daten.ziele.length}</div>
                        <div className="text-xl font-bold leading-tight text-[#3b2516]">{daten.name}</div>
                        <div className="mt-0.5 text-[11px] text-[#6e4426]">
                            {daten.fertig ? "Alle Ziele geschafft!" : `Schaff alle bis zum Ende der Jahreszeit — noch ${restzeit(daten.ende - Date.now())}.`}
                        </div>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                        <Schild id={daten.belohnung} aus={!schonFrei && !daten.fertig} gross />
                        <span className="text-[10px] font-bold text-[#6e4426]">{schonFrei ? "schon freigeschaltet" : "Belohnung"}</span>
                    </div>
                </div>
            </Zettel>

            <div className="grid gap-4 md:grid-cols-2">
                {daten.ziele.map((z) => {
                    const fertig = z.stand >= z.ziel;
                    return (
                        <Zettel key={z.typ} bereit={fertig}>
                            <div className="mb-2 flex items-start justify-between gap-2">
                                <span className="text-sm font-bold leading-tight text-[#3b2516]">{z.text}</span>
                                {fertig && <span className="shrink-0 border-2 bg-[#5faa45] px-1.5 text-[10px] font-bold text-white" style={{ borderColor: HOLZ }}>geschafft</span>}
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="flex-1"><Fortschritt wert={z.stand / z.ziel} fertig={fertig} /></div>
                                <span className="shrink-0 text-[11px] font-bold tabular-nums text-[#6e4426]">{z.stand.toLocaleString("de-DE")} / {z.ziel.toLocaleString("de-DE")}</span>
                            </div>
                        </Zettel>
                    );
                })}
            </div>

            <div>
                <div className="mb-2 inline-block border-[3px] px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider" style={{ borderColor: HOLZ, background: "#f3e3c3", color: HOLZ }}>
                    Deine Sammlung
                </div>
                <div className="flex flex-wrap gap-3 border-[3px] p-3" style={{ borderColor: HOLZ, background: "#5a3a22", boxShadow: `0 4px 0 0 ${HOLZ}` }}>
                    {(daten.sammlung || []).map((s) => (
                        <div key={s.id} className="flex flex-col items-center gap-1">
                            <Schild id={s.id} aus={!s.frei} />
                            <span className="text-[10px] font-bold text-[#c9b48a]">{SAISON_NAME[s.saison]}</span>
                        </div>
                    ))}
                </div>
                <p className="mt-2 text-[11px] text-[#e8d7a8]">
                    Freigeschaltete Namensschilder rüstest du im Gold-Shop unter „Namensschild“ aus. Jede Jahreszeit kommt alle vier Wochen wieder, und wer alle vier hat, bekommt „Jahreskreis“ dazu.
                </p>
            </div>
        </div>
    );
}
