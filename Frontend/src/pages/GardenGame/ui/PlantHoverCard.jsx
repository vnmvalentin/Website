// ui/PlantHoverCard.jsx
// Hover-Karte für Pflanzen auf dem Acker.
//
// Ersetzt den alten Mini-Tooltip (Name + "Nächste in: X" + Slot-Liste). Neu sind vor allem
// die Dinge, die man vorher NIRGENDS sehen konnte: erwarteter Verkaufswert, der tatsächliche
// Prozent-Bonus der Wetter-Effekte und die Wuchsform.
//
// Die Karte tickt sich selbst im Sekundentakt. Vorher hing die Restzeit daran, dass die Maus
// sich bewegt (jede Bewegung rendert GameContainer neu) — stand die Maus still, fror der
// Countdown ein. Jetzt rendert sich nur diese Karte neu.
import React, { useEffect, useMemo, useState } from 'react';
import { Coins, Ruler, Clock, Sparkles, Rainbow, Check } from 'lucide-react';
import {
    getGrowthProgressForRender,
    isPlantReadyForRender,
    getPlantArchetypeKey,
    getExpectedSellValue,
    ARCHETYPE_LABELS,
    WEATHER_SELL_BOOST,
    STATUS_EFFECT_LABELS,
    wetterListe,
    wetterBoost,
} from '../engine/PlantSystem';
import { RARITY_BORDER, RARITY_DOT, formatDuration, statusEffectIcon } from './gardenTokens';
import { ProgressBar, StatLine } from './gardenUi';
import { SpecialItemIcon } from './ItemIcon';

const CARD_WIDTH = 268;

function sizeFromNorm(norm) {
    return Math.max(1, Math.round(1 + 49 * Math.max(0, Math.min(1, Number(norm) || 0))));
}

/** Bewusst ohne ensurePerennialFruitingState — im Render nichts mutieren. */
function readSlots(plant, now) {
    if (!Array.isArray(plant?.fruitSlots)) return [];
    return plant.fruitSlots.map((slot, index) => {
        const norm = Number.isFinite(slot?.norm) ? slot.norm : 0.5;
        return {
            index,
            ready: (slot?.readyAt || 0) <= now,
            readyAt: slot?.readyAt || 0,
            norm,
            size: Number.isFinite(slot?.size) ? slot.size : sizeFromNorm(norm),
            specialType: slot?.specialType || null,
            statusEffect: slot?.statusEffect || null,
            statusEffects: wetterListe(slot),
        };
    })
        // Reife zuerst, danach nach Restzeit. In Array-Reihenfolge sah es so aus, als
        // würde beim Ernten „immer nur die erste" Zeile springen — tatsächlich wurde nur
        // der ersetzte Fruchtstand an seiner alten Position neu einsortiert.
        .sort((a, b) => (a.ready === b.ready ? a.readyAt - b.readyAt : (a.ready ? -1 : 1)));
}

function timeToNext(plant, now) {
    if (plant.singleUse) return Math.max(0, (plant.plantedAt || 0) + (plant.growthMs || 0) - now);
    const inStructure = plant.stage === "structure" || now < (plant.structureReadyAt || 0);
    if (inStructure) return Math.max(0, (plant.structureReadyAt || now) - now);
    const slots = plant.fruitSlots || [];
    if (!slots.length) return 0;
    const pending = slots.filter((s) => (s?.readyAt || 0) > now);
    if (!pending.length) return 0;
    return Math.max(0, Math.min(...pending.map((s) => s.readyAt)) - now);
}

/**
 * @param {string|null} owner Gesetzt, wenn die Pflanze auf einem FREMDEN Grundstück
 *   steht. Dann ist die Karte reine Auskunft — geerntet wird dort nichts.
 */
