// statusWatch/watcher.js — eine Prüfrunde: messen, Zustand fortschreiben, #status-Nachricht pflegen.
// In #status steht genau EINE Nachricht. Sie wird nur bearbeitet, nie neu gepostet — außer jemand
// hat sie gelöscht. Ihre ID liegt im Zustand, damit ein Neustart dieses Dienstes dieselbe weiterführt.

const fs = require("fs");
const path = require("path");
const { readJson, writeJsonAtomic } = require("../lib/jsonFile");
const { checkWebsite, checkServer } = require("./checks");
const { nextState, emptyState } = require("./statusLogic");
const { buildStatusPayload } = require("./statusEmbed");
const { isMessageGone, isWebhookGone } = require("./webhook");

// Auch ohne Änderung spätestens so oft bearbeiten, damit "Zuletzt geprüft" frisch bleibt
const REFRESH_MS = 60 * 1000;
// Gleiche Discord-Fehlermeldung höchstens so oft ins Log
const LOG_REPEAT_MS = 10 * 60 * 1000;

/** Wartungsfenster von deploy.sh: {"until": <ms>} — kaputt oder fehlend heißt "keine Wartung" */
function maintenanceActive(file, now) {
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    return Number(data.until) > now;
  } catch {
    return false;
  }
}

function createStatusWatcher({ websiteUrl, healthUrl, webhook, stateFile, maintenanceFile, now = Date.now, fetchImpl, log = console }) {
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  let state = readJson(stateFile, emptyState());
  let lastKey = null;
  let lastEditAt = 0;
  let lastLog = { text: "", at: 0 };
  let webhookDead = false;

  function logOnce(text) {
    const t = now();
    if (text === lastLog.text && t - lastLog.at < LOG_REPEAT_MS) return;
    lastLog = { text, at: t };
    log.warn(`[status] ${text}`);
  }

  async function publish(payload) {
    if (state.messageId) {
      try {
        await webhook.edit(state.messageId, payload);
        return;
      } catch (e) {
        if (!isMessageGone(e)) throw e;
        log.warn("[status] Status-Nachricht wurde gelöscht — poste sie neu");
        state.messageId = null;
      }
    }
    state.messageId = await webhook.send(payload);
  }

  async function tick() {
    const t = now();
    const [website, server] = await Promise.all([
      checkWebsite(websiteUrl, { fetchImpl, now }),
      checkServer(healthUrl, { fetchImpl }),
    ]);
    const probe = { website, server, maintenance: maintenanceActive(maintenanceFile, t) };
    state = nextState(state, probe, t);

    const key = JSON.stringify(buildStatusPayload(state, 0));
    if (!webhookDead && (key !== lastKey || t - lastEditAt >= REFRESH_MS)) {
      try {
        await publish(buildStatusPayload(state, t));
        lastKey = key;
        lastEditAt = t;
      } catch (e) {
        if (isWebhookGone(e)) {
          webhookDead = true;
          log.error("[status] Webhook gibt es nicht mehr — DISCORD_STATUS_WEBHOOK_URL prüfen und Dienst neu starten");
        } else {
          logOnce(`Discord nicht erreichbar: ${e.message}`);
        }
      }
    }
    writeJsonAtomic(stateFile, state);
    return state;
  }

  return { tick, getState: () => state };
}

module.exports = { createStatusWatcher, maintenanceActive };
