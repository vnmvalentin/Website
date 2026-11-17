// linkStore.js — die Discord-Verknüpfung eines Nutzers: welches Discord-Konto gehört zu welcher
// Twitch-ID, samt Zugriffs- und Erneuerungs-Token.
//
// Seit dem Ausbauplan „discord-verzeichnis“ geht das Dashboard auch ohne Twitch (Discord- oder Gastkonto). Solche
// Verknüpfungen stehen unter dem Schlüssel „konto:<kontoId>“ in derselben Spalte; linkKeyOf(req) wählt den
// Schlüssel einer Anfrage. Wer später Twitch dazunimmt, behält die Verknüpfung (linkKeyOf findet beide).
//
// Früher hing das an der Login-Sitzung (sessions[…].discord). Jede neue Twitch-Anmeldung legt
// aber eine neue Sitzung an — und Twitch-Anmeldungen passieren oft (anderer Browser, „Account
// wechseln“, jedes Mal, wenn ein Werkzeug zusätzliche Twitch-Rechte anfragt). Die Verknüpfung
// war danach weg, und das Dashboard verlangte eine neue Discord-Anmeldung. Jetzt hängt sie an
// der Twitch-ID und überlebt Abmelden, Neuanmelden und Gerätewechsel.
//
// Tokens liegen verschlüsselt in der Datenbank (derselbe Schlüssel wie die Twitch-Tokens des
// Stream-Tools). Die Datei steht in .gitignore und wird nicht ausgeliefert (Ordner data/).
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");
const { encryptToken, decryptToken } = require("../streamTool/lib/streamToolStore");

