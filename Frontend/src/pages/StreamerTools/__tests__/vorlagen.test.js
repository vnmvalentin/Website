// Community-Vorlagen im Frontend: dieselben Look-Felder wie der Server, Adressen zum Übernehmen, Verdrahtung in
// den Editoren und in der Galerie.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { LOOK_KEYS, pickLook, userVorlageId, vorlageLink } from '../vorlagen/vorlagenApi.js';
import { THEME_DEFAULTS } from '../../StreamTool/streamToolConfig.js';

const require = createRequire(import.meta.url);
// core.js hat keine Abhängigkeiten (keine Datenbank)
const core = require('../../../../../Backend/overlayVorlagen/core.js');
const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');

test('Look-Felder: Frontend und Server gleich', () => {
  assert.deepEqual(LOOK_KEYS, core.STYLE_KEYS);
  assert.deepEqual(Object.keys(THEME_DEFAULTS).sort(), [...LOOK_KEYS.twitch].sort(), 'Twitch: genau das gemeinsame Design');
});

test('Win Tracker: jedes Look-Feld nimmt seine Einstellungs-Schnittstelle an (Revier B, nur gelesen)', () => {
  const routes = read('../../../../../Backend/clashRoyale/routes/crWinTrackerRoutes.js');
  const put = routes.slice(routes.indexOf('router.put("/settings"'), routes.indexOf('router.post("/overlay/regenerate"'));
  for (const k of LOOK_KEYS.winTracker) assert.ok(put.includes(`s.${k}`), `PUT /settings liest ${k}`);
});

test('Win Challenge: jedes Look-Feld gibt es im Design', () => {
  const routes = read('../../../../../Backend/winchallenge/winchallengeRoutes.js');
  for (const k of LOOK_KEYS.winChallenge) assert.ok(routes.includes(k), k);
});

test('Hilfen', () => {
  assert.deepEqual(pickLook('twitch', { accent: '#fff', modules: {}, glass: false, radius: null }), { accent: '#fff', glass: false });
  assert.equal(userVorlageId('u:AbC_12-x'), 'AbC_12-x');
  assert.equal(userVorlageId('twitch'), null, 'fertige Looks bleiben beim alten Weg');
  assert.equal(userVorlageId('u:../x'), null);
  assert.equal(vorlageLink('winChallenge', 'abc123'), '/WinChallenge-Overlay?vorlage=u:abc123');
  assert.equal(vorlageLink('twitch', 'abc123'), '/twitch-tools?vorlage=u:abc123');
  assert.equal(vorlageLink('winTracker', 'abc123'), '/clash-royale/win-tracker');
});

test('Verdrahtung: Editoren übernehmen u:<id>, Galerie zeigt alle drei, Server ist eingehängt', () => {
  const wc = read('../../WinChallenge/WinChallenge.jsx');
  assert.ok(wc.includes('userVorlageId(params.get("vorlage"))') && wc.includes('v.tool !== "winChallenge"'));
  const st = read('../../StreamTool/PollsPredictionsPage.jsx');
  assert.ok(st.includes("userVorlageId(params.get('vorlage'))") && st.includes("v.tool !== 'twitch'"));
  const gallery = read('../OverlayGalleryPage.jsx');
  for (const tool of ['winTracker', 'winChallenge']) assert.ok(gallery.includes(`<CommunityVorlagen tool="${tool}"`), tool);
  assert.ok(gallery.includes('<CommunityVorlagen tool="twitch"'));
  const index = read('../../../../../Backend/index.js');
  assert.ok(index.includes('app.use("/api/vorlagen", createVorlagenRouter({'));
});
