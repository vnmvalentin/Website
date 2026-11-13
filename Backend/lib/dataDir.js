// lib/dataDir.js — der eine Ort für Live-Daten: Backend/data/.
//
// Datenbanken, Tokens, Schlüssel und Zustandsdateien liegen alle hier (deploy.sh und .gitignore lassen den Ordner aus).
// Bis November 2026 hatten einige Bereiche einen eigenen <bereich>/data/-Ordner. zieheAlteDatenUm() holt deren Dateien
// beim Start einmalig hierher — VOR dem ersten require eines Speichers, weil die meisten ihre Datenbank schon beim
// Laden öffnen. Jeder Dienst zieht nur seine eigenen Dateien um (statusWatch läuft als eigener Prozess).
//
// Regeln beim Umzug:
// - Die Datei am ALTEN Pfad ist die echte: genau dort hat der bisherige Code gelesen und geschrieben.
// - Eine SQLite-Datenbank zieht mit -wal/-shm/-journal um. Liegt am Ziel schon etwas mit dem Namen (z. B. verwaiste
//   -wal-Dateien einer früheren Kopie), wird es zu <name>.alt-<zeit> umbenannt, nie gelöscht und nie mit der echten
//   Datenbank vermischt — ein fremdes WAL würde SQLite beim Öffnen sonst einspielen.
// - Klappt ein Umbenennen nicht (unter Windows z. B., solange ein anderer Prozess die Datei offen hat), bricht der Start
//   ab, statt still mit einer leeren neuen Datenbank weiterzulaufen.

const fs = require('fs');
const path = require('path');

const BACKEND_DIR = path.join(__dirname, '..');
const DATA_DIR = path.join(BACKEND_DIR, 'data');

/** Pfad einer Datei im Datenordner. */
function dataPath(...teile) {
  return path.join(DATA_DIR, ...teile);
}

// [alter Pfad relativ zu Backend/, neuer Name in data/]
const UMZUG = {
  hauptdienst: [
    ['analytics/data/analytics.db', 'analytics.db'],
    ['clashRoyale/data/banned_cards.db', 'banned_cards.db'],
    ['clashRoyale/data/cr_friends.db', 'cr_friends.db'],
    ['clashRoyale/data/cr_lobbies.db', 'cr_lobbies.db'],
    ['clashRoyale/data/cr_presets.db', 'cr_presets.db'],
    ['clashRoyale/data/cr_profiles.db', 'cr_profiles.db'],
    ['clashRoyale/data/cr_streamer.db', 'cr_streamer.db'],
    ['clashRoyale/data/cr_tournaments.db', 'cr_tournaments.db'],
    ['clashRoyale/data/cr_wintracker.db', 'cr_wintracker.db'],
    // eigener Name: data/twitch_token.json ist eine veraltete Altkopie, die niemand mehr liest
    ['garden/data/twitch_token.json', 'garden_twitch_token.json'],
    ['streamScenes/data/stream_scenes.db', 'stream_scenes.db'],
    ['streamTool/data/stream_tool.db', 'stream_tool.db'],
    ['streamTool/data/stream_tool.key', 'stream_tool.key'],
  ],
  // maintenance.json zieht nicht mit: das Wartungsfenster läuft nach drei Minuten ab, deploy.sh schreibt ein neues.
  statusWatch: [
    ['statusWatch/data/status_state.json', 'status_state.json'],
    ['statusWatch/data/updates_state.json', 'updates_state.json'],
  ],
};

const SQLITE_BEGLEITER = ['-wal', '-shm', '-journal'];

function gruppe(datei) {
  return datei.endsWith('.db') ? [datei, ...SQLITE_BEGLEITER.map((s) => datei + s)] : [datei];
}

/**
 * Zieht die Dateien eines Dienstes aus den alten Bereichsordnern nach data/.
 * @param {'hauptdienst'|'statusWatch'} dienst
 * @param {{ backendDir?: string, log?: (msg: string) => void }} [opt]  backendDir nur für Tests
 * @returns {string[]} umgezogene Hauptdateien (neue Namen)
 */
function zieheAlteDatenUm(dienst, { backendDir = BACKEND_DIR, log = (m) => console.log(m) } = {}) {
  const liste = UMZUG[dienst];
  if (!liste) throw new Error(`zieheAlteDatenUm: unbekannter Dienst "${dienst}"`);
  const zielOrdner = path.join(backendDir, 'data');
  const stempel = new Date().toISOString().replace(/[:.]/g, '-');
  const umgezogen = [];

  for (const [alt, neu] of liste) {
    const quelle = path.join(backendDir, alt);
    if (!fs.existsSync(quelle)) continue;
    const ziel = path.join(zielOrdner, neu);
    fs.mkdirSync(zielOrdner, { recursive: true });
    try {
      // Erst alles beiseitelegen, was am Ziel im Weg liegt (auch einzelne -wal/-shm ohne Datenbank) …
      for (const z of gruppe(ziel)) {
        if (fs.existsSync(z)) {
          fs.renameSync(z, `${z}.alt-${stempel}`);
          log(`[Daten] ${path.relative(backendDir, z)} lag im Weg → ${path.basename(z)}.alt-${stempel}`);
        }
      }
      // … dann die echte Datei samt Begleitern verschieben.
      const quellen = gruppe(quelle);
      const ziele = gruppe(ziel);
      quellen.forEach((q, i) => { if (fs.existsSync(q)) fs.renameSync(q, ziele[i]); });
    } catch (err) {
      throw new Error(
        `[Daten] Umzug ${alt} → data/${neu} gescheitert (${err.code || err.message}). ` +
        'Läuft noch ein anderer Backend-Prozess mit diesen Dateien? Erst beenden, dann neu starten.'
      );
    }
    log(`[Daten] ${alt} → data/${neu}`);
    umgezogen.push(neu);
    // Leeren alten Ordner aufräumen; ist noch etwas drin, bleibt er stehen.
    try { fs.rmdirSync(path.dirname(quelle)); } catch { /* nicht leer oder schon weg */ }
  }
  return umgezogen;
}

module.exports = { DATA_DIR, dataPath, zieheAlteDatenUm, UMZUG };
