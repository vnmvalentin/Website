// ui/QuestBoardModal.jsx
// Das Missionsbrett: tägliche und wöchentliche Aufgaben mit Gold- und
// XP-Belohnung.
//
// Katalog UND Fortschritt kommen vom Server (GET /api/garden/quests) — wie beim
// Fähigkeitsbaum: eine Anzeige, die etwas anderes verspricht als die Route
// tatsächlich auszahlt, wäre schlimmer als gar keine Anzeige. Welche Missionen
// gerade laufen, entscheidet allein die Uhrzeit (core/quests.js) — hier wird nur
// dargestellt, nie gewürfelt.
import React, { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { GardenModal, PrimaryButton, TabBar, ProgressBar, TimerTag } from './gardenUi';
import { HudIcon } from './gameIcons';

// Tage mit rein, sonst zeigte der Wochen-Reset bis zu "167h 59m" — kein
// Mensch überschlägt daraus schnell "fast eine Woche".
function formatCountdown(ms) {
    const rest = Math.max(0, Number(ms) || 0);
    const tage = Math.floor(rest / 86400000);
    const stunden = Math.floor((rest % 86400000) / 3600000);
    const minuten = Math.floor((rest % 3600000) / 60000);
    if (tage > 0) return `${tage}d ${stunden}h`;
    if (stunden > 0) return `${stunden}h ${minuten}m`;
    return `${minuten}m`;
}

function QuestZeile({ quest, onAbholen, busy }) {
    const anteil = quest.ziel > 0 ? quest.fortschritt / quest.ziel : 0;
    return (
        <div className={`p-3 rounded-2xl border transition-colors ${
            quest.abgeholt
                ? "border-slate-800 bg-slate-950/40 opacity-60"
                : quest.erreicht
                    ? "border-emerald-600/60 bg-emerald-950/20"
                    : "border-slate-800 bg-slate-900/50"
        }`}>
            <div className="mb-1.5 flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="text-sm font-semibold text-white truncate">{quest.name}</div>
                    <div className="text-[11px] text-slate-400">{quest.beschreibung}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-xs font-bold tabular-nums">
                    <span className="flex items-center gap-1 text-amber-300">
                        <HudIcon.gold size={13} /> {quest.gold.toLocaleString("de-DE")}
                    </span>
                    <span className="flex items-center gap-1 text-violet-300">
                        <HudIcon.star size={12} /> {quest.xp}
                    </span>
                </div>
            </div>
            <div className="flex items-center gap-2.5">
                <div className="flex-1">
                    <ProgressBar value={anteil} className={quest.erreicht ? "bg-emerald-500" : "bg-violet-500"} />
                </div>
                <span className="shrink-0 text-[11px] font-medium tabular-nums text-slate-400">
                    {Math.min(quest.fortschritt, quest.ziel).toLocaleString("de-DE")}/{quest.ziel.toLocaleString("de-DE")}
                </span>
            </div>
            {!quest.abgeholt && (
                <PrimaryButton
                    onClick={() => onAbholen(quest.id)}
                    disabled={!quest.erreicht || busy}
                    className="mt-2.5 w-full py-1.5 text-xs"
                >
                    {quest.erreicht ? "Belohnung abholen" : "Noch nicht geschafft"}
                </PrimaryButton>
            )}
            {quest.abgeholt && (
                <div className="mt-2.5 flex items-center justify-center gap-1.5 text-[11px] font-semibold text-emerald-400">
                    <HudIcon.check size={12} /> Abgeholt
                </div>
            )}
        </div>
    );
}

export default function QuestBoardModal({ offen, onClose, onBack, daten, onAbholen }) {
    const [tab, setTab] = useState("taeglich");
    const [laufendeId, setLaufendeId] = useState(null);
    if (!offen) return null;

    const taeglich = daten?.taeglich || [];
    const woechentlich = daten?.woechentlich || [];
    const liste = tab === "taeglich" ? taeglich : woechentlich;
    // Wieder eine eigene Bubble statt Fließtext (Feedback 31.08., zweite Runde)
    // — UND nur noch die Zeit des offenen Tabs, nicht beide auf einmal.
    const naechsteAb = tab === "taeglich" ? daten?.naechsteTaeglicheAb : daten?.naechsteWoechentlicheAb;

    const tabs = [
        { key: "taeglich", label: "Täglich", icon: HudIcon.check, count: taeglich.filter((q) => q.abgeholt).length + "/" + taeglich.length },
        { key: "woechentlich", label: "Wöchentlich", icon: CalendarDays, count: woechentlich.filter((q) => q.abgeholt).length + "/" + woechentlich.length },
    ];

    const abholenMitSperre = async (questId) => {
        if (laufendeId) return;
        setLaufendeId(questId);
        try { await onAbholen(questId); } finally { setLaufendeId(null); }
    };

    return (
        <GardenModal
            title="Missionsbrett"
            headerRight={
                <TimerTag
                    title={tab === "taeglich" ? "Nächste tägliche Mission" : "Nächste wöchentliche Mission"}
                    label={formatCountdown((naechsteAb || 0) - Date.now())}
                />
            }
            onClose={onClose}
            onBack={onBack}
            width="max-w-lg"
            toolbar={<TabBar tabs={tabs} active={tab} onSelect={setTab} />}
        >
            {liste.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">Gerade keine Missionen verfügbar.</p>
            ) : (
                <div className="space-y-2">
                    {liste.map((quest) => (
                        <QuestZeile key={quest.id} quest={quest} onAbholen={abholenMitSperre} busy={laufendeId === quest.id} />
                    ))}
                </div>
            )}
        </GardenModal>
    );
}
