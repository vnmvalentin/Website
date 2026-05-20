// discord/database/db.js
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'discord_data.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS guild_settings (
    guild_id TEXT PRIMARY KEY,
    welcome_channel TEXT,
    welcome_message TEXT,
    prefix TEXT DEFAULT '!',
    bot_nickname TEXT DEFAULT ''
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS reaction_roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    mode TEXT NOT NULL,
    role_mapping TEXT NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS approval_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    message_id TEXT DEFAULT '',
    title TEXT DEFAULT 'Unbenannt',
    embed_title TEXT DEFAULT '',
    embed_text TEXT DEFAULT '',
    embed_color TEXT DEFAULT '#06b6d4',
    approver_ids TEXT DEFAULT '[]',
    access_type TEXT DEFAULT 'role',
    access_id TEXT DEFAULT '',
    cooldown_hours INTEGER DEFAULT 24
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS approval_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    config_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    thread_id TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    created_at INTEGER DEFAULT (unixepoch()),
    resolved_at INTEGER DEFAULT 0
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS voice_configs (
    guild_id TEXT PRIMARY KEY,
    trigger_channel_id TEXT DEFAULT ''
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS active_voice_channels (
    voice_channel_id TEXT PRIMARY KEY,
    text_channel_id TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    guild_id TEXT NOT NULL
  )
`);

// Migrations (try/catch ignoriert Fehler falls Spalten schon existieren)
try { db.exec("ALTER TABLE reaction_roles ADD COLUMN title TEXT DEFAULT 'Unbenannt'"); } catch (e) {}
try { db.exec("ALTER TABLE reaction_roles ADD COLUMN color TEXT DEFAULT '#06b6d4'"); } catch (e) {}
try { db.exec("ALTER TABLE reaction_roles ADD COLUMN message_text TEXT DEFAULT ''"); } catch (e) {}
try { db.exec("ALTER TABLE reaction_roles ADD COLUMN embed_title TEXT DEFAULT ''"); } catch (e) {}
try { db.exec("ALTER TABLE reaction_roles ADD COLUMN embed_footer TEXT DEFAULT ''"); } catch (e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN leave_channel TEXT DEFAULT ''"); } catch (e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN leave_message TEXT DEFAULT ''"); } catch (e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN fun_channel TEXT DEFAULT ''"); } catch (e) {}


// ── GUILD SETTINGS ────────────────────────────────────────────────────────────

function getSettings(guildId) {
    const row = db.prepare('SELECT * FROM guild_settings WHERE guild_id = ?').get(guildId);
    if (!row) return { welcomeChannel: "", welcomeMessage: "", leaveChannel: "", leaveMessage: "", funChannel: "", prefix: "!", botNickname: "" };
    return {
        welcomeChannel: row.welcome_channel || "", welcomeMessage: row.welcome_message || "",
        leaveChannel: row.leave_channel || "", leaveMessage: row.leave_message || "",
        funChannel: row.fun_channel || "",
        prefix: row.prefix || "!", botNickname: row.bot_nickname || ""
    };
}

function saveSettings(guildId, { welcomeChannel, welcomeMessage, leaveChannel, leaveMessage, funChannel, prefix, botNickname }) {
    db.prepare(`
        INSERT INTO guild_settings (guild_id, welcome_channel, welcome_message, leave_channel, leave_message, fun_channel, prefix, bot_nickname)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(guild_id) DO UPDATE SET
        welcome_channel = excluded.welcome_channel, welcome_message = excluded.welcome_message,
        leave_channel = excluded.leave_channel, leave_message = excluded.leave_message,
        fun_channel = excluded.fun_channel,
        prefix = excluded.prefix, bot_nickname = excluded.bot_nickname
    `).run(guildId, welcomeChannel || "", welcomeMessage || "", leaveChannel || "", leaveMessage || "", funChannel || "", prefix || "!", botNickname || "");
}


// ── REAKTIONSROLLEN ───────────────────────────────────────────────────────────

function getReactionRoles(guildId) {
    return db.prepare('SELECT * FROM reaction_roles WHERE guild_id = ?').all(guildId).map(row => ({
        id: row.id, guildId: row.guild_id, channelId: row.channel_id, messageId: row.message_id,
        mode: row.mode, roleMapping: JSON.parse(row.role_mapping), title: row.title || 'Unbenannt',
        color: row.color || '#06b6d4', messageText: row.message_text || '',
        embedTitle: row.embed_title || '', embedFooter: row.embed_footer || ''
    }));
}

function saveReactionRole(guildId, channelId, messageId, mode, roleMapping, title, color, messageText, embedTitle, embedFooter) {
    const info = db.prepare(`
        INSERT INTO reaction_roles (guild_id, channel_id, message_id, mode, role_mapping, title, color, message_text, embed_title, embed_footer)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(guildId, channelId, messageId, mode, JSON.stringify(roleMapping), title || 'Unbenannt', color || '#06b6d4', messageText || '', embedTitle || '', embedFooter || '');
    return info.lastInsertRowid;
}

