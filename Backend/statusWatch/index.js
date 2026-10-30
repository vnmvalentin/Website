// statusWatch/index.js — Status-Prüfer als eigener Prozess (systemd: admin-status, siehe deploy/admin-status.service).
//
// WARUM EIN EIGENER PROZESS
// Der Discord-Bot läuft im selben Prozess wie das Backend (index.js). Stürzt das ab, ist auch der
// Bot weg — es könnte seinen eigenen Ausfall nie melden. Dieser Prozess hängt an nichts davon:
// er fragt nur die Website und /api/health ab und schreibt per Webhook nach #status.
// Fällt der ganze Server aus, steht auch dieser Dienst; das zeigt dann das alte "Zuletzt geprüft".
//
// Daten (bleiben beim Deploy unangetastet, siehe deploy.sh):
//   statusWatch/data/status_state.json  Zustand + ID der Status-Nachricht
//   statusWatch/data/maintenance.json   Wartungsfenster, schreibt deploy.sh vor dem Backend-Neustart

const path = require("path");
// Wie blobbyServer.js ohne override: Umgebung aus systemd gewinnt über die .env im Projektordner
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });

const { createWebhook } = require("./webhook");
const { createStatusWatcher } = require("./watcher");

process.title = "status-watch";

const INTERVAL_MS = Number(process.env.STATUS_INTERVAL_MS) || 30 * 1000;
const DATA_DIR = process.env.STATUS_DATA_DIR || path.join(__dirname, "data");
const websiteUrl = process.env.STATUS_WEBSITE_URL || process.env.FRONTEND_URL;
const healthUrl = process.env.STATUS_HEALTH_URL || `http://127.0.0.1:${Number(process.env.PORT) || 3001}/api/health`;

function main() {
  if (!process.env.DISCORD_STATUS_WEBHOOK_URL) {
    // Kein Fehler-Exit: systemd (Restart=on-failure) soll nicht endlos neu starten, nur weil es nicht eingerichtet ist
    console.warn("[status] DISCORD_STATUS_WEBHOOK_URL fehlt in der .env — Status-Prüfer bleibt aus.");
    process.exit(0);
  }
  if (!websiteUrl) {
    console.error("[status] Weder STATUS_WEBSITE_URL noch FRONTEND_URL gesetzt — weiß nicht, welche Website ich prüfen soll.");
    process.exit(1);
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
