// ui/PetDetailModal.jsx
// Detailfenster für ein platziertes Tier. Vorher konnte man ein Tier nur anklicken,
// um es wortlos einzupacken — was es überhaupt kann, stand nirgends.
import React, { useEffect, useState } from 'react';
import { Clock, Percent, Pencil } from 'lucide-react';
import { HudIcon, PetIcon, SpecialIcon } from './gameIcons';
import {
    PET_ABILITY_LABELS, PET_ABILITY_DESCRIPTIONS, PET_PROC_CHANCE,
    getPetTickMs, getGoldfinderRange, getPetSellPrice, getErntehelferExtra,
    getGaertnerNachwuchs, getGaertnerWurzelwerk, getForscherBoost, getKaufmannBoost,
} from '../engine/PetSystem';

/**
 * Erklärtext unter den Stat-Zeilen, je Fähigkeit — v2 (Punkt 9) hat aus dem
 * vorherigen 3-fach-Ternary eine Lookup-Tabelle gemacht: mit fünf statt drei
 * Fähigkeiten hätte ein weiterer verschachtelter Ternary die vierte/fünfte
 * stillschweigend auf den Gärtner-Text zurückfallen lassen.
 */
const ABILITY_ERKLAERUNG = {
    goldfinder: "Sucht nur, solange du im Spiel bist. Der Takt richtet sich nach dem höchsten Goldfinder-Level unter deinen platzierten Tieren.",
    seedfinder: "Wirkt dauerhaft auf alles, was auf deinem Grundstück wächst. Mehrere Gärtner stapeln nicht — es zählt der stärkste.",
    harvester: "Wirkt bei jeder Pflanze, die du selbst abpflückst — zusätzlich zur Fähigkeit „Reiche Ernte“. Mehrere Erntehelfer stapeln nicht: es zählt der stärkste.",
    forscher: "Wirkt bei jeder Ernte, egal welcher Pflanze. Mehrere Forscher stapeln nicht — es zählt der stärkste.",
    kaufmann: "Wirkt nur beim Verkaufen des gesamten Ernte-Lagers, nicht beim einzelnen Verkauf. Mehrere Kaufleute stapeln nicht — es zählt der stärkste.",
};
import { RARITY_TEXT, RARITY_DOT, formatGold, formatDuration } from './gardenTokens';
import { GardenModal, PrimaryButton, StatLine } from './gardenUi';

