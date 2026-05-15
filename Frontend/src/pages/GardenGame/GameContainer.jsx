// GameContainer.jsx
// Smooth WASD movement, diagonal support, plant system, shop UI, lobby awareness

import React, { memo, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { io } from "socket.io-client";
import { socketServerUrl } from "../../utils/socket";
import Renderer from './engine/Renderer';
import InputHandler from './engine/InputHandler';
import { generatePlotSlots, TILE_SIZE, MAP_CONFIG, getHoveredCell, getHoveredRock } from './engine/MapConfig';
import { generateShopRotation, harvestPlant, createPlantInstance, isPlantReady, getTimeToNextHarvest, getReadyFruitCount, getPlantVisuals, ensurePerennialFruitingState } from './engine/PlantSystem';
import { TwitchAuthContext } from "../../components/TwitchAuthContext";

// ─── Constants ────────────────────────────────────────────────────────────────
const PLAYER_SPEED = 14; // fast, responsive movement
const INCUBATOR_UNLOCK_COSTS = [50000, 500000, 5000000, 50000000]; // slots 2–5
const INTERACT_DIST = 180;
const SHOP_ROTATION_MS = 5 * 60 * 1000;
const TOOL_EGG_ROTATION_MS = 10 * 60 * 1000;
const TARGET_FPS = 60;
const MAX_PLOT_EXPANSIONS = 15;
const WORLD_BOOT_MIN_MS = 700;

const DEFAULT_TOOL_INVENTORY = {
    pickaxeUses: 0,
    pickaxesBought: 0, // 7. ANPASSUNG
    hasShovel: false,
    backpackUpgraded: false,
    backpackLevel: 0,
    plantPots: 0,
    wateringCans: 0,
};
const BASE_DIRT_COLS = Math.round(MAP_CONFIG.baseDirtWidth / TILE_SIZE);
const BASE_DIRT_ROWS = Math.round(MAP_CONFIG.baseDirtHeight / TILE_SIZE);
const AREA_IMAGES = {
    seedShop: "/garden-assets/world/seed_shop.png",
    toolShop: "/garden-assets/world/tool_shop.png",
    eggShop: "/garden-assets/world/egg_shop.png",
    decoShop: "/garden-assets/world/deco_shop.png",
    incubator: "/garden-assets/world/incubator.png",
    market: "/garden-assets/world/market.png",
    petMarket: "/garden-assets/world/pet_market.png",
};
const PET_SELL_PRICES = {
    COMMON: 50000,
    UNCOMMON: 500000,
    RARE: 5000000,
    EPIC: 50000000,
    LEGENDARY: 500000000,
    MYTHIC: 2000000000,
};
const TOOL_IMAGE_BY_KEY = {
    pickaxe: "/garden-assets/tools/spitzhacke.png",
    shovel: "/garden-assets/tools/schaufel.png",
    pot: "/garden-assets/tools/topf.png",
    watering: "/garden-assets/tools/gieskanne.png",
    backpack: "/garden-assets/tools/rucksack.png",
};
const TOOL_IMAGE_BY_ID = {
    pickaxe: TOOL_IMAGE_BY_KEY.pickaxe,
    shovel: TOOL_IMAGE_BY_KEY.shovel,
    plant_pot: TOOL_IMAGE_BY_KEY.pot,
    watering_can: TOOL_IMAGE_BY_KEY.watering,
    backpack_upgrade: TOOL_IMAGE_BY_KEY.backpack,
};
const TERRAIN_ASSET_IMAGES = [
    "/garden-assets/structure/gras1.png",
    "/garden-assets/structure/gras2.png",
    "/garden-assets/structure/gras3.png",
    "/garden-assets/structure/gras4.png",
    "/garden-assets/structure/hohes_gras1.png",
    "/garden-assets/structure/hohes_gras2.png",
    "/garden-assets/structure/kiesweg1.png",
    "/garden-assets/structure/kiesweg2.png",
    "/garden-assets/structure/acker.png",
    "/garden-assets/structure/stein.png",
    "/garden-assets/structure/wood.png",
];
const PET_IMAGE_BY_TYPE = {
    Huhn: "/garden-assets/animals/huhn.png",
    Ente: "/garden-assets/animals/ente.png",
    Schwein: "/garden-assets/animals/schwein.png",
    Katze: "/garden-assets/animals/katze.png",
    "Waschbär": "/garden-assets/animals/waschbaer.png",
    Kuh: "/garden-assets/animals/kuh.png",
    Schaf: "/garden-assets/animals/schaf.png",
    Ziege: "/garden-assets/animals/ziege.png",
    Pferd: "/garden-assets/animals/pferd.png",
    Esel: "/garden-assets/animals/esel.png",
    Hund: "/garden-assets/animals/hund.png",
    Einhorn: "/garden-assets/animals/einhorn.png",
};
const WEATHER_BY_ROLL = [
    { max: 0.7, type: "sun", label: "Sonne" },
    { max: 0.775, type: "rain", label: "Regen" },
    { max: 0.85, type: "snow", label: "Schnee" },
    { max: 0.925, type: "thunder", label: "Donner" },
    { max: 1, type: "moonlight", label: "Mondschein" },
];
const DEFAULT_RENDER_PROFILE = {
    level: "medium",
    particleScale: 0.75,
    simplifyPlantUi: false,
};
const RENDER_QUALITY_PRESETS = {
    low: { level: "low", particleScale: 0.45, simplifyPlantUi: true },
    medium: { level: "medium", particleScale: 0.75, simplifyPlantUi: false },
    high: { level: "high", particleScale: 1, simplifyPlantUi: false },
};

const EGG_SHOP_CATALOGUE = [
    { id: "common_egg", name: "Common Egg", emoji: "🥚", image: "/garden-assets/eggs/common_egg.png", rarity: "COMMON", price: 100000, hatchTable: [{ type: "Huhn", chance: 70 }, { type: "Ente", chance: 25 }, { type: "Schwein", chance: 5 }] },
    { id: "uncommon_egg", name: "Uncommon Egg", emoji: "🥚", image: "/garden-assets/eggs/uncommon_egg.png", rarity: "UNCOMMON", price: 1000000, hatchTable: [{ type: "Ente", chance: 60 }, { type: "Katze", chance: 30 }, { type: "Waschbär", chance: 10 }] },
    { id: "rare_egg", name: "Rare Egg", emoji: "🥚", image: "/garden-assets/eggs/rare_egg.png", rarity: "RARE", price: 10000000, hatchTable: [{ type: "Kuh", chance: 60 }, { type: "Schaf", chance: 30 }, { type: "Pferd", chance: 10 }] },
    { id: "epic_egg", name: "Epic Egg", emoji: "🥚", image: "/garden-assets/eggs/epic_egg.png", rarity: "EPIC", price: 100000000, hatchTable: [{ type: "Esel", chance: 60 }, { type: "Hund", chance: 30 }, { type: "Einhorn", chance: 10 }] },
    { id: "legendary_egg", name: "Legendary Egg", emoji: "🥚", image: "/garden-assets/eggs/legendary_egg.png", rarity: "LEGENDARY", price: 1000000000, hatchTable: [{ type: "Pferd", chance: 50 }, { type: "Hund", chance: 40 }, { type: "Einhorn", chance: 10 }] },
];

const DECO_SHOP_ITEMS = [
    // ── COMMON ──────────────────────────────────────────────────────────────
    { id: "plant",        name: "Pflanze",       emoji: "🪴", rarity: "COMMON",    price: 5000,    image: "/garden-assets/deco/plant.png",               width: 1, height: 1 },
    { id: "deco_bench",   name: "Gartenbank",    emoji: "🪑", rarity: "COMMON",    price: 8000,    image: "/garden-assets/deco/bank.png",               width: 1, height: 1 },
    { id: "deco_lamp",    name: "Laterne",       emoji: "🏮", rarity: "COMMON",    price: 12000,   image: "/garden-assets/deco/lamp_placeholder.png",   width: 1, height: 2 },
    // ── UNCOMMON ────────────────────────────────────────────────────────────
    { id: "feuer",        name: "Feuerschale",   emoji: "🔥", rarity: "UNCOMMON",  price: 20000,   image: "/garden-assets/deco/feuer.png",               width: 1, height: 1 },
    { id: "gnome1",       name: "Gartenzwerg",   emoji: "🧙", rarity: "UNCOMMON",  price: 25000,   image: "/garden-assets/deco/gnome1.png",              width: 1, height: 1 },
    { id: "gnome2",       name: "Gartenzwerg 2", emoji: "🧙", rarity: "UNCOMMON",  price: 25000,   image: "/garden-assets/deco/gnome2.png",              width: 1, height: 1 },
    { id: "gnome3",       name: "Gartenzwerg 3", emoji: "🧙", rarity: "UNCOMMON",  price: 25000,   image: "/garden-assets/deco/gnome3.png",              width: 1, height: 1 },
    { id: "grill",        name: "Grill",         emoji: "🍖", rarity: "UNCOMMON",  price: 35000,   image: "/garden-assets/deco/grill.png",               width: 1, height: 1 },
    { id: "tisch",        name: "Gartentisch",   emoji: "🪵", rarity: "UNCOMMON",  price: 40000,   image: "/garden-assets/deco/tisch.png",               width: 1, height: 1 },
    // ── RARE ────────────────────────────────────────────────────────────────
    { id: "deco_statue",  name: "Statue",        emoji: "🗿", rarity: "RARE",      price: 80000,   image: "/garden-assets/deco/statue_placeholder.png", width: 1, height: 2 },
    { id: "teich",        name: "Teich",         emoji: "🐟", rarity: "RARE",      price: 120000,  image: "/garden-assets/deco/teich.png",               width: 2, height: 2 },
    { id: "brunnen",      name: "Brunnen",       emoji: "⛲", rarity: "RARE",      price: 150000,  image: "/garden-assets/deco/brunnen1.png",            width: 2, height: 2 },
    // ── EPIC ────────────────────────────────────────────────────────────────
    { id: "pool",         name: "Pool",          emoji: "🏊", rarity: "EPIC",      price: 400000,  image: "/garden-assets/deco/pool.png",                width: 2, height: 2 },
    { id: "deco_fountain",name: "Großbrunnen",   emoji: "⛲", rarity: "EPIC",      price: 500000,  image: "/garden-assets/deco/fountain_placeholder.png",width: 2, height: 2 },
    // ── LEGENDARY ───────────────────────────────────────────────────────────
    { id: "deco_arch",    name: "Holzbogen",    emoji: "🏛️", rarity: "LEGENDARY", price: 2000000, image: "/garden-assets/deco/bogen.png",               width: 2, height: 2 },
];  

const WARDROBE_SKINS = [
    { id: "farmer",   name: "Bauer",     skin: "/garden-assets/wardrobe/farmer.png" },
    { id: "wizard",   name: "Zauberer",  skin: "/garden-assets/wardrobe/wizard.png" },
    { id: "king",     name: "König",     skin: "/garden-assets/wardrobe/king.png" },
    { id: "duck", name: "Ente",   skin: "/garden-assets/wardrobe/duck.png" },
];

const PET_EMOJI_BY_TYPE = {
    Huhn: "🐔",
    Ente: "🦆",
    Schwein: "🐷",
    Katze: "🐈",
    Waschbär: "🦝",
    Kuh: "🐮",
    Schaf: "🐑",
    Phönix: "🐦‍🔥",
    Tiger: "🐯",
    Drache: "🐉",
    Einhorn: "🦄",
    Götterwesen: "👼",
    Tier: "🐾",
};

function getPetEmoji(type) {
    return PET_EMOJI_BY_TYPE[type] || "🐾";
}

function getToolImage(toolIdOrKey) {
    return TOOL_IMAGE_BY_ID[toolIdOrKey] || TOOL_IMAGE_BY_KEY[toolIdOrKey] || null;
}

function getPetSpriteImage(type) {
    if (PET_IMAGE_BY_TYPE[type]) return PET_IMAGE_BY_TYPE[type];
    const slug = String(type || "tier")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/ß/g, "ss")
        .replace(/[^a-zA-Z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .toLowerCase();
    return slug ? `/garden-assets/animals/${slug}.png` : "/garden-assets/animals/tier.png";
}

function hashToUnit(seed) {
    const s = String(seed || "0");
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return (h >>> 0) / 4294967295;
}

function rollWeatherFromRotation(rotationKey) {
    const unit = hashToUnit(`weather:${rotationKey}`);
    return WEATHER_BY_ROLL.find((entry) => unit <= entry.max) || WEATHER_BY_ROLL[0];
}

function getPickaxePrice(boughtCount = 0) {
    return Math.floor(100000 * Math.pow(1.3, Math.max(0, boughtCount)));
}

function buildPetPreviewImage(petType, emoji) {
    const safeType = String(petType || "Tier");
    const safeEmoji = String(emoji || "🐾");
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
  <defs>
    <radialGradient id="g" cx="50%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#1d4ed8"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </radialGradient>
  </defs>
  <rect width="160" height="160" rx="28" fill="url(#g)"/>
  <text x="80" y="76" font-size="56" text-anchor="middle" dominant-baseline="middle">${safeEmoji}</text>
  <text x="80" y="126" font-family="monospace" font-size="16" fill="#e2e8f0" text-anchor="middle">${safeType}</text>
</svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg.trim())}`;
}

function normalizeToolInventory(inv) {
    const merged = {
        ...DEFAULT_TOOL_INVENTORY,
        ...(inv && typeof inv === "object" ? inv : {}),
    };
    const backpackLevel = Number(merged.backpackLevel || (merged.backpackUpgraded ? 1 : 0)) || 0;
    merged.backpackLevel = Math.max(0, backpackLevel);
    merged.backpackUpgraded = merged.backpackLevel > 0;
    return merged;
}

function getBackpackUpgradePrice(level = 0) {
    return Math.max(1, Math.floor(25000 * Math.pow(1.85, Math.max(0, level))));
}

function formatPriceShort(value) {
    const n = Number(value || 0);
    if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(n % 1_000_000_000 === 0 ? 0 : 1)}B`;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}k`;
    return n.toLocaleString("de-DE");
}

function normalizePlotUnlockedCells(cells) {
    if (!Array.isArray(cells)) return [];
    const set = new Set();
    const topMin = -MAX_PLOT_EXPANSIONS;
    const topMax = -1;
    const bottomMin = BASE_DIRT_ROWS;
    const bottomMax = BASE_DIRT_ROWS + MAX_PLOT_EXPANSIONS - 1;
    for (const raw of cells) {
        if (typeof raw !== "string") continue;
        const [xs, ys] = raw.split("_");
        const x = Number(xs);
        const y = Number(ys);
        if (!Number.isInteger(x) || !Number.isInteger(y)) continue;
        if (x < 0 || x >= BASE_DIRT_COLS) continue;
        const validY = (y >= topMin && y <= topMax) || (y >= bottomMin && y <= bottomMax);
        if (!validY) continue;
        set.add(`${x}_${y}`);
    }
    return [...set];
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

function rollHatchResult(egg) {
    const table = Array.isArray(egg?.hatchTable) ? egg.hatchTable : [];
    
    // Fähigkeit auswürfeln
    const abilityTypes = ["goldfinder", "seedfinder"];
    const chosenAbility = abilityTypes[Math.floor(Math.random() * abilityTypes.length)];
    const rarityMap = { COMMON: 1, UNCOMMON: 2, RARE: 3, EPIC: 4, LEGENDARY: 5, MYTHIC: 6 };
    const level = rarityMap[egg?.rarity || "COMMON"] || 1;

    if (!table.length) {
        const fallbackType = "Tier";
        const fallbackEmoji = getPetEmoji(fallbackType);
        return {
            type: fallbackType,
            emoji: fallbackEmoji,
            image: getPetSpriteImage(fallbackType),
            previewImage: buildPetPreviewImage(fallbackType, fallbackEmoji),
            ability: { type: chosenAbility, level }
        };
    }
    const roll = Math.random() * 100;
    let acc = 0;
    let chosen = table[0]?.type || "Tier";
    for (const entry of table) {
        acc += Number(entry?.chance || 0);
        if (roll <= acc) {
            chosen = entry.type;
            break;
        }
    }
    const emoji = getPetEmoji(chosen);
    return {
        type: chosen,
        emoji,
        image: getPetSpriteImage(chosen),
        previewImage: buildPetPreviewImage(chosen, emoji),
        ability: { type: chosenAbility, level } // Fähigkeit speichern
    };
}

const RARITY_COLORS = {
    COMMON:    { bg: "bg-slate-500",   text: "text-slate-100",   border: "border-slate-400"   },
    UNCOMMON:  { bg: "bg-green-600",   text: "text-green-50",    border: "border-green-400"   },
    RARE:      { bg: "bg-blue-600",    text: "text-blue-50",     border: "border-blue-400"    },
    EPIC:      { bg: "bg-purple-600",  text: "text-purple-50",   border: "border-purple-400"  },
    LEGENDARY: { bg: "bg-amber-500",   text: "text-amber-50",    border: "border-amber-300"   },
    MYTHIC:    { bg: "bg-pink-500",    text: "text-pink-50",     border: "border-pink-300"    },
};

function RarityBadge({ rarity }) {
    const c = RARITY_COLORS[rarity] || RARITY_COLORS.COMMON;
    return (
        <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${c.bg} ${c.text}`}>
            {rarity}
        </span>
    );
}

function ItemIcon({ item, className = "w-10 h-10", emojiClassName = "text-3xl" }) {
    const imageSrc = item?.image || item?.seedImage || item?.seedShopImage || item?.harvestImage || null;
    const [failed, setFailed] = useState(false);
    useEffect(() => setFailed(false), [imageSrc]);
    if (imageSrc && !failed) {
        return (
            <img
                src={imageSrc}
                alt={item?.name || "item"}
                className={`${className} object-contain`}
                draggable={false}
                onError={() => setFailed(true)}
            />
        );
    }
    return <span className={emojiClassName}>{item?.emoji || "📦"}</span>;
}

/**
 * Renders an item icon with a static colored overlay for Golden/Rainbow specials.
 * Uses CSS mask-image so the tint only colors the item's actual pixels (matches PNG alpha),
 * and never re-renders animated frames — replaces the old ctx.filter / Date.now() approach
 * which forced React to re-render every frame and was extremely lag-inducing in long lists.
 */
const SPECIAL_TINT_STYLES = {
    Golden: { background: "rgba(250, 204, 21, 0.65)" },
    Rainbow: {
        background: "linear-gradient(180deg, rgba(255,64,64,0.65) 0%, rgba(255,165,0,0.65) 20%, rgba(255,235,59,0.65) 40%, rgba(76,175,80,0.65) 60%, rgba(33,150,243,0.65) 80%, rgba(156,39,176,0.65) 100%)"
    },
};

function SpecialItemIcon({ item, special, className = "w-10 h-10", emojiClassName = "text-3xl" }) {
    const tint = special ? SPECIAL_TINT_STYLES[special] : null;
    const imageSrc = item?.image || item?.seedImage || item?.seedShopImage || item?.harvestImage || null;
    if (!tint || !imageSrc) {
        // No special, or only emoji available -> tint can't be masked, just render normal icon
        return <ItemIcon item={item} className={className} emojiClassName={emojiClassName} />;
    }
    return (
        <div className={`${className} relative`}>
            <ItemIcon item={item} className={className} emojiClassName={emojiClassName} />
            <div
                aria-hidden
                className="absolute inset-0 pointer-events-none"
                style={{
                    ...tint,
                    WebkitMaskImage: `url("${imageSrc}")`,
                    maskImage: `url("${imageSrc}")`,
                    WebkitMaskSize: "contain",
                    maskSize: "contain",
                    WebkitMaskRepeat: "no-repeat",
                    maskRepeat: "no-repeat",
                    WebkitMaskPosition: "center",
                    maskPosition: "center",
                }}
            />
        </div>
    );
}

function withVisuals(item) {
    if (!item?.seedId) return item;
    const visuals = getPlantVisuals(item.seedId, item.singleUse !== false);
    return {
        ...visuals,
        ...item,
        image: item.image || item.seedImage || item.seedShopImage || item.harvestImage || visuals.seedImage,
        seedImage: item.seedImage || item.seedShopImage || visuals.seedImage,
        seedShopImage: item.seedShopImage || visuals.seedShopImage,
        plantedSeedImage: item.plantedSeedImage || visuals.plantedSeedImage,
        growthImage: item.growthImage || visuals.growthImage,
        structureImage: item.structureImage || visuals.structureImage,
        fruitImage: item.fruitImage || visuals.fruitImage,
        harvestImage: item.harvestImage || visuals.harvestImage,
    };
}

function collectVisualAssetPaths(item) {
    if (!item || typeof item !== "object") return [];
    const candidatePaths = [
        item.image,
        item.seedImage,
        item.seedShopImage,
        item.plantedSeedImage,
        item.growthImage,
        item.structureImage,
        item.fruitImage,
        item.harvestImage,
    ];
    return candidatePaths.filter((p) => typeof p === "string" && p.length > 0);
}

const ShopSeedCard = memo(function ShopSeedCard({ seed, onBuy, canAfford, stock }) {
    const visualSeed = withVisuals(seed);
    const c = RARITY_COLORS[seed.rarity] || RARITY_COLORS.COMMON;
    const inactive = !seed.active && seed.active !== undefined;
    const outOfStock = (stock ?? (seed.active ? 1 : 0)) <= 0;
    const clickable = canAfford && !outOfStock && !inactive;
    return (
        <div
            className={`p-4 rounded-2xl border ${inactive ? "border-slate-700 opacity-40" : c.border} ${inactive ? "bg-slate-900/30" : "bg-slate-900/60"} ${clickable ? "hover:bg-slate-800/80 cursor-pointer" : "cursor-default"} transition-all flex gap-4 items-center group min-h-[86px]`}
            onClick={() => clickable && onBuy(seed)}>
            <ItemIcon item={visualSeed} className="w-14 h-14" emojiClassName="text-4xl" />
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-bold text-sm">{seed.name}</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                    <RarityBadge rarity={seed.rarity} />
                    <span className="text-slate-400 text-xs">• {seed.singleUse ? "Einzeln" : "Mehrfach"}</span>
                </div>
            </div>
            <div className="text-right shrink-0">
                <div className={`text-lg font-black ${inactive ? "text-slate-600" : (canAfford ? "text-yellow-400" : "text-slate-500")}`}>
                    {seed.shopPrice.toLocaleString('de-DE')} 🪙
                </div>
                {seed.active && (
                    <div className={`text-xs mt-0.5 font-bold ${outOfStock ? "text-red-400" : "text-cyan-300"}`}>
                        Bestand: {outOfStock ? "Ausverkauft" : stock}
                    </div>
                )}
                {seed.active && (
                    <div className={`text-xs mt-1 font-bold transition-opacity ${clickable ? "opacity-0 group-hover:opacity-100 text-green-400" : "text-red-500 opacity-100"}`}>
                        {outOfStock ? "Ausverkauft" : (canAfford ? "KAUFEN" : "Zu teuer")}
                    </div>
                )}
            </div>
        </div>
    );
});

