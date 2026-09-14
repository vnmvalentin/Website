// garden/core/werkzeug.js
// Der Werkzeugkasten — Kauf und Verbrauch, serverseitig.
//
// ── WARUM DAS HIERHER MUSSTE ─────────────────────────────────────────────────
// Gold gehört seit v3.0 dem Server, das Gekaufte lag aber im Browser
// (`toolInventory` kam aus dem PUT). Zwischen „bezahlt" und „gespeichert" klaffte
// damit eine Lücke, und JEDER Weg, der den Browserstand verwirft, fiel genau
// hinein: ein Nachladen nach Serverkonflikt, eine Migration beim Deploy, ein
// zweiter Tab, ein Verbindungsabriss. Ergebnis: Gold weg, Gießkanne nicht da.
// Genau das ist zweimal gemeldet worden („zehn gekauft, sechs bekommen" und
// „nach dem Deploy sind die Pflanztöpfe weg").
//
// Dagegen hilft kein besseres Nachreichen, sondern nur, die beiden Hälften in
// EINEN Schritt zu legen: hier wird Gold abgebucht UND das Werkzeug eingetragen.
// Dasselbe Muster wie beim Samenkauf (kaufeSamen in routes/gardenGameRoutes.js)
// und beim Briefkasten — überall dort, wo Wert entsteht oder wandert.
//
// Der Preis wird deshalb ebenfalls hier gerechnet und nicht mehr aus der Anfrage
// übernommen. Der Browser zeigt ihn nur an; die Formeln unten sind der Sollwert.

const { wirkung } = require("./skills");

/**
 * Muss zu BACKPACK_MAX_LEVEL im GameContainer passen.
 *
 * BALANCING Aug 2026: war 25 (300 Plätze, Vollausbau ~2,1 Mrd). Bei Einkommen im
 * zweistelligen Milliardenbereich (Legendäre + Rainbow + Party + Skillbaum + Tiere
 * stapeln sich) war das nach wenigen Tagen erledigt — und blieb danach für immer
 * die einzige Stelle, an der noch Gold auszugeben gewesen wäre. 50 Stufen (550
 * Plätze) ziehen dieselbe Formel einfach weiter: Stufe 30 ≈ 10 Mrd, Stufe 40 ≈
 * 821 Mrd, Stufe 49 (letzter Kauf) ≈ 42,4 Billionen, in Summe ≈ 119,5 Billionen —
 * weit unter GOLD_MAX (9 Billiarden), aber endlich ein Ziel, das mit dem
 * Lategame-Einkommen mithält. Bestehende Käufe unter Stufe 25 sind unverändert,
 * die Formel selbst (rucksackPreis) bleibt gleich.
 */
const BACKPACK_MAX_LEVEL = 50;
/**
 * Wie viele Steinfelder es überhaupt gibt — Spiegel von STEINFELDER_GESAMT in
 * Frontend/.../GameContainer.jsx bzw. STEIN_REIHEN/STEIN_WEG_REIHEN in
 * engine/MapConfig.js. UNVERÄNDERT seit v3.3, auch nach dem v2-Fundament: 16
 * Erweiterungsreihen, davon 2 Holzwege, mal 14 Spalten (15 minus Wegspalte) =
 * 196. v2 kürzt nur den ACKER um eine Bande (siehe MapConfig.js), das
 * Steinfeld selbst bleibt exakt, was es war.
 */
const STEINFELDER_GESAMT = (16 - 2) * (15 - 1);
/** Aufladungen je gekaufter Spitzhacke. */
const HACKE_LADUNGEN = 4;

const VERBRAUCHSGUeTER = { pickaxeUses: true, plantPots: true, wateringCans: true };

/**
 * Preis der nächsten Spitzhacke: 50.000 · 1,42^n.
 *
 * BALANCING v2: war 1,26^n (letzter Kauf ≈ 4,1 Mrd über alle 49 Käufe für die
 * 196 Steinfelder). Der ursprüngliche v2-Plan war, das Steinfeld selbst um zwei
 * Bänder zu vergrößern und die alte Kurve einfach weiterlaufen zu lassen — DAS
 * ist wieder verworfen (das Steinfeld bleibt bei 196, siehe STEINFELDER_GESAMT),
 * also muss jetzt die Kurve selbst die Arbeit machen: 50.000 · 1,42^n über
 * dieselben 49 Käufe (196 ÷ 4 Ladungen) landet beim letzten Kauf (n=48) bei
 * ≈ 1,02 Billionen. Muss zu getPickaxePrice im GameContainer passen.
 */
function pickaxePreis(gekauft) {
    return Math.floor(50000 * Math.pow(1.42, Math.max(0, Number(gekauft) || 0)));
}

/** Preis der nächsten Rucksackstufe: 20.000 · 1,55^n. */
function rucksackPreis(level) {
    return Math.max(1, Math.floor(20000 * Math.pow(1.55, Math.max(0, Number(level) || 0))));
}

/**
 * Der Werkzeugladen. `price` ist der Grundpreis; Spitzhacke und Rucksack rechnen
 * über die Formeln oben, weil ihr Preis mit jedem Kauf steigt.
 */
