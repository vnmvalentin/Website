// streamToolStore.js — Stream-Tool "Abstimmungen & Vorhersagen": Overlay-Key,
// Widget-Konfiguration und der Twitch-Token des Streamers.
//
// Der Token wird verschlüsselt abgelegt (AES-256-GCM). Grund: die .db-Dateien in
// Backend/data liegen im Git-Repo — ein Klartext-Token würde damit in der History
// landen. Diese DB ist zusätzlich per .gitignore ausgenommen; die Verschlüsselung
// ist der zweite Riegel (Backups, Kopien, versehentliches force-add).
const Database = require('better-sqlite3');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'stream_tool.db'));
db.pragma('journal_mode = WAL');

db.exec(`CREATE TABLE IF NOT EXISTS stream_tool_settings (
    user_id TEXT PRIMARY KEY,
    overlay_key TEXT UNIQUE NOT NULL,
    twitch_login TEXT NOT NULL DEFAULT '',
    token_enc TEXT NOT NULL DEFAULT '',
    token_updated_at INTEGER NOT NULL DEFAULT 0,
    config TEXT NOT NULL DEFAULT '',
    cache TEXT NOT NULL DEFAULT '',
    last_fetched INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT 0
)`);

// Erteilte Scopes merken, damit das Dashboard sagen kann, warum ein Ziel-Modul
// leer bleibt (Follower-/Abo-Rechte kamen nach dem ersten Release dazu).
try { db.exec("ALTER TABLE stream_tool_settings ADD COLUMN scopes TEXT NOT NULL DEFAULT ''"); } catch { /* Spalte existiert bereits */ }

// Zuletzt erkannter Raid samt ausgewähltem Clip. Bewusst eine eigene Spalte und
// nicht im cache-Feld: der cache wird bei jedem Twitch-Abgleich überschrieben,
// der Raid darf davon nicht mitgerissen werden.
try { db.exec("ALTER TABLE stream_tool_settings ADD COLUMN raid_event TEXT NOT NULL DEFAULT ''"); } catch { /* Spalte existiert bereits */ }

// Laufende Sendung und die Chat-Ereignisse dazu (Modul "Stream-Statistik").
// Ebenfalls eigene Spalte: der Chat-Bot schreibt hier im Sekundentakt hinein,
// während der Twitch-Abgleich den cache überschreibt.
try { db.exec("ALTER TABLE stream_tool_settings ADD COLUMN stats TEXT NOT NULL DEFAULT ''"); } catch { /* Spalte existiert bereits */ }

// ── Token-Verschlüsselung ────────────────────────────────────────────────────
// Schlüssel kommt aus STREAM_TOOL_SECRET. Fehlt die Variable, wird einmalig ein
// Schlüssel neben der DB erzeugt (Datei ist ebenfalls gitignored) — so funktioniert
// die Installation ohne Konfiguration, ohne den Token im Klartext abzulegen.
function loadKey() {
  const fromEnv = process.env.STREAM_TOOL_SECRET;
  if (fromEnv) return crypto.createHash('sha256').update(String(fromEnv)).digest();

  const keyFile = path.join(dataDir, 'stream_tool.key');
  try {
    if (fs.existsSync(keyFile)) return Buffer.from(fs.readFileSync(keyFile, 'utf8').trim(), 'hex');
  } catch { /* unlesbar -> neu erzeugen */ }

  const key = crypto.randomBytes(32);
  try {
    fs.writeFileSync(keyFile, key.toString('hex'), { mode: 0o600 });
  } catch (e) {
    console.warn('[stream-tool] Schlüsseldatei nicht schreibbar — Tokens überleben keinen Neustart:', e.message);
  }
  return key;
}

const KEY = loadKey();

function encryptToken(plain) {
  if (!plain) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  // iv:authTag:ciphertext — alles hex, damit es in eine TEXT-Spalte passt
  return [iv.toString('hex'), cipher.getAuthTag().toString('hex'), enc.toString('hex')].join(':');
}

function decryptToken(stored) {
  if (!stored) return '';
  try {
    const [ivHex, tagHex, dataHex] = String(stored).split(':');
    if (!ivHex || !tagHex || !dataHex) return '';
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
  } catch {
    // Falscher Schlüssel (z.B. STREAM_TOOL_SECRET nachträglich geändert) — Token gilt als weg,
    // der Streamer verbindet sich einfach neu.
    return '';
  }
}

module.exports = { db, encryptToken, decryptToken };
