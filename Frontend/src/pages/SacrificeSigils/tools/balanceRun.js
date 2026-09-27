#!/usr/bin/env node
// tools/balanceRun.js — Balancing der Moorwanderung: komplette Runs KI gegen KI mit derselben Engine wie im Spiel.
//
//   npm run balance:run -- --players 6 --runs 1000 [--zirkel moor|gezeiten|beide] [--length short|normal|long]
//                          [--seals 2|3|4] [--paths 1|2|3]
//                          [--workers 8] [--out pfad.json]
//
// Ausgabe:
//   · Startdecks: Run-Siege (roh und im Verhältnis zum fairen Anteil 1/Spieler), mittlerer Platz
//   · Kämpfe: Siegquote der NPCs/Eliten/Bosse gegen die KI (Stufe „normal“), je Gegner einzeln
//   · Dauer: Kampfzüge und geschätzte Spielzeit mit Menschen (Zeitmodell unten), Pfade und Duellrunden je Run
//   · Knotenwahl: wie oft ein Knotentyp gewählt wurde, wenn er erreichbar war
//   · Ausreißer gegen die Zielwerte (NPC 25–35 %, Boss 40–50 %, Startdeck-Anteil 0,9–1,1 entspricht 45–55 % im 1-gegen-1)
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { createRun, applyRunAction, awaitingRun } from "../engine/modes/moorwanderung/run.js";
import { runAiAction } from "../engine/modes/moorwanderung/ai.js";
import { reachable } from "../engine/path.js";
import { NPC_BY_ID } from "../data/modes/moorwanderung/npcs.js";
import { STARTER_DECKS } from "../data/modes/moorwanderung/starterDecks.js";

const TARGET = { npc: [0.25, 0.35], elite: [0.3, 0.45], boss: [0.4, 0.5], starterShare: [0.9, 1.1] };
const MIN_SAMPLES = 30;

// Zeitmodell (Sekunden) für eine Runde mit Menschen: eigene Züge dauern, KI-/NPC-Züge sind nur Animation.
const TIME = { starter: 45, node: 8, scene: 12, humanTurn: 14, aiTurn: 4, duelIntro: 6 };

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

function emptyStats() {
  return {
    runs: 0, errors: 0, stuck: 0, seconds: 0, pathSeconds: 0, duelSeconds: 0, battleTurns: 0, paths: 0, duelRounds: 0, deckSize: 0,
    starter: /** @type {Record<string, {picked:number, wins:number, placeSum:number, players:number}>} */ ({}),
    fights: /** @type {Record<string, [number, number]>} */ ({}), // kind → [NPC-Siege, Kämpfe]
    foes: /** @type {Record<string, [number, number]>} */ ({}), // npcId → [NPC-Siege, Kämpfe]
    tiers: /** @type {Record<string, [number, number]>} */ ({}), // "kind:stufe" → [NPC-Siege, Kämpfe]
    fightTurns: /** @type {Record<string, [number, number]>} */ ({}), // kind → [Züge, Kämpfe]
    phase2: /** @type {Record<string, [number, number]>} */ ({}), // bossId → [Phase 2 erreicht, Kämpfe]
    nodes: /** @type {Record<string, [number, number]>} */ ({}), // Typ → [gewählt, angeboten]
    durations: /** @type {number[]} */ ([]),
  };
}

/** @param {Record<string, number[]>} t @param {string} k @param {number} a @param {number} b */
function add(t, k, a, b = 1) {
  const e = t[k] || (t[k] = [0, 0]);
  e[0] += a;
  e[1] += b;
}

/**
 * Einen Run durchspielen und in die Statistik eintragen.
 * @param {any} st @param {number} i @param {{ players: number, zirkel: string, length: string }} o
 */
