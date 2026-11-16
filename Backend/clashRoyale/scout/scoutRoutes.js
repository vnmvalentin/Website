// scoutRoutes.js — /api/clash/scout: Daten der Stats-Seiten unter /clash (Spieler, Clans, Ranglisten, Meta).
// Öffentlich, ohne Login. Frontend: pages/ClashRoyale/scout/.
//
// Schutz der offiziellen API (ein Schlüssel für alle Besucher):
//   • Zwischenspeicher je Adresse mit kurzer Haltbarkeit; gleichzeitige gleiche Anfragen teilen sich einen Abruf
//   • höchstens einige Abrufe gleichzeitig, der Rest wartet in einer begrenzten Schlange
//   • Obergrenze je Besucher-Adresse und Minute
//
// Schlüssel: CLASH_ROYALE_API_TOKEN_SCOUT, sonst der geteilte CLASH_ROYALE_API_TOKEN (siehe lib/crApi.js). Ohne
// Schlüssel oder bei gesperrter IP antworten die Routen mit einem Fehlercode statt zu werfen.
//
// Antworten: { ok: true, … } oder { ok: false, key } mit key ∈ invalidTag | notFound | apiNotConfigured |
// apiDown | busy | rateLimited — der Client übersetzt (scout/scoutI18n.js).

const express = require('express');
const crApi = require('../lib/crApi');
const shape = require('./scoutShape');
const history = require('./scoutHistory');
const { formPatterns, fromScoutBattle, validTimeZone } = require('../lib/formPatterns');
// Kämpfe, die für die Form-Auswertung nicht zählen (Spaß, keine Wertung)
const CASUAL_GROUPS = new Set(['friendly', 'party']);
const defaultStore = require('./scoutStore');
const { createMetaCrawler } = require('./scoutMeta');
const { createIndexFeeder } = require('./scoutIndexFeed');
const { createMatchupWorker } = require('./scoutMatchups');

const SEC = 1000;
const TTL = {
  player: 60 * SEC,
  clan: 2 * 60 * SEC,
  race: 2 * 60 * SEC,
  warLog: 15 * 60 * SEC,
  ranking: 5 * 60 * SEC,
  locations: 24 * 60 * 60 * SEC,
  clanSearch: 5 * 60 * SEC,
  catalog: 12 * 60 * 60 * SEC,
};
const MAX_CACHE_ENTRIES = 3000;
const MAX_CONCURRENT = 6;
const MAX_QUEUE = 80;
const REQUESTS_PER_MINUTE = 90;
// Ranked-Decks für die Ranglisten: so lange gilt ein gemerktes Deck als aktuell, so viele Tags je Nachlade-Anfrage
const DECK_FRESH_MS = 24 * 60 * 60 * SEC;
const DECK_BATCH = 12;
// Kampf-Verlauf: so viele Kämpfe gehen mit dem Profil mit, so viele je nachgeladener Seite
const PROFILE_BATTLES = 50;
const HISTORY_PAGE = 30;
// Beobachtung angesehener Profile: wie lange nach dem letzten Besuch, wie oft, wie viele je Durchgang
const WATCH_DAYS = 7;
const WATCH_EVERY_H = 3;
const WATCH_BATCH = 60;
// Clan-Schnappschüsse angesehener Clans (scoutHistory.js): wie lange nach dem letzten Besuch, wie oft, wie viele je
// Durchgang, höchstens wie viele Clans insgesamt (je Schnappschuss zwei Abrufe)
const CLAN_TRACK_DAYS = 30;
const CLAN_EVERY_H = 3;
const CLAN_BATCH = 20;
const CLAN_MAX = 200;

class ScoutError extends Error {
  constructor(key, status) {
    super(key);
    this.key = key;
    this.status = status;
  }
}

/** Client-Adresse hinter nginx: das letzte Element von X-Forwarded-For hat nginx selbst angehängt. */
function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
  return forwarded.length ? forwarded[forwarded.length - 1] : req.socket?.remoteAddress || 'unbekannt';
}

/**
 * @param {object} [deps]
 * @param {object} [deps.api]    Ersatz für lib/crApi (Tests, Prüfstand)
 * @param {object} [deps.store]  Ersatz für scoutStore
 * @param {boolean} [deps.meta]  false = keinen Meta-Sammler starten
 * @param {number} [deps.crawlSpacingMs]  Pause zwischen zwei Abrufen des Sammlers (Tests: 0)
 */
