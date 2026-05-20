/**
 * Optional: Win-Challenge-Befehle im Twitch-Chat.
 * - Lesen + Verarbeiten: tmi (IRC) mit chat:read + chat:edit
 * - Antworten sichtbar im Chat: Helix "Send Chat Message" (user:write:chat + TWITCH_IRC_HELIX_CLIENT_ID
 *   derselben App wie der Bot-Token) — getrennt von TWITCH_CLIENT_ID (Website-Login). IRC allein oft ohne Webchat-Zeile.
 * .env: TWITCH_IRC_USERNAME, TWITCH_IRC_OAUTH=oauth:..., optional TWITCH_IRC_HELIX_CLIENT_ID
 */
let tmi = null;
try {
  tmi = require("tmi.js");
} catch {
  /* optional dependency */
}

const createWinchallengeRouter = require("./routes/winchallengeRoutes");

let client = null;
let refreshTimer = null;
function helixClientIdFromEnv() {
  return String(process.env.TWITCH_IRC_HELIX_CLIENT_ID || "").trim();
}

function bearerTokenFromEnv() {
  return normalizeIrcPassword(process.env.TWITCH_IRC_OAUTH).replace(
    /^oauth:/i,
    ""
  );
}

async function getFetch() {
  if (typeof globalThis.fetch === "function") {
    return globalThis.fetch;
  }
  const m = await import("node-fetch");
  return m.default;
}

