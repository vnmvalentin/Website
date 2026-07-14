// bannedCardsStore.js — Gebannte Clash-Royale-Karten, pro Twitch-User (better-sqlite3)
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'banned_cards.db'));
db.pragma('journal_mode = WAL');

db.exec(`CREATE TABLE IF NOT EXISTS banned_cards_lists (
    user_id TEXT PRIMARY KEY,
    mod_key TEXT UNIQUE NOT NULL,
    overlay_key TEXT UNIQUE NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
)`);

db.exec(`CREATE TABLE IF NOT EXISTS banned_cards_entries (
    entry_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    card_id TEXT NOT NULL,
    name TEXT NOT NULL,
    rarity TEXT DEFAULT '',
    banned_at INTEGER NOT NULL
)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_bc_entries_user ON banned_cards_entries(user_id)`);

module.exports = db;
