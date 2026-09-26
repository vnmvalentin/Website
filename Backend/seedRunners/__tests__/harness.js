// Gemeinsame Hilfen der Raum-Tests: Uhr und Timer von Hand, Nachrichten mitgeschrieben statt gesendet.
'use strict';

const assert = require('node:assert/strict');
const { createRoomManager } = require('../roomManager');

const HASH = 'a1b2c3d4';

function harness(config = {}, extraDeps = {}) {
  let t = 1_000_000;
  let nextTimer = 1;
  const timers = new Map();
  const events = [];
  const joined = new Map(); // socketId -> Set(code)
  let idCounter = 0;

  const mgr = createRoomManager({
    now: () => t,
    setTimer: (fn, ms) => {
      const id = nextTimer++;
      timers.set(id, { at: t + ms, fn });
      return id;
    },
    clearTimer: (id) => timers.delete(id),
    emitRoom: (code, event, payload) => events.push({ scope: 'room', code, event, payload }),
    emitSocket: (socketId, event, payload) => events.push({ scope: 'socket', socketId, event, payload }),
    joinRoom: (socketId, code) => { if (!joined.has(socketId)) joined.set(socketId, new Set()); joined.get(socketId).add(code); },
    leaveRoom: (socketId, code) => joined.get(socketId)?.delete(code),
    randomId: () => `id${++idCounter}${'x'.repeat(6)}`,
    randomInt: (n) => (idCounter++ * 7) % n,
    randomSeed: () => `seed${++idCounter}`,
    todayKey: () => '2026-09-21',
    config,
    ...extraDeps,
  });

  const advance = (ms) => {
    const target = t + ms;
    for (;;) {
      const due = [...timers.entries()].filter(([, v]) => v.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]);
      t = Math.max(t, due[1].at);
      due[1].fn();
    }
    t = target;
  };

  const lastState = (code) => [...events].reverse().find((e) => e.event === 'sr:state' && e.code === code)?.payload;
  const notices = () => events.filter((e) => e.event === 'sr:notice').map((e) => e.payload.text);
  return { mgr, advance, events, lastState, notices, joined, now: () => t, timers };
}

const sock = (id) => ({ id });
const tok = (n) => `token-${n}-abcdefgh`;

// Raum mit Host "Anna" (s1) und optional weiteren Spielern
function room(h, names = ['Anna']) {
  const created = h.mgr.create(sock('s1'), { name: names[0], token: tok(1) });
  const code = created.code;
  names.slice(1).forEach((name, i) => h.mgr.join(sock(`s${i + 2}`), { code, name, token: tok(i + 2) }));
  return code;
}

// Runde bis zum Rennstart durchspielen; alle melden denselben Hash
function startRace(h, code, count) {
  assert.equal(h.mgr.start(sock('s1')).ok, true);
  for (let i = 1; i <= count; i++) assert.equal(h.mgr.ready(sock(`s${i}`), { hash: HASH, checkpoints: 3 }).ok, true);
  assert.equal(h.lastState(code).phase, 'countdown');
  h.advance(4000);
  assert.equal(h.lastState(code).phase, 'racing');
}

module.exports = { HASH, harness, sock, tok, room, startRace };
