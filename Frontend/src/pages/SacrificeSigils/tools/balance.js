#!/usr/bin/env node
// tools/balance.js — Balancing-Tool: KI gegen KI mit zufälligen Draft-Decks aus Seeds.
//
//   npm run balance -- --games 5000 [--level normal] [--workers 8] [--out pfad.json]
//
// Gespielt werden komplette Matches (Draft, Kämpfe, Pfad) mit derselben Engine und KI wie im Spiel. Gezählt wird pro
// Kampf: Siegquote je Karte (im Deck / gespielt), je Sigil (auf gespielten Karten), je Stamm (Deck mit ≥ 3 Karten des
// Stamms), je Kostentyp (gespielte Karten), dazu der Vorteil des Startspielers und die durchschnittliche Kampfdauer.
// Ausreißer: Siegquote < 44 % oder > 56 % bei mindestens 200 Stichproben.
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { createMatch, applyAction, awaiting } from "../engine/match.js";
import { aiAction } from "../engine/ai/index.js";
import { CARDS, resolveCard } from "../engine/cards.js";
import { parseSigil } from "../engine/sigils/index.js";

const OUTLIER_LOW = 0.44;
const OUTLIER_HIGH = 0.56;
const MIN_SAMPLES = 200;

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

/** Leere Statistik. */
function emptyStats() {
  return { games: 0, battles: 0, starterWins: 0, turns: 0, errors: 0, deck: {}, played: {}, sigil: {}, tribe: {}, cost: {} };
}

/** @param {Record<string, number[]>} table @param {string} key @param {boolean} win */
function add(table, key, win) {
  const e = table[key] || (table[key] = [0, 0]);
  e[0] += win ? 1 : 0;
  e[1] += 1;
}

/** Ein komplettes Match spielen und in `st` eintragen. */
function playMatch(seed, level, st) {
  let s = createMatch({ seed, settings: { draftMode: seed.charCodeAt(seed.length - 1) % 2 ? "separate" : "shared", pathLength: 3 }, salt: `bal-${seed}` });
  const rng = { rng: [...seed].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0 };
  let decks = null;
  let played = [new Set(), new Set()];
  let guard = 0;
  let lastBattle = 0;
  while (s.phase !== "over" && guard++ < 8000) {
    if (s.phase === "battle" && s.battleNo !== lastBattle) {
      lastBattle = s.battleNo;
      decks = s.players.map((P) => P.deck.map((dc) => resolveCard(dc.baseId, dc.mods)));
      played = [new Set(), new Set()];
    }
    const p = awaiting(s)[0];
    const a = aiAction(s, p, level, rng);
    let res = applyAction(s, a);
    if (res.error) {
      st.errors += 1;
      res = applyAction(s, { type: "timeout", player: p });
    }
    for (const e of res.events) {
      if (e.type === "play" && e.card) played[e.player].add(e.card.baseId);
      if (e.type === "battleEnd" && decks) {
        const w = e.winner;
        const b = s.battle;
        st.battles += 1;
        st.turns += b.turn;
        if (w === b.starter) st.starterWins += 1;
        for (const q of [0, 1]) {
          const win = q === w;
          const tribes = new Map();
          for (const c of new Set(decks[q].map((c) => c.baseId))) add(st.deck, c, win);
          for (const c of decks[q]) tribes.set(c.tribe, (tribes.get(c.tribe) || 0) + 1);
          for (const [t, n] of tribes) if (n >= 3) add(st.tribe, t, win);
          for (const id of played[q]) {
            add(st.played, id, win);
            add(st.cost, CARDS[id].cost.type, win);
            for (const ref of CARDS[id].sigils) add(st.sigil, parseSigil(ref).id, win);
          }
        }
      }
    }
    s = res.state;
  }
  st.games += 1;
}

/** @param {any} a @param {any} b */
function merge(a, b) {
  for (const k of ["games", "battles", "starterWins", "turns", "errors"]) a[k] += b[k];
  for (const t of ["deck", "played", "sigil", "tribe", "cost"]) {
    for (const [key, [w, n]] of Object.entries(b[t])) {
      const e = a[t][key] || (a[t][key] = [0, 0]);
      e[0] += w;
      e[1] += n;
    }
  }
  return a;
}

