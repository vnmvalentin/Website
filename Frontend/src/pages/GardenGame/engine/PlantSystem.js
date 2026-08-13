// engine/PlantSystem.js
// Plant lifecycle: slot-based perennial system, 57-plant catalogue

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
const PLANTED_SEED_IMAGE = "/garden-assets/common/planted_seed.png";

function lerp(min, max, t) { return min + (max - min) * t; }

// Roll 0-1 biased toward lower values (sizeCurve > 1 → smaller more likely)
function rollNorm(curve = 1.5) { return Math.pow(Math.random(), curve); }

function sizeFromNorm(norm) {
    return Math.max(1, Math.round(lerp(1, 50, Math.max(0, Math.min(1, Number(norm) || 0)))));
}

function createPerennialFruitSlot(now, cycleMs) {
    const norm = rollNorm(1.35);
    const roll = Math.random();
    const specialType = roll < 0.01 ? "Rainbow" : roll < 0.05 ? "Golden" : null;
    return {
        readyAt: now + Math.round(cycleMs * (0.8 + Math.random() * 0.4)),
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
 * braucht: ×1,67, mit „Wetterfühlig" voll ausgebaut ×2,57.
 */
export const WETTER_ZIEL = 0.15;

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
        plant.fruitSlots = Array.from({ length: plant.maxFruits || 1 }, () => createPerennialFruitSlot(now, cycleMs));
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
        plantedSeedImage: PLANTED_SEED_IMAGE,
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
    { id: "loewenzahn",   name: "Löwenzahn",    emoji: "🌼", rarity: "COMMON", singleUse: true,  shopPrice: 40,       growMinSec: 4,       growMaxSec: 12,      sellMin: 65,       sellMax: 195       }, // mg: Carrot
    { id: "minze",        name: "Minze",         emoji: "🌿", rarity: "COMMON", singleUse: true,  shopPrice: 525,      growMinSec: 60,      growMaxSec: 150,     sellMin: 851,       sellMax: 2553      }, // mg: Daisy
    { id: "brennnesseln", name: "Brennnesseln",  emoji: "🌱", rarity: "COMMON", singleUse: true,  shopPrice: 393,      growMinSec: 45,      growMaxSec: 112,     sellMin: 636,      sellMax: 1908      }, // mg: Aloe
    { id: "spinat",       name: "Spinat",        emoji: "🍃", rarity: "COMMON", singleUse: true,  shopPrice: 2400,      growMinSec: 240,     growMaxSec: 720,     sellMin: 3890,      sellMax: 11670     }, // Balancing: war 30-90 (Verlust bei 4-12min Wachstum)
    { id: "salat",        name: "Salat",         emoji: "🥬", rarity: "COMMON", singleUse: true,  shopPrice: 600,      growMinSec: 60,      growMaxSec: 180,     sellMin: 972,      sellMax: 2916     }, // mg: Beet
    { id: "radieschen",   name: "Radieschen",    emoji: "🌿", rarity: "COMMON", singleUse: true,  shopPrice: 3750,      growMinSec: 300,     growMaxSec: 1200,    sellMin: 6080,      sellMax: 18240     }, // mg: Rose
    { id: "kohl",         name: "Kohl",          emoji: "🥬", rarity: "COMMON", singleUse: true,  shopPrice: 780,      growMinSec: 78,      growMaxSec: 234,     sellMin: 1260,      sellMax: 3780     }, // Balancing: war 76-228 (garantierter Verlust)
    { id: "zwiebel",      name: "Zwiebel",       emoji: "🧅", rarity: "COMMON", singleUse: true,  shopPrice: 500,     growMinSec: 50,      growMaxSec: 150,     sellMin: 810,     sellMax: 2430     }, // mg: Daffodil
    { id: "karotte",      name: "Karotte",       emoji: "🥕", rarity: "COMMON", singleUse: true,  shopPrice: 7200,     growMinSec: 720,     growMaxSec: 2160,    sellMin: 11700,     sellMax: 35100     }, // mg: Watermelon
    { id: "erbsen",       name: "Erbsen",        emoji: "🫘", rarity: "COMMON", singleUse: false, shopPrice: 1800,       structureGrowSec: 45,    fruitCycleSec: 35,    maxFruits: 1,  fruitSellMin: 189,    fruitSellMax: 567   }, // mg: Cabbage
    { id: "bohne",        name: "Bohne",         emoji: "🫘", rarity: "COMMON", singleUse: false, shopPrice: 1800,       structureGrowSec: 70,    fruitCycleSec: 10,    maxFruits: 5,  fruitSellMin: 11,    fruitSellMax: 33    }, // mg: Strawberry

    // ── UNCOMMON ──
    { id: "knoblauch",    name: "Knoblauch",     emoji: "🧄", rarity: "UNCOMMON", singleUse: true,  shopPrice: 168000,     growMinSec: 2100,    growMaxSec: 6300,    sellMin: 272000,     sellMax: 816000    }, // mg: Pumpkin
    { id: "kartoffel",    name: "Kartoffel",     emoji: "🥔", rarity: "UNCOMMON", singleUse: true,  shopPrice: 9000,     growMinSec: 120,     growMaxSec: 330,     sellMin: 14600,     sellMax: 43800    }, // mg: Echeveria
    { id: "ingwer",       name: "Ingwer",        emoji: "🌿", rarity: "UNCOMMON", singleUse: true,  shopPrice: 7200,     growMinSec: 90,      growMaxSec: 270,     sellMin: 11700,    sellMax: 35100    }, // mg: Gentian
    { id: "paprika",      name: "Paprika",       emoji: "🫑", rarity: "UNCOMMON", singleUse: true,  shopPrice: 8000,    growMinSec: 100,     growMaxSec: 300,     sellMin: 13000,    sellMax: 39000    }, // mg: Lavender
    { id: "aubergine",    name: "Aubergine",     emoji: "🍆", rarity: "UNCOMMON", singleUse: true,  shopPrice: 288000,    growMinSec: 3600,   growMaxSec: 10800,   sellMin: 467000,    sellMax: 1401000    }, // mg: Pine Tree
    { id: "mais",         name: "Mais",          emoji: "🌽", rarity: "UNCOMMON", singleUse: true,  shopPrice: 18000,    growMinSec: 240,     growMaxSec: 660,     sellMin: 29200,    sellMax: 87600    }, // mg: Lily
    { id: "kuebi",        name: "Kürbis",        emoji: "🎃", rarity: "UNCOMMON", singleUse: true,  shopPrice: 14400,    growMinSec: 180,     growMaxSec: 540,     sellMin: 23300,    sellMax: 69900   }, // mg: Saffron
    { id: "rhabarber",    name: "Rhabarber",     emoji: "🌿", rarity: "UNCOMMON", singleUse: false, shopPrice: 72000,      structureGrowSec: 900,   fruitCycleSec: 240,   maxFruits: 8,  fruitSellMin: 1300,    fruitSellMax: 3900    }, // mg: Fava Bean
    { id: "gurke",        name: "Gurke",         emoji: "🥒", rarity: "UNCOMMON", singleUse: false, shopPrice: 72000,      structureGrowSec: 105,   fruitCycleSec: 22,    maxFruits: 5,  fruitSellMin: 190,    fruitSellMax: 570    }, // mg: Blueberry
    { id: "zucchini",     name: "Zucchini",      emoji: "🥒", rarity: "UNCOMMON", singleUse: false, shopPrice: 72000,      structureGrowSec: 21600, fruitCycleSec: 5400,  maxFruits: 7,  fruitSellMin: 33300,   fruitSellMax: 99900   }, // Balancing: Ertrag an 6h-Aufbauzeit angepasst
    { id: "tomate",       name: "Tomate",        emoji: "🍅", rarity: "UNCOMMON", singleUse: false, shopPrice: 72000,      structureGrowSec: 1100,  fruitCycleSec: 40,    maxFruits: 2,  fruitSellMin: 864,    fruitSellMax: 2592    }, // mg: Tomato
    { id: "chili",        name: "Chili",         emoji: "🌶️", rarity: "UNCOMMON", singleUse: false, shopPrice: 72000,     structureGrowSec: 130,   fruitCycleSec: 30,    maxFruits: 1,  fruitSellMin: 1300,    fruitSellMax: 3900    }, // mg: Corn

    // ── RARE ──
    { id: "grapefruit",   name: "Grapefruit",    emoji: "🍊", rarity: "RARE", singleUse: true,  shopPrice: 6910000,   growMinSec: 14400,   growMaxSec: 28800,  sellMin: 11200000,   sellMax: 33600000   }, // mg: Mushroom
    { id: "zitrone",      name: "Zitrone",       emoji: "🍋", rarity: "RARE", singleUse: true,  shopPrice: 4030000,   growMinSec: 9000,    growMaxSec: 16200,   sellMin: 6530000,   sellMax: 19590000   }, // mg: Cactus
    { id: "aprikose",     name: "Aprikose",      emoji: "🍑", rarity: "RARE", singleUse: true,  shopPrice: 4610000,   growMinSec: 9000,   growMaxSec: 19800,   sellMin: 7470000,   sellMax: 22410000  }, // mg: Bamboo
    { id: "honigmelone",  name: "Honigmelone",   emoji: "🍉", rarity: "RARE", singleUse: true,  shopPrice: 5760000,   growMinSec: 12600,   growMaxSec: 23400,  sellMin: 9340000,   sellMax: 28020000  }, // mg: Violet Cort
    { id: "cranberry",    name: "Cranberry",     emoji: "🫐", rarity: "RARE", singleUse: false, shopPrice: 1730000,     structureGrowSec: 1500,  fruitCycleSec: 200,   maxFruits: 3,  fruitSellMin: 23000,  fruitSellMax: 69000  }, // mg: Squash
    { id: "stachelbeere", name: "Stachelbeere",  emoji: "🟢", rarity: "RARE", singleUse: false, shopPrice: 1730000,     structureGrowSec: 21600, fruitCycleSec: 5400,  maxFruits: 7,  fruitSellMin: 267000,   fruitSellMax: 801000   }, // mg: Pear
    { id: "blaubeere",    name: "Blaubeere",     emoji: "🫐", rarity: "RARE", singleUse: false, shopPrice: 1730000,    structureGrowSec: 43200, fruitCycleSec: 10800, maxFruits: 7,  fruitSellMin: 533000,  fruitSellMax: 1599000  }, // Balancing: war 21h-Zyklus mit 30-90 Gold (kaputt)
    { id: "himbeere",     name: "Himbeere",      emoji: "🫐", rarity: "RARE", singleUse: false, shopPrice: 1730000,    structureGrowSec: 14400, fruitCycleSec: 4500,  maxFruits: 5,  fruitSellMin: 311000,  fruitSellMax: 933000  }, // mg: Banana
    { id: "erdbeere",     name: "Erdbeere",      emoji: "🍓", rarity: "RARE", singleUse: false, shopPrice: 1730000,    structureGrowSec: 86400, fruitCycleSec: 10800, maxFruits: 8,  fruitSellMin: 467000,  fruitSellMax: 1401000 }, // mg: Camellia
    { id: "kirsche",      name: "Kirsche",       emoji: "🍒", rarity: "RARE", singleUse: false, shopPrice: 1730000,    structureGrowSec: 7200,  fruitCycleSec: 5400,  maxFruits: 7,  fruitSellMin: 267000,  fruitSellMax: 801000 }, // mg: Peach
    { id: "limette",      name: "Limette",       emoji: "🍋", rarity: "RARE", singleUse: false, shopPrice: 1730000,    structureGrowSec: 1800,  fruitCycleSec: 100,   maxFruits: 2,  fruitSellMin: 17300,  fruitSellMax: 51900 }, // mg: Burro's Tail

    // ── EPIC ──
    { id: "holunder",     name: "Holunder",      emoji: "🍇", rarity: "EPIC", singleUse: true,  shopPrice: 18400000,  growMinSec: 3600,    growMaxSec: 10800,   sellMin: 29900000,  sellMax: 89700000  }, // mg: Ube
    { id: "guave",        name: "Guave",         emoji: "🍈", rarity: "EPIC", singleUse: true,  shopPrice: 36800000,  growMinSec: 7200,    growMaxSec: 21600,   sellMin: 59700000,  sellMax: 179100000 }, // Interpolated
    { id: "pfirsich",     name: "Pfirsich",      emoji: "🍑", rarity: "EPIC", singleUse: true,  shopPrice: 73700000,  growMinSec: 14400,   growMaxSec: 43200,   sellMin: 119000000,  sellMax: 357000000 }, // Interpolated
    { id: "avocado",      name: "Avocado",       emoji: "🥑", rarity: "EPIC", singleUse: true,  shopPrice: 111000000, growMinSec: 28800,  growMaxSec: 57600,  sellMin: 179000000, sellMax: 537000000 }, // mg: Dawnbreaker
    { id: "apfel",        name: "Apfel",         emoji: "🍎", rarity: "EPIC", singleUse: false, shopPrice: 46100000,   structureGrowSec: 10800, fruitCycleSec: 5400,  maxFruits: 4,  fruitSellMin: 3730000, fruitSellMax: 11190000 }, // mg: Poinsettia
    { id: "birne",        name: "Birne",         emoji: "🍐", rarity: "EPIC", singleUse: false, shopPrice: 46100000,   structureGrowSec: 2700,  fruitCycleSec: 7200,  maxFruits: 3,  fruitSellMin: 6630000,fruitSellMax: 19890000}, // mg: Eggplant
    { id: "traube",       name: "Traube",        emoji: "🍇", rarity: "EPIC", singleUse: false, shopPrice: 46100000,   structureGrowSec: 86400, fruitCycleSec: 10800, maxFruits: 7,  fruitSellMin: 4260000, fruitSellMax: 12780000 }, // mg: Chrysanthemum
    { id: "orange",       name: "Orange",        emoji: "🍊", rarity: "EPIC", singleUse: false, shopPrice: 46100000,   structureGrowSec: 64800, fruitCycleSec: 3600,  maxFruits: 11, fruitSellMin: 905000, fruitSellMax: 2715000 }, // mg: Date
    { id: "kiwi",         name: "Kiwi",          emoji: "🥝", rarity: "EPIC", singleUse: false, shopPrice: 46100000,   structureGrowSec: 86400, fruitCycleSec: 900,   maxFruits: 1,  fruitSellMin: 2490000, fruitSellMax: 7470000 }, // mg: Grape
    { id: "pflaume",      name: "Pflaume",       emoji: "🍑", rarity: "EPIC", singleUse: false, shopPrice: 46100000,  structureGrowSec: 560,   fruitCycleSec: 600,   maxFruits: 9,  fruitSellMin: 184000,  fruitSellMax: 552000 }, // mg: Pepper
    { id: "mango",        name: "Mango",         emoji: "🥭", rarity: "EPIC", singleUse: false, shopPrice: 46100000,  structureGrowSec: 43200, fruitCycleSec: 3600,  maxFruits: 6,  fruitSellMin: 1660000, fruitSellMax: 4980000 }, // mg: Lemon
    { id: "olive",        name: "Olive",         emoji: "🫒", rarity: "EPIC", singleUse: false, shopPrice: 46100000,  structureGrowSec: 86400, fruitCycleSec: 2700,  maxFruits: 2,  fruitSellMin: 3730000, fruitSellMax: 11190000 }, // mg: Passion Fruit

    // ── LEGENDARY ──
    { id: "ananas",       name: "Ananas",        emoji: "🍍", rarity: "LEGENDARY", singleUse: true,  shopPrice: 590000000, growMinSec: 21600,  growMaxSec: 36000,  sellMin: 957000000, sellMax: 2871000000}, // Interpolated Huge
    { id: "bambus",       name: "Bambus",        emoji: "🎋", rarity: "LEGENDARY", singleUse: true,  shopPrice: 886000000,growMinSec: 28800,  growMaxSec: 57600, sellMin: 1440000000,sellMax: 4320000000}, // Interpolated Huge
    { id: "kakao",        name: "Kakao",         emoji: "🫘", rarity: "LEGENDARY", singleUse: true,  shopPrice: 1330000000,growMinSec: 43200,  growMaxSec: 86400, sellMin: 2150000000,sellMax: 6450000000},// Interpolated Huge
    { id: "drachenfrucht", name: "Drachenfrucht", emoji: "🐉", rarity: "LEGENDARY", singleUse: true,  shopPrice: 1770000000,growMinSec: 57600,  growMaxSec: 115200, sellMin: 2870000000,sellMax: 8610000000},// Interpolated Huge
    { id: "banane",       name: "Banane",        emoji: "🍌", rarity: "LEGENDARY", singleUse: false, shopPrice: 1180000000, structureGrowSec: 1800,  fruitCycleSec: 900,   maxFruits: 7,  fruitSellMin: 2850000, fruitSellMax: 8550000 }, // mg: Dragon Fruit
    { id: "acai",         name: "Acai",          emoji: "🫐", rarity: "LEGENDARY", singleUse: false, shopPrice: 1180000000,structureGrowSec: 86400, fruitCycleSec: 5400,  maxFruits: 6,  fruitSellMin: 19900000, fruitSellMax: 59700000}, // mg: Cacao
    { id: "passionsfrucht", name: "Passionsfrucht", emoji: "🌺", rarity: "LEGENDARY", singleUse: false, shopPrice: 1180000000,structureGrowSec: 86400, fruitCycleSec: 1800,  maxFruits: 6,  fruitSellMin: 6640000, fruitSellMax: 19920000}, // mg: Lychee
    { id: "sternfrucht",  name: "Sternfrucht",   emoji: "⭐", rarity: "LEGENDARY", singleUse: false, shopPrice: 1180000000,structureGrowSec: 86400, fruitCycleSec: 18000, maxFruits: 1,  fruitSellMin: 399000000,fruitSellMax: 1197000000},// mg: Sunflower
    { id: "dattel",       name: "Dattel",        emoji: "🌴", rarity: "LEGENDARY", singleUse: false, shopPrice: 1180000000,structureGrowSec: 86400, fruitCycleSec: 86400, maxFruits: 1,  fruitSellMin: 1910000000,fruitSellMax: 5730000000},// Balancing: ROI war 45-90 Tage
    { id: "kokosnuss",    name: "Kokosnuss",     emoji: "🥥", rarity: "LEGENDARY", singleUse: false, shopPrice: 1180000000,structureGrowSec: 86400, fruitCycleSec: 86400, maxFruits: 1,  fruitSellMin: 1910000000,fruitSellMax: 5730000000},// Balancing: ROI war >1 Jahr

    // ── MYTHIC ──
    { id: "mondblume",    name: "Mondblume",     emoji: "🌙", rarity: "MYTHIC",    singleUse: true,  shopPrice: 28400000000,growMinSec: 115200, growMaxSec: 230400, sellMin: 46000000000, sellMax: 138000000000}, // mg: Moonbinder (interpolated for Single Use)
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
        growthImage: visuals.growthImage,
        structureImage: visuals.structureImage,
        fruitImage: visuals.fruitImage,
        harvestImage: visuals.harvestImage,
        rarity: base.rarity,
        rarityData: RARITIES[base.rarity],
        shopPrice: base.shopPrice,
        singleUse: base.singleUse,
        profile: base,
        stock: 1 + Math.floor(Math.random() * 4),
    };
}

