// ui/hud/EditorLeiste.jsx
// Leiste des Deko-Editors (Bearbeiten-Modus der eigenen Farm).
// Reine Anzeige — Zustand und Aktionen kommen aus GameContainer.jsx.
import React from "react";
import { Taste } from "../pergament";
import { HudIcon, WeatherIcon } from "../gameIcons";
import { dekoLicht } from "../deko";
import { LICHT_MAX } from "../../engine/Renderer";
import { ItemIcon } from "../ItemIcon";

export function EditorLeiste({
    decoInventory, decoPlacements, mySlotIndex, selectedDecoToPlace, setSelectedDecoToPlace,
    setSelectedTool, setSelectedSeed, setSelectedCarryItem, setSelectedPetToPlace,
}) {
    return (
        // Holzbrett wie die Schnellleiste (06.11.), Deko-Felder aus Pergament
        <div className="absolute bottom-[7.6rem] left-1/2 max-w-[min(56rem,92vw)] -translate-x-1/2 border-[3px] p-2"
            style={{ borderColor: "#2b1d12", background: "repeating-linear-gradient(0deg, #8a5a32 0 18px, #7a4e2a 18px 20px)", boxShadow: "0 4px 0 0 #2b1d12" }}>
            <div className="mb-2 flex items-center gap-2 border-2 bg-[#f3e3c3] px-2 py-1" style={{ borderColor: "#3b2516" }}>
                <HudIcon.editor size={12} className="shrink-0" />
                <span className="text-[10px] font-bold text-[#3b2516]">
                    Einrichten — Klick wählt, Klick aufs Grundstück setzt ab,
                    {" "}<Taste>R</Taste> spiegelt,
                    {" "}Klick auf gesetzte Deko packt sie ein ·
                    {" "}<Taste>WASD</Taste> verschiebt die Ansicht, Mausrad zoomt
                </span>
                <span className="ml-auto flex items-center gap-2 text-[10px] font-bold tabular-nums text-[#6e4426]">
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
                                className={`flex items-center gap-1 border-2 px-1.5 py-px ${amLimit ? "bg-[#ffe066] text-[#8a3a2a]" : "bg-[#fffaf0] text-[#6e4426]"}`}
                                style={{ borderColor: "#3b2516" }}
                            >
                                <WeatherIcon.moonlight size={11} />
                                {eigeneLichter}/{LICHT_MAX} Lichter
                            </span>
                        );
                    })()}
                </span>
            </div>
            {decoInventory.length === 0 ? (
                <div className="px-2 py-3 text-xs font-bold text-[#f3e3c3]">
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
                                className={`flex h-12 w-12 items-center justify-center border-[3px] transition-transform duration-75 ${
                                    gewaehlt ? "-translate-y-0.5 bg-[#ffe066]" : "bg-[#f3e3c3] hover:-translate-y-0.5 hover:bg-[#fff3c4]"
                                }`}
                                style={{ borderColor: "#3b2516", boxShadow: gewaehlt ? "0 4px 0 0 #3b2516" : "0 2px 0 0 #3b2516" }}
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
