// garden/core/brutkasten.js
// Eier kaufen, Brutkasten, Schlüpfen — und der Abgleich der Tiere beim Speichern.
//
// WARUM SERVER
// Bis November 2026 lief das alles im Browser: Kauf über die allgemeine Aktion
// `spend`, Ei in den Rucksack, Schlüpf-Ergebnis und Brutzeit im Browser gewürfelt,
// fertiges Tier in den Rucksack — und der Rucksack kam beim Speichern ungeprüft
// an. Gleichzeitig zahlt der Server für jedes Tier in diesem Rucksack Gold aus
// (Verkauf, Goldfinder). Ein per Konsole eingetragenes Legendary-Tier war damit
// echtes Gold.
//
// Jetzt gilt dieselbe Regel wie bei Samen und Werkzeug: was Wert hat, entsteht
// auf dem Server. Der Browser darf Tiere nur noch AUFSTELLEN, EINPACKEN und
// UMBENENNEN (siehe gleicheTiereAb), Eier und Brutkasten gehören ganz dem Server.

const { randomUUID } = require("crypto");
const { petId } = require("./pets");

/** Brutzeit je Seltenheit des Eies. Spiegel des alten Browser-Werts (Feedback 01.09.). */
const BRUTZEIT_MS = {
    COMMON: 1 * 60 * 60 * 1000,
    UNCOMMON: 4 * 60 * 60 * 1000,
    RARE: 12 * 60 * 60 * 1000,
    EPIC: 24 * 60 * 60 * 1000,
    LEGENDARY: 3 * 24 * 60 * 60 * 1000,
};
const BRUTZEIT_STANDARD = 4 * 60 * 60 * 1000;

/** Preis für Brutplatz 2–5. Spiegel von INCUBATOR_UNLOCK_COSTS im Browser. */
const BRUTPLATZ_PREISE = [50000, 500000, 5000000, 50000000];
const BRUTPLAETZE_MAX = 5;

/** Drei Fähigkeiten-Plätze auf dem Grundstück (siehe migrations/tierplaetze.js). */
const TIERPLAETZE = 3;

const FAEHIGKEITEN = ["goldfinder", "seedfinder", "harvester", "forscher", "kaufmann"];
const STUFE_NACH_SELTENHEIT = { COMMON: 1, UNCOMMON: 2, RARE: 3, EPIC: 4, LEGENDARY: 5, MYTHIC: 6 };

/** Emoji je Tierart — fürs Anzeigen, Bilder baut der Browser aus dem Namen. */
const TIER_EMOJI = {
    Huhn: "🐔", Ente: "🦆", Schwein: "🐷", Katze: "🐱", "Waschbär": "🦝", Kuh: "🐮",
    Schaf: "🐑", Ziege: "🐐", Pferd: "🐎", Esel: "🫏", Hund: "🐕", Einhorn: "🦄",
    Tiger: "🐯", "Phönix": "🐦‍🔥", Drache: "🐉", "Götterwesen": "👼",
};

function liste(state, feld) {
    return Array.isArray(state?.[feld]) ? state[feld] : [];
}

function brutkastenVon(state) {
    const roh = state?.incubator && typeof state.incubator === "object" ? state.incubator : {};
    const plaetze = Math.max(1, Math.min(BRUTPLAETZE_MAX, Math.floor(Number(roh.unlockedSlots) || 1)));
    const rohSlots = Array.isArray(roh.slots) ? roh.slots : [];
    const anzahl = Math.max(plaetze, Math.min(BRUTPLAETZE_MAX, rohSlots.length));
    const slots = Array.from({ length: anzahl }, (_, i) => {
        const s = rohSlots[i];
        return s && typeof s === "object" && s.egg ? s : null;
    });
    return { unlockedSlots: plaetze, slots };
}

// ── Eier-Laden: Reststand je Spieler und Rotation ───────────────────────────
// Wie beim Werkzeug: das Kontingent (`stock` der Rotation) gilt je Spieler.
const eierVerbrauch = new Map(); // twitchId → { gen, counts: { eggId: n } }

function eierRest(rotation, twitchId, eggId) {
    const eintrag = (rotation?.items || []).find((e) => e.id === eggId);
    if (!eintrag) return 0;
    const gemerkt = eierVerbrauch.get(String(twitchId));
    const schon = (gemerkt && gemerkt.gen === rotation.generatedAt) ? (gemerkt.counts[eggId] || 0) : 0;
    return Math.max(0, (Number(eintrag.stock) || 0) - schon);
}

function eierMerken(rotation, twitchId, eggId) {
    const id = String(twitchId);
    let eintrag = eierVerbrauch.get(id);
    if (!eintrag || eintrag.gen !== rotation.generatedAt) {
        eintrag = { gen: rotation.generatedAt, counts: {} };
        eierVerbrauch.set(id, eintrag);
    }
    eintrag.counts[eggId] = (eintrag.counts[eggId] || 0) + 1;
}

