// ui/fenster/RucksackFenster.jsx
// Rucksack (Samen, Ernte, Eier, Tiere, Deko, Werkzeuge) und der Hover-Tooltip seiner Gegenstände.
// Reine Anzeige — Zustand und Aktionen kommen aus GameContainer.jsx.
import React from "react";
import { getToolImage, withVisuals, sortiere, INVENTAR_SORTIERUNGEN, SortierLeiste } from "../../engine/gameConstants";
import { GardenModal, TabBar, RarityLabel, LeerHinweis } from "../gardenUi";
import { HudIcon } from "../gameIcons";
import { formatGold, categoryIcon, RARITY_BORDER, RARITY_DOT } from "../gardenTokens";
import { itemSpecialName } from "../itemTints";
import { groesseText } from "../groesse";
import { SpecialItemIcon } from "../ItemIcon";
import { wetterListe, wetterBoost } from "../../engine/PlantSystem";
import { PET_ABILITY_LABELS } from "../../engine/PetSystem";

export function RucksackFenster({
    toolInventory, inventory, harvestedItems, eggInventory, petInventory, decoInventory,
    inventoryFilter, inventarSortierung, inventoryMaxSlots, setItemHoverTooltip, setBackpackOpen,
    setInventoryFilter, setInventarSortierung, setSelectedTool, setMovingPlantSource,
    setSelectedPetToPlace, setSelectedDecoToPlace, setSelectedCarryItem, setSelectedSeed,
}) {
    const toolItems = [
        ...(toolInventory.pickaxeUses > 0 ? [{ id: "tool_pickaxe", name: "Spitzhacke", emoji: "⛏️", image: getToolImage("pickaxe"), rarity: "UNCOMMON", amount: toolInventory.pickaxeUses, _type: "tool" }] : []),
        ...(toolInventory.hasShovel ? [{ id: "tool_shovel", name: "Schaufel", emoji: "🪓", image: getToolImage("shovel"), rarity: "COMMON", amount: "∞", _type: "tool" }] : []),
        ...(toolInventory.plantPots > 0 ? [{ id: "tool_pots", name: "Plant Pot", emoji: "🪴", image: getToolImage("pot"), rarity: "COMMON", amount: toolInventory.plantPots, _type: "tool" }] : []),
        ...(toolInventory.wateringCans > 0 ? [{ id: "tool_watering", name: "Gießkanne", emoji: "🪣", image: getToolImage("watering"), rarity: "COMMON", amount: toolInventory.wateringCans, _type: "tool" }] : []),
    ];
    const allItems = [
        ...inventory.map(s => ({ ...withVisuals(s), _type: "seed" })),
        ...harvestedItems.map(p => ({ ...withVisuals(p), _type: "plant" })),
        ...eggInventory.map(e => ({ ...e, _type: "egg" })),
        ...petInventory.map(p => ({ ...p, _type: "pet" })),
        ...decoInventory.map(d => ({ ...d, _type: "deco" })),
        ...toolItems,
    ];
    // Slot cap applies only to seeds + harvested plants (the expandable main inventory)
    const slottedItems = inventory.length + harvestedItems.length;
    const backpackFilters = ["all", "seed", "plant", "egg", "pet", "deco", "tool"];
    const filterLabels = { all: "Alle", seed: "Samen", plant: "Ernte", egg: "Eier", pet: "Tiere", deco: "Deko", tool: "Werkzeug" };
    const activeFilter = inventoryFilter || "all";
    const gefiltert = activeFilter === "all" ? allItems : allItems.filter(i => i._type === activeFilter);
    const displayed = sortiere(gefiltert, INVENTAR_SORTIERUNGEN, inventarSortierung);
    const fillRatio = inventoryMaxSlots > 0 ? slottedItems / inventoryMaxSlots : 0;
    // Was die Ernte im Rucksack einbringt — dieselbe Angabe wie in der
    // Kiste, damit man nicht erst zum Markt laufen muss, um es zu sehen.
    const lagerwert = harvestedItems.reduce((s, i) => s + (Number(i?.sellValue) || 0), 0);
    return (
    <GardenModal
        title="Rucksack"
        subtitle="Deko, Tiere und Werkzeug belegen keine Slots"
        onClose={() => { setItemHoverTooltip(null); setBackpackOpen(false); }}
        breite="gross"
        headerRight={
            <div className="flex items-center gap-3">
                {lagerwert > 0 && (
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-400 tabular-nums whitespace-nowrap">
                        <HudIcon.gold size={13} />
                        {formatGold(lagerwert)}
                    </span>
                )}
                <div className="flex items-center gap-2 w-40">
                    <div className="flex-1 h-1.5 rounded-xl bg-slate-800 overflow-hidden">
                        <div
                            className={`h-full transition-[width] duration-300 ${
                                fillRatio >= 1 ? "bg-rose-500" : fillRatio >= 0.75 ? "bg-amber-500" : "bg-emerald-500"
                            }`}
                            style={{ width: `${Math.min(100, fillRatio * 100)}%` }}
                        />
                    </div>
                    <span className={`text-[11px] tabular-nums whitespace-nowrap ${fillRatio >= 1 ? "text-rose-400" : "text-slate-400"}`}>
                        {slottedItems}/{inventoryMaxSlots}
                    </span>
                </div>
            </div>
        }
    >
            <TabBar
                active={activeFilter}
                onSelect={setInventoryFilter}
                accent="amber"
                tabs={backpackFilters.map((f) => ({
                    key: f,
                    label: filterLabels[f],
                    icon: categoryIcon(f),
                    count: f === "all" ? allItems.length : allItems.filter(i => i._type === f).length,
                }))}
            />
            <SortierLeiste
                wert={inventarSortierung}
                setzen={setInventarSortierung}
                optionen={INVENTAR_SORTIERUNGEN}
            />

            {/* Grid */}
            <div>
                {displayed.length === 0 ? (
                    <LeerHinweis>Nichts in dieser Kategorie</LeerHinweis>
                ) : (
                    <div className="grid grid-cols-8 gap-1.5">
                        {displayed.map((item, idx) => {
                            const isSeed = item._type === "seed";
                            const isPlant = item._type === "plant";
                            const isTool = item._type === "tool";
                            const isPet = item._type === "pet";
                            const isDeco = item._type === "deco";
                            const sp = itemSpecialName(item);
                            const spClass = sp === "Golden"
                                ? "border-amber-500"
                                : sp === "Rainbow"
                                ? "border-fuchsia-500"
                                : (RARITY_BORDER[item.rarity] || RARITY_BORDER.COMMON);
                            return (
                                <div key={item.id || item.instanceId || idx}
                                    onClick={() => {
                                        if (isSeed) {
                                            setSelectedTool(null);
                                            setMovingPlantSource(null);
                                            setSelectedPetToPlace(null);
                                            setSelectedDecoToPlace(null);
                                            setSelectedCarryItem(null);
                                            setSelectedSeed(item);
                                            setBackpackOpen(false);
                                        } else if (isPlant) {
                                            setSelectedSeed(null);
                                            setSelectedTool(null);
                                            setMovingPlantSource(null);
                                            setSelectedPetToPlace(null);
                                            setSelectedDecoToPlace(null);
                                            setSelectedCarryItem(item);
                                            setBackpackOpen(false);
                                        } else if (isPet) {
                                            setSelectedSeed(null);
                                            setSelectedTool(null);
                                            setMovingPlantSource(null);
                                            setSelectedCarryItem(null);
                                            setSelectedDecoToPlace(null);
                                            setSelectedPetToPlace(item);
                                            setBackpackOpen(false);
                                        } else if (isDeco) {
                                            setSelectedSeed(null);
                                            setSelectedTool(null);
                                            setMovingPlantSource(null);
                                            setSelectedCarryItem(null);
                                            setSelectedPetToPlace(null);
                                            setSelectedDecoToPlace(item);
                                            setBackpackOpen(false);
                                        }
                                    }}
                                    onMouseEnter={(e) => setItemHoverTooltip({ item, x: e.clientX, y: e.clientY })}
                                    onMouseMove={(e) => setItemHoverTooltip((prev) => prev ? { ...prev, x: e.clientX, y: e.clientY } : { item, x: e.clientX, y: e.clientY })}
                                    onMouseLeave={() => setItemHoverTooltip(null)}
                                    className={`group relative aspect-square rounded-2xl border flex items-center justify-center transition-colors bg-amber-950/20 ${spClass} ${(isSeed || isPlant || isPet || isDeco) ? "cursor-pointer hover:bg-amber-900/30" : "cursor-default"}`}>
                                    <SpecialItemIcon item={item} special={sp} className="w-9 h-9" emojiClassName="text-2xl" />
                                    {/* Tiere tragen Namen — bei mehreren Hühnern war sonst nur am
                                        Hovern zu erkennen, welches Chicky und welches Berta ist.
                                        Der Seltenheitspunkt rückt dafür nach oben. */}
                                    {isPet && (
                                        <span className="absolute inset-x-0 bottom-0 px-1 py-0.5 text-[8px] leading-tight text-center text-slate-200 truncate bg-slate-950/85 rounded-b-xl">
                                            {item.customName || item.name}
                                        </span>
                                    )}
                                    <span className={`absolute ${isPet ? "top-0.5" : "bottom-0.5"} right-0.5 w-1.5 h-1.5 rounded-full ${RARITY_DOT[item.rarity] || RARITY_DOT.COMMON}`} />
                                    {isTool && item.amount !== undefined && (
                                        <span className="absolute bottom-0.5 left-1 text-[9px] text-slate-300 tabular-nums">{item.amount}</span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
    </GardenModal>
    );
}

export function GegenstandTooltip({
    getItemTooltipStyle, itemHoverTooltip, getSpecialLabel, getStatusEffectLabel,
}) {
    return (
        <div
            // 1. ANPASSUNG: 'fixed' zentriert das Modal immer perfekt am Mauszeiger, egal was der Container macht!
            className="fixed z-[100] pointer-events-none bg-slate-900/95 border border-slate-700 rounded-2xl px-3 py-2 text-xs text-slate-200 shadow-xl min-w-[150px]"
            style={getItemTooltipStyle(itemHoverTooltip.x, itemHoverTooltip.y)}
        >
            <div className="font-medium text-white">{itemHoverTooltip.item.name || "Gegenstand"}</div>
            <RarityLabel rarity={itemHoverTooltip.item.rarity} />
            {itemHoverTooltip.item._type === "seed" && (
                <>
                    <div className="text-slate-400 text-[10px] mt-1">Auf ein freies Ackerfeld klicken zum Pflanzen</div>
                    {(itemHoverTooltip.item.shopPrice || itemHoverTooltip.item.sellPrice) && (
                        <div className="text-amber-400 font-semibold mt-0.5 tabular-nums">
                            {(itemHoverTooltip.item.shopPrice || itemHoverTooltip.item.sellPrice || 0).toLocaleString("de-DE")} Gold
                        </div>
                    )}
                </>
            )}
            {itemHoverTooltip.item._type === "plant" && (
                <>
                    <div className="text-amber-400 font-semibold mt-1 tabular-nums">
                        {(itemHoverTooltip.item.sellValue || 0).toLocaleString("de-DE")} Gold
                    </div>
                    {itemHoverTooltip.item.size !== undefined && (
                        <div className="text-slate-400 text-[11px] tabular-nums">{groesseText(itemHoverTooltip.item)} / 100</div>
                    )}
                    {getSpecialLabel(itemHoverTooltip.item.specialData) && (
                        <div className="text-fuchsia-400 text-[11px]">{getSpecialLabel(itemHoverTooltip.item.specialData)}</div>
                    )}
                    {/* Alle Wetter des Stücks; der Aufschlag ist ihr Produkt. */}
                    {wetterListe(itemHoverTooltip.item).length > 0 && (
                        <div className="text-sky-400 text-[11px]">
                            {wetterListe(itemHoverTooltip.item)
                                .map((e) => getStatusEffectLabel(e) || e).join(" · ")}
                            {" · +"}
                            {Math.round((wetterBoost(itemHoverTooltip.item) - 1) * 100)}
                            {" % Verkauf"}
                        </div>
                    )}
                </>
            )}
            {itemHoverTooltip.item._type === "pet" && itemHoverTooltip.item.ability && (
                <div className="mt-1.5 pt-1.5 border-t border-slate-800">
                    <div className="text-slate-200 text-[11px] font-medium">
                        {/* Alle drei Fähigkeiten aus der gemeinsamen Tabelle — der
                            Zweig kannte den Erntehelfer gar nicht und hat ihn als
                            „Samenfinder" beschriftet. */}
                        {PET_ABILITY_LABELS[itemHoverTooltip.item.ability.type] || "Fähigkeit"}
                        {" · Stufe "}{itemHoverTooltip.item.ability.level}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                        Platzieren und anklicken für Details.
                    </div>
                </div>
            )}
        </div>
    );
}
