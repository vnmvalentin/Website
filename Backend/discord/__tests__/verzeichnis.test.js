// Discord-Bot fürs Verzeichnis (Ausbauplan „discord-verzeichnis“): Einladung ohne Administrator, Einrichtungs-Check,
// Begrüßung auf neuen Servern, Befehle auf Englisch und Deutsch, Spaß-Sätze nur passend zum Kanal, Dashboard-Anmeldung
// ohne Twitch (Verknüpfung am Konto). Ohne Discord und ohne Backend/data: alle Speicher im Speicher.
'use strict';

process.env.DISCORD_LINKS_DB = ':memory:';
process.env.STREAM_TOOL_DB = ':memory:';
process.env.STREAM_TOOL_SECRET = 'test-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { PermissionFlagsBits, ChannelType } = require('discord.js');

const { PERMISSION_NAMES, PERMISSION_BITS, inviteUrl, missingOf, BOT_PERMISSIONS } = require('../bot/permissions');
const { checkSetup } = require('../bot/setupCheck');
const { greetNewGuild, greetingChannel, setupLinks, languageForLocale, FRESH_JOIN_MS } = require('../bot/onboarding');
const { commands } = require('../bot/commandDefs');
const { pickLine, isAgeRestricted, LISTS } = require('../bot/commands/funLines');
const { BOT_TEXTS } = require('../bot/botTexts');
const links = require('../linkStore');
const createSetupRouter = require('../api/setup');

// ── Attrappen ────────────────────────────────────────────────────────────────────────────────────────────────────

/** Rechte-Objekt wie discord.js: has(bit | bit[]) — Administrator zählt wie in discord.js als alles. */
function perms(names) {
    const set = new Set(names.map((n) => PermissionFlagsBits[n]));
    const one = (bit) => set.has(PermissionFlagsBits.Administrator) || set.has(bit);
    return { has: (bit) => (Array.isArray(bit) ? bit.every(one) : one(bit)) };
}

function fakeGuild({ me = PERMISSION_NAMES, channels = [], roles = [], botRolePosition = 10, systemChannelId = null } = {}) {
    const meMember = { id: 'bot', permissions: perms(me), roles: { highest: { id: 'botrole', name: 'Bot', position: botRolePosition } } };
    const channelMap = new Map();
    for (const c of channels) {
        channelMap.set(c.id, {
            id: c.id, name: c.name || c.id, type: c.type ?? ChannelType.GuildText, parentId: c.parentId || null,
            rawPosition: c.pos ?? 0, nsfw: !!c.nsfw,
            permissionsFor: () => perms(c.perms || PERMISSION_NAMES),
            sent: [],
            send(payload) { this.sent.push(payload); return Promise.resolve(payload); },
        });
    }
    const roleMap = new Map(roles.map((r) => [r.id, { id: r.id, name: r.name || r.id, position: r.position }]));
    return {
        id: '111111111111111111', name: 'Testserver', preferredLocale: 'en-US', joinedTimestamp: Date.now(),
        members: { me: meMember },
        channels: { cache: channelMap },
        roles: { cache: roleMap },
        systemChannel: systemChannelId ? channelMap.get(systemChannelId) : null,
        _me: meMember,
    };
}

// ── Einladung und Rechte ─────────────────────────────────────────────────────────────────────────────────────────

test('Einladung: kein Administrator, genau die Rechte aus der Liste, beide Scopes', () => {
    assert.equal(PERMISSION_BITS & PermissionFlagsBits.Administrator, 0n);
    for (const name of PERMISSION_NAMES) {
        assert.ok(PermissionFlagsBits[name], `unbekanntes Recht ${name}`);
        assert.ok(BOT_PERMISSIONS[name].length > 10, `Grund für ${name}`);
    }
    const url = new URL(inviteUrl({ clientId: '123', guildId: '456' }));
    assert.equal(url.origin + url.pathname, 'https://discord.com/oauth2/authorize');
    assert.equal(url.searchParams.get('permissions'), PERMISSION_BITS.toString());
    assert.equal(url.searchParams.get('scope'), 'bot applications.commands');
    assert.equal(url.searchParams.get('guild_id'), '456');
    assert.equal(url.searchParams.get('disable_guild_select'), 'true');
    assert.equal(new URL(inviteUrl({ clientId: '123' })).searchParams.get('guild_id'), null);
    assert.equal(inviteUrl({}), null);
});