function updateReactionRole(id, guildId, mode, roleMapping, title, color, messageText, embedTitle, embedFooter) {
    db.prepare(`
        UPDATE reaction_roles SET mode = ?, role_mapping = ?, title = ?, color = ?, message_text = ?, embed_title = ?, embed_footer = ?
        WHERE id = ? AND guild_id = ?
    `).run(mode, JSON.stringify(roleMapping), title, color, messageText, embedTitle, embedFooter, id, guildId);
}

function deleteReactionRole(id, guildId) {
    db.prepare('DELETE FROM reaction_roles WHERE id = ? AND guild_id = ?').run(id, guildId);
}


// ── APPROVAL CONFIGS ──────────────────────────────────────────────────────────

function getApprovalConfigs(guildId) {
    return db.prepare('SELECT * FROM approval_configs WHERE guild_id = ?').all(guildId).map(row => ({
        id: row.id, guildId: row.guild_id, channelId: row.channel_id, messageId: row.message_id,
        title: row.title || 'Unbenannt', embedTitle: row.embed_title || '', embedText: row.embed_text || '',
        embedColor: row.embed_color || '#06b6d4', approverIds: JSON.parse(row.approver_ids || '[]'),
        accessType: row.access_type || 'role', accessId: row.access_id || '',
        cooldownHours: row.cooldown_hours ?? 24
    }));
}

function getApprovalConfig(id, guildId) {
    const row = db.prepare('SELECT * FROM approval_configs WHERE id = ? AND guild_id = ?').get(id, guildId);
    if (!row) return null;
    return {
        id: row.id, guildId: row.guild_id, channelId: row.channel_id, messageId: row.message_id,
        title: row.title || 'Unbenannt', embedTitle: row.embed_title || '', embedText: row.embed_text || '',
        embedColor: row.embed_color || '#06b6d4', approverIds: JSON.parse(row.approver_ids || '[]'),
        accessType: row.access_type || 'role', accessId: row.access_id || '',
        cooldownHours: row.cooldown_hours ?? 24
    };
}

function getApprovalConfigById(id) {
    const row = db.prepare('SELECT * FROM approval_configs WHERE id = ?').get(id);
    if (!row) return null;
    return {
        id: row.id, guildId: row.guild_id, channelId: row.channel_id, messageId: row.message_id,
        title: row.title || 'Unbenannt', embedTitle: row.embed_title || '', embedText: row.embed_text || '',
        embedColor: row.embed_color || '#06b6d4', approverIds: JSON.parse(row.approver_ids || '[]'),
        accessType: row.access_type || 'role', accessId: row.access_id || '',
        cooldownHours: row.cooldown_hours ?? 24
    };
}

