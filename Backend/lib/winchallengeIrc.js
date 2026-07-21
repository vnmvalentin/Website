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

const createWinchallengeRouter = require("../routes/winchallengeRoutes");
const { step } = require("./startupLog");

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

/** Alle aktivierten Kanäle eines Docs (Mehrkanal-Support, legacy: einzelnes channel-Feld) */
function channelsOfDoc(doc) {
  const cc = doc?.chatCommands;
  if (!cc?.enabled) return [];
  const list =
    Array.isArray(cc.channels) && cc.channels.length
      ? cc.channels
      : [cc.channel];
  return list.map(normalizeChannel).filter(Boolean);
}

function getChannelList() {
  const db = createWinchallengeRouter.loadDb();
  const set = new Set();
  for (const doc of Object.values(db || {})) {
    for (const c of channelsOfDoc(doc)) set.add(c);
  }
  return [...set];
}

function findUserIdForChannel(channelName) {
  const name = normalizeChannel(channelName);
  const db = createWinchallengeRouter.loadDb();
  for (const [uid, doc] of Object.entries(db || {})) {
    if (channelsOfDoc(doc).includes(name)) return uid;
  }
  return null;
}

function isAllowedSender(tags, doc, isOwner) {
  const req = doc?.chatCommands?.requireModOrBroadcaster !== false;
  if (!req) return true;
  if (isOwner) return true;
  if (tags.mod === true || tags.mod === "1") return true;
  const userType = tags["user-type"] || tags.userType;
  if (userType === "mod" || userType === "global_mod") return true;
  // tmi.js: badges oft { broadcaster: "1" } — String(badges) === "[object Object]" → vormals false
  const b = tags.badges;
  if (b && typeof b === "object" && b.broadcaster != null) return true;
  if (typeof b === "string" && b.includes("broadcaster")) return true;
  return false;
}

