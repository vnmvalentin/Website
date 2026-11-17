// streamToolMedia.js — eigene Töne und Bilder für die Alerts (Abo-Extra, Ausbauplan „premium-wert“).
//
// Hochgeladen wird roh (ein Request je Datei). Der Typ zählt nur, wenn ihn die ersten Bytes bestätigen — der
// angegebene Content-Type oder Dateiname spielt keine Rolle. Gespeichert unter Backend/data/stream-tool-media/<user>/
// (STREAM_TOOL_MEDIA_DIR für Prüfläufe), die Liste in stream_tool.db. Ausgeliefert unter einer nicht erratbaren ID,
// damit die OBS-Quelle sie ohne Anmeldung laden kann.
const fs = require("fs");
const path = require("path");
const { nanoid } = require("nanoid");
const { db } = require("./streamToolStore");
const { DATA_DIR } = require("../../lib/dataDir");

// Absolut, weil res.sendFile keinen relativen Pfad nimmt
const MEDIA_DIR = path.resolve(process.env.STREAM_TOOL_MEDIA_DIR || path.join(DATA_DIR, "stream-tool-media"));
const LIMITS = {
  image: 3 * 1024 * 1024,
  sound: 2 * 1024 * 1024,
  files: 30,
  total: 30 * 1024 * 1024,
};

db.exec(`CREATE TABLE IF NOT EXISTS stream_tool_media (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
)`);

const q = {
  byId: db.prepare("SELECT * FROM stream_tool_media WHERE id = ?"),
  byUser: db.prepare("SELECT * FROM stream_tool_media WHERE user_id = ? ORDER BY created_at DESC"),
  usage: db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(size), 0) AS bytes FROM stream_tool_media WHERE user_id = ?"),
  insert: db.prepare("INSERT INTO stream_tool_media (id, user_id, kind, mime, size, name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"),
  remove: db.prepare("DELETE FROM stream_tool_media WHERE id = ? AND user_id = ?"),
};

const ascii = (buf, start, end) => buf.subarray(start, end).toString("latin1");

/**
 * Dateityp an den ersten Bytes. Nur Formate, die Browser und OBS sicher abspielen bzw. zeigen.
 * @returns {{ kind: "image"|"sound", mime: string, ext: string } | null}
 */
function detectType(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf[0] === 0x89 && ascii(buf, 1, 4) === "PNG") return { kind: "image", mime: "image/png", ext: "png" };
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { kind: "image", mime: "image/jpeg", ext: "jpg" };
  if (ascii(buf, 0, 4) === "GIF8") return { kind: "image", mime: "image/gif", ext: "gif" };
  if (ascii(buf, 0, 4) === "RIFF" && ascii(buf, 8, 12) === "WEBP") return { kind: "image", mime: "image/webp", ext: "webp" };
  if (ascii(buf, 0, 4) === "RIFF" && ascii(buf, 8, 12) === "WAVE") return { kind: "sound", mime: "audio/wav", ext: "wav" };
  if (ascii(buf, 0, 4) === "OggS") return { kind: "sound", mime: "audio/ogg", ext: "ogg" };
  if (ascii(buf, 0, 3) === "ID3" || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)) return { kind: "sound", mime: "audio/mpeg", ext: "mp3" };
  return null;
}

const cleanName = (s) => String(s || "")
  .replace(/[\u0000-\u001f\u007f<>"'`\\/]+/g, " ")
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, 60);

const publicRow = (r) => ({ id: r.id, kind: r.kind, mime: r.mime, size: r.size, name: r.name, createdAt: r.created_at });

/**
 * Datei speichern.
 * @returns {{ media: object } | { error: string }}  error: media_type | media_too_big | media_quota
 */
function save(userId, buf, name) {
  const type = detectType(buf);
  if (!type) return { error: "media_type" };
  if (buf.length > LIMITS[type.kind]) return { error: "media_too_big" };
  const used = q.usage.get(String(userId));
  if (used.n >= LIMITS.files || used.bytes + buf.length > LIMITS.total) return { error: "media_quota" };
  const id = nanoid(16);
  const dir = path.join(MEDIA_DIR, String(userId).replace(/[^0-9a-z_-]/gi, ""));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${id}.${type.ext}`), buf);
  q.insert.run(id, String(userId), type.kind, type.mime, buf.length, cleanName(name), Date.now());
  return { media: publicRow(q.byId.get(id)) };
}

const list = (userId) => q.byUser.all(String(userId)).map(publicRow);

function filePath(row) {
  const ext = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp", "audio/wav": "wav", "audio/ogg": "ogg", "audio/mpeg": "mp3" }[row.mime];
  return path.join(MEDIA_DIR, String(row.user_id).replace(/[^0-9a-z_-]/gi, ""), `${row.id}.${ext}`);
}

/** @returns {boolean} ob es die Datei gab */
function remove(userId, id) {
  const row = q.byId.get(String(id));
  if (!row || row.user_id !== String(userId)) return false;
  q.remove.run(row.id, String(userId));
  try { fs.unlinkSync(filePath(row)); } catch { /* schon weg */ }
  return true;
}

/** Für die öffentliche Auslieferung: Pfad und Typ, oder null. */
function fileOf(id) {
  if (!/^[A-Za-z0-9_-]{16}$/.test(String(id || ""))) return null;
  const row = q.byId.get(String(id));
  if (!row) return null;
  const p = filePath(row);
  return fs.existsSync(p) ? { path: p, mime: row.mime } : null;
}

/** Belegter Platz, für die Anzeige im Editor. */
function usage(userId) {
  const u = q.usage.get(String(userId));
  return { files: u.n, bytes: u.bytes };
}

module.exports = { LIMITS, MEDIA_DIR, detectType, save, list, remove, fileOf, usage };
