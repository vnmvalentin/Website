// ui/muenzFlug.js
// Münzen fliegen beim Verkaufen vom Spieler zum Goldzähler im HUD.
//
// Bewusst im DOM und nicht auf der Spiel-Leinwand: das Ziel ist ein HTML-Element
// (der Goldzähler), dessen Lage die Leinwand nicht kennt. Die Münzen sind
// kurzlebige <img>-Elemente mit der Web-Animations-API, danach weg.
//
// Wer im System „Bewegung reduzieren" eingestellt hat, bekommt keinen Flug — der
// Zähler zählt trotzdem hoch, es fehlt nur die Verzierung.
import { versionedAsset } from '../engine/assetVersion';

const MUENZ_BILD = "/garden-assets/icons/hud/gold.png";
export const MUENZ_ZIEL_ATTR = "data-muenzziel";

function bewegungReduziert() {
    try {
        return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
    } catch {
        return false;
    }
}

/**
 * @param {{x:number,y:number}} start Bildschirmpunkt (Client-Koordinaten)
 * @param {number} anzahl wie viele Münzen (gedeckelt)
 */
export function muenzFlug(start, anzahl = 10) {
    if (typeof document === "undefined" || bewegungReduziert()) return;
    const ziel = document.querySelector(`[${MUENZ_ZIEL_ATTR}]`);
    if (!ziel || !start) return;
    const r = ziel.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return; // HUD gerade ausgeblendet
    const zielX = r.left + 8;
    const zielY = r.top + r.height / 2;
    const n = Math.max(1, Math.min(14, Math.round(anzahl)));
    const bild = versionedAsset(MUENZ_BILD);

    for (let i = 0; i < n; i++) {
        const el = document.createElement("img");
        el.src = bild;
        el.alt = "";
        el.setAttribute("aria-hidden", "true");
        Object.assign(el.style, {
            position: "fixed", left: "0px", top: "0px", width: "22px", height: "22px",
            pointerEvents: "none", zIndex: "9999", willChange: "transform, opacity",
        });
        document.body.appendChild(el);
        // Erst etwas auseinanderspritzen, dann in einem Bogen zum Zähler.
        const streuX = (Math.random() - 0.5) * 120;
        const streuY = -40 - Math.random() * 70;
        const von = `translate(${start.x - 11}px, ${start.y - 11}px)`;
        const mitte = `translate(${start.x - 11 + streuX}px, ${start.y - 11 + streuY}px)`;
        const nach = `translate(${zielX - 11}px, ${zielY - 11}px) scale(0.6)`;
        const anim = el.animate([
            { transform: von, opacity: 0 },
            { transform: mitte, opacity: 1, offset: 0.3 },
            { transform: nach, opacity: 0.9 },
        ], { duration: 700 + i * 40, delay: i * 45, easing: "cubic-bezier(.45,.05,.55,.95)", fill: "both" });
        const weg = () => el.remove();
        anim.onfinish = weg;
        anim.oncancel = weg;
        // Sicherheitsnetz, falls der Tab im Hintergrund die Animation einfriert.
        setTimeout(weg, 2500 + i * 45);
    }
    // Ankunft: der Zähler blitzt kurz hell auf.
    ziel.animate?.([
        { filter: "brightness(1)" },
        { filter: "brightness(1.8)", offset: 0.5 },
        { filter: "brightness(1)" },
    ], { duration: 380, delay: 650 + n * 45 });
}