/** Aufräumen: Einträge alter Rotationen werfen (läuft im Takt der Route). */
function eierVerbrauchAufraeumen(rotation) {
    for (const [id, e] of eierVerbrauch) if (e.gen !== rotation?.generatedAt) eierVerbrauch.delete(id);
}

/** Ein Ei kaufen. Preis aus dem Katalog, Reststand aus der Rotation. */
function kaufeEi(state, eggId, { rotation, twitchId, katalog }) {
    const vorlage = katalog.find((e) => e.id === String(eggId || ""));
    if (!vorlage) return { ok: false, status: 400, error: "Dieses Ei gibt es nicht." };
    if (!(rotation?.items || []).some((e) => e.id === vorlage.id)) {
        return { ok: false, status: 400, error: `${vorlage.name} ist gerade nicht im Angebot.` };
    }
    const rest = eierRest(rotation, twitchId, vorlage.id);
    if (rest <= 0) return { ok: false, status: 409, stock: 0, error: `${vorlage.name} ist für diese Rotation ausverkauft.` };
    const preis = Math.max(0, Number(vorlage.price) || 0);
    const gold = Math.max(0, Number(state.gold) || 0);
    if (gold < preis) {
        return { ok: false, status: 400, error: `Dafür fehlen dir ${(preis - gold).toLocaleString("de-DE")} Gold.` };
    }
    eierMerken(rotation, twitchId, vorlage.id);
    state.gold = gold - preis;
    const ei = {
        id: vorlage.id, name: vorlage.name, emoji: vorlage.emoji, image: vorlage.image,
        rarity: vorlage.rarity, price: vorlage.price, instanceId: randomUUID(),
    };
    state.eggInventory = [...liste(state, "eggInventory"), ei];
    return { ok: true, gold: state.gold, ei, stock: rest - 1, incubator: brutkastenVon(state) };
}

/** Nächsten Brutplatz freischalten. */
function brutplatzFreischalten(state) {
    const kasten = brutkastenVon(state);
    if (kasten.unlockedSlots >= BRUTPLAETZE_MAX) return { ok: false, status: 400, error: "Alle Brutplätze sind frei." };
    const preis = BRUTPLATZ_PREISE[kasten.unlockedSlots - 1];
    const gold = Math.max(0, Number(state.gold) || 0);
    if (gold < preis) return { ok: false, status: 400, error: `Dafür brauchst du ${preis.toLocaleString("de-DE")} Gold.` };
    state.gold = gold - preis;
    kasten.unlockedSlots += 1;
    while (kasten.slots.length < kasten.unlockedSlots) kasten.slots.push(null);
    state.incubator = kasten;
    return { ok: true, gold: state.gold, incubator: kasten, platz: kasten.unlockedSlots };
}

/** Schlüpf-Ergebnis würfeln — vorher im Browser (rollHatchResult). */
function wuerfleSchluepfen(ei, katalog, rng = Math.random) {
    const vorlage = katalog.find((e) => e.id === ei?.id) || katalog.find((e) => e.rarity === ei?.rarity) || null;
    const tabelle = Array.isArray(vorlage?.hatchTable) ? vorlage.hatchTable : [];
    const faehigkeit = FAEHIGKEITEN[Math.floor(rng() * FAEHIGKEITEN.length)];
    const eiStufe = STUFE_NACH_SELTENHEIT[ei?.rarity] || 1;
    const sonder = rng();
    const specialType = sonder < 0.01 ? "Rainbow" : (sonder < 0.05 ? "Golden" : null);
    let treffer = tabelle[0] || { type: "Huhn", level: 1 };
    const wurf = rng() * 100;
    let summe = 0;
    for (const zeile of tabelle) {
        summe += Number(zeile?.chance || 0);
        if (wurf <= summe) { treffer = zeile; break; }
    }
    const stufe = Math.max(1, Math.min(5, Math.floor(Number(treffer.level) || eiStufe)));
    return {
        type: treffer.type,
        emoji: TIER_EMOJI[treffer.type] || "🐾",
        specialType,
        ability: { type: faehigkeit, level: stufe },
    };
}

/** Ein Ei aus dem Rucksack in einen freien Brutplatz legen. */
function eiEinlegen(state, platz, eiKennung, { katalog, now = Date.now() }) {
    const kasten = brutkastenVon(state);
    const i = Math.floor(Number(platz));
    if (!Number.isInteger(i) || i < 0 || i >= kasten.unlockedSlots) {
        return { ok: false, status: 400, error: "Dieser Brutplatz ist nicht frei geschaltet." };
    }
    if (kasten.slots[i]) return { ok: false, status: 400, error: "In diesem Brutplatz liegt schon ein Ei." };
    const eier = liste(state, "eggInventory");
    const idx = eier.findIndex((e) => e && String(e.instanceId) === String(eiKennung));
    if (idx === -1) return { ok: false, status: 400, error: "Dieses Ei hast du nicht." };
    const ei = eier[idx];
    const dauer = BRUTZEIT_MS[ei.rarity] || BRUTZEIT_STANDARD;
    kasten.slots[i] = { egg: ei, startedAt: now, hatchAt: now + dauer, hatchResult: wuerfleSchluepfen(ei, katalog) };
    state.eggInventory = [...eier.slice(0, idx), ...eier.slice(idx + 1)];
    state.incubator = kasten;
    return { ok: true, incubator: kasten, eggInventory: state.eggInventory };
}

