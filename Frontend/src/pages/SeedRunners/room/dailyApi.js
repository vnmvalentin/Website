// dailyApi.js — API-Client der Tagesrangliste von Seed Runners (/api/seed-runners), Läufe werden
// serverseitig nachgespielt. Der Server antwortet bei abgelehnten oder ungeprüften Läufen mit Statuscodes ≠ 200, der Body
// trägt trotzdem { status, reason } — die Seite zeigt den Grund, deshalb wird er hier nicht als Fehler verschluckt.

async function apiFetch(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, code: res.status, json };
}

/** Rangliste von heute (Top 50), die des Vortags (Top 3) und der eigene Platz */
export async function getDailyBoard(playerKey) {
  const res = await apiFetch('/api/seed-runners/daily', { headers: playerKey ? { 'X-Player-Key': playerKey } : {} });
  if (!res.ok) throw new Error(res.json?.error || `HTTP ${res.code}`);
  return res.json;
}

/**
 * Lauf einsenden. Antwort: { status: 'ok' | 'nicht-besser' | 'abgelehnt' | 'ungeprueft' | 'busy' | 'fehler' | 'ungueltig',
 * reason?, rank?, entry?, best? } — auch bei Statuscodes ≠ 200.
 */
export async function submitDailyRun(payload) {
  try {
    const res = await apiFetch('/api/seed-runners/daily/submit', { method: 'POST', body: JSON.stringify(payload) });
    if (res.json?.status) return res.json;
    return { status: res.code === 429 ? 'zu-viele' : 'fehler', reason: res.json?.error || `HTTP ${res.code}` };
  } catch {
    return { status: 'fehler', reason: 'Keine Verbindung zum Server.' };
  }
}

/** Rangliste eines vergangenen Tages (Archiv) und der eigene Platz dort: { board, me } */
export async function getDailyBoardOf(dateKey, playerKey) {
  const res = await apiFetch(`/api/seed-runners/daily/${encodeURIComponent(dateKey)}`, { headers: playerKey ? { 'X-Player-Key': playerKey } : {} });
  if (!res.ok) throw new Error(res.json?.error || `HTTP ${res.code}`);
  return res.json;
}

/** Replay des Tagesbesten: { params, name, ticks, deaths, log } oder null (kein Lauf, Log schon gelöscht) */
export async function getDailyTopReplay(dateKey) {
  const res = await apiFetch(`/api/seed-runners/daily/${encodeURIComponent(dateKey)}/replay`);
  if (res.code === 404) return null;
  if (!res.ok) throw new Error(res.json?.error || `HTTP ${res.code}`);
  return res.json;
}
