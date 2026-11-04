// discord/loyalty/store.js
// Punkte-System des Discord-Bots: Einstellungen je Server, Kontostand je Server und Mitglied.
// Eigene Datei (wie linkStore.js), damit Prüfstände sie per DISCORD_LOYALTY_DB umbiegen können.
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// DISCORD_LOYALTY_DB biegt den Pfad für Prüfstände um — nie gegen die echte Datei testen.
const dbPath = process.env.DISCORD_LOYALTY_DB || path.join(__dirname, '..', '..', 'data', 'discord_loyalty.db');
if (dbPath !== ':memory:') {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

db.exec(`CREATE TABLE IF NOT EXISTS loyalty_settings (
    guild_id TEXT PRIMARY KEY,
    config TEXT NOT NULL DEFAULT '{}'
)`);
db.exec(`CREATE TABLE IF NOT EXISTS loyalty_users (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    points INTEGER NOT NULL DEFAULT 0,
    wins INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0,
    won_total INTEGER NOT NULL DEFAULT 0,
    lost_total INTEGER NOT NULL DEFAULT 0,
    biggest_win INTEGER NOT NULL DEFAULT 0,
    daily_day TEXT NOT NULL DEFAULT '',
    daily_streak INTEGER NOT NULL DEFAULT 0,
    last_msg_at INTEGER NOT NULL DEFAULT 0,
    voice_minutes INTEGER NOT NULL DEFAULT 0,
    messages INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (guild_id, user_id)
)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_loyalty_rank ON loyalty_users(guild_id, points DESC)');

/* ── Einstellungen ──────────────────────────────────────────────────────── */

const DEFAULTS = Object.freeze({
    enabled: false,
    currency: 'Punkte',
    emoji: '🪙',
    perMessage: 2,          // je Nachricht …
    messageCooldown: 60,    // … höchstens alle so viele Sekunden
    perVoiceMinute: 1,      // je Minute im Voice (mit mindestens einer weiteren Person, nicht taub)
    dailyBase: 100,
    dailyStreakBonus: 20,   // je Tag in Folge, bis zu 7 Tage
    startBalance: 100,
    minBet: 10,
    maxBet: 0,              // 0 = ohne Grenze
    gameChannel: '',        // leer = Spiele überall erlaubt
});

const int = (v, min, max, fallback) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/** Säubert eine Einstellung aus dem Dashboard — nichts Unbekanntes oder Unsinniges landet in der DB. */
function cleanConfig(raw = {}) {
    const d = DEFAULTS;
    return {
        enabled: raw.enabled === true,
        currency: String(raw.currency ?? d.currency).trim().slice(0, 24) || d.currency,
        emoji: String(raw.emoji ?? d.emoji).trim().slice(0, 64),
        perMessage: int(raw.perMessage, 0, 1000, d.perMessage),
        messageCooldown: int(raw.messageCooldown, 0, 3600, d.messageCooldown),
        perVoiceMinute: int(raw.perVoiceMinute, 0, 1000, d.perVoiceMinute),
        dailyBase: int(raw.dailyBase, 0, 1_000_000, d.dailyBase),
        dailyStreakBonus: int(raw.dailyStreakBonus, 0, 1_000_000, d.dailyStreakBonus),
        startBalance: int(raw.startBalance, 0, 1_000_000, d.startBalance),
        minBet: int(raw.minBet, 1, 1_000_000_000, d.minBet),
        maxBet: int(raw.maxBet, 0, 1_000_000_000, d.maxBet),
        gameChannel: /^\d{5,25}$/.test(String(raw.gameChannel || '')) ? String(raw.gameChannel) : '',
    };
}

const getConfigStmt = db.prepare('SELECT config FROM loyalty_settings WHERE guild_id = ?');
function getConfig(guildId) {
    const row = getConfigStmt.get(String(guildId));
    let parsed = {};
    try { parsed = row ? JSON.parse(row.config) : {}; } catch { parsed = {}; }
    return cleanConfig({ ...DEFAULTS, ...parsed });
}

const saveConfigStmt = db.prepare(`INSERT INTO loyalty_settings (guild_id, config) VALUES (?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET config = excluded.config`);
function saveConfig(guildId, raw) {
    const cfg = cleanConfig(raw);
    saveConfigStmt.run(String(guildId), JSON.stringify(cfg));
    return cfg;
}

const enabledGuildsStmt = db.prepare('SELECT guild_id, config FROM loyalty_settings');
/** Server mit eingeschaltetem Punkte-System (für die Voice-Runde). */
function enabledGuilds() {
    return enabledGuildsStmt.all().filter(r => {
        try { return JSON.parse(r.config).enabled === true; } catch { return false; }
    }).map(r => r.guild_id);
}

/* ── Konten ─────────────────────────────────────────────────────────────── */

const getUserStmt = db.prepare('SELECT * FROM loyalty_users WHERE guild_id = ? AND user_id = ?');
const insertUserStmt = db.prepare('INSERT OR IGNORE INTO loyalty_users (guild_id, user_id, points) VALUES (?, ?, ?)');

/** Konto holen; wer noch keins hat, bekommt eins mit dem Startguthaben. */
function getUser(guildId, userId) {
    const g = String(guildId), u = String(userId);
    let row = getUserStmt.get(g, u);
    if (!row) {
        insertUserStmt.run(g, u, getConfig(g).startBalance);
        row = getUserStmt.get(g, u);
    }
    return row;
}

/** Konto ohne Anlegen (für Anzeigen über andere). */
function peekUser(guildId, userId) {
    return getUserStmt.get(String(guildId), String(userId)) || null;
}

const addStmt = db.prepare('UPDATE loyalty_users SET points = MAX(0, points + ?) WHERE guild_id = ? AND user_id = ?');
function addPoints(guildId, userId, delta) {
    getUser(guildId, userId);
    addStmt.run(Math.round(delta), String(guildId), String(userId));
    return getUser(guildId, userId).points;
}

const spendStmt = db.prepare('UPDATE loyalty_users SET points = points - ? WHERE guild_id = ? AND user_id = ? AND points >= ?');
/** Bucht ab, wenn genug da ist. Atomar: zwei gleichzeitige Einsätze können nicht beide durchgehen. */
function spend(guildId, userId, amount) {
    const a = Math.round(amount);
    if (!(a > 0)) return false;
    getUser(guildId, userId);
    return spendStmt.run(a, String(guildId), String(userId), a).changes === 1;
}

const setStmt = db.prepare('UPDATE loyalty_users SET points = ? WHERE guild_id = ? AND user_id = ?');
function setPoints(guildId, userId, points) {
    getUser(guildId, userId);
    setStmt.run(Math.max(0, Math.round(points)), String(guildId), String(userId));
    return getUser(guildId, userId).points;
}

const winStmt = db.prepare(`UPDATE loyalty_users SET wins = wins + 1, won_total = won_total + ?,
    biggest_win = MAX(biggest_win, ?) WHERE guild_id = ? AND user_id = ?`);
const lossStmt = db.prepare('UPDATE loyalty_users SET losses = losses + 1, lost_total = lost_total + ? WHERE guild_id = ? AND user_id = ?');
/** Spielstatistik: net = Gewinn ohne Einsatz (positiv) bzw. verlorener Einsatz (negativ). */
function recordGame(guildId, userId, net) {
    getUser(guildId, userId);
    const n = Math.round(net);
    if (n > 0) winStmt.run(n, n, String(guildId), String(userId));
    else lossStmt.run(-n, String(guildId), String(userId));
}

/* ── Verdienen ──────────────────────────────────────────────────────────── */

const msgStmt = db.prepare(`UPDATE loyalty_users SET points = points + ?, last_msg_at = ?, messages = messages + 1
    WHERE guild_id = ? AND user_id = ? AND last_msg_at <= ?`);
/** Punkte für eine Nachricht, gedrosselt. Gibt die gutgeschriebenen Punkte zurück (0 = gedrosselt). */
function onMessage(guildId, userId, now = Date.now()) {
    const cfg = getConfig(guildId);
    if (!cfg.enabled || cfg.perMessage <= 0) return 0;
    getUser(guildId, userId);
    const sec = Math.floor(now / 1000);
    const r = msgStmt.run(cfg.perMessage, sec, String(guildId), String(userId), sec - cfg.messageCooldown);
    return r.changes === 1 ? cfg.perMessage : 0;
}

const voiceStmt = db.prepare('UPDATE loyalty_users SET points = points + ?, voice_minutes = voice_minutes + ? WHERE guild_id = ? AND user_id = ?');
function addVoiceMinutes(guildId, userId, minutes, perMinute) {
    getUser(guildId, userId);
    voiceStmt.run(Math.round(minutes * perMinute), Math.round(minutes), String(guildId), String(userId));
}

/** Tag im Sinne von /daily: deutsche Zeit, damit der Reset um Mitternacht hier passiert. */
function berlinDay(now = Date.now()) {
    return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date(now));
}
function previousDay(day) {
    const d = new Date(`${day}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
}

const dailyStmt = db.prepare(`UPDATE loyalty_users SET points = points + ?, daily_day = ?, daily_streak = ?
    WHERE guild_id = ? AND user_id = ? AND daily_day <> ?`);
/**
 * Tagesbonus. Wer gestern auch geholt hat, steigert die Serie (bis 7 Tage Bonus).
 * @returns {{ok:true, amount, streak, points} | {ok:false, streak}}
 */
function claimDaily(guildId, userId, now = Date.now()) {
    const cfg = getConfig(guildId);
    const user = getUser(guildId, userId);
    const today = berlinDay(now);
    if (user.daily_day === today) return { ok: false, streak: user.daily_streak };
    const streak = user.daily_day === previousDay(today) ? user.daily_streak + 1 : 1;
    const amount = cfg.dailyBase + cfg.dailyStreakBonus * (Math.min(streak, 7) - 1);
    const r = dailyStmt.run(amount, today, streak, String(guildId), String(userId), today);
    if (r.changes !== 1) return { ok: false, streak: user.daily_streak };
    return { ok: true, amount, streak, points: getUser(guildId, userId).points };
}

/* ── Rangliste & Verwaltung ─────────────────────────────────────────────── */

const topStmt = db.prepare(`SELECT * FROM loyalty_users WHERE guild_id = ?
    ORDER BY points DESC, created_at ASC LIMIT ? OFFSET ?`);
function leaderboard(guildId, limit = 10, offset = 0) {
    return topStmt.all(String(guildId), Math.min(500, Math.max(1, limit)), Math.max(0, offset));
}

const rankStmt = db.prepare('SELECT COUNT(*) AS n FROM loyalty_users WHERE guild_id = ? AND points > ?');
function rankOf(guildId, userId) {
    const u = peekUser(guildId, userId);
    if (!u) return null;
    return rankStmt.get(String(guildId), u.points).n + 1;
}

const summaryStmt = db.prepare('SELECT COUNT(*) AS users, COALESCE(SUM(points), 0) AS total FROM loyalty_users WHERE guild_id = ?');
function summary(guildId) {
    return summaryStmt.get(String(guildId));
}

const resetStmt = db.prepare('DELETE FROM loyalty_users WHERE guild_id = ?');
function resetGuild(guildId) {
    return resetStmt.run(String(guildId)).changes;
}

module.exports = {
    DEFAULTS, cleanConfig, getConfig, saveConfig, enabledGuilds,
    getUser, peekUser, addPoints, spend, setPoints, recordGame,
    onMessage, addVoiceMinutes, claimDaily, berlinDay,
    leaderboard, rankOf, summary, resetGuild,
    _db: db,
};
