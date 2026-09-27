// Jedes Sigil hat mindestens einen Test (Auftrag 13). Testkarten sind unabhängig von den echten Kartendaten.
import { test } from "node:test";
import assert from "node:assert/strict";
import { setupBattle, act, endTurn, unitAt, testCard } from "./helpers.js";
import { SIGILS, PUBLIC_SIGILS, mergeSigils } from "../engine/sigils/index.js";
import { Resolver } from "../engine/battle.js";

const T = (/** @type {string} */ id, /** @type {any} */ o) => testCard(`S_${id}`, o);
T("wall", { attack: 0, health: 5 });
T("wall1", { attack: 0, health: 1 });
T("hit2", { attack: 2, health: 3 });
T("hit1", { attack: 1, health: 5 });
T("hit3", { attack: 3, health: 3 });
T("evolved", { attack: 4, health: 4 });

const tested = new Set();
/** @param {string} sigil @param {string} name @param {() => void} fn */
function sigilTest(sigil, name, fn) {
  tested.add(sigil);
  test(`${sigil}: ${name}`, fn);
}

// ───────── Bewegung ─────────
sigilTest("schwinge", "fliegt über Blocker direkt auf die Waage", () => {
  T("flyer", { attack: 2, health: 1, sigils: ["schwinge"] });
  const s = setupBattle({ p0: { front: ["S_flyer"] }, p1: { front: ["S_wall"] } });
  endTurn(s);
  assert.equal(s.scale, 2);
  assert.equal(unitAt(s, 1, "front", 0).health, 5);
});

sigilTest("hochwuchs", "blockt Schwinge-Angriffe", () => {
  T("tall", { attack: 0, health: 4, sigils: ["hochwuchs"] });
  const s = setupBattle({ p0: { front: ["S_flyer"] }, p1: { front: ["S_tall"] } });
  endTurn(s);
  assert.equal(s.scale, 0);
  assert.equal(unitAt(s, 1, "front", 0).health, 2);
});

sigilTest("tauchgang", "taucht am Ende jedes eigenen Zugs ab (auch ohne Angriff); gegnerische Angriffe gehen auf die Waage", () => {
  T("diver", { attack: 0, health: 2, sigils: ["tauchgang"] });
  T("rot1", { attack: 0, health: 3, sigils: ["faeulnis"] });
  const s = setupBattle({ p0: { front: ["S_diver"], back: [null, "S_diver"] }, p1: { front: ["S_hit2", "S_rot1"] } });
  endTurn(s);
  assert.equal(unitAt(s, 0, "front", 0).submerged, true);
  assert.equal(unitAt(s, 0, "front", 1).submerged, true); // nachgerückt, taucht trotzdem ab
  assert.equal(unitAt(s, 0, "front", 1).health, 2); // Fäulnis erreicht abgetauchte Karten nicht
  s.players[1].drew = true;
  endTurn(s);
  assert.equal(unitAt(s, 0, "front", 0).health, 2);
  assert.equal(unitAt(s, 0, "front", 0).submerged, false); // wieder aufgetaucht zu Zugbeginn
  assert.equal(s.scale, 0 - 2);
});

sigilTest("wanderer", "bewegt sich am Zugende, kehrt am Rand um, bleibt bei Blockade stehen", () => {
  T("walker", { attack: 0, health: 1, sigils: ["wanderer"] });
  const s = setupBattle({ p0: { front: [null, null, "S_wall", "S_walker"] } });
  endTurn(s);
  // Rand rechts → umkehren, Lane 2 blockiert → stehen bleiben
  assert.equal(unitAt(s, 0, "front", 3).card.baseId, "S_walker");
  assert.equal(unitAt(s, 0, "front", 3).dir, -1);
  const t = setupBattle({ p0: { front: ["S_walker"] } });
  endTurn(t);
  assert.equal(unitAt(t, 0, "front", 1).card.baseId, "S_walker");
});

sigilTest("grabwuehler", "springt aus der Hinterreihe in eine direkt angegriffene Lane", () => {
  T("digger", { attack: 0, health: 3, sigils: ["grabwuehler"] });
  const s = setupBattle({ p0: { front: [null, "S_hit2"] }, p1: { back: ["S_digger"] } });
  endTurn(s);
  assert.equal(s.scale, 0);
  assert.equal(unitAt(s, 1, "front", 1).card.baseId, "S_digger");
  assert.equal(unitAt(s, 1, "front", 1).health, 1);
});

sigilTest("fluchtreflex", "weicht nach einem überlebten Treffer in eine freie Nachbarlane aus", () => {
  T("dodger", { attack: 0, health: 3, sigils: ["fluchtreflex"] });
  const s = setupBattle({ p0: { front: [null, "S_hit1"] }, p1: { front: ["S_wall", "S_dodger"] } });
  endTurn(s);
  assert.equal(unitAt(s, 1, "front", 1), null);
  assert.equal(unitAt(s, 1, "front", 2).card.baseId, "S_dodger");
});

sigilTest("rammbock", "bewegt sich und schiebt eigene Karten mit", () => {
  T("ram", { attack: 0, health: 2, sigils: ["rammbock"] });
  const s = setupBattle({ p0: { front: ["S_ram", "S_wall1", null, null] } });
  endTurn(s);
  assert.equal(unitAt(s, 0, "front", 1).card.baseId, "S_ram");
  assert.equal(unitAt(s, 0, "front", 2).card.baseId, "S_wall1");
});

