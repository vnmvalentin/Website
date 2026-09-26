// engine/PlantSystem.js
// Plant lifecycle: slot-based perennial system, 57-plant catalogue

import { wuerfleSonderform, unitAusText } from './Tageszeit';

export const RARITIES = {
    COMMON:    { name: "Common",    color: "#94a3b8", weight: 50,  multiplier: 1.0,  glow: null },
    UNCOMMON:  { name: "Uncommon",  color: "#4ade80", weight: 28,  multiplier: 1.5,  glow: "#4ade8044" },
    RARE:      { name: "Rare",      color: "#60a5fa", weight: 12,  multiplier: 2.5,  glow: "#60a5fa44" },
    EPIC:      { name: "Epic",      color: "#a855f7", weight: 6,   multiplier: 5.0,  glow: "#a855f744" },
    LEGENDARY: { name: "Legendary", color: "#f59e0b", weight: 3,   multiplier: 12.0, glow: "#f59e0b66" },
    MYTHIC:    { name: "Mythic",    color: "#ec4899", weight: 1,   multiplier: 25.0, glow: "#ec489966" },
};

export const SPECIAL_TYPES = {
    NORMAL:  { name: null,      valueBoost: 1.0, emoji: null },
    GOLDEN:  { name: "Golden",  valueBoost: 2.0, emoji: "✨" },
    RAINBOW: { name: "Rainbow", valueBoost: 5.0, emoji: "🌈" },
};

const RARITY_ORDER = ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY", "MYTHIC"];
// FALLBACK, nicht mehr die Regel (Feedback 30.08.: "themed samen" — jede Sorte
// soll ihr eigenes seed.png bekommen, statt sich mit 56 anderen Pflanzen ein
// einziges Bild zu teilen). Greift nur, solange/falls eine Sorte noch kein
// eigenes seed.png hat — siehe getPlantVisuals() unten und den Fallback in
// Renderer.js (_renderPlantBodyLocal).
const PLANTED_SEED_FALLBACK_IMAGE = "/garden-assets/common/planted_seed.png";

function lerp(min, max, t) { return min + (max - min) * t; }

// Roll 0-1 biased toward lower values (sizeCurve > 1 → smaller more likely)
function rollNorm(curve = 1.5) { return Math.pow(Math.random(), curve); }

function sizeFromNorm(norm) {
    return Math.max(1, Math.round(lerp(1, 50, Math.max(0, Math.min(1, Number(norm) || 0)))));
}

// `seed`: siehe neuerFruchtstand in Backend/garden/core/economy.js — macht die
// Reifezeit-Streuung UND die Sonderform reproduzierbar statt per Math.random()
// geraten, NUR für den ERSTEN Fruchtstand nach dem Aufbau
// (ensurePerennialFruitingState unten). Ohne denselben Seed wie der Server
// würfeln Browser und Server unabhängig voneinander ZWEI verschiedene Werte
// für dieselbe Frucht:
//   Reifezeit   die Staude sah hier schon reif aus, der Server lehnte die erste
//               Ernte trotzdem mit „Noch nicht reif." ab, weil SEINE (spätere)
//               Zeit noch nicht erreicht war. Gemeldet 21.08.2026.
//   Sonderform  hier stand ein goldener Ring auf der Kachel, geerntet wurde
//               aber eine gewöhnliche Frucht, weil der Server unabhängig etwas
//               anderes gewürfelt hat. Gemeldet 30.08.2026 — beim ersten Fix
//               übersehen, derselbe Seed fehlte nur an DIESER einen Stelle.
function createPerennialFruitSlot(now, cycleMs, seed = null) {
    const norm = rollNorm(1.35);
    // Chance kommt aus der Tageszeit: während der Nacht-Party ist Rainbow viermal so
    // wahrscheinlich. Entschieden wird das am Ende ohnehin auf dem Server — hier
    // steht dieselbe Rechnung, damit die Vorschau nicht etwas anderes zeigt.
    // Eigenes Sub-Wort (":sonderform") hinter dem Seed wie beim Server-Gegenstück,
    // damit dieser Wurf nicht denselben Hash wie die Streuung unten teilt.
    // `partyAktiv` bewusst NICHT übergeben (siehe wuerfleSonderform in
    // Tageszeit.js): der Browser liest die Party nur aus der Uhr, eine vom Admin
    // von Hand gestartete Party (garden/world/ereignisse.js) kennt nur der
    // Server. Für DIESEN einen Sonderfall (Admin-Party läuft GENAU während eine
    // Staude von structure auf fruiting wechselt) kann die Vorschau also noch
    // danebenliegen — ungleich seltener als vorher, aber nicht ausgeschlossen.
    const specialType = wuerfleSonderform(now, null, seed != null ? `${seed}:sonderform` : null);
    const streuung = seed != null ? unitAusText(seed) : Math.random();
    return {
        readyAt: now + Math.round(cycleMs * (0.8 + streuung * 0.4)),
        norm,
        size: sizeFromNorm(norm),
        specialType,
        // Wetter-Effekt gehört zur einzelnen Frucht, nicht zur ganzen Staude.
        // Vorher lag er auf der Pflanze: das Ernten EINER Frucht setzte ihn auf null
        // und alle übrigen gefrorenen Früchte am selben Strauch wurden wieder normal.
        statusEffects: [],
        statusEffect: null,
        statusEffectUntil: null,
    };
}

// ─── Wetter-Effekte ──────────────────────────────────────────────────────────
/** Chance je Pflanze bzw. Fruchtstand und Minute, dass das Wetter sie zeichnet. */
export const WETTER_CHANCE = 0.05;

/**
 * Zielwahrscheinlichkeit je Effekt und ZYKLUS — nicht mehr je Minute.
 *
 * WARUM UMGESTELLT: Die Chance lag pauschal bei 5 % pro Minute, und das aktive
 * Wetter steht nur 7,5 % der Zeit an. Damit hing der Aufschlag an der
 * WACHSTUMSDAUER: eine Mondblume mit 20 Tagen sammelte garantiert alle vier
 * Effekte ein (×11,25), eine Banane mit 15 Minuten praktisch keinen (×1,02).
 * Zwei Folgen: der Katalog liess sich gar nicht balancieren, weil jede Zahl einen
 * unsichtbaren Multiplikator zwischen 1,02 und 11,25 mittrug — und Dauerträger
 * waren vom stärksten Bonus des Spiels komplett ausgeschlossen.
 *
 * Jetzt bekommt jede Pflanze denselben Erwartungswert, egal wie lange sie
 * braucht.
 *
 * BALANCING (Feedback 29.08.: "viel zu viel Special Wetter momentan") — war
 * 0.15, siehe core/skills.js für die Rechnung. Muss zu dort passen.
 */
export const WETTER_ZIEL = 0.06;

export function wetterChanceFuer(zyklusMinuten, skillFaktor = 1) {
    // Das gesuchte Wetter liegt nur zu 7,5 % der Zeit an — nur in diesen Minuten
    // kann überhaupt etwas passieren.
    const wetterMinuten = Math.max(1, (Number(zyklusMinuten) || 1) * 0.075);
    const ziel = Math.min(0.9, WETTER_ZIEL * (Number(skillFaktor) || 1));
    return Math.max(0.001, Math.min(0.5, 1 - Math.pow(1 - ziel, 1 / wetterMinuten)));
}

/** Zykluslänge einer Pflanze in Minuten — Wachstum bzw. Fruchtzyklus. */
export function zyklusMinuten(plant) {
    if (!plant) return 1;
    if (plant.singleUse !== false) return Math.max(1, (Number(plant.growthMs) || 60000) / 60000);
    return Math.max(1, (Number(plant.fruitCycleMs) || 60000) / 60000);
}
/** Wie lange ein Effekt an einer REIFEN Frucht hält, bevor er verfliegt. */
export const EFFEKT_HALTBAR_MS = 4 * 60 * 1000;

