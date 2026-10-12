// tagesArchiv.js — die vergangenen Tagesrennen. Gespeichert wird dafür nichts: Das Level eines Tages entsteht allein aus seinem
// Datum (Seed „daily-JJJJ-MM-TT“, Pfad-Generator in der eingefrorenen Version des Tages, gen/generator.js: dailyParams). Damit
// ist jeder vergangene Tag jederzeit genau dasselbe Level — bewertbar, als Favorit merkbar und in jeder Lobby spielbar.
//
// Das Archiv beginnt mit dem ersten Pfad-Tagesrennen (PFAD_TAGESRENNEN_AB). Die Chunk-Tage davor haben keine Level-Referenz
// (ui/levelRef.js) und bleiben draußen. Die Rangliste eines Archiv-Tages ist fest: Läufe, die später (Solo im Archiv oder in
// einer Lobby) auf dem Level gespielt werden, ändern sie nicht mehr (Backend/seedRunners/daily.js).
import { PFAD_TAGESRENNEN_AB, dailyParams } from '../gen/generator.js';
import { refForParams } from './levelRef.js';

export const ARCHIV_AB = PFAD_TAGESRENNEN_AB;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Kalendertag in Berlin — derselbe Schlüssel wie das Backend (Backend/seedRunners/dateKey.js) */
export function berlinDateKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function previousDay(dateKey) {
  const d = new Date(`${dateKey}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Ist das ein Archiv-Tag (ab ARCHIV_AB, vor heute)? */
export function isArchivTag(dateKey, today = berlinDateKey()) {
  return typeof dateKey === 'string' && DATE_RE.test(dateKey) && dateKey >= ARCHIV_AB && dateKey < today;
}

/** Alle Archiv-Tage, der jüngste zuerst (gestern … ARCHIV_AB) */
export function archivTage(today = berlinDateKey()) {
  const tage = [];
  for (let d = previousDay(today); d >= ARCHIV_AB && tage.length < 5000; d = previousDay(d)) tage.push(d);
  return tage;
}

/** Level-Referenz eines Tages (für Sterne, Favorit und die Lobby) */
export const tagesRef = (dateKey) => refForParams(dailyParams(dateKey));

export const germanDate = (dateKey) => dateKey.split('-').reverse().join('.');
