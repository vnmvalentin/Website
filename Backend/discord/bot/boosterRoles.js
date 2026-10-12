// discord/bot/boosterRoles.js
// Booster-Perk: Rollen aus Reaktionsrollen-Setups in einem Booster-Kanal gehören zum Boost.
// Endet der Boost, werden sie wieder entfernt.
//
// Ein "Booster-Kanal" wird an seinen Berechtigungen erkannt, ohne eigene Einstellung:
// @everyone sieht ihn nicht, die Server-Booster-Rolle hat "Kanal ansehen" ausdrücklich erlaubt.
//
// Entfernt wird nur bei Mitgliedern, die nicht mehr boosten UND den Kanal nicht mehr sehen —
// wer ihn über eine andere Rolle (Admin, Mod) weiter sieht, behält seine Rolle.
const { PermissionFlagsBits } = require('discord.js');
const { getReactionRoles } = require('../database/db');

const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000;

const roleIdsOf = (config) => (Array.isArray(config.roleMapping)
    ? config.roleMapping.map(m => m.roleId)
    : Object.values(config.roleMapping || {})).filter(Boolean);

/** @returns {{ channel: object, roleIds: string[] }[]} Booster-Kanäle mit ihren Rollen */
function boosterSetups(guild) {
    const boosterRole = guild.roles.premiumSubscriberRole;
    if (!boosterRole) return [];

    const byChannel = new Map();
    const publicRoleIds = new Set();
    for (const config of getReactionRoles(guild.id)) {
        const channel = guild.channels.cache.get(config.channelId);
        if (!channel) continue;
        const everyoneSees = channel.permissionsFor(guild.roles.everyone)?.has(PermissionFlagsBits.ViewChannel) ?? true;
        const boosterAllowed = channel.permissionOverwrites?.cache.get(boosterRole.id)?.allow.has(PermissionFlagsBits.ViewChannel) ?? false;
        if (everyoneSees || !boosterAllowed) {
            roleIdsOf(config).forEach(id => publicRoleIds.add(id));
            continue;
        }
        if (!byChannel.has(channel.id)) byChannel.set(channel.id, { channel, roleIds: [] });
        byChannel.get(channel.id).roleIds.push(...roleIdsOf(config));
    }

    // Eine Rolle, die es auch in einem frei zugänglichen Setup gibt, ist kein Booster-Perk
    return [...byChannel.values()]
        .map(s => ({ channel: s.channel, roleIds: [...new Set(s.roleIds)].filter(id => !publicRoleIds.has(id)) }))
        .filter(s => s.roleIds.length > 0);
}

/** Entfernt die Booster-Rollen eines Mitglieds, falls es keinen Anspruch mehr hat. @returns {Promise<number>} Anzahl entfernter Rollen */
async function cleanupBoosterRoles(member, setups = boosterSetups(member.guild)) {
    if (member.user.bot || member.premiumSince) return 0;

    const toRemove = new Set();
    for (const { channel, roleIds } of setups) {
        if (channel.permissionsFor(member)?.has(PermissionFlagsBits.ViewChannel)) continue;
        roleIds.filter(id => member.roles.cache.has(id)).forEach(id => toRemove.add(id));
    }
    if (toRemove.size === 0) return 0;

    try {
        await member.roles.remove([...toRemove], 'Server-Boost beendet');
        return toRemove.size;
    } catch (e) {
        console.error(`[BoosterRollen] Entfernen bei ${member.user.tag} fehlgeschlagen:`, e.message);
        return 0;
    }
}

// Fängt alles auf, was das Ereignis verpasst: Boost endete, während der Bot aus war, oder das Mitglied war nicht im Cache
async function sweepBoosterRoles(client) {
    for (const guild of client.guilds.cache.values()) {
        try {
            const setups = boosterSetups(guild);
            if (setups.length === 0) continue;
            const members = await guild.members.fetch();
            let removed = 0;
            for (const member of members.values()) removed += await cleanupBoosterRoles(member, setups);
            if (removed > 0) console.log(`[BoosterRollen] ${guild.name}: ${removed} Rolle(n) von ehemaligen Boostern entfernt`);
        } catch (e) {
            console.error(`[BoosterRollen] Prüfung für ${guild.name} fehlgeschlagen:`, e.message);
        }
    }
}

function startBoosterRoleSweep(client) {
    sweepBoosterRoles(client);
    const timer = setInterval(() => sweepBoosterRoles(client), SWEEP_INTERVAL_MS);
    timer.unref?.();
}

module.exports = { boosterSetups, cleanupBoosterRoles, sweepBoosterRoles, startBoosterRoleSweep };
