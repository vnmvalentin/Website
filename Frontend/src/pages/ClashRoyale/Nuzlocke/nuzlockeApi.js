// API-Client für die Nuzlocke-Seite (/api/nuzlocke + Overlay-Key aus /api/banned-cards)
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

export const getMyNuzlocke = () => apiFetch("/api/nuzlocke/me");
export const getLeaderboard = () => apiFetch("/api/nuzlocke/leaderboard");

export const addAccount = (tag) =>
  apiFetch("/api/nuzlocke/accounts", { method: "POST", body: JSON.stringify({ tag }) });

export const getAccount = (accountId) => apiFetch(`/api/nuzlocke/accounts/${accountId}`);

export const deleteAccount = (accountId) =>
  apiFetch(`/api/nuzlocke/accounts/${accountId}`, { method: "DELETE" });

// Füge diesen Export in deiner nuzlockeApi.js hinzu (z.B. unter deleteAccount)
export const finishRun = (accountId) =>
  apiFetch(`/api/nuzlocke/accounts/${accountId}/finish`, { method: "POST" });

export const activateAccount = (accountId) =>
  apiFetch(`/api/nuzlocke/accounts/${accountId}/activate`, { method: "POST" });

export const saveDeck = (accountId, deck) =>
  apiFetch(`/api/nuzlocke/accounts/${accountId}/deck`, { method: "PUT", body: JSON.stringify({ deck }) });

export const spinWheel = (accountId) =>
  apiFetch(`/api/nuzlocke/accounts/${accountId}/spin`, { method: "POST" });

// Globaler Counter (ohne AccountId im Path)
export const adjustAttempts = (delta) =>
  apiFetch("/api/nuzlocke/global-attempts", { method: "POST", body: JSON.stringify({ delta }) });

export const banCardManually = (accountId, cardId) =>
  apiFetch(`/api/nuzlocke/accounts/${accountId}/ban`, { method: "POST", body: JSON.stringify({ cardId }) });

export const unbanCard = (accountId, entryId) =>
  apiFetch(`/api/nuzlocke/accounts/${accountId}/unban`, { method: "POST", body: JSON.stringify({ entryId }) });

export const refreshAccount = (accountId) =>
  apiFetch(`/api/nuzlocke/accounts/${accountId}/refresh`, { method: "POST" });

export const getOverlaySettings = () => apiFetch("/api/banned-cards/me");
export const regenerateOverlayKey = () =>
  apiFetch("/api/banned-cards/me/regenerate", { method: "POST" });