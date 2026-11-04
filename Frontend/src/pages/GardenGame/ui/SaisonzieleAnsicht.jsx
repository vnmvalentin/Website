// ui/SaisonzieleAnsicht.jsx — Reiter „Jahreszeit" im Missionsbrett: vier Ziele der
// laufenden Jahreszeit (Backend garden/core/saisonziele.js). Wer alle schafft,
// bekommt das Namensschild der Jahreszeit (Gold-Shop → Nameplate zum Ausrüsten).
import React, { useEffect, useState } from "react";
import { Abschnitt, ProgressBar, LeerHinweis } from "./gardenUi";

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

function restzeit(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const t = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    return t > 0 ? `${t} T ${h} Std` : h > 0 ? `${h} Std ${m} Min` : `${m} Min`;
}

function Schild({ id, aus = false }) {
    const f = SCHILD_FARBE[id] || {};
    return (
        <span
            className={`inline-flex h-7 items-center justify-center rounded-lg border-2 px-3 text-[11px] font-bold ${aus ? "opacity-35 grayscale" : ""}`}
            style={{ background: `linear-gradient(135deg, ${f.bg}, ${f.bg2 || f.bg})`, borderColor: f.border, color: f.text }}
        >
            {SCHILD_NAME[id] || id}
        </span>
    );
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

    if (fehler && !daten) return <LeerHinweis>Saisonziele konnten nicht geladen werden.</LeerHinweis>;
    if (!daten) return <LeerHinweis>Saisonziele werden geladen…</LeerHinweis>;

    const schonFrei = daten.sammlung?.find((s) => s.id === daten.belohnung)?.frei;

    return (
        <div className="space-y-3">
            <div className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 ${daten.fertig ? "border-emerald-700 bg-emerald-950/30" : "border-slate-800 bg-slate-900/50"}`}>
                <div className="min-w-0">
                    <div className="text-sm font-semibold text-white">{daten.name}: Saisonziele</div>
                    <div className="text-[11px] text-slate-400">
                        {daten.fertig ? "Alle Ziele geschafft!" : `Schaff alle vier bis zum Ende der Jahreszeit (noch ${restzeit(daten.ende - Date.now())}).`}
                    </div>
                </div>
                <div className="shrink-0 text-right">
                    <Schild id={daten.belohnung} aus={!schonFrei && !daten.fertig} />
                    <div className="mt-0.5 text-[10px] text-slate-500">{schonFrei ? "schon freigeschaltet" : "Belohnung"}</div>
                </div>
            </div>

            <div className="space-y-2.5 px-1">
                {daten.ziele.map((z) => (
                    <div key={z.typ}>
                        <div className="mb-1 flex justify-between gap-2 text-xs">
                            <span className={z.stand >= z.ziel ? "text-emerald-300" : "text-slate-200"}>{z.text}</span>
                            <span className="shrink-0 tabular-nums text-slate-400">{z.stand.toLocaleString("de-DE")} / {z.ziel.toLocaleString("de-DE")}</span>
                        </div>
                        <ProgressBar value={z.stand / z.ziel} className={z.stand >= z.ziel ? "bg-emerald-500" : "bg-amber-500"} />
                    </div>
                ))}
            </div>

            <Abschnitt>Namensschilder der Jahreszeiten</Abschnitt>
            <div className="flex flex-wrap gap-2 px-1">
                {(daten.sammlung || []).map((s) => (
                    <div key={s.id} className="flex flex-col items-center gap-0.5">
                        <Schild id={s.id} aus={!s.frei} />
                        <span className="text-[10px] text-slate-500">{SAISON_NAME[s.saison]}</span>
                    </div>
                ))}
            </div>
            <p className="px-1 text-[11px] text-slate-500">
                Freigeschaltete Namensschilder rüstest du im Gold-Shop unter „Nameplate“ aus. Jede Jahreszeit kommt alle vier Wochen wieder. Wer alle vier hat, bekommt „Jahreskreis“ dazu.
            </p>
        </div>
    );
}
