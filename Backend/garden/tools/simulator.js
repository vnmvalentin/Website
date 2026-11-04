// garden/tools/simulator.js
// Wirtschafts-Simulator: ein Spieler über N Tage, mit den ECHTEN Spielfunktionen.
//
//     cd Backend && node garden/tools/simulator.js [tage] [durchlaeufe]
//
// Benutzt Laden-Rotation, Pflanzen, Ernte, Verkauf, XP, Skills und Spitzhacke aus
// dem Spielcode selbst (keine Kopien), damit die Zahlen nicht vom Spiel abweichen.
// Nicht enthalten (noch): Tiere, Missionen, Händler-Aufträge, Erntefest, Post,
// Party-Veredelung, Abo-Bonus, Gießkanne. Der Spielstand liegt nur im Speicher —
// die Datenbank wird nie geöffnet (Store per require.cache ersetzt).
//
// Ziel (Fahrplan Phase 2): sehen, wie schnell Gold über Wochen wächst, welche
// Quellen es treiben und wie weit Gelegenheits- und Vielspieler auseinanderliegen.

const path = require("path");
const Module = require("module");

// ── Store ersetzen, bevor irgendein Spielmodul geladen wird ─────────────────
const storePath = require.resolve(path.join(__dirname, "../store/farms.js"));
const leer = new Module(storePath, null);
leer.exports = { farmStates: new Map(), setFarmState: () => {}, scheduleFarmsSave: () => {}, initGardenFarmsStore: () => {}, saveAllFarmsSync: () => {}, closeDb: () => {} };
leer.loaded = true;
require.cache[storePath] = leer;

const routes = require("../routes/gardenGameRoutes.js");
const { verplausibilisierePflanzen, generateGlobalShopRotation, SHOP_POOL } = routes.intern;
const { harvestCell, harvestCellAll, sellAll, verkaufswert, petFind, gutschreiben, haendlerMultiplikator, SUB_BONUS } = require("../core/economy");
const { SEED_CATALOGUE } = require("../core/catalogue");
const { lerneSkill, levelZuXp, stufeVon, gibFesteXp } = require("../core/skills");
const quests = require("../core/quests");
const auftraege = require("../core/auftraege");
const { erstelleErntefest } = require("../world/erntefest");
const { getPetTickMs } = require("../core/pets");
const vielfaltModul = require("../core/vielfalt");
const { kaufeWerkzeug, verbraucheWerkzeug, preisFuer, werkzeugVon, STEINFELDER_GESAMT, HACKE_LADUNGEN } = require("../core/werkzeug");
const { wetterAusRotation, EFFEKT_FUER_WETTER } = require("../core/wetterVerlauf");

const MIN = 60 * 1000;
const STUNDE = 60 * MIN;
const TAG = 24 * STUNDE;
const ROTATION = 5 * MIN;
const KATALOG = new Map(SEED_CATALOGUE.map((s) => [s.id, s]));
const E_NORM = 1 / 2.35; // Erwartungswert von U^1,35

const PROFILE = {
    gelegenheit: { name: "Gelegenheit (1 h abends)", sitzungen: [[19, 1]] },
    aktiv: { name: "Aktiv (3 h verteilt)", sitzungen: [[8, 0.5], [13, 0.5], [19, 2]] },
    viel: { name: "Vielspieler (10 h)", sitzungen: [[7, 2], [12, 3], [18, 5]] },
};

const SKILL_REIHENFOLGE = ["gruener_daumen", "haendler", "ertrag", "wetterfuehlig", "seltenheit", "zuechter", "bergbau", "lagerist", "giesskanne", "sortenkenner", "auftragsprofi", "festkomitee"];

// Basis-Acker 7×7 und Steinfelder als Zellschlüssel
const BASIS = [];
for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) BASIS.push(`${x}_${y}`);
const STEINE = [];
for (let y = 8; y < 8 + 20 && STEINE.length < STEINFELDER_GESAMT; y++) for (let x = 0; x < 15 && STEINE.length < STEINFELDER_GESAMT; x++) if (x !== 7) STEINE.push(`${x}_${y}`);

