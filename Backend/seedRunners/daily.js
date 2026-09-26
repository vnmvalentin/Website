// Seed Runners — Tagesrennen: Regeln der Tages-Rangliste.
//
// Das Tages-Level ist für alle gleich (Seed "daily-JJJJ-MM-TT", mittel, Normal, Biom aus dem Seed).
// Ein Eintrag entsteht nur aus einem GEPRÜFTEN Lauf: Der Server spielt das Input-Log nach (verifier.js)
// und glaubt die Zeit erst, wenn das Nachspielen auf den Tick genau ins Ziel führt. Wer nur eine Zahl
// schickt oder ein manipuliertes Log, kommt nicht in die Liste.
//
// Zwei Wege führen hinein:
//   solo   Die Seite /seed-runners/daily schickt Zeit + Log (submit): Hier wird geprüft.
//   raum   Ein Mehrspieler-Raum spielt das Tages-Level: Der Raum hat die Läufe schon geprüft und
//          meldet sie über recordVerified().
//
// Identität: ein Schlüssel, den der Browser aus seinem Token ableitet (sha256("sr-daily:" + Token)).
// Derselbe Mensch erscheint so über Solo und Raum hinweg einmal pro Tag, und das Token selbst
// (die Raum-Identität) verlässt den Browser nur Richtung Socket, nie in eine URL.
//
// Grenzen: Die Prüfung macht gefälschte Zeiten unmöglich, keine per Programm gespielten Läufe (ein
// Bot, der echte Eingaben erzeugt, besteht sie). Das ist bei einer freundschaftlichen Rangliste
// ohne Preis eine bewusste Grenze.
'use strict';

const crypto = require('crypto');

const NAME_MAX = 24;
const KEY_RE = /^[a-f0-9]{32,64}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_LOG_NUMBERS = 60000;
const MAX_SPLITS = 200;
// So lange nach Mitternacht (Berliner Zeit) darf noch ein Lauf des Vortages eingereicht werden
const GRACE_HOURS = 2;
const FP_RE = /^[A-Za-z0-9]{1,40}$/;

const cleanName = (raw) => String(raw ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX) || 'Anonym';
const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

/** Die Parameter des Tages-Levels — müssen zu roomManager.roundParams passen. */
// Phase D: Ab PFAD_AB ist das Tagesrennen ein Pfad-Level (lang, „super“) — muss zu Frontend gen/generator.js
// (PFAD_TAGESRENNEN_AB, dailyParams) passen. Frühere Tage bleiben beim Chunk-Generator: Ihre Bestzeiten bleiben gültig.
const PFAD_AB = '2026-09-26';
const dailyParams = (dateKey) => (dateKey >= PFAD_AB
  ? { seed: `daily-${dateKey}`, length: 'long', speedClass: 'super', biome: 'random', gen: 'pfad', gv: 1 }
  : { seed: `daily-${dateKey}`, length: 'medium', speedClass: 'normal', biome: 'random' });

/** Ist dies das Tages-Level eines Tages? Gibt den Datumsschlüssel zurück oder null. */
function dailyDateOf(params) {
  const m = /^daily-(\d{4}-\d{2}-\d{2})$/.exec(String(params?.seed ?? ''));
  if (!m) return null;
  // (genau die Parameter dieses Tages — alt oder Pfad, je nach Datum)
  const soll = dailyParams(m[1]);
  return ['length', 'speedClass', 'biome', 'gen', 'gv'].every((k) => params[k] === soll[k]) ? m[1] : null;
}

const dailyKeyFromToken = (token) => crypto.createHash('sha256').update(`sr-daily:${token}`).digest('hex');

