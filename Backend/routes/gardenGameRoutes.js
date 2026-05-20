// routes/gardenGameRoutes.js
// Garden backend: authoritative sync, file-persisted farm states, delta events

const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const { farmStates, setFarmState, scheduleFarmsSave } = require("../gardenFarmsStore");
// farmStates: siehe initGardenFarmsStore() in index.js vor server.listen

// ─── In-Memory Stores ─────────────────────────────────────────────────────────
const lobbies = new Map();        // lobbyId → LobbyState
const playerSessions = new Map(); // socketId → { userId, lobbyId }
let globalIo = null;

// 20-Hz-Spielerpositions-Broadcasts pro Lobby (kein ein globaler Loop über alle Lobbies)
const lobbyPositionIntervals = new Map();

function stopLobbyPositionBroadcast(lobbyId) {
    const t = lobbyPositionIntervals.get(lobbyId);
    if (t) {
        clearInterval(t);
        lobbyPositionIntervals.delete(lobbyId);
    }
}

function startLobbyPositionBroadcast(io, lobbyId) {
    if (!io || lobbyPositionIntervals.has(lobbyId)) return;
    const iv = setInterval(() => {
        const lobby = lobbies.get(lobbyId);
        if (!lobby?.players) {
            stopLobbyPositionBroadcast(lobbyId);
            return;
        }
        const batch = [];
        for (const [pid, p] of Object.entries(lobby.players)) {
            if (p?._posDirty) {
                p._posDirty = false;
                batch.push({ userId: pid, x: p.x, y: p.y, facingRight: p.facingRight });
            }
        }
        if (batch.length > 0) {
            io.to(`garden:${lobbyId}`).emit("players_batch_moved", batch);
        }
    }, 50);
    lobbyPositionIntervals.set(lobbyId, iv);
}

function removeLobbyCompletely(lobbyId) {
    stopLobbyPositionBroadcast(lobbyId);
    lobbies.delete(lobbyId);
}

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

