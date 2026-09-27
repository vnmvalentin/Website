// Match-Ebene: Draft, Extras, Pfad-Knoten, Modifikatoren, Best-of, Determinismus, Fuzz, versteckte Information, Daten.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createMatch, applyAction, awaiting, deepClone, normalizeSettings, START_SHARDS } from "../engine/match.js";
import { aiAction } from "../engine/ai/index.js";
import { roundOrder, generatePool, pickable, PICKS_PER_PLAYER, DRAFT_ROUNDS, ROUND_SIZE } from "../engine/draft.js";
import { generateMap } from "../engine/path.js";
import { resolveCard, CARDS, COLLECTIBLE } from "../engine/cards.js";
import { viewFor, eventsFor } from "../engine/view.js";
import { validateCards } from "../engine/validate.js";
import { de } from "../i18n/de.js";
import { SIGILS } from "../engine/sigils/index.js";
import { ITEMS } from "../data/items.js";
import { EVENTS } from "../data/events.js";
import { AURA_SIGILS } from "../engine/sigils/index.js";
import { TOTEM_BASE_SIGILS, LANE_PROPS } from "../data/totems.js";

/** Match mit KI bis zu einer Phase vorspulen. */
function playUntil(state, predicate, level = "normal", seed = 1) {
  const rng = { rng: seed };
  let s = state;
  let guard = 0;
  while (!predicate(s) && s.phase !== "over" && guard++ < 5000) {
    const p = awaiting(s)[0];
    const a = aiAction(s, p, level, rng);
    const res = applyAction(s, a);
    s = res.error ? applyAction(s, { type: "timeout", player: p }).state : res.state;
  }
  return s;
}

const act = (s, a) => {
  const r = applyAction(s, a);
  if (r.error) throw new Error(`${a.type}: ${r.error}`);
  return r.state;
};

// ───────── Daten ─────────
test("Kartendaten sind gültig (Sigils, Folgeformen, Kosten, Anzahl)", () => {
  const { errors, stats } = validateCards();
  assert.deepEqual(errors, []);
  assert.ok(stats.collectible >= 160);
  assert.equal(Object.keys(stats.byTribe).length, 14);
});

test("Alle Sigils, Items, Ereignisse, Stämme und Lanen-Eigenschaften haben deutsche Texte", () => {
  for (const id of Object.keys(SIGILS)) assert.ok(de.sigils[id]?.name && de.sigils[id]?.desc, `Sigil ${id}`);
  for (const it of ITEMS) assert.ok(de.items[it.id]?.name, `Item ${it.id}`);
  for (const e of EVENTS) assert.ok(de.events[e]?.name, `Ereignis ${e}`);
  for (const p of LANE_PROPS) assert.ok(de.totems.props[p]?.name, `Eigenschaft ${p}`);
  assert.equal(ITEMS.length, 12);
  assert.ok(EVENTS.length >= 8);
  assert.ok(TOTEM_BASE_SIGILS.length >= 15);
  assert.ok(LANE_PROPS.length >= 6);
  for (const s of TOTEM_BASE_SIGILS) assert.ok(AURA_SIGILS.includes(s), `Totem-Basis ${s} ist keine Aura`);
});

// ───────── Draft ─────────
test("Pool: 24 Karten in 6 Runden à 4, feste Seltenheiten, 3–5 Duplikate nie in derselben Runde; deterministisch", () => {
  const a = generatePool("ASCHE");
  assert.deepEqual(a, generatePool("ASCHE"));
  assert.equal(a.heads.length, 4);
  assert.deepEqual(a.sides, ["moorling", "knochenkaefer", "wachsling"]);
  for (let i = 0; i < 300; i++) {
    const { cards } = generatePool(`POOL${i}`);
    assert.equal(cards.length, DRAFT_ROUNDS * ROUND_SIZE);
    const r = {};
    for (const c of cards) r[CARDS[c.baseId].rarity] = (r[CARDS[c.baseId].rarity] || 0) + 1;
    assert.deepEqual(r, { common: 14, uncommon: 6, rare: 3, legendary: 1 });
    const count = new Map();
    for (const c of cards) count.set(c.baseId, (count.get(c.baseId) || 0) + 1);
    const dupes = [...count].filter(([, n]) => n > 1);
    assert.ok(dupes.length >= 3 && dupes.length <= 5, `Seed POOL${i}: ${dupes.length} Duplikate`);
    for (const [id, n] of dupes) {
      assert.equal(n, 2);
      assert.ok(["common", "uncommon"].includes(CARDS[id].rarity));
    }
    for (let round = 0; round < DRAFT_ROUNDS; round++) {
      const ids = cards.slice(round * ROUND_SIZE, (round + 1) * ROUND_SIZE).map((c) => c.baseId);
      assert.equal(new Set(ids).size, ROUND_SIZE, `Seed POOL${i}: Duplikat in Runde ${round + 1}`);
    }
  }
});