/**
 * Ein Minutenschritt der Bewitterung — für eine Einmalernte ODER einen Fruchtstand.
 *
 * WAS SICH GEÄNDERT HAT (v3.3): vorher konnten NUR reife Früchte etwas abbekommen,
 * und einer wachsenden Pflanze wurde ein Effekt sogar wieder abgezogen. Wer bei
 * Schnee gepflanzt hat, erntete trotzdem gewöhnliche Ware — das Wetter war nur für
 * den Moment der Ernte da. Jetzt zeichnet es auch, was gerade heranwächst.
 *
 * Die Haltbarkeit beginnt bewusst erst mit der REIFE. Ein Kürbis mit vier Stunden
 * Wachstum hätte seinen Regen sonst längst wieder verloren, bevor man ihn überhaupt
 * pflücken kann — die Änderung wäre wirkungslos geblieben. An der reifen Frucht
 * bleibt es beim alten Zeitdruck: wer sie liegen lässt, verliert den Aufschlag.
 *
 * MEHRERE EFFEKTE (v3.4): eine Frucht kann inzwischen mehrere Wetter zugleich
 * tragen — nass UND gefroren UND geladen. Sie sammeln sich in `statusEffects`;
 * `statusEffect` führt weiterhin den WERTVOLLSTEN mit, damit jede Anzeige, die nur
 * einen einzigen kennt (Tönung, Vitrine, Post, Admin-Menü), unverändert weiterläuft.
 *
 * Die Haltbarkeitsuhr bleibt EINE für den ganzen Träger und beginnt mit jedem neuen
 * Effekt von vorn: das Wetter arbeitet sichtbar weiter an der Frucht, statt dass ein
 * spät dazugekommener Effekt sofort mit den älteren zusammen verfliegt.
 *
 * @returns {object|null} Felder zum Übernehmen, oder null wenn nichts passiert.
 */
export function wetterEffektSchritt(traeger, effektTyp, reif, now = Date.now(), chance = WETTER_CHANCE) {
    const liste = wetterListe(traeger);
    const bis = Number(traeger?.statusEffectUntil || 0);

    // ── Uhr ruht, solange nichts reif ist ─────────────────────────────────────
    // Die Haltbarkeit gehört zur REIFEN Frucht: wer sie liegen lässt, verliert den
    // Aufschlag. Eine Pflanze kann aber nachträglich wieder unreif werden — beim
    // Umtopfen, beim Nachwachsen eines Fruchtstands, und bis August 2026 auch bei
    // jedem Serverneustart (die alte Pflanzenmigration hat growthMs neu gerechnet,
    // siehe garden/migrations/index.js). Lief die Uhr dabei weiter, waren vier
    // Minuten später alle Wetter-Effekte gelöscht, obwohl es gar nichts zu ernten
    // gab — übrig blieben Golden und Rainbow, die keine Uhr haben. Genau das war
    // als „Wetter wird nicht mehr angezeigt" zu sehen.
    if (!reif && bis > 0) return { statusEffectUntil: null };

    // Abgelaufen (nur reife Früchte haben überhaupt eine Uhr laufen)
    if (bis > 0 && bis <= now) return { statusEffects: [], statusEffect: null, statusEffectUntil: null };

    // Jedes Wetter zeichnet nur einmal — zweimal Regen macht die Frucht nicht nasser.
    if (effektTyp && !liste.includes(effektTyp) && Math.random() < chance) {
        const neu = [...liste, effektTyp];
        return {
            statusEffects: neu,
            statusEffect: staerksterEffekt(neu),
            statusEffectUntil: reif ? now + EFFEKT_HALTBAR_MS : null,
        };
    }

    // Während des Wachsens aufgesammelt und jetzt reif geworden → ab hier tickt die Uhr.
    if (reif && liste.length > 0 && bis === 0) return { statusEffectUntil: now + EFFEKT_HALTBAR_MS };
    return null;
}

/**
 * Alle Wetter-Effekte eines Trägers als Liste.
 *
 * Liest die Liste, fällt aber auf das alte Einzelfeld zurück: gespeicherte Stände
 * von vor v3.4 kennen nur `statusEffect`, und geerntete Ware liegt teils monatelang
 * in Kiste und Vitrine. Ohne diesen Rückfall verlöre sie beim Verkauf ihren Aufschlag.
 */
export function wetterListe(traeger) {
    if (Array.isArray(traeger)) return traeger.filter((e) => WEATHER_SELL_BOOST[e]);
    if (typeof traeger === "string") return WEATHER_SELL_BOOST[traeger] ? [traeger] : [];
    const liste = traeger?.statusEffects;
    if (Array.isArray(liste)) return liste.filter((e) => WEATHER_SELL_BOOST[e]);
    return traeger?.statusEffect && WEATHER_SELL_BOOST[traeger.statusEffect] ? [traeger.statusEffect] : [];
}

/** Der wertvollste Effekt — für Anzeigen, die nur einen einzigen darstellen können. */
export function staerksterEffekt(liste) {
    let beste = null;
    for (const e of liste || []) {
        if (!beste || (WEATHER_SELL_BOOST[e] || 0) > (WEATHER_SELL_BOOST[beste] || 0)) beste = e;
    }
    return beste;
}

/** Aufschlag aller Effekte zusammen — sie multiplizieren sich. */
export function wetterBoost(traeger) {
    let faktor = 1;
    for (const e of wetterListe(traeger)) faktor *= WEATHER_SELL_BOOST[e] || 1;
    return faktor;
}

export function ensurePerennialFruitingState(plant, now = Date.now()) {
    if (!plant || plant.singleUse) return plant;
    if (plant.stage === "structure" && now >= (plant.structureReadyAt || now)) {
        plant.stage = "fruiting";
    }
    if (plant.stage === "fruiting" && (!Array.isArray(plant.fruitSlots) || plant.fruitSlots.length === 0)) {
        const cycleMs = plant.fruitCycleMs || 60000;
        // Ab structureReadyAt rechnen, nicht ab `now` — dieselbe Begründung wie
        // beim Server-Gegenstück (bringeDauertraegerAufStand in core/economy.js):
        // sonst bekäme eine Staude, die reifte während niemand hinsah, hier einen
        // kompletten Zyklus geschenkt. Und derselbe Seed wie dort (instanceId),
        // damit diese lokale Vorhersage und die spätere Server-Antwort dieselbe
        // Reifezeit ergeben, statt zwei unabhängig gewürfelte.
        const start = Number(plant.structureReadyAt) || now;
        const iid = plant.instanceId;
        plant.fruitSlots = Array.from(
            { length: plant.maxFruits || 1 },
            (_, i) => createPerennialFruitSlot(start, cycleMs, iid ? `${iid}:erstfrucht:${i}` : null),
        );
    }
    if (Array.isArray(plant.fruitSlots) && plant.fruitSlots.length > 0) {
        plant.fruitSlots = plant.fruitSlots.map((slot) => {
            const norm = Number.isFinite(slot?.norm) ? slot.norm : rollNorm(1.35);
            return {
                ...(slot || {}),
                norm,
                size: Number.isFinite(slot?.size) ? slot.size : sizeFromNorm(norm),
            };
        });
    }
    return plant;
}

/**
 * Struktur je WUCHSFORM statt je Art: alle Dauerträger derselben Form teilen sich
 * ein Bild aus /garden-assets/structure/. Das sind 7 Dateien statt 28 — und die
 * Frucht (`fruit.png`) bleibt weiterhin artspezifisch und wird darübergelegt.
 */
const ARCHETYPE_STRUCTURE_IMAGE = {
    tree:   "/garden-assets/structure/tree.png",
    palm:   "/garden-assets/structure/palm.png",
    vine:   "/garden-assets/structure/vines.png",
    cane:   "/garden-assets/structure/canebush.png",
    bush:   "/garden-assets/structure/bush.png",
    sprawl: "/garden-assets/structure/groundvines.png",
    leafy:  "/garden-assets/structure/reddish.png",
};

