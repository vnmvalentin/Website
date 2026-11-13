// node --test garden/core/angeln.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const angeln = require("./angeln");
const { besteStufe } = require("./pets");

const neu = () => ({ plotPlants: { "0_0": { seedId: "karotte", singleUse: true } }, fische: [], gold: 0, toolInventory: { hasAngel: true, koederWurm: 99 } });
const gut = (s, g) => { s.gold += g; };

test("zu früh gezogen: kein Fang, Wurf vorbei", () => {
    const s = neu();
    const w = angeln.werfen(s, { koeder: "wurm" }, 0);
    const r = angeln.ziehen(s, w.wurfId, w.bissIn - 1000);
    assert.equal(r.fang, null);
    assert.equal(r.grund, "zufrueh");
    assert.equal(s.angeln, null);
});

test("Anhieb im Fenster, Drill geschafft: Fisch im Eimer und im Fischbuch", () => {
    const s = neu();
    const w = angeln.werfen(s, { koeder: "wurm" }, 0);
    const r = angeln.ziehen(s, w.wurfId, w.bissIn + 300);
    assert.equal(r.drill, true);
    assert.equal(r.fang, null);
    assert.ok(r.schwierigkeit > 0);
    // Ringe (11.11.): die Antwort nennt Anzahl, Tempo und Zeitfenster
    assert.ok(r.ringe.anzahl >= 1 && r.ringe.dauerMs > 0 && r.ringe.fensterMs > 0);
    const e = angeln.einholen(s, w.wurfId, true, w.bissIn + 300 + angeln.ringeMinMs(angeln.RINGE[r.rarity]) + 50);
    assert.ok(e.fang);
    assert.equal(s.fische.length, 1);
    assert.equal(s.fischbuch[e.fang.fischId].anzahl, 1);
});

test("Drill verloren oder unmöglich schnell gemeldet: nichts gefangen", () => {
    const s = neu();
    let w = angeln.werfen(s, { koeder: "wurm" }, 0);
    angeln.ziehen(s, w.wurfId, w.bissIn + 100);
    assert.equal(angeln.einholen(s, w.wurfId, false, w.bissIn + 5000).grund, "entwischt");
    w = angeln.werfen(s, { koeder: "wurm" }, 0);
    angeln.ziehen(s, w.wurfId, w.bissIn + 100);
    assert.equal(angeln.einholen(s, w.wurfId, true, w.bissIn + 200).grund, "entwischt");
    assert.equal(s.fische.length, 0);
});

test("ohne Angel oder ohne Köder kein Wurf; Köder wird verbraucht", () => {
    const s = neu();
    s.toolInventory = { koederWurm: 5 };
    assert.equal(angeln.werfen(s, { koeder: "wurm" }, 0).ok, false);
    s.toolInventory = { hasAngel: true, koederWurm: 1 };
    assert.equal(angeln.werfen(s, {}, 0).ok, false);
    const w = angeln.werfen(s, { koeder: "wurm" }, 0);
    assert.ok(w.ok);
    assert.equal(s.toolInventory.koederWurm, 0);
    assert.equal(angeln.werfen(s, { koeder: "wurm" }, 0).ok, false);
    s.toolInventory = { hasAngel: true, koederLeucht: 1 };
    assert.ok(angeln.werfen(s, { koeder: "leucht" }, 0).bissIn <= 9000 * 0.65 + 1);
});

test("Jahreszeit- und Wetterfische beißen nur unter ihren Bedingungen", () => {
    const tag = { nacht: false, saison: "sommer", wetter: "sun" };
    const ids = (b) => new Set(angeln.FISCHE.filter((f) => angeln.beisst(f, b)).map((f) => f.id));
    assert.ok(ids(tag).has("hecht"));
    assert.ok(!ids(tag).has("zander"));
    assert.ok(!ids(tag).has("regenbogenforelle"));
    assert.ok(ids({ ...tag, wetter: "rain" }).has("regenbogenforelle"));
    assert.ok(ids({ nacht: true, saison: "winter", wetter: "snow" }).has("quappe"));
    assert.ok(!ids({ nacht: false, saison: "winter", wetter: "snow" }).has("quappe"));
});

test("zu spät oder fremde Wurf-id zählt nicht", () => {
    const s = neu();
    const w = angeln.werfen(s, { koeder: "wurm" }, 0);
    assert.equal(angeln.ziehen(s, w.wurfId, w.bissIn + 10000).grund, "zuspaet");
    angeln.werfen(s, { koeder: "wurm" }, 0);
    assert.equal(angeln.ziehen(s, "falsch", 1).ok, false);
});

