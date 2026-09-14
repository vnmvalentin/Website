// ui/gardenTokens.js
// Konstanten, Icon-Zuordnungen und Formatierer des Virtual-Farm-HUDs.
//
// Bewusst OHNE JSX und ohne Komponenten: die Lint-Regel react-refresh/only-export-components
// verlangt, dass eine Datei entweder Komponenten oder geteilte Werte exportiert, nicht beides.
// Die Komponenten liegen daneben in gardenUi.jsx.
//
// Designregeln (Stand 30.08., "Cartoon-Overhaul"): GROSSE Radien, dicke dunkle
// Comic-Konturen, ein hartkantiger "Stufen"-Schatten unter jedem Button fürs
// Drücken (aktiv: Button rutscht runter, Schatten wird kleiner), Verläufe für
// Volumen auf Flächen, Baloo 2 als Schrift — KEINE Emojis, Icons via eigenen
// Bildern aus gameIcons.jsx (lucide nur noch, wo (noch) kein Bild existiert).
//
// Das ist eine bewusste KEHRTWENDE gegenüber der Regel, die hier bis 30.08.
// stand ("flache dunkle Flächen, keine Gradients, keine Glows, keine Scale-
// Hovers") — die galt fürs alte, zurückhaltend-comichafte HUD ("rund, freundlich,
// comichaft, ABER OHNE VERSPIELT ZU WIRKEN", siehe index.html). Feedback 30.08.
// wollte ausdrücklich das Gegenteil: "highly cartoony, vibrant, cozy, playful".
// Gilt nur für dieses HUD, nicht für den Rest der Seite (Clash-Royale-Overlays
// etc. bleiben beim alten, ruhigen Stil).
//
// HUD_SURFACE trägt den Stufen-Schatten direkt in der Klasse: jeder Button, der
// sie benutzt, bekommt Drück-Optik automatisch, ohne selbst active: schreiben zu
// müssen. Reine Anzeige-Flächen (Wetter-Kachel, Party-Banner) nutzen sie genauso
// — :active greift dort schlicht nie, weil niemand daraufklickt.
import {
    PawPrint, Sun, Pickaxe, Shovel, Sprout, Droplets, FlaskConical, Clock, Package,
} from 'lucide-react';
import { HudIcon, WeatherIcon, TabIcon, StatusIcon, SpecialIcon } from './gameIcons';

// Feedback 30.08.: "eigene Icons statt emojis ... statt lucide" — wo inzwischen ein
// eigenes Bild existiert (garden-assets/icons/), steht hier jetzt das statt der
// lucide-Komponente. Ein paar Einträge blieben lucide, weil dafür (noch) kein
// eigenes Bild geliefert wurde: pets, incubator, timer — dieselbe lucide-Form
// (PawPrint/FlaskConical/Clock) steht an anderen Stellen im Spiel schon für etwas
// anderes, mit eigenem Bild (siehe gameIcons.jsx), ein Ersatz hier hätte das
// verwechselt. wardrobe hat inzwischen ein eigenes Bild (Nachlieferung 30.08.).
//
// WICHTIG: GardenIcon selbst wird aktuell nirgends importiert (geprüft 30.08.) —
// jede Stelle im Spiel zieht ihr Icon direkt aus einem eigenen lucide- oder
// gameIcons-Import. Diese Zuordnung hier bleibt trotzdem korrekt gepflegt, falls
// sie später doch als zentrale Stelle verwendet wird.
export const GardenIcon = {
    gold: HudIcon.gold,
    inventory: HudIcon.inventory,
    farm: HudIcon.farm,
    shopArea: HudIcon.shopArea,
    marketArea: HudIcon.sellArea,
    settings: HudIcon.settings,
    changelog: HudIcon.changelog,
    wardrobe: HudIcon.wardrobe,
    pets: PawPrint,
    incubator: FlaskConical,
    close: HudIcon.close,
    timer: Clock,
    size: HudIcon.ruler,
    lock: HudIcon.locked,
    golden: SpecialIcon.golden,
    rainbow: SpecialIcon.rainbow,
    charged: StatusIcon.charged,
};

const WEATHER_ICONS = {
    sun: WeatherIcon.sun, rain: WeatherIcon.rain, snow: WeatherIcon.snow,
    thunder: WeatherIcon.thunder, moonlight: WeatherIcon.moonlight,
};
export function weatherIcon(type) {
    return WEATHER_ICONS[type] || Sun;
}

