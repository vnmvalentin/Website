// Seed Runners — Speicher der veröffentlichten Level (better-sqlite3, dieselbe Datenbankdatei wie store.js).
//
// Ein veröffentlichtes Level besteht aus: Angaben (Name, Ersteller, Tags …), dem kanonischen Level-Dokument
// (deflate-komprimiert; die Angaben in `meta` werden beim Ausliefern aus den Spalten überschrieben), einem Vorschau-Raster,
// und der Verifizierung des Erstellers (Zeit, Log = Ersteller-Geist, Stand der Physik). Dazu kommen die Bestenliste
// (beste geprüfte Zeit je Spieler), die Spielerliste (für Spielerzahl und Abschlussquote), Sterne, Favoriten, Meldungen und Sperren.
//
// STERNE UND FAVORITEN (27.09.2026, ersetzen die Likes) gelten für jedes Level, nicht nur für veröffentlichte: Ein
// Bewertungs-Schlüssel ist 'c:<Share-Code>' (veröffentlicht) oder 'p<gv>:<Biom>:<Seed>' (Zufallslevel des Pfad-Generators —
// derselbe Seed mit demselben Biom und derselben Generator-Version ergibt überall dasselbe Level). Wer bewertet, ist 'a:<Konto>' (Twitch) oder
// 'k:<Spielerschlüssel>' (Gast, aus dem Browser-Token). Die bisherigen Likes zählen einmalig als 5 Sterne.
//
// Status eines Levels:
//   published  sichtbar für alle
//   hidden     von der Moderation ausgeblendet
//   reverify   die Physik hat sich geändert und der Ersteller-Lauf besteht sie nicht mehr: unsichtbar, bis der
//              Ersteller das Level neu durchspielt (levelService.reverify)
//   deleted    gelöscht (die Zeile bleibt als Beleg für die Moderation; der Hash ist wieder frei)
//
// Gezählt wird redundant in `sr_levels` (plays, players, clears, rating_count/rating_sum), damit der Browser ohne Aggregation
// sortiert. (Die Spalte `likes` und die Tabelle `sr_level_likes` bleiben als Altbestand stehen, werden aber nicht mehr benutzt.)
'use strict';

const zlib = require('zlib');

const PLAY_GAP_MS = 20000;       // ein erneuter Versuch derselben Person zählt erst nach so langer Pause als neues Spiel
const KEEP_RUN_LOGS = 50;        // nur für die besten Läufe eines Levels bleibt das Log (als Geist abrufbar)

const escapeLike = (s) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

