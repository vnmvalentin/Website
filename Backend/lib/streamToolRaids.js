// streamToolRaids.js — Overlay-Modul "Clip des Raiders".
//
// Erkannt wird der Raid über den Chat-Bot: Twitch schickt beim Raid ein
// USERNOTICE in den Ziel-Kanal, das jeder Mitlesende sieht (tmi.js: "raided").
// Bewusst kein EventSub — dafür bräuchte es je Streamer eine dauerhafte
// WebSocket-Verbindung samt Keepalive und Reconnect, während der Bot ohnehin
// schon in den Kanälen sitzt.
//
// Aus den Tags kommt die User-ID des Raiders direkt mit; damit holt sich das
// Backend dessen Clips und legt einen davon als "raid_event" ab. Das Overlay
// pollt seine Route ohnehin und spielt den Clip beim nächsten Durchlauf ab.
const { nanoid } = require("nanoid");
const { db, decryptToken } = require("./streamToolStore");
const { helix } = require("./twitchHelix");

const MODULE_ID = "raidClip";

/** Wie lange die Karte nach dem Clip noch stehen bleibt (Ausblenden + Puffer). */
const OUTRO_MS = 1500;
/** Ohne Clip (Kanal hat keine) bleibt nur die Raid-Begrüßung stehen. */
const BANNER_ONLY_MS = 8000;
/** Obergrenze, falls jemand die Konfiguration von Hand aufbläst. */
const MAX_CLIP_SECONDS = 120;
const MAX_DELAY_SECONDS = 60;
/** Derselbe Raider löst innerhalb dieser Zeit kein zweites Mal aus (Doppel-USERNOTICE). */
const DEDUPE_MS = 30 * 1000;

const listConnected = db.prepare(
  "SELECT * FROM stream_tool_settings WHERE token_enc <> '' AND twitch_login <> ''"
);
const getByLogin = db.prepare("SELECT * FROM stream_tool_settings WHERE twitch_login = ?");
const getByUser = db.prepare("SELECT * FROM stream_tool_settings WHERE user_id = ?");
const setRaidEvent = db.prepare("UPDATE stream_tool_settings SET raid_event = ? WHERE user_id = ?");

