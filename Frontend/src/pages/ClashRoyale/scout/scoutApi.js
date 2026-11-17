// scoutApi.js — Abruf der Stats-Daten (/api/clash/scout, Backend/clashRoyale/scout/) und was der Browser sich
// merkt: zuletzt angesehene Spieler/Clans und Favoriten (localStorage, ohne Login).
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

const BASE = '/api/clash/scout';

/** Spieler-/Clan-Tag aus einer Eingabe: Großbuchstaben, ohne #, O als 0. null, wenn es kein gültiger Tag ist. */
export function parseTag(raw) {
  const tag = String(raw || '').trim().toUpperCase().replace(/^#/, '').replace(/O/g, '0');
  return /^[0289PYLQGRJCUV]{3,12}$/.test(tag) ? tag : null;
}

// Bis wann das Abruf-Kontingent dieses Besuchers aufgebraucht ist (Server: retryAt bei 429, scoutRoutes.js) und ob eine
// Anmeldung mit Twitch oder Discord mehr Spielraum gäbe. Gilt seitenweit: das Kontingent hängt am Besucher, nicht an der Seite.
let limit = { until: 0, login: false };
/** { until, login } solange das Kontingent erschöpft ist, sonst null */
export const currentLimit = () => (limit.until > Date.now() ? limit : null);

/** GET; liefert immer ein Objekt { ok, … } — Netz- und Serverfehler werden zu { ok: false, key }. */
export async function scoutGet(path, { signal } = {}) {
  try {
    const res = await fetch(BASE + path, { signal });
    const json = await res.json().catch(() => null);
    if (json?.ok === false && Number(json.retryAt) > 0) limit = { until: Number(json.retryAt), login: json.login === true };
    if (json && typeof json.ok === 'boolean') return json;
    return { ok: false, key: res.status === 429 ? 'rateLimited' : 'apiDown' };
  } catch (err) {
    if (err?.name === 'AbortError') return { ok: false, key: 'aborted' };
    return { ok: false, key: 'offline' };
  }
}

/**
 * Daten zu einem Pfad laden.
 * @param {string|null} path       null = nichts laden
 * @param {number} [refreshMs]     so oft still neu laden, solange der Tab sichtbar ist
 * @returns {{ data: object|null, error: string|null, loading: boolean, refreshing: boolean, reload: Function }}
 */
export function useScout(path, refreshMs = 0) {
  const [state, setState] = useState({ path: null, data: null, error: null });
  const [refreshing, setRefreshing] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const ctrl = useRef(null);
  const shown = useRef(null); // Pfad, zu dem gerade Daten angezeigt werden

  const load = useCallback((quiet) => {
    if (!path) return;
    ctrl.current?.abort();
    const mine = new AbortController();
    ctrl.current = mine;
    if (quiet) setRefreshing(true); else setRetrying(true);
    scoutGet(path, { signal: mine.signal }).then((json) => {
      if (mine.signal.aborted) return;
      setRefreshing(false);
      setRetrying(false);
      if (json.ok) {
        shown.current = path;
        setState({ path, data: json, error: null });
      } else if (!quiet) {
        // Stilles Nachladen darf vorhandene Daten nicht durch einen Fehler ersetzen
        shown.current = null;
        setState({ path, data: null, error: json.key || 'apiDown' });
      }
    });
  }, [path]);

  useEffect(() => {
    load(false);
    return () => ctrl.current?.abort();
  }, [load]);

  useEffect(() => {
    if (!path || !refreshMs) return undefined;
    const id = setInterval(() => { if (!document.hidden) load(true); }, refreshMs);
    return () => clearInterval(id);
  }, [path, refreshMs, load]);

  const current = state.path === path;
  return {
    data: current ? state.data : null,
    error: current ? state.error : null,
    loading: !!path && (!current || (retrying && !state.data)),
    refreshing,
    // Mit Daten auf dem Schirm still auffrischen; nach einem Fehler sichtbar neu laden
    reload: useCallback(() => load(shown.current === path), [load, path]),
  };
}

// ── Zuletzt angesehen + Favoriten ────────────────────────────────────────────
// Einträge: { kind: 'player' | 'clan', tag, name, sub } — sub ist eine kurze Zusatzzeile (Trophäen, Mitglieder).
const RECENT_KEY = 'crs_recent_v1';
const FAV_KEY = 'crs_fav_v1';
const RECENT_MAX = 8;
const FAV_MAX = 24;

const listeners = new Set();
const snapshots = {};
function read(key) {
  if (snapshots[key]) return snapshots[key];
  let list = [];
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]');
    if (Array.isArray(parsed)) list = parsed.filter((e) => e && e.tag && (e.kind === 'player' || e.kind === 'clan'));
  } catch { /* leer */ }
  snapshots[key] = list;
  return list;
}
function write(key, list) {
  snapshots[key] = list;
  try { localStorage.setItem(key, JSON.stringify(list)); } catch { /* privater Modus: gilt dann nur für die Sitzung */ }
  listeners.forEach((fn) => fn());
}
const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const same = (a, b) => a.kind === b.kind && a.tag === b.tag;

export function rememberRecent(entry) {
  if (!entry?.tag) return;
  const rest = read(RECENT_KEY).filter((e) => !same(e, entry));
  write(RECENT_KEY, [entry, ...rest].slice(0, RECENT_MAX));
  // Favoriten zeigen Namen und Zusatzzeile vom letzten Besuch
  const favs = read(FAV_KEY);
  if (favs.some((e) => same(e, entry) && (e.name !== entry.name || e.sub !== entry.sub))) {
    write(FAV_KEY, favs.map((e) => (same(e, entry) ? entry : e)));
  }
}

export function toggleFavorite(entry) {
  const favs = read(FAV_KEY);
  write(FAV_KEY, favs.some((e) => same(e, entry)) ? favs.filter((e) => !same(e, entry)) : [entry, ...favs].slice(0, FAV_MAX));
}

const EMPTY = [];
export function useSaved() {
  const recent = useSyncExternalStore(subscribe, () => read(RECENT_KEY), () => EMPTY);
  const favorites = useSyncExternalStore(subscribe, () => read(FAV_KEY), () => EMPTY);
  return { recent, favorites, isFavorite: (kind, tag) => favorites.some((e) => e.kind === kind && e.tag === tag) };
}
