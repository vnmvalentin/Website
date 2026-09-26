// Seed Runners — gemeinsamer Betriebszustand des Servers: Speicher, Prüfer (Worker-Thread) und
// Tagesrangliste, einmal pro Prozess. Sowohl die Socket-Räume (routes/seedRunnersRoutes.js) als auch
// die HTTP-Schnittstelle (seedRunners/routes.js) greifen hierauf zu, damit ein Lauf aus dem Raum und
// einer von der Tagesseite in dieselbe Liste und durch denselben Prüfer laufen.
'use strict';

const { createStore } = require('./store');
const { createVerifier } = require('./verifier');
const { createDailyService, dailyDateOf, dailyKeyFromToken, previousDay } = require('./daily');
const { createLevelVerifyService } = require('./levelVerify');
const { createLevelService } = require('./levelService');
const { todayDateKey } = require('../dle/core/dailySeed');

// Logs älterer Tage sind nur noch Beweisstücke ohne Nutzen; die Einträge selbst bleiben
const KEEP_LOGS_DAYS = 14;
// Die Neu-Prüfung nach einer Änderung der Physik startet erst kurz nach dem Serverstart: Der Start soll nicht auf Nachspielen warten
const REVERIFY_DELAY_MS = 20000;

let runtime = null;

function getRuntime() {
  if (runtime) return runtime;
  const store = createStore();
  const verifier = createVerifier();
  const daily = createDailyService({ store, verifier, todayKey: todayDateKey });
  const levelVerify = createLevelVerifyService({ store, verifier });
  const levelService = createLevelService({ store, verifier });

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

  runtime = {
    store,
    reverifyTimer,
    verifier,
    daily,
    levelVerify,
    levelService,
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
  await rt.verifier.close();
  rt.store.close();
}

module.exports = { getRuntime, closeRuntime };