export default function PlantHoverCard({ getPlant, plantKey, x, y, owner = null }) {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Frisch aus dem lebenden Bestand — nicht aus einem Prop, das beim Hovern entstand.
    const plant = getPlant(plantKey);

    const data = useMemo(() => {
        if (!plant) return null;
        const rarity = plant.rarity || "COMMON";
        const archetypeKey = getPlantArchetypeKey(plant.seedId);
        const slots = readSlots(plant, now);
        const readySlots = slots.filter((s) => s.ready);
        const ready = isPlantReadyForRender(plant, now);
        const inStructure = !plant.singleUse && (plant.stage === "structure" || now < (plant.structureReadyAt || 0));
        // Eine Pflanze kann mehrere Wetter tragen; `statusEffect` ist davon der
        // wertvollste (für Symbol und Tönung), die Liste trägt alle.
        const statusEffects = wetterListe(plant);
        const statusEffect = plant.statusEffect || null;
        const weatherMult = wetterBoost(plant);

        // Einjährig: Größe und Wert stehen beim Pflanzen fest. Mehrjährig: pro Fruchtstand.
        const singleValue = plant.singleUse
            ? getExpectedSellValue(plant, plant.norm ?? 0.5, plant.specialType, statusEffects)
            : 0;
        // Jeder Fruchtstand rechnet mit SEINEN eigenen Wetter-Effekten.
        const readyTotal = readySlots.reduce(
            (sum, s) => sum + getExpectedSellValue(plant, s.norm, s.specialType, s.statusEffects), 0,
        );

        return {
            rarity, archetypeKey, slots, readySlots, ready, inStructure,
            statusEffect, statusEffects, weatherMult, singleValue, readyTotal,
            progress: getGrowthProgressForRender(plant, now),
            remaining: timeToNext(plant, now),
            special: plant.singleUse ? (plant.specialType || null) : null,
        };
    }, [plant, now]);

    if (!plant || !data) return null;

    const iconSrc = plant.singleUse
        ? (plant.growthImage || plant.harvestImage || plant.image)
        : (plant.fruitImage || plant.structureImage || plant.image);

    // Am Rand einklappen, damit die Karte nie aus dem Bild läuft.
    const viewportW = typeof window !== "undefined" ? window.innerWidth : 1920;
    const viewportH = typeof window !== "undefined" ? window.innerHeight : 1080;
    let left = x + 16;
    let top = y + 16;
    if (left + CARD_WIDTH > viewportW - 8) left = x - CARD_WIDTH - 16;
    if (left < 8) left = 8;
    if (top > viewportH - 320) top = Math.max(8, viewportH - 340);

    const StatusIcon = statusEffectIcon(data.statusEffect);

    return (
        <div
            className={`absolute z-50 pointer-events-none bg-slate-900/97 border ${RARITY_BORDER[data.rarity] || RARITY_BORDER.COMMON} rounded-md shadow-xl overflow-hidden`}
            style={{ left, top, width: CARD_WIDTH }}
        >
            {/* Kopf */}
            <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-slate-800">
                {/* Nur Einmalernten dürfen eingefärbt werden: bei Dauerträgern steckt die
                    Veredelung im einzelnen Fruchtstand, nicht in der Staude im Kopfbild. */}
                {iconSrc ? (
                    <SpecialItemIcon
                        item={{ image: iconSrc, name: plant.name }}
                        special={plant.singleUse ? data.special : null}
                        statusEffect={plant.singleUse ? data.statusEffect : null}
                        className="w-8 h-8 shrink-0"
                    />
                ) : null}
                <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-white truncate">{plant.name}</div>
                    <div className="text-[11px] text-slate-400 truncate">
                        {ARCHETYPE_LABELS[data.archetypeKey] || "Pflanze"}
                        {" · "}
                        {plant.singleUse ? "Einmalernte" : "Dauerträger"}
                    </div>
                </div>
                <span className={`w-2 h-2 rounded-full shrink-0 ${RARITY_DOT[data.rarity] || RARITY_DOT.COMMON}`} />
            </div>

            {owner && (
                <div className="px-3 py-1.5 border-b border-slate-800 text-[11px] text-slate-400">
                    Acker von <span className="text-slate-200">{owner}</span> — nur zum Ansehen
                </div>
            )}

            {/* Status */}
            <div className="px-3 py-2.5 border-b border-slate-800">
                {data.ready ? (
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 mb-1.5">
                        <Check size={13} />
                        {plant.singleUse
                            ? "Erntereif"
                            : `${data.readySlots.length} von ${data.slots.length} reif`}
                    </div>
                ) : (
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-xs font-medium text-slate-300">
                            {data.inStructure ? "Wächst heran" : "Reift nach"}
                        </span>
                        <span className="flex items-center gap-1 text-[11px] text-slate-400 tabular-nums">
                            <Clock size={11} />
                            {formatDuration(data.remaining)}
                        </span>
                    </div>
                )}
                <ProgressBar
                    value={data.ready ? 1 : data.progress}
                    className={data.ready ? "bg-emerald-500" : "bg-violet-500"}
                />
            </div>

            {/* Werte */}
            <div className="px-3 py-1.5 border-b border-slate-800">
                {plant.singleUse ? (
                    <>
                        <StatLine
                            icon={Coins}
                            label="Verkaufswert"
                            value={`${data.singleValue.toLocaleString("de-DE")} Gold`}
                            valueClass="text-amber-400"
                        />
                        <StatLine
                            icon={Ruler}
                            label="Größe"
                            value={`${sizeFromNorm(plant.norm ?? 0.5)} / 50`}
                        />
                    </>
                ) : (
                    <>
                        <StatLine
                            icon={Coins}
                            label={data.readySlots.length ? "Reife Früchte wert" : "Noch nichts reif"}
                            value={data.readySlots.length ? `${data.readyTotal.toLocaleString("de-DE")} Gold` : "—"}
                            valueClass={data.readySlots.length ? "text-amber-400" : "text-slate-500"}
                        />
                        <StatLine icon={Ruler} label="Fruchtstände" value={`${data.slots.length}`} />
                    </>
                )}
            </div>

            {/* Veredelungen — nur zeigen, wenn es wirklich welche gibt */}
            {(data.special || data.statusEffects.length > 0) && (
                <div className="px-3 py-2 border-b border-slate-800 space-y-1">
                    {data.special === "Golden" && (
                        <div className="flex items-center justify-between text-[11px]">
                            <span className="flex items-center gap-1.5 text-amber-400 font-medium">
                                <Sparkles size={12} /> Golden
                            </span>
                            <span className="text-slate-400">2× Wert</span>
                        </div>
                    )}
                    {data.special === "Rainbow" && (
                        <div className="flex items-center justify-between text-[11px]">
                            <span className="flex items-center gap-1.5 text-fuchsia-400 font-medium">
                                <Rainbow size={12} /> Rainbow
                            </span>
                            <span className="text-slate-400">5× Wert</span>
                        </div>
                    )}
                    {/* Jedes Wetter einzeln — eine Frucht kann mehrere zugleich tragen. */}
                    {data.statusEffects.map((effekt) => {
                        const Icon = statusEffectIcon(effekt);
                        return (
                            <div key={effekt} className="flex items-center justify-between text-[11px]">
                                <span className="flex items-center gap-1.5 text-sky-400 font-medium">
                                    {Icon ? <Icon size={12} /> : null}
                                    {STATUS_EFFECT_LABELS[effekt] || effekt}
                                </span>
                                <span className="text-slate-400">
                                    {WEATHER_SELL_BOOST[effekt]}× Wert
                                </span>
                            </div>
                        );
                    })}
                    {data.statusEffects.length > 0 && (
                        <div className="flex items-center justify-between text-[11px] pt-0.5 border-t border-slate-800/80">
                            <span className="text-slate-500">Wetter zusammen</span>
                            <span className="text-emerald-400 font-medium">
                                +{Math.round((data.weatherMult - 1) * 100)}% Verkauf
                            </span>
                        </div>
                    )}
                </div>
            )}

            {/* Fruchtstände einzeln — nur bei Dauerträgern, die schon tragen */}
            {!plant.singleUse && !data.inStructure && data.slots.length > 0 && (
                <div className="px-3 py-2 max-h-36 overflow-y-auto">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">Fruchtstände</div>
                    <div className="space-y-0.5">
                        {data.slots.map((slot) => {
                            const SlotIcon = statusEffectIcon(slot.statusEffect);
                            const slotBoost = wetterBoost(slot.statusEffects);
                            return (
                                <div key={slot.index} className="flex items-center justify-between gap-2 text-[11px]">
                                    <span className={`flex items-center gap-1.5 ${slot.ready ? "text-emerald-400" : "text-slate-500"}`}>
                                        {/* Reife Frucht im Zustand, in dem man sie erntet — die Veredelung
                                            hängt am Fruchtstand, nicht an der Staude. */}
                                        {slot.ready && plant.fruitImage ? (
                                            <SpecialItemIcon
                                                item={{ image: plant.fruitImage, name: plant.name }}
                                                special={slot.specialType}
                                                statusEffect={slot.statusEffect}
                                                className="w-4 h-4"
                                            />
                                        ) : (
                                            <span className={`w-1.5 h-1.5 rounded-full ${slot.ready ? "bg-emerald-500" : "bg-slate-600"}`} />
                                        )}
                                        {slot.ready ? `Größe ${slot.size}` : formatDuration(slot.readyAt - now)}
                                    </span>
                                    {/* Sonderform und Wetter je Fruchtstand — nicht mehr pauschal für die Staude */}
                                    <span className="flex items-center gap-2 shrink-0">
                                        {slot.ready && slot.statusEffect ? (
                                            <span className="flex items-center gap-1 text-sky-400">
                                                {SlotIcon ? <SlotIcon size={10} /> : null}
                                                +{Math.round((slotBoost - 1) * 100)}%
                                            </span>
                                        ) : null}
                                        {slot.ready && slot.specialType ? (
                                            <span className={`flex items-center gap-1 ${slot.specialType === "Golden" ? "text-amber-400" : "text-fuchsia-400"}`}>
                                                {slot.specialType === "Golden" ? <Sparkles size={10} /> : <Rainbow size={10} />}
                                                {slot.specialType}
                                            </span>
                                        ) : null}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
