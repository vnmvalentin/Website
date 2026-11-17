// discord/bot/onboarding.js — was passiert, wenn der Bot einem neuen Server beitritt (Ausbauplan „discord-verzeichnis“):
//
// 1. Sprache: Ein Server ohne gespeicherte Einstellungen bekommt die Sprache des Bots aus seiner Server-Sprache
//    (Deutsch → Deutsch, alles andere → Englisch). Wer den Bot schon einmal hatte, behält seine Wahl.
// 2. Begrüßung: Eine kurze Nachricht mit Knöpfen zum Dashboard (dieser Server ist dort gleich ausgewählt) und zur
//    Funktionsübersicht — im Systemkanal des Servers oder im ersten Textkanal, in dem der Bot schreiben darf.
//
// Wer den Bot hinzugefügt hat, verrät Discord nur über das Audit-Log (eigenes Recht) — deshalb keine Direktnachricht.
const { ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { botTextFor } = require('./botTexts');

/** Joins älter als das sind kein frisches Hinzufügen (z. B. ein Server, der nach einer Discord-Störung zurückkommt). */
const FRESH_JOIN_MS = 10 * 60 * 1000;

/** Sprache des Bots aus der Server-Sprache (guild.preferredLocale, z. B. "de", "en-US", "fr"). */
const languageForLocale = (locale) => (/^de\b/i.test(String(locale || '')) ? 'de' : 'en');

const siteUrl = () => (process.env.FRONTEND_URL || 'https://vnmvalentin.de').replace(/\/+$/, '');

/** Links der Begrüßung: Dashboard mit vorgewähltem Server und die Funktionsübersicht in der Sprache des Bots. */
function setupLinks(guildId, lang, base = siteUrl()) {
    const en = lang === 'en' ? '&lang=en' : '';
    return {
        dashboard: `${base}/discord-bot?server=${encodeURIComponent(guildId)}${en}`,
        features: `${base}/tools/discord-bot${lang === 'en' ? '?lang=en' : ''}`,
    };
}

const CAN_GREET = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks];

/**
 * Der Kanal für die Begrüßung: Systemkanal, sonst der oberste Textkanal, in dem der Bot schreiben darf.
 * @returns {object|null}
 */
function greetingChannel(guild) {
    const me = guild?.members?.me;
    if (!me) return null;
    const canWrite = (channel) => {
        try { return !!channel && channel.type === ChannelType.GuildText && !!channel.permissionsFor(me)?.has(CAN_GREET); } catch { return false; }
    };
    if (canWrite(guild.systemChannel)) return guild.systemChannel;
    const texts = [...guild.channels.cache.values()]
        .filter((c) => c.type === ChannelType.GuildText)
        .sort((a, b) => (a.rawPosition ?? a.position ?? 0) - (b.rawPosition ?? b.position ?? 0));
    return texts.find(canWrite) || null;
}

/** Die Nachricht selbst (Embed + Link-Knöpfe) in der Sprache des Bots. */
function setupMessage({ guildId, guildName, lang, base }) {
    const t = botTextFor(lang).setup;
    const links = setupLinks(guildId, lang, base);
    const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(t.title)
        .setDescription([t.intro(guildName), '', ...t.steps.map((step, i) => `**${i + 1}.** ${step}`), '', t.footer].join('\n'));
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(t.dashboardButton).setURL(links.dashboard),
        new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(t.featuresButton).setURL(links.features),
    );
    return { embeds: [embed], components: [row] };
}

/**
 * Begrüßt einen frisch beigetretenen Server. Wirft nie (ein Fehler hier darf den Bot nicht stören).
 * @param {object} guild discord.js-Guild
 * @param {object} deps  { initGuildLanguage(guildId, lang) → gespeicherte Sprache, log }
 * @returns {Promise<{ greeted: boolean, lang: string|null, reason?: string }>}
 */
async function greetNewGuild(guild, { initGuildLanguage, log = console, now = Date.now() } = {}) {
    try {
        if (!guild?.id) return { greeted: false, lang: null, reason: 'no_guild' };
        if (guild.joinedTimestamp && now - guild.joinedTimestamp > FRESH_JOIN_MS) return { greeted: false, lang: null, reason: 'not_fresh' };
        const wanted = languageForLocale(guild.preferredLocale);
        const lang = (initGuildLanguage && initGuildLanguage(guild.id, wanted)) || wanted;
        const channel = greetingChannel(guild);
        if (!channel) return { greeted: false, lang, reason: 'no_channel' };
        await channel.send(setupMessage({ guildId: guild.id, guildName: guild.name, lang }));
        return { greeted: true, lang };
    } catch (e) {
        log.warn?.(`[Discord] Begrüßung auf neuem Server fehlgeschlagen: ${e.message}`);
        return { greeted: false, lang: null, reason: 'error' };
    }
}

module.exports = { greetNewGuild, greetingChannel, setupMessage, setupLinks, languageForLocale, FRESH_JOIN_MS };