// Init per-player stock from global rotation (players can't steal from each other)
function initPlayerShopStock(player, shopRotation) {
    player.shopStock = {};
    for (const seed of (shopRotation?.seeds || [])) {
        player.shopStock[seed.seedId] = seed.active ? (seed.stockPerPlayer || 5) : 0;
    }
    player.shopStockVersion = shopRotation?.generatedAt || Date.now();
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
    const rarityChance = { COMMON: 1, UNCOMMON: 0.95, RARE: 0.06, EPIC: 0.02, LEGENDARY: 0.006 };
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

function initPlayerToolShopStock(player, toolShopRotation) {
    player.toolShopStock = {};
    for (const item of (toolShopRotation?.items || [])) {
        if (item.type === "single" || item.id === "pickaxe") {
            player.toolShopStock[item.id] = item.stock || 0;
        }
    }
    player.toolShopStockVersion = toolShopRotation?.generatedAt || Date.now();
}

function initPlayerEggShopStock(player, eggShopRotation) {
    player.eggShopStock = {};
    for (const item of (eggShopRotation?.items || [])) {
        player.eggShopStock[item.id] = item.stock || 0;
    }
    player.eggShopStockVersion = eggShopRotation?.generatedAt || Date.now();
}
function getBackpackUpgradePrice(level = 0) {
    return Math.max(1, Math.floor(22000 * Math.pow(1.85, Math.max(0, level))));
}
function getPickaxePrice(boughtCount = 0) {
    return Math.floor(100000 * Math.pow(2, Math.max(0, boughtCount)));
}
function isCellUnlockedForPlot(plot, cellX, cellY) {
    if (!Number.isInteger(cellX) || !Number.isInteger(cellY)) return false;
    if (cellX < 0 || cellX >= BASE_DIRT_COLS) return false;
    if (cellY >= 0 && cellY < BASE_DIRT_ROWS) return true;
    const unlocked = normalizePlotUnlockedCells(plot?.unlockedCells).filter((k) => {
        const y = Number(k.split("_")[1]);
        return plot?.isTopRow ? y < 0 : y >= BASE_DIRT_ROWS;
    });
    return unlocked.includes(`${cellX}_${cellY}`);
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

// ─── Lobby helpers ────────────────────────────────────────────────────────────
function createLobby({ hostId, hostName, isPrivate, maxPlayers }) {
    const lobbyId = uuidv4();
    const TOTAL_PLOTS = Math.min(maxPlayers, 8);
    const plots = Array.from({ length: TOTAL_PLOTS }, (_, i) => ({
        slotIndex: i,
        isTopRow: i < Math.ceil(TOTAL_PLOTS / 2),
        ownerId: i === 0 ? hostId : null,
        ownerName: i === 0 ? hostName : null,
        plants: {},
        expansions: 0,
        unlockedCells: [],
    }));
    const savedHost = farmStates.get(hostId);
    const lobby = {
        id: lobbyId, hostId, hostName, isPrivate,
        maxPlayers: Math.min(maxPlayers, TOTAL_PLOTS),
        players: {
            [hostId]: {
                id: hostId, name: hostName,
                x: 2240, y: 1440,
                gold: savedHost?.gold ?? 500,
                inventory: savedHost?.inventory ?? [],
                harvestedItems: savedHost?.harvestedItems ?? [],
                eggInventory: savedHost?.eggInventory ?? [],
                petInventory: savedHost?.petInventory ?? [],
                petPlacements: savedHost?.petPlacements ?? [],
                decoInventory: savedHost?.decoInventory ?? [],
                decoPlacements: savedHost?.decoPlacements ?? [],
                toolInventory: normalizeToolInventory(savedHost?.toolInventory),
                inventoryMaxSlots: savedHost?.inventoryMaxSlots ?? 50,
                tutorialCompleted: savedHost?.tutorialCompleted ?? false,
                mailbox: savedHost?.mailbox ?? [],
                incubator: savedHost?.incubator ?? { unlockedSlots: 1, slots: [null, null, null, null, null] },
                appearance: savedHost?.appearance || { head: "", body: "" },
                shopStock: {},
                toolShopStock: {},
                eggShopStock: {},
                tools: [],
                slotIndex: 0,
            },
        },
        plots,
        shopRotation: globalShopState.rotation,
        shopNextRotation: globalShopState.nextRotationAt,
        toolShopRotation: globalToolShopState.rotation,
        toolShopNextRotation: globalToolShopState.nextRotationAt,
        eggShopRotation: globalEggShopState.rotation,
        eggShopNextRotation: globalEggShopState.nextRotationAt,
        createdAt: Date.now(), startedAt: null,
        status: "waiting",
    };
    // Restore saved plants for host's plot
    if (savedHost?.plotPlants) {
        lobby.plots[0].plants = advancePlantTime(savedHost.plotPlants);
    }
    lobby.plots[0].unlockedCells = resolvePlotUnlockedCells(savedHost, lobby.plots[0].isTopRow);
    lobby.plots[0].expansions = Math.min(MAX_PLOT_EXPANSIONS, Math.ceil(lobby.plots[0].unlockedCells.length / BASE_DIRT_COLS));
    // Wie join_garden_lobby: gespeicherten SP-Bestand pro Rotation übernehmen, nicht frisch auffüllen
    const host = lobby.players[hostId];
    const rotGen = lobby.shopRotation?.generatedAt;
    const toolGen = lobby.toolShopRotation?.generatedAt;
    const eggGen = lobby.eggShopRotation?.generatedAt;
    const canSeed = isPlainObject(savedHost?.shopStock) && Object.keys(savedHost.shopStock).length > 0
        && Number(savedHost.shopStockVersion) === Number(rotGen);
    const canTool = isPlainObject(savedHost?.toolShopStock) && Object.keys(savedHost.toolShopStock).length > 0
        && Number(savedHost.toolShopStockVersion) === Number(toolGen);
    const canEgg = isPlainObject(savedHost?.eggShopStock) && Object.keys(savedHost.eggShopStock).length > 0
        && Number(savedHost.eggShopStockVersion) === Number(eggGen);
    if (canSeed) {
        host.shopStock = { ...savedHost.shopStock };
        host.shopStockVersion = Number(savedHost.shopStockVersion);
    } else {
        initPlayerShopStock(host, lobby.shopRotation);
    }
    if (canTool) {
        host.toolShopStock = { ...savedHost.toolShopStock };
        host.toolShopStockVersion = Number(savedHost.toolShopStockVersion);
    } else {
        initPlayerToolShopStock(host, lobby.toolShopRotation);
    }
    if (canEgg) {
        host.eggShopStock = { ...savedHost.eggShopStock };
        host.eggShopStockVersion = Number(savedHost.eggShopStockVersion);
    } else {
        initPlayerEggShopStock(host, lobby.eggShopRotation);
    }
    lobbies.set(lobbyId, lobby);
    return lobby;
}

function getLobbyList() {
    return [...lobbies.values()]
        // Zeige Lobbys, die nicht privat sind, noch nicht beendet sind UND noch Platz haben
        .filter(l => 
            !l.isPrivate && 
            (l.status === "waiting" || l.status === "active") && 
            Object.keys(l.players).length < l.maxPlayers
        )
        .map(l => ({
            id: l.id, 
            hostName: l.hostName,
            playerCount: Object.keys(l.players).length,
            maxPlayers: l.maxPlayers, 
            createdAt: l.createdAt,
        }));
}

function assignPlotToPlayer(lobby, userId, userName) {
    const freeSlot = lobby.plots.find(p => p.ownerId === null);
    if (!freeSlot) return null;
    freeSlot.ownerId = userId;
    freeSlot.ownerName = userName;
    return freeSlot;
}

function removePlayerFromLobby(lobby, userId) {
    // Snapshot player state before removing
    const player = lobby.players[userId];
    const plot = lobby.plots.find(p => p.ownerId === userId);
    if (player) {
        setFarmState(farmStates, userId, compactFarmState({
            gold: player.gold,
            inventory: player.inventory || [],
            plotPlants: plot?.plants || {},
            plotExpansions: plot?.expansions || 0,
            plotUnlockedCells: plot?.unlockedCells || [],
            harvestedItems: player.harvestedItems || [],
            eggInventory: player.eggInventory || [],
            petInventory: player.petInventory || [],
            petPlacements: player.petPlacements || [],
            decoInventory: player.decoInventory || [],
            decoPlacements: player.decoPlacements || [],
            toolInventory: player.toolInventory || {},
            inventoryMaxSlots: player.inventoryMaxSlots || 50,
            tutorialCompleted: player.tutorialCompleted || false,
            mailbox: player.mailbox || [],
            incubator: player.incubator || { unlockedSlots: 1, slots: [null] },
            mailbox: player.mailbox || [],
            appearance: player.appearance || { head: "", body: "" },
            shopStock: player.shopStock,
            shopStockVersion: player.shopStockVersion,
            toolShopStock: player.toolShopStock,
            toolShopStockVersion: player.toolShopStockVersion,
            eggShopStock: player.eggShopStock,
            eggShopStockVersion: player.eggShopStockVersion,
        }));
        scheduleFarmsSave(farmStates);
    }
    delete lobby.players[userId];
    if (plot) { plot.ownerId = null; plot.ownerName = null; }
    if (lobby.hostId === userId) {
        const remaining = Object.keys(lobby.players);
        if (remaining.length > 0) {
            // ZUFÄLLIGEN neuen Host bestimmen
            const newHostId = remaining[Math.floor(Math.random() * remaining.length)];
            lobby.hostId = newHostId;
            lobby.hostName = lobby.players[newHostId].name;
            
            // Die anderen Spieler informieren!
            if (globalIo) {
                globalIo.to(`garden:${lobby.id}`).emit("host_changed", { hostId: newHostId });
            }
        } else {
            removeLobbyCompletely(lobby.id);
            return false;
        }
    }
    return true;
}

function cleanupLobbiesAndHosts() {
    const sessions = [...playerSessions.values()];
    const isConnectedInLobby = (userId, lobbyId) => sessions.some((s) => s?.userId === userId && s?.lobbyId === lobbyId);

    for (const [lobbyId, lobby] of lobbies.entries()) {
        if (!lobby || !lobby.players || typeof lobby.players !== "object") {
            removeLobbyCompletely(lobbyId);
            continue;
        }

        const playerIds = Object.keys(lobby.players);
        if (playerIds.length === 0) {
            removeLobbyCompletely(lobbyId);
            continue;
        }

        // Remove stale player entries that no longer have a live socket session in this lobby.
        for (const pid of playerIds) {
            if (!isConnectedInLobby(pid, lobbyId)) {
                removePlayerFromLobby(lobby, pid);
                if (!lobbies.has(lobbyId)) break;
            }
        }

        if (!lobbies.has(lobbyId)) continue;
        const remaining = Object.keys(lobby.players || {});
        if (remaining.length === 0) {
            removeLobbyCompletely(lobbyId);
            continue;
        }

        if (!lobby.players[lobby.hostId]) {
            lobby.hostId = remaining[0];
            lobby.hostName = lobby.players[remaining[0]]?.name || lobby.hostName;
        }
    }
}

// Leere / zombie Lobbies auch ohne neuen create-lobby Aufruf entfernen
setInterval(() => {
    cleanupLobbiesAndHosts();
}, 5 * 60 * 1000);

// ─── Snapshot all active players every 60s ────────────────────────────────────
setInterval(() => {
    let dirty = false;
    for (const lobby of lobbies.values()) {
        if (lobby.status !== "active") continue;
        for (const player of Object.values(lobby.players)) {
            const plot = lobby.plots.find(p => p.ownerId === player.id);
            setFarmState(farmStates, player.id, compactFarmState({
                gold: player.gold,
                inventory: player.inventory || [],
                plotPlants: plot?.plants || {},
                plotExpansions: plot?.expansions || 0,
                plotUnlockedCells: plot?.unlockedCells || [],
                harvestedItems: player.harvestedItems || [],
                eggInventory: player.eggInventory || [],
                petInventory: player.petInventory || [],
                petPlacements: player.petPlacements || [],
                decoInventory: player.decoInventory || [],
                decoPlacements: player.decoPlacements || [],
                toolInventory: player.toolInventory || {},
                inventoryMaxSlots: player.inventoryMaxSlots || 50,
                tutorialCompleted: player.tutorialCompleted || false,
                incubator: player.incubator || { unlockedSlots: 1, slots: [null] },
                appearance: player.appearance || { head: "", body: "" },
                shopStock: player.shopStock,
                shopStockVersion: player.shopStockVersion,
                toolShopStock: player.toolShopStock,
                toolShopStockVersion: player.toolShopStockVersion,
                eggShopStock: player.eggShopStock,
                eggShopStockVersion: player.eggShopStockVersion,
            }));
            dirty = true;
        }
    }
    if (dirty) scheduleFarmsSave(farmStates);
}, 60 * 1000);

// ─── HTTP Routes ──────────────────────────────────────────────────────────────
module.exports = function ({ requireAuth, io }) {
    globalIo = io;

    const emitToLobby = (lobbyId, event, payload) => io.to(`garden:${lobbyId}`).emit(event, payload);

    // Global shop rotation tick – one rotation for ALL lobbies + singleplayer
    setInterval(() => {
        const now = Date.now();
        if (now >= globalShopState.nextRotationAt) {
            globalShopState.rotation = generateGlobalShopRotation(8);
            globalShopState.nextRotationAt = globalShopState.rotation.nextRotation;
            // Update every active lobby and reset per-player stocks
            for (const lobby of lobbies.values()) {
                if (lobby.status !== "active") continue;
                lobby.shopRotation = globalShopState.rotation;
                lobby.shopNextRotation = globalShopState.nextRotationAt;
                // Reset each player's personal stock for the new rotation
                for (const [pid, p] of Object.entries(lobby.players)) {
                    initPlayerShopStock(p, globalShopState.rotation);
                    io.to(`garden:${lobby.id}`).emit("shop_rotated", {
                        shopRotation: globalShopState.rotation,
                        nextRotation: globalShopState.nextRotationAt,
                        personalShopStock: p.shopStock,
                        forUserId: pid,
                    });
                }
            }
        }

        if (now >= globalToolShopState.nextRotationAt) {
            globalToolShopState.rotation = generateGlobalToolShopRotation(now);
            globalToolShopState.nextRotationAt = globalToolShopState.rotation.nextRotation;
            for (const lobby of lobbies.values()) {
                if (lobby.status !== "active") continue;
                lobby.toolShopRotation = globalToolShopState.rotation;
                lobby.toolShopNextRotation = globalToolShopState.nextRotationAt;
                for (const [pid, p] of Object.entries(lobby.players)) {
                    initPlayerToolShopStock(p, globalToolShopState.rotation);
                    io.to(`garden:${lobby.id}`).emit("tool_shop_rotated", {
                        toolShopRotation: globalToolShopState.rotation,
                        nextRotation: globalToolShopState.nextRotationAt,
                        personalToolStock: p.toolShopStock,
                        forUserId: pid,
                    });
                }
            }
        }

        if (now >= globalEggShopState.nextRotationAt) {
            globalEggShopState.rotation = generateGlobalEggShopRotation(now);
            globalEggShopState.nextRotationAt = globalEggShopState.rotation.nextRotation;
            for (const lobby of lobbies.values()) {
                if (lobby.status !== "active") continue;
                lobby.eggShopRotation = globalEggShopState.rotation;
                lobby.eggShopNextRotation = globalEggShopState.nextRotationAt;
                for (const [pid, p] of Object.entries(lobby.players)) {
                    initPlayerEggShopStock(p, globalEggShopState.rotation);
                    io.to(`garden:${lobby.id}`).emit("egg_shop_rotated", {
                        eggShopRotation: globalEggShopState.rotation,
                        nextRotation: globalEggShopState.nextRotationAt,
                        personalEggStock: p.eggShopStock,
                        forUserId: pid,
                    });
                }
            }
        }
    }, 1000); // check every second for wall-clock aligned resets

    // 20 Hz pro Lobby — siehe startLobbyPositionBroadcast bei create-lobby

    // POST /api/garden/lobby/:id/send-gift
    router.post("/lobby/:id/send-gift", requireAuth, (req, res) => {
        const senderId = String(req.twitchId);
        const { targetUserId, message, goldAmount, giftItems } = req.body;
        const lobby = lobbies.get(req.params.id);
        if (!lobby) return res.status(404).json({ error: "Lobby nicht gefunden." });
        const sender = lobby.players[senderId];
        const target = lobby.players[targetUserId];
        if (!sender || !target) return res.status(404).json({ error: "Spieler nicht in der Lobby." });
        if (senderId === targetUserId) return res.status(400).json({ error: "Du kannst dir nicht selbst etwas schenken." });

        const safeGold = Number.isFinite(Number(goldAmount)) ? Math.floor(Number(goldAmount)) : 0;
        if (safeGold < 0) return res.status(400).json({ error: "Ungültiger Betrag." });
        if (safeGold > 0 && sender.gold < safeGold) return res.status(400).json({ error: "Nicht genug Gold." });
        
        let itemsToSend = [];
        if (Array.isArray(giftItems)) {
            for (const gift of giftItems) {
                const { type, item } = gift;
                let inventoryArray;
                
                if (type === 'seed') inventoryArray = sender.inventory;
                else if (type === 'pet') inventoryArray = sender.petInventory;
                else if (type === 'deco') inventoryArray = sender.decoInventory;
                else if (type === 'plant') inventoryArray = sender.harvestedItems;

                if (inventoryArray) {
                    const idx = inventoryArray.findIndex(i => (i.instanceId || i.id) === (item.instanceId || item.id));
                    if (idx !== -1) {
                        itemsToSend.push({ type, ...inventoryArray.splice(idx, 1)[0] });
                    }
                }
            }
        }
        
        if (safeGold > 0) {
            sender.gold -= safeGold;
        }

        const gift = {
            id: uuidv4(),
            senderId,
            senderName: sender.name,
            message: message || "",
            goldAmount: safeGold,
            items: itemsToSend,
            timestamp: Date.now()
        };

        target.mailbox = [...(target.mailbox || []), gift];
        
        emitToLobby(lobby.id, "player_delta", { 
            userId: senderId, 
            gold: sender.gold,
            inventory: sender.inventory,
            petInventory: sender.petInventory,
            decoInventory: sender.decoInventory,
            harvestedItems: sender.harvestedItems
        });
        emitToLobby(lobby.id, "player_delta", { userId: targetUserId, mailbox: target.mailbox });

        res.json({ 
            success: true, 
            newGold: sender.gold,
            inventory: sender.inventory,
            petInventory: sender.petInventory,
            decoInventory: sender.decoInventory,
            harvestedItems: sender.harvestedItems
        });
    });

    // POST /api/garden/lobby/:id/collect-gift
    router.post("/lobby/:id/collect-gift", requireAuth, (req, res) => {
        const userId = String(req.twitchId);
        const { giftId } = req.body;
        const lobby = lobbies.get(req.params.id);
        if (!lobby) return res.status(404).json({ error: "Lobby nicht gefunden." });
        const player = lobby.players[userId];
        if (!player) return res.status(403).json({ error: "Nicht in dieser Lobby." });

        const giftIndex = (player.mailbox || []).findIndex(g => g.id === giftId);
        if (giftIndex === -1) return res.status(404).json({ error: "Geschenk nicht gefunden." });

        const gift = player.mailbox[giftIndex];
        
        if (gift.goldAmount) {
            player.gold += gift.goldAmount;
        }
        
        if (Array.isArray(gift.items)) {
            gift.items.forEach(itemDataObj => {
                const { type, ...itemData } = itemDataObj;
                if (type === 'seed') player.inventory = [...(player.inventory || []), itemData];
                else if (type === 'pet') player.petInventory = [...(player.petInventory || []), itemData];
                else if (type === 'deco') player.decoInventory = [...(player.decoInventory || []), itemData];
                else if (type === 'plant') player.harvestedItems = [...(player.harvestedItems || []), itemData];
            });
        } else if (gift.item) {
            // Legacy support for older gifts
            const { type, ...itemData } = gift.item;
            if (type === 'seed') {
                player.inventory = [...(player.inventory || []), itemData];
            } else if (type === 'pet') {
                player.petInventory = [...(player.petInventory || []), itemData];
            } else if (type === 'deco') {
                player.decoInventory = [...(player.decoInventory || []), itemData];
            }
        }

        player.mailbox.splice(giftIndex, 1);
        
        emitToLobby(lobby.id, "player_delta", { 
            userId, 
            gold: player.gold, 
            mailbox: player.mailbox,
            inventory: player.inventory,
            petInventory: player.petInventory,
            decoInventory: player.decoInventory,
            harvestedItems: player.harvestedItems
        });

        res.json({ 
            success: true, 
            newGold: player.gold, 
            mailbox: player.mailbox,
            inventory: player.inventory,
            petInventory: player.petInventory,
            decoInventory: player.decoInventory,
            harvestedItems: player.harvestedItems
        });
    });

    // POST /api/garden/lobby/:id/kick
    router.post("/lobby/:id/kick", requireAuth, (req, res) => {
        const hostId = String(req.twitchId);
        const { targetUserId } = req.body;
        const lobby = lobbies.get(req.params.id);
        if (!lobby) return res.status(404).json({ error: "Lobby nicht gefunden." });
        if (lobby.hostId !== hostId) return res.status(403).json({ error: "Nur der Host kann Spieler kicken." });
        if (hostId === targetUserId) return res.status(400).json({ error: "Du kannst dich nicht selbst kicken." });
        if (!lobby.players[targetUserId]) return res.status(404).json({ error: "Spieler nicht in der Lobby." });

        removePlayerFromLobby(lobby, targetUserId);
        io.to(`garden:${lobby.id}`).emit("player_left", { userId: targetUserId, plots: lobby.plots, kicked: true });
        
        // Finde den Socket des gekickten Spielers und sende ihm eine Nachricht
        const targetSession = [...playerSessions.entries()].find(([sid, s]) => s.userId === targetUserId && s.lobbyId === lobby.id);
        if (targetSession) {
            io.to(targetSession[0]).emit("garden_error", { message: "Du wurdest vom Host aus der Lobby gekickt." });
            io.sockets.sockets.get(targetSession[0])?.leave(`garden:${lobby.id}`);
            playerSessions.delete(targetSession[0]);
        }

        res.json({ success: true });
    });

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

    // Wer bin ich? — gleiche Konto-ID wie requireGardenAuth (Socket join_garden_lobby muss identisch sein)
    router.get("/whoami", requireAuth, (req, res) => {
        res.json({ userId: req.twitchId, login: req.twitchLogin || "Gast" });
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

    // POST /api/garden/farm-state-beacon  (sendBeacon on tab close, Content-Type: application/json)
    router.post("/farm-state-beacon", requireAuth, (req, res) => {
        const userId = String(req.twitchId);
        const { state } = req.body || {};
        
        if (state && typeof state === "object") {
            // -- FIX: Serverseitige Shop-Bestände vor dem Client-Overwrite schützen --
            let livePlayer = null;
            for (const session of playerSessions.values()) {
                if (session.userId === userId) {
                    const lobby = lobbies.get(session.lobbyId);
                    if (lobby && lobby.players[userId]) { livePlayer = lobby.players[userId]; break; }
                }
            }
            const existing = livePlayer || farmStates.get(userId) || {};
            state.shopStock = state.shopStock || existing.shopStock;
            state.shopStockVersion = state.shopStockVersion || existing.shopStockVersion;
            state.toolShopStock = state.toolShopStock || existing.toolShopStock;
            state.toolShopStockVersion = state.toolShopStockVersion || existing.toolShopStockVersion;
            state.eggShopStock = state.eggShopStock || existing.eggShopStock;
            state.eggShopStockVersion = state.eggShopStockVersion || existing.eggShopStockVersion;
            // --------------------------------------------------------------------------

            setFarmState(farmStates, userId, compactFarmState(state));
            scheduleFarmsSave(farmStates);
        }
        res.status(204).end();
    });

    // PUT /api/garden/farm-state
    router.put("/farm-state", requireAuth, (req, res) => {
        const userId = String(req.twitchId);
        const { state } = req.body || {};
        if (!state || typeof state !== "object") {
            return res.status(400).json({ error: "Ungueltiger Farm-State." });
        }
        
        // -- FIX: Serverseitige Shop-Bestände vor dem Client-Overwrite schützen --
        let livePlayer = null;
        for (const session of playerSessions.values()) {
            if (session.userId === userId) {
                const lobby = lobbies.get(session.lobbyId);
                if (lobby && lobby.players[userId]) { livePlayer = lobby.players[userId]; break; }
            }
        }
        const existing = livePlayer || farmStates.get(userId) || {};
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

    // POST /api/garden/create-lobby
    router.post("/create-lobby", requireAuth, (req, res) => {
        const hostId = String(req.twitchId);
        const hostName = req.twitchLogin;
        const { isPrivate = false, maxPlayers = 8 } = req.body;
        cleanupLobbiesAndHosts();
        for (const [, l] of lobbies) {
            if (l.hostId === hostId && l.status !== "ended") {
                return res.status(409).json({ error: "Du hast bereits eine aktive Lobby." });
            }
        }
        const lobby = createLobby({ hostId, hostName, isPrivate: Boolean(isPrivate), maxPlayers: parseInt(maxPlayers) });
        startLobbyPositionBroadcast(io, lobby.id);
        res.json({ success: true, lobbyId: lobby.id, isPrivate: lobby.isPrivate });
    });

    // GET /api/garden/lobbies
    router.get("/lobbies", requireAuth, (req, res) => {
        res.json({ lobbies: getLobbyList() });
    });

    // GET /api/garden/lobby/:id
    router.get("/lobby/:id", requireAuth, (req, res) => {
        const lobby = lobbies.get(req.params.id);
        if (!lobby) return res.status(404).json({ error: "Lobby nicht gefunden." });
        res.json({
            id: lobby.id, hostName: lobby.hostName, isPrivate: lobby.isPrivate,
            maxPlayers: lobby.maxPlayers, playerCount: Object.keys(lobby.players).length,
            status: lobby.status,
        });
    });

    // POST /api/garden/lobby/:id/buy-seed
    router.post("/lobby/:id/buy-seed", requireAuth, (req, res) => {
        const userId = String(req.twitchId);
        const { seedId, seedInstanceId } = req.body;
        const lobby = lobbies.get(req.params.id);
        if (!lobby) return res.status(404).json({ error: "Lobby nicht gefunden." });
        if (!lobby.shopRotation) return res.status(400).json({ error: "Shop noch nicht geladen." });
        const player = lobby.players[userId];
        if (!player) return res.status(403).json({ error: "Nicht in dieser Lobby." });
        // Prefer seedId lookup; instanceId is legacy fallback
        const seed = seedId
            ? lobby.shopRotation.seeds.find(s => s.seedId === seedId)
            : lobby.shopRotation.seeds.find(s => s.instanceId === seedInstanceId);
        if (!seed) return res.status(404).json({ error: "Samen nicht im Shop." });
        if (!seed.active) return res.status(409).json({ error: "Dieser Samen ist gerade nicht im Angebot." });
        if (!player.shopStock) initPlayerShopStock(player, lobby.shopRotation);
        const remaining = player.shopStock[seed.seedId] ?? 0;
        if (remaining <= 0) return res.status(409).json({ error: "Dein persönlicher Vorrat für diesen Samen ist aufgebraucht." });
        if (player.gold < seed.shopPrice) return res.status(400).json({ error: "Nicht genug Gold." });
        player.gold -= seed.shopPrice;
        player.shopStock[seed.seedId] = remaining - 1;
        player.inventory.push({ ...seed, instanceId: uuidv4() });
        emitToLobby(lobby.id, "player_delta", { userId, gold: player.gold });
        res.json({ success: true, newGold: player.gold, inventory: player.inventory, personalStock: player.shopStock[seed.seedId] });
    });

    // POST /api/garden/lobby/:id/buy-tool
    router.post("/lobby/:id/buy-tool", requireAuth, (req, res) => {
        const userId = String(req.twitchId);
        const { toolId } = req.body || {};
        const lobby = lobbies.get(req.params.id);
        if (!lobby) return res.status(404).json({ error: "Lobby nicht gefunden." });
        const player = lobby.players[userId];
        if (!player) return res.status(403).json({ error: "Nicht in dieser Lobby." });
        const tool = (lobby.toolShopRotation?.items || []).find((t) => t.id === toolId);
        if (!tool) return res.status(404).json({ error: "Tool nicht im Shop." });
        
        player.toolInventory = normalizeToolInventory(player.toolInventory);
        if (!player.toolShopStock) initPlayerToolShopStock(player, lobby.toolShopRotation);
        
        const backpackLevel = Number(player.toolInventory.backpackLevel || (player.toolInventory.backpackUpgraded ? 1 : 0)) || 0;
        
        // 7. ANPASSUNG
        const effectivePrice = tool.id === "backpack_upgrade" 
            ? getBackpackUpgradePrice(backpackLevel) 
            : tool.id === "pickaxe"
            ? getPickaxePrice(player.toolInventory.pickaxesBought || 0)
            : tool.price;

        if (player.gold < effectivePrice) return res.status(400).json({ error: "Nicht genug Gold." });
        
        if (tool.type === "single" || tool.id === "pickaxe") {
            const left = player.toolShopStock[tool.id] ?? 0;
            if (left <= 0) return res.status(409).json({ error: "Tool in deiner Rotation ausverkauft." });
            player.toolShopStock[tool.id] = left - 1;
        }
        if (tool.id === "shovel" && player.toolInventory.hasShovel) {
            return res.status(409).json({ error: "Schaufel bereits vorhanden." });
        }
        
        player.gold -= effectivePrice;
        
        if (tool.id === "pickaxe") {
            player.toolInventory.pickaxeUses = (player.toolInventory.pickaxeUses || 0) + (tool.uses || 0);
            player.toolInventory.pickaxesBought = (player.toolInventory.pickaxesBought || 0) + 1; // 7. ANPASSUNG
        } else if (tool.id === "shovel") {
            player.toolInventory.hasShovel = true;
        } else if (tool.id === "plant_pot") {
            player.toolInventory.plantPots = (player.toolInventory.plantPots || 0) + 1;
        } else if (tool.id === "backpack_upgrade") {
            player.toolInventory.backpackLevel = backpackLevel + 1;
            player.toolInventory.backpackUpgraded = true;
            player.inventoryMaxSlots = Math.max(50, 50 + player.toolInventory.backpackLevel * 10);
        } else if (tool.id === "watering_can") {
            player.toolInventory.wateringCans = (player.toolInventory.wateringCans || 0) + 1;
        }
        
        emitToLobby(lobby.id, "player_delta", {
            userId,
            gold: player.gold,
            toolInventory: player.toolInventory,
            inventoryMaxSlots: player.inventoryMaxSlots,
        });
        
        res.json({
            success: true,
            newGold: player.gold,
            toolInventory: player.toolInventory,
            inventoryMaxSlots: player.inventoryMaxSlots,
            personalToolStock: player.toolShopStock,
            paidPrice: effectivePrice,
            nextBackpackPrice: getBackpackUpgradePrice(player.toolInventory.backpackLevel || 0),
        });
    });

    // POST /api/garden/lobby/:id/buy-egg
    router.post("/lobby/:id/buy-egg", requireAuth, (req, res) => {
        const userId = String(req.twitchId);
        const { eggId } = req.body || {};
        const lobby = lobbies.get(req.params.id);
        if (!lobby) return res.status(404).json({ error: "Lobby nicht gefunden." });
        const player = lobby.players[userId];
        if (!player) return res.status(403).json({ error: "Nicht in dieser Lobby." });
        const egg = (lobby.eggShopRotation?.items || []).find((e) => e.id === eggId);
        if (!egg) return res.status(404).json({ error: "Ei nicht im Shop." });
        if (!player.eggShopStock) initPlayerEggShopStock(player, lobby.eggShopRotation);
        const left = player.eggShopStock[egg.id] ?? 0;
        if (left <= 0) return res.status(409).json({ error: "Dieses Ei ist in deiner Rotation ausverkauft." });
        if (player.gold < egg.price) return res.status(400).json({ error: "Nicht genug Gold." });
        player.gold -= egg.price;
        player.eggShopStock[egg.id] = left - 1;
        player.eggInventory = [...(player.eggInventory || []), { ...egg, instanceId: uuidv4() }];
        emitToLobby(lobby.id, "player_delta", { userId, gold: player.gold, eggInventory: player.eggInventory });
        res.json({
            success: true,
            newGold: player.gold,
            eggInventory: player.eggInventory,
            personalEggStock: player.eggShopStock,
        });
    });

    // POST /api/garden/lobby/:id/mine-rock
    router.post("/lobby/:id/mine-rock", requireAuth, (req, res) => {
        const userId = String(req.twitchId);
        const { cellX, cellY } = req.body || {};
        const lobby = lobbies.get(req.params.id);
        if (!lobby) return res.status(404).json({ error: "Lobby nicht gefunden." });
        const player = lobby.players[userId];
        if (!player) return res.status(403).json({ error: "Nicht in dieser Lobby." });
        const plot = lobby.plots[player.slotIndex];
        if (!plot) return res.status(404).json({ error: "Plot nicht gefunden." });
        if (!Number.isInteger(cellX) || !Number.isInteger(cellY)) {
            return res.status(400).json({ error: "Ungültiges Stein-Feld." });
        }
        const topMinY = -EXTRA_PLOT_ROWS;
        const topMaxY = -1;
        const bottomMinY = BASE_DIRT_ROWS;
        const bottomMaxY = BASE_DIRT_ROWS + EXTRA_PLOT_ROWS - 1;
        const validTop = plot.isTopRow && cellY >= topMinY && cellY <= topMaxY;
        const validBottom = !plot.isTopRow && cellY >= bottomMinY && cellY <= bottomMaxY;
        if (cellX < 0 || cellX >= BASE_DIRT_COLS || (!validTop && !validBottom)) {
            return res.status(400).json({ error: "Stein-Feld außerhalb des Bereichs." });
        }
        player.toolInventory = normalizeToolInventory(player.toolInventory);
        if ((player.toolInventory.pickaxeUses || 0) <= 0) return res.status(409).json({ error: "Keine Spitzhacke-Uses mehr." });
        plot.unlockedCells = normalizePlotUnlockedCells(plot.unlockedCells).filter((k) => {
            const y = Number(k.split("_")[1]);
            return plot.isTopRow ? y < 0 : y >= BASE_DIRT_ROWS;
        });
        const key = `${cellX}_${cellY}`;
        if (plot.unlockedCells.includes(key)) return res.status(409).json({ error: "Dieses Feld ist bereits freigelegt." });
        player.toolInventory.pickaxeUses -= 1;
        plot.unlockedCells.push(key);
        plot.expansions = Math.min(MAX_PLOT_EXPANSIONS, Math.ceil(plot.unlockedCells.length / BASE_DIRT_COLS));
        emitToLobby(lobby.id, "player_delta", { userId, toolInventory: player.toolInventory });
        emitToLobby(lobby.id, "plot_expanded", {
            slotIndex: player.slotIndex,
            expansions: plot.expansions,
            unlockedCells: plot.unlockedCells,
            minedCell: { cellX, cellY },
        });
        res.json({
            success: true,
            plotExpansions: plot.expansions,
            plotUnlockedCells: plot.unlockedCells,
            toolInventory: player.toolInventory,
        });
    });

    // POST /api/garden/lobby/:id/water-plant
    router.post("/lobby/:id/water-plant", requireAuth, (req, res) => {
        const userId = String(req.twitchId);
        const { cellX, cellY } = req.body || {};
        const lobby = lobbies.get(req.params.id);
        if (!lobby) return res.status(404).json({ error: "Lobby nicht gefunden." });
        const player = lobby.players[userId];
        if (!player) return res.status(403).json({ error: "Nicht in dieser Lobby." });
        const plot = lobby.plots[player.slotIndex];
        if (!plot) return res.status(404).json({ error: "Plot nicht gefunden." });
        const key = `${cellX}_${cellY}`;
        const plant = plot.plants[key];
        if (!plant) return res.status(404).json({ error: "Keine Pflanze auf diesem Feld." });
        player.toolInventory = normalizeToolInventory(player.toolInventory);
        if ((player.toolInventory.wateringCans || 0) <= 0) return res.status(409).json({ error: "Keine Gießkanne mehr verfügbar." });
        const now = Date.now();
        const boostMs = 5 * 60 * 1000;
        const p = { ...plant };
        if (p.singleUse) {
            p.growthMs = Math.max(5000, (p.growthMs || 0) - boostMs);
        } else if (p.stage === "structure") {
            p.structureReadyAt = Math.max(now, (p.structureReadyAt || now) - boostMs);
            p.structureGrowthMs = Math.max(5000, (p.structureReadyAt || now) - (p.plantedAt || now));
        } else {
            p.fruitSlots = (p.fruitSlots || []).map((slot) => ({ ...(slot || {}), readyAt: Math.max(now, (slot.readyAt || now) - boostMs) }));
        }
        plot.plants[key] = p;
        player.toolInventory.wateringCans = Math.max(0, (player.toolInventory.wateringCans || 0) - 1);
        emitToLobby(lobby.id, "plot_updated", { slotIndex: player.slotIndex, key, plant: p });
        emitToLobby(lobby.id, "player_delta", { userId, toolInventory: player.toolInventory });
        res.json({ success: true, key, updatedPlant: p, toolInventory: player.toolInventory });
    });

    // POST /api/garden/lobby/:id/move-plant
    router.post("/lobby/:id/move-plant", requireAuth, (req, res) => {
        const userId = String(req.twitchId);
        const { fromX, fromY, toX, toY } = req.body || {};
        const lobby = lobbies.get(req.params.id);
        if (!lobby) return res.status(404).json({ error: "Lobby nicht gefunden." });
        const player = lobby.players[userId];
        if (!player) return res.status(403).json({ error: "Nicht in dieser Lobby." });
        const plot = lobby.plots[player.slotIndex];
        if (!plot) return res.status(404).json({ error: "Plot nicht gefunden." });
        if (!isCellUnlockedForPlot(plot, fromX, fromY) || !isCellUnlockedForPlot(plot, toX, toY)) {
            return res.status(400).json({ error: "Ungültiges Feld." });
        }
        const fromKey = `${fromX}_${fromY}`;
        const toKey = `${toX}_${toY}`;
        if (!plot.plants[fromKey]) return res.status(404).json({ error: "Keine Pflanze auf Quellfeld." });
        if (plot.plants[toKey]) return res.status(409).json({ error: "Zielfeld ist belegt." });
        player.toolInventory = normalizeToolInventory(player.toolInventory);
        if ((player.toolInventory.plantPots || 0) <= 0) return res.status(409).json({ error: "Kein Plant Pot verfügbar." });
        const moved = { ...plot.plants[fromKey], cellX: toX, cellY: toY };
        delete plot.plants[fromKey];
        plot.plants[toKey] = moved;
        player.toolInventory.plantPots = Math.max(0, (player.toolInventory.plantPots || 0) - 1);
        emitToLobby(lobby.id, "plot_updated", { slotIndex: player.slotIndex, key: fromKey, plant: null });
        emitToLobby(lobby.id, "plot_updated", { slotIndex: player.slotIndex, key: toKey, plant: moved });
        emitToLobby(lobby.id, "player_delta", { userId, toolInventory: player.toolInventory });
        res.json({ success: true, fromKey, toKey, movedPlant: moved, toolInventory: player.toolInventory });
    });

    // POST /api/garden/lobby/:id/remove-plant
    router.post("/lobby/:id/remove-plant", requireAuth, (req, res) => {
        const userId = String(req.twitchId);
        const { cellX, cellY } = req.body || {};
        const lobby = lobbies.get(req.params.id);
        if (!lobby) return res.status(404).json({ error: "Lobby nicht gefunden." });
        const player = lobby.players[userId];
        if (!player) return res.status(403).json({ error: "Nicht in dieser Lobby." });
        const plot = lobby.plots[player.slotIndex];
        if (!plot) return res.status(404).json({ error: "Plot nicht gefunden." });
        if (!isCellUnlockedForPlot(plot, cellX, cellY)) return res.status(400).json({ error: "Ungültiges Feld." });
        player.toolInventory = normalizeToolInventory(player.toolInventory);
        if (!player.toolInventory.hasShovel) return res.status(409).json({ error: "Du brauchst eine Schaufel." });
        const key = `${cellX}_${cellY}`;
        if (!plot.plants[key]) return res.status(404).json({ error: "Keine Pflanze auf diesem Feld." });
        delete plot.plants[key];
        emitToLobby(lobby.id, "plot_updated", { slotIndex: player.slotIndex, key, plant: null });
        res.json({ success: true, key });
    });

    // POST /api/garden/lobby/:id/plant
    router.post("/lobby/:id/plant", requireAuth, (req, res) => {
        const userId = String(req.twitchId);
        const { cellX, cellY, seedInstanceId, plantData } = req.body;
        const lobby = lobbies.get(req.params.id);
        if (!lobby) return res.status(404).json({ error: "Lobby nicht gefunden." });
        const player = lobby.players[userId];
        if (!player) return res.status(403).json({ error: "Nicht in dieser Lobby." });
        const plot = lobby.plots[player.slotIndex];
        const key = `${cellX}_${cellY}`;
        if (plot.plants[key]) return res.status(409).json({ error: "Zelle bereits belegt." });
        const seedIdx = player.inventory.findIndex(i => i.instanceId === seedInstanceId);
        if (seedIdx === -1) return res.status(400).json({ error: "Samen nicht im Inventar." });
        const seed = player.inventory.splice(seedIdx, 1)[0];
        // Accept client-computed plant instance (with size/growth already rolled)
        // but override time fields with server time for authority
        const now = Date.now();
        let plant;
        if (plantData) {
            const visuals = getPlantVisuals(seed.seedId, plantData.singleUse !== false);
            const specialType = plantData.singleUse !== false ? rollSpecialType() : null;
            plant = { ...visuals, ...plantData, specialType, plantedAt: now, instanceId: uuidv4() };
            if (!plant.singleUse && plant.structureGrowthMs) {
                // Re-anchor all time references to server now
                plant.structureReadyAt = now + plant.structureGrowthMs;
                plant.stage = "structure";
                // Slots only spawn after structure phase is complete.
                plant.fruitSlots = null;
            }
        } else {
            const visuals = getPlantVisuals(seed.seedId, seed.singleUse !== false);
            plant = {
                instanceId: uuidv4(), seedId: seed.seedId, name: seed.name, emoji: seed.emoji,
                rarity: seed.rarity, singleUse: seed.singleUse, plantedAt: now,
                growthMs: 60000, cellX, cellY, harvested: 0, stage: "growing",
                image: visuals.growthImage,
                ...visuals,
            };
        }
        plot.plants[key] = plant;
        emitToLobby(lobby.id, "plot_updated", { slotIndex: player.slotIndex, key, plant });
        res.json({ success: true, plant });
    });

    // POST /api/garden/lobby/:id/harvest
    router.post("/lobby/:id/harvest", requireAuth, (req, res) => {
        const userId = String(req.twitchId);
        const { cellX, cellY } = req.body;
        const lobby = lobbies.get(req.params.id);
        if (!lobby) return res.status(404).json({ error: "Lobby nicht gefunden." });
        const player = lobby.players[userId];
        if (!player) return res.status(403).json({ error: "Nicht in dieser Lobby." });
        const plot = lobby.plots[player.slotIndex];
        const key = `${cellX}_${cellY}`;
        const rawPlant = plot.plants[key];
        if (!rawPlant) return res.status(400).json({ error: "Pflanze nicht gefunden" });
        // Advance perennial stage transitions (structure → fruiting) before checking readiness
        const plant = advancePlantTime({ [key]: rawPlant }, Date.now())[key] || rawPlant;
        plot.plants[key] = plant;
        const now = Date.now();
        const HARVEST_GRACE_MS = 10000;

        // 10 Sekunden Toleranz beim Server-Check hinzufügen!
        if (!isPlantReadyServer(plant, now + HARVEST_GRACE_MS)) {
            return res.status(400).json({ error: "Noch nicht erntereif" });
        } // 10s tolerance for clock drift
        let harvestedItem;

        if (plant.singleUse) {
            const readyAt = plant.plantedAt + (plant.growthMs || 1);
            if (now + HARVEST_GRACE_MS < readyAt) {
                return res.status(400).json({ error: "Pflanze noch nicht fertig.", readyAt });
            }
            const norm = plant.norm ?? Math.random();
            const profile = plant.profile;
            const sellValue = profile
                ? Math.max(1, Math.floor(profile.sellMin + norm * (profile.sellMax - profile.sellMin)))
                : Math.max(1, Math.floor(plant.growthMs * 0.05));
            harvestedItem = {
                id: `${plant.instanceId || key}_${now}`,
                seedId: plant.seedId,
                singleUse: plant.singleUse,
                name: plant.name, emoji: plant.emoji, rarity: plant.rarity,
                image: plant.harvestImage || plant.fruitImage || plant.growthImage,
                harvestImage: plant.harvestImage || plant.fruitImage || plant.growthImage,
                size: sizeFromNorm(norm), specialData: plant.specialType || null,
                statusEffect: plant.statusEffect || null,
                sellValue, harvestedAt: now,
            };
            delete plot.plants[key];
            emitToLobby(lobby.id, "plot_updated", { slotIndex: player.slotIndex, key, plant: null });
        } else {
            const p = advancePlantTime({ [key]: plant }, now)[key];
            const slots = Array.isArray(p.fruitSlots) ? p.fruitSlots : [];
            const readyIdx = slots.findIndex(s => s.readyAt <= now + HARVEST_GRACE_MS);
            if (readyIdx === -1) {
                const nextReady = slots.length ? Math.min(...slots.map(s => s.readyAt)) : null;
                return res.status(400).json({ error: "Keine Frucht bereit.", nextReady });
            }
            const cycleMs = p.fruitCycleMs || 60000;
            const harvestedSlot = p.fruitSlots[readyIdx] || {};
            const harvestedNorm = Number.isFinite(harvestedSlot.norm) ? harvestedSlot.norm : randomNorm();
            const harvestedSize = Number.isFinite(harvestedSlot.size) ? harvestedSlot.size : sizeFromNorm(harvestedNorm);
            p.fruitSlots[readyIdx] = createFruitSlot(now, cycleMs);
            p.harvested = (p.harvested || 0) + 1;
            const profile = p.profile;
            const sellValue = profile
                ? Math.max(1, Math.floor(profile.fruitSellMin + harvestedNorm * (profile.fruitSellMax - profile.fruitSellMin)))
                : Math.floor(cycleMs * 0.001);
            harvestedItem = {
                id: `${plant.instanceId || key}_${now}`,
                seedId: plant.seedId,
                singleUse: plant.singleUse,
                name: plant.name, emoji: plant.emoji, rarity: plant.rarity,
                image: plant.harvestImage || plant.fruitImage || plant.growthImage,
                harvestImage: plant.harvestImage || plant.fruitImage || plant.growthImage,
                size: harvestedSize,
                specialData: harvestedSlot.specialType || null,
                statusEffect: p.statusEffect || null,
                sellValue,
                harvestedAt: now,
            };
            p.statusEffect = null;
            p.statusEffectUntil = null;
            plot.plants[key] = p;
            emitToLobby(lobby.id, "plot_updated", { slotIndex: player.slotIndex, key, plant: p });
        }

        player.harvestedItems = [...(player.harvestedItems || []), harvestedItem];
        emitToLobby(lobby.id, "player_delta", { userId, harvestedItems: player.harvestedItems });
        res.json({
            success: true,
            harvestedItem,
            key,
            plantRemoved: plant.singleUse === true,
            updatedPlant: plant.singleUse ? null : plot.plants[key],
        });
    });

    // POST /api/garden/lobby/:id/sell-all
    router.post("/lobby/:id/sell-all", requireAuth, async (req, res) => {
        const userId = String(req.twitchId);
        const login = String(req.twitchLogin || "").toLowerCase();
        const lobby = lobbies.get(req.params.id);
        if (!lobby) return res.status(404).json({ error: "Lobby nicht gefunden." });
        const player = lobby.players[userId];
        if (!player) return res.status(403).json({ error: "Nicht in dieser Lobby." });
        const items = player.harvestedItems || [];
        if (items.length === 0) return res.json({ error: "Keine Items zum Verkaufen." });

        let total = items.reduce((s, it) => s + (it.sellValue || 0), 0);

        // EXPLOIT FIX: Items SOFORT leeren, bevor Node.js durch await pausiert!
        player.harvestedItems = []; 

        const streamerId = process.env.STREAMER_TWITCH_ID;
        const isBeta = BETA_TESTERS.has(login) || BETA_TESTERS.has(userId);
        const isSub = await ensureSubStatus(userId);
        const hasBonus = isBeta || isSub || (streamerId && userId === streamerId);
        if (hasBonus) total = Math.floor(total * 1.5);

        player.gold += total;
        emitToLobby(lobby.id, "player_delta", { userId, gold: player.gold, harvestedItems: [] });
        res.json({ success: true, goldEarned: total, newTotal: player.gold });
    });

    // POST /api/garden/lobby/:id/pet-earn — Authoritative pet gold/seed earnings in multiplayer
    router.post("/lobby/:id/pet-earn", requireAuth, (req, res) => {
        const userId = String(req.twitchId);
        const lobby = lobbies.get(req.params.id);
        if (!lobby) return res.status(404).json({ error: "Lobby nicht gefunden." });
        const player = lobby.players[userId];
        if (!player) return res.status(403).json({ error: "Nicht in dieser Lobby." });
        const { gold, seeds } = req.body || {};
        const MAX_PET_GOLD = 10_000_000;
        const MAX_PET_SEEDS = 5;
        if (typeof gold === "number" && gold > 0) {
            player.gold = Math.min(GOLD_MAX, player.gold + Math.min(MAX_PET_GOLD, Math.floor(gold)));
        }
        let inventoryChanged = false;
        if (Array.isArray(seeds) && seeds.length > 0) {
            const safeSeeds = seeds.slice(0, MAX_PET_SEEDS).map(s => ({
                ...s,
                instanceId: `pet_seed_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            }));
            player.inventory = [...(player.inventory || []), ...safeSeeds];
            inventoryChanged = true;
        }
        const delta = { userId, gold: player.gold };
        if (inventoryChanged) delta.inventory = player.inventory;
        emitToLobby(lobby.id, "player_delta", delta);
        res.json({ success: true, gold: player.gold });
    });

    // POST /api/garden/lobby/:id/update-farm — Sync für nicht-Ökonomie; Gold nicht per Client erhöhen
    router.post("/lobby/:id/update-farm", requireAuth, (req, res) => {
        const userId = String(req.twitchId);
        const lobby = lobbies.get(req.params.id);
        if (!lobby) return res.status(404).json({ error: "Lobby nicht gefunden." });
        const player = lobby.players[userId];
        if (!player) return res.status(403).json({ error: "Nicht in dieser Lobby." });
        const { harvestedItems, eggInventory, petInventory, petPlacements, decoInventory, decoPlacements, incubator, toolInventory, inventoryMaxSlots, plotExpansions, plotUnlockedCells, appearance, tutorialCompleted, mailbox } = req.body || {};
        // Gold vom Client ignorieren (Exploit-Schutz). Autoritativ: shop/harvest/gift/etc. + player_delta.
        const MAX_MAIL = 120;
        const MAX_HRV = 500;
        const MAX_PET = 200;
        const MAX_DECO = 200;
        const MAX_EGG = 200;
        const MAX_SELL_VALUE = 50_000_000;
        if (typeof tutorialCompleted === "boolean") player.tutorialCompleted = tutorialCompleted;
        if (Array.isArray(mailbox)) player.mailbox = mailbox.slice(0, MAX_MAIL);
        if (Array.isArray(harvestedItems)) {
            // Cap sellValue to prevent injection of crafted high-value items (Fix 3)
            const sanitized = harvestedItems.slice(0, MAX_HRV).map(it => ({
                ...it,
                sellValue: typeof it.sellValue === "number"
                    ? Math.min(MAX_SELL_VALUE, Math.max(0, Math.floor(it.sellValue)))
                    : 0,
            }));
            // Merge back server-only items (e.g. gifts received between syncs) (Fix 4)
            player.harvestedItems = mergeServerItems(sanitized, player.harvestedItems || [], MAX_HRV);
        }
        if (Array.isArray(eggInventory)) player.eggInventory = mergeServerItems(eggInventory.slice(0, MAX_EGG), player.eggInventory || [], MAX_EGG);
        if (Array.isArray(petInventory)) player.petInventory = mergeServerItems(petInventory.slice(0, MAX_PET), player.petInventory || [], MAX_PET);
        if (Array.isArray(petPlacements)) player.petPlacements = petPlacements;
        if (Array.isArray(decoInventory)) player.decoInventory = mergeServerItems(decoInventory.slice(0, MAX_DECO), player.decoInventory || [], MAX_DECO);
        if (Array.isArray(decoPlacements)) player.decoPlacements = decoPlacements;
        if (incubator && typeof incubator === "object") {
            const serverNow = Date.now();
            const validatedSlots = Array.isArray(incubator.slots)
                ? incubator.slots.map((slot, i) => {
                    const serverSlot = player.incubator?.slots?.[i];
                    // Reject premature egg collection: restore slot if hatchAt hasn't passed server-side
                    if (!slot && serverSlot && serverSlot.hatchAt > serverNow) return serverSlot;
                    return slot;
                })
                : incubator.slots;
            player.incubator = { ...incubator, slots: validatedSlots };
        }
        if (appearance && typeof appearance === "object") player.appearance = appearance;
        if (toolInventory && typeof toolInventory === "object") player.toolInventory = normalizeToolInventory(toolInventory);
        if (typeof inventoryMaxSlots === "number" && Number.isFinite(inventoryMaxSlots)) {
            player.inventoryMaxSlots = Math.min(800, Math.max(50, inventoryMaxSlots));
        }
        if (typeof plotExpansions === "number") {
            const plot = lobby.plots.find(p => p.ownerId === userId);
            if (plot) {
                const nextExpansions = Math.max(0, Math.min(MAX_PLOT_EXPANSIONS, plotExpansions));
                if (plot.expansions !== nextExpansions) {
                    plot.expansions = nextExpansions;
                    emitToLobby(lobby.id, "plot_expanded", { slotIndex: plot.slotIndex, expansions: nextExpansions });
                }
            }
        }
        if (Array.isArray(plotUnlockedCells)) {
            const plot = lobby.plots.find(p => p.ownerId === userId);
            if (plot) {
                const nextUnlocked = normalizePlotUnlockedCells(plotUnlockedCells).filter((k) => {
                    const y = Number(k.split("_")[1]);
                    return plot.isTopRow ? y < 0 : y >= BASE_DIRT_ROWS;
                });
                const changed = JSON.stringify(nextUnlocked) !== JSON.stringify(normalizePlotUnlockedCells(plot.unlockedCells));
                plot.unlockedCells = nextUnlocked;
                plot.expansions = Math.min(MAX_PLOT_EXPANSIONS, Math.ceil(plot.unlockedCells.length / BASE_DIRT_COLS));
                if (changed) {
                    emitToLobby(lobby.id, "plot_expanded", {
                        slotIndex: plot.slotIndex,
                        expansions: plot.expansions,
                        unlockedCells: plot.unlockedCells,
                    });
                }
            }
        }
        emitToLobby(lobby.id, "player_delta", {
            userId,
            gold: player.gold,
            harvestedItems: player.harvestedItems,
            eggInventory: player.eggInventory,
            petInventory: player.petInventory,
            petPlacements: player.petPlacements,
            decoInventory: player.decoInventory,
            decoPlacements: player.decoPlacements,
            toolInventory: player.toolInventory,
            inventoryMaxSlots: player.inventoryMaxSlots,
            tutorialCompleted: player.tutorialCompleted,
            mailbox: player.mailbox,
        });
        res.json({ success: true });
    });

    // ─── Socket Handlers ──────────────────────────────────────────────────────
    function registerGardenSocketHandlers(socket) {
        socket.on("join_garden_lobby", ({ lobbyId, userId, userName }) => {
            const cleanLobbyId = String(lobbyId).toLowerCase(); // Sicherstellen, dass es lowercase ist
            const lobby = lobbies.get(cleanLobbyId);
            
            if (!lobby) { socket.emit("garden_error", { message: "Lobby nicht gefunden." }); return; }
            const uid = String(userId || "").trim();
            if (!uid) { socket.emit("garden_error", { message: "Ungültiger Nutzer." }); return; }

            // ─── NEU: Multi-Tab & Reconnect Schutz ─────────────────────────────────
            // Wir suchen, ob der Nutzer bereits in dieser Lobby einen offenen Socket hat
            const existingSession = [...playerSessions.entries()].find(([sid, s]) => s.userId === uid && s.lobbyId === cleanLobbyId);
            
            if (existingSession) {
                const oldSocketId = existingSession[0];
                // WICHTIG: Wir löschen die alte Session aus playerSessions BEVOR wir disconnecten.
                // Dadurch ignoriert _handleGardenDisconnect diesen Rauswurf und der Spieler
                // verliert seinen Platz in der Lobby nicht!
                playerSessions.delete(oldSocketId);
                
                const oldSocket = io.sockets.sockets.get(oldSocketId);
                if (oldSocket) {
                    oldSocket.emit("garden_error", { message: "Verbindung durch einen neuen Tab (oder Reconnect) ersetzt." });
                    oldSocket.disconnect(true);
                }
            }
            // ────────────────────────────────────────────────────────────────────────

            if (Object.keys(lobby.players).length >= lobby.maxPlayers && !lobby.players[uid]) {
                socket.emit("garden_error", { message: "Lobby ist voll." }); return;
            }
            
            let slotIndex;
            if (lobby.players[uid]) {
                slotIndex = lobby.players[uid].slotIndex;
            } else {
                const plot = assignPlotToPlayer(lobby, uid, userName);
                if (!plot) { socket.emit("garden_error", { message: "Kein freies Feld." }); return; }
                slotIndex = plot.slotIndex;
                const saved = farmStates.get(uid);
                const rotGen = lobby.shopRotation?.generatedAt;
                const toolGen = lobby.toolShopRotation?.generatedAt;
                const eggGen = lobby.eggShopRotation?.generatedAt;
                const canSeed = isPlainObject(saved?.shopStock) && Object.keys(saved.shopStock).length > 0
                    && Number(saved.shopStockVersion) === Number(rotGen);
                const canTool = isPlainObject(saved?.toolShopStock) && Object.keys(saved.toolShopStock).length > 0
                    && Number(saved.toolShopStockVersion) === Number(toolGen);
                const canEgg = isPlainObject(saved?.eggShopStock) && Object.keys(saved.eggShopStock).length > 0
                    && Number(saved.eggShopStockVersion) === Number(eggGen);
                const newPlayer = {
                    id: uid, name: userName,
                    x: 2240 + slotIndex * 80, y: 1440,
                    gold: saved?.gold ?? 500,
                    inventory: saved?.inventory ?? [],
                    harvestedItems: saved?.harvestedItems ?? [],
                    eggInventory: saved?.eggInventory ?? [],
                    petInventory: saved?.petInventory ?? [],
                    petPlacements: saved?.petPlacements ?? [],
                    decoInventory: saved?.decoInventory ?? [],
                    decoPlacements: saved?.decoPlacements ?? [],
                    toolInventory: normalizeToolInventory(saved?.toolInventory),
                    inventoryMaxSlots: saved?.inventoryMaxSlots ?? 50,
                    tutorialCompleted: saved?.tutorialCompleted ?? false,
                    mailbox: saved?.mailbox ?? [],
                    incubator: saved?.incubator ?? { unlockedSlots: 1, slots: [null, null, null, null, null] },
                    appearance: saved?.appearance || { 
                        head: "/garden-assets/wardrobe/head_farmer.png", 
                        body: "/garden-assets/wardrobe/body_overalls.png" 
                    },
                    shopStock: canSeed ? { ...saved.shopStock } : {},
                    toolShopStock: canTool ? { ...saved.toolShopStock } : {},
                    eggShopStock: canEgg ? { ...saved.eggShopStock } : {},
                    shopStockVersion: canSeed ? Number(saved.shopStockVersion) : 0,
                    toolShopStockVersion: canTool ? Number(saved.toolShopStockVersion) : 0,
                    eggShopStockVersion: canEgg ? Number(saved.eggShopStockVersion) : 0,
                    tools: [], slotIndex,
                };
                if (!canSeed) initPlayerShopStock(newPlayer, lobby.shopRotation);
                if (!canTool) initPlayerToolShopStock(newPlayer, lobby.toolShopRotation);
                if (!canEgg) initPlayerEggShopStock(newPlayer, lobby.eggShopRotation);
                lobby.players[uid] = newPlayer;
                if (saved?.plotPlants) {
                    plot.plants = advancePlantTime(saved.plotPlants);
                }
                plot.unlockedCells = resolvePlotUnlockedCells(saved, plot.isTopRow);
                plot.expansions = Math.min(MAX_PLOT_EXPANSIONS, Math.ceil(plot.unlockedCells.length / BASE_DIRT_COLS));
            }
            playerSessions.set(socket.id, { userId: uid, lobbyId: cleanLobbyId });
            socket.join(`garden:${cleanLobbyId}`);
            const player = lobby.players[uid];
            if (!player) {
                socket.emit("garden_error", { message: "Lobby-Beitritt unvollständig (Spieler). Bitte erneut verbinden." });
                return;
            }
            lobby.shopRotation = globalShopState.rotation;
            lobby.shopNextRotation = globalShopState.nextRotationAt;
            lobby.toolShopRotation = globalToolShopState.rotation;
            lobby.toolShopNextRotation = globalToolShopState.nextRotationAt;
            lobby.eggShopRotation = globalEggShopState.rotation;
            lobby.eggShopNextRotation = globalEggShopState.nextRotationAt;
            player.toolInventory = normalizeToolInventory(player.toolInventory);
            if (!Array.isArray(player.petInventory)) player.petInventory = [];
            if (!Array.isArray(player.petPlacements)) player.petPlacements = [];
            if (!Array.isArray(player.decoInventory)) player.decoInventory = [];
            if (!Array.isArray(player.decoPlacements)) player.decoPlacements = [];
            if (!player.shopStock || Object.keys(player.shopStock).length === 0 || player.shopStockVersion !== lobby.shopRotation?.generatedAt) {
                initPlayerShopStock(player, lobby.shopRotation);
            }
            if (!player.toolShopStock || Object.keys(player.toolShopStock).length === 0 || player.toolShopStockVersion !== lobby.toolShopRotation?.generatedAt) {
                initPlayerToolShopStock(player, lobby.toolShopRotation);
            }
            if (!player.eggShopStock || Object.keys(player.eggShopStock).length === 0 || player.eggShopStockVersion !== lobby.eggShopRotation?.generatedAt) {
                initPlayerEggShopStock(player, lobby.eggShopRotation);
            }
            socket.emit("lobby_joined", {
                lobby: {
                    id: lobby.id,
                    hostId: lobby.hostId,
                    maxPlayers: lobby.maxPlayers,
                    plots: lobby.plots,
                    players: lobby.players,
                    shopRotation: lobby.shopRotation,
                    shopNextRotation: lobby.shopNextRotation,
                    toolShopRotation: lobby.toolShopRotation,
                    toolShopNextRotation: lobby.toolShopNextRotation,
                    eggShopRotation: lobby.eggShopRotation,
                    eggShopNextRotation: lobby.eggShopNextRotation,
                },
                mySlotIndex: slotIndex,
                myPlayer: player,
                personalShopStock: player.shopStock || {},
                personalToolStock: player.toolShopStock || {},
                personalEggStock: player.eggShopStock || {},
            });
            socket.to(`garden:${cleanLobbyId}`).emit("player_joined", { player: lobby.players[uid], plots: lobby.plots });
            if (lobby.status === "waiting") { lobby.status = "active"; lobby.startedAt = Date.now(); }
        });

        // Kein sofortiges emit — nur _posDirty; 20×/s bündelt setInterval (players_batch_moved) oben.
        socket.on("player_move", ({ x, y, facingRight }) => {
            const session = playerSessions.get(socket.id);
            if (!session) return;
            const { userId, lobbyId } = session;
            const lobby = lobbies.get(lobbyId);
            if (!lobby || !lobby.players[userId]) return;
            const p = lobby.players[userId];
            p.x = x;
            p.y = y;
            p.facingRight = facingRight; // 🌟 NEU
            p._posDirty = true;
        });

        socket.on("player_state_change", (data) => {
            const session = playerSessions.get(socket.id);
            if (!session) return;
            const lobby = lobbies.get(session.lobbyId);
            if (lobby && lobby.players[session.userId]) {
                const p = lobby.players[session.userId];
                p.tool = data.tool;
                p.heldItem = data.heldItem;
                p.appearance = data.appearance;
                // Broadcast an alle anderen in der Lobby
                socket.to(`garden:${session.lobbyId}`).emit("player_state_updated", { 
                    userId: session.userId, 
                    tool: p.tool, 
                    heldItem: p.heldItem, 
                    appearance: p.appearance 
                });
            }
        });

        socket.on("leave_garden_lobby", () => _handleGardenDisconnect(socket));
        socket._gardenDisconnect = () => _handleGardenDisconnect(socket);
    }

    function _handleGardenDisconnect(socket) {
        const session = playerSessions.get(socket.id);
        if (!session) return;
        const { userId, lobbyId } = session;
        playerSessions.delete(socket.id);
        const lobby = lobbies.get(lobbyId);
        if (!lobby) return;
        const alive = removePlayerFromLobby(lobby, userId);
        if (alive) io.to(`garden:${lobbyId}`).emit("player_left", { userId, plots: lobby.plots });
    }

    router.registerGardenSocketHandlers = registerGardenSocketHandlers;
    return router;
};
