// Moorwanderung: Startdecks, Einstellungen, Pfadkarte, Paarungen, komplette Runs, versteckte Information.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CARDS } from "../engine/cards.js";
import { getZirkel } from "../engine/zirkel/index.js";
import { streamFrom } from "../engine/rng.js";
import {
  createRun, applyRunAction, awaitingRun, normalizeRunSettings, pathsPerRound, sealsFor, PATH_LEVELS,
} from "../engine/modes/moorwanderung/run.js";
import { viewForRun, eventsForRun } from "../engine/modes/moorwanderung/view.js";
import { runAiAction } from "../engine/modes/moorwanderung/ai.js";
import { generateRunMap, fightCountsPerRoute } from "../engine/modes/moorwanderung/mapgen.js";
import { makePairs } from "../engine/modes/moorwanderung/pairing.js";
import { STARTER_DECKS, startersOf } from "../data/modes/moorwanderung/starterDecks.js";

const names = (/** @type {number} */ n) => Array.from({ length: n }, (_, i) => `Zeichner ${i + 1}`);

/** Run mit KI-Entscheidungen weiterspielen, bis `until` gilt (oder Ende). Liefert State und alle Ereignisse. */
function play(/** @type {any} */ s, /** @type {(s: any) => boolean} */ until = () => false, level = "normal", seed = 1) {
  const rng = { rng: seed };
  const all = [];
  let steps = 0;
  while (s.phase !== "over" && !until(s)) {
    assert.ok(steps++ < 30000, `endet nicht (Phase ${s.phase})`);
    const who = awaitingRun(s);
    assert.ok(who.length, `niemand am Zug in Phase ${s.phase}`);
    const p = who[steps % who.length];
    let r = applyRunAction(s, runAiAction(s, p, level, rng));
    if (r.error) r = applyRunAction(s, { type: "timeout", player: p });
    assert.equal(r.error, undefined, `Zeitablauf abgelehnt: ${r.error}`);
    all.push(...r.events);
    s = r.state;
  }
  return { s, events: all };
}

// ───────── Daten ─────────
test("Startdecks: je Zirkel drei, 8 gültige Karten des Zirkels, Nebendeck-Totem aus der Liste des Zirkels", () => {
  for (const z of ["moor", "gezeiten"]) {
    const decks = startersOf(z);
    assert.equal(decks.length, 3, z);
    for (const d of decks) {
      assert.equal(d.cards.length, 8, d.id);
      for (const id of d.cards) {
        assert.ok(CARDS[id], `${d.id}: unbekannte Karte ${id}`);
        assert.equal(CARDS[id].zirkel, z, `${d.id}: ${id} gehört nicht zu ${z}`);
        assert.ok(!CARDS[id].token && !CARDS[id].cursed && !CARDS[id].unique, `${d.id}: ${id} ist kein normales Deckmitglied`);
      }
      assert.ok(getZirkel(z).sideTotemSigils.includes(d.sideSigil), `${d.id}: Nebendeck-Totem ${d.sideSigil}`);
    }
  }
  assert.equal(new Set(STARTER_DECKS.map((d) => d.id)).size, STARTER_DECKS.length);
});

test("Einstellungen: Grenzen, Standardwerte, automatische Siegel und Pfade pro Runde", () => {
  const d = normalizeRunSettings({});
  assert.equal(d.seals, "auto");
  assert.equal(d.pathLength, "normal");
  assert.equal(d.oddMode, "mirror");
  assert.equal(d.hardBoss, false);
  const bad = normalizeRunSettings({ players: 9, seals: 7, pathsPerRound: 5, pathLength: "x", oddMode: "?", pace: "turbo", zirkel: "nichts" });
  assert.equal(bad.players, 6);
  assert.equal(bad.seals, "auto");
  assert.equal(bad.pathsPerRound, "auto");
  assert.equal(bad.zirkel, "moor");
  assert.equal(pathsPerRound({ players: 4, pathsPerRound: "auto" }), 1);
  assert.equal(pathsPerRound({ players: 2, pathsPerRound: 2 }), 2);
  // Siegel „auto“: 3 bei 2–3 Spielern, 2 ab 4; im laufenden Run steht immer die Zahl in den Einstellungen
  assert.equal(sealsFor({ players: 3, seals: "auto" }), 3);
  assert.equal(sealsFor({ players: 4, seals: "auto" }), 2);
  assert.equal(sealsFor({ players: 6, seals: 4 }), 4);
  const run4 = createRun({ seed: "SIEGEL", names: names(4), salt: "s" });
  assert.equal(run4.settings.seals, 2);
  assert.ok(run4.players.every((P) => P.seals === 2));
  assert.equal(pathsPerRound({ players: 6, pathsPerRound: 3 }), 3);
});

