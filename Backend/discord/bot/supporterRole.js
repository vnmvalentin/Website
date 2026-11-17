// discord/bot/supporterRole.js — Unterstützer bekommen auf dem eigenen Discord-Server eine Rolle (Anschluss
// „unterstuetzer-discord“ von Spur A, erledigt mit discord-verzeichnis).
//
// Quelle: ladenDienst.discordIdsDerUnterstuetzer() (Backend/laden/, nur lesen) — Discord-IDs aller Unterstützer mit
// verknüpftem Discord. Abgleich beim Start und stündlich; vergeben wird nur, nie weggenommen (eine Unterstützung
// läuft nicht ab). Welcher Server und welche Rolle, steht in der Server-.env:
//   DISCORD_UNTERSTUETZER_GUILD_ID, DISCORD_UNTERSTUETZER_ROLE_ID   — fehlt eins, passiert nichts.
// Die Bot-Rolle muss auf dem Server über der Unterstützer-Rolle stehen (sonst lehnt Discord ab; steht im Log).

const SYNC_MS = 60 * 60 * 1000;
const UNKNOWN_MEMBER = 10007;

/**
 * Ein Abgleich: gibt jedem Unterstützer, der auf dem Server ist und die Rolle noch nicht hat, die Rolle.
 * @returns {Promise<{ added: number, missing: number, failed: number, skipped?: string }>}
 */
async function syncSupporterRole(client, { ids, guildId, roleId, log = console }) {
    if (!guildId || !roleId) return { added: 0, missing: 0, failed: 0, skipped: 'not_configured' };
    const guild = client?.guilds?.cache?.get(String(guildId));
    if (!guild) return { added: 0, missing: 0, failed: 0, skipped: 'no_guild' };
    if (!guild.roles.cache.get(String(roleId))) return { added: 0, missing: 0, failed: 0, skipped: 'no_role' };

    let list = [];
    try { list = [...new Set((await ids()) || [])].map(String); } catch (e) {
        log.warn?.(`[Discord] Unterstützer-Rolle: Liste nicht lesbar: ${e.message}`);
        return { added: 0, missing: 0, failed: 0, skipped: 'no_list' };
    }
    let added = 0; let missing = 0; let failed = 0;
    for (const id of list) {
        let member = guild.members.cache.get(id) || null;
        if (!member) {
            try { member = await guild.members.fetch(id); } catch (e) {
                if (e?.code === UNKNOWN_MEMBER) { missing++; continue; }
                failed++; continue;
            }
        }
        if (!member || member.roles.cache.has(String(roleId))) continue;
        try {
            await member.roles.add(String(roleId), 'Unterstützer auf vnmvalentin.de');
            added++;
        } catch (e) {
            failed++;
            log.warn?.(`[Discord] Unterstützer-Rolle für ${id} nicht vergeben: ${e.message}`);
        }
    }
    return { added, missing, failed };
}

/** Startet den Abgleich (sobald der Bot bereit ist, danach stündlich). Ohne Einstellung tut er nichts. */
function startSupporterRoleSync(client, { ids, guildId = process.env.DISCORD_UNTERSTUETZER_GUILD_ID, roleId = process.env.DISCORD_UNTERSTUETZER_ROLE_ID, log = console } = {}) {
    if (!guildId || !roleId || typeof ids !== 'function') return null;
    const run = () => syncSupporterRole(client, { ids, guildId, roleId, log })
        .then((r) => { if (r.added) log.log?.(`[Discord] Unterstützer-Rolle vergeben: ${r.added}`); })
        .catch((e) => log.warn?.(`[Discord] Unterstützer-Rolle: ${e.message}`));
    if (typeof client.isReady === 'function' && client.isReady()) run();
    else client.once('clientReady', run);
    const timer = setInterval(run, SYNC_MS);
    if (typeof timer.unref === 'function') timer.unref();
    return { run, stop: () => clearInterval(timer) };
}

module.exports = { syncSupporterRole, startSupporterRoleSync, SYNC_MS };
