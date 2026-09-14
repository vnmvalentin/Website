// garden/admin.js
// Werkzeugkasten des Admin-Menüs für die Virtual Farm.
//
// WARUM SERVERSEITIG
// Das Admin-Menü darf keine fertigen Stücke aus dem Browser übernehmen. Sonst wäre
// die Route ein Werteditor für alles, was der Server sonst streng selbst rechnet
// (Verkaufswert, Seltenheit, Fähigkeitsstufe) — und ein gestohlenes Streamer-Cookie
// wäre nicht mehr nur "viel Gold", sondern beliebige Zahlen im Spielstand.
// Der Browser schickt deshalb nur eine BESCHREIBUNG ("Erdbeere, Größe 40, golden"),
// gebaut wird das Stück hier, mit denselben Formeln wie im normalen Spiel.
//
// WAS EIN PATCH ANFASSEN DARF
// Serverbesitz (gold, harvestedItems, chestItems, vitrineItems) wirkt sofort und
// bleibt auch dann stehen, wenn der Spieler gerade online ist. Alles andere gehört
// dem Browser des Spielers — ein Patch daran wird von dessen nächstem PUT wieder
// überschrieben, solange er nicht neu lädt. Deshalb stößt die Route für Online-
// Spieler ein Nachladen an (notifyAdminUpdate in world/lobby.js).
const { verkaufswert } = require("./core/economy");
const { SEED_CATALOGUE } = require("./core/catalogue");
const { DEKO_KATALOG, KATEGORIEN: DEKO_KATEGORIEN, alsVorratsstueck } = require("./core/deko");

// Spiegel von PET_IMAGE_BY_TYPE / PET_EMOJI_BY_TYPE in
// Frontend/src/pages/GardenGame/GameContainer.jsx. Neue Tierart: dort UND hier.
// Umlaute MÜSSEN ausgeschrieben stehen — phoenix.png, nicht phonix.png.
const TIER_ARTEN = [
    { type: "Huhn",        emoji: "🐔",   image: "/garden-assets/animals/huhn.png",         rarity: "COMMON" },
    { type: "Ente",        emoji: "🦆",   image: "/garden-assets/animals/ente.png",         rarity: "COMMON" },
    { type: "Schwein",     emoji: "🐷",   image: "/garden-assets/animals/schwein.png",      rarity: "COMMON" },
    { type: "Katze",       emoji: "🐈",   image: "/garden-assets/animals/katze.png",        rarity: "UNCOMMON" },
    { type: "Waschbär",    emoji: "🦝",   image: "/garden-assets/animals/waschbaer.png",    rarity: "UNCOMMON" },
    { type: "Kuh",         emoji: "🐮",   image: "/garden-assets/animals/kuh.png",          rarity: "RARE" },
    { type: "Schaf",       emoji: "🐑",   image: "/garden-assets/animals/schaf.png",        rarity: "RARE" },
    { type: "Ziege",       emoji: "🐐",   image: "/garden-assets/animals/ziege.png",        rarity: "RARE" },
    { type: "Pferd",       emoji: "🐎",   image: "/garden-assets/animals/pferd.png",        rarity: "RARE" },
    { type: "Esel",        emoji: "🫏",   image: "/garden-assets/animals/esel.png",         rarity: "EPIC" },
    { type: "Hund",        emoji: "🐕",   image: "/garden-assets/animals/hund.png",         rarity: "EPIC" },
    { type: "Einhorn",     emoji: "🦄",   image: "/garden-assets/animals/einhorn.png",      rarity: "EPIC" },
    { type: "Tiger",       emoji: "🐯",   image: "/garden-assets/animals/tiger.png",        rarity: "LEGENDARY" },
    { type: "Phönix",      emoji: "🐦‍🔥", image: "/garden-assets/animals/phoenix.png",      rarity: "LEGENDARY" },
    { type: "Drache",      emoji: "🐉",   image: "/garden-assets/animals/drache.png",       rarity: "LEGENDARY" },
    { type: "Götterwesen", emoji: "👼",   image: "/garden-assets/animals/goetterwesen.png", rarity: "MYTHIC" },
];

// Der Deko-Katalog steht jetzt in core/deko.js — er wird auch vom Renderer für
// Lichtquellen und Bodenbeläge gebraucht, und drei Kopien derselben Liste waren
// eine zu viel. Spiegel im Browser: Frontend/src/pages/GardenGame/ui/deko.js.