export function getPlantVisuals(seedId, singleUse = true) {
    const base = `/garden-assets/plants/${seedId}`;
    // Nur Dauerträger nutzen eine Struktur; Einmalernten zeigen ihr eigenes plant.png.
    const sharedStructure = singleUse
        ? null
        : ARCHETYPE_STRUCTURE_IMAGE[getPlantArchetypeKey(seedId)];
    return {
        seedImage: `${base}/seed_shop.png`,
        seedShopImage: `${base}/seed_shop.png`,
        // Feedback 30.08.: "themed samen" — vorher immer PLANTED_SEED_FALLBACK_IMAGE
        // (ein einziges Bild fuer alle 57 Sorten). Jetzt zeigt jede Sorte ihr
        // eigenes seed.png, solange es existiert; der Renderer weicht pro Sorte
        // auf plantedSeedFallbackImage aus, bis das der Fall ist (_bildStatus-
        // Pruefung in _renderPlantBodyLocal, Renderer.js).
        plantedSeedImage: `${base}/seed.png`,
        plantedSeedFallbackImage: PLANTED_SEED_FALLBACK_IMAGE,
        growthImage: `${base}/plant.png`,
        structureImage: sharedStructure || `${base}/structure.png`,
        fruitImage: `${base}/fruit.png`,
        harvestImage: singleUse ? `${base}/plant.png` : `${base}/fruit.png`,
    };
}

/**
 * Ernte-Items kommen seit v3.0 vom Server und tragen bewusst keine Bildpfade
 * (der Server kennt nur Werte, keine Assets). Ohne diese Ableitung greift die
 * Anzeige auf `seedImage` zurück — dann stünde das Samentütchen statt der Frucht.
 *
 * Liegt hier statt in GameContainer, weil auch Briefkasten, Kiste und Vitrine
 * Stücke ohne Bildpfad anzeigen: Server-Momentaufnahmen und Post-Anhänge nennen
 * nur die seedId.
 */
export function hydrateHarvestedItem(item) {
    if (!item?.seedId) return item;
    const visuals = getPlantVisuals(item.seedId, item.singleUse !== false);
    const bild = visuals.harvestImage || visuals.fruitImage || visuals.growthImage;
    return { ...item, image: item.image || bild, harvestImage: item.harvestImage || bild };
}

export function hydrateHarvestedItems(liste) {
    return Array.isArray(liste) ? liste.map(hydrateHarvestedItem) : [];
}

