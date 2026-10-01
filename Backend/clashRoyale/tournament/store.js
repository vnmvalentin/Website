// Speicher der Turniere (better-sqlite3, Backend/clashRoyale/data/cr_tournaments.db — nicht im
// Repo, siehe .gitignore: enthält Twitch-IDs und die Geheimschlüssel der Anmeldungen ohne Login).
//
// Phase 1: Turniere und Teilnehmer. Phase 2: Auslosung (draw_index/group_index) und Matches.
// Spiele/Chat (Phase 3+) bekommen eigene Tabellen; Migrationen fügen nur hinzu.
// Pfad über CR_TOURNAMENT_DB überschreibbar — Tests laufen damit gegen eine Scratch-Datei.
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbFile = process.env.CR_TOURNAMENT_DB || path.join(__dirname, '../data/cr_tournaments.db');
fs.mkdirSync(path.dirname(dbFile), { recursive: true });
const db = new Database(dbFile);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`CREATE TABLE IF NOT EXISTS tournaments (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  owner_login TEXT NOT NULL DEFAULT '',
  settings_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'registration',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  started_at INTEGER,
  finished_at INTEGER
)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_tournaments_owner ON tournaments(owner_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments(status)`);

db.exec(`CREATE TABLE IF NOT EXISTS tournament_participants (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  twitch_id TEXT,
  twitch_login TEXT NOT NULL DEFAULT '',
  display_name TEXT NOT NULL,
  cr_tag TEXT NOT NULL,
  cr_name TEXT NOT NULL DEFAULT '',
  cr_league INTEGER NOT NULL DEFAULT 0,
  cr_trophies INTEGER NOT NULL DEFAULT 0,
  friend_link TEXT NOT NULL DEFAULT '',
  secret TEXT,
  joined_at INTEGER NOT NULL
)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_tparts_tournament ON tournament_participants(tournament_id)`);
// Ein Twitch-Account und ein CR-Account je Turnier höchstens einmal
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS uq_tparts_twitch ON tournament_participants(tournament_id, twitch_id) WHERE twitch_id IS NOT NULL`);
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS uq_tparts_tag ON tournament_participants(tournament_id, cr_tag)`);

// Phase 2: Auslosung am Teilnehmer (Losnummer = Reihenfolge der Auslosung, dient auch als
// letzter Tiebreaker; Gruppe) — nur hinzufügen, nie umbauen
const partCols = new Set(db.prepare('PRAGMA table_info(tournament_participants)').all().map(c => c.name));
if (!partCols.has('draw_index')) db.exec('ALTER TABLE tournament_participants ADD COLUMN draw_index INTEGER');
if (!partCols.has('group_index')) db.exec('ALTER TABLE tournament_participants ADD COLUMN group_index INTEGER');

// Matches (Gruppe und Bracket) — Aufbau siehe structure.js. a/b: Teilnehmer-ID, NULL (offen) oder
// structure.BYE. Ganze Liste wird nach jeder Änderung in einer Transaktion zurückgeschrieben.
db.exec(`CREATE TABLE IF NOT EXISTS tournament_matches (
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  stage TEXT NOT NULL,
  group_index INTEGER,
  round INTEGER NOT NULL,
  slot INTEGER NOT NULL,
  player_a TEXT,
  player_b TEXT,
  best_of INTEGER NOT NULL,
  score_a INTEGER NOT NULL DEFAULT 0,
  score_b INTEGER NOT NULL DEFAULT 0,
  crowns_a INTEGER NOT NULL DEFAULT 0,
  crowns_b INTEGER NOT NULL DEFAULT 0,
  winner TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  win_to TEXT, win_side TEXT, lose_to TEXT, lose_side TEXT,
  finished_at INTEGER,
  PRIMARY KEY (tournament_id, id)
)`);

// Phase 3: einzelne Spiele einer Serie (Modus-Wahl, Draft-Lobby, Decks, Sieger) und der Chat
// des Match-Raums. status: banning → drafting → battle → done | void (annulliert)
db.exec(`CREATE TABLE IF NOT EXISTS tournament_games (
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  match_id TEXT NOT NULL,
  game_no INTEGER NOT NULL,
  status TEXT NOT NULL,
  offer_json TEXT NOT NULL DEFAULT '[]',
  bans_json TEXT NOT NULL DEFAULT '[]',
  mode TEXT,
  lobby_code TEXT,
  decks_json TEXT,
  winner TEXT,
  crowns_a INTEGER NOT NULL DEFAULT 0,
  crowns_b INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  draft_done_at INTEGER,
  finished_at INTEGER,
  PRIMARY KEY (tournament_id, match_id, game_no)
)`);
db.exec(`CREATE TABLE IF NOT EXISTS tournament_chat (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  match_id TEXT NOT NULL,
  author_id TEXT,
  author_name TEXT NOT NULL,
  role TEXT NOT NULL,
  text TEXT NOT NULL,
  at INTEGER NOT NULL
)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_tchat_match ON tournament_chat(tournament_id, match_id, id)`);
const CHAT_KEEP = 200;

