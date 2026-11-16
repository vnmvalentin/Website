// streamToolAlerts.js — Overlay-Modul „Alerts“: Hinweise für Follow, Abo, Verlängerung, Geschenk-Abos, Bits und Raid.
//
// Woher die Ereignisse kommen:
//  - Abos, Geschenke, Bits, Raids: aus dem Chat, über denselben Bot wie Raid-Clip und Statistik
//    (lib/winchallengeIrc.js ruft die on…-Funktionen hier auf).
//  - Follows: der Chat meldet keine. Die Follower-Liste von Twitch wird deshalb abgefragt — wie alles in den
//    Stream-Tools nur, solange die OBS-Quelle (oder das Dashboard) läuft, höchstens alle FOLLOW_POLL_MS.
//
// Die Alerts liegen nur im Arbeitsspeicher (kurze Liste je Kanal, siehe alertsCore.js). Ein Neustart des Servers
// verliert höchstens Alerts, die ohnehin gerade abgespielt wurden.
const core = require("./alertsCore");
const { db, decryptToken } = require("./streamToolStore");
const { helix } = require("./twitchHelix");

const MODULE_ID = "alerts";
/** Wie oft die Follower-Liste höchstens abgefragt wird. Bestimmt, wie schnell ein Follow-Alert kommt. */
const FOLLOW_POLL_MS = 8 * 1000;
const FOLLOW_SCOPE = "moderator:read:followers";

const listConnected = db.prepare(
  "SELECT * FROM stream_tool_settings WHERE token_enc <> '' AND twitch_login <> ''"
);
const getByLogin = db.prepare("SELECT * FROM stream_tool_settings WHERE twitch_login = ?");
const getByUser = db.prepare("SELECT * FROM stream_tool_settings WHERE user_id = ?");