test("Runden-Draft: A-B-A-B, erster Pick wechselt jede Runde, beide bekommen 12 Karten", () => {
  const o = roundOrder(1);
  assert.equal(o.length, 24);
  assert.deepEqual(o.slice(0, 8), [1, 0, 1, 0, 0, 1, 0, 1]);
  assert.equal(o.filter((x) => x === 0).length, PICKS_PER_PLAYER);
});

test("Gemeinsamer Draft: falscher Spieler darf nicht wählen, genommene Karten sind weg, nur die aktuelle Runde liegt offen", () => {
  let s = createMatch({ seed: "DRAFT", settings: { draftMode: "shared" } });
  const first = s.draft.first;
  const [p1, p2, p3, p4] = s.draft.pool.slice(0, 4).sort((x, y) => Number(CARDS[x.baseId].unique) - Number(CARDS[y.baseId].unique)).map((c) => c.pid);
  assert.equal(applyAction(s, { type: "draftPick", player: 1 - first, pid: p1 }).error, "notYourPick");
  assert.equal(applyAction(s, { type: "draftPick", player: first, pid: s.draft.pool[4].pid }).error, "notOffered");
  s = act(s, { type: "draftPick", player: first, pid: p1 });
  assert.equal(applyAction(s, { type: "draftPick", player: 1 - first, pid: p1 }).error, "alreadyTaken");
  s = act(s, { type: "draftPick", player: 1 - first, pid: p2 });
  s = act(s, { type: "draftPick", player: first, pid: p3 });
  s = act(s, { type: "draftPick", player: 1 - first, pid: p4 });
  // Runde 2: der andere beginnt
  assert.equal(awaiting(s)[0], 1 - first);
  assert.deepEqual(pickable(s.draft, 1 - first, s.legends), s.draft.pool.slice(4, 8).map((c) => c.pid));
});

test("Getrennte Pools: je Runde 4 Karten, 2 nehmen, gleichzeitig; Legendäre ist nach dem ersten Griff gesperrt", () => {
  let s = createMatch({ seed: "SPLIT", settings: { draftMode: "separate" } });
  assert.equal(s.draft.offers[0].length, 4);
  assert.equal(s.draft.offers[1].length, 4);
  assert.notDeepEqual(s.draft.offers[0], s.draft.offers[1]);
  assert.deepEqual(awaiting(s), [0, 1]);
  const round1 = [...s.draft.offers[0]];
  s = act(s, { type: "draftPick", player: 0, pid: round1[0] });
  assert.deepEqual(s.draft.offers[0], round1.slice(1));
  s = act(s, { type: "draftPick", player: 0, pid: round1[1] });
  assert.equal(s.draft.offers[0].filter((pid) => round1.includes(pid)).length, 0); // neue Runde
  const legend = s.draft.pool.find((c) => CARDS[c.baseId].rarity === "legendary");
  let guard = 0;
  while (!s.draft.offers[0].includes(legend.pid) && guard++ < 30) s = act(s, { type: "draftPick", player: 0, pid: s.draft.offers[0][0] });
  if (s.draft.offers[0].includes(legend.pid)) {
    s = act(s, { type: "draftPick", player: 0, pid: legend.pid });
    assert.equal(s.legends[legend.baseId], 0);
    guard = 0;
    while (s.draft.picks[1].length < PICKS_PER_PLAYER && guard++ < 30) {
      assert.ok(!s.draft.offers[1].includes(legend.pid));
      s = act(s, { type: "draftPick", player: 1, pid: s.draft.offers[1][0] });
    }
  }
});

