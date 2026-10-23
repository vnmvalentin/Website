// streamToolScenes.js — die bildschirmfüllenden Overlay-Module ("Szenen"):
//
//  - hypeTrain    Zug mit einem Wagen je Level, die Teilnehmer sitzen darin
//  - raidStorm    eine Menschenmenge rennt beim Raid durchs Bild
//  - planeBanner  Flugzeug mit Banner (reine Einstellung, hier nur der Probeflug)
//  - marbleRun    Murmelbahn mit den Zuschauern, die im Chat beigetreten sind
//
// Alles liegt in EINER Spalte ("scenes") als JSON mit einem Schlüssel je Szene.
// Geschrieben wird immer synchron nach frischem Lesen (patchScenes) — der
// Chat-Bot und die Overlay-Route können sich so nicht gegenseitig überholen.
//
// Wie beim Rest der Stream-Tools gibt es keinen Dauer-Poller: Twitch wird nur
// gefragt, solange ein Overlay oder das Dashboard seine Route abruft.
const crypto = require("crypto");
const { nanoid } = require("nanoid");
const { db, decryptToken } = require("./streamToolStore");
const { helix, helixWrite } = require("./twitchHelix");
const { isPremium } = require("../../billing/entitlements");

const IDS = { hype: "hypeTrain", storm: "raidStorm", plane: "planeBanner", marbles: "marbleRun" };
/** Module, für die der Chat-Bot im Kanal sitzen muss. */
const CHAT_IDS = [IDS.hype, IDS.storm, IDS.marbles];

const HYPE_SCOPE = "channel:read:hype_train";
const CHATTERS_SCOPE = "moderator:read:chatters";
/** Einziges Schreibrecht des Stream-Tools — nur für die selbst angelegte Kanalpunkte-Belohnung. */
const REWARD_SCOPE = "channel:manage:redemptions";

const listConnected = db.prepare(
  "SELECT * FROM stream_tool_settings WHERE token_enc <> '' AND twitch_login <> ''"
);
const getByLogin = db.prepare("SELECT * FROM stream_tool_settings WHERE twitch_login = ?");
const getByUser = db.prepare("SELECT * FROM stream_tool_settings WHERE user_id = ?");
const setScenes = db.prepare("UPDATE stream_tool_settings SET scenes = ? WHERE user_id = ?");

const addWin = db.prepare(
  `INSERT INTO marble_wins (user_id, player_id, name, wins, last_at) VALUES (?, ?, ?, 1, ?)
   ON CONFLICT(user_id, player_id) DO UPDATE SET wins = wins + 1, name = excluded.name, last_at = excluded.last_at`
);
const getWins = db.prepare("SELECT wins FROM marble_wins WHERE user_id = ? AND player_id = ?");
// Bei Gleichstand steht vorn, wer die Zahl zuerst erreicht hat
const listTop = db.prepare(
  "SELECT name, wins FROM marble_wins WHERE user_id = ? ORDER BY wins DESC, last_at ASC LIMIT ?"
);
const clearWins = db.prepare("DELETE FROM marble_wins WHERE user_id = ?");