sigilTest("vorpreschen", "rückt aus der Hinterreihe sofort vor (1× pro Zug)", () => {
  T("rusher", { attack: 1, health: 1, sigils: ["vorpreschen"] });
  const s = setupBattle({ p0: { back: ["S_rusher"] } });
  assert.equal(act(s, { type: "rush", lane: 0 }).error, undefined);
  assert.equal(unitAt(s, 0, "front", 0).card.baseId, "S_rusher");
  endTurn(s);
  assert.equal(s.scale, 1);
});

// ───────── Angriff ─────────
sigilTest("dreizack", "greift links, geradeaus und rechts an", () => {
  T("trident", { attack: 1, health: 1, sigils: ["dreizack"] });
  const s = setupBattle({ p0: { front: [null, "S_trident"] } });
  endTurn(s);
  assert.equal(s.scale, 3);
});

sigilTest("gabelstoss", "greift links und rechts an, nicht geradeaus", () => {
  T("fork", { attack: 1, health: 1, sigils: ["gabelstoss"] });
  const s = setupBattle({ p0: { front: [null, "S_fork"] }, p1: { front: [null, "S_wall"] } });
  endTurn(s);
  assert.equal(s.scale, 2);
  assert.equal(unitAt(s, 1, "front", 1).health, 5);
});

sigilTest("zwillingsbiss", "greift zweimal an", () => {
  T("twin", { attack: 2, health: 1, sigils: ["zwillingsbiss"] });
  const s = setupBattle({ p0: { front: ["S_twin"] } });
  endTurn(s);
  assert.equal(s.scale, 4);
});

sigilTest("todesstachel", "jede getroffene Kreatur stirbt", () => {
  T("sting", { attack: 1, health: 1, sigils: ["todesstachel"] });
  const s = setupBattle({ p0: { front: ["S_sting"] }, p1: { front: ["S_wall"] } });
  endTurn(s);
  assert.equal(unitAt(s, 1, "front", 0), null);
});

sigilTest("wucht", "stößt das Ziel in die freie Hinterreihe", () => {
  T("push", { attack: 1, health: 1, sigils: ["wucht"] });
  const s = setupBattle({ p0: { front: ["S_push"] }, p1: { front: ["S_wall"] } });
  endTurn(s);
  assert.equal(unitAt(s, 1, "front", 0), null);
  assert.equal(unitAt(s, 1, "back", 0).health, 4);
});

sigilTest("aderlass", "stiehlt 1 Angriff pro Treffer", () => {
  T("leech", { attack: 1, health: 3, sigils: ["aderlass"] });
  const s = setupBattle({ p0: { front: ["S_leech"] }, p1: { front: ["S_hit2"] } });
  endTurn(s);
  assert.equal(unitAt(s, 0, "front", 0).attack, 2);
  assert.equal(unitAt(s, 1, "front", 0).attack, 1);
});

sigilTest("durchbohren", "überschüssiger Schaden überspringt die Hinterreihe", () => {
  T("pierce", { attack: 4, health: 1, sigils: ["durchbohren"] });
  const s = setupBattle({ p0: { front: ["S_pierce"] }, p1: { front: ["S_wall1"], back: ["S_wall"] } });
  endTurn(s);
  assert.equal(unitAt(s, 1, "back", 0).health, 5);
  assert.equal(s.scale, 3);
});

sigilTest("hinterhalt", "greift zusätzlich die gegnerische Hinterreihe an", () => {
  T("ambush", { attack: 2, health: 1, sigils: ["hinterhalt"] });
  const s = setupBattle({ p0: { front: ["S_ambush"] }, p1: { back: ["S_wall"] } });
  endTurn(s);
  assert.equal(s.scale, 2);
  assert.equal(unitAt(s, 1, "back", 0).health, 3); // p1 rückt erst am eigenen Zugende nach
});

sigilTest("rudelruf", "+1 Angriff je weiterer eigener Karte desselben Stamms", () => {
  T("pack", { attack: 1, health: 1, sigils: ["rudelruf"], tribe: "bestien" });
  T("beast", { attack: 0, health: 1, tribe: "bestien" });
  const s = setupBattle({ p0: { front: ["S_pack", "S_beast"], back: ["S_beast"] } });
  const r = new Resolver(s);
  assert.equal(r.attackOf(unitAt(s, 0, "front", 0)), 3);
});

sigilTest("rachsucht", "stirbt eine benachbarte eigene Karte: +1 Angriff dauerhaft", () => {
  T("avenger", { attack: 1, health: 5, sigils: ["rachsucht"] });
  const s = setupBattle({ p0: { front: ["S_wall1", "S_avenger"] } });
  act(s, { type: "hammer", zone: "front", lane: 0 });
  assert.equal(unitAt(s, 0, "front", 1).attack, 2);
});

sigilTest("ruestungsbrecher", "ignoriert Schildrinde und Panzer", () => {
  T("breaker", { attack: 2, health: 1, sigils: ["ruestungsbrecher"] });
  T("armored", { attack: 0, health: 5, sigils: ["schildrinde", "panzer"] });
  const s = setupBattle({ p0: { front: ["S_breaker"] }, p1: { front: ["S_armored"] } });
  endTurn(s);
  assert.equal(unitAt(s, 1, "front", 0).health, 3);
});

