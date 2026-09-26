// Seed Runners — veröffentlichte Level: Regeln. Der Speicher (levelStore.js) hält die Daten, hier stehen die Entscheidungen:
// wer was darf, wann ein Lauf zählt, wann ein Level sichtbar ist.
//
// VERÖFFENTLICHEN nur mit Login und nur, wenn das Level verifiziert ist (levelVerify.js) — gegen die AKTUELLE Physik, mit dem
// Hash desselben Spielinhalts. Dazu: Wortfilter, höchstens 20 Level je Konto, höchstens 3 Veröffentlichungen pro Stunde, und ein
// Inhalt (Hash) gibt es nur einmal (keine Kopien fremder Level). Der Ersteller-Lauf wird zur Ersteller-Zeit und zum Geist.
//
// LÄUFE auf veröffentlichten Leveln dürfen auch Gäste einreichen. Der Server spielt jedes Log mit dem gespeicherten Dokument im
// Worker nach — auf den Tick genau; Zeiten aus dem Nachspielen kommen in die Bestenliste, alles andere nicht.
//
// IDENTITÄT: Angemeldete sind über ihr Konto eindeutig (stabil über Geräte), Gäste über den Schlüssel aus ihrem Browser-Token
// (wie beim Tagesrennen). Das gilt auch für STERNE (1–5) und FAVORITEN — die gibt es für veröffentlichte Level und für
// Zufallslevel (Seed + Biom), ohne Login; meldet sich ein Gast später an, gehen seine Sterne und Favoriten aufs Konto über.
// Das eigene Level kann man nicht bewerten.
//
// PHYSIK-ÄNDERUNG: Beim Start spielt `reverifyStale` die gespeicherten Läufe mit der neuen Physik nach. Besteht ein Ersteller-Lauf
// nicht mehr, ist das Level unsichtbar (`reverify`), bis der Ersteller es neu durchspielt; nicht mehr bestehende Bestenlisten-
// Einträge werden entfernt.
'use strict';

const crypto = require('crypto');
const { generateCode, normalizeCode, isCode } = require('./shareCode');
const { buildPreview } = require('./levelPreview');
const { checkLevelTexts } = require('./wordFilter');
const { checkLevel, currentFingerprints } = require('./levelCheck');
const { cleanLog } = require('./levelVerify');
const { CUSTOM_MAX_TICKS } = require('./replay');
const { cleanName } = require('./daily');
const { cleanGv } = require('./genVersion');

const LIMITS = Object.freeze({
  activePerAccount: 20,
  publishesPerHour: 3,
  pageSize: 24,
  maxPageSize: 48,
  queryMax: 60,
  boardSize: 50,
  noteMax: 300,
});
const HOUR_MS = 3600000;
const KEY_RE = /^[a-f0-9]{32,64}$/;
const FP_RE = /^[A-Za-z0-9]{1,40}$/;
const REPORT_REASONS = ['anstoessig', 'unspielbar', 'kopie', 'sonstiges'];
const LEVEL_BIOMES = ['random', 'meadow', 'ice', 'factory', 'cave', 'sky'];
const FAVORITES_MAX = 200;
const LOOKUP_MAX = 50;
const TOP_MAX = 30;
// Was ein Browser zu einem favorisierten Zufallslevel mitschicken darf (nur zur Anzeige): kurze Kennungen, keine freien Texte
const INFO_ID_RE = /^[a-z0-9-]{1,32}$/;

/**
 * Bewertungs-Schlüssel eines Levels (siehe levelStore.js): { kind: 'custom', code } → 'c:<Code>',
 * { kind: 'pfad', seed, biome, gv } → 'p<gv>:<Biom>:<Seed>' — die Generator-Version gehört dazu: Derselbe Seed ist in einer
 * anderen Version ein anderes Level. Der Seed steht hinten (darf jedes Zeichen enthalten) und wird NICHT umgeformt — er
 * muss genau der sein, aus dem die Runde gebaut wurde. @returns {{ key: string, ref: object } | null}
 */
function levelKeyOf(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.kind === 'custom') {
    const code = normalizeCode(raw.code);
    return code ? { key: `c:${code}`, ref: { kind: 'custom', code } } : null;
  }
  if (raw.kind === 'pfad') {
    const seed = typeof raw.seed === 'number' ? String(raw.seed) : raw.seed;
    if (typeof seed !== 'string' || seed.length < 1 || seed.length > 40 || /[\u0000-\u001f\u007f]/.test(seed)) return null;
    if (!LEVEL_BIOMES.includes(raw.biome)) return null;
    const gv = cleanGv(raw.gv);
    if (!gv) return null;
    return { key: `p${gv}:${raw.biome}:${seed}`, ref: { kind: 'pfad', seed, biome: raw.biome, gv } };
  }
  return null;
}