// Ohne mitgegebene Anmeldung (Tests) gilt jeder als Gast; abstimmen ist dann nicht möglich.
const guestAuth = (req, res, next) => next();
const noAuth = (req, res) => res.status(401).json({ ok: false, key: 'loginRequired' });

function createScoutRouter({ api = crApi, store = defaultStore, meta = true, crawlSpacingMs, requireAuth = noAuth, optionalAuth = guestAuth } = {}) {
  const router = express.Router();
  const token = process.env.CLASH_ROYALE_API_TOKEN_SCOUT || undefined;

  // ── Drosselung der Abrufe ──────────────────────────────────────────────────
  let active = 0;
  const waiting = [];
  function acquire() {
    if (active < MAX_CONCURRENT) {
      active += 1;
      return Promise.resolve();
    }
    if (waiting.length >= MAX_QUEUE) return Promise.reject(new ScoutError('busy', 503));
    return new Promise((resolve) => { waiting.push(resolve); });
  }
  function release() {
    const next = waiting.shift();
    if (next) next(); else active -= 1;
  }

  /** Ein Abruf: Daten, null bei 404. Wirft ScoutError bei fehlendem Schlüssel oder gestörter API. */
  async function upstream(path) {
    if (!api.isConfigured(token)) throw new ScoutError('apiNotConfigured', 503);
    await acquire();
    try {
      const data = await api.crApiGet(path, { token });
      if (!data) throw new ScoutError('apiNotConfigured', 503);
      return data.notFound ? null : data;
    } catch (err) {
      if (err instanceof ScoutError) throw err;
      throw new ScoutError(/HTTP 429/.test(err?.message || '') ? 'busy' : 'apiDown', 502);
    } finally {
      release();
    }
  }

  // ── Zwischenspeicher ───────────────────────────────────────────────────────
  const cache = new Map(); // key → { at, ttl, value } | { promise }
  async function cached(key, ttl, load) {
    const hit = cache.get(key);
    const now = Date.now();
    if (hit?.promise) return hit.promise;
    if (hit && now - hit.at < hit.ttl) return hit.value;
    const promise = (async () => {
      try {
        const value = await load();
        cache.set(key, { at: Date.now(), ttl, value });
        if (cache.size > MAX_CACHE_ENTRIES) {
          const cut = Date.now();
          for (const [k, v] of cache) if (!v.promise && cut - v.at >= v.ttl) cache.delete(k);
          // Immer noch zu voll: die ältesten Einträge (Einfügereihenfolge) gehen zuerst
          for (const k of cache.keys()) { if (cache.size <= MAX_CACHE_ENTRIES) break; cache.delete(k); }
        }
        return value;
      } catch (err) {
        cache.delete(key);
        throw err;
      }
    })();
    cache.set(key, { promise });
    return promise;
  }
  // Abgelaufenes regelmäßig wegräumen: ein Profil mit Kämpfen wiegt im Speicher einige hundert Kilobyte und gilt
  // nur eine Minute — ohne das Aufräumen blieben bis zu MAX_CACHE_ENTRIES davon liegen (mehrere hundert MB).
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of cache) if (!v.promise && now - v.at >= v.ttl) cache.delete(k);
  }, 2 * 60 * SEC);
  sweep.unref?.();

  // ── Obergrenze je Besucher ─────────────────────────────────────────────────
  const buckets = new Map();
  router.use((req, res, next) => {
    const ip = clientIp(req);
    const now = Date.now();
    const b = buckets.get(ip);
    if (!b || now - b.start > 60 * SEC) {
      buckets.set(ip, { start: now, count: 1 });
      if (buckets.size > 5000) for (const [k, v] of buckets) if (now - v.start > 60 * SEC) buckets.delete(k);
      return next();
    }
    if (++b.count > REQUESTS_PER_MINUTE) return res.status(429).json({ ok: false, key: 'rateLimited' });
    return next();
  });

  const handler = (fn) => (req, res) => {
    Promise.resolve(fn(req, res)).catch((err) => {
      if (err instanceof ScoutError) return res.status(err.status).json({ ok: false, key: err.key });
      console.error('[scout]', req.path, err);
      return res.status(500).json({ ok: false, key: 'apiDown' });
    });
  };

  const tagParam = (req) => {
    const tag = api.normalizeTag(req.params.tag);
    if (!tag) throw new ScoutError('invalidTag', 400);
    return tag;
  };

  const remember = (list) => {
    try { store.rememberPlayers(list); } catch (err) { console.warn('[scout] Namens-Index:', err?.message || err); }
  };

  /**
   * Ranked-Decks aus einem Battlelog merken — das des Spielers und die seiner Gegner. Steht für den Spieler selbst
   * kein Ranked-Kampf im Log, wird das als „geprüft, kein Deck" gemerkt, damit die Rangliste nicht erneut fragt.
   */
  const rememberDecks = (battles, selfTag) => {
    try {
      const decks = shape.rankedDecks(battles);
      if (selfTag && !decks.some((d) => d.tag === selfTag)) decks.push({ tag: selfTag, t: 0, cards: [] });
      store.rememberDecks(decks);
    } catch (err) { console.warn('[scout] Deck-Speicher:', err?.message || err); }
  };

  /** Kämpfe eines Spielers in seinen Verlauf schreiben (scoutStore: Kampf-Verlauf). */
  const keepBattles = (tag, battles) => {
    try { store.rememberBattles(tag, battles); } catch (err) { console.warn('[scout] Kampf-Verlauf:', err?.message || err); }
  };

  /**
   * Gemerktes Deck für eine Ranglisten-Zeile: { deck, deckTower, deckStale } — deck null = geprüft, keins;
   * undefined = unbekannt.
   */
  const knownDeck = (tag) => {
    let row = null;
    try { row = store.getDeck(tag); } catch { /* Speicher nicht verfügbar */ }
    if (!row) return {};
    // Decks, die gespeichert wurden, bevor der Speicher die Turmtruppe kannte, einmal neu holen — danach zählt die
    // normale Frist, auch wenn die Turmtruppe dann fehlt (towerChecked, siehe scoutStore.getDeck)
    const noTower = row.cards.length > 0 && !row.towerChecked;
    const stale = noTower || Date.now() - row.checkedAt > DECK_FRESH_MS;
    return { deck: row.cards.length ? row.cards : null, ...(row.tower ? { deckTower: row.tower } : null), ...(stale ? { deckStale: true } : null) };
  };

  // ── Spieler ────────────────────────────────────────────────────────────────
  async function loadPlayer(tag) {
    const [raw, rawLog] = await Promise.all([
      upstream(`/players/%23${tag}`),
      // Das Battlelog ist Beiwerk: fällt es aus, bleibt das Profil trotzdem sichtbar
      upstream(`/players/%23${tag}/battlelog`).catch(() => null),
    ]);
    if (!raw) throw new ScoutError('notFound', 404);
    let currentRank = null;
    try {
      currentRank = await api.resolvePolRank(tag, raw.currentPathOfLegendSeasonResult || null, token);
    } catch { /* ohne Platzierung weiter */ }
    const profile = shape.shapePlayer(raw, { currentRank });
    const live = shape.shapeBattles(rawLog, tag, profile.cap);
    if (Array.isArray(rawLog)) {
      rememberDecks(live, profile.tag);
      keepBattles(profile.tag, live);
    }
    // Aus dem Verlauf, was älter ist als das Battlelog: die ersten PROFILE_BATTLES Kämpfe gehen gleich mit, der Rest
    // lässt sich seitenweise nachladen (/player/:tag/battles)
    let older = [];
    let history = { n: live.length, oldest: live.length ? live[live.length - 1].t : null };
    try {
      const before = live.length ? live[live.length - 1].t : Number.MAX_SAFE_INTEGER;
      older = store.getBattles(profile.tag, { before, limit: Math.max(0, PROFILE_BATTLES - live.length) || 1 }).slice(0, Math.max(0, PROFILE_BATTLES - live.length));
      const stats = store.battleStats(profile.tag);
      history = { n: Math.max(stats.n, live.length), oldest: stats.oldest ?? history.oldest };
    } catch { /* Verlauf nicht verfügbar — dann nur das Battlelog */ }
    const battles = [...live, ...older];
    // Namen mit Kampfzeit merken — auch aus dem Verlauf, damit frühere Namen gleich sichtbar sind
    remember([{ tag: profile.tag, name: profile.name, trophies: profile.trophies, clan: profile.clan?.name || '' }, ...shape.battleNames(battles)]);
    let formerNames = [];
    try { formerNames = store.formerNames(profile.tag); } catch { /* Namensliste ist Beiwerk */ }
    return { ok: true, fetchedAt: Date.now(), battlesAvailable: Array.isArray(rawLog), profile: { ...profile, formerNames }, battles, history };
  }

  router.get('/player/:tag', handler(async (req, res) => {
    const tag = tagParam(req);
    try { store.markViewed(tag); } catch { /* Beobachtung ist Beiwerk */ }
    res.json(await cached(`player:${tag}`, TTL.player, () => loadPlayer(tag)));
  }));

  // ── Bewertungen: Daumen hoch/runter, eine Stimme je Twitch-Konto ─────────────
  // Lesen geht ohne Login (mine = 0); abstimmen nur angemeldet und nur für Spieler, die der Namens-Index kennt —
  // also deren Profil schon einmal hier aufgerufen oder in einem Kampf gesehen wurde.
  router.get('/player/:tag/votes', optionalAuth, handler(async (req, res) => {
    const tag = tagParam(req);
    res.json({ ok: true, ...store.voteSummary(tag, req.twitchId || null) });
  }));

  router.post('/player/:tag/vote', requireAuth, handler(async (req, res) => {
    const tag = tagParam(req);
    const value = Number(req.body?.value);
    if (![1, -1, 0].includes(value)) throw new ScoutError('invalidVote', 400);
    if (!store.getPlayer(tag)) throw new ScoutError('notFound', 404);
    store.setVote(tag, req.twitchId, value);
    res.json({ ok: true, ...store.voteSummary(tag, req.twitchId) });
  }));

  // Ältere Kämpfe aus dem Verlauf, seitenweise: ?vor=<Zeitpunkt in ms> (exklusiv). Kein API-Abruf.
  router.get('/player/:tag/battles', handler(async (req, res) => {
    const tag = tagParam(req);
    const before = Number(req.query.vor) > 0 ? Number(req.query.vor) : Number.MAX_SAFE_INTEGER;
    let battles = [];
    try { battles = store.getBattles(tag, { before, limit: HISTORY_PAGE + 1 }); } catch { /* Verlauf nicht verfügbar */ }
    res.json({ ok: true, battles: battles.slice(0, HISTORY_PAGE), more: battles.length > HISTORY_PAGE });
  }));

  // Muster in den Kämpfen (Reiter „Form“, lib/formPatterns.js) aus dem ganzen gespeicherten Verlauf. Kein API-Abruf —
  // das Profil hat die neuesten Kämpfe beim Öffnen schon gespeichert.
  // ?gruppe=ranked|ladder|… (Standard: alle außer Freundschafts- und Party-Kämpfen), ?tz= Zeitzone für die Tageszeit
  router.get('/player/:tag/form', handler(async (req, res) => {
    const tag = tagParam(req);
    const tz = validTimeZone(String(req.query.tz || '')) || 'Europe/Berlin';
    const group = /^[a-z0-9]{2,20}$/.test(String(req.query.gruppe || '')) ? String(req.query.gruppe) : 'all';
    res.json(await cached(`form:${tag}:${tz}:${group}`, 60 * SEC, async () => {
      let battles = [];
      try { battles = store.getBattles(tag, { limit: 200 }); } catch { /* Verlauf nicht verfügbar */ }
      const solo = battles.filter((b) => b.team?.length === 1 && b.opponent?.length === 1 && !CASUAL_GROUPS.has(b.group));
      const groups = [...solo.reduce((m, b) => m.set(b.group, (m.get(b.group) || 0) + 1), new Map())]
        .map(([g, n]) => ({ group: g, n })).sort((a, b) => b.n - a.n);
      const picked = group === 'all' ? solo : solo.filter((b) => b.group === group);
      const list = picked.map(fromScoutBattle).filter(Boolean);
      // types: eigene Bilanz gegen Deck-Typen neben der Quote von Decks wie dem aktuellen bei den Besten (scoutMatchups.js)
      let types = null;
      try { types = matchups.own(list); } catch { /* Auswertung nicht verfügbar */ }
      return { ok: true, fetchedAt: Date.now(), group, groups, patterns: formPatterns(list, { tz }), types };
    }));
  }));

  // ── Beobachtung angesehener Profile ────────────────────────────────────────
  // Wer in den letzten WATCH_DAYS Tagen angesehen wurde, dessen Battlelog holt der Server alle WATCH_EVERY_H Stunden
  // nach — so entsteht ein lückenloser Verlauf, solange sich jemand für das Profil interessiert (wie bei RoyaleAPI).
  async function pollWatched() {
    let due = [];
    try { due = store.dueWatched({ sinceMs: WATCH_DAYS * 24 * 3600 * SEC, everyMs: WATCH_EVERY_H * 3600 * SEC, limit: WATCH_BATCH }); } catch { return 0; }
    let done = 0;
    for (const tag of due) {
      const rawLog = await api.crApiGetSafe(`/players/%23${tag}/battlelog`, { token });
      try { store.markPolled(tag); } catch { /* weiter */ }
      if (!Array.isArray(rawLog)) continue;
      const battles = shape.shapeBattles(rawLog, tag, null);
      keepBattles(tag, battles);
      rememberDecks(battles, tag);
      done += 1;
      await new Promise((r) => { setTimeout(r, 300); });
    }
    return done;
  }
  router.pollWatched = pollWatched;

  // ── Clan ───────────────────────────────────────────────────────────────────
  async function loadClan(tag) {
    const raw = await upstream(`/clans/%23${tag}`);
    if (!raw) throw new ScoutError('notFound', 404);
    const clan = shape.shapeClan(raw);
    remember(clan.members.map((m) => ({ tag: m.tag, name: m.name, trophies: m.trophies, clan: clan.name })));
    return { ok: true, fetchedAt: Date.now(), clan };
  }

  router.get('/clan/:tag', handler(async (req, res) => {
    const tag = tagParam(req);
    const data = await cached(`clan:${tag}`, TTL.clan, () => loadClan(tag));
    // Erst nach erfolgreichem Abruf vormerken — ein Tippfehler-Tag soll den Clan-Sammler nicht beschäftigen
    try { store.markClanViewed(tag); } catch { /* Verlauf ist Beiwerk */ }
    res.json(data);
  }));

  // ── Clan-Schnappschüsse ────────────────────────────────────────────────────
  // Wer in den letzten CLAN_TRACK_DAYS Tagen angesehen wurde, dessen Mitglieder und laufenden Clankrieg hält der Server
  // alle CLAN_EVERY_H Stunden fest (scoutStore: clan_snaps). Daraus entstehen später Verläufe je Mitglied.
  async function pollClans() {
    let due = [];
    try { due = store.dueClans({ sinceMs: CLAN_TRACK_DAYS * 24 * 3600 * SEC, everyMs: CLAN_EVERY_H * 3600 * SEC, limit: CLAN_BATCH, max: CLAN_MAX }); } catch { return 0; }
    let done = 0;
    for (const tag of due) {
      const raw = await api.crApiGetSafe(`/clans/%23${tag}`, { token });
      const rawRace = raw ? await api.crApiGetSafe(`/clans/%23${tag}/currentriverrace`, { token }) : null;
      try { store.markClanPolled(tag); } catch { /* weiter */ }
      if (!raw) continue;
      try {
        const clan = shape.shapeClan(raw);
        store.rememberClanSnapshot(tag, history.packClanSnapshot(clan, shape.shapeRiverRace(rawRace)));
        remember(clan.members.map((m) => ({ tag: m.tag, name: m.name, trophies: m.trophies, clan: clan.name })));
        done += 1;
      } catch (err) { console.warn('[scout] Clan-Schnappschuss:', err?.message || err); }
      await new Promise((r) => { setTimeout(r, 300); });
    }
    return done;
  }
  router.pollClans = pollClans;

  // Clankrieg getrennt vom Clan: zwei weitere Abrufe, die nur der Reiter „Clankrieg" braucht
  router.get('/clan/:tag/war', handler(async (req, res) => {
    const tag = tagParam(req);
    const [race, log] = await Promise.all([
      cached(`race:${tag}`, TTL.race, async () => shape.shapeRiverRace(await upstream(`/clans/%23${tag}/currentriverrace`))).catch(() => null),
      cached(`warlog:${tag}`, TTL.warLog, async () => shape.shapeWarLog(await upstream(`/clans/%23${tag}/riverracelog?limit=10`), tag)).catch(() => []),
    ]);
    res.json({ ok: true, fetchedAt: Date.now(), race, log });
  }));

  // ── Suche ──────────────────────────────────────────────────────────────────
  // Spieler aus dem eigenen Namens-Index (die API kann Spieler nicht nach Namen suchen), Clans über die API.
  router.get('/search', handler(async (req, res) => {
    const q = String(req.query.q || '').trim().slice(0, 40);
    if (q.length < 2) return res.json({ ok: true, players: [], clans: [] });
    let players = [];
    try { players = store.searchPlayers(q, 8); } catch { /* Index nicht verfügbar */ }
    let clans = [];
    if (q.length >= 3 && req.query.clans !== '0') {
      clans = await cached(`clansearch:${q.toLowerCase()}`, TTL.clanSearch, async () =>
        shape.shapeClanSearch(await upstream(`/clans?name=${encodeURIComponent(q)}&limit=8`))).catch(() => []);
    }
    return res.json({ ok: true, players, clans });
  }));

  // ── Ranglisten ─────────────────────────────────────────────────────────────
  const RANKINGS = {
    players: { path: (loc, limit) => `/locations/${loc}/pathoflegend/players?limit=${limit}`, shape: shape.shapePlayerRanking },
    clans: { path: (loc, limit) => `/locations/${loc}/rankings/clans?limit=${limit}`, shape: shape.shapeClanRanking },
    wars: { path: (loc, limit) => `/locations/${loc}/rankings/clanwars?limit=${limit}`, shape: shape.shapeClanRanking },
  };

  async function loadRanking(kind, loc, limit) {
    const def = RANKINGS[kind];
    const items = def.shape(await upstream(def.path(loc, limit)));
    if (kind === 'players') {
      remember(items.map((p) => ({ tag: p.tag, name: p.name, clan: p.clan?.name || '' })));
      // Die API liefert in Ranglisten keine Decks — angehängt wird, was aus Battlelogs schon bekannt ist
      for (const p of items) Object.assign(p, knownDeck(p.tag));
    }
    return { ok: true, fetchedAt: Date.now(), kind, location: loc, items };
  }

  router.get('/ranking/:kind', handler(async (req, res) => {
    const kind = RANKINGS[req.params.kind] ? req.params.kind : null;
    if (!kind) throw new ScoutError('notFound', 404);
    const loc = /^5700\d{4}$/.test(String(req.query.loc || '')) ? String(req.query.loc) : 'global';
    const limit = req.query.top === '1000' && kind === 'players' && loc === 'global' ? 1000 : 200;
    res.json(await cached(`ranking:${kind}:${loc}:${limit}`, TTL.ranking, () => loadRanking(kind, loc, limit)));
  }));

  // Decks nachladen für Ranglisten-Zeilen, zu denen noch keins bekannt (oder das bekannte alt) ist: je Tag ein
  // Battlelog-Abruf, das Ergebnis wird gemerkt. Antwort: { decks: { TAG: Karten | null }, towers: { TAG: Turmtruppe } }
  // — fehlt ein Tag in decks, schlug sein Abruf fehl.
  router.get('/decks', handler(async (req, res) => {
    const tags = [...new Set(String(req.query.tags || '').split(',').map((t) => api.normalizeTag(t)).filter(Boolean))].slice(0, DECK_BATCH);
    const decks = {};
    const towers = {};
    await Promise.all(tags.map(async (tag) => {
      const known = knownDeck(tag);
      if (known.deck !== undefined && !known.deckStale) {
        decks[tag] = known.deck;
        if (known.deckTower) towers[tag] = known.deckTower;
        return;
      }
      try {
        const rawLog = await cached(`decklog:${tag}`, TTL.player, () => upstream(`/players/%23${tag}/battlelog`));
        if (!Array.isArray(rawLog)) return;
        const battles = shape.shapeBattles(rawLog, tag, null);
        rememberDecks(battles, tag);
        keepBattles(tag, battles);
        const now = knownDeck(tag);
        decks[tag] = now.deck ?? null;
        if (now.deckTower) towers[tag] = now.deckTower;
      } catch { /* dieser Tag bleibt offen, die anderen zählen trotzdem */ }
    }));
    res.json({ ok: true, decks, towers });
  }));

  router.get('/locations', handler(async (req, res) => {
    res.json(await cached('locations', TTL.locations, async () => {
      const raw = await upstream('/locations?limit=400');
      const items = (Array.isArray(raw?.items) ? raw.items : [])
        .filter((l) => l?.isCountry === true && l.countryCode)
        .map((l) => ({ id: l.id, name: String(l.name || ''), code: String(l.countryCode) }))
        .sort((a, b) => a.name.localeCompare(b.name));
      return { ok: true, items };
    }));
  }));

  // Kartenkatalog des Spiels: alle Karten mit ihren Formen und Bildern, dazu die Turmtruppen. Neue Karten,
  // Evolutionen und Helden erscheinen so von selbst auf den Stats-Seiten.
  router.get('/catalog', handler(async (req, res) => {
    res.json(await cached('catalog', TTL.catalog, async () => ({ ok: true, fetchedAt: Date.now(), ...shape.shapeCatalog(await upstream('/cards')) })));
  }));

  // ── Meta ───────────────────────────────────────────────────────────────────
  // Der Sammler füttert nebenbei den Namens-Index (die ganze Top 1000 samt ihrer Gegner) und den Deck-Speicher
  // der Ranglisten — beides ohne einen zusätzlichen Abruf.
  const crawler = createMetaCrawler({
    store,
    players: Number(process.env.CR_SCOUT_META_PLAYERS) || 1000,
    ...(crawlSpacingMs === undefined ? null : { spacingMs: crawlSpacingMs }),
    fetchTopPlayers: async () => {
      const raw = await api.crApiGetSafe('/locations/global/pathoflegend/players?limit=1000', { token });
      const top = shape.shapePlayerRanking(raw);
      remember(top.map((p) => ({ tag: p.tag, name: p.name, clan: p.clan?.name || '' })));
      return top;
    },
    fetchBattles: async (tag) => {
      const rawLog = await api.crApiGetSafe(`/players/%23${tag}/battlelog`, { token });
      if (!Array.isArray(rawLog)) return null;
      const battles = shape.shapeBattles(rawLog, tag, null);
      rememberDecks(battles, tag);
      keepBattles(tag, battles);
      remember(shape.battleNames(battles));
      return battles;
    },
    // Jeder Ranked-Kampf der Top-Spieler wandert zusätzlich in den Matchup-Verlauf (45 Tage statt eines Laufs)
    onBattles: (battles, place) => { store.rememberMatchups(battles, place); },
  });
  // Matchup-Ratgeber: wertet den 45-Tage-Verlauf aus, nach jeder Meta-Sammlung neu. Eigene Zahlen bekommen die Decks
  // der aktuellen Meta-Auswertung, alle anderen laufen über ihren Deck-Typ.
  const matchups = createMatchupWorker({
    store,
    deckKeys: () => (crawler.current()?.decks || []).map((d) => d.key).filter(Boolean),
    metaUpdatedAt: () => crawler.current()?.updatedAt || 0,
  });
  router.matchups = matchups;
  // Namens-Index in der Breite: einmal am Tag alle Länder-Ranglisten und die Mitglieder der Top-Clans je Land
  // (scoutIndexFeed.js). Nutzt die gedrosselten Hintergrund-Abrufe wie der Meta-Sammler.
  const getSafe = (path) => api.crApiGetSafe(path, { token });
  const indexFeeder = createIndexFeeder({
    store,
    remember,
    ...(crawlSpacingMs === undefined ? null : { spacingMs: crawlSpacingMs }),
    fetchLocations: async () => {
      const raw = await getSafe('/locations?limit=400');
      return (Array.isArray(raw?.items) ? raw.items : []).filter((l) => l?.isCountry === true).map((l) => ({ id: l.id }));
    },
    fetchPlayers: async (loc) => {
      const raw = await getSafe(`/locations/${loc}/pathoflegend/players?limit=200`);
      return raw ? shape.shapePlayerRanking(raw) : null;
    },
    fetchClans: async (loc) => {
      const raw = await getSafe(`/locations/${loc}/rankings/clans?limit=10`);
      return raw ? shape.shapeClanRanking(raw) : null;
    },
    fetchClan: async (tag) => {
      const raw = await getSafe(`/clans/%23${tag}`);
      return raw && !raw.notFound ? shape.shapeClan(raw) : null;
    },
  });
  router.indexFeeder = indexFeeder;

  if (meta && api.isConfigured(token) && process.env.CR_SCOUT_META !== 'off') {
    crawler.start();
    if (process.env.CR_SCOUT_MATCHUPS !== 'off') matchups.start();
    if (process.env.CR_SCOUT_INDEX_FEED !== 'off') indexFeeder.start();
    const watcher = setInterval(() => { pollWatched().catch(() => {}); }, 10 * 60 * SEC);
    watcher.unref?.();
    if (process.env.CR_SCOUT_CLAN_SNAPS !== 'off') {
      const clanWatcher = setInterval(() => { pollClans().catch(() => {}); }, 10 * 60 * SEC);
      clanWatcher.unref?.();
    }
  }

  // Crown Series: Duell-Decks, Sets der Bestplatzierten und zusammengestellte Sets (scoutCrown.js). Namen der
  // Spieler kommen aus dem Namens-Index.
  router.get('/crown', handler(async (req, res) => {
    let crown = null;
    try { crown = crawler.crown(); } catch { /* Speicher nicht verfügbar */ }
    if (crown) {
      crown = {
        ...crown,
        sets: crown.sets.map((s) => {
          let known = null;
          try { known = store.getPlayer(s.player.tag); } catch { /* Index nicht verfügbar */ }
          return { ...s, player: { ...s.player, name: s.player.name || known?.name || '', clan: known?.clan || '' } };
        }),
      };
    }
    res.json({ ok: true, crown });
  }));

  // ?top=100|250|500: nur aus den Kämpfen dieser Spieler (sonst die ganze gesammelte Rangliste). tier zeigt, was gilt.
  router.get('/meta', handler(async (req, res) => {
    const n = Number(req.query.top);
    const tier = crawler.TIERS?.includes(n) ? n : null;
    let snapshot = null;
    try { snapshot = tier ? crawler.currentTier(tier) : crawler.current(); } catch { /* Speicher nicht verfügbar */ }
    res.json({ ok: true, tier, meta: snapshot });
  }));

  // Ein Deck der aktuellen Auswertung: Bilanz gegen die häufigsten Gegner-Decks und -Karten, und wer es spielt.
  // ?karten= die acht Karten-IDs (Reihenfolge egal). deck ist null, wenn es in der Auswertung nicht (mehr) vorkommt.
  router.get('/deck', handler(async (req, res) => {
    const key = String(req.query.karten || '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 8).sort().join(',');
    let snapshot = null;
    let details = null;
    try {
      snapshot = crawler.current();
      details = crawler.deckDetails(key);
    } catch { /* Speicher nicht verfügbar */ }
    const deck = snapshot?.decks?.find((d) => d.key === key) || null;
    // 45 Tage Verlauf: eigene Zahlen für Meta-Decks mit genug Kämpfen, sonst die des Deck-Typs — auch für Decks,
    // die in der aktuellen Auswertung fehlen (scoutMatchups.js)
    let mu = null;
    if (key.split(',').length === 8) {
      try { mu = matchups.deck(key, key.split(',')); } catch { /* Auswertung nicht verfügbar */ }
    }
    const players = (details?.players || []).map((tag) => {
      let known = null;
      try { known = store.getPlayer(tag); } catch { /* Index nicht verfügbar */ }
      // Platz in der Rangliste zum Zeitpunkt der Auswertung (ältere gespeicherte Auswertungen haben noch keinen)
      const rank = details?.ranks?.[tag];
      return { tag, name: known?.name || '', clan: known?.clan || '', rank: typeof rank === 'number' ? rank : null };
    });
    res.json({
      ok: true,
      updatedAt: snapshot?.updatedAt || null,
      sample: snapshot ? { battles: snapshot.battles, players: snapshot.players } : null,
      deck,
      vsDecks: deck ? details?.vsDecks || [] : [],
      hard: deck ? details?.hard || [] : [],
      easy: deck ? details?.easy || [] : [],
      players: deck ? players : [],
      matchups: mu,
    });
  }));

  // Karte gegen Karte (45 Tage) und — ist die Karte eine Siegbedingung — ihr Deck-Typ gegen die anderen Typen.
  // matchups ist null, solange es für die Karte keine Zahlen gibt.
  router.get('/matchups/card/:id', handler(async (req, res) => {
    const id = /^[a-z0-9-]{2,40}$/.test(req.params.id) ? req.params.id : null;
    if (!id) throw new ScoutError('notFound', 404);
    let card = null;
    try { card = matchups.card(id); } catch { /* Auswertung nicht verfügbar */ }
    res.json({ ok: true, matchups: card });
  }));

  router.get('/status', (req, res) => {
    res.json({ ok: true, configured: api.isConfigured(token) });
  });

  router.crawler = crawler;
  return router;
}

module.exports = { createScoutRouter };
