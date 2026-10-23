// profile/profileStore.js — wer ein öffentliches Profil (/u/<login>) hat. Opt-in: Ohne Eintrag mit enabled = 1 gibt es
// keine öffentliche Seite. Der Login wird bei jedem Speichern aus der Session übernommen (Twitch-Umbenennungen).
// Pfad über PUBLIC_PROFILE_DB überschreibbar (Tests laufen gegen eine Scratch-Datei).
'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

function createProfileStore(dbFile = process.env.PUBLIC_PROFILE_DB || path.join(__dirname, '../data/public_profiles.db')) {
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  const db = new Database(dbFile);
  db.pragma('journal_mode = WAL');
  db.exec(`CREATE TABLE IF NOT EXISTS public_profiles (
    twitch_id TEXT PRIMARY KEY,
    login TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_public_profiles_login ON public_profiles(login)');
  // Anzeigename und Bild aus der Twitch-Anmeldung im Browser (der Server kennt nur ID und Login)
  const cols = new Set(db.prepare('PRAGMA table_info(public_profiles)').all().map((c) => c.name));
  if (!cols.has('display_name')) db.exec("ALTER TABLE public_profiles ADD COLUMN display_name TEXT NOT NULL DEFAULT ''");
  if (!cols.has('avatar')) db.exec("ALTER TABLE public_profiles ADD COLUMN avatar TEXT NOT NULL DEFAULT ''");

  const stmt = {
    get: db.prepare('SELECT * FROM public_profiles WHERE twitch_id = ?'),
    // Neuester Eintrag gewinnt, falls ein Login (nach Umbenennung) zwei Konten zugeordnet war
    byLogin: db.prepare('SELECT * FROM public_profiles WHERE login = ? AND enabled = 1 ORDER BY updated_at DESC LIMIT 1'),
    upsert: db.prepare(`INSERT INTO public_profiles (twitch_id, login, enabled, updated_at, display_name, avatar)
      VALUES (@id, @login, @enabled, @now, @displayName, @avatar)
      ON CONFLICT(twitch_id) DO UPDATE SET login = excluded.login, enabled = excluded.enabled, updated_at = excluded.updated_at,
        display_name = excluded.display_name, avatar = excluded.avatar`),
  };
  const toEntry = (r) => r && {
    twitchId: r.twitch_id, login: r.login, enabled: !!r.enabled, updatedAt: r.updated_at,
    displayName: r.display_name || r.login, avatar: r.avatar || '',
  };

  return {
    get: (twitchId) => toEntry(stmt.get.get(String(twitchId))),
    byLogin: (login) => toEntry(stmt.byLogin.get(String(login || '').toLowerCase())),
    set(twitchId, login, enabled, { displayName = '', avatar = '' } = {}) {
      stmt.upsert.run({
        id: String(twitchId), login: String(login || '').toLowerCase(), enabled: enabled ? 1 : 0, now: Date.now(),
        displayName: String(displayName).slice(0, 40), avatar: String(avatar).slice(0, 300),
      });
      return toEntry(stmt.get.get(String(twitchId)));
    },
    close: () => db.close(),
  };
}

module.exports = { createProfileStore };