test("Nach dem Draft (gemeinsam): Kopf und Nebendeck abwechselnd und exklusiv, dann Pfad mit 3 Splittern, dann Kampf 1", () => {
  let s = playUntil(createMatch({ seed: "EXTRA" }), (x) => x.phase === "extras");
  assert.equal(s.phase, "extras");
  const A = s.draft.first;
  const B = 1 - A;
  assert.deepEqual(awaiting(s), [A]);
  assert.equal(applyAction(s, { type: "draftExtras", player: B, head: 0 }).error, "notYourPick");
  s = act(s, { type: "draftExtras", player: A, head: 1 });
  assert.equal(applyAction(s, { type: "draftExtras", player: B, head: 1 }).error, "headTaken");
  s = act(s, { type: "draftExtras", player: B, head: 0 });
  assert.deepEqual(awaiting(s), [B]); // Nebendeck: jetzt wählt B zuerst
  s = act(s, { type: "draftExtras", player: B, side: "knochenkaefer" });
  assert.equal(applyAction(s, { type: "draftExtras", player: A, side: "knochenkaefer" }).error, "sideTaken");
  s = act(s, { type: "draftExtras", player: A, side: "wachsling" });
  assert.equal(s.phase, "path");
  assert.equal(s.battleNo, 0);
  assert.deepEqual(s.players.map((P) => P.shards), [START_SHARDS, START_SHARDS]);
  assert.equal(s.players[A].sideType, "wachsling");
  assert.ok(s.players[A].totems.tribe || s.players[A].totems.lane);
  for (let i = 0; i < 20 && s.phase === "path"; i++) for (const p of awaiting(s)) s = act(s, { type: "timeout", player: p });
  assert.equal(s.phase, "battle"); // kein Zwischenspiel vor Kampf 1
  assert.equal(s.battle.starter, B);
  assert.ok(s.players[0].deck.length >= 8);
});

test("Nach dem Draft (getrennt): Kopf und Nebendeck gleichzeitig", () => {
  let s = playUntil(createMatch({ seed: "EXTRA2", settings: { draftMode: "separate" } }), (x) => x.phase === "extras");
  assert.deepEqual(awaiting(s), [0, 1]);
  s = act(s, { type: "draftExtras", player: 1, head: 2, side: "moorling" });
  s = act(s, { type: "draftExtras", player: 0, head: 2, side: "moorling" });
  assert.equal(s.phase, "path");
});

// ───────── Modifikatoren ─────────
test("Modifikatoren: Lagerfeuer, Verschmelzung, Sigil-Transfer, Kosten, Fluch", () => {
  const c = resolveCard("bestien_aschwolf", [
    { kind: "campfire", attack: 1 },
    { kind: "fuse", attack: 3, health: 2, sigils: ["rudelruf"] },
    { kind: "sigilAdd", sigil: "schwinge" },
    { kind: "cost", delta: -1 },
    { kind: "dread" },
  ]);
  assert.equal(c.attack, 3 + 1 + 3);
  assert.equal(c.health, 4);
  assert.deepEqual(c.sigils, ["rudelruf:2", "schwinge"]);
  assert.equal(c.cost.amount, 1);
  assert.equal(c.cursed, true);
  assert.equal(c.dread, 1);
});

// ───────── Pfad ─────────
test("Moorkarte: gleich für beide, 3 Stränge, Ebenen nach Einstellung", () => {
  const a = generateMap("PFAD", 1, 4);
  assert.deepEqual(a, generateMap("PFAD", 1, 4));
  assert.equal(a.nodes.length, 4);
  for (const row of a.nodes) assert.equal(row.length, 3);
});

/** Match direkt in eine Szene versetzen. */
function inScene(node, deck = null) {
  let s = playUntil(createMatch({ seed: "SCENE", settings: { pathLength: 2 } }), (x) => x.phase === "path");
  s = deepClone(s);
  s.path.map.nodes[0][0] = node;
  if (deck) s.players[0].deck = deck.map((baseId, i) => ({ uid: `x${i}`, baseId, mods: [] }));
  return act(s, { type: "chooseNode", player: 0, strand: 0 });
}

const deckOf = (n, id = "bestien_aschwolf") => Array.from({ length: n }, () => id);

