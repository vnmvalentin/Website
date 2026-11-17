// discord/bot/permissions.js — welche Discord-Rechte der Bot braucht, wofür, und wie die Einladung aussieht
// (Ausbauplan „discord-verzeichnis“).
//
// Früher lud die Einladung den Bot mit „Administrator“ ein. Für Bot-Listen und Discords App-Verzeichnis ist das ein
// Warnzeichen, und Server-Admins geben es ungern. Jetzt fragt die Einladung genau die Rechte an, die der Code benutzt
// (nachgesehen in commands/, events/, api/ und loyalty/). Server, die den Bot schon als Administrator haben, behalten das.
//
// Fehlt dem Bot auf einem Server ein Recht, sagt es der Einrichtungs-Check im Dashboard (setupCheck.js) — mit
// Bereich und Kanal, statt dass eine Funktion still ausfällt.
const { PermissionFlagsBits } = require('discord.js');

/** Jedes Recht mit dem Grund, warum der Bot es braucht (Schlüssel = discord.js-Name). */
const BOT_PERMISSIONS = {
    ViewChannel: 'Kanäle sehen, die im Dashboard gewählt werden',
    SendMessages: 'Begrüßung, Antworten, Twitch-Meldungen, Panels für Tickets/Rollen/Genehmigung',
    SendMessagesInThreads: 'Genehmigungs-Anfragen laufen in privaten Threads',
    EmbedLinks: 'Karten (Embeds) für Begrüßung, Statistik, Punkte, Tickets',
    AttachFiles: 'gezeichnetes Begrüßungs-/Abschiedsbild',
    ReadMessageHistory: 'Panels und Ranglisten später aktualisieren',
    UseExternalEmojis: 'Server-Emojis in Rollen-Buttons und Nachrichten',
    MentionEveryone: 'Twitch-Meldungen dürfen @everyone oder eine Rolle anpingen',
    ManageMessages: 'Image-Only-Kanäle löschen Nachrichten ohne Bild',
    // Seit 2025 ein eigenes Recht — „Nachrichten verwalten“ reicht zum Anheften nicht mehr
    PinMessages: 'eigene Voice-Kanäle heften ihre Befehlsübersicht an',
    ManageChannels: 'eigene Voice-Kanäle, Ticket-Kanäle, Slowmode in Image-Only-Kanälen',
    ManageRoles: 'Rollen-Buttons, Auto-/Live-/Booster-Rollen, Rechte in Voice- und Ticket-Kanälen',
    ManageWebhooks: 'Taverne (serverübergreifender Chat) schreibt über einen Webhook',
    ManageThreads: 'Genehmigungs-Threads anlegen und schließen',
    CreatePrivateThreads: 'Genehmigungs-Threads anlegen',
    Connect: 'Mitglieder in ihren eigenen Voice-Kanal verschieben',
    MoveMembers: 'Mitglieder in ihren Voice-Kanal verschieben oder hinauswerfen (/voice_kick)',
    ChangeNickname: 'eigener Name des Bots auf dem Server (Dashboard → Allgemein)',
};

const PERMISSION_NAMES = Object.keys(BOT_PERMISSIONS);

/** Die Rechte als Bitfeld (BigInt), wie Discord sie in der Einladung erwartet. */
const PERMISSION_BITS = PERMISSION_NAMES.reduce((sum, name) => sum | PermissionFlagsBits[name], 0n);

const SCOPES = ['bot', 'applications.commands'];

/**
 * Einladungs-Link des Bots.
 * @param {object} opts
 * @param {string} opts.clientId  Anwendungs-ID (DISCORD_CLIENT_ID)
 * @param {string} [opts.guildId] Server vorauswählen (Dashboard: „Bot einladen“ bei einem bestimmten Server)
 * @returns {string|null} null ohne Anwendungs-ID
 */
function inviteUrl({ clientId, guildId } = {}) {
    if (!clientId) return null;
    const params = new URLSearchParams({
        client_id: String(clientId),
        permissions: PERMISSION_BITS.toString(),
        scope: SCOPES.join(' '),
    });
    if (guildId) {
        params.set('guild_id', String(guildId));
        params.set('disable_guild_select', 'true');
    }
    return `https://discord.com/oauth2/authorize?${params}`;
}

/**
 * Welche der benötigten Rechte fehlen in einem Rechte-Objekt (discord.js PermissionsBitField oder etwas mit has()).
 * Administrator deckt alles ab.
 * @param {{ has: (bit: bigint) => boolean } | null} perms
 * @param {string[]} [names] nur diese Rechte prüfen (Standard: alle)
 * @returns {string[]} fehlende Rechte (discord.js-Namen)
 */
function missingOf(perms, names = PERMISSION_NAMES) {
    if (!perms || typeof perms.has !== 'function') return [...names];
    if (perms.has(PermissionFlagsBits.Administrator)) return [];
    return names.filter((name) => !perms.has(PermissionFlagsBits[name]));
}

module.exports = { BOT_PERMISSIONS, PERMISSION_NAMES, PERMISSION_BITS, SCOPES, inviteUrl, missingOf };
