// Overlay-Modul „Subathon-Timer“: Logik am Server (subathonCore.js, ohne Datenbank), Konfiguration und Texte im
// Frontend, Anbindung an Routen und Chat-Bot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import {
  MODULE_DEFAULTS, THEMED_IDS, SUBATHON_RULE_KEYS, defaultConfig, mergeConfig, withLanguage,
  subathonClock, subathonDelta, subathonRemaining, subathonStartMs, toSubathonView, subathonWhat, demoSubathon,
} from '../streamToolConfig.js';
import { OVERLAY_TEXTS, overlayFormat } from '../overlayI18n.js';
import { EDITOR_TEXTS } from '../editorI18n.js';

const require = createRequire(import.meta.url);
// subathonCore.js und chatText.js haben keine Abhängigkeiten (keine Datenbank, kein Twitch)
const core = require('../../../../../Backend/streamTool/lib/subathonCore.js');
const { CHAT_TEXTS } = require('../../../../../Backend/streamTool/lib/chatText.js');
const backend = (rel) => fs.readFileSync(new URL(`../../../../../Backend/${rel}`, import.meta.url), 'utf8');

const MIN = 60000;
const mod = (patch = {}) => ({ ...MODULE_DEFAULTS.subathon, enabled: true, ...patch });
const T0 = 1_700_000_000_000;

test('Regeln: Frontend und Server haben dieselben Schlüssel und Standardwerte', () => {
  assert.deepEqual(SUBATHON_RULE_KEYS, core.RULE_KEYS);
  assert.deepEqual(MODULE_DEFAULTS.subathon.rules, core.DEFAULT_RULES);
  assert.equal(MODULE_DEFAULTS.subathon.startMinutes, core.DEFAULT_START_MINUTES);
  assert.equal(MODULE_DEFAULTS.subathon.enabled, false, 'neu eingeführt: standardmäßig aus');
  assert.ok(THEMED_IDS.includes('subathon'), 'folgt dem gemeinsamen Design');
});

test('Ablauf: starten, anhalten, weiter, abgelaufen', () => {
  let s = core.emptyState();
  s = core.start(s, mod({ startMinutes: 30 }), T0);
  assert.equal(s.status, 'running');
  assert.equal(core.remainingNow(s, T0 + 10 * MIN), 20 * MIN);

  s = core.pause(s, T0 + 10 * MIN);
  assert.equal(s.status, 'paused');
  assert.equal(s.remainingMs, 20 * MIN);
  // Pause zählt weder zur Restzeit noch zur gelaufenen Zeit
  assert.equal(core.remainingNow(s, T0 + 60 * MIN), 20 * MIN);
  assert.equal(core.elapsedNow(s, T0 + 60 * MIN), 10 * MIN);

  s = core.start(s, mod(), T0 + 60 * MIN);
  assert.equal(s.status, 'running');
  assert.equal(core.remainingNow(s, T0 + 70 * MIN), 10 * MIN);

  const ended = core.tick(s, T0 + 80 * MIN + 1);
  assert.equal(ended.status, 'ended');
  assert.equal(ended.remainingMs, 0);
  assert.equal(core.elapsedNow(ended, T0 + 999 * MIN), 30 * MIN, 'gelaufen = Startzeit');
  assert.equal(core.start(ended, mod(), T0 + 90 * MIN).status, 'ended', 'Start nach Ende braucht erst Zurücksetzen');
  assert.equal(core.reset(ended).status, 'idle');
  assert.equal(core.reset(ended).log.length, 0);
});

test('Startzeit und Obergrenze', () => {
  assert.equal(core.startMsOf(mod({ startMinutes: 0 })), 60 * MIN, 'leer/0 → Standard');
  assert.equal(core.startMsOf(mod({ startMinutes: 'x' })), 60 * MIN);
  assert.equal(core.capMsOf(mod({ capHours: 0 })), 0);
  assert.equal(core.capMsOf(mod({ capHours: 24 })), 24 * 60 * MIN);
  // Startzeit über der Obergrenze → Obergrenze
  const s = core.start(core.emptyState(), mod({ startMinutes: 120, capHours: 1 }), T0);
  assert.equal(core.remainingNow(s, T0), 60 * MIN);
  assert.equal(subathonStartMs(mod({ startMinutes: 120, capHours: 1 })), 60 * MIN, 'Frontend rechnet gleich');
  assert.equal(subathonStartMs(mod({ startMinutes: 90 })), 90 * MIN);
});