sigilTest("spiegelbild", "Angriff entspricht dem Angriff der gegenüberliegenden Karte", () => {
  T("mirror", { attack: 0, health: 3, sigils: ["spiegelbild"] });
  const s = setupBattle({ p0: { front: ["S_mirror"] }, p1: { front: ["S_hit3"] } });
  const r = new Resolver(s);
  assert.equal(r.attackOf(unitAt(s, 0, "front", 0)), 3);
});

// ───────── Verteidigung ─────────
sigilTest("dornenkleid", "der Angreifer bekommt 1 Schaden", () => {
  T("thorns", { attack: 0, health: 5, sigils: ["dornenkleid"] });
  const s = setupBattle({ p0: { front: ["S_hit2"] }, p1: { front: ["S_thorns"] } });
  endTurn(s);
  assert.equal(unitAt(s, 0, "front", 0).health, 2);
});

sigilTest("schildrinde", "der erste Treffer im gegnerischen Zug wird aufgehoben", () => {
  T("bark", { attack: 0, health: 3, sigils: ["schildrinde"] });
  T("twin2", { attack: 2, health: 1, sigils: ["zwillingsbiss"] });
  const s = setupBattle({ p0: { front: ["S_twin2"] }, p1: { front: ["S_bark"] } });
  endTurn(s);
  assert.equal(unitAt(s, 1, "front", 0).health, 1);
});

sigilTest("panzer", "Schaden −1, mindestens 1", () => {
  T("plate", { attack: 0, health: 5, sigils: ["panzer"] });
  const s = setupBattle({ p0: { front: ["S_hit3", "S_hit1"] }, p1: { front: ["S_plate", "S_plate"] } });
  endTurn(s);
  assert.equal(unitAt(s, 1, "front", 0).health, 3);
  assert.equal(unitAt(s, 1, "front", 1).health, 4);
});

sigilTest("wiedergaenger", "kehrt beim ersten Tod mit vollen Werten zurück und verliert das Sigil", () => {
  T("undead", { attack: 1, health: 1, sigils: ["wiedergaenger"] });
  const s = setupBattle({ p0: { front: ["S_hit2"] }, p1: { front: ["S_undead"] } });
  endTurn(s);
  const u = unitAt(s, 1, "front", 0);
  assert.equal(u.card.baseId, "S_undead");
  assert.equal(u.health, 1);
  assert.deepEqual(u.sigils, []);
});

sigilTest("leibwaechter", "springt vor eine gegnerische Karte, die gegenüber einer leeren Lane gelegt wird oder nachrückt", () => {
  T("guard", { attack: 0, health: 4, sigils: ["leibwaechter"] });
  const s = setupBattle({ p0: { hand: ["S_hit2"], back: [null, "S_hit2"] }, p1: { front: ["S_guard", null, null, "S_wall"] } });
  act(s, { type: "play", uid: s.players[0].hand[0].uid, zone: "front", lane: 2 });
  assert.equal(unitAt(s, 1, "front", 2).card.baseId, "S_guard");
  assert.equal(unitAt(s, 1, "front", 0), null);
  // Gegenüber einer besetzten Lane bleibt er stehen; ohne Platzierung greift der Angriff direkt
  endTurn(s); // Angriff: Lane 2 trifft den Leibwächter, dann rückt Lane 1 aus der Hinterreihe nach
  assert.equal(s.scale, 0);
  assert.equal(unitAt(s, 1, "front", 1).card.baseId, "S_guard");
});

sigilTest("moosheilung", "+1 Leben am Zugende bis zum Maximum", () => {
  T("moss", { attack: 0, health: 3, sigils: ["moosheilung"] });
  const s = setupBattle({ p0: { front: ["S_moss"] } });
  unitAt(s, 0, "front", 0).health = 1;
  endTurn(s);
  assert.equal(unitAt(s, 0, "front", 0).health, 2);
});

sigilTest("haeutung", "beim tödlichen Treffer bleibt eine Hülle, die Karte flieht auf die Hand", () => {
  T("snake", { attack: 0, health: 1, sigils: ["haeutung"] });
  const s = setupBattle({ p0: { front: ["S_hit2"] }, p1: { front: ["S_snake"] } });
  endTurn(s);
  assert.equal(unitAt(s, 1, "front", 0).card.baseId, "token_huelle");
  assert.ok(s.players[1].hand.some((c) => c.baseId === "S_snake"));
});

sigilTest("koeder", "gegnerische Karten in Nachbarlanes greifen den Köder an", () => {
  T("lure", { attack: 0, health: 5, sigils: ["koeder"] });
  const s = setupBattle({ p0: { front: [null, "S_hit2"] }, p1: { front: ["S_lure", "S_wall"] } });
  endTurn(s);
  assert.equal(unitAt(s, 1, "front", 0).health, 3);
  assert.equal(unitAt(s, 1, "front", 1).health, 5);
});

// ───────── Ressourcen ─────────
sigilTest("knochenmark", "gibt beim Tod 3 Knochen", () => {
  T("marrow", { attack: 0, health: 1, sigils: ["knochenmark"] });
  const s = setupBattle({ p0: { front: ["S_marrow"] } });
  act(s, { type: "hammer", zone: "front", lane: 0 });
  assert.equal(s.players[0].bones, 3);
});

sigilTest("markleicht", "Knochenkäfer: gibt beim Tod 2 Knochen", () => {
  const s = setupBattle({ p0: { front: ["schwaerme_knochenkaefer"] } });
  act(s, { type: "hammer", zone: "front", lane: 0 });
  assert.equal(s.players[0].bones, 2);
});

