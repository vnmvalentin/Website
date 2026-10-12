// crFriendsStore.js — Freundesliste der Clash-Royale-Minigames in SQLite (better-sqlite3).
//
// Drei Tabellen:
//   users        Visitenkarte je Twitch-ID (Login, Anzeigename, Avatar) — wird bei jedem
//                Öffnen der Minigames aufgefrischt (core/friends.js, clash:friends:hello), damit
//                auch OFFLINE-Freunde mit Bild und Namen in der Liste stehen.
//   requests     offene Anfragen (from → to). Schickt B an A, während A→B schon offen ist,
//                wird daraus direkt eine Freundschaft (beide wollen es ja).
//   friendships  ein Eintrag pro Paar, a_id < b_id (Textvergleich) — so gibt es jedes Paar
//                genau einmal und "sind A und B befreundet?" ist ein einziger Primärschlüssel-Treffer.
//
// Live-Status (online / in Lobby) steht bewusst NICHT hier, der lebt nur im Speicher
// (core/friends.js) — er ändert sich ständig und ist nach einem Neustart ohnehin falsch.
//
// Pfad über CR_FRIENDS_DB überschreibbar — Tests laufen damit gegen eine Scratch-Datei.
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const DATA_DIR = path.join(__dirname, "../data");
const DB_PATH = process.env.CR_FRIENDS_DB || path.join(DATA_DIR, "cr_friends.db");

const MAX_FRIENDS = 100;
const MAX_OUTGOING = 30;

let _db = null;

