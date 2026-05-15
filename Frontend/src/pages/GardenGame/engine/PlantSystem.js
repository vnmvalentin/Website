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

function rollSpecial() {
    const r = Math.random();
    if (r < 0.01) return "RAINBOW";
    if (r < 0.06) return "GOLDEN";
    return "NORMAL";
}

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
    };
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

export function getPlantVisuals(seedId, singleUse = true) {
    const base = `/garden-assets/plants/${seedId}`;
    return {
        seedImage: `${base}/seed_shop.png`,
        seedShopImage: `${base}/seed_shop.png`,
        plantedSeedImage: PLANTED_SEED_IMAGE,
        growthImage: `${base}/plant.png`,
        structureImage: `${base}/structure.png`,
        fruitImage: `${base}/fruit.png`,
        harvestImage: singleUse ? `${base}/plant.png` : `${base}/fruit.png`,
    };
}

// ─── Master seed catalogue (balanced for long-term economy) ───────────
// singleUse=true:  growMinSec, growMaxSec, sellMin, sellMax
// singleUse=false: structureGrowSec, fruitCycleSec, maxFruits, fruitSellMin, fruitSellMax
export const SEED_CATALOGUE = [
    // ── COMMON ──
    { id: "loewenzahn",   name: "Löwenzahn",    emoji: "🌼", rarity: "COMMON", singleUse: true,  shopPrice: 10,       growMinSec: 4,       growMaxSec: 12,      sellMin: 20,       sellMax: 60       }, // mg: Carrot
    { id: "minze",        name: "Minze",         emoji: "🌿", rarity: "COMMON", singleUse: true,  shopPrice: 100,      growMinSec: 60,      growMaxSec: 150,     sellMin: 99,       sellMax: 247      }, // mg: Daisy
    { id: "brennnesseln", name: "Brennnesseln",  emoji: "🌱", rarity: "COMMON", singleUse: true,  shopPrice: 135,      growMinSec: 45,      growMaxSec: 112,     sellMin: 310,      sellMax: 775      }, // mg: Aloe
    { id: "spinat",       name: "Spinat",        emoji: "🍃", rarity: "COMMON", singleUse: true,  shopPrice: 170,      growMinSec: 240,     growMaxSec: 720,     sellMin: 30,       sellMax: 90       }, // mg: Clover
    { id: "salat",        name: "Salat",         emoji: "🥬", rarity: "COMMON", singleUse: true,  shopPrice: 210,      growMinSec: 60,      growMaxSec: 180,     sellMin: 350,      sellMax: 1050     }, // mg: Beet
    { id: "radieschen",   name: "Radieschen",    emoji: "🌿", rarity: "COMMON", singleUse: true,  shopPrice: 229,      growMinSec: 300,     growMaxSec: 1200,    sellMin: 300,      sellMax: 1200     }, // mg: Rose
    { id: "kohl",         name: "Kohl",          emoji: "🥬", rarity: "COMMON", singleUse: true,  shopPrice: 600,      growMinSec: 78,      growMaxSec: 234,     sellMin: 76,       sellMax: 228      }, // mg: Tulip
    { id: "zwiebel",      name: "Zwiebel",       emoji: "🧅", rarity: "COMMON", singleUse: true,  shopPrice: 1000,     growMinSec: 50,      growMaxSec: 150,     sellMin: 1090,     sellMax: 3270     }, // mg: Daffodil
    { id: "karotte",      name: "Karotte",       emoji: "🥕", rarity: "COMMON", singleUse: true,  shopPrice: 2500,     growMinSec: 720,     growMaxSec: 2160,    sellMin: 2708,     sellMax: 8124     }, // mg: Watermelon
    { id: "erbsen",       name: "Erbsen",        emoji: "🫘", rarity: "COMMON", singleUse: false, shopPrice: 30,       structureGrowSec: 45,    fruitCycleSec: 35,    maxFruits: 1,  fruitSellMin: 42,    fruitSellMax: 126   }, // mg: Cabbage
    { id: "bohne",        name: "Bohne",         emoji: "🫘", rarity: "COMMON", singleUse: false, shopPrice: 50,       structureGrowSec: 70,    fruitCycleSec: 10,    maxFruits: 5,  fruitSellMin: 14,    fruitSellMax: 28    }, // mg: Strawberry

    // ── UNCOMMON ──
    { id: "knoblauch",    name: "Knoblauch",     emoji: "🧄", rarity: "UNCOMMON", singleUse: true,  shopPrice: 3000,     growMinSec: 2100,    growMaxSec: 6300,    sellMin: 3700,     sellMax: 11100    }, // mg: Pumpkin
    { id: "kartoffel",    name: "Kartoffel",     emoji: "🥔", rarity: "UNCOMMON", singleUse: true,  shopPrice: 4200,     growMinSec: 120,     growMaxSec: 330,     sellMin: 5520,     sellMax: 15180    }, // mg: Echeveria
    { id: "ingwer",       name: "Ingwer",        emoji: "🌿", rarity: "UNCOMMON", singleUse: true,  shopPrice: 9000,     growMinSec: 90,      growMaxSec: 270,     sellMin: 10000,    sellMax: 30000    }, // mg: Gentian
    { id: "paprika",      name: "Paprika",       emoji: "🫑", rarity: "UNCOMMON", singleUse: true,  shopPrice: 10000,    growMinSec: 100,     growMaxSec: 300,     sellMin: 20000,    sellMax: 60000    }, // mg: Lavender
    { id: "aubergine",    name: "Aubergine",     emoji: "🍆", rarity: "UNCOMMON", singleUse: true,  shopPrice: 12000,    growMinSec: 14400,   growMaxSec: 50400,   sellMin: 15000,    sellMax: 52500    }, // mg: Pine Tree
    { id: "mais",         name: "Mais",          emoji: "🌽", rarity: "UNCOMMON", singleUse: true,  shopPrice: 20000,    growMinSec: 240,     growMaxSec: 660,     sellMin: 20123,    sellMax: 55338    }, // mg: Lily
    { id: "kuebi",        name: "Kürbis",        emoji: "🎃", rarity: "UNCOMMON", singleUse: true,  shopPrice: 50000,    growMinSec: 180,     growMaxSec: 540,     sellMin: 60000,    sellMax: 180000   }, // mg: Saffron
    { id: "rhabarber",    name: "Rhabarber",     emoji: "🌿", rarity: "UNCOMMON", singleUse: false, shopPrice: 250,      structureGrowSec: 900,   fruitCycleSec: 240,   maxFruits: 8,  fruitSellMin: 30,    fruitSellMax: 90    }, // mg: Fava Bean
    { id: "gurke",        name: "Gurke",         emoji: "🥒", rarity: "UNCOMMON", singleUse: false, shopPrice: 400,      structureGrowSec: 105,   fruitCycleSec: 22,    maxFruits: 5,  fruitSellMin: 23,    fruitSellMax: 46    }, // mg: Blueberry
    { id: "zucchini",     name: "Zucchini",      emoji: "🥒", rarity: "UNCOMMON", singleUse: false, shopPrice: 500,      structureGrowSec: 21600, fruitCycleSec: 5400,  maxFruits: 7,  fruitSellMin: 73,    fruitSellMax: 146   }, // mg: Apple
    { id: "tomate",       name: "Tomate",        emoji: "🍅", rarity: "UNCOMMON", singleUse: false, shopPrice: 800,      structureGrowSec: 1100,  fruitCycleSec: 40,    maxFruits: 2,  fruitSellMin: 27,    fruitSellMax: 54    }, // mg: Tomato
    { id: "chili",        name: "Chili",         emoji: "🌶️", rarity: "UNCOMMON", singleUse: false, shopPrice: 1300,     structureGrowSec: 130,   fruitCycleSec: 30,    maxFruits: 1,  fruitSellMin: 36,    fruitSellMax: 72    }, // mg: Corn

    // ── RARE ──
    { id: "grapefruit",   name: "Grapefruit",    emoji: "🍊", rarity: "RARE", singleUse: true,  shopPrice: 150000,   growMinSec: 86400,   growMaxSec: 302400,  sellMin: 160000,   sellMax: 560000   }, // mg: Mushroom
    { id: "zitrone",      name: "Zitrone",       emoji: "🍋", rarity: "RARE", singleUse: true,  shopPrice: 250000,   growMinSec: 9000,    growMaxSec: 16200,   sellMin: 261000,   sellMax: 469800   }, // mg: Cactus
    { id: "aprikose",     name: "Aprikose",      emoji: "🍑", rarity: "RARE", singleUse: true,  shopPrice: 400000,   growMinSec: 43200,   growMaxSec: 86400,   sellMin: 500000,   sellMax: 1000000  }, // mg: Bamboo
    { id: "honigmelone",  name: "Honigmelone",   emoji: "🍉", rarity: "RARE", singleUse: true,  shopPrice: 520000,   growMinSec: 64800,   growMaxSec: 226800,  sellMin: 600000,   sellMax: 2100000  }, // mg: Violet Cort
    { id: "cranberry",    name: "Cranberry",     emoji: "🫐", rarity: "RARE", singleUse: false, shopPrice: 3500,     structureGrowSec: 1500,  fruitCycleSec: 200,   maxFruits: 3,  fruitSellMin: 3500,  fruitSellMax: 8750  }, // mg: Squash
    { id: "stachelbeere", name: "Stachelbeere",  emoji: "🟢", rarity: "RARE", singleUse: false, shopPrice: 6000,     structureGrowSec: 21600, fruitCycleSec: 5400,  maxFruits: 7,  fruitSellMin: 250,   fruitSellMax: 500   }, // mg: Pear
    { id: "blaubeere",    name: "Blaubeere",     emoji: "🫐", rarity: "RARE", singleUse: false, shopPrice: 10000,    structureGrowSec: 43200, fruitCycleSec: 75600, maxFruits: 7,  fruitSellMin: 30,    fruitSellMax: 90    }, // mg: Coconut
    { id: "himbeere",     name: "Himbeere",      emoji: "🫐", rarity: "RARE", singleUse: false, shopPrice: 15000,    structureGrowSec: 14400, fruitCycleSec: 4500,  maxFruits: 5,  fruitSellMin: 1750,  fruitSellMax: 2975  }, // mg: Banana
    { id: "erdbeere",     name: "Erdbeere",      emoji: "🍓", rarity: "RARE", singleUse: false, shopPrice: 55000,    structureGrowSec: 86400, fruitCycleSec: 10800, maxFruits: 8,  fruitSellMin: 4875,  fruitSellMax: 12187 }, // mg: Camellia
    { id: "kirsche",      name: "Kirsche",       emoji: "🍒", rarity: "RARE", singleUse: false, shopPrice: 85000,    structureGrowSec: 7200,  fruitCycleSec: 5400,  maxFruits: 7,  fruitSellMin: 9000,  fruitSellMax: 27000 }, // mg: Peach
    { id: "limette",      name: "Limette",       emoji: "🍋", rarity: "RARE", singleUse: false, shopPrice: 93000,    structureGrowSec: 1800,  fruitCycleSec: 100,   maxFruits: 2,  fruitSellMin: 6000,  fruitSellMax: 15000 }, // mg: Burro's Tail

    // ── EPIC ──
    { id: "holunder",     name: "Holunder",      emoji: "🍇", rarity: "EPIC", singleUse: true,  shopPrice: 1000000,  growMinSec: 3600,    growMaxSec: 10800,   sellMin: 2000000,  sellMax: 6000000  }, // mg: Ube
    { id: "guave",        name: "Guave",         emoji: "🍈", rarity: "EPIC", singleUse: true,  shopPrice: 2500000,  growMinSec: 7200,    growMaxSec: 21600,   sellMin: 4000000,  sellMax: 10000000 }, // Interpolated
    { id: "pfirsich",     name: "Pfirsich",      emoji: "🍑", rarity: "EPIC", singleUse: true,  shopPrice: 5000000,  growMinSec: 14400,   growMaxSec: 43200,   sellMin: 8000000,  sellMax: 20000000 }, // Interpolated
    { id: "avocado",      name: "Avocado",       emoji: "🥑", rarity: "EPIC", singleUse: true,  shopPrice: 10000000, growMinSec: 172800,  growMaxSec: 518400,  sellMin: 12000000, sellMax: 36000000 }, // mg: Dawnbreaker
    { id: "apfel",        name: "Apfel",         emoji: "🍎", rarity: "EPIC", singleUse: false, shopPrice: 500000,   structureGrowSec: 10800, fruitCycleSec: 5400,  maxFruits: 4,  fruitSellMin: 30000, fruitSellMax: 60000 }, // mg: Poinsettia
    { id: "birne",        name: "Birne",         emoji: "🍐", rarity: "EPIC", singleUse: false, shopPrice: 500000,   structureGrowSec: 2700,  fruitCycleSec: 7200,  maxFruits: 3,  fruitSellMin: 100000,fruitSellMax: 250000}, // mg: Eggplant
    { id: "traube",       name: "Traube",        emoji: "🍇", rarity: "EPIC", singleUse: false, shopPrice: 670000,   structureGrowSec: 86400, fruitCycleSec: 10800, maxFruits: 7,  fruitSellMin: 18000, fruitSellMax: 49500 }, // mg: Chrysanthemum
    { id: "orange",       name: "Orange",        emoji: "🍊", rarity: "EPIC", singleUse: false, shopPrice: 750000,   structureGrowSec: 64800, fruitCycleSec: 3600,  maxFruits: 11, fruitSellMin: 15000, fruitSellMax: 30000 }, // mg: Date
    { id: "kiwi",         name: "Kiwi",          emoji: "🥝", rarity: "EPIC", singleUse: false, shopPrice: 850000,   structureGrowSec: 86400, fruitCycleSec: 900,   maxFruits: 1,  fruitSellMin: 12500, fruitSellMax: 25000 }, // mg: Grape
    { id: "pflaume",      name: "Pflaume",       emoji: "🍑", rarity: "EPIC", singleUse: false, shopPrice: 1000000,  structureGrowSec: 560,   fruitCycleSec: 600,   maxFruits: 9,  fruitSellMin: 7220,  fruitSellMax: 14440 }, // mg: Pepper
    { id: "mango",        name: "Mango",         emoji: "🥭", rarity: "EPIC", singleUse: false, shopPrice: 2000000,  structureGrowSec: 43200, fruitCycleSec: 3600,  maxFruits: 6,  fruitSellMin: 10000, fruitSellMax: 30000 }, // mg: Lemon
    { id: "olive",        name: "Olive",         emoji: "🫒", rarity: "EPIC", singleUse: false, shopPrice: 2750000,  structureGrowSec: 86400, fruitCycleSec: 2700,  maxFruits: 2,  fruitSellMin: 24500, fruitSellMax: 49000 }, // mg: Passion Fruit

    // ── LEGENDARY ──
    { id: "ananas",       name: "Ananas",        emoji: "🍍", rarity: "LEGENDARY", singleUse: true,  shopPrice: 50000000, growMinSec: 259200,  growMaxSec: 777600,  sellMin: 60000000, sellMax: 180000000}, // Interpolated Huge
    { id: "bambus",       name: "Bambus",        emoji: "🎋", rarity: "LEGENDARY", singleUse: true,  shopPrice: 100000000,growMinSec: 345600,  growMaxSec: 1036800, sellMin: 150000000,sellMax: 450000000}, // Interpolated Huge
    { id: "kakao",        name: "Kakao",         emoji: "🫘", rarity: "LEGENDARY", singleUse: true,  shopPrice: 500000000,growMinSec: 432000,  growMaxSec: 1296000, sellMin: 800000000,sellMax: 2400000000},// Interpolated Huge
    { id: "drachenfrucht", name: "Drachenfrucht", emoji: "🐉", rarity: "LEGENDARY", singleUse: true,  shopPrice: 1000000000,growMinSec: 604800,  growMaxSec: 1814400, sellMin: 2000000000,sellMax: 6000000000},// Interpolated Huge
    { id: "banane",       name: "Banane",        emoji: "🍌", rarity: "LEGENDARY", singleUse: false, shopPrice: 5000000, structureGrowSec: 1800,  fruitCycleSec: 900,   maxFruits: 7,  fruitSellMin: 24500, fruitSellMax: 49000 }, // mg: Dragon Fruit
    { id: "acai",         name: "Acai",          emoji: "🫐", rarity: "LEGENDARY", singleUse: false, shopPrice: 10000000,structureGrowSec: 86400, fruitCycleSec: 5400,  maxFruits: 6,  fruitSellMin: 70000, fruitSellMax: 175000}, // mg: Cacao
    { id: "passionsfrucht", name: "Passionsfrucht", emoji: "🌺", rarity: "LEGENDARY", singleUse: false, shopPrice: 25000000,structureGrowSec: 86400, fruitCycleSec: 1800,  maxFruits: 6,  fruitSellMin: 50000, fruitSellMax: 100000}, // mg: Lychee
    { id: "sternfrucht",  name: "Sternfrucht",   emoji: "⭐", rarity: "LEGENDARY", singleUse: false, shopPrice: 100000000,structureGrowSec: 86400, fruitCycleSec: 18000, maxFruits: 1,  fruitSellMin: 750000,fruitSellMax: 1875000},// mg: Sunflower
    { id: "dattel",       name: "Dattel",        emoji: "🌴", rarity: "LEGENDARY", singleUse: false, shopPrice: 1000000000,structureGrowSec: 86400, fruitCycleSec: 86400, maxFruits: 1,  fruitSellMin: 10000000,fruitSellMax: 20000000},// mg: Starweaver
    { id: "kokosnuss",    name: "Kokosnuss",     emoji: "🥥", rarity: "LEGENDARY", singleUse: false, shopPrice: 10000000000,structureGrowSec: 86400, fruitCycleSec: 86400, maxFruits: 1,  fruitSellMin: 11000000,fruitSellMax: 27500000},// mg: Dawnbinder

    // ── MYTHIC ──
    { id: "mondblume",    name: "Mondblume",     emoji: "🌙", rarity: "MYTHIC",    singleUse: true,  shopPrice: 50000000000,growMinSec: 864000, growMaxSec: 2592000, sellMin: 50000000000, sellMax: 150000000000}, // mg: Moonbinder (interpolated for Single Use)
];

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
        const profile = plant.profile;
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

    const readyIdx = (plant.fruitSlots || []).findIndex(s => s.readyAt <= now);
    if (readyIdx === -1) return null;

    const harvestedSlot = plant.fruitSlots[readyIdx] || {};
    const norm = Number.isFinite(harvestedSlot.norm) ? harvestedSlot.norm : rollNorm(1.35);
    const size = Number.isFinite(harvestedSlot.size) ? harvestedSlot.size : sizeFromNorm(norm);
    const special = SPECIAL_TYPES[(harvestedSlot.specialType || "").toUpperCase() || "NORMAL"] || SPECIAL_TYPES.NORMAL;
    plant.fruitSlots[readyIdx] = createPerennialFruitSlot(now, plant.fruitCycleMs || 60000);
    plant.harvested += 1;

    const profile = plant.profile;
    const baseValue = lerp(profile.fruitSellMin, profile.fruitSellMax, norm);
    const gold = Math.max(1, Math.floor(baseValue * special.valueBoost));
    return { gold, size, specialData: special };
}
