// statusWatch/postUpdates.js — neue Website-Updates nach #updates posten. Läuft AUF DEM SERVER.
// deploy.sh exportiert lokal die neuesten Einträge aus Frontend/src/utils/newData.js
// (tools/exportUpdates.mjs) und reicht sie per ssh hier über stdin herein — wie bei levelTransfer.js.
// Der Webhook steht nur in der Server-.env; was schon gepostet ist, merkt sich data/updates_state.json.
//
//   node statusWatch/tools/exportUpdates.mjs | node statusWatch/postUpdates.js

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });

const fs = require("fs");
const { readJson, writeJsonAtomic } = require("../lib/jsonFile");
const { createWebhook } = require("./webhook");
const { buildUpdatePayload, selectNewEntries } = require("./updateEmbed");

const DATA_DIR = process.env.STATUS_DATA_DIR || path.join(__dirname, "data");
const STATE_FILE = path.join(DATA_DIR, "updates_state.json");
const KEEP_VERSIONS = 50;

function readStdin() {
  return new Promise((resolve, reject) => {
    let buf = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (buf += c));
    process.stdin.on("end", () => resolve(buf));
    process.stdin.on("error", reject);
  });
}

function isEntry(e) {
  return e && typeof e.version === "string" && e.version && typeof e.date === "string" && Array.isArray(e.sections);
}

async function main() {
  const url = process.env.DISCORD_UPDATES_WEBHOOK_URL;
  if (!url) {
    console.log("[updates] DISCORD_UPDATES_WEBHOOK_URL fehlt in der .env — nichts gepostet.");
    return;
  }
  const siteUrl = (process.env.FRONTEND_URL || "").replace(/\/+$/, "");
  if (!siteUrl) throw new Error("FRONTEND_URL fehlt — ohne sie gäbe es keinen Link zur Updates-Seite.");

  let input;
  try {
    input = JSON.parse(await readStdin());
  } catch {
    throw new Error("Eingabe ist kein gültiges JSON (erwartet: Ausgabe von tools/exportUpdates.mjs).");
  }
  const entries = Array.isArray(input && input.entries) ? input.entries.filter(isEntry) : [];
  if (!entries.length) throw new Error("Keine Update-Einträge in der Eingabe.");

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const state = readJson(STATE_FILE, null);
  const posted = state && Array.isArray(state.posted) ? state.posted : null;
  const fresh = selectNewEntries(entries, posted);
  if (!fresh.length) {
    console.log(`[updates] nichts Neues (zuletzt: ${entries[0].version})`);
    return;
  }

  const webhook = createWebhook(url);
  const done = posted ? [...posted] : [];
  for (const entry of fresh) {
    await webhook.send(buildUpdatePayload(entry, `${siteUrl}/updates`));
    done.unshift(entry.version);
    // Nach jedem Post speichern: bricht der nächste ab, wird dieser beim nächsten Deploy nicht doppelt gepostet
    writeJsonAtomic(STATE_FILE, { posted: done.slice(0, KEEP_VERSIONS) });
    console.log(`[updates] gepostet: ${entry.version}`);
  }
}

main().catch((e) => {
  console.error(`[updates] ${e.message}`);
  process.exit(1);
});
