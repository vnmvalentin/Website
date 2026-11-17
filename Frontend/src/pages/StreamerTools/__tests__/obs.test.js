// OBS-Knopf: Client für obs-websocket 5 (Anmeldung, Fehler) gegen ein nachgebautes OBS, dazu Anlegen und
// Aktualisieren der Browserquellen (obsSetup.js) und die Texte zu jedem Fehlercode.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { connectObs, authString, ObsError } from '../zentrale/obsClient.js';
import { ensureSource, inspectSources, obsInfo, sourceSize, OBS_SOURCE_NAMES } from '../zentrale/obsSetup.js';
import { ZENTRALE_TEXTS } from '../zentrale/zentraleTexts.js';

const b64sha = (s) => createHash('sha256').update(s).digest('base64');

/** Ein OBS im Speicher: Szenen, Browserquellen, Szenen-Elemente. */
function fakeObs({ password = '', scenes = ['Spiel', 'Pause'], current = 'Spiel', canvas = [2560, 1440] } = {}) {
  const state = { inputs: new Map(), items: new Map(scenes.map((s) => [s, new Set()])), calls: [], pressed: [] };
  const fail = (code, comment) => ({ requestStatus: { result: false, code, comment } });
  const ok = (responseData = {}) => ({ requestStatus: { result: true, code: 100 }, responseData });
  state.handle = (type, d) => {
    state.calls.push(type);
    switch (type) {
      case 'GetVersion': return ok({ obsVersion: '31.0.2', obsWebSocketVersion: '5.5.0' });
      case 'GetSceneList': return ok({ currentProgramSceneName: current, scenes: scenes.map((s, i) => ({ sceneName: s, sceneIndex: scenes.length - 1 - i })) });
      case 'GetVideoSettings': return ok({ baseWidth: canvas[0], baseHeight: canvas[1] });
      case 'GetInputList': return ok({ inputs: [...state.inputs.entries()].filter(([, v]) => !d.inputKind || v.kind === d.inputKind).map(([n, v]) => ({ inputName: n, inputKind: v.kind })) });
      case 'GetInputSettings': return state.inputs.has(d.inputName) ? ok({ inputSettings: state.inputs.get(d.inputName).settings }) : fail(600);
      case 'CreateInput':
        if (state.inputs.has(d.inputName)) return fail(601, 'gibt es schon');
        if (!state.items.has(d.sceneName)) return fail(600, 'Szene fehlt');
        state.inputs.set(d.inputName, { kind: d.inputKind, settings: { ...d.inputSettings } });
        state.items.get(d.sceneName).add(d.inputName);
        return ok({ sceneItemId: 1 });
      case 'SetInputSettings': {
        const inp = state.inputs.get(d.inputName);
        if (!inp) return fail(600);
        inp.settings = d.overlay === false ? { ...d.inputSettings } : { ...inp.settings, ...d.inputSettings };
        return ok();
      }
      case 'GetSceneItemId': return state.items.get(d.sceneName)?.has(d.sourceName) ? ok({ sceneItemId: 1 }) : fail(600, 'nicht in der Szene');
      case 'CreateSceneItem': state.items.get(d.sceneName).add(d.sourceName); return ok({ sceneItemId: 2 });
      case 'PressInputPropertiesButton': state.pressed.push(`${d.inputName}:${d.propertyName}`); return ok();
      default: return fail(204, 'unbekannt');
    }
  };
  // WebSocket-Ersatz, der wie obs-websocket 5 antwortet
  state.WebSocket = class {
    constructor(url) {
      state.url = url;
      this.readyState = 0;
      this.salt = 'salzig';
      this.challenge = 'herausfordernd';
      setTimeout(() => {
        this.readyState = 1;
        const d = { obsWebSocketVersion: '5.5.0', rpcVersion: 1 };
        if (password) d.authentication = { challenge: this.challenge, salt: this.salt };
        this.onmessage?.({ data: JSON.stringify({ op: 0, d }) });
      }, 1);
    }
    send(raw) {
      const msg = JSON.parse(raw);
      setTimeout(() => {
        if (msg.op === 1) {
          if (password && msg.d.authentication !== b64sha(b64sha(password + this.salt) + this.challenge)) {
            this.readyState = 3;
            this.onclose?.({ code: 4009 });
            return;
          }
          this.onmessage?.({ data: JSON.stringify({ op: 2, d: { negotiatedRpcVersion: 1 } }) });
        } else if (msg.op === 6) {
          const r = state.handle(msg.d.requestType, msg.d.requestData || {});
          this.onmessage?.({ data: JSON.stringify({ op: 7, d: { requestType: msg.d.requestType, requestId: msg.d.requestId, ...r } }) });
        }
      }, 1);
    }
    close() {
      if (this.readyState === 3) return;
      this.readyState = 3;
      setTimeout(() => this.onclose?.({ code: 1000 }), 1);
    }
  };
  return state;
}

test('Anmelde-Zeichenkette wie obs-websocket 5', async () => {
  assert.equal(await authString('geheim', 'salz', 'aufgabe'), b64sha(b64sha('geheimsalz') + 'aufgabe'));
});

