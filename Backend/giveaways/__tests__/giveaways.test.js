// Giveaways mit Bedingungen (Ausbauplan „giveaways“): Regeln, Speicher mit Übernahme der alten JSON-Datei, Ablauf
// mit Attrappen für Twitch/Discord/Chat, Routen. Datenbanken nur im Speicher, alte Datei im Temp-Ordner.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const core = require('../core');
const { createGiveawayStore } = require('../store');
const { createGiveawayDienst } = require('../dienst');
const createGiveawayRouter = require('../routes');

const T0 = 1_800_000_000_000;
const MIN = 60000;
const leererStore = () => createGiveawayStore({ file: ':memory:', importFile: '' });

/** Dienst mit Attrappen. folgt: Set der Twitch-IDs, die folgen. */
function aufbau({ folgt = new Set(), mitglieder = new Set(), links = {}, konten = {} } = {}) {
  let uhr = T0;
  const store = leererStore();
  const said = [];
  const dms = [];
  const gemeldet = [];
  const webhooks = [];
  const posts = [];
  const twitch = {
    kanalLogin: () => 'kanal',
    folgt: async (id) => folgt.has(String(id)),
    liveStream: async () => null,
    chatters: async () => [],
    status: () => ({ verbunden: true }),
  };
  const discord = {
    bereit: () => true,
    server: () => [{ id: 'g1', name: 'Server', channels: [{ id: 'c1', name: 'giveaways' }] }],
    sprache: () => 'de',
    istMitglied: async (_g, id) => mitglieder.has(String(id)),
    poste: async (channelId) => { posts.push(channelId); return { channelId, messageId: `m${posts.length}` }; },
    bearbeite: async () => {},
    entferne: async () => {},
    dm: async (id, text) => { dms.push({ id, text }); },
  };
  const dienst = createGiveawayDienst({
    store,
    operatorId: 'op',
    now: () => uhr,
    twitch,
    discord,
    discordNachricht: (d) => ({ d }),
    links: {
      discordVon: (tw) => links[tw] || null,
      twitchVon: (dc) => Object.keys(links).find((tw) => links[tw] === dc) || null,
    },
    konten: { kontoVonTwitch: (tw) => konten[tw] || null },
    melde: async (n) => { gemeldet.push(n); },
    say: (login, text) => said.push(text),
    webhook: async (text) => { webhooks.push(text); },
    chatBatchMs: 0,
    frontendUrl: 'https://beispiel.de',
  });
  return { dienst, store, said, dms, gemeldet, webhooks, posts, tick: (ms) => { uhr += ms; }, uhr: () => uhr };
}

const neu = (patch = {}) => ({ title: 'Steam-Karte', prize: '10 €', quantity: 1, endDate: T0 + 30 * MIN, ...patch });

/* ── Regeln ──────────────────────────────────────────────────────────────── */

test('Eingabe: Titel, Ende, Grenzen, Stichwort', () => {
  assert.equal(core.pruefeEingabe({ endDate: T0 + MIN * 5 }, T0).error, 'title_missing');
  assert.equal(core.pruefeEingabe(neu({ endDate: T0 + 10 }), T0).error, 'bad_end');
  assert.equal(core.pruefeEingabe(neu({ endDate: T0 + 61 * 24 * 3600 * 1000 }), T0).error, 'bad_end');
  const g = core.pruefeEingabe(neu({ quantity: 999, bedingungen: { follow: true, streams: 99 }, wege: { chat: true }, stichwort: 'Mitmachen', ziehung: 'stream' }), T0).giveaway;
  assert.equal(g.quantity, core.MAX_QUANTITY);
  assert.deepEqual(g.bedingungen, { follow: true, discord: false, streams: core.MAX_STREAMS });
  assert.deepEqual(g.wege, { website: true, chat: true, discord: false });
  assert.equal(g.stichwort, '!mitmachen');
  assert.equal(g.ziehung, 'stream');
  assert.equal(core.cleanStichwort('!x'), '!giveaway', 'zu kurz → Standard');
  assert.equal(core.cleanStichwort('!mit leerzeichen'), '!giveaway');
});

