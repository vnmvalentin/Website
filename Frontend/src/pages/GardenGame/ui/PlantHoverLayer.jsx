// ui/PlantHoverLayer.jsx
// Rendert die Pflanzen-Hover-Karte außerhalb des Renderpfads von GameContainer.
// Der Store dazu liegt in hoverStore.js (Lint-Regel react-refresh/only-export-components).
import React, { useSyncExternalStore } from 'react';
import PlantHoverCard from './PlantHoverCard';

export default function PlantHoverLayer({ store, getPlant, getOwner }) {
    const hover = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
    if (!hover?.key) return null;
    // Bewusst nur der Schluessel: die Karte holt sich die Pflanze bei jedem eigenen
    // Sekundentakt frisch. Vorher lag hier ein eingefrorenes Objekt vom Zeitpunkt der
    // Mausbewegung — nach dem Ernten zeigte die Karte weiter den alten Stand.
    return (
        <PlantHoverCard
            getPlant={getPlant}
            plantKey={hover.key}
            x={hover.x}
            y={hover.y}
            owner={getOwner?.(hover.key) || null}
        />
    );
}
