// Tests der Clan-Zentrale: Auswertung (clanCentral.js), Discord-Erinnerungen (clanAlerts.js) und ihre Routen.
// Kein Netz und keine echte Datenbank: API und Discord sind Attrappen, die Speicher liegen im Temp-Ordner bzw. im RAM.
// Tags nur aus 0289PYLQGRJCUV (sonst macht normalizeTag sie leer).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cr-clan-central-test-'));
process.env.CR_SCOUT_DB = path.join(tmpDir, 'scout.db');

const express = require('express');
const store = require('../scoutStore');
const history = require('../scoutHistory');
const central = require('../clanCentral');
const alerts = require('../clanAlerts');
const { createScoutRouter } = require('../scoutRoutes');
const crApi = require('../../lib/crApi');

test.after(() => {
  store.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const H = 3600 * 1000;
const DAY = 24 * H;
// Freitag, 20.11.2026, 08:00 UTC — Kriegstag 1 (Donnerstag) läuft noch bis 09:41
const NOW = Date.UTC(2026, 10, 20, 8, 0);
const RESET = Date.UTC(2026, 10, 20, 9, 41);

// ── Daten in aufbereiteter Form (scoutShape) ────────────────────────────────
const member = (tag, name, role, extra = {}) => ({ tag, name, role, lastSeen: NOW - H, expLevel: 0, trophies: 9000, rank: 1, donations: 0, received: 0, ...extra });
const part = (tag, name, decksUsed, decksToday = 0) => ({ tag, name, fame: decksUsed * 100, repair: 0, boatAttacks: 0, decksUsed, decksToday });
const week = (season, w, date, participants) => ({ season, week: w, date, own: { rank: 1, fame: 10000, trophyChange: 20, score: 3000, participants }, standings: [] });

const CLAN = {
  tag: 'QQQ', name: 'Testclan', memberCount: 6,
  members: [
    member('2PP', 'Chef', 'leader', { donations: 40 }),
    member('8YY', 'Fleißig', 'member', { donations: 300 }),
    member('9QQ', 'Weg', 'elder', { lastSeen: NOW - 20 * DAY }),
    member('CCC', 'Halb', 'member', { lastSeen: NOW - 4 * DAY, donations: 10 }),
    member('GGG', 'Neu', 'member'),
    member('JJJ', 'Vize', 'coLeader', { lastSeen: NOW - 15 * DAY }),
  ],
};
const LOG = [
  week(138, 2, Date.UTC(2026, 10, 16, 9, 41), [part('2PP', 'Chef', 16), part('8YY', 'Fleißig', 16), part('9QQ', 'Weg', 0), part('CCC', 'Halb', 8), part('JJJ', 'Vize', 16), part('RRR', 'Ex', 4)]),
  week(138, 1, Date.UTC(2026, 10, 9, 9, 41), [part('2PP', 'Chef', 16), part('8YY', 'Fleißig', 16), part('9QQ', 'Weg', 0), part('CCC', 'Halb', 8), part('JJJ', 'Vize', 16), part('RRR', 'Ex', 16)]),
];
const RACE = {
  state: 'full', periodType: 'warDay', periodIndex: 17, sectionIndex: 2,
  clan: { tag: 'QQQ', name: 'Testclan', fame: 900, participants: [
    part('2PP', 'Chef', 4, 4), part('8YY', 'Fleißig', 2, 2), part('CCC', 'Halb', 0, 0), part('JJJ', 'Vize', 0, 0), part('LLL', 'Ehemalig', 0, 0),
  ] },
  clans: [],
};
// Schnappschüsse (älteste zuerst): Spenden-Wechsel zwischen s1 und s2, 9QQ zurückgestuft, RRR geht, GGG kommt
const snapMember = (tag, name, role, donations = 0) => ({ tag, name, role, lastSeen: NOW - DAY, expLevel: 0, trophies: 9000, donations, received: 0, rank: 1 });
const BASE = [snapMember('2PP', 'Chef', 'leader', 100), snapMember('8YY', 'Fleißig', 'member', 200), snapMember('CCC', 'Halb', 'member'), snapMember('JJJ', 'Vize', 'coLeader')];
const SNAPS = [
  { t: NOW - 10 * DAY, members: [...BASE, snapMember('9QQ', 'Weg', 'coLeader'), snapMember('RRR', 'Ex', 'member', 50)] },
  { t: NOW - 5 * DAY, members: [snapMember('2PP', 'Chef', 'leader', 10), snapMember('8YY', 'Fleißig', 'member', 50), BASE[2], BASE[3], snapMember('9QQ', 'Weg', 'elder'), snapMember('RRR', 'Ex', 'member', 0)] },
  { t: NOW - 6 * H, members: [snapMember('2PP', 'Chef', 'leader', 20), snapMember('8YY', 'Fleißig', 'member', 120), BASE[2], BASE[3], snapMember('9QQ', 'Weg', 'elder')] },
  { t: NOW - 3 * H, members: [snapMember('2PP', 'Chef', 'leader', 30), snapMember('8YY', 'Fleißig', 'member', 250), BASE[2], BASE[3], snapMember('9QQ', 'Weg', 'elder'), snapMember('GGG', 'Neu', 'member')] },
];

// ── Auswertung ───────────────────────────────────────────────────────────────
test('Kriegstag: Tag aus periodIndex, Ende zur Uhrzeit des letzten Rennens', () => {
  assert.equal(central.warDayNumber(RACE), 1);
  assert.equal(central.warDayNumber({ ...RACE, periodIndex: 20 }), 4);
  assert.equal(central.warDayNumber({ ...RACE, periodType: 'training', periodIndex: 14 }), null);
  assert.deepEqual(central.resetMinuteOf(LOG), { minute: 9 * 60 + 41, source: 'log' });
  assert.equal(central.resetMinuteOf([]).source, 'default');
  assert.equal(central.nextDayEnd(NOW, 9 * 60 + 41), RESET);
  assert.equal(central.nextDayEnd(RESET, 9 * 60 + 41), RESET + DAY); // genau zum Ende: der nächste Tag
});

test('Kriegstag: offen sind nur aktuelle Mitglieder, auch die, die noch nicht in der Teilnehmerliste stehen', () => {
  const s = central.warDayStatus(RACE, CLAN, LOG, NOW);
  assert.equal(s.day, 1);
  assert.equal(s.endsAt, RESET);
  // 8YY hat schon angefangen und steht vorn, der Rest nach Namen (Halb, Neu, Vize, Weg)
  assert.deepEqual(s.open.map((p) => [p.tag, p.left]), [['8YY', 2], ['CCC', 4], ['GGG', 4], ['JJJ', 4], ['9QQ', 4]]);
  assert.ok(!s.open.some((p) => p.tag === 'LLL' || p.tag === '2PP'));
  assert.equal(s.open.length, 5);
  assert.equal(s.decksLeft, 2 + 4 * 4);
  assert.equal(central.warDayStatus({ ...RACE, periodType: 'training' }, CLAN, LOG, NOW), null);
});

test('Spenden je Woche: Wechsel, wenn die Mehrheit der Spender zurückfällt; je Woche der höchste Stand', () => {
  const seq = central.stateSequence(SNAPS, CLAN, NOW);
  const d = central.donationWeeks(seq);
  assert.equal(d.weeks.length, 2);
  assert.equal(d.weeks[0].current, true);
  assert.equal(d.weeks[1].start, NOW - 10 * DAY);
  assert.deepEqual(d.byTag.get('8YY').map((w) => w?.given), [300, 200]);
  assert.deepEqual(d.byTag.get('GGG').map((w) => w?.given ?? null), [0, null]);
  // Fällt nur einer von dreien zurück, ist das kein Wochenwechsel
  const t0 = NOW - DAY;
  const one = central.donationWeeks([
    { t: t0, members: new Map([['A', { donations: 50 }], ['B', { donations: 40 }], ['C', { donations: 30 }]]) },
    { t: t0 + H, members: new Map([['A', { donations: 0 }], ['B', { donations: 60 }], ['C', { donations: 30 }]]) },
  ]);
  assert.equal(one.weeks.length, 1);
});

test('Ereignisse: Eintritt, Austritt und Zurückstufung; lange Lücke = ungefähr', () => {
  const ev = central.clanEvents(central.stateSequence(SNAPS, CLAN, NOW));
  assert.deepEqual(ev.map((e) => [e.kind, e.tag]), [['join', 'GGG'], ['leave', 'RRR'], ['demote', '9QQ']]);
  assert.equal(ev[0].approx, undefined); // 3 h Abstand
  assert.equal(ev[1].approx, true);
  assert.deepEqual([ev[2].from, ev[2].to], ['coLeader', 'elder']);
});

test('Zentrale: Ampel, im Clan seit, Vorschläge zum Befördern, Entfernen und Zurückstufen', () => {
  const c = central.buildClanCentral({ clan: CLAN, race: RACE, log: LOG, snaps: SNAPS, now: NOW });
  const by = Object.fromEntries(c.members.map((m) => [m.tag, m]));
  assert.equal(c.warIgnored, false);
  assert.deepEqual(c.counts, { green: 3, yellow: 1, red: 2 });
  assert.equal(by['2PP'].light, 'green');
  assert.equal(by['2PP'].hint, null); // Anführer bekommt keine Vorschläge
  // Fleißig: beide Wochen 16/16, aktiv, Spender, seit dem Rennen vom 9.11. (Untergrenze 2.11.)
  assert.equal(by['8YY'].hint.k, 'promote');
  assert.deepEqual(by['8YY'].hint.why.map((w) => w.k), ['warFull', 'donor', 'tenure']);
  assert.equal(by['8YY'].since.exact, false);
  assert.equal(by['8YY'].since.t, Date.UTC(2026, 10, 2, 9, 41));
  assert.deepEqual(by['8YY'].war, [{ decks: 16, fame: 1600 }, { decks: 16, fame: 1600 }]);
  assert.deepEqual(by['8YY'].warNow, { decks: 2, today: 2, fame: 200 });
  // Weg: 20 Tage offline und zwei Wochen ohne Deck
  assert.equal(by['9QQ'].light, 'red');
  assert.equal(by['9QQ'].hint.k, 'kick');
  assert.deepEqual(by['9QQ'].hint.why.map((w) => w.k), ['offline', 'warNone']);
  // Halb: 4 Tage offline, 16 von 32 Decks → gelb, kein Vorschlag
  assert.equal(by.CCC.light, 'yellow');
  assert.deepEqual(by.CCC.reasons.map((r) => r.k), ['offline', 'warLow']);
  assert.equal(by.CCC.hint, null);
  assert.equal(by.CCC.warRate, 0.5);
  // Neu: Eintritt gesehen, noch keine Kriegswoche
  assert.equal(by.GGG.since.exact, true);
  assert.deepEqual(by.GGG.reasons.map((r) => r.k), ['new']);
  assert.deepEqual(by.GGG.war, [null, null]);
  assert.equal(by.GGG.hint, null);
  // Vize: 15 Tage offline → zurückstufen statt entfernen
  assert.equal(by.JJJ.hint.k, 'demote');
  assert.equal(c.weeks.length, 2);
  assert.equal(c.weeks[0].possible, 16);
  assert.equal(c.warDay.decksLeft, 18);
  assert.deepEqual(c.events.map((e) => e.kind), ['join', 'leave', 'demote']);
  assert.equal(c.history.oldest, NOW - 10 * DAY);
  assert.equal(c.donationWeeks.length, 2);
});

test('Zentrale: spielt der Clan kaum Krieg, zählt nur die Online-Zeit', () => {
  const quietLog = LOG.map((w) => ({ ...w, own: { ...w.own, participants: w.own.participants.map((p) => ({ ...p, decksUsed: 0 })) } }));
  const c = central.buildClanCentral({ clan: CLAN, race: null, log: quietLog, snaps: [], now: NOW });
  const by = Object.fromEntries(c.members.map((m) => [m.tag, m]));
  assert.equal(c.warIgnored, true);
  assert.equal(by.CCC.light, 'yellow'); // nur wegen 4 Tagen offline
  assert.deepEqual(by.CCC.reasons.map((r) => r.k), ['offline']);
  assert.deepEqual(by['9QQ'].hint.why.map((w) => w.k), ['offline']); // kein warNone
  assert.equal(by['8YY'].hint.k, 'promote'); // über die Spenden
  assert.equal(c.warDay, null);
  assert.equal(c.history.snaps, 0);
});

test('Zentrale: ein Kriegs-Clan, in dem 40 % gar nicht spielen, zählt den Krieg trotzdem', () => {
  // Verteilung wie bei einem echten Clan (16.11.2026, immer im Ziel): 22 von 53 ohne Deck, der Median bei 4 von 16
  const decks = [...Array(22).fill(0), 1, 1, 2, 2, 2, 2, 2, 4, 4, 4, 5, 6, 6, 6, 8, 8, 8, 8, 8, 8, 8, 10, 10, 12, 12, 12, 12, 13, 14, 16, 16];
  const tags = decks.map((_, i) => `2${'PYLQGRJCUV'[i % 10]}${'PYLQGRJCUV'[Math.floor(i / 10)]}`);
  const clan = { tag: 'QQQ', name: 'Krieg', members: tags.map((tag) => member(tag, tag, 'member')) };
  const log = [0, 1].map((k) => week(138, 2 - k, Date.UTC(2026, 10, 16 - 7 * k, 9, 30), tags.map((tag, i) => part(tag, tag, decks[i]))));
  const c = central.buildClanCentral({ clan, log, now: NOW });
  assert.equal(c.warIgnored, false);
  assert.equal(c.members[0].light, 'red'); // zwei Wochen ohne Deck
  assert.equal(c.members[0].hint.k, 'kick');
  assert.equal(c.members[decks.length - 1].light, 'green');
  // Wer diese Woche wieder spielt, wird nicht zum Entfernen vorgeschlagen
  const race = { periodType: 'warDay', periodIndex: 19, clan: { participants: [part(tags[0], tags[0], 8, 4)] } };
  const again = central.buildClanCentral({ clan, race, log, now: NOW });
  assert.equal(again.members[0].hint, null);
});

test('Zentrale: ohne Verlauf und Krieg bleibt alles leer statt zu werfen', () => {
  const c = central.buildClanCentral({ clan: { ...CLAN, members: [member('2PP', 'Chef', 'member')] }, now: NOW });
  assert.equal(c.members[0].light, 'green');
  assert.equal(c.members[0].since, null);
  assert.deepEqual(c.weeks, []);
  assert.equal(central.buildClanCentral({ clan: null }), null);
});

// ── Speicher der Erinnerungen ────────────────────────────────────────────────
const HOOK = 'https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz_-0123456789';
const HOOK2 = 'https://discord.com/api/webhooks/223456789012345678/zyxwvutsrqponmlkjihgfedcba_-0123456789';

test('Webhook-Adressen: nur Discord-Webhooks', () => {
  assert.deepEqual(alerts.parseWebhook(` ${HOOK}/ `), { url: HOOK, id: '123456789012345678' });
  assert.equal(alerts.parseWebhook(HOOK.replace('discord.com', 'discordapp.com')).url, HOOK);
  assert.ok(alerts.parseWebhook(HOOK.replace('discord.com', 'canary.discord.com')));
  assert.equal(alerts.parseWebhook('https://evil.example/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz'), null);
  assert.equal(alerts.parseWebhook('http://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz'), null);
  assert.equal(alerts.parseWebhook(''), null);
});

test('Speicher: Webhook verschlüsselt, nie in der Ansicht; höchstens drei Clans je Konto', () => {
  const s = alerts.createClanAlertStore({ file: ':memory:' });
  try {
    assert.deepEqual(s.save('k1', 'QQQ', { remindHours: 3 }), { ok: false, key: 'webhookMissing' });
    assert.deepEqual(s.save('k1', 'QQQ', { clanName: 'Testclan', webhook: { url: HOOK, id: '123456789012345678', name: 'Krieg' }, remindHours: 4, lang: 'en' }), { ok: true });
    const v = s.view('k1', 'QQQ');
    assert.equal(v.hookName, 'Krieg');
    assert.equal(v.hookHint, '…5678');
    assert.equal(v.remindHours, 4);
    assert.equal(v.lang, 'en');
    assert.ok(!JSON.stringify(v).includes('abcdefghij'));
    assert.equal(s.webhookOf('k1', 'QQQ'), HOOK);
    // Ändern ohne neuen Webhook behält den alten; ungültige Stunden → Standard
    s.save('k1', 'QQQ', { clanName: 'Testclan', remindHours: 5, weekly: false });
    assert.equal(s.webhookOf('k1', 'QQQ'), HOOK);
    assert.equal(s.view('k1', 'QQQ').remindHours, 3);
    assert.equal(s.view('k1', 'QQQ').weekly, false);
    s.save('k1', 'QQQ', { webhook: { url: HOOK2, id: '223456789012345678', name: 'Neu' } });
    assert.equal(s.webhookOf('k1', 'QQQ'), HOOK2);
    for (const tag of ['CCC', 'GGG']) assert.equal(s.save('k1', tag, { webhook: { url: HOOK, id: '1', name: '' } }).ok, true);
    assert.deepEqual(s.save('k1', 'JJJ', { webhook: { url: HOOK, id: '1', name: '' } }), { ok: false, key: 'limitKonto' });
    assert.equal(s.listOfKonto('k1').length, 3);
    assert.equal(s.active().length, 3);
    s.markBroken('k1', 'CCC');
    assert.equal(s.active().length, 2);
    assert.equal(s.view('k1', 'CCC').broken, true);
    // Neu gespeicherter Webhook hebt die Pause auf
    s.save('k1', 'CCC', { webhook: { url: HOOK, id: '1', name: '' } });
    assert.equal(s.view('k1', 'CCC').broken, false);
    // Zusammenführen: k1 → k2; QQQ hat k2 schon, dessen Eintrag bleibt
    s.save('k2', 'QQQ', { webhook: { url: HOOK, id: '123456789012345678', name: 'Eigener' } });
    assert.equal(s.moveKonto('k1', 'k2'), 2);
    assert.equal(s.listOfKonto('k1').length, 0);
    assert.deepEqual(s.listOfKonto('k2').map((a) => a.clanTag).sort(), ['CCC', 'GGG', 'QQQ']);
    assert.equal(s.view('k2', 'QQQ').hookName, 'Eigener');
    assert.equal(s.removeKonto('k2'), 3);
    assert.equal(s.listOfKonto('k2').length, 0);
  } finally {
    s.close();
  }
});

test('Nachrichten: Namen können in Discord nichts formatieren oder erwähnen', () => {
  const status = central.warDayStatus(RACE, { ...CLAN, members: [...CLAN.members, member('UUU', '@everyone *fett*', 'member')] }, LOG, NOW);
  const msg = alerts.reminderMessage(status, CLAN, { lang: 'de', url: 'https://x.test/clash/clan/QQQ' });
  const text = msg.embeds[0].description;
  assert.ok(text.includes('@​everyone \\*fett\\*'));
  assert.ok(text.includes('<t:'));
  assert.ok(text.includes('Fleißig — 2 offen'));
  const en = alerts.reminderMessage({ ...status, open: [], decksLeft: 0 }, CLAN, { lang: 'en' });
  assert.ok(en.embeds[0].description.startsWith('Everyone has played'));
  const weekly = alerts.weeklyMessage(central.buildClanCentral({ clan: CLAN, race: null, log: LOG, snaps: SNAPS, now: NOW }), CLAN, { lang: 'de' });
  const fields = Object.fromEntries(weekly.embeds[0].fields.map((f) => [f.name.split(' · ')[0], f.value]));
  assert.ok(fields['Alle Decks gespielt'].includes('Fleißig'));
  assert.equal(fields['Nicht alle Decks gespielt'], 'Halb — 8/16');
  assert.equal(fields['Kein einziges Deck'], 'Weg');
  assert.ok(fields['Meiste Spenden'].startsWith('1. Fleißig — 200')); // abgeschlossene Woche
  assert.ok(fields['Zum Befördern'].includes('Fleißig'));
  assert.ok(fields['Zum Entfernen'].includes('Weg'));
});

// ── Hintergrund-Job ──────────────────────────────────────────────────────────
function workerSetup({ now, log = LOG, race = RACE, kontoGibtEs = null, gone = false } = {}) {
  const s = alerts.createClanAlertStore({ file: ':memory:' });
  const sent = [];
  const calls = [];
  let t = now;
  const worker = alerts.createClanAlertWorker({
    store: s,
    loadClan: async (tag) => { calls.push(`clan:${tag}`); return CLAN; },
    loadRace: async (tag) => { calls.push(`race:${tag}`); return race; },
    loadLog: async (tag) => { calls.push(`log:${tag}`); return log; },
    buildCentral: (tag, clan, r, l) => central.buildClanCentral({ clan, race: r, log: l, snaps: SNAPS, now: t }),
    kontoGibtEs,
    post: async (url, payload) => { sent.push({ url, payload }); return gone ? { ok: false, gone: true } : { ok: true }; },
    now: () => t,
    siteUrl: 'https://x.test',
  });
  return { s, sent, calls, worker, setNow: (v) => { t = v; } };
}

test('Job: Erinnerung einmal je Kriegstag im eingestellten Fenster; außerhalb keine API-Abrufe', async () => {
  const w = workerSetup({ now: Date.UTC(2026, 10, 20, 6, 0) });
  try {
    w.s.save('k1', 'QQQ', { clanName: 'Testclan', webhook: { url: HOOK, id: '1', name: '' }, remindHours: 3, weekly: false });
    await w.worker.tick();
    assert.equal(w.sent.length, 0);
    assert.deepEqual(w.calls, []); // 06:00 liegt vor dem Fenster (06:41)
    w.setNow(Date.UTC(2026, 10, 20, 7, 0));
    await w.worker.tick();
    assert.equal(w.sent.length, 1);
    assert.equal(w.sent[0].url, HOOK);
    assert.equal(w.sent[0].payload.embeds[0].url, 'https://x.test/clash/clan/QQQ?reiter=zentrale');
    w.setNow(Date.UTC(2026, 10, 20, 7, 10));
    await w.worker.tick();
    assert.equal(w.sent.length, 1); // schon erinnert
    // Donnerstag früh endet ein Trainingstag: kein Fenster
    w.setNow(Date.UTC(2026, 10, 19, 8, 0));
    w.calls.length = 0;
    await w.worker.tick();
    assert.deepEqual(w.calls, []);
  } finally {
    w.s.close();
  }
});

test('Job: Wochenbericht am Montag nach dem Rennen, einmal; gelöschter Webhook pausiert', async () => {
  const monday = Date.UTC(2026, 10, 16, 10, 0); // Rennen endete 09:41
  const w = workerSetup({ now: monday, race: { ...RACE, periodType: 'training', periodIndex: 14 } });
  try {
    w.s.save('k1', 'QQQ', { clanName: 'Testclan', webhook: { url: HOOK, id: '1', name: '' }, remindHours: 0, weekly: true });
    await w.worker.tick();
    assert.equal(w.sent.length, 1);
    assert.ok(w.sent[0].payload.embeds[0].title.includes('Saison 138, Woche 2'));
    await w.worker.tick();
    assert.equal(w.sent.length, 1);
    // eine Woche später, aber das Rennen im Verlauf ist alt → nichts
    w.setNow(monday + 7 * DAY);
    await w.worker.tick();
    assert.equal(w.sent.length, 1);
  } finally {
    w.s.close();
  }
  const g = workerSetup({ now: Date.UTC(2026, 10, 20, 7, 0), gone: true });
  try {
    g.s.save('k1', 'QQQ', { clanName: 'Testclan', webhook: { url: HOOK, id: '1', name: '' }, remindHours: 3 });
    await g.worker.tick();
    assert.equal(g.sent.length, 1);
    assert.equal(g.s.view('k1', 'QQQ').broken, true);
    assert.equal(g.s.active().length, 0);
  } finally {
    g.s.close();
  }
});

test('Job: Erinnerungen gelöschter Konten werden entfernt', async () => {
  const w = workerSetup({ now: Date.UTC(2026, 10, 18, 12, 0), kontoGibtEs: (id) => id === 'k1' });
  try {
    w.s.save('k1', 'QQQ', { webhook: { url: HOOK, id: '1', name: '' } });
    w.s.save('k2', 'QQQ', { webhook: { url: HOOK, id: '1', name: '' } });
    await w.worker.tick();
    assert.equal(w.s.listOfKonto('k2').length, 0);
    assert.equal(w.s.listOfKonto('k1').length, 1);
  } finally {
    w.s.close();
  }
});

// ── Routen ───────────────────────────────────────────────────────────────────
const RAW_CLAN = {
  tag: '#QQQ', name: 'Testclan', type: 'inviteOnly', clanScore: 50000, clanWarTrophies: 3000, members: 2,
  memberList: [
    { tag: '#2PP', name: 'Chef', role: 'leader', lastSeen: '20261113T180000.000Z', trophies: 9000, donations: 120, donationsReceived: 80, clanRank: 1 },
    { tag: '#8YY', name: 'Fleißig', role: 'member', trophies: 7000, clanRank: 2 },
  ],
};
const RAW_RACE = {
  state: 'full', periodType: 'warDay', periodIndex: 17, sectionIndex: 2,
  clan: { tag: '#QQQ', name: 'Testclan', fame: 900, participants: [{ tag: '#2PP', name: 'Chef', fame: 400, decksUsed: 4, decksUsedToday: 4 }] },
  clans: [],
};
const RAW_LOG = { items: [{ seasonId: 138, sectionIndex: 1, createdDate: '20261116T094105.000Z', standings: [
  { rank: 1, trophyChange: 20, clan: { tag: '#QQQ', name: 'Testclan', fame: 10000, participants: [{ tag: '#2PP', name: 'Chef', decksUsed: 16 }, { tag: '#8YY', name: 'Fleißig', decksUsed: 3 }] } },
] }] };

test('Routen: Zentrale öffentlich, Erinnerungen nur angemeldet; die Webhook-Adresse geht nie zurück', async () => {
  const responses = { '/clans/%23QQQ': RAW_CLAN, '/clans/%23QQQ/currentriverrace': RAW_RACE, '/clans/%23QQQ/riverracelog': RAW_LOG };
  const api = {
    isConfigured: () => true,
    normalizeTag: crApi.normalizeTag,
    resolvePolRank: async () => null,
    crApiGet: async (p) => responses[p.split('?')[0]] || { notFound: true },
    crApiGetSafe: async (p) => responses[p.split('?')[0]] || null,
  };
  const discord = [];
  const webhookFetch = async (url, opts = {}) => {
    discord.push({ url, method: opts.method || 'GET', body: opts.body ? JSON.parse(opts.body) : null });
    if (url.includes('999999999999999999')) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ name: 'Kriegs-Erinnerung' }) };
  };
  const alertStore = alerts.createClanAlertStore({ file: ':memory:' });
  const requireKonto = (req, res, next) => {
    const id = req.headers['x-konto'];
    if (!id) return res.status(401).json({ error: 'Nicht angemeldet' });
    req.kontoId = id;
    return next();
  };
  const app = express();
  app.use(express.json());
  app.use('/s', createScoutRouter({ api, store, meta: false, crawlSpacingMs: 0, requireKonto, alertStore, webhookFetch }));
  const server = http.createServer(app);
  await new Promise((resolve) => { server.listen(0, '127.0.0.1', resolve); });
  const base = `http://127.0.0.1:${server.address().port}/s`;
  const call = (p, { method = 'GET', body, konto = 'k1' } = {}) => fetch(base + p, {
    method,
    headers: { ...(konto ? { 'x-konto': konto } : null), ...(body ? { 'content-type': 'application/json' } : null) },
    body: body ? JSON.stringify(body) : undefined,
  });
  try {
    const c = await (await call('/clan/QQQ/central', { konto: null })).json();
    assert.equal(c.ok, true);
    assert.deepEqual(c.members.map((m) => m.tag), ['2PP', '8YY']);
    assert.equal(c.weeks[0].season, 138);
    assert.equal(c.members[1].war[0].decks, 3);
    assert.ok(c.warDay && c.warDay.open.some((p) => p.tag === '8YY'));
    assert.equal((await call('/clan/2YY/central')).status, 404);

    assert.equal((await call('/clan/QQQ/alerts', { konto: null })).status, 401);
    assert.equal((await (await call('/clan/QQQ/alerts')).json()).alert, null);
    const bad = await call('/clan/QQQ/alerts', { method: 'PUT', body: { webhook: 'https://example.com/hook', remindHours: 3 } });
    assert.equal(bad.status, 400);
    assert.equal((await bad.json()).key, 'webhookInvalid');
    const gone = await call('/clan/QQQ/alerts', { method: 'PUT', body: { webhook: 'https://discord.com/api/webhooks/999999999999999999/abcdefghijklmnopqrstuvwxyz', remindHours: 3 } });
    assert.equal((await gone.json()).key, 'webhookInvalid');
    const saved = await call('/clan/QQQ/alerts', { method: 'PUT', body: { webhook: HOOK, remindHours: 2, weekly: true, lang: 'en' } });
    const savedText = await saved.text();
    assert.equal(saved.status, 200);
    assert.ok(!savedText.includes('abcdefghij'));
    const got = await (await call('/clan/QQQ/alerts')).json();
    assert.equal(got.alert.hookName, 'Kriegs-Erinnerung');
    assert.equal(got.alert.remindHours, 2);
    assert.equal(got.used, 1);
    assert.ok(!JSON.stringify(got).includes('abcdefghij'));
    // anderes Konto sieht nichts
    assert.equal((await (await call('/clan/QQQ/alerts', { konto: 'k2' })).json()).alert, null);

    discord.length = 0;
    const tested = await call('/clan/QQQ/alerts/test', { method: 'POST' });
    assert.equal(tested.status, 200);
    assert.equal(discord.length, 1);
    assert.equal(discord[0].method, 'POST');
    assert.equal(discord[0].url, `${HOOK}?wait=true`);
    assert.deepEqual(discord[0].body.allowed_mentions, { parse: [] });
    assert.equal(discord[0].body.embeds.length, 2); // Test + Vorschau der Kriegstags-Erinnerung
    assert.equal((await call('/clan/QQQ/alerts/test', { method: 'POST' })).status, 429); // zu schnell nacheinander

    assert.equal((await (await call('/clan/QQQ/alerts', { method: 'DELETE' })).json()).alert, null);
    assert.equal(alertStore.listOfKonto('k1').length, 0);
  } finally {
    await new Promise((resolve) => { server.close(resolve); });
    alertStore.close();
  }
});

test('Schnappschuss aus dem Sammler passt zur Zentrale (Format v1)', () => {
  const packed = history.packClanSnapshot(CLAN, RACE);
  const back = history.unpackClanSnapshot(JSON.parse(JSON.stringify(packed)));
  const c = central.buildClanCentral({ clan: CLAN, race: RACE, log: LOG, snaps: [{ t: NOW - DAY, ...back }], now: NOW });
  assert.equal(c.history.snaps, 1);
  assert.deepEqual(c.events, []);
});
