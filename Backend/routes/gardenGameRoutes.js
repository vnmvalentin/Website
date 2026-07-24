// routes/gardenGameRoutes.js
// Garden backend: authoritative sync, file-persisted farm states, delta events

const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const { farmStates, setFarmState, scheduleFarmsSave } = require("../lib/gardenFarmsStore");
// farmStates: siehe initGardenFarmsStore() in index.js vor server.listen

// ─── Plant time-advancement (authoritative offline progress) ─────────────────
// Advance perennial plants from structure → fruiting stage based on wall-clock time.
// Slot readyAt timestamps are absolute and self-advancing — no extra math needed.
function isPlantReadyServer(plant, now = Date.now()) {
    if (!plant) return false;
    if (plant.singleUse) {
        return now >= plant.plantedAt + (plant.growthMs || 0) && plant.stage !== "harvested";
    }
    if (plant.stage === "structure" && now < plant.structureReadyAt) return false;
    return (plant.fruitSlots || []).some(s => s.readyAt <= now);
}

function advancePlantTime(plants, now = Date.now()) {
    if (!plants || typeof plants !== "object") return plants;
    const result = {};
    for (const [key, plant] of Object.entries(plants)) {
        if (!plant) continue;
        const p = { ...plant };
        if (!p.singleUse && p.stage === "structure" && now >= p.structureReadyAt) {
            p.stage = "fruiting";
            // Initialise slots if missing/empty (older save format or deferred slot start)
            if (!Array.isArray(p.fruitSlots) || p.fruitSlots.length === 0) {
                const cycleMs = p.fruitCycleMs || 60000;
                p.fruitSlots = Array.from({ length: p.maxFruits || 1 }, () => createFruitSlot(now, cycleMs));
            }
        }
        if (!p.singleUse && Array.isArray(p.fruitSlots) && p.fruitSlots.length > 0) {
            p.fruitSlots = p.fruitSlots.map((slot) => {
                const norm = Number.isFinite(slot?.norm) ? slot.norm : randomNorm();
                return {
                    ...(slot || {}),
                    norm,
                    size: Number.isFinite(slot?.size) ? slot.size : sizeFromNorm(norm),
                };
            });
        }
        result[key] = p;
    }
    return result;
}

/** fruitSlots: `size` leitet sich aus `norm` ab (sizeFromNorm) – nur readyAt+norm speichern */
function stripFruitSizeFromPlants(plants) {
    if (!plants || typeof plants !== "object") return {};
    const out = {};
    for (const [key, plant] of Object.entries(plants)) {
        if (!plant) continue;
        const p = { ...plant };
        if (Array.isArray(p.fruitSlots) && p.fruitSlots.length > 0) {
            p.fruitSlots = p.fruitSlots.map((s) => {
                const slot = { readyAt: s.readyAt };
                if (Number.isFinite(s?.norm)) slot.norm = s.norm;
                return slot;
            });
        }
        out[key] = p;
    }
    return out;
}

function randomNorm() {
    return Math.pow(Math.random(), 1.35);
}

function sizeFromNorm(norm) {
    return Math.max(1, Math.round(1 + 49 * Math.max(0, Math.min(1, Number(norm) || 0))));
}

function rollSpecialType() {
    const r = Math.random();
    if (r < 0.01) return "Rainbow";
    if (r < 0.05) return "Golden";
    return null;
}

function createFruitSlot(now, cycleMs) {
    const norm = randomNorm();
    return {
        readyAt: now + Math.round(cycleMs * (0.8 + Math.random() * 0.4)),
        norm,
        size: sizeFromNorm(norm),
        specialType: rollSpecialType(),
    };
}

function isPlainObject(o) {
    return o && typeof o === "object" && !Array.isArray(o);
}

const GOLD_MAX = 9_999_999_999_999; // 10 trillion hard cap
const ARRAY_MAX_ITEMS = 2000;       // max items per inventory array
const VALID_RARITIES = new Set(["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY", "MYTHIC"]);

function sanitizeItemArray(arr) {
    if (!Array.isArray(arr)) return [];
    return arr.slice(0, ARRAY_MAX_ITEMS).filter(item => item && typeof item === "object");
}

// Merge client-submitted items with server-only items (e.g. gifts received between syncs).
// Preserves any server item whose instanceId/id is absent from the client array.
function mergeServerItems(clientItems, serverItems, maxLen) {
    if (!Array.isArray(clientItems)) return serverItems || [];
    const clientIds = new Set(clientItems.map(i => i.instanceId || i.id).filter(Boolean));
    const serverOnly = (serverItems || []).filter(i => {
        const id = i.instanceId || i.id;
        return id && !clientIds.has(id);
    });
    return [...clientItems, ...serverOnly].slice(0, maxLen);
}

