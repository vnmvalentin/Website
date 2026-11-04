// ui/hud/HudUnten.jsx
// Spielanzeige unten: Schnellleiste (Samen/Gegenstände), Werkzeug-Ausrüstung und Editor-Knopf links.
// Reine Anzeige — Zustand und Aktionen kommen aus GameContainer.jsx.
import React from "react";
import { HUD_SURFACE } from "../gardenTokens";
import { itemSpecialName } from "../itemTints";
import { hatTooltip, getToolImage } from "../../engine/gameConstants";
import { SpecialItemIcon } from "../ItemIcon";
import { HudIcon } from "../gameIcons";

export function Schnellleiste({
    hotbarItems, selectedSeed, selectedCarryItem, selectedPetToPlace, selectedDecoToPlace,
    setSelectedSeed, setSelectedCarryItem, setSelectedPetToPlace, setSelectedDecoToPlace,
    setSelectedTool, setMovingPlantSource, setItemHoverTooltip,
}) {
    return (
        <div className={`absolute bottom-5 left-1/2 -translate-x-1/2 flex gap-1.5 p-2 ${HUD_SURFACE}`}>
            {Array(9).fill(null).map((_, i) => {
                const item = hotbarItems[i];

                // instanceId always takes priority over generic id to avoid false multi-matches
                const selectedSeedKey = selectedSeed?.instanceId ? `seed:${selectedSeed.instanceId}` : null;
                const selectedCarryKey = (selectedCarryItem?.instanceId || selectedCarryItem?.id)
                    ? `carry:${selectedCarryItem.instanceId || selectedCarryItem.id}`
                    : null;
                const selectedPetKey = (selectedPetToPlace?.instanceId || selectedPetToPlace?.id)
                    ? `pet:${selectedPetToPlace.instanceId || selectedPetToPlace.id}`
                    : null;
                const selectedDecoKey = (selectedDecoToPlace?.instanceId || selectedDecoToPlace?.id)
                    ? `deco:${selectedDecoToPlace.instanceId || selectedDecoToPlace.id}`
                    : null;

                const itemSeedKey = item?._type === "seed" && item?.instanceId ? `seed:${item.instanceId}` : null;
                const itemCarryKey = item?._type === "plant" && (item?.instanceId || item?.id)
                    ? `carry:${item.instanceId || item.id}`
                    : null;
                const itemPetKey = item?._type === "pet" && (item?.instanceId || item?.id)
                    ? `pet:${item.instanceId || item.id}`
                    : null;
                const itemDecoKey = item?._type === "deco" && (item?.instanceId || item?.id)
                    ? `deco:${item.instanceId || item.id}`
                    : null;

                const isHeldItem = Boolean(
                    (selectedSeedKey && itemSeedKey && selectedSeedKey === itemSeedKey)
                    || (selectedCarryKey && itemCarryKey && selectedCarryKey === itemCarryKey)
                    || (selectedPetKey && itemPetKey && selectedPetKey === itemPetKey)
                    || (selectedDecoKey && itemDecoKey && selectedDecoKey === itemDecoKey)
                );

                const itemSpecial = itemSpecialName(item);
                const specialRingClass = itemSpecial === "Golden"
                    ? "border-amber-500"
                    : itemSpecial === "Rainbow"
                    ? "border-fuchsia-500"
                    : "";

                return (
                    <div key={i}
                        onClick={(e) => {
                            e.stopPropagation();

                            // Eindeutige ID des angeklickten Items herausfinden
                            const clickedId = item?.instanceId || item?.id;

                            // 1. Prüfen, ob genau DIESE ID gerade in der Hand ist
                            const isAlreadySelected = 
                                (selectedSeed && (selectedSeed.instanceId === clickedId || selectedSeed.id === clickedId)) || 
                                (selectedCarryItem && (selectedCarryItem.instanceId === clickedId || selectedCarryItem.id === clickedId)) || 
                                (selectedPetToPlace && (selectedPetToPlace.instanceId === clickedId || selectedPetToPlace.id === clickedId)) || 
                                (selectedDecoToPlace && (selectedDecoToPlace.instanceId === clickedId || selectedDecoToPlace.id === clickedId));

                            if (isAlreadySelected) {
                                // 2. Wenn es schon in der Hand ist -> Abwählen (Einstecken)
                                setSelectedSeed(null);
                                setSelectedCarryItem(null);
                                setSelectedPetToPlace(null);
                                setSelectedDecoToPlace(null);
                            } else {
                                // 3. Wenn nicht -> Erstmal die Hände komplett frei machen
                                setSelectedSeed(null); 
                                setSelectedCarryItem(null); 
                                setSelectedPetToPlace(null); 
                                setSelectedDecoToPlace(null);
                                setSelectedTool(null); 
                                setMovingPlantSource(null);

                                // 4. Das richtige Item in die Hand nehmen
                                if (item?._type === "seed") {
                                    setSelectedSeed(item);
                                } else if (item?._type === "pet") {
                                    setSelectedPetToPlace(item);
                                } else if (item?._type === "deco") {
                                    setSelectedDecoToPlace(item);
                                } else {
                                    // Fallback für alles andere (Pflanzen, Früchte, etc.)
                                    setSelectedCarryItem(item);
                                }
                            }
                        }}

                        onMouseEnter={(e) => {
                            if (!hatTooltip(item)) return;
                            // 1. ANPASSUNG: Direkt e.clientX nutzen (ohne Abzug), passend zum 'fixed' Tooltip
                            setItemHoverTooltip({ item, x: e.clientX, y: e.clientY });
                        }}
                        onMouseMove={(e) => {
                            if (!hatTooltip(item)) return;
                            setItemHoverTooltip((prev) => prev ? { ...prev, x: e.clientX, y: e.clientY } : { item, x: e.clientX, y: e.clientY });
                        }}
                        onMouseLeave={() => setItemHoverTooltip(null)}
                        className={`relative w-[50px] h-[50px] bg-slate-800/70 rounded-2xl border flex items-center justify-center transition-colors cursor-pointer group
                            ${item ? "border-slate-700 hover:border-slate-500" : "border-slate-800"}
                            ${isHeldItem ? "border-violet-500 bg-slate-800" : specialRingClass}`}>
                        <span className="absolute top-0.5 left-1 text-[9px] font-medium text-slate-600 tabular-nums">{i + 1}</span>
                        {item && (
                            <SpecialItemIcon item={item} special={itemSpecial} className="w-8 h-8" emojiClassName="text-2xl" />
                        )}
                        {isHeldItem && (
                            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-violet-500" />
                        )}
                    </div>
                );
            })}
        </div>
    );
}

