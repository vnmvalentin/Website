// ui/gardenTokens.js
// Konstanten, Icon-Zuordnungen und Formatierer des Virtual-Farm-HUDs.
//
// Bewusst OHNE JSX und ohne Komponenten: die Lint-Regel react-refresh/only-export-components
// verlangt, dass eine Datei entweder Komponenten oder geteilte Werte exportiert, nicht beides.
// Die Komponenten liegen daneben in gardenUi.jsx.
//
// Designregeln (siehe feedback_design_clean): rounded-md/sm, flache dunkle Flächen,
// keine Gradients, keine Glows, keine Scale-Hovers, KEINE Emojis — Icons via lucide-react.
import {
    Coins, Backpack, Home, Store, ShoppingCart, Settings, ScrollText, Shirt, PawPrint,
    Sun, CloudRain, Snowflake, CloudLightning, Moon, Pickaxe, Shovel, Droplets, Egg,
    Armchair, Sprout, Leaf, FlaskConical, X, Clock, Sparkles, Rainbow, Ruler, Lock,
    Package, Zap,
} from 'lucide-react';

export const GardenIcon = {
    gold: Coins,
    inventory: Backpack,
    farm: Home,
    shopArea: ShoppingCart,
    marketArea: Store,
    settings: Settings,
    changelog: ScrollText,
    wardrobe: Shirt,
    pets: PawPrint,
    incubator: FlaskConical,
    close: X,
    timer: Clock,
    size: Ruler,
    lock: Lock,
    golden: Sparkles,
    rainbow: Rainbow,
    charged: Zap,
};

const WEATHER_ICONS = { sun: Sun, rain: CloudRain, snow: Snowflake, thunder: CloudLightning, moonlight: Moon };
export function weatherIcon(type) {
    return WEATHER_ICONS[type] || Sun;
}

const TOOL_ICONS = { pickaxe: Pickaxe, shovel: Shovel, pot: Sprout, watering: Droplets };
export function toolIcon(key) {
    return TOOL_ICONS[key] || Package;
}

const CATEGORY_ICONS = { seed: Sprout, plant: Leaf, egg: Egg, pet: PawPrint, deco: Armchair, tool: Pickaxe, all: Package };
export function categoryIcon(key) {
    return CATEGORY_ICONS[key] || Package;
}

const STATUS_ICONS = { wet: Droplets, frozen: Snowflake, charged: Zap, moonlit: Moon };
export function statusEffectIcon(key) {
    return STATUS_ICONS[key] || null;
}

export const RARITY_TEXT = {
    COMMON: "text-slate-300",
    UNCOMMON: "text-emerald-400",
    RARE: "text-sky-400",
    EPIC: "text-violet-400",
    LEGENDARY: "text-amber-400",
    MYTHIC: "text-pink-400",
};
export const RARITY_BORDER = {
    COMMON: "border-slate-600",
    UNCOMMON: "border-emerald-600/70",
    RARE: "border-sky-600/70",
    EPIC: "border-violet-600/70",
    LEGENDARY: "border-amber-500/70",
    MYTHIC: "border-pink-500/70",
};
export const RARITY_DOT = {
    COMMON: "bg-slate-400",
    UNCOMMON: "bg-emerald-500",
    RARE: "bg-sky-500",
    EPIC: "bg-violet-500",
    LEGENDARY: "bg-amber-500",
    MYTHIC: "bg-pink-500",
};

/** Flache HUD-Fläche — eine Klasse, damit alle Leisten identisch aussehen. */
export const HUD_SURFACE = "bg-slate-900/90 border border-slate-800 rounded-md backdrop-blur-sm";

export function formatDuration(ms) {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
}

export function formatGold(value) {
    const n = Number(value || 0);
    if (n >= 1_000_000_000_000) return `${(n / 1_000_000_000_000).toFixed(1)}T`;
    if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(n % 1_000_000_000 === 0 ? 0 : 1)}Mrd`;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}Mio`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}k`;
    return n.toLocaleString("de-DE");
}