sigilTest("dreifachblut", "zählt beim Opfern als 3 Blut", () => {
  T("triple", { attack: 0, health: 1, sigils: ["dreifachblut"] });
  T("big", { attack: 5, health: 5, cost: { type: "blood", amount: 3 } });
  const s = setupBattle({ p0: { front: ["S_triple"], hand: ["S_big"] } });
  const res = act(s, { type: "play", uid: s.players[0].hand[0].uid, zone: "front", lane: 0, sacrifices: [{ zone: "front", lane: 0 }] });
  assert.equal(res.error, undefined);
  assert.equal(unitAt(s, 0, "front", 0).card.baseId, "S_big");
});

sigilTest("doppelblut", "Nebendeck-Totem: gezogener Moorling trägt es und zählt beim Opfern als 2 Blut (nicht 3)", () => {
  T("two", { attack: 2, health: 2, cost: { type: "blood", amount: 2 } });
  T("three", { attack: 3, health: 3, cost: { type: "blood", amount: 3 } });
  const totems = { side: { head: { kind: "side" }, base: { kind: "sigil", sigil: "doppelblut" } } };
  const s = setupBattle({ p0: { hand: ["S_two", "S_three"], totems } });
  s.players[0].drew = false;
  act(s, { type: "draw", pile: "side" });
  const moor = s.players[0].hand.find((c) => c.baseId === "side_moorling");
  assert.deepEqual(moor.sigils, ["doppelblut"]);
  act(s, { type: "play", uid: moor.uid, zone: "front", lane: 0 });
  const three = s.players[0].hand.find((c) => c.baseId === "S_three");
  assert.equal(act(s, { type: "play", uid: three.uid, zone: "front", lane: 0, sacrifices: [{ zone: "front", lane: 0 }] }).error, "notEnoughBlood");
  const two = s.players[0].hand.find((c) => c.baseId === "S_two");
  assert.equal(act(s, { type: "play", uid: two.uid, zone: "front", lane: 0, sacrifices: [{ zone: "front", lane: 0 }] }).error, undefined);
  assert.equal(unitAt(s, 0, "front", 0).card.baseId, "S_two");
  assert.equal(s.players[0].bones, 1); // Opfer gibt nur Knochen
});

sigilTest("ewigesopfer", "kann geopfert werden, ohne zu sterben", () => {
  T("cat", { attack: 0, health: 1, sigils: ["ewigesopfer"] });
  T("one", { attack: 1, health: 1, cost: { type: "blood", amount: 1 } });
  const s = setupBattle({ p0: { front: ["S_cat"], hand: ["S_one"] } });
  act(s, { type: "play", uid: s.players[0].hand[0].uid, zone: "front", lane: 1, sacrifices: [{ zone: "front", lane: 0 }] });
  assert.equal(unitAt(s, 0, "front", 0).card.baseId, "S_cat");
  assert.equal(unitAt(s, 0, "front", 1).card.baseId, "S_one");
  assert.equal(s.players[0].bones, 0);
});

sigilTest("aschenspende", "beim Opfern +2 Knochen (zusätzlich zum Tod)", () => {
  T("ash", { attack: 0, health: 1, sigils: ["aschenspende"] });
  const s = setupBattle({ p0: { front: ["S_ash"], hand: ["S_one"] } });
  act(s, { type: "play", uid: s.players[0].hand[0].uid, zone: "front", lane: 0, sacrifices: [{ zone: "front", lane: 0 }] });
  assert.equal(s.players[0].bones, 3);
});

sigilTest("wachsgabe", "Wachsling: beim Opfern +1 Wachs", () => {
  const s = setupBattle({ p0: { front: ["kerzenwesen_wachsling"], hand: ["S_one"], wax: 0 } });
  act(s, { type: "play", uid: s.players[0].hand[0].uid, zone: "front", lane: 0, sacrifices: [{ zone: "front", lane: 0 }] });
  assert.equal(s.players[0].wax, 1);
});

sigilTest("wachsquelle", "zu Zugbeginn +1 Wachs zusätzlich", () => {
  T("wick", { attack: 0, health: 1, sigils: ["wachsquelle"] });
  const s = setupBattle({ p1: { front: ["S_wick"], wax: 0 } });
  endTurn(s);
  assert.equal(s.players[1].wax, 2);
});

sigilTest("blutschuld", "beim Ausspielen 2 Karten ziehen, der Gegner bekommt 1 Gewicht", () => {
  T("debt", { attack: 1, health: 1, sigils: ["blutschuld"] });
  const s = setupBattle({ p0: { hand: ["S_debt"], deck: ["S_wall", "S_wall", "S_wall"] } });
  act(s, { type: "play", uid: s.players[0].hand[0].uid, zone: "front", lane: 0 });
  assert.equal(s.players[0].hand.length, 2);
  assert.equal(s.scale, -1);
});

// ───────── Spielfeld & Verwandlung ─────────
sigilTest("brut", "beim Ausspielen 0/1-Brutlinge in freien Nachbarlanes", () => {
  T("brood", { attack: 1, health: 1, sigils: ["brut"], tribe: "myzel" });
  const s = setupBattle({ p0: { hand: ["S_brood"], front: [null, null, "S_wall"] } });
  act(s, { type: "play", uid: s.players[0].hand[0].uid, zone: "front", lane: 1 });
  assert.equal(unitAt(s, 0, "front", 0).card.baseId, "token_brut_myzel");
  assert.equal(unitAt(s, 0, "front", 2).card.baseId, "S_wall");
});

