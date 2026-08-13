// ui/itemTints.js
// Farbwerte und Helfer rund um einen Gegenstand — Veredelung, Bildquelle, Beschriftung.
//
// Bewusst OHNE JSX und ohne Komponenten (wie gardenTokens.js daneben): die Lint-Regel
// react-refresh/only-export-components verlangt, dass eine Datei entweder Komponenten
// oder geteilte Werte exportiert, nicht beides. Die Komponenten liegen in ItemIcon.jsx.
import { STATUS_EFFECT_LABELS } from '../engine/PlantSystem';

/** Bildquelle eines Gegenstands in der Reihenfolge, in der sie gefüllt wird. */
export function itemImageSrc(item) {
    return item?.image || item?.seedImage || item?.seedShopImage || item?.harvestImage || null;
}

/**
 * Statische Farbfläche für Golden/Rainbow. Gezeichnet wird sie über CSS mask-image,
 * das nur die Pixel des Bildes einfärbt (folgt dem Alphakanal des PNG) und keine
 * Einzelbilder rendert — der frühere Weg über ctx.filter mit Date.now() zwang React
 * in langen Listen zu einem Neuaufbau pro Bild und war spürbar zäh.
 */
export const SPECIAL_TINT_STYLES = {
    Golden: { background: "rgba(250, 204, 21, 0.65)" },
    Rainbow: {
        background: "linear-gradient(180deg, rgba(255,64,64,0.65) 0%, rgba(255,165,0,0.65) 20%, rgba(255,235,59,0.65) 40%, rgba(76,175,80,0.65) 60%, rgba(33,150,243,0.65) 80%, rgba(156,39,176,0.65) 100%)",
    },
};

/**
 * Wetter-Statuseffekte. Farben sind absichtlich identisch mit
 * Renderer._resolveItemOverlay — eine gefrorene Frucht sieht im Rucksack genauso
 * aus wie auf dem Acker.
 */
export const STATUS_TINT_STYLES = {
    frozen:  { background: "rgba(186, 230, 253, 0.42)" },
    wet:     { background: "rgba(56, 189, 248, 0.32)" },
    charged: { background: "rgba(196, 181, 253, 0.38)" },
    moonlit: { background: "rgba(129, 140, 248, 0.32)" },
};

/** Special schlägt Wetter — gleiche Priorität wie im Renderer. */
export function resolveItemTint(special, statusEffect) {
    if (special && SPECIAL_TINT_STYLES[special]) return SPECIAL_TINT_STYLES[special];
    if (statusEffect && STATUS_TINT_STYLES[statusEffect]) return STATUS_TINT_STYLES[statusEffect];
    return null;
}

/** Veredelung eines Erntestücks — Sonderform hat Vorrang vor dem Wetter-Effekt. */
export function itemSpecialName(item) {
    return item?.specialData?.name || item?.specialType || null;
}

/**
 * „Karotte · Größe 44 · Golden · Nass" — die Zeile, die überall unter einem
 * Erntestück steht. Stand vorher doppelt in AblageModal und MailboxModal.
 */
export function beschreibeErnte(item) {
    const teile = [item?.name || "Ernte"];
    if (Number(item?.size)) teile.push(`Größe ${item.size}`);
    const special = itemSpecialName(item);
    if (special) teile.push(special);
    const wetter = STATUS_EFFECT_LABELS[item?.statusEffect];
    if (wetter) teile.push(wetter);
    return teile.join(" · ");
}
