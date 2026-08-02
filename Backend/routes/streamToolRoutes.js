// streamToolRoutes.js — Stream-Tool "Twitch-Overlays".
//
// Gestartet und beendet werden Abstimmungen und Vorhersagen direkt in Twitch —
// dieses Backend liest sie nur mit und speist damit das OBS-Overlay. Deshalb
// verlangt es ausschließlich LESERECHTE; die manage-Scopes braucht niemand.
//
// Das OBS-Overlay authentifiziert sich nur über seinen overlay_key und bekommt
// ausschließlich Anzeigedaten — der Twitch-Token verlässt den Server nie.
//
// Twitch wird nicht dauerhaft gepollt: die Overlay-Route synct bei Bedarf und
// gedrosselt (MIN_SYNC_INTERVAL_MS), genau wie beim CR-Win-Tracker. Läuft kein
// Overlay, entsteht auch keine API-Last.
const express = require("express");
const { nanoid } = require("nanoid");
const { db, encryptToken, decryptToken } = require("../lib/streamToolStore");
const { helix, validateToken } = require("../lib/twitchHelix");
const raids = require("../lib/streamToolRaids");

const CLIENT_ID = process.env.TWITCH_CLIENT_ID || "";
const MIN_SYNC_INTERVAL_MS = 2000;
const GOALS_SYNC_INTERVAL_MS = 30 * 1000;
const MAX_CONFIG_BYTES = 16 * 1024;

// Nur Lesen. Die manage-Variante wird mit akzeptiert, falls ein Streamer sie aus
// anderen Gründen schon erteilt hat — angefragt wird sie nie.
const REQUIRED_SCOPES = [
  ["channel:read:polls", "channel:manage:polls"],
  ["channel:read:predictions", "channel:manage:predictions"],
];

// Nur das Abo-Ziel braucht wirklich ein Extra-Recht. Die reine Follower-ANZAHL
// (das Feld "total") gibt Twitch auch ohne moderator:read:followers heraus —
// dieses Recht bräuchte man erst für die Liste der einzelnen Follower.
// Deshalb hier bewusst nur ein Scope: sonst meldet die Oberfläche ein fehlendes
// Recht, obwohl das Follower-Ziel längst läuft.
const GOAL_SCOPES = ["channel:read:subscriptions"];

// Für die im Creator-Dashboard gesetzten Ziele. Eigener Eintrag, weil dieses
// Recht nur der Modus "Twitch-Ziel" braucht — ohne es funktionieren die
// selbst gesetzten Ziele weiterhin.
const TWITCH_GOAL_SCOPE = "channel:read:goals";

// ── Statements ───────────────────────────────────────────────────────────────
const getByUser = db.prepare("SELECT * FROM stream_tool_settings WHERE user_id = ?");
const getByOverlayKey = db.prepare("SELECT * FROM stream_tool_settings WHERE overlay_key = ?");
const insertRow = db.prepare(
  "INSERT INTO stream_tool_settings (user_id, overlay_key, updated_at) VALUES (?, ?, ?)"
);
const updateConfig = db.prepare("UPDATE stream_tool_settings SET config = ?, updated_at = ? WHERE user_id = ?");
const updateOverlayKey = db.prepare("UPDATE stream_tool_settings SET overlay_key = ?, updated_at = ? WHERE user_id = ?");
const updateToken = db.prepare(
  "UPDATE stream_tool_settings SET token_enc = ?, twitch_login = ?, token_updated_at = ?, updated_at = ? WHERE user_id = ?"
);
const updateScopes = db.prepare("UPDATE stream_tool_settings SET scopes = ? WHERE user_id = ?");
const updateCache = db.prepare("UPDATE stream_tool_settings SET cache = ?, last_fetched = ? WHERE user_id = ?");
const clearRaidEvent = db.prepare("UPDATE stream_tool_settings SET raid_event = '' WHERE user_id = ?");

function getOrCreate(userId) {
  let row = getByUser.get(userId);
  if (!row) {
    insertRow.run(userId, nanoid(16), Date.now());
    row = getByUser.get(userId);
  }
  return row;
}

// ── Twitch Helix ─────────────────────────────────────────────────────────────
// helix() / validateToken() liegen in ../lib/twitchHelix.js — die Raid-Erkennung
// braucht dieselben Aufrufe, ohne diese Router-Datei zu laden.

const missingScopes = (scopes = []) =>
  REQUIRED_SCOPES.filter((group) => !group.some((s) => scopes.includes(s))).map((g) => g[0]);