test('Rechte: Administrator deckt alles ab, sonst wird jedes fehlende genannt', () => {
    assert.deepEqual(missingOf(perms(['Administrator'])), []);
    assert.deepEqual(missingOf(perms(PERMISSION_NAMES)), []);
    assert.deepEqual(missingOf(perms(PERMISSION_NAMES.filter((n) => n !== 'ManageRoles'))), ['ManageRoles']);
    assert.deepEqual(missingOf(null, ['ViewChannel']), ['ViewChannel']);
});

// ── Einrichtungs-Check ───────────────────────────────────────────────────────────────────────────────────────────

test('Check: alles eingerichtet und erlaubt → ok', () => {
    const guild = fakeGuild({ channels: [{ id: 'c1', name: 'willkommen' }], roles: [{ id: 'r1', position: 3 }] });
    const r = checkSetup({
        guild, me: guild._me,
        config: { settings: { welcomeChannel: 'c1', welcomeMessage: 'Hallo', welcomeStyle: 'image' }, liveRole: { liveRoleId: 'r1' } },
    });
    assert.deepEqual(r, { ok: true, missing: [], problems: [] });
});

test('Check: fehlendes Recht im Kanal, gelöschter Kanal, Rolle über dem Bot, fehlendes Server-Recht', () => {
    const guild = fakeGuild({
        me: PERMISSION_NAMES.filter((n) => n !== 'ManageWebhooks'),
        channels: [
            { id: 'c1', name: 'willkommen', perms: ['ViewChannel', 'SendMessages'] },
            { id: 'cat', name: 'Voice', type: ChannelType.GuildCategory, perms: ['ViewChannel'] },
            { id: 'v1', name: 'Kanal erstellen', type: ChannelType.GuildVoice, parentId: 'cat' },
        ],
        roles: [{ id: 'live', name: 'Live', position: 12 }, { id: 'low', name: 'Fan', position: 2 }],
    });
    const r = checkSetup({
        guild, me: guild._me,
        config: {
            settings: { welcomeChannel: 'c1', welcomeMessage: 'Hallo', welcomeStyle: 'image' },
            twitchNotifications: [{ channelId: 'weg', enabled: true }, { channelId: 'c1', enabled: false }],
            voice: { triggerChannelId: 'v1' },
            liveRole: { liveRoleId: 'live' },
            autoRoles: [{ assignRoleId: 'low', enabled: true }],
        },
    });
    assert.equal(r.ok, false);
    assert.deepEqual(r.missing, ['ManageWebhooks']);
    const by = (area) => r.problems.filter((p) => p.area === area);
    assert.deepEqual(by('welcome')[0].missing, ['AttachFiles']);
    assert.equal(by('twitchnotif').length, 1, 'ausgeschaltete Meldung wird nicht geprüft');
    assert.equal(by('twitchnotif')[0].issue, 'gone');
    // Voice: geprüft wird die Kategorie, in der die eigenen Kanäle entstehen
    assert.equal(by('voice')[0].id, 'cat');
    assert.deepEqual(by('voice')[0].missing, ['Connect', 'MoveMembers', 'ManageChannels', 'ManageRoles', 'PinMessages']);
    assert.equal(by('liverole')[0].issue, 'role_above');
    assert.equal(by('autoroles').length, 0, 'Rolle unter dem Bot ist in Ordnung');
});

test('Check: Rollen-Buttons prüfen Kanal und jede Rolle (auch altes Format)', () => {
    const guild = fakeGuild({ channels: [{ id: 'c1' }], roles: [{ id: 'a', position: 1 }, { id: 'b', position: 50 }] });
    const r = checkSetup({
        guild, me: guild._me,
        config: { reactionRoles: [{ channelId: 'c1', roleMapping: [{ roleId: 'a' }, { roleId: 'b' }] }, { channelId: 'c1', roleMapping: { '🙂': 'b' } }] },
    });
    assert.deepEqual(r.problems.map((p) => [p.area, p.id, p.issue]), [['reactionroles', 'b', 'role_above']]);
});

// ── Begrüßung auf neuen Servern ──────────────────────────────────────────────────────────────────────────────────

