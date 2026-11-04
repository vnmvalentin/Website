// ui/ladenWert.js
// Reiter „Lohnt sich" im Samenladen: blendet Angebote aus, die für den eigenen
// Kontostand nicht ins Gewicht fallen.
//
// Feedback 02.11.: „der Shop bringt nur Müll". Pro Rotation stehen mehrere
// Commons und Uncommons im Laden, deren ganze Ladung ein paar hundert Gold wert
// ist — wer Millionen hat, scrollt jedes Mal an ihnen vorbei.
//
// Maßstab ist der erwartete Erlös der GANZEN Ladung dieser Rotation gegen 0,5 %
// des Golds — eine Ernte je Samen, bei Dauerträgern drei volle Fruchtzyklen, weil
// sie immer wieder tragen. Durchgespielt: bei 10 Mio fällt der Kohl heraus, bei
// 1 Mrd Zitrone und Kirsche, bei 40 Mrd bleiben Legendaries. Reine Anzeige —
// gekauft werden kann weiterhin alles über „Im Angebot".
import { SEED_CATALOGUE } from '../engine/PlantSystem';
import { istSaisonSorte, SAISON_ERLOES } from '../engine/Tageszeit';

export const LOHNT_ANTEIL = 0.005;
const DAUERTRAEGER_ZYKLEN = 3;

// Fruchtgröße ist norm = U^1,35 → Erwartungswert 1/2,35 der Spanne.
const MITTLERE_GROESSE = 1 / 2.35;

const KATALOG = new Map(SEED_CATALOGUE.map((s) => [s.id, s]));

function saisonFaktor(seedId) {
    return istSaisonSorte(seedId) ? SAISON_ERLOES : 1;
}

/** Erwarteter Erlös einer Ernte (Einmalernte) bzw. dreier voller Zyklen (Dauerträger). */
export function ernteWert(seedId) {
    const s = KATALOG.get(seedId);
    if (!s) return 0;
    if (s.singleUse === false) {
        const frucht = s.fruitSellMin + (s.fruitSellMax - s.fruitSellMin) * MITTLERE_GROESSE;
        return frucht * Math.max(1, s.maxFruits || 1) * DAUERTRAEGER_ZYKLEN * saisonFaktor(seedId);
    }
    return (s.sellMin + (s.sellMax - s.sellMin) * MITTLERE_GROESSE) * saisonFaktor(seedId);
}

/**
 * Lohnt sich dieses Angebot bei `gold`? `stueck` ist die Ladung zu Beginn der
 * Rotation — nicht der Rest, sonst verschwände eine Zeile beim Kaufen.
 */
export function lohntSich(seedId, stueck, gold) {
    const schwelle = Math.max(0, Number(gold) || 0) * LOHNT_ANTEIL;
    return ernteWert(seedId) * Math.max(1, Number(stueck) || 1) >= schwelle;
}