// ── Normalisierung: Helix-Rohdaten -> schlanke Overlay-Struktur ──────────────
function shapePoll(p) {
  if (!p) return null;
  const startedAt = Date.parse(p.started_at) || Date.now();
  const choices = (p.choices || []).map((c) => ({
    id: c.id,
    title: c.title,
    votes: (c.votes || 0),
  }));
  return {
    id: p.id,
    title: p.title,
    status: p.status,
    duration: p.duration,
    startedAt,
    endsAt: startedAt + p.duration * 1000,
    choices,
    totalVotes: choices.reduce((sum, c) => sum + c.votes, 0),
  };
}

function shapePrediction(p) {
  if (!p) return null;
  const createdAt = Date.parse(p.created_at) || Date.now();
  return {
    id: p.id,
    title: p.title,
    status: p.status,
    window: p.prediction_window,
    createdAt,
    locksAt: p.locked_at ? Date.parse(p.locked_at) : createdAt + p.prediction_window * 1000,
    endedAt: p.ended_at ? Date.parse(p.ended_at) : null,
    winningOutcomeId: p.winning_outcome_id || null,
    outcomes: (p.outcomes || []).map((o) => ({
      id: o.id,
      title: o.title,
      points: o.channel_points || 0,
      users: o.users || 0,
      color: o.color || "BLUE",
    })),
  };
}

/**
 * Holt Poll + Prediction von Twitch und legt sie im cache-Feld ab.
 * Gedrosselt: mehrere Overlay-Aufrufe kurz hintereinander lösen nur einen Abruf aus.
 */
/**
 * Follower- und Abo-Zahlen. Bewusst deutlich seltener als Abstimmungen: die
 * Zahlen ändern sich in Minuten, nicht in Sekunden, und jeder Abruf zählt aufs
 * Helix-Ratelimit (das pro Client-ID gilt, also über alle Streamer zusammen).
 *
 * Beide Endpunkte dürfen einzeln fehlschlagen — Abos gibt es z.B. nur für
 * Affiliates. Ein fehlendes Ziel soll nicht das andere mitreißen.
 */
async function fetchGoals(row, token, previous) {
  // Der Grund eines Fehlschlags wird festgehalten, damit das Dashboard erklären
  // kann, warum ein Ziel leer bleibt, statt den Streamer raten zu lassen.
  let subsError = null;
  let twitchGoalsError = null;

  const [followers, subs, creatorGoals] = await Promise.all([
    helix(`channels/followers?broadcaster_id=${row.user_id}&first=1`, token).catch(() => null),
    helix(`subscriptions?broadcaster_id=${row.user_id}&first=1`, token).catch((e) => {
      subsError = e.status === 403 ? "forbidden" : (e.status === 401 ? "auth" : "error");
      return null;
    }),
    // Die im Creator-Dashboard gesetzten Ziele. Vorteil gegenüber selbst
    // gerechneten Zahlen: Zielwert, Beschreibung und Fortschritt kommen direkt
    // von Twitch — inklusive allem, was Twitch selbst mit dem Zielwert macht,
    // etwa einer automatischen Erhöhung nach dem Erreichen.
    helix(`goals?broadcaster_id=${row.user_id}`, token).catch((e) => {
      twitchGoalsError = e.status === 401 || e.status === 403 ? "scope" : "error";
      return null;
    }),
  ]);

  return {
    followers: followers && typeof followers.total === "number" ? followers.total : (previous?.followers ?? null),
    subs: subs && typeof subs.total === "number" ? subs.total : (previous?.subs ?? null),
    // Abo-Punkte (Tier 2 zählt doppelt, Tier 3 sechsfach) — für Punkte-Ziele
    subPoints: subs && typeof subs.points === "number" ? subs.points : (previous?.subPoints ?? null),
    subsError,
    twitch: creatorGoals ? shapeCreatorGoals(creatorGoals.data) : (previous?.twitch ?? null),
    twitchGoalsError,
    at: Date.now(),
  };
}

/** Twitch liefert höchstens ein aktives Ziel je Typ — nach Typ ablegen. */
function shapeCreatorGoals(list) {
  const out = {};
  for (const g of Array.isArray(list) ? list : []) {
    if (!g || !g.type) continue;
    out[g.type] = {
      id: g.id,
      type: g.type,
      description: g.description || "",
      current: Number(g.current_amount) || 0,
      target: Math.max(1, Number(g.target_amount) || 1),
    };
  }
  return out;
}