// ─── Master seed catalogue (balanced for long-term economy) ───────────
// singleUse=true:  growMinSec, growMaxSec, sellMin, sellMax
// singleUse=false: structureGrowSec, fruitCycleSec, maxFruits, fruitSellMin, fruitSellMax
export const SEED_CATALOGUE = [
    // ── COMMON ──
    { id: "loewenzahn",   name: "Löwenzahn",    emoji: "🌼", rarity: "COMMON", singleUse: true,  shopPrice: 10, shopChance: 0.85, stockMin: 6, stockMax: 25,       growMinSec: 4,       growMaxSec: 12,      sellMin: 20,       sellMax: 60       }, // mg: Carrot
    { id: "minze",        name: "Minze",         emoji: "🌿", rarity: "COMMON", singleUse: true,  shopPrice: 100, shopChance: 0.64, stockMin: 3, stockMax: 10,      growMinSec: 90,      growMaxSec: 270,     sellMin: 130,       sellMax: 390      }, // mg: Daisy
    { id: "brennnesseln", name: "Brennnesseln",  emoji: "🌱", rarity: "COMMON", singleUse: true,  shopPrice: 135, shopChance: 0.64, stockMin: 3, stockMax: 10,      growMinSec: 45,      growMaxSec: 135,     sellMin: 310,      sellMax: 930      }, // mg: Aloe
    { id: "spinat",       name: "Spinat",        emoji: "🍃", rarity: "COMMON", singleUse: true,  shopPrice: 170, shopChance: 0.85, stockMin: 3, stockMax: 10,      growMinSec: 120,     growMaxSec: 360,     sellMin: 260,      sellMax: 780     }, // Balancing: war 30-90 (Verlust bei 4-12min Wachstum)
    { id: "salat",        name: "Salat",         emoji: "🥬", rarity: "COMMON", singleUse: true,  shopPrice: 210, shopChance: 0.85, stockMin: 3, stockMax: 10,      growMinSec: 60,      growMaxSec: 180,     sellMin: 350,      sellMax: 1050     }, // mg: Beet
    { id: "radieschen",   name: "Radieschen",    emoji: "🌿", rarity: "COMMON", singleUse: true,  shopPrice: 229, shopChance: 0.85, stockMin: 3, stockMax: 10,      growMinSec: 300,     growMaxSec: 900,    sellMin: 300,      sellMax: 900     }, // mg: Rose
    { id: "kohl",         name: "Kohl",          emoji: "🥬", rarity: "COMMON", singleUse: true,  shopPrice: 600, shopChance: 0.29, stockMin: 6, stockMax: 25,      growMinSec: 90,      growMaxSec: 270,     sellMin: 800,      sellMax: 2400     }, // Balancing: war 76-228 (garantierter Verlust)
    { id: "zwiebel",      name: "Zwiebel",       emoji: "🧅", rarity: "COMMON", singleUse: true,  shopPrice: 948, shopChance: 0.13, stockMin: 1, stockMax: 4,     growMinSec: 50,      growMaxSec: 150,     sellMin: 1090,     sellMax: 3270     }, // mg: Daffodil
    { id: "karotte",      name: "Karotte",       emoji: "🥕", rarity: "COMMON", singleUse: true,  shopPrice: 2350, shopChance: 0.12, stockMin: 1, stockMax: 6,     growMinSec: 720,     growMaxSec: 2160,    sellMin: 2708,     sellMax: 8124     }, // mg: Watermelon
    { id: "erbsen",       name: "Erbsen",        emoji: "🫘", rarity: "COMMON", singleUse: false, shopPrice: 52, shopChance: 0.85, stockMin: 2, stockMax: 3,       structureGrowSec: 52,    fruitCycleSec: 45,    maxFruits: 1,  fruitSellMin: 42,    fruitSellMax: 126   }, // mg: Cabbage
    { id: "bohne",        name: "Bohne",         emoji: "🫘", rarity: "COMMON", singleUse: false, shopPrice: 86, shopChance: 0.85, stockMin: 1, stockMax: 6,       structureGrowSec: 15,    fruitCycleSec: 70,    maxFruits: 5,  fruitSellMin: 14,    fruitSellMax: 42    }, // mg: Strawberry

    // ── UNCOMMON ──
    { id: "knoblauch",    name: "Knoblauch",     emoji: "🧄", rarity: "UNCOMMON", singleUse: true,  shopPrice: 3000, shopChance: 0.085, stockMin: 1, stockMax: 4,     growMinSec: 2100,    growMaxSec: 6300,    sellMin: 3700,     sellMax: 11100    }, // mg: Pumpkin
    { id: "kartoffel",    name: "Kartoffel",     emoji: "🥔", rarity: "UNCOMMON", singleUse: true,  shopPrice: 2500, shopChance: 0.12, stockMin: 1, stockMax: 2,     growMinSec: 1200,     growMaxSec: 3600,     sellMin: 3200,     sellMax: 9600    }, // mg: Echeveria
    { id: "ingwer",       name: "Ingwer",        emoji: "🌿", rarity: "UNCOMMON", singleUse: true,  shopPrice: 8700, shopChance: 0.43, stockMin: 1, stockMax: 3,     growMinSec: 90,      growMaxSec: 270,     sellMin: 10000,    sellMax: 30000    }, // mg: Gentian
    { id: "paprika",      name: "Paprika",       emoji: "🫑", rarity: "UNCOMMON", singleUse: true,  shopPrice: 10000, shopChance: 0.43, stockMin: 1, stockMax: 3,    growMinSec: 100,     growMaxSec: 300,     sellMin: 20000,    sellMax: 60000    }, // mg: Lavender
    { id: "aubergine",    name: "Aubergine",     emoji: "🍆", rarity: "UNCOMMON", singleUse: true,  shopPrice: 12000, shopChance: 0.43, stockMin: 1, stockMax: 3,    growMinSec: 79200,   growMaxSec: 237600,   sellMin: 75000,    sellMax: 225000    }, // mg: Pine Tree
    { id: "mais",         name: "Mais",          emoji: "🌽", rarity: "UNCOMMON", singleUse: true,  shopPrice: 17500, shopChance: 0.43, stockMin: 1, stockMax: 3,    growMinSec: 240,     growMaxSec: 720,     sellMin: 20123,    sellMax: 60369    }, // mg: Lily
    { id: "kuebi",        name: "Kürbis",        emoji: "🎃", rarity: "UNCOMMON", singleUse: true,  shopPrice: 30000, shopChance: 0.43, stockMin: 1, stockMax: 3,    growMinSec: 120,     growMaxSec: 360,     sellMin: 50000,    sellMax: 150000   }, // mg: Saffron
    { id: "rhabarber",    name: "Rhabarber",     emoji: "🌿", rarity: "UNCOMMON", singleUse: false, shopPrice: 296, shopChance: 0.64, stockMin: 2, stockMax: 5,      structureGrowSec: 360,   fruitCycleSec: 900,   maxFruits: 8,  fruitSellMin: 30,    fruitSellMax: 90    }, // mg: Fava Bean
    { id: "gurke",        name: "Gurke",         emoji: "🥒", rarity: "UNCOMMON", singleUse: false, shopPrice: 400, shopChance: 0.64, stockMin: 1, stockMax: 5,      structureGrowSec: 33,   fruitCycleSec: 105,    maxFruits: 5,  fruitSellMin: 23,    fruitSellMax: 69    }, // mg: Blueberry
    { id: "zucchini",     name: "Zucchini",      emoji: "🥒", rarity: "UNCOMMON", singleUse: false, shopPrice: 2000, shopChance: 0.15,  stockMin: 1, stockMax: 6,      structureGrowSec: 300, fruitCycleSec: 1200,  maxFruits: 7,  fruitSellMin: 70,   fruitSellMax: 210   }, // Balancing: Ertrag an 6h-Aufbauzeit angepasst
    { id: "tomate",       name: "Tomate",        emoji: "🍅", rarity: "UNCOMMON", singleUse: false, shopPrice: 800, shopChance: 0.64, stockMin: 1, stockMax: 3,      structureGrowSec: 60,  fruitCycleSec: 1100,    maxFruits: 2,  fruitSellMin: 27,    fruitSellMax: 81    }, // mg: Tomato
    { id: "chili",        name: "Chili",         emoji: "🌶️", rarity: "UNCOMMON", singleUse: false, shopPrice: 1300, shopChance: 0.15,  stockMin: 1, stockMax: 6,     structureGrowSec: 45,   fruitCycleSec: 130,    maxFruits: 1,  fruitSellMin: 36,    fruitSellMax: 108    }, // mg: Corn

    // ── RARE ──
    { id: "grapefruit",   name: "Grapefruit",    emoji: "🍊", rarity: "RARE", singleUse: true,  shopPrice: 139000, shopChance: 0.072, stockMin: 16, stockMax: 25,   growMinSec: 79200,   growMaxSec: 237600,  sellMin: 160000,   sellMax: 480000   }, // mg: Mushroom
    { id: "zitrone",      name: "Zitrone",       emoji: "🍋", rarity: "RARE", singleUse: true,  shopPrice: 191000, shopChance: 0.072, stockMin: 5, stockMax: 15,   growMinSec: 10800,    growMaxSec: 32400,   sellMin: 220000,   sellMax: 660000   }, // mg: Cactus
    { id: "aprikose",     name: "Aprikose",      emoji: "🍑", rarity: "RARE", singleUse: true,  shopPrice: 400000, shopChance: 0.037, stockMin: 5, stockMax: 10,   growMinSec: 79200,   growMaxSec: 237600,   sellMin: 500000,   sellMax: 1500000  }, // mg: Bamboo
    { id: "honigmelone",  name: "Honigmelone",   emoji: "🍉", rarity: "RARE", singleUse: true,  shopPrice: 520000, shopChance: 0.037, stockMin: 3, stockMax: 9,   growMinSec: 79200,   growMaxSec: 237600,  sellMin: 600000,   sellMax: 1800000  }, // mg: Violet Cort
    { id: "cranberry",    name: "Cranberry",     emoji: "🫐", rarity: "RARE", singleUse: false, shopPrice: 55000, shopChance: 0.289, stockMin: 1, stockMax: 1,     structureGrowSec: 900,  fruitCycleSec: 1500,   maxFruits: 3,  fruitSellMin: 7000,  fruitSellMax: 21000  }, // mg: Squash
    { id: "stachelbeere", name: "Stachelbeere",  emoji: "🟢", rarity: "RARE", singleUse: false, shopPrice: 25900, shopChance: 0.072, stockMin: 1, stockMax: 2,     structureGrowSec: 8100, fruitCycleSec: 79200,  maxFruits: 7,  fruitSellMin: 3000,   fruitSellMax: 9000   }, // mg: Pear
    { id: "blaubeere",    name: "Blaubeere",     emoji: "🫐", rarity: "RARE", singleUse: false, shopPrice: 30200, shopChance: 0.289, stockMin: 1, stockMax: 1,    structureGrowSec: 10800, fruitCycleSec: 79200, maxFruits: 7,  fruitSellMin: 3500,  fruitSellMax: 10500  }, // Balancing: war 21h-Zyklus mit 30-90 Gold (kaputt)
    { id: "himbeere",     name: "Himbeere",      emoji: "🫐", rarity: "RARE", singleUse: false, shopPrice: 15000, shopChance: 0.179, stockMin: 1, stockMax: 3,    structureGrowSec: 6750, fruitCycleSec: 79200,  maxFruits: 5,  fruitSellMin: 1750,  fruitSellMax: 5250  }, // mg: Banana
    { id: "erdbeere",     name: "Erdbeere",      emoji: "🍓", rarity: "RARE", singleUse: false, shopPrice: 55000, shopChance: 0.289, stockMin: 1, stockMax: 1,    structureGrowSec: 8100, fruitCycleSec: 79200, maxFruits: 8,  fruitSellMin: 4875,  fruitSellMax: 14625 }, // mg: Camellia
    { id: "kirsche",      name: "Kirsche",       emoji: "🍒", rarity: "RARE", singleUse: false, shopPrice: 85000, shopChance: 0.289, stockMin: 1, stockMax: 1,    structureGrowSec: 8100,  fruitCycleSec: 79200,  maxFruits: 7,  fruitSellMin: 9000,  fruitSellMax: 27000 }, // mg: Peach
    { id: "limette",      name: "Limette",       emoji: "🍋", rarity: "RARE", singleUse: false, shopPrice: 93000, shopChance: 0.289, stockMin: 2, stockMax: 3,    structureGrowSec: 270,  fruitCycleSec: 1800,   maxFruits: 2,  fruitSellMin: 6000,  fruitSellMax: 18000 }, // mg: Burro's Tail

    // ── EPIC ──
    { id: "holunder",     name: "Holunder",      emoji: "🍇", rarity: "EPIC", singleUse: true,  shopPrice: 1000000, shopChance: 0.124, stockMin: 3, stockMax: 13,  growMinSec: 3600,    growMaxSec: 10800,   sellMin: 2000000,  sellMax: 6000000  }, // mg: Ube
    { id: "guave",        name: "Guave",         emoji: "🍈", rarity: "EPIC", singleUse: true,  shopPrice: 2500000, shopChance: 0.078, stockMin: 5, stockMax: 15,  growMinSec: 7200,    growMaxSec: 21600,   sellMin: 4000000,  sellMax: 12000000 }, // Interpolated
    { id: "pfirsich",     name: "Pfirsich",      emoji: "🍑", rarity: "EPIC", singleUse: true,  shopPrice: 5000000, shopChance: 0.059, stockMin: 7, stockMax: 14,  growMinSec: 14400,   growMaxSec: 43200,   sellMin: 7500000,  sellMax: 22500000 }, // Interpolated
    { id: "avocado",      name: "Avocado",       emoji: "🥑", rarity: "EPIC", singleUse: true,  shopPrice: 10000000, shopChance: 0.039, stockMin: 4, stockMax: 12, growMinSec: 244800,  growMaxSec: 734400,  sellMin: 12000000, sellMax: 36000000 }, // mg: Dawnbreaker
    { id: "apfel",        name: "Apfel",         emoji: "🍎", rarity: "EPIC", singleUse: false, shopPrice: 900000, shopChance: 0.13, stockMin: 1, stockMax: 4,   structureGrowSec: 540, fruitCycleSec: 79200,  maxFruits: 4,  fruitSellMin: 20000, fruitSellMax: 60000 }, // mg: Poinsettia
    { id: "birne",        name: "Birne",         emoji: "🍐", rarity: "EPIC", singleUse: false, shopPrice: 500000, shopChance: 0.176, stockMin: 1, stockMax: 4,   structureGrowSec: 10800,  fruitCycleSec: 79200,  maxFruits: 3,  fruitSellMin: 100000,fruitSellMax: 300000}, // mg: Eggplant
    { id: "traube",       name: "Traube",        emoji: "🍇", rarity: "EPIC", singleUse: false, shopPrice: 670000, shopChance: 0.15, stockMin: 1, stockMax: 4,   structureGrowSec: 16200, fruitCycleSec: 79200, maxFruits: 7,  fruitSellMin: 18000, fruitSellMax: 54000 }, // mg: Chrysanthemum
    { id: "orange",       name: "Orange",        emoji: "🍊", rarity: "EPIC", singleUse: false, shopPrice: 750000, shopChance: 0.143, stockMin: 1, stockMax: 4,   structureGrowSec: 10800, fruitCycleSec: 79200,  maxFruits: 11, fruitSellMin: 15000, fruitSellMax: 45000 }, // mg: Date
    { id: "kiwi",         name: "Kiwi",          emoji: "🥝", rarity: "EPIC", singleUse: false, shopPrice: 850000, shopChance: 0.137, stockMin: 1, stockMax: 4,   structureGrowSec: 1350, fruitCycleSec: 79200,   maxFruits: 1,  fruitSellMin: 50000, fruitSellMax: 150000 }, // mg: Grape
    { id: "pflaume",      name: "Pflaume",       emoji: "🍑", rarity: "EPIC", singleUse: false, shopPrice: 1000000, shopChance: 0.124, stockMin: 1, stockMax: 4,  structureGrowSec: 270,   fruitCycleSec: 79200,   maxFruits: 9,  fruitSellMin: 7000,  fruitSellMax: 21000 }, // mg: Pepper
    { id: "mango",        name: "Mango",         emoji: "🥭", rarity: "EPIC", singleUse: false, shopPrice: 2000000, shopChance: 0.091, stockMin: 1, stockMax: 4,  structureGrowSec: 5400, fruitCycleSec: 79200,  maxFruits: 6,  fruitSellMin: 50000, fruitSellMax: 150000 }, // mg: Lemon
    { id: "olive",        name: "Olive",         emoji: "🫒", rarity: "EPIC", singleUse: false, shopPrice: 2750000, shopChance: 0.078, stockMin: 1, stockMax: 4,  structureGrowSec: 5400, fruitCycleSec: 79200,  maxFruits: 2,  fruitSellMin: 200000, fruitSellMax: 600000 }, // mg: Passion Fruit

    // ── LEGENDARY ──
    { id: "ananas",       name: "Ananas",        emoji: "🍍", rarity: "LEGENDARY", singleUse: true,  shopPrice: 50000000, shopChance: 0.0205, stockMin: 5, stockMax: 7, growMinSec: 259200,  growMaxSec: 777600,  sellMin: 62000000, sellMax: 186000000}, // Interpolated Huge
    { id: "bambus",       name: "Bambus",        emoji: "🎋", rarity: "LEGENDARY", singleUse: true,  shopPrice: 100000000, shopChance: 0.0145, stockMin: 2, stockMax: 6,growMinSec: 345600,  growMaxSec: 1036800, sellMin: 125000000,sellMax: 375000000}, // Interpolated Huge
    { id: "kakao",        name: "Kakao",         emoji: "🫘", rarity: "LEGENDARY", singleUse: true,  shopPrice: 500000000, shopChance: 0.0065, stockMin: 3, stockMax: 8,growMinSec: 432000,  growMaxSec: 1296000, sellMin: 630000000,sellMax: 1890000000},// Interpolated Huge
    { id: "drachenfrucht", name: "Drachenfrucht", emoji: "🐉", rarity: "LEGENDARY", singleUse: true,  shopPrice: 1000000000, shopChance: 0.0045, stockMin: 4, stockMax: 10,growMinSec: 604800,  growMaxSec: 1814400, sellMin: 1300000000,sellMax: 3900000000},// Interpolated Huge
    // BALANCING Aug 2026 (zweite Runde — banane/passionsfrucht/sternfrucht/dattel/
    // kokosnuss): ROI (Kaufpreis ÷ Ertrag pro Stunde, bei maximaler Fruchtgröße)
    // lag bei 7–25 Tagen, bei Kokosnuss und Passionsfrucht abgezogen von der
    // fruitCycleSec-Rechnung sogar noch länger. Referenz ist Acai (unverändert,
    // ROI ~3,5 Tage, stündlicher Ertrag ~1,2 % des Kaufpreises) — alle fünf sind
    // jetzt auf denselben Maßstab gebracht, ~3 Tage ROI und 1,4–1,5 % Kaufpreis/h.
    // Bei Sternfrucht/Dattel/Kokosnuss (je nur EIN Fruchtstand, ein Fruchtstand
    // pro Tag) ging das nicht über den Verkaufswert allein: ihre lange
    // Aufbauzeit (22–46 h) hätte sonst entweder einen Ertrag verlangt, der die
    // ganze Investition mit der ERSTEN Frucht zurückzahlt (Preisverzerrung nach
    // oben), oder wäre bei moderatem Ertrag nie unter ~5,4 Tage gekommen — die
    // Aufbauzeit ist deshalb ebenfalls gekürzt (nicht auf null: sie bleiben
    // spürbar langsamer als Acai/Banane/Passionsfrucht mit ihren vielen
    // Fruchtständen). fruitCycleSec/maxFruits bleiben unangetastet — daran hängt
    // auch die Erfahrung (siehe xpFuerErnte in economy.js), die soll hier
    // unberührt bleiben.
    { id: "banane",       name: "Banane",        emoji: "🍌", rarity: "LEGENDARY", singleUse: false, shopPrice: 5000000, shopChance: 0.0655, stockMin: 1, stockMax: 4, structureGrowSec: 450,  fruitCycleSec: 79200,   maxFruits: 7,  fruitSellMin: 75000, fruitSellMax: 225000 }, // mg: Dragon Fruit
    { id: "acai",         name: "Acai",          emoji: "🫐", rarity: "LEGENDARY", singleUse: false, shopPrice: 10000000, shopChance: 0.046, stockMin: 1, stockMax: 4,structureGrowSec: 5400, fruitCycleSec: 79200,  maxFruits: 6,  fruitSellMin: 150000, fruitSellMax: 450000}, // mg: Cacao — Preis unveraendert, Referenzwert für die Balancing-Runde oben
    { id: "passionsfrucht", name: "Passionsfrucht", emoji: "🌺", rarity: "LEGENDARY", singleUse: false, shopPrice: 25000000, shopChance: 0.029, stockMin: 1, stockMax: 4,structureGrowSec: 900, fruitCycleSec: 79200,  maxFruits: 6,  fruitSellMin: 425000, fruitSellMax: 1275000}, // mg: Lychee
    { id: "sternfrucht",  name: "Sternfrucht",   emoji: "⭐", rarity: "LEGENDARY", singleUse: false, shopPrice: 100000000, shopChance: 0.0145, stockMin: 1, stockMax: 4,structureGrowSec: 9900, fruitCycleSec: 86400, maxFruits: 1,  fruitSellMin: 12000000,fruitSellMax: 35000000},// mg: Sunflower
    { id: "dattel",       name: "Dattel",        emoji: "🌴", rarity: "LEGENDARY", singleUse: false, shopPrice: 300000000, shopChance: 0.0085, stockMin: 1, stockMax: 3,structureGrowSec: 20700, fruitCycleSec: 86400, maxFruits: 1,  fruitSellMin: 40000000,fruitSellMax: 110000000},// Balancing: ROI war 45-90 Tage, dann ~14 Tage, jetzt ~3 Tage
    { id: "kokosnuss",    name: "Kokosnuss",     emoji: "🥥", rarity: "LEGENDARY", singleUse: false, shopPrice: 1000000000, shopChance: 0.0045, stockMin: 1, stockMax: 2,structureGrowSec: 20700, fruitCycleSec: 86400, maxFruits: 1,  fruitSellMin: 120000000,fruitSellMax: 360000000},// Balancing: ROI war >1 Jahr, dann ~15 Tage, jetzt ~3 Tage

    // ── MYTHIC ──
    { id: "mondblume",    name: "Mondblume",     emoji: "🌙", rarity: "MYTHIC",    singleUse: true,  shopPrice: 50000000000, shopChance: 0.00025, stockMin: 1, stockMax: 3,growMinSec: 864000, growMaxSec: 2592000, sellMin: 65000000000, sellMax: 195000000000}, // mg: Moonbinder (interpolated for Single Use)
];