// Werkzeug-Icons: bisher kein eigenes Bild geliefert (die Werkzeuge selbst haben
// schon echte Grafik unter garden-assets/tools/ — nur DIESE kleine Statusanzeige
// hier zeigt noch lucide). Siehe Icon Atlas, Kategorie "HUD navigation".
const TOOL_ICONS = { pickaxe: Pickaxe, shovel: Shovel, pot: Sprout, watering: Droplets };
export function toolIcon(key) {
    return TOOL_ICONS[key] || Package;
}

const CATEGORY_ICONS = {
    seed: TabIcon.seed, plant: TabIcon.plant, egg: TabIcon.egg, pet: TabIcon.pet,
    deco: TabIcon.deco, tool: TabIcon.tool, all: TabIcon.all,
};
export function categoryIcon(key) {
    return CATEGORY_ICONS[key] || TabIcon.all;
}

const STATUS_ICONS = {
    wet: StatusIcon.wet, frozen: StatusIcon.frozen, charged: StatusIcon.charged, moonlit: StatusIcon.moonlit,
};
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

/**
 * Chunky Holz-Fläche — eine Klasse, damit alle Leisten/Knöpfe identisch aussehen.
 * Der Stufen-Schatten (shadow-[...]) + active:translate simulieren einen Knopf,
 * der beim Klick nach unten gedrückt wird; disabled: nimmt den Effekt wieder weg,
 * ein deaktivierter Knopf soll nicht drückbar WIRKEN, wenn er es nicht ist.
 *
 * Feedback 30.08. (zweite Runde): war amber-600/700 — "knalliges Orange", auf dem
 * die weiße Schrift zu wenig Kontrast hatte. Zwei Stufen dunkler (amber-800/900,
 * dieselbe Dunkelheit wie der Holzrahmen der Fenster in gardenUi.jsx) behält den
 * Holzton, ohne grell zu wirken.
 */
export const HUD_SURFACE =
    "bg-gradient-to-b from-amber-800 to-amber-900 border-[3px] border-amber-950 rounded-2xl " +
    "shadow-[0_4px_0_0_#2c1606] transition-[transform,box-shadow] duration-100 " +
    "active:translate-y-1 active:shadow-[0_1px_0_0_#2c1606] " +
    "disabled:translate-y-1 disabled:shadow-none disabled:opacity-50";

/** Dieselbe Drück-Mechanik, nur in Grasgrün — für die Haupt-Handlung eines
 * Fensters (siehe PrimaryButton in gardenUi.jsx), damit sie sich von den
 * hölzernen Neben-Knöpfen abhebt.
 *
 * Feedback 30.08. (zweite Runde): "weiße Schrift auf Kaufen schlecht lesbar" —
 * war lime-400/500, ein helles Grasgrün, auf dem weiße Schrift zu wenig
 * Kontrast hatte (derselbe Fehler wie beim zu hellen HUD_SURFACE-Orange).
 * Zwei Stufen dunkler (green-600/700) behält den Grasgrün-Charakter, ohne
 * gegen den eigenen Text zu kämpfen.
 */
export const BTN_PRIMARY =
    "bg-gradient-to-b from-green-600 to-green-700 border-[3px] border-green-950 rounded-2xl " +
    "shadow-[0_4px_0_0_#052e16] transition-[transform,box-shadow] duration-100 " +
    "hover:from-green-500 hover:to-green-600 " +
    "active:translate-y-1 active:shadow-[0_1px_0_0_#052e16] " +
    "disabled:translate-y-1 disabled:shadow-none disabled:opacity-50 disabled:from-slate-500 disabled:to-slate-600 disabled:border-slate-800";

/** Kleine cremefarbene Marke für kurze Texte/Zahlen (Feedback 30.08.: "soft
 * cream for text backgrounds") — bewusst NUR für Kleinteile (Chips, Zähler),
 * nicht für ganze Fenster: helle Fläche + der restliche helle Text im HUD
 * verträgt sich nicht, siehe Kommentar oben an GardenModal in gardenUi.jsx. */
export const CHIP_CREAM = "bg-amber-50 text-amber-900 border-2 border-amber-300 rounded-xl";

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
