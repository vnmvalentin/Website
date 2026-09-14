// dleApi.js — API-Client für die -dle-Spiele (/api/dle), gleiches Muster wie
// ClashRoyale/WinTracker/winTrackerApi.js.
async function apiFetch(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json?.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

export const getRounds = (gameId, mode) => apiFetch(`/api/dle/${gameId}/rounds?mode=${mode}`);

export const submitDaily = (gameId, { dateKey, playerKey, playerName, guesses }) =>
  apiFetch(`/api/dle/${gameId}/submit`, {
    method: 'POST',
    body: JSON.stringify({ dateKey, playerKey, playerName, guesses }),
  });

export const getLeaderboard = (gameId, dateKey) =>
  apiFetch(`/api/dle/${gameId}/leaderboard?dateKey=${encodeURIComponent(dateKey)}`);