test('Begrüßung: Sprache aus der Server-Sprache, Links mit vorgewähltem Server', () => {
    assert.equal(languageForLocale('de'), 'de');
    assert.equal(languageForLocale('de-AT'), 'de');
    assert.equal(languageForLocale('en-US'), 'en');
    assert.equal(languageForLocale('fr'), 'en');
    assert.equal(languageForLocale(undefined), 'en');
    const en = setupLinks('42', 'en', 'https://x.test');
    assert.equal(en.dashboard, 'https://x.test/discord-bot?server=42&lang=en');
    assert.equal(en.features, 'https://x.test/tools/discord-bot?lang=en');
    assert.equal(setupLinks('42', 'de', 'https://x.test').dashboard, 'https://x.test/discord-bot?server=42');
});

test('Begrüßung: Systemkanal zuerst, sonst der oberste beschreibbare Textkanal', () => {
    const g1 = fakeGuild({ channels: [{ id: 'a', pos: 0 }, { id: 'sys', pos: 5 }], systemChannelId: 'sys' });
    assert.equal(greetingChannel(g1).id, 'sys');
    const g2 = fakeGuild({
        channels: [{ id: 'zu', pos: 0, perms: ['ViewChannel'] }, { id: 'voice', pos: 1, type: ChannelType.GuildVoice }, { id: 'offen', pos: 2 }],
        systemChannelId: 'zu',
    });
    assert.equal(greetingChannel(g2).id, 'offen');
    assert.equal(greetingChannel(fakeGuild({ channels: [{ id: 'zu', perms: [] }] })), null);
});

test('Begrüßung: postet einmal mit Link-Knöpfen, merkt die Sprache, übergeht alte Beitritte', async () => {
    const guild = fakeGuild({ channels: [{ id: 'sys' }], systemChannelId: 'sys' });
    guild.preferredLocale = 'de';
    const calls = [];
    const r = await greetNewGuild(guild, { initGuildLanguage: (id, lang) => { calls.push([id, lang]); return lang; } });
    assert.deepEqual(r, { greeted: true, lang: 'de' });
    assert.deepEqual(calls, [[guild.id, 'de']]);
    const msg = guild.channels.cache.get('sys').sent[0];
    const json = msg.embeds[0].toJSON();
    assert.equal(json.title, BOT_TEXTS.de.setup.title);
    const buttons = msg.components[0].toJSON().components;
    assert.equal(buttons.length, 2);
    assert.ok(buttons[0].url.includes(`/discord-bot?server=${guild.id}`));

    // Hatte der Server den Bot schon (gespeicherte Sprache Englisch), gilt die gespeicherte Sprache
    const again = fakeGuild({ channels: [{ id: 'sys' }], systemChannelId: 'sys' });
    again.preferredLocale = 'de';
    const r2 = await greetNewGuild(again, { initGuildLanguage: () => 'en' });
    assert.equal(r2.lang, 'en');
    assert.equal(again.channels.cache.get('sys').sent[0].embeds[0].toJSON().title, BOT_TEXTS.en.setup.title);

    const old = fakeGuild({ channels: [{ id: 'sys' }], systemChannelId: 'sys' });
    old.joinedTimestamp = Date.now() - FRESH_JOIN_MS - 1000;
    assert.equal((await greetNewGuild(old, { initGuildLanguage: () => 'de' })).reason, 'not_fresh');
    assert.equal(old.channels.cache.get('sys').sent.length, 0);
});

test('Begrüßung: wirft nie, auch wenn Discord ablehnt', async () => {
    const guild = fakeGuild({ channels: [{ id: 'sys' }], systemChannelId: 'sys' });
    guild.channels.cache.get('sys').send = () => Promise.reject(new Error('Missing Access'));
    const r = await greetNewGuild(guild, { initGuildLanguage: () => 'en', log: { warn() {} } });
    assert.deepEqual(r, { greeted: false, lang: null, reason: 'error' });
});

// ── Slash-Befehle ────────────────────────────────────────────────────────────────────────────────────────────────

