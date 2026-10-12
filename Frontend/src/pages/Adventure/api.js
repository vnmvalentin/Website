// api.js — alle Aufrufe an /api/adventure an einer Stelle. Fehler kommen als Error mit der Server-Meldung zurück.

async function call(path, { method = "GET", body } = {}) {
  const res = await fetch(`/api/adventure${path}`, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
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
};
