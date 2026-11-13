// engine/Renderer.js
import { MAP_CONFIG, TILE_SIZE, STEIN_REIHEN, istSteinfeldWegRow, getSignLayout, getDirtCellWorldPos, BODEN, weltHash, weltRauschen } from './MapConfig';
import { versionedAsset } from './assetVersion';
import {
    getGrowthProgressForRender,
    isPlantReadyForRender,
    getPlantVisuals,
    getPlantArchetype,
    getPlantArchetypeKey,
    ARCHETYPE_PROFILES,
    USE_PROCEDURAL_SUPPORTS,
} from './PlantSystem';
import { getPetSize } from './PetSystem';
import { hatKosmetik, TITEL as STERN_TITEL } from '../ui/prestige';

const SPUR_REGENBOGEN = ["#f87171", "#fb923c", "#facc15", "#4ade80", "#60a5fa", "#c084fc"];
import { DEKO_KATALOG, istBoden } from '../ui/deko';
import { pixelBodenKachel, pixelZaun } from './pixelBoden';
import { laternenBild, LATERNE_LICHT, LATERNE_W, LATERNE_H } from './wegLaterne';
import { zeichneHut, hutHoehe } from './huete';
import { zeichneSaisonBoden, zeichneSaisonTon, zeichneSaisonLuft, zeichneGluehwuermchen } from './saisonLook';
import { zeichneFigur } from './figurAnim';
import { zeichneTeichLeben, zeichneAngelSzene } from './teichLeben';
import { tuerLage, tuerMass, tuerPfad } from './hausTuer';
import { partyTakt, tanzSchritt, zeichneFeuerwerk, zeichnePartyWelt } from './partyShow';

// Schädlinge/Unkraut-Sprites (siehe _drawStoerer). Ein Zeichen = ein Pixel, "." leer.
const KAEFER_MUSTER = [
    "..a..a..",
    "...aa...",
    ".bbbbbb.",
    "abcbbcba",
    ".bbbbbb.",
    "abbccbba",
    "..bbbb..",
];
const KAEFER_FARBEN = { a: "#1f2937", b: "#dc2626", c: "#111827" };
const UNKRAUT_MUSTER = [
    "..h....h..",
    "h..g..g..h",
    ".g..g.g.g.",
    "..g.ggg.g.",
    "g..gggg..g",
    ".g.ggggdg.",
    "..dggggd..",
];
const UNKRAUT_FARBEN = { g: "#4d7c0f", h: "#a3e635", d: "#365314" };

/**
 * Kantenlänge eines Tieres bei Größenfaktor 1. Bezug ist die Spielfigur, die mit
 * 80 px gezeichnet wird (siehe drawPlayer) — ein Faktor über 1 ist also größer als
 * der Spieler. Vorher lag die Grundgröße bei TILE_SIZE * 0.62 (rund 40 px), womit
 * selbst ein Pferd nur halb so groß war wie sein Besitzer.
 */
const PET_BASIS_GROESSE = 70;

/**
 * Ersatzdarstellung der Gebäude, solange (oder falls) kein Bild vorliegt: farbige
 * Fläche mit Symbol. Gilt für alle, die auf einem Grundstück stehen.
 */
const AREA_ERSATZ = {
    // trash/chest/vitrine/incubator stehen seit v2 nicht mehr einzeln auf dem
    // Feld — alle vier wohnen im Schuppen (siehe "shed" unten). Die Einträge
    // bleiben als Ersatzkasten stehen, falls irgendwo noch ein alter Spielstand
    // mit einer dieser Bauarten hereinkommt.
    incubator: { farbe: "#14b8a6", symbol: "🧪" },
    trash:     { farbe: "#57534e", symbol: "🗑️" },
    chest:     { farbe: "#a16207", symbol: "📦" },
    vitrine:   { farbe: "#7c3aed", symbol: "🏆" },
    shed:      { farbe: "#a16207", symbol: "🧰" },
};

/**
 * Welche BAUART ein Areal zeichnerisch ist. Bei fremden Grundstücken sagt `type`
 * nur, ob man das Gebäude anlaufen darf ("fremdeVitrine" ja, "fremdesGebaeude"
 * nein) — die Größe und der Ersatzkasten hängen aber an der Bauart, die dann in
 * `art` steht. Ohne diese Trennung wäre der Mülleimer des Nachbarn so groß wie
 * eine Marktbude gezeichnet worden.
 */
function bauart(area) {
    return area?.art || area?.type || "incubator";
}

// Fallback für Grundstücke ohne eigene Deko — EINE geteilte, eingefrorene Liste
// statt je Grundstück und Bild ein neues `[]`, siehe _gruppiereDekoNachSlot.
const LEERE_DEKO_LISTE = Object.freeze([]);

// Gold-Shop: Namensschild-Farben je Reskin — MUSS zu core/reskins.js (Backend)
// UND ui/reskins.js (Frontend-Katalog fürs Kaufmenü) passen. Bewusst dieselbe
// kleine Kopie wie AREA_IMAGES/TOOL_IMAGE_BY_KEY weiter unten: der Renderer
// zeichnet unabhängig davon, ob der Laden je geöffnet wurde.
// `bg2` = zweiter Verlaufs-Halt (Feedback 01.09.: "Textur statt flacher
// Farbe") — _drawPlayerNametag zeichnet damit einen diagonalen Verlauf statt
// einer flachen Füllung.
const NAMEPLATE_RESKIN_FARBEN = {
    gold: { bg: "#fef3c7", bg2: "#fcd34d", border: "#92400e", text: "#78350f" },
    royal: { bg: "#ede9fe", bg2: "#c4b5fd", border: "#5b21b6", text: "#4c1d95" },
    neon: { bg: "#022c22", bg2: "#065f46", border: "#10b981", text: "#6ee7b7" },
    rose: { bg: "#fce7f3", bg2: "#f9a8d4", border: "#be185d", text: "#831843" },
    obsidian: { bg: "#18181b", bg2: "#3f3f46", border: "#71717a", text: "#e4e4e7" },
    // Saisonziele (Backend core/saisonziele.js) — nicht käuflich.
    kirschbluete: { bg: "#fdf2f8", bg2: "#fbcfe8", border: "#db2777", text: "#831843" },
    sonnenglut: { bg: "#fff7ed", bg2: "#fdba74", border: "#c2410c", text: "#7c2d12" },
    laubgold: { bg: "#fde68a", bg2: "#d97706", border: "#78350f", text: "#451a03" },
    raureif: { bg: "#f0f9ff", bg2: "#bae6fd", border: "#0369a1", text: "#0c4a6e" },
    jahreskreis: { bg: "#fbcfe8", bg2: "#bae6fd", border: "#6d28d9", text: "#3b0764" },
};
// Gold-Shop: Briefkasten-Bildpfade je Reskin. Der Schuppen braucht keine eigene
// Kopie hier — sein Bild kommt schon fertig als area.image an (GameContainer.jsx
// setzt es je nach ausgerüstetem Reskin), genau wie beim Standard-Look.
// Exportiert (Feedback 01.09.: vollständiger Ladebildschirm), damit
// GameContainer.jsx dieselben Pfade fürs Vorladen nutzt statt einer dritten,
// separat gepflegten Kopie.
export const MAILBOX_RESKIN_BILD = {
    brick: "/garden-assets/world/mailbox_variants/brick.png",
    cyber: "/garden-assets/world/mailbox_variants/cyber.png",
    dark: "/garden-assets/world/mailbox_variants/dark.png",
    future: "/garden-assets/world/mailbox_variants/future.png",
    magepunk: "/garden-assets/world/mailbox_variants/magepunk.png",
    nature: "/garden-assets/world/mailbox_variants/nature.png",
    rusty: "/garden-assets/world/mailbox_variants/rusty.png",
};

const RARITY_COLORS = {
    COMMON:    "#94a3b8",
    UNCOMMON:  "#4ade80",
    RARE:      "#60a5fa",
    EPIC:      "#a855f7",
    LEGENDARY: "#f59e0b",
    MYTHIC:    "#ec4899",
};
const ATLAS_IMAGE_SRC = "/garden-assets/atlas/garden_atlas.png";
const ATLAS_MANIFEST_SRC = "/garden-assets/atlas/garden_atlas.json";
// Seit 05.11. nur noch Namen der Varianten: gezeichnet wird im Code (engine/pixelBoden.js),
// die Ziffer im Namen ist die Variante.
const TERRAIN_FILES = {
    grass:     ["gras1.png", "gras2.png"],
    field:     ["acker1.png", "acker2.png", "acker3.png", "acker4.png"],
    rock:      ["stein1.png", "stein2.png", "stein3.png", "stein4.png"],
    path:      ["kiesweg1.png", "kiesweg2.png"],
    tallGrass: ["hohes_gras1.png", "hohes_gras2.png"],
    wood:      ["wood.png"],
};
const STRUCTURE_DIR = "/garden-assets/structure/";
const TERRAIN_FALLBACK_COLORS = {
    grass: "#22c55e",
    field: "#6b3410",
    rock: "#71717a",
};
const TOOL_IMAGE_BY_KEY = {
    pickaxe: "/garden-assets/tools/spitzhacke.png",
    shovel: "/garden-assets/tools/schaufel.png",
    pot: "/garden-assets/tools/topf.png",
    watering: "/garden-assets/tools/gieskanne.png",
    backpack: "/garden-assets/tools/rucksack.png",
    // Nur der Admin bekommt sie überhaupt in die Hand (siehe GameContainer).
    shotgun: "/garden-assets/world/shotgun-removebg-preview.png",
};
const TOOL_EMOJI_BY_KEY = {
    pickaxe: "⛏️",
    shovel: "🪓",
    pot: "🪴",
    watering: "🪣",
    backpack: "🎒",
    shotgun: "🔫",
};
// Die Shotgun ist deutlich länger als Hacke oder Kanne — auf 32 px gestaucht wäre
// sie ein Strich. Werkzeuge ohne Eintrag bleiben bei der Standardgröße.
const TOOL_GROESSE_BY_KEY = {
    shotgun: 52,
};
// Dasselbe für FREMDE Spieler. Von denen kennt der Renderer nur das Hand-Item, und
// davon überlebt die Prüfung im Server (sanitizeHeld) nur eine Handvoll Felder —
// der Werkzeugschlüssel gehört nicht dazu. Über den Bildpfad geht es trotzdem.
const TOOL_GROESSE_BY_BILD = new Map(
    Object.entries(TOOL_GROESSE_BY_KEY).map(([key, groesse]) => [TOOL_IMAGE_BY_KEY[key], groesse]),
);
// Werkzeuge, deren Grafik nach LINKS zeigt. Der Geist blickt standardmaessig nach
// rechts und haelt das Werkzeug auf der rechten Seite — die Gieskanne goss damit
// zurueck auf den Traeger statt nach vorn. Diese hier bekommen eine zusaetzliche
// Spiegelung, danach zeigen sie immer in Blickrichtung.
const TOOL_SPRITE_ZEIGT_LINKS = {
    watering: true,
};
// Abzeichen über dem Namensschild. „admin" vergibt ausschliesslich der Server
// (garden:appearance in Backend/garden/world/lobby.js) und verdrängt dort „Sub" —
// zwei Schilder übereinander wären nur Gedränge.
const BADGE_TEXT = {
    subscriber: "Sub",
    beta: "Beta",
    admin: "Admin",
};
const BADGE_FARBEN = {
    subscriber: { fuellung: "rgba(250,176,5,0.92)",  rand: "#fbbf24" },
    beta:       { fuellung: "rgba(96,165,250,0.92)", rand: "#93c5fd" },
    admin:      { fuellung: "rgba(248,113,113,0.94)", rand: "#fca5a5" },
};

// Wie lange eine Splatter-Wolke steht. MUSS zu SPLATTER_MS in
// Backend/garden/world/lobby.js passen: dort wird der Getroffene nach genau
// dieser Zeit aus der Welt genommen.
const SPLATTER_DAUER_MS = 1100;
const SPLATTER_TROPFEN = 26;

// v2-Fundament: gemeinsame Rückmeldungsschicht (siehe spawnFeedback weiter
// unten) — EIN System für Ernte-Gold, Doppelernte, Tier-Auslöser, Nachwuchs
// und Veredelung, statt für jeden Auslöser eine eigene Animation zu bauen.
const FEEDBACK_DAUER_MS = 1100;
const FEEDBACK_AUFSTIEG_PX = 46;
const FEEDBACK_MAX = 40;

// v2 (Punkt 13): Werkzeug-Schwung beim Gießen/Abbauen — Winkel in Radiant, je
// Werkzeug eigen, weil ein Hacken-Schlag weiter ausholt als ein Kannen-Kipp.
// Werkzeuge ohne Eintrag schwingen nicht (z. B. Schaufel — die hat keine
// eigene "Benutzen"-Aktion, sie zieht direkt eine Pflanze um).
const TOOL_SCHWUNG_MAX_RAD = {
    pickaxe: (55 * Math.PI) / 180,
    watering: (28 * Math.PI) / 180,
};
const TOOL_SCHWUNG_DAUER_MS = 380;
// Fliegende Ernte-Symbole (spawnItemFlug) — siehe dort.
const ITEM_FLUG_DAUER_MS = 500;
/** Wie lange sich die Figur beim Ernten/Pflanzen nach vorn beugt (spawnGriff). */
const GRIFF_DAUER_MS = 260;
const ITEM_FLUG_MAX = 24;
// Fallendes Saat-Tütchen beim Pflanzen (spawnSaatWurf) — siehe dort.
const SAAT_WURF_DAUER_MS = 420;
const SAAT_WURF_MAX = 16;
// Cartoon-Sprechblase beim Verkaufen (spawnVerkaufsBlase) — siehe dort. Länger
// als das normale Feedback (1100ms): sie zeigt den GANZEN Verkaufserlös, nicht
// eine einzelne Ernte, darf also einen Moment länger stehen bleiben.
const VERKAUF_BLASE_DAUER_MS = 1900;
const VERKAUF_BLASE_MAX = 6;

