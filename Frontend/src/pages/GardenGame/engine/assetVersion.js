// engine/assetVersion.js
//
// Die Bilder unter /garden-assets/ wurden im Overhaul ausgetauscht, BEHIELTEN aber
// ihre Dateinamen. Wer die Seite vorher schon einmal offen hatte, bekam deshalb
// weiter die alten Rasen-, Weg- und Struktur-Bilder aus dem Browser-Cache —
// beim Entwickler mit geleertem Cache sah alles richtig aus, bei allen anderen nicht.
//
// Ein Versionsanhang an der URL macht daraus eine neue Adresse und erzwingt genau
// einmal ein Neuladen. Bei der naechsten Bildaenderung diese Zahl hochsetzen.
export const ASSET_VERSION = "3";

/** Haengt die Version an Garden-Assets an. Fremde URLs bleiben unberuehrt. */
export function versionedAsset(src) {
    if (typeof src !== "string" || !src.startsWith("/garden-assets/")) return src;
    if (src.includes("?")) return src;
    return `${src}?v=${ASSET_VERSION}`;
}
