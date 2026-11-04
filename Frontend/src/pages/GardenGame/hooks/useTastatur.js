// hooks/useTastatur.js
// Tastenkürzel: Rucksack, Werkzeuge/Schnellleiste, Deko drehen/spiegeln, Editor, Schnellreise.
// (Laufen steuert die Spielschleife.) Ausgelagert aus GameContainer.jsx, Code unverändert.
import { useEffect } from "react";
import { istBoden } from "../ui/deko";

export default function useTastatur({
    showLobbyScreen, setBackpackOpen, setItemHoverTooltip, selectedDecoToPlaceRef, setDecoRotiert,
    setDecoGespiegelt, editorAktivRef, setEditorAktiv, setSelectedDecoToPlace,
    setVerschiebtGebaeude, toolInventoryRef, setSelectedSeed, setSelectedPetToPlace,
    setSelectedCarryItem, setSelectedTool, setMovingPlantSource, istGartenAdminRef,
    teleportToMarketArea, teleportToShopArea, teleportToMyFarm,
}) {
    useEffect(() => {
        if (showLobbyScreen) return undefined;
        const onKeyDown = (e) => {
            const target = e.target;
            const tag = (target?.tagName || "").toLowerCase();
            if (tag === "input" || tag === "textarea" || target?.isContentEditable) return;

            // Tab schaltet um, statt nur zu oeffnen — sonst kommt man mit derselben
            // Taste nicht wieder raus. Beim Schliessen auch den Hinweis wegnehmen,
            // der sonst ueber dem Spiel haengen bleibt.
            if (e.key === "Tab") {
                e.preventDefault();
                setBackpackOpen((offen) => {
                    if (offen) setItemHoverTooltip(null);
                    return !offen;
                });
                return;
            }

            // Deko in der Hand spiegeln — oder, bei einem Bodenbelag, drehen. Der
            // Fußabdruck bleibt so oder so gleich (Beläge sind immer 1×1): nur so
            // landet ein Objekt immer dort, wo man hinklickt (siehe DECO-Kommentar
            // oben). Dieselbe Taste macht bei Belägen bewusst etwas anderes, weil
            // Spiegeln dort optisch fast nie sichtbar ist (Texturen sind meist
            // links-rechts symmetrisch) — Drehen dagegen ist genau das, was einen
            // Weg auch hochkant verlegbar macht.
            if (e.code === "KeyR" && !e.repeat && selectedDecoToPlaceRef.current) {
                e.preventDefault();
                if (istBoden(selectedDecoToPlaceRef.current)) setDecoRotiert((prev) => !prev);
                else setDecoGespiegelt((prev) => !prev);
                return;
            }
            
            // Escape beendet das Einrichten — die naheliegendste Taste dafür.
            if (e.key === "Escape" && !e.repeat && editorAktivRef.current) {
                setEditorAktiv(false);
                setSelectedDecoToPlace(null);
                setVerschiebtGebaeude(null);
                return;
            }

            // 3. ANPASSUNG: Tool-Auswahl mit den Tasten 1, 2, 3, 4 (Ohne Shift)
            if (!e.shiftKey && !e.repeat) {
                const inv = toolInventoryRef.current || {};
                const equip = (key) => {
                    setSelectedSeed(null);
                    setSelectedPetToPlace(null);
                    setSelectedDecoToPlace(null);
                    setSelectedCarryItem(null);
                    setSelectedTool(prev => (prev === key ? null : key));
                    if (key !== "pot") setMovingPlantSource(null);
                };

                if (e.code === "Digit1" && inv.hasShovel) equip("shovel");
                if (e.code === "Digit2" && (inv.plantPots || 0) > 0) equip("pot");
                if (e.code === "Digit3" && (inv.pickaxeUses || 0) > 0) equip("pickaxe");
                if (e.code === "Digit4" && (inv.wateringCans || 0) > 0) equip("watering");
                if (e.code === "Digit5" && istGartenAdminRef.current) equip("shotgun");
            }

            if (!e.shiftKey || e.repeat) return;
            if (e.code === "Digit1") {
                e.preventDefault();
                teleportToMarketArea();
            } else if (e.code === "Digit2") {
                e.preventDefault();
                teleportToShopArea();
            } else if (e.code === "Digit3") {
                e.preventDefault();
                teleportToMyFarm();
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [showLobbyScreen, teleportToMyFarm, teleportToShopArea, teleportToMarketArea]);
}
