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
// Phase 5: vom Veranstalter disqualifiziert / aufgegeben — offene und künftige Matches gehen kampflos verloren
if (!partCols.has('dropped_at')) db.exec('ALTER TABLE tournament_participants ADD COLUMN dropped_at INTEGER');

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

// Wer darf Turniere erstellen? Vom Admin freigegebene Twitch-Accounts (Content Creator). Gespeichert wird der
// Login (kleingeschrieben); die Twitch-ID wird beim ersten Login nachgetragen, damit eine Umbenennung nicht
// die Freigabe kostet.
db.exec(`CREATE TABLE IF NOT EXISTS tournament_creators (
  login TEXT PRIMARY KEY,
  twitch_id TEXT,
  added_at INTEGER NOT NULL,
  added_by TEXT
)`);

// Phase 4: gefundener Kampf + Prüf-Ergebnis am Spiel (status 'review' = Veranstalter entscheidet)
const gameCols = new Set(db.prepare('PRAGMA table_info(tournament_games)').all().map(c => c.name));
if (!gameCols.has('battle_json')) db.exec('ALTER TABLE tournament_games ADD COLUMN battle_json TEXT');
if (!gameCols.has('review_json')) db.exec('ALTER TABLE tournament_games ADD COLUMN review_json TEXT');
if (!gameCols.has('checked_at')) db.exec('ALTER TABLE tournament_games ADD COLUMN checked_at INTEGER');
// Anwesenheit im Match-Raum + Erscheinen-Frist (wait_start) + kampfloser Sieg (forfeit = Sieger-Seite)
db.exec(`CREATE TABLE IF NOT EXISTS tournament_match_meta (
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  match_id TEXT NOT NULL,
  present_a_at INTEGER,
  present_b_at INTEGER,
  wait_start INTEGER,
  forfeit TEXT,
  PRIMARY KEY (tournament_id, match_id)
)`);
// Bereit-Status je Seite + Start-Countdown (start_at) — in der DB, weil die Bereit-Frist daran hängt
// und einen Neustart überstehen muss. wait_start = Beginn der Bereit-Frist (genau einer bereit).
const metaCols = new Set(db.prepare('PRAGMA table_info(tournament_match_meta)').all().map(c => c.name));
for (const col of ['ready_a_at', 'ready_b_at', 'start_at']) {
  if (!metaCols.has(col)) db.exec(`ALTER TABLE tournament_match_meta ADD COLUMN ${col} INTEGER`);
}

