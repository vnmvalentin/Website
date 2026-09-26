// Zugang zu den Welten-Workern: erzeugt Welten außerhalb des Haupt-Fadens.
//
// Ein kleiner Pool (Kerne − 1, höchstens 4): Mehrere Welten entstehen gleichzeitig — etwa die Level aller Runden einer
// Lobby, während man noch wartet (Rückmeldung 27.09.2026: „5 random Level in Runden sollten relativ schnell laden“; ein
// langes Level braucht 1–7 s, nacheinander wären das bei 5 Runden bis zu einer halben Minute). Die Worker werden faul
// angelegt (erst bei Bedarf) und danach wiederverwendet — je Aufruf neu zu starten würde mehr kosten als die Erzeugung.
//
// Fällt ein Worker aus (kein `Worker` im Umfeld, Blockade durch die Seiteneinstellungen, Fehler beim Anlegen), wird im
// Haupt-Faden gerechnet. Das ist langsamer, aber es ist da — ein Werkzeug, das bei der kleinsten Störung gar nichts
// liefert, ist schlechter als eines, das kurz hakt.

import { checkLevel } from '../gen/world/reichweite/graph.js';
import { erzeugeWelt } from './generatorArchiv.js';
import { weltParams } from '../gen/index.js';

const MAX_WORKER = 4;
const poolGroesse = () => {
  const kerne = typeof navigator !== 'undefined' && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 2;
  return Math.max(1, Math.min(MAX_WORKER, kerne - 1));
};

/** @type {{ w: Worker, laufend: number }[]} */
let pool = [];
let brokenWorker = false;
let nextId = 1;
const pending = new Map();

function neuerWorker() {
  const w = new Worker(new URL('./worldWorker.js', import.meta.url), { type: 'module' });
  const eintrag = { w, laufend: 0 };
  w.onmessage = (e) => {
    const job = pending.get(e.data.id);
    eintrag.laufend = Math.max(0, eintrag.laufend - 1);
    if (!job) return;                       // verworfener Auftrag: Antwort verfällt
    pending.delete(e.data.id);
    if (e.data.error) job.reject(new Error(e.data.error));
    else job.resolve(e.data);
  };
  w.onerror = (e) => {
    // Ein Worker ist hinüber: ohne Worker weiter, alle Wartenden im Haupt-Faden bedienen
    brokenWorker = true;
    for (const p of pool) p.w.terminate();
    pool = [];
    for (const [, job] of pending) job.resolve(runHere(job.params, job.check));
    pending.clear();
    if (e && e.preventDefault) e.preventDefault();
  };
  return eintrag;
}

/** Den am wenigsten beschäftigten Worker — ist jeder beschäftigt und der Pool nicht voll, einen neuen */
function freierWorker() {
  if (brokenWorker) return null;
  if (typeof Worker === 'undefined') { brokenWorker = true; return null; }
  try {
    const frei = pool.find((p) => p.laufend === 0);
    if (frei) return frei;
    if (pool.length < poolGroesse()) {
      const neu = neuerWorker();
      pool.push(neu);
      return neu;
    }
    return pool.reduce((a, b) => (b.laufend < a.laufend ? b : a));
  } catch {
    brokenWorker = true;
    for (const p of pool) p.w.terminate();
    pool = [];
    return null;
  }
}

async function runHere(params, check) {
  const t0 = performance.now();
  const level = await erzeugeWelt(params);
  const genMs = performance.now() - t0;
  const t1 = performance.now();
  const report = check ? checkLevel(level, level.meta.limits) : null;
  return { level, report, genMs, checkMs: performance.now() - t1, inWorker: false };
}

/**
 * Eine Welt erzeugen (und auf Wunsch gleich prüfen). Mehrere Aufrufe laufen parallel auf dem Pool.
 *
 * @param {object} params  wie generateWorld(): seed, length, speedClass, biome, difficulty
 * @param {{check?: boolean}} [opts]
 * @returns {Promise<{level, report, genMs, checkMs, inWorker}>}
 */
export function generateWorldAsync(params, opts = {}) {
  const check = opts.check !== false;
  const eintrag = freierWorker();
  if (!eintrag) return Promise.resolve(runHere(params, check));

  const id = nextId++;
  eintrag.laufend++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve: (d) => resolve({ inWorker: true, ...d }), reject, params, check });
    eintrag.w.postMessage({ id, params, check });
  });
}

/** Aufträge vergessen, deren Ergebnis niemand mehr will (z. B. nach einem Seed-Wechsel) — sie werden abgelehnt, damit
 *  niemand ewig wartet (auch nicht der Level-Cache unten) */
export function dropPendingWorlds() {
  for (const [, job] of pending) job.reject(new Error('verworfen'));
  pending.clear();
}

// ── Live-Runden (Phase D): Pfad-Level je Runden-Parameter ────────────────────
// Dieselben Runden-Parameter ergeben dasselbe Level (gen/index.js weltParams) — einmal gebaut, von der Rennansicht und
// der Vorab-Erzeugung geteilt. Wenige Einträge: eine Lobby braucht die laufende und die nächste Runde.
const LEVEL_CACHE = new Map();
const LEVEL_CACHE_MAX = 6;

/** Das Pfad-Level zu Runden-Parametern (Promise); null, wenn die Parameter keine Pfad-Runde sind */
export function pfadLevel(params) {
  const w = weltParams(params);
  if (!w) return null;
  const key = JSON.stringify(w);
  if (!LEVEL_CACHE.has(key)) {
    const p = generateWorldAsync(w, { check: false }).then((r) => r.level);
    p.catch(() => LEVEL_CACHE.delete(key));                // gescheitert oder verworfen: beim nächsten Mal neu
    if (LEVEL_CACHE.size >= LEVEL_CACHE_MAX) LEVEL_CACHE.delete(LEVEL_CACHE.keys().next().value);
    LEVEL_CACHE.set(key, p);
  }
  return LEVEL_CACHE.get(key);
}

/** Level einer kommenden Runde im Hintergrund bauen (z. B. auf dem Ergebnisbildschirm) */
export function vorerzeugen(params) {
  const p = params ? pfadLevel(params) : null;
  if (p) p.catch(() => {});
}

/** Worker beenden — für Tests und beim Verlassen der Seite */
export function terminateWorldWorker() {
  for (const p of pool) p.w.terminate();
  pool = [];
  brokenWorker = false;
  pending.clear();
}