async function syncFromTwitch(row, { force = false, forceGoals = false } = {}) {
  const token = decryptToken(row.token_enc);
  if (!token) return readCache(row);
  if (!force && Date.now() - row.last_fetched < MIN_SYNC_INTERVAL_MS) return readCache(row);

  const previous = readCache(row);
  const goalsStale =
    forceGoals || !previous.goals || Date.now() - (previous.goals.at || 0) > GOALS_SYNC_INTERVAL_MS;

  try {
    const [polls, preds, goals] = await Promise.all([
      helix(`polls?broadcaster_id=${row.user_id}&first=1`, token),
      helix(`predictions?broadcaster_id=${row.user_id}&first=1`, token),
      goalsStale ? fetchGoals(row, token, previous.goals) : Promise.resolve(previous.goals),
    ]);
    const cache = {
      poll: shapePoll(polls.data && polls.data[0]),
      prediction: shapePrediction(preds.data && preds.data[0]),
      goals: goals || null,
      notice: null,
    };
    updateCache.run(JSON.stringify(cache), Date.now(), row.user_id);
    return cache;
  } catch (e) {
    if (e.status === 401) {
      // Token abgelaufen oder zurückgezogen — entfernen, damit die Oberfläche
      // "nicht verbunden" zeigt statt endlos in 401 zu laufen.
      updateToken.run("", row.twitch_login, 0, Date.now(), row.user_id);
      return readCache(row);
    }

    // 403 heißt bei Polls/Predictions praktisch immer: kein Affiliate/Partner.
    // Als Hinweis merken, damit das Dashboard erklären kann, warum nichts kommt.
    const cache = { ...previous, notice: null };
    if (e.status === 403) {
      cache.notice = "Twitch gibt Abstimmungen und Vorhersagen nur für Affiliates und Partner frei.";
    }
    // Zeitstempel trotzdem setzen: sonst rennt jeder Overlay-Poll erneut in denselben Fehler.
    updateCache.run(JSON.stringify(cache), Date.now(), row.user_id);
    return cache;
  }
}

const EMPTY_CACHE = { poll: null, prediction: null, goals: null, notice: null };

function readCache(row) {
  try {
    return row.cache ? { ...EMPTY_CACHE, ...JSON.parse(row.cache) } : { ...EMPTY_CACHE };
  } catch {
    return { ...EMPTY_CACHE };
  }
}