function saveApprovalConfig(guildId, { channelId, title, embedTitle, embedText, embedColor, approverIds, accessType, accessId, cooldownHours }) {
    const info = db.prepare(`
        INSERT INTO approval_configs (guild_id, channel_id, title, embed_title, embed_text, embed_color, approver_ids, access_type, access_id, cooldown_hours)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(guildId, channelId, title || 'Unbenannt', embedTitle || '', embedText || '', embedColor || '#06b6d4',
        JSON.stringify(approverIds || []), accessType || 'role', accessId || '', cooldownHours ?? 24);
    return info.lastInsertRowid;
}

function updateApprovalConfigMessageId(id, messageId) {
    db.prepare('UPDATE approval_configs SET message_id = ? WHERE id = ?').run(messageId, id);
}

function updateApprovalConfig(id, guildId, { title, embedTitle, embedText, embedColor, approverIds, accessType, accessId, cooldownHours }) {
    db.prepare(`
        UPDATE approval_configs SET title = ?, embed_title = ?, embed_text = ?, embed_color = ?,
        approver_ids = ?, access_type = ?, access_id = ?, cooldown_hours = ?
        WHERE id = ? AND guild_id = ?
    `).run(title || 'Unbenannt', embedTitle || '', embedText || '', embedColor || '#06b6d4',
        JSON.stringify(approverIds || []), accessType || 'role', accessId || '', cooldownHours ?? 24, id, guildId);
}

function deleteApprovalConfig(id, guildId) {
    db.prepare('DELETE FROM approval_configs WHERE id = ? AND guild_id = ?').run(id, guildId);
    db.prepare('DELETE FROM approval_requests WHERE config_id = ? AND guild_id = ?').run(id, guildId);
}


// ── APPROVAL REQUESTS ─────────────────────────────────────────────────────────

function saveApprovalRequest(guildId, configId, userId, threadId) {
    const info = db.prepare(`
        INSERT INTO approval_requests (guild_id, config_id, user_id, thread_id) VALUES (?, ?, ?, ?)
    `).run(guildId, configId, userId, threadId);
    return info.lastInsertRowid;
}

function getApprovalRequest(id) {
    return db.prepare('SELECT * FROM approval_requests WHERE id = ?').get(id);
}

function getPendingRequest(guildId, configId, userId) {
    return db.prepare("SELECT * FROM approval_requests WHERE guild_id = ? AND config_id = ? AND user_id = ? AND status = 'pending'").get(guildId, configId, userId);
}

function getLatestRejectedRequest(guildId, configId, userId) {
    return db.prepare("SELECT * FROM approval_requests WHERE guild_id = ? AND config_id = ? AND user_id = ? AND status = 'rejected' ORDER BY resolved_at DESC LIMIT 1").get(guildId, configId, userId);
}

function updateApprovalRequest(id, status) {
    const resolvedAt = Math.floor(Date.now() / 1000);
    db.prepare('UPDATE approval_requests SET status = ?, resolved_at = ? WHERE id = ?').run(status, resolvedAt, id);
}


// ── VOICE CONFIGS ─────────────────────────────────────────────────────────────

function getVoiceConfig(guildId) {
    const row = db.prepare('SELECT * FROM voice_configs WHERE guild_id = ?').get(guildId);
    return row ? { guildId: row.guild_id, triggerChannelId: row.trigger_channel_id || '' } : { guildId, triggerChannelId: '' };
}

function saveVoiceConfig(guildId, triggerChannelId) {
    db.prepare(`
        INSERT INTO voice_configs (guild_id, trigger_channel_id) VALUES (?, ?)
        ON CONFLICT(guild_id) DO UPDATE SET trigger_channel_id = excluded.trigger_channel_id
    `).run(guildId, triggerChannelId || '');
}


// ── ACTIVE VOICE CHANNELS ────────────────────────────────────────────────────

function saveActiveVoiceChannel(voiceChannelId, textChannelId, ownerId, guildId) {
    db.prepare(`
        INSERT OR REPLACE INTO active_voice_channels (voice_channel_id, text_channel_id, owner_id, guild_id)
        VALUES (?, ?, ?, ?)
    `).run(voiceChannelId, textChannelId, ownerId, guildId);
}

function getActiveVoiceChannel(voiceChannelId) {
    return db.prepare('SELECT * FROM active_voice_channels WHERE voice_channel_id = ?').get(voiceChannelId);
}

function getActiveVoiceChannelByText(textChannelId) {
    return db.prepare('SELECT * FROM active_voice_channels WHERE text_channel_id = ?').get(textChannelId);
}

function getAllActiveVoiceChannels() {
    return db.prepare('SELECT * FROM active_voice_channels').all();
}

function updateVoiceOwner(voiceChannelId, newOwnerId) {
    db.prepare('UPDATE active_voice_channels SET owner_id = ? WHERE voice_channel_id = ?').run(newOwnerId, voiceChannelId);
}

function deleteActiveVoiceChannel(voiceChannelId) {
    db.prepare('DELETE FROM active_voice_channels WHERE voice_channel_id = ?').run(voiceChannelId);
}


module.exports = {
    getSettings, saveSettings,
    getReactionRoles, saveReactionRole, updateReactionRole, deleteReactionRole,
    getApprovalConfigs, getApprovalConfig, getApprovalConfigById,
    saveApprovalConfig, updateApprovalConfigMessageId, updateApprovalConfig, deleteApprovalConfig,
    saveApprovalRequest, getApprovalRequest, getPendingRequest, getLatestRejectedRequest, updateApprovalRequest,
    getVoiceConfig, saveVoiceConfig,
    saveActiveVoiceChannel, getActiveVoiceChannel, getActiveVoiceChannelByText,
    getAllActiveVoiceChannels, updateVoiceOwner, deleteActiveVoiceChannel,
};