// v2 (Punkt 9): forscher/kaufmann neu — Spiegel von PET_ABILITY_TYPES in
// Frontend/.../engine/PetSystem.js. "kaufmann" (nicht "haendler"): der Skill
// "Händler" im Fähigkeitsbaum existiert schon und macht etwas Ähnliches.
const FAEHIGKEITEN = ["goldfinder", "seedfinder", "harvester", "forscher", "kaufmann"];
const SELTENHEITEN = ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY", "MYTHIC"];
const WETTER_EFFEKTE = ["wet", "frozen", "charged", "moonlit"];
const SONDERFORMEN = ["Golden", "Rainbow"];

/**
 * Die Listen, die das Menü bearbeiten darf.
 *
 * `serverbesitz` sagt, ob eine Änderung auch bei einem ONLINE-Spieler bestehen
 * bleibt. Bei den übrigen gewinnt der nächste PUT des Browsers — dort ist ein
 * Nachladen nötig, sonst ist die Änderung nach fünf Sekunden wieder weg.
 * `art` benennt die Stück-Fabrik; Listen ohne Fabrik kann man nur leeren und
 * daraus entfernen (platzierte Deko und Tiere brauchen Koordinaten).
 */
const LISTEN = {
    inventory:      { label: "Samen",           art: "samen",  serverbesitz: false },
    harvestedItems: { label: "Ernte",           art: "ernte",  serverbesitz: true  },
    eggInventory:   { label: "Eier",            art: "ei",     serverbesitz: false },
    petInventory:   { label: "Tiere",           art: "tier",   serverbesitz: false },
    decoInventory:  { label: "Deko",            art: "deko",   serverbesitz: false },
    chestItems:     { label: "Kiste",           art: null,     serverbesitz: true  },
    vitrineItems:   { label: "Vitrine",         art: null,     serverbesitz: true  },
    petPlacements:  { label: "Tiere platziert", art: null,     serverbesitz: false },
    decoPlacements: { label: "Deko platziert",  art: null,     serverbesitz: false },
};

// Obergrenzen wie in compactFarmState — ein Admin soll sich nicht versehentlich
// einen Spielstand bauen, den die Speicherroute danach wieder abschneidet.
const LISTE_MAX = 2000;
const GOLD_MAX = 9_999_999_999_999;
const ANZAHL_MAX = 100;

