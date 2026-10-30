// API-Client für die Win-Tracker-Seite (/api/cr-wintracker)

// Admin-Modus: solange gesetzt, laufen alle Aufrufe im Namen dieses Nutzers ({ userId, login })
let actingAs = null;
export const setActingAs = (target) => { actingAs = target?.userId ? target : null; };
export const getActingAs = () => actingAs;

function withActingAs(path) {
  if (!actingAs || path.startsWith('/api/cr-wintracker/admin/')) return path;
  // Das öffentliche OBS-Overlay hängt am Key, nicht am Login
  if (path.startsWith('/api/cr-wintracker/overlay/') && !path.endsWith('/regenerate')) return path;
  const q = `asUser=${encodeURIComponent(actingAs.userId)}&asLogin=${encodeURIComponent(actingAs.login || '')}`;
  return path + (path.includes('?') ? '&' : '?') + q;
}

async function apiFetch(rawPath, opts = {}) {
  const path = withActingAs(rawPath);
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json?.error || json?.message || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

export const getMyWinTracker = () => apiFetch("/api/cr-wintracker/me");

export const addAccount = (tag) =>
  apiFetch("/api/cr-wintracker/accounts", { method: "POST", body: JSON.stringify({ tag }) });

export const deleteAccount = (accountId) =>
  apiFetch(`/api/cr-wintracker/accounts/${accountId}`, { method: "DELETE" });

export const activateAccount = (accountId) =>
  apiFetch(`/api/cr-wintracker/accounts/${accountId}/activate`, { method: "POST" });

export const refreshAccount = (accountId) =>
  apiFetch(`/api/cr-wintracker/accounts/${accountId}/refresh`, { method: "POST" });

export const setAccountLadderStep = (accountId, step) =>
  apiFetch(`/api/cr-wintracker/accounts/${accountId}/ladder-step`, { method: "PUT", body: JSON.stringify({ step }) });

export const resetAccountSession = (accountId, scope) =>
  apiFetch(`/api/cr-wintracker/accounts/${accountId}/reset-session`, { method: "POST", body: JSON.stringify({ scope }) });

export const saveSettings = (settings) =>
  apiFetch("/api/cr-wintracker/settings", { method: "PUT", body: JSON.stringify(settings) });

export const regenerateOverlayKey = () =>
  apiFetch("/api/cr-wintracker/overlay/regenerate", { method: "POST" });

export const getOverlayData = (overlayKey) => apiFetch(`/api/cr-wintracker/overlay/${overlayKey}`);
// Saisonrückblick des aktiven Accounts (season = "JJJJ-MM", leer = laufende Saison); das Bild lädt der Browser direkt
export const getRecap = (season) => apiFetch(`/api/cr-wintracker/recap${season ? `?season=${encodeURIComponent(season)}` : ""}`);
export const recapImageUrl = (season) => withActingAs(`/api/cr-wintracker/recap.png?season=${encodeURIComponent(season)}`);

// Nur für den Admin
export const adminListUsers = () => apiFetch('/api/cr-wintracker/admin/users');
export const adminLookupUser = (login) => apiFetch(`/api/cr-wintracker/admin/lookup?login=${encodeURIComponent(login)}`);
