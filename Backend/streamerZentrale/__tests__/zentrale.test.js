// npm test -- streamerZentrale — Stand der Streamer-Werkzeuge (status.js, mit Attrappen statt Speichern) und
// „zuletzt da“ der OBS-Quellen (presence.js, Datenbank nur im Speicher).
process.env.STREAMER_ZENTRALE_DB = ":memory:";
const test = require("node:test");
const assert = require("node:assert/strict");
const { buildStatus, neededScopes } = require("../status");
const presence = require("../presence");

const NOW = 1_800_000_000_000;
const user = { id: "42", login: "Kanal" };

test("Ohne irgendein Werkzeug: alles „nicht eingerichtet“, keine Hinweise", () => {
  const s = buildStatus({ streamToolRow: () => null, wcDoc: () => null, bingoSessions: () => [], wtSettings: () => null, wtAccounts: () => [], vgRow: () => null, vgLive: () => false, irc: () => ({ configured: true, connected: true }), presence: () => ({}) }, user, NOW);
  assert.equal(s.serverNow, NOW);
  for (const t of Object.values(s.tools)) {
    assert.equal(t.used, false);
    assert.deepEqual(t.issues, []);
  }
  assert.deepEqual(s.chatBot, { configured: true, connected: true });
});

test("Twitch-Overlays: Module, Verbindung, fehlende Rechte, Chat-Bot, Overlay-Adresse", () => {
  const config = { modules: { poll: { enabled: true }, alerts: { enabled: true, kinds: { follow: true } }, subGoal: { enabled: false } } };
  const row = { config: JSON.stringify(config), token_enc: "x", scopes: "channel:read:polls", twitch_login: "kanal", overlay_key: "abc" };
  const s = buildStatus({ streamToolRow: () => row, irc: () => ({ configured: false, connected: false }), presence: () => ({ twitch: NOW - 5000 }) }, user, NOW).tools.twitch;
  assert.equal(s.used, true);
  assert.equal(s.connected, true);
  assert.deepEqual(s.modules, ["poll", "alerts"]);
  assert.equal(s.seenAt, NOW - 5000);
  assert.equal(s.overlayPath, "/twitch-tools/overlay/abc");
  assert.deepEqual(s.issues, ["twitch_scopes", "no_bot"], "Follow-Alerts ohne Follower-Recht, Alerts ohne Bot");

  const off = buildStatus({ streamToolRow: () => ({ ...row, token_enc: "", config: "" }), irc: () => ({ configured: true }) }, user, NOW).tools.twitch;
  assert.equal(off.connected, false);
  assert.equal(off.modules, null, "nie gespeichert → Standard des Editors");
  assert.deepEqual(off.issues, ["twitch_not_connected"]);
});

test("Rechte je Modul", () => {
  assert.deepEqual(neededScopes(null), []);
  assert.deepEqual(neededScopes({ subGoal: { enabled: true } }), ["channel:read:subscriptions"]);
  assert.deepEqual(neededScopes({ subGoal: { enabled: true, source: "twitch" } }), ["channel:read:goals"]);
  assert.deepEqual(neededScopes({ alerts: { enabled: true, kinds: { follow: false } } }), []);
  assert.deepEqual(neededScopes({ hypeTrain: { enabled: true }, raidStorm: { enabled: true } }).sort(), ["channel:read:hype_train", "moderator:read:chatters"]);
  assert.deepEqual(neededScopes({ raidStorm: { enabled: true, guessNames: false } }), []);
});

test("Win Challenge, Win Tracker, Viewer Games, Bingo", () => {
  const s = buildStatus({
    wcDoc: () => ({ overlayKey: "wc1", items: [{ done: true }, {}, {}], chatCommands: { enabled: true, channels: [] } }),
    wtSettings: () => ({ overlay_key: "wt1" }),
    wtAccounts: () => [{ player_name: "Zweit", is_active: 0, last_fetched: 1 }, { player_name: "Haupt", is_active: 1, last_fetched: NOW - 60000 }],
    vgRow: () => ({ overlay_key: "vg1", settings: { modes: ["pixel", "wordle"] } }),
    vgLive: (login) => login === "kanal",
    bingoSessions: () => [{ themeName: "Alt", updatedAt: 1 }, { themeName: "Neu", updatedAt: 9 }],
    presence: () => ({ wc: NOW - 1000, bingo: NOW - 2000 }),
    irc: () => ({ configured: true, connected: true }),
  }, user, NOW).tools;

  assert.deepEqual([s.winChallenge.total, s.winChallenge.open, s.winChallenge.chat], [3, 2, true]);
  assert.deepEqual(s.winChallenge.issues, ["wc_chat_no_channel"]);
  assert.equal(s.winChallenge.overlayPath, "/WinChallengeOverlay/wc1");

  assert.equal(s.winTracker.accounts, 2);
  assert.equal(s.winTracker.active, "Haupt", "der aktive Account, nicht der erste");
  assert.equal(s.winTracker.lastFetched, NOW - 60000);
  assert.equal(s.winTracker.overlayPath, "/clash-royale/win-tracker/overlay/wt1");

  assert.deepEqual(s.viewerGames.modes, ["pixel", "wordle"]);
  assert.equal(s.viewerGames.live, true, "Login klein geschrieben verglichen");
  assert.equal(s.viewerGames.overlayPath, "/clash/viewer-games/overlay/vg1");

  assert.deepEqual([s.bingo.cards, s.bingo.latest, s.bingo.seenAt], [2, "Neu", NOW - 2000]);

  const leer = buildStatus({ wtSettings: () => ({ overlay_key: "wt1" }), wtAccounts: () => [] }, user, NOW).tools.winTracker;
  assert.deepEqual(leer.issues, ["wt_no_account"]);
});

test("Eine kaputte Quelle kostet nur ihr eigenes Werkzeug", () => {
  const warn = console.warn;
  console.warn = () => {};
  try {
    const s = buildStatus({ streamToolRow: () => { throw new Error("weg"); }, wcDoc: () => ({ overlayKey: "k", items: [] }) }, user, NOW);
    assert.equal(s.tools.twitch.used, false);
    assert.equal(s.tools.winChallenge.used, true);
    assert.equal(s.chatBot, null);
  } finally {
    console.warn = warn;
  }
});

test("Anwesenheit: Speicher sofort, Datenbank höchstens einmal pro Minute, nur bekannte Werkzeuge", () => {
  presence._reset();
  presence.seen("twitch", "7", NOW);
  presence.seen("twitch", "7", NOW + 10_000);
  assert.equal(presence.lastSeen("7").twitch, NOW + 10_000, "der Speicher kennt den neuesten Abruf");
  presence._reset();
  assert.equal(presence.lastSeen("7").twitch, NOW, "in der Datenbank steht der erste (Schreiben gedrosselt)");
  presence.seen("twitch", "7", NOW + presence.FLUSH_MS + 1);
  presence._reset();
  assert.equal(presence.lastSeen("7").twitch, NOW + presence.FLUSH_MS + 1);
  presence.seen("quatsch", "7", NOW);
  presence.seen("wc", "", NOW);
  assert.deepEqual(Object.keys(presence.lastSeen("7")), ["twitch"]);
});