function previousDay(dateKey) {
  const d = new Date(`${dateKey}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

const berlinHour = (ms) =>
  Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', hourCycle: 'h23' }).format(new Date(ms)));

function cleanLog(raw) {
  if (!Array.isArray(raw) || raw.length % 2 !== 0 || raw.length > MAX_LOG_NUMBERS) return null;
  for (let i = 0; i < raw.length; i++) if (!isInt(raw[i], 0, 10 ** 8)) return null;
  return raw;
}

function cleanSplits(raw) {
  if (!Array.isArray(raw) || raw.length > MAX_SPLITS) return [];
  return raw.filter((s) => Array.isArray(s) && s.length === 2 && isInt(s[0], 1, 9999) && isInt(s[1], 1, 10 ** 8));
}

/**
 * @param {{ store: object, verifier: { verify: Function }, todayKey: () => string, now?: () => number,
 *           paramsFor?: (dateKey: string) => object }} deps
 *   paramsFor  Level-Parameter des Tages (Standard: dailyParams); Tests und der Ende-zu-Ende-Lauf setzen hier ein
 *              kurzes Level ein
 */
function createDailyService(deps) {
  const { store, verifier, todayKey } = deps;
  const now = deps.now || Date.now;
  const paramsFor = deps.paramsFor || dailyParams;

  /** Darf für diesen Tag noch etwas eingereicht werden? Heute immer, gestern kurz nach Mitternacht. */
  function acceptsDay(dateKey) {
    const today = todayKey();
    if (dateKey === today) return true;
    return dateKey === previousDay(today) && berlinHour(now()) < GRACE_HOURS;
  }

  const publicEntry = (e) => ({ rank: e.rank, name: e.name, ticks: e.ticks, deaths: e.deaths });

  const api = {
    dailyParams: paramsFor,

    board(dateKey, limit = 50) {
      return {
        dateKey,
        params: paramsFor(dateKey),
        total: store.count(dateKey),
        entries: store.getBoard(dateKey, limit).map(publicEntry),
      };
    },

    /** Eigener Eintrag und Platz (oder null) */
    me(dateKey, playerKey) {
      if (!KEY_RE.test(String(playerKey || ''))) return null;
      const run = store.getRun(dateKey, playerKey);
      if (!run) return null;
      return { name: run.name, ticks: run.ticks, deaths: run.deaths, rank: store.rankOf(dateKey, run.ticks, run.createdAt) };
    },

    /**
     * Ein Lauf des Tages-Levels, schon geprüft (aus einem Raum). Speichert, wenn er besser ist als der bisherige.
     * @returns {{ saved: boolean, rank: number|null }}
     */
    recordVerified({ dateKey, playerKey, name, ticks, deaths, splits, log, fp, source }) {
      if (!KEY_RE.test(playerKey) || !DATE_RE.test(dateKey)) return { saved: false, rank: null };
      const createdAt = now();
      const saved = store.saveRun({
        dateKey, playerKey, playerName: cleanName(name), ticks, deaths, splits: cleanSplits(splits),
        log: cleanLog(log), simFp: fp, source, createdAt,
      });
      const run = store.getRun(dateKey, playerKey);
      return { saved, rank: run ? store.rankOf(dateKey, run.ticks, run.createdAt) : null };
    },

    /**
     * Ein Lauf von der Tagesseite: prüfen, dann speichern.
     * @returns {Promise<{ status: 'ok'|'nicht-besser'|'abgelehnt'|'ungeprueft'|'busy'|'fehler'|'ungueltig', reason?: string, rank?: number, best?: object }>}
     */
    async submit(input) {
      const { dateKey, playerKey } = input;
      if (!DATE_RE.test(String(dateKey))) return { status: 'ungueltig', reason: 'Ungültiges Datum.' };
      if (!KEY_RE.test(String(playerKey || ''))) return { status: 'ungueltig', reason: 'Ungültiger Spielerschlüssel.' };
      if (!acceptsDay(dateKey)) return { status: 'ungueltig', reason: 'Der Tag ist vorbei — lade die Seite neu für das heutige Level.' };
      if (!isInt(input.ticks, 60, 10 ** 8) || !isInt(input.deaths ?? 0, 0, 99999)) return { status: 'ungueltig', reason: 'Ungültige Zeit.' };
      const log = cleanLog(input.log);
      if (!log) return { status: 'ungueltig', reason: 'Ungültiges Input-Log.' };
      const fp = FP_RE.test(String(input.fp || '')) ? String(input.fp) : '';

      const existing = store.getRun(dateKey, playerKey);
      if (existing && existing.ticks <= input.ticks) {
        return { status: 'nicht-besser', best: { ticks: existing.ticks, deaths: existing.deaths }, rank: store.rankOf(dateKey, existing.ticks, existing.createdAt) };
      }

      const verdict = await verifier.verify({ params: paramsFor(dateKey), log, ticks: input.ticks, fp });
      if (verdict.status === 'invalid') return { status: 'abgelehnt', reason: verdict.reason };
      if (verdict.status === 'skipped') return { status: 'ungeprueft', reason: 'Deine Seite ist nicht auf dem Stand des Servers — bitte neu laden und den Lauf wiederholen.' };
      if (verdict.status === 'busy') return { status: 'busy', reason: 'Der Server prüft gerade viele Läufe. Versuch es gleich noch einmal.' };
      if (verdict.status !== 'ok') return { status: 'fehler', reason: 'Die Prüfung ist fehlgeschlagen. Versuch es gleich noch einmal.' };

      const rec = api.recordVerified({
        dateKey, playerKey, name: input.name, ticks: verdict.ticks, deaths: verdict.deaths, splits: verdict.splits,
        log, fp, source: 'solo',
      });
      const run = store.getRun(dateKey, playerKey);
      return { status: 'ok', rank: rec.rank, entry: run ? { name: run.name, ticks: run.ticks, deaths: run.deaths } : null };
    },
  };
  return api;
}

module.exports = { createDailyService, dailyParams, dailyDateOf, dailyKeyFromToken, previousDay, cleanName };