// ─── Botanische Archetypen ────────────────────────────────────────────────────
// Jede Art bekommt ein prozedurales Gerüst (Spalier, Stamm, Ranken, Erdhügel …),
// das HINTER bzw. UNTER ihrem Sprite gezeichnet wird. Das Sprite selbst bleibt
// unverändert — nur das Drumherum ist archetyp-abhängig. Dadurch sind die 57
// Arten auf einem vollen Acker auseinanderzuhalten, ohne neue Grafiken.
//
// heightTiles  visuelle Maximalhöhe in Kacheln (begrenzt, damit hohe Pflanzen
//              die Reihe dahinter nicht komplett zudecken)
// widthScale   Breitenfaktor des Sprites
// sway         Windbewegung (0 = starr)
// shadow       Breite des Bodenschattens relativ zur Kachel
// canopy       Höhe (0..1) der Frucht-Zone über dem Fußpunkt
/**
 * Schalter für die prozeduralen Gerüste (Spalier, Ruten, Stab, Bodenranken …).
 *
 * `true`  — der Renderer zeichnet sie hinter das Sprite. Sinnvoll, solange die
 *           structure.png ihr Gerüst NICHT selbst mitbringt.
 * `false` — es wird gar nichts ergänzt; die Grafik muss alles enthalten.
 *
 * Beim Umstellen auf selbst gezeichnete Gerüste hier auf `false` setzen — sonst
 * steht das gezeichnete Spalier hinter dem gemalten und man sieht beides.
 * Einzelne Arten lassen sich stattdessen über `support: "none"` unten umstellen,
 * falls du nach und nach lieferst.
 */
