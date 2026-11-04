// ui/hud/EditorLeiste.jsx
// Leiste des Deko-Editors (Bearbeiten-Modus der eigenen Farm).
// Reine Anzeige — Zustand und Aktionen kommen aus GameContainer.jsx.
import React from "react";
import { HUD_SURFACE } from "../gardenTokens";
import { HudIcon, WeatherIcon } from "../gameIcons";
import { dekoLicht } from "../deko";
import { LICHT_MAX } from "../../engine/Renderer";
import { ItemIcon } from "../ItemIcon";

export function EditorLeiste({
    decoInventory, decoPlacements, mySlotIndex, selectedDecoToPlace, setSelectedDecoToPlace,
    setSelectedTool, setSelectedSeed, setSelectedCarryItem, setSelectedPetToPlace,
}) {
    return (
        <div className={`absolute bottom-24 left-1/2 -translate-x-1/2 max-w-[min(56rem,92vw)] ${HUD_SURFACE} p-2`}>
            <div className="flex items-center gap-2 mb-1.5 px-1">
                <HudIcon.editor size={12} className="shrink-0" />
                <span className="text-[10px] uppercase tracking-wider font-semibold text-amber-100">
                    Einrichten — Klick wählt, Klick aufs Grundstück setzt ab,
                    {" "}<kbd className="bg-slate-800 border border-slate-700 px-1 rounded-xl text-slate-200">R</kbd> spiegelt,
                    {" "}Klick auf gesetzte Deko packt sie ein
                </span>
                <span className="ml-auto flex items-center gap-2 text-[10px] font-semibold text-amber-100/90 tabular-nums">
                    {decoInventory.length} vorrätig · {decoPlacements.filter((d) => d.slotIndex === mySlotIndex).length} aufgestellt
                    {(() => {
                        // Feedback 30.08.: "Lichter-Limit im Editor anzeigen" — LICHT_MAX
                        // (Renderer.js) begrenzt, wie viele Laternen gleichzeitig LEUCHTEN
                        // (die dem Spieler nächsten gewinnen, siehe _sichtbareLichter);
                        // zusätzliche bleiben stehen, bleiben aber dunkel. Ohne diese Zahl
                        // wirkte eine ausgegangene Laterne wie ein Fehler, nicht wie ein
                        // erwartetes Limit.
                        const eigeneLichter = decoPlacements
                            .filter((d) => d.slotIndex === mySlotIndex && dekoLicht(d.decoId)).length;
                        if (eigeneLichter === 0) return null;
                        const amLimit = eigeneLichter >= LICHT_MAX;
                        return (
                            <span
                                title={amLimit
                                    ? "Nur die dir nächsten Laternen leuchten gleichzeitig — weiter entfernte bleiben dunkel."
                                    : "So viele deiner Laternen können gleichzeitig leuchten."}
                                className={`flex items-center gap-1 rounded-lg border px-1.5 py-0.5 ${
                                    amLimit ? "border-amber-400/60 text-amber-300" : "border-amber-100/20 text-amber-100/70"
                                }`}
                            >
                                <WeatherIcon.moonlight size={11} />
                                {eigeneLichter}/{LICHT_MAX} Lichter
                            </span>
                        );
                    })()}
                </span>
            </div>
            {decoInventory.length === 0 ? (
                <div className="px-2 py-3 text-xs text-amber-100/80">
                    Keine Deko im Vorrat — im Deko-Shop gibt es Nachschub.
                </div>
            ) : (
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto" style={{ overscrollBehavior: "contain" }}>
                    {decoInventory.map((deko) => {
                        const key = deko.instanceId || deko.id;
                        const gewaehlt = (selectedDecoToPlace?.instanceId || selectedDecoToPlace?.id) === key;
                        return (
                            <button
                                key={key}
                                type="button"
                                title={deko.name}
                                onClick={() => {
                                    setSelectedDecoToPlace(gewaehlt ? null : { ...deko, _type: "deco" });
                                    setSelectedTool(null);
                                    setSelectedSeed(null);
                                    setSelectedCarryItem(null);
                                    setSelectedPetToPlace(null);
                                }}
                                className={`w-12 h-12 rounded-xl border flex items-center justify-center transition-colors ${
                                    gewaehlt
                                        ? "border-violet-500 bg-violet-600/20"
                                        : "border-slate-800 bg-slate-900/60 hover:border-slate-600"
                                }`}
                            >
                                <ItemIcon item={deko} className="w-9 h-9" emojiClassName="text-2xl" />
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