test('Zeit dazu: nur während er läuft oder pausiert, nie unter null', () => {
  const m = mod({ startMinutes: 10 });
  const idle = core.addTime(core.emptyState(), m, 5 * MIN, { kind: 'sub' }, T0);
  assert.equal(idle.entry, null, 'vor dem Start zählt nichts');

  let s = core.start(core.emptyState(), m, T0);
  let r = core.addTime(s, m, 5 * MIN, { kind: 'sub', name: 'Anna', amount: 1, tier: '1' }, T0 + MIN);
  assert.equal(core.remainingNow(r.state, T0 + MIN), 14 * MIN);
  assert.equal(r.entry.ms, 5 * MIN);
  assert.equal(r.state.addedMs, 5 * MIN);
  assert.equal(r.state.log.length, 1);

  s = core.pause(r.state, T0 + 2 * MIN);
  r = core.addTime(s, m, 2 * MIN, { kind: 'bits', amount: 200 }, T0 + 5 * MIN);
  assert.equal(r.state.remainingMs, 15 * MIN, 'pausiert: Restzeit wächst');

  r = core.addTime(r.state, m, -60 * MIN, { kind: 'manual' }, T0 + 6 * MIN);
  assert.equal(r.state.remainingMs, 0, 'nie unter null');
  assert.equal(r.entry.ms, -15 * MIN, 'abgezogen wird nur, was da war');

  assert.equal(core.addTime(r.state, m, 0, { kind: 'manual' }, T0).entry, null);
  assert.equal(core.addTime(r.state, m, MIN, { kind: 'quatsch' }, T0).entry, null);
});

test('Abgelaufen: nur Zeit von Hand holt ihn zurück (als angehalten)', () => {
  const m = mod({ startMinutes: 1 });
  const ended = core.tick(core.start(core.emptyState(), m, T0), T0 + 2 * MIN);
  assert.equal(ended.status, 'ended');
  assert.equal(core.addTime(ended, m, 5 * MIN, { kind: 'sub' }, T0 + 3 * MIN).entry, null, 'Abos nach dem Ende zählen nicht');
  assert.equal(core.addTime(ended, m, -5 * MIN, { kind: 'manual' }, T0 + 3 * MIN).entry, null);
  const back = core.addTime(ended, m, 5 * MIN, { kind: 'manual' }, T0 + 3 * MIN);
  assert.equal(back.state.status, 'paused');
  assert.equal(back.state.remainingMs, 5 * MIN);
  assert.equal(core.start(back.state, m, T0 + 4 * MIN).status, 'running');
});

test('Obergrenze: Gesamtdauer = gelaufen + übrig, der Rest verfällt und steht im Verlauf', () => {
  const m = mod({ startMinutes: 50, capHours: 1 });
  let s = core.start(core.emptyState(), m, T0);
  // nach 20 min: 20 gelaufen + 30 übrig = 50, Platz für 10
  let r = core.addTime(s, m, 25 * MIN, { kind: 'gift', amount: 5 }, T0 + 20 * MIN);
  assert.equal(r.entry.ms, 10 * MIN);
  assert.equal(r.entry.capped, true);
  assert.equal(core.publicView(r.state, m, T0 + 20 * MIN).capReached, true);
  r = core.addTime(r.state, m, 5 * MIN, { kind: 'sub' }, T0 + 21 * MIN);
  assert.equal(r.entry.ms, 0, 'voll: nichts mehr dazu, aber im Verlauf');
  assert.equal(r.entry.capped, true);
  // Abziehen geht trotz Obergrenze
  r = core.addTime(r.state, m, -5 * MIN, { kind: 'manual' }, T0 + 22 * MIN);
  assert.equal(r.entry.ms, -5 * MIN);
  assert.equal(core.publicView(r.state, m, T0 + 22 * MIN).capReached, false);
  s = core.start(core.emptyState(), mod({ capHours: 0 }), T0);
  assert.equal(core.publicView(s, mod({ capHours: 0 }), T0).capMs, 0);
});