test('Befehle: Namen unverändert, Beschreibung Englisch + Deutsch, englische Namen gültig', () => {
    const NAME = /^[-_\p{L}\p{N}\p{sc=Deva}\p{sc=Thai}]{1,32}$/u;
    const names = commands.map((c) => c.name);
    for (const n of ['connect3', 'magische_miesmuschel', 'größe', 'superkraft', 'ausrede', 'punkte', 'rakete', 'duell', 'punkteadmin', 'tagesrennen', 'voice_kick', 'serverstats']) {
        assert.ok(names.includes(n), `Befehl ${n} fehlt`);
    }
    const walk = (items, path) => {
        for (const it of items || []) {
            const where = `${path}/${it.name}`;
            if (it.description !== undefined) {
                assert.ok(it.description.length >= 1 && it.description.length <= 100, `${where}: Beschreibung ${it.description.length}`);
                assert.ok(it.description_localizations?.de, `${where}: deutsche Beschreibung`);
                assert.ok(it.description_localizations.de.length <= 100, `${where}: deutsche Beschreibung zu lang`);
                assert.notEqual(it.description, it.description_localizations.de, `${where}: Standard ist Englisch`);
            }
            for (const [loc, n] of Object.entries(it.name_localizations || {})) {
                assert.ok(['en-US', 'en-GB'].includes(loc), `${where}: ${loc}`);
                assert.ok(NAME.test(n) && n === n.toLowerCase(), `${where}: Name ${n}`);
            }
            walk(it.options, where);
        }
    };
    walk(commands, '');
    const punkte = commands.find((c) => c.name === 'punkte');
    assert.equal(punkte.name_localizations['en-US'], 'points');
    assert.equal(punkte.description_localizations.de, 'Zeigt deinen Kontostand und deine Statistik.');
});

// ── Spaß-Befehle ─────────────────────────────────────────────────────────────────────────────────────────────────

test('Spaß: schlüpfrige Sätze nur in altersbeschränkten Kanälen (und deren Threads)', () => {
    const nsfwDe = new Set(LISTS.ausrede.de.nsfw);
    assert.ok(nsfwDe.size > 0);
    for (let i = 0; i < 400; i++) {
        assert.equal(nsfwDe.has(pickLine('ausrede', 'de', { nsfw: false })), false);
        assert.equal(nsfwDe.has(pickLine('ausrede', 'de', null)), false);
    }
    // Der letzte Eintrag der Gesamtliste ist im altersbeschränkten Kanal erreichbar
    const all = [...LISTS.ausrede.de.safe, ...LISTS.ausrede.de.nsfw];
    assert.equal(pickLine('ausrede', 'de', { nsfw: true }, () => 0.9999), all[all.length - 1]);
    assert.equal(isAgeRestricted({ isThread: () => true, parent: { nsfw: true } }), true);
    assert.equal(isAgeRestricted({ isThread: () => true, parent: { nsfw: false } }), false);
});

test('Spaß: Englisch hat eigene Listen und alle Antworttexte', () => {
    assert.ok(LISTS.superkraft.en.safe.length >= 40);
    assert.ok(LISTS.ausrede.en.safe.length >= 40);
    assert.equal(LISTS.superkraft.en.nsfw.length, 0);
    assert.ok(pickLine('superkraft', 'en', null).startsWith('You'));
    for (const lang of ['de', 'en']) {
        const t = BOT_TEXTS[lang].fun;
        assert.equal(t.conchAnswers.length, 20, `${lang}: Ja und Nein je zehn`);
        assert.ok(t.coin(t.heads, '👑').includes(t.heads));
        assert.equal(BOT_TEXTS[lang].lang, lang);
    }
});

// ── Dashboard ohne Twitch: Verknüpfung am Konto ──────────────────────────────────────────────────────────────────

test('Verknüpfung: Twitch-ID wie bisher, ohne Twitch am Konto, Umzug und Löschen mit dem Konto', () => {
    const tok = { userId: 'd1', username: 'Mika', avatar: '', accessToken: 'a', refreshToken: 'r', expiresAt: 0 };
    assert.equal(links.linkKeyOf({ twitchId: 't1', kontoId: 'k1' }), 't1');
    assert.equal(links.linkKeyOf({ kontoId: 'k1' }), 'konto:k1');
    assert.equal(links.linkKeyOf({}), null);

    // Discord-Konto verknüpft, später kommt Twitch dazu: die Verknüpfung am Konto gilt weiter
    links.setLink('konto:k1', tok);
    assert.equal(links.linkKeyOf({ twitchId: 't1', kontoId: 'k1' }), 'konto:k1');
    assert.equal(links.getLink(links.linkKeyOf({ twitchId: 't1', kontoId: 'k1' })).userId, 'd1');
    // Giveaways fragen nach Twitch-IDs: ein Konto-Schlüssel ist keine
    assert.equal(links.twitchIdOfDiscord('d1'), null);
    links.setLink('t9', { ...tok, userId: 'd9' });
    assert.equal(links.twitchIdOfDiscord('d9'), 't9');

    links.kontoUmziehen('k2', 'k1');
    assert.equal(links.getLink('konto:k1'), null);
    assert.equal(links.getLink('konto:k2').userId, 'd1');
    links.setLink('konto:k3', { ...tok, userId: 'd3' });
    links.kontoUmziehen('k2', 'k3'); // Ziel hat schon eine: die alte fällt weg
    assert.equal(links.getLink('konto:k3'), null);
    assert.equal(links.getLink('konto:k2').userId, 'd1');
    links.kontoLoeschen('k2');
    assert.equal(links.getLink('konto:k2'), null);
});

