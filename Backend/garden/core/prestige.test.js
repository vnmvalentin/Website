// Tests für „Neue Saat" (core/prestige.js). Ausführen: npm run test:garden
const test = require("node:test");
const assert = require("node:assert/strict");
const p = require("./prestige");
const { xpFuerLevel, MAX_LEVEL, levelZuXp } = require("./skills");

const bereit = (extra = {}) => ({
    gold: 5e12, goldGesamt: 3e12, xp: xpFuerLevel(MAX_LEVEL), stateVersion: 7,
    skills: { gold: 3 }, plotPlants: { "1_1": { seedId: "mondblume" } }, plotUnlockedCells: ["0_0", "1_0"],
    plotExpansions: 2, steinfelderErlaubt: 40, inventory: [{ seedId: "mondblume" }],
    harvestedItems: [{ seedId: "karotte" }], chestItems: [{ seedId: "mondblume" }], vitrineItems: [{ seedId: "apfel" }],
    toolInventory: { hasShovel: true, hasChest: true, hasVitrine: true, backpackLevel: 30, pickaxeUses: 5 },
    inventoryMaxSlots: 350, eggInventory: [{ instanceId: "e1" }],
    incubator: { unlockedSlots: 4, slots: [{ egg: { instanceId: "e2" }, hatchAt: 1 }, null, null, null] },
    petInventory: [{ id: "t1" }], decoPlacements: [{ id: "d1" }], logbuch: { karotte: { min: 1 } },
    zuchtbuch: { x: 1 }, wettbewerbSiege: [{ woche: 1 }], reskins: { besitz: ["a"] },
    ...extra,
});

test("nur ab Höchstlevel und mit genug verdientem Gold", () => {
    assert.equal(p.neueSaat(bereit({ xp: 0 })).ok, false);
    assert.equal(p.neueSaat(bereit({ goldGesamt: 5e11 })).ok, false);
    assert.equal(p.neueSaat(bereit()).ok, true);
});

test("setzt Ertrag zurück, behält Sammlung", () => {
    const st = bereit();
    p.neueSaat(st, 1000);
    assert.equal(st.gold, 500);
    assert.equal(levelZuXp(st.xp), 1);
    assert.deepEqual(st.skills, {});
    assert.deepEqual(st.plotPlants, {});
    assert.deepEqual(st.plotUnlockedCells, []);
    assert.equal(st.steinfelderErlaubt, 0);
    assert.deepEqual(st.inventory, []);
    assert.deepEqual(st.harvestedItems, []);
    assert.deepEqual(st.chestItems, [], "Kiste wird geleert");
    assert.deepEqual(st.vitrineItems, [], "Vitrine wird geleert");
    assert.equal(st.toolInventory.hasShovel, false);
    assert.equal(st.toolInventory.backpackLevel, 0);
    assert.equal(st.inventoryMaxSlots, 50);
    assert.equal(st.incubator.unlockedSlots, 1);
    assert.deepEqual(st.eggInventory.map((e) => e.instanceId), ["e1", "e2"], "Ei aus dem Brutkasten bleibt erhalten");
    assert.equal(st.petInventory.length, 1);
    assert.equal(st.decoPlacements.length, 1);
    assert.ok(st.logbuch.karotte);
    assert.ok(st.zuchtbuch.x);
    assert.equal(st.wettbewerbSiege.length, 1);
    assert.equal(st.goldGesamt, 3e12, "Lebenszeit-Gold bleibt");
    assert.equal(st.prestige.sterne, 1);
    assert.equal(st.stateVersion, 8);
    assert.equal(st.serverAenderungAb, 8);
});

test("nächster Stern braucht das Doppelte, seit dem Neustart gezählt", () => {
    const st = bereit();
    p.neueSaat(st);
    st.xp = xpFuerLevel(MAX_LEVEL);
    st.goldGesamt += 1.4e12;
    assert.equal(p.status(st).bereit, false, "1,4 Bio reichen nicht für Stern 2 (1,5 Bio)");
    st.goldGesamt += 0.1e12;
    assert.equal(p.status(st).bereit, true);
});

test("Bonus je Stern, gedeckelt bei 5", () => {
    assert.equal(p.erloesFaktor({ prestige: { sterne: 0 } }), 1);
    assert.equal(p.erloesFaktor({ prestige: { sterne: 2 } }), 1.2);
    assert.equal(p.xpFaktor({ prestige: { sterne: 99 } }), 1.5);
    assert.equal(p.neueSaat(bereit({ prestige: { sterne: 5, abGold: 0 } })).ok, false);
    assert.equal(p.vonStueck({ prestige: 9 }), 1.5);
});