const WERKZEUGE = {
    pickaxe: { art: "verbrauch", feld: "pickaxeUses", menge: HACKE_LADUNGEN, bestand: null },
    shovel: { art: "einmalig", feld: "hasShovel", preis: 1000000, bestand: 1 },
    plant_pot: { art: "verbrauch", feld: "plantPots", menge: 1, preis: 1800, bestand: 10 },
    // Kein Lagerbestand: der Preis steigt exponentiell mit jeder Stufe (siehe
    // rucksackPreis) und bremst damit von selbst. Ein Limit von 1 pro Zehn-Minuten-
    // Rotation obendrauf hieß nur, dass volles Gold nutzlos herumlag — das war nie
    // die Absicht.
    backpack_upgrade: { art: "rucksack", preis: null, bestand: null },
    watering_can: { art: "verbrauch", feld: "wateringCans", menge: 1, preis: 5000, bestand: 10 },
    chest: { art: "einmalig", feld: "hasChest", preis: 750000, bestand: 1 },
    vitrine: { art: "einmalig", feld: "hasVitrine", preis: 5000000, bestand: 1 },
};

const STANDARD = {
    pickaxeUses: 0, pickaxesBought: 0, hasShovel: false, hasChest: false, hasVitrine: false,
    backpackUpgraded: false, backpackLevel: 0, plantPots: 0, wateringCans: 0,
};

/** Werkzeugkasten eines Spielstands — immer vollständig, nie undefined. */
function werkzeugVon(state) {
    const roh = state?.toolInventory && typeof state.toolInventory === "object" ? state.toolInventory : {};
    const raus = { ...STANDARD };
    for (const [k, v] of Object.entries(STANDARD)) {
        const w = roh[k];
        raus[k] = typeof v === "boolean" ? w === true : Math.max(0, Math.floor(Number(w) || 0));
    }
    raus.backpackUpgraded = raus.backpackLevel > 0 || roh.backpackUpgraded === true;
    return raus;
}

/** Was der nächste Kauf dieses Werkzeugs kostet. */
function preisFuer(state, toolId) {
    const w = werkzeugVon(state);
    const eintrag = WERKZEUGE[toolId];
    if (!eintrag) return null;
    if (toolId === "pickaxe") {
        // „Bergmann" ist ein Preisnachlass, gedeckelt bei 60 %.
        const nachlass = Math.min(0.6, wirkung(state, "bergbau"));
        return Math.max(1, Math.floor(pickaxePreis(w.pickaxesBought) * (1 - nachlass)));
    }
    if (toolId === "backpack_upgrade") {
        // "Lagerist" ist seit v2 (Punkt 4) ein Preisnachlass, kein zweiter Rucksack-
        // Ausbau mehr — analog zu "Bergmann" bei der Spitzhacke oben. Gedeckelt bei
        // 60 %, dieselbe Grenze wie dort, auch wenn 8 Stufen à 5 % (40 %) sie nie
        // erreichen — falls die Staffel künftig wächst, ist die Grenze schon da.
        const nachlass = Math.min(0.6, wirkung(state, "lagerist"));
        return Math.max(1, Math.floor(rucksackPreis(w.backpackLevel) * (1 - nachlass)));
    }
    return Math.max(0, Number(eintrag.preis) || 0);
}

function fehler(status, text, extra = null) {
    return { ok: false, status, error: text, ...(extra || {}) };
}

/**
 * Ein Werkzeug kaufen. Prüft Preis, Gold, Vorrat und Einmaligkeit, bucht ab und
 * trägt ein — alles in einem Schritt, ohne await dazwischen. Zwei gleichzeitige
 * Anfragen können sich damit nicht überholen.
 *
 * @param {Function} restVorrat  (toolId) => wie viele dieser Spieler noch nehmen darf
 * @param {Function} merkeKauf   (toolId) => auf den Vorrat anrechnen
 */