export default function GameContainer() {
    const { user: twitchUser, login: twitchLogin } = useContext(TwitchAuthContext);
    const canvasRef = useRef(null);

    // ── UI State ──────────────────────────────────────────────────────────────
    const [activeShop, setActiveShop] = useState(null); // "seed" | "tool" | "egg" | "deco"
    const [isBackpackOpen, setBackpackOpen] = useState(false);
    const [inventoryFilter, setInventoryFilter] = useState("all");
    const [inventoryMaxSlots, setInventoryMaxSlots] = useState(50);
    const [currentInteractable, setCurrentInteractable] = useState(null);
    const [gold, setGold] = useState(500);
    const [inventory, setInventory] = useState([]); // array of seed instances
    const [shopRotation, setShopRotation] = useState(null);
    const [shopCountdown, setShopCountdown] = useState(SHOP_ROTATION_MS);
    const [toolShopRotation, setToolShopRotation] = useState(null);
    const [eggShopRotation, setEggShopRotation] = useState(null);
    const [toolShopCountdown, setToolShopCountdown] = useState(TOOL_EGG_ROTATION_MS);
    const [eggShopCountdown, setEggShopCountdown] = useState(TOOL_EGG_ROTATION_MS);
    const [toolShopStock, setToolShopStock] = useState({});
    const [eggShopStock, setEggShopStock] = useState({});
    const [personalShopStock, setPersonalShopStock] = useState({}); // { seedId: count }
    const [shopFilter, setShopFilter] = useState("available"); // "all" | "available"
    const [plotPlants, setPlotPlants] = useState({}); // "cx_cy" → plant
    const [plotExpansions, setPlotExpansions] = useState(0);
    const [plotUnlockedCells, setPlotUnlockedCells] = useState([]);
    const [selectedSeed, setSelectedSeed] = useState(null); // seed in hand for planting
    const [selectedCarryItem, setSelectedCarryItem] = useState(null); // harvested/other item in hand for visual carry
    const [selectedTool, setSelectedTool] = useState(null); // "pickaxe" | "pot" | "watering" | "shovel"
    const [movingPlantSource, setMovingPlantSource] = useState(null); // key string
    const [rotationBanners, setRotationBanners] = useState([]);
    const [harvestedItems, setHarvestedItems] = useState([]);
    const [isMarketOpen, setMarketOpen] = useState(false);
    const [notification, setNotification] = useState(null);
    const [hoverInfo, setHoverInfo] = useState(null); // { x, y, key }
    const [remoteHoverInfo, setRemoteHoverInfo] = useState(null); // { x, y, key, slotOwner, slotIndex }
    const [itemHoverTooltip, setItemHoverTooltip] = useState(null); // { item, x, y }
    const [toolInventory, setToolInventory] = useState(DEFAULT_TOOL_INVENTORY);
    const [eggInventory, setEggInventory] = useState([]);
    const [petInventory, setPetInventory] = useState([]);
    const [petPlacements, setPetPlacements] = useState([]);
    const [decoInventory, setDecoInventory] = useState([]);
    const [decoPlacements, setDecoPlacements] = useState([]);
    const [selectedPetToPlace, setSelectedPetToPlace] = useState(null);
    const [selectedDecoToPlace, setSelectedDecoToPlace] = useState(null);
    const [shovelHoldState, setShovelHoldState] = useState({ active: false, progress: 0 });
    const [isIncubatorOpen, setIncubatorOpen] = useState(false);
    const [incubatorTargetSlot, setIncubatorTargetSlot] = useState(null);
    const [incubator, setIncubator] = useState({
        unlockedSlots: 1,
        slots: [null, null, null, null, null],
    });
    const [tickNow, setTickNow] = useState(Date.now());
    const [weatherState, setWeatherState] = useState({ type: "sun", label: "Sonne", intensity: 1, startedAt: Date.now() });
    const [renderProfile, setRenderProfile] = useState(DEFAULT_RENDER_PROFILE);
    const [playerAppearance, setPlayerAppearance] = useState({
        skin: "/garden-assets/wardrobe/farmer.png",
    });
    const appearanceRef = useRef(playerAppearance);
    const [isWardrobeOpen, setWardrobeOpen] = useState(false);
    const [isChangelogOpen, setChangelogOpen] = useState(false);
    const [isPlayerListOpen, setPlayerListOpen] = useState(false);
    const [mailbox, setMailbox] = useState([]);
    const [isMailboxOpen, setMailboxOpen] = useState(false);
    const [mailboxTargetId, setMailboxTargetId] = useState(null); // userId of the mailbox owner
    const [giftMessage, setGiftMessage] = useState("");
    const [giftGold, setGiftGold] = useState(0);
    const [giftItems, setGiftItems] = useState([]); // { type: 'seed'|'pet'|'deco', item: any }

    const [showLobbyScreen, setShowLobbyScreen] = useState(true);
    const [lobbyMode, setLobbyMode] = useState("single");
    const [roomCode, setRoomCode] = useState("");
    const [publicLobbies, setPublicLobbies] = useState([]);
    const [hostPrivateLobby, setHostPrivateLobby] = useState(false);
    const [hostMaxPlayers, setHostMaxPlayers] = useState(8);
    const [currentLobbyId, setCurrentLobbyId] = useState(null);
    const [lobbyHostId, setLobbyHostId] = useState(null);
    const [mySlotIndex, setMySlotIndex] = useState(0);
    const [isMultiplayer, setIsMultiplayer] = useState(false);
    const [authUser, setAuthUser] = useState(null);
    const [isSettingsOpen, setSettingsOpen] = useState(false);
    const [worldBootState, setWorldBootState] = useState({ active: false, label: "", progress: 0 });
    const [isInitialLoadDone, setIsInitialLoadDone] = useState(false);
    const [isSubscriber, setIsSubscriber] = useState(false);
    const [isBeta, setIsBeta] = useState(false);
    const [tutorialCompleted, setTutorialCompleted] = useState(false);
    const [tutorialStep, setTutorialStep] = useState(0); // 0: buy seed, 1: plant, 2: harvest, 3: sell
    const [effectVolume, setEffectVolume] = useState(() => {
        const saved = localStorage.getItem("garden_farms_effect_volume");
        if (saved !== null) return parseFloat(saved);
        const old = localStorage.getItem("garden_farms_volume");
        return old !== null ? parseFloat(old) : 0.5;
    });
    const [musicVolume, setMusicVolume] = useState(() => {
        const saved = localStorage.getItem("garden_farms_music_volume");
        return saved !== null ? parseFloat(saved) : 0.1;
    });
    const [remotePlayersList, setRemotePlayersList] = useState([]);
    const socketRef = useRef(null);
    const mySlotRef = useRef(0);
    const lastMoveEmitRef = useRef(0);
    const plotExpansionsRef = useRef(0);
    const plotUnlockedCellsRef = useRef([]);
    const sellAllRef = useRef(() => {});
    const sellPetRef = useRef(() => {});
    const rotationBannerTimeoutsRef = useRef(new Set());
    const shovelHoldTimerRef = useRef(null);
    const shovelHoldProgressRef = useRef(null);
    const shovelHoldStartedAtRef = useRef(0);
    const isDragHarvestingRef = useRef(false);
    const dragHarvestedCellsRef = useRef(new Set());
    const toolRotationKeyRef = useRef(null);
    const eggRotationKeyRef = useRef(null);
    const seedRotationKeyRef = useRef(null);
    const selectedToolRef = useRef(null);
    const heldItemRef = useRef(null);
    const movingPlantSourceRef = useRef(null);
    const renderProfileRef = useRef(DEFAULT_RENDER_PROFILE);
    const weatherStateRef = useRef(weatherState);
    const toolInventoryRef = useRef(toolInventory);
    const lastMpShopPollRef = useRef(0);
    const seedNextRotationAtRef = useRef(0);
    const toolNextRotationAtRef = useRef(0);
    const eggNextRotationAtRef = useRef(0);
    /** Samen-Shop: pro Rotation nur einmal auffüllen / aus Save übernehmen (nicht bei jedem /global-shop-Poll resetten) */
    const personalShopSeededForGenAtRef = useRef(null);
    /** Gespeicherter Shop-Stock aus dem Farm-Save — wird einmalig von initPersonalStock konsumiert */
    const savedShopStockRef = useRef(null); // { stock: {}, version: number } | null
    const savedToolShopStockRef = useRef(null);
    const savedEggShopStockRef = useRef(null);
    const plantingCellsRef = useRef(new Set());
    const effectVolumeRef = useRef(effectVolume);
    useEffect(() => {
        effectVolumeRef.current = effectVolume;
        localStorage.setItem("garden_farms_effect_volume", effectVolume.toString());
    }, [effectVolume]);

    const musicVolumeRef = useRef(musicVolume);
    useEffect(() => {
        musicVolumeRef.current = musicVolume;
        localStorage.setItem("garden_farms_music_volume", musicVolume.toString());
        if (soundsRef.current?.music) soundsRef.current.music.volume = musicVolume;
    }, [musicVolume]);

    const showLobbyScreenRef = useRef(showLobbyScreen);
    useEffect(() => {
        showLobbyScreenRef.current = showLobbyScreen;
        if (soundsRef.current?.music) {
            if (showLobbyScreen) soundsRef.current.music.pause();
            else soundsRef.current.music.play().catch(() => {});
        }
    }, [showLobbyScreen]);

    const harvestFlashesRef = useRef([]); // { cellX, cellY, specialName, expiresAt }[]
    const saveTimeoutRef = useRef(null);
    const flushFarmStateToServerRef = useRef(null);
    const preloadedAssetsRef = useRef(new Set());
    const worldBootTokenRef = useRef(0);
    const worldBootKindRef = useRef(null); // "single" | "multi" | null — source of truth for boot type
    const worldBootStatusRef = useRef({ preloadDone: false, dataDone: false, minDoneAt: 0 });
    const worldBootFinishTimerRef = useRef(null);
    const remotePlayersRef = useRef({});
    const remotePlayerTargetsRef = useRef({}); // Zielpunkte für 20-Hz-Interpolation
    const playerBadgeRef = useRef(null);
    const localPlayerNameRef = useRef("Spieler");
    const readyEggsCount = incubator.slots.filter(s => s && Date.now() >= s.hatchAt).length;
    // Refs for latest state values – readable in socket cleanup without stale closures
    const farmStateRef = useRef({
        gold: 500,
        inventory: [],
        plotPlants: {},
        plotExpansions: 0,
        plotUnlockedCells: [],
        harvestedItems: [],
        eggInventory: [],
        petInventory: [],
        petPlacements: [],
        decoInventory: [],
        decoPlacements: [],
        toolInventory: DEFAULT_TOOL_INVENTORY,
        inventoryMaxSlots: 50,
        incubator: { unlockedSlots: 1, slots: [null] },
        appearance: { skin: "/garden-assets/wardrobe/farmer.png" },
    });
    const soundsRef = useRef(null); // lazy nach erster Nutzer-Interaktion (Autoplay-Policy)
    const audioUnlockedRef = useRef(false);
    const lastRotationSoundRef = useRef(0);

    const ensureGardenSounds = useCallback(() => {
        if (soundsRef.current || typeof window === "undefined") return;
        const musicObj = new Audio("/garden-assets/sounds/theme.mp3");
        musicObj.loop = true;
        musicObj.volume = musicVolumeRef.current;
        soundsRef.current = {
            rotation: new Audio("/garden-assets/sounds/rotation.mp3"),
            open: new Audio("/garden-assets/sounds/menu_open.mp3"),
            close: new Audio("/garden-assets/sounds/menu_close.mp3"),
            buy: new Audio("/garden-assets/sounds/kaching.mp3"),
            cash: new Audio("/garden-assets/sounds/cash.mp3"),
            rain: new Audio("/garden-assets/sounds/rain.mp3"),
            thunder: new Audio("/garden-assets/sounds/thunder.mp3"),
            plant: new Audio("/garden-assets/sounds/plant.mp3"),
            harvest: new Audio("/garden-assets/sounds/harvest.mp3"),
            music: musicObj,
        };
        if (!showLobbyScreenRef.current) {
            musicObj.play().catch(() => {});
        }
        audioUnlockedRef.current = true;
    }, []);

    useEffect(() => {
        const unlock = () => {
            ensureGardenSounds();
        };
        window.addEventListener("pointerdown", unlock, { passive: true });
        window.addEventListener("keydown", unlock, { passive: true });
        return () => {
            window.removeEventListener("pointerdown", unlock);
            window.removeEventListener("keydown", unlock);
        };
    }, [ensureGardenSounds]);

    useEffect(() => {
        return () => {
            if (soundsRef.current?.music) {
                soundsRef.current.music.pause();
                soundsRef.current.music.src = "";
            }
            soundsRef.current = null;
        };
    }, []);

    const playSound = useCallback((type, volumeScale = 1.0) => {
        if (!audioUnlockedRef.current) return;
        const audio = soundsRef.current?.[type];
        if (!audio || type === "music") return;
        audio.volume = effectVolumeRef.current * volumeScale;
        audio.currentTime = 0;
        audio.play().catch(() => {});
    }, []);

    // ── Engine ref (canvas state, no re-renders) ──────────────────────────────
    const layout = useRef(generatePlotSlots());
    const engineRef = useRef({
        renderer: null,
        input: null, // wird im Game-Loop erstellt + bei Unmount zerstört (kein globaler Leak)
        player: {
            x: 0, y: 0,
            vx: 0, vy: 0,
            isMoving: false,
        },
        areas: {
            seedShop: { x: 0, y: 0, label: "Samen-Shop", type: "seed" },
            toolShop: { x: 0, y: 0, label: "Tool-Shop", type: "tool" },
            eggShop: { x: 0, y: 0, label: "Eier-Shop", type: "egg" },
            decoShop: { x: 0, y: 0, label: "Deko-Shop", type: "deco" },
            market: { x: 0, y: 0, label: "Markt", type: "market" },
            petMarket: { x: 0, y: 0, label: "Tier-Verkauf", type: "petMarket" },
            incubator: { x: 0, y: 0, label: "Inkubator", type: "incubator" },
        },
        plotPlants: {}, // mirror for canvas reads without stale closure
        petPlacements: [],
        decoPlacements: [],
    });

    // Initialize positions after layout
    useEffect(() => {
        const l = layout.current;
        engineRef.current.player.x = l.centerX;
        engineRef.current.player.y = l.centerY;
        const a = engineRef.current.areas;
        
        // Dynamisch den Abstand vom Zentrum berechnen, damit es immer auf dem Kiesweg ist
        const shopOffsetX = 340;
        const shopSpacing = 580;
        
        a.seedShop.x = l.centerX - shopOffsetX - shopSpacing; a.seedShop.y = l.centerPathTopY + 92; a.seedShop.image = AREA_IMAGES.seedShop;
        a.toolShop.x = l.centerX - shopOffsetX; a.toolShop.y = l.centerPathTopY + 92; a.toolShop.image = AREA_IMAGES.toolShop;
        
        a.eggShop.x = l.centerX - shopOffsetX - shopSpacing; a.eggShop.y = l.centerPathBottomY - 140; a.eggShop.image = AREA_IMAGES.eggShop;
        a.decoShop.x = l.centerX - shopOffsetX; a.decoShop.y = l.centerPathBottomY - 140; a.decoShop.image = AREA_IMAGES.decoShop;
        
        a.market.x = l.centerX + shopOffsetX + shopSpacing - 160; a.market.y = l.centerY; a.market.image = AREA_IMAGES.market;
        a.petMarket.x = l.centerX + shopOffsetX + shopSpacing - 160 + 500; a.petMarket.y = l.centerY; a.petMarket.image = AREA_IMAGES.petMarket;

        const ownSlot = l.slots[0];
        // Incubator: centered horizontally in the free space right of the dirt, at bottom of territory
        // Incubator: centered horizontally in the free space right of the dirt, at bottom of territory
        const rightFreeLeft = ownSlot.x + MAP_CONFIG.dirtOffsetX + MAP_CONFIG.baseDirtWidth;
        const rightFreeRight = ownSlot.x + MAP_CONFIG.territoryWidth;
        a.incubator.x = Math.round((rightFreeLeft + rightFreeRight) / 2); // horizontal center of free zone
        a.incubator.y = ownSlot.isTopRow
            ? ownSlot.anchorY - 120   // 120px above the center path (bottom of top territory)
            : ownSlot.anchorY + MAP_CONFIG.territoryHeight - 120; // near bottom of bottom territory
        a.incubator.image = AREA_IMAGES.incubator;
    }, []);

    useEffect(() => {
        appearanceRef.current = playerAppearance;
    }, [playerAppearance]);

    // Inkubator relativ zum eigenen Plot (Multiplayer: Slot wechselt)
    useEffect(() => {
        const l = layout.current;
        const ownSlot = l.slots[mySlotIndex] || l.slots[0];
        const a = engineRef.current.areas;
        const rightFreeLeft = ownSlot.x + MAP_CONFIG.dirtOffsetX + MAP_CONFIG.baseDirtWidth;
        const rightFreeRight = ownSlot.x + MAP_CONFIG.territoryWidth;
        a.incubator.x = Math.round((rightFreeLeft + rightFreeRight) / 2);
        a.incubator.y = ownSlot.isTopRow
            ? ownSlot.anchorY - 120
            : ownSlot.anchorY + MAP_CONFIG.territoryHeight - 120;
    }, [mySlotIndex]);

    // ── Helpers (defined before any useEffect that references them) ───────────
    const notify = useCallback((msg, type = "success") => {
        setNotification({ msg, type, id: Date.now() });
        setTimeout(() => setNotification(null), 2500);
    }, []);

    const preloadImage = useCallback((src) => {
        if (!src || preloadedAssetsRef.current.has(src)) return;
        preloadedAssetsRef.current.add(src);
        const img = new Image();
        img.decoding = "async";
        img.src = src;
    }, []);

    const hydratePlantVisuals = useCallback((plant) => {
        if (!plant || typeof plant !== "object") return null;
        const singleUse = plant.singleUse !== false;
        if (!plant.seedId) return { ...plant, singleUse };
        return {
            ...getPlantVisuals(plant.seedId, singleUse),
            ...plant,
            singleUse,
        };
    }, []);

    const normalizePlotPlantsMap = useCallback((plantsLike) => {
        if (!plantsLike || typeof plantsLike !== "object") return {};
        const out = {};
        for (const [key, plant] of Object.entries(plantsLike)) {
            const hydrated = hydratePlantVisuals(plant);
            if (!hydrated) continue;
            out[key] = hydrated;
        }
        return out;
    }, [hydratePlantVisuals]);

    const preloadCriticalAssets = useCallback(async (onProgress) => {
        const assetSet = new Set([
            "/garden-assets/common/planted_seed.png",
            "/garden-assets/atlas/garden_atlas.png",
            "/garden-assets/world/mailbox.png",
            ...Object.values(AREA_IMAGES),
            ...Object.values(TOOL_IMAGE_BY_KEY),
            ...TERRAIN_ASSET_IMAGES,
            ...Object.values(PET_IMAGE_BY_TYPE),
            ...DECO_SHOP_ITEMS.map((item) => item.image),
            ...EGG_SHOP_CATALOGUE.map((item) => item.image), // HINZUGEFÜGT
            ...WARDROBE_SKINS.map((item) => item.skin).filter(Boolean),
        ]);
        const enqueueItem = (item) => {
            for (const path of collectVisualAssetPaths(withVisuals(item))) {
                assetSet.add(path);
            }
        };
        for (const item of inventory.slice(0, 120)) enqueueItem(item);
        for (const item of harvestedItems.slice(0, 120)) enqueueItem(item);
        for (const plant of Object.values(plotPlants).slice(0, 180)) enqueueItem(plant);
        for (const deco of decoInventory.slice(0, 120)) enqueueItem(deco);
        for (const deco of decoPlacements.slice(0, 200)) enqueueItem(deco);
        
        // HINZUGEFÜGT:
        for (const egg of eggInventory.slice(0, 120)) enqueueItem(egg);
        for (const pet of petInventory.slice(0, 120)) enqueueItem(pet);
        for (const pet of petPlacements.slice(0, 120)) enqueueItem(pet);

        const sources = [...assetSet];
        const total = Math.max(1, sources.length);
        let done = 0;
        onProgress?.(done, total);

        await Promise.all(sources.map((src) => new Promise((resolve) => {
            const img = new Image();
            img.decoding = "async";
            const finish = () => {
                preloadedAssetsRef.current.add(src);
                done += 1;
                onProgress?.(done, total);
                resolve();
            };
            img.onload = finish;
            img.onerror = finish;
            img.src = src;
        })));
    }, [inventory, harvestedItems, plotPlants, decoInventory, decoPlacements]);

    const tryCompleteWorldBoot = useCallback((token) => {
        if (token !== worldBootTokenRef.current) return;
        const status = worldBootStatusRef.current;
        if (!status.preloadDone || !status.dataDone) return;
        const finish = () => {
            if (token !== worldBootTokenRef.current) return;
            worldBootKindRef.current = null;
            setWorldBootState({ active: false, label: "", progress: 100 });
        };
        if (worldBootFinishTimerRef.current) clearTimeout(worldBootFinishTimerRef.current);
        const waitMs = Math.max(0, status.minDoneAt - Date.now());
        if (waitMs > 0) {
            worldBootFinishTimerRef.current = setTimeout(finish, waitMs);
            return;
        }
        finish();
    }, []);

    const markWorldBootDataReady = useCallback((mode) => {
        const token = worldBootTokenRef.current;
        const status = worldBootStatusRef.current;
        if (token <= 0 || worldBootKindRef.current !== mode) return;
        status.dataDone = true;
        setWorldBootState((prev) => prev.active
            ? { ...prev, label: mode === "multi" ? "Server wird synchronisiert..." : "Farm wird vorbereitet...", progress: Math.max(prev.progress, 82) }
            : prev);
        tryCompleteWorldBoot(token);
    }, [tryCompleteWorldBoot]);

    const updateAreaPositions = useCallback((l) => {
        const a = engineRef.current.areas;
        
        const isSinglePlayer = l.slots.length === 1;
        const shopOffsetX = isSinglePlayer ? 150 : 340;
        const shopSpacing = isSinglePlayer ? 300 : 580;
        
        a.seedShop.x = l.centerX - shopOffsetX - shopSpacing; a.seedShop.y = l.centerPathTopY + 92; a.seedShop.image = AREA_IMAGES.seedShop;
        a.toolShop.x = l.centerX - shopOffsetX; a.toolShop.y = l.centerPathTopY + 92; a.toolShop.image = AREA_IMAGES.toolShop;
        
        a.eggShop.x = l.centerX - shopOffsetX - shopSpacing; a.eggShop.y = l.centerPathBottomY - 140; a.eggShop.image = AREA_IMAGES.eggShop;
        a.decoShop.x = l.centerX - shopOffsetX; a.decoShop.y = l.centerPathBottomY - 140; a.decoShop.image = AREA_IMAGES.decoShop;
        
        a.market.x = l.centerX + shopOffsetX + shopSpacing - (isSinglePlayer ? 100 : 160); a.market.y = l.centerY; a.market.image = AREA_IMAGES.market;
        a.petMarket.x = l.centerX + shopOffsetX + shopSpacing - (isSinglePlayer ? 100 : 160) + 500; a.petMarket.y = l.centerY; a.petMarket.image = AREA_IMAGES.petMarket;
    }, []);

    const startWorldBoot = useCallback((mode, initialMaxPlayers = 1) => {
        const token = worldBootTokenRef.current + 1;
        worldBootTokenRef.current = token;
        worldBootKindRef.current = mode;
        
        layout.current = generatePlotSlots(mode === "single" ? 1 : initialMaxPlayers);
        updateAreaPositions(layout.current);
        
        worldBootStatusRef.current = {
            preloadDone: false,
            dataDone: false,
            minDoneAt: Date.now() + WORLD_BOOT_MIN_MS,
        };
        if (worldBootFinishTimerRef.current) clearTimeout(worldBootFinishTimerRef.current);
        setWorldBootState({
            active: true,
            label: mode === "multi" ? "Verbinde mit Server..." : "Lade Welt...",
            progress: 8,
        });

        preloadCriticalAssets((done, total) => {
            if (token !== worldBootTokenRef.current) return;
            const pct = Math.max(12, Math.min(70, Math.round((done / total) * 70)));
            setWorldBootState((prev) => prev.active
                ? { ...prev, label: "Lade Texturen...", progress: Math.max(prev.progress, pct) }
                : prev);
        }).then(() => {
            if (token !== worldBootTokenRef.current) return;
            worldBootStatusRef.current.preloadDone = true;
                setWorldBootState((prev) => prev.active
                ? { ...prev, label: mode === "multi" ? "Warte auf Lobby-Sync (WebSocket)…" : "Lade Farmdaten...", progress: Math.max(prev.progress, 76) }
                : prev);
            tryCompleteWorldBoot(token);
        }).catch(() => {
            if (token !== worldBootTokenRef.current) return;
            worldBootStatusRef.current.preloadDone = true;
            tryCompleteWorldBoot(token);
        });
    }, [preloadCriticalAssets, tryCompleteWorldBoot]);

    const playRotationSound = useCallback(() => {
        const now = Date.now();
        if (now - lastRotationSoundRef.current < 500) return;
        lastRotationSoundRef.current = now;
        playSound("rotation", 0.05);
    }, [playSound]);

    const announceRotation = useCallback((msg) => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        setRotationBanners((prev) => [...prev.slice(-4), { id, msg }]);
        playRotationSound();
        const tid = setTimeout(() => {
            rotationBannerTimeoutsRef.current.delete(tid);
            setRotationBanners((prev) => prev.filter((b) => b.id !== id));
        }, 3200);
        rotationBannerTimeoutsRef.current.add(tid);
    }, [playRotationSound]);

    const activateInteractable = useCallback((target) => {
        if (!target) return;
        playSound("open", 0.4);
        if (target.type === "market") {
            sellAllRef.current();
        } else if (target.type === "seed") {
            setActiveShop("seed");
        } else if (target.type === "tool") {
            setActiveShop("tool");
        } else if (target.type === "egg") {
            setActiveShop("egg");
        } else if (target.type === "deco") {
            setActiveShop("deco");
        } else if (target.type === "mailbox") {
            setMailboxTargetId(target.targetId);
            setMailboxOpen(true);
        } else if (target.type === "petMarket") {
            sellPetRef.current();
        } else if (target.type === "incubator") {
            setIncubatorTargetSlot(null);
            setIncubatorOpen(true);
        }
    }, []);

    const teleportToMyFarm = useCallback(() => {
        const slot = layout.current.slots[mySlotRef.current] || layout.current.slots[0];
        const p = engineRef.current.player;
        p.x = slot.x + MAP_CONFIG.territoryWidth / 2;
        p.y = slot.anchorY - 22;
        p.vx = 0;
        p.vy = 0;
    }, []);

    const teleportToShopArea = useCallback(() => {
        const p = engineRef.current.player;
        const area = engineRef.current.areas.seedShop;
        p.x = area.x + 120;
        p.y = area.y + 180;
        p.vx = 0;
        p.vy = 0;
    }, []);

    const teleportToMarketArea = useCallback(() => {
        const p = engineRef.current.player;
        const area = engineRef.current.areas.market;
        p.x = area.x;
        p.y = area.y + 90;
        p.vx = 0;
        p.vy = 0;
    }, []);

    const setShopRotationIfChanged = useCallback((nextRotation) => {
        setShopRotation((prev) => {
            const prevGen = Number(prev?.generatedAt || 0);
            const nextGen = Number(nextRotation?.generatedAt || 0);
            if (prevGen && nextGen && prevGen === nextGen) return prev;
            return nextRotation || null;
        });
    }, []);

    const apiCall = useCallback(async (path, options = {}) => {
        const res = await fetch(`/api/garden${path}`, {
            credentials: "include",
            headers: {
                "Content-Type": "application/json",
                ...(options.headers || {}),
            },
            ...options,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "API Fehler");
        return data;
    }, []);

    const loadPublicLobbies = useCallback(async () => {
        try {
            const data = await apiCall("/lobbies");
            setPublicLobbies(data.lobbies || []);
        } catch {
            setPublicLobbies([]);
        }
    }, [apiCall]);

    useEffect(() => {
        if (showLobbyScreen) return;

        const assetSet = new Set([
            "/garden-assets/common/planted_seed.png",
            "/garden-assets/atlas/garden_atlas.png",
            "/garden-assets/world/mailbox.png",
            ...Object.values(AREA_IMAGES),
            ...Object.values(TOOL_IMAGE_BY_KEY),
            ...TERRAIN_ASSET_IMAGES,
            ...Object.values(PET_IMAGE_BY_TYPE),
            ...DECO_SHOP_ITEMS.map((item) => item.image),
            ...EGG_SHOP_CATALOGUE.map((item) => item.image), // HINZUGEFÜGT
            ...WARDROBE_SKINS.map((item) => item.skin).filter(Boolean),
        ]);
        const enqueueItem = (item) => {
            for (const path of collectVisualAssetPaths(withVisuals(item))) {
                assetSet.add(path);
            }
        };

        for (const item of inventory.slice(0, 120)) enqueueItem(item);
        for (const item of harvestedItems.slice(0, 120)) enqueueItem(item);
        for (const plant of Object.values(plotPlants).slice(0, 180)) enqueueItem(plant);
        for (const deco of decoInventory.slice(0, 120)) enqueueItem(deco);
        for (const deco of decoPlacements.slice(0, 200)) enqueueItem(deco);
        
        // HINZUGEFÜGT:
        for (const egg of eggInventory.slice(0, 120)) enqueueItem(egg);
        for (const pet of petInventory.slice(0, 120)) enqueueItem(pet);
        for (const pet of petPlacements.slice(0, 120)) enqueueItem(pet);

        const pending = [...assetSet].filter((src) => !preloadedAssetsRef.current.has(src));
        if (!pending.length) return;

        const hasRIC = typeof window !== "undefined" && typeof window.requestIdleCallback === "function";
        const hasCancelRIC = typeof window !== "undefined" && typeof window.cancelIdleCallback === "function";
        let cancelled = false;
        let idleId = null;
        let timeoutId = null;

        const step = (deadline) => {
            if (cancelled) return;
            let loaded = 0;
            const canContinue = () => {
                if (!deadline) return loaded < 14;
                if (typeof deadline.timeRemaining === "function") return deadline.timeRemaining() > 3 && loaded < 20;
                return loaded < 16;
            };
            while (pending.length && canContinue()) {
                preloadImage(pending.shift());
                loaded += 1;
            }
            if (!pending.length || cancelled) return;
            if (hasRIC) idleId = window.requestIdleCallback(step, { timeout: 120 });
            else timeoutId = window.setTimeout(() => step(null), 20);
        };

        if (hasRIC) idleId = window.requestIdleCallback(step, { timeout: 120 });
        else timeoutId = window.setTimeout(() => step(null), 0);

        return () => {
            cancelled = true;
            if (idleId !== null && hasCancelRIC) window.cancelIdleCallback(idleId);
            if (timeoutId !== null) clearTimeout(timeoutId);
        };
    }, [showLobbyScreen, inventory, harvestedItems, plotPlants, decoInventory, decoPlacements, preloadImage]);

    // Shop-Rotation: nur fehlende Samen-Icons einzeln warm laden (kein Abbruch des übrigen Idle-Preloads)
    useEffect(() => {
        if (showLobbyScreen) return;
        if (!shopRotation?.seeds?.length) return;
        const t = requestAnimationFrame(() => {
            for (const seed of shopRotation.seeds) {
                for (const path of collectVisualAssetPaths(withVisuals(seed))) {
                    if (path && !preloadedAssetsRef.current.has(path)) preloadImage(path);
                }
            }
        });
        return () => cancelAnimationFrame(t);
    }, [showLobbyScreen, shopRotation?.generatedAt, shopRotation, preloadImage]);

    // ── Effects ───────────────────────────────────────────────────────────────
    useEffect(() => {
        if (twitchUser) {
            setAuthUser(twitchUser);
            return;
        }
        const loadAuth = async () => {
            try {
                const res = await fetch("/api/auth/me", { credentials: "include" });
                if (!res.ok) return;
                const me = await res.json();
                setAuthUser(me);
            } catch {
                // ignore
            }
        };
        loadAuth();
    }, [twitchUser]);

    useEffect(() => {
        if (showLobbyScreen) return;
        const loadFarm = async () => {
            const applyServerState = (saved) => {
                if (!saved || typeof saved !== "object" || (saved.gold === undefined && !saved.inventory)) return false;
                console.log("Lade Spielstand von Datenbank...");
                if (typeof saved.gold === "number") setGold(saved.gold);
                if (Array.isArray(saved.inventory)) setInventory(saved.inventory);
                if (saved.plotPlants) setPlotPlants(normalizePlotPlantsMap(saved.plotPlants));
                const unlocked = resolvePlotUnlockedCells(saved, true);
                setPlotUnlockedCells(unlocked);
                setPlotExpansions(Math.min(MAX_PLOT_EXPANSIONS, Math.ceil(unlocked.length / BASE_DIRT_COLS)));
                if (Array.isArray(saved.harvestedItems)) setHarvestedItems(saved.harvestedItems);
                if (Array.isArray(saved.eggInventory)) setEggInventory(saved.eggInventory);
                if (Array.isArray(saved.petInventory)) setPetInventory(saved.petInventory);
                if (Array.isArray(saved.petPlacements)) setPetPlacements(saved.petPlacements);
                if (Array.isArray(saved.decoInventory)) setDecoInventory(saved.decoInventory);
                if (Array.isArray(saved.decoPlacements)) setDecoPlacements(saved.decoPlacements);
                if (saved.toolInventory) setToolInventory(normalizeToolInventory(saved.toolInventory));
                if (typeof saved.inventoryMaxSlots === "number") setInventoryMaxSlots(Math.max(50, saved.inventoryMaxSlots));
                if (saved.shopStock && typeof saved.shopStock === "object" && Object.keys(saved.shopStock).length > 0) {
                    savedShopStockRef.current = {
                        stock: saved.shopStock,
                        version: typeof saved.shopStockVersion === "number" ? saved.shopStockVersion : 0,
                    };
                }
                if (saved.toolShopStock && typeof saved.toolShopStock === "object" && Object.keys(saved.toolShopStock).length > 0) {
                    savedToolShopStockRef.current = {
                        stock: saved.toolShopStock,
                        version: typeof saved.toolShopStockVersion === "number" ? saved.toolShopStockVersion : 0,
                    };
                }
                if (saved.eggShopStock && typeof saved.eggShopStock === "object" && Object.keys(saved.eggShopStock).length > 0) {
                    savedEggShopStockRef.current = {
                        stock: saved.eggShopStock,
                        version: typeof saved.eggShopStockVersion === "number" ? saved.eggShopStockVersion : 0,
                    };
                }
                if (saved.incubator) setIncubator(saved.incubator);
                if (saved.appearance) setPlayerAppearance(saved.appearance); // 🌟 NEU
                if (typeof saved.tutorialCompleted === "boolean") setTutorialCompleted(saved.tutorialCompleted);
                if (Array.isArray(saved.mailbox)) setMailbox(saved.mailbox);
                return true;
            };

            try {
                const data = await apiCall("/farm-state");
                applyServerState(data.state);
            } catch (err) {
                console.error("Fehler beim Laden von der DB:", err);
                const m = err?.message || "";
                if (m.includes("Nicht eingeloggt") || m.includes("Session") || m.includes("ungültig") || m.includes("abgelaufen")) {
                    notify("Garden: Bitte mit Twitch anmelden (gültige Session erforderlich).", "error");
                }
            }
            setIsInitialLoadDone(true);
            if (!isMultiplayer) markWorldBootDataReady("single");
        };
        loadFarm();
    }, [showLobbyScreen, apiCall, isMultiplayer, markWorldBootDataReady, normalizePlotPlantsMap, notify]);

    useEffect(() => {
        const savedApp = localStorage.getItem("garden_appearance");
        if (savedApp) {
            try { setPlayerAppearance(JSON.parse(savedApp)); } catch {}
        }
    }, []);

    useEffect(() => {
        if (layout.current && layout.current.slots[mySlotRef.current]) {
            layout.current.slots[mySlotRef.current].hasMail = mailbox.length > 0;
        }
    }, [mailbox]);

    useEffect(() => {
        localStorage.setItem("garden_appearance", JSON.stringify(playerAppearance));
    }, [playerAppearance]);

    useEffect(() => {
        if (showLobbyScreen) return;
        if (!isInitialLoadDone) return;
        // Multiplayer: Server führt. Singleplayer: Server-Persist via API (5s debounce, Twitch-Session nötig).
        const payload = {
            gold, inventory, plotPlants, plotExpansions, plotUnlockedCells, harvestedItems,
            eggInventory, petInventory, petPlacements, decoInventory, decoPlacements,
            toolInventory, inventoryMaxSlots, incubator,
            shopStock: personalShopStock,
            shopStockVersion: shopRotation?.generatedAt,
            toolShopStock: toolShopStock,
            toolShopStockVersion: toolShopRotation?.generatedAt,
            eggShopStock: eggShopStock,
            eggShopStockVersion: eggShopRotation?.generatedAt,
            appearance: playerAppearance,
            tutorialCompleted,
        };
        if (isMultiplayer) return;
        const timer = setTimeout(() => {
            apiCall("/farm-state", {
                method: "PUT",
                body: JSON.stringify({ state: payload }),
            }).catch(() => {});
        }, 5000);
        return () => clearTimeout(timer);
    }, [showLobbyScreen, isInitialLoadDone, isMultiplayer, gold, inventory, plotPlants, plotExpansions, plotUnlockedCells, harvestedItems, eggInventory, petInventory, petPlacements, decoInventory, decoPlacements, toolInventory, inventoryMaxSlots, incubator, personalShopStock, shopRotation?.generatedAt,playerAppearance, tutorialCompleted, apiCall]);

    useEffect(() => {
        if (!isIncubatorOpen) return;
        setTickNow(Date.now());
        const t = setInterval(() => setTickNow(Date.now()), 1000);
        return () => clearInterval(t);
    }, [isIncubatorOpen]);

    useEffect(() => () => {
        rotationBannerTimeoutsRef.current.forEach((tid) => clearTimeout(tid));
        rotationBannerTimeoutsRef.current.clear();
        if (shovelHoldTimerRef.current) clearTimeout(shovelHoldTimerRef.current);
        if (shovelHoldProgressRef.current) clearInterval(shovelHoldProgressRef.current);
    }, []);

    useEffect(() => {
        const level = normalizeToolInventory(toolInventory).backpackLevel || 0;
        if (level > 0) {
            setInventoryMaxSlots(prev => Math.max(prev, 50 + level * 10));
        }
        toolInventoryRef.current = toolInventory; // 3. ANPASSUNG
    }, [toolInventory]);

    useEffect(() => {
        selectedToolRef.current = selectedTool;
    }, [selectedTool]);

    useEffect(() => {
        // Nur senden, wenn wir im Multiplayer sind und der Socket existiert
        if (!isMultiplayer || !currentLobbyId || !socketRef.current) return;

        // Herausfinden, welches Item wir gerade wirklich in der Hand halten
        let activeHeldItem = null;
        if (!selectedTool) {
            if (selectedSeed) activeHeldItem = selectedSeed;
            else if (selectedCarryItem) activeHeldItem = selectedCarryItem;
        }

        // An den Server senden
        socketRef.current.emit("player_state_change", {
            tool: selectedTool,
            heldItem: activeHeldItem,
            appearance: playerAppearance,
            badge: playerBadgeRef.current,
        });

    }, [isMultiplayer, currentLobbyId, selectedTool, selectedSeed, selectedCarryItem, playerAppearance]);

    useEffect(() => {
        movingPlantSourceRef.current = movingPlantSource;
    }, [movingPlantSource]);

    useEffect(() => {
        if (selectedTool) {
            heldItemRef.current = null;
            return;
        }
        if (selectedSeed) {
            heldItemRef.current = withVisuals(selectedSeed);
            return;
        }
        // NEU: Deko und Tiere/Eier an den Renderer übergeben!
        if (selectedDecoToPlace) {
            heldItemRef.current = selectedDecoToPlace;
            return;
        }
        if (selectedPetToPlace) {
            heldItemRef.current = selectedPetToPlace;
            return;
        }
        heldItemRef.current = selectedCarryItem ? withVisuals(selectedCarryItem) : null;
    }, [selectedTool, selectedSeed, selectedCarryItem, selectedDecoToPlace, selectedPetToPlace]);

    useEffect(() => {
        if (!selectedCarryItem) return;
        const selectedId = selectedCarryItem.id || selectedCarryItem.instanceId;
        if (!selectedId) return;
        // NEU: Auch im Eier-Inventar suchen, damit sie nicht aus der Hand verschwinden!
        const inHarvested = harvestedItems.some((item) => (item.id || item.instanceId) === selectedId);
        const inEggs = eggInventory.some((item) => (item.id || item.instanceId) === selectedId);
        if (!inHarvested && !inEggs) setSelectedCarryItem(null);
    }, [harvestedItems, eggInventory, selectedCarryItem]);

    useEffect(() => {
        if (!selectedDecoToPlace?.instanceId) return;
        const stillExists = decoInventory.some((item) => item.instanceId === selectedDecoToPlace.instanceId);
        if (!stillExists) setSelectedDecoToPlace(null);
    }, [decoInventory, selectedDecoToPlace]);

    useEffect(() => {
        renderProfileRef.current = renderProfile;
    }, [renderProfile]);

    useEffect(() => {
        weatherStateRef.current = weatherState;
    }, [weatherState]);

    useEffect(() => {
        if (selectedTool === "watering" && (toolInventory.wateringCans || 0) <= 0) {
            setSelectedTool(null);
        }
    }, [selectedTool, toolInventory.wateringCans]);

    useEffect(() => {
        if (selectedTool === "pickaxe" && (toolInventory.pickaxeUses || 0) <= 0) {
            setSelectedTool(null);
        }
    }, [selectedTool, toolInventory.pickaxeUses]);

    useEffect(() => {
        if (selectedTool === "pot" && (toolInventory.plantPots || 0) <= 0) {
            setSelectedTool(null);
            setMovingPlantSource(null);
        }
    }, [selectedTool, toolInventory.plantPots]);

    // ── Personal shop stock helper ────────────────────────────────────────────
    const initPersonalStock = useCallback((rotation) => {
        // If we have a saved stock for this exact rotation version, restore it instead of wiping
        const saved = savedShopStockRef.current;
        if (saved && saved.version === Number(rotation?.generatedAt)) {
            setPersonalShopStock(saved.stock);
            savedShopStockRef.current = null;
            return;
        }
        const stock = {};
        for (const s of rotation?.seeds || []) {
            stock[s.seedId] = s.active ? (s.stockPerPlayer ?? 5) : 0;
        }
        setPersonalShopStock(stock);
    }, []);

    useEffect(() => {
        if (savedShopStockRef.current && shopRotation?.generatedAt) {
            if (savedShopStockRef.current.version === Number(shopRotation.generatedAt)) {
                setPersonalShopStock(savedShopStockRef.current.stock);
            }
            savedShopStockRef.current = null;
        }
    }, [shopRotation?.generatedAt]);

    useEffect(() => {
        if (savedToolShopStockRef.current && toolShopRotation?.generatedAt) {
            if (savedToolShopStockRef.current.version === Number(toolShopRotation.generatedAt)) {
                setToolShopStock(savedToolShopStockRef.current.stock);
            }
            savedToolShopStockRef.current = null;
        }
    }, [toolShopRotation?.generatedAt]);

    useEffect(() => {
        if (savedEggShopStockRef.current && eggShopRotation?.generatedAt) {
            if (savedEggShopStockRef.current.version === Number(eggShopRotation.generatedAt)) {
                setEggShopStock(savedEggShopStockRef.current.stock);
            }
            savedEggShopStockRef.current = null;
        }
    }, [eggShopRotation?.generatedAt]);

    // ── Shop rotation (global backend source for all modes) ──────────────────────
    useEffect(() => {
        if (showLobbyScreen) return;
        if (isMultiplayer) return; // multiplayer gets primary updates via socket events

        let rotationTimer = null;
        const fetchGlobalShop = async () => {
            try {
                const data = await apiCall("/global-shop");
                const now = Date.now();

                setShopRotationIfChanged(data.shopRotation || null);
                const seedGen = data.shopRotation?.generatedAt;
                if (Number(seedGen) !== personalShopSeededForGenAtRef.current) {
                    initPersonalStock(data.shopRotation);
                    personalShopSeededForGenAtRef.current = Number(seedGen);
                }
                const seedKey = String(data.shopRotation?.generatedAt || "");
                if (seedKey && seedRotationKeyRef.current && seedRotationKeyRef.current !== seedKey) {
                    announceRotation("🌱 Samen-Shop hat rotiert!");
                }
                if (seedKey) seedRotationKeyRef.current = seedKey;
                seedNextRotationAtRef.current = Number(data.nextRotation || data.shopRotation?.nextRotation || 0);

                if (data.toolShopRotation) {
                    setToolShopRotation(data.toolShopRotation);
                    const toolKey = String(data.toolShopRotation.generatedAt || "");
                    if (toolKey && toolRotationKeyRef.current && toolRotationKeyRef.current !== toolKey) {
                        announceRotation("🛠️ Tool-Shop neu aufgefüllt!");
                    }
                    if (toolKey) toolRotationKeyRef.current = toolKey;
                    const nextStock = {};
                    for (const item of data.toolShopRotation.items || []) {
                        if (item.type === "single" || item.id === "pickaxe") nextStock[item.id] = item.stock || 0;
                    }
                    setToolShopStock(nextStock);
                    toolNextRotationAtRef.current = Number(data.nextToolRotation || data.toolShopRotation.nextRotation || 0);
                }

                if (data.eggShopRotation) {
                    setEggShopRotation(data.eggShopRotation);
                    const eggKey = String(data.eggShopRotation.generatedAt || "");
                    if (eggKey && eggRotationKeyRef.current && eggRotationKeyRef.current !== eggKey) {
                        announceRotation("🥚 Eier-Shop hat rotiert!");
                    }
                    if (eggKey) eggRotationKeyRef.current = eggKey;
                    const nextEggStock = {};
                    for (const item of data.eggShopRotation.items || []) {
                        nextEggStock[item.id] = item.stock || 0;
                    }
                    setEggShopStock(nextEggStock);
                    eggNextRotationAtRef.current = Number(data.nextEggRotation || data.eggShopRotation.nextRotation || 0);
                }

                setShopCountdown(Math.max(0, seedNextRotationAtRef.current - now));
                setToolShopCountdown(Math.max(0, toolNextRotationAtRef.current - now));
                setEggShopCountdown(Math.max(0, eggNextRotationAtRef.current - now));

                const nextTimerMs = Math.max(1500, Math.min(
                    ...[
                        seedNextRotationAtRef.current,
                        toolNextRotationAtRef.current,
                        eggNextRotationAtRef.current,
                    ].filter(Boolean).map(ts => Math.max(0, ts - now)),
                    30_000
                ));
                rotationTimer = setTimeout(fetchGlobalShop, nextTimerMs + 200);
            } catch {
                // Keep current rotation/timer on transient API failures to avoid
                // premature weather/shop jumps and visible UI flashing.
                if (!shopRotation?.generatedAt) {
                    const fallback = generateShopRotation(8);
                    setShopRotationIfChanged(fallback);
                    initPersonalStock(fallback);
                    personalShopSeededForGenAtRef.current = Number(fallback.generatedAt);
                    seedNextRotationAtRef.current = Date.now() + SHOP_ROTATION_MS;
                    setShopCountdown(SHOP_ROTATION_MS);
                }
                rotationTimer = setTimeout(fetchGlobalShop, 5000);
            }
        };
        fetchGlobalShop();
        return () => clearTimeout(rotationTimer);
    }, [isMultiplayer, showLobbyScreen, apiCall, initPersonalStock, announceRotation, setShopRotationIfChanged]);

    useEffect(() => {
        if (showLobbyScreen) return;
        if (shopRotation?.seeds?.length) return;
        apiCall("/global-shop")
            .then((data) => {
                if (!data?.shopRotation) return;
                setShopRotationIfChanged(data.shopRotation);
                const now = Date.now();
                if (!isMultiplayer) {
                    const seedGen = data.shopRotation?.generatedAt;
                    if (Number(seedGen) !== personalShopSeededForGenAtRef.current) {
                        initPersonalStock(data.shopRotation);
                        personalShopSeededForGenAtRef.current = Number(seedGen);
                    }
                }
                seedNextRotationAtRef.current = Number(data.nextRotation || data.shopRotation?.nextRotation || 0);
                if (data.toolShopRotation) {
                    setToolShopRotation(data.toolShopRotation);
                    toolNextRotationAtRef.current = Number(data.nextToolRotation || data.toolShopRotation?.nextRotation || 0);
                }
                if (data.eggShopRotation) {
                    setEggShopRotation(data.eggShopRotation);
                    eggNextRotationAtRef.current = Number(data.nextEggRotation || data.eggShopRotation?.nextRotation || 0);
                }
                setShopCountdown(Math.max(0, seedNextRotationAtRef.current - now));
                setToolShopCountdown(Math.max(0, toolNextRotationAtRef.current - now));
                setEggShopCountdown(Math.max(0, eggNextRotationAtRef.current - now));
            })
            .catch(() => {});
    }, [showLobbyScreen, isMultiplayer, shopRotation, apiCall, initPersonalStock, setShopRotationIfChanged]);

    useEffect(() => {
        if (showLobbyScreen) return;
        if (!shopRotation?.generatedAt) return;
        const rotationKey = String(shopRotation.generatedAt);
        const nextWeather = rollWeatherFromRotation(rotationKey);
        setWeatherState((prev) => {
            if (prev.type === nextWeather.type && prev.label === nextWeather.label && prev.startedAt === Number(rotationKey)) return prev;
            if (nextWeather.type === "rain") playSound("rain", 0.4);
            else if (nextWeather.type === "thunder") playSound("thunder", 0.5);
            return {
                ...nextWeather,
                intensity: 0.05,
                startedAt: Number(rotationKey) || Date.now(),
            };
        });
    }, [showLobbyScreen, shopRotation?.generatedAt, notify, playSound]);

    useEffect(() => {
        if (showLobbyScreen) return undefined;
        if (!weatherState || weatherState.type === "sun" || weatherState.intensity >= 1) return undefined;
        const timer = setInterval(() => {
            setWeatherState((prev) => {
                if (!prev || prev.type === "sun" || prev.intensity >= 1) return prev;
                return { ...prev, intensity: Math.min(1, (Number(prev.intensity) || 0) + 0.16) };
            });
        }, 120);
        return () => clearInterval(timer);
    }, [showLobbyScreen, weatherState?.type]);

    useEffect(() => {
        if (showLobbyScreen) return undefined;
        const effectType =
            weatherState?.type === "rain" ? "wet"
                : weatherState?.type === "snow" ? "frozen"
                    : weatherState?.type === "thunder" ? "charged"
                        : weatherState?.type === "moonlight" ? "moonlit"
                            : null;
        const interval = setInterval(() => {
            const now = Date.now();
            setPlotPlants((prev) => {
                let changed = false;
                const next = { ...prev };
                for (const [key, plant] of Object.entries(prev)) {
                    if (!plant) continue;
                    const canReceiveEffect = isPlantReady(plant);
                    const currentUntil = Number(plant.statusEffectUntil || 0);
                    const expired = currentUntil > 0 && currentUntil <= now;
                    const rollApply = Boolean(effectType) && canReceiveEffect && Math.random() < 0.05; // low chance per minute
                    const shouldClearBecauseNotHarvestable = !canReceiveEffect && Boolean(plant.statusEffect || plant.statusEffectUntil);
                    if (!expired && !rollApply && !shouldClearBecauseNotHarvestable) continue;
                    changed = true;
                    if (rollApply) {
                        next[key] = {
                            ...plant,
                            statusEffect: effectType,
                            statusEffectUntil: now + 4 * 60 * 1000,
                        };
                    } else if (expired) {
                        next[key] = {
                            ...plant,
                            statusEffect: null,
                            statusEffectUntil: null,
                        };
                    } else if (shouldClearBecauseNotHarvestable) {
                        next[key] = {
                            ...plant,
                            statusEffect: null,
                            statusEffectUntil: null,
                        };
                    }
                }
                return changed ? next : prev;
            });
        }, 60 * 1000);
        return () => clearInterval(interval);
    }, [showLobbyScreen, weatherState]);

    // Multiplayer fallback: poll all shops while one countdown is near/at 0.
    useEffect(() => {
        if (showLobbyScreen || !isMultiplayer) return undefined;
        const tick = () => {
            if (Math.min(shopCountdown, toolShopCountdown, eggShopCountdown) > 3000) return;
            const now = Date.now();
            if (now - lastMpShopPollRef.current < 3500) return;
            lastMpShopPollRef.current = now;
            apiCall("/global-shop")
                .then((data) => {
                    if (!data?.shopRotation) return;
                    const seedKey = String(data.shopRotation.generatedAt || "");
                    if (seedKey && seedRotationKeyRef.current && seedRotationKeyRef.current !== seedKey) {
                        announceRotation("🌱 Samen-Shop hat rotiert!");
                    }
                    if (seedKey) seedRotationKeyRef.current = seedKey;
                    setShopRotationIfChanged(data.shopRotation);
                    // Persönlichen Samen-Vorrat hält der Server; hier nur Katalog/Countdown aktualisieren
                    seedNextRotationAtRef.current = Number(data.nextRotation || data.shopRotation?.nextRotation || 0);

                    if (data.toolShopRotation) {
                        const toolKey = String(data.toolShopRotation.generatedAt || "");
                        if (toolKey && toolRotationKeyRef.current && toolRotationKeyRef.current !== toolKey) {
                            announceRotation("🛠️ Tool-Shop neu aufgefüllt!");
                        }
                        if (toolKey) toolRotationKeyRef.current = toolKey;
                        setToolShopRotation(data.toolShopRotation);
                        toolNextRotationAtRef.current = Number(data.nextToolRotation || data.toolShopRotation.nextRotation || 0);
                    }
                    if (data.eggShopRotation) {
                        const eggKey = String(data.eggShopRotation.generatedAt || "");
                        if (eggKey && eggRotationKeyRef.current && eggRotationKeyRef.current !== eggKey) {
                            announceRotation("🥚 Eier-Shop hat rotiert!");
                        }
                        if (eggKey) eggRotationKeyRef.current = eggKey;
                        setEggShopRotation(data.eggShopRotation);
                        eggNextRotationAtRef.current = Number(data.nextEggRotation || data.eggShopRotation.nextRotation || 0);
                    }
                })
                .catch(() => {});
        };
        tick();
        const interval = setInterval(tick, 1200);
        return () => clearInterval(interval);
    }, [showLobbyScreen, isMultiplayer, shopCountdown, toolShopCountdown, eggShopCountdown, apiCall, announceRotation, setShopRotationIfChanged]);

    // Universal countdown from absolute next-rotation timestamps
    useEffect(() => {
        if (showLobbyScreen) return;
        const interval = setInterval(() => {
            const now = Date.now();
            setShopCountdown(Math.max(0, seedNextRotationAtRef.current - now));
            setToolShopCountdown(Math.max(0, toolNextRotationAtRef.current - now));
            setEggShopCountdown(Math.max(0, eggNextRotationAtRef.current - now));
        }, 1000);
        return () => clearInterval(interval);
    }, [showLobbyScreen]);

    useEffect(() => {
        if (showLobbyScreen) return undefined;
        const onKeyDown = (e) => {
            const target = e.target;
            const tag = (target?.tagName || "").toLowerCase();
            if (tag === "input" || tag === "textarea" || target?.isContentEditable) return;

            if (e.key === "Tab") {
                e.preventDefault();
                setBackpackOpen(true);
                return;
            }
            
            // 3. ANPASSUNG: Tool-Auswahl mit den Tasten 1, 2, 3, 4 (Ohne Shift)
            if (!e.shiftKey && !e.repeat) {
                const inv = toolInventoryRef.current || {};
                const equip = (key) => {
                    setSelectedSeed(null);
                    setSelectedPetToPlace(null);
                    setSelectedDecoToPlace(null);
                    setSelectedCarryItem(null);
                    setSelectedTool(prev => (prev === key ? null : key));
                    if (key !== "pot") setMovingPlantSource(null);
                };

                if (e.code === "Digit1" && inv.hasShovel) equip("shovel");
                if (e.code === "Digit2" && (inv.plantPots || 0) > 0) equip("pot");
                if (e.code === "Digit3" && (inv.pickaxeUses || 0) > 0) equip("pickaxe");
                if (e.code === "Digit4" && (inv.wateringCans || 0) > 0) equip("watering");
            }

            if (!e.shiftKey || e.repeat) return;
            if (e.code === "Digit1") {
                e.preventDefault();
                teleportToMarketArea();
            } else if (e.code === "Digit2") {
                e.preventDefault();
                teleportToShopArea();
            } else if (e.code === "Digit3") {
                e.preventDefault();
                teleportToMyFarm();
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [showLobbyScreen, teleportToMyFarm, teleportToShopArea, teleportToMarketArea]);


    // ── Main game loop ─────────────────────────────────────────────────────────
    useEffect(() => {
        if (showLobbyScreen) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        const onResize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
        window.addEventListener("resize", onResize);

        const engine = engineRef.current;
        if (engine.input && typeof engine.input.destroy === "function") {
            engine.input.destroy();
        }
        engine.input = new InputHandler();
        engine.renderer = new Renderer(canvas);
        

        let animFrame;
        let lastFrameTs = performance.now();
        const frameDuration = 1000 / TARGET_FPS;
        const gameLoop = () => {
            const l = layout.current;
            const now = performance.now();
            if (now - lastFrameTs < frameDuration) {
                animFrame = requestAnimationFrame(gameLoop);
                return;
            }
            const frameMs = Math.max(1, now - lastFrameTs);
            const deltaFactor = Math.min(2.5, frameMs / (1000 / 60));
            lastFrameTs = now;

            const { input, renderer, player } = engine;
            input.update(); // flush key events

            // ── SMOOTH MOVEMENT ──────────────────────────────────────────────//
            const { dx, dy } = input.getMovement();
            const isMoving = dx !== 0 || dy !== 0;
            player.isMoving = isMoving;

            // 🌟 NEU: Blickrichtung anhand des Inputs speichern
            if (dx > 0) player.facingRight = true;
            else if (dx < 0) player.facingRight = false;

            // Apply velocity with smooth acceleration
            const targetVX = dx * PLAYER_SPEED;
            const targetVY = dy * PLAYER_SPEED;
            const lerp = 1 - Math.pow(1 - 0.25, deltaFactor);
            player.vx += (targetVX - player.vx) * lerp;
            player.vy += (targetVY - player.vy) * lerp;

            // Zero out tiny residual velocity (prevents drift)
            if (Math.abs(player.vx) < 0.05) player.vx = 0;
            if (Math.abs(player.vy) < 0.05) player.vy = 0;

            // Apply movement
            let nextX = player.x + player.vx * deltaFactor;
            let nextY = player.y + player.vy * deltaFactor;

            // World boundary clamp
            const margin = 20;
            nextX = Math.max(margin, Math.min(l.worldWidth - margin, nextX));
            nextY = Math.max(margin, Math.min(l.worldHeight - margin, nextY));
            
            // 1. ANPASSUNG: Größere Kollisionsradien für die Gebäude
            const collisionRadiusByType = {
                seed: 130,
                tool: 130,
                egg: 130,
                deco: 130,
                market: 130,
                petMarket: 115,
                incubator: 65,
            };
            for (const area of Object.values(engine.areas || {})) {
                const minDist = collisionRadiusByType[area?.type];
                if (!minDist) continue;
                const dxToPlayer = nextX - area.x;
                const dyToPlayer = nextY - area.y;
                const dist = Math.hypot(dxToPlayer, dyToPlayer) || 0.0001;
                if (dist >= minDist) continue;
                const scale = minDist / dist;
                nextX = area.x + dxToPlayer * scale;
                nextY = area.y + dyToPlayer * scale;
            }
            player.x = nextX;
            player.y = nextY;
            if (isMultiplayer && currentLobbyId && socketRef.current && now - lastMoveEmitRef.current > 50) {
                socketRef.current.emit("player_move", { x: player.x, y: player.y, facingRight: player.facingRight });
                lastMoveEmitRef.current = now;
            }

            // ── INTERACTION PROXIMITY + E/SPACE ─────────────────────────────
            let nearest = null;
            for (const area of Object.values(engine.areas)) {
                const dist = Math.hypot(player.x - area.x, player.y - area.y);
                if (dist < INTERACT_DIST && (!nearest || dist < nearest.dist)) {
                    nearest = { ...area, dist };
                }
            }
            
            // Check Mailboxes
            for (const slot of l.slots) {
                if (!slot.ownerId) continue;
                const centerX = slot.x + (MAP_CONFIG.territoryWidth / 2);
                const centerY = slot.isTopRow ? slot.anchorY - 52 : slot.anchorY + 8;
                
                // Calculate actual mailbox dimensions based on aspect ratio
                const mbImg = renderer._getImage("/garden-assets/world/mailbox.png");
                const mbWidth = 40;
                let mbHeight = 48; // default
                if (mbImg) {
                    const imgRatio = mbImg.width / mbImg.height;
                    mbHeight = mbWidth / imgRatio;
                }
                
                const mbX = centerX + 90 + 20; // w/2 + 20
                const mbY = centerY + 36 / 2 - mbHeight + 10;
                
                const dist = Math.hypot(player.x - (mbX + mbWidth/2), player.y - (mbY + mbHeight/2));
                
                slot.showMailboxPrompt = dist < INTERACT_DIST;
                
                if (dist < INTERACT_DIST && (!nearest || dist < nearest.dist)) {
                    nearest = { type: "mailbox", targetId: slot.ownerId, label: "Briefkasten", dist };
                }
            }
            
            const nearestType = nearest?.type || null;
            setCurrentInteractable(prev => (prev?.type === nearestType && prev?.targetId === nearest?.targetId ? prev : nearest));
            if (nearest && (input.wasJustPressed("e") || input.wasJustPressed(" "))) {
                if (nearest.type === "mailbox") {
                    setMailboxTargetId(nearest.targetId);
                    setMailboxOpen(true);
                } else {
                    activateInteractable(nearest);
                }
            }

            const ownSlot = l.slots[mySlotRef.current] || l.slots[0];
            if (ownSlot && Array.isArray(engine.petPlacements) && engine.petPlacements.length > 0) {
                const drawY = ownSlot.isTopRow ? ownSlot.anchorY - MAP_CONFIG.territoryHeight : ownSlot.anchorY;
                const minX = ownSlot.x + 30;
                const maxX = ownSlot.x + MAP_CONFIG.territoryWidth - 30;
                const minY = drawY + 30;
                const maxY = drawY + MAP_CONFIG.territoryHeight - 30;
                for (const pet of engine.petPlacements) {
                    if (!pet || pet.slotIndex !== mySlotRef.current) continue;
                    if (!Number.isFinite(pet.x) || !Number.isFinite(pet.y)) {
                        pet.x = (minX + maxX) / 2;
                        pet.y = (minY + maxY) / 2;
                    }
                    if (!Number.isFinite(pet.vx) || !Number.isFinite(pet.vy) || now >= (pet.changeDirAt || 0)) {
                        const angle = Math.random() * Math.PI * 2;
                        const speed = 0.55 + Math.random() * 0.9;
                        pet.vx = Math.cos(angle) * speed;
                        pet.vy = Math.sin(angle) * speed;
                        pet.changeDirAt = now + 1400 + Math.random() * 2200;
                        
                        // 🌟 NEU: Blickrichtung anhand der neuen Geschwindigkeit
                        if (pet.vx > 0) pet.facingRight = true;
                        else if (pet.vx < 0) pet.facingRight = false;
                    }
                    pet.x += pet.vx * deltaFactor;
                    pet.y += pet.vy * deltaFactor;
                    if (pet.x < minX || pet.x > maxX) {
                        pet.vx *= -1;
                        pet.x = Math.max(minX, Math.min(maxX, pet.x));
                        pet.facingRight = pet.vx > 0; // 🌟 NEU: Beim Abprallen umdrehen
                    }
                    if (pet.y < minY || pet.y > maxY) {
                        pet.vy *= -1;
                        pet.y = Math.max(minY, Math.min(maxY, pet.y));
                    }
                }
            }

            // Stauden: Struktur→Wachstum nur hier (nicht im Renderer) mutieren
            const wallNow = Date.now();
            if (engine.plotPlants) {
                for (const p of Object.values(engine.plotPlants)) {
                    if (p && !p.singleUse) ensurePerennialFruitingState(p, wallNow);
                }
            }

            // Remote-Spieler: Interpolation zu Batch-Zielen (Server 20 Hz)
            if (isMultiplayer) {
                const rmap = remotePlayersRef.current;
                const tmap = remotePlayerTargetsRef.current;
                const lerpAm = 0.28;
                for (const pid of Object.keys(rmap)) {
                    const pl = rmap[pid];
                    const tgt = tmap[pid];
                    if (!pl || !tgt) continue;
                    pl.x = pl.x + (tgt.x - pl.x) * lerpAm;
                    pl.y = pl.y + (tgt.y - pl.y) * lerpAm;
                    if (tgt.facingRight !== undefined) pl.facingRight = tgt.facingRight; // 🌟 NEU
                }
            }

            // ── RENDER ───────────────────────────────────────────────────────
            // Inject live plant data into slots
            const myPlotSlotIndex = mySlotRef.current;
            const slots = l.slots.map((slot, i) => {
                if (i === myPlotSlotIndex) {
                    const visiblePlants = { ...engine.plotPlants };
                    // 1. ANPASSUNG: Pflanze während dem Umtopfen vom Feld ausblenden
                    if (movingPlantSourceRef.current && selectedToolRef.current === "pot") {
                        delete visiblePlants[movingPlantSourceRef.current];
                    }
                    return {
                        ...slot,
                        plants: visiblePlants,
                        currentExpansions: plotExpansionsRef.current,
                        unlockedCells: plotUnlockedCellsRef.current,
                    };
                }
                return slot;
            });

            // 1. & 2. ANPASSUNG: Welches Item wird gerade in der Hand gehalten?
            let activeHeldItem = heldItemRef.current;
            if (selectedToolRef.current === "pot" && movingPlantSourceRef.current) {
                // Wenn wir umtopfen, lege die echte Pflanze vom Acker als aktives Item in die Hand
                const p = engine.plotPlants[movingPlantSourceRef.current];
                if (p) activeHeldItem = p;
            }

            renderer.draw({
                areas: engine.areas,
                readyEggsCount: readyEggsCount,
                layout: { ...l, slots },
                zoom: 1,
                selectedTool: selectedToolRef.current,
                heldItem: activeHeldItem, // Hier übergeben wir das frisch berechnete Item
                weather: weatherStateRef.current,
                renderProfile: renderProfileRef.current,
                petPlacements: engine.petPlacements,
                decoPlacements: engine.decoPlacements,
                harvestFlashes: harvestFlashesRef.current,
                remotePlayers: Object.values(remotePlayersRef.current),
                localPlayerName: localPlayerNameRef.current,
                playerAppearance: appearanceRef.current,
                playerBadge: playerBadgeRef.current,
            }, player);

            animFrame = requestAnimationFrame(gameLoop);
        };

        gameLoop();
        return () => {
            cancelAnimationFrame(animFrame);
            window.removeEventListener("resize", onResize);
            try {
                if (engineRef.current?.input && typeof engineRef.current.input.destroy === "function") {
                    engineRef.current.input.destroy();
                }
            } catch { /* */ }
        };
    }, [showLobbyScreen, isMultiplayer, currentLobbyId, activateInteractable]);

    // Sync plotPlants into engine ref (avoids stale closure in game loop)
    useEffect(() => {
        engineRef.current.plotPlants = plotPlants;
    }, [plotPlants]);

    useEffect(() => {
        engineRef.current.petPlacements = Array.isArray(petPlacements)
            ? petPlacements.map((pet, idx) => ({
                id: pet.id || `pet_${idx}`,
                ...pet,
                emoji: pet.emoji || getPetEmoji(pet.name),
                image: pet.image || buildPetPreviewImage(pet.name, pet.emoji || getPetEmoji(pet.name)),
                slotIndex: Number.isInteger(pet.slotIndex) ? pet.slotIndex : mySlotIndex,
            }))
            : [];
    }, [petPlacements, mySlotIndex]);

    useEffect(() => {
        engineRef.current.decoPlacements = Array.isArray(decoPlacements)
            ? decoPlacements.map((deco, idx) => ({
                id: deco.id || `deco_${idx}`,
                ...deco,
                slotIndex: Number.isInteger(deco.slotIndex) ? deco.slotIndex : mySlotIndex,
            }))
            : [];
    }, [decoPlacements, mySlotIndex]);

    useEffect(() => {
        const idx = mySlotIndex;
        if (layout.current.slots[idx]) {
            layout.current.slots[idx].currentExpansions = Math.max(0, Math.min(MAX_PLOT_EXPANSIONS, plotExpansions));
            layout.current.slots[idx].unlockedCells = normalizePlotUnlockedCells(plotUnlockedCells);
        }
        plotExpansionsRef.current = Math.max(0, Math.min(MAX_PLOT_EXPANSIONS, plotExpansions));
        plotUnlockedCellsRef.current = normalizePlotUnlockedCells(plotUnlockedCells);
    }, [plotExpansions, plotUnlockedCells, mySlotIndex]);

    // Keep farmStateRef up-to-date for socket cleanup
    useEffect(() => {
        farmStateRef.current = {
            gold, inventory, plotPlants, plotExpansions, plotUnlockedCells, harvestedItems,
            eggInventory, petInventory, petPlacements, decoInventory, decoPlacements,
            toolInventory, inventoryMaxSlots, incubator,
            shopStock: personalShopStock,
            shopStockVersion: shopRotation?.generatedAt,
            toolShopStock: toolShopStock,
            toolShopStockVersion: toolShopRotation?.generatedAt,
            eggShopStock: eggShopStock,
            eggShopStockVersion: eggShopRotation?.generatedAt,
            appearance: playerAppearance,
            tutorialCompleted,
        };
    }, [gold, inventory, plotPlants, plotExpansions, plotUnlockedCells, harvestedItems, eggInventory, petInventory, petPlacements, decoInventory, decoPlacements, toolInventory, inventoryMaxSlots, incubator, personalShopStock, shopRotation?.generatedAt, toolShopStock, toolShopRotation?.generatedAt, eggShopStock, eggShopRotation?.generatedAt, playerAppearance, tutorialCompleted]);

    const buildMpUpdateFarmBody = () => {
        const s = farmStateRef.current;
        return {
            gold: s.gold,
            harvestedItems: s.harvestedItems ?? [],
            eggInventory: s.eggInventory ?? [],
            petInventory: s.petInventory ?? [],
            petPlacements: s.petPlacements ?? [],
            decoInventory: s.decoInventory ?? [],
            decoPlacements: s.decoPlacements ?? [],
            incubator: s.incubator,
            toolInventory: s.toolInventory,
            inventoryMaxSlots: s.inventoryMaxSlots,
            plotExpansions: s.plotExpansions,
            plotUnlockedCells: s.plotUnlockedCells ?? [],
            appearance: s.appearance,
            tutorialCompleted: s.tutorialCompleted,
        };
    };

    const postMpUpdateFarm = useCallback(() => {
        if (!isMultiplayer || !currentLobbyId || showLobbyScreen) return;
        apiCall(`/lobby/${currentLobbyId}/update-farm`, {
            method: "POST",
            body: JSON.stringify(buildMpUpdateFarmBody()),
        }).catch(() => {});
    }, [isMultiplayer, currentLobbyId, showLobbyScreen, apiCall]);

    const postMpUpdateFarmRef = useRef(postMpUpdateFarm);
    postMpUpdateFarmRef.current = postMpUpdateFarm;

    const mpFarmDebounceTimerRef = useRef(null);
    const schedulePostMpUpdateFarm = useCallback(() => {
        if (mpFarmDebounceTimerRef.current) clearTimeout(mpFarmDebounceTimerRef.current);
        mpFarmDebounceTimerRef.current = setTimeout(() => {
            mpFarmDebounceTimerRef.current = null;
            postMpUpdateFarmRef.current();
        }, 280);
    }, []);

    useEffect(() => () => {
        if (mpFarmDebounceTimerRef.current) clearTimeout(mpFarmDebounceTimerRef.current);
    }, []);

    useEffect(() => {
        if (!isMultiplayer || !currentLobbyId || showLobbyScreen) return;
        const id = setInterval(() => postMpUpdateFarmRef.current(), 10000);
        return () => clearInterval(id);
    }, [isMultiplayer, currentLobbyId, showLobbyScreen]);

    const debouncedSave = useCallback(() => {
        if (isMultiplayer) return;
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => {
            flushFarmStateToServerRef.current?.();
        }, 500);
    }, [isMultiplayer]);

    useEffect(() => () => clearTimeout(saveTimeoutRef.current), []);

    // ── Buy seed from shop ────────────────────────────────────────────────────
    const handleBuySeed = useCallback(async (seed) => {
        if (gold < seed.shopPrice) return;
        if (!isMultiplayer && (personalShopStock[seed.seedId] ?? 0) <= 0) return; // singleplayer guard
        if (isMultiplayer && currentLobbyId) {
            try {
                const data = await apiCall(`/lobby/${currentLobbyId}/buy-seed`, {
                    method: "POST",
                    body: JSON.stringify({ seedId: seed.seedId }),
                });
                setGold(data.newGold ?? gold);
                setInventory(data.inventory || []);
                if (data.personalStock !== undefined) {
                    setPersonalShopStock(prev => ({ ...prev, [seed.seedId]: data.personalStock }));
                }
                schedulePostMpUpdateFarm();
            } catch (e) {
                notify(e.message || "Kauf fehlgeschlagen", "error");
            }
            return;
        }
        // Singleplayer: check capacity before buying
        const { inventory: inv0, harvestedItems: hi0, inventoryMaxSlots: maxSlots } = farmStateRef.current;
        if ((inv0?.length || 0) + (hi0?.length || 0) >= (maxSlots || 50)) {
            notify("🎒 Rucksack voll! Kaufe ein Upgrade im Tool-Shop.", "error");
            return;
        }
        setPersonalShopStock(prev => ({ ...prev, [seed.seedId]: Math.max(0, (prev[seed.seedId] ?? 0) - 1) }));
        setGold(g => g - seed.shopPrice);
        const boughtSeed = { ...seed, instanceId: Math.random().toString(36).slice(2) };
        setInventory(inv => [...inv, boughtSeed]);
        setSelectedSeed(prev => prev || boughtSeed);
        debouncedSave();
    }, [gold, personalShopStock, notify, isMultiplayer, currentLobbyId, apiCall, schedulePostMpUpdateFarm, debouncedSave]);

    // ── Plant seed in cell ────────────────────────────────────────────────────
    const handleCellClick = useCallback(async (cellX, cellY) => {
        const seedToPlant = selectedSeed || inventory[0];
        if (!seedToPlant) return;
        const key = `${cellX}_${cellY}`;
        if (plotPlants[key]) { notify("Diese Zelle ist bereits belegt!", "error"); return; }
        if (plantingCellsRef.current.has(key)) return;
        if (isMultiplayer && currentLobbyId) {
            plantingCellsRef.current.add(key);
            try {
                const localPlant = createPlantInstance(seedToPlant, cellX, cellY);
                const data = await apiCall(`/lobby/${currentLobbyId}/plant`, {
                    method: "POST",
                    body: JSON.stringify({ cellX, cellY, seedInstanceId: seedToPlant.instanceId, plantData: localPlant }),
                });
                // Use server-returned plant (has server-anchored timestamps) – don't wait for socket
                const serverPlant = data.plant || localPlant;
                setPlotPlants(prev => ({ ...prev, [key]: serverPlant }));
                playSound("plant", 0.5);
                setInventory(inv => {
                    const next = inv.filter(s => s.instanceId !== seedToPlant.instanceId);
                    setSelectedSeed(next.find(s => s.seedId === seedToPlant.seedId) || next[0] || null);
                    return next;
                });
                schedulePostMpUpdateFarm();
            } catch (e) {
                notify(e.message || "Pflanzen fehlgeschlagen", "error");
            } finally {
                plantingCellsRef.current.delete(key);
            }
            return;
        }

        const plant = createPlantInstance(seedToPlant, cellX, cellY);
        setPlotPlants(prev => ({ ...prev, [key]: plant }));
        playSound("plant", 0.5);
        setInventory(inv => {
            const nextInv = inv.filter(s => s.instanceId !== seedToPlant.instanceId);
            const nextSelected = nextInv.find(s => s.seedId === seedToPlant.seedId) || nextInv[0] || null;
            setSelectedSeed(nextSelected);
            return nextInv;
        });
        debouncedSave();
    }, [selectedSeed, inventory, plotPlants, notify, isMultiplayer, currentLobbyId, apiCall, schedulePostMpUpdateFarm, debouncedSave]);

    // ── Harvest plant ─────────────────────────────────────────────────────────
    const handleHarvest = useCallback(async (key, plant) => {
        if (!isPlantReady(plant)) return;
        if (isMultiplayer && currentLobbyId) {
            const [cellX, cellY] = key.split("_").map(Number);
            try {
                const result = await apiCall(`/lobby/${currentLobbyId}/harvest`, {
                    method: "POST",
                    body: JSON.stringify({ cellX, cellY }),
                });
                // Kein lokales setHarvestedItems/setPlotPlants: Socket (player_delta) ist die Quelle der Wahrheit
                playSound("harvest", 0.5);
                if (result?.harvestedItem?.specialData?.name) {
                    const expiresAt = Date.now() + 1500;
                    harvestFlashesRef.current = [
                        ...harvestFlashesRef.current.filter(f => f.expiresAt > Date.now()),
                        { cellX, cellY, specialName: result.harvestedItem.specialData.name, expiresAt },
                    ];
                }
            } catch (e) {
                notify(e.message || "Ernten fehlgeschlagen", "error");
            }
            return;
        }
        const { inventory: inv0, harvestedItems: hi0, inventoryMaxSlots: maxSlots } = farmStateRef.current;
        if ((inv0?.length || 0) + (hi0?.length || 0) >= (maxSlots || 50)) {
            notify("🎒 Rucksack voll! Verkaufe erst Ernte oder kaufe ein Upgrade.", "error");
            return;
        }
        const harvestResult = harvestPlant(plant);
        if (!harvestResult || !harvestResult.gold) return;
        playSound("harvest", 0.5);
        if (harvestResult.specialData?.name) {
            const [cellX, cellY] = key.split("_").map(Number);
            const expiresAt = Date.now() + 1500;
            harvestFlashesRef.current = [
                ...harvestFlashesRef.current.filter(f => f.expiresAt > Date.now()),
                { cellX, cellY, specialName: harvestResult.specialData.name, expiresAt },
            ];
        }
        const harvestedItem = {
            id: `${plant.instanceId}_${Date.now()}`,
            seedId: plant.seedId,
            singleUse: plant.singleUse,
            name: plant.name,
            emoji: plant.emoji,
            image: plant.harvestImage || plant.fruitImage || plant.growthImage,
            harvestImage: plant.harvestImage || plant.fruitImage || plant.growthImage,
            rarity: plant.rarity,
            size: harvestResult.size || plant.size || 1,
            specialData: harvestResult.specialData,
            statusEffect: plant.statusEffect || null,
            sellValue: harvestResult.gold,
            harvestedAt: Date.now(),
        };
        setHarvestedItems(prev => [harvestedItem, ...prev]);
        if (plant.singleUse && plant.stage === "harvested") {
            setPlotPlants(prev => { const n = { ...prev }; delete n[key]; return n; });
        } else {
            setPlotPlants(prev => ({
                ...prev,
                [key]: {
                    ...plant,
                    statusEffect: null,
                    statusEffectUntil: null,
                },
            }));
        }
        debouncedSave();
    }, [notify, isMultiplayer, currentLobbyId, apiCall, debouncedSave]);

    const handleBuyTool = useCallback(async (tool) => {
        const toolInv = normalizeToolInventory(toolInventory);
        // 7. ANPASSUNG: Preisweiche
        const effectivePrice = tool.id === "backpack_upgrade"
            ? getBackpackUpgradePrice(toolInv.backpackLevel || 0)
            : tool.id === "pickaxe"
            ? getPickaxePrice(toolInv.pickaxesBought || 0)
            : tool.price;

        if (gold < effectivePrice) return;
        if ((tool.type === "single" || tool.id === "pickaxe") && (toolShopStock[tool.id] ?? 0) <= 0) return;
        if (tool.id === "shovel" && toolInventory.hasShovel) return;
        if (isMultiplayer && currentLobbyId) {
            try {
                const data = await apiCall(`/lobby/${currentLobbyId}/buy-tool`, {
                    method: "POST",
                    body: JSON.stringify({ toolId: tool.id }),
                });
                setGold(data.newGold ?? gold);
                if (data.toolInventory) setToolInventory(normalizeToolInventory(data.toolInventory));
                if (typeof data.inventoryMaxSlots === "number") setInventoryMaxSlots(Math.max(50, data.inventoryMaxSlots));
                if (data.personalToolStock) setToolShopStock(data.personalToolStock);
                schedulePostMpUpdateFarm();
            } catch (e) {
                notify(e.message || "Tool-Kauf fehlgeschlagen", "error");
            }
            return;
        }
        setGold(g => g - effectivePrice);
        if (tool.type === "single" || tool.id === "pickaxe") {
            setToolShopStock(prev => ({ ...prev, [tool.id]: Math.max(0, (prev[tool.id] ?? 0) - 1) }));
        }
        setToolInventory(prev => {
            const next = normalizeToolInventory(prev);
            if (tool.id === "pickaxe") {
                next.pickaxeUses = (next.pickaxeUses || 0) + (tool.uses || 0);
                next.pickaxesBought = (next.pickaxesBought || 0) + 1;
            } else if (tool.id === "shovel") {
                next.hasShovel = true;
            } else if (tool.id === "plant_pot") {
                next.plantPots = (next.plantPots || 0) + 1;
            } else if (tool.id === "backpack_upgrade") {
                next.backpackLevel = (next.backpackLevel || 0) + 1;
                next.backpackUpgraded = next.backpackLevel > 0;
                setInventoryMaxSlots(current => Math.max(current, 50 + next.backpackLevel * 10));
            } else if (tool.id === "watering_can") {
                next.wateringCans = (next.wateringCans || 0) + 1;
            }
            return next;
        });
        debouncedSave();
    }, [gold, notify, toolInventory, toolShopStock, isMultiplayer, currentLobbyId, apiCall, schedulePostMpUpdateFarm, debouncedSave]);

    const handleMineRock = useCallback(async (rockCell) => {
        if (!rockCell || !Number.isInteger(rockCell.cellX) || !Number.isInteger(rockCell.cellY)) return;
        const key = `${rockCell.cellX}_${rockCell.cellY}`;
        if ((toolInventory.pickaxeUses || 0) <= 0) {
            notify("Du brauchst eine Spitzhacke.", "error");
            return;
        }
        if (plotUnlockedCells.includes(key)) {
            notify("Dieses Feld ist bereits freigelegt.", "error");
            return;
        }
        if (isMultiplayer && currentLobbyId) {
            try {
                const data = await apiCall(`/lobby/${currentLobbyId}/mine-rock`, {
                    method: "POST",
                    body: JSON.stringify({ cellX: rockCell.cellX, cellY: rockCell.cellY }),
                });
                if (typeof data.plotExpansions === "number") {
                    setPlotExpansions(Math.max(0, Math.min(MAX_PLOT_EXPANSIONS, data.plotExpansions)));
                }
                if (Array.isArray(data.plotUnlockedCells)) {
                    setPlotUnlockedCells(normalizePlotUnlockedCells(data.plotUnlockedCells));
                }
                if (data.toolInventory) setToolInventory(normalizeToolInventory(data.toolInventory));
                notify("Steinschicht entfernt! Neue Acker-Reihen freigeschaltet.");
                schedulePostMpUpdateFarm();
            } catch (e) {
                notify(e.message || "Steinabbau fehlgeschlagen", "error");
            }
            return;
        }
        setToolInventory(prev => ({ ...normalizeToolInventory(prev), pickaxeUses: Math.max(0, (prev.pickaxeUses || 0) - 1) }));
        setPlotUnlockedCells(prev => {
            const next = normalizePlotUnlockedCells([...prev, key]);
            setPlotExpansions(Math.min(MAX_PLOT_EXPANSIONS, Math.ceil(next.length / BASE_DIRT_COLS)));
            return next;
        });
        notify(`Steinschicht entfernt! Neue Acker-Reihen freigeschaltet. ⛏️ (${Math.max(0, (toolInventory.pickaxeUses || 0) - 1)} Uses übrig)`);
        debouncedSave();
    }, [isMultiplayer, currentLobbyId, notify, plotUnlockedCells, toolInventory.pickaxeUses, apiCall, schedulePostMpUpdateFarm, debouncedSave]);

    const handleWaterPlant = useCallback(async (cellX, cellY) => {
        const key = `${cellX}_${cellY}`;
        const plant = plotPlants[key];
        if (!plant) return;
        if (isPlantReady(plant)) {
            notify("Pflanze ist bereits ausgewachsen.", "error");
            return;
        }
        if ((toolInventory.wateringCans || 0) <= 0) {
            notify("Keine Gießkanne mehr verfügbar.", "error");
            return;
        }
        if (isMultiplayer && currentLobbyId) {
            try {
                const data = await apiCall(`/lobby/${currentLobbyId}/water-plant`, {
                    method: "POST",
                    body: JSON.stringify({ cellX, cellY }),
                });
                if (data.updatedPlant) {
                    setPlotPlants(prev => ({ ...prev, [key]: data.updatedPlant }));
                }
                if (data.toolInventory) setToolInventory(normalizeToolInventory(data.toolInventory));
                notify("Pflanze gewässert: -5 Minuten Wachstum.");
                schedulePostMpUpdateFarm();
            } catch (e) {
                notify(e.message || "Wässern fehlgeschlagen", "error");
            }
            return;
        }
        setToolInventory(prev => ({ ...normalizeToolInventory(prev), wateringCans: Math.max(0, (prev.wateringCans || 0) - 1) }));
        const now = Date.now();
        const boost = 5 * 60 * 1000;
        setPlotPlants(prev => {
            const p = prev[key];
            if (!p) return prev;
            const next = { ...prev };
            const np = { ...p };
            if (np.singleUse) {
                np.growthMs = Math.max(5000, (np.growthMs || 0) - boost);
            } else if (np.stage === "structure") {
                np.structureReadyAt = Math.max(now, (np.structureReadyAt || now) - boost);
            } else {
                np.fruitSlots = (np.fruitSlots || []).map((s) => ({ ...(s || {}), readyAt: Math.max(now, (s.readyAt || now) - boost) }));
            }
            next[key] = np;
            return next;
        });
        notify("Pflanze gewässert: -5 Minuten Wachstum.");
    }, [plotPlants, toolInventory.wateringCans, notify, isMultiplayer, currentLobbyId, apiCall, schedulePostMpUpdateFarm]);

    const handleMovePlantWithPot = useCallback(async (targetX, targetY) => {
        if ((toolInventory.plantPots || 0) <= 0) {
            notify("Kein Plant Pot verfügbar.", "error");
            return;
        }
        const targetKey = `${targetX}_${targetY}`;
        if (!movingPlantSource) {
            const sourcePlant = plotPlants[targetKey];
            if (!sourcePlant) {
                notify("Wähle zuerst eine Pflanze als Quelle.", "error");
                return;
            }
            setMovingPlantSource(targetKey);
            notify("Quelle gewählt. Jetzt auf Zielfeld klicken.");
            return;
        }
        if (movingPlantSource === targetKey) return;
        if (plotPlants[targetKey]) {
            notify("Zielfeld ist bereits belegt.", "error");
            return;
        }
        const [fromX, fromY] = movingPlantSource.split("_").map(Number);
        if (isMultiplayer && currentLobbyId) {
            try {
                const data = await apiCall(`/lobby/${currentLobbyId}/move-plant`, {
                    method: "POST",
                    body: JSON.stringify({ fromX, fromY, toX: targetX, toY: targetY }),
                });
                if (data.movedPlant) {
                    setPlotPlants(prev => {
                        const next = { ...prev };
                        delete next[data.fromKey || movingPlantSource];
                        next[data.toKey || targetKey] = data.movedPlant;
                        return next;
                    });
                }
                if (data.toolInventory) setToolInventory(normalizeToolInventory(data.toolInventory));
                setMovingPlantSource(null);
                notify("Pflanze erfolgreich umgesetzt.");
                schedulePostMpUpdateFarm();
            } catch (e) {
                notify(e.message || "Pflanze bewegen fehlgeschlagen", "error");
            }
            return;
        }
        setPlotPlants(prev => {
            const src = prev[movingPlantSource];
            if (!src) return prev;
            const next = { ...prev };
            delete next[movingPlantSource];
            next[targetKey] = { ...src, cellX: targetX, cellY: targetY };
            return next;
        });
        setToolInventory(prev => ({ ...normalizeToolInventory(prev), plantPots: Math.max(0, (prev.plantPots || 0) - 1) }));
        setMovingPlantSource(null);
        notify("Pflanze erfolgreich umgesetzt.");
    }, [toolInventory.plantPots, movingPlantSource, plotPlants, notify, isMultiplayer, currentLobbyId, apiCall, schedulePostMpUpdateFarm]);

    const handleBuyEgg = useCallback(async (egg) => {
        if (gold < egg.price) return;
        if ((eggShopStock[egg.id] ?? 0) <= 0) return;
        if (isMultiplayer && currentLobbyId) {
            try {
                const data = await apiCall(`/lobby/${currentLobbyId}/buy-egg`, {
                    method: "POST",
                    body: JSON.stringify({ eggId: egg.id }),
                });
                setGold(data.newGold ?? gold);
                if (Array.isArray(data.eggInventory)) setEggInventory(data.eggInventory);
                if (data.personalEggStock) setEggShopStock(data.personalEggStock);
                schedulePostMpUpdateFarm();
            } catch (e) {
                notify(e.message || "Ei-Kauf fehlgeschlagen", "error");
            }
            return;
        }
        setGold(g => g - egg.price);
        setEggInventory(prev => [...prev, { ...egg, instanceId: Math.random().toString(36).slice(2) }]);
        setEggShopStock(prev => ({ ...prev, [egg.id]: Math.max(0, (prev[egg.id] ?? 0) - 1) }));
        debouncedSave();
    }, [gold, notify, eggShopStock, isMultiplayer, currentLobbyId, apiCall, schedulePostMpUpdateFarm, debouncedSave]);

    const handleBuyDeco = useCallback((deco) => {
        if (!deco) return;
        if (gold < deco.price) {
            notify("Nicht genug Gold.", "error");
            return;
        }
        const instance = {
            ...deco,
            instanceId: `deco_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            _type: "deco",
        };
        setGold((g) => g - deco.price);
        setDecoInventory((prev) => [...prev, instance]);
        if (!selectedDecoToPlace) setSelectedDecoToPlace(instance);
        setSelectedSeed(null);
        setSelectedTool(null);
        setSelectedCarryItem(null);
        setSelectedPetToPlace(null);
        if (isMultiplayer) schedulePostMpUpdateFarm();
        debouncedSave();
    }, [gold, notify, selectedDecoToPlace, isMultiplayer, schedulePostMpUpdateFarm, debouncedSave]);

    const unlockIncubatorSlot = useCallback(() => {
        const nextSlot = incubator.unlockedSlots; // 0-indexed: current = unlockedSlots-1, next = unlockedSlots
        if (nextSlot >= 5) return;
        const cost = INCUBATOR_UNLOCK_COSTS[nextSlot - 1];
        if (gold < cost) { notify(`Benötigst ${cost.toLocaleString('de-DE')} 🪙`, "error"); return; }
        setGold(g => g - cost);
        setIncubator(prev => ({ ...prev, unlockedSlots: prev.unlockedSlots + 1 }));
        notify(`Inkubator-Slot ${nextSlot + 1} freigeschaltet!`);
        if (isMultiplayer) schedulePostMpUpdateFarm();
        debouncedSave();
    }, [incubator.unlockedSlots, gold, notify, isMultiplayer, schedulePostMpUpdateFarm, debouncedSave]);

    const placeEggInIncubator = useCallback((slotIndex, eggInstanceId) => {
        if (!eggInventory.length || slotIndex >= incubator.unlockedSlots) return;
        if (incubator.slots[slotIndex]) return;
        const chosen = eggInventory.find(e => e.instanceId === eggInstanceId) || eggInventory[0];
        if (!chosen) return;
        const hatchResult = rollHatchResult(chosen);
        setEggInventory(prev => prev.filter(e => e.instanceId !== chosen.instanceId));
        setIncubator(prev => {
            const slots = [...prev.slots];
            slots[slotIndex] = {
                egg: chosen,
                startedAt: Date.now(),
                hatchAt: Date.now() + 5 * 60 * 1000,
                hatchResult,
            };
            return { ...prev, slots };
        });
        setIncubatorTargetSlot(null);
        if (isMultiplayer) schedulePostMpUpdateFarm();
    }, [eggInventory, incubator, isMultiplayer, schedulePostMpUpdateFarm]);

    const collectHatchedEgg = useCallback((slotIndex) => {
        const slot = incubator.slots[slotIndex];
        if (!slot || Date.now() < slot.hatchAt) return;

        const hatchedPet = {
            id: `pet_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            name: slot.hatchResult.type,
            emoji: slot.hatchResult.emoji,
            image: slot.hatchResult.image,
            previewImage: slot.hatchResult.previewImage,
            rarity: slot.egg.rarity,
            ability: slot.hatchResult.ability,
        };

        // Clear slot first, then add pet — both as sibling calls, never nested
        setIncubator(prev => {
            const s = prev.slots[slotIndex];
            if (!s || Date.now() < s.hatchAt) return prev;
            const newSlots = [...prev.slots];
            newSlots[slotIndex] = null;
            return { ...prev, slots: newSlots };
        });
        setPetInventory(current => [...current, hatchedPet]);

        debouncedSave();
        if (isMultiplayer) schedulePostMpUpdateFarm();
    }, [incubator, isMultiplayer, schedulePostMpUpdateFarm, debouncedSave]);

    // Planting click handler on canvas
    useEffect(() => {
        if (showLobbyScreen) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const onMouseLeave = () => {
            setHoverInfo(null);
            if (shovelHoldTimerRef.current) clearTimeout(shovelHoldTimerRef.current);
            if (shovelHoldProgressRef.current) clearInterval(shovelHoldProgressRef.current);
            setShovelHoldState({ active: false, progress: 0 });
        };
        const toWorld = (clientX, clientY) => {
            const rect = canvas.getBoundingClientRect();
            const screenX = clientX - rect.left;
            const screenY = clientY - rect.top;
            const player = engineRef.current.player;
            return {
                worldX: player.x + (screenX - canvas.width / 2),
                worldY: player.y + (screenY - canvas.height / 2),
            };
        };

        const onCanvasClick = (e) => {
            const { worldX, worldY } = toWorld(e.clientX, e.clientY);

            if (selectedDecoToPlace) {
                const slot = layout.current.slots[mySlotRef.current] || layout.current.slots[0];
                const drawY = slot.isTopRow ? slot.anchorY - MAP_CONFIG.territoryHeight : slot.anchorY;
                const dw = selectedDecoToPlace.width || 1;
                const dh = selectedDecoToPlace.height || 1;

                // Clicked tile = bottom-left anchor; object grows right and upward
                const tileX = Math.floor((worldX - slot.x) / TILE_SIZE);
                const tileY = Math.floor((worldY - drawY) / TILE_SIZE);

                const occupiedKeys = [];
                let inDirtArea = false;
                let outOfBounds = false;
                const dirtX = slot.x + MAP_CONFIG.dirtOffsetX;
                const dirtY = slot.isTopRow ? slot.anchorY - MAP_CONFIG.baseDirtHeight - TILE_SIZE : drawY + TILE_SIZE;
                const maxTilesX = Math.round(MAP_CONFIG.territoryWidth / TILE_SIZE);
                const maxTilesY = Math.round(MAP_CONFIG.territoryHeight / TILE_SIZE);

                for (let dx = 0; dx < dw; dx++) {
                    for (let dy = 0; dy < dh; dy++) {
                        const cx = tileX + dx;
                        const cy = tileY - dy; // build upward
                        if (cx < 0 || cx >= maxTilesX || cy < 0 || cy >= maxTilesY) {
                            outOfBounds = true;
                        }
                        occupiedKeys.push(`${cx}_${cy}`);
                        const checkX = slot.x + cx * TILE_SIZE + TILE_SIZE / 2;
                        const checkY = drawY + cy * TILE_SIZE + TILE_SIZE / 2;
                        if (checkX >= dirtX && checkX <= dirtX + MAP_CONFIG.baseDirtWidth &&
                            checkY >= dirtY && checkY <= dirtY + MAP_CONFIG.baseDirtHeight) {
                            inDirtArea = true;
                        }
                    }
                }

                if (outOfBounds) {
                    notify("Objekt ragt über dein Grundstück hinaus.", "error");
                    return;
                }
                if (inDirtArea) {
                    notify("Deko nur auf Grasflächen platzieren.", "error");
                    return;
                }

                const occupied = decoPlacements.some((d) =>
                    d.slotIndex === mySlotRef.current &&
                    (d.occupiedKeys || [d.gridKey]).some(k => occupiedKeys.includes(k))
                );
                if (occupied) {
                    notify("Hier steht bereits etwas.", "error");
                    return;
                }

                // Store center of the bottom-left anchor tile
                const gx = slot.x + tileX * TILE_SIZE + TILE_SIZE / 2;
                const gy = drawY + tileY * TILE_SIZE + TILE_SIZE / 2;

                const decoInstanceId = selectedDecoToPlace.instanceId;
                const placed = {
                    id: `placed_${decoInstanceId}_${Date.now()}`,
                    decoId: selectedDecoToPlace.id,
                    name: selectedDecoToPlace.name,
                    emoji: selectedDecoToPlace.emoji,
                    image: selectedDecoToPlace.image,
                    rarity: selectedDecoToPlace.rarity || "COMMON",
                    width: dw,
                    height: dh,
                    slotIndex: mySlotRef.current,
                    x: gx,
                    y: gy,
                    occupiedKeys,
                };
                setDecoPlacements((prev) => [...prev, placed]);
                setDecoInventory((prev) => {
                    const targetInstance = selectedDecoToPlace.instanceId || selectedDecoToPlace.id;
                    const next = prev.filter((d) => (d.instanceId || d.id) !== targetInstance);
                    const nextSelected = next.find((d) => d.id === selectedDecoToPlace.id || d.decoId === selectedDecoToPlace.decoId) || null;
                    setSelectedDecoToPlace(nextSelected);
                    return next;
                });
                notify(`${selectedDecoToPlace.emoji || "🪴"} ${selectedDecoToPlace.name} platziert.`);
                if (isMultiplayer) schedulePostMpUpdateFarm();
                return;
            }
            if (selectedPetToPlace) {
                const slot = layout.current.slots[mySlotRef.current] || layout.current.slots[0];
                const drawY = slot.isTopRow ? slot.anchorY - MAP_CONFIG.territoryHeight : slot.anchorY;
                const insideOwnPlot = worldX >= slot.x && worldX <= slot.x + MAP_CONFIG.territoryWidth
                    && worldY >= drawY && worldY <= drawY + MAP_CONFIG.territoryHeight;
                if (!insideOwnPlot) {
                    notify("Tier bitte innerhalb deiner Grundstücksgrenzen platzieren.", "error");
                    return;
                }

                // 3. ANPASSUNG: Max 3 Tiere pro Grundstück checken
                const myPetsCount = petPlacements.filter(p => p.slotIndex === mySlotRef.current).length;
                if (myPetsCount >= 3) {
                    notify("Du kannst maximal 3 Tiere auf deinem Grundstück haben!", "error");
                    return;
                }

                const petId = selectedPetToPlace.id || selectedPetToPlace.instanceId || `${selectedPetToPlace.name}_${Date.now()}`;
                setPetInventory((prev) => prev.filter((pet) => (pet.id || pet.instanceId) !== (selectedPetToPlace.id || selectedPetToPlace.instanceId)));
                setPetPlacements((prev) => ([
                    ...prev,
                    {
                        id: `${petId}_${Date.now()}`,
                        slotIndex: mySlotRef.current,
                        name: selectedPetToPlace.name,
                        rarity: selectedPetToPlace.rarity || "COMMON",
                        emoji: selectedPetToPlace.emoji || getPetEmoji(selectedPetToPlace.name),
                        image: selectedPetToPlace.image || buildPetPreviewImage(selectedPetToPlace.name, selectedPetToPlace.emoji || getPetEmoji(selectedPetToPlace.name)),
                        ability: selectedPetToPlace.ability, // 3. ANPASSUNG: Ability übernehmen
                        x: worldX,
                        y: worldY,
                        vx: 0,
                        vy: 0,
                        changeDirAt: 0,
                    },
                ]));
                setSelectedPetToPlace(null);
                notify(`${selectedPetToPlace.emoji || "🐾"} ${selectedPetToPlace.name} platziert.`);
                if (isMultiplayer) schedulePostMpUpdateFarm();
                return;
            }
            if (!selectedTool || selectedTool === "shovel") {
                const pickupDist = 60; 

                // 1. Check Tiere
                const petIdx = petPlacements.findIndex(p =>
                    p.slotIndex === mySlotRef.current && Math.hypot(worldX - p.x, worldY - p.y) < pickupDist
                );

                if (petIdx !== -1) {
                    const pet = petPlacements[petIdx];
                    setPetPlacements(prev => prev.filter((_, i) => i !== petIdx));
                    setPetInventory(prev => [...prev, {
                        ...pet,
                        instanceId: `pet_pickup_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                        _type: "pet",
                    }]);
                    notify(`${pet.emoji || "🐾"} aufgehoben.`);
                    if (isMultiplayer) schedulePostMpUpdateFarm();
                    return;
                }

                // 2. Check Deko
                const decoIdx = decoPlacements.findIndex(d => {
                    if (d.slotIndex !== mySlotRef.current) return false;
                    const radius = 60 * Math.max(d.width || 1, d.height || 1) * 0.7;
                    return Math.hypot(worldX - d.x, worldY - d.y) < radius;
                });

                if (decoIdx !== -1) {
                    const deco = decoPlacements[decoIdx];
                    setDecoPlacements(prev => prev.filter((_, i) => i !== decoIdx));
                    setDecoInventory(prev => [...prev, {
                        ...deco,
                        id: deco.decoId || deco.id,
                        instanceId: `deco_pickup_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                        _type: "deco",
                    }]);
                    notify(`${deco.emoji || "🪴"} aufgehoben.`);
                    if (isMultiplayer) schedulePostMpUpdateFarm();
                    return;
                }
            }

            const mySlot = layout.current.slots[mySlotRef.current] || layout.current.slots[0];
            const hoveredRock = getHoveredRock(mySlot, worldX, worldY, MAX_PLOT_EXPANSIONS);
            const hovered = getHoveredCell(mySlot, worldX, worldY);
            if (selectedTool === "pickaxe") {
                if (hoveredRock) {
                    handleMineRock(hoveredRock);
                } else {
                    notify("Mit Spitzhacke nur auf Stein-Felder klicken.", "error");
                }
                return;
            }
            if (!hovered) {
                setHoverInfo(null);
                return;
            }
            if (selectedTool === "watering") {
                handleWaterPlant(hovered.cellX, hovered.cellY);
                return;
            }
            if (selectedTool === "pot") {
                handleMovePlantWithPot(hovered.cellX, hovered.cellY);
                return;
            }
            if (selectedTool === "shovel") {
                    notify("Klicke direkt auf ein Tier oder Deko zum Aufheben.");
                    return;
            }

            const key = `${hovered.cellX}_${hovered.cellY}`;
            const hoveredPlant = plotPlants[key];
            if (hoveredPlant && isPlantReady(hoveredPlant)) {
                handleHarvest(key, hoveredPlant);
                return;
            }
            handleCellClick(hovered.cellX, hovered.cellY);
        };

        const onCanvasMove = (e) => {
            const rect = canvas.getBoundingClientRect();
            const clientXLocal = e.clientX - rect.left;
            const clientYLocal = e.clientY - rect.top;
            const { worldX, worldY } = toWorld(e.clientX, e.clientY);

            // Drag-harvest while mouse button is held.
            if (isDragHarvestingRef.current) {
                const mySlot = layout.current.slots[mySlotRef.current] || layout.current.slots[0];
                const dragHovered = getHoveredCell(mySlot, worldX, worldY);
                if (dragHovered) {
                    const dragKey = `${dragHovered.cellX}_${dragHovered.cellY}`;
                    if (!dragHarvestedCellsRef.current.has(dragKey)) {
                        const dragPlant = plotPlants[dragKey];
                        if (dragPlant && isPlantReady(dragPlant)) {
                            dragHarvestedCellsRef.current.add(dragKey);
                            handleHarvest(dragKey, dragPlant);
                        }
                    }
                }
            }

            const mySlot = layout.current.slots[mySlotRef.current] || layout.current.slots[0];
            const hovered = getHoveredCell(mySlot, worldX, worldY);
            if (hovered) {
                setRemoteHoverInfo(null);
                const key = `${hovered.cellX}_${hovered.cellY}`;
                const plant = plotPlants[key];
                if (plant) {
                    setHoverInfo({ x: clientXLocal, y: clientYLocal, key });
                } else {
                    setHoverInfo(null);
                }
                return;
            }
            setHoverInfo(null);

            // Check remote slots for hover.
            for (let si = 0; si < layout.current.slots.length; si++) {
                if (si === mySlotRef.current) continue;
                const rSlot = layout.current.slots[si];
                if (!rSlot?.plants) continue;
                const rHovered = getHoveredCell(rSlot, worldX, worldY);
                if (!rHovered) continue;
                const rKey = `${rHovered.cellX}_${rHovered.cellY}`;
                const rPlant = rSlot.plants[rKey];
                if (rPlant) {
                    setRemoteHoverInfo({ x: clientXLocal, y: clientYLocal, key: rKey, slotOwner: rSlot.owner || "?", slotIndex: si, plant: rPlant });
                    return;
                }
            }
            setRemoteHoverInfo(null);
        };

        const onCanvasMouseDown = (e) => {
            if (selectedTool === "shovel") {
                const { worldX, worldY } = toWorld(e.clientX, e.clientY);
                const mySlot = layout.current.slots[mySlotRef.current] || layout.current.slots[0];
                const hovered = getHoveredCell(mySlot, worldX, worldY);
                if (!hovered) return;
                const key = `${hovered.cellX}_${hovered.cellY}`;
                if (!plotPlants[key]) return;
                if (shovelHoldTimerRef.current) clearTimeout(shovelHoldTimerRef.current);
                if (shovelHoldProgressRef.current) clearInterval(shovelHoldProgressRef.current);
                shovelHoldStartedAtRef.current = Date.now();
                setShovelHoldState({ active: true, progress: 0 });
                shovelHoldProgressRef.current = setInterval(() => {
                    const progress = Math.min(1, (Date.now() - shovelHoldStartedAtRef.current) / 900);
                    setShovelHoldState({ active: true, progress });
                }, 33);
                shovelHoldTimerRef.current = setTimeout(async () => {
                    if (isMultiplayer && currentLobbyId) {
                        try {
                            await apiCall(`/lobby/${currentLobbyId}/remove-plant`, {
                                method: "POST",
                                body: JSON.stringify({ cellX: hovered.cellX, cellY: hovered.cellY }),
                            });
                            setPlotPlants(prev => {
                                const next = { ...prev };
                                delete next[key];
                                return next;
                            });
                            notify("Pflanze entfernt.");
                            schedulePostMpUpdateFarm();
                        } catch (err) {
                            notify(err.message || "Entfernen fehlgeschlagen", "error");
                        }
                    } else {
                        setPlotPlants(prev => {
                            const next = { ...prev };
                            delete next[key];
                            return next;
                        });
                        notify("Pflanze entfernt.");
                    }
                    if (shovelHoldProgressRef.current) clearInterval(shovelHoldProgressRef.current);
                    setShovelHoldState({ active: false, progress: 0 });
                }, 900);
                return;
            }
            // Drag-harvest: start when no tool selected and clicking a ready plant.
            if (!selectedTool && !selectedPetToPlace && !selectedDecoToPlace) {
                const { worldX, worldY } = toWorld(e.clientX, e.clientY);
                const mySlot = layout.current.slots[mySlotRef.current] || layout.current.slots[0];
                const hovered = getHoveredCell(mySlot, worldX, worldY);
                if (hovered) {
                    const key = `${hovered.cellX}_${hovered.cellY}`;
                    const plant = plotPlants[key];
                    if (plant && isPlantReady(plant)) {
                        isDragHarvestingRef.current = true;
                        dragHarvestedCellsRef.current = new Set([key]);
                    }
                }
            }
        };

        const stopShovelHold = () => {
            if (shovelHoldTimerRef.current) clearTimeout(shovelHoldTimerRef.current);
            if (shovelHoldProgressRef.current) clearInterval(shovelHoldProgressRef.current);
            setShovelHoldState({ active: false, progress: 0 });
            isDragHarvestingRef.current = false;
            dragHarvestedCellsRef.current = new Set();
        };

        canvas.addEventListener("click", onCanvasClick);
        canvas.addEventListener("mousemove", onCanvasMove);
        canvas.addEventListener("mouseleave", onMouseLeave);
        canvas.addEventListener("mousedown", onCanvasMouseDown);
        canvas.addEventListener("mouseup", stopShovelHold);
        return () => {
            canvas.removeEventListener("click", onCanvasClick);
            canvas.removeEventListener("mousemove", onCanvasMove);
            canvas.removeEventListener("mouseleave", onMouseLeave);
            canvas.removeEventListener("mousedown", onCanvasMouseDown);
            canvas.removeEventListener("mouseup", stopShovelHold);
            stopShovelHold();
        };
    }, [showLobbyScreen, handleCellClick, handleHarvest, handleMineRock, handleMovePlantWithPot, handleWaterPlant, notify, plotPlants, selectedTool, selectedPetToPlace, selectedDecoToPlace, decoPlacements, isMultiplayer, currentLobbyId, apiCall, schedulePostMpUpdateFarm]);

    useEffect(() => {
        mySlotRef.current = mySlotIndex;
    }, [mySlotIndex]);

    useEffect(() => {
        if (!showLobbyScreen || lobbyMode !== "multi") return;
        loadPublicLobbies();
    }, [showLobbyScreen, lobbyMode, loadPublicLobbies]);

    useEffect(() => {
        if (!isMultiplayer || !currentLobbyId || showLobbyScreen) return;

        let socket = null;
        let cancelled = false;
        const lobbyId = currentLobbyId;

        (async () => {
            let userId;
            let userName;
            try {
                const me = await apiCall("/whoami");
                if (cancelled) return;
                userId = String(me.userId);
                userName = (me.login && String(me.login)) || "Gast";
            } catch (e) {
                if (!cancelled) {
                    notify(e?.message || "Garden: Sitzung unbekannt (bitte Seite neu laden).", "error");
                    worldBootKindRef.current = null;
                    setWorldBootState({ active: false, label: "", progress: 0 });
                }
                return;
            }
            if (cancelled) return;

            socket = io(socketServerUrl ?? window.location.origin, {
                path: "/socket.io",
                withCredentials: true,
                reconnection: true,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 16000,
                reconnectionAttempts: Infinity,
            });
            socketRef.current = socket;
            if (cancelled) {
                try { socket.disconnect(); } catch { /* */ }
                return;
            }

            const rejoinLobby = () => {
                if (cancelled) return;
                socket.emit("join_garden_lobby", { lobbyId, userId, userName });
            };

            socket.on("connect", rejoinLobby);
            socket.on("connect_error", (err) => {
                if (import.meta.env?.DEV) console.warn("[garden] socket connect_error (retry)", err?.message || err);
            });

            socket.on("host_changed", ({ hostId }) => {
                setLobbyHostId(hostId);
                notify("Der Host hat die Lobby verlassen. Ein neuer Host wurde gewählt!", "info");
            });

            socket.on("lobby_joined", ({ lobby, mySlotIndex: slot, myPlayer, personalShopStock: pss, personalToolStock: pts, personalEggStock: pes }) => {
            if (lobby?.hostId) setLobbyHostId(lobby.hostId);
            if (lobby?.maxPlayers) {
                layout.current = generatePlotSlots(lobby.maxPlayers);
                updateAreaPositions(layout.current);
            }
            const s = slot ?? 0;
            setMySlotIndex(s);
            mySlotRef.current = s;
            setGold(myPlayer?.gold ?? 500);
            setInventory(myPlayer?.inventory || []);
            if (Array.isArray(myPlayer?.harvestedItems)) setHarvestedItems(myPlayer.harvestedItems);
            if (Array.isArray(myPlayer?.eggInventory)) setEggInventory(myPlayer.eggInventory);
            if (Array.isArray(myPlayer?.petInventory)) setPetInventory(myPlayer.petInventory);
            if (Array.isArray(myPlayer?.petPlacements)) setPetPlacements(myPlayer.petPlacements);
            if (Array.isArray(myPlayer?.decoInventory)) setDecoInventory(myPlayer.decoInventory);
            if (Array.isArray(myPlayer?.decoPlacements)) setDecoPlacements(myPlayer.decoPlacements);
            if (myPlayer?.toolInventory) setToolInventory(normalizeToolInventory(myPlayer.toolInventory));
            if (typeof myPlayer?.inventoryMaxSlots === "number") setInventoryMaxSlots(Math.max(50, myPlayer.inventoryMaxSlots));
            if (myPlayer?.incubator) setIncubator(myPlayer.incubator);
            if (myPlayer?.appearance) setPlayerAppearance(myPlayer.appearance);
            if (typeof myPlayer?.tutorialCompleted === "boolean") setTutorialCompleted(myPlayer.tutorialCompleted);
            if (Array.isArray(myPlayer?.mailbox)) setMailbox(myPlayer.mailbox);
            setShopRotationIfChanged(lobby?.shopRotation || null);
            if (lobby?.shopRotation?.generatedAt) seedRotationKeyRef.current = String(lobby.shopRotation.generatedAt);
            const seedNext = lobby?.shopNextRotation || lobby?.shopRotation?.nextRotation;
            if (seedNext) {
                seedNextRotationAtRef.current = Number(seedNext);
                setShopCountdown(Math.max(0, seedNext - Date.now()));
            }
            if (lobby?.toolShopRotation) setToolShopRotation(lobby.toolShopRotation);
            if (lobby?.toolShopRotation?.generatedAt) toolRotationKeyRef.current = String(lobby.toolShopRotation.generatedAt);
            const toolNext = lobby?.toolShopNextRotation || lobby?.toolShopRotation?.nextRotation;
            if (toolNext) {
                toolNextRotationAtRef.current = Number(toolNext);
                setToolShopCountdown(Math.max(0, toolNext - Date.now()));
            }
            if (lobby?.eggShopRotation) setEggShopRotation(lobby.eggShopRotation);
            if (lobby?.eggShopRotation?.generatedAt) eggRotationKeyRef.current = String(lobby.eggShopRotation.generatedAt);
            const eggNext = lobby?.eggShopNextRotation || lobby?.eggShopRotation?.nextRotation;
            if (eggNext) {
                eggNextRotationAtRef.current = Number(eggNext);
                setEggShopCountdown(Math.max(0, eggNext - Date.now()));
            }
            if (pss && typeof pss === "object" && Object.keys(pss).length > 0) setPersonalShopStock(pss);
            else if (lobby?.shopRotation) initPersonalStock(lobby.shopRotation);
            if (pts && typeof pts === "object" && Object.keys(pts).length > 0) setToolShopStock(pts);
            else if (lobby?.toolShopRotation?.items) {
                const stock = {};
                for (const item of lobby.toolShopRotation.items) {
                    if (item.type === "single" || item.id === "pickaxe") stock[item.id] = item.stock || 0;
                }
                setToolShopStock(stock);
            }
            if (pes && typeof pes === "object" && Object.keys(pes).length > 0) setEggShopStock(pes);
            else if (lobby?.eggShopRotation?.items) {
                const stock = {};
                for (const item of lobby.eggShopRotation.items) {
                    stock[item.id] = item.stock || 0;
                }
                setEggShopStock(stock);
            }
            const ownPlot = lobby?.plots?.[s];
            if (lobby?.plots) {
                lobby.plots.forEach((p, idx) => {
                    if (layout.current.slots[idx]) {
                        layout.current.slots[idx].owner = p.ownerName || null;
                        layout.current.slots[idx].ownerId = p.ownerId || null;
                        layout.current.slots[idx].plants = normalizePlotPlantsMap(p.plants || {});
                        layout.current.slots[idx].unlockedCells = normalizePlotUnlockedCells(p.unlockedCells || []);
                        layout.current.slots[idx].currentExpansions = Math.min(MAX_PLOT_EXPANSIONS, Math.ceil(layout.current.slots[idx].unlockedCells.length / BASE_DIRT_COLS));
                    }
                });
            }
            setPlotPlants(normalizePlotPlantsMap(ownPlot?.plants || {}));
            const unlocked = resolvePlotUnlockedCells(
                { plotUnlockedCells: ownPlot?.unlockedCells, plotExpansions: ownPlot?.expansions },
                (typeof ownPlot?.isTopRow === "boolean" ? ownPlot.isTopRow : s < 4)
            );
            setPlotUnlockedCells(unlocked);
            setPlotExpansions(Math.min(MAX_PLOT_EXPANSIONS, Math.ceil(unlocked.length / BASE_DIRT_COLS)));

            const others = {};
            for (const [pid, pl] of Object.entries(lobby?.players || {})) {
                if (pid === userId) continue;
                if (!pl) continue;
                others[pid] = {
                    userId: pid,
                    name: pl.name || "Spieler",
                    x: Number(pl.x) || 0,
                    y: Number(pl.y) || 0,
                    // 🌟 NEU: Aussehen und Items der anderen mitladen!
                    appearance: pl.appearance,
                    tool: pl.tool,
                    heldItem: pl.heldItem
                };
            }
            remotePlayersRef.current = others;
            setRemotePlayersList(Object.values(others));
            const tgt = {};
            for (const [pid, o] of Object.entries(others)) {
                tgt[pid] = { x: o.x, y: o.y };
            }
            remotePlayerTargetsRef.current = tgt;

            markWorldBootDataReady("multi");
        });

        socket.on("player_joined", ({ player: joined, plots }) => {
            if (plots) {
                plots.forEach((p, idx) => {
                    if (layout.current.slots[idx]) {
                        layout.current.slots[idx].owner = p.ownerName || null;
                        layout.current.slots[idx].ownerId = p.ownerId || null;
                        layout.current.slots[idx].plants = normalizePlotPlantsMap(p.plants || {});
                        layout.current.slots[idx].unlockedCells = normalizePlotUnlockedCells(p.unlockedCells || []);
                        layout.current.slots[idx].currentExpansions = Math.min(MAX_PLOT_EXPANSIONS, Math.ceil(layout.current.slots[idx].unlockedCells.length / BASE_DIRT_COLS));
                    }
                });
            }
            if (!joined || String(joined.id) === userId) return;
            const pid = String(joined.id);
            const jx = Number(joined.x) || 0;
            const jy = Number(joined.y) || 0;
            remotePlayersRef.current = {
                ...remotePlayersRef.current,
                [pid]: {
                    userId: pid,
                    name: joined.name || "Spieler",
                    x: jx,
                    y: jy,
                    // 🌟 NEU: Aussehen und Items vom neuen Spieler laden!
                    appearance: joined.appearance,
                    tool: joined.tool,
                    heldItem: joined.heldItem,
                    badge: joined.badge || null,
                },
            };
            remotePlayerTargetsRef.current[pid] = { x: jx, y: jy };
            setRemotePlayersList(Object.values(remotePlayersRef.current));
        });

        socket.on("player_moved", ({ userId: uid, x, y }) => {
            if (!uid || String(uid) === userId) return;
            const pid = String(uid);
            const prev = remotePlayersRef.current[pid] || { userId: pid, name: "Spieler", x: 0, y: 0 };
            const nx = Number(x) || prev.x;
            const ny = Number(y) || prev.y;
            remotePlayersRef.current = {
                ...remotePlayersRef.current,
                [pid]: { ...prev, x: nx, y: ny },
            };
            remotePlayerTargetsRef.current[pid] = { x: nx, y: ny };
        });

        socket.on("players_batch_moved", (batch) => {
            if (!Array.isArray(batch)) return;
            
            for (const u of batch) {
                const uid = u?.userId != null ? String(u.userId) : "";
                
                // Uns selbst ignorieren wir (die Eigendynamik berechnen wir lokal flüssiger)
                if (!uid || uid === userId) continue;
                
                const tx = Number(u.x);
                const ty = Number(u.y);
                if (!Number.isFinite(tx) || !Number.isFinite(ty)) continue;
                
                const isFacingRight = u.facingRight !== undefined ? u.facingRight : true;
                
                // Falls der Spieler (aus welchem Grund auch immer) noch nicht im Speicher ist
                if (!remotePlayersRef.current[uid]) {
                    remotePlayersRef.current[uid] = { 
                        userId: uid, 
                        name: "Spieler", 
                        x: tx, 
                        y: ty, 
                        facingRight: isFacingRight 
                    };
                }

                // 1. Ziel-Koordinaten für die flüssige Interpolation setzen
                remotePlayerTargetsRef.current[uid] = { x: tx, y: ty };
                
                // 2. 🌟 WICHTIG FÜR DIE OPTIK: Animations-Trigger und Blickrichtung direkt setzen!
                remotePlayersRef.current[uid].facingRight = isFacingRight;
                remotePlayersRef.current[uid].isMoving = true;
            }
        });

        socket.on("player_left", ({ userId: uid, plots, kicked }) => {
            // 1. 🌟 NEU: Bin ICH die Person, die die Lobby verlassen hat / gekickt wurde?
            if (String(uid) === userId) {
                notify(kicked ? "Du wurdest vom Host gekickt." : "Deine Verbindung zur Lobby wurde getrennt.", "error");
                setShowLobbyScreen(true);
                setCurrentLobbyId(null);
                setIsMultiplayer(false);
                socket.disconnect();
                return; // GANZ WICHTIG: Hier abbrechen, restlicher Code betrifft nur andere Spieler
            }

            // 2. BEWÄHRT: Plots aktualisieren (Grundstücke vom gegangenen Spieler leeren)
            if (plots) {
                plots.forEach((p, idx) => {
                    if (layout.current.slots[idx]) {
                        layout.current.slots[idx].owner = p.ownerName || null;
                        layout.current.slots[idx].ownerId = p.ownerId || null;
                        layout.current.slots[idx].plants = normalizePlotPlantsMap(p.plants || {});
                        layout.current.slots[idx].unlockedCells = normalizePlotUnlockedCells(p.unlockedCells || []);
                        layout.current.slots[idx].currentExpansions = Math.min(MAX_PLOT_EXPANSIONS, Math.ceil(layout.current.slots[idx].unlockedCells.length / BASE_DIRT_COLS));
                    }
                });
            }

            // 3. BEWÄHRT: Avatar des gegangenen Spielers aus der Welt löschen
            if (!uid) return;
            const pid = String(uid);
            
            const next = { ...remotePlayersRef.current };
            delete next[pid];
            remotePlayersRef.current = next;
            setRemotePlayersList(Object.values(next));
            
            
            const nt = { ...remotePlayerTargetsRef.current };
            delete nt[pid];
            remotePlayerTargetsRef.current = nt;
        });

        socket.on("player_state_updated", ({ userId: uid, tool, heldItem, appearance, badge }) => {
            if (!uid || String(uid) === userId) return;
            const pid = String(uid);
            if (remotePlayersRef.current[pid]) {
                remotePlayersRef.current[pid] = {
                    ...remotePlayersRef.current[pid],
                    tool,
                    heldItem,
                    appearance,
                    badge: badge || null,
                };
            }
        });

        // Delta plot update: { slotIndex, key, plant } — plant is null when removed
        socket.on("plot_updated", ({ slotIndex, key, plant }) => {
            if (layout.current.slots[slotIndex]) {
                if (plant === null) delete layout.current.slots[slotIndex].plants[key];
                else layout.current.slots[slotIndex].plants[key] = hydratePlantVisuals(plant) || plant;
            }
            if (slotIndex !== mySlotRef.current) return;
            markWorldBootDataReady("multi");
            if (key !== undefined) {
                // Single-cell delta
                setPlotPlants(prev => {
                    const next = { ...prev };
                    if (plant === null) delete next[key];
                    else next[key] = hydratePlantVisuals(plant) || plant;
                    return next;
                });
            }
        });

        socket.on("plot_expanded", ({ slotIndex, expansions, unlockedCells }) => {
            if (layout.current.slots[slotIndex]) {
                if (Array.isArray(unlockedCells)) layout.current.slots[slotIndex].unlockedCells = normalizePlotUnlockedCells(unlockedCells);
                if (typeof expansions === "number") layout.current.slots[slotIndex].currentExpansions = Math.max(0, Math.min(MAX_PLOT_EXPANSIONS, expansions));
            }
            if (slotIndex !== mySlotRef.current) return;
            if (Array.isArray(unlockedCells)) {
                const nextUnlocked = normalizePlotUnlockedCells(unlockedCells);
                setPlotUnlockedCells(nextUnlocked);
                setPlotExpansions(Math.min(MAX_PLOT_EXPANSIONS, Math.ceil(nextUnlocked.length / BASE_DIRT_COLS)));
                return;
            }
            if (typeof expansions === "number") {
                setPlotExpansions(Math.max(0, Math.min(MAX_PLOT_EXPANSIONS, expansions)));
            }
        });

        // Delta player update: { userId, gold?, harvestedItems?, ... }
        socket.on("player_delta", ({ userId: uid, gold: g, inventory: inv, harvestedItems: hi, eggInventory: ei, petInventory: pi, petPlacements: pp, decoInventory: di, decoPlacements: dp, toolInventory: ti, inventoryMaxSlots: ims, mailbox: mb }) => {
            if (uid !== userId) return;
            markWorldBootDataReady("multi");
            if (g !== undefined) setGold(g);
            if (Array.isArray(inv)) setInventory(inv);
            if (Array.isArray(hi)) setHarvestedItems(hi);
            if (Array.isArray(ei)) setEggInventory(ei);
            if (Array.isArray(pi)) setPetInventory(pi);
            if (Array.isArray(pp)) setPetPlacements(pp);
            if (Array.isArray(di)) setDecoInventory(di);
            if (Array.isArray(dp)) setDecoPlacements(dp);
            if (ti && typeof ti === "object") setToolInventory(normalizeToolInventory(ti));
            if (typeof ims === "number") setInventoryMaxSlots(Math.max(50, ims));
            if (Array.isArray(mb)) setMailbox(mb);
        });

        socket.on("shop_rotated", ({ shopRotation: sr, nextRotation, personalShopStock: pss, forUserId }) => {
            markWorldBootDataReady("multi");
            setShopRotationIfChanged(sr || null);
            const seedNext = nextRotation || sr?.nextRotation;
            if (seedNext) {
                seedNextRotationAtRef.current = Number(seedNext);
                setShopCountdown(Math.max(0, seedNext - Date.now()));
            }
            if (forUserId === userId && pss) setPersonalShopStock(pss);
            else if (!forUserId && sr) initPersonalStock(sr);
            // Update ref BEFORE announcing so the MP poll won't trigger a second announcement
            const seedKey = String(sr?.generatedAt || "");
            const isNewSeed = seedKey && seedRotationKeyRef.current !== seedKey;
            if (seedKey) seedRotationKeyRef.current = seedKey;
            if (isNewSeed) announceRotation("🌱 Samen-Shop hat rotiert!");
        });
        socket.on("shop_updated", ({ shopRotation: sr, nextRotation }) => {
            markWorldBootDataReady("multi");
            setShopRotationIfChanged(sr || null);
            const seedNext = nextRotation || sr?.nextRotation;
            if (seedNext) {
                seedNextRotationAtRef.current = Number(seedNext);
                setShopCountdown(Math.max(0, seedNext - Date.now()));
            }
            if (sr) initPersonalStock(sr);
            const seedKey = String(sr?.generatedAt || "");
            if (seedKey) seedRotationKeyRef.current = seedKey;
        });
        socket.on("tool_shop_rotated", ({ toolShopRotation: tr, nextRotation, personalToolStock: pts, forUserId }) => {
            markWorldBootDataReady("multi");
            setToolShopRotation(tr || null);
            const toolNext = nextRotation || tr?.nextRotation;
            if (toolNext) {
                toolNextRotationAtRef.current = Number(toolNext);
                setToolShopCountdown(Math.max(0, toolNext - Date.now()));
            }
            if (forUserId === userId && pts) setToolShopStock(pts);
            const toolKey = String(tr?.generatedAt || "");
            const isNewTool = toolKey && toolRotationKeyRef.current !== toolKey;
            if (toolKey) toolRotationKeyRef.current = toolKey;
            if (isNewTool) announceRotation("🛠️ Tool-Shop neu aufgefüllt!");
        });
        socket.on("egg_shop_rotated", ({ eggShopRotation: er, nextRotation, personalEggStock: pes, forUserId }) => {
            markWorldBootDataReady("multi");
            setEggShopRotation(er || null);
            const eggNext = nextRotation || er?.nextRotation;
            if (eggNext) {
                eggNextRotationAtRef.current = Number(eggNext);
                setEggShopCountdown(Math.max(0, eggNext - Date.now()));
            }
            if (forUserId === userId && pes) setEggShopStock(pes);
            const eggKey = String(er?.generatedAt || "");
            const isNewEgg = eggKey && eggRotationKeyRef.current !== eggKey;
            if (eggKey) eggRotationKeyRef.current = eggKey;
            if (isNewEgg) announceRotation("🥚 Eier-Shop hat rotiert!");
        });

        socket.on("garden_error", ({ message }) => {
            notify(message || "Server-Fehler", "error");
            
            // Deine bestehende Logik für den Boot-State
            worldBootTokenRef.current += 1;
            worldBootKindRef.current = null;
            setWorldBootState((prev) => (prev.active ? { active: false, label: "", progress: 0 } : prev));

            // FIX: Wenn man gekickt wurde ODER die Lobby nicht mehr existiert, 
            // muss man zurück ins Menü, um 404-Fehler zu vermeiden.
            const isFatal = message && (
                message.includes("gekickt") || 
                message.includes("nicht gefunden") || 
                message.includes("voll")
            );

            if (isFatal) {
                setShowLobbyScreen(true);
                setCurrentLobbyId(null);
                setIsMultiplayer(false);
                socket.disconnect();
            }
        });

        socket.on("disconnect", (reason) => {
            console.warn("Socket Disconnect:", reason);
            
            // Wir werfen dich NUR aus dem Menü, wenn du absichtlich gehst ("client disconnect")
            // oder wenn der Server dich aktiv rauswirft ("server disconnect").
            if (reason === "io server disconnect" || reason === "io client disconnect") {
                setIsMultiplayer(false);
                setCurrentLobbyId(null);
                setShowLobbyScreen(true);
            } else {
                // Bei "ping timeout" oder Tab-Standby: Nur warnen, nicht kicken! Socket.io repariert das gleich selbst.
                notify("Verbindung instabil... (Tab im Standby?)", "warning");
            }
        });
        })();

        return () => {
            cancelled = true;
            remotePlayersRef.current = {};
            remotePlayerTargetsRef.current = {};
            if (socket) {
                try {
                    socket.emit("leave_garden_lobby");
                } catch { /* */ }
                try {
                    const blob = new Blob(
                        [JSON.stringify({ state: farmStateRef.current })],
                        { type: "application/json" }
                    );
                    navigator.sendBeacon("/api/garden/farm-state-beacon", blob);
                } catch { /* ignore */ }
                try {
                    socket.disconnect();
                } catch { /* */ }
            }
            socketRef.current = null;
        };
    }, [isMultiplayer, currentLobbyId, showLobbyScreen, apiCall, notify, announceRotation, initPersonalStock, setShopRotationIfChanged, markWorldBootDataReady, hydratePlantVisuals, normalizePlotPlantsMap]);

    useEffect(() => {
        if (!showLobbyScreen) return;
        setIsInitialLoadDone(false);
        worldBootTokenRef.current += 1;
        worldBootKindRef.current = null;
        worldBootStatusRef.current = { preloadDone: false, dataDone: false, minDoneAt: 0 };
        if (worldBootFinishTimerRef.current) clearTimeout(worldBootFinishTimerRef.current);
        setWorldBootState((prev) => (prev.active ? { active: false, label: "", progress: 0 } : prev));
    }, [showLobbyScreen]);

    // Tier-Spezialeffekte (Goldfinder / Seedfinder) — Geschwindigkeit abhängig vom höchsten Pet-Level
    useEffect(() => {
        if (showLobbyScreen) return;

        // Pick interval based on highest goldfinder/seedfinder level among placed pets.
        const getIntervalMs = () => {
            const myPets = farmStateRef.current.petPlacements.filter(p => p.slotIndex === mySlotRef.current);
            const maxLevel = myPets.reduce((m, p) => Math.max(m, p.ability?.level || 0), 0);
            if (maxLevel >= 5) return 20000;  // Lv 5+: 20s
            if (maxLevel >= 4) return 30000;  // Lv 4:  30s
            if (maxLevel >= 3) return 40000;  // Lv 3:  40s
            if (maxLevel >= 2) return 50000;  // Lv 2:  50s
            return 60000;                      // Lv 1:  60s
        };

        let timerId;
        const tick = async () => {
            const state = farmStateRef.current;
            const myPets = state.petPlacements.filter(p => p.slotIndex === mySlotRef.current);
            if (myPets.length) {
                let earnedGold = 0;
                let foundSeeds = [];
                let msgs = [];

                myPets.forEach(pet => {
                    if (!pet.ability) return;
                    if (Math.random() < 0.10) {
                        if (pet.ability.type === "goldfinder") {
                            let min = 1000, max = 50000;
                            if (pet.ability.level === 2) { min = 51000; max = 200000; }
                            if (pet.ability.level === 3) { min = 201000; max = 600000; }
                            if (pet.ability.level === 4) { min = 601000; max = 2000000; }
                            if (pet.ability.level >= 5) { min = 2001000; max = 10000000; }
                            const goldFound = Math.floor(Math.random() * (max - min + 1)) + min;
                            earnedGold += goldFound;
                            msgs.push(`${pet.emoji} +${goldFound.toLocaleString('de-DE')} 🪙`);
                        } else if (pet.ability.type === "seedfinder") {
                            const available = shopRotation?.seeds || [];
                            const targetRarities =
                                pet.ability.level === 1 ? ["COMMON"] :
                                pet.ability.level === 2 ? ["COMMON", "UNCOMMON"] :
                                pet.ability.level === 3 ? ["UNCOMMON", "RARE"] :
                                pet.ability.level === 4 ? ["RARE", "EPIC"] :
                                ["EPIC", "LEGENDARY", "MYTHIC"];
                            const pool = available.filter(s => targetRarities.includes(s.rarity));
                            if (pool.length > 0) {
                                const picked = pool[Math.floor(Math.random() * pool.length)];
                                foundSeeds.push(picked);
                                msgs.push(`${pet.emoji} +1x ${picked.name}`);
                            } else {
                                const goldFallback = pet.ability.level * 100000;
                                earnedGold += goldFallback;
                                msgs.push(`${pet.emoji} +${goldFallback.toLocaleString('de-DE')} 🪙`);
                            }
                        }
                    }
                });

                if (earnedGold > 0 || foundSeeds.length > 0) {
                    if (isMultiplayer && currentLobbyId) {
                        try {
                            await apiCall(`/lobby/${currentLobbyId}/pet-earn`, {
                                method: "POST",
                                body: JSON.stringify({ gold: earnedGold, seeds: foundSeeds }),
                            });
                        } catch { /* Gold ist nicht-kritisch, silent fail */ }
                    } else {
                        if (earnedGold > 0) setGold(g => g + earnedGold);
                        if (foundSeeds.length > 0) {
                            setInventory(inv => {
                                const next = [...inv];
                                foundSeeds.forEach(s => next.push({ ...s, instanceId: Math.random().toString(36).slice(2) }));
                                return next;
                            });
                        }
                        schedulePostMpUpdateFarm();
                    }
                    notify(msgs.join(" | "), "info");
                }
            }
            timerId = setTimeout(tick, getIntervalMs());
        };

        timerId = setTimeout(tick, getIntervalMs());
        return () => clearTimeout(timerId);
    }, [showLobbyScreen, shopRotation, isMultiplayer, currentLobbyId, apiCall, schedulePostMpUpdateFarm, notify])

    useEffect(() => {
        localPlayerNameRef.current = authUser?.twitchLogin || authUser?.login || "Spieler";
    }, [authUser]);

    useEffect(() => {
        if (isMultiplayer || !layout.current?.slots?.[0]) return;
        layout.current.slots[0].owner = authUser?.twitchLogin || authUser?.login || "Spieler";
    }, [authUser, isMultiplayer]);

    // Check subscriber / beta-tester status after auth
    useEffect(() => {
        if (!authUser) return;
        apiCall("/is-subscriber")
            .then((data) => {
                const sub = Boolean(data.isSubscriber);
                const beta = Boolean(data.isBeta);
                setIsSubscriber(sub);
                setIsBeta(beta);
                playerBadgeRef.current = sub ? "subscriber" : beta ? "beta" : null;
            })
            .catch(() => {});
    }, [authUser, apiCall]);

    const playerBadge = isSubscriber ? "subscriber" : isBeta ? "beta" : null;

    // ── Shop countdown display ─────────────────────────────────────────────────
    const shopMins = Math.floor(shopCountdown / 60000);
    const shopSecs = Math.floor((shopCountdown % 60000) / 1000);
    const toolMins = Math.floor(toolShopCountdown / 60000);
    const toolSecs = Math.floor((toolShopCountdown % 60000) / 1000);
    const eggMins = Math.floor(eggShopCountdown / 60000);
    const eggSecs = Math.floor((eggShopCountdown % 60000) / 1000);
    const formatCountdown = (mins, secs) => `${mins}:${String(secs).padStart(2, "0")} min`;
    const getCountdownBadgeClass = (ms) => {
        if (ms <= 30_000) return "bg-rose-900/70 border-rose-400 text-rose-200 animate-pulse";
        if (ms <= 90_000) return "bg-amber-900/70 border-amber-400 text-amber-200";
        return "bg-sky-900/60 border-sky-500/70 text-sky-200";
    };
    const formatDuration = (ms) => {
        const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
        const hours = Math.floor(totalSeconds / 3600);
        const mins = Math.floor((totalSeconds % 3600) / 60);
        const secs = totalSeconds % 60;
        if (hours > 0) return `${hours}h ${mins}m ${secs}s`;
        if (mins > 0) return `${mins}m ${secs}s`;
        return `${secs}s`;
    };
    const getPlantHoverSizeLabel = (plant) => {
        if (!plant || !isPlantReady(plant)) return null;
        if (plant.singleUse) {
            if (Number.isFinite(plant.size)) return String(plant.size);
            if (Number.isFinite(plant.norm)) return String(Math.max(1, Math.round(1 + 49 * plant.norm)));
            return "1-50";
        }
        return null;
    };
    const getReadyFruitSizes = (plant) => {
        if (!plant || !isPlantReady(plant)) return [];
        if (plant.singleUse) {
            const size = getPlantHoverSizeLabel(plant);
            return size ? [size] : [];
        }
        const now = Date.now();
        const readySlots = (plant.fruitSlots || []).filter((slot) => (slot?.readyAt || 0) <= now);
        if (!readySlots.length) return [];
        return readySlots.map((slot) => {
            if (Number.isFinite(slot?.size)) return String(slot.size);
            if (Number.isFinite(slot?.norm)) return String(Math.max(1, Math.round(1 + 49 * slot.norm)));
            return "1-50";
        });
    };
    const getSpecialLabel = (specialData) => {
        if (!specialData?.name) return null;
        if (specialData.name === "Golden") return "✨ Golden";
        if (specialData.name === "Rainbow") return "🌈 Rainbow";
        return specialData.name;
    };
    const getStatusEffectLabel = (statusEffect) => {
        if (!statusEffect) return null;
        if (statusEffect === "wet") return "💧 Nass";
        if (statusEffect === "frozen") return "❄️ Gefroren";
        if (statusEffect === "charged") return "⚡ Aufgeladen";
        if (statusEffect === "moonlit") return "🌙 Mondlicht";
        return null;
    };
    const getItemTooltipStyle = (x, y) => {
        const viewportW = typeof window !== "undefined" ? window.innerWidth : 1920;
        const viewportH = typeof window !== "undefined" ? window.innerHeight : 1080;
        const tooltipW = 230;
        const tooltipH = 132;
        let left = x + 12;
        let top = y + 12;
        if (left + tooltipW > viewportW - 8) left = viewportW - tooltipW - 8;
        if (top + tooltipH > viewportH - 8) top = y - tooltipH - 12;
        if (left < 8) left = 8;
        if (top < 8) top = 8;
        return { left, top };
    };
    const equippedTools = {
        shovel: toolInventory.hasShovel ? { name: "Dauerhaft" } : null,
        pot: (toolInventory.plantPots || 0) > 0 ? { name: String(toolInventory.plantPots || 0) } : null,
        pickaxe: (toolInventory.pickaxeUses || 0) > 0 ? { name: String(toolInventory.pickaxeUses || 0) } : null,
        watering: (toolInventory.wateringCans || 0) > 0 ? { name: String(toolInventory.wateringCans || 0) } : null,
    };
    const hotbarItems = [
        ...inventory.map(s => ({ ...withVisuals(s), _type: "seed" })),
        ...harvestedItems.map(p => ({ ...withVisuals(p), _type: "plant" })),
        ...eggInventory.map(e => ({ ...e, _type: "egg" })),
        ...petInventory.map(p => ({ ...p, _type: "pet" })),
        ...decoInventory.map(d => ({ ...d, _type: "deco" })), // 3. ANPASSUNG: Deko ergänzt
    ];
    const visibleShopSeeds = useMemo(() => {
        const seeds = shopRotation?.seeds || [];
        return seeds.filter((s) => shopFilter === "all" || s.active);
    }, [shopRotation?.seeds, shopFilter]);
    const handleSellAllHarvested = useCallback(async () => {
        if (harvestedItems.length === 0) return;
        playSound("cash", 0.6);
        if (isMultiplayer && currentLobbyId) {
            try {
                const data = await apiCall(`/lobby/${currentLobbyId}/sell-all`, { method: "POST", body: JSON.stringify({}) });
                notify(`Alles verkauft: +${(data.goldEarned || 0).toLocaleString('de-DE')} 🪙`);
            } catch (e) {
                notify(e.message || "Verkauf fehlgeschlagen", "error");
            }
            return;
        }
        const subBonus = isSubscriber ? 1.5 : 1.0;
        const total = Math.floor(harvestedItems.reduce((sum, item) => sum + item.sellValue, 0) * subBonus);
        setHarvestedItems([]);
        setGold(g => g + total);
        notify(`Alles verkauft: +${total.toLocaleString('de-DE')} 🪙${isSubscriber ? " ⭐ +50% Sub" : ""}`);
    }, [harvestedItems, isMultiplayer, currentLobbyId, apiCall, notify, playSound, isSubscriber]);

    useEffect(() => {
        sellAllRef.current = handleSellAllHarvested;
    }, [handleSellAllHarvested]);

    const handleSellSelectedPet = useCallback(() => {
        if (!selectedPetToPlace) {
            notify("Kein Tier in der Hand. Wähle zuerst ein Tier aus dem Rucksack.", "error");
            return;
        }
        const rarity = selectedPetToPlace.rarity || "COMMON";
        const price = PET_SELL_PRICES[rarity] ?? PET_SELL_PRICES.COMMON;
        const emoji = selectedPetToPlace.emoji || getPetEmoji(selectedPetToPlace.name);
        const name = selectedPetToPlace.name || "Tier";
        const petId = selectedPetToPlace.id || selectedPetToPlace.instanceId;
        setPetInventory(prev => prev.filter(p => (p.id || p.instanceId) !== petId));
        setSelectedPetToPlace(null);
        setGold(g => g + price);
        playSound("cash", 0.6);
        notify(`${emoji} ${name} verkauft: +${price.toLocaleString('de-DE')} 🪙`);
    }, [selectedPetToPlace, notify, playSound]);

    useEffect(() => {
        sellPetRef.current = handleSellSelectedPet;
    }, [handleSellSelectedPet]);

    const flushFarmStateToServer = useCallback(async () => {
        const payload = {
            gold, inventory, plotPlants, plotExpansions, plotUnlockedCells, harvestedItems,
            eggInventory, petInventory, petPlacements, decoInventory, decoPlacements,
            toolInventory, inventoryMaxSlots, incubator,
            shopStock: personalShopStock,
            shopStockVersion: shopRotation?.generatedAt,
            toolShopStock: toolShopStock,
            toolShopStockVersion: toolShopRotation?.generatedAt,
            eggShopStock: eggShopStock,
            eggShopStockVersion: eggShopRotation?.generatedAt,
            tutorialCompleted,
        };
        try {
            await apiCall("/farm-state", { method: "PUT", body: JSON.stringify({ state: payload }) });
        } catch { /* not logged in / offline — multiplayer still attempts socket */ }
    }, [apiCall, gold, inventory, plotPlants, plotExpansions, plotUnlockedCells, harvestedItems, eggInventory, petInventory, petPlacements, decoInventory, decoPlacements, toolInventory, inventoryMaxSlots, incubator, personalShopStock, shopRotation?.generatedAt, toolShopStock, toolShopRotation?.generatedAt, eggShopStock, eggShopRotation?.generatedAt]);

    useEffect(() => { flushFarmStateToServerRef.current = flushFarmStateToServer; }, [flushFarmStateToServer]);

    const ensureTwitchSessionForGarden = useCallback(async () => {
        try {
            const r = await fetch("/api/auth/me", { credentials: "include" });
            if (!r.ok) {
                notify("Bitte mit Twitch anmelden, um den Garten zu spielen.", "error");
                return false;
            }
            return true;
        } catch {
            notify("Anmeldung konnte nicht geprüft werden.", "error");
            return false;
        }
    }, [notify]);

    const startSingleplayer = async () => {
        if (!(await ensureTwitchSessionForGarden())) return;
        setIsMultiplayer(false);
        setCurrentLobbyId(null);
        startWorldBoot("single");
        // startWorldBoot regenerates layout.current — set owner on the freshly created slot
        if (layout.current?.slots?.[0]) {
            layout.current.slots[0].owner = authUser?.twitchLogin || authUser?.login || "Spieler";
        }
        setShowLobbyScreen(false);
    };

    const createMultiplayerLobby = async () => {
        if (!(await ensureTwitchSessionForGarden())) return;
        try {
            const data = await apiCall("/create-lobby", {
                method: "POST",
                body: JSON.stringify({
                    isPrivate: hostPrivateLobby,
                    maxPlayers: Number(hostMaxPlayers || 8),
                }),
            });
            setCurrentLobbyId(data.lobbyId);
            setIsMultiplayer(true);
            startWorldBoot("multi", Number(hostMaxPlayers || 8));
            setShowLobbyScreen(false);
        } catch (e) {
            notify(e.message || "Lobby konnte nicht erstellt werden.", "error");
        }
    };

    const joinMultiplayerLobby = async (lobbyId) => {
        if (!lobbyId) return;
        
        // FIX: UUIDs müssen für das Backend zwingend kleingeschrieben sein!
        const cleanLobbyId = lobbyId.trim().toLowerCase();
        
        if (!(await ensureTwitchSessionForGarden())) return;
        try {
            const data = await apiCall(`/lobby/${cleanLobbyId}`);
            setCurrentLobbyId(cleanLobbyId);
            setIsMultiplayer(true);
            startWorldBoot("multi", data.maxPlayers || 8);
            setShowLobbyScreen(false);
        } catch (e) {
            notify(e.message || "Lobby nicht gefunden.", "error");
        }
    };

    if (showLobbyScreen) {
        return (
            <div className="w-full flex-1 min-h-0 h-full bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-emerald-950 text-white flex items-center justify-center p-6 relative overflow-hidden" style={{ fontFamily: "'Courier New', monospace" }}>
                {/* 5. ANPASSUNG: Deko Kreise im Hintergrund */}
                <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-emerald-600/10 rounded-full blur-[100px]" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[120px]" />
                
                <div className="w-full max-w-4xl bg-slate-950/60 border border-emerald-500/20 rounded-[2rem] p-8 md:p-12 shadow-[0_0_50px_rgba(0,0,0,0.5)] backdrop-blur-md relative z-10">
                    <div className="text-center mb-10">
                        <h1 className="text-4xl md:text-5xl font-black tracking-widest mb-3 bg-gradient-to-br from-emerald-300 to-cyan-400 bg-clip-text text-transparent drop-shadow-sm">Virtual Farm</h1>
                        <p className="text-slate-400 text-sm tracking-wide">Wähle deinen Modus und tauche ein in deinen Garten.</p>
                    </div>

                    <div className="mb-8 rounded-2xl border border-white/5 bg-white/5 p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="text-center sm:text-left">
                            <div className="text-slate-400 uppercase tracking-widest text-[10px] font-bold mb-1">Twitch Konto</div>
                            {authUser?.twitchLogin || authUser?.login ? (
                                <div className="text-emerald-400 font-bold text-lg flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"/> {(authUser?.twitchLogin || authUser?.login)}</div>
                            ) : (
                                <div className="text-amber-400 font-bold text-sm">Nicht angemeldet — Garten erfordert Twitch-Login</div>
                            )}
                        </div>
                        {!authUser && (
                            <button onClick={() => twitchLogin?.()} className="px-6 py-3 rounded-xl bg-[#9146FF] hover:bg-[#7d36ff] text-white text-sm font-black shadow-[0_0_15px_rgba(145,70,255,0.4)] transition-all hover:scale-105 w-full sm:w-auto">
                                Login mit Twitch
                            </button>
                        )}
                    </div>

                    {authUser && (isSubscriber || isBeta) && (
                        <div className="mb-6 flex flex-wrap gap-2 justify-center">
                            {isSubscriber && (
                                <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-900/30 border border-amber-500/40 text-amber-300 text-sm font-bold">
                                    ⭐ Subscriber — +50% Verkaufsbonus aktiv
                                </div>
                            )}
                            {isBeta && (
                                <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-900/30 border border-blue-500/40 text-blue-300 text-sm font-bold">
                                    🔬 Beta-Tester
                                </div>
                            )}
                        </div>
                    )}
                    {authUser && !isSubscriber && !isBeta && (
                        <div className="mb-6 text-center text-xs text-slate-600">
                            Kein aktives Badge — Abonniere den Kanal für ⭐ Sub-Bonus
                        </div>
                    )}

                    <div className="flex gap-3 mb-8 p-1.5 bg-slate-900/80 rounded-2xl border border-slate-800 w-fit mx-auto">
                        <button onClick={() => setLobbyMode("single")} className={`px-8 py-3 rounded-xl font-bold transition-all ${lobbyMode === "single" ? "bg-emerald-600 text-white shadow-lg" : "text-slate-400 hover:text-white hover:bg-slate-800"}`}>Singleplayer</button>
                        <button onClick={() => setLobbyMode("multi")} className={`px-8 py-3 rounded-xl font-bold transition-all ${lobbyMode === "multi" ? "bg-indigo-600 text-white shadow-lg" : "text-slate-400 hover:text-white hover:bg-slate-800"}`}>Multiplayer</button>
                    </div>

                    {lobbyMode === "single" && (
                        <div className="text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <button
                                type="button"
                                onClick={startSingleplayer}
                                disabled={!authUser}
                                className="px-10 py-5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 font-black text-xl shadow-[0_0_30px_rgba(5,150,105,0.3)] transition-all hover:scale-105 w-full md:w-auto disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
                            >
                                🌱 Welt betreten
                            </button>
                        </div>
                    )}

                    {lobbyMode === "multi" && (
                        <div className="grid md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            {/* Host Section */}
                            <div className="p-6 rounded-2xl bg-slate-900/80 border border-indigo-500/30 flex flex-col">
                                <div className="text-lg font-black text-indigo-300 mb-4 flex items-center gap-2"><span>👑</span> Eigene Lobby hosten</div>
                                <div className="flex items-center gap-4 mb-6">
                                    <label className="text-sm text-slate-300 flex items-center gap-2 cursor-pointer">
                                        <input type="checkbox" checked={hostPrivateLobby} onChange={(e) => setHostPrivateLobby(e.target.checked)} className="w-5 h-5 rounded border-slate-600 text-indigo-500 focus:ring-indigo-500 bg-slate-800" />
                                        Privat
                                    </label>
                                    <label className="text-sm text-slate-300 flex items-center gap-2">
                                        Spieler:
                                        <input type="number" min={2} max={8} value={hostMaxPlayers} onChange={(e) => setHostMaxPlayers(e.target.value)} className="w-16 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-center focus:border-indigo-500 outline-none transition-colors" />
                                    </label>
                                </div>
                                <button
                                    type="button"
                                    onClick={createMultiplayerLobby}
                                    disabled={!authUser}
                                    className="mt-auto w-full px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-base font-black shadow-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    Lobby erstellen
                                </button>
                            </div>

                            {/* Join Section */}
                            <div className="flex flex-col gap-6">
                                <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-700">
                                    <div className="text-sm font-bold text-slate-400 mb-3">Mit Code beitreten</div>
                                    <div className="flex gap-2">
                                        <input value={roomCode} onChange={(e) => setRoomCode(e.target.value.toUpperCase())} placeholder="ABC-123..." className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-lg tracking-widest text-center focus:border-blue-500 outline-none transition-colors" />
                                        <button type="button" onClick={() => joinMultiplayerLobby(roomCode)} disabled={!roomCode.trim() || !authUser} className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-600 font-black transition-colors">Join</button>
                                    </div>
                                </div>
                                
                                <div className="flex-1 flex flex-col">
                                    <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 pl-2">Öffentliche Räume</div>
                                    <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                                        {publicLobbies.length === 0 && <div className="text-center py-4 text-sm text-slate-600 italic">Aktuell keine öffentlichen Lobbys.</div>}
                                        {publicLobbies.map((lobby) => (
                                            <div key={lobby.id} className="p-4 rounded-xl bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 flex items-center justify-between group transition-colors">
                                                <div>
                                                    <div className="font-bold text-emerald-100">{lobby.hostName || lobby.host}</div>
                                                    <div className="text-xs text-slate-500 font-mono mt-0.5">{lobby.playerCount || lobby.players}/{lobby.maxPlayers} Spieler</div>
                                                </div>
                                                <button type="button" onClick={() => joinMultiplayerLobby(lobby.id)} disabled={!authUser} className="px-4 py-2 rounded-lg bg-emerald-600/20 text-emerald-400 border border-emerald-600/50 group-hover:bg-emerald-600 group-hover:text-white text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed">Beitreten</button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // /api/auth/me liefert twitchId (nicht userId/id) — mit Server-IDs vergleichen
    const myAccountId = String(authUser?.twitchId ?? authUser?.userId ?? authUser?.id ?? "");
    const isOwnMailbox =
        mailboxTargetId != null && myAccountId !== "" && String(mailboxTargetId) === myAccountId;

    const toggleGiftItem = (type, item) => {
        setGiftItems(prev => {
            const exists = prev.find(i => (i.item.instanceId || i.item.id) === (item.instanceId || item.id));
            if (exists) return prev.filter(i => (i.item.instanceId || i.item.id) !== (item.instanceId || item.id));
            return [...prev, { type, item }];
        });
    };

    return (
        <div className="relative w-full h-full min-h-0 flex-1 bg-slate-950 overflow-hidden" style={{ fontFamily: "'Courier New', monospace" }}>
            <canvas ref={canvasRef} className="absolute inset-0" />
            {worldBootState.active && (
                <div className="absolute inset-0 z-[120] bg-slate-950/92 backdrop-blur-sm flex items-center justify-center">
                    <div className="w-[min(520px,90vw)] rounded-2xl border border-emerald-500/40 bg-slate-900/95 p-6 shadow-2xl">
                        <div className="text-2xl font-black tracking-wide text-emerald-200 mb-1">Garden Game lädt...</div>
                        <div className="text-sm text-slate-300 mb-4">{worldBootState.label || "Bitte warten..."}</div>
                        <div className="h-2.5 w-full rounded-full border border-slate-600 bg-slate-800 overflow-hidden">
                            <div
                                className="h-full bg-emerald-500 transition-all duration-200"
                                style={{ width: `${Math.max(4, Math.min(100, worldBootState.progress || 0))}%` }}
                            />
                        </div>
                        <div className="text-right text-xs text-slate-400 mt-2">{Math.round(worldBootState.progress || 0)}%</div>
                    </div>
                </div>
            )}
            

            {/* ── Tutorial Overlay ──────────────────────────────────────── */}
            {!tutorialCompleted && !showLobbyScreen && (
                <div className="absolute top-24 left-1/2 -translate-x-1/2 z-40 bg-slate-900/90 border-2 border-emerald-500 rounded-xl p-4 shadow-2xl max-w-sm pointer-events-auto">
                    <h3 className="text-emerald-400 font-black text-lg mb-2 flex items-center justify-center gap-2">
                        <span>🌱</span> Tutorial
                    </h3>
                    <div className="text-slate-200 text-sm font-medium leading-relaxed text-center">
                        {inventory.length === 0 && Object.keys(plotPlants).length === 0 && harvestedItems.length === 0 && gold <= 500 && (
                            <p>Willkommen! Gehe zum <span className="text-yellow-400">Samen-Shop</span> (🛒) und kaufe deinen ersten Samen.</p>
                        )}
                        {inventory.length > 0 && Object.keys(plotPlants).length === 0 && harvestedItems.length === 0 && (
                            <p>Super! Wähle nun den Samen in deinem <span className="text-blue-400">Inventar</span> (🎒) aus und klicke auf ein leeres Feld, um ihn zu <span className="text-emerald-400">pflanzen</span>.</p>
                        )}
                        {Object.keys(plotPlants).length > 0 && harvestedItems.length === 0 && (
                            <p>Die Pflanze wächst! Warte einen Moment und klicke sie an, sobald sie fertig ist, um sie zu <span className="text-orange-400">ernten</span>.</p>
                        )}
                        {harvestedItems.length > 0 && (
                            <p>Toll gemacht! Gehe zum <span className="text-purple-400">Markt</span> (🏪) und verkaufe deine Ernte für Gold.</p>
                        )}
                        {gold > 500 && harvestedItems.length === 0 && Object.keys(plotPlants).length === 0 && inventory.length === 0 && (
                            <p>Glückwunsch! Du hast das Tutorial abgeschlossen.</p>
                        )}
                    </div>
                    <button 
                        className="mt-3 w-full py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-bold text-xs transition-colors"
                        onClick={() => {
                            setTutorialCompleted(true);
                            schedulePostMpUpdateFarm();
                        }}
                    >
                        Tutorial beenden
                    </button>
                </div>
            )}

            {/* ── Notification toast ──────────────────────────────────────── */}
            {notification && (
                <div key={notification.id} className={`absolute top-24 left-1/2 -translate-x-1/2 z-[300] px-6 py-3 rounded-full text-sm font-black shadow-2xl animate-bounce
                    ${notification.type === "error" ? "bg-red-600 text-white" : "bg-green-600 text-white"}`}>
                    {notification.msg}
                </div>
            )}
            {/* Shop-Rotationen: gestapelt (gleiche Minute → nicht übereinander) */}
            {rotationBanners.length > 0 && (
                <div className="pointer-events-none absolute left-1/2 top-[4.75rem] z-[38] flex max-w-[min(94vw,520px)] -translate-x-1/2 flex-col items-stretch gap-2">
                    {rotationBanners.map((b) => (
                        <div
                            key={b.id}
                            className="rounded-2xl border border-cyan-400/80 bg-cyan-800/95 px-5 py-2.5 text-center text-sm font-black text-white shadow-2xl backdrop-blur-sm sm:text-base animate-pulse"
                        >
                            {b.msg}
                        </div>
                    ))}
                </div>
            )}

            {/* ── Oben Mitte: Lobby-Code ─────────────────────────────────── */}
            {isMultiplayer && currentLobbyId && (
                <button
                    type="button"
                    className="absolute top-5 left-1/2 z-40 flex h-11 max-w-[min(92vw,22rem)] min-h-[44px] -translate-x-1/2 items-center justify-center gap-2 rounded-xl border border-slate-600 bg-slate-900/95 px-4 font-mono text-xs font-bold text-slate-100 shadow-lg backdrop-blur-sm transition-colors hover:bg-slate-800 sm:text-sm"
                    onClick={() => {
                        navigator.clipboard.writeText(currentLobbyId).catch(() => {});
                        notify("Lobby-Code kopiert!", "info");
                    }}
                    title="Lobby-Code kopieren"
                >
                    <span className="shrink-0 text-base">🔑</span>
                    <span className="truncate">{currentLobbyId.slice(0, 8).toUpperCase()}</span>
                    <span className="shrink-0 text-slate-400">✂️</span>
                </button>
            )}

            {/* ── Links oben: Einstellungen, Spieler, Changelog ──────────── */}
            <div className="absolute top-5 left-5 z-50 flex items-center gap-2">
                <button
                    onClick={(e) => {
                        e.currentTarget.blur();
                        setSettingsOpen((prev) => !prev);
                    }}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-600 bg-slate-800/90 shadow-lg backdrop-blur-sm transition-all hover:bg-slate-700"
                >
                    <span className="text-xl">⚙️</span>
                </button>
                {isMultiplayer && currentLobbyId && (
                    <button
                        type="button"
                        onClick={() => setPlayerListOpen(true)}
                        title="Spielerliste"
                        className="flex h-11 min-h-[44px] shrink-0 items-center justify-center gap-1.5 rounded-xl border border-indigo-600/50 bg-slate-900/90 px-3 text-sm font-bold text-indigo-300 shadow-lg backdrop-blur-sm transition-colors hover:bg-slate-800 hover:text-white sm:min-w-[7.5rem]"
                    >
                        <span className="text-base">👥</span>
                        <span className="hidden sm:inline">Spieler</span>
                    </button>
                )}
                <button
                    type="button"
                    onClick={() => setChangelogOpen(true)}
                    title="Changelog"
                    className="flex h-11 min-h-[44px] shrink-0 items-center justify-center gap-1.5 rounded-xl border border-blue-600/50 bg-slate-900/90 px-3 text-sm font-bold text-blue-300 shadow-lg backdrop-blur-sm transition-colors hover:bg-slate-800 hover:text-white sm:min-w-[7.5rem]"
                >
                    <span className="text-base">📜</span>
                    <span className="hidden sm:inline">Changelog</span>
                </button>
            </div>

            {isSettingsOpen && (
                <div className="absolute top-[70px] left-5 z-50 w-64 bg-slate-900/95 border border-slate-700 rounded-xl p-2 shadow-2xl flex flex-col gap-1">
                    
                    {/* --- AUDIO --- */}
                    <div className="px-3 pt-2 text-[11px] uppercase tracking-wider text-slate-400 font-bold">
                        Audio
                    </div>
                    <div className="px-3 pb-2 space-y-2 mt-1">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-xs text-slate-300 w-12">Effekte</span>
                            <input
                                type="range" min="0" max="1" step="0.05"
                                value={effectVolume}
                                onChange={(e) => setEffectVolume(parseFloat(e.target.value))}
                                onMouseUp={(e) => e.currentTarget.blur()}
                                onTouchEnd={(e) => e.currentTarget.blur()}
                                className="flex-1 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                            />
                            <span className="text-xs font-mono text-slate-400 w-8 text-right">{Math.round(effectVolume * 100)}%</span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-xs text-slate-300 w-12">Musik</span>
                            <input
                                type="range" min="0" max="1" step="0.05"
                                value={musicVolume}
                                onChange={(e) => setMusicVolume(parseFloat(e.target.value))}
                                onMouseUp={(e) => e.currentTarget.blur()}
                                onTouchEnd={(e) => e.currentTarget.blur()}
                                className="flex-1 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-fuchsia-500"
                            />
                            <span className="text-xs font-mono text-slate-400 w-8 text-right">{Math.round(musicVolume * 100)}%</span>
                        </div>
                    </div>

                    {/* --- TRENNLINIE --- */}
                    <div className="h-px bg-slate-700/50 mx-2 my-1" />

                    {/* --- RENDER QUALITÄT --- */}
                    <div className="px-3 pt-2 text-[11px] uppercase tracking-wider text-slate-400 font-bold">
                        Render Qualität
                    </div>
                    <div className="px-2 pb-2 flex gap-1 mt-1">
                        {["low", "medium", "high"].map((level) => (
                            <button
                                key={level}
                                onClick={() => {
                                    const preset = RENDER_QUALITY_PRESETS[level];
                                    setRenderProfile(preset);
                                    renderProfileRef.current = preset;
                                }}
                                className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                                    renderProfile.level === level
                                        ? "bg-cyan-600 text-white"
                                        : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                                }`}
                            >
                                {level === "low" ? "Niedrig" : level === "medium" ? "Mittel" : "Hoch"}
                            </button>
                        ))}
                    </div>
                    
                    {/* 6. ANPASSUNG: Hotkey Info Liste */}
                    <div className="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wider text-slate-400 font-bold mt-2 border-t border-slate-700">
                        Tastenkürzel
                    </div>
                    <div className="px-3 pb-3 text-xs text-slate-300 space-y-1.5">
                        <div className="flex justify-between items-center"><span>Markt</span> <kbd className="bg-slate-800 border border-slate-600 px-1.5 rounded">Shift + 1</kbd></div>
                        <div className="flex justify-between items-center"><span>Shop</span> <kbd className="bg-slate-800 border border-slate-600 px-1.5 rounded">Shift + 2</kbd></div>
                        <div className="flex justify-between items-center"><span>Farm</span> <kbd className="bg-slate-800 border border-slate-600 px-1.5 rounded">Shift + 3</kbd></div>
                        <div className="flex justify-between items-center"><span>Öffnen</span> <kbd className="bg-slate-800 border border-slate-600 px-1.5 rounded">Leertaste / E</kbd></div>
                        <div className="flex justify-between items-center"><span>Tools</span> <kbd className="bg-slate-800 border border-slate-600 px-1.5 rounded">1 - 4</kbd></div>
                    </div>

                    <button
                        onClick={async () => {
                            if (!isMultiplayer) {
                                await flushFarmStateToServer();
                            }
                            setSettingsOpen(false);
                            setShowLobbyScreen(true);
                            setIsMultiplayer(false);
                            setCurrentLobbyId(null);
                        }}
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-800 text-sm text-slate-200 mt-1 border-t border-slate-700"
                    >
                        Zurueck zum Hauptbildschirm
                    </button>
                    <button
                        onClick={() => { window.location.href = "https://vnmvalentin.de"; }}
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-800 text-sm text-slate-200"
                    >
                        Zur Website
                    </button>
                </div>
            )}

            {/* ── Rechts: Münzen, Wetter, Umkleide, Tiere ────────────────── */}
            <div className="absolute top-5 right-5 z-40 flex w-[12.5rem] flex-col gap-2">
                <div className="flex h-11 min-h-[44px] items-center justify-between rounded-xl border border-yellow-600/50 bg-slate-900/90 px-3 shadow-lg backdrop-blur-sm">
                    <span className="truncate font-black tracking-wider text-yellow-400">{gold.toLocaleString("de-DE")}</span>
                    <span className="shrink-0 text-xl leading-none">🪙</span>
                </div>

                <div className="flex h-11 min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-slate-600 bg-slate-900/80 px-3 text-sm font-bold text-slate-300 shadow-lg backdrop-blur-sm">
                    <span className="shrink-0 text-base">🌤️</span>
                    <span className="truncate">{weatherState?.label || "Sonne"}</span>
                </div>

                <button
                    type="button"
                    onClick={() => setWardrobeOpen(true)}
                    className="flex h-11 min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-fuchsia-600/50 bg-slate-900/90 text-sm font-bold text-fuchsia-300 shadow-lg backdrop-blur-sm transition-colors hover:bg-slate-800 hover:text-white"
                >
                    <span className="text-base">👕</span>
                    <span>Umkleide</span>
                </button>

                {/* Tiere: gleiche Höhe, Dropdown darunter */}
                <div className="group relative z-50">
                    <div className="flex h-11 min-h-[44px] w-full cursor-pointer items-center justify-between gap-2 rounded-xl border border-emerald-600/50 bg-slate-900/90 px-3 text-sm font-bold text-emerald-300 shadow-lg backdrop-blur-sm transition-colors hover:bg-slate-800">
                        <span className="flex min-w-0 items-center gap-2 truncate">
                            <span className="shrink-0 text-base">🐾</span>
                            <span className="truncate">Tiere ({petPlacements.filter((p) => p.slotIndex === mySlotIndex).length}/3)</span>
                        </span>
                        <span className="shrink-0 text-[10px] opacity-70">▼</span>
                    </div>
                    {petPlacements.filter(p => p.slotIndex === mySlotIndex).length > 0 && (
                        <div className="absolute right-0 top-full z-50 hidden w-full min-w-[12.5rem] pt-2 group-hover:block">
                            <div className="flex flex-col gap-1.5 bg-slate-900/95 border border-slate-700 p-2.5 rounded-xl shadow-2xl">
                                <div className="text-[10px] text-slate-400 uppercase tracking-widest mb-1 text-center font-bold">Aktive Tiere</div>
                                {petPlacements.filter(p => p.slotIndex === mySlotIndex).map((pet, i) => (
                                    <div key={pet.id || i} className="flex items-center justify-between bg-slate-800/80 p-2 rounded-lg border border-slate-700">
                                        <span className="text-xs text-slate-200 truncate pr-2">{pet.emoji} {pet.name}</span>
                                        <button 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setPetPlacements(prev => prev.filter(p2 => p2.id !== pet.id));
                                                setPetInventory(prev => [...prev, { ...pet, _type: "pet" }]);
                                                notify(`${pet.emoji || "🐾"} eingepackt.`);
                                                if (isMultiplayer) schedulePostMpUpdateFarm();
                                            }}
                                            className="text-[10px] bg-emerald-600 hover:bg-emerald-500 text-white px-2 py-1 rounded shadow-sm font-bold transition-all active:scale-95"
                                        >
                                            Einpacken
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Selected seed indicator ──────────────────────────────────── */}
            {selectedTool && (
                <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-indigo-900/90 border border-indigo-500 px-5 py-2 rounded-full text-sm font-bold text-indigo-200 backdrop-blur-sm">
                    <span className="inline-flex items-center gap-2">
                        <ItemIcon item={{ image: getToolImage(selectedTool), emoji: selectedTool === "pickaxe" ? "⛏️" : selectedTool === "pot" ? "🪴" : selectedTool === "watering" ? "🪣" : "🪓" }} className="w-5 h-5" emojiClassName="text-base" />
                        <span>
                            Tool in Hand: {selectedTool === "pickaxe" ? "Spitzhacke" : selectedTool === "pot" ? "Plant Pot" : selectedTool === "watering" ? "Gießkanne" : "Schaufel"}
                        </span>
                    </span>
                    {selectedTool === "pot" && movingPlantSource && " • Quelle gewählt"}
                    {selectedTool === "shovel" && " • Gedrückt halten zum Entfernen"}
                    <button onClick={() => { setSelectedTool(null); setMovingPlantSource(null); setShovelHoldState({ active: false, progress: 0 }); setSelectedDecoToPlace(null); }} className="ml-3 text-red-400 hover:text-red-300">✕</button>
                </div>
            )}
            {selectedDecoToPlace && (
                <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-amber-900/90 border border-amber-500 px-5 py-2 rounded-full text-sm font-bold text-amber-100 backdrop-blur-sm">
                    <span className="inline-flex items-center gap-2">
                        <ItemIcon item={selectedDecoToPlace} className="w-5 h-5" emojiClassName="text-base" />
                        <span>Deko platzieren: {selectedDecoToPlace.name} (auf Gras klicken)</span>
                    </span>
                    <button onClick={() => setSelectedDecoToPlace(null)} className="ml-3 text-red-300 hover:text-red-200">✕</button>
                </div>
            )}
            {selectedPetToPlace && (
                <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-emerald-900/90 border border-emerald-500 px-5 py-2 rounded-full text-sm font-bold text-emerald-200 backdrop-blur-sm">
                    Tier platzieren: {selectedPetToPlace.emoji || "🐾"} {selectedPetToPlace.name} (auf dein Grundstück klicken)
                    <button onClick={() => setSelectedPetToPlace(null)} className="ml-3 text-red-400 hover:text-red-300">✕</button>
                </div>
            )}
            {selectedTool === "shovel" && shovelHoldState.active && (
                <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-40 w-44">
                    <div className="h-2 w-full rounded-full bg-slate-800 border border-slate-600 overflow-hidden">
                        <div className="h-full bg-rose-500 transition-all duration-75" style={{ width: `${Math.round(shovelHoldState.progress * 100)}%` }} />
                    </div>
                    <div className="text-[10px] text-slate-200 text-center mt-1">Entfernen...</div>
                </div>
            )}
            {hoverInfo && plotPlants[hoverInfo.key] && (
                <div
                    className="absolute z-50 pointer-events-none bg-slate-900/95 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 shadow-xl"
                    style={{ left: hoverInfo.x + 14, top: hoverInfo.y + 14 }}
                >
                    <div className="font-bold text-white">{plotPlants[hoverInfo.key].name}</div>
                    {getReadyFruitCount(plotPlants[hoverInfo.key]) > 0
                        ? <div className="text-green-400 font-bold">{getReadyFruitCount(plotPlants[hoverInfo.key])} {getReadyFruitCount(plotPlants[hoverInfo.key]) === 1 ? "Frucht bereit" : "Früchte bereit"} 🌟</div>
                        : <div className="text-slate-300 text-[11px]">Nächste in: {formatDuration(getTimeToNextHarvest(plotPlants[hoverInfo.key]))}</div>
                    }
                    {!plotPlants[hoverInfo.key].singleUse && Array.isArray(plotPlants[hoverInfo.key].fruitSlots) && (
                        <div className="mt-1 space-y-0.5">
                            {plotPlants[hoverInfo.key].fruitSlots.map((s, i) => {
                                const now = Date.now();
                                const ready = s.readyAt <= now;
                                return (
                                    <div key={i} className={`text-[10px] flex gap-1 items-center ${ready ? "text-green-400" : "text-slate-400"}`}>
                                        <span>{ready ? "●" : "○"}</span>
                                        <span>Slot {i + 1}: {ready ? "bereit!" : formatDuration(s.readyAt - now)}</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    {getReadyFruitSizes(plotPlants[hoverInfo.key]).length > 0 && (
                        <div className="text-cyan-300 text-[11px] mt-1 font-bold">
                            Größe: {getReadyFruitSizes(plotPlants[hoverInfo.key]).join(", ")}
                        </div>
                    )}
                </div>
            )}
            {remoteHoverInfo?.plant && (
                <div
                    className="absolute z-50 pointer-events-none bg-slate-900/95 border border-blue-700/70 rounded-lg px-3 py-2 text-xs text-slate-200 shadow-xl"
                    style={{ left: remoteHoverInfo.x + 14, top: remoteHoverInfo.y + 14 }}
                >
                    <div className="text-blue-300 text-[10px] font-bold mb-0.5">🏠 {remoteHoverInfo.slotOwner}</div>
                    <div className="font-bold text-white">{remoteHoverInfo.plant.name}</div>
                    <div className={`text-[10px] font-bold ${(RARITY_COLORS[remoteHoverInfo.plant.rarity] || RARITY_COLORS.COMMON).text}`}>{remoteHoverInfo.plant.rarity}</div>
                    {getReadyFruitCount(remoteHoverInfo.plant) > 0
                        ? <div className="text-green-400 font-bold text-[11px]">{getReadyFruitCount(remoteHoverInfo.plant)} {getReadyFruitCount(remoteHoverInfo.plant) === 1 ? "Frucht bereit" : "Früchte bereit"} 🌟</div>
                        : <div className="text-slate-300 text-[11px]">Nächste in: {formatDuration(getTimeToNextHarvest(remoteHoverInfo.plant))}</div>
                    }
                    {Number.isFinite(remoteHoverInfo.plant.size) && (
                        <div className="text-cyan-300 text-[11px] mt-0.5">Größe: {remoteHoverInfo.plant.size}</div>
                    )}
                </div>
            )}
            {itemHoverTooltip?.item && (
                <div
                    // 1. ANPASSUNG: 'fixed' zentriert das Modal immer perfekt am Mauszeiger, egal was der Container macht!
                    className="fixed z-[100] pointer-events-none bg-slate-900/95 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 shadow-xl min-w-[150px]"
                    style={getItemTooltipStyle(itemHoverTooltip.x, itemHoverTooltip.y)}
                >
                    <div className="font-bold text-white">{itemHoverTooltip.item.name || "Item"}</div>
                    <div className={`text-[10px] font-bold ${(RARITY_COLORS[itemHoverTooltip.item.rarity] || RARITY_COLORS.COMMON).text}`}>
                        {itemHoverTooltip.item.rarity || "COMMON"}
                    </div>
                    {itemHoverTooltip.item._type === "seed" && (
                        <>
                            <div className="text-slate-400 text-[10px] mt-0.5">Samen — Ins Feld klicken zum Pflanzen</div>
                            {(itemHoverTooltip.item.shopPrice || itemHoverTooltip.item.sellPrice) && (
                                <div className="text-yellow-300 font-bold mt-0.5">
                                    Wert: {(itemHoverTooltip.item.shopPrice || itemHoverTooltip.item.sellPrice || 0).toLocaleString("de-DE")} 🪙
                                </div>
                            )}
                        </>
                    )}
                    {itemHoverTooltip.item._type === "plant" && (
                        <>
                            <div className="text-yellow-300 font-bold mt-0.5">
                                {(itemHoverTooltip.item.sellValue || 0).toLocaleString("de-DE")} 🪙
                            </div>
                            {itemHoverTooltip.item.size !== undefined && (
                                <div className="text-slate-300">Größe: {itemHoverTooltip.item.size}</div>
                            )}
                            {getSpecialLabel(itemHoverTooltip.item.specialData) && (
                                <div className="text-purple-300">{getSpecialLabel(itemHoverTooltip.item.specialData)}</div>
                            )}
                            {getStatusEffectLabel(itemHoverTooltip.item.statusEffect) && (
                                <div className="text-cyan-300">{getStatusEffectLabel(itemHoverTooltip.item.statusEffect)}</div>
                            )}
                        </>
                    )}
                    {itemHoverTooltip.item._type === "pet" && itemHoverTooltip.item.ability && (
                        <div className="mt-1 pt-1 border-t border-slate-700">
                            <div className="text-amber-300 font-bold">
                                {itemHoverTooltip.item.ability.type === "goldfinder" ? "💰 Goldfinder" : "🌱 Samenfinder"} (Lv. {itemHoverTooltip.item.ability.level})
                            </div>
                            <div className="text-[9px] text-slate-400 mt-0.5">
                                Findet passiv ab und zu {itemHoverTooltip.item.ability.type === "goldfinder" ? "Gold" : "Samen"} auf dem Feld.
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ── Hotbar ──────────────────────────────────────────────────── */}
            <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex gap-1.5 bg-slate-900/90 p-2.5 rounded-2xl border border-slate-700 backdrop-blur-md shadow-2xl">
                {Array(9).fill(null).map((_, i) => {
                    const item = hotbarItems[i];
                    
                    // instanceId always takes priority over generic id to avoid false multi-matches
                    const selectedSeedKey = selectedSeed?.instanceId ? `seed:${selectedSeed.instanceId}` : null;
                    const selectedCarryKey = (selectedCarryItem?.instanceId || selectedCarryItem?.id)
                        ? `carry:${selectedCarryItem.instanceId || selectedCarryItem.id}`
                        : null;
                    const selectedPetKey = (selectedPetToPlace?.instanceId || selectedPetToPlace?.id)
                        ? `pet:${selectedPetToPlace.instanceId || selectedPetToPlace.id}`
                        : null;
                    const selectedDecoKey = (selectedDecoToPlace?.instanceId || selectedDecoToPlace?.id)
                        ? `deco:${selectedDecoToPlace.instanceId || selectedDecoToPlace.id}`
                        : null;

                    const itemSeedKey = item?._type === "seed" && item?.instanceId ? `seed:${item.instanceId}` : null;
                    const itemCarryKey = item?._type === "plant" && (item?.instanceId || item?.id)
                        ? `carry:${item.instanceId || item.id}`
                        : null;
                    const itemPetKey = item?._type === "pet" && (item?.instanceId || item?.id)
                        ? `pet:${item.instanceId || item.id}`
                        : null;
                    const itemDecoKey = item?._type === "deco" && (item?.instanceId || item?.id)
                        ? `deco:${item.instanceId || item.id}`
                        : null;

                    const isHeldItem = Boolean(
                        (selectedSeedKey && itemSeedKey && selectedSeedKey === itemSeedKey)
                        || (selectedCarryKey && itemCarryKey && selectedCarryKey === itemCarryKey)
                        || (selectedPetKey && itemPetKey && selectedPetKey === itemPetKey)
                        || (selectedDecoKey && itemDecoKey && selectedDecoKey === itemDecoKey)
                    );

                    const itemSpecial = item?.specialData?.name || item?.specialType || null;
                    const specialRingClass = itemSpecial === "Golden"
                        ? "ring-2 ring-yellow-400/80 shadow-[0_0_12px_rgba(250,204,21,0.7)]"
                        : itemSpecial === "Rainbow"
                        ? "ring-2 ring-purple-400/80 shadow-[0_0_12px_rgba(168,85,247,0.7)]"
                        : "";

                    return (
                        <div key={i}
                            onClick={(e) => {
                                e.stopPropagation();

                                // Eindeutige ID des angeklickten Items herausfinden
                                const clickedId = item?.instanceId || item?.id;

                                // 1. Prüfen, ob genau DIESE ID gerade in der Hand ist
                                const isAlreadySelected = 
                                    (selectedSeed && (selectedSeed.instanceId === clickedId || selectedSeed.id === clickedId)) || 
                                    (selectedCarryItem && (selectedCarryItem.instanceId === clickedId || selectedCarryItem.id === clickedId)) || 
                                    (selectedPetToPlace && (selectedPetToPlace.instanceId === clickedId || selectedPetToPlace.id === clickedId)) || 
                                    (selectedDecoToPlace && (selectedDecoToPlace.instanceId === clickedId || selectedDecoToPlace.id === clickedId));

                                if (isAlreadySelected) {
                                    // 2. Wenn es schon in der Hand ist -> Abwählen (Einstecken)
                                    setSelectedSeed(null);
                                    setSelectedCarryItem(null);
                                    setSelectedPetToPlace(null);
                                    setSelectedDecoToPlace(null);
                                } else {
                                    // 3. Wenn nicht -> Erstmal die Hände komplett frei machen
                                    setSelectedSeed(null); 
                                    setSelectedCarryItem(null); 
                                    setSelectedPetToPlace(null); 
                                    setSelectedDecoToPlace(null);
                                    setSelectedTool(null); 
                                    setMovingPlantSource(null);

                                    // 4. Das richtige Item in die Hand nehmen
                                    if (item?._type === "seed") {
                                        setSelectedSeed(item);
                                    } else if (item?._type === "pet") {
                                        setSelectedPetToPlace(item);
                                    } else if (item?._type === "deco") {
                                        setSelectedDecoToPlace(item);
                                    } else {
                                        // Fallback für alles andere (Pflanzen, Früchte, etc.)
                                        setSelectedCarryItem(item);
                                    }
                                }
                            }}
                            
                            onMouseEnter={(e) => {
                                if (item?._type !== "plant" && item?._type !== "pet") return;
                                // 1. ANPASSUNG: Direkt e.clientX nutzen (ohne Abzug), passend zum 'fixed' Tooltip
                                setItemHoverTooltip({ item, x: e.clientX, y: e.clientY });
                            }}
                            onMouseMove={(e) => {
                                if (item?._type !== "plant" && item?._type !== "pet") return;
                                setItemHoverTooltip((prev) => prev ? { ...prev, x: e.clientX, y: e.clientY } : { item, x: e.clientX, y: e.clientY });
                            }}
                            onMouseLeave={() => setItemHoverTooltip(null)}
                            className={`relative w-[52px] h-[52px] bg-slate-800/80 rounded-xl border flex items-center justify-center transition-all cursor-pointer group
                            ${item ? "border-slate-500 hover:border-green-500 hover:bg-slate-700" : "border-slate-700"}
                            ${isHeldItem ? "border-cyan-300 ring-2 ring-cyan-400/80 shadow-[0_0_16px_rgba(34,211,238,0.65)] bg-slate-700/95" : specialRingClass}`}>
                            <span className="absolute top-1 left-1.5 text-[9px] font-bold text-slate-600 group-hover:text-slate-400">{i + 1}</span>
                            {item && (
                                <SpecialItemIcon item={item} special={itemSpecial} className="w-8 h-8" emojiClassName="text-2xl" />
                            )}
                            {isHeldItem && <span className="absolute -top-1.5 -right-1.5 text-[10px] bg-cyan-500 text-slate-950 px-1 rounded-md font-black">HAND</span>}
                        </div>
                    );
                })}
            </div>
            {currentInteractable && !activeShop && !isBackpackOpen && !isMarketOpen && !isIncubatorOpen && (
                <button
                    onClick={(e) => {
                        e.currentTarget.blur();
                        activateInteractable(currentInteractable);
                    }}
                    // 2. ANPASSUNG: Deutlich größerer Button, fette Schrift, Pulsieren/Bouncen
                    className="absolute bottom-32 left-1/2 -translate-x-1/2 z-40 px-10 py-4 rounded-2xl border-2 border-cyan-300 bg-cyan-700/95 hover:bg-cyan-600 text-white font-black text-xl shadow-[0_0_30px_rgba(34,211,238,0.5)] animate-bounce"
                >
                    <span className="mr-2">👉</span> {currentInteractable.label} öffnen
                </button>
            )}

            {/* ── Bottom-Right: Inventory ──────────────────────────────────── */}
            <button onClick={() => setBackpackOpen(true)}
                className="absolute bottom-5 right-5 p-3 bg-purple-700 hover:bg-purple-600 rounded-2xl shadow-[0_0_20px_rgba(147,51,234,0.35)] text-white font-black transition-all active:scale-95 flex items-center gap-2 border border-purple-500 text-sm">
                <span className="text-xl">🎒</span> INVENTAR
            </button>

            {/* ── Bottom-Left: My Farm ─────────────────────────────────────── */}
            <button onClick={(e) => {
                e.currentTarget.blur();
                teleportToMyFarm();
            }}
                className="absolute bottom-5 left-5 p-3 bg-green-700 hover:bg-green-600 rounded-2xl shadow-[0_0_20px_rgba(22,163,74,0.35)] text-white font-black transition-all active:scale-95 flex items-center gap-2 border border-green-500 text-sm">
                <span className="text-xl">🏠</span> MEINE FARM
            </button>

            <button onClick={(e) => {
                e.currentTarget.blur();
                teleportToShopArea();
            }}
                className="absolute bottom-20 left-5 p-3 bg-yellow-600 hover:bg-yellow-500 rounded-2xl shadow-[0_0_20px_rgba(234,179,8,0.35)] text-black font-black transition-all active:scale-95 flex items-center gap-2 border border-yellow-400 text-sm">
                <span className="text-xl">🛒</span> SHOP-AREAL
            </button>
            <button onClick={(e) => {
                e.currentTarget.blur();
                teleportToMarketArea();
            }}
                className="absolute bottom-[140px] left-5 p-3 bg-orange-700 hover:bg-orange-600 rounded-2xl shadow-[0_0_20px_rgba(249,115,22,0.35)] text-white font-black transition-all active:scale-95 flex items-center gap-2 border border-orange-500 text-sm">
                <span className="text-xl">🏪</span> VERKAUF-AREAL
            </button>

            {/* ═══════════════════════════════════════════════════════════════
                MODAL: SHOP
            ═══════════════════════════════════════════════════════════════ */}
            {activeShop === "seed" && (
                <div className="absolute inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-50">
                    <div className="bg-slate-900 border border-slate-700 p-6 rounded-3xl w-[760px] max-h-[84vh] flex flex-col shadow-2xl">
                        {/* Header */}
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h2 className="text-2xl font-black text-white uppercase tracking-widest">🛒 Samen-Shop</h2>
                                <div className={`mt-1 inline-flex items-center px-2.5 py-1 rounded-lg border text-xs font-black tracking-wide ${getCountdownBadgeClass(shopCountdown)}`}>
                                    Nächste Rotation: {formatCountdown(shopMins, shopSecs)}
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-yellow-400 font-black text-lg">{gold.toLocaleString('de-DE')} 🪙</div>
                            </div>
                        </div>

                        {/* Countdown bar */}
                        <div className="h-2 bg-slate-800 rounded-full mb-4 border border-slate-700 overflow-hidden">
                            <div className="h-full bg-yellow-500 rounded-full transition-all"
                                style={{ width: `${(shopCountdown / SHOP_ROTATION_MS) * 100}%` }} />
                        </div>

                        {/* Filter toggle */}
                        <div className="flex gap-2 mb-3">
                            {["all", "available"].map(f => (
                                <button key={f}
                                    onClick={() => setShopFilter(f)}
                                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${shopFilter === f ? "bg-yellow-600 text-white" : "bg-slate-800 text-slate-400 hover:bg-slate-700"}`}>
                                    {f === "all"
                                        ? `Alle (${shopRotation?.seeds.length ?? 0})`
                                        : `Verfügbar (${shopRotation?.seeds.filter(s => s.active).length ?? 0})`}
                                </button>
                            ))}
                        </div>

                        {/* Seeds */}
                        <div className="overflow-y-auto scroll-smooth space-y-2 flex-1 pr-1" style={{ overscrollBehavior: "contain" }}>
                            {visibleShopSeeds.map(seed => (
                                    <ShopSeedCard key={seed.seedId} seed={seed}
                                        stock={personalShopStock[seed.seedId] ?? (seed.active ? (seed.stockPerPlayer ?? 0) : 0)}
                                        canAfford={gold >= seed.shopPrice}
                                        onBuy={handleBuySeed} />
                                ))}
                            {(!shopRotation?.seeds || shopRotation.seeds.length === 0) && (
                                <div className="text-slate-500 text-sm text-center py-8">Shop wird geladen...</div>
                            )}
                        </div>

                        <button onClick={() => setActiveShop(null)}
                            className="mt-4 w-full py-3 font-bold bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 rounded-xl transition-colors border border-slate-700 text-sm">
                            Schließen [ESC]
                        </button>
                    </div>
                </div>
            )}
            {activeShop === "tool" && (
                <div className="absolute inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-50">
                    <div className="bg-slate-900 border border-slate-700 p-6 rounded-3xl w-[760px] max-h-[84vh] flex flex-col shadow-2xl">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h2 className="text-2xl font-black text-white uppercase tracking-widest">🛠️ Tool-Shop</h2>
                                <div className={`mt-1 inline-flex items-center px-2.5 py-1 rounded-lg border text-xs font-black tracking-wide ${getCountdownBadgeClass(toolShopCountdown)}`}>
                                    Restock: {formatCountdown(toolMins, toolSecs)}
                                </div>
                            </div>
                            <div className="text-yellow-400 font-black text-lg">{gold.toLocaleString('de-DE')} 🪙</div>
                        </div>
                        <div className="h-2 bg-slate-800 rounded-full mb-4 border border-slate-700 overflow-hidden">
                            <div
                                className="h-full bg-violet-500 rounded-full transition-all"
                                style={{ width: `${(toolShopCountdown / TOOL_EGG_ROTATION_MS) * 100}%` }}
                            />
                        </div>
                        <div className="space-y-3 overflow-y-auto flex-1 pr-1">
                            {(toolShopRotation?.items || []).map(tool => {
                                const toolInv = normalizeToolInventory(toolInventory);
                                const price = tool.id === "backpack_upgrade"
                                    ? getBackpackUpgradePrice(toolInv.backpackLevel || 0)
                                    : tool.id === "pickaxe"
                                    ? getPickaxePrice(toolInv.pickaxesBought || 0)
                                    : tool.price;
                                const isPermanentOwned =
                                    (tool.id === "shovel" && toolInv.hasShovel);
                                const hasRotationStock = tool.type === "single" || tool.id === "pickaxe";
                                const singleStock = hasRotationStock ? (toolShopStock[tool.id] ?? 0) : null;
                                const canBuy = gold >= price && !isPermanentOwned && (!hasRotationStock || (singleStock ?? 0) > 0);
                                return (
                                    <div key={tool.id} className="p-4 rounded-2xl border border-slate-700 bg-slate-900/60 min-h-[92px]">
                                        <div className="flex items-center justify-between gap-5">
                                            <div>
                                            <div className="text-white font-bold text-base flex items-center gap-2">
                                                <ItemIcon item={{ ...tool, image: getToolImage(tool.id) }} className="w-6 h-6" emojiClassName="text-base" />
                                                <span>{tool.name}</span>
                                            </div>
                                                <div className="text-[11px] text-slate-500 mt-0.5">
                                                    {tool.id === "pickaxe" && `4 Uses pro Kauf • Zum Zerstören von Steinen • Restock: ${singleStock ?? 0}`}
                                                    {tool.id === "shovel" && "Permanent • Entfernt Pflanzen komplett"}
                                                    {tool.id === "plant_pot" && `Single Use • Zum Umpflanzen • Restock: ${singleStock ?? 0}`}
                                                    {tool.id === "backpack_upgrade" && `Level ${toolInv.backpackLevel || 0} • +10 Slots/Upgrade`}
                                                    {tool.id === "watering_can" && `Single Use • -5 Minuten bei Pflanzen • Restock: ${singleStock ?? 0}`}
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-yellow-300 font-black">{formatPriceShort(price)} 🪙</div>
                                                {hasRotationStock && (
                                                    <div className="text-xs text-slate-400 mt-0.5">Stock: {singleStock ?? 0}</div>
                                                )}
                                                <button
                                                    onClick={() => handleBuyTool(tool)}
                                                    disabled={!canBuy}
                                                    className="mt-2 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-xs font-bold"
                                                >
                                                    {isPermanentOwned ? "Gekauft" : "Kaufen"}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <button onClick={() => setActiveShop(null)}
                            className="mt-4 w-full py-3 font-bold bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 rounded-xl transition-colors border border-slate-700 text-sm">
                            Schließen
                        </button>
                    </div>
                </div>
            )}
            {activeShop === "egg" && (
                <div className="absolute inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-50">
                    <div className="bg-slate-900 border border-slate-700 p-6 rounded-3xl w-[760px] max-h-[84vh] flex flex-col shadow-2xl">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h2 className="text-2xl font-black text-white uppercase tracking-widest">🥚 Eier-Shop</h2>
                                <div className={`mt-1 inline-flex items-center px-2.5 py-1 rounded-lg border text-xs font-black tracking-wide ${getCountdownBadgeClass(eggShopCountdown)}`}>
                                    Rotation: {formatCountdown(eggMins, eggSecs)}
                                </div>
                            </div>
                            <div className="text-yellow-400 font-black text-lg">{gold.toLocaleString('de-DE')} 🪙</div>
                        </div>
                        <div className="h-2 bg-slate-800 rounded-full mb-4 border border-slate-700 overflow-hidden">
                            <div
                                className="h-full bg-teal-500 rounded-full transition-all"
                                style={{ width: `${(eggShopCountdown / TOOL_EGG_ROTATION_MS) * 100}%` }}
                            />
                        </div>
                        <div className="space-y-3 overflow-y-auto flex-1 pr-1">
                            {EGG_SHOP_CATALOGUE.map(egg => {
                                const stock = eggShopStock[egg.id] ?? 0;
                                const available = stock > 0;
                                const rarityClass =
                                    egg.rarity === "LEGENDARY" ? "bg-yellow-500/20 text-yellow-300 border-yellow-400/50"
                                    : egg.rarity === "EPIC" ? "bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-400/50"
                                    : egg.rarity === "RARE" ? "bg-sky-500/20 text-sky-300 border-sky-400/50"
                                    : egg.rarity === "UNCOMMON" ? "bg-emerald-500/20 text-emerald-300 border-emerald-400/50"
                                    : "bg-slate-500/20 text-slate-300 border-slate-400/50";
                                return (
                                <div key={egg.id} className={`p-4 rounded-2xl border min-h-[96px] ${available ? "border-teal-600 bg-slate-900/60" : "border-slate-800 bg-slate-900/30 opacity-60"}`}>
                                    <div className="flex items-center justify-between gap-5">
                                        <div>
                                            <div className="text-white font-bold text-base flex items-center gap-2">
                                                <ItemIcon item={egg} className="w-6 h-6" emojiClassName="text-base" />
                                                <span>{egg.name}</span>
                                            </div>
                                            <div className="mt-1">
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-bold tracking-wide ${rarityClass}`}>
                                                    {egg.rarity}
                                                </span>
                                            </div>
                                            <div className="text-[11px] text-slate-500 mt-1">
                                                {egg.hatchTable.map(h => `${h.type} ${h.chance}%`).join(" • ")}
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-yellow-300 font-black">{formatPriceShort(egg.price)} 🪙</div>
                                            <div className="text-xs text-slate-400 mt-0.5">Stock: {stock}</div>
                                            <button
                                                onClick={() => handleBuyEgg(egg)}
                                                disabled={gold < egg.price || stock <= 0}
                                                className="mt-2 px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-xs font-bold"
                                            >
                                                {stock <= 0 ? "Nicht verfügbar" : "Kaufen"}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                            })}
                            {Object.values(eggShopStock).every(v => (v || 0) <= 0) && (
                                <div className="text-slate-500 text-sm text-center py-8">Diese Rotation hat keine Eier im Angebot.</div>
                            )}
                        </div>
                        <button onClick={() => setActiveShop(null)}
                            className="mt-4 w-full py-3 font-bold bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 rounded-xl transition-colors border border-slate-700 text-sm">
                            Schließen
                        </button>
                    </div>
                </div>
            )}
            {activeShop === "deco" && (
                <div className="absolute inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-50">
                    <div className="bg-slate-900 border border-slate-700 p-6 rounded-3xl w-[760px] max-h-[84vh] flex flex-col shadow-2xl">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h2 className="text-2xl font-black text-white uppercase tracking-widest">🪴 Deko-Shop</h2>
                                <div className="text-xs text-slate-400 mt-0.5">Platzhalterobjekte - platzierbar auf Grasflächen deiner Farm</div>
                            </div>
                            <div className="text-yellow-400 font-black text-lg">{gold.toLocaleString('de-DE')} 🪙</div>
                        </div>
                        <div className="space-y-3 overflow-y-auto flex-1 pr-1">
                            {DECO_SHOP_ITEMS.map((deco) => {
                                const canBuy = gold >= deco.price;
                                const c = RARITY_COLORS[deco.rarity] || RARITY_COLORS.COMMON;
                                return (
                                    <div key={deco.id} className={`p-4 rounded-2xl border ${c.border} bg-slate-900/60 min-h-[90px]`}>
                                        <div className="flex items-center justify-between gap-5">
                                            <div>
                                                <div className="text-white font-bold text-base flex items-center gap-2">
                                                    <ItemIcon item={deco} className="w-6 h-6" emojiClassName="text-base" />
                                                    <span>{deco.name}</span>
                                                </div>
                                                <div className="text-[11px] text-slate-400 mt-0.5">Nach Kauf im Inventar unter "Deko" auswählbar.</div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-yellow-300 font-black">{formatPriceShort(deco.price)} 🪙</div>
                                                <button
                                                    onClick={() => handleBuyDeco(deco)}
                                                    disabled={!canBuy}
                                                    className="mt-2 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-xs font-bold"
                                                >
                                                    Kaufen
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <button onClick={() => setActiveShop(null)}
                            className="mt-4 w-full py-3 font-bold bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 rounded-xl transition-colors border border-slate-700 text-sm">
                            Schließen
                        </button>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════
                MODAL: UNIFIED INVENTORY
            ═══════════════════════════════════════════════════════════════ */}
            {isBackpackOpen && (() => {
                const toolItems = [
                    ...(toolInventory.pickaxeUses > 0 ? [{ id: "tool_pickaxe", name: "Spitzhacke", emoji: "⛏️", image: getToolImage("pickaxe"), rarity: "UNCOMMON", amount: toolInventory.pickaxeUses, _type: "tool" }] : []),
                    ...(toolInventory.hasShovel ? [{ id: "tool_shovel", name: "Schaufel", emoji: "🪓", image: getToolImage("shovel"), rarity: "COMMON", amount: "∞", _type: "tool" }] : []),
                    ...(toolInventory.plantPots > 0 ? [{ id: "tool_pots", name: "Plant Pot", emoji: "🪴", image: getToolImage("pot"), rarity: "COMMON", amount: toolInventory.plantPots, _type: "tool" }] : []),
                    ...(toolInventory.wateringCans > 0 ? [{ id: "tool_watering", name: "Gießkanne", emoji: "🪣", image: getToolImage("watering"), rarity: "COMMON", amount: toolInventory.wateringCans, _type: "tool" }] : []),
                ];
                const allItems = [
                    ...inventory.map(s => ({ ...withVisuals(s), _type: "seed" })),
                    ...harvestedItems.map(p => ({ ...withVisuals(p), _type: "plant" })),
                    ...eggInventory.map(e => ({ ...e, _type: "egg" })),
                    ...petInventory.map(p => ({ ...p, _type: "pet" })),
                    ...decoInventory.map(d => ({ ...d, _type: "deco" })),
                    ...toolItems,
                ];
                const usedSlots = allItems.length;
                // Slot cap applies only to seeds + harvested plants (the expandable main inventory)
                const slottedItems = inventory.length + harvestedItems.length;
                const backpackFilters = ["all", "seed", "plant", "egg", "pet", "deco", "tool"];
                const filterLabels = { all: "Alle", seed: "🌱 Samen", plant: "🌿 Pflanzen", egg: "🥚 Eier", pet: "🐾 Tiere", deco: "🪴 Deko", tool: "🛠️ Tools" };
                const activeFilter = inventoryFilter || "all";
                const displayed = activeFilter === "all" ? allItems : allItems.filter(i => i._type === activeFilter);
                return (
                <div className="absolute inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-50">
                    <div className="bg-slate-900 border border-slate-700 p-5 rounded-3xl w-[700px] max-h-[88vh] flex flex-col shadow-2xl">
                        {/* Header */}
                        <div className="flex items-center justify-between mb-3 border-b border-slate-800 pb-3">
                            <div className="flex-1 mr-4">
                                <h2 className="text-xl font-black text-white uppercase tracking-widest">🎒 Inventar</h2>
                                <div className="flex items-center gap-2 mt-1.5">
                                    <div className="flex-1 h-2 rounded-full bg-slate-800 overflow-hidden">
                                        <div className="h-full rounded-full transition-all duration-300"
                                            style={{
                                                width: `${Math.min(100, (slottedItems / inventoryMaxSlots) * 100)}%`,
                                                background: slottedItems >= inventoryMaxSlots
                                                    ? "#ef4444"
                                                    : slottedItems / inventoryMaxSlots >= 0.75
                                                    ? "#f59e0b"
                                                    : "#22c55e",
                                            }}
                                        />
                                    </div>
                                    <span className={`text-xs font-bold whitespace-nowrap ${slottedItems >= inventoryMaxSlots ? "text-red-400" : "text-slate-400"}`}>
                                        {slottedItems}/{inventoryMaxSlots} Slots
                                    </span>
                                </div>
                            </div>
                            <button onClick={() => { setItemHoverTooltip(null); setBackpackOpen(false); }} className="text-slate-500 hover:text-white text-lg px-2">✕</button>
                        </div>

                        {/* Filter tabs */}
                        <div className="flex gap-1.5 mb-3">
                            {backpackFilters.map(f => (
                                <button key={f} onClick={() => setInventoryFilter(f)}
                                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${activeFilter === f ? "bg-slate-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"}`}>
                                    {filterLabels[f]}
                                    <span className="ml-1 opacity-60 text-[10px]">
                                        {f === "all" ? allItems.length : allItems.filter(i => i._type === f).length}
                                    </span>
                                </button>
                            ))}
                        </div>

                        {/* Grid */}
                        <div className="flex-1 min-h-0 overflow-y-auto scroll-smooth pr-1 pb-8">
                            {displayed.length === 0 ? (
                                <div className="text-slate-600 text-sm text-center py-12">Keine Items in dieser Kategorie</div>
                            ) : (
                                <div className="grid grid-cols-8 gap-1.5 overflow-visible">
                                    {displayed.map((item, idx) => {
                                        const c = RARITY_COLORS[item.rarity] || RARITY_COLORS.COMMON;
                                        const isSeed = item._type === "seed";
                                        const isPlant = item._type === "plant";
                                        const isTool = item._type === "tool";
                                        const isPet = item._type === "pet";
                                        const isDeco = item._type === "deco";
                                        const sp = item?.specialData?.name || item?.specialType || null;
                                        const spClass = sp === "Golden"
                                            ? "ring-2 ring-yellow-400 shadow-[0_0_14px_rgba(250,204,21,0.75)] bg-yellow-900/40 border-yellow-500/80"
                                            : sp === "Rainbow"
                                            ? "ring-2 ring-purple-400 shadow-[0_0_14px_rgba(168,85,247,0.75)] bg-purple-900/30 border-purple-500/80"
                                            : c.border;
                                        return (
                                            <div key={item.id || item.instanceId || idx}
                                                onClick={() => {
                                                    if (isSeed) {
                                                        setSelectedTool(null);
                                                        setMovingPlantSource(null);
                                                        setSelectedPetToPlace(null);
                                                        setSelectedDecoToPlace(null);
                                                        setSelectedCarryItem(null);
                                                        setSelectedSeed(item);
                                                        setBackpackOpen(false);
                                                    } else if (isPlant) {
                                                        setSelectedSeed(null);
                                                        setSelectedTool(null);
                                                        setMovingPlantSource(null);
                                                        setSelectedPetToPlace(null);
                                                        setSelectedDecoToPlace(null);
                                                        setSelectedCarryItem(item);
                                                        setBackpackOpen(false);
                                                    } else if (isPet) {
                                                        setSelectedSeed(null);
                                                        setSelectedTool(null);
                                                        setMovingPlantSource(null);
                                                        setSelectedCarryItem(null);
                                                        setSelectedDecoToPlace(null);
                                                        setSelectedPetToPlace(item);
                                                        setBackpackOpen(false);
                                                    } else if (isDeco) {
                                                        setSelectedSeed(null);
                                                        setSelectedTool(null);
                                                        setMovingPlantSource(null);
                                                        setSelectedCarryItem(null);
                                                        setSelectedPetToPlace(null);
                                                        setSelectedDecoToPlace(item);
                                                        setBackpackOpen(false);
                                                    }
                                                }}
                                                onMouseEnter={(e) => setItemHoverTooltip({ item, x: e.clientX, y: e.clientY })}
                                                onMouseMove={(e) => setItemHoverTooltip((prev) => prev ? { ...prev, x: e.clientX, y: e.clientY } : { item, x: e.clientX, y: e.clientY })}
                                                onMouseLeave={() => setItemHoverTooltip(null)}
                                                className={`group relative aspect-square rounded-xl border flex items-center justify-center transition-all bg-slate-800/80 ${spClass} ${(isSeed || isPlant || isPet || isDeco) ? "cursor-pointer hover:scale-105" : "cursor-default"}`}>
                                                <SpecialItemIcon item={item} special={sp} className="w-9 h-9" emojiClassName="text-2xl" />
                                                {sp === "Golden" && <span className="absolute -top-1.5 -right-1.5 text-[10px] leading-none pointer-events-none">✨</span>}
                                                {sp === "Rainbow" && <span className="absolute -top-1.5 -right-1.5 text-[10px] leading-none pointer-events-none">🌈</span>}
                                                {!sp && <div className={`absolute bottom-0.5 right-0.5 w-2 h-2 rounded-full ${c.bg}`} />}
                                                {(isTool || isPet) && item.amount !== undefined && (
                                                    <span className="absolute bottom-0.5 left-1 text-[9px] text-slate-200">{item.amount}</span>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <button onClick={() => { setItemHoverTooltip(null); setBackpackOpen(false); }}
                            className="mt-4 w-full py-2.5 font-bold bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 rounded-xl transition-colors border border-slate-700 text-sm">
                            Schließen
                        </button>
                    </div>
                </div>
                );
            })()}
            {isMarketOpen && (
                <div className="absolute inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-50">
                    <div className="bg-slate-900 border border-slate-700 p-6 rounded-3xl w-[560px] max-h-[80vh] flex flex-col shadow-2xl">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-2xl font-black text-white uppercase tracking-widest">🏪 Marktstand</h2>
                            <div className="text-yellow-400 font-black">{gold.toLocaleString('de-DE')} 🪙</div>
                        </div>
                        <div className="overflow-y-auto space-y-2 flex-1 pr-1">
                            <div className="text-sm text-slate-300">
                                Pflanzen im Verkaufslager: <span className="font-bold text-white">{harvestedItems.length}</span>
                            </div>
                            <div className="text-sm text-slate-300">
                                Gesamtwert: <span className="font-bold text-yellow-300">{harvestedItems.reduce((sum, item) => sum + item.sellValue, 0).toLocaleString('de-DE')} 🪙</span>
                            </div>
                            {harvestedItems.length === 0 && (
                                <div className="text-slate-500 text-sm py-8 text-center">Keine geernteten Pflanzen zum Verkaufen.</div>
                            )}
                        </div>
                        <button
                            onClick={handleSellAllHarvested}
                            disabled={harvestedItems.length === 0}
                            className="mt-2 w-full py-3 font-black bg-green-600 hover:bg-green-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-xl transition-colors border border-green-500 disabled:border-slate-600 text-sm"
                        >
                            Alles verkaufen
                        </button>
                        <button onClick={() => setMarketOpen(false)}
                            className="mt-4 w-full py-3 font-bold bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 rounded-xl transition-colors border border-slate-700 text-sm">
                            Schließen
                        </button>
                    </div>
                </div>
            )}
            {isIncubatorOpen && (
                <div className="absolute inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-50">
                    <div className="bg-slate-900 border border-slate-700 p-6 rounded-3xl w-[980px] max-h-[90vh] flex flex-col shadow-2xl">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-2xl font-black text-white uppercase tracking-widest">🧪 Inkubator</h2>
                            <div className="text-slate-400 text-sm">{eggInventory.length} Eier im Inventar</div>
                        </div>
                        <div className="h-44 rounded-xl border border-teal-700/60 bg-gradient-to-r from-teal-950/40 via-cyan-950/30 to-blue-950/40 flex items-center justify-between px-6 mb-4">
                            <div>
                                <div className="text-xl font-black text-teal-100">Tier-Zucht Übersicht</div>
                                <div className="text-sm text-teal-300 mt-1">Lege Eier ein und sieh sofort, was schlüpft.</div>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                {incubator.slots.filter(Boolean).slice(0, 3).map((slot, idx) => {
                                    const leftMs = Math.max(0, slot.hatchAt - tickNow);
                                    const isHatching = leftMs > 0;
                                    return (
                                    <div key={`preview_${idx}`} className="w-24 h-24 rounded-xl border border-cyan-700/60 bg-slate-950/50 flex flex-col items-center justify-center overflow-hidden">
                                        <img src={isHatching ? (slot.egg.image || buildPetPreviewImage("Ei", "🥚")) : (slot.hatchResult?.previewImage || buildPetPreviewImage(slot.hatchResult?.type, slot.hatchResult?.emoji))} alt="Tier" className="w-14 h-14 object-contain" />
                                        <span className="text-[10px] text-cyan-200 truncate max-w-[88px]">{isHatching ? "Brütet..." : (slot.hatchResult?.type || "Unbekannt")}</span>
                                    </div>
                                )})}
                            </div>
                        </div>
                        <div className="grid grid-cols-5 gap-3">
                            {Array(5).fill(null).map((_, idx) => {
                                const unlocked = idx < incubator.unlockedSlots;
                                const slot = incubator.slots[idx];
                                const leftMs = slot ? Math.max(0, slot.hatchAt - tickNow) : 0;
                                const unlockCost = INCUBATOR_UNLOCK_COSTS[idx - 1];
                                return (
                                    <div key={idx}
                                        className={`rounded-xl border text-xs font-bold p-3 flex flex-col min-h-[210px] ${unlocked ? "border-teal-500 bg-teal-900/20 text-teal-200" : "border-slate-700 bg-slate-900/50 text-slate-500"}`}
                                    >
                                        <div className="text-[9px] text-center mb-1 opacity-60">Slot {idx + 1}</div>
                                        {!unlocked && (
                                            <div className="flex flex-col items-center justify-center flex-1 gap-1">
                                                <span className="text-lg">🔒</span>
                                                <div className="text-[9px] text-center">{unlockCost >= 1000000 ? `${(unlockCost/1000000).toFixed(0)}M` : `${(unlockCost/1000).toFixed(0)}k`} 🪙</div>
                                                <button onClick={unlockIncubatorSlot}
                                                    className={`text-[9px] px-2 py-0.5 rounded ${gold >= unlockCost ? "bg-yellow-600 hover:bg-yellow-500 text-white" : "bg-slate-700 text-slate-500"}`}>
                                                    Freischalten
                                                </button>
                                            </div>
                                        )}
                                        {unlocked && !slot && (
                                            <>
                                                <div className="flex-1 flex items-center justify-center border border-dashed border-teal-600/50 rounded-lg text-teal-600 text-3xl">🥚</div>
                                                <button onClick={() => setIncubatorTargetSlot(idx)}
                                                    className="mt-2 text-[10px] bg-teal-700 hover:bg-teal-600 rounded px-2 py-1">
                                                    Ei einsetzen
                                                </button>
                                            </>
                                        )}
                                        {unlocked && slot && (() => {
                                            const leftMs = Math.max(0, slot.hatchAt - tickNow);
                                            const isHatching = leftMs > 0;
                                            return (
                                            <>
                                                <div className="flex items-center justify-center mt-1">
                                                    {isHatching ? (
                                                        <ItemIcon item={slot.egg} className="w-20 h-20 object-contain rounded-lg border border-cyan-700/40 bg-slate-950/60" />
                                                    ) : (
                                                        <img src={slot.hatchResult?.previewImage || buildPetPreviewImage(slot.hatchResult?.type, slot.hatchResult?.emoji)} alt="Tier" className="w-20 h-20 object-contain rounded-lg border border-cyan-700/40 bg-slate-950/60" />
                                                    )}
                                                </div>
                                                <div className="text-center font-black text-base mt-1 flex items-center justify-center gap-1">
                                                    <ItemIcon item={slot.egg} className="w-4 h-4" emojiClassName="text-base" />
                                                    <span>{slot.egg.name}</span>
                                                </div>
                                                <div className="text-center text-[11px] text-cyan-200 leading-tight mt-1">Ergebnis: {isHatching ? "???" : `${slot.hatchResult?.emoji || "🐾"} ${slot.hatchResult?.type || "Tier"}`}</div>
                                                <div className={`text-center text-[10px] mt-1 font-bold ${leftMs > 0 ? "text-amber-400" : "text-green-400"}`}>
                                                    {leftMs > 0 ? formatDuration(leftMs) : "Bereit!"}
                                                </div>
                                                <button onClick={() => collectHatchedEgg(idx)}
                                                    disabled={isHatching}
                                                    className={`mt-auto text-[10px] rounded px-2 py-1 ${leftMs <= 0 ? "bg-emerald-600 hover:bg-emerald-500 text-white" : "bg-slate-700 text-slate-500 opacity-50 cursor-not-allowed"}`}>
                                                    Ausbrueten
                                                </button>
                                            </>
                                            );
                                        })()}
                                    </div>
                                );
                            })}
                        </div>
                        {incubatorTargetSlot !== null && (
                            <div className="mt-3 border border-slate-700 rounded-xl p-3 bg-slate-950/60">
                                <div className="text-xs text-slate-300 mb-2 font-bold">Ei für Slot {incubatorTargetSlot + 1} auswählen</div>
                                <div className="grid grid-cols-6 gap-2 max-h-44 overflow-y-auto">
                                    {eggInventory.map((egg) => (
                                        <button
                                            key={egg.instanceId}
                                            onClick={() => placeEggInIncubator(incubatorTargetSlot, egg.instanceId)}
                                            className="p-2 rounded-lg border border-slate-700 hover:border-teal-500 bg-slate-900 hover:bg-slate-800 text-center flex flex-col items-center justify-center"
                                        >
                                            <ItemIcon item={egg} className="w-8 h-8 mb-1" emojiClassName="text-xl" />
                                            <div className="text-[10px] text-slate-300 truncate w-full">{egg.name}</div>
                                            <div className="mt-1 flex justify-center">
                                                <img
                                                    src={buildPetPreviewImage(egg?.hatchTable?.[0]?.type || "Tier", getPetEmoji(egg?.hatchTable?.[0]?.type || "Tier"))}
                                                    alt={egg?.hatchTable?.[0]?.type || "Tier"}
                                                    className="w-10 h-10 rounded-md border border-slate-700 object-contain bg-slate-950/80"
                                                />
                                            </div>
                                        </button>
                                    ))}
                                </div>
                                <button
                                    onClick={() => setIncubatorTargetSlot(null)}
                                    className="mt-2 text-[10px] text-slate-400 hover:text-white"
                                >
                                    Auswahl schließen
                                </button>
                            </div>
                        )}
                        {incubator.unlockedSlots < 5 && (
                            <div className="mt-2 text-[10px] text-slate-500 text-center">
                                Nächster Slot: {INCUBATOR_UNLOCK_COSTS[incubator.unlockedSlots - 1]?.toLocaleString('de-DE')} 🪙
                            </div>
                        )}
                        <button onClick={() => { setIncubatorTargetSlot(null); setIncubatorOpen(false); }}
                            className="mt-3 w-full py-3 font-bold bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 rounded-xl transition-colors border border-slate-700 text-sm">
                            Schließen
                        </button>
                    </div>
                </div>
            )}
            <div className="absolute bottom-5 left-1/2 translate-x-[286px] flex gap-1.5 bg-slate-900/85 p-1.5 rounded-xl border border-slate-700">
                {[
                    { key: "shovel", label: "Schaufel", emoji: "🪓", image: getToolImage("shovel") },
                    { key: "pot", label: "Topf", emoji: "🪴", image: getToolImage("pot") },
                    { key: "pickaxe", label: "Spitzh.", emoji: "⛏️", image: getToolImage("pickaxe") },
                    { key: "watering", label: "Gießk.", emoji: "🪣", image: getToolImage("watering") },
                ].map((slot) => (
                    <button
                        type="button"
                        key={slot.key}
                        onClick={(e) => {
                            e.currentTarget.blur();
                            if (!equippedTools[slot.key]) return;
                            const toolKey = slot.key === "watering" ? "watering" : slot.key;
                            setSelectedSeed(null);
                            setSelectedPetToPlace(null);
                            setSelectedDecoToPlace(null);
                            setSelectedCarryItem(null);
                            setSelectedTool(prev => (prev === toolKey ? null : toolKey));
                            if (toolKey !== "pot") setMovingPlantSource(null);
                        }}
                        className={`w-12 h-12 rounded-lg border flex flex-col items-center justify-center text-[9px] text-slate-300 ${
                            selectedTool === (slot.key === "watering" ? "watering" : slot.key)
                                ? "border-cyan-300 ring-2 ring-cyan-500/70 bg-slate-700 shadow-[0_0_12px_rgba(34,211,238,0.45)]"
                                : "border-slate-600 bg-slate-800"
                        } ${equippedTools[slot.key] ? "hover:border-cyan-500 cursor-pointer" : "cursor-default"} focus:outline-none`}
                    >
                        <ItemIcon item={{ image: slot.image, emoji: slot.emoji }} className="w-5 h-5" emojiClassName="text-base" />
                        <span className="text-[10px] text-slate-100">{equippedTools[slot.key] ? equippedTools[slot.key].name : "0"}</span>
                        <span className="text-slate-500">{slot.label}</span>
                    </button>
                ))}
            </div>
            {/* 5. ANPASSUNG: Wardrobe Modal - Jetzt mit Preset-Buttons */}
            {isWardrobeOpen && (
                <div className="absolute inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-50">
                    <div className="bg-slate-900 border border-slate-700 p-6 rounded-3xl w-[460px] flex flex-col shadow-2xl">
                        <h2 className="text-xl font-black text-white mb-6">👕 Charakter anpassen</h2>

                        <div className="grid grid-cols-4 gap-3 mb-8">
                            {WARDROBE_SKINS.map(skin => {
                                const isActive = playerAppearance.skin === skin.skin;
                                return (
                                    <button
                                        key={skin.id}
                                        onClick={() => {
                                            const newApp = { skin: skin.skin };
                                            setPlayerAppearance(newApp);
                                            if (isMultiplayer && socketRef.current) {
                                                socketRef.current.emit("player_state_change", {
                                                    tool: selectedTool, heldItem: heldItemRef.current, appearance: newApp
                                                });
                                            }
                                        }}
                                        className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all ${isActive ? "border-fuchsia-500 bg-fuchsia-500/20 text-fuchsia-200 shadow-[0_0_15px_rgba(217,70,239,0.3)]" : "border-slate-700 bg-slate-800/80 text-slate-400 hover:bg-slate-700"}`}
                                    >
                                        <div className="text-2xl">👤</div>
                                        <span className="text-[10px] font-bold text-center leading-tight">{skin.name}</span>
                                        {isActive && <div className="w-1.5 h-1.5 rounded-full bg-fuchsia-400" />}
                                    </button>
                                );
                            })}
                        </div>

                        <div className="text-xs text-amber-300 bg-amber-900/20 p-3 rounded-xl border border-amber-700/50 mb-6 text-center">
                            💡 Weitere Outfits werden später durch Drops oder Coins im Shop freischaltbar sein!
                        </div>

                        <button onClick={() => setWardrobeOpen(false)} className="w-full py-4 font-black bg-fuchsia-600 hover:bg-fuchsia-500 text-white rounded-xl transition-transform active:scale-95 shadow-lg">
                            Fertig
                        </button>
                    </div>
                </div>
            )}

            {/* Mailbox Modal */}
            {isMailboxOpen && (
                <div className="absolute inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-50">
                    <div className="bg-slate-900 border border-slate-700 p-6 rounded-3xl w-[400px] max-h-[80vh] flex flex-col shadow-2xl">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-black text-white flex items-center gap-2">
                                📬 {isOwnMailbox ? "Dein Briefkasten" : "Geschenk senden"}
                            </h2>
                            <button onClick={() => { setMailboxOpen(false); setGiftMessage(""); setGiftGold(0); setGiftItems([]); }} className="text-slate-400 hover:text-white">✕</button>
                        </div>
                        
                        {isOwnMailbox ? (
                            <div className="overflow-y-auto pr-2 space-y-3 custom-scrollbar flex-1">
                                {mailbox.length === 0 ? (
                                    <div className="text-center text-slate-500 py-8">Dein Briefkasten ist leer.</div>
                                ) : (
                                    mailbox.map(gift => (
                                        <div key={gift.id} className="bg-slate-800/80 p-4 rounded-xl border border-slate-700">
                                            <div className="flex justify-between items-start mb-2">
                                                <div className="text-sm font-bold text-emerald-400">Von: {gift.senderName}</div>
                                                <div className="text-xs text-slate-500">{new Date(gift.timestamp).toLocaleDateString()}</div>
                                            </div>
                                            {gift.message && <div className="text-slate-300 text-sm mb-3 italic">"{gift.message}"</div>}
                                            {gift.goldAmount > 0 && (
                                                <div className="text-yellow-400 font-bold text-sm flex items-center gap-1 mb-3">
                                                    🪙 {gift.goldAmount} Gold
                                                </div>
                                            )}
                                            {gift.item && (
                                                <div className="flex items-center gap-2 mb-3 bg-slate-900/50 p-2 rounded-lg border border-slate-700">
                                                    <img src={gift.item.image} alt={gift.item.name} className="w-8 h-8 object-contain" />
                                                    <div className="text-sm font-bold text-slate-200">{gift.item.name}</div>
                                                </div>
                                            )}
                                            {Array.isArray(gift.items) && gift.items.length > 0 && (
                                                <div className="flex flex-wrap gap-2 mb-3 bg-slate-900/50 p-2 rounded-lg border border-slate-700">
                                                    {gift.items.map((item, idx) => (
                                                        <div key={idx} className="flex items-center gap-2 bg-slate-800 p-1.5 rounded-md border border-slate-600">
                                                            <img src={item.image} alt={item.name} className="w-6 h-6 object-contain" />
                                                            <div className="text-xs font-bold text-slate-200">{item.name}</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            <button 
                                                onClick={async () => {
                                                    try {
                                                        const res = await apiCall(`/lobby/${currentLobbyId}/collect-gift`, {
                                                            method: "POST",
                                                            body: JSON.stringify({ giftId: gift.id })
                                                        });
                                                        setGold(res.newGold);
                                                        setMailbox(res.mailbox);
                                                        if (res.inventory) setInventory(res.inventory);
                                                        if (res.petInventory) setPetInventory(res.petInventory);
                                                        if (res.decoInventory) setDecoInventory(res.decoInventory);
                                                        if (res.harvestedItems) setHarvestedItems(res.harvestedItems);
                                                        notify("Geschenk abgeholt!", "success");
                                                    } catch(e) {
                                                        notify(e.message || "Fehler beim Abholen", "error");
                                                    }
                                                }}
                                                className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-xs transition-colors"
                                            >
                                                Einsammeln
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                        ) : (
                            <div className="flex flex-col gap-4">
                                <div>
                                    <label className="text-xs text-slate-400 block mb-2 font-bold uppercase tracking-wider">Nachricht (optional)</label>
                                    <textarea 
                                        value={giftMessage}
                                        onChange={e => setGiftMessage(e.target.value)}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 resize-none h-24"
                                        placeholder="Schreibe eine nette Nachricht..."
                                        maxLength={100}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-slate-400 block mb-2 font-bold uppercase tracking-wider">Gold spenden</label>
                                    <div className="flex items-center gap-3">
                                        <input 
                                            type="number" 
                                            min="0" 
                                            max={gold}
                                            value={giftGold}
                                            onChange={e => setGiftGold(Math.max(0, Math.min(gold, parseInt(e.target.value) || 0)))}
                                            className="flex-1 bg-slate-800 border border-slate-700 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-yellow-500"
                                        />
                                        <span className="text-xl">🪙</span>
                                    </div>
                                    <div className="text-xs text-slate-500 mt-1 text-right">Dein Gold: {gold}</div>
                                </div>
                                <div>
                                    <label className="text-xs text-slate-400 block mb-2 font-bold uppercase tracking-wider">Item schenken (optional)</label>
                                    <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-2">
                                        <button 
                                            onClick={() => setGiftItems([])}
                                            className={`flex-shrink-0 w-12 h-12 rounded-xl border-2 flex items-center justify-center transition-all ${giftItems.length === 0 ? "border-emerald-500 bg-emerald-500/20" : "border-slate-700 bg-slate-800 hover:bg-slate-700"}`}
                                        >
                                            <span className="text-slate-400">✕</span>
                                        </button>
                                        {/* Samen */}
                                        {inventory.map(item => (
                                            <button 
                                                key={item.instanceId}
                                                onClick={() => toggleGiftItem('seed', item)}
                                                className={`flex-shrink-0 w-12 h-12 rounded-xl border-2 flex items-center justify-center transition-all relative ${giftItems.some(gi => gi.item.instanceId === item.instanceId) ? "border-emerald-500 bg-emerald-500/20" : "border-slate-700 bg-slate-800 hover:bg-slate-700"}`}
                                                title={item.name}
                                            >
                                                <img src={item.image} alt={item.name} className="w-8 h-8 object-contain" />
                                            </button>
                                        ))}
                                        {/* Pflanzen (Geerntet) */}
                                        {harvestedItems.map(plant => (
                                            <button 
                                                key={plant.id} 
                                                onClick={() => toggleGiftItem('plant', plant)}
                                                className={`flex-shrink-0 w-12 h-12 rounded-xl border-2 flex items-center justify-center transition-all relative ${giftItems.some(gi => gi.item.id === plant.id) ? "border-emerald-500 bg-emerald-500/20" : "border-slate-700 bg-slate-800 hover:bg-slate-700"}`}
                                                title={plant.name}
                                            >
                                                <img src={plant.image} alt={plant.name} className="w-8 h-8 object-contain" />
                                            </button>
                                        ))}
                                        {/* Tiere */}
                                        {petInventory.map(pet => (
                                            <button 
                                                key={pet.instanceId || pet.id}
                                                onClick={() => toggleGiftItem('pet', pet)}
                                                className={`flex-shrink-0 w-12 h-12 rounded-xl border-2 flex items-center justify-center transition-all relative ${giftItems.some(gi => (gi.item.instanceId || gi.item.id) === (pet.instanceId || pet.id)) ? "border-emerald-500 bg-emerald-500/20" : "border-slate-700 bg-slate-800 hover:bg-slate-700"}`}
                                                title={pet.name}
                                            >
                                                <img src={pet.image} alt={pet.name} className="w-8 h-8 object-contain" />
                                            </button>
                                        ))}
                                        {/* Deko */}
                                        {decoInventory.map(deco => (
                                            <button 
                                                key={deco.instanceId || deco.id}
                                                onClick={() => toggleGiftItem('deco', deco)}
                                                className={`flex-shrink-0 w-12 h-12 rounded-xl border-2 flex items-center justify-center transition-all relative ${giftItems.some(gi => (gi.item.instanceId || gi.item.id) === (deco.instanceId || deco.id)) ? "border-emerald-500 bg-emerald-500/20" : "border-slate-700 bg-slate-800 hover:bg-slate-700"}`}
                                                title={deco.name}
                                            >
                                                <img src={deco.image} alt={deco.name} className="w-8 h-8 object-contain" />
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <button 
                                    onClick={async () => {
                                        if (giftGold === 0 && !giftMessage.trim() && giftItems.length === 0) {
                                            notify("Bitte füge Gold, Items oder eine Nachricht hinzu.", "error");
                                            return;
                                        }
                                        try {
                                            const res = await apiCall(`/lobby/${currentLobbyId}/send-gift`, {
                                                method: "POST",
                                                body: JSON.stringify({ 
                                                    targetUserId: mailboxTargetId, 
                                                    message: giftMessage.trim(), 
                                                    goldAmount: giftGold,
                                                    giftItems 
                                                })
                                            });
                                            setGold(res.newGold);
                                            if (res.inventory) setInventory(res.inventory);
                                            if (res.petInventory) setPetInventory(res.petInventory);
                                            if (res.decoInventory) setDecoInventory(res.decoInventory);
                                            if (res.harvestedItems) setHarvestedItems(res.harvestedItems);
                                            notify("Geschenk erfolgreich gesendet!", "success");
                                            setMailboxOpen(false);
                                            setGiftMessage("");
                                            setGiftGold(0);
                                            setGiftItems([]);
                                        } catch(e) {
                                            notify(e.message || "Fehler beim Senden", "error");
                                        }
                                    }}
                                    className="w-full py-3 mt-2 font-black bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition-transform active:scale-95 shadow-lg"
                                >
                                    Geschenk absenden
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Changelog Modal */}
            {isChangelogOpen && (
                <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-slate-900 border border-slate-700 p-6 rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
                        
                        {/* Header */}
                        <div className="flex justify-between items-center mb-6 border-b border-slate-800 pb-4">
                            <div className="flex items-center gap-3">
                                <span className="text-3xl">📜</span>
                                <h2 className="text-2xl font-black text-white tracking-tight">Changelog</h2>
                                <span className="bg-indigo-500/20 text-indigo-400 text-xs font-bold px-2 py-1 rounded-lg border border-indigo-500/30">
                                    v2.0
                                </span>
                            </div>
                            <button 
                                onClick={() => setChangelogOpen(false)} 
                                className="text-slate-400 hover:text-white hover:bg-slate-800 p-2 rounded-full transition-colors"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Content Area */}
                        <div className="overflow-y-auto pr-3 space-y-6 custom-scrollbar flex-1">

                            {/* v2.0 Section */}
                            <div className="border border-indigo-500/30 rounded-2xl overflow-hidden">
                                <div className="bg-indigo-600/20 px-5 py-3 flex items-center gap-2 border-b border-indigo-500/20">
                                    <span className="text-indigo-400 font-black text-sm uppercase tracking-widest">v2.0</span>
                                    <span className="text-slate-400 text-xs">– Economy Update</span>
                                </div>
                                <div className="p-5 space-y-5">
                                    <section>
                                        <h4 className="text-indigo-400 font-bold text-base mb-2 flex items-center gap-2">
                                            ✨ Economy
                                        </h4>
                                        <p className="text-slate-300 text-sm leading-relaxed">
                                            Die gesamte Wirtschaft wurde auf ein Neues Balancing umgestellt. Preise, Erträge und Zeiten sind nun perfekt für den langfristigen Spielspaß optimiert.
                                        </p>
                                    </section>
                                    <section>
                                        <h4 className="text-amber-400 font-bold text-base mb-2 flex items-center gap-2">
                                            ⚡ Aktives Speed-Farming
                                        </h4>
                                        <p className="text-slate-300 text-sm leading-relaxed">
                                            Aktive Playtime wird unterstützt! Einige Pflanzen haben nun extrem kurze Cooldowns (ab 4 Sek.).
                                        </p>
                                    </section>
                                    <section>
                                        <h4 className="text-purple-400 font-bold text-base mb-2 flex items-center gap-2">
                                            🌌 Milliarden-Ziele (Long-Term)
                                        </h4>
                                        <p className="text-slate-300 text-sm leading-relaxed">
                                            Für die Profis gibt es jetzt Ziele im Milliarden-Bereich. Die <strong>Mondblume</strong> und neue legendäre Samen bieten massive Profite für echte Garten-Imperien.
                                        </p>
                                    </section>
                                    <div className="bg-indigo-500/10 p-4 rounded-xl border border-indigo-500/20">
                                        <p className="text-indigo-300 font-bold text-xs uppercase tracking-wider mb-1">⚙️ Automatische Migration</p>
                                        <p className="text-slate-400 text-xs italic">
                                            Alle bereits gepflanzten Samen wurden automatisch an die neuen Slot-Limits und Economy-Werte angepasst.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* v1.1 Section */}
                            <div className="border border-slate-700/50 rounded-2xl overflow-hidden">
                                <div className="bg-slate-700/30 px-5 py-3 flex items-center gap-2 border-b border-slate-700/50">
                                    <span className="text-slate-400 font-black text-sm uppercase tracking-widest">v1.1 Alpha</span>
                                </div>
                                <div className="p-5 space-y-5">
                                    <section>
                                        <h4 className="text-emerald-400 font-bold text-base mb-2 flex items-center gap-2">
                                            ✨ Neue Features & Verbesserungen
                                        </h4>
                                        <ul className="space-y-1.5">
                                            {[
                                                "Neue einheitliche Skins & angepasste Größen von Strukturen und Charakteren",
                                                "Pflanzen-Economy Anpassungen & komplett überarbeitete Felder im neuen 2x2 Design",
                                                "Dunkles Gras zwischen den Feldern auf dieselbe Größe angepasst & Rahmen fertiger Pflanzen umgelegt",
                                                "Bilder für fehlende Pflanzen und Tiere ergänzt sowie Tiere überarbeitet",
                                                "Neue Dekorationen in verschiedenen Größen hinzugefügt",
                                                "Hintergrundmusik mit eigenem Slider & neue Sounds für Ernten, Verkaufen und Anpflanzen",
                                                "Verbesserte Overlays bei Shop Rotationen",
                                                "Sub Bonus Badge eingeführt (50% mehr Verkaufsbonus) & neues Betatester Badge",
                                                "Tiere können jetzt an einem neuen, separaten Stand verkauft werden",
                                                "Dekorationen, Tiere und Werkzeuge belegen keine Inventar-Slots mehr",
                                                "Neues Admin-Dashboard (Goldvergabe & Spieler-Einsicht)",
                                            ].map((item, i) => (
                                                <li
                                                    key={i}
                                                    className="text-sm text-slate-300 flex items-start gap-2"
                                                >
                                                    <span className="text-emerald-500 mt-0.5">•</span>{" "}
                                                    {item}
                                                </li>
                                            ))}
                                        </ul>
                                    </section>
                                    <section>
                                        <h4 className="text-amber-400 font-bold text-base mb-2 flex items-center gap-2">
                                            🐛 Behobene Fehler
                                        </h4>
                                        <ul className="space-y-1.5">
                                            {[
                                                "Inventar ist nicht mehr unendlich groß",
                                                "Synchronisationsbugs in Multiplayer-Servern (Ernten, Kauf, Verkauf) gefixed",
                                                "Hover-Infos im Inventar und auf fremden Farmen verbessert, einheitlicher und mit Stats",
                                                "Shop-Bestände werden korrekt aktualisiert und nicht mehr ungewollt resettet",
                                                "Spezialeffekte von Pflanzen werden jetzt richtig gezeichnet",
                                                "Spezial-Overlays (Gold, Rainbow, Wetter) bei Mehrfachpflanzen nun pro Slot statt auf der gesamten Struktur",
                                                "Gestretchte Pflanzen oder Dekorationen rendern jetzt in normaler Auflösung",
                                                "Spielernamen werden an den Feldern richtig angezeigt",
                                                "Doppelte Tiere/Dekos beim Sammeln oder Kaufen werden verhindert",
                                            ].map((item, i) => (
                                                <li
                                                    key={i}
                                                    className="text-sm text-slate-300 flex items-start gap-2"
                                                >
                                                    <span className="text-amber-500 mt-0.5">•</span>{" "}
                                                    {item}
                                                </li>
                                            ))}
                                        </ul>
                                    </section>
                                    <section>
                                        <h4 className="text-rose-400 font-bold text-base mb-2 flex items-center gap-2">
                                            🛡️ Security Fixes
                                        </h4>
                                        <ul className="space-y-1.5">
                                            {[
                                                "Briefkasten kann nicht mehr durch negative Beiträge manipuliert/befüllt werden",
                                                "Eier- und Pflanzen-Timer laufen jetzt sicher über den Server statt lokal",
                                                "Möglichkeit, sich über das Frontend Geld zu ercheaten, wurde komplett unterbunden",
                                            ].map((item, i) => (
                                                <li
                                                    key={i}
                                                    className="text-sm text-slate-300 flex items-start gap-2"
                                                >
                                                    <span className="text-rose-500 mt-0.5">•</span>{" "}
                                                    {item}
                                                </li>
                                            ))}
                                        </ul>
                                    </section>
                                </div>
                            </div>

                        </div>

                        {/* Footer */}
                        <div className="mt-6 pt-4">
                            <button 
                                onClick={() => setChangelogOpen(false)} 
                                className="w-full py-3.5 font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-all active:scale-[0.98] shadow-[0_0_20px_rgba(37,99,235,0.2)]"
                            >
                                Schließen
                            </button>
                        </div>
                        
                    </div>
                </div>
            )}

            {/* Player List Modal */}
            {isPlayerListOpen && isMultiplayer && (
                <div className="absolute inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-50">
                    <div className="bg-slate-900 border border-slate-700 p-6 rounded-3xl w-[400px] max-h-[80vh] flex flex-col shadow-2xl">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-black text-white">👥 Spieler in der Lobby</h2>
                            <button onClick={() => setPlayerListOpen(false)} className="text-slate-400 hover:text-white">✕</button>
                        </div>
                        <div className="overflow-y-auto pr-2 space-y-2 custom-scrollbar flex-1">
                            {/* Mich selbst anzeigen */}
                            <div className="flex items-center justify-between bg-slate-800/80 p-3 rounded-xl border border-emerald-500/30">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center text-white font-bold">
                                        {(authUser?.twitchLogin || authUser?.login || "Du").charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <div className="flex flex-wrap items-center gap-1.5 text-emerald-300 font-bold text-sm">
                                            {myAccountId && String(lobbyHostId) === myAccountId && (
                                                <span className="text-amber-400" title="Lobby-Host">👑</span>
                                            )}
                                            <span>{(authUser?.twitchLogin || authUser?.login || "Du")} (Du)</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            {/* Andere Spieler anzeigen */}
                            {remotePlayersList.map(p => (
                                <div key={p.userId} className="flex items-center justify-between bg-slate-800/50 p-3 rounded-xl border border-slate-700">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-slate-300 font-bold">
                                            {(p.name || "S").charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                            <div className="flex flex-wrap items-center gap-1.5 text-slate-200 font-bold text-sm">
                                                {String(lobbyHostId) === String(p.userId) && (
                                                    <span className="text-amber-400" title="Lobby-Host">👑</span>
                                                )}
                                                <span>{p.name}</span>
                                            </div>
                                        </div>
                                    </div>
                                    {myAccountId && String(lobbyHostId) === myAccountId && String(lobbyHostId) !== String(p.userId) && (
                                        <button 
                                            onClick={async () => {
                                                if (window.confirm(`Möchtest du ${p.name} wirklich kicken?`)) {
                                                    try {
                                                        await apiCall(`/lobby/${currentLobbyId}/kick`, {
                                                            method: "POST",
                                                            body: JSON.stringify({ targetUserId: p.userId })
                                                        });
                                                        notify(`${p.name} wurde gekickt.`, "success");
                                                    } catch (e) {
                                                        notify(e.message || "Fehler beim Kicken.", "error");
                                                    }
                                                }
                                            }}
                                            className="px-3 py-1 bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white text-xs font-bold rounded border border-red-600/50 transition-colors"
                                        >
                                            Kick
                                        </button>
                                    )}
                                </div>
                            ))}
                            {remotePlayersList.length === 0 && (
                                <div className="text-center text-slate-500 text-sm py-4">
                                    Keine anderen Spieler in der Lobby.
                                </div>
                            )}
                        </div>
                        <button onClick={() => setPlayerListOpen(false)} className="w-full py-3 mt-4 font-black bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-transform active:scale-95 shadow-lg">
                            Schließen
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}