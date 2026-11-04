// discord/api/guildAccess.js
// Prüft, ob die angemeldete Person den Server im Dashboard verwalten darf:
// verknüpftes Discord-Konto + Administrator-Recht (oder Besitzer) auf genau diesem Server
// — dieselbe Regel wie die Server-Liste in guilds.js. Hängt in api/index.js vor ALLEN
// Routen mit :guildId; vorher reichte jede Twitch-Anmeldung, um fremde Server zu ändern.
const { PermissionFlagsBits } = require('discord.js');
const links = require('../linkStore');

/** Kurzer Speicher, damit nicht jeder Klick im Dashboard Discord fragt. */
const cache = new Map(); // `${guildId}:${userId}` -> { ok, until }
const TTL_MS = 60 * 1000;
const UNKNOWN_MEMBER = 10007;

function requireGuildAdmin(discordClient) {
    return async function guildAdminGuard(req, res, next) {
        const guildId = String(req.params.guildId || '');
        if (!/^\d{5,25}$/.test(guildId)) return res.status(400).json({ error: 'Ungültige Server-ID' });

        const link = links.getLink(req.twitchId);
        if (!link || !link.userId) return res.status(401).json({ error: 'Discord nicht verknüpft' });

        const key = `${guildId}:${link.userId}`;
        const hit = cache.get(key);
        if (hit && hit.until > Date.now()) {
            return hit.ok ? next() : res.status(403).json({ error: 'Keine Berechtigung für diesen Server' });
        }

        const guild = discordClient.guilds.cache.get(guildId);
        if (!guild) return res.status(404).json({ error: 'Der Bot ist nicht auf diesem Server' });

        let member = guild.members.cache.get(link.userId) || null;
        if (!member) {
            try {
                member = await guild.members.fetch(link.userId);
            } catch (e) {
                // Kein Mitglied: das ist eine echte Antwort. Alles andere (Discord hängt,
                // Drosselung) darf niemanden für eine Minute aussperren.
                if (e?.code !== UNKNOWN_MEMBER) return res.status(503).json({ error: 'Discord antwortet gerade nicht. Bitte gleich noch einmal versuchen.' });
                member = null;
            }
        }
        const ok = !!member && (guild.ownerId === member.id || member.permissions.has(PermissionFlagsBits.Administrator));
        cache.set(key, { ok, until: Date.now() + TTL_MS });
        if (cache.size > 5000) for (const [k, v] of cache) if (v.until < Date.now()) cache.delete(k);
        return ok ? next() : res.status(403).json({ error: 'Keine Berechtigung für diesen Server' });
    };
}

module.exports = { requireGuildAdmin };
