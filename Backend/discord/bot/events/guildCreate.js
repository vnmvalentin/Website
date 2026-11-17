// discord/bot/events/guildCreate.js — der Bot wurde einem Server hinzugefügt: Sprache aus der Server-Sprache übernehmen
// und eine Einrichtungshilfe posten (bot/onboarding.js).
const { initGuildLanguage } = require('../../database/db');
const { greetNewGuild } = require('../onboarding');

module.exports = {
    name: 'guildCreate',
    once: false,
    async execute(guild) {
        const r = await greetNewGuild(guild, { initGuildLanguage });
        console.log(`[Discord] Neuer Server: ${guild.name} (${guild.memberCount || 0} Mitglieder) — Sprache ${r.lang || '?'}, ${r.greeted ? 'begrüßt' : `nicht begrüßt (${r.reason})`}`);
    },
};
