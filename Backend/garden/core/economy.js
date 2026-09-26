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
    getPetSellPrice, getGoldfinderRange, getPetTickMs,
    clampLevel, findePet, petId: petIdOf,
    GAERTNER_NACHWUCHS, GAERTNER_WURZELWERK, getGaertnerStufe,
    getErntehelferStufe, getErntehelferExtra,
    FORSCHER_XP_PRO_STUFE, KAUFMANN_VERKAUF_PRO_STUFE, getForscherStufe, getKaufmannStufe,
} = require("./pets");

const { wetterListe, staerksterEffekt, wetterBoost } = require("./weather");
const { wirkung, gibXp, skillStand } = require("./skills");
// Über world/ereignisse, nicht direkt über tageszeit: eine vom Admin gestartete
// Party steht in keiner Uhr, soll aber genauso auf die Rainbow-Chance wirken.
const { sonderform } = require("../world/ereignisse");
const { unitAusText } = require("./tageszeit");

const SPECIAL_BOOST = { golden: 2.0, rainbow: 5.0 };
const GOLD_MAX = 9_000_000_000_000_000;
const SUB_BONUS = 1.5;

/**
 * Wie lange eine geerntete instanceId als „gerade erst weg" gilt (siehe
 * merkeGeerntet unten). Muss deutlich über jeder realistischen Verzögerung
 * eines nachlaufenden PUT liegen (Speichern ist alle paar Sekunden, plus
 * Netzlaufzeit) — 5 Minuten sind reichlich Puffer, ohne die Karte unbegrenzt
 * wachsen zu lassen.
 */
const GEERNTET_TOMBSTONE_MS = 5 * 60 * 1000;

/**
 * Merkt sich, dass diese instanceId gerade geerntet (bzw. beim Gärtner-Nachwuchs
 * ersetzt) wurde — verplausibilisierePflanzen (gardenGameRoutes.js) verweigert
 * ihr danach eine Wiederauferstehung als „neu gepflanzt".
 *
 * GEFUNDEN 14.09.: ein PUT, der eine LÄNGST geerntete Pflanze (dieselbe
 * instanceId, alte Zeiten) erneut an ihrem Schlüssel einreicht, fand in
 * verplausibilisierePflanzen keinen Treffer mehr (die Zelle ist ja leer) und
 * landete im „neu gesetzt"-Zweig — der würfelt anstandslos frische Wachstums-
 * zeiten, ohne zu prüfen, ob überhaupt je ein Same dafür bezahlt wurde. Ausgelöst
 * hat das ein Browser-Wettlauf (Schnellzug + nachlaufender Einzelklick treffen
 * dieselbe Zelle, siehe handleHarvest in GameContainer.jsx), der jetzt eigenständig
 * behoben ist — diese Sperre bleibt trotzdem als zweite Absicherung stehen: der
 * eingangs dokumentierte Vorbehalt oben ("es entsteht kein Gold aus dem Nichts")
 * galt nur PRO ERNTE, nicht für eine BELIEBIG OFT wiederholbare kostenlose
 * Neubepflanzung derselben Zelle.
 */
function merkeGeerntet(state, instanceId, now = Date.now()) {
    if (!instanceId) return;
    const karte = isPlainObjectLocal(state._kuerzlichGeerntet) ? state._kuerzlichGeerntet : {};
    karte[instanceId] = now;
    // Aufräumen statt unbegrenzt wachsen: alles älter als die Tombstone-Zeit fliegt raus.
    for (const [id, zeit] of Object.entries(karte)) {
        if (now - (Number(zeit) || 0) > GEERNTET_TOMBSTONE_MS) delete karte[id];
    }
    state._kuerzlichGeerntet = karte;
}

function isPlainObjectLocal(o) {
    return Boolean(o) && typeof o === "object" && !Array.isArray(o);
}

