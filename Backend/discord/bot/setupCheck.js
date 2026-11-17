// discord/bot/setupCheck.js — Einrichtungs-Check für einen Server: Hat der Bot die Rechte, die seine eingerichteten
// Bereiche brauchen? (Ausbauplan „discord-verzeichnis“)
//
// Seit die Einladung nicht mehr „Administrator“ verlangt (permissions.js), kann ein Bereich still ausfallen: Der
// Begrüßungskanal liegt in einer Kategorie, die der Bot nicht sieht, die Live-Rolle steht über der Bot-Rolle … Der
// Check nennt solche Stellen mit Bereich, Kanal oder Rolle und dem fehlenden Recht. Er liest nur den Zwischenspeicher
// von discord.js (keine Anfrage an Discord) und ist rein: Server, Bot-Mitglied und Einstellungen kommen von außen —
// so prüfen ihn die Tests ohne Discord und ohne Datenbank.
const { missingOf } = require('./permissions');

const READ_WRITE = ['ViewChannel', 'SendMessages'];

/** Rechte je Bereich und Kanal. Schlüssel = Bereich im Dashboard (Reiter-ID). */
const NEEDS = {
    welcome: (style) => [...READ_WRITE, ...(style === 'card' ? ['EmbedLinks'] : []), ...(style === 'image' ? ['AttachFiles'] : [])],
    twitchnotif: [...READ_WRITE, 'EmbedLinks'],
    ticketPanel: [...READ_WRITE, 'EmbedLinks'],
    ticketCategory: ['ViewChannel', 'ManageChannels', 'ManageRoles'],
    imageonly: (slowmode) => [...READ_WRITE, 'ManageMessages', ...(slowmode > 0 ? ['ManageChannels'] : [])],
    syncchat: [...READ_WRITE, 'ReadMessageHistory', 'ManageWebhooks'],
    approval: [...READ_WRITE, 'EmbedLinks', 'CreatePrivateThreads', 'SendMessagesInThreads'],
    reactionroles: [...READ_WRITE, 'EmbedLinks', 'ReadMessageHistory'],
    voice: ['ViewChannel', 'Connect', 'MoveMembers', 'ManageChannels', 'ManageRoles', 'PinMessages'],
};

/**
 * @param {object} args
 * @param {object} args.guild  discord.js-Guild (oder Attrappe): channels.cache.get(id), roles.cache.get(id)
 * @param {object} args.me     das Bot-Mitglied (guild.members.me): permissions, roles.highest.position
 * @param {object} args.config die Einstellungen des Servers aus der Datenbank:
 *   { settings, twitchNotifications, ticketConfig, imageOnly, syncChannels, approvals, reactionRoles, voice, liveRole, autoRoles }
 * @returns {{ ok: boolean, missing: string[], problems: object[] }}
 *   problems: { area, kind: 'channel'|'role', id, name, issue: 'gone'|'missing'|'role_above', missing?: string[] }
 */
function checkSetup({ guild, me, config = {} }) {
    const problems = [];
    const missing = missingOf(me?.permissions);

    const channelOf = (id) => (id ? guild?.channels?.cache?.get(String(id)) || null : null);
    const roleOf = (id) => (id ? guild?.roles?.cache?.get(String(id)) || null : null);

    function checkChannel(area, id, names) {
        if (!id) return;
        const channel = channelOf(id);
        if (!channel) {
            problems.push({ area, kind: 'channel', id: String(id), name: null, issue: 'gone' });
            return;
        }
        let perms = null;
        try { perms = typeof channel.permissionsFor === 'function' ? channel.permissionsFor(me) : null; } catch { perms = null; }
        const lacking = missingOf(perms, names);
        if (lacking.length) problems.push({ area, kind: 'channel', id: String(id), name: channel.name || null, issue: 'missing', missing: lacking });
    }

    const highest = Number(me?.roles?.highest?.position) || 0;
    const seenRoles = new Set();
    function checkRole(area, id) {
        if (!id || seenRoles.has(`${area}:${id}`)) return;
        seenRoles.add(`${area}:${id}`);
        const role = roleOf(id);
        if (!role) {
            problems.push({ area, kind: 'role', id: String(id), name: null, issue: 'gone' });
            return;
        }
        // Discord lässt einen Bot nur Rollen vergeben, die UNTER seiner höchsten Rolle stehen — auch als Administrator
        if (Number(role.position) >= highest) problems.push({ area, kind: 'role', id: String(id), name: role.name || null, issue: 'role_above' });
    }

    const s = config.settings || {};
    if (s.welcomeChannel && s.welcomeMessage) checkChannel('welcome', s.welcomeChannel, NEEDS.welcome(s.welcomeStyle));
    if (s.leaveChannel && s.leaveMessage) checkChannel('leave', s.leaveChannel, NEEDS.welcome(s.leaveStyle));

    for (const n of config.twitchNotifications || []) if (n.enabled !== false) checkChannel('twitchnotif', n.channelId, NEEDS.twitchnotif);

    const tc = config.ticketConfig;
    if (tc) {
        checkChannel('tickets', tc.setupChannelId, NEEDS.ticketPanel);
        checkChannel('tickets', tc.categoryId, NEEDS.ticketCategory);
    }

    for (const c of config.imageOnly || []) if (c.enabled) checkChannel('imageonly', c.channelId, NEEDS.imageonly(Number(c.slowmode) || 0));
    for (const c of config.syncChannels || []) checkChannel('syncchat', c.channelId, NEEDS.syncchat);
    for (const a of config.approvals || []) {
        checkChannel('approval', a.channelId, NEEDS.approval);
        if (a.accessType === 'role') checkRole('approval', a.accessId);
    }

    for (const r of config.reactionRoles || []) {
        checkChannel('reactionroles', r.channelId, NEEDS.reactionroles);
        const mapping = Array.isArray(r.roleMapping) ? r.roleMapping.map((m) => m.roleId) : Object.values(r.roleMapping || {});
        for (const roleId of mapping) checkRole('reactionroles', roleId);
    }

    // Eigene Voice-Kanäle entstehen in der Kategorie des Auslöser-Kanals und erben deren Rechte
    const trigger = config.voice?.triggerChannelId;
    if (trigger) {
        const channel = channelOf(trigger);
        checkChannel('voice', channel?.parentId || trigger, NEEDS.voice);
    }

    if (config.liveRole) checkRole('liverole', config.liveRole.liveRoleId);
    for (const a of config.autoRoles || []) if (a.enabled) checkRole('autoroles', a.assignRoleId);

    return { ok: missing.length === 0 && problems.length === 0, missing, problems };
}

module.exports = { checkSetup, NEEDS };