function compactFarmState(state) {
    const expansionsNum = Number(state.plotExpansions);
    const inventorySlotsNum = Number(state.inventoryMaxSlots);
    const plotUnlockedCells = normalizePlotUnlockedCells(state?.plotUnlockedCells);
    const ssv = Number(state.shopStockVersion);
    const tsv = Number(state.toolShopStockVersion);
    const esv = Number(state.eggShopStockVersion);
    const rawGold = Number(state.gold || 0);
    return {
        gold: Number.isFinite(rawGold) ? Math.max(0, Math.min(GOLD_MAX, rawGold)) : 0,
        inventory: sanitizeItemArray(state.inventory),
        plotPlants: stripFruitSizeFromPlants(advancePlantTime(state.plotPlants || {})),
        plotExpansions: Number.isFinite(expansionsNum)
            ? Math.max(0, Math.min(MAX_PLOT_EXPANSIONS, expansionsNum))
            : (plotUnlockedCells.length > 0 ? Math.min(MAX_PLOT_EXPANSIONS, Math.ceil(plotUnlockedCells.length / BASE_DIRT_COLS)) : 0),
        plotUnlockedCells,
        harvestedItems: sanitizeItemArray(state.harvestedItems),
        eggInventory: sanitizeItemArray(state.eggInventory),
        petInventory: sanitizeItemArray(state.petInventory),
        petPlacements: sanitizeItemArray(state.petPlacements),
        decoInventory: sanitizeItemArray(state.decoInventory),
        decoPlacements: sanitizeItemArray(state.decoPlacements),
        toolInventory: normalizeToolInventory(state.toolInventory),
        inventoryMaxSlots: Number.isFinite(inventorySlotsNum) ? Math.max(50, Math.min(200, inventorySlotsNum)) : 50,
        tutorialCompleted: state.tutorialCompleted === true || state.tutorialCompleted === "true",
        mailbox: Array.isArray(state.mailbox) ? state.mailbox : [],
        incubator: state.incubator && typeof state.incubator === "object"
            ? state.incubator
            : { unlockedSlots: 1, slots: [null] },
        appearance: state.appearance || { 
            head: "/garden-assets/wardrobe/head_farmer.png", 
            body: "/garden-assets/wardrobe/body_overalls.png" 
        },
        ...(isPlainObject(state.shopStock) ? { shopStock: state.shopStock } : {}),
        ...(Number.isFinite(ssv) ? { shopStockVersion: ssv } : {}),
        ...(isPlainObject(state.toolShopStock) ? { toolShopStock: state.toolShopStock } : {}),
        ...(Number.isFinite(tsv) ? { toolShopStockVersion: tsv } : {}),
        ...(isPlainObject(state.eggShopStock) ? { eggShopStock: state.eggShopStock } : {}),
        ...(Number.isFinite(esv) ? { eggShopStockVersion: esv } : {}),
        updatedAt: Date.now(),
    };
}

// ─── Shop ─────────────────────────────────────────────────────────────────────
const SHOP_ROTATION_MS = 5 * 60 * 1000;
const TOOL_EGG_ROTATION_MS = 10 * 60 * 1000;
const BASE_DIRT_COLS = 15;
const BASE_DIRT_ROWS = 15;
const EXTRA_PLOT_ROWS = 15;
const RARITY_ORDER = ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY", "MYTHIC"];
const RARITY_WEIGHTS = { COMMON: 10, UNCOMMON: 6, RARE: 3, EPIC: 2, LEGENDARY: 1, MYTHIC: 0.5 };
const MAX_PLOT_EXPANSIONS = EXTRA_PLOT_ROWS;
const DEFAULT_TOOL_INVENTORY = {
    pickaxeUses: 0,
    pickaxesBought: 0, // 7. ANPASSUNG
    hasShovel: false,
    backpackUpgraded: false,
    plantPots: 0,
    wateringCans: 0,
};
const TOOL_SHOP_ITEMS = [
    { id: "pickaxe", name: "Spitzhacke", emoji: "⛏️", price: 6500, type: "uses", uses: 4, stock: 1 },
    { id: "shovel", name: "Schaufel", emoji: "🪓", price: 1000000, type: "permanent", stock: 1 },
    { id: "plant_pot", name: "Plant Pot", emoji: "🪴", price: 1800, type: "single", stock: 5 },
    { id: "backpack_upgrade", name: "Rucksack Upgrade", emoji: "🎒", price: 22000, type: "permanent", stock: 1 },
    { id: "watering_can", name: "Gießkanne", emoji: "🪣", price: 2400, type: "single", stock: 5 },
];