function playRun(st, i, o) {
  const zirkel = o.zirkel === "beide" ? (i % 2 ? "gezeiten" : "moor") : o.zirkel;
  const names = Array.from({ length: o.players }, (_, q) => `KI ${q + 1}`);
  let s = createRun({ seed: `BAL${i}`, names, salt: `bal-${i}`, settings: { zirkel, players: o.players, pathLength: o.length, ...(o.seals ? { seals: o.seals } : {}), ...(o.paths ? { pathsPerRound: o.paths } : {}) } });
  const rng = { rng: 1000 + i };
  // Zeit: je Pfad Summe je Spieler (parallel → Maximum zählt), je Duellrunde Maximum der Duelle
  let pathTime = new Array(o.players).fill(0);
  let duelTime = /** @type {Record<string, number>} */ ({});
  const fightTurns = /** @type {Record<number, number>} */ ({});
  const phase2 = /** @type {Record<number, boolean>} */ ({});
  let seconds = TIME.starter;
  const closePath = () => {
    const t = Math.max(0, ...pathTime);
    if (t) { seconds += t; st.pathSeconds += t; }
    pathTime = new Array(o.players).fill(0);
  };
  const closeDuels = () => {
    if (!Object.keys(duelTime).length) return;
    const t = TIME.duelIntro + Math.max(0, ...Object.values(duelTime));
    seconds += t;
    st.duelSeconds += t;
    duelTime = {};
  };

  let guard = 0;
  for (; s.phase !== "over" && guard < 60000; guard++) {
    const who = awaitingRun(s);
    if (!who.length) break;
    const p = who[guard % who.length];
    const action = runAiAction(s, p, "normal", rng);
    // Angebotene Knoten zählen (alles Erreichbare), bevor gewählt wird
    if (action.type === "chooseNode" && s.path) {
      const pp = s.path.players[p];
      for (const st2 of reachable(pp.strand)) add(st.nodes, s.path.map.nodes[pp.level][st2].type, 0);
    }
    let r = applyRunAction(s, action);
    if (r.error) {
      st.errors += 1;
      r = applyRunAction(s, { type: "timeout", player: p });
      if (r.error) break;
    }
    s = r.state;
    for (const e of r.events) {
      if (e.type === "nodeChosen") {
        add(st.nodes, e.node.type, 1, 0);
        pathTime[e.player] += TIME.node + (["npc", "elite", "boss"].includes(e.node.type) ? 0 : TIME.scene);
      } else if (e.type === "fightEnd") {
        add(st.fights, e.kind, e.won ? 0 : 1);
        add(st.tiers, `${e.kind}:${Math.min(5, s.path?.tier ?? 0)}`, e.won ? 0 : 1);
        add(st.fightTurns, e.kind, fightTurns[e.player] || 0);
        fightTurns[e.player] = 0;
        if (e.npcId) add(st.foes, e.npcId, e.won ? 0 : 1);
        if (e.kind === "boss" && e.npcId) add(st.phase2, e.npcId, phase2[e.player] ? 1 : 0);
        phase2[e.player] = false;
        pathTime[e.player] += TIME.scene; // Belohnung/Trost wählen
      } else if (e.type === "bossPhase" && typeof e.ctx === "string") {
        phase2[Number(e.ctx.slice(1))] = true;
      } else if (e.type === "turnStart" && typeof e.ctx === "string") {
        st.battleTurns += 1;
        if (e.ctx.startsWith("f")) {
          const q = Number(e.ctx.slice(1));
          if (pathTime[q] !== undefined) pathTime[q] += e.player === 0 ? TIME.humanTurn : TIME.aiTurn;
          fightTurns[q] = (fightTurns[q] || 0) + 1;
        } else {
          duelTime[e.ctx] = (duelTime[e.ctx] || 0) + TIME.humanTurn;
        }
      } else if (e.type === "phase" && e.phase === "path") {
        st.paths += 1;
      } else if (e.type === "duelsStart") {
        closePath();
        st.duelRounds += 1;
      } else if (e.type === "roundEnd") {
        closeDuels();
      }
    }
  }
  if (s.phase !== "over") {
    st.stuck += 1;
    return;
  }
  closePath();
  closeDuels();
  st.runs += 1;
  st.seconds += seconds;
  st.durations.push(seconds);
  const places = Object.fromEntries(s.placements.map((/** @type {any} */ x) => [x.player, x.place]));
  s.players.forEach((/** @type {any} */ P, /** @type {number} */ q) => {
    const k = `${zirkel}:${P.starter}`;
    const e = st.starter[k] || (st.starter[k] = { picked: 0, wins: 0, placeSum: 0, players: 0 });
    e.picked += 1;
    e.players += o.players;
    e.wins += s.winner === q ? 1 : 0;
    e.placeSum += places[q] || o.players;
    st.deckSize += P.deck.length;
  });
}

