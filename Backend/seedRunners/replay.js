// Seed Runners — Anti-Cheat: Einen Lauf aus seinem Input-Log nachspielen und die Zeit prüfen.
//
// Der Server rechnet sonst keine Physik (siehe roomManager.js). Hier tut er es ausnahmsweise, mit
// DERSELBEN Sim wie der Browser (Backend/seedRunners/engine, gespiegelt aus dem Frontend, siehe
// tools/simSpiegel.js): Level aus Seed/Länge/Klasse/Biom erzeugen, das Log abspielen, ins Ziel
// kommen — und zwar auf den Tick genau zur behaupteten Zeit. Weil die Sim deterministisch ist,
// gibt es keine Toleranz: Eine Abweichung heißt, dass Log, Zeit oder Sim nicht zusammenpassen.
//
// Zwei Arten von Aufträgen:
//   Seed-Level     { params, log, ticks, fp }            Das Level entsteht aus Seed/Länge/Klasse/Biom (Raum, Tagesrennen).
//                                                         fp = ENGINE_FINGERPRINT: der Generator bestimmt das Level.
//   Eigenes Level  { kind: 'custom', doc, hash, log, ticks, fp }   Das Level steckt im Dokument (Editor-Verifizierung).
//                                                         fp = SIM_FINGERPRINT: Nur die Physik zählt, eine Änderung am
//                                                         Generator entwertet keinen Lauf. `hash` ist der vom SERVER aus
//                                                         dem Dokument berechnete Inhalts-Hash; der Worker prüft ihn noch einmal.
//
// Läuft im Worker-Thread (verifier.js, verifyWorker.js), nie im Hauptprozess: ein langes Level sind
// hunderttausend Ticks, das gehört nicht auf den Event-Loop, der auch die Räume bedient.
//
// Ergebnis (`status`):
//   ok        Nachgespielt, Zeit und Ziel stimmen. `ticks`, `deaths`, `splits` sind die NACHGERECHNETEN Werte.
//   invalid   Das Log führt nicht zur behaupteten Zeit ins Ziel (`reason`).
//   skipped   Nicht geprüft: Sim-Stand von Browser und Server weicht ab (`reason: 'version'`) —
//             ein Deploy lag dazwischen; der Lauf wird nicht bestraft, aber auch nicht bestätigt.
//   error     Prüfung selbst fehlgeschlagen (Zeitüberschreitung, Ausnahme). Wie skipped behandelt.

'use strict';

const path = require('path');
const { pathToFileURL } = require('url');

// Längster erlaubter Lauf: 40 Minuten. Alles darüber ist kein Rennen (die Raum-Obergrenze für "lang"
// liegt bei 26 Minuten) und würde nur Rechenzeit kosten.
const HARD_MAX_TICKS = 120 * 60 * 40;
// Verifizierungslauf eines eigenen Levels: höchstens 20 Minuten (gemessen: rund 25 µs je Tick auf einem Maximal-Level,
// also 3,6 s Rechenzeit — weit unter der Frist des Prüfers)
const CUSTOM_MAX_TICKS = 120 * 60 * 20;
// (Pfad-Level brauchen einige Sekunden; mehrere Lobbys mit eigenen Runden sollen sich nicht gegenseitig verdrängen)
const LEVEL_CACHE_SIZE = 24;

let enginePromise = null;

/** Lädt die gespiegelte Sim (ES-Module) einmal pro Prozess. */
function loadEngine() {
  if (!enginePromise) {
    const dir = path.join(__dirname, 'engine');
    const load = (rel) => import(pathToFileURL(path.join(dir, rel)).href);
    enginePromise = Promise.all([load('gen/index.js'), load('sim/replay.js'), load('version.js'), load('level/index.js')])
      .then(([gen, replay, version, level]) => ({ ...gen, ...replay, ...version, ...level }));
  }
  return enginePromise;
}

const levelCache = new Map();
const archivCache = new Map();

/**
 * Der Generator einer eingefrorenen Version (engine/archiv/pfad-vN, gespiegelt aus dem Frontend). Ein Zufallslevel ist „Seed +
 * Biom + Generator-Version“: Läufe auf einem Level einer älteren Version (Favorit, vergangenes Tagesrennen) werden mit genau
 * dem Generator nachgespielt, der es damals gebaut hat.
 */
function loadArchiv(gv) {
  if (!Number.isInteger(gv) || gv < 1 || gv > 999) return Promise.reject(new Error(`Ungültige Generator-Version ${gv}`));
  if (!archivCache.has(gv)) {
    const datei = path.join(__dirname, 'engine', 'archiv', `pfad-v${gv}`, 'gen', 'world', 'generate.js');
    const p = import(pathToFileURL(datei).href);
    p.catch(() => archivCache.delete(gv));
    archivCache.set(gv, p);
  }
  return archivCache.get(gv);
}