// DISCORD_LINKS_DB biegt den Pfad für Prüfstände um — nie gegen die echte Datei testen.
const dbPath = process.env.DISCORD_LINKS_DB || path.join(__dirname, "..", "data", "discord_links.db");
if (dbPath !== ":memory:") {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS links (
    twitch_id TEXT PRIMARY KEY,
    discord_user_id TEXT NOT NULL,
    username TEXT NOT NULL DEFAULT '',
    avatar TEXT NOT NULL DEFAULT '',
    access_enc TEXT NOT NULL DEFAULT '',
    refresh_enc TEXT NOT NULL DEFAULT '',
    expires_at INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
  ) WITHOUT ROWID;
`);

const stmt = {
  get: db.prepare("SELECT * FROM links WHERE twitch_id = ?"),
  set: db.prepare(
    `INSERT INTO links (twitch_id, discord_user_id, username, avatar, access_enc, refresh_enc, expires_at, updated_at)
     VALUES (@twitchId, @userId, @username, @avatar, @accessEnc, @refreshEnc, @expiresAt, @updatedAt)
     ON CONFLICT(twitch_id) DO UPDATE SET
       discord_user_id = excluded.discord_user_id, username = excluded.username, avatar = excluded.avatar,
       access_enc = excluded.access_enc, refresh_enc = excluded.refresh_enc, expires_at = excluded.expires_at,
       updated_at = excluded.updated_at`
  ),
  setTokens: db.prepare("UPDATE links SET access_enc = ?, refresh_enc = ?, expires_at = ?, updated_at = ? WHERE twitch_id = ?"),
  del: db.prepare("DELETE FROM links WHERE twitch_id = ?"),
  // Nur echte Twitch-IDs — Verknüpfungen am Konto („konto:…“) haben keine
  byDiscord: db.prepare("SELECT twitch_id FROM links WHERE discord_user_id = ? AND twitch_id NOT LIKE 'konto:%' ORDER BY updated_at DESC LIMIT 1"),
};

/** @returns {{ userId, username, avatar, accessToken, refreshToken, expiresAt }|null} */
function getLink(twitchId) {
  const row = stmt.get.get(String(twitchId || ""));
  if (!row) return null;
  return {
    userId: row.discord_user_id,
    username: row.username || null,
    avatar: row.avatar || null,
    accessToken: decryptToken(row.access_enc),
    refreshToken: decryptToken(row.refresh_enc),
    expiresAt: row.expires_at || 0,
  };
}

/** expiresAt: Ablauf des Zugriffstokens in ms (0 = unbekannt) */
function setLink(twitchId, { userId, username, avatar, accessToken, refreshToken, expiresAt = 0 }, now = Date.now()) {
  stmt.set.run({
    twitchId: String(twitchId),
    userId: String(userId),
    username: String(username || ""),
    avatar: String(avatar || ""),
    accessEnc: encryptToken(accessToken),
    refreshEnc: encryptToken(refreshToken),
    expiresAt: Number(expiresAt) || 0,
    updatedAt: now,
  });
}

function setTokens(twitchId, { accessToken, refreshToken, expiresAt = 0 }, now = Date.now()) {
  stmt.setTokens.run(encryptToken(accessToken), encryptToken(refreshToken), Number(expiresAt) || 0, now, String(twitchId));
}

const removeLink = (twitchId) => stmt.del.run(String(twitchId));

/**
 * Übernimmt eine Verknüpfung alter Art (an der Sitzung) in die Datenbank und entfernt sie aus
 * allen Sitzungen dieser Twitch-ID — danach stehen dort keine Discord-Tokens mehr im Klartext.
 * @returns {boolean} true, wenn Sitzungen geändert wurden (dann sessions.json neu schreiben)
 */
function migrateFromSessions(twitchId, sessions) {
  const id = String(twitchId || "");
  let changed = false;
  let found = null;
  for (const sess of Object.values(sessions || {})) {
    if (!sess || String(sess.twitchId) !== id || !sess.discord) continue;
    if (sess.discord.userId && sess.discord.accessToken) found = sess.discord;
    delete sess.discord;
    changed = true;
  }
  if (found && !stmt.get.get(id)) setLink(id, found);
  return changed;
}

/** Rückweg: zu welcher Twitch-ID gehört dieses Discord-Konto? (Giveaways: Teilnahme per Discord-Knopf) */
function twitchIdOfDiscord(discordUserId) {
  const row = stmt.byDiscord.get(String(discordUserId || ""));
  return row ? row.twitch_id : null;
}

const KONTO_PREFIX = "konto:";

/** Mögliche Schlüssel einer Anfrage, der bevorzugte zuerst: Twitch-ID (wie bisher), sonst das Konto. */
function linkKeysOf(req) {
  const keys = [];
  if (req && req.twitchId) keys.push(String(req.twitchId));
  if (req && req.kontoId) keys.push(KONTO_PREFIX + String(req.kontoId));
  return keys;
}

/**
 * Der Schlüssel, unter dem die Verknüpfung dieser Anfrage steht — oder stehen wird.
 * Gibt es schon eine Verknüpfung (unter der Twitch-ID oder am Konto), gilt deren Schlüssel.
 * @returns {string|null}
 */
function linkKeyOf(req) {
  const keys = linkKeysOf(req);
  return keys.find((k) => stmt.get.get(k)) || keys[0] || null;
}

const moveKey = db.prepare("UPDATE links SET twitch_id = ? WHERE twitch_id = ?");

/** Konten zusammengeführt (konto/kontoStore beobachte): Verknüpfung am alten Konto zieht mit, wenn das Ziel keine hat. */
function kontoUmziehen(ziel, quelle) {
  const from = KONTO_PREFIX + String(quelle);
  const to = KONTO_PREFIX + String(ziel);
  if (!stmt.get.get(from)) return;
  if (stmt.get.get(to)) stmt.del.run(from);
  else moveKey.run(to, from);
}

/** Konto gelöscht: seine Verknüpfung samt Tokens weg. */
const kontoLoeschen = (kontoId) => stmt.del.run(KONTO_PREFIX + String(kontoId));

module.exports = {
  getLink, setLink, setTokens, removeLink, migrateFromSessions, twitchIdOfDiscord,
  linkKeyOf, linkKeysOf, kontoUmziehen, kontoLoeschen, KONTO_PREFIX,
};