function parseConfig(raw) {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// ── Ziel-Einstellungen: Änderungen sofort sichtbar machen ────────────────────
// Die Ziel-Zahlen werden nur alle 30 Sekunden geholt (siehe fetchGoals). Wer im
// Dashboard gerade ein Ziel einrichtet, würde deshalb bis zu eine halbe Minute
// auf ein leeres Modul starren und denken, es geht nicht. Ändert sich etwas an
// den Ziel-Einstellungen, wird der Zwischenspeicher deshalb verworfen — der
// nächste Abruf holt frisch. Reine Positions- oder Farbänderungen lösen das
// bewusst NICHT aus, sonst würde jedes Verschieben eines Widgets Twitch anrufen.
const GOAL_MODULE_IDS = ["followerGoal", "subGoal"];
const GOAL_FIELDS = ["enabled", "source", "twitchType", "usePoints", "target", "startAt", "autoIncrease"];

function goalSignature(config) {
  return GOAL_MODULE_IDS.map((id) => {
    const mod = (config && config.modules && config.modules[id]) || {};
    return GOAL_FIELDS.map((f) => String(mod[f] ?? "")).join(",");
  }).join("|");
}

/** Nächster Abruf holt Ziele und Abstimmungen frisch. */
function invalidateGoals(row) {
  const cache = readCache(row);
  if (cache.goals) cache.goals = { ...cache.goals, at: 0 };
  updateCache.run(JSON.stringify(cache), 0, row.user_id);
}

const raidEnabled = (config) => !!config?.modules?.[raids.MODULE_ID]?.enabled;

/** Der Chat-Bot muss den Kanal betreten/verlassen, wenn das Raid-Modul umgeschaltet wird. */
function refreshRaidChannels() {
  try {
    require("../lib/winchallengeIrc").refreshChannels();
  } catch {
    /* IRC optional */
  }
}

function ircStatus() {
  try {
    return require("../lib/winchallengeIrc").getIrcStatus();
  } catch {
    return { configured: false, connected: false, joined: [] };
  }
}

/** Ob Raids in diesem Kanal gerade wirklich ankommen würden. */
function raidWatchStatus(row) {
  const irc = ircStatus();
  const login = String(row.twitch_login || "").toLowerCase();
  return {
    enabled: raidEnabled(parseConfig(row.config)),
    botConfigured: !!irc.configured,
    botConnected: !!irc.connected,
    watching: !!login && irc.joined.includes(login),
    channel: login,
  };
}

// ── Router ───────────────────────────────────────────────────────────────────
module.exports = function createStreamToolRouter({ requireAuth } = {}) {
  const router = express.Router();

  // ── Eigene Einstellungen ──────────────────────────────────────────────────
  router.get("/me", requireAuth, (req, res) => {
    const row = getOrCreate(String(req.twitchId));
    const granted = (row.scopes || "").split(" ").filter(Boolean);
    res.json({
      overlayKey: row.overlay_key,
      config: parseConfig(row.config),
      connected: !!decryptToken(row.token_enc),
      twitchLogin: row.twitch_login || "",
      clientConfigured: !!CLIENT_ID,
      // Welche Ziel-Module mangels Rechten leer bleiben würden
      missingGoalScopes: GOAL_SCOPES.filter((s) => !granted.includes(s)),
      // Getrennt, weil nur der Modus "Twitch-Ziel" dieses Recht braucht
      hasTwitchGoalScope: granted.includes(TWITCH_GOAL_SCOPE),
      // Raids erkennt der Chat-Bot. Ohne ihn bleibt das Clip-Modul stumm —
      // das Dashboard soll das sagen können, statt es stillschweigend zu schlucken.
      raidWatch: raidWatchStatus(row),
      serverNow: Date.now(),
    });
  });

  router.put("/config", requireAuth, (req, res) => {
    const config = req.body && req.body.config;
    if (!config || typeof config !== "object") return res.status(400).json({ error: "config fehlt" });
    const raw = JSON.stringify(config);
    if (Buffer.byteLength(raw, "utf8") > MAX_CONFIG_BYTES) {
      return res.status(413).json({ error: "Konfiguration zu groß" });
    }
    const userId = String(req.twitchId);
    const before = parseConfig(getOrCreate(userId).config);
    updateConfig.run(raw, Date.now(), userId);

    const row = getByUser.get(userId);
    if (goalSignature(before) !== goalSignature(config)) invalidateGoals(row);
    if (raidEnabled(before) !== raidEnabled(config)) refreshRaidChannels();

    res.json({ ok: true, raidWatch: raidWatchStatus(row) });
  });

  router.post("/overlay/regenerate", requireAuth, (req, res) => {
    getOrCreate(String(req.twitchId));
    updateOverlayKey.run(nanoid(16), Date.now(), String(req.twitchId));
    res.json({ overlayKey: getByUser.get(String(req.twitchId)).overlay_key });
  });

  // ── Twitch-Verbindung ─────────────────────────────────────────────────────
  router.post("/token", requireAuth, async (req, res) => {
    const token = req.body && req.body.token;
    if (!token) return res.status(400).json({ error: "Kein Token übergeben" });

    const info = await validateToken(token);
    if (!info || !info.user_id) return res.status(401).json({ error: "Token ungültig oder abgelaufen" });

    // Entscheidend: der Token muss dem eingeloggten Account gehören, sonst könnte
    // jemand fremde Kanäle an sein eigenes Overlay hängen.
    if (String(info.user_id) !== String(req.twitchId)) {
      return res.status(403).json({ error: "Token gehört zu einem anderen Twitch-Account" });
    }

    const missing = missingScopes(info.scopes || []);
    if (missing.length) {
      return res.status(403).json({
        error: "Dem Token fehlen Rechte für Abstimmungen/Vorhersagen. Bitte erneut verbinden.",
        missingScopes: missing,
      });
    }

    getOrCreate(String(req.twitchId));
    updateToken.run(encryptToken(token), info.login || "", Date.now(), Date.now(), String(req.twitchId));
    updateScopes.run((info.scopes || []).join(" "), String(req.twitchId));
    res.json({
      ok: true,
      twitchLogin: info.login || "",
      missingGoalScopes: GOAL_SCOPES.filter((s) => !(info.scopes || []).includes(s)),
      hasTwitchGoalScope: (info.scopes || []).includes(TWITCH_GOAL_SCOPE),
    });
  });

  router.delete("/token", requireAuth, (req, res) => {
    getOrCreate(String(req.twitchId));
    updateToken.run("", "", 0, Date.now(), String(req.twitchId));
    updateCache.run("", 0, String(req.twitchId));
    clearRaidEvent.run(String(req.twitchId));
    res.json({ ok: true });
  });

  // ── Live-Stand fürs Dashboard ─────────────────────────────────────────────
  router.get("/live", requireAuth, async (req, res) => {
    const row = getOrCreate(String(req.twitchId));
    if (!decryptToken(row.token_enc)) {
      return res.json({ connected: false, poll: null, prediction: null, goals: null, raid: null, raidWatch: raidWatchStatus(row), notice: null, serverNow: Date.now() });
    }
    const data = await syncFromTwitch(row);
    const fresh = getByUser.get(String(req.twitchId));
    res.json({
      connected: !!decryptToken(fresh.token_enc),
      poll: data.poll || null,
      prediction: data.prediction || null,
      goals: data.goals || null,
      raid: raids.activeRaidEvent(fresh),
      // Mitgeschickt, weil der Chat-Bot einen Kanal erst nach ein paar Sekunden
      // betritt — so wird die Anzeige im Dashboard von selbst grün.
      raidWatch: raidWatchStatus(fresh),
      notice: data.notice || null,
      serverNow: Date.now(),
    });
  });

  /**
   * Ziele sofort neu holen. Der Knopf im Dashboard hängt hier dran — genauso
   * greift er, wenn ein Ziel gerade erst im Creator-Dashboard angelegt wurde
   * und die Oberfläche nicht bis zum nächsten Takt warten soll.
   */
  router.post("/goals/refresh", requireAuth, async (req, res) => {
    const row = getOrCreate(String(req.twitchId));
    if (!decryptToken(row.token_enc)) return res.status(400).json({ error: "Twitch ist nicht verbunden." });

    const data = await syncFromTwitch(row, { force: true, forceGoals: true });
    const granted = (row.scopes || "").split(" ").filter(Boolean);
    res.json({
      goals: data.goals || null,
      missingGoalScopes: GOAL_SCOPES.filter((s) => !granted.includes(s)),
      hasTwitchGoalScope: granted.includes(TWITCH_GOAL_SCOPE),
      serverNow: Date.now(),
    });
  });

  // ── Raid-Clips ────────────────────────────────────────────────────────────
  /** Probelauf aus dem Dashboard: spielt einen Clip des angegebenen Kanals ab. */
  router.post("/raid/test", requireAuth, async (req, res) => {
    const login = String((req.body && req.body.login) || "").trim();
    getOrCreate(String(req.twitchId));
    let result;
    try {
      result = await raids.testRaid(String(req.twitchId), login);
    } catch (e) {
      return res.status(502).json({ error: `Twitch antwortet nicht: ${e.message}` });
    }

    const MESSAGES = {
      module_off: "Schalte das Modul „Clip des Raiders“ erst ein.",
      not_connected: "Twitch ist nicht verbunden.",
      no_login: "Bitte einen Kanalnamen angeben.",
      unknown_channel: "Diesen Twitch-Kanal gibt es nicht.",
      no_settings: "Keine Einstellungen gefunden.",
    };
    if (result.error) return res.status(400).json({ error: MESSAGES[result.error] || "Probelauf fehlgeschlagen." });
    if (result.event.error === "no_clips") {
      return res.json({ event: result.event, warning: "Dieser Kanal hat im gewählten Zeitraum keine Clips — das Overlay zeigt nur die Raid-Begrüßung." });
    }
    res.json({ event: result.event });
  });

  /** Laufenden Clip vorzeitig beenden. */
  router.delete("/raid", requireAuth, (req, res) => {
    getOrCreate(String(req.twitchId));
    clearRaidEvent.run(String(req.twitchId));
    res.json({ ok: true });
  });

  // ── Öffentliche Overlay-Route (OBS) ───────────────────────────────────────
  // Kennt nur den overlay_key, bekommt ausschließlich Anzeigedaten.
  router.get("/overlay/:overlayKey", async (req, res) => {
    // Nichts zwischenspeichern: eine gecachte Antwort wäre im Stream nicht von
    // einem stehengebliebenen Overlay zu unterscheiden.
    res.set("Cache-Control", "no-store, must-revalidate");
    const row = getByOverlayKey.get(String(req.params.overlayKey || ""));
    if (!row) return res.status(403).json({ error: "Ungültiger Overlay-Link" });

    const data = await syncFromTwitch(row);
    res.json({
      config: parseConfig(row.config),
      poll: data.poll || null,
      prediction: data.prediction || null,
      goals: data.goals || null,
      // Nur solange der Clip läuft — danach fällt das Feld von selbst wieder weg
      raid: raids.activeRaidEvent(row),
      serverNow: Date.now(),
    });
  });

  return router;
};
