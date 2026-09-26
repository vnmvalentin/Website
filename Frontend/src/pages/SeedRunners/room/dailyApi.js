// dailyApi.js — API-Client der Tagesrangliste von Seed Runners (/api/seed-runners), gleiches Muster wie
// Dle/dleApi.js. Der Server antwortet bei abgelehnten oder ungeprüften Läufen mit Statuscodes ≠ 200, der Body
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