test('Regeln: Abo nach Stufe, Pakete, Bits anteilig, Spenden, Schalter', () => {
  const m = mod();
  assert.equal(core.msForEvent(m, { kind: 'sub', tier: '1' }), 5 * MIN);
  assert.equal(core.msForEvent(m, { kind: 'sub', tier: 'prime' }), 5 * MIN, 'Prime = Stufe 1');
  assert.equal(core.msForEvent(m, { kind: 'sub', tier: '2' }), 10 * MIN);
  assert.equal(core.msForEvent(m, { kind: 'resub', tier: '3' }), 25 * MIN);
  assert.equal(core.msForEvent(m, { kind: 'gift', tier: '1', amount: 5 }), 25 * MIN, 'Paket: je Abo');
  assert.equal(core.msForEvent(m, { kind: 'bits', amount: 100 }), MIN);
  assert.equal(core.msForEvent(m, { kind: 'bits', amount: 1 }), 600, '1 Bit = 0,6 s (anteilig, kein Aufrunden)');
  assert.equal(core.msForEvent(m, { kind: 'donation', amount: 2.5 }), 2.5 * MIN);
  assert.equal(core.msForEvent(mod({ countResubs: false }), { kind: 'resub', tier: '1' }), 0);
  assert.equal(core.msForEvent(mod({ countGifts: false }), { kind: 'gift', amount: 3 }), 0);
  assert.equal(core.msForEvent(mod({ rules: { ...m.rules, bits100: 0 } }), { kind: 'bits', amount: 500 }), 0, '0 = zählt nicht');
  assert.equal(core.msForEvent(mod({ rules: { sub1: -5 } }), { kind: 'sub' }), 0, 'negativ → 0');
  assert.equal(core.msForEvent(mod({ rules: { sub1: 'x' } }), { kind: 'sub' }), 5 * MIN, 'kaputt → Standard');
  assert.equal(core.msForEvent(m, { kind: 'manual', amount: 5 }), 0);
});

test('Chat-Befehl: Zeiten, Spenden, Steuerung', () => {
  assert.equal(core.parseCommand('hallo'), null);
  assert.equal(core.parseCommand('!subathonx'), null);
  assert.deepEqual(core.parseCommand('!subathon'), { action: 'info' });
  assert.deepEqual(core.parseCommand('  !SUBATHON  '), { action: 'info' });
  assert.deepEqual(core.parseCommand('!subathon +10m'), { action: 'add', ms: 10 * MIN, name: '' });
  assert.deepEqual(core.parseCommand('!subathon -5m Tippfehler'), { action: 'add', ms: -5 * MIN, name: 'Tippfehler' });
  assert.equal(core.parseCommand('!subathon +1h30m').ms, 90 * MIN);
  assert.equal(core.parseCommand('!subathon +90s').ms, 90000);
  assert.equal(core.parseCommand('!subathon +15').ms, 15 * MIN, 'ohne Einheit = Minuten');
  assert.equal(core.parseCommand('!subathon 10m').action, 'invalid', 'ohne Vorzeichen kein Befehl');
  assert.equal(core.parseCommand('!subathon +0m').action, 'invalid');
  assert.equal(core.parseCommand('!subathon +100h').action, 'invalid', 'über 99 h');
  assert.deepEqual(core.parseCommand('!subathon spende 10,50 Anna Bell'), { action: 'donation', amount: 10.5, name: 'Anna Bell' });
  assert.equal(core.parseCommand('!subathon tip $5').amount, 5);
  assert.equal(core.parseCommand('!subathon donation 7€').amount, 7);
  assert.equal(core.parseCommand('!subathon spende abc').action, 'invalid');
  assert.equal(core.parseCommand('!subathon spende 0').action, 'invalid');
  assert.equal(core.parseCommand('!subathon spende 1000000').action, 'invalid');
  assert.deepEqual(core.parseCommand('!subathon pause'), { action: 'pause' });
  assert.deepEqual(core.parseCommand('!subathon weiter'), { action: 'start' });
  assert.deepEqual(core.parseCommand('!subathon resume'), { action: 'start' });
});

test('Zeitformat: Server und Overlay schreiben gleich', () => {
  for (const ms of [0, 999, 59_000, 61_000, 3_599_000, 3_600_000, 4 * 3600_000 + 12 * MIN + 30_000, 120 * 3600_000]) {
    assert.equal(subathonClock(ms), core.clockText(ms), `clock ${ms}`);
  }
  for (const ms of [5 * MIN, -90_000, 3_720_000, 600, 0]) assert.equal(subathonDelta(ms), core.deltaText(ms), `delta ${ms}`);
  assert.equal(subathonClock(4 * 3600_000 + 12 * MIN + 30_000), '4:12:30');
  assert.equal(subathonClock(12 * MIN), '0:12:00');
  assert.equal(subathonDelta(5 * MIN), '+5:00');
  assert.equal(subathonDelta(-90_000), '-1:30');
  assert.equal(subathonDelta(3_720_000), '+1:02:00');
});