function kaufeWerkzeug(state, toolId, { restVorrat, merkeKauf, freigelegteFelder = 0, goldMax = Infinity } = {}) {
    const eintrag = WERKZEUGE[String(toolId || "")];
    if (!eintrag) return fehler(400, "Dieses Werkzeug gibt es nicht.");
    const w = werkzeugVon(state);

    if (eintrag.art === "einmalig" && w[eintrag.feld] === true) {
        return fehler(400, "Das hast du schon.");
    }
    if (toolId === "backpack_upgrade" && w.backpackLevel >= BACKPACK_MAX_LEVEL) {
        return fehler(400, `Der Rucksack ist voll ausgebaut (${50 + BACKPACK_MAX_LEVEL * 10} Plätze).`);
    }
    if (toolId === "pickaxe") {
        // Nicht mehr Aufladungen horten, als das Grundstück überhaupt hergibt.
        const offen = Math.max(0, STEINFELDER_GESAMT - Math.max(0, Number(freigelegteFelder) || 0));
        if (offen === 0) return fehler(400, "Dein Grundstück ist komplett freigelegt.");
        if (w.pickaxeUses >= offen) {
            return fehler(400, `Du hast schon genug Aufladungen für die restlichen ${offen} Steinfelder.`);
        }
    }
    if (eintrag.bestand !== null && typeof restVorrat === "function") {
        if (restVorrat(toolId) <= 0) return fehler(409, "Für diese Rotation ausverkauft.", { stock: 0 });
    }

    const preis = preisFuer(state, toolId);
    const gold = Math.max(0, Number(state.gold) || 0);
    if (gold < preis) {
        return fehler(400, `Dafür fehlen dir ${(preis - gold).toLocaleString("de-DE")} Gold.`);
    }

    // Ab hier wird nichts mehr abgelehnt: abbuchen und eintragen gehören zusammen.
    state.gold = Math.min(goldMax, gold - preis);
    if (eintrag.art === "einmalig") {
        w[eintrag.feld] = true;
    } else if (eintrag.art === "rucksack") {
        w.backpackLevel += 1;
        w.backpackUpgraded = true;
    } else {
        w[eintrag.feld] += eintrag.menge;
        if (toolId === "pickaxe") w.pickaxesBought += 1;
    }
    state.toolInventory = w;
    if (typeof merkeKauf === "function" && eintrag.bestand !== null) merkeKauf(toolId);

    // Reststand NACH dem Kauf, fürs Nachziehen im Laden — dieselbe Anzeige-
    // Wahrheit, die schon der Samenkauf zurückgibt (siehe kaufeSamen). Ohne das
    // wusste der Browser nur, dass SEIN eigener Klick den Vorrat um eins senkt,
    // nie den echten Server-Stand: eine Antwort, die eine Verbindungsstörung
    // verschluckte, gab die lokale Reservierung zurück, obwohl der Kauf beim
    // Server längst durch war — der Laden zeigte dann mehr an, als noch da war.
    const stock = (eintrag.bestand !== null && typeof restVorrat === "function")
        ? restVorrat(toolId)
        : null;

    return { ok: true, gold: state.gold, bezahlt: preis, toolInventory: w, stock };
}

/**
 * Buy-All (v2, Punkt 12): dasselbe Werkzeug wiederholt kaufen, bis der nächste
 * Kauf aus IRGENDEINEM Grund scheitert — Gold, Rotations-Vorrat, eigener
 * Deckel (Spitzhacke: freigelegte Steinfelder; Rucksack: BACKPACK_MAX_LEVEL)
 * oder Einmaligkeit. Braucht keine Sonderfälle je Werkzeugart: `kaufeWerkzeug`
 * kennt sie schon alle, hier wird nur so lange wiederholt, wie es klappt.
 *
 * EIN Request statt N vom Client — sonst weiss der Browser bei einem
 * Fehlschlag mittendrin nicht, wie viele Käufe DAVOR schon durch waren, und
 * es gäbe N Kassen-Sounds hintereinander statt einem.
 */
function kaufeWerkzeugAlle(state, toolId, opts = {}) {
    let anzahl = 0;
    let bezahltGesamt = 0;
    let ersterFehler = null;
    let letzteAntwort = null;
    // Notbremse, kein erwarteter Fall — 200 reicht für jede Preiskurve in
    // diesem Spiel bei weitem, verhindert aber eine Endlosschleife, falls sich
    // ein Preis mal auf 0 verrechnet.
    for (let i = 0; i < 200; i++) {
        const antwort = kaufeWerkzeug(state, toolId, opts);
        if (!antwort.ok) { if (anzahl === 0) ersterFehler = antwort; break; }
        anzahl++;
        bezahltGesamt += antwort.bezahlt || 0;
        letzteAntwort = antwort;
    }
    if (anzahl === 0) return ersterFehler;
    return {
        ok: true, gold: state.gold, bezahltGesamt, anzahl,
        toolInventory: letzteAntwort.toolInventory, stock: letzteAntwort.stock,
    };
}

/**
 * Ein Verbrauchsgut aufbrauchen. Der Browser meldet nur, DASS er es benutzt —
 * heruntergezählt wird hier, damit ein verworfener Browserstand nichts erfindet
 * und nichts verschluckt.
 */
function verbraucheWerkzeug(state, feld, anzahl = 1) {
    const key = String(feld || "");
    if (!VERBRAUCHSGUeTER[key]) return fehler(400, "Das lässt sich nicht verbrauchen.");
    const n = Math.max(1, Math.min(64, Math.floor(Number(anzahl) || 1)));
    const w = werkzeugVon(state);
    if (w[key] < n) return fehler(400, "Davon hast du nicht genug.");
    w[key] -= n;
    state.toolInventory = w;
    return { ok: true, toolInventory: w, verbraucht: n };
}

module.exports = {
    WERKZEUGE, STANDARD, BACKPACK_MAX_LEVEL, STEINFELDER_GESAMT, HACKE_LADUNGEN,
    werkzeugVon, preisFuer, kaufeWerkzeug, kaufeWerkzeugAlle, verbraucheWerkzeug, pickaxePreis, rucksackPreis,
};