/** Umkehrung von levelKeyOf (für Listen aus dem Speicher) */
function refOfKey(key) {
  if (key.startsWith('c:')) return { kind: 'custom', code: key.slice(2) };
  const m = /^p(\d+):([a-z]+):([\s\S]*)$/.exec(key);
  return m ? { kind: 'pfad', seed: m[3], biome: m[2], gv: Number(m[1]) } : { kind: 'pfad', seed: key, biome: 'random', gv: 1 };
}

const cleanInfo = (raw) => {
  const out = {};
  if (raw && typeof raw === 'object') for (const k of ['leitidee', 'autor']) if (INFO_ID_RE.test(String(raw[k] ?? ''))) out[k] = raw[k];
  return out;
};

const accountKey = (accountId) => crypto.createHash('sha256').update(`sr-acc:${accountId}`).digest('hex');
const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
// Gäste tippen ihren Namen selbst, und er steht öffentlich in der Bestenliste: derselbe Filter wie für Levelnamen; im Zweifel "Anonym"
const guestName = (raw) => {
  const name = cleanName(raw);
  return checkLevelTexts({ name }).length ? 'Anonym' : name;
};
const cleanNote = (raw) => String(raw ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, LIMITS.noteMax);

// Die Angaben in meta beeinflussen weder Hash noch Spielverlauf; das Nachspielen bekommt sie neutral, damit spätere Regeln für
// Angaben (etwa neue Biome) ein altes Level nicht unspielbar machen
const NEUTRAL_META = Object.freeze({ name: '', description: '', tags: [], difficulty: null, biome: 'meadow' });

/**
 * @param {{ store: object, verifier: { verify: Function }, check?: Function, fingerprints?: Function, now?: () => number,
 *           randomInt?: (n: number) => number, log?: Function }} deps
 */
