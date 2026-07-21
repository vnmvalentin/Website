// bannedCardsStore.js — Gebannte Clash-Royale-Karten, pro Twitch-User
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

db.exec(`CREATE TABLE IF NOT EXISTS nuzlocke_accounts (
    account_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    twitch_login TEXT DEFAULT '',
    player_tag TEXT UNIQUE NOT NULL,
    player_name TEXT DEFAULT '',
    best_trophies INTEGER NOT NULL DEFAULT 0,
    deck TEXT NOT NULL DEFAULT '[]',
    attempts INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 0,
    last_fetched INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
)`);

// --- NEU: Automatische Migration für die Spalte "is_finished" ---
try {
    db.exec("ALTER TABLE nuzlocke_accounts ADD COLUMN is_finished INTEGER NOT NULL DEFAULT 0");
} catch (err) {
    // Spalte existiert bereits (z.B. beim zweiten Start), Fehler wird sicher ignoriert
}

db.exec(`CREATE INDEX IF NOT EXISTS idx_nz_accounts_user ON nuzlocke_accounts(user_id)`);

db.exec(`CREATE TABLE IF NOT EXISTS nuzlocke_banned (
    entry_id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    card_id TEXT NOT NULL,
    name TEXT NOT NULL,
    rarity TEXT DEFAULT '',
    banned_at INTEGER NOT NULL
)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_nz_banned_account ON nuzlocke_banned(account_id)`);

module.exports = db;