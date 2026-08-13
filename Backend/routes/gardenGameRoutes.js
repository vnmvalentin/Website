// routes/gardenGameRoutes.js
// Garden backend: authoritative sync, file-persisted farm states, delta events

const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const { farmStates, setFarmState, scheduleFarmsSave } = require("../garden/store/farms");
const { sendMail, claimMail, getMailbox, checkRateLimit, filtereVerschenkte } = require("../garden/world/mail");
const { notifyPlotChanged, notifyMail } = require("../garden/world/lobby");
const {
    harvestCell, sellAll, spendGold, sellPet, petFind, petErnteVerkauf, istReif, wachstumsBonus,
    ablageEinlagern, ablageAuslagern, ablageAllesEin, ablageAllesAus,
} = require("../garden/core/economy");
const { skillStand, lerneSkill, skillsZuruecksetzen, SKILLS, wirkung } = require("../garden/core/skills");
const { SEED_CATALOGUE } = require("../garden/core/catalogue");
const { MARKE: XP_MARKE, MARKE_KURVE: XP_MARKE_KURVE } = require("../garden/migrations/xp");
const { verrechneOffline } = require("../garden/core/offline");
const {
    MARKE: STEINFELD_MARKE, MARKE_ALT: STEINFELD_MARKE_ALT, MARKE_WEGE: STEINFELD_MARKE_WEGE,
} = require("../garden/migrations/plot");

const ZELL_SCHLUESSEL = /^-?\d+_-?\d+$/;
// Startkapital einer frischen Farm. Muss zum Anfangswert von `gold` in
// Frontend/src/pages/GardenGame/GameContainer.jsx passen — der Browser zeigt ihn
// an, bevor der Server das erste Mal antwortet.
const START_GOLD = 500;
// Wann hat welches Tier zuletzt ausgezahlt? Absichtlich NUR im Speicher: der
// Spielstand kommt beim PUT vom Client, dort wäre der Zeitstempel manipulierbar.
const petFundZeiten = new Map();

/**
 * Zähler gegen verspätete Speicherstände.
 *
 * DAS PROBLEM: Gold, Ernte, Kiste und Vitrine gehören dem Server, Acker, Rucksack
 * und Tierliste dem Browser. Eine Aktion, die aus einer Browser-Liste etwas
 * entfernt und dafür Server-Eigenes gutschreibt, liess sich deshalb doppelt
 * buchen — ein PUT, der schon unterwegs war, stellte die Browser-Seite wieder her,
 * die Gutschrift blieb. Drei Wege waren offen: ernten (Pflanze kam reif zurück),
 * Tier verkaufen (Tier kam zurück) und Einlagern (Stück lag danach zweimal da).
 *
 * DIE LÖSUNG: jede serverseitige Aktion erhöht diesen Zähler. Ein PUT nennt den
 * Stand, den sein Browser zuletzt gesehen hat; passt er nicht, wird er verworfen
 * und der Browser lädt nach. Fehlt die Angabe, gilt 0 — eine unberührte Farm
 * speichert damit weiterhin, eine Farm nach der ersten Aktion nicht mehr.
 */
function erhoeheVersion(state) {
    state.stateVersion = (Number(state.stateVersion) || 0) + 1;
    return state.stateVersion;
}
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
                // Ab dem REIFEZEITPUNKT der Struktur rechnen, nicht ab jetzt. Sonst
                // beginnt der erste Fruchtzyklus erst, wenn der Server das nächste Mal
                // hinsieht: eine Staude, die über Nacht fertig wurde, stand dann noch
                // einen ganzen Zyklus leer da — und beim Browser, der die Umstellung
                // schon zur Reifezeit gemacht hatte, hing die Ernte in "Noch nicht reif".
                const start = Number(p.structureReadyAt) || now;
                p.fruitSlots = Array.from({ length: p.maxFruits || 1 }, () => createFruitSlot(start, cycleMs));
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

/**
 * fruitSlots: `size` leitet sich aus `norm` ab (sizeFromNorm) und wird deshalb
 * nicht gespeichert.
 *
 * ACHTUNG: Alles andere am Fruchtstand MUSS hier durchgereicht werden. Die Funktion
 * hat frueher nur `readyAt` und `norm` behalten — damit verlor jeder Dauertraeger
 * bei jedem Speichern seine Wetter-Effekte und seine goldenen bzw. Regenbogen-
 * Fruechte. Auf dem Acker erschien der Effekt kurz und war nach dem naechsten
 * Autosave wieder weg.
 */
