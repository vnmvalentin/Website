// scoutRoutes.js — /api/clash/scout: Daten der Stats-Seiten unter /clash (Spieler, Clans, Ranglisten, Meta).
// Öffentlich, ohne Login. Frontend: pages/ClashRoyale/scout/.
//
// Schutz der offiziellen API (ein Schlüssel für alle Besucher):
//   • Zwischenspeicher je Adresse mit kurzer Haltbarkeit; gleichzeitige gleiche Anfragen teilen sich einen Abruf
//   • höchstens einige Abrufe gleichzeitig, der Rest wartet in einer begrenzten Schlange
//   • Obergrenze je Besucher-Adresse und Minute
//   • Schutz vor Scrapern (Nov. 2026, nach RoyaleAPIs Klage über KI-Skripte): Skript-Kennungen werden abgewiesen, neue
//     Abrufe für Spieler/Clans kosten Kontingent je Adresse, /decks lädt nur für Ranglisten-Spieler nach
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
const clanCentral = require('./clanCentral');
const clanAlerts = require('./clanAlerts');
const { createBremse } = require('../../lib/bremse');
const { istLokal } = require('../../lib/clientIp');
const { lastWaechter } = require('../../lib/lastWaechter');

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
// Kontingent je Besucher-Adresse für Abrufe, die neu bei der API landen (nicht im Zwischenspeicher): Spieler, Clan,
// Clankrieg, Clan-Zentrale, Clan-Suche. Ein Mensch öffnet kaum mehr als ein paar Dutzend fremde Profile in zehn
// Minuten; ein Skript, das Tags durchprobiert, steht danach still, statt Schlüssel und Speicher zu belasten. Was schon im
// Zwischenspeicher liegt, kostet nichts.
const LOOKUP_LIMITS = [{ fensterMs: 10 * 60 * SEC, max: 100 }, { fensterMs: 24 * 3600 * SEC, max: 1000 }];
// Decks für Ranglisten-Zeilen: eine Länder-Rangliste mit Kartenfilter fragt bis zu 200 auf einmal nach
const DECK_LIMITS = [{ fensterMs: 10 * 60 * SEC, max: 1000 }, { fensterMs: 24 * 3600 * SEC, max: 6000 }];
// Angemeldet mit Twitch oder Discord: eigenes Kontingent je Konto statt je Adresse, dreimal so groß — so stört auch eine
// geteilte Adresse (Haushalt, Schule, Mobilfunk) nicht. Gastkonten kann jedes Skript anlegen, sie zählen wie Besucher.
const ACCOUNT_LOOKUP_LIMITS = [{ fensterMs: 10 * 60 * SEC, max: 300 }, { fensterMs: 24 * 3600 * SEC, max: 3000 }];
const ACCOUNT_DECK_LIMITS = [{ fensterMs: 10 * 60 * SEC, max: 3000 }, { fensterMs: 24 * 3600 * SEC, max: 18000 }];
// Alle Besucher OHNE Konto zusammen: verteilte Crawler kommen aus Tausenden Adressen und bleiben je Adresse unter jeder
// Grenze. Ist dieses gemeinsame Kontingent neuer Abrufe aufgebraucht, warten Besucher ohne Konto („anmelden gibt mehr
// Spielraum“); Konten mit Twitch oder Discord, der Zwischenspeicher und die eigenen Sammler laufen unberührt weiter.
const GLOBAL_ANON_LIMITS = [{ fensterMs: 10 * 60 * SEC, max: 2500 }];
// /decks lädt nur für Spieler nach, die in dieser Zeit in einer abgerufenen Rangliste standen (oder schon ein Deck haben)
const RANKED_TAG_KEEP_MS = 6 * 3600 * SEC;
// Skripte statt Browser: Kennungen gängiger HTTP-Bibliotheken und ferngesteuerter Browser, dazu eine leere Kennung.
// Wer Daten in Mengen braucht, soll die offizielle API mit eigenem Schlüssel nutzen. Suchmaschinen melden sich mit
// eigener Kennung („Mozilla/5.0 (compatible; Googlebot …“) und kommen durch — ihr Rendern der vorgerenderten Seiten
// braucht diese Daten. Eigene Werkzeuge melden sich mit „vnmvalentin-…“ (Frontend/prerender.js).
const SCRIPT_UA = /^(?:curl|wget|python|aiohttp|httpx|scrapy|go-http-client|axios|node-fetch|undici|node|okhttp|java|apache-httpclient|libwww-perl|lwp|postmanruntime|insomnia|ruby|php|guzzlehttp|dart|reqwest|rest-client|colly|deno|bun)\b|headlesschrome|phantomjs|selenium|playwright|puppeteer/i;
const OWN_TOOL_UA = /^vnmvalentin-/i;
// Ranked-Decks für die Ranglisten: so lange gilt ein gemerktes Deck als aktuell, so viele Tags je Nachlade-Anfrage
const DECK_FRESH_MS = 24 * 60 * 60 * SEC;
// Steht der Spieler in der Rangliste mit einem anderen Medaillenstand als bei der letzten Prüfung, hat er seither
// gespielt — dann gilt sein Deck schon nach dieser Zeit als veraltet. So folgt die Rangliste dem Profil, ohne für
// Spieler nachzufragen, die gar nicht gespielt haben.
const DECK_RECHECK_MS = 15 * 60 * SEC;
// So alt darf eine Antwort aus dem gemeinsamen Abruf-Speicher sein (lib/crApi.js) — z. B. vom Win-Tracker geholt
const SHARE_MAX_AGE_MS = 30 * SEC;
// Ranglisten, Länderliste und Kartenkatalog: nach Ablauf geht noch so lange der alte Stand sofort raus, während im
// Hintergrund neu geholt wird — die Seite wartet dann nicht auf die API
const STALE_OK_MS = 30 * 60 * SEC;
// Decks an Ranglisten-Zeilen: so lange gilt die fertig bestückte Liste
const RANKING_DECKS_MS = 10 * SEC;
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
  /** @param {object} [extra] weitere Felder für die Antwort (z. B. retryAt beim Kontingent) */
  constructor(key, status, extra = null) {
    super(key);
    this.key = key;
    this.status = status;
    this.extra = extra;
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
 * @param {Function} [deps.requireKonto]  jedes Konto (Twitch, Discord, Gast) — Discord-Erinnerungen der Clan-Zentrale
 * @param {(kontoId: string) => boolean} [deps.kontoGibtEs]  Erinnerungen gelöschter Konten werden entfernt
 * @param {object} [deps.alertStore]  Ersatz für den Speicher der Erinnerungen (clanAlerts.createClanAlertStore)
 * @param {Function} [deps.webhookFetch]  Ersatz für fetch bei Discord-Webhooks (Tests)
 * @param {{lookups?: object[], decks?: object[], accountLookups?: object[], accountDecks?: object[]}} [deps.limits]
 *   Ersatz für LOOKUP_LIMITS/DECK_LIMITS/ACCOUNT_LOOKUP_LIMITS/ACCOUNT_DECK_LIMITS (Tests)
 * @param {(req: object) => string|null} [deps.kontoFuerKontingent]  Konto-ID, wenn die Anfrage von einem Konto mit Twitch
 *   oder Discord kommt (dann zählt das Kontingent je Konto), sonst null
 * @param {{ueberlastet: () => boolean}} [deps.last]  Ersatz für den Überlast-Wächter (lib/lastWaechter.js, Tests);
 *   limits.global ersetzt GLOBAL_ANON_LIMITS
 */
// Ohne mitgegebene Anmeldung (Tests) gilt jeder als Gast; abstimmen ist dann nicht möglich.
const guestAuth = (req, res, next) => next();
const noAuth = (req, res) => res.status(401).json({ ok: false, key: 'loginRequired' });

function createScoutRouter({
  api = crApi, store = defaultStore, meta = true, crawlSpacingMs, requireAuth = noAuth, optionalAuth = guestAuth,
  requireKonto = noAuth, kontoGibtEs = null, alertStore = null, webhookFetch = undefined, limits = {},
  kontoFuerKontingent = () => null, last = null,
} = {}) {
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
  /** @param {number} [maxAgeMs] eine höchstens so alte Antwort aus dem gemeinsamen Abruf-Speicher reicht */
  async function upstream(path, maxAgeMs = 0) {
    if (!api.isConfigured(token)) throw new ScoutError('apiNotConfigured', 503);
    await acquire();
    try {
      const data = await api.crApiGet(path, { token, maxAgeMs });
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
  /** @param {number} [staleMs] so lange nach Ablauf geht der alte Wert sofort raus, während im Hintergrund neu geladen wird */
  async function cached(key, ttl, load, staleMs = 0) {
    const hit = cache.get(key);
    const now = Date.now();
    if (hit?.promise) return hit.stale === undefined ? hit.promise : hit.stale;
    if (hit && now - hit.at < hit.ttl) return hit.value;
    const stale = hit && staleMs > 0 && now - hit.at < hit.ttl + staleMs ? hit : null;
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
        // Mit altem Wert in der Hand: ihn behalten (bis er endgültig abläuft), statt die Seite leer zu lassen
        if (stale) cache.set(key, stale); else cache.delete(key);
        throw err;
      }
    })();
    if (stale) {
      promise.catch(() => {});
      cache.set(key, { promise, stale: stale.value });
      return stale.value;
    }
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

  // ── Skripte abweisen ───────────────────────────────────────────────────────
  // Dienste auf demselben Rechner (Prüfstände, Werkzeuge ohne nginx) sind ausgenommen.
  router.use((req, res, next) => {
    if (istLokal(req)) return next();
    const ua = String(req.headers['user-agent'] || '').trim();
    if (OWN_TOOL_UA.test(ua) || (ua && !SCRIPT_UA.test(ua))) return next();
    return res.status(403).json({
      ok: false, key: 'scriptBlocked',
      hint: 'Automated access is not allowed. For bulk data use the official API: https://developer.clashroyale.com',
    });
  });

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

  // ── Kontingent neuer Abrufe je Besucher ────────────────────────────────────
  // long = Tagesfenster: dafür gibt es eine eigene Meldung, „kurz warten“ wäre dort gelogen
  const makeLimits = (defs) => defs.map((d) => ({ long: d.fensterMs > 3600 * SEC, bremse: createBremse(d) }));
  const budgets = {
    lookups: { ip: makeLimits(limits.lookups || LOOKUP_LIMITS), konto: makeLimits(limits.accountLookups || ACCOUNT_LOOKUP_LIMITS) },
    decks: { ip: makeLimits(limits.decks || DECK_LIMITS), konto: makeLimits(limits.accountDecks || ACCOUNT_DECK_LIMITS) },
  };
  const globalAnon = makeLimits(limits.global || GLOBAL_ANON_LIMITS);
  // Stau in der Ereignisschleife (lib/lastWaechter.js): teure Anfragen ohne Konto bekommen dann sofort „busy“
  const waechter = last || lastWaechter();
  const kontoVon = (req) => {
    try { return kontoFuerKontingent(req) || null; } catch { return null; }
  };
  /** Für Routen mit Datenbank- oder API-Arbeit: bei Überlast Besucher ohne Konto sofort abweisen (503 busy). */
  const shedIfBusy = (req) => {
    if (!waechter.ueberlastet() || istLokal(req) || kontoVon(req)) return;
    throw new ScoutError('busy', 503, { retryAt: Date.now() + 5 * SEC });
  };
  /**
   * Zählt einen neuen API-Abruf gegen alle Zeitfenster — je Konto (Twitch/Discord), sonst je Adresse. null = darf durch;
   * sonst das volle Fenster { long, retryAt, konto } (die folgenden Fenster zählen dann nicht mit).
   */
  const spend = (kind, req) => {
    if (istLokal(req)) return null;
    const konto = kontoVon(req);
    const key = konto ? `konto:${konto}` : clientIp(req);
    for (const l of budgets[kind][konto ? 'konto' : 'ip']) {
      const waitMs = l.bremse.treffer(key);
      if (waitMs) return { long: l.long, retryAt: Date.now() + waitMs, konto: Boolean(konto) };
    }
    // Einzelne Profile, Clans und die Clan-Suche: zusätzlich das gemeinsame Kontingent aller Besucher ohne Konto
    if (!konto && kind === 'lookups') {
      for (const l of globalAnon) {
        const waitMs = l.bremse.treffer('alle');
        if (waitMs) return { long: l.long, retryAt: Date.now() + waitMs, konto: false };
      }
    }
    return null;
  };
  /** Liegt der Eintrag frisch im Zwischenspeicher (oder wird gerade geholt)? Dann kostet die Anfrage keinen Abruf. */
  const isFresh = (key) => {
    const hit = cache.get(key);
    return !!hit && (!!hit.promise || Date.now() - hit.at < hit.ttl);
  };
  /** Wirft rateLimited, wenn für einen der Einträge ein neuer Abruf nötig ist und die Adresse ihr Kontingent aufgebraucht hat. */
  const chargeLookup = (req, ...keys) => {
    if (keys.every(isFresh)) return;
    shedIfBusy(req);
    const full = spend('lookups', req);
    if (!full) return;
    // Wann es weitergeht und ob eine Anmeldung mehr Spielraum gäbe — der Client zeigt beides (scout/scoutApi.js)
    throw new ScoutError(full.long ? 'dailyLimit' : 'rateLimited', 429, { retryAt: full.retryAt, ...(full.konto ? null : { login: true }) });
  };

  // Spieler aus abgerufenen Ranglisten (Tag → Zeitpunkt): nur für sie lädt /decks unbekannte Decks nach
  // — dazu ihr Medaillenstand dort: an ihm lässt sich ablesen, ob sie seit der letzten Deck-Prüfung gespielt haben
  const rankedTags = new Map(); // Tag → { at, score }
  const noteRanked = (items) => {
    const now = Date.now();
    for (const p of items) if (p?.tag) rankedTags.set(p.tag, { at: now, score: Number.isFinite(p.score) && p.score > 0 ? p.score : null });
    if (rankedTags.size > 100_000) for (const [t, e] of rankedTags) if (now - e.at >= RANKED_TAG_KEEP_MS) rankedTags.delete(t);
  };
  const isRankedTag = (tag) => Date.now() - (rankedTags.get(tag)?.at || 0) < RANKED_TAG_KEEP_MS;
  const rankedScore = (tag) => (isRankedTag(tag) ? rankedTags.get(tag).score : null);

  const handler = (fn) => (req, res) => {
    Promise.resolve(fn(req, res)).catch((err) => {
      if (err instanceof ScoutError) {
        if (err.extra?.retryAt) res.set('Retry-After', String(Math.max(1, Math.ceil((err.extra.retryAt - Date.now()) / SEC))));
        return res.status(err.status).json({ ok: false, key: err.key, ...err.extra });
      }
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

  // ── Event-Titel (GET /events) ──────────────────────────────────────────────
  // Welche Challenge ein Kampf war (Classic, Grand, 20 Win …) und wie ein Event im Spiel heißt, verrät nur sein
  // eventTag → Titel aus /events. Die Liste kennt bloß laufende Events; gemerkt (kv „eventTitles") bleiben die Titel
  // EVENT_KEEP_MS lang, damit Kämpfe eines gerade beendeten Events im Battlelog ihren Namen behalten.
  const EVENTS_EVERY_MS = 15 * 60 * SEC;
  const EVENT_KEEP_MS = 60 * 24 * 3600 * SEC;
  let eventTitles = {}; // eventTag → { title, seen }
  try {
    const saved = store.getValue('eventTitles')?.value;
    if (saved && typeof saved === 'object') eventTitles = saved;
  } catch { /* ohne gemerkte Titel weiter */ }
  let eventList = Object.entries(eventTitles).map(([eventTag, e]) => ({ eventTag, title: String(e?.title || '') }));
  let eventsAt = 0;
  let eventsLoading = null;
  /** Laufende Events höchstens alle EVENTS_EVERY_MS abfragen und zu den gemerkten Titeln legen. Wirft nie. */
  async function refreshEvents() {
    if (Date.now() - eventsAt < EVENTS_EVERY_MS || typeof api.fetchEvents !== 'function') return;
    if (!eventsLoading) {
      eventsLoading = (async () => {
        try {
          const live = await api.fetchEvents(token);
          if (!Array.isArray(live) || !live.length) return;
          const now = Date.now();
          const next = {};
          for (const [tag, e] of Object.entries(eventTitles)) if (now - (Number(e?.seen) || 0) < EVENT_KEEP_MS) next[tag] = e;
          for (const e of live) if (e?.eventTag && e.title) next[e.eventTag] = { title: String(e.title).slice(0, 80), seen: now };
          eventTitles = next;
          eventList = Object.entries(next).map(([eventTag, e]) => ({ eventTag, title: e.title }));
          store.setValue('eventTitles', next);
        } catch (err) {
          console.warn('[scout] Event-Titel:', err?.message || err);
        } finally {
          eventsAt = Date.now();
          eventsLoading = null;
        }
      })();
    }
    await eventsLoading;
  }
  /** Rohes Battlelog aufbereiten, mit den bekannten Event-Titeln (scoutShape.shapeBattles). */
  async function shapeLog(rawLog, tag, cap) {
    await refreshEvents();
    return shape.shapeBattles(rawLog, tag, cap, eventList);
  }

  /**
   * Ranked-Decks aus einem Battlelog merken — das des Spielers und die seiner Gegner. Steht für den Spieler selbst
   * kein Ranked-Kampf im Log, wird das als „geprüft, kein Deck" gemerkt, damit die Rangliste nicht erneut fragt.
   * @param {number|null} [score] Medaillenstand des Spielers jetzt (Rangliste oder Profil), falls bekannt
   */
  const rememberDecks = (battles, selfTag, score = null) => {
    try {
      const decks = shape.rankedDecks(battles);
      if (selfTag && !decks.some((d) => d.tag === selfTag)) decks.push({ tag: selfTag, t: 0, cards: [] });
      // Nur für den Spieler selbst ist das Log vollständig — sein Medaillenstand gehört zu dieser Prüfung
      if (selfTag && Number.isFinite(score) && score > 0) for (const d of decks) if (d.tag === selfTag) d.score = score;
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
   * @param {number|null} [score] Medaillenstand des Spielers in der Rangliste (Standard: aus der zuletzt geladenen)
   */
  const knownDeck = (tag, score = rankedScore(tag)) => {
    let row = null;
    try { row = store.getDeck(tag); } catch { /* Speicher nicht verfügbar */ }
    if (!row) return {};
    // Decks, die gespeichert wurden, bevor der Speicher die Turmtruppe kannte, einmal neu holen — danach zählt die
    // normale Frist, auch wenn die Turmtruppe dann fehlt (towerChecked, siehe scoutStore.getDeck)
    const noTower = row.cards.length > 0 && !row.towerChecked;
    const age = Date.now() - row.checkedAt;
    // Anderer Medaillenstand als bei der Prüfung = seither gespielt, das Deck kann gewechselt haben
    const played = Number.isFinite(score) && score > 0 && Number.isFinite(row.score) && score !== row.score;
    const stale = noTower || age > DECK_FRESH_MS || (played && age > DECK_RECHECK_MS);
    return { deck: row.cards.length ? row.cards : null, ...(row.tower ? { deckTower: row.tower } : null), ...(stale ? { deckStale: true } : null) };
  };

  // ── Spieler ────────────────────────────────────────────────────────────────
  async function loadPlayer(tag) {
    // Rangliste (für die Platzierung) und Event-Titel gleich mit anstoßen: beide sind zwischengespeichert; läuft eins
    // davon gerade ab, wartet das Profil so nur auf den längsten Abruf statt auf alle nacheinander
    if (typeof api.fetchPolTopRanks === 'function') Promise.resolve(api.fetchPolTopRanks(token)).catch(() => null);
    refreshEvents();
    const [raw, rawLog] = await Promise.all([
      upstream(`/players/%23${tag}`, SHARE_MAX_AGE_MS),
      // Das Battlelog ist Beiwerk: fällt es aus, bleibt das Profil trotzdem sichtbar
      upstream(`/players/%23${tag}/battlelog`, SHARE_MAX_AGE_MS).catch(() => null),
    ]);
    if (!raw) throw new ScoutError('notFound', 404);
    let currentRank = null;
    try {
      currentRank = await api.resolvePolRank(tag, raw.currentPathOfLegendSeasonResult || null, token);
    } catch { /* ohne Platzierung weiter */ }
    const profile = shape.shapePlayer(raw, { currentRank });
    const live = await shapeLog(rawLog, tag, profile.cap);
    if (Array.isArray(rawLog)) {
      // Medaillen der laufenden Saison = der Wert, mit dem der Spieler in der Rangliste steht
      rememberDecks(live, profile.tag, raw.currentPathOfLegendSeasonResult?.trophies ?? null);
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
    // Die letzten Crown-Series-Duelle bleiben eigens gemerkt: das Duell-Set steht im Profil, auch wenn sie längst aus
    // Battlelog und Verlauf gerutscht sind (verkleinert: nur Runden-Decks und Rundenergebnis)
    let crownBattles = [];
    try { crownBattles = store.getCrownBattles(profile.tag); } catch { /* Speicher nicht verfügbar */ }
    return {
      ok: true, fetchedAt: Date.now(), battlesAvailable: Array.isArray(rawLog), profile: { ...profile, formerNames }, battles: shape.nameModes(battles),
      crownBattles, history,
    };
  }

  router.get('/player/:tag', handler(async (req, res) => {
    const tag = tagParam(req);
    // Vor dem Vormerken: abgewiesene Anfragen sollen den Server nicht nachträglich Profile beobachten lassen
    chargeLookup(req, `player:${tag}`);
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
    shedIfBusy(req);
    const before = Number(req.query.vor) > 0 ? Number(req.query.vor) : Number.MAX_SAFE_INTEGER;
    let battles = [];
    try { battles = store.getBattles(tag, { before, limit: HISTORY_PAGE + 1 }); } catch { /* Verlauf nicht verfügbar */ }
    res.json({ ok: true, battles: shape.nameModes(battles.slice(0, HISTORY_PAGE)), more: battles.length > HISTORY_PAGE });
  }));

  // Muster in den Kämpfen (Reiter „Form“, lib/formPatterns.js) aus dem ganzen gespeicherten Verlauf. Kein API-Abruf —
  // das Profil hat die neuesten Kämpfe beim Öffnen schon gespeichert.
  // ?gruppe=ranked|ladder|… (Standard: alle außer Freundschafts- und Party-Kämpfen), ?tz= Zeitzone für die Tageszeit
  router.get('/player/:tag/form', handler(async (req, res) => {
    const tag = tagParam(req);
    shedIfBusy(req);
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
      const rawLog = await api.crApiGetSafe(`/players/%23${tag}/battlelog`, { token, maxAgeMs: SHARE_MAX_AGE_MS });
      try { store.markPolled(tag); } catch { /* weiter */ }
      if (!Array.isArray(rawLog)) continue;
      const battles = await shapeLog(rawLog, tag, null);
      keepBattles(tag, battles);
      rememberDecks(battles, tag);
      done += 1;
      await new Promise((r) => { setTimeout(r, 300); });
    }
    return done;
  }
  router.pollWatched = pollWatched;

  // Einmalig (seit Nov. 2026): Crown-Series-Duelle, die schon im Kampf-Verlauf liegen, in ihren eigenen Speicher
  // übernehmen — schrittweise mit Pausen, damit Anfragen dazwischen drankommen. Danach merkt rememberBattles sie selbst.
  async function backfillCrown({ pauseMs = 50 } = {}) {
    try {
      if (store.getValue('crownBackfill')) return false;
      let after = null;
      do {
        after = store.crownBackfillStep(after);
        if (after && pauseMs > 0) await new Promise((r) => { setTimeout(r, pauseMs); });
      } while (after);
      store.setValue('crownBackfill', { at: Date.now() });
      return true;
    } catch (err) {
      console.warn('[scout] Crown-Series-Nachtrag:', err?.message || err);
      return false;
    }
  }
  router.backfillCrown = backfillCrown;

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
    chargeLookup(req, `clan:${tag}`);
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

  // Zwischengespeicherte Abrufe, die Clan-Seite, Zentrale und Erinnerungen teilen
  const clanCached = (tag) => cached(`clan:${tag}`, TTL.clan, () => loadClan(tag));
  const raceCached = (tag) => cached(`race:${tag}`, TTL.race, async () => shape.shapeRiverRace(await upstream(`/clans/%23${tag}/currentriverrace`)));
  const warLogCached = (tag) => cached(`warlog:${tag}`, TTL.warLog, async () => shape.shapeWarLog(await upstream(`/clans/%23${tag}/riverracelog?limit=10`), tag));

  // Clankrieg getrennt vom Clan: zwei weitere Abrufe, die nur der Reiter „Clankrieg" braucht
  router.get('/clan/:tag/war', handler(async (req, res) => {
    const tag = tagParam(req);
    chargeLookup(req, `race:${tag}`, `warlog:${tag}`);
    const [race, log] = await Promise.all([raceCached(tag).catch(() => null), warLogCached(tag).catch(() => [])]);
    res.json({ ok: true, fetchedAt: Date.now(), race, log });
  }));

  // ── Clan-Zentrale ──────────────────────────────────────────────────────────
  // Auswertung für Anführer (clanCentral.js) aus Clan, Krieg, Kriegsverlauf und den Schnappschüssen der letzten Wochen.
  function centralFor(tag, clan, race, log) {
    let snaps = [];
    let snapStats = null;
    try {
      snaps = store.getClanSnapshots(tag, { since: Date.now() - clanCentral.LOOKBACK_MS - 7 * 24 * 3600 * SEC, limit: 1500 });
      snapStats = store.clanSnapshotStats(tag);
    } catch { /* ohne Verlauf: Kriegsverlauf und Augenblick reichen für den Anfang */ }
    return clanCentral.buildClanCentral({ clan, race, log: log || [], snaps, snapStats });
  }

  router.get('/clan/:tag/central', handler(async (req, res) => {
    const tag = tagParam(req);
    // Eine abgelaufene Auswertung kostet nur dann einen Abruf, wenn auch Clan, Krieg oder Kriegsverlauf neu geholt werden
    if (!isFresh(`central:${tag}`)) chargeLookup(req, `clan:${tag}`, `race:${tag}`, `warlog:${tag}`);
    const data = await cached(`central:${tag}`, TTL.clan, async () => {
      const { clan } = await clanCached(tag);
      const [race, log] = await Promise.all([raceCached(tag).catch(() => null), warLogCached(tag).catch(() => [])]);
      return { ok: true, fetchedAt: Date.now(), tag, ...centralFor(tag, clan, race, log) };
    });
    try { store.markClanViewed(tag); } catch { /* Verlauf ist Beiwerk */ }
    res.json(data);
  }));

  // ── Discord-Erinnerungen der Zentrale (clanAlerts.js) ──────────────────────
  // Je Konto bis zu clanAlerts.MAX_PER_KONTO Clans; die Webhook-Adresse geht nie zurück an den Browser.
  const alerts = alertStore || clanAlerts.defaultAlertStore();
  const hookOpts = webhookFetch ? { fetchImpl: webhookFetch } : {};
  const lastTest = new Map(); // kontoId → Zeitpunkt des letzten Tests

  router.get('/clan/:tag/alerts', requireKonto, handler(async (req, res) => {
    const tag = tagParam(req);
    res.json({
      ok: true,
      alert: alerts.view(req.kontoId, tag),
      used: alerts.listOfKonto(req.kontoId).length,
      max: clanAlerts.MAX_PER_KONTO,
      remindHours: clanAlerts.REMIND_HOURS,
    });
  }));

  router.put('/clan/:tag/alerts', requireKonto, handler(async (req, res) => {
    const tag = tagParam(req);
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    let webhook = null;
    if (body.webhook) {
      const parsed = clanAlerts.parseWebhook(body.webhook);
      if (!parsed) throw new ScoutError('webhookInvalid', 400);
      const found = await clanAlerts.lookupWebhook(parsed.url, hookOpts);
      if (!found.ok) throw new ScoutError(found.key, found.key === 'webhookInvalid' ? 400 : 502);
      webhook = { ...parsed, name: found.name };
    }
    const { clan } = await clanCached(tag);
    const saved = alerts.save(req.kontoId, tag, {
      clanName: clan.name,
      webhook,
      remindHours: Number(body.remindHours),
      weekly: body.weekly !== false,
      lang: body.lang === 'en' ? 'en' : 'de',
    });
    if (!saved.ok) throw new ScoutError(saved.key, 400);
    try { store.markClanViewed(tag); } catch { /* Verlauf ist Beiwerk */ }
    res.json({ ok: true, alert: alerts.view(req.kontoId, tag) });
  }));

  router.delete('/clan/:tag/alerts', requireKonto, handler(async (req, res) => {
    const tag = tagParam(req);
    alerts.remove(req.kontoId, tag);
    res.json({ ok: true, alert: null });
  }));

  // Testnachricht — im Krieg gleich mit der echten Liste offener Decks, damit man sieht, wie es aussieht
  router.post('/clan/:tag/alerts/test', requireKonto, handler(async (req, res) => {
    const tag = tagParam(req);
    const now = Date.now();
    if (now - (lastTest.get(req.kontoId) || 0) < 20 * SEC) throw new ScoutError('rateLimited', 429);
    const url = alerts.webhookOf(req.kontoId, tag);
    const view = alerts.view(req.kontoId, tag);
    if (!url || !view) throw new ScoutError('notFound', 404);
    lastTest.set(req.kontoId, now);
    if (lastTest.size > 2000) for (const [k, v] of lastTest) if (now - v > 60 * SEC) lastTest.delete(k);
    const { clan } = await clanCached(tag);
    const link = process.env.FRONTEND_URL ? `${process.env.FRONTEND_URL.replace(/\/+$/, '')}/clash/clan/${tag}?reiter=zentrale` : '';
    const payload = clanAlerts.testMessage(clan, { lang: view.lang, url: link });
    const [race, log] = await Promise.all([raceCached(tag).catch(() => null), warLogCached(tag).catch(() => [])]);
    if (clanCentral.isWarPeriod(race)) {
      const status = clanCentral.warDayStatus(race, clan, log, now);
      payload.embeds.push(clanAlerts.reminderMessage(status, clan, { lang: view.lang, url: link }).embeds[0]);
    }
    const sent = await clanAlerts.postWebhook(url, payload, hookOpts);
    if (sent.gone) {
      alerts.markBroken(req.kontoId, tag);
      throw new ScoutError('webhookInvalid', 400);
    }
    if (!sent.ok) throw new ScoutError('discordDown', 502);
    res.json({ ok: true });
  }));

  const alertWorker = clanAlerts.createClanAlertWorker({
    store: alerts,
    loadClan: async (tag) => (await clanCached(tag)).clan,
    loadRace: raceCached,
    loadLog: warLogCached,
    buildCentral: centralFor,
    keepWatching: (tag) => store.markClanViewed(tag),
    kontoGibtEs,
    post: (url, payload) => clanAlerts.postWebhook(url, payload, hookOpts),
    siteUrl: process.env.FRONTEND_URL || '',
  });
  router.alertWorker = alertWorker;

  // ── Suche ──────────────────────────────────────────────────────────────────
  // Spieler aus dem eigenen Namens-Index (die API kann Spieler nicht nach Namen suchen), Clans über die API.
  router.get('/search', handler(async (req, res) => {
    const q = String(req.query.q || '').trim().slice(0, 40);
    if (q.length < 2) return res.json({ ok: true, players: [], clans: [] });
    shedIfBusy(req);
    let players = [];
    try { players = store.searchPlayers(q, 8); } catch { /* Index nicht verfügbar */ }
    let clans = [];
    const searchKey = `clansearch:${q.toLowerCase()}`;
    // Kontingent aufgebraucht: Spieler aus dem eigenen Index gibt es trotzdem, nur keine Clans
    if (q.length >= 3 && req.query.clans !== '0' && (isFresh(searchKey) || !spend('lookups', req))) {
      clans = await cached(searchKey, TTL.clanSearch, async () =>
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
    // Die Weltrangliste der Spieler teilt sich ihren Abruf mit der Platzierung im Win-Tracker (crApi.POL_TOP_PATH)
    const items = def.shape(await upstream(def.path(loc, limit), kind === 'players' && loc === 'global' ? SHARE_MAX_AGE_MS : 0));
    if (kind === 'players') {
      remember(items.map((p) => ({ tag: p.tag, name: p.name, clan: p.clan?.name || '' })));
      noteRanked(items);
    }
    return { ok: true, fetchedAt: Date.now(), kind, location: loc, items };
  }

  // Die API liefert in Ranglisten keine Decks — angehängt wird, was aus Battlelogs schon bekannt ist. Erst beim
  // Ausliefern, nicht beim Laden der Rangliste: ein Deck, das ein Profilabruf oder das Nachladen gerade erneuert hat,
  // steht so gleich in der Liste statt erst nach deren nächstem Abruf. Die bestückte Liste gilt RANKING_DECKS_MS.
  const withDecks = new Map(); // Schlüssel → { source, at, value }
  function attachDecks(key, data) {
    if (data.kind !== 'players') return data;
    const now = Date.now();
    const hit = withDecks.get(key);
    if (hit && hit.source === data && now - hit.at < RANKING_DECKS_MS) return hit.value;
    const value = { ...data, items: data.items.map((p) => ({ ...p, ...knownDeck(p.tag, p.score) })) };
    withDecks.set(key, { source: data, at: now, value });
    if (withDecks.size > 300) for (const [k, v] of withDecks) if (now - v.at >= RANKING_DECKS_MS) withDecks.delete(k);
    return value;
  }

  // Weltrangliste der Spieler: immer die Top 1000 an einem Stück. Die Ranglisten-Seite (Top 200 = gekürzt) und
  // „Gespielt von“ auf der Deck-Seite lesen dieselbe Liste — so zeigen beide denselben Platz.
  const globalPlayers = () => cached('ranking:players:global:1000', TTL.ranking, () => loadRanking('players', 'global', 1000), STALE_OK_MS);

  router.get('/ranking/:kind', handler(async (req, res) => {
    const kind = RANKINGS[req.params.kind] ? req.params.kind : null;
    if (!kind) throw new ScoutError('notFound', 404);
    const loc = /^5700\d{4}$/.test(String(req.query.loc || '')) ? String(req.query.loc) : 'global';
    if (kind === 'players' && loc === 'global') {
      const full = attachDecks('players:global', await globalPlayers());
      return res.json(req.query.top === '1000' ? full : { ...full, items: full.items.slice(0, 200) });
    }
    const key = `ranking:${kind}:${loc}:200`;
    return res.json(attachDecks(key, await cached(key, TTL.ranking, () => loadRanking(kind, loc, 200), STALE_OK_MS)));
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
      // Kein Battlelog-Abruf für beliebige Tags: nur Ranglisten-Spieler und solche mit gemerktem (veraltetem) Deck,
      // und nur im Rahmen des Kontingents. Was hier ausfällt, fehlt in der Antwort — der Client zeigt „kein Deck“.
      if (known.deck === undefined && !isRankedTag(tag)) return;
      if (!isFresh(`decklog:${tag}`) && spend('decks', req)) return;
      try {
        const rawLog = await cached(`decklog:${tag}`, TTL.player, () => upstream(`/players/%23${tag}/battlelog`, SHARE_MAX_AGE_MS));
        if (!Array.isArray(rawLog)) return;
        const battles = await shapeLog(rawLog, tag, null);
        rememberDecks(battles, tag, rankedScore(tag));
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
    }, STALE_OK_MS));
  }));

  // Kartenkatalog des Spiels: alle Karten mit ihren Formen und Bildern, dazu die Turmtruppen. Neue Karten,
  // Evolutionen und Helden erscheinen so von selbst auf den Stats-Seiten.
  router.get('/catalog', handler(async (req, res) => {
    res.json(await cached('catalog', TTL.catalog, async () => ({ ok: true, fetchedAt: Date.now(), ...shape.shapeCatalog(await upstream('/cards')) }), STALE_OK_MS));
  }));

  // ── Meta ───────────────────────────────────────────────────────────────────
  // Der Sammler füttert nebenbei den Namens-Index (die ganze Top 1000 samt ihrer Gegner) und den Deck-Speicher
  // der Ranglisten — beides ohne einen zusätzlichen Abruf.
  const crawler = createMetaCrawler({
    store,
    players: Number(process.env.CR_SCOUT_META_PLAYERS) || 1000,
    ...(crawlSpacingMs === undefined ? null : { spacingMs: crawlSpacingMs }),
    fetchTopPlayers: async () => {
      const raw = await api.crApiGetSafe('/locations/global/pathoflegend/players?limit=1000', { token, maxAgeMs: SHARE_MAX_AGE_MS });
      const top = shape.shapePlayerRanking(raw);
      remember(top.map((p) => ({ tag: p.tag, name: p.name, clan: p.clan?.name || '' })));
      return top;
    },
    fetchBattles: async (tag, player) => {
      const rawLog = await api.crApiGetSafe(`/players/%23${tag}/battlelog`, { token });
      if (!Array.isArray(rawLog)) return null;
      const battles = await shapeLog(rawLog, tag, null);
      rememberDecks(battles, tag, player?.score ?? null);
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
    if (process.env.CR_CLAN_ALERTS !== 'off') alertWorker.start();
    const crownBackfill = setTimeout(() => { backfillCrown(); }, 90 * SEC);
    crownBackfill.unref?.();
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
    // „Gespielt von“: Platz aus der aktuellen Weltrangliste (dieselbe Liste wie die Ranglisten-Seite, 5 Minuten).
    // Antwortet die API nicht, gilt der Platz zum Zeitpunkt der Auswertung (ältere Auswertungen haben noch keinen).
    const tags = deck ? details?.players || [] : [];
    let live = null;
    if (tags.length) {
      try {
        const items = (await globalPlayers()).items;
        if (items.length) live = new Map(items.map((p, i) => [p.tag, { rank: p.rank ?? i + 1, name: p.name, clan: p.clan?.name || '' }]));
      } catch { /* API gestört → Plätze der Auswertung */ }
    }
    const players = tags.map((tag) => {
      let known = null;
      try { known = store.getPlayer(tag); } catch { /* Index nicht verfügbar */ }
      const now = live?.get(tag);
      const rank = live ? now?.rank : details?.ranks?.[tag];
      return { tag, name: now?.name || known?.name || '', clan: now?.clan || known?.clan || '', rank: typeof rank === 'number' ? rank : null };
    });
    // Nach aktuellem Platz ordnen — wer aus der Rangliste gefallen ist, ans Ende (sort ist stabil)
    if (live) players.sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9));
    res.json({
      ok: true,
      updatedAt: snapshot?.updatedAt || null,
      sample: snapshot ? { battles: snapshot.battles, players: snapshot.players } : null,
      deck,
      vsDecks: deck ? details?.vsDecks || [] : [],
      hard: deck ? details?.hard || [] : [],
      easy: deck ? details?.easy || [] : [],
      players,
      ranksLive: !!live,
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