export function Ausruestung({
    istGartenAdmin, equippedTools, selectedTool, setSelectedSeed, setSelectedPetToPlace,
    setSelectedDecoToPlace, setSelectedCarryItem, setSelectedTool, setMovingPlantSource,
}) {
    return (
        <div className={`absolute bottom-5 left-1/2 translate-x-[286px] flex gap-1.5 p-2 ${HUD_SURFACE}`}>
            {[
                { key: "shovel", label: "Schaufel", hotkey: "1" },
                { key: "pot", label: "Topf", hotkey: "2" },
                { key: "pickaxe", label: "Hacke", hotkey: "3" },
                { key: "watering", label: "Kanne", hotkey: "4" },
                // Nur beim Admin, und nur dort auch sichtbar: bei allen anderen
                // fehlt der Platz ganz, statt leer und grau danebenzustehen.
                ...(istGartenAdmin
                    ? [{ key: "shotgun", label: "Shotgun — auf einen Mitspieler klicken", hotkey: "5" }]
                    : []),
            ].map((slot) => {
                const owned = Boolean(equippedTools[slot.key]);
                const isActive = selectedTool === slot.key;
                // Für Werkzeuge gibt es gezeichnete Bilder — die gehören hierhin,
                // nicht ein generisches Icon.
                const toolImage = getToolImage(slot.key);
                return (
                    <button
                        type="button"
                        key={slot.key}
                        title={`${slot.label} — Taste ${slot.hotkey}`}
                        onClick={(e) => {
                            e.currentTarget.blur();
                            if (!owned) return;
                            setSelectedSeed(null);
                            setSelectedPetToPlace(null);
                            setSelectedDecoToPlace(null);
                            setSelectedCarryItem(null);
                            setSelectedTool(prev => (prev === slot.key ? null : slot.key));
                            if (slot.key !== "pot") setMovingPlantSource(null);
                        }}
                        className={`relative w-[50px] h-[50px] rounded-2xl border flex flex-col items-center justify-center gap-0.5 transition-colors focus:outline-none ${
                            isActive
                                ? "border-violet-500 bg-slate-800"
                                : owned
                                    ? "border-slate-700 bg-slate-800/60 hover:border-slate-500 cursor-pointer"
                                    : "border-slate-800 bg-slate-900/40 cursor-default"
                        }`}
                    >
                        <span className="absolute top-0.5 left-1 text-[9px] text-slate-600 tabular-nums">{slot.hotkey}</span>
                        <img
                            src={toolImage}
                            alt=""
                            draggable={false}
                            className={`w-6 h-6 object-contain ${owned ? "" : "opacity-25 grayscale"}`}
                        />
                        <span className={`text-[10px] tabular-nums ${owned ? "text-slate-200" : "text-slate-700"}`}>
                            {owned ? equippedTools[slot.key].name : "0"}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}

export function HudUntenLinks({
    editorAktiv, setSelectedDecoToPlace, setVerschiebtGebaeude, flushFarmStateToServerRef,
    setEditorAktiv,
}) {
    return (
        <div className="absolute bottom-5 left-5 flex flex-col gap-2">
            {/* Einrichten: Raster einblenden, Deko setzen und einpacken, Gebäude
                umstellen. Ausserhalb passiert davon nichts — im normalen Spiel
                hat ein Klick daneben sonst dauernd Deko eingesammelt. */}
            <button
                type="button"
                onClick={() => {
                    if (editorAktiv) {
                        setSelectedDecoToPlace(null);
                        setVerschiebtGebaeude(null);
                        // Bisher hing das Sichern von Deko-Änderungen komplett am
                        // allgemeinen 5-Sekunden-Autosave — der Timer läuft bei
                        // JEDER Aktion neu an, eine ganze Dekorier-Session konnte
                        // also lange ungesichert bleiben. Ein Besucher sah in der
                        // Zwischenzeit den alten Stand (fehlende/verschobene Deko).
                        // Jetzt wird beim Verlassen des Editors sofort gesichert,
                        // zusätzlich zum weiterlaufenden Autosave. (Kein Aufruf
                        // innerhalb von setEditorAktiv selbst — React darf Updater-
                        // Funktionen mehrfach ausführen, ein PUT gehört da nicht rein.)
                        flushFarmStateToServerRef.current?.();
                    }
                    setEditorAktiv((an) => !an);
                }}
                className={`flex h-10 items-center gap-2 ${HUD_SURFACE} pl-1.5 pr-3 text-xs font-medium transition-colors ${
                    editorAktiv ? "text-violet-300" : "text-slate-300 hover:text-white"
                }`}
            >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border-2 border-amber-950/40 bg-amber-50">
                    <HudIcon.editor size={17} />
                </span>
                <span className="hidden sm:inline">{editorAktiv ? "Editor beenden" : "Editor"}</span>
            </button>
        </div>
    );
}
