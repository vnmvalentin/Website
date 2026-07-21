// discord/database/db.js
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { step } = require('../../lib/startupLog');

const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'discord_data.db'));

// ── Basis-Tabellen ─────────────────────────────────────────────────────────────
db.exec(`CREATE TABLE IF NOT EXISTS guild_settings (
    guild_id TEXT PRIMARY KEY,
    welcome_channel TEXT,
    welcome_message TEXT,
    prefix TEXT DEFAULT '!',
    bot_nickname TEXT DEFAULT ''
)`);
db.exec(`CREATE TABLE IF NOT EXISTS reaction_roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    mode TEXT NOT NULL,
    role_mapping TEXT NOT NULL
)`);
db.exec(`CREATE TABLE IF NOT EXISTS approval_configs (
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
)`);
db.exec(`CREATE TABLE IF NOT EXISTS approval_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    config_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    thread_id TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    created_at INTEGER DEFAULT (unixepoch()),
    resolved_at INTEGER DEFAULT 0
)`);
db.exec(`CREATE TABLE IF NOT EXISTS voice_configs (
    guild_id TEXT PRIMARY KEY,
    trigger_channel_id TEXT DEFAULT ''
)`);
db.exec(`CREATE TABLE IF NOT EXISTS active_voice_channels (
    voice_channel_id TEXT PRIMARY KEY,
    text_channel_id TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    guild_id TEXT NOT NULL
)`);

// ── Neue Tabellen (CREATE TABLE IF NOT EXISTS = sicher auch wenn schon vorhanden) ─
db.exec(`CREATE TABLE IF NOT EXISTS twitch_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    twitch_username TEXT NOT NULL,
    message_template TEXT DEFAULT '',
    last_announced_stream_id TEXT DEFAULT '',
    enabled INTEGER DEFAULT 1
)`);
db.exec(`CREATE TABLE IF NOT EXISTS live_roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    live_role_id TEXT NOT NULL,
    restriction_role_id TEXT DEFAULT '',
    enabled INTEGER DEFAULT 1
)`);
db.exec(`CREATE TABLE IF NOT EXISTS image_only_channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    slowmode_seconds INTEGER DEFAULT 0,
    enabled INTEGER DEFAULT 1,
    UNIQUE(guild_id, channel_id)
)`);
db.exec(`CREATE TABLE IF NOT EXISTS sync_channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    group_name TEXT DEFAULT 'taverne',
    webhook_id TEXT DEFAULT '',
    webhook_token TEXT DEFAULT '',
    enabled INTEGER DEFAULT 1
)`);
db.exec(`CREATE TABLE IF NOT EXISTS ticket_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    setup_channel_id TEXT NOT NULL,
    embed_title TEXT DEFAULT 'Support Ticket',
    embed_description TEXT DEFAULT '',
    embed_color TEXT DEFAULT '#06b6d4',
    category_id TEXT DEFAULT '',
    handler_role_ids TEXT DEFAULT '[]',
    message_id TEXT DEFAULT ''
)`);
db.exec(`CREATE TABLE IF NOT EXISTS ticket_fields (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    label TEXT NOT NULL,
    placeholder TEXT DEFAULT '',
    required INTEGER DEFAULT 1,
    style INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0
)`);
db.exec(`CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    creator_id TEXT NOT NULL,
    creator_name TEXT DEFAULT '',
    status TEXT DEFAULT 'open',
    field_data TEXT DEFAULT '{}',
    created_at INTEGER DEFAULT (unixepoch()),
    closed_at INTEGER DEFAULT 0
)`);
db.exec(`CREATE TABLE IF NOT EXISTS message_stats (
    guild_id TEXT NOT NULL,
    date TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    msg_count INTEGER DEFAULT 0,
    PRIMARY KEY (guild_id, date, channel_id)
)`);
db.exec(`CREATE TABLE IF NOT EXISTS voice_activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    duration_seconds INTEGER DEFAULT 0,
    date TEXT NOT NULL
)`);
db.exec(`CREATE TABLE IF NOT EXISTS auto_roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    trigger_role_id TEXT NOT NULL,
    assign_role_id TEXT NOT NULL,
    enabled INTEGER DEFAULT 1
)`);