/** @param {any} a @param {any} b */
function merge(a, b) {
  for (const k of ["runs", "errors", "stuck", "seconds", "pathSeconds", "duelSeconds", "battleTurns", "paths", "duelRounds", "deckSize"]) a[k] += b[k];
  a.durations.push(...b.durations);
  for (const t of ["fights", "foes", "nodes", "tiers", "fightTurns", "phase2"]) for (const [k, [x, y]] of Object.entries(b[t])) add(a[t], k, x, y);
  for (const [k, v] of Object.entries(b.starter)) {
    const e = a.starter[k] || (a.starter[k] = { picked: 0, wins: 0, placeSum: 0, players: 0 });
    e.picked += v.picked; e.wins += v.wins; e.placeSum += v.placeSum; e.players += v.players;
  }
  return a;
}

const pct = (x) => `${(x * 100).toFixed(1).padStart(5)} %`;
const out = (x, [lo, hi]) => (x < lo || x > hi ? "  <- außerhalb" : "");

/** @param {any} st @param {any} o */
function report(st, o) {
  const lines = [];
  const L = (s = "") => lines.push(s);
  const mins = st.durations.map((x) => x / 60).sort((a, b) => a - b);
  const q = (f) => mins[Math.min(mins.length - 1, Math.floor(f * mins.length))] || 0;
  L(`Moorwanderung · ${st.runs} Runs · ${o.players} Spieler · Zirkel ${o.zirkel} · Pfadlänge ${o.length}`);
  L(`Fehlzüge ${st.errors} · hängengeblieben ${st.stuck}`);
  L();
  L("Dauer");
  L(`  Pfade/Run ${(st.paths / st.runs).toFixed(1)} · Duellrunden/Run ${(st.duelRounds / st.runs).toFixed(1)} · Kampfzüge/Run ${(st.battleTurns / st.runs).toFixed(0)} · Deckgröße am Ende ${(st.deckSize / st.runs / o.players).toFixed(1)}`);
  L(`  je Pfad ${(st.pathSeconds / st.paths / 60).toFixed(1)} min · je Duellrunde ${(st.duelSeconds / st.duelRounds / 60).toFixed(1)} min`);
  L(`  geschätzte Spielzeit: Median ${q(0.5).toFixed(0)} min · 10 % ${q(0.1).toFixed(0)} min · 90 % ${q(0.9).toFixed(0)} min`);
  L();
  L("Kämpfe (Siegquote des NPC gegen KI normal)");
  for (const k of ["npc", "elite", "boss"]) {
    const [w, n] = st.fights[k] || [0, 0];
    if (n) L(`  ${k.padEnd(6)} ${pct(w / n)}  (${n})${out(w / n, TARGET[k])}`);
  }
  L("  nach Stufe (Pfadnummer − 1, 5 = 5+):");
  for (const k of ["npc", "elite", "boss"]) {
    const row = [0, 1, 2, 3, 4, 5].map((t) => st.tiers[`${k}:${t}`]).map((e) => (e && e[1] >= 10 ? pct(e[0] / e[1]).trim() : "–").padStart(9)).join("");
    L(`    ${k.padEnd(6)}${row}`);
  }
  const turns = ["npc", "elite", "boss"].map((k) => (st.fightTurns[k] ? `${k} ${(st.fightTurns[k][0] / st.fightTurns[k][1]).toFixed(1)}` : "")).filter(Boolean);
  L(`  Züge je Kampf: ${turns.join(" · ")}`);
  L();
  L("Gegner einzeln");
  const foes = Object.entries(st.foes).filter(([, [, n]]) => n >= MIN_SAMPLES).sort((a, b) => b[1][0] / b[1][1] - a[1][0] / a[1][1]);
  for (const [id, [w, n]] of foes) {
    const def = NPC_BY_ID[id];
    const kind = def?.phases ? "boss" : "npc";
    const p2 = kind === "boss" && st.phase2[id] ? ` · Phase 2 erreicht ${pct(st.phase2[id][0] / st.phase2[id][1]).trim()}` : "";
    L(`  ${(def?.name || id).padEnd(28)} ${kind.padEnd(5)} ${pct(w / n)}  (${n})${p2}${out(w / n, kind === "boss" ? TARGET.boss : [0.15, 0.45])}`);
  }
  L();
  L("Startdecks (Run-Siege · Anteil zum fairen 1/n · mittlerer Platz)");
  for (const [k, v] of Object.entries(st.starter).sort()) {
    const rate = v.wins / v.picked;
    const share = rate * o.players;
    const name = STARTER_DECKS.find((d) => `${d.zirkel}:${d.id}` === k)?.name || k;
    L(`  ${name.padEnd(22)} ${pct(rate)} · ${share.toFixed(2)} · Platz ${(v.placeSum / v.picked).toFixed(2)}  (${v.picked})${v.picked >= MIN_SAMPLES ? out(share, TARGET.starterShare) : ""}`);
  }
  L();
  L("Knotenwahl (gewählt, wenn erreichbar)");
  for (const [k, [c, a]] of Object.entries(st.nodes).sort((x, y) => y[1][0] / (y[1][1] || 1) - x[1][0] / (x[1][1] || 1))) {
    if (a) L(`  ${k.padEnd(12)} ${pct(c / a)}  (${c}/${a})`);
  }
  return lines.join("\n");
}

