const Database = require('better-sqlite3');
const path = require('path');

// Pfad zu deiner Datenbank (passe ihn an, falls dein data-Ordner woanders liegt)
const dbPath = path.join(__dirname, 'banned_cards.db'); 
const db = new Database(dbPath);

// Das zwingt SQLite, die .wal Datei in die .db Datei zu schreiben
db.pragma('wal_checkpoint(TRUNCATE)');
db.close();

console.log("Erfolgreich! Alle Daten sind jetzt in der Haupt-.db Datei.");