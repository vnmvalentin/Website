// garden/core/economy.js
// Serverseitige Wirtschaft: Ernte und Verkauf.
//
// WARUM DAS HIER LIEGT
// Bis v3.0 rechnete der Browser Ernte und Verkauf und schickte nur das Ergebnis —
// wer den Client manipulierte, konnte sich beliebig Gold eintragen. Ab jetzt gilt
// für Gold und das Ernte-Lager: der Server rechnet, der Client fragt nur an.
// `compactFarmState` übernimmt beide Felder deshalb nicht mehr aus dem PUT.
//
// NOCH NICHT ABGEDECKT (bewusst, siehe Roadmap 2.5):
//   * Pflanzen selbst (plotPlants) kommen weiterhin vom Client. Ein manipulierter
//     Client kann eine Pflanze also vorzeitig „reif" melden. Der Wert bleibt dabei
//     durch Katalog und Feldanzahl gedeckelt — es entsteht kein Gold aus dem Nichts.
//   * Käufe (Samen, Werkzeug, Eier, Deko) und Tierfunde laufen noch clientseitig.
const { SEED_CATALOGUE } = require("./catalogue");
const {
    getPetSellPrice, getGoldfinderRange, getPetTickMs, getSeedfinderFallbackGold,
    clampLevel, findePet, petId: petIdOf,
    GAERTNER_NACHWUCHS, GAERTNER_WURZELWERK, getGaertnerStufe,
} = require("./pets");

const { wetterListe, staerksterEffekt, wetterBoost } = require("./weather");
const { wirkung, gibXp, skillStand } = require("./skills");

const SPECIAL_BOOST = { golden: 2.0, rainbow: 5.0 };
const GOLD_MAX = 9_000_000_000_000_000;
const SUB_BONUS = 1.5;

function lerp(min, max, t) { return min + (max - min) * t; }
function clamp01(v) { return Math.max(0, Math.min(1, Number(v) || 0)); }
function katalog(seedId) { return SEED_CATALOGUE.find((s) => s.id === seedId) || null; }

function specialBoost(name) {
    return SPECIAL_BOOST[String(name || "").toLowerCase()] || 1;
}

/**
 * Holt einen Dauerträger auf den Stand, den der Client längst sieht.
 *
 * WARUM: `GET /farm-state` schickt die Pflanzen durch `advancePlantTime` — der
 * Browser bekommt also „fruiting" samt Fruchtständen. Gespeichert wurde diese
 * Umstellung aber nie, und `harvestCell` kannte sie auch nicht. Der Server stand
 * weiter auf „structure" ohne fruitSlots und wies jede Ernte mit „Noch nicht reif."
 * ab, bis irgendeine andere Aktion einen PUT auslöste. Nachgestellt und bestätigt.
 *
 * Die Fruchtstände starten bewusst bei `structureReadyAt` und nicht bei `now`:
 * sonst bekäme eine Staude, die reifte während niemand hinsah, beim ersten Blick
 * einen kompletten Zyklus geschenkt.
 */
function bringeDauertraegerAufStand(plant, now) {
    if (!plant || plant.singleUse !== false) return plant;
    const strukturFertig = Number(plant.structureReadyAt || 0);
    if (plant.stage === "structure" && now >= strukturFertig) plant.stage = "fruiting";
    if (plant.stage !== "fruiting") return plant;
    if (!Array.isArray(plant.fruitSlots) || plant.fruitSlots.length === 0) {
        const cycleMs = Number(plant.fruitCycleMs) || 60000;
        const start = strukturFertig || now;
        plant.fruitSlots = Array.from(
            { length: Math.max(1, Number(plant.maxFruits) || 1) },
            () => neuerFruchtstand(start, cycleMs),
        );
    }
    return plant;
}