/** Ein fertig gebrütetes Tier abholen. */
function eiAbholen(state, platz, { now = Date.now() } = {}) {
    const kasten = brutkastenVon(state);
    const i = Math.floor(Number(platz));
    const slot = Number.isInteger(i) ? kasten.slots[i] : null;
    if (!slot) return { ok: false, status: 400, error: "In diesem Brutplatz liegt kein Ei." };
    if (now < Number(slot.hatchAt)) return { ok: false, status: 400, error: "Das Ei ist noch nicht so weit." };
    const r = slot.hatchResult || {};
    const tier = {
        id: `pet_${randomUUID()}`,
        name: r.type || "Huhn",
        customName: null,
        emoji: r.emoji || TIER_EMOJI[r.type] || "🐾",
        rarity: slot.egg?.rarity || "COMMON",
        specialType: r.specialType || null,
        ability: r.ability || { type: "goldfinder", level: 1 },
    };
    kasten.slots[i] = null;
    state.incubator = kasten;
    state.petInventory = [...liste(state, "petInventory"), tier];
    return { ok: true, tier, incubator: kasten };
}

// ── Abgleich beim Speichern ────────────────────────────────────────────────
/** Felder, die der Browser an einem Tier ändern darf. Alles andere kommt vom Server. */
const LAGE_FELDER = ["slotIndex", "x", "y", "vx", "vy", "facingRight", "changeDirAt"];
const WERT_FELDER = ["id", "instanceId", "name", "rarity", "specialType", "ability", "emoji", "image", "previewImage"];

function sauberName(roh, alt) {
    if (roh === null) return null;
    if (typeof roh !== "string") return alt ?? null;
    const s = roh.replace(/\s+/g, " ").trim().slice(0, 24);
    return s || null;
}

function nurWerte(tier) {
    const out = {};
    for (const k of WERT_FELDER) if (tier[k] !== undefined) out[k] = tier[k];
    out.customName = tier.customName ?? null;
    return out;
}

/**
 * Tiere beim Speichern abgleichen. Der Browser darf:
 *   * ein Tier aus dem Rucksack aufstellen und wieder einpacken (höchstens drei stehen),
 *   * es umbenennen und seine Lage auf dem Grundstück melden.
 * Er darf KEINE Tiere hinzufügen und keine Werte ändern (Art, Seltenheit, Fähigkeit).
 * Ein Tier, das der Browser gar nicht mehr mitschickt, bleibt im Rucksack — Tiere
 * verschwinden nur über Server-Wege (Verkauf, Post, Kiste).
 *
 * @returns {{ petInventory: object[], petPlacements: object[] }}
 */
function gleicheTiereAb(eingehendInventar, eingehendPlatziert, bestehend) {
    const serverTiere = new Map();
    for (const t of [...liste(bestehend, "petPlacements"), ...liste(bestehend, "petInventory")]) {
        const id = petId(t);
        if (id && !serverTiere.has(id)) serverTiere.set(id, t);
    }
    const vergeben = new Set();
    const platziert = [];
    for (const roh of Array.isArray(eingehendPlatziert) ? eingehendPlatziert : []) {
        const id = petId(roh);
        const echt = id && serverTiere.get(id);
        if (!echt || vergeben.has(id) || platziert.length >= TIERPLAETZE) continue;
        vergeben.add(id);
        const tier = { ...nurWerte(echt), customName: sauberName(roh.customName, echt.customName) };
        for (const k of LAGE_FELDER) {
            const v = roh[k];
            if (typeof v === "number" ? Number.isFinite(v) : typeof v === "boolean") tier[k] = v;
        }
        platziert.push(tier);
    }
    const inventar = [];
    for (const roh of Array.isArray(eingehendInventar) ? eingehendInventar : []) {
        const id = petId(roh);
        const echt = id && serverTiere.get(id);
        if (!echt || vergeben.has(id)) continue;
        vergeben.add(id);
        inventar.push({ ...nurWerte(echt), customName: sauberName(roh.customName, echt.customName) });
    }
    // Vom Browser nicht mehr genannt: zurück in den Rucksack, nicht weg.
    for (const [id, echt] of serverTiere) {
        if (vergeben.has(id)) continue;
        vergeben.add(id);
        inventar.push(nurWerte(echt));
    }
    return { petInventory: inventar, petPlacements: platziert };
}

module.exports = {
    BRUTZEIT_MS, BRUTPLATZ_PREISE, BRUTPLAETZE_MAX, TIERPLAETZE,
    brutkastenVon, kaufeEi, brutplatzFreischalten, eiEinlegen, eiAbholen, wuerfleSchluepfen,
    eierRest, eierVerbrauchAufraeumen, gleicheTiereAb,
};