export function generateShopRotation() {
    // 2. ANPASSUNG: Jede Rarity hat ihre eigene Spawn-Chance
    const chances = { COMMON: 0.80, UNCOMMON: 0.65, RARE: 0.40, EPIC: 0.20, LEGENDARY: 0.05, MYTHIC: 0.01 };
    
    const activeIds = new Set();
    for (const seed of SEED_CATALOGUE) {
        const chance = chances[seed.rarity] || 0.5;
        if (Math.random() <= chance) {
            activeIds.add(seed.id);
        }
    }
    
    // Fallback, falls durch absoluten Zufall gar kein Samen aktiv wäre
    if (activeIds.size === 0 && SEED_CATALOGUE.length > 0) {
        activeIds.add(SEED_CATALOGUE[0].id);
    }

    const seeds = SEED_CATALOGUE.map(base => ({
        ...generateShopSeed(base),
        active: activeIds.has(base.id),
        stock: activeIds.has(base.id) ? (base.singleUse ? (5 + Math.floor(Math.random() * 15)) : (1 + Math.floor(Math.random() * 3))) : 0,
    })).sort((a, b) => {
        const ro = RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity);
        return ro !== 0 ? ro : a.shopPrice - b.shopPrice;
    });

    return { seeds, generatedAt: Date.now(), nextRotation: Date.now() + 5 * 60 * 1000 };
}