const stmt = {
  insertT: db.prepare(`INSERT INTO tournaments (id, owner_id, owner_login, settings_json, status, created_at, updated_at)
    VALUES (@id, @owner_id, @owner_login, @settings_json, 'registration', @now, @now)`),
  getT: db.prepare('SELECT * FROM tournaments WHERE id = ?'),
  updateSettings: db.prepare('UPDATE tournaments SET settings_json = ?, updated_at = ? WHERE id = ?'),
  setStatus: db.prepare('UPDATE tournaments SET status = ?, updated_at = ? WHERE id = ?'),
  listListed: db.prepare(`SELECT * FROM tournaments WHERE status IN ('registration', 'drawn', 'running') ORDER BY created_at DESC LIMIT 50`),
  countActiveByOwner: db.prepare(`SELECT COUNT(*) AS n FROM tournaments WHERE owner_id = ? AND status IN ('registration', 'drawn', 'running')`),
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
  setDrawn: db.prepare(`UPDATE tournaments SET status = 'drawn', updated_at = ? WHERE id = ?`),
  clearDrawOf: db.prepare('UPDATE tournament_participants SET draw_index = NULL, group_index = NULL WHERE tournament_id = ?'),
  deleteMatchesOf: db.prepare('DELETE FROM tournament_matches WHERE tournament_id = ?'),
  deleteAllGamesOf: db.prepare('DELETE FROM tournament_games WHERE tournament_id = ?'),
  deleteAllMetaOf: db.prepare('DELETE FROM tournament_match_meta WHERE tournament_id = ?'),
  deleteAllChatOf: db.prepare('DELETE FROM tournament_chat WHERE tournament_id = ?'),
  deleteT: db.prepare('DELETE FROM tournaments WHERE id = ?'),
  listEndedBefore: db.prepare(`SELECT id FROM tournaments WHERE status IN ('finished', 'cancelled') AND COALESCE(finished_at, updated_at) < ?`),
  listStaleBefore: db.prepare(`SELECT * FROM tournaments WHERE status IN ('registration', 'drawn') AND updated_at < ?`),
  setFinished: db.prepare(`UPDATE tournaments SET status = 'finished', finished_at = ?, updated_at = ? WHERE id = ?`),
  listAutoStart: db.prepare(`SELECT * FROM tournaments WHERE status IN ('registration', 'drawn')`),
  listM: db.prepare('SELECT * FROM tournament_matches WHERE tournament_id = ?'),
  // Öffentliches Profil (profile/): Turniere, in denen ein Twitch-Account mitgespielt hat
  listJoinedBy: db.prepare(`SELECT t.*, p.id AS participant_id FROM tournament_participants p
    JOIN tournaments t ON t.id = p.tournament_id
    WHERE p.twitch_id = ? AND t.status IN ('running', 'finished') ORDER BY t.created_at DESC LIMIT 20`),
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
    (tournament_id, match_id, game_no, status, offer_json, bans_json, mode, lobby_code, decks_json, winner, crowns_a, crowns_b,
     created_at, draft_done_at, finished_at, battle_json, review_json, checked_at)
    VALUES (@tournament_id, @match_id, @game_no, @status, @offer_json, @bans_json, @mode, @lobby_code, @decks_json, @winner, @crowns_a, @crowns_b,
     @created_at, @draft_done_at, @finished_at, @battle_json, @review_json, @checked_at)
    ON CONFLICT(tournament_id, match_id, game_no) DO UPDATE SET
      status = excluded.status, offer_json = excluded.offer_json, bans_json = excluded.bans_json, mode = excluded.mode,
      lobby_code = excluded.lobby_code, decks_json = excluded.decks_json, winner = excluded.winner,
      crowns_a = excluded.crowns_a, crowns_b = excluded.crowns_b, draft_done_at = excluded.draft_done_at, finished_at = excluded.finished_at,
      battle_json = excluded.battle_json, review_json = excluded.review_json, checked_at = excluded.checked_at`),
  listGWaiting: db.prepare(`SELECT * FROM tournament_games WHERE status IN ('battle', 'review')`),
  getMeta: db.prepare('SELECT * FROM tournament_match_meta WHERE tournament_id = ? AND match_id = ?'),
  upsertMeta: db.prepare(`INSERT INTO tournament_match_meta
    (tournament_id, match_id, present_a_at, present_b_at, wait_start, forfeit, ready_a_at, ready_b_at, start_at)
    VALUES (@tournament_id, @match_id, @present_a_at, @present_b_at, @wait_start, @forfeit, @ready_a_at, @ready_b_at, @start_at)
    ON CONFLICT(tournament_id, match_id) DO UPDATE SET present_a_at = excluded.present_a_at, present_b_at = excluded.present_b_at,
      wait_start = excluded.wait_start, forfeit = excluded.forfeit, ready_a_at = excluded.ready_a_at,
      ready_b_at = excluded.ready_b_at, start_at = excluded.start_at`),
  listRunning: db.prepare(`SELECT * FROM tournaments WHERE status = 'running'`),
  listCreators: db.prepare('SELECT * FROM tournament_creators ORDER BY added_at DESC'),
  addCreator: db.prepare('INSERT OR IGNORE INTO tournament_creators (login, twitch_id, added_at, added_by) VALUES (?, NULL, ?, ?)'),
  removeCreator: db.prepare('DELETE FROM tournament_creators WHERE login = ?'),
  creatorById: db.prepare('SELECT * FROM tournament_creators WHERE twitch_id = ?'),
  creatorByLogin: db.prepare('SELECT * FROM tournament_creators WHERE login = ?'),
  setCreatorId: db.prepare('UPDATE tournament_creators SET twitch_id = ?, login = ? WHERE login = ?'),
  setDropped: db.prepare('UPDATE tournament_participants SET dropped_at = ? WHERE id = ? AND tournament_id = ?'),
  deleteM: db.prepare('DELETE FROM tournament_matches WHERE tournament_id = ? AND id = ?'),
  deleteGamesOf: db.prepare('DELETE FROM tournament_games WHERE tournament_id = ? AND match_id = ?'),
  voidGamesOf: db.prepare(`UPDATE tournament_games SET status = 'void', finished_at = COALESCE(finished_at, ?) WHERE tournament_id = ? AND match_id = ? AND status <> 'void'`),
  deleteMeta: db.prepare('DELETE FROM tournament_match_meta WHERE tournament_id = ? AND match_id = ?'),
  setRunning: db.prepare(`UPDATE tournaments SET status = 'running', finished_at = NULL, updated_at = ? WHERE id = ?`),
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
  battle: parse(r.battle_json, null), review: parse(r.review_json, null), checkedAt: r.checked_at ?? null,
});
const gameToRow = (tournamentId, g) => ({
  tournament_id: tournamentId, match_id: g.matchId, game_no: g.gameNo, status: g.status,
  offer_json: JSON.stringify(g.offer || []), bans_json: JSON.stringify(g.bans || []), mode: g.mode ?? null,
  lobby_code: g.lobbyCode ?? null, decks_json: g.decks ? JSON.stringify(g.decks) : null, winner: g.winner ?? null,
  crowns_a: g.crownsA || 0, crowns_b: g.crownsB || 0, created_at: g.createdAt || Date.now(),
  draft_done_at: g.draftDoneAt ?? null, finished_at: g.finishedAt ?? null,
  battle_json: g.battle ? JSON.stringify(g.battle) : null, review_json: g.review ? JSON.stringify(g.review) : null,
  checked_at: g.checkedAt ?? null,
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

/** Auslosung, Matches und alles daran Hängende eines Turniers verwerfen (ohne Status). */
function clearDrawRows(tournamentId) {
  stmt.clearDrawOf.run(tournamentId);
  stmt.deleteAllGamesOf.run(tournamentId);
  stmt.deleteAllMetaOf.run(tournamentId);
  stmt.deleteAllChatOf.run(tournamentId);
  stmt.deleteMatchesOf.run(tournamentId);
}

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
  droppedAt: r.dropped_at ?? null,
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
  listJoinedBy: (twitchId) => stmt.listJoinedBy.all(String(twitchId)).map((r) => ({ ...rowToTournament(r), participantId: r.participant_id })),
  listMatches: (tournamentId) => stmt.listM.all(tournamentId).map(rowToMatch)
    .sort((x, y) => STAGE_ORDER[x.stage] - STAGE_ORDER[y.stage] || (x.group ?? 0) - (y.group ?? 0) || x.round - y.round || x.slot - y.slot),
  saveMatches(tournamentId, matches) { for (const m of matches) stmt.upsertM.run(matchToRow(tournamentId, m)); },
/**
   * Auslosung speichern in EINER Transaktion: alte Auslosung (beim Neu-Auslosen) samt Matches verwerfen,
   * Losnummern/Gruppen an die Teilnehmer, Matches, Status — 'drawn' (Matches noch gesperrt) oder mit
   * live: true gleich 'running'.
   */
  saveDraw: db.transaction((tournamentId, { drawOrder, groups, matches }, { live = false } = {}) => {
    clearDrawRows(tournamentId);
    const groupOf = new Map();
    groups.forEach((ids, g) => ids.forEach(id => groupOf.set(id, g)));
    drawOrder.forEach((pid, i) => stmt.setDraw.run(i, groupOf.has(pid) ? groupOf.get(pid) : null, pid, tournamentId));
    for (const m of matches) stmt.upsertM.run(matchToRow(tournamentId, m));
    const now = Date.now();
    if (live) stmt.setStarted.run(now, now, tournamentId);
    else stmt.setDrawn.run(now, tournamentId);
  }),
  /** Ausgelostes Turnier freigeben: 'drawn' → 'running' */
  goLive(tournamentId) { const now = Date.now(); stmt.setStarted.run(now, now, tournamentId); },
  /** Auslosung zurücknehmen: zurück in die Anmeldung */
  clearDraw: db.transaction((tournamentId) => {
    clearDrawRows(tournamentId);
    stmt.setStatus.run('registration', Date.now(), tournamentId);
  }),
  /** Turnier endgültig löschen — Teilnehmer, Matches, Spiele, Chat und Meta gehen per ON DELETE CASCADE mit. */
  deleteTournament: (id) => stmt.deleteT.run(id).changes > 0,
  /**
   * Aufräumen: beendete/abgesagte Turniere, die vor endedBefore endeten, und nie gestartete (Anmeldung oder
   * ausgelost), die seit staleBefore niemand angefasst hat und deren Termin nicht mehr bevorsteht.
   * Gibt die gelöschten IDs zurück.
   */
  purgeOld: db.transaction(({ endedBefore, staleBefore, now = Date.now() }) => {
    const ids = stmt.listEndedBefore.all(endedBefore).map(r => r.id);
    for (const r of stmt.listStaleBefore.all(staleBefore)) {
      const startsAt = parse(r.settings_json, {}).startsAt;
      if (!startsAt || startsAt < now) ids.push(r.id);
    }
    for (const id of ids) stmt.deleteT.run(id);
    return ids;
  }),
  /** Ergebnis speichern (+ ggf. neue Bracket-Matches, + ggf. Turnierende) in einer Transaktion. */
  commitMatches: db.transaction((tournamentId, matches, { finished = false } = {}) => {
    for (const m of matches) stmt.upsertM.run(matchToRow(tournamentId, m));
    if (finished) { const now = Date.now(); stmt.setFinished.run(now, now, tournamentId); }
  }),
  // ── Turnier-Ersteller (Freigabe durch den Admin) ──
  listCreators: () => stmt.listCreators.all().map(r => ({ login: r.login, twitchId: r.twitch_id, addedAt: r.added_at, addedBy: r.added_by })),
  addCreator: (login, addedBy) => stmt.addCreator.run(String(login).toLowerCase(), Date.now(), addedBy || null).changes > 0,
  removeCreator: (login) => stmt.removeCreator.run(String(login).toLowerCase()).changes > 0,
  /** Freigegeben? Treffer über die Twitch-ID oder (erster Login) über den Login — dann wird die ID nachgetragen. */
  isCreator(twitchId, login) {
    if (twitchId && stmt.creatorById.get(String(twitchId))) return true;
    const byLogin = login ? stmt.creatorByLogin.get(String(login).toLowerCase()) : null;
    if (!byLogin) return false;
    if (twitchId && !byLogin.twitch_id) stmt.setCreatorId.run(String(twitchId), byLogin.login, byLogin.login);
    return !byLogin.twitch_id || String(byLogin.twitch_id) === String(twitchId);
  },
  setDropped: (tournamentId, pid, at) => stmt.setDropped.run(at, pid, tournamentId).changes > 0,
  /**
   * Matches nach einer Korrektur neu schreiben (Phase 5) — in EINER Transaktion: entfernte Matches samt
   * Spielen/Meta löschen, Spiele der zurückgesetzten Matches annullieren, Liste speichern, Turnierstatus setzen.
   */
  rewriteMatches: db.transaction((tournamentId, matches, { removeIds = [], resetIds = [], finished = false } = {}) => {
    const now = Date.now();
    for (const id of removeIds) {
      stmt.deleteM.run(tournamentId, id); stmt.deleteGamesOf.run(tournamentId, id); stmt.deleteMeta.run(tournamentId, id);
    }
    for (const id of resetIds) { stmt.voidGamesOf.run(now, tournamentId, id); stmt.deleteMeta.run(tournamentId, id); }
    for (const m of matches) stmt.upsertM.run(matchToRow(tournamentId, m));
    if (finished) stmt.setFinished.run(now, now, tournamentId);
    else stmt.setRunning.run(now, tournamentId);
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
  /** Spiele, die auf ihren Kampf warten (oder zur Klärung liegen) — für die Prüfschleife */
  listWaitingGames: () => stmt.listGWaiting.all().map(r => ({ tournamentId: r.tournament_id, ...rowToGame(r) })),
  listRunningTournaments: () => stmt.listRunning.all().map(rowToTournament),
  getMatchMeta(tournamentId, matchId) {
    const r = stmt.getMeta.get(tournamentId, matchId);
    return {
      presentAAt: r?.present_a_at ?? null, presentBAt: r?.present_b_at ?? null, waitStart: r?.wait_start ?? null, forfeit: r?.forfeit ?? null,
      readyAAt: r?.ready_a_at ?? null, readyBAt: r?.ready_b_at ?? null, startAt: r?.start_at ?? null,
    };
  },
  saveMatchMeta(tournamentId, matchId, m) {
    stmt.upsertMeta.run({ tournament_id: tournamentId, match_id: matchId, present_a_at: m.presentAAt ?? null,
      present_b_at: m.presentBAt ?? null, wait_start: m.waitStart ?? null, forfeit: m.forfeit ?? null,
      ready_a_at: m.readyAAt ?? null, ready_b_at: m.readyBAt ?? null, start_at: m.startAt ?? null });
  },
  listChat: (tournamentId, matchId, limit = 100) => stmt.listChat.all(tournamentId, matchId, limit)
    .map(r => ({ id: r.id, authorId: r.author_id, authorName: r.author_name, role: r.role, text: r.text, at: r.at })),

  /** Nur für Tests: Verbindung schließen */
  _close: () => db.close(),
};
