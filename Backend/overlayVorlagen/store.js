// store.js — Speicher der Community-Vorlagen (better-sqlite3). OVERLAY_VORLAGEN_DB biegt die Datei für Prüfläufe um
// (':memory:') — nie gegen die Live-Daten testen.
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const { nanoid } = require("nanoid");
const { DATA_DIR } = require("../lib/dataDir");

const file = process.env.OVERLAY_VORLAGEN_DB || path.join(DATA_DIR, "overlay_vorlagen.db");
if (file !== ":memory:" && !fs.existsSync(path.dirname(file))) fs.mkdirSync(path.dirname(file), { recursive: true });
const db = new Database(file);
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS vorlagen (
  id TEXT PRIMARY KEY,
  tool TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  owner_name TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  style TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'public',   -- public | hidden (gemeldet, wartet auf Prüfung) | removed
  uses INTEGER NOT NULL DEFAULT 0,
  reports INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS vorlagen_tool ON vorlagen (tool, status);
CREATE TABLE IF NOT EXISTS vorlagen_uses (vorlage_id TEXT NOT NULL, user_id TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (vorlage_id, user_id));
CREATE TABLE IF NOT EXISTS vorlagen_reports (vorlage_id TEXT NOT NULL, user_id TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (vorlage_id, user_id));
`);

const q = {
  byId: db.prepare("SELECT * FROM vorlagen WHERE id = ?"),
  listPopular: db.prepare("SELECT * FROM vorlagen WHERE tool = ? AND status = 'public' ORDER BY uses DESC, created_at DESC LIMIT ?"),
  listNew: db.prepare("SELECT * FROM vorlagen WHERE tool = ? AND status = 'public' ORDER BY created_at DESC LIMIT ?"),
  listOwnHidden: db.prepare("SELECT * FROM vorlagen WHERE tool = ? AND owner_id = ? AND status = 'hidden'"),
  listReported: db.prepare("SELECT * FROM vorlagen WHERE status = 'hidden' OR (status = 'public' AND reports > 0) ORDER BY reports DESC, created_at DESC LIMIT 100"),
  countOwnPublic: db.prepare("SELECT COUNT(*) AS n FROM vorlagen WHERE tool = ? AND owner_id = ? AND status <> 'removed'"),
  lastOwn: db.prepare("SELECT MAX(created_at) AS t FROM vorlagen WHERE owner_id = ?"),
  insert: db.prepare("INSERT INTO vorlagen (id, tool, owner_id, owner_name, title, style, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"),
  setStatus: db.prepare("UPDATE vorlagen SET status = ? WHERE id = ?"),
  addUse: db.prepare("INSERT OR IGNORE INTO vorlagen_uses (vorlage_id, user_id, at) VALUES (?, ?, ?)"),
  syncUses: db.prepare("UPDATE vorlagen SET uses = (SELECT COUNT(*) FROM vorlagen_uses WHERE vorlage_id = ?) WHERE id = ?"),
  addReport: db.prepare("INSERT OR IGNORE INTO vorlagen_reports (vorlage_id, user_id, at) VALUES (?, ?, ?)"),
  syncReports: db.prepare("UPDATE vorlagen SET reports = (SELECT COUNT(*) FROM vorlagen_reports WHERE vorlage_id = ?) WHERE id = ?"),
  clearReports: db.prepare("DELETE FROM vorlagen_reports WHERE vorlage_id = ?"),
};

module.exports = {
  db,
  get: (id) => q.byId.get(String(id)) || null,
  list: (tool, sort = "beliebt", limit = 60) => (sort === "neu" ? q.listNew : q.listPopular).all(tool, limit),
  ownHidden: (tool, userId) => q.listOwnHidden.all(tool, String(userId)),
  reported: () => q.listReported.all(),
  countOwn: (tool, userId) => q.countOwnPublic.get(tool, String(userId)).n,
  lastPublishAt: (userId) => q.lastOwn.get(String(userId)).t || 0,
  insert({ tool, ownerId, ownerName, title, style, now = Date.now() }) {
    const id = nanoid(10);
    q.insert.run(id, tool, String(ownerId), String(ownerName || "").slice(0, 40), title, JSON.stringify(style), now);
    return id;
  },
  setStatus: (id, status) => q.setStatus.run(status, String(id)),
  /** @returns {boolean} ob es eine neue Übernahme war */
  addUse(id, userId, now = Date.now()) {
    const fresh = q.addUse.run(String(id), String(userId), now).changes > 0;
    q.syncUses.run(String(id), String(id));
    return fresh;
  },
  /** @returns {number} Meldungen insgesamt */
  addReport(id, userId, now = Date.now()) {
    q.addReport.run(String(id), String(userId), now);
    q.syncReports.run(String(id), String(id));
    return q.byId.get(String(id)).reports;
  },
  clearReports(id) {
    q.clearReports.run(String(id));
    q.syncReports.run(String(id), String(id));
  },
};
