// routes/gardenGameRoutes.js
// Garden backend: authoritative sync, file-persisted farm states, delta events

const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const { farmStates, setFarmState, scheduleFarmsSave } = require("../store/farms");
const { sendMail, claimMail, getMailbox, checkRateLimit, filtereVerschenkte } = require("../world/mail");
const {
    notifyPlotChanged, notifyMail, notifyVeredelt, istOnline, istAktivGenug,
} = require("../world/lobby");
const {
    harvestCell, harvestCellAll, harvestManyCells, sellAll, spendGold, sellPet, petFind, wachstumsBonus,
    ablageEinlagern, ablageAuslagern, ablageAllesEin, ablageAllesAus, gutschreiben,
    GOLD_MAX,
} = require("../core/economy");
const {
    skillStand, lerneSkill, skillsZuruecksetzen, SKILLS, wirkung, GIESSKANNE_MAX_ANTEIL,
    xpTabelle, gibFesteXp,
} = require("../core/skills");
const quests = require("../core/quests");
const reskins = require("../core/reskins");
const { SEED_CATALOGUE } = require("../core/catalogue");
const {
    MARKE: XP_MARKE, MARKE_KURVE: XP_MARKE_KURVE, MARKE_KORREKTUR: XP_MARKE_KORREKTUR,
} = require("../migrations/xp");
const { MARKE: SKILL_STAFFEL_MARKE } = require("../migrations/skills");
const { MARKE: TIERPLATZ_MARKE } = require("../migrations/tierplaetze");
const { istAdminId, STANDARD_SKIN } = require("../core/wardrobe");
const { partyStand, unitAusText } = require("../core/tageszeit");
const ereignisse = require("../world/ereignisse");
const {
    WERKZEUGE, werkzeugVon, preisFuer, kaufeWerkzeug, kaufeWerkzeugAlle, verbraucheWerkzeug,
} = require("../core/werkzeug");
const {
    MARKE: STEINFELD_MARKE, MARKE_ALT: STEINFELD_MARKE_ALT, MARKE_WEGE: STEINFELD_MARKE_WEGE,
} = require("../migrations/plot");

const ZELL_SCHLUESSEL = /^-?\d+_-?\d+$/;
// Marke der Ackerraster-Umstellung. Gesetzt wird sie im Browser; hier steht sie nur,
// damit sie den PUT übersteht und einmal Gesetztes nie wieder verlorengeht.
const ACKERRASTER_MARKE = "ackerRaster7";
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
                const iid = p.instanceId;
                p.fruitSlots = Array.from(
                    { length: p.maxFruits || 1 },
                    (_, i) => createFruitSlot(start, cycleMs, iid ? `${iid}:erstfrucht:${i}` : null),
                );
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

/**
 * Veredelung einer neu entstehenden Frucht.
 *
 * Die Chancen stehen in garden/core/tageszeit.js, weil sie vom Party-Event abhängen:
 * während einer Nacht-Party ist Rainbow viermal so wahrscheinlich. Vorher stand
 * dieselbe Zeile an vier Stellen im Server und einmal im Browser — ein Ereignis, das
 * die Chance verändert, hätte dort nie flächendeckend gewirkt.
 */
function rollSpecialType(now = Date.now()) {
    return ereignisse.sonderform(now);
}