export const USE_PROCEDURAL_SUPPORTS = false; // Strukturbilder bringen ihr Geruest selbst mit

// Wichtig: `tree` und `palm` bekommen KEIN prozedurales Gerüst. Ihre PNGs enthalten
// bereits einen eigenen Stamm — ein zusätzlicher gezeichneter Stamm ragte darunter
// hervor und ergab einen sichtbaren Doppelstamm. Sie werden allein über Höhe,
// Breite, Schattengröße und Kronen-Fruchtzone unterschieden.
//
// Die Höhenspanne bleibt bewusst bei ~0.9–1.75 Kacheln: genug, damit ein Baum sofort
// als Baum lesbar ist, aber wenig genug, dass er die Reihe dahinter nicht zudeckt.
// widthScale liegt bewusst unter 1.0: die Pflanze ist schmaler als ihre Kachel, sodass
// zwischen zwei Nachbarn ein sichtbarer Streifen Acker bleibt. Vorher füllten Sprites
// die Kachel bis an den Rand und gingen optisch ineinander über.
export const ARCHETYPE_PROFILES = {
    tree:    { support: "none",    heightTiles: 1.65, widthScale: 0.92, sway: 0.35, shadow: 0.80, canopy: 0.62 },
    // canopy 0.72 lag ueber der Wedelkrone — die Bananen schwebten ueber der Palme.
    palm:    { support: "none",    heightTiles: 1.75, widthScale: 0.78, sway: 0.55, shadow: 0.62, canopy: 0.55 },
    vine:    { support: "trellis", heightTiles: 1.50, widthScale: 0.82, sway: 0.20, shadow: 0.58, canopy: 0.38 },
    cane:    { support: "canes",   heightTiles: 1.30, widthScale: 0.86, sway: 0.45, shadow: 0.62, canopy: 0.36 },
    column:  { support: "post",    heightTiles: 1.50, widthScale: 0.66, sway: 0.10, shadow: 0.50, canopy: 0.60 },
    stalk:   { support: "stalks",  heightTiles: 1.60, widthScale: 0.70, sway: 0.60, shadow: 0.50, canopy: 0.58 },
    bush:    { support: "stake",   heightTiles: 1.25, widthScale: 0.84, sway: 0.35, shadow: 0.70, canopy: 0.32 },
    rosette: { support: "rosette", heightTiles: 1.05, widthScale: 0.82, sway: 0.15, shadow: 0.66, canopy: 0.40 },
    sprawl:  { support: "runners", heightTiles: 0.95, widthScale: 0.98, sway: 0.25, shadow: 0.88, canopy: 0.30 },
    leafy:   { support: "none",    heightTiles: 1.00, widthScale: 0.84, sway: 0.40, shadow: 0.66, canopy: 0.35 },
    herb:    { support: "none",    heightTiles: 0.90, widthScale: 0.74, sway: 0.70, shadow: 0.50, canopy: 0.35 },
    root:    { support: "mound",   heightTiles: 0.95, widthScale: 0.78, sway: 0.45, shadow: 0.58, canopy: 0.30 },
    flower:  { support: "stem",    heightTiles: 1.15, widthScale: 0.70, sway: 0.65, shadow: 0.46, canopy: 0.65 },
};

const PLANT_ARCHETYPE_BY_ID = {
    // COMMON
    loewenzahn: "flower", minze: "herb", brennnesseln: "herb", spinat: "leafy",
    salat: "leafy", radieschen: "root", kohl: "leafy", zwiebel: "root",
    karotte: "root", erbsen: "vine", bohne: "vine",
    // UNCOMMON
    knoblauch: "root", kartoffel: "root", ingwer: "root", paprika: "bush",
    aubergine: "bush", mais: "stalk", kuebi: "sprawl", rhabarber: "leafy",
    gurke: "vine", zucchini: "sprawl", tomate: "bush", chili: "bush",
    // RARE
    grapefruit: "tree", zitrone: "tree", aprikose: "tree", honigmelone: "sprawl",
    cranberry: "sprawl", stachelbeere: "bush", blaubeere: "bush", himbeere: "cane",
    erdbeere: "sprawl", kirsche: "tree", limette: "tree",
    // EPIC
    holunder: "bush", guave: "tree", pfirsich: "tree", avocado: "tree",
    apfel: "tree", birne: "tree", traube: "vine", orange: "tree", kiwi: "vine",
    pflaume: "tree", mango: "tree", olive: "tree",
    // LEGENDARY
    ananas: "rosette", bambus: "stalk", kakao: "tree", drachenfrucht: "column",
    banane: "palm", acai: "palm", passionsfrucht: "vine", sternfrucht: "tree",
    dattel: "palm", kokosnuss: "palm",
    // MYTHIC
    mondblume: "flower",
};

/** Anzeigenamen der Wuchsformen — die Hover-Karte zeigt sie als Untertitel. */
export const ARCHETYPE_LABELS = {
    tree: "Baum",
    palm: "Palme",
    vine: "Rankpflanze",
    cane: "Rutenstrauch",
    column: "Säulenkaktus",
    stalk: "Halm",
    bush: "Strauch",
    rosette: "Rosette",
    sprawl: "Bodenranke",
    leafy: "Blattgemüse",
    herb: "Kraut",
    root: "Wurzelgemüse",
    flower: "Blume",
};

/**
 * Verkaufsbonus der Wetter-Statuseffekte.
 * Lag vorher nur inline in GameContainer.handleHarvest und war für den Spieler
 * nirgends sichtbar — jetzt geteilt, damit Hover-Karte und Ernte nicht auseinanderlaufen.
 */
export const WEATHER_SELL_BOOST = { wet: 1.25, frozen: 1.5, charged: 2, moonlit: 3 };

export const STATUS_EFFECT_LABELS = {
    wet: "Nass",
    frozen: "Gefroren",
    charged: "Aufgeladen",
    moonlit: "Mondlicht",
};