const normalizeLogin = (v) => String(v || "").trim().toLowerCase().replace(/^#/, "");
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

function parseJson(raw) {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Die Modul-Einstellungen des Streamers, oder null wenn das Modul aus ist.
 * Alle Szenen dieser Datei gehören zum Abo (billing/entitlements.js): ohne Abo gilt ein
 * eingeschaltetes Modul als aus — damit greifen Probeläufe, Chat-Befehle, Kanalpunkte und
 * der Abgleich mit Twitch von selbst nicht mehr.
 */
function moduleOf(row, id) {
  const mod = parseJson(row && row.config)?.modules?.[id];
  if (!mod || typeof mod !== "object" || !mod.enabled) return null;
  if (!isPremium(row.user_id)) return null;
  return mod;
}

const hasScope = (row, scope) => String((row && row.scopes) || "").split(" ").includes(scope);

function readScenes(row) {
  const raw = parseJson(row && row.scenes);
  return raw && typeof raw === "object" ? raw : {};
}

/**
 * Liest die Szenen frisch, lässt fn sie ändern und schreibt zurück — alles in
 * einem Zug ohne await dazwischen.
 * @returns {object|null} der neue Stand, oder null wenn es den Streamer nicht gibt
 */
function patchScenes(userId, fn) {
  const row = getByUser.get(String(userId));
  if (!row) return null;
  const scenes = readScenes(row);
  fn(scenes, row);
  setScenes.run(JSON.stringify(scenes), row.user_id);
  return scenes;
}

/* ── Kanäle für den Chat-Bot ──────────────────────────────────────────────── */

/** Kanal -> Beitrittsbefehl der Murmelbahn. Spart den DB-Zugriff je Chatzeile. */
let marbleCommands = new Map();
/** Kanäle, in denen Cheers und Abos für den Hype Train mitgeschrieben werden. */
let hypeLogins = new Set();

function joinCommandOf(mod) {
  const raw = String(mod?.joinCommand || "!murmel").trim().toLowerCase().split(/\s+/)[0] || "!murmel";
  return (raw.startsWith("!") ? raw : `!${raw}`).slice(0, 25);
}

/** Kanäle, in denen der Bot für die Szenen mitlesen soll. Baut nebenbei die Indizes neu. */
function getSceneChannels() {
  const out = new Set();
  const commands = new Map();
  const hype = new Set();
  for (const row of listConnected.all()) {
    const login = normalizeLogin(row.twitch_login);
    if (!login) continue;
    const marbles = moduleOf(row, IDS.marbles);
    if (marbles) commands.set(login, joinCommandOf(marbles));
    if (moduleOf(row, IDS.hype)) hype.add(login);
    if (CHAT_IDS.some((id) => moduleOf(row, id))) out.add(login);
  }
  marbleCommands = commands;
  hypeLogins = hype;
  return [...out];
}

/** Sichtbare Chatzeile über den Bot. Fehlt er, passiert einfach nichts. */
function say(login, text) {
  try {
    require("../../lib/winchallengeIrc").say(login, text);
  } catch {
    /* IRC optional */
  }
}

/* ── Profilbilder ─────────────────────────────────────────────────────────── */

/** User-ID -> Bildadresse ('' = keins). Nur im Speicher: die Adressen ändern sich selten. */
const avatarCache = new Map();
const AVATAR_CACHE_MAX = 5000;

async function loadAvatars(token, ids) {
  if (!token) return;
  const missing = [...new Set(ids.map(String))].filter((id) => /^\d+$/.test(id) && !avatarCache.has(id));
  if (!missing.length) return;
  if (avatarCache.size + missing.length > AVATAR_CACHE_MAX) avatarCache.clear();

  // Helix nimmt höchstens 100 IDs je Aufruf
  for (let i = 0; i < missing.length; i += 100) {
    const chunk = missing.slice(i, i + 100);
    try {
      const data = await helix(`users?${chunk.map((id) => `id=${id}`).join("&")}`, token);
      for (const u of data.data || []) {
        // 150 px reichen für Wagenfenster und Murmeln — das Original hat 300
        avatarCache.set(String(u.id), String(u.profile_image_url || "").replace("300x300", "150x150"));
      }
      for (const id of chunk) if (!avatarCache.has(id)) avatarCache.set(id, "");
    } catch {
      // Ohne Bild geht es auch — beim nächsten Abruf wird erneut versucht
      return;
    }
  }
}

const avatarOf = (id) => avatarCache.get(String(id)) || "";

/** Namen für Probeläufe und Testspieler. */
const TEST_NAMES = [
  "Kieselkönig", "Rollmops", "Bahnbrecher", "Kugelblitz", "Glasperle", "Schusser", "Rundlauf", "Klickerklacker",
  "Murmeltier", "Abroller", "Kullerkeks", "Bergab", "Steilkurve", "Trudel", "Flummi", "Prellbock",
  "Wirbelwind", "Kreisel", "Looping", "Zielgerade", "Schwungholer", "Tempomat", "Nachzügler", "Fotofinish",
];

/* ── Hype Train ───────────────────────────────────────────────────────────── */

const HYPE_SYNC_MS = 4000;
/** Läuft ein Zug, wird öfter gefragt — Levelaufstiege sollen zügig ankommen. */
const HYPE_ACTIVE_SYNC_MS = 2500;
/** So lange bleibt der Zug nach dem Ende noch im Bild (Abfahrt). */
const HYPE_OUTRO_MS = 9000;
const HYPE_MAX_PEOPLE = 60;
/** Beiträge kurz vor dem Start gehören zum Zug: sie haben ihn ausgelöst. */
const HYPE_LOOKBACK_MS = 5 * 60 * 1000;
// Lang genug für eine Runde "hinausfahren und mit Wagen mehr zurückkommen"
const HYPE_TEST_LEVEL_MS = 10000;
const HYPE_TEST_LEVELS = 4;

const hypeSyncAt = new Map(); // userId -> Zeitpunkt des letzten Abrufs
const recentContrib = new Map(); // login -> [{ t, id, name }]

/**
 * Cheer oder Abo im Chat. Twitch nennt nur die Spitzen-Beitragenden eines Zugs;
 * wer sonst noch mitgemacht hat, sieht nur der Chat-Bot. Deshalb wird hier
 * mitgeschrieben und beim nächsten Abgleich dem Zug zugeordnet.
 */
function onContribution(channel, tags = {}) {
  const login = normalizeLogin(channel);
  if (!hypeLogins.has(login)) return;
  const id = String(tags["user-id"] || "");
  if (!/^\d+$/.test(id)) return;

  const now = Date.now();
  const list = (recentContrib.get(login) || []).filter((e) => now - e.t < HYPE_LOOKBACK_MS * 2);
  list.push({ t: now, id, name: String(tags["display-name"] || tags.username || "").slice(0, 30) });
  recentContrib.set(login, list.slice(-200));
}

async function syncHype(row, token) {
  if (!moduleOf(row, IDS.hype) || !hasScope(row, HYPE_SCOPE)) return;
  const stored = readScenes(row).hype;
  if (stored && stored.test) return;

  const now = Date.now();
  const running = stored && !stored.endedAt;
  if (now - (hypeSyncAt.get(row.user_id) || 0) < (running ? HYPE_ACTIVE_SYNC_MS : HYPE_SYNC_MS)) return;
  hypeSyncAt.set(row.user_id, now);

  let current;
  try {
    const data = await helix(`hypetrain/status?broadcaster_id=${row.user_id}`, token);
    current = (data.data && data.data[0] && data.data[0].current) || null;
  } catch {
    // Der Hauptabgleich kümmert sich um abgelaufene Tokens; hier bleibt einfach der alte Stand
    return;
  }

  const buffered = recentContrib.get(normalizeLogin(row.twitch_login)) || [];
  const scenes = patchScenes(row.user_id, (s) => {
    const prev = s.hype && !s.hype.test ? s.hype : null;
    if (!current) {
      if (prev && !prev.endedAt) prev.endedAt = Date.now();
      else if (prev && Date.now() - prev.endedAt > HYPE_OUTRO_MS) delete s.hype;
      return;
    }

    const startedAt = Date.parse(current.started_at) || Date.now();
    // Reihenfolge = Reihenfolge des Zusteigens. Sie bleibt über die Abrufe
    // stabil, damit niemand im Bild den Wagen wechselt.
    const people = new Map();
    if (prev && prev.id === current.id) for (const p of prev.people || []) people.set(p.id, p);
    const add = (id, name) => {
      if (!id || people.has(id)) return;
      people.set(id, { id, name: name || "" });
    };
    for (const e of buffered) if (e.t >= startedAt - HYPE_LOOKBACK_MS) add(e.id, e.name);
    for (const c of current.top_contributions || []) add(String(c.user_id || ""), c.user_name || c.user_login);

    s.hype = {
      id: String(current.id),
      level: Math.max(1, Number(current.level) || 1),
      total: Number(current.total) || 0,
      progress: Number(current.progress) || 0,
      goal: Math.max(1, Number(current.goal) || 1),
      startedAt,
      expiresAt: Date.parse(current.expires_at) || 0,
      endedAt: 0,
      kind: String(current.type || "regular"),
      people: [...people.values()].slice(0, HYPE_MAX_PEOPLE),
    };
  });

  if (scenes?.hype?.people) await loadAvatars(token, scenes.hype.people.map((p) => p.id));
}

/** Der Probezug rechnet sich aus der Uhr: jede Abfrage sieht denselben Stand. */
function shapeTestHype(st, row, now) {
  const elapsed = now - st.startedAt;
  const runMs = HYPE_TEST_LEVEL_MS * HYPE_TEST_LEVELS;
  const endedAt = elapsed >= runMs ? st.startedAt + runMs : 0;
  const level = clamp(1 + Math.floor(elapsed / HYPE_TEST_LEVEL_MS), 1, HYPE_TEST_LEVELS);
  const goal = 1000 + level * 600;
  const part = endedAt ? 1 : (elapsed % HYPE_TEST_LEVEL_MS) / HYPE_TEST_LEVEL_MS;

  const people = [{ id: String(row.user_id), name: row.twitch_login || "Du" }];
  for (let i = 0; i < Math.min(TEST_NAMES.length, level * 4); i++) people.push({ id: `test-${i}`, name: TEST_NAMES[i] });

  return {
    id: st.id,
    level,
    total: Math.round((level - 1) * 1300 + part * goal),
    progress: Math.round(part * goal),
    goal,
    startedAt: st.startedAt,
    expiresAt: st.startedAt + runMs,
    endedAt,
    kind: "regular",
    test: true,
    people,
  };
}

function publicHype(row, scenes, now) {
  if (!moduleOf(row, IDS.hype)) return null;
  const st = scenes.hype;
  if (!st) return null;
  const view = st.test ? shapeTestHype(st, row, now) : st;
  if (view.endedAt && now - view.endedAt > HYPE_OUTRO_MS) return null;
  return {
    id: view.id,
    level: view.level,
    total: view.total,
    progress: view.progress,
    goal: view.goal,
    expiresAt: view.expiresAt,
    endedAt: view.endedAt || 0,
    kind: view.kind,
    test: !!view.test,
    people: (view.people || []).map((p) => ({ id: p.id, name: p.name, avatar: avatarOf(p.id) })),
  };
}

function testHype(userId) {
  const row = getByUser.get(String(userId));
  if (!row) return { error: "no_settings" };
  if (!moduleOf(row, IDS.hype)) return { error: "module_off" };
  patchScenes(userId, (s) => {
    s.hype = { test: true, id: `test-${nanoid(8)}`, startedAt: Date.now() };
  });
  return { ok: true };
}

/* ── Raid-Ansturm ─────────────────────────────────────────────────────────── */

/** Mehr Figuren zeichnet das Overlay nicht — die echte Zahl steht auf dem Schild. */
const STORM_MAX_FIGURES = 140;
const STORM_DEDUPE_MS = 30 * 1000;
const STORM_MAX_DELAY_S = 60;

/** Wie lange der Ansturm dauert — mehr Leute brauchen länger, bis alle durch sind. */
const stormDurationMs = (viewers) => 11000 + Math.min(Math.max(0, viewers), STORM_MAX_FIGURES) * 70;

/* Wer bei einem Raid mitkommt, verrät Twitch nicht. Die Namen sind deshalb eine
   Schätzung: wer kurz nach dem Raid neu in der Zuschauerliste steht und vorher
   nicht da war, kam vermutlich mit. Dafür braucht es einen Stand von VOR dem
   Raid — er wird alle anderthalb Minuten aufgefrischt, solange ein Overlay läuft. */
const CHATTERS_SYNC_MS = 90 * 1000;
const CHATTERS_MAX_AGE_MS = 10 * 60 * 1000;
const CHATTERS_MAX_PAGES = 3;
/** Nach einem Raid nicht auffrischen, sonst gälten die Raider gleich als Stammpublikum. */
const CHATTERS_FREEZE_MS = 3 * 60 * 1000;

const chatterBase = new Map(); // userId -> { at, ids:Set }
const chattersSyncAt = new Map();

async function fetchChatters(row, token) {
  const out = [];
  let cursor = "";
  for (let page = 0; page < CHATTERS_MAX_PAGES; page++) {
    const params = new URLSearchParams({ broadcaster_id: row.user_id, moderator_id: row.user_id, first: "1000" });
    if (cursor) params.set("after", cursor);
    const data = await helix(`chat/chatters?${params.toString()}`, token);
    for (const c of data.data || []) out.push({ id: String(c.user_id), name: c.user_name || c.user_login });
    cursor = data.pagination && data.pagination.cursor;
    if (!cursor) break;
  }
  return out;
}

const wantsRaidNames = (row) => {
  const mod = moduleOf(row, IDS.storm);
  return !!mod && mod.guessNames !== false && hasScope(row, CHATTERS_SCOPE);
};

async function syncChatters(row, token) {
  if (!wantsRaidNames(row)) return;
  const now = Date.now();
  if (now - (chattersSyncAt.get(row.user_id) || 0) < CHATTERS_SYNC_MS) return;
  const storm = readScenes(row).storm;
  if (storm && !storm.test && now - storm.at < CHATTERS_FREEZE_MS) return;
  chattersSyncAt.set(row.user_id, now);
  try {
    const list = await fetchChatters(row, token);
    chatterBase.set(row.user_id, { at: now, ids: new Set(list.map((c) => c.id)) });
  } catch {
    /* beim nächsten Takt erneut */
  }
}

/** Trägt die mutmaßlichen Raider (Name + Profilbild) am noch laufenden Ansturm nach. */
async function fillRaidNames(userId, eventId) {
  const row = getByUser.get(String(userId));
  if (!row || !wantsRaidNames(row)) return;
  const token = decryptToken(row.token_enc);
  const base = chatterBase.get(row.user_id);
  if (!token || !base || Date.now() - base.at > CHATTERS_MAX_AGE_MS) return;

  let list;
  try {
    list = await fetchChatters(row, token);
  } catch {
    return;
  }
  const scenes = patchScenes(userId, (s) => {
    const ev = s.storm;
    if (!ev || ev.id !== eventId) return;
    // Reihenfolge bleibt stehen: eine Figur, die schon läuft, behält ihren Kopf
    const people = new Map((ev.people || []).map((p) => [p.id, p]));
    const limit = Math.min(ev.viewers, STORM_MAX_FIGURES);
    for (const c of list) {
      if (people.size >= limit) break;
      if (base.ids.has(c.id) || c.id === ev.raider.id || c.id === String(row.user_id)) continue;
      if (!people.has(c.id)) people.set(c.id, { id: c.id, name: c.name });
    }
    ev.people = [...people.values()];
  });
  // Die Profilbilder werden zum Kopf der Figuren
  const found = scenes?.storm?.id === eventId ? scenes.storm.people || [] : [];
  if (found.length) await loadAvatars(token, found.map((p) => p.id));
}

/**
 * Aufgerufen vom Chat-Bot, wenn ein Kanal geraidet wird.
 * @returns {Promise<object|null>} das abgelegte Ereignis
 */
async function onRaid(channel, raiderName, viewers, tags = {}) {
  const row = getByLogin.get(normalizeLogin(channel));
  const mod = row && moduleOf(row, IDS.storm);
  if (!mod) return null;

  const count = Math.max(0, Math.round(Number(viewers) || 0));
  if (count < Math.max(0, Number(mod.minViewers) || 0)) return null;

  const login = normalizeLogin(tags["msg-param-login"] || tags.login || raiderName);
  const now = Date.now();
  const prev = readScenes(row).storm;
  if (prev && !prev.test && normalizeLogin(prev.raider?.login) === login && now - prev.at < STORM_DEDUPE_MS) return null;

  const delay = clamp(Math.round(Number(mod.delaySeconds) || 0), 0, STORM_MAX_DELAY_S) * 1000;
  const durationMs = stormDurationMs(count);
  const event = {
    id: nanoid(10),
    at: now,
    startsAt: now + delay,
    endsAt: now + delay + durationMs + 1000,
    durationMs,
    test: false,
    raider: {
      id: String(tags["user-id"] || ""),
      login,
      name: String(tags["msg-param-displayName"] || raiderName || login),
    },
    viewers: count,
    people: [],
  };
  patchScenes(row.user_id, (s) => { s.storm = event; });

  const token = decryptToken(row.token_enc);
  if (event.raider.id) loadAvatars(token, [event.raider.id]).catch(() => {});

  // Zwei Anläufe: die Zuschauerliste von Twitch hinkt nach. Figuren, die erst
  // später loslaufen, bekommen die nachgetragenen Namen noch mit.
  if (wantsRaidNames(row)) {
    const first = Math.max(1000, delay - 2000);
    for (const wait of [first, first + 8000]) {
      const t = setTimeout(() => fillRaidNames(row.user_id, event.id).catch(() => {}), wait);
      if (typeof t.unref === "function") t.unref();
    }
  }
  return event;
}

function testStorm(userId, viewers) {
  const row = getByUser.get(String(userId));
  if (!row) return { error: "no_settings" };
  if (!moduleOf(row, IDS.storm)) return { error: "module_off" };

  const count = clamp(Math.round(Number(viewers) || 40), 1, 100000);
  const now = Date.now();
  const durationMs = stormDurationMs(count);
  // Jede dritte Probefigur trägt das eigene Profilbild — sonst sähe man im
  // Probelauf nie, wie ein erkannter Raider aussieht.
  const people = [];
  for (let i = 0; i < Math.min(count, STORM_MAX_FIGURES, TEST_NAMES.length * 2); i++) {
    const name = i < TEST_NAMES.length ? TEST_NAMES[i] : `${TEST_NAMES[i - TEST_NAMES.length]}_${i}`;
    people.push({ id: i % 3 === 0 ? String(row.user_id) : `test-${i}`, name });
  }
  loadAvatars(decryptToken(row.token_enc), [String(row.user_id)]).catch(() => {});
  patchScenes(userId, (s) => {
    s.storm = {
      id: nanoid(10),
      at: now,
      startsAt: now,
      endsAt: now + durationMs + 1000,
      durationMs,
      test: true,
      raider: { id: String(row.user_id), login: row.twitch_login, name: row.twitch_login || "Beispielkanal" },
      viewers: count,
      people,
    };
  });
  return { ok: true };
}

function publicStorm(row, scenes, now) {
  const mod = moduleOf(row, IDS.storm);
  const ev = scenes.storm;
  if (!mod || !ev || now > ev.endsAt) return null;
  return {
    id: ev.id,
    startsAt: ev.startsAt,
    endsAt: ev.endsAt,
    durationMs: ev.durationMs,
    test: !!ev.test,
    raider: { name: ev.raider.name, avatar: avatarOf(ev.raider.id) },
    viewers: ev.viewers,
    people: mod.guessNames === false && !ev.test
      ? []
      : (ev.people || []).map((p) => ({ name: p.name, avatar: avatarOf(p.id) })),
  };
}

/* ── Flugzeug mit Banner ──────────────────────────────────────────────────── */

/** So lange gilt ein Probeflug als "gerade ausgelöst" — danach vergisst ihn das Overlay. */
const PLANE_TEST_TTL_MS = 2 * 60 * 1000;

function testPlane(userId) {
  const row = getByUser.get(String(userId));
  if (!row) return { error: "no_settings" };
  if (!moduleOf(row, IDS.plane)) return { error: "module_off" };
  patchScenes(userId, (s) => { s.plane = { id: nanoid(8), flyAt: Date.now() }; });
  return { ok: true };
}

function publicPlane(row, scenes, now) {
  const p = scenes.plane;
  if (!moduleOf(row, IDS.plane) || !p || now - p.flyAt > PLANE_TEST_TTL_MS) return null;
  return { id: p.id, flyAt: p.flyAt };
}

/* ── Murmelbahn ───────────────────────────────────────────────────────────── */

const MARBLES_MAX_PLAYERS = 80;
const MARBLES_COUNTDOWN_MS = 6000;
/** Meldet niemand einen Sieger (kein Overlay offen), räumt sich das Rennen selbst ab. */
const MARBLES_RACE_TIMEOUT_MS = 5 * 60 * 1000;
/** Früher kann kein Rennen entschieden sein — schützt vor verfrühten Meldungen. */
const MARBLES_MIN_RACE_MS = 3000;

const maxPlayersOf = (mod) => clamp(Math.round(Number(mod.maxPlayers) || 40), 2, MARBLES_MAX_PLAYERS);

function beginRace(m, now, mod) {
  m.phase = "race";
  // Aus dem Startwert baut jedes Overlay dieselbe Bahn und rechnet dasselbe Rennen
  m.seed = crypto.randomInt(1, 2 ** 31 - 1);
  m.startsAt = now + MARBLES_COUNTDOWN_MS;
  // Länge der Bahn beim Start festhalten: eine Änderung mitten im Rennen würde
  // sonst jeder Quelle eine andere Bahn geben
  m.sections = clamp(Math.round(Number(mod && mod.sections) || 12), 6, 24);
}

/* ── Kanalpunkte-Belohnung, die die Seite selbst anlegt ─────────────────────
 *
 * Twitch gibt die Einlösungen einer Belohnung nur der Anwendung heraus, die sie
 * angelegt hat. Legt also die Seite die Belohnung an, kann sie die Einlösungen
 * abfragen — ganz ohne Textfeld und ohne den Chat-Bot. Und sie kann sie
 * abschließen oder erstatten:
 *
 *   - Einlösung kommt        -> Anmeldung öffnet sich, der Einlösende ist dabei;
 *                               die Einlösung bleibt in Twitch "offen"
 *   - Rennen startet         -> alle offenen Einlösungen werden abgeschlossen
 *   - Rennen fällt aus       -> sie werden erstattet (zu wenige Murmeln, Abbruch)
 *   - Einlösung mitten im Rennen -> sofort erstattet
 *
 * Abgefragt wird wie alles andere nur, solange ein Overlay oder das Dashboard
 * seine Route abruft.
 */
const REWARD_SYNC_MS = 3000;
const rewardSyncAt = new Map(); // userId -> Zeitpunkt des letzten Abrufs

/** Merkt die offenen Einlösungen eines Rennens zum Abschließen oder Erstatten vor. */
function settleRedemptions(s, m, status) {
  if (!m || !Array.isArray(m.redemptions) || !m.redemptions.length) return;
  s.rewardQueue = (s.rewardQueue || []).concat(m.redemptions.map((id) => ({ id, reward: m.rewardId, status })));
  m.redemptions = [];
}

const managedReward = (row) => {
  const mod = moduleOf(row, IDS.marbles);
  return mod && mod.rewardManaged && mod.rewardId && hasScope(row, REWARD_SCOPE) ? String(mod.rewardId) : "";
};

async function syncReward(row, token) {
  // Vorgemerkte Abschlüsse/Erstattungen zuerst — unabhängig davon, ob die
  // Belohnung inzwischen ausgeschaltet wurde
  const queue = readScenes(row).rewardQueue || [];
  if (queue.length && hasScope(row, REWARD_SCOPE)) {
    const done = [];
    for (const status of ["FULFILLED", "CANCELED"]) {
      const group = queue.filter((q) => q.status === status && q.reward).slice(0, 50);
      if (!group.length) continue;
      const params = new URLSearchParams({ broadcaster_id: row.user_id, reward_id: group[0].reward });
      for (const q of group.filter((x) => x.reward === group[0].reward)) params.append("id", q.id);
      try {
        await helixWrite("PATCH", `channel_points/custom_rewards/redemptions?${params.toString()}`, token, { status });
      } catch (e) {
        // 404 = längst erledigt (z. B. von Hand in Twitch) — nicht ewig wiederholen
        if (e.status !== 404 && e.status !== 400) continue;
      }
      done.push(...params.getAll("id"));
    }
    if (done.length) {
      patchScenes(row.user_id, (s) => {
        s.rewardQueue = (s.rewardQueue || []).filter((q) => !done.includes(q.id));
        if (!s.rewardQueue.length) delete s.rewardQueue;
      });
    }
  }

  const rewardId = managedReward(row);
  if (!rewardId) return;
  const now = Date.now();
  if (now - (rewardSyncAt.get(row.user_id) || 0) < REWARD_SYNC_MS) return;
  rewardSyncAt.set(row.user_id, now);

  let list;
  try {
    const params = new URLSearchParams({ broadcaster_id: row.user_id, reward_id: rewardId, status: "UNFULFILLED", first: "50" });
    list = (await helix(`channel_points/custom_rewards/redemptions?${params.toString()}`, token)).data || [];
  } catch {
    return;
  }

  const mod = moduleOf(row, IDS.marbles);
  for (const r of list) {
    const fresh = getByUser.get(row.user_id);
    const state = readScenes(fresh);
    if ((state.marbles?.redemptions || []).includes(r.id)) continue; // wartet schon auf den Start
    if ((state.rewardQueue || []).some((q) => q.id === r.id)) continue; // wird gerade erledigt

    // Läuft schon ein Rennen, gibt es die Punkte zurück
    if (state.marbles && state.marbles.phase !== "join") {
      patchScenes(row.user_id, (s) => { s.rewardQueue = (s.rewardQueue || []).concat({ id: r.id, reward: rewardId, status: "CANCELED" }); });
      continue;
    }
    if (!state.marbles) marblesOpen(row.user_id);
    patchScenes(row.user_id, (s) => {
      const m = s.marbles;
      if (!m || m.phase !== "join") return;
      m.rewardId = rewardId;
      m.redemptions = (m.redemptions || []).concat(r.id);
      const id = String(r.user_id);
      if (m.players.length < maxPlayersOf(mod) && !m.players.some((p) => p.id === id)) {
        m.players.push({ id, name: String(r.user_name || r.user_login || "").slice(0, 30) });
      }
    });
  }
}

const REWARD_ERRORS = {
  403: "Kanalpunkte-Belohnungen gibt es nur für Affiliates und Partner.",
  401: "Twitch hat die Anmeldung abgelehnt — bitte das Recht erneut erteilen.",
};

/** Legt die Belohnung in Twitch an. Die ID speichert das Dashboard in den Einstellungen. */
async function createReward(userId, { title, cost } = {}) {
  const row = getByUser.get(String(userId));
  if (!row) return { error: "Keine Einstellungen gefunden." };
  const token = decryptToken(row.token_enc);
  if (!token) return { error: "Twitch ist nicht verbunden." };
  if (!hasScope(row, REWARD_SCOPE)) return { error: "Dafür fehlt noch das Recht, Kanalpunkte-Belohnungen zu verwalten.", needsScope: true };

  const name = String(title || "").trim().slice(0, 45) || "Murmelrennen starten";
  try {
    const data = await helixWrite("POST", `channel_points/custom_rewards?broadcaster_id=${row.user_id}`, token, {
      title: name,
      cost: clamp(Math.round(Number(cost) || 500), 1, 1000000),
      is_enabled: true,
      is_user_input_required: false,
      // Offen lassen, bis das Rennen wirklich startet — sonst ließe sich nichts erstatten
      should_redemptions_skip_request_queue: false,
    });
    const reward = data.data && data.data[0];
    if (!reward) return { error: "Twitch hat keine Belohnung zurückgegeben." };
    return { ok: true, reward: { id: reward.id, title: reward.title, cost: reward.cost } };
  } catch (e) {
    // Twitch verlangt eindeutige Titel
    if (e.status === 400 && /DUPLICATE|duplicate|already exists/i.test(e.message)) {
      return { error: `Eine Belohnung namens „${name}“ gibt es schon — wähle einen anderen Namen.` };
    }
    return { error: REWARD_ERRORS[e.status] || `Twitch: ${e.message}` };
  }
}

/** Löscht die von der Seite angelegte Belohnung wieder aus Twitch. */
async function deleteReward(userId, rewardId) {
  const row = getByUser.get(String(userId));
  const token = row && decryptToken(row.token_enc);
  if (!token || !rewardId || !hasScope(row, REWARD_SCOPE)) return { ok: true };
  patchScenes(userId, (s) => { settleRedemptions(s, s.marbles, "CANCELED"); });
  try {
    const params = new URLSearchParams({ broadcaster_id: row.user_id, id: String(rewardId) });
    await helixWrite("DELETE", `channel_points/custom_rewards?${params.toString()}`, token);
  } catch (e) {
    if (e.status !== 404) return { error: `Twitch: ${e.message}` };
  }
  return { ok: true };
}

/** Zeitabhängige Übergänge. Läuft bei jedem Lesen mit — einen Timer gibt es nicht. */
function tickMarbles(row) {
  const m = readScenes(row).marbles;
  if (!m) return;
  const now = Date.now();
  const due =
    (m.phase === "join" && m.joinEndsAt && now >= m.joinEndsAt) ||
    (m.phase === "race" && now > m.startsAt + MARBLES_RACE_TIMEOUT_MS) ||
    (m.phase === "done" && now > m.hideAt);
  if (!due) return;

  let note = "";
  patchScenes(row.user_id, (s) => {
    const cur = s.marbles;
    if (!cur) return;
    if (cur.phase === "join" && cur.players.length >= 2) {
      beginRace(cur, Date.now(), moduleOf(row, IDS.marbles));
      settleRedemptions(s, cur, "FULFILLED");
      return;
    }
    if (cur.phase === "join") note = "Zu wenige Murmeln am Start — das Rennen fällt aus.";
    settleRedemptions(s, cur, "CANCELED");
    delete s.marbles;
  });
  if (note && moduleOf(row, IDS.marbles)?.announce !== false) say(row.twitch_login, note);
}

function marblesOpen(userId) {
  const row = getByUser.get(String(userId));
  if (!row) return { error: "no_settings" };
  const mod = moduleOf(row, IDS.marbles);
  if (!mod) return { error: "module_off" };

  const seconds = clamp(Math.round(Number(mod.joinSeconds) || 0), 0, 600);
  const now = Date.now();
  patchScenes(userId, (s) => {
    // Eine noch offene Anmeldung wird ersetzt — deren Einlösungen gehen zurück
    settleRedemptions(s, s.marbles, "CANCELED");
    s.marbles = {
      id: nanoid(10),
      phase: "join",
      openedAt: now,
      joinEndsAt: seconds > 0 ? now + seconds * 1000 : 0,
      players: [],
    };
  });
  if (mod.announce !== false) {
    say(row.twitch_login, `Die Murmelbahn ist offen — mit ${joinCommandOf(mod)} bist du dabei.`);
  }
  return { ok: true };
}

function marblesStart(userId) {
  const row = getByUser.get(String(userId));
  if (!row) return { error: "no_settings" };
  if (!moduleOf(row, IDS.marbles)) return { error: "module_off" };
  let error = null;
  patchScenes(userId, (s) => {
    const m = s.marbles;
    if (!m || m.phase !== "join") error = "not_open";
    else if (m.players.length < 2) error = "too_few";
    else {
      beginRace(m, Date.now(), moduleOf(row, IDS.marbles));
      settleRedemptions(s, m, "FULFILLED");
    }
  });
  return error ? { error } : { ok: true };
}

function marblesCancel(userId) {
  patchScenes(userId, (s) => {
    settleRedemptions(s, s.marbles, "CANCELED");
    delete s.marbles;
  });
  return { ok: true };
}

/** Testspieler aus dem Dashboard — zum Ausprobieren ohne Chat. */
function marblesAddBots(userId, count) {
  const row = getByUser.get(String(userId));
  if (!row) return { error: "no_settings" };
  const mod = moduleOf(row, IDS.marbles);
  if (!mod) return { error: "module_off" };
  let error = null;
  patchScenes(userId, (s) => {
    const m = s.marbles;
    if (!m || m.phase !== "join") { error = "not_open"; return; }
    const room = maxPlayersOf(mod) - m.players.length;
    const n = clamp(Math.round(Number(count) || 8), 1, Math.max(0, room));
    const have = m.players.filter((p) => p.bot).length;
    for (let i = 0; i < n && room > 0; i++) {
      const k = have + i;
      const base = TEST_NAMES[k % TEST_NAMES.length];
      m.players.push({ id: `bot-${k}`, name: k < TEST_NAMES.length ? base : `${base} ${Math.floor(k / TEST_NAMES.length) + 1}`, bot: true });
    }
  });
  return error ? { error } : { ok: true };
}

/**
 * Das Overlay meldet den Sieger. Gerechnet wird das Rennen im Browser — aus dem
 * Startwert und nur mit Grundrechenarten, deshalb kommt jede Quelle auf
 * dasselbe Ergebnis. Die erste Meldung zählt.
 */
function marblesResult(row, raceId, winnerId) {
  const mod = moduleOf(row, IDS.marbles);
  if (!mod) return { error: "module_off" };
  let winner = null;
  patchScenes(row.user_id, (s) => {
    const m = s.marbles;
    const now = Date.now();
    if (!m || m.phase !== "race" || m.id !== String(raceId) || now < m.startsAt + MARBLES_MIN_RACE_MS) return;
    const player = m.players.find((p) => p.id === String(winnerId));
    if (!player) return;
    winner = { id: player.id, name: player.name, wins: 0 };
    // Testmurmeln kommen nicht in die Bestenliste
    if (!player.bot) {
      addWin.run(row.user_id, player.id, player.name, now);
      winner.wins = getWins.get(row.user_id, player.id)?.wins || 1;
    }
    m.phase = "done";
    m.winner = winner;
    m.finishedAt = now;
    m.hideAt = now + clamp(Math.round(Number(mod.winnerSeconds) || 15), 5, 120) * 1000;
  });
  if (!winner) return { error: "rejected" };
  if (mod.announce !== false) {
    say(row.twitch_login, `${winner.name} gewinnt das Murmelrennen!${winner.wins > 1 ? ` Das ist Sieg Nr. ${winner.wins}.` : ""}`);
  }
  return { ok: true, winner };
}

/* Bestenliste */

const TOP_COOLDOWN_MS = 15 * 1000;
const topSaidAt = new Map(); // login -> Zeitpunkt der letzten Ausgabe

const marbleTop = (userId, limit = 5) => listTop.all(String(userId), limit);

function sayTop(row) {
  const login = normalizeLogin(row.twitch_login);
  const now = Date.now();
  // Jeder darf fragen — deshalb gedrosselt, sonst füllt die Liste den Chat
  if (now - (topSaidAt.get(login) || 0) < TOP_COOLDOWN_MS) return;
  topSaidAt.set(login, now);
  const top = marbleTop(row.user_id, 5);
  say(login, top.length
    ? `Murmel-Bestenliste: ${top.map((e, i) => `${i + 1}. ${e.name} (${e.wins})`).join(" · ")}`
    : "Noch hat niemand ein Murmelrennen gewonnen.");
}

function resetMarbleTop(userId) {
  clearWins.run(String(userId));
  return { ok: true };
}

/* Start über eine Kanalpunkte-Belohnung
 *
 * Der Chat-Bot sieht eine Einlösung nur, wenn die Belohnung ein Textfeld hat —
 * dann schickt Twitch sie als Chatzeile mit der ID der Belohnung. Dafür braucht
 * es kein zusätzliches Recht. Die ID lernt das Dashboard, indem der Streamer
 * die Belohnung einmal selbst einlöst ("Belohnung erkennen").
 */
const LEARN_MS = 90 * 1000;
const learnUntil = new Map(); // userId -> bis wann die nächste Einlösung gemerkt wird

function learnReward(userId) {
  const row = getByUser.get(String(userId));
  if (!row) return { error: "no_settings" };
  if (!moduleOf(row, IDS.marbles)) return { error: "module_off" };
  learnUntil.set(row.user_id, Date.now() + LEARN_MS);
  patchScenes(userId, (s) => { delete s.reward; });
  return { ok: true };
}

/** Fürs Dashboard: Stand der Erkennung und die Bestenliste. */
function marbleSetup(row) {
  const reward = readScenes(row).reward;
  return {
    learning: (learnUntil.get(row.user_id) || 0) > Date.now(),
    // Nur eine frisch erkannte ID — das Dashboard übernimmt sie in die Einstellungen
    reward: reward && Date.now() - reward.at < 10 * 60 * 1000 ? reward : null,
    top: marbleTop(row.user_id, 10),
  };
}

function joinPlayer(row, mod, tags) {
  const id = String(tags["user-id"] || "");
  if (!/^\d+$/.test(id)) return;
  const name = String(tags["display-name"] || tags.username || "").slice(0, 30);
  patchScenes(row.user_id, (s) => {
    const m = s.marbles;
    if (!m || m.phase !== "join" || m.players.length >= maxPlayersOf(mod)) return;
    if (m.players.some((p) => p.id === id)) return;
    m.players.push({ id, name });
  });
}

/**
 * Einlösung einer Kanalpunkte-Belohnung mit Textfeld.
 * Öffnet die Anmeldung (wenn keine offen ist) und meldet den Einlösenden gleich an.
 */
function onRedeem(channel, tags = {}, rewardId = "") {
  const login = normalizeLogin(channel);
  if (!marbleCommands.has(login)) return;
  const row = getByLogin.get(login);
  const mod = row && moduleOf(row, IDS.marbles);
  if (!mod) return;

  const id = String(rewardId || "");
  if ((learnUntil.get(row.user_id) || 0) > Date.now()) {
    learnUntil.delete(row.user_id);
    patchScenes(row.user_id, (s) => { s.reward = { id, at: Date.now() }; });
    return;
  }

  if (!id || id !== String(mod.rewardId || "").trim()) return;
  const state = readScenes(row).marbles;
  // Läuft schon ein Rennen, verfällt die Einlösung — erstatten kann nur der Streamer
  if (state && state.phase !== "join") return;
  if (!state) marblesOpen(row.user_id);
  joinPlayer(row, mod, tags);
}

const isModOrBroadcaster = (tags) => {
  if (tags.mod === true || tags.mod === "1") return true;
  const b = tags.badges;
  if (b && typeof b === "object" && b.broadcaster != null) return true;
  return typeof b === "string" && b.includes("broadcaster");
};

/**
 * Chatzeile, die mit "!" beginnt. Der Beitrittsbefehl allein meldet an; mit
 * "open", "start" oder "stop" dahinter steuern Streamer und Mods das Rennen.
 */
function onChatCommand(channel, tags = {}, message = "") {
  const login = normalizeLogin(channel);
  const command = marbleCommands.get(login);
  if (!command) return;
  const text = String(message).trim().toLowerCase();
  const wantsTop = text === "!murmeltop" || text === `${command}top` || text === `${command} top`;
  if (!wantsTop && text !== command && !text.startsWith(`${command} `)) return;

  const row = getByLogin.get(login);
  const mod = row && moduleOf(row, IDS.marbles);
  if (!mod) return;

  if (wantsTop) {
    sayTop(row);
    return;
  }

  const arg = text.slice(command.length).trim();
  if (arg) {
    if (!isModOrBroadcaster(tags)) return;
    if (arg === "open") marblesOpen(row.user_id);
    else if (arg === "start") {
      const r = marblesStart(row.user_id);
      if (r.error === "too_few") say(login, "Für ein Rennen braucht es mindestens zwei Murmeln.");
    } else if (arg === "stop") marblesCancel(row.user_id);
    return;
  }

  joinPlayer(row, mod, tags);
}

function publicMarbles(row, scenes) {
  const mod = moduleOf(row, IDS.marbles);
  const m = scenes.marbles;
  if (!mod || !m) return null;
  return {
    id: m.id,
    phase: m.phase,
    command: joinCommandOf(mod),
    joinEndsAt: m.joinEndsAt || 0,
    seed: m.phase === "join" ? 0 : m.seed,
    startsAt: m.startsAt || 0,
    sections: m.sections || 0,
    winner: m.winner || null,
    // Die drei Besten für die Anmeldekarte
    top: mod.showTop === false ? [] : marbleTop(row.user_id, 3),
    players: m.players.map((p) => ({ id: p.id, name: p.name, avatar: avatarOf(p.id) })),
  };
}

/* ── Sammelabruf für die Routen ───────────────────────────────────────────── */

/**
 * Gleicht Twitch ab (gedrosselt) und liefert die Anzeigedaten aller Szenen.
 * Ein Fehlschlag reißt nichts mit: schlimmstenfalls bleibt eine Szene leer.
 */
async function collect(row) {
  const token = decryptToken(row.token_enc);
  if (token) {
    await Promise.all([
      syncHype(row, token).catch(() => {}),
      syncChatters(row, token).catch(() => {}),
    ]);
    // Vor den Zeitübergängen: eine frische Einlösung soll noch in dieses Rennen
    await syncReward(row, token).catch(() => {});
  }
  tickMarbles(row);
  // Was tickMarbles gerade abgeschlossen oder erstattet hat, gleich erledigen
  if (token && (readScenes(getByUser.get(row.user_id) || row).rewardQueue || []).length) {
    await syncReward(getByUser.get(row.user_id) || row, token).catch(() => {});
  }

  const fresh = getByUser.get(row.user_id) || row;
  const scenes = readScenes(fresh);
  if (token && scenes.marbles) {
    await loadAvatars(token, scenes.marbles.players.map((p) => p.id)).catch(() => {});
  }

  const now = Date.now();
  return {
    hype: publicHype(fresh, scenes, now),
    storm: publicStorm(fresh, scenes, now),
    plane: publicPlane(fresh, scenes, now),
    marbles: publicMarbles(fresh, scenes),
  };
}

/** Was das Dashboard zum Erklären braucht: fehlende Rechte je Szene. */
function status(row) {
  return {
    hypeScope: hasScope(row, HYPE_SCOPE),
    chattersScope: hasScope(row, CHATTERS_SCOPE),
    rewardScope: hasScope(row, REWARD_SCOPE),
  };
}

/** Eine Szene sofort beenden (Probelauf abbrechen). */
function stop(userId, key) {
  if (!["hype", "storm", "plane", "marbles"].includes(key)) return false;
  patchScenes(userId, (s) => {
    if (key === "marbles") settleRedemptions(s, s.marbles, "CANCELED");
    delete s[key];
  });
  return true;
}

/** Beim Trennen von Twitch: alles vergessen. */
function clear(userId) {
  setScenes.run("", String(userId));
  chatterBase.delete(String(userId));
}

module.exports = {
  IDS,
  CHAT_IDS,
  getSceneChannels,
  joinCommandOf,
  onContribution,
  onRaid,
  onChatCommand,
  collect,
  status,
  stop,
  clear,
  testHype,
  testStorm,
  testPlane,
  marblesOpen,
  marblesStart,
  marblesCancel,
  marblesAddBots,
  marblesResult,
  onRedeem,
  createReward,
  deleteReward,
  learnReward,
  marbleSetup,
  resetMarbleTop,
};
