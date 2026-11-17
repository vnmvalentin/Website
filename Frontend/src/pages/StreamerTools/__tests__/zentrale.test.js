// Streamer-Zentrale: Texte in beiden Sprachen, Anzeige je Werkzeug aus dem Stand, OBS-Erkennung im Assistenten,
// Verdrahtung in Hülle und Routen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { missingKeys } from '../../../i18n/core.js';
import { ZENTRALE_TEXTS, agoText, LIVE_MS } from '../zentrale/zentraleTexts.js';
import { ZENTRALE_TOOLS, WIZARD_TOOLS, toolView, isConnected } from '../zentrale/zentraleView.js';

const de = ZENTRALE_TEXTS.dict('de');
const en = ZENTRALE_TEXTS.dict('en');
const NOW = 1_800_000_000_000;
const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');

test('Texte: Englisch und Deutsch vollständig, jedes Werkzeug hat Name und Beschreibung', () => {
  assert.deepEqual(missingKeys(de, en), []);
  assert.deepEqual(missingKeys(en, de), []);
  for (const { key } of ZENTRALE_TOOLS) {
    for (const t of [de, en]) assert.ok(t.tools[key] && t.toolHints[key], key);
  }
  for (const x of WIZARD_TOOLS.filter((w) => w.overlay)) assert.ok(de.wizard.next[x.key] && en.wizard.next[x.key], `next.${x.key}`);
  // Jeder Hinweis-Code, den der Server liefern kann, hat einen Text
  const server = read('../../../../../Backend/streamerZentrale/status.js');
  const codes = [...server.matchAll(/issues\.push\("([a-z_]+)"\)/g)].map((m) => m[1]);
  assert.ok(codes.length >= 4, `Codes: ${codes}`);
  for (const c of [...codes, 'discord_no_bot', 'discord_down']) assert.ok(de.issues[c] && en.issues[c], c);
});

test('Zeitangaben', () => {
  assert.equal(agoText(de, 0, NOW), null);
  assert.equal(agoText(de, NOW - 20_000, NOW), 'gerade eben');
  assert.equal(agoText(de, NOW - 5 * 60_000, NOW), 'vor 5 Min.');
  assert.equal(agoText(en, NOW - 3 * 3600_000, NOW, 'en'), '3 h ago');
  assert.equal(agoText(de, NOW - 30 * 3600_000, NOW), 'gestern');
  assert.equal(agoText(de, NOW - 3 * 86400_000, NOW), 'vor 3 Tagen');
  assert.match(agoText(de, NOW - 30 * 86400_000, NOW), /^am /);
});

test('Anzeige: läuft, zuletzt da, noch nie, nicht eingerichtet', () => {
  const status = {
    serverNow: NOW,
    tools: {
      twitch: { used: true, modules: ['poll', 'alerts'], login: 'kanal', seenAt: NOW - 5000, issues: ['twitch_scopes'], overlayPath: '/twitch-tools/overlay/k' },
      winChallenge: { used: true, total: 3, open: 2, chat: true, seenAt: NOW - 2 * 3600_000, issues: [] },
      winTracker: { used: true, accounts: 1, active: 'Haupt', lastFetched: 0, issues: ['wt_no_account'] },
      viewerGames: { used: true, modes: ['pixel', 'wordle'], live: false, issues: [] },
      bingo: { used: false, issues: ['soll weg'] },
    },
  };
  const v = (key, discord) => toolView(key, status, discord, de, 'de');
  assert.deepEqual([v('twitch').state.kind, v('twitch').facts], ['live', ['2 Module an', 'Kanal kanal']]);
  assert.deepEqual(v('twitch').issues, ['twitch_scopes']);
  assert.equal(v('winChallenge').state.text, 'Zuletzt in OBS vor 2 Std.');
  assert.deepEqual(v('winChallenge').facts, ['2 von 3 Challenges offen', 'Chat-Befehle an']);
  assert.equal(v('winTracker').state.kind, 'never');
  assert.deepEqual(v('viewerGames').facts, ['Spiele: Pixel-Raten, Chat-Wordle']);
  assert.equal(v('viewerGames').state.kind, 'ready');
  assert.deepEqual([v('bingo').used, v('bingo').state.kind, v('bingo').issues], [false, 'off', []], 'nicht eingerichtet → keine Hinweise');
  // Discord: ohne Verknüpfung schlicht nicht eingerichtet, mit Verknüpfung ohne Bot ein Hinweis
  assert.deepEqual(v('discord', { linked: false, guilds: [] }).issues, []);
  assert.deepEqual(v('discord', { linked: true, guilds: [{ botPresent: false }] }).issues, ['discord_no_bot']);
  const d = v('discord', { linked: true, guilds: [{ botPresent: true }, { botPresent: true }] });
  assert.deepEqual([d.used, d.facts, d.state.kind], [true, ['Bot auf 2 Servern'], 'ready']);
  assert.equal(toolView('twitch', null, null, de, 'de').state.kind, 'off', 'noch kein Stand geladen');
});

test('Assistent: OBS-Quelle erkannt je Werkzeug', () => {
  const st = (tool, s) => ({ serverNow: NOW, tools: { [tool]: { used: true, ...s } } });
  assert.equal(isConnected('twitch', st('twitch', { seenAt: NOW - 5000 })), true);
  assert.equal(isConnected('twitch', st('twitch', { seenAt: NOW - LIVE_MS - 1 })), false);
  assert.equal(isConnected('winChallenge', st('winChallenge', { seenAt: 0 })), false);
  assert.equal(isConnected('viewerGames', st('viewerGames', { live: true })), true);
  assert.equal(isConnected('winTracker', st('winTracker', { lastFetched: NOW - 60_000 })), true, 'der Tracker holt seltener');
  assert.equal(isConnected('twitch', { serverNow: NOW, tools: { twitch: { used: false, seenAt: NOW } } }), false);
  assert.equal(isConnected('twitch', null), false);
});

test('Verdrahtung: Hülle, Route, Server', () => {
  // tools.js importiert ohne Dateiendung (Vite) — Node lädt es nicht, also als Text prüfen
  const tools = read('../../../components/toolShell/tools.js');
  const first = tools.indexOf('key: "zentrale"');
  assert.ok(first > 0 && first < tools.indexOf('key: "win-challenge"'), 'steht im Tools-Menü ganz oben');
  const line = tools.split('\n').find((l) => l.includes('key: "zentrale"'));
  assert.ok(line.includes('to: "/streamer-zentrale"') && line.includes('langs: ["de", "en"]'), line);
  const app = read('../../../App.jsx');
  assert.ok(app.includes('path="/streamer-zentrale" element={<ToolScroll><StreamerZentralePage /></ToolScroll>}'));
  const index = read('../../../../../Backend/index.js');
  assert.ok(index.includes('app.use("/api/streamer-zentrale", createStreamerZentraleRouter({ requireAuth }))'));
  // Die Overlay-Routen melden ihre OBS-Quelle an
  assert.ok(read('../../../../../Backend/streamTool/routes/streamToolRoutes.js').includes('presence.seen("twitch", row.user_id)'));
  assert.ok(read('../../../../../Backend/winchallenge/winchallengeRoutes.js').includes('.seen("wc", userId)'));
  assert.ok(read('../../../../../Backend/bingo/routes.js').includes('notePresence(ownerId)'));
});