function rows(table, nameOf) {
  return Object.entries(table)
    .map(([key, [w, n]]) => ({ key, name: nameOf(key), wins: w, samples: n, rate: n ? w / n : 0, outlier: n >= MIN_SAMPLES && (w / n < OUTLIER_LOW || w / n > OUTLIER_HIGH) }))
    .sort((x, y) => y.rate - x.rate);
}

function printTable(title, list, limit = 12) {
  console.log(`\n${title}`);
  const pad = (s, n) => String(s).padEnd(n);
  const show = [...list.slice(0, limit), ...(list.length > limit * 2 ? [{ key: "…" }] : []), ...list.slice(Math.max(limit, list.length - limit))];
  for (const r of show) {
    if (r.key === "…") { console.log("  …"); continue; }
    console.log(`  ${pad(r.name, 28)} ${pad(`${(r.rate * 100).toFixed(1)} %`, 8)} n=${pad(r.samples, 6)}${r.outlier ? " !! AUSREISSER" : ""}`);
  }
}

if (isMainThread) {
  const games = Number(arg("games", "5000"));
  const level = arg("level", "normal");
  const workers = Math.max(1, Math.min(Number(arg("workers", String(os.cpus().length))), games));
  const here = path.dirname(fileURLToPath(import.meta.url));
  const out = path.resolve(arg("out", path.join(here, "..", "..", "..", "..", "..", "docs", "sacrifice-and-sigils", "balance-report.json")));
  const t0 = Date.now();
  console.log(`Balancing: ${games} Matches, KI „${level}“, ${workers} Worker …`);
  const per = Math.ceil(games / workers);
  const jobs = Array.from({ length: workers }, (_, i) => new Promise((resolve, reject) => {
    const w = new Worker(fileURLToPath(import.meta.url), { workerData: { from: i * per, to: Math.min(games, (i + 1) * per), level } });
    w.on("message", resolve);
    w.on("error", reject);
  }));
  const parts = await Promise.all(jobs);
  const st = parts.reduce(merge, emptyStats());
  const nameCard = (id) => CARDS[id]?.name || id;
  const report = {
    generatedAt: new Date().toISOString(),
    games: st.games,
    battles: st.battles,
    level,
    errors: st.errors,
    firstPlayerWinRate: st.starterWins / Math.max(1, st.battles),
    avgBattleTurns: st.turns / Math.max(1, st.battles),
    thresholds: { low: OUTLIER_LOW, high: OUTLIER_HIGH, minSamples: MIN_SAMPLES },
    cardsInDeck: rows(st.deck, nameCard),
    cardsPlayed: rows(st.played, nameCard),
    sigils: rows(st.sigil, (k) => k),
    tribes: rows(st.tribe, (k) => k),
    costTypes: rows(st.cost, (k) => k),
  };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(report, null, 1)}\n`);
  console.log(`\n${st.games} Matches, ${st.battles} Kämpfe in ${((Date.now() - t0) / 1000).toFixed(1)} s, ${st.errors} abgelehnte KI-Aktionen`);
  console.log(`Startspieler gewinnt: ${(report.firstPlayerWinRate * 100).toFixed(1)} % · Ø Kampfdauer: ${report.avgBattleTurns.toFixed(1)} Züge`);
  printTable("Karten (im Deck)", report.cardsInDeck);
  printTable("Karten (gespielt)", report.cardsPlayed);
  printTable("Sigils (gespielt)", report.sigils, 8);
  printTable("Stämme (≥ 3 Karten im Deck)", report.tribes, 14);
  printTable("Kostentypen (gespielt)", report.costTypes, 3);
  const outliers = report.cardsInDeck.filter((r) => r.outlier);
  console.log(`\nAusreißer (Karten im Deck): ${outliers.length}${outliers.length ? ` – ${outliers.map((r) => `${r.name} ${(r.rate * 100).toFixed(0)} %`).join(", ")}` : ""}`);
  console.log(`Bericht: ${path.relative(process.cwd(), out)}`);
} else {
  const { from, to, level } = workerData;
  const st = emptyStats();
  for (let g = from; g < to; g++) playMatch(`BAL${g}`, level, st);
  parentPort.postMessage(st);
}
