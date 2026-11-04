// ui/rausch.js — Anzeige des Ernte-Rauschs. Gerechnet wird allein auf dem Server
// (Backend garden/core/rausch.js); hier wird nur der zuletzt gemeldete Stand bis
// „jetzt" fortgeschrieben, damit der Balken nach einer Pause sichtbar sinkt.
// Zahlen müssen zu core/rausch.js passen.

const VOLL_MS = 10 * 60 * 1000;
const MAX_BONUS = 0.15;
export const RAUSCH_SCHONZEIT_S = 60;

/**
 * @param {{aktivMs:number, haeltBis:number}|null} stand Antwort des Servers (ernteRausch)
 * @returns {{prozent:number, fuellung:number, sinkt:boolean}}
 */
export function rauschJetzt(stand, now = Date.now()) {
    const aktiv = Math.max(0, Number(stand?.aktivMs) || 0);
    const haeltBis = Number(stand?.haeltBis) || 0;
    const sinkt = haeltBis > 0 && now > haeltBis;
    const jetzt = sinkt ? Math.max(0, aktiv - (now - haeltBis)) : aktiv;
    const fuellung = Math.min(1, jetzt / VOLL_MS);
    // Dieselbe Rundung wie faktorAus/anzeige im Backend (erst Faktor auf 3 Stellen,
    // dann Prozent) — sonst zeigte das HUD bei 11,5 % mal 11, der Server meldete 12.
    const faktor = Math.round((1 + MAX_BONUS * fuellung) * 1000) / 1000;
    return { prozent: Math.round((faktor - 1) * 100), fuellung, sinkt: sinkt && jetzt > 0 };
}
