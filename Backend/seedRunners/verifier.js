// Seed Runners — Prüfer: ein Worker-Thread mit Warteschlange für die Replay-Prüfung (replay.js).
//
// Warum ein Worker: Ein Lauf nachzuspielen sind bis zu einige Hunderttausend Sim-Ticks am Stück.
// Auf dem Hauptthread würde das den Event-Loop blockieren, der auch alle Räume und die Bots
// bedient (derselbe Grund, aus dem Blobby einen eigenen Prozess hat). Im Worker läuft es daneben.
//
// Ein Worker genügt: Gemessen kostet ein Tick etwa 14 µs, ein 5-Minuten-Rennen also rund eine halbe
// Sekunde. Die Aufträge laufen nacheinander, mehr als `maxQueue` wartende werden abgewiesen
// (Status 'busy'), statt den Speicher zu füllen.
//
// Ein hängender oder abgestürzter Worker wird beendet und beim nächsten Auftrag neu gestartet;
// der betroffene Auftrag endet mit Status 'error' (Zeitüberschreitung) und wird von den Aufrufern
// wie "nicht geprüft" behandelt, nie als Betrug.
'use strict';

const path = require('path');
const { Worker } = require('worker_threads');

function createVerifier(opts = {}) {
  const workerFile = opts.workerFile || path.join(__dirname, 'verifyWorker.js');
  const timeoutMs = opts.timeoutMs ?? 20000;
  const maxQueue = opts.maxQueue ?? 40;

  let worker = null;
  let current = null;                  // { id, resolve, timer }
  let closed = false;
  let nextId = 1;
  const queue = [];
  const stats = { done: 0, ok: 0, invalid: 0, skipped: 0, errors: 0, timeouts: 0, totalMs: 0, maxMs: 0 };

  function settle(job, result) {
    clearTimeout(job.timer);
    stats.done++;
    if (result.status === 'ok') stats.ok++;
    else if (result.status === 'invalid') stats.invalid++;
    else if (result.status === 'skipped') stats.skipped++;
    else stats.errors++;
    if (typeof result.ms === 'number') {
      stats.totalMs += result.ms;
      stats.maxMs = Math.max(stats.maxMs, result.ms);
    }
    job.resolve(result);
  }

  function dropWorker(reason) {
    const w = worker;
    worker = null;
    if (w) w.terminate().catch(() => {});
    if (current) {
      const job = current;
      current = null;
      settle(job, { status: 'error', reason });
    }
  }

  function spawn() {
    const w = new Worker(workerFile);
    worker = w;
    w.unref();                         // hält den Prozess beim Beenden nicht auf
    w.on('message', ({ id, result }) => {
      if (!current || current.id !== id) return;
      const job = current;
      current = null;
      settle(job, result);
      pump();
    });
    w.on('error', (err) => {
      if (worker !== w) return;
      dropWorker(`Worker-Fehler: ${err.message}`);
      pump();
    });
    w.on('exit', () => {
      if (worker !== w) return;
      dropWorker('Worker beendet.');
      pump();
    });
  }

  function pump() {
    if (closed || current || queue.length === 0) return;
    const item = queue.shift();
    if (!worker) spawn();
    const job = { id: item.id, resolve: item.resolve, timer: null };
    current = job;
    job.timer = setTimeout(() => {
      if (current !== job) return;
      stats.timeouts++;
      dropWorker('Zeitüberschreitung bei der Prüfung.');
      pump();
    }, timeoutMs);
    job.timer.unref?.();
    worker.postMessage({ id: item.id, job: item.data });
  }

  return {
    /** @returns {Promise<{status: string, reason?: string, ticks?: number, deaths?: number, splits?: number[][], ms?: number}>} */
    verify(data) {
      if (closed) return Promise.resolve({ status: 'error', reason: 'Prüfer ist beendet.' });
      if (queue.length >= maxQueue) return Promise.resolve({ status: 'busy', reason: 'Zu viele Prüfungen warten.' });
      return new Promise((resolve) => {
        queue.push({ id: nextId++, data, resolve });
        pump();
      });
    },
    stats() {
      return { ...stats, waiting: queue.length, running: current ? 1 : 0, avgMs: stats.done ? Math.round(stats.totalMs / stats.done) : 0 };
    },
    async close() {
      closed = true;
      for (const item of queue.splice(0)) item.resolve({ status: 'error', reason: 'Prüfer ist beendet.' });
      if (current) {
        const job = current;
        current = null;
        settle(job, { status: 'error', reason: 'Prüfer ist beendet.' });
      }
      const w = worker;
      worker = null;
      if (w) await w.terminate();
    },
  };
}

module.exports = { createVerifier };
