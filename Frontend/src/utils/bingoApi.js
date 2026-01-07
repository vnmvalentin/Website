async function apiFetch(path, opts = {}) {
  const res = await fetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
    ...opts,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error || json?.message || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.payload = json;
    throw err;
  }
  return json;
}

export function getThemes() {
  return apiFetch("/api/bingo/themes", { method: "GET", credentials: "omit" });
}

export function createSession(payload) {
  return apiFetch("/api/bingo/session", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getMySessions() {
  return apiFetch("/api/bingo/my", { method: "GET" });
}

export function getSession(sessionId) {
  return apiFetch(`/api/bingo/session/${sessionId}`, { method: "GET" });
}

export function joinByKey(joinKey) {
  return apiFetch(`/api/bingo/join/${joinKey}`, { method: "POST", body: "{}" });
}

export function invite(sessionId, twitchLogins, permissions) {
  return apiFetch(`/api/bingo/session/${sessionId}/invite`, {
    method: "POST",
    body: JSON.stringify({ twitchLogins, permissions }),
  });
}

export function uninvite(sessionId, twitchLogin) {
  return apiFetch(`/api/bingo/session/${sessionId}/uninvite`, {
    method: "POST",
    body: JSON.stringify({ twitchLogin }),
  });
}

export function kick(sessionId, twitchId) {
  return apiFetch(`/api/bingo/session/${sessionId}/kick`, {
    method: "POST",
    body: JSON.stringify({ twitchId }),
  });
}

export function setPermissions(sessionId, { twitchId, twitchLogin, permissions }) {
  return apiFetch(`/api/bingo/session/${sessionId}/permissions`, {
    method: "PUT",
    body: JSON.stringify({ twitchId, twitchLogin, permissions }),
  });
}

export function setStyle(sessionId, stylePatch) {
  return apiFetch(`/api/bingo/session/${sessionId}/style`, {
    method: "PUT",
    body: JSON.stringify(stylePatch),
  });
}

export function setSettings(sessionId, settingsPatch) {
  return apiFetch(`/api/bingo/session/${sessionId}/settings`, {
    method: "PUT",
    body: JSON.stringify(settingsPatch),
  });
}

export function setWords(sessionId, { customName, words }) {
  return apiFetch(`/api/bingo/session/${sessionId}/words`, {
    method: "PUT",
    body: JSON.stringify({ customName, words }),
  });
}

export function randomize(sessionId) {
  return apiFetch(`/api/bingo/session/${sessionId}/randomize`, {
    method: "POST",
    body: "{}",
  });
}

export function startSession(sessionId) {
  return apiFetch(`/api/bingo/session/${sessionId}/start`, {
    method: "POST",
    body: "{}",
  });
}

export function markCell(sessionId, cellIndex, mark, markColor) {
  return apiFetch(`/api/bingo/session/${sessionId}/mark`, {
    method: "POST",
    body: JSON.stringify({ cellIndex, mark, markColor }),
  });
}

export async function getOverlay(overlayKey, since = 0) {
  const res = await fetch(`/api/bingo/overlay/${overlayKey}?since=${since}`, {
    method: "GET",
    credentials: "omit",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.payload = json;
    throw err;
  }
  return json;
}

export function stopSession(sessionId) {
  return apiFetch(`/api/bingo/session/${sessionId}/stop`, {
    method: "POST",
    body: "{}",
  });
}

export function deleteSession(sessionId) {
  return apiFetch(`/api/bingo/session/${sessionId}`, {
    method: "DELETE",
  });
}

