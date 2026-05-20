// gardenMigration.js
// One-time migration: re-snaps all planted seeds to the current SEED_CATALOGUE values.
// Preserves plantedAt, norm/size, and stage — only overwrites economy timing and limits.
// Safe to leave active: running on already-migrated data is a no-op in effect.

const { scheduleFarmsSave } = require("./gardenFarmsStore");

// CommonJS mirror of Frontend/src/pages/GardenGame/engine/PlantSystem.js — SEED_CATALOGUE only.
// Keep in sync whenever PlantSystem.js changes.
const SEED_CATALOGUE = [
    // ── COMMON ──
    { id: "loewenzahn",   name: "Löwenzahn",    emoji: "🌼", rarity: "COMMON", singleUse: true,  shopPrice: 10,       growMinSec: 4,       growMaxSec: 12,      sellMin: 20,       sellMax: 60       },
    { id: "minze",        name: "Minze",        emoji: "🌿", rarity: "COMMON", singleUse: true,  shopPrice: 100,      growMinSec: 60,      growMaxSec: 150,     sellMin: 99,       sellMax: 247      },
    { id: "brennnesseln", name: "Brennnesseln",  emoji: "🌱", rarity: "COMMON", singleUse: true,  shopPrice: 135,      growMinSec: 45,      growMaxSec: 112,     sellMin: 310,      sellMax: 775      },
    { id: "spinat",       name: "Spinat",        emoji: "🍃", rarity: "COMMON", singleUse: true,  shopPrice: 170,      growMinSec: 240,     growMaxSec: 720,     sellMin: 30,       sellMax: 90       },
    { id: "salat",        name: "Salat",         emoji: "🥬", rarity: "COMMON", singleUse: true,  shopPrice: 210,      growMinSec: 60,      growMaxSec: 180,     sellMin: 350,      sellMax: 1050     },
    { id: "radieschen",   name: "Radieschen",    emoji: "🌿", rarity: "COMMON", singleUse: true,  shopPrice: 229,      growMinSec: 300,     growMaxSec: 1200,    sellMin: 300,      sellMax: 1200     },
    { id: "kohl",         name: "Kohl",          emoji: "🥬", rarity: "COMMON", singleUse: true,  shopPrice: 600,      growMinSec: 78,      growMaxSec: 234,     sellMin: 76,       sellMax: 228      },
    { id: "zwiebel",      name: "Zwiebel",       emoji: "🧅", rarity: "COMMON", singleUse: true,  shopPrice: 1000,     growMinSec: 50,      growMaxSec: 150,     sellMin: 1090,     sellMax: 3270     },
    { id: "karotte",      name: "Karotte",       emoji: "🥕", rarity: "COMMON", singleUse: true,  shopPrice: 2500,     growMinSec: 720,     growMaxSec: 2160,    sellMin: 2708,     sellMax: 8124     },
    { id: "erbsen",       name: "Erbsen",        emoji: "🫘", rarity: "COMMON", singleUse: false, shopPrice: 30,       structureGrowSec: 45,    fruitCycleSec: 35,    maxFruits: 1,  fruitSellMin: 42,    fruitSellMax: 126   },
    { id: "bohne",        name: "Bohne",         emoji: "🫘", rarity: "COMMON", singleUse: false, shopPrice: 50,       structureGrowSec: 70,    fruitCycleSec: 10,    maxFruits: 5,  fruitSellMin: 14,    fruitSellMax: 28    },

    // ── UNCOMMON ──
    { id: "knoblauch",    name: "Knoblauch",     emoji: "🧄", rarity: "UNCOMMON", singleUse: true,  shopPrice: 3000,     growMinSec: 2100,    growMaxSec: 6300,    sellMin: 3700,     sellMax: 11100    },
    { id: "kartoffel",    name: "Kartoffel",     emoji: "🥔", rarity: "UNCOMMON", singleUse: true,  shopPrice: 4200,     growMinSec: 120,     growMaxSec: 330,     sellMin: 5520,     sellMax: 15180    },
    { id: "ingwer",       name: "Ingwer",        emoji: "🌿", rarity: "UNCOMMON", singleUse: true,  shopPrice: 9000,     growMinSec: 90,      growMaxSec: 270,     sellMin: 10000,    sellMax: 30000    },
    { id: "paprika",      name: "Paprika",       emoji: "🫑", rarity: "UNCOMMON", singleUse: true,  shopPrice: 10000,    growMinSec: 100,     growMaxSec: 300,     sellMin: 20000,    sellMax: 60000    },
    { id: "aubergine",    name: "Aubergine",     emoji: "🍆", rarity: "UNCOMMON", singleUse: true,  shopPrice: 12000,    growMinSec: 14400,   growMaxSec: 50400,   sellMin: 15000,    sellMax: 52500    },
    { id: "mais",         name: "Mais",          emoji: "🌽", rarity: "UNCOMMON", singleUse: true,  shopPrice: 20000,    growMinSec: 240,     growMaxSec: 660,     sellMin: 20123,    sellMax: 55338    },
    { id: "kuebi",        name: "Kürbis",        emoji: "🎃", rarity: "UNCOMMON", singleUse: true,  shopPrice: 50000,    growMinSec: 180,     growMaxSec: 540,     sellMin: 60000,    sellMax: 180000   },
    { id: "rhabarber",    name: "Rhabarber",     emoji: "🌿", rarity: "UNCOMMON", singleUse: false, shopPrice: 250,      structureGrowSec: 900,   fruitCycleSec: 240,   maxFruits: 8,  fruitSellMin: 30,    fruitSellMax: 90    },
    { id: "gurke",        name: "Gurke",         emoji: "🥒", rarity: "UNCOMMON", singleUse: false, shopPrice: 400,      structureGrowSec: 105,   fruitCycleSec: 22,    maxFruits: 5,  fruitSellMin: 23,    fruitSellMax: 46    },
    { id: "zucchini",     name: "Zucchini",      emoji: "🥒", rarity: "UNCOMMON", singleUse: false, shopPrice: 500,      structureGrowSec: 21600, fruitCycleSec: 5400,  maxFruits: 7,  fruitSellMin: 73,    fruitSellMax: 146   },
    { id: "tomate",       name: "Tomate",        emoji: "🍅", rarity: "UNCOMMON", singleUse: false, shopPrice: 800,      structureGrowSec: 1100,  fruitCycleSec: 40,    maxFruits: 2,  fruitSellMin: 27,    fruitSellMax: 54    },
    { id: "chili",        name: "Chili",         emoji: "🌶️", rarity: "UNCOMMON", singleUse: false, shopPrice: 1300,     structureGrowSec: 130,   fruitCycleSec: 30,    maxFruits: 1,  fruitSellMin: 36,    fruitSellMax: 72    },

    // ── RARE ──
    { id: "grapefruit",   name: "Grapefruit",    emoji: "🍊", rarity: "RARE", singleUse: true,  shopPrice: 150000,   growMinSec: 86400,   growMaxSec: 302400,  sellMin: 160000,   sellMax: 560000   },
    { id: "zitrone",      name: "Zitrone",       emoji: "🍋", rarity: "RARE", singleUse: true,  shopPrice: 250000,   growMinSec: 9000,    growMaxSec: 16200,   sellMin: 261000,   sellMax: 469800   },
    { id: "aprikose",     name: "Aprikose",      emoji: "🍑", rarity: "RARE", singleUse: true,  shopPrice: 400000,   growMinSec: 43200,   growMaxSec: 86400,   sellMin: 500000,   sellMax: 1000000  },
    { id: "honigmelone",  name: "Honigmelone",   emoji: "🍉", rarity: "RARE", singleUse: true,  shopPrice: 520000,   growMinSec: 64800,   growMaxSec: 226800,  sellMin: 600000,   sellMax: 2100000  },
    { id: "cranberry",    name: "Cranberry",     emoji: "🫐", rarity: "RARE", singleUse: false, shopPrice: 3500,     structureGrowSec: 1500,  fruitCycleSec: 200,   maxFruits: 3,  fruitSellMin: 3500,  fruitSellMax: 8750  },
    { id: "stachelbeere", name: "Stachelbeere",  emoji: "🟢", rarity: "RARE", singleUse: false, shopPrice: 6000,     structureGrowSec: 21600, fruitCycleSec: 5400,  maxFruits: 7,  fruitSellMin: 250,   fruitSellMax: 500   },
    { id: "blaubeere",    name: "Blaubeere",     emoji: "🫐", rarity: "RARE", singleUse: false, shopPrice: 10000,    structureGrowSec: 43200, fruitCycleSec: 75600, maxFruits: 7,  fruitSellMin: 30,    fruitSellMax: 90    },
    { id: "himbeere",     name: "Himbeere",      emoji: "🫐", rarity: "RARE", singleUse: false, shopPrice: 15000,    structureGrowSec: 14400, fruitCycleSec: 4500,  maxFruits: 5,  fruitSellMin: 1750,  fruitSellMax: 2975  },
    { id: "erdbeere",     name: "Erdbeere",      emoji: "🍓", rarity: "RARE", singleUse: false, shopPrice: 55000,    structureGrowSec: 86400, fruitCycleSec: 10800, maxFruits: 8,  fruitSellMin: 4875,  fruitSellMax: 12187 },
    { id: "kirsche",      name: "Kirsche",       emoji: "🍒", rarity: "RARE", singleUse: false, shopPrice: 85000,    structureGrowSec: 7200,  fruitCycleSec: 5400,  maxFruits: 7,  fruitSellMin: 9000,  fruitSellMax: 27000 },
    { id: "limette",      name: "Limette",       emoji: "🍋", rarity: "RARE", singleUse: false, shopPrice: 93000,    structureGrowSec: 1800,  fruitCycleSec: 100,   maxFruits: 2,  fruitSellMin: 6000,  fruitSellMax: 15000 },

    // ── EPIC ──
    { id: "holunder",     name: "Holunder",      emoji: "🍇", rarity: "EPIC", singleUse: true,  shopPrice: 1000000,  growMinSec: 3600,    growMaxSec: 10800,   sellMin: 2000000,  sellMax: 6000000  },
    { id: "guave",        name: "Guave",         emoji: "🍈", rarity: "EPIC", singleUse: true,  shopPrice: 2500000,  growMinSec: 7200,    growMaxSec: 21600,   sellMin: 4000000,  sellMax: 10000000 },
    { id: "pfirsich",     name: "Pfirsich",      emoji: "🍑", rarity: "EPIC", singleUse: true,  shopPrice: 5000000,  growMinSec: 14400,   growMaxSec: 43200,   sellMin: 8000000,  sellMax: 20000000 },
    { id: "avocado",      name: "Avocado",       emoji: "🥑", rarity: "EPIC", singleUse: true,  shopPrice: 10000000, growMinSec: 172800,  growMaxSec: 518400,  sellMin: 12000000, sellMax: 36000000 },
    { id: "apfel",        name: "Apfel",         emoji: "🍎", rarity: "EPIC", singleUse: false, shopPrice: 500000,   structureGrowSec: 10800, fruitCycleSec: 5400,  maxFruits: 4,  fruitSellMin: 30000, fruitSellMax: 60000 },
    { id: "birne",        name: "Birne",         emoji: "🍐", rarity: "EPIC", singleUse: false, shopPrice: 500000,   structureGrowSec: 2700,  fruitCycleSec: 7200,  maxFruits: 3,  fruitSellMin: 100000,fruitSellMax: 250000},
    { id: "traube",       name: "Traube",        emoji: "🍇", rarity: "EPIC", singleUse: false, shopPrice: 670000,   structureGrowSec: 86400, fruitCycleSec: 10800, maxFruits: 7,  fruitSellMin: 18000, fruitSellMax: 49500 },
    { id: "orange",       name: "Orange",        emoji: "🍊", rarity: "EPIC", singleUse: false, shopPrice: 750000,   structureGrowSec: 64800, fruitCycleSec: 3600,  maxFruits: 11, fruitSellMin: 15000, fruitSellMax: 30000 },
    { id: "kiwi",         name: "Kiwi",          emoji: "🥝", rarity: "EPIC", singleUse: false, shopPrice: 850000,   structureGrowSec: 86400, fruitCycleSec: 900,   maxFruits: 1,  fruitSellMin: 12500, fruitSellMax: 25000 },
    { id: "pflaume",      name: "Pflaume",       emoji: "🍑", rarity: "EPIC", singleUse: false, shopPrice: 1000000,  structureGrowSec: 560,   fruitCycleSec: 600,   maxFruits: 9,  fruitSellMin: 7220,  fruitSellMax: 14440 },
    { id: "mango",        name: "Mango",         emoji: "🥭", rarity: "EPIC", singleUse: false, shopPrice: 2000000,  structureGrowSec: 43200, fruitCycleSec: 3600,  maxFruits: 6,  fruitSellMin: 10000, fruitSellMax: 30000 },
    { id: "olive",        name: "Olive",         emoji: "🫒", rarity: "EPIC", singleUse: false, shopPrice: 2750000,  structureGrowSec: 86400, fruitCycleSec: 2700,  maxFruits: 2,  fruitSellMin: 24500, fruitSellMax: 49000 },

    // ── LEGENDARY ──
    { id: "ananas",       name: "Ananas",        emoji: "🍍", rarity: "LEGENDARY", singleUse: true,  shopPrice: 50000000, growMinSec: 259200,  growMaxSec: 777600,  sellMin: 60000000, sellMax: 180000000},
    { id: "bambus",       name: "Bambus",        emoji: "🎋", rarity: "LEGENDARY", singleUse: true,  shopPrice: 100000000,growMinSec: 345600,  growMaxSec: 1036800, sellMin: 150000000,sellMax: 450000000},
    { id: "kakao",        name: "Kakao",         emoji: "🫘", rarity: "LEGENDARY", singleUse: true,  shopPrice: 500000000,growMinSec: 432000,  growMaxSec: 1296000, sellMin: 800000000,sellMax: 2400000000},
    { id: "drachenfrucht", name: "Drachenfrucht", emoji: "🐉", rarity: "LEGENDARY", singleUse: true,  shopPrice: 1000000000,growMinSec: 604800,  growMaxSec: 1814400, sellMin: 2000000000,sellMax: 6000000000},
    { id: "banane",       name: "Banane",        emoji: "🍌", rarity: "LEGENDARY", singleUse: false, shopPrice: 5000000, structureGrowSec: 1800,  fruitCycleSec: 900,   maxFruits: 7,  fruitSellMin: 24500, fruitSellMax: 49000 },
    { id: "acai",         name: "Acai",          emoji: "🫐", rarity: "LEGENDARY", singleUse: false, shopPrice: 10000000,structureGrowSec: 86400, fruitCycleSec: 5400,  maxFruits: 6,  fruitSellMin: 70000, fruitSellMax: 175000},
    { id: "passionsfrucht", name: "Passionsfrucht", emoji: "🌺", rarity: "LEGENDARY", singleUse: false, shopPrice: 25000000,structureGrowSec: 86400, fruitCycleSec: 1800,  maxFruits: 6,  fruitSellMin: 50000, fruitSellMax: 100000},
    { id: "sternfrucht",  name: "Sternfrucht",   emoji: "⭐", rarity: "LEGENDARY", singleUse: false, shopPrice: 100000000,structureGrowSec: 86400, fruitCycleSec: 18000, maxFruits: 1,  fruitSellMin: 750000,fruitSellMax: 1875000},
    { id: "dattel",       name: "Dattel",        emoji: "🌴", rarity: "LEGENDARY", singleUse: false, shopPrice: 1000000000,structureGrowSec: 86400, fruitCycleSec: 86400, maxFruits: 1,  fruitSellMin: 10000000,fruitSellMax: 20000000},
    { id: "kokosnuss",    name: "Kokosnuss",     emoji: "🥥", rarity: "LEGENDARY", singleUse: false, shopPrice: 10000000000,structureGrowSec: 86400, fruitCycleSec: 86400, maxFruits: 1,  fruitSellMin: 11000000,fruitSellMax: 27500000},

    // ── MYTHIC ──
    { id: "mondblume",    name: "Mondblume",     emoji: "🌙", rarity: "MYTHIC",    singleUse: true,  shopPrice: 50000000000,growMinSec: 864000, growMaxSec: 2592000, sellMin: 50000000000, sellMax: 150000000000},
];