const EGG_SHOP_CATALOGUE = [
    { id: "common_egg", name: "Common Egg", emoji: "🥚", image: "/garden-assets/eggs/common_egg.png", rarity: "COMMON", price: 100000, hatchTable: [{ type: "Huhn", chance: 70 }, { type: "Ente", chance: 25 }, { type: "Schwein", chance: 5 }] },
    { id: "uncommon_egg", name: "Uncommon Egg", emoji: "🥚", image: "/garden-assets/eggs/uncommon_egg.png", rarity: "UNCOMMON", price: 1000000, hatchTable: [{ type: "Ente", chance: 60 }, { type: "Katze", chance: 30 }, { type: "Waschbär", chance: 10 }] },
    { id: "rare_egg", name: "Rare Egg", emoji: "🥚", image: "/garden-assets/eggs/rare_egg.png", rarity: "RARE", price: 10000000, hatchTable: [{ type: "Kuh", chance: 60 }, { type: "Schaf", chance: 30 }, { type: "Pferd", chance: 10 }] },
    { id: "epic_egg", name: "Epic Egg", emoji: "🥚", image: "/garden-assets/eggs/epic_egg.png", rarity: "EPIC", price: 100000000, hatchTable: [{ type: "Esel", chance: 60 }, { type: "Hund", chance: 30 }, { type: "Einhorn", chance: 10 }] },
    { id: "legendary_egg", name: "Legendary Egg", emoji: "🥚", image: "/garden-assets/eggs/legendary_egg.png", rarity: "LEGENDARY", price: 1000000000, hatchTable: [{ type: "Pferd", chance: 50 }, { type: "Hund", chance: 40 }, { type: "Einhorn", chance: 10 }] },
];

