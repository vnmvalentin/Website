// Worker-Thread des Level-Vorrats (levelVorrat.js): baut ein Pfad-Level und misst, wie abwechslungsreich es ist.
// Gleiches Protokoll wie verifyWorker.js ({ id, job } → { id, result }), damit verifier.js ihn als Warteschlange führen kann.
// Ein eigener Thread neben dem Prüfer: Ein Bau dauert 3–30 s — in der Zeit dürfen keine Lauf-Prüfungen warten.
'use strict';

const path = require('path');
const { pathToFileURL } = require('url');
const { parentPort } = require('worker_threads');

let enginePromise = null;
function loadEngine() {
  if (!enginePromise) {
    const dir = path.join(__dirname, 'engine');
    const load = (rel) => import(pathToFileURL(path.join(dir, rel)).href);
    enginePromise = Promise.all([load('gen/index.js'), load('gen/world/generate.js'), load('gen/world/typen/pfad.js')])
      .then(([gen, welt, pfad]) => ({ ...gen, WELT_BAU: welt.WELT_BAU, WEGE: pfad.WEGE }));
    enginePromise.catch(() => { enginePromise = null; });
  }
  return enginePromise;
}

/**
 * Kennzahlen eines gebauten Pfad-Levels für die Güte-Schwelle (levelVorrat.js `bewerte`):
 *   zuege    gebaute Züge
 *   schlicht Züge ohne Aufgabe (schlichte Sprünge)
 *   folge    längste Folge schlichter Sprünge am Stück
 *   arten    verschiedene Aufgaben
 *   extrem   Extrem-Level (eine Aufgabe trägt das ganze Level, typen/pfad.js)
 */
function kennzahlenVon(engine, level) {
  const bau = engine.WELT_BAU.get(level);
  const weg = bau ? engine.WEGE.get(bau) : null;
  if (!bau || !weg) return null;
  let schlicht = 0;
  let folge = 0;
  let lauf = 0;
  const arten = new Set();
  for (const s of weg.schritte) {
    // (planer.js trägt einen Zug ohne Aufgabe als 'sprung' ein)
    if (s.mechanik && s.mechanik !== 'sprung') { arten.add(s.mechanik); lauf = 0; continue; }
    schlicht++;
    lauf++;
    if (lauf > folge) folge = lauf;
  }
  const n = bau.notizen || {};
  return {
    zuege: weg.schritte.length, schlicht, folge, arten: arten.size, extrem: !!n.extrem,
    form: n.form || '', autor: n.thema || '', leitidee: n.leitidee ? n.leitidee.id : null,
  };
}

async function baue(params) {
  const start = performance.now();
  const engine = await loadEngine();
  const w = engine.weltParams(params);
  if (!w) return { status: 'error', reason: 'Keine Pfad-Parameter.' };
  // Nur die laufende Version: Der Vorrat ist für neue Runden; ältere Versionen baut bei Bedarf der Browser aus dem Archiv
  if (w.gv !== engine.GEN_VERSION) return { status: 'error', reason: `Generator-Version ${w.gv} ist nicht die laufende.` };
  const level = engine.levelFuerParams(params);
  return {
    status: 'ok',
    json: JSON.stringify(level),
    hash: level.hash,
    kennzahlen: kennzahlenVon(engine, level),
    ms: Math.round(performance.now() - start),
  };
}

loadEngine().catch(() => {});

parentPort.on('message', async ({ id, job }) => {
  let result;
  try {
    result = await baue(job);
  } catch (e) {
    result = { status: 'error', reason: String(e && e.message ? e.message : e) };
  }
  parentPort.postMessage({ id, result });
});