const CATALOGUE_MAP = new Map(SEED_CATALOGUE.map(s => [s.id, s]));

function runPlantMigration(farmStates) {
    console.log("🌱 Starte DB-Pflanzen-Migration auf Magic Garden Economy...");
    let migratedUsers = 0;
    let migratedPlants = 0;

    const entries = typeof farmStates.entries === 'function' 
        ? Array.from(farmStates.entries()) 
        : Object.entries(farmStates);

    for (const [userId, state] of entries) {
        if (!state || !state.plotPlants) continue;

        let userChanged = false;

        for (const [key, plant] of Object.entries(state.plotPlants)) {
            const newProfile = SEED_CATALOGUE.find(s => s.id === plant.seedId);
            
            if (!newProfile) {
                console.warn(`Warnung: Pflanze ${plant.seedId} nicht im Migrations-Katalog gefunden.`);
                continue; 
            }

            // HIER IST DER FIX: Wir schreiben das VOLLSTÄNDIGE Profil in die Pflanze.
            plant.profile = { ...newProfile };

            if (plant.singleUse) {
                const norm = plant.norm ?? 0.5;
                const newGrowSec = newProfile.growMinSec + (newProfile.growMaxSec - newProfile.growMinSec) * norm;
                
                plant.growthMs = Math.round(newGrowSec * 1000);
                
                userChanged = true;
                migratedPlants++;
            } else {
                // ... (der Rest deiner Logik für Mehrwegpflanzen bleibt hier gleich)
                plant.structureGrowthMs = newProfile.structureGrowSec * 1000;
                plant.fruitCycleMs = Math.round(newProfile.fruitCycleSec * 1000);
                plant.maxFruits = newProfile.maxFruits;

                if (plant.stage === "structure") {
                    plant.structureReadyAt = plant.plantedAt + plant.structureGrowthMs;
                }

                if (Array.isArray(plant.fruitSlots) && plant.fruitSlots.length > 0) {
                    if (plant.fruitSlots.length > plant.maxFruits) {
                        plant.fruitSlots = plant.fruitSlots.slice(0, plant.maxFruits);
                    }
                    if (plant.fruitSlots.length < plant.maxFruits) {
                        const now = Date.now();
                        while (plant.fruitSlots.length < plant.maxFruits) {
                            plant.fruitSlots.push({
                                readyAt: now + Math.round(plant.fruitCycleMs * (0.8 + Math.random() * 0.4)),
                                norm: Math.pow(Math.random(), 1.35)
                            });
                        }
                    }
                }
                userChanged = true;
                migratedPlants++;
            }
        }

        if (userChanged) {
            if (typeof farmStates.set === 'function') {
                farmStates.set(userId, state); 
            } else {
                farmStates[userId] = state;
            }
            migratedUsers++;
        }
    }

    console.log(`✅ DB-Migration abgeschlossen! ${migratedPlants} Pflanzen bei ${migratedUsers} Spielern aktualisiert.`);
    return migratedUsers > 0;
}

module.exports = { runPlantMigration };
