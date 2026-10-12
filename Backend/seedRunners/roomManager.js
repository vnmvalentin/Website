// Seed Runners — Raum-Logik. Reine Zustandsmaschine ohne Socket.io, Uhr und Timer werden von außen
// gereicht: Dieselbe Logik läuft im Server (echte Uhr) und in den Tests (Uhr per Hand).
//
// WAS DER SERVER HIER (NICHT) TUT
// Der Server rechnet KEINE Physik und kennt kein Level: Jeder Spieler erzeugt das Level aus dem
// Seed selbst und läuft es in seinem Browser. Der Server verteilt Einstellungen und Seed, gibt
// den Startzeitpunkt vor, sammelt Checkpoint- und Zielmeldungen und errechnet daraus Platzierung
// und Ergebnis-Tabelle. Dazu kommen seit 27.09.2026 Positionen für Geister/Zuschauen: je Läufer ~10 kleine
// Nachrichten pro Sekunde herein, je Raum höchstens 10 gebündelte hinaus — keine Physik, kein Nachrechnen, deshalb
// belastet ein Raum den Event-Loop kaum (Grund für die Trennung von Blobby war 75-Hz-Physik; siehe blobbyServer.js).
//
// ZEITEN sind Sim-Ticks (120 pro Sekunde), gemessen vom Client. Der Server prüft nur, ob eine
// Meldung möglich ist (nicht mehr Ticks, als seit dem Start vergangen sind; aufsteigend), und
// glaubt sie zunächst. Danach (Anti-Cheat) lässt der Raum den Lauf des Siegers nachspielen — bei
// Läufen des Tages-Levels alle Läufe: `deps.verify` bekommt Level-Parameter, Input-Log und Zeit und
// antwortet mit dem Ergebnis der Prüfung (replay.js, im Worker-Thread). Stimmt die Zeit nicht, gilt
// der Lauf als nicht bestätigt (wie DNF, mit Hinweis) und der Nächste rückt auf. Das Log wird nie
// an andere Spieler verteilt.
//
// PHASEN eines Raums
//   lobby      Einstellungen, Spielerliste
//   loading    Seed ist verteilt, jeder erzeugt sein Level und meldet "ready" (mit Level-Hash)
//   countdown  Startzeitpunkt steht fest (Serverzeit), Clients gleichen ihre Uhr aus
//   racing     Läuft; nach dem ersten Ziel bleibt den anderen eine Frist, dann DNF
//   results    Ergebnis-Tabelle; der Host startet die nächste Runde oder geht zurück in die Lobby
//
// SPIELER-ZUSTÄNDE: lobby · loading · ready · racing · finished · dnf · spectator · incompatible
//
// SERIE (mehrere Runden, Phase 4): `room.settings.rounds` (1–5) legt fest, wie viele Runden eine Serie hat;
// `room.settings.playlist` ist eine Liste von Runden-Einträgen — { kind: 'random' } (Zufalls-Level wie bisher)
// oder { kind: 'custom', code } (ein veröffentlichtes Level per Share-Code) oder { kind: 'seed', seed, biome } (ein bestimmtes
// Zufallslevel des Pfad-Generators, z. B. ein Favorit aus der Level-Auswahl). `settings.includeDaily` fügt eine
// Runde mit dem Tages-Level an einer beim Start der Serie ZUFÄLLIG gewählten Stelle ein.
// Der fertige Plan (`room.series.plan`) steht erst beim Start der Serie fest und ändert sich danach nicht mehr,
// auch wenn der Host die Lobby-Einstellungen inzwischen weiterändert (die gelten dann erst für die nächste Serie).
// Punkte je Runde: Teilnehmerzahl der Runde − Platz + 1, ein DNF zählt 0 (siehe computeResults). Die
// Gesamtwertung (`room.series.scores`) summiert das über alle gespielten Runden; bei Punktgleichstand entscheidet
// die Summe der Zielzeiten (ein DNF zählt dabei mit der Zeitgrenze der Runde als Strafe) — weniger ist besser.
// Ein einzelner Lauf (rounds === 1, der Normalfall aus Phase 1–3) ist eine Serie der Länge 1 und verhält sich
// nach außen genau wie zuvor (gleiche Knöpfe "neuer Seed"/"Revanche"/"Lobby" im Ergebnis).
//
// Custom-Level in einer Runde: Der Server löst den Share-Code beim Rundenstart selbst auf (`deps.resolveCustomLevel`,
// levelService.roundLevel) — er kennt Inhalt und Hash dann VOR den Clients und braucht deshalb keine Mehrheits-
// abstimmung wie bei Zufalls-Leveln (beginCountdown): Wer einen anderen Hash meldet, hat schlicht einen anderen
// (veralteten) Stand. Ist das Level inzwischen gelöscht oder ausgeblendet, wird die Runde durch eine Zufallsrunde
// ersetzt (mit Hinweis an alle) statt die Serie abzubrechen.
//
// MODUS (27.09.2026): `settings.mode` ist 'race' (wer zuerst im Ziel ist, gewinnt — wie bisher) oder 'timeattack'
// (Zeitjagd): Alle haben TIMEATTACK_MS (10 Minuten) für dasselbe Level und dürfen so oft von vorn anfangen, wie sie
// wollen; die beste Zielzeit zählt. Ein Spieler bleibt dabei im Zustand 'racing', `finishTicks` ist seine bisher beste
// Zeit (null = noch keine), `runs` die Zahl seiner Läufe im Ziel. Jeder Versuch hat eine Nummer (`attempt`, vom Client
// hochgezählt) — damit sind wiederholte Meldungen nach einem Reconnect harmlos. Der Modus gilt für eine ganze Serie
// (`series.mode`), wie der Rundenplan. Anti-Cheat wie gehabt: nachgespielt wird das Log des besten Laufs.
//
// HARDCORE (30.09.2026): `settings.hardcore` (nur im Modus 'race') — wer in einer Runde einmal stirbt, ist sofort DNF. Der
// Browser meldet den ersten Tod selbst (`giveUp` mit { died: true }); der Server verlässt sich aber nicht darauf: Eine
// Zielmeldung mit Toden zählt nicht, und beim Nachspielen fällt ein Lauf mit Toden durch. „Zum Checkpoint“ ist gesperrt (sonst
// ließe sich ein sicherer Sturz kurz vorher wegdrücken): Enthält das Input-Log die Taste, ist der Lauf ein DNF. Gilt wie der Modus für die
// ganze Serie (`series.hardcore`).
//
// SITZUNG: `room.session` sammelt Punkte und Siege aller Runden seit der Lobby (auch über mehrere Einzelrennen
// hinweg); zurück in die Lobby beginnt eine neue Sitzung, und die Rundennummer zählt wieder ab 1.
//
// GEISTER / ZUSCHAUEN (27.09.2026): Während des Rennens schickt jeder Browser etwa 10× pro Sekunde seine Position
// (`position`, ohne Antwort). Der Server merkt sich nur die letzte und verteilt alle gesammelten Positionen höchstens
// alle GHOST_TICK_MS in EINER Nachricht an den Raum (`sr:pos`, "volatile": verlorene Pakete werden nicht nachgeschickt).
// Kommt nichts, wird auch nichts verschickt. Das ist reine Anzeige — der Server rechnet nichts damit und prüft nichts.

'use strict';

const crypto = require('crypto');
const { normalizeCode } = require('./shareCode');
const { dailyParams } = require('./daily');
const { PFAD_GEN_VERSION, cleanGv } = require('./genVersion');

const MAX_PLAYERS = 8;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // ohne I/O/0/1 (Verwechslungsgefahr)
const CODE_LENGTH = 5;

// Dieselbe Farbpalette wie die Clash-Royale-Lobby (clashRoyale/core/lobbies.js)
const PLAYER_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ec4899', '#14b8a6', '#f97316'];