if (isMainThread) {
  const o = {
    players: Math.max(2, Math.min(6, Number(arg("players", 4)))),
    runs: Math.max(1, Number(arg("runs", 200))),
    zirkel: arg("zirkel", "beide"),
    length: arg("length", "normal"),
    seals: arg("seals", null) ? Number(arg("seals", null)) : null,
    paths: arg("paths", null) ? Number(arg("paths", null)) : null,
  };
  const workers = Math.max(1, Math.min(Number(arg("workers", Math.max(1, os.cpus().length - 1))), o.runs));
  const per = Math.ceil(o.runs / workers);
  console.log(`Moorwanderung-Balancing: ${o.runs} Runs, ${o.players} Spieler, ${workers} Worker …`);
  const t0 = Date.now();
  const parts = await Promise.all(Array.from({ length: workers }, (_, i) => new Promise((resolve, reject) => {
    const w = new Worker(fileURLToPath(import.meta.url), { workerData: { from: i * per, to: Math.min(o.runs, (i + 1) * per), o } });
    w.on("message", resolve);
    w.on("error", reject);
  })));
  const st = parts.reduce(merge, emptyStats());
  const text = report(st, o);
  console.log(text);
  console.log(`\n(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  const file = arg("out", null);
  if (file) fs.writeFileSync(file, JSON.stringify({ options: o, stats: { ...st, durations: undefined } }, null, 2));
} else {
  const { from, to, o } = workerData;
  const st = emptyStats();
  for (let i = from; i < to; i++) playRun(st, i, o);
  parentPort.postMessage(st);
}
