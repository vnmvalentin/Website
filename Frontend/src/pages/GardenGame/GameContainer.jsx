// GameContainer.jsx
// Smooth WASD movement, diagonal support, plant system, shop UI, lobby awareness

import React, { memo, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
    Sprout, Trophy, Star, FlaskConical, Play, Coins, Backpack, Home, Store, ShoppingCart,
    Settings, ScrollText, Shirt, PawPrint, ChevronDown, Lock, X, Check, Package, Mail, Users, Copy, Info, Trash2,
    Search, Move, Plus, MapPin, MessageSquare, Send, Egg, SlidersHorizontal, LayoutGrid,
} from "lucide-react";
import Renderer from './engine/Renderer';
import InputHandler from './engine/InputHandler';
import { versionedAsset } from './engine/assetVersion';
import { generatePlotSlots, TILE_SIZE, MAP_CONFIG, getHoveredCell, getHoveredRock, getMailboxHitArea, STEIN_REIHEN, MITTELWEG_REIHE, istWegReihe, istAndereReihe, spiegleZeile } from './engine/MapConfig';
// harvestPlant und getGoldfinderRange stehen bewusst nicht mehr hier: diese
// Rechnungen macht ab v3.0 der Server (garden/core/economy).
import {
    generateShopRotation, createPlantInstance, isPlantReady, getPlantVisuals,
    ensurePerennialFruitingState, WEATHER_SELL_BOOST, ARCHETYPE_LABELS, getPlantArchetypeKey,
    STATUS_EFFECT_LABELS, SEED_CATALOGUE, hydrateHarvestedItems, wetterEffektSchritt,
    wetterListe, wetterBoost, wetterChanceFuer, zyklusMinuten,
} from './engine/PlantSystem';
import {
    PET_PROC_CHANCE, PET_ABILITY_TYPES, PET_ABILITY_LABELS, getPetTickMs,
    getHarvesterYield, GAERTNER_WURZELWERK, getGaertnerStufe,
} from './engine/PetSystem';
import PlantHoverLayer from './ui/PlantHoverLayer';
import { createHoverStore } from './ui/hoverStore';
import PetDetailModal from './ui/PetDetailModal';
import MailboxModal from './ui/MailboxModal';
import AblageModal, { FremdeVitrineModal } from './ui/AblageModal';
import LogbuchModal from './ui/LogbuchModal';
import SkillTreeModal from './ui/SkillTreeModal';
import useGardenLobby, { letzteWelt, vergissWelt } from './useGardenLobby';
import {
    RARITY_TEXT, RARITY_BORDER, RARITY_DOT, HUD_SURFACE,
    weatherIcon, toolIcon, categoryIcon, formatGold, formatDuration as formatDurationShared,
} from './ui/gardenTokens';
import { GardenModal, GoldTag, TabBar, PrimaryButton, RarityLabel } from './ui/gardenUi';
import { ItemIcon, SpecialItemIcon } from './ui/ItemIcon';
import { itemSpecialName } from './ui/itemTints';
import { TwitchAuthContext } from "../../components/TwitchAuthContext";
import { GardenAdminBrowser } from "../../components/GardenAdminPanel";

function TwitchGlyph({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0 1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" />
    </svg>
  );
}

// ─── Constants ────────────────────────────────────────────────────────────────
const PLAYER_SPEED = 14; // fast, responsive movement
const INCUBATOR_UNLOCK_COSTS = [50000, 500000, 5000000, 50000000]; // slots 2–5
const INTERACT_DIST = 180;
const SHOP_ROTATION_MS = 5 * 60 * 1000;
const TOOL_EGG_ROTATION_MS = 10 * 60 * 1000;
const TARGET_FPS = 60;
// Muss zu STEIN_REIHEN in engine/MapConfig.js passen (dort steht der Aufbau).
const MAX_PLOT_EXPANSIONS = STEIN_REIHEN;
const WORLD_BOOT_MIN_MS = 700;
const WORLD_SLOTS = 8; // dauerhafte Welt: immer 8 Grundstücke (muss zu MAX_SLOTS im Backend passen)
// Wer den Admin-Knopf im HUD sieht. Reine Anzeige — jede Änderung prüft der Server
// noch einmal gegen STREAMER_TWITCH_ID (Backend/routes/adminRoutes.js).
const GARTEN_ADMIN_ID = "160224748";
// Näher an der Farm dran: Pflanzen erscheinen deutlich größer, ohne dass die Welt
// wächst. Zusammen mit den schmaleren Wuchsformen gibt das den ruhigeren Blick.
const WORLD_ZOOM = 1.4;
// Mausrad: rauszoomen, um die Nachbarn zu sehen, reinzoomen für Details. Der Wert
// liegt in einem Ref, nicht im State — das Rad soll nicht bei jeder Raste den
// kompletten Baum neu rendern (dieselbe Überlegung wie beim Hover-Store).
const ZOOM_MIN = 0.45;
const ZOOM_MAX = 2.2;
const ZOOM_SCHRITT = 1.12;   // pro Rastung; multiplikativ, damit es sich gleichmäßig anfühlt

// Tier-Plätze auf dem eigenen Grundstück. Die ersten drei sind geschenkt, die
// restlichen kosten — bewusst im Bereich der teuersten Samen, damit sie ein Ziel
// fürs späte Spiel bleiben und nicht nebenbei abfallen.
// Fassungsvermögen der beiden Ablagen — muss zu KISTE_MAX/VITRINE_MAX in
// Backend/garden/core/economy.js passen (dort wird es durchgesetzt).
const KISTE_MAX = 100;
const VITRINE_MAX = 12;

const PET_SLOTS_BASIS = 3;
const PET_SLOTS_MAX = 6;
// Die alten Preise (1 / 10 / 100 Mrd) lagen so hoch, dass der vierte Platz für die
// meisten unerreichbar blieb und die Plätze 5 und 6 reine Zierde waren.
// An die neue Goldfinder-Kurve angepasst: mit ~47 Mio/h je Stufe-5-Tier
// amortisiert sich jeder Platz in gut drei bis vierzig Stunden.
const PET_SLOT_PREISE = {
    4: 150_000_000,
    5: 600_000_000,
    6: 1_800_000_000,
};
/** Preis für den NÄCHSTEN Platz, oder null wenn schon alle gekauft sind. */
function getPetSlotPreis(aktuelleSlots) {
    const naechster = Math.max(PET_SLOTS_BASIS, Number(aktuelleSlots) || PET_SLOTS_BASIS) + 1;
    return PET_SLOT_PREISE[naechster] ?? null;
}

/**
 * Weltkoordinaten der vier Grundstücks-Gebäude. Wird an zwei Stellen gebraucht:
 * für das eigene Grundstück (engine.areas) und für die Gebäude der anderen, die
 * jeder in seiner Welt sehen soll. Eine gemeinsame Funktion, damit beide Seiten
 * nicht auseinanderlaufen.
 *
 * Jede Stelle liefert ZWEI Y-Werte:
 *   y      Mitte der belegten 1×1-Kachel — Kollision, Näheprüfung, Kachelgrenzen.
 *   fussY  Unterkante derselben Kachel. Darauf steht das Bild (Renderer).
 * Vorher wurde das Bild auf `y` zentriert; bei einem 100 px hohen trash.png hing es
 * damit knapp 20 px UNTER seiner Kachel und ragte am unteren Grundstücksrand auf den
 * Steinweg hinaus. Mit dem Fußpunkt steht jedes Gebäude sauber auf seinem Feld.
 */
function berechneGebaeudePositionen(slot, versatz) {
    const drawY = slot.isTopRow ? slot.anchorY - MAP_CONFIG.territoryHeight : slot.anchorY;
    const rechteMitte = Math.round(
        (slot.x + MAP_CONFIG.dirtOffsetX + MAP_CONFIG.baseDirtWidth + slot.x + MAP_CONFIG.territoryWidth) / 2,
    );
    const linkeMitte = Math.round(slot.x + MAP_CONFIG.dirtOffsetX / 2);
    // `anchorY` liegt IMMER am Kiesweg — bei der oberen Reihe ist das die Unterkante
    // des Grundstücks, bei der unteren die Oberkante. Die Standardplätze gehören in
    // beiden Fällen an dieses Ende, denn von dort kommt man auf sein Grundstück.
    //
    // Für die untere Reihe wurde stattdessen vom GEGENÜBERLIEGENDEN Rand aus gerechnet
    // (anchorY + territoryHeight - 120): Inkubator und Mülleimer der Spieler 5 bis 8
    // standen dadurch am äußersten unteren Ende, und man musste erst das ganze
    // Grundstück hinunterlaufen. Jetzt spiegelt sich die Anordnung sauber.
    const zumWeg = slot.isTopRow ? -1 : 1;
    const standardY = slot.anchorY + zumWeg * 120;
    // Das zweite Gebäude je Seite steht weiter vom Weg weg — bei der unteren Reihe
    // also nach unten statt nach oben.
    const zweiteReihe = standardY + zumWeg * 170;

    const ausVersatz = (v, ersatzX, ersatzY) => {
        if (!v || !Number.isFinite(v.tx) || !Number.isFinite(v.ty)) {
            // Standardplatz: keine Kachel im Raster, also die halbe Kachelhöhe als Fuß.
            return { x: ersatzX, y: ersatzY, fussY: Math.round(ersatzY + TILE_SIZE / 2) };
        }
        const kachelOben = drawY + v.ty * TILE_SIZE;
        return {
            x: Math.round(slot.x + v.tx * TILE_SIZE + TILE_SIZE / 2),
            y: Math.round(kachelOben + TILE_SIZE / 2),
            fussY: Math.round(kachelOben + TILE_SIZE),
        };
    };

    return {
        incubator: ausVersatz(versatz?.incubator, rechteMitte, standardY),
        trash: ausVersatz(versatz?.trash, rechteMitte, zweiteReihe),
        chest: ausVersatz(versatz?.chest, linkeMitte, standardY),
        vitrine: ausVersatz(versatz?.vitrine, linkeMitte, zweiteReihe),
    };
}

/**
 * Standort der Grundstücks-Gebäude als Kachel-Versatz zum eigenen Grundstück.
 * Alles Unplausible wird zu null — dann greift wieder der Standardplatz.
 */
function normalizeGebaeudeVersatz(roh) {
    const eine = (v) => {
        const tx = Number(v?.tx);
        const ty = Number(v?.ty);
        if (!Number.isFinite(tx) || !Number.isFinite(ty)) return null;
        const maxX = Math.round(MAP_CONFIG.territoryWidth / TILE_SIZE) - 1;
        const maxY = Math.round(MAP_CONFIG.territoryHeight / TILE_SIZE) - 1;
        if (tx < 0 || tx > maxX || ty < 0 || ty > maxY) return null;
        return { tx: Math.round(tx), ty: Math.round(ty) };
    };
    return {
        incubator: eine(roh?.incubator),
        trash: eine(roh?.trash),
        chest: eine(roh?.chest),
        vitrine: eine(roh?.vitrine),
    };
}
// Etwas kleiner als INTERACT_DIST (180), aber groß genug, dass der eigene Kasten
// direkt nach „Meine Farm" ansprechbar ist — dort steht man rund 130 Einheiten entfernt.
const MAILBOX_INTERACT_DIST = 150;

// Muss zu CHAT_MAX_LEN in Backend/garden/world/lobby.js passen: der Server kürzt
// ohnehin, das Eingabefeld soll nur nicht mehr annehmen, als ankommt.
const CHAT_MAX_LEN = 200;

// So viele Klicks pro Feld dürfen sich stapeln, während eine Ernte unterwegs ist.
// Genug für die größte Staude (8 Fruchtstände); alles darüber ist Gehämmer und
// würde nur Absagen erzeugen.
const ERNTE_WARTESCHLANGE_MAX = 8;

// ─── Sortierung für Shop und Inventar ────────────────────────────────────────
// Der Samen-Shop kam bisher fest nach Seltenheit und Preis vom Server, das Inventar
// in Einfügereihenfolge. Bei 57 Arten und 50+ Plätzen sucht man sich damit einen Wolf.
const RARITAETS_RANG = { COMMON: 0, UNCOMMON: 1, RARE: 2, EPIC: 3, LEGENDARY: 4, MYTHIC: 5 };
const nachText = (a, b) => String(a || "").localeCompare(String(b || ""), "de");

/** Katalog einmal nach seedId aufschlüsseln — sonst sucht jeder Vergleich neu. */
const KATALOG_NACH_ID = new Map(SEED_CATALOGUE.map((s) => [s.id, s]));

/**
 * Sekunden bis zur ERSTEN Ernte — die einzige Zahl, mit der sich Einmalernten und
 * Dauerträger sinnvoll vergleichen lassen.
 *
 *   Einmalernte  Mitte der Wachstumsspanne (growMin..growMax wird ausgewürfelt).
 *   Dauerträger  Aufbau der Staude PLUS ein Fruchtzyklus — vorher hängt nichts dran
 *                (siehe createFruitSlot: der erste Stand startet ab structureReadyAt).
 *
 * Unbekannte Arten landen ans Ende statt vorne.
 */
function zeitBisErsteErnte(seed) {
    const p = KATALOG_NACH_ID.get(seed?.seedId);
    if (!p) return Number.MAX_SAFE_INTEGER;
    return p.singleUse
        ? ((p.growMinSec || 0) + (p.growMaxSec || 0)) / 2
        : (p.structureGrowSec || 0) + (p.fruitCycleSec || 0);
}

const SHOP_SORTIERUNGEN = [
    { key: "standard", label: "Seltenheit", vergleich: (a, b) => (RARITAETS_RANG[a.rarity] ?? 0) - (RARITAETS_RANG[b.rarity] ?? 0) || (a.shopPrice || 0) - (b.shopPrice || 0) },
    { key: "preis_auf", label: "Preis ↑", vergleich: (a, b) => (a.shopPrice || 0) - (b.shopPrice || 0) },
    { key: "preis_ab", label: "Preis ↓", vergleich: (a, b) => (b.shopPrice || 0) - (a.shopPrice || 0) },
    { key: "dauer_auf", label: "Dauer ↑", vergleich: (a, b) => zeitBisErsteErnte(a) - zeitBisErsteErnte(b) },
    { key: "dauer_ab", label: "Dauer ↓", vergleich: (a, b) => zeitBisErsteErnte(b) - zeitBisErsteErnte(a) },
    // Dauerträger zuerst, innerhalb der Gruppe wie im Standard nach Seltenheit und Preis.
    {
        key: "art",
        label: "Art",
        vergleich: (a, b) => (a.singleUse === false ? 0 : 1) - (b.singleUse === false ? 0 : 1)
            || (RARITAETS_RANG[a.rarity] ?? 0) - (RARITAETS_RANG[b.rarity] ?? 0)
            || (a.shopPrice || 0) - (b.shopPrice || 0),
    },
    { key: "name", label: "Name", vergleich: (a, b) => nachText(a.name, b.name) },
];

const INVENTAR_SORTIERUNGEN = [
    { key: "standard", label: "Zuletzt", vergleich: () => 0 },
    { key: "wert", label: "Wert ↓", vergleich: (a, b) => (Number(b.sellValue) || 0) - (Number(a.sellValue) || 0) },
    { key: "groesse", label: "Größe ↓", vergleich: (a, b) => (Number(b.size) || 0) - (Number(a.size) || 0) },
    { key: "seltenheit", label: "Seltenheit", vergleich: (a, b) => (RARITAETS_RANG[b.rarity] ?? 0) - (RARITAETS_RANG[a.rarity] ?? 0) },
    { key: "name", label: "Name", vergleich: (a, b) => nachText(a.customName || a.name, b.customName || b.name) },
];

/** Stabil sortieren — „Zuletzt" muss die Einfügereihenfolge unangetastet lassen. */
function sortiere(liste, optionen, key) {
    const gewaehlt = optionen.find((o) => o.key === key);
    if (!gewaehlt || gewaehlt.key === "standard") return liste;
    return liste.map((eintrag, i) => ({ eintrag, i }))
        .sort((a, b) => gewaehlt.vergleich(a.eintrag, b.eintrag) || a.i - b.i)
        .map((x) => x.eintrag);
}

/** Schmale Reiterleiste über der Liste. */
function SortierLeiste({ wert, setzen, optionen }) {
    return (
        <div className="flex flex-wrap items-center gap-1 mb-2">
            <span className="text-[10px] uppercase tracking-wider text-slate-600 mr-1">Sortierung</span>
            {optionen.map((o) => (
                <button
                    key={o.key}
                    type="button"
                    onClick={() => setzen(o.key)}
                    className={`px-2 py-1 rounded-sm border text-[10px] font-medium transition-colors ${
                        wert === o.key
                            ? "border-violet-600 bg-violet-600/20 text-violet-200"
                            : "border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800"
                    }`}
                >
                    {o.label}
                </button>
            ))}
        </div>
    );
}


// [R] SPIEGELT die Deko, es dreht sie nicht.
//
// Vorher gab es zwei Wege nebeneinander: Objekte mit `spin` drehten sich in 90°-Schritten,
// alle anderen schalteten durch vier Ansichten. Beides ändert bei 90°/270° bzw. bei den
// Seitenansichten den Fußabdruck — aus einer 1×2-Laterne wurde eine 2×1. Derselbe Klick
// setzte das Objekt damit je nach Ausrichtung woandershin, was beim Platzieren wie Zufall
// aussah. Spiegeln lässt den Fußabdruck unangetastet: der Klick bedeutet immer dasselbe.

const DEFAULT_TOOL_INVENTORY = {
    pickaxeUses: 0,
    pickaxesBought: 0, // 7. ANPASSUNG
    hasShovel: false,
    backpackUpgraded: false,
    backpackLevel: 0,
    plantPots: 0,
    wateringCans: 0,
    petSlots: PET_SLOTS_BASIS,
    hasChest: false,
    hasVitrine: false,
};
const BASE_DIRT_COLS = Math.round(MAP_CONFIG.baseDirtWidth / TILE_SIZE);
const BASE_DIRT_ROWS = Math.round(MAP_CONFIG.baseDirtHeight / TILE_SIZE);
const AREA_IMAGES = {
    seedShop: "/garden-assets/world/seed_shop.png",
    toolShop: "/garden-assets/world/tool_shop.png",
    eggShop: "/garden-assets/world/egg_shop.png",
    decoShop: "/garden-assets/world/deco_shop.png",
    incubator: "/garden-assets/world/incubator.png",
    trash: "/garden-assets/world/trash.png",
    market: "/garden-assets/world/market.png",
    petMarket: "/garden-assets/world/pet_market.png",
    // Noch zu zeichnen — bis die Dateien da sind, greift der Ersatz-Kasten im
    // Renderer (Farbfläche mit Symbol), das Spiel läuft also auch ohne sie.
    chest: "/garden-assets/world/chest.png",
    vitrine: "/garden-assets/world/vitrine.png",
};
/** Beschriftung der vier umstellbaren Bauten — Meldungen und Hinweisbanner. */
const GEBAEUDE_NAMEN = {
    incubator: "Inkubator",
    trash: "Mülleimer",
    chest: "Vorratskiste",
    vitrine: "Vitrine",
};
/**
 * Was von einem FREMDEN Grundstück gezeichnet wird. Nur die Vitrine ist anlaufbar —
 * sie ist zum Herzeigen da. Die drei anderen sind reine Kulisse: sie bekommen einen
 * eigenen Typ ohne Behandlung in activateInteractable, damit kein Klick sie öffnet.
 */
const FREMDE_GEBAEUDE = [
    { key: "incubator", type: "fremdesGebaeude", name: GEBAEUDE_NAMEN.incubator, anlaufbar: false },
    { key: "trash", type: "fremdesGebaeude", name: GEBAEUDE_NAMEN.trash, anlaufbar: false },
    { key: "chest", type: "fremdesGebaeude", name: GEBAEUDE_NAMEN.chest, anlaufbar: false },
    { key: "vitrine", type: "fremdeVitrine", name: GEBAEUDE_NAMEN.vitrine, anlaufbar: true },
];
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
    // Im Shop dasselbe Bild wie später auf dem Grundstück — man kauft sichtbar
    // das, was danach dort steht, statt eines Ersatz-Emojis.
    chest: AREA_IMAGES.chest,
    vitrine: AREA_IMAGES.vitrine,
};
const TERRAIN_ASSET_IMAGES = [
    "/garden-assets/structure/gras1.png",
    "/garden-assets/structure/gras2.png",
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
    // Umlaute MÜSSEN hier stehen: die automatische Ableitung zerlegt "ö" zu "o"
    // und käme auf phonix.png / gotterwesen.png — die Dateien heißen aber
    // phoenix.png / goetterwesen.png. Ohne Eintrag wären beide Tiere unsichtbar.
    "Phönix": "/garden-assets/animals/phoenix.png",
    "Götterwesen": "/garden-assets/animals/goetterwesen.png",
    Tiger: "/garden-assets/animals/tiger.png",
    Drache: "/garden-assets/animals/drache.png",
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

/**
 * Spiegel von EGG_SHOP_CATALOGUE in Backend/routes/gardenGameRoutes.js.
 *
 * `level` je Eintrag ist neu: vorher hing die Fähigkeitsstufe allein an der
 * Seltenheit des EIS, die hatchTable bestimmte nur das Bild. Ein Götterwesen mit
 * 1 % Chance war damit exakt so viel wert wie ein Einhorn mit 40 % — die ganze
 * Spannung des Gacha war Attrappe.
 */
const EGG_SHOP_CATALOGUE = [
    { id: "common_egg", name: "Common Egg", emoji: "🥚", image: "/garden-assets/eggs/common_egg.png", rarity: "COMMON", price: 100000,
      hatchTable: [{ type: "Huhn", chance: 70, level: 1 }, { type: "Ente", chance: 25, level: 1 }, { type: "Schwein", chance: 5, level: 2 }] },
    { id: "uncommon_egg", name: "Uncommon Egg", emoji: "🥚", image: "/garden-assets/eggs/uncommon_egg.png", rarity: "UNCOMMON", price: 2000000,
      hatchTable: [{ type: "Ente", chance: 60, level: 2 }, { type: "Katze", chance: 30, level: 2 }, { type: "Waschbär", chance: 10, level: 3 }] },
    { id: "rare_egg", name: "Rare Egg", emoji: "🥚", image: "/garden-assets/eggs/rare_egg.png", rarity: "RARE", price: 20000000,
      hatchTable: [{ type: "Kuh", chance: 60, level: 3 }, { type: "Schaf", chance: 30, level: 3 }, { type: "Pferd", chance: 10, level: 4 }] },
    { id: "epic_egg", name: "Epic Egg", emoji: "🥚", image: "/garden-assets/eggs/epic_egg.png", rarity: "EPIC", price: 150000000,
      hatchTable: [{ type: "Esel", chance: 55, level: 4 }, { type: "Hund", chance: 30, level: 4 }, { type: "Einhorn", chance: 10, level: 5 }, { type: "Tiger", chance: 5, level: 5 }] },
    { id: "legendary_egg", name: "Legendary Egg", emoji: "🥚", image: "/garden-assets/eggs/legendary_egg.png", rarity: "LEGENDARY", price: 800000000,
      hatchTable: [{ type: "Einhorn", chance: 40, level: 4 }, { type: "Tiger", chance: 30, level: 5 }, { type: "Phönix", chance: 20, level: 5 }, { type: "Drache", chance: 9, level: 5 }, { type: "Götterwesen", chance: 1, level: 5 }] },
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

// Changelog als Daten statt als handgebautes JSX — neue Einträge sind ein Objekt,
// kein weiterer verschachtelter Block.
const CHANGELOG_ENTRIES = [
    {
        version: "v3.2",
        title: "Chat, Sortierung und viel Kleinkram, der lange genervt hat",
        groups: [
            {
                heading: "Chat und Mitspieler",
                items: [
                    "Neu: ein Chat für die ganze Welt, rechts unter den Tieren. Er klappt per Klick auf und bleibt offen — beim Tippen soll er nicht zuschnappen, sobald die Maus danebengerät. Solange er zu ist, zählt ein Abzeichen die ungelesenen Zeilen.",
                    "Die Anwesenheitsliste oben links klappt jetzt auf und zeigt alle Namen samt Platznummer. Ein Klick auf einen Namen bringt dich direkt zu dessen Grundstück — genauso wie ein Klick auf den Namen im Chat.",
                    "Von fremden Grundstücken sind jetzt alle vier Bauten zu sehen, nicht mehr nur die Vitrine. Anfassen darfst du weiterhin nur die Vitrine: was in Inkubator, Mülleimer und Kiste liegt, geht niemanden außer dem Besitzer etwas an.",
                ],
            },
            {
                heading: "Kiste und Inventar",
                items: [
                    "Die Vorratskiste nimmt jetzt alles: Ernte, Samen, Eier, Deko und Tiere. Jedes Stück merkt sich, woher es kam, und geht beim Herausholen genau dorthin zurück. Die Vitrine bleibt bei der Ernte — ihr Inhalt geht an alle Mitspieler und ist auf Früchte zugeschnitten.",
                    "Zwei neue Knöpfe in der Mitte: alles auf einmal einlagern und alles auf einmal herausholen. Läuft die Kiste dabei voll oder der Rucksack über, steht in der Meldung, was liegen geblieben ist.",
                    "In Kiste und Vitrine steht jetzt der Verkaufswert jedes Stücks und die Summe über der Spalte. Vorher sah man eingelagert nicht mehr, was etwas wert ist.",
                    "Auch im Inventar steht oben, was deine Ernte insgesamt einbringt.",
                    "Sortierung für Inventar und Samen-Shop: im Rucksack nach Wert, Größe, Seltenheit oder Name, im Shop nach Seltenheit, Preis oder Name.",
                    "Tiere tragen im Inventar ihren Namen unter dem Bild — bei drei Hühnern war sonst nur am Hovern zu erkennen, welches Chicky ist.",
                ],
            },
            {
                heading: "Shop",
                items: [
                    "Gießkannen und Pflanztöpfe gibt es jetzt zehnmal pro Lieferung statt fünfmal.",
                    "Die Spitzhacke ist immer vorrätig. Das Limit von einem Stück pro Lieferung hieß in der Praxis: zehn Minuten warten. Gebremst wird sie weiterhin über ihren Preis, der mit jedem Kauf um 30 % steigt — der nächste Preis steht jetzt in der Zeile.",
                    "Die Tier-Plätze sind deutlich billiger geworden: 200 Millionen, 1 Milliarde und 2 Milliarden statt 1, 10 und 100 Milliarden. Der vierte Platz war vorher für die meisten unerreichbar.",
                ],
            },
            {
                heading: "Grundstück und Deko",
                items: [
                    "Inkubator, Mülleimer, Kiste und Vitrine stehen jetzt sauber auf ihrer Kachel, statt ein Stück darunter zu hängen. Am unteren Grundstücksrand ragte vorher jedes davon auf den Steinweg hinaus.",
                    "[R] spiegelt Deko, statt sie zu drehen. Drehen hat den belegten Platz mitgetauscht — aus einer 1×2-Laterne wurde eine 2×1, und derselbe Klick setzte sie mal hierhin, mal dorthin.",
                    "Deko wird jetzt immer von der angeklickten Kachel nach oben aufgebaut, die Kachel ist also die untere linke Ecke. Nur diese eine muss freie Wiese sein — was darüber liegt, darf über den Acker ragen. Damit bekommt man Laternen endlich auch auf den schmalen Streifen unter dem Acker.",
                ],
            },
            {
                heading: "Tiere und Inkubator",
                items: [
                    "Tiere sind jetzt je nach Art verschieden groß: ein Huhn ist deutlich kleiner als ein Pferd, und Drache und Götterwesen überragen alles andere.",
                    "Der Inkubator meldet sich, wenn etwas fertig ist: eine Nachricht, eine Zeile im Menü rechts und ein Marker über dem Gerät auf dem Grundstück. Vorher lief die Brutzeit bis zu zwei Stunden, ohne dass irgendetwas darauf hinwies.",
                    "Der Kaufknopf für Tier-Plätze war zwischen den Tierzeilen kaum zu erkennen und sitzt jetzt abgesetzt darunter.",
                ],
            },
            {
                heading: "Logbuch",
                items: [
                    "Neu aufgebaut: ein Klick auf eine Art klappt darunter alles aus, was es davon zu farmen gibt — Größe 1 und Größe 50, Golden, Rainbow und jeder Wetter-Effekt, jeweils mit dem eingefärbten Bild der Frucht. Was du schon hattest, ist hell und abgehakt, der Rest ausgegraut.",
                    "Vorher stand all das als eine Kette kleiner Textmarken hinter dem Namen; welche Ausprägungen es überhaupt gibt, war daran nicht abzulesen.",
                ],
            },
            {
                heading: "Optik",
                items: [
                    "Große Früchte werden in der Hand jetzt auch groß gezeichnet. Eine Honigmelone der Größe 50 ist fast so groß wie du selbst.",
                    "Sonderformen und Wetter-Effekte färben die Frucht jetzt überall ein, wo sie auftaucht: in Kiste, Vitrine, Briefkasten und auf der Hover-Karte. Bisher ging das nur im Rucksack und in der Schnellleiste.",
                ],
            },
            {
                heading: "Behoben",
                items: [
                    "Schwerwiegend: Mit einer frischen Farm ließ sich nichts kaufen. Der Browser zeigte 500 Gold, der Server wusste von 0 — sein Spielstand entstand erst beim ersten Speichern, und Gold wird dort grundsätzlich aus dem bestehenden Stand übernommen. Wer davon betroffen war, bekommt sein Startkapital beim nächsten Laden zurück.",
                    "Schwerwiegend: Durch schnelles Klicken ließen sich mehr Gießkannen, Töpfe, Spitzhacken und Eier kaufen, als es überhaupt gab — jeder Klick kam durch dieselbe Prüfung, weil der Bestand erst nach der Antwort des Servers abgezogen wurde. Dasselbe galt für Schaufel, Kiste, Vitrine und die Rucksack-Upgrades, die sich mehrfach bezahlen ließen.",
                    "Schwerwiegend: Der Tool- und der Eier-Shop füllten sich alle 30 Sekunden von selbst wieder auf, ohne dass die Lieferung durch war. Gekauft, kurz gewartet, wieder da.",
                    "Verschenkte Früchte kamen beim Empfänger mit „0 Gold\" an. Der Wert reist bewusst nicht mit der Sendung — er wird jetzt beim Abholen neu gerechnet.",
                    "Das Ernten fühlte sich an, als wäre die Maus gedrosselt. Zwei Ursachen: Klicks während einer laufenden Ernte wurden weggeworfen statt angestellt, und nach jeder Frucht übernahm der Browser die Pflanze komplett vom Server — samt aller Fruchtstände, die seit dem letzten Speichern reif geworden waren. An einer Staude mit acht reifen Früchten kam so genau eine durch.",
                    "Der Marker über dem Inkubator wurde nie gezeichnet, und ein Platz ohne Ei riss den ganzen Spielbildschirm mit.",
                    "Bei den Grundstücken unterhalb des Weges standen Inkubator und Mülleimer am äußersten unteren Ende. Man musste erst das ganze Grundstück hinunterlaufen; jetzt stehen sie wie oben am Weg.",
                    "Die Gold-Bestenliste klappte hinter die Tierliste darunter.",
                    "Die Hover-Karte blieb über dem Spiel stehen, wenn man im Inventar einen Gegenstand anklickte.",
                    "Bei mehreren gleichartigen Eiern oder Dekos lagerte ein Klick auf das dritte Stück das erste ein.",
                    "Tiere verschiedener Stufen erzeugten laufend „429 Too Many Requests\" in der Browser-Konsole: der Browser fragte im Takt des schnellsten Tieres an, der Server rechnet aber pro Tier mit dessen eigener Stufe.",
                ],
            },
        ],
    },
    {
        version: "v3.1",
        title: "Lager, Logbuch und ein hartnäckiger Erntefehler",
        groups: [
            {
                heading: "Kiste, Vitrine und Logbuch",
                items: [
                    "Neu im Tool-Shop: die Vorratskiste. 100 Plätze für Ernte, die keinen Rucksackplatz belegen — endlich ein Ort für alles, was du nicht sofort verkaufen willst.",
                    "Ebenfalls neu: die Vitrine mit 12 Schauplätzen. Was dort steht, sehen alle in der Welt: sie können an deinem Grundstück vorbeikommen, die Vitrine anklicken und sich deine Prachtstücke mit Größe, Sonderform und Wetter-Effekt ansehen — anfassen aber nicht.",
                    "Beide stehen auf deinem Grundstück und lassen sich frei umstellen.",
                    "Neues Logbuch oben rechts: für jede Art die kleinste und größte Größe, die du je geerntet hast, dazu jede Veredelung, die dir untergekommen ist. Mit Suche und einem Filter für das, was du schon hattest.",
                ],
            },
            {
                heading: "Briefkasten",
                items: [
                    "Eine Sendung nimmt jetzt bis zu 12 Gegenstände auf, statt einem Samen oder einer Frucht. Gold und Nachricht kommen wie gehabt obendrauf.",
                    "Gleiche Sachen stehen als eine Zeile mit Anzahl da — sieben identische Karotten wählst du mit zwei Klicks statt mit sieben.",
                    "Läuft das Sendelimit, steht jetzt dabei, wie lange es noch dauert. Vorher war es ein stummer Fehler.",
                ],
            },
            {
                heading: "Grundstück, Tiere und Kamera",
                items: [
                    "Inkubator und Mülleimer lassen sich umstellen: Knopf im jeweiligen Fenster, dann einmal auf die Wiese klicken. Beide unabhängig voneinander.",
                    "Ab dem vierten Tier-Platz kannst du nachkaufen — bis zu sechs Tiere auf dem Grundstück. Die Plätze kosten 1, 10 und 100 Milliarden und werden direkt in der Tierliste angeboten.",
                    "Der Mülleimer nimmt jetzt auch Samen. Gleiche Sorten stehen zusammengefasst da, mit „Einen\" und „Alle\".",
                    "Mausrad zoomt die Kamera zwischen 32 % und 157 %. Weicht der Zoom vom Standard ab, steht oben rechts ein Prozentwert, der ihn per Klick zurücksetzt.",
                    "Pflanzen auf fremden Äckern lassen sich anhovern: Größe, Wert, Restzeit und Fruchtstände wie bei dir. Nur zum Ansehen — geerntet wird dort nichts.",
                    "Mehrkachelige Deko wächst nach unten, wenn nach oben kein Platz ist. Laterne und Statue passen damit auch auf den Wiesenstreifen direkt am Acker.",
                ],
            },
            {
                heading: "Behoben",
                items: [
                    "Schwerwiegend: Dauerträger ließen sich oft nicht ernten („Noch nicht reif.\"), obwohl reife Früchte am Strauch hingen. Der Server hat die Umstellung von Struktur auf Frucht zwar ausgeliefert, aber nie gespeichert — und den ersten Fruchtzyklus ab dem Moment gerechnet, in dem er das nächste Mal hinsah, statt ab dem Reifezeitpunkt. Eine Staude, die über Nacht fertig wurde, stand dadurch noch einen ganzen Zyklus leer.",
                    "Wer gießt und sofort erntet, bekam ebenfalls ein „Noch nicht reif.\": der Acker liegt im Browser und wandert erst mit dem Speichern zum Server. Jetzt wird der Stand nachgereicht und die Ernte ein zweites Mal versucht.",
                    "Schnelles Klicken auf einen Dauerträger meldete Fehler, sobald mehr Klicks rausgingen als Früchte reif waren. Das ist jetzt ein stilles Nichts-Passiert statt einer Fehlermeldung — und kann keine Frucht doppelt auszahlen.",
                    "Schwerwiegend: Beim Verschenken mehrerer Sachen konnte ein Gegenstand verloren gehen. Wurde der Samen schon abgezogen und scheiterte danach die Prüfung des Tieres, war der Samen weg, ohne dass die Sendung zustande kam. Jetzt wird erst alles geprüft und dann in einem Schritt abgebucht.",
                    "Verschenktes verschwindet sofort aus dem Rucksack. Vorher blieb ein weggeschickter Samen bis zur Antwort des Servers auswählbar — und ließ sich in der Zwischenzeit noch einpflanzen.",
                    "Tiere kamen beim Empfänger als Ersatz-Emoji statt als Tier an, im Briefkasten wie im Rucksack. Dasselbe galt für verschenkte Samen. Der Bildpfad wird jetzt beim Empfänger aus der Art abgeleitet.",
                    "Beim Samenkauf zählte der Ernte-Teil des Rucksacks nicht mit — die Platzprüfung sah immer nur die Samen.",
                ],
            },
        ],
    },
    {
        version: "v3.0",
        title: "Die große Überarbeitung",
        groups: [
            {
                heading: "Gemeinsame Welt",
                items: [
                    "Die Karte hat jetzt immer acht Grundstücke und ist dauerhaft bewohnt — es gibt keinen Einzelspieler-Modus mehr. Allein startest du oben links.",
                    "Du siehst andere Farmer in Echtzeit über die Karte laufen, samt Namensschild, Abzeichen und ihrem Outfit.",
                    "Fremde Äcker werden live angezeigt: Pflanzen, Deko und Tiere der anderen sind sichtbar.",
                    "Private Welten mit fünfstelligem Code: eine eigene aufmachen, den Code weitergeben, gemeinsam farmen. Der Code steht oben rechts und lässt sich per Klick kopieren.",
                    "Ist eine öffentliche Welt voll, landest du automatisch in der nächsten statt abgewiesen zu werden.",
                    "Deine Farm zieht mit: der Acker hängt an deinem Konto, nicht an der Welt.",
                ],
            },
            {
                heading: "Briefkasten",
                items: [
                    "An jedem Grundstück steht ein Briefkasten. Am eigenen liest du Post, an fremden hinterlegst du Gold, Nachrichten und Samen.",
                    "Der Empfänger ergibt sich aus dem Briefkasten, vor dem du stehst — kein Name einzutippen, keine Vertipper.",
                    "Beträge prüft der Server: nur ganze Zahlen über 0, und nur wenn du sie wirklich besitzt. Es kann kein Gold aus dem Nichts entstehen.",
                    "Ein Hinweis am Kasten zeigt, wie viele Sendungen auf dich warten.",
                ],
            },
            {
                heading: "Acker und Pflanzen",
                items: [
                    "Jede Art hat eine eigene Wuchsform: Gurken und Trauben ranken am Spalier, Karotten sitzen im Erdhügel, Bambus wächst als Halm, Beeren am Strauch.",
                    "Alles wird nach Tiefe gezeichnet — du läufst hinter hohen Pflanzen und Gebäuden vorbei statt immer davor.",
                    "Große Pflanzen decken die Reihe dahinter nicht mehr zu, und über jeder erntereifen Pflanze schwebt ein Marker in Seltenheitsfarbe.",
                    "Bodenschatten und leichter Wind für Pflanzen, Deko und Tiere.",
                    "Neue Strukturen und Bodentexturen, dazu Zäune als Grundstücksgrenze.",
                    "Bei Schnee liegen Schneehaufen auf der Karte, bei Regen sammeln sich Pfützen.",
                ],
            },
            {
                heading: "Tiere",
                items: [
                    "Tiere lassen sich benennen; der Name steht für alle sichtbar über ihnen.",
                    "Neue Fähigkeit Erntehelfer: erntet reife Pflanzen selbstständig ab, 1 bis 8 Stück je nach Stufe.",
                    "Tiere können golden oder regenbogenfarben schlüpfen.",
                    "Eigene Laufbilder für Drache, Einhorn und Katze — weitere folgen.",
                    "Ein Klick auf ein Tier in der Liste zeigt Fundhöhe, Takt, Chance und Verkaufspreis.",
                    "Tiger, Phönix, Drache und Götterwesen haben endlich ihr eigenes Bild statt eines Platzhalters — sie waren nur wegen eines Namensfehlers unsichtbar.",
                    "Legendäre Eier: Einhorn 40 %, Tiger 30 %, Phönix 20 %, Drache 9 %, Götterwesen 1 %.",
                ],
            },
            {
                heading: "Gold und Ernte gehören jetzt dem Server",
                items: [
                    "Ernten, Verkaufen, Kaufen, Tierverkäufe und Tierfunde rechnet ab sofort der Server. Dein Browser meldet nur noch, was du tun willst.",
                    "Der Verkaufswert wird beim Verkauf neu aus Größe, Sonderform und Wetter berechnet — ein manipulierter Wert im Spielstand hat keine Wirkung mehr.",
                    "Ein Kauf wird erst gebucht, wenn der Server die Deckung bestätigt hat. Gold kann dabei nie unter null fallen.",
                    "Ein Doppelklick auf „Ernten\" oder „Kaufen\" zählt nur noch einmal.",
                    "Goldfunde deiner Tiere würfelt der Server und begrenzt ihren Takt — ein schnellerer Browser findet nicht mehr Gold.",
                    "Dein Kontostand überlebt jetzt auch dann, wenn zwei Tabs gleichzeitig offen sind.",
                ],
            },
            {
                heading: "Oberfläche",
                items: [
                    "HUD, Shops, Inventar und Menüs komplett überarbeitet: ruhigere Flächen, klare Icons statt Emojis.",
                    "Neue Hover-Karte an Pflanzen mit erwartetem Verkaufswert, Wuchsform, Restzeit und einer Zeile je Fruchtstand.",
                    "Wetter-Effekte zeigen endlich ihren echten Bonus: Nass +25 %, Gefroren +50 %, Aufgeladen +100 %, Mondlicht +200 %.",
                    "Info-Knopf im Samen-Shop mit Wachstumszeiten, Erträgen und Anzahl der Fruchtstände.",
                    "Mülleimer auf dem Grundstück: nicht mehr benötigte Deko endgültig wegwerfen.",
                    "Deko lässt sich beim Platzieren mit R drehen — Pool und Bank in der Ebene, anderes über Ansichten.",
                ],
            },
            {
                heading: "Leistung",
                items: [
                    "Im Leerlauf fallen statt 1541 nur noch 4 Oberflächen-Aktualisierungen in vier Sekunden an; die dafür nötige Rechenzeit sank von 1427 auf 23 Millisekunden.",
                    "Ein Schwenk mit der Maus über den Acker kostet 30 statt 518 Aktualisierungen.",
                    "Kein Einzelbild mehr über 20 Millisekunden — spürbar weniger Mikroruckler.",
                    "Eine versteckte Endlosschleife im Samen-Shop entfernt, die den Server ununterbrochen abgefragt hätte, sobald eine Rotation ohne Samen zurückkommt.",
                    "Grafiken zugeschnitten und verkleinert: rund 25 Prozent weniger Ladelast.",
                ],
            },
            {
                heading: "Behoben",
                items: [
                    "Zwei gefrorene Früchte am selben Strauch: das Ernten der einen setzte die andere zurück. Wetter-Effekte gehören jetzt zur einzelnen Frucht.",
                    "Beim Ernten wurde gefühlt immer nur die erste Frucht abgezogen — jetzt zuerst die am längsten reife, und die Hover-Karte sortiert reife nach vorn.",
                    "Die Hover-Karte zeigte nach dem Ernten weiter den alten Stand.",
                    "Balancing-Änderungen wurden bei jedem Serverstart wieder rückgängig gemacht, weil das Migrationsskript veraltete Werte mitbrachte. Spinat, Kohl, Zucchini und Blaubeere stehen jetzt korrekt.",
                    "Alte Pflanzen zeigten weiterhin ihre alten Strukturen; Bilder werden jetzt immer neu bestimmt statt aus dem Spielstand gelesen.",
                    "Die anklickbare Fläche von Tieren blieb dort liegen, wo das Tier abgesetzt wurde — ein Klick auf den Pool öffnete das Tierfenster.",
                    "Der Waschbär war unsichtbar, weil sein Bild anders hieß als erwartet.",
                    "Bäume hatten einen zweiten Stamm unter dem eigentlichen.",
                    "Das eigene Grundstück zeigte „Zu verkaufen“ statt deines Namens.",
                    "Inkubator und Mülleimer wurden über den Charakter gezeichnet, Marktdächer von den Grundstücken abgeschnitten.",
                    "Die Kategorienleiste in Shop und Inventar ließ sich minimal verschieben.",
                    "Ernte konnte bei alten Spielständen abstürzen, wenn Pflanzendaten unvollständig waren.",
                    "Die Schnellreise zum Shop-Areal setzte dich knapp außerhalb der Reichweite ab — der Öffnen-Knopf erschien nicht.",
                    "Schwerwiegend: Ein Browser, der noch nicht fertig geladen hatte, konnte beim Speichern Deko, Tiere und Eier auf dem Server löschen. Der Server nimmt einen rundum leeren Spielstand jetzt nicht mehr an, und der Browser speichert erst, wenn deine Farm geladen ist.",
                ],
            },
        ],
    },
    {
        version: "v2.1",
        title: "Optik & Bedienung",
        groups: [
            {
                heading: "Acker & Pflanzen",
                items: [
                    "Jede Art hat jetzt eine eigene Wuchsform: Gurke und Traube ranken am Spalier, Karotten sitzen im Erdhügel, Bambus wächst als Halm, Drachenfrucht am Pfosten.",
                    "Pflanzen, Deko, Tiere und dein Charakter werden nach Tiefe sortiert gezeichnet — du läufst hinter hohen Pflanzen vorbei statt immer davor.",
                    "Große Pflanzen decken die Reihe dahinter nicht mehr zu, und über jeder erntereifen Pflanze schwebt ein Marker in Seltenheitsfarbe.",
                    "Bodenschatten und leichter Wind für Pflanzen, Deko und Tiere.",
                    "Tiere unterscheiden sichtbar zwischen Laufen und Grasen.",
                ],
            },
            {
                heading: "Oberfläche",
                items: [
                    "HUD, Shops und Inventar komplett überarbeitet: ruhigere Flächen, klare Icons statt Emojis.",
                    "Neue Hover-Karte an Pflanzen — mit erwartetem Verkaufswert, Wuchsform, Restzeit und einer Zeile pro Fruchtstand.",
                    "Wetter-Effekte zeigen endlich ihren echten Bonus (Nass +25 %, Gefroren +50 %, Aufgeladen +100 %, Mondlicht +200 %).",
                    "Tiere lassen sich anklicken: eigenes Fenster mit Fundhöhe, Takt, Chance und Verkaufspreis.",
                    "Wetter-Effekte sind jetzt auch im Inventar am Item zu sehen, nicht nur auf dem Acker.",
                    "Deko lässt sich beim Platzieren mit R in 90°-Schritten drehen.",
                ],
            },
            {
                heading: "Behoben",
                items: [
                    "Waschbär-Grafik wurde wegen eines Dateinamens nie geladen und blieb unsichtbar.",
                ],
            },
        ],
    },
    {
        version: "v2.0",
        title: "Economy Update",
        groups: [
            {
                heading: "Wirtschaft",
                items: [
                    "Preise, Erträge und Wachstumszeiten auf ein neues Balancing umgestellt.",
                    "Einige Pflanzen haben sehr kurze Cooldowns ab 4 Sekunden — aktives Spielen lohnt sich.",
                    "Neue Ziele im Milliarden-Bereich, unter anderem die Mondblume.",
                    "Bereits gepflanzte Samen wurden automatisch migriert.",
                ],
            },
        ],
    },
    {
        version: "v1.1",
        title: "Alpha",
        groups: [
            {
                heading: "Neu",
                items: [
                    "Einheitliche Skins und angepasste Größen von Strukturen und Charakteren.",
                    "Überarbeitete Felder im 2×2-Design, neue Dekorationen in verschiedenen Größen.",
                    "Hintergrundmusik mit eigenem Regler, neue Sounds für Ernten, Verkaufen und Pflanzen.",
                    "Sub-Bonus (+50 % Verkauf) und Beta-Tester-Abzeichen.",
                    "Tiere können an einem eigenen Stand verkauft werden.",
                    "Deko, Tiere und Werkzeuge belegen keine Inventar-Slots mehr.",
                ],
            },
            {
                heading: "Behoben",
                items: [
                    "Inventar ist nicht mehr unbegrenzt groß.",
                    "Shop-Bestände werden korrekt aktualisiert und nicht mehr ungewollt zurückgesetzt.",
                    "Spezial-Overlays (Gold, Rainbow, Wetter) liegen bei Mehrfachpflanzen pro Frucht statt auf der ganzen Struktur.",
                    "Gestreckte Pflanzen und Dekorationen rendern wieder im richtigen Seitenverhältnis.",
                    "Eier- und Pflanzen-Timer laufen serverseitig statt lokal.",
                ],
            },
        ],
    },
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

/**
 * Preis der nächsten Spitzhacke.
 *
 * BALANCING: war 100.000 · 1,3^n. Über die 196 Steinfelder (49 Hacken à 4
 * Aufladungen) summierte sich das auf 128,6 MILLIARDEN — deutlich mehr, als das
 * freigelegte Feld je einbringt. Die letzten Reihen waren damit unerreichbar,
 * und der „Bergmann"-Skill hat als Save-Chance auf einer Exponentialkurve
 * gleich 90 % der Kosten gestrichen.
 *
 * 40.000 · 1,16^n landet beim Vollausbau bei rund 360 Millionen; die letzte
 * Hacke kostet 57 Mio, also gut zwei Minuten Lategame-Einkommen.
 */
function getPickaxePrice(boughtCount = 0) {
    return Math.floor(40000 * Math.pow(1.16, Math.max(0, boughtCount)));
}

/**
 * Vorschaubild eines Tieres. Nutzt das echte Sprite aus /garden-assets/animals/ —
 * vorher wurde hier eine SVG-Grafik mit Emoji gebaut, weshalb im Brutkasten
 * Emojis statt der gezeichneten Tiere standen.
 */
function buildPetPreviewImage(petType) {
    return getPetSpriteImage(petType);
}

function normalizeToolInventory(inv) {
    const merged = {
        ...DEFAULT_TOOL_INVENTORY,
        ...(inv && typeof inv === "object" ? inv : {}),
    };
    const backpackLevel = Number(merged.backpackLevel || (merged.backpackUpgraded ? 1 : 0)) || 0;
    merged.backpackLevel = Math.max(0, backpackLevel);
    merged.backpackUpgraded = merged.backpackLevel > 0;
    // Alte Spielstände kennen das Feld nicht — die bekommen die drei Grundplätze.
    const slots = Number(merged.petSlots);
    merged.petSlots = Number.isFinite(slots)
        ? Math.max(PET_SLOTS_BASIS, Math.min(PET_SLOTS_MAX, Math.round(slots)))
        : PET_SLOTS_BASIS;
    return merged;
}

/**
 * Welche Gegenstände in der Leiste zeigen beim Hovern ihre Karte?
 *
 * Samen standen bisher nicht drin, obwohl der Tooltip längst einen eigenen Zweig
 * für sie hat (Name, Seltenheit, Preis) — er wurde nur nie ausgelöst. Deko kommt
 * mit dazu: dieselbe Karte, dieselbe Frage („was ist das?").
 */
function hatTooltip(item) {
    const art = item?._type;
    return art === "plant" || art === "pet" || art === "seed" || art === "deco";
}

/**
 * Grüner Daumen: eine frisch gesetzte Pflanze wächst schneller.
 *
 * Wirkt nur beim PFLANZEN, nicht rückwirkend auf schon stehende — sonst würde ein
 * später gelernter Punkt reihenweise Beete auf einen Schlag reif machen. Die
 * Fruchtstände legt `ensurePerennialFruitingState` erst nach dem Aufbau an; sie
 * erben den verkürzten Zyklus dann von selbst.
 */
function wachstumBeschleunigen(plant, anteil, now) {
    const faktor = 1 - Math.max(0, Math.min(0.5, anteil));
    if (faktor >= 1 || !plant) return plant;
    if (Number.isFinite(plant.growthMs)) {
        plant.growthMs = Math.max(3000, Math.round(plant.growthMs * faktor));
    }
    if (Number.isFinite(plant.structureReadyAt)) {
        plant.structureReadyAt = now + Math.max(2000, Math.round((plant.structureReadyAt - now) * faktor));
    }
    if (Number.isFinite(plant.structureGrowthMs)) {
        plant.structureGrowthMs = Math.max(2000, Math.round(plant.structureGrowthMs * faktor));
    }
    if (Number.isFinite(plant.fruitCycleMs)) {
        plant.fruitCycleMs = Math.max(2000, Math.round(plant.fruitCycleMs * faktor));
    }
    return plant;
}

/** Erstes freies Ackerfeld — Notnagel, wenn zwei Pflanzen auf dieselbe Kachel fallen. */
function freiesAckerfeld(belegt) {
    for (let y = 0; y < BASE_DIRT_ROWS; y++) {
        if (y === 7) continue;                       // Weg quer durch den Acker
        for (let x = 0; x < BASE_DIRT_COLS; x++) {
            if (x === 7) continue;                   // senkrechter Weg
            const k = `${x}_${y}`;
            if (!belegt[k]) return k;
        }
    }
    return null;
}

/**
 * Kennung dieses Browser-Tabs. Bewusst ein Modul-Konstante und NICHT im
 * sessionStorage: sie soll je Seitenaufruf neu sein, damit zwei Tabs sich
 * unterscheiden — auch zwei Tabs desselben Fensters.
 *
 * Der Server merkt sich, wer zuletzt gespeichert hat. Damit lässt sich der eigene
 * verspätete Speicherstand (nachreichen ist richtig) von einem zweiten Tab
 * unterscheiden (nachreichen würde dessen Rucksack überschreiben).
 */
const TAB_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

/**
 * Rucksack-Upgrade: +10 Plätze je Stufe.
 *
 * BALANCING: war 25.000 · 1,85^n und mit 15 Stufen (200 Plätze) nach 299 Mio
 * durch — ein Rundungsfehler im Lategame. Schlimmer: der Deckel von 200 Plätzen
 * stand nur serverseitig, `backpackLevel` lief unbegrenzt weiter. Ab Stufe 15
 * kostete jedes Upgrade Millionen UND GAB NICHTS. Jetzt 25 Stufen bis 300 Plätze
 * mit flacherer Kurve (Vollausbau ~2,1 Mrd) und hartem Deckel im Kaufweg.
 */
const BACKPACK_MAX_LEVEL = 25;
function getBackpackUpgradePrice(level = 0) {
    return Math.max(1, Math.floor(20000 * Math.pow(1.55, Math.max(0, level))));
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
        // Wege gehören nie in die Freigabeliste. Diese Funktion läuft auf JEDEM Weg
        // in den Spielstand — Serverantwort, Reihenwechsel, Spitzhacke —, deshalb
        // sitzt die Klemme hier und nicht an den einzelnen Aufrufern.
        if (x === 7 || istWegReihe(y)) continue;
        set.add(`${x}_${y}`);
    }
    return [...set];
}

/**
 * Rückfall für alte Spielstände, die nur eine ANZAHL Erweiterungsreihen kannten und
 * noch keine Liste einzelner Felder.
 *
 * Die beiden Holzwege und die Wegspalte werden ausgelassen. Vorher waren sie mit
 * dabei: der Rückfall gab die komplette Reihe frei, `getHoveredCell` hielt die
 * Wegkacheln damit für nutzbaren Acker, und man konnte mitten auf den Steg pflanzen —
 * auf Feldern, die sich mit der Spitzhacke nie freilegen lassen.
 */
function unlockedCellsFromLegacyExpansions(expansions, isTopRow = true) {
    const level = Math.max(0, Math.min(MAX_PLOT_EXPANSIONS, Number(expansions) || 0));
    const out = [];
    for (let row = 1; row <= level; row++) {
        if (row === 1 || row === MITTELWEG_REIHE) continue;   // Holzwege
        const y = isTopRow ? -row : (BASE_DIRT_ROWS + row - 1);
        for (let x = 0; x < BASE_DIRT_COLS; x++) {
            if (x === 7) continue;                            // senkrechter Holzweg
            out.push(`${x}_${y}`);
        }
    }
    return normalizePlotUnlockedCells(out);
}

/**
 * Freigelegte Steinfelder aus dem Spielstand.
 *
 * BEWUSST OHNE Prüfung auf die Reihe. Vorher wurde hier fest gegen die obere Reihe
 * gefiltert: wer aus der unteren Reihe kam, verlor damit beim Laden jedes einzeln
 * freigelegte Feld, und aus der bloßen ANZAHL wurden vollständige Reihen neu
 * erfunden — aus drei mühsam freigehackten Feldern wurden drei komplette Reihen.
 * Die Zählweise der Reihe rückt stattdessen der Umzugs-Effekt gerade, sobald der
 * eigene Platz feststeht.
 *
 * Die Ableitung aus `plotExpansions` bleibt als Rückfall für sehr alte Spielstände,
 * die noch gar keine Feldliste hatten.
 */
function resolvePlotUnlockedCells(stateLike) {
    const explicit = normalizePlotUnlockedCells(stateLike?.plotUnlockedCells);
    if (explicit.length > 0) return explicit;
    return unlockedCellsFromLegacyExpansions(stateLike?.plotExpansions, true);
}

/** Tiere können wie Pflanzen golden oder regenbogenfarben schlüpfen. */
function rollPetSpecialType() {
    const roll = Math.random();
    if (roll < 0.01) return "Rainbow";
    if (roll < 0.05) return "Golden";
    return null;
}

function rollHatchResult(egg) {
    const table = Array.isArray(egg?.hatchTable) ? egg.hatchTable : [];

    // Fähigkeit auswürfeln
    const chosenAbility = PET_ABILITY_TYPES[Math.floor(Math.random() * PET_ABILITY_TYPES.length)];
    const rarityMap = { COMMON: 1, UNCOMMON: 2, RARE: 3, EPIC: 4, LEGENDARY: 5, MYTHIC: 6 };
    const level = rarityMap[egg?.rarity || "COMMON"] || 1;
    const specialType = rollPetSpecialType();

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
    let treffer = table[0] || { type: "Tier" };
    for (const entry of table) {
        acc += Number(entry?.chance || 0);
        if (roll <= acc) {
            treffer = entry;
            break;
        }
    }
    const chosen = treffer.type || "Tier";
    // Die Stufe kommt jetzt vom geschlüpften TIER, nicht mehr von der Seltenheit
    // des Eies. Der seltene Treffer ist damit auch der stärkere; vorher war die
    // Wahrscheinlichkeit reine Optik. Ohne Angabe gilt weiterhin die Ei-Stufe,
    // damit ältere Sendungen und gespeicherte Eier nichts verlieren.
    const echtesLevel = Math.max(1, Math.min(5, Math.floor(Number(treffer.level) || level)));
    const emoji = getPetEmoji(chosen);
    return {
        type: chosen,
        emoji,
        image: getPetSpriteImage(chosen),
        previewImage: buildPetPreviewImage(chosen),
        specialType,
        ability: { type: chosenAbility, level: echtesLevel },
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

/**
 * Dasselbe fuer Samen und Tiere. Beide koennen ohne Bildpfad vom Server kommen —
 * am deutlichsten nach dem Abholen aus dem Briefkasten: die Sendung traegt nur
 * Werte (Art, Seltenheit, Faehigkeit), keine Assets. Ohne diese Ableitung stand
 * im Rucksack des Empfaengers das Ersatz-Emoji statt des Tieres, und auf dem Acker
 * zeichnete der Renderer ebenfalls nur das Emoji.
 *
 * Bewusst wird NICHT der Bildpfad des Absenders uebernommen: der kaeme aus einem
 * fremden Browser und landete ungeprueft in einem <img src>. Die Art reicht — die
 * Pfade stehen ohnehin lokal im Katalog.
 */
function hydratePet(pet) {
    if (!pet?.name) return pet;
    const sprite = getPetSpriteImage(pet.name);
    return {
        ...pet,
        emoji: pet.emoji || getPetEmoji(pet.name),
        image: pet.image || sprite,
        previewImage: pet.previewImage || sprite,
    };
}

function hydratePets(liste) {
    return Array.isArray(liste) ? liste.map(hydratePet) : [];
}

function hydrateSeed(seed) {
    if (!seed?.seedId) return seed;
    const visuals = getPlantVisuals(seed.seedId, seed.singleUse !== false);
    const bild = visuals.seedImage || visuals.seedShopImage || visuals.growthImage;
    return { ...seed, image: seed.image || bild, seedImage: seed.seedImage || bild };
}

function hydrateSeeds(liste) {
    return Array.isArray(liste) ? liste.map(hydrateSeed) : [];
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

/** Kennzahlen einer Art fürs Info-Fach im Shop. */
function SeedFacts({ seed }) {
    const profile = SEED_CATALOGUE.find((s) => s.id === seed.seedId);
    if (!profile) return null;
    const zeile = (label, wert) => (
        <div className="flex items-center justify-between gap-3 py-0.5">
            <span className="text-slate-400">{label}</span>
            <span className="text-slate-200 font-medium tabular-nums text-right">{wert}</span>
        </div>
    );
    return (
        <div className="mt-2 pt-2 border-t border-slate-800 text-[11px]">
            {profile.singleUse ? (
                <>
                    {zeile("Wachstum", `${formatDurationShared(profile.growMinSec * 1000)} – ${formatDurationShared(profile.growMaxSec * 1000)}`)}
                    {zeile("Ertrag je Ernte", `${formatGold(profile.sellMin)} – ${formatGold(profile.sellMax)}`)}
                    {zeile("Erntet", "einmal, danach ist das Feld frei")}
                </>
            ) : (
                <>
                    {zeile("Aufbau bis zur ersten Frucht", formatDurationShared(profile.structureGrowSec * 1000))}
                    {zeile("Nachreifen je Frucht", formatDurationShared(profile.fruitCycleSec * 1000))}
                    {zeile("Fruchtstände", `${profile.maxFruits}`)}
                    {zeile("Ertrag je Frucht", `${formatGold(profile.fruitSellMin)} – ${formatGold(profile.fruitSellMax)}`)}
                    {zeile("Erntet", "dauerhaft, die Pflanze bleibt stehen")}
                </>
            )}
            <p className="text-slate-500 mt-1.5 leading-relaxed">
                Größe und Sonderformen werden beim Wachsen ausgewürfelt; Wetter-Effekte erhöhen
                den Verkaufswert zusätzlich.
            </p>
        </div>
    );
}

const ShopSeedCard = memo(function ShopSeedCard({ seed, onBuy, canAfford, stock, rucksackVoll }) {
    const visualSeed = withVisuals(seed);
    const inactive = !seed.active && seed.active !== undefined;
    const outOfStock = (stock ?? (seed.active ? 1 : 0)) <= 0;
    const clickable = canAfford && !outOfStock && !inactive && !rucksackVoll;
    const archetype = ARCHETYPE_LABELS[getPlantArchetypeKey(seed.seedId)] || "Pflanze";
    const [showFacts, setShowFacts] = useState(false);
    // Warum ein Kauf gerade nicht geht — steht dort, wo sonst „Kaufen" steht.
    // „Rucksack voll" gehört dazu: vorher blieb die Zeile klickbar und jeder Klick
    // lief in eine Meldung, die nach 2,5 s wieder weg war. Wer fünfzehn Kürbisse
    // kaufen wollte und nur acht Plätze frei hatte, sah acht Käufe und danach
    // scheinbar nichts mehr passieren.
    const hinderung = inactive ? "Nicht im Angebot"
        : outOfStock ? "Ausverkauft"
            : rucksackVoll ? "Rucksack voll"
                : !canAfford ? "Zu teuer" : null;
    return (
        <div
            className={`group w-full p-3 rounded-md border transition-colors ${
                inactive
                    ? "border-slate-800 bg-slate-900/40 opacity-50"
                    : clickable
                        // Die ganze Zeile ist der Kaufknopf — ohne Hover-Rueckmeldung
                        // sah eine kaufbare Zeile aus wie eine gesperrte.
                        ? "border-slate-700 bg-slate-900/60 hover:border-violet-500 hover:bg-slate-800"
                        : "border-slate-700 bg-slate-900/60"
            }`}
        >
        <div className="flex gap-3 items-center">
        <button
            type="button"
            disabled={!clickable}
            onClick={() => clickable && onBuy(seed)}
            className={`flex-1 min-w-0 text-left flex gap-3 items-center ${clickable ? "cursor-pointer" : "cursor-default"}`}
        >
            <ItemIcon item={visualSeed} className="w-11 h-11 shrink-0" emojiClassName="text-3xl" />
            <div className="flex-1 min-w-0">
                {/* Lesbarkeit: Name in vollem Weiß, Untertitel eine Stufe heller als vorher
                    (slate-500 war auf slate-900 grenzwertig) */}
                <div className="text-sm font-semibold text-white truncate">{seed.name}</div>
                <div className="flex items-center gap-2 mt-0.5">
                    <RarityLabel rarity={seed.rarity} />
                    <span className="text-xs text-slate-300 truncate">
                        {archetype} · {seed.singleUse ? "Einmalernte" : "Dauerträger"}
                    </span>
                </div>
            </div>
            <div className="text-right shrink-0">
                <div className={`text-sm font-bold tabular-nums ${inactive ? "text-slate-500" : canAfford ? "text-amber-300" : "text-slate-400"}`}>
                    {formatGold(seed.shopPrice)}
                </div>
                {/* „Ausverkauft" und „Nicht im Angebot" stehen jetzt im Knopf rechts —
                    hier bleibt nur der Bestand, damit nichts doppelt dasteht. */}
                {seed.active && !outOfStock && (
                    <div className="text-xs mt-0.5 text-slate-300">{stock} auf Lager</div>
                )}
            </div>
            {/* Kein <button> — die ganze Zeile ist bereits einer. Optisch derselbe
                Knopf wie im Werkzeug- und Ei-Shop, damit klar ist, was ein Klick tut. */}
            <span
                className={`shrink-0 px-3 py-2 rounded-md text-xs font-semibold border transition-colors ${
                    clickable
                        ? "border-violet-500 text-violet-200 group-hover:bg-violet-600 group-hover:text-white"
                        : "border-slate-800 bg-slate-900 text-slate-500"
                }`}
            >
                {hinderung || "Kaufen"}
            </span>
        </button>
        {/* Eigener Knopf neben der Kaufaktion — nicht darin verschachtelt,
            damit ein Klick auf die Details nicht sofort kauft. */}
        <button
            type="button"
            aria-label="Details anzeigen"
            aria-expanded={showFacts}
            onClick={() => setShowFacts((v) => !v)}
            className={`shrink-0 w-8 h-8 rounded-md border flex items-center justify-center transition-colors ${
                showFacts
                    ? "border-violet-500 text-violet-300"
                    : "border-slate-700 text-slate-400 hover:text-white hover:border-slate-500"
            }`}
        >
            <Info size={15} />
        </button>
        </div>
        {showFacts && <SeedFacts seed={seed} />}
        </div>
    );
});

export default function GameContainer() {
    const { user: twitchUser, login: twitchLogin } = useContext(TwitchAuthContext);
    const canvasRef = useRef(null);
    // Externer Store für die Pflanzen-Hover-Karte — hält Mausbewegungen komplett
    // aus dem React-Renderpfad dieser Komponente heraus.
    const hoverStoreRef = useRef(null);
    if (!hoverStoreRef.current) hoverStoreRef.current = createHoverStore();
    const hoverStore = hoverStoreRef.current;
    // Aktueller Kamerazoom (Mausrad). Ref statt State: siehe ZOOM_MIN oben.
    const zoomRef = useRef(WORLD_ZOOM);
    const [zoomAnzeige, setZoomAnzeige] = useState(WORLD_ZOOM);
    // Wiederverwendete Hülle für die Treffprüfung auf fremden Grundstücken —
    // onCanvasMove läuft bei jeder Mausbewegung, da soll kein Objekt anfallen.
    const fremdHoverSlot = useRef({ x: 0, anchorY: 0, isTopRow: true, unlockedCells: [] }).current;

    // ── UI State ──────────────────────────────────────────────────────────────
    const [activeShop, setActiveShop] = useState(null); // "seed" | "tool" | "egg" | "deco"
    const [isBackpackOpen, setBackpackOpen] = useState(false);
    const [inventoryFilter, setInventoryFilter] = useState("all");
    const [inventoryMaxSlots, setInventoryMaxSlots] = useState(50);
    const [currentInteractable, setCurrentInteractable] = useState(null);
    const [gold, setGold] = useState(500);
    /**
     * Der Goldstand, sofort lesbar.
     *
     * Die Kaufprüfungen dürfen NICHT gegen den React-Wert laufen: die Warteschlange
     * startet den nächsten Kauf, bevor React den neuen Stand übernommen hat. Der
     * zweite Klick sähe dann das Gold von vor der ersten Zahlung.
     */
    const goldRef = useRef(500);
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
    const [itemHoverTooltip, setItemHoverTooltip] = useState(null); // { item, x, y }
    const [toolInventory, setToolInventory] = useState(DEFAULT_TOOL_INVENTORY);
    const [eggInventory, setEggInventory] = useState([]);
    const [petInventory, setPetInventory] = useState([]);
    const [petPlacements, setPetPlacements] = useState([]);
    const [decoInventory, setDecoInventory] = useState([]);
    const [decoPlacements, setDecoPlacements] = useState([]);
    const [selectedPetToPlace, setSelectedPetToPlace] = useState(null);
    const [selectedDecoToPlace, setSelectedDecoToPlace] = useState(null);
    /** Wird die Deko in der Hand gespiegelt platziert? Umschalten mit [R]. */
    const [decoGespiegelt, setDecoGespiegelt] = useState(false);
    const [shovelHoldState, setShovelHoldState] = useState({ active: false, progress: 0 });
    const [isIncubatorOpen, setIncubatorOpen] = useState(false);
    const [isTrashOpen, setTrashOpen] = useState(false);
    // Inkubator und Mülleimer stehen dort, wo der Spieler sie hinstellt. Gespeichert
    // wird ein Kachel-VERSATZ zum eigenen Grundstück, keine Weltkoordinate: der
    // Slot wechselt zwischen Sitzungen, absolute Werte lägen dann beim Nachbarn.
    // null = noch nie verschoben, also der Standardplatz.
    const [gebaeudeVersatz, setGebaeudeVersatz] = useState({ incubator: null, trash: null });
    /** "incubator" | "trash" | "chest" | "vitrine" | null — solange gesetzt, platziert der nächste Klick. */
    const [verschiebtGebaeude, setVerschiebtGebaeude] = useState(null);
    /**
     * Einrichtungs-Modus.
     *
     * NUR hier lässt sich Deko setzen und wieder einpacken und lassen sich Gebäude
     * umstellen. Vorher genügte im normalen Spiel ein Linksklick in die Nähe einer
     * Deko, um sie einzusammeln — beim Laufen, Ernten oder Anklicken von irgendetwas
     * passierte das dauernd aus Versehen. Solange der Modus läuft, blinkt das
     * Kachelraster des eigenen Grundstücks.
     */
    const [editorAktiv, setEditorAktiv] = useState(false);
    const editorAktivRef = useRef(false);
    useEffect(() => { editorAktivRef.current = editorAktiv; }, [editorAktiv]);
    /** "chest" | "vitrine" | null — offene eigene Ablage. */
    const [ablageOffen, setAblageOffen] = useState(null);
    /** Vitrine eines anderen: { owner, items } — nur ansehen. */
    const [fremdeVitrine, setFremdeVitrine] = useState(null);
    const [chestItems, setChestItems] = useState([]);
    const [vitrineItems, setVitrineItems] = useState([]);
    const [ablageBusy, setAblageBusy] = useState(false);
    /** Nachschlagewerk: seedId → { min, max, effekte: string[], anzahl } */
    const [logbuch, setLogbuch] = useState({});
    const [isLogbuchOpen, setLogbuchOpen] = useState(false);
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
    const [inspectedPet, setInspectedPet] = useState(null); // angeklicktes Tier → Detailfenster

    const [showLobbyScreen, setShowLobbyScreen] = useState(true);
    const [leaderboard, setLeaderboard] = useState([]);
    const [mailbox, setMailboxState] = useState([]);
    const [isMailboxOpen, setMailboxOpen] = useState(false);
    const [mailBusy, setMailBusy] = useState(false);
    // War man zuletzt in einer privaten Welt, steht ihr Code schon im Feld —
    // sonst muesste man ihn sich nach jedem Neuladen selbst merken.
    const [joinCodeInput, setJoinCodeInput] = useState(() => {
        const gemerkt = letzteWelt();
        return gemerkt && !gemerkt.startsWith("OEFFENTLICH") ? gemerkt : "";
    });
    const [pendingWorldCode, setPendingWorldCode] = useState("");
    const [pendingCreateWorld, setPendingCreateWorld] = useState(false);
    const [mailboxMode, setMailboxMode] = useState("inbox"); // "inbox" | "send"
    const [mailboxRecipient, setMailboxRecipient] = useState("");
    const [authUser, setAuthUser] = useState(null);
    const [isSettingsOpen, setSettingsOpen] = useState(false);
    /** Admin-Menü im Spiel. Der Knopf ist reine Optik — geprüft wird auf dem Server. */
    const [adminPanelOffen, setAdminPanelOffen] = useState(false);
    const istGartenAdmin = Boolean(authUser?.id) && String(authUser.id) === GARTEN_ADMIN_ID;
    /** Sortierung von Samen-Shop und Inventar — siehe SHOP_SORTIERUNGEN. */
    const [shopSortierung, setShopSortierung] = useState("standard");
    const [inventarSortierung, setInventarSortierung] = useState("standard");
    /**
     * Anwesenheitsliste und Chat bleiben per Klick offen — beide sind zum Lesen und
     * Tippen da, ein Aufklappen beim Überfahren (wie bei Gold und Tieren) würde
     * mitten im Satz wieder zuklappen, sobald die Maus danebengerät.
     */
    const [istOnlineListeOffen, setOnlineListeOffen] = useState(false);
    const [istChatOffen, setChatOffen] = useState(false);
    const [chatEingabe, setChatEingabe] = useState("");
    /** Zählt ungelesene Zeilen, solange das Chatfenster zu ist. */
    const [chatUngelesen, setChatUngelesen] = useState(0);
    const chatEndeRef = useRef(null);
    const [worldBootState, setWorldBootState] = useState({ active: false, label: "", progress: 0 });
    const [isInitialLoadDone, setIsInitialLoadDone] = useState(false);
    // Als Ref, damit flushFarmStateToServer die Sperre ohne Stale-Closure lesen kann.
    const isInitialLoadDoneRef = useRef(false);
    const [isSubscriber, setIsSubscriber] = useState(false);
    const [isBeta, setIsBeta] = useState(false);
    const [tutorialCompleted, setTutorialCompleted] = useState(false);
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
    const mySlotRef = useRef(0);
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
    const lastInteractableTypeRef = useRef(null);
    /** Aktuelles Interaktionsziel — auch fuer den Tastendruck, ohne React-State zu lesen. */
    const activeTargetRef = useRef(null);
    const decoGespiegeltRef = useRef(false);
    const selectedDecoToPlaceRef = useRef(null);
    const heldItemRef = useRef(null);
    const movingPlantSourceRef = useRef(null);
    const renderProfileRef = useRef(DEFAULT_RENDER_PROFILE);
    const weatherStateRef = useRef(weatherState);
    const toolInventoryRef = useRef(toolInventory);
    /**
     * Kaufsperre und Bestände als Ref — gegen Doppel- und Spamklicks.
     *
     * Jeder Kauf prüfte den Bestand aus dem React-State und zog ihn ERST NACH der
     * Antwort des Servers ab. Wer schnell klickte, kam mit jedem Klick durch dieselbe
     * Prüfung: fünf Gießkannen ließen sich acht Mal kaufen, ebenso Eier, Spitzhacken
     * und die eigentlich einmaligen Sachen (Schaufel, Kiste, Vitrine). Refs werden
     * SOFORT beim Klick fortgeschrieben, noch vor dem await — die zweite Prüfung
     * sieht damit schon den verringerten Bestand.
     */
    const kaufLaeuftRef = useRef(false);
    /**
     * Klicks, die während eines laufenden Kaufs eintreffen, WARTEN statt verloren
     * zu gehen.
     *
     * Vorher stand hier nur `if (kaufLaeuftRef.current) return;` — ohne Meldung, ohne
     * Spur. Ein Kauf kostet eine Netzrunde; gemessen auf einer Leitung mit 180 ms
     * kamen von zehn schnellen Klicks auf „Kaufen" nur FÜNF an. Wer zehnmal klickt,
     * bekommt fünf Töpfe und hält das für einen Fehler in der Abrechnung — dabei
     * wurden die anderen fünf nie abgeschickt.
     *
     * Dieselbe Lösung wie beim Ernten: einreihen und der Reihe nach abarbeiten. Die
     * Obergrenze fängt Dauerfeuer ab; wer zwanzigmal hämmert, will keine zwanzig
     * Gießkannen.
     */
    const KAUF_WARTESCHLANGE_MAX = 12;
    const kaufWarteschlangeRef = useRef([]);
    // Über Refs, damit ein eingereihter Klick denselben Handler noch einmal aufrufen
    // kann, ohne dass die Callbacks sich gegenseitig als Abhängigkeit brauchen.
    const handleBuySeedRef = useRef(null);
    const handleBuyToolRef = useRef(null);
    const handleBuyEggRef = useRef(null);
    const handleBuyDecoRef = useRef(null);
    const handleBuyPetSlotRef = useRef(null);
    const unlockIncubatorSlotRef = useRef(null);
    const kaufEinreihen = useCallback((auftrag) => {
        if (kaufWarteschlangeRef.current.length >= KAUF_WARTESCHLANGE_MAX) return;
        kaufWarteschlangeRef.current.push(auftrag);
    }, []);
    /**
     * Den nächsten Auftrag starten — bewusst über den Ereignis-Zyklus. Direkt
     * aufgerufen liefe er noch vor `setToolInventory` und `debouncedSave` des
     * gerade fertigen Kaufs und sähe damit einen veralteten Stand.
     */
    const naechstenKaufStarten = useCallback(() => {
        setTimeout(() => {
            if (kaufLaeuftRef.current) return;
            kaufWarteschlangeRef.current.shift()?.();
        }, 0);
    }, []);
    const personalShopStockRef = useRef({});
    const toolShopStockRef = useRef({});
    const eggShopStockRef = useRef({});
    const seedNextRotationAtRef = useRef(0);
    const toolNextRotationAtRef = useRef(0);
    const eggNextRotationAtRef = useRef(0);
    /** Samen-Shop: pro Rotation nur einmal auffüllen / aus Save übernehmen (nicht bei jedem /global-shop-Poll resetten) */
    const personalShopSeededForGenAtRef = useRef(null);
    /**
     * Dasselbe für Tool- und Eier-Shop. Ohne diese Sperre setzte jeder /global-shop-Poll
     * (spätestens alle 30 s) den Bestand zurück auf den Rotationswert: gekaufte Gießkannen,
     * Töpfe und Spitzhacken standen nach kurzem Warten wieder im Regal, ohne dass die
     * Rotation abgelaufen war. Der Samen-Shop hatte die Sperre schon.
     */
    const toolShopSeededForGenAtRef = useRef(null);
    const eggShopSeededForGenAtRef = useRef(null);
    /** Verhindert die Nachlade-Schleife, wenn eine Rotation ohne Samen zurückkommt. */
    const shopBootstrapTriedRef = useRef(false);
    /** Gespeicherter Shop-Stock aus dem Farm-Save — wird einmalig von initPersonalStock konsumiert */
    const savedShopStockRef = useRef(null); // { stock: {}, version: number } | null
    const savedToolShopStockRef = useRef(null);
    const savedEggShopStockRef = useRef(null);
    /** Zählt hoch, sobald ein geladener Spielstand seinen Ladenbestand hinterlegt hat. */
    const [ladenbestandGeladen, setLadenbestandGeladen] = useState(0);
    /**
     * Samenkäufe, die im Rucksack noch nicht sichtbar sind.
     *
     * `farmStateRef` wird erst beim nächsten Rendern nachgezogen, die Warteschlange
     * startet den nächsten Kauf aber schon vorher — ohne diesen Zuschlag rutschte
     * genau ein Samen über die Rucksackgrenze. Abgebaut wird er NICHT durch ein
     * pauschales Zurücksetzen (das kam zu früh und half deshalb nicht), sondern um
     * genau die Stückzahl, die im Rucksack tatsächlich aufgetaucht ist.
     */
    const offeneSamenkaeufeRef = useRef(0);
    const zuletztInventarRef = useRef(0);
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

    const saveTimeoutRef = useRef(null);
    const flushFarmStateToServerRef = useRef(null);
    /** Stand des Serverzählers, den dieser Browser zuletzt gesehen hat. */
    const stateVersionRef = useRef(0);
    /**
     * Level, XP und gelernte Fähigkeiten. Kommt AUSSCHLIESSLICH vom Server und wird
     * nie mitgespeichert — der Baum steuert Gold und Ertrag (siehe garden/core/skills.js).
     * Der Bauplan (`skillKatalog`) kommt aus derselben Quelle, damit die angezeigte
     * Prozentzahl nicht von der abweicht, mit der die Kasse rechnet.
     */
    const [skillStand, setSkillStand] = useState(null);
    const [skillKatalog, setSkillKatalog] = useState([]);
    const skillWirkungRef = useRef({});
    const [skillsOffen, setSkillsOffen] = useState(false);
    /** Dieser Tab hat gegen einen anderen verloren und speichert nicht mehr. */
    const [nurZuschauen, setNurZuschauen] = useState(false);
    const nurZuschauenRef = useRef(false);
    /** Tier-ID → Zeitpunkt der letzten angenommenen Auszahlung (spiegelt die Serversperre). */
    const petFundZeitenRef = useRef(new Map());
    /** Zellen, deren Ernte gerade beim Server liegt — verhindert Doppelanfragen. */
    const ernteLaeuftRef = useRef(new Set());
    /** Zelle → Klicks, die während einer laufenden Ernte kamen und noch drankommen. */
    const ernteWarteschlangeRef = useRef(new Map());
    /** handleHarvest über ein Ref, damit die Warteschlange sich selbst aufrufen kann. */
    const handleHarvestRef = useRef(null);
    /** Zelle → Zeitpunkt der letzten GELUNGENEN Ernte. Trennt „zu schnell geklickt"
     *  von „Server hat einen veralteten Acker" — siehe handleHarvest. */
    const letzteErnteRef = useRef(new Map());
    const preloadedAssetsRef = useRef(new Set());
    const worldBootTokenRef = useRef(0);
    const worldBootKindRef = useRef(null); // "single" | "multi" | null — source of truth for boot type
    const worldBootStatusRef = useRef({ preloadDone: false, dataDone: false, minDoneAt: 0 });
    const worldBootFinishTimerRef = useRef(null);
    const playerBadgeRef = useRef(null);
    const localPlayerNameRef = useRef("Spieler");
    const readyEggsCount = incubator.slots.filter(s => s && Date.now() >= s.hatchAt).length;
    /**
     * Dieselbe Zahl für die Renderschleife. Die Schleife wird einmal aufgesetzt und
     * hielte den Wert aus DIESEM Bild für immer fest — sie startet, bevor der
     * Spielstand geladen ist, und sah deshalb dauerhaft „null fertige Eier".
     */
    const readyEggsCountRef = useRef(0);
    readyEggsCountRef.current = readyEggsCount;
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
    // Früh definiert, weil die Lobby-Verbindung darüber meldet und mySlotIndex daraus kommt.
    const notify = useCallback((msg, type = "success") => {
        setNotification({ msg, type, id: Date.now() });
        setTimeout(() => setNotification(null), 2500);
    }, []);

    const handleIncomingMail = useCallback((mail) => {
        setMailboxState((prev) => [mail, ...prev.filter((m) => m.id !== mail.id)]);
        notify(`Neue Post von ${mail?.from || "einem Farmer"}.`);
    }, [notify]);

    // Umweg über ein Ref, weil die Lobby-Verbindung hier oben aufgebaut wird, das
    // Übernehmen des Serverstands aber erst weiter unten entsteht (applyServerState).
    const adminUpdateRef = useRef(null);
    const handleAdminUpdate = useCallback((info) => adminUpdateRef.current?.(info), []);
    /**
     * Der Server nennt beim Betreten seinen Zählerstand. Liegt er VOR unserem, hat
     * er den Spielstand selbst verändert, während wir nicht hingesehen haben — eine
     * Umstellung beim Neustart etwa. Dann muss dieser Browser nachladen, statt
     * seinen älteren Stand hochzudrücken.
     */
    const serverVersionRef = useRef(null);
    const handleServerVersion = useCallback((version) => serverVersionRef.current?.(version), []);

    // ── Dauerhafte 8-Plot-Welt ────────────────────────────────────────────────
    // Es gibt keinen Singleplayer-Modus mehr: die Karte hat immer 8 Grundstücke,
    // der Server vergibt den Slot. Alleine bekommt man Slot 0 (oben links).
    const {
        slotIndex: mySlotIndex,
        connected: lobbyConnected,
        worldFull,
        onlinePlayers,
        remotePlayersRef,
        plotsRef,
        sendMove,
        sendHeld,
        activeCode,
        isPublicWorld,
        chatVerlauf,
        sendChat,
    } = useGardenLobby({
        enabled: !showLobbyScreen,
        worldCode: pendingWorldCode,
        createWorld: pendingCreateWorld,
        appearance: playerAppearance,
        badge: isSubscriber ? "subscriber" : isBeta ? "beta" : null,
        onMail: handleIncomingMail,
        onNotify: notify,
        onAdminUpdate: handleAdminUpdate,
        onServerVersion: handleServerVersion,
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
    const layout = useRef(generatePlotSlots(WORLD_SLOTS));
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
            trash: { x: 0, y: 0, label: "Mülleimer", type: "trash" },
            // Erscheinen erst nach dem Kauf — bis dahin bleiben sie aus der
            // Zeichen- und Näheprüfung heraus (siehe areasAktiv).
            chest: { x: 0, y: 0, label: "Vorratskiste", type: "chest" },
            vitrine: { x: 0, y: 0, label: "Vitrine", type: "vitrine" },
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

        // Startplätze der vier Grundstücks-Gebäude. Bewusst über dieselbe Funktion wie
        // später der Effekt mit dem gespeicherten Versatz — als das hier eine eigene
        // Rechnung hatte, liefen die beiden auseinander.
        const pos = berechneGebaeudePositionen(l.slots[0], null);
        for (const art of ["incubator", "trash", "chest", "vitrine"]) {
            a[art].x = pos[art].x;
            a[art].y = pos[art].y;
            a[art].fussY = pos[art].fussY;
            a[art].image = AREA_IMAGES[art];
        }
    }, []);

    useEffect(() => {
        appearanceRef.current = playerAppearance;
    }, [playerAppearance]);

    // Inkubator und Mülleimer relativ zum eigenen Plot (Multiplayer: Slot wechselt).
    // Ohne gespeicherten Versatz gilt der alte Standardplatz am rechten Ackerrand.
    useEffect(() => {
        const l = layout.current;
        const ownSlot = l.slots[mySlotIndex] || l.slots[0];
        const a = engineRef.current.areas;
        // Standardplätze hängen NUR am Grundstück, nicht aneinander. Der Mülleimer
        // hing vorher am aktuellen Inkubator-Standort und wanderte damit jedes Mal
        // mit — obwohl er ein eigenes Gebäude mit eigenem Versatz ist.
        const pos = berechneGebaeudePositionen(ownSlot, gebaeudeVersatz);
        for (const art of ["incubator", "trash", "chest", "vitrine"]) {
            a[art].x = pos[art].x;
            a[art].y = pos[art].y;
            a[art].fussY = pos[art].fussY;
            a[art].image = AREA_IMAGES[art];
        }

        // `aktiv: false` heißt: nicht zeichnen, nicht anlaufen, keine Kollision.
        // Ungekaufte Gebäude stünden sonst als Geister auf dem Grundstück.
        const werkzeug = normalizeToolInventory(toolInventory);
        a.chest.aktiv = werkzeug.hasChest === true;
        a.vitrine.aktiv = werkzeug.hasVitrine === true;
    }, [mySlotIndex, gebaeudeVersatz, toolInventory]);

    // ── Helpers (defined before any useEffect that references them) ───────────
    const preloadImage = useCallback((src) => {
        if (!src || preloadedAssetsRef.current.has(src)) return;
        preloadedAssetsRef.current.add(src);
        const img = new Image();
        img.decoding = "async";
        // Gleiche URL wie im Renderer, sonst laedt der Vorlader die alte Fassung
        // und der Cache-Buster brächte nichts.
        img.src = versionedAsset(src);
    }, []);

    const hydratePlantVisuals = useCallback((plant) => {
        if (!plant || typeof plant !== "object") return null;
        const singleUse = plant.singleUse !== false;
        if (!plant.seedId) return { ...plant, singleUse };
        // Reihenfolge ist entscheidend: die abgeleiteten Bildpfade stehen NACH dem
        // gespeicherten Objekt. Alte Spielstaende tragen noch Pfade wie
        // plants/gurke/structure.png mit sich — die wuerden sonst die neue,
        // gemeinsame Struktur je Wuchsform ueberschreiben.
        return {
            ...plant,
            ...getPlantVisuals(plant.seedId, singleUse),
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
            img.src = versionedAsset(src);
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

        // Feste Abstände — die Welt hat immer 8 Grundstücke, kein Singleplayer-Layout mehr.
        const shopOffsetX = 340;
        const shopSpacing = 580;

        a.seedShop.x = l.centerX - shopOffsetX - shopSpacing; a.seedShop.y = l.centerPathTopY + 92; a.seedShop.image = AREA_IMAGES.seedShop;
        a.toolShop.x = l.centerX - shopOffsetX; a.toolShop.y = l.centerPathTopY + 92; a.toolShop.image = AREA_IMAGES.toolShop;

        a.eggShop.x = l.centerX - shopOffsetX - shopSpacing; a.eggShop.y = l.centerPathBottomY - 140; a.eggShop.image = AREA_IMAGES.eggShop;
        a.decoShop.x = l.centerX - shopOffsetX; a.decoShop.y = l.centerPathBottomY - 140; a.decoShop.image = AREA_IMAGES.decoShop;

        a.market.x = l.centerX + shopOffsetX + shopSpacing - 160; a.market.y = l.centerY; a.market.image = AREA_IMAGES.market;
        a.petMarket.x = l.centerX + shopOffsetX + shopSpacing - 160 + 500; a.petMarket.y = l.centerY; a.petMarket.image = AREA_IMAGES.petMarket;
    }, []);

    const startWorldBoot = useCallback((mode) => {
        const token = worldBootTokenRef.current + 1;
        worldBootTokenRef.current = token;
        worldBootKindRef.current = mode;

        layout.current = generatePlotSlots(WORLD_SLOTS);
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
        } else if (target.type === "petMarket") {
            sellPetRef.current();
        } else if (target.type === "incubator") {
            setIncubatorTargetSlot(null);
            setIncubatorOpen(true);
        } else if (target.type === "trash") {
            setTrashOpen(true);
        } else if (target.type === "chest") {
            setAblageOffen("chest");
        } else if (target.type === "vitrine") {
            setAblageOffen("vitrine");
        } else if (target.type === "fremdeVitrine") {
            // Die Momentaufnahme trägt nur Werte, keine Bildpfade (der Server kennt
            // keine Assets) — ohne Nachziehen bliebe die fremde Vitrine bildlos.
            setFremdeVitrine({ owner: target.owner, items: hydrateHarvestedItems(target.items) });
        } else if (target.type === "mailbox") {
            // Eigener Kasten → Posteingang, fremder → Sendeformular mit Empfänger.
            if (target.isOwn) {
                setMailboxMode("inbox");
                setMailboxRecipient("");
            } else {
                setMailboxMode("send");
                setMailboxRecipient(target.owner || "");
            }
            setMailboxOpen(true);
        }
    }, []);

    /**
     * Vor ein beliebiges Grundstück springen — an dieselbe Stelle, an der man auch
     * bei der eigenen Farm landet: mittig am Kiesweg, also mit Blick auf den Acker.
     * Bei einem Grundstück der oberen Reihe steht man knapp darunter, bei einem der
     * unteren knapp darüber; sonst käme man auf der falschen Seite heraus.
     */
    const teleportToSlot = useCallback((slotIndex) => {
        const slot = layout.current.slots[slotIndex];
        if (!slot) return;
        const p = engineRef.current.player;
        p.x = slot.x + MAP_CONFIG.territoryWidth / 2;
        p.y = slot.isTopRow ? slot.anchorY - 22 : slot.anchorY + 22;
        p.vx = 0;
        p.vy = 0;
    }, []);

    const teleportToMyFarm = useCallback(() => {
        teleportToSlot(layout.current.slots[mySlotRef.current] ? mySlotRef.current : 0);
    }, [teleportToSlot]);

    /** Aus der Anwesenheitsliste: zum Grundstück eines Mitspielers springen. */
    const besucheSpieler = useCallback((eintrag) => {
        if (!Number.isInteger(eintrag?.slotIndex) || eintrag.slotIndex < 0) {
            notify("Diese Person hat gerade kein Grundstück.", "error");
            return;
        }
        teleportToSlot(eintrag.slotIndex);
        notify(eintrag.selbst ? "Zurück auf deiner Farm." : `Bei ${eintrag.name} angekommen.`);
    }, [teleportToSlot, notify]);

    const chatAbschicken = useCallback(() => {
        const text = chatEingabe.trim();
        if (!text) return;
        if (!sendChat(text)) {
            notify("Keine Verbindung zur Welt.", "error");
            return;
        }
        setChatEingabe("");
    }, [chatEingabe, sendChat, notify]);

    const teleportToShopArea = useCallback(() => {
        const p = engineRef.current.player;
        const area = engineRef.current.areas.seedShop;
        // Muss INNERHALB von INTERACT_DIST (180) landen, sonst erscheint der
        // Öffnen-Knopf nicht und die Schnellreise bringt einen nur in die Nähe.
        // Der alte Versatz (+120/+180) lag mit 216 px genau darüber.
        p.x = area.x;
        p.y = area.y + 130;
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
        // Ein zurückgetretener Tab (siehe nurZuschauen) darf den Serverstand nicht
        // mehr verändern. Vorher galt die Sperre NUR fürs Speichern: Ernten,
        // Kaufen und der Tier-Tick liefen weiter. Zwei Folgen — was hier gekauft
        // wurde, war für immer verloren (Gold serverseitig weg, Ware nur lokal),
        // und jede Ernte liess den führenden Tab beim nächsten Speichern in einen
        // Konflikt laufen, den dieser zu SEINEN Gunsten auflöst: die Pflanze kam
        // zurück, das Gold dafür blieb.
        const veraendernd = String(options.method || "GET").toUpperCase() !== "GET";
        if (veraendernd && nurZuschauenRef.current) {
            const fehler = new Error("Dieser Tab spielt nur zu — hol erst den aktuellen Stand.");
            fehler.status = 423;
            throw fehler;
        }
        // Herkunft an JEDE Wirtschafts-Aktion hängen — an einer Stelle, damit es
        // kein Aufrufer vergessen kann. Der Server weist damit Aktionen aus einem
        // zweiten, zurückgetretenen Tab ab (siehe POST /action).
        let optionen = options;
        if (veraendernd && path === "/action" && typeof options.body === "string") {
            try {
                const roh = JSON.parse(options.body);
                optionen = {
                    ...options,
                    body: JSON.stringify({ ...roh, tabId: TAB_ID, stateVersion: stateVersionRef.current }),
                };
            } catch { /* kein JSON — dann eben unverändert */ }
        }
        const res = await fetch(`/api/garden${path}`, {
            credentials: "include",
            headers: {
                "Content-Type": "application/json",
                ...(optionen.headers || {}),
            },
            ...optionen,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            // Status und Nutzlast mitgeben: der Speicherweg muss den 409 („Spielstand
            // veraltet") von einem gewöhnlichen Fehler unterscheiden können.
            const fehler = new Error(data.error || "API Fehler");
            fehler.status = res.status;
            fehler.data = data;
            throw fehler;
        }
        // Der Zähler gegen verspätete Speicherstände. Jede Aktion zählt ihn auf dem
        // Server hoch; hier landet er an EINER Stelle, damit kein Aufrufer ihn
        // vergessen kann (siehe erhoeheVersion in Backend/routes/gardenGameRoutes.js).
        if (typeof data?.stateVersion === "number") stateVersionRef.current = data.stateVersion;
        // Jede Aktion bringt den Fähigkeitsstand mit. An EINER Stelle übernommen,
        // damit kein Aufrufer ihn vergessen kann — wie beim Zähler darüber.
        if (data?.skillStand) setSkillStand(data.skillStand);
        return data;
    }, []);

    /**
     * Wirkung einer Fähigkeit (0 = nicht gelernt). Rechnet aus Bauplan und Stufe
     * dasselbe wie `wirkung()` im Backend. Als Ref, weil die Rechnung in Handlern
     * und im Wetter-Intervall gebraucht wird, wo ein State veraltet wäre.
     */
    const skillWirkung = useCallback((id) => skillWirkungRef.current[id] || 0, []);
    useEffect(() => {
        const raus = {};
        for (const skill of skillKatalog) {
            const stufe = Math.max(0, Math.min(skill.stufen, Number(skillStand?.skills?.[skill.id]) || 0));
            raus[skill.id] = stufe * skill.proStufe;
        }
        skillWirkungRef.current = raus;
    }, [skillKatalog, skillStand]);

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

    /**
     * Serverstand in die React-States übernehmen.
     *
     * Steht bewusst ausserhalb des Ladeeffekts: zwei Wege brauchen ihn — das Laden
     * beim Betreten der Welt und das Nachladen, wenn ein Admin den Spielstand von
     * aussen geändert hat (garden:admin_update).
     */
    const applyServerState = useCallback((saved) => {
        if (!saved || typeof saved !== "object" || (saved.gold === undefined && !saved.inventory)) return false;
        console.log("Lade Spielstand von Datenbank...");
        // Ab hier speichert dieser Browser gegen genau diesen Stand.
        stateVersionRef.current = Number(saved.stateVersion) || 0;
        if (typeof saved.gold === "number") setGold(saved.gold);
        if (Array.isArray(saved.inventory)) setInventory(hydrateSeeds(saved.inventory));
        if (saved.plotPlants) setPlotPlants(normalizePlotPlantsMap(saved.plotPlants));
        const unlocked = resolvePlotUnlockedCells(saved);
        setPlotUnlockedCells(unlocked);
        setPlotExpansions(Math.min(MAX_PLOT_EXPANSIONS, Math.ceil(unlocked.length / BASE_DIRT_COLS)));
        if (Array.isArray(saved.harvestedItems)) setHarvestedItems(hydrateHarvestedItems(saved.harvestedItems));
        if (Array.isArray(saved.chestItems)) setChestItems(hydrateHarvestedItems(saved.chestItems));
        if (Array.isArray(saved.vitrineItems)) setVitrineItems(hydrateHarvestedItems(saved.vitrineItems));
        if (saved.logbuch && typeof saved.logbuch === "object") setLogbuch(saved.logbuch);
        if (Array.isArray(saved.eggInventory)) setEggInventory(saved.eggInventory);
        if (Array.isArray(saved.petInventory)) setPetInventory(hydratePets(saved.petInventory));
        if (Array.isArray(saved.petPlacements)) setPetPlacements(hydratePets(saved.petPlacements));
        if (Array.isArray(saved.decoInventory)) setDecoInventory(saved.decoInventory);
        if (Array.isArray(saved.decoPlacements)) setDecoPlacements(saved.decoPlacements);
        if (saved.toolInventory) {
            const werkzeug = normalizeToolInventory(saved.toolInventory);
            setToolInventory(werkzeug);
            // Die Sperre gegen Doppelzahlung beim Spamklicken lässt `pickaxesBought`
            // und `backpackLevel` im Ref nur STEIGEN (siehe Effekt weiter unten). Für
            // eine Klickfolge ist das richtig, für einen Serverstand nicht: nach einem
            // Nachladen blieb der Zähler oben stehen, obwohl der Server einen
            // niedrigeren nennt. Der Laden zeigte dann den Preis für „einmal gekauft",
            // der Kauf rechnete aber mit „viermal gekauft" — und brach still ab, weil
            // das Gold für den höheren Preis nicht reichte. Genau so verschwindet der
            // Kaufknopf, ohne dass irgendetwas passiert.
            toolInventoryRef.current = werkzeug;
        }
        setGebaeudeVersatz(normalizeGebaeudeVersatz(saved.gebaeudeVersatz));
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
        // Meldung an die drei Wiederherstellungs-Effekte, dass jetzt etwas da ist.
        // OHNE das hing alles daran, dass die Ladenrotation SPÄTER eintrifft als der
        // Spielstand: kam sie früher (reines Wettrennen zweier Anfragen), lief der
        // Effekt einmal ins Leere und danach bis zur nächsten Rotation nie wieder —
        // der Laden stand nach dem Neubetreten wieder voll da. Wer oft genug neu
        // betrat, konnte Samen, Gießkannen, Töpfe und Eier beliebig oft kaufen.
        setLadenbestandGeladen((n) => n + 1);
        if (saved.incubator) setIncubator(saved.incubator);
        if (saved.appearance) setPlayerAppearance(saved.appearance); // 🌟 NEU
        if (typeof saved.tutorialCompleted === "boolean") setTutorialCompleted(saved.tutorialCompleted);
        if (Array.isArray(saved.mailbox)) setMailboxState(saved.mailbox);
        return true;
    }, [normalizePlotPlantsMap]);

    /**
     * Serverstand holen und übernehmen — der gemeinsame Weg für alles, was diesen
     * Browser hinter die Wirklichkeit zurückfallen lässt:
     *
     *   * ein Admin hat von aussen etwas geändert (garden:admin_update)
     *   * ein eigener Speicherstand kam zu spät (409, siehe flushFarmStateToServer)
     *
     * Der laufende Speicher-Timer muss vorher weg: sonst schickt genau er in den
     * Sekunden zwischen Anlass und Antwort noch den ALTEN Rucksack hoch und macht
     * die Änderung wieder zunichte. Gold und Ernte wären davon nicht betroffen (die
     * gehören dem Server), Samen, Tiere, Eier und Deko schon.
     */
    const uebernimmVomServer = useCallback(async (hinweis, typ = "success") => {
        clearTimeout(saveTimeoutRef.current);
        try {
            const data = await apiCall("/farm-state");
            applyServerState(data.state);
            if (hinweis) notify(hinweis, typ);
            return true;
        } catch {
            notify("Abgleich mit dem Server fehlgeschlagen — bitte die Seite neu laden.", "error");
            return false;
        }
    }, [apiCall, applyServerState, notify]);

    // Bauplan des Fähigkeitsbaums — einmal je Sitzung, er ändert sich nicht.
    useEffect(() => {
        if (showLobbyScreen) return;
        let abgebrochen = false;
        apiCall("/skills")
            .then((data) => {
                if (abgebrochen) return;
                if (Array.isArray(data?.katalog)) setSkillKatalog(data.katalog);
                if (data?.stand) setSkillStand(data.stand);
            })
            .catch(() => { /* ohne Baum spielt es sich weiter, nur ohne Boni-Anzeige */ });
        return () => { abgebrochen = true; };
    }, [showLobbyScreen, apiCall]);

    // Aufstieg melden. Der erste Stand nach dem Laden zählt nicht als Aufstieg —
    // sonst begrüßt einen das Spiel bei jedem Betreten mit „Level 14 erreicht".
    const letztesLevelRef = useRef(null);
    useEffect(() => {
        const level = skillStand?.level;
        if (!level) return;
        const vorher = letztesLevelRef.current;
        letztesLevelRef.current = level;
        if (vorher === null || level <= vorher) return;
        notify(`Level ${level} erreicht — ein Fähigkeitspunkt wartet.`);
    }, [skillStand?.level, notify]);

    const lerneSkill = useCallback(async (id) => {
        try {
            const data = await apiCall("/action", {
                method: "POST", body: JSON.stringify({ action: "skillLernen", skill: id }),
            });
            if (data?.skillStand) setSkillStand(data.skillStand);
            const skill = skillKatalog.find((s) => s.id === id);
            notify(`${skill?.name || "Fähigkeit"} verbessert.`);
        } catch (err) {
            notify(err?.data?.error || "Das hat nicht geklappt.", "error");
        }
    }, [apiCall, notify, skillKatalog]);

    const setzeSkillsZurueck = useCallback(async () => {
        try {
            const data = await apiCall("/action", {
                method: "POST", body: JSON.stringify({ action: "skillsZuruecksetzen" }),
            });
            if (data?.skillStand) setSkillStand(data.skillStand);
            notify("Alle Fähigkeitspunkte sind wieder frei.");
        } catch (err) {
            notify(err?.data?.error || "Das hat nicht geklappt.", "error");
        }
    }, [apiCall, notify]);

    useEffect(() => {
        adminUpdateRef.current = (info) => uebernimmVomServer(info ? `Admin: ${info}` : "Deine Farm wurde angepasst.");
        serverVersionRef.current = (version) => {
            // Erst ab dem zweiten Betreten prüfen: beim ersten holt der Ladeweg den
            // Stand ohnehin frisch, und der Zähler steht dann noch auf 0.
            if (!isInitialLoadDoneRef.current) return;
            if (!(Number(version) > stateVersionRef.current)) return;
            console.log(`[Garden] Server ist weiter (${stateVersionRef.current} → ${version}) — Stand wird geholt.`);
            uebernimmVomServer(null);
        };
    }, [uebernimmVomServer]);

    useEffect(() => {
        if (showLobbyScreen) return;
        const loadFarm = async () => {
            try {
                const data = await apiCall("/farm-state");
                applyServerState(data.state);
                // Was die Tiere verdient haben, während niemand zusah.
                if (data.offline) {
                    const o = data.offline;
                    const teile = [];
                    if (o.gold > 0) teile.push(`+${Number(o.gold).toLocaleString("de-DE")} Gold`);
                    if (o.geerntet > 0) teile.push(`${o.geerntet}× geerntet und verkauft`);
                    if (teile.length) {
                        const dauer = o.minuten >= 60
                            ? `${Math.floor(o.minuten / 60)} h ${o.minuten % 60} min`
                            : `${o.minuten} min`;
                        notify(`Deine Tiere haben ${dauer} gearbeitet: ${teile.join(", ")}`
                            + (o.gedeckelt ? " (Höchstzeit erreicht)" : ""));
                    }
                }
            } catch (err) {
                console.error("Fehler beim Laden von der DB:", err);
                const m = err?.message || "";
                if (m.includes("Nicht eingeloggt") || m.includes("Session") || m.includes("ungültig") || m.includes("abgelaufen")) {
                    notify("Garden: Bitte mit Twitch anmelden (gültige Session erforderlich).", "error");
                }
            }
            setIsInitialLoadDone(true);
            markWorldBootDataReady("multi");
        };
        loadFarm();
    }, [showLobbyScreen, apiCall, markWorldBootDataReady, applyServerState, notify]);

    // BEWUSST KEIN automatisches Nachladen nach einem Verbindungsabriss:
    // Waehrend der Unterbrechung kann der Browser nicht speichern. Ein Nachladen
    // wuerde alles verwerfen, was in der Zwischenzeit gepflanzt oder platziert
    // wurde. Der Server ist ohnehin nur fuer Gold und Ernte massgeblich; alles
    // andere gehoert dem Browser, bis er es das naechste Mal schickt.

    useEffect(() => {
        const savedApp = localStorage.getItem("garden_appearance");
        if (savedApp) {
            try { setPlayerAppearance(JSON.parse(savedApp)); } catch { /* ignore */ }
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
        // Server-Persist via API (5s debounce, Twitch-Session nötig).
        //
        // Die Nutzlast wird BEWUSST nicht mehr hier gebaut, sondern in
        // flushFarmStateToServer — es gab sie zweimal, und sie waren auseinander:
        // dieser Weg schickte `appearance` mit, der andere nicht, weshalb jedes
        // debouncedSave die Kleidung auf den Standard zurücksetzte, bis fünf Sekunden
        // später dieser Effekt sie wieder richtigstellte.
        const timer = setTimeout(() => {
            flushFarmStateToServerRef.current?.();
        }, 5000);
        return () => clearTimeout(timer);
    }, [showLobbyScreen, isInitialLoadDone, gold, inventory, plotPlants, plotExpansions, plotUnlockedCells, harvestedItems, eggInventory, petInventory, petPlacements, decoInventory, decoPlacements, toolInventory, inventoryMaxSlots, incubator, gebaeudeVersatz, logbuch, personalShopStock, shopRotation?.generatedAt,playerAppearance, tutorialCompleted, apiCall]);

    useEffect(() => {
        if (!isIncubatorOpen) return;
        setTickNow(Date.now());
        const t = setInterval(() => setTickNow(Date.now()), 1000);
        return () => clearInterval(t);
    }, [isIncubatorOpen]);

    // Beim ECHTEN Unmount aufräumen. Der Canvas-Listener-Effekt darf das nicht mehr
    // tun: er wird von jeder Ernte neu aufgesetzt und hat dabei das laufende Ziehen
    // und das Schaufel-Halten abgebrochen.
    useEffect(() => () => {
        rotationBannerTimeoutsRef.current.forEach((tid) => clearTimeout(tid));
        rotationBannerTimeoutsRef.current.clear();
        if (shovelHoldTimerRef.current) clearTimeout(shovelHoldTimerRef.current);
        if (shovelHoldProgressRef.current) clearInterval(shovelHoldProgressRef.current);
        isDragHarvestingRef.current = false;
        dragHarvestedCellsRef.current.clear();
    }, []);

    useEffect(() => {
        // Rucksackplätze = 50 Grund + 10 je Rucksackstufe + 5 je „Lagerist"-Stufe.
        const level = Math.min(BACKPACK_MAX_LEVEL, normalizeToolInventory(toolInventory).backpackLevel || 0);
        const ausSkill = Math.round(skillWirkung("lagerist"));
        const ziel = 50 + level * 10 + ausSkill;
        if (ziel > 50) setInventoryMaxSlots(prev => Math.max(prev, ziel));
        // Nur ERHÖHEN, nie zurückdrehen.
        //
        // Ein Kauf schreibt seinen Ausgang sofort in dieses Ref, damit der nächste
        // Klick nicht mehr den alten Preis sieht. Ein einfaches Überschreiben mit dem
        // State machte das wieder zunichte: der Commit des VORIGEN Kaufs traf hier ein,
        // nachdem der nächste Kauf schon hochgezählt hatte, und setzte den Zähler
        // zurück — beim Spamklicken wurde derselbe Spitzhackenpreis dann zweimal
        // bezahlt. Werte, die nur wachsen bzw. nur von false auf true gehen, bleiben
        // deshalb auf ihrem Höchststand.
        const vorher = toolInventoryRef.current || {};
        toolInventoryRef.current = {
            ...toolInventory,
            pickaxesBought: Math.max(toolInventory.pickaxesBought || 0, vorher.pickaxesBought || 0),
            backpackLevel: Math.max(toolInventory.backpackLevel || 0, vorher.backpackLevel || 0),
            hasShovel: Boolean(toolInventory.hasShovel || vorher.hasShovel),
            hasChest: Boolean(toolInventory.hasChest || vorher.hasChest),
            hasVitrine: Boolean(toolInventory.hasVitrine || vorher.hasVitrine),
        };
    }, [toolInventory, skillWirkung, skillStand]);

    /**
     * Bescheid geben, wenn im Inkubator etwas fertig geworden ist.
     *
     * Vorher gab es dafür überhaupt kein Zeichen: die Brutzeit läuft bis zu zwei
     * Stunden, und ob ein Ei durch ist, sah man nur, wenn man zufällig hinlief und
     * das Fenster öffnete. Der Zähler wird mitgeführt, damit dieselbe fertige Brut
     * nicht alle paar Sekunden erneut gemeldet wird.
     */
    const gemeldeteEierRef = useRef(0);
    useEffect(() => {
        if (showLobbyScreen || !isInitialLoadDone) return undefined;
        const pruefe = () => {
            const jetzt = Date.now();
            const fertig = (incubator.slots || []).filter((s) => s && jetzt >= s.hatchAt).length;
            if (fertig > gemeldeteEierRef.current) {
                notify(fertig === 1
                    ? "Im Inkubator ist ein Ei fertig."
                    : `Im Inkubator sind ${fertig} Eier fertig.`);
                playSound("open", 0.35);
            }
            gemeldeteEierRef.current = fertig;
        };
        pruefe();
        const t = setInterval(pruefe, 5000);
        return () => clearInterval(t);
    }, [showLobbyScreen, isInitialLoadDone, incubator, notify, playSound]);

    /**
     * Hover-Karte wegnehmen, sobald der Rucksack zugeht.
     *
     * Ein Klick auf einen Gegenstand nimmt ihn in die Hand UND schließt das Fenster.
     * Damit verschwindet die Kachel unter dem Zeiger, ohne dass je ein mouseleave
     * kommt — die Karte blieb dann über dem Spiel stehen, bis man zufällig wieder
     * über eine andere Kachel fuhr. Gleiches gilt für Schließen mit Tab oder [X].
     */
    useEffect(() => {
        if (!isBackpackOpen) setItemHoverTooltip(null);
    }, [isBackpackOpen]);

    // Bestände in die Refs spiegeln — die Kaufprüfungen lesen ausschließlich dort.
    useEffect(() => { personalShopStockRef.current = personalShopStock; }, [personalShopStock]);
    useEffect(() => { toolShopStockRef.current = toolShopStock; }, [toolShopStock]);
    useEffect(() => { eggShopStockRef.current = eggShopStock; }, [eggShopStock]);

    useEffect(() => {
        selectedToolRef.current = selectedTool;
    }, [selectedTool]);

    useEffect(() => {
        movingPlantSourceRef.current = movingPlantSource;
    }, [movingPlantSource]);

    useEffect(() => {
        decoGespiegeltRef.current = decoGespiegelt;
    }, [decoGespiegelt]);

    // Spiegelung über mehrere Platzierungen hinweg behalten (man stellt selten nur eine
    // Laterne), aber zurücksetzen, sobald man die Deko ganz aus der Hand legt.
    useEffect(() => {
        selectedDecoToPlaceRef.current = selectedDecoToPlace;
        if (!selectedDecoToPlace) setDecoGespiegelt(false);
    }, [selectedDecoToPlace]);

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

    // Die anderen sollen sehen, was man trägt — samt Größe und Sonderform.
    useEffect(() => {
        if (showLobbyScreen) return;
        sendHeld(heldItemRef.current);
    }, [showLobbyScreen, sendHeld, selectedTool, selectedSeed, selectedCarryItem,
        selectedDecoToPlace, selectedPetToPlace]);

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

    // Gespeicherten Ladenbestand übernehmen, sobald BEIDES da ist — die Rotation und
    // der Spielstand. `ladenbestandGeladen` muss deshalb in den Abhängigkeiten stehen:
    // welche der beiden Anfragen zuerst antwortet, ist reines Rennen.
    useEffect(() => {
        if (savedShopStockRef.current && shopRotation?.generatedAt) {
            if (savedShopStockRef.current.version === Number(shopRotation.generatedAt)) {
                setPersonalShopStock(savedShopStockRef.current.stock);
            }
            savedShopStockRef.current = null;
        }
    }, [shopRotation?.generatedAt, ladenbestandGeladen]);

    useEffect(() => {
        if (savedToolShopStockRef.current && toolShopRotation?.generatedAt) {
            if (savedToolShopStockRef.current.version === Number(toolShopRotation.generatedAt)) {
                setToolShopStock(savedToolShopStockRef.current.stock);
            }
            savedToolShopStockRef.current = null;
        }
    }, [toolShopRotation?.generatedAt, ladenbestandGeladen]);

    useEffect(() => {
        if (savedEggShopStockRef.current && eggShopRotation?.generatedAt) {
            if (savedEggShopStockRef.current.version === Number(eggShopRotation.generatedAt)) {
                setEggShopStock(savedEggShopStockRef.current.stock);
            }
            savedEggShopStockRef.current = null;
        }
    }, [eggShopRotation?.generatedAt, ladenbestandGeladen]);

    // ── Shop rotation (global backend source) ──────────────────────
    useEffect(() => {
        if (showLobbyScreen) return;

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
                    announceRotation("Samen-Shop hat rotiert");
                }
                if (seedKey) seedRotationKeyRef.current = seedKey;
                seedNextRotationAtRef.current = Number(data.nextRotation || data.shopRotation?.nextRotation || 0);

                if (data.toolShopRotation) {
                    setToolShopRotation(data.toolShopRotation);
                    const toolKey = String(data.toolShopRotation.generatedAt || "");
                    if (toolKey && toolRotationKeyRef.current && toolRotationKeyRef.current !== toolKey) {
                        announceRotation("Tool-Shop neu aufgefüllt");
                    }
                    if (toolKey) toolRotationKeyRef.current = toolKey;
                    // Nur beim WECHSEL der Rotation auffüllen — sonst macht der Poller
                    // jeden Kauf nach spätestens 30 s wieder rückgängig.
                    const toolGen = Number(data.toolShopRotation.generatedAt);
                    if (toolGen !== toolShopSeededForGenAtRef.current) {
                        const nextStock = {};
                        for (const item of data.toolShopRotation.items || []) {
                            if (item.type === "single") nextStock[item.id] = item.stock || 0;
                        }
                        setToolShopStock(nextStock);
                        toolShopSeededForGenAtRef.current = toolGen;
                    }
                    toolNextRotationAtRef.current = Number(data.nextToolRotation || data.toolShopRotation.nextRotation || 0);
                }

                if (data.eggShopRotation) {
                    setEggShopRotation(data.eggShopRotation);
                    const eggKey = String(data.eggShopRotation.generatedAt || "");
                    if (eggKey && eggRotationKeyRef.current && eggRotationKeyRef.current !== eggKey) {
                        announceRotation("Eier-Shop hat rotiert");
                    }
                    if (eggKey) eggRotationKeyRef.current = eggKey;
                    const eggGen = Number(data.eggShopRotation.generatedAt);
                    if (eggGen !== eggShopSeededForGenAtRef.current) {
                        const nextEggStock = {};
                        for (const item of data.eggShopRotation.items || []) {
                            nextEggStock[item.id] = item.stock || 0;
                        }
                        setEggShopStock(nextEggStock);
                        eggShopSeededForGenAtRef.current = eggGen;
                    }
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
    }, [showLobbyScreen, apiCall, initPersonalStock, announceRotation, setShopRotationIfChanged]);

    // Einmaliger Nachlade-Versuch, falls beim Betreten noch keine Rotation da ist.
    //
    // Vorher hing dieser Effekt am GESAMTEN `shopRotation`-Objekt und setzte es selbst neu:
    // liefert der Server eine Rotation ohne Samen (`seeds: []`), greift die Abbruchprüfung
    // `shopRotation?.seeds?.length` nicht, der Effekt läuft erneut, holt, setzt ein neues
    // Objekt — und dreht sich mit voller Netzgeschwindigkeit im Kreis. In der Messung waren
    // das ~490 Zustandsänderungen pro Sekunde und damit praktisch alle React-Commits im
    // Leerlauf. Ein Ref begrenzt das jetzt auf einen Versuch; die laufende Aktualisierung
    // macht ohnehin der reguläre Rotations-Poller.
    useEffect(() => {
        if (showLobbyScreen) {
            shopBootstrapTriedRef.current = false;
            return;
        }
        if (shopRotation?.seeds?.length) return;
        if (shopBootstrapTriedRef.current) return;
        shopBootstrapTriedRef.current = true;
        apiCall("/global-shop")
            .then((data) => {
                if (!data?.shopRotation) return;
                setShopRotationIfChanged(data.shopRotation);
                const now = Date.now();
                const seedGen = data.shopRotation?.generatedAt;
                if (Number(seedGen) !== personalShopSeededForGenAtRef.current) {
                    initPersonalStock(data.shopRotation);
                    personalShopSeededForGenAtRef.current = Number(seedGen);
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
            .catch(() => { shopBootstrapTriedRef.current = false; });
    }, [showLobbyScreen, shopRotation?.seeds?.length, apiCall, initPersonalStock, setShopRotationIfChanged]);

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
            // Wetterfühlig: das Wetter greift häufiger zu.
            const skillFaktor = 1 + skillWirkung("wetterfuehlig");
                setPlotPlants((prev) => {
                let changed = false;
                const next = { ...prev };
                for (const [key, plant] of Object.entries(prev)) {
                    if (!plant) continue;
                    // Die Chance hängt jetzt am ZYKLUS der Pflanze, nicht mehr an
                    // einer festen Rate pro Minute. Vorher bekam eine Sorte mit
                    // Tagen an Wachstum garantiert alle vier Effekte (×11,25), eine
                    // mit Minuten praktisch keinen (×1,02) — der Aufschlag hing
                    // allein an der Wachstumsdauer und liess sich nicht einpreisen.
                    const wetterChance = wetterChanceFuer(zyklusMinuten(plant), skillFaktor);

                    // ── Dauerträger: Effekt hängt an der einzelnen Frucht ──────────
                    // Jede reife Frucht würfelt für sich. Dadurch können an einem Strauch
                    // zwei Früchte gefroren sein, ohne dass das Ernten der einen die
                    // andere zurücksetzt.
                    if (!plant.singleUse && Array.isArray(plant.fruitSlots)) {
                        let slotsChanged = false;
                        const nextSlots = plant.fruitSlots.map((slot) => {
                            if (!slot) return slot;
                            const aenderung = wetterEffektSchritt(slot, effectType, (slot.readyAt || 0) <= now, now, wetterChance);
                            if (!aenderung) return slot;
                            slotsChanged = true;
                            return { ...slot, ...aenderung };
                        });
                        if (slotsChanged) {
                            changed = true;
                            next[key] = { ...plant, fruitSlots: nextSlots };
                        }
                        continue;
                    }

                    // ── Einmalernte: Effekt gehört zur ganzen Pflanze ──────────────
                    const aenderung = wetterEffektSchritt(plant, effectType, isPlantReady(plant), now, wetterChance);
                    if (!aenderung) continue;
                    changed = true;
                    next[key] = { ...plant, ...aenderung };
                }
                return changed ? next : prev;
            });
        }, 60 * 1000);
        return () => clearInterval(interval);
        // Nur der Wetter-TYP ist relevant — mit dem vollen Objekt wurde das Intervall
        // während der Intensitäts-Rampe alle 120ms neu aufgesetzt. `skillWirkung` ist
        // ein Ref-Leser und ändert sich nie, hält das Intervall also auch nicht auf.
    }, [showLobbyScreen, weatherState?.type, skillWirkung]);

    // Ungelesene Chatzeilen zählen, solange das Fenster zu ist. Beim Öffnen wieder
    // auf null — sonst müsste man die Nachrichten einzeln „wegklicken".
    const chatGesehenRef = useRef(0);
    useEffect(() => {
        if (istChatOffen) {
            chatGesehenRef.current = chatVerlauf.length;
            setChatUngelesen(0);
            return;
        }
        setChatUngelesen(Math.max(0, chatVerlauf.length - chatGesehenRef.current));
    }, [chatVerlauf.length, istChatOffen]);

    // Immer die neueste Zeile zeigen. Ohne das steht man nach dem Öffnen oben im
    // Verlauf und sieht ausgerechnet das nicht, worauf gerade geantwortet wird.
    useEffect(() => {
        if (!istChatOffen) return;
        chatEndeRef.current?.scrollIntoView({ block: "end" });
    }, [istChatOffen, chatVerlauf.length]);

    // Universal countdown from absolute next-rotation timestamps
    //
    // NUR solange ein Laden offen ist. Die drei Werte stehen ausschliesslich in den
    // Ladenfenstern (Fortschrittsbalken und „Nächste Rotation in …"); vorher lief das
    // Intervall dauerhaft und hat GameContainer — eine der grössten Komponenten im
    // Projekt — jede Sekunde komplett neu aufbauen lassen, auch wenn niemand einen
    // Laden offen hatte. Beim Öffnen wird sofort gesetzt, damit nicht erst eine
    // Sekunde lang der alte Stand steht.
    useEffect(() => {
        if (showLobbyScreen || !activeShop) return undefined;
        const aktualisiere = () => {
            const now = Date.now();
            setShopCountdown(Math.max(0, seedNextRotationAtRef.current - now));
            setToolShopCountdown(Math.max(0, toolNextRotationAtRef.current - now));
            setEggShopCountdown(Math.max(0, eggNextRotationAtRef.current - now));
        };
        aktualisiere();
        const interval = setInterval(aktualisiere, 1000);
        return () => clearInterval(interval);
    }, [showLobbyScreen, activeShop]);

    useEffect(() => {
        if (showLobbyScreen) return undefined;
        const onKeyDown = (e) => {
            const target = e.target;
            const tag = (target?.tagName || "").toLowerCase();
            if (tag === "input" || tag === "textarea" || target?.isContentEditable) return;

            // Tab schaltet um, statt nur zu oeffnen — sonst kommt man mit derselben
            // Taste nicht wieder raus. Beim Schliessen auch den Hinweis wegnehmen,
            // der sonst ueber dem Spiel haengen bleibt.
            if (e.key === "Tab") {
                e.preventDefault();
                setBackpackOpen((offen) => {
                    if (offen) setItemHoverTooltip(null);
                    return !offen;
                });
                return;
            }

            // Deko in der Hand spiegeln. Der Fußabdruck bleibt dabei gleich — nur so
            // landet ein Objekt immer dort, wo man hinklickt (siehe DECO-Kommentar oben).
            if (e.code === "KeyR" && !e.repeat && selectedDecoToPlaceRef.current) {
                e.preventDefault();
                setDecoGespiegelt((prev) => !prev);
                return;
            }
            
            // Escape beendet das Einrichten — die naheliegendste Taste dafür.
            if (e.key === "Escape" && !e.repeat && editorAktivRef.current) {
                setEditorAktiv(false);
                setSelectedDecoToPlace(null);
                setVerschiebtGebaeude(null);
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

        // Wiederverwendete Hüllen für den Render-Aufruf. Sie werden pro Frame nur neu
        // BEFÜLLT, nie neu erzeugt — vorher entstanden hier bei 60 FPS vier frische
        // Objekte pro Frame (Pflanzen-Klon, Slot, Layout, Payload), was den Garbage
        // Collector regelmäßig zu Sammelläufen zwang: genau die Mikro-Ruckler.
        // Unbedenklich, weil der Renderer nichts davon über den Frame hinaus festhält
        // (sein Slot-Cache vergleicht über einen wertbasierten cacheKey, nicht über
        // Objektidentität) und `layout.current` dabei unangetastet bleibt.
        const drawState = {};
        const layoutBuf = {};
        const slotsBuf = [];
        const mySlotBuf = {};
        const foreignSlotBufs = {}; // slotIndex -> wiederverwendete Hülle für fremde Äcker
        const remoteBuf = [];       // wiederverwendete Liste der Mitspieler
        const fremdeTiere = [];     // Tiere von fremden Grundstücken (aus den Snapshots)
        const fremdeDeko = [];      // Deko von fremden Grundstücken
        // Gebäude der anderen — alle sichtbar, aber nur die Vitrine ist anlaufbar
        // (siehe FREMDE_GEBAEUDE). Der Puffer verhindert eine Neuanlage pro Bild.
        const fremdeGebaeude = [];
        const fremdeGebaeudeBufs = {}; // `${slotIndex}_${art}` -> wiederverwendeter Eintrag
        const alleTiere = [];       // eigene + fremde, so bekommt der Renderer sie
        const alleDeko = [];

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
                trash: 55,
                chest: 55,
                vitrine: 60,
            };
            for (const area of Object.values(engine.areas || {})) {
                if (area?.aktiv === false) continue;
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

            // ── INTERACTION PROXIMITY + E/SPACE ─────────────────────────────
            // Kein Objekt-Spread pro Frame mehr: nur die Referenz auf das nächste Areal
            // merken. setState läuft ausschließlich, wenn sich der Typ tatsächlich ändert —
            // vorher wurde bei 60+ FPS jeden Frame ein Updater in React geschoben.
            let nearestArea = null;
            let nearestDist = Infinity;
            for (const area of Object.values(engine.areas)) {
                if (area?.aktiv === false) continue;
                const dist = Math.hypot(player.x - area.x, player.y - area.y);
                if (dist < INTERACT_DIST && dist < nearestDist) {
                    nearestArea = area;
                    nearestDist = dist;
                }
            }

            // Gebäude der anderen: einmal pro Bild aus den Momentaufnahmen aufbauen.
            // Ein Grundstück ohne seine vier Bauten sah leer aus, obwohl der Nachbar
            // sie längst umgestellt hatte — jetzt steht bei allen dasselbe da.
            // Anlaufbar ist trotzdem nur die Vitrine: was in Inkubator, Mülleimer und
            // Kiste liegt, geht niemanden außer dem Besitzer etwas an.
            fremdeGebaeude.length = 0;
            for (const [slotIndex, snapshot] of plotsRef.current) {
                if (slotIndex === mySlotRef.current || !snapshot) continue;
                const fremdSlot = l.slots[slotIndex];
                if (!fremdSlot) continue;
                const stellen = berechneGebaeudePositionen(fremdSlot, snapshot.gebaeudeVersatz);
                const besitzer = snapshot.owner || "unbekannt";
                for (const art of FREMDE_GEBAEUDE) {
                    // Kiste und Vitrine erscheinen erst nach dem Kauf; Inkubator und
                    // Mülleimer hat jeder von Anfang an.
                    if (art.key === "vitrine" && !snapshot.vitrine) continue;
                    if (art.key === "chest" && snapshot.hasChest !== true) continue;
                    const stelle = stellen[art.key];
                    const bufKey = `${slotIndex}_${art.key}`;
                    const eintrag = fremdeGebaeudeBufs[bufKey] || (fremdeGebaeudeBufs[bufKey] = {
                        // `type` steuert die Bedienung, `art` das Aussehen — siehe bauart() im Renderer.
                        type: art.type, art: art.key,
                        label: "", image: AREA_IMAGES[art.key], owner: null, items: [],
                    });
                    eintrag.x = stelle.x;
                    eintrag.y = stelle.y;
                    eintrag.fussY = stelle.fussY;
                    eintrag.owner = snapshot.owner || null;
                    eintrag.label = `${art.name} von ${besitzer}`;
                    fremdeGebaeude.push(eintrag);
                    if (!art.anlaufbar) continue;
                    eintrag.items = snapshot.vitrine.items || [];
                    const dist = Math.hypot(player.x - eintrag.x, player.y - eintrag.y);
                    if (dist < INTERACT_DIST && dist < nearestDist) {
                        nearestArea = eintrag;
                        nearestDist = dist;
                    }
                }
            }

            // Briefkästen sind keine "areas" — sie hängen an den Grundstücken.
            // Sie konkurrieren um dieselbe "Öffnen"-Anzeige wie die Gebäude.
            let nearestMailboxSlot = null;
            let nearestMailboxOwner = null;
            for (let i = 0; i < l.slots.length; i++) {
                const slot = l.slots[i];
                // Der Besitzer steht bei FREMDEN Grundstücken nur in der Server-Momentaufnahme,
                // nicht auf l.slots — dort wird nur das eigene Schild beschriftet.
                const owner = i === mySlotRef.current
                    ? (slot.owner || localPlayerNameRef.current)
                    : (plotsRef.current.get(i)?.owner || null);
                if (!owner) continue; // freies Grundstück = kein Kasten in Betrieb
                const box = getMailboxHitArea(slot);
                const dist = Math.hypot(player.x - box.x, player.y - box.y);
                if (dist >= MAILBOX_INTERACT_DIST || dist >= nearestDist) continue;
                nearestMailboxSlot = slot;
                nearestMailboxOwner = owner;
                nearestDist = dist;
                nearestArea = null;
            }

            // Schlüssel statt Typ, damit auch der Wechsel zwischen zwei Briefkästen greift.
            const nearestKey = nearestMailboxSlot
                ? `mb${nearestMailboxSlot.id}`
                : (nearestArea?.type || null);
            if (nearestKey !== lastInteractableTypeRef.current) {
                lastInteractableTypeRef.current = nearestKey;
                if (nearestMailboxSlot) {
                    const isOwn = nearestMailboxSlot.id - 1 === mySlotRef.current;
                    activeTargetRef.current = {
                        type: "mailbox",
                        isOwn,
                        owner: nearestMailboxOwner,
                        label: isOwn ? "Deinen Briefkasten" : `Briefkasten von ${nearestMailboxOwner}`,
                    };
                } else {
                    activeTargetRef.current = nearestArea;
                }
                setCurrentInteractable(activeTargetRef.current);
            }
            if (activeTargetRef.current && (input.wasJustPressed("e") || input.wasJustPressed(" "))) {
                activateInteractable(activeTargetRef.current);
            }

            // Ein Tier wandert auf SEINEM Grundstück — egal, wem das gehört.
            // Auch fremde Tiere laufen dadurch herum statt wie angeklebt dazustehen.
            // Jeder Client würfelt das für sich; abgeglichen wird nichts, das würde
            // nur Datenverkehr kosten und sieht niemand.
            const bewegeTiere = (liste, slotIndex) => {
                const slot = l.slots[slotIndex];
                if (!slot || !Array.isArray(liste) || liste.length === 0) return;
                const drawY = slot.isTopRow ? slot.anchorY - MAP_CONFIG.territoryHeight : slot.anchorY;
                const minX = slot.x + 30;
                const maxX = slot.x + MAP_CONFIG.territoryWidth - 30;
                const minY = drawY + 30;
                const maxY = drawY + MAP_CONFIG.territoryHeight - 30;
                for (const pet of liste) {
                    if (!pet || pet.slotIndex !== slotIndex) continue;
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
                        if (pet.vx > 0) pet.facingRight = true;
                        else if (pet.vx < 0) pet.facingRight = false;
                    }
                    pet.x += pet.vx * deltaFactor;
                    pet.y += pet.vy * deltaFactor;
                    if (pet.x < minX || pet.x > maxX) {
                        pet.vx *= -1;
                        pet.x = Math.max(minX, Math.min(maxX, pet.x));
                        pet.facingRight = pet.vx > 0;
                    }
                    if (pet.y < minY || pet.y > maxY) {
                        pet.vy *= -1;
                        pet.y = Math.max(minY, Math.min(maxY, pet.y));
                    }
                }
            };

            bewegeTiere(engine.petPlacements, mySlotRef.current);
            for (const [slotIndex, snapshot] of plotsRef.current) {
                if (slotIndex === mySlotRef.current) continue;
                bewegeTiere(snapshot?.petPlacements, slotIndex);
            }

            // Stauden: Struktur→Wachstum nur hier (nicht im Renderer) mutieren
            const wallNow = Date.now();
            if (engine.plotPlants) {
                for (const p of Object.values(engine.plotPlants)) {
                    if (p && !p.singleUse) ensurePerennialFruitingState(p, wallNow);
                }
            }

            // ── RENDER ───────────────────────────────────────────────────────
            // Inject live plant data into slots
            const myPlotSlotIndex = mySlotRef.current;

            // 1. ANPASSUNG: Pflanze während dem Umtopfen vom Feld ausblenden.
            // Der Klon ist NUR dafür nötig — und nur, solange wirklich umgetopft wird.
            // Im Normalfall (kein Umtopfen) reicht die Referenz auf engine.plotPlants,
            // und es fällt keine einzige Kopie an.
            const hiddenPlantKey = selectedToolRef.current === "pot" ? movingPlantSourceRef.current : null;
            let visiblePlants = engine.plotPlants;
            if (hiddenPlantKey && visiblePlants && hiddenPlantKey in visiblePlants) {
                visiblePlants = { ...engine.plotPlants };
                delete visiblePlants[hiddenPlantKey];
            }

            // Fremde Slots gehen unverändert per Referenz durch, nur der eigene bekommt
            // die Live-Daten übergestülpt — in eine wiederverwendete Hülle statt in ein
            // neues Objekt. `l.slots` selbst wird dabei nicht verändert.
            slotsBuf.length = l.slots.length;
            // Wiederverwendete Puffer: pro Bild wird nur die Laenge zurueckgesetzt,
            // damit im Spielbetrieb keine neuen Arrays anfallen.
            fremdeTiere.length = 0;
            fremdeDeko.length = 0;
            for (let i = 0; i < l.slots.length; i++) {
                const slot = l.slots[i];
                if (i !== myPlotSlotIndex) {
                    // Fremdes Grundstück: Momentaufnahme vom Server überstülpen, falls
                    // dort gerade jemand farmt. Ohne Snapshot bleibt der Slot leer/„zu verkaufen".
                    const snapshot = plotsRef.current.get(i);
                    if (snapshot) {
                        const buf = foreignSlotBufs[i] || (foreignSlotBufs[i] = {});
                        Object.assign(buf, slot);
                        buf.plants = snapshot.plants;
                        buf.unlockedCells = snapshot.plotUnlockedCells;
                        buf.owner = snapshot.owner;
                        buf.hasMail = snapshot.hasMail;
                        slotsBuf[i] = buf;
                        // Tiere und Deko der anderen einsammeln — der Renderer bekommt
                        // sie als eine Liste und sortiert sie ueber `slotIndex` selbst
                        // auf die Grundstuecke.
                        if (Array.isArray(snapshot.petPlacements)) {
                            for (const pet of snapshot.petPlacements) if (pet) fremdeTiere.push(pet);
                        }
                        if (Array.isArray(snapshot.decoPlacements)) {
                            for (const deko of snapshot.decoPlacements) if (deko) fremdeDeko.push(deko);
                        }
                    } else {
                        slotsBuf[i] = slot;
                    }
                    continue;
                }
                Object.assign(mySlotBuf, slot);
                mySlotBuf.plants = visiblePlants;
                mySlotBuf.currentExpansions = plotExpansionsRef.current;
                mySlotBuf.unlockedCells = plotUnlockedCellsRef.current;
                slotsBuf[i] = mySlotBuf;
            }

            // ── MITSPIELER ───────────────────────────────────────────────────
            // Der Server tickt mit 15 Hz; ohne Nachziehen würden fremde Avatare springen.
            const remotes = remoteBuf;
            remotes.length = 0;
            for (const remote of remotePlayersRef.current.values()) {
                remote.x += (remote.tx - remote.x) * Math.min(1, 0.22 * deltaFactor);
                remote.y += (remote.ty - remote.y) * Math.min(1, 0.22 * deltaFactor);
                remotes.push(remote);
            }
            sendMove(player.x, player.y, player.facingRight !== false, isMoving);

            Object.assign(layoutBuf, l);
            layoutBuf.slots = slotsBuf;

            // 1. & 2. ANPASSUNG: Welches Item wird gerade in der Hand gehalten?
            let activeHeldItem = heldItemRef.current;
            if (selectedToolRef.current === "pot" && movingPlantSourceRef.current) {
                // Wenn wir umtopfen, lege die echte Pflanze vom Acker als aktives Item in die Hand
                const p = engine.plotPlants[movingPlantSourceRef.current];
                if (p) activeHeldItem = p;
            }

            // Felder überschreiben statt ein neues Payload-Objekt zu bauen.
            drawState.areas = engine.areas;
            drawState.fremdeGebaeude = fremdeGebaeude;
            drawState.readyEggsCount = readyEggsCountRef.current;
            drawState.layout = layoutBuf;
            drawState.zoom = zoomRef.current;
            drawState.selectedTool = selectedToolRef.current;
            drawState.heldItem = activeHeldItem; // Hier übergeben wir das frisch berechnete Item
            drawState.weather = weatherStateRef.current;
            drawState.renderProfile = renderProfileRef.current;
            // Eigene und fremde Tiere/Deko in einer Liste: der Renderer sortiert sie
            // ueber `slotIndex` auf die Grundstuecke und in die Tiefensortierung ein.
            alleTiere.length = 0;
            if (Array.isArray(engine.petPlacements)) {
                for (const pet of engine.petPlacements) if (pet) alleTiere.push(pet);
            }
            for (const pet of fremdeTiere) alleTiere.push(pet);
            alleDeko.length = 0;
            if (Array.isArray(engine.decoPlacements)) {
                for (const deko of engine.decoPlacements) if (deko) alleDeko.push(deko);
            }
            for (const deko of fremdeDeko) alleDeko.push(deko);
            drawState.petPlacements = alleTiere;
            drawState.decoPlacements = alleDeko;
            drawState.localPlayerName = localPlayerNameRef.current;
            drawState.playerAppearance = appearanceRef.current;
            drawState.playerBadge = playerBadgeRef.current;
            drawState.remotePlayers = remotes;
            // Raster nur über dem EIGENEN Grundstück; slot.id ist der Index + 1.
            drawState.editorSlotId = editorAktivRef.current ? mySlotRef.current + 1 : null;

            renderer.draw(drawState, player);

            animFrame = requestAnimationFrame(gameLoop);
        };

        gameLoop();
        return () => {
            cancelAnimationFrame(animFrame);
            window.removeEventListener("resize", onResize);
            try {
                engineRef.current?.input?.destroy?.();
                // Der Renderer wurde bisher NICHT abgeräumt: seine Bild- und
                // Canvas-Caches (je Grundstück bis zu 400 Offscreen-Flächen) blieben
                // liegen, bis der Browser irgendwann aufräumt — bei mehrfachem
                // Betreten der Welt stapelten sich komplette Instanzen.
                engineRef.current?.renderer?.destroy?.();
            } catch { /* */ }
            engineRef.current.renderer = null;
            engineRef.current.input = null;
        };
    }, [showLobbyScreen, activateInteractable]);

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
                image: pet.image || buildPetPreviewImage(pet.name),
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
        // Jeder Samen, der neu im Rucksack liegt, streicht einen offenen Kauf.
        // Pflanzen verkleinert das Inventar — dann bleibt der Zähler stehen.
        const dazu = Math.max(0, inventory.length - zuletztInventarRef.current);
        offeneSamenkaeufeRef.current = Math.max(0, offeneSamenkaeufeRef.current - dazu);
        zuletztInventarRef.current = inventory.length;
        farmStateRef.current = {
            // gold und harvestedItems standen in den Abhaengigkeiten, wurden hier
            // aber nie mitgeschrieben. handleBuySeed liest harvestedItems fuer die
            // Rucksackgrenze und bekam deshalb immer `undefined` — der volle
            // Ernte-Teil des Rucksacks zaehlte beim Kauf schlicht nicht mit.
            gold, harvestedItems,
            inventory, plotPlants, plotExpansions, plotUnlockedCells,
            eggInventory, petInventory, petPlacements, decoInventory, decoPlacements,
            toolInventory, inventoryMaxSlots, incubator, gebaeudeVersatz, logbuch,
            shopStock: personalShopStock,
            shopStockVersion: shopRotation?.generatedAt,
            toolShopStock: toolShopStock,
            toolShopStockVersion: toolShopRotation?.generatedAt,
            eggShopStock: eggShopStock,
            eggShopStockVersion: eggShopRotation?.generatedAt,
            appearance: playerAppearance,
            tutorialCompleted,
        };
    }, [gold, inventory, plotPlants, plotExpansions, plotUnlockedCells, harvestedItems, eggInventory, petInventory, petPlacements, decoInventory, decoPlacements, toolInventory, inventoryMaxSlots, incubator, gebaeudeVersatz, logbuch, personalShopStock, shopRotation?.generatedAt, toolShopStock, toolShopRotation?.generatedAt, eggShopStock, eggShopRotation?.generatedAt, playerAppearance, tutorialCompleted]);

    const debouncedSave = useCallback(() => {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => {
            flushFarmStateToServerRef.current?.();
        }, 500);
    }, []);

    /**
     * Beim Verlassen NICHT abbrechen, sondern rausschicken.
     *
     * Hier stand `useEffect(() => () => clearTimeout(saveTimeoutRef.current), [])`:
     * der Aufräumer hat den ausstehenden Speichervorgang VERWORFEN. Da
     * `debouncedSave` (500 ms) der einzige Weg ist, auf dem Pflanzen, Steinabbau,
     * Gießen, Umtopfen, Deko, Tiere und Käufe zum Server kommen — und der
     * Autosave erst nach 5 Sekunden Ruhe greift —, war alles seit dem letzten PUT
     * weg, sobald man die Seite wechselte oder neu lud. Bei Käufen besonders
     * bitter: `payServer` hatte das Gold schon abgebucht, die Ware lag nur lokal.
     *
     * `keepalive` ist entscheidend: ein gewöhnliches fetch() wird beim Entladen
     * der Seite abgebrochen.
     */
    useEffect(() => {
        const raus = () => {
            if (!isInitialLoadDoneRef.current || nurZuschauenRef.current) return;
            clearTimeout(saveTimeoutRef.current);
            const stand = farmStateRef.current || {};
            // gold und harvestedItems gehören dem Server und stehen bewusst nicht
            // im Payload (siehe compactFarmState).
            const { gold: _g, harvestedItems: _h, ...rest } = stand;
            const payload = { ...rest, tabId: TAB_ID, stateVersion: stateVersionRef.current };
            try {
                fetch("/api/garden/farm-state", {
                    method: "PUT",
                    credentials: "include",
                    keepalive: true,
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ state: payload }),
                }).catch(() => { /* Seite ist schon weg */ });
            } catch { /* egal */ }
        };
        const beiSichtwechsel = () => { if (document.visibilityState === "hidden") raus(); };
        window.addEventListener("pagehide", raus);
        document.addEventListener("visibilitychange", beiSichtwechsel);
        return () => {
            window.removeEventListener("pagehide", raus);
            document.removeEventListener("visibilitychange", beiSichtwechsel);
            raus();   // auch beim Seitenwechsel innerhalb der App
        };
    }, []);

    /**
     * Grundstück gewechselt? Alles mitnehmen, was am alten Platz klebt.
     *
     * Die Welten liegen nur im Arbeitsspeicher — nach einem Serverneustart vergibt die
     * Lobby die Plätze neu. Wer vorher unten stand und danach oben landet, wechselt
     * damit die REIHE, und daran hängen zwei verschiedene Altlasten:
     *
     *  1. Deko und Tiere speichern absolute Weltkoordinaten plus den Index ihres
     *     Grundstücks. Ohne Umrechnung lagen sie weiter an der alten Stelle — quer
     *     über der Karte auf fremdem Grund, während das eigene Grundstück leer war.
     *
     *  2. Freigelegte Steinfelder und die Pflanzen darauf zählen je nach Reihe ANDERS:
     *     oben wachsen die Erweiterungen nach oben (Reihe -1 bis -15), unten nach unten
     *     (Reihe 15 bis 29). Eine von unten mitgebrachte Reihe 16 landete oben rechnerisch
     *     unterhalb des Grundstücks — die Pflanzen standen auf dem Kiesweg.
     *
     * Das Grundstück ist zwischen den Reihen gespiegelt (der Acker liegt immer am Weg),
     * deshalb wird beim Reihenwechsel gespiegelt statt nur verschoben.
     */
    useEffect(() => {
        if (showLobbyScreen || !isInitialLoadDone) return;
        if (!Number.isInteger(mySlotIndex) || mySlotIndex < 0) return;
        const ziel = layout.current.slots[mySlotIndex];
        if (!ziel) return;
        const obenkante = (slot) => (slot.isTopRow ? slot.anchorY - MAP_CONFIG.territoryHeight : slot.anchorY);

        // ── Deko und Tiere: umrechnen, was auf einem anderen Grundstück verbucht ist ──
        const umziehen = (liste) => {
            if (!Array.isArray(liste) || liste.length === 0) return null;
            let geaendert = false;
            const neu = liste.map((eintrag) => {
                const alt = layout.current.slots[eintrag?.slotIndex];
                if (!alt || eintrag.slotIndex === mySlotIndex) return eintrag;
                geaendert = true;
                const x = Number.isFinite(eintrag.x) ? eintrag.x + (ziel.x - alt.x) : eintrag.x;
                let y = eintrag.y;
                if (Number.isFinite(y)) {
                    const relativ = y - obenkante(alt);
                    // Gleiche Reihe: schlicht verschieben. Andere Reihe: spiegeln, sonst
                    // landet Deko vom unteren Wiesenstreifen oben mitten im Acker.
                    y = alt.isTopRow === ziel.isTopRow
                        ? obenkante(ziel) + relativ
                        : obenkante(ziel) + MAP_CONFIG.territoryHeight - relativ;
                }
                return { ...eintrag, slotIndex: mySlotIndex, x, y };
            });
            return geaendert ? neu : null;
        };

        // ── Erweiterungsfelder: Zählweise der Reihe angleichen ───────────────────
        // Gültig sind oben -15..14, unten 0..29. Alles außerhalb stammt aus der
        // anderen Reihe und wird umgerechnet: Erweiterung n ist oben -n und unten 14+n.
        const andereReihe = (y) => istAndereReihe(y, ziel.isTopRow);
        const umrechnenY = (y) => spiegleZeile(y, ziel.isTopRow);

        const neueZellen = (() => {
            if (!Array.isArray(plotUnlockedCells) || plotUnlockedCells.length === 0) return null;
            let geaendert = false;
            const raus = plotUnlockedCells.map((key) => {
                const [xs, ys] = String(key).split("_");
                const y = Number(ys);
                if (!Number.isInteger(y) || !andereReihe(y)) return key;
                geaendert = true;
                return `${xs}_${umrechnenY(y)}`;
            });
            return geaendert ? normalizePlotUnlockedCells(raus) : null;
        })();

        const neuePflanzen = (() => {
            const keys = Object.keys(plotPlants || {});
            if (keys.length === 0) return null;
            let geaendert = false;
            const raus = {};
            // Erst alles übernehmen, was schon in der Zählweise dieser Reihe steht —
            // sonst könnte eine umgerechnete Pflanze eine bestehende überschreiben.
            const umzuziehen = [];
            for (const key of keys) {
                const y = Number(key.split("_")[1]);
                if (!Number.isInteger(y) || !andereReihe(y)) { raus[key] = plotPlants[key]; continue; }
                geaendert = true;
                umzuziehen.push(key);
            }
            for (const key of umzuziehen) {
                const [xs, ys] = key.split("_");
                const ziel = `${xs}_${umrechnenY(Number(ys))}`;
                // Ein gemischter Stand (beide Zählweisen gleichzeitig) sollte nicht
                // vorkommen, ein verspäteter PUT kann ihn aber erzeugen. Dann lieber
                // ein freies Nachbarfeld suchen als eine Pflanze verschwinden lassen.
                raus[raus[ziel] ? freiesAckerfeld(raus) || ziel : ziel] = plotPlants[key];
            }
            return geaendert ? raus : null;
        })();

        const neueDeko = umziehen(decoPlacements);
        const neueTiere = umziehen(petPlacements);
        if (!neueDeko && !neueTiere && !neueZellen && !neuePflanzen) return;
        if (neueDeko) setDecoPlacements(neueDeko);
        if (neueTiere) setPetPlacements(neueTiere);
        if (neueZellen) setPlotUnlockedCells(neueZellen);
        if (neuePflanzen) setPlotPlants(neuePflanzen);
        notify("Dein Grundstück liegt jetzt woanders — Acker, Deko und Tiere sind mitgezogen.");
        debouncedSave();
    }, [showLobbyScreen, isInitialLoadDone, mySlotIndex, decoPlacements, petPlacements,
        plotUnlockedCells, plotPlants, notify, debouncedSave]);

    /** Sofort speichern statt in 500 ms — noetig, bevor der Server ueber etwas
     *  entscheiden soll, das bisher nur im Browser steht (z. B. ein Tier). */
    const flushSave = useCallback(async (ueberschreibung) => {
        clearTimeout(saveTimeoutRef.current);
        await flushFarmStateToServerRef.current?.(ueberschreibung);
    }, []);

    /** Kasse: erst der Server bucht ab, dann bekommt der Spieler die Ware.
     *  Gold gehoert ab v3.0 dem Server — eine nur lokale Abbuchung waere beim
     *  naechsten Laden wieder da (und die Ware trotzdem im Rucksack). */
    const payServer = useCallback(async (betrag) => {
        const data = await apiCall("/action", {
            method: "POST",
            body: JSON.stringify({ action: "spend", amount: Math.round(Number(betrag) || 0) }),
        });
        if (typeof data?.gold === "number") {
            // SOFORT ins Ref, nicht erst beim nächsten Rendern. Die Warteschlange
            // startet den nächsten Kauf über setTimeout(0) — der läuft mitunter
            // schon, bevor React den neuen Goldstand übernommen hat. Prüfte der
            // nächste Kauf gegen den React-Wert, sähe er das Gold von VOR dieser
            // Zahlung, liesse einen Kauf durch, den man sich nicht mehr leisten
            // kann, und der Server müsste ihn ablehnen. Für den Spieler sah das so
            // aus, als spränge der Ladenbestand grundlos zurück.
            goldRef.current = data.gold;
            setGold(data.gold);
        }
        return data;
    }, [apiCall]);

    /**
     * Antwort der Wirtschafts-Route uebernehmen — der Server ist die Wahrheit.
     *
     * `zellen` nennt die tatsaechlich veraenderten Felder. Ohne diese Angabe wurde
     * bei JEDER Ernte die komplette Pflanzenkarte ersetzt: 35 neue Objekte, alle
     * Pflanzen-Caches im Renderer entwertet, ein grosser React-Commit mitten in der
     * Bewegung. Genau das machte das Einsammeln zaeh. Ein leeres Array heisst
     * "Pflanzen nicht anfassen" (z. B. beim Verkaufen).
     */
    /**
     * Trägt geerntete Stücke ins Logbuch ein: kleinste und größte Größe je Art und
     * alles an Veredelungen, was einem je untergekommen ist. Reines Nachschlagewerk —
     * nichts davon beeinflusst Werte, deshalb darf es im Browser geführt werden.
     */
    const logbuchEintragen = useCallback((stuecke) => {
        const liste = (Array.isArray(stuecke) ? stuecke : [stuecke]).filter((i) => i?.seedId);
        if (liste.length === 0) return;
        setLogbuch((prev) => {
            const next = { ...prev };
            let geaendert = false;
            for (const item of liste) {
                const alt = next[item.seedId] || { min: null, max: null, effekte: [], anzahl: 0 };
                const groesse = Number(item.size) || 1;
                const effekte = new Set(alt.effekte || []);
                if (item.specialData?.name) effekte.add(item.specialData.name);
                // Alle Wetter des Stücks, nicht nur das stärkste — sonst fehlt im
                // Logbuch der Nachweis für jede Kombination, die man je hatte.
                for (const e of wetterListe(item)) effekte.add(e);
                next[item.seedId] = {
                    min: alt.min === null ? groesse : Math.min(alt.min, groesse),
                    max: alt.max === null ? groesse : Math.max(alt.max, groesse),
                    effekte: [...effekte],
                    anzahl: (alt.anzahl || 0) + 1,
                };
                geaendert = true;
            }
            return geaendert ? next : prev;
        });
    }, []);

    const applyEconomy = useCallback((data, zellen) => {
        if (typeof data?.gold === "number") setGold(data.gold);
        // Der Server nennt bei „harvest" ein Stück, bei „harvestMany" mehrere.
        if (data?.item || Array.isArray(data?.items)) logbuchEintragen(data.items || data.item);
        if (Array.isArray(data?.harvestedItems)) setHarvestedItems(hydrateHarvestedItems(data.harvestedItems));
        if (!data?.plotPlants || typeof data.plotPlants !== "object") return;
        if (!zellen) {
            setPlotPlants(normalizePlotPlantsMap(data.plotPlants));
            return;
        }
        if (zellen.length === 0) return;
        setPlotPlants((prev) => {
            const next = { ...prev };
            for (const key of zellen) {
                const vomServer = data.plotPlants[key];
                if (vomServer) next[key] = hydratePlantVisuals(vomServer);
                else delete next[key];
            }
            return next;
        });
    }, [normalizePlotPlantsMap, hydratePlantVisuals, logbuchEintragen]);

    /**
     * Ernte zwischen Rucksack und Ablage (Kiste/Vitrine) schieben. Beide Seiten
     * gehören dem Server — hier wird nur seine Antwort übernommen.
     */
    /**
     * Ein- und Auslagern, einzeln oder alles auf einmal.
     *
     * Seit die Kiste auch Samen, Eier, Deko und Tiere nimmt, verschiebt der Server
     * Listen, die dem BROWSER gehören. Deshalb wird vorher ausstehender Speicherstand
     * rausgeschickt: ein noch wartender PUT mit dem alten Rucksack würde sonst
     * gerade Eingelagertes wieder danebenlegen — das Stück läge dann doppelt da.
     */
    const handleAblage = useCallback(async (art, itemId, richtung) => {
        setAblageBusy(true);
        try {
            await flushSave();
            const alles = itemId === null || itemId === undefined;
            const data = await apiCall("/action", {
                method: "POST",
                body: JSON.stringify({
                    action: richtung === "ein"
                        ? (alles ? "ablageAllesEin" : "ablageEin")
                        : (alles ? "ablageAllesAus" : "ablageAus"),
                    ablage: art,
                    ...(alles ? {} : { itemId }),
                }),
            });
            if (Array.isArray(data?.harvestedItems)) setHarvestedItems(hydrateHarvestedItems(data.harvestedItems));
            if (Array.isArray(data?.chestItems)) setChestItems(hydrateHarvestedItems(data.chestItems));
            if (Array.isArray(data?.vitrineItems)) setVitrineItems(hydrateHarvestedItems(data.vitrineItems));
            if (Array.isArray(data?.inventory)) setInventory(hydrateSeeds(data.inventory));
            if (Array.isArray(data?.eggInventory)) setEggInventory(data.eggInventory);
            if (Array.isArray(data?.decoInventory)) setDecoInventory(data.decoInventory);
            if (Array.isArray(data?.petInventory)) setPetInventory(hydratePets(data.petInventory));
            if (alles && Number.isFinite(data?.bewegt)) {
                const rest = data.liegengeblieben
                    ? ` ${data.liegengeblieben} blieben liegen (Rucksack voll).`
                    : data.rest ? " Der Rest passte nicht mehr hinein." : "";
                notify(`${data.bewegt} ${data.bewegt === 1 ? "Sache" : "Sachen"} ${richtung === "ein" ? "eingelagert" : "herausgeholt"}.${rest}`);
            }
        } catch (err) {
            notify(err?.message || "Hat nicht geklappt.", "error");
        } finally {
            setAblageBusy(false);
        }
    }, [apiCall, notify, flushSave]);

    // ── Buy seed from shop ────────────────────────────────────────────────────
    /**
     * Einen Bestand SOFORT um eins verringern — synchron, noch bevor der Server
     * gefragt wird. Gibt zurück, ob überhaupt etwas da war.
     */
    const reserviere = useCallback((ref, setzer, schluessel) => {
        const frei = ref.current?.[schluessel] ?? 0;
        if (frei <= 0) return false;
        ref.current = { ...ref.current, [schluessel]: frei - 1 };
        setzer(ref.current);
        return true;
    }, []);

    /** Reservierung zurücknehmen, wenn der Kauf doch nicht zustande kam. */
    const gibZurueck = useCallback((ref, setzer, schluessel) => {
        ref.current = { ...ref.current, [schluessel]: (ref.current?.[schluessel] ?? 0) + 1 };
        setzer(ref.current);
    }, []);

    const handleBuySeed = useCallback(async (seed) => {
        if (kaufLaeuftRef.current) { kaufEinreihen(() => handleBuySeedRef.current?.(seed)); return; }
        if (goldRef.current < seed.shopPrice) { notify(`Dafür fehlen dir ${formatGold(seed.shopPrice - goldRef.current)} Gold.`, "error"); return; }
        // Belegung aus dem Ref, ABER mit den Käufen, die in dieser Klickfolge schon
        // durch sind. Der Ref wird erst beim nächsten Rendern nachgezogen; ohne den
        // Zuschlag rutschte genau ein Samen über die Rucksackgrenze.
        const { inventory: inv0, harvestedItems: hi0, inventoryMaxSlots: maxSlots } = farmStateRef.current;
        const belegt = (inv0?.length || 0) + (hi0?.length || 0) + offeneSamenkaeufeRef.current;
        if (belegt >= (maxSlots || 50)) {
            notify("Rucksack voll — kauf ein Upgrade im Tool-Shop.", "error");
            return;
        }
        if (!reserviere(personalShopStockRef, setPersonalShopStock, seed.seedId)) return;
        offeneSamenkaeufeRef.current += 1;
        kaufLaeuftRef.current = true;
        try {
            await payServer(seed.shopPrice);
        } catch (err) {
            gibZurueck(personalShopStockRef, setPersonalShopStock, seed.seedId);
            offeneSamenkaeufeRef.current = Math.max(0, offeneSamenkaeufeRef.current - 1);
            notify(err?.message || "Kauf fehlgeschlagen.", "error");
            return;
        } finally {
            kaufLaeuftRef.current = false;
            naechstenKaufStarten();
        }
        const boughtSeed = { ...seed, instanceId: Math.random().toString(36).slice(2) };
        setInventory(inv => [...inv, boughtSeed]);
        setSelectedSeed(prev => prev || boughtSeed);
        debouncedSave();
    }, [gold, notify, debouncedSave, payServer, reserviere, gibZurueck, kaufEinreihen, naechstenKaufStarten]);

    // Ueber ein Ref, damit ein eingereihter Klick sich selbst nachreichen kann.
    useEffect(() => { handleBuySeedRef.current = handleBuySeed; }, [handleBuySeed]);

    // ── Plant seed in cell ────────────────────────────────────────────────────
    const handleCellClick = useCallback(async (cellX, cellY) => {
        const seedToPlant = selectedSeed || inventory[0];
        if (!seedToPlant) return;
        const key = `${cellX}_${cellY}`;
        // Bewusst ohne Hinweis: beim schnellen Pflanzen trifft man oft zweimal
        // dieselbe Zelle, und eine Fehlermeldung dafuer stoert mehr als sie hilft.
        if (plotPlants[key]) return;

        // „Grüner Daumen" plus „Wurzelwerk" des Gärtners — dieselbe Rechnung wie
        // serverseitig in wachstumsBonus() (garden/core/economy.js), damit eine von
        // Hand gesetzte Pflanze nicht anders wächst als eine nachgewachsene.
        const wurzelwerk = getGaertnerStufe(petPlacements, mySlotRef.current) * GAERTNER_WURZELWERK;
        const plant = wachstumBeschleunigen(
            createPlantInstance(seedToPlant, cellX, cellY),
            Math.min(0.8, skillWirkung("gruener_daumen") + wurzelwerk),
            Date.now(),
        );
        setPlotPlants(prev => ({ ...prev, [key]: plant }));
        playSound("plant", 0.5);
        setInventory(inv => {
            const nextInv = inv.filter(s => s.instanceId !== seedToPlant.instanceId);
            const nextSelected = nextInv.find(s => s.seedId === seedToPlant.seedId) || nextInv[0] || null;
            setSelectedSeed(nextSelected);
            return nextInv;
        });
        debouncedSave();
    }, [selectedSeed, inventory, plotPlants, notify, debouncedSave, skillWirkung, petPlacements]);

    // ── Harvest plant ─────────────────────────────────────────────────────────
    // Wert, Groesse, Sonderform und Wetterbonus rechnet weiterhin ausschliesslich
    // der Server. Die OPTIK laeuft aber voraus: die Zelle wird sofort geleert,
    // statt erst nach der Antwort. Vorher lag zwischen Klick und Reaktion eine
    // ganze Netzrunde — das war der Grund, warum sich das Einsammeln zaeh anfuehlte.
    // Lehnt der Server ab, steht die Pflanze wieder da.
    const handleHarvest = useCallback(async (key, plant) => {
        if (!isPlantReady(plant)) return;
        // Eine Zelle darf nur EINE Ernte gleichzeitig unterwegs haben — sonst schickt
        // ein zweiter Klick eine Anfrage los, die der Server ablehnt.
        //
        // Klicks während dieser Zeit wurden aber bisher WEGGEWORFEN. Eine Ernte
        // kostet eine Netzrunde; auf einer Verbindung mit 250 ms kam so nur jeder
        // zweite Klick an, bei schlechterer Leitung noch weniger. An einer Staude mit
        // acht reifen Früchten fühlte sich das an, als wäre die Maus gedrosselt.
        // Jetzt werden sie angestellt und der Reihe nach abgearbeitet.
        if (ernteLaeuftRef.current.has(key)) {
            const offen = ernteWarteschlangeRef.current.get(key) || 0;
            if (offen < ERNTE_WARTESCHLANGE_MAX) ernteWarteschlangeRef.current.set(key, offen + 1);
            return;
        }
        ernteLaeuftRef.current.add(key);
        playSound("harvest", 0.5);
        const vorherigerStand = plant;
        setPlotPlants((prev) => {
            const p = prev[key];
            if (!p) return prev;
            const next = { ...prev };
            if (p.singleUse !== false) {
                delete next[key];
                return next;
            }
            // Dauertraeger: die am laengsten reife Frucht optisch zuruecksetzen —
            // dieselbe Auswahl wie auf dem Server, damit nichts springt.
            const slots = Array.isArray(p.fruitSlots) ? p.fruitSlots : [];
            const jetzt = Date.now();
            let idx = -1; let aeltester = Infinity;
            for (let i = 0; i < slots.length; i++) {
                const ra = Number(slots[i]?.readyAt ?? Infinity);
                if (ra <= jetzt && ra < aeltester) { aeltester = ra; idx = i; }
            }
            if (idx === -1) return prev;
            const neueSlots = slots.slice();
            neueSlots[idx] = {
                ...neueSlots[idx],
                readyAt: jetzt + (Number(p.fruitCycleMs) || 60000),
                statusEffects: [], statusEffect: null, statusEffectUntil: null, specialType: null,
            };
            next[key] = { ...p, fruitSlots: neueSlots };
            return next;
        });
        const ernte = () => apiCall("/action", {
            method: "POST",
            body: JSON.stringify({ action: "harvest", key }),
        });
        /**
         * Antwort übernehmen, OHNE den eigenen Acker zu verwerfen.
         *
         * Vorher ersetzte die Antwort die ganze Pflanze durch die Server-Fassung. Der
         * Acker gehört aber dem Browser und erreicht den Server nur alle fünf Sekunden:
         * jeder Fruchtstand, der seit dem letzten Speichern reif geworden war, ging
         * dabei verloren. An einer Staude mit acht reifen Früchten kam deshalb genau
         * EINE durch — danach hielt der Browser die Pflanze für leer und man wartete
         * auf das Nachwachsen. Genau das fühlte sich wie eine gedrosselte Maus an.
         *
         * Jetzt wird nur der eine nachgewachsene Fruchtstand übernommen (den würfelt
         * weiterhin der Server), der Rest bleibt beim Browser.
         */
        // Gibt die Pflanze zurück, wie sie danach dasteht — die angestellte nächste
        // Ernte rechnet damit weiter, statt auf das nächste Rendern zu warten.
        const uebernehmen = (data) => {
            applyEconomy(data, []);          // Gold und Lager ja, Pflanzen nein
            const nach = data?.nachgewachsen;
            if (!Number.isInteger(nach?.index) || !nach?.slot) {
                // Einmalernte: die Zelle ist schon optimistisch geleert.
                if (plant.singleUse !== false) return null;
                // Kein Fruchtstand gemeldet (alter Server) — dann wie früher.
                const vomServer = data?.plotPlants?.[key];
                if (!vomServer) return null;
                const hydriert = hydratePlantVisuals(vomServer);
                setPlotPlants((prev) => ({ ...prev, [key]: hydriert }));
                return hydriert;
            }
            // Vom Stand VOR dem Klick ausgehen: die optimistische Vorschau hat
            // vielleicht einen anderen Stand vorgezogen als der Server genommen hat.
            const basisSlots = Array.isArray(vorherigerStand?.fruitSlots) ? vorherigerStand.fruitSlots : null;
            if (!basisSlots || nach.index >= basisSlots.length) return null;
            const neueSlots = basisSlots.slice();
            neueSlots[nach.index] = nach.slot;
            const danach = { ...vorherigerStand, fruitSlots: neueSlots };
            setPlotPlants((prev) => (prev[key] ? { ...prev, [key]: danach } : prev));
            return danach;
        };
        /** Wie die Pflanze nach dieser Ernte dasteht — Grundlage für den nächsten Klick. */
        let danach = null;
        try {
            danach = uebernehmen(await ernte());
            letzteErnteRef.current.set(key, Date.now());
        } catch (err) {
            const m = err?.message || "Ernte fehlgeschlagen.";
            // ── Antwort nie angekommen ────────────────────────────────────────
            // Ohne HTTP-Status ist die Anfrage nicht beantwortet worden (Netz weg,
            // Proxy-Timeout). Ob der Server geerntet hat, wissen wir NICHT — und
            // ein Rollback wäre hier fatal: die Pflanze stünde wieder auf dem
            // Acker, das Gold dafür wäre schon gutgeschrieben, und der nächste
            // Speichervorgang würde sie über den 409-Nachreichweg beim Server
            // festschreiben. Genau daraus liess sich Gold aus dem Nichts machen.
            // Also nichts zurückrollen, sondern den echten Stand holen.
            if (err?.status === undefined) {
                ernteWarteschlangeRef.current.delete(key);
                await uebernimmVomServer(null);
                return;   // finally räumt ernteLaeuftRef auf
            }
            // Zu schnell geklickt: bei einem Dauerträger mit acht Fruchtständen
            // gehen leicht mehr Klicks raus, als reife Früchte da sind. Der Server
            // sagt dann zu Recht nein — das ist kein Fehler, den man melden muss.
            const geradeGeerntet = Date.now() - (letzteErnteRef.current.get(key) || 0) < 5000;
            // Der Acker gehoert weiterhin dem Browser und wandert nur mit dem
            // Speichervorgang zum Server. Wer giesst und sofort erntet — oder eine
            // Staude abpflueckt, die gerade erst Fruechte angesetzt hat — fragt
            // gegen einen aelteren Stand. Also: Zelle zurueck, Stand hochschieben,
            // ein zweiter Versuch. Bleibt es dabei, war es ein echtes Nein.
            // WICHTIG: nach einer gerade gelungenen Ernte NICHT wiederholen. Der
            // Rücksprung würde den alten Fruchtstand zurückschreiben und der zweite
            // Versuch dieselbe Frucht ein zweites Mal auszahlen.
            const veraltet = !geradeGeerntet && (
                m.includes("Noch nicht reif")
                || m.includes("Keine reife Frucht")
                || m.includes("wächst nichts"));
            if (veraltet) {
                const wiederhergestellt = { ...(farmStateRef.current.plotPlants || {}), [key]: vorherigerStand };
                setPlotPlants(wiederhergestellt);
                try {
                    // Die Pflanze ausdruecklich mitgeben: setPlotPlants wirkt erst
                    // beim naechsten Rendern, der Payload wuerde sie sonst vermissen.
                    await flushSave({ plotPlants: wiederhergestellt });
                    // Hier ist der Server frisch beliefert — trotzdem derselbe Weg,
                    // damit nur der nachgewachsene Fruchtstand übernommen wird.
                    danach = uebernehmen(await ernte());
                    letzteErnteRef.current.set(key, Date.now());
                    return;   // finally raeumt ernteLaeuftRef auf
                } catch { /* zweiter Versuch auch nein — unten wie gehabt melden */ }
            }
            setPlotPlants((prev) => ({ ...prev, [key]: vorherigerStand }));
            // Ein Nein gilt für die ganze Warteschlange: sonst hämmert jeder
            // angestellte Klick auf dieselbe Absage.
            ernteWarteschlangeRef.current.delete(key);
            if (m.includes("Rucksack")) notify("Rucksack voll — verkauf erst Ernte oder kauf ein Upgrade.", "error");
            else if (geradeGeerntet) { /* Überklick nach erfolgreicher Ernte — still bleiben */ }
            else if (!m.includes("wächst nichts")) notify(m, "error");
        } finally {
            ernteLaeuftRef.current.delete(key);
            // Angestellte Klicks abarbeiten, solange wirklich noch etwas reif ist.
            const offen = ernteWarteschlangeRef.current.get(key) || 0;
            if (offen > 0) {
                if (danach && isPlantReady(danach)) {
                    ernteWarteschlangeRef.current.set(key, offen - 1);
                    handleHarvestRef.current?.(key, danach);
                } else {
                    ernteWarteschlangeRef.current.delete(key);
                }
            }
        }
    }, [apiCall, applyEconomy, notify, playSound, flushSave, uebernimmVomServer]);

    // Ueber ein Ref, damit die Warteschlange sich selbst aufrufen kann.
    useEffect(() => { handleHarvestRef.current = handleHarvest; }, [handleHarvest]);

    /** Zusätzlichen Tier-Platz kaufen. Gold bucht der Server ab (payServer). */
    const handleBuyPetSlot = useCallback(async () => {
        // Einreihen statt verwerfen — dieselbe Behandlung wie bei Samen, Werkzeug
        // und Eiern. Hier stand `return`, ein Klick während eines laufenden Kaufs
        // ging also spurlos verloren.
        if (kaufLaeuftRef.current) { kaufEinreihen(() => handleBuyPetSlotRef.current?.()); return; }
        const toolInv = normalizeToolInventory(toolInventoryRef.current || toolInventory);
        const aktuell = toolInv.petSlots;
        const preis = getPetSlotPreis(aktuell);
        if (preis === null) { notify(`Mehr als ${PET_SLOTS_MAX} Plätze gibt es nicht.`, "error"); return; }
        if (goldRef.current < preis) { notify("Dafür reicht dein Gold nicht.", "error"); return; }
        // Sofort vormerken, sonst zahlt ein zweiter Klick denselben Platz noch einmal.
        toolInventoryRef.current = { ...toolInv, petSlots: Math.min(PET_SLOTS_MAX, aktuell + 1) };
        kaufLaeuftRef.current = true;
        try {
            await payServer(preis);
        } catch (err) {
            toolInventoryRef.current = toolInv;
            notify(err?.message || "Kauf fehlgeschlagen.", "error");
            return;
        } finally {
            kaufLaeuftRef.current = false;
            naechstenKaufStarten();   // fehlte: eingereihte Klicks blieben liegen
        }
        setToolInventory((prev) => ({
            ...normalizeToolInventory(prev),
            petSlots: Math.min(PET_SLOTS_MAX, normalizeToolInventory(prev).petSlots + 1),
        }));
        playSound("cash", 0.5);
        notify(`Tier-Platz ${aktuell + 1} freigeschaltet.`);
        debouncedSave();
    }, [toolInventory, payServer, notify, playSound, debouncedSave, kaufEinreihen, naechstenKaufStarten]);

    useEffect(() => { handleBuyPetSlotRef.current = handleBuyPetSlot; }, [handleBuyPetSlot]);

    const handleBuyTool = useCallback(async (tool) => {
        if (kaufLaeuftRef.current) { kaufEinreihen(() => handleBuyToolRef.current?.(tool)); return; }
        // Der Besitzstand kommt aus dem Ref, nicht aus dem Render: sonst sieht ein
        // schneller zweiter Klick noch „Schaufel nicht vorhanden" und zahlt erneut.
        const toolInv = normalizeToolInventory(toolInventoryRef.current || toolInventory);
        // 7. ANPASSUNG: Preisweiche
        // „Bergmann" ist jetzt ein Preisnachlass auf die Spitzhacke (max −30 %).
        // Als Save-Chance beim Abbau hat er die ANZAHL der Käufe gesenkt und damit
        // auf der Exponentialkurve rund 90 % der Gesamtkosten gestrichen.
        const effectivePrice = tool.id === "backpack_upgrade"
            ? getBackpackUpgradePrice(toolInv.backpackLevel || 0)
            : tool.id === "pickaxe"
            ? Math.max(1, Math.floor(getPickaxePrice(toolInv.pickaxesBought || 0) * (1 - Math.min(0.6, skillWirkung("bergbau")))))
            : tool.price;

        // MIT Meldung: der Knopf im Laden rechnet mit dem Stand aus dem React-State,
        // dieser Kauf mit dem aus dem Ref. Weichen sie ab, sah man einen aktiven
        // Knopf, der beim Klick nichts tat — und keinen Hinweis, woran es lag.
        if (goldRef.current < effectivePrice) {
            notify(`Dafür fehlen dir ${formatGold(effectivePrice - goldRef.current)} Gold.`, "error");
            return;
        }
        if (tool.id === "shovel" && toolInv.hasShovel) return;
        // Kiste und Vitrine stehen einmal auf dem Grundstück — ein zweiter Kauf
        // brächte nichts und würde nur Gold verbrennen.
        if (tool.id === "chest" && toolInv.hasChest) { notify("Du hast schon eine Kiste.", "error"); return; }
        if (tool.id === "vitrine" && toolInv.hasVitrine) { notify("Du hast schon eine Vitrine.", "error"); return; }

        // Die Spitzhacke hatte hier früher ein Lagerlimit von 1 pro Shop-Rotation und
        // war damit nur alle zehn Minuten einmal zu haben — beim Freilegen von Steinen
        // wartete man mehr, als man spielte. Begrenzt wird sie jetzt allein über ihren
        // Preis, der mit jedem Kauf um 30 % steigt.
        const hatBestand = tool.type === "single";
        if (hatBestand && !reserviere(toolShopStockRef, setToolShopStock, tool.id)) return;
        // Alles, was den nächsten Kauf beeinflusst, sofort im Ref fortschreiben — bis
        // der Server antwortet und React neu rendert, würde ein schneller zweiter Klick
        // sonst noch den alten Stand sehen: bei einmaligen Sachen „habe ich noch nicht"
        // und bei Spitzhacke und Rucksack den alten, niedrigeren Preis. Für die
        // Spitzhacke ist das jetzt entscheidend, weil sie kein Lagerlimit mehr bremst.
        if (tool.id === "shovel" || tool.id === "chest" || tool.id === "vitrine") {
            const feld = tool.id === "shovel" ? "hasShovel" : tool.id === "chest" ? "hasChest" : "hasVitrine";
            toolInventoryRef.current = { ...toolInv, [feld]: true };
        } else if (tool.id === "pickaxe") {
            toolInventoryRef.current = { ...toolInv, pickaxesBought: (toolInv.pickaxesBought || 0) + 1 };
        } else if (tool.id === "backpack_upgrade") {
            // Harter Deckel: der Server klemmt inventoryMaxSlots ab, backpackLevel
            // lief aber unbegrenzt weiter — jedes Upgrade darüber kostete Millionen
            // und gab nichts.
            if ((toolInv.backpackLevel || 0) >= BACKPACK_MAX_LEVEL) {
                notify(`Der Rucksack ist voll ausgebaut (${50 + BACKPACK_MAX_LEVEL * 10} Plätze).`, "error");
                return;
            }
            toolInventoryRef.current = { ...toolInv, backpackLevel: (toolInv.backpackLevel || 0) + 1 };
        }

        kaufLaeuftRef.current = true;
        try {
            await payServer(effectivePrice);
        } catch (err) {
            if (hatBestand) gibZurueck(toolShopStockRef, setToolShopStock, tool.id);
            toolInventoryRef.current = toolInv;
            notify(err?.message || "Kauf fehlgeschlagen.", "error");
            return;
        } finally {
            kaufLaeuftRef.current = false;
            naechstenKaufStarten();
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
            } else if (tool.id === "chest") {
                next.hasChest = true;
            } else if (tool.id === "vitrine") {
                next.hasVitrine = true;
            }
            return next;
        });
        debouncedSave();
    }, [gold, toolInventory, debouncedSave, notify, payServer, reserviere, gibZurueck, kaufEinreihen, naechstenKaufStarten, skillWirkung]);

    useEffect(() => { handleBuyToolRef.current = handleBuyTool; }, [handleBuyTool]);

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
        // „Bergmann" war früher eine Save-Chance und wurde HIER gewürfelt. Auf einer
        // Exponentialkurve (Spitzhackenpreis) hat das nicht 30 % der Kosten
        // gestrichen, sondern 90 %: weniger Käufe heisst auch ein kleinerer
        // Exponent. Der Skill gibt jetzt feste Zusatzladungen beim KAUF
        // (siehe handleBuyTool), der Abbau verbraucht wieder schlicht eine.
        setToolInventory(prev => ({ ...normalizeToolInventory(prev), pickaxeUses: Math.max(0, (prev.pickaxeUses || 0) - 1) }));
        setPlotUnlockedCells(prev => {
            const next = normalizePlotUnlockedCells([...prev, key]);
            setPlotExpansions(Math.min(MAX_PLOT_EXPANSIONS, Math.ceil(next.length / BASE_DIRT_COLS)));
            return next;
        });
        const uebrig = Math.max(0, (toolInventory.pickaxeUses || 0) - 1);
        notify(`Stein abgebaut. Noch ${uebrig} Spitzhacken-Nutzungen übrig.`);
        debouncedSave();
    }, [notify, plotUnlockedCells, toolInventory.pickaxeUses, debouncedSave]);

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
        setToolInventory(prev => ({ ...normalizeToolInventory(prev), wateringCans: Math.max(0, (prev.wateringCans || 0) - 1) }));
        const now = Date.now();
        /**
         * PROZENTUAL statt absolut.
         *
         * Vorher wurden pauschal 5 Minuten (mit „Regenmacher" 7,5) von `growthMs`
         * ABGEZOGEN. Jede Pflanze mit bis zu 7,5 Minuten Wachstum wurde davon
         * sofort reif: ein Kürbis für eine Kanne — bei einem Bruchteil des
         * Preises. Bei Dauerträgern wurden zudem ALLE Fruchtstände gleichzeitig
         * vorgezogen, was auf einer Banane über drei komplette Zyklen brachte.
         * Ein fester Zeitabzug lässt sich in einer Wirtschaft, die über sechs
         * Größenordnungen skaliert, nicht ausbalancieren — ein Anteil schon.
         */
        const anteil = Math.min(0.6, 0.25 * (1 + skillWirkung("giesskanne")));
        let gespartMs = 0;
        setPlotPlants(prev => {
            const p = prev[key];
            if (!p) return prev;
            const next = { ...prev };
            const np = { ...p };
            if (np.singleUse) {
                const rest = Math.max(0, (Number(np.plantedAt) || now) + (Number(np.growthMs) || 0) - now);
                gespartMs = Math.round(rest * anteil);
                np.growthMs = Math.max(1000, (Number(np.growthMs) || 0) - gespartMs);
            } else if (np.stage === "structure") {
                const rest = Math.max(0, (Number(np.structureReadyAt) || now) - now);
                gespartMs = Math.round(rest * anteil);
                np.structureReadyAt = Math.max(now, (Number(np.structureReadyAt) || now) - gespartMs);
            } else {
                // Nur den am weitesten fortgeschrittenen Stand giessen, nicht alle.
                const slots = (np.fruitSlots || []).slice();
                let idx = -1; let frueheste = Infinity;
                for (let i = 0; i < slots.length; i++) {
                    const ra = Number(slots[i]?.readyAt ?? Infinity);
                    if (ra > now && ra < frueheste) { frueheste = ra; idx = i; }
                }
                if (idx === -1) return prev;
                gespartMs = Math.round((frueheste - now) * anteil);
                slots[idx] = { ...slots[idx], readyAt: Math.max(now, frueheste - gespartMs) };
                np.fruitSlots = slots;
            }
            next[key] = np;
            return next;
        });
        notify(gespartMs >= 60000
            ? `Pflanze gewässert: -${Math.round(gespartMs / 60000)} Minuten Wachstum.`
            : `Pflanze gewässert: -${Math.max(1, Math.round(gespartMs / 1000))} Sekunden Wachstum.`);
        debouncedSave();
    }, [plotPlants, toolInventory.wateringCans, notify, debouncedSave, skillWirkung]);

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
        // Ohne das lief die Aenderung erst mit dem 5-Sekunden-Autosave zum Server —
        // und erst DANN sahen die anderen den umgesetzten Acker. Alle uebrigen
        // Acker-Aktionen speichern seit jeher sofort; hier fehlte es schlicht.
        debouncedSave();
    }, [toolInventory.plantPots, movingPlantSource, plotPlants, notify, debouncedSave]);

    const handleBuyEgg = useCallback(async (egg) => {
        if (kaufLaeuftRef.current) { kaufEinreihen(() => handleBuyEggRef.current?.(egg)); return; }
        if (goldRef.current < egg.price) { notify(`Dafür fehlen dir ${formatGold(egg.price - goldRef.current)} Gold.`, "error"); return; }
        if (!reserviere(eggShopStockRef, setEggShopStock, egg.id)) return;
        kaufLaeuftRef.current = true;
        try {
            await payServer(egg.price);
        } catch (err) {
            gibZurueck(eggShopStockRef, setEggShopStock, egg.id);
            notify(err?.message || "Kauf fehlgeschlagen.", "error");
            return;
        } finally {
            kaufLaeuftRef.current = false;
            naechstenKaufStarten();
        }
        setEggInventory(prev => [...prev, { ...egg, instanceId: Math.random().toString(36).slice(2) }]);
        debouncedSave();
    }, [gold, debouncedSave, notify, payServer, reserviere, gibZurueck, kaufEinreihen, naechstenKaufStarten]);

    useEffect(() => { handleBuyEggRef.current = handleBuyEgg; }, [handleBuyEgg]);

    const handleBuyDeco = useCallback(async (deco) => {
        if (!deco) return;
        if (kaufLaeuftRef.current) { kaufEinreihen(() => handleBuyDecoRef.current?.(deco)); return; }
        if (goldRef.current < deco.price) {
            notify("Nicht genug Gold.", "error");
            return;
        }
        const instance = {
            ...deco,
            instanceId: `deco_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            _type: "deco",
        };
        kaufLaeuftRef.current = true;
        try {
            await payServer(deco.price);
        } catch (err) {
            notify(err?.message || "Kauf fehlgeschlagen.", "error");
            return;
        } finally {
            kaufLaeuftRef.current = false;
            naechstenKaufStarten();
        }
        setDecoInventory((prev) => [...prev, instance]);
        if (!selectedDecoToPlace) setSelectedDecoToPlace(instance);
        setSelectedSeed(null);
        setSelectedTool(null);
        setSelectedCarryItem(null);
        setSelectedPetToPlace(null);
        debouncedSave();
    }, [gold, notify, selectedDecoToPlace, debouncedSave, payServer, kaufEinreihen, naechstenKaufStarten]);

    useEffect(() => { handleBuyDecoRef.current = handleBuyDeco; }, [handleBuyDeco]);

    const unlockIncubatorSlot = useCallback(async () => {
        if (kaufLaeuftRef.current) { kaufEinreihen(() => unlockIncubatorSlotRef.current?.()); return; }
        const nextSlot = incubator.unlockedSlots; // 0-indexed: current = unlockedSlots-1, next = unlockedSlots
        if (nextSlot >= 5) return;
        const cost = INCUBATOR_UNLOCK_COSTS[nextSlot - 1];
        // goldRef statt gold: der React-Wert hinkt einem gerade abgeschlossenen
        // Kauf hinterher. Die Prüfung lief damit gegen den Stand von DAVOR — mal
        // ging ein Kauf durch, den der Server ablehnen musste (für den Spieler
        // passierte scheinbar nichts), mal wurde einer blockiert, den man sich
        // längst leisten konnte.
        if (goldRef.current < cost) { notify(`Dafür brauchst du ${cost.toLocaleString('de-DE')} Gold.`, "error"); return; }
        kaufLaeuftRef.current = true;
        try {
            await payServer(cost);
        } catch (err) {
            notify(err?.message || "Freischalten fehlgeschlagen.", "error");
            return;
        } finally {
            kaufLaeuftRef.current = false;
            naechstenKaufStarten();
        }
        setIncubator(prev => ({ ...prev, unlockedSlots: prev.unlockedSlots + 1 }));
        notify(`Inkubator-Slot ${nextSlot + 1} freigeschaltet!`);
        debouncedSave();
    }, [incubator.unlockedSlots, notify, debouncedSave, payServer, kaufEinreihen, naechstenKaufStarten]);

    useEffect(() => { unlockIncubatorSlotRef.current = unlockIncubatorSlot; }, [unlockIncubatorSlot]);

    const placeEggInIncubator = useCallback((slotIndex, eggInstanceId) => {
        if (!eggInventory.length || slotIndex >= incubator.unlockedSlots) return;
        if (incubator.slots[slotIndex]) return;
        const chosen = eggInventory.find(e => e.instanceId === eggInstanceId) || eggInventory[0];
        if (!chosen) return;
        const hatchResult = rollHatchResult(chosen);
        // Balancing: Brutzeit skaliert mit Rarity (vorher pauschal 5min für alles)
        const hatchTimeByRarity = {
            COMMON: 2 * 60 * 1000,
            UNCOMMON: 5 * 60 * 1000,
            RARE: 15 * 60 * 1000,
            EPIC: 45 * 60 * 1000,
            LEGENDARY: 2 * 60 * 60 * 1000,
        };
        const hatchMs = hatchTimeByRarity[chosen.rarity] || 5 * 60 * 1000;
        setEggInventory(prev => prev.filter(e => e.instanceId !== chosen.instanceId));
        setIncubator(prev => {
            const slots = [...prev.slots];
            slots[slotIndex] = {
                egg: chosen,
                startedAt: Date.now(),
                hatchAt: Date.now() + hatchMs,
                hatchResult,
            };
            return { ...prev, slots };
        });
        setIncubatorTargetSlot(null);
    }, [eggInventory, incubator]);

    const collectHatchedEgg = useCallback((slotIndex) => {
        const slot = incubator.slots[slotIndex];
        if (!slot || Date.now() < slot.hatchAt) return;

        const hatchedPet = {
            id: `pet_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            name: slot.hatchResult.type,
            customName: null,
            emoji: slot.hatchResult.emoji,
            image: slot.hatchResult.image,
            previewImage: slot.hatchResult.previewImage,
            rarity: slot.egg.rarity,
            specialType: slot.hatchResult.specialType || null,
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
    }, [incubator, debouncedSave]);

    // Planting click handler on canvas
    useEffect(() => {
        if (showLobbyScreen) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const onMouseLeave = () => {
            hoverStore.clear();
            if (shovelHoldTimerRef.current) clearTimeout(shovelHoldTimerRef.current);
            if (shovelHoldProgressRef.current) clearInterval(shovelHoldProgressRef.current);
            setShovelHoldState({ active: false, progress: 0 });
        };
        // Muss die Umkehrung der Kamera im Renderer sein:
        //   translate(mitte) · scale(zoom) · translate(-spieler)
        // Ohne das /zoom greift bei Zoom ≠ 1 jeder Klick und jedes Hover daneben.
        const toWorld = (clientX, clientY) => {
            const rect = canvas.getBoundingClientRect();
            const screenX = clientX - rect.left;
            const screenY = clientY - rect.top;
            const player = engineRef.current.player;
            return {
                worldX: player.x + (screenX - canvas.width / 2) / zoomRef.current,
                worldY: player.y + (screenY - canvas.height / 2) / zoomRef.current,
            };
        };

        const onCanvasClick = (e) => {
            const { worldX, worldY } = toWorld(e.clientX, e.clientY);

            // Ohne eigenes Grundstück (Welt war voll) ist man nur Zuschauer: nichts
            // pflanzen, ernten oder platzieren — sonst würde die eigene Farm auf dem
            // Acker eines anderen erscheinen.
            if (mySlotRef.current < 0) {
                notify("Du hast in dieser Welt kein Grundstück.", "error");
                return;
            }

            // Inkubator oder Mülleimer umstellen: derselbe Ablauf wie bei Deko —
            // Modus an, einmal auf die Wiese klicken, fertig.
            if (verschiebtGebaeude) {
                const slot = layout.current.slots[mySlotRef.current] || layout.current.slots[0];
                const drawY = slot.isTopRow ? slot.anchorY - MAP_CONFIG.territoryHeight : slot.anchorY;
                const tx = Math.floor((worldX - slot.x) / TILE_SIZE);
                const ty = Math.floor((worldY - drawY) / TILE_SIZE);
                const maxTilesX = Math.round(MAP_CONFIG.territoryWidth / TILE_SIZE);
                const maxTilesY = Math.round(MAP_CONFIG.territoryHeight / TILE_SIZE);
                if (tx < 0 || tx >= maxTilesX || ty < 0 || ty >= maxTilesY) {
                    notify("Nur auf dem eigenen Grundstück abstellen.", "error");
                    return;
                }
                const dirtX = slot.x + MAP_CONFIG.dirtOffsetX;
                const dirtY = slot.isTopRow ? slot.anchorY - MAP_CONFIG.baseDirtHeight - TILE_SIZE : drawY + TILE_SIZE;
                const mitteX = slot.x + tx * TILE_SIZE + TILE_SIZE / 2;
                const mitteY = drawY + ty * TILE_SIZE + TILE_SIZE / 2;
                if (mitteX >= dirtX && mitteX <= dirtX + MAP_CONFIG.baseDirtWidth &&
                    mitteY >= dirtY && mitteY <= dirtY + MAP_CONFIG.baseDirtHeight) {
                    notify("Nicht auf dem Acker abstellen.", "error");
                    return;
                }
                const zielKachel = `${tx}_${ty}`;
                const belegt = decoPlacements.some((d) =>
                    d.slotIndex === mySlotRef.current &&
                    (d.occupiedKeys || [d.gridKey]).includes(zielKachel));
                if (belegt) {
                    notify("Dort steht schon Deko.", "error");
                    return;
                }
                const was = verschiebtGebaeude;
                setGebaeudeVersatz((prev) => ({ ...prev, [was]: { tx, ty } }));
                setVerschiebtGebaeude(null);
                notify(`${GEBAEUDE_NAMEN[was] || "Gebäude"} umgestellt.`);
                debouncedSave();
                return;
            }

            // Briefkasten anklicken: der eigene öffnet den Posteingang, ein fremder
            // direkt das Sendeformular mit vorbelegtem Empfänger.
            if (!selectedTool && !selectedSeed && !selectedDecoToPlace && !selectedPetToPlace) {
                for (const slot of layout.current.slots) {
                    const box = getMailboxHitArea(slot);
                    if (Math.hypot(worldX - box.x, worldY - box.y) > box.radius) continue;
                    const isOwn = slot.id - 1 === mySlotRef.current;
                    if (isOwn) {
                        setMailboxMode("inbox");
                        setMailboxRecipient("");
                    } else {
                        // Der Besitzer eines FREMDEN Grundstücks steht nur in der
                        // Momentaufnahme des Servers — auf `l.slots` wird ausschliesslich
                        // das eigene Schild beschriftet. Hier wurde `slot.owner` gelesen,
                        // das für Nachbarn immer null ist: ein Klick auf deren Briefkasten
                        // meldete deshalb IMMER „Grundstück ist frei". Über die E-Taste
                        // ging es, weil die Spielschleife schon aus plotsRef liest.
                        const besitzer = plotsRef.current.get(slot.id - 1)?.owner || null;
                        if (!besitzer) {
                            notify("Dieses Grundstück ist frei — kein Briefkasten in Betrieb.", "error");
                            return;
                        }
                        setMailboxMode("send");
                        setMailboxRecipient(besitzer);
                    }
                    setMailboxOpen(true);
                    return;
                }
            }

            if (selectedDecoToPlace) {
                // Aufstellen gehört ebenfalls in den Einrichtungs-Modus.
                if (!editorAktivRef.current) {
                    notify("Deko stellst du im Editor auf.", "error");
                    return;
                }
                const slot = layout.current.slots[mySlotRef.current] || layout.current.slots[0];
                const drawY = slot.isTopRow ? slot.anchorY - MAP_CONFIG.territoryHeight : slot.anchorY;
                // Spiegeln lässt den Fußabdruck unangetastet — die Maße kommen also
                // immer unverändert aus dem Katalog.
                const gespiegelt = Boolean(decoGespiegeltRef.current);
                const dw = selectedDecoToPlace.width || 1;
                const dh = selectedDecoToPlace.height || 1;

                // Die angeklickte Kachel ist IMMER die Ankerkachel unten links; von dort
                // wächst das Objekt nach rechts und nach oben. Vorher gab es einen
                // Rückfall auf „nach unten wachsen", wenn es nach oben nicht passte —
                // damit landete derselbe Klick mal so und mal so.
                const tileX = Math.floor((worldX - slot.x) / TILE_SIZE);
                const tileY = Math.floor((worldY - drawY) / TILE_SIZE);

                const dirtX = slot.x + MAP_CONFIG.dirtOffsetX;
                const dirtY = slot.isTopRow ? slot.anchorY - MAP_CONFIG.baseDirtHeight - TILE_SIZE : drawY + TILE_SIZE;
                const maxTilesX = Math.round(MAP_CONFIG.territoryWidth / TILE_SIZE);
                const maxTilesY = Math.round(MAP_CONFIG.territoryHeight / TILE_SIZE);
                const liegtAufAcker = (cx, cy) => {
                    const checkX = slot.x + cx * TILE_SIZE + TILE_SIZE / 2;
                    const checkY = drawY + cy * TILE_SIZE + TILE_SIZE / 2;
                    return checkX >= dirtX && checkX <= dirtX + MAP_CONFIG.baseDirtWidth
                        && checkY >= dirtY && checkY <= dirtY + MAP_CONFIG.baseDirtHeight;
                };

                const occupiedKeys = [];
                let ausserhalb = false;
                let ankerAufAcker = false;
                for (let dx = 0; dx < dw; dx++) {
                    for (let dy = 0; dy < dh; dy++) {
                        const cx = tileX + dx;
                        const cy = tileY - dy;
                        if (cx < 0 || cx >= maxTilesX || cy < 0 || cy >= maxTilesY) ausserhalb = true;
                        occupiedKeys.push(`${cx}_${cy}`);
                        // Nur die ANKERREIHE muss freie Wiese sein — darauf steht das
                        // Objekt. Was darüber liegt, darf über den Acker ragen; sonst
                        // bekäme man auf dem einreihigen Wiesenstreifen unter dem Acker
                        // überhaupt keine Laterne unter, weil sie zwangsläufig in ihn
                        // hineinreicht.
                        if (dy === 0 && liegtAufAcker(cx, cy)) ankerAufAcker = true;
                    }
                }

                if (ausserhalb || ankerAufAcker) {
                    notify(ausserhalb
                        ? "Kein Platz — das Objekt ragt über dein Grundstück hinaus."
                        : "Kein Platz — die untere Kachel liegt auf dem Acker.", "error");
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

                // Mitte der Ankerkachel unten links — der Renderer zeichnet ab hier
                // nach rechts und nach oben.
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
                    mirrored: gespiegelt,
                    slotIndex: mySlotRef.current,
                    x: gx,
                    y: gy,
                    occupiedKeys,
                };
                setDecoPlacements((prev) => [...prev, placed]);
                setDecoInventory((prev) => {
                    const targetInstance = selectedDecoToPlace.instanceId || selectedDecoToPlace.id;
                    const next = prev.filter((d) => (d.instanceId || d.id) !== targetInstance);
                    // Noch ein Stück DERSELBEN Sorte? Dann in der Hand behalten, damit
                    // man mehrere hintereinander setzen kann.
                    //
                    // Vorher stand hier `d.decoId === selectedDecoToPlace.decoId` als
                    // zweite Bedingung. Bei Vorratsstücken ist `decoId` auf BEIDEN
                    // Seiten undefined — der Vergleich war damit immer wahr und griff
                    // das erstbeste Stück irgendeiner Sorte. Wer eine Laterne setzte,
                    // hatte danach unbemerkt einen Gartenzwerg in der Hand und stellte
                    // ihn mit dem nächsten Klick ab.
                    const sorte = selectedDecoToPlace.id || selectedDecoToPlace.decoId;
                    const nextSelected = sorte
                        ? next.find((d) => (d.id || d.decoId) === sorte) || null
                        : null;
                    setSelectedDecoToPlace(nextSelected);
                    return next;
                });
                notify(`${selectedDecoToPlace.name} platziert.`);
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

                // Tier-Plätze: drei gehören dazu, bis zu drei weitere sind kaufbar.
                const petSlots = normalizeToolInventory(toolInventory).petSlots;
                const myPetsCount = petPlacements.filter(p => p.slotIndex === mySlotRef.current).length;
                if (myPetsCount >= petSlots) {
                    notify(petSlots >= PET_SLOTS_MAX
                        ? `Alle ${PET_SLOTS_MAX} Tier-Plätze sind belegt.`
                        : `Nur ${petSlots} Tier-Plätze — kauf oben rechts einen weiteren.`, "error");
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
                        customName: selectedPetToPlace.customName || null,
                        specialType: selectedPetToPlace.specialType || null,
                        rarity: selectedPetToPlace.rarity || "COMMON",
                        emoji: selectedPetToPlace.emoji || getPetEmoji(selectedPetToPlace.name),
                        image: selectedPetToPlace.image || buildPetPreviewImage(selectedPetToPlace.name),
                        ability: selectedPetToPlace.ability, // 3. ANPASSUNG: Ability übernehmen
                        x: worldX,
                        y: worldY,
                        vx: 0,
                        vy: 0,
                        changeDirAt: 0,
                    },
                ]));
                setSelectedPetToPlace(null);
                notify(`${selectedPetToPlace.name} platziert.`);
                return;
            }
            if (!selectedTool || selectedTool === "shovel") {

                // Tiere werden hier BEWUSST nicht mehr angeklickt.
                // Die Game-Loop bewegt `engine.petPlacements` (eine Kopie); der React-State
                // behält die Startkoordinaten. Ein Klicktest dagegen traf deshalb dauerhaft
                // die Stelle, an der das Tier ursprünglich abgesetzt wurde — quer über die
                // Farm verteilt, und z. B. beim Klick auf den Pool. Das Detailfenster geht
                // jetzt ausschließlich über die Tierliste oben rechts auf.

                // Deko einpacken — NUR im Einrichtungs-Modus.
                //
                // Vorher genügte irgendein Linksklick in die Nähe: beim Laufen, beim
                // Ernten, beim Anklicken des Briefkastens. Wer sein Grundstück
                // eingerichtet hatte, räumte es beim Spielen versehentlich wieder ab.
                const decoIdx = editorAktivRef.current ? decoPlacements.findIndex(d => {
                    if (d.slotIndex !== mySlotRef.current) return false;
                    const radius = 60 * Math.max(d.width || 1, d.height || 1) * 0.7;
                    return Math.hypot(worldX - d.x, worldY - d.y) < radius;
                }) : -1;

                if (decoIdx !== -1) {
                    const deco = decoPlacements[decoIdx];
                    setDecoPlacements(prev => prev.filter((_, i) => i !== decoIdx));
                    setDecoInventory(prev => [...prev, {
                        ...deco,
                        id: deco.decoId || deco.id,
                        instanceId: `deco_pickup_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                        _type: "deco",
                    }]);
                    notify(`${deco.name || "Deko"} aufgehoben.`);
                    return;
                }
            }

            const mySlot = layout.current.slots[mySlotRef.current] || layout.current.slots[0];
            const hoveredRock = getHoveredRock(mySlot, worldX, worldY, MAX_PLOT_EXPANSIONS);
            const hovered = getHoveredCell(mySlot, worldX, worldY, plotPlants);
            if (selectedTool === "pickaxe") {
                if (hoveredRock) {
                    handleMineRock(hoveredRock);
                } else {
                    notify("Mit Spitzhacke nur auf Stein-Felder klicken.", "error");
                }
                return;
            }
            if (!hovered) {
                hoverStore.clear();
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
                const dragHovered = getHoveredCell(mySlot, worldX, worldY, plotPlants);
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

            // Erst der eigene Acker (der häufige Fall), dann die fremden. Fremde
            // Pflanzen sind nur zum Ansehen — geerntet wird nichts, aber Größe,
            // Wert und Restzeit stehen genauso in der Karte.
            const meinIndex = mySlotRef.current;
            const mySlot = layout.current.slots[meinIndex] || layout.current.slots[0];
            const eigene = getHoveredCell(mySlot, worldX, worldY, plotPlants);
            if (eigene) {
                const zelle = `${eigene.cellX}_${eigene.cellY}`;
                // Schreibt in den externen Store; meldet nur bei Zellwechsel.
                if (plotPlants[zelle]) hoverStore.set({ key: `${meinIndex}:${zelle}`, x: clientXLocal, y: clientYLocal });
                else hoverStore.clear();
                return;
            }

            for (const [slotIndex, snapshot] of plotsRef.current) {
                if (slotIndex === meinIndex) continue;
                const slot = layout.current.slots[slotIndex];
                if (!slot || !snapshot?.plants) continue;
                // Die Freischaltungen des ANDEREN, sonst treffen dessen Erweiterungs-
                // reihen ins Leere. `slot` selbst wird dabei nicht verändert.
                fremdHoverSlot.x = slot.x;
                fremdHoverSlot.anchorY = slot.anchorY;
                fremdHoverSlot.isTopRow = slot.isTopRow;
                fremdHoverSlot.unlockedCells = snapshot.plotUnlockedCells || [];
                const treffer = getHoveredCell(fremdHoverSlot, worldX, worldY, snapshot.plants);
                if (!treffer) continue;
                const zelle = `${treffer.cellX}_${treffer.cellY}`;
                if (snapshot.plants[zelle]) {
                    hoverStore.set({ key: `${slotIndex}:${zelle}`, x: clientXLocal, y: clientYLocal });
                    return;
                }
            }
            hoverStore.clear();
        };

        const onCanvasMouseDown = (e) => {
            if (selectedTool === "shovel") {
                const { worldX, worldY } = toWorld(e.clientX, e.clientY);
                const mySlot = layout.current.slots[mySlotRef.current] || layout.current.slots[0];
                const hovered = getHoveredCell(mySlot, worldX, worldY, plotPlants);
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
                    setPlotPlants(prev => {
                        const next = { ...prev };
                        delete next[key];
                        return next;
                    });
                    notify("Pflanze entfernt.");
                    if (shovelHoldProgressRef.current) clearInterval(shovelHoldProgressRef.current);
                    setShovelHoldState({ active: false, progress: 0 });
                }, 900);
                return;
            }
            // Drag-harvest: start when no tool selected and clicking a ready plant.
            if (!selectedTool && !selectedPetToPlace && !selectedDecoToPlace) {
                const { worldX, worldY } = toWorld(e.clientX, e.clientY);
                const mySlot = layout.current.slots[mySlotRef.current] || layout.current.slots[0];
                const hovered = getHoveredCell(mySlot, worldX, worldY, plotPlants);
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

        // Mausrad zoomt. passive:false, sonst scrollt die Seite darunter mit.
        const onWheel = (e) => {
            e.preventDefault();
            const richtung = e.deltaY > 0 ? 1 / ZOOM_SCHRITT : ZOOM_SCHRITT;
            const neu = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoomRef.current * richtung));
            if (neu === zoomRef.current) return;
            zoomRef.current = neu;
            setZoomAnzeige(neu);
            // Die Hover-Karte hing sonst an der alten Zelle: der Weltpunkt unter der
            // Maus ist nach dem Zoomen ein anderer.
            hoverStore.clear();
        };

        canvas.addEventListener("click", onCanvasClick);
        canvas.addEventListener("mousemove", onCanvasMove);
        canvas.addEventListener("mouseleave", onMouseLeave);
        canvas.addEventListener("mousedown", onCanvasMouseDown);
        canvas.addEventListener("mouseup", stopShovelHold);
        canvas.addEventListener("wheel", onWheel, { passive: false });
        return () => {
            canvas.removeEventListener("click", onCanvasClick);
            canvas.removeEventListener("mousemove", onCanvasMove);
            canvas.removeEventListener("mouseleave", onMouseLeave);
            canvas.removeEventListener("mousedown", onCanvasMouseDown);
            canvas.removeEventListener("mouseup", stopShovelHold);
            canvas.removeEventListener("wheel", onWheel);
            // KEIN stopShovelHold() mehr.
            //
            // Dieser Effekt hängt an `plotPlants` — die erste geerntete Pflanze
            // setzt ihn also selbst neu auf, und der Aufräumer beendete dabei das
            // Ziehen, das gerade lief. Ergebnis: Drag-Harvest erwischte genau EINE
            // Pflanze, danach musste man wieder einzeln klicken. Dasselbe brach
            // das Schaufel-Halten ab, sobald irgendwo eine Frucht nachwuchs.
            // Losgelassen wird über mouseup/mouseleave (beide werden hier gleich
            // wieder registriert), beim echten Unmount über den Effekt weiter oben.
        };
        // petPlacements und toolInventory fehlten hier: die Platzgrenze rechnete mit
        // dem Stand vom letzten Rendern dieses Effekts.
    }, [showLobbyScreen, handleCellClick, handleHarvest, handleMineRock, handleMovePlantWithPot, handleWaterPlant, notify, plotPlants, selectedTool, selectedPetToPlace, selectedDecoToPlace, decoPlacements, petPlacements, toolInventory, hoverStore, verschiebtGebaeude, debouncedSave, plotsRef]);

    useEffect(() => {
        mySlotRef.current = mySlotIndex;
    }, [mySlotIndex]);


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

        // Takt richtet sich nach dem höchsten Fähigkeits-Level unter den platzierten Tieren.
        // Werte liegen in engine/PetSystem, damit das Tier-Modal dasselbe anzeigt.
        const getIntervalMs = () => {
            const myPets = farmStateRef.current.petPlacements.filter(p => p.slotIndex === mySlotRef.current);
            const maxLevel = myPets.reduce((m, p) => Math.max(m, p.ability?.level || 0), 0);
            return getPetTickMs(maxLevel);
        };

        /**
         * Darf DIESES Tier schon wieder auszahlen?
         *
         * Der Takt oben richtet sich nach dem SCHNELLSTEN Tier, die Sperre auf dem
         * Server aber nach dem Level des jeweiligen Tieres (garden/core/economy.js → petFind).
         * Wer ein Stufe-5- neben einem Stufe-1-Tier stehen hat, fragte für das
         * langsame dreimal so oft an, wie es darf — jede dieser Anfragen kam als
         * 429 „Zu früh" zurück und stand als Fehler in der Browser-Konsole.
         * Dieselbe Rechnung wie dort, damit erst gar nichts Aussichtsloses rausgeht.
         */
        const darfAuszahlen = (petId, level) => {
            const zuletzt = petFundZeitenRef.current.get(petId) || 0;
            return Date.now() - zuletzt >= getPetTickMs(level) * 0.9;
        };
        const merkeAuszahlung = (petId) => petFundZeitenRef.current.set(petId, Date.now());

        let timerId;
        // Gold und Ernte gehoeren ab v3.0 dem Server. Der Tick wuerfelt deshalb nur
        // noch das Ausloesen (PET_PROC_CHANCE) und meldet die Absicht — die Hoehe
        // eines Fundes und die Gueltigkeit einer Ernte entscheidet der Server.
        const tick = async () => {
            // Ein zurückgetretener Tab lässt seine Tiere ruhen: er kann das
            // Ergebnis nie speichern, und jede Server-Aktion von ihm bringt den
            // führenden Tab in einen Konflikt (siehe apiCall).
            if (nurZuschauenRef.current) {
                timerId = setTimeout(tick, getIntervalMs());
                return;
            }
            const state = farmStateRef.current;
            const myPets = state.petPlacements.filter(p => p.slotIndex === mySlotRef.current);
            if (myPets.length) {
                const msgs = [];
                // „Züchter" aus dem Fähigkeitsbaum — gedeckelt wie serverseitig
                // in garden/core/offline.js.
                const procChance = Math.min(0.5, PET_PROC_CHANCE * (1 + skillWirkung("zuechter")));

                for (const pet of myPets) {
                    if (!pet.ability) continue;
                    if (Math.random() >= procChance) continue;
                    const petId = pet.id || pet.instanceId;

                    if (pet.ability.type === "goldfinder") {
                        if (!darfAuszahlen(petId, pet.ability.level)) continue;
                        try {
                            const data = await apiCall("/action", {
                                method: "POST",
                                body: JSON.stringify({ action: "petFind", petId, kind: "gold" }),
                            });
                            merkeAuszahlung(petId);
                            if (typeof data?.gold === "number") setGold(data.gold);
                            msgs.push(`${pet.customName || pet.name}: +${Number(data?.verdient || 0).toLocaleString('de-DE')} Gold`);
                        } catch { /* Server hat abgelehnt (z. B. zu frueh) — stillhalten */ }
                    } else if (pet.ability.type === "harvester") {
                        // Der Server prueft Reife und Rucksackgrenze selbst; wir nennen
                        // nur die Kandidaten in Reihenfolge.
                        const plants = farmStateRef.current.plotPlants || {};
                        const budget = getHarvesterYield(pet.ability.level);
                        const keys = [];
                        for (const [key, plant] of Object.entries(plants)) {
                            if (keys.length >= budget) break;
                            if (plant && isPlantReady(plant)) keys.push(key);
                        }
                        if (keys.length) {
                            try {
                                const data = await apiCall("/action", {
                                    method: "POST",
                                    body: JSON.stringify({ action: "harvestMany", keys }),
                                });
                                applyEconomy(data, keys);
                                // Der Helfer VERKAUFT direkt (ab v3.3) — die Meldung nennt
                                // deshalb den Erlös, nicht nur die Stückzahl.
                                const anzahl = Number(data?.anzahl) || 0;
                                if (anzahl) {
                                    msgs.push(`${pet.customName || pet.name}: ${anzahl}× geerntet, `
                                        + `+${Number(data?.verdient || 0).toLocaleString("de-DE")} Gold`);
                                }
                            } catch { /* nichts reif */ }
                        }
                    }
                    // "seedfinder" ist jetzt der GÄRTNER und tickt gar nicht mehr:
                    // seine Wirkung (kostenloser Nachwuchs beim Ernten, schnelleres
                    // Wachstum) sitzt serverseitig in harvestCell bzw. im Wachstum
                    // und greift damit auch offline. Der alte Zweig legte pro
                    // Auslösung einen zufälligen Shop-Samen in den Rucksack — ohne
                    // Platzprüfung, wodurch nach ein paar Stunden JEDE Ernte an
                    // "Rucksack voll" scheiterte.
                }

                if (msgs.length) notify(msgs.join(" | "), "info");
            }
            timerId = setTimeout(tick, getIntervalMs());
        };

        timerId = setTimeout(tick, getIntervalMs());
        return () => clearTimeout(timerId);
        // `shopRotation` stand hier, weil der Samenfinder daraus gezogen hat. Der
        // ist jetzt der Gärtner und tickt nicht mehr — damit setzt sich der Tier-Takt
        // auch nicht mehr alle fünf Minuten mit der Ladenrotation neu auf.
    }, [showLobbyScreen, notify, apiCall, applyEconomy, skillWirkung])

    useEffect(() => {
        localPlayerNameRef.current = authUser?.twitchLogin || authUser?.login || "Spieler";
    }, [authUser]);

    // Eigenes Schild beschriften — der Slot kommt vom Server, nicht immer 0.
    // showLobbyScreen MUSS in den Abhängigkeiten stehen: startWorldBoot baut layout.current
    // beim Betreten neu auf, und dabei geht ein vorher gesetzter owner verloren
    // (das eigene Schild zeigte sonst „Zu verkaufen").
    // Vergibt der Server einen anderen Slot (Neustart, Reconnect, volle Welt), muss
    // das alte Schild WEG. Vorher wurde nur das neue gesetzt — das eigene Feld stand
    // danach doppelt auf der Karte: oben links das alte, leere, mit dem eigenen Namen,
    // daneben das neue mit den Pflanzen.
    const gestempelterSlotRef = useRef(-1);
    useEffect(() => {
        if (showLobbyScreen) return;
        const slots = layout.current?.slots;
        if (!slots) return;
        const vorher = gestempelterSlotRef.current;
        if (vorher >= 0 && vorher !== mySlotIndex && slots[vorher]) {
            // Gehört jetzt wieder niemandem — es sei denn, ein anderer Spieler
            // sitzt dort; dessen Schild setzt die Plot-Übernahme ohnehin neu.
            slots[vorher].owner = null;
        }
        const slot = slots[mySlotIndex];
        if (!slot) { gestempelterSlotRef.current = -1; return; }
        slot.owner = authUser?.twitchLogin || authUser?.login || "Spieler";
        gestempelterSlotRef.current = mySlotIndex;
    }, [authUser, mySlotIndex, showLobbyScreen]);

    // Eigene Tiere und Deko wandern mit, wenn der Server einen anderen Slot vergibt —
    // sonst stünden sie auf dem Grundstück des Vorbesitzers.
    //
    // Die Abhängigkeit auf die Listen ist wichtig: vorher lief das NUR beim Wechsel
    // von mySlotIndex. Kam der Spielstand erst danach an (Socket schneller als die
    // Farm-Abfrage), behielten die Tiere für immer den alten Slot. Folge: die
    // Bewegungsschleife übersprang sie (`pet.slotIndex !== mySlotIndex`), der Zähler
    // zeigte 0/3, und gezeichnet wurden sie auf dem alten Grundstück — zusammen-
    // gedrängt am Rand, weil ihre Koordinaten nicht mehr in die Fläche passten.
    // Der Wächter `some(...)` gibt `prev` unverändert zurück, sobald alles stimmt;
    // dadurch läuft der Effekt trotz der Listen-Abhängigkeit nicht endlos.
    useEffect(() => {
        if (!Number.isInteger(mySlotIndex) || mySlotIndex < 0) return;
        const slots = layout.current?.slots;
        const ziel = slots?.[mySlotIndex];
        const obenY = (s) => (s.isTopRow ? s.anchorY - MAP_CONFIG.territoryHeight : s.anchorY);

        const umziehen = (eintrag) => {
            if (eintrag.slotIndex === mySlotIndex) return eintrag;
            const quelle = slots?.[eintrag.slotIndex];
            // Ohne bekanntes Ausgangsgrundstück die Koordinaten verwerfen — die
            // Spielschleife setzt Tiere ohne gültige Position in die Mitte.
            if (!ziel || !quelle || !Number.isFinite(eintrag.x) || !Number.isFinite(eintrag.y)) {
                return { ...eintrag, slotIndex: mySlotIndex, x: undefined, y: undefined };
            }
            return {
                ...eintrag,
                slotIndex: mySlotIndex,
                x: eintrag.x + (ziel.x - quelle.x),
                y: eintrag.y + (obenY(ziel) - obenY(quelle)),
            };
        };

        setPetPlacements((prev) => (
            prev.some((p) => p.slotIndex !== mySlotIndex) ? prev.map(umziehen) : prev
        ));
        setDecoPlacements((prev) => (
            prev.some((d) => d.slotIndex !== mySlotIndex) ? prev.map(umziehen) : prev
        ));
    }, [mySlotIndex, petPlacements, decoPlacements]);

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

    // ── Shop countdown display ─────────────────────────────────────────────────
    const shopMins = Math.floor(shopCountdown / 60000);
    const shopSecs = Math.floor((shopCountdown % 60000) / 1000);
    const toolMins = Math.floor(toolShopCountdown / 60000);
    const toolSecs = Math.floor((toolShopCountdown % 60000) / 1000);
    const eggMins = Math.floor(eggShopCountdown / 60000);
    const eggSecs = Math.floor((eggShopCountdown % 60000) / 1000);
    const formatCountdown = (mins, secs) => `${mins}:${String(secs).padStart(2, "0")} min`;
    const formatDuration = (ms) => {
        const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
        const hours = Math.floor(totalSeconds / 3600);
        const mins = Math.floor((totalSeconds % 3600) / 60);
        const secs = totalSeconds % 60;
        if (hours > 0) return `${hours}h ${mins}m ${secs}s`;
        if (mins > 0) return `${mins}m ${secs}s`;
        return `${secs}s`;
    };
    const getSpecialLabel = (specialData) => specialData?.name || null;
    const getStatusEffectLabel = (statusEffect) => STATUS_EFFECT_LABELS[statusEffect] || null;
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
        const gefiltert = seeds.filter((s) => shopFilter === "all" || s.active);
        return sortiere(gefiltert, SHOP_SORTIERUNGEN, shopSortierung);
    }, [shopRotation?.seeds, shopFilter, shopSortierung]);
    // Samen und Ernte teilen sich die Rucksackplätze. Ist kein Platz mehr, sperrt
    // der Laden die Zeilen — sonst klickt man weiter ins Leere.
    const rucksackVoll = (inventory.length + harvestedItems.length) >= inventoryMaxSlots;
    // Verkauf ebenfalls serverseitig: die Summe entsteht aus den beim Server
    // gespeicherten Ernte-Eigenschaften, nicht aus einem vom Client gemeldeten Wert.
    const handleSellAllHarvested = useCallback(async () => {
        if (harvestedItems.length === 0) return;
        try {
            const data = await apiCall("/action", {
                method: "POST",
                body: JSON.stringify({ action: "sellAll" }),
            });
            // Verkaufen ruehrt keine Pflanze an — leeres Array heisst "nicht anfassen".
            applyEconomy(data, []);
            playSound("cash", 0.6);
            const verdient = Number(data?.verdient || 0);
            notify("Alles verkauft: +" + verdient.toLocaleString("de-DE") + " Gold");
        } catch (err) {
            notify(err?.message || "Verkauf fehlgeschlagen.", "error");
        }
    }, [harvestedItems.length, apiCall, applyEconomy, notify, playSound]);

    useEffect(() => {
        sellAllRef.current = handleSellAllHarvested;
    }, [handleSellAllHarvested]);

    // Verkaufspreis zahlt der Server aus seiner eigenen Tabelle — vorher muss der
    // Spielstand raus, sonst kennt er ein frisch geschluepftes Tier noch nicht.
    const handleSellSelectedPet = useCallback(async () => {
        if (!selectedPetToPlace) {
            notify("Kein Tier in der Hand. Wähle zuerst ein Tier aus dem Rucksack.", "error");
            return;
        }
        const name = selectedPetToPlace.name || "Tier";
        const petId = selectedPetToPlace.id || selectedPetToPlace.instanceId;
        try {
            await flushSave();
            const data = await apiCall("/action", {
                method: "POST",
                body: JSON.stringify({ action: "sellPet", petId }),
            });
            setPetInventory(prev => prev.filter(p => (p.id || p.instanceId) !== petId));
            setSelectedPetToPlace(null);
            if (typeof data?.gold === "number") setGold(data.gold);
            playSound("cash", 0.6);
            notify(`${name} verkauft: +${Number(data?.verdient || 0).toLocaleString('de-DE')} Gold`);
            debouncedSave();
        } catch (err) {
            notify(err?.message || "Verkauf fehlgeschlagen.", "error");
        }
    }, [selectedPetToPlace, notify, playSound, apiCall, flushSave, debouncedSave]);

    useEffect(() => {
        sellPetRef.current = handleSellSelectedPet;
    }, [handleSellSelectedPet]);

    // ── Tier-Detailfenster (Klick auf ein platziertes Tier) ───────────────────
    const handleStowInspectedPet = useCallback(() => {
        if (!inspectedPet) return;
        const petId = inspectedPet.id;
        setPetPlacements(prev => prev.filter(p => p.id !== petId));
        setPetInventory(prev => [...prev, {
            ...inspectedPet,
            instanceId: `pet_pickup_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            _type: "pet",
        }]);
        notify(`${inspectedPet.name || "Tier"} eingepackt.`);
        setInspectedPet(null);
        debouncedSave();
    }, [inspectedPet, notify, debouncedSave]);

    const handleRenamePet = useCallback((pet, newName) => {
        if (!pet) return;
        const clean = String(newName || "").replace(/\s+/g, " ").trim().slice(0, 24);
        const customName = clean || null; // leeres Feld = zurück zum Artnamen
        setPetPlacements(prev => prev.map(p => (p.id === pet.id ? { ...p, customName } : p)));
        setInspectedPet(prev => (prev && prev.id === pet.id ? { ...prev, customName } : prev));
        notify(customName ? `Heißt jetzt „${customName}".` : "Name zurückgesetzt.");
        debouncedSave();
    }, [notify, debouncedSave]);

    const handleSellInspectedPet = useCallback(async () => {
        if (!inspectedPet) return;
        const petId = inspectedPet.id;
        const name = inspectedPet.name || "Tier";
        try {
            await flushSave();
            const data = await apiCall("/action", {
                method: "POST",
                body: JSON.stringify({ action: "sellPet", petId }),
            });
            setPetPlacements(prev => prev.filter(p => p.id !== petId));
            if (typeof data?.gold === "number") setGold(data.gold);
            playSound("cash", 0.6);
            notify(`${name} verkauft: +${Number(data?.verdient || 0).toLocaleString('de-DE')} Gold`);
            setInspectedPet(null);
            debouncedSave();
        } catch (err) {
            notify(err?.message || "Verkauf fehlgeschlagen.", "error");
        }
    }, [inspectedPet, notify, playSound, debouncedSave, apiCall, flushSave]);

    /**
     * @param {object} [ueberschreibung] Felder, die NICHT aus dem React-State kommen
     *   sollen. Noetig, wenn direkt vor dem Speichern etwas gesetzt wurde: `setState`
     *   wirkt erst beim naechsten Rendern, der Payload hier liest aber die Werte des
     *   letzten. Ohne diesen Weg speichert der Ruecksprung in handleHarvest den Acker
     *   OHNE die gerade wiederhergestellte Pflanze.
     */
    const flushFarmStateToServer = useCallback(async (ueberschreibung, versuch = 0) => {
        // Vor dem ersten Laden stehen in den States nur die Startwerte — leere
        // Listen. Ein PUT damit loescht auf dem Server Deko, Tiere und Eier.
        // Der Autosave-Effekt prueft das laengst; debouncedSave() lief bisher
        // ungeprueft durch und war damit das Schlupfloch.
        if (!isInitialLoadDoneRef.current) return;
        // Ein zurückgetretener Tab schreibt nicht mehr. Sonst überschriebe er beim
        // nächsten Autosave genau den Stand, vor dem er gerade zurückgetreten ist.
        if (nurZuschauenRef.current) return;
        const payload = {
            tabId: TAB_ID,
            inventory, plotPlants, plotExpansions, plotUnlockedCells,
            eggInventory, petInventory, petPlacements, decoInventory, decoPlacements,
            toolInventory, inventoryMaxSlots, incubator, gebaeudeVersatz, logbuch,
            shopStock: personalShopStock,
            shopStockVersion: shopRotation?.generatedAt,
            toolShopStock: toolShopStock,
            toolShopStockVersion: toolShopRotation?.generatedAt,
            eggShopStock: eggShopStock,
            eggShopStockVersion: eggShopRotation?.generatedAt,
            // Fehlte hier, stand aber im 5-Sekunden-Autosave: ohne das Feld setzt
            // compactFarmState das Aussehen auf den Standard-Farmer zurück, und jedes
            // debouncedSave (Pflanzen, Kaufen, …) zog die Kleidung mit.
            appearance: playerAppearance,
            tutorialCompleted,
            // Gegen verspätete Speicherstände: der Server verwirft diesen PUT, wenn
            // seit dem Laden eine Aktion dazwischenkam (siehe erhoeheVersion).
            stateVersion: stateVersionRef.current,
            ...(ueberschreibung || {}),
        };
        try {
            await apiCall("/farm-state", { method: "PUT", body: JSON.stringify({ state: payload }) });
        } catch (err) {
            // Kein Status heisst: keine Antwort erhalten. Der Server hat diesen
            // Stand vielleicht trotzdem übernommen — blind nachreichen würde dann
            // mit einem veralteten Zähler gegen einen bereits gespeicherten Stand
            // laufen. Der nächste reguläre Speichervorgang klärt das von selbst.
            if (err?.status === undefined) return;
            if (err?.status !== 409) return; // nicht angemeldet / offline — der Socket versucht es weiter

            // 409 heisst: der Server ist weiter als diese Nutzlast. In aller Regel,
            // weil eine EIGENE Aktion fertig wurde, während der PUT unterwegs war —
            // beim Kauf von zehn Töpfen passiert das fast bei jedem einzelnen.
            //
            // NICHT nachladen. Der React-Stand ist in diesem Fall die vollständigere
            // Fassung: er kennt die eben gekauften Sachen, der Server nicht (Rucksack
            // und Werkzeug gehören dem Browser). Ein Nachladen warf genau die Käufe
            // weg, die gerade dazugekommen waren, und der nächste Speicherversuch lief
            // in denselben Konflikt — daher die Schleife aus 409 und „Lade Spielstand".
            //
            // Richtig ist: Zähler übernehmen und mit FRISCH gebauter Nutzlast erneut
            // schicken. Der kurze Aufschub gibt React Zeit, den letzten Kauf zu
            // übernehmen, damit die neue Nutzlast ihn auch enthält.
            // Hat der SERVER selbst etwas geändert (Umstellung beim Neustart,
            // Admin-Eingriff)? Dann ist sein Stand der bessere und dieser hier muss
            // weichen — nachreichen würde die Änderung überschreiben. Das ist der
            // einzige Fall, in dem Nachladen richtig ist.
            const meinStand = stateVersionRef.current;
            const serverAenderung = Number(err.data?.serverAenderungAb) || 0;
            if (typeof err.data?.stateVersion === "number") {
                stateVersionRef.current = err.data.stateVersion;
            }
            if (serverAenderung > meinStand) {
                console.log(`[Garden] Server hat den Stand selbst geändert (ab ${serverAenderung}) — wird geholt.`);
                await uebernimmVomServer(null);
                return;
            }
            // Ein ANDERER Tab hat zuletzt geschrieben. Nachreichen hiesse: dessen
            // Rucksack durch den eigenen, älteren ersetzen — genau der Weg, auf dem
            // Samen verschwinden. Dieser Tab tritt deshalb zurück, holt den echten
            // Stand und schaut nur noch zu, bis der Spieler ihn übernimmt.
            const andererTab = err.data?.letzterTab;
            if (andererTab && andererTab !== TAB_ID) {
                console.warn(`[Garden] Anderer Tab hat zuletzt gespeichert (${andererTab}) — dieser tritt zurück.`);
                nurZuschauenRef.current = true;
                setNurZuschauen(true);
                await uebernimmVomServer(null);
                return;
            }
            if (versuch < 3) {
                await new Promise((r) => setTimeout(r, 120));
                await flushFarmStateToServerRef.current?.(ueberschreibung, versuch + 1);
                return;
            }
            // Auch danach wird NICHT nachgeladen. Ein Nachladen ersetzt alles, was dem
            // Browser gehört, durch den letzten gespeicherten Stand — bei zwölf frisch
            // gekauften Pfirsichen also: neun weg, Gold trotzdem abgebucht, und der
            // Ladenbestand wieder aufgefüllt (der wird ebenfalls mitgespeichert).
            // Der nächste Speicherversuch läuft ohnehin gleich wieder los und hat dann
            // den richtigen Zähler; damit klärt sich das von selbst, ohne Verlust.
            // Der einzige Fall, in dem der Serverstand wirklich der bessere ist, ist
            // ein Eingriff von aussen — und der schickt sein eigenes Signal
            // (garden:admin_update), das weiterhin nachlädt.
            console.warn("[Garden] Speichern kollidiert wiederholt — nächster Versuch folgt.");
        }
    }, [apiCall, uebernimmVomServer, gold, inventory, plotPlants, plotExpansions, plotUnlockedCells, harvestedItems, eggInventory, petInventory, petPlacements, decoInventory, decoPlacements, toolInventory, inventoryMaxSlots, incubator, gebaeudeVersatz, logbuch, personalShopStock, shopRotation?.generatedAt, toolShopStock, toolShopRotation?.generatedAt, eggShopStock, eggShopRotation?.generatedAt, playerAppearance, tutorialCompleted]);

    useEffect(() => { flushFarmStateToServerRef.current = flushFarmStateToServer; }, [flushFarmStateToServer]);
    useEffect(() => { isInitialLoadDoneRef.current = isInitialLoadDone; }, [isInitialLoadDone]);
    // Gold kommt aus vielen Richtungen (Ernte, Verkauf, Tierfunde, Post, Admin).
    // Das Ref zieht hier allgemein nach; `payServer` schreibt es zusätzlich sofort,
    // weil die Kauf-Warteschlange nicht bis zum nächsten Rendern warten kann.
    useEffect(() => { goldRef.current = gold; }, [gold]);

    // ── Briefkasten ───────────────────────────────────────────────────────────
    // Alles Wertrelevante rechnet der Server (Backend/garden/world/mail.js). Hier wird
    // nur die Antwort übernommen — insbesondere Gold und Inventar, damit der nächste
    // Farm-State-PUT die serverseitige Abbuchung nicht wieder überschreibt.
    useEffect(() => {
        if (showLobbyScreen || !isInitialLoadDone) return;
        apiCall("/mail")
            .then((data) => setMailboxState(Array.isArray(data?.mailbox) ? data.mailbox : []))
            .catch(() => {});
    }, [showLobbyScreen, isInitialLoadDone, apiCall]);

    const handleClaimMail = useCallback(async (mailId) => {
        setMailBusy(true);
        try {
            const data = await apiCall("/mail/claim", { method: "POST", body: JSON.stringify({ id: mailId }) });
            setMailboxState(Array.isArray(data?.mailbox) ? data.mailbox : []);
            if (typeof data?.gold === "number") setGold(data.gold);
            if (Array.isArray(data?.inventory)) setInventory(hydrateSeeds(data.inventory));
            if (Array.isArray(data?.harvestedItems)) setHarvestedItems(hydrateHarvestedItems(data.harvestedItems));
            if (Array.isArray(data?.petInventory)) setPetInventory(hydratePets(data.petInventory));
            // Eine Sendung kann mehrere Anhänge tragen — gleiche Namen werden für
            // die Meldung zu „Karotte × 3" zusammengefasst.
            const parts = [];
            if (data?.credited?.gold) parts.push(`${data.credited.gold.toLocaleString("de-DE")} Gold`);
            const namen = [
                ...(data?.credited?.seeds ?? []).map((s) => s?.name),
                ...(data?.credited?.items ?? []).map((i) => i?.name),
                ...(data?.credited?.pets ?? []).map((p) => p?.customName || p?.name),
            ].filter(Boolean);
            const gezaehlt = new Map();
            for (const name of namen) gezaehlt.set(name, (gezaehlt.get(name) || 0) + 1);
            for (const [name, anzahl] of gezaehlt) parts.push(anzahl > 1 ? `${name} × ${anzahl}` : name);
            notify(parts.length ? `Abgeholt: ${parts.join(", ")}.` : "Sendung abgeholt.");
            playSound("cash", 0.5);
        } catch (err) {
            notify(err?.message || "Abholen fehlgeschlagen.", "error");
        } finally {
            setMailBusy(false);
        }
    }, [apiCall, notify, playSound]);

    const handleSendMail = useCallback(async (payload, onDone) => {
        setMailBusy(true);
        const gesendeteSamen = new Set(payload.seedInstanceIds || []);
        const gesendeteTiere = new Set(payload.petIds || []);
        const gesendeteErnte = new Set(payload.itemIds || []);
        // Fuer den Ruecksprung, falls der Server ablehnt
        const { inventory: vorherSamen, petInventory: vorherTiere, harvestedItems: vorherErnte } = farmStateRef.current;
        try {
            // Erst den eigenen Stand hochschieben: der Server entscheidet gleich
            // anhand SEINER Kopie, ob der Samen ueberhaupt existiert. Ein Tier, das
            // gerade erst geschluepft ist, steht dort sonst noch gar nicht.
            await flushSave();

            // Jetzt sofort aus dem Rucksack nehmen. Vorher lag zwischen Klick und
            // Verschwinden eine ganze Netzrunde, und ein verschenkter Samen blieb
            // solange auswaehlbar — man konnte ihn in der Zwischenzeit einpflanzen.
            if (gesendeteSamen.size) {
                setInventory((prev) => prev.filter((s) => !gesendeteSamen.has(String(s?.instanceId))));
                setSelectedSeed((prev) => (prev && gesendeteSamen.has(String(prev.instanceId)) ? null : prev));
            }
            if (gesendeteTiere.size) {
                setPetInventory((prev) => prev.filter((p) => !gesendeteTiere.has(String(p?.id || p?.instanceId))));
                setSelectedPetToPlace((prev) => (prev && gesendeteTiere.has(String(prev.id || prev.instanceId)) ? null : prev));
            }
            if (gesendeteErnte.size) {
                setHarvestedItems((prev) => prev.filter((i) => !gesendeteErnte.has(String(i?.id))));
            }

            const data = await apiCall("/mail/send", { method: "POST", body: JSON.stringify(payload) });
            // Server hat abgebucht — lokalen Stand übernehmen, sonst schreibt der
            // nächste Auto-Save das alte Gold zurück.
            if (typeof data?.gold === "number") setGold(data.gold);
            if (Array.isArray(data?.inventory)) setInventory(hydrateSeeds(data.inventory));
            // Ernte und Tiere ebenfalls uebernehmen — sonst traegt der naechste
            // Speichervorgang das Verschenkte wieder ein.
            if (Array.isArray(data?.harvestedItems)) setHarvestedItems(hydrateHarvestedItems(data.harvestedItems));
            if (Array.isArray(data?.petInventory)) setPetInventory(hydratePets(data.petInventory));
            const anhaenge = gesendeteSamen.size + gesendeteErnte.size + gesendeteTiere.size;
            notify(anhaenge > 1
                ? `Sendung mit ${anhaenge} Gegenständen an ${payload.toLogin} unterwegs.`
                : `Sendung an ${payload.toLogin} unterwegs.`);
            onDone?.();
        } catch (err) {
            // Nichts ist rausgegangen (der Server prueft alles, bevor er abbucht) —
            // also den Rucksack wieder herstellen.
            setInventory(vorherSamen);
            setPetInventory(vorherTiere);
            setHarvestedItems(vorherErnte);
            notify(err?.message || "Senden fehlgeschlagen.", "error");
        } finally {
            setMailBusy(false);
        }
    }, [apiCall, notify, flushSave]);

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

    useEffect(() => {
        if (!showLobbyScreen) return;
        apiCall("/leaderboard")
            .then((data) => setLeaderboard(Array.isArray(data) ? data : []))
            .catch(() => setLeaderboard([]));
    }, [showLobbyScreen, apiCall]);

    /**
     * @param {"public"|"create"|"code"} mode
     * Die Weltwahl steht fest, BEVOR der Socket verbindet — der Hook liest
     * pendingWorldCode/pendingCreateWorld beim Verbindungsaufbau.
     */
    const enterWorld = async (mode = "public") => {
        if (!(await ensureTwitchSessionForGarden())) return;
        if (mode === "code") {
            const code = joinCodeInput.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
            if (code.length < 4) {
                notify("Bitte einen gültigen Weltcode eingeben.", "error");
                return;
            }
            setPendingWorldCode(code);
            setPendingCreateWorld(false);
        } else if (mode === "create") {
            vergissWelt();
            setPendingWorldCode("");
            setPendingCreateWorld(true);
        } else {
            // Zurueck in die zuletzt betretene Welt, sofern es eine oeffentliche war.
            // Ohne das landet man nach jedem Neuladen in irgendeiner freien Welt —
            // und damit neben fremden Leuten statt neben denen von vorhin.
            const gemerkt = letzteWelt();
            setPendingWorldCode(gemerkt.startsWith("OEFFENTLICH") ? gemerkt : "");
            setPendingCreateWorld(false);
        }
        startWorldBoot("multi");
        setShowLobbyScreen(false);
    };

    if (showLobbyScreen) {
        return (
            <div className="page-fade w-full flex-1 min-h-0 h-full relative overflow-y-auto custom-scrollbar flex items-center justify-center p-6 md:p-10">
                <div className="w-full max-w-2xl flex flex-col items-center gap-7 py-6">

                    <div className="flex items-center gap-3 self-start">
                        <span className="flex items-center justify-center w-10 h-10 rounded-md border border-slate-700 bg-slate-900 text-violet-400 shrink-0">
                            <Sprout size={20} />
                        </span>
                        <div>
                            <h1 className="text-2xl font-semibold text-white tracking-tight">Virtual Farm</h1>
                            <p className="text-xs text-slate-400 mt-0.5">Eine gemeinsame Welt mit acht Grundstücken</p>
                        </div>
                    </div>

                    <div className="w-full rounded-md border border-slate-700 bg-slate-900 overflow-hidden">
                        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-800">
                            <Trophy size={14} className="text-amber-400" />
                            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300">Bestenliste</h2>
                        </div>
                        {leaderboard.length === 0 ? (
                            <p className="px-4 py-6 text-center text-sm text-slate-500">Noch keine Farmer unterwegs.</p>
                        ) : (
                            <div>
                                {leaderboard.slice(0, 5).map((e, i) => (
                                    <div key={i} className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-800 last:border-b-0">
                                        <span className={`text-xs tabular-nums w-6 shrink-0 ${i === 0 ? "text-amber-400" : "text-slate-500"}`}>
                                            {i + 1}
                                        </span>
                                        <span className="flex-1 min-w-0 text-sm text-white truncate" title={e.name}>{e.name}</span>
                                        <span className="flex items-center gap-1.5 text-sm font-semibold text-amber-400 tabular-nums shrink-0">
                                            <Coins size={13} /> {formatGold(e.gold)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="w-full rounded-md border border-slate-700 bg-slate-900 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                            <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Twitch-Konto</div>
                            {authUser?.twitchLogin || authUser?.login ? (
                                <div className="text-sm text-white font-medium flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                    {(authUser?.twitchLogin || authUser?.login)}
                                </div>
                            ) : (
                                <div className="text-sm text-amber-300">Nicht angemeldet — die Farm braucht einen Twitch-Login</div>
                            )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {authUser && isSubscriber && (
                                <span className="flex items-center gap-1.5 px-2 py-1 rounded-sm border border-amber-500/40 text-amber-300 text-[11px] font-medium">
                                    <Star size={12} /> Subscriber · +50 % Verkauf
                                </span>
                            )}
                            {authUser && isBeta && (
                                <span className="flex items-center gap-1.5 px-2 py-1 rounded-sm border border-sky-500/40 text-sky-300 text-[11px] font-medium">
                                    <FlaskConical size={12} /> Beta
                                </span>
                            )}
                            {!authUser && (
                                <button
                                    type="button"
                                    onClick={() => twitchLogin?.()}
                                    className="flex items-center gap-2 bg-[#9146FF] hover:bg-[#7c3aed] text-white px-3 py-2 rounded-md text-xs font-semibold transition-colors"
                                >
                                    <TwitchGlyph className="w-3.5 h-3.5" /> Mit Twitch anmelden
                                </button>
                            )}
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => enterWorld("public")}
                        disabled={!authUser}
                        className="w-full bg-violet-600 hover:bg-violet-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-semibold py-3 rounded-md text-sm transition-colors flex items-center justify-center gap-2"
                    >
                        <Play size={16} />
                        Öffentliche Welt betreten
                    </button>

                    <div className="w-full rounded-md border border-slate-700 bg-slate-900 px-4 py-3 flex flex-col gap-3">
                        <div className="text-[10px] uppercase tracking-wider text-slate-500">Private Welt</div>
                        <div className="flex flex-col sm:flex-row gap-2">
                            <input
                                type="text"
                                value={joinCodeInput}
                                onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5))}
                                onKeyDown={(e) => { if (e.key === "Enter" && authUser) enterWorld("code"); }}
                                placeholder="Weltcode"
                                disabled={!authUser}
                                className="flex-1 px-3 py-2 rounded-md bg-slate-950 border border-slate-700 text-sm text-white tracking-[0.3em] uppercase placeholder:tracking-normal placeholder:text-slate-600 focus:border-violet-500 focus:outline-none disabled:opacity-50"
                            />
                            <button
                                type="button"
                                onClick={() => enterWorld("code")}
                                disabled={!authUser || joinCodeInput.trim().length < 4}
                                className="px-4 py-2 rounded-md border border-slate-700 text-slate-200 hover:text-white hover:border-slate-500 disabled:opacity-40 disabled:hover:border-slate-700 text-xs font-semibold transition-colors"
                            >
                                Beitreten
                            </button>
                            <button
                                type="button"
                                onClick={() => enterWorld("create")}
                                disabled={!authUser}
                                className="px-4 py-2 rounded-md border border-slate-700 text-slate-200 hover:text-white hover:border-slate-500 disabled:opacity-40 disabled:hover:border-slate-700 text-xs font-semibold transition-colors"
                            >
                                Neue Welt
                            </button>
                        </div>
                        <p className="text-[11px] text-slate-500 leading-relaxed">
                            Eine neue Welt bekommt einen fünfstelligen Code, den du weitergeben kannst.
                            Deine Farm bleibt dabei dieselbe — sie zieht mit dir in jede Welt um.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="relative w-full h-full min-h-0 flex-1 bg-slate-950 overflow-hidden" style={{ fontFamily: "'Courier New', monospace" }}>
            <canvas ref={canvasRef} className="absolute inset-0" />
            {worldBootState.active && (
                <div className="absolute inset-0 z-[120] bg-slate-950/95 backdrop-blur-sm flex items-center justify-center">
                    <div className="w-[min(460px,90vw)] rounded-md border border-slate-700 bg-slate-900 p-6">
                        <div className="text-base font-semibold text-white mb-1">Virtual Farm wird geladen</div>
                        <div className="text-xs text-slate-400 mb-4">{worldBootState.label || "Bitte warten..."}</div>
                        <div className="h-1.5 w-full rounded-sm bg-slate-800 overflow-hidden">
                            <div
                                className="h-full bg-violet-500 transition-[width] duration-200"
                                style={{ width: `${Math.max(4, Math.min(100, worldBootState.progress || 0))}%` }}
                            />
                        </div>
                        <div className="text-right text-[11px] text-slate-500 mt-2 tabular-nums">
                            {Math.round(worldBootState.progress || 0)} %
                        </div>
                    </div>
                </div>
            )}
            

            {/* ── Tutorial Overlay ──────────────────────────────────────── */}
            {!tutorialCompleted && !showLobbyScreen && (
                <div className={`absolute top-24 left-1/2 -translate-x-1/2 z-40 ${HUD_SURFACE} p-4 max-w-sm pointer-events-auto`}>
                    <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-violet-300 mb-2">
                        <Sprout size={14} /> Erste Schritte
                    </h3>
                    <div className="text-sm text-slate-300 leading-relaxed">
                        {inventory.length === 0 && Object.keys(plotPlants).length === 0 && harvestedItems.length === 0 && gold <= 500 && (
                            <p>Willkommen. Geh zum <span className="text-white font-medium">Samen-Shop</span> und kauf deinen ersten Samen.</p>
                        )}
                        {inventory.length > 0 && Object.keys(plotPlants).length === 0 && harvestedItems.length === 0 && (
                            <p>Wähl den Samen in deinem <span className="text-white font-medium">Inventar</span> aus und klick auf ein freies Ackerfeld, um ihn zu pflanzen.</p>
                        )}
                        {Object.keys(plotPlants).length > 0 && harvestedItems.length === 0 && (
                            <p>Die Pflanze wächst. Fahr mit der Maus darüber, um Restzeit und Wert zu sehen — klick sie an, sobald sie reif ist.</p>
                        )}
                        {harvestedItems.length > 0 && (
                            <p>Geh zum <span className="text-white font-medium">Marktstand</span> und verkauf deine Ernte.</p>
                        )}
                        {gold > 500 && harvestedItems.length === 0 && Object.keys(plotPlants).length === 0 && inventory.length === 0 && (
                            <p>Geschafft — das war der Einstieg.</p>
                        )}
                    </div>
                    <button
                        type="button"
                        className="mt-3 w-full py-1.5 border border-slate-700 hover:border-slate-600 text-slate-300 hover:text-white rounded-md text-xs font-medium transition-colors"
                        onClick={() => setTutorialCompleted(true)}
                    >
                        Nicht mehr anzeigen
                    </button>
                </div>
            )}

            {/* ── Notification toast ──────────────────────────────────────── */}
            {notification && (
                <div
                    key={notification.id}
                    className={`absolute top-24 left-1/2 -translate-x-1/2 z-[300] px-4 py-2.5 rounded-md text-sm font-medium border backdrop-blur-sm ${
                        notification.type === "error"
                            ? "bg-rose-950/95 border-rose-800 text-rose-200"
                            : "bg-slate-900/95 border-slate-700 text-slate-100"
                    }`}
                >
                    {notification.msg}
                </div>
            )}
            {/* ── Zweiter Tab: dieser hier speichert nicht mehr ────────────────── */}
            {nurZuschauen && (
                <div className="absolute bottom-5 left-1/2 z-[290] w-[min(94vw,520px)] -translate-x-1/2 rounded-md border border-amber-800 bg-amber-950/95 px-4 py-3 backdrop-blur-sm">
                    <div className="flex items-start gap-3">
                        <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                        <div className="flex-1 text-sm text-amber-100">
                            <p className="font-medium">Die Farm ist in einem anderen Tab offen.</p>
                            <p className="mt-1 text-xs text-amber-200/80">
                                Dieser Tab speichert nicht mehr — sonst würde er den anderen überschreiben.
                                Was du hier noch machst, wird nicht gespeichert. Zum Weiterspielen
                                erst den aktuellen Stand holen.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={async () => {
                                if (await uebernimmVomServer("Dieser Tab spielt jetzt weiter.")) {
                                    nurZuschauenRef.current = false;
                                    setNurZuschauen(false);
                                }
                            }}
                            className="shrink-0 rounded-sm border border-amber-700 bg-amber-900/60 px-3 py-1.5 text-xs font-medium text-amber-100 transition-colors hover:bg-amber-900"
                        >
                            Hier weiterspielen
                        </button>
                    </div>
                </div>
            )}
            {/* Shop-Rotationen: gestapelt (gleiche Minute → nicht übereinander) */}
            {rotationBanners.length > 0 && (
                <div className="pointer-events-none absolute left-1/2 top-[4.75rem] z-[38] flex max-w-[min(94vw,460px)] -translate-x-1/2 flex-col items-stretch gap-2">
                    {rotationBanners.map((b) => (
                        <div
                            key={b.id}
                            className="rounded-md border border-slate-700 bg-slate-900/95 px-4 py-2 text-center text-sm font-medium text-slate-100 backdrop-blur-sm"
                        >
                            {b.msg}
                        </div>
                    ))}
                </div>
            )}

            {/* ── Links oben: Einstellungen, Changelog, darunter Weltzustand ──── */}
            <div className="absolute top-5 left-5 z-50 flex flex-col items-start gap-2">
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        aria-label="Einstellungen"
                        onClick={(e) => {
                            e.currentTarget.blur();
                            setSettingsOpen((prev) => !prev);
                        }}
                        className={`flex h-10 w-10 shrink-0 items-center justify-center ${HUD_SURFACE} text-slate-300 transition-colors hover:text-white`}
                    >
                        <Settings size={17} />
                    </button>
                    <button
                        type="button"
                        onClick={() => setChangelogOpen(true)}
                        className={`flex h-10 shrink-0 items-center gap-2 ${HUD_SURFACE} px-3 text-xs font-medium text-slate-300 transition-colors hover:text-white`}
                    >
                        <ScrollText size={15} />
                        <span className="hidden sm:inline">Changelog</span>
                    </button>
                </div>

                {/* Spielerzahl und Zoom sagen etwas über die Welt und die Ansicht, nicht
                    über die eigene Farm — deshalb hier bei den Einstellungen statt
                    rechts zwischen Gold, Post und Tieren.
                    Die Liste klappt per KLICK auf und bleibt offen: sie ist zum Anklicken
                    der Namen da, und ein Aufklappen beim Überfahren würde genau dann
                    zuschnappen, wenn man den Zeiger zum gewünschten Namen bewegt. */}
                <div className="flex flex-col items-start">
                    <button
                        type="button"
                        onClick={(e) => { e.currentTarget.blur(); setOnlineListeOffen((offen) => !offen); }}
                        aria-expanded={istOnlineListeOffen}
                        className={`flex h-10 w-[11rem] items-center gap-2 ${HUD_SURFACE} px-3 text-xs font-medium text-slate-300 transition-colors hover:text-white`}
                    >
                        <Users size={15} className="shrink-0" />
                        <span className="truncate tabular-nums">
                            {lobbyConnected ? `${onlinePlayers.length + 1}/${WORLD_SLOTS} online` : "Verbinde…"}
                        </span>
                        <ChevronDown
                            size={13}
                            className={`ml-auto shrink-0 text-slate-500 transition-transform ${istOnlineListeOffen ? "rotate-180" : ""}`}
                        />
                    </button>
                    {istOnlineListeOffen && (
                        <div className="mt-2 w-[15rem] max-h-64 overflow-y-auto bg-slate-900/95 border border-slate-700 rounded-md p-1.5 backdrop-blur-sm flex flex-col gap-0.5">
                            <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-slate-500">
                                Klick bringt dich zum Grundstück
                            </div>
                            {[
                                { id: "ich", name: localPlayerNameRef.current || "Du", slotIndex: mySlotIndex, selbst: true },
                                ...onlinePlayers.map((p) => ({
                                    id: p.twitchId, name: p.name || "Farmer", slotIndex: p.slotIndex, selbst: false,
                                })),
                            ].map((eintrag) => (
                                <button
                                    key={eintrag.id}
                                    type="button"
                                    onClick={() => besucheSpieler(eintrag)}
                                    className={`flex items-center gap-2 px-2 py-1.5 rounded-sm border border-transparent text-left transition-colors hover:border-slate-700 hover:bg-slate-800/70 ${
                                        eintrag.selbst ? "bg-slate-800/60" : ""
                                    }`}
                                >
                                    <MapPin size={12} className="shrink-0 text-slate-500" />
                                    <span className={`flex-1 min-w-0 truncate text-xs ${
                                        eintrag.selbst ? "text-white font-medium" : "text-slate-300"
                                    }`}>
                                        {eintrag.name}
                                    </span>
                                    <span className="shrink-0 text-[10px] tabular-nums text-slate-500">
                                        {Number.isInteger(eintrag.slotIndex) && eintrag.slotIndex >= 0
                                            ? `Platz ${eintrag.slotIndex + 1}`
                                            : "—"}
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Einrichten: Raster einblenden, Deko setzen und einpacken, Gebäude
                    umstellen. Ausserhalb passiert davon nichts — im normalen Spiel
                    hat ein Klick daneben sonst dauernd Deko eingesammelt. */}
                <button
                    type="button"
                    onClick={() => setEditorAktiv((an) => {
                        if (an) { setSelectedDecoToPlace(null); setVerschiebtGebaeude(null); }
                        return !an;
                    })}
                    className={`flex h-10 items-center gap-2 ${HUD_SURFACE} px-3 text-xs font-medium transition-colors ${
                        editorAktiv ? "text-violet-300" : "text-slate-300 hover:text-white"
                    }`}
                >
                    <LayoutGrid size={15} className="shrink-0" />
                    <span className="hidden sm:inline">{editorAktiv ? "Editor beenden" : "Editor"}</span>
                </button>

                {/* Nur für den Streamer: Spielstände von hier aus bearbeiten, ohne den
                    Umweg über das Dashboard in einem zweiten Tab. */}
                {istGartenAdmin && (
                    <button
                        type="button"
                        onClick={() => setAdminPanelOffen(true)}
                        className={`flex h-10 items-center gap-2 ${HUD_SURFACE} px-3 text-xs font-medium text-violet-300 transition-colors hover:text-white`}
                    >
                        <SlidersHorizontal size={15} className="shrink-0" />
                        <span className="hidden sm:inline">Admin</span>
                    </button>
                )}

                {/* Zoom nur zeigen, wenn er vom Standard abweicht — sonst steht dauerhaft
                    eine Zeile im Weg, die man nie braucht. */}
                {Math.abs(zoomAnzeige - WORLD_ZOOM) > 0.001 && (
                    <button
                        type="button"
                        onClick={() => { zoomRef.current = WORLD_ZOOM; setZoomAnzeige(WORLD_ZOOM); }}
                        title="Auf Standard zurücksetzen"
                        className={`flex h-10 items-center gap-2 ${HUD_SURFACE} px-3 text-xs font-medium text-slate-300 transition-colors hover:text-white`}
                    >
                        <Search size={15} className="shrink-0" />
                        <span className="tabular-nums">{Math.round((zoomAnzeige / WORLD_ZOOM) * 100)}%</span>
                    </button>
                )}
            </div>

            {/* Admin-Menü. Breiter als die übrigen Fenster, weil links die Spielerliste
                steht und rechts die Einträge mit ihren Werten. */}
            {adminPanelOffen && istGartenAdmin && (
                <div className="absolute inset-0 z-[60] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="w-full max-w-6xl h-[86vh] flex flex-col bg-slate-900 border border-slate-700 rounded-md p-4">
                        <GardenAdminBrowser
                            eigeneId={authUser?.id}
                            onClose={() => setAdminPanelOffen(false)}
                        />
                    </div>
                </div>
            )}

            {isSettingsOpen && (
                <div className="absolute top-[68px] left-5 z-50 w-72 max-h-[calc(100vh-6rem)] overflow-y-auto bg-slate-900/95 border border-slate-700 rounded-md p-2 backdrop-blur-sm flex flex-col gap-1">

                    {/* --- AUDIO --- */}
                    <div className="px-3 pt-2 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
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
                    <div className="px-3 pt-2 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                        Render-Qualität
                    </div>
                    <div className="px-2 pb-2 flex gap-1 mt-1">
                        {["low", "medium", "high"].map((level) => (
                            <button
                                key={level}
                                type="button"
                                onClick={() => {
                                    const preset = RENDER_QUALITY_PRESETS[level];
                                    setRenderProfile(preset);
                                    renderProfileRef.current = preset;
                                }}
                                className={`flex-1 px-2 py-1.5 rounded-sm text-xs font-medium transition-colors ${
                                    renderProfile.level === level
                                        ? "bg-violet-600 text-white"
                                        : "bg-slate-800 text-slate-400 hover:text-white"
                                }`}
                            >
                                {level === "low" ? "Niedrig" : level === "medium" ? "Mittel" : "Hoch"}
                            </button>
                        ))}
                    </div>

                    <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-slate-500 font-semibold mt-1 border-t border-slate-800">
                        Tastenkürzel
                    </div>
                    <div className="px-3 pb-3 text-xs text-slate-400 space-y-1.5">
                        {[
                            ["Markt", "Shift + 1"],
                            ["Shop-Areal", "Shift + 2"],
                            ["Eigene Farm", "Shift + 3"],
                            ["Interagieren", "E / Leertaste"],
                            ["Werkzeuge", "1 – 4"],
                            ["Deko-Ansicht", "R"],
                            ["Inventar", "Tab"],
                        ].map(([label, key]) => (
                            <div key={label} className="flex justify-between items-center gap-2">
                                <span>{label}</span>
                                <kbd className="bg-slate-800 border border-slate-700 text-slate-300 px-1.5 rounded-sm text-[10px]">{key}</kbd>
                            </div>
                        ))}
                    </div>

                    <button
                        type="button"
                        onClick={async () => {
                            await flushFarmStateToServer();
                            setSettingsOpen(false);
                            setShowLobbyScreen(true);
                        }}
                        className="w-full text-left px-3 py-2 rounded-sm hover:bg-slate-800 text-xs text-slate-300 hover:text-white transition-colors mt-1 border-t border-slate-800"
                    >
                        Zurück zum Hauptbildschirm
                    </button>
                    <button
                        type="button"
                        onClick={() => { window.location.href = "https://vnmvalentin.de"; }}
                        className="w-full text-left px-3 py-2 rounded-sm hover:bg-slate-800 text-xs text-slate-300 hover:text-white transition-colors"
                    >
                        Zur Website
                    </button>
                </div>
            )}

            {/* ── Rechts: Wetter + Gold, darunter Post, Umkleide, Tiere ──────── */}
            {/* items-end statt fester Spaltenbreite: die Gold-Zeile darf breiter sein
                als der Rest, ohne dass alles andere mitwächst. */}
            <div className="absolute top-5 right-5 z-40 flex flex-col items-end gap-2">
                <div className="flex items-stretch gap-2">
                    <div className={`flex h-10 items-center gap-2 ${HUD_SURFACE} px-3 text-xs font-medium text-slate-300`}>
                        {React.createElement(weatherIcon(weatherState?.type), { size: 15, className: "shrink-0 text-sky-400" })}
                        <span className="truncate">{weatherState?.label || "Sonne"}</span>
                    </div>

                    {/* Goldstand mit Bestenliste: beim Draufhalten steht darunter, wie
                        die anderen in dieser Welt dastehen — der eigene Stand extra
                        obendrüber, damit man den Abstand sofort sieht.

                        `hover:z-[60]`: Gold- und Tier-Leiste hatten beide z-50 und bilden
                        damit je einen eigenen Stapelkontext. Bei gleichem Wert gewinnt das
                        SPÄTERE Element im Baum — die Bestenliste klappte also hinter die
                        Tier-Leiste darunter. Wer gerade aufgeklappt ist, kommt jetzt nach
                        vorn. */}
                    <div className="group relative z-50 hover:z-[60] w-[12.5rem]">
                        <div className={`flex h-10 w-full cursor-default items-center gap-2 ${HUD_SURFACE} px-3`}>
                            <Coins size={15} className="shrink-0 text-amber-400" />
                            <span className="truncate text-sm font-semibold tabular-nums text-amber-400">
                                {gold.toLocaleString("de-DE")}
                            </span>
                            <ChevronDown size={13} className="ml-auto shrink-0 text-slate-500" />
                        </div>
                        <div className="absolute right-0 top-full z-50 hidden w-[15rem] pt-2 group-hover:block">
                            <div className="flex flex-col gap-2 bg-slate-900/95 border border-slate-700 p-2 rounded-md backdrop-blur-sm">
                                <div className="flex items-center gap-2 px-2 py-1.5 rounded-sm border border-amber-900/60 bg-amber-950/30">
                                    <Coins size={14} className="shrink-0 text-amber-400" />
                                    <span className="flex-1 min-w-0 text-xs text-slate-200 truncate">Du</span>
                                    <span className="text-xs font-semibold tabular-nums text-amber-400 shrink-0">
                                        {formatGold(gold)}
                                    </span>
                                </div>

                                <div className="flex flex-col gap-0.5">
                                    <div className="px-2 pb-0.5 text-[10px] uppercase tracking-wider text-slate-500">
                                        In dieser Welt
                                    </div>
                                    {/* Allein braucht es keine Rangliste — der eigene Stand
                                        steht schon darüber. */}
                                    {onlinePlayers.length === 0 ? (
                                        <div className="px-2 py-1 text-[11px] text-slate-600">
                                            Sonst ist gerade niemand hier.
                                        </div>
                                    ) : (() => {
                                        // Eigener Stand kommt aus `gold` (der Server hat ihn
                                        // gerade bestätigt), die anderen aus dem Lobby-Tick.
                                        const liste = [
                                            { id: "ich", name: localPlayerNameRef.current || "Du", gold, selbst: true },
                                            ...onlinePlayers.map((p) => ({
                                                id: p.twitchId, name: p.name || "Farmer", gold: p.gold || 0, selbst: false,
                                            })),
                                        ].sort((a, b) => b.gold - a.gold);
                                        return liste.map((eintrag, i) => (
                                            <div
                                                key={eintrag.id}
                                                className={`flex items-center gap-2 px-2 py-1 rounded-sm ${
                                                    eintrag.selbst ? "bg-slate-800/70" : ""
                                                }`}
                                            >
                                                <span className="w-4 text-[10px] tabular-nums text-slate-500 shrink-0">{i + 1}.</span>
                                                <span className={`flex-1 min-w-0 text-xs truncate ${
                                                    eintrag.selbst ? "text-white font-medium" : "text-slate-300"
                                                }`}>
                                                    {eintrag.name}
                                                </span>
                                                <span className="text-xs tabular-nums text-amber-400/90 shrink-0">
                                                    {formatGold(eintrag.gold)}
                                                </span>
                                            </div>
                                        ));
                                    })()}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <button
                    type="button"
                    onClick={() => { setMailboxMode("inbox"); setMailboxRecipient(""); setMailboxOpen(true); }}
                    className={`relative flex h-10 w-[12.5rem] items-center gap-2 ${HUD_SURFACE} px-3 text-xs font-medium text-slate-300 transition-colors hover:text-white`}
                >
                    <Mail size={15} className="shrink-0" />
                    <span>Briefkasten</span>
                    {mailbox.length > 0 && (
                        <span className="ml-auto min-w-[18px] px-1 text-[10px] font-semibold text-white bg-violet-600 rounded-sm text-center tabular-nums">
                            {mailbox.length}
                        </span>
                    )}
                </button>

                <button
                    type="button"
                    onClick={() => setWardrobeOpen(true)}
                    className={`flex h-10 w-[12.5rem] items-center gap-2 ${HUD_SURFACE} px-3 text-xs font-medium text-slate-300 transition-colors hover:text-white`}
                >
                    <Shirt size={15} className="shrink-0" />
                    <span>Umkleide</span>
                </button>

                <button
                    type="button"
                    onClick={() => setLogbuchOpen(true)}
                    className={`flex h-10 w-[12.5rem] items-center gap-2 ${HUD_SURFACE} px-3 text-xs font-medium text-slate-300 transition-colors hover:text-white`}
                >
                    <ScrollText size={15} className="shrink-0" />
                    <span className="tabular-nums">
                        Logbuch {Object.keys(logbuch).length}/{SEED_CATALOGUE.length}
                    </span>
                </button>

                {/* Tiere: gleiche Höhe, Dropdown darunter. `hover:z-[60]` wie beim
                    Goldstand — sonst deckt die Tierliste die Bestenliste zu bzw. wird
                    selbst von dem verdeckt, was unter ihr steht. */}
                <div className="group relative z-50 hover:z-[60] w-[12.5rem]">
                    <div className={`flex h-10 w-full cursor-default items-center justify-between gap-2 ${HUD_SURFACE} px-3 text-xs font-medium text-slate-300`}>
                        <span className="flex min-w-0 items-center gap-2 truncate">
                            <PawPrint size={15} className="shrink-0" />
                            <span className="truncate tabular-nums">
                                Tiere {petPlacements.filter((p) => p.slotIndex === mySlotIndex).length}/{normalizeToolInventory(toolInventory).petSlots}
                            </span>
                        </span>
                        <ChevronDown size={13} className="shrink-0 text-slate-500" />
                    </div>
                    <div className="absolute right-0 top-full z-50 hidden w-full min-w-[12.5rem] pt-2 group-hover:block">
                        <div className="flex flex-col gap-1 bg-slate-900/95 border border-slate-700 p-2 rounded-md backdrop-blur-sm">
                                {petPlacements.filter(p => p.slotIndex === mySlotIndex).map((pet, i) => (
                                    <button
                                        key={pet.id || i}
                                        type="button"
                                        onClick={() => setInspectedPet(pet)}
                                        className="flex items-center gap-2 px-2 py-1.5 rounded-sm border border-transparent hover:border-slate-700 hover:bg-slate-800/70 transition-colors text-left"
                                    >
                                        {/* Bild dazu, damit man bei mehreren Tieren sieht, welches gemeint ist */}
                                        <img
                                            src={pet.image || getPetSpriteImage(pet.name)}
                                            alt=""
                                            draggable={false}
                                            className="w-6 h-6 object-contain shrink-0"
                                        />
                                        <span className="flex-1 min-w-0">
                                            <span className="block text-xs text-slate-200 truncate">{pet.customName || pet.name}</span>
                                            {pet.customName && <span className="block text-[10px] text-slate-500 truncate">{pet.name}</span>}
                                        </span>
                                        <span className={`text-[10px] shrink-0 ${RARITY_TEXT[pet.rarity] || RARITY_TEXT.COMMON}`}>
                                            {pet.ability ? `Lv. ${pet.ability.level}` : "—"}
                                        </span>
                                    </button>
                                ))}

                            {/* Plätze nachkaufen — hier statt im Tool-Shop, weil man genau
                                hier merkt, dass einer fehlt. */}
                            {(() => {
                                const slots = normalizeToolInventory(toolInventory).petSlots;
                                const preis = getPetSlotPreis(slots);
                                if (preis === null) {
                                    return (
                                        <div className="px-2 py-1.5 text-[10px] text-slate-500 border-t border-slate-800 mt-1 pt-2">
                                            Alle {PET_SLOTS_MAX} Plätze freigeschaltet.
                                        </div>
                                    );
                                }
                                const bezahlbar = gold >= preis;
                                // Der Knopf sah aus wie eine weitere Tierzeile und ging in der
                                // Liste unter. Jetzt sitzt er abgesetzt unter einer Trennlinie
                                // und trägt, sobald man ihn sich leisten kann, die Farbe der
                                // übrigen Kaufknöpfe im Spiel.
                                return (
                                    <div className="mt-1 pt-2 border-t border-slate-800">
                                        <button
                                            type="button"
                                            onClick={handleBuyPetSlot}
                                            disabled={!bezahlbar}
                                            className={`flex w-full items-center gap-2 px-2.5 py-2 rounded-md border text-left transition-colors ${
                                                bezahlbar
                                                    ? "border-violet-500 bg-violet-600 text-white hover:bg-violet-500"
                                                    : "border-slate-800 bg-slate-900 text-slate-600 cursor-not-allowed"
                                            }`}
                                        >
                                            <Plus size={15} className="shrink-0" />
                                            <span className="flex-1 min-w-0">
                                                <span className="block text-xs font-semibold truncate">
                                                    Tier-Platz {slots + 1} kaufen
                                                </span>
                                                <span className={`block text-[10px] tabular-nums ${bezahlbar ? "text-violet-100" : "text-slate-600"}`}>
                                                    {formatGold(preis)} Gold{bezahlbar ? "" : " — reicht noch nicht"}
                                                </span>
                                            </span>
                                        </button>
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                </div>

                {/* Erscheint nur, wenn wirklich etwas fertig ist — eine dauerhaft
                    sichtbare Inkubator-Zeile wäre die meiste Zeit nur eine Zeile mehr.
                    Öffnet das Fenster von hier aus, wie es der Briefkasten daneben
                    auch tut. */}
                {readyEggsCount > 0 && (
                    <button
                        type="button"
                        onClick={() => { setIncubatorTargetSlot(null); setIncubatorOpen(true); }}
                        className="flex h-10 w-[12.5rem] items-center gap-2 rounded-md border border-violet-500 bg-violet-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-violet-500"
                    >
                        <Egg size={15} className="shrink-0" />
                        <span className="truncate">
                            {readyEggsCount === 1 ? "Ei fertig" : `${readyEggsCount} Eier fertig`}
                        </span>
                        <span className="ml-auto text-[10px] font-medium text-violet-100">Inkubator</span>
                    </button>
                )}

                {/* Weltchat. Anders als Gold und Tiere klappt er per KLICK auf und
                    bleibt offen — beim Tippen darf er nicht zuschnappen, sobald der
                    Zeiger die Leiste verlässt. Der Verlauf gehört der Welt und wird
                    nicht gespeichert; wer später dazukommt, sieht ihn nicht. */}
                <div className="w-[12.5rem]">
                    <button
                        type="button"
                        onClick={(e) => { e.currentTarget.blur(); setChatOffen((offen) => !offen); }}
                        aria-expanded={istChatOffen}
                        className={`flex h-10 w-full items-center gap-2 ${HUD_SURFACE} px-3 text-xs font-medium text-slate-300 transition-colors hover:text-white`}
                    >
                        <MessageSquare size={15} className="shrink-0" />
                        <span>Chat</span>
                        {chatUngelesen > 0 && !istChatOffen && (
                            <span className="min-w-[18px] px-1 text-[10px] font-semibold text-white bg-violet-600 rounded-sm text-center tabular-nums">
                                {chatUngelesen > 99 ? "99+" : chatUngelesen}
                            </span>
                        )}
                        <ChevronDown
                            size={13}
                            className={`ml-auto shrink-0 text-slate-500 transition-transform ${istChatOffen ? "rotate-180" : ""}`}
                        />
                    </button>

                    {istChatOffen && (
                        <div className="mt-2 w-[19rem] -ml-[6.5rem] flex flex-col bg-slate-900/95 border border-slate-700 rounded-md backdrop-blur-sm">
                            <div
                                className="h-56 overflow-y-auto px-2.5 py-2 flex flex-col gap-1.5"
                                style={{ overscrollBehavior: "contain" }}
                            >
                                {chatVerlauf.length === 0 ? (
                                    <p className="text-[11px] text-slate-600 leading-relaxed">
                                        Noch nichts geschrieben. Was du hier schickst, lesen alle in dieser Welt.
                                    </p>
                                ) : (
                                    chatVerlauf.map((n) => {
                                        const eigen = String(n.twitchId) === String(authUser?.twitchId ?? "");
                                        return (
                                            <div key={n.id} className="text-[11px] leading-snug break-words">
                                                <button
                                                    type="button"
                                                    onClick={() => besucheSpieler({
                                                        name: n.from, slotIndex: n.slotIndex, selbst: eigen,
                                                    })}
                                                    title={`Zum Grundstück von ${n.from}`}
                                                    className={`font-semibold transition-colors hover:underline ${
                                                        eigen ? "text-violet-300" : "text-slate-200 hover:text-white"
                                                    }`}
                                                >
                                                    {n.from}
                                                </button>
                                                <span className="text-slate-600">: </span>
                                                <span className="text-slate-300">{n.text}</span>
                                            </div>
                                        );
                                    })
                                )}
                                <div ref={chatEndeRef} />
                            </div>
                            <form
                                onSubmit={(e) => { e.preventDefault(); chatAbschicken(); }}
                                className="flex items-center gap-1.5 border-t border-slate-800 p-1.5"
                            >
                                <input
                                    value={chatEingabe}
                                    onChange={(e) => setChatEingabe(e.target.value)}
                                    maxLength={CHAT_MAX_LEN}
                                    placeholder={lobbyConnected ? "Nachricht" : "Nicht verbunden"}
                                    disabled={!lobbyConnected}
                                    className="flex-1 min-w-0 px-2 py-1.5 rounded-sm bg-slate-950 border border-slate-700 text-[11px] text-white placeholder:text-slate-600 focus:border-violet-500 focus:outline-none disabled:text-slate-600"
                                />
                                <button
                                    type="submit"
                                    disabled={!lobbyConnected || !chatEingabe.trim()}
                                    aria-label="Nachricht schicken"
                                    className="shrink-0 flex h-[26px] w-[26px] items-center justify-center rounded-sm bg-violet-600 text-white transition-colors hover:bg-violet-500 disabled:bg-slate-800 disabled:text-slate-600"
                                >
                                    <Send size={13} />
                                </button>
                            </form>
                        </div>
                    )}
                </div>

                {/* Weltcode zum Weitergeben — nur bei privaten Welten sinnvoll */}
                {lobbyConnected && !isPublicWorld && activeCode && (
                    <button
                        type="button"
                        title="Code kopieren"
                        onClick={() => {
                            navigator.clipboard?.writeText(activeCode)
                                .then(() => notify("Weltcode kopiert."))
                                .catch(() => notify(`Weltcode: ${activeCode}`));
                        }}
                        className={`flex h-10 w-[12.5rem] items-center gap-2 ${HUD_SURFACE} px-3 text-xs font-medium text-slate-300 transition-colors hover:text-white`}
                    >
                        <Copy size={15} className="shrink-0" />
                        <span className="tracking-[0.2em] font-semibold">{activeCode}</span>
                    </button>
                )}
            </div>

            {/* Umstell-Modus: ohne Hinweis wüsste niemand, dass der nächste Klick zählt. */}
            {verschiebtGebaeude && (
                <div className={`absolute top-16 left-1/2 -translate-x-1/2 z-40 ${HUD_SURFACE} px-4 py-2.5 flex items-center gap-3 text-xs`}>
                    <Move size={14} className="text-violet-400 shrink-0" />
                    <span className="text-slate-200">
                        {GEBAEUDE_NAMEN[verschiebtGebaeude] || "Gebäude"} umstellen — auf eine Wiesenfläche
                        deines Grundstücks klicken
                    </span>
                    <button
                        type="button"
                        onClick={() => setVerschiebtGebaeude(null)}
                        className="text-slate-400 hover:text-white transition-colors font-medium"
                    >
                        Abbrechen
                    </button>
                </div>
            )}

            {/* ── Selected seed indicator ──────────────────────────────────── */}
            {selectedTool && (
                <div className={`absolute top-16 left-1/2 -translate-x-1/2 ${HUD_SURFACE} px-3 py-2 text-xs text-slate-200 flex items-center gap-2`}>
                    {React.createElement(toolIcon(selectedTool), { size: 14, className: "text-violet-400 shrink-0" })}
                    <span className="font-medium">
                        {selectedTool === "pickaxe" ? "Spitzhacke" : selectedTool === "pot" ? "Pflanztopf" : selectedTool === "watering" ? "Gießkanne" : "Schaufel"}
                    </span>
                    {selectedTool === "pot" && movingPlantSource && <span className="text-slate-400">· Quelle gewählt</span>}
                    {selectedTool === "shovel" && <span className="text-slate-400">· gedrückt halten zum Entfernen</span>}
                    <button
                        type="button"
                        aria-label="Werkzeug weglegen"
                        onClick={() => { setSelectedTool(null); setMovingPlantSource(null); setShovelHoldState({ active: false, progress: 0 }); setSelectedDecoToPlace(null); }}
                        className="ml-1 text-slate-500 hover:text-white transition-colors"
                    >
                        <X size={14} />
                    </button>
                </div>
            )}
            {selectedDecoToPlace && (
                <div className={`absolute top-16 left-1/2 -translate-x-1/2 ${HUD_SURFACE} px-3 py-2 text-xs text-slate-200 flex items-center gap-2`}>
                    <ItemIcon item={selectedDecoToPlace} className="w-4 h-4" emojiClassName="text-sm" />
                    <span className="font-medium">{selectedDecoToPlace.name}</span>
                    <span className="text-slate-400">· Klick setzt die untere linke Ecke</span>
                    <span className="text-slate-400 flex items-center gap-1">
                        ·
                        <kbd className="bg-slate-800 border border-slate-700 px-1 rounded-sm text-[10px]">R</kbd>
                        <span>{decoGespiegelt ? "gespiegelt" : "spiegeln"}</span>
                    </span>
                    <button
                        type="button"
                        aria-label="Deko weglegen"
                        onClick={() => setSelectedDecoToPlace(null)}
                        className="ml-1 text-slate-500 hover:text-white transition-colors"
                    >
                        <X size={14} />
                    </button>
                </div>
            )}
            {selectedPetToPlace && (
                <div className={`absolute top-16 left-1/2 -translate-x-1/2 ${HUD_SURFACE} px-3 py-2 text-xs text-slate-200 flex items-center gap-2`}>
                    <PawPrint size={14} className="text-emerald-400 shrink-0" />
                    <span className="font-medium">{selectedPetToPlace.name}</span>
                    <span className="text-slate-400">· auf dein Grundstück klicken</span>
                    <button
                        type="button"
                        aria-label="Tier weglegen"
                        onClick={() => setSelectedPetToPlace(null)}
                        className="ml-1 text-slate-500 hover:text-white transition-colors"
                    >
                        <X size={14} />
                    </button>
                </div>
            )}
            {selectedTool === "shovel" && shovelHoldState.active && (
                <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-40 w-44">
                    <div className="h-1.5 w-full rounded-sm bg-slate-800 overflow-hidden">
                        <div className="h-full bg-rose-500 transition-[width] duration-75" style={{ width: `${Math.round(shovelHoldState.progress * 100)}%` }} />
                    </div>
                    <div className="text-[10px] text-slate-400 text-center mt-1">Pflanze entfernen…</div>
                </div>
            )}
            <SkillTreeModal
                offen={skillsOffen}
                onClose={() => setSkillsOffen(false)}
                katalog={skillKatalog}
                stand={skillStand}
                onLernen={lerneSkill}
                onZuruecksetzen={setzeSkillsZurueck}
            />
            {/* Der Schlüssel trägt den Grundstücks-Index vorne: "3:2_5". Ohne ihn
                landete der Hover über einem fremden Acker im eigenen Bestand. */}
            <PlantHoverLayer
                store={hoverStore}
                getPlant={(k) => {
                    const trenner = String(k).indexOf(":");
                    if (trenner === -1) return engineRef.current.plotPlants?.[k] || null;
                    const slotIndex = Number(k.slice(0, trenner));
                    const zelle = k.slice(trenner + 1);
                    if (slotIndex === mySlotRef.current) return engineRef.current.plotPlants?.[zelle] || null;
                    const roh = plotsRef.current.get(slotIndex)?.plants?.[zelle];
                    // Die Momentaufnahme trägt keine Bildpfade (der Server kennt nur
                    // Werte) — dieselbe Ableitung wie für den eigenen Acker.
                    return roh ? hydratePlantVisuals(roh) : null;
                }}
                getOwner={(k) => {
                    const trenner = String(k).indexOf(":");
                    if (trenner === -1) return null;
                    const slotIndex = Number(k.slice(0, trenner));
                    if (slotIndex === mySlotRef.current) return null;
                    return plotsRef.current.get(slotIndex)?.owner || null;
                }}
            />
            {itemHoverTooltip?.item && (
                <div
                    // 1. ANPASSUNG: 'fixed' zentriert das Modal immer perfekt am Mauszeiger, egal was der Container macht!
                    className="fixed z-[100] pointer-events-none bg-slate-900/95 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 shadow-xl min-w-[150px]"
                    style={getItemTooltipStyle(itemHoverTooltip.x, itemHoverTooltip.y)}
                >
                    <div className="font-medium text-white">{itemHoverTooltip.item.name || "Gegenstand"}</div>
                    <RarityLabel rarity={itemHoverTooltip.item.rarity} />
                    {itemHoverTooltip.item._type === "seed" && (
                        <>
                            <div className="text-slate-400 text-[10px] mt-1">Auf ein freies Ackerfeld klicken zum Pflanzen</div>
                            {(itemHoverTooltip.item.shopPrice || itemHoverTooltip.item.sellPrice) && (
                                <div className="text-amber-400 font-semibold mt-0.5 tabular-nums">
                                    {(itemHoverTooltip.item.shopPrice || itemHoverTooltip.item.sellPrice || 0).toLocaleString("de-DE")} Gold
                                </div>
                            )}
                        </>
                    )}
                    {itemHoverTooltip.item._type === "plant" && (
                        <>
                            <div className="text-amber-400 font-semibold mt-1 tabular-nums">
                                {(itemHoverTooltip.item.sellValue || 0).toLocaleString("de-DE")} Gold
                            </div>
                            {itemHoverTooltip.item.size !== undefined && (
                                <div className="text-slate-400 text-[11px]">Größe {itemHoverTooltip.item.size} / 50</div>
                            )}
                            {getSpecialLabel(itemHoverTooltip.item.specialData) && (
                                <div className="text-fuchsia-400 text-[11px]">{getSpecialLabel(itemHoverTooltip.item.specialData)}</div>
                            )}
                            {/* Alle Wetter des Stücks; der Aufschlag ist ihr Produkt. */}
                            {wetterListe(itemHoverTooltip.item).length > 0 && (
                                <div className="text-sky-400 text-[11px]">
                                    {wetterListe(itemHoverTooltip.item)
                                        .map((e) => getStatusEffectLabel(e) || e).join(" · ")}
                                    {" · +"}
                                    {Math.round((wetterBoost(itemHoverTooltip.item) - 1) * 100)}
                                    {" % Verkauf"}
                                </div>
                            )}
                        </>
                    )}
                    {itemHoverTooltip.item._type === "pet" && itemHoverTooltip.item.ability && (
                        <div className="mt-1.5 pt-1.5 border-t border-slate-800">
                            <div className="text-slate-200 text-[11px] font-medium">
                                {/* Alle drei Fähigkeiten aus der gemeinsamen Tabelle — der
                                    Zweig kannte den Erntehelfer gar nicht und hat ihn als
                                    „Samenfinder" beschriftet. */}
                                {PET_ABILITY_LABELS[itemHoverTooltip.item.ability.type] || "Fähigkeit"}
                                {" · Stufe "}{itemHoverTooltip.item.ability.level}
                            </div>
                            <div className="text-[10px] text-slate-500 mt-0.5">
                                Platzieren und anklicken für Details.
                            </div>
                        </div>
                    )}
                </div>
            )}

            {isTrashOpen && (
                <GardenModal
                    title="Mülleimer"
                    subtitle="Endgültig wegwerfen — das lässt sich nicht rückgängig machen"
                    onClose={() => setTrashOpen(false)}
                    width="max-w-lg"
                    headerRight={
                        <button
                            type="button"
                            onClick={() => { setTrashOpen(false); setEditorAktiv(true); setVerschiebtGebaeude("trash"); }}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 text-xs font-medium transition-colors"
                        >
                            <Move size={13} /> Umstellen
                        </button>
                    }
                >
                    {/* Samen: gleiche Sorten stehen als eine Zeile mit Anzahl da. Wer 40
                        Löwenzahn loswerden will, klickt sonst 40-mal. */}
                    <div className="mb-4">
                        <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1.5">Samen</div>
                        {inventory.length === 0 ? (
                            <p className="text-[11px] text-slate-600 px-3 py-2.5 rounded-md border border-slate-800 bg-slate-950">
                                Keine Samen im Rucksack.
                            </p>
                        ) : (
                            <div className="space-y-1.5">
                                {(() => {
                                    const gruppen = new Map();
                                    for (const s of inventory) {
                                        if (!s?.instanceId) continue;
                                        const key = `${s.seedId}|${s.rarity}`;
                                        const g = gruppen.get(key);
                                        if (g) g.ids.push(s.instanceId);
                                        else gruppen.set(key, { key, seed: s, ids: [s.instanceId] });
                                    }
                                    const wirfWeg = (ids, label) => {
                                        const weg = new Set(ids);
                                        setInventory((prev) => prev.filter((s) => !weg.has(s?.instanceId)));
                                        setSelectedSeed((prev) => (prev && weg.has(prev.instanceId) ? null : prev));
                                        notify(label);
                                        debouncedSave();
                                    };
                                    return [...gruppen.values()].map((g) => (
                                        <div
                                            key={g.key}
                                            className="p-3 rounded-md border border-slate-800 bg-slate-900/60 flex items-center gap-3"
                                        >
                                            <ItemIcon item={g.seed} className="w-9 h-9 shrink-0" emojiClassName="text-2xl" />
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-medium text-white truncate">
                                                    {g.seed.name}
                                                    {g.ids.length > 1 && (
                                                        <span className="text-slate-500 tabular-nums font-normal"> × {g.ids.length}</span>
                                                    )}
                                                </div>
                                                <RarityLabel rarity={g.seed.rarity} />
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => wirfWeg([g.ids[0]], `${g.seed.name} weggeworfen.`)}
                                                className="shrink-0 px-2.5 py-2 rounded-md border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 text-xs font-semibold transition-colors"
                                            >
                                                Einen
                                            </button>
                                            {g.ids.length > 1 && (
                                                <button
                                                    type="button"
                                                    onClick={() => wirfWeg(g.ids, `${g.ids.length}× ${g.seed.name} weggeworfen.`)}
                                                    className="shrink-0 px-3 py-2 rounded-md border border-rose-800 text-rose-300 hover:text-white hover:bg-rose-900/40 text-xs font-semibold transition-colors inline-flex items-center gap-1.5"
                                                >
                                                    <Trash2 size={13} /> Alle {g.ids.length}
                                                </button>
                                            )}
                                        </div>
                                    ));
                                })()}
                            </div>
                        )}
                    </div>

                    <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1.5">Deko</div>
                    {decoInventory.length === 0 ? (
                        <p className="text-[11px] text-slate-600 px-3 py-2.5 rounded-md border border-slate-800 bg-slate-950">
                            Keine Deko im Inventar.
                        </p>
                    ) : (
                        <div className="space-y-1.5">
                            {decoInventory.map((deco) => (
                                <div
                                    key={deco.instanceId || deco.id}
                                    className="p-3 rounded-md border border-slate-800 bg-slate-900/60 flex items-center gap-3"
                                >
                                    <ItemIcon item={deco} className="w-9 h-9 shrink-0" emojiClassName="text-2xl" />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium text-white truncate">{deco.name}</div>
                                        <RarityLabel rarity={deco.rarity} />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const ziel = deco.instanceId || deco.id;
                                            setDecoInventory((prev) => prev.filter((d) => (d.instanceId || d.id) !== ziel));
                                            if ((selectedDecoToPlace?.instanceId || selectedDecoToPlace?.id) === ziel) {
                                                setSelectedDecoToPlace(null);
                                            }
                                            notify(`${deco.name} weggeworfen.`);
                                            debouncedSave();
                                        }}
                                        className="shrink-0 px-3 py-2 rounded-md border border-rose-800 text-rose-300 hover:text-white hover:bg-rose-900/40 text-xs font-semibold transition-colors inline-flex items-center gap-1.5"
                                    >
                                        <Trash2 size={13} /> Wegwerfen
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </GardenModal>
            )}

            {ablageOffen && (
                <AblageModal
                    art={ablageOffen}
                    inhalt={ablageOffen === "chest" ? chestItems : vitrineItems}
                    // Die Vitrine bleibt bei der Ernte — ihr Inhalt geht als
                    // Momentaufnahme an alle und ist auf Frucht-Felder zugeschnitten.
                    rucksack={ablageOffen === "chest"
                        ? { ernte: harvestedItems, samen: inventory, eier: eggInventory, deko: decoInventory, tiere: petInventory }
                        : { ernte: harvestedItems }}
                    max={ablageOffen === "chest" ? KISTE_MAX : VITRINE_MAX}
                    busy={ablageBusy}
                    onClose={() => setAblageOffen(null)}
                    onEinlagern={(id) => handleAblage(ablageOffen, id, "ein")}
                    onAuslagern={(id) => handleAblage(ablageOffen, id, "aus")}
                    onAllesEin={() => handleAblage(ablageOffen, null, "ein")}
                    onAllesAus={() => handleAblage(ablageOffen, null, "aus")}
                    onUmstellen={() => { const art = ablageOffen; setAblageOffen(null); setEditorAktiv(true); setVerschiebtGebaeude(art); }}
                />
            )}

            {fremdeVitrine && (
                <FremdeVitrineModal
                    owner={fremdeVitrine.owner}
                    items={fremdeVitrine.items}
                    onClose={() => setFremdeVitrine(null)}
                />
            )}

            {isLogbuchOpen && (
                <LogbuchModal logbuch={logbuch} onClose={() => setLogbuchOpen(false)} />
            )}

            {isMailboxOpen && (
                <MailboxModal
                    mailbox={mailbox}
                    onClose={() => setMailboxOpen(false)}
                    onClaim={handleClaimMail}
                    onSend={handleSendMail}
                    seedInventory={inventory}
                    harvestInventory={harvestedItems}
                    petInventory={petInventory}
                    busy={mailBusy}
                    mode={mailboxMode}
                    recipient={mailboxRecipient}
                />
            )}

            {worldFull && (
                <div className={`absolute top-16 left-1/2 -translate-x-1/2 z-40 ${HUD_SURFACE} px-4 py-3 flex flex-col items-center gap-2 max-w-sm text-center`}>
                    <span className="text-xs text-amber-300">
                        Diese Welt ist voll — du kannst zusehen, aber nicht farmen.
                    </span>
                    <button
                        type="button"
                        onClick={async () => { await flushFarmStateToServer(); setShowLobbyScreen(true); }}
                        className="px-3 py-1.5 rounded-md bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold transition-colors"
                    >
                        Zurück zur Weltauswahl
                    </button>
                </div>
            )}

            {inspectedPet && (
                <PetDetailModal
                    pet={inspectedPet}
                    onClose={() => setInspectedPet(null)}
                    onStow={handleStowInspectedPet}
                    onSell={handleSellInspectedPet}
                    onRename={handleRenamePet}
                />
            )}

            {/* ── Deko-Leiste des Editors ─────────────────────────────────────
                Der ganze Deko-Bestand auf einen Blick, direkt über der Schnellleiste.
                Vorher führte der Weg zu jedem Stück durch das Inventar-Fenster —
                beim Einrichten öffnet und schliesst man das sonst dutzendfach. */}
            {editorAktiv && (
                <div className={`absolute bottom-24 left-1/2 -translate-x-1/2 max-w-[min(56rem,92vw)] ${HUD_SURFACE} p-2`}>
                    <div className="flex items-center gap-2 mb-1.5 px-1">
                        <LayoutGrid size={12} className="text-violet-400 shrink-0" />
                        <span className="text-[10px] uppercase tracking-wider text-slate-400">
                            Einrichten — Klick wählt, Klick aufs Grundstück setzt ab,
                            {" "}<kbd className="bg-slate-800 border border-slate-700 px-1 rounded-sm">R</kbd> spiegelt,
                            {" "}Klick auf gesetzte Deko packt sie ein
                        </span>
                        <span className="ml-auto text-[10px] text-slate-500 tabular-nums">
                            {decoInventory.length} vorrätig · {decoPlacements.filter((d) => d.slotIndex === mySlotIndex).length} aufgestellt
                        </span>
                    </div>
                    {decoInventory.length === 0 ? (
                        <div className="px-2 py-3 text-xs text-slate-500">
                            Keine Deko im Vorrat — im Deko-Shop gibt es Nachschub.
                        </div>
                    ) : (
                        <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto" style={{ overscrollBehavior: "contain" }}>
                            {decoInventory.map((deko) => {
                                const key = deko.instanceId || deko.id;
                                const gewaehlt = (selectedDecoToPlace?.instanceId || selectedDecoToPlace?.id) === key;
                                return (
                                    <button
                                        key={key}
                                        type="button"
                                        title={deko.name}
                                        onClick={() => {
                                            setSelectedDecoToPlace(gewaehlt ? null : { ...deko, _type: "deco" });
                                            setSelectedTool(null);
                                            setSelectedSeed(null);
                                            setSelectedCarryItem(null);
                                            setSelectedPetToPlace(null);
                                        }}
                                        className={`w-12 h-12 rounded-sm border flex items-center justify-center transition-colors ${
                                            gewaehlt
                                                ? "border-violet-500 bg-violet-600/20"
                                                : "border-slate-800 bg-slate-900/60 hover:border-slate-600"
                                        }`}
                                    >
                                        <ItemIcon item={deko} className="w-9 h-9" emojiClassName="text-2xl" />
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* ── Hotbar ──────────────────────────────────────────────────── */}
            <div className={`absolute bottom-5 left-1/2 -translate-x-1/2 flex gap-1.5 p-2 ${HUD_SURFACE}`}>
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

                    const itemSpecial = itemSpecialName(item);
                    const specialRingClass = itemSpecial === "Golden"
                        ? "border-amber-500"
                        : itemSpecial === "Rainbow"
                        ? "border-fuchsia-500"
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
                                if (!hatTooltip(item)) return;
                                // 1. ANPASSUNG: Direkt e.clientX nutzen (ohne Abzug), passend zum 'fixed' Tooltip
                                setItemHoverTooltip({ item, x: e.clientX, y: e.clientY });
                            }}
                            onMouseMove={(e) => {
                                if (!hatTooltip(item)) return;
                                setItemHoverTooltip((prev) => prev ? { ...prev, x: e.clientX, y: e.clientY } : { item, x: e.clientX, y: e.clientY });
                            }}
                            onMouseLeave={() => setItemHoverTooltip(null)}
                            className={`relative w-[50px] h-[50px] bg-slate-800/70 rounded-md border flex items-center justify-center transition-colors cursor-pointer group
                            ${item ? "border-slate-700 hover:border-slate-500" : "border-slate-800"}
                            ${isHeldItem ? "border-violet-500 bg-slate-800" : specialRingClass}`}>
                            <span className="absolute top-0.5 left-1 text-[9px] font-medium text-slate-600 tabular-nums">{i + 1}</span>
                            {item && (
                                <SpecialItemIcon item={item} special={itemSpecial} className="w-8 h-8" emojiClassName="text-2xl" />
                            )}
                            {isHeldItem && (
                                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-violet-500" />
                            )}
                        </div>
                    );
                })}
            </div>
            {currentInteractable && !activeShop && !isBackpackOpen && !isMarketOpen && !isIncubatorOpen && !isMailboxOpen && !isTrashOpen && (
                <button
                    type="button"
                    onClick={(e) => {
                        e.currentTarget.blur();
                        activateInteractable(currentInteractable);
                    }}
                    className="absolute bottom-32 left-1/2 -translate-x-1/2 z-40 px-5 py-2.5 rounded-md border border-violet-500 bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors flex items-center gap-2"
                >
                    {currentInteractable.label} öffnen
                    {/* Am eigenen Kasten direkt sehen, ob etwas drin liegt */}
                    {currentInteractable.type === "mailbox" && currentInteractable.isOwn && mailbox.length > 0 && (
                        <span className="px-1.5 rounded-sm bg-white/20 text-[10px] font-semibold tabular-nums">
                            {mailbox.length}
                        </span>
                    )}
                    <kbd className="bg-violet-800/70 border border-violet-400/50 px-1.5 rounded-sm text-[10px] font-medium">E</kbd>
                </button>
            )}

            {/* ── Bottom-Right: Inventory ──────────────────────────────────── */}
            {/* Inventar und Schnellreise sind die Knöpfe, die man am häufigsten
                trifft — eine Stufe größer als der Rest des HUD. */}
            <button
                type="button"
                onClick={() => setBackpackOpen(true)}
                className={`absolute bottom-5 right-5 px-4 py-3 ${HUD_SURFACE} text-slate-200 hover:text-white transition-colors flex items-center gap-2.5 text-sm font-medium`}
            >
                <Backpack size={18} /> Inventar
            </button>

            {/* Fähigkeiten. Der Punkt-Zähler sitzt am Knopf, damit ein freier Punkt
                nicht wochenlang unbemerkt herumliegt. */}
            <button
                type="button"
                onClick={(e) => { e.currentTarget.blur(); setSkillsOffen(true); }}
                title="Fähigkeiten"
                className={`absolute bottom-[4.75rem] right-5 px-4 py-3 ${HUD_SURFACE} text-slate-200 hover:text-white transition-colors flex items-center gap-2.5 text-sm font-medium`}
            >
                <Trophy size={18} />
                Level {skillStand?.level || 1}
                {(skillStand?.punkteOffen || 0) > 0 && (
                    <span className="rounded-sm bg-violet-600 px-1.5 text-[10px] font-semibold tabular-nums text-white">
                        {skillStand.punkteOffen}
                    </span>
                )}
            </button>

            {/* ── Bottom-Left: Schnellreise ────────────────────────────────── */}
            <div className="absolute bottom-5 left-5 flex flex-col gap-2">
                {[
                    { label: "Verkauf-Areal", icon: Store, action: teleportToMarketArea },
                    { label: "Shop-Areal", icon: ShoppingCart, action: teleportToShopArea },
                    { label: "Meine Farm", icon: Home, action: teleportToMyFarm },
                ].map(({ label, icon: Icon, action }) => (
                    <button
                        key={label}
                        type="button"
                        onClick={(e) => { e.currentTarget.blur(); action(); }}
                        className={`px-4 py-3 ${HUD_SURFACE} text-slate-200 hover:text-white transition-colors flex items-center gap-2.5 text-sm font-medium`}
                    >
                        <Icon size={18} /> {label}
                    </button>
                ))}
            </div>

            {/* ═══════════════════════════════════════════════════════════════
                MODAL: SHOP
            ═══════════════════════════════════════════════════════════════ */}
            {activeShop === "seed" && (
                <GardenModal
                    title="Samen-Shop"
                    subtitle={`Nächste Rotation in ${formatCountdown(shopMins, shopSecs)}`}
                    onClose={() => setActiveShop(null)}
                    headerRight={<GoldTag gold={gold} />}
                >
                    <div className="h-1 bg-slate-800 rounded-sm mb-4 overflow-hidden">
                        <div
                            className="h-full bg-violet-500 transition-[width]"
                            style={{ width: `${(shopCountdown / SHOP_ROTATION_MS) * 100}%` }}
                        />
                    </div>

                    <TabBar
                        active={shopFilter}
                        onSelect={setShopFilter}
                        tabs={[
                            { key: "available", label: "Im Angebot", count: shopRotation?.seeds.filter(s => s.active).length ?? 0 },
                            { key: "all", label: "Gesamter Katalog", count: shopRotation?.seeds.length ?? 0 },
                        ]}
                    />

                    <SortierLeiste
                        wert={shopSortierung}
                        setzen={setShopSortierung}
                        optionen={SHOP_SORTIERUNGEN}
                    />

                    <div className="space-y-1.5">
                        {visibleShopSeeds.map(seed => (
                            <ShopSeedCard
                                key={seed.seedId}
                                seed={seed}
                                stock={personalShopStock[seed.seedId] ?? (seed.active ? (seed.stockPerPlayer ?? 0) : 0)}
                                canAfford={gold >= seed.shopPrice}
                                rucksackVoll={rucksackVoll}
                                onBuy={handleBuySeed}
                            />
                        ))}
                        {(!shopRotation?.seeds || shopRotation.seeds.length === 0) && (
                            <div className="text-slate-500 text-sm text-center py-8">Shop wird geladen…</div>
                        )}
                    </div>
                </GardenModal>
            )}
            {activeShop === "tool" && (
                <GardenModal
                    title="Werkzeug-Shop"
                    subtitle={`Neue Lieferung in ${formatCountdown(toolMins, toolSecs)}`}
                    onClose={() => setActiveShop(null)}
                    headerRight={<GoldTag gold={gold} />}
                >
                    <div className="h-1 bg-slate-800 rounded-sm mb-4 overflow-hidden">
                        <div
                            className="h-full bg-violet-500 transition-[width]"
                            style={{ width: `${(toolShopCountdown / TOOL_EGG_ROTATION_MS) * 100}%` }}
                        />
                    </div>
                    <div className="space-y-1.5">
                        {(toolShopRotation?.items || []).map(tool => {
                            const toolInv = normalizeToolInventory(toolInventory);
                            // Muss zur Rechnung in handleBuyTool passen — sonst zeigt der
                            // Laden einen anderen Preis an, als die Kasse abbucht.
                            const hackenRabatt = 1 - Math.min(0.6, skillWirkung("bergbau"));
                            const hackenPreis = (n) => Math.max(1, Math.floor(getPickaxePrice(n) * hackenRabatt));
                            const price = tool.id === "backpack_upgrade"
                                ? getBackpackUpgradePrice(toolInv.backpackLevel || 0)
                                : tool.id === "pickaxe"
                                ? hackenPreis(toolInv.pickaxesBought || 0)
                                : tool.price;
                            // Kiste und Vitrine stehen einmal auf dem Grundstück —
                            // danach gilt derselbe „schon vorhanden"-Zustand wie bei
                            // der Schaufel, sonst bliebe der Kauf-Knopf aktiv.
                            const isPermanentOwned = (tool.id === "shovel" && toolInv.hasShovel)
                                || (tool.id === "chest" && toolInv.hasChest)
                                || (tool.id === "vitrine" && toolInv.hasVitrine)
                                // Voll ausgebauter Rucksack: der Knopf blieb aktiv und
                                // hat weiter Gold gekostet, ohne Plätze zu geben.
                                || (tool.id === "backpack_upgrade" && (toolInv.backpackLevel || 0) >= BACKPACK_MAX_LEVEL);
                            // Die Spitzhacke ist bewusst NICHT mehr dabei: sie ist immer
                            // vorrätig, gebremst allein durch ihren steigenden Preis.
                            const hasRotationStock = tool.type === "single";
                            const singleStock = hasRotationStock ? (toolShopStock[tool.id] ?? 0) : null;
                            const canBuy = gold >= price && !isPermanentOwned && (!hasRotationStock || (singleStock ?? 0) > 0);
                            const description = {
                                pickaxe: `4 Nutzungen pro Kauf · immer vorrätig · nächster Kauf ${formatGold(hackenPreis((toolInv.pickaxesBought || 0) + 1))}`,
                                shovel: "Dauerhaft · entfernt Pflanzen restlos",
                                plant_pot: "Einmalig · versetzt eine Pflanze",
                                backpack_upgrade: (toolInv.backpackLevel || 0) >= BACKPACK_MAX_LEVEL
                                    ? `Voll ausgebaut · ${50 + BACKPACK_MAX_LEVEL * 10} Plätze`
                                    : `Stufe ${toolInv.backpackLevel || 0} von ${BACKPACK_MAX_LEVEL} · +10 Plätze pro Upgrade`,
                                watering_can: "Einmalig · verkürzt die Restzeit um ein Viertel",
                                chest: `Dauerhaft · ${KISTE_MAX} Plätze für Ernte, ohne Rucksack zu belegen`,
                                vitrine: `Dauerhaft · ${VITRINE_MAX} Schauplätze, für alle in der Welt sichtbar`,
                            }[tool.id] || "";
                            return (
                                <div
                                    key={tool.id}
                                    className={`p-3 rounded-md border bg-slate-900/50 flex items-center gap-3 transition-colors ${
                                        canBuy ? "border-slate-800 hover:border-violet-500" : "border-slate-800"
                                    }`}
                                >
                                    <ItemIcon item={{ ...tool, image: getToolImage(tool.id) }} className="w-9 h-9 shrink-0" emojiClassName="text-2xl" />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium text-white">{tool.name}</div>
                                        <div className="text-[11px] text-slate-500 mt-0.5">{description}</div>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <div className="text-sm font-semibold text-amber-400 tabular-nums">{formatGold(price)}</div>
                                        {hasRotationStock && (
                                            <div className="text-[11px] text-slate-500">{singleStock ?? 0} auf Lager</div>
                                        )}
                                    </div>
                                    <PrimaryButton onClick={() => handleBuyTool(tool)} disabled={!canBuy} className="shrink-0">
                                        {isPermanentOwned ? "Im Besitz" : "Kaufen"}
                                    </PrimaryButton>
                                </div>
                            );
                        })}
                    </div>
                </GardenModal>
            )}
            {activeShop === "egg" && (
                <GardenModal
                    title="Eier-Shop"
                    subtitle={`Neues Angebot in ${formatCountdown(eggMins, eggSecs)}`}
                    onClose={() => setActiveShop(null)}
                    headerRight={<GoldTag gold={gold} />}
                >
                    <div className="h-1 bg-slate-800 rounded-sm mb-4 overflow-hidden">
                        <div
                            className="h-full bg-violet-500 transition-[width]"
                            style={{ width: `${(eggShopCountdown / TOOL_EGG_ROTATION_MS) * 100}%` }}
                        />
                    </div>
                    <div className="space-y-1.5">
                        {EGG_SHOP_CATALOGUE.map(egg => {
                            const stock = eggShopStock[egg.id] ?? 0;
                            const available = stock > 0;
                            return (
                                <div
                                    key={egg.id}
                                    className={`p-3 rounded-md border flex items-center gap-3 ${
                                        available
                                            ? `border-slate-700 bg-slate-900/60 ${gold >= egg.price && stock > 0 ? "hover:border-violet-500" : ""}`
                                            : "border-slate-800 bg-slate-900/40 opacity-50"
                                    }`}
                                >
                                    <ItemIcon item={egg} className="w-10 h-10 shrink-0" emojiClassName="text-2xl" />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-medium text-white">{egg.name}</span>
                                            <RarityLabel rarity={egg.rarity} />
                                        </div>
                                        <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                                            {egg.hatchTable.map(h => `${h.type} ${h.chance} %`).join(" · ")}
                                        </div>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <div className="text-sm font-semibold text-amber-400 tabular-nums">{formatGold(egg.price)}</div>
                                        <div className="text-[11px] text-slate-500">{stock} auf Lager</div>
                                    </div>
                                    <PrimaryButton
                                        onClick={() => handleBuyEgg(egg)}
                                        disabled={gold < egg.price || stock <= 0}
                                        className="shrink-0"
                                    >
                                        Kaufen
                                    </PrimaryButton>
                                </div>
                            );
                        })}
                        {Object.values(eggShopStock).every(v => (v || 0) <= 0) && (
                            <div className="text-slate-500 text-sm text-center py-8">Diese Rotation führt keine Eier.</div>
                        )}
                    </div>
                </GardenModal>
            )}
            {activeShop === "deco" && (
                <GardenModal
                    title="Deko-Shop"
                    subtitle="Platzierbar auf den Grasflächen deiner Farm — beim Setzen mit R drehbar"
                    onClose={() => setActiveShop(null)}
                    headerRight={<GoldTag gold={gold} />}
                >
                    <div className="grid grid-cols-2 gap-1.5">
                        {DECO_SHOP_ITEMS.map((deco) => {
                            const canBuy = gold >= deco.price;
                            return (
                                <div
                                    key={deco.id}
                                    className={`p-3 rounded-md border bg-slate-900/50 flex items-center gap-3 transition-colors ${
                                        canBuy ? "border-slate-800 hover:border-violet-500" : "border-slate-800"
                                    }`}
                                >
                                    <ItemIcon item={deco} className="w-10 h-10 shrink-0" emojiClassName="text-2xl" />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium text-white truncate">{deco.name}</div>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <RarityLabel rarity={deco.rarity} />
                                            <span className="text-[11px] text-slate-500">{deco.width}×{deco.height}</span>
                                        </div>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <div className="text-sm font-semibold text-amber-400 tabular-nums mb-1">{formatGold(deco.price)}</div>
                                        <PrimaryButton onClick={() => handleBuyDeco(deco)} disabled={!canBuy}>
                                            Kaufen
                                        </PrimaryButton>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </GardenModal>
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
                // Slot cap applies only to seeds + harvested plants (the expandable main inventory)
                const slottedItems = inventory.length + harvestedItems.length;
                const backpackFilters = ["all", "seed", "plant", "egg", "pet", "deco", "tool"];
                const filterLabels = { all: "Alle", seed: "Samen", plant: "Ernte", egg: "Eier", pet: "Tiere", deco: "Deko", tool: "Werkzeug" };
                const activeFilter = inventoryFilter || "all";
                const gefiltert = activeFilter === "all" ? allItems : allItems.filter(i => i._type === activeFilter);
                const displayed = sortiere(gefiltert, INVENTAR_SORTIERUNGEN, inventarSortierung);
                const fillRatio = inventoryMaxSlots > 0 ? slottedItems / inventoryMaxSlots : 0;
                // Was die Ernte im Rucksack einbringt — dieselbe Angabe wie in der
                // Kiste, damit man nicht erst zum Markt laufen muss, um es zu sehen.
                const lagerwert = harvestedItems.reduce((s, i) => s + (Number(i?.sellValue) || 0), 0);
                return (
                <GardenModal
                    title="Inventar"
                    subtitle="Deko, Tiere und Werkzeug belegen keine Slots"
                    onClose={() => { setItemHoverTooltip(null); setBackpackOpen(false); }}
                    headerRight={
                        <div className="flex items-center gap-3">
                            {lagerwert > 0 && (
                                <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-400 tabular-nums whitespace-nowrap">
                                    <Coins size={13} />
                                    {formatGold(lagerwert)}
                                </span>
                            )}
                            <div className="flex items-center gap-2 w-40">
                                <div className="flex-1 h-1.5 rounded-sm bg-slate-800 overflow-hidden">
                                    <div
                                        className={`h-full transition-[width] duration-300 ${
                                            fillRatio >= 1 ? "bg-rose-500" : fillRatio >= 0.75 ? "bg-amber-500" : "bg-emerald-500"
                                        }`}
                                        style={{ width: `${Math.min(100, fillRatio * 100)}%` }}
                                    />
                                </div>
                                <span className={`text-[11px] tabular-nums whitespace-nowrap ${fillRatio >= 1 ? "text-rose-400" : "text-slate-400"}`}>
                                    {slottedItems}/{inventoryMaxSlots}
                                </span>
                            </div>
                        </div>
                    }
                >
                        <TabBar
                            active={activeFilter}
                            onSelect={setInventoryFilter}
                            tabs={backpackFilters.map((f) => ({
                                key: f,
                                label: filterLabels[f],
                                icon: categoryIcon(f),
                                count: f === "all" ? allItems.length : allItems.filter(i => i._type === f).length,
                            }))}
                        />
                        <SortierLeiste
                            wert={inventarSortierung}
                            setzen={setInventarSortierung}
                            optionen={INVENTAR_SORTIERUNGEN}
                        />

                        {/* Grid */}
                        <div>
                            {displayed.length === 0 ? (
                                <div className="text-slate-600 text-sm text-center py-12">Nichts in dieser Kategorie</div>
                            ) : (
                                <div className="grid grid-cols-8 gap-1.5">
                                    {displayed.map((item, idx) => {
                                        const isSeed = item._type === "seed";
                                        const isPlant = item._type === "plant";
                                        const isTool = item._type === "tool";
                                        const isPet = item._type === "pet";
                                        const isDeco = item._type === "deco";
                                        const sp = itemSpecialName(item);
                                        const spClass = sp === "Golden"
                                            ? "border-amber-500"
                                            : sp === "Rainbow"
                                            ? "border-fuchsia-500"
                                            : (RARITY_BORDER[item.rarity] || RARITY_BORDER.COMMON);
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
                                                className={`group relative aspect-square rounded-md border flex items-center justify-center transition-colors bg-slate-800/60 ${spClass} ${(isSeed || isPlant || isPet || isDeco) ? "cursor-pointer hover:bg-slate-700/70" : "cursor-default"}`}>
                                                <SpecialItemIcon item={item} special={sp} className="w-9 h-9" emojiClassName="text-2xl" />
                                                {/* Tiere tragen Namen — bei mehreren Hühnern war sonst nur am
                                                    Hovern zu erkennen, welches Chicky und welches Berta ist.
                                                    Der Seltenheitspunkt rückt dafür nach oben. */}
                                                {isPet && (
                                                    <span className="absolute inset-x-0 bottom-0 px-1 py-0.5 text-[8px] leading-tight text-center text-slate-200 truncate bg-slate-950/85 rounded-b-md">
                                                        {item.customName || item.name}
                                                    </span>
                                                )}
                                                <span className={`absolute ${isPet ? "top-0.5" : "bottom-0.5"} right-0.5 w-1.5 h-1.5 rounded-full ${RARITY_DOT[item.rarity] || RARITY_DOT.COMMON}`} />
                                                {isTool && item.amount !== undefined && (
                                                    <span className="absolute bottom-0.5 left-1 text-[9px] text-slate-300 tabular-nums">{item.amount}</span>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                </GardenModal>
                );
            })()}
            {isMarketOpen && (
                <GardenModal
                    title="Marktstand"
                    onClose={() => setMarketOpen(false)}
                    width="max-w-md"
                    headerRight={<GoldTag gold={gold} />}
                    footer={
                        <PrimaryButton
                            onClick={handleSellAllHarvested}
                            disabled={harvestedItems.length === 0}
                            className="w-full py-2.5"
                        >
                            Alles verkaufen
                        </PrimaryButton>
                    }
                >
                    {harvestedItems.length === 0 ? (
                        <div className="text-slate-500 text-sm py-8 text-center">Nichts zum Verkaufen im Lager.</div>
                    ) : (
                        <div className="rounded-md border border-slate-800 bg-slate-950/50 px-3 py-2">
                            <div className="flex items-center justify-between py-1 text-xs">
                                <span className="text-slate-400">Erntestücke im Lager</span>
                                <span className="text-white font-semibold tabular-nums">{harvestedItems.length}</span>
                            </div>
                            <div className="flex items-center justify-between py-1 text-xs">
                                <span className="text-slate-400">Gesamtwert</span>
                                <span className="text-amber-400 font-semibold tabular-nums">
                                    {harvestedItems.reduce((sum, item) => sum + item.sellValue, 0).toLocaleString('de-DE')} Gold
                                </span>
                            </div>
                            {isSubscriber && (
                                <div className="flex items-center justify-between py-1 text-xs border-t border-slate-800 mt-1 pt-2">
                                    <span className="text-slate-400">Sub-Bonus</span>
                                    <span className="text-emerald-400 font-semibold">+50 %</span>
                                </div>
                            )}
                        </div>
                    )}
                </GardenModal>
            )}
            {isIncubatorOpen && (
                <GardenModal
                    title="Inkubator"
                    subtitle="Eier einlegen, ausbrüten, Tier auf der Farm platzieren"
                    onClose={() => { setIncubatorTargetSlot(null); setIncubatorOpen(false); }}
                    width="max-w-4xl"
                    headerRight={
                        <span className="flex items-center gap-3">
                            <span className="text-xs text-slate-400 tabular-nums">{eggInventory.length} Eier im Inventar</span>
                            <button
                                type="button"
                                onClick={() => {
                                    setIncubatorTargetSlot(null);
                                    setIncubatorOpen(false);
                                    setEditorAktiv(true);
                                    setVerschiebtGebaeude("incubator");
                                }}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 text-xs font-medium transition-colors"
                            >
                                <Move size={13} /> Umstellen
                            </button>
                        </span>
                    }
                >
                        <div className="grid grid-cols-5 gap-2">
                            {Array(5).fill(null).map((_, idx) => {
                                const unlocked = idx < incubator.unlockedSlots;
                                const slot = incubator.slots[idx];
                                const unlockCost = INCUBATOR_UNLOCK_COSTS[idx - 1];
                                return (
                                    <div key={idx}
                                        className={`rounded-md border p-3 flex flex-col min-h-[210px] ${unlocked ? "border-slate-700 bg-slate-900/60" : "border-slate-800 bg-slate-900/30"}`}
                                    >
                                        <div className="text-[10px] text-center mb-1.5 text-slate-500 tabular-nums">Platz {idx + 1}</div>
                                        {!unlocked && (
                                            <div className="flex flex-col items-center justify-center flex-1 gap-2">
                                                <Lock size={18} className="text-slate-600" />
                                                <div className="text-[11px] text-slate-400 tabular-nums">{formatGold(unlockCost)}</div>
                                                <PrimaryButton onClick={unlockIncubatorSlot} disabled={gold < unlockCost} className="px-2 py-1">
                                                    Freischalten
                                                </PrimaryButton>
                                            </div>
                                        )}
                                        {unlocked && !slot && (
                                            <>
                                                <div className="flex-1 flex items-center justify-center border border-dashed border-slate-700 rounded-md">
                                                    <Package size={22} className="text-slate-700" />
                                                </div>
                                                <PrimaryButton onClick={() => setIncubatorTargetSlot(idx)} className="mt-2 w-full py-1.5">
                                                    Ei einsetzen
                                                </PrimaryButton>
                                            </>
                                        )}
                                        {unlocked && slot && (() => {
                                            const leftMs = Math.max(0, slot.hatchAt - tickNow);
                                            const isHatching = leftMs > 0;
                                            return (
                                            <>
                                                <div className="flex items-center justify-center">
                                                    {isHatching ? (
                                                        <ItemIcon item={slot.egg} className="w-16 h-16 object-contain rounded-md border border-slate-800 bg-slate-950/60" />
                                                    ) : (
                                                        <img src={slot.hatchResult?.previewImage || buildPetPreviewImage(slot.hatchResult?.type)} alt="" className="w-16 h-16 object-contain rounded-md border border-slate-800 bg-slate-950/60" />
                                                    )}
                                                </div>
                                                {/* Ohne die Absicherung reisst ein Platz ohne `egg` den ganzen
                                                    Spielbildschirm mit — daneben wird `hatchResult` schon so gelesen. */}
                                                <div className="text-center text-xs font-medium text-white mt-1.5 truncate">{slot.egg?.name || "Ei"}</div>
                                                <div className="text-center text-[11px] text-slate-400 mt-0.5 truncate">
                                                    {isHatching ? "Ergebnis unbekannt" : (slot.hatchResult?.type || "Tier")}
                                                </div>
                                                <div className={`text-center text-[11px] mt-1 font-medium tabular-nums ${leftMs > 0 ? "text-slate-400" : "text-emerald-400"}`}>
                                                    {leftMs > 0 ? formatDuration(leftMs) : "Bereit"}
                                                </div>
                                                <PrimaryButton onClick={() => collectHatchedEgg(idx)} disabled={isHatching} className="mt-auto w-full py-1.5">
                                                    Schlüpfen lassen
                                                </PrimaryButton>
                                            </>
                                            );
                                        })()}
                                    </div>
                                );
                            })}
                        </div>
                        {incubatorTargetSlot !== null && (
                            <div className="mt-4 border border-slate-800 rounded-md p-3 bg-slate-950/50">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="text-xs text-slate-300 font-medium">Ei für Platz {incubatorTargetSlot + 1} wählen</div>
                                    <button
                                        type="button"
                                        onClick={() => setIncubatorTargetSlot(null)}
                                        className="text-[11px] text-slate-500 hover:text-white transition-colors"
                                    >
                                        Abbrechen
                                    </button>
                                </div>
                                {eggInventory.length === 0 ? (
                                    <div className="text-[11px] text-slate-500 py-4 text-center">Keine Eier im Inventar.</div>
                                ) : (
                                    <div className="grid grid-cols-6 gap-1.5 max-h-44 overflow-y-auto">
                                        {eggInventory.map((egg) => (
                                            <button
                                                key={egg.instanceId}
                                                type="button"
                                                onClick={() => placeEggInIncubator(incubatorTargetSlot, egg.instanceId)}
                                                className="p-2 rounded-md border border-slate-800 hover:border-slate-600 bg-slate-900 transition-colors text-center flex flex-col items-center gap-1"
                                            >
                                                <ItemIcon item={egg} className="w-8 h-8" emojiClassName="text-xl" />
                                                <div className="text-[10px] text-slate-400 truncate w-full">{egg.name}</div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                        {incubator.unlockedSlots < 5 && (
                            <div className="mt-3 text-[11px] text-slate-500 text-center tabular-nums">
                                Nächster Platz kostet {formatGold(INCUBATOR_UNLOCK_COSTS[incubator.unlockedSlots - 1])} Gold
                            </div>
                        )}
                </GardenModal>
            )}
            <div className={`absolute bottom-5 left-1/2 translate-x-[286px] flex gap-1.5 p-2 ${HUD_SURFACE}`}>
                {[
                    { key: "shovel", label: "Schaufel", hotkey: "1" },
                    { key: "pot", label: "Topf", hotkey: "2" },
                    { key: "pickaxe", label: "Hacke", hotkey: "3" },
                    { key: "watering", label: "Kanne", hotkey: "4" },
                ].map((slot) => {
                    const owned = Boolean(equippedTools[slot.key]);
                    const isActive = selectedTool === slot.key;
                    // Für Werkzeuge gibt es gezeichnete Bilder — die gehören hierhin,
                    // nicht ein generisches Icon.
                    const toolImage = getToolImage(slot.key);
                    return (
                        <button
                            type="button"
                            key={slot.key}
                            title={`${slot.label} — Taste ${slot.hotkey}`}
                            onClick={(e) => {
                                e.currentTarget.blur();
                                if (!owned) return;
                                setSelectedSeed(null);
                                setSelectedPetToPlace(null);
                                setSelectedDecoToPlace(null);
                                setSelectedCarryItem(null);
                                setSelectedTool(prev => (prev === slot.key ? null : slot.key));
                                if (slot.key !== "pot") setMovingPlantSource(null);
                            }}
                            className={`relative w-[50px] h-[50px] rounded-md border flex flex-col items-center justify-center gap-0.5 transition-colors focus:outline-none ${
                                isActive
                                    ? "border-violet-500 bg-slate-800"
                                    : owned
                                        ? "border-slate-700 bg-slate-800/60 hover:border-slate-500 cursor-pointer"
                                        : "border-slate-800 bg-slate-900/40 cursor-default"
                            }`}
                        >
                            <span className="absolute top-0.5 left-1 text-[9px] text-slate-600 tabular-nums">{slot.hotkey}</span>
                            <img
                                src={toolImage}
                                alt=""
                                draggable={false}
                                className={`w-6 h-6 object-contain ${owned ? "" : "opacity-25 grayscale"}`}
                            />
                            <span className={`text-[10px] tabular-nums ${owned ? "text-slate-200" : "text-slate-700"}`}>
                                {owned ? equippedTools[slot.key].name : "0"}
                            </span>
                        </button>
                    );
                })}
            </div>
            {/* 5. ANPASSUNG: Wardrobe Modal - Jetzt mit Preset-Buttons */}
            {isWardrobeOpen && (
                <GardenModal
                    title="Umkleide"
                    subtitle="Weitere Outfits folgen über Drops und den Shop"
                    onClose={() => setWardrobeOpen(false)}
                    width="max-w-md"
                    footer={
                        <PrimaryButton onClick={() => setWardrobeOpen(false)} className="w-full py-2.5">
                            Fertig
                        </PrimaryButton>
                    }
                >
                    <div className="grid grid-cols-4 gap-2">
                        {WARDROBE_SKINS.map(skin => {
                            const isActive = playerAppearance.skin === skin.skin;
                            return (
                                <button
                                    key={skin.id}
                                    type="button"
                                    onClick={() => setPlayerAppearance({ skin: skin.skin })}
                                    className={`p-3 rounded-md border flex flex-col items-center justify-center gap-1.5 transition-colors ${
                                        isActive
                                            ? "border-violet-500 bg-slate-800"
                                            : "border-slate-800 bg-slate-900/50 hover:border-slate-600"
                                    }`}
                                >
                                    <ItemIcon item={{ image: skin.skin }} className="w-12 h-12" emojiClassName="text-2xl" />
                                    <span className={`text-[11px] text-center leading-tight ${isActive ? "text-white" : "text-slate-400"}`}>
                                        {skin.name}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </GardenModal>
            )}
            {/* Changelog Modal. Die Versionsnummer im Untertitel kommt aus den Daten
                statt fest verdrahtet — sonst steht dort nach jeder Fassung wieder eine
                veraltete Nummer (stand zuletzt auf 3.0, während 3.1 schon draußen war). */}
            {isChangelogOpen && (
                <GardenModal
                    title="Changelog"
                    subtitle={`Neu in Version ${(CHANGELOG_ENTRIES[0]?.version || "").replace(/^v/, "")}`}
                    onClose={() => setChangelogOpen(false)}
                    width="max-w-2xl"
                >
                    <div className="space-y-5">
                        {CHANGELOG_ENTRIES.map((release) => (
                            <section key={release.version}>
                                <div className="flex items-baseline gap-2 mb-2 pb-2 border-b border-slate-800">
                                    <h3 className="text-sm font-semibold text-white">{release.version}</h3>
                                    <span className="text-xs text-slate-500">{release.title}</span>
                                </div>
                                {release.groups.map((group) => (
                                    <div key={group.heading} className="mb-3">
                                        <h4 className="text-[11px] uppercase tracking-wider text-slate-500 mb-1.5">
                                            {group.heading}
                                        </h4>
                                        <ul className="space-y-1">
                                            {group.items.map((item, i) => (
                                                <li key={i} className="text-xs text-slate-300 leading-relaxed flex gap-2">
                                                    <span className="text-slate-600 select-none">–</span>
                                                    <span>{item}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ))}
                            </section>
                        ))}
                    </div>
                </GardenModal>
            )}

        </div>
    );
}