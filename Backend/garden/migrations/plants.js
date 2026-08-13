// garden/migrations/plants.js
// One-time migration: re-snaps all planted seeds to the current SEED_CATALOGUE values.
// Preserves plantedAt, norm/size, and stage — only overwrites economy timing and limits.
// Safe to leave active: running on already-migrated data is a no-op in effect.

const { scheduleFarmsSave } = require("../store/farms");

// CommonJS mirror of Frontend/src/pages/GardenGame/engine/PlantSystem.js — SEED_CATALOGUE only.
// Keep in sync whenever PlantSystem.js changes.
const { SEED_CATALOGUE } = require("../core/catalogue");

const CATALOGUE_MAP = new Map(SEED_CATALOGUE.map(s => [s.id, s]));

function runPlantMigration(farmStates) {
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

            // Kein Profil mehr in die Pflanze schreiben: Verkaufswerte kommen zur
            // Laufzeit aus dem Katalog. Ein eingefrorenes Profil war genau der Grund,
            // warum Balancing-Aenderungen an bestehenden Pflanzen wirkungslos blieben.
            delete plant.profile;

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

    return { migratedPlants, migratedUsers };
}

module.exports = { runPlantMigration };