function stripFruitSizeFromPlants(plants) {
    if (!plants || typeof plants !== "object") return {};
    const out = {};
    for (const [key, plant] of Object.entries(plants)) {
        if (!plant) continue;
        const p = { ...plant };
        if (Array.isArray(p.fruitSlots) && p.fruitSlots.length > 0) {
            p.fruitSlots = p.fruitSlots.map((s) => {
                const { size, ...rest } = s || {};
                return rest;
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

const KATALOG_NACH_ID = new Map(SEED_CATALOGUE.map((s) => [s.id, s]));

/** Wetter-Effekte, die der Browser an einem Fruchtstand führen darf. */
const ERLAUBTE_EFFEKTE = new Set(["wet", "frozen", "charged", "moonlit"]);

/**
 * Wetter eines Trägers säubern. Der Browser führt es, deshalb muss der Server
 * wenigstens sicherstellen, dass nur echte Effektnamen ankommen — jeder davon ist
 * ein Verkaufs-Multiplikator (bis ×3), und vier zugleich ergäben ×11,25.
 */
function saubereEffekte(roh) {
    const liste = Array.isArray(roh?.statusEffects)
        ? roh.statusEffects.filter((e) => ERLAUBTE_EFFEKTE.has(e)).slice(0, 4)
        : [];
    const einzeln = ERLAUBTE_EFFEKTE.has(roh?.statusEffect) ? roh.statusEffect : null;
    const bis = Number(roh?.statusEffectUntil);
    return {
        statusEffects: [...new Set(liste)],
        statusEffect: einzeln,
        statusEffectUntil: Number.isFinite(bis) && bis > 0 ? bis : null,
    };
}

/**
 * Fruchtstände von Server und Browser zusammenführen.
 *
 * Reifezeit, Größe und Sonderform gehören dem Server — käme das aus dem PUT,
 * liesse sich eine reife Frucht schlicht behaupten. Die Wetter-Effekte gehören
 * dem Browser, weil sie dort im Minutentakt entstehen (siehe wetterEffektSchritt).
 */
function mischeFruchtstaende(serverSlots, clientSlots) {
    if (!Array.isArray(serverSlots)) return [];
    const vomClient = Array.isArray(clientSlots) ? clientSlots : [];
    return serverSlots.map((slot, i) => {
        if (!slot) return slot;
        const c = vomClient[i];
        if (!c) return slot;
        return { ...slot, ...saubereEffekte(c) };
    });
}

/**
 * Pflanzen aus einem PUT plausibilisieren.
 *
 * DAS PROBLEM: `plotPlants` kam wörtlich aus dem Browser. Ein manipulierter Client
 * konnte damit jede Zelle mit einer bereits reifen Mondblume belegen
 * (`plantedAt: 0, growthMs: 0`), sie über POST /action ernten — der Server zahlt
 * dabei aus dem KATALOG, also echtes Gold — und danach dasselbe PUT erneut
 * schicken. Beliebig oft. Der Kommentar in core/economy.js („durch Katalog und
 * Feldanzahl gedeckelt, es entsteht kein Gold aus dem Nichts") stimmte nur für den
 * Betrag PRO RUNDE, nicht für die Anzahl der Runden.
 *
 * DIE LÖSUNG: Der Acker darf weiterhin dem Browser gehören — welche Zelle bepflanzt
 * ist, entscheidet er. Die ZEITEN entscheidet ab jetzt der Server:
 *   * Zelle war schon bepflanzt und die Art stimmt → Serverzeiten bleiben stehen.
 *   * Zelle ist neu → Wachstumszeit, Größe und Sonderform werden HIER gewürfelt,
 *     ab jetzt laufend. Eine „sofort reife" Pflanze lässt sich damit nicht melden.
 *   * Unbekannte Art oder mehr Zellen als freigelegt → fliegt raus.
 */
function verplausibilisierePflanzen(eingehend, bestehend, unlockedCount, now = Date.now()) {
    if (!eingehend || typeof eingehend !== "object") return {};
    const alt = (bestehend && typeof bestehend.plotPlants === "object" && bestehend.plotPlants) || {};
    const maxZellen = BASE_DIRT_COLS * BASE_DIRT_ROWS + Math.max(0, unlockedCount);
    // Dieselbe Rechnung wie beim Nachwuchs des Gärtners (core/economy.js), damit
    // eine frisch gesetzte Pflanze nicht langsamer wächst als eine nachgewachsene.
    const wachstumsAbzug = wachstumsBonus(bestehend || {});
    const out = {};
    let n = 0;

    for (const [key, roh] of Object.entries(eingehend)) {
        if (n >= maxZellen) break;
        if (!roh || typeof roh !== "object" || !ZELL_SCHLUESSEL.test(key)) continue;
        const profil = KATALOG_NACH_ID.get(roh.seedId);
        if (!profil) continue;

        const vorher = alt[key];
        if (vorher && vorher.seedId === roh.seedId) {
            // Bekannte Pflanze: alles Wertrelevante aus dem SERVER-Stand übernehmen.
            // Der Browser darf Bildpfade, Zellkoordinaten und das Wetter mitbringen —
            // Wetter entsteht in seinem Minutentakt und ist nach oben begrenzt.
            out[key] = {
                ...roh,
                singleUse: vorher.singleUse,
                plantedAt: vorher.plantedAt,
                growthMs: vorher.growthMs,
                stage: vorher.stage,
                norm: vorher.norm,
                specialType: vorher.specialType,
                structureGrowthMs: vorher.structureGrowthMs,
                structureReadyAt: vorher.structureReadyAt,
                fruitCycleMs: vorher.fruitCycleMs,
                maxFruits: vorher.maxFruits,
                harvested: vorher.harvested,
                // Wetter der ganzen Pflanze (Einmalernte) — geputzt, aber vom Browser.
                ...saubereEffekte(roh),
                // Fruchtstände Position für Position zusammenführen: Reifezeit,
                // Größe und Sonderform vom SERVER (sonst liesse sich eine reife
                // Frucht melden), Wetter vom BROWSER — sonst verlöre jeder
                // Dauerträger seine Effekte bei jedem Speichern.
                fruitSlots: mischeFruchtstaende(vorher.fruitSlots, roh.fruitSlots),
            };
        } else {
            // Neu gesetzt: Zeiten hier würfeln, ab jetzt laufend.
            const single = profil.singleUse !== false;
            const roll = Math.random();
            const gemeinsam = {
                seedId: profil.id,
                name: profil.name,
                rarity: profil.rarity,
                emoji: profil.emoji,
                singleUse: single,
                cellX: Number.isInteger(roh.cellX) ? roh.cellX : Number(key.split("_")[0]),
                cellY: Number.isInteger(roh.cellY) ? roh.cellY : Number(key.split("_")[1]),
                plantedAt: now,
                specialType: roll < 0.01 ? "Rainbow" : roll < 0.05 ? "Golden" : null,
                statusEffects: [],
                statusEffect: null,
                statusEffectUntil: null,
            };
            if (single) {
                const spanne = Math.max(0, profil.growMaxSec - profil.growMinSec);
                const ms = 1000 * (profil.growMinSec + Math.random() * spanne);
                out[key] = {
                    ...gemeinsam,
                    stage: "growing",
                    growthMs: Math.max(1000, Math.round(ms * (1 - wachstumsAbzug))),
                    norm: Math.pow(Math.random(), 1.35),
                };
            } else {
                const strukturMs = Math.round(profil.structureGrowSec * 1000 * (1 - wachstumsAbzug));
                out[key] = {
                    ...gemeinsam,
                    stage: "structure",
                    structureGrowthMs: strukturMs,
                    structureReadyAt: now + strukturMs,
                    fruitCycleMs: Math.round(profil.fruitCycleSec * 1000),
                    maxFruits: Math.max(1, Number(profil.maxFruits) || 1),
                    fruitSlots: [],
                    harvested: 0,
                };
            }
        }
        n++;
    }
    return out;
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
        // Gold und harvestedItems gehoeren ab v3.0 dem Server (siehe garden/core/economy.js).
        // Beide werden in der PUT-Route aus dem bestehenden State uebernommen, damit ein
        // manipulierter Client sich weder Gold eintragen noch Ernte erfinden kann.
        gold: 0,
        inventory: sanitizeItemArray(state.inventory),
        plotPlants: stripFruitSizeFromPlants(advancePlantTime(state.plotPlants || {})),
        plotExpansions: Number.isFinite(expansionsNum)
            ? Math.max(0, Math.min(MAX_PLOT_EXPANSIONS, expansionsNum))
            : (plotUnlockedCells.length > 0 ? Math.min(MAX_PLOT_EXPANSIONS, Math.ceil(plotUnlockedCells.length / BASE_DIRT_COLS)) : 0),
        plotUnlockedCells,
        // Ernte, Kiste und Vitrine gehören dem Server — die PUT-Route übernimmt sie
        // aus dem bestehenden Stand, damit ein manipulierter Client sich keine
        // Stücke erfinden kann.
        harvestedItems: [],
        chestItems: [],
        vitrineItems: [],
        // Reines Nachschlagewerk ohne Spielwert (kleinste/größte Größe je Art),
        // deshalb darf es vom Client kommen.
        logbuch: isPlainObject(state.logbuch) ? state.logbuch : {},
        eggInventory: sanitizeItemArray(state.eggInventory),
        petInventory: sanitizeItemArray(state.petInventory),
        petPlacements: sanitizeItemArray(state.petPlacements),
        decoInventory: sanitizeItemArray(state.decoInventory),
        decoPlacements: sanitizeItemArray(state.decoPlacements),
        toolInventory: normalizeToolInventory(state.toolInventory),
        // Obergrenze: 50 Grundplätze + 25 Rucksackstufen à 10 + „Lagerist" 8 × 5.
        // Der Deckel lag bei 200, während backpackLevel unbegrenzt weiterlief —
        // ab Stufe 15 kostete jedes Upgrade Millionen und gab nichts.
        inventoryMaxSlots: Number.isFinite(inventorySlotsNum) ? Math.max(50, Math.min(340, inventorySlotsNum)) : 50,
        tutorialCompleted: state.tutorialCompleted === true || state.tutorialCompleted === "true",
        // mailbox wird BEWUSST nicht aus dem Client-Payload übernommen — sie gehört dem
        // Server. Vorher hätte ein PUT jede Sendung überschrieben, die seit dem Laden
        // eingetroffen ist (Post wäre schlicht verschwunden), und ein manipulierter
        // Client hätte sich selbst Gold-Sendungen eintragen können.
        // Der echte Wert wird in der PUT-Route aus dem bestehenden State übernommen.
        mailbox: [],
        incubator: state.incubator && typeof state.incubator === "object"
            ? state.incubator
            : { unlockedSlots: 1, slots: [null] },
        // Wohin der Spieler Inkubator und Mülleimer gestellt hat — Kachel-Versatz
        // zum eigenen Grundstück, nicht Weltkoordinaten (der Slot wechselt).
        gebaeudeVersatz: normalizeGebaeudeVersatz(state.gebaeudeVersatz),
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
// Reihen der Grundstückserweiterung. Muss zu STEIN_REIHEN in
// Frontend/src/pages/GardenGame/engine/MapConfig.js passen — dort steht auch, warum
// es 16 sind (vier Steinblöcke à 7×7 statt 7×7 und 7×6).
const EXTRA_PLOT_ROWS = 16;
// Lage der Holzwege im Steinfeld — Spiegel von MITTELWEG_REIHE in MapConfig.js.
const MITTELWEG_REIHE = 9;
const WEG_SPALTE = 7;
// Grundstücksmaß in Kacheln — muss zu MAP_CONFIG.territoryWidth/Height / TILE_SIZE
// im Frontend passen (28×33). Nur für die Grenzprüfung der Gebäudestandorte.
const GRUNDSTUECK_KACHELN_X = 28;
const GRUNDSTUECK_KACHELN_Y = 33;
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
    // Kein Lagerbestand: die Spitzhacke ist immer vorrätig. Gebremst wird sie über
    // ihren Preis, der im Client mit jedem Kauf steigt (getPickaxePrice) — ein
    // zusätzliches Limit pro Shop-Rotation hieß nur zehn Minuten warten.
    { id: "pickaxe", name: "Spitzhacke", emoji: "⛏️", price: 40000, type: "uses", uses: 4 },
    // BALANCING: Schaufel, Kiste und Vitrine kosteten 1 Mio / 750 k / 5 Mio und
    // waren damit im Lategame Sekundenkäufe — „permanente Meilensteine", die man
    // im Vorbeigehen mitnimmt. Jetzt sind es echte Ziele.
    { id: "shovel", name: "Schaufel", emoji: "🪓", price: 5000000, type: "permanent", stock: 1 },
    { id: "plant_pot", name: "Plant Pot", emoji: "🪴", price: 250000, type: "single", stock: 10 },
    { id: "backpack_upgrade", name: "Rucksack Upgrade", emoji: "🎒", price: 20000, type: "permanent", stock: 1 },
    { id: "watering_can", name: "Gießkanne", emoji: "🪣", price: 400000, type: "single", stock: 10 },
    // Beide stehen dauerhaft auf dem Grundstück, deshalb "permanent" mit Bestand 1.
    { id: "chest", name: "Vorratskiste", emoji: "📦", price: 25000000, type: "permanent", stock: 1 },
    { id: "vitrine", name: "Vitrine", emoji: "🏆", price: 500000000, type: "permanent", stock: 1 },
];

/**
 * Eier.
 *
 * BALANCING — zwei Dinge waren kaputt:
 *
 * 1. Die Amortisation lief in die FALSCHE Richtung. Ein Common Ei (100 k) hatte
 *    sich nach 0,65 h bezahlt, ein Legendary (1 Mrd) erst nach 26,5 h. Je teurer,
 *    desto schlechter das Geschäft.
 * 2. Die hatchTable bestimmte NUR das Bild. Fähigkeit (1/3 zufällig) und Level
 *    (allein aus der Ei-Seltenheit) hingen gar nicht am geschlüpften Tier — ein
 *    Götterwesen mit 1 % Chance war exakt so viel wert wie ein Einhorn mit 40 %.
 *    Die ganze Spannung des Gacha war Attrappe.
 *
 * Jetzt trägt jeder Eintrag sein eigenes `level`: der seltene Treffer ist auch
 * der stärkere. Die Preise folgen der neuen Goldfinder-Kurve mit einer sanft
 * steigenden Amortisation (Common ~0,7 h bis Legendary ~17 h).
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
/**
 * Standort von Inkubator und Mülleimer: Kachel-Versatz innerhalb des eigenen
 * Grundstücks. Werte außerhalb werden verworfen — dann steht das Gebäude wieder
 * am Standardplatz, statt irgendwo in der Welt zu landen.
 */
function normalizeGebaeudeVersatz(roh) {
    // Grundstück ist 28×33 Kacheln (MAP_CONFIG im Frontend) — hier nur die Grenzen,
    // die Geometrie selbst braucht der Server nicht.
    const maxX = GRUNDSTUECK_KACHELN_X - 1;
    const maxY = GRUNDSTUECK_KACHELN_Y - 1;
    const eine = (v) => {
        const tx = Number(v?.tx);
        const ty = Number(v?.ty);
        if (!Number.isInteger(tx) || !Number.isInteger(ty)) return null;
        if (tx < 0 || tx > maxX || ty < 0 || ty > maxY) return null;
        return { tx, ty };
    };
    return {
        incubator: eine(roh?.incubator),
        trash: eine(roh?.trash),
        chest: eine(roh?.chest),
        vitrine: eine(roh?.vitrine),
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
/**
 * Rückfall für alte Spielstände, die nur eine ANZAHL Erweiterungsreihen kannten.
 * Die beiden Holzwege (Reihe 1 und der Querweg) und die Wegspalte bleiben aussen
 * vor — sonst gälten Kacheln als Acker, die sich nie freilegen lassen, und man
 * könnte mitten auf dem Steg pflanzen. Muss zum Frontend passen.
 */
function unlockedCellsFromLegacyExpansions(expansions, isTopRow = true) {
    const level = Math.max(0, Math.min(MAX_PLOT_EXPANSIONS, Number(expansions) || 0));
    const out = [];
    for (let row = 1; row <= level; row++) {
        if (row === 1 || row === MITTELWEG_REIHE) continue;
        const y = isTopRow ? -row : (BASE_DIRT_ROWS + row - 1);
        for (let x = 0; x < BASE_DIRT_COLS; x++) {
            if (x === WEG_SPALTE) continue;
            out.push(`${x}_${y}`);
        }
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
/**
 * Nachziehzähler je Seltenheit.
 *
 * WARUM: Mythic mit 1 % je Fünf-Minuten-Rotation heißt im Mittel 500 Minuten
 * SPIELZEIT. Wer täglich zehn Minuten zum Abernten vorbeikommt, sieht zwei
 * Rotationen und wartet damit rund fünfzig Tage auf genau die Sorten, die für
 * seinen Rhythmus gebaut sind (lange Zyklen). Das Tor war Spielzeit, nicht Gold —
 * und traf ausgerechnet die Gruppe, die am wenigsten davon hat. Nach so vielen
 * Rotationen ohne Treffer wird die Seltenheit erzwungen.
 */
const PITY_ROTATIONEN = { RARE: 8, EPIC: 20, LEGENDARY: 60, MYTHIC: 150 };
const pityZaehler = { RARE: 0, EPIC: 0, LEGENDARY: 0, MYTHIC: 0 };

function generateGlobalShopRotation() {
    const chances = { COMMON: 0.80, UNCOMMON: 0.65, RARE: 0.40, EPIC: 0.20, LEGENDARY: 0.05, MYTHIC: 0.01 };

    const activeSet = new Set();
    for (const seed of SHOP_POOL) {
        const chance = chances[seed.rarity] || 0.5;
        if (Math.random() <= chance) {
            activeSet.add(seed.seedId);
        }
    }

    for (const [rarity, grenze] of Object.entries(PITY_ROTATIONEN)) {
        const schonDrin = SHOP_POOL.some((s) => s.rarity === rarity && activeSet.has(s.seedId));
        if (schonDrin) { pityZaehler[rarity] = 0; continue; }
        if (++pityZaehler[rarity] < grenze) continue;
        const kandidaten = SHOP_POOL.filter((s) => s.rarity === rarity);
        if (kandidaten.length === 0) continue;
        activeSet.add(kandidaten[Math.floor(Math.random() * kandidaten.length)].seedId);
        pityZaehler[rarity] = 0;
        console.log(`[Garden] Shop-Nachzug: ${rarity} nach ${grenze} Rotationen ohne Treffer erzwungen.`);
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

    /**
     * Aufräumer für die beiden Maps, die sonst über die Serverlaufzeit unbegrenzt
     * wachsen: `subCache` behält seine Schlüssel auch nach Ablauf der TTL, und
     * `petFundZeiten` hat NIE etwas entfernt — weder beim Verkauf eines Tieres noch
     * beim Verlassen der Welt. Jeder Spieler, der je ein Tier platziert hat, blieb
     * mitsamt allen je besessenen Tieren für immer darin stehen.
     */
    const PET_FUND_TTL_MS = 6 * 60 * 60 * 1000;
    const aufraeumer = setInterval(() => {
        const jetzt = Date.now();
        for (const [id, eintrag] of subCache) {
            if (jetzt - eintrag.ts >= SUB_CACHE_TTL) subCache.delete(id);
        }
        const grenze = jetzt - PET_FUND_TTL_MS;
        for (const [id, proNutzer] of petFundZeiten) {
            for (const [petKey, ts] of proNutzer) if (ts < grenze) proNutzer.delete(petKey);
            if (proNutzer.size === 0) petFundZeiten.delete(id);
        }
    }, 30 * 60 * 1000);
    if (typeof aufraeumer.unref === "function") aufraeumer.unref();

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
    router.get("/farm-state", requireAuth, async (req, res) => {
        const userId = String(req.twitchId);
        // ── Erst alles Asynchrone, DANN farmStates lesen ──────────────────────
        // ensureSubStatus ruft bei kaltem Cache wirklich die Twitch-API auf und gibt
        // dabei den Event-Loop frei. In diesem Fenster kann ein PUT komplett
        // durchlaufen und den Eintrag in farmStates durch ein NEUES Objekt ersetzen.
        // Die vor dem await geholte Referenz überschrieb den PUT danach wieder —
        // frisch Gepflanztes, gekaufte Samen und platzierte Deko waren lautlos weg,
        // und beide Seiten hielten denselben Zählerstand für gültig.
        let sub = false;
        try { sub = await ensureSubStatus(userId); } catch { sub = false; }

        const saved = farmStates.get(userId) || null;
        if (!saved) {
            // Frische Farm gleich hier anlegen — MIT Startkapital.
            //
            // Vorher entstand der Serverstand erst beim ersten Speichern des Browsers,
            // und weil Gold dort grundsätzlich aus dem BESTEHENDEN Stand übernommen
            // wird (Schutz gegen selbst eingetragenes Gold), war das bei einem noch
            // nicht existierenden Stand 0. Der Browser zeigte seine 500 an, der Server
            // wusste von 0 — jeder Kauf endete in „Nicht genug Gold."
            const neu = compactFarmState({});
            neu.gold = START_GOLD;
            neu.stateVersion = 0;
            // Ohne diesen Zeitpunkt bekäme die frische Farm beim ersten Betreten die
            // volle Deckelzeit an Offline-Ertrag geschenkt.
            neu.petsAbgerechnetBis = Date.now();
            // Eine neue Farm ist schon im neuen Raster angelegt.
            neu[STEINFELD_MARKE] = true;
            neu[STEINFELD_MARKE_ALT] = true;
            neu[STEINFELD_MARKE_WEGE] = true;
            if (req.twitchLogin) neu.twitchLogin = String(req.twitchLogin).toLowerCase();
            setFarmState(farmStates, userId, neu);
            scheduleFarmsSave(farmStates);
            return res.json({ state: neu });
        }
        // Advance plant timers before sending
        const advanced = {
            ...saved,
            plotPlants: advancePlantTime(saved.plotPlants || {}),
        };
        // Festgefahrene Farmen wieder flottmachen.
        //
        // Wen der Fehler oben erwischt hat, der steht bei 0 Gold OHNE Samen da — und
        // kommt aus eigener Kraft nie wieder heraus: ohne Gold keine Samen, ohne Samen
        // keine Ernte, ohne Ernte kein Gold. Genau diese Sackgasse wird hier gelöst,
        // und nur sie: wer noch irgendetwas besitzt, womit sich arbeiten lässt, bleibt
        // unangetastet.
        const nichtsZumArbeiten = (Number(advanced.gold) || 0) <= 0
            && (advanced.inventory?.length || 0) === 0
            && (advanced.harvestedItems?.length || 0) === 0
            && (advanced.chestItems?.length || 0) === 0
            && Object.keys(advanced.plotPlants || {}).length === 0;
        if (nichtsZumArbeiten) {
            advanced.gold = START_GOLD;
            console.warn(`[Garden] Farm von ${userId} war ohne Gold und ohne Samen — Startkapital erneuert.`);
        }
        // Und den Fortschritt auch BEHALTEN. Vorher bekam der Browser einen
        // Dauerträger als "fruiting" samt Fruchtständen, während der Server
        // weiter "structure" ohne Fruchtstände speicherte — jede Ernte lief
        // dann in "Noch nicht reif.", bis irgendein anderer PUT den Stand
        // nachzog. Die beiden Seiten dürfen sich hier nicht auseinander laufen.
        // ── Tiere haben auch gearbeitet, während niemand zusah ────────────────
        // Muss NACH advancePlantTime laufen: der Erntehelfer sucht reife Zellen, und
        // reif geworden sind sie erst durch das Nachziehen der Zeit oben.
        // Der Sub-Bonus zählt wie beim Verkauf am Marktstand; `sub` steht oben schon
        // fest, weil nach diesem Punkt kein await mehr kommen darf.
        const offline = verrechneOffline(advanced, { isSubscriber: sub, istReif });
        if (offline) {
            erhoeheVersion(advanced);
            console.log(`[Garden] Offline-Verrechnung ${userId}: ${offline.minuten} min, `
                + `${offline.gold} Gold, ${offline.geerntet} geerntet`);
        }

        setFarmState(farmStates, userId, advanced);
        scheduleFarmsSave(farmStates);
        res.json({ state: advanced, offline, skillStand: skillStand(advanced) });
    });

    /**
     * Der Fähigkeitsbaum als Bauplan. Kommt bewusst vom Server, obwohl ihn nur der
     * Browser zeichnet: die Stufenwerte stehen sonst zweimal da, und eine Fähigkeit,
     * deren Prozentzahl in der Anzeige von der in der Kasse abweicht, ist schlimmer
     * als gar keine Anzeige.
     */
    router.get("/skills", requireAuth, (req, res) => {
        const state = farmStates.get(String(req.twitchId));
        res.json({ katalog: SKILLS, stand: skillStand(state || {}) });
    });

    // PUT /api/garden/farm-state
    router.put("/farm-state", requireAuth, (req, res) => {
        const userId = String(req.twitchId);
        const { state } = req.body || {};
        if (!state || typeof state !== "object") {
            return res.status(400).json({ error: "Ungueltiger Farm-State." });
        }

        const existing = farmStates.get(userId) || {};

        // ── Schutz vor dem "noch nicht geladenen" Client ──────────────────────
        // Ein PUT, in dem ALLE Sammlungen leer sind, während der Server Daten hält,
        // ist kein Spielstand, sondern der Startzustand eines Browsers, der seine
        // Farm noch nicht geladen hat. Am 10.08.2026 hat genau so ein PUT einem
        // Spieler 18 Dekorationen und ein Tier gelöscht (Gold war da schon
        // serverseitig geschützt und blieb als einziges stehen).
        // Ein Spieler, der wirklich alles gleichzeitig wegwirft, ist nicht real —
        // und hätte hier auch nichts zu verlieren, weil dann auch der Serverstand
        // leer ist und die Bedingung gar nicht greift.
        // ── Verspätete Speicherstände abweisen ────────────────────────────────
        // Siehe erhoeheVersion() oben. Der Browser nennt den Stand, den er zuletzt
        // gesehen hat; jede Aktion dazwischen hat den Serverstand weitergezählt.
        // Passt es nicht, ist dieser PUT älter als die Wirklichkeit — er würde
        // geerntete Pflanzen, verkaufte Tiere oder eingelagerte Stücke zurückholen,
        // während die Gutschrift dafür stehen bleibt.
        const versionServer = Number(existing.stateVersion) || 0;
        const versionClient = Number(state.stateVersion) || 0;
        // Welcher Browser-Tab schreibt hier? Zwei offene Tabs führen je einen
        // VOLLSTÄNDIGEN Rucksack mit sich; wer zuletzt speichert, überschreibt den
        // anderen ganz. Am Zähler allein ist das nicht zu erkennen — ein verspäteter
        // PUT DESSELBEN Tabs sieht genauso aus, und der darf nachgereicht werden.
        const tab = String(state.tabId || "").slice(0, 40);
        if (versionClient !== versionServer) {
            return res.status(409).json({
                error: "Spielstand veraltet.",
                reload: true,
                stateVersion: versionServer,
                // Ab welchem Zählerstand der SERVER selbst etwas geändert hat
                // (Umstellung beim Neustart, Admin-Eingriff). Liegt der über dem
                // Stand des Browsers, darf er seinen eigenen NICHT nachreichen —
                // er würde die Änderung überschreiben.
                serverAenderungAb: Number(existing.serverAenderungAb) || 0,
                // Wer zuletzt geschrieben hat. Ein anderer Tab heisst: nicht
                // nachreichen, sondern zurücktreten.
                letzterTab: existing.letzterTab || null,
            });
        }

        const istLeer = (v) => !v || (Array.isArray(v) ? v.length === 0 : Object.keys(v).length === 0);
        const SAMMLUNGEN = [
            "plotPlants", "inventory", "decoPlacements", "decoInventory",
            "petPlacements", "petInventory", "eggInventory",
        ];
        const alleLeer = SAMMLUNGEN.every((f) => istLeer(state[f]));
        const serverHatDaten = SAMMLUNGEN.some((f) => !istLeer(existing[f]));
        if (alleLeer && serverHatDaten) {
            console.warn(`[Garden] Leerer Spielstand von ${userId} verworfen — Client war vermutlich noch nicht geladen.`);
            return res.json({ success: true, ignored: true, updatedAt: existing.updatedAt });
        }

        // -- FIX: Serverseitige Shop-Bestände vor dem Client-Overwrite schützen --
        state.shopStock = state.shopStock || existing.shopStock;
        state.shopStockVersion = state.shopStockVersion || existing.shopStockVersion;
        state.toolShopStock = state.toolShopStock || existing.toolShopStock;
        state.toolShopStockVersion = state.toolShopStockVersion || existing.toolShopStockVersion;
        state.eggShopStock = state.eggShopStock || existing.eggShopStock;
        state.eggShopStockVersion = state.eggShopStockVersion || existing.eggShopStockVersion;
        // --------------------------------------------------------------------------

        // Frisch Verschenktes darf ein verspaeteter Speichervorgang nicht
        // zurueckbringen — sonst liegt derselbe Samen im fremden Briefkasten UND
        // wieder im eigenen Rucksack (siehe garden/world/mail.js).
        state.inventory = filtereVerschenkte(userId, state.inventory);
        state.petInventory = filtereVerschenkte(userId, state.petInventory);
        state.petPlacements = filtereVerschenkte(userId, state.petPlacements);

        // Der Acker gehört dem Browser, seine ZEITEN nicht mehr — sonst liesse
        // sich mit einem PUT ein Feld voll reifer Mondblumen melden und über
        // POST /action in echtes Gold verwandeln (siehe verplausibilisierePflanzen).
        const freigelegt = normalizePlotUnlockedCells(state.plotUnlockedCells);
        state.plotPlants = verplausibilisierePflanzen(state.plotPlants, existing, freigelegt.length);

        const compact = compactFarmState(state);
        if (req.twitchLogin) compact.twitchLogin = String(req.twitchLogin).toLowerCase();
        // Briefkasten gehört dem Server: bestehenden Stand übernehmen statt den Client-Wert.
        compact.mailbox = Array.isArray(existing.mailbox) ? existing.mailbox : [];
        // Serverbesitz: unveraendert aus dem bestehenden Stand uebernehmen. Speichert
        // ein Browser, bevor er je geladen hat, gibt es noch keinen Stand — dann gilt
        // das Startkapital statt 0 (siehe GET /farm-state).
        compact.gold = farmStates.has(userId)
            ? Math.max(0, Math.min(GOLD_MAX, Number(existing.gold) || 0))
            : START_GOLD;
        compact.harvestedItems = sanitizeItemArray(existing.harvestedItems);
        compact.chestItems = sanitizeItemArray(existing.chestItems);
        compact.vitrineItems = sanitizeItemArray(existing.vitrineItems);
        // Zähler und Abrechnungszeitpunkt gehören dem Server — sie stehen bewusst
        // nicht in compactFarmState und dürfen nicht aus dem Client übernommen werden.
        // Weiterzählen, auch wenn nur gespeichert wurde. Vorher blieb der Zähler
        // beim PUT stehen — zwei Tabs mit demselben Stand kamen damit BEIDE durch
        // und der zweite überschrieb den ersten lautlos, ganz ohne Konflikt.
        compact.stateVersion = versionServer + 1;
        compact.letzterTab = tab || existing.letzterTab || null;
        compact.petsAbgerechnetBis = Number(existing.petsAbgerechnetBis) || Date.now();
        // Erfahrung und Fähigkeiten gehören dem Server — sie steuern Gold und Ertrag.
        // Käme der Wert aus dem PUT, könnte sich jeder Browser Level und Punkte selbst
        // eintragen. Sie stehen deshalb nicht in compactFarmState, sondern hier.
        compact.xp = Math.max(0, Number(existing.xp) || 0);
        compact.skills = existing.skills && typeof existing.skills === "object" ? existing.skills : {};
        // Marke der XP-Nachzahlung. Ginge sie verloren, liefe die Rechnung beim
        // nächsten Serverstart erneut über diesen Stand.
        if (existing[XP_MARKE]) compact[XP_MARKE] = true;
        if (existing[XP_MARKE_KURVE]) compact[XP_MARKE_KURVE] = true;
        // Einmalige Anschaffungen darf nur der Server setzen. Sie stehen zwar in
        // toolInventory, das dem Browser gehört — aber ein manipulierter Client
        // hätte sich Schaufel, Kiste und Vitrine sonst einfach eintragen können,
        // ohne je zu bezahlen. Einmal erworben bleibt erworben, nie umgekehrt.
        const werkzeugVorher = normalizeToolInventory(existing.toolInventory);
        compact.toolInventory = {
            ...compact.toolInventory,
            hasShovel: werkzeugVorher.hasShovel === true || compact.toolInventory.hasShovel === true,
            hasChest: werkzeugVorher.hasChest === true || compact.toolInventory.hasChest === true,
            hasVitrine: werkzeugVorher.hasVitrine === true || compact.toolInventory.hasVitrine === true,
        };
        // Die Marke der Steinfeld-Umstellung MUSS mit. Ginge sie beim Speichern
        // verloren, liefe die Migration beim nächsten Serverstart erneut und würde
        // dieselben Zellen ein zweites Mal nach außen schieben.
        if (existing[STEINFELD_MARKE]) compact[STEINFELD_MARKE] = true;
        if (existing[STEINFELD_MARKE_ALT]) compact[STEINFELD_MARKE_ALT] = true;
        if (existing[STEINFELD_MARKE_WEGE]) compact[STEINFELD_MARKE_WEGE] = true;
        if (existing.serverAenderungAb) compact.serverAenderungAb = existing.serverAenderungAb;
        setFarmState(farmStates, userId, compact);
        scheduleFarmsSave(farmStates);
        // Andere in der Welt sehen den geänderten Acker
        notifyPlotChanged(userId);
        res.json({ success: true, updatedAt: compact.updatedAt, stateVersion: compact.stateVersion });
    });

    // ─── Wirtschaft (serverautoritativ) ───────────────────────────────────────
    // Ernte und Verkauf rechnet ab v3.0 der Server. Der Client meldet nur die
    // Absicht; Gold und Ernte-Lager kommen nicht mehr aus dem PUT.
    router.post("/action", requireAuth, async (req, res) => {
        const userId = String(req.twitchId);
        const aktion = String(req.body?.action || "");

        // ── Erst alles Asynchrone, DANN farmStates lesen ──────────────────────
        // Siehe GET /farm-state: jedes await gibt den Event-Loop frei, ein PUT
        // dazwischen ersetzt den Eintrag, und eine vorher geholte Referenz würde
        // ihn beim Zurückschreiben überschreiben.
        let sub = false;
        if (aktion === "sellAll" || aktion === "harvestMany") {
            try { sub = await ensureSubStatus(userId); } catch { sub = false; }
        }

        const state = farmStates.get(userId);
        if (!state) return res.status(400).json({ error: "Keine Farm gefunden." });

        /**
         * Aktionen aus einem ZWEITEN Tab abweisen.
         *
         * Warum nicht einfach der Zählerstand wie beim PUT: Aktionen laufen
         * ständig parallel zum Autosave. Zwischen dem Absenden eines PUT und
         * seiner Antwort ist der Server schon einen Schritt weiter, der Browser
         * aber noch nicht — eine reine Zählerprüfung würde beim Ziehen über den
         * Acker laufend eigene Ernten abweisen.
         *
         * Der Schaden entsteht ohnehin nur bei ZWEI Tabs: der unterlegene Tab
         * speichert nicht mehr (nurZuschauen), erntet aber weiter. Der führende
         * Tab läuft dadurch in einen Konflikt, den er zu seinen Gunsten auflöst —
         * die Pflanze kommt zurück, das Gold dafür bleibt. Genau dieser Fall wird
         * hier erkannt: ein anderer Tab hat zuletzt geschrieben UND dieser hier
         * hinkt hinterher.
         */
        const tabAnfrage = String(req.body?.tabId || "").slice(0, 40);
        const versionClient = Number(req.body?.stateVersion);
        const fremderTab = tabAnfrage && state.letzterTab && state.letzterTab !== tabAnfrage;
        const hinterher = Number.isFinite(versionClient) && versionClient < (Number(state.stateVersion) || 0);
        if (fremderTab && hinterher) {
            return res.status(409).json({
                error: "Die Farm ist in einem anderen Tab offen.",
                reload: true,
                stateVersion: Number(state.stateVersion) || 0,
                letzterTab: state.letzterTab || null,
            });
        }

        let ergebnis;

        if (aktion === "harvest") {
            const key = String(req.body?.key || "");
            if (!ZELL_SCHLUESSEL.test(key)) return res.status(400).json({ error: "Ungültige Zelle." });
            ergebnis = harvestCell(state, key);
        } else if (aktion === "harvestMany") {
            // Erntehelfer-Tier: mehrere Zellen in einem Aufruf, damit der Tick nicht
            // acht Anfragen hintereinander schickt.
            //
            // Seit v3.3 wird direkt VERKAUFT statt eingelagert (siehe petErnteVerkauf).
            // Vorher lief der Rucksack nach ein paar Minuten voll und das Tier stand
            // still — der Sub-Bonus zählt dabei wie am Marktstand.
            // Obergrenze passt zu HARVESTER_YIELD[5] in garden/core/pets.js.
            const keys = (Array.isArray(req.body?.keys) ? req.body.keys.slice(0, 32) : [])
                .map((roh) => String(roh || ""))
                .filter((key) => ZELL_SCHLUESSEL.test(key));
            ergebnis = petErnteVerkauf(state, keys, sub);
        } else if (aktion === "spend") {
            ergebnis = spendGold(state, req.body?.amount);
        } else if (aktion === "sellPet") {
            ergebnis = sellPet(state, req.body?.petId);
        } else if (aktion === "petFind") {
            let proNutzer = petFundZeiten.get(userId);
            if (!proNutzer) { proNutzer = new Map(); petFundZeiten.set(userId, proNutzer); }
            ergebnis = petFind(state, req.body?.petId, String(req.body?.kind || "gold"), proNutzer);
        } else if (aktion === "sellAll") {
            ergebnis = sellAll(state, sub);
        } else if (aktion === "ablageEin" || aktion === "ablageAus") {
            // Kiste und Vitrine liegen wie das Ernte-Lager beim Server. Der Client
            // nennt nur Ablage und Stück; verschoben wird hier.
            const art = String(req.body?.ablage || "");
            ergebnis = aktion === "ablageEin"
                ? ablageEinlagern(state, art, req.body?.itemId)
                : ablageAuslagern(state, art, req.body?.itemId);
        } else if (aktion === "ablageAllesEin" || aktion === "ablageAllesAus") {
            const art = String(req.body?.ablage || "");
            ergebnis = aktion === "ablageAllesEin"
                ? ablageAllesEin(state, art)
                : ablageAllesAus(state, art);
        } else if (aktion === "skillLernen") {
            ergebnis = lerneSkill(state, req.body?.skill);
        } else if (aktion === "skillsZuruecksetzen") {
            ergebnis = skillsZuruecksetzen(state);
        } else {
            return res.status(400).json({ error: "Unbekannte Aktion." });
        }

        if (!ergebnis.ok) return res.status(ergebnis.status || 400).json({ error: ergebnis.error });

        // Jede erfolgreiche Aktion macht jeden PUT ungültig, der vorher losgeschickt
        // wurde — genau das schliesst die Doppel-Buchungen (siehe erhoeheVersion).
        erhoeheVersion(state);
        setFarmState(farmStates, userId, state);
        scheduleFarmsSave(farmStates);
        notifyPlotChanged(userId);
        res.json({
            success: true,
            stateVersion: state.stateVersion,
            gold: state.gold ?? 0,
            // Level, XP und gelernte Stufen kommen bei JEDER Aktion mit. Sie gehören
            // dem Server; der Browser zeigt sie nur an und darf sie nie mitspeichern.
            skillStand: skillStand(state),
            harvestedItems: state.harvestedItems ?? [],
            plotPlants: state.plotPlants ?? {},
            chestItems: state.chestItems ?? [],
            vitrineItems: state.vitrineItems ?? [],
            // Seit die Kiste auch Samen, Eier, Deko und Tiere nimmt, ändern sich beim
            // Ein- und Auslagern auch diese Listen. Ohne sie in der Antwort behielte
            // der Browser seinen alten Stand — und sein nächstes Speichern würde die
            // Verschiebung wieder rückgängig machen.
            inventory: state.inventory ?? [],
            eggInventory: state.eggInventory ?? [],
            decoInventory: state.decoInventory ?? [],
            petInventory: state.petInventory ?? [],
            ...ergebnis,
        });
    });

    // ─── Briefkasten ──────────────────────────────────────────────────────────
    // Der einzige serverautoritative Teil des Spiels: hier wandert Wert zwischen
    // zwei Konten, deshalb rechnet der Server (siehe garden/world/mail.js).

    // GET /api/garden/mail — eigener Briefkasten
    router.get("/mail", requireAuth, (req, res) => {
        res.json({ mailbox: getMailbox(farmStates, req.twitchId) });
    });

    // POST /api/garden/mail/send { toLogin, gold?, message?, seedInstanceId? }
    router.post("/mail/send", requireAuth, (req, res) => {
        const userId = String(req.twitchId);
        const limit = checkRateLimit(userId);
        if (!limit.ok) {
            // Mit Wartezeit, sonst ist der 429 im Spiel nicht erklärbar. Das Limit
            // zählt nur den Absender — Post an einen selbst kommt weiter an.
            const minuten = Math.max(1, Math.ceil(limit.wartenMs / 60000));
            return res.status(429).json({
                error: `Zu viele Sendungen. In etwa ${minuten} Minute${minuten === 1 ? "" : "n"} geht es weiter — schick mehrere Sachen in einer Sendung.`,
            });
        }
        const { toLogin, gold, message, seedInstanceId, seedInstanceIds, itemId, itemIds, petId, petIds } = req.body || {};
        const result = sendMail(farmStates, {
            fromTwitchId: userId,
            fromLogin: req.twitchLogin,
            toLogin,
            gold,
            message,
            seedInstanceId,
            seedInstanceIds,
            itemId,
            itemIds,
            petId,
            petIds,
        });
        if (!result.ok) return res.status(result.status || 400).json({ error: result.error });

        // Verschenken nimmt dem Absender etwas aus einer BROWSER-Liste (Rucksack,
        // Tiere) und legt es beim Empfänger in den serverseitigen Briefkasten. Ohne
        // Weiterzählen holte ein verspäteter PUT das Verschenkte zurück — es läge
        // dann in beiden Farmen.
        const senderState = farmStates.get(userId);
        if (senderState) erhoeheVersion(senderState);
        setFarmState(farmStates, userId, senderState);
        setFarmState(farmStates, result.recipientTwitchId, farmStates.get(result.recipientTwitchId));
        scheduleFarmsSave(farmStates);
        notifyMail(result.recipientTwitchId, result.mail);
        notifyPlotChanged(result.recipientTwitchId);

        res.json({
            success: true,
            stateVersion: senderState?.stateVersion ?? 0,
            gold: senderState?.gold ?? 0,
            inventory: senderState?.inventory ?? [],
            harvestedItems: senderState?.harvestedItems ?? [],
            petInventory: senderState?.petInventory ?? [],
        });
    });

    // POST /api/garden/mail/claim { id }
    router.post("/mail/claim", requireAuth, (req, res) => {
        const userId = String(req.twitchId);
        const result = claimMail(farmStates, userId, req.body?.id);
        if (!result.ok) return res.status(result.status || 400).json({ error: result.error });
        const state = farmStates.get(userId);
        // Abholen legt Samen und Tiere in BROWSER-Listen. Ein verspäteter PUT hätte
        // sie wieder gelöscht — aus dem Briefkasten sind sie da schon verschwunden.
        if (state) erhoeheVersion(state);
        setFarmState(farmStates, userId, state);
        scheduleFarmsSave(farmStates);
        notifyPlotChanged(userId);
        res.json({
            success: true,
            stateVersion: state?.stateVersion ?? 0,
            credited: result.credited,
            mailbox: result.mailbox,
            gold: state?.gold ?? 0,
            inventory: state?.inventory ?? [],
            harvestedItems: state?.harvestedItems ?? [],
            petInventory: state?.petInventory ?? [],
        });
    });

    return router;
};

/**
 * Samen und Eier für das Admin-Menü — dieselben Listen, aus denen der Laden zieht.
 *
 * Als Eigenschaft am Modul statt als zweiter Export, weil die Datei eine Fabrik
 * exportiert; dasselbe Muster nutzt bereits createWinchallengeRouter.loadDb().
 * Ohne das müsste adminRoutes.js seine eigene Kopie führen, und ein neuer Samen
 * wäre im Menü unsichtbar.
 */
module.exports.katalog = {
    get seeds() { return SHOP_POOL.map(withSeedVisuals); },
    get eggs() { return EGG_SHOP_CATALOGUE; },
};
