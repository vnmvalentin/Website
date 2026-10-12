// lobbyPersistence.js — Lobbys überleben einen Backend-Neustart (Stufe 1).
//
// Die Lobbys liegen sonst nur im Arbeitsspeicher (core/lobbies.js). Hier wird ihr Zustand beim
// Herunterfahren (und zur Sicherheit regelmäßig) in eine SQLite-Datei geschrieben und beim Start
// wieder geladen. Gespeichert wird nur die LOBBY — eine laufende Runde nicht: deren Zustand hängt an
// Timern und Tick-Schleifen der einzelnen Modi. Lief beim Neustart eine Runde, kommt die Lobby wie
// nach "Spiel abbrechen" zurück (gleiche Spieler, Einstellungen und Verlauf, Decks geleert).
//
// Die Spieler kommen über den vorhandenen Reconnect-Weg zurück: der Browser tritt nach dem Neustart
// mit Lobby-Code + Name automatisch wieder bei (useClashSocket.js), die Route ordnet ihn über den
// Namen seinem gespeicherten Platz zu (clash:joinLobby, Zweig "Gnadenfrist").
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// Umbiegbar für Prüfstände — nie gegen die echte Datei testen.
const DB_PATH = process.env.CR_LOBBY_DB || path.join(__dirname, '../data/cr_lobbies.db');

let db = null;
function getDb() {
  if (db) return db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.exec(`CREATE TABLE IF NOT EXISTS cr_lobby_snapshots (
    code TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    saved_at INTEGER NOT NULL
  )`);
  return db;
}

// Laufzeit-Felder ohne Bedeutung nach einem Neustart (Timer-Handles, laufende Walze, Runde).
const RUNTIME_KEYS = new Set(['game', 'randomSpin', 'randomSpinTimer', 'tournamentStartTimer']);

function replacer(key, value) {
  if (RUNTIME_KEYS.has(key)) return undefined;
  if (typeof value === 'function') return undefined;
  // Node-Timer (setTimeout/setInterval) sind Objekte mit eigener Klasse — nicht speicherbar
  if (value && typeof value === 'object' && (value.constructor?.name === 'Timeout' || value.constructor?.name === 'Immediate')) return undefined;
  return value;
}

/**
 * Lobby -> speicherbarer Zustand, oder null wenn sie nicht gespeichert werden soll.
 * Turnier-Lobbys bleiben außen vor: Spieler, Seiten und Start steuert dort der Match-Raum
 * (tournament/matchRoom.js) mit eigenem Zustand — eine halb wiederhergestellte Kopie würde mit
 * dessen Ablauf kollidieren.
 */
function serializeLobby(lobby) {
  if (!lobby || lobby.tournament) return null;
  const players = (lobby.players || []).filter((p) => !p.isAdmin && !p.left);
  if (!players.some((p) => !p.isBot)) return null;
  const copy = JSON.parse(JSON.stringify({ ...lobby, players }, replacer));
  copy.wasInterrupted = !!(lobby.started && lobby.game && !lobby.game.finished);
  copy.started = false;
  // Wie clash:restartLobby: Spielstand der Spieler leeren
  for (const p of copy.players) {
    p.deck = [];
    p.elixir = lobby.startElixir ?? 100;
    p.bingoGrid = []; p.bingoTokens = 0; p.completedLines = []; p.tokenAbilities = [];
  }
  return copy;
}

/** Alle (speicherbaren) Lobbys schreiben — ersetzt den kompletten bisherigen Stand. */
function saveLobbies(lobbies) {
  const rows = [];
  for (const lobby of lobbies.values()) {
    const data = serializeLobby(lobby);
    if (data) rows.push([lobby.code, JSON.stringify(data)]);
  }
  const d = getDb();
  const now = Date.now();
  const insert = d.prepare('INSERT INTO cr_lobby_snapshots (code, data, saved_at) VALUES (?, ?, ?)');
  d.transaction(() => {
    d.prepare('DELETE FROM cr_lobby_snapshots').run();
    for (const [code, data] of rows) insert.run(code, data, now);
  })();
  return rows.length;
}

/**
 * Gespeicherte Lobbys laden. Alle echten Spieler kommen als "getrennt" zurück (der Host behält per
 * wasHost seinen Anspruch), Bots bleiben verbunden. Zu alte Stände (länger als maxAgeMs gespeichert)
 * werden verworfen — nach einem tagelangen Stillstand will niemand mehr in seine alte Lobby.
 * Leert die Tabelle danach, damit ein zweiter Start dieselben Lobbys nicht noch einmal anlegt.
 * @returns Array der wiederhergestellten Lobby-Objekte
 */
function loadLobbies({ maxAgeMs, now = Date.now() } = {}) {
  const d = getDb();
  const rows = d.prepare('SELECT code, data, saved_at FROM cr_lobby_snapshots').all();
  d.prepare('DELETE FROM cr_lobby_snapshots').run();
  const out = [];
  for (const row of rows) {
    if (maxAgeMs && now - row.saved_at > maxAgeMs) continue;
    let lobby;
    try { lobby = JSON.parse(row.data); } catch { continue; }
    if (!lobby?.code || !Array.isArray(lobby.players)) continue;
    lobby.game = null;
    lobby.started = false;
    lobby.randomSpin = null;
    lobby.restoredAt = now;
    for (const p of lobby.players) {
      if (p.isBot) continue;
      p.disconnected = true;
      p.disconnectedAt = now;
      p.restored = true;
      if (lobby.host === p.id) p.wasHost = true;
    }
    out.push(lobby);
  }
  return out;
}

module.exports = { serializeLobby, saveLobbies, loadLobbies, DB_PATH };
