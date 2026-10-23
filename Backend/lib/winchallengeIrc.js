/**
 * Optional: Win-Challenge-Befehle im Twitch-Chat.
 * - Lesen + Verarbeiten: tmi (IRC) mit chat:read + chat:edit
 * - Antworten sichtbar im Chat: Helix "Send Chat Message" (user:write:chat + TWITCH_IRC_HELIX_CLIENT_ID
 *   derselben App wie der Bot-Token) — getrennt von TWITCH_CLIENT_ID (Website-Login). IRC allein oft ohne Webchat-Zeile.
 * .env: TWITCH_IRC_USERNAME, TWITCH_IRC_OAUTH=oauth:..., optional TWITCH_IRC_HELIX_CLIENT_ID
 *
 * Weitere Nutzer derselben Verbindung: die Overlay-Module "Clip des Raiders"
 * (Raids kommen als USERNOTICE in den Ziel-Kanal) und "Stream-Statistik" (Cheers
 * und Abos ebenso). Das sieht jeder Mitlesende — dafür lohnt keine zweite
 * Twitch-Anbindung. Die Kanalliste ist deshalb die Vereinigung aus
 * Win-Challenge-Chatbefehlen und den beiden Overlay-Modulen.
 */
let tmi = null;
try {
  tmi = require("tmi.js");
} catch {
  /* optional dependency */
}

const createWinchallengeRouter = require("../winchallenge/winchallengeRoutes");
const streamToolRaids = require("../streamTool/lib/streamToolRaids");
const streamToolStats = require("../streamTool/lib/streamToolStats");
const streamToolScenes = require("../streamTool/lib/streamToolScenes");
const winTrackerChat = require("../clashRoyale/lib/winTrackerChat");
// CR-Minigames: Chat stimmt im Pyramidendraft für den Streamer ab
const crTwitchChat = require("../clashRoyale/core/twitchChat");
const { healRenamedChannel } = require("./twitchRenameHeal");
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

// Twitch-User-IDs ändern sich nicht. Vorher lief pro Chat-Antwort ein
// zusätzlicher /helix/users-Aufruf — das waren zwei API-Anfragen statt einer
// und ein unnötiger Anteil am Helix-Kontingent.
const helixIdCache = new Map(); // login -> userId
const helixIdMissAt = new Map(); // login -> Zeitpunkt des letzten Fehlversuchs
const HELIX_ID_RETRY_MS = 60_000;

/**
 * User-IDs zu Logins holen, mit Cache. Nur unbekannte Logins werden angefragt.
 * @returns {Promise<{ok: boolean, ids?: Map<string,string>, status?: number, body?: any, hint?: string}>}
 */
