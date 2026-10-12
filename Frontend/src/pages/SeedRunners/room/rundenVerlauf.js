// rundenVerlauf.js — die letzten Mehrspieler-Runden dieses Browsers, damit ein Level auch nach dem Ergebnis-Bildschirm noch
// gemerkt oder wieder gespielt werden kann. Nur im Browser gespeichert (bewusst kein Server: 27.09.2026), höchstens VERLAUF_MAX
// Einträge — genau so viele, wie der Server in einer Sterne-Abfrage beantwortet (Backend levelService LOOKUP_MAX).
//
// Ein Eintrag: { id, at, ref, info?, custom?, place, total, ticks, dnf, winner }
//   ref     Level-Referenz (ui/levelRef.js) — ohne Referenz (alte Chunk-Runden) wird nichts gespeichert
//   info    { leitidee, autor } eines Zufallslevels, kommt nach, sobald das Level gebaut ist
//   custom  { name, creatorName } eines Community-Levels
// Der Lobby-Code steht bewusst NICHT darin (Streamer-Schutz, room/raumCode.js).
import { refKey } from '../ui/levelRef.js';

const KEY = 'seedrunners_verlauf';
export const VERLAUF_MAX = 50;

const listeners = new Set();
let cache = null;

function read() {
  if (cache) return cache;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    cache = Array.isArray(raw) ? raw.filter((e) => e && typeof e.id === 'string' && e.ref && typeof e.at === 'number') : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(list) {
  cache = list.slice(0, VERLAUF_MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch { /* Speicher gesperrt: gilt nur für diese Sitzung */ }
  listeners.forEach((fn) => fn());
}

export const getVerlauf = () => read();

export function subscribeVerlauf(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Runde eintragen oder (gleiche id) ergänzen — neueste zuerst */
export function merkeRunde(entry) {
  if (!entry?.id || !entry.ref) return;
  const list = read();
  const alt = list.find((e) => e.id === entry.id);
  const neu = alt ? { ...alt, ...entry, at: alt.at } : entry;
  write([neu, ...list.filter((e) => e.id !== entry.id)]);
}

export function entferneRunde(id) {
  write(read().filter((e) => e.id !== id));
}

export function leereVerlauf() {
  write([]);
}

/**
 * Eintrag zu einer Runde aus dem Raum-Zustand (Results.jsx). id aus Startzeit und Level: eindeutig je Runde, auch wenn
 * dieselbe Rundennummer in einem anderen Raum wiederkommt.
 */
export function eintragAusRunde({ round, results, meId, ref, info }) {
  if (!round || !ref) return null;
  const me = (results || []).find((r) => r.id === meId);
  const winner = (results || []).find((r) => !r.dnf);
  return {
    id: `${round.startAt || 0}:${refKey(ref)}`,
    at: Date.now(),
    ref,
    ...(info && Object.keys(info).length ? { info } : {}),
    ...(round.kind === 'custom' && round.custom ? { custom: { name: round.custom.name, creatorName: round.custom.creatorName } } : {}),
    daily: round.kind === 'daily' || undefined,
    place: me && !me.dnf ? me.place : null,
    total: (results || []).length,
    ticks: me && !me.dnf && !me.invalid ? me.ticks : null,
    dnf: !!me?.dnf,
    winner: winner ? winner.name : null,
  };
}