// ── Unterstützer-Rolle (Anschluss unterstuetzer-discord) ─────────────────────────────────────────────────────────

test('Unterstützer-Rolle: nur vergeben, nie nehmen; fehlende Mitglieder und Fehler zählen, ohne Einstellung nichts', async () => {
    const { syncSupporterRole, startSupporterRoleSync } = require('../bot/supporterRole');
    const added = [];
    const member = (id, has = false) => ({ id, roles: { cache: new Map(has ? [['role', {}]] : []), add: async (r) => { if (id === 'kaputt') throw new Error('Missing Permissions'); added.push([id, r]); } } });
    const guild = {
        roles: { cache: new Map([['role', { id: 'role' }]]) },
        members: {
            cache: new Map([['a', member('a')], ['b', member('b', true)]]),
            fetch: async (id) => { if (id === 'weg') throw Object.assign(new Error('Unknown Member'), { code: 10007 }); return member(id); },
        },
    };
    const client = { guilds: { cache: new Map([['g', guild]]) } };
    const r = await syncSupporterRole(client, { ids: () => ['a', 'b', 'weg', 'kaputt', 'c', 'a'], guildId: 'g', roleId: 'role', log: { warn() {} } });
    assert.deepEqual(r, { added: 2, missing: 1, failed: 1 });
    assert.deepEqual(added, [['a', 'role'], ['c', 'role']]);
    assert.equal((await syncSupporterRole(client, { ids: () => ['a'], guildId: '', roleId: 'role' })).skipped, 'not_configured');
    assert.equal((await syncSupporterRole(client, { ids: () => ['a'], guildId: 'g', roleId: 'fehlt' })).skipped, 'no_role');
    assert.equal(startSupporterRoleSync(client, { ids: () => [], guildId: '', roleId: '' }), null);
});

// ── Schnittstelle ────────────────────────────────────────────────────────────────────────────────────────────────

async function withServer(router, fn) {
    const app = express();
    app.use('/api/discord', router);
    const server = app.listen(0);
    await new Promise((r) => server.once('listening', r));
    try {
        return await fn(`http://127.0.0.1:${server.address().port}/api/discord`);
    } finally {
        server.close();
    }
}

test('Schnittstelle: Bot-Zahlen öffentlich, Check nur angemeldet und nur für Server mit Bot', async () => {
    const guild = fakeGuild({ channels: [{ id: 'c1', perms: ['ViewChannel'] }] });
    const client = { isReady: () => true, guilds: { cache: new Map([[guild.id, guild]]) } };
    const requireAuth = (req, res, next) => (req.headers['x-test-user'] ? next() : res.status(401).json({ error: 'Nicht angemeldet' }));
    const router = createSetupRouter({
        requireAuth, discordClient: client, clientId: '999',
        loadConfig: () => ({ settings: { welcomeChannel: 'c1', welcomeMessage: 'Hi', welcomeStyle: 'text' } }),
    });
    await withServer(router, async (base) => {
        const info = await (await fetch(`${base}/bot-info`)).json();
        assert.equal(info.ready, true);
        assert.equal(info.servers, 1);
        assert.ok(info.invite.includes('client_id=999'));
        assert.equal((await fetch(`${base}/guilds/${guild.id}/check`)).status, 401);
        const res = await fetch(`${base}/guilds/${guild.id}/check`, { headers: { 'x-test-user': '1' } });
        assert.equal(res.status, 200);
        const check = await res.json();
        assert.equal(check.ok, false);
        assert.deepEqual(check.problems[0].missing, ['SendMessages']);
        assert.ok(check.invite.includes(`guild_id=${guild.id}`));
        assert.equal(check.botRole.name, 'Bot');
        const missing = await fetch(`${base}/guilds/222222222222222222/check`, { headers: { 'x-test-user': '1' } });
        assert.equal(missing.status, 404);
    });
});
