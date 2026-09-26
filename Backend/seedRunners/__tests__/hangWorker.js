// Test-Worker für verifier.test.js: verhält sich je nach Auftrag falsch — hängt, stürzt ab oder antwortet.
// (Kein *.test.js, wird vom Test-Runner also nicht selbst gestartet.)
'use strict';

const { parentPort } = require('worker_threads');

parentPort.on('message', ({ id, job }) => {
  if (job.mode === 'crash') throw new Error('absichtlicher Absturz');
  if (job.mode === 'echo') parentPort.postMessage({ id, result: { status: 'ok', ticks: job.ticks, ms: 1 } });
  // mode 'hang': keine Antwort
});