/**
 * Gold gutschreiben UND den Lebenszeit-Zähler mitführen (v2, Feedback 29.08.:
 * "Gesamt gesammeltes Gold" in der Profil-Bubble).
 *
 * `state.gold` ist der KONTOSTAND — geht mit jedem Kauf wieder runter.
 * `state.goldGesamt` zählt nur nach oben: jeder Gulden, der je gutgeschrieben
 * wurde, bleibt darin stehen, auch wenn er längst wieder ausgegeben ist. EIN
 * Helfer für JEDEN Gewinn-Pfad (Verkauf, Tierfund, Logbuch-Belohnung,
 * Briefkasten-Empfang) statt einer zweiten Zeile an jeder Stelle einzeln —
 * ein künftiger Gewinn-Pfad, der das hier vergisst, würde sonst leise vom
 * Lebenszeit-Stand abweichen, ohne dass es auffällt.
 *
 * Käufe und Abbuchungen laufen NICHT hierüber (siehe spendGold) — Ausgeben
 * ist kein "Verdienen".
 */
function gutschreiben(state, betrag) {
    const n = Math.max(0, Math.floor(Number(betrag) || 0));
    if (n <= 0) return;
    state.gold = Math.min(GOLD_MAX, Math.max(0, Number(state.gold) || 0) + n);
    state.goldGesamt = Math.max(0, Number(state.goldGesamt) || 0) + n;
}

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
        // Seed über die instanceId: dieselbe Pflanze liefert bei Server UND Browser
        // dieselbe Reifezeit, egal wer zuerst hinsieht (siehe neuerFruchtstand).
        // Ganz alte Pflanzen ohne instanceId fallen auf echten Zufall zurück — für
        // die bleibt das Risiko bestehen, das war aber schon vorher der Stand.
        const iid = plant.instanceId;
        plant.fruitSlots = Array.from(
            { length: Math.max(1, Number(plant.maxFruits) || 1) },
            (_, i) => neuerFruchtstand(start, cycleMs, iid ? `${iid}:erstfrucht:${i}` : null),
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
 * Aufschlag des Skills „Züchter" auf ALLE Tierfähigkeiten — 1 = ungelernt.
 *
 * Eine Zahl für drei Wirkungen, damit der Skill hält, was sein Name sagt. Vorher
 * hing er allein an der Auslösechance und traf damit nur noch den Goldfinder, weil
 * die anderen beiden seit dem Tier-Umbau gar nicht mehr ticken.
 */
function tierVerstaerkung(state) {
    return 1 + wirkung(state, "zuechter");
}

/**
 * Chance des Gärtners auf kostenlosen Nachwuchs, mit Züchter.
 *
 * Gedeckelt bei 80 %, und das ist keine Willkür: bei 100 % wächst eine Einmalernte
 * immer von selbst nach und wäre damit dasselbe wie ein Dauerträger — der einzige
 * Unterschied zwischen den beiden Bauarten wäre weg.
 */
function nachwuchsChance(state) {
    return Math.min(0.8, getGaertnerStufe(state) * GAERTNER_NACHWUCHS * tierVerstaerkung(state));
}

/**
 * Wie stark das Wachstum auf diesem Grundstück verkürzt ist — „Grüner Daumen"
 * aus dem Fähigkeitsbaum plus „Wurzelwerk" des Gärtners (mit Züchter). Beide
 * stapeln sich additiv und sind bei 80 % gedeckelt, damit keine Kombination eine
 * Pflanze auf null Sekunden zieht.
 */
function wachstumsBonus(state) {
    return Math.min(0.8, wirkung(state, "gruener_daumen")
        + getGaertnerStufe(state) * GAERTNER_WURZELWERK * tierVerstaerkung(state));
}

/** Aufschlag des Forschers auf jede XP-Gutschrift, mit Züchter — siehe gibXp weiter unten. */
function forscherBoost(state) {
    return 1 + getForscherStufe(state) * FORSCHER_XP_PRO_STUFE * tierVerstaerkung(state);
}

/** Aufschlag des Kaufmann-Tiers auf den Verkaufspreis, mit Züchter — siehe sellAll weiter unten. */
function kaufmannBoost(state) {
    return 1 + getKaufmannStufe(state) * KAUFMANN_VERKAUF_PRO_STUFE * tierVerstaerkung(state);
}

/**
 * Verkaufspreis-Multiplikator aus Skill „Händler" UND Tier „Kaufmann" zusammen.
 *
 * BUGFIX (gefunden beim Bau von Punkt 9): harvestCell schrieb den Skill-Bonus
 * bisher NUR in `item.sellValue` — die Anzeige im Rucksack/„Gesamtwert"-Dialog.
 * verkaufswert(), das sellAll tatsächlich AUSZAHLT, rechnete ihn nie mit. Wer
 * „Händler" gelernt hatte, sah beim Verkaufen also weniger Gold, als die Anzeige
 * kurz vorher versprochen hatte — genau der Fehler, vor dem die Kommentare in
 * dieser Datei an mehreren Stellen warnen. Diese eine Funktion wird jetzt an
 * BEIDEN Stellen verwendet (harvestCell für die Anzeige, sellAll für die
 * Auszahlung), damit sie nicht wieder auseinanderlaufen können.
 */
function haendlerMultiplikator(state) {
    return (1 + wirkung(state, "haendler")) * kaufmannBoost(state);
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
    return {
        ...vorlage,
        plantedAt: now,
        growthMs: Math.max(1000, Math.round(roheMs * (1 - wachstumsBonus(state)))),
        // Ausgangsdauer merken — daran hängt der Gießkannen-Deckel. Ohne das
        // erbte der Nachwuchs die schon heruntergegossene Zeit als Basis.
        growthMsBasis: Math.max(1000, Math.round(roheMs * (1 - wachstumsBonus(state)))),
        stage: "growing",
        harvested: 0,
        norm: Math.pow(Math.random(), 1.35),
        specialType: sonderform(now),
        // Das Wetter fängt an der neuen Pflanze bei null an.
        statusEffects: [],
        statusEffect: null,
        statusEffectUntil: null,
    };
}

/**
 * `seed`: macht die Reifezeit-Streuung (0,8–1,2× Zyklus) UND die Sonderform
 * reproduzierbar statt per `Math.random()` gewürfelt — NUR wenn übergeben.
 * Gebraucht für den ERSTEN Fruchtstand eines Dauerträgers (siehe
 * bringeDauertraegerAufStand): Server UND Browser rechnen den unabhängig
 * voneinander aus (der Browser rät lokal, damit die Staude nicht bis zum
 * nächsten Kontakt mit dem Server leer dasteht — siehe
 * ensurePerennialFruitingState in engine/PlantSystem.js). Ohne denselben Seed
 * kommen zwei ECHTE Zufallszahlen heraus, die sich fast nie decken:
 *   Reifezeit    der Browser zeigt eine reife Frucht, der Server würfelt beim
 *                ersten Ernteversuch eine ANDERE (meist spätere) Zeit und lehnt
 *                mit „Noch nicht reif." ab — behoben, gemeldet 21.08.2026.
 *   Sonderform   der Browser zeigt einen goldenen Ring auf der Kachel, geerntet
 *                wird aber eine gewöhnliche Frucht, weil der Server unabhängig
 *                eine ANDERE Sonderform gewürfelt hat — behoben, gemeldet
 *                30.08.2026 (derselbe Fehler wie oben, nur an der Sonderform
 *                statt an der Zeit — beim ersten Fix übersehen).
 * Ein eigenes Sub-Wort (":sonderform") hinter dem Seed, damit die beiden Würfe
 * nicht denselben Hash teilen und sich Reifezeit und Sonderform nicht heimlich
 * aneinanderhängen. Nachwuchs NACH einer Ernte braucht das nicht: der ist
 * ohnehin ausschliesslich hier serverseitig gewürfelt und geht als fertiges
 * Ergebnis an den Browser, nie als eigene Vorhersage.
 */
function neuerFruchtstand(now, cycleMs, seed = null) {
    const streuung = seed != null ? unitAusText(seed) : Math.random();
    const norm = Math.pow(Math.random(), 1.35);
    return {
        readyAt: now + Math.round(cycleMs * (0.8 + streuung * 0.4)),
        norm,
        size: Math.max(1, Math.round(lerp(1, 50, norm))),
        specialType: sonderform(now, seed != null ? `${seed}:sonderform` : null),
        statusEffects: [],
        statusEffect: null,
        statusEffectUntil: null,
    };
}

/**
 * Logbuch (v2, Punkt 11): "Seite komplett" bringt jetzt eine Belohnung.
 *
 * WARUM DAS EINE ECHTE UMSTELLUNG IST, nicht nur ein Bonus obendrauf: das
 * Logbuch stand bisher explizit im Browser (siehe logbuchEintragen in
 * GameContainer.jsx — "nichts davon beeinflusst Werte, deshalb darf es im
 * Browser geführt werden"). Sobald eine Belohnung dranhängt, stimmt dieser Satz
 * nicht mehr: ein manipulierter Spielstand könnte sich sonst ein fertiges
 * Logbuch eintragen und für jede der 57 Arten sofort kassieren. Deshalb zieht
 * DIESE Datei das Logbuch jetzt hier mit, genau wie Gold und Erfahrung — der
 * Browser übernimmt nur noch, was hier zurückkommt, und führt nichts mehr
 * selbst nach.
 *
 * Die acht möglichen Ausprägungen je Art (Größe 1, Größe 50, Golden, Rainbow,
 * die vier Wetter-Effekte) müssen zur Liste in ui/LogbuchModal.jsx passen.
 */
const LOGBUCH_VARIANTEN_GESAMT = 8;
const LOGBUCH_BELOHNUNG_JE_SELTENHEIT = {
    COMMON: 5000, UNCOMMON: 25000, RARE: 150000, EPIC: 1000000, LEGENDARY: 10000000, MYTHIC: 100000000,
};
// Bewusst weit über der teuersten Einzel-Belohnung: alle Arten fertigzustellen
// ist ein Ziel für Wochen, kein Nebenbei — siehe die ursprüngliche Klage
// "es gibt kein Langzeitziel mehr" (v2-Planung, 21.08.2026).
const LOGBUCH_KOMPLETT_BONUS = 5_000_000_000;

function logbuchVollstaendig(eintrag) {
    if (!eintrag) return false;
    const effekte = new Set(eintrag.effekte || []);
    return eintrag.min === 1 && eintrag.max === 50
        && effekte.has("Golden") && effekte.has("Rainbow")
        && effekte.has("wet") && effekte.has("frozen") && effekte.has("charged") && effekte.has("moonlit");
}

/**
 * Ein geerntetes Stück ins Logbuch einrechnen und, falls dadurch eine Art (oder
 * das ganze Logbuch) zum ersten Mal vollständig wird, sofort Gold gutschreiben.
 *
 * `state.logbuchBelohnungen` merkt sich, welche Arten schon ausgezahlt haben —
 * ohne diese Sperre zahlte jede weitere Ernte derselben, längst vollständigen
 * Art erneut aus.
 *
 * @returns {{ seedId: string, belohnung: number, komplett: boolean }|null}
 *          nur gesetzt, wenn GERADE JETZT eine neue Belohnung ausgelöst wurde.
 */
function logbuchAktualisieren(state, item) {
    if (!item?.seedId) return null;
    if (!state.logbuch || typeof state.logbuch !== "object") state.logbuch = {};
    if (!state.logbuchBelohnungen || typeof state.logbuchBelohnungen !== "object") state.logbuchBelohnungen = {};

    const alt = state.logbuch[item.seedId] || { min: null, max: null, effekte: [], anzahl: 0 };
    const groesse = Number(item.size) || 1;
    const effekte = new Set(alt.effekte || []);
    if (item.specialData?.name) effekte.add(item.specialData.name);
    for (const e of wetterListe(item)) effekte.add(e);
    const neu = {
        min: alt.min === null ? groesse : Math.min(alt.min, groesse),
        max: alt.max === null ? groesse : Math.max(alt.max, groesse),
        effekte: [...effekte],
        anzahl: (alt.anzahl || 0) + 1,
    };
    state.logbuch[item.seedId] = neu;

    if (state.logbuchBelohnungen[item.seedId] || !logbuchVollstaendig(neu)) return null;
    state.logbuchBelohnungen[item.seedId] = true;

    const rarity = String(item.rarity || "COMMON").toUpperCase();
    let belohnung = LOGBUCH_BELOHNUNG_JE_SELTENHEIT[rarity] || LOGBUCH_BELOHNUNG_JE_SELTENHEIT.COMMON;

    // Erst NACH dem Eintragen prüfen: die gerade eingetragene Art zählt schon mit.
    const komplett = SEED_CATALOGUE.every((s) => state.logbuchBelohnungen[s.id]);
    if (komplett) belohnung += LOGBUCH_KOMPLETT_BONUS;

    gutschreiben(state, belohnung);
    return { seedId: item.seedId, belohnung, komplett };
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

    // Der Platz zählt nur, wenn das Stück auch im Rucksack landet. `einlagern: false`
    // ist der Weg für Aufrufer, die den Wert nur berechnen wollen.
    if (einlagern) {
        const maxSlots = Math.max(1, Number(state.inventoryMaxSlots) || 50);
        const belegt = (state.inventory?.length || 0) + (state.harvestedItems?.length || 0);
        if (belegt >= maxSlots) return { ok: false, status: 400, error: "Rucksack voll." };
    }

    let norm; let special; let effekte; let basis;
    // Welcher Fruchtstand nachgewachsen ist. Der Browser übernimmt danach GENAU
    // diesen einen Stand und behält seine übrigen — siehe Rückgabe unten.
    let nachgewachsen = null;
    // Bei einer Einmalernte ersetzt der Gärtner-Nachwuchs die GANZE Pflanze
    // (nicht nur einen Fruchtstand wie beim Dauerträger) — siehe unten.
    let singleUseNachwuchs = null;

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
        //
        // WICHTIG: die neue Pflanze muss mit der Antwort mit — sonst weiß der
        // Browser (der die Zelle beim Klick schon optimistisch geleert hat)
        // nichts von ihr, zeigt die Zelle dauerhaft als leer/erntereif an und
        // „Noch nicht reif" schlägt fehl, sobald doch geklickt wird (gemeldet
        // 28.08.2026 — plants[key] wurde hier gesetzt, aber nie zurückgegeben).
        if (getGaertnerStufe(state) > 0 && Math.random() < nachwuchsChance(state)) {
            singleUseNachwuchs = neuePflanzeAus(plant, profil, now, state);
            plants[key] = singleUseNachwuchs;
        } else {
            plant.stage = "harvested";
            delete plants[key];
        }
        // In JEDEM Fall: die instanceId, die hier gerade geerntet wurde, ist weg —
        // beim Gärtner-Nachwuchs bekommt die Zelle eine ANDERE, neu gewürfelte
        // instanceId (siehe neuePflanzeAus), diese alte darf nie wieder aufleben.
        merkeGeerntet(state, plant.instanceId, now);
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
    const gold = Math.max(1, Math.floor(
        Math.max(1, Math.floor(basis * specialBoost(special))) * wetterBoost(effekte) * haendlerMultiplikator(state),
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

    // ── Zweites Stück: Fähigkeit „Reiche Ernte" plus Erntehelfer ──────────────
    // Beide zahlen auf dieselbe Chance ein und stapeln sich additiv. Der Erntehelfer
    // sitzt bewusst HIER und nicht mehr in einem eigenen Tick: er verstärkt den Klick
    // des Spielers, statt ihn zu ersetzen (siehe core/pets.js).
    //
    // Nur wenn eingelagert wird UND noch ein Platz frei ist. Sonst fiele das
    // Zusatzstück lautlos unter den Tisch und der Spieler hielte die Fähigkeit
    // für kaputt.
    let zweites = null;
    const extraChance = wirkung(state, "ertrag")
        + getErntehelferExtra(getErntehelferStufe(state)) * tierVerstaerkung(state);
    if (Math.random() < extraChance) zweites = baueItem();

    // Erfahrung hängt jetzt auch an der Zykluslänge (siehe xpFuerErnte). Für eine
    // Einmalernte ist das ihre Wachstumszeit, für einen Dauerträger der Fruchtzyklus —
    // beides aus dem KATALOG, nicht aus der Pflanze: eine gegossene Pflanze soll nicht
    // weniger Erfahrung bringen als eine ungegossene.
    const zyklusMinuten = (plant.singleUse !== false
        ? ((Number(profil.growMinSec) || 0) + (Number(profil.growMaxSec) || 0)) / 2
        : (Number(profil.fruitCycleSec) || 0)) / 60;
    const erfahrung = gibXp(state, seltenheit, zyklusMinuten, forscherBoost(state));

    // Logbuch (v2, Punkt 11) — siehe logbuchAktualisieren oben. Beide Stücke
    // zählen, falls „Reiche Ernte"/Erntehelfer ein zweites gebracht hat; welches
    // von beiden zuerst eine Art vollmacht, ist Zufall und für die Belohnung egal.
    const logbuchBelohnungen = [logbuchAktualisieren(state, item), logbuchAktualisieren(state, zweites)]
        .filter(Boolean);

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
    //
    // `singleUseNachwuchs` ist bei einer Einmalernte dagegen unbedenklich als
    // GANZE Pflanze zu übernehmen: die Zelle war bis eben leer (Browser hat sie
    // beim Klick geleert), es gibt also nichts, was seit dem letzten Speichern
    // verloren gehen könnte.
    return {
        ok: true, item, zweites, nachgewachsen, singleUseNachwuchs, erfahrung, skillStand: skillStand(state),
        // Nur der eigene Eintrag, nicht das ganze Logbuch — der Browser mischt ihn
        // in seinen Stand, ein voller Katalog wäre bei jeder einzelnen Ernte
        // unnötiger Ballast. `gold` oben spiegelt jede Logbuch-Belohnung schon mit,
        // das hier ist nur fürs Anzeigen ("Logbuch komplett: Löwenzahn").
        logbuch: { [item.seedId]: state.logbuch[item.seedId] },
        logbuchBelohnungen,
    };
}

/**
 * Alle reifen Früchte EINER Zelle in EINEM Aufruf abernten — das Rückgrat des
 * Sammel-Endpunkts "harvestAll" (siehe gardenGameRoutes.js).
 *
 * WARUM DAS HIER LIEGT: Feedback 30.08. ("Shift-Ziehen erntet mit viel Lag")
 * — bisher kostete jede einzelne reife Frucht eine eigene Netzrunde (bis zu elf
 * bei einer vollbehangenen Orange), macht bei einem vollen Feld dutzende
 * Anfragen in Sekunden. Ruft `harvestCell` einfach WIEDERHOLT im selben
 * Request auf, statt die Schleife über das Netz zu schicken — jeder Durchlauf
 * bleibt exakt so, wie ein einzelner Klick ihn auch bekäme (derselbe
 * Sonderform-Wurf, derselbe Glückspilz-Check, dieselbe Logbuch-Prüfung), nur
 * ohne Wartezeit dazwischen. Ein Sammel-Aufruf bleibt damit so teuer wie eine
 * einzelne Ernte, egal wie viele Früchte gerade reif sind.
 *
 * `max` deckelt die Schleife selbst — gegen einen kaputt zusammengebauten
 * Spielstand mit mehr Fruchtständen, als der Katalog je vergibt (der grösste,
 * Orange, hat elf), liefe eine Endlosschleife sonst den Server fest.
 */
function harvestCellAll(state, key, now = Date.now(), { einlagern = true, max = 20 } = {}) {
    const items = [];
    // Ein Eintrag je tatsächlich abgeerntetem Fruchtstand — dieselbe Form wie
    // das einzelne `nachgewachsen`, nur als Liste. Der Browser wendet beide
    // Male dieselbe Übernahme an, siehe uebernehmenAlle in GameContainer.jsx.
    const aenderungen = [];
    let singleUseNachwuchs = null;
    let erfahrungGesamt = 0;
    // Wie oft "Reiche Ernte"/Erntehelfer ein zweites Stück gebracht haben — die
    // Anzeige zählt beim Sammel-Ernten sonst nur den GOLD-Gesamtbetrag, ohne
    // erkennen zu lassen, dass da unterwegs mehrfach ein Bonus dabei war
    // (Feedback 30.08.: "mehr Animationen/Messages für Nachwachsen, doppelte
    // Ernte").
    let bonusAnzahl = 0;
    const logbuch = {};
    const logbuchBelohnungen = [];
    let skillStandAktuell = null;
    let letzterFehler = null;
    let treffer = 0;

    for (let i = 0; i < max; i++) {
        const r = harvestCell(state, key, now, { einlagern });
        if (!r.ok) { letzterFehler = r; break; }
        treffer++;
        items.push(r.item);
        if (r.zweites) { items.push(r.zweites); bonusAnzahl++; }
        if (r.nachgewachsen) aenderungen.push(r.nachgewachsen);
        if (r.singleUseNachwuchs) singleUseNachwuchs = r.singleUseNachwuchs;
        erfahrungGesamt += Number(r.erfahrung?.xp) || 0;
        Object.assign(logbuch, r.logbuch);
        logbuchBelohnungen.push(...r.logbuchBelohnungen);
        skillStandAktuell = r.skillStand;
        // Einmalernte: die Zelle ist danach entweder neu bepflanzt (Gärtner)
        // oder leer — beides würde der nächste Durchlauf ohnehin mit „Noch
        // nicht reif."/„Dort wächst nichts." beenden, ein eigener Abbruch
        // spart nur die eine unnötige Runde.
        if (r.item.singleUse) break;
    }

    if (treffer === 0) return letzterFehler || { ok: false, status: 400, error: "Keine reife Frucht." };
    return {
        ok: true, items, aenderungen, singleUseNachwuchs, bonusAnzahl,
        erfahrung: { xp: erfahrungGesamt },
        skillStand: skillStandAktuell,
        logbuch, logbuchBelohnungen,
        // Eigene Marke statt eines Fehlers: die Ernte, die schon im Rucksack
        // liegt, war erfolgreich — der Browser soll das nur ANZEIGEN, nicht
        // als Fehlschlag werten.
        rucksackVoll: letzterFehler?.error === "Rucksack voll.",
    };
}

/**
 * Mehrere Zellen in EINEM Aufruf abernten — das Rückgrat des Sammel-Endpunkts
 * "harvestMany" (siehe gardenGameRoutes.js).
 *
 * WARUM: harvestCellAll oben bündelt schon alle Fruchtstände EINER Zelle in
 * einen Request. Ein Zug beim Schnellernten (Shift + Ziehen) berührt aber oft
 * VIELE Zellen — vorher kam für jede ihr eigener Request, und jede Antwort löst
 * im Browser einen eigenen Rendervorgang aus. Bei einem vollen Feld (dutzende
 * Zellen) und dazwischen vielleicht noch einem Tier- oder Skill-Ereignis
 * summierte sich das spürbar zu Ruckeln (Feedback 30.08.: "lagged, wenn
 * gleichzeitig durch Tiere/Skills etwas nachwächst"). Ein Aufruf für den GANZEN
 * Zug macht daraus GENAU EINEN Request und GENAU EINE Rückmeldung, egal wie
 * viele Zellen dabei waren — siehe handleHarvestMany in GameContainer.jsx.
 *
 * Anders als bei harvestCellAll bricht eine einzelne fehlgeschlagene Zelle
 * (zu schnell gezogen, inzwischen leer) die übrigen NICHT ab — jede Zelle
 * bekommt ihr eigenes Teilergebnis, der Browser wertet das getrennt aus.
 */
function harvestManyCells(state, keys, now = Date.now(), { einlagern = true } = {}) {
    const ernten = {};
    const logbuch = {};
    const logbuchBelohnungen = [];
    let treffer = false;

    for (const roh of keys) {
        const key = String(roh || "");
        if (!key || ernten[key]) continue;   // dieselbe Zelle nicht zweimal
        const r = harvestCellAll(state, key, now, { einlagern });
        if (r.ok) {
            treffer = true;
            ernten[key] = {
                ok: true, items: r.items, aenderungen: r.aenderungen,
                singleUseNachwuchs: r.singleUseNachwuchs, bonusAnzahl: r.bonusAnzahl,
                erfahrung: r.erfahrung, rucksackVoll: r.rucksackVoll,
            };
            Object.assign(logbuch, r.logbuch);
            logbuchBelohnungen.push(...r.logbuchBelohnungen);
        } else {
            ernten[key] = { ok: false, error: r.error };
        }
    }

    if (!treffer) return { ok: false, status: 400, error: "Keine reife Frucht." };
    return { ok: true, ernten, logbuch, logbuchBelohnungen };
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
    // haendlerMultiplikator statt nur kaufmannBoost: verkaufswert() selbst kennt den
    // Skill „Händler" nicht (siehe dessen Kommentar — absichtlich zustandslos für den
    // Briefkasten-Fall), der muss also hier rein, sonst zahlt die Kasse weniger als
    // die Rucksack-Anzeige (item.sellValue, siehe harvestCell) versprochen hat.
    const gesamt = Math.floor(summe * (isSubscriber ? SUB_BONUS : 1) * haendlerMultiplikator(state));
    const anzahl = lager.length;
    state.harvestedItems = [];
    gutschreiben(state, gesamt);
    return { ok: true, gold: state.gold, verdient: gesamt, anzahl };
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
    gutschreiben(state, preis);
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
    const level = clampLevel(pet?.ability?.level);
    // Nur noch der Goldfinder zahlt im Takt aus. Der Gärtner wirkt dauerhaft, der
    // Erntehelfer beim Ernten — beide brauchen keine Auszahlung mehr.
    if (pet?.ability?.type !== "goldfinder") {
        return { ok: false, status: 400, error: "Falsche Fähigkeit." };
    }

    const schluessel = petIdOf(pet);
    const zuletzt = Number(letzteFunde.get(schluessel) || 0);
    // 10 % Toleranz, damit ein leicht früher Timer im Browser nicht verworfen wird
    if (now - zuletzt < getPetTickMs(level) * 0.9) {
        return { ok: false, status: 429, error: "Zu früh." };
    }
    letzteFunde.set(schluessel, now);

    const [min, max] = getGoldfinderRange(level);
    const betrag = Math.floor(Math.random() * (max - min + 1)) + min;
    gutschreiben(state, betrag);
    return { ok: true, gold: state.gold, verdient: betrag, name: pet?.customName || pet?.name || "Tier" };
}

module.exports = {
    harvestCell, harvestCellAll, harvestManyCells, sellAll, spendGold, sellPet, petFind, istReif, verkaufswert, gutschreiben,
    bringeDauertraegerAufStand, wachstumsBonus, tierVerstaerkung, nachwuchsChance,
    forscherBoost, kaufmannBoost, haendlerMultiplikator,
    ablageEinlagern, ablageAuslagern,
    ablageAllesEin, ablageAllesAus,
    KISTE_MAX, VITRINE_MAX, GOLD_MAX, SUB_BONUS,
};