const SHOP_POOL = [
    // COMMON
    { seedId: "loewenzahn",   name: "Löwenzahn",    emoji: "🌼", rarity: "COMMON",    shopPrice: 10,         singleUse: true  },
    { seedId: "minze",        name: "Minze",         emoji: "🌿", rarity: "COMMON",    shopPrice: 100,        singleUse: true  },
    { seedId: "brennnesseln", name: "Brennnesseln",  emoji: "🌱", rarity: "COMMON",    shopPrice: 135,        singleUse: true  },
    { seedId: "spinat",       name: "Spinat",        emoji: "🍃", rarity: "COMMON",    shopPrice: 170,        singleUse: true  },
    { seedId: "salat",        name: "Salat",         emoji: "🥬", rarity: "COMMON",    shopPrice: 210,        singleUse: true  },
    { seedId: "radieschen",   name: "Radieschen",    emoji: "🌿", rarity: "COMMON",    shopPrice: 229,        singleUse: true  },
    { seedId: "kohl",         name: "Kohl",          emoji: "🥬", rarity: "COMMON",    shopPrice: 600,        singleUse: true  },
    { seedId: "zwiebel",      name: "Zwiebel",       emoji: "🧅", rarity: "COMMON",    shopPrice: 1000,       singleUse: true  },
    { seedId: "karotte",      name: "Karotte",       emoji: "🥕", rarity: "COMMON",    shopPrice: 2500,       singleUse: true  },
    { seedId: "erbsen",       name: "Erbsen",        emoji: "🫘", rarity: "COMMON",    shopPrice: 30,         singleUse: false },
    { seedId: "bohne",        name: "Bohne",         emoji: "🫘", rarity: "COMMON",    shopPrice: 50,         singleUse: false },
    // UNCOMMON
    { seedId: "knoblauch",    name: "Knoblauch",     emoji: "🧄", rarity: "UNCOMMON",  shopPrice: 3000,       singleUse: true  },
    { seedId: "kartoffel",    name: "Kartoffel",     emoji: "🥔", rarity: "UNCOMMON",  shopPrice: 4200,       singleUse: true  },
    { seedId: "ingwer",       name: "Ingwer",        emoji: "🌿", rarity: "UNCOMMON",  shopPrice: 9000,       singleUse: true  },
    { seedId: "paprika",      name: "Paprika",       emoji: "🫑", rarity: "UNCOMMON",  shopPrice: 10000,      singleUse: true  },
    { seedId: "aubergine",    name: "Aubergine",     emoji: "🍆", rarity: "UNCOMMON",  shopPrice: 12000,      singleUse: true  },
    { seedId: "mais",         name: "Mais",          emoji: "🌽", rarity: "UNCOMMON",  shopPrice: 20000,      singleUse: true  },
    { seedId: "kuebi",        name: "Kürbis",        emoji: "🎃", rarity: "UNCOMMON",  shopPrice: 50000,      singleUse: true  },
    { seedId: "rhabarber",    name: "Rhabarber",     emoji: "🌿", rarity: "UNCOMMON",  shopPrice: 250,        singleUse: false },
    { seedId: "gurke",        name: "Gurke",         emoji: "🥒", rarity: "UNCOMMON",  shopPrice: 400,        singleUse: false },
    { seedId: "zucchini",     name: "Zucchini",      emoji: "🥒", rarity: "UNCOMMON",  shopPrice: 500,        singleUse: false },
    { seedId: "tomate",       name: "Tomate",        emoji: "🍅", rarity: "UNCOMMON",  shopPrice: 800,        singleUse: false },
    { seedId: "chili",        name: "Chili",         emoji: "🌶️", rarity: "UNCOMMON",  shopPrice: 1300,       singleUse: false },
    // RARE
    { seedId: "grapefruit",   name: "Grapefruit",    emoji: "🍊", rarity: "RARE",      shopPrice: 150000,     singleUse: true  },
    { seedId: "zitrone",      name: "Zitrone",       emoji: "🍋", rarity: "RARE",      shopPrice: 250000,     singleUse: true  },
    { seedId: "aprikose",     name: "Aprikose",      emoji: "🍑", rarity: "RARE",      shopPrice: 400000,     singleUse: true  },
    { seedId: "honigmelone",  name: "Honigmelone",   emoji: "🍉", rarity: "RARE",      shopPrice: 520000,     singleUse: true  },
    { seedId: "cranberry",    name: "Cranberry",     emoji: "🫐", rarity: "RARE",      shopPrice: 3500,       singleUse: false },
    { seedId: "stachelbeere", name: "Stachelbeere",  emoji: "🟢", rarity: "RARE",      shopPrice: 6000,       singleUse: false },
    { seedId: "blaubeere",    name: "Blaubeere",     emoji: "🫐", rarity: "RARE",      shopPrice: 10000,      singleUse: false },
    { seedId: "himbeere",     name: "Himbeere",      emoji: "🫐", rarity: "RARE",      shopPrice: 15000,      singleUse: false },
    { seedId: "erdbeere",     name: "Erdbeere",      emoji: "🍓", rarity: "RARE",      shopPrice: 55000,      singleUse: false },
    { seedId: "kirsche",      name: "Kirsche",       emoji: "🍒", rarity: "RARE",      shopPrice: 85000,      singleUse: false },
    { seedId: "limette",      name: "Limette",       emoji: "🍋", rarity: "RARE",      shopPrice: 93000,      singleUse: false },
    // EPIC
    { seedId: "holunder",     name: "Holunder",      emoji: "🍇", rarity: "EPIC",      shopPrice: 1000000,    singleUse: true  },
    { seedId: "guave",        name: "Guave",         emoji: "🍈", rarity: "EPIC",      shopPrice: 2500000,    singleUse: true  },
    { seedId: "pfirsich",     name: "Pfirsich",      emoji: "🍑", rarity: "EPIC",      shopPrice: 5000000,    singleUse: true  },
    { seedId: "avocado",      name: "Avocado",       emoji: "🥑", rarity: "EPIC",      shopPrice: 10000000,   singleUse: true  },
    { seedId: "apfel",        name: "Apfel",         emoji: "🍎", rarity: "EPIC",      shopPrice: 500000,     singleUse: false },
    { seedId: "birne",        name: "Birne",         emoji: "🍐", rarity: "EPIC",      shopPrice: 500000,     singleUse: false },
    { seedId: "traube",       name: "Traube",        emoji: "🍇", rarity: "EPIC",      shopPrice: 670000,     singleUse: false },
    { seedId: "orange",       name: "Orange",        emoji: "🍊", rarity: "EPIC",      shopPrice: 750000,     singleUse: false },
    { seedId: "kiwi",         name: "Kiwi",          emoji: "🥝", rarity: "EPIC",      shopPrice: 850000,     singleUse: false },
    { seedId: "pflaume",      name: "Pflaume",       emoji: "🍑", rarity: "EPIC",      shopPrice: 1000000,    singleUse: false },
    { seedId: "mango",        name: "Mango",         emoji: "🥭", rarity: "EPIC",      shopPrice: 2000000,    singleUse: false },
    { seedId: "olive",        name: "Olive",         emoji: "🫒", rarity: "EPIC",      shopPrice: 2750000,    singleUse: false },
    // LEGENDARY
    { seedId: "ananas",       name: "Ananas",        emoji: "🍍", rarity: "LEGENDARY", shopPrice: 50000000,   singleUse: true  },
    { seedId: "bambus",       name: "Bambus",        emoji: "🎋", rarity: "LEGENDARY", shopPrice: 100000000,  singleUse: true  },
    { seedId: "kakao",        name: "Kakao",         emoji: "🫘", rarity: "LEGENDARY", shopPrice: 500000000,  singleUse: true  },
    { seedId: "drachenfrucht", name: "Drachenfrucht", emoji: "🐉", rarity: "LEGENDARY", shopPrice: 1000000000, singleUse: true  },
    { seedId: "banane",       name: "Banane",        emoji: "🍌", rarity: "LEGENDARY", shopPrice: 5000000,    singleUse: false },
    { seedId: "acai",         name: "Acai",          emoji: "🫐", rarity: "LEGENDARY", shopPrice: 10000000,   singleUse: false },
    { seedId: "passionsfrucht", name: "Passionsfrucht", emoji: "🌺", rarity: "LEGENDARY", shopPrice: 25000000,  singleUse: false },
    { seedId: "sternfrucht",  name: "Sternfrucht",   emoji: "⭐", rarity: "LEGENDARY", shopPrice: 100000000,  singleUse: false },
    { seedId: "dattel",       name: "Dattel",        emoji: "🌴", rarity: "LEGENDARY", shopPrice: 1000000000, singleUse: false },
    { seedId: "kokosnuss",    name: "Kokosnuss",     emoji: "🥥", rarity: "LEGENDARY", shopPrice: 10000000000,singleUse: false },
    // MYTHIC
    { seedId: "mondblume",    name: "Mondblume",     emoji: "🌙", rarity: "MYTHIC",    shopPrice: 50000000000,singleUse: true  },
];