function kennung(praefix) {
    return `${praefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function begrenze(wert, min, max, ersatz) {
    const n = Number(wert);
    if (!Number.isFinite(n)) return ersatz;
    return Math.max(min, Math.min(max, Math.round(n)));
}

function eintraege(state, feld) {
    return Array.isArray(state[feld]) ? state[feld] : [];
}

/** Eindeutige Kennung eines Stücks — wie in core/economy.js → stueckId. */
function stueckId(item) {
    const roh = item?.instanceId ?? item?.id;
    return roh === undefined || roh === null ? null : String(roh);
}

// ─── Stück-Fabriken ──────────────────────────────────────────────────────────
// Jede baut aus einer Beschreibung des Browsers ein vollständiges Stück. Was der
// Browser mitschickt, wird dabei ausschliesslich als Auswahl gelesen, nie als Wert.

function baueSamen(spec, katalog) {
    const seed = katalog.seeds.find((s) => s.seedId === spec?.seedId);
    if (!seed) return { error: "Diesen Samen gibt es nicht." };
    return { item: { ...seed, instanceId: kennung("adm") } };
}

function baueErnte(spec, katalog) {
    const profil = SEED_CATALOGUE.find((s) => s.id === spec?.seedId);
    if (!profil) return { error: "Diese Pflanze gibt es nicht." };
    const sonderform = SONDERFORMEN.includes(spec?.specialType) ? spec.specialType : null;
    const effekt = WETTER_EFFEKTE.includes(spec?.statusEffect) ? spec.statusEffect : null;
    const item = {
        id: kennung("h"),
        seedId: profil.id,
        name: profil.name,
        singleUse: profil.singleUse !== false,
        rarity: profil.rarity,
        size: begrenze(spec?.size, 1, 50, 25),
        specialData: sonderform ? { name: sonderform } : undefined,
        statusEffect: effekt,
        harvestedAt: Date.now(),
    };
    // Der Wert kommt aus derselben Formel wie beim echten Ernten — nie aus dem Browser.
    item.sellValue = verkaufswert(item);
    return { item };
}

function baueEi(spec, katalog) {
    const ei = katalog.eggs.find((e) => e.id === spec?.eggId);
    if (!ei) return { error: "Dieses Ei gibt es nicht." };
    return { item: { ...ei, instanceId: kennung("adm") } };
}

function baueTier(spec) {
    const art = TIER_ARTEN.find((t) => t.type === spec?.type);
    if (!art) return { error: "Diese Tierart gibt es nicht." };
    const faehigkeit = FAEHIGKEITEN.includes(spec?.abilityType) ? spec.abilityType : "goldfinder";
    const seltenheit = SELTENHEITEN.includes(spec?.rarity) ? spec.rarity : art.rarity;
    const name = typeof spec?.customName === "string" && spec.customName.trim()
        ? spec.customName.trim().slice(0, 24)
        : null;
    return {
        item: {
            id: kennung("pet"),
            name: art.type,
            customName: name,
            emoji: art.emoji,
            image: art.image,
            previewImage: art.image,
            rarity: seltenheit,
            specialType: SONDERFORMEN.includes(spec?.specialType) ? spec.specialType : null,
            ability: { type: faehigkeit, level: begrenze(spec?.abilityLevel, 1, 6, 1) },
        },
    };
}

function baueDeko(spec) {
    const deko = DEKO_KATALOG.find((d) => d.id === spec?.decoId);
    if (!deko) return { error: "Diese Deko gibt es nicht." };
    return { item: { ...alsVorratsstueck(deko), instanceId: kennung("adm") } };
}

const FABRIKEN = { samen: baueSamen, ernte: baueErnte, ei: baueEi, tier: baueTier, deko: baueDeko };

// ─── Werkzeuge und Zähler ────────────────────────────────────────────────────
// Nur diese Felder darf ein Patch setzen. Eine Freigabe für beliebige Schlüssel
// hätte auch shopStock und die Rotationsversionen erreicht — damit liesse sich der
// Ladenbestand zurückdrehen, also unbegrenzt kaufen.
const WERKZEUG_FELDER = {
    pickaxeUses:      { label: "Spitzhacken-Nutzungen", min: 0, max: 999 },
    pickaxesBought:   { label: "Spitzhacken gekauft",   min: 0, max: 999 },
    plantPots:        { label: "Pflanztöpfe",           min: 0, max: 999 },
    wateringCans:     { label: "Gießkannen",            min: 0, max: 999 },
    backpackLevel:    { label: "Rucksack-Stufe",        min: 0, max: 20 },
    petSlots:         { label: "Tier-Plätze",           min: 3, max: 6 },
    hasShovel:        { label: "Schaufel",              boolean: true },
    hasChest:         { label: "Vorratskiste",          boolean: true },
    hasVitrine:       { label: "Vitrine",               boolean: true },
};

const ZAHL_FELDER = {
    inventoryMaxSlots: { label: "Rucksackplätze",    min: 50, max: 200 },
    // 16 Reihen, davon zwei Holzwege — siehe STEIN_REIHEN in MapConfig.js.
    plotExpansions:    { label: "Grundstücksreihen", min: 0,  max: 16  },
};

// ─── Anwenden ────────────────────────────────────────────────────────────────

/**
 * Wendet EINE Aktion auf einen Spielstand an. Mutiert `state` und gibt
 * `{ ok, info }` oder `{ ok: false, status, error }` zurück.
 */
function wendeAn(state, aktion, katalog) {
    const op = String(aktion?.op || "");

    if (op === "gold") {
        const wert = Number(aktion?.wert);
        if (!Number.isFinite(wert)) return { ok: false, status: 400, error: "Kein gültiger Goldwert." };
        const alt = Math.max(0, Number(state.gold) || 0);
        const neu = aktion?.modus === "addieren" ? alt + wert : wert;
        state.gold = Math.max(0, Math.min(GOLD_MAX, Math.floor(neu)));
        return { ok: true, info: `Gold: ${alt.toLocaleString("de-DE")} → ${state.gold.toLocaleString("de-DE")}` };
    }

    if (op === "geben") {
        const feld = String(aktion?.liste || "");
        const liste = LISTEN[feld];
        if (!liste?.art) return { ok: false, status: 400, error: "In diese Liste kann man nichts legen." };
        const anzahl = begrenze(aktion?.anzahl, 1, ANZAHL_MAX, 1);
        const vorhanden = eintraege(state, feld);
        if (vorhanden.length + anzahl > LISTE_MAX) {
            return { ok: false, status: 400, error: `${liste.label} fasst höchstens ${LISTE_MAX} Stück.` };
        }
        const neue = [];
        for (let i = 0; i < anzahl; i++) {
            const gebaut = FABRIKEN[liste.art](aktion?.eintrag, katalog);
            if (gebaut.error) return { ok: false, status: 400, error: gebaut.error };
            neue.push(gebaut.item);
        }
        // Vorne einsortieren: Ernte liegt im Spiel neueste zuerst, und im Rucksack
        // fällt Neues so sofort ins Auge.
        state[feld] = [...neue, ...vorhanden];
        const name = neue[0]?.customName || neue[0]?.name || "Stück";
        return { ok: true, info: `${anzahl}× ${name} → ${liste.label}` };
    }

    if (op === "entfernen") {
        const feld = String(aktion?.liste || "");
        const liste = LISTEN[feld];
        if (!liste) return { ok: false, status: 400, error: "Diese Liste gibt es nicht." };
        const id = String(aktion?.id ?? "");
        const vorhanden = eintraege(state, feld);
        const idx = vorhanden.findIndex((item) => stueckId(item) === id);
        if (idx === -1) return { ok: false, status: 404, error: "Stück nicht gefunden." };
        const weg = vorhanden[idx];
        state[feld] = [...vorhanden.slice(0, idx), ...vorhanden.slice(idx + 1)];
        return { ok: true, info: `${weg?.customName || weg?.name || "Stück"} aus ${liste.label} entfernt` };
    }

    if (op === "leeren") {
        const feld = String(aktion?.liste || "");
        const liste = LISTEN[feld];
        if (!liste) return { ok: false, status: 400, error: "Diese Liste gibt es nicht." };
        const anzahl = eintraege(state, feld).length;
        state[feld] = [];
        return { ok: true, info: `${liste.label} geleert (${anzahl} Stück)` };
    }

    if (op === "felder") {
        const werte = aktion?.werte;
        if (!werte || typeof werte !== "object") return { ok: false, status: 400, error: "Keine Werte." };
        const geaendert = [];

        for (const [schluessel, regel] of Object.entries(ZAHL_FELDER)) {
            if (werte[schluessel] === undefined) continue;
            state[schluessel] = begrenze(werte[schluessel], regel.min, regel.max, state[schluessel]);
            geaendert.push(`${regel.label}=${state[schluessel]}`);
        }

        if (werte.toolInventory && typeof werte.toolInventory === "object") {
            const werkzeug = { ...(state.toolInventory || {}) };
            for (const [schluessel, regel] of Object.entries(WERKZEUG_FELDER)) {
                const roh = werte.toolInventory[schluessel];
                if (roh === undefined) continue;
                if (regel.boolean) {
                    werkzeug[schluessel] = roh === true || roh === "true";
                } else {
                    werkzeug[schluessel] = begrenze(roh, regel.min, regel.max, werkzeug[schluessel] || regel.min);
                }
                geaendert.push(`${regel.label}=${werkzeug[schluessel]}`);
            }
            // Beide Schreibweisen mitführen: der Client liest je nach Stelle die alte
            // Ja/Nein-Angabe oder die neue Stufe (normalizeToolInventory).
            if (werte.toolInventory.backpackLevel !== undefined) {
                werkzeug.backpackUpgraded = (Number(werkzeug.backpackLevel) || 0) > 0;
            }
            state.toolInventory = werkzeug;
        }

        if (werte.tutorialCompleted !== undefined) {
            state.tutorialCompleted = werte.tutorialCompleted === true || werte.tutorialCompleted === "true";
            geaendert.push(`Tutorial=${state.tutorialCompleted ? "fertig" : "offen"}`);
        }

        if (geaendert.length === 0) return { ok: false, status: 400, error: "Kein bekanntes Feld dabei." };
        return { ok: true, info: geaendert.join(", ") };
    }

    return { ok: false, status: 400, error: `Unbekannte Aktion: ${op || "(leer)"}` };
}

/**
 * Was das Menü zur Auswahl anbietet. Kommt bewusst vom Server: sonst müsste das
 * Dashboard die Kataloge des Spiels importieren und beide liefen auseinander.
 */
function baueKatalog(spielKatalog) {
    return {
        seeds: spielKatalog.seeds,
        eggs: spielKatalog.eggs,
        deko: DEKO_KATALOG,
        dekoKategorien: DEKO_KATEGORIEN,
        tiere: TIER_ARTEN,
        faehigkeiten: FAEHIGKEITEN,
        seltenheiten: SELTENHEITEN,
        wetterEffekte: WETTER_EFFEKTE,
        sonderformen: SONDERFORMEN,
        listen: Object.entries(LISTEN).map(([feld, l]) => ({ feld, ...l })),
        werkzeugFelder: Object.entries(WERKZEUG_FELDER).map(([feld, r]) => ({ feld, ...r })),
        zahlFelder: Object.entries(ZAHL_FELDER).map(([feld, r]) => ({ feld, ...r })),
    };
}

module.exports = {
    wendeAn, baueKatalog, LISTEN, TIER_ARTEN, DEKO_KATALOG,
    WERKZEUG_FELDER, ZAHL_FELDER, stueckId,
};
