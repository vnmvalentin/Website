// Tests für die gefragten Sorten am Markt (core/nachfrage.js). Ausführen: npm run test:garden
const test = require("node:test");
const assert = require("node:assert/strict");
const nachfrage = require("./nachfrage");
const { sellAll, verkaufswert } = require("./economy");
const { SEED_CATALOGUE } = require("./catalogue");

const MYTHIC = new Set(SEED_CATALOGUE.filter((s) => s.rarity === "MYTHIC").map((s) => s.id));

test("dieselbe Stunde ergibt dieselbe Liste, die Stunde danach eine eigene", () => {
    const t = 1_800_000_000_000;
    const a = nachfrage.stand(t);
    assert.deepEqual(nachfrage.stand(t + 59 * 60 * 1000 - (t % 3600000)), a);
    assert.equal(a.bis - a.seit, nachfrage.STUNDE_MS);
    assert.ok(t >= a.seit && t < a.bis);
});

test("3–4 Sorten, +20 bis +50 % in 5er-Schritten, nie Mythic, keine doppelt", () => {
    for (let h = 0; h < 500; h++) {
        const s = nachfrage.stand(h * nachfrage.STUNDE_MS + 1);
        assert.ok(s.sorten.length === 3 || s.sorten.length === 4);
        assert.equal(new Set(s.sorten.map((x) => x.seedId)).size, s.sorten.length);
        for (const x of s.sorten) {
            assert.ok(!MYTHIC.has(x.seedId), "keine Mythic-Sorte");
            assert.ok(x.bonus >= 0.2 && x.bonus <= 0.5);
            assert.equal(Math.round(x.bonus * 100) % 5, 0);
        }
    }
});

test("Verkauf rechnet den Bonus nur für gefragte Sorten ein", () => {
    const t = 1_800_000_000_000;
    const gefragt = nachfrage.stand(t).sorten[0];
    const andere = SEED_CATALOGUE.find((s) => !nachfrage.stand(t).sorten.some((x) => x.seedId === s.id) && !s.kreuzung && s.singleUse !== false);
    const stueck = (seedId, singleUse) => ({ seedId, singleUse, size: 25, rarity: "COMMON" });
    const gefragtSorte = SEED_CATALOGUE.find((s) => s.id === gefragt.seedId);
    const items = [stueck(gefragt.seedId, gefragtSorte.singleUse), stueck(andere.id, true)];
    const st = { gold: 0, goldGesamt: 0, harvestedItems: items.map((x) => ({ ...x })) };
    const r = sellAll(st, false, t);
    const erwartet = Math.floor(verkaufswert(items[0]) * (1 + gefragt.bonus) + verkaufswert(items[1]));
    assert.equal(r.ok, true);
    assert.equal(r.verdient, erwartet);
    assert.equal(r.nachfrageBonus, Math.floor(verkaufswert(items[0]) * gefragt.bonus));
});
