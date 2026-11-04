// Tests für Schädlinge/Unkraut (core/stoerer.js). Ausführen: npm run test:garden
const test = require("node:test");
const assert = require("node:assert/strict");
const stoerer = require("./stoerer");
const { gutschreiben } = require("./economy");

/** Würfel mit fester Folge (wiederholt den letzten Wert). */
const wuerfel = (...folge) => { let i = 0; return () => folge[Math.min(i++, folge.length - 1)]; };
const farm = (pflanzen = {}) => ({ gold: 0, goldGesamt: 0, plotPlants: pflanzen });
const karotte = { seedId: "karotte", singleUse: true };

test("ohne Glück erscheint nichts", () => {
    const st = farm({ "0_0": karotte });
    assert.equal(stoerer.vielleichtErscheinen(st, 1e12, wuerfel(0.99)), null);
    assert.equal(stoerer.aktive(st, 1e12).length, 0);
});

test("Käfer sitzt auf einer Pflanze, Unkraut auf freiem Acker — nie auf dem Weg", () => {
    const st = farm({ "0_0": karotte });
    const k = stoerer.vielleichtErscheinen(st, 1e12, wuerfel(0, 0, 0, 0));
    assert.equal(k.art, "kaefer");
    assert.equal(k.key, "0_0");
    for (let i = 0; i < 200; i++) {
        const s = farm({ "0_0": karotte });
        const u = stoerer.vielleichtErscheinen(s, 1e12, wuerfel(0, 0.9, Math.random(), Math.random()));
        assert.equal(u.art, "unkraut");
        const [x, y] = u.key.split("_").map(Number);
        assert.notEqual(x, 7, "nicht auf dem Holzweg");
        assert.ok(x >= 0 && x < 15 && y >= 0 && y < 7, "auf dem Grundacker");
        assert.notEqual(u.key, "0_0", "nicht auf einer Pflanze");
    }
});

test("höchstens drei gleichzeitig", () => {
    const st = farm({ "0_0": karotte, "1_0": karotte, "2_0": karotte, "3_0": karotte });
    for (let i = 0; i < 10; i++) stoerer.vielleichtErscheinen(st, 1e12, wuerfel(0, 0, Math.random()));
    assert.equal(stoerer.aktive(st, 1e12).length, stoerer.STOERER_MAX);
});

test("fangen bringt Gold, zählt fürs Gesamt-Gold und geht nur einmal", () => {
    const st = farm({ "0_0": karotte });
    const k = stoerer.vielleichtErscheinen(st, 1e12, wuerfel(0, 0, 0, 0));
    const r = stoerer.fangen(st, k.id, gutschreiben, 1e12 + 1000);
    assert.equal(r.ok, true);
    assert.ok(r.gold >= 1);
    assert.equal(st.gold, r.gold);
    assert.equal(st.goldGesamt, r.gold);
    assert.equal(stoerer.fangen(st, k.id, gutschreiben, 1e12 + 2000).ok, false, "zweimal geht nicht");
    assert.equal(st.gold, r.gold);
});

test("abgelaufene lassen sich nicht mehr fangen und verschwinden", () => {
    const st = farm({ "0_0": karotte });
    const k = stoerer.vielleichtErscheinen(st, 1e12, wuerfel(0, 0, 0, 0));
    const spaet = 1e12 + stoerer.LEBEN_MS + 1;
    assert.equal(stoerer.aktive(st, spaet).length, 0);
    assert.equal(stoerer.fangen(st, k.id, gutschreiben, spaet).ok, false);
    assert.equal(st.gold, 0);
});

test("erfundene id bringt nichts", () => {
    const st = farm({ "0_0": karotte });
    assert.equal(stoerer.fangen(st, "st_gibtsnicht", gutschreiben, 1e12).ok, false);
    assert.equal(st.gold, 0);
});