sigilTest("metamorphose", "verwandelt sich nach 2 eigenen Zügen", () => {
  T("egg", { attack: 0, health: 1, sigils: ["metamorphose"], evolvesTo: "S_evolved" });
  const s = setupBattle({ p0: { front: ["S_egg"] } });
  endTurn(s);
  s.players[1].drew = true;
  endTurn(s);
  assert.equal(unitAt(s, 0, "front", 0).card.baseId, "S_egg");
  s.players[0].drew = true;
  endTurn(s);
  assert.equal(unitAt(s, 0, "front", 0).card.baseId, "S_evolved");
});

sigilTest("nachgeburt", "beim Tod erscheint die Folgekarte im selben Slot", () => {
  T("pod", { attack: 0, health: 1, sigils: ["nachgeburt"], evolvesTo: "S_evolved" });
  const s = setupBattle({ p0: { front: ["S_pod"] } });
  act(s, { type: "hammer", zone: "front", lane: 0 });
  assert.equal(unitAt(s, 0, "front", 0).card.baseId, "S_evolved");
});

sigilTest("kundschafter", "beim Ausspielen 1 Karte ziehen", () => {
  T("scout", { attack: 0, health: 1, sigils: ["kundschafter"] });
  const s = setupBattle({ p0: { hand: ["S_scout"], deck: ["S_wall"] } });
  act(s, { type: "play", uid: s.players[0].hand[0].uid, zone: "front", lane: 0 });
  assert.equal(s.players[0].hand[0].baseId, "S_wall");
});

sigilTest("seher", "beim Ausspielen die obersten 3 Karten neu ordnen", () => {
  T("seer", { attack: 0, health: 1, sigils: ["seher"] });
  const s = setupBattle({ p0: { hand: ["S_seer"], deck: ["S_wall", "S_hit1", "S_hit2", "S_hit3"] } });
  act(s, { type: "play", uid: s.players[0].hand[0].uid, zone: "front", lane: 0 });
  assert.equal(s.pending[0].kind, "seer");
  assert.equal(act(s, { type: "endTurn" }).error, "mustOrder");
  assert.equal(act(s, { type: "seer", order: [2, 0, 1] }).error, undefined);
  const top3 = s.players[0].deck.slice(-3).reverse().map((c) => c.baseId);
  assert.deepEqual(top3, ["S_hit2", "S_wall", "S_hit1"]);
});

sigilTest("faeulnis", "die gegenüberliegende Karte verliert am Zugende 1 Leben", () => {
  T("rot", { attack: 0, health: 1, sigils: ["faeulnis"] });
  const s = setupBattle({ p0: { front: ["S_rot"] }, p1: { front: ["S_wall"] } });
  endTurn(s);
  assert.equal(unitAt(s, 1, "front", 0).health, 4);
});

sigilTest("stinkdruese", "die gegenüberliegende Karte hat −1 Angriff", () => {
  T("stink", { attack: 0, health: 3, sigils: ["stinkdruese"] });
  const s = setupBattle({ p0: { front: ["S_stink"] }, p1: { front: ["S_hit2"] } });
  assert.equal(new Resolver(s).attackOf(unitAt(s, 1, "front", 0)), 1);
});

sigilTest("leittier", "benachbarte eigene Karten haben +1 Angriff", () => {
  T("leader", { attack: 0, health: 3, sigils: ["leittier"] });
  const s = setupBattle({ p0: { front: ["S_hit1", "S_leader", "S_hit1", "S_hit1"] } });
  const r = new Resolver(s);
  assert.equal(r.attackOf(unitAt(s, 0, "front", 0)), 2);
  assert.equal(r.attackOf(unitAt(s, 0, "front", 2)), 2);
  assert.equal(r.attackOf(unitAt(s, 0, "front", 3)), 1);
});

sigilTest("nesthueter", "beim ersten Tod kommt eine Kopie ohne das Sigil auf die Hand", () => {
  T("nest", { attack: 0, health: 1, sigils: ["nesthueter"] });
  const s = setupBattle({ p0: { front: ["S_nest"] } });
  act(s, { type: "hammer", zone: "front", lane: 0 });
  assert.equal(s.players[0].hand.length, 1);
  assert.deepEqual(s.players[0].hand[0].sigils, []);
});

sigilTest("kerzendocht", "stirbt nach X eigenen Zugenden", () => {
  T("candle", { attack: 0, health: 3, sigils: ["kerzendocht:2"] });
  const s = setupBattle({ p0: { front: ["S_candle"] } });
  endTurn(s);
  assert.equal(unitAt(s, 0, "front", 0).wick, 1);
  s.players[1].drew = true;
  endTurn(s);
  s.players[0].drew = true;
  endTurn(s);
  assert.equal(unitAt(s, 0, "front", 0), null);
});

sigilTest("hunger", "frisst eine benachbarte eigene Karte, sonst −1 Leben", () => {
  T("hungry", { attack: 1, health: 2, sigils: ["hunger"] });
  const s = setupBattle({ p0: { back: ["S_hungry", "S_hit1"] } });
  endTurn(s);
  // Hinterreihe rückt danach vor; gefressen wurde vorher
  const u = unitAt(s, 0, "front", 0);
  assert.equal(u.attack, 2);
  assert.equal(u.health, 7);
  const t = setupBattle({ p0: { front: ["S_hungry"] } });
  endTurn(t);
  assert.equal(unitAt(t, 0, "front", 0).health, 1);
});

