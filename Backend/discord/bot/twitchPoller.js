// discord/bot/twitchPoller.js
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
const { getAllEnabledTwitchNotifications, updateLastAnnouncedStreamId } = require('../database/db');
const { step } = require('../../lib/startupLog');

const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const POLL_INTERVAL_MS = 2 * 60 * 1000; // 2 Minuten

let appToken = null;
let tokenExpiresAt = 0;

async function getAppToken() {
    if (appToken && Date.now() < tokenExpiresAt) return appToken;

    const res = await fetch('https://id.twitch.tv/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            grant_type: 'client_credentials',
        }),
    });

    if (!res.ok) throw new Error(`Token-Fehler: ${res.status}`);
    const data = await res.json();
    appToken = data.access_token;
    // 5 Minuten vor Ablauf erneuern
    tokenExpiresAt = Date.now() + Math.max(0, (data.expires_in - 300)) * 1000;
    console.log('[TwitchPoller] App-Token erneuert.');
    return appToken;
}

async function fetchLiveStreams(usernames) {
    if (!usernames.length) return [];
    const token = await getAppToken();

    // Helix erlaubt max 100 user_login pro Request
    const chunks = [];
    for (let i = 0; i < usernames.length; i += 100) chunks.push(usernames.slice(i, i + 100));

    const liveStreams = [];
    for (const chunk of chunks) {
        const params = chunk.map(u => `user_login=${encodeURIComponent(u.toLowerCase())}`).join('&');
        const res = await fetch(`https://api.twitch.tv/helix/streams?${params}&first=100`, {
            headers: { 'Client-Id': CLIENT_ID, 'Authorization': `Bearer ${token}` },
        });

        if (res.status === 401) {
            appToken = null;
            throw new Error('Token ungültig — wird beim nächsten Durchlauf erneuert.');
        }
        if (!res.ok) throw new Error(`Streams-API Fehler: ${res.status}`);

        const data = await res.json();
        liveStreams.push(...(data.data || []));
    }
    return liveStreams;
}

async function poll(discordClient) {
    try {
        const notifications = getAllEnabledTwitchNotifications();
        if (!notifications.length) return;

        const usernames = [...new Set(notifications.map(n => n.twitchUsername.toLowerCase()))];
        const liveStreams = await fetchLiveStreams(usernames);

        // Map: login (lowercase) → stream-Objekt
        const liveMap = new Map(liveStreams.map(s => [s.user_login.toLowerCase(), s]));

        for (const notif of notifications) {
            const stream = liveMap.get(notif.twitchUsername.toLowerCase());

            // Nicht live
            if (!stream) {
                // Stream-ID zurücksetzen wenn offline (damit nächste Session neu announced wird)
                if (notif.lastAnnouncedStreamId) {
                    updateLastAnnouncedStreamId(notif.id, '');
                }
                continue;
            }

            // Bereits für diese Stream-Session announced
            if (stream.id === notif.lastAnnouncedStreamId) continue;

            const guild = discordClient.guilds.cache.get(notif.guildId);
            if (!guild) continue;

            const channel = guild.channels.cache.get(notif.channelId);
            if (!channel) {
                console.warn(`[TwitchPoller] Kanal ${notif.channelId} nicht gefunden (Guild ${notif.guildId})`);
                continue;
            }

            const message = (notif.messageTemplate || '🔴 **{streamer}** ist jetzt live! {url}')
                .replace(/\{streamer\}/g, stream.user_name)
                .replace(/\{game\}/g,    stream.game_name || 'Unbekannt')
                .replace(/\{title\}/g,   stream.title || '')
                .replace(/\{url\}/g,     `https://twitch.tv/${stream.user_login}`);

            try {
                await channel.send(message);
                updateLastAnnouncedStreamId(notif.id, stream.id);
                console.log(`[TwitchPoller] Benachrichtigung gesendet: ${stream.user_name} → #${channel.name}`);
            } catch (e) {
                console.error(`[TwitchPoller] Nachricht-Fehler für ${notif.twitchUsername}:`, e.message);
            }
        }
    } catch (e) {
        console.error('[TwitchPoller] Fehler beim Polling:', e.message);
    }
}

function startTwitchPoller(discordClient) {
    if (!CLIENT_ID || !CLIENT_SECRET) {
        step("Twitch-Poller", "warn", "TWITCH_CLIENT_ID/SECRET fehlt");
        return;
    }

    step("Twitch-Poller", true, `alle ${POLL_INTERVAL_MS / 1000}s`);
    // Ersten Poll nach 10 Sekunden (Bot muss erst ready sein)
    setTimeout(() => {
        poll(discordClient);
        setInterval(() => poll(discordClient), POLL_INTERVAL_MS);
    }, 10_000);
}

module.exports = { startTwitchPoller };