test("Verkaufen schreibt Gold gut und leert den Eimer", () => {
    const s = neu();
    s.fische = [{ instanceId: "a", fischId: "barsch", rarity: "UNCOMMON", wert: 300 }, { instanceId: "b", fischId: "rotauge", rarity: "COMMON", wert: 100 }];
    const r = angeln.verkaufen(s, "alle", gut);
    assert.equal(r.gold, 400);
    assert.equal(s.gold, 400);
    assert.equal(s.fische.length, 0);
});

test("Hunger: Startfutter, verhungert ruht die Fähigkeit, Füttern weckt sie", () => {
    const s = neu();
    s.petPlacements = [{ id: "t1", ability: { type: "seedfinder", level: 2 } }];
    s.fische = [{ instanceId: "f", fischId: "barsch", rarity: "UNCOMMON", wert: 300 }];
    // Neues Tier: Startfutter, arbeitet
    assert.equal(besteStufe(s, "seedfinder", 0), 2);
    const start = s.tierFutter.t1;
    assert.ok(start > 0);
    // Verhungert: keine Wirkung, auch kein Bonus mehr
    assert.equal(besteStufe(s, "seedfinder", start + 1), 0);
    const r = angeln.fuettern(s, "t1", "f", start + 1);
    assert.ok(r.ok);
    assert.equal(s.fische.length, 0);
    assert.equal(besteStufe(s, "seedfinder", start + 1000), 2);
    assert.equal(besteStufe(s, "seedfinder", r.sattBis + 1), 0);
    // Anzeige nennt jedes Tier, auch verhungerte
    assert.equal(angeln.tierFutterAnzeige(s, r.sattBis + 1).t1, r.sattBis);
});

test("Stiefel taugt nicht als Futter", () => {
    const s = neu();
    s.petPlacements = [{ id: "t1", ability: { type: "seedfinder", level: 2 } }];
    s.fische = [{ instanceId: "f", fischId: "stiefel", rarity: "COMMON", wert: 5 }];
    assert.equal(angeln.fuettern(s, "t1", "f", 0).ok, false);
});

test("Ringe: seltenere Fische brauchen mehr und schnellere Treffer; Profi-Angel weitet das Fenster", () => {
    const folge = ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY", "MYTHIC"];
    for (let i = 1; i < folge.length; i++) {
        assert.ok(angeln.RINGE[folge[i]].anzahl >= angeln.RINGE[folge[i - 1]].anzahl);
        assert.ok(angeln.RINGE[folge[i]].dauerMs < angeln.RINGE[folge[i - 1]].dauerMs);
    }
    const s = neu();
    s.toolInventory.hasProfiAngel = true;
    const w = angeln.werfen(s, { koeder: "wurm" }, 0);
    const r = angeln.ziehen(s, w.wurfId, w.bissIn + 100);
    assert.equal(r.ringe.fensterMs, Math.round(angeln.RINGE[r.rarity].fensterMs * angeln.PROFI_FENSTER_FAKTOR));
});

test("Teichling: zeigt sich nur in seinem Zeitfenster, nie bei Schnee, und verschiebt die Chancen zu seltenen Fischen", () => {
    // Bei Gewitter (80 %) muss in 200 Fenstern mindestens eines mit Teichling dabei sein
    let start = null;
    for (let nr = 1000; nr < 1200 && start === null; nr++) {
        for (let t = 0; t < angeln.TEICHLING_FENSTER_MS; t += 5000) {
            if (angeln.teichlingAktiv(nr * angeln.TEICHLING_FENSTER_MS + t, "thunder")) { start = nr * angeln.TEICHLING_FENSTER_MS + t; break; }
        }
    }
    assert.ok(start !== null);
    assert.equal(angeln.teichlingAktiv(start, "snow"), false);
    assert.equal(angeln.teichlingAktiv(start + angeln.TEICHLING_DAUER_MS + 6000, "thunder"), false);
    const b = { nacht: false, saison: "sommer", wetter: "sun" };
    const zaehle = (glueck) => { let n = 0; for (let i = 0; i < 6000; i++) { const f = angeln.wuerfleFisch(0, "wurm", b, glueck); if (["EPIC", "LEGENDARY", "MYTHIC"].includes(f.rarity) && !f.kram) n++; } return n; };
    assert.ok(zaehle(angeln.TEICHLING_GLUECK) > zaehle(null) * 1.5);
});
