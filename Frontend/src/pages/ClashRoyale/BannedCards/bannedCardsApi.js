async function apiFetch(path, opts = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error || json?.message || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return json;
}

export function getMyBannedCardsList() {
  return apiFetch("/api/banned-cards/me", { method: "GET", credentials: "include" });
}

export function regenerateLink(which) {
  return apiFetch("/api/banned-cards/me/regenerate", {
    method: "POST",
    credentials: "include",
    body: JSON.stringify({ which }),
  });
}

export function getOverlayBannedCards(overlayKey) {
  return apiFetch(`/api/banned-cards/overlay/${overlayKey}`, { method: "GET" });
}

export function getModBannedCards(modKey) {
  return apiFetch(`/api/banned-cards/mod/${modKey}`, { method: "GET" });
}

export function banCard(modKey, { id, name, rarity }) {
  return apiFetch(`/api/banned-cards/mod/${modKey}`, {
    method: "POST",
    body: JSON.stringify({ id, name, rarity }),
  });
}

export function unbanCard(modKey, entryId) {
  return apiFetch(`/api/banned-cards/mod/${modKey}/${entryId}`, {
    method: "DELETE",
  });
}

export function unbanAllCards(modKey) {
  return apiFetch(`/api/banned-cards/mod/${modKey}`, {
    method: "DELETE",
  });
}

export function adjustAttempts(modKey, delta) {
  return apiFetch(`/api/banned-cards/mod/${modKey}/attempts`, {
    method: "POST",
    body: JSON.stringify({ delta }),
  });
}