/** Erwarteter Ertrag je Feld und Stunde (für die Kaufentscheidung). */
function bewertung(seedId) {
    const p = KATALOG.get(seedId);
    if (!p) return null;
    if (p.singleUse !== false) {
        const erloes = p.sellMin + (p.sellMax - p.sellMin) * E_NORM;
        const stunden = (p.growMinSec + p.growMaxSec) / 2 / 3600;
        return { dauer: false, gewinnJeStunde: (erloes - p.shopPrice) / Math.max(stunden, 1 / 60), stunden, preis: p.shopPrice, faktor: erloes / p.shopPrice };
    }
    const frucht = p.fruitSellMin + (p.fruitSellMax - p.fruitSellMin) * E_NORM;
    const jeStunde = (p.maxFruits * frucht) / (p.fruitCycleSec / 3600);
    const amort = p.structureGrowSec / 3600 + p.shopPrice / Math.max(jeStunde, 1e-9);
    return { dauer: true, ertragJeStunde: jeStunde, amortStunden: amort, preis: p.shopPrice };
}

function istOnline(profil, t) {
    const h = (t % TAG) / STUNDE;
    return profil.sitzungen.some(([ab, dauer]) => h >= ab && h < ab + dauer);
}

function naechsterStart(profil, t) {
    const tag = Math.floor(t / TAG) * TAG;
    const starts = [];
    for (const d of [0, 1]) for (const [ab] of profil.sitzungen) starts.push(tag + d * TAG + ab * STUNDE);
    return starts.filter((s) => s > t).sort((a, b) => a - b)[0];
}

/**
 * Tiere, die der Spieler bis Tag n ausgebrütet hat — vereinfachte Annahme (Eier-
 * kosten fallen gegenüber dem Einkommen kaum ins Gewicht): ab Tag 2 je ein Gold-
 * finder, Erntehelfer und Gärtner; Stufe 2 → 3 (Tag 7) → 4 (Tag 14) → 5 (Tag 21).
 */
function tiereAmTag(tag) {
    if (tag < 2) return [];
    const stufe = tag >= 21 ? 5 : tag >= 14 ? 4 : tag >= 7 ? 3 : 2;
    return ["goldfinder", "harvester", "seedfinder"].map((typ) => ({
        id: `sim-${typ}`, name: "Huhn", rarity: "COMMON", ability: { type: typ, level: stufe },
    }));
}

