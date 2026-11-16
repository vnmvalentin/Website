// discord/bot/botText.js — die Bot-Texte (botTexts.js) in der Sprache eines Servers.
// Sprache je Server: im Dashboard unter „Allgemein“ (guild_settings.bot_language, getBotLanguage in database/db.js).
const { BOT_TEXTS, botTextFor } = require('./botTexts');

// Die Datenbank erst beim ersten Nachschlagen laden: Wer nur ein Modul mit botText einbindet (Prüfstände für
// loyalty/games.js), soll dabei nicht schon discord_data.db öffnen.
let getBotLanguage = null;
function languageOf(guildId) {
    if (!guildId) return 'de';
    if (!getBotLanguage) getBotLanguage = require('../database/db').getBotLanguage;
    return getBotLanguage(guildId);
}

/**
 * Die Texte für einen Server.
 * @param {string|object|null} where  Server-ID, ein Guild-Objekt, ein Mitglied, eine Interaction oder Message
 */
function botText(where) {
    const id = typeof where === 'string' ? where : (where?.guildId || where?.guild?.id || where?.id || '');
    return botTextFor(languageOf(id));
}

module.exports = { botText, botTextFor, BOT_TEXTS };
