// status.js — der Stand aller Streamer-Werkzeuge eines Nutzers für die Streamer-Zentrale.
//
// Rein lesend: nichts wird angelegt (die „me“-Abrufe der Werkzeuge legen beim ersten Aufruf eine Zeile an — die
// Zentrale soll aber nur zeigen, was es schon gibt). Die Quellen kommen von außen (routes.js verdrahtet die echten
// Speicher, der Test reicht Attrappen herein), damit diese Datei ohne Datenbank prüfbar bleibt.
//
// Hinweise (issues) sind Codes; die Texte dazu stehen im Frontend (StreamerTools/zentrale/zentraleTexts.js).

/** Module der Twitch-Overlays, die den Chat-Bot brauchen (wie CHAT_MODULE_IDS in streamToolRoutes.js). */
const TWITCH_CHAT_MODULES = ["raidClip", "streamStats", "alerts", "subathon", "hypeTrain", "raidStorm", "marbleRun"];

/** Welches Twitch-Recht ein eingeschaltetes Modul braucht (sonst bleibt es leer). */
function neededScopes(modules) {
  const need = new Set();
  const on = (id) => modules?.[id]?.enabled;
  if (on("subGoal")) need.add(modules.subGoal.source === "twitch" ? "channel:read:goals" : "channel:read:subscriptions");
  if (on("followerGoal") && modules.followerGoal.source === "twitch") need.add("channel:read:goals");
  if (on("alerts") && modules.alerts.kinds?.follow !== false) need.add("moderator:read:followers");
  if (on("hypeTrain")) need.add("channel:read:hype_train");
  if (on("raidStorm") && modules.raidStorm.guessNames !== false) need.add("moderator:read:chatters");
  return [...need];
}

function parseJson(raw) {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function twitchStatus(row, seenAt, irc) {
  if (!row) return { used: false, issues: [] };
  const config = parseJson(row.config);
  const modules = config && config.modules && typeof config.modules === "object" ? config.modules : null;
  const enabled = modules ? Object.keys(modules).filter((id) => modules[id] && modules[id].enabled) : null;
  const scopes = String(row.scopes || "").split(" ").filter(Boolean);
  const connected = !!row.token_enc;
  const issues = [];
  if (!connected) issues.push("twitch_not_connected");
  else if (neededScopes(modules).some((s) => !scopes.includes(s))) issues.push("twitch_scopes");
  if (enabled && enabled.some((id) => TWITCH_CHAT_MODULES.includes(id)) && irc && !irc.configured) issues.push("no_bot");
  return {
    used: true,
    connected,
    login: row.twitch_login || "",
    // null = noch nie gespeichert (dann gelten die Standard-Module des Editors)
    modules: enabled,
    seenAt: seenAt || 0,
    overlayPath: row.overlay_key ? `/twitch-tools/overlay/${row.overlay_key}` : "",
    issues,
  };
}

function winChallengeStatus(doc, seenAt) {
  if (!doc) return { used: false, issues: [] };
  const items = Array.isArray(doc.items) ? doc.items : [];
  const cc = doc.chatCommands || {};
  const channels = Array.isArray(cc.channels) ? cc.channels.filter(Boolean) : (cc.channel ? [cc.channel] : []);
  const issues = [];
  if (cc.enabled && !channels.length) issues.push("wc_chat_no_channel");
  return {
    used: true,
    total: items.length,
    open: items.filter((it) => it && !it.done).length,
    chat: !!cc.enabled,
    seenAt: seenAt || 0,
    overlayPath: doc.overlayKey ? `/WinChallengeOverlay/${doc.overlayKey}` : "",
    issues,
  };
}

function winTrackerStatus(settings, accounts) {
  const list = Array.isArray(accounts) ? accounts : [];
  if (!settings && !list.length) return { used: false, issues: [] };
  const active = list.find((a) => a.is_active) || list[0] || null;
  const issues = [];
  if (!list.length) issues.push("wt_no_account");
  return {
    used: true,
    accounts: list.length,
    active: active ? (active.player_name || active.player_tag || "") : "",
    // Der Tracker holt neue Daten, solange Overlay oder Editor offen sind — das ist „zuletzt Daten“
    lastFetched: active ? Number(active.last_fetched) || 0 : 0,
    overlayPath: settings && settings.overlay_key ? `/clash-royale/win-tracker/overlay/${settings.overlay_key}` : "",
    issues,
  };
}

function viewerGamesStatus(row, live, irc) {
  if (!row) return { used: false, issues: [] };
  const issues = [];
  if (irc && !irc.configured) issues.push("no_bot");
  return {
    used: true,
    modes: Array.isArray(row.settings?.modes) ? row.settings.modes : [],
    live: !!live,
    overlayPath: row.overlay_key ? `/clash/viewer-games/overlay/${row.overlay_key}` : "",
    issues,
  };
}

function bingoStatus(sessions, seenAt) {
  const list = Array.isArray(sessions) ? sessions : [];
  if (!list.length) return { used: false, issues: [] };
  const latest = list.reduce((a, b) => ((b.updatedAt || 0) > (a.updatedAt || 0) ? b : a), list[0]);
  return {
    used: true,
    cards: list.length,
    latest: latest.themeName || "Bingo",
    updatedAt: latest.updatedAt || 0,
    seenAt: seenAt || 0,
    issues: [],
  };
}

/** Eine Quelle darf scheitern, ohne die ganze Übersicht zu kosten. */
function safely(fn, fallback) {
  try {
    const v = fn();
    return v === undefined ? fallback : v;
  } catch (e) {
    console.warn("[streamer-zentrale] Quelle nicht lesbar:", e.message);
    return fallback;
  }
}

/**
 * @param {object} src  Quellen (alle optional, jede darf werfen):
 *   streamToolRow(userId), wcDoc(userId), bingoSessions(userId), wtSettings(userId), wtAccounts(userId),
 *   vgRow(userId), vgLive(login), irc(), presence(userId)
 * @param {{ id: string, login?: string }} user
 */
function buildStatus(src, user, now = Date.now()) {
  const id = String(user.id);
  const login = String(user.login || "").toLowerCase();
  const irc = safely(() => src.irc && src.irc(), null);
  const seen = safely(() => src.presence && src.presence(id), {}) || {};
  return {
    serverNow: now,
    chatBot: irc ? { configured: !!irc.configured, connected: !!irc.connected } : null,
    tools: {
      twitch: twitchStatus(safely(() => src.streamToolRow(id), null), seen.twitch, irc),
      winChallenge: winChallengeStatus(safely(() => src.wcDoc(id), null), seen.wc),
      winTracker: winTrackerStatus(safely(() => src.wtSettings(id), null), safely(() => src.wtAccounts(id), [])),
      viewerGames: viewerGamesStatus(safely(() => src.vgRow(id), null), safely(() => src.vgLive(login), false), irc),
      bingo: bingoStatus(safely(() => src.bingoSessions(id), []), seen.bingo),
    },
  };
}

module.exports = { buildStatus, neededScopes, TWITCH_CHAT_MODULES };
