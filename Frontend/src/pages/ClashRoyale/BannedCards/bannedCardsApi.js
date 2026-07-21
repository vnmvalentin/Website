// API für das OBS-Overlay der gebannten Karten.
// Die Verwaltung (Accounts, Deck, Glücksrad) läuft über die Nuzlocke-Seite (/nuzlocke).
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

export function getOverlayBannedCards(overlayKey) {
  return apiFetch(`/api/banned-cards/overlay/${overlayKey}`, { method: "GET" });
}