test('Gespeicherter Zustand: kaputte Daten ergeben Leerlauf, Verlauf ist begrenzt', () => {
  assert.equal(core.normalize(null).status, 'idle');
  assert.equal(core.normalize({ status: 'quatsch' }).status, 'idle');
  assert.equal(core.normalize({ status: 'running' }).status, 'paused', 'läuft ohne Endzeit → angehalten statt kaputt');
  const m = mod({ startMinutes: 10 });
  let s = core.start(core.emptyState(), m, T0);
  for (let i = 0; i < core.MAX_LOG + 10; i++) s = core.addTime(s, m, 1000, { kind: 'bits', amount: 10, name: `n${i}` }, T0 + i).state;
  assert.equal(s.log.length, core.MAX_LOG);
  const dash = core.dashboardView(s, m, T0 + 500);
  assert.equal(dash.log.length, 50);
  assert.equal(dash.log[0].name, `n${core.MAX_LOG + 9}`, 'neueste zuerst');
  assert.equal(new Set(s.log.map((e) => e.id)).size, s.log.length, 'IDs eindeutig');
  const pub = core.publicView(s, m, T0 + 500);
  assert.equal(pub.recent.length, 5);
  assert.equal(pub.recent[4].name, `n${core.MAX_LOG + 9}`, 'neueste zuletzt');
  assert.ok(!('log' in pub), 'die OBS-Quelle bekommt keinen ganzen Verlauf');
  assert.equal(core.normalize(JSON.parse(JSON.stringify(s))).log.length, core.MAX_LOG);
});

test('Overlay-Ansicht: Restzeit läuft lokal weiter, Leerlauf zeigt die Startzeit', () => {
  const m = mod({ startMinutes: 45 });
  const running = { status: 'running', endsAt: T0 + 10 * MIN, remainingMs: 10 * MIN, recent: [] };
  assert.equal(subathonRemaining(running, m, T0 + MIN), 9 * MIN);
  assert.equal(subathonRemaining(running, m, T0 + 20 * MIN), 0);
  assert.equal(subathonRemaining({ status: 'paused', remainingMs: 7 * MIN }, m, T0), 7 * MIN);
  assert.equal(subathonRemaining({ status: 'idle' }, m, T0), 45 * MIN);
  assert.equal(subathonRemaining(null, m, T0), 0);
  assert.equal(toSubathonView(null, m), null);
  assert.equal(toSubathonView({ status: 'idle' }, mod({ hideIdle: true })), null);
  assert.ok(toSubathonView({ status: 'idle' }, m));
  const v = toSubathonView(demoSubathon(), m);
  assert.equal(v.status, 'running');
  assert.equal(v.last.kind, 'gift');
  assert.equal(v.color, MODULE_DEFAULTS.subathon.colors[0]);
});

test('Texte: Zustände und Verlängerungen in beiden Sprachen', () => {
  for (const lang of ['de', 'en']) {
    const t = OVERLAY_TEXTS.dict(lang);
    const { num } = overlayFormat(lang);
    for (const st of ['idle', 'running', 'paused', 'ended']) assert.ok(t.subStatus[st], `${lang}: subStatus.${st}`);
    for (const kind of core.KINDS) {
      assert.ok(subathonWhat({ kind, amount: 3, tier: '1' }, t, num, '€'), `${lang}: ${kind}`);
    }
    const e = EDITOR_TEXTS.dict(lang);
    for (const st of ['idle', 'running', 'paused', 'ended']) assert.ok(e.subStatusLabels[st], `${lang}: subStatusLabels.${st}`);
    for (const k of SUBATHON_RULE_KEYS) assert.ok(e.subRuleLabels[k], `${lang}: subRuleLabels.${k}`);
    assert.ok(e.tabs.control && e.tabs.rules, `${lang}: Reiter`);
    assert.ok(e.watchEnable.subathon && e.watchOk.subathon, `${lang}: Chat-Bot-Hinweis`);
  }
  const de = OVERLAY_TEXTS.dict('de');
  const en = OVERLAY_TEXTS.dict('en');
  assert.equal(subathonWhat({ kind: 'gift', amount: 5, tier: '1' }, de, overlayFormat('de').num), '5 Geschenk-Abos');
  assert.equal(subathonWhat({ kind: 'gift', amount: 1, tier: '1' }, en, overlayFormat('en').num), 'Gift sub');
  assert.equal(subathonWhat({ kind: 'sub', amount: 1, tier: '2' }, de, overlayFormat('de').num), 'Abo · Stufe 2');
  assert.equal(subathonWhat({ kind: 'bits', amount: 1500 }, de, overlayFormat('de').num), '1.500 Bits');
  assert.equal(subathonWhat({ kind: 'donation', amount: 2.5 }, de, overlayFormat('de').num, '€'), '2,50 € Spende');
  assert.equal(subathonWhat({ kind: 'donation', amount: 10 }, en, overlayFormat('en').num, '$'), '$10 donation');
  assert.equal(EDITOR_TEXTS.dict('de').subRuleLabels.donation.replace('{cur}', '€'), 'Je 1 € Spende');
  assert.equal(EDITOR_TEXTS.dict('en').subRuleLabels.donation.replace('{cur}', '$'), 'Per $1 donated');
});