/** Für die unscharfe Suche: klein, ohne Leer-/Sonderzeichen ("Rocket League Wins" → "rocketleaguewins") */
function normalizeForMatch(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

/**
 * Unscharfe Challenge-Suche: exakter Treffer > Präfix > Teilstring.
 * "!pin minecraft" findet "Minecraft Enderdragon besiegen",
 * "!pin rocketleague" findet "Rocket League Wins".
 */
function findChallengeMatches(items, query) {
  const q = normalizeForMatch(query);
  if (!q) return [];
  const scored = [];
  for (const it of items || []) {
    const n = normalizeForMatch(it && it.name);
    if (!n) continue;
    let score = 0;
    if (n === q) score = 3;
    else if (n.startsWith(q)) score = 2;
    else if (n.includes(q)) score = 1;
    if (score > 0) scored.push({ it, score });
  }
  if (!scored.length) return [];
  const best = Math.max(...scored.map((s) => s.score));
  return scored.filter((s) => s.score === best).map((s) => s.it);
}

/** "HH:MM:SS" oder "MM:SS" → Millisekunden (null bei ungültigem Format) */
function parseClockToMs(str) {
  const m = String(str || "")
    .trim()
    .match(/^(\d{1,3}):(\d{1,2})(?::(\d{1,2}))?$/);
  if (!m) return null;
  const hasHours = m[3] != null;
  const h = hasHours ? parseInt(m[1], 10) : 0;
  const min = hasHours ? parseInt(m[2], 10) : parseInt(m[1], 10);
  const s = hasHours ? parseInt(m[3], 10) : parseInt(m[2], 10);
  if (hasHours && min > 59) return null;
  if (s > 59) return null;
  return (h * 3600 + min * 60 + s) * 1000;
}

function msToClock(ms) {
  if (!ms || ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

/**
 * !pin / !unpin / !+ / !- auf eine Challenge anwenden.
 * @returns {{ itemId: string|null, patch: object|null, reply: string|null, changed: boolean }}
 */
function resolveChallengeCommand(items, kind, query) {
  const matches = findChallengeMatches(items, query);
  if (matches.length === 0) {
    return {
      itemId: null,
      patch: null,
      changed: false,
      reply: `Keine Challenge gefunden für "${query}".`,
    };
  }
  if (matches.length > 1) {
    const names = matches.slice(0, 3).map((m) => m.name).join(", ");
    return {
      itemId: null,
      patch: null,
      changed: false,
      reply: `Mehrere Treffer für "${query}": ${names} — bitte genauer angeben.`,
    };
  }
  const it = matches[0];

  if (kind === "pin") {
    if (it.pinned)
      return { itemId: null, patch: null, changed: false, reply: `"${it.name}" ist bereits angepinnt.` };
    return { itemId: it.id, patch: { pinned: true }, changed: true, reply: `"${it.name}" angepinnt.` };
  }
  if (kind === "unpin") {
    if (!it.pinned)
      return { itemId: null, patch: null, changed: false, reply: `"${it.name}" ist nicht angepinnt.` };
    return { itemId: it.id, patch: { pinned: false }, changed: true, reply: `"${it.name}" gelöst.` };
  }
  if (kind === "plus") {
    if (it.useWins) {
      const next = (it.progress || 0) + 1;
      const doneNow = next >= (it.target || 0);
      return {
        itemId: it.id,
        patch: { progress: next },
        changed: true,
        reply: `"${it.name}": ${next}/${it.target || 0}${doneNow ? " — abgeschlossen!" : ""}`,
      };
    }
    if (it.done)
      return { itemId: null, patch: null, changed: false, reply: `"${it.name}" ist bereits abgeschlossen.` };
    return { itemId: it.id, patch: { done: true }, changed: true, reply: `"${it.name}" abgeschlossen!` };
  }
  if (kind === "minus") {
    if (it.useWins) {
      const next = Math.max(0, (it.progress || 0) - 1);
      if (next === (it.progress || 0))
        return { itemId: null, patch: null, changed: false, reply: `"${it.name}" steht bereits bei 0.` };
      return {
        itemId: it.id,
        patch: { progress: next },
        changed: true,
        reply: `"${it.name}": ${next}/${it.target || 0}`,
      };
    }
    if (!it.done)
      return { itemId: null, patch: null, changed: false, reply: `"${it.name}" ist noch offen.` };
    return { itemId: it.id, patch: { done: false }, changed: true, reply: `"${it.name}" wieder offen.` };
  }
  return { itemId: null, patch: null, changed: false, reply: null };
}

async function applyChatLine(userId, msg, { isOwner = false } = {}) {
  const raw = String(msg || "").trim();
  const lower = raw.toLowerCase();
  if (!raw.startsWith("!")) return { changed: false, reply: null };

  const db = createWinchallengeRouter.loadDb();
  const stored = db[userId];
  if (!stored) return { changed: false, reply: null };
  let doc = createWinchallengeRouter.ensureDocShape(stored);
  const perms = doc.controlPermissions || {};
  const canTimer = isOwner || !!perms.allowModsTimer;
  const canChallenges = isOwner || !!perms.allowModsChallenges;

  let reply = null;
  let changed = false;

  // ---- Timer-Befehle ----
  const setMatch = lower.match(/^!settimer\s+(\S+)$/);
  if (lower === "!starttimer") {
    if (!canTimer) return { changed: false, reply: null };
    if (!doc.timer.running) {
      doc.timer.running = true;
      doc.timer.startedAt = Date.now() - (doc.timer.elapsedMs || 0);
      changed = true;
      reply = "Timer wurde gestartet.";
    }
  } else if (lower === "!stoptimer" || lower === "!pausetimer") {
    if (!canTimer) return { changed: false, reply: null };
    if (doc.timer.running) {
      doc.timer.running = false;
      doc.timer.elapsedMs = Date.now() - (doc.timer.startedAt || Date.now());
      changed = true;
      reply = "Timer wurde pausiert.";
    }
  } else if (lower === "!resettimer") {
    if (!canTimer) return { changed: false, reply: null };
    doc.timer.running = false;
    doc.timer.startedAt = 0;
    doc.timer.elapsedMs = 0;
    changed = true;
    reply = "Timer wurde zurückgesetzt.";
  } else if (lower === "!hidetimer" || lower === "!timerhide") {
    if (!canTimer) return { changed: false, reply: null };
    if (doc.timer.visible !== false) {
      doc.timer.visible = false;
      changed = true;
      reply = "Timer ausgeblendet.";
    }
  } else if (lower === "!showtimer" || lower === "!timershow") {
    if (!canTimer) return { changed: false, reply: null };
    if (doc.timer.visible !== true) {
      doc.timer.visible = true;
      changed = true;
      reply = "Timer eingeblendet.";
    }
  } else if (setMatch) {
    if (!canTimer) return { changed: false, reply: null };
    const ms = parseClockToMs(setMatch[1]);
    if (ms == null) {
      reply = "Format: !settimer HH:MM:SS (oder MM:SS)";
    } else {
      doc.timer.elapsedMs = ms;
      if (doc.timer.running) doc.timer.startedAt = Date.now() - ms;
      changed = true;
      reply = `Timer auf ${msToClock(ms)} gesetzt.`;
    }
  } else {
    // ---- Challenge-Befehle: !pin / !unpin / !+ / !- mit unscharfer Suche ----
    let kind = null;
    let query = "";
    let m;
    if ((m = raw.match(/^!pin\s+(.+)$/i))) {
      kind = "pin";
      query = m[1];
    } else if ((m = raw.match(/^!unpin\s+(.+)$/i))) {
      kind = "unpin";
      query = m[1];
    } else if ((m = raw.match(/^!\+\s*(.+)$/))) {
      kind = "plus";
      query = m[1];
    } else if ((m = raw.match(/^!-\s*(.+)$/))) {
      kind = "minus";
      query = m[1];
    }
    if (!kind) return { changed: false, reply: null };
    if (!canChallenges) return { changed: false, reply: null };

    const result = resolveChallengeCommand(doc.items || [], kind, query.trim());
    reply = result.reply;
    changed = result.changed;
    if (result.changed && result.itemId) {
      doc.items = (doc.items || []).map((it) =>
        it.id === result.itemId ? { ...it, ...result.patch } : it
      );
    }
  }

  if (!changed) return { changed: false, reply };

  doc.updatedAt = Date.now();
  await createWinchallengeRouter.setUserAndSaveDoc(userId, doc);
  return { changed: true, reply };
}

async function onChatMessage(channel, tags, message, self) {
  if (self) return;
  const ch = normalizeChannel(channel.replace(/^#/, ""));
  const uid = findUserIdForChannel(ch);
  if (!uid) return;
  const db = createWinchallengeRouter.loadDb();
  const doc = db[uid];
  if (!doc?.chatCommands?.enabled) return;

  // Overlay-Besitzer darf immer (auch in fremden Kanälen der Gruppe, ohne Mod zu sein)
  const ownerName = String(doc.hostName || "").trim().toLowerCase();
  const sender = String(tags.username || tags["display-name"] || "")
    .trim()
    .toLowerCase();
  const isOwner = !!ownerName && ownerName !== "unknown" && sender === ownerName;

  if (!isAllowedSender(tags, doc, isOwner)) return;
  let shaped;
  try {
    shaped = createWinchallengeRouter.ensureDocShape({ ...doc, userId: uid });
  } catch {
    shaped = { chatCommands: doc.chatCommands };
  }
  const replyInChat = shaped?.chatCommands?.replyInChat !== false;
  try {
    const result = await applyChatLine(uid, message, { isOwner });
    const reply = result && result.reply;
    // Auch Fehlermeldungen ("Keine Challenge gefunden…") beantworten, nicht nur echte Änderungen
    if (replyInChat && reply) {
      setImmediate(() => {
        void sendTimerChatReply(channel, reply);
      });
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
    return { status: "warn", detail: "tmi.js nicht installiert" };
  }
  const user = String(process.env.TWITCH_IRC_USERNAME || "").trim().toLowerCase();
  const pass = normalizeIrcPassword(process.env.TWITCH_IRC_OAUTH);
  if (!user || !pass) {
    return { status: "warn", detail: "kein Token konfiguriert" };
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
  let hasConnectedOnce = false;
  client.on("connected", () => {
    // Erster Connect wird vom Aufrufer (initWinchallengeIrc-Rückgabewert) gemeldet —
    // hier nur nachfolgende automatische Reconnects loggen.
    if (hasConnectedOnce) step("Winchallenge-IRC", true, `reconnected als ${user}`);
    hasConnectedOnce = true;
  });

  try {
    await client.connect();
    await syncChannels();
  } catch (e) {
    client = null;
    return { status: false, detail: e.message };
  }

  refreshTimer = setInterval(() => {
    syncChannels().catch((e) =>
      console.warn("[winchallenge irc] sync:", e.message)
    );
  }, 30_000);

  return { status: true, detail: `verbunden als ${user}` };
}

/** Nach Speichern der Win-Challenge-Chat-Einstellungen: Kanal-Joins aktualisieren */
function afterWinchallengeConfigSaved() {
  if (!client) return;
  syncChannels().catch((e) =>
    console.warn("[winchallenge irc] sync nach Save:", e.message)
  );
}

module.exports = {
  initWinchallengeIrc,
  stopIrc,
  afterWinchallengeConfigSaved,
  // pure Helfer (u. a. für Tests)
  findChallengeMatches,
  parseClockToMs,
  resolveChallengeCommand,
};