test("Knoten Kartenwahl: 1 aus 3 kommt ins Deck", () => {
  let s = inScene({ type: "cardChoice", variant: "normal" }, deckOf(10));
  const offered = s.path.players[0].scene.offers[1];
  s = act(s, { type: "nodeAction", player: 0, op: "pick", index: 1 });
  assert.equal(s.players[0].deck.length, 11);
  assert.equal(s.players[0].deck[10].baseId, offered);
});

test("Knoten Kartenwahl verdeckt: Angebote sind in der Sicht des Spielers verborgen", () => {
  const s = inScene({ type: "cardChoice", variant: "hidden" }, deckOf(10));
  const v = viewFor(s, 0);
  assert.ok(v.path.players[0].scene.offers.every((o) => o === null));
});

test("Knoten Verschmelzung: zwei gleiche Karten werden eine", () => {
  let s = inScene({ type: "fuse" }, deckOf(10));
  s = act(s, { type: "nodeAction", player: 0, op: "fuse", a: "x0", b: "x1" });
  assert.equal(s.players[0].deck.length, 9);
  const c = resolveCard(s.players[0].deck[0].baseId, s.players[0].deck[0].mods);
  assert.equal(c.attack, 6);
  assert.equal(c.health, 4);
  assert.deepEqual(c.sigils, ["rudelruf:2"]);
});

test("Knoten Sigil-Transfer: Spenderkarte geht, Sigil wandert", () => {
  let s = inScene({ type: "transfer" }, ["nachtvoegel_ziegenmelker", ...deckOf(9)]);
  s = act(s, { type: "nodeAction", player: 0, op: "transfer", donor: "x0", target: "x1", sigil: "schwinge" });
  assert.equal(s.players[0].deck.length, 9);
  const t = s.players[0].deck.find((d) => d.uid === "x1");
  assert.deepEqual(resolveCard(t.baseId, t.mods).sigils, ["rudelruf", "schwinge"]);
});

test("Knoten Lagerfeuer: Werte steigen, Wiederholung trägt Risiko (seed-deterministisch)", () => {
  let s = inScene({ type: "campfire" }, deckOf(10));
  s = act(s, { type: "nodeAction", player: 0, op: "boost", uid: "x0", stat: "health" });
  const card = s.players[0].deck.find((d) => d.uid === "x0");
  assert.equal(resolveCard(card.baseId, card.mods).health, 4);
  // Weiter, bis verloren oder erschöpft — beides ist erlaubt, das Ergebnis muss reproduzierbar sein
  let t = s;
  for (let i = 0; i < 3 && t.path.players[0].scene; i++) t = act(t, { type: "nodeAction", player: 0, op: "boost", uid: "x0", stat: "attack" });
  let u = s;
  for (let i = 0; i < 3 && u.path.players[0].scene; i++) u = act(u, { type: "nodeAction", player: 0, op: "boost", uid: "x0", stat: "attack" });
  assert.deepEqual(t.players[0].deck, u.players[0].deck);
});

test("Knoten Karte entfernen: Mindestdeckgröße 8", () => {
  let s = inScene({ type: "remove" }, deckOf(8));
  assert.equal(applyAction(s, { type: "nodeAction", player: 0, op: "remove", uid: "x0" }).error, "deckTooSmall");
  s = inScene({ type: "remove" }, deckOf(9));
  s = act(s, { type: "nodeAction", player: 0, op: "remove", uid: "x0" });
  assert.equal(s.players[0].deck.length, 8);
});

test("Knoten Händler: Kauf gegen Splitter, max. 3 Items", () => {
  let s = inScene({ type: "merchant" }, deckOf(10));
  s = deepClone(s);
  s.players[0].shards = 30;
  s.players[0].items = [];
  s = act(s, { type: "nodeAction", player: 0, op: "buy", index: 0 });
  s = act(s, { type: "nodeAction", player: 0, op: "buy", index: 1 });
  s = act(s, { type: "nodeAction", player: 0, op: "buy", index: 2 });
  assert.equal(s.players[0].items.length, 3);
  assert.ok(s.players[0].shards < 30);
});

