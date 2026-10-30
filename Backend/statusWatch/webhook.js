// statusWatch/webhook.js — schlanker Discord-Webhook-Client (senden + eigene Nachricht bearbeiten).
// Die URL enthält das Webhook-Geheimnis: sie wird nie geloggt, Fehler nennen nur Status und Code.

const UNKNOWN_MESSAGE = 10008;
const UNKNOWN_WEBHOOK = 10015;
const TIMEOUT_MS = 10000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Prüft die Form, damit ein Tippfehler in der .env früh und eindeutig auffällt */
function parseWebhookUrl(raw) {
  if (!raw) return null;
  let u;
  try {
    u = new URL(String(raw).trim());
  } catch {
    return null;
  }
  // Discord: /api/webhooks/<id>/<token>; lokale Tests dürfen http://127.0.0.1 benutzen
  const m = u.pathname.match(/\/api(?:\/v\d+)?\/webhooks\/(\d+)\/([\w-]+)\/?$/);
  if (!m) return null;
  return `${u.origin}${u.pathname.replace(/\/$/, "")}`;
}

class WebhookError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function createWebhook(rawUrl, { fetchImpl = globalThis.fetch } = {}) {
  const base = parseWebhookUrl(rawUrl);
  if (!base) throw new Error("Webhook-URL fehlt oder hat nicht die Form https://discord.com/api/webhooks/<id>/<token>");

  async function call(method, pathAndQuery, body, attempt = 0) {
    const res = await fetchImpl(`${base}${pathAndQuery}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 429 && attempt < 2) {
      const data = await res.json().catch(() => ({}));
      await sleep(Math.min(30000, Math.ceil((Number(data.retry_after) || 1) * 1000)));
      return call(method, pathAndQuery, body, attempt + 1);
    }
    if (res.status === 204) return null;
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const code = data && data.code;
      throw new WebhookError(res.status, code, `Discord antwortete ${res.status}${code ? ` (Code ${code})` : ""}`);
    }
    return data;
  }

  return {
    /** @returns {Promise<string>} ID der neuen Nachricht */
    async send(payload) {
      const msg = await call("POST", "?wait=true", payload);
      if (!msg || !msg.id) throw new WebhookError(0, null, "Discord lieferte keine Nachrichten-ID");
      return msg.id;
    },
    async edit(messageId, payload) {
      await call("PATCH", `/messages/${encodeURIComponent(messageId)}`, payload);
    },
  };
}

/** Nachricht gelöscht → neu posten statt ewig ins Leere bearbeiten */
const isMessageGone = (e) =>
  e instanceof WebhookError && (e.code === UNKNOWN_MESSAGE || (e.status === 404 && e.code !== UNKNOWN_WEBHOOK));
/** Webhook in Discord gelöscht → weitere Versuche sind sinnlos */
const isWebhookGone = (e) => e instanceof WebhookError && (e.code === UNKNOWN_WEBHOOK || e.status === 401);

module.exports = { createWebhook, parseWebhookUrl, isMessageGone, isWebhookGone, WebhookError };