// ───────── Pfadkarte ─────────
test("Pfadkarte: auf jedem Weg 2–3 Kämpfe, letzte Ebene Boss, deterministisch; ohne Kämpfe keine NPC-Knoten", () => {
  for (const [len, levels] of Object.entries(PATH_LEVELS)) {
    for (let i = 0; i < 200; i++) {
      const opts = { seed: `MAP${i}`, pathNo: 1 + (i % 7), levels, zirkel: i % 2 ? "gezeiten" : "moor", npcs: ["a", "b", "c"], elites: ["e"], boss: "b1" };
      const map = generateRunMap(opts);
      assert.deepEqual(map, generateRunMap(opts));
      assert.equal(map.nodes.length, levels, len);
      assert.ok(map.nodes[levels - 1].every((n) => n.type === "boss"));
      const counts = fightCountsPerRoute(map);
      assert.ok(counts.length > 0);
      for (const c of counts) assert.ok(c >= 2 && c <= 3, `${len}: Weg mit ${c} Kämpfen`);
      assert.ok(map.nodes[0].every((n) => !["npc", "elite"].includes(n.type)), "erste Ebene ohne Kampf");
    }
  }
  const plain = generateRunMap({ seed: "PLAIN", pathNo: 1, levels: 6, fights: false });
  assert.ok(plain.nodes.flat().every((n) => !["npc", "elite", "boss", "scout"].includes(n.type)));
});

// ───────── Paarungen ─────────
function fakePlayers(/** @type {number} */ n) {
  return Array.from({ length: n }, () => ({ alive: true, lastOpponent: null, met: {}, ghostCount: 0 }));
}

test("Paarungen: 2–6 Spieler, jeder genau einmal; ungerade → genau ein Geist-Duell", () => {
  for (let n = 2; n <= 6; n++) {
    const { pairs, ghost } = makePairs(fakePlayers(n), streamFrom("t", n));
    const seen = [...pairs.flat(), ...(ghost !== null ? [ghost] : [])];
    assert.equal(seen.length, n);
    assert.equal(new Set(seen).size, n);
    assert.equal(ghost !== null, n % 2 === 1);
  }
});

test("Paarungen: keine direkte Wiederholung, solange es Alternativen gibt – auch nach dem Ausscheiden", () => {
  for (let n = 4; n <= 6; n++) {
    const P = fakePlayers(n);
    for (let round = 0; round < 12; round++) {
      const { pairs, ghost } = makePairs(P, streamFrom("r", n, round));
      for (const [a, b] of pairs) {
        assert.ok(!(P[a].lastOpponent === b && P[b].lastOpponent === a), `Runde ${round}: ${a}–${b} direkt wiederholt`);
      }
      for (const Q of P) Q.lastOpponent = null;
      for (const [a, b] of pairs) {
        P[a].lastOpponent = b;
        P[b].lastOpponent = a;
        P[a].met[b] = (P[a].met[b] || 0) + 1;
        P[b].met[a] = (P[b].met[a] || 0) + 1;
      }
      if (ghost !== null) P[ghost].ghostCount += 1;
    }
  }
  // Nach Ausscheiden: 3 Lebende, keine Wiederholung möglich zu vermeiden? Doch: A-B zuletzt → jetzt A oder B gegen C
  const P = fakePlayers(5);
  P[3].alive = false;
  P[4].alive = false;
  P[0].lastOpponent = 1;
  P[1].lastOpponent = 0;
  for (let i = 0; i < 20; i++) {
    const { pairs, ghost } = makePairs(P, streamFrom("aus", i));
    assert.equal(pairs.length, 1);
    assert.ok(ghost !== null && ghost <= 2);
    assert.notDeepEqual([...pairs[0]].sort(), [0, 1], "0 und 1 spielen direkt wieder gegeneinander");
  }
});

test("Paarungen: Geist-Duelle rotieren fair (3 und 5 Spieler: Unterschied höchstens 1)", () => {
  for (const n of [3, 5]) {
    const P = fakePlayers(n);
    for (let round = 0; round < 15; round++) {
      const { ghost } = makePairs(P, streamFrom("g", n, round));
      P[ghost].ghostCount += 1;
      const counts = P.map((Q) => Q.ghostCount);
      assert.ok(Math.max(...counts) - Math.min(...counts) <= 1, `${n} Spieler, Runde ${round}: ${counts}`);
    }
  }
});

// ───────── Runs ─────────
test("Komplette Runs mit 2–6 KI-Spielern: enden, Plätze 1..n eindeutig, genau ein Sieger", () => {
  for (let n = 2; n <= 6; n++) {
    for (let g = 0; g < 6; g++) {
      const run = createRun({ seed: `RUN${n}-${g}`, names: names(n), salt: `s${g}`, settings: { oddMode: g % 2 ? "lord" : "mirror", pathLength: ["short", "normal", "long"][g % 3], seals: [2, 3, 4][g % 3] } });
      const { s } = play(run, undefined, ["easy", "normal"][g % 2], g + 1);
      assert.equal(s.phase, "over");
      const places = s.players.map((P) => P.place).sort((a, b) => a - b);
      assert.deepEqual(places, Array.from({ length: n }, (_, i) => i + 1), `${n} Spieler: Plätze ${places}`);
      assert.equal(s.players[s.winner].place, 1);
      assert.equal(s.players.filter((P) => P.alive).length, 1);
    }
  }
});