const stmt = {
  insertT: db.prepare(`INSERT INTO tournaments (id, owner_id, owner_login, settings_json, status, created_at, updated_at)
    VALUES (@id, @owner_id, @owner_login, @settings_json, 'registration', @now, @now)`),
  getT: db.prepare('SELECT * FROM tournaments WHERE id = ?'),
  updateSettings: db.prepare('UPDATE tournaments SET settings_json = ?, updated_at = ? WHERE id = ?'),
  setStatus: db.prepare('UPDATE tournaments SET status = ?, updated_at = ? WHERE id = ?'),
  listListed: db.prepare(`SELECT * FROM tournaments WHERE status IN ('registration', 'running') ORDER BY created_at DESC LIMIT 50`),
  countActiveByOwner: db.prepare(`SELECT COUNT(*) AS n FROM tournaments WHERE owner_id = ? AND status IN ('registration', 'running')`),
  listByOwner: db.prepare(`SELECT * FROM tournaments WHERE owner_id = ? ORDER BY created_at DESC LIMIT 30`),
  insertP: db.prepare(`INSERT INTO tournament_participants
    (id, tournament_id, twitch_id, twitch_login, display_name, cr_tag, cr_name, cr_league, cr_trophies, friend_link, secret, joined_at)
    VALUES (@id, @tournament_id, @twitch_id, @twitch_login, @display_name, @cr_tag, @cr_name, @cr_league, @cr_trophies, @friend_link, @secret, @joined_at)`),
  listP: db.prepare('SELECT * FROM tournament_participants WHERE tournament_id = ? ORDER BY joined_at ASC'),
  countP: db.prepare('SELECT COUNT(*) AS n FROM tournament_participants WHERE tournament_id = ?'),
  getP: db.prepare('SELECT * FROM tournament_participants WHERE id = ? AND tournament_id = ?'),
  deleteP: db.prepare('DELETE FROM tournament_participants WHERE id = ? AND tournament_id = ?'),
  updateFriendLink: db.prepare('UPDATE tournament_participants SET friend_link = ? WHERE id = ? AND tournament_id = ?'),
  setDraw: db.prepare('UPDATE tournament_participants SET draw_index = ?, group_index = ? WHERE id = ? AND tournament_id = ?'),
  setStarted: db.prepare(`UPDATE tournaments SET status = 'running', started_at = ?, updated_at = ? WHERE id = ?`),
  setFinished: db.prepare(`UPDATE tournaments SET status = 'finished', finished_at = ?, updated_at = ? WHERE id = ?`),
  listAutoStart: db.prepare(`SELECT * FROM tournaments WHERE status = 'registration'`),
  listM: db.prepare('SELECT * FROM tournament_matches WHERE tournament_id = ?'),
  upsertM: db.prepare(`INSERT INTO tournament_matches
    (tournament_id, id, stage, group_index, round, slot, player_a, player_b, best_of, score_a, score_b, crowns_a, crowns_b,
     winner, status, win_to, win_side, lose_to, lose_side, finished_at)
    VALUES (@tournament_id, @id, @stage, @group_index, @round, @slot, @player_a, @player_b, @best_of, @score_a, @score_b, @crowns_a, @crowns_b,
     @winner, @status, @win_to, @win_side, @lose_to, @lose_side, @finished_at)
    ON CONFLICT(tournament_id, id) DO UPDATE SET
      player_a = excluded.player_a, player_b = excluded.player_b, best_of = excluded.best_of,
      score_a = excluded.score_a, score_b = excluded.score_b, crowns_a = excluded.crowns_a, crowns_b = excluded.crowns_b,
      winner = excluded.winner, status = excluded.status, finished_at = excluded.finished_at`),
  listG: db.prepare('SELECT * FROM tournament_games WHERE tournament_id = ? AND match_id = ? ORDER BY game_no'),
  listGAll: db.prepare('SELECT * FROM tournament_games WHERE tournament_id = ? ORDER BY match_id, game_no'),
  upsertG: db.prepare(`INSERT INTO tournament_games
    (tournament_id, match_id, game_no, status, offer_json, bans_json, mode, lobby_code, decks_json, winner, crowns_a, crowns_b, created_at, draft_done_at, finished_at)
    VALUES (@tournament_id, @match_id, @game_no, @status, @offer_json, @bans_json, @mode, @lobby_code, @decks_json, @winner, @crowns_a, @crowns_b, @created_at, @draft_done_at, @finished_at)
    ON CONFLICT(tournament_id, match_id, game_no) DO UPDATE SET
      status = excluded.status, offer_json = excluded.offer_json, bans_json = excluded.bans_json, mode = excluded.mode,
      lobby_code = excluded.lobby_code, decks_json = excluded.decks_json, winner = excluded.winner,
      crowns_a = excluded.crowns_a, crowns_b = excluded.crowns_b, draft_done_at = excluded.draft_done_at, finished_at = excluded.finished_at`),
  insertChat: db.prepare(`INSERT INTO tournament_chat (tournament_id, match_id, author_id, author_name, role, text, at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`),
  listChat: db.prepare(`SELECT * FROM (SELECT * FROM tournament_chat WHERE tournament_id = ? AND match_id = ? ORDER BY id DESC LIMIT ?) ORDER BY id`),
  trimChat: db.prepare(`DELETE FROM tournament_chat WHERE tournament_id = ? AND match_id = ? AND id NOT IN
    (SELECT id FROM tournament_chat WHERE tournament_id = ? AND match_id = ? ORDER BY id DESC LIMIT ?)`),
};