/**
 * Erwarteter Verkaufswert einer Ernte. Spiegelt bewusst die Rechenfolge aus
 * harvestPlant() + handleHarvest() (zweimal floor), damit die Anzeige nicht
 * um ein paar Gold von der tatsächlichen Gutschrift abweicht.
 */
export function getExpectedSellValue(plant, norm, specialType, statusEffect) {
    const profile = SEED_CATALOGUE.find((s) => s.id === plant?.seedId) || plant?.profile;
    if (!profile) return 0;
    const t = Math.max(0, Math.min(1, Number(norm) || 0));
    const special = SPECIAL_TYPES[(specialType || "").toUpperCase() || "NORMAL"] || SPECIAL_TYPES.NORMAL;
    // Nimmt einen einzelnen Effekt, eine Liste oder den Träger selbst entgegen —
    // die Aufrufer reichen alles drei an (siehe wetterListe).
    const weather = wetterBoost(statusEffect);
    const base = plant?.singleUse
        ? lerp(profile.sellMin, profile.sellMax, t)
        : lerp(profile.fruitSellMin, profile.fruitSellMax, t);
    if (!Number.isFinite(base)) return 0;
    return Math.max(1, Math.floor(Math.max(1, Math.floor(base * special.valueBoost)) * weather));
}

export function getPlantArchetypeKey(seedId) {
    return PLANT_ARCHETYPE_BY_ID[seedId] || "leafy";
}

export function getPlantArchetype(seedId) {
    return ARCHETYPE_PROFILES[getPlantArchetypeKey(seedId)] || ARCHETYPE_PROFILES.leafy;
}

// ─── Shop generation ──────────────────────────────────────────────────────────
export function generateShopSeed(base) {
    const visuals = getPlantVisuals(base.id, base.singleUse);
    return {
        instanceId: Math.random().toString(36).slice(2),
        seedId: base.id,
        name: base.name,
        emoji: base.emoji,
        image: visuals.seedShopImage,
        seedImage: visuals.seedImage,
        seedShopImage: visuals.seedShopImage,
        plantedSeedImage: visuals.plantedSeedImage,
        plantedSeedFallbackImage: visuals.plantedSeedFallbackImage,
        growthImage: visuals.growthImage,
        structureImage: visuals.structureImage,
        fruitImage: visuals.fruitImage,
        harvestImage: visuals.harvestImage,
        rarity: base.rarity,
        rarityData: RARITIES[base.rarity],
        shopPrice: base.shopPrice,
        singleUse: base.singleUse,
        profile: base,
        stock: zufallZwischen(base.stockMin, base.stockMax),
    };
}

/** Ganze Zahl von min bis max, beide einschliesslich. */
function zufallZwischen(min, max) {
    const a = Math.max(1, Math.floor(Number(min) || 1));
    const b = Math.max(a, Math.floor(Number(max) || a));
    return a + Math.floor(Math.random() * (b - a + 1));
}

/**
 * NOTFALL-Rotation für den Fall, dass /global-shop nicht antwortet.
 *
 * Der Laden kommt im Normalbetrieb vom Server — er führt seit v4.0 einen GLOBALEN
 * Vorrat je Sorte. Diese Fassung hier ist nur die Rückfallebene, damit der Laden
 * bei einem Netzfehler nicht leer bleibt. Chance und Bestand kommen trotzdem aus
 * dem Katalog, nicht aus einer eigenen Regel: vorher standen hier pauschale
 * Seltenheitschancen und „5-20 bzw. 1-4 Stück", also andere Zahlen als im Spiel.
 */
export function generateShopRotation() {
    const activeIds = new Set();
    for (const seed of SEED_CATALOGUE) {
        if (Math.random() < (Number(seed.shopChance) || 0)) activeIds.add(seed.id);
    }

    // Fallback, falls durch absoluten Zufall gar kein Samen aktiv wäre
    if (activeIds.size === 0 && SEED_CATALOGUE.length > 0) {
        activeIds.add(SEED_CATALOGUE[0].id);
    }

    const seeds = SEED_CATALOGUE.map(base => ({
        ...generateShopSeed(base),
        active: activeIds.has(base.id),
        stock: activeIds.has(base.id) ? zufallZwischen(base.stockMin, base.stockMax) : 0,
    })).sort((a, b) => {
        const ro = RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity);
        return ro !== 0 ? ro : a.shopPrice - b.shopPrice;
    });

    return { seeds, generatedAt: Date.now(), nextRotation: Date.now() + 5 * 60 * 1000 };
}

// ─── Plant instances ──────────────────────────────────────────────────────────
export function createPlantInstance(seed, cellX, cellY, partyAktiv = null) {
    const profile = seed.profile || SEED_CATALOGUE.find(s => s.id === seed.seedId);
    const now = Date.now();
    const visuals = getPlantVisuals(seed.seedId, Boolean(profile?.singleUse));

    // Nur Einmalernten würfeln beim Pflanzen; Dauerträger würfeln je Fruchtstand.
    // Die Chance hängt an der Tageszeit (Party-Event) — siehe engine/Tageszeit.js.
    const specialType = profile?.singleUse ? wuerfleSonderform(now, partyAktiv) : null;

    if (!profile?.singleUse) {
        const structureReadyAt = now + profile.structureGrowSec * 1000;
        const fruitCycleMs = Math.round(profile.fruitCycleSec * 1000);
        return {
            instanceId: Math.random().toString(36).slice(2),
            seedId: seed.seedId,
            name: seed.name,
            emoji: seed.emoji,
            image: visuals.structureImage,
            seedImage: seed.seedImage || seed.seedShopImage || visuals.seedImage,
            seedShopImage: seed.seedShopImage || visuals.seedShopImage,
            plantedSeedImage: seed.plantedSeedImage || visuals.plantedSeedImage,
            growthImage: seed.growthImage || visuals.growthImage,
            structureImage: seed.structureImage || visuals.structureImage,
            fruitImage: seed.fruitImage || visuals.fruitImage,
            harvestImage: seed.harvestImage || visuals.harvestImage,
            rarity: seed.rarity,
            rarityData: seed.rarityData,
            singleUse: false,
            profile,
            cellX, cellY,
            plantedAt: now,
            structureGrowthMs: profile.structureGrowSec * 1000,
            structureReadyAt,
            fruitCycleMs,
            maxFruits: profile.maxFruits,
            // Slots are generated only after structure phase finishes.
            fruitSlots: null,
            stage: "structure",
            harvested: 0,
            specialType,
        };
    }

    // Single-use: roll size at growth time (stored in growthMs at planting)
    const norm = rollNorm(1.5);
    const growSec = lerp(profile.growMinSec, profile.growMaxSec, norm);
    return {
        instanceId: Math.random().toString(36).slice(2),
        seedId: seed.seedId,
        name: seed.name,
        emoji: seed.emoji,
        image: visuals.growthImage,
        seedImage: seed.seedImage || seed.seedShopImage || visuals.seedImage,
        seedShopImage: seed.seedShopImage || visuals.seedShopImage,
        plantedSeedImage: seed.plantedSeedImage || visuals.plantedSeedImage,
        plantedSeedFallbackImage: seed.plantedSeedFallbackImage || visuals.plantedSeedFallbackImage,
        growthImage: seed.growthImage || visuals.growthImage,
        structureImage: seed.structureImage || visuals.structureImage,
        fruitImage: seed.fruitImage || visuals.fruitImage,
        harvestImage: seed.harvestImage || visuals.harvestImage,
        rarity: seed.rarity,
        rarityData: seed.rarityData,
        singleUse: true,
        profile,
        norm,
        cellX, cellY,
        plantedAt: now,
        growthMs: Math.round(growSec * 1000),
        stage: "growing",
        harvested: 0,
        specialType,
    };
}

