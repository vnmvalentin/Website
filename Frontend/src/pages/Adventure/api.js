// api.js — alle Aufrufe an /api/adventure an einer Stelle. Fehler kommen als Error mit der Server-Meldung zurück.
//
// Gäste (ohne Twitch-Login) spielen mit einer zufälligen ID aus diesem Browser (Header X-Adventure-Guest). Nach dem
// Login übernimmt POST /claim-guest den Fortschritt ins Konto; danach wird die ID vergessen.

const GUEST_KEY = "av-guest-id";

/** Die Gast-ID dieses Browsers, oder null. create=true legt sie an, falls es noch keine gibt. */
export function guestId(create = false) {
  try {
    let id = localStorage.getItem(GUEST_KEY);
    if (!id && create && typeof crypto?.randomUUID === "function") {
      id = crypto.randomUUID();
      localStorage.setItem(GUEST_KEY, id);
    }
    return id || null;
  } catch {
    return null; // Speicher gesperrt (privates Fenster): dann geht es nur mit Login
  }
}

export function forgetGuest() {
  try { localStorage.removeItem(GUEST_KEY); } catch { /* egal */ }
}

async function call(path, { method = "GET", body } = {}) {
  const headers = {};
  if (body) headers["Content-Type"] = "application/json";
  const gid = guestId();
  if (gid) headers["X-Adventure-Guest"] = gid;
  const res = await fetch(`/api/adventure${path}`, {
    method,
    credentials: "include",
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* leere Antwort */ }
  if (!res.ok) throw new Error(data?.error || `Serverfehler (${res.status})`);
  return data;
}

export const api = {
  profile: () => call("/profile"),
  leaderboard: (scope = "all", kit = "") => call(`/leaderboard?scope=${encodeURIComponent(scope)}${kit ? `&kit=${encodeURIComponent(kit)}` : ""}`),
  history: () => call("/history"),
  // opts: { mode: "daily", skin, ascension }
  startRun: (kitId, difficulty, opts = {}) => call("/start-run", { method: "POST", body: { kitId, difficulty, ...opts } }),
  saveRun: (runId, snapshot) => call("/save-run", { method: "POST", body: { runId, snapshot } }),
  loadRun: () => call("/load-run"),
  abandonRun: () => call("/abandon-run", { method: "POST" }),
  endRun: (payload) => call("/end-run", { method: "POST", body: payload }),
  feedback: (message) => call("/feedback", { method: "POST", body: { message } }),
  claimGuest: () => call("/claim-guest", { method: "POST" }),
};