// Müssen zu Frontend/src/pages/SeedRunners/gen (LENGTHS, SPEED_CLASSES, BIOMES) passen. Der Server
// prüft nur die Zugehörigkeit; ein unbekannter Wert wird nie verteilt.
const LENGTHS = ['short', 'medium', 'long'];
const SPEED_CLASSES = ['normal', 'fast', 'super'];
const BIOMES = ['random', 'meadow', 'ice', 'factory', 'cave', 'sky'];
const SEED_MODES = ['random', 'daily', 'custom'];
const MODES = ['race', 'timeattack'];
const MAX_ROUNDS = 5;

const DEFAULT_SETTINGS = Object.freeze({
  length: 'short', speedClass: 'normal', biome: 'random', seedMode: 'random', seed: '',
  rounds: 1, playlist: [{ kind: 'random' }], includeDaily: false, mode: 'race', hardcore: false,
});

const TICK_HZ = 120;
// Bit der Taste „Zum Checkpoint“ in der Eingabemaske (Frontend sim/inputBits.js: INPUT.RESTART)
const INPUT_RESTART = 128;
// So viele Ticks darf eine Meldung "in der Zukunft" liegen (Uhrengenauigkeit beim Start)
const TICK_SLACK = 40;

const DEFAULT_CONFIG = Object.freeze({
  COUNTDOWN_MS: 4000,
  LOAD_TIMEOUT_MS: 20000,
  // Pfad-Level brauchen im Browser einige Sekunden (langsame Geräte deutlich mehr) — so lange wartet die Runde höchstens
  LOAD_TIMEOUT_PFAD_MS: 60000,
  DNF_AFTER_FIRST_MS: 60000,
  RACE_CAP_MS: { short: 6 * 60 * 1000, medium: 14 * 60 * 1000, long: 26 * 60 * 1000 },
  DISCONNECT_GRACE_MS: 2 * 60 * 1000,
  STALE_AFTER_MS: 30 * 60 * 1000,
  MAX_SPLITS: 200,
  MAX_LOG_NUMBERS: 60000,
  // Zeitjagd: so lange hat jeder für seine beste Zeit
  TIMEATTACK_MS: 10 * 60 * 1000,
  // Positionen werden höchstens so oft an den Raum verteilt
  GHOST_TICK_MS: 100,
});

// Obergrenze für Positionswerte (Pixel, Ticks) — nur gegen Unsinn, die Werte sind reine Anzeige
const POS_MAX = 10 ** 7;

const ACTIVE_STATES = ['loading', 'ready', 'racing', 'finished', 'dnf'];

const TOKEN_RE = /^[A-Za-z0-9_-]{8,64}$/;

