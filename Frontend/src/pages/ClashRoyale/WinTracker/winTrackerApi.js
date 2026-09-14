// API-Client für die Win-Tracker-Seite (/api/cr-wintracker)
async function apiFetch(path, opts = {}) {
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

export const setAccountTrackMode = (accountId, trackMode) =>
  apiFetch(`/api/cr-wintracker/accounts/${accountId}/track-mode`, { method: "PUT", body: JSON.stringify({ trackMode }) });

export const setAccountAutoSwitch = (accountId, enabled) =>
  apiFetch(`/api/cr-wintracker/accounts/${accountId}/auto-switch`, { method: "PUT", body: JSON.stringify({ enabled }) });

export const setAccountLadderStep = (accountId, step) =>
  apiFetch(`/api/cr-wintracker/accounts/${accountId}/ladder-step`, { method: "PUT", body: JSON.stringify({ step }) });

export const resetAccountSession = (accountId, scope) =>
  apiFetch(`/api/cr-wintracker/accounts/${accountId}/reset-session`, { method: "POST", body: JSON.stringify({ scope }) });

export const saveSettings = (settings) =>
  apiFetch("/api/cr-wintracker/settings", { method: "PUT", body: JSON.stringify(settings) });

export const regenerateOverlayKey = () =>
  apiFetch("/api/cr-wintracker/overlay/regenerate", { method: "POST" });

export const getOverlayData = (overlayKey) => apiFetch(`/api/cr-wintracker/overlay/${overlayKey}`);