// ─── Plant instances ──────────────────────────────────────────────────────────
export function createPlantInstance(seed, cellX, cellY) {
    const profile = seed.profile || SEED_CATALOGUE.find(s => s.id === seed.seedId);
    const now = Date.now();
    const visuals = getPlantVisuals(seed.seedId, Boolean(profile?.singleUse));

    // Only single-use plants roll specialType at planting; multi-use rolls per fruit slot
    let specialType = null;
    if (profile?.singleUse) {
        const roll = Math.random();
        if (roll < 0.01) specialType = "Rainbow";
        else if (roll < 0.05) specialType = "Golden";
    }

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
/** Wachstumsbalken / Cache-Hash: keine Mutation (Renderer). ensure läuft in der Game-Loop. */
export function getGrowthProgressForRender(plant, now = Date.now()) {
    if (!plant) return 0;
    if (plant.singleUse) {
        return Math.min(1, (now - plant.plantedAt) / (plant.growthMs || 1));
    }
    if (plant.stage === "structure" && now < (plant.structureReadyAt || 0)) {
        return Math.min(1, (now - plant.plantedAt) / (plant.structureGrowthMs || 1));
    }
    if (plant.stage === "structure") {
        return 1;
    }
    const slots = plant.fruitSlots || [];
    if (slots.length === 0) return 1;
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