sigilTest("glockenschlag", "beim Ausspielen rücken alle Hinterreihen sofort vor", () => {
  T("bell", { attack: 0, health: 1, sigils: ["glockenschlag"] });
  const s = setupBattle({ p0: { hand: ["S_bell"], back: [null, "S_wall"] }, p1: { back: [null, null, "S_wall"] } });
  act(s, { type: "play", uid: s.players[0].hand[0].uid, zone: "front", lane: 0 });
  assert.ok(unitAt(s, 0, "front", 1));
  assert.ok(unitAt(s, 1, "front", 2));
});

sigilTest("fluchmal", "der Besitzer bekommt am Zugende 1 Gewicht gegen sich", () => {
  T("curse", { attack: 0, health: 1, sigils: ["fluchmal"] });
  const s = setupBattle({ p0: { front: ["S_curse"] } });
  endTurn(s);
  assert.equal(s.scale, -1);
});

// ───────── Totems & Lanen-Eigenschaften ─────────
test("Totem: Stammkopf gibt allen Karten des Stamms die Basis-Sigil", () => {
  T("beast2", { attack: 1, health: 1, tribe: "bestien" });
  const totems = { tribe: { head: { kind: "tribe", tribe: "bestien" }, base: { kind: "sigil", sigil: "schwinge" } }, lane: null };
  const s = setupBattle({ p0: { front: ["S_beast2"], totems }, p1: { front: ["S_wall"] } });
  endTurn(s);
  assert.equal(s.scale, 1);
});

test("Totem: Lanenkopf mit Eigenschaft 'heilig' — +2 Leben, nicht opferbar", () => {
  const totems = { tribe: null, lane: { head: { kind: "lane", lane: 0 }, base: { kind: "prop", prop: "heilig" } } };
  const s = setupBattle({ p0: { hand: ["S_wall1", "S_one"], totems } });
  act(s, { type: "play", uid: s.players[0].hand[0].uid, zone: "front", lane: 0 });
  assert.equal(unitAt(s, 0, "front", 0).health, 3);
  const res = act(s, { type: "play", uid: s.players[0].hand[0].uid, zone: "front", lane: 1, sacrifices: [{ zone: "front", lane: 0 }] });
  assert.equal(res.error, "sacredLane");
});

test("Totem: Lanen-Eigenschaft 'doppelknochen' verdoppelt Knochen", () => {
  const totems = { tribe: null, lane: { head: { kind: "lane", lane: 0 }, base: { kind: "prop", prop: "doppelknochen" } } };
  const s = setupBattle({ p0: { front: ["S_wall1"], totems } });
  act(s, { type: "hammer", zone: "front", lane: 0 });
  assert.equal(s.players[0].bones, 2);
});

test("Verschmelzen: doppelte Sigils werden zur verstärkten Stufe (max. 4 Sigils)", () => {
  assert.deepEqual(mergeSigils(["dornenkleid"], ["dornenkleid"]), ["dornenkleid:2"]);
  assert.deepEqual(mergeSigils(["schwinge", "panzer", "brut", "seher"], ["hunger"]), ["schwinge", "panzer", "brut", "seher"]);
  assert.deepEqual(mergeSigils(["kerzendocht:2"], ["kerzendocht:4"]), ["kerzendocht:4"]);
});

test("Ketten-Budget verhindert Endlosschleifen", () => {
  // Zwei Einheiten mit Dornenkleid:3 und hoher Moosheilung würden nie enden; hier reicht, dass eine Aktion endet
  T("loop", { attack: 1, health: 99, sigils: ["dornenkleid:3", "zwillingsbiss", "dreizack"] });
  const s = setupBattle({ p0: { front: ["S_loop", "S_loop", "S_loop", "S_loop"] }, p1: { front: ["S_loop", "S_loop", "S_loop", "S_loop"] } });
  endTurn(s);
  assert.ok(true);
});

// ───────── Gezeiten-Zirkel ─────────
// Wasserstand: 0 Ebbe, 1 steigend, 2 Flut, 3 fallend (Hochwasser = 1/2). `tide` gilt für den aktuellen Zug (3).
const G = (/** @type {any} */ spec) => setupBattle({ zirkel: "gezeiten", ...spec });

sigilTest("wattlaeufer", "läuft bei Niedrigwasser zu Zugbeginn vom Blocker weg in eine freie Lane ohne Gegner", () => {
  T("walker", { attack: 0, health: 2, sigils: ["wattlaeufer"] });
  const s = G({ tide: 3, p0: { front: [null, "S_walker"] }, p1: { front: [null, "S_wall", null, "S_wall"] } });
  endTurn(s);
  endTurn(s); // Zug 5: Ebbe, Zugbeginn von Spieler 0
  assert.equal(unitAt(s, 0, "front", 0)?.card.baseId, "S_walker");
  const hi = G({ tide: 1, p0: { front: [null, "S_walker"] }, p1: { front: [null, "S_wall"] } });
  endTurn(hi);
  endTurn(hi); // Zug 5: Flut – bleibt stehen
  assert.equal(unitAt(hi, 0, "front", 1)?.card.baseId, "S_walker");
});