test("Knoten Totem-Schrein: Teil nehmen und Totem zusammensetzen", () => {
  let s = inScene({ type: "shrine" }, deckOf(10));
  s = act(s, { type: "nodeAction", player: 0, op: "take", index: 1 });
  const P = s.players[0];
  const bi = P.bases.length - 1;
  const hi = P.heads.findIndex((h) => (P.bases[bi].kind === "prop" ? h.kind === "lane" : true));
  if (hi >= 0) {
    s = act(s, { type: "nodeAction", player: 0, op: "assemble", head: hi, base: bi });
    const slot = s.players[0].heads[hi].kind === "tribe" ? "tribe" : "lane";
    assert.deepEqual(s.players[0].totems[slot].base, s.players[0].bases[bi]);
  }
});

test("Knoten Kopist: Duplikat mit Makel", () => {
  let s = inScene({ type: "copyist" }, deckOf(10));
  s = act(s, { type: "nodeAction", player: 0, op: "copy", uid: "x0" });
  assert.equal(s.players[0].deck.length, 11);
  const copy = s.players[0].deck[10];
  const c = resolveCard(copy.baseId, copy.mods);
  assert.ok(c.health === 1 || c.sigils.includes("kerzendocht:4"));
});

for (const ev of EVENTS) {
  test(`Ereignis ${ev}: hat eine gültige Hauptaktion`, () => {
    let s = inScene({ type: "event", event: ev }, ["bestien_aschwolf", "wurzelvolk_moosschrat", "kerzenwesen_kerzengeist", ...deckOf(9)]);
    s = deepClone(s);
    s.players[0].shards = 10;
    const scene = s.path.players[0].scene;
    const a = {
      faehrmann: { op: "swap", uid: "x0" },
      tintenwitwe: { op: "accept" },
      knochenorakel: { op: "offer", uids: ["x0", "x1"], pick: 0 },
      spiegelbrunnen: { op: "mirror", uid: "x0" },
      wachszieher: { op: "accept" },
      mondfinsternis: { op: "choose", uid: "x0" },
      gluecksspieler: { op: "bet", amount: 4 },
      stammestreue: { op: "choose", tribe: "bestien" },
    }[ev];
    const before = deepClone(s.players[0]);
    s = act(s, { type: "nodeAction", player: 0, ...a });
    assert.equal(s.path.players[0].scene, null, `${ev} schließt die Szene`);
    assert.notDeepEqual(s.players[0], before);
    if (ev === "wachszieher") {
      const wax = s.players[0].deck.find((d) => d.uid === "x2");
      assert.equal(resolveCard(wax.baseId, wax.mods).cost.amount, CARDS[wax.baseId].cost.amount - 1);
    }
    if (ev === "gluecksspieler") assert.ok([6, 14].includes(s.players[0].shards));
    if (ev === "tintenwitwe") assert.ok(s.players[0].deck.some((d) => d.mods.some((m) => m.kind === "dread")));
    void scene;
  });
}

// ───────── Match-Ablauf ─────────
test("Best-of: Pfad nach jedem Kampf außer dem letzten, Verlierer wählt den Beginner, Splitter werden verteilt", () => {
  let s = playUntil(createMatch({ seed: "BO3" }), (x) => x.phase === "interlude");
  if (s.phase === "interlude") {
    const loser = s.lastLoser;
    assert.equal(s.interlude.chooser, loser);
    assert.equal(applyAction(s, { type: "chooseStarter", player: 1 - loser, starter: 0 }).error, "notChooser");
    assert.ok(s.players[0].shards >= 2 && s.players[1].shards >= 2);
    s = act(s, { type: "chooseStarter", player: loser, starter: 1 - loser });
    assert.equal(s.phase, "battle");
    assert.equal(s.battle.active, 1 - loser);
  }
});

test("Best-of-1: ein Kampf entscheidet das Match; ungültige Werte fallen auf 2 zurück", () => {
  assert.equal(normalizeSettings({ winsNeeded: 1 }).winsNeeded, 1);
  assert.equal(normalizeSettings({ winsNeeded: 7 }).winsNeeded, 2);
  let battles = 0;
  let s = createMatch({ seed: "BO1", settings: { winsNeeded: 1 } });
  const rng = { rng: 3 };
  for (let guard = 0; s.phase !== "over" && guard < 5000; guard++) {
    const p = awaiting(s)[0];
    const r = applyAction(s, aiAction(s, p, "normal", rng));
    const res = r.error ? applyAction(s, { type: "timeout", player: p }) : r;
    battles += res.events.filter((e) => e.type === "battleEnd").length;
    s = res.state;
  }
  assert.equal(s.phase, "over");
  assert.equal(battles, 1);
  assert.equal(s.wins[s.winner], 1);
});