test('Bedingungen: Gründe statt nur ja/nein', () => {
  const g = core.normalize({ bedingungen: { follow: true, discord: true, streams: 3 } });
  assert.deepEqual(core.bewerte(g, { twitchId: '1', discordId: 'd', follow: true, discordMember: true, streams: 3 }).ok, true);
  const r = core.bewerte(g, { twitchId: '1', discordId: null, follow: false, streams: 1 }).ergebnisse;
  assert.deepEqual(r.map((e) => e.grund), ['not_following', 'no_discord_link', 'streams_short']);
  assert.deepEqual([r[2].wert, r[2].noetig], [1, 3]);
  assert.equal(core.bewerte(g, { twitchId: '1', discordId: 'd', follow: null, discordMember: null, streams: 5 }).ergebnisse[0].grund, 'check_unavailable');
  assert.equal(core.bewerte(g, { discordId: 'd', discordMember: true }).ergebnisse[0].grund, 'need_twitch', 'nur Discord, aber Twitch-Bedingung');
  assert.equal(core.bewerte(core.normalize({}), {}).ok, true, 'ohne Bedingungen darf jeder');
});

test('Altbestand: requirements twitch-follow wird zu bedingungen.follow', () => {
  assert.equal(core.normalize({ requirements: [{ type: 'twitch-follow' }] }).bedingungen.follow, true);
});

test('Mischen: jede Reihenfolge, keine doppelt (Fisher-Yates)', () => {
  const zaehler = new Map();
  for (let i = 0; i < 6000; i++) {
    const r = core.mische(['a', 'b', 'c']).join('');
    zaehler.set(r, (zaehler.get(r) || 0) + 1);
  }
  assert.equal(zaehler.size, 6);
  for (const n of zaehler.values()) assert.ok(n > 800 && n < 1200, `ungleich verteilt: ${[...zaehler]}`);
  assert.deepEqual(core.mische(['x']), ['x']);
});

test('Chat-Stichwort: nur das erste Wort, Groß/klein egal', () => {
  assert.equal(core.chatStichwort('!GIVEAWAY bitte'), '!giveaway');
  assert.equal(core.chatStichwort('hallo !giveaway'), '');
});

/* ── Speicher ────────────────────────────────────────────────────────────── */

