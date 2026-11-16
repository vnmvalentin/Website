// discord/bot/memberCard.js
// Ein- und Austrittsnachricht als Karte: Name und Profilbild des Mitglieds oben,
// das Profilbild groß daneben, der eingestellte Text darunter. Bewusst ein
// Discord-Embed und kein gezeichnetes Bild — dafür bräuchte der Bot eine
// Bildbibliothek, die es im Projekt nicht gibt.
const { EmbedBuilder } = require('discord.js');
const { botText } = require('./botText');

const COLORS = { welcome: 0x5865f2, leave: 0x747f8d };

/**
 * @param {import('discord.js').GuildMember} member
 * @param {string} text   fertige Nachricht (Platzhalter schon ersetzt)
 * @param {'welcome'|'leave'} kind
 */
function memberCard(member, text, kind) {
    const t = botText(member);
    const user = member.user;
    const name = member.displayName || user?.globalName || user?.username || t.unknown;
    const avatar = (size) => (typeof member.displayAvatarURL === 'function'
        ? member.displayAvatarURL({ size })
        : user?.displayAvatarURL?.({ size })) || null;

    const embed = new EmbedBuilder()
        .setColor(COLORS[kind] || COLORS.welcome)
        .setAuthor({ name, iconURL: avatar(64) || undefined })
        // Discord erlaubt höchstens 4096 Zeichen
        .setDescription(String(text).slice(0, 4096))
        .setFooter({ text: kind === 'leave' ? t.card.leaveFooter(member.guild.memberCount) : t.card.welcomeFooter(member.guild.memberCount) })
        .setTimestamp();
    const big = avatar(256);
    if (big) embed.setThumbnail(big);
    return embed;
}

module.exports = { memberCard };