async function levelFor(engine, params) {
  const key = JSON.stringify(params);
  let level = levelCache.get(key);
  if (level) {
    levelCache.delete(key);          // an das Ende: zuletzt benutzt
  } else {
    // Phase D: Pfad (gen: 'pfad') oder Chunk-Generator v1 — derselbe Einstieg wie im Browser (gen/index.js); eine ältere
    // Generator-Version kommt aus dem Archiv (wie client/generatorArchiv.js im Browser)
    const w = engine.weltParams ? engine.weltParams(params) : null;
    if (w && engine.GEN_VERSION !== undefined && w.gv !== engine.GEN_VERSION) {
      level = (await loadArchiv(w.gv)).generateWorld(engine.ohneGv(w));
    } else {
      level = engine.levelFuerParams ? engine.levelFuerParams(params) : engine.generateLevel(params);
    }
    if (levelCache.size >= LEVEL_CACHE_SIZE) levelCache.delete(levelCache.keys().next().value);
  }
  levelCache.set(key, level);
  return level;
}

const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

/**
 * @param {{ params?: object, kind?: 'custom', doc?: object, hash?: string, log: number[], ticks: number, fp?: string }} job
 *   params  Level-Parameter der Runde { seed, length, speedClass, biome } — vom SERVER, nie vom Client
 *   doc     bei kind 'custom': das (vom Server geprüfte, kanonische) Level-Dokument
 *   hash    bei kind 'custom': sein Inhalts-Hash
 *   log     Input-Log [tick, maske, …]
 *   ticks   behauptete Zielzeit
 *   fp      ENGINE_FINGERPRINT (Seed-Level) bzw. SIM_FINGERPRINT (eigenes Level) des Browsers, siehe tools/simSpiegel.js
 * @param {{ engine?: object, makeLevel?: (params: object) => object }} [opts]  Ersetzungen für Tests
 */
async function verifyRun(job, opts = {}) {
  const started = performance.now();
  const done = (res) => ({ ...res, ms: Math.round(performance.now() - started) });

  const engine = opts.engine || await loadEngine();
  const custom = job.kind === 'custom';
  if (!Array.isArray(job.log) || job.log.length % 2 !== 0) return done({ status: 'invalid', reason: 'Kein gültiges Input-Log.' });
  if (custom && Number.isInteger(job.ticks) && job.ticks > CUSTOM_MAX_TICKS) {
    return done({ status: 'invalid', reason: 'Zeitlimit: Ein Verifizierungslauf darf höchstens 20 Minuten dauern.' });
  }
  if (!isInt(job.ticks, 1, custom ? CUSTOM_MAX_TICKS : HARD_MAX_TICKS)) return done({ status: 'invalid', reason: 'Ungültige Zeit.' });
  if (job.fp !== (custom ? engine.SIM_FINGERPRINT : engine.ENGINE_FINGERPRINT)) return done({ status: 'skipped', reason: 'version' });

  let level;
  if (custom) {
    // Der Server hat das Dokument schon geprüft; hier noch einmal, damit der Worker nie einem Auftrag glaubt, dessen
    // Hash nicht zum Inhalt passt
    const res = engine.validateDoc(job.doc, { smoke: false });
    if (!res.ok) return done({ status: 'invalid', reason: 'Das Level ist ungültig.' });
    if (res.hash !== job.hash) return done({ status: 'invalid', reason: 'Das Level passt nicht zum Hash.' });
    level = res.level;
  } else {
    const params = engine.normalizeParams(job.params);
    try {
      level = opts.makeLevel ? opts.makeLevel(params) : await levelFor(engine, params);
    } catch (e) {
      return done({ status: 'invalid', reason: `Level nicht erzeugbar: ${e.message}` });
    }
  }

  const splits = [];
  const world = engine.createLevelWorld(level, {
    emit: (type, data) => { if (type === 'checkpoint') splits.push([data.index, data.tick]); },
  });
  // Ein Tick mehr als behauptet: Wer erst danach ins Ziel kommt, ist langsamer als angegeben
  const res = engine.runReplay(world, job.log, job.ticks + 1);

  if (!res.finished) return done({ status: 'invalid', reason: 'Das Log führt nicht ins Ziel.' });
  if (res.ticks !== job.ticks) return done({ status: 'invalid', reason: `Zeit weicht ab (nachgerechnet ${res.ticks}, behauptet ${job.ticks}).` });
  return done({ status: 'ok', ticks: res.ticks, deaths: res.deaths, splits });
}

module.exports = { verifyRun, loadEngine, levelFor, HARD_MAX_TICKS, CUSTOM_MAX_TICKS };