async function resolveHelixUserIds(logins, clientId, bearer) {
  const want = [...new Set(logins.filter(Boolean))];
  const missing = want.filter(
    (l) =>
      !helixIdCache.has(l) &&
      Date.now() - (helixIdMissAt.get(l) || 0) > HELIX_ID_RETRY_MS
  );

  if (missing.length) {
    const fetch = await getFetch();
    const q = new URLSearchParams();
    for (const l of missing) q.append("login", l);
    const uRes = await fetch(`https://api.twitch.tv/helix/users?${q}`, {
      headers: { "Client-Id": clientId, Authorization: `Bearer ${bearer}` },
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
    for (const row of uJson.data || []) {
      if (row?.login && row?.id) helixIdCache.set(row.login.toLowerCase(), row.id);
    }
    for (const l of missing) {
      if (!helixIdCache.has(l)) helixIdMissAt.set(l, Date.now());
    }
  }

  const ids = new Map();
  for (const l of want) {
    const id = helixIdCache.get(l);
    if (id) ids.set(l, id);
  }
  return { ok: true, ids };
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
  const resolved = await resolveHelixUserIds([bLogin, botLogin], clientId, bearer);
  if (!resolved.ok) return resolved;
  const bid = resolved.ids.get(bLogin);
  const sid = resolved.ids.get(botLogin);
  if (!bid || !sid) {
    return {
      ok: false,
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

// ===== Sendewarteschlange =====
//
// Twitch erlaubt einem normalen Bot rund 20 Nachrichten je 30 Sekunden und
// Kanal; darüber kommt "msg_ratelimit" bzw. Helix 429. Vorher ging jede
// Antwort sofort raus — bei mehreren Befehlen kurz hintereinander (Tests,
// aktive Mods) lief das zwangsläufig ins Limit, und die Antwort war weg.
// Jetzt wird pro Kanal serialisiert und gepuffert.
const SEND_WINDOW_MS = 30_000;
const SEND_MAX_PER_WINDOW = 15; // bewusst unter Twitchs 20
const SEND_MIN_GAP_MS = 1200;
const SEND_QUEUE_MAX = 5;
const DUPLICATE_WINDOW_MS = 30_000; // Twitch verwirft identische Wiederholungen

/** @type {Map<string, {queue: {text:string,at:number}[], sentAt:number[], lastSentAt:number, cooldownUntil:number, draining:boolean, lastText:string, lastTextAt:number, dropped:number}>} */
const sendState = new Map();

function stateFor(login) {
  let s = sendState.get(login);
  if (!s) {
    s = { queue: [], sentAt: [], lastSentAt: 0, cooldownUntil: 0, draining: false, lastText: "", lastTextAt: 0, dropped: 0 };
    sendState.set(login, s);
  }
  return s;
}

/** Antwort einreihen. Kehrt sofort zurück — gesendet wird im Hintergrund. */
function queueChatReply(ircChannel, reply) {
  const login = normalizeChannel(ircChannel);
  if (!login || !reply) return;
  const s = stateFor(login);
  const now = Date.now();

  // Identische Antwort kurz hintereinander: Twitch würde sie ohnehin
  // verwerfen ("msg_duplicate"), also gar nicht erst senden.
  if (s.lastText === reply && now - s.lastTextAt < DUPLICATE_WINDOW_MS) return;
  if (s.queue.some((q) => q.text === reply)) return;

  if (s.queue.length >= SEND_QUEUE_MAX) {
    s.queue.shift();
    s.dropped++;
    if (s.dropped === 1 || s.dropped % 10 === 0) {
      console.warn(
        `[winchallenge irc] ${login}: Sendewarteschlange voll, ${s.dropped} Antwort(en) verworfen.`
      );
    }
  }
  s.queue.push({ text: reply, at: now });
  void drainQueue(login);
}

/** Wartezeit bis zum nächsten erlaubten Sendezeitpunkt (0 = jetzt). */
function waitBeforeSend(s, now) {
  if (now < s.cooldownUntil) return s.cooldownUntil - now;
  const gap = SEND_MIN_GAP_MS - (now - s.lastSentAt);
  if (gap > 0) return gap;
  if (s.sentAt.length >= SEND_MAX_PER_WINDOW) {
    return s.sentAt[0] + SEND_WINDOW_MS - now;
  }
  return 0;
}

async function drainQueue(login) {
  const s = stateFor(login);
  if (s.draining) return;
  s.draining = true;
  try {
    while (s.queue.length) {
      const now = Date.now();
      // Fenster aufräumen
      while (s.sentAt.length && now - s.sentAt[0] > SEND_WINDOW_MS) s.sentAt.shift();

      const wait = waitBeforeSend(s, now);
      if (wait > 0) {
        await new Promise((r) => setTimeout(r, Math.min(wait, SEND_WINDOW_MS)));
        continue;
      }

      const item = s.queue.shift();
      // Veraltete Antworten nicht mehr senden — im Chat wäre die Zuordnung
      // zum auslösenden Befehl längst verloren.
      if (Date.now() - item.at > SEND_WINDOW_MS) continue;

      s.sentAt.push(Date.now());
      s.lastSentAt = Date.now();
      s.lastText = item.text;
      s.lastTextAt = s.lastSentAt;

      const rateLimited = await sendTimerChatReply(login, item.text);
      if (rateLimited) {
        // Twitch hat trotzdem gebremst: Fenster als voll behandeln und warten.
        s.cooldownUntil = Date.now() + SEND_WINDOW_MS;
        console.warn(
          `[winchallenge irc] ${login}: Twitch-Limit erreicht, pausiere ${SEND_WINDOW_MS / 1000}s.`
        );
      }
    }
  } finally {
    s.draining = false;
  }
}

/**
 * Sichtbare Antwort: zuerst Helix (wenn Client-ID + Token), sonst IRC.
 * @returns {Promise<boolean>} true, wenn Twitch wegen Ratenlimit abgelehnt hat
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
        const code = h.drop_reason?.code || "";
        if (code === "msg_duplicate") {
          // Die eigene Warteschlange unterdrückt Wiederholungen bereits —
          // innerhalb dieses Prozesses kann das gar nicht auftreten. Wenn
          // Twitch es trotzdem meldet, hat ein ZWEITER Absender dieselbe
          // Antwort geschickt: meist eine lokale Instanz, die mit demselben
          // Bot-Token im selben Kanal hängt wie die Produktion.
          warnOnce(
            `dup:${bLogin}`,
            `[winchallenge irc] ${bLogin}: Twitch meldet eine doppelte Antwort. ` +
              `Läuft neben dieser noch eine zweite Instanz mit demselben Bot-Konto in diesem Kanal? ` +
              `Dort WINCHALLENGE_IRC_DISABLED=1 setzen.`
          );
        } else {
          console.warn(
            "[winchallenge irc] Helix: is_sent=false",
            code || JSON.stringify(h.drop_reason || {})
          );
        }
      }
      return false;
    }
    // 429 meldet die Warteschlange zurück, statt es über IRC nochmal zu
    // versuchen — das lief vorher in dasselbe Limit und erzeugte die zweite
    // Fehlerzeile (NOTICE msg_ratelimit) zu jedem Helix-429.
    if (h && h.status === 429) return true;
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
      const msg = String((e && e.message) || e);
      if (/too quickly|ratelimit/i.test(msg)) return true;
      console.warn("[winchallenge irc] IRC say:", msg);
    }
  }
  return false;
}

// Wiederkehrende Konfigurationshinweise nur einmal je Stunde ausgeben — sonst
// füllt derselbe Satz bei jedem Befehl das Log.
const warnedAt = new Map();
const WARN_REPEAT_MS = 3600_000;
function warnOnce(key, message) {
  const now = Date.now();
  if (now - (warnedAt.get(key) || 0) < WARN_REPEAT_MS) return;
  warnedAt.set(key, now);
  console.warn(message);
}

/**
 * Beginnt die Zeile (nach führenden Leerzeichen) mit "!"? Bewusst ohne trim():
 * das läuft bei jeder Chatnachricht und soll nichts allozieren.
 * @param {string} msg
 */
function startsWithCommandChar(msg) {
  if (!msg) return false;
  const len = msg.length;
  let i = 0;
  while (i < len && msg.charCodeAt(i) <= 32) i++;
  return msg.charCodeAt(i) === 33; // "!"
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

// Kanal -> Overlay-Besitzer. Wird bei jedem getChannelList() neu aufgebaut
// (alle 30s über syncChannels und nach jedem Speichern) und ersetzt den
// vollständigen DB-Durchlauf, der vorher bei jeder Chatnachricht lief.
let channelOwnerIndex = new Map();

function getChannelList() {
  const db = createWinchallengeRouter.loadDb();
  const set = new Set();
  const index = new Map();
  for (const [uid, doc] of Object.entries(db || {})) {
    // Zur Löschung vorgemerkte Overlays (14 Tage ohne Lebenszeichen) werden
    // nicht mehr betreten. Ein Bot im Chat einer verwaisten Challenge kostet
    // nur, ohne dass jemand die Befehle noch benutzt.
    if (Number(doc?.pendingDeleteAt) > 0) continue;
    for (const c of channelsOfDoc(doc)) {
      set.add(c);
      if (!index.has(c)) {
        index.set(c, uid);
      } else {
        // Zwei Overlays beanspruchen denselben Kanal. Befehle landen nur beim
        // ersten — ohne Hinweis sieht das aus, als würden sie ignoriert.
        warnOnce(
          `dupchannel:${c}`,
          `[winchallenge irc] Kanal "${c}" ist in mehreren Overlays eingetragen ` +
            `(${index.get(c)} und ${uid}). Befehle wirken nur auf ${index.get(c)}.`
        );
      }
    }
  }
  channelOwnerIndex = index;
  // Kanäle mit aktivem Raid-Clip- oder Statistik-Modul: dort wird nur zugehört,
  // Chatbefehle bleiben davon unberührt (onChatMessage steigt ohne
  // Win-Challenge aus).
  try {
    for (const c of streamToolRaids.getRaidChannels()) set.add(normalizeChannel(c));
    for (const c of streamToolStats.getStatsChannels()) set.add(normalizeChannel(c));
    for (const c of streamToolScenes.getSceneChannels()) set.add(normalizeChannel(c));
  } catch (e) {
    console.warn("[stream-tool] Overlay-Kanäle nicht lesbar:", e.message);
  }
  // Win-Tracker: Kanäle mit aktiviertem "!tracker"-Chatbefehl.
  try {
    for (const c of winTrackerChat.getTrackerChannels()) set.add(normalizeChannel(c));
  } catch (e) {
    console.warn("[win-tracker] Chat-Kanäle nicht lesbar:", e.message);
  }
  // CR-Minigame-Lobbys mit eingeschaltetem Chat (nur aus dem Speicher, kein DB-Zugriff)
  try {
    for (const c of crTwitchChat.getChatChannels()) set.add(normalizeChannel(c));
  } catch (e) {
    console.warn("[clash] Chat-Kanäle nicht lesbar:", e.message);
  }
  return [...set];
}

let lastIndexRebuildAt = 0;
const INDEX_REBUILD_MIN_GAP_MS = 5000;

function findUserIdForChannel(channelName) {
  const name = normalizeChannel(channelName);
  const hit = channelOwnerIndex.get(name);
  if (hit) return hit;

  // Fehltreffer sind der Normalfall in Kanälen, die nur wegen der Raid- oder
  // Statistik-Module betreten wurden — dort gibt es keinen Overlay-Besitzer.
  // Deshalb höchstens alle paar Sekunden neu aufbauen, sonst würde jeder
  // Fremdbot-Befehl in so einem Kanal einen DB-Durchlauf auslösen.
  const now = Date.now();
  if (now - lastIndexRebuildAt < INDEX_REBUILD_MIN_GAP_MS) return null;
  lastIndexRebuildAt = now;
  getChannelList();
  return channelOwnerIndex.get(name) || null;
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

// Antworten des Bots im Chat, in der Sprache des Overlays (doc.language, gewählt im Editor).
const CHAT_REPLIES = {
  de: {
    notFound: (q) => `Keine Challenge gefunden für "${q}".`,
    ambiguous: (q, names) => `Mehrere Treffer für "${q}": ${names} — bitte genauer angeben.`,
    alreadyPinned: (n) => `"${n}" ist bereits angepinnt.`,
    pinned: (n) => `"${n}" angepinnt.`,
    notPinned: (n) => `"${n}" ist nicht angepinnt.`,
    unpinned: (n) => `"${n}" gelöst.`,
    completedSuffix: " — abgeschlossen!",
    alreadyDone: (n) => `"${n}" ist bereits abgeschlossen.`,
    completed: (n) => `"${n}" abgeschlossen!`,
    alreadyZero: (n) => `"${n}" steht bereits bei 0.`,
    stillOpen: (n) => `"${n}" ist noch offen.`,
    reopened: (n) => `"${n}" wieder offen.`,
    timerStarted: "Timer wurde gestartet.",
    timerPaused: "Timer wurde pausiert.",
    timerReset: "Timer wurde zurückgesetzt.",
    timerHidden: "Timer ausgeblendet.",
    timerShown: "Timer eingeblendet.",
    timerFormat: "Format: !settimer HH:MM:SS (oder MM:SS)",
    timerSet: (clock) => `Timer auf ${clock} gesetzt.`,
  },
  en: {
    notFound: (q) => `No challenge found for "${q}".`,
    ambiguous: (q, names) => `Several matches for "${q}": ${names} — please be more specific.`,
    alreadyPinned: (n) => `"${n}" is already pinned.`,
    pinned: (n) => `"${n}" pinned.`,
    notPinned: (n) => `"${n}" is not pinned.`,
    unpinned: (n) => `"${n}" unpinned.`,
    completedSuffix: " — completed!",
    alreadyDone: (n) => `"${n}" is already completed.`,
    completed: (n) => `"${n}" completed!`,
    alreadyZero: (n) => `"${n}" is already at 0.`,
    stillOpen: (n) => `"${n}" is still open.`,
    reopened: (n) => `"${n}" reopened.`,
    timerStarted: "Timer started.",
    timerPaused: "Timer paused.",
    timerReset: "Timer reset.",
    timerHidden: "Timer hidden.",
    timerShown: "Timer shown.",
    timerFormat: "Format: !settimer HH:MM:SS (or MM:SS)",
    timerSet: (clock) => `Timer set to ${clock}.`,
  },
};
const repliesFor = (lang) => CHAT_REPLIES[lang] || CHAT_REPLIES.de;

/**
 * !pin / !unpin / !+ / !- auf eine Challenge anwenden.
 * @returns {{ itemId: string|null, patch: object|null, reply: string|null, changed: boolean }}
 */
function resolveChallengeCommand(items, kind, query, r = CHAT_REPLIES.de) {
  const matches = findChallengeMatches(items, query);
  if (matches.length === 0) {
    return {
      itemId: null,
      patch: null,
      changed: false,
      reply: r.notFound(query),
    };
  }
  if (matches.length > 1) {
    const names = matches.slice(0, 3).map((m) => m.name).join(", ");
    return {
      itemId: null,
      patch: null,
      changed: false,
      reply: r.ambiguous(query, names),
    };
  }
  const it = matches[0];

  if (kind === "pin") {
    if (it.pinned)
      return { itemId: null, patch: null, changed: false, reply: r.alreadyPinned(it.name) };
    return { itemId: it.id, patch: { pinned: true }, changed: true, reply: r.pinned(it.name) };
  }
  if (kind === "unpin") {
    if (!it.pinned)
      return { itemId: null, patch: null, changed: false, reply: r.notPinned(it.name) };
    return { itemId: it.id, patch: { pinned: false }, changed: true, reply: r.unpinned(it.name) };
  }
  if (kind === "plus") {
    if (it.useWins) {
      const next = (it.progress || 0) + 1;
      const doneNow = next >= (it.target || 0);
      return {
        itemId: it.id,
        patch: { progress: next },
        changed: true,
        reply: `"${it.name}": ${next}/${it.target || 0}${doneNow ? r.completedSuffix : ""}`,
      };
    }
    if (it.done)
      return { itemId: null, patch: null, changed: false, reply: r.alreadyDone(it.name) };
    return { itemId: it.id, patch: { done: true }, changed: true, reply: r.completed(it.name) };
  }
  if (kind === "minus") {
    if (it.useWins) {
      const next = Math.max(0, (it.progress || 0) - 1);
      if (next === (it.progress || 0))
        return { itemId: null, patch: null, changed: false, reply: r.alreadyZero(it.name) };
      return {
        itemId: it.id,
        patch: { progress: next },
        changed: true,
        reply: `"${it.name}": ${next}/${it.target || 0}`,
      };
    }
    if (!it.done)
      return { itemId: null, patch: null, changed: false, reply: r.stillOpen(it.name) };
    return { itemId: it.id, patch: { done: false }, changed: true, reply: r.reopened(it.name) };
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
  const r = repliesFor(doc.language);
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
      reply = r.timerStarted;
    }
  } else if (lower === "!stoptimer" || lower === "!pausetimer") {
    if (!canTimer) return { changed: false, reply: null };
    if (doc.timer.running) {
      doc.timer.running = false;
      doc.timer.elapsedMs = Date.now() - (doc.timer.startedAt || Date.now());
      changed = true;
      reply = r.timerPaused;
    }
  } else if (lower === "!resettimer") {
    if (!canTimer) return { changed: false, reply: null };
    doc.timer.running = false;
    doc.timer.startedAt = 0;
    doc.timer.elapsedMs = 0;
    changed = true;
    reply = r.timerReset;
  } else if (lower === "!hidetimer" || lower === "!timerhide") {
    if (!canTimer) return { changed: false, reply: null };
    if (doc.timer.visible !== false) {
      doc.timer.visible = false;
      changed = true;
      reply = r.timerHidden;
    }
  } else if (lower === "!showtimer" || lower === "!timershow") {
    if (!canTimer) return { changed: false, reply: null };
    if (doc.timer.visible !== true) {
      doc.timer.visible = true;
      changed = true;
      reply = r.timerShown;
    }
  } else if (setMatch) {
    if (!canTimer) return { changed: false, reply: null };
    const ms = parseClockToMs(setMatch[1]);
    if (ms == null) {
      reply = r.timerFormat;
    } else {
      doc.timer.elapsedMs = ms;
      if (doc.timer.running) doc.timer.startedAt = Date.now() - ms;
      changed = true;
      reply = r.timerSet(msToClock(ms));
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

    const result = resolveChallengeCommand(doc.items || [], kind, query.trim(), r);
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

  // CR-Minigames: Chat-Abstimmung. Stimmen sind reine Zahlen ("3"), deshalb VOR der
  // Befehlsprüfung — alles andere fällt dort sofort an einer Regex heraus.
  try {
    crTwitchChat.onChatMessage(channel, tags || {}, message);
  } catch (e) {
    console.warn("[clash] Chat-Stimme:", e.message);
  }

  // Billigste Prüfung zuerst. Praktisch jede Chatzeile ist kein Befehl, und
  // für die darf hier nichts weiter passieren — kein DB-Zugriff, kein
  // ensureDocShape, keine Allokation. Vorher lief die ganze Kette durch und
  // erst applyChatLine() hat auf "!" geprüft.
  if (!startsWithCommandChar(message)) return;

  const ch = normalizeChannel(channel.replace(/^#/, ""));

  // Murmelbahn: Beitritt und Steuerung. Synchron und für fremde Kanäle sofort
  // wieder draußen (Nachschlagen in einer Map).
  try {
    streamToolScenes.onChatCommand(ch, tags, message);
  } catch (e) {
    console.warn("[stream-tool] Murmelbahn-Befehl:", e.message);
  }

  // Win-Tracker: "!tracker #TAG" — eigener Kanalkreis und eigene Mod-Prüfung, unabhängig
  // davon, ob der Kanal auch einem Win-Challenge-Doc gehört.
  try {
    // Async seit "!tracker add" (ruft die Royale API auf) — die übrigen Unterbefehle laufen
    // synchron durch, siehe winTrackerChat.js.
    const trackerResult = await winTrackerChat.applyTrackerChatLine(ch, tags, message);
    if (trackerResult && trackerResult.reply) queueChatReply(channel, trackerResult.reply);
  } catch (e) {
    console.error("[win-tracker] command failed:", e.message);
  }

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
    if (replyInChat && reply) queueChatReply(channel, reply);
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Pause zwischen zwei JOIN-Befehlen: viele Kanäle direkt hintereinander (v.a. beim allerersten
// Connect nach einem Neustart — dann sind IMMER alle Kanäle "neu") lasten den frisch aufgebauten
// Socket UND den Event-Loop stark aus, bevor tmi.js überhaupt eine verlässliche eigene
// Latenzmessung hat — sein interner Timeout für "wartet auf Antwort" ist mit min. 600ms knapp
// bemessen (siehe _getPromiseDelay in node_modules/tmi.js/lib/client.js), genau DAS reißt dann
// als "No response from Twitch." im Log auf (wächst mit der Kanalliste — je mehr Overlays/
// Win-Tracker-Konten den Chatbefehl aktiviert haben, desto mehr Kanäle auf einmal). Twitchs
// eigenes IRC-JOIN-Ratenlimit liegt bei 20 Joins / 10s für unverifizierte Bots — 500ms träfe das
// genau auf der Kante (2/s = 20/10s), ohne Puffer für die Wiederholungsversuche unten. 600ms
// (~16,7/10s) lässt echten Spielraum und macht aus z.B. 40 Kanälen ~24s statt spürbar länger.
const JOIN_DELAY_MS = 600;
// Reißt ein JOIN trotzdem (einzelner Ausreißer statt eines echten Problems), EIN zweiter Versuch
// nach kurzer Pause, bevor wirklich aufgegeben und geloggt wird — endgültig fehlgeschlagene Kanäle
// holt der reguläre 30s-Sync (refreshTimer unten) ohnehin automatisch nach (derselbe
// want/current-Vergleich läuft dort erneut), das hier verkürzt nur die Wartezeit auf den ersten
// Versuch.
const JOIN_RETRY_DELAY_MS = 1500;

// Kanäle, deren Beitritt scheitert (meist: Streamer hat sich umbenannt, den alten Login gibt
// es nicht mehr). Statt alle 30 s erneut zu versuchen und jedes Mal zu loggen, wird mit
// wachsendem Abstand probiert (5 min, 10, 20 … bis 6 h). Nach dem ERSTEN Fehlschlag wird
// außerdem versucht, den Kanal auf den neuen Login umzuschreiben (lib/twitchRenameHeal.js).
const JOIN_BACKOFF_BASE_MS = 5 * 60_000;
const JOIN_BACKOFF_MAX_MS = 6 * 60 * 60_000;
/** @type {Map<string, {fails: number, retryAt: number}>} */
const joinFailures = new Map();

// tmi.js lehnt join() mit einem nackten String ab ("No response from Twitch." u. ä.), nicht mit
// einem Error — vorher stand deshalb nur "undefined" im Log.
const reasonOf = (e) => (e && e.message) || (typeof e === "string" ? e : JSON.stringify(e));

/** Helix-GET mit dem Bot-Token; null bei fehlender Konfiguration oder Fehler. */
async function helixGet(pathAndQuery) {
  const clientId = helixClientIdFromEnv();
  const bearer = bearerTokenFromEnv();
  if (!clientId || !bearer) return null;
  try {
    const fetch = await getFetch();
    const res = await fetch(`https://api.twitch.tv/helix/${pathAndQuery}`, {
      headers: { "Client-Id": clientId, Authorization: `Bearer ${bearer}` },
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

async function tryHealRenamed(c) {
  try {
    const result = await healRenamedChannel(c, {
      helixGet,
      streamToolDb: require("../streamTool/lib/streamToolStore").db,
      winTrackerDb: require("../clashRoyale/lib/winTrackerStore"),
      winchallenge: { loadDb: createWinchallengeRouter.loadDb, saveDb: createWinchallengeRouter.saveDb },
    });
    if (result.healed.length) {
      for (const h of result.healed) {
        console.log(`[winchallenge irc] Kanal umbenannt: ${h.from} → ${h.to} (${h.source}, Nutzer ${h.userId})`);
      }
      joinFailures.delete(c);
      // Neuer Kanal sofort betreten, alter fällt beim Abgleich heraus
      syncChannels().catch(() => {});
    } else if (!result.exists) {
      console.warn(
        `[winchallenge irc] Kanal "${c}" gibt es auf Twitch nicht mehr (umbenannt?) und gehört keinem ` +
          `Nutzer als eigener Login — bitte im jeweiligen Editor neu eintragen.`
      );
    }
  } catch (e) {
    console.warn("[winchallenge irc] Umbenennung prüfen fehlgeschlagen:", c, reasonOf(e));
  }
}

async function joinChannelResilient(c) {
  try {
    await client.join("#" + c);
    joinFailures.delete(c);
    return;
  } catch {
    await sleep(JOIN_RETRY_DELAY_MS);
  }
  try {
    await client.join("#" + c);
    joinFailures.delete(c);
  } catch (e2) {
    const prev = joinFailures.get(c);
    const fails = (prev?.fails || 0) + 1;
    const wait = Math.min(JOIN_BACKOFF_MAX_MS, JOIN_BACKOFF_BASE_MS * 2 ** (fails - 1));
    joinFailures.set(c, { fails, retryAt: Date.now() + wait });
    console.warn(
      `[winchallenge irc] join failed (2x) ${c}: ${reasonOf(e2)} — nächster Versuch in ${Math.round(wait / 60_000)} min`
    );
    if (fails === 1) tryHealRenamed(c);
  }
}

async function syncChannels() {
  if (!client) return;
  const want = new Set(getChannelList());
  const raw = typeof client.getChannels === "function" ? client.getChannels() : [];
  const current = new Set(
    (raw || []).map((c) => normalizeChannel(String(c)))
  );
  let joinedAny = false;
  const now = Date.now();
  for (const c of want) {
    if (!current.has(c)) {
      // Kürzlich gescheiterter Kanal: erst nach Ablauf des Backoffs wieder probieren
      if ((joinFailures.get(c)?.retryAt || 0) > now) continue;
      if (joinedAny) await sleep(JOIN_DELAY_MS);
      joinedAny = true;
      await joinChannelResilient(c);
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
  // Notausgang für lokale Instanzen: Twitch erlaubt nur einen Absender je
  // Bot-Konto. Laufen Entwicklung und Produktion gleichzeitig mit demselben
  // Token im selben Kanal, beantworten beide jeden Befehl — die zweite
  // Antwort verwirft Twitch als "msg_duplicate". In der lokalen .env
  // WINCHALLENGE_IRC_DISABLED=1 setzen, dann hört nur die Produktion mit.
  if (/^(1|true|yes)$/i.test(String(process.env.WINCHALLENGE_IRC_DISABLED || "").trim())) {
    return { status: "warn", detail: "per WINCHALLENGE_IRC_DISABLED abgeschaltet" };
  }
  const user = String(process.env.TWITCH_IRC_USERNAME || "").trim().toLowerCase();
  const pass = normalizeIrcPassword(process.env.TWITCH_IRC_OAUTH);
  if (!user || !pass) {
    return { status: "warn", detail: "kein Token konfiguriert" };
  }

  // Kanäle bewusst NICHT hier übergeben: tmi.js joint sie sonst selbst über eine
  // eigene interne Warteschlange (Standard 2000ms/Kanal, node_modules/tmi.js/lib/client.js
  // ~Zeile 203), parallel und unkoordiniert zu unserem eigenen syncChannels() gleich nach
  // connect() — zwei getrennte Join-Läufe für dieselben Kanäle gleichzeitig haben Twitchs
  // JOIN-Ratenlimit (20 / 10s für unverifizierte Bots) gerissen und dadurch den Schwall an
  // "No response from Twitch." beim Start erzeugt. Mit leerer Liste übernimmt ausschließlich
  // syncChannels() das Beitreten — ein einziger, kontrollierter Pfad statt zwei parallelen.
  client = new tmi.Client({
    options: { skipUpdatingEmotesets: true },
    connection: { reconnect: true, secure: true },
    identity: { username: user, password: pass },
    channels: [],
  });

  client.on("message", onChatMessage);
  client.on("raided", (ircChannel, raiderName, viewers, tags) => {
    streamToolRaids
      .onRaid(ircChannel, raiderName, viewers, tags || {})
      .then((ev) => {
        if (!ev) return;
        console.log(
          `[stream-tool] Raid in ${normalizeChannel(ircChannel)} von ${ev.raider.name} (${ev.raider.viewers}) — ` +
            (ev.clip ? `Clip "${ev.clip.title}"` : `kein Clip (${ev.error || "unbekannt"})`)
        );
      })
      .catch((e) => console.warn("[stream-tool] Raid-Verarbeitung:", e.message));
    streamToolScenes
      .onRaid(ircChannel, raiderName, viewers, tags || {})
      .catch((e) => console.warn("[stream-tool] Raid-Ansturm:", e.message));
  });
  // Kanalpunkte-Belohnung mit Textfeld: startet auf Wunsch die Murmelbahn.
  // tmi meldet hier auch "highlighted-message" & Co. — die haben keine
  // custom-reward-id und fallen in onRedeem von selbst heraus.
  client.on("redeem", (ircChannel, username, rewardType, tags) => {
    try {
      if (tags && tags["custom-reward-id"]) streamToolScenes.onRedeem(ircChannel, tags, tags["custom-reward-id"]);
    } catch (e) {
      console.warn("[stream-tool] Kanalpunkte-Einlösung:", e.message);
    }
  });
  // Stream-Statistik: Cheers und Abos mitzählen. Alle Handler bekommen den
  // Kanal als erstes Argument — mehr braucht das Modul nicht.
  //
  // Geschenkte Abos kommen einzeln als "subgift" an, auch wenn jemand ein
  // ganzes Paket verschenkt. Das dazugehörige "submysterygift" ist nur die
  // Ankündigung davor und wird bewusst nicht gezählt, sonst stünde jedes
  // Geschenkpaket doppelt in der Statistik.
  client.on("cheer", (ircChannel, tags) => {
    try {
      streamToolStats.onCheer(ircChannel, tags || {});
      streamToolScenes.onContribution(ircChannel, tags || {});
    } catch (e) {
      console.warn("[stream-tool] Cheer nicht gezählt:", e.message);
    }
  });
  const countSub = (kind) => (ircChannel, ...rest) => {
    try {
      streamToolStats.onSub(ircChannel, kind);
      // Die Tags des Absenders stehen je nach Ereignis an anderer Stelle —
      // der Hype Train braucht daraus nur, wer es war.
      const who = rest.find((a) => a && typeof a === "object" && a["user-id"]);
      if (who) streamToolScenes.onContribution(ircChannel, who);
    } catch (e) {
      console.warn("[stream-tool] Abo nicht gezählt:", e.message);
    }
  };
  client.on("subscription", countSub("new"));
  client.on("resub", countSub("resub"));
  client.on("subgift", countSub("gift"));
  client.on("anonsubgift", countSub("gift"));

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
    // Ratenlimit: die Warteschlange bremsen statt nur zu protokollieren.
    if (mid === "msg_ratelimit" || /sending messages too quickly/i.test(m)) {
      const login = normalizeChannel(ircChannel || "");
      if (login) {
        const s = stateFor(login);
        s.cooldownUntil = Date.now() + SEND_WINDOW_MS;
      }
      console.warn(
        `[winchallenge irc] ${normalizeChannel(ircChannel || "") || "?"}: Twitch-Ratenlimit, pausiere ${SEND_WINDOW_MS / 1000}s.`
      );
      return;
    }
    // Twitch meldet PRIVMSG-Probleme oft hier (E-Mail, Follow-Only, Rate), nicht in say().catch
    if (
      mid.startsWith("msg_") ||
      /message was not sent|cannot send|verify your|must follow|subscribers|bad auth|rejected|ban/i.test(
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

  // Nach einer Kontoumbenennung bleibt TWITCH_IRC_USERNAME in .env leicht veraltet stehen — der
  // Token selbst bleibt gültig (an die User-ID gebunden, nicht an den Login-Namen), Twitch nimmt
  // die Verbindung also trotzdem an ("verbunden als <alter Name>" oben stimmt dann aber nicht
  // mehr — die Zeile echot nur den konfigurierten Wert, prüft ihn nicht). Einzelne Befehle danach
  // (v. a. JOIN) können dann genau die "No response from Twitch."-Zeitüberschreitungen zeigen, die
  // das eigentlich auslöst — ohne aktiv nachzufragen, WEM der Token laut Twitch gerade wirklich
  // gehört, ist das schwer von einem echten Netzwerkproblem zu unterscheiden. /helix/users OHNE
  // Parameter liefert genau das: den Account des mitgeschickten Bearer-Tokens selbst.
  let identityDetail = `verbunden als ${user}`;
  let identityMismatch = false;
  const clientId = helixClientIdFromEnv();
  const bearer = bearerTokenFromEnv();
  if (clientId && bearer) {
    try {
      const fetchFn = await getFetch();
      const idRes = await fetchFn("https://api.twitch.tv/helix/users", {
        headers: { "Client-Id": clientId, Authorization: `Bearer ${bearer}` },
      });
      const idJson = await idRes.json().catch(() => ({}));
      const realLogin = (idRes.ok && idJson.data?.[0]?.login || "").toLowerCase();
      if (realLogin && realLogin !== user) {
        identityMismatch = true;
        identityDetail = `verbunden als ${user}, aber Token gehört zu "${realLogin}" — TWITCH_IRC_USERNAME vermutlich veraltet (Kontoumbenennung?)`;
        console.error(
          `[winchallenge irc] TWITCH_IRC_USERNAME ("${user}") stimmt nicht mit dem tatsächlichen Login des Tokens ("${realLogin}") überein. ` +
          `Bitte TWITCH_IRC_USERNAME=${realLogin} in .env setzen und neu starten.`
        );
      }
    } catch {
      /* Prüfung ist ein Bonus, kein Abbruchgrund — ohne sie läuft es wie bisher weiter */
    }
  }

  refreshTimer = setInterval(() => {
    syncChannels().catch((e) =>
      console.warn("[winchallenge irc] sync:", e.message)
    );
  }, 30_000);

  return { status: identityMismatch ? "warn" : true, detail: identityDetail };
}

/** Nach Speichern der Win-Challenge-Chat-Einstellungen: Kanal-Joins aktualisieren */
function afterWinchallengeConfigSaved() {
  if (!client) return;
  syncChannels().catch((e) =>
    console.warn("[winchallenge irc] sync nach Save:", e.message)
  );
}

/** Ob der Bot lauschen kann und in welchen Kanälen — fürs Stream-Tool-Dashboard. */
function getIrcStatus() {
  const configured =
    !!tmi &&
    !!String(process.env.TWITCH_IRC_USERNAME || "").trim() &&
    !!String(process.env.TWITCH_IRC_OAUTH || "").trim();
  const joined =
    client && typeof client.getChannels === "function"
      ? client.getChannels().map(normalizeChannel)
      : [];
  return { configured, connected: !!client, joined };
}

// CR-Minigames kennen die Verbindung nur über diese drei Funktionen (core/ bleibt ohne lib/-Import)
crTwitchChat.attachIrc({
  refresh: () => (client ? syncChannels() : Promise.resolve()),
  status: getIrcStatus,
  say: queueChatReply,
});

module.exports = {
  initWinchallengeIrc,
  stopIrc,
  afterWinchallengeConfigSaved,
  // Kanalliste neu abgleichen (auch aus anderen Modulen, z.B. Raid-Clips)
  refreshChannels: afterWinchallengeConfigSaved,
  getIrcStatus,
  // Sichtbare Chatzeile über die Sendewarteschlange (Murmelbahn-Ansagen)
  say: queueChatReply,
  // pure Helfer (u. a. für Tests)
  findChallengeMatches,
  parseClockToMs,
  resolveChallengeCommand,
};