/** Helix: Send Chat Message — zuverlässiger als IRC für sichtbare Chatzeilen. */
async function trySendChatViaHelix(broadcasterLogin, text) {
  const clientId = helixClientIdFromEnv();
  const botLogin = String(process.env.TWITCH_IRC_USERNAME || "")
    .trim()
    .toLowerCase();
  const bLogin = normalizeChannel(broadcasterLogin);
  const bearer = bearerTokenFromEnv();
  if (!clientId || !bearer || !botLogin || !bLogin) {
    return { ok: false, skip: "missing_client_id_or_token" };
  }
  if (text.length > 500) {
    text = text.slice(0, 497) + "…";
  }
  const fetch = await getFetch();
  const q = new URLSearchParams();
  q.append("login", bLogin);
  q.append("login", botLogin);
  const uRes = await fetch(`https://api.twitch.tv/helix/users?${q}`, {
    headers: {
      "Client-Id": clientId,
      Authorization: `Bearer ${bearer}`,
    },
  });
  const uJson = await uRes.json().catch(() => ({}));
  if (!uRes.ok) {
    return {
      ok: false,
      status: uRes.status,
      body: uJson,
      hint:
        uRes.status === 401
          ? "Token-Scopes prüfen (u. a. user:write:chat) und TWITCH_IRC_HELIX_CLIENT_ID derselben App wie der Bot-Token"
          : null,
    };
  }
  const users = uJson.data || [];
  const bid = users.find((x) => x.login && x.login.toLowerCase() === bLogin)
    ?.id;
  const sid = users.find((x) => x.login && x.login.toLowerCase() === botLogin)
    ?.id;
  if (!bid || !sid) {
    return {
      ok: false,
      body: uJson,
      hint: "User-IDs: Kanal- oder Bot-Login nicht in Helix gefunden",
    };
  }
  const res = await fetch("https://api.twitch.tv/helix/chat/messages", {
    method: "POST",
    headers: {
      "Client-Id": clientId,
      Authorization: `Bearer ${bearer}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      broadcaster_id: bid,
      sender_id: sid,
      message: text,
    }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      body: j,
      hint:
        res.status === 401
          ? "Für Helix: Scope user:write:chat + Client-ID; OAuth-App muss dem Token entsprechen"
          : res.status === 403
            ? "403: Bot ggf. gebannt / keine Rechte in diesem Chat"
            : null,
    };
  }
  const row = (j.data && j.data[0]) || {};
  return {
    ok: true,
    is_sent: row.is_sent,
    message_id: row.message_id,
    drop_reason: row.drop_reason,
  };
}

/**
 * Sichtbare Antwort: zuerst Helix (wenn Client-ID + Token), sonst IRC.
 */
async function sendTimerChatReply(ircChannel, reply) {
  const ch =
    ircChannel && String(ircChannel).startsWith("#")
      ? String(ircChannel)
      : "#" + normalizeChannel(ircChannel);
  const bLogin = normalizeChannel(ircChannel);
  const clientId = helixClientIdFromEnv();

  if (clientId) {
    const h = await trySendChatViaHelix(bLogin, reply);
    if (h && h.ok) {
      if (h.is_sent === false) {
        console.warn("[winchallenge irc] Helix: is_sent=false", h.drop_reason || "");
      }
      return;
    }
    if (h && !h.skip) {
      const bmsg = String((h.body && h.body.message) || "");
      const missingWriteChat =
        h.status === 401 && /user:write:chat/i.test(bmsg);
      if (!missingWriteChat) {
        console.warn(
          "[winchallenge irc] Helix",
          h.status,
          h.hint || "",
          h.body && typeof h.body === "object" ? JSON.stringify(h.body) : h.body
        );
      }
    }
  }

  if (client && typeof client.say === "function") {
    try {
      await client.say(ch, reply);
    } catch (e) {
      console.warn("[winchallenge irc] IRC say:", (e && e.message) || e);
    }
  }
}

function normalizeChannel(ch) {
  return String(ch || "")
    .trim()
    .toLowerCase()
    .replace(/^#/, "");
}

function getChannelList() {
  const db = createWinchallengeRouter.loadDb();
  const set = new Set();
  for (const doc of Object.values(db || {})) {
    const cc = doc?.chatCommands;
    if (!cc?.enabled) continue;
    const c = normalizeChannel(cc.channel);
    if (c) set.add(c);
  }
  return [...set];
}

function findUserIdForChannel(channelName) {
  const name = normalizeChannel(channelName);
  const db = createWinchallengeRouter.loadDb();
  for (const [uid, doc] of Object.entries(db || {})) {
    const cc = doc?.chatCommands;
    if (!cc?.enabled) continue;
    if (normalizeChannel(cc.channel) === name) return uid;
  }
  return null;
}

function isAllowedSender(tags, doc) {
  const req = doc?.chatCommands?.requireModOrBroadcaster !== false;
  if (!req) return true;
  if (tags.mod === true || tags.mod === "1") return true;
  const userType = tags["user-type"] || tags.userType;
  if (userType === "mod" || userType === "global_mod") return true;
  // tmi.js: badges oft { broadcaster: "1" } — String(badges) === "[object Object]" → vormals false
  const b = tags.badges;
  if (b && typeof b === "object" && b.broadcaster != null) return true;
  if (typeof b === "string" && b.includes("broadcaster")) return true;
  return false;
}

const CHAT_REPLIES = {
  start: "Timer wurde gestartet.",
  pause: "Timer wurde pausiert.",
  reset: "Timer wurde zurückgesetzt.",
  hide: "Timer ausgeblendet.",
  show: "Timer eingeblendet.",
};

async function applyChatLine(userId, msg) {
  const m = msg.trim().toLowerCase();
  const db = createWinchallengeRouter.loadDb();
  const raw = db[userId];
  if (!raw) return { changed: false, reply: null };
  let doc = createWinchallengeRouter.ensureDocShape(raw);
  const perms = doc.controlPermissions || {};
  if (!perms.allowModsTimer) return { changed: false, reply: null };

  let replyKey = null;

  if (m === "!starttimer") {
    if (!doc.timer.running) {
      doc.timer.running = true;
      doc.timer.startedAt = Date.now() - (doc.timer.elapsedMs || 0);
      replyKey = "start";
    }
  } else if (m === "!stoptimer" || m === "!pausetimer") {
    if (doc.timer.running) {
      doc.timer.running = false;
      doc.timer.elapsedMs = Date.now() - (doc.timer.startedAt || Date.now());
      replyKey = "pause";
    }
  } else if (m === "!resettimer") {
    doc.timer.running = false;
    doc.timer.startedAt = 0;
    doc.timer.elapsedMs = 0;
    replyKey = "reset";
  } else if (m === "!hidetimer" || m === "!timerhide") {
    if (doc.timer.visible !== false) {
      doc.timer.visible = false;
      replyKey = "hide";
    }
  } else if (m === "!showtimer" || m === "!timershow") {
    if (doc.timer.visible !== true) {
      doc.timer.visible = true;
      replyKey = "show";
    }
  } else {
    return { changed: false, reply: null };
  }

  if (!replyKey) return { changed: false, reply: null };

  doc.updatedAt = Date.now();
  await createWinchallengeRouter.setUserAndSaveDoc(userId, doc);
  return { changed: true, reply: CHAT_REPLIES[replyKey] || null };
}

async function onChatMessage(channel, tags, message, self) {
  if (self) return;
  const ch = normalizeChannel(channel.replace(/^#/, ""));
  const uid = findUserIdForChannel(ch);
  if (!uid) return;
  const db = createWinchallengeRouter.loadDb();
  const doc = db[uid];
  if (!doc?.chatCommands?.enabled) return;
  if (!isAllowedSender(tags, doc)) return;
  let shaped;
  try {
    shaped = createWinchallengeRouter.ensureDocShape({ ...doc, userId: uid });
  } catch {
    shaped = { chatCommands: doc.chatCommands };
  }
  const replyInChat = shaped?.chatCommands?.replyInChat !== false;
  try {
    const result = await applyChatLine(uid, message);
    const reply = result && result.reply;
    if (result && result.changed) {
      if (replyInChat && reply) {
        setImmediate(() => {
          void sendTimerChatReply(channel, reply);
        });
      }
    }
  } catch (e) {
    console.error("[winchallenge irc] command failed:", e.message);
  }
}

function stopIrc() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
  if (client) {
    try {
      client.disconnect();
    } catch {
      /* */
    }
    client = null;
  }
}

async function syncChannels() {
  if (!client) return;
  const want = new Set(getChannelList());
  const raw = typeof client.getChannels === "function" ? client.getChannels() : [];
  const current = new Set(
    (raw || []).map((c) => normalizeChannel(String(c)))
  );
  for (const c of want) {
    if (!current.has(c)) {
      try {
        await client.join("#" + c);
      } catch (e) {
        console.warn("[winchallenge irc] join failed", c, e.message);
      }
    }
  }
  for (const c of current) {
    if (!want.has(c)) {
      try {
        await client.part("#" + c);
      } catch {
        /* */
      }
    }
  }
}

function normalizeIrcPassword(raw) {
  const t = String(raw || "").trim();
  if (!t) return t;
  const without = t.replace(/^oauth:/i, "");
  return "oauth:" + without;
}

async function initWinchallengeIrc() {
  if (!tmi) {
    console.log("[winchallenge irc] tmi.js nicht installiert — Chat-Commands deaktiviert.");
    return;
  }
  const user = String(process.env.TWITCH_IRC_USERNAME || "").trim().toLowerCase();
  const pass = normalizeIrcPassword(process.env.TWITCH_IRC_OAUTH);
  if (!user || !pass) {
    console.log(
      "[winchallenge irc] TWITCH_IRC_USERNAME / TWITCH_IRC_OAUTH fehlen — Chat-Commands nur in der UI konfigurierbar, IRC aus."
    );
    return;
  }

  const channels = getChannelList().map((c) => "#" + c);
  client = new tmi.Client({
    options: { skipUpdatingEmotesets: true },
    connection: { reconnect: true, secure: true },
    identity: { username: user, password: pass },
    channels,
  });

  client.on("message", onChatMessage);
  client.on("notice", (ircChannel, messageId, message) => {
    const m = String(message || "");
    const mid = String(messageId || "");
    if (
      /Login authentication failed|improperly formatted auth|not valid/i.test(m)
    ) {
      console.error(
        "[winchallenge irc] Anmeldung abgelehnt. Token: User-Token des gleichen Logins wie TWITCH_IRC_USERNAME, mit Scopes chat:read + chat:edit, in .env als oauth:…"
      );
    }
    // Twitch meldet PRIVMSG-Probleme oft hier (E-Mail, Follow-Only, Rate), nicht in say().catch
    if (
      mid.startsWith("msg_") ||
      /message was not sent|cannot send|verify your|must follow|subscribers|bad auth|sending messages too quickly|rejected|ban/i.test(
        m
      )
    ) {
      console.warn(
        "[winchallenge irc] NOTICE",
        ircChannel || "",
        mid || "(kein msg-id)",
        m
      );
    }
  });
  client.on("connected", () => {
    console.log("[winchallenge irc] verbunden als", user);
  });

  try {
    await client.connect();
    await syncChannels();
  } catch (e) {
    console.error("[winchallenge irc] connect failed:", e.message);
    client = null;
    return;
  }

  refreshTimer = setInterval(() => {
    syncChannels().catch((e) =>
      console.warn("[winchallenge irc] sync:", e.message)
    );
  }, 30_000);
}

/** Nach Speichern der Win-Challenge-Chat-Einstellungen: Kanal-Joins aktualisieren */
function afterWinchallengeConfigSaved() {
  if (!client) return;
  syncChannels().catch((e) =>
    console.warn("[winchallenge irc] sync nach Save:", e.message)
  );
}

module.exports = { initWinchallengeIrc, stopIrc, afterWinchallengeConfigSaved };