const rowToGame = (r) => ({
  matchId: r.match_id, gameNo: r.game_no, status: r.status,
  offer: parse(r.offer_json, []), bans: parse(r.bans_json, []), mode: r.mode, lobbyCode: r.lobby_code,
  decks: parse(r.decks_json, null), winner: r.winner, crownsA: r.crowns_a, crownsB: r.crowns_b,
  createdAt: r.created_at, draftDoneAt: r.draft_done_at, finishedAt: r.finished_at,
});
const gameToRow = (tournamentId, g) => ({
  tournament_id: tournamentId, match_id: g.matchId, game_no: g.gameNo, status: g.status,
  offer_json: JSON.stringify(g.offer || []), bans_json: JSON.stringify(g.bans || []), mode: g.mode ?? null,
  lobby_code: g.lobbyCode ?? null, decks_json: g.decks ? JSON.stringify(g.decks) : null, winner: g.winner ?? null,
  crowns_a: g.crownsA || 0, crowns_b: g.crownsB || 0, created_at: g.createdAt || Date.now(),
  draft_done_at: g.draftDoneAt ?? null, finished_at: g.finishedAt ?? null,
});

const STAGE_ORDER = { group: 0, upper: 1, lower: 2, grand: 3 };
const rowToMatch = (r) => ({
  id: r.id, stage: r.stage, group: r.group_index, round: r.round, slot: r.slot,
  a: r.player_a, b: r.player_b, bestOf: r.best_of,
  scoreA: r.score_a, scoreB: r.score_b, crownsA: r.crowns_a, crownsB: r.crowns_b,
  winner: r.winner, status: r.status,
  winTo: r.win_to, winSide: r.win_side, loseTo: r.lose_to, loseSide: r.lose_side,
  finishedAt: r.finished_at,
});
const matchToRow = (tournamentId, m) => ({
  tournament_id: tournamentId, id: m.id, stage: m.stage, group_index: m.group ?? null, round: m.round, slot: m.slot,
  player_a: m.a ?? null, player_b: m.b ?? null, best_of: m.bestOf, score_a: m.scoreA || 0, score_b: m.scoreB || 0,
  crowns_a: m.crownsA || 0, crowns_b: m.crownsB || 0, winner: m.winner ?? null, status: m.status,
  win_to: m.winTo ?? null, win_side: m.winSide ?? null, lose_to: m.loseTo ?? null, lose_side: m.loseSide ?? null,
  finished_at: m.finishedAt ?? null,
});

const parse = (raw, fallback) => { try { return JSON.parse(raw) ?? fallback; } catch { return fallback; } };

const rowToTournament = (r) => r && ({
  id: r.id,
  ownerId: r.owner_id,
  ownerLogin: r.owner_login,
  settings: parse(r.settings_json, {}),
  status: r.status,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  startedAt: r.started_at,
  finishedAt: r.finished_at,
});

const rowToParticipant = (r) => r && ({
  id: r.id,
  tournamentId: r.tournament_id,
  twitchId: r.twitch_id,
  twitchLogin: r.twitch_login,
  displayName: r.display_name,
  crTag: r.cr_tag,
  crName: r.cr_name,
  crLeague: r.cr_league,
  crTrophies: r.cr_trophies,
  friendLink: r.friend_link,
  secret: r.secret,
  joinedAt: r.joined_at,
  drawIndex: r.draw_index,
  group: r.group_index,
});

