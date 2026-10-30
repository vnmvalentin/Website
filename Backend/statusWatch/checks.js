// statusWatch/checks.js — eine Prüfrunde: Website (öffentlich über nginx) und Backend (/api/health lokal).
// Das Backend wird direkt über Loopback gefragt, damit ein nginx-Problem als "Website" und ein
// abgestürzter Node-Prozess als "Server" erscheint.

const WEBSITE_TIMEOUT_MS = 10000;
const WEBSITE_SLOW_MS = 4000;
const HEALTH_TIMEOUT_MS = 5000;
const USER_AGENT = "vnm-statuswatch/1.0";

async function checkWebsite(url, { fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  const started = now();
  try {
    const res = await fetchImpl(url, {
      headers: { "User-Agent": USER_AGENT, "Cache-Control": "no-cache" },
      redirect: "follow",
      signal: AbortSignal.timeout(WEBSITE_TIMEOUT_MS),
    });
    const html = await res.text();
    // Die SPA-Hülle erkennt man am Wurzel-Element — eine nginx-Fehlerseite mit 200 zählt nicht
    const ok = res.ok && html.includes('id="root"');
    return { ok, slow: ok && now() - started > WEBSITE_SLOW_MS };
  } catch {
    return { ok: false };
  }
}

async function checkServer(url, { fetchImpl = globalThis.fetch } = {}) {
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
    if (!res.ok) return { ok: false };
    const data = await res.json();
    if (!data || data.ok !== true) return { ok: false };
    return { ok: true, uptimeS: Number(data.uptimeS) || 0, botReady: Boolean(data.bot && data.bot.ready) };
  } catch {
    return { ok: false };
  }
}

module.exports = { checkWebsite, checkServer, USER_AGENT };