test("Duelle: Verlierer verliert ein Siegel und bekommt den Aufholbonus (zusätzliche Kartenwahl zu Beginn des Pfads)", () => {
  const { s, events } = play(createRun({ seed: "BONUS", names: names(4), salt: "b", settings: { seals: 3 } }), (x) => x.round >= 1 && x.phase === "path");
  const ends = events.filter((e) => e.type === "duelEnd");
  assert.equal(ends.length, 2);
  for (const e of ends) {
    assert.equal(s.players[e.loser].seals, 2);
    assert.equal(s.path.players[e.loser].scene?.bonus, true);
    assert.equal(s.path.players[e.winner].scene, null);
  }
});

test("Ungerade Spielerzahl: Spiegelgeist spielt eine Kopie eines anderen lebenden Decks; Moorfürst als Alternative", () => {
  const mirror = play(createRun({ seed: "GEIST", names: names(3), salt: "m" }), (x) => x.phase === "duels").s;
  const g = mirror.duels.pairs.find((x) => x.seats[1] === null);
  assert.equal(g.ghost.kind, "mirror");
  assert.notEqual(g.ghost.of, g.seats[0]);
  const lord = play(createRun({ seed: "FUERST", names: names(5), salt: "l", settings: { oddMode: "lord" } }), (x) => x.phase === "duels").s;
  assert.equal(lord.duels.pairs.filter((x) => x.seats[1] === null).length, 1);
  assert.equal(lord.duels.pairs.find((x) => x.seats[1] === null).ghost.kind, "lord");
});

test("Versteckte Information (6 Spieler): keine fremden Deck-UIDs, Items oder Szenen in Sicht und Ereignissen", () => {
  const run = createRun({ seed: "GEHEIM", names: names(6), salt: "geheimsalz" });
  let s = run;
  const rng = { rng: 3 };
  let steps = 0;
  const leaks = [];
  while (s.phase !== "over" && steps++ < 4000) {
    const who = awaitingRun(s);
    const p = who[steps % who.length];
    let r = applyRunAction(s, runAiAction(s, p, "normal", rng));
    if (r.error) r = applyRunAction(s, { type: "timeout", player: p });
    s = r.state;
    if (steps % 7 !== 0) continue;
    for (let viewer = 0; viewer < 6; viewer++) {
      const v = viewForRun(s, viewer);
      const json = JSON.stringify(v) + JSON.stringify(eventsForRun(r.events, viewer));
      if (json.includes("geheimsalz")) leaks.push("Salz");
      // Deck-UIDs haben die Form p<Spieler>c<n>: alle vorkommenden einmal einsammeln statt pro Karte zu suchen
      const uids = new Set(json.match(/"p\d+c\d+"/g) || []);
      for (let q = 0; q < 6; q++) {
        if (q === viewer) continue;
        assert.equal(v.players[q].deck, undefined);
        assert.equal(v.players[q].items, undefined);
        assert.equal(v.players[q].totems, undefined);
        for (const u of uids) if (u.startsWith(`"p${q}c`)) leaks.push(`${u} von ${q} für ${viewer}`);
      }
      if (v.battle) {
        for (const [seat, BP] of v.battle.players.entries()) if (seat !== v.battleInfo.seat) assert.equal(BP.hand, undefined);
      }
      for (const w of Object.values(v.watch)) for (const BP of w.battle.players) assert.equal(BP.hand, undefined);
    }
  }
  assert.deepEqual(leaks.slice(0, 5), []);
});

test("Aufgeben: sofort ausgeschieden; im Duell gewinnt der Gegner ohne Siegelverlust; mit 2 Spielern endet der Run", () => {
  let s = play(createRun({ seed: "AUFGABE", names: names(4), salt: "a" }), (x) => x.phase === "duels").s;
  const pair = s.duels.pairs[0];
  const [a, b] = pair.seats;
  const sealsB = s.players[b].seals;
  s = applyRunAction(s, { type: "surrender", player: a }).state;
  assert.equal(s.players[a].alive, false);
  assert.equal(s.players[a].place, 4);
  assert.equal(s.players[b].seals, sealsB);
  const two = applyRunAction(createRun({ seed: "ZWEI", names: names(2) }), { type: "surrender", player: 1 }).state;
  assert.equal(two.phase, "over");
  assert.equal(two.winner, 0);
});

test("Determinismus: gleicher Seed und gleiche KI → gleicher End-State", () => {
  const run = () => play(createRun({ seed: "DET", names: names(5), salt: "d" }), undefined, "normal", 9).s;
  assert.deepEqual(run(), run());
});
