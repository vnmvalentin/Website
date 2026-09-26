// modApi.js — API-Client der Seed-Runners-Moderation (/api/seed-runners/mod/*). Nur für Admins erreichbar; der Server
// prüft das serverseitig (403), diese Seite wird nur Admins überhaupt gezeigt (AdminDashboard.jsx).
const BASE = '/api/seed-runners/mod';
const enc = encodeURIComponent;

async function call(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  const json = await res.json().catch(() => ({}));
  return res.ok ? json : { status: json.status || 'fehler', reason: json.reason || `HTTP ${res.status}` };
}

/** Offene Meldungen, gruppiert je Level: [{ level, count, reports: [{id, accountId, reason, note, createdAt}] }] */
export async function getReports() {
  const r = await call('/reports');
  return Array.isArray(r.reports) ? r.reports : [];
}

/** Gesperrte Konten: [{ accountId, reason, createdAt }] */
export async function getBans() {
  const r = await call('/bans');
  return Array.isArray(r.bans) ? r.bans : [];
}

/** Alle ausgeblendeten Level — auch die, deren Meldung längst erledigt ist (hide() schließt sie automatisch mit ab) */
export async function getHiddenLevels() {
  const r = await call('/levels/hidden');
  return Array.isArray(r.levels) ? r.levels : [];
}

export const hideLevel = (code, reason) => call(`/levels/${enc(code)}/hide`, { method: 'POST', body: JSON.stringify({ reason }) });
export const unhideLevel = (code) => call(`/levels/${enc(code)}/unhide`, { method: 'POST' });
export const dismissReport = (id) => call(`/reports/${enc(id)}/dismiss`, { method: 'POST' });
export const banAccount = (id, reason) => call(`/accounts/${enc(id)}/ban`, { method: 'POST', body: JSON.stringify({ reason }) });
export const unbanAccount = (id) => call(`/accounts/${enc(id)}/unban`, { method: 'POST' });
/** Stößt die Neu-Prüfung nach einer Physik-Änderung sofort an (sonst läuft sie 20 s nach jedem Serverstart von selbst) */
export const runReverify = () => call('/reverify', { method: 'POST' });
