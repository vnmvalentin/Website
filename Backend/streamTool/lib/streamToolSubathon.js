// streamToolSubathon.js — Overlay-Modul „Subathon-Timer“: ein Countdown, den Abos, Bits und Spenden verlängern.
//
// Woher die Zeit kommt:
//  - Abos, Verlängerungen, Geschenk-Abos und Bits: aus dem Chat, über denselben Bot wie Alerts und Statistik
//    (lib/winchallengeIrc.js ruft die on…-Funktionen hier auf).
//  - Spenden: Twitch kennt keine. Der Streamer trägt sie im Dashboard ein, oder ein Mod (bzw. Streamer.bot im Namen
//    des Streamers) schreibt „!subathon spende 10 Name“ in den Chat.
//  - Von Hand: ± Zeit im Dashboard oder „!subathon +10m“ im Chat.
//
// Der Zustand liegt in der Spalte `subathon` (streamToolStore.js) und übersteht Neustarts. Die Logik selbst steht
// in subathonCore.js (ohne Datenbank, testbar).
const core = require("./subathonCore");
const { GiftBundles, tierOf } = require("./alertsCore");
const { db } = require("./streamToolStore");
const { chatText } = require("./chatText");

const MODULE_ID = "subathon";
/** Abklingzeit der Restzeit-Abfrage „!subathon“ je Kanal. */
const INFO_COOLDOWN_MS = 30 * 1000;

const listConnected = db.prepare(
  "SELECT * FROM stream_tool_settings WHERE token_enc <> '' AND twitch_login <> ''"
);
const getByLogin = db.prepare("SELECT * FROM stream_tool_settings WHERE twitch_login = ?");
const getByUser = db.prepare("SELECT * FROM stream_tool_settings WHERE user_id = ?");
const setState = db.prepare("UPDATE stream_tool_settings SET subathon = ? WHERE user_id = ?");