const PLANTED_SEED_IMAGE = "/garden-assets/common/planted_seed.png";

function getPlantVisuals(seedId, singleUse = true) {
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

function withSeedVisuals(seed) {
    const visuals = getPlantVisuals(seed.seedId, seed.singleUse !== false);
    return {
        ...seed,
        image: seed.image || visuals.seedShopImage,
        ...visuals,
    };
}

function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function getRotationWindowStart(now, intervalMs) {
    return Math.floor(now / intervalMs) * intervalMs;
}
function getNextRotationAt(now, intervalMs) {
    return getRotationWindowStart(now, intervalMs) + intervalMs;
}
function hashString(input) {
    let h = 2166136261;
    for (let i = 0; i < input.length; i++) {
        h ^= input.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}
function makeSeededRng(seedString) {
    let seed = hashString(seedString) || 1;
    return () => {
        seed ^= seed << 13;
        seed ^= seed >>> 17;
        seed ^= seed << 5;
        return ((seed >>> 0) / 4294967296);
    };
}
function normalizeToolInventory(inv) {
    return {
        ...DEFAULT_TOOL_INVENTORY,
        ...(inv && typeof inv === "object" ? inv : {}),
    };
}
function normalizePlotUnlockedCells(cells) {
    if (!Array.isArray(cells)) return [];
    const out = new Set();
    const topMin = -EXTRA_PLOT_ROWS;
    const topMax = -1;
    const bottomMin = BASE_DIRT_ROWS;
    const bottomMax = BASE_DIRT_ROWS + EXTRA_PLOT_ROWS - 1;
    for (const raw of cells) {
        if (typeof raw !== "string") continue;
        const [xs, ys] = raw.split("_");
        const x = Number(xs);
        const y = Number(ys);
        if (!Number.isInteger(x) || !Number.isInteger(y)) continue;
        const validY = (y >= topMin && y <= topMax) || (y >= bottomMin && y <= bottomMax);
        if (!validY) continue;
        if (x < 0 || x >= BASE_DIRT_COLS) continue;
        out.add(`${x}_${y}`);
    }
    return [...out];
}
function unlockedCellsFromLegacyExpansions(expansions, isTopRow = true) {
    const level = Math.max(0, Math.min(MAX_PLOT_EXPANSIONS, Number(expansions) || 0));
    const out = [];
    for (let row = 1; row <= level; row++) {
        const y = isTopRow ? -row : (BASE_DIRT_ROWS + row - 1);
        for (let x = 0; x < BASE_DIRT_COLS; x++) out.push(`${x}_${y}`);
    }
    return normalizePlotUnlockedCells(out);
}
function resolvePlotUnlockedCells(stateLike, isTopRow = true) {
    const explicit = normalizePlotUnlockedCells(stateLike?.plotUnlockedCells);
    if (explicit.length > 0) {
        const filtered = explicit.filter((k) => {
            const y = Number(k.split("_")[1]);
            return isTopRow ? y < 0 : y >= BASE_DIRT_ROWS;
        });
        if (filtered.length > 0) return filtered;
    }
    return unlockedCellsFromLegacyExpansions(stateLike?.plotExpansions, isTopRow);
}

function pickWeightedSeed(pool) {
    const total = pool.reduce((s, p) => s + (RARITY_WEIGHTS[p.rarity] || 1), 0);
    let r = Math.random() * total;
    for (let i = 0; i < pool.length; i++) {
        r -= (RARITY_WEIGHTS[pool[i].rarity] || 1);
        if (r <= 0) return i;
    }
    return 0;
}

// ─── Global shop rotation (shared by all lobbies + singleplayer) ─────────────
// Returns ALL seeds with active:bool. Active seeds also have stockPerPlayer (3-8).
function generateGlobalShopRotation() {
    const chances = { COMMON: 0.80, UNCOMMON: 0.65, RARE: 0.40, EPIC: 0.20, LEGENDARY: 0.05, MYTHIC: 0.01 };
    
    const activeSet = new Set();
    for (const seed of SHOP_POOL) {
        const chance = chances[seed.rarity] || 0.5;
        if (Math.random() <= chance) {
            activeSet.add(seed.seedId);
        }
    }

    if (activeSet.size === 0 && SHOP_POOL.length > 0) {
        activeSet.add(SHOP_POOL[0].seedId);
    }

    const seeds = SHOP_POOL.map(seed => withSeedVisuals({
        instanceId: activeSet.has(seed.seedId) ? uuidv4() : null,
        seedId:     seed.seedId,
        name:       seed.name,
        emoji:      seed.emoji,
        rarity:     seed.rarity,
        shopPrice:  seed.shopPrice,
        singleUse:  seed.singleUse,
        active:     activeSet.has(seed.seedId),
        stockPerPlayer: activeSet.has(seed.seedId)
            ? (seed.singleUse ? randomInt(5, 20) : randomInt(1, 4))
            : 0,
    })).sort((a, b) => {
        const ro = RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity);
        return ro !== 0 ? ro : a.shopPrice - b.shopPrice;
    });
    const now = Date.now();
    return { seeds, generatedAt: now, nextRotation: getNextRotationAt(now, SHOP_ROTATION_MS) };
}

function generateGlobalToolShopRotation(now = Date.now()) {
    const windowStart = getRotationWindowStart(now, TOOL_EGG_ROTATION_MS);
    const items = TOOL_SHOP_ITEMS.map((item) => ({
        ...item,
        stock: item.type === "single" ? item.stock : 1,
    }));
    return { items, generatedAt: windowStart, nextRotation: windowStart + TOOL_EGG_ROTATION_MS };
}

function generateGlobalEggShopRotation(now = Date.now()) {
    const windowStart = getRotationWindowStart(now, TOOL_EGG_ROTATION_MS);
    const rng = makeSeededRng(`egg-${windowStart}`);
    // Balancing: RARE/EPIC/LEGENDARY waren mit 6%/2%/0.6% pro 10min praktisch nie im Shop
    // (Legendary ~1x pro 27h). Jetzt tauchen sie regelmäßig genug auf, um Sparziele zu sein.
    const rarityChance = { COMMON: 1, UNCOMMON: 0.9, RARE: 0.35, EPIC: 0.15, LEGENDARY: 0.05 };
    const byRarity = {};
    for (const egg of EGG_SHOP_CATALOGUE) {
        if (!byRarity[egg.rarity]) byRarity[egg.rarity] = [];
        byRarity[egg.rarity].push(egg);
    }
    const items = [];
    for (const rarity of ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY"]) {
        const pool = byRarity[rarity] || [];
        if (!pool.length) continue;
        if (rng() > (rarityChance[rarity] || 0)) continue;
        const picked = pool[Math.floor(rng() * pool.length)];
        const stock = 1 + Math.floor(rng() * 2);
        items.push({ ...picked, stock });
    }
    return { items, generatedAt: windowStart, nextRotation: windowStart + TOOL_EGG_ROTATION_MS };
}

// Shared global state
const globalShopState = {
    rotation: generateGlobalShopRotation(8),
    nextRotationAt: getNextRotationAt(Date.now(), SHOP_ROTATION_MS),
};
const globalToolShopState = {
    rotation: generateGlobalToolShopRotation(),
    nextRotationAt: getNextRotationAt(Date.now(), TOOL_EGG_ROTATION_MS),
};
const globalEggShopState = {
    rotation: generateGlobalEggShopRotation(),
    nextRotationAt: getNextRotationAt(Date.now(), TOOL_EGG_ROTATION_MS),
};

// ─── HTTP Routes ──────────────────────────────────────────────────────────────
module.exports = function ({ requireAuth }) {
    // Global shop rotation tick – eine Rotation für alle Singleplayer-Farmen
    setInterval(() => {
        const now = Date.now();
        if (now >= globalShopState.nextRotationAt) {
            globalShopState.rotation = generateGlobalShopRotation(8);
            globalShopState.nextRotationAt = globalShopState.rotation.nextRotation;
        }
        if (now >= globalToolShopState.nextRotationAt) {
            globalToolShopState.rotation = generateGlobalToolShopRotation(now);
            globalToolShopState.nextRotationAt = globalToolShopState.rotation.nextRotation;
        }
        if (now >= globalEggShopState.nextRotationAt) {
            globalEggShopState.rotation = generateGlobalEggShopRotation(now);
            globalEggShopState.nextRotationAt = globalEggShopState.rotation.nextRotation;
        }
    }, 1000); // check every second for wall-clock aligned resets

    // GET /api/garden/global-shop
    router.get("/global-shop", requireAuth, (req, res) => {
        res.json({
            shopRotation: globalShopState.rotation,
            nextRotation: globalShopState.nextRotationAt,
            toolShopRotation: globalToolShopState.rotation,
            nextToolRotation: globalToolShopState.nextRotationAt,
            eggShopRotation: globalEggShopState.rotation,
            nextEggRotation: globalEggShopState.nextRotationAt,
        });
    });

    // GET /api/garden/is-subscriber — checks if the logged-in user subscribes to the streamer channel.
    // Uses TWITCH_CLIENT_ID + TWITCH_CLIENT_SECRET (client_credentials app token) or
    // STREAMER_TWITCH_TOKEN if set (broadcaster user token — more reliable for channel:read:subscriptions).
    const BETA_TESTERS = new Set((process.env.GARDEN_BETA_TESTERS || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean));
    const subCache = new Map(); // twitchId → { result: bool, ts: number }
    const SUB_CACHE_TTL = 5 * 60 * 1000;

    // -- NEU: Automatischer Twitch Token Refresh --
    const fs = require('fs');
    const path = require('path');
    
    // Wir speichern den aktuellsten Token in einer JSON, 
    // damit er auch nach einem Server-Neustart nicht verloren geht!
    const TWITCH_TOKEN_FILE = path.join(__dirname, '../data/twitch_token.json');

    let broadcasterAccessToken = process.env.STREAMER_TWITCH_TOKEN;
    let broadcasterRefreshToken = process.env.STREAMER_TWITCH_REFRESH_TOKEN;

    // Lade den neuesten Token aus der Datei, falls der Server neugestartet wurde
    if (fs.existsSync(TWITCH_TOKEN_FILE)) {
        try {
            const data = JSON.parse(fs.readFileSync(TWITCH_TOKEN_FILE, 'utf8'));
            if (data.access_token) broadcasterAccessToken = data.access_token;
            if (data.refresh_token) broadcasterRefreshToken = data.refresh_token;
        } catch (e) {
            console.error("[Twitch] Fehler beim Lesen der Token-Datei:", e);
        }
    }

    // Diese Funktion holt vollautomatisch einen frischen Token über die Twitch API
    async function refreshBroadcasterToken() {
        const clientId = process.env.TWITCH_CLIENT_ID;
        const clientSecret = process.env.TWITCH_CLIENT_SECRET;

        if (!clientId || !clientSecret || !broadcasterRefreshToken) {
            console.error("[Twitch] ❌ FEHLER: Client ID, Secret oder Refresh Token fehlen!");
            return null;
        }

        try {
            const r = await fetch("https://id.twitch.tv/oauth2/token", {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: `client_id=${clientId}&client_secret=${clientSecret}&grant_type=refresh_token&refresh_token=${broadcasterRefreshToken}`,
            });
            const d = await r.json();

            if (d.access_token) {
                broadcasterAccessToken = d.access_token;
                // Manchmal gibt Twitch auch einen neuen Refresh Token zurück, den übernehmen wir dann!
                if (d.refresh_token) broadcasterRefreshToken = d.refresh_token;

                // Speichern für den nächsten Server-Neustart
                fs.writeFileSync(TWITCH_TOKEN_FILE, JSON.stringify({
                    access_token: broadcasterAccessToken,
                    refresh_token: broadcasterRefreshToken
                }));
                
                console.log("[Twitch] ✅ Broadcaster Token erfolgreich vollautomatisch erneuert!");
                return broadcasterAccessToken;
            } else {
                console.error("[Twitch] ❌ Fehler beim Token-Refresh:", d);
                return null;
            }
        } catch (err) {
            console.error("[Twitch] ❌ Exception beim Token-Refresh:", err);
            return null;
        }
    }

    // Die neue Sub-Check Funktion, die sofort merkt, wenn der Token abgelaufen ist
    async function ensureSubStatus(userId) {
        const streamerId = process.env.STREAMER_TWITCH_ID;
        const clientId = process.env.TWITCH_CLIENT_ID;
        const cached = subCache.get(userId);
        
        if (cached && Date.now() - cached.ts < SUB_CACHE_TTL) return cached.result;
        if (!streamerId || !clientId || !broadcasterAccessToken) return cached?.result ?? false;

        try {
            let twitchRes = await fetch(
                `https://api.twitch.tv/helix/subscriptions?broadcaster_id=${streamerId}&user_id=${userId}`,
                { headers: { "Client-Id": clientId, "Authorization": `Bearer ${broadcasterAccessToken}` } }
            );

            // 401 bedeutet: Token ist abgelaufen! Wir erneuern ihn JETZT sofort und versuchen es noch mal.
            if (twitchRes.status === 401) {
                console.log("[Twitch] Token abgelaufen (401). Starte Auto-Refresh...");
                const newToken = await refreshBroadcasterToken();
                
                if (newToken) {
                    twitchRes = await fetch(
                        `https://api.twitch.tv/helix/subscriptions?broadcaster_id=${streamerId}&user_id=${userId}`,
                        { headers: { "Client-Id": clientId, "Authorization": `Bearer ${newToken}` } }
                    );
                } else {
                    return cached?.result ?? false;
                }
            }

            const data = await twitchRes.json();
            const isSub = Array.isArray(data?.data) && data.data.length > 0;
            
            // Speichere das korrekte Ergebnis im Cache
            subCache.set(userId, { result: isSub, ts: Date.now() });
            return isSub;
            
        } catch (err) {
            console.error("[Twitch API Error]", err);
            return cached?.result ?? false;
        }
    }

    router.get("/is-subscriber", requireAuth, async (req, res) => {
        const userId = String(req.twitchId);
        const login = String(req.twitchLogin || "").toLowerCase();
        const isBeta = BETA_TESTERS.has(login) || BETA_TESTERS.has(userId);
        const isSub = await ensureSubStatus(userId);
        res.json({ isSubscriber: isSub, isBeta });
    });

    // GET /api/garden/leaderboard — öffentliches Bestenliste (nach Gold sortiert)
    router.get("/leaderboard", (req, res) => {
        const sorted = Array.from(farmStates.values())
            .filter((s) => (s.gold || 0) > 0)
            .sort((a, b) => (b.gold || 0) - (a.gold || 0))
            .slice(0, 10)
            .map((s) => ({ name: s.twitchLogin || "Unbekannt", gold: s.gold || 0 }));
        res.json(sorted);
    });

    // GET /api/garden/farm-state
    router.get("/farm-state", requireAuth, (req, res) => {
        const userId = String(req.twitchId);
        const saved = farmStates.get(userId) || null;
        if (!saved) return res.json({ state: null });
        // Advance plant timers before sending
        const advanced = {
            ...saved,
            plotPlants: advancePlantTime(saved.plotPlants || {}),
        };
        res.json({ state: advanced });
    });

    // PUT /api/garden/farm-state
    router.put("/farm-state", requireAuth, (req, res) => {
        const userId = String(req.twitchId);
        const { state } = req.body || {};
        if (!state || typeof state !== "object") {
            return res.status(400).json({ error: "Ungueltiger Farm-State." });
        }

        // -- FIX: Serverseitige Shop-Bestände vor dem Client-Overwrite schützen --
        const existing = farmStates.get(userId) || {};
        state.shopStock = state.shopStock || existing.shopStock;
        state.shopStockVersion = state.shopStockVersion || existing.shopStockVersion;
        state.toolShopStock = state.toolShopStock || existing.toolShopStock;
        state.toolShopStockVersion = state.toolShopStockVersion || existing.toolShopStockVersion;
        state.eggShopStock = state.eggShopStock || existing.eggShopStock;
        state.eggShopStockVersion = state.eggShopStockVersion || existing.eggShopStockVersion;
        // --------------------------------------------------------------------------

        const compact = compactFarmState(state);
        if (req.twitchLogin) compact.twitchLogin = String(req.twitchLogin).toLowerCase();
        setFarmState(farmStates, userId, compact);
        scheduleFarmsSave(farmStates);
        res.json({ success: true, updatedAt: compact.updatedAt });
    });

    return router;
};
