// ui/ItemIcon.jsx
// Das Bild eines Gegenstands — an EINER Stelle, damit eine goldene Karotte überall
// gleich aussieht.
//
// WARUM HIER UND NICHT IN GameContainer
// Beide Komponenten standen bis dahin lokal in GameContainer.jsx und waren damit für
// die Modals daneben nicht erreichbar. Folge: Rucksack und Schnellleiste zeigten die
// Veredelung, Kiste, Vitrine und Briefkasten aber nicht — dasselbe Stück sah je nach
// Fenster anders aus. Wer eine neue Liste mit Ernte baut, nimmt SpecialItemIcon.
//
// Die Farbwerte liegen daneben in itemTints.js (Lint-Regel: Komponenten und geteilte
// Werte nicht in derselben Datei).
import React, { useEffect, useState } from 'react';
import { versionedAsset } from '../engine/assetVersion';
import { itemImageSrc, itemSpecialName, resolveItemTint } from './itemTints';

export function ItemIcon({ item, className = "w-10 h-10", emojiClassName = "text-3xl" }) {
    const imageSrc = itemImageSrc(item);
    const [failed, setFailed] = useState(false);
    useEffect(() => setFailed(false), [imageSrc]);
    if (imageSrc && !failed) {
        return (
            <img
                src={versionedAsset(imageSrc)}
                alt={item?.name || "item"}
                className={`${className} object-contain`}
                draggable={false}
                onError={() => setFailed(true)}
            />
        );
    }
    return <span className={emojiClassName}>{item?.emoji || "📦"}</span>;
}

/**
 * Wie ItemIcon, nur mit der Einfärbung der Veredelung.
 * `special` und `statusEffect` sind optional — ohne Angabe werden sie aus dem Stück
 * selbst gelesen. Ausdrücklich `null` übergeben heißt „nicht einfärben"; das braucht
 * die Hover-Karte für Dauerträger, deren Veredelung am Fruchtstand hängt.
 */
export function SpecialItemIcon({
    item, special, statusEffect, className = "w-10 h-10", emojiClassName = "text-3xl",
}) {
    const sonderform = special !== undefined ? special : itemSpecialName(item);
    const wetter = statusEffect !== undefined ? statusEffect : item?.statusEffect;
    const tint = resolveItemTint(sonderform, wetter);
    const imageSrc = itemImageSrc(item);
    if (!tint || !imageSrc) {
        // Keine Veredelung, oder es gibt nur ein Emoji — dann lässt sich nichts maskieren.
        return <ItemIcon item={item} className={className} emojiClassName={emojiClassName} />;
    }
    return (
        <div className={`${className} relative`}>
            <ItemIcon item={item} className={className} emojiClassName={emojiClassName} />
            <div
                aria-hidden
                className="absolute inset-0 pointer-events-none"
                style={{
                    ...tint,
                    WebkitMaskImage: `url("${imageSrc}")`,
                    maskImage: `url("${imageSrc}")`,
                    WebkitMaskSize: "contain",
                    maskSize: "contain",
                    WebkitMaskRepeat: "no-repeat",
                    maskRepeat: "no-repeat",
                    WebkitMaskPosition: "center",
                    maskPosition: "center",
                }}
            />
        </div>
    );
}