const normalizeLogin = (v) => String(v || "").trim().toLowerCase().replace(/^#/, "");

function parseJson(raw) {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Die Modul-Einstellungen, oder null wenn das Modul aus ist. */
function subathonModuleOf(row) {
  const mod = parseJson(row && row.config)?.modules?.[MODULE_ID];
  if (!mod || typeof mod !== "object" || !mod.enabled) return null;
  return mod;
}

const readState = (row) => core.normalize(parseJson(row && row.subathon));
const writeState = (userId, state) => setState.run(JSON.stringify(state), String(userId));

/**
 * Happy Hour gehört zum Abo (billing/entitlements.js). Erst beim Gebrauch geladen: die Rechnung des Timers soll ohne
 * Abo-Datenbank auskommen. Kann die Abfrage nicht antworten, zählt keine Happy Hour.
 */
function premiumOf(userId) {
  try {
    return require("../../billing/entitlements").isPremium(userId);
  } catch {
    return false;
  }
}

/** Faktor für ein Ereignis jetzt: 2 oder 3 während einer Happy Hour mit Abo, sonst 1. */
function factorOf(row, state, now) {
  const f = core.happyFactor(state, now);
  return f > 1 && premiumOf(row.user_id) ? f : 1;
}

/** Kanäle, in denen der Bot für den Subathon mitlesen soll. */
function getSubathonChannels() {
  const out = new Set();
  for (const row of listConnected.all()) {
    if (subathonModuleOf(row)) out.add(normalizeLogin(row.twitch_login));
  }
  out.delete("");
  return [...out];
}

function rowOfChannel(channel) {
  const login = normalizeLogin(channel);
  return login ? getByLogin.get(login) : null;
}

/**
 * Zeit nach den Regeln gutschreiben. Synchron und ohne await — better-sqlite3 schreibt sofort, so können sich zwei
 * Ereignisse beim Lesen und Schreiben nicht überholen.
 * @returns {object|null} der Eintrag im Verlauf, oder null wenn nichts gezählt wurde
 */
function credit(row, info) {
  const mod = subathonModuleOf(row);
  if (!mod) return null;
  const ms = core.msForEvent(mod, info);
  if (!(ms > 0)) return null;
  const now = Date.now();
  const before = readState(row);
  const factor = factorOf(row, before, now);
  const { state, entry } = core.addTime(before, mod, ms * factor, { ...info, factor }, now);
  if (!entry) return null;
  writeState(row.user_id, state);
  return entry;
}

function creditChannel(channel, info) {
  const row = rowOfChannel(channel);
  return row ? credit(row, info) : null;
}

const nameOf = (tags, fallback) => (tags && (tags["display-name"] || tags.login || tags.username)) || fallback || "";
const bundles = new GiftBundles();

/* ── Chat-Ereignisse (Signaturen wie tmi.js, wie bei den Alerts) ───────────── */

function onSub(channel, username, methods, message, tags) {
  return !!creditChannel(channel, { kind: "sub", name: nameOf(tags, username), amount: 1, tier: tierOf(methods) });
}

function onResub(channel, username, months, message, tags, methods) {
  return !!creditChannel(channel, { kind: "resub", name: nameOf(tags, username), amount: 1, tier: tierOf(methods) });
}

/** Einzelnes Geschenk. Gehört es zu einem angekündigten Paket, ist es dort schon gezählt. */
function onSubGift(channel, username, streakMonths, recipient, methods, tags) {
  const gifter = (tags && tags.login) || username;
  if (bundles.absorb(normalizeLogin(channel), gifter)) return false;
  return !!creditChannel(channel, { kind: "gift", name: nameOf(tags, username), amount: 1, tier: tierOf(methods) });
}

function onAnonSubGift(channel, streakMonths, recipient, methods) {
  if (bundles.absorb(normalizeLogin(channel), "")) return false;
  return !!creditChannel(channel, { kind: "gift", name: "", amount: 1, tier: tierOf(methods) });
}

/** Geschenkpaket: ein Eintrag mit der ganzen Zeit, die Einzelgeschenke danach werden geschluckt. */
function onMysteryGift(channel, username, count, methods, tags) {
  bundles.note(normalizeLogin(channel), (tags && tags.login) || username, count);
  return !!creditChannel(channel, { kind: "gift", name: nameOf(tags, username), amount: count, tier: tierOf(methods) });
}

function onAnonMysteryGift(channel, count, methods) {
  bundles.note(normalizeLogin(channel), "", count);
  return !!creditChannel(channel, { kind: "gift", name: "", amount: count, tier: tierOf(methods) });
}

function onCheer(channel, tags) {
  const bits = Math.round(Number(tags && tags.bits) || 0);
  if (!(bits > 0) || bits > 1_000_000) return false;
  return !!creditChannel(channel, { kind: "bits", name: nameOf(tags, ""), amount: bits });
}

/* ── Dashboard ─────────────────────────────────────────────────────────────── */

/**
 * Änderung aus dem Dashboard. fn bekommt den aktuellen Zustand und gibt den neuen zurück (oder { error }).
 * @returns {{ ok: true, subathon: object } | { error: string }}
 */
function change(userId, fn) {
  const row = getByUser.get(String(userId));
  if (!row) return { error: "no_settings" };
  const mod = subathonModuleOf(row);
  if (!mod) return { error: "subathon_module_off" };
  const now = Date.now();
  const result = fn(readState(row), mod, now, row);
  if (result && result.error) return { error: result.error };
  writeState(row.user_id, result);
  return { ok: true, subathon: viewFor(row, core.dashboardView(result, mod, now)) };
}

/** Ohne Abo zeigt keine Ansicht eine Happy Hour (etwa wenn das Abo mitten in einer endet). */
const viewFor = (row, view) => (view && view.happy && !premiumOf(row.user_id) ? { ...view, happy: null } : view);

const startTimer = (userId) => change(userId, (s, mod, now) => core.start(s, mod, now));
const pauseTimer = (userId) => change(userId, (s, mod, now) => core.pause(s, now));
const resetTimer = (userId) => change(userId, (s) => core.reset(s));

/** ± Sekunden von Hand. */
function addManual(userId, seconds, name) {
  const ms = Math.round(Number(seconds) * 1000);
  if (!Number.isFinite(ms) || !ms || Math.abs(ms) > core.MAX_MANUAL_MS) return { error: "subathon_bad_amount" };
  return change(userId, (s, mod, now) => {
    const { state, entry } = core.addTime(s, mod, ms, { kind: "manual", name }, now);
    return entry ? state : { error: "subathon_not_running" };
  });
}

/** Spende eintragen: Betrag × Regel „je Einheit“ (× Happy Hour). */
function addDonation(userId, amount, name) {
  const value = core.parseAmount(amount);
  if (!value) return { error: "subathon_bad_amount" };
  return change(userId, (s, mod, now, row) => {
    const ms = core.msForEvent(mod, { kind: "donation", amount: value });
    if (!(ms > 0)) return { error: "subathon_no_rule" };
    const factor = factorOf(row, s, now);
    const { state, entry } = core.addTime(s, mod, ms * factor, { kind: "donation", name, amount: value, factor }, now);
    return entry ? state : { error: "subathon_not_running" };
  });
}

/** Happy Hour starten (Abo-Extra): minutes 1–240, factor 2 oder 3. */
function startHappyHour(userId, minutes, factor) {
  if (!premiumOf(userId)) return { error: "premium_needed" };
  return change(userId, (s, mod, now) => core.startHappy(s, minutes, factor, now));
}

const stopHappyHour = (userId) => change(userId, (s, mod, now) => core.stopHappy(s, now));

/** Anzeigedaten für die OBS-Quelle; null, wenn das Modul aus ist. */
function collect(row) {
  const mod = subathonModuleOf(row);
  return mod ? viewFor(row, core.publicView(readState(row), mod)) : null;
}

/** Dasselbe fürs Dashboard, mit Verlauf. */
function collectDashboard(row) {
  const mod = subathonModuleOf(row);
  return mod ? viewFor(row, core.dashboardView(readState(row), mod)) : null;
}

/* ── Chat-Befehl !subathon ─────────────────────────────────────────────────── */

const isModOrBroadcaster = (tags) => {
  if (!tags) return false;
  if (tags.mod === true || tags.mod === "1") return true;
  const b = tags.badges;
  if (b && typeof b === "object" && b.broadcaster != null) return true;
  return typeof b === "string" && b.includes("broadcaster");
};

/** Sichtbare Chatzeile über den Bot. Fehlt er, passiert einfach nichts. */
function say(login, text) {
  try {
    require("../../lib/winchallengeIrc").say(login, text);
  } catch {
    /* IRC optional */
  }
}

/** Stand als Satz für den Chat (aus publicView/dashboardView). */
function statusLine(t, view) {
  if (view.status === "running") return t.running(core.clockText(view.remainingMs));
  if (view.status === "paused") return t.paused(core.clockText(view.remainingMs));
  if (view.status === "ended") return t.ended(core.clockText(view.elapsedMs));
  return t.idle;
}

const infoAt = new Map();

/**
 * Chatzeile, die mit "!" beginnt. Für Kanäle ohne Subathon und für alle anderen Befehle sofort wieder draußen.
 * Restzeit fragen darf jeder (abschaltbar, mit Abklingzeit), steuern nur Mods und der Streamer.
 */
function onChatCommand(channel, tags, message) {
  const text = String(message || "").trim();
  if (!/^!subathon(\s|$)/i.test(text)) return;
  const login = normalizeLogin(channel);
  const row = login ? getByLogin.get(login) : null;
  const mod = row && subathonModuleOf(row);
  if (!mod) return;
  const cmd = core.parseCommand(text);
  if (!cmd) return;
  const t = chatText(row).subathon;
  const now = Date.now();

  if (cmd.action === "info") {
    if (mod.chatInfo === false) return;
    if (now - (infoAt.get(login) || 0) < INFO_COOLDOWN_MS) return;
    infoAt.set(login, now);
    say(login, statusLine(t, core.publicView(readState(row), mod, now)));
    return;
  }

  if (mod.chatMods === false || !isModOrBroadcaster(tags)) return;
  const by = nameOf(tags, "");
  let result = null;
  if (cmd.action === "start") result = startTimer(row.user_id);
  else if (cmd.action === "pause") result = pauseTimer(row.user_id);
  else if (cmd.action === "add") result = addManual(row.user_id, cmd.ms / 1000, cmd.name || by);
  else if (cmd.action === "donation") result = addDonation(row.user_id, cmd.amount, cmd.name);
  else if (cmd.action === "happy") result = startHappyHour(row.user_id, cmd.minutes, cmd.factor);
  else if (cmd.action === "happyStop") result = stopHappyHour(row.user_id);
  // Ohne Abo bleibt „happy“ stumm — der Chat ist kein Werbeplatz
  if (!result || result.error) return;

  const view = result.subathon;
  const time = core.clockText(view.remainingMs);
  if (cmd.action === "happy") say(login, t.happyOn(cmd.factor, cmd.minutes));
  else if (cmd.action === "happyStop") say(login, t.happyOff);
  else if (cmd.action === "start") say(login, view.status === "running" ? t.started(time) : statusLine(t, view));
  else if (cmd.action === "pause") say(login, view.status === "paused" ? t.pausedNow(time) : statusLine(t, view));
  else {
    const entry = view.log[0];
    if (entry && entry.capped && entry.ms <= 0) say(login, t.capped(time));
    else if (entry) say(login, t.added(core.deltaText(entry.ms), time));
  }
}

module.exports = {
  MODULE_ID,
  subathonModuleOf, getSubathonChannels, collect, collectDashboard,
  startTimer, pauseTimer, resetTimer, addManual, addDonation, startHappyHour, stopHappyHour,
  onSub, onResub, onSubGift, onAnonSubGift, onMysteryGift, onAnonMysteryGift, onCheer, onChatCommand,
};