export default function PetDetailModal({ pet, zuechter = 0, onClose, onStow, onSell, onRename }) {
    const [draftName, setDraftName] = useState("");
    useEffect(() => {
        setDraftName(pet ? (pet.customName || "") : "");
    }, [pet]);
    if (!pet) return null;

    const rarity = pet.rarity || "COMMON";
    const ability = pet.ability || null;
    const level = Math.max(1, Math.min(5, Number(ability?.level) || 1));
    const abilityLabel = ability ? (PET_ABILITY_LABELS[ability.type] || ability.type) : null;
    const sellPrice = getPetSellPrice(rarity);
    const tickMs = getPetTickMs(level);

    const [goldMin, goldMax] = getGoldfinderRange(level);

    return (
        <GardenModal
            title={pet.customName || pet.name || "Tier"}
            subtitle={[pet.customName ? pet.name : null, abilityLabel ? `${abilityLabel} · Stufe ${level}` : "Ohne Fähigkeit"].filter(Boolean).join(" · ")}
            onClose={onClose}
            width="max-w-md"
            headerRight={
                <span className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider ${RARITY_TEXT[rarity]}`}>
                    <span className={`w-2 h-2 rounded-full ${RARITY_DOT[rarity]}`} />
                    {rarity}
                </span>
            }
            footer={
                <div className="flex gap-2">
                    <PrimaryButton onClick={onStow} className="flex-1">
                        Einpacken
                    </PrimaryButton>
                    <button
                        type="button"
                        onClick={onSell}
                        className="flex-1 px-3 py-2 rounded-2xl border border-slate-700 text-slate-300 hover:text-white hover:border-slate-600 text-xs font-semibold transition-colors"
                    >
                        Verkaufen · {formatGold(sellPrice)}
                    </button>
                </div>
            }
        >
            <div className="flex items-center gap-4 mb-4">
                <div className="w-20 h-20 shrink-0 rounded-2xl border border-slate-800 bg-slate-950 flex items-center justify-center">
                    {pet.image ? (
                        <img src={pet.image} alt="" className="w-16 h-16 object-contain" draggable={false} />
                    ) : (
                        <PetIcon.emptySlot size={28} />
                    )}
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                    {ability
                        ? PET_ABILITY_DESCRIPTIONS[ability.type] || "Diese Fähigkeit ist noch nicht beschrieben."
                        : "Dieses Tier hat keine aktive Fähigkeit und dient nur der Deko."}
                </p>
            </div>

            {ability ? (
                <div className="rounded-2xl border border-slate-800 bg-slate-950/50 px-3 py-2 mb-4">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Fähigkeit</div>

                    {ability.type === "goldfinder" && (
                        <StatLine
                            icon={PetIcon.goldfinder}
                            label="Fund pro Auslösung"
                            value={`${formatGold(goldMin)} – ${formatGold(goldMax)}`}
                            valueClass="text-amber-400"
                        />
                    )}
                    {ability.type === "seedfinder" && (
                        <>
                            <StatLine
                                icon={PetIcon.gaertner}
                                label="Nachwuchs ohne Samen"
                                value={`${Math.round(getGaertnerNachwuchs(level, zuechter) * 100)} % je Einmalernte`}
                                valueClass="text-emerald-400"
                            />
                            <StatLine
                                icon={Clock}
                                label="Wächst schneller"
                                value={`+${Math.round(getGaertnerWurzelwerk(level, zuechter) * 100)} % auf dem ganzen Grundstück`}
                                valueClass="text-emerald-400"
                            />
                        </>
                    )}
                    {ability.type === "harvester" && (
                        <StatLine
                            icon={PetIcon.erntehelfer}
                            label="Zweites Stück je eigener Ernte"
                            value={`${Math.round(getErntehelferExtra(level, zuechter) * 100)} % Chance`}
                            valueClass="text-emerald-400"
                        />
                    )}
                    {ability.type === "forscher" && (
                        <StatLine
                            icon={PetIcon.forscher}
                            label="Mehr Erfahrung je Ernte"
                            value={`+${Math.round(getForscherBoost(level, zuechter) * 100)} % XP`}
                            valueClass="text-sky-400"
                        />
                    )}
                    {ability.type === "kaufmann" && (
                        <StatLine
                            icon={PetIcon.kaufmann}
                            label="Höherer Verkaufspreis"
                            value={`+${Math.round(getKaufmannBoost(level, zuechter) * 100)} % beim Alles-Verkaufen`}
                            valueClass="text-amber-400"
                        />
                    )}

                    {/* Nur der Goldfinder läuft im Takt. Die anderen wirken dauerhaft bzw.
                        genau dann, wenn der Spieler selbst erntet/verkauft. */}
                    {ability.type === "goldfinder" && (
                        <>
                            <StatLine icon={Clock} label="Versuch alle" value={formatDuration(tickMs)} />
                            <StatLine icon={Percent} label="Chance je Versuch" value={`${Math.round(PET_PROC_CHANCE * 100)} %`} />
                        </>
                    )}

                    <p className="text-[10px] text-slate-500 mt-2 leading-relaxed">
                        {ABILITY_ERKLAERUNG[ability.type] || ""}
                    </p>
                    <p className="text-[10px] text-slate-500 mt-1.5 leading-relaxed">
                        Tiere arbeiten nur, während du im Spiel bist. Offline verdienen sie nichts mehr.
                        {zuechter > 0 ? ` Der Skill „Züchter" ist eingerechnet (+${Math.round(zuechter * 100)} %).` : ""}
                    </p>
                </div>
            ) : null}

            {pet.specialType ? (
                <div className="rounded-2xl border border-slate-800 bg-slate-950/50 px-3 py-2 mb-4 flex items-center justify-between">
                    <span className={`flex items-center gap-1.5 text-xs font-semibold ${pet.specialType === "Golden" ? "text-amber-400" : "text-fuchsia-400"}`}>
                        {pet.specialType === "Golden" ? <SpecialIcon.golden size={13} /> : <SpecialIcon.rainbow size={13} />}
                        {pet.specialType}
                    </span>
                    <span className="text-[11px] text-slate-400">Seltene Färbung</span>
                </div>
            ) : null}

            <div className="rounded-2xl border border-slate-800 bg-slate-950/50 px-3 py-2 mb-4">
                <label className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">Name geben</label>
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={draftName}
                        maxLength={24}
                        placeholder={pet.name}
                        onChange={(e) => setDraftName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") onRename?.(pet, draftName.trim()); }}
                        className="flex-1 px-2.5 py-1.5 rounded-2xl bg-slate-950 border border-slate-700 text-xs text-white placeholder:text-slate-600 focus:border-violet-500 focus:outline-none"
                    />
                    <PrimaryButton onClick={() => onRename?.(pet, draftName.trim())} className="shrink-0">
                        <span className="inline-flex items-center gap-1.5"><Pencil size={12} /> Speichern</span>
                    </PrimaryButton>
                </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-950/50 px-3 py-2">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Wert</div>
                <StatLine
                    icon={HudIcon.gold}
                    label="Verkaufspreis am Tier-Stand"
                    value={`${sellPrice.toLocaleString("de-DE")} Gold`}
                    valueClass="text-amber-400"
                />
            </div>
        </GardenModal>
    );
}
