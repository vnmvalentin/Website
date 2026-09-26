// levelApi.js — API-Client der Level-Verifizierung (/api/seed-runners/levels). Gleiches Muster wie dailyApi.js: Der
// Server antwortet bei abgelehnten oder ungeprüften Läufen mit Statuscodes ≠ 200, der Body trägt trotzdem
// { status, reason } — die Seite zeigt den Grund. Die Anmeldung läuft über das Session-Cookie (gleiche Herkunft).

async function apiFetch(path, opts = {}) {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, code: res.status, json };
}

/**
 * Verifizierungslauf einsenden: { doc, log, ticks, fp, hash }. Antwort:
 *   { status: 'ok', hash, ticks, deaths, playedTicks, improved, verifiedAt }   ticks = die OFFIZIELLE (beste) Zeit
 *   { status: 'abgelehnt' | 'ungeprueft' | 'busy' | 'fehler' | 'ungueltig' | 'zu-viele' | 'anmeldung', reason?, errors? }
 */
export async function verifyLevel(payload) {
  try {
    const res = await apiFetch('/api/seed-runners/levels/verify', { method: 'POST', body: JSON.stringify(payload) });
    if (res.code === 401) return { status: 'anmeldung', reason: 'Du bist nicht angemeldet.' };
    if (res.json?.status) return res.json;
    return { status: 'fehler', reason: res.json?.error || `HTTP ${res.code}` };
  } catch {
    return { status: 'fehler', reason: 'Keine Verbindung zum Server.' };
  }
}

/**
 * Stand der Verifizierung dieses Kontos für einen Inhalts-Hash: { verified, current?, ticks?, deaths?, verifiedAt? }.
 * `current: false` = gegen eine ältere Physik geprüft, gilt nicht mehr. null, wenn nicht abrufbar (nicht angemeldet,
 * Server nicht erreichbar) — die Anzeige fällt dann auf den lokalen Merker zurück.
 */
export async function getVerification(hash) {
  try {
    const res = await apiFetch(`/api/seed-runners/levels/verification/${encodeURIComponent(hash)}`);
    return res.ok && typeof res.json?.verified === 'boolean' ? res.json : null;
  } catch {
    return null;
  }
}
