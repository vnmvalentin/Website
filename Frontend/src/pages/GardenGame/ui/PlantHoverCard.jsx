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
import { Clock } from 'lucide-react';
import { HudIcon, SpecialIcon } from './gameIcons';
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
import { formatDuration, statusEffectIcon } from './gardenTokens';
import { PergamentKarte, PAbschnitt, PZeile, PBalken } from './pergament';
import { HOLZ, RAR_FARBE, RAR_NAME, TON } from './pergamentFarben';
import { SpecialItemIcon } from './ItemIcon';
import { formatGroesse, groesseAusNorm } from './groesse';

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
 * @param {object|null} xpJeSorte Erfahrung je Ernte, nach seedId. Kommt vom Server
 *   (GET /api/garden/skills), damit die Karte die Formel nicht spiegeln muss —
 *   vergeben wird die XP ausschliesslich serverseitig.
 */
export default function PlantHoverCard({ getPlant, plantKey, x, y, owner = null, xpJeSorte = null }) {
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

    // Nur zeigen, was der Server auch wirklich gutschreibt. Fehlt die Tabelle (noch
    // nicht geladen), bleibt die Zeile weg statt eine Zahl zu raten.
    const xpProErnte = xpJeSorte?.[plant.seedId] || 0;

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
        // Holz-und-Pergament-Look (06.11.), Seltenheit als Band oben
        <PergamentKarte
            className="pointer-events-none absolute z-50 overflow-hidden"
            style={{ left, top, width: CARD_WIDTH }}
            band={RAR_FARBE[data.rarity] || RAR_FARBE.COMMON}
        >
            {/* Kopf */}
            <PAbschnitt className="flex items-center gap-2.5">
                {/* Nur Einmalernten dürfen eingefärbt werden: bei Dauerträgern steckt die
                    Veredelung im einzelnen Fruchtstand, nicht in der Staude im Kopfbild. */}
                {iconSrc ? (
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center border-2 bg-[#fffaf0]" style={{ borderColor: HOLZ }}>
                        <SpecialItemIcon
                            item={{ image: iconSrc, name: plant.name }}
                            special={plant.singleUse ? data.special : null}
                            statusEffect={plant.singleUse ? data.statusEffect : null}
                            className="h-8 w-8"
                        />
                    </span>
                ) : null}
                <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold text-[#3b2516]">{plant.name}</div>
                    <div className="truncate text-[11px] text-[#6e4426]">
                        {ARCHETYPE_LABELS[data.archetypeKey] || "Pflanze"}
                        {" · "}
                        {plant.singleUse ? "Einmalernte" : "Dauerträger"}
                    </div>
                </div>
                <span className="shrink-0 border-2 px-1 text-[9px] font-bold uppercase text-white" style={{ borderColor: HOLZ, background: RAR_FARBE[data.rarity] || RAR_FARBE.COMMON }}>
                    {RAR_NAME[data.rarity] || data.rarity}
                </span>
            </PAbschnitt>

            {owner && (
                <PAbschnitt className="text-[11px] text-[#6e4426]">
                    Acker von <span className="font-bold text-[#3b2516]">{owner}</span> — nur zum Ansehen
                </PAbschnitt>
            )}

            {/* Status */}
            <PAbschnitt>
                {data.ready ? (
                    <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-[#2f6b2c]">
                        <HudIcon.check size={13} />
                        {plant.singleUse
                            ? "Erntereif"
                            : `${data.readySlots.length} von ${data.slots.length} reif`}
                    </div>
                ) : (
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-[#3b2516]">
                            {data.inStructure ? "Wächst heran" : "Reift nach"}
                        </span>
                        <span className="flex items-center gap-1 text-[11px] font-bold tabular-nums text-[#6e4426]">
                            <Clock size={11} />
                            {formatDuration(data.remaining)}
                        </span>
                    </div>
                )}
                <PBalken wert={data.ready ? 1 : data.progress} farbe={data.ready ? "#5faa45" : "#9a68d8"} />
            </PAbschnitt>

            {/* Werte */}
            <PAbschnitt letzter={!(data.special || data.statusEffects.length > 0) && (plant.singleUse || data.inStructure || data.slots.length === 0)}>
                {plant.singleUse ? (
                    <>
                        <PZeile icon={HudIcon.gold} label="Verkaufswert" value={`${data.singleValue.toLocaleString("de-DE")} Gold`} ton="gold" />
                        <PZeile icon={HudIcon.ruler} label="Größe" value={`${formatGroesse(groesseAusNorm(plant.norm ?? 0.5))} / 100`} />
                        {xpProErnte ? <PZeile icon={HudIcon.star} label="Erfahrung" value={`+${xpProErnte} XP`} ton="xp" /> : null}
                    </>
                ) : (
                    <>
                        <PZeile
                            icon={HudIcon.gold}
                            label={data.readySlots.length ? "Reife Früchte wert" : "Noch nichts reif"}
                            value={data.readySlots.length ? `${data.readyTotal.toLocaleString("de-DE")} Gold` : "—"}
                            ton={data.readySlots.length ? "gold" : "leise"}
                        />
                        <PZeile icon={HudIcon.ruler} label="Fruchtstände" value={`${data.slots.length}`} />
                        {xpProErnte ? <PZeile icon={HudIcon.star} label="Erfahrung" value={`+${xpProErnte} XP je Frucht`} ton="xp" /> : null}
                    </>
                )}
            </PAbschnitt>

            {/* Veredelungen — nur zeigen, wenn es wirklich welche gibt */}
            {(data.special || data.statusEffects.length > 0) && (
                <PAbschnitt className="space-y-1" letzter={plant.singleUse || data.inStructure || data.slots.length === 0}>
                    {data.special === "Golden" && (
                        <div className="flex items-center justify-between text-[11px]">
                            <span className={`flex items-center gap-1.5 font-bold ${TON.gold}`}><SpecialIcon.golden size={12} /> Golden</span>
                            <span className="text-[#6e4426]">2× Wert</span>
                        </div>
                    )}
                    {data.special === "Rainbow" && (
                        <div className="flex items-center justify-between text-[11px]">
                            <span className={`flex items-center gap-1.5 font-bold ${TON.rainbow}`}><SpecialIcon.rainbow size={12} /> Rainbow</span>
                            <span className="text-[#6e4426]">5× Wert</span>
                        </div>
                    )}
                    {/* Jedes Wetter einzeln — eine Frucht kann mehrere zugleich tragen. */}
                    {data.statusEffects.map((effekt) => {
                        const Icon = statusEffectIcon(effekt);
                        return (
                            <div key={effekt} className="flex items-center justify-between text-[11px]">
                                <span className={`flex items-center gap-1.5 font-bold ${TON.wetter}`}>
                                    {Icon ? <Icon size={12} /> : null}
                                    {STATUS_EFFECT_LABELS[effekt] || effekt}
                                </span>
                                <span className="text-[#6e4426]">{WEATHER_SELL_BOOST[effekt]}× Wert</span>
                            </div>
                        );
                    })}
                    {data.statusEffects.length > 0 && (
                        <div className="flex items-center justify-between border-t-2 border-[#d9c39a] pt-0.5 text-[11px]">
                            <span className="text-[#8a7a5a]">Wetter zusammen</span>
                            <span className={`font-bold ${TON.gut}`}>+{Math.round((data.weatherMult - 1) * 100)}% Verkauf</span>
                        </div>
                    )}
                </PAbschnitt>
            )}

            {/* Fruchtstände einzeln — nur bei Dauerträgern, die schon tragen */}
            {!plant.singleUse && !data.inStructure && data.slots.length > 0 && (
                <div className="max-h-36 overflow-y-auto px-3 py-2">
                    <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-[#8a5a32]">Fruchtstände</div>
                    <div className="space-y-0.5">
                        {data.slots.map((slot) => {
                            const SlotIcon = statusEffectIcon(slot.statusEffect);
                            const slotBoost = wetterBoost(slot.statusEffects);
                            return (
                                <div key={slot.index} className="flex items-center justify-between gap-2 text-[11px]">
                                    <span className={`flex items-center gap-1.5 ${slot.ready ? "font-bold text-[#2f6b2c]" : "text-[#8a7a5a]"}`}>
                                        {/* Reife Frucht im Zustand, in dem man sie erntet — die Veredelung
                                            hängt am Fruchtstand, nicht an der Staude. */}
                                        {slot.ready && plant.fruitImage ? (
                                            <SpecialItemIcon
                                                item={{ image: plant.fruitImage, name: plant.name }}
                                                special={slot.specialType}
                                                statusEffect={slot.statusEffect}
                                                className="h-4 w-4"
                                            />
                                        ) : (
                                            <span className="h-2 w-2 border" style={{ borderColor: HOLZ, background: slot.ready ? "#5faa45" : "#d8c08a" }} />
                                        )}
                                        {slot.ready ? `Größe ${slot.size}` : formatDuration(slot.readyAt - now)}
                                    </span>
                                    {/* Sonderform und Wetter je Fruchtstand — nicht mehr pauschal für die Staude */}
                                    <span className="flex shrink-0 items-center gap-2">
                                        {slot.ready && slot.statusEffect ? (
                                            <span className={`flex items-center gap-1 ${TON.wetter}`}>
                                                {SlotIcon ? <SlotIcon size={10} /> : null}
                                                +{Math.round((slotBoost - 1) * 100)}%
                                            </span>
                                        ) : null}
                                        {slot.ready && slot.specialType ? (
                                            <span className={`flex items-center gap-1 ${slot.specialType === "Golden" ? TON.gold : TON.rainbow}`}>
                                                {slot.specialType === "Golden" ? <SpecialIcon.golden size={10} /> : <SpecialIcon.rainbow size={10} />}
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
        </PergamentKarte>
    );
}
