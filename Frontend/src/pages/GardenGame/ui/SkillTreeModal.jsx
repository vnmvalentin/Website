// ui/SkillTreeModal.jsx
// Der Fähigkeitsbaum.
//
// Der Bauplan kommt vom Server (GET /api/garden/skills) — hier steht bewusst keine
// einzige Prozentzahl im Code. Eine Anzeige, die etwas anderes verspricht als die
// Kasse auszahlt, wäre schlimmer als gar keine.
//
// Gezeichnet als drei Äste (links/mitte/rechts) mit einem gemeinsamen Stamm. Die
// Verbindungslinien liegen als SVG hinter den Karten und färben sich mit, sobald
// eine Fähigkeit offen ist — so sieht man den Weg nach oben, ohne ihn zu lesen.

import React, { useMemo } from 'react';
import { Lock, Check, Plus, RotateCcw } from 'lucide-react';
import { GardenModal } from './gardenUi';

const AST_REIHENFOLGE = ["links", "mitte", "rechts"];
const AST_FARBE = {
    links: { linie: "#0284c7", rand: "border-sky-600", text: "text-sky-300" },
    mitte: { linie: "#16a34a", rand: "border-emerald-600", text: "text-emerald-300" },
    rechts: { linie: "#d97706", rand: "border-amber-600", text: "text-amber-300" },
};

/** Prozentwert einer Stufe, so wie ihn der Server rechnet. */
function stufenText(skill, stufe) {
    const wert = skill.proStufe * stufe;
    if (skill.einheit === "prozent") return `+${Math.round(wert * 100)} %`;
    return `+${(Math.round(wert * 100) / 100).toFixed(2)}`;
}

function SkillKarte({ skill, stufe, level, punkteOffen, onLernen }) {
    const farbe = AST_FARBE[skill.seite] || AST_FARBE.mitte;
    const gesperrt = level < skill.ab;
    const voll = stufe >= skill.stufen;
    const kannLernen = !gesperrt && !voll && punkteOffen > 0;

    return (
        <div
            className={`relative w-full rounded-md border bg-slate-900/95 p-3 ${
                gesperrt ? "border-slate-800 opacity-60" : voll ? farbe.rand : "border-slate-700"
            }`}
        >
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <div className={`text-sm font-medium ${gesperrt ? "text-slate-500" : "text-white"}`}>
                        {skill.name}
                    </div>
                    <div className="mt-0.5 text-[11px] leading-snug text-slate-400">{skill.beschreibung}</div>
                </div>
                {gesperrt ? (
                    <span className="flex shrink-0 items-center gap-1 text-[10px] text-slate-500">
                        <Lock size={11} /> Lv {skill.ab}
                    </span>
                ) : voll ? (
                    <span className={`flex shrink-0 items-center gap-1 text-[10px] ${farbe.text}`}>
                        <Check size={11} /> max
                    </span>
                ) : null}
            </div>

            {/* Stufenbalken: eine Kachel je Stufe, gefüllte zuerst */}
            <div className="mt-2 flex items-center gap-1">
                {Array.from({ length: skill.stufen }, (_, i) => (
                    <span
                        key={i}
                        className={`h-1.5 flex-1 rounded-sm ${
                            i < stufe ? "bg-slate-300" : "bg-slate-800"
                        }`}
                    />
                ))}
            </div>

            <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-[11px] tabular-nums text-slate-400">
                    {stufe > 0 ? stufenText(skill, stufe) : "—"}
                    <span className="text-slate-600">
                        {" · "}Stufe {stufe}/{skill.stufen}
                    </span>
                </span>
                <button
                    type="button"
                    disabled={!kannLernen}
                    onClick={() => onLernen(skill.id)}
                    title={
                        gesperrt ? `Erst ab Level ${skill.ab}`
                            : voll ? "Voll ausgebaut"
                                : punkteOffen > 0 ? `Auf Stufe ${stufe + 1}: ${stufenText(skill, stufe + 1)}`
                                    : "Kein Fähigkeitspunkt übrig"
                    }
                    className={`flex shrink-0 items-center gap-1 rounded-sm border px-2 py-1 text-[11px] font-medium transition-colors ${
                        kannLernen
                            ? "border-violet-500 bg-violet-600 text-white hover:bg-violet-500"
                            : "cursor-default border-slate-800 bg-slate-900 text-slate-600"
                    }`}
                >
                    <Plus size={11} /> Punkt
                </button>
            </div>
        </div>
    );
}

