// scoutStore.js — kleiner Speicher der Stats-Seiten (Backend/data/cr_scout.db):
//
//   • Namens-Index: die offizielle API findet Spieler nur über den Tag. Jeder Spieler, der hier einmal auftaucht
//     (aufgerufenes Profil, Gegner und Mitspieler im Battlelog, Clan-Mitglieder, Ranglisten), wird mit Namen
//     gemerkt — daraus entsteht die Suche nach Spielernamen. Der Index wächst mit der Nutzung; von selbst füttert
//     ihn der Meta-Sammler alle paar Stunden mit der globalen Top 1000 und deren Gegnern (scoutRoutes.js).
//   • Frühere Namen: weicht ein gesehener Name vom gemerkten ab, wandert der ältere in player_names (wie die
//     Namensliste bei Steam). Jeder Name trägt den Zeitpunkt, zu dem er galt — Kampfnamen die Kampfzeit —, damit ein
//     alter Kampf den aktuellen Namen nicht überschreibt.
//   • Bewertungen: Daumen hoch/runter je Profil, eine Stimme je Twitch-Konto (profile_votes).
//   • Schlüssel/Wert-Ablage für den Meta-Schnappschuss (scoutMeta.js), damit ein Neustart ihn nicht verliert.
//   • Verläufe für später (scoutHistory.js): Matchups — jeder Ranked-Kampf der Top-Spieler einmal, 45 Tage — und
//     Clan-Schnappschüsse angesehener Clans (35 Tage vollständig, danach einer je Tag, gut ein Jahr).
//
// Die Datenbank wird erst beim ersten Zugriff geöffnet. Tests und Prüfstände biegen den Pfad über CR_SCOUT_DB um
// (nie gegen Backend/data testen).

const zlib = require('zlib');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const { dataPath } = require('../../lib/dataDir');
const history = require('./scoutHistory');

const MAX_ROWS = 400000;
const PRUNE_ROWS = 50000;

let db = null;
let stmts = null;
let writesSincePrune = 0;