function cleanText(value, max) {
  // Steuerzeichen raus (Zeilenumbrüche, Nullbytes), Leerraum zusammenfassen
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

function createRoomManager(deps) {
  const cfg = { ...DEFAULT_CONFIG, ...(deps.config || {}) };
  const now = deps.now || Date.now;
  const setTimer = deps.setTimer || setTimeout;
  const clearTimer = deps.clearTimer || clearTimeout;
  const randomId = deps.randomId || (() => crypto.randomBytes(6).toString('base64url'));
  const randomInt = deps.randomInt || ((n) => crypto.randomInt(n));
  const randomSeed = deps.randomSeed || (() => crypto.randomBytes(4).toString('hex'));
  const todayKey = deps.todayKey || (() => new Date().toISOString().slice(0, 10));
  const emitRoom = deps.emitRoom || (() => {});
  const emitSocket = deps.emitSocket || (() => {});
  // Für Positionen: darf Nachrichten verlieren (Socket.io "volatile"); ohne eigene Angabe wie emitRoom
  const emitRoomVolatile = deps.emitRoomVolatile || emitRoom;
  const joinRoom = deps.joinRoom || (() => {});
  const leaveRoom = deps.leaveRoom || (() => {});
  // Anti-Cheat (optional): verify(job) → Promise<{ status, ticks?, deaths?, splits? }>; dailyDateOf(params) →
  // Datumsschlüssel, wenn dies das Tages-Level ist; onVerifiedRun(lauf) für geprüfte Läufe des Tages-Levels
  const verify = deps.verify || null;
  const dailyDateOf = deps.dailyDateOf || (() => null);
  const onVerifiedRun = deps.onVerifiedRun || (() => {});
  // Custom-Level für eine Runde auflösen: (code) => { code, hash, name, creatorName, doc } | null. Ohne diese
  // Abhängigkeit (Datenbank/Level-Dienst nicht verfügbar) werden Custom-Runden im Plan zu Zufallsrunden.
  const resolveCustomLevel = deps.resolveCustomLevel || (() => null);

  const rooms = new Map();        // code -> room
  // Eindeutige Kennung jeder Runde: Die Rundennummer beginnt in jeder Sitzung wieder bei 1 und taugt deshalb nicht als Schlüssel
  let roundSeq = 0;
  const socketIndex = new Map();  // socket.id -> { code, pid }

  const ok = (extra = {}) => ({ ok: true, ...extra });
  const fail = (error) => ({ ok: false, error });

  // ── Hilfen ────────────────────────────────────────────────────────────────

  function generateCode() {
    let code;
    do {
      code = Array.from({ length: CODE_LENGTH }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join('');
    } while (rooms.has(code));
    return code;
  }

  // Ein Eintrag im Rundenplan: { kind: 'random' } oder { kind: 'custom', code }. Immer genau `rounds` Einträge lang —
  // wächst die Rundenzahl, kommen Zufallsrunden dazu; schrumpft sie, werden überzählige Einträge abgeschnitten.
  function cleanPlaylist(raw, rounds) {
    const list = Array.isArray(raw) ? raw : [];
    const out = [];
    for (let i = 0; i < rounds; i++) {
      const e = list[i];
      const code = e && typeof e === 'object' && e.kind === 'custom' ? normalizeCode(e.code) : null;
      const seed = e && typeof e === 'object' && e.kind === 'seed' && (typeof e.seed === 'string' || typeof e.seed === 'number') ? cleanText(e.seed, 40) : '';
      // (ein fest gewähltes Zufallslevel behält seine Generator-Version — sonst wäre es nach einer neuen Version ein anderes)
      const gv = seed ? cleanGv(e.gv) : null;
      if (code) out.push({ kind: 'custom', code });
      else if (seed && gv) out.push({ kind: 'seed', seed, biome: BIOMES.includes(e.biome) ? e.biome : 'random', gv });
      else out.push({ kind: 'random' });
    }
    return out;
  }

  function cleanSettings(raw, base) {
    const s = { ...base };
    const r = raw && typeof raw === 'object' ? raw : {};
    if (LENGTHS.includes(r.length)) s.length = r.length;
    if (SPEED_CLASSES.includes(r.speedClass)) s.speedClass = r.speedClass;
    if (BIOMES.includes(r.biome)) s.biome = r.biome;
    if (SEED_MODES.includes(r.seedMode)) s.seedMode = r.seedMode;
    if (typeof r.seed === 'string' || typeof r.seed === 'number') s.seed = cleanText(r.seed, 40);
    if (isInt(Number(r.rounds), 1, MAX_ROUNDS)) s.rounds = Number(r.rounds);
    // Auch wenn nur die Rundenzahl geändert wurde, muss die Liste auf die neue Länge gebracht werden
    s.playlist = cleanPlaylist(r.playlist !== undefined ? r.playlist : base.playlist, s.rounds);
    if (typeof r.includeDaily === 'boolean') s.includeDaily = r.includeDaily;
    if (MODES.includes(r.mode)) s.mode = r.mode;
    if (typeof r.hardcore === 'boolean') s.hardcore = r.hardcore;
    return s;
  }

  function touch(room) {
    room.updatedAt = now();
  }

  function setRoomTimer(room, name, ms, fn) {
    if (room.timers[name]) clearTimer(room.timers[name]);
    room.timers[name] = setTimer(() => {
      delete room.timers[name];
      fn();
    }, ms);
  }

  function clearRoomTimer(room, name) {
    if (room.timers[name]) {
      clearTimer(room.timers[name]);
      delete room.timers[name];
    }
  }

  function clearAllTimers(room) {
    for (const name of Object.keys(room.timers)) clearRoomTimer(room, name);
    for (const p of room.players.values()) clearPlayerTimer(p);
  }

  function clearPlayerTimer(p) {
    if (p.disconnectTimer) {
      clearTimer(p.disconnectTimer);
      p.disconnectTimer = null;
    }
  }

  const participants = (room) => [...room.players.values()].filter((p) => ACTIVE_STATES.includes(p.state));
  const connectedCount = (room) => [...room.players.values()].filter((p) => p.connected).length;

  // ── Aufbereitung für die Clients ─────────────────────────────────────────

  // Live-Platzierung: Ziel vor Checkpoint-Fortschritt; im Ziel nach Zeit, sonst nach Checkpoint und
  // der Zeit, zu der er erreicht wurde. Aufgeber (DNF) ans Ende.
  // (Zeitjagd: Wer schon eine Bestzeit hat, zählt wie "im Ziel", auch wenn er noch weiterläuft.)
  const hasTime = (p) => p.state !== 'dnf' && p.finishTicks !== null;

  function rank(list) {
    const order = list.slice().sort((a, b) => {
      const fa = hasTime(a);
      const fb = hasTime(b);
      if (fa !== fb) return fa ? -1 : 1;
      if (fa && fb) return a.finishTicks - b.finishTicks || a.finishedAt - b.finishedAt;
      const da = a.state === 'dnf';
      const db = b.state === 'dnf';
      if (da !== db) return da ? 1 : -1;
      return b.cp - a.cp || a.cpTick - b.cpTick;
    });
    const place = new Map();
    order.forEach((p, i) => {
      const prev = order[i - 1];
      const tie = prev && hasTime(p) && hasTime(prev) && prev.finishTicks === p.finishTicks;
      place.set(p.id, tie ? place.get(prev.id) : i + 1);
    });
    return place;
  }

  function computeResults(room) {
    const list = participants(room).filter((p) => p.state === 'finished' || p.state === 'dnf');
    const place = rank(list);
    const sorted = list.slice().sort((a, b) => place.get(a.id) - place.get(b.id) || a.finishedAt - b.finishedAt);
    const winner = sorted.find((p) => p.state === 'finished');

    // Beste Zwischenzeit je Checkpoint: nur sinnvoll, wenn mindestens zwei sie erreicht haben
    const bestAt = new Map();
    for (const p of sorted) {
      for (const [index, tick] of p.splits) {
        const cur = bestAt.get(index);
        if (!cur) bestAt.set(index, { tick, count: 1 });
        else {
          cur.count++;
          if (tick < cur.tick) cur.tick = tick;
        }
      }
    }

    // Punkte dieser Runde: Teilnehmerzahl − Platz + 1 (wer gewinnt, holt so viele Punkte wie Teilnehmer da waren);
    // ein DNF zählt immer 0, unabhängig vom Platz, den die Sortierung ihm gibt.
    return sorted.map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      place: place.get(p.id),
      dnf: p.state === 'dnf',
      died: p.died,
      ticks: p.state === 'finished' ? p.finishTicks : null,
      gap: p.state === 'finished' && winner ? p.finishTicks - winner.finishTicks : null,
      deaths: p.deaths,
      cp: p.cp,
      runs: p.runs,
      splits: p.splits,
      points: p.state === 'dnf' ? 0 : sorted.length - place.get(p.id) + 1,
      // true = nachgespielt und bestätigt · false = Prüfung fehlgeschlagen (Lauf gilt nicht) · null = nicht geprüft
      verified: p.verified,
      invalid: p.invalid,
      bestSplits: p.splits.filter(([index, tick]) => {
        const b = bestAt.get(index);
        return b && b.count >= 2 && tick === b.tick;
      }).map(([index]) => index),
    }));
  }

  // ── Serie: Rundenplan, Punkte, Gesamtwertung ─────────────────────────────

  /** Der fertige Rundenplan zu Serienbeginn: die Playlist des Hosts, ggf. mit einer zufällig platzierten Tages-Runde. */
  function buildSeriesPlan(room) {
    const plan = room.settings.playlist.map((e) => ({ ...e }));
    if (room.settings.includeDaily) plan[randomInt(plan.length)] = { kind: 'daily' };
    // Zufallsrunden einer Serie gleich auswürfeln: Die Browser bauen das nächste Pfad-Level dann schon auf dem
    // Ergebnisbildschirm (Phase D — ein Pfad-Level braucht einige Sekunden)
    if (plan.length > 1) for (const e of plan) if (e.kind === 'random') e.params = roundParams(room, 'new');
    for (const e of plan) if (e.kind === 'seed') e.params = { seed: e.seed, length: 'long', speedClass: 'super', biome: e.biome, gen: 'pfad', gv: e.gv };
    return plan;
  }

  /** Welche Runden-Parameter zu einem Plan-Eintrag gehören. Ein nicht mehr verfügbares Custom-Level wird im Plan
   * durch eine Zufallsrunde ersetzt (die Serie bricht deswegen nicht ab). */
  function resolveRoundEntry(room, mode) {
    const plan = room.series.plan;
    const entry = plan[room.series.index];
    if (entry.kind === 'daily') {
      return { kind: 'daily', params: dailyParams(todayKey()) };
    }
    if (entry.kind === 'custom') {
      const level = resolveCustomLevel(entry.code);
      if (level) return { kind: 'custom', params: null, custom: level };
      plan[room.series.index] = { kind: 'random' };
      notice(room, `Das Level ${entry.code} ist nicht mehr verfügbar — diese Runde wird zufällig ausgelost.`);
    }
    // Innerhalb einer Serie (mehr als eine Runde) bekommt jede Zufallsrunde einen frischen Seed: "Revanche" (gleicher
    // Seed) ergibt in einer Reihe mit mehreren, möglicherweise fremden Leveln keinen Sinn und bleibt dem Einzelrennen
    // vorbehalten (rounds === 1, dort reicht `mode` unverändert durch).
    // (In einer Serie sind die Zufallsrunden schon beim Start ausgewürfelt — buildSeriesPlan; so können die Browser das
    // nächste Level vorab bauen)
    if (entry.params) return { kind: 'random', params: entry.params };   // auch ein fest gewähltes Zufallslevel (kind 'seed')
    return { kind: 'random', params: roundParams(room, plan.length > 1 ? 'new' : mode) };
  }

  /** Punkte und Zeitsumme der Serie nach einer beendeten Runde fortschreiben. */
  function applySeriesScoring(room) {
    if (!room.series) return;
    // Zeitstrafe einer nicht beendeten Runde für den Tie-Break: die Obergrenze, die diese Rundenlänge ohnehin hätte
    const capTicks = Math.round((cfg.RACE_CAP_MS[room.round.params?.length] ?? cfg.RACE_CAP_MS.long) / 1000 * TICK_HZ);
    for (const r of room.results) {
      const cur = room.series.scores.get(r.id) || { points: 0, timeSum: 0, rounds: 0 };
      cur.points += r.points;
      cur.timeSum += r.dnf ? capTicks : (r.ticks ?? capTicks);
      cur.rounds += 1;
      room.series.scores.set(r.id, cur);
    }
  }

  /** Sitzung (seit der Lobby) fortschreiben: Punkte wie in der Serie, dazu Siege und Zahl der Runden. */
  function applySessionScoring(room) {
    if (!room.session) return;
    room.session.rounds += 1;
    for (const r of room.results) {
      const cur = room.session.scores.get(r.id) || { points: 0, wins: 0, rounds: 0 };
      cur.points += r.points;
      if (!r.dnf && r.place === 1) cur.wins += 1;
      cur.rounds += 1;
      room.session.scores.set(r.id, cur);
    }
  }

  function sessionStandings(room) {
    return [...room.players.values()]
      .map((p) => {
        const s = room.session.scores.get(p.id) || { points: 0, wins: 0, rounds: 0 };
        return { id: p.id, name: p.name, color: p.color, points: s.points, wins: s.wins, rounds: s.rounds };
      })
      .sort((a, b) => b.points - a.points || b.wins - a.wins);
  }

  /** Gesamtwertung für die Anzeige: alle aktuellen Spieler, auch wer noch nie mitgelaufen ist (0 Punkte). Sortiert
   * nach Punkten, bei Gleichstand nach der (kleineren) Zeitsumme. */
  function seriesStandings(room) {
    return [...room.players.values()]
      .map((p) => {
        const s = room.series.scores.get(p.id) || { points: 0, timeSum: 0, rounds: 0 };
        return { id: p.id, name: p.name, color: p.color, points: s.points, timeSum: s.timeSum, rounds: s.rounds };
      })
      .sort((a, b) => b.points - a.points || a.timeSum - b.timeSum);
  }

  function sanitize(room) {
    const liveRanked = participants(room);
    const place = rank(liveRanked);
    const showPlaces = room.phase === 'racing' || room.phase === 'results';
    return {
      code: room.code,
      phase: room.phase,
      hostId: room.hostId,
      settings: room.settings,
      roundNumber: room.roundNumber,
      round: room.round
        ? {
          id: room.round.id,
          number: room.round.number,
          kind: room.round.kind,
          // bei kind 'custom' Name/Ersteller für die Anzeige; das Dokument selbst holt der Client per HTTP
          // (levelsApi.getLevelDoc) — es gehört nicht in jede Zustands-Nachricht, die auch Zuschauer bekommen
          custom: room.round.custom ? { code: room.round.custom.code, name: room.round.custom.name, creatorName: room.round.custom.creatorName } : null,
          params: room.round.params,
          startAt: room.round.startAt,
          checkpointTotal: room.round.checkpointTotal,
          mode: room.round.mode,
          hardcore: room.round.hardcore,
          // Serverzeit, zu der die Runde spätestens endet: Zeitjagd = Ende der 10 Minuten; im Rennen die DNF-Frist, sobald
          // jemand im Ziel ist (vorher null — die allgemeine Obergrenze ist keine Anzeige wert)
          endAt: room.round.endAt,
          dnfAt: room.round.firstFinishAt !== null && room.round.mode !== 'timeattack' ? room.round.firstFinishAt + cfg.DNF_AFTER_FIRST_MS : null,
        }
        : null,
      // Sitzung seit der Lobby: erst ab der ersten beendeten Runde
      session: room.session && room.session.rounds > 0 ? { rounds: room.session.rounds, standings: sessionStandings(room) } : null,
      // Serie (Phase 4): nur vorhanden, sobald mindestens eine Runde gestartet wurde. Bei einem einzelnen Rennen
      // (rounds === 1) ist plan.length === 1 und hasNext immer false — die Oberfläche zeigt dann wie bisher nur
      // "Neue Runde"/"Revanche"/"Lobby" statt einer Gesamtwertung.
      series: room.series
        ? {
          index: room.series.index + 1,
          total: room.series.plan.length,
          mode: room.series.mode,
          plan: room.series.plan.map((e) => (e.kind === 'custom' ? { kind: 'custom', code: e.code } : e.kind === 'seed' ? { kind: 'seed', seed: e.seed, biome: e.biome, gv: e.gv } : { kind: e.kind })),
          // Parameter der NÄCHSTEN Zufallsrunde — erst auf dem Ergebnisbildschirm (sonst könnte man sie während der Runde
          // vorab erkunden); die Browser bauen das Level damit im Hintergrund vor
          naechste: room.phase === 'results' && room.series.plan[room.series.index + 1]?.params ? room.series.plan[room.series.index + 1].params : null,
          hasNext: room.phase === 'results' && room.series.index < room.series.plan.length - 1,
          standings: room.series.plan.length > 1 ? seriesStandings(room) : null,
        }
        : null,
      players: [...room.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        connected: p.connected,
        state: p.state,
        isHost: p.id === room.hostId,
        cp: p.cp,
        cpTick: p.cpTick,
        finishTicks: p.finishTicks,
        runs: p.runs,
        died: p.died,
        place: showPlaces && place.has(p.id) ? place.get(p.id) : null,
      })),
      results: room.phase === 'results' ? room.results : null,
      serverNow: now(),
    };
  }

  function emitState(room) {
    touch(room);
    emitRoom(room.code, 'sr:state', sanitize(room));
  }

  function notice(room, text) {
    emitRoom(room.code, 'sr:notice', { text });
  }

  // ── Spieler und Räume verwalten ───────────────────────────────────────────

  /** Die Wunschfarbe (Einstellungen im Browser), wenn sie gültig und im Raum frei ist — sonst die erste freie */
  function nextColor(room, wunsch) {
    const used = new Set([...room.players.values()].map((p) => p.color));
    if (PLAYER_COLORS.includes(wunsch) && !used.has(wunsch)) return wunsch;
    return PLAYER_COLORS.find((c) => !used.has(c)) || PLAYER_COLORS[room.players.size % PLAYER_COLORS.length];
  }

  function newPlayer(room, sock, name, token, wunschFarbe) {
    const p = {
      id: randomId(),
      token: TOKEN_RE.test(token || '') ? token : randomId() + randomId(),
      name,
      color: nextColor(room, wunschFarbe),
      socketId: sock.id,
      connected: true,
      state: room.phase === 'lobby' || room.phase === 'results' ? 'lobby' : 'spectator',
      hash: null,
      cp: 0,
      cpTick: 0,
      splits: [],
      finishTicks: null,
      finishedAt: 0,
      deaths: 0,
      log: null,
      fp: '',
      verified: null,
      invalid: false,
      runs: 0,
      died: false,
      attempt: 0,
      lastFinishAttempt: 0,
      pos: null,
      disconnectTimer: null,
    };
    room.players.set(p.id, p);
    return p;
  }

  function attach(room, p, sock) {
    // Alte Verbindung dieses Spielers (z.B. zweiter Tab) sauber lösen
    if (p.socketId && p.socketId !== sock.id) {
      socketIndex.delete(p.socketId);
      emitSocket(p.socketId, 'sr:kicked', { reason: 'Du bist in einem anderen Fenster beigetreten.' });
      leaveRoom(p.socketId, room.code);
    }
    p.socketId = sock.id;
    p.connected = true;
    clearPlayerTimer(p);
    socketIndex.set(sock.id, { code: room.code, pid: p.id });
    joinRoom(sock.id, room.code);
  }

  const you = (p) => ({ id: p.id, token: p.token });

  function ctxOf(sock) {
    const entry = socketIndex.get(sock.id);
    if (!entry) return null;
    const room = rooms.get(entry.code);
    const p = room?.players.get(entry.pid);
    return room && p ? { room, p } : null;
  }

  function destroyRoom(room) {
    clearAllTimers(room);
    for (const p of room.players.values()) {
      if (p.socketId) {
        socketIndex.delete(p.socketId);
        leaveRoom(p.socketId, room.code);
      }
    }
    rooms.delete(room.code);
  }

  function transferHost(room) {
    const next = [...room.players.values()].find((p) => p.connected) || [...room.players.values()][0];
    room.hostId = next ? next.id : null;
    if (next) notice(room, `${next.name} ist jetzt Host.`);
  }

  function removePlayer(room, p) {
    clearPlayerTimer(p);
    room.players.delete(p.id);
    if (p.socketId) {
      socketIndex.delete(p.socketId);
      leaveRoom(p.socketId, room.code);
    }
    if (room.players.size === 0) {
      destroyRoom(room);
      return;
    }
    if (room.hostId === p.id) transferHost(room);
    afterMembershipChange(room);
    emitState(room);
  }

  // Nach jedem Weggang: laufende Phasen auf Vollständigkeit prüfen
  function afterMembershipChange(room) {
    if (room.phase === 'loading') maybeBeginCountdown(room);
    else if (room.phase === 'racing') checkRaceDone(room);
    else if (room.phase === 'countdown' && participants(room).filter((p) => p.state === 'ready').length === 0) {
      resetToLobby(room);
    }
  }

  // ── Öffentliche Aktionen ─────────────────────────────────────────────────

  function create(sock, payload = {}) {
    leaveSilently(sock);
    const name = cleanText(payload.name, 24) || 'Spieler';
    const code = generateCode();
    const room = {
      code,
      createdAt: now(),
      updatedAt: now(),
      phase: 'lobby',
      hostId: null,
      settings: cleanSettings(payload.settings, DEFAULT_SETTINGS),
      players: new Map(),
      round: null,
      results: null,
      lastParams: null,
      roundNumber: 0,
      series: null,
      session: null,
      posDirty: false,
      timers: {},
    };
    rooms.set(code, room);
    const p = newPlayer(room, sock, name, payload.token, payload.color);
    room.hostId = p.id;
    attach(room, p, sock);
    emitState(room);
    return ok({ code, you: you(p), state: sanitize(room) });
  }

  function join(sock, payload = {}) {
    const code = cleanText(payload.code, 8).toUpperCase();
    const room = rooms.get(code);
    if (!room) return fail('Raum nicht gefunden.');

    const known = TOKEN_RE.test(payload.token || '')
      ? [...room.players.values()].find((p) => p.token === payload.token)
      : null;

    // Wer schon irgendwo sitzt, verlässt den alten Platz — außer er kommt als derselbe Spieler
    // in denselben Raum zurück (Wiederverbinden)
    const current = socketIndex.get(sock.id);
    if (current && !(known && current.code === code && current.pid === known.id)) leaveSilently(sock);

    if (known) {
      const name = cleanText(payload.name, 24);
      if (name) known.name = name;
      attach(room, known, sock);
      emitState(room);
      return ok({ code, you: you(known), state: sanitize(room), reconnected: true });
    }

    if (room.players.size >= MAX_PLAYERS) return fail('Der Raum ist voll.');
    const name = cleanText(payload.name, 24) || 'Spieler';
    const p = newPlayer(room, sock, name, payload.token, payload.color);
    attach(room, p, sock);
    notice(room, `${p.name} ist beigetreten.`);
    emitState(room);
    return ok({ code, you: you(p), state: sanitize(room) });
  }

  /** Eigene Farbe wechseln (in Lobby und Ergebnis) — nur eine der Spielerfarben, und nur, wenn niemand sonst sie hat */
  function setColor(sock, payload = {}) {
    const ctx = ctxOf(sock);
    if (!ctx) return fail('Du bist in keinem Raum.');
    const { room, p } = ctx;
    if (room.phase !== 'lobby' && room.phase !== 'results') return fail('Die Farbe lässt sich nur zwischen den Runden ändern.');
    if (!PLAYER_COLORS.includes(payload.color)) return fail('Unbekannte Farbe.');
    if (p.color === payload.color) return ok({ color: p.color });
    if ([...room.players.values()].some((q) => q.id !== p.id && q.color === payload.color)) return fail('Diese Farbe hat schon jemand in der Lobby.');
    p.color = payload.color;
    emitState(room);
    return ok({ color: p.color });
  }

  function setSettings(sock, raw) {
    const ctx = ctxOf(sock);
    if (!ctx) return fail('Du bist in keinem Raum.');
    const { room, p } = ctx;
    if (room.hostId !== p.id) return fail('Nur der Host kann die Einstellungen ändern.');
    if (room.phase !== 'lobby') return fail('Einstellungen lassen sich nur in der Lobby ändern.');
    room.settings = cleanSettings(raw, room.settings);
    emitState(room);
    return ok();
  }

  function roundParams(room, mode) {
    const s = room.settings;
    if (mode === 'same' && room.lastParams) return { ...room.lastParams };
    if (mode !== 'new' && s.seedMode === 'daily') {
      // Der Tages-Seed legt alles fest, damit alle Besucher dasselbe Level bekommen
      return dailyParams(todayKey());
    }
    const seed = mode !== 'new' && s.seedMode === 'custom' && s.seed ? s.seed : randomSeed();
    // Phase D (27.09.2026): Zufallsrunden bauen mit Pfad — immer lang und „super“ (Länge/Tempo der Einstellungen gelten
    // nur noch für alte Räume ohne Pfad)
    return { seed, length: 'long', speedClass: 'super', biome: s.biome, gen: 'pfad', gv: PFAD_GEN_VERSION };
  }

  function start(sock, payload = {}) {
    const ctx = ctxOf(sock);
    if (!ctx) return fail('Du bist in keinem Raum.');
    const { room, p } = ctx;
    if (room.hostId !== p.id) return fail('Nur der Host kann die Runde starten.');
    if (room.phase !== 'lobby' && room.phase !== 'results') return fail('Die Runde läuft bereits.');

    // Innerhalb einer laufenden Serie geht es mit dem vorbereiteten Plan weiter ("Nächste Runde"); sonst beginnt
    // eine NEUE Serie — auch ein einzelnes Rennen (rounds === 1) ist eine Serie der Länge 1.
    const advancing = payload.mode === 'next' && room.series && room.phase === 'results' && room.series.index < room.series.plan.length - 1;
    let mode = 'settings';
    if (advancing) {
      room.series.index++;
    } else {
      mode = payload.mode === 'same' || payload.mode === 'new' ? payload.mode : 'settings';
      if (mode === 'same' && !room.lastParams) return fail('Es gibt keine vorige Runde.');
      const seriesMode = room.settings.mode;
      room.series = { plan: buildSeriesPlan(room), index: 0, scores: new Map(), mode: seriesMode, hardcore: seriesMode !== 'timeattack' && !!room.settings.hardcore };
    }
    if (!room.session) room.session = { rounds: 0, scores: new Map() };

    const entry = resolveRoundEntry(room, mode);
    room.roundNumber++;
    if (entry.kind === 'random') room.lastParams = entry.params;
    room.round = {
      id: ++roundSeq,
      number: room.roundNumber,
      kind: entry.kind,
      params: entry.params,
      custom: entry.custom || null,
      startAt: null,
      checkpointTotal: null,
      hash: entry.kind === 'custom' ? entry.custom.hash : null,
      firstFinishAt: null,
      mode: room.series.mode || 'race',
      hardcore: !!room.series.hardcore,
      endAt: null,
    };
    room.results = null;
    room.phase = 'loading';
    for (const q of room.players.values()) {
      q.state = q.connected ? 'loading' : 'spectator';
      q.hash = null;
      q.cp = 0;
      q.cpTick = 0;
      q.splits = [];
      q.finishTicks = null;
      q.finishedAt = 0;
      q.deaths = 0;
      q.log = null;
      q.fp = '';
      q.verified = null;
      q.invalid = false;
      q.runs = 0;
      q.attempt = 0;
      q.lastFinishAttempt = 0;
      q.died = false;
      q.pos = null;
    }
    setRoomTimer(room, 'load', room.round.params?.gen === 'pfad' ? cfg.LOAD_TIMEOUT_PFAD_MS : cfg.LOAD_TIMEOUT_MS, () => beginCountdown(room));
    emitState(room);
    return ok();
  }

  function ready(sock, payload = {}) {
    const ctx = ctxOf(sock);
    if (!ctx) return fail('Du bist in keinem Raum.');
    const { room, p } = ctx;
    if (room.phase !== 'loading' || p.state !== 'loading') return fail('Gerade wird keine Runde vorbereitet.');
    // Ein Zufalls- oder Tages-Level meldet den kurzen Struktur-Hash des Generators (8 Hex-Zeichen, gen/generator.js);
    // ein Custom-Level den Inhalts-Hash seines Dokuments (SHA-256, level/format.js) — 64 Hex-Zeichen.
    const hashRe = room.round.kind === 'custom' ? /^[0-9a-f]{64}$/ : /^[0-9a-f]{8}$/;
    if (typeof payload.hash !== 'string' || !hashRe.test(payload.hash)) return fail('Ungültiger Level-Hash.');
    const total = isInt(payload.checkpoints, 0, 400) ? payload.checkpoints : 0;
    p.hash = payload.hash;
    p.state = 'ready';
    if (room.round.checkpointTotal === null) room.round.checkpointTotal = total;
    emitState(room);
    maybeBeginCountdown(room);
    return ok();
  }

  function maybeBeginCountdown(room) {
    if (room.phase !== 'loading') return;
    const active = participants(room);
    if (active.some((p) => p.state === 'loading')) return;
    beginCountdown(room);
  }

  function beginCountdown(room) {
    if (room.phase !== 'loading') return;
    clearRoomTimer(room, 'load');

    // Wer nicht rechtzeitig fertig war, schaut zu
    for (const p of room.players.values()) if (p.state === 'loading') p.state = 'spectator';

    // Alle müssen dasselbe Level erzeugt haben; eine abweichende Programmversion (z.B. alte Seite im
    // Tab) würde sonst in einer anderen Welt laufen und das Ergebnis verfälschen.
    const readyPlayers = participants(room).filter((p) => p.state === 'ready');

    let bestHash = null;
    if (readyPlayers.length) {
      if (room.round.kind === 'custom') {
        // Der Server kennt den Inhalt (und damit den Hash) schon VOR den Clients — keine Mehrheitsabstimmung nötig,
        // wer abweicht, hat schlicht einen veralteten Stand
        bestHash = room.round.hash;
      } else {
        const counts = new Map();
        for (const p of readyPlayers) counts.set(p.hash, (counts.get(p.hash) || 0) + 1);
        let best = null;
        for (const [hash, n] of counts) {
          const hostHas = readyPlayers.some((p) => p.id === room.hostId && p.hash === hash);
          if (!best || n > best.n || (n === best.n && hostHas)) best = { hash, n };
        }
        bestHash = best.hash;
      }
    }

    if (!bestHash) {
      notice(room, 'Niemand war rechtzeitig bereit. Zurück in der Lobby.');
      resetToLobby(room);
      return;
    }
    for (const p of readyPlayers) {
      if (p.hash !== bestHash) {
        p.state = 'incompatible';
        emitSocket(p.socketId, 'sr:notice', { text: 'Dein Level weicht von den anderen ab. Lade die Seite neu und versuche es noch einmal.' });
      }
    }
    room.round.hash = bestHash;

    room.round.startAt = now() + cfg.COUNTDOWN_MS;
    room.phase = 'countdown';
    setRoomTimer(room, 'go', cfg.COUNTDOWN_MS, () => go(room));
    emitState(room);
  }

  function go(room) {
    if (room.phase !== 'countdown') return;
    room.phase = 'racing';
    for (const p of room.players.values()) if (p.state === 'ready') p.state = 'racing';
    // Zufalls- und Tages-Runden kennen ihre Länge (kurz/mittel/lang); ein Custom-Level (params: null) bekommt die
    // großzügigste Grenze, weil eigene Level bis zu 1200 Kacheln breit sein dürfen.
    // Zeitjagd: feste 10 Minuten ab dem Start, und die stehen für alle sichtbar im Zustand (endAt)
    const capMs = room.round.mode === 'timeattack' ? cfg.TIMEATTACK_MS : (cfg.RACE_CAP_MS[room.round.params?.length] ?? cfg.RACE_CAP_MS.long);
    if (room.round.mode === 'timeattack') room.round.endAt = room.round.startAt + capMs;
    setRoomTimer(room, 'cap', capMs, () => endRound(room));
    emitState(room);
    checkRaceDone(room);
  }

  function resetToLobby(room) {
    clearRoomTimer(room, 'load');
    clearRoomTimer(room, 'go');
    clearRoomTimer(room, 'cap');
    clearRoomTimer(room, 'dnf');
    clearRoomTimer(room, 'ghosts');
    room.phase = 'lobby';
    room.round = null;
    room.results = null;
    // Zurück in die Lobby beendet eine laufende Serie; von dort beginnt "Runde starten" immer eine neue.
    room.series = null;
    // … und eine neue Sitzung: Wertung und Rundenzählung fangen wieder bei null an
    room.session = null;
    room.roundNumber = 0;
    for (const p of room.players.values()) {
      p.state = 'lobby';
      p.hash = null;
    }
    scheduleGraceForDisconnected(room);
    emitState(room);
  }

  // Elapsed ticks upper bound: A client cannot have simulated more ticks than real time allows.
  function elapsedTicks(room) {
    return Math.floor(((now() - room.round.startAt) / 1000) * TICK_HZ);
  }

  function checkpoint(sock, payload = {}) {
    const ctx = ctxOf(sock);
    if (!ctx) return fail('Du bist in keinem Raum.');
    const { room, p } = ctx;
    if (room.phase !== 'racing' || p.state !== 'racing') return fail('Gerade läuft kein Rennen für dich.');
    const total = room.round.checkpointTotal || 0;
    if (!isInt(payload.index, 1, Math.max(1, total)) || !isInt(payload.tick, 1, 10 ** 8)) return fail('Ungültiger Checkpoint.');
    const timeattack = room.round.mode === 'timeattack';
    if (timeattack) {
      // Jeder Versuch beginnt wieder bei Checkpoint 0; eine Meldung aus einem älteren Versuch ist überholt
      const attempt = isInt(payload.attempt, 1, 10 ** 6) ? payload.attempt : 1;
      if (attempt < p.attempt) return ok();
      if (attempt > p.attempt) {
        p.attempt = attempt;
        p.cp = 0;
        p.cpTick = 0;
      }
    }
    if (payload.index <= p.cp) return ok();           // schon bekannt (Wiederholung nach Reconnect)
    if (payload.tick > elapsedTicks(room) + TICK_SLACK) return fail('Zeit liegt in der Zukunft.');
    if (payload.tick < p.cpTick) return fail('Zeit liegt vor dem letzten Checkpoint.');
    p.cp = payload.index;
    p.cpTick = payload.tick;
    // (Zeitjagd: Die Zwischenzeiten der Tabelle gehören zum BESTEN Lauf und kommen mit dessen Zielmeldung)
    if (!timeattack) p.splits.push([payload.index, payload.tick]);
    emitState(room);
    return ok();
  }

  function cleanSplits(raw, ticks, total) {
    if (!Array.isArray(raw) || raw.length > cfg.MAX_SPLITS) return null;
    const out = [];
    let lastIndex = 0;
    let lastTick = 0;
    for (const item of raw) {
      if (!Array.isArray(item) || item.length !== 2) return null;
      const [index, tick] = item;
      if (!isInt(index, 1, Math.max(1, total)) || !isInt(tick, 1, ticks)) return null;
      if (index <= lastIndex || tick < lastTick) return null;
      out.push([index, tick]);
      lastIndex = index;
      lastTick = tick;
    }
    return out;
  }

  function cleanLog(raw) {
    // Input-Log als flache Liste [tick, maske, tick, maske, …] — Phase 5 rechnet damit den Lauf nach
    if (!Array.isArray(raw) || raw.length % 2 !== 0 || raw.length > cfg.MAX_LOG_NUMBERS) return null;
    for (let i = 0; i < raw.length; i++) if (!isInt(raw[i], 0, 10 ** 8)) return null;
    return raw;
  }

  /** Hardcore: Kommt im Input-Log [tick, maske, …] die Taste „Zum Checkpoint“ vor? (Kein Log zählt nicht — das fängt die Prüfung ab) */
  function logHasRestart(log) {
    if (!Array.isArray(log)) return false;
    for (let i = 1; i < log.length; i += 2) if ((log[i] & INPUT_RESTART) !== 0) return true;
    return false;
  }

  function finish(sock, payload = {}) {
    const ctx = ctxOf(sock);
    if (!ctx) return fail('Du bist in keinem Raum.');
    const { room, p } = ctx;
    if (p.state === 'finished') return ok();                       // Wiederholung nach Reconnect
    if (room.phase !== 'racing' || p.state !== 'racing') return fail('Gerade läuft kein Rennen für dich.');
    if (!isInt(payload.ticks, 60, 10 ** 8)) return fail('Ungültige Zeit.');
    if (payload.ticks > elapsedTicks(room) + TICK_SLACK) return fail('Zeit liegt in der Zukunft.');
    if (room.round.mode === 'timeattack') return finishAttempt(room, p, payload);
    if (payload.ticks < p.cpTick) return fail('Zeit liegt vor dem letzten Checkpoint.');

    // Hardcore: Ein Lauf mit Toden hätte gar nicht ins Ziel kommen dürfen (der Browser meldet den ersten Tod) — DNF
    if (room.round.hardcore && (payload.deaths !== 0 || logHasRestart(payload.log))) return eliminate(room, p);

    p.finishTicks = payload.ticks;
    p.finishedAt = now();
    p.deaths = isInt(payload.deaths, 0, 99999) ? payload.deaths : 0;
    const splits = cleanSplits(payload.splits, payload.ticks, room.round.checkpointTotal || 0);
    if (splits) {
      p.splits = splits;
      if (splits.length) {
        p.cp = splits[splits.length - 1][0];
        p.cpTick = splits[splits.length - 1][1];
      }
    }
    p.log = cleanLog(payload.log);
    p.fp = /^[A-Za-z0-9]{1,40}$/.test(String(payload.fp || '')) ? String(payload.fp) : '';
    p.state = 'finished';

    // Nach dem ersten Ziel läuft die Frist für alle anderen
    if (room.round.firstFinishAt === null) {
      room.round.firstFinishAt = now();
      setRoomTimer(room, 'dnf', cfg.DNF_AFTER_FIRST_MS, () => endRound(room));
    }
    emitState(room);
    checkRaceDone(room);
    return ok();
  }

  /**
   * Zeitjagd: ein Lauf im Ziel. Der Spieler bleibt im Rennen; zählt nur, wenn er schneller ist als seine Bestzeit.
   * Ein Versuch zählt einmal — eine wiederholte Meldung (Reconnect) ändert nichts.
   */
  function finishAttempt(room, p, payload) {
    const attempt = isInt(payload.attempt, 1, 10 ** 6) ? payload.attempt : 1;
    // Ein schon gezählter (oder älterer) Versuch: nachgereicht nach einem Reconnect. Zählt nicht noch einmal als Lauf —
    // nur, falls genau diese Meldung damals verloren ging und schneller ist, wird sie noch Bestzeit.
    const repeat = attempt <= p.lastFinishAttempt;
    const improved = p.finishTicks === null || payload.ticks < p.finishTicks;
    if (repeat && !improved) return ok({ best: p.finishTicks, improved: false });
    if (!repeat) {
      p.lastFinishAttempt = attempt;
      p.runs += 1;
      if (attempt >= p.attempt) {
        p.attempt = attempt;
        p.cp = 0;
        p.cpTick = 0;
      }
    }
    if (improved) {
      p.finishTicks = payload.ticks;
      p.finishedAt = now();
      p.deaths = isInt(payload.deaths, 0, 99999) ? payload.deaths : 0;
      p.splits = cleanSplits(payload.splits, payload.ticks, room.round.checkpointTotal || 0) || [];
      p.log = cleanLog(payload.log);
      p.fp = /^[A-Za-z0-9]{1,40}$/.test(String(payload.fp || '')) ? String(payload.fp) : '';
    }
    emitState(room);
    return ok({ best: p.finishTicks, improved });
  }

  /** Wer aus dem Rennen geht (aufgeben, weg, Zeit um): Mit Zeit (Zeitjagd-Bestzeit) ist er im Ziel, sonst DNF. */
  function stopRunner(p) {
    p.state = p.finishTicks !== null ? 'finished' : 'dnf';
    p.pos = null;
  }

  function giveUp(sock, payload = {}) {
    const ctx = ctxOf(sock);
    if (!ctx) return fail('Du bist in keinem Raum.');
    const { room, p } = ctx;
    if (room.phase !== 'racing' || p.state !== 'racing') return fail('Gerade läuft kein Rennen für dich.');
    // Hardcore: der erste Tod (vom Browser gemeldet) — ausgeschieden statt aufgegeben
    if (payload.died === true && room.round.hardcore) return eliminate(room, p);
    // Zeitjagd: "Beenden" behält die Bestzeit; im Rennen gibt es keine, das bleibt ein DNF
    stopRunner(p);
    emitState(room);
    checkRaceDone(room);
    return ok();
  }

  /** Hardcore: gestorben — DNF ohne Zeit, in Rangliste und Ergebnis als „ausgeschieden“ markiert */
  function eliminate(room, p) {
    p.died = true;
    p.finishTicks = null;
    stopRunner(p);
    emitState(room);
    checkRaceDone(room);
    return ok({ eliminated: true });
  }

  function checkRaceDone(room) {
    if (room.phase !== 'racing') return;
    if (participants(room).some((p) => p.state === 'racing')) return;
    endRound(room);
  }

  function endRound(room) {
    if (room.phase !== 'racing') return;
    clearRoomTimer(room, 'dnf');
    clearRoomTimer(room, 'cap');
    clearRoomTimer(room, 'ghosts');
    for (const p of participants(room)) if (p.state === 'racing' || p.state === 'ready') stopRunner(p);
    for (const p of room.players.values()) p.pos = null;
    room.results = computeResults(room);
    room.phase = 'results';
    // Punkte gehören zu GENAU diesem Ergebnis und werden nur einmal vergeben. Verwirft die spätere Prüfung
    // (verifyRound) ausnahmsweise den Lauf des Siegers, ändert das die Serien-Wertung nicht rückwirkend — der Fall
    // ist zu selten (nur bei einem Betrugsversuch), um eine schon gezeigte Wertung nachträglich zu verbiegen.
    applySeriesScoring(room);
    applySessionScoring(room);
    scheduleGraceForDisconnected(room);
    emitState(room);
    verifyRound(room);
  }

  // ── Anti-Cheat ──────────────────────────────────────────────────────────

  /**
   * Lässt die Läufe nachspielen: den des Siegers, beim Tages-Level alle. Das Ergebnis steht sofort da;
   * die Bestätigung (oder das Streichen einer nicht bestätigten Zeit) folgt einen Moment später.
   */
  function verifyRound(room) {
    if (!verify) return;
    const round = room.round;
    const dateKey = dailyDateOf(round.params);
    const finishers = participants(room)
      .filter((p) => p.state === 'finished')
      .sort((a, b) => a.finishTicks - b.finishTicks || a.finishedAt - b.finishedAt);
    if (!finishers.length) return;

    (async () => {
      let winnerStands = false;
      for (const p of finishers) {
        if (winnerStands && !dateKey) break;
        // Ohne brauchbares Log lässt sich nichts nachspielen — das ist kein Lauf, den ein ehrlicher Browser schickt.
        // Ein Custom-Level bringt sein Dokument selbst mit (der Server hat es beim Rundenstart aufgelöst); ein
        // Zufalls- oder Tages-Level entsteht wie eh und je aus den Parametern.
        const job = round.kind === 'custom'
          ? { kind: 'custom', doc: round.custom.doc, hash: round.custom.hash, log: p.log, ticks: p.finishTicks, fp: p.fp }
          : { params: round.params, log: p.log, ticks: p.finishTicks, fp: p.fp };
        const verdict = p.log ? await verify(job) : { status: 'invalid', reason: 'Kein Input-Log.' };
        if (room.round !== round || room.phase !== 'results') return;      // der Raum ist weitergegangen

        // Hardcore: Das Nachspielen zeigt einen Tod, den der Browser nicht gemeldet hat — die Zeit zählt nicht
        if (verdict.status === 'ok' && round.hardcore && verdict.deaths > 0) {
          p.state = 'dnf';
          p.died = true;
          p.invalid = true;
          p.verified = false;
          p.finishTicks = null;
          notice(room, `${p.name}: Im Hardcore-Modus zählt ein Lauf mit Tod nicht.`);
        } else if (verdict.status === 'ok') {
          p.verified = true;
          p.deaths = verdict.deaths;
          if (Array.isArray(verdict.splits)) p.splits = verdict.splits;
          winnerStands = true;
          if (dateKey) {
            onVerifiedRun({
              dateKey, token: p.token, name: p.name, ticks: verdict.ticks, deaths: verdict.deaths,
              splits: verdict.splits, log: p.log, fp: p.fp,
            });
          }
        } else if (verdict.status === 'invalid') {
          p.state = 'dnf';
          p.invalid = true;
          p.verified = false;
          p.finishTicks = null;
          notice(room, `${p.name}: Die Zeit konnte nicht bestätigt werden und zählt nicht.`);
        } else {
          // Nicht geprüft (anderer Sim-Stand, Prüfer überlastet oder ausgefallen): Die Zeit bleibt, ohne Haken
          p.verified = null;
          winnerStands = true;
        }
        room.results = computeResults(room);
        emitState(room);
      }
    })().catch((e) => console.error('[seed-runners] Prüfung:', e));
  }

  function toLobby(sock) {
    const ctx = ctxOf(sock);
    if (!ctx) return fail('Du bist in keinem Raum.');
    const { room, p } = ctx;
    if (room.hostId !== p.id) return fail('Nur der Host kann zurück in die Lobby.');
    if (room.phase !== 'results') return fail('Es gibt kein Ergebnis, aus dem man zurückgeht.');
    resetToLobby(room);
    return ok();
  }

  // ── Verbindungsabbruch ───────────────────────────────────────────────────

  function scheduleGrace(room, p) {
    if (p.connected || p.disconnectTimer) return;
    p.disconnectTimer = setTimer(() => {
      p.disconnectTimer = null;
      if (p.connected || !room.players.has(p.id)) return;
      // Mitten im Rennen zählt ein Ausgefallener als DNF, sonst wird er aus dem Raum genommen
      if (room.phase === 'racing' && p.state === 'racing') {
        stopRunner(p);
        emitState(room);
        checkRaceDone(room);
      } else {
        removePlayer(room, p);
      }
    }, cfg.DISCONNECT_GRACE_MS);
  }

  function scheduleGraceForDisconnected(room) {
    for (const p of room.players.values()) scheduleGrace(room, p);
  }

  function disconnect(sock) {
    const entry = socketIndex.get(sock.id);
    if (!entry) return;
    socketIndex.delete(sock.id);
    const room = rooms.get(entry.code);
    const p = room?.players.get(entry.pid);
    if (!room || !p || p.socketId !== sock.id) return;   // schon von einer neuen Verbindung übernommen
    p.connected = false;
    p.socketId = null;

    if (room.phase === 'loading' && p.state === 'loading') p.state = 'spectator';
    if (room.hostId === p.id && connectedCount(room) > 0) transferHost(room);
    scheduleGrace(room, p);
    afterMembershipChange(room);
    emitState(room);
  }

  // Beim Wechsel in einen neuen Raum (create/join anderswo) das alte Zimmer ohne Aufsehen verlassen
  function leaveSilently(sock) {
    const entry = socketIndex.get(sock.id);
    if (!entry) return;
    const room = rooms.get(entry.code);
    const p = room?.players.get(entry.pid);
    socketIndex.delete(sock.id);
    if (!room || !p) return;
    leaveRoom(sock.id, room.code);
    if (room.phase === 'racing' && p.state === 'racing') {
      stopRunner(p);
      p.connected = false;
      p.socketId = null;
      emitState(room);
      checkRaceDone(room);
      scheduleGrace(room, p);
    } else {
      removePlayer(room, p);
    }
  }

  function leave(sock) {
    const entry = socketIndex.get(sock.id);
    if (!entry) return ok();
    const room = rooms.get(entry.code);
    const p = room?.players.get(entry.pid);
    if (!room || !p) {
      socketIndex.delete(sock.id);
      return ok();
    }
    if (room.phase === 'racing' && p.state === 'racing') {
      // Wer mitten im Rennen geht, hat aufgegeben (Zeitjagd: mit seiner Bestzeit); der Eintrag bleibt für die Tabelle
      stopRunner(p);
    }
    if (p.state === 'dnf' || p.state === 'finished') {
      // Ergebnis bleibt sichtbar: als "getrennt" markieren statt entfernen, bis die Runde vorbei ist
      p.connected = false;
      p.socketId = null;
      socketIndex.delete(sock.id);
      leaveRoom(sock.id, room.code);
      if (room.hostId === p.id && connectedCount(room) > 0) transferHost(room);
      scheduleGrace(room, p);
      emitState(room);
      checkRaceDone(room);
      return ok();
    }
    removePlayer(room, p);
    return ok();
  }

  // ── Positionen (Geister, Zuschauen) ─────────────────────────────────────

  /** Letzte Position eines Läufers merken; verteilt wird gebündelt (flushPositions). Keine Antwort, kein Fehlertext. */
  function position(sock, payload = {}) {
    const ctx = ctxOf(sock);
    if (!ctx) return;
    const { room, p } = ctx;
    if (room.phase !== 'racing' || p.state !== 'racing') return;
    const { x, y, t } = payload;
    if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > POS_MAX || Math.abs(y) > POS_MAX || !isInt(t, 0, POS_MAX)) return;
    p.pos = {
      x: Math.round(x),
      y: Math.round(y),
      f: payload.f === -1 ? -1 : 1,
      t,
      a: isInt(payload.a, 0, 10 ** 6) ? payload.a : 0,
    };
    room.posDirty = true;
    if (!room.timers.ghosts) setRoomTimer(room, 'ghosts', cfg.GHOST_TICK_MS, () => flushPositions(room));
  }

  function flushPositions(room) {
    if (room.phase !== 'racing' || !room.posDirty) return;
    room.posDirty = false;
    const list = [];
    for (const p of room.players.values()) {
      if (p.pos && p.state === 'racing') list.push([p.id, p.pos.x, p.pos.y, p.pos.f, p.pos.t, p.pos.a]);
    }
    if (list.length) emitRoomVolatile(room.code, 'sr:pos', { list });
  }

  function ping(_sock, payload = {}) {
    return { ok: true, t: payload.t, serverNow: now() };
  }

  // Aufräumen: Räume ohne verbundene Spieler, die lange nichts mehr getan haben
  function sweep() {
    const cutoff = now() - cfg.STALE_AFTER_MS;
    for (const room of [...rooms.values()]) {
      if (connectedCount(room) === 0 && room.updatedAt < cutoff) destroyRoom(room);
    }
  }

  function stats() {
    let players = 0;
    for (const room of rooms.values()) players += connectedCount(room);
    return { rooms: rooms.size, players };
  }

  return {
    create, join, leave, disconnect, setSettings, setColor, start, ready, checkpoint, finish, giveUp, toLobby, position, ping, sweep, stats,
    // für Tests
    _rooms: rooms,
  };
}

module.exports = {
  createRoomManager, MAX_PLAYERS, MAX_ROUNDS, DEFAULT_SETTINGS, DEFAULT_CONFIG, LENGTHS, SPEED_CLASSES, BIOMES, SEED_MODES, MODES, PLAYER_COLORS,
};