// `seed`: siehe neuerFruchtstand in core/economy.js — macht den ERSTEN
// Fruchtstand eines Dauerträgers reproduzierbar, damit diese Route (GET) und
// harvestCell (POST /action) unabhängig voneinander dieselbe Reifezeit
// errechnen wie der Browser (engine/PlantSystem.js), statt jede Seite ihr
// eigenes Zufallsergebnis zu würfeln.
function createFruitSlot(now, cycleMs, seed = null) {
    const norm = randomNorm();
    const streuung = seed != null ? unitAusText(seed) : Math.random();
    return {
        readyAt: now + Math.round(cycleMs * (0.8 + streuung * 0.4)),
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
/**
 * Wachstumszeit einer Einmalernte nach dem Gießen.
 *
 * `growthMsBasis` ist die Dauer beim Pflanzen; daran hängt die Untergrenze.
 * Fehlt sie (Pflanzen von vor v4.0), gilt der aktuelle Wert als Basis — dann
 * greift der Deckel eben erst ab dem nächsten Guss.
 */
function gegosseneWachstumszeit(vorher, roh) {
    const aktuell = Number(vorher.growthMs) || 0;
    const basis = Number(vorher.growthMsBasis) || aktuell;
    const gewuenscht = Number(roh?.growthMs);
    if (!Number.isFinite(gewuenscht) || gewuenscht >= aktuell) return aktuell;
    return Math.max(Math.round(basis * (1 - GIESSKANNE_MAX_ANTEIL)), gewuenscht);
}

/**
 * Reifezeitpunkt eines Fruchtstands nach dem Gießen.
 *
 * Der Browser darf die Restzeit VERKÜRZEN (die Gießkanne liegt bei ihm), aber
 * niemals verlängern — und höchstens um GIESSKANNE_MAX_ANTEIL des Zyklus. Ohne
 * die Untergrenze liesse sich mit einem PUT jede Frucht sofort reif melden.
 */
function gegosseneReifezeit(serverSlot, clientSlot, zyklusMs) {
    const serverAt = Number(serverSlot?.readyAt) || 0;
    const maxAbzug = Math.round((Number(zyklusMs) || 0) * GIESSKANNE_MAX_ANTEIL);
    // Gezählt wird die BISHER gegossene Zeit, nicht die Differenz je Speichervorgang.
    // Sonst liesse sich mit jedem PUT erneut die Hälfte abziehen — also unbegrenzt
    // beschleunigen. Der Zähler wird beim Nachwachsen automatisch zurückgesetzt
    // (neuerFruchtstand baut ein frisches Objekt).
    const bisher = Math.max(0, Math.min(maxAbzug, Number(serverSlot?.gegossenMs) || 0));
    const gewuenscht = Math.max(0, Math.min(maxAbzug, Number(clientSlot?.gegossenMs) || 0));
    if (gewuenscht <= bisher) return { readyAt: serverAt, gegossenMs: bisher };
    return { readyAt: serverAt - (gewuenscht - bisher), gegossenMs: gewuenscht };
}

function mischeFruchtstaende(serverSlots, clientSlots, zyklusMs) {
    if (!Array.isArray(serverSlots)) return [];
    const vomClient = Array.isArray(clientSlots) ? clientSlots : [];
    return serverSlots.map((slot, i) => {
        if (!slot) return slot;
        const c = vomClient[i];
        if (!c) return slot;
        return { ...slot, ...saubereEffekte(c), ...gegosseneReifezeit(slot, c, zyklusMs) };
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
 *
 * AUSNAHME — Umtopfen (Plant Pot, siehe handleMovePlantWithPot im Frontend): das
 * verschiebt eine Pflanze auf eine ANDERE Zelle, also einen ANDEREN Schlüssel.
 * Nach reiner Schlüssel-Prüfung sähe das aus wie „Zelle ist neu" — ein Dauerträger,
 * der schon Früchte trug, wurde dadurch wieder zum frisch gepflanzten Setzling
 * zurückgewürfelt (gemeldet 21.08.2026). Jede Pflanze trägt seit createPlantInstance
 * (engine/PlantSystem.js) ein stabiles `instanceId` — reicht die Schlüssel-Prüfung
 * nicht, wird zusätzlich danach gesucht, BEVOR neu gewürfelt wird.
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

    // Fürs Umtopfen: jede alte Pflanze mit einer instanceId nachschlagbar machen.
    const altNachInstanceId = new Map();
    for (const [altKey, altPflanze] of Object.entries(alt)) {
        const id = altPflanze?.instanceId;
        if (id) altNachInstanceId.set(id, { key: altKey, plant: altPflanze });
    }
    // Jede instanceId darf pro PUT höchstens EINMAL ihre Serverzeiten weitergeben —
    // sonst liesse sich eine gerade fruchtende Pflanze durch Kopieren derselben
    // instanceId auf mehrere Zellen vervielfachen, jede Kopie mit vollem Fortschritt.
    const beanspruchteInstanceIds = new Set();

    for (const [key, roh] of Object.entries(eingehend)) {
        if (n >= maxZellen) break;
        if (!roh || typeof roh !== "object" || !ZELL_SCHLUESSEL.test(key)) continue;
        const profil = KATALOG_NACH_ID.get(roh.seedId);
        if (!profil) continue;

        let vorher = alt[key];
        if (vorher && vorher.seedId === roh.seedId) {
            if (vorher.instanceId) beanspruchteInstanceIds.add(vorher.instanceId);
        } else if (roh.instanceId && !beanspruchteInstanceIds.has(roh.instanceId)) {
            // Kein Treffer über die Zelle — vielleicht ist sie umgetopft worden.
            const gefunden = altNachInstanceId.get(roh.instanceId);
            if (gefunden && gefunden.plant.seedId === roh.seedId && gefunden.key !== key) {
                vorher = gefunden.plant;
                beanspruchteInstanceIds.add(roh.instanceId);
            }
        }
        if (vorher && vorher.seedId === roh.seedId) {
            // Bekannte Pflanze: alles Wertrelevante aus dem SERVER-Stand übernehmen.
            // Der Browser darf Bildpfade, Zellkoordinaten und das Wetter mitbringen —
            // Wetter entsteht in seinem Minutentakt und ist nach oben begrenzt.
            out[key] = {
                ...roh,
                singleUse: vorher.singleUse,
                plantedAt: vorher.plantedAt,
                // Gießkanne: der Browser darf die Wachstumszeit VERKÜRZEN, nie
                // verlängern, und höchstens bis auf GIESSKANNE_MAX_ANTEIL der
                // ursprünglichen Dauer. Vorher stand hier stur vorher.growthMs —
                // damit war jedes Gießen beim nächsten Speichern wieder weg.
                growthMs: gegosseneWachstumszeit(vorher, roh),
                growthMsBasis: Number(vorher.growthMsBasis) || Number(vorher.growthMs) || undefined,
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
                fruitSlots: mischeFruchtstaende(vorher.fruitSlots, roh.fruitSlots, vorher.fruitCycleMs),
            };
        } else {
            // Neu gesetzt: Zeiten hier würfeln, ab jetzt laufend.
            const single = profil.singleUse !== false;
            const gemeinsam = {
                seedId: profil.id,
                name: profil.name,
                rarity: profil.rarity,
                emoji: profil.emoji,
                singleUse: single,
                cellX: Number.isInteger(roh.cellX) ? roh.cellX : Number(key.split("_")[0]),
                cellY: Number.isInteger(roh.cellY) ? roh.cellY : Number(key.split("_")[1]),
                plantedAt: now,
                specialType: rollSpecialType(now),
                statusEffects: [],
                statusEffect: null,
                statusEffectUntil: null,
                // Übernimmt die des Browsers (createPlantInstance vergibt immer eine),
                // sonst wird eine neue vergeben. OHNE das trug eine frisch gepflanzte
                // Pflanze nie eine ID — jedes Umtopfen (siehe die instanceId-Suche oben)
                // fand dann nie einen Treffer, sobald zwischen Pflanzen und Umtopfen
                // auch nur ein einziges GET/PUT den lokalen Stand überschrieben hatte
                // (praktisch immer, bei Tagen Wachstumszeit).
                instanceId: (typeof roh.instanceId === "string" && roh.instanceId)
                    || `${key}_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
            };
            if (single) {
                const spanne = Math.max(0, profil.growMaxSec - profil.growMinSec);
                const ms = 1000 * (profil.growMinSec + Math.random() * spanne);
                out[key] = {
                    ...gemeinsam,
                    stage: "growing",
                    growthMs: Math.max(1000, Math.round(ms * (1 - wachstumsAbzug))),
                    // Ausgangsdauer merken — daran hängt der Gießkannen-Deckel.
                    growthMsBasis: Math.max(1000, Math.round(ms * (1 - wachstumsAbzug))),
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

// GOLD_MAX kommt jetzt aus core/economy.js — hier stand bis 21.08.2026 eine
// EIGENE Kopie (9,999... Billionen statt 9 Billiarden dort), aus der allerersten
// Fassung dieser Datei (Mai 2026), nie mitgezogen. Genau DIESE Zahl entschied
// aber, was tatsächlich gespeichert blieb: sie klemmte hier bei jedem PUT
// (siehe unten, compact.gold) UND als goldMax bei jedem Werkzeugkauf — Gold
// über 10 Billionen wurde beim nächsten Auto-Save also still auf 10 Billionen
// zurückgestutzt, unabhängig davon, wie viel core/economy.js beim Verkaufen
// gutschrieb. Bei Mondblume (bis zu 195 Mrd. je Ernte) oder dem neuen
// Rucksack-Vollausbau (~120 Billionen kumuliert, siehe werkzeug.js) war diese
// Deckung längst die engere.
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
        // War bis v2 (Punkt 11) reines Nachschlagewerk ohne Spielwert und durfte
        // deshalb vom Client kommen. Seit „Seite komplett" Gold auszahlt (siehe
        // logbuchAktualisieren in core/economy.js), gehört es genauso dem Server
        // wie Gold und Ernte — der Platzhalter hier wird unten aus `existing`
        // überschrieben, sonst könnte sich ein manipulierter Stand ein fertiges
        // Logbuch eintragen und bei der nächsten Ernte irgendeiner Art abkassieren.
        logbuch: isPlainObject(state.logbuch) ? state.logbuch : {},
        eggInventory: sanitizeItemArray(state.eggInventory),
        petInventory: sanitizeItemArray(state.petInventory),
        petPlacements: sanitizeItemArray(state.petPlacements),
        decoInventory: sanitizeItemArray(state.decoInventory),
        decoPlacements: sanitizeItemArray(state.decoPlacements),
        // Nur noch als Grundgerüst: die PUT-Route ersetzt das gleich durch den
        // Serverstand (siehe unten). Für eine FRISCHE Farm ist es der Startwert.
        toolInventory: werkzeugVon(state),
        // Obergrenze: 50 Grundplätze + 25 Rucksackstufen à 10 + „Lagerist" 8 × 5.
        // Der Deckel lag bei 200, während backpackLevel unbegrenzt weiterlief —
        // ab Stufe 15 kostete jedes Upgrade Millionen und gab nichts.
        inventoryMaxSlots: Number.isFinite(inventorySlotsNum) ? Math.max(50, Math.min(340, inventorySlotsNum)) : 50,
        tutorialCompleted: state.tutorialCompleted === true || state.tutorialCompleted === "true",
        // Marke der Rasterumstellung. Sie wird im BROWSER gesetzt (nur er kennt die
        // Grundstücksgeometrie, siehe ACKERRASTER_MARKE im GameContainer) und muss
        // deshalb durch den PUT hindurch — anders als die Server-Marken, die aus dem
        // bestehenden Stand übernommen werden.
        [ACKERRASTER_MARKE]: state[ACKERRASTER_MARKE] === true,
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
        // Uralter Rückfall (head/body als zwei getrennte Bilder) stammte noch aus
        // der Zeit vor dem einteiligen Skin — beide Dateien gibt es längst nicht
        // mehr, und gelesen wird ohnehin nur `.skin` (siehe garden:appearance in
        // world/lobby.js, Renderer.js drawPlayer). Jetzt derselbe STANDARD_SKIN
        // wie überall sonst (aktuell die Katze im Farmer-Look, farmer/normal.png).
        appearance: state.appearance || { skin: STANDARD_SKIN },
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
// v2-Fundament: Acker ist nur noch EIN 7×7-Block (vorher 15 = 7+Weg+7, zwei Blöcke)
// — die frühere zweite Hälfte fällt komplett weg (nicht Stein, einfach weg), das
// Grundstück ist dadurch insgesamt eine Bande kürzer. Siehe
// Frontend/src/pages/GardenGame/engine/MapConfig.js.
const BASE_DIRT_ROWS = 7;
// Reihen der Grundstückserweiterung — UNVERÄNDERT seit v3.3, auch nach dem
// v2-Fundament (das kürzt nur den Acker, nicht das Steinfeld). Muss zu
// STEIN_REIHEN in Frontend/src/pages/GardenGame/engine/MapConfig.js passen —
// dort steht auch, warum es 16 sind (vier Steinblöcke à 7×7).
const EXTRA_PLOT_ROWS = 16;
// Länge eines Block-Zyklus im Steinfeld: 1 Holzweg + 7 Stein. Spiegel von
// STEINBLOCK_PERIODE in MapConfig.js.
const STEINBLOCK_PERIODE = 8;
/** Liegt Reihe r (1 = direkt am Acker) auf einem Holzweg? Spiegel von
 * istSteinfeldWegRow in MapConfig.js — dort mehr dazu, warum es kein fester
 * Einzelvergleich mehr ist. */
function istSteinfeldWegRow(r) {
    return r >= 1 && (r - 1) % STEINBLOCK_PERIODE === 0;
}
const WEG_SPALTE = 7;
// Grundstücksmaß in Kacheln — muss zu MAP_CONFIG.territoryWidth/Height / TILE_SIZE
// im Frontend passen (29×25 — X war 28, siehe dortiger Kommentar zur fehlenden
// Graskachel rechts; Y war 33, siehe dortiger Kommentar zur v2-Ackerkürzung).
// Nur für die Grenzprüfung der Gebäudestandorte.
const GRUNDSTUECK_KACHELN_X = 29;
const GRUNDSTUECK_KACHELN_Y = 25;
const RARITY_ORDER = ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY", "MYTHIC"];
const RARITY_WEIGHTS = { COMMON: 10, UNCOMMON: 6, RARE: 3, EPIC: 2, LEGENDARY: 1, MYTHIC: 0.5 };
const MAX_PLOT_EXPANSIONS = EXTRA_PLOT_ROWS;
const TOOL_SHOP_ITEMS = [
    // Kein Lagerbestand: die Spitzhacke ist immer vorrätig. Gebremst wird sie über
    // ihren Preis, der im Client mit jedem Kauf steigt (getPickaxePrice) — ein
    // zusätzliches Limit pro Shop-Rotation hieß nur zehn Minuten warten.
    // `price` ist hier nur der GRUNDPREIS und wird vom Client nicht verwendet: die
    // Spitzhacke rechnet mit getPickaxePrice(gekaufte) = 50.000 · 1,26^n, damit der
    // Preis mit jedem Kauf steigt. Der Wert stand trotzdem noch auf 40.000 und war
    // damit eine falsche Fährte für jeden, der hier nach dem Preis sucht.
    { id: "pickaxe", name: "Spitzhacke", emoji: "⛏️", price: 50000, type: "uses", uses: 4 },
    // BALANCING: Schaufel, Kiste und Vitrine kosteten 1 Mio / 750 k / 5 Mio und
    // waren damit im Lategame Sekundenkäufe — „permanente Meilensteine", die man
    // im Vorbeigehen mitnimmt. Jetzt sind es echte Ziele.
    { id: "shovel", name: "Schaufel", emoji: "🪓", price: 1000000, type: "permanent", stock: 1 },
    { id: "plant_pot", name: "Plant Pot", emoji: "🪴", price: 1800, type: "single", stock: 10 },
    // `stock` hier ist nur ein Platzhalter: gebremst wird über den in werkzeug.js
    // exponentiell steigenden Preis, nicht über ein Rotations-Kontingent (siehe
    // WERKZEUGE.backpack_upgrade dort — bestand: null). Ein Limit von 1 pro Zehn-
    // Minuten-Rotation hätte das Upgrade trotz vollem Gold ausgebremst.
    { id: "backpack_upgrade", name: "Rucksack Upgrade", emoji: "🎒", price: 20000, type: "permanent", stock: 1 },
    // Preis wie bei Magic Garden. Sie muss billig bleiben, damit sie sich auch auf
    // kleinen Pflanzen lohnt — gebremst wird sie über ihre WIRKUNG (10 % Restzeit
    // im Grundzustand), nicht über den Preis.
    { id: "watering_can", name: "Gießkanne", emoji: "🪣", price: 5000, type: "single", stock: 10 },
    // Beide stehen dauerhaft auf dem Grundstück, deshalb "permanent" mit Bestand 1.
    { id: "chest", name: "Vorratskiste", emoji: "📦", price: 750000, type: "permanent", stock: 1 },
    { id: "vitrine", name: "Vitrine", emoji: "🏆", price: 5000000, type: "permanent", stock: 1 },
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
    // BALANCING Aug 2026: war 800 Mio — bei zweistelligem Milliarden-Einkommen kaum
    // mehr als Wechselgeld, und mit dem eigenen Anspruch oben ("sanft steigende
    // Amortisation") nicht mehr zu halten: die Kurve wäre entweder bei Common absurd
    // teuer geworden oder bei Legendary lächerlich billig geblieben. Legendary gibt
    // diesen Anspruch deshalb bewusst auf — wer eine kauft, tut es fürs Götterwesen
    // (1 % Chance) oder zum Nachrüsten des Tierplatzes, nicht für die Amortisation.
    // Common/Uncommon/Rare/Epic bleiben unverändert für den Mittelbau des Spiels.
    { id: "legendary_egg", name: "Legendary Egg", emoji: "🥚", image: "/garden-assets/eggs/legendary_egg.png", rarity: "LEGENDARY", price: 15000000000,
      hatchTable: [{ type: "Einhorn", chance: 40, level: 4 }, { type: "Tiger", chance: 30, level: 5 }, { type: "Phönix", chance: 20, level: 5 }, { type: "Drache", chance: 9, level: 5 }, { type: "Götterwesen", chance: 1, level: 5 }] },
];

/**
 * Das Sortiment des Samenladens — ABGELEITET aus dem Katalog, nicht danebengepflegt.
 *
 * WARUM DAS WICHTIG IST: bis v4.0 stand hier eine zweite, von Hand geschriebene
 * Liste derselben 57 Sorten mit eigenen Preisen. Der Laden liest SIE, nicht den
 * Katalog — und beim Balancing ist sie nicht mitgezogen worden. Verkauft wurde
 * deshalb weiter zu den alten Preisen:
 *
 *   Cranberry     3.500 statt  55.000   (6 % des vorgesehenen Preises)
 *   Stachelbeere  6.000 statt  25.900   (23 %)
 *   Blaubeere    10.000 statt  30.200   (33 %)
 *   Zucchini        500 statt   2.000   (25 %)
 *
 * Alles Dauerträger, deren Fruchtwerte längst auf den neuen Saatgutpreis ausgelegt
 * waren — die Cranberry brachte damit das Sechzehnfache ihres Einkaufs pro Zyklus.
 * In der Gegenrichtung zahlte man für Kokosnuss und Dattel das Zehn- bzw. Dreifache.
 *
 * Als Ableitung kann das nicht mehr auseinanderlaufen. Preise ändert man ab jetzt
 * ausschliesslich in garden/core/catalogue.js (und dessen Frontend-Spiegel).
 */
const SHOP_POOL = SEED_CATALOGUE.map((s) => ({
    seedId:     s.id,
    name:       s.name,
    emoji:      s.emoji,
    rarity:     s.rarity,
    shopPrice:  s.shopPrice,
    singleUse:  !!s.singleUse,
    // Erscheinungschance und Ladenbestand JE SORTE (aus Magic Garden übernommen).
    // Vorher hing beides pauschal an der Bauart — jede Einzelpflanze 5-20 Stück,
    // jeder Dauerträger 1-4. Damit stand die Mondblume für 50 Mrd genauso oft und
    // genauso reichlich im Regal wie ein Löwenzahn für 10.
    shopChance: Number(s.shopChance) || 0,
    stockMin:   Math.max(1, Number(s.stockMin) || 1),
    stockMax:   Math.max(1, Number(s.stockMax) || 1),
}));

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
/**
 * Standort des Schuppens (Kiste/Vitrine/Mülleimer, v2 Feedback 29.08.):
 * Kachel-Versatz der oberen linken Ecke seines quadratischen Fußabdrucks
 * innerhalb des eigenen Grundstücks. Werte außerhalb werden verworfen — dann
 * steht das Gebäude wieder am Standardplatz, statt irgendwo in der Welt zu
 * landen. Muss zu SCHUPPEN_KACHELN im Frontend passen (war 2, Feedback
 * 30.08.: "sieht klein aus", jetzt 3).
 */
const SCHUPPEN_KACHELN = 3;
function normalizeGebaeudeVersatz(roh) {
    // Grundstück ist 28×33 Kacheln (MAP_CONFIG im Frontend) — hier nur die Grenzen,
    // die Geometrie selbst braucht der Server nicht.
    const maxX = GRUNDSTUECK_KACHELN_X - SCHUPPEN_KACHELN;
    const maxY = GRUNDSTUECK_KACHELN_Y - SCHUPPEN_KACHELN;
    const tx = Number(roh?.shed?.tx);
    const ty = Number(roh?.shed?.ty);
    if (!Number.isInteger(tx) || !Number.isInteger(ty)) return { shed: null };
    if (tx < 0 || tx > maxX || ty < 0 || ty > maxY) return { shed: null };
    return { shed: { tx, ty } };
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
        if (istSteinfeldWegRow(row)) continue;
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
/**
 * Nachziehzähler JE SORTE.
 *
 * WARUM überhaupt: Eine Sorte mit 1 % je Fünf-Minuten-Rotation heißt im Mittel
 * 500 Minuten SPIELZEIT. Wer täglich zehn Minuten zum Abernten vorbeikommt, sieht
 * zwei Rotationen und wartet damit Monate auf genau die Sorten, die für seinen
 * Rhythmus gebaut sind (lange Zyklen). Das Tor wäre Spielzeit, nicht Gold — und
 * träfe ausgerechnet die Gruppe, die am wenigsten davon hat.
 *
 * WARUM JE SORTE und nicht mehr je Seltenheit: Der Zähler wurde zurückgesetzt,
 * sobald IRGENDEINE Sorte dieser Seltenheit auftauchte. Unter den RAREs steht die
 * Erdbeere mit 40 % neben der Aprikose mit 5 % — die Erdbeere hat den Zähler
 * praktisch jede Rotation geleert, und die Aprikose war nie geschützt. Jetzt hat
 * jede Sorte ihren eigenen Zähler, gedeckelt auf `PITY_FAKTOR` mal ihre erwartete
 * Wartezeit (1/Chance). Wer Pech hat, wartet höchstens doppelt so lang wie im
 * Mittel — bei allen Sorten gleichermaßen.
 */
const PITY_FAKTOR = 2;
const PITY_MAX_ROTATIONEN = 576;   // 48 h bei fünf Minuten je Rotation
const pityZaehler = new Map();     // seedId → Rotationen ohne Auftritt

/** Nach wie vielen erfolglosen Rotationen eine Sorte erzwungen wird. */
function pityGrenze(seed) {
    const chance = Math.max(0.0001, Number(seed.shopChance) || 0);
    return Math.min(PITY_MAX_ROTATIONEN, Math.ceil(PITY_FAKTOR / chance));
}

function generateGlobalShopRotation() {
    const activeSet = new Set();
    for (const seed of SHOP_POOL) {
        if (Math.random() < seed.shopChance) activeSet.add(seed.seedId);
    }

    // Nachzug: jede Sorte, die zu lange nicht da war, wird hereingeholt.
    for (const seed of SHOP_POOL) {
        if (activeSet.has(seed.seedId)) { pityZaehler.set(seed.seedId, 0); continue; }
        const n = (pityZaehler.get(seed.seedId) || 0) + 1;
        const grenze = pityGrenze(seed);
        if (n < grenze) { pityZaehler.set(seed.seedId, n); continue; }
        activeSet.add(seed.seedId);
        pityZaehler.set(seed.seedId, 0);
        console.log(`[Garden] Shop-Nachzug: ${seed.name} nach ${grenze} Rotationen erzwungen `
            + `(Chance ${(seed.shopChance * 100).toFixed(3)} %).`);
    }

    if (activeSet.size === 0 && SHOP_POOL.length > 0) {
        activeSet.add(SHOP_POOL[0].seedId);
    }

    /**
     * Der Vorrat gilt JE SPIELER — aber geführt wird er hier, nicht im Browser.
     *
     * Kurze Geschichte, weil beide Extreme schon da waren:
     *   bis v4.0  je Spieler, aber im Browser gezählt und vom Server nie geprüft.
     *             Ein veränderter Client konnte unbegrenzt kaufen.
     *   v4.0      ein einziger Vorrat für alle, serverseitig geprüft. Damit war das
     *             Loch zu — aber bei zwei Spielern im späten Spiel kaufte einer dem
     *             anderen die ein bis zwei Epic-Samen weg, und für den Rest blieb
     *             nichts. Genau das ist gemeldet worden.
     *   jetzt     je Spieler UND serverseitig geprüft. Die Rotation legt fest, wie
     *             viel JEDER von einer Sorte nehmen darf; `seedVerbrauch` zählt mit,
     *             wer davon schon wie viel geholt hat. Beide Ziele erfüllt: kein
     *             Wettlauf um dieselben Samen, und der Browser bestimmt nichts.
     */
    const bestand = {};
    for (const seed of SHOP_POOL) {
        bestand[seed.seedId] = activeSet.has(seed.seedId)
            ? randomInt(seed.stockMin, seed.stockMax)
            : 0;
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
        stock:      bestand[seed.seedId],
        stockStart: bestand[seed.seedId],
    })).sort((a, b) => {
        const ro = RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity);
        return ro !== 0 ? ro : a.shopPrice - b.shopPrice;
    });
    const now = Date.now();
    // `bestand` wandert mit heraus: die Rotation IST das Kontingent je Spieler, ein
    // zweiter Zähler daneben könnte davon abweichen.
    return { seeds, bestand, generatedAt: now, nextRotation: getNextRotationAt(now, SHOP_ROTATION_MS) };
}

/**
 * Werkzeug-Vorrat je Spieler und Rotation — dieselbe Rechnung wie beim Samen.
 *
 * Bis August 2026 zählte der Browser mit und der Server prüfte gar nicht. Jetzt
 * gehört der Vorrat hierher, weil auch der Kauf hierher gehört.
 */
const werkzeugVerbrauch = new Map();   // twitchId → { gen, counts: { toolId: anzahl } }

function werkzeugRest(rotation, twitchId, toolId) {
    const eintrag = WERKZEUGE[toolId];
    if (!eintrag || eintrag.bestand === null) return Infinity;
    const gemerkt = werkzeugVerbrauch.get(String(twitchId));
    const schon = (gemerkt && gemerkt.gen === rotation?.generatedAt) ? (gemerkt.counts[toolId] || 0) : 0;
    return Math.max(0, eintrag.bestand - schon);
}

function werkzeugMerken(rotation, twitchId, toolId) {
    const id = String(twitchId);
    let eintrag = werkzeugVerbrauch.get(id);
    if (!eintrag || eintrag.gen !== rotation?.generatedAt) {
        eintrag = { gen: rotation?.generatedAt, counts: {} };
        werkzeugVerbrauch.set(id, eintrag);
    }
    eintrag.counts[toolId] = (eintrag.counts[toolId] || 0) + 1;
}

/** Der Werkzeugladen, wie dieser eine Spieler ihn sieht: Preis und SEIN Reststand. */
function werkzeugladenFuer(state, twitchId, rotation) {
    return Object.keys(WERKZEUGE).map((toolId) => ({
        id: toolId,
        preis: preisFuer(state || {}, toolId),
        stock: werkzeugRest(rotation, twitchId, toolId),
    }));
}

/**
 * Wer hat in DIESER Rotation wie viel von welcher Sorte gekauft.
 * twitchId → { gen, counts: { seedId: anzahl } }
 *
 * Bewusst nur im Arbeitsspeicher: ein Kontingent gilt genau eine Rotation, nach
 * einem Neustart ist die Rotation ohnehin neu. Der Eintrag eines Spielers wird
 * verworfen, sobald seine `gen` nicht mehr die aktuelle ist — die Map wächst
 * damit höchstens auf die Zahl der Spieler, die in dieser Rotation gekauft haben.
 */
const seedVerbrauch = new Map();

/** Wie viel dieser Spieler von der Sorte noch nehmen darf. */
function restBestand(rotation, twitchId, seedId) {
    const kontingent = Math.max(0, Number(rotation?.bestand?.[seedId]) || 0);
    const eintrag = seedVerbrauch.get(String(twitchId));
    if (!eintrag || eintrag.gen !== rotation?.generatedAt) return kontingent;
    return Math.max(0, kontingent - (eintrag.counts[seedId] || 0));
}

/** Einen Kauf auf das Kontingent anrechnen. */
function merkeKauf(rotation, twitchId, seedId) {
    const id = String(twitchId);
    let eintrag = seedVerbrauch.get(id);
    if (!eintrag || eintrag.gen !== rotation.generatedAt) {
        eintrag = { gen: rotation.generatedAt, counts: {} };
        seedVerbrauch.set(id, eintrag);
    }
    eintrag.counts[seedId] = (eintrag.counts[seedId] || 0) + 1;
}

/**
 * Die Rotation, wie dieser eine Spieler sie sieht: `stock` ist SEIN Reststand.
 * Das Original bleibt unangetastet — es ist der gemeinsame Bauplan.
 */
function rotationFuerSpieler(rotation, twitchId) {
    if (!rotation) return rotation;
    return {
        ...rotation,
        seeds: rotation.seeds.map((s) => ({ ...s, stock: restBestand(rotation, twitchId, s.seedId) })),
    };
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

/**
 * Einen Samen kaufen — Preis, Bestand und Gold liegen ALLE beim Server.
 *
 * Vorher lief das über die allgemeine Aktion `spend`: der Browser hat selbst
 * geprüft, ob noch etwas im Regal liegt, den eigenen Zähler heruntergesetzt und
 * dann nur noch Gold abbuchen lassen. Der Bestand war damit eine reine Anzeige —
 * ein veränderter Client konnte beliebig viele Mondblumen kaufen, solange das Gold
 * reichte, und den Preis gleich mit bestimmen.
 *
 * Node führt jede Anfrage bis zum nächsten `await` am Stück aus. Diese Funktion
 * enthält keines, Prüfung und Abbuchung können also nicht auseinandergerissen
 * werden — zwei gleichzeitige Käufe des letzten Stücks sind nicht möglich.
 */
function kaufeSamen(state, seedId, twitchId) {
    const seed = SHOP_POOL.find((s) => s.seedId === String(seedId || ""));
    if (!seed) return { ok: false, status: 400, error: "Diesen Samen gibt es nicht." };

    const rotation = globalShopState.rotation;
    const eintrag = rotation.seeds.find((s) => s.seedId === seed.seedId);
    if (!eintrag || !eintrag.active) {
        return { ok: false, status: 400, error: `${seed.name} ist gerade nicht im Angebot.` };
    }

    // Reststand DIESES Spielers, nicht der aller zusammen.
    const uebrig = restBestand(rotation, twitchId, seed.seedId);
    if (uebrig <= 0) {
        return {
            ok: false, status: 409, stock: 0,
            error: `Dein Vorrat an ${seed.name} ist für diese Rotation aufgebraucht.`,
        };
    }

    const preis = Math.max(0, Number(seed.shopPrice) || 0);
    const gold = Math.max(0, Number(state.gold) || 0);
    if (gold < preis) {
        return {
            ok: false, status: 400,
            error: `Dafür fehlen dir ${(preis - gold).toLocaleString("de-DE")} Gold.`,
        };
    }

    // NICHT mehr `rotation.bestand`/`eintrag.stock` herunterzählen: die gehören
    // allen gemeinsam und sind das Kontingent, nicht der Reststand. Angerechnet
    // wird ausschliesslich auf den Zähler dieses Spielers.
    merkeKauf(rotation, twitchId, seed.seedId);
    state.gold = gold - preis;

    return {
        ok: true,
        gold: state.gold,
        bezahlt: preis,
        stock: uebrig - 1,
        // Der Rucksack gehört weiter dem Browser (wie Deko und Werkzeug). Der
        // Server gibt nur die Kennung vor, damit zwei Tabs nicht dieselbe erzeugen.
        samen: {
            instanceId: uuidv4(),
            seedId: seed.seedId,
            name: seed.name,
            emoji: seed.emoji,
            rarity: seed.rarity,
            shopPrice: seed.shopPrice,
            singleUse: seed.singleUse,
        },
    };
}

/**
 * Buy-All (v2, Punkt 12): denselben Samen wiederholt kaufen, bis Vorrat ODER
 * Gold ausgeht — EIN Request statt N Einzelkäufen vom Client hintereinander.
 *
 * WARUM DAS EIN EIGENER ENDPUNKT IST, nicht nur eine Schleife im Browser: bei
 * N Einzelanfragen weiss der Client bei einem Fehlschlag mittendrin nur "der
 * letzte Versuch ist gescheitert" — wie viele DAVOR schon durchgegangen sind,
 * müsste er selbst mitzählen und könnte dabei mit dem Server auseinanderlaufen
 * (z. B. bei einem Verbindungsabbruch zwischen zwei Anfragen). Hier prüft und
 * bucht jeder einzelne Kauf innerhalb DERSELBEN Anfrage — kein await dazwischen,
 * also keine Lücke, in der ein zweiter Tab reingrätschen könnte.
 */
function kaufeSamenAlle(state, seedId, twitchId) {
    const samenListe = [];
    let bezahltGesamt = 0;
    let ersterFehler = null;
    let stock = null;
    // Obergrenze als Notbremse, nicht als erwarteter Fall — kein Samenpreis liegt
    // je bei 0, aber eine Endlosschleife bei einem Rechenfehler wäre schlimmer
    // als ein zu früher Abbruch.
    for (let i = 0; i < 999; i++) {
        const antwort = kaufeSamen(state, seedId, twitchId);
        if (!antwort.ok) { if (samenListe.length === 0) ersterFehler = antwort; break; }
        samenListe.push(antwort.samen);
        bezahltGesamt += antwort.bezahlt || 0;
        stock = antwort.stock;
    }
    if (samenListe.length === 0) return ersterFehler;
    return { ok: true, gold: state.gold, bezahltGesamt, anzahl: samenListe.length, stock, samenListe };
}

// ─── HTTP Routes ──────────────────────────────────────────────────────────────
module.exports = function ({ requireAuth }) {
    // Party-Veredelung: veredelt reihum, solange eine Party läuft, und meldet dem
    // Besitzer, was passiert ist (siehe garden/world/ereignisse.js).
    ereignisse.starteVeredelung(farmStates, {
        melde: (twitchId, zellen) => notifyVeredelt(twitchId, zellen),
        scheduleFarmsSave,
        istOnline,
        istAktiv: istAktivGenug,
    });

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
            // Personalisiert: `stock` ist der Reststand DIESES Spielers. Die Auswahl
            // der Sorten und ihre Preise sind für alle gleich.
            shopRotation: rotationFuerSpieler(globalShopState.rotation, req.twitchId),
            nextRotation: globalShopState.nextRotationAt,
            toolShopRotation: globalToolShopState.rotation,
            nextToolRotation: globalToolShopState.nextRotationAt,
            // Wetter- und Party-Übersteuerung. Kommt bei jedem Poll mit, damit auch ein
            // Browser, der die Socket-Meldung verpasst hat, spätestens nach vier
            // Sekunden dasselbe sieht wie alle anderen.
            welt: ereignisse.stand(),
            // Preis und Reststand kommen vom Server, weil auch der Kauf dort liegt.
            // Vorher rechnete der Browser den Spitzhackenpreis selbst — und wich nach
            // einem Nachladen vom Server ab, worauf der Kauf still fehlschlug.
            werkzeugladen: werkzeugladenFuer(farmStates.get(String(req.twitchId)), req.twitchId, globalToolShopState.rotation),
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
        // Der Kanalinhaber gilt als Abonnent.
        //
        // WARUM: Twitch beantwortet /subscriptions für ihn IMMER mit einer leeren
        // Liste — man kann seinen eigenen Kanal nicht abonnieren. Damit stand der
        // Streamer als Nicht-Abonnent da und bekam die 50 % Verkaufsbonus nicht,
        // die jeder Sub bekommt. Die Abfrage kann das nicht liefern, also steht es
        // hier. Gilt für Abzeichen UND Bonus, weil beide durch diese Funktion gehen.
        if (istAdminId(userId)) return true;

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
        // `isAdmin` kommt mit, damit der Browser das Abzeichen nicht aus einer
        // eigenen, fest verdrahteten Zahl ableiten muss. Verlassen tut sich darauf
        // nichts Sicherheitsrelevantes — die Lobby prüft die ID ohnehin selbst.
        res.json({ isSubscriber: isSub, isBeta, isAdmin: istAdminId(userId) });
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
            neu[ACKERRASTER_MARKE] = true;
            neu[TIERPLATZ_MARKE] = true;
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
        //
        // ── KEINE Offline-Verrechnung mehr ────────────────────────────────────
        // Bis August 2026 stand hier `verrechneOffline`: Goldfinder und Erntehelfer
        // haben bis zu acht Stunden Abwesenheit nachgezahlt, der Helfer räumte dabei
        // das Feld ab und verkaufte es. Belohnt wurde damit das Wegbleiben. Tiere
        // sind jetzt reine Boni auf das, was der Spieler selbst tut — siehe
        // garden/core/pets.js. `petsAbgerechnetBis` bleibt im Spielstand stehen und
        // stört dort nicht; ein Feld zu löschen wäre mehr Risiko als Nutzen.
        setFarmState(farmStates, userId, advanced);
        scheduleFarmsSave(farmStates);
        res.json({ state: advanced, skillStand: skillStand(advanced) });
    });

    /**
     * Der Fähigkeitsbaum als Bauplan. Kommt bewusst vom Server, obwohl ihn nur der
     * Browser zeichnet: die Stufenwerte stehen sonst zweimal da, und eine Fähigkeit,
     * deren Prozentzahl in der Anzeige von der in der Kasse abweicht, ist schlimmer
     * als gar keine Anzeige.
     */
    router.get("/skills", requireAuth, (req, res) => {
        const state = farmStates.get(String(req.twitchId));
        // `xpJeSorte` kommt aus demselben Grund mit wie der Baum: der Browser soll an
        // der Pflanze anzeigen können, was sie an Erfahrung bringt, ohne die Formel ein
        // zweites Mal zu führen. Seit die Erfahrung auch an der Zykluslänge hängt, ist
        // es eine Tabelle JE SORTE statt je Seltenheit. Vergeben wird sie weiterhin
        // ausschliesslich serverseitig (core/skills.js → gibXp).
        res.json({ katalog: SKILLS, stand: skillStand(state || {}), xpJeSorte: xpTabelle() });
    });

    // GET /api/garden/quests — Missionsbrett: laufende Missionen samt Fortschritt.
    // Serverautoritativ wie der Fähigkeitsbaum: welche Missionen laufen und wie
    // weit sie sind, entscheidet ausschliesslich diese Route (core/quests.js).
    router.get("/quests", requireAuth, (req, res) => {
        const userId = String(req.twitchId);
        const state = farmStates.get(userId);
        if (!state) return res.status(400).json({ error: "Keine Farm gefunden." });
        res.json(quests.questUebersicht(state));
    });

    // GET /api/garden/reskins — der Gold-Shop: Katalog samt "schon gekauft" je
    // Stück, plus was gerade ausgerüstet ist. Serverautoritativ wie Quests/Skills.
    router.get("/reskins", requireAuth, (req, res) => {
        const userId = String(req.twitchId);
        const state = farmStates.get(userId);
        if (!state) return res.status(400).json({ error: "Keine Farm gefunden." });
        res.json(reskins.reskinUebersicht(state));
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
        // Lebenszeit-Gold (v2, Feedback 29.08.: "Gesamt gesammeltes Gold" in der
        // Profil-Bubble) — genauso Serverbesitz wie der Kontostand selbst, sonst
        // könnte ein Client sich einen beliebigen Rekord eintragen.
        compact.goldGesamt = farmStates.has(userId) ? Math.max(0, Number(existing.goldGesamt) || 0) : 0;
        compact.harvestedItems = sanitizeItemArray(existing.harvestedItems);
        compact.chestItems = sanitizeItemArray(existing.chestItems);
        compact.vitrineItems = sanitizeItemArray(existing.vitrineItems);
        // Logbuch (v2, Punkt 11): seit die "Seite komplett"-Belohnung dranhängt,
        // genauso Serverbesitz wie die drei Zeilen darüber — bestehenden Stand
        // übernehmen statt den Client-Wert, sonst zahlt sich ein eingetragenes
        // fertiges Logbuch bei der nächsten Ernte selbst aus.
        compact.logbuch = isPlainObject(existing.logbuch) ? existing.logbuch : {};
        compact.logbuchBelohnungen = isPlainObject(existing.logbuchBelohnungen) ? existing.logbuchBelohnungen : {};
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
        // Missionsfortschritt gehört genauso dem Server wie xp/skills direkt darüber —
        // compactFarmState kennt das Feld nicht (kam erst mit core/quests.js dazu), ein
        // PUT hätte es sonst bei JEDEM Speichern stillschweigend gelöscht (gefunden beim
        // ersten Puppeteer-Test: Fortschritt fiel Sekunden nach dem Kauf auf 0 zurück).
        if (existing.quests && typeof existing.quests === "object") compact.quests = existing.quests;
        // Reskins genauso: rein serverseitig gekauft/ausgerüstet (core/reskins.js),
        // kennt compactFarmState nicht — ohne das hier ginge jeder Gold-Shop-Kauf
        // beim nächsten Speichern wieder verloren.
        if (existing.reskins && typeof existing.reskins === "object") compact.reskins = existing.reskins;
        // Marke der XP-Nachzahlung. Ginge sie verloren, liefe die Rechnung beim
        // nächsten Serverstart erneut über diesen Stand.
        if (existing[XP_MARKE]) compact[XP_MARKE] = true;
        if (existing[XP_MARKE_KURVE]) compact[XP_MARKE_KURVE] = true;
        if (existing[XP_MARKE_KORREKTUR]) compact[XP_MARKE_KORREKTUR] = true;
        if (existing[SKILL_STAFFEL_MARKE]) compact[SKILL_STAFFEL_MARKE] = true;
        if (existing[TIERPLATZ_MARKE]) compact[TIERPLATZ_MARKE] = true;
        // ── Der Werkzeugkasten gehört ab jetzt GANZ dem Server ────────────────
        // Vorher kam er aus dem PUT, nur Schaufel, Kiste und Vitrine waren geschützt.
        // Damit lag zwischen „bezahlt" (Gold ist Serverbesitz) und „gespeichert"
        // (Werkzeug war Browserbesitz) eine Lücke: jeder Weg, der den Browserstand
        // verwirft — Nachladen nach Konflikt, Migration beim Deploy, zweiter Tab —
        // liess das Gold verschwinden und das Werkzeug nicht ankommen.
        //
        // Gekauft und verbraucht wird jetzt über POST /action (buyTool / useTool),
        // beides in einem Schritt mit dem Gold. Was hier aus dem Client käme, wäre
        // bestenfalls überflüssig und schlimmstenfalls eine Fälschung.
        compact.toolInventory = werkzeugVon(existing);
        // Die Marke der Steinfeld-Umstellung MUSS mit. Ginge sie beim Speichern
        // verloren, liefe die Migration beim nächsten Serverstart erneut und würde
        // dieselben Zellen ein zweites Mal nach außen schieben.
        if (existing[STEINFELD_MARKE]) compact[STEINFELD_MARKE] = true;
        if (existing[STEINFELD_MARKE_ALT]) compact[STEINFELD_MARKE_ALT] = true;
        if (existing[STEINFELD_MARKE_WEGE]) compact[STEINFELD_MARKE_WEGE] = true;
        // Einmal umgestellt bleibt umgestellt: ein alter Tab, der die Marke noch nicht
        // kennt, darf sie nicht wieder abräumen.
        if (existing[ACKERRASTER_MARKE]) compact[ACKERRASTER_MARKE] = true;
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
        if (aktion === "sellAll") {
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
        } else if (aktion === "harvestAll") {
            // Sammel-Ernte (Feedback 30.08.: "Shift-Ziehen erntet mit viel Lag") —
            // dieselbe Berechnung wie "harvest", nur alle reifen Fruchtstände
            // dieser Zelle in EINEM Aufruf statt einem je Frucht. Siehe
            // harvestCellAll in core/economy.js.
            const key = String(req.body?.key || "");
            if (!ZELL_SCHLUESSEL.test(key)) return res.status(400).json({ error: "Ungültige Zelle." });
            ergebnis = harvestCellAll(state, key);
        } else if (aktion === "harvestMany") {
            // Sammel-Ernte über VIELE Zellen (Feedback 30.08., zweite Runde: "lagged
            // trotzdem beim Ziehen, wenn gleichzeitig etwas nachwächst") — ein Zug
            // beim Schnellernten berührt oft dutzende Zellen; harvestAll oben bündelt
            // nur JE Zelle. Siehe harvestManyCells in core/economy.js.
            const roheKeys = Array.isArray(req.body?.keys) ? req.body.keys : [];
            const keys = roheKeys.map((k) => String(k || "")).filter((k) => ZELL_SCHLUESSEL.test(k));
            if (keys.length === 0) return res.status(400).json({ error: "Ungültige Zelle." });
            ergebnis = harvestManyCells(state, keys);
        } else if (aktion === "spend") {
            ergebnis = spendGold(state, req.body?.amount);
        } else if (aktion === "buySeed") {
            // Samenkauf mit Bestandsprüfung. Der alte Weg (`spend` plus ein Zähler
            // im Browser) bleibt für alles andere bestehen, für Samen nicht mehr.
            ergebnis = kaufeSamen(state, req.body?.seedId, userId);
        } else if (aktion === "buySeedAll") {
            // Buy-All (v2, Punkt 12) — siehe kaufeSamenAlle oben.
            ergebnis = kaufeSamenAlle(state, req.body?.seedId, userId);
        } else if (aktion === "buyTool") {
            // Preis, Vorrat und Gutschrift liegen ALLE beim Server — siehe
            // garden/core/werkzeug.js. Der Browser nennt nur, was er will.
            const rotation = globalToolShopState.rotation;
            ergebnis = kaufeWerkzeug(state, req.body?.toolId, {
                restVorrat: (id) => werkzeugRest(rotation, userId, id),
                merkeKauf: (id) => werkzeugMerken(rotation, userId, id),
                freigelegteFelder: normalizePlotUnlockedCells(state.plotUnlockedCells).length,
                goldMax: GOLD_MAX,
            });
        } else if (aktion === "buyToolAll") {
            // Buy-All (v2, Punkt 12) — siehe kaufeWerkzeugAlle in werkzeug.js.
            // Wirkt auf JEDES Werkzeug korrekt, ohne Sonderfälle: Verbrauchsgüter
            // (Gießkanne, Pflanztopf) kaufen bis der Vorrat der Rotation leer ist,
            // Spitzhacke/Rucksack bis Gold oder ihr eigener Deckel erreicht ist,
            // Einmaliges (Schaufel, Kiste, Vitrine) kauft genau eins und stoppt
            // danach von selbst — dieselbe Prüfung wie beim Einzelkauf entscheidet
            // jedes Mal neu.
            const rotation = globalToolShopState.rotation;
            ergebnis = kaufeWerkzeugAlle(state, req.body?.toolId, {
                restVorrat: (id) => werkzeugRest(rotation, userId, id),
                merkeKauf: (id) => werkzeugMerken(rotation, userId, id),
                freigelegteFelder: normalizePlotUnlockedCells(state.plotUnlockedCells).length,
                goldMax: GOLD_MAX,
            });
        } else if (aktion === "useTool") {
            // Verbrauch geht denselben Weg wie der Kauf: sonst liesse sich eine
            // Gießkanne beliebig oft benutzen, indem man den Browserstand zurückdreht.
            ergebnis = verbraucheWerkzeug(state, req.body?.feld, req.body?.anzahl);
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
        } else if (aktion === "questAbholen") {
            // Belohnung heißt hier bewusst belohnungGold/belohnungXp, nicht
            // gold/xp — die Gutschrift selbst passiert hier, damit core/quests.js
            // nicht von core/economy.js abhängen muss (siehe Kommentar dort), und
            // die Antwort-Hülle unten mischt ergebnis per Spread in ein Objekt,
            // das schon ein eigenes `gold` führt (den Kontostand). Ein Feld
            // `gold` hier hätte den Kontostand in der Antwort mit der
            // Belohnungshöhe überschrieben.
            const abgeholt = quests.questAbholen(state, req.body?.questId);
            if (abgeholt.ok) {
                gutschreiben(state, abgeholt.belohnungGold);
                gibFesteXp(state, abgeholt.belohnungXp);
            }
            ergebnis = abgeholt;
        } else if (aktion === "reskinKaufen") {
            // Abbuchung passiert direkt in core/reskins.js (wie der Samen-Kauf in
            // core/economy.js) — kein gutschreiben/spendGold nötig, der Preis ist
            // vorher gegen den Kontostand geprüft.
            ergebnis = reskins.reskinKaufen(state, req.body?.kategorie, req.body?.id);
        } else if (aktion === "reskinAusruesten") {
            ergebnis = reskins.reskinAusruesten(state, req.body?.kategorie, req.body?.id);
        } else {
            return res.status(400).json({ error: "Unbekannte Aktion." });
        }

        if (!ergebnis.ok) {
            return res.status(ergebnis.status || 400).json({
                error: ergebnis.error,
                // Bei „ausverkauft" den echten Reststand mitgeben, damit die Anzeige
                // im Laden nicht weiter Ware zeigt, die es nicht mehr gibt.
                ...(typeof ergebnis.stock === "number" ? { stock: ergebnis.stock } : {}),
            });
        }

        // ── Missionen: Fortschritt aus TATSÄCHLICH gelungenen Aktionen ──────────
        // Bewusst HIER, an einer Stelle, statt in core/economy.js/werkzeug.js
        // verstreut: es ist derselbe Serverstand, dieselbe Erfolgsprüfung
        // (`ergebnis.ok`, gerade eben bestanden) — nur ausgewertet für Missions-
        // Zwecke statt für die eigentliche Antwort. Siehe core/quests.js, Kopf-
        // kommentar, für die Begründung, warum nur DIESE Aktionen zählen.
        if (aktion === "harvest") {
            const stuecke = [ergebnis.item, ergebnis.zweites].filter(Boolean);
            quests.melde(state, quests.TYP.ERNTE_ANZAHL, stuecke.length);
            quests.melde(state, quests.TYP.ERNTE_GOLD, stuecke.reduce((s, it) => s + (Number(it?.sellValue) || 0), 0));
        } else if (aktion === "harvestAll") {
            const stuecke = Array.isArray(ergebnis.items) ? ergebnis.items : [];
            quests.melde(state, quests.TYP.ERNTE_ANZAHL, stuecke.length);
            quests.melde(state, quests.TYP.ERNTE_GOLD, stuecke.reduce((s, it) => s + (Number(it?.sellValue) || 0), 0));
        } else if (aktion === "harvestMany") {
            let anzahl = 0; let gold = 0;
            for (const teil of Object.values(ergebnis.ernten || {})) {
                if (!teil?.ok) continue;
                const stuecke = Array.isArray(teil.items) ? teil.items : [];
                anzahl += stuecke.length;
                gold += stuecke.reduce((s, it) => s + (Number(it?.sellValue) || 0), 0);
            }
            quests.melde(state, quests.TYP.ERNTE_ANZAHL, anzahl);
            quests.melde(state, quests.TYP.ERNTE_GOLD, gold);
        } else if (aktion === "sellAll") {
            quests.melde(state, quests.TYP.VERKAUF_GOLD, Number(ergebnis.verdient) || 0);
        } else if (aktion === "useTool" && String(req.body?.feld) === "wateringCans") {
            quests.melde(state, quests.TYP.GIESSEN_ANZAHL, Number(ergebnis.verbraucht) || 0);
        } else if (aktion === "buySeed") {
            quests.melde(state, quests.TYP.SAMEN_KAUF, 1);
        } else if (aktion === "buySeedAll") {
            quests.melde(state, quests.TYP.SAMEN_KAUF, Number(ergebnis.anzahl) || 0);
        }

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
            goldGesamt: state.goldGesamt ?? 0,
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
            // Seit der Werkzeugkasten dem Server gehört, muss er bei jeder Aktion
            // mitkommen — sonst zeigt der Browser eine Kanne, die es nicht mehr gibt.
            toolInventory: werkzeugVon(state),
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
            goldGesamt: state?.goldGesamt ?? 0,
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
