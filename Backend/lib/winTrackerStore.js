// winTrackerStore.js — Clash Royale Win Tracker Overlay: verknüpfte Accounts,
// gesammelter Battlelog-Verlauf (für Daily-Stats) und Overlay-Einstellungen.
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'cr_wintracker.db'));
db.pragma('journal_mode = WAL');

db.exec(`CREATE TABLE IF NOT EXISTS cr_wintracker_accounts (
    account_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    twitch_login TEXT DEFAULT '',
    player_tag TEXT NOT NULL,
    player_name TEXT DEFAULT '',
    trophies INTEGER NOT NULL DEFAULT 0,
    best_trophies INTEGER NOT NULL DEFAULT 0,
    season_medals INTEGER NOT NULL DEFAULT 0,
    league_number INTEGER NOT NULL DEFAULT 0,
    pol_rank INTEGER,
    is_active INTEGER NOT NULL DEFAULT 0,
    last_fetched INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    UNIQUE(user_id, player_tag)
)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_wt_accounts_user ON cr_wintracker_accounts(user_id)`);

// Migration für bereits bestehende Installationen (Spalte kam nach dem ersten Release dazu).
try { db.exec("ALTER TABLE cr_wintracker_accounts ADD COLUMN season_medals INTEGER NOT NULL DEFAULT 0"); } catch { /* Spalte existiert bereits */ }
// Getrackter Wert pro Account ('medals' | 'trophies'). Leer = erbt die globale Voreinstellung
// aus cr_wintracker_settings.track_mode (so verhalten sich Accounts von vor dieser Spalte weiter wie bisher).
try { db.exec("ALTER TABLE cr_wintracker_accounts ADD COLUMN track_mode TEXT NOT NULL DEFAULT ''"); } catch { /* Spalte existiert bereits */ }

// Gesammelter Verlauf einzelner Spiele — wird bei jedem Sync um neue Battlelog-Einträge
// ergänzt (INSERT OR IGNORE via UNIQUE(account_id, battle_time)). Die offizielle API liefert
// nur die letzten ~25 Spiele, deshalb müssen wir selbst mitschreiben, um Tagesstatistiken über
// den ganzen Tag hinweg korrekt aufzusummieren.
db.exec(`CREATE TABLE IF NOT EXISTS cr_wintracker_battles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT NOT NULL,
    battle_time TEXT NOT NULL,
    battle_time_ms INTEGER NOT NULL,
    result TEXT NOT NULL,
    trophy_change INTEGER NOT NULL DEFAULT 0,
    crowns_for INTEGER NOT NULL DEFAULT 0,
    crowns_against INTEGER NOT NULL DEFAULT 0,
    opponent_name TEXT DEFAULT '',
    game_mode TEXT DEFAULT '',
    UNIQUE(account_id, battle_time)
)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_wt_battles_account_time ON cr_wintracker_battles(account_id, battle_time_ms DESC)`);

db.exec(`CREATE TABLE IF NOT EXISTS cr_wintracker_settings (
    user_id TEXT PRIMARY KEY,
    overlay_key TEXT UNIQUE NOT NULL,
    show_daily_profit INTEGER NOT NULL DEFAULT 1,
    show_win_loss_numbers INTEGER NOT NULL DEFAULT 1,
    show_win_loss_percent INTEGER NOT NULL DEFAULT 1,
    show_last5 INTEGER NOT NULL DEFAULT 1,
    track_mode TEXT NOT NULL DEFAULT 'medals',
    bg_color TEXT NOT NULL DEFAULT '#0c0c12',
    bg_opacity INTEGER NOT NULL DEFAULT 88,
    updated_at INTEGER NOT NULL DEFAULT 0
)`);
try { db.exec("ALTER TABLE cr_wintracker_settings ADD COLUMN track_mode TEXT NOT NULL DEFAULT 'medals'"); } catch { /* Spalte existiert bereits */ }
try { db.exec("ALTER TABLE cr_wintracker_settings ADD COLUMN show_last5 INTEGER NOT NULL DEFAULT 1"); } catch { /* Spalte existiert bereits */ }
try { db.exec("ALTER TABLE cr_wintracker_settings ADD COLUMN bg_color TEXT NOT NULL DEFAULT '#0c0c12'"); } catch { /* Spalte existiert bereits */ }
try { db.exec("ALTER TABLE cr_wintracker_settings ADD COLUMN bg_opacity INTEGER NOT NULL DEFAULT 88"); } catch { /* Spalte existiert bereits */ }

module.exports = db;