test('Verbinden: mit Passwort, ohne, falsches, keins obwohl verlangt, OBS aus', async () => {
  const obs = fakeObs({ password: 'geheim' });
  const c = await connectObs({ port: 4455, password: 'geheim', WebSocketImpl: obs.WebSocket });
  assert.equal(obs.url, 'ws://127.0.0.1:4455', 'immer an diesen Rechner');
  assert.equal((await c.request('GetVersion')).obsVersion, '31.0.2');
  await assert.rejects(c.request('Quatsch'), (e) => e instanceof ObsError && e.code === 'request_204');
  c.close();

  const offen = await connectObs({ password: '', WebSocketImpl: fakeObs().WebSocket });
  assert.equal(typeof offen.request, 'function', 'OBS ohne Passwort');
  offen.close();

  await assert.rejects(connectObs({ password: 'falsch', WebSocketImpl: fakeObs({ password: 'geheim' }).WebSocket }), { code: 'auth' });
  await assert.rejects(connectObs({ password: '', WebSocketImpl: fakeObs({ password: 'geheim' }).WebSocket }), { code: 'auth_needed' });

  class Aus { constructor() { setTimeout(() => { this.onerror?.({}); this.onclose?.({ code: 1006 }); }, 1); } close() {} }
  await assert.rejects(connectObs({ WebSocketImpl: Aus }), { code: 'unreachable' });
  class Stumm { close() {} }
  await assert.rejects(connectObs({ WebSocketImpl: Stumm, timeoutMs: 30 }), { code: 'timeout' });
});

test('Info: Szenen in der Reihenfolge von OBS, aktuelle Szene, Leinwand', async () => {
  const obs = fakeObs({ scenes: ['Start', 'Spiel', 'Ende'], current: 'Spiel' });
  const c = await connectObs({ WebSocketImpl: obs.WebSocket });
  const info = await obsInfo(c.request);
  assert.deepEqual(info.scenes, ['Start', 'Spiel', 'Ende']);
  assert.equal(info.currentScene, 'Spiel');
  assert.deepEqual(info.canvas, { width: 2560, height: 1440 });
  c.close();
});

test('Größe der Browserquelle je Werkzeug', () => {
  const canvas = { width: 2560, height: 1440 };
  assert.deepEqual(sourceSize('twitch', canvas), [2560, 1440], 'füllt die Leinwand');
  assert.deepEqual(sourceSize('winChallenge', null), [1920, 1080]);
  assert.deepEqual(sourceSize('viewerGames', canvas), [400, 820], 'wie Spur B es vorgibt');
  assert.deepEqual(sourceSize('winTracker', canvas, { overlayWidth: 500, overlayHeight: 300 }), [550, 350], 'feste Größe + rundum 25 px');
  assert.deepEqual(sourceSize('winTracker', canvas, { overlayScale: 150 }), [540, 960]);
  assert.deepEqual(sourceSize('winTracker', canvas, {}), [360, 640]);
});

test('Anlegen, wiederfinden, aktualisieren, in weitere Szene', async () => {
  const obs = fakeObs();
  const c = await connectObs({ WebSocketImpl: obs.WebSocket });
  const name = OBS_SOURCE_NAMES.twitch;

  let r = await ensureSource(c.request, { tool: 'twitch', url: 'https://x/overlay/a', size: [2560, 1440], scene: 'Spiel' });
  assert.equal(r.action, 'created');
  assert.deepEqual(obs.inputs.get(name).settings, { url: 'https://x/overlay/a', width: 2560, height: 1440, reroute_audio: true });
  assert.ok(obs.items.get('Spiel').has(name));

  let seen = await inspectSources(c.request, { twitch: 'https://x/overlay/a', winChallenge: 'https://x/wc' });
  assert.deepEqual(seen.twitch, { exists: true, upToDate: true });
  assert.deepEqual(seen.winChallenge, { exists: false, upToDate: null });

  // Neuer Link (z. B. neu erzeugt): als veraltet erkannt, dann nur der Link ersetzt — die Größe des Streamers bleibt
  obs.inputs.get(name).settings.width = 1280;
  seen = await inspectSources(c.request, { twitch: 'https://x/overlay/b' });
  assert.equal(seen.twitch.upToDate, false);
  r = await ensureSource(c.request, { tool: 'twitch', url: 'https://x/overlay/b', size: [2560, 1440], scene: 'Spiel' });
  assert.equal(r.action, 'updated');
  assert.equal(obs.inputs.get(name).settings.url, 'https://x/overlay/b');
  assert.equal(obs.inputs.get(name).settings.width, 1280, 'eigene Größe bleibt');
  assert.deepEqual(obs.pressed, [`${name}:refreshnocache`], 'neu geladen');

  // Andere Szene: dieselbe Quelle wird dort ergänzt, nicht doppelt angelegt
  r = await ensureSource(c.request, { tool: 'twitch', url: 'https://x/overlay/b', size: [2560, 1440], scene: 'Pause' });
  assert.equal(r.action, 'added');
  assert.ok(obs.items.get('Pause').has(name));
  assert.equal([...obs.inputs.keys()].filter((n) => n === name).length, 1);

  // Viewer Games: 400 × 820, ohne Audio-Umleitung
  await ensureSource(c.request, { tool: 'viewerGames', url: 'https://x/vg', size: sourceSize('viewerGames'), scene: 'Spiel' });
  assert.deepEqual(obs.inputs.get(OBS_SOURCE_NAMES.viewerGames).settings, { url: 'https://x/vg', width: 400, height: 820 });
  await assert.rejects(ensureSource(c.request, { tool: 'quatsch', url: '', size: [1, 1], scene: 'Spiel' }));
  c.close();
});

test('Texte: jeder Fehlercode hat einen Text, Namen hängen nicht an der Sprache', () => {
  for (const lang of ['de', 'en']) {
    const o = ZENTRALE_TEXTS.dict(lang).obs;
    for (const code of ['unreachable', 'blocked', 'auth', 'auth_needed', 'version', 'timeout', 'closed', 'failed']) {
      assert.ok(o.errors[code], `${lang}: ${code}`);
    }
    assert.equal(o.howto.length, 3);
  }
  for (const n of Object.values(OBS_SOURCE_NAMES)) assert.match(n, /^vnmvalentin · /);
});