test('Chat-Texte: Subathon in beiden Sprachen', () => {
  for (const lang of ['de', 'en']) {
    const t = CHAT_TEXTS[lang].subathon;
    for (const key of ['running', 'paused', 'ended', 'added', 'capped', 'started', 'pausedNow']) {
      assert.equal(typeof t[key], 'function', `${lang}: ${key}`);
    }
    assert.equal(typeof t.idle, 'string');
  }
  assert.equal(CHAT_TEXTS.en.subathon.added('+5:00', '3:05:00'), '+5:00 — now 3:05:00 on the clock.');
});

test('Konfiguration: Regeln einzeln zusammengeführt, Sprache unberührt', () => {
  assert.ok(defaultConfig().modules.subathon);
  const merged = mergeConfig({ modules: { subathon: { enabled: true, rules: { sub1: 120 } } } });
  assert.equal(merged.modules.subathon.rules.sub1, 120);
  assert.equal(merged.modules.subathon.rules.bits100, MODULE_DEFAULTS.subathon.rules.bits100, 'später hinzugekommene Regel kommt aus dem Standard');
  assert.equal(merged.modules.subathon.enabled, true);
  assert.equal(mergeConfig({ modules: { subathon: { rules: 'kaputt' } } }).modules.subathon.rules.sub2, 600);
  assert.equal(withLanguage(merged, 'en').modules.subathon.label, 'Subathon');
});

test('Schnittstelle: jeder Fehlercode der Subathon-Routen hat einen Text in beiden Sprachen', () => {
  const routes = backend('streamTool/routes/streamToolRoutes.js');
  const block = routes.slice(routes.indexOf('const SUBATHON_MESSAGES'), routes.indexOf('};', routes.indexOf('const SUBATHON_MESSAGES')));
  const codes = [...block.matchAll(/^\s+([a-z_]+):/gm)].map((m) => m[1]);
  assert.ok(codes.includes('subathon_not_running') && codes.length >= 4, `Codes gefunden: ${codes}`);
  for (const lang of ['de', 'en']) {
    const t = EDITOR_TEXTS.dict(lang);
    for (const c of [...codes, 'failed']) assert.ok(t.apiErrors[c], `${lang}: apiErrors.${c}`);
  }
  for (const path of ['start', 'pause', 'reset', 'add', 'donation']) assert.ok(routes.includes(`"/subathon/${path}"`), path);
  assert.match(routes, /subathon: collectSubathon\(row\)/, 'OBS-Quelle bekommt den Stand');
  assert.match(routes, /subathon\.MODULE_ID\]/, 'Chat-Bot tritt bei eingeschaltetem Modul bei');
});

test('Chat-Bot: Subathon hört auf Abos, Geschenke, Bits und den Befehl', () => {
  const irc = backend('lib/winchallengeIrc.js');
  for (const fn of ['onSub', 'onResub', 'onSubGift', 'onAnonSubGift', 'onMysteryGift', 'onAnonMysteryGift', 'onCheer']) {
    assert.ok(irc.includes(`streamToolSubathon.${fn})`), fn);
  }
  assert.ok(irc.includes('streamToolSubathon.onChatCommand(ch, tags, message)'));
  assert.ok(irc.includes('streamToolSubathon.getSubathonChannels()'));
});
