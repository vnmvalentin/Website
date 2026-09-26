#!/usr/bin/env node
// seedRunners/tools/levelTransfer.js — veröffentlichte Level von einer Datenbank in eine andere bringen (z. B. lokal → Server).
//
//   node seedRunners/tools/levelTransfer.js liste  [--db pfad]                 alle veröffentlichten Level (Code, Name, Ersteller)
//   node seedRunners/tools/levelTransfer.js export CODE [CODE …] [--db pfad]   JSON auf die Standardausgabe
//   node seedRunners/tools/levelTransfer.js import [--db pfad] < datei.json    Level anlegen, die es dort noch nicht gibt
//
// Mitgenommen wird, was ein Level ausmacht: Dokument, Angaben, Vorschau, Ersteller (Konto-ID und Name — auf dem Server dasselbe
// Twitch-Konto) und die Ersteller-Verifizierung samt Geist. NICHT mit: Bestenliste, Spiele, Sterne, Meldungen — die gehören zur
// jeweiligen Datenbank. Der Share-Code bleibt gleich, wenn er dort frei ist; sonst wird das Level übersprungen (nie überschreiben).
// Ein Level, dessen Inhalt es dort schon gibt (gleicher Hash), wird ebenfalls übersprungen.
//
// Passt die Physik des Ziels nicht zur Ersteller-Verifizierung (anderer SIM-Fingerprint), prüft der Server das Level beim Start
// wie jedes andere nach (levelService.reverifyStale) — ein Level, das die neue Physik nicht besteht, wird unsichtbar, bis der
// Ersteller es neu durchspielt.
//
// Standard-Datenbank: Backend/data/seedrunners.db (oder SEEDRUNNERS_DB_PATH), dieselbe wie der laufende Server.
'use strict';

const fs = require('fs');
const path = require('path');
const { createStore } = require('../store');

const FORMAT = 'seedrunners-levels';
const VERSION = 1;

/** Die Level zu den Codes als übertragbare Einträge. @returns {{ levels: object[], fehlend: string[] }} */
function exportiere(store, codes) {
  const L = store.levels;
  const levels = [];
  const fehlend = [];
  for (const raw of codes) {
    const code = String(raw).toUpperCase();
    const l = L.byCode(code);
    if (!l || l.status !== 'published') { fehlend.push(code); continue; }
    const run = L.creatorRun(l.id);
    levels.push({
      code: l.code, accountId: l.accountId, creatorName: l.creatorName, name: l.name, description: l.description, tags: l.tags,
      difficulty: l.difficulty, biome: l.biome, speedClass: l.speedClass, width: l.width, height: l.height, elements: l.elements,
      contentHash: l.contentHash, doc: L.docOf(l.id), preview: l.preview, simFp: run.simFp, creatorTicks: run.ticks,
      creatorDeaths: run.deaths, creatorSplits: run.splits, creatorLog: run.log, createdAt: l.createdAt,
    });
  }
  return { levels, fehlend };
}

const PFLICHT = ['code', 'accountId', 'creatorName', 'name', 'biome', 'speedClass', 'width', 'height', 'contentHash', 'doc', 'simFp', 'creatorTicks', 'creatorLog'];

/** Legt die Level an, die es im Ziel noch nicht gibt. @returns {{ angelegt: string[], uebersprungen: {code, grund}[] }} */
function importiere(store, paket) {
  if (!paket || paket.format !== FORMAT || paket.version !== VERSION || !Array.isArray(paket.levels)) {
    throw new Error(`Keine Level-Datei (erwartet format "${FORMAT}", version ${VERSION}).`);
  }
  const L = store.levels;
  const angelegt = [];
  const uebersprungen = [];
  for (const l of paket.levels) {
    const fehlt = PFLICHT.filter((k) => l[k] === undefined || l[k] === null);
    if (fehlt.length) { uebersprungen.push({ code: l.code || '?', grund: `unvollständig (${fehlt.join(', ')})` }); continue; }
    const vorhanden = L.byCode(l.code);
    if (vorhanden) {
      uebersprungen.push({ code: l.code, grund: vorhanden.contentHash === l.contentHash ? 'gibt es dort schon' : 'Code dort schon vergeben' });
      continue;
    }
    const gleich = L.byHash(l.contentHash);
    if (gleich) { uebersprungen.push({ code: l.code, grund: `derselbe Inhalt existiert dort als ${gleich.code}` }); continue; }
    L.insertLevel({ ...l, createdAt: Number.isFinite(l.createdAt) ? l.createdAt : Date.now() });
    angelegt.push(l.code);
  }
  return { angelegt, uebersprungen };
}

function argumente(argv) {
  const out = { befehl: argv[0], codes: [], db: undefined };
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === '--db') out.db = argv[++i];
    else out.codes.push(argv[i]);
  }
  return out;
}

function main() {
  // Dieselbe .env wie der Server (index.js) — setzt sie SEEDRUNNERS_DB_PATH, landet der Import in derselben Datenbank
  try { require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env'), quiet: true }); } catch { /* ohne dotenv: Standardpfad */ }
  const { befehl, codes, db } = argumente(process.argv.slice(2));
  if (!['liste', 'export', 'import'].includes(befehl)) {
    console.error('Aufruf: levelTransfer.js liste | export CODE … | import < datei.json   [--db pfad]');
    process.exit(2);
  }
  const store = createStore(db);
  try {
    if (befehl === 'liste') {
      const { items } = store.levels.list({ sort: 'new', limit: 500 });
      for (const l of items) console.log(`${l.code}  ${l.name}  (von ${l.creatorName})`);
      if (!items.length) console.log('(keine veröffentlichten Level)');
    } else if (befehl === 'export') {
      if (!codes.length) throw new Error('Welche Level? Codes angeben, z. B.: export SR-ABC-DEF');
      const { levels, fehlend } = exportiere(store, codes);
      if (fehlend.length) throw new Error(`Nicht gefunden oder nicht veröffentlicht: ${fehlend.join(', ')}`);
      process.stdout.write(JSON.stringify({ format: FORMAT, version: VERSION, levels }));
      console.error(`${levels.length} Level exportiert: ${levels.map((l) => `${l.code} „${l.name}“`).join(', ')}`);
    } else {
      const paket = JSON.parse(fs.readFileSync(0, 'utf8'));
      const { angelegt, uebersprungen } = importiere(store, paket);
      for (const c of angelegt) console.log(`angelegt: ${c}`);
      for (const u of uebersprungen) console.log(`übersprungen: ${u.code} — ${u.grund}`);
    }
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  } finally {
    store.close();
  }
}

if (require.main === module) main();

module.exports = { exportiere, importiere, FORMAT, VERSION };
