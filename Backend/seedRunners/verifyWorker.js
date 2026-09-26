// Worker-Thread der Replay-Prüfung (siehe verifier.js). Nimmt Aufträge { id, job } entgegen, rechnet sie
// mit replay.js nach und antwortet mit { id, result }. Ein Auftrag nach dem anderen — die CPU-Arbeit
// soll den Hauptprozess (Räume, Socket.io, Bots) nie berühren.
'use strict';

const { parentPort } = require('worker_threads');
const { verifyRun, loadEngine } = require('./replay');

// Sim schon beim Start laden, damit der erste Auftrag nicht die Ladezeit mitbezahlt
loadEngine().catch(() => {});

parentPort.on('message', async ({ id, job }) => {
  let result;
  try {
    result = await verifyRun(job);
  } catch (e) {
    result = { status: 'error', reason: String(e && e.message ? e.message : e) };
  }
  parentPort.postMessage({ id, result });
});
