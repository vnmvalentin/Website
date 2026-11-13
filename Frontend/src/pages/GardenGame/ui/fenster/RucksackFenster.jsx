// ui/fenster/RucksackFenster.jsx
// Rucksack (Samen, Ernte, Eier, Tiere, Deko, Werkzeuge) und der Hover-Tooltip seiner Gegenstände.
// Reine Anzeige — Zustand und Aktionen kommen aus GameContainer.jsx.
import React from "react";
import { getToolImage, withVisuals, sortiere, INVENTAR_SORTIERUNGEN, SortierLeiste } from "../../engine/gameConstants";
import { RAR_FARBE, RAR_NAME } from "../pergamentFarben";
import { versionedAsset } from "../../engine/assetVersion";
import { HudIcon } from "../gameIcons";
import { formatGold, RARITY_BORDER } from "../gardenTokens";
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
    <RucksackRahmen
        onClose={() => { setItemHoverTooltip(null); setBackpackOpen(false); }}
        kopfRechts={
            <div className="flex items-center gap-3">
                {lagerwert > 0 && (
                    <span className="inline-flex items-center gap-1 border-2 border-[#3b2516] bg-[#ffe066] px-1.5 py-0.5 text-xs font-bold tabular-nums text-[#3b2516]">
                        <HudIcon.gold size={12} />
                        {formatGold(lagerwert)}
                    </span>
                )}
                {/* Füllstand als aufgenähter Streifen */}
                <div className="flex w-44 items-center gap-2">
                    <div className="h-3 flex-1 border-2 border-[#3f4622] bg-[#3f4622]/60">
                        <div
                            className="h-full transition-[width] duration-300"
                            style={{ width: `${Math.min(100, fillRatio * 100)}%`, background: fillRatio >= 1 ? "#c8403a" : fillRatio >= 0.75 ? "#e0a82a" : "#a8d06a", boxShadow: "inset 0 2px 0 0 rgba(255,255,255,0.35)" }}
                        />
                    </div>
                    <span className={`whitespace-nowrap text-[11px] font-bold tabular-nums ${fillRatio >= 1 ? "text-[#ffc4b8]" : "text-[#eef0d8]"}`}>
                        {slottedItems}/{inventoryMaxSlots}
                    </span>
                </div>
            </div>
        }
    >
            {/* Kategorien als aufgenähte Taschen */}
            <div className="mb-2 flex flex-wrap gap-1.5">
                {backpackFilters.map((fl) => {
                    const aktiv = activeFilter === fl;
                    const anzahl = fl === "all" ? allItems.length : allItems.filter(i => i._type === fl).length;
                    return (
                        <button key={fl} type="button" onClick={(ev) => { ev.currentTarget.blur(); setInventoryFilter(fl); }}
                            className={`border-2 px-2.5 py-1 text-[11px] font-bold transition-transform duration-75 ${aktiv ? "-translate-y-0.5" : "hover:-translate-y-0.5"}`}
                            style={{ borderColor: "#3f4622", background: aktiv ? "#d8c89a" : "#5a6432", color: aktiv ? "#3b2516" : "#eef0d8", outline: "1px dashed #a8b06a", outlineOffset: "-4px" }}>
                            {filterLabels[fl]} <span className="opacity-70">{anzahl}</span>
                        </button>
                    );
                })}
            </div>
            <SortierLeiste
                wert={inventarSortierung}
                setzen={setInventarSortierung}
                optionen={INVENTAR_SORTIERUNGEN}
            />

            {/* Grid */}
            <div>
                {displayed.length === 0 ? (
                    <p className="py-10 text-center text-sm font-bold text-[#eef0d8]/80">Hier ist gerade nichts drin.</p>
                ) : (
                    <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8 md:grid-cols-10">
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
                                    className={`group relative flex aspect-square items-center justify-center border-[3px] transition-transform duration-75 ${sp ? spClass : "border-[#3f4622]"} ${(isSeed || isPlant || isPet || isDeco) ? "cursor-pointer hover:-translate-y-0.5" : "cursor-default"}`}
                                    style={{ background: "#5a6432", boxShadow: "inset 0 3px 0 0 rgba(0,0,0,0.3)" }}>
                                    <SpecialItemIcon item={item} special={sp} className="w-9 h-9" emojiClassName="text-2xl" />
                                    {/* Tiere tragen Namen — bei mehreren Hühnern war sonst nur am
                                        Hovern zu erkennen, welches Chicky und welches Berta ist.
                                        Der Seltenheitspunkt rückt dafür nach oben. */}
                                    {isPet && (
                                        <span className="absolute inset-x-0 bottom-0 truncate border-t-2 border-[#2b1d12] bg-[#f3e3c3] px-1 py-px text-center text-[8px] font-bold leading-tight text-[#3b2516]">
                                            {item.customName || item.name}
                                        </span>
                                    )}
                                    <span className={`absolute ${isPet ? "top-0.5" : "bottom-0.5"} right-0.5 h-2 w-2 border border-[#2b1d12]`} style={{ background: RAR_FARBE[item.rarity] || RAR_FARBE.COMMON }} />
                                    {isTool && item.amount !== undefined && (
                                        <span className="absolute bottom-0.5 left-0.5 border border-[#2b1d12] bg-[#f3e3c3] px-0.5 text-[9px] font-bold leading-none tabular-nums text-[#3b2516]">{item.amount}</span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
    </RucksackRahmen>
    );
}

/**
 * Rucksack von innen (06.11.): grüner Segeltuchstoff mit Naht, oben die Klappe mit zwei
 * Lederriemen und Schnallen. Ersetzt das allgemeine GardenModal-Fenster.
 */
function RucksackRahmen({ onClose, kopfRechts, children }) {
    return (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4" role="dialog" aria-label="Rucksack">
            <div className="relative flex max-h-[88vh] w-full max-w-4xl flex-col">
                {/* Klappe */}
                <div className="relative z-10 mx-6 border-[4px] border-b-0 px-5 pb-3 pt-3" style={{ borderColor: "#2f3418", background: "#7a8646", boxShadow: "inset 0 4px 0 0 #9aa65e" }}>
                    {["18%", "78%"].map((links) => (
                        <span key={links} aria-hidden="true" className="absolute -bottom-6 top-0 w-6 border-x-[3px]" style={{ left: links, borderColor: "#3b2516", background: "#7a4a2a" }}>
                            <span className="absolute bottom-1 left-1/2 h-4 w-5 -translate-x-1/2 border-[3px]" style={{ borderColor: "#3b2516", background: "#c8a04a" }} />
                        </span>
                    ))}
                    <div className="relative flex items-center justify-between gap-3">
                        <img src={versionedAsset("/garden-assets/tools/rucksack.png")} alt="" draggable={false} className="h-12 w-12 object-contain" style={{ imageRendering: "pixelated" }} />
                        <div className="flex-1 border-[3px] border-[#3b2516] bg-[#f3e3c3] px-3 py-1" style={{ boxShadow: "0 3px 0 0 #3b2516" }}>
                            <h2 className="text-lg font-bold leading-tight text-[#3b2516]">Rucksack</h2>
                            <div className="text-[11px] text-[#6e4426]">Deko, Tiere und Werkzeug belegen keine Plätze</div>
                        </div>
                        <button type="button" onClick={onClose} aria-label="Schließen"
                            className="flex h-9 w-9 items-center justify-center border-[3px] border-[#3b2516] bg-[#f3e3c3] hover:bg-[#ffd0c4]" style={{ boxShadow: "0 3px 0 0 #3b2516" }}>
                            <HudIcon.close size={16} />
                        </button>
                    </div>
                </div>
                {/* Körper */}
                <div className="flex min-h-0 flex-1 flex-col border-[4px] px-4 pb-4 pt-6 sm:px-5"
                    style={{ borderColor: "#2f3418", background: "#6f7a3e", boxShadow: "0 6px 0 0 #2f3418", outline: "2px dashed #a8b06a", outlineOffset: "-10px" }}>
                    <div className="mb-2 flex flex-wrap items-center justify-end gap-2">{kopfRechts}</div>
                    <div className="min-h-0 flex-1 overflow-y-auto pr-1" style={{ overscrollBehavior: "contain" }}>
                        {children}
                    </div>
                </div>
            </div>
        </div>
    );
}

export function GegenstandTooltip({
    getItemTooltipStyle, itemHoverTooltip, getSpecialLabel, getStatusEffectLabel,
}) {
    return (
        <div
            // 1. ANPASSUNG: 'fixed' zentriert das Modal immer perfekt am Mauszeiger, egal was der Container macht!
            // Holz-und-Pergament-Look (06.11.), Seltenheit als Band links
            className="pointer-events-none fixed z-[100] min-w-[160px] border-[3px] border-l-[8px] px-3 py-2 text-xs text-[#3b2516]"
            style={{ ...getItemTooltipStyle(itemHoverTooltip.x, itemHoverTooltip.y), background: "#f3e3c3", borderColor: "#3b2516", borderLeftColor: RAR_FARBE[itemHoverTooltip.item.rarity] || RAR_FARBE.COMMON, boxShadow: "0 4px 0 0 #3b2516" }}
        >
            <div className="text-sm font-bold text-[#3b2516]">{itemHoverTooltip.item.name || "Gegenstand"}</div>
            <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: RAR_FARBE[itemHoverTooltip.item.rarity] || RAR_FARBE.COMMON }}>
                {RAR_NAME[itemHoverTooltip.item.rarity] || itemHoverTooltip.item.rarity || "Gewöhnlich"}
            </div>
            {itemHoverTooltip.item._type === "seed" && (
                <>
                    <div className="mt-1 text-[10px] text-[#6e4426]">Auf ein freies Ackerfeld klicken zum Pflanzen</div>
                    {(itemHoverTooltip.item.shopPrice || itemHoverTooltip.item.sellPrice) && (
                        <div className="mt-0.5 font-bold tabular-nums text-[#a8740f]">
                            {(itemHoverTooltip.item.shopPrice || itemHoverTooltip.item.sellPrice || 0).toLocaleString("de-DE")} Gold
                        </div>
                    )}
                </>
            )}
            {itemHoverTooltip.item._type === "plant" && (
                <>
                    <div className="mt-1 font-bold tabular-nums text-[#a8740f]">
                        {(itemHoverTooltip.item.sellValue || 0).toLocaleString("de-DE")} Gold
                    </div>
                    {itemHoverTooltip.item.size !== undefined && (
                        <div className="text-[11px] tabular-nums text-[#6e4426]">{groesseText(itemHoverTooltip.item)} / 100</div>
                    )}
                    {getSpecialLabel(itemHoverTooltip.item.specialData) && (
                        <div className="text-[11px] font-bold text-[#a8307a]">{getSpecialLabel(itemHoverTooltip.item.specialData)}</div>
                    )}
                    {/* Alle Wetter des Stücks; der Aufschlag ist ihr Produkt. */}
                    {wetterListe(itemHoverTooltip.item).length > 0 && (
                        <div className="text-[11px] font-bold text-[#2f6a9a]">
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
                <div className="mt-1.5 border-t-2 border-[#d9c39a] pt-1.5">
                    <div className="text-[11px] font-bold text-[#3b2516]">
                        {/* Alle drei Fähigkeiten aus der gemeinsamen Tabelle — der
                            Zweig kannte den Erntehelfer gar nicht und hat ihn als
                            „Samenfinder" beschriftet. */}
                        {PET_ABILITY_LABELS[itemHoverTooltip.item.ability.type] || "Fähigkeit"}
                        {" · Stufe "}{itemHoverTooltip.item.ability.level}
                    </div>
                    <div className="mt-0.5 text-[10px] text-[#8a7a5a]">
                        Platzieren und anklicken für Details.
                    </div>
                </div>
            )}
        </div>
    );
}