test('Alte giveaways.json wird genau einmal übernommen', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-'));
  try {
    const json = path.join(dir, 'giveaways.json');
    const db = path.join(dir, 'giveaways.db');
    fs.writeFileSync(json, JSON.stringify([
      { id: 'alt1', title: 'Alt', prize: 'Key', quantity: 1, endDate: Date.now() - 1000, requirements: [{ type: 'twitch-follow' }],
        participants: { 11: { displayName: 'Anna', profileImageUrl: 'https://static-cdn.jtvnw.net/a.png' } }, winners: ['11'] },
      { id: 'alt2', title: 'Läuft', quantity: 2, endDate: Date.now() + 3600 * 1000, participants: { 12: { displayName: 'Bert' } }, winners: [] },
      { id: 'alt3', title: 'Leer vorbei', endDate: Date.now() - 1000, participants: {}, winners: [] },
    ]));
    const s1 = createGiveawayStore({ file: db, importFile: json });
    assert.equal(s1.alle().length, 3);
    const alt1 = s1.hole('alt1');
    assert.equal(alt1.bedingungen.follow, true);
    assert.equal(alt1.winners[0].name, 'Anna');
    assert.ok(alt1.drawnAt > 0);
    assert.equal(s1.anzahl('alt2'), 1);
    assert.equal(core.zustand(s1.hole('alt2')), 'offen');
    assert.ok(s1.hole('alt3').drawnAt > 0, 'vorbei ohne Teilnehmer gilt als gezogen');
    assert.deepEqual(s1.offeneTeilnahmen().map((set) => [...set]), [['12']]);
    s1.loesche('alt2');
    s1.schliesse();
    const s2 = createGiveawayStore({ file: db, importFile: json });
    assert.equal(s2.hole('alt2'), null, 'nicht noch einmal übernommen');
    s2.schliesse();
    assert.ok(fs.existsSync(json), 'alte Datei bleibt liegen');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/* ── Ablauf ──────────────────────────────────────────────────────────────── */

test('Website: Bedingung „folgt“, doppelt mitmachen, austragen', async () => {
  const folgt = new Set();
  const { dienst, store } = aufbau({ folgt });
  const { giveaway } = await dienst.anlegen(neu({ bedingungen: { follow: true } }), 'op');
  let r = await dienst.mitmachen(giveaway.id, { twitchId: '7', name: 'Anna' }, 'website');
  assert.equal(r.error, 'conditions');
  assert.equal(r.ergebnisse[0].grund, 'not_following');
  folgt.add('7');
  // Ein Nein gilt nur kurz — gleich danach klappt es (Zwischenspeicher fürs Nein)
  r = await dienst.mitmachen(giveaway.id, { twitchId: '7', name: 'Anna' }, 'website');
  assert.equal(r.error, 'conditions', 'innerhalb von 45 s noch aus dem Zwischenspeicher');
  const zweiter = aufbau({ folgt: new Set(['7']) });
  const g2 = (await zweiter.dienst.anlegen(neu({ bedingungen: { follow: true } }), 'op')).giveaway;
  assert.deepEqual(await zweiter.dienst.mitmachen(g2.id, { twitchId: '7', name: 'Anna' }, 'website'), { ok: true, neu: true, title: 'Steam-Karte' });
  assert.equal((await zweiter.dienst.mitmachen(g2.id, { twitchId: '7', name: 'Anna' }, 'website')).neu, false);
  assert.deepEqual(zweiter.dienst.meine('7'), [g2.id]);
  assert.deepEqual(zweiter.dienst.austragen(g2.id, '7'), { ok: true });
  assert.equal(zweiter.store.anzahl(g2.id), 0);
  assert.equal(store.anzahl(giveaway.id), 0);
  // Der Betreiber muss sich nicht selbst folgen
  assert.equal((await dienst.mitmachen(giveaway.id, { twitchId: 'op', name: 'Kanal' }, 'website')).ok, true);
});

test('Wege: Chat und Discord nur, wenn eingeschaltet; Discord-Konto mit Twitch-Verknüpfung zählt einmal', async () => {
  const { dienst, store } = aufbau({ links: { 7: 'dc7' } });
  await dienst.setzeDiscord({ guildId: 'g1', channelId: 'c1' });
  const ohne = (await dienst.anlegen(neu(), 'op')).giveaway;
  assert.equal((await dienst.mitmachen(ohne.id, { discordId: 'dc9', name: 'X' }, 'discord')).error, 'way_closed');
  const mit = (await dienst.anlegen(neu({ wege: { discord: true } }), 'op')).giveaway;
  assert.equal((await dienst.mitmachen(mit.id, { twitchId: '7', name: 'Anna' }, 'website')).neu, true);
  assert.equal((await dienst.mitmachen(mit.id, { discordId: 'dc7', name: 'Anna (Discord)' }, 'discord')).neu, false, 'dieselbe Person');
  assert.equal((await dienst.mitmachen(mit.id, { discordId: 'dc9', name: 'Neu' }, 'discord')).neu, true);
  assert.equal(store.anzahl(mit.id), 2);
  assert.ok(store.hole(mit.id).discordMessage, 'Beitrag im Discord angelegt');
});

test('Bedingung „auf dem Discord-Server“ und „war bei N Streams“', async () => {
  const { dienst, store } = aufbau({ mitglieder: new Set(['dc7']), links: { 7: 'dc7' } });
  await dienst.setzeDiscord({ guildId: 'g1', channelId: '' });
  const g = (await dienst.anlegen(neu({ bedingungen: { discord: true, streams: 2 } }), 'op')).giveaway;
  let r = await dienst.pruefe(g.id, { twitchId: '7' });
  assert.deepEqual(r.ergebnisse.map((e) => [e.id, e.ok]), [['discord', true], ['streams', false]]);
  // Zwei Streams im Chat gesehen
  dienst._setzeLive({ key: 's1', startedAt: T0 - 3 * 24 * 3600 * 1000 });
  await dienst.onChatMessage('#kanal', { 'user-id': '7', 'display-name': 'Anna' }, 'hallo');
  dienst._setzeLive({ key: 's2', startedAt: T0 - 24 * 3600 * 1000 });
  await dienst.onChatMessage('#kanal', { 'user-id': '7', 'display-name': 'Anna' }, 'hi');
  await dienst.onChatMessage('#fremd', { 'user-id': '7' }, 'zählt nicht');
  assert.equal(store.streamsVon('7', 0), 2);
  r = await dienst.pruefe(g.id, { twitchId: '7' });
  assert.equal(r.ok, true);
  // Ohne verknüpftes Discord
  r = await dienst.pruefe(g.id, { twitchId: '8' });
  assert.equal(r.ergebnisse[0].grund, 'no_discord_link');
});

test('Chat: Stichwort trägt ein, Grund kommt einmal, Bestätigung gesammelt', async () => {
  const { dienst, store, said } = aufbau({ folgt: new Set(['1']) });
  const g = (await dienst.anlegen(neu({ wege: { chat: true }, stichwort: '!los', bedingungen: { follow: true } }), 'op')).giveaway;
  await dienst.onChatMessage('#kanal', { 'user-id': '1', 'display-name': 'Anna' }, '!LOS');
  await dienst.onChatMessage('#kanal', { 'user-id': '2', 'display-name': 'Bert' }, '!los');
  await dienst.onChatMessage('#kanal', { 'user-id': '2', 'display-name': 'Bert' }, '!los');
  await dienst.onChatMessage('#kanal', { 'user-id': '3', 'display-name': 'Cleo' }, '!giveaway');
  assert.equal(store.anzahl(g.id), 1);
  assert.deepEqual(said.filter((s) => s.startsWith('@Bert')).length, 1, 'Grund nur einmal');
  assert.match(said.find((s) => s.startsWith('@Bert')), /folge erst dem Kanal/);
  await new Promise((r) => setTimeout(r, 5));
  assert.ok(said.some((s) => s.includes('Dabei: Anna') && s.includes('!los')), said.join(' | '));
});

test('Ziehung: Anzahl, keine doppelt, Entfolgte fallen raus, Benachrichtigungen', async () => {
  const folgt = new Set(['1', '2', '3', '4']);
  const { dienst, store, said, dms, gemeldet, webhooks } = aufbau({ folgt, links: { 1: 'dc1', 2: 'dc2', 3: 'dc3' }, konten: { 1: 'k1', 2: 'k2', 3: 'k3' } });
  const g = (await dienst.anlegen(neu({ quantity: 2, bedingungen: { follow: true }, ziehung: 'stream' }), 'op')).giveaway;
  for (const id of ['1', '2', '3', '4']) assert.equal((await dienst.mitmachen(g.id, { twitchId: id, name: `N${id}` }, 'website')).ok, true);
  folgt.delete('4'); // entfolgt nach dem Mitmachen
  const r = await dienst.ziehe(g.id);
  assert.equal(r.winners.length, 2);
  const keys = store.hole(g.id).winners.map((w) => w.key);
  assert.equal(new Set(keys).size, 2);
  assert.ok(!keys.includes('t:4') || false, 'Entfolgter gewinnt nicht');
  assert.equal(core.zustand(store.hole(g.id)), 'gezogen');
  assert.equal(dms.length, 2);
  assert.match(dms[0].text, /gewonnen/);
  assert.deepEqual(gemeldet.map((m) => m.thema), ['giveaways', 'giveaways']);
  assert.equal(gemeldet[0].url, '/Giveaways');
  assert.ok(said.some((s) => s.includes('Gewonnen hat @')));
  assert.equal(webhooks.length, 1);
  assert.equal((await dienst.ziehe(g.id)).error, 'already_drawn');
  // Bühne zeigt den Moment, nach 45 s nicht mehr
  assert.equal(dienst.buehne().show.gewinner.length, 2);
});

test('Neu ziehen ersetzt genau einen Gewinner; ist niemand übrig, sagt es das', async () => {
  const { dienst, store } = aufbau();
  const g = (await dienst.anlegen(neu({ quantity: 1 }), 'op')).giveaway;
  for (const id of ['1', '2']) await dienst.mitmachen(g.id, { twitchId: id, name: `N${id}` }, 'website');
  await dienst.ziehe(g.id);
  const erster = store.hole(g.id).winners[0].key;
  const r = await dienst.zieheNeu(g.id, 0);
  assert.equal(r.ok, true);
  const zweiter = store.hole(g.id).winners[0].key;
  assert.notEqual(zweiter, erster);
  assert.deepEqual(store.hole(g.id).ersetzt, [erster]);
  assert.equal(dienst.buehne().show.gewinner.length, 1, 'Overlay zeigt nur den Neuen');
  assert.equal((await dienst.zieheNeu(g.id, 0)).error, 'no_candidates');
  assert.equal((await dienst.zieheNeu(g.id, 5)).error, 'not_found');
});

test('Takt: „automatisch“ zieht am Ende, „im Stream“ wartet auf den Knopf', async () => {
  const { dienst, store, tick } = aufbau();
  const auto = (await dienst.anlegen(neu(), 'op')).giveaway;
  const stream = (await dienst.anlegen(neu({ ziehung: 'stream' }), 'op')).giveaway;
  await dienst.mitmachen(auto.id, { twitchId: '1', name: 'A' }, 'website');
  await dienst.mitmachen(stream.id, { twitchId: '1', name: 'A' }, 'website');
  tick(31 * MIN);
  await dienst.takt();
  assert.equal(core.zustand(store.hole(auto.id)), 'gezogen');
  assert.equal(core.zustand(store.hole(stream.id), T0 + 31 * MIN), 'wartet');
  assert.equal((await dienst.mitmachen(stream.id, { twitchId: '2', name: 'B' }, 'website')).error, 'closed');
  assert.equal(dienst.buehne().laufend.id, stream.id, 'Overlay zeigt das wartende');
  assert.equal(dienst.buehne().show.id, auto.id, 'gleich nach der Ziehung: der Moment im Overlay');
  tick(core.SHOW_MS);
  assert.equal(dienst.buehne().show, null);
});

test('Öffentliche Ansicht verrät keine Twitch- oder Discord-IDs', async () => {
  const { dienst } = aufbau({ links: { 1: 'dc1' } });
  const g = (await dienst.anlegen(neu(), 'op')).giveaway;
  await dienst.mitmachen(g.id, { twitchId: '1', name: 'Anna', avatar: 'https://static-cdn.jtvnw.net/x.png' }, 'website');
  await dienst.ziehe(g.id);
  const text = JSON.stringify([dienst.oeffentlich(), dienst.buehne()]);
  assert.ok(!text.includes('dc1') && !text.includes('"t:1"'), text);
  assert.ok(text.includes('Anna'));
});

/* ── Routen ──────────────────────────────────────────────────────────────── */

test('Routen: nur der Betreiber legt an und zieht, Anzeigename muss zum Login passen, fremde Bilder fliegen raus', async () => {
  const { dienst, store } = aufbau();
  const app = express();
  app.use(express.json());
  const requireAuth = (req, res, next) => {
    if (!req.get('x-user')) return res.status(401).json({ error: 'login', code: 'no_login' });
    req.twitchId = req.get('x-user');
    req.twitchLogin = req.get('x-login') || 'login';
    next();
  };
  app.use('/', createGiveawayRouter({ requireAuth, STREAMER_TWITCH_ID: 'op', dienst, ohneTakt: true }));
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, p, { user, login, body } = {}) => {
    const res = await fetch(base + p, {
      method,
      headers: { 'content-type': 'application/json', ...(user ? { 'x-user': user, 'x-login': login || '' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json() };
  };
  try {
    let r = await call('POST', '/api/giveaways', { user: '5', body: neu() });
    assert.equal(r.status, 403);
    assert.equal(r.body.code, 'owner_only');
    r = await call('POST', '/api/giveaways', { user: 'op', body: neu({ endDate: T0 - 1 }) });
    assert.equal(r.body.code, 'bad_end');
    r = await call('POST', '/api/giveaways', { user: 'op', body: neu() });
    assert.equal(r.status, 201);
    const id = r.body.giveaway.id;

    r = await call('POST', `/api/giveaways/${id}/join`, {
      user: '5', login: 'anna', body: { displayName: 'Admin', profileImageUrl: 'https://boese.example/x.png' },
    });
    assert.equal(r.status, 200);
    const row = store.teilnehmer(id)[0];
    assert.equal(row.name, 'anna', 'fremder Anzeigename wird nicht übernommen');
    assert.equal(row.avatar, '');
    await call('POST', `/api/giveaways/${id}/join`, { user: '6', login: 'bert', body: { displayName: 'BERT', profileImageUrl: 'https://static-cdn.jtvnw.net/jtv/b.png' } });
    assert.equal(store.teilnehmer(id)[1].name, 'BERT');
    assert.equal(store.teilnehmer(id)[1].avatar, 'https://static-cdn.jtvnw.net/jtv/b.png');

    assert.deepEqual((await call('GET', '/api/giveaways/mein', { user: '5' })).body, { dabei: [id], betreiber: false });
    assert.equal((await call('GET', `/api/giveaways/${id}/pruefen`, { user: '5' })).body.dabei, true);
    assert.equal((await call('GET', '/api/giveaways')).body.active[0].count, 2);
    assert.equal((await call('POST', `/api/giveaways/${id}/ziehen`, { user: '5' })).status, 403);
    r = await call('POST', `/api/giveaways/${id}/ziehen`, { user: 'op' });
    assert.equal(r.body.winners.length, 1);
    assert.equal((await call('GET', '/api/giveaways/buehne')).body.show.id, id);
    assert.equal((await call('GET', '/api/giveaways/einstellungen', { user: '5' })).status, 403);
    r = await call('PUT', '/api/giveaways/einstellungen', { user: 'op', body: { guildId: 'g1', channelId: 'falsch' } });
    assert.equal(r.body.code, 'bad_channel');
    r = await call('PUT', '/api/giveaways/einstellungen', { user: 'op', body: { guildId: 'g1', channelId: 'c1' } });
    assert.equal(r.body.discord.channelId, 'c1');
    assert.equal((await call('DELETE', `/api/giveaways/${id}`, { user: 'op' })).status, 200);
    assert.equal((await call('GET', `/api/giveaways/${id}/pruefen`, { user: '5' })).status, 404);
  } finally {
    server.close();
  }
});