sigilTest("anker", "lässt sich nicht wegziehen und rückt auch bei Flut nach", () => {
  T("sogger", { attack: 0, health: 3, sigils: ["sog"] });
  T("anchor", { attack: 0, health: 3, sigils: ["anker"] });
  const s = G({ tide: 2, p0: { front: ["S_sogger"] }, p1: { front: ["S_anchor"], back: [null, "S_anchor", "S_wall"] } });
  endTurn(s);
  assert.equal(unitAt(s, 1, "front", 0)?.card.baseId, "S_anchor");
  endTurn(s); // Spieler 1, noch Flut: der Anker rückt nach, die normale Karte nicht
  assert.equal(unitAt(s, 1, "front", 1)?.card.baseId, "S_anchor");
  assert.equal(unitAt(s, 1, "back", 2)?.card.baseId, "S_wall");
});

sigilTest("sog", "zieht die gegnerische Frontkarte gegenüber in ihre Uferreihe", () => {
  T("sogger", { attack: 0, health: 3, sigils: ["sog"] });
  const s = G({ p0: { front: ["S_sogger"] }, p1: { front: ["S_hit2"] } });
  endTurn(s);
  assert.equal(unitAt(s, 1, "front", 0), null);
  assert.equal(unitAt(s, 1, "back", 0)?.card.baseId, "S_hit2");
});

sigilTest("brandung", "+2 Angriff bei Hochwasser, sonst nicht", () => {
  T("surf", { attack: 1, health: 2, sigils: ["brandung"] });
  const hi = G({ tide: 1, p0: { front: ["S_surf"] } });
  endTurn(hi);
  assert.equal(hi.scale, 3);
  const lo = G({ tide: 3, p0: { front: ["S_surf"] } });
  endTurn(lo);
  assert.equal(lo.scale, 1);
});

sigilTest("flutwelle", "beim Ausspielen bei Hochwasser 1 Schaden an allen gegnerischen Frontkarten (nicht an abgetauchten)", () => {
  T("wave", { attack: 0, health: 1, sigils: ["flutwelle"] });
  const s = G({ tide: 2, p0: { hand: ["S_wave"] }, p1: { front: ["S_wall", "S_wall"], back: ["S_wall"] } });
  unitAt(s, 1, "front", 1).submerged = true;
  act(s, { type: "play", uid: s.players[0].hand[0].uid, zone: "front", lane: 3 });
  assert.equal(unitAt(s, 1, "front", 0).health, 4);
  assert.equal(unitAt(s, 1, "front", 1).health, 5);
  assert.equal(unitAt(s, 1, "back", 0).health, 5);
});

sigilTest("schlick", "getroffene Karte klebt fest und kann nicht abtauchen", () => {
  T("mud", { attack: 1, health: 3, sigils: ["schlick"] });
  T("diver5", { attack: 0, health: 5, sigils: ["tauchgang"] });
  const s = G({ p0: { front: ["S_mud"] }, p1: { front: ["S_diver5"] } });
  endTurn(s);
  assert.equal(unitAt(s, 1, "front", 0).glued, 2);
  endTurn(s);
  assert.equal(unitAt(s, 1, "front", 0).submerged, false);
});

sigilTest("gezeitenschild", "hebt bei Hochwasser den ersten Treffer auf, bei Niedrigwasser nicht", () => {
  T("tshield", { attack: 0, health: 3, sigils: ["gezeitenschild"] });
  const hi = G({ tide: 1, p0: { front: ["S_hit2"] }, p1: { front: ["S_tshield"] } });
  endTurn(hi);
  assert.equal(unitAt(hi, 1, "front", 0).health, 3);
  const lo = G({ tide: 0, p0: { front: ["S_hit2"] }, p1: { front: ["S_tshield"] } });
  endTurn(lo);
  assert.equal(unitAt(lo, 1, "front", 0).health, 1);
});

sigilTest("salzkruste", "nimmt höchstens 2 Schaden pro Treffer", () => {
  T("big5", { attack: 5, health: 5 });
  T("crust", { attack: 0, health: 4, sigils: ["salzkruste"] });
  const s = G({ p0: { front: ["S_big5"] }, p1: { front: ["S_crust"] } });
  endTurn(s);
  assert.equal(unitAt(s, 1, "front", 0).health, 2);
  assert.equal(s.scale, 0);
});

sigilTest("tintenwolke", "der Angreifer greift im nächsten eigenen Zug nicht an", () => {
  T("ink", { attack: 0, health: 9, sigils: ["tintenwolke"] });
  const s = G({ p0: { front: ["S_hit2"] }, p1: { front: ["S_ink"] } });
  endTurn(s);
  assert.equal(unitAt(s, 0, "front", 0).stunned, true);
  endTurn(s);
  endTurn(s);
  assert.equal(unitAt(s, 1, "front", 0).health, 7); // nur der erste Treffer
});

sigilTest("heimkehr", "stirbt die Karte, kommt sie mit der nächsten Flut auf die Hand zurück", () => {
  T("ghost", { attack: 0, health: 1, sigils: ["heimkehr"] });
  const s = G({ tide: 1, p0: { front: ["S_hit3"] }, p1: { front: ["S_ghost"] } });
  endTurn(s);
  assert.equal(unitAt(s, 1, "front", 0), null);
  assert.equal(s.players[1].returning.length, 1);
  endTurn(s); // Zug 5: die Flut kommt
  assert.ok(s.players[1].hand.some((c) => c.baseId === "S_ghost"));
  assert.equal(s.players[1].returning.length, 0);
});