// ─── Growth helpers ───────────────────────────────────────────────────────────
/**
 * Wachstumsbalken / Cache-Hash: keine Mutation (Renderer). ensure läuft in der
 * Game-Loop.
 *
 * BUG (Feedback 30.08.: "Pflanze sah reif aus, war es aber nicht — erst ein
 * paar Sekunden später klickbar"): sobald `structureReadyAt` verstrichen war,
 * aber die Game-Loop `ensurePerennialFruitingState` (die den Stufenwechsel
 * "structure" → "fruiting" UND die ersten Fruchtstände selbst einträgt) noch
 * nicht nachgezogen hatte, stand hier `return 1` — voller Balken, sieht aus
 * wie "fertig". Der ERSTE Fruchtstand braucht ab `structureReadyAt` aber noch
 * seinen eigenen Zyklus (0,8×–1,2× fruitCycleMs, siehe createPerennialFruit-
 * Slot) — bei einer schnell wachsenden Sorte durchaus nur Sekunden, aber eben
 * NICHT null. `isPlantReadyForRender` (der eigentliche "anklickbar"-Wächter)
 * blieb in diesem Fenster korrekt bei false — nur der Balken log.
 *
 * Fix: dieselbe Rechnung wie NACH dem Stufenwechsel, nur ohne `plant.fruit-
 * Slots` zu mutieren (das bleibt Sache von ensurePerennialFruitingState in
 * der Game-Loop, ein Renderer darf keine Seiteneffekte haben).
 */
export function getGrowthProgressForRender(plant, now = Date.now()) {
    if (!plant) return 0;
    if (plant.singleUse) {
        return Math.min(1, (now - plant.plantedAt) / (plant.growthMs || 1));
    }
    if (plant.stage === "structure" && now < (plant.structureReadyAt || 0)) {
        return Math.min(1, (now - plant.plantedAt) / (plant.structureGrowthMs || 1));
    }
    const slots = plant.fruitSlots || [];
    if (slots.length === 0) {
        // Struktur fertig, aber der erste Fruchtstand steckt lokal noch nicht
        // in `fruitSlots` — Fortschritt seit structureReadyAt über EINEN
        // vollen Zyklus, als grobe Vorschau (der echte Wurf streut 0,8×–1,2×).
        const cycleMs = plant.fruitCycleMs || 60000;
        const start = Number(plant.structureReadyAt) || now;
        return Math.max(0, Math.min(1, (now - start) / cycleMs));
    }
    const readyCount = slots.filter((s) => s.readyAt <= now).length;
    if (readyCount > 0) return 1;
    const minReadyAt = Math.min(...slots.map((s) => s.readyAt));
    const elapsed = (plant.fruitCycleMs || 60000) - (minReadyAt - now);
    return Math.max(0, Math.min(1, elapsed / (plant.fruitCycleMs || 1)));
}

/** Interaktion / Ernte: identisch, aber kein Seiteneffekt (Renderer). */
export function isPlantReadyForRender(plant, now = Date.now()) {
    if (!plant) return false;
    if (plant.singleUse) {
        return now >= plant.plantedAt + (plant.growthMs || 0) && plant.stage !== "harvested";
    }
    if (plant.stage === "structure" && now < (plant.structureReadyAt || 0)) return false;
    if (plant.stage === "structure") return false;
    return (plant.fruitSlots || []).some((s) => s.readyAt <= now);
}

export function getGrowthProgress(plant, now = Date.now()) {
    if (!plant) return 0;
    if (plant.singleUse) {
        return Math.min(1, (now - plant.plantedAt) / (plant.growthMs || 1));
    }
    ensurePerennialFruitingState(plant, now);
    if (plant.stage === "structure" || now < plant.structureReadyAt) {
        return Math.min(1, (now - plant.plantedAt) / (plant.structureGrowthMs || 1));
    }
    // Fruiting: show progress of the slot closest to ready
    const slots = plant.fruitSlots || [];
    const readyCount = slots.filter(s => s.readyAt <= now).length;
    if (readyCount > 0) return 1;
    const minReadyAt = Math.min(...slots.map(s => s.readyAt));
    const elapsed = plant.fruitCycleMs - (minReadyAt - now);
    return Math.max(0, Math.min(1, elapsed / (plant.fruitCycleMs || 1)));
}

export function isPlantReady(plant, now = Date.now()) {
    if (plant.singleUse) {
        return now >= plant.plantedAt + (plant.growthMs || 0) && plant.stage !== "harvested";
    }
    ensurePerennialFruitingState(plant, now);
    if (plant.stage === "structure" && now < plant.structureReadyAt) return false;
    return (plant.fruitSlots || []).some(s => s.readyAt <= now);
}

export function getReadyFruitCount(plant, now = Date.now()) {
    if (plant.singleUse) return isPlantReady(plant, now) ? 1 : 0;
    ensurePerennialFruitingState(plant, now);
    return (plant.fruitSlots || []).filter(s => s.readyAt <= now).length;
}

export function getTimeToNextHarvest(plant, now = Date.now()) {
    if (plant.singleUse) {
        return Math.max(0, plant.plantedAt + (plant.growthMs || 0) - now);
    }
    ensurePerennialFruitingState(plant, now);
    if (now < plant.structureReadyAt) return plant.structureReadyAt - now;
    const slots = plant.fruitSlots || [];
    const readyCount = slots.filter(s => s.readyAt <= now).length;
    if (readyCount > 0) return 0;
    if (!slots.length) return 0;
    return Math.max(0, Math.min(...slots.map(s => s.readyAt)) - now);
}

// ─── Harvest ──────────────────────────────────────────────────────────────────
export function harvestPlant(plant) {
    const now = Date.now();

    if (plant.singleUse) {
        if (!isPlantReady(plant, now)) return null;
        // Fallback auf den Katalog: bei Spielständen aus älteren Versionen fehlt
        // `profile` am gespeicherten Pflanzenobjekt — ohne diesen Griff wirft
        // lerp(profile.sellMin, …) und die Ernte stürzt ab.
        // Immer der Katalog zuerst: ein im Spielstand eingefrorenes Profil traegt
        // die Werte vom Pflanzzeitpunkt und wuerde jedes spaetere Balancing aushebeln.
        const profile = SEED_CATALOGUE.find((s) => s.id === plant.seedId) || plant.profile;
        if (!profile) return null;
        const norm = plant.norm ?? Math.random();
        const special = SPECIAL_TYPES[(plant.specialType || "").toUpperCase() || "NORMAL"] || SPECIAL_TYPES.NORMAL;
        const baseValue = lerp(profile.sellMin, profile.sellMax, norm);
        const gold = Math.max(1, Math.floor(baseValue * special.valueBoost));
        const size = Math.max(1, Math.round(lerp(1, 50, norm)));
        plant.stage = "harvested";
        plant.harvested += 1;
        return { gold, size, specialData: special };
    }

    // Transition structure → fruiting if needed
    ensurePerennialFruitingState(plant, now);

    // Die am längsten reife Frucht zuerst — vorher nahm findIndex immer den kleinsten
    // Index, wodurch gefühlt „immer nur die erste" abgezogen wurde.
    let readyIdx = -1;
    let oldestReadyAt = Infinity;
    const slots = plant.fruitSlots || [];
    for (let i = 0; i < slots.length; i++) {
        const readyAt = slots[i]?.readyAt ?? Infinity;
        if (readyAt <= now && readyAt < oldestReadyAt) {
            oldestReadyAt = readyAt;
            readyIdx = i;
        }
    }
    if (readyIdx === -1) return null;

    const harvestedSlot = plant.fruitSlots[readyIdx] || {};
    const norm = Number.isFinite(harvestedSlot.norm) ? harvestedSlot.norm : rollNorm(1.35);
    const size = Number.isFinite(harvestedSlot.size) ? harvestedSlot.size : sizeFromNorm(norm);
    const special = SPECIAL_TYPES[(harvestedSlot.specialType || "").toUpperCase() || "NORMAL"] || SPECIAL_TYPES.NORMAL;
    const statusEffects = wetterListe(harvestedSlot);
    const statusEffect = staerksterEffekt(statusEffects);
    plant.fruitSlots[readyIdx] = createPerennialFruitSlot(now, plant.fruitCycleMs || 60000);
    plant.harvested += 1;

    const profile = SEED_CATALOGUE.find((s) => s.id === plant.seedId) || plant.profile;
    if (!profile) return null;
    const baseValue = lerp(profile.fruitSellMin, profile.fruitSellMax, norm);
    const gold = Math.max(1, Math.floor(baseValue * special.valueBoost));
    // Die Effekte wandern mit der geernteten Frucht mit — die übrigen behalten ihre.
    return { gold, size, specialData: special, statusEffect, statusEffects };
}
