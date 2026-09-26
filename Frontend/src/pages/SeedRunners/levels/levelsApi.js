// levelsApi.js — API-Client der veröffentlichten Level (/api/seed-runners/levels, /creators). Gleiches Muster wie dailyApi.js und
// levelApi.js: Der Server antwortet bei Ablehnungen mit Statuscodes ≠ 200, der Body trägt trotzdem { status, reason } — die Seite
// zeigt den Grund, deshalb wird er hier nicht als Fehler verschluckt. Die Anmeldung läuft über das Session-Cookie.
import { getDailyKey } from '../room/identity.js';

async function apiFetch(path, opts = {}) {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, code: res.status, json };
}

const BASE = '/api/seed-runners';
const enc = encodeURIComponent;

/** Ergebnis einer Aktion: der Body mit `status`; ohne Body ein Fehlerstatus (Netz, Server) */
function actionResult(res) {
  if (res.code === 401) return { status: 'anmeldung', reason: 'Du bist nicht angemeldet.' };
  if (res.json?.status) return res.json;
  return { status: 'fehler', reason: res.json?.error || `HTTP ${res.code}` };
}
const offline = { status: 'fehler', reason: 'Keine Verbindung zum Server.' };

/** Der Schlüssel für Gäste (aus dem Browser-Token); null ohne crypto.subtle (unsichere Verbindung) */
export const playerKey = () => getDailyKey();

/**
 * Liste für den Browser. params: { sort, q, tag, difficulty, speed, page, limit, mine }
 * @returns {Promise<{ items: object[], total: number, page: number, pages: number }>}
 */
export async function listLevels(params = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '' && v !== false) qs.set(k, v === true ? '1' : String(v));
  const res = await apiFetch(`${BASE}/levels?${qs}`);
  if (!res.ok) throw new Error(res.json?.reason || res.json?.error || `HTTP ${res.code}`);
  return res.json;
}

/** Ein Level mit Bestenliste; `null`, wenn es das nicht gibt (oder nicht sichtbar ist) */
export async function getLevel(code) {
  const key = await playerKey();
  const res = await apiFetch(`${BASE}/levels/${enc(code)}`, { headers: key ? { 'X-Player-Key': key } : {} });
  if (res.code === 404) return null;
  if (!res.ok) throw new Error(res.json?.reason || `HTTP ${res.code}`);
  return res.json;
}

/** Das Dokument zum Spielen: { hash, doc } oder null */
export async function getLevelDoc(code) {
  const res = await apiFetch(`${BASE}/levels/${enc(code)}/doc`);
  if (res.code === 404) return null;
  if (!res.ok) throw new Error(res.json?.reason || `HTTP ${res.code}`);
  return res.json;
}

/** Ein Geist: { name, ticks, deaths, simFp, log } oder null. `which`: 'creator' oder die runId */
export async function getGhost(code, which) {
  const res = await apiFetch(`${BASE}/levels/${enc(code)}/ghost/${enc(which)}`);
  return res.ok ? res.json : null;
}

export async function getCreator(id) {
  const res = await apiFetch(`${BASE}/creators/${enc(id)}`);
  if (res.code === 404) return null;
  if (!res.ok) throw new Error(res.json?.reason || `HTTP ${res.code}`);
  return res.json;
}

/** Ein Versuch beginnt (zählt Spiele). Fehler bleiben still: Es ist nur Statistik. */
export async function beginAttempt(code) {
  try {
    const key = await playerKey();
    await apiFetch(`${BASE}/levels/${enc(code)}/play`, { method: 'POST', body: JSON.stringify({ playerKey: key }) });
  } catch { /* egal */ }
}

/** Lauf einsenden: { ticks, log, fp, name }. Antwort mit status 'ok' | 'nicht-besser' | 'abgelehnt' | 'ungeprueft' | … */
export async function submitRun(code, { ticks, log, fp, name }) {
  try {
    const key = await playerKey();
    return actionResult(await apiFetch(`${BASE}/levels/${enc(code)}/submit`, { method: 'POST', body: JSON.stringify({ playerKey: key, name, ticks, log, fp }) }));
  } catch {
    return offline;
  }
}