export default function SkillTreeModal({ offen, onClose, katalog, stand, onLernen, onZuruecksetzen }) {
    const aeste = useMemo(() => {
        const raus = { links: [], mitte: [], rechts: [] };
        for (const skill of katalog || []) {
            (raus[skill.seite] || raus.mitte).push(skill);
        }
        // Innerhalb eines Astes von unten nach oben: das früheste Level zuerst.
        for (const seite of AST_REIHENFOLGE) raus[seite].sort((a, b) => a.ab - b.ab);
        return raus;
    }, [katalog]);

    if (!offen) return null;

    const level = stand?.level || 1;
    const punkteOffen = stand?.punkteOffen || 0;
    const xpHier = stand?.xpDiesesLevel || 0;
    const xpBraucht = stand?.xpFuersNaechste || 0;
    const anteil = xpBraucht > 0 ? Math.min(1, xpHier / xpBraucht) : 1;
    const hoechsteReihe = Math.max(...AST_REIHENFOLGE.map((s) => aeste[s].length), 1);

    return (
        <GardenModal
            onClose={onClose}
            title="Fähigkeiten"
            subtitle="Jede Ernte bringt Erfahrung. Jedes Level bringt einen Punkt."
            width="max-w-3xl"
        >
            {/* ── Kopf: Level, Fortschritt, offene Punkte ─────────────────────── */}
            <div className="mb-4 rounded-md border border-slate-800 bg-slate-900/60 p-3">
                <div className="flex items-baseline justify-between gap-3">
                    <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-semibold tabular-nums text-white">Level {level}</span>
                        <span className="text-[11px] tabular-nums text-slate-500">
                            {xpBraucht > 0
                                ? `${xpHier.toLocaleString("de-DE")} / ${xpBraucht.toLocaleString("de-DE")} XP`
                                : "Höchstlevel erreicht"}
                        </span>
                    </div>
                    <span className={`text-sm font-medium tabular-nums ${punkteOffen > 0 ? "text-violet-300" : "text-slate-500"}`}>
                        {punkteOffen} {punkteOffen === 1 ? "Punkt" : "Punkte"} frei
                    </span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-sm bg-slate-800">
                    <div className="h-full bg-violet-500" style={{ width: `${anteil * 100}%` }} />
                </div>
            </div>

            {/* ── Der Baum ────────────────────────────────────────────────────── */}
            {/* Die Verbinder stehen ZWISCHEN den Karten statt als gestrecktes SVG
                dahinter: so laufen sie nie über eine Karte und hängen unten nicht
                ins Leere. Ein Stück färbt sich, sobald die Fähigkeit darunter offen
                ist — der Weg nach oben ist damit sichtbar, ohne ihn zu lesen. */}
            <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-3">
                {AST_REIHENFOLGE.map((seite) => (
                    <div key={seite} className="flex flex-col items-stretch">
                        {aeste[seite].map((skill, i) => (
                            <React.Fragment key={skill.id}>
                                {i > 0 && (
                                    <span
                                        aria-hidden="true"
                                        className="mx-auto h-4 w-0.5"
                                        style={{ background: level >= skill.ab ? AST_FARBE[seite].linie : "#1e293b" }}
                                    />
                                )}
                                <SkillKarte
                                    skill={skill}
                                    stufe={Number(stand?.skills?.[skill.id]) || 0}
                                    level={level}
                                    punkteOffen={punkteOffen}
                                    onLernen={onLernen}
                                />
                            </React.Fragment>
                        ))}
                        {/* Luft, damit alle drei Spalten gleich hoch enden */}
                        {Array.from({ length: hoechsteReihe - aeste[seite].length }, (_, i) => (
                            <div key={`luft_${i}`} className="hidden sm:block sm:h-4" />
                        ))}
                    </div>
                ))}
            </div>
            {/* Mobil stehen die Äste untereinander — dort trennt der Abstand schon. */}
            <div className="mt-3 grid grid-cols-1 gap-3 sm:hidden" />

            <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-800 pt-3">
                <p className="text-[11px] text-slate-500">
                    Zurücksetzen kostet nichts. Gelernte Fähigkeiten wirken ab der nächsten Ernte.
                </p>
                <button
                    type="button"
                    onClick={onZuruecksetzen}
                    className="flex shrink-0 items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-800"
                >
                    <RotateCcw size={13} /> Punkte zurückholen
                </button>
            </div>
        </GardenModal>
    );
}
