// discord/bot/commands/funLines.js — ein zufälliger Satz für /superkraft und /ausrede, in der Sprache des Servers.
//
// Schlüpfrige Sätze (Block NSFW in data/superkraefte.js und data/ausreden.js) kommen nur in Kanälen, die in Discord
// als „Altersbeschränkt“ markiert sind (auch in Threads solcher Kanäle). Discords Regeln für Apps und die Bot-Listen
// verlangen das — ohne diese Sperre käme der Bot in kein Verzeichnis (Ausbauplan „discord-verzeichnis“).
const SUPERKRAEFTE = require('./data/superkraefte');
const AUSREDEN = require('./data/ausreden');
const SUPERPOWERS = require('./data/superpowers');
const EXCUSES = require('./data/excuses');

const LISTS = {
    superkraft: { de: SUPERKRAEFTE, en: SUPERPOWERS },
    ausrede: { de: AUSREDEN, en: EXCUSES },
};

/** Ist der Kanal (oder der Kanal über dem Thread) in Discord als altersbeschränkt markiert? */
function isAgeRestricted(channel) {
    if (!channel) return false;
    if (channel.nsfw === true) return true;
    try {
        if (typeof channel.isThread === 'function' && channel.isThread()) return channel.parent?.nsfw === true;
    } catch { /* kein Thread */ }
    return false;
}

/**
 * @param {'superkraft'|'ausrede'} kind
 * @param {'de'|'en'} lang
 * @param {object|null} channel  discord.js-Kanal der Anfrage
 * @param {() => number} [rnd]
 */
function pickLine(kind, lang, channel, rnd = Math.random) {
    const lists = (LISTS[kind] || LISTS.ausrede)[lang === 'en' ? 'en' : 'de'];
    const pool = isAgeRestricted(channel) ? [...lists.safe, ...lists.nsfw] : lists.safe;
    return pool[Math.floor(rnd() * pool.length)];
}

module.exports = { pickLine, isAgeRestricted, LISTS };