function simuliere(profilName, tage, startT, optionen = {}) {
    const opt = { abo: false, extras: true, vielfalt: true, ...optionen };
    const profil = PROFILE[profilName];
    const state = {
        gold: 500, goldGesamt: 0, xp: 0, skills: {}, plotPlants: {}, plotUnlockedCells: [],
        inventory: [], harvestedItems: [], inventoryMaxSlots: 50, petPlacements: [], toolInventory: werkzeugVon({}),
        updatedAt: startT,
    };
    const quellen = {}; // Quelle → Gold
    const zaehle = (quelle, betrag) => { if (betrag > 0) quellen[quelle] = (quellen[quelle] || 0) + betrag; };
    const fest = erstelleErntefest(new Map([["sim", state]]));
    const petFunde = new Map();
    const tagebuch = [];
    let rotation = null;
    let rotationBis = 0;
    let gekauft = {};
    let t = startT;
    const ende = startT + tage * TAG;
    let naechsterTagesbericht = startT + TAG;

    const zellen = () => [...BASIS, ...STEINE.slice(0, state.plotUnlockedCells.length)];

    function verkaufen(now) {
        if (!state.harvestedItems.length) return;
        const faktor = (opt.abo ? SUB_BONUS : 1) * haendlerMultiplikator(state);
        for (const item of state.harvestedItems) {
            const p = KATALOG.get(item.seedId);
            zaehle(`${p?.singleUse === false ? "Staude" : "Einmal"} ${p?.rarity || "?"}`, verkaufswert(item) * faktor);
        }
        const r = sellAll(state, opt.abo);
        if (opt.extras && r.ok) quests.melde(state, quests.TYP.VERKAUF_GOLD, r.verdient, now);
    }

    function liefern(now) {
        if (!opt.extras) return;
        auftraege.bringeAuftraegeAufStand(state, now);
        for (const p of state.auftraege?.plaetze || []) {
            if (!p?.id || !p.seedId) continue;
            const r = auftraege.auftragLiefern(state, p.id, now);
            if (r.ok) zaehle("Händler-Aufträge", r.belohnungGold);
        }
    }

    function ernten(now) {
        for (const key of Object.keys(state.plotPlants)) {
            const pl = state.plotPlants[key];
            if (!pl) continue;
            const r = pl.singleUse !== false ? harvestCell(state, key, now) : harvestCellAll(state, key, now);
            if (!r.ok && /Rucksack|voll/i.test(r.error || "")) { liefern(now); verkaufen(now); continue; }
            if (r.ok && opt.extras) {
                const stuecke = [r.item, r.zweites, ...(Array.isArray(r.items) ? r.items : [])].filter(Boolean);
                fest.melde(state, stuecke, now);
                quests.melde(state, quests.TYP.ERNTE_ANZAHL, stuecke.length, now);
                quests.melde(state, quests.TYP.ERNTE_GOLD, stuecke.reduce((s, it) => s + (Number(it?.sellValue) || 0), 0), now);
            }
            if (state.harvestedItems.length > state.inventoryMaxSlots - 10) { liefern(now); verkaufen(now); }
        }
        liefern(now);
        verkaufen(now);
    }

    function belohnungen(now) {
        if (!opt.extras) return;
        const ueb = quests.questUebersicht(state, now);
        for (const m of [...ueb.taeglich, ...ueb.woechentlich]) {
            if (!m.erreicht || m.abgeholt) continue;
            const r = quests.questAbholen(state, m.id, now);
            if (!r.ok) continue;
            gutschreiben(state, r.belohnungGold);
            gibFesteXp(state, r.belohnungXp);
            zaehle("Missionen", r.belohnungGold);
        }
        const f = fest.abholen(state, now);
        if (f.ok) zaehle("Erntefest", f.belohnungGold);
    }

    function tiere(now) {
        if (!opt.extras) return;
        state.petPlacements = tiereAmTag(Math.floor((now - startT) / TAG) + 1);
        const gf = state.petPlacements.find((p) => p.ability.type === "goldfinder");
        if (!gf) return;
        const takt = getPetTickMs(gf.ability.level);
        for (let s = 0; s < MIN; s += takt) {
            const r = petFind(state, gf.id, "gold", petFunde, now + s);
            if (r.ok) zaehle("Goldfinder", r.verdient);
        }
    }

    function bewittern(now) {
        if (!rotation) return;
        const effekt = EFFEKT_FUER_WETTER[wetterAusRotation(rotation.generatedAt)];
        if (!effekt) return;
        const faktor = 1 + (stufeVon(state, "wetterfuehlig") ? 0.1 * stufeVon(state, "wetterfuehlig") : 0);
        const traeger = [];
        for (const pl of Object.values(state.plotPlants)) {
            if (pl.singleUse !== false) traeger.push([pl, (Number(pl.growthMs) || MIN) / MIN]);
            else for (const s of pl.fruitSlots || []) if (s) traeger.push([s, (Number(pl.fruitCycleMs) || MIN) / MIN]);
        }
        for (const [tr, zyklus] of traeger) {
            const liste = Array.isArray(tr.statusEffects) ? tr.statusEffects : [];
            if (liste.includes(effekt)) continue;
            const wetterMinuten = Math.max(1, zyklus * 0.075);
            const chance = Math.max(0.001, Math.min(0.5, 1 - Math.pow(1 - Math.min(0.9, 0.06 * faktor), 1 / wetterMinuten)));
            if (Math.random() < chance) tr.statusEffects = [...liste, effekt];
        }
    }

    function pflanze(key, seedId, now) {
        const roh = { [key]: { seedId, cellX: Number(key.split("_")[0]), cellY: Number(key.split("_")[1]) } };
        const frei = new Map([[seedId, 1]]);
        const neu = verplausibilisierePflanzen({ ...state.plotPlants, ...roh }, state, state.plotUnlockedCells.length + 200, now, frei);
        if (neu[key]) state.plotPlants = neu;
        return !!neu[key];
    }

    function einkaufen(now) {
        const alleZellen = zellen();
        const frei = alleZellen.filter((k) => !state.plotPlants[k]);
        const angebot = rotation.seeds.filter((s) => s.active)
            .map((s) => ({ s, b: bewertung(s.seedId), rest: (rotation.bestand[s.seedId] || 0) - (gekauft[s.seedId] || 0) }))
            .filter((x) => x.b && x.rest > 0);
        // Einmalernten nur, wenn sie in der restlichen Spielzeit reif werden — sonst
        // blockieren sie das Feld bis zur nächsten Sitzung (zählt trotzdem, nur langsamer).
        const rang = (x) => x.b.dauer ? x.b.ertragJeStunde : Math.max(0, x.b.gewinnJeStunde);
        angebot.sort((a, b) => rang(b) - rang(a));

        for (const x of angebot) {
            while (x.rest > 0 && state.gold >= x.s.shopPrice) {
                let ziel = frei.shift();
                if (!ziel && x.b.dauer) {
                    // Schwächste Staude ersetzen, wenn diese mehr als doppelt so viel bringt
                    let schwach = null;
                    // Einzige Staude ihrer Sorte nicht opfern — sie hält den Vielfalt-Bonus.
                    const anzahlSorte = new Map();
                    for (const pl of Object.values(state.plotPlants)) anzahlSorte.set(pl.seedId, (anzahlSorte.get(pl.seedId) || 0) + 1);
                    for (const k of alleZellen) {
                        const pl = state.plotPlants[k];
                        if (!pl || pl.singleUse !== false) continue;
                        if (opt.vielfalt && (anzahlSorte.get(pl.seedId) || 0) < 2) continue;
                        const e = bewertung(pl.seedId)?.ertragJeStunde || 0;
                        if (!schwach || e < schwach.e) schwach = { k, e };
                    }
                    if (schwach && x.b.ertragJeStunde > 2 * schwach.e) { delete state.plotPlants[schwach.k]; ziel = schwach.k; }
                }
                if (!ziel && !x.b.dauer && x.b.gewinnJeStunde > 0) {
                    // Billige Einmalernte verdrängt eine schlechtere Einmalernte nicht (läuft noch)
                }
                if (!ziel) break;
                // Lohnt sich die Einmalernte überhaupt?
                if (!x.b.dauer && x.b.gewinnJeStunde <= 0) { frei.unshift(ziel); break; }
                state.gold -= x.s.shopPrice;
                gekauft[x.s.seedId] = (gekauft[x.s.seedId] || 0) + 1;
                x.rest--;
                if (!pflanze(ziel, x.s.seedId, now)) { state.gold += x.s.shopPrice; break; }
                if (opt.extras) quests.melde(state, quests.TYP.SAMEN_KAUF, 1, now);
            }
        }
    }

    function ausbauen() {
        // Spitzhacke, solange sie höchstens 25 % des Goldes kostet
        for (let i = 0; i < 50; i++) {
            if (state.plotUnlockedCells.length >= STEINFELDER_GESAMT) break;
            const preis = preisFuer(state, "pickaxe");
            if (state.gold * 0.25 < preis) break;
            const r = kaufeWerkzeug(state, "pickaxe", { restVorrat: () => Infinity, merkeKauf: () => {}, freigelegteFelder: state.plotUnlockedCells.length, goldMax: 9e15 });
            if (!r.ok) break;
            const ladungen = werkzeugVon(state).pickaxeUses;
            for (let k = 0; k < ladungen && state.plotUnlockedCells.length < STEINFELDER_GESAMT; k++) {
                if (!verbraucheWerkzeug(state, "pickaxeUses", 1).ok) break;
                state.plotUnlockedCells.push(STEINE[state.plotUnlockedCells.length]);
            }
        }
        for (const id of SKILL_REIHENFOLGE) while (lerneSkill(state, id).ok) { /* so viele Stufen wie möglich */ }
    }

    /**
     * Vielfalt pflegen (core/vielfalt.js): je Seltenheit bis zu drei verschiedene
     * STAUDEN halten — Einmalernten verschwinden nach der Ernte wieder. Kauft eine
     * fehlende Sorte, wenn sie höchstens 10 % des Goldes kostet, und setzt sie auf ein
     * freies Feld oder anstelle eines Duplikats der häufigsten Sorte.
     */
    function vielfaltPflegen(now) {
        if (!opt.vielfalt) return;
        const daSorten = new Map();
        for (const pl of Object.values(state.plotPlants)) {
            const p = KATALOG.get(pl.seedId);
            if (!p) continue;
            if (!daSorten.has(p.rarity)) daSorten.set(p.rarity, new Set());
            if (pl.singleUse === false) daSorten.get(p.rarity).add(p.id);
        }
        for (const s of rotation.seeds) {
            const p = KATALOG.get(s.seedId);
            if (!s.active || !p || p.singleUse !== false) continue;
            const sorten = daSorten.get(p.rarity) || new Set();
            if (sorten.size >= 3 || sorten.has(p.id)) continue;
            if ((rotation.bestand[s.seedId] || 0) - (gekauft[s.seedId] || 0) <= 0) continue;
            if (s.shopPrice > Math.max(state.gold * 0.2, 5000)) continue;
            let ziel = zellen().find((k) => !state.plotPlants[k]);
            if (!ziel) {
                const zahl = new Map();
                for (const pl of Object.values(state.plotPlants)) zahl.set(pl.seedId, (zahl.get(pl.seedId) || 0) + 1);
                const haeufigste = [...zahl.entries()].sort((a, b) => b[1] - a[1])[0];
                if (!haeufigste || haeufigste[1] < 4) continue;
                ziel = zellen().find((k) => state.plotPlants[k]?.seedId === haeufigste[0]);
                if (ziel) delete state.plotPlants[ziel];
            }
            if (!ziel) continue;
            state.gold -= s.shopPrice;
            gekauft[s.seedId] = (gekauft[s.seedId] || 0) + 1;
            if (pflanze(ziel, s.seedId, now)) { sorten.add(p.id); daSorten.set(p.rarity, sorten); } else state.gold += s.shopPrice;
        }
    }

    while (t < ende) {
        if (!istOnline(profil, t)) {
            t = Math.min(naechsterStart(profil, t), ende);
        } else {
            if (t >= rotationBis) {
                rotation = generateGlobalShopRotation();
                rotation.generatedAt = t;
                rotationBis = t + ROTATION;
                gekauft = {};
            }
            state.updatedAt = t;
            tiere(t);
            bewittern(t);
            ernten(t);
            belohnungen(t);
            if (t === rotationBis - ROTATION) vielfaltPflegen(t);
            einkaufen(t);
            ausbauen();
            t += MIN;
        }
        while (t >= naechsterTagesbericht && naechsterTagesbericht <= ende) {
            const pflanzen = Object.values(state.plotPlants);
            tagebuch.push({
                tag: tagebuch.length + 1,
                gold: state.gold, gesamt: state.goldGesamt, level: levelZuXp(state.xp), xp: state.xp, vielfalt: vielfaltModul.faktor(state.plotPlants),
                felder: zellen().length, stauden: pflanzen.filter((p) => p.singleUse === false).length,
                teuerste: pflanzen.map((p) => KATALOG.get(p.seedId)).sort((a, b) => b.shopPrice - a.shopPrice)[0]?.name || "-",
            });
            naechsterTagesbericht += TAG;
        }
    }
    return { tagebuch, quellen, state };
}