function open() {
  if (db) return db;
  db = new Database(process.env.CR_SCOUT_DB || dataPath('cr_scout.db'));
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS players (
      tag TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      name_norm TEXT NOT NULL,
      trophies INTEGER NOT NULL DEFAULT 0,
      clan_name TEXT NOT NULL DEFAULT '',
      seen_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_players_norm ON players(name_norm);
    CREATE INDEX IF NOT EXISTS idx_players_seen ON players(seen_at);
    CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS decks (
      tag TEXT PRIMARY KEY,
      cards TEXT NOT NULL,
      battle_at INTEGER NOT NULL,
      checked_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS battles (
      tag TEXT NOT NULL,
      t INTEGER NOT NULL,
      data BLOB NOT NULL,
      PRIMARY KEY (tag, t)
    ) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS idx_battles_t ON battles(t);
    -- Crown-Series-Duelle je Spieler, eigens gemerkt (der Verlauf oben behält nur die neuesten Kämpfe)
    CREATE TABLE IF NOT EXISTS crown_battles (
      tag TEXT NOT NULL,
      t INTEGER NOT NULL,
      data BLOB NOT NULL,
      PRIMARY KEY (tag, t)
    ) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS idx_crown_battles_t ON crown_battles(t);
    CREATE TABLE IF NOT EXISTS player_names (
      tag TEXT NOT NULL,
      name TEXT NOT NULL,
      last_at INTEGER NOT NULL,
      PRIMARY KEY (tag, name)
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS profile_votes (
      tag TEXT NOT NULL,
      voter TEXT NOT NULL,
      value INTEGER NOT NULL,
      at INTEGER NOT NULL,
      PRIMARY KEY (tag, voter)
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS watch (
      tag TEXT PRIMARY KEY,
      viewed_at INTEGER NOT NULL,
      polled_at INTEGER NOT NULL DEFAULT 0
    );
    -- Matchups: id = Prüfsumme aus Zeitpunkt + beiden Tags (derselbe Kampf aus zwei Battlelogs = eine Zeile);
    -- a/b = je 9 Zahlen à 2 Byte (8 Karten + Turmtruppe, 0 = keine) aus mu_tokens; res 1 = a gewann, 2 = b, 0 = remis;
    -- top = bester Platz der Beteiligten in der gesammelten Rangliste (0 = unbekannt)
    CREATE TABLE IF NOT EXISTS mu_tokens (id INTEGER PRIMARY KEY, token TEXT NOT NULL UNIQUE);
    CREATE TABLE IF NOT EXISTS mu_battles (
      id INTEGER PRIMARY KEY,
      t INTEGER NOT NULL,
      top INTEGER NOT NULL,
      a BLOB NOT NULL,
      b BLOB NOT NULL,
      res INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_mu_t ON mu_battles(t);
    -- Clans, deren Seite jemand angesehen hat, und ihre Schnappschüsse (data = gepacktes JSON aus scoutHistory)
    CREATE TABLE IF NOT EXISTS clan_watch (
      tag TEXT PRIMARY KEY,
      viewed_at INTEGER NOT NULL,
      polled_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS clan_snaps (
      tag TEXT NOT NULL,
      t INTEGER NOT NULL,
      data BLOB NOT NULL,
      PRIMARY KEY (tag, t)
    ) WITHOUT ROWID;
  `);
  // Turmtruppe zum Ranglisten-Deck (seit Nov. 2026); ältere Zeilen haben keine
  try { db.exec('ALTER TABLE decks ADD COLUMN tower TEXT'); } catch { /* Spalte existiert bereits */ }
  // Medaillenstand des Spielers, als sein Deck zuletzt geprüft wurde (seit Nov. 2026) — steht in der Rangliste ein
  // anderer, hat er seither gespielt und das Deck wird früher neu geholt (scoutRoutes.knownDeck). NULL = unbekannt.
  try { db.exec('ALTER TABLE decks ADD COLUMN score INTEGER'); } catch { /* Spalte existiert bereits */ }
  // Zeitpunkt, zu dem der gemerkte Name galt (seit Nov. 2026); ältere Zeilen übernehmen einmalig seen_at
  try {
    db.exec('ALTER TABLE players ADD COLUMN name_at INTEGER NOT NULL DEFAULT 0');
    db.exec('UPDATE players SET name_at = seen_at');
  } catch { /* Spalte existiert bereits */ }
  stmts = {
    // Trophäen und Clan nur überschreiben, wenn der neue Eintrag sie kennt (Gegner im Battlelog tragen keine
    // Gesamt-Trophäen) — sonst würde ein Kampf die besseren Angaben aus dem Profilabruf löschen.
    upsert: db.prepare(`
      INSERT INTO players (tag, name, name_norm, trophies, clan_name, seen_at, name_at) VALUES (@tag, @name, @norm, @trophies, @clan, @now, @at)
      ON CONFLICT(tag) DO UPDATE SET
        name = CASE WHEN excluded.name_at >= players.name_at THEN excluded.name ELSE players.name END,
        name_norm = CASE WHEN excluded.name_at >= players.name_at THEN excluded.name_norm ELSE players.name_norm END,
        name_at = MAX(excluded.name_at, players.name_at),
        seen_at = excluded.seen_at,
        trophies = CASE WHEN excluded.trophies > 0 THEN excluded.trophies ELSE players.trophies END,
        clan_name = CASE WHEN @clanKnown = 1 AND excluded.name_at >= players.name_at THEN excluded.clan_name ELSE players.clan_name END`),
    search: db.prepare(`
      SELECT tag, name, trophies, clan_name AS clan FROM players
      WHERE name_norm LIKE @like ESCAPE '\\'
      ORDER BY (name_norm = @exact) DESC, (name_norm LIKE @prefix ESCAPE '\\') DESC, trophies DESC, seen_at DESC
      LIMIT @limit`),
    byTag: db.prepare('SELECT tag, name, trophies, clan_name AS clan FROM players WHERE tag = ?'),
    nameNow: db.prepare('SELECT name, name_at AS at FROM players WHERE tag = ?'),
    nameKeep: db.prepare(`INSERT INTO player_names (tag, name, last_at) VALUES (?, ?, ?)
      ON CONFLICT(tag, name) DO UPDATE SET last_at = MAX(last_at, excluded.last_at)`),
    namesOf: db.prepare('SELECT name, last_at AS t FROM player_names WHERE tag = ? ORDER BY last_at DESC LIMIT 40'),
    namesPrune: db.prepare('DELETE FROM player_names WHERE tag NOT IN (SELECT tag FROM players)'),
    voteSet: db.prepare(`INSERT INTO profile_votes (tag, voter, value, at) VALUES (?, ?, ?, ?)
      ON CONFLICT(tag, voter) DO UPDATE SET value = excluded.value, at = excluded.at`),
    voteDel: db.prepare('DELETE FROM profile_votes WHERE tag = ? AND voter = ?'),
    voteSum: db.prepare('SELECT SUM(value = 1) AS up, SUM(value = -1) AS down FROM profile_votes WHERE tag = ?'),
    voteMine: db.prepare('SELECT value FROM profile_votes WHERE tag = ? AND voter = ?'),
    count: db.prepare('SELECT COUNT(*) AS n FROM players'),
    prune: db.prepare('DELETE FROM players WHERE tag IN (SELECT tag FROM players ORDER BY seen_at ASC LIMIT ?)'),
    // Ein älterer Kampf überschreibt kein neueres Deck; geprüft-Zeit wandert immer mit
    deckSet: db.prepare(`
      INSERT INTO decks (tag, cards, tower, battle_at, checked_at, score) VALUES (@tag, @cards, @tower, @t, @now, @score)
      ON CONFLICT(tag) DO UPDATE SET
        cards = CASE WHEN excluded.battle_at >= decks.battle_at THEN excluded.cards ELSE decks.cards END,
        tower = CASE WHEN excluded.battle_at >= decks.battle_at THEN excluded.tower ELSE COALESCE(decks.tower, '-') END,
        battle_at = MAX(excluded.battle_at, decks.battle_at),
        checked_at = excluded.checked_at,
        score = COALESCE(excluded.score, decks.score)`),
    deckGet: db.prepare('SELECT cards, tower, battle_at AS t, checked_at AS checkedAt, score FROM decks WHERE tag = ?'),
    deckPrune: db.prepare('DELETE FROM decks WHERE checked_at < ?'),
    battleSet: db.prepare('INSERT OR IGNORE INTO battles (tag, t, data) VALUES (?, ?, ?)'),
    // Nur das Neueste je Spieler behalten (MAX_BATTLES); OFFSET liefert den ältesten noch erlaubten Zeitpunkt
    battleTrim: db.prepare('DELETE FROM battles WHERE tag = @tag AND t < (SELECT t FROM battles WHERE tag = @tag ORDER BY t DESC LIMIT 1 OFFSET @keep)'),
    battleAgePrune: db.prepare('DELETE FROM battles WHERE t < ?'),
    battlePage: db.prepare('SELECT data FROM battles WHERE tag = @tag AND t < @before ORDER BY t DESC LIMIT @limit'),
    battleCount: db.prepare('SELECT COUNT(*) AS n, MIN(t) AS oldest FROM battles WHERE tag = ?'),
    battleScan: db.prepare('SELECT tag, t, data FROM battles WHERE (tag, t) > (@tag, @t) ORDER BY tag, t LIMIT @limit'),
    crownAdd: db.prepare('INSERT OR IGNORE INTO crown_battles (tag, t, data) VALUES (?, ?, ?)'),
    crownTrim: db.prepare('DELETE FROM crown_battles WHERE tag = @tag AND t < (SELECT t FROM crown_battles WHERE tag = @tag ORDER BY t DESC LIMIT 1 OFFSET @keep)'),
    crownAgePrune: db.prepare('DELETE FROM crown_battles WHERE t < ?'),
    crownOf: db.prepare('SELECT data FROM crown_battles WHERE tag = ? ORDER BY t DESC LIMIT ?'),
    watchView: db.prepare(`INSERT INTO watch (tag, viewed_at) VALUES (?, ?) ON CONFLICT(tag) DO UPDATE SET viewed_at = excluded.viewed_at`),
    watchPolled: db.prepare('UPDATE watch SET polled_at = ? WHERE tag = ?'),
    watchDue: db.prepare('SELECT tag FROM watch WHERE viewed_at > @since AND polled_at < @due ORDER BY polled_at ASC LIMIT @limit'),
    watchPrune: db.prepare('DELETE FROM watch WHERE viewed_at < ?'),
    kvGet: db.prepare('SELECT value, updated_at FROM kv WHERE key = ?'),
    kvSet: db.prepare(`INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`),
    muTokenGet: db.prepare('SELECT id FROM mu_tokens WHERE token = ?'),
    muTokenAdd: db.prepare('INSERT INTO mu_tokens (token) VALUES (?)'),
    muTokenAll: db.prepare('SELECT id, token FROM mu_tokens'),
    muAdd: db.prepare('INSERT OR IGNORE INTO mu_battles (id, t, top, a, b, res) VALUES (@id, @t, @top, @a, @b, @res)'),
    // Derselbe Kampf vom besser platzierten Spieler aus gesehen: der bessere Platz gilt (0 = unbekannt zählt nicht)
    muTop: db.prepare('UPDATE mu_battles SET top = @top WHERE id = @id AND @top > 0 AND (top = 0 OR top > @top)'),
    muPrune: db.prepare('DELETE FROM mu_battles WHERE t < ?'),
    muSince: db.prepare('SELECT t, top, a, b, res FROM mu_battles WHERE t >= ? ORDER BY t'),
    // Seitenweise ab (t, id) — nutzt idx_mu_t (Einträge dort liegen nach t, dann rowid)
    muPage: db.prepare('SELECT id, t, a, b, res FROM mu_battles WHERE t >= @t AND (t > @t OR id > @id) ORDER BY t, id LIMIT @limit'),
    muCount: db.prepare('SELECT COUNT(*) AS n, MIN(t) AS oldest, MAX(t) AS newest FROM mu_battles'),
    clanView: db.prepare('INSERT INTO clan_watch (tag, viewed_at) VALUES (?, ?) ON CONFLICT(tag) DO UPDATE SET viewed_at = excluded.viewed_at'),
    clanPolled: db.prepare('UPDATE clan_watch SET polled_at = ? WHERE tag = ?'),
    // Nur die zuletzt angesehenen @max Clans werden verfolgt — sonst könnte jemand mit vielen Aufrufen den Schlüssel leerziehen
    clanDue: db.prepare(`SELECT tag FROM clan_watch
      WHERE viewed_at > @since AND polled_at < @due
        AND tag IN (SELECT tag FROM clan_watch ORDER BY viewed_at DESC LIMIT @max)
      ORDER BY polled_at ASC LIMIT @limit`),
    clanWatchPrune: db.prepare('DELETE FROM clan_watch WHERE viewed_at < ?'),
    clanSnapAdd: db.prepare('INSERT OR REPLACE INTO clan_snaps (tag, t, data) VALUES (?, ?, ?)'),
    clanSnapRange: db.prepare('SELECT t, data FROM clan_snaps WHERE tag = @tag AND t >= @since AND t <= @until ORDER BY t ASC LIMIT @limit'),
    clanSnapCount: db.prepare('SELECT COUNT(*) AS n, MIN(t) AS oldest, MAX(t) AS newest FROM clan_snaps WHERE tag = ?'),
    // Ausdünnen: vor @cut nur den letzten Schnappschuss je Clan und UTC-Tag behalten; vor @old alles weg
    clanSnapThin: db.prepare(`DELETE FROM clan_snaps WHERE t < @cut
      AND (tag, t) NOT IN (SELECT tag, MAX(t) FROM clan_snaps WHERE t < @cut GROUP BY tag, t / 86400000)`),
    clanSnapOld: db.prepare('DELETE FROM clan_snaps WHERE t < ?'),
  };
  return db;
}

/** Vergleichsform eines Namens: klein, ohne Akzente, Leerraum zusammengezogen. */
function normalizeName(name) {
  return String(name || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

const escapeLike = (s) => s.replace(/[\\%_]/g, (ch) => `\\${ch}`);

/**
 * Spieler merken.
 * @param {Array<{tag: string, name: string, trophies?: number, clan?: string|null, at?: number}>} list
 *   `clan` weglassen (undefined), wenn unbekannt; '' oder null heißt „ohne Clan". `at` = Zeitpunkt, zu dem der Name
 *   galt (Kampfzeit); ohne gilt „jetzt". Ein älterer Name ersetzt keinen neueren, beide bleiben als frühere Namen.
 */
function rememberPlayers(list) {
  if (!Array.isArray(list) || !list.length) return;
  open();
  const now = Date.now();
  const run = db.transaction((rows) => {
    for (const p of rows) {
      const norm = normalizeName(p?.name);
      if (!p?.tag || !norm) continue;
      const name = String(p.name).slice(0, 40);
      const at = Number.isFinite(p.at) && p.at > 0 ? Math.min(p.at, now) : now;
      const cur = stmts.nameNow.get(p.tag);
      if (cur && cur.name !== name) {
        // Der unterlegene Name kommt in die Liste der früheren Namen
        if (at >= cur.at) stmts.nameKeep.run(p.tag, cur.name, cur.at);
        else stmts.nameKeep.run(p.tag, name, at);
      }
      stmts.upsert.run({
        tag: p.tag, name, norm, at,
        trophies: Number.isFinite(p.trophies) ? Math.max(0, Math.round(p.trophies)) : 0,
        clan: p.clan ? String(p.clan).slice(0, 40) : '',
        clanKnown: p.clan === undefined ? 0 : 1,
        now,
      });
    }
  });
  run(list);
  writesSincePrune += list.length;
  if (writesSincePrune >= 5000) {
    writesSincePrune = 0;
    if (stmts.count.get().n > MAX_ROWS) {
      stmts.prune.run(PRUNE_ROWS);
      stmts.namesPrune.run();
    }
  }
}

/** Frühere Namen eines Spielers, zuletzt getragene zuerst: [{ name, t }] — ohne den aktuellen. */
function formerNames(tag) {
  open();
  const cur = stmts.nameNow.get(tag)?.name;
  return stmts.namesOf.all(tag).filter((r) => r.name !== cur).slice(0, 20);
}

// ── Bewertungen ──────────────────────────────────────────────────────────────
/** Stimme setzen: 1 = Daumen hoch, -1 = runter, 0 = zurücknehmen. */
function setVote(tag, voter, value) {
  open();
  if (!tag || !voter) return;
  if (value === 1 || value === -1) stmts.voteSet.run(tag, String(voter), value, Date.now());
  else stmts.voteDel.run(tag, String(voter));
}

/** { up, down, mine } — mine: eigene Stimme (1/-1/0), 0 ohne Login. */
function voteSummary(tag, voter) {
  open();
  const sum = stmts.voteSum.get(tag);
  const mine = voter ? stmts.voteMine.get(tag, String(voter))?.value || 0 : 0;
  return { up: sum?.up || 0, down: sum?.down || 0, mine };
}

// Suche mit mehreren Wörtern: jedes Wort muss im Namen vorkommen (Abfrage je Wortanzahl einmal vorbereitet)
const wordSearchStmts = new Map();
function wordSearchStmt(n) {
  if (!wordSearchStmts.has(n)) {
    const where = Array.from({ length: n }, (_, i) => `name_norm LIKE @w${i} ESCAPE '\\'`).join(' AND ');
    wordSearchStmts.set(n, db.prepare(`
      SELECT tag, name, trophies, clan_name AS clan FROM players
      WHERE ${where}
      ORDER BY (name_norm = @exact) DESC, (name_norm LIKE @prefix ESCAPE '\\') DESC, trophies DESC, seen_at DESC
      LIMIT @limit`));
  }
  return wordSearchStmts.get(n);
}

/**
 * Spieler nach Namen: exakte Treffer zuerst, dann Namensanfang, dann nach Trophäen. Mehrere Wörter werden einzeln
 * gesucht — Namen trennen Wörter oft mit Zeichen statt Leerzeichen („Alex❤️Luisa" findet man mit „Alex Luisa").
 */
function searchPlayers(query, limit = 8) {
  const norm = normalizeName(query);
  if (norm.length < 2) return [];
  open();
  const esc = escapeLike(norm);
  const lim = Math.max(1, Math.min(25, limit));
  const words = [...new Set(norm.split(/[^\p{L}\p{N}]+/u).filter(Boolean))].slice(0, 6);
  if (words.length < 2) return stmts.search.all({ like: `%${esc}%`, prefix: `${esc}%`, exact: norm, limit: lim });
  const params = { exact: norm, prefix: `${escapeLike(words[0])}%`, limit: lim };
  words.forEach((w, i) => { params[`w${i}`] = `%${escapeLike(w)}%`; });
  return wordSearchStmt(words.length).all(params);
}

/** Ein gemerkter Spieler (für die Link-Vorschau) oder null. */
function getPlayer(tag) {
  open();
  return stmts.byTag.get(String(tag || '').toUpperCase()) || null;
}

// ── Ranked-Decks je Spieler (für die Ranglisten) ─────────────────────────────
// Gespeichert wird knapp: bekannte Karten als { id, v } (v = aktive Form), unbekannte mit Namen und Bild.
const DECK_KEEP_MS = 45 * 24 * 60 * 60 * 1000;
const packCard = (c) => (c.id ? { id: c.id, ...(c.variant ? { v: c.variant } : null) } : { n: c.name, c: c.icon || null });
const unpackCard = (c) => (c.id ? { id: c.id, ...(c.v ? { variant: c.v } : null) } : { id: null, name: c.n, icon: c.c });

/**
 * Decks merken.
 * @param {Array<{ tag: string, t: number, cards: Array, score?: number }>} list  cards leer = „geprüft, kein Ranked-Deck
 *   im Log"; score = Medaillenstand des Spielers zum Zeitpunkt der Prüfung, falls bekannt (sonst bleibt der gemerkte)
 */
function rememberDecks(list) {
  if (!Array.isArray(list) || !list.length) return;
  open();
  const now = Date.now();
  db.transaction((rows) => {
    for (const d of rows) {
      if (!d?.tag || !Array.isArray(d.cards)) continue;
      // '-' = geprüft, aber ohne Turmtruppe; NULL steht nur in Zeilen aus der Zeit vor der Turmtruppe
      const tower = d.tower?.name ? JSON.stringify({ n: d.tower.name, c: d.tower.icon || null }) : '-';
      stmts.deckSet.run({ tag: d.tag, cards: JSON.stringify(d.cards.map(packCard)), tower, t: Number(d.t) || 0, now, score: Number.isFinite(d.score) ? d.score : null });
    }
  })(list);
  writesSincePrune += list.length;
  if (writesSincePrune >= 5000) stmts.deckPrune.run(now - DECK_KEEP_MS);
}

/**
 * Gemerktes Deck: { cards, tower, towerChecked, t, checkedAt, score } — cards leer, wenn beim letzten Blick kein Ranked-Deck
 * im Log stand; tower null, wenn unbekannt; towerChecked false bei Zeilen aus der Zeit, bevor der Speicher die
 * Turmtruppe kannte (die holt die Rangliste einmal neu). null = nie geprüft.
 */
function getDeck(tag) {
  open();
  const row = stmts.deckGet.get(tag);
  if (!row) return null;
  try {
    const tw = row.tower && row.tower !== '-' ? JSON.parse(row.tower) : null;
    return {
      cards: JSON.parse(row.cards).map(unpackCard), tower: tw ? { id: null, name: tw.n, icon: tw.c } : null,
      towerChecked: row.tower !== null, t: row.t, checkedAt: row.checkedAt, score: row.score ?? null,
    };
  } catch {
    return null;
  }
}

// ── Kampf-Verlauf je Spieler ─────────────────────────────────────────────────
// Die API liefert nur die letzten rund 30 Kämpfe. Jeder Kampf, der hier vorbeikommt (Profilabruf, Nachladen der
// Ranglisten-Decks, Meta-Sammler, Beobachtung angesehener Profile), wird beim Spieler gemerkt — so wächst der
// Verlauf über die 30 hinaus. Gespeichert ist der aufbereitete Kampf (scoutShape.shapeBattles) aus Sicht dieses
// Spielers, gepackt (deflate); ein Kampf wiegt gemessen rund 0,8 KB (Nov. 2026), 200 je Spieler sind also ~170 KB.
const MAX_BATTLES = 200;
const BATTLE_KEEP_MS = 120 * 24 * 60 * 60 * 1000;
let battleWrites = 0;

// Crown Series: das Duell-Set im Profil entsteht aus den letzten Duellen (Frontend analysis.crownSet). Wer viel Ranked
// spielt, schiebt sie in wenigen Tagen aus Battlelog und Verlauf — deshalb bleiben die letzten MAX_CROWN Duelle eigens
// gemerkt, verkleinert auf das, was das Set braucht (Runden-Decks und Rundenergebnis), gepackt rund 1 KB je Duell.
const MAX_CROWN = 10;
const CROWN_KEEP_MS = 180 * 24 * 60 * 60 * 1000;
const isCrownDuel = (b) => b?.group === 'crown' && Number.isFinite(b.t) && Array.isArray(b.team?.[0]?.decks) && b.team[0].decks.length > 0;
const packCrownDuel = (b) => zlib.deflateRawSync(JSON.stringify({
  t: b.t, group: 'crown', result: b.result, rounds: b.rounds || null, team: [{ tag: b.team[0].tag, decks: b.team[0].decks }],
}));

/**
 * Kämpfe eines Spielers merken. Bekannte (gleicher Zeitpunkt) werden übersprungen.
 * @param {string} tag
 * @param {Array} battles  Ausgabe von shapeBattles für diesen Spieler
 * @returns {number} wie viele neu waren
 */
function rememberBattles(tag, battles) {
  if (!tag || !Array.isArray(battles) || !battles.length) return 0;
  open();
  let added = 0;
  let crown = 0;
  db.transaction((list) => {
    for (const b of list) {
      if (!b || !Number.isFinite(b.t) || b.t <= 0) continue;
      added += stmts.battleSet.run(tag, b.t, zlib.deflateRawSync(JSON.stringify(b))).changes;
      if (isCrownDuel(b)) crown += stmts.crownAdd.run(tag, b.t, packCrownDuel(b)).changes;
    }
    if (added) stmts.battleTrim.run({ tag, keep: MAX_BATTLES - 1 });
    if (crown) stmts.crownTrim.run({ tag, keep: MAX_CROWN - 1 });
  })(battles);
  battleWrites += added;
  if (battleWrites >= 20000) {
    battleWrites = 0;
    stmts.battleAgePrune.run(Date.now() - BATTLE_KEEP_MS);
    stmts.crownAgePrune.run(Date.now() - CROWN_KEEP_MS);
  }
  return added;
}

/** Gemerkte Crown-Series-Duelle eines Spielers, neueste zuerst (verkleinert, siehe packCrownDuel). */
function getCrownBattles(tag) {
  open();
  const out = [];
  for (const row of stmts.crownOf.all(tag, MAX_CROWN)) {
    try { out.push(JSON.parse(zlib.inflateRawSync(row.data).toString('utf8'))); } catch { /* beschädigte Zeile überspringen */ }
  }
  return out;
}

/**
 * Einmaliges Nachtragen (seit Nov. 2026): Crown-Series-Duelle, die schon im Kampf-Verlauf liegen, in den eigenen
 * Speicher übernehmen. Ein Schritt liest höchstens `limit` Zeilen des Verlaufs, damit der Server zwischendurch atmen kann.
 * @param {{ tag: string, t: number } | null} [after]  Fortsetzungspunkt des vorigen Schritts
 * @returns {{ tag: string, t: number } | null}  Fortsetzungspunkt, null = fertig
 */
function crownBackfillStep(after = null, limit = 1000) {
  open();
  const rows = stmts.battleScan.all({ tag: after?.tag ?? '', t: after?.t ?? 0, limit });
  const touched = new Set();
  db.transaction(() => {
    for (const row of rows) {
      let text;
      try { text = zlib.inflateRawSync(row.data).toString('utf8'); } catch { continue; }
      if (!text.includes('"group":"crown"')) continue; // schneller Vorfilter, die meisten Kämpfe sind keine Duelle
      let b;
      try { b = JSON.parse(text); } catch { continue; }
      if (isCrownDuel(b) && stmts.crownAdd.run(row.tag, row.t, packCrownDuel(b)).changes) touched.add(row.tag);
    }
    for (const tag of touched) stmts.crownTrim.run({ tag, keep: MAX_CROWN - 1 });
  })();
  if (rows.length < limit) return null;
  const last = rows[rows.length - 1];
  return { tag: last.tag, t: last.t };
}

/** Gemerkte Kämpfe vor einem Zeitpunkt, neueste zuerst. */
function getBattles(tag, { before = Number.MAX_SAFE_INTEGER, limit = 30 } = {}) {
  open();
  const out = [];
  // Höchstens so viele, wie je Spieler gespeichert werden (die Form-Auswertung liest den ganzen Verlauf)
  for (const row of stmts.battlePage.all({ tag, before, limit: Math.max(1, Math.min(MAX_BATTLES, limit)) })) {
    try { out.push(JSON.parse(zlib.inflateRawSync(row.data).toString('utf8'))); } catch { /* beschädigte Zeile überspringen */ }
  }
  return out;
}

/** Wie viele Kämpfe eines Spielers gemerkt sind und seit wann: { n, oldest }. */
function battleStats(tag) {
  open();
  const row = stmts.battleCount.get(tag);
  return { n: row?.n || 0, oldest: row?.oldest || null };
}

// ── Beobachtung angesehener Profile ──────────────────────────────────────────
// Wer ein Profil aufruft, sorgt dafür, dass es eine Weile weiter beobachtet wird: der Server holt dessen Battlelog
// regelmäßig nach, damit zwischen zwei Besuchen keine Kämpfe verloren gehen (scoutRoutes.js, Beobachter).
function markViewed(tag) {
  open();
  stmts.watchView.run(tag, Date.now());
}

/** Fällige Profile: in den letzten `sinceMs` angesehen und seit `everyMs` nicht mehr abgefragt — die ältesten zuerst. */
function dueWatched({ sinceMs, everyMs, limit }) {
  open();
  const now = Date.now();
  stmts.watchPrune.run(now - sinceMs);
  return stmts.watchDue.all({ since: now - sinceMs, due: now - everyMs, limit }).map((r) => r.tag);
}

function markPolled(tag) {
  open();
  stmts.watchPolled.run(Date.now(), tag);
}

// ── Matchups (Verlauf für den Matchup-Ratgeber) ──────────────────────────────
// Der Meta-Sammler reicht jedes Battlelog der Top-Spieler herein. Gemessen wiegt eine Zeile samt Index rund 85 Byte;
// bei ~10.000 neuen Kämpfen am Tag sind 45 Tage gut 40 MB.
const MU_KEEP_MS = 45 * 24 * 60 * 60 * 1000;
const MU_PRUNE_EVERY_MS = 6 * 60 * 60 * 1000;
const MU_SIDE = 9; // 8 Karten + Turmtruppe
let muTokens = null; // token → id
let muNames = null; // id → token
let muPrunedAt = 0;

function loadMuTokens() {
  if (muTokens) return;
  muTokens = new Map();
  muNames = new Map();
  for (const r of stmts.muTokenAll.all()) { muTokens.set(r.token, r.id); muNames.set(r.id, r.token); }
}

function muTokenId(token) {
  loadMuTokens();
  let id = muTokens.get(token);
  if (id === undefined) {
    id = stmts.muTokenGet.get(token)?.id ?? Number(stmts.muTokenAdd.run(token).lastInsertRowid);
    muTokens.set(token, id);
    muNames.set(id, token);
  }
  return id;
}

function packSide(side) {
  const buf = Buffer.alloc(MU_SIDE * 2);
  side.cards.slice(0, 8).forEach((tok, i) => buf.writeUInt16LE(muTokenId(tok), i * 2));
  buf.writeUInt16LE(side.tower ? muTokenId(side.tower) : 0, 16);
  return buf;
}

function unpackSide(buf) {
  const ids = [];
  for (let i = 0; i < MU_SIDE; i += 1) ids.push(buf.readUInt16LE(i * 2));
  return { cards: ids.slice(0, 8).map((id) => muNames.get(id) || '?'), tower: ids[8] ? muNames.get(ids[8]) || null : null };
}

/** 48-Bit-Prüfsumme als Zeilen-ID (passt sicher in eine JS-Zahl; Kollisionen bei Millionen Zeilen praktisch ausgeschlossen). */
const muId = (key) => crypto.createHash('sha1').update(key).digest().readUIntBE(0, 6);

/**
 * Ranked-Kämpfe eines Battlelogs für die Matchups merken; bekannte Kämpfe zählen einmal.
 * @param {Array} battles  Ausgabe von shapeBattles
 * @param {number} [top]   Platz des Spielers, dessen Battlelog es ist (0 = unbekannt)
 * @returns {number} wie viele Kämpfe neu waren
 */
function rememberMatchups(battles, top = 0) {
  const rows = history.matchupRows(battles);
  if (!rows.length) return 0;
  open();
  const place = Number.isFinite(top) && top > 0 ? Math.min(Math.round(top), 1e6) : 0;
  let added = 0;
  db.transaction((list) => {
    for (const r of list) {
      const id = muId(r.key);
      const changes = stmts.muAdd.run({ id, t: r.t, top: place, a: packSide(r.a), b: packSide(r.b), res: r.res }).changes;
      if (changes) added += 1; else stmts.muTop.run({ id, top: place });
    }
  })(rows);
  const now = Date.now();
  if (now - muPrunedAt > MU_PRUNE_EVERY_MS) {
    muPrunedAt = now;
    stmts.muPrune.run(now - MU_KEEP_MS);
  }
  return added;
}

/**
 * Gemerkte Matchups ab einem Zeitpunkt, älteste zuerst: [{ t, top, a: { cards, tower }, b, res }]. Für die spätere
 * Auswertung im Hintergrund gedacht (kann Hunderttausende Zeilen liefern).
 */
function getMatchups({ since = 0 } = {}) {
  open();
  loadMuTokens();
  return stmts.muSince.all(since).map((r) => ({ t: r.t, top: r.top, a: unpackSide(r.a), b: unpackSide(r.b), res: r.res }));
}

/**
 * Alle Matchups ab `since` seitenweise an fn([{ t, a, b, res }]) (a/b wie bei getMatchups), mit einer Pause nach jeder
 * Seite: die Auswertung (scoutMatchups.js) läuft im Serverprozess und soll andere Anfragen nicht spürbar aufhalten.
 * @returns {Promise<number>} Zahl der gelesenen Zeilen
 */
// 2500 Zeilen ≈ 30 ms am Stück (gemessen Nov. 2026 bei 370 000 Zeilen: 3 s insgesamt)
async function forEachMatchupPage(since, fn, { page = 2500 } = {}) {
  open();
  loadMuTokens();
  let cursor = { t: since, id: -1 };
  let total = 0;
  for (;;) {
    const rows = stmts.muPage.all({ ...cursor, limit: page });
    if (!rows.length) break;
    total += rows.length;
    fn(rows.map((r) => ({ t: r.t, a: unpackSide(r.a), b: unpackSide(r.b), res: r.res })));
    const last = rows[rows.length - 1];
    cursor = { t: last.t, id: last.id };
    if (rows.length < page) break;
    await new Promise((resolve) => { setImmediate(resolve); });
  }
  return total;
}

/** { n, oldest, newest } der Matchup-Zeilen. */
function matchupStats() {
  open();
  const r = stmts.muCount.get();
  return { n: r?.n || 0, oldest: r?.oldest ?? null, newest: r?.newest ?? null };
}

// ── Clan-Schnappschüsse (Verlauf für die Clan-Zentrale) ──────────────────────
const DAY_MS = 24 * 60 * 60 * 1000;
const CLAN_FULL_MS = 35 * DAY_MS; // so lange jeder Schnappschuss (fünf Kriegswochen, für Kriegsdecks je Tag)
const CLAN_KEEP_MS = 400 * DAY_MS; // danach einer je Tag, bis hierhin
const CLAN_THIN_EVERY_MS = DAY_MS;
let clanThinnedAt = 0;

/** Ein Clan wurde angesehen: der Sammler verfolgt ihn ab jetzt eine Weile (scoutRoutes.js, pollClans). */
function markClanViewed(tag) {
  open();
  stmts.clanView.run(tag, Date.now());
}

/**
 * Fällige Clans: in den letzten `sinceMs` angesehen, seit `everyMs` nicht abgefragt, unter den `max` zuletzt
 * angesehenen — die am längsten nicht abgefragten zuerst.
 */
function dueClans({ sinceMs, everyMs, limit, max }) {
  open();
  const now = Date.now();
  stmts.clanWatchPrune.run(now - sinceMs);
  return stmts.clanDue.all({ since: now - sinceMs, due: now - everyMs, limit, max }).map((r) => r.tag);
}

function markClanPolled(tag) {
  open();
  stmts.clanPolled.run(Date.now(), tag);
}

/**
 * Schnappschuss speichern (Ausgabe von scoutHistory.packClanSnapshot). Einmal am Tag wird ausgedünnt.
 * @param {number} [t]  Zeitpunkt (Tests); sonst jetzt
 */
function rememberClanSnapshot(tag, packed, t = Date.now()) {
  if (!tag || !packed) return;
  open();
  stmts.clanSnapAdd.run(tag, Math.round(t), zlib.deflateRawSync(JSON.stringify(packed)));
  const now = Date.now();
  if (now - clanThinnedAt > CLAN_THIN_EVERY_MS) {
    clanThinnedAt = now;
    thinClanSnapshots(now);
  }
}

/** Ausdünnen: älter als 35 Tage → einer je Clan und UTC-Tag, älter als 400 Tage → weg. */
function thinClanSnapshots(now = Date.now()) {
  open();
  stmts.clanSnapThin.run({ cut: now - CLAN_FULL_MS });
  stmts.clanSnapOld.run(now - CLAN_KEEP_MS);
}

/** Schnappschüsse eines Clans, älteste zuerst: [{ t, clan, members, race }] (scoutHistory.unpackClanSnapshot). */
function getClanSnapshots(tag, { since = 0, until = Number.MAX_SAFE_INTEGER, limit = 1000 } = {}) {
  open();
  const out = [];
  for (const row of stmts.clanSnapRange.all({ tag, since, until, limit: Math.max(1, Math.min(5000, limit)) })) {
    try { out.push({ t: row.t, ...history.unpackClanSnapshot(JSON.parse(zlib.inflateRawSync(row.data).toString('utf8'))) }); } catch { /* beschädigte Zeile überspringen */ }
  }
  return out;
}

/** { n, oldest, newest } der Schnappschüsse eines Clans. */
function clanSnapshotStats(tag) {
  open();
  const r = stmts.clanSnapCount.get(tag);
  return { n: r?.n || 0, oldest: r?.oldest ?? null, newest: r?.newest ?? null };
}

function getValue(key) {
  open();
  const row = stmts.kvGet.get(key);
  if (!row) return null;
  try {
    return { value: JSON.parse(row.value), updatedAt: row.updated_at };
  } catch {
    return null;
  }
}

function setValue(key, value) {
  open();
  stmts.kvSet.run(key, JSON.stringify(value), Date.now());
}

/** Nur für Tests: Verbindung schließen, damit die Datei gelöscht werden kann. */
function close() {
  if (db) db.close();
  db = null;
  stmts = null;
  wordSearchStmts.clear();
  muTokens = null;
  muNames = null;
  muPrunedAt = 0;
  clanThinnedAt = 0;
}

module.exports = {
  rememberPlayers, searchPlayers, getPlayer, formerNames, setVote, voteSummary, rememberDecks, getDeck, getValue, setValue, normalizeName, close,
  rememberBattles, getBattles, battleStats, getCrownBattles, crownBackfillStep, markViewed, dueWatched, markPolled,
  rememberMatchups, getMatchups, forEachMatchupPage, matchupStats,
  markClanViewed, dueClans, markClanPolled, rememberClanSnapshot, thinClanSnapshots, getClanSnapshots, clanSnapshotStats,
};