const normalizeLogin = (v) => String(v || "").trim().toLowerCase().replace(/^#/, "");

function parseJson(raw) {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Die Modul-Einstellungen des Streamers, oder null wenn das Modul aus ist. */
function raidModuleOf(row) {
  const mod = parseJson(row && row.config)?.modules?.[MODULE_ID];
  if (!mod || typeof mod !== "object" || !mod.enabled) return null;
  return mod;
}

/** Kanäle, in denen der Bot auf Raids lauschen soll. */
function getRaidChannels() {
  const out = new Set();
  for (const row of listConnected.all()) {
    if (raidModuleOf(row)) out.add(normalizeLogin(row.twitch_login));
  }
  out.delete("");
  return [...out];
}

/** Wie viele Sekunden vom Clip höchstens gespielt werden. */
function clipLimitSeconds(mod) {
  const n = Number(mod.maxSeconds);
  if (!Number.isFinite(n) || n <= 0) return 30;
  return Math.min(MAX_CLIP_SECONDS, Math.max(5, Math.round(n)));
}

/**
 * Vorlauf, bevor der Clip startet. Damit läuft er nicht in den Raid-Alert
 * hinein — sonst reden zwei Tonspuren gleichzeitig.
 */
function delayMs(mod) {
  const n = Number(mod.delaySeconds);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(MAX_DELAY_SECONDS, Math.round(n)) * 1000;
}

/* ── Wiedergabe-Adresse eines Clips ─────────────────────────────────────────
 *
 * Der Umweg ist nötig, weil die Twitch-Einbettung IMMER stumm startet: nachge-
 * messen mit `muted=false`, mit dem Autoplay-Flag der OBS-Browserquelle und
 * sogar mit vorher von Hand lautgestelltem Player — Twitch schaltet für den
 * automatischen Start selbst stumm. Ton gibt es also nur, wenn das Overlay die
 * Videodatei selbst abspielt.
 *
 * Diese Adresse gibt die offizielle Helix-Schnittstelle nicht heraus; sie kommt
 * aus dem GQL-Endpunkt des Webplayers (denselben Weg gehen Streamlink und die
 * üblichen Clip-Downloader). Das ist KEINE zugesicherte Schnittstelle: bricht
 * sie weg, liefert die Funktion null und das Overlay fällt auf die stumme
 * Einbettung zurück. Die Abfrage steht bewusst ausgeschrieben da statt als
 * "persisted query" — deren Hash wechselt und war schon beim Einbau ungültig.
 */
const GQL_URL = "https://gql.twitch.tv/gql";
/** Öffentliche Client-ID des Twitch-Webplayers (kein Geheimnis, kein Token). */
const GQL_CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko";
const GQL_TIMEOUT_MS = 6000;
const CLIP_QUERY =
  "query($slug: ID!) { clip(slug: $slug) { videoQualities { quality sourceURL } " +
  'playbackAccessToken(params: {platform: "web", playerBackend: "mediaplayer", playerType: "clips"}) ' +
  "{ signature value } } }";
/** Mehr als 720p bringt auf einer 800 px breiten Karte nichts außer Datenlast. */
const MAX_QUALITY = 720;

/**
 * Direkte Videoadresse eines Clips, signiert und nur begrenzt gültig.
 * @returns {Promise<string|null>} null, sobald irgendetwas daran nicht klappt
 */
async function clipVideoUrl(slug) {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), GQL_TIMEOUT_MS);
  try {
    const res = await fetch(GQL_URL, {
      method: "POST",
      headers: { "Client-Id": GQL_CLIENT_ID, "Content-Type": "application/json" },
      body: JSON.stringify({ query: CLIP_QUERY, variables: { slug } }),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;

    const clip = (await res.json())?.data?.clip;
    const token = clip?.playbackAccessToken;
    const qualities = (clip?.videoQualities || []).filter((q) => q && q.sourceURL);
    if (!token?.signature || !token?.value || !qualities.length) return null;

    // Beste Auflösung bis 720p, sonst die kleinste vorhandene
    const sorted = qualities.slice().sort((a, b) => Number(b.quality) - Number(a.quality));
    const chosen = sorted.find((q) => Number(q.quality) <= MAX_QUALITY) || sorted[sorted.length - 1];

    const sep = chosen.sourceURL.includes("?") ? "&" : "?";
    return `${chosen.sourceURL}${sep}sig=${encodeURIComponent(token.signature)}&token=${encodeURIComponent(token.value)}`;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Sucht einen Clip des Raiders aus.
 *
 * Twitch liefert die Clips nach Aufrufen sortiert. "top" nimmt daher zufällig
 * einen aus der Spitzengruppe — sonst käme bei jedem Raid derselbe Clip.
 */
async function pickClip(token, broadcasterId, mod) {
  const params = new URLSearchParams({ broadcaster_id: String(broadcasterId), first: "50" });
  const days = Math.max(0, Number(mod.period) || 0);
  if (days > 0) {
    params.set("started_at", new Date(Date.now() - days * 86400_000).toISOString());
    params.set("ended_at", new Date().toISOString());
  }

  const data = await helix(`clips?${params.toString()}`, token);
  let list = (data.data || []).filter((c) => c && c.id);
  if (!list.length) return null;

  if (mod.pick === "top") list = list.slice(0, Math.min(5, list.length));
  const chosen = list[Math.floor(Math.random() * list.length)];

  return {
    id: chosen.id,
    // Direkte Videoadresse für den Ton. Bleibt sie leer, spielt das Overlay den
    // Clip über die (stumme) Einbettung ab. Die früher übliche Ableitung aus
    // dem Vorschaubild gibt es nicht mehr: aktuelle Clips liegen unter einem
    // Pfad, aus dem sich keine Videodatei mehr ableiten lässt.
    mp4: await clipVideoUrl(chosen.id),
    title: chosen.title || "",
    url: chosen.url || "",
    thumbnail: chosen.thumbnail_url || "",
    duration: Math.max(1, Math.round(Number(chosen.duration) || 30)),
    creator: chosen.creator_name || "",
    views: Number(chosen.view_count) || 0,
  };
}

/** Login -> User-ID, falls die Raid-Tags keine mitgeliefert haben (Testauslöser). */
async function resolveUserId(token, login) {
  const data = await helix(`users?login=${encodeURIComponent(login)}`, token);
  const u = (data.data || [])[0];
  return u ? { id: u.id, login: u.login, name: u.display_name || u.login } : null;
}

function readRaidEvent(row) {
  return parseJson(row && row.raid_event);
}

/**
 * Der abgelegte Raid, solange er noch angezeigt werden soll — sonst null.
 * Absichtlich ohne Aufräumen beim Lesen: mehrere Overlay-Quellen (z.B. zweiter
 * PC) sollen denselben Clip sehen, und ein Neustart von OBS mitten im Clip
 * steigt einfach wieder ein.
 */
function activeRaidEvent(row) {
  const ev = readRaidEvent(row);
  if (!ev || !ev.endsAt || Date.now() > ev.endsAt) return null;
  return ev;
}

/**
 * Kern der Raid-Behandlung. Legt das Ereignis am Streamer ab.
 * @returns {Promise<object|null>} das abgelegte Ereignis
 */
async function triggerRaid(row, { raiderId, raiderLogin, raiderName, viewers, test = false }) {
  const mod = raidModuleOf(row);
  if (!mod) return null;

  const token = decryptToken(row.token_enc);
  if (!token) return null;

  const count = Number(viewers) || 0;
  const minViewers = Math.max(0, Number(mod.minViewers) || 0);
  if (!test && count < minViewers) return null;

  const login = normalizeLogin(raiderLogin);
  const previous = readRaidEvent(row);
  if (
    !test &&
    previous &&
    previous.raider &&
    normalizeLogin(previous.raider.login) === login &&
    Date.now() - (previous.at || 0) < DEDUPE_MS
  ) {
    return null;
  }

  let id = raiderId ? String(raiderId) : "";
  let name = raiderName || login;
  if (!id && login) {
    const user = await resolveUserId(token, login).catch(() => null);
    if (!user) return null;
    id = user.id;
    name = user.name;
  }
  if (!id) return null;

  let clip = null;
  let error = null;
  try {
    clip = await pickClip(token, id, mod);
    if (!clip) error = "no_clips";
  } catch (e) {
    error = e.status === 401 ? "auth" : "error";
  }

  const playSeconds = clip ? Math.min(clip.duration, clipLimitSeconds(mod)) : 0;
  const now = Date.now();
  // Bis startsAt zeigt das Overlay nichts an — erst danach taucht die Karte auf
  // und der Clip beginnt.
  const startsAt = now + delayMs(mod);
  const event = {
    id: nanoid(10),
    at: now,
    startsAt,
    endsAt: startsAt + (clip ? playSeconds * 1000 + OUTRO_MS : BANNER_ONLY_MS),
    playSeconds,
    delaySeconds: Math.round(delayMs(mod) / 1000),
    test: !!test,
    raider: { id, login, name, viewers: count },
    clip,
    error,
  };

  setRaidEvent.run(JSON.stringify(event), row.user_id);
  return event;
}

/**
 * Aufgerufen vom Chat-Bot, wenn ein Kanal geraidet wird.
 * @param {string} channel      geraideter Kanal (mit oder ohne #)
 * @param {string} raiderName   Anzeigename des Raiders
 * @param {number} viewers      mitgebrachte Zuschauer
 * @param {object} tags         IRC-Tags des USERNOTICE
 */
async function onRaid(channel, raiderName, viewers, tags = {}) {
  const row = getByLogin.get(normalizeLogin(channel));
  if (!row) return null;
  return triggerRaid(row, {
    raiderId: tags["user-id"] || tags.userId || "",
    raiderLogin: tags["msg-param-login"] || tags["login"] || raiderName,
    raiderName: tags["msg-param-displayName"] || raiderName,
    viewers,
  });
}

/** Testauslöser aus dem Dashboard — spielt einen Clip des angegebenen Kanals. */
async function testRaid(userId, login) {
  const row = getByUser.get(String(userId));
  if (!row) return { error: "no_settings" };
  if (!raidModuleOf(row)) return { error: "module_off" };
  if (!decryptToken(row.token_enc)) return { error: "not_connected" };

  const clean = normalizeLogin(login) || normalizeLogin(row.twitch_login);
  if (!clean) return { error: "no_login" };

  const event = await triggerRaid(row, {
    raiderLogin: clean,
    raiderName: clean,
    viewers: Math.max(1, Number(raidModuleOf(row).minViewers) || 1),
    test: true,
  });
  if (!event) return { error: "unknown_channel" };
  return { event };
}

module.exports = {
  MODULE_ID,
  getRaidChannels,
  onRaid,
  testRaid,
  activeRaidEvent,
  raidModuleOf,
};
