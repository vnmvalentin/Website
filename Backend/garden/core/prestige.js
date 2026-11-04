// core/prestige.js — „Neue Saat": Neustart der Farm gegen einen dauerhaften Stern.
//
// Freischaltung: Höchstlevel UND seit dem letzten Neustart genug Gold verdient
// (750 Mrd, jede weitere Saat das Doppelte). Höchstens STERNE_MAX Sterne.
// Je Stern dauerhaft +10 % Verkaufserlös und +10 % Ernte-Erfahrung, dazu Kosmetik
// (siehe KOSMETIK, Anzeige im Browser: ui/prestige.js).
//
// Zurückgesetzt wird alles, was den Ertrag treibt: Gold, Level, Fähigkeiten,
// Felder, Rucksack, Acker, Samen, Ernte, Kiste und Vitrine (sonst startet man
// gleich wieder mit den stärksten Pflanzen), Werkzeug, Brutkasten-Stufe.
// Es bleibt, was man gesammelt hat: Logbuch, Zuchtbuch, Tiere, Eier, Deko,
// Kleiderschrank und Gold-Shop, Wettbewerbs-Siege, Post, Lebenszeit-Gold.
//
// Diese Datei lädt skills/werkzeug erst in neueSaat() — skills.js liest
// erloesFaktor/xpFaktor von hier, ein Ringschluss beim Laden wäre sonst möglich.

const STERNE_MAX = 5;
const SCHWELLE_BASIS = 750_000_000_000;     // 750 Mrd für den ersten Stern (Simulator: Gelegenheitsspieler ~Tag 65)
const BONUS_JE_STERN = 0.1;
const START_GOLD = 500;                      // wie eine frische Farm (routes/gardenGameRoutes.js)

/** Kosmetik je Stern — die Browser-Liste in ui/prestige.js muss dazu passen. */
const KOSMETIK = [
    { ab: 1, id: "abzeichen", name: "Stern am Namen" },
    { ab: 2, id: "goldname", name: "Goldener Name" },
    { ab: 3, id: "spur", name: "Sternenspur beim Laufen" },
    { ab: 4, id: "goldfunken", name: "Goldene Ernte-Funken" },
    { ab: 5, id: "titel", name: "Titel „Sternengärtner“" },
];

function sterneVon(state) {
    const n = Math.floor(Number(state?.prestige?.sterne) || 0);
    return Math.max(0, Math.min(STERNE_MAX, n));
}

const erloesFaktor = (state) => 1 + BONUS_JE_STERN * sterneVon(state);
const xpFaktor = (state) => 1 + BONUS_JE_STERN * sterneVon(state);

/** Faktor, den ein Erntestück trägt (wie `vielfalt`), für verkaufswert(). */
function vonStueck(item) {
    const f = Number(item?.prestige);
    return Number.isFinite(f) && f > 1 ? Math.min(1 + BONUS_JE_STERN * STERNE_MAX, f) : 1;
}

function schwelleFuer(sterne) {
    return SCHWELLE_BASIS * 2 ** Math.max(0, sterne);
}

function verdientSeitStart(state) {
    const gesamt = Math.max(0, Number(state?.goldGesamt) || 0);
    const ab = Math.max(0, Number(state?.prestige?.abGold) || 0);
    return Math.max(0, gesamt - ab);
}

/** Alles, was das Fenster braucht. */
function status(state) {
    const { levelZuXp, MAX_LEVEL } = require("./skills");
    const sterne = sterneVon(state);
    const level = levelZuXp(state?.xp);
    const verdient = verdientSeitStart(state);
    const schwelle = schwelleFuer(sterne);
    const voll = sterne >= STERNE_MAX;
    return {
        sterne,
        max: STERNE_MAX,
        level,
        levelNoetig: MAX_LEVEL,
        verdient,
        schwelle,
        bonusJetzt: Math.round(BONUS_JE_STERN * sterne * 100),
        bonusDanach: Math.round(BONUS_JE_STERN * Math.min(STERNE_MAX, sterne + 1) * 100),
        bereit: !voll && level >= MAX_LEVEL && verdient >= schwelle,
        voll,
        kosmetik: KOSMETIK.map((k) => ({ ...k, frei: sterne >= k.ab })),
        verlauf: Array.isArray(state?.prestige?.verlauf) ? state.prestige.verlauf : [],
    };
}

/**
 * Die Farm zurücksetzen und einen Stern vergeben. Ändert `state` in place.
 * Zählt stateVersion hoch, damit ein noch offener Browser-Stand per PUT nichts
 * zurückschreiben kann (409 → neu laden).
 */
function neueSaat(state, now = Date.now()) {
    const st = status(state);
    if (st.voll) return { ok: false, status: 400, error: "Du hast schon alle Sterne." };
    if (st.level < st.levelNoetig) return { ok: false, status: 400, error: `Erst ab Level ${st.levelNoetig}.` };
    if (st.verdient < st.schwelle) return { ok: false, status: 400, error: "Du hast seit dem letzten Neustart noch nicht genug Gold verdient." };

    const { STANDARD } = require("./werkzeug");
    const sterne = st.sterne + 1;

    // Ertrag zurück auf null
    state.gold = START_GOLD;
    state.xp = 0;
    state.skills = {};
    state.plotPlants = {};
    state.plotUnlockedCells = [];
    state.plotExpansions = 0;
    state.steinfelderErlaubt = 0;
    state.inventory = [];
    state.harvestedItems = [];
    state.chestItems = [];
    state.vitrineItems = [];
    state.toolInventory = { ...STANDARD };
    state.inventoryMaxSlots = 50;
    state.ernteRausch = null;
    state.stoerer = [];
    delete state._kuerzlichGeerntet;

    // Brutkasten: Stufe zurück, liegende Eier wandern in den Eier-Vorrat.
    const slots = Array.isArray(state.incubator?.slots) ? state.incubator.slots : [];
    const eier = slots.filter((s) => s && s.egg).map((s) => s.egg);
    if (eier.length) state.eggInventory = [...(Array.isArray(state.eggInventory) ? state.eggInventory : []), ...eier];
    state.incubator = { unlockedSlots: 1, slots: [null] };

    const verlauf = Array.isArray(state.prestige?.verlauf) ? state.prestige.verlauf : [];
    state.prestige = {
        sterne,
        abGold: Math.max(0, Number(state.goldGesamt) || 0),
        verlauf: [...verlauf, { sterne, at: now, verdient: st.verdient }].slice(-STERNE_MAX),
    };
    state.stateVersion = (Number(state.stateVersion) || 0) + 1;
    // Wie die Migrationen: der Browser lädt beim nächsten Speichern (409) neu.
    state.serverAenderungAb = state.stateVersion;
    return { ok: true, prestige: status(state) };
}

module.exports = {
    STERNE_MAX, SCHWELLE_BASIS, BONUS_JE_STERN, KOSMETIK,
    sterneVon, erloesFaktor, xpFaktor, vonStueck, schwelleFuer, verdientSeitStart, status, neueSaat,
};