/** Ist die Pflanze laut ihren eigenen Zeitangaben erntereif? */
function istReif(plant, now) {
    if (!plant) return false;
    if (plant.singleUse !== false) {
        return plant.stage !== "harvested"
            && now >= Number(plant.plantedAt || 0) + Number(plant.growthMs || 0);
    }
    if (plant.stage === "structure" && now < Number(plant.structureReadyAt || 0)) return false;
    return Array.isArray(plant.fruitSlots) && plant.fruitSlots.some((s) => Number(s?.readyAt || 0) <= now);
}

/**
 * Wie stark das Wachstum auf diesem Grundstück verkürzt ist — „Grüner Daumen"
 * aus dem Fähigkeitsbaum plus „Wurzelwerk" des Gärtners. Beide stapeln sich
 * additiv und sind bei 80 % gedeckelt, damit keine Kombination eine Pflanze
 * auf null Sekunden zieht.
 */
function wachstumsBonus(state) {
    return Math.min(0.8, wirkung(state, "gruener_daumen") + getGaertnerStufe(state) * GAERTNER_WURZELWERK);
}

/**
 * Frische Pflanze derselben Art am selben Platz — für den Nachwuchs des Gärtners.
 * Übernimmt alles Beschreibende (Art, Name, Zelle, Bildpfade) und würfelt nur
 * Zeit, Größe und Sonderform neu, genau wie beim Einpflanzen. Die Wachstumszeit
 * bekommt dieselben Abzüge wie eine von Hand gesetzte Pflanze — sonst wäre der
 * Nachwuchs langsamer als das, was er ersetzt.
 */
function neuePflanzeAus(vorlage, profil, now, state) {
    const spanne = Math.max(0, Number(profil.growMaxSec) - Number(profil.growMinSec));
    const roheMs = 1000 * (Number(profil.growMinSec) + Math.random() * spanne);
    const roll = Math.random();
    return {
        ...vorlage,
        plantedAt: now,
        growthMs: Math.max(1000, Math.round(roheMs * (1 - wachstumsBonus(state)))),
        stage: "growing",
        harvested: 0,
        norm: Math.pow(Math.random(), 1.35),
        specialType: roll < 0.01 ? "Rainbow" : roll < 0.05 ? "Golden" : null,
        // Das Wetter fängt an der neuen Pflanze bei null an.
        statusEffects: [],
        statusEffect: null,
        statusEffectUntil: null,
    };
}

function neuerFruchtstand(now, cycleMs) {
    const norm = Math.pow(Math.random(), 1.35);
    const roll = Math.random();
    return {
        readyAt: now + Math.round(cycleMs * (0.8 + Math.random() * 0.4)),
        norm,
        size: Math.max(1, Math.round(lerp(1, 50, norm))),
        specialType: roll < 0.01 ? "Rainbow" : roll < 0.05 ? "Golden" : null,
        statusEffects: [],
        statusEffect: null,
        statusEffectUntil: null,
    };
}

/**
 * Erntet eine Zelle. Mutiert `state`; gibt { ok, item } oder { ok:false, error }.
 * Der Verkaufswert wird HIER berechnet — nie aus dem Client übernommen.
 */