function createLevelStore(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS sr_levels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    account_id TEXT NOT NULL,
    creator_name TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    tags_json TEXT NOT NULL DEFAULT '[]',
    difficulty INTEGER,
    biome TEXT NOT NULL,
    speed_class TEXT NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    elements INTEGER NOT NULL,
    content_hash TEXT NOT NULL,
    doc_z BLOB NOT NULL,
    preview_json TEXT NOT NULL,
    search_text TEXT NOT NULL,
    sim_fp TEXT NOT NULL,
    creator_ticks INTEGER NOT NULL,
    creator_deaths INTEGER NOT NULL,
    creator_splits_json TEXT NOT NULL,
    creator_log_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'published',
    status_reason TEXT,
    plays INTEGER NOT NULL DEFAULT 0,
    players INTEGER NOT NULL DEFAULT 0,
    clears INTEGER NOT NULL DEFAULT 0,
    likes INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`);
  // Ein Inhalt (Hash) ist nur einmal vergeben — gelöschte Level geben ihn wieder frei
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_sr_levels_hash ON sr_levels(content_hash) WHERE status != 'deleted'");
  db.exec('CREATE INDEX IF NOT EXISTS idx_sr_levels_status ON sr_levels(status, created_at)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_sr_levels_account ON sr_levels(account_id, created_at)');

  db.exec(`CREATE TABLE IF NOT EXISTS sr_level_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    level_id INTEGER NOT NULL,
    player_key TEXT NOT NULL,
    player_name TEXT NOT NULL,
    account_id TEXT,
    ticks INTEGER NOT NULL,
    deaths INTEGER NOT NULL,
    log_json TEXT,
    sim_fp TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE (level_id, player_key)
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_sr_level_runs_board ON sr_level_runs(level_id, ticks, created_at)');

  db.exec(`CREATE TABLE IF NOT EXISTS sr_level_players (
    level_id INTEGER NOT NULL,
    identity TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 1,
    first_at INTEGER NOT NULL,
    last_at INTEGER NOT NULL,
    cleared INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (level_id, identity)
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS sr_level_likes (
    level_id INTEGER NOT NULL,
    account_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (level_id, account_id)
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS sr_level_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    level_id INTEGER NOT NULL,
    account_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'open',
    created_at INTEGER NOT NULL,
    UNIQUE (level_id, account_id)
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS sr_bans (
    account_id TEXT PRIMARY KEY,
    reason TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS sr_ratings (
    level_key TEXT NOT NULL,
    voter TEXT NOT NULL,
    stars INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (level_key, voter)
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_sr_ratings_voter ON sr_ratings(voter)');
  // Summe und Anzahl je Schlüssel, damit Listen (Favoriten, beste Zufallslevel) nicht jedes Mal aggregieren
  db.exec(`CREATE TABLE IF NOT EXISTS sr_rating_stats (
    level_key TEXT PRIMARY KEY,
    count INTEGER NOT NULL,
    sum INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS sr_favorites (
    voter TEXT NOT NULL,
    level_key TEXT NOT NULL,
    info_json TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL,
    PRIMARY KEY (voter, level_key)
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_sr_favorites_voter ON sr_favorites(voter, created_at)');
  // Einmalig: Schlüssel von Zufallsleveln aus der Zeit vor der Generator-Version ('p:<Seed>|<Biom>') → 'p1:<Biom>:<Seed>'
  const alteSchluessel = db.prepare("SELECT level_key FROM sr_ratings WHERE level_key LIKE 'p:%' UNION SELECT level_key FROM sr_favorites WHERE level_key LIKE 'p:%' UNION SELECT level_key FROM sr_rating_stats WHERE level_key LIKE 'p:%'").all().map((r) => r.level_key);
  if (alteSchluessel.length) {
    db.transaction(() => {
      for (const alt of alteSchluessel) {
        const cut = alt.lastIndexOf('|');
        const neu = cut > 2 ? `p1:${alt.slice(cut + 1)}:${alt.slice(2, cut)}` : `p1:random:${alt.slice(2)}`;
        db.prepare('UPDATE OR IGNORE sr_ratings SET level_key = ? WHERE level_key = ?').run(neu, alt);
        db.prepare('UPDATE OR IGNORE sr_favorites SET level_key = ? WHERE level_key = ?').run(neu, alt);
        for (const t of ['sr_ratings', 'sr_favorites', 'sr_rating_stats']) db.prepare(`DELETE FROM ${t} WHERE level_key = ?`).run(alt);
        const a = db.prepare('SELECT COUNT(*) AS c, COALESCE(SUM(stars), 0) AS s, COALESCE(MAX(updated_at), 0) AS at FROM sr_ratings WHERE level_key = ?').get(neu);
        if (a.c > 0) db.prepare('INSERT OR REPLACE INTO sr_rating_stats (level_key, count, sum, updated_at) VALUES (?, ?, ?, ?)').run(neu, a.c, a.s, a.at);
      }
    })();
  }
  if (!db.prepare('PRAGMA table_info(sr_levels)').all().some((c) => c.name === 'rating_count')) {
    db.exec('ALTER TABLE sr_levels ADD COLUMN rating_count INTEGER NOT NULL DEFAULT 0');
    db.exec('ALTER TABLE sr_levels ADD COLUMN rating_sum INTEGER NOT NULL DEFAULT 0');
    // Einmalig beim Umstieg: jedes bisherige Like zählt als 5 Sterne desselben Kontos
    db.transaction(() => {
      db.exec(`INSERT OR IGNORE INTO sr_ratings (level_key, voter, stars, updated_at)
        SELECT 'c:' || l.code, 'a:' || k.account_id, 5, k.created_at FROM sr_level_likes k JOIN sr_levels l ON l.id = k.level_id`);
      db.exec(`INSERT OR REPLACE INTO sr_rating_stats (level_key, count, sum, updated_at)
        SELECT level_key, COUNT(*), SUM(stars), MAX(updated_at) FROM sr_ratings GROUP BY level_key`);
      db.exec(`UPDATE sr_levels SET
        rating_count = COALESCE((SELECT count FROM sr_rating_stats WHERE level_key = 'c:' || sr_levels.code), 0),
        rating_sum = COALESCE((SELECT sum FROM sr_rating_stats WHERE level_key = 'c:' || sr_levels.code), 0)`);
    })();
  }

  const stmt = {
    insert: db.prepare(`INSERT INTO sr_levels
      (code, account_id, creator_name, name, description, tags_json, difficulty, biome, speed_class, width, height, elements,
       content_hash, doc_z, preview_json, search_text, sim_fp, creator_ticks, creator_deaths, creator_splits_json, creator_log_json,
       status, created_at, updated_at)
      VALUES (@code, @accountId, @creatorName, @name, @description, @tagsJson, @difficulty, @biome, @speedClass, @width, @height, @elements,
       @contentHash, @docZ, @previewJson, @searchText, @simFp, @creatorTicks, @creatorDeaths, @creatorSplitsJson, @creatorLogJson,
       'published', @createdAt, @createdAt)`),
    byCode: db.prepare('SELECT * FROM sr_levels WHERE code = ?'),
    byId: db.prepare('SELECT * FROM sr_levels WHERE id = ?'),
    byHash: db.prepare("SELECT * FROM sr_levels WHERE content_hash = ? AND status != 'deleted'"),
    countActive: db.prepare("SELECT COUNT(*) AS c FROM sr_levels WHERE account_id = ? AND status != 'deleted'"),
    countSince: db.prepare('SELECT COUNT(*) AS c FROM sr_levels WHERE account_id = ? AND created_at >= ?'),
    updateMeta: db.prepare(`UPDATE sr_levels SET name = @name, description = @description, tags_json = @tagsJson,
      difficulty = @difficulty, biome = @biome, search_text = @searchText, updated_at = @at WHERE id = @id`),
    setStatus: db.prepare('UPDATE sr_levels SET status = ?, status_reason = ?, updated_at = ? WHERE id = ?'),
    setSim: db.prepare('UPDATE sr_levels SET sim_fp = ?, updated_at = ? WHERE id = ?'),
    setCreatorRun: db.prepare(`UPDATE sr_levels SET sim_fp = @simFp, creator_ticks = @ticks, creator_deaths = @deaths,
      creator_splits_json = @splitsJson, creator_log_json = @logJson, updated_at = @at WHERE id = @id`),
    stale: db.prepare("SELECT * FROM sr_levels WHERE status = 'published' AND sim_fp != ? ORDER BY id LIMIT ?"),
    docZ: db.prepare('SELECT doc_z FROM sr_levels WHERE id = ?'),
    creatorRun: db.prepare('SELECT sim_fp, creator_ticks, creator_deaths, creator_splits_json, creator_log_json FROM sr_levels WHERE id = ?'),

    player: db.prepare('SELECT * FROM sr_level_players WHERE level_id = ? AND identity = ?'),
    playerInsert: db.prepare('INSERT INTO sr_level_players (level_id, identity, attempts, first_at, last_at, cleared) VALUES (?, ?, 1, ?, ?, ?)'),
    playerTouch: db.prepare('UPDATE sr_level_players SET attempts = attempts + 1, last_at = ? WHERE level_id = ? AND identity = ?'),
    playerClear: db.prepare('UPDATE sr_level_players SET cleared = 1, last_at = ? WHERE level_id = ? AND identity = ?'),
    bumpPlays: db.prepare('UPDATE sr_levels SET plays = plays + 1 WHERE id = ?'),
    bumpPlayers: db.prepare('UPDATE sr_levels SET players = players + 1 WHERE id = ?'),
    bumpClears: db.prepare('UPDATE sr_levels SET clears = clears + 1 WHERE id = ?'),

    runGet: db.prepare('SELECT * FROM sr_level_runs WHERE level_id = ? AND player_key = ?'),
    runById: db.prepare('SELECT * FROM sr_level_runs WHERE id = ? AND level_id = ?'),
    runUpsert: db.prepare(`INSERT INTO sr_level_runs (level_id, player_key, player_name, account_id, ticks, deaths, log_json, sim_fp, created_at)
      VALUES (@levelId, @playerKey, @playerName, @accountId, @ticks, @deaths, @logJson, @simFp, @createdAt)
      ON CONFLICT(level_id, player_key) DO UPDATE SET player_name = excluded.player_name, account_id = excluded.account_id,
        ticks = excluded.ticks, deaths = excluded.deaths, log_json = excluded.log_json, sim_fp = excluded.sim_fp, created_at = excluded.created_at
      WHERE excluded.ticks < sr_level_runs.ticks OR excluded.sim_fp != sr_level_runs.sim_fp`),
    board: db.prepare(`SELECT id, player_name, account_id, ticks, deaths, created_at, log_json IS NOT NULL AS has_log FROM sr_level_runs
      WHERE level_id = ? ORDER BY ticks ASC, created_at ASC LIMIT ?`),
    runCount: db.prepare('SELECT COUNT(*) AS c FROM sr_level_runs WHERE level_id = ?'),
    ahead: db.prepare('SELECT COUNT(*) AS c FROM sr_level_runs WHERE level_id = ? AND (ticks < ? OR (ticks = ? AND created_at < ?))'),
    pruneLogs: db.prepare(`UPDATE sr_level_runs SET log_json = NULL WHERE level_id = ? AND log_json IS NOT NULL AND id NOT IN
      (SELECT id FROM sr_level_runs WHERE level_id = ? ORDER BY ticks ASC, created_at ASC LIMIT ?)`),
    staleRuns: db.prepare('SELECT * FROM sr_level_runs WHERE level_id = ? AND sim_fp != ? ORDER BY ticks LIMIT ?'),
    staleRunLevels: db.prepare('SELECT DISTINCT level_id FROM sr_level_runs WHERE sim_fp != ? LIMIT ?'),
    runSim: db.prepare('UPDATE sr_level_runs SET sim_fp = ? WHERE id = ?'),
    runDelete: db.prepare('DELETE FROM sr_level_runs WHERE id = ?'),

    rateSet: db.prepare(`INSERT INTO sr_ratings (level_key, voter, stars, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(level_key, voter) DO UPDATE SET stars = excluded.stars, updated_at = excluded.updated_at`),
    rateDel: db.prepare('DELETE FROM sr_ratings WHERE level_key = ? AND voter = ?'),
    rateGet: db.prepare('SELECT stars FROM sr_ratings WHERE level_key = ? AND voter = ?'),
    rateAgg: db.prepare('SELECT COUNT(*) AS c, COALESCE(SUM(stars), 0) AS s FROM sr_ratings WHERE level_key = ?'),
    statsSet: db.prepare('INSERT OR REPLACE INTO sr_rating_stats (level_key, count, sum, updated_at) VALUES (?, ?, ?, ?)'),
    statsDel: db.prepare('DELETE FROM sr_rating_stats WHERE level_key = ?'),
    statsGet: db.prepare('SELECT count, sum FROM sr_rating_stats WHERE level_key = ?'),
    levelRating: db.prepare('UPDATE sr_levels SET rating_count = ?, rating_sum = ? WHERE code = ?'),
    // Geglättet wie die Sortierung "bestbewertet": zwei gedachte 3-Sterne-Stimmen vorweg
    topStats: db.prepare(`SELECT level_key, count, sum FROM sr_rating_stats WHERE level_key LIKE ? AND count >= ?
      ORDER BY (sum + 6.0) / (count + 2.0) DESC, count DESC, updated_at DESC LIMIT ?`),
    voterKeys: db.prepare('SELECT level_key FROM sr_ratings WHERE voter = ?'),
    voterMove: db.prepare('UPDATE OR IGNORE sr_ratings SET voter = ? WHERE voter = ?'),
    voterDrop: db.prepare('DELETE FROM sr_ratings WHERE voter = ?'),
    favSet: db.prepare(`INSERT INTO sr_favorites (voter, level_key, info_json, created_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(voter, level_key) DO UPDATE SET info_json = excluded.info_json`),
    favDel: db.prepare('DELETE FROM sr_favorites WHERE voter = ? AND level_key = ?'),
    favHas: db.prepare('SELECT 1 FROM sr_favorites WHERE voter = ? AND level_key = ?'),
    favList: db.prepare('SELECT level_key, info_json, created_at FROM sr_favorites WHERE voter = ? ORDER BY created_at DESC, level_key LIMIT ?'),
    favCount: db.prepare('SELECT COUNT(*) AS c FROM sr_favorites WHERE voter = ?'),
    favMove: db.prepare('UPDATE OR IGNORE sr_favorites SET voter = ? WHERE voter = ?'),
    favDrop: db.prepare('DELETE FROM sr_favorites WHERE voter = ?'),

    reportAdd: db.prepare('INSERT OR IGNORE INTO sr_level_reports (level_id, account_id, reason, note, created_at) VALUES (?, ?, ?, ?, ?)'),
    reportsOpen: db.prepare(`SELECT r.id, r.level_id, r.account_id, r.reason, r.note, r.created_at FROM sr_level_reports r
      WHERE r.status = 'open' ORDER BY r.created_at DESC LIMIT ?`),
    reportsOfLevel: db.prepare("SELECT COUNT(*) AS c FROM sr_level_reports WHERE level_id = ? AND status = 'open'"),
    reportResolve: db.prepare("UPDATE sr_level_reports SET status = ? WHERE level_id = ? AND status = 'open'"),
    reportDismiss: db.prepare("UPDATE sr_level_reports SET status = 'dismissed' WHERE id = ? AND status = 'open'"),

    banAdd: db.prepare('INSERT OR REPLACE INTO sr_bans (account_id, reason, created_at) VALUES (?, ?, ?)'),
    banDel: db.prepare('DELETE FROM sr_bans WHERE account_id = ?'),
    banHas: db.prepare('SELECT 1 FROM sr_bans WHERE account_id = ?'),
    banList: db.prepare('SELECT account_id, reason, created_at FROM sr_bans ORDER BY created_at DESC'),
    hideAccount: db.prepare("UPDATE sr_levels SET status = 'hidden', status_reason = ?, updated_at = ? WHERE account_id = ? AND status = 'published'"),
    unhideAccount: db.prepare("UPDATE sr_levels SET status = 'published', status_reason = NULL, updated_at = ? WHERE account_id = ? AND status = 'hidden' AND status_reason = ?"),
    creatorStats: db.prepare(`SELECT COUNT(*) AS levels, COALESCE(SUM(plays), 0) AS plays, COALESCE(SUM(rating_count), 0) AS ratings,
      COALESCE(SUM(rating_sum), 0) AS rating_sum, COALESCE(SUM(clears), 0) AS clears FROM sr_levels WHERE account_id = ? AND status = 'published'`),
    creatorName: db.prepare("SELECT creator_name FROM sr_levels WHERE account_id = ? AND status != 'deleted' ORDER BY created_at DESC LIMIT 1"),
  };

  const parse = (json, fallback) => {
    try {
      return JSON.parse(json);
    } catch {
      return fallback;
    }
  };

  /** Summe und Anzahl eines Schlüssels neu zählen (nach jeder Änderung) — auch in sr_levels, wenn es ein veröffentlichtes Level ist */
  function refreshStats(key, at) {
    const a = stmt.rateAgg.get(key);
    if (a.c > 0) stmt.statsSet.run(key, a.c, a.s, at);
    else stmt.statsDel.run(key);
    if (key.startsWith('c:')) stmt.levelRating.run(a.c, a.s, key.slice(2));
    return { count: a.c, avg: a.c > 0 ? a.s / a.c : null };
  }
  const statsOf = (key) => {
    const r = stmt.statsGet.get(key);
    return r ? { count: r.count, avg: r.sum / r.count } : { count: 0, avg: null };
  };

  const toLevel = (row) => !row ? null : ({
    id: row.id,
    code: row.code,
    accountId: row.account_id,
    creatorName: row.creator_name,
    name: row.name,
    description: row.description,
    tags: parse(row.tags_json, []),
    difficulty: row.difficulty,
    biome: row.biome,
    speedClass: row.speed_class,
    width: row.width,
    height: row.height,
    elements: row.elements,
    contentHash: row.content_hash,
    preview: parse(row.preview_json, null),
    simFp: row.sim_fp,
    creatorTicks: row.creator_ticks,
    creatorDeaths: row.creator_deaths,
    status: row.status,
    statusReason: row.status_reason,
    plays: row.plays,
    players: row.players,
    clears: row.clears,
    ratingCount: row.rating_count,
    ratingAvg: row.rating_count > 0 ? row.rating_sum / row.rating_count : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });

  // Sortierungen des Browsers. `players` = verschiedene Spieler; die Abschlussquote ist clears / players.
  const ORDER = {
    new: 'created_at DESC, id DESC',
    popular: '(plays + 3 * rating_count) DESC, created_at DESC',
    // Sterne geglättet: zwei gedachte 3-Sterne-Stimmen vorweg (eine einzelne 5 schlägt nicht vierzig Viereinhalber); Level
    // ohne Bewertung kommen danach, neueste zuerst
    rated: 'CASE WHEN rating_count > 0 THEN 0 ELSE 1 END, (rating_sum + 6.0) / (rating_count + 2.0) DESC, rating_count DESC, created_at DESC',
    // Am schwersten: niedrigste Abschlussquote — aber erst ab drei Spielern aussagekräftig, dünn gespielte Level kommen danach
    hardest: 'CASE WHEN players >= 3 THEN 0 ELSE 1 END, (clears * 1.0 / MAX(players, 1)) ASC, players DESC, created_at DESC',
    random: 'RANDOM()',
  };
  const SORTS = Object.keys(ORDER);

  return {
    SORTS,
    PLAY_GAP_MS,

    insertLevel(l) {
      const info = stmt.insert.run({
        code: l.code, accountId: l.accountId, creatorName: l.creatorName, name: l.name, description: l.description || '',
        tagsJson: JSON.stringify(l.tags || []), difficulty: l.difficulty ?? null, biome: l.biome, speedClass: l.speedClass,
        width: l.width, height: l.height, elements: l.elements, contentHash: l.contentHash,
        docZ: zlib.deflateSync(Buffer.from(JSON.stringify(l.doc), 'utf8')),
        previewJson: JSON.stringify(l.preview),
        searchText: `${l.name} ${l.creatorName} ${(l.tags || []).join(' ')}`.toLowerCase(),
        simFp: l.simFp, creatorTicks: l.creatorTicks, creatorDeaths: l.creatorDeaths,
        creatorSplitsJson: JSON.stringify(l.creatorSplits || []), creatorLogJson: JSON.stringify(l.creatorLog),
        createdAt: l.createdAt,
      });
      return Number(info.lastInsertRowid);
    },

    byCode: (code) => toLevel(stmt.byCode.get(code)),
    byId: (id) => toLevel(stmt.byId.get(id)),
    byHash: (hash) => toLevel(stmt.byHash.get(hash)),
    countActive: (accountId) => stmt.countActive.get(accountId).c,
    countCreatedSince: (accountId, since) => stmt.countSince.get(accountId, since).c,

    /** Das kanonische Dokument (die Angaben in meta sind die zum Zeitpunkt der Veröffentlichung — die Seite überschreibt sie) */
    docOf(id) {
      const row = stmt.docZ.get(id);
      return row ? JSON.parse(zlib.inflateSync(row.doc_z).toString('utf8')) : null;
    },

    /** Ersteller-Lauf (Zeit, Tode, Zwischenzeiten, Log) samt Stand der Physik */
    creatorRun(id) {
      const r = stmt.creatorRun.get(id);
      return !r ? null : { simFp: r.sim_fp, ticks: r.creator_ticks, deaths: r.creator_deaths, splits: parse(r.creator_splits_json, []), log: parse(r.creator_log_json, []) };
    },

    updateMeta(id, meta, at) {
      stmt.updateMeta.run({
        id, name: meta.name, description: meta.description || '', tagsJson: JSON.stringify(meta.tags || []),
        difficulty: meta.difficulty ?? null, biome: meta.biome, at,
        searchText: `${meta.name} ${meta.creatorName} ${(meta.tags || []).join(' ')}`.toLowerCase(),
      });
    },

    setStatus: (id, status, reason, at) => stmt.setStatus.run(status, reason || null, at, id),
    setSimFp: (id, simFp, at) => stmt.setSim.run(simFp, at, id),
    setCreatorRun(id, { simFp, ticks, deaths, splits, log }, at) {
      stmt.setCreatorRun.run({ id, simFp, ticks, deaths, splitsJson: JSON.stringify(splits || []), logJson: JSON.stringify(log), at });
    },
    staleLevels: (simFp, limit = 200) => stmt.stale.all(simFp, limit).map(toLevel),

    /**
     * Liste für den Browser. `sort`: new | popular | rated | hardest | random. `q` sucht in Name, Ersteller und Tags (ohne
     * Rücksicht auf Groß-/Kleinschreibung); `code` (schon normalisiert) findet genau ein Level.
     * @returns {{ items: object[], total: number }}
     */
    list({ sort = 'new', q = '', code = null, tag = null, difficulty = null, speedClass = null, accountId = null, statuses = ['published'], limit = 24, offset = 0 } = {}) {
      const where = [`status IN (${statuses.map(() => '?').join(',')})`];
      const params = [...statuses];
      if (accountId) { where.push('account_id = ?'); params.push(accountId); }
      // Ein Suchwort in Code-Form findet den Code — und, weil es auch ein Name sein kann, ebenso Treffer im Text
      if (code && q) { where.push("(code = ? OR search_text LIKE ? ESCAPE '\\')"); params.push(code, `%${escapeLike(q.toLowerCase())}%`); }
      else if (code) { where.push('code = ?'); params.push(code); }
      else if (q) { where.push("search_text LIKE ? ESCAPE '\\'"); params.push(`%${escapeLike(q.toLowerCase())}%`); }
      if (tag) { where.push("tags_json LIKE ? ESCAPE '\\'"); params.push(`%"${escapeLike(tag.toLowerCase())}"%`); }
      if (difficulty) { where.push('difficulty = ?'); params.push(difficulty); }
      if (speedClass) { where.push('speed_class = ?'); params.push(speedClass); }
      const clause = where.join(' AND ');
      const order = ORDER[sort] || ORDER.new;
      const total = db.prepare(`SELECT COUNT(*) AS c FROM sr_levels WHERE ${clause}`).get(...params).c;
      const rows = db.prepare(`SELECT * FROM sr_levels WHERE ${clause} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...params, limit, offset);
      return { items: rows.map(toLevel), total };
    },

    // ── Spieler und Zählung ──
    /**
     * Ein Versuch beginnt. Zählt als "Spiel", wenn die Person das Level neu betritt oder seit `PLAY_GAP_MS` nicht gespielt hat.
     * @returns {{ newPlayer: boolean, counted: boolean }}
     */
    touchPlayer(levelId, identity, at) {
      const row = stmt.player.get(levelId, identity);
      if (!row) {
        stmt.playerInsert.run(levelId, identity, at, at, 0);
        stmt.bumpPlays.run(levelId);
        stmt.bumpPlayers.run(levelId);
        return { newPlayer: true, counted: true };
      }
      const counted = at - row.last_at >= PLAY_GAP_MS;
      if (counted) {
        stmt.playerTouch.run(at, levelId, identity);
        stmt.bumpPlays.run(levelId);
      }
      return { newPlayer: false, counted };
    },

    /** Ein Lauf ist im Ziel: die Person zählt als "geschafft" (einmal) */
    markCleared(levelId, identity, at) {
      const created = !stmt.player.get(levelId, identity);
      if (created) {
        stmt.playerInsert.run(levelId, identity, at, at, 1);
        stmt.bumpPlays.run(levelId);
        stmt.bumpPlayers.run(levelId);
        stmt.bumpClears.run(levelId);
        return { newClear: true };
      }
      const row = stmt.player.get(levelId, identity);
      if (row.cleared) return { newClear: false };
      stmt.playerClear.run(at, levelId, identity);
      stmt.bumpClears.run(levelId);
      return { newClear: true };
    },

    hasAttempt: (levelId, identity) => !!stmt.player.get(levelId, identity),

    // ── Bestenliste ──
    getRun(levelId, playerKey) {
      const r = stmt.runGet.get(levelId, playerKey);
      return !r ? null : { id: r.id, playerKey: r.player_key, name: r.player_name, accountId: r.account_id, ticks: r.ticks, deaths: r.deaths, simFp: r.sim_fp, createdAt: r.created_at };
    },

    /** Speichert den Lauf, wenn er schneller ist (oder die alte Zeit gegen andere Physik lief). @returns {boolean} gespeichert */
    saveRun({ levelId, playerKey, playerName, accountId = null, ticks, deaths, log, simFp, createdAt }) {
      const res = stmt.runUpsert.run({ levelId, playerKey, playerName, accountId, ticks, deaths, logJson: JSON.stringify(log), simFp, createdAt });
      if (res.changes > 0) stmt.pruneLogs.run(levelId, levelId, KEEP_RUN_LOGS);
      return res.changes > 0;
    },

    /** Die besten Läufe, schnellste zuerst; Gleichstand entscheidet, wer zuerst da war */
    board(levelId, limit = 50) {
      return stmt.board.all(levelId, limit).map((r, i) => ({
        rank: i + 1, runId: r.id, name: r.player_name, accountId: r.account_id, ticks: r.ticks, deaths: r.deaths, createdAt: r.created_at, hasGhost: !!r.has_log,
      }));
    },
    runCount: (levelId) => stmt.runCount.get(levelId).c,
    rankOf: (levelId, ticks, createdAt) => stmt.ahead.get(levelId, ticks, ticks, createdAt).c + 1,

    /** Ein Lauf samt Log (als Geist) — nur, wenn er zu diesem Level gehört und sein Log noch da ist */
    runGhost(levelId, runId) {
      const r = stmt.runById.get(runId, levelId);
      return r && r.log_json ? { name: r.player_name, ticks: r.ticks, deaths: r.deaths, simFp: r.sim_fp, log: parse(r.log_json, []) } : null;
    },
    staleRuns: (levelId, simFp, limit = 100) => stmt.staleRuns.all(levelId, simFp, limit).map((r) => ({ id: r.id, ticks: r.ticks, log: parse(r.log_json, null) })),
    levelsWithStaleRuns: (simFp, limit = 50) => stmt.staleRunLevels.all(simFp, limit).map((r) => r.level_id),
    setRunSim: (runId, simFp) => stmt.runSim.run(simFp, runId),
    deleteRun: (runId) => stmt.runDelete.run(runId),

    // ── Sterne ──
    /** Setzt (1–5) oder entfernt (0/null) die Sterne einer Person. @returns {{ count: number, avg: number|null }} */
    rate: db.transaction((key, voter, stars, at) => {
      if (stars) stmt.rateSet.run(key, voter, stars, at);
      else stmt.rateDel.run(key, voter);
      return refreshStats(key, at);
    }),
    myRating: (key, voter) => stmt.rateGet.get(key, voter)?.stars ?? null,
    ratingOf: statsOf,
    /** Die bestbewerteten Schlüssel mit diesem Anfang ('p:' = Zufallslevel), geglättet sortiert */
    topRated(prefix, { minCount = 1, limit = 20 } = {}) {
      return stmt.topStats.all(`${prefix}%`, minCount, limit).map((r) => ({ key: r.level_key, count: r.count, avg: r.sum / r.count }));
    },

    // ── Favoriten ──
    setFavorite: (voter, key, info, at) => { stmt.favSet.run(voter, key, JSON.stringify(info || {}), at); },
    removeFavorite: (voter, key) => stmt.favDel.run(voter, key).changes > 0,
    isFavorite: (voter, key) => !!stmt.favHas.get(voter, key),
    favoriteCount: (voter) => stmt.favCount.get(voter).c,
    favorites: (voter, limit = 200) => stmt.favList.all(voter, limit).map((r) => ({ key: r.level_key, info: parse(r.info_json, {}), createdAt: r.created_at })),

    /**
     * Ein Gast meldet sich an: Seine Sterne und Favoriten gehen auf das Konto über. Hat das Konto dasselbe Level schon
     * bewertet oder favorisiert, gilt der Eintrag des Kontos. @returns {number} übernommene oder verworfene Bewertungen
     */
    adoptVoter: db.transaction((from, to, at) => {
      const keys = stmt.voterKeys.all(from).map((r) => r.level_key);
      stmt.voterMove.run(to, from);
      stmt.voterDrop.run(from);
      for (const key of keys) refreshStats(key, at);
      stmt.favMove.run(to, from);
      stmt.favDrop.run(from);
      return keys.length;
    }),

    // ── Meldungen ──
    /** @returns {boolean} true = neu (dieses Konto hat das Level noch nicht gemeldet) */
    addReport: ({ levelId, accountId, reason, note = '', at }) => stmt.reportAdd.run(levelId, accountId, reason, note, at).changes > 0,
    openReportCount: (levelId) => stmt.reportsOfLevel.get(levelId).c,
    /** Offene Meldungen, gruppiert je Level: [{ level, count, reports: [{ id, accountId, reason, note, createdAt }] }] */
    openReports(limit = 200) {
      const groups = new Map();
      for (const r of stmt.reportsOpen.all(limit)) {
        if (!groups.has(r.level_id)) groups.set(r.level_id, { level: toLevel(stmt.byId.get(r.level_id)), reports: [] });
        groups.get(r.level_id).reports.push({ id: r.id, accountId: r.account_id, reason: r.reason, note: r.note, createdAt: r.created_at });
      }
      return [...groups.values()].filter((g) => g.level && g.level.status !== 'deleted').map((g) => ({ ...g, count: g.reports.length }));
    },
    resolveReports: (levelId, status) => stmt.reportResolve.run(status, levelId).changes,
    dismissReport: (reportId) => stmt.reportDismiss.run(reportId).changes > 0,

    // ── Sperren ──
    ban(accountId, reason, at) {
      stmt.banAdd.run(accountId, reason || '', at);
      return stmt.hideAccount.run('Konto gesperrt', at, accountId).changes;
    },
    unban(accountId, at) {
      stmt.banDel.run(accountId);
      return stmt.unhideAccount.run(at, accountId, 'Konto gesperrt').changes;
    },
    isBanned: (accountId) => !!stmt.banHas.get(accountId),
    bans: () => stmt.banList.all().map((r) => ({ accountId: r.account_id, reason: r.reason, createdAt: r.created_at })),

    // ── Ersteller ──
    creatorStats(accountId) {
      const s = stmt.creatorStats.get(accountId);
      const n = stmt.creatorName.get(accountId);
      return { name: n ? n.creator_name : null, levels: s.levels, plays: s.plays, ratings: s.ratings, ratingAvg: s.ratings > 0 ? s.rating_sum / s.ratings : null, clears: s.clears };
    },
  };
}

module.exports = { createLevelStore, KEEP_RUN_LOGS, PLAY_GAP_MS };