/** Klassischer Überschwing-Ease — für den Pop-Auftritt der Verkaufs-Blase. */
function easeOutBack(x) {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

const DEFAULT_RENDER_PROFILE = {
    level: "high",
    particleScale: 1,
    simplifyPlantUi: false,
};
const MERGED_TILE_STRIDE = 2; // permanent 2x2 tile merge
/** Weltkarte: Kantenlänge eines vorgemalten Stücks in Kacheln, und wie viele Stücke
 * höchstens im Speicher bleiben (je ~1 MB). */
const WELT_STUECK = 8;
const WELT_STUECK_MAX = 64;
/** Weit herausgezoomt (3D-Ansicht): eine Farbe je Bodenart statt vorgemalter Stücke. */
const WELT_FERNFARBE = ["#4a7f37", "#1f3a1c", "#3f7ea3", "#b9a77f", "#9b6f43", null, "#3d6b2e"];
/** Pixel-Look für Wasser und Rundweg: so viele Weltpixel ergeben einen sichtbaren Pixel. */
const WELT_PIXEL = 4;
const PIXEL_WASSER = {
    tief: [47, 106, 143], mitte: [63, 134, 173], flach: [92, 163, 196], welle: [184, 226, 240],
    ufer: [166, 140, 87], uferDunkel: [122, 101, 57], kiesKante: [111, 100, 80],
};
const PIXEL_SEEROSE = {
    blatt: "#3f8f3a", licht: "#5fb04f", rand: "#2c6a2a", bluete: "#f0a3c8", mitte: "#fde68a",
    fisch: "rgba(20, 44, 62, 0.42)",
};
/** Pixel Überlappung je Stückrand gegen Haarlinien beim Zoomen. */
const WELT_RAND = 2;
const WELT_FARBEN = {
    waldBoden: "#1f3a1c",
    wiese: "#4f8a3a",
    // Wiese etwas dunkler und kühler als der Rasen der Grundstücke — so liest
    // sich jedes Grundstück als gepflegte Fläche in der Landschaft.
    wieseTon: "rgba(24, 58, 30, 0.22)",
    kies: "#b9a77f",
    kiesKante: "rgba(40, 52, 24, 0.22)",
    wasser: "#4a8db3",
    wasserTief: "#33698c",
    welle: "rgba(200, 232, 244, 0.38)",
    ufer: "#8f7d50",
    steg: "#9b6f43",
    stegFuge: "rgba(60, 36, 16, 0.55)",
    baumSchatten: "rgba(10, 28, 10, 0.32)",
};
/** Stände auf dem Dorfplatz für die 3D-Ansicht — dieselben Ersatzfarben wie drawHubAreas. */
// Pfeile neben der Figur (_drawWegweiser): Farbe je Stand, ab welcher Entfernung (Weltpixel)
const WEGWEISER_ARTEN = [
    { key: "questBoard", farbe: "#ffe066" },
    { key: "haendler", farbe: "#7ab8ff" },
    { key: "erntefest", farbe: "#ff9a4a" },
];
const WEGWEISER_AB = 520;

const HUB_STAND_ARTEN = [
    { key: "seedShop", farbe: "#2563eb", symbol: "🌱", name: "Samen" },
    { key: "toolShop", farbe: "#9333ea", symbol: "🛠️", name: "Tools" },
    { key: "eggShop", farbe: "#0d9488", symbol: "🥚", name: "Eier" },
    { key: "decoShop", farbe: "#db2777", symbol: "🪴", name: "Deko" },
    { key: "market", farbe: "#ea580c", symbol: "💰", name: "Verkauf" },
    { key: "petMarket", farbe: "#b45309", symbol: "🐾", name: "Tier-Verkauf" },
    { key: "questBoard", farbe: "#92400e", symbol: "📜", name: "Missionen" },
    { key: "goldShop", farbe: "#ca8a04", symbol: "🪙", name: "Gold-Shop" },
    { key: "haendler", farbe: "#1d4ed8", symbol: "📦", name: "Händler" },
    { key: "erntefest", farbe: "#c2410c", symbol: "🎃", name: "Erntefest" },
];
const HUB_STAND_NACH_KEY = Object.fromEntries(HUB_STAND_ARTEN.map((a) => [a.key, a]));
const WELT_BLUMEN = [
    "/garden-assets/deco/nature/blumen_wiese.png",
    "/garden-assets/deco/nature/blumen_wiese2.png",
    "/garden-assets/deco/nature/blumen_wiese3.png",
    "/garden-assets/deco/nature/blumen_wiese4.png",
];

/**
 * Deko, die nachts leuchtet — Schlüssel ist die `decoId` der Platzierung.
 *
 * Die Werte stehen im Katalog (ui/deko.js) und nicht mehr hier: welche Lampe wie
 * weit und wie hoch leuchtet, gehört zum Stück, nicht zum Zeichner. Wer eine neue
 * Leuchte einträgt, gibt ihr dort ein `licht` — hier ist danach nichts zu tun.
 */
const DEKO_LICHT = Object.fromEntries(
    DEKO_KATALOG.filter((d) => d.licht).map((d) => [d.id, d.licht]),
);
/**
 * Sorten, die ihre Kachel randlos ausfüllen sollen (siehe `voll` im Katalog) —
 * normale Deko steht bewusst mit 10 % Rand in ihrer Kachel, aber ein modulares
 * Zaunfeld muss bis an beide Kanten reichen, sonst "knüpft" es nicht an sein
 * Nachbarfeld an (siehe _collectDeco).
 */
const DEKO_VOLL = new Set(DEKO_KATALOG.filter((d) => d.voll).map((d) => d.id));
/**
 * Sorten, die den Spieler wie eine Pflanze verdecken dürfen (siehe `sichtschutz`
 * im Katalog) — die Ausnahme von der Ausnahme in compareByBaseY. Ein Zaun sieht
 * dahinter besser aus als davor; normale Möblierung (Bank, Statue …) nicht.
 */
const DEKO_SICHTSCHUTZ = new Set(DEKO_KATALOG.filter((d) => d.sichtschutz).map((d) => d.id));
/**
 * Obergrenze je Bild — ein Garten voller Laternen soll die Bildrate nicht drücken.
 * Nur die dem Spieler NÄCHSTEN Lichter leuchten tatsächlich (siehe
 * _sichtbareLichter unten); alles darüber bleibt platziert, aber dunkel.
 *
 * Exportiert, damit die Einrichten-Leiste (GameContainer.jsx) denselben Wert
 * anzeigen kann ("12/24 Lichter") statt eine zweite Zahl zu pflegen, die
 * irgendwann von dieser hier abweicht.
 */
export const LICHT_MAX = 24;
const MAX_VISIBLE_FRUITS = 6;
const PLANT_CACHE_MAX = 400;

// Farben für die prozeduralen Stützgerüste (Spalier, Stamm, Ranken …).
const SUPPORT_COLORS = {
    wood:      "#6b4726",
    woodLight: "#8a5f36",
    twine:     "#a8916b",
    stem:      "#3f7a35",
    stemDark:  "#2c5726",
    soil:      "#4a2c14",
    soilLight: "#633d1d",
};
const SHADOW_COLOR = "rgba(12, 20, 10, 0.30)";

function lerpSize(a, b, t) {
    return a + (b - a) * t;
}
/**
 * Sortierkriterium der Tiefenliste: kleinerer Fußpunkt = weiter hinten = zuerst
 * gezeichnet.
 *
 * Ausnahme: Spieler vs. Deko. Bei Pflanzen ist es gewollt, dass eine hohe Staude
 * den Spieler verdeckt (siehe drawTerritories) — bei den meisten Deko-Stücken
 * (Bank, Statue …) nicht: das ist flache Möblierung, kein Sichtschutz, und ein
 * halb hinter einer Gartenbank verschwindender Spieler sieht nach einem Fehler
 * aus. Der Spieler gewinnt deshalb hier gegen Deko, unabhängig vom Fußpunkt —
 * AUSSER bei Sorten mit `sichtschutz` im Katalog (Zäune): dahinter zu
 * verschwinden sieht bei denen gerade richtig aus, wie bei einer Pflanze. Wer
 * dadurch vor einem eigentlich weiter hinten stehenden (nicht-Sichtschutz-)Stück
 * landet, wird stattdessen halbtransparent gezeichnet — siehe _markSpielerGeist,
 * die VOR diesem Sortieren laufen muss, weil sie die rohen Fußpunkte braucht,
 * die hier überstimmt werden.
 */
function compareByBaseY(a, b) {
    const aSpieler = a.kind === "player" || a.kind === "remote";
    const bSpieler = b.kind === "player" || b.kind === "remote";
    if (aSpieler && b.kind === "deco" && !DEKO_SICHTSCHUTZ.has(b.ref?.decoId)) return 1;
    if (bSpieler && a.kind === "deco" && !DEKO_SICHTSCHUTZ.has(a.ref?.decoId)) return -1;
    return a.baseY - b.baseY;
}
/** Stabiler 0..1-Hash für Phasenversatz (Wind, Tier-Federung) — gleiche Pflanze wackelt immer gleich. */
function hashUnit(seed) {
    const s = String(seed);
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return (h >>> 0) / 4294967295;
}
/** Pflanzen-Norm 0..1 (beim Setzen) entspricht später Größe 1..50 – skaliert sichtbares Wachstum. */
function visualScaleFromPlantNorm(norm) {
    if (norm == null || !Number.isFinite(norm)) return 0.65;
    const t = Math.max(0, Math.min(1, norm));
    return lerpSize(0.3, 1.12, t);
}
/** Früchte-Größe 1..50 sichtbar differenzieren. */
function visualScaleFromFruitSize(size1to50) {
    const s = Math.max(1, Math.min(50, Number(size1to50) || 1));
    return lerpSize(0.32, 1.02, (s - 1) / 49);
}

/**
 * Dasselbe für die HAND — mit deutlich mehr Spanne.
 *
 * Auf dem Acker muss eine Frucht in ihre Kachel passen, in der Hand nicht: dort ist
 * die Größe das Erzählenswerte. Eine 50er füllt jetzt fast den ganzen Charakter,
 * eine 1er ist ein Krümel. Bewusst eine eigene Kurve, damit das Feld unverändert
 * bleibt.
 */
function handScaleFromFruitSize(size1to50) {
    const s = Math.max(1, Math.min(50, Number(size1to50) || 1));
    return lerpSize(0.5, 1.9, (s - 1) / 49);
}

/** Gleiche Spreizung für Pflanzen, die nur `norm` mitbringen (z. B. im Topf). */
function handScaleFromPlantNorm(norm) {
    if (norm == null || !Number.isFinite(norm)) return 0.9;
    return lerpSize(0.5, 1.9, Math.max(0, Math.min(1, norm)));
}

/**
 * Eine Zeichenfläche wirklich freigeben. Das blosse Fallenlassen der Referenz
 * reicht nicht zuverlässig — erst Breite und Höhe auf 0 geben den Bildspeicher
 * sofort zurück.
 */
function freigeben(canvas) {
    if (!canvas) return;
    canvas.width = 0;
    canvas.height = 0;
}

export default class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.frame = 0;
        this._weltCache = new Map(); // "sx_sy" -> { canvas, fertig }, siehe _weltStueck
        this._imageCache = new Map();
        this._plantCache = new Map();
        this._atlasImage = null;
        this._atlasFrames = new Map();
        this._atlasLoaded = false;
        this._atlasLoadStarted = false;
        this._tileVariantCache = new Map();
        this._slotStaticCache = new Map();
        // Bodenspuren der Jahreszeit je Grundstück (engine/saisonLook.js). Einmal je
        // Saison gemalt statt in jedem Bild — es sind einige hundert Blätter.
        this._saisonBodenCache = new Map();
        this._saison = null;
        this._bodenLayerCache = new Map();
        /**
         * Deko-Zuordnung slotIndex → Array, EINMAL pro Bild neu befüllt (siehe
         * _gruppiereDekoNachSlot). Vorher durchsuchten _getBodenLayer UND _collectDeco
         * je Grundstück UNABHÄNGIG voneinander die komplette Welt-Deko-Liste nach ihrem
         * Slot — bei einer belebten Welt mit mehreren gut dekorierten Grundstücken (z. B.
         * 8 × 100+ Stück) kostete allein das Filtern mehr als das eigentliche Zeichnen.
         * Jetzt läuft EIN Durchlauf über die Liste je Bild, danach nur noch Map-Zugriffe.
         */
        this._decoBySlot = new Map();
        this._renderProfile = DEFAULT_RENDER_PROFILE;
        this._frameNow = Date.now();
        // Tiefensortierte Zeichenliste pro Grundstück. Die Einträge stammen aus einem
        // Pool, damit bei 60 FPS keine paar hundert Wegwerf-Objekte pro Frame anfallen
        // (genau die GC-Sammelläufe, die vorher als Mikro-Ruckler sichtbar waren).
        this._renderBucket = [];
        this._renderPool = [];
        /** Leuchtende Deko dieses Bildes — wird je Bild neu gefüllt (siehe draw). */
        this._lichter = [];
        this._poolUsed = 0;
        // Stützgerüste hängen nur an (Archetyp, Höhenstufe), nicht an der einzelnen
        // Pflanze — deshalb reichen ein paar Dutzend geteilte Canvases für den ganzen Acker.
        this._supportCache = new Map();
        this._plantGeoCache = new Map();
        this._petFrameCache = new Map();
        // Wiederverwendete Hülle, damit der Render-Aufruf pro Frame kein neues Objekt erzeugt
        this._playerPayload = {
            selectedTool: null, heldItem: null, localPlayerName: "", playerAppearance: null, playerBadge: null, playerNameplate: null,
        };
        this._remotePlayers = null;
        this._drawnRemotes = new Set();
        /** Laufende Splatter-Wolken: { x, y, start, tropfen[] } — siehe spawnSplatter. */
        this._splatter = [];
        /** Laufende Rückmeldungen: { x, y, text, icon, color, start } — siehe spawnFeedback. */
        this._feedback = [];
        /** Laufende Verkaufs-Sprechblasen: { x, y, text, start } — siehe spawnVerkaufsBlase. */
        this._verkaufsBlasen = [];
        /**
         * v2 (Punkt 13, "Animationen"): Werkzeug-Schwung des LOKALEN Spielers — nur
         * EIN aktiver Schwung gleichzeitig, kein Array wie bei Splatter/Feedback.
         * Reicht, weil nur der eigene Spieler sein eigenes ausgewähltes Werkzeug
         * zeichnet (siehe drawPlayer: `selectedTool` kommt nur beim lokalen Aufruf
         * mit, bei Fremden ist es immer null) — es kann also nie zwei gleichzeitig
         * geben, die dasselbe Feld brauchen.
         */
        this._toolSchwung = null;
        /** Fliegende Ernte-Symbole nach dem Einsammeln — siehe spawnItemFlug. */
        this._itemFlug = [];
        /** Fallende Saat-Tütchen beim Pflanzen — siehe spawnSaatWurf. */
        this._saatWurf = [];
        // Reusable scratch canvas for isolated tinted blits (multi-use fruits, held items).
        // We need an offscreen surface so source-atop maskings only affect the item's pixels,
        // not whatever background was already drawn underneath on the main canvas.
        this._tintScratch = document.createElement("canvas");
        this._tintScratch.width = 128;
        this._tintScratch.height = 128;
        this._tintScratchCtx = this._tintScratch.getContext("2d");
        // Fläche für den Nachtschleier — wird erst beim ersten Einsatz auf
        // Leinwandgröße gebracht, damit sie tagsüber keinen Speicher belegt.
        this._nachtLayer = null;
        this._nachtLayerCtx = null;
        this._loadAtlas();
    }

    draw(state, player) {
        this._frameNow = Date.now();
        this._stehend3d = false;
        const { ctx, canvas } = this;
        const {
            layout,
            areas,
            fremdeGebaeude = [],
            zoom = 1,
            selectedTool = null,
            petPlacements = [],
            decoPlacements = [],
            heldItem = null,
            weather = { type: "sun" },
            renderProfile = DEFAULT_RENDER_PROFILE,
            localPlayerName = "",
            playerAppearance = {},
            playerBadge = null,
            playerNameplate = null,
            remotePlayers = null,
            // Tageszeit und Party kommen fertig gerechnet aus dem GameContainer
            // (engine/Tageszeit.js). Der Renderer entscheidet nichts davon selbst —
            // sonst liefe seine Uhr gegen die des Servers.
            nacht = 0,
            party = 0,
            // Jahreszeit-Id aus engine/Tageszeit.js — ebenfalls aus der Uhr.
            saison = null,
        } = state;
        this._setzeSaison(saison);
        this._remotePlayers = remotePlayers;
        // Sterne aus „Neue Saat" (ui/prestige.js) — Fremde tragen sie am Spielerobjekt.
        this._eigeneSterne = Number(state.eigeneSterne) || 0;
        this._readyEggs = state.readyEggsCount || 0;
        // Eigener Hut und Tierhut (Gold-Shop, engine/huete.js)
        this._eigeneFigur = player;
        this._eigenerHut = state.playerHut || null;
        this._standMarken = state.standMarken || null;
        // Tür eines begehbaren Gebäudes, die gerade auf- oder zugeht (engine/hausTuer.js)
        this._tuer = state.tuer || null;
        this._figurAussehen = state.playerAppearance || null;
        this._tierhutJeSlot = state.tierhutJeSlot || null;
        // Auf welchem Grundstück das Editor-Raster liegt (slot.id, nicht der Index)
        // — null heisst: Editor aus.
        this._editorSlotId = Number.isInteger(state.editorSlotId) ? state.editorSlotId : null;
        this._zoom = zoom;
        this._weather = weather;
        this._renderProfile = renderProfile || DEFAULT_RENDER_PROFILE;
        this.frame++;

        // Leuchtende Deko wird beim Einsortieren eingesammelt (siehe _collectDeco) und
        // erst ganz zum Schluss über dem Dunkelheits-Schleier ausgewertet.
        this._lichter.length = 0;

        // Background
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Camera follows player
        ctx.save();
        ctx.translate(Math.round(canvas.width / 2), Math.round(canvas.height / 2));
        ctx.scale(zoom, zoom);
        ctx.translate(Math.round(-player.x), Math.round(-player.y));

        // Weltkarte: Wiese, Platz, Teiche, Wald (in Stücken vorgemalt)
        this._drawGround(layout, player);
        this._maleFische(layout, () => true);
        // Wetter auf dem Wasser, springende Fische, Teichling (engine/teichLeben.js)
        const karte = this._karteDraufsicht(player, zoom);
        this._party = party;
        zeichneTeichLeben(ctx, layout, karte, this._teichLage(weather, nacht));
        this._drawWeatherGround(layout, player, weather);
        this._drawWegLaternen(layout, player, nacht);

        // Der Spieler wird in die Tiefensortierung des Grundstücks eingereiht, auf dem
        // er steht — damit läuft er hinter hohen Pflanzen vorbei statt immer davor.
        this._playerPayload.selectedTool = selectedTool;
        this._playerPayload.heldItem = heldItem;
        this._playerPayload.localPlayerName = localPlayerName;
        this._playerPayload.playerAppearance = playerAppearance;
        this._playerPayload.playerBadge = playerBadge;
        this._playerPayload.playerNameplate = playerNameplate;

        // Der Schuppen steht AUF einem Grundstück und wird dort in die Tiefenliste
        // einsortiert (siehe _collectPlotAreas). Alles andere steht am Kiesweg und
        // wird wie gehabt danach gezeichnet — sonst schnitte die Rasenfläche des
        // Grundstücks die Dächer der Marktwagen ab.
        // Die Schuppen der anderen kommen mit in die Tiefenliste: _collectPlotAreas
        // sortiert jeden Eintrag über seine Koordinaten dem richtigen Grundstück zu,
        // also landen sie automatisch beim jeweiligen Nachbarn.
        this._plotAreas = [areas.shed, ...fremdeGebaeude]
            .filter((a) => a && a.aktiv !== false);
        // Referenz auf den EIGENEN Schuppen, getrennt von den fremden mit
        // gleicher Bauart ("shed") — sonst zeigte "Ei fertig" (siehe unten bei
        // "area"-Einträgen) über JEDEM Schuppen auf dem Bildschirm, nicht nur
        // dem eigenen.
        this._ownShed = areas.shed || null;
        // Editor (05.11.): `player` ist dann nur die Kamera, keine Figur zeichnen
        // … oder die Figur geht gerade durch eine Tür (dann malt sie _maleTuer im Rahmen)
        const ohneSpieler = Boolean(state.ohneSpieler || state.spielerVersteckt);
        const playerDrawn = this.drawTerritories(
            layout, player, petPlacements, decoPlacements, ohneSpieler ? null : this._playerPayload,
        );
        this.drawHubAreas(areas, state.readyEggsCount);
        // Wer auf dem Kiesweg oder zwischen den Grundstücken steht, wurde oben nicht
        // einsortiert und gehört obenauf.
        if (remotePlayers) {
            for (const remote of remotePlayers) {
                if (this._drawnRemotes.has(remote)) continue;
                this.drawPlayer(remote, null, remote.held || null, remote.name, remote.appearance || {}, remote.badge, "remote", remote.nameplate);
            }
        }
        if (!playerDrawn && !ohneSpieler) {
            this.drawPlayer(player, selectedTool, heldItem, localPlayerName, playerAppearance, playerBadge, "local", playerNameplate);
        }

        // Käfer und Unkraut sitzen über den Pflanzen — man soll sie sehen und treffen.
        this._drawStoerer(state.stoerer, state.stoererSlot);
        this._drawSternenspur();

        // Ganz zuletzt in der Weltansicht: der Splatter liegt über allem, was an
        // seiner Stelle steht — sonst verschwände er hinter der nächsten Pflanze.
        this._drawSplatter();
        this._drawItemFlug();
        this._drawSaatWurf();
        this._drawFeedback();
        this._drawFunken();
        this._drawVerkaufsBlasen();
        if (state.dekoVorschau) this._drawDekoVorschau(state.dekoVorschau);
        // Angel, Schnur und Schwimmer im Teich (ui/fenster/AngelFenster.jsx)
        if (state.angeln) zeichneAngelSzene(ctx, karte, state.angeln, player, this._frameNow);

        // Pfeil mit Namen über dem Ziel, das E gerade öffnen würde — obenauf, damit
        // ihn kein Dach und keine Figur verdeckt. Feste Bildschirmgröße, egal wie gezoomt.
        const spitze = this._zielSpitze(state.aktivesZiel);
        // Während einer Verkaufsblase kein Pfeil — er säße genau auf dem verdienten Gold
        if (spitze && this._verkaufsBlasen.length === 0) this._maleZielPfeil(state.aktivesZiel, spitze.x, spitze.y, 4 / (ctx.getTransform().a || 1));
        if (state.wegweiser) {
            this._drawWegweiser(areas, player, player.x, player.y - 20, 3 / (ctx.getTransform().a || 1),
                (a) => Math.atan2(a.y - player.y, a.x - player.x));
        }

        ctx.restore();
        // Jahreszeit: Farbton und Partikel UNTER dem Nachtschleier — nachts wird
        // auch der Herbst dunkel, statt über der Dunkelheit zu leuchten.
        if (saison) {
            if (!this._renderProfile?.simplifyPlantUi) zeichneSaisonTon(ctx, canvas, saison);
            const scale = Math.max(0.15, Math.min(1, Number(this._renderProfile?.particleScale) || 1));
            zeichneSaisonLuft(ctx, canvas, saison, this.frame, player, scale, weather?.type);
        }
        // 1. ANPASSUNG: Player übergeben für Map-relativen Regen
        this._drawWeatherOverlay(weather, player, nacht);
        this._flushStandMarken();
        // Glühwürmchen sind selbst Licht — nach dem Schleier, wie die Laser.
        if (saison) {
            const scale = Math.max(0.15, Math.min(1, Number(this._renderProfile?.particleScale) || 1));
            zeichneGluehwuermchen(ctx, canvas, saison, this.frame, player, nacht, scale);
        }
        // Discolaser NACH dem Schleier: sie sind selbst Licht und dürfen von keiner
        // Laterne ausgestanzt werden — dieselbe Begründung wie bei den Blitzen.
        if (party > 0.05) {
            // Discokugel über dem Dorfteich: steht in der Welt, also noch einmal die Kamera
            ctx.save();
            ctx.translate(Math.round(canvas.width / 2), Math.round(canvas.height / 2));
            ctx.scale(zoom, zoom);
            ctx.translate(Math.round(-player.x), Math.round(-player.y));
            zeichnePartyWelt(ctx, layout, karte, this._frameNow, party);
            ctx.restore();
        }
        this._drawParty(party);
    }

    /** Draufsicht: die Kamera steht schon — nur prüfen, ob der Punkt im Bild liegt. */
    _karteDraufsicht(player, zoom) {
        const k = this._karte2d || (this._karte2d = { x: 0, y: 0, halbW: 0, halbH: 0, flach: null, aufrecht: null });
        if (!k.flach) {
            k.flach = (x, y) => Math.abs(x - k.x) < k.halbW && Math.abs(y - k.y) < k.halbH;
            k.aufrecht = k.flach;
        }
        k.x = player.x; k.y = player.y;
        k.halbW = this.canvas.width / 2 / (zoom || 1) + 320;
        k.halbH = this.canvas.height / 2 / (zoom || 1) + 320;
        return k;
    }

    /** Was engine/teichLeben.js über Wetter und Tageszeit wissen muss. */
    _teichLage(weather, nacht) {
        const l = this._teichLageBuf || (this._teichLageBuf = {});
        l.now = this._frameNow;
        l.wetter = weather?.type || "sun";
        l.intensitaet = l.wetter === "sun" ? 0 : (Number.isFinite(Number(weather?.intensity)) ? Number(weather.intensity) : 1);
        l.nacht = nacht;
        l.einfach = Boolean(this._renderProfile?.simplifyPlantUi);
        return l;
    }

    /**
     * 3D-Ansicht (engine/welt3d.js): alles, was STEHT, auf die durchsichtige
     * 2D-Leinwand über dem 3D-Boden — Pflanzen, Deko, Tiere, Gebäude, Stände,
     * Schilder, Bäume, Figuren, dazu die Effekte.
     *
     * Jedes Stück wird mit genau dem Code gezeichnet wie in der Draufsicht. Nur die
     * Kamera ist eine andere: sein Fußpunkt wird durch die 3D-Kamera auf den
     * Bildschirm gerechnet (welt3d.projiziere), und ringsum wird es so groß
     * gezeichnet, wie eine Weltkachel an dieser Stelle auf dem Schirm ist. Weiter
     * hinten ist also alles kleiner, und sortiert wird von hinten nach vorn.
     */
    draw3dStehend(state, player, welt3d) {
        this._frameNow = Date.now();
        this._stehend3d = true;
        const { ctx, canvas } = this;
        const {
            layout, areas, fremdeGebaeude = [], selectedTool = null,
            petPlacements = [], decoPlacements = [], heldItem = null,
            weather = { type: "sun" }, renderProfile = DEFAULT_RENDER_PROFILE,
            localPlayerName = "", playerAppearance = {}, playerBadge = null, playerNameplate = null,
            remotePlayers = null, nacht = 0, party = 0, saison = null,
        } = state;
        this._setzeSaison(saison);
        this._remotePlayers = remotePlayers;
        this._eigeneSterne = Number(state.eigeneSterne) || 0;
        this._readyEggs = state.readyEggsCount || 0;
        // Eigener Hut und Tierhut (Gold-Shop, engine/huete.js)
        this._eigeneFigur = player;
        this._eigenerHut = state.playerHut || null;
        this._standMarken = state.standMarken || null;
        // Tür eines begehbaren Gebäudes, die gerade auf- oder zugeht (engine/hausTuer.js)
        this._tuer = state.tuer || null;
        this._figurAussehen = state.playerAppearance || null;
        this._tierhutJeSlot = state.tierhutJeSlot || null;
        this._editorSlotId = null;
        this._zoom = state.zoom || 1;
        this._weather = weather;
        this._renderProfile = renderProfile || DEFAULT_RENDER_PROFILE;
        this.frame++;
        this._lichter.length = 0;
        this._party = party;

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (!layout?.slots) return;

        // Sichtbarer Boden in Weltpixeln (Schnitt der Bildschirmecken mit dem Boden)
        const sicht = welt3d.sichtGrenzen(canvas.width, canvas.height);
        if (!sicht) return;
        const { x0, y0, x1, y1 } = sicht;
        const { territoryWidth, territoryHeight, dirtOffsetX, baseDirtHeight, baseDirtWidth } = MAP_CONFIG;
        const T = TILE_SIZE;

        this._plotAreas = [areas?.shed, ...fremdeGebaeude].filter((a) => a && a.aktiv !== false);
        this._ownShed = areas?.shed || null;

        const bucket = this._renderBucket;
        bucket.length = 0;
        this._poolUsed = 0;
        const dekoBySlot = this._gruppiereDekoNachSlot(decoPlacements);
        for (const slot of layout.slots) {
            const drawY = slot.isTopRow ? slot.anchorY - territoryHeight : slot.anchorY;
            const schild = getSignLayout(slot);
            if (slot.x + territoryWidth < x0 || slot.x > x1 || drawY + territoryHeight + T < y0 || drawY - T > y1) continue;
            this._collectPlants(bucket, slot, drawY, x0, y0, x1, y1, dirtOffsetX, baseDirtHeight, baseDirtWidth);
            this._collectDeco(bucket, slot, drawY, dekoBySlot.get(slot.id - 1) || LEERE_DEKO_LISTE, x0, y0, x1, y1);
            this._collectPets(bucket, slot, petPlacements, drawY);
            const e = this._poolEntry();
            e.kind = "schild"; e.ref = slot; e.x = schild.centerX; e.y = schild.centerY;
            e.baseY = schild.centerY + schild.h;
            bucket.push(e);
        }
        for (const area of this._plotAreas) {
            const e = this._poolEntry();
            e.kind = "area"; e.ref = area; e.x = area.x;
            e.baseY = Number.isFinite(area.fussY) ? area.fussY : area.y + 35;
            bucket.push(e);
        }
        // Stände auf dem Dorfplatz: Bild steht mittig auf area.y, Fuß also darunter
        for (const art of HUB_STAND_ARTEN) {
            const area = areas?.[art.key];
            if (!area || area.aktiv === false) continue;
            const e = this._poolEntry();
            e.kind = "hub"; e.ref = area; e.x = area.x; e.size = 0;
            e.baseY = area.y + (art.key === "questBoard" ? T : 105);
            e.cacheKey = art.key;
            bucket.push(e);
        }
        const ich = this._poolEntry();
        ich.kind = "player"; ich.x = player.x; ich.baseY = player.y + 20; ich.ghost = false;
        bucket.push(ich);
        if (remotePlayers) {
            for (const remote of remotePlayers) {
                if (remote.x < x0 - T || remote.x > x1 + T || remote.y < y0 - T || remote.y > y1 + T) continue;
                const e = this._poolEntry();
                e.kind = "remote"; e.ref = remote; e.x = remote.x; e.baseY = remote.y + 20; e.ghost = false;
                bucket.push(e);
            }
        }
        // Bäume und Büsche: eigene Liste (eine Hülle je Baum wäre zu viel Pool)
        const baeume = this._baumListe || (this._baumListe = []);
        let nBaeume = 0;
        const stehendDazu = (bm) => {
            const b = baeume[nBaeume] || (baeume[nBaeume] = { kind: "baum", img: null, x: 0, baseY: 0, w: 0, h: 0 });
            b.img = bm.img; b.x = bm.x; b.baseY = bm.y; b.w = bm.w; b.h = bm.h; b.flach = Boolean(bm.flach);
            bucket.push(b);
            nBaeume++;
        };
        this._baeumeIm(layout, Math.floor(x0 / T) - 1, Math.floor(y0 / T) - 1, Math.ceil(x1 / T) + 1, Math.ceil(y1 / T) + 3, true, stehendDazu);
        // 06.11.: Wildblumen und Weglaternen stehen in 3D aufrecht (vorher flach im Boden bzw. gar nicht)
        this._blumenIm(layout, Math.floor(x0 / T) - 1, Math.floor(y0 / T) - 1, Math.ceil(x1 / T) + 1, Math.ceil(y1 / T) + 2, (bl) => stehendDazu({ ...bl, flach: true }));
        {
            const laterne = laternenBild((Number(nacht) || 0) > 0.12);
            if (laterne) {
                for (const l of layout?.laternen || []) {
                    if (l.x < x0 - T || l.x > x1 + T || l.y < y0 - T || l.y > y1 + 2 * T) continue;
                    // in 3D eine Spur größer, sonst wirkt sie neben den Ständen wie ein Streichholz
                    stehendDazu({ img: laterne, x: l.x, y: l.y, w: LATERNE_W * 1.4, h: LATERNE_H * 1.4, flach: true });
                }
            }
        }
        bucket.sort(compareByBaseY);

        const p = this._proj || (this._proj = { sx: 0, sy: 0, s: 1, nebel: 0 });
        // Fische flach auf dem Wasser (wie der Ring gestaucht, siehe unten)
        const q3 = this._proj3 || (this._proj3 = { sx: 0, sy: 0, s: 1, nebel: 0 });
        const flach3d = (x, y) => {
            if (!welt3d.projiziere(x, y, p, canvas.width, canvas.height)) return false;
            if (p.sx < -50 || p.sx > canvas.width + 50 || p.sy < -50 || p.sy > canvas.height + 50) return false;
            welt3d.projiziere(x, y + TILE_SIZE, q3, canvas.width, canvas.height);
            const k = Math.max(0.2, Math.min(1, (q3.sy - p.sy) / (p.s * TILE_SIZE)));
            ctx.setTransform(p.s, 0, 0, p.s * k, p.sx - p.s * x, p.sy - p.s * k * y);
            return true;
        };
        this._maleFische(layout, flach3d);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        const setze = (fx, fy) => {
            if (!welt3d.projiziere(fx, fy, p, canvas.width, canvas.height)) return false;
            if (p.sx < -400 || p.sx > canvas.width + 400 || p.sy < -100 || p.sy > canvas.height + 600) return false;
            ctx.setTransform(p.s, 0, 0, p.s, p.sx - p.s * fx, p.sy - p.s * fy);
            ctx.globalAlpha = 1 - p.nebel;
            return p.nebel < 0.98;
        };
        // Wetter auf dem Wasser, springende Fische, Teichling (engine/teichLeben.js)
        const karte = this._karte3d || (this._karte3d = { flach: null, aufrecht: null });
        karte.flach = flach3d;
        karte.aufrecht = setze;
        zeichneTeichLeben(ctx, layout, karte, this._teichLage(weather, nacht));
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;

        // Wo jede Pflanze auf dem Schirm steht — für Klicks auf die Pflanze selbst
        // (trefferStehend3d). Reihenfolge = Zeichenreihenfolge, hinten zuerst.
        const treffer = this._treffer3d || (this._treffer3d = []);
        let nTreffer = 0;
        // Durchsicht (05.11.): was VOR der Figur steht und sie verdeckt, wird halb
        // durchsichtig — in 3D läuft man hinter Ständen und Bäumen entlang.
        const fuss = player.y + 20;
        const fp = this._projFigur || (this._projFigur = { sx: 0, sy: 0, s: 1, nebel: 0 });
        const figurDa = welt3d.projiziere(player.x, fuss, fp, canvas.width, canvas.height);
        const fl = fp.sx - fp.s * T * 0.45, fr = fp.sx + fp.s * T * 0.45;
        const fo = fp.sy - fp.s * T * 1.35, fu = fp.sy;
        const durchsicht = (e, breiteW, hoeheW) => {
            if (!figurDa || e.baseY <= fuss) return;
            const l = p.sx - (breiteW / 2) * p.s, r = p.sx + (breiteW / 2) * p.s;
            const o = p.sy - hoeheW * p.s;
            if (r < fl || l > fr || p.sy < fo || o > fu) return;
            ctx.globalAlpha = (1 - p.nebel) * 0.45;
        };
        for (let i = 0; i < bucket.length; i++) {
            const e = bucket[i];
            switch (e.kind) {
                case "plant":
                    if (setze(e.cellX + T / 2, e.baseY)) {
                        const hoehe = (getPlantArchetype(e.plant.seedId)?.heightTiles || 1) * T;
                        durchsicht(e, T * 0.9, hoehe);
                        this._drawPlant(e.plant, e.cellX, e.cellY, e.slotId, e.cacheKey);
                        const t = treffer[nTreffer] || (treffer[nTreffer] = { sx: 0, sy: 0, halb: 0, hoch: 0, wx: 0, wy: 0 });
                        t.sx = p.sx; t.sy = p.sy; t.halb = p.s * T * 0.45; t.hoch = p.s * (hoehe + 8);
                        t.wx = e.cellX + T / 2; t.wy = e.cellY + T / 2;
                        nTreffer++;
                    }
                    break;
                case "deco":
                    if (setze(e.x, e.baseY)) {
                        durchsicht(e, e.size, e.baseY - (e.y - e.size / 2));
                        this._drawDecoItem(e);
                    }
                    break;
                case "pet":
                    if (setze(e.x, e.baseY)) this._drawPetItem(e);
                    break;
                case "area": {
                    if (!setze(e.x, e.baseY)) break;
                    durchsicht(e, 192, 192);
                    const a = e.ref;
                    const ersatz = AREA_ERSATZ[bauart(a)] || AREA_ERSATZ.incubator;
                    this._drawAreaBuilding(a, ersatz.farbe, ersatz.symbol, a.label || "", a === this._ownShed ? this._readyEggs : 0);
                    break;
                }
                case "hub": {
                    if (!setze(e.x, e.baseY)) break;
                    durchsicht(e, e.cacheKey === "questBoard" ? 128 : 290, e.cacheKey === "questBoard" ? 128 : 235);
                    const art = HUB_STAND_NACH_KEY[e.cacheKey];
                    this._drawAreaBuilding(e.ref, art.farbe, art.symbol, art.name);
                    break;
                }
                case "schild":
                    if (setze(e.x, e.baseY)) this._drawSign(e.ref, e.x, e.y);
                    break;
                case "baum":
                    if (!setze(e.x, e.baseY)) break;
                    if (!e.flach) durchsicht(e, e.w * 0.8, e.h);
                    ctx.fillStyle = WELT_FARBEN.baumSchatten;
                    ctx.beginPath(); ctx.ellipse(e.x, e.baseY - 3, e.w * (e.flach ? 0.3 : 0.42), e.w * (e.flach ? 0.1 : 0.16), 0, 0, Math.PI * 2); ctx.fill();
                    ctx.drawImage(e.img, e.x - e.w / 2, e.baseY - e.h, e.w, e.h);
                    break;
                case "player":
                    if (state.spielerVersteckt) break;
                    if (setze(player.x, player.y + 20)) {
                        this.drawPlayer(player, selectedTool, heldItem, localPlayerName, playerAppearance, playerBadge, "local", playerNameplate);
                    }
                    break;
                case "remote":
                    if (setze(e.ref.x, e.ref.y + 20)) {
                        this.drawPlayer(e.ref, null, e.ref.held || null, e.ref.name, e.ref.appearance || {}, e.ref.badge, "remote", e.ref.nameplate);
                    }
                    break;
                default:
                    break;
            }
        }
        treffer.length = nTreffer;
        // Reife-Marker obenauf, jeder an seiner eigenen Pflanze
        const einzel = this._einzelListe || (this._einzelListe = [null]);
        for (let i = 0; i < bucket.length; i++) {
            const e = bucket[i];
            if (e.kind !== "plant" || !setze(e.cellX + T / 2, e.baseY)) continue;
            einzel[0] = e;
            this._drawReadyMarkers(einzel);
        }
        einzel[0] = null;

        // Effekte (Ernte-Funken, schwebende Zahlen, Käfer …) liegen alle nahe der
        // Figur — sie bekommen deren Maßstab statt eines eigenen je Teilchen.
        this._drawStoerer(state.stoerer, state.stoererSlot, setze);
        if (setze(player.x, player.y + 20)) {
            ctx.globalAlpha = 1;
            this._drawSternenspur();
            this._drawSplatter();
            this._drawItemFlug();
            this._drawSaatWurf();
            this._drawFeedback();
            this._drawFunken();
            this._drawVerkaufsBlasen();
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        if (state.angeln) zeichneAngelSzene(ctx, karte, state.angeln, player, this._frameNow);
        // Pfeil mit Namen über dem Ziel: Fußpunkt projizieren, Bildhöhe im dortigen Maßstab
        // nach oben — die Gebäude stehen in 3D aufrecht auf ihrem Fuß.
        const zielJetzt = state.aktivesZiel;
        const spitze = this._zielSpitze(zielJetzt);
        if (spitze && this._verkaufsBlasen.length === 0) {
            const fussY = zielJetzt._bild?.w > 0 ? zielJetzt._bild.y + zielJetzt._bild.h
                : Number.isFinite(zielJetzt.fussY) ? zielJetzt.fussY : zielJetzt.y;
            if (welt3d.projiziere(spitze.x, fussY, p, canvas.width, canvas.height)) {
                this._maleZielPfeil(zielJetzt, p.sx, p.sy - (fussY - spitze.y) * p.s, 4);
            }
        }
        if (state.wegweiser && welt3d.projiziere(player.x, player.y + 20, p, canvas.width, canvas.height)) {
            const ichX = p.sx;
            const ichY = p.sy - 40 * p.s;
            const q = this._projWeg || (this._projWeg = { sx: 0, sy: 0, s: 1, nebel: 0 });
            this._drawWegweiser(areas, player, ichX, ichY, 3, (a) => (
                // Stand hinter der Kamera: Richtung auf dem Boden statt im Bild
                welt3d.projiziere(a.x, a.y + 105, q, canvas.width, canvas.height)
                    ? Math.atan2(q.sy - ichY, q.sx - ichX)
                    : Math.atan2(a.y - player.y, a.x - player.x)
            ));
        }
        // Nacht: nur das Gezeichnete abdunkeln (source-atop) — der Boden darunter
        // wird schon vom 3D-Licht dunkler.
        // Gleiche Stärke wie das 3D-Licht (welt3d._licht rechnet mit nacht / 0,7):
        // tiefe Nacht lässt etwa ein Viertel der Taghelligkeit übrig.
        const n = Math.max(0, Math.min(1, (Number(nacht) || 0) / 0.7));
        if (n > 0.02) {
            ctx.save();
            ctx.globalCompositeOperation = "source-atop";
            ctx.fillStyle = `rgba(8, 14, 38, ${(n * 0.72).toFixed(3)})`;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.restore();
        }
        // Lichtschein der Weglaternen (06.11.) — nach dem Abdunkeln, sonst ginge er unter
        if ((Number(nacht) || 0) > 0.12 && layout?.laternen?.length) {
            const q = this._projLicht || (this._projLicht = { sx: 0, sy: 0, s: 1, nebel: 0 });
            ctx.save();
            ctx.globalCompositeOperation = "lighter";
            const [lr, lg, lb] = LATERNE_LICHT.farbe;
            for (const l of layout.laternen) {
                if (!welt3d.projiziere(l.x, l.y - LATERNE_LICHT.hoehe * 1.4, q, canvas.width, canvas.height)) continue;
                const rad = LATERNE_LICHT.radius * q.s * 0.9;
                if (q.sx < -rad || q.sx > canvas.width + rad || q.sy < -rad || q.sy > canvas.height + rad) continue;
                const g = ctx.createRadialGradient(q.sx, q.sy, 0, q.sx, q.sy, rad);
                g.addColorStop(0, `rgba(${lr}, ${lg}, ${lb}, ${(0.42 * (1 - q.nebel)).toFixed(3)})`);
                g.addColorStop(1, `rgba(${lr}, ${lg}, ${lb}, 0)`);
                ctx.fillStyle = g;
                ctx.fillRect(q.sx - rad, q.sy - rad, rad * 2, rad * 2);
            }
            ctx.restore();
        }
        if (saison) {
            const scale = Math.max(0.15, Math.min(1, Number(this._renderProfile?.particleScale) || 1));
            zeichneSaisonLuft(ctx, canvas, saison, this.frame, player, scale, weather?.type);
        }
        // Regen/Schnee ohne Nachtschleier (der käme mit der flachen 2D-Kamera)
        this._drawWeatherOverlay(weather, player, 0);
        this._flushStandMarken();
        if (party > 0.05) {
            zeichnePartyWelt(ctx, layout, karte, this._frameNow, party);
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.globalAlpha = 1;
        }
        this._drawParty(party);
    }

    /**
     * Laternen am Wegrand (06.11., Plätze aus MapConfig.setzeWegLaternen). Nur was auf
     * dem Schirm liegt; ab der Dämmerung ist das Glas hell und sie werfen Licht wie
     * leuchtende Deko (this._lichter, über dem Dunkelheits-Schleier ausgewertet).
     */
    _drawWegLaternen(layout, kamera, nacht) {
        const liste = layout?.laternen;
        if (!liste || liste.length === 0) return;
        const an = (Number(nacht) || 0) > 0.12;
        const bild = laternenBild(an);
        if (!bild) return;
        const { ctx, canvas } = this;
        const zoom = this._zoom || 1;
        const halbW = canvas.width / 2 / zoom + LATERNE_W;
        const halbH = canvas.height / 2 / zoom + LATERNE_H;
        const glatt = ctx.imageSmoothingEnabled;
        ctx.imageSmoothingEnabled = false;
        // Der Schein reicht weiter als die Laterne: Licht schon eintragen, wenn nur der
        // Kegel ins Bild ragt — sonst ging er am Bildrand beim Laufen an und aus.
        const r = LATERNE_LICHT.radius;
        for (const l of liste) {
            const dx = Math.abs(l.x - kamera.x);
            const dy = Math.abs(l.y - kamera.y);
            if (an && dx < halbW + r && dy < halbH + r) this._lichter.push({ x: l.x, y: l.y - LATERNE_LICHT.hoehe, licht: LATERNE_LICHT });
            if (dx > halbW || dy > halbH + LATERNE_H) continue;
            ctx.fillStyle = "rgba(0,0,0,0.22)";
            ctx.fillRect(Math.round(l.x - LATERNE_W * 0.4), Math.round(l.y - 2), Math.round(LATERNE_W * 0.8), 4);
            ctx.drawImage(bild, Math.round(l.x - LATERNE_W / 2), Math.round(l.y - LATERNE_H), LATERNE_W, LATERNE_H);
        }
        ctx.imageSmoothingEnabled = glatt;
    }

    /**
     * Wo der Pfeil über einem ansprechbaren Ziel sitzt (Weltpixel): mittig über der
     * Oberkante des gezeichneten Bilds. Stände sind mittig auf area.y gezeichnet,
     * Gebäude auf einem Grundstück stehen auf fussY.
     */
    _zielSpitze(ziel) {
        if (!ziel || !Number.isFinite(ziel.x) || !Number.isFinite(ziel.y)) return null;
        const b = ziel._bild;
        let x = ziel.x;
        let y;
        if (b && b.w > 0) { x = b.x + b.w / 2; y = b.y; }
        else if (ziel.type === "mailbox") { x = ziel.x - 20; y = (Number.isFinite(ziel.fussY) ? ziel.fussY : ziel.y) - 86; }
        else if (Number.isFinite(ziel.fussY)) y = ziel.fussY - 200;
        else if (ziel.type === "questBoard") y = ziel.y - TILE_SIZE;
        else y = ziel.y - 150;
        // Am eigenen Haus über dem „Ei fertig“-Marker, nicht darauf
        if (ziel.type === "shed" && (this._readyEggs || 0) > 0) y -= 34;
        return { x, y };
    }

    /**
     * Pixelpfeil mit Namensschild (06.11., ersetzt den Ring am Boden): derselbe Pfeil
     * wie im Haus (ui/HausInnen.jsx). `u` = Größe eines Bildpunkts in den aktuellen
     * Koordinaten, (sx, sy) = Spitze des Pfeils.
     */
    _maleZielPfeil(ziel, sx, sy, u) {
        const { ctx } = this;
        // Hohe Stände ragen oft bis unter die Knopfleiste oben — dann rückt der Pfeil
        // herunter aufs Bild, statt dahinter zu verschwinden: Schild-Oberkante bei ~120 px.
        const t = ctx.getTransform();
        const minY = (195 - t.f) / (t.d || 1);
        if (sy < minY) sy = minY;
        const wipp = (Math.sin(this.frame * 0.12) > 0 ? 1 : 0) * u;
        const ax = Math.round(sx);
        const ay = Math.round(sy - 6 * u - wipp);
        ctx.save();
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#3b2516";
        ctx.fillRect(ax - 4 * u, ay - u, 8 * u, u);
        for (let i = 0; i < 4; i++) {
            ctx.fillStyle = "#3b2516";
            ctx.fillRect(ax - 4 * u + i * u, ay + i * u, (8 - 2 * i) * u, u);
            if (6 - 2 * i > 0) {
                ctx.fillStyle = "#fff3c4";
                ctx.fillRect(ax - 3 * u + i * u, ay + i * u, (6 - 2 * i) * u, u);
            }
        }
        const name = ziel.type === "shed" ? "Haus"
            : ziel.type === "mailbox" && ziel.isOwn ? "Briefkasten"
            : (ziel.label || "");
        if (name) {
            const text = `E · ${name}`;
            ctx.font = `bold ${Math.round(4 * u)}px 'GfZiffern', 'Pixelify Sans', Nunito, sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            const w = Math.ceil((ctx.measureText(text).width + 4 * u) / u) * u;
            const h = 7 * u;
            const bx = Math.round(ax - w / 2);
            const by = Math.round(ay - 3 * u - h);
            ctx.fillStyle = "#3b2516";
            ctx.fillRect(bx - u, by - u, w + 2 * u, h + 2 * u);
            ctx.fillStyle = "#fff3c4";
            ctx.fillRect(bx, by, w, h);
            ctx.fillStyle = "#e8d7a8";
            ctx.fillRect(bx, by + h - u, w, u);
            ctx.fillStyle = "#3b2516";
            ctx.fillText(text, ax, by + h / 2);
        }
        ctx.restore();
    }

    /**
     * 3D-Ansicht: liegt dieser Punkt der 2D-Leinwand (Pixel) auf einer gezeichneten
     * Pflanze? Dann zählt ihr Feld — sonst träfe ein Klick auf die Krone das Feld
     * dahinter, weil der Strahl erst weiter hinten auf den Boden kommt. Vorderste
     * Pflanze gewinnt. Gibt die Weltmitte des Felds zurück oder null.
     */
    trefferStehend3d(px, py) {
        const liste = this._treffer3d;
        if (!liste) return null;
        for (let i = liste.length - 1; i >= 0; i--) {
            const t = liste[i];
            if (px < t.sx - t.halb || px > t.sx + t.halb) continue;
            if (py > t.sy + t.halb * 0.3 || py < t.sy - t.hoch) continue;
            return { worldX: t.wx, worldY: t.wy };
        }
        return null;
    }

    /**
     * Discolaser des Party-Events.
     *
     * Bildschirmfest statt weltfest, und das ist Absicht: die Strahlen kommen von
     * „über der Welt", nicht von einem Punkt auf dem Acker. Weltfeste Kegel müssten
     * an einem Ort hängen — dann sähe die halbe Welt gar nichts von der Party.
     *
     * @param {number} staerke 0 = keine Party, 1 = voll aufgedreht
     */
    _drawParty(staerke) {
        if (!(staerke > 0.01)) return;
        const { ctx, canvas } = this;
        const t = this.frame * 0.02;
        const detail = Math.max(0.3, Math.min(1, Number(this._renderProfile?.particleScale) || 1));
        const strahlen = Math.max(3, Math.round(5 * detail));
        const FARBEN = [
            [255, 64, 120], [64, 200, 255], [180, 80, 255], [80, 255, 160], [255, 200, 60],
        ];
        const cx = canvas.width / 2;
        const cy = -canvas.height * 0.12;
        const laenge = canvas.height * 1.9;

        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        for (let i = 0; i < strahlen; i++) {
            const [r, g, b] = FARBEN[i % FARBEN.length];
            // Jeder Strahl schwingt um die Senkrechte, mit eigener Geschwindigkeit —
            // gleicher Takt sähe aus wie ein Fächer, nicht wie eine Lichtanlage.
            const winkel = Math.sin(t * (0.45 + i * 0.13) + i * 1.7) * 0.95;
            const halbe = 0.05 + 0.022 * Math.sin(t * 1.7 + i);
            const puls = 0.5 + 0.5 * Math.sin(t * 2.4 + i * 0.9);
            const alpha = (0.13 + 0.11 * puls) * staerke;
            const zx = cx + Math.sin(winkel) * laenge;
            const zy = cy + Math.cos(winkel) * laenge;
            const grad = ctx.createLinearGradient(cx, cy, zx, zy);
            grad.addColorStop(0, `rgba(${r},${g},${b},${alpha})`);
            grad.addColorStop(0.6, `rgba(${r},${g},${b},${alpha * 0.45})`);
            grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.sin(winkel - halbe) * laenge, cy + Math.cos(winkel - halbe) * laenge);
            ctx.lineTo(cx + Math.sin(winkel + halbe) * laenge, cy + Math.cos(winkel + halbe) * laenge);
            ctx.closePath();
            ctx.fill();
        }
        // Takt: ein kaum sichtbarer Farbstoß über das ganze Bild, damit die Anlage
        // auch dann zu spüren ist, wenn gerade kein Strahl über den Spieler wandert.
        const takt = Math.pow(0.5 + 0.5 * Math.sin(t * 3.1), 4);
        ctx.fillStyle = `rgba(255, 120, 220, ${0.05 * takt * staerke})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();

        this._drawPartyNebel(staerke, takt);
        zeichneFeuerwerk(ctx, canvas, this._frameNow, staerke, detail);
        this._drawKonfetti(staerke, detail);
    }

    /**
     * Bodennebel der Anlage.
     *
     * Liegt UNTER dem Konfetti und über allem anderen: zwei weiche Bänder am unteren
     * Bildrand, die im Takt atmen. Ohne den Nebel hängen die Strahlen im Nichts — es
     * fehlt das, worin sich Licht überhaupt zeigt.
     */
    _drawPartyNebel(staerke, takt) {
        const { ctx, canvas } = this;
        const t = this.frame * 0.02;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        for (let i = 0; i < 2; i++) {
            const hoehe = canvas.height * (0.30 + 0.08 * Math.sin(t * 0.7 + i * 2.1));
            const y = canvas.height - hoehe;
            const g = ctx.createLinearGradient(0, canvas.height, 0, y);
            const a1 = (0.055 + 0.03 * takt) * staerke;
            g.addColorStop(0, i === 0 ? `rgba(180, 110, 255, ${a1})` : `rgba(90, 200, 255, ${a1 * 0.8})`);
            g.addColorStop(1, "rgba(0,0,0,0)");
            ctx.fillStyle = g;
            // Leicht versetzt, damit die beiden Bänder nicht deckungsgleich liegen.
            const versatz = Math.sin(t * 0.5 + i * 3) * canvas.width * 0.12;
            ctx.fillRect(versatz - canvas.width * 0.2, y, canvas.width * 1.4, hoehe);
        }
        ctx.restore();
    }

    /**
     * Konfetti.
     *
     * Rein rechnerisch statt als Teilchenliste: Position, Drehung und Farbe eines
     * Schnipsels ergeben sich aus seinem Index und der Bildnummer. Damit gibt es
     * nichts zu verwalten, nichts läuft nach dem Ende der Party weiter, und der
     * Speicher bleibt unangetastet — dasselbe Muster wie beim Regen darüber.
     *
     * Die Schnipsel hängen am BILD, nicht an der Welt: sie fallen vor der Kamera,
     * nicht über dem Acker. Weltfest wären sie beim Laufen sofort weg.
     */
    _drawKonfetti(staerke, detail) {
        const { ctx, canvas } = this;
        const anzahl = Math.round(70 * detail * staerke);
        if (anzahl <= 0) return;
        const FARBEN = ["#ff4d7d", "#4dd2ff", "#b46bff", "#5cff9d", "#ffd24d", "#ffffff"];
        const f = this.frame;
        ctx.save();
        ctx.globalAlpha = Math.min(1, staerke);
        for (let i = 0; i < anzahl; i++) {
            // Jeder Schnipsel bekommt aus seinem Index eine eigene Spur und ein eigenes
            // Tempo — sonst fallen alle im Gleichschritt.
            const spur = ((i * 61.7) % 1000) / 1000;
            const tempo = 1.1 + ((i * 37) % 13) * 0.13;
            const breite = 4 + ((i * 17) % 4);
            const hoehe = 7 + ((i * 23) % 6);
            const y = ((f * tempo + i * 53) % (canvas.height + 60)) - 30;
            // Seitliches Pendeln, damit es taumelt statt zu regnen.
            const x = spur * canvas.width + Math.sin(f * 0.03 + i) * 26;
            const dreh = (f * 0.06 + i) % (Math.PI * 2);
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(dreh);
            // Die Höhe schwankt mit der Drehung — das liest sich als Flattern.
            ctx.fillStyle = FARBEN[i % FARBEN.length];
            ctx.fillRect(-breite / 2, -hoehe / 2, breite, hoehe * Math.abs(Math.cos(dreh)));
            ctx.restore();
        }
        ctx.restore();
    }

    /**
     * Boden der Weltkarte außerhalb der Grundstücke: Wiese, Kiesplatz, Teiche mit
     * Ufer, Steg, Wald mit Bäumen, Blumen (Karte aus engine/MapConfig.js).
     *
     * Gemalt wird in Stücken zu WELT_STUECK × WELT_STUECK Kacheln, jedes Stück
     * einmal auf eine eigene Leinwand und danach nur noch als ein Bild kopiert —
     * Bäume, Ufer und Blumen je Bild neu zu zeichnen wäre bei voller Sicht mehrere
     * hundert drawImage-Aufrufe. Ein Stück, bei dem noch ein Bild fehlte, wird neu
     * gemalt, sobald Bilder nachladen (siehe _getImage).
     *
     * Stücke gibt es auch AUSSERHALB der Welt: dort ist alles Wald, damit man am
     * Rand in dichten Wald schaut statt ins Leere.
     */
    _drawGround(layout, player) {
        const { ctx, canvas } = this;
        if (!layout?.bodenAn) return;
        const S = WELT_STUECK * TILE_SIZE;
        const zoom = this._zoom || 1;
        const halbW = canvas.width / 2 / zoom + TILE_SIZE;
        const halbH = canvas.height / 2 / zoom + TILE_SIZE;
        const maxSX = Math.ceil(layout.worldWidth / S) + 2;
        const maxSY = Math.ceil(layout.worldHeight / S) + 2;
        const sx0 = Math.max(-3, Math.floor((player.x - halbW) / S));
        const sx1 = Math.min(maxSX, Math.floor((player.x + halbW) / S));
        const sy0 = Math.max(-3, Math.floor((player.y - halbH) / S));
        const sy1 = Math.min(maxSY, Math.floor((player.y + halbH) / S));
        // Unter allem die Waldfarbe — falls ein Stück außerhalb der Reichweite liegt
        ctx.fillStyle = WELT_FARBEN.waldBoden;
        ctx.fillRect(player.x - halbW, player.y - halbH, halbW * 2, halbH * 2);
        // Weit herausgezoomt (05.11., Ruckeln): sonst sind mehr Stücke sichtbar, als der
        // Speicher hält — dann flog jedes Bild ein Stück raus und wurde sofort neu gemalt.
        // Der Speicher wächst deshalb mit der Sicht, und unter 0,6 reicht halbe Auflösung
        // (ein Bildpunkt deckt dann ohnehin mehr als einen Weltpixel).
        this._weltBedarf = (sx1 - sx0 + 1) * (sy1 - sy0 + 1);
        const grob = zoom < 0.6;
        for (let sy = sy0; sy <= sy1; sy++) {
            for (let sx = sx0; sx <= sx1; sx++) {
                const stueck = this._weltStueck(layout, sx, sy, false, grob);
                // Mit WELT_RAND Pixeln Überlappung: sonst blieben bei krummem Zoom
                // feine Haarlinien zwischen zwei Stücken stehen.
                if (stueck) ctx.drawImage(stueck, sx * S - WELT_RAND, sy * S - WELT_RAND, S + WELT_RAND * 2, S + WELT_RAND * 2);
            }
        }
    }

    /**
     * Nur den BODEN eines Weltausschnitts in einen fremden Kontext malen: Weltkarte
     * plus Rasen, Acker, Steinfeld und Bodenbeläge der Grundstücke — ohne Pflanzen,
     * Deko-Objekte, Tiere und Figuren. Für die 3D-Ansicht (engine/welt3d.js), die
     * das Ergebnis als Bodentextur nimmt.
     *
     * x0/y0/breite/hoehe in Weltpixeln, `massstab` = Zielpixel je Weltpixel. Bei
     * kleinem Maßstab (weit herausgezoomt) wären es zu viele vorgemalte Stücke —
     * dann reicht eine Farbe je Kachel, aus der Entfernung sieht man den Unterschied nicht.
     */
    maleBodenAusschnitt(zctx, layout, x0, y0, breite, hoehe, massstab, decoPlacements, ohneBaeume = false, nurFarben = false) {
        if (!layout?.bodenAn) return;
        const T = TILE_SIZE;
        zctx.save();
        zctx.setTransform(massstab, 0, 0, massstab, -x0 * massstab, -y0 * massstab);
        zctx.fillStyle = WELT_FARBEN.waldBoden;
        zctx.fillRect(x0, y0, breite, hoehe);
        const S = WELT_STUECK * T;
        const sx0 = Math.floor(x0 / S), sx1 = Math.floor((x0 + breite) / S);
        const sy0 = Math.floor(y0 / S), sy1 = Math.floor((y0 + hoehe) / S);
        // nurFarben (06.11.): ferne 3D-Kacheln immer im groben Weg — sonst würden sie den
        // Stück-Speicher der nahen Kacheln verdrängen.
        if (!nurFarben && (sx1 - sx0 + 1) * (sy1 - sy0 + 1) <= WELT_STUECK_MAX - 8) {
            for (let sy = sy0; sy <= sy1; sy++) {
                for (let sx = sx0; sx <= sx1; sx++) {
                    const stueck = this._weltStueck(layout, sx, sy, ohneBaeume);
                    if (stueck) zctx.drawImage(stueck, sx * S - WELT_RAND, sy * S - WELT_RAND, S + WELT_RAND * 2, S + WELT_RAND * 2);
                }
            }
        } else {
            const kx0 = Math.floor(x0 / T), kx1 = Math.ceil((x0 + breite) / T);
            const ky0 = Math.floor(y0 / T), ky1 = Math.ceil((y0 + hoehe) / T);
            for (let ky = ky0; ky < ky1; ky++) {
                for (let kx = kx0; kx < kx1; kx++) {
                    const f = WELT_FERNFARBE[layout.bodenAn(kx, ky)];
                    if (!f) continue;
                    zctx.fillStyle = f;
                    zctx.fillRect(kx * T, ky * T, T + 1, T + 1);
                }
            }
            // Rundweg und Teiche auch aus der Ferne rund, wie in den Stücken
            const rw = layout.rundweg;
            if (rw) {
                zctx.fillStyle = WELT_FERNFARBE[BODEN.KIES];
                zctx.beginPath(); zctx.ellipse(rw.cx * T, rw.cy * T, rw.rx * T, rw.ry * T, 0, 0, Math.PI * 2); zctx.fill();
            }
            for (const t of layout.teiche || []) {
                zctx.fillStyle = WELT_FARBEN.ufer;
                zctx.beginPath(); zctx.ellipse(t.cx * T, t.cy * T, (t.rx + 0.45) * T + 10, (t.ry + 0.45) * T + 10, 0, 0, Math.PI * 2); zctx.fill();
                zctx.fillStyle = WELT_FARBEN.wasser;
                zctx.beginPath(); zctx.ellipse(t.cx * T, t.cy * T, (t.rx + 0.45) * T, (t.ry + 0.45) * T, 0, 0, Math.PI * 2); zctx.fill();
            }
            for (let ky = ky0; ky < ky1; ky++) {
                for (let kx = kx0; kx < kx1; kx++) {
                    if (layout.bodenAn(kx, ky) !== BODEN.STEG) continue;
                    zctx.fillStyle = WELT_FERNFARBE[BODEN.STEG];
                    zctx.fillRect(kx * T, ky * T, T, T);
                }
            }
        }
        const { territoryWidth, territoryHeight } = MAP_CONFIG;
        const dekoBySlot = this._gruppiereDekoNachSlot(decoPlacements || LEERE_DEKO_LISTE);
        for (const slot of layout.slots || []) {
            const drawY = slot.isTopRow ? slot.anchorY - territoryHeight : slot.anchorY;
            if (slot.x + territoryWidth < x0 || slot.x > x0 + breite || drawY + territoryHeight < y0 || drawY > y0 + hoehe) continue;
            const unlocked = Array.isArray(slot.unlockedCells) ? slot.unlockedCells : [];
            const statisch = this._getSlotStaticLayer(slot, drawY, unlocked);
            if (statisch) zctx.drawImage(statisch, slot.x, drawY);
            const boden = this._getBodenLayer(slot, drawY, dekoBySlot.get(slot.id - 1) || LEERE_DEKO_LISTE);
            if (boden) zctx.drawImage(boden, slot.x, drawY);
            const saison = this._getSaisonBodenLayer(slot, territoryWidth, territoryHeight);
            if (saison) zctx.drawImage(saison, slot.x, drawY, territoryWidth, territoryHeight);
        }
        zctx.restore();
    }

    _weltStueck(layout, sx, sy, ohneBaeume = false, grob = false) {
        // Ohne Bäume (3D) ist ein eigenes Stück — beide Sorten liegen im selben Speicher.
        const key = `${ohneBaeume ? "o" : ""}${grob ? "g" : ""}${sx}_${sy}`;
        const cache = this._weltCache;
        const alt = cache.get(key);
        if (alt) {
            // Zuletzt benutzt nach hinten — die ältesten fliegen zuerst raus.
            cache.delete(key);
            cache.set(key, alt);
            return alt.canvas;
        }
        const S = WELT_STUECK * TILE_SIZE;
        const massstab = grob ? 0.5 : 1;
        const leinwand = document.createElement("canvas");
        leinwand.width = Math.ceil((S + WELT_RAND * 2) * massstab);
        leinwand.height = Math.ceil((S + WELT_RAND * 2) * massstab);
        const lctx = leinwand.getContext("2d");
        if (!lctx) return null;
        this._weltBildFehlt = false;
        lctx.save();
        lctx.scale(massstab, massstab);
        lctx.translate(-sx * S + WELT_RAND, -sy * S + WELT_RAND);
        this._maleWeltStueck(lctx, layout, sx * WELT_STUECK, sy * WELT_STUECK, ohneBaeume);
        lctx.restore();
        cache.set(key, { canvas: leinwand, fertig: !this._weltBildFehlt });
        const grenze = Math.max(WELT_STUECK_MAX, (this._weltBedarf || 0) + 24);
        while (cache.size > grenze) {
            const aeltester = cache.keys().next().value;
            cache.delete(aeltester);
        }
        return leinwand;
    }

    /** Kies als Füllmuster: das 256er-Bild auf 2×2 Kacheln, am Weltursprung ausgerichtet. */
    _kiesMuster(lctx) {
        const img = this._terrainBild("path", TERRAIN_FILES.path[0]);
        if (!img) return null;
        const muster = lctx.createPattern(img, "repeat");
        if (!muster) return null;
        const k = (TILE_SIZE * 2) / (img.naturalWidth || img.width);
        muster.setTransform(new DOMMatrix().scale(k, k));
        return muster;
    }

    /**
     * Kleine Leinwand für Pixel-Flächen (eine Farbe je WELT_PIXEL × WELT_PIXEL
     * Weltpixel), wird ohne Glättung hochskaliert — daher die Stufenkanten.
     */
    _pixelPuffer(breite, hoehe, name) {
        const key = "_pixPuffer_" + name;
        let c = this[key];
        if (!c) { c = document.createElement("canvas"); this[key] = c; }
        if (c.width < breite || c.height < hoehe) { c.width = Math.max(c.width, breite); c.height = Math.max(c.height, hoehe); }
        return c;
    }

    _pixelTeiche(lctx, teiche, x0, y0, w, h) {
        const P = WELT_PIXEL;
        const lw = Math.ceil(w / P), lh = Math.ceil(h / P);
        let bild = null;
        for (const t of teiche) {
            const cx = t.cx * TILE_SIZE, cy = t.cy * TILE_SIZE;
            const RX = (t.rx + 0.45) * TILE_SIZE, RY = (t.ry + 0.45) * TILE_SIZE;
            const U = 12; // Uferbreite in Weltpixeln
            const ix0 = Math.max(0, Math.floor((cx - RX - U - x0) / P));
            const ix1 = Math.min(lw, Math.ceil((cx + RX + U - x0) / P));
            const iy0 = Math.max(0, Math.floor((cy - RY - U - y0) / P));
            const iy1 = Math.min(lh, Math.ceil((cy + RY + U - y0) / P));
            if (ix0 >= ix1 || iy0 >= iy1) continue;
            if (!bild) bild = this._pixelPuffer(lw, lh, "teich").getContext("2d").createImageData(lw, lh);
            const d = bild.data;
            for (let iy = iy0; iy < iy1; iy++) {
                const wy = y0 + (iy + 0.5) * P;
                const gy = Math.floor(wy / P);
                for (let ix = ix0; ix < ix1; ix++) {
                    const wx = x0 + (ix + 0.5) * P;
                    const nx = (wx - cx) / RX, ny = (wy - cy) / RY;
                    const q = nx * nx + ny * ny;
                    let farbe = null;
                    if (q < 1) {
                        const gx = Math.floor(wx / P);
                        // Wellen: kurze Striche aus 3 Pixeln, fest an der Weltposition
                        const welle = q < 0.82 && (gx % 4) !== 3 && weltHash(Math.floor(gx / 4), gy, 77) < 0.035;
                        farbe = welle ? PIXEL_WASSER.welle
                            : q > 0.9 ? PIXEL_WASSER.flach
                                : q < 0.55 ? PIXEL_WASSER.tief : PIXEL_WASSER.mitte;
                    } else {
                        const sx = (wx - cx) / (RX + U), sy = (wy - cy) / (RY + U);
                        const qs = sx * sx + sy * sy;
                        if (qs < 1) farbe = qs > 0.93 ? PIXEL_WASSER.uferDunkel : PIXEL_WASSER.ufer;
                    }
                    if (!farbe) continue;
                    const o = (iy * lw + ix) * 4;
                    d[o] = farbe[0]; d[o + 1] = farbe[1]; d[o + 2] = farbe[2]; d[o + 3] = 255;
                }
            }
        }
        if (!bild) return;
        const pc = this._pixelPuffer(lw, lh, "teich");
        const pctx = pc.getContext("2d");
        pctx.clearRect(0, 0, pc.width, pc.height);
        pctx.putImageData(bild, 0, 0);
        const glatt = lctx.imageSmoothingEnabled;
        lctx.imageSmoothingEnabled = false;
        lctx.drawImage(pc, 0, 0, lw, lh, x0, y0, lw * P, lh * P);
        lctx.imageSmoothingEnabled = glatt;
    }

    /**
     * Seerosen auf den Teichen (05.11.), in Pixeln wie das Wasser: Blatt mit Kerbe,
     * manche mit Blüte. Fest an der Weltposition (Hash), also in jedem Stück gleich.
     */
    _pixelSeerosen(lctx, layout, x0, y0, w, h) {
        const P = WELT_PIXEL;
        const T = TILE_SIZE;
        const teiche = layout.teiche || [];
        teiche.forEach((t, ti) => {
            const cx = t.cx * T, cy = t.cy * T, RX = (t.rx + 0.45) * T, RY = (t.ry + 0.45) * T;
            if (cx + RX < x0 || cx - RX > x0 + w || cy + RY < y0 || cy - RY > y0 + h) return;
            const anzahl = ti === 0 ? 16 : 5;
            for (let i = 0; i < anzahl; i++) {
                // Lage: Winkel + Abstand vom Rand aus dem Hash, nur im Wasser, nicht am Steg
                const winkel = weltHash(ti, i, 91) * Math.PI * 2;
                const tiefe = 0.45 + weltHash(ti, i, 92) * 0.35;
                const px = Math.round((cx + Math.cos(winkel) * RX * tiefe) / P) * P;
                const py = Math.round((cy + Math.sin(winkel) * RY * tiefe) / P) * P;
                const art = layout.bodenAn(Math.floor(px / T), Math.floor(py / T));
                if (art !== BODEN.WASSER) continue;
                const r = 3 + Math.floor(weltHash(ti, i, 93) * 2); // Radius in Pixeln
                const kerbe = Math.floor(weltHash(ti, i, 94) * 4);  // Richtung der Kerbe
                for (let dy = -r; dy <= r; dy++) {
                    for (let dx = -r; dx <= r; dx++) {
                        const d = dx * dx + (dy * dy) * 1.6;
                        if (d > r * r + 1) continue;
                        // Kerbe: ein schmaler Keil vom Rand zur Mitte
                        const keil = kerbe === 0 ? (dx > 0 && Math.abs(dy) <= dx * 0.45)
                            : kerbe === 1 ? (dx < 0 && Math.abs(dy) <= -dx * 0.45)
                                : kerbe === 2 ? (dy < 0 && Math.abs(dx) <= -dy * 0.6)
                                    : (dy > 0 && Math.abs(dx) <= dy * 0.6);
                        if (keil && (dx !== 0 || dy !== 0)) continue;
                        const rand = d > (r - 1) * (r - 1);
                        lctx.fillStyle = rand ? PIXEL_SEEROSE.rand : (dx + dy < 0 ? PIXEL_SEEROSE.licht : PIXEL_SEEROSE.blatt);
                        lctx.fillRect(px + dx * P, py + dy * P, P, P);
                    }
                }
                if (weltHash(ti, i, 95) < 0.4) {
                    lctx.fillStyle = PIXEL_SEEROSE.bluete;
                    lctx.fillRect(px - P, py - 2 * P, 3 * P, P);
                    lctx.fillRect(px - 2 * P, py - P, 5 * P, P);
                    lctx.fillRect(px - P, py, 3 * P, P);
                    lctx.fillStyle = PIXEL_SEEROSE.mitte;
                    lctx.fillRect(px, py - P, P, P);
                }
            }
        });
    }

    /**
     * Fischschatten, die durch die Teiche ziehen (05.11.). Jeder Fisch zieht eine
     * eigene Ellipsenbahn mit eigenem Tempo; die Lage rastet auf das Pixelraster
     * ein, damit er wie das Wasser aus groben Pixeln besteht.
     * `aufWelt(x, y)` setzt die Zeichenumgebung für diesen Weltpunkt (2D: nichts,
     * 3D: Projektion) und gibt false zurück, wenn er nicht zu sehen ist.
     */
    _maleFische(layout, aufWelt) {
        const teiche = layout?.teiche;
        if (!teiche || this._renderProfile?.simplifyPlantUi) return;
        const { ctx } = this;
        const P = WELT_PIXEL;
        const T = TILE_SIZE;
        const zeit = this._frameNow / 1000;
        teiche.forEach((t, ti) => {
            const anzahl = ti === 0 ? 6 : 2;
            for (let i = 0; i < anzahl; i++) {
                const tempo = (0.05 + weltHash(ti, i, 81) * 0.06) * (weltHash(ti, i, 82) < 0.5 ? 1 : -1);
                const phase = weltHash(ti, i, 83) * Math.PI * 2;
                const bahn = 0.3 + weltHash(ti, i, 84) * 0.4;
                const w = zeit * tempo * Math.PI * 2 + phase;
                const x = Math.round((t.cx * T + Math.cos(w) * t.rx * T * bahn) / P) * P;
                const y = Math.round((t.cy * T + Math.sin(w * 1.3) * t.ry * T * bahn * 0.8) / P) * P;
                if (layout.bodenAn(Math.floor(x / T), Math.floor(y / T)) !== BODEN.WASSER) continue;
                // Blickrichtung aus der Bewegung (Ableitung der x-Bahn)
                const nachRechts = -Math.sin(w) * tempo > 0;
                const s = nachRechts ? 1 : -1;
                if (!aufWelt(x, y)) continue;
                ctx.fillStyle = PIXEL_SEEROSE.fisch;
                ctx.fillRect(x - 3 * P, y - P, 6 * P, 2 * P);       // Körper
                ctx.fillRect(x - 2 * P, y - 2 * P, 4 * P, P);
                ctx.fillRect(x - 2 * P, y + P, 4 * P, P);
                // Schwanz hinten, schlägt leicht
                const schlag = Math.sin(zeit * 6 + phase) > 0 ? 0 : P;
                ctx.fillRect(x - s * 4 * P - (s > 0 ? P : 0), y - 2 * P + schlag, P, 2 * P);
                ctx.fillRect(x - s * 5 * P - (s > 0 ? P : 0), y - 3 * P + schlag, P, 4 * P);
            }
        });
    }

    _pixelRundweg(lctx, rw, x0, y0, w, h) {
        const P = WELT_PIXEL;
        const T = TILE_SIZE;
        const cx = rw.cx * T, cy = rw.cy * T, RX = rw.rx * T, RY = rw.ry * T;
        if (cx + RX < x0 || cx - RX > x0 + w || cy + RY < y0 || cy - RY > y0 + h) return;
        const lw = Math.ceil(w / P), lh = Math.ceil(h / P);
        const innen = (wx, wy) => { const nx = (wx - cx) / RX, ny = (wy - cy) / RY; return nx * nx + ny * ny < 1; };
        // Maske (weiß = Kies) und Kante (dunkle Pixel am Rand) in einem Durchgang
        const mc = this._pixelPuffer(lw, lh, "rundMaske");
        const mctx = mc.getContext("2d");
        const maske = mctx.createImageData(lw, lh);
        const kc = this._pixelPuffer(lw, lh, "rundKante");
        const kctx = kc.getContext("2d");
        const kante = kctx.createImageData(lw, lh);
        const k = PIXEL_WASSER.kiesKante;
        let irgendwas = false;
        for (let iy = 0; iy < lh; iy++) {
            const wy = y0 + (iy + 0.5) * P;
            for (let ix = 0; ix < lw; ix++) {
                const wx = x0 + (ix + 0.5) * P;
                if (!innen(wx, wy)) continue;
                irgendwas = true;
                const o = (iy * lw + ix) * 4;
                maske.data[o] = 255; maske.data[o + 1] = 255; maske.data[o + 2] = 255; maske.data[o + 3] = 255;
                if (!innen(wx - P, wy) || !innen(wx + P, wy) || !innen(wx, wy - P) || !innen(wx, wy + P)) {
                    kante.data[o] = k[0]; kante.data[o + 1] = k[1]; kante.data[o + 2] = k[2]; kante.data[o + 3] = 255;
                }
            }
        }
        if (!irgendwas) return;
        mctx.clearRect(0, 0, mc.width, mc.height);
        mctx.putImageData(maske, 0, 0);
        kctx.clearRect(0, 0, kc.width, kc.height);
        kctx.putImageData(kante, 0, 0);
        // Maske groß ziehen, Kies hineinfüllen (source-in), Kante drauf, dann aufs Stück
        const tmp = this._pixelPuffer(lw * P, lh * P, "rundGross");
        const tctx = tmp.getContext("2d");
        tctx.save();
        tctx.clearRect(0, 0, tmp.width, tmp.height);
        tctx.imageSmoothingEnabled = false;
        tctx.drawImage(mc, 0, 0, lw, lh, 0, 0, lw * P, lh * P);
        tctx.globalCompositeOperation = "source-in";
        const img = this._terrainBild("path", TERRAIN_FILES.path[0]);
        const muster = img ? tctx.createPattern(img, "repeat") : null;
        if (muster) {
            const s = (T * 2) / (img.naturalWidth || img.width);
            muster.setTransform(new DOMMatrix().translate(-x0, -y0).scale(s, s));
            tctx.fillStyle = muster;
        } else {
            tctx.fillStyle = WELT_FARBEN.kies;
        }
        tctx.fillRect(0, 0, lw * P, lh * P);
        tctx.globalCompositeOperation = "source-over";
        tctx.drawImage(kc, 0, 0, lw, lh, 0, 0, lw * P, lh * P);
        tctx.restore();
        lctx.drawImage(tmp, 0, 0, lw * P, lh * P, x0, y0, lw * P, lh * P);
    }

    /** Bild holen und merken, ob es noch fehlt (dann wird das Stück später neu gemalt). */
    _weltBild(src) {
        const img = this._getImage(src);
        if (!img) this._weltBildFehlt = true;
        return img;
    }

    _maleWeltStueck(lctx, layout, stueckKx, stueckKy, ohneBaeume = false) {
        const T = TILE_SIZE;
        const art = (x, y) => layout.bodenAn(x, y);
        // Eine Kachel ringsum mehr malen — der Rand (WELT_RAND) liegt schon darauf.
        const kx0 = stueckKx - 1, ky0 = stueckKy - 1;
        const kx1 = stueckKx + WELT_STUECK + 1;
        const ky1 = stueckKy + WELT_STUECK + 1;
        const istWasser = (b) => b === BODEN.WASSER || b === BODEN.STEG;
        // Kies, der nur zum Rundweg gehört, wird nicht kachelweise gemalt, sondern
        // als glatte Ellipse (Schritt 1b). Standflächen und Straße bleiben Kacheln.
        const rw = layout.rundweg;
        const imRund = (kx, ky, plus = 0) => rw
            && ((kx + 0.5 - rw.cx) / (rw.rx + plus)) ** 2 + ((ky + 0.5 - rw.cy) / (rw.ry + plus)) ** 2 < 1;
        const inRechteck = (kx, ky) => (layout.kiesRechtecke || []).some((r) => kx >= r.x0 && kx <= r.x1 && ky >= r.y0 && ky <= r.y1);
        const nurRundweg = (kx, ky) => art(kx, ky) === BODEN.KIES && imRund(kx, ky) && !inRechteck(kx, ky);

        const kies = (kx, ky) => {
            const files = TERRAIN_FILES.path;
            const bx = Math.floor(kx / 2), by = Math.floor(ky / 2);
            const v = this._getTileVariantIndex("path", bx, by, 4407, files.length);
            const img = this._terrainBild("path", files[v]);
            if (img) {
                // Kies wie bisher in 2×2-Blöcken: ein Bild über vier Kacheln, jede
                // Kachel zeigt ihr Viertel davon.
                const hw = (img.naturalWidth || img.width) / 2;
                const hh = (img.naturalHeight || img.height) / 2;
                lctx.drawImage(img, (kx & 1) * hw, (ky & 1) * hh, hw, hh, kx * T, ky * T, T, T);
            } else {
                lctx.fillStyle = WELT_FARBEN.kies;
                lctx.fillRect(kx * T, ky * T, T, T);
            }
        };
        const gras = (kx, ky, kind, salz) => {
            const files = TERRAIN_FILES[kind];
            const v = this._getTileVariantIndex(kind, kx, ky, salz, files.length);
            const img = this._terrainBild(kind, files[v]);
            if (img) lctx.drawImage(img, kx * T, ky * T, T, T);
            else { lctx.fillStyle = WELT_FARBEN.wiese; lctx.fillRect(kx * T, ky * T, T, T); }
        };

        // 1. Untergrund je Kachel. Unter dem Wasser liegt das Land, das daneben ist —
        // der Teich wird danach als glatte Ellipse darübergemalt (Schritt 3).
        for (let ky = ky0; ky < ky1; ky++) {
            for (let kx = kx0; kx < kx1; kx++) {
                let a = art(kx, ky);
                if (istWasser(a)) {
                    const n = [art(kx - 1, ky), art(kx + 1, ky), art(kx, ky - 1), art(kx, ky + 1)];
                    a = n.includes(BODEN.KIES) ? BODEN.KIES : BODEN.WIESE;
                }
                if (a === BODEN.KIES && nurRundweg(kx, ky)) a = BODEN.WIESE;
                if (a === BODEN.KIES) kies(kx, ky);
                else if (a === BODEN.WALD) gras(kx, ky, "tallGrass", 9991);
                else {
                    gras(kx, ky, "grass", 5501);
                    lctx.fillStyle = WELT_FARBEN.wieseTon;
                    lctx.fillRect(kx * T, ky * T, T, T);
                }
            }
        }

        // 1b. Rundweg als Ellipse mit Pixelkante (Pixel-Look), Kies als Muster im
        // selben 2×2-Raster wie die Kachel-Wege
        if (rw) {
            this._pixelRundweg(lctx, rw, kx0 * T, ky0 * T, (kx1 - kx0) * T, (ky1 - ky0) * T);
            // Die Standflächen und die Straße liegen über dem Rand der Ellipse
            for (let ky = ky0; ky < ky1; ky++) {
                for (let kx = kx0; kx < kx1; kx++) {
                    if (art(kx, ky) === BODEN.KIES && inRechteck(kx, ky)) kies(kx, ky);
                }
            }
        }

        // 2. Weiche Kante zwischen Kies und Wiese
        lctx.fillStyle = WELT_FARBEN.kiesKante;
        for (let ky = ky0; ky < ky1; ky++) {
            for (let kx = kx0; kx < kx1; kx++) {
                if (art(kx, ky) !== BODEN.KIES || nurRundweg(kx, ky)) continue;
                const x = kx * T, y = ky * T;
                // Zur Rundweg-Ellipse hin keine Kante, die übernimmt ihr eigener Rand
                const g = (b, nx, ny) => (b === BODEN.WIESE || b === BODEN.WALD || b === BODEN.BUSCH) && !imRund(nx, ny, 0.3);
                if (g(art(kx, ky - 1), kx, ky - 1)) lctx.fillRect(x, y, T, 4);
                if (g(art(kx, ky + 1), kx, ky + 1)) lctx.fillRect(x, y + T - 3, T, 3);
                if (g(art(kx - 1, ky), kx - 1, ky)) lctx.fillRect(x, y, 3, T);
                if (g(art(kx + 1, ky), kx + 1, ky)) lctx.fillRect(x + T - 3, y, 3, T);
            }
        }

        // 3. Teiche in groben Pixeln (Pixel-Look): Ufer, flaches und tiefes Wasser,
        // Wellenstriche. Etwas größer als die gesperrte Fläche (Kachelmitte in der
        // Ellipse), damit keine Ecke einer Wasserkachel als Land durchscheint.
        this._pixelTeiche(lctx, layout.teiche || [], kx0 * T, ky0 * T, (kx1 - kx0) * T, (ky1 - ky0) * T);
        this._pixelSeerosen(lctx, layout, kx0 * T, ky0 * T, (kx1 - kx0) * T, (ky1 - ky0) * T);

        // 4. Steg: Holz mit Fugen quer, dunkle Ränder, Schatten aufs Wasser
        const holz = this._terrainBild("wood", "wood.png");
        for (let ky = ky0; ky < ky1; ky++) {
            for (let kx = kx0; kx < kx1; kx++) {
                if (art(kx, ky) !== BODEN.STEG) continue;
                const x = kx * T, y = ky * T;
                lctx.fillStyle = "rgba(0, 0, 0, 0.22)";
                lctx.fillRect(x + 4, y + 6, T, T);
                if (holz) lctx.drawImage(holz, x, y, T, T);
                else { lctx.fillStyle = WELT_FARBEN.steg; lctx.fillRect(x, y, T, T); }
                lctx.fillStyle = WELT_FARBEN.stegFuge;
                for (let i = 1; i < 4; i++) lctx.fillRect(x, y + i * 16 - 1, T, 2);
                if (art(kx - 1, ky) !== BODEN.STEG) lctx.fillRect(x, y, 4, T);
                if (art(kx + 1, ky) !== BODEN.STEG) lctx.fillRect(x + T - 4, y, 4, T);
                if (art(kx, ky - 1) === BODEN.WASSER) lctx.fillRect(x, y, T, 4);
            }
        }

        // 5. Wildblumen auf der Wiese — in 3D nicht flach auf dem Boden, dort stehen sie
        // aufrecht wie die Bäume (siehe draw3dStehend, _blumenIm)
        if (!ohneBaeume) {
            this._blumenIm(layout, kx0, ky0, kx1, ky1, (bl) => lctx.drawImage(bl.img, bl.x - bl.w / 2, bl.y - bl.h, bl.w, bl.h));
        }

        // 6. Bäume und Büsche (in 3D nicht: dort stehen sie aufrecht, siehe
        // draw3dStehend). Ein Baum ragt über seine Kachel hinaus (nach oben und zur
        // Seite) — deshalb werden auch Bäume aus Nachbarkacheln UNTERHALB und
        // seitlich des Stücks gemalt, in derselben Reihenfolge wie im Nachbarstück
        // (Reihe für Reihe von oben), damit sich die Kanten decken.
        if (ohneBaeume) return;
        this._baeumeIm(layout, kx0 - 1, ky0 - 1, kx1 + 1, ky1 + 3, false, (bm) => {
            lctx.fillStyle = WELT_FARBEN.baumSchatten;
            lctx.beginPath(); lctx.ellipse(bm.x, bm.y - 3, bm.w * 0.42, bm.w * 0.16, 0, 0, Math.PI * 2); lctx.fill();
            lctx.drawImage(bm.img, bm.x - bm.w / 2, bm.y - bm.h, bm.w, bm.h);
        });
    }

    /**
     * Bäume und Büsche der Weltkarte in einem Kachelbereich, Reihe für Reihe von
     * oben — rein aus dem Kachel-Hash, also bei jedem Aufruf gleich.
     *
     * `stehend` (3D): jeder Waldbaum darf groß sein, die Tiefensortierung regelt dort
     * das Davor/Dahinter. In der Draufsicht nur, wo darüber noch zwei Reihen Wald
     * stehen — sonst ragte die Krone über einen Weg, auf dem man „über“ dem Baum liefe.
     */
/**
     * Wildblumen der Weltkarte in einem Kachelbereich — aus dem Kachel-Hash, also immer
     * gleich. `mache` bekommt { img, x, y (Fußpunkt), w, h } in Weltpixeln.
     */
    _blumenIm(layout, kx0, ky0, kx1, ky1, mache) {
        const T = TILE_SIZE;
        const art = (x, y) => layout.bodenAn(x, y);
        const rw = layout.rundweg;
        const imRund = (kx, ky, rand) => rw && ((kx + 0.5 - rw.cx) / (rw.rx + rand)) ** 2 + ((ky + 0.5 - rw.cy) / (rw.ry + rand)) ** 2 < 1;
        const blumen = WELT_BLUMEN.map((src) => this._weltBild(src));
        const bl = this._blumenPuffer || (this._blumenPuffer = { img: null, x: 0, y: 0, w: 0, h: 0 });
        for (let ky = ky0; ky < ky1; ky++) {
            for (let kx = kx0; kx < kx1; kx++) {
                if (art(kx, ky) !== BODEN.WIESE || imRund(kx, ky, 0.9)) continue;
                // Nicht am Wegrand und nicht am Ufer
                let amRand = false;
                for (let dy = -1; dy <= 1 && !amRand; dy++) for (let dx = -1; dx <= 1; dx++) {
                    const b = art(kx + dx, ky + dy);
                    if (b === BODEN.WASSER || b === BODEN.STEG || (b === BODEN.KIES && (dx === 0 || dy === 0))) { amRand = true; break; }
                }
                if (amRand) continue;
                if (weltHash(kx, ky, 47) > 0.03 + weltRauschen(kx, ky, 5, 5) * 0.16) continue;
                const img = blumen[Math.floor(weltHash(kx, ky, 48) * blumen.length)];
                if (!img) continue;
                bl.img = img;
                bl.w = 34 + Math.floor(weltHash(kx, ky, 49) * 14);
                bl.h = bl.w * ((img.naturalHeight || img.height) / (img.naturalWidth || img.width));
                const ox = 2 + Math.floor(weltHash(kx, ky, 50) * (T - bl.w - 4));
                bl.x = kx * T + ox + bl.w / 2;
                bl.y = ky * T + T - Math.floor(weltHash(kx, ky, 51) * 10);
                mache(bl);
            }
        }
    }

    _baeumeIm(layout, kx0, ky0, kx1, ky1, stehend, mache) {
        const T = TILE_SIZE;
        const art = (x, y) => layout.bodenAn(x, y);
        const baum = this._weltBild("/garden-assets/structure/tree.png");
        const bluete = this._weltBild("/garden-assets/deco/nature/cherry_blossom.png");
        const busch = this._weltBild("/garden-assets/deco/nature/hecke_klein.png");
        const bm = this._baumPuffer || (this._baumPuffer = { img: null, x: 0, y: 0, w: 0, h: 0 });
        for (let ky = ky0; ky < ky1; ky++) {
            for (let kx = kx0; kx < kx1; kx++) {
                const a = art(kx, ky);
                if (a !== BODEN.WALD && a !== BODEN.BUSCH) continue;
                const h = weltHash(kx, ky, 21);
                bm.x = kx * T + T / 2 + (weltHash(kx, ky, 22) - 0.5) * 22;
                bm.y = ky * T + T - 4 - weltHash(kx, ky, 23) * 10;
                const gross = a === BODEN.WALD && (stehend || (art(kx, ky - 1) === BODEN.WALD && art(kx, ky - 2) === BODEN.WALD));
                let img = null;
                if (gross && h < 0.62) {
                    img = (h < 0.025 && bluete) ? bluete : baum;
                    if (!img) continue;
                    bm.w = T * 1.9 * (0.85 + weltHash(kx, ky, 24) * 0.35);
                } else if ((a === BODEN.BUSCH || h < 0.85) && busch) {
                    img = busch;
                    bm.w = T * (1.0 + weltHash(kx, ky, 25) * 0.25);
                } else continue;
                bm.img = img;
                bm.h = bm.w * ((img.naturalHeight || img.height) / (img.naturalWidth || img.width));
                mache(bm);
            }
        }
    }

    /**
     * Wetterspuren auf dem Boden: Schneehaufen bei Schnee, Pfützen bei Regen.
     *
     * Bewusst im WELTRAUM gezeichnet (vor den Grundstücken, nach dem Boden) — anders
     * als die Flocken/Tropfen, die als Bildschirm-Overlay laufen. Dadurch bleiben sie
     * an ihrer Stelle liegen, wenn man sich bewegt.
     *
     * Die Positionen kommen aus einem Rasterhash, nicht aus Math.random: derselbe
     * Fleck liegt bei jedem Frame an derselben Stelle und flackert nicht.
     */
    _drawWeatherGround(layout, player, weather, bounds) {
        const type = weather && weather.type;
        if (type !== "snow" && type !== "rain") return;
        if (this._renderProfile && this._renderProfile.simplifyPlantUi) return;
        const intensity = Math.max(0, Math.min(1, Number(weather.intensity)));
        if (!(intensity > 0.05)) return;

        const { ctx, canvas } = this;
        const zoom = this._zoom || 1;
        const stride = TILE_SIZE * 3;
        const halfW = canvas.width / (2 * zoom) + stride;
        const halfH = canvas.height / (2 * zoom) + stride;
        // Mit bounds nur dieses Grundstück, sonst das ganze Sichtfeld.
        const loX = bounds ? Math.max(bounds.x0, player.x - halfW) : player.x - halfW;
        const hiX = bounds ? Math.min(bounds.x1, player.x + halfW) : player.x + halfW;
        const loY = bounds ? Math.max(bounds.y0, player.y - halfH) : player.y - halfH;
        const hiY = bounds ? Math.min(bounds.y1, player.y + halfH) : player.y + halfH;
        if (hiX <= loX || hiY <= loY) return;
        const startX = Math.floor(loX / stride) * stride;
        const startY = Math.floor(loY / stride) * stride;
        const endX = hiX;
        const endY = hiY;
        const maxX = layout.worldWidth;
        const maxY = layout.worldHeight;

        ctx.save();
        for (let gy = startY; gy < endY; gy += stride) {
            if (gy < 0 || gy > maxY) continue;
            for (let gx = startX; gx < endX; gx += stride) {
                if (gx < 0 || gx > maxX) continue;

                // Ein Hash je Rasterzelle, daraus mehrere Werte über die Bits
                let h = Math.imul((gx / stride) | 0, 374761393) ^ Math.imul((gy / stride) | 0, 668265263);
                h ^= h >>> 13; h = Math.imul(h, 1274126177); h ^= h >>> 16;
                const u = (h >>> 0) / 4294967295;
                if (u > 0.42) continue; // nicht in jeder Zelle etwas

                const ox = ((h >>> 3) & 0xff) / 255 * stride * 0.8;
                const oy = ((h >>> 11) & 0xff) / 255 * stride * 0.8;
                const size = 0.55 + (((h >>> 19) & 0xff) / 255) * 0.75;
                const x = gx + ox;
                const y = gy + oy;
                const rx = TILE_SIZE * 0.42 * size;
                const ry = rx * 0.42;

                if (bounds && (x < bounds.x0 || x > bounds.x1 || y < bounds.y0 || y > bounds.y1)) continue;
                // Keine Pfütze auf dem Teich und kein Schneehaufen mitten im Wald
                if (!bounds && layout.bodenAn) {
                    const b = layout.bodenAn(Math.floor(x / TILE_SIZE), Math.floor(y / TILE_SIZE));
                    if (b === BODEN.WASSER || b === BODEN.STEG || b === BODEN.WALD) continue;
                }

                // 11.11.: eckig auf dem Raster des Pixel-Bodens statt runder Ellipsen
                const P = WELT_PIXEL;
                const cx = Math.round(x / P) * P;
                const cy = Math.round(y / P) * P;
                const b = Math.max(P * 2, Math.round(rx / P) * P);
                const hoch = Math.max(P, Math.round(ry / P) * P);
                if (type === "snow") {
                    ctx.fillStyle = "rgba(244, 249, 255, " + (0.6 * intensity).toFixed(3) + ")";
                    ctx.fillRect(cx - b, cy - P, b * 2, hoch);
                    ctx.fillRect(cx - b + P * 2, cy - P - hoch / 2, b * 2 - P * 4, hoch / 2);
                    ctx.fillRect(cx - b + P, cy - P + hoch, b * 2 - P * 2, P);
                    // Kleine hellere Kuppe, damit es als Haufen liest statt als Fleck
                    ctx.fillStyle = "rgba(255, 255, 255, " + (0.6 * intensity).toFixed(3) + ")";
                    ctx.fillRect(cx - b + P * 3, cy - P - hoch / 2, Math.max(P, b - P * 2), P);
                } else {
                    ctx.fillStyle = "rgba(38, 74, 104, " + (0.34 * intensity).toFixed(3) + ")";
                    ctx.fillRect(cx - b, cy - hoch / 2, b * 2, hoch);
                    ctx.fillRect(cx - b + P * 2, cy - hoch / 2 - P, b * 2 - P * 4, hoch + P * 2);
                    // Schmaler Glanz auf der Wasserfläche
                    ctx.fillStyle = "rgba(186, 226, 255, " + (0.3 * intensity).toFixed(3) + ")";
                    ctx.fillRect(cx - b / 2, cy - hoch / 2, b, P / 2);
                }
            }
        }
        ctx.restore();
    }
    // 1. ANPASSUNG: Player Objekt ergänzt für Parallax Scrolling
    /**
     * Bildschirmposition, Radius und Flackern der sichtbaren Lichtquellen.
     *
     * Die Kamera ist zum Zeitpunkt des Aufrufs längst zurückgesetzt, deshalb wird
     * ihre Rechnung hier von Hand nachgezogen — mit denselben Rundungen wie in
     * draw(), sonst zittert der Lichtkegel gegen die Deko, auf der er sitzt.
     */
    _sichtbareLichter(player) {
        const lichter = this._lichter;
        if (!lichter || lichter.length === 0) return [];
        const { canvas } = this;
        const zoom = this._zoom || 1;
        const mx = Math.round(canvas.width / 2);
        const my = Math.round(canvas.height / 2);
        const px = player?.x || 0;
        const py = player?.y || 0;
        const ox = Math.round(-px);
        const oy = Math.round(-py);

        // Erst ALLE auf dem Schirm sichtbaren Lichter einsammeln und erst danach,
        // falls es mehr als LICHT_MAX sind, die dem Spieler nächsten behalten.
        //
        // Vorher gewann schlicht, wer zuerst in `this._lichter` stand (Reihenfolge
        // aus decoPlacements) — bei vielen Laternen auf einem Grundstück kippte
        // dieselbe Handvoll je nach Kamera-Ausschnitt mal rein, mal raus in die
        // Kappung, unabhängig von der Entfernung zum Spieler. Das sah aus wie
        // zufälliges Ein-/Ausschalten der Lichtkegel ("geht random aus oder an,
        // selbst wenn in Reichweite oder nicht") — gemeldet ab einer gewissen
        // Laternen-Zahl, war aber die ganze Zeit dieselbe feste Kappung, nur mit
        // instabiler Auswahl. Distanz-Sortierung macht die Auswahl deterministisch
        // (die nächsten Laternen leuchten immer, nicht irgendwelche) und blendet
        // weiter entfernte sauber aus, statt sie sichtbar hin- und herspringen zu
        // lassen.
        const kandidaten = [];
        for (const l of lichter) {
            const sx = mx + (l.x + ox) * zoom;
            const sy = my + (l.y + oy) * zoom;
            const r = l.licht.radius * zoom;
            if (sx + r < 0 || sx - r > canvas.width || sy + r < 0 || sy - r > canvas.height) continue;
            const dx = l.x - px;
            const dy = l.y - py;
            kandidaten.push({ sx, sy, r, licht: l.licht, x: l.x, y: l.y, distSq: dx * dx + dy * dy });
        }
        if (kandidaten.length > LICHT_MAX) {
            kandidaten.sort((a, b) => a.distSq - b.distSq);
            kandidaten.length = LICHT_MAX;
        }

        const sichtbar = [];
        for (const k of kandidaten) {
            // Phase aus der Position: sonst flackern alle Laternen im Gleichtakt.
            const p = this.frame * 0.08 + k.x * 0.017 + k.y * 0.011;
            const welle = 0.5 + 0.5 * (Math.sin(p) * 0.6 + Math.sin(p * 2.7) * 0.4);
            sichtbar.push({ sx: k.sx, sy: k.sy, r: k.r * (1 - k.licht.flackern + k.licht.flackern * welle), farbe: k.licht.farbe });
        }
        return sichtbar;
    }

    /**
     * Nächtlicher Schleier samt Laternenschein.
     *
     * WARUM EINE ZWISCHENFLÄCHE UND NICHT DIREKT AUF DIE LEINWAND
     * Eine Laterne soll den SCHLEIER wegnehmen, nicht das Bild. Vorher lief das
     * `destination-out` direkt auf der Hauptleinwand — das nimmt aber die Deckkraft
     * ALLER dort schon gezeichneten Pixel weg, also auch die des Grundstücks. Unter
     * der Laterne wurde die Leinwand durchsichtig, und durch das Loch schien der
     * fast schwarze Seitenhintergrund (bg-slate-950) hindurch. Genau das war zu
     * sehen: ein grauschwarzer Kegel mit dunklem Rand statt beleuchtetem Boden.
     *
     * Jetzt entsteht der Schleier auf einer eigenen Fläche, dort werden die Lichter
     * ausgestanzt, und erst das Ergebnis legt sich über das Bild. Was unter der
     * Laterne liegt, bleibt dadurch unangetastet sichtbar. Der warme Schein kommt
     * danach mit `lighter` obendrauf.
     *
     * @param {(lctx: CanvasRenderingContext2D) => void} maleSchleier zeichnet die
     *        Verdunklung auf die Zwischenfläche
     */
    _dunkelheitMitLicht(staerke, player, maleSchleier) {
        const { ctx, canvas } = this;
        // Halbe Auflösung (06.11., Leistung): der Schleier ist ein weicher Verlauf, beim
        // Hochskalieren sieht man keinen Unterschied — aber nur ein Viertel der Pixel muss
        // jedes Bild vier Mal gefüllt werden (leeren, Schleier, Mondschein, Lichter).
        const FAKTOR = 0.5;
        if (!this._nachtLayer) this._nachtLayer = document.createElement("canvas");
        const layer = this._nachtLayer;
        const lw = Math.max(1, Math.ceil(canvas.width * FAKTOR)), lh = Math.max(1, Math.ceil(canvas.height * FAKTOR));
        if (layer.width !== lw || layer.height !== lh) {
            layer.width = lw;
            layer.height = lh;
            this._nachtLayerCtx = layer.getContext("2d");
        }
        const lctx = this._nachtLayerCtx || (this._nachtLayerCtx = layer.getContext("2d"));

        lctx.setTransform(1, 0, 0, 1, 0, 0);
        lctx.globalCompositeOperation = "source-over";
        lctx.clearRect(0, 0, lw, lh);
        lctx.setTransform(FAKTOR, 0, 0, FAKTOR, 0, 0);
        maleSchleier(lctx);

        const sichtbar = staerke > 0.01 ? this._sichtbareLichter(player) : [];
        if (sichtbar.length > 0) {
            lctx.globalCompositeOperation = "destination-out";
            for (const l of sichtbar) {
                const g = lctx.createRadialGradient(l.sx, l.sy, 0, l.sx, l.sy, l.r);
                // Bis zum Rand auf null: bliebe dort ein Rest stehen, zeichnete sich
                // die Kante des Farbverlaufs als Ring in den Schleier.
                g.addColorStop(0, "rgba(0,0,0,1)");
                g.addColorStop(0.45, "rgba(0,0,0,0.82)");
                g.addColorStop(0.75, "rgba(0,0,0,0.38)");
                g.addColorStop(1, "rgba(0,0,0,0)");
                lctx.fillStyle = g;
                lctx.fillRect(l.sx - l.r, l.sy - l.r, l.r * 2, l.r * 2);
            }
            lctx.globalCompositeOperation = "source-over";
        }

        const glatt = ctx.imageSmoothingEnabled;
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(layer, 0, 0, lw, lh, 0, 0, lw / FAKTOR, lh / FAKTOR);
        ctx.imageSmoothingEnabled = glatt;

        if (sichtbar.length === 0) return;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        for (const l of sichtbar) {
            const [cr, cg, cb] = l.farbe;
            const g = ctx.createRadialGradient(l.sx, l.sy, 0, l.sx, l.sy, l.r * 0.8);
            g.addColorStop(0, `rgba(${cr},${cg},${cb},${0.26 * staerke})`);
            g.addColorStop(0.4, `rgba(${cr},${cg},${cb},${0.1 * staerke})`);
            g.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
            ctx.fillStyle = g;
            ctx.fillRect(l.sx - l.r, l.sy - l.r, l.r * 2, l.r * 2);
        }
        ctx.restore();
    }

    /**
     * Wetter UND Tageszeit. Beide verdunkeln, deshalb gehören sie in EINEN Durchgang.
     *
     * Vorher zeichnete nur das Wetter einen Schleier (Mondschein, Gewitter). Mit dem
     * Tag-Nacht-Wechsel gäbe es zwei davon — und zwei übereinandergelegte Schleier
     * ergeben in der tiefen Nacht bei Gewitter ein fast schwarzes Bild. Genommen wird
     * deshalb der STÄRKERE von beiden, nicht die Summe.
     *
     * @param {number} nacht Dunkelheit der Tageszeit, 0 bis 1 (engine/Tageszeit.js)
     */
    _drawWeatherOverlay(weather, player, nacht = 0) {
        const type = weather?.type || "sun";
        const intensity = Math.max(0, Math.min(1, Number.isFinite(weather?.intensity) ? weather.intensity : 1));
        const { ctx, canvas } = this;
        const nachtStaerke = Math.max(0, Math.min(1, Number(nacht) || 0));
        const wetterStaerke = type === "moonlight" ? 0.4 * intensity
            : type === "thunder" ? 0.45 * intensity
            : 0;
        const schleier = Math.max(nachtStaerke, wetterStaerke);
        const mondschein = type === "moonlight" || nachtStaerke > 0.05;

        // Der Schleier hängt an der Tageszeit und läuft deshalb auch bei "sun".
        if (schleier > 0.01) {
            this._dunkelheitMitLicht(schleier, player, (lctx) => {
                lctx.fillStyle = `rgba(15, 23, 42, ${schleier})`;
                lctx.fillRect(0, 0, canvas.width, canvas.height);
                if (!mondschein) return;
                // Mondschein von oben rechts. Er hellt den SCHLEIER auf und gehört
                // deshalb hier hinein — sonst stanzt ihn eine Laterne darunter nicht
                // mit weg und es bliebe ein heller Rand stehen.
                const gradient = lctx.createRadialGradient(canvas.width, 0, 0, canvas.width, 0, canvas.width * 0.8);
                gradient.addColorStop(0, `rgba(186, 230, 253, ${0.45 * schleier})`);
                gradient.addColorStop(1, "rgba(15, 23, 42, 0)");
                lctx.fillStyle = gradient;
                lctx.fillRect(0, 0, canvas.width, canvas.height);
            });
        }

        if (type === "sun" || intensity <= 0.01) return;

        // Offset des Spielers abziehen, damit Regen an der Map "klebt"
        const pxOffset = player ? player.x : 0;
        const pyOffset = player ? player.y : 0;

        ctx.save();
        if (type === "moonlight") {
            // Mondschein bringt nur den Schleier mit, und der ist oben schon gemalt.
            ctx.restore();
            return;
        }

        if (type === "thunder") {
            ctx.restore();
            // Blitze kommen NACH dem Schleier auf die Hauptleinwand: sie sind selbst
            // eine Lichtquelle und dürfen von keiner Laterne ausgestanzt werden.
            ctx.save();

            const particleScale = Math.max(0.2, Math.min(1, Number(this._renderProfile?.particleScale) || 1));
            const boltCount = Math.max(1, Math.round(4 * particleScale));
            for (let b = 0; b < boltCount; b++) {
                const phase = (this.frame + b * 67) % 220;
                if (phase > 10) continue;
                
                const xRaw = ((this.frame * 13 + b * 191) % (canvas.width + 80)) - 40 - (pxOffset * 0.05); // Leichter Parallax für Blitze
                let x = ((xRaw % (canvas.width + 100)) + (canvas.width + 100)) % (canvas.width + 100) - 50;
                let y = -20;
                
                ctx.strokeStyle = `rgba(196,181,253,${0.6 + intensity * 0.4})`;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(x, y);
                
                while (y < canvas.height + 50) {
                    x += (Math.random() - 0.5) * 120;
                    y += (canvas.height / 6) + Math.random() * 40; 
                    ctx.lineTo(x, y);
                }
                ctx.stroke();
                
                ctx.shadowBlur = 25;
                ctx.shadowColor = "rgba(196,181,253,0.8)";
                ctx.stroke();
                ctx.shadowBlur = 0;
            }
            ctx.restore();
            return;
        }

        const particleScale = Math.max(0.15, Math.min(1, Number(this._renderProfile?.particleScale) || 1));
        const baseCount = type === "snow" ? 90 : 140;
        const particleCount = Math.max(10, Math.round(baseCount * particleScale * (0.4 + intensity * 0.6)));
        for (let i = 0; i < particleCount; i++) {
            const seed = i * 97.13;
            const speed = type === "snow" ? (0.3 + (i % 7) * 0.05) : (0.9 + (i % 11) * 0.07);
            const drift = type === "snow" ? Math.sin(this.frame * 0.008 + seed) * 12 : Math.sin(this.frame * 0.02 + seed) * 2.5;
            
            // 1. ANPASSUNG: Player Offsets abziehen
            const yRaw = this.frame * speed * 2 + i * 37 - pyOffset;
            const xRaw = i * 53 + this.frame * (type === "snow" ? 0.15 : 0.45) + drift - pxOffset;
            
            // Sauberer positiver Modulo für flüssiges Wrappen über den Bildschirm
            const y = ((yRaw % (canvas.height + 40)) + (canvas.height + 40)) % (canvas.height + 40) - 20;
            const x = ((xRaw % (canvas.width + 20)) + (canvas.width + 20)) % (canvas.width + 20) - 10;
            
            ctx.strokeStyle = type === "snow"
                ? `rgba(255,255,255,${0.28 + intensity * 0.42})`
                : `rgba(167,243,255,${0.16 + intensity * 0.26})`;
            ctx.lineWidth = type === "snow" ? 2 : 1.4;
            if (type === "snow") {
                // Flocken als Quadrate in drei Größen (11.11.)
                const fg = 2 + (i % 3);
                ctx.fillStyle = ctx.strokeStyle;
                ctx.fillRect(Math.round(x), Math.round(y), fg, fg);
                continue;
            }
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x - 3, y + 12);
            ctx.stroke();
        }
        ctx.restore();
    }

    /**
     * Zeichnet alle Grundstücke. Pflanzen, Deko, Tiere und (falls er darauf steht)
     * der Spieler landen in EINER nach Fußpunkt sortierten Liste — dadurch verdeckt
     * konsequent das Vordere das Hintere, statt dass jede Kategorie in einem eigenen
     * Durchgang pauschal über der vorherigen liegt.
     *
     * @returns {boolean} ob der Spieler bereits einsortiert gezeichnet wurde
     */
    /**
     * decoPlacements (die WELTWEITE Liste, alle Grundstücke gemischt) einmal
     * nach slotIndex sortieren — siehe Kommentar bei this._decoBySlot im
     * Konstruktor. Leere Arrays statt fehlender Einträge, damit die Aufrufer
     * nicht jedes Mal auf undefined prüfen müssen.
     */
    _gruppiereDekoNachSlot(decoPlacements) {
        const map = this._decoBySlot;
        map.clear();
        if (!Array.isArray(decoPlacements)) return map;
        for (const deco of decoPlacements) {
            const slotIndex = deco?.slotIndex;
            if (!Number.isInteger(slotIndex)) continue;
            let liste = map.get(slotIndex);
            if (!liste) map.set(slotIndex, (liste = []));
            liste.push(deco);
        }
        return map;
    }

    drawTerritories(layout, player, petPlacements = [], decoPlacements = [], playerPayload = null) {
        const { ctx } = this;
        const { territoryWidth, territoryHeight, baseDirtWidth, baseDirtHeight, dirtOffsetX } = MAP_CONFIG;
        const viewMargin = 200;
        // Ohne die Division durchs Zoom bleibt dieses Fenster beim Herauszoomen
        // enger als der tatsächlich sichtbare Ausschnitt (1 Welt-Einheit sind bei
        // zoom < 1 weniger als 1 Bildschirm-Pixel, die sichtbare Welt in
        // Welt-Einheiten also GRÖSSER als canvas.width/2 Pixel). Betroffen waren
        // u. a. Laternen: ihr Licht wird nur eingesammelt, wenn ihr _drawSize_-
        // Fußabdruck (klein, ~1 Kachel) durch dieses Fenster kommt — nicht ihr
        // viel größerer Lichtradius. Beim Herauszoomen, Herumlaufen oder
        // Hineinzoomen rutschte eine an sich sichtbare Laterne dadurch immer
        // wieder knapp über die (zu enge) Kante und verschwand kurz samt Schein —
        // gemeldet am 21.08.2026 als "Laternen flackern/gehen aus, auch mitten im
        // sichtbaren Bereich".
        const zoom = this._zoom || 1;
        const viewLeft = player.x - this.canvas.width / 2 / zoom - viewMargin;
        const viewRight = player.x + this.canvas.width / 2 / zoom + viewMargin;
        const viewTop = player.y - this.canvas.height / 2 / zoom - viewMargin;
        const viewBottom = player.y + this.canvas.height / 2 / zoom + viewMargin;
        let playerDrawn = false;
        // Ein Mitspieler darf nur einmal gezeichnet werden, auch wenn sich Grundstücke
        // an den Rändern überlappen.
        const drawnRemotes = this._drawnRemotes;
        drawnRemotes.clear();
        const dekoBySlot = this._gruppiereDekoNachSlot(decoPlacements);

        layout.slots.forEach(slot => {
            const drawY = slot.isTopRow ? slot.anchorY - territoryHeight : slot.anchorY;
            const slotRight = slot.x + territoryWidth;
            const slotBottom = drawY + territoryHeight;
            const isVisible = slotRight >= viewLeft && slot.x <= viewRight && slotBottom >= viewTop && drawY <= viewBottom;
            if (!isVisible) return;

            const unlockedCells = Array.isArray(slot.unlockedCells) ? slot.unlockedCells : [];
            const staticLayer = this._getSlotStaticLayer(slot, drawY, unlockedCells);
            if (staticLayer) ctx.drawImage(staticLayer, slot.x, drawY);
            const slotDeko = dekoBySlot.get(slot.id - 1) || LEERE_DEKO_LISTE;
            // Bodenbeläge direkt auf den Grundlayer: sie ERSETZEN den Untergrund an
            // ihrer Kachel. Danach kommt alles andere darüber, das Raster inbegriffen.
            const bodenLayer = this._getBodenLayer(slot, drawY, slotDeko);
            if (bodenLayer) ctx.drawImage(bodenLayer, slot.x, drawY);
            // Editor: Kachelraster über dem eigenen Grundstück, damit man sieht,
            // woran sich Deko und Gebäude ausrichten.
            if (this._editorSlotId === slot.id) this._drawEditorRaster(slot, drawY);
            // Wetterspuren gehören ÜBER den Bodenlayer des Grundstücks — davor
            // gezeichnet wurden sie von Rasen und Acker vollständig zugedeckt.
            this._drawWeatherGround(layout, player, this._weather, {
                x0: slot.x, y0: drawY, x1: slotRight, y1: slotBottom,
            });
            const saisonLayer = this._getSaisonBodenLayer(slot, territoryWidth, territoryHeight);
            if (saisonLayer) ctx.drawImage(saisonLayer, slot.x, drawY, territoryWidth, territoryHeight);

            const bucket = this._renderBucket;
            bucket.length = 0;
            this._poolUsed = 0;

            this._collectPlants(bucket, slot, drawY, viewLeft, viewTop, viewRight, viewBottom, dirtOffsetX, baseDirtHeight, baseDirtWidth);
            this._collectDeco(bucket, slot, drawY, slotDeko, viewLeft, viewTop, viewRight, viewBottom);
            this._collectPets(bucket, slot, petPlacements, drawY);

            // Der Spieler wird nur auf dem Grundstück einsortiert, auf dem er steht —
            // sonst läuft er hinter einem Baum vorbei, der drei Plots weiter steht.
            if (playerPayload && !playerDrawn
                && player.x >= slot.x && player.x <= slotRight
                && player.y >= drawY && player.y <= slotBottom) {
                const entry = this._poolEntry();
                entry.kind = "player";
                entry.baseY = player.y;
                entry.x = player.x;
                entry.ghost = false;
                bucket.push(entry);
                playerDrawn = true;
            }

            // Mitspieler auf diesem Grundstück ebenfalls einsortieren
            if (this._remotePlayers) {
                for (const remote of this._remotePlayers) {
                    if (drawnRemotes.has(remote)) continue;
                    if (remote.x < slot.x || remote.x > slotRight || remote.y < drawY || remote.y > slotBottom) continue;
                    const entry = this._poolEntry();
                    entry.kind = "remote";
                    entry.ref = remote;
                    entry.baseY = remote.y;
                    entry.x = remote.x;
                    entry.ghost = false;
                    bucket.push(entry);
                    drawnRemotes.add(remote);
                }
            }

            // Inkubator/Mülleimer dieses Grundstücks mit einsortieren
            if (this._plotAreas) {
                for (const area of this._plotAreas) {
                    if (!area || area.x < slot.x || area.x > slotRight) continue;
                    if (area.y < drawY || area.y > slotBottom) continue;
                    const entry = this._poolEntry();
                    entry.kind = "area";
                    entry.ref = area;
                    // Fußpunkt, wenn das Gebäude einen kennt — sonst grob geschätzt.
                    entry.baseY = Number.isFinite(area.fussY) ? area.fussY : area.y + 35;
                    bucket.push(entry);
                }
            }

            // Muss VOR dem Sortieren laufen: sie vergleicht die rohen Fußpunkte, bevor
            // compareByBaseY sie für Deko überstimmt (siehe dort).
            this._markSpielerGeist(bucket);
            bucket.sort(compareByBaseY);

            for (let i = 0; i < bucket.length; i++) {
                const entry = bucket[i];
                if (entry.kind === "plant") {
                    this._drawPlant(entry.plant, entry.cellX, entry.cellY, entry.slotId, entry.cacheKey);
                } else if (entry.kind === "deco") {
                    this._drawDecoItem(entry);
                } else if (entry.kind === "area") {
                    const a = entry.ref;
                    const ersatz = AREA_ERSATZ[bauart(a)] || AREA_ERSATZ.incubator;
                    // BUG (Feedback 30.08.: "Schild ueber dem Schuppen zeigen, wenn ein Ei
                    // fertig ist") — hier stand noch `a.type === "incubator"`, ein Rest aus
                    // der Zeit, als der Inkubator sein eigenes Gebäude auf dem Feld hatte.
                    // Seit er im Schuppen wohnt, lief das ins Leere. Wichtig: `a === this.
                    // _ownShed`, NICHT `bauart(a) === "shed"` — dieser Zweig zeichnet auch
                    // die Schuppen der Nachbarn (gleiche Bauart!), und deren "Ei fertig"
                    // geht niemanden außer ihnen selbst etwas an.
                    this._drawAreaBuilding(
                        a, ersatz.farbe, ersatz.symbol,
                        a.label || "", a === this._ownShed ? this._readyEggs : 0,
                    );
                } else if (entry.kind === "pet") {
                    this._drawPetItem(entry);
                } else if (entry.kind === "remote") {
                    // Fremde tragen ihr Item sichtbar in der Hand — inklusive
                    // Groesse und Sonderform, gezeichnet vom selben Code wie beim
                    // eigenen Spieler.
                    // `ghost`: siehe _markSpielerGeist — steht eigentlich hinter
                    // dieser Deko, wird aber (Absicht) davor gezeichnet.
                    this.ctx.globalAlpha = entry.ghost ? 0.5 : 1;
                    this.drawPlayer(
                        entry.ref, null, entry.ref.held || null,
                        entry.ref.name, entry.ref.appearance || {}, entry.ref.badge, "remote",
                        entry.ref.nameplate,
                    );
                    this.ctx.globalAlpha = 1;
                } else if (entry.kind === "player") {
                    this.ctx.globalAlpha = entry.ghost ? 0.5 : 1;
                    this.drawPlayer(
                        player,
                        playerPayload.selectedTool,
                        playerPayload.heldItem,
                        playerPayload.localPlayerName,
                        playerPayload.playerAppearance,
                        playerPayload.playerBadge,
                        "local",
                        playerPayload.playerNameplate,
                    );
                    this.ctx.globalAlpha = 1;
                }
            }

            // Reife-Marker ganz zum Schluss: eine erntereife Pflanze darf nie hinter
            // einem hohen Nachbarn verschwinden.
            this._drawReadyMarkers(bucket);

            // Aus MapConfig, nicht noch einmal hier gerechnet: die Klickfläche des
            // Briefkastens leitet sich aus derselben Funktion ab. Zwei Kopien der
            // Formel hiessen, dass ein Verschieben die Klickfläche zurücklässt.
            const schild = getSignLayout(slot);
            this._drawSign(slot, schild.centerX, schild.centerY);
        });

        return playerDrawn;
    }

    _poolEntry() {
        const pool = this._renderPool;
        let entry = pool[this._poolUsed];
        if (!entry) {
            entry = { kind: "", baseY: 0, plant: null, cellX: 0, cellY: 0, slotId: 0, cacheKey: "", ref: null, size: 0, x: 0, y: 0, ghost: false };
            pool[this._poolUsed] = entry;
        }
        this._poolUsed++;
        return entry;
    }

    /**
     * Deko soll den Spieler meist nie verschlucken — Bank, Statue & Co. sind flache
     * Möblierung, kein Sichtschutz (siehe compareByBaseY, das sie deshalb IMMER vor
     * Deko einsortiert). Damit das nicht aussieht, als liefe man einfach durch eine
     * Statue hindurch, wird halbdurchsichtig gezeichnet, wer nach der eigentlichen
     * Fußpunkt-Ordnung eigentlich dahinter stünde — ein Geist vor der Deko statt
     * unsichtbar dahinter. Pflanzen UND Deko mit `sichtschutz` (Zäune) bleiben aussen
     * vor: dahinter zu verschwinden ist dort gewollt (siehe Kommentar oben bei
     * drawTerritories bzw. bei compareByBaseY).
     *
     * Muss vor bucket.sort() laufen, weil sie mit den ROHEN Fußpunkten vergleicht —
     * genau der Fall, den compareByBaseY danach überstimmt.
     */
    _markSpielerGeist(bucket) {
        for (let i = 0; i < bucket.length; i++) {
            const spieler = bucket[i];
            if (spieler.kind !== "player" && spieler.kind !== "remote") continue;
            for (let j = 0; j < bucket.length; j++) {
                const deko = bucket[j];
                if (deko.kind !== "deco") continue;
                if (DEKO_SICHTSCHUTZ.has(deko.ref?.decoId)) continue; // darf normal verdecken, kein Geist
                if (deko.baseY <= spieler.baseY) continue; // stand ohnehin schon davor
                // Grober Sichtkontakt statt echter Kollision: nah genug in beide
                // Richtungen, dass sich die Bilder auf dem Bildschirm überlappen würden.
                if (Math.abs(deko.x - spieler.x) > deko.size / 2 + 30) continue;
                if (deko.baseY - spieler.baseY > TILE_SIZE * 2.5) continue;
                spieler.ghost = true;
                break;
            }
        }
    }

    /**
     * Bodenbeläge eines Grundstücks — als eigene, pro Grundstück gecachte Fläche,
     * genau wie `_getSlotStaticLayer` für den Rasen darunter.
     *
     * Vorher zeichnete `_drawBoden` JEDE Belag-Kachel bei JEDEM Frame einzeln neu
     * (bei einem voll gepflasterten Grundstück potenziell hunderte drawImage-
     * Aufrufe pro Frame, nur für den Boden) — ein spürbarer Teil der gemeldeten
     * Ruckler bei viel Dekoration. Die Fläche ändert sich aber nur, wenn
     * tatsächlich etwas gepflastert oder entfernt wird.
     *
     * WICHTIG: der Cache-Schlüssel kann NICHT einfach die `decoPlacements`-
     * Referenz sein. Der erste Versuch tat genau das (Annahme: React-State-Array,
     * neue Referenz nur bei echter Änderung) — aber was hier ankommt, ist NICHT
     * der React-State direkt, sondern `alleDeko`, ein in GameContainer.jsx pro
     * Spielschleife wiederverwendetes Sammel-Array (`alleDeko.length = 0` + neu
     * befüllen JEDES Bildes) — dieselbe Referenz bei JEDEM Frame, egal ob sich
     * am Inhalt etwas geändert hat. Damit hätte der Cache sich nach dem ersten
     * Aufbau NIE wieder aktualisiert: neu gesetzte oder entfernte Bodenkacheln
     * wären auf dem Bildschirm einfach nicht mehr aufgetaucht. Deshalb hier ein
     * simpler Inhalts-Fingerabdruck (Kennung + Drehung jeder Belag-Kachel dieses
     * Grundstücks) statt eines Referenzvergleichs — kostet einen Durchlauf über
     * die Liste, aber ohne die vielen drawImage-Aufrufe ist das immer noch
     * deutlich billiger als das alte Verhalten.
     *
     * Kein Viewport-Culling nötig: die Fläche ist ohnehin auf die Größe des
     * Grundstücks begrenzt, nicht auf die riesige Weltkarte.
     */
    // `slotDeko`: schon auf dieses Grundstück eingegrenzt (siehe _gruppiereDekoNachSlot)
    // — hier nur noch die Bodenbeläge aus dieser bereits kleinen Liste herausfiltern.
    _getBodenLayer(slot, drawY, slotDeko) {
        const belaege = slotDeko.filter(istBoden);
        const fingerabdruck = belaege.map((d) => `${d.id}:${d.rotation || 0}`).join("|");

        const cached = this._bodenLayerCache.get(slot.id);
        if (cached && cached.fingerabdruck === fingerabdruck) return cached.canvas;

        const { territoryWidth, territoryHeight } = MAP_CONFIG;
        const layer = document.createElement("canvas");
        layer.width = territoryWidth;
        layer.height = territoryHeight;
        const lctx = layer.getContext("2d");
        if (!lctx) return null;

        // Kachel für Kachel statt einmal über die ganze Fläche gestreckt: eine
        // 2×1-Platte würde sonst in die Breite gezogen und passte nicht mehr zur
        // Nachbarkachel derselben Sorte.
        const seite = Math.ceil(TILE_SIZE) + 1;
        for (const deco of belaege) {
            const x = Number(deco?.x);
            const y = Number(deco?.y);
            if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
            const img = this._getImage(deco.image);
            if (!img) continue;
            const dw = deco.width || 1;
            const dh = deco.height || 1;
            for (let cx = 0; cx < dw; cx++) {
                for (let cy = 0; cy < dh; cy++) {
                    // In lokale Layer-Koordinaten statt Weltkoordinaten — der
                    // Layer beginnt bei (slot.x, drawY).
                    const left = x - slot.x - TILE_SIZE / 2 + cx * TILE_SIZE;
                    const top = y - drawY - TILE_SIZE / 2 - cy * TILE_SIZE;
                    // Aufgerundet und um ein Pixel überlappend gezeichnet: bei
                    // gebrochenem Zoom lässt Canvas sonst Haarrisse zwischen den
                    // Kacheln stehen, und die sieht man auf einer Fläche sofort.
                    if (deco.rotation) {
                        // Nur bei 1×1-Belägen gesetzt (siehe platziereDeko in
                        // GameContainer.jsx) — um die Kachelmitte drehen, sonst
                        // rutscht die Textur beim Drehen aus ihrer Kachel heraus.
                        lctx.save();
                        lctx.translate(left + TILE_SIZE / 2, top + TILE_SIZE / 2);
                        lctx.rotate((deco.rotation * Math.PI) / 180);
                        lctx.drawImage(img, -seite / 2, -seite / 2, seite, seite);
                        lctx.restore();
                    } else {
                        lctx.drawImage(img, Math.floor(left), Math.floor(top), seite, seite);
                    }
                }
            }
        }

        this._bodenLayerCache.set(slot.id, { fingerabdruck, canvas: layer });
        return layer;
    }

    // `slotDeko`: schon auf dieses Grundstück eingegrenzt (siehe _gruppiereDekoNachSlot).
    _collectDeco(bucket, slot, drawY, slotDeko, viewLeft, viewTop, viewRight, viewBottom) {
        if (slotDeko.length === 0) return;
        for (const deco of slotDeko) {
            // Beläge sind schon über _getBodenLayer durch — sie gehören unter alles
            // und dürfen deshalb nicht noch einmal in die Tiefensortierung.
            if (istBoden(deco)) continue;
            const x = Number(deco?.x); // Mitte der unten-links liegenden Ankerkachel
            const y = Number(deco?.y);
            if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
            const dw = deco.width || 1;
            const dh = deco.height || 1;
            // Sichtbare Mitte: nach rechts um (dw-1)/2, nach oben um (dh-1)/2 Kacheln
            const visualX = x + ((dw - 1) * TILE_SIZE) / 2;
            const visualY = y - ((dh - 1) * TILE_SIZE) / 2;
            const randFaktor = DEKO_VOLL.has(deco.decoId) ? 1 : 0.9;
            const drawSize = TILE_SIZE * Math.max(dw, dh) * randFaktor;
            if (visualX + drawSize < viewLeft || visualX - drawSize > viewRight ||
                visualY + drawSize < viewTop || visualY - drawSize > viewBottom) continue;
            const entry = this._poolEntry();
            entry.kind = "deco";
            entry.ref = deco;
            entry.x = visualX;
            entry.y = visualY;
            entry.size = drawSize;
            // Fußpunkt = Unterkante der Ankerkachel
            entry.baseY = y + TILE_SIZE / 2;
            bucket.push(entry);

            // Leuchtet das Stück nachts? Der Leuchtpunkt sitzt nicht in der Bildmitte,
            // sondern dort, wo die Flamme ist — bei der Laterne oben am Mast.
            const licht = DEKO_LICHT[deco.decoId];
            if (licht) this._lichter.push({ x: visualX, y: entry.baseY - licht.hoehe, licht });
        }
    }

    /**
     * Bildpfad einer Deko.
     *
     * `view` stammt aus der alten Ansichten-Mechanik und kommt bei NEUEN Platzierungen
     * nicht mehr vor — [R] spiegelt jetzt nur noch. Für bereits gesetzte Deko wird die
     * Variante weiterhin gesucht (`deco/teich.png` → `deco/teich_right.png`), damit
     * bestehende Gärten unverändert aussehen. Fehlt sie, bleibt das Grundbild stehen.
     */
    _resolveDecoImage(deco) {
        const base = deco?.image;
        if (!base) return base;
        const view = deco.view;
        if (!view || view === "front") return base;
        const variant = base.replace(/\.png$/i, `_${view}.png`);
        const status = this._bildStatus(variant);
        if (status === "error") return base;          // Variante gibt es nicht
        if (!status) this._getImage(variant);         // Laden anstoßen
        return status === "ready" ? variant : base;
    }

    _drawDecoItem(entry) {
        const deco = entry.ref;
        // Bewusst KEIN Bodenschatten: Deko sitzt oft flach auf dem Boden (Pool, Teich),
        // ein Schatten darunter sah aus, als würde das Wasser schweben.
        const src = this._resolveDecoImage(deco);

        // `rotation` bei NICHT-Belägen gibt es nur noch aus alten Spielständen
        // (rotation/view) — neue Platzierungen tragen dafür ausschließlich
        // `mirrored`. Bodenbeläge nutzen `rotation` dagegen aktiv (siehe [R] in
        // GameContainer.jsx), landen aber nie hier: sie werden in _getBodenLayer
        // gezeichnet, das dieselbe Drehung eigenständig anwendet.
        const spin = Number(deco.rotation) || 0;
        if (spin) {
            const { ctx } = this;
            ctx.save();
            ctx.translate(entry.x, entry.y);
            ctx.rotate((spin * Math.PI) / 180);
            this._drawImageOrEmojiContain(src, deco.emoji || "", 0, 0, entry.size);
            ctx.restore();
            return;
        }
        // Gespiegelt: neu über `mirrored`, bei alter Deko über die Ansicht „links".
        if (deco.mirrored || deco.view === "left") {
            const { ctx } = this;
            ctx.save();
            ctx.translate(entry.x, entry.y);
            ctx.scale(-1, 1);
            this._drawImageOrEmojiContain(src, deco.emoji || "", 0, 0, entry.size);
            ctx.restore();
            return;
        }
        this._drawImageOrEmojiContain(src, deco.emoji || "", entry.x, entry.y, entry.size);
    }

    /**
     * Editor (11.11.): die Deko in der Hand folgt dem Mauszeiger, eingerastet auf die
     * Kachel, auf der sie landen würde — gespiegelt bzw. gedreht genau so, wie [R] sie
     * gerade stellt. So sieht man vor dem Setzen, wie das Stück dort aussieht.
     * `v` = { deco, x, y } mit (x, y) = Mitte der Ankerkachel unten links (wie platzierte Deko).
     */
    _drawDekoVorschau(v) {
        const deco = v?.deco;
        if (!deco || !Number.isFinite(v.x) || !Number.isFinite(v.y)) return;
        const { ctx } = this;
        const dw = deco.width || 1;
        const dh = deco.height || 1;
        const links = v.x - TILE_SIZE / 2;
        const oben = v.y + TILE_SIZE / 2 - dh * TILE_SIZE;
        const dick = 2 / (this._zoom || 1);
        ctx.save();
        ctx.globalAlpha = 0.82;
        if (istBoden(deco)) {
            const img = this._getImage(deco.image);
            if (img) {
                for (let cx = 0; cx < dw; cx++) for (let cy = 0; cy < dh; cy++) {
                    ctx.save();
                    ctx.translate(v.x + cx * TILE_SIZE, v.y - cy * TILE_SIZE);
                    if (deco.rotation) ctx.rotate((deco.rotation * Math.PI) / 180);
                    ctx.drawImage(img, -TILE_SIZE / 2, -TILE_SIZE / 2, TILE_SIZE, TILE_SIZE);
                    ctx.restore();
                }
            }
        } else {
            const e = this._vorschauEintrag || (this._vorschauEintrag = { ref: null, x: 0, y: 0, size: 0 });
            e.ref = deco;
            e.x = v.x + ((dw - 1) * TILE_SIZE) / 2;
            e.y = v.y - ((dh - 1) * TILE_SIZE) / 2;
            e.size = TILE_SIZE * Math.max(dw, dh) * (DEKO_VOLL.has(deco.decoId) ? 1 : 0.9);
            this._drawDecoItem(e);
        }
        // Fußabdruck: welche Kacheln das Stück belegt
        ctx.globalAlpha = 1;
        ctx.lineWidth = dick * 2;
        ctx.strokeStyle = "rgba(43, 29, 18, 0.7)";
        ctx.strokeRect(links, oben, dw * TILE_SIZE, dh * TILE_SIZE);
        ctx.lineWidth = dick;
        ctx.strokeStyle = "#ffd84a";
        ctx.strokeRect(links, oben, dw * TILE_SIZE, dh * TILE_SIZE);
        ctx.restore();
    }

    /**
     * Kachelraster des Editors — pulsiert, damit es sich vom Untergrund abhebt,
     * ohne ihn zuzudecken.
     *
     * Bewusst NICHT in den zwischengespeicherten Bodenlayer: der wird nur bei
     * Änderungen neu gebaut, ein Pulsieren bräuchte ihn jeden Frame neu. Hier sind
     * es ein paar hundert Linien pro Bild, das kostet nichts.
     */
    _drawEditorRaster(slot, drawY) {
        const { ctx } = this;
        const { territoryWidth, territoryHeight } = MAP_CONFIG;
        const spalten = Math.round(territoryWidth / TILE_SIZE);
        const reihen = Math.round(territoryHeight / TILE_SIZE);
        // 0.5 … 0.8 in etwa zwei Sekunden
        const puls = 0.5 + 0.15 * (1 + Math.sin(this.frame * 0.05));
        // 11.11.: Das Raster war herausgezoomt kaum zu sehen (ein Strich von einem Weltpunkt
        // ist bei Zoom 0,5 nur noch ein halber Bildpunkt, dazu Violett auf braunem Acker).
        // Jetzt immer zwei Bildpunkte dick: dunkel unterlegt, hell obenauf.
        const dick = 2 / (this._zoom || 1);

        ctx.save();
        ctx.lineWidth = dick * 2;
        ctx.strokeStyle = "rgba(43, 29, 18, 0.35)";
        ctx.beginPath();
        for (let i = 0; i <= spalten; i++) {
            const x = Math.round(slot.x + i * TILE_SIZE);
            ctx.moveTo(x, drawY);
            ctx.lineTo(x, drawY + territoryHeight);
        }
        for (let j = 0; j <= reihen; j++) {
            const y = Math.round(drawY + j * TILE_SIZE);
            ctx.moveTo(slot.x, y);
            ctx.lineTo(slot.x + territoryWidth, y);
        }
        ctx.stroke();
        ctx.lineWidth = dick;
        ctx.strokeStyle = `rgba(255, 243, 196, ${puls.toFixed(3)})`;
        ctx.beginPath();
        for (let i = 0; i <= spalten; i++) {
            const x = Math.round(slot.x + i * TILE_SIZE) + 0.5;
            ctx.moveTo(x, drawY);
            ctx.lineTo(x, drawY + territoryHeight);
        }
        for (let j = 0; j <= reihen; j++) {
            const y = Math.round(drawY + j * TILE_SIZE) + 0.5;
            ctx.moveTo(slot.x, y);
            ctx.lineTo(slot.x + territoryWidth, y);
        }
        ctx.stroke();

        // Aussenkante kräftiger — sie sagt, wie weit das eigene Grundstück reicht.
        ctx.lineWidth = dick * 2;
        ctx.strokeStyle = `rgba(167, 139, 250, ${Math.min(1, puls + 0.25).toFixed(3)})`;
        ctx.strokeRect(slot.x, drawY, territoryWidth, territoryHeight);
        ctx.restore();
    }

    _getSlotStaticLayer(slot, drawY, unlockedCells) {
        const { territoryWidth, territoryHeight, baseDirtWidth, baseDirtHeight, dirtOffsetX } = MAP_CONFIG;
        const dirtCols = Math.round(baseDirtWidth / TILE_SIZE);
        const dirtRows = Math.round(baseDirtHeight / TILE_SIZE);
        // Muss zu EXTRA_ROWS in MapConfig.js passen — dort steht auch, warum es
        // STEIN_REIHEN Reihen sind und wo die Querwege liegen (istSteinfeldWegRow).
        const EXTRA_ROWS = STEIN_REIHEN;
        const normalizedUnlocked = [...new Set(unlockedCells)].sort().join("|");
        const cacheKey = `${slot.owner || ""}:${normalizedUnlocked}:${slot.isTopRow ? 1 : 0}`;
        const cached = this._slotStaticCache.get(slot.id);
        if (cached?.cacheKey === cacheKey) return cached.canvas;

        const layer = document.createElement("canvas");
        layer.width = territoryWidth;
        layer.height = territoryHeight;
        const lctx = layer.getContext("2d");
        if (!lctx) return null;

        lctx.save();
        lctx.translate(-slot.x, -drawY);

        // Territory grass tiles
        for (let gy = drawY; gy < drawY + territoryHeight; gy += TILE_SIZE) {
            for (let gx = slot.x; gx < slot.x + territoryWidth; gx += TILE_SIZE) {
                const tileX = Math.floor((gx - slot.x) / TILE_SIZE);
                const tileY = Math.floor((gy - drawY) / TILE_SIZE);
                this._drawTerrainTile("grass", gx, gy, tileX, tileY, slot.id, TILE_SIZE, lctx);
            }
        }

        // Grundstücksgrenze: bevorzugt ein Zaunbild, sonst die alte Linie.
        // Der Zaun wird nur an den SEITEN gestapelt — oben und unten grenzen die
        // Grundstücke an den Kiesweg bzw. den Weltrand, dort stünde er im Weg.
        //
        // BUGFIX (Look & Map, v2): stand beide Male genau HALB ausserhalb des
        // Layer-Canvas — `lctx` ist exakt territoryWidth breit (siehe
        // `layer.width = territoryWidth` oben), der Zaun wurde aber MITTIG auf die
        // Kante gesetzt (`slot.x - drawW/2` bzw. `... + territoryWidth - drawW/2`).
        // Nach dem translate(-slot.x, -drawY) landet das bei lokal -drawW/2 bzw.
        // territoryWidth + drawW/2 — je zur Hälfte vom Canvas abgeschnitten. Der
        // Zaun stand also faktisch nie sichtbar da, nur ein paar Pixel schmaler
        // Rand blieben übrig. Jetzt bündig INNERHALB der Grenze, wächst nach innen.
        // 07.11.: Pixelzaun aus engine/pixelBoden.js statt des gemalten fence_v.png.
        const fence = pixelZaun(this._saison);
        if (fence) {
            const fw = fence.width;
            const fh = fence.height;
            const drawH = TILE_SIZE;
            const drawW = fw * (drawH / fh);
            for (let fy = drawY; fy < drawY + territoryHeight; fy += drawH) {
                const h = Math.min(drawH, drawY + territoryHeight - fy);
                const sh = fh * (h / drawH);
                lctx.drawImage(fence, 0, 0, fw, sh, slot.x, fy, drawW, h);
                lctx.drawImage(fence, 0, 0, fw, sh, slot.x + territoryWidth - drawW, fy, drawW, h);
            }
        } else {
            lctx.strokeStyle = slot.owner ? "#86efac" : "#166534";
            lctx.lineWidth = slot.owner ? 3 : 2;
            lctx.strokeRect(slot.x, drawY, territoryWidth, territoryHeight);
        }

        const dirtX = slot.x + dirtOffsetX;
        const dirtY = slot.isTopRow ? slot.anchorY - baseDirtHeight - TILE_SIZE : drawY + TILE_SIZE;
        const unlockedSet = new Set(unlockedCells);

        for (let cy = 0; cy < dirtRows; cy++) {
            for (let cx = 0; cx < dirtCols; cx++) {
                const cellX = dirtX + cx * TILE_SIZE;
                const cellY = dirtY + cy * TILE_SIZE;
                if (cx === 7 || cy === 7) {
                    const woodImg = this._terrainBild("wood", "wood.png");
                    if (woodImg) {
                        lctx.drawImage(woodImg, cellX, cellY, TILE_SIZE, TILE_SIZE);
                    } else {
                        lctx.fillStyle = "#92400e";
                        lctx.fillRect(cellX, cellY, TILE_SIZE, TILE_SIZE);
                    }
                } else {
                    this._drawTerrainTile("field", cellX + 1, cellY + 1, cx, cy, slot.id, TILE_SIZE - 2, lctx);
                    lctx.strokeStyle = "rgba(0,0,0,0.3)";
                    lctx.lineWidth = 1;
                    lctx.strokeRect(cellX, cellY, TILE_SIZE, TILE_SIZE);
                }
            }
        }

        for (let cx = 0; cx < dirtCols; cx++) {
            for (let r = 1; r <= EXTRA_ROWS; r++) {
                const cellX = dirtX + cx * TILE_SIZE;
                const isTop = slot.isTopRow;
                const cellY = isTop ? (dirtY - r * TILE_SIZE) : (dirtY + baseDirtHeight + (r - 1) * TILE_SIZE);
                const logicalY = isTop ? -r : (dirtRows + r - 1);
                const key = `${cx}_${logicalY}`;
                if (cx === 7 || istSteinfeldWegRow(r)) {
                    const woodImg = this._terrainBild("wood", "wood.png");
                    if (woodImg) {
                        lctx.drawImage(woodImg, cellX, cellY, TILE_SIZE, TILE_SIZE);
                    } else {
                        lctx.fillStyle = "#92400e";
                        lctx.fillRect(cellX, cellY, TILE_SIZE, TILE_SIZE);
                    }
                } else {
                    this._drawExpansionCell(cellX, cellY, unlockedSet.has(key), cx === 0 && r === 1, cx, logicalY, slot.id, lctx);
                }
            }
        }

        const expandedY = slot.isTopRow ? (dirtY - EXTRA_ROWS * TILE_SIZE) : dirtY;
        const expandedH = baseDirtHeight + EXTRA_ROWS * TILE_SIZE;
        lctx.strokeStyle = "rgba(15,23,42,0.8)";
        lctx.lineWidth = 2;
        lctx.strokeRect(dirtX, expandedY, baseDirtWidth, expandedH);

        lctx.restore();
        this._slotStaticCache.set(slot.id, { cacheKey, canvas: layer });
        return layer;
    }

    _collectPlants(bucket, slot, drawY, viewLeft, viewTop, viewRight, viewBottom, dirtOffsetX, baseDirtHeight, baseDirtWidth) {
        const dirtX = slot.x + dirtOffsetX;
        const dirtY = slot.isTopRow ? slot.anchorY - baseDirtHeight - TILE_SIZE : drawY + TILE_SIZE;
        const dirtyRight = dirtX + baseDirtWidth;
        // Grobe Sichtprüfung für das ganze Grundstück. MUSS die volle Erweiterung
        // abdecken: mit einer Reihe zu wenig verschwinden die Pflanzen der äußersten
        // Steinreihe, sobald nur noch sie im Bild ist.
        const dirtyTop = slot.isTopRow ? dirtY - STEIN_REIHEN * TILE_SIZE : dirtY;
        const dirtyBottom = slot.isTopRow ? (dirtY + baseDirtHeight) : (dirtY + baseDirtHeight + STEIN_REIHEN * TILE_SIZE);
        if (dirtyRight < viewLeft || dirtX > viewRight || dirtyBottom < viewTop || dirtyTop > viewBottom) return;

        const plants = slot.plants;
        if (!plants) return;
        for (const key in plants) {
            const plant = plants[key];
            if (!plant) continue;
            const sep = key.indexOf("_");
            if (sep < 0) continue;
            const cx = Number(key.slice(0, sep));
            const cy = Number(key.slice(sep + 1));
            if (!Number.isInteger(cx) || !Number.isInteger(cy)) continue;
            const cellX = dirtX + cx * TILE_SIZE;
            const cellY = dirtY + cy * TILE_SIZE;
            if (cellX + TILE_SIZE < viewLeft || cellX > viewRight || cellY + TILE_SIZE < viewTop || cellY > viewBottom) continue;
            const entry = this._poolEntry();
            entry.kind = "plant";
            entry.plant = plant;
            entry.cellX = cellX;
            entry.cellY = cellY;
            entry.slotId = slot.id;
            entry.cacheKey = key; // vorhandener Zellschlüssel — keine Zeichenkette pro Frame
            // Fußpunkt der Pflanze = Unterkante ihrer Kachel
            entry.baseY = cellY + TILE_SIZE;
            bucket.push(entry);
        }
    }

    _collectPets(bucket, slot, petPlacements, drawY) {
        if (!Array.isArray(petPlacements) || petPlacements.length === 0) return;
        const slotIndex = slot.id - 1;
        for (const pet of petPlacements) {
            if (pet?.slotIndex !== slotIndex) continue;
            const entry = this._poolEntry();
            entry.kind = "pet";
            entry.ref = pet;
            entry.x = Number.isFinite(pet.x) ? pet.x : slot.x + MAP_CONFIG.territoryWidth / 2;
            entry.y = Number.isFinite(pet.y) ? pet.y : drawY + MAP_CONFIG.territoryHeight / 2;
            // Fußpunkt wächst mit der Art mit — ein Pferd steht tiefer als ein Huhn und
            // gehört in der Tiefensortierung entsprechend weiter nach vorn.
            entry.baseY = entry.y + 14 * getPetSize(pet.name);
            bucket.push(entry);
        }
    }

    /**
     * Laufbilder eines Tieres: /garden-assets/animals/<name>/1.png und 2.png
     * (auch .jpg). Gibt es den Ordner nicht, bleibt es beim Einzelbild — Tiere
     * ohne eigene Sprites behalten also die bisherige Feder-Animation.
     *
     * Das Ergebnis wird je Tierart gemerkt, damit nicht jeder Frame neu probiert wird.
     */
    /**
     * Ladezustand eines Bildes.
     *
     * MUSS über versionedAsset gehen: _getImage legt den Eintrag unter der Adresse
     * MIT Versionsanhang ab. Eine Abfrage mit dem rohen Pfad traf deshalb nie etwas —
     * genau daran sind die Laufbilder gescheitert (jeder Frame hielt sich für den
     * Erstkontakt, stiess das Laden erneut an und zeichnete weiter das Einzelbild).
     */
    _bildStatus(rawSrc) {
        return this._imageCache.get(versionedAsset(rawSrc))?.status || null;
    }

    _resolvePetFrames(baseImage) {
        const m = /\/animals\/([^/.]+)\.(?:png|jpg|jpeg)$/i.exec(baseImage || "");
        if (!m) return null;
        const slug = m[1];
        const gemerkt = this._petFrameCache.get(slug);
        if (gemerkt !== undefined) return gemerkt;

        for (const ext of ["png", "jpg"]) {
            const ordner = "/garden-assets/animals/" + slug + "/";
            // 07.11.: <id>.png ist byte-gleich mit <id>/1.png (beide schreibt farmArtUebernehmen)
            // und ohnehin schon geladen — sonst lädt jedes Tier dasselbe Bild zweimal.
            const f1 = ext === "png" ? "/garden-assets/animals/" + slug + ".png" : ordner + "1." + ext;
            const f2 = ordner + "2." + ext;
            const status = this._bildStatus(f1);
            if (!status) {
                // Erstkontakt: Laden anstoßen, diesen Frame noch statisch zeichnen
                this._getImage(f1);
                this._getImage(f2);
                return null;
            }
            if (status === "loading") return null;
            if (status === "ready") {
                // Erst wenn BEIDE Bilder da sind — sonst blinkt der zweite Schritt
                // beim ersten Durchlauf durch ein fehlendes Bild.
                const s2 = this._bildStatus(f2);
                if (!s2 || s2 === "loading") return null;
                const frames = s2 === "ready" ? [f1, f2] : [f1, f1];
                this._petFrameCache.set(slug, frames);
                return frames;
            }
            // status === "error" → nächste Endung versuchen
        }
        this._petFrameCache.set(slug, null); // keine Laufbilder vorhanden
        return null;
    }
    _drawPetItem(entry) {
        const { ctx, frame } = this;
        const pet = entry.ref;
        const x = entry.x;
        const y = entry.y;
        const facingRight = pet.facingRight !== false;
        const moving = Math.abs(Number(pet.vx) || 0) + Math.abs(Number(pet.vy) || 0) > 0.15;

        // Eigener Phasenversatz pro Tier, damit eine Herde nicht im Gleichschritt hüpft
        const phase = hashUnit(pet.id || `${Math.round(x)}_${Math.round(y)}`) * Math.PI * 2;
        // Laufende Tiere federn schneller und höher als grasende
        const bobSpeed = moving ? 0.22 : 0.06;
        const bobHeight = moving ? 3.2 : 1.1;
        // 10.11.: Tiere bleiben zwischendurch stehen, fressen und schlafen nachts
        // (pet.tut aus der Spielschleife). Während der Party hüpfen sie im Takt.
        const tut = moving ? null : (pet.tut || null);
        const zeit = (this._frameNow || 0) / 1000;
        const takt = (this._party || 0) > 0.35 && tut !== "schlaeft" ? partyTakt((this._frameNow || 0) + phase * 80) : null;
        const sprung = takt ? Math.sin(Math.min(1, takt.phase * 1.5) * Math.PI) : 0;
        const bob = takt ? -sprung * 7 : tut === "schlaeft" ? 0 : Math.sin(frame * bobSpeed + phase) * bobHeight;
        // Beim Laufen leicht in Bewegungsrichtung kippen; beim Fressen den Kopf senken und nicken
        const lean = takt ? (takt.schlag % 2 ? 0.1 : -0.1) * sprung
            : moving ? Math.sin(frame * bobSpeed + phase) * 0.05
                : tut === "frisst" ? (facingRight ? 1 : -1) * (0.2 + Math.sin(zeit * 7 + phase) * 0.06) : 0;
        // Laufen: im Schritt leicht strecken und stauchen; Schlafen: flach liegen und langsam atmen
        const streck = moving ? 1 + Math.sin(frame * bobSpeed * 2 + phase) * 0.035
            : tut === "schlaeft" ? 0.8 + Math.sin(zeit * 1.3 + phase) * 0.025
                : takt ? 1 + sprung * 0.06 : 1;

        // Laufbilder wechseln nur in Bewegung; im Stand bleibt Bild 1 stehen.
        const frames = this._resolvePetFrames(pet.image);
        const src = frames
            ? (moving ? frames[Math.floor(this.frame / 9) % 2] : frames[0])
            : pet.image;
        // Mit echten Laufbildern braucht es kaum Federung — sonst hüpft es doppelt.
        const bobUsed = frames && !takt ? bob * 0.3 : bob;

        // Jede Art hat ihre eigene Größe (siehe PET_SIZE_BY_TYPE). Schatten und
        // Namensschild wachsen mit, sonst schwebt ein Drache über einem Hühnerschatten.
        const groesse = getPetSize(pet.name);
        const box = PET_BASIS_GROESSE * groesse;

        this._drawGroundShadow(
            x, y + 14 * groesse,
            (12 - (moving ? bobUsed * 0.4 : 0)) * groesse, 5 * groesse, 0.85,
        );

        ctx.save();
        // Drehen und Strecken um die Füße, nicht um die Bildmitte
        const fuss = box * 0.42;
        ctx.translate(x, y + bobUsed + fuss);
        ctx.rotate(frames && moving ? lean * 0.4 : lean);
        ctx.scale(facingRight ? 1 : -1, streck);
        ctx.translate(0, -fuss);
        if (src) {
            // Tiere können wie Pflanzen golden oder regenbogenfarben sein.
            const overlay = this._resolveItemOverlay(null, pet.specialType || null);
            const img = overlay ? this._getImage(src) : null;
            if (overlay && img) {
                const nw = Math.max(1, img.naturalWidth || img.width);
                const nh = Math.max(1, img.naturalHeight || img.height);
                const sc = Math.min(box / nw, box / nh);
                const dw = nw * sc;
                const dh = nh * sc;
                this._drawTintedImage(img, -dw / 2, -dh / 2, dw, dh, overlay);
            } else {
                this._drawImageOrEmojiContain(src, pet.emoji || "", 0, 0, box);
            }
        } else {
            ctx.font = `${Math.round(28 * groesse)}px serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(pet.emoji || "", 0, 0);
        }
        // Tierhut aus dem Gold-Shop (engine/huete.js) — auf dem Kopf, der in Blickrichtung liegt
        const tierhut = this._tierhutJeSlot?.[pet.slotIndex];
        if (tierhut) zeichneHut(ctx, tierhut, box * 0.2, -box * 0.3, box * 0.42);
        ctx.restore();

        if (tut === "schlaeft") this._drawSchlafZ(x + (facingRight ? 1 : -1) * box * 0.28, y - box * 0.3, zeit + phase);

        // Namensschild — nicht mitspiegeln, deshalb erst nach dem restore().
        // Steht auch auf fremden Grundstücken, damit Besucher die Tiere benennen sehen.
        if (!this._renderProfile?.simplifyPlantUi) {
            const label = String(pet.customName || pet.name || "").trim();
            if (label) this._drawPetNameTag(x, y - TILE_SIZE * 0.34 * groesse + bob, label, pet.specialType);
        }
    }

    /** Drei kleine „z“ steigen über einem schlafenden Tier auf. */
    _drawSchlafZ(x, y, zeit) {
        const { ctx } = this;
        ctx.save();
        for (let i = 0; i < 3; i++) {
            const u = (zeit * 0.45 + i / 3) % 1;
            const g = 2 + Math.round(u * 1.2); // Punktgröße wächst beim Aufsteigen
            const zx = Math.round(x + u * 14 + Math.sin(u * 6 + i) * 3);
            const zy = Math.round(y - u * 30);
            ctx.globalAlpha = Math.min(1, (1 - u) * 1.6);
            // erst dunkel um einen Punkt versetzt (Schatten), dann hell
            for (const [farbe, v] of [["#2b1d12", g], ["#fff3c4", 0]]) {
                ctx.fillStyle = farbe;
                ctx.fillRect(zx + v, zy + v, 3 * g, g);
                ctx.fillRect(zx + g + v, zy + g + v, g, g);
                ctx.fillRect(zx + v, zy + 2 * g + v, 3 * g, g);
            }
        }
        ctx.restore();
    }

    _drawPetNameTag(centerX, bottomY, label, specialType) {
        const { ctx } = this;
        const text = label.length > 16 ? `${label.slice(0, 15)}…` : label;
        ctx.save();
        ctx.font = "bold 10px 'GfZiffern', 'Pixelify Sans', Nunito, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const w = Math.ceil(ctx.measureText(text).width) + 12;
        const h = 15;
        const x = centerX - w / 2;
        const y = bottomY - h;
        ctx.fillStyle = "rgba(15,23,42,0.85)";
        ctx.strokeStyle = specialType === "Golden" ? "rgba(251,191,36,0.9)"
            : specialType === "Rainbow" ? "rgba(232,121,249,0.9)"
            : "rgba(148,163,184,0.5)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, 4);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#e2e8f0";
        ctx.fillText(text, centerX, y + h / 2 + 0.5);
        ctx.restore();
    }

    /** Weicher Bodenschatten — trägt am meisten dazu bei, dass Objekte "aufstehen" statt zu schweben. */
    _drawGroundShadow(cx, cy, rx, ry, alphaScale = 1) {
        if (rx <= 0 || ry <= 0) return;
        const { ctx } = this;
        ctx.save();
        ctx.globalAlpha = alphaScale;
        ctx.fillStyle = SHADOW_COLOR;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    /**
     * Overlay-Durchgang: kleiner schwebender Marker über jeder erntereifen Pflanze.
     * Läuft nach der sortierten Liste, damit ein hoher Nachbar eine fertige Ernte
     * niemals verstecken kann.
     */
    /**
     * Pixelpfeil über reifen Pflanzen (06.11., Wunsch „fertige Pflanzen besser markieren“):
     * vorher ein kleines blasses Dreieck, das man auf vollem Acker übersah. Jetzt ein
     * Pfeil mit dunklem Umriss in der Seltenheitsfarbe, der hüpft — und in der Draufsicht
     * zusätzlich helle Eckmarken auf der Ackerzelle.
     */
    _reifPfeil(farbe) {
        if (!this._reifPfeilCache) this._reifPfeilCache = new Map();
        const fertig = this._reifPfeilCache.get(farbe);
        if (fertig) return fertig;
        const M = [
            "..xxxxx..",
            "..xfffx..",
            "..xfffx..",
            "xxxfffxxx",
            "xfffffffx",
            ".xfffffx.",
            "..xfffx..",
            "...xfx...",
            "....x....",
        ];
        const P = 3;
        const c = document.createElement("canvas");
        c.width = M[0].length * P; c.height = M.length * P;
        const g = c.getContext("2d");
        for (let y = 0; y < M.length; y++) {
            for (let x = 0; x < M[y].length; x++) {
                const z = M[y][x];
                if (z === ".") continue;
                g.fillStyle = z === "x" ? "#2b1d12" : farbe;
                g.fillRect(x * P, y * P, P, P);
            }
        }
        // Lichtkante oben links
        g.fillStyle = "rgba(255,255,255,0.55)";
        g.fillRect(3 * P, 1 * P, P, 2 * P);
        this._reifPfeilCache.set(farbe, c);
        return c;
    }

    _drawReadyMarkers(bucket) {
        if (this._renderProfile?.simplifyPlantUi) return;
        const { ctx } = this;
        const now = this._frameNow;
        const flach = !this._stehend3d;
        for (let i = 0; i < bucket.length; i++) {
            const entry = bucket[i];
            if (entry.kind !== "plant") continue;
            const plant = entry.plant;
            if (!isPlantReadyForRender(plant, now)) continue;

            const profile = getPlantArchetype(plant.seedId);
            const farbe = RARITY_COLORS[plant.rarity] || "#facc15";
            const cx = entry.cellX + TILE_SIZE / 2;
            const topY = entry.cellY + TILE_SIZE * 0.95 - profile.heightTiles * TILE_SIZE - 14;
            // Hüpfen in ganzen Schritten wirkt pixeliger als ein weiches Schweben
            const hopser = Math.round(Math.abs(Math.sin(now / 260 + cx * 0.013)) * 5);
            const bild = this._reifPfeil(farbe);
            const glatt = ctx.imageSmoothingEnabled;
            ctx.imageSmoothingEnabled = false;
            if (flach) {
                // Eckmarken auf der Zelle
                const x0 = entry.cellX + 3, y0 = entry.cellY + 3, w = TILE_SIZE - 6, L = 9, D = 3;
                ctx.fillStyle = "rgba(255, 243, 196, 0.85)";
                ctx.fillRect(x0, y0, L, D); ctx.fillRect(x0, y0, D, L);
                ctx.fillRect(x0 + w - L, y0, L, D); ctx.fillRect(x0 + w - D, y0, D, L);
                ctx.fillRect(x0, y0 + w - D, L, D); ctx.fillRect(x0, y0 + w - L, D, L);
                ctx.fillRect(x0 + w - L, y0 + w - D, L, D); ctx.fillRect(x0 + w - D, y0 + w - L, D, L);
            }
            ctx.drawImage(bild, Math.round(cx - bild.width / 2), Math.round(topY - bild.height - hopser));
            ctx.imageSmoothingEnabled = glatt;
        }
    }

    // Zeichnet nur den Untergrund einer Erweiterungszelle (Acker bzw. Stein).
    // Pflanzen darin laufen über die normale Tiefenliste in _collectPlants — dieser
    // Aufruf kam ausschließlich aus dem statischen Slot-Layer und bekam nie eine Pflanze.
    _drawExpansionCell(cellX, cellY, unlocked, isFirstInRow, logicalX, logicalY, slotId, targetCtx = this.ctx) {
        const ctx = targetCtx;
        const { frame } = this;
        if (unlocked) {
            this._drawTerrainTile("field", cellX + 1, cellY + 1, logicalX, logicalY, slotId, TILE_SIZE - 2, ctx);
            ctx.strokeStyle = "rgba(0,0,0,0.3)";
            ctx.lineWidth = 1;
            ctx.strokeRect(cellX, cellY, TILE_SIZE, TILE_SIZE);
            return;
        }

        const pulse = 0.5 + 0.5 * Math.sin(frame * 0.08);
        this._drawTerrainTile("rock", cellX + 1, cellY + 1, logicalX, logicalY, slotId, TILE_SIZE - 2, ctx);
        ctx.fillStyle = `rgba(30,41,59,${0.2 + pulse * 0.18})`;
        ctx.fillRect(cellX + 1, cellY + 1, TILE_SIZE - 2, TILE_SIZE - 2);
        ctx.strokeStyle = "rgba(0,0,0,0.35)";
        ctx.lineWidth = 1;
        ctx.strokeRect(cellX, cellY, TILE_SIZE, TILE_SIZE);
        if (isFirstInRow) {
            ctx.fillStyle = "rgba(255,255,255,0.9)";
            ctx.font = "bold 18px 'GfZiffern', 'Pixelify Sans', Nunito, sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("⛏️", cellX + TILE_SIZE / 2, cellY + TILE_SIZE / 2);
            ctx.textAlign = "left";
            ctx.textBaseline = "alphabetic";
        }
    }
    /**
     * Zustandssignatur einer Pflanze als ZAHL statt als String.
     *
     * Vorher wurde pro Pflanze und Frame ein Template-String gebaut und mit dem
     * Zellschlüssel zu einem zweiten String verkettet. Bei ~200 Pflanzen und 60 FPS
     * sind das rund 24.000 Wegwerf-Strings pro Sekunde — reine GC-Last für eine
     * Information, die in 20 Bit passt.
     */
    _getPlantSignature(plant, now) {
        const progress = Math.min(20, Math.max(0, Math.floor(getGrowthProgressForRender(plant, now) * 20)));
        let ready = 0;
        let total = 0;
        const slots = plant.fruitSlots;
        if (slots) {
            total = Math.min(15, slots.length);
            for (let i = 0; i < slots.length; i++) {
                if ((slots[i]?.readyAt || 0) <= now) ready++;
            }
            ready = Math.min(15, ready);
        }
        const stage = plant.stage === "structure" ? 0
            : plant.stage === "fruiting" ? 1
            : plant.stage === "growing" ? 2 : 3;
        const special = plant.specialType === "Golden" ? 1 : plant.specialType === "Rainbow" ? 2 : 0;
        const effect = plant.statusEffect === "wet" ? 1
            : plant.statusEffect === "frozen" ? 2
            : plant.statusEffect === "charged" ? 3
            : plant.statusEffect === "moonlit" ? 4 : 0;
        return progress | (ready << 5) | (total << 9) | (stage << 13) | (special << 15) | (effect << 17);
    }

    /** Windphase aus den Zellkoordinaten — spart den String-Hash pro Pflanze und Frame. */
    _swayPhase(cellX, cellY) {
        let h = Math.imul(cellX | 0, 374761393) ^ Math.imul(cellY | 0, 668265263);
        h ^= h >>> 13;
        h = Math.imul(h, 1274126177);
        h ^= h >>> 16;
        return ((h >>> 0) / 4294967295) * Math.PI * 2;
    }

    /** Pflanzen-Cache je Grundstück, damit als Schlüssel der bereits vorhandene Zell-String reicht. */
    _slotPlantCache(slotId) {
        let map = this._plantCache.get(slotId);
        if (!map) {
            // Eine Welt hat 6 Grundstücke (Feedback 01.09.: war 8) — die alte
            // Grenze von 16 wurde damit NIE erreicht, und der Cache eines
            // verlassenen Slots blieb für immer liegen (bis zu PLANT_CACHE_MAX
            // Offscreen-Canvases). Beim Wechsel des eigenen Grundstücks summierte
            // sich das über eine Sitzung.
            if (this._plantCache.size >= 6) {
                const aeltester = this._plantCache.keys().next().value;
                const alt = this._plantCache.get(aeltester);
                if (alt) for (const entry of alt.values()) freigeben(entry?.canvas);
                this._plantCache.delete(aeltester);
            }
            map = new Map();
            this._plantCache.set(slotId, map);
        }
        return map;
    }

    /**
     * Alles freigeben, was über den Frame hinaus lebt.
     *
     * Es gab bisher gar keine Aufräummethode: der Spielschleifen-Effekt hat nur
     * den InputHandler zerstört. Jede Renderer-Instanz hält aber die dekodierten
     * Bilder, je Grundstück bis zu PLANT_CACHE_MAX Offscreen-Canvases, die
     * grundstücksgroßen Statik-Ebenen und die Stützgerüste. Noch laufende
     * img.onload-Closures halten die Instanz zusätzlich am Leben, deshalb werden
     * die Handler hier ausdrücklich gelöst und die Canvas-Maße auf null gesetzt —
     * das gibt den Speicher sofort frei statt irgendwann.
     */
    /**
     * Bodenspuren der Jahreszeit für ein Grundstück, zwischengespeichert. Halbe
     * Auflösung: die Spuren sind klein und weich, die volle Fläche wären ~12 MB je
     * Grundstück. Neu gemalt nur, wenn Saison, Schneewetter oder Größe wechseln.
     */
    _getSaisonBodenLayer(slot, breite, hoehe) {
        const saison = this._saison;
        if (!saison || this._renderProfile?.simplifyPlantUi) return null;
        const schnee = this._weather?.type === "snow" ? 1 : 0;
        const key = `${saison}:${schnee}:${breite}x${hoehe}`;
        const alt = this._saisonBodenCache.get(slot.id);
        if (alt?.key === key) return alt.canvas;
        const AUFLOESUNG = 0.5;
        const layer = alt?.canvas || document.createElement("canvas");
        layer.width = Math.ceil(breite * AUFLOESUNG);
        layer.height = Math.ceil(hoehe * AUFLOESUNG);
        const lctx = layer.getContext("2d");
        lctx.clearRect(0, 0, layer.width, layer.height);
        lctx.save();
        lctx.scale(AUFLOESUNG, AUFLOESUNG);
        zeichneSaisonBoden(lctx, saison, {
            loX: 0, hiX: breite, loY: 0, hiY: hoehe, maxX: breite, maxY: hoehe, salz: slot.id,
        }, TILE_SIZE, this._weather?.type);
        lctx.restore();
        this._saisonBodenCache.set(slot.id, { key, canvas: layer });
        return layer;
    }

    destroy() {
        for (const eintrag of this._saisonBodenCache.values()) freigeben(eintrag?.canvas);
        this._saisonBodenCache.clear();
        for (const slotCache of this._plantCache.values()) {
            for (const entry of slotCache.values()) freigeben(entry?.canvas);
            slotCache.clear();
        }
        this._plantCache.clear();
        for (const eintrag of this._slotStaticCache.values()) freigeben(eintrag?.canvas);
        this._slotStaticCache.clear();
        for (const canvas of this._supportCache.values()) freigeben(canvas);
        this._supportCache.clear();
        for (const eintrag of this._imageCache.values()) {
            if (!eintrag?.img) continue;
            eintrag.img.onload = null;
            eintrag.img.onerror = null;
            eintrag.img.src = "";
        }
        this._imageCache.clear();
        this._atlasFrames.clear();
        this._tileVariantCache.clear();
        this._plantGeoCache.clear();
        this._petFrameCache.clear();
        freigeben(this._tintScratch);
        this._tintScratchCtx = null;
        freigeben(this._nachtLayer);
        this._nachtLayer = null;
        this._nachtLayerCtx = null;
        this._atlasImage = null;
        this._weltCache.clear();
        this._renderBucket.length = 0;
        this._renderPool.length = 0;
        this._lichter.length = 0;
        this._drawnRemotes.clear();
        this._remotePlayers = null;
        this._splatter.length = 0;
        this.ctx = null;
    }

    /**
     * Cache-Maße pro Archetyp. Breite fix (2 Kacheln), Höhe nach maximaler Wuchshöhe —
     * ein Salat braucht keine Baum-Leinwand. Der Fußpunkt liegt bei (w/2, h - pad),
     * damit Stützgerüst und Körper deckungsgleich geblittet werden können.
     */
    _plantGeometry(archetypeKey) {
        let geo = this._plantGeoCache.get(archetypeKey);
        if (geo) return geo;
        const profile = ARCHETYPE_PROFILES[archetypeKey] || ARCHETYPE_PROFILES.leafy;
        const h = Math.max(96, Math.ceil(((profile.heightTiles + 0.35) * TILE_SIZE) / 32) * 32);
        geo = { w: TILE_SIZE * 2, h, pad: 6 };
        this._plantGeoCache.set(archetypeKey, geo);
        return geo;
    }

    /** Aktuelle sichtbare Höhe in px — teilen sich Körper, Stützgerüst, Früchte und Reife-Marker. */
    _plantVisualHeight(plant, profile, now) {
        const full = TILE_SIZE * profile.heightTiles;
        if (plant.singleUse) {
            const progress = getGrowthProgressForRender(plant, now);
            if (progress < 0.2) return TILE_SIZE * 0.45;
            const phase = Math.max(0, Math.min(1, (progress - 0.2) / 0.8));
            return full * visualScaleFromPlantNorm(plant.norm) * (0.30 + phase * 0.70);
        }
        const structureProgress = plant.structureGrowthMs
            ? Math.max(0, Math.min(1, (now - (plant.plantedAt || now)) / plant.structureGrowthMs))
            : 1;
        const inStructure = plant.stage === "structure" || now < (plant.structureReadyAt || now);
        if (inStructure && structureProgress < 0.2) return TILE_SIZE * 0.45;
        const phase = inStructure ? Math.max(0, Math.min(1, (structureProgress - 0.2) / 0.8)) : 1;
        return full * (0.35 + phase * 0.65);
    }

    /**
     * Zeichnet den Pflanzenkörper mit Fußpunkt (baseX, baseY); für Offscreen-Cache.
     * Kein shadowBlur / kein Puls-Rand (nur in _drawPlant auf Main-Canvas).
     */
    _renderPlantBodyLocal(plant, baseX, baseY, now, simplifyPlantUi, profile, geo) {
        const progress = getGrowthProgressForRender(plant, now);
        const ready = isPlantReadyForRender(plant, now);
        const rarityColor = RARITY_COLORS[plant.rarity] || "#94a3b8";
        // Immer ableiten statt aus dem Pflanzenobjekt lesen: gespeicherte Pfade sind
        // veraltet, sobald sich die Zuordnung Wuchsform -> Struktur aendert.
        const visuals = getPlantVisuals(plant.seedId, plant.singleUse);
        const isSeedling = progress < 0.2;
        const targetH = this._plantVisualHeight(plant, profile, now);
        const maxW = TILE_SIZE * profile.widthScale * 1.15;

        // Feedback 30.08.: "themed samen" — jede Sorte bekommt ihr eigenes seed.png
        // statt eines gemeinsamen Bildes. Bis wirklich jede der ~57 Sorten eins hat,
        // weicht dieser eine Fleck auf das alte gemeinsame Bild aus, statt leer zu
        // bleiben: _bildStatus prüft nur den ZULETZT bekannten Ladezustand (kein
        // Nachladen), das eigene Bild wird trotzdem ganz normal über _getImage in
        // drawAnchored() unten angestoßen.
        const semenBild = this._bildStatus(visuals.plantedSeedImage) === "error"
            ? visuals.plantedSeedFallbackImage
            : visuals.plantedSeedImage;

        // Höhe führt, Breite begrenzt: dadurch bleibt ein Baum schlank und hoch statt
        // die ganze Nachbarreihe zuzudecken.
        const drawAnchored = (src, emoji, heightPx, widthCap) => {
            const img = this._getImage(src);
            if (img) {
                const nw = Math.max(1, img.naturalWidth || img.width);
                const nh = Math.max(1, img.naturalHeight || img.height);
                let dh = heightPx;
                let dw = nw * (dh / nh);
                if (dw > widthCap) {
                    dw = widthCap;
                    dh = nh * (dw / nw);
                }
                this.ctx.drawImage(img, baseX - dw / 2, baseY - dh, dw, dh);
            } else {
                this.ctx.font = `${Math.max(12, Math.floor(heightPx))}px serif`;
                this.ctx.textAlign = "center";
                this.ctx.textBaseline = "bottom";
                this.ctx.fillText(emoji || "", baseX, baseY);
            }
        };

        // Single-use: kompletter Körper. Multi-use: nur Struktur (Früchte dynamisch in _drawPlant).
        if (isSeedling && plant.singleUse) {
            drawAnchored(semenBild, "", targetH, TILE_SIZE * 0.6);
        } else if (plant.singleUse) {
            drawAnchored(visuals.growthImage, plant.emoji, targetH, maxW);
        } else {
            const inStructure = plant.stage === "structure" || now < (plant.structureReadyAt || now);
            const structureProgress = plant.structureGrowthMs
                ? Math.max(0, Math.min(1, (now - (plant.plantedAt || now)) / plant.structureGrowthMs))
                : 1;
            if (inStructure && structureProgress < 0.2) {
                drawAnchored(semenBild, "", targetH, TILE_SIZE * 0.6);
            } else {
                drawAnchored(visuals.structureImage || visuals.growthImage, plant.emoji, targetH, maxW);
            }
        }

        // Tint overlay baked into cache (gold / rainbow / weather effect).
        // Only baked for single-use plants — multi-use structures stay neutral and
        // the overlay is applied per-fruit in _drawPlant (only the fruit gets tinted, not the structure).
        if (!simplifyPlantUi && plant.singleUse) {
            const effect = plant?.statusEffect || null;
            const specialName = plant?.specialType || plant?.specialData?.name || null;
            const overlay = this._resolveItemOverlay(effect, specialName);
            if (overlay) {
                this._drawTintOverlay(this.ctx, overlay, 0, 0, geo.w, geo.h);
            }
        }

        if (!ready && !simplifyPlantUi) {
            const barW = TILE_SIZE - 8;
            const barH = 4;
            const barX = baseX - barW / 2;
            const barY = baseY - 5;
            this.ctx.fillStyle = "rgba(0,0,0,0.5)";
            this.ctx.fillRect(barX, barY, barW, barH);
            this.ctx.fillStyle = rarityColor;
            this.ctx.fillRect(barX, barY, barW * progress, barH);
        }
    }

    _drawPlant(plant, cellX, cellY, slotId, cellKey) {
        const simplifyPlantUi = Boolean(this._renderProfile?.simplifyPlantUi);
        const now = this._frameNow;
        const archetypeKey = getPlantArchetypeKey(plant.seedId);
        const profile = ARCHETYPE_PROFILES[archetypeKey] || ARCHETYPE_PROFILES.leafy;
        const geo = this._plantGeometry(archetypeKey);
        const cache = this._slotPlantCache(slotId);
        const signature = this._getPlantSignature(plant, now);

        const baseX = cellX + TILE_SIZE / 2;
        const baseY = cellY + TILE_SIZE * 0.95;
        const blitX = baseX - geo.w / 2;
        const blitY = baseY - (geo.h - geo.pad);
        const spriteH = this._plantVisualHeight(plant, profile, now);

        // Rahmen auf der Kachel nur in der Draufsicht — in 3D stünde er aufrecht hinter
        // der Pflanze; dort zeigt das Reife-Dreieck darüber, dass geerntet werden kann.
        const flachUi = !simplifyPlantUi && !this._stehend3d;
        if (isPlantReadyForRender(plant, now) && flachUi) {
            const pulse = 0.5 + 0.5 * Math.sin(this.frame * 0.08);
            this.ctx.save();
            this.ctx.strokeStyle = RARITY_COLORS[plant.rarity] || "#94a3b8";
            this.ctx.lineWidth = 1.5 + pulse * 2;
            this.ctx.strokeRect(cellX + 1, cellY + 1, TILE_SIZE - 2, TILE_SIZE - 2);
            this.ctx.fillStyle = `${RARITY_COLORS[plant.rarity] || "#94a3b8"}18`;
            this.ctx.fillRect(cellX + 1, cellY + 1, TILE_SIZE - 2, TILE_SIZE - 2);
            this.ctx.restore();
        }

        // Bodenschatten: verankert die Pflanze im Acker statt sie schweben zu lassen
        if (!simplifyPlantUi) {
            const shadowR = TILE_SIZE * profile.shadow * 0.40;
            this._drawGroundShadow(baseX, baseY - 3, shadowR, shadowR * 0.34, 0.9);
        }

        // Reife Früchte mit Sonderform bekommen einen kleinen Ring auf der Kachel,
        // damit man auf einen Blick sieht, dass an DIESEM Strauch etwas Besonderes hängt.
        if (flachUi && !plant.singleUse && Array.isArray(plant.fruitSlots)) {
            let goldene = 0;
            let regenbogen = 0;
            for (const s of plant.fruitSlots) {
                if (!s || (s.readyAt || 0) > now || !s.specialType) continue;
                if (s.specialType === "Golden") goldene++;
                else if (s.specialType === "Rainbow") regenbogen++;
            }
            if (goldene || regenbogen) {
                this.ctx.save();
                this.ctx.lineWidth = 2;
                this.ctx.strokeStyle = regenbogen ? "#e879f9" : "#fbbf24";
                this.ctx.strokeRect(cellX + 3, cellY + 3, TILE_SIZE - 6, TILE_SIZE - 6);
                this.ctx.restore();
            }
        }

        // Stützgerüst: bewusst OHNE Wind — ein Spalier schwankt nicht mit der Ranke mit
        if (USE_PROCEDURAL_SUPPORTS && !simplifyPlantUi && profile.support !== "none" && spriteH > TILE_SIZE * 0.5) {
            const support = this._getSupportLayer(archetypeKey, profile, spriteH, geo);
            if (support) this.ctx.drawImage(support, blitX, blitY);
        }

        // Structure canvas (cached; fruits drawn dynamically below).
        // Der Zellschlüssel existiert bereits — es wird pro Frame kein String erzeugt.
        let entry = cache.get(cellKey);
        if (!entry || entry.signature !== signature || entry.seedId !== plant.seedId) {
            if (!entry) {
                if (cache.size > PLANT_CACHE_MAX) cache.clear();
                entry = { signature: -1, seedId: null, canvas: document.createElement("canvas") };
                cache.set(cellKey, entry);
            }
            const oc = entry.canvas;
            if (oc.width !== geo.w || oc.height !== geo.h) {
                oc.width = geo.w;
                oc.height = geo.h;
            }
            const octx = oc.getContext("2d");
            if (octx) {
                octx.clearRect(0, 0, geo.w, geo.h);
                const prev = this.ctx;
                this.ctx = octx;
                try {
                    this._renderPlantBodyLocal(plant, geo.w / 2, geo.h - geo.pad, now, simplifyPlantUi, profile, geo);
                } finally {
                    this.ctx = prev;
                }
            }
            entry.signature = signature;
            entry.seedId = plant.seedId;
        }

        // 1. Körper zeichnen — bei Wind um den Fußpunkt gekippt, sodass die Pflanze
        //    im Boden verwurzelt bleibt und nur die Krone mitgeht.
        const sway = simplifyPlantUi ? 0 : profile.sway;
        if (sway > 0.01) {
            const phase = this._swayPhase(cellX, cellY);
            const angle = Math.sin(this.frame * 0.021 + phase) * sway * 0.035;
            this.ctx.save();
            this.ctx.translate(baseX, baseY);
            this.ctx.rotate(angle);
            this.ctx.drawImage(entry.canvas, blitX - baseX, blitY - baseY);
            this.ctx.restore();
        } else {
            this.ctx.drawImage(entry.canvas, blitX, blitY);
        }

        // 2. For multi-use: draw each fruit dynamically with weather + per-slot special effect
        if (!plant.singleUse && Array.isArray(plant.fruitSlots)) {
            const inStructure = plant.stage === "structure" || now < (plant.structureReadyAt || now);
            if (!inStructure && plant.fruitSlots.length > 0) {
                const visuals = getPlantVisuals(plant.seedId, plant.singleUse);
                const slotCount = plant.fruitSlots.length;
                const cycle = Math.max(1, plant.fruitCycleMs || 60000);
                const maxSlotsToDraw = simplifyPlantUi ? Math.min(2, slotCount) : Math.min(MAX_VISIBLE_FRUITS, slotCount);
                // Früchte hängen in der Krone der jeweiligen Wuchsform, nicht pauschal
                // eine halbe Kachel über dem Boden.
                const canopyY = baseY - spriteH * profile.canopy;
                const radius = Math.min(spriteH * 0.30, TILE_SIZE * 0.42);
                const img = this._getImage(visuals.fruitImage);

                for (let i = 0; i < maxSlotsToDraw; i++) {
                    const slot = plant.fruitSlots[i];
                    const angle = (Math.PI * 2 * i) / slotCount - Math.PI / 2;
                    const fx = baseX + Math.cos(angle) * radius;
                    // Flacher Bogen statt Kreis: mit 0.7 lag die oberste Frucht deutlich
                    // ueber der Laubzone und schwebte ueber der Pflanze.
                    const fy = canopyY + Math.sin(angle) * radius * 0.42;

                    const slotProgress = Math.max(0, Math.min(1, 1 - ((slot.readyAt || now) - now) / cycle));
                    const sizeScaleFruit = visualScaleFromFruitSize(slot.size);
                    // Beim Stilwechsel (Fahrplan Phase 3) mit randlos gezeichneten Früchten auf
                    // 0.12 + 0.3 senken — sonst decken sechs reife Früchte die Krone zu.
                    const fruitSize = TILE_SIZE * (0.12 + slotProgress * 0.4) * sizeScaleFruit;

                    // Overlay je Frucht: Sonderform UND Wetter-Effekt hängen am Fruchtstand,
                    // nicht an der Staude — zwei Früchte am selben Strauch können also
                    // unterschiedlich aussehen.
                    const fruitSpecial = (!simplifyPlantUi && slot.specialType) || null;
                    const fruitEffect = slot.statusEffect || null;
                    const overlay = simplifyPlantUi ? null : this._resolveItemOverlay(fruitEffect, fruitSpecial);

                    if (img) {
                        const nw = Math.max(1, img.naturalWidth || img.width);
                        const nh = Math.max(1, img.naturalHeight || img.height);
                        const scale = fruitSize / Math.max(nw, nh);
                        const dw = nw * scale;
                        const dh = nh * scale;
                        const dx = fx - dw / 2;
                        const dy = fy - dh / 2;
                        if (overlay) {
                            this._drawTintedImage(img, dx, dy, dw, dh, overlay);
                        } else {
                            this.ctx.drawImage(img, dx, dy, dw, dh);
                        }
                    } else {
                        this.ctx.save();
                        this.ctx.font = `${Math.floor(fruitSize)}px serif`;
                        this.ctx.textAlign = "center";
                        this.ctx.textBaseline = "middle";
                        this.ctx.fillText(plant.emoji, fx, fy);
                        this.ctx.restore();
                    }
                }
            }
        }
    }

    /**
     * Stützgerüst-Layer. Hängt nur an (Archetyp, Höhenstufe) — ein einziges Spalier-Canvas
     * bedient alle Gurken auf dem Acker. 13 Archetypen × 6 Stufen = höchstens 78 Canvases.
     */
    _getSupportLayer(archetypeKey, profile, spriteH, geo) {
        const maxH = TILE_SIZE * profile.heightTiles;
        const step = Math.max(0, Math.min(5, Math.round((spriteH / maxH) * 5)));
        const cacheKey = `${archetypeKey}:${step}`;
        const cached = this._supportCache.get(cacheKey);
        if (cached !== undefined) return cached;

        const canvas = document.createElement("canvas");
        canvas.width = geo.w;
        canvas.height = geo.h;
        const sctx = canvas.getContext("2d");
        if (!sctx) {
            this._supportCache.set(cacheKey, null);
            return null;
        }
        const h = maxH * (step / 5);
        this._paintSupport(sctx, profile.support, geo.w / 2, geo.h - geo.pad, h, TILE_SIZE * profile.widthScale * 0.5);
        this._supportCache.set(cacheKey, canvas);
        return canvas;
    }

    /** Prozedurale Wuchsgerüste — das ist es, was Gurke, Kirschbaum und Karotte auf einen Blick trennt. */
    _paintSupport(ctx, kind, cx, baseY, h, halfW) {
        if (!kind || kind === "none" || h <= 6) return;
        ctx.save();
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        if (kind === "trunk") {
            const trunkH = h * 0.5;
            const w = Math.max(3, h * 0.085);
            ctx.fillStyle = SUPPORT_COLORS.wood;
            ctx.beginPath();
            ctx.moveTo(cx - w * 1.5, baseY);
            ctx.lineTo(cx - w * 0.5, baseY - trunkH);
            ctx.lineTo(cx + w * 0.5, baseY - trunkH);
            ctx.lineTo(cx + w * 1.5, baseY);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = SUPPORT_COLORS.woodLight;
            ctx.fillRect(cx - w * 0.45, baseY - trunkH, w * 0.42, trunkH);
            ctx.strokeStyle = SUPPORT_COLORS.wood;
            ctx.lineWidth = Math.max(2, w * 0.55);
            ctx.beginPath();
            ctx.moveTo(cx, baseY - trunkH * 0.78);
            ctx.lineTo(cx - h * 0.16, baseY - trunkH * 1.05);
            ctx.moveTo(cx, baseY - trunkH * 0.6);
            ctx.lineTo(cx + h * 0.15, baseY - trunkH * 0.95);
            ctx.stroke();
        } else if (kind === "palm") {
            const trunkH = h * 0.66;
            ctx.strokeStyle = SUPPORT_COLORS.wood;
            ctx.lineWidth = Math.max(4, h * 0.075);
            ctx.beginPath();
            ctx.moveTo(cx, baseY);
            ctx.quadraticCurveTo(cx - h * 0.07, baseY - trunkH * 0.55, cx - h * 0.05, baseY - trunkH);
            ctx.stroke();
            ctx.strokeStyle = SUPPORT_COLORS.woodLight;
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            for (let i = 1; i <= 5; i++) {
                const t = i / 6;
                const y = baseY - trunkH * t;
                const x = cx - h * 0.07 * t;
                ctx.moveTo(x - h * 0.035, y);
                ctx.lineTo(x + h * 0.035, y);
            }
            ctx.stroke();
        } else if (kind === "trellis") {
            const postH = h * 0.92;
            const sp = halfW * 0.85;
            ctx.strokeStyle = SUPPORT_COLORS.wood;
            ctx.lineWidth = Math.max(2, h * 0.035);
            ctx.beginPath();
            ctx.moveTo(cx - sp, baseY); ctx.lineTo(cx - sp, baseY - postH);
            ctx.moveTo(cx + sp, baseY); ctx.lineTo(cx + sp, baseY - postH);
            ctx.stroke();
            ctx.strokeStyle = SUPPORT_COLORS.twine;
            ctx.lineWidth = Math.max(1, h * 0.016);
            ctx.beginPath();
            for (let i = 1; i <= 3; i++) {
                const y = baseY - postH * (i / 3.4);
                ctx.moveTo(cx - sp, y); ctx.lineTo(cx + sp, y);
            }
            ctx.moveTo(cx - sp, baseY - postH * 0.1); ctx.lineTo(cx + sp, baseY - postH * 0.88);
            ctx.moveTo(cx + sp, baseY - postH * 0.1); ctx.lineTo(cx - sp, baseY - postH * 0.88);
            ctx.stroke();
        } else if (kind === "canes") {
            ctx.strokeStyle = SUPPORT_COLORS.stemDark;
            ctx.lineWidth = Math.max(1.5, h * 0.032);
            ctx.beginPath();
            for (let i = 0; i < 5; i++) {
                const t = (i / 4 - 0.5) * 2;
                ctx.moveTo(cx, baseY);
                ctx.quadraticCurveTo(cx + t * halfW * 0.5, baseY - h * 0.8, cx + t * halfW * 1.05, baseY - h * 0.5);
            }
            ctx.stroke();
        } else if (kind === "post") {
            const postH = h * 0.85;
            const w = Math.max(3, h * 0.07);
            ctx.fillStyle = SUPPORT_COLORS.wood;
            ctx.fillRect(cx - w, baseY - postH, w * 2, postH);
            ctx.strokeStyle = SUPPORT_COLORS.twine;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            for (let i = 1; i <= 3; i++) {
                const y = baseY - postH * (i / 4);
                ctx.moveTo(cx - w * 2.4, y); ctx.lineTo(cx + w * 2.4, y);
            }
            ctx.stroke();
        } else if (kind === "stalks") {
            ctx.strokeStyle = SUPPORT_COLORS.stem;
            ctx.lineWidth = Math.max(2, h * 0.045);
            ctx.beginPath();
            for (let i = -1; i <= 1; i++) {
                ctx.moveTo(cx + i * halfW * 0.28, baseY);
                ctx.lineTo(cx + i * halfW * 0.52, baseY - h * 0.84);
            }
            ctx.stroke();
        } else if (kind === "stake") {
            // Nur ein schlanker Stab am Rand, keine quer über den Strauch gespannten
            // Schnüre mehr — die sahen aus wie „komische Sachen am Busch".
            const stakeH = h * 0.72;
            ctx.strokeStyle = SUPPORT_COLORS.wood;
            ctx.lineWidth = Math.max(2, h * 0.038);
            ctx.beginPath();
            ctx.moveTo(cx + halfW * 0.62, baseY);
            ctx.lineTo(cx + halfW * 0.52, baseY - stakeH);
            ctx.stroke();
        } else if (kind === "rosette") {
            ctx.strokeStyle = SUPPORT_COLORS.stemDark;
            ctx.lineWidth = Math.max(2, h * 0.07);
            ctx.beginPath();
            for (let i = 0; i < 7; i++) {
                const a = -Math.PI + (i / 6) * Math.PI;
                ctx.moveTo(cx, baseY - 2);
                ctx.lineTo(cx + Math.cos(a) * halfW * 0.9, baseY - 2 + Math.sin(a) * h * 0.45);
            }
            ctx.stroke();
        } else if (kind === "runners") {
            ctx.strokeStyle = SUPPORT_COLORS.stem;
            ctx.lineWidth = Math.max(1.5, h * 0.05);
            ctx.beginPath();
            for (let i = 0; i < 4; i++) {
                const t = (i / 3 - 0.5) * 2;
                ctx.moveTo(cx, baseY - 2);
                ctx.quadraticCurveTo(cx + t * halfW * 0.6, baseY - h * 0.3, cx + t * halfW * 1.1, baseY - 1);
            }
            ctx.stroke();
        } else if (kind === "mound") {
            ctx.fillStyle = SUPPORT_COLORS.soil;
            ctx.beginPath();
            ctx.ellipse(cx, baseY - 3, halfW * 0.9, h * 0.17, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = SUPPORT_COLORS.soilLight;
            ctx.beginPath();
            ctx.ellipse(cx, baseY - 5, halfW * 0.55, h * 0.10, 0, 0, Math.PI * 2);
            ctx.fill();
        } else if (kind === "stem") {
            ctx.strokeStyle = SUPPORT_COLORS.stem;
            ctx.lineWidth = Math.max(2, h * 0.05);
            ctx.beginPath();
            ctx.moveTo(cx, baseY);
            ctx.quadraticCurveTo(cx + h * 0.05, baseY - h * 0.45, cx, baseY - h * 0.82);
            ctx.stroke();
            ctx.strokeStyle = SUPPORT_COLORS.stemDark;
            ctx.lineWidth = Math.max(1.5, h * 0.035);
            ctx.beginPath();
            ctx.moveTo(cx, baseY - h * 0.4);
            ctx.quadraticCurveTo(cx - halfW * 0.5, baseY - h * 0.5, cx - halfW * 0.75, baseY - h * 0.34);
            ctx.moveTo(cx, baseY - h * 0.55);
            ctx.quadraticCurveTo(cx + halfW * 0.5, baseY - h * 0.64, cx + halfW * 0.72, baseY - h * 0.48);
            ctx.stroke();
        }

        ctx.restore();
    }

    /**
     * Draw an image with a tint overlay applied — using a scratch offscreen canvas
     * so the source-atop composite only affects the image's own pixels, not the
     * background already drawn on the main canvas.
     *
     * Used for multi-use fruits and held items, where the plant cache can't bake
     * the tint in advance. The scratch canvas is reused across calls (no allocation).
     */
    _drawTintedImage(img, dx, dy, dw, dh, overlay) {
        if (!img) return;
        if (!overlay) {
            this.ctx.drawImage(img, dx, dy, dw, dh);
            return;
        }
        const sw = Math.max(1, Math.ceil(dw));
        const sh = Math.max(1, Math.ceil(dh));
        // Grow scratch canvas if the item is larger than current scratch size
        if (this._tintScratch.width < sw || this._tintScratch.height < sh) {
            this._tintScratch.width = Math.max(this._tintScratch.width, sw, 128);
            this._tintScratch.height = Math.max(this._tintScratch.height, sh, 128);
        }
        const sctx = this._tintScratchCtx;
        // Clear only the area we'll use
        sctx.clearRect(0, 0, sw, sh);
        // Draw image into scratch
        sctx.drawImage(img, 0, 0, sw, sh);
        // Apply tint via source-atop — only image pixels get tinted (scratch bg is transparent)
        sctx.globalCompositeOperation = "source-atop";
        if (overlay.kind === "solid") {
            sctx.fillStyle = overlay.color;
            sctx.fillRect(0, 0, sw, sh);
        } else if (overlay.kind === "rainbow") {
            const grad = sctx.createLinearGradient(0, 0, 0, sh);
            grad.addColorStop(0.00, "rgba(255,  64,  64, 0.55)");
            grad.addColorStop(0.20, "rgba(255, 165,   0, 0.55)");
            grad.addColorStop(0.40, "rgba(255, 235,  59, 0.55)");
            grad.addColorStop(0.60, "rgba( 76, 175,  80, 0.55)");
            grad.addColorStop(0.80, "rgba( 33, 150, 243, 0.55)");
            grad.addColorStop(1.00, "rgba(156,  39, 176, 0.55)");
            sctx.fillStyle = grad;
            sctx.fillRect(0, 0, sw, sh);
        }
        sctx.globalCompositeOperation = "source-over";
        // Blit the tinted image back to main canvas
        this.ctx.drawImage(this._tintScratch, 0, 0, sw, sh, dx, dy, dw, dh);
    }

    /**
     * Resolve which tint overlay to apply for an item.
     * Returns a descriptor consumed by _drawTintOverlay/_drawTintedImage, or null if no overlay needed.
     *
     * Performance note:
     * The previous implementation used ctx.filter (sepia/saturate/hue-rotate) plus shadowBlur,
     * which is extremely expensive when applied per-plant per-frame on Canvas 2D.
     * This new approach replaces those filters with a single masked composite pass, which
     * the browser handles in a single GPU blit and which can be baked into the plant cache.
     */
    _resolveItemOverlay(effect, specialName) {
        // Special types take priority over weather
        if (specialName === "Golden") {
            return { kind: "solid", color: "rgba(250, 204, 21, 0.55)" };
        }
        if (specialName === "Rainbow") {
            return { kind: "rainbow" };
        }
        if (effect === "frozen")  return { kind: "solid", color: "rgba(186, 230, 253, 0.42)" };
        if (effect === "wet")     return { kind: "solid", color: "rgba(56, 189, 248, 0.32)" };
        if (effect === "charged") return { kind: "solid", color: "rgba(196, 181, 253, 0.38)" };
        if (effect === "moonlit") return { kind: "solid", color: "rgba(129, 140, 248, 0.32)" };
        return null;
    }

    /**
     * Apply a single-pass tinted overlay onto already-drawn pixels in the given rect.
     * Uses globalCompositeOperation = "source-atop" so only the visible pixels (the plant)
     * get tinted — transparent areas stay transparent. The clip() restricts the operation
     * to the given rect so neighboring already-drawn pixels are unaffected.
     *
     * This replaces ctx.filter + shadowBlur entirely. One drawRect/gradient pass per plant.
     */
    _drawTintOverlay(ctx, overlay, x, y, w, h) {
        if (!overlay) return;
        ctx.save();
        // Clip ensures source-atop only tints the rect we're drawing into,
        // not any previously-drawn pixels that happen to lie elsewhere.
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();
        ctx.globalCompositeOperation = "source-atop";
        if (overlay.kind === "solid") {
            ctx.fillStyle = overlay.color;
            ctx.fillRect(x, y, w, h);
        } else if (overlay.kind === "rainbow") {
            // Compress gradient to the lower 70% of the tile where the plant sprite actually lives
            const gradStart = y + h * 0.25;
            const gradEnd   = y + h * 0.95;
            const grad = ctx.createLinearGradient(0, gradStart, 0, gradEnd);
            grad.addColorStop(0.00, "rgba(255,  64,  64, 0.55)");
            grad.addColorStop(0.20, "rgba(255, 165,   0, 0.55)");
            grad.addColorStop(0.40, "rgba(255, 235,  59, 0.55)");
            grad.addColorStop(0.60, "rgba( 76, 175,  80, 0.55)");
            grad.addColorStop(0.80, "rgba( 33, 150, 243, 0.55)");
            grad.addColorStop(1.00, "rgba(156,  39, 176, 0.55)");
            ctx.fillStyle = grad;
            ctx.fillRect(x, y, w, h);
        }
        ctx.restore();
    }

    /**
     * Pfad einer Terrain-Kachel. Der Ordner haengt an der Grafik-Einstellung:
     * "alt" zieht aus structure/_original/, sonst aus structure/.
     */
    /**
     * Bodenkachel im Pixel-Look (engine/pixelBoden.js, 05.11.) statt der gemalten
     * Bilder — passend zur laufenden Jahreszeit, sofort da (kein Nachladen).
     */
    _terrainBild(kind, file) {
        return pixelBodenKachel(kind, file, this._saison);
    }

    /** Jahreszeit übernehmen; bei einem Wechsel den vorgemalten Boden neu malen lassen. */
    _setzeSaison(saison) {
        if (saison !== this._saison) {
            this._weltCache.clear();
            this._slotStaticCache.clear();
        }
        this._saison = saison;
    }

    _terrainSrc(kind, file) {
        return file ? STRUCTURE_DIR + file : null;
    }

    _getTileVariantIndex(kind, x, y, slotSeed, variantCount) {
        if (variantCount <= 1) return 0;
        const cacheKey = `${kind}:${slotSeed}:${x}:${y}`;
        const cached = this._tileVariantCache.get(cacheKey);
        if (cached !== undefined) return cached;

        // Patch-level hash (groups of ~4 tiles) → determines dominant variant in a patch
        const px = Math.floor(x / 4);
        const py = Math.floor(y / 4);
        let hp = (Math.imul((px + 7) | 0, 374761393) ^ Math.imul((py + 13) | 0, 668265263) ^ Math.imul((slotSeed + 23) | 0, 1274126177)) | 0;
        hp ^= hp >>> 13;
        hp = Math.imul(hp, 1274126177);
        hp ^= hp >>> 16;
        const patchBase = Math.abs(hp) % variantCount;

        // Per-tile noise decides if this tile deviates from its patch (20% chance)
        let ht = (Math.imul((x + 11) | 0, 374761393) ^ Math.imul((y + 17) | 0, 668265263)) | 0;
        ht ^= ht >>> 13;
        ht = Math.imul(ht, 1274126177);
        const tileNoise = (Math.abs(ht) & 0xff) / 255.0;

        const index = tileNoise < 0.2 ? (patchBase + 1) % variantCount : patchBase;
        this._tileVariantCache.set(cacheKey, index);
        return index;
    }

    _drawTerrainTile(kind, x, y, logicalX, logicalY, slotId, size = TILE_SIZE, targetCtx = this.ctx) {
        const files = TERRAIN_FILES[kind] || [];
        const variantCount = files.length || 1;
        // Acker und Steinfeld je Feld eine eigene Variante — die Felder haben ohnehin eine
        // Fuge dazwischen, gleiche Nachbarn sähen wie ein Stempelmuster aus.
        const variantIdx = kind === "field" || kind === "rock"
            ? Math.floor(weltHash(logicalX, logicalY, 77) * variantCount) % variantCount
            : this._getTileVariantIndex(kind, logicalX, logicalY, slotId, variantCount);
        const img = this._terrainBild(kind, files[variantIdx] || files[0]);
        if (img) {
            targetCtx.drawImage(img, x, y, size, size);
            return;
        }
        targetCtx.fillStyle = TERRAIN_FALLBACK_COLORS[kind] || (kind === "path" ? "#1e293b" : (kind === "tallGrass" ? "#14532d" : "#64748b"));
        targetCtx.fillRect(x, y, size, size);
    }

    _getImage(rawSrc) {
        if (!rawSrc) return null;
        // Zentrale Stelle fuer den Cache-Buster: alles, was auf die Leinwand kommt,
        // laeuft hier durch — Boden, Strukturen, Pflanzen, Deko, Tiere, Gebaeude.
        const src = versionedAsset(rawSrc);
        const cached = this._imageCache.get(src);
        if (cached) return cached.status === "ready" ? cached.img : null;
        const img = new Image();
        const entry = { status: "loading", img };
        this._imageCache.set(src, entry);
        img.onload = () => {
            entry.status = "ready";
            this._slotStaticCache.clear();
            for (const [k, v] of this._weltCache) if (!v.fertig) this._weltCache.delete(k);
            this._plantCache.clear();
            // Sonst bleibt eine Belag-Kachel, deren Bild beim ersten Aufbau des
            // Layers noch nicht geladen war, dauerhaft leer — der Cache-Schlüssel
            // ist die decoPlacements-Referenz, die sich durchs Nachladen eines
            // Bildes ja nicht ändert (siehe _getBodenLayer).
            this._bodenLayerCache.clear();
        };
        img.onerror = () => { entry.status = "error"; };
        img.src = src;
        return null;
    }

    _loadAtlas() {
        if (this._atlasLoadStarted) return;
        this._atlasLoadStarted = true;
        fetch(ATLAS_MANIFEST_SRC)
            .then((res) => (res.ok ? res.json() : null))
            .then((manifest) => {
                const frames = manifest?.frames && typeof manifest.frames === "object" ? manifest.frames : null;
                if (!frames) return;
                const atlas = new Image();
                atlas.onload = () => {
                    this._atlasImage = atlas;
                    this._atlasFrames.clear();
                    for (const [key, frame] of Object.entries(frames)) {
                        const x = Number(frame?.x);
                        const y = Number(frame?.y);
                        const w = Number(frame?.w);
                        const h = Number(frame?.h);
                        if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) continue;
                        this._atlasFrames.set(key, { x, y, w, h });
                    }
                    this._atlasLoaded = this._atlasFrames.size > 0;
                };
                atlas.onerror = () => {
                    this._atlasLoaded = false;
                    this._atlasImage = null;
                };
                atlas.src = manifest?.image || ATLAS_IMAGE_SRC;
            })
            .catch(() => {
                this._atlasLoaded = false;
                this._atlasImage = null;
            });
    }

    _drawFromAtlas(src, centerX, centerY, size) {
        if (!this._atlasLoaded || !this._atlasImage || !src) return false;
        const frame = this._atlasFrames.get(src);
        if (!frame) return false;
        const { ctx } = this;
        ctx.drawImage(
            this._atlasImage,
            frame.x, frame.y, frame.w, frame.h,
            centerX - size / 2, centerY - size / 2, size, size
        );
        return true;
    }

    _drawImageOrEmoji(src, emoji, centerX, centerY, size) {
        const { ctx } = this;
        if (this._drawFromAtlas(src, centerX, centerY, size)) return;
        
        // Bildladen anstoßen BEVOR wir den Lade-Status abfragen
        const img = this._getImage(src);

        if (this._bildStatus(src) === "loading") {
            return; // Gar nichts zeichnen, während das Bild lädt -> Verhindert Emoji-Flash!
        }

        if (img) {
            ctx.drawImage(img, centerX - size / 2, centerY - size / 2, size, size);
            return;
        }
        
        ctx.font = `${Math.max(12, Math.floor(size))}px serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(emoji || "🌱", centerX, centerY);
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
    }

    /** Wie _drawImageOrEmoji, aber Seitenverhältnis beibehalten (z. B. Hände / Shop-Icons). */
    _drawImageOrEmojiContain(src, emoji, centerX, centerY, maxBox) {
        const { ctx } = this;
        const m = maxBox;
        if (this._atlasLoaded && this._atlasImage && src) {
            const frame = this._atlasFrames.get(src);
            if (frame) {
                const ar = frame.w / frame.h;
                let dw = m;
                let dh = m;
                if (ar > 1) dh = m / ar;
                else dw = m * ar;
                ctx.drawImage(
                    this._atlasImage,
                    frame.x, frame.y, frame.w, frame.h,
                    centerX - dw / 2, centerY - dh / 2, dw, dh
                );
                return;
            }
        }
        
        // Auch hier das Bild zuerst anfragen
        const img = this._getImage(src);

        if (this._bildStatus(src) === "loading") {
            return;
        }

        if (img) {
            const nw = Math.max(1, img.naturalWidth || img.width);
            const nh = Math.max(1, img.naturalHeight || img.height);
            const sc = Math.min(m / nw, m / nh);
            const dw = nw * sc;
            const dh = nh * sc;
            ctx.drawImage(img, centerX - dw / 2, centerY - dh / 2, dw, dh);
            return;
        }
        
        ctx.font = `${Math.max(12, Math.floor(m * 0.9))}px serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(emoji || "🌱", centerX, centerY);
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
    }

    _drawSign(slot, centerX, centerY) {
        const { ctx } = this;
        const w = 180; const h = 36;
        // Gold-Shop-Reskin (core/reskins.js): dasselbe Farbschema wie die
        // schwebende Nametag über dem Kopf (_drawPlayerNametag) — Feedback
        // 01.09.: "Schild an der Farm mit dem Nametag über dem Kopf
        // synchronisieren, damit es auch den Skin bekommt". `slot.nameplateReskin`
        // kommt bei fremden Grundstücken aus der Momentaufnahme, beim eigenen
        // aus dem lokalen Stand (siehe GameContainer.jsx, wie mailboxReskin).
        const reskinFarbe = slot.owner ? (NAMEPLATE_RESKIN_FARBEN[slot.nameplateReskin] || null) : null;
        if (reskinFarbe) {
            const verlauf = ctx.createLinearGradient(centerX - w / 2, centerY, centerX + w / 2, centerY + h);
            verlauf.addColorStop(0, reskinFarbe.bg);
            verlauf.addColorStop(1, reskinFarbe.bg2 || reskinFarbe.bg);
            ctx.fillStyle = verlauf;
            ctx.strokeStyle = reskinFarbe.border;
        } else {
            ctx.fillStyle = "#92400e";
            ctx.strokeStyle = "#78350f";
        }
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(centerX - w / 2, centerY, w, h, 6);
        ctx.fill(); ctx.stroke();

        ctx.fillStyle = reskinFarbe ? reskinFarbe.text : "#fef3c7";
        ctx.font = "bold 14px 'GfZiffern', 'Pixelify Sans', Nunito, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const label = slot.owner ? `${slot.owner}` : "Zu verkaufen";
        ctx.fillText(label, centerX, centerY + h / 2);
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";

        // Draw Mailbox — Gold-Shop-Reskin (core/reskins.js) übersteuert das
        // Standardbild, wenn der Besitzer eins ausgerüstet hat. `slot.mailboxReskin`
        // kommt bei fremden Grundstücken aus der Momentaufnahme, beim eigenen aus
        // dem lokalen Stand (siehe GameContainer.jsx).
        if (slot.owner) {
            const mailboxSrc = MAILBOX_RESKIN_BILD[slot.mailboxReskin] || "/garden-assets/world/mailbox.png";
            const mailboxImg = this._getImage(mailboxSrc);
            if (mailboxImg) {
                // Preserve aspect ratio
                const imgRatio = mailboxImg.width / mailboxImg.height;
                const mbWidth = 40;
                const mbHeight = mbWidth / imgRatio;
                const mbX = centerX + w / 2 + 20;
                const mbY = centerY + h / 2 - mbHeight + 10;
                ctx.drawImage(mailboxImg, mbX, mbY, mbWidth, mbHeight);
                
                // Neue Post: seit es keinen Briefkasten-Knopf im HUD mehr gibt,
                // ist das hier die einzige Anzeige — deshalb groß, mit Anzahl und
                // leicht wippend, damit sie im Augenwinkel auffällt.
                if (slot.hasMail) {
                    const anzahl = Number(slot.postAnzahl) || 0;
                    const wipp = Math.sin(this.frame * 0.08) * 2.5;
                    const bx = mbX + mbWidth - 2;
                    const by = mbY - 4 + wipp;
                    ctx.fillStyle = "#dc2626";
                    ctx.strokeStyle = "#450a0a";
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.arc(bx, by, 10, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.stroke();
                    if (anzahl > 0) {
                        ctx.fillStyle = "#fff";
                        ctx.font = "bold 12px 'GfZiffern', 'Pixelify Sans', 'Baloo 2', sans-serif";
                        ctx.textAlign = "center";
                        ctx.textBaseline = "middle";
                        ctx.fillText(anzahl > 9 ? "9+" : String(anzahl), bx, by + 1);
                        ctx.textAlign = "left";
                        ctx.textBaseline = "alphabetic";
                    }
                }
            
                
            }
        }
    }

    /**
     * @param {number|null} playerY  Fußpunkt des Spielers
     * @param {"behind"|"front"|null} phase
     *
     * Gebäude wurden bisher pauschal NACH den Grundstücken gezeichnet — Inkubator und
     * Mülleimer stehen aber auf dem eigenen Acker und deckten den Charakter dadurch zu.
     * Jetzt entscheidet der Fußpunkt: was weiter oben steht, kommt vor den Spieler.
     */
    drawHubAreas(areas, readyEggsCount = 0) {
        if (!areas) return;
        // Auf einem Grundstueck stehende Bereiche sind schon einsortiert gezeichnet.
        const plotAreas = this._plotAreas || [];
        this._drawAreaBuilding(areas.seedShop, "#2563eb", "🌱", "Samen");
        this._drawAreaBuilding(areas.toolShop, "#9333ea", "🛠️", "Tools");
        this._drawAreaBuilding(areas.eggShop, "#0d9488", "🥚", "Eier");
        this._drawAreaBuilding(areas.decoShop, "#db2777", "🪴", "Deko");
        this._drawAreaBuilding(areas.market, "#ea580c", "💰", "Verkauf");
        this._drawAreaBuilding(areas.petMarket, "#b45309", "🐾", "Tier-Verkauf");
        // Feedback 30.08.: Missionsbrett. Bekommt noch ein echtes Holzschild-Bild;
        // bis dahin greift derselbe Notbild-Weg wie beim Schuppen vor seinem Bild.
        this._drawAreaBuilding(areas.questBoard, "#92400e", "📜", "Missionen");
        this._drawAreaBuilding(areas.goldShop, "#ca8a04", "🪙", "Gold-Shop");
        this._drawAreaBuilding(areas.haendler, "#1d4ed8", "📦", "Händler");
        this._drawAreaBuilding(areas.erntefest, "#c2410c", "🎃", "Erntefest");
        // Kiste, Vitrine, Mülleimer UND (seit Feedback 30.08.) der Inkubator wohnen
        // alle im selben Schuppen — readyEggsCount reicht durch, damit der Marker
        // weiß, ob über dem Dach ein "Ei fertig"-Schild schweben soll.
        if (!plotAreas.includes(areas.shed)) this._drawAreaBuilding(areas.shed, "#a16207", "🧰", "Schuppen", readyEggsCount);
    }

    _drawAreaBuilding(area, color, icon, label, readyEggsCount = 0) {
        // `aktiv: false` = kein Grundstück dafür (z. B. kein eigenes Schild)
        if (!area || area.aktiv === false) return;
        const { ctx, frame } = this;
        const image = this._getImage(area.image);

        const art = bauart(area);
        // Feedback 29.08.: "Tierverkauf und normaler Markt gleich groß machen" —
        // der Tier-Markt stand extra verkleinert (200×160 statt 290×235), ohne
        // dass dafür ein Grund erkennbar war. Beide Marktbuden am Kiesweg zählen
        // jetzt zur selben Größe, keine eigene Fallunterscheidung mehr nötig.
        // Der Schuppen (Kiste/Vitrine/Mülleimer) ist als 3×3-Kachel-Gebäude fest
        // auf 256×256 gedeckelt (4 Kacheln) — muss zu SCHUPPEN_KACHELN in gameConstants.jsx
        // passen (war 2×2/128, Feedback 30.08.: "sieht klein aus für ein Gebäude").
        const isShed = art === "shed";
        // Missionsbrett (Feedback 31.08.): 2×2-Kachel-Gebäude statt der vollen
        // Marktwagen-Größe — ein Schild an einem Pfosten, kein ganzer Stand.
        const isQuestBoard = art === "questBoard";
        const maxW = isShed ? 256 : isQuestBoard ? TILE_SIZE * 2 : 290;
        const maxH = isShed ? 256 : isQuestBoard ? TILE_SIZE * 2 : 235;

        if (image) {
            const naturalW = Math.max(1, image.naturalWidth || image.width || maxW);
            const naturalH = Math.max(1, image.naturalHeight || image.height || maxH);
            const scale = Math.min(maxW / naturalW, maxH / naturalH);
            const drawW = Math.round(naturalW * scale);
            const drawH = Math.round(naturalH * scale);
            // Gebäude auf einem Grundstück tragen einen Fußpunkt (Unterkante ihres
            // Fußabdrucks) und STEHEN darauf. Alles am Kiesweg hat keinen und bleibt
            // wie gehabt auf seiner Mitte zentriert.
            const oben = Number.isFinite(area.fussY)
                ? area.fussY - drawH
                : area.y - drawH / 2;
            ctx.drawImage(image, area.x - drawW / 2, oben, drawW, drawH);
            // Für den Pfeil über dem Ziel (_zielSpitze): wo das Bild wirklich liegt
            const b = area._bild || (area._bild = { x: 0, y: 0, w: 0, h: 0 });
            b.x = area.x - drawW / 2; b.y = oben; b.w = drawW; b.h = drawH;
            if (this._tuer?.area === area) this._maleTuer(area, image);
            if (isShed && readyEggsCount > 0) this._drawEierMarker(area.x, oben - 14, readyEggsCount);
            const marke = this._standMarken?.[art];
            if (marke) (this._markenListe || (this._markenListe = [])).push({ m: ctx.getTransform(), x: area.x, y: oben - 10, anzahl: marke, art });
            return;
        }
        const pulse = 0.5 + 0.5 * Math.sin(frame * 0.05);
        ctx.fillStyle = color;
        ctx.beginPath();

        const boxW = isShed ? 200 : isQuestBoard ? 140 : 375;
        const boxH = isShed ? 140 : isQuestBoard ? 100 : 264;
        const roofY = isShed ? 120 : isQuestBoard ? 85 : 225;
        const textY = isShed ? -6 : isQuestBoard ? -6 : -12;

        ctx.roundRect(area.x - boxW/2, area.y - boxH/2, boxW, boxH, 24);
        ctx.fill();
        ctx.strokeStyle = `rgba(255,255,255,${0.22 + pulse * 0.2})`;
        ctx.lineWidth = 3.5;
        ctx.stroke();

        ctx.fillStyle = "rgba(255,255,255,0.18)";
        ctx.beginPath();
        ctx.moveTo(area.x - (boxW/2 + 16), area.y - boxH/2);
        ctx.lineTo(area.x, area.y - roofY);
        ctx.lineTo(area.x + (boxW/2 + 16), area.y - boxH/2);
        ctx.fill();

        ctx.fillStyle = "#ffffff";
        ctx.font = (isShed || isQuestBoard) ? "bold 16px 'GfZiffern', 'Pixelify Sans', Nunito, sans-serif" : "bold 24px 'GfZiffern', 'Pixelify Sans', Nunito, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`${icon} ${label}`, area.x, area.y + textY);
        ctx.textAlign = "left";
        if (isShed && readyEggsCount > 0) this._drawEierMarker(area.x, area.y - roofY - 14, readyEggsCount);
    }

    /**
     * Offene Tür eines begehbaren Gebäudes (11.11., Haus und Gold-Shop): dunkler Innenraum
     * im Türrahmen, das Türblatt schwingt zur rechten Angel hin auf (das Original-Türbild,
     * schmaler werdend), und die Figur geht durch den Rahmen hinein bzw. heraus — oben vom
     * Türsturz abgeschnitten. `this._tuer` = { area, offen 0…1, figur: { weg 0…1, alpha,
     * phase, rechts } | null } kommt aus der Spielschleife (useSpielschleife, Eintritt).
     */
    _maleTuer(area, image) {
        const zustand = this._tuer;
        const f = Math.max(0, Math.min(1, Number(zustand?.offen) || 0));
        const t = tuerLage(area, this._tuerLage || (this._tuerLage = {}));
        if (!t || (f <= 0 && !zustand.figur)) return;
        const { ctx } = this;
        const w = t.x1 - t.x0;
        const h = t.y1 - t.y0;
        const glatt = ctx.imageSmoothingEnabled;
        ctx.save();
        tuerPfad(ctx, t);
        ctx.clip();
        // Innenraum: dunkel, vom Boden her in drei Stufen wärmer (Licht von drinnen)
        ctx.fillStyle = "#1a100a";
        ctx.fillRect(t.x0, t.y0, w, h);
        const stufen = ["#33200f", "#4f321c", "#6e4426"];
        for (let i = 0; i < stufen.length; i++) {
            ctx.fillStyle = stufen[i];
            ctx.fillRect(t.x0, Math.round(t.y1 - h * 0.13 * (stufen.length - i)), w, Math.ceil(h * 0.13 * (stufen.length - i)));
        }
        ctx.restore();

        const fig = zustand.figur;
        if (fig) {
            const fake = this._tuerFigur || (this._tuerFigur = { x: 0, y: 0, facingRight: true, isMoving: true, laufPhase: 0, hut: null, name: "" });
            // Füße: vom Platz vor der Tür (VOR_DER_TUER in useSpielschleife + 20) bis hinter die Schwelle
            const fuss = t.fuss + 40 + ((t.y1 - 10) - (t.fuss + 40)) * fig.weg;
            fake.x = t.mitteX;
            fake.y = fuss - 20;
            fake.facingRight = fig.rechts !== false;
            fake.laufPhase = fig.phase || 0.01;
            fake.hut = this._eigenerHut;
            ctx.save();
            // Sichtbar im Türrahmen und überall darunter (vor dem Haus) — der Sturz schneidet den Kopf ab
            tuerPfad(ctx, t);
            ctx.rect(t.x0 - 80, t.y1, w + 160, 240);
            ctx.clip();
            ctx.globalAlpha *= Math.max(0, Math.min(1, fig.alpha));
            const k = 1 - 0.18 * fig.weg;
            ctx.translate(fake.x, fuss);
            ctx.scale(k, k);
            ctx.translate(-fake.x, -fuss);
            this.drawPlayer(fake, null, null, "", this._figurAussehen || {}, null, "remote", null);
            ctx.restore();
        }

        // Türblatt: klappt zur rechten Angel, bleibt offen als schmale Kante stehen
        const m = tuerMass(area.image);
        const blatt = Math.max(w * 0.1, w * (1 - f));
        ctx.save();
        tuerPfad(ctx, t);
        ctx.clip();
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(image, m.x0, m.y0, m.x1 - m.x0, m.y1 - m.y0, t.x1 - blatt, t.y0, blatt, h);
        ctx.fillStyle = `rgba(20, 12, 6, ${(0.5 * f).toFixed(3)})`;
        ctx.fillRect(t.x1 - blatt, t.y0, blatt, h);
        ctx.restore();
        ctx.imageSmoothingEnabled = glatt;
    }

    /**
     * Kleine Pfeile neben der Figur (11.11.): zeigen zu den Ständen, an denen gerade etwas
     * abzuholen oder abzugeben ist (Missionsbrett, Händler, Erntefest — dieselben Marken wie
     * die Sprechblasen über den Ständen). Nur solange der Stand weiter weg ist; steht man
     * davor, reicht die Sprechblase. (cx, cy) = Körpermitte der Figur, `u` = Größe eines
     * Bildpunkts, `winkelZu(area)` = Richtung zum Stand im Bild.
     */
    _drawWegweiser(areas, player, cx, cy, u, winkelZu) {
        const marken = this._standMarken;
        if (!marken || !areas || !player) return;
        const liste = this._wegweiser || (this._wegweiser = WEGWEISER_ARTEN.map(() => ({ w: 0, farbe: "" })));
        let n = 0;
        let summe = 0;
        for (const art of WEGWEISER_ARTEN) {
            if (!marken[art.key]) continue;
            const a = areas[art.key];
            if (!a || a.aktiv === false) continue;
            if (Math.hypot(a.x - player.x, a.y - player.y) < WEGWEISER_AB) continue;
            const w = winkelZu(a);
            if (!Number.isFinite(w)) continue;
            liste[n].w = w;
            liste[n].farbe = art.farbe;
            summe += w;
            n++;
        }
        if (n === 0) return;
        // Die Stände stehen nebeneinander — Pfeile mit fast gleicher Richtung fächern auf,
        // die Mitte des Fächers bleibt die echte Richtung.
        for (let i = 1; i < n; i++) {
            for (let j = i; j > 0 && liste[j].w < liste[j - 1].w; j--) { const tausch = liste[j]; liste[j] = liste[j - 1]; liste[j - 1] = tausch; }
        }
        let neu = liste[0].w;
        for (let i = 1; i < n; i++) {
            if (liste[i].w - liste[i - 1].w < 0.42) liste[i].w = liste[i - 1].w + 0.42;
            neu += liste[i].w;
        }
        const versatz = (summe - neu) / n;
        const { ctx } = this;
        const schub = (Math.floor((this._frameNow || 0) / 260) % 2) * u;
        ctx.save();
        ctx.globalAlpha = 1;
        ctx.lineJoin = "miter";
        for (let i = 0; i < n; i++) {
            const w = liste[i].w + versatz;
            ctx.save();
            ctx.translate(cx + Math.cos(w) * (19 * u + schub), cy + Math.sin(w) * (19 * u + schub));
            ctx.rotate(w);
            ctx.beginPath();
            ctx.moveTo(5 * u, 0);
            ctx.lineTo(-3 * u, -4 * u);
            ctx.lineTo(-u, 0);
            ctx.lineTo(-3 * u, 4 * u);
            ctx.closePath();
            ctx.lineWidth = 2 * u;
            ctx.strokeStyle = "#2b1d12";
            ctx.stroke();
            ctx.fillStyle = liste[i].farbe;
            ctx.fill();
            ctx.restore();
        }
        ctx.restore();
    }

    /**
     * „Hier ist ein Ei fertig" über dem Schuppen (der Inkubator wohnt seit
     * Feedback 30.08. darin, ohne eigenes Gebäude): Anzahl in einer Sprechblase,
     * die sanft auf und ab wippt. Die Bewegung ist der eigentliche Zweck — ein
     * starrer Punkt geht zwischen Pflanzen und Deko unter.
     */
    /**
     * Pixel-Sprechblase über einem Stand (06.11.): „hier kannst du etwas abgeben“ —
     * Händler (lieferbare Aufträge), Missionsbrett (abholbare Missionen), Erntefest
     * (Belohnung bereit). Wippt in ganzen Schritten, Zahl = wie viele.
     */
    /** Gesammelte Stand-Marken nach dem Nachtschleier malen — sonst wären sie nachts grau. */
    _flushStandMarken() {
        const liste = this._markenListe;
        if (!liste || liste.length === 0) return;
        const { ctx } = this;
        ctx.save();
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
        for (const e of liste) { ctx.setTransform(e.m); this._drawStandMarke(e.x, e.y, e.anzahl, e.art); }
        ctx.restore();
        liste.length = 0;
    }

    _drawStandMarke(x, y, anzahl, art) {
        const { ctx } = this;
        const hopser = Math.round(Math.abs(Math.sin((this._frameNow || 0) / 300)) * 6);
        const text = art === "erntefest" ? "!" : `! ${anzahl}`;
        ctx.save();
        ctx.font = "bold 22px 'GfZiffern', 'Pixelify Sans', Nunito, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const w = Math.round(Math.max(40, ctx.measureText(text).width + 24));
        const h = 34;
        const bx = Math.round(x - w / 2), by = Math.round(y - h - 10 - hopser);
        // Umriss, Fläche, Lichtkante, Spitze — harte Kanten wie die Holzschilder
        ctx.fillStyle = "#2b1d12";
        ctx.fillRect(bx - 3, by - 3, w + 6, h + 6);
        ctx.fillRect(Math.round(x) - 6, by + h, 12, 6);
        ctx.fillRect(Math.round(x) - 3, by + h + 6, 6, 4);
        ctx.fillStyle = "#ffe066";
        ctx.fillRect(bx, by, w, h);
        ctx.fillRect(Math.round(x) - 3, by + h, 6, 5);
        ctx.fillStyle = "#fff7c2";
        ctx.fillRect(bx, by, w, 3);
        ctx.fillStyle = "#3b2516";
        ctx.fillText(text, x, by + h / 2 + 1);
        ctx.restore();
    }

    _drawEierMarker(x, y, anzahl) {
        const { ctx, frame } = this;
        const bob = Math.sin(frame * 0.1) * 4;
        const text = String(anzahl);
        ctx.save();
        ctx.font = "bold 15px 'GfZiffern', 'Pixelify Sans', Nunito, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const breite = Math.max(26, ctx.measureText(text).width + 20);
        const mitteY = y + bob;
        ctx.fillStyle = "#7c3aed";
        ctx.beginPath();
        ctx.roundRect(x - breite / 2, mitteY - 12, breite, 24, 6);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.85)";
        ctx.lineWidth = 2;
        ctx.stroke();
        // Spitze nach unten, damit klar ist, worauf sich der Marker bezieht.
        ctx.beginPath();
        ctx.moveTo(x - 5, mitteY + 11);
        ctx.lineTo(x, mitteY + 18);
        ctx.lineTo(x + 5, mitteY + 11);
        ctx.closePath();
        ctx.fillStyle = "#7c3aed";
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.fillText(text, x, mitteY);
        ctx.restore();
    }

    /**
     * Ein Geist wurde von der Shotgun erwischt: Wolke aus Tropfen am Standort.
     *
     * Die Flugbahnen werden EINMAL beim Anlegen ausgewürfelt und danach nur noch
     * über die verstrichene Zeit ausgewertet. Würde pro Bild neu gewürfelt, zappelte
     * die Wolke, statt auseinanderzufliegen.
     */
    spawnSplatter(x, y) {
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        const tropfen = [];
        for (let i = 0; i < SPLATTER_TROPFEN; i++) {
            const winkel = Math.random() * Math.PI * 2;
            const tempo = 60 + Math.random() * 190;
            tropfen.push({
                dx: Math.cos(winkel) * tempo,
                // Nach oben etwas schwungvoller: die Schwerkraft weiter unten holt
                // die Tropfen zurück, das ergibt einen Bogen statt einer Scheibe.
                dy: Math.sin(winkel) * tempo - 90,
                r: 3 + Math.random() * 7,
                ton: Math.random() < 0.25 ? "#7f1d1d" : "#b91c1c",
            });
        }
        this._splatter.push({ x, y, start: this._frameNow || Date.now(), tropfen });
    }

    _drawSplatter() {
        if (this._splatter.length === 0) return;
        const { ctx } = this;
        const now = this._frameNow;
        ctx.save();
        for (let i = this._splatter.length - 1; i >= 0; i--) {
            const wolke = this._splatter[i];
            const t = (now - wolke.start) / SPLATTER_DAUER_MS;
            if (t >= 1) { this._splatter.splice(i, 1); continue; }
            const rest = 1 - t;
            // Erst ein harter Blitz, dann sacken die Tropfen weg.
            ctx.globalAlpha = Math.min(1, rest * 1.6);
            for (const tr of wolke.tropfen) {
                const px = wolke.x + tr.dx * t;
                const py = wolke.y + tr.dy * t + 260 * t * t;
                ctx.fillStyle = tr.ton;
                ctx.beginPath();
                ctx.arc(px, py, Math.max(0.5, tr.r * rest), 0, Math.PI * 2);
                ctx.fill();
            }
            // Fleck am Boden, der stehen bleibt, solange die Wolke lebt.
            ctx.globalAlpha = Math.min(0.75, rest);
            ctx.fillStyle = "#7f1d1d";
            ctx.beginPath();
            ctx.ellipse(wolke.x, wolke.y + 18, 34 + 26 * t, 12 + 9 * t, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.restore();
    }

    /**
     * Kurze Rückmeldung an einer Weltposition — Gold-Zahl beim Ernten, „2×!" bei
     * Doppelernte, „🐣 Nachwuchs!", ein Tier-Icon beim Auslösen, „✨ Rainbow!"
     * bei Veredelung. Treibt nach oben weg und blendet aus, nach demselben
     * start/t-Muster wie die Splatter-Wolke oben — nur ohne Physik.
     *
     * EIN gemeinsames System, damit nicht jeder Auslöser (Ernte, Tier-Tick,
     * Gärtner-Nachwuchs, Glückspilz-Veredelung, …) seine eigene Zeichenroutine
     * braucht. Aufrufer übergeben nur Text + Weltposition, den Rest (Timing,
     * Ein-/Ausblenden, Deckel gegen ausufernde Listen) erledigt diese Datei.
     *
     * @param {number} x/y Weltkoordinaten, meist die Zellen- oder Tiermitte
     * @param {string} text z. B. "+12.500" oder "Nachwuchs!"
     * @param {object} opts { color, icon, durationMs }
     */
    spawnFeedback(x, y, text, opts = {}) {
        if (!Number.isFinite(x) || !Number.isFinite(y) || !text) return;
        this._feedback.push({
            x, y, text: String(text),
            icon: opts.icon || null,
            color: opts.color || "#fef08a",
            start: this._frameNow || Date.now(),
            durationMs: opts.durationMs || FEEDBACK_DAUER_MS,
        });
        // Deckel gegen ausufernde Listen bei Massenaktionen (sellAll, Massen-Ernte)
        // — die ältesten fliegen zuerst raus, nicht die gerade entstandenen.
        if (this._feedback.length > FEEDBACK_MAX) this._feedback.splice(0, this._feedback.length - FEEDBACK_MAX);
    }

    _drawFeedback() {
        if (this._feedback.length === 0) return;
        const { ctx } = this;
        const now = this._frameNow;
        ctx.save();
        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";
        for (let i = this._feedback.length - 1; i >= 0; i--) {
            const f = this._feedback[i];
            const t = (now - f.start) / f.durationMs;
            if (t >= 1) { this._feedback.splice(i, 1); continue; }
            // Erstes Fünftel: Einblenden + leichtes Pop. Letztes Drittel: Ausblenden.
            // Dazwischen treibt der Text geradlinig nach oben.
            const einblenden = Math.min(1, t / 0.2);
            const ausblenden = t < 0.7 ? 1 : Math.max(0, 1 - (t - 0.7) / 0.3);
            const alpha = einblenden * ausblenden;
            const scale = 0.75 + einblenden * 0.35;
            const y = f.y - FEEDBACK_AUFSTIEG_PX * t;
            const label = f.icon ? `${f.icon} ${f.text}` : f.text;

            ctx.globalAlpha = Math.max(0, alpha);
            ctx.font = `bold ${Math.round(15 * scale)}px sans-serif`;
            ctx.lineWidth = 3;
            ctx.strokeStyle = "rgba(15,23,42,0.85)";
            ctx.strokeText(label, f.x, y);
            ctx.fillStyle = f.color;
            ctx.fillText(label, f.x, y);
        }
        ctx.globalAlpha = 1;
        ctx.restore();
    }

    /**
     * Cartoon-Sprechblase über dem Markt beim Verkaufen (Feedback 30.08.: "nicht
     * oben die kleine graue Bubble, sondern eine animierte Cartoon-Blase auf dem
     * Markt mit dem gemachten Geld"). Eigenes System statt spawnFeedback: das
     * ist reiner Text ohne Fläche und für einzelne Ernten gedacht, hier soll der
     * GANZE Verkaufserlös deutlich herausstechen — mit Hintergrund, Sprechblasen-
     * Spitze zum Markt hin und einem Pop-Auftritt mit Überschwinger.
     */
    /**
     * Funkenregen bei einer Golden- oder Rainbow-Ernte — kurz, im Weltraum, ohne
     * Weichzeichner. Kleine Rauten fliegen auseinander und fallen.
     * "Ernte" (04.11.): kleiner, grüner Stoß bei jeder normalen Ernte im Schnellzug —
     * bewusst zurückhaltender als Golden/Rainbow, damit die weiter herausstechen.
     * @param {"Golden"|"Rainbow"|"Ernte"} art
     */
    spawnFunken(x, y, art) {
        if (!this._funken) this._funken = [];
        const scale = Math.max(0.3, Math.min(1, Number(this._renderProfile?.particleScale) || 1));
        // Ab Stern 4 („Neue Saat") sind die eigenen Ernte-Funken golden.
        const goldErnte = art === "Ernte" && hatKosmetik(this._eigeneSterne, "goldfunken");
        const ernte = art === "Ernte";
        const anzahl = Math.round((art === "Rainbow" ? 22 : ernte ? (goldErnte ? 10 : 7) : 14) * scale);
        const farben = goldErnte
            ? ["#fde047", "#facc15", "#fef3c7", "#f59e0b"]
            : art === "Rainbow"
            ? ["#f87171", "#fb923c", "#facc15", "#4ade80", "#60a5fa", "#c084fc"]
            : ernte
                ? ["#86efac", "#4ade80", "#bef264", "#fef08a"]
                : ["#fde047", "#facc15", "#fef9c3", "#eab308"];
        const start = this._frameNow || Date.now();
        for (let i = 0; i < anzahl; i++) {
            const winkel = (i / anzahl) * Math.PI * 2 + Math.random() * 0.4;
            const tempo = (ernte ? 55 : 90) + Math.random() * (ernte ? 60 : 110);
            this._funken.push({
                x, y, vx: Math.cos(winkel) * tempo, vy: Math.sin(winkel) * tempo - (ernte ? 90 : 120),
                farbe: farben[i % farben.length], groesse: (ernte ? 2 : 3) + Math.random() * (ernte ? 2 : 3),
                start, dauer: (ernte ? 420 : 650) + Math.random() * (ernte ? 200 : 350),
            });
        }
        if (this._funken.length > 240) this._funken.splice(0, this._funken.length - 240);
    }

    _drawFunken() {
        if (!this._funken || this._funken.length === 0) return;
        const { ctx } = this;
        const now = this._frameNow;
        ctx.save();
        for (let i = this._funken.length - 1; i >= 0; i--) {
            const f = this._funken[i];
            const t = (now - f.start) / f.dauer;
            if (t >= 1) { this._funken.splice(i, 1); continue; }
            const s = (now - f.start) / 1000;
            const x = f.x + f.vx * s;
            const y = f.y + f.vy * s + 260 * s * s;
            const g = f.groesse * (1 - t * 0.5);
            ctx.globalAlpha = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
            ctx.fillStyle = f.farbe;
            ctx.beginPath();
            ctx.moveTo(x, y - g);
            ctx.lineTo(x + g * 0.6, y);
            ctx.lineTo(x, y + g);
            ctx.lineTo(x - g * 0.6, y);
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();
    }

    spawnVerkaufsBlase(x, y, text) {
        if (!Number.isFinite(x) || !Number.isFinite(y) || !text) return;
        this._verkaufsBlasen.push({ x, y, text: String(text), start: this._frameNow || Date.now() });
        // Deckel wie bei den anderen Rückmeldungslisten — mehrere Verkäufe kurz
        // hintereinander (z. B. zwei Tabs) sollen nicht unbegrenzt stapeln.
        if (this._verkaufsBlasen.length > VERKAUF_BLASE_MAX) {
            this._verkaufsBlasen.splice(0, this._verkaufsBlasen.length - VERKAUF_BLASE_MAX);
        }
    }

    _drawVerkaufsBlasen() {
        if (this._verkaufsBlasen.length === 0) return;
        const { ctx } = this;
        const now = this._frameNow;
        const goldImg = this._getImage("/garden-assets/icons/hud/gold.png");
        for (let i = this._verkaufsBlasen.length - 1; i >= 0; i--) {
            const b = this._verkaufsBlasen[i];
            const t = (now - b.start) / VERKAUF_BLASE_DAUER_MS;
            if (t >= 1) { this._verkaufsBlasen.splice(i, 1); continue; }

            // Pop-Auftritt (erste 30%: 0.3 -> ~1.08 mit Überschwinger, dann fest bei
            // 1), hält, treibt dabei sacht nach oben, blendet im letzten Viertel aus.
            const popT = Math.min(1, t / 0.3);
            const scale = t < 0.3 ? 0.3 + easeOutBack(popT) * 0.7 : 1;
            const ausblenden = t < 0.75 ? 1 : Math.max(0, 1 - (t - 0.75) / 0.25);
            const treiben = Math.min(1, t / 0.75);
            const y = b.y - 34 * treiben;

            ctx.save();
            ctx.globalAlpha = Math.max(0, ausblenden);
            ctx.translate(b.x, y);
            ctx.scale(Math.max(0, scale), Math.max(0, scale));

            // Zahl in klarer Schrift — in der Pixel-Schrift war das Gold schwer zu lesen
            ctx.font = "800 18px Nunito, 'Segoe UI', sans-serif";
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
            const iconSize = 20;
            const textW = ctx.measureText(b.text).width;
            const padX = 14;
            const boxW = iconSize + 6 + textW + padX * 2;
            const boxH = 42;
            const boxY = -boxH - 16;

            // Sprechblase: Holzschild-Farbton wie der Rest des HUDs (Feedback
            // 30.08., "Cartoon-Überarbeitung") — cremefarbener Grund, dicke dunkle
            // Kontur, kleine Spitze nach unten in Richtung Markt.
            ctx.fillStyle = "#fffbeb";
            ctx.strokeStyle = "#78350f";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.roundRect(-boxW / 2, boxY, boxW, boxH, 16);
            ctx.moveTo(-9, boxY + boxH - 1);
            ctx.lineTo(0, boxY + boxH + 12);
            ctx.lineTo(9, boxY + boxH - 1);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            if (goldImg) {
                const gh = iconSize;
                const gw = (goldImg.naturalWidth || goldImg.width || 1) * (gh / (goldImg.naturalHeight || goldImg.height || 1));
                ctx.drawImage(goldImg, -boxW / 2 + padX, boxY + (boxH - gh) / 2, gw, gh);
            }
            ctx.fillStyle = "#78350f";
            ctx.fillText(b.text, -boxW / 2 + padX + iconSize + 6, boxY + boxH / 2);
            ctx.restore();
        }
        ctx.globalAlpha = 1;
    }

    /**
     * Werkzeug-Schwung (v2, Punkt 13) — Gießkanne und Spitzhacke standen bisher
     * bei Benutzung genauso still wie beim bloßen Ausrüsten; ein Klick auf die
     * Pflanze bzw. den Stein sah man nur am Ergebnis, nie am Werkzeug selbst.
     *
     * Nur EIN Schwung gleichzeitig (siehe `_toolSchwung` oben) — ein zweiter
     * Aufruf, während der erste noch läuft, ersetzt ihn einfach; das passt zum
     * Spielgefühl besser als eine Warteschlange (schnelles Nachklicken soll den
     * Schwung neu anstoßen, nicht stauen).
     *
     * @param {string} tool "pickaxe" | "watering" — andere Werkzeuge schwingen nicht.
     */
    spawnToolSchwung(tool) {
        if (!TOOL_SCHWUNG_MAX_RAD[tool]) return;
        this._toolSchwung = { tool, start: this._frameNow || Date.now() };
    }

    /**
     * Aktueller Schwung-Winkel für `tool`, oder 0 — ein sanfter Auf-und-Ab-Bogen
     * (sin über die Laufzeit), kein hartes Ein-/Ausschalten. Räumt sich selbst
     * ab, sobald die Zeit um ist, statt eines separaten Aufräum-Durchlaufs wie
     * bei Splatter/Feedback — es ist ja immer höchstens EIN Eintrag.
     */
    _toolSchwungWinkel(tool) {
        const s = this._toolSchwung;
        if (!s || s.tool !== tool) return 0;
        const t = (this._frameNow - s.start) / TOOL_SCHWUNG_DAUER_MS;
        if (t >= 1) { this._toolSchwung = null; return 0; }
        return Math.sin(t * Math.PI) * (TOOL_SCHWUNG_MAX_RAD[tool] || 0);
    }

    /**
     * Fliegendes Symbol nach dem Ernten (v2, Punkt 13 "Erntesamen-Flug") — steigt
     * auf, driftet leicht zur Seite und schrumpft dabei, statt dass das Stück
     * kommentarlos im Rucksack auftaucht. Dieselbe start/t-Bauweise wie
     * spawnFeedback, nur mit einem Bild/Emoji statt Text.
     *
     * `drift` wird EINMAL beim Erzeugen gewürfelt (nicht pro Bild neu) — sonst
     * würde das Symbol zappeln statt geradlinig wegzufliegen, aus demselben
     * Grund wie beim Splatter-Tropfen oben.
     */
    /** Die eigene Figur greift zu: kurzes Vorbeugen, die Hand stößt nach vorn (drawPlayer). */
    spawnGriff() {
        const now = this._frameNow || Date.now();
        // Beim Ziehen über viele Felder nicht jedes Feld neu anstoßen — sonst zittert sie
        if (this._griffStart && now - this._griffStart < GRIFF_DAUER_MS * 0.6) return;
        this._griffStart = now;
    }

    spawnItemFlug(x, y, imgSrc, emoji) {
        if (!Number.isFinite(x) || !Number.isFinite(y) || (!imgSrc && !emoji)) return;
        this.spawnGriff();
        this._itemFlug.push({
            x, y, imgSrc: imgSrc || null, emoji: emoji || "",
            drift: (Math.random() - 0.5) * 30,
            start: this._frameNow || Date.now(),
        });
        if (this._itemFlug.length > ITEM_FLUG_MAX) this._itemFlug.splice(0, this._itemFlug.length - ITEM_FLUG_MAX);
    }

    /**
     * Schädlinge und Unkraut (Backend core/stoerer.js) als kleine Pixel-Sprites, direkt
     * per fillRect gezeichnet — passt zum geplanten Pixel-Look und braucht kein Bild.
     * Käfer krabbeln auf ihrer Pflanze hin und her, Unkraut wiegt sich; beide ploppen
     * beim Erscheinen auf und blinken in den letzten Sekunden.
     */
    _drawStoerer(liste, slot, setzeJe = null) {
        if (!Array.isArray(liste) || liste.length === 0 || !slot) return;
        const { ctx } = this;
        const now = this._frameNow || Date.now();
        // Gesehen-Liste klein halten: nur, wer noch in der Liste steht.
        if (this._stoererGesehen && this._stoererGesehen.size > liste.length + 8) {
            const ids = new Set(liste.map((s) => s?.id));
            for (const id of this._stoererGesehen.keys()) if (!ids.has(id)) this._stoererGesehen.delete(id);
        }
        for (const s of liste) {
            if (!s || !(Number(s.bis) > now)) continue;
            const [cx, cy] = String(s.key).split("_").map(Number);
            if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;
            const pos = getDirtCellWorldPos(slot, cx, cy);
            const seed = (cx * 31 + cy * 17) % 100;
            // Aufploppen ab dem ersten BILD, in dem der Browser ihn sieht — nicht aus
            // der Serverzeit: geht die Uhr des Spielers nach, war das Alter negativ,
            // ungebremst wurde daraus eine riesige negative Pixelgröße und fillRect
            // malte den ganzen Bildschirm rot (gefunden im Test 04.11.).
            if (!this._stoererGesehen) this._stoererGesehen = new Map();
            if (!this._stoererGesehen.has(s.id)) this._stoererGesehen.set(s.id, now);
            const alter = now - this._stoererGesehen.get(s.id);
            const rest = Number(s.bis) - now;
            const pop = Math.max(0, Math.min(1, alter / 220));
            const skala = pop < 1 ? 0.4 + pop * 0.8 - Math.max(0, pop - 0.75) * 0.8 : 1;
            const blink = rest < 5000 && Math.floor(now / 160) % 2 === 0 ? 0.35 : 1;
            const kaefer = s.art === "kaefer";
            const muster = kaefer ? KAEFER_MUSTER : UNKRAUT_MUSTER;
            const farben = kaefer ? KAEFER_FARBEN : UNKRAUT_FARBEN;
            const p = 4 * skala;
            const breite = muster[0].length * p;
            const hoehe = muster.length * p;
            let x = pos.x + TILE_SIZE / 2 - breite / 2;
            let y = pos.y + TILE_SIZE / 2 - hoehe / 2 + (kaefer ? -6 : 10);
            if (kaefer) {
                x += Math.sin(now / 420 + seed) * 9;
                y += Math.cos(now / 610 + seed) * 4;
            }
            // 2,5D (06.11.): jeder Störer an seiner eigenen Zelle verankern — vorher
            // galt der Maßstab der Figur für alle, Unkraut schwebte dann über dem Acker.
            if (setzeJe && !setzeJe(pos.x + TILE_SIZE / 2, y + hoehe)) continue;
            ctx.save();
            ctx.globalAlpha = blink;
            for (let r = 0; r < muster.length; r++) {
                const reihe = muster[r];
                // Unkraut wiegt sich: obere Reihen weiter aus als untere.
                const versatz = kaefer ? 0 : Math.sin(now / 380 + seed) * (muster.length - r) * 0.6;
                for (let c = 0; c < reihe.length; c++) {
                    const farbe = farben[reihe[c]];
                    if (!farbe) continue;
                    ctx.fillStyle = farbe;
                    ctx.fillRect(Math.round(x + c * p + versatz), Math.round(y + r * p), Math.ceil(p), Math.ceil(p));
                }
            }
            ctx.restore();
        }
    }

    _drawItemFlug() {
        if (this._itemFlug.length === 0) return;
        const { ctx } = this;
        const now = this._frameNow;
        for (let i = this._itemFlug.length - 1; i >= 0; i--) {
            const f = this._itemFlug[i];
            const t = (now - f.start) / ITEM_FLUG_DAUER_MS;
            if (t >= 1) { this._itemFlug.splice(i, 1); continue; }
            const ease = 1 - Math.pow(1 - t, 2); // schnell los, sanft aus
            const x = f.x + f.drift * ease;
            const y = f.y - 50 * ease;
            const scale = 1 - 0.5 * ease;
            const alpha = t < 0.7 ? 1 : Math.max(0, 1 - (t - 0.7) / 0.3);
            ctx.save();
            ctx.globalAlpha = alpha;
            this._drawImageOrEmojiContain(f.imgSrc, f.emoji, x, y, 26 * scale);
            ctx.restore();
        }
    }

    /**
     * Pflanz-Wurf (Feedback 28.08.2026: "man merkt gar nicht, dass man pflanzt")
     * — das Samentütchen fällt sichtbar von oben aufs Feld, statt dass die
     * Pflanze kommentarlos an der Zelle auftaucht. Umgekehrtes Timing zu
     * spawnItemFlug (fällt statt steigt), mit kurzem Rückfeder-Hüpfer und
     * einem Bodenschatten statt Wegdriften.
     */
    spawnSaatWurf(x, y, imgSrc, emoji) {
        if (!Number.isFinite(x) || !Number.isFinite(y) || (!imgSrc && !emoji)) return;
        this.spawnGriff();
        this._saatWurf.push({
            x, y, imgSrc: imgSrc || null, emoji: emoji || "",
            start: this._frameNow || Date.now(),
        });
        if (this._saatWurf.length > SAAT_WURF_MAX) this._saatWurf.splice(0, this._saatWurf.length - SAAT_WURF_MAX);
    }

    _drawSaatWurf() {
        if (this._saatWurf.length === 0) return;
        const { ctx } = this;
        const now = this._frameNow;
        for (let i = this._saatWurf.length - 1; i >= 0; i--) {
            const f = this._saatWurf[i];
            const t = (now - f.start) / SAAT_WURF_DAUER_MS;
            if (t >= 1) { this._saatWurf.splice(i, 1); continue; }
            // Erste 75 %: Fall mit Beschleunigung (ease-in) aus der Höhe. Letztes
            // Viertel: ein kurzer, abklingender Hüpfer statt hart aufzuschlagen.
            let hoehe;
            if (t < 0.75) {
                const fallT = t / 0.75;
                hoehe = 60 * (1 - fallT * fallT);
            } else {
                const bounceT = (t - 0.75) / 0.25;
                hoehe = Math.abs(Math.sin(bounceT * Math.PI)) * 10 * (1 - bounceT);
            }
            const y = f.y - hoehe;
            const naehe = Math.max(0, 1 - hoehe / 60); // 0 = noch hoch oben, 1 = am Boden

            ctx.save();
            ctx.globalAlpha = 0.3 * naehe;
            ctx.fillStyle = "#000";
            ctx.beginPath();
            ctx.ellipse(f.x, f.y + 4, 11 * naehe, 4.5 * naehe, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            ctx.save();
            ctx.translate(f.x, y);
            // Kippt beim Fallen leicht nach vorn, richtet sich beim Aufkommen auf.
            ctx.rotate((1 - naehe) * -0.45);
            this._drawImageOrEmojiContain(f.imgSrc, f.emoji, 0, 0, 28);
            ctx.restore();
        }
    }

    _drawPlayerNametag(centerX, topY, label, style = "local", badge = null, nameplateReskin = null, sterne = 0) {
        const { ctx } = this;
        const name = String(label || "").trim();
        if (!name) return;
        const isLocal = style === "local";
        // „Neue Saat": Stern vor dem Namen (ab 1), goldene Schrift (ab 2), Titel (ab 5).
        const stern = hatKosmetik(sterne, "abzeichen") ? `★${sterne > 1 ? sterne : ""} ` : "";
        const goldname = hatKosmetik(sterne, "goldname");
        const kurzName = name.length > 22 ? `${name.slice(0, 20)}…` : name;
        const text = stern + kurzName;

        const titel = !BADGE_TEXT[badge] && hatKosmetik(sterne, "titel");
        const badgeText = BADGE_TEXT[badge] || (titel ? STERN_TITEL : null);
        const badgeFarben = titel ? { fuellung: "#fcd34d", rand: "#b45309" } : (BADGE_FARBEN[badge] || BADGE_FARBEN.beta);
        // Gold-Shop-Reskin (core/reskins.js) übersteuert die Standardfarben —
        // gilt für JEDEN, der es sich ausgerüstet hat, egal ob lokal oder fremd.
        const reskinFarbe = NAMEPLATE_RESKIN_FARBEN[nameplateReskin] || null;

        ctx.save();
        ctx.font = "bold 11px 'GfZiffern', 'Pixelify Sans', Nunito, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        const padX = 8;
        const padY = 4;
        const metrics = ctx.measureText(text);
        const w = Math.min(200, Math.ceil(metrics.width) + padX * 2);
        const h = 18;
        const x = centerX - w / 2;
        const y = topY - h;
        // Reskin: diagonaler Verlauf statt flacher Füllung (Feedback 01.09.:
        // "Textur statt flacher Farbe") — von der oberen linken zur unteren
        // rechten Ecke der Pille, dieselben zwei Töne wie die Shop-Vorschau
        // (GoldShopModal.jsx zeichnet denselben Verlauf in CSS).
        if (reskinFarbe) {
            const verlauf = ctx.createLinearGradient(x, y, x + w, y + h);
            verlauf.addColorStop(0, reskinFarbe.bg);
            verlauf.addColorStop(1, reskinFarbe.bg2 || reskinFarbe.bg);
            ctx.fillStyle = verlauf;
        } else {
            ctx.fillStyle = isLocal ? "rgba(15,23,42,0.88)" : "rgba(30,58,138,0.88)";
        }
        ctx.strokeStyle = reskinFarbe ? reskinFarbe.border : (isLocal ? "rgba(148,163,184,0.7)" : "rgba(147,197,253,0.75)");
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, 5);
        ctx.fill();
        ctx.stroke();
        const namensFarbe = goldname ? "#fcd34d" : (reskinFarbe ? reskinFarbe.text : (isLocal ? "#e2e8f0" : "#dbeafe"));
        if (stern) {
            // Stern in Gold, Name in seiner Farbe — beide zusammen mittig.
            ctx.textAlign = "left";
            const links = centerX - ctx.measureText(text).width / 2;
            ctx.fillStyle = "#fbbf24";
            ctx.fillText(stern, links, topY - padY);
            ctx.fillStyle = namensFarbe;
            ctx.fillText(kurzName, links + ctx.measureText(stern).width, topY - padY);
            ctx.textAlign = "center";
        } else {
            ctx.fillStyle = namensFarbe;
            ctx.fillText(text, centerX, topY - padY);
        }

        if (badgeText) {
            ctx.font = "bold 9px 'GfZiffern', 'Pixelify Sans', Nunito, sans-serif";
            const bm = ctx.measureText(badgeText);
            const bw = Math.ceil(bm.width) + 8;
            const bh = 13;
            const bx = centerX - bw / 2;
            const by = y - bh - 1;
            ctx.fillStyle = badgeFarben.fuellung;
            ctx.strokeStyle = badgeFarben.rand;
            ctx.beginPath();
            ctx.roundRect(bx, by, bw, bh, 4);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = "#0f172a";
            ctx.fillText(badgeText, centerX, by + bh - 2);
        }

        ctx.restore();
    }

    _renderHeldPlantEffect(item, urspungX, y) {
        let scale = 1;
        if (item.size) {
            scale = handScaleFromFruitSize(item.size);
        } else if (item.norm) {
            scale = handScaleFromPlantNorm(item.norm);
        }

        // Große Früchte rücken nach außen, sonst verschwindet die Figur dahinter.
        const x = urspungX + Math.max(0, scale - 1) * 14;
        // v2 (Punkt 13, "Pflanze im Topf in der Hand"): vorher stand die Pflanze
        // bewegungslos in der Hand — als einziges Held-Item ohne jede Animation,
        // während Ernte, Tier-Ticks und jetzt auch Werkzeuge alle etwas tun. Ein
        // leises Schwanken reicht: `_frameNow` läuft durchgehend (kein
        // start/Dauer-Eintrag nötig wie beim Schwung), macht daraus also von
        // selbst eine Endlosschleife statt eines einmaligen Effekts.
        const schwankenY = Math.sin((this._frameNow || 0) / 420) * 2;
        y += schwankenY;
        const drawSize = 38 * scale;
        const imgSrc = item.harvestImage || item.image || item.fruitImage || item.growthImage;

        const specialName = item.specialType || item.specialData?.name || null;
        const effect = item.statusEffect || null;
        const overlay = this._resolveItemOverlay(effect, specialName);

        if (!overlay) {
            this._drawImageOrEmojiContain(imgSrc, item.emoji, x, y, drawSize);
            return;
        }

        // With overlay: draw image into scratch canvas, tint there, then blit.
        // Resolve source (atlas or regular image) and final aspect-fit dimensions.
        let src = null;       // either atlas image with crop, or full image
        let cropX = 0, cropY = 0, cropW = 0, cropH = 0;
        let dw = drawSize, dh = drawSize;

        if (this._atlasLoaded && this._atlasImage && imgSrc) {
            const frame = this._atlasFrames.get(imgSrc);
            if (frame) {
                const ar = frame.w / frame.h;
                if (ar > 1) dh = drawSize / ar;
                else dw = drawSize * ar;
                src = this._atlasImage;
                cropX = frame.x; cropY = frame.y; cropW = frame.w; cropH = frame.h;
            }
        }
        if (!src) {
            const img = this._getImage(imgSrc);
            if (this._bildStatus(imgSrc) === "loading") return;
            if (img) {
                const nw = Math.max(1, img.naturalWidth || img.width);
                const nh = Math.max(1, img.naturalHeight || img.height);
                const sc = Math.min(drawSize / nw, drawSize / nh);
                dw = nw * sc; dh = nh * sc;
                src = img;
                cropX = 0; cropY = 0; cropW = nw; cropH = nh;
            }
        }
        if (!src) {
            // Emoji fallback — no tint applied (tinting emojis would just darken them)
            this._drawImageOrEmojiContain(imgSrc, item.emoji, x, y, drawSize);
            return;
        }

        const dx = x - dw / 2;
        const dy = y - dh / 2;
        const sw = Math.max(1, Math.ceil(dw));
        const sh = Math.max(1, Math.ceil(dh));
        if (this._tintScratch.width < sw || this._tintScratch.height < sh) {
            this._tintScratch.width = Math.max(this._tintScratch.width, sw, 128);
            this._tintScratch.height = Math.max(this._tintScratch.height, sh, 128);
        }
        const sctx = this._tintScratchCtx;
        // Ganze Fläche leeren und ohne Glättung kopieren (06.11.): sonst mischt das
        // Hochskalieren Reste vom Rand des letzten Bilds mit hinein — bei Rainbow-
        // Pflanzen in der Hand sah man dadurch einen feinen Rahmen.
        sctx.clearRect(0, 0, this._tintScratch.width, this._tintScratch.height);
        sctx.imageSmoothingEnabled = false;
        sctx.drawImage(src, cropX, cropY, cropW, cropH, 0, 0, sw, sh);
        sctx.globalCompositeOperation = "source-atop";
        if (overlay.kind === "solid") {
            sctx.fillStyle = overlay.color;
            sctx.fillRect(0, 0, sw, sh);
        } else if (overlay.kind === "rainbow") {
            const grad = sctx.createLinearGradient(0, 0, 0, sh);
            grad.addColorStop(0.00, "rgba(255,  64,  64, 0.55)");
            grad.addColorStop(0.20, "rgba(255, 165,   0, 0.55)");
            grad.addColorStop(0.40, "rgba(255, 235,  59, 0.55)");
            grad.addColorStop(0.60, "rgba( 76, 175,  80, 0.55)");
            grad.addColorStop(0.80, "rgba( 33, 150, 243, 0.55)");
            grad.addColorStop(1.00, "rgba(156,  39, 176, 0.55)");
            sctx.fillStyle = grad;
            sctx.fillRect(0, 0, sw, sh);
        }
        sctx.globalCompositeOperation = "source-over";
        const glatt = this.ctx.imageSmoothingEnabled;
        this.ctx.imageSmoothingEnabled = false;
        this.ctx.drawImage(this._tintScratch, 0, 0, sw, sh, dx, dy, dw, dh);
        this.ctx.imageSmoothingEnabled = glatt;
    }

    drawPlayer(player, selectedTool, heldItem = null, localPlayerName = "", playerAppearance = {}, badge = null, nametagStyle = "local", nameplateReskin = null) {
        const { ctx } = this;
        const sterne = nametagStyle === "local" ? (this._eigeneSterne || 0) : (Number(player?.sterne) || 0);
        this._sternenspurPunkt(player, sterne);
        const px = Math.round(player.x);
        const py = Math.round(player.y);
        const facingRight = player.facingRight !== false; // Standard nach rechts

        ctx.save();
        // Nullpunkt auf den Spieler legen, damit wir sauber spiegeln können
        ctx.translate(px, py);
        ctx.scale(facingRight ? 1 : -1, 1);

        // Rückfall auf den Standardskin. Der lag bis v3.6 direkt im wardrobe-Ordner,
        // dann bis Feedback 30.08. unter farmer/farmer.png (Farmer-Ghost) — beide
        // Pfade liefern inzwischen einen 404 und damit statt der Figur nur noch das
        // 🌱-Notbild von _drawImageOrEmojiContain. STANDARD_SKIN (wardrobe.js) zeigt
        // seit der Katzen-Umstellung auf farmer/normal.png; dieselbe Datei hier fest
        // verdrahtet, weil drawPlayer rein von der Engine kommt und die Skin-Liste
        // aus ui/wardrobe.js nicht importiert.
        const skinUrl = playerAppearance?.skin === "/garden-assets/wardrobe/farmer.png"
            || playerAppearance?.skin === "/garden-assets/wardrobe/farmer/farmer.png"
            || !playerAppearance?.skin
            ? "/garden-assets/wardrobe/farmer/normal.png"
            : playerAppearance.skin;
        // v2-Fundament: Kachel-Sprung statt Dauerlauf — player.hopBob kommt fertig
        // aus dem Game-Loop (ein Sinusbogen über die Sprungdauer, siehe dort) und
        // ersetzt das frühere framebasierte Wackeln, das für Dauerbewegung gedacht war.
        // Laufanimation (06.11.): die Figuren sind Einzelbilder — beim Laufen kippt die
        // Figur im Schritttakt um die Füße und wirbelt bei jedem Schritt etwas Staub auf.
        // Eigene Figur: Phase aus der Spielschleife; Mitspieler: aus dem Bildzähler.
        // Hut aus dem Gold-Shop (engine/huete.js): eigener aus dem drawState, fremde vom Server
        const hutId = player === this._eigeneFigur ? this._eigenerHut : (player.hut || null);
        const laeuft = Boolean(player.isMoving);
        const phase = laeuft ? (Number.isFinite(player.laufPhase) && player.laufPhase > 0 ? player.laufPhase : ((this._frameNow || performance.now()) / 1000) * MAP_CONFIG.laufSchrittePS * Math.PI) : 0;
        // 10.11.: Die Figur wird zerlegt gezeichnet (engine/figurAnim.js) — beim Laufen heben
        // sich die Füße abwechselnd, im Stand atmet und blinzelt sie. Während der Party tanzt,
        // wer steht, im gemeinsamen Takt (engine/partyShow.js).
        const jetzt = this._frameNow || Date.now();
        const saat = hashUnit(player.name || localPlayerName || "ich");
        const tanz = !laeuft && (this._party || 0) > 0.35 ? tanzSchritt(jetzt, saat > 0.5 ? 0.5 : 0) : null;
        // Griff (Ernten, Pflanzen): die eigene Figur beugt sich kurz nach vorn
        let griff = 0;
        if (player === this._eigeneFigur && this._griffStart) {
            const g = (jetzt - this._griffStart) / GRIFF_DAUER_MS;
            if (g >= 0 && g < 1) griff = Math.sin(g * Math.PI);
            else this._griffStart = 0;
        }
        if (laeuft) {
            const staub = Math.abs(Math.cos(phase));
            if (staub > 0.55) {
                const hinten = -1; // die Zeichnung ist schon in Blickrichtung gespiegelt
                ctx.fillStyle = `rgba(214, 196, 160, ${((staub - 0.55) * 1.6).toFixed(3)})`;
                const sx = hinten * (16 + (1 - staub) * 18);
                ctx.fillRect(Math.round(sx - 4), 20, 6, 6);
                ctx.fillRect(Math.round(sx + hinten * 7), 23, 4, 4);
            }
        }
        const neigung = laeuft ? 0.07 + Math.sin(phase) * 0.03 : tanz ? tanz.neigung : griff * 0.2;
        const huepf = tanz ? -Math.round(tanz.huepf * 4) : 0;
        const figurBild = this._getImage(skinUrl);
        let bob = 0;
        ctx.save();
        ctx.translate(0, 20 + huepf);
        ctx.rotate(neigung);
        ctx.translate(0, -20);
        if (figurBild) {
            const glatt = ctx.imageSmoothingEnabled;
            ctx.imageSmoothingEnabled = false;
            bob = zeichneFigur(ctx, figurBild, {
                mitteY: -20, box: 80, src: skinUrl, zeit: jetzt / 1000, saat,
                schritt: laeuft ? phase : tanz ? tanz.schritt : null,
                hub: tanz ? 6 : 5,
            });
            ctx.imageSmoothingEnabled = glatt;
        } else {
            this._drawImageOrEmojiContain(skinUrl, "", 0, -20, 80);
        }
        if (hutId) zeichneHut(ctx, hutId, 0, -44 + bob, 44);
        ctx.restore();
        // Was die Figur hält, wippt mit ihr und stößt beim Griff nach vorn
        const handY = bob + huepf + (laeuft ? Math.round(Math.cos(phase) * 1.5) : 0);
        const handX = Math.round(griff * 9);
        ctx.translate(handX, handY);

        const selectedToolKey = selectedTool || null;
        const isHeldPlant = heldItem && (heldItem._type === "plant" || heldItem.stage);

        // Held items / Tools (Werden automatisch mitgespiegelt)
        if (selectedToolKey) {
            const toolImg = TOOL_IMAGE_BY_KEY[selectedToolKey];
            const toolEmoji = TOOL_EMOJI_BY_KEY[selectedToolKey];
            const toolSize = TOOL_GROESSE_BY_KEY[selectedToolKey] || 32;
            // v2 (Punkt 13): Schwung beim Gießen/Abbauen (siehe spawnToolSchwung) —
            // 0 bei jedem anderen Werkzeug oder im Ruhezustand, dann bleibt die
            // Rotation unten ein No-Op und alles zeichnet wie zuvor.
            const schwung = this._toolSchwungWinkel(selectedToolKey);
            if (TOOL_SPRITE_ZEIGT_LINKS[selectedToolKey]) {
                // Um die eigene Mitte spiegeln, damit die Position gleich bleibt.
                ctx.save();
                ctx.translate(22, -6);
                ctx.scale(-1, 1);
                ctx.rotate(schwung);
                this._drawImageOrEmojiContain(toolImg, toolEmoji, 0, 0, toolSize);
                ctx.restore();
            } else {
                ctx.save();
                ctx.translate(22, -6);
                ctx.rotate(schwung);
                this._drawImageOrEmojiContain(toolImg, toolEmoji, 0, 0, toolSize);
                ctx.restore();
            }


            if (selectedToolKey === "pot" && heldItem) {
                this._renderHeldPlantEffect(heldItem, 22, -24); 
            }
        } else if (heldItem) {
            if (isHeldPlant) {
                this._renderHeldPlantEffect(heldItem, 22, -8);
            } else {
                const heldImage = heldItem.image || heldItem.seedImage || heldItem.seedShopImage || heldItem.harvestImage || null;
                const heldEmoji = heldItem.emoji || "";
                this._drawImageOrEmojiContain(heldImage, heldEmoji, 22, -6, TOOL_GROESSE_BY_BILD.get(heldImage) || 32);
            }
        }

        ctx.restore(); // Spiegelung aufheben

        // Nametag (darf NICHT gespiegelt werden!)
        // Mit Hut aus dem Gold-Shop rückt das Schild nach oben — sonst deckte es den Hut zu (11.11.)
        if (localPlayerName) {
            this._drawPlayerNametag(px, py - (hutId ? 57 + hutHoehe(hutId) : 57), localPlayerName, nametagStyle, badge, nameplateReskin, sterne);
        }
    }

    /**
     * Sternenspur (ab Stern 3, „Neue Saat"): beim Laufen kleine Sterne an den Füßen,
     * die kurz aufsteigen und verblassen. Ab Stern 5 bunt. Gezeichnet in
     * _drawSternenspur, einmal je Bild über alle Spieler.
     */
    _sternenspurPunkt(player, sterne) {
        if (!hatKosmetik(sterne, "spur") || !player) return;
        const bewegt = (player.hopBob || 0) > 0.01 || player.isMoving === true;
        if (!bewegt) return;
        const scale = Math.max(0, Math.min(1, Number(this._renderProfile?.particleScale) || 1));
        if (scale < 0.35) return;
        const now = this._frameNow || Date.now();
        if (!this._spurZuletzt) this._spurZuletzt = new WeakMap();
        if (now - (this._spurZuletzt.get(player) || 0) < 55 / scale) return;
        this._spurZuletzt.set(player, now);
        if (!this._spur) this._spur = [];
        this._spurFarbe = ((this._spurFarbe || 0) + 1) % SPUR_REGENBOGEN.length;
        this._spur.push({
            x: player.x + (Math.random() - 0.5) * 16,
            y: player.y + 16 + Math.random() * 4,
            start: now,
            dauer: 800 + Math.random() * 300,
            farbe: sterne >= 5 ? SPUR_REGENBOGEN[this._spurFarbe] : (Math.random() < 0.5 ? "#fde047" : "#fef3c7"),
            groesse: 3.2 + Math.random() * 1.8,
        });
        if (this._spur.length > 160) this._spur.splice(0, this._spur.length - 160);
    }

    _drawSternenspur() {
        if (!this._spur || this._spur.length === 0) return;
        const { ctx } = this;
        const now = this._frameNow || Date.now();
        this._spur = this._spur.filter((s) => now - s.start < s.dauer);
        ctx.save();
        for (const s of this._spur) {
            const t = (now - s.start) / s.dauer;
            const r = s.groesse * (1 - t * 0.4);
            const x = s.x;
            const y = s.y - t * 10;
            ctx.globalAlpha = 1 - t;
            ctx.fillStyle = s.farbe;
            // Vierzackiger Stern aus zwei Rauten — klein genug, dass er Pixel-Look behält.
            ctx.beginPath();
            ctx.moveTo(x, y - r * 2); ctx.lineTo(x + r * 0.5, y); ctx.lineTo(x, y + r * 2); ctx.lineTo(x - r * 0.5, y); ctx.closePath();
            ctx.moveTo(x - r * 2, y); ctx.lineTo(x, y - r * 0.5); ctx.lineTo(x + r * 2, y); ctx.lineTo(x, y + r * 0.5); ctx.closePath();
            ctx.fill();
        }
        ctx.restore();
    }
}