sigilTest("muschelgrab", "hinterlässt eine leere Muschel an ihrem Platz", () => {
  T("clam", { attack: 0, health: 1, sigils: ["muschelgrab"] });
  const s = G({ p0: { front: ["S_hit3"] }, p1: { front: ["S_clam"] } });
  endTurn(s);
  assert.equal(unitAt(s, 1, "front", 0)?.card.baseId, "token_muschel");
});

sigilTest("salzader", "+1 Salz zu Beginn jedes eigenen Zugs", () => {
  T("vein", { attack: 0, health: 1, sigils: ["salzader"] });
  const s = G({ p0: { front: ["S_vein"] } });
  endTurn(s);
  endTurn(s);
  assert.equal(s.players[0].salt, 1);
});

sigilTest("salzgabe", "beim Opfern +1 Salz", () => {
  T("drift", { attack: 0, health: 1, sigils: ["salzgabe"] });
  T("one1", { attack: 1, health: 1, cost: { type: "blood", amount: 1 } });
  const s = G({ p0: { front: ["S_drift"], hand: ["S_one1"] } });
  act(s, { type: "play", uid: s.players[0].hand[0].uid, zone: "front", lane: 0, sacrifices: [{ zone: "front", lane: 0 }] });
  assert.equal(s.players[0].salt, 1);
});

sigilTest("perle", "stirbt die Karte, gibt es 2 Salz", () => {
  T("pearl", { attack: 0, health: 1, sigils: ["perle"] });
  const s = G({ p0: { front: ["S_pearl"] } });
  act(s, { type: "hammer", zone: "front", lane: 0 });
  assert.equal(s.players[0].salt, 2);
});

sigilTest("strandgut", "stirbt die Karte, kommt eine Nebendeck-Karte auf die Hand", () => {
  T("flot", { attack: 0, health: 1, sigils: ["strandgut"] });
  const s = G({ p0: { front: ["S_flot"] } });
  act(s, { type: "hammer", zone: "front", lane: 0 });
  assert.ok(s.players[0].hand.some((c) => c.baseId === "side_strandkrabbe"));
});

sigilTest("leuchtfeuer", "gegnerische Karten können nicht abtauchen; beim Ausspielen tauchen sie auf", () => {
  T("beacon", { attack: 0, health: 2, sigils: ["leuchtfeuer"] });
  T("diver3", { attack: 0, health: 3, sigils: ["tauchgang"] });
  const s = G({ p0: { front: ["S_diver3"] }, p1: { front: [null, "S_beacon"] } });
  endTurn(s);
  assert.equal(unitAt(s, 0, "front", 0).submerged, false);
  const t = G({ p0: { hand: ["S_beacon"] }, p1: { front: ["S_diver3"] } });
  unitAt(t, 1, "front", 0).submerged = true;
  act(t, { type: "play", uid: t.players[0].hand[0].uid, zone: "front", lane: 2 });
  assert.equal(unitAt(t, 1, "front", 0).submerged, false);
});

sigilTest("treibgut", "wird fortgespült, sobald die Flut kommt", () => {
  T("driftwood", { attack: 0, health: 3, sigils: ["treibgut"] });
  const s = G({ tide: 1, p0: { front: ["S_driftwood"] }, p1: { back: ["S_driftwood"] } });
  endTurn(s);
  assert.ok(unitAt(s, 0, "front", 0));
  endTurn(s); // Zug 5: Flut
  assert.equal(unitAt(s, 0, "front", 0), null);
  assert.equal(unitAt(s, 1, "back", 0), null);
});

sigilTest("flaschenpost", "beim Ausspielen 1 Karte, bei Hochwasser 2", () => {
  T("post", { attack: 0, health: 1, sigils: ["flaschenpost"] });
  const lo = G({ tide: 0, p0: { hand: ["S_post"], deck: ["S_wall", "S_wall", "S_wall"] } });
  act(lo, { type: "play", uid: lo.players[0].hand[0].uid, zone: "front", lane: 0 });
  assert.equal(lo.players[0].hand.length, 1);
  const hi = G({ tide: 2, p0: { hand: ["S_post"], deck: ["S_wall", "S_wall", "S_wall"] } });
  act(hi, { type: "play", uid: hi.players[0].hand[0].uid, zone: "front", lane: 0 });
  assert.equal(hi.players[0].hand.length, 2);
});

sigilTest("mondzug", "beim Ausspielen springen die Gezeiten eine Phase weiter", () => {
  T("moon", { attack: 0, health: 1, sigils: ["mondzug"] });
  const s = G({ tide: 1, p0: { hand: ["S_moon"] }, p1: { back: [null, "S_hit2"] } });
  act(s, { type: "play", uid: s.players[0].hand[0].uid, zone: "front", lane: 0 });
  assert.equal(s.tide, 2);
  endTurn(s);
  endTurn(s); // Spieler 1 rückt bei Flut nicht nach
  assert.equal(unitAt(s, 1, "back", 1)?.card.baseId, "S_hit2");
});

test("Jedes öffentliche Sigil ist getestet", () => {
  const missing = PUBLIC_SIGILS.filter((id) => !tested.has(id));
  assert.deepEqual(missing, []);
  assert.ok(PUBLIC_SIGILS.length >= 45, `nur ${PUBLIC_SIGILS.length} Sigils`);
  assert.ok(Object.keys(SIGILS).length >= 47);
});