// ── Migrations ─────────────────────────────────────────────────────────────────
try { db.exec("ALTER TABLE reaction_roles ADD COLUMN title TEXT DEFAULT 'Unbenannt'"); } catch (e) {}
try { db.exec("ALTER TABLE reaction_roles ADD COLUMN color TEXT DEFAULT '#06b6d4'"); } catch (e) {}
try { db.exec("ALTER TABLE reaction_roles ADD COLUMN message_text TEXT DEFAULT ''"); } catch (e) {}
try { db.exec("ALTER TABLE reaction_roles ADD COLUMN embed_title TEXT DEFAULT ''"); } catch (e) {}
try { db.exec("ALTER TABLE reaction_roles ADD COLUMN embed_footer TEXT DEFAULT ''"); } catch (e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN leave_channel TEXT DEFAULT ''"); } catch (e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN leave_message TEXT DEFAULT ''"); } catch (e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN fun_channel TEXT DEFAULT ''"); } catch (e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN disabled_commands TEXT DEFAULT '[]'"); } catch (e) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_voice_activity ON voice_activity(guild_id, date)"); } catch (e) {}
try { db.exec("ALTER TABLE active_voice_channels ADD COLUMN pin_message_id TEXT DEFAULT ''"); } catch (e) {}

step("Discord-DB", true);

// ── GUILD SETTINGS ─────────────────────────────────────────────────────────────
function getSettings(guildId) {
    const row = db.prepare('SELECT * FROM guild_settings WHERE guild_id = ?').get(guildId);
    if (!row) return { welcomeChannel: "", welcomeMessage: "", leaveChannel: "", leaveMessage: "", funChannel: "", prefix: "!", botNickname: "", disabledCommands: [] };
    return {
        welcomeChannel: row.welcome_channel || "", welcomeMessage: row.welcome_message || "",
        leaveChannel: row.leave_channel || "", leaveMessage: row.leave_message || "",
        funChannel: row.fun_channel || "",
        prefix: row.prefix || "!", botNickname: row.bot_nickname || "",
        disabledCommands: (() => { try { return JSON.parse(row.disabled_commands || '[]'); } catch { return []; } })(),
    };
}

function saveSettings(guildId, { welcomeChannel, welcomeMessage, leaveChannel, leaveMessage, funChannel, prefix, botNickname, disabledCommands }) {
    db.prepare(`
        INSERT INTO guild_settings (guild_id, welcome_channel, welcome_message, leave_channel, leave_message, fun_channel, prefix, bot_nickname, disabled_commands)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(guild_id) DO UPDATE SET
        welcome_channel = excluded.welcome_channel, welcome_message = excluded.welcome_message,
        leave_channel = excluded.leave_channel, leave_message = excluded.leave_message,
        fun_channel = excluded.fun_channel, prefix = excluded.prefix,
        bot_nickname = excluded.bot_nickname, disabled_commands = excluded.disabled_commands
    `).run(guildId, welcomeChannel || "", welcomeMessage || "", leaveChannel || "", leaveMessage || "",
        funChannel || "", prefix || "!", botNickname || "", JSON.stringify(disabledCommands || []));
}

