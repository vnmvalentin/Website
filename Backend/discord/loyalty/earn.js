// discord/loyalty/earn.js
// Punkte verdienen: je Nachricht (gedrosselt) und je Minute im Voice.
const store = require('./store');

const VOICE_TICK_MS = 60_000;

/** Aus messageCreate: Punkte für eine Nachricht. Fehler dürfen den Chat nie stören. */
function onLoyaltyMessage(message) {
    try {
        if (!message.guildId || message.author?.bot || message.webhookId) return;
        store.onMessage(message.guildId, message.author.id);
    } catch (e) {
        console.warn('[Punkte] Nachricht:', e.message);
    }
}

/**
 * Wer zählt im Voice: kein Bot, nicht taub geschaltet, nicht im AFK-Kanal und nicht allein
 * (mindestens zwei Menschen im Kanal) — sonst parkt man sich einfach über Nacht rein.
 */
function eligibleVoiceMembers(guild) {
    const out = [];
    for (const channel of guild.channels.cache.values()) {
        if (!channel.isVoiceBased?.() || channel.id === guild.afkChannelId) continue;
        const humans = [...channel.members.values()].filter(m => !m.user.bot);
        if (humans.length < 2) continue;
        for (const m of humans) {
            if (m.voice?.selfDeaf || m.voice?.serverDeaf) continue;
            out.push(m.id);
        }
    }
    return out;
}

function voiceTick(client) {
    for (const guildId of store.enabledGuilds()) {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) continue;
        const cfg = store.getConfig(guildId);
        if (cfg.perVoiceMinute <= 0) continue;
        for (const userId of eligibleVoiceMembers(guild)) {
            try { store.addVoiceMinutes(guildId, userId, 1, cfg.perVoiceMinute); } catch (e) { console.warn('[Punkte] Voice:', e.message); }
        }
    }
}

function startLoyaltyVoiceTicker(client) {
    const t = setInterval(() => {
        try { voiceTick(client); } catch (e) { console.warn('[Punkte] Voice-Runde:', e.message); }
    }, VOICE_TICK_MS);
    t.unref?.();
    return t;
}

module.exports = { onLoyaltyMessage, startLoyaltyVoiceTicker, eligibleVoiceMembers, voiceTick };