function db() {
  if (_db) return _db;
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      twitch_id    TEXT PRIMARY KEY,
      login        TEXT NOT NULL DEFAULT '',
      display_name TEXT NOT NULL DEFAULT '',
      avatar_id    TEXT NOT NULL DEFAULT '',
      avatar_url   TEXT NOT NULL DEFAULT '',
      updated_at   INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS users_login ON users(login);
    CREATE TABLE IF NOT EXISTS requests (
      from_id    TEXT NOT NULL,
      to_id      TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (from_id, to_id)
    );
    CREATE INDEX IF NOT EXISTS requests_to ON requests(to_id);
    CREATE TABLE IF NOT EXISTS friendships (
      a_id       TEXT NOT NULL,
      b_id       TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (a_id, b_id)
    );
    CREATE INDEX IF NOT EXISTS friendships_b ON friendships(b_id);
  `);
  return _db;
}

const pair = (x, y) => (String(x) < String(y) ? [String(x), String(y)] : [String(y), String(x)]);

function rowToUser(row) {
  if (!row) return null;
  return {
    id: row.twitch_id,
    login: row.login,
    name: row.display_name || row.login,
    avatarId: row.avatar_id || null,
    avatarUrl: row.avatar_url || null,
  };
}

/** Visitenkarte anlegen/auffrischen. Leere Felder überschreiben keine vorhandenen Werte
 *  außer avatarUrl — die ist bewusst leer, sobald jemand vom Twitch-Bild zurück auf einen
 *  festen Avatar schaltet. */
function upsertUser(twitchId, { login = "", name = "", avatarId = "", avatarUrl = "" } = {}) {
  const id = String(twitchId);
  const cleanLogin = String(login || "").toLowerCase().slice(0, 60);
  db().prepare(`
    INSERT INTO users (twitch_id, login, display_name, avatar_id, avatar_url, updated_at)
    VALUES (@id, @login, @name, @avatarId, @avatarUrl, @now)
    ON CONFLICT(twitch_id) DO UPDATE SET
      login        = CASE WHEN @login    != '' THEN @login    ELSE login        END,
      display_name = CASE WHEN @name     != '' THEN @name     ELSE display_name END,
      avatar_id    = CASE WHEN @avatarId != '' THEN @avatarId ELSE avatar_id    END,
      avatar_url   = @avatarUrl,
      updated_at   = @now
  `).run({
    id,
    login: cleanLogin,
    name: String(name || "").trim().slice(0, 24),
    avatarId: String(avatarId || "").slice(0, 120),
    avatarUrl: typeof avatarUrl === "string" && /^https:\/\//.test(avatarUrl) ? avatarUrl.slice(0, 300) : "",
    now: Date.now(),
  });
}

function getUser(twitchId) {
  return rowToUser(db().prepare("SELECT * FROM users WHERE twitch_id = ?").get(String(twitchId)));
}

function findUserByLogin(login) {
  const clean = String(login || "").trim().replace(/^@/, "").toLowerCase();
  if (!clean) return null;
  return rowToUser(db().prepare("SELECT * FROM users WHERE login = ?").get(clean));
}

function areFriends(x, y) {
  const [a, b] = pair(x, y);
  return !!db().prepare("SELECT 1 FROM friendships WHERE a_id = ? AND b_id = ?").get(a, b);
}

function friendIds(twitchId) {
  const id = String(twitchId);
  return db()
    .prepare("SELECT b_id AS other FROM friendships WHERE a_id = ? UNION SELECT a_id AS other FROM friendships WHERE b_id = ?")
    .all(id, id)
    .map((r) => r.other);
}

function incomingIds(twitchId) {
  return db().prepare("SELECT from_id FROM requests WHERE to_id = ? ORDER BY created_at DESC").all(String(twitchId)).map((r) => r.from_id);
}

function outgoingIds(twitchId) {
  return db().prepare("SELECT to_id FROM requests WHERE from_id = ? ORDER BY created_at DESC").all(String(twitchId)).map((r) => r.to_id);
}

function hasRequest(fromId, toId) {
  return !!db().prepare("SELECT 1 FROM requests WHERE from_id = ? AND to_id = ?").get(String(fromId), String(toId));
}

function makeFriends(x, y) {
  const [a, b] = pair(x, y);
  const tx = db().transaction(() => {
    db().prepare("DELETE FROM requests WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)").run(a, b, b, a);
    db().prepare("INSERT OR IGNORE INTO friendships (a_id, b_id, created_at) VALUES (?, ?, ?)").run(a, b, Date.now());
  });
  tx();
}

/**
 * Anfrage schicken. Ergebnis: { ok, key, accepted? } — key ist ein Fehlerschlüssel, den der
 * Client übersetzt (hub/friendsI18n.js). accepted = es lag schon eine Gegenanfrage vor.
 */
function sendRequest(fromId, toId) {
  const from = String(fromId), to = String(toId);
  if (from === to) return { ok: false, key: "friendSelf" };
  if (areFriends(from, to)) return { ok: false, key: "friendAlready" };
  if (hasRequest(to, from)) {
    if (friendIds(from).length >= MAX_FRIENDS || friendIds(to).length >= MAX_FRIENDS) return { ok: false, key: "friendLimit" };
    makeFriends(from, to);
    return { ok: true, accepted: true };
  }
  if (hasRequest(from, to)) return { ok: false, key: "friendPending" };
  if (friendIds(from).length >= MAX_FRIENDS) return { ok: false, key: "friendLimit" };
  if (outgoingIds(from).length >= MAX_OUTGOING) return { ok: false, key: "friendOutgoingLimit" };
  db().prepare("INSERT INTO requests (from_id, to_id, created_at) VALUES (?, ?, ?)").run(from, to, Date.now());
  return { ok: true, accepted: false };
}

function acceptRequest(meId, fromId) {
  if (!hasRequest(fromId, meId)) return { ok: false, key: "friendRequestGone" };
  if (friendIds(meId).length >= MAX_FRIENDS || friendIds(fromId).length >= MAX_FRIENDS) return { ok: false, key: "friendLimit" };
  makeFriends(meId, fromId);
  return { ok: true };
}

/** Anfrage ablehnen (eingehend) bzw. zurückziehen (ausgehend) — beides löscht nur die Zeile. */
function deleteRequest(fromId, toId) {
  db().prepare("DELETE FROM requests WHERE from_id = ? AND to_id = ?").run(String(fromId), String(toId));
  return { ok: true };
}

function removeFriend(meId, otherId) {
  const [a, b] = pair(meId, otherId);
  db().prepare("DELETE FROM friendships WHERE a_id = ? AND b_id = ?").run(a, b);
  return { ok: true };
}

module.exports = {
  upsertUser,
  getUser,
  findUserByLogin,
  areFriends,
  friendIds,
  incomingIds,
  outgoingIds,
  sendRequest,
  acceptRequest,
  deleteRequest,
  removeFriend,
  MAX_FRIENDS,
  getDbPath: () => DB_PATH,
};