/** Der Ersteller spielt sein Level neu durch (nach einer Physik-Änderung oder für eine bessere Ersteller-Zeit) */
export async function reverifyOwnLevel(code, { ticks, log, fp }) {
  try {
    return actionResult(await apiFetch(`${BASE}/levels/${enc(code)}/reverify`, { method: 'POST', body: JSON.stringify({ ticks, log, fp }) }));
  } catch {
    return offline;
  }
}

/** Veröffentlichen: { doc, hash }. Antwort { status: 'ok', code } oder ein Grund */
export async function publishLevel({ doc, hash }) {
  try {
    return actionResult(await apiFetch(`${BASE}/levels/publish`, { method: 'POST', body: JSON.stringify({ doc, hash }) }));
  } catch {
    return offline;
  }
}

// ── Sterne und Favoriten ──
// Ein Level wird über seine Referenz angesprochen: { kind: 'custom', code } (veröffentlicht) oder { kind: 'pfad', seed, biome }
// (ein Zufallslevel — siehe ui/levelRef.js). Ohne Login zählt der Spielerschlüssel aus dem Browser; wer angemeldet ist, dem
// schreibt der Server Sterne und Favoriten aufs Konto (auch die, die dieser Browser vorher als Gast vergeben hat).

/** Sterne vergeben (1–5) oder zurücknehmen (0). Antwort { status: 'ok', mine, rating: { avg, count } } oder ein Grund */
export async function rateLevel(ref, stars) {
  try {
    const key = await playerKey();
    return actionResult(await apiFetch(`${BASE}/ratings`, { method: 'POST', body: JSON.stringify({ ref, stars, playerKey: key }) }));
  } catch {
    return offline;
  }
}

/** Sterne, eigene Sterne und Favorit für mehrere Level: [{ key, ref, rating, mine, favorite }] (leer, wenn es nicht klappt) */
export async function lookupRatings(refs) {
  try {
    const key = await playerKey();
    const res = await apiFetch(`${BASE}/ratings/lookup`, { method: 'POST', body: JSON.stringify({ refs, playerKey: key }) });
    return res.ok && Array.isArray(res.json?.items) ? res.json.items : [];
  } catch {
    return [];
  }
}

/** Favorit setzen/entfernen. `info` (nur Zufallslevel): { leitidee, autor } zur Anzeige in der Favoritenliste */
export async function setFavorite(ref, on, info) {
  try {
    const key = await playerKey();
    return actionResult(await apiFetch(`${BASE}/favorites`, { method: 'POST', body: JSON.stringify({ ref, on, info, playerKey: key }) }));
  } catch {
    return offline;
  }
}

async function keyedList(path) {
  const key = await playerKey();
  const res = await apiFetch(`${BASE}${path}`, { headers: key ? { 'X-Player-Key': key } : {} });
  if (!res.ok) throw new Error(res.json?.reason || `HTTP ${res.code}`);
  return Array.isArray(res.json?.items) ? res.json.items : [];
}

/** Die eigenen Favoriten (veröffentlichte und Zufallslevel), neueste zuerst */
export const getFavorites = () => keyedList('/favorites');

/** Die bestbewerteten Zufallslevel aller Spieler */
export const getTopRandom = (limit = 20) => keyedList(`/ratings/top?limit=${Number(limit) || 20}`);

export async function reportLevel(code, { reason, note }) {
  try {
    return actionResult(await apiFetch(`${BASE}/levels/${enc(code)}/report`, { method: 'POST', body: JSON.stringify({ reason, note }) }));
  } catch {
    return offline;
  }
}

export async function updateLevel(code, patch) {
  try {
    return actionResult(await apiFetch(`${BASE}/levels/${enc(code)}`, { method: 'PATCH', body: JSON.stringify(patch) }));
  } catch {
    return offline;
  }
}

export async function deleteLevel(code) {
  try {
    return actionResult(await apiFetch(`${BASE}/levels/${enc(code)}`, { method: 'DELETE' }));
  } catch {
    return offline;
  }
}