const normalizeLogin = (v) => String(v || "").trim().toLowerCase().replace(/^#/, "");

function parseJson(raw) {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Die Modul-Einstellungen, oder null wenn das Modul aus ist. */
function alertsModuleOf(row) {
  const mod = parseJson(row && row.config)?.modules?.[MODULE_ID];
  if (!mod || typeof mod !== "object" || !mod.enabled) return null;
  return mod;
}

/** Sprache der Overlays (für die Nachrichten der Test-Alerts). */
const overlayLangOf = (row) => (parseJson(row && row.config)?.language === "en" ? "en" : "de");

// userId -> Alerts (neueste zuletzt)
const queues = new Map();
// userId -> Stand der Follower-Abfrage { lastAt, seen }
const followState = new Map();
// userId -> Zeitpunkt der letzten Follower-Abfrage
const followPolledAt = new Map();
const bundles = new core.GiftBundles();

function push(row, ev) {
  const mod = alertsModuleOf(row);
  if (!core.allowed(mod, ev)) return false;
  queues.set(row.user_id, core.pushEvent(queues.get(row.user_id), ev));
  return true;
}

function rowOfChannel(channel) {
  const login = normalizeLogin(channel);
  return login ? getByLogin.get(login) : null;
}

/** Kanäle, in denen der Bot für die Alerts mitlesen soll. */
function getAlertChannels() {
  const out = new Set();
  for (const row of listConnected.all()) {
    if (alertsModuleOf(row)) out.add(normalizeLogin(row.twitch_login));
  }
  out.delete("");
  return [...out];
}

const nameOf = (tags, fallback) => (tags && (tags["display-name"] || tags.login || tags.username)) || fallback || "";

/* ── Chat-Ereignisse (Signaturen wie tmi.js) ───────────────────────────────── */

/** subscription(channel, username, methods, message, userstate) */
function onSub(channel, username, methods, message, tags) {
  const row = rowOfChannel(channel);
  if (!row) return false;
  return push(row, core.makeEvent("sub", { name: nameOf(tags, username), tier: core.tierOf(methods), message }));
}

/** resub(channel, username, months, message, userstate, methods) */
function onResub(channel, username, months, message, tags, methods) {
  const row = rowOfChannel(channel);
  if (!row) return false;
  const total = Number(tags && tags["msg-param-cumulative-months"]) || Number(months) || 0;
  return push(row, core.makeEvent("resub", { name: nameOf(tags, username), months: total, tier: core.tierOf(methods), message }));
}

/** subgift(channel, username, streakMonths, recipient, methods, userstate) */
function onSubGift(channel, username, streakMonths, recipient, methods, tags) {
  const row = rowOfChannel(channel);
  if (!row) return false;
  const gifter = (tags && tags.login) || username;
  if (bundles.absorb(normalizeLogin(channel), gifter)) return false;
  return push(row, core.makeEvent("gift", { name: nameOf(tags, username), amount: 1, tier: core.tierOf(methods) }));
}

/** anonsubgift(channel, streakMonths, recipient, methods, userstate) */
function onAnonSubGift(channel, streakMonths, recipient, methods) {
  const row = rowOfChannel(channel);
  if (!row) return false;
  if (bundles.absorb(normalizeLogin(channel), "")) return false;
  return push(row, core.makeEvent("gift", { name: "", amount: 1, tier: core.tierOf(methods) }));
}

/** submysterygift(channel, username, numbOfSubs, methods, userstate) — Ankündigung eines Geschenkpakets */
function onMysteryGift(channel, username, count, methods, tags) {
  const row = rowOfChannel(channel);
  if (!row) return false;
  bundles.note(normalizeLogin(channel), (tags && tags.login) || username, count);
  return push(row, core.makeEvent("gift", { name: nameOf(tags, username), amount: count, tier: core.tierOf(methods) }));
}

/** anonsubmysterygift(channel, numbOfSubs, methods, userstate) */
function onAnonMysteryGift(channel, count, methods) {
  const row = rowOfChannel(channel);
  if (!row) return false;
  bundles.note(normalizeLogin(channel), "", count);
  return push(row, core.makeEvent("gift", { name: "", amount: count, tier: core.tierOf(methods) }));
}

/** cheer(channel, userstate, message) */
function onCheer(channel, tags, message) {
  const row = rowOfChannel(channel);
  if (!row) return false;
  const bits = Math.round(Number(tags && tags.bits) || 0);
  if (!(bits > 0)) return false;
  return push(row, core.makeEvent("bits", { name: nameOf(tags, ""), amount: bits, message: core.stripCheermotes(message) }));
}

/** raided(channel, username, viewers, tags) */
function onRaid(channel, raider, viewers, tags) {
  const row = rowOfChannel(channel);
  if (!row) return false;
  const name = (tags && (tags["msg-param-displayName"] || tags["display-name"])) || raider;
  return push(row, core.makeEvent("raid", { name, amount: Number(viewers) || 0 }));
}

/* ── Follows ───────────────────────────────────────────────────────────────── */

const hasScope = (row, scope) => String(row.scopes || "").split(" ").includes(scope);

/** Fragt die Follower-Liste ab, wenn Follow-Alerts an sind und die letzte Abfrage lange genug her ist. */
async function pollFollows(row) {
  const mod = alertsModuleOf(row);
  if (!mod || (mod.kinds && mod.kinds.follow === false)) return;
  if (!hasScope(row, FOLLOW_SCOPE)) return;
  const now = Date.now();
  if (now - (followPolledAt.get(row.user_id) || 0) < FOLLOW_POLL_MS) return;
  followPolledAt.set(row.user_id, now);
  const token = decryptToken(row.token_enc);
  if (!token) return;
  const data = await helix(`channels/followers?broadcaster_id=${row.user_id}&first=20`, token);
  const { state, fresh } = core.diffFollows(followState.get(row.user_id) || null, data && data.data);
  followState.set(row.user_id, state);
  for (const f of fresh) push(row, core.makeEvent("follow", { name: f.name }));
}

/**
 * Alerts für die OBS-Quelle und das Dashboard. Fragt nebenbei die Follower ab.
 * @returns {{ events: object[] } | null}  null, wenn das Modul aus ist
 */
async function collect(row) {
  if (!alertsModuleOf(row)) return null;
  try {
    await pollFollows(row);
  } catch (e) {
    // 401/403: Recht fehlt oder Token abgelaufen — die anderen Alerts laufen trotzdem
    if (e.status !== 401 && e.status !== 403) console.warn("[stream-tool] Follower-Abfrage:", e.message);
  }
  return { events: core.recent(queues.get(row.user_id)) };
}

/** Test-Alert aus dem Dashboard. */
function testAlert(userId, kind) {
  const row = getByUser.get(String(userId));
  if (!row) return { error: "no_settings" };
  if (!alertsModuleOf(row)) return { error: "module_off" };
  const ev = core.testEvent(String(kind || ""), Date.now(), overlayLangOf(row));
  if (!ev) return { error: "bad_kind" };
  // Der Test zeigt immer, auch wenn die Art abgeschaltet ist oder unter der Schwelle läge
  queues.set(row.user_id, core.pushEvent(queues.get(row.user_id), ev));
  return { ok: true };
}

/** Beim Trennen von Twitch: alles zu diesem Kanal vergessen. */
function clear(userId) {
  queues.delete(String(userId));
  followState.delete(String(userId));
  followPolledAt.delete(String(userId));
}

module.exports = {
  MODULE_ID, FOLLOW_SCOPE,
  alertsModuleOf, getAlertChannels, collect, testAlert, clear,
  onSub, onResub, onSubGift, onAnonSubGift, onMysteryGift, onAnonMysteryGift, onCheer, onRaid,
};