// ── REAKTIONSROLLEN ────────────────────────────────────────────────────────────
function getReactionRoles(guildId) {
    return db.prepare('SELECT * FROM reaction_roles WHERE guild_id = ?').all(guildId).map(row => ({
        id: row.id, guildId: row.guild_id, channelId: row.channel_id, messageId: row.message_id,
        mode: row.mode, roleMapping: JSON.parse(row.role_mapping), title: row.title || 'Unbenannt',
        color: row.color || '#06b6d4', messageText: row.message_text || '',
        embedTitle: row.embed_title || '', embedFooter: row.embed_footer || ''
    }));
}
function saveReactionRole(guildId, channelId, messageId, mode, roleMapping, title, color, messageText, embedTitle, embedFooter) {
    const info = db.prepare(`INSERT INTO reaction_roles (guild_id, channel_id, message_id, mode, role_mapping, title, color, message_text, embed_title, embed_footer) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(guildId, channelId, messageId, mode, JSON.stringify(roleMapping), title || 'Unbenannt', color || '#06b6d4', messageText || '', embedTitle || '', embedFooter || '');
    return info.lastInsertRowid;
}
function updateReactionRole(id, guildId, mode, roleMapping, title, color, messageText, embedTitle, embedFooter) {
    db.prepare(`UPDATE reaction_roles SET mode=?, role_mapping=?, title=?, color=?, message_text=?, embed_title=?, embed_footer=? WHERE id=? AND guild_id=?`)
        .run(mode, JSON.stringify(roleMapping), title, color, messageText, embedTitle, embedFooter, id, guildId);
}
function deleteReactionRole(id, guildId) {
    db.prepare('DELETE FROM reaction_roles WHERE id=? AND guild_id=?').run(id, guildId);
}

// ── APPROVAL ───────────────────────────────────────────────────────────────────
function getApprovalConfigs(guildId) {
    return db.prepare('SELECT * FROM approval_configs WHERE guild_id=?').all(guildId).map(row => ({
        id: row.id, guildId: row.guild_id, channelId: row.channel_id, messageId: row.message_id,
        title: row.title || 'Unbenannt', embedTitle: row.embed_title || '', embedText: row.embed_text || '',
        embedColor: row.embed_color || '#06b6d4', approverIds: JSON.parse(row.approver_ids || '[]'),
        accessType: row.access_type || 'role', accessId: row.access_id || '', cooldownHours: row.cooldown_hours ?? 24
    }));
}
function getApprovalConfig(id, guildId) {
    const row = db.prepare('SELECT * FROM approval_configs WHERE id=? AND guild_id=?').get(id, guildId);
    if (!row) return null;
    return { id: row.id, guildId: row.guild_id, channelId: row.channel_id, messageId: row.message_id, title: row.title || 'Unbenannt', embedTitle: row.embed_title || '', embedText: row.embed_text || '', embedColor: row.embed_color || '#06b6d4', approverIds: JSON.parse(row.approver_ids || '[]'), accessType: row.access_type || 'role', accessId: row.access_id || '', cooldownHours: row.cooldown_hours ?? 24 };
}
function getApprovalConfigById(id) {
    const row = db.prepare('SELECT * FROM approval_configs WHERE id=?').get(id);
    if (!row) return null;
    return { id: row.id, guildId: row.guild_id, channelId: row.channel_id, messageId: row.message_id, title: row.title || 'Unbenannt', embedTitle: row.embed_title || '', embedText: row.embed_text || '', embedColor: row.embed_color || '#06b6d4', approverIds: JSON.parse(row.approver_ids || '[]'), accessType: row.access_type || 'role', accessId: row.access_id || '', cooldownHours: row.cooldown_hours ?? 24 };
}
function saveApprovalConfig(guildId, { channelId, title, embedTitle, embedText, embedColor, approverIds, accessType, accessId, cooldownHours }) {
    const info = db.prepare(`INSERT INTO approval_configs (guild_id, channel_id, title, embed_title, embed_text, embed_color, approver_ids, access_type, access_id, cooldown_hours) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(guildId, channelId, title || 'Unbenannt', embedTitle || '', embedText || '', embedColor || '#06b6d4', JSON.stringify(approverIds || []), accessType || 'role', accessId || '', cooldownHours ?? 24);
    return info.lastInsertRowid;
}
function updateApprovalConfigMessageId(id, messageId) {
    db.prepare('UPDATE approval_configs SET message_id=? WHERE id=?').run(messageId, id);
}
function updateApprovalConfig(id, guildId, { title, embedTitle, embedText, embedColor, approverIds, accessType, accessId, cooldownHours }) {
    db.prepare(`UPDATE approval_configs SET title=?, embed_title=?, embed_text=?, embed_color=?, approver_ids=?, access_type=?, access_id=?, cooldown_hours=? WHERE id=? AND guild_id=?`)
        .run(title || 'Unbenannt', embedTitle || '', embedText || '', embedColor || '#06b6d4', JSON.stringify(approverIds || []), accessType || 'role', accessId || '', cooldownHours ?? 24, id, guildId);
}
function deleteApprovalConfig(id, guildId) {
    db.prepare('DELETE FROM approval_configs WHERE id=? AND guild_id=?').run(id, guildId);
    db.prepare('DELETE FROM approval_requests WHERE config_id=? AND guild_id=?').run(id, guildId);
}
function saveApprovalRequest(guildId, configId, userId, threadId) {
    const info = db.prepare(`INSERT INTO approval_requests (guild_id, config_id, user_id, thread_id) VALUES (?, ?, ?, ?)`).run(guildId, configId, userId, threadId);
    return info.lastInsertRowid;
}
function getApprovalRequest(id) { return db.prepare('SELECT * FROM approval_requests WHERE id=?').get(id); }
function getPendingRequest(guildId, configId, userId) {
    return db.prepare("SELECT * FROM approval_requests WHERE guild_id=? AND config_id=? AND user_id=? AND status='pending'").get(guildId, configId, userId);
}
function getLatestRejectedRequest(guildId, configId, userId) {
    return db.prepare("SELECT * FROM approval_requests WHERE guild_id=? AND config_id=? AND user_id=? AND status='rejected' ORDER BY resolved_at DESC LIMIT 1").get(guildId, configId, userId);
}
function updateApprovalRequest(id, status) {
    db.prepare('UPDATE approval_requests SET status=?, resolved_at=? WHERE id=?').run(status, Math.floor(Date.now() / 1000), id);
}

// ── VOICE CONFIG / CHANNELS ────────────────────────────────────────────────────
function getVoiceConfig(guildId) {
    const row = db.prepare('SELECT * FROM voice_configs WHERE guild_id=?').get(guildId);
    return row ? { guildId: row.guild_id, triggerChannelId: row.trigger_channel_id || '' } : { guildId, triggerChannelId: '' };
}
function saveVoiceConfig(guildId, triggerChannelId) {
    db.prepare(`INSERT INTO voice_configs (guild_id, trigger_channel_id) VALUES (?, ?) ON CONFLICT(guild_id) DO UPDATE SET trigger_channel_id=excluded.trigger_channel_id`).run(guildId, triggerChannelId || '');
}
function saveActiveVoiceChannel(voiceChannelId, textChannelId, ownerId, guildId, pinMessageId = '') {
    db.prepare(`INSERT OR REPLACE INTO active_voice_channels (voice_channel_id, text_channel_id, owner_id, guild_id, pin_message_id) VALUES (?, ?, ?, ?, ?)`).run(voiceChannelId, textChannelId, ownerId, guildId, pinMessageId || '');
}
function getActiveVoiceChannel(voiceChannelId) { return db.prepare('SELECT * FROM active_voice_channels WHERE voice_channel_id=?').get(voiceChannelId); }
function getActiveVoiceChannelByText(textChannelId) { return db.prepare('SELECT * FROM active_voice_channels WHERE text_channel_id=?').get(textChannelId); }
function getAllActiveVoiceChannels() { return db.prepare('SELECT * FROM active_voice_channels').all(); }
function updateVoiceOwner(voiceChannelId, newOwnerId) { db.prepare('UPDATE active_voice_channels SET owner_id=? WHERE voice_channel_id=?').run(newOwnerId, voiceChannelId); }
function deleteActiveVoiceChannel(voiceChannelId) { db.prepare('DELETE FROM active_voice_channels WHERE voice_channel_id=?').run(voiceChannelId); }

// ── TWITCH NOTIFICATIONS ───────────────────────────────────────────────────────
function getTwitchNotifications(guildId) {
    return db.prepare('SELECT * FROM twitch_notifications WHERE guild_id=?').all(guildId)
        .map(r => ({ id: r.id, guildId: r.guild_id, channelId: r.channel_id, twitchUsername: r.twitch_username, messageTemplate: r.message_template || '', lastAnnouncedStreamId: r.last_announced_stream_id || '', enabled: !!r.enabled }));
}
function getAllEnabledTwitchNotifications() {
    return db.prepare('SELECT * FROM twitch_notifications WHERE enabled=1').all()
        .map(r => ({ id: r.id, guildId: r.guild_id, channelId: r.channel_id, twitchUsername: r.twitch_username, messageTemplate: r.message_template || '', lastAnnouncedStreamId: r.last_announced_stream_id || '' }));
}
function updateLastAnnouncedStreamId(id, streamId) {
    db.prepare('UPDATE twitch_notifications SET last_announced_stream_id=? WHERE id=?').run(streamId || '', id);
}
function saveTwitchNotification(guildId, channelId, twitchUsername, messageTemplate = '') {
    return db.prepare(`INSERT INTO twitch_notifications (guild_id, channel_id, twitch_username, message_template) VALUES (?, ?, ?, ?)`).run(guildId, channelId, twitchUsername, messageTemplate).lastInsertRowid;
}
function updateTwitchNotification(id, guildId, channelId, twitchUsername, messageTemplate = '', enabled = 1) {
    db.prepare(`UPDATE twitch_notifications SET channel_id=?, twitch_username=?, message_template=?, enabled=? WHERE id=? AND guild_id=?`).run(channelId, twitchUsername, messageTemplate, enabled, id, guildId);
}
function deleteTwitchNotification(id, guildId) { db.prepare('DELETE FROM twitch_notifications WHERE id=? AND guild_id=?').run(id, guildId); }

// ── LIVE ROLE ──────────────────────────────────────────────────────────────────
function getLiveRole(guildId) {
    const row = db.prepare('SELECT * FROM live_roles WHERE guild_id=? AND enabled=1 LIMIT 1').get(guildId);
    if (!row) return null;
    return { id: row.id, guildId: row.guild_id, liveRoleId: row.live_role_id, restrictionRoleId: row.restriction_role_id || '' };
}
function getAllEnabledLiveRoles() {
    return db.prepare('SELECT * FROM live_roles WHERE enabled=1').all()
        .map(r => ({ id: r.id, guildId: r.guild_id, liveRoleId: r.live_role_id, restrictionRoleId: r.restriction_role_id || '' }));
}
function saveLiveRole(guildId, liveRoleId, restrictionRoleId = '') {
    db.prepare('DELETE FROM live_roles WHERE guild_id=?').run(guildId);
    db.prepare('INSERT INTO live_roles (guild_id, live_role_id, restriction_role_id, enabled) VALUES (?, ?, ?, 1)').run(guildId, liveRoleId, restrictionRoleId || '');
}
function deleteLiveRole(guildId) { db.prepare('DELETE FROM live_roles WHERE guild_id=?').run(guildId); }

// ── IMAGE ONLY ─────────────────────────────────────────────────────────────────
function getImageOnlyChannels(guildId) {
    return db.prepare('SELECT * FROM image_only_channels WHERE guild_id=?').all(guildId)
        .map(r => ({ id: r.id, guildId: r.guild_id, channelId: r.channel_id, slowmode: r.slowmode_seconds, enabled: !!r.enabled }));
}
function getAllEnabledImageOnlyChannels() {
    return db.prepare('SELECT * FROM image_only_channels WHERE enabled=1').all()
        .map(r => ({ id: r.id, guildId: r.guild_id, channelId: r.channel_id, slowmode: r.slowmode_seconds, enabled: true }));
}
function saveImageOnlyChannel(guildId, channelId, slowmodeSecs = 0, enabled = 1) {
    db.prepare(`INSERT INTO image_only_channels (guild_id, channel_id, slowmode_seconds, enabled) VALUES (?, ?, ?, ?) ON CONFLICT(guild_id, channel_id) DO UPDATE SET slowmode_seconds=excluded.slowmode_seconds, enabled=excluded.enabled`).run(guildId, channelId, slowmodeSecs, enabled);
}
function deleteImageOnlyChannel(guildId, channelId) { db.prepare('DELETE FROM image_only_channels WHERE guild_id=? AND channel_id=?').run(guildId, channelId); }

// ── SYNC CHANNELS (Taverne) ────────────────────────────────────────────────────
function getSyncChannels(guildId) {
    return db.prepare('SELECT * FROM sync_channels WHERE guild_id=? AND enabled=1').all(guildId)
        .map(r => ({ id: r.id, guildId: r.guild_id, channelId: r.channel_id, webhookId: r.webhook_id, webhookToken: r.webhook_token }));
}
function getAllSyncChannels() {
    return db.prepare('SELECT * FROM sync_channels WHERE enabled=1').all()
        .map(r => ({ id: r.id, guildId: r.guild_id, channelId: r.channel_id, webhookId: r.webhook_id, webhookToken: r.webhook_token }));
}
const getAllEnabledSyncChannels = getAllSyncChannels;
function saveSyncChannel(guildId, channelId, webhookId = '', webhookToken = '') {
    return db.prepare('INSERT INTO sync_channels (guild_id, channel_id, webhook_id, webhook_token, enabled) VALUES (?, ?, ?, ?, 1)').run(guildId, channelId, webhookId, webhookToken).lastInsertRowid;
}
function deleteSyncChannel(id, guildId) { db.prepare('DELETE FROM sync_channels WHERE id=? AND guild_id=?').run(id, guildId); }

// ── TICKETS ────────────────────────────────────────────────────────────────────
function getTicketConfig(guildId) {
    const r = db.prepare('SELECT * FROM ticket_configs WHERE guild_id=? LIMIT 1').get(guildId);
    if (!r) return null;
    return { id: r.id, guildId: r.guild_id, setupChannelId: r.setup_channel_id, messageId: r.message_id || '', embedTitle: r.embed_title, embedDescription: r.embed_description, embedColor: r.embed_color, categoryId: r.category_id, handlerRoleIds: JSON.parse(r.handler_role_ids || '[]') };
}
function saveTicketConfig(guildId, { setupChannelId, embedTitle, embedDescription, embedColor, categoryId, handlerRoleIds }) {
    db.prepare('DELETE FROM ticket_configs WHERE guild_id=?').run(guildId);
    return db.prepare(`INSERT INTO ticket_configs (guild_id, setup_channel_id, embed_title, embed_description, embed_color, category_id, handler_role_ids) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(guildId, setupChannelId, embedTitle || 'Support Ticket', embedDescription || '', embedColor || '#06b6d4', categoryId || '', JSON.stringify(handlerRoleIds || [])).lastInsertRowid;
}
function updateTicketConfigMessageId(guildId, messageId) { db.prepare('UPDATE ticket_configs SET message_id=? WHERE guild_id=?').run(messageId, guildId); }
function deleteTicketConfig(guildId) { db.prepare('DELETE FROM ticket_configs WHERE guild_id=?').run(guildId); db.prepare('DELETE FROM ticket_fields WHERE guild_id=?').run(guildId); }
function getTicketFields(guildId) {
    return db.prepare('SELECT * FROM ticket_fields WHERE guild_id=? ORDER BY sort_order').all(guildId)
        .map(r => ({ id: r.id, label: r.label, placeholder: r.placeholder, required: !!r.required, style: r.style || 1 }));
}
function saveTicketFields(guildId, fields = []) {
    db.prepare('DELETE FROM ticket_fields WHERE guild_id=?').run(guildId);
    const stmt = db.prepare('INSERT INTO ticket_fields (guild_id, label, placeholder, required, style, sort_order) VALUES (?, ?, ?, ?, ?, ?)');
    fields.forEach((f, i) => stmt.run(guildId, f.label, f.placeholder || '', f.required !== false ? 1 : 0, f.style || 1, i));
}
function getTicketHistory(guildId, days = 30) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    return db.prepare('SELECT * FROM tickets WHERE guild_id=? AND date(created_at, \'unixepoch\') >= ? ORDER BY created_at DESC LIMIT 50').all(guildId, since)
        .map(r => ({ id: r.id, guildId: r.guild_id, channelId: r.channel_id, creatorId: r.creator_id, creatorName: r.creator_name || '', status: r.status, fieldData: (() => { try { return JSON.parse(r.field_data || '{}'); } catch { return {}; } })(), createdAt: r.created_at * 1000, closedAt: r.closed_at ? r.closed_at * 1000 : null }));
}
function saveTicketHistoryEntry(guildId, userId, channelId, creatorName = '', fieldData = {}) {
    return db.prepare('INSERT INTO tickets (guild_id, channel_id, creator_id, creator_name, field_data, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(guildId, channelId, userId, creatorName, JSON.stringify(fieldData), Math.floor(Date.now() / 1000)).lastInsertRowid;
}
function closeTicketHistoryEntry(channelId) {
    db.prepare("UPDATE tickets SET status='closed', closed_at=? WHERE channel_id=?").run(Math.floor(Date.now() / 1000), channelId);
}

// ── AUTO ROLES ─────────────────────────────────────────────────────────────────
function getAutoRoles(guildId) {
    return db.prepare('SELECT * FROM auto_roles WHERE guild_id=?').all(guildId)
        .map(r => ({ id: r.id, guildId: r.guild_id, triggerRoleId: r.trigger_role_id, assignRoleId: r.assign_role_id, enabled: !!r.enabled }));
}

// ── STATS ──────────────────────────────────────────────────────────────────────
function incrementMessageStat(guildId, channelId) {
    const date = new Date().toISOString().split('T')[0];
    db.prepare(`INSERT INTO message_stats (guild_id, date, channel_id, msg_count) VALUES (?, ?, ?, 1) ON CONFLICT(guild_id, date, channel_id) DO UPDATE SET msg_count = msg_count + 1`).run(guildId, date, channelId);
}
const trackMessage = incrementMessageStat;
function trackVoiceActivity(guildId, userId, channelId, durationSeconds) {
    db.prepare('INSERT INTO voice_activity (guild_id, user_id, channel_id, duration_seconds, date) VALUES (?, ?, ?, ?, ?)').run(guildId, userId, channelId, durationSeconds, new Date().toISOString().split('T')[0]);
}
function getMessageStats(guildId, days = 30) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    return db.prepare(`SELECT channel_id as channelId, SUM(msg_count) as total FROM message_stats WHERE guild_id=? AND date>=? GROUP BY channel_id ORDER BY total DESC LIMIT 20`).all(guildId, since);
}
function getVoiceStats(guildId, days = 30) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    return db.prepare(`SELECT user_id as userId, SUM(duration_seconds) as totalSeconds FROM voice_activity WHERE guild_id=? AND date>=? GROUP BY user_id ORDER BY totalSeconds DESC LIMIT 20`).all(guildId, since);
}

// ── DISCORD DB BACKUP (alle 30 Min, 3 Slots) ───────────────────────────────────
const BACKUP_DIR = path.join(dataDir, 'backups');
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
let discordBackupSlot = 0;
function runDiscordBackup(opts = {}) {
    const { silent = false } = opts;
    try {
        const slotIndex = discordBackupSlot % 3;
        discordBackupSlot++;
        fs.copyFileSync(path.join(dataDir, 'discord_data.db'), path.join(BACKUP_DIR, `discord_data_backup_slot_${slotIndex}.db`));
        if (!silent) console.log(`[Discord-Backup] Slot ${slotIndex} -> discord_data_backup_slot_${slotIndex}.db`);
    } catch (e) {
        console.error('[Discord-Backup] Fehler:', e.message);
    }
}
setInterval(runDiscordBackup, 30 * 60 * 1000);
runDiscordBackup({ silent: true });

module.exports = {
    getSettings, saveSettings,
    getReactionRoles, saveReactionRole, updateReactionRole, deleteReactionRole,
    getApprovalConfigs, getApprovalConfig, getApprovalConfigById,
    saveApprovalConfig, updateApprovalConfigMessageId, updateApprovalConfig, deleteApprovalConfig,
    saveApprovalRequest, getApprovalRequest, getPendingRequest, getLatestRejectedRequest, updateApprovalRequest,
    getVoiceConfig, saveVoiceConfig,
    saveActiveVoiceChannel, getActiveVoiceChannel, getActiveVoiceChannelByText,
    getAllActiveVoiceChannels, updateVoiceOwner, deleteActiveVoiceChannel,
    getTwitchNotifications, getAllEnabledTwitchNotifications, updateLastAnnouncedStreamId,
    saveTwitchNotification, updateTwitchNotification, deleteTwitchNotification,
    getLiveRole, getAllEnabledLiveRoles, saveLiveRole, deleteLiveRole,
    getAutoRoles,
    getImageOnlyChannels, getAllEnabledImageOnlyChannels, saveImageOnlyChannel, deleteImageOnlyChannel,
    getSyncChannels, getAllSyncChannels, getAllEnabledSyncChannels, saveSyncChannel, deleteSyncChannel,
    getTicketConfig, saveTicketConfig, updateTicketConfigMessageId, deleteTicketConfig,
    getTicketFields, saveTicketFields, getTicketHistory, saveTicketHistoryEntry, closeTicketHistoryEntry,
    incrementMessageStat, trackMessage, trackVoiceActivity, getMessageStats, getVoiceStats,
};
