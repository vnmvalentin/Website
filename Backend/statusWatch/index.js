// statusWatch/index.js — Status-Prüfer als eigener Prozess (systemd: admin-status, siehe deploy/admin-status.service).
//
// WARUM EIN EIGENER PROZESS
// Der Discord-Bot läuft im selben Prozess wie das Backend (index.js). Stürzt das ab, ist auch der
// Bot weg — es könnte seinen eigenen Ausfall nie melden. Dieser Prozess hängt an nichts davon:
// er fragt nur die Website und /api/health ab und schreibt per Webhook nach #status.
// Fällt der ganze Server aus, steht auch dieser Dienst; das zeigt dann das alte "Zuletzt geprüft".
//
// Daten (bleiben beim Deploy unangetastet, siehe deploy.sh):
//   data/status_state.json        Zustand + ID der Status-Nachricht
//   data/maintenance.json         Wartungsfenster, schreibt deploy.sh vor dem Backend-Neustart
//
// NÄCHTLICHE DATENSICHERUNG (sicherung/plan.js) hängt ebenfalls hier: aus demselben Grund (läuft unabhängig vom
// Backend) und weil dieser Dienst auf dem Server schon eingerichtet ist. Sie läuft auch ohne Status-Webhook.
//   BETREIBER_WEBHOOK_URL   optional, privater Discord-Kanal für Fehlschläge (nie #status); denselben nutzt das
//                           Fehlerprotokoll des Backends (fehler/)
//   SICHERUNG_AUS=1         schaltet sie ab

const path = require("path");
// Wie blobbyServer.js ohne override: Umgebung aus systemd gewinnt über die .env im Projektordner
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });

const { createWebhook } = require("./webhook");
const { createStatusWatcher } = require("./watcher");
const { createSicherungsPlan } = require("../sicherung/plan");
const { ORDNER: SICHERUNG_ORDNER } = require("../sicherung/gemeinsam");

process.title = "status-watch";

const INTERVAL_MS = Number(process.env.STATUS_INTERVAL_MS) || 30 * 1000;
const SICHERUNG_TAKT_MS = 5 * 60 * 1000;
const dataDir = require("../lib/dataDir");
if (!process.env.STATUS_DATA_DIR) dataDir.zieheAlteDatenUm("statusWatch");
const DATA_DIR = process.env.STATUS_DATA_DIR || dataDir.DATA_DIR;
const websiteUrl = process.env.STATUS_WEBSITE_URL || process.env.FRONTEND_URL;
const healthUrl = process.env.STATUS_HEALTH_URL || `http://127.0.0.1:${Number(process.env.PORT) || 3001}/api/health`;

function starteSicherung() {
  if (process.env.SICHERUNG_AUS === "1") {
    console.log("[sicherung] abgeschaltet (SICHERUNG_AUS=1)");
    return;
  }
  let melde = async (text) => console.warn(`[sicherung] ${text}`);
  if (process.env.BETREIBER_WEBHOOK_URL) {
    try {
      const hook = createWebhook(process.env.BETREIBER_WEBHOOK_URL);
      melde = async (text) => {
        console.warn(`[sicherung] ${text}`);
        await hook.send({ content: text.slice(0, 1900), allowed_mentions: { parse: [] } });
      };
    } catch (e) {
      console.error(`[sicherung] BETREIBER_WEBHOOK_URL: ${e.message} — Meldungen nur im Log`);
    }
  }
  const plan = createSicherungsPlan({
    zielBasis: path.join(DATA_DIR, SICHERUNG_ORDNER),
    skript: path.join(__dirname, "..", "sicherung", "sicherung.js"),
    env: { SICHERUNG_DATEN: DATA_DIR },
    melde,
  });
  console.log("[sicherung] nächtliche Datensicherung ab 03:30 Serverzeit aktiv");
  // Nächster Blick erst nach dem vorigen: ein laufender Kindprozess hält tick() offen
  const loop = async () => {
    try {
      await plan.tick();
    } catch (e) {
      console.error("[sicherung] Zeitplan:", e.message);
    }
    setTimeout(loop, SICHERUNG_TAKT_MS);
  };
  loop();
}

function main() {
  starteSicherung();
  if (!process.env.DISCORD_STATUS_WEBHOOK_URL) {
    // Kein Fehler-Exit: systemd (Restart=on-failure) soll nicht endlos neu starten, nur weil es nicht eingerichtet
    // ist. Der Prozess bleibt für die Datensicherung trotzdem am Leben.
    console.warn("[status] DISCORD_STATUS_WEBHOOK_URL fehlt in der .env — Status-Teil bleibt aus.");
    return;
  }
  if (!websiteUrl) {
    console.error("[status] Weder STATUS_WEBSITE_URL noch FRONTEND_URL gesetzt — Status-Teil bleibt aus.");
    return;
  }

  let webhook;
  try {
    webhook = createWebhook(process.env.DISCORD_STATUS_WEBHOOK_URL);
  } catch (e) {
    console.error(`[status] ${e.message}`);
    process.exit(1);
  }

  const watcher = createStatusWatcher({
    websiteUrl,
    healthUrl,
    webhook,
    stateFile: path.join(DATA_DIR, "status_state.json"),
    maintenanceFile: path.join(DATA_DIR, "maintenance.json"),
  });

  console.log(`[status] prüfe ${websiteUrl} und ${healthUrl} alle ${Math.round(INTERVAL_MS / 1000)}s`);

  // Nächste Runde erst nach der vorigen: hängende Anfragen dürfen sich nicht stapeln
  const loop = async () => {
    try {
      await watcher.tick();
    } catch (e) {
      console.error("[status] Prüfrunde fehlgeschlagen:", e.message);
    }
    setTimeout(loop, INTERVAL_MS);
  };
  loop();
}

main();