module.exports = {
  createTournament({ id, ownerId, ownerLogin, settings }) {
    stmt.insertT.run({ id, owner_id: String(ownerId), owner_login: ownerLogin || '', settings_json: JSON.stringify(settings), now: Date.now() });
    return rowToTournament(stmt.getT.get(id));
  },
  getTournament: (id) => rowToTournament(stmt.getT.get(String(id || ''))),
  updateSettings(id, settings) {
    stmt.updateSettings.run(JSON.stringify(settings), Date.now(), id);
    return rowToTournament(stmt.getT.get(id));
  },
  setStatus(id, status) { stmt.setStatus.run(status, Date.now(), id); },
  listListed: () => stmt.listListed.all().map(rowToTournament).filter(t => t.settings?.listed),
  listByOwner: (ownerId) => stmt.listByOwner.all(String(ownerId)).map(rowToTournament),
  countActiveByOwner: (ownerId) => stmt.countActiveByOwner.get(String(ownerId)).n,

  addParticipant(p) {
    stmt.insertP.run({
      id: p.id, tournament_id: p.tournamentId, twitch_id: p.twitchId ? String(p.twitchId) : null,
      twitch_login: p.twitchLogin || '', display_name: p.displayName, cr_tag: p.crTag, cr_name: p.crName || '',
      cr_league: p.crLeague || 0, cr_trophies: p.crTrophies || 0, friend_link: p.friendLink || '',
      secret: p.secret || null, joined_at: Date.now(),
    });
    return rowToParticipant(stmt.getP.get(p.id, p.tournamentId));
  },
  listParticipants: (tournamentId) => stmt.listP.all(tournamentId).map(rowToParticipant),
  countParticipants: (tournamentId) => stmt.countP.get(tournamentId).n,
  getParticipant: (tournamentId, id) => rowToParticipant(stmt.getP.get(id, tournamentId)),
  removeParticipant: (tournamentId, id) => stmt.deleteP.run(id, tournamentId).changes > 0,
  setFriendLink: (tournamentId, id, link) => stmt.updateFriendLink.run(link, id, tournamentId).changes > 0,

  // ── Phase 2: Auslosung, Matches ──
  listMatches: (tournamentId) => stmt.listM.all(tournamentId).map(rowToMatch)
    .sort((x, y) => STAGE_ORDER[x.stage] - STAGE_ORDER[y.stage] || (x.group ?? 0) - (y.group ?? 0) || x.round - y.round || x.slot - y.slot),
  saveMatches(tournamentId, matches) { for (const m of matches) stmt.upsertM.run(matchToRow(tournamentId, m)); },
  /** Start in EINER Transaktion: Auslosung an den Teilnehmern, Matches, Status. */
  startTournament: db.transaction((tournamentId, { drawOrder, groups, matches }) => {
    const groupOf = new Map();
    groups.forEach((ids, g) => ids.forEach(id => groupOf.set(id, g)));
    drawOrder.forEach((pid, i) => stmt.setDraw.run(i, groupOf.has(pid) ? groupOf.get(pid) : null, pid, tournamentId));
    for (const m of matches) stmt.upsertM.run(matchToRow(tournamentId, m));
    const now = Date.now();
    stmt.setStarted.run(now, now, tournamentId);
  }),
  /** Ergebnis speichern (+ ggf. neue Bracket-Matches, + ggf. Turnierende) in einer Transaktion. */
  commitMatches: db.transaction((tournamentId, matches, { finished = false } = {}) => {
    for (const m of matches) stmt.upsertM.run(matchToRow(tournamentId, m));
    if (finished) { const now = Date.now(); stmt.setFinished.run(now, now, tournamentId); }
  }),
  listRegistrationTournaments: () => stmt.listAutoStart.all().map(rowToTournament),

  // ── Phase 3: Spiele + Chat ──
  listGames: (tournamentId, matchId) => stmt.listG.all(tournamentId, matchId).map(rowToGame),
  listAllGames: (tournamentId) => stmt.listGAll.all(tournamentId).map(rowToGame),
  saveGame(tournamentId, game) { stmt.upsertG.run(gameToRow(tournamentId, game)); },
  addChat(tournamentId, matchId, { authorId, authorName, role, text }) {
    const at = Date.now();
    const info = stmt.insertChat.run(tournamentId, matchId, authorId ?? null, authorName, role, text, at);
    stmt.trimChat.run(tournamentId, matchId, tournamentId, matchId, CHAT_KEEP);
    return { id: info.lastInsertRowid, authorId: authorId ?? null, authorName, role, text, at };
  },
  listChat: (tournamentId, matchId, limit = 100) => stmt.listChat.all(tournamentId, matchId, limit)
    .map(r => ({ id: r.id, authorId: r.author_id, authorName: r.author_name, role: r.role, text: r.text, at: r.at })),

  /** Nur für Tests: Verbindung schließen */
  _close: () => db.close(),
};