function createLevelService(deps) {
  const { verifier } = deps;
  const L = deps.store.levels;
  const check = deps.check || checkLevel;
  const fingerprints = deps.fingerprints || currentFingerprints;
  const now = deps.now || Date.now;
  const randomInt = deps.randomInt;
  const log = deps.log || ((...a) => console.warn('[seed-runners]', ...a));

  // ── Darstellung ──
  const card = (l) => ({
    code: l.code,
    name: l.name,
    creator: { id: l.accountId, name: l.creatorName },
    tags: l.tags,
    difficulty: l.difficulty,
    biome: l.biome,
    speedClass: l.speedClass,
    width: l.width,
    height: l.height,
    elements: l.elements,
    creatorTicks: l.creatorTicks,
    plays: l.plays,
    players: l.players,
    clears: l.clears,
    clearRate: l.players > 0 ? l.clears / l.players : null,
    rating: { avg: l.ratingAvg, count: l.ratingCount },
    createdAt: l.createdAt,
    preview: l.preview,
  });

  const isOwner = (l, viewer) => !!viewer.accountId && viewer.accountId === l.accountId;
  /** Sichtbar für alle nur, wenn veröffentlicht; ausgeblendete Level sehen Ersteller und Moderation, gelöschte nur die Moderation */
  function canSee(l, viewer) {
    if (l.status === 'published') return true;
    if (viewer.isAdmin) return true;
    return l.status !== 'deleted' && isOwner(l, viewer);
  }

  function identityOf(viewer, playerKey) {
    if (viewer.accountId) {
      return { identity: `a:${viewer.accountId}`, playerKey: accountKey(viewer.accountId), accountId: viewer.accountId, name: cleanName(viewer.name) };
    }
    if (KEY_RE.test(String(playerKey || ''))) return { identity: `k:${playerKey}`, playerKey: String(playerKey), accountId: null, name: null };
    return null;
  }

  /** Wer bewertet/favorisiert: Konto oder Gast. Meldet sich ein Gast an, zieht sein Bestand hier aufs Konto um. */
  function voterOf(viewer, playerKey) {
    const guestOk = KEY_RE.test(String(playerKey || ''));
    if (viewer.accountId) {
      const acc = `a:${viewer.accountId}`;
      if (guestOk) L.adoptVoter(`k:${playerKey}`, acc, now());
      return acc;
    }
    return guestOk ? `k:${playerKey}` : null;
  }

  /** Die Darstellung eines Favoriten / einer Bestenlisten-Zeile; null, wenn ein veröffentlichtes Level nicht mehr sichtbar ist */
  function entryOf(key, info, voter) {
    const ref = refOfKey(key);
    const base = { key, ref, rating: L.ratingOf(key), mine: voter ? L.myRating(key, voter) : null, favorite: voter ? L.isFavorite(voter, key) : false };
    if (ref.kind === 'custom') {
      const l = L.byCode(ref.code);
      if (!l || l.status !== 'published') return null;
      return { ...base, level: card(l) };
    }
    return { ...base, info: info || {} };
  }

  const docForReplay = (l) => ({ ...L.docOf(l.id), meta: { ...NEUTRAL_META } });

  /** Ein Nachspielen des Ersteller- oder Spielerlaufs gegen das gespeicherte Dokument */
  async function replay(l, run, simFp) {
    return verifier.verify({ kind: 'custom', doc: docForReplay(l), hash: l.contentHash, log: run.log, ticks: run.ticks, fp: simFp });
  }

  const verdictToResult = (verdict) => {
    if (verdict.status === 'invalid') return { status: 'abgelehnt', reason: verdict.reason };
    if (verdict.status === 'skipped') return { status: 'ungeprueft', reason: 'Deine Seite ist nicht auf dem Stand des Servers — bitte neu laden und den Lauf wiederholen.' };
    if (verdict.status === 'busy') return { status: 'busy', reason: 'Der Server prüft gerade viele Läufe. Versuch es gleich noch einmal.' };
    return { status: 'fehler', reason: 'Die Prüfung ist fehlgeschlagen. Versuch es gleich noch einmal.' };
  };

  /** Ticks, Log und Fingerprint eines eingesendeten Laufs prüfen. @returns {{ ok: true, ticks, log, fp } | { ok: false, result }} */
  function cleanRun(input) {
    if (!isInt(input.ticks, 60, 10 ** 9)) return { ok: false, result: { status: 'ungueltig', reason: 'Ungültige Zeit.' } };
    if (input.ticks > CUSTOM_MAX_TICKS) return { ok: false, result: { status: 'abgelehnt', reason: 'Zeitlimit: Ein Lauf darf höchstens 20 Minuten dauern.' } };
    const runLog = cleanLog(input.log);
    if (!runLog) return { ok: false, result: { status: 'ungueltig', reason: 'Ungültiges Input-Log.' } };
    return { ok: true, ticks: input.ticks, log: runLog, fp: FP_RE.test(String(input.fp || '')) ? String(input.fp) : '' };
  }

  const api = {
    LIMITS,

    // ── Veröffentlichen ──
    /**
     * @param {{ viewer: { accountId: string, name: string }, doc: unknown, hash?: unknown }} input
     * @returns {Promise<{ status: string, code?: string, reason?: string, errors?: string[], existing?: string }>}
     */
    async publish({ viewer, doc, hash }) {
      if (!viewer.accountId) return { status: 'nicht-erlaubt', reason: 'Zum Veröffentlichen musst du angemeldet sein.' };
      if (L.isBanned(viewer.accountId)) return { status: 'gesperrt', reason: 'Dein Konto ist gesperrt.' };
      if (L.countCreatedSince(viewer.accountId, now() - HOUR_MS) >= LIMITS.publishesPerHour) {
        return { status: 'zu-viele', reason: `Du kannst höchstens ${LIMITS.publishesPerHour} Level pro Stunde veröffentlichen.` };
      }
      if (L.countActive(viewer.accountId) >= LIMITS.activePerAccount) {
        return { status: 'limit', reason: `Du hast schon ${LIMITS.activePerAccount} veröffentlichte Level. Lösche eines, um ein neues zu veröffentlichen.` };
      }

      const checked = await check(doc, { requireName: true, includeDoc: true });
      if (!checked.ok) return { status: 'ungueltig', reason: 'Das Level ist ungültig.', errors: checked.errors };
      const meta = checked.doc.meta;
      const textErrors = checkLevelTexts(meta);
      if (textErrors.length) return { status: 'ungueltig', reason: textErrors[0], errors: textErrors };
      if (hash !== undefined && hash !== checked.hash) {
        return { status: 'ungeprueft', reason: 'Deine Seite und der Server berechnen das Level nicht gleich — bitte lade die Seite neu.' };
      }

      const fps = await fingerprints();
      const ver = deps.store.getVerification(viewer.accountId, checked.hash, { withLog: true });
      if (!ver) return { status: 'nicht-verifiziert', reason: 'Dieses Level ist noch nicht verifiziert. Spiele es einmal komplett durch.' };
      if (ver.simFp !== fps.sim) return { status: 'veraltet', reason: 'Die Spielphysik wurde seit deiner Verifizierung aktualisiert. Spiele das Level einmal neu durch.' };

      const existing = L.byHash(checked.hash);
      if (existing) {
        return {
          status: 'doppelt',
          reason: isOwner(existing, viewer) ? 'Du hast dieses Level schon veröffentlicht.' : 'Dieses Level gibt es schon.',
          existing: isOwner(existing, viewer) ? existing.code : undefined,
        };
      }

      let code;
      for (let i = 0; i < 20; i++) {
        const c = generateCode(randomInt);
        if (!L.byCode(c)) { code = c; break; }
      }
      if (!code) return { status: 'fehler', reason: 'Es konnte kein Code vergeben werden. Versuch es noch einmal.' };

      L.insertLevel({
        code, accountId: viewer.accountId, creatorName: cleanName(viewer.name), name: meta.name, description: meta.description,
        tags: meta.tags, difficulty: meta.difficulty, biome: meta.biome, speedClass: checked.doc.speedClass,
        width: checked.doc.width, height: checked.doc.height, elements: checked.doc.elements.length, contentHash: checked.hash,
        doc: checked.doc, preview: buildPreview(checked.doc), simFp: ver.simFp,
        creatorTicks: ver.ticks, creatorDeaths: ver.deaths, creatorSplits: ver.splits, creatorLog: ver.log, createdAt: now(),
      });
      return { status: 'ok', code };
    },

    // ── Lesen ──
    /**
     * Liste für den Browser.
     * @param {{ sort?: string, q?: string, tag?: string, difficulty?: number|string, speed?: string, page?: number|string, limit?: number|string, mine?: boolean }} query
     */
    list(query, viewer) {
      const sort = L.SORTS.includes(query.sort) ? query.sort : 'new';
      const q = String(query.q ?? '').trim().slice(0, LIMITS.queryMax);
      const limit = Math.min(LIMITS.maxPageSize, Math.max(1, Number(query.limit) || LIMITS.pageSize));
      const page = Math.max(1, Math.floor(Number(query.page)) || 1);
      const difficulty = isInt(Number(query.difficulty), 1, 5) ? Number(query.difficulty) : null;
      const opts = {
        sort, q, code: q ? normalizeCode(q) : null, difficulty, limit, offset: (page - 1) * limit,
        tag: query.tag ? String(query.tag).trim().slice(0, 20) : null,
        speedClass: ['normal', 'fast', 'super'].includes(query.speed) ? query.speed : null,
      };
      if (query.mine) {
        if (!viewer.accountId) return { items: [], total: 0, page: 1, pages: 1 };
        Object.assign(opts, { accountId: viewer.accountId, statuses: ['published', 'hidden', 'reverify'] });
      }
      const { items, total } = L.list(opts);
      return { items: items.map((l) => ({ ...card(l), status: l.status })), total, page, pages: Math.max(1, Math.ceil(total / limit)) };
    },

    /**
     * Ein Level mit Bestenliste und dem, was für die Person darauf möglich ist.
     * @returns {object | null}  null: gibt es nicht oder ist für diese Person nicht sichtbar
     */
    detail(code, viewer, playerKey) {
      const l = L.byCode(code);
      if (!l || !canSee(l, viewer)) return null;
      const id = identityOf(viewer, playerKey);
      const mine = id ? L.getRun(l.id, id.playerKey) : null;
      const owner = isOwner(l, viewer);
      return {
        ...card(l),
        description: l.description,
        status: l.status,
        statusReason: owner || viewer.isAdmin ? l.statusReason : null,
        creatorRun: { ticks: l.creatorTicks, deaths: l.creatorDeaths },
        runs: L.runCount(l.id),
        board: L.board(l.id, LIMITS.boardSize).map((e) => ({ rank: e.rank, runId: e.runId, name: e.name, ticks: e.ticks, deaths: e.deaths, hasGhost: e.hasGhost })),
        me: {
          isOwner: owner,
          loggedIn: !!viewer.accountId,
          stars: id ? L.myRating(`c:${l.code}`, id.identity) : null,
          favorite: id ? L.isFavorite(id.identity, `c:${l.code}`) : false,
          canRate: !!id && !owner,
          best: mine ? { ticks: mine.ticks, deaths: mine.deaths, rank: L.rankOf(l.id, mine.ticks, mine.createdAt) } : null,
        },
      };
    },

    /** Das Dokument zum Spielen: kanonisch, mit den aktuellen Angaben; der Browser prüft den Hash selbst nach */
    doc(code, viewer) {
      const l = L.byCode(code);
      if (!l || !canSee(l, viewer)) return null;
      const stored = L.docOf(l.id);
      return {
        hash: l.contentHash,
        doc: { ...stored, meta: { name: l.name, description: l.description, tags: l.tags, difficulty: l.difficulty, biome: l.biome } },
      };
    },

    /**
     * Ein Level für eine Mehrspieler-Runde (roomManager.js, Phase 4: Serie mit Custom-Leveln). Nur wenn veröffentlicht —
     * ein Entwurf, ein ausgeblendetes oder gelöschtes Level ist in einer öffentlichen Runde nicht spielbar. Liefert
     * gleich das Dokument mit (der Raum muss es für das Nachspielen des Siegerlaufs im Anti-Cheat haben).
     * @returns {{ code, hash, name, creatorName, doc } | null}
     */
    roundLevel(code) {
      const l = L.byCode(code);
      if (!l || l.status !== 'published') return null;
      const stored = L.docOf(l.id);
      return {
        code: l.code, hash: l.contentHash, name: l.name, creatorName: l.creatorName,
        doc: { ...stored, meta: { name: l.name, description: l.description, tags: l.tags, difficulty: l.difficulty, biome: l.biome } },
      };
    },

    /** Der Lauf eines Geistes: 'creator' oder die Nummer eines Bestenlisten-Eintrags */
    ghost(code, viewer, which) {
      const l = L.byCode(code);
      if (!l || !canSee(l, viewer)) return null;
      if (which === 'creator') {
        const c = L.creatorRun(l.id);
        return { name: l.creatorName, ticks: c.ticks, deaths: c.deaths, simFp: c.simFp, log: c.log };
      }
      const runId = Number(which);
      return Number.isInteger(runId) ? L.runGhost(l.id, runId) : null;
    },

    // ── Spielen ──
    /** Ein Versuch beginnt (zählt Spiele und Spieler; Voraussetzung für Likes). Gibt es das Level nicht, ist die Antwort null. */
    play(code, viewer, playerKey) {
      const l = L.byCode(code);
      if (!l || l.status !== 'published') return null;
      const id = identityOf(viewer, playerKey);
      if (!id) return { counted: false };
      return { counted: L.touchPlayer(l.id, id.identity, now()).counted };
    },

    /**
     * Ein Lauf auf einem Level. Wird nachgespielt; nur eine schnellere Zeit ersetzt die bisherige Bestzeit.
     * @returns {Promise<object>}  { status: 'ok'|'nicht-besser'|'abgelehnt'|…, rank?, ticks?, improved? }
     */
    async submit(code, viewer, input) {
      const l = L.byCode(code);
      if (!l || l.status !== 'published') return { status: 'nicht-gefunden', reason: 'Dieses Level gibt es nicht (mehr).' };
      const id = identityOf(viewer, input.playerKey);
      if (!id) return { status: 'ungueltig', reason: 'Ungültiger Spielerschlüssel.' };
      const run = cleanRun(input);
      if (!run.ok) return run.result;
      const fps = await fingerprints();
      if (run.fp !== fps.sim) return { status: 'ungeprueft', reason: 'Deine Seite ist nicht auf dem Stand des Servers — bitte neu laden und den Lauf wiederholen.' };

      const existing = L.getRun(l.id, id.playerKey);
      if (existing && existing.simFp === fps.sim && existing.ticks <= run.ticks) {
        L.markCleared(l.id, id.identity, now());
        return { status: 'nicht-besser', ticks: existing.ticks, deaths: existing.deaths, rank: L.rankOf(l.id, existing.ticks, existing.createdAt) };
      }

      const verdict = await replay(l, { log: run.log, ticks: run.ticks }, fps.sim);
      if (verdict.status !== 'ok') return verdictToResult(verdict);

      const at = now();
      L.markCleared(l.id, id.identity, at);
      const name = id.accountId ? id.name : guestName(input.name);
      const improved = L.saveRun({
        levelId: l.id, playerKey: id.playerKey, playerName: name, accountId: id.accountId,
        ticks: verdict.ticks, deaths: verdict.deaths, log: run.log, simFp: fps.sim, createdAt: at,
      });
      const saved = L.getRun(l.id, id.playerKey);
      return { status: 'ok', ticks: saved.ticks, deaths: saved.deaths, playedTicks: verdict.ticks, improved, rank: L.rankOf(l.id, saved.ticks, saved.createdAt) };
    },

    // ── Sterne und Favoriten ──
    /**
     * Sterne vergeben (1–5) oder zurücknehmen (0) — für ein veröffentlichtes Level oder ein Zufallslevel.
     * @returns {{ status, key?, mine?, rating? }}
     */
    rate(viewer, playerKey, rawRef, rawStars) {
      const voter = voterOf(viewer, playerKey);
      if (!voter) return { status: 'ungueltig', reason: 'Ungültiger Spielerschlüssel.' };
      if (viewer.accountId && L.isBanned(viewer.accountId)) return { status: 'gesperrt', reason: 'Dein Konto ist gesperrt.' };
      const stars = Number(rawStars);
      if (!isInt(stars, 0, 5)) return { status: 'ungueltig', reason: 'Bitte 1 bis 5 Sterne.' };
      const k = levelKeyOf(rawRef);
      if (!k) return { status: 'ungueltig', reason: 'Unbekanntes Level.' };
      if (k.ref.kind === 'custom') {
        const l = L.byCode(k.ref.code);
        if (!l || l.status !== 'published') return { status: 'nicht-gefunden', reason: 'Dieses Level gibt es nicht (mehr).' };
        if (isOwner(l, viewer)) return { status: 'eigenes', reason: 'Dein eigenes Level kannst du nicht bewerten.' };
      }
      const rating = L.rate(k.key, voter, stars || null, now());
      return { status: 'ok', key: k.key, mine: stars || null, rating };
    },

    /** Sterne, eigene Sterne und Favorit für mehrere Level auf einmal (z. B. die Runden einer Serie) */
    ratings(viewer, playerKey, rawRefs) {
      const voter = voterOf(viewer, playerKey);
      const refs = Array.isArray(rawRefs) ? rawRefs.slice(0, LOOKUP_MAX) : [];
      const items = [];
      for (const raw of refs) {
        const k = levelKeyOf(raw);
        if (k) items.push({ key: k.key, ref: k.ref, rating: L.ratingOf(k.key), mine: voter ? L.myRating(k.key, voter) : null, favorite: voter ? L.isFavorite(voter, k.key) : false });
      }
      return { status: 'ok', items };
    },

    /** Favorit setzen oder entfernen. Zu Zufallsleveln darf der Browser Leitidee/Autor zur Anzeige mitschicken. */
    favorite(viewer, playerKey, rawRef, on, rawInfo) {
      const voter = voterOf(viewer, playerKey);
      if (!voter) return { status: 'ungueltig', reason: 'Ungültiger Spielerschlüssel.' };
      const k = levelKeyOf(rawRef);
      if (!k) return { status: 'ungueltig', reason: 'Unbekanntes Level.' };
      if (!on) {
        L.removeFavorite(voter, k.key);
        return { status: 'ok', key: k.key, favorite: false };
      }
      if (k.ref.kind === 'custom') {
        const l = L.byCode(k.ref.code);
        if (!l || l.status !== 'published') return { status: 'nicht-gefunden', reason: 'Dieses Level gibt es nicht (mehr).' };
      }
      if (!L.isFavorite(voter, k.key) && L.favoriteCount(voter) >= FAVORITES_MAX) {
        return { status: 'limit', reason: `Höchstens ${FAVORITES_MAX} Favoriten — entferne zuerst einen.` };
      }
      L.setFavorite(voter, k.key, k.ref.kind === 'pfad' ? cleanInfo(rawInfo) : {}, now());
      return { status: 'ok', key: k.key, favorite: true };
    },

    /** Die eigenen Favoriten, neueste zuerst (nicht mehr sichtbare veröffentlichte Level fallen heraus) */
    favorites(viewer, playerKey) {
      const voter = voterOf(viewer, playerKey);
      if (!voter) return { status: 'ok', items: [] };
      const items = [];
      for (const f of L.favorites(voter, FAVORITES_MAX)) {
        const e = entryOf(f.key, f.info, voter);
        if (e) items.push({ ...e, favoritedAt: f.createdAt });
      }
      return { status: 'ok', items };
    },

    /** Die bestbewerteten Zufallslevel aller Spieler */
    topRandom(viewer, playerKey, rawLimit) {
      const voter = voterOf(viewer, playerKey);
      const limit = Math.min(TOP_MAX, Math.max(1, Number(rawLimit) || 20));
      return { status: 'ok', items: L.topRated('p', { limit }).map((t) => entryOf(t.key, null, voter)).filter(Boolean) };
    },

    // ── Meldungen ──

    report(code, viewer, { reason, note } = {}) {
      if (!viewer.accountId) return { status: 'nicht-erlaubt', reason: 'Zum Melden musst du angemeldet sein.' };
      if (L.isBanned(viewer.accountId)) return { status: 'gesperrt', reason: 'Dein Konto ist gesperrt.' };
      if (!REPORT_REASONS.includes(reason)) return { status: 'ungueltig', reason: 'Bitte wähle einen Grund.' };
      const l = L.byCode(code);
      if (!l || l.status !== 'published') return { status: 'nicht-gefunden', reason: 'Dieses Level gibt es nicht (mehr).' };
      if (isOwner(l, viewer)) return { status: 'eigenes', reason: 'Dein eigenes Level kannst du nicht melden.' };
      const fresh = L.addReport({ levelId: l.id, accountId: viewer.accountId, reason, note: cleanNote(note), at: now() });
      return fresh ? { status: 'ok' } : { status: 'ok', already: true };
    },

    // ── Ersteller ──
    /** Angaben ändern (Name, Beschreibung, Tags, Schwierigkeit, Biom). Der Spielinhalt bleibt — Hash und Verifizierung ebenfalls. */
    async patchMeta(code, viewer, patch) {
      const l = L.byCode(code);
      if (!l || l.status === 'deleted') return { status: 'nicht-gefunden', reason: 'Dieses Level gibt es nicht (mehr).' };
      if (!isOwner(l, viewer)) return { status: 'nicht-erlaubt', reason: 'Nur der Ersteller darf die Angaben ändern.' };
      if (L.isBanned(viewer.accountId)) return { status: 'gesperrt', reason: 'Dein Konto ist gesperrt.' };
      const merged = {
        name: l.name, description: l.description, tags: l.tags, difficulty: l.difficulty, biome: l.biome,
        ...Object.fromEntries(['name', 'description', 'tags', 'difficulty', 'biome'].filter((k) => patch && patch[k] !== undefined).map((k) => [k, patch[k]])),
      };
      const checked = await check({ ...L.docOf(l.id), meta: merged }, { requireName: true, includeDoc: true });
      if (!checked.ok) return { status: 'ungueltig', reason: 'Die Angaben sind ungültig.', errors: checked.errors };
      const meta = checked.doc.meta;
      const textErrors = checkLevelTexts(meta);
      if (textErrors.length) return { status: 'ungueltig', reason: textErrors[0], errors: textErrors };
      L.updateMeta(l.id, { ...meta, creatorName: l.creatorName }, now());
      return { status: 'ok' };
    },

    /** Löschen: der Ersteller oder die Moderation */
    remove(code, viewer) {
      const l = L.byCode(code);
      if (!l || l.status === 'deleted') return { status: 'nicht-gefunden', reason: 'Dieses Level gibt es nicht (mehr).' };
      if (!isOwner(l, viewer) && !viewer.isAdmin) return { status: 'nicht-erlaubt', reason: 'Nur der Ersteller darf das Level löschen.' };
      L.setStatus(l.id, 'deleted', isOwner(l, viewer) ? 'Vom Ersteller gelöscht' : 'Von der Moderation gelöscht', now());
      L.resolveReports(l.id, 'actioned');
      return { status: 'ok' };
    },

    /**
     * Der Ersteller spielt sein Level neu durch: nach einer Physik-Änderung (Status reverify) oder um die Ersteller-Zeit zu verbessern.
     * Der Lauf wird gegen das gespeicherte Dokument nachgespielt; danach ist das Level wieder sichtbar.
     */
    async reverify(code, viewer, input) {
      const l = L.byCode(code);
      if (!l || l.status === 'deleted') return { status: 'nicht-gefunden', reason: 'Dieses Level gibt es nicht (mehr).' };
      if (!isOwner(l, viewer)) return { status: 'nicht-erlaubt', reason: 'Nur der Ersteller darf das Level neu verifizieren.' };
      if (L.isBanned(viewer.accountId)) return { status: 'gesperrt', reason: 'Dein Konto ist gesperrt.' };
      const run = cleanRun(input);
      if (!run.ok) return run.result;
      const fps = await fingerprints();
      if (run.fp !== fps.sim) return { status: 'ungeprueft', reason: 'Deine Seite ist nicht auf dem Stand des Servers — bitte neu laden und den Lauf wiederholen.' };
      const stale = l.simFp !== fps.sim || l.status === 'reverify';
      if (!stale && run.ticks >= l.creatorTicks) return { status: 'ok', ticks: l.creatorTicks, deaths: l.creatorDeaths, improved: false };
      const verdict = await replay(l, { log: run.log, ticks: run.ticks }, fps.sim);
      if (verdict.status !== 'ok') return verdictToResult(verdict);
      L.setCreatorRun(l.id, { simFp: fps.sim, ticks: verdict.ticks, deaths: verdict.deaths, splits: verdict.splits, log: run.log }, now());
      if (l.status === 'reverify') L.setStatus(l.id, 'published', null, now());
      return { status: 'ok', ticks: verdict.ticks, deaths: verdict.deaths, improved: true };
    },

    creator(accountId, viewer) {
      const stats = L.creatorStats(accountId);
      if (!stats.name || stats.levels === 0) return null;
      const { items } = L.list({ accountId, sort: 'new', limit: LIMITS.maxPageSize, statuses: ['published'] });
      return { id: accountId, name: stats.name, stats: { levels: stats.levels, plays: stats.plays, ratings: stats.ratings, ratingAvg: stats.ratingAvg, clears: stats.clears }, levels: items.map(card), isMe: viewer.accountId === accountId };
    },

    // ── Moderation (Aufrufer prüft, dass es ein Admin ist) ──
    moderation: {
      reports() {
        return L.openReports().map((g) => ({ level: { ...card(g.level), status: g.level.status }, count: g.count, reports: g.reports }));
      },
      /** Ausgeblendete Level — auch die, deren Meldungen längst abgearbeitet sind (hide() schließt sie automatisch mit,
       * siehe unten), also sonst aus keiner Liste mehr auffindbar wären. */
      hidden() {
        const { items } = L.list({ sort: 'new', limit: LIMITS.maxPageSize, statuses: ['hidden'] });
        return items.map((l) => ({ ...card(l), statusReason: l.statusReason }));
      },
      hide(code, reason) {
        const l = L.byCode(code);
        if (!l || l.status === 'deleted') return { status: 'nicht-gefunden' };
        L.setStatus(l.id, 'hidden', cleanNote(reason) || 'Von der Moderation ausgeblendet', now());
        L.resolveReports(l.id, 'actioned');
        return { status: 'ok' };
      },
      unhide(code) {
        const l = L.byCode(code);
        if (!l || l.status !== 'hidden') return { status: 'nicht-gefunden' };
        L.setStatus(l.id, 'published', null, now());
        return { status: 'ok' };
      },
      dismiss: (reportId) => ({ status: L.dismissReport(Number(reportId)) ? 'ok' : 'nicht-gefunden' }),
      ban(accountId, reason) {
        const hidden = L.ban(String(accountId), cleanNote(reason), now());
        return { status: 'ok', hidden };
      },
      unban(accountId) {
        const restored = L.unban(String(accountId), now());
        return { status: 'ok', restored };
      },
      bans: () => L.bans(),
    },

    // ── Neu-Prüfung nach einer Änderung der Physik ──
    /**
     * Spielt Ersteller-Läufe und Bestenlisten-Einträge, die gegen eine ältere Physik geprüft wurden, mit der aktuellen nach.
     * Besteht ein Ersteller-Lauf nicht mehr, wird das Level unsichtbar (`reverify`); nicht mehr bestehende Einträge und solche
     * ohne Beweis (Log) verschwinden aus der Bestenliste. Bei Zeitüberschreitung oder Überlast bleibt alles, wie es war — der
     * nächste Start versucht es erneut.
     */
    async reverifyStale({ maxLevels = 100, maxRuns = 300 } = {}) {
      const fps = await fingerprints();
      const out = { levels: { checked: 0, ok: 0, hidden: 0, skipped: 0 }, runs: { checked: 0, ok: 0, dropped: 0, skipped: 0 } };

      for (const l of L.staleLevels(fps.sim, maxLevels)) {
        out.levels.checked++;
        const c = L.creatorRun(l.id);
        const verdict = await replay(l, { log: c.log, ticks: c.ticks }, fps.sim);
        if (verdict.status === 'ok') {
          L.setCreatorRun(l.id, { simFp: fps.sim, ticks: verdict.ticks, deaths: verdict.deaths, splits: verdict.splits, log: c.log }, now());
          out.levels.ok++;
        } else if (verdict.status === 'invalid') {
          L.setStatus(l.id, 'reverify', 'Die Spielphysik wurde geändert. Spiele das Level einmal neu durch, dann ist es wieder sichtbar.', now());
          out.levels.hidden++;
          log(`Level ${l.code} besteht die neue Physik nicht mehr: ${verdict.reason}`);
        } else {
          out.levels.skipped++;
        }
      }

      let budget = maxRuns;
      for (const levelId of L.levelsWithStaleRuns(fps.sim, 50)) {
        const l = L.byId(levelId);
        if (!l || l.status === 'deleted') continue;
        for (const r of L.staleRuns(levelId, fps.sim, budget)) {
          if (budget-- <= 0) break;
          out.runs.checked++;
          if (!r.log) { L.deleteRun(r.id); out.runs.dropped++; continue; }
          const verdict = await replay(l, { log: r.log, ticks: r.ticks }, fps.sim);
          if (verdict.status === 'ok') { L.setRunSim(r.id, fps.sim); out.runs.ok++; }
          else if (verdict.status === 'invalid') { L.deleteRun(r.id); out.runs.dropped++; }
          else out.runs.skipped++;
        }
      }
      return out;
    },
  };
  return api;
}

module.exports = { createLevelService, LIMITS, REPORT_REASONS, accountKey, isCode };