function harvestCell(state, key, now = Date.now(), { einlagern = true } = {}) {
    const plants = state.plotPlants || {};
    const plant = plants[key];
    if (!plant) return { ok: false, status: 400, error: "Dort wächst nichts." };
    bringeDauertraegerAufStand(plant, now);
    if (!istReif(plant, now)) {
        // Eine tragende Staude, an der gerade nichts reif ist, ist etwas anderes als
        // eine Pflanze, die noch wächst — und im Spiel der häufigere Fall: wer bei
        // acht Fruchtständen schnell klickt, schickt mehr Klicks als Früchte da sind.
        // Beide gaben vorher dieselbe Meldung, was die Ursachensuche unnötig schwer
        // machte (und den Client nicht unterscheiden ließ, ob ein Nachreichen hilft).
        const traegtSchon = plant.singleUse === false
            && plant.stage !== "structure"
            && Array.isArray(plant.fruitSlots) && plant.fruitSlots.length > 0;
        return {
            ok: false,
            status: 400,
            error: traegtSchon ? "Keine reife Frucht." : "Noch nicht reif.",
        };
    }

    const profil = katalog(plant.seedId);
    if (!profil) return { ok: false, status: 400, error: "Unbekannte Pflanze." };

    // Der Platz zählt nur, wenn das Stück auch im Rucksack landet. Ein Erntehelfer
    // verkauft direkt vom Feld weg (siehe petErnteVerkauf) — für ihn wäre ein voller
    // Rucksack ein Grund stehenzubleiben, obwohl er gar nichts ablegen will.
    if (einlagern) {
        const maxSlots = Math.max(1, Number(state.inventoryMaxSlots) || 50);
        const belegt = (state.inventory?.length || 0) + (state.harvestedItems?.length || 0);
        if (belegt >= maxSlots) return { ok: false, status: 400, error: "Rucksack voll." };
    }

    let norm; let special; let effekte; let basis;
    // Welcher Fruchtstand nachgewachsen ist. Der Browser übernimmt danach GENAU
    // diesen einen Stand und behält seine übrigen — siehe Rückgabe unten.
    let nachgewachsen = null;

    if (plant.singleUse !== false) {
        norm = clamp01(plant.norm ?? 0.5);
        special = plant.specialType || null;
        effekte = wetterListe(plant);
        basis = lerp(profil.sellMin, profil.sellMax, norm);

        // ── Gärtner: Nachwuchs ────────────────────────────────────────────────
        // Der einzige Nachteil der Einmalernte gegenüber dem Dauerträger ist die
        // Neuinvestition nach jedem Zyklus: ein Samen und ein Pflanzklick. Genau
        // die nimmt der Gärtner anteilig weg. Bewusst HIER und nicht im Browser —
        // so wirkt es beim Erntehelfer und in der Offline-Verrechnung mit, ohne
        // dass die Rechnung ein zweites Mal irgendwo stehen muss.
        const stufe = getGaertnerStufe(state);
        if (stufe > 0 && Math.random() < stufe * GAERTNER_NACHWUCHS) {
            plants[key] = neuePflanzeAus(plant, profil, now, state);
        } else {
            plant.stage = "harvested";
            delete plants[key];
        }
    } else {
        // Die am längsten reife Frucht zuerst
        let idx = -1; let aeltester = Infinity;
        const slots = plant.fruitSlots || [];
        for (let i = 0; i < slots.length; i++) {
            const ra = Number(slots[i]?.readyAt ?? Infinity);
            if (ra <= now && ra < aeltester) { aeltester = ra; idx = i; }
        }
        if (idx === -1) return { ok: false, status: 400, error: "Keine reife Frucht." };
        const slot = slots[idx] || {};
        norm = clamp01(slot.norm ?? 0.5);
        special = slot.specialType || null;
        effekte = wetterListe(slot);
        basis = lerp(profil.fruitSellMin, profil.fruitSellMax, norm);
        plant.fruitSlots[idx] = neuerFruchtstand(now, Number(plant.fruitCycleMs) || 60000);
        plant.harvested = (Number(plant.harvested) || 0) + 1;
        nachgewachsen = { index: idx, slot: plant.fruitSlots[idx] };
    }

    const seltenheit = plant.rarity || profil.rarity;

    // ── Glückspilz: gewöhnliche Ernte doch noch veredeln ──────────────────────
    // Bewusst HIER und nicht beim Würfeln des Fruchtstands: der Stand entsteht an
    // zwei Stellen (Server beim Nachwachsen, Browser beim Pflanzen), die Ernte
    // dagegen nur hier. Eine schon goldene Frucht wird nicht noch einmal gewürfelt.
    if (!special) {
        const glueck = wirkung(state, "seltenheit");
        if (glueck > 0 && Math.random() < glueck) {
            // Ein Fünftel der Treffer wird gleich Rainbow — dasselbe Verhältnis wie
            // beim gewöhnlichen Wurf (1 % zu 5 %).
            special = Math.random() < 0.2 ? "Rainbow" : "Golden";
        }
    }

    const groesse = Math.max(1, Math.round(lerp(1, 50, norm)));
    const haendler = 1 + wirkung(state, "haendler");
    const gold = Math.max(1, Math.floor(
        Math.max(1, Math.floor(basis * specialBoost(special))) * wetterBoost(effekte) * haendler,
    ));

    const baueItem = () => ({
        id: `h_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        seedId: plant.seedId,
        name: plant.name || profil.name,
        singleUse: plant.singleUse !== false,
        rarity: seltenheit,
        size: groesse,
        specialData: special ? { name: special } : undefined,
        statusEffects: effekte,
        // Einzelfeld bleibt gesetzt: Tönung, Vitrine, Post und das Admin-Menü lesen
        // weiterhin genau eins. Es trägt den wertvollsten der Effekte.
        statusEffect: staerksterEffekt(effekte),
        sellValue: gold,
        harvestedAt: now,
    });
    const item = baueItem();

    // ── Reiche Ernte: Chance auf ein zweites Stück ────────────────────────────
    // Nur wenn eingelagert wird UND noch ein Platz frei ist. Sonst fiele das
    // Zusatzstück lautlos unter den Tisch und der Spieler hielte die Fähigkeit
    // für kaputt.
    let zweites = null;
    if (Math.random() < wirkung(state, "ertrag")) zweites = baueItem();

    const erfahrung = gibXp(state, seltenheit);

    if (einlagern) {
        const lager = Array.isArray(state.harvestedItems) ? state.harvestedItems : [];
        const maxSlots = Math.max(1, Number(state.inventoryMaxSlots) || 50);
        const belegt = (state.inventory?.length || 0) + lager.length;
        const stuecke = zweites && belegt + 2 <= maxSlots ? [item, zweites] : [item];
        if (stuecke.length === 1) zweites = null;
        state.harvestedItems = [...stuecke, ...lager];
    }
    // `nachgewachsen` statt der ganzen Pflanze: der Acker gehört dem Browser und
    // erreicht den Server nur alle paar Sekunden. Übernähme der Browser die
    // Server-Pflanze komplett, verlöre er jeden Fruchtstand, der seit dem letzten
    // Speichern reif geworden ist — und müsste auf dessen Nachwachsen warten.
    // Der neue Stand wird weiterhin HIER gewürfelt, nicht im Browser.
    return { ok: true, item, zweites, nachgewachsen, erfahrung, skillStand: skillStand(state) };
}

// ─── Kiste und Vitrine ───────────────────────────────────────────────────────
// Beide sind zusätzliche Ablagen für ERNTE. Sie liegen serverseitig neben
// harvestedItems und gehören damit genauso dem Server: Größe, Sonderform und
// Wetter-Effekt eines Stücks dürfen sich beim Ein- und Auslagern nicht ändern,
// sonst hätte man über den Umweg „rein, raus" einen Werteditor.
const KISTE_MAX = 100;
const VITRINE_MAX = 12;

/**
 * Woher ein eingelagertes Stück stammt und wohin es zurückgehört.
 *
 * Die Kiste nimmt alles auf; die Vitrine bleibt bei der Ernte — ihr Inhalt geht als
 * Momentaufnahme an alle Mitspieler (buildVitrineSnapshot in world/lobby.js) und ist
 * dort auf Frucht-Felder zugeschnitten.
 *
 * `slotKosten` sagt, ob ein Stück einen RUCKSACKPLATZ belegt. Samen und Ernte teilen
 * sich die Plätze, Eier, Deko und Tiere liegen daneben — beim Herausholen darf also
 * nur für die ersten beiden der Platz knapp werden.
 */
const KISTE_QUELLEN = {
    ernte: { feld: "harvestedItems", name: "Ernte", slotKosten: true },
    samen: { feld: "inventory", name: "Samen", slotKosten: true },
    eier: { feld: "eggInventory", name: "Eier", slotKosten: false },
    deko: { feld: "decoInventory", name: "Deko", slotKosten: false },
    tiere: { feld: "petInventory", name: "Tiere", slotKosten: false },
};
const KISTE_KATEGORIEN = Object.keys(KISTE_QUELLEN);

const ABLAGEN = {
    chest: { feld: "chestItems", max: KISTE_MAX, name: "Kiste", kategorien: KISTE_KATEGORIEN },
    vitrine: { feld: "vitrineItems", max: VITRINE_MAX, name: "Vitrine", kategorien: ["ernte"] },
};

function ablageListe(state, feld) {
    return Array.isArray(state[feld]) ? state[feld] : [];
}

/**
 * Eindeutige Kennung eines Stücks.
 *
 * `instanceId` hat VORRANG: bei Eiern und Deko ist `id` die Art („common_egg",
 * „deco_lamp") und damit für alle Stücke derselben Sorte gleich — nur `instanceId`
 * unterscheidet sie. Ernte und Tiere führen umgekehrt nur `id`, und die ist dort
 * eindeutig. Andersherum sortiert griffe ein Klick auf das dritte Ei das erste ein.
 */
function stueckId(item) {
    const roh = item?.instanceId ?? item?.id;
    return roh === undefined || roh === null ? null : String(roh);
}

/**
 * Kategorie eines Stücks in der Ablage. Vor dieser Erweiterung lag dort nur Ernte,
 * ältere Spielstände tragen deshalb keine Angabe — die gilt als Ernte.
 */
function kategorieVon(item) {
    const k = item?.kategorie;
    return KISTE_QUELLEN[k] ? k : "ernte";
}

/** Freie Rucksackplätze — Samen und Ernte teilen sich die Plätze. */
function freieRucksackplaetze(state) {
    const maxSlots = Math.max(1, Number(state.inventoryMaxSlots) || 50);
    const belegt = (state.inventory?.length || 0) + (state.harvestedItems?.length || 0);
    return maxSlots - belegt;
}

/** Ein Stück aus seiner Herkunftsliste in die Ablage schieben. Ohne Prüfungen. */
function schiebeHinein(state, ablage, kategorie, idx) {
    const quelle = KISTE_QUELLEN[kategorie];
    const liste = ablageListe(state, quelle.feld);
    const item = liste[idx];
    state[quelle.feld] = [...liste.slice(0, idx), ...liste.slice(idx + 1)];
    state[ablage.feld] = [{ ...item, kategorie }, ...ablageListe(state, ablage.feld)];
    return item;
}

/** Ein Stück aus der Ablage zurück in seine Herkunftsliste. Ohne Prüfungen. */
function schiebeHeraus(state, ablage, idx) {
    const inhalt = ablageListe(state, ablage.feld);
    const eintrag = inhalt[idx];
    const kategorie = kategorieVon(eintrag);
    const quelle = KISTE_QUELLEN[kategorie];
    state[ablage.feld] = [...inhalt.slice(0, idx), ...inhalt.slice(idx + 1)];
    // `kategorie` ist eine Buchhaltungsangabe der Ablage und hat draußen nichts
    // verloren — sonst schleppt jedes Ei sie für immer mit sich herum.
    const { kategorie: _weg, ...item } = eintrag;
    state[quelle.feld] = [item, ...ablageListe(state, quelle.feld)];
    return item;
}

/** Ein Stück aus dem Rucksack in Kiste oder Vitrine legen. */
function ablageEinlagern(state, art, itemId) {
    const ablage = ABLAGEN[art];
    if (!ablage) return { ok: false, status: 400, error: "Unbekannte Ablage." };
    const gesucht = String(itemId);
    for (const kategorie of ablage.kategorien) {
        const liste = ablageListe(state, KISTE_QUELLEN[kategorie].feld);
        const idx = liste.findIndex((i) => i && stueckId(i) === gesucht);
        if (idx === -1) continue;
        if (ablageListe(state, ablage.feld).length >= ablage.max) {
            return { ok: false, status: 400, error: `${ablage.name} ist voll (${ablage.max}).` };
        }
        return { ok: true, item: schiebeHinein(state, ablage, kategorie, idx) };
    }
    return { ok: false, status: 400, error: "Das hast du nicht dabei." };
}

/** Ein Stück aus der Ablage zurück in den Rucksack holen. */
function ablageAuslagern(state, art, itemId) {
    const ablage = ABLAGEN[art];
    if (!ablage) return { ok: false, status: 400, error: "Unbekannte Ablage." };
    const inhalt = ablageListe(state, ablage.feld);
    const idx = inhalt.findIndex((i) => i && stueckId(i) === String(itemId));
    if (idx === -1) return { ok: false, status: 400, error: `Das liegt nicht in deiner ${ablage.name}.` };
    if (KISTE_QUELLEN[kategorieVon(inhalt[idx])].slotKosten && freieRucksackplaetze(state) <= 0) {
        return { ok: false, status: 400, error: "Rucksack voll — mach erst Platz." };
    }
    return { ok: true, item: schiebeHeraus(state, ablage, idx) };
}

/**
 * Alles auf einmal einlagern. Ist die Ablage vorher schon voll, ist das ein Fehler;
 * läuft sie unterwegs voll, gilt der Teilerfolg — sonst müsste man raten, was noch
 * hineinpasst, und bekäme für einen vollen Rest gar nichts verstaut.
 */
function ablageAllesEin(state, art) {
    const ablage = ABLAGEN[art];
    if (!ablage) return { ok: false, status: 400, error: "Unbekannte Ablage." };
    let frei = ablage.max - ablageListe(state, ablage.feld).length;
    if (frei <= 0) return { ok: false, status: 400, error: `${ablage.name} ist voll (${ablage.max}).` };

    let bewegt = 0;
    for (const kategorie of ablage.kategorien) {
        // Immer den ersten Eintrag nehmen: schiebeHinein baut die Liste neu auf,
        // ein mitlaufender Index würde daran vorbeigreifen.
        while (frei > 0 && ablageListe(state, KISTE_QUELLEN[kategorie].feld).length > 0) {
            schiebeHinein(state, ablage, kategorie, 0);
            frei--;
            bewegt++;
        }
    }
    if (bewegt === 0) return { ok: false, status: 400, error: "Du hast nichts dabei." };
    return { ok: true, bewegt, rest: ablageListe(state, ablage.feld).length >= ablage.max };
}

/**
 * Alles auf einmal herausholen. Was keinen Rucksackplatz mehr findet, bleibt liegen —
 * Eier, Deko und Tiere kommen trotzdem mit, sie belegen keine Plätze.
 */
function ablageAllesAus(state, art) {
    const ablage = ABLAGEN[art];
    if (!ablage) return { ok: false, status: 400, error: "Unbekannte Ablage." };
    if (ablageListe(state, ablage.feld).length === 0) {
        return { ok: false, status: 400, error: `Deine ${ablage.name} ist leer.` };
    }

    let bewegt = 0;
    let liegengeblieben = 0;
    // Rückwärts, damit das Entfernen die noch nicht geprüften Positionen nicht verschiebt.
    for (let i = ablageListe(state, ablage.feld).length - 1; i >= 0; i--) {
        const eintrag = ablageListe(state, ablage.feld)[i];
        if (KISTE_QUELLEN[kategorieVon(eintrag)].slotKosten && freieRucksackplaetze(state) <= 0) {
            liegengeblieben++;
            continue;
        }
        schiebeHeraus(state, ablage, i);
        bewegt++;
    }
    if (bewegt === 0) return { ok: false, status: 400, error: "Rucksack voll — mach erst Platz." };
    return { ok: true, bewegt, liegengeblieben };
}

/**
 * Verkaufswert eines Erntestücks, ausschließlich aus seinen gespeicherten
 * Eigenschaften gerechnet — ein mitgeschickter `sellValue` wird nie geglaubt.
 *
 * Liegt hier und nicht nur in sellAll, weil auch der Briefkasten ihn braucht:
 * eine verschenkte Frucht kommt beim Empfänger ohne Wert an (der Absender darf
 * ihn nicht bestimmen) und stand dort mit „0 Gold" da, obwohl der Verkauf den
 * richtigen Betrag brachte.
 */
function verkaufswert(item) {
    const profil = katalog(item?.seedId);
    if (!profil) return 0;
    const norm = clamp01(((Number(item?.size) || 1) - 1) / 49);
    const basis = item?.singleUse === false
        ? lerp(profil.fruitSellMin, profil.fruitSellMax, norm)
        : lerp(profil.sellMin, profil.sellMax, norm);
    return Math.max(1, Math.floor(
        Math.max(1, Math.floor(basis * specialBoost(item?.specialData?.name)))
        * wetterBoost(item),
    ));
}

/**
 * Verkauft das gesamte Ernte-Lager. Summiert AUSSCHLIESSLICH server-eigene Werte —
 * ein vom Client gemeldeter sellValue wird nie verwendet.
 */
function sellAll(state, isSubscriber = false) {
    const lager = Array.isArray(state.harvestedItems) ? state.harvestedItems : [];
    if (lager.length === 0) return { ok: false, status: 400, error: "Nichts zu verkaufen." };

    let summe = 0;
    for (const item of lager) summe += verkaufswert(item);
    const gesamt = Math.floor(summe * (isSubscriber ? SUB_BONUS : 1));
    const anzahl = lager.length;
    state.harvestedItems = [];
    state.gold = Math.min(GOLD_MAX, Math.max(0, Number(state.gold || 0)) + gesamt);
    return { ok: true, gold: state.gold, verdient: gesamt, anzahl };
}

/**
 * Erntehelfer-Tier: pflücken UND sofort verkaufen — zum selben Preis wie beim
 * Marktverkauf, Sub-Bonus eingeschlossen.
 *
 * WARUM VERKAUFEN STATT EINLAGERN
 * Vorher legte der Helfer seine Ernte in den Rucksack. Der ist nach ein paar
 * Minuten voll, danach lieferte der Server nur noch „Rucksack voll." zurück und
 * das Tier stand still — es hat sich schlicht nicht gelohnt. Ein Tier, das für
 * einen mitarbeitet, muss auch abrechnen können.
 *
 * Der Wert kommt aus `harvestCell` (Größe, Sonderform, Wetter) und wird HIER
 * summiert; der Sub-Bonus gilt auf die Summe, genau wie in `sellAll`.
 */
function petErnteVerkauf(state, keys, isSubscriber = false, now = Date.now()) {
    const nachgewachsen = [];
    const geerntet = [];
    let summe = 0;

    for (const key of Array.isArray(keys) ? keys : []) {
        const einzel = harvestCell(state, key, now, { einlagern: false });
        if (!einzel.ok) continue;
        // „Reiche Ernte" zählt auch für den Harvester: er verkauft beide Stücke.
        for (const stueck of [einzel.item, einzel.zweites]) {
            if (!stueck) continue;
            summe += Number(stueck.sellValue) || 0;
            geerntet.push(stueck);
        }
        // Dauerträger: der Browser übernimmt genau den nachgewachsenen Stand.
        if (einzel.nachgewachsen) nachgewachsen.push({ key, ...einzel.nachgewachsen });
    }

    if (geerntet.length === 0) return { ok: false, status: 400, error: "Nichts geerntet." };

    const gesamt = Math.floor(summe * (isSubscriber ? SUB_BONUS : 1));
    state.gold = Math.min(GOLD_MAX, Math.max(0, Number(state.gold) || 0) + gesamt);
    return {
        ok: true, gold: state.gold, verdient: gesamt, anzahl: geerntet.length,
        items: geerntet, nachgewachsen, skillStand: skillStand(state),
    };
}

/**
 * Zieht Gold ab (Kauf). Kann Gold nur VERRINGERN — daraus lässt sich nichts
 * erzeugen. Was gekauft wurde, entscheidet weiterhin der Client (siehe Kopf);
 * hier wird nur sichergestellt, dass die Deckung stimmt und nichts negativ wird.
 */
function spendGold(state, betrag) {
    const n = Number(betrag);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0 || n > GOLD_MAX) {
        return { ok: false, status: 400, error: "Ungültiger Betrag." };
    }
    const vorhanden = Math.max(0, Number(state.gold) || 0);
    if (vorhanden < n) return { ok: false, status: 400, error: "Nicht genug Gold." };
    state.gold = vorhanden - n;
    return { ok: true, gold: state.gold, ausgegeben: n };
}

/**
 * Verkauft ein Tier. Das Tier muss im SERVER-Spielstand liegen; der Preis kommt
 * aus der Servertabelle, nicht aus der Anfrage.
 */
function sellPet(state, id) {
    const treffer = findePet(state, id);
    if (!treffer) return { ok: false, status: 400, error: "Tier nicht gefunden." };
    const preis = getPetSellPrice(treffer.pet?.rarity);
    state[treffer.feld] = state[treffer.feld].filter((_, i) => i !== treffer.idx);
    state.gold = Math.min(GOLD_MAX, Math.max(0, Number(state.gold) || 0) + preis);
    return { ok: true, gold: state.gold, verdient: preis, name: treffer.pet?.customName || treffer.pet?.name || "Tier" };
}

/**
 * Auszahlung einer Tier-Fähigkeit. Der Server würfelt den Betrag selbst und
 * begrenzt die Häufigkeit über `letzteFunde` — der Client kann also weder die
 * Höhe bestimmen noch den Takt beschleunigen.
 */
function petFind(state, id, art, letzteFunde, now = Date.now()) {
    const treffer = findePet(state, id);
    if (!treffer || treffer.feld !== "petPlacements") {
        return { ok: false, status: 400, error: "Tier steht nicht auf dem Grundstück." };
    }
    const pet = treffer.pet;
    const typ = pet?.ability?.type;
    const level = clampLevel(pet?.ability?.level);
    const erwartet = art === "seedFallback" ? "seedfinder" : "goldfinder";
    if (typ !== erwartet) return { ok: false, status: 400, error: "Falsche Fähigkeit." };

    const schluessel = petIdOf(pet);
    const zuletzt = Number(letzteFunde.get(schluessel) || 0);
    // 10 % Toleranz, damit ein leicht früher Timer im Browser nicht verworfen wird
    if (now - zuletzt < getPetTickMs(level) * 0.9) {
        return { ok: false, status: 429, error: "Zu früh." };
    }
    letzteFunde.set(schluessel, now);

    let betrag;
    if (erwartet === "goldfinder") {
        const [min, max] = getGoldfinderRange(level);
        betrag = Math.floor(Math.random() * (max - min + 1)) + min;
    } else {
        betrag = getSeedfinderFallbackGold(level);
    }
    state.gold = Math.min(GOLD_MAX, Math.max(0, Number(state.gold) || 0) + betrag);
    return { ok: true, gold: state.gold, verdient: betrag, name: pet?.customName || pet?.name || "Tier" };
}

module.exports = {
    harvestCell, sellAll, spendGold, sellPet, petFind, istReif, verkaufswert,
    petErnteVerkauf,
    bringeDauertraegerAufStand, wachstumsBonus, ablageEinlagern, ablageAuslagern,
    ablageAllesEin, ablageAllesAus,
    KISTE_MAX, VITRINE_MAX, GOLD_MAX, SUB_BONUS,
};