test("Aufgeben beendet das ganze Match", () => {
  let s = playUntil(createMatch({ seed: "GIVEUP" }), (x) => x.phase === "battle");
  s = act(s, { type: "surrender", player: 0 });
  assert.equal(s.phase, "over");
  assert.equal(s.winner, 1);
  assert.equal(s.endReason, "surrender");
});

test("Determinismus: gleicher Seed + gleiche Aktionen ⇒ gleicher End-State", () => {
  const run = () => playUntil(createMatch({ seed: "DET", salt: "salz" }), () => false, "normal", 99);
  const a = run();
  const b = run();
  assert.equal(a.phase, "over");
  assert.deepEqual(a, b);
});

test("Fuzz: 1000 Zufallsspiele ohne Exception und ohne Endlosschleife", () => {
  const levels = ["easy", "easy", "normal"];
  for (let g = 0; g < 1000; g++) {
    let s = createMatch({ seed: `FUZZ${g}`, settings: { draftMode: g % 2 ? "separate" : "shared", pathLength: 2 + (g % 3), winsNeeded: g % 5 === 0 ? 3 : 2 }, salt: String(g) });
    const rng = { rng: g + 1 };
    let steps = 0;
    while (s.phase !== "over") {
      assert.ok(steps++ < 6000, `Spiel ${g} endet nicht (Phase ${s.phase})`);
      const who = awaiting(s);
      assert.ok(who.length, `niemand am Zug in Phase ${s.phase}`);
      const p = who[g % who.length];
      // Ab und zu Zeitablauf statt Aktion, um auch die Timer-Pfade zu prüfen
      const a = steps % 17 === 0 ? { type: "timeout", player: p } : aiAction(s, p, levels[g % 3], rng);
      const res = applyAction(s, a);
      s = res.error ? applyAction(s, { type: "timeout", player: p }).state : res.state;
    }
  }
});

// ───────── Versteckte Information ─────────
test("Gefilterter State enthält keine gegnerischen Hand-/Deck-UIDs, kein Salz und keinen Kampf-RNG", () => {
  const s = playUntil(createMatch({ seed: "HIDE", salt: "geheim" }), (x) => x.phase === "battle" && x.battle.turn >= 3);
  assert.equal(s.phase, "battle");
  for (const viewer of [0, 1, null]) {
    const v = viewFor(s, viewer);
    const json = JSON.stringify(v);
    assert.ok(!json.includes("geheim"));
    assert.equal(v.battle.rng, undefined);
    for (const q of [0, 1]) {
      if (q === viewer) continue;
      for (const c of s.battle.players[q].hand) assert.ok(!json.includes(`"${c.uid}"`), `Hand-UID ${c.uid} von ${q} sichtbar für ${viewer}`);
      assert.equal(v.battle.players[q].hand, undefined);
      assert.equal(v.battle.players[q].deckList, undefined);
      assert.equal(v.players[q].deck, undefined);
    }
  }
});

test("Ereignisse: gezogene Karte des Gegners wird ohne Inhalt weitergegeben", () => {
  const ev = [{ type: "draw", player: 1, pile: "main", uid: "u9", card: { baseId: "x" }, private: 1 }];
  assert.equal(eventsFor(ev, 0)[0].card, undefined);
  assert.equal(eventsFor(ev, 1)[0].card.baseId, "x");
  assert.equal(eventsFor(ev, null)[0].card, undefined);
});

test("Pfad-Entscheidungen des Gegners bleiben verborgen", () => {
  let s = playUntil(createMatch({ seed: "PATHHIDE" }), (x) => x.phase === "path");
  if (s.phase !== "path") return;
  s = act(s, { type: "chooseNode", player: 1, strand: 0 });
  const v = viewFor(s, 0);
  assert.equal(v.path.players[1].scene, undefined);
  assert.equal(v.path.players[1].strand, undefined);
  assert.equal(v.path.players[1].visited, undefined);
});

test("Sammelbare Karten: jede Seltenheit vorhanden", () => {
  for (const r of ["common", "uncommon", "rare", "legendary"]) assert.ok(COLLECTIBLE.some((c) => c.rarity === r));
});