const zahl = (n) => {
    const a = Math.abs(n);
    if (a >= 1e12) return (n / 1e12).toFixed(2) + " Bio";
    if (a >= 1e9) return (n / 1e9).toFixed(2) + " Mrd";
    if (a >= 1e6) return (n / 1e6).toFixed(1) + " Mio";
    if (a >= 1e3) return (n / 1e3).toFixed(1) + " Tsd";
    return String(Math.round(n));
};

if (require.main === module) {
    const tage = Number(process.argv[2]) || 30;
    const laeufe = Number(process.argv[3]) || 1;
    const nurProfil = process.argv[4] && PROFILE[process.argv[4]] ? process.argv[4] : null;
    const abo = process.argv.includes("abo");
    const extras = !process.argv.includes("ohne-extras");
    const vielfalt = !process.argv.includes("ohne-vielfalt");
    const startT = Date.UTC(2026, 10, 2, 0, 0, 0);
    const ausgabe = {};
    for (const name of Object.keys(PROFILE)) {
        if (nurProfil && name !== nurProfil) continue;
        const ergebnisse = [];
        for (let i = 0; i < laeufe; i++) ergebnisse.push(simuliere(name, tage, startT, { abo, extras, vielfalt }));
        ausgabe[name] = ergebnisse;
        const r = ergebnisse[0];
        console.log(`\n=== ${PROFILE[name].name}${abo ? " + Abo" : ""}${extras ? "" : " (ohne Tiere/Missionen/Aufträge/Fest)"} ===`);
        for (const z of r.tagebuch.filter((z) => [7, 14, 21, 30, 42, tage].includes(z.tag))) {
            console.log(`Tag ${String(z.tag).padStart(2)}  Gold ${zahl(z.gold).padStart(10)}  verdient ${zahl(z.gesamt).padStart(10)}  Lv ${String(z.level).padStart(2)}  Felder ${z.felder}  Stauden ${z.stauden}  teuerste: ${z.teuerste}  Vielfalt ×${z.vielfalt}`);
        }
        if (laeufe > 1) {
            const end = ergebnisse.map((e) => e.state.goldGesamt).sort((a, b) => a - b);
            console.log(`Verdient nach ${tage} Tagen über ${laeufe} Läufe: min ${zahl(end[0])}, Mitte ${zahl(end[Math.floor(end.length / 2)])}, max ${zahl(end[end.length - 1])}`);
        }
        const tagMit = (lv) => r.tagebuch.find((z) => z.level >= lv)?.tag ?? "nie";
        console.log(`Level 50 an Tag ${tagMit(50)}, Level 100 an Tag ${tagMit(100)}`);
        const jeStufe = {};
        for (const [k, v] of Object.entries(r.quellen)) {
            const m = k.match(/(COMMON|UNCOMMON|RARE|EPIC|LEGENDARY|MYTHIC)$/);
            const g = m ? m[1] : k;
            jeStufe[g] = (jeStufe[g] || 0) + v;
        }
        const ges = Object.values(jeStufe).reduce((x, y) => x + y, 0) || 1;
        console.log("Nach Seltenheit/Quelle:", Object.entries(jeStufe).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${(100 * v / ges).toFixed(1)}%`).join(", "));
        const summe = Object.values(r.quellen).reduce((a, b) => a + b, 0) || 1;
        console.log("Quellen:", Object.entries(r.quellen).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k} ${Math.round(100 * v / summe)}%`).join(", "));
    }
}

module.exports = { simuliere, bewertung, PROFILE };
