// ui/PetDetailModal.jsx
// Detailfenster für ein platziertes Tier. Vorher konnte man ein Tier nur anklicken,
// um es wortlos einzupacken — was es überhaupt kann, stand nirgends.
import React, { useEffect, useState } from 'react';
import { StandFenster } from "./laden/Marktstand";
import { fischBild, fischName } from "./fische";
import { istSatt, sattBis } from "../engine/PetSystem";
import { Clock, Percent, Pencil } from 'lucide-react';
import { HudIcon, PetIcon, SpecialIcon } from './gameIcons';
import {
    PET_ABILITY_LABELS, PET_ABILITY_DESCRIPTIONS, PET_PROC_CHANCE,
    getPetTickMs, getGoldfinderFund, ackerStundenErtrag, getPetSellPrice, getErntehelferExtra,
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
import { PrimaryButton, NebenKnopf } from './gardenUi';
import { versionedAsset } from '../engine/assetVersion';

/** Kennzahl auf Pergament (06.11.) — wie StatLine in gardenUi.jsx, nur mit dunkler Schrift. */
function StatLine({ icon: Icon, label, value, valueClass = "text-[#3b2516]" }) {
    return (
        <div className="flex items-center justify-between gap-3 py-1">
            <span className="flex items-center gap-1.5 text-[11px] font-bold text-[#6e4426]">
                {Icon ? <Icon size={12} className="shrink-0" /> : null}
                {label}
            </span>
            <span className={`text-xs font-bold tabular-nums ${valueClass}`}>{value}</span>
        </div>
    );
}

export default function PetDetailModal({ pet, zuechter = 0, onClose, onStow, onSell, onRename, fische = [], onFuettern, plotPlants = {} }) {
    const futterFische = (Array.isArray(fische) ? fische : []).filter((f) => f.fischId !== "stiefel");
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

    // 07.11.: wächst mit dem eigenen Acker (Spiegel von core/pets.js getGoldfinderFund)
    const [goldMin, goldMax] = getGoldfinderFund(level, ackerStundenErtrag(plotPlants));

    return (
        <StandFenster markise={false} inhaltHintergrund="#f3e3c3"
            titel={pet.customName || pet.name || "Tier"}
            untertitel={[pet.customName ? pet.name : null, abilityLabel ? `${abilityLabel} · Stufe ${level}` : "Ohne Fähigkeit"].filter(Boolean).join(" · ")}
            onClose={onClose}
            breite="max-w-md"
            kopfRechts={
                <span className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider ${RARITY_TEXT[rarity]}`}>
                    <span className={`w-2 h-2 ${RARITY_DOT[rarity]}`} />
                    {rarity}
                </span>
            }
            footer={
                <div className="flex gap-2">
                    <PrimaryButton onClick={onStow} className="flex-1">
                        Einpacken
                    </PrimaryButton>
                    <NebenKnopf onClick={onSell} className="flex-1 justify-center">
                        Verkaufen · {formatGold(sellPrice)}
                    </NebenKnopf>
                </div>
            }
        >
            <div className="flex items-center gap-4 mb-4">
                <div className="w-20 h-20 shrink-0 border-[3px] border-[#3b2516] bg-[#fffaf0] flex items-center justify-center">
                    {pet.image ? (
                        <img src={versionedAsset(pet.image)} alt="" className="w-16 h-16 object-contain" style={{ imageRendering: "pixelated" }} draggable={false} />
                    ) : (
                        <PetIcon.emptySlot size={28} />
                    )}
                </div>
                <p className="text-xs text-[#6e4426] leading-relaxed">
                    {ability
                        ? PET_ABILITY_DESCRIPTIONS[ability.type] || "Diese Fähigkeit ist noch nicht beschrieben."
                        : "Dieses Tier hat keine aktive Fähigkeit und dient nur der Deko."}
                </p>
            </div>

            {ability ? (
                <div className="border-[3px] border-[#3b2516] bg-[#fffaf0] px-3 py-2 mb-4">
                    <div className="text-[10px] uppercase tracking-wider text-[#6e4426] mb-1">Fähigkeit</div>

                    {ability.type === "goldfinder" && (
                        <StatLine
                            icon={PetIcon.goldfinder}
                            label="Fund pro Auslösung"
                            value={`${formatGold(goldMin)} – ${formatGold(goldMax)}`}
                            valueClass="text-[#a87414]"
                        />
                    )}
                    {ability.type === "seedfinder" && (
                        <>
                            <StatLine
                                icon={PetIcon.gaertner}
                                label="Nachwuchs ohne Samen"
                                value={`${Math.round(getGaertnerNachwuchs(level, zuechter) * 100)} % je Einmalernte`}
                                valueClass="text-[#2f6b2c]"
                            />
                            <StatLine
                                icon={Clock}
                                label="Wächst schneller"
                                value={`+${Math.round(getGaertnerWurzelwerk(level, zuechter) * 100)} % auf dem ganzen Grundstück`}
                                valueClass="text-[#2f6b2c]"
                            />
                        </>
                    )}
                    {ability.type === "harvester" && (
                        <StatLine
                            icon={PetIcon.erntehelfer}
                            label="Zweites Stück je eigener Ernte"
                            value={`${Math.round(getErntehelferExtra(level, zuechter) * 100)} % Chance`}
                            valueClass="text-[#2f6b2c]"
                        />
                    )}
                    {ability.type === "forscher" && (
                        <StatLine
                            icon={PetIcon.forscher}
                            label="Mehr Erfahrung je Ernte"
                            value={`+${Math.round(getForscherBoost(level, zuechter) * 100)} % XP`}
                            valueClass="text-[#2f5a9a]"
                        />
                    )}
                    {ability.type === "kaufmann" && (
                        <StatLine
                            icon={PetIcon.kaufmann}
                            label="Höherer Verkaufspreis"
                            value={`+${Math.round(getKaufmannBoost(level, zuechter) * 100)} % beim Alles-Verkaufen`}
                            valueClass="text-[#a87414]"
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

                    <p className="text-[10px] text-[#6e4426] mt-2 leading-relaxed">
                        {ABILITY_ERKLAERUNG[ability.type] || ""}
                    </p>
                    <p className="text-[10px] text-[#6e4426] mt-1.5 leading-relaxed">
                        Tiere arbeiten nur, während du im Spiel bist. Offline verdienen sie nichts mehr.
                        {zuechter > 0 ? ` Der Skill „Züchter" ist eingerechnet (+${Math.round(zuechter * 100)} %).` : ""}
                    </p>
                </div>
            ) : null}

            {pet.specialType ? (
                <div className="border-[3px] border-[#3b2516] bg-[#fffaf0] px-3 py-2 mb-4 flex items-center justify-between">
                    <span className={`flex items-center gap-1.5 text-xs font-semibold ${pet.specialType === "Golden" ? "text-[#a87414]" : "text-fuchsia-400"}`}>
                        {pet.specialType === "Golden" ? <SpecialIcon.golden size={13} /> : <SpecialIcon.rainbow size={13} />}
                        {pet.specialType}
                    </span>
                    <span className="text-[11px] text-[#6e4426]">Seltene Färbung</span>
                </div>
            ) : null}

            {/* Füttern (06.11., Backend core/pets.js sattBisVon): nur satte Tiere arbeiten */}
            {onFuettern && (
                <div className="mb-4 border-[3px] border-[#3b2516] bg-[#fffaf0] px-3 py-2">
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#6e4426]">Füttern</span>
                        {istSatt(pet) ? (
                            <span className="border-2 border-[#3b2516] bg-[#dcebc8] px-1.5 text-[10px] font-bold text-[#2f5a28]">
                                satt · {sattBis(pet) > 0 ? `noch ${formatDuration(Math.max(0, sattBis(pet) - Date.now()))}` : "Startfutter"}
                            </span>
                        ) : (
                            <span className="border-2 border-[#3b2516] bg-[#f6c8b8] px-1.5 text-[10px] font-bold text-[#a8302a]">verhungert · arbeitet nicht</span>
                        )}
                    </div>
                    {futterFische.length === 0 ? (
                        <p className="text-[11px] text-[#6e4426]">Kein Fisch im Eimer. Angeln kannst du am Steg im Dorfteich.</p>
                    ) : (
                        <div className="grid grid-cols-5 gap-1.5">
                            {futterFische.slice(0, 10).map((f) => (
                                <button key={f.instanceId} type="button" title={`${fischName(f.fischId)} verfüttern`}
                                    onClick={() => onFuettern(pet, f.instanceId)}
                                    className="flex aspect-square items-center justify-center border-[3px] border-[#3b2516] bg-[#bfe6f2] transition-transform duration-75 hover:-translate-y-0.5">
                                    <img src={fischBild(f.fischId)} alt="" className="h-8 w-auto" style={{ imageRendering: "pixelated" }} />
                                </button>
                            ))}
                        </div>
                    )}
                    <p className="mt-1.5 text-[10px] text-[#8a7a5a]">Tiere arbeiten nur, solange sie satt sind. Ein Fisch hält 3 Stunden, seltenere länger — bis zu 24 Stunden im Voraus.</p>
                </div>
            )}

            <div className="border-[3px] border-[#3b2516] bg-[#fffaf0] px-3 py-2 mb-4">
                <label className="block text-[10px] uppercase tracking-wider text-[#6e4426] mb-1.5">Name geben</label>
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={draftName}
                        maxLength={24}
                        placeholder={pet.name}
                        onChange={(e) => setDraftName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") onRename?.(pet, draftName.trim()); }}
                        className="flex-1 px-2.5 py-1.5 bg-white border-[3px] border-[#3b2516] text-xs text-[#3b2516] placeholder:text-[#a8967e] focus:bg-white focus:outline-none"
                    />
                    <PrimaryButton onClick={() => onRename?.(pet, draftName.trim())} className="shrink-0">
                        <span className="inline-flex items-center gap-1.5"><Pencil size={12} /> Speichern</span>
                    </PrimaryButton>
                </div>
            </div>

            <div className="border-[3px] border-[#3b2516] bg-[#fffaf0] px-3 py-2">
                <div className="text-[10px] uppercase tracking-wider text-[#6e4426] mb-1">Wert</div>
                <StatLine
                    icon={HudIcon.gold}
                    label="Verkaufspreis am Tier-Stand"
                    value={`${sellPrice.toLocaleString("de-DE")} Gold`}
                    valueClass="text-[#a87414]"
                />
            </div>
        </StandFenster>
    );
}
