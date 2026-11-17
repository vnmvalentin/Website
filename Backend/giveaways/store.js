// giveaways/store.js — Speicher der Giveaways: data/giveaways.db (better-sqlite3).
//
// Bis November 2026 lag alles in data/giveaways.json, das bei jeder Teilnahme komplett neu geschrieben wurde. Mit
// Chat-Teilnahme kommen viele Einträge in kurzer Zeit — deshalb jetzt je Teilnehmer eine Zeile. Die alte Datei wird
// beim ersten Start einmal übernommen und bleibt unverändert liegen (Sicherung).
//
// Dazu die Anwesenheit im Stream („war bei N Streams“): je Zuschauer und Stream eine Zeile, Streams älter als
// 60 Tage fallen weg.
'use strict';

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../lib/dataDir');
const core = require('./core');

const KEEP_STREAMS_MS = 60 * 24 * 3600 * 1000;

/**
 * @param {{ file?: string, importFile?: string }} [opts]
 *   file: Datenbank (GIVEAWAYS_DB, ':memory:' für Tests) · importFile: alte JSON-Datei (GIVEAWAYS_JSON)
 */
function createGiveawayStore(opts = {}) {
  const file = opts.file || process.env.GIVEAWAYS_DB || path.join(DATA_DIR, 'giveaways.db');
  const importFile = opts.importFile !== undefined ? opts.importFile : (process.env.GIVEAWAYS_JSON || path.join(DATA_DIR, 'giveaways.json'));
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS giveaways (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      end_date INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS teilnehmer (
      giveaway_id TEXT NOT NULL,
      key TEXT NOT NULL,
      twitch_id TEXT NOT NULL DEFAULT '',
      discord_id TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL DEFAULT '',
      avatar TEXT NOT NULL DEFAULT '',
      via TEXT NOT NULL DEFAULT 'website',
      joined_at INTEGER NOT NULL,
      PRIMARY KEY (giveaway_id, key)
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS streams (
      stream_key TEXT PRIMARY KEY,
      started_at INTEGER NOT NULL
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS anwesenheit (
      twitch_id TEXT NOT NULL,
      stream_key TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      PRIMARY KEY (twitch_id, stream_key)
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS einstellungen (k TEXT PRIMARY KEY, v TEXT NOT NULL) WITHOUT ROWID;
  `);

  const q = {
    get: db.prepare('SELECT data FROM giveaways WHERE id = ?'),
    all: db.prepare('SELECT data FROM giveaways ORDER BY end_date'),
    put: db.prepare(`INSERT INTO giveaways (id, data, end_date, created_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET data = excluded.data, end_date = excluded.end_date`),
    del: db.prepare('DELETE FROM giveaways WHERE id = ?'),
    delTeilnehmer: db.prepare('DELETE FROM teilnehmer WHERE giveaway_id = ?'),
    count: db.prepare('SELECT COUNT(*) AS n FROM teilnehmer WHERE giveaway_id = ?'),
    teilnehmer: db.prepare('SELECT * FROM teilnehmer WHERE giveaway_id = ? ORDER BY joined_at'),
    einer: db.prepare('SELECT * FROM teilnehmer WHERE giveaway_id = ? AND key = ?'),
    join: db.prepare(`INSERT OR IGNORE INTO teilnehmer (giveaway_id, key, twitch_id, discord_id, name, avatar, via, joined_at)
      VALUES (@giveawayId, @key, @twitchId, @discordId, @name, @avatar, @via, @joinedAt)`),
    leave: db.prepare('DELETE FROM teilnehmer WHERE giveaway_id = ? AND key = ?'),
    mitTwitch: db.prepare('SELECT giveaway_id FROM teilnehmer WHERE twitch_id = ?'),
    namen: db.prepare('SELECT name FROM teilnehmer WHERE giveaway_id = ? ORDER BY joined_at DESC LIMIT ?'),
    stream: db.prepare('INSERT OR IGNORE INTO streams (stream_key, started_at) VALUES (?, ?)'),
    da: db.prepare('INSERT OR IGNORE INTO anwesenheit (twitch_id, stream_key, started_at) VALUES (?, ?, ?)'),
    zaehle: db.prepare('SELECT COUNT(*) AS n FROM anwesenheit WHERE twitch_id = ? AND started_at >= ?'),
    streamsSeit: db.prepare('SELECT COUNT(*) AS n FROM streams WHERE started_at >= ?'),
    alteStreams: db.prepare('DELETE FROM streams WHERE started_at < ?'),
    alteDa: db.prepare('DELETE FROM anwesenheit WHERE started_at < ?'),
    getSetting: db.prepare('SELECT v FROM einstellungen WHERE k = ?'),
    setSetting: db.prepare('INSERT INTO einstellungen (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v'),
  };

  const parse = (row) => {
    try { return core.normalize(JSON.parse(row.data)); } catch { return null; }
  };

  function speichere(g) {
    q.put.run(g.id, JSON.stringify(g), g.endDate, g.createdAt || Date.now());
    return g;
  }

  const holeSetting = (k) => {
    const row = q.getSetting.get(k);
    if (!row) return null;
    try { return JSON.parse(row.v); } catch { return null; }
  };
  const setzeSetting = (k, v) => q.setSetting.run(k, JSON.stringify(v));

  /** Altbestand aus giveaways.json — genau einmal, danach steht der Merker in den Einstellungen. */
  function importiereAlt() {
    if (holeSetting('importiert')) return 0;
    let list = [];
    try {
      if (importFile && fs.existsSync(importFile)) {
        const parsed = JSON.parse(fs.readFileSync(importFile, 'utf8'));
        if (Array.isArray(parsed)) list = parsed;
      }
    } catch (e) {
      // Kaputte Datei: nicht als übernommen merken, damit es nach einer Reparatur noch einmal geht
      console.error('[giveaways] alte Datei nicht lesbar:', e.message);
      return 0;
    }
    const run = db.transaction(() => {
      for (const raw of list) {
        if (!raw || !raw.id) continue;
        const participants = raw.participants && typeof raw.participants === 'object' ? raw.participants : {};
        const winners = (Array.isArray(raw.winners) ? raw.winners : []).map((id) => ({
          key: `t:${id}`,
          name: participants[id]?.displayName || String(id),
          avatar: participants[id]?.profileImageUrl || null,
          twitchId: String(id),
          via: 'website',
        }));
        const g = core.normalize({ ...raw, winners, drawnAt: winners.length ? raw.endDate : 0 });
        // Altbestand vorbei, ohne Gewinner und ohne Teilnehmer: gilt als gezogen (es gab niemanden). Mit Teilnehmern
        // bleibt es offen für die automatische Ziehung — die alte Seite hat dann nur noch nicht ausgelost.
        if (!g.drawnAt && g.endDate <= Date.now() && !Object.keys(participants).length) g.drawnAt = g.endDate;
        speichere(g);
        for (const [id, p] of Object.entries(participants)) {
          q.join.run({
            giveawayId: g.id, key: `t:${id}`, twitchId: String(id), discordId: '',
            name: String(p?.displayName || id).slice(0, 60), avatar: String(p?.profileImageUrl || '').slice(0, 300),
            via: 'website', joinedAt: g.createdAt || Date.now(),
          });
        }
      }
      setzeSetting('importiert', Date.now());
    });
    run();
    return list.length;
  }

  importiereAlt();

  return {
    db,
    hole: (id) => { const row = q.get.get(String(id)); return row ? parse(row) : null; },
    alle: () => q.all.all().map(parse).filter(Boolean),
    speichere,
    loesche: db.transaction((id) => { q.delTeilnehmer.run(String(id)); return q.del.run(String(id)).changes > 0; }),
    anzahl: (id) => q.count.get(String(id)).n,
    teilnehmer: (id) => q.teilnehmer.all(String(id)),
    teilnehmerEiner: (id, key) => q.einer.get(String(id), String(key)) || null,
    /** @returns {boolean} neu dabei (false = war schon drin) */
    trageEin: (p) => q.join.run({
      giveawayId: String(p.giveawayId), key: String(p.key), twitchId: String(p.twitchId || ''), discordId: String(p.discordId || ''),
      name: String(p.name || '').slice(0, 60), avatar: String(p.avatar || '').slice(0, 300), via: p.via || 'website',
      joinedAt: p.joinedAt || Date.now(),
    }).changes > 0,
    trageAus: (id, key) => q.leave.run(String(id), String(key)).changes > 0,
    /** IDs der Giveaways, bei denen diese Twitch-ID mitmacht (Punkt in der Navigation). */
    giveawaysVon: (twitchId) => q.mitTwitch.all(String(twitchId)).map((r) => r.giveaway_id),
    /** Teilnehmer-Twitch-IDs offener Giveaways für den Navigationspunkt (lib/liveBadges.js). */
    offeneTeilnahmen(now = Date.now()) {
      return this.alle()
        .filter((g) => core.zustand(g, now) === 'offen')
        .map((g) => new Set(q.teilnehmer.all(g.id).map((t) => t.twitch_id).filter(Boolean)));
    },
    letzteNamen: (id, n = 40) => q.namen.all(String(id), n).map((r) => r.name),
    // Anwesenheit
    merkeStream: (key, startedAt) => q.stream.run(String(key), Number(startedAt) || Date.now()),
    merkeAnwesend: (twitchId, key, startedAt) => q.da.run(String(twitchId), String(key), Number(startedAt) || Date.now()).changes > 0,
    streamsVon: (twitchId, seit) => q.zaehle.get(String(twitchId), seit).n,
    streamsGesamt: (seit) => q.streamsSeit.get(seit).n,
    raeumeAuf(now = Date.now()) {
      const grenze = now - KEEP_STREAMS_MS;
      q.alteDa.run(grenze);
      q.alteStreams.run(grenze);
    },
    // Einstellungen (Discord-Kanal)
    holeSetting,
    setzeSetting,
    schliesse: () => db.close(),
  };
}

module.exports = { createGiveawayStore };
