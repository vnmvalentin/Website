// ui/hud/HudUnten.jsx
// Spielanzeige unten: Schnellleiste (Samen/Gegenstände), Werkzeug-Ausrüstung und Editor-Knopf links.
// Reine Anzeige — Zustand und Aktionen kommen aus GameContainer.jsx.
import React from "react";
import { itemSpecialName } from "../itemTints";
import { hatTooltip, getToolImage } from "../../engine/gameConstants";
import { SpecialItemIcon } from "../ItemIcon";
import { versionedAsset } from "../../engine/assetVersion";

// 06.11.: statt brauner Knöpfe — die Schnellleiste ist ein Holzbrett, die Werkzeuge
// stecken in einem Ledergürtel, Editor und Rucksack sind nur noch ihr Bild.
const BRETT = {
    borderColor: "#3b2516",
    background: "repeating-linear-gradient(0deg, #8a5a32 0 9px, #7a4d2a 9px 11px)",
    boxShadow: "0 4px 0 0 #3b2516",
};
const GUERTEL = {
    borderColor: "#3b2516",
    background: "#7a4a2a",
    boxShadow: "0 4px 0 0 rgba(43,29,18,0.6), inset 0 3px 0 0 #9a6a3a",
    outline: "2px dashed #c8925a",
    outlineOffset: "-7px",
};
import { rauschJetzt, RAUSCH_SCHONZEIT_S } from "../rausch";

export function Schnellleiste({
    hotbarItems, selectedSeed, selectedCarryItem, selectedPetToPlace, selectedDecoToPlace,
    setSelectedSeed, setSelectedCarryItem, setSelectedPetToPlace, setSelectedDecoToPlace,
    setSelectedTool, setMovingPlantSource, setItemHoverTooltip, ernteRausch,
}) {
    // Ernte-Rausch (Backend garden/core/rausch.js) als schmaler Balken direkt über
    // den Plätzen — seit 04.11. hier statt in der Info-Tafel oben rechts, weil man
    // beim Ernten ohnehin auf die Leiste schaut.
    const r = rauschJetzt(ernteRausch);
    return (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex flex-col gap-1.5 border-[3px] p-2" style={BRETT}>
            <div
                className="flex items-center gap-2 px-1 text-[11px] font-bold text-[#f3e3c3]"
                title={`Ernte regelmäßig (spätestens alle ${RAUSCH_SCHONZEIT_S} Sekunden): nach zehn Minuten bringt jede Ernte +15 %. Machst du länger Pause, sinkt der Rausch wieder.`}
            >
                <span className="shrink-0">Ernte-Rausch</span>
                <div className="h-2.5 flex-1 overflow-hidden border-2 border-[#3b2516] bg-[#3b2516]/60">
                    <div
                        className={`h-full transition-[width] duration-700 ${r.sinkt ? "bg-[#e0a82a]" : "bg-[#5faa45]"}`}
                        style={{ width: `${Math.round(r.fuellung * 100)}%`, boxShadow: "inset 0 2px 0 0 rgba(255,255,255,0.35)" }}
                    />
                </div>
                <span className={`w-10 shrink-0 text-right tabular-nums ${r.prozent > 0 ? (r.sinkt ? "text-[#ffe066]" : "text-[#b8e88a]") : "text-[#c9b48a]"}`}>
                    +{r.prozent} %
                </span>
            </div>
            <div className="flex gap-1.5">
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
                        className={`relative flex h-[50px] w-[50px] cursor-pointer items-center justify-center border-[3px] transition-transform duration-75 group
                            ${isHeldItem ? "-translate-y-1 border-[#fff3c4] bg-[#8a5a32]" : item ? "border-[#3b2516] bg-[#4a2f1c] hover:-translate-y-0.5" : "border-[#3b2516] bg-[#4a2f1c]/70"}
                            ${isHeldItem ? "" : specialRingClass}`}
                        style={{ boxShadow: isHeldItem ? "0 4px 0 0 #3b2516" : "inset 0 3px 0 0 rgba(0,0,0,0.35)" }}>
                        <span className="absolute top-0.5 left-1 text-[9px] font-bold text-[#a8743f] tabular-nums">{i + 1}</span>
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
        </div>
    );
}

export function Ausruestung({
    istGartenAdmin, equippedTools, selectedTool, setSelectedSeed, setSelectedPetToPlace,
    setSelectedDecoToPlace, setSelectedCarryItem, setSelectedTool, setMovingPlantSource,
}) {
    return (
        <div className="absolute bottom-6 left-1/2 flex translate-x-[286px] items-end gap-1.5 border-y-[3px] px-2 pb-1.5 pt-3" style={GUERTEL}>
            {/* Gürtelschnalle */}
            <span aria-hidden="true" className="absolute -left-3 top-1/2 h-8 w-6 -translate-y-1/2 border-[3px]" style={{ borderColor: "#3b2516", background: "#c8a04a", boxShadow: "inset 0 0 0 3px #7a5a1a" }} />
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
                        className={`relative flex h-[54px] w-[48px] flex-col items-center justify-center border-[3px] transition-transform duration-75 focus:outline-none ${
                            isActive
                                ? "-translate-y-2 border-[#fff3c4] cursor-pointer"
                                : owned
                                    ? "border-[#3b2516] hover:-translate-y-1 cursor-pointer"
                                    : "border-[#3b2516] cursor-default"
                        }`}
                        style={{ background: owned ? "#5a3420" : "#4a2a18", boxShadow: isActive ? "0 4px 0 0 #3b2516" : "inset 0 6px 0 0 #7a4a2a" }}
                    >
                        <span className="absolute top-0 left-1 text-[9px] font-bold text-[#c8925a] tabular-nums">{slot.hotkey}</span>
                        <img
                            src={toolImage}
                            alt=""
                            draggable={false}
                            className={`h-9 w-9 object-contain ${owned ? "" : "opacity-25 grayscale"}`}
                            style={{ imageRendering: "pixelated" }}
                        />
                        {owned && (
                            <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 border-2 border-[#3b2516] bg-[#f3e3c3] px-1 text-[9px] font-bold leading-tight text-[#3b2516] tabular-nums">
                                {equippedTools[slot.key].name}
                            </span>
                        )}
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
                title={editorAktiv ? "Einrichten beenden" : "Einrichten: Deko setzen und das Haus umstellen"}
                aria-label={editorAktiv ? "Einrichten beenden" : "Einrichten"}
                className="group relative flex flex-col items-center transition-transform duration-100 hover:-translate-y-1 focus:outline-none"
            >
                <img src={versionedAsset("/garden-assets/icons/hud/editor_pixel.png")} alt="" draggable={false}
                    className="h-16 w-16 object-contain drop-shadow-[0_4px_0_rgba(43,29,18,0.6)] transition-transform duration-100 group-hover:-rotate-6"
                    style={{ imageRendering: "pixelated" }} />
                {editorAktiv && (
                    <span className="-mt-1 border-2 border-[#3b2516] bg-[#fff3c4] px-1.5 py-0.5 text-[10px] font-bold text-[#3b2516]">Fertig</span>
                )}
            </button>
        </div>
    );
}
