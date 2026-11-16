// Seed Runners — gemeinsamer Betriebszustand des Servers: Speicher, Prüfer (Worker-Thread) und
// Tagesrangliste, einmal pro Prozess. Sowohl die Socket-Räume (seedRunners/socket.js) als auch
// die HTTP-Schnittstelle (seedRunners/routes.js) greifen hierauf zu, damit ein Lauf aus dem Raum und
// einer von der Tagesseite in dieselbe Liste und durch denselben Prüfer laufen.
'use strict';

const { createStore } = require('./store');
const { loadEngine } = require('./replay');
const { createVerifier } = require('./verifier');
const { createDailyService, dailyDateOf, dailyKeyFromToken, previousDay } = require('./daily');
const { createLevelVerifyService } = require('./levelVerify');
const { createLevelService } = require('./levelService');
const { createLevelVorrat, STANDARD: VORRAT_STANDARD } = require('./levelVorrat');
const { PFAD_GEN_VERSION } = require('./genVersion');
const { todayDateKey } = require('./dateKey');
const path = require('path');

// Logs älterer Tage sind nur noch Beweisstücke ohne Nutzen; die Einträge selbst bleiben
const KEEP_LOGS_DAYS = 14;
// Die Neu-Prüfung nach einer Änderung der Physik startet erst kurz nach dem Serverstart: Der Start soll nicht auf Nachspielen warten
const REVERIFY_DELAY_MS = 20000;
// Ein Level-Bau dauert bis zu einer halben Minute, auf dem Server länger — großzügige Frist, wenige Wartende
const VORRAT_BAU_TIMEOUT_MS = 180000;

/** Größe des Level-Vorrats: SEEDRUNNERS_VORRAT (0 = aus), sonst der Standard aus levelVorrat.js */
function vorratZiel() {
  const roh = process.env.SEEDRUNNERS_VORRAT;
  if (roh === undefined || roh === '') return VORRAT_STANDARD.ZIEL;
  const n = Number(roh);
  return Number.isInteger(n) && n >= 0 && n <= 200 ? n : VORRAT_STANDARD.ZIEL;
}

function nextDay(dateKey) {
  const d = new Date(`${dateKey}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

let runtime = null;

function getRuntime() {
  if (runtime) return runtime;
  const store = createStore();
  const verifier = createVerifier();
  const daily = createDailyService({ store, verifier, todayKey: todayDateKey });
  const levelVerify = createLevelVerifyService({ store, verifier });
  const levelService = createLevelService({ store, verifier });

  // Level-Vorrat (levelVorrat.js): vorgebaute Zufallslevel und das Tages-Level, gebaut in einem EIGENEN Worker-Thread —
  // dieselbe Warteschlange wie der Prüfer, nur mit dem Bau-Worker. Fällt er aus, bauen die Browser wie bisher selbst.
  const bauer = createVerifier({ workerFile: path.join(__dirname, 'vorratWorker.js'), timeoutMs: VORRAT_BAU_TIMEOUT_MS, maxQueue: 4 });
  const vorrat = createLevelVorrat({
    db: store.db,
    baue: (params) => bauer.verify(params),
    gv: PFAD_GEN_VERSION,
    heute: todayDateKey,
    config: { ZIEL: vorratZiel() },
    log: (text) => console.log(`[seed-runners] ${text}`),
  });
  vorrat.starte();

  let cutoff = todayDateKey();
  for (let i = 0; i < KEEP_LOGS_DAYS; i++) cutoff = previousDay(cutoff);
  store.pruneLogs(cutoff);

  // Nach einer Änderung der Physik: Ersteller-Läufe und Bestenlisten mit der neuen Physik nachspielen (levelService.reverifyStale).
  // Ohne veraltete Einträge ist das nur eine leere Abfrage.
  const reverifyTimer = setTimeout(() => {
    levelService.reverifyStale()
      .then((summary) => {
        if (summary.levels.checked || summary.runs.checked) console.log('[seed-runners] Neu-Prüfung nach Physik-Änderung:', JSON.stringify(summary));
      })
      .catch((e) => console.error('[seed-runners] Neu-Prüfung fehlgeschlagen:', e));
  }, REVERIFY_DELAY_MS);
  reverifyTimer.unref?.();

  // Das Tages-Level im Prüf-Worker vorab bauen (beim Start und nach jedem Tageswechsel): Der Bau dauert je nach Seed
  // bis zu einigen zehn Sekunden — das soll nicht der erste Spieler des Tages beim Einreichen abwarten müssen. Der
  // Auftrag ist ein absichtlich ungültiger Lauf; er dient nur dazu, dass der Worker das Level in seinem Speicher hat.
  let vorgewaermt = null;
  const tagesLevelVorbauen = () => {
    const key = todayDateKey();
    // Für die Browser in den Vorrat: heute und schon morgen (um Mitternacht liegt es dann bereit; ausgeliefert wird es
    // erst ab seinem Tag). Bei jedem Takt erneut versucht — liegt es schon da, ist das nur eine Abfrage.
    vorrat.tagVorbauen(daily.dailyParams(key))
      .then(() => vorrat.tagVorbauen(daily.dailyParams(nextDay(key))))
      .catch((e) => console.error('[seed-runners] Tages-Level in den Vorrat:', e));
    if (key === vorgewaermt) return;
    vorgewaermt = key;
    loadEngine()
      .then((engine) => verifier.verify({ params: daily.dailyParams(key), log: [0, 0], ticks: 60, fp: engine.ENGINE_FINGERPRINT }))
      .catch((e) => console.error('[seed-runners] Tages-Level vorbauen:', e));
  };
  tagesLevelVorbauen();
  const vorbauTimer = setInterval(tagesLevelVorbauen, 5 * 60 * 1000);
  vorbauTimer.unref?.();

  runtime = {
    store,
    reverifyTimer,
    vorbauTimer,
    verifier,
    daily,
    levelVerify,
    levelService,
    vorrat,
    bauer,
    todayKey: todayDateKey,
    dailyDateOf,
    /** Für den Raum-Manager: Prüfung mit Protokoll der Fehlschläge */
    async verify(job) {
      const res = await verifier.verify(job);
      if (res.status === 'invalid') console.warn(`[seed-runners] Lauf nicht bestätigt: ${res.reason}`);
      else if (res.status === 'error' || res.status === 'busy') console.warn(`[seed-runners] Prüfung nicht möglich: ${res.status} ${res.reason || ''}`);
      return res;
    },
    /** Ein im Raum geprüfter Lauf des Tages-Levels kommt in die Tagesrangliste */
    onVerifiedRun(run) {
      daily.recordVerified({ ...run, playerKey: dailyKeyFromToken(run.token), source: 'raum' });
    },
  };
  return runtime;
}

/** Nur für Tests und sauberes Beenden */
async function closeRuntime() {
  if (!runtime) return;
  const rt = runtime;
  runtime = null;
  clearTimeout(rt.reverifyTimer);
  clearInterval(rt.vorbauTimer);
  rt.vorrat.close();
  await rt.bauer.close();
  await rt.verifier.close();
  rt.store.close();
}

module.exports = { getRuntime, closeRuntime };